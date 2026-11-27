import os
from tempfile import TemporaryFile
from urllib.parse import quote

import psycopg
from botocore.exceptions import ClientError
import argparse
from asset_urls import reverse, rewrite

from snapshot import client
from hashlib import sha256


def fingerprint(stream):
    digest = sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(chunk)
    return digest.digest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reverse", action="store_true")
    if parser.parse_args().reverse:
        with psycopg.connect() as conn:
            reverse(conn)
        return
    env = os.environ
    source = client("SOURCE_S3", env["SOURCE_S3_REGION"])
    target = client("ASSET_S3", "me-jeddah-1")
    src_bucket, dst_bucket = env["SOURCE_BUCKET"], env["ASSET_BUCKET"]
    if env["SOURCE_S3_ENDPOINT"] == env["ASSET_S3_ENDPOINT"] and src_bucket == dst_bucket:
        raise ValueError("Source and target coincide")
    old = env["SOURCE_PUBLIC_BASE"].rstrip("/") + "/"
    new = env["ASSET_PUBLIC_BASE"].rstrip("/") + "/"
    if old == new:
        raise ValueError("Public URL bases coincide")
    with psycopg.connect() as conn:
        conn.execute("CREATE TEMP TABLE copied (old_url text PRIMARY KEY, new_url text NOT NULL)")
        pages = source.get_paginator("list_objects_v2").paginate(Bucket=src_bucket)
        for page in pages:
            for item in page.get("Contents", []):
                key = item["Key"]
                obj = source.get_object(Bucket=src_bucket, Key=key)
                headers = {k: obj[k] for k in ("ContentType", "ContentEncoding", "CacheControl", "ContentDisposition", "Metadata") if k in obj}
                with TemporaryFile() as tmp, obj["Body"] as body:
                    for chunk in iter(lambda: body.read(1024 * 1024), b""):
                        tmp.write(chunk)
                    tmp.seek(0)
                    expected = fingerprint(tmp)
                    try:
                        stored = target.get_object(Bucket=dst_bucket, Key=key)
                    except ClientError as exc:
                        if exc.response["ResponseMetadata"]["HTTPStatusCode"] != 404:
                            raise
                        tmp.seek(0)
                        target.upload_fileobj(tmp, dst_bucket, key, ExtraArgs=headers)
                        stored = target.get_object(Bucket=dst_bucket, Key=key)
                    with stored["Body"] as data:
                        if fingerprint(data) != expected or any(stored.get(k) != v for k, v in headers.items()):
                            raise ValueError("Destination content or headers differ")
                suffix = quote(key, safe="/")
                conn.execute("INSERT INTO copied VALUES (%s,%s)", (old + suffix, new + suffix))
        rewrite(conn, old)
        print("Verified objects:", conn.execute("SELECT count(*) FROM copied").fetchone()[0])


if __name__ == "__main__":
    main()
