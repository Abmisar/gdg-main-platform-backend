import json
import os
import smtplib
import ssl
import subprocess
import sys
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

release = Path(__file__).resolve().parent
config_dir = Path((release / "config-dir").read_text().strip())
compose = ["docker", "compose", "--env-file", str(release / "tags.env"),
           "-f", str(release / "compose.yml"), "-p", "gdg-prod", "exec", "-T",
           "-u", "postgres", "postgres"]


def output(*command):
    environment = {**os.environ, "GDG_CONFIG": str(config_dir)}
    return subprocess.check_output([*compose, *command], text=True, env=environment).strip()


def backup():
    kind = "full" if datetime.now(timezone.utc).weekday() == 6 else "diff"
    print(output("pgbackrest", "--stanza=gdg", "--type=" + kind, "backup"))


def check():
    query = """
        SELECT json_build_object(
            'last_archive', last_archived_time,
            'archive_age_seconds', extract(epoch from now() - last_archived_time),
            'last_failure', last_failed_time,
            'unresolved_failure', last_failed_time IS NOT NULL AND
                (last_archived_time IS NULL OR last_failed_time > last_archived_time)
        ) FROM pg_stat_archiver
    """
    def sql(statement):
        return output("psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-d", "gdg", "-c", statement)

    sql("SELECT pg_create_restore_point('gdg_archive_heartbeat')")
    archive = json.loads(sql(query))
    stanza, = json.loads(output("pgbackrest", "--stanza=gdg", "--output=json", "info"))
    backups = stanza["backup"]
    age = time.time() - max(item["timestamp"]["stop"] for item in backups) if backups else None
    print(json.dumps({**archive, "backup_age_seconds": age}), flush=True)
    if (stanza["status"]["code"] or age is None or age > 36 * 3600
            or archive["unresolved_failure"] or archive["archive_age_seconds"] is None
            or archive["archive_age_seconds"] > 660):
        raise RuntimeError("PITR archive or backup needs attention")


def alert():
    config = dict(line.split("=", 1) for line in (config_dir / "backend.env").read_text().splitlines()
                  if "=" in line)
    message = EmailMessage()
    message["To"] = config["SECURITY_ALERT_EMAIL"]
    message["From"] = config["AUTH_EMAIL_FROM"]
    message["Subject"] = "GDG Jeddah PostgreSQL backup alert"
    message.set_content("Check the gdg-pitr services in the user journal. Inspect archive lag, "
                        "repository availability, disk space and the latest complete backup.")
    port = int(config["SMTP_PORT"])
    context = ssl.create_default_context()
    if port == 465:
        connection = smtplib.SMTP_SSL(config["SMTP_HOST"], port, timeout=30, context=context)
    else:
        connection = smtplib.SMTP(config["SMTP_HOST"], port, timeout=30)
    with connection:
        if port != 465:
            connection.starttls(context=context)
        connection.login(config["SMTP_USER"], config["SMTP_PASS"].replace(" ", ""))
        connection.send_message(message)


if __name__ == "__main__":
    {"backup": backup, "check": check, "alert": alert}[sys.argv[1]]()
