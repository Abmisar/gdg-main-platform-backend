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


def encrypt(source, path, recipient):
    with path.open("wb") as output:
        process = subprocess.Popen(["age", "-r", recipient], stdin=subprocess.PIPE, stdout=output)
        try:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                process.stdin.write(chunk)
            process.stdin.close()
            if process.wait() != 0:
                raise RuntimeError("Encryption failed")
        except BaseException:
            process.stdin.close()
            process.wait()
            raise


def decrypt(source, destination):
    with destination.open("wb") as output:
        subprocess.run(["age", "-d", "-i", os.environ["AGE_IDENTITY_FILE"], str(source)], stdout=output, check=True)


def backup(storage, vault, bucket, tmp):
    recipient = os.environ.get("AGE_RECIPIENT", "").strip()
    if not recipient:
        raise ValueError("AGE_RECIPIENT is required")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    prefix = f"snapshots/{stamp}-{uuid4().hex}/"
    index = {"files": [], "buckets": []}
    path = tmp / "payload.age"

    def save(key, source, **attrs):
        encrypt(source, path, recipient)
        key += ".age"
        vault.upload_file(str(path), bucket, prefix + key)
        index["files"].append(dict(key=key, sha256=digest(path), **attrs))

    binary = Path("/usr/lib/postgresql/18/bin/pg_dump")
    process = subprocess.Popen([str(binary) if binary.exists() else "pg_dump", "-Fc"], stdout=subprocess.PIPE)
    try:
        save("database.dump", process.stdout)
    finally:
        process.stdout.close()
        status = process.wait()
    if status:
        raise RuntimeError("pg_dump failed")
    for entry in storage.list_buckets()["Buckets"]:
        name = entry["Name"]
        index["buckets"].append(name)
        pages = storage.get_paginator("list_objects_v2").paginate(Bucket=name)
        for page in pages:
            for obj in page.get("Contents", []):
                key = obj["Key"]
                res = storage.get_object(Bucket=name, Key=key)
                headers = {k: res[k] for k in ("ContentType", "CacheControl", "ContentDisposition", "ContentEncoding", "Metadata") if k in res}
                with res["Body"] as body:
                    save(f"objects/{len(index['files'])}", body, storage_bucket=name, object_key=key, headers=headers)
                    if body.tell() != res["ContentLength"]:
                        raise RuntimeError("Incomplete storage download")
    import io
    encrypt(io.BytesIO(json.dumps(index).encode()), path, recipient)
    vault.upload_file(str(path), bucket, prefix + "complete.json.age")
    print(prefix)


def restore(storage, vault, bucket, tmp, snapshot):
    if not re.fullmatch(r"[0-9]{8}T[0-9]{6}Z-[a-f0-9]{32}", snapshot):
        raise ValueError("Invalid snapshot ID")
    prefix = "snapshots/" + snapshot + "/"
    encrypted = tmp / "payload.age"
    manifest = tmp / "manifest"
    vault.download_file(bucket, prefix + "complete.json.age", str(encrypted))
    decrypt(encrypted, manifest)
    index = json.loads(manifest.read_text())
    occupied = db("psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-c",
                  "select exists(select from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p','v','m','S')) or exists(select from storage.buckets)")
    if occupied != "f" or storage.list_buckets()["Buckets"]:
        raise RuntimeError("Restore requires an empty project")
    for number, item in enumerate(index["files"]):
        vault.download_file(bucket, prefix + item["key"], str(encrypted))
        if digest(encrypted) != item["sha256"]:
            raise RuntimeError("Archive checksum mismatch")
        decrypt(encrypted, tmp / str(number))
    for number, item in enumerate(index["files"]):
        path = tmp / str(number)
        if item["key"] == "database.dump.age":
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
