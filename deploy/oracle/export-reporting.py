import os
import tempfile
import zipfile
from datetime import datetime, timezone

import boto3
import psycopg

views = (
    "dim_date", "dim_committee", "dim_event", "dim_member_pseudo", "dim_application_status",
    "fact_applications", "fact_decisions", "fact_registrations", "fact_attendance",
    "fact_points", "fact_membership_changes", "fact_retention", "fact_email_delivery",
)
namespace = os.environ["REPORTING_STORAGE_NAMESPACE"]
if not namespace.isalnum():
    raise ValueError("Invalid namespace")
storage = boto3.client("s3", region_name="me-jeddah-1",
                       endpoint_url=f"https://{namespace}.compat.objectstorage.me-jeddah-1.oraclecloud.com")
with tempfile.TemporaryFile() as archive:
    with psycopg.connect(user="gdg_reporting") as database, zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        database.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        with database.cursor() as cursor:
            for view in views:
                with bundle.open(f"{view}.csv", "w") as output:
                    with cursor.copy(f"COPY (SELECT * FROM reporting.{view}) TO STDOUT WITH (FORMAT CSV, HEADER)") as rows:
                        for row in rows:
                            output.write(row)
    archive.seek(0)
    storage.upload_fileobj(archive, os.environ["REPORTING_BUCKET"], "reporting/latest.zip",
                           ExtraArgs={"ContentType": "application/zip", "Metadata": {
                               "generated": datetime.now(timezone.utc).isoformat()}})
