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
from urllib.parse import quote, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, build_opener

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
    index = {"files": [], "buckets": [], "public_base": os.environ["ASSET_PUBLIC_BASE"].rstrip("/")}
    path = tmp / "payload.age"

    def save(key, source, **attrs):
        encrypt(source, path, recipient)
        key += ".age"
        vault.upload_file(str(path), bucket, prefix + key)
        index["files"].append(dict(key=key, sha256=digest(path), **attrs))

    binary = Path("/usr/lib/postgresql/18/bin/pg_dump")
    process = subprocess.Popen([str(binary) if binary.exists() else "pg_dump", "-Fc", "--schema=public"], stdout=subprocess.PIPE)
    try:
        save("database.dump", process.stdout)
    finally:
        process.stdout.close()
        status = process.wait()
    if status:
        raise RuntimeError("pg_dump failed")
    name = os.environ["ASSET_BUCKET"]
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
                  "select exists(select from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p','v','m','S'))")
    asset = os.environ["ASSET_BUCKET"]
    original, = index["buckets"]
    old_base = index["public_base"].rstrip("/") + "/"
    new_base = os.environ["ASSET_PUBLIC_BASE"].rstrip("/") + "/"
    if original == asset or urlsplit(old_base).netloc == urlsplit(new_base).netloc:
        raise ValueError("Choose a distinct recovery bucket and public origin")
    if any(f.get("storage_bucket", original) != original for f in index["files"]):
        raise RuntimeError("Unexpected asset bucket in snapshot")
    if occupied != "f" or storage.list_objects_v2(Bucket=asset, MaxKeys=1)["KeyCount"]:
        raise RuntimeError("Restore requires an empty project")
    for number, item in enumerate(index["files"]):
        vault.download_file(bucket, prefix + item["key"], str(encrypted))
        if digest(encrypted) != item["sha256"]:
            raise RuntimeError("Archive checksum mismatch")
        decrypt(encrypted, tmp / str(number))
    for number, item in enumerate(index["files"]):
        path = tmp / str(number)
        if item["key"] == "database.dump.age":
            common = ["pg_restore", "--exit-on-error", "--single-transaction", "--no-acl", "--no-owner",
                      "--dbname=" + os.environ["PGDATABASE"]]
            listing = db("pg_restore", "--list", str(path))
            toc = tmp / "public.toc"
            toc.write_text("\n".join(line for line in listing.splitlines()
                                     if " SCHEMA - public " not in line) + "\n")
            db(*common, "--use-list", str(toc), "--schema=public", str(path))
            db("psql", "-X", "-v", "ON_ERROR_STOP=1", "-c",
               'REVOKE ALL ON public._prisma_migrations FROM gdg_app')
        else:
            storage.upload_file(str(path), asset, item["object_key"], ExtraArgs=item["headers"])
    verify_recovery(index, tmp, old_base, new_base)


class RejectRedirects(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def verify_recovery(index, tmp, old_base, new_base):
    import psycopg
    from asset_urls import rewrite

    if urlsplit(new_base).scheme != "https":
        raise ValueError("Recovery public URL requires HTTPS")
    with psycopg.connect() as conn:
        conn.execute("CREATE TEMP TABLE copied (old_url text PRIMARY KEY, new_url text NOT NULL, file_id int)")
        for number, item in enumerate(index["files"]):
            if "object_key" in item:
                suffix = quote(item["object_key"], safe="/")
                conn.execute("INSERT INTO copied VALUES (%s,%s,%s)", (old_base + suffix, new_base + suffix, number))
        private_url = rewrite(conn, old_base)
        from asset_urls import COLUMNS
        from psycopg import sql
        sample = None
        for table, _, column in COLUMNS:
            sample = conn.execute(sql.SQL("SELECT c.new_url,c.file_id FROM {} t JOIN copied c ON t.{}=c.new_url LIMIT 1")
                                  .format(sql.Identifier("public", table), sql.Identifier(column))).fetchone()
            if sample:
                break
        if not sample and private_url:
            sample = conn.execute("SELECT new_url,file_id FROM copied WHERE new_url=%s", (private_url,)).fetchone()
        if not sample:
            raise RuntimeError("Recovery drill needs a representative stored image URL")
        url, number = sample
        opener = build_opener(ProxyHandler({}), RejectRedirects())
        with opener.open(url, timeout=30) as response:
            result = hashlib.sha256()
            for block in iter(lambda: response.read(1024 * 1024), b""):
                result.update(block)
        if result.hexdigest() != digest(tmp / str(number)):
            raise ValueError("Recovered public image bytes differ")


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("backup")
    commands.add_parser("restore").add_argument("snapshot")
    args = parser.parse_args()
    vault = client("VAULT", "me-jeddah-1")
    storage = client("ASSET_S3", "me-jeddah-1")
    with tempfile.TemporaryDirectory() as tmp:
        if os.environ["VAULT_BUCKET"] == os.environ["ASSET_BUCKET"]:
            raise ValueError("Use separate asset and vault buckets")
        params = storage, vault, os.environ["VAULT_BUCKET"], Path(tmp)
        if args.command == "backup":
            backup(*params)
        else:
            restore(*params, args.snapshot)


if __name__ == "__main__":
    main()
