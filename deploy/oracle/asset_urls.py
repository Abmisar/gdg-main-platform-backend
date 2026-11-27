import base64
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from psycopg import sql


COLUMNS = (
    ("events", "event_id", "image_url"),
    ("announcement", "announcement_id", "image_url"),

)


PRIVATE_IMAGES = (
    ("auth_user", "id", "image_encrypted", "AuthUser.image"),
    ("person", "person_id", "profile_image_url_encrypted", "Person.profileImageUrl"),
)


def transform_private_images(conn, old_base):
    keys = json.loads(os.environ["FIELD_ENCRYPTION_KEYS"])
    active = os.environ["FIELD_ENCRYPTION_ACTIVE_VERSION"]
    sample = None
    for table, key, column, field in PRIVATE_IMAGES:
        names = dict(t=sql.Identifier("public", table), k=sql.Identifier(key), c=sql.Identifier(column))
        with conn.cursor(name="private_image_rows") as rows:
            rows.execute(sql.SQL("SELECT {k},{c} FROM {t} WHERE {c} IS NOT NULL FOR UPDATE").format(**names))
            for row_id, original in rows:
                fmt, version, iv, tag, payload = original.split(".")
                if fmt != "f2":
                    raise ValueError("Invalid field envelope")
                def aad(version):
                    return json.dumps(["f2", version, field, str(row_id).lower()], separators=(",", ":")).encode()
                def decode(value):
                    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
                def encode(value):
                    return base64.urlsafe_b64encode(value).decode().rstrip("=")
                cipher = AESGCM(base64.b64decode(keys[version], validate=True))
                url = json.loads(cipher.decrypt(decode(iv), decode(payload) + decode(tag), aad(version)))
                if not url.startswith(old_base):
                    continue
                mapped = conn.execute("SELECT new_url FROM copied WHERE old_url=%s", (url,)).fetchone()
                if not mapped:
                    raise ValueError("Unmapped private image URL")
                nonce = os.urandom(12)
                value = json.dumps(mapped[0], ensure_ascii=False).encode()
                cipher = AESGCM(base64.b64decode(keys[active], validate=True))
                sealed = cipher.encrypt(nonce, value, aad(active))
                updated = ".".join(("f2", active, encode(nonce), encode(sealed[-16:]), encode(sealed[:-16])))
                stored = conn.execute(sql.SQL("UPDATE {t} SET {c}=%s WHERE {k}=%s RETURNING {c}").format(**names),
                                      (updated, row_id)).fetchone()[0]
                conn.execute("INSERT INTO migration_audit.asset_urls(table_name,row_key,old_url,new_url) VALUES (%s,%s,%s,%s)",
                             (table, str(row_id), original, stored))
                sample = json.loads(cipher.decrypt(nonce, sealed, aad(active)))
    return sample


def rewrite(conn, old_base):
    for table, key, column in COLUMNS:
        names = dict(t=sql.Identifier("public", table), k=sql.Identifier(key), c=sql.Identifier(column))
        conn.execute(sql.SQL("""
            WITH changed AS (
                UPDATE {t} t SET {c}=copied.new_url FROM copied
                WHERE t.{c}=copied.old_url
                RETURNING t.{k}::text, copied.old_url, copied.new_url
            )
            INSERT INTO migration_audit.asset_urls(table_name,row_key,old_url,new_url)
            SELECT %s,* FROM changed
        """).format(**names), (table,))
        if conn.execute(sql.SQL("SELECT EXISTS(SELECT FROM {t} WHERE starts_with({c}, %s))")
                        .format(**names), (old_base,)).fetchone()[0]:
            raise ValueError(f"Unmapped URLs in {table}.{column}")

    return transform_private_images(conn, old_base)

def reverse(conn):
    for table, key, column in (*COLUMNS, *(item[:3] for item in PRIVATE_IMAGES)):
        result = conn.execute(sql.SQL("""
            WITH reverted AS (
                UPDATE {t} t SET {c}=a.old_url FROM migration_audit.asset_urls a
                WHERE a.table_name=%s AND t.{k}::text=a.row_key AND t.{c}=a.new_url
                  AND a.reversed_at IS NULL
                RETURNING a.id
            )
            UPDATE migration_audit.asset_urls a SET reversed_at=now()
            FROM reverted WHERE a.id=reverted.id
        """).format(t=sql.Identifier("public", table), k=sql.Identifier(key), c=sql.Identifier(column)), (table,))
        print(table, result.rowcount)
