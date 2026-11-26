import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import re
import subprocess
import tempfile
from uuid import uuid4

import boto3
from botocore.config import Config


def client(prefix, region):
    env = os.environ
    return boto3.client(
        "s3", endpoint_url=env[prefix + "_ENDPOINT"], region_name=region,
        aws_access_key_id=env[prefix + "_KEY"],
        aws_secret_access_key=env[prefix + "_SECRET"],
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def digest(path):
    with path.open("rb") as stream:
        result = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
        return result.hexdigest()


def db(*command):
    binary = Path("/usr/lib/postgresql/18/bin") / command[0]
    if binary.exists():
        command = (str(binary), *command[1:])
    return subprocess.check_output(command, text=True).strip()


def backup(storage, vault, bucket, tmp):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    prefix = f"snapshots/{stamp}-{uuid4().hex}/"
    index = {"files": [], "buckets": []}
    path = tmp / "payload"

    def save(key, **attrs):
        vault.upload_file(str(path), bucket, prefix + key)
        index["files"].append(dict(key=key, sha256=digest(path), **attrs))

    db("pg_dump", "-Fc", "-f", str(path))
    save("database.dump")
    for entry in storage.list_buckets()["Buckets"]:
        name = entry["Name"]
        index["buckets"].append(name)
        pages = storage.get_paginator("list_objects_v2").paginate(Bucket=name)
        for page in pages:
            for obj in page.get("Contents", []):
                key = obj["Key"]
                res = storage.get_object(Bucket=name, Key=key)
                with path.open("wb") as stream, res["Body"] as body:
                    while chunk := body.read(1024 * 1024):
                        stream.write(chunk)
                if path.stat().st_size != res["ContentLength"]:
                    raise RuntimeError("Incomplete storage download")
                headers = {k: res[k] for k in ("ContentType", "CacheControl", "ContentDisposition", "ContentEncoding", "Metadata") if k in res}
                save(f"objects/{len(index['files'])}", storage_bucket=name, object_key=key, headers=headers)
    vault.put_object(Bucket=bucket, Key=prefix + "complete.json", Body=json.dumps(index).encode())
    print(prefix)


def restore(storage, vault, bucket, tmp, snapshot):
    if not re.fullmatch(r"[0-9]{8}T[0-9]{6}Z-[a-f0-9]{32}", snapshot):
        raise ValueError("Invalid snapshot ID")
    prefix = "snapshots/" + snapshot + "/"
    index = json.loads(vault.get_object(Bucket=bucket, Key=prefix + "complete.json")["Body"].read())
    occupied = db("psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-c",
                  "select exists(select from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p','v','m','S')) or exists(select from storage.buckets)")
    if occupied != "f" or storage.list_buckets()["Buckets"]:
        raise RuntimeError("Restore requires an empty project")
    path = tmp / "payload"
    for item in index["files"]:
        key = item["key"]
        vault.download_file(bucket, prefix + key, str(path))
        if digest(path) != item["sha256"]:
            raise RuntimeError("Archive checksum mismatch")
        if key == "database.dump":
            common = ["pg_restore", "--exit-on-error", "--single-transaction", "--no-owner",
                      "--dbname=" + os.environ["PGDATABASE"]]
            db(*common, "--schema=public", str(path))
            db(*common, "--schema=storage", "--table=buckets", "--data-only", str(path))
            existing = {b["Name"] for b in storage.list_buckets()["Buckets"]}
            for name in index["buckets"]:
                if name not in existing:
                    storage.create_bucket(Bucket=name)
        else:
            storage.upload_file(str(path), item["storage_bucket"], item["object_key"], ExtraArgs=item["headers"])
    if set(index["buckets"]) != {b["Name"] for b in storage.list_buckets()["Buckets"]}:
        raise RuntimeError("Restored bucket inventory differs")


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("backup")
    commands.add_parser("restore").add_argument("snapshot")
    args = parser.parse_args()
    vault = client("R2", "auto")
    storage = client("SUPABASE_S3", os.environ["SUPABASE_S3_REGION"])
    with tempfile.TemporaryDirectory() as tmp:
        params = storage, vault, os.environ["R2_BUCKET"], Path(tmp)
        if args.command == "backup":
            backup(*params)
        else:
            restore(*params, args.snapshot)


if __name__ == "__main__":
    main()
