# Backend Local Setup

Run NestJS, PostgreSQL, and pgAdmin on your computer. Each developer has a separate local database and data.

> **Demo data is optional.** Starting Docker applies migrations and installs the 3 roles, 32 skills and 30 permission definitions. It also installs DATA/PR reference committees and eight committee permission rules. It installs two global role_permission links: GROUP_LEADER and GROUP_CO_LEADER each receive members.manage; ADVISOR receives none. API authorization is separate. It does **not** add demo people. After setup, run the [optional seed step](#optional-add-the-local-demo-people) if you want ten demo members, including three fictional DATA positions and examples of all three club roles. This data stays in your local database; it is not shared through Supabase.

## 1. Install the tools

- Install [Docker Desktop](https://docs.docker.com/get-started/get-docker/) for your computer. Open it and wait until Docker is running. Use Docker Compose 2.23.1 or newer.
- Install [Git](https://git-scm.com/downloads/). Use VS Code to open the project and edit code.
- Run the commands below in a zsh or bash terminal. On Windows, use WSL with Docker Desktop WSL Integration enabled.

Docker provides PostgreSQL, pgAdmin, and Node.js for this setup, so you do not need to install them separately.

## 2. Download the backend and install the shortcut

Open a terminal in the folder where you want to keep the project, then run:

```bash
git clone https://github.com/gdgocdev-maker/gdg-main-platform-backend.git
cd gdg-main-platform-backend
./gdg install
```

Run `./gdg install` once per computer. Then close the terminal, open a new one, and return to your `gdg-main-platform-backend` folder. Keep the project at this location so the installed shortcut continues to work.

## 3. Create your .env file

From the backend folder, run this once on a fresh clone:

```bash
cp .env.example .env
chmod 600 .env
```

`chmod 600` allows only your user account to read and edit this file.

If `.env` already exists, keep it and skip these commands.

Open `.env` in your editor before starting Docker:

1. Replace `CHANGE_ME` in `POSTGRES_PASSWORD` with your own local password. Use letters and numbers so it works directly in the connection URL.
2. Replace `CHANGE_ME` in `DATABASE_URL` with the same password.
3. Replace `CHANGE_ME` in `PGADMIN_DEFAULT_PASSWORD` with a separate password for pgAdmin. You can also change `PGADMIN_DEFAULT_EMAIL`.
4. Save the file. Keep the other default values for the initial setup.

Use these values when connecting:

| Variable | Used for |
| --- | --- |
| `PGADMIN_DEFAULT_EMAIL` | pgAdmin browser login email |
| `PGADMIN_DEFAULT_PASSWORD` | pgAdmin browser login password |
| `POSTGRES_PASSWORD` | PostgreSQL database connection password |
| `DATABASE_URL` | Backend connection when running outside Docker; Docker configures the internal backend connection automatically |

When entering credentials in pgAdmin, copy only the value after `=`, without quotation marks. Never upload `.env` or passwords to GitHub. Editing a password in `.env` alone does not update an existing database password or pgAdmin account.

## 4. Start the backend environment

The current people/membership migration requires a separate empty database. If you already have project records, preserve that database and its volume, and provision a different empty database before starting. Do not delete records, reset the database, or bypass the migration precondition. See [Fresh people/membership setup](docs/database-prisma.md#fresh-peoplemembership-setup).

```bash
gdg backend run
```

Wait until the services show `Healthy`. The first run may take several minutes to download images and dependencies.

This starts the backend, database, and pgAdmin. Open [the backend](http://localhost:3001). `Hello World!` means the app started successfully. Startup applies the committed migrations before starting NestJS and checks the database connection. If migration fails, the backend does not start; inspect `gdg logs backend`.

## 5. Open pgAdmin and connect

1. Open [http://localhost:5050](http://localhost:5050).
2. Log in with the pgAdmin email and password from `.env`.
3. Expand **Servers → Local development → GDG Local PostgreSQL**.
4. If prompted for the server password, enter the value of `POSTGRES_PASSWORD` from `.env`, not the variable name or the pgAdmin login password.
5. Expand **Databases → gdg_platform → Schemas → public → Tables**.

The browser version already includes the server connection. If you use the desktop pgAdmin app, register a server with host `127.0.0.1`, port `5432`, database `gdg_platform`, username `gdg_local`, and the value of `POSTGRES_PASSWORD` as the password.

You should see sixteen project tables, plus Prisma’s `_prisma_migrations` history table. Refresh **Tables** if needed. Everyone gets the same structure from the committed migrations. Do not create or change tables manually in pgAdmin.

After pulling backend updates in your backend clone, run `gdg backend run` again to apply any new migrations. Startup does not reset your database. Teammates use `migrate deploy` through startup; only schema authors create new migrations. If your database already contains manually created project tables, stop and ask the schema owner before proceeding; do not reset or baseline it yourself.

To verify the migration, run this from the backend folder:

```bash
docker compose exec -T backend pnpm exec prisma migrate status --config prisma7.config.ts
```

Prisma should report that the database schema is up to date. Fresh setup inserts the three approved role definitions (ADVISOR, GROUP_LEADER, GROUP_CO_LEADER), the 32 approved skill definitions and the 30 approved permission definitions, DATA/PR reference committees, eight committee permission rules and two role_permission links (GROUP_LEADER and GROUP_CO_LEADER each get members.manage); other project tables are empty. Setup does not create accounts, member-role assignments or sample events. For errors or schema changes, see [Database and Prisma](docs/database-prisma.md).

## Optional: Add the local demo people

Skip this section if you want only the tables and reference values. Otherwise, follow these steps from the backend repository:

1. Start the environment with `gdg backend run` and wait until it is healthy.
2. Confirm migrations are up to date with the migration-status command in step 5 above. Resolve any migration failure before seeding.
3. Run the seed explicitly:

```bash
docker compose exec -T backend pnpm seed:dev
```

4. Expect `Local development seed completed.` in the terminal.
5. In pgAdmin, refresh the tables. Right-click a table and choose **View/Edit Data → All Rows** to inspect the rows; leave them unchanged while checking.

On a fresh migrated database, the result is:

| Table | Rows | What to inspect |
| --- | --- | --- |
| `person` | 10 | Names and personal emails |
| `member` | 10 | Nine current members; Mohmmad is alumni |
| `committee` | 6 | DATA and PR reused from migrations; Web/Cyber under Development; PM independent |
| `member_committee` | 11 | Committee memberships and positions |
| `member_role` | 3 | Leen: GROUP_LEADER; Omar: GROUP_CO_LEADER; Rania: ADVISOR |
| `member_skill` | 15 | Three selections per original demo member; the five later examples have none |
| `role` / `skill` | 3 / 32 | Existing migration reference values, reused by the seed |
| `permission` | 30 | Migration reference definitions, unchanged by the seed |
| `role_permission` | 2 | Both club leadership roles have `members.manage`; ADVISOR has none |
| `committee_permission` | 8 | DATA leadership and PR rules installed by migrations; seed leaves them unchanged |

Leen's GROUP_LEADER and Omar's GROUP_CO_LEADER assignments match members.manage through role_permission. Rania's ADVISOR assignment has no permissions. Committee leadership alone does not give a global role. These are policy rows, not working API authorization.

Existing unrelated data is kept, so totals can be larger on a database you already use. `permission`, `role_permission`, `committee_permission` and event tables are unchanged by the optional seed.

| Member | Committee positions | Club role |
| --- | --- | --- |
| Ammar Babaset | Web Leader; PM Member | None |
| Leen Alghamdi | None | `GROUP_LEADER` |
| Abdullah Misar | Development Leader; Web Member | None |
| Mohmmad Alamri | Cyber Member; PR Member | None |
| Sara Alqahtani (fictional) | Web Co-Leader; PM Member | None |
| Noura Demo (fictional) | DATA Leader | None |
| Faisal Demo (fictional) | DATA Co-Leader | None |
| Hala Demo (fictional) | DATA Member | None |
| Omar Demo (fictional) | None | `GROUP_CO_LEADER` |
| Rania Demo (fictional) | None | `ADVISOR` |

Noura, Faisal and Hala are fictional examples with example.test emails. They have no global roles, skill selections or Auth accounts. The seed reuses DATA and PR without changing their IDs or rules. A membership-to-policy join matches events.create/own for the DATA Leader and Co-Leader, matches no rule for the DATA Member, and matches the two PR registration rules for Mohmmad. This is a data relationship check; NestJS must still enforce authentication, scope and event ownership.

Omar Demo (club.coleader@example.test) and Rania Demo (club.advisor@example.test) are fictional current members without committees, skills or Auth accounts. They cover GROUP_CO_LEADER and ADVISOR respectively. If you previously ran the eight-member seed, run the same optional command again: compatible existing rows are reused, and only missing demo records/links are added. No reset is needed.

These are database demo records. They do not create login accounts/passwords or modify permission policy rows, and do not enable dashboard/API features that have not been implemented.

**Run once when you want the demo data.** Stopping/restarting Docker keeps it; pulling code does not add it automatically. Running the command again reuses compatible rows without duplicates or timestamp changes and restores missing expected links while keeping additional data. If you intentionally changed a demo member's position or details, review that change before rerunning: a conflict rolls back the entire seed.

If the command fails:

| Message | Action |
| --- | --- |
| Requires a local PostgreSQL URL / non-production environment | Use the Docker command above with your local environment. Remote hosts and production mode are rejected. |
| `development_seed_conflict_*` | Inspect the affected person, member, committee, position or role in pgAdmin; ask the schema owner to resolve the mismatch. Existing rows are not overwritten. |
| `development_seed_missing_*` | Verify migrations and the role/skill registry, then ask the schema owner to inspect the missing reference. |
| Check migrations and local database availability | Check `gdg backend status`, `gdg backend logs` and migration status before retrying. |

Do not reset the database, remove its Docker volume or delete records to force the seed to succeed. No partial demo fixture is committed on failure.

Host development can use `pnpm seed:dev` after configuring a local DATABASE_URL and applying migrations. The launcher rejects production mode and remote hosts, including Supabase; it accepts loopback and the Compose db hostname. Keep connection credentials private. See [Optional development seed](docs/database-prisma.md#optional-development-seed) for counts, failure codes and isolated tests.

## Daily commands

On later workdays, run `gdg backend run`, work normally, then run `gdg backend stop`. After pulling reviewed backend updates, run `gdg backend run` again to apply pending migrations. Keep your existing `.env` and database volume. The optional seed is a separate action whenever you need the agreed demo fixture again.

| Command | Purpose |
| --- | --- |
| `gdg backend run` | Start the backend environment |
| `gdg backend stop` | Stop it and keep your data |
| `gdg backend status` | Show service status |
| `gdg backend test` | Run lint, type checks, and tests; start the environment first |
| `gdg backend logs` | Follow service logs; press Ctrl+C to exit |
| `docker compose exec -T backend pnpm seed:dev` | Optional: add/recheck the demo fixture; run from the backend folder after startup |

If you see `command not found: gdg`, open a new terminal after running `./gdg install`. If Docker is unavailable, open Docker Desktop, wait until it is running, and retry.

## Optional: Run the frontend too

From the backend folder, download the frontend into the same parent folder:

```bash
cd ..
git clone https://github.com/gdgocdev-maker/gdg-main-platform-frontend.git
gdg run
```

Open [the frontend](http://localhost:3000). Use `gdg stop` to stop all services and keep your data.

## Better Auth and Resend

Apply committed Prisma migrations before starting this backend. Set `BETTER_AUTH_SECRET` to a new random secret (at least 32 characters), `BETTER_AUTH_URL` and `FRONTEND_URL` to the public frontend origin, and retain the existing Google client credentials. Register `https://<frontend-origin>/api/auth/callback/google` in Google OAuth. The frontend proxies `/api/auth/*` unchanged to NestJS; app endpoints strip the outer `/api` prefix. On Oracle set `TRUST_PROXY_HOPS=0` and use the Compose-provided `TRUSTED_CF_PROXY_IPS` list of exact connector and frontend peers.

Set `RESEND_API_KEY` privately and `EMAIL_FROM="GDG on Campus UJ <noreply@gdguj.org>"`. The owner reports `gdguj.org` verified in Resend (Tokyo / ap-northeast-1), including DKIM and send/rsend records. Recommended owner DNS addition: TXT `_dmarc` → `v=DMARC1; p=none;`. Sender remains environment-driven. Never commit `.env` or keys. `EMAIL_TEST_TO` is optional and must be an owner-controlled inbox; without it, skip live mail tests.

For identity import, local checks, and coordinated cutover, see the [migration plan](docs/auth-migration-plan.md).

### Image uploads

Provision a dedicated public Supabase Storage bucket with file size limit 5,242,880 bytes, and allowed MIME types `image/jpeg`, `image/png`, `image/webp`, and `image/gif`. The default bucket ID and name are `event-images`. If that name belongs to a private or mixed-use bucket, provision a separate public bucket, set `SUPABASE_ASSET_BUCKET` to its ID, and substitute that ID in both SQL predicates below. Use 1–63 lowercase letters, digits, or hyphens, starting with a letter or digit. Event images use the bucket root and announcement images use `announcements/`. Existing public object URLs retain these paths.

Configure the HTTPS `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for the storage project. Put a project-accepted, signed, expiring JWT with role `gdg_asset_uploader` and a dedicated service subject in the backend secret `SUPABASE_ASSET_UPLOAD_TOKEN`. Have the project-authorized issuer sign the JWT with a key accepted by the storage project using its configured algorithm and key ID. Use the dedicated service UUID as `sub`, set `role` to `gdg_asset_uploader`, include the issuer and audience required by the project, and set Unix-time `iat` and a short `exp`. Keep the signing key in the issuer. Assign a renewal owner and record expiry. Before expiry, mint a replacement with the same scope, replace the token in the private backend environment, recreate the backend container to load it, and verify an authorized upload. Supabase validates each request with the supplied bearer token. [Supabase custom Storage roles](https://supabase.com/docs/guides/storage/schema/custom-roles)

The following SQL describes the grants and RLS policies for a new upload role. Apply them as a storage administrator during provisioning. Before staging, confirm RLS on both storage tables, that the Storage service can assume the dedicated role in this project, and that existing grants and policy defaults do not give the uploader broader access. Supabase requires bucket metadata `SELECT` for the per-upload check and object `INSERT` for new files. [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)

```sql
CREATE ROLE gdg_asset_uploader NOLOGIN NOINHERIT NOBYPASSRLS;
GRANT gdg_asset_uploader TO authenticator;
GRANT USAGE ON SCHEMA storage TO gdg_asset_uploader;
GRANT SELECT ON storage.buckets TO gdg_asset_uploader;
GRANT INSERT ON storage.objects TO gdg_asset_uploader;

CREATE POLICY gdg_asset_bucket_read ON storage.buckets
  FOR SELECT TO gdg_asset_uploader
  USING (id = 'event-images' AND public);

CREATE POLICY gdg_asset_object_insert ON storage.objects
  FOR INSERT TO gdg_asset_uploader
  WITH CHECK (
    bucket_id = 'event-images'
    AND EXISTS (
      SELECT 1 FROM storage.buckets AS b
      WHERE b.id = bucket_id AND b.public AND b.file_size_limit = 5242880
        AND b.allowed_mime_types @> ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[]
        AND cardinality(b.allowed_mime_types) = 4
    )
    AND name ~ '^(announcements/)?[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp|gif)$'
  );
```

Forward `Content-Length` to the backend on both multipart image POST routes. Set the ingress body limit to 5,259,264 bytes for these routes. The application returns HTTP 411 for chunked bodies or missing lengths and HTTP 413 for requests above that limit. The file itself may be at most 5 MiB.

### SMTP submission

Configure `SMTP_HOST` with a DNS name matching the relay's trusted TLS certificate. Port 465 uses implicit TLS. Other configured ports require STARTTLS and a valid certificate before authentication and message submission.

## Personal data encryption

The API, workers, backfill job and auth import need the same three secrets. Generate each 32-byte key independently with `openssl rand -base64 32` in the deployment secret manager. Keep key material out of database dumps, build arguments, shell history and CI output.

| Variable | Value |
| --- | --- |
| `FIELD_ENCRYPTION_KEYS` | JSON object mapping stable version names to standard base64 keys, for example `{"v1":"<base64>","v2":"<base64>"}` |
| `FIELD_ENCRYPTION_ACTIVE_VERSION` | Version used for new writes, for example `v2` |
| `FIELD_BLIND_INDEX_KEY` | Independent base64 HMAC key shared across encryption-key rotations |

Each protected value has its own random 96-bit nonce, AES-256-GCM ciphertext and 128-bit tag. The f2 envelope authenticates its version, model, field and database primary key. The client reserves integer IDs from the owning sequence and allocates UUIDs before encryption. Projection queries fetch the ID for authentication and preserve the caller’s selection. Encrypted updates require one identified row; batch creation encrypts each row separately. An indexed column uses HMAC-SHA256 with a per-field key derived using HKDF-SHA256. Email matching trims whitespace and lowercases. Phone matching converts Arabic-Indic and Eastern Arabic-Indic digits to ASCII, removes separators and canonicalizes Saudi 05, +966 and 00966 forms. Opaque verification and rate-limit identifiers retain exact case. Blind indexes disclose equality within a field.

### Field inventory

| Model.field | Purpose | Lookup, search or sort |
| --- | --- | --- |
| ManualRightsRequest.contactEmail, details, resolution | Privacy request correspondence and case notes | Exact contact email via blind index; free text retrieved by request ID |
| Person.fullName | Member directories and registration display | Substring search within the authorized event and directory sorting after decryption |
| Person.emailPersonal, emailUniversity | Login linkage, communication and campus affiliation | Indexed exact match, unique personal address, event-scoped substring search |
| Person.phoneNumber | Requested registrant contact and member directory | Indexed exact match |
| Person.university, branch, major, gender | Profile and recruitment attributes | Read by person ID |
| Person.bio, profileImageUrl, githubUrl, portfolioUrl, xUrl | Member-provided profile text, image and social links | Read by person ID |
| SignupVerification.fullName, emailPersonal, emailUniversity | Staged identity before verification | Unique exact lookup for personal email |
| SignupVerification.applicationData, PendingSignup.applicationData, MembershipRequest.applicationData, NonMemberRegistration.applicationData | Signup payload and membership application answers | Look up by identity, request ID or committee queue |
| EmailVerificationChallenge.email, PersonEmailIdentity.email | Verification destination and linked address | Challenge by person/purpose, identity by person/kind and partial unique blind index for personal email |
| RegistrationAnswer.answerText | Registrant answers | Look up by registration |
| EventRegistration.excuseReason, RegistrationBlacklistEntry.resolutionReason | Staff attendance decisions | Look up by registration or entry |
| MemberRole.notes, CommitteeTask.title, CommitteeTask.description, CommitteePointEntry.reason, GlobalPointEntry.reason | Internal notes, assignments and award explanations | Look up by member, committee or task |
| AuthUser.name, email, image | Better Auth profile, address and avatar | Unique indexed email lookup |
| AuthSession.ipAddress, userAgent | Session metadata | Read by session |
| AuthAccount.accessToken, refreshToken, idToken | Provider tokens that may carry profile claims | Read by account identity |
| AuthVerification.identifier, value | Verification and OAuth state | Exact-match indexes for consumption and revocation |
| BetterAuthRateLimit.key | Rate-limit identity, potentially including an IP address | Unique exact match |
| Event.name, description, location, requirements, speakers, mapsLink, whatsappGroupLink, imageUrl; EventQuestion.questionText, options; Announcement.title, excerpt, body, imageUrl, actionLabel, actionHref | Published or publishable content, including speaker names and links | Publication and event display. These editorial fields stay readable in PostgreSQL |
| Membership and registration IDs, role codes, committee choices, timestamps, decisions, AuthAccount.accountId/providerId, password hash, AuthSession.token, wallet identifiers | Relationships, authorization, credentials and history | Database joins, constraints and protocol lookup. These remain under database role controls |

### Deployment and migration order

The production Supabase database is in Central EU (Frankfurt), region `eu-central-1`.

1. Build the new backend and keep the old application serving during expansion. Use the migration connection to run `prisma migrate deploy`. Migration `20261127120000_field_encryption` adds nullable encrypted columns, indexes, verification tracking and the staff audit table. Confirm a restorable backup and protect legacy dumps, replicas and WAL according to their retention policy.
2. Run `node scripts/backfill-fields.mjs backfill` from the built checkout with the three secrets and the migration URL. The job uses primary-key batches of 100 and a row lock while copying. A retry scans from the beginning, authenticates existing values and writes only changes. Earlier committed batches survive interruption.
3. Stop old API instances, workers, seeders and imports. Run backfill again, then `node scripts/backfill-fields.mjs verify`. Verification checks every decrypted value, SQL null and index against the original under a shared lock. Any subsequent write to a protected table invalidates verification.
4. Apply the deferred SQL file `prisma/deferred/20261127130000_drop_plaintext/migration.sql` once with `psql -X -v ON_ERROR_STOP=1 -f` using the migration connection. Its transaction requires the verification marker, locks the protected tables, rebuilds the nonunique staging indexes as unique under the write freeze, removes the legacy columns and restores required fields and attendance checks. Keep this file outside Prisma's automatic migration directory. Fresh installations also run backfill, verify and the deferred migration before their first startup. Plaintext SQL development fixtures belong before this cutover.
5. On a dedicated database, have the database owner provision the three logins and table grants with `docs/sql/field-access.sql`. Set passwords through the secret manager or interactive psql password prompt. Use `gdg_app` for the API and workers, `gdg_migrate` for schema changes and `AUDIT_READER_DATABASE_URL` with `gdg_audit_reader` for the authorized leadership view. Review inherited and pre-existing grants when adapting this SQL to a hosted database. Explicitly grant only the required DML for future tables. Start the new backend after cutover. Rolling back to the old application after the drop requires a coordinated database restore.
6. In the separate `fork/deploy/oracle-docker` kit, add placeholders for the three field variables, separate application and migration URLs, and mount secrets into the API and maintenance jobs. Package the built client, field modules, backfill script and deferred SQL in the maintenance image. Remove schema deployment from any API startup using the restricted role. Keep the migration login out of the runtime container.

### Rotation and operational cost

Distribute the new key version alongside the old one to every reader first. Once all readers have both keys, switch the active version on every writer. Run `node scripts/backfill-fields.mjs rotate` after cutover to re-encrypt existing values in batches. Rerun after all old writers have stopped. Remove retired keys from runtime only after a successful pass and retain the versions needed to restore historical backups. Replacing the blind-index key requires pausing all reads and writes and rebuilding every index with the rotation job before restarting with the new key.

Exact matches use B-tree indexes. Event substring search decrypts candidate names and emails in batches of 256 and retains only the requested page of IDs, with work proportional to the number of registrations matching event and status. The club dashboard exposes up to 100 members and events per page with independent ID cursors. Directory sorting uses Node's locale comparison after decryption. Large event searches, directory collation and the verification maintenance window should be measured on representative synthetic volumes.

The read audit records member ID, operation, event/committee scope when applicable, timestamp and returned record count. Authorized membership reviewers, directory readers, dashboard readers and report exports write the audit before the response is returned. Club leader and co-leader roles receive `audit.staff_reads.view` for `GET /club-leadership/read-audit`. Decision responses are audited, including failed handler attempts with zero disclosures. The application writer can append audit rows. The dedicated reader can select only the latest 200 rows through the view. Permission registries are read-only for the application. The migration role owns the table.

Build the checkout and run `sh test/run-field-db.sh` for the isolated synthetic PostgreSQL suite. It uses the dedicated Colima profile `gdg-field-test`, checks host memory before startup and before the suite, and stops the test VM on exit.


The Prisma extension rejects ordering, distinct selection, grouped metrics and aggregates over protected fields. Raw SQL bypasses all extension encryption and authorization. A source scan of `$queryRaw`, `$executeRaw` and their unsafe variants found the maintenance backfill intentionally handling protected columns. API SQL uses IDs for locks, membership and permission metadata, event seat state, rate-limit counters, dashboard numeric aggregates, sequence allocation and the restricted audit view. Rights ownership checks use exact, field-specific blind indexes for verified personal, university and manual-request emails. Export and erasure use the same ownership predicate inside their transactions.

For local development, `./gdg backend run` provisions missing encryption and database secrets, stops the running backend, then starts Compose provisioning, migration, backfill, verification, deferred cutover and final grants in order. Repeated starts detect an already contracted schema. The API receives the writer and audit-reader URLs. The migration and bootstrap credentials stay in separate containers. For existing volumes, keep the existing bootstrap login and credentials. The grants script is repeatable after schema updates, including the rights and retention migrations.
