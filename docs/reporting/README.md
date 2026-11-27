# Power BI for the GDG data analysis committee

Connect from an approved device in Saudi Arabia. The database provides committee, event and cohort figures through read-only views. Groups with fewer than five people disappear. Blank charts can therefore mean insufficient data. Treat pseudonyms, local Power BI caches, PBIX files and exports as restricted data.

## Windows Desktop

1. Receive approval from the GDG on Campus UJ Lead for your Google account and device. Obtain reporting database credentials privately. Use a locally encrypted drive in KSA with cloud sync disabled.
2. Install Power BI Desktop and cloudflared. On Windows, install cloudflared with `winget install --id Cloudflare.cloudflared`. Current Desktop includes Npgsql. [Microsoft connector documentation](https://learn.microsoft.com/en-us/power-query/connectors/postgresql)
3. Open PowerShell and keep this command running during import or refresh.

   ```powershell
   cloudflared access tcp --hostname reporting-db.gdguj.org --url localhost:15432
   ```

4. In Desktop choose **Get data → PostgreSQL database**. Enter server `localhost:15432`, database `gdg` and **Import**. Sign in to Google in the browser prompt using the approved account, then choose **Database** authentication in Desktop and enter the reporting login. The supplied deployment encrypts the Access tunnel, with a private Docker-network hop to PostgreSQL. If the owner approved that topology, accept the connector's unencrypted PostgreSQL prompt for this loopback connection. [Access TCP instructions](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/non-http/cloudflared-authentication/arbitrary-tcp/)
5. Expand **reporting** in Navigator and load the required views. Use the measures and relationships in [METRICS.md](METRICS.md). Save locally. Refresh before presenting, close the terminal afterwards, and remove local copies when access ends or the Lead requests erasure.

## macOS

Desktop runs on Windows. On a Mac in KSA, use an existing licensed, supported Windows VM in KSA and follow the Windows steps **inside the guest**, including cloudflared. Localhost belongs to the OS running the connector. For a native macOS PostgreSQL client, install cloudflared with `brew install cloudflared` and run the same tunnel command in Terminal. For browser-only analysis, use the export workflow below after tenant approval. A Windows VM or cloud license requiring payment falls outside this free deployment.

## Power Query

In Transform Data → New Source → Blank Query → Advanced Editor, paste this function and name the query `ReportingView`. Create another blank query for each table and name it after the view.

```powerquery
(view as text) as table =>
let
    Db = PostgreSQL.Database("localhost:15432", "gdg", [CreateNavigationProperties=false]),
    Rows = Db{[Schema="reporting", Item=view]}[Data]
in
    Rows
```

```powerquery
let
    Rows = ReportingView("fact_registrations")
in
    Rows
```

## Owner activation

1. Record the Lead's approval, named committee Google accounts, approved KSA devices, retention, and offboarding owner. Verify the Access seat entitlement, processing/log locations and network path. Cloudflare normally routes via its network and its published localization controls do not establish Saudi-only transit for this configuration. Keep the route disabled if Saudi-only processing/transit is required and cannot be evidenced. The same residency check applies to identity processing and any export transfer. [Cloudflare One residency](https://developers.cloudflare.com/data-localization/how-to/zero-trust/)
2. After the application migrations, encrypted cutover and existing grants, run the versioned SQL migration once with psql as gdg_migrate against gdg (`-v ON_ERROR_STOP=1 -f docs/sql/reporting-v1.sql`). Apply `docs/sql/field-access.sql` as bootstrap administrator. Use psql's interactive `\password gdg_reporting` and deliver the password privately. Keep migration credentials away from analysts. Confirm the reporting login has no inherited roles, access to other application schemas, pre-existing direct grants or object ownership. Test a denied raw-table read. PostgreSQL limits this login to four sessions and defaults queries to 30 seconds. These session defaults assist resource management.
3. Set REPORTING_PSEUDONYM_SALT to the hex output of `openssl rand -hex 32` in the backend secret file. Escrow it in Jeddah independently of field encryption keys. Set REPORTING_ENABLED=true only on the active scheduled backend. Confirm the 02:00 Asia/Riyadh run before granting access. A salt change requires coordinated key rebuild and replacement of prior imports. Review the semester convention. Verify canonical committee names and approve only non-personal event labels. After reviewing an event, the migration owner can insert its event_id, name, event_type and location into reporting_private.event_labels. Source edits invalidate those labels automatically.
4. Create a self-hosted Cloudflare Access application for the exact reporting hostname **before** publishing its route. Enable Google as the login method and allow only the approved individual email addresses. Exclude broad domains, bypass rules and service tokens. Verify denied and allowed sign-ins. Attach the tunnel to the production database network using compose.tunnel.yml plus compose.reporting-tunnel.yml after confirming the production network name. Configure the existing remotely managed tunnel's published TCP hostname to `tcp://postgres:5432`. For locally managed ingress insert the following before the catch-all. Keep the database without a published host port.

   ```yaml
   - hostname: reporting-db.gdguj.org
     service: tcp://postgres:5432
   ```

5. Confirm connection and disconnection records in PostgreSQL container logs and correlate timestamps with named sign-ins in Access. With a shared database login, overlapping sessions cannot be attributed conclusively to one analyst. Remove departed users from the allowlist, revoke their Access sessions, terminate active database sessions and rotate the shared password. Keep logs private and apply the approved retention schedule.
6. Core GDG backups currently cover public tables. After recovery, reapply the reporting migration and grants, restore the salt and rebuild keys/calendar. The movement history, prior semester snapshots and event approvals need a separately authorized encrypted Jeddah backup of reporting_private for historical continuity. Without one, restart observation and label approval after recovery.

## Nightly export and browser refresh

The optional reporting-export service uses the existing Jeddah backup image with its own credentials. It exports all thirteen views in one read-only repeatable-read transaction. It uploads one private ZIP of headered UTF-8 CSV files to the fixed Jeddah Object Storage endpoint, replacing reporting/latest.zip only after the archive completes.

1. Create a private, encrypted bucket in me-jeddah-1 with no public access, replication outside KSA or old object versions. Reserve capacity and requests within the existing free allowance. Give the exporter upload access to that bucket only, and give approved consumers separate read-only access. Store REPORTING_BUCKET, REPORTING_STORAGE_NAMESPACE, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and the reporting login's PGPASSWORD in the protected reporting-export.env next to backend.env. Rebuild the backup image as part of the reviewed release.
2. Install the supplied gdg-reporting-export.service and .timer under the deploy user's systemd user units, reload and enable the timer. It runs at 02:30 Asia/Riyadh. Check its exit status, the archive's generated metadata and the scheduler log. After erasure replace the export and refresh or remove dependent imports. Remove obsolete extracts, versions and local copies.
3. For free local use, retrieve the private archive to an approved KSA device, extract and select **Get data → Text/CSV** in Desktop. For scheduled Service use, the university administrator must verify Saudi storage and processing for the actual Power BI workspace, gateway, source folder, backups and SharePoint tenant if used, plus existing license entitlements. The tenant's region can differ from the source region. Keep web publication disabled when these conditions are unverified. [Microsoft tenant region guidance](https://learn.microsoft.com/en-us/power-bi/guidance/powerbi-implementation-planning-tenant-setup)
4. On an approved always-on KSA Windows gateway host schedule a nightly authenticated download after the export, check generation time, and unpack the complete archive into a staging folder. Replace the input folder between refreshes. In Desktop import each CSV from that fixed folder, set its column types from the dictionary, then publish to the approved workspace. Configure a standard on-premises gateway File/Folder connection with read-only access to the same path and schedule the semantic-model refresh after the download. Alternatively stage the extracted CSVs in a restricted, verified KSA university SharePoint library and use the SharePoint Folder connector with an organizational account. Open the refreshed report in the browser on macOS. This downstream staging and gateway configuration is owner-operated.

Example CSV query for the gateway host (adjust the folder to its approved path):

```powerquery
let
    Data = Csv.Document(File.Contents("C:\GDG\Reporting\fact_applications.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Headers = Table.PromoteHeaders(Data, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Headers, {{"day", type date}, {"status", type text}, {"applications", Int64.Type}})
in
    Typed
```

See [the dictionary](DATA-DICTIONARY.md), [measures and report layout](METRICS.md) and [field request process](REQUESTS.md).

## Reproducing the database checks

Generate the Prisma client with the repository dependencies installed. On a disposable local Docker engine run `bash test/reporting/run.sh`. The script creates its own PostgreSQL 18 container, applies every application migration and the empty-database encryption cutover, installs the reporting migration under the migration role, runs fixtures and removes the container. On the shared Mac, wait for the workload governor's build slot and give Basira timed work priority. Start Colima with two CPUs and 3 GiB, use its Docker socket, and stop the instance you started when the test ends.
