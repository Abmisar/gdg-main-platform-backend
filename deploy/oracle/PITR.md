# PostgreSQL point-in-time recovery in Jeddah

Until cutover, Supabase Free exposes no WAL archive. Continue the nightly age-encrypted database and asset snapshots before and after cutover. Physical PITR covers the self-hosted database, including roles and all schemas. Recover asset contents separately from the logical snapshot vault and reconcile object references at the selected time.

## Prepare before admitting writes

1. In me-jeddah-1 create a private Standard bucket dedicated to pgBackRest. Disable public access and cross-region replication. Let pgBackRest expire its own objects. An age-based object deletion rule can break the WAL chain. Use a dedicated customer secret key principal restricted to listing, reading, creating, overwriting and deleting objects in this bucket. Provision a separate read/list principal for recovery. Verify both principals are denied access to the asset and logical vault buckets.
2. Run `python3 configure.py prod pitr.jeddah` on the owner-controlled host. Enter the namespace S3 compatibility hostname in Jeddah (hostname only), bucket, writer access key, writer secret and a high-entropy repository passphrase. Keep the passphrase alongside the offline age identity in the owner's Saudi recovery custody. The archiver requires a runtime copy in the protected pitr.env. Replacing the passphrase in this file breaks access to existing backups. Retain each repository's matching key through its retention period.
3. Prepare the release and start postgres as in the migration guide. Set GDG_RELEASE_DIR to the absolute prepared release path. Initialize the stanza immediately, then take a full backup after importing data and before reopening writes.

```sh
db() {
  docker compose --env-file "$GDG_RELEASE_DIR/tags.env" -p gdg-prod \
    -f "$GDG_RELEASE_DIR/compose.yml" exec -T -u postgres postgres "$@"
}
db pgbackrest --stanza=gdg stanza-create
db pgbackrest --stanza=gdg check
db pgbackrest --stanza=gdg --type=full backup
db pgbackrest --stanza=gdg info
python3 "$GDG_RELEASE_DIR/pitr-ops.py" check
```

4. Release enable-jobs installs the physical backup and monitor timers alongside the existing logical backup timer. Check all three with `systemctl --user list-timers 'gdg-*'`. Run `systemctl --user start gdg-pitr-alert.service` and confirm receipt at SECURITY_ALERT_EMAIL. Monitor the timers externally as well because an offline host cannot send mail.

## Operations and budget

The server runs pgBackRest locally using its Unix socket and a dedicated egress network without published ports. pgBackRest handles encrypted base backups, synchronous archive uploads and matching WAL expiry in one repository. PostgreSQL forces a segment switch after 300 seconds when WAL has been generated. A genuinely idle server has no outstanding transactions to protect. The five-minute monitor writes a restore point so the archive remains observable during quiet periods. Five minutes plus upload time is the healthy archive objective. An outage can extend data loss beyond it.

The daily job at 02:00 UTC takes a full on Sunday and a differential on other days. A 14-day time policy preserves a full old enough to start replay at the beginning of the window and all subsequent WAL. Allow space for three weekly fulls and a fourth in progress. Use `python3 "$GDG_RELEASE_DIR/pitr-ops.py" check` for the last successful archive, last failure and backup age in seconds. It fails for an unresolved archive failure, an archive older than 11 minutes, or a backup older than 36 hours. Inspect the user journal for gdg-pitr-check.service, gdg-pitr-backup.service and gdg-pitr-alert.service. On failure inspect disk headroom for accumulating pg_wal, bucket permissions, keys, connectivity and the repository. Preserve queued WAL, repair access, then run the stanza check and a backup. [pgBackRest retention reference](https://pgbackrest.org/configuration.html#section-repository)

Estimate peak **compressed repository bytes** using four fulls, up to 18 daily differentials and about 21 days of WAL across weekly boundaries. For example, 1 GB per full, 0.1 GB per differential and 0.2 GB of WAL per day gives about 10 GB. An additional 0.5 GB nightly logical snapshot for 14 days and 1 GB live assets bring that estimate to 18 GB before in-flight uploads, versions and other tenancy usage. At 0.4 GB WAL/day the total exceeds 22 GB. Missed fulls extend retention. Measure actual stored bytes per backup, daily archive growth, live assets, vault bytes and requests after the rehearsal and weekly thereafter. Compare peak total against the tenancy's actual allowance and configure capacity and budget alerts before cutover. The 20 GB Always Free allowance is shared. [OCI resource allowances](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

## Quarterly drill and incident recovery

On an isolated Jeddah host load the matching release image, obtain the offline passphrase, and create a mode-0700 GDG_RECOVERY_CONFIG directory with mode-0600 pitr.env using the five keys from env/pitr.jeddah.env.example. Supply the original bucket and read-only credentials. Allow egress to the repository. Choose a **fresh, unused** Compose project and volume for each attempt. The recovery service has a Unix socket only and no apps, scheduler or tunnel. Set TARGET to an explicit timestamp including offset between the first retained full and the last archived transaction. For a drill record committed fixture rows on both sides of the target beforehand. Allow a later transaction to commit, switch WAL and confirm it archived.

```sh
export GDG_RECOVERY_CONFIG
: "${RECOVERY_PROJECT:?unique recovery project}" "${TARGET:?explicit UTC timestamp}"
recover() {
  docker compose --env-file "$GDG_RELEASE_DIR/tags.env" -p "$RECOVERY_PROJECT" \
    -f "$GDG_RELEASE_DIR/backend/deploy/oracle/compose.pitr-recovery.yml" "$@"
}
recover run --rm --no-deps recovery pgbackrest --stanza=gdg info
recover run --rm --no-deps recovery pgbackrest --stanza=gdg \
  --type=time --target="$TARGET" --target-action=pause restore
recover up -d recovery
recover logs recovery
recover exec -T recovery psql -X -d gdg -c 'SELECT pg_is_in_recovery(), pg_get_wal_replay_pause_state(), pg_last_xact_replay_timestamp()'
```

Require recovery=true and pause state=paused and inspect logs for the chosen target. Connection readiness alone can precede the target. Compare the exact expected row set, migration history, representative counts and ciphertext hashes. Confirm later inserts/deletes were excluded. Record target, backup label, archive range, evidence, elapsed time and gaps. Destroy only the disposable recovery project and volume after owner signoff. Repeat quarterly and after engine or repository changes. The repository includes test-pitr.sh for an entirely synthetic MinIO drill.

For an incident, fence all writers and jobs on the former primary first. Preserve it and its repository. With owner approval promote the verified isolated instance by running `recover exec -T recovery psql -X -d gdg -c 'SELECT pg_wal_replay_resume()'`. Verify pg_is_in_recovery() is false. Stop it cleanly. Bind the recovered volume explicitly as the production pgdata external volume on the replacement deployment, with the matched release and application keys. Verify its identity before startup. Configure a fresh private repository, initialize its stanza, take a full and prove WAL archiving before routing traffic. Verify grants, migration status, application readiness, asset consistency and timer delivery. Reopen a single writer and scheduler and retain the prior timeline for investigation.
