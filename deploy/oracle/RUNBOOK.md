# GDG on Campus UJ on Oracle ARM

The backend repository owns this kit. One Nest process runs the in-process schedulers, including the 15-second email poll. Next serves the public site and rewrites browser requests under /api to the public HTTPS API. Cloudflared reaches both by container name on an internal Docker network. An additional bridge provides outbound connectivity for the tunnel, API integrations and Next.js HTTPS rewrites. Supabase and Resend remain the production services.

## Provision the account and host

1. Create the Oracle account with Saudi Arabia West (Jeddah, me-jeddah-1) as its **home region**. Upgrade to Pay As You Go as requested. Under Billing & Cost Management → Budgets, set a monthly tenancy budget of USD 1 with actual and forecast alerts at 100%, and verify the email recipient. Budget notifications can lag and do not cap spend.
2. Select an Always Free eligible Ubuntu 24.04 arm64 image and VM.Standard.A1.Flex, 2 OCPU and 12 GB RAM total across the tenancy. A 50 GB balanced boot volume leaves headroom within the combined 200 GB boot/block allowance. Check other volumes, detached disks, egress and the console estimate. Availability varies by region. [OCI limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
3. Provide your SSH **public** key. In the public subnet's security list and any NSGs allow stateful TCP/22 only from your administrator CIDR. Remove broader SSH and other public TCP/UDP ingress. Retain required ICMP for path MTU. Permit outbound DNS, HTTPS, Cloudflare Tunnel TCP/UDP 7844, Resend TCP 465 and the selected Supabase PostgreSQL port. Leave OCI guest endpoint protections in place.
4. Copy bootstrap.sh to the VM using your admin connection and run it with sudo and your administrator CIDR argument.

Bootstrap installs Docker Engine, Buildx and the Compose plugin from the official ARM64 apt repository. The deploy account belongs to the docker group, which grants root-equivalent control of the host. Use a fresh SSH login for group membership. Bootstrap also configures linger, SSH, UFW, fail2ban, unattended security updates, bounded journals and 2 GB of swap when needed. Compare `sudo ufw status verbose`, `sudo iptables-save` and OCI rules. Use an actual SSH login as deploy so the user systemd bus is available.

## Configure providers and enter secrets

Use an SSH terminal and the hidden prompts below, or the orchestration client's secure secret prompt. Never send credentials in chat, paste them in command arguments, put them in cloud-init, or transfer real environment files with source. Keep a separate encrypted owner recovery copy, including attendance and auth keys. The templates list names. Private files live under ~/.config/gdg with mode 0600.

- **Cloudflare**. Create a remotely managed tunnel for gdguj.org and obtain its connector token. Configure the five published application routes exactly as in cloudflared.yml.example, including ports and HTTP scheme. Token mode reads the routes from Cloudflare. Configure a permanent edge redirect from www to the equivalent apex path and query so sign-in stays on the canonical origin. Coordinate replacing existing DNS routes at cutover. Allow dynamic auth/API paths to bypass cache. No public host port is published.
- **R2**. Create a private Standard bucket dedicated to these backups and bucket-scoped object read/write credentials. Record its S3 endpoint and bucket name. In Settings → Object lifecycle rules, expire objects with prefix `snapshots/` **14 days after creation**, including incomplete snapshots. Retain the incomplete-multipart cleanup rule. Fourteen complete copies plus operations and retries must fit the account's R2 free allowance. Monitor stored bytes, requests and Supabase egress. [R2 lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- **Supabase**. Keep the existing database and HTTPS SUPABASE_URL. Enter SUPABASE_PUBLISHABLE_KEY and SUPABASE_ASSET_UPLOAD_TOKEN. Follow backend SETUP.md to provision the bucket, role and signed, expiring uploader JWT. Track its expiry. Before expiry, issue a replacement, update the private backend.env and recreate the backend container using the active release Compose arguments with `up -d --no-build --force-recreate --no-deps --wait backend`. Verify an authorized upload afterward. Use the supported TLS database URL for the application. For backups use the direct endpoint, or IPv4 session pooler if direct IPv6 is unreachable. Split the dashboard connection string into PGHOST, PGPORT, PGDATABASE (database name), PGUSER and PGPASSWORD (raw password). Use PGSSLMODE=verify-full and install Supabase's database CA into ~/.postgresql/root.crt when required by that endpoint. Match client version 18 or newer to the server. Use a backup role capable of reading all dumped schemas and rows. Enable the Storage S3 protocol and create server-side S3 access keys. Copy the project-specific endpoint and region. These are separate from the app secret and R2 keys. [Supabase storage](https://supabase.com/docs/guides/storage/s3/compatibility)
- **Resend**. Verify the sending domain. Set EMAIL_FROM and AUTH_EMAIL_FROM to authorized senders, RESEND_API_KEY to a sending key, SMTP_HOST to smtp.resend.com, SMTP_PORT to 465, SMTP_USER to resend, and SMTP_PASS to a Resend sending key. Registration and membership mail use the shared Nodemailer service with implicit TLS on 465. Account email uses Resend HTTPS. No application change is needed.
- **Google and auth**. Use the existing Google OAuth web client or create one and authorize https://gdguj.org/api/auth/callback/google with https://gdguj.org as the origin. Supply its client ID and secret. Preserve the existing BETTER_AUTH_SECRET (at least 32 characters) and ATTENDANCE_TOKEN_KEY (32 bytes encoded in base64) so existing sessions and encrypted QR tokens survive. Set BETTER_AUTH_URL and FRONTEND_URL to https://gdguj.org and FRONTEND_ORIGINS to https://gdguj.org,https://www.gdguj.org. Set TRUST_PROXY_HOPS to 0. For APP_NETWORK_PREFIX enter the first three octets of an unused private /24 that does not overlap host, VPN, VCN or existing Docker routes. Compose assigns the connector and frontend fixed peer addresses and supplies TRUSTED_CF_PROXY_IPS to the backend. Keep both services reachable only via the tunnel and retain the separate egress networks. Confirm Cloudflare supplies the original visitor address (disable Pseudo IPv4 header overwrite). With two test clients on distinct networks, verify independent auth rate limits on the API hostname and frontend /api, and the same identity for each client on either path.
- **Frontend**. Set NEXT_PUBLIC_USE_API=true, API_PROXY_TARGET=http://gdg-backend:3001, NEXT_PUBLIC_API_URL=https://api.gdguj.org and CSP_IMAGE_ORIGINS to the approved HTTPS Supabase storage origin. Enter the approved HTTPS reporting endpoint for CSP_REPORT_URI or leave it empty. The release script copies the four public build settings from frontend.env into the release snapshot. The frontend build must accept this exact internal rewrite origin and preserve the tunnel-provided CF-Connecting-IP on both auth and application rewrites. Forward X-Forwarded-For without using it for auth identity. Browser calls use /api. Supply any optional wallet integration settings already in use separately in backend.env using a secure editor. Their names are listed in the repository's .env.example.

## Configure the release gates

1. In **each upstream repository**, open Settings → Environments. Create `dev` and `production`. Select deployment branches and tags, allow branch `main` only and add no tag rule. For `production`, enable required reviewers, select only the owner, and disable administrator bypass. Allow self-review if the owner will both dispatch and approve. Verify that an initiated run waits for the owner's review before adding the production key. If the repository plan cannot enforce required reviewers, leave that key unconfigured. Protect main and require owner review for workflow and release-control changes.
2. Provide an isolated ephemeral Linux SSH runner with label `gdg-deploy` for both repositories. Limit the runner group's access to the two reusable Oracle SSH workflows on main. Keep build/test jobs on GitHub-hosted runners. Permit TCP/22 from the deploy runner's fixed egress CIDR in both OCI ingress and UFW. Keep the administrator's existing SSH rule. The runner needs Bash and OpenSSH.
3. On the owner's workstation generate four distinct Ed25519 keypairs, one per repo and environment. For example, `ssh-keygen -t ed25519 -N '' -C gdg-backend-dev -f gdg-backend-dev`. In each environment create secret `DEPLOY_SSH_KEY` from its private key. Set environment variables `DEPLOY_HOST` to the VM's SSH hostname and `DEPLOY_KNOWN_HOSTS` to the corresponding known_hosts line. Obtain the host public key through the trusted admin session from /etc/ssh/ssh_host_ed25519_key.pub and prefix its key type and base64 value with the exact SSH hostname.
4. On the VM clone each upstream repo as deploy into ~/backend and ~/frontend with origin pointing to its upstream and read-only access. Install the reviewed deploy/oracle directory at /opt/gdg/oracle as root, readable/executable by deploy, writable only by root. Update this kit separately after owner review. Append the following lines to /home/deploy/.ssh/authorized_keys, replacing each placeholder with its matching public key (type and base64). Keep the directory mode 0700 and file 0600, owned by deploy.

```text
restrict,command="/opt/gdg/oracle/ssh-release.sh dev backend" DEV_BACKEND_PUBLIC_KEY
restrict,command="/opt/gdg/oracle/ssh-release.sh prod backend" PROD_BACKEND_PUBLIC_KEY
restrict,command="/opt/gdg/oracle/ssh-release.sh dev frontend" DEV_FRONTEND_PUBLIC_KEY
restrict,command="/opt/gdg/oracle/ssh-release.sh prod frontend" PROD_FRONTEND_PUBLIC_KEY
```

5. In Cloudflare Zero Trust → Access → Applications, create self-hosted applications covering all paths on dev.gdguj.org and api-dev.gdguj.org. Allow only the team's identity group with the chosen IdP, with no bypass policy. Configure Access **before publishing DNS**. On the existing tunnel add both published application routes using cloudflared.yml.example. Check that each hostname has a proxied CNAME to the existing tunnel's UUID.cfargotunnel.com. Keep the final 404 rule. Update the three production origin names at owner-approved cutover. Verify that a signed-out browser gets the Access challenge on both dev hosts and that an allowed identity reaches the app.
6. As deploy, run the following from /opt/gdg/oracle. Enter distinct non-overlapping RFC1918 prefixes for the two environments. For dev obtain the database connection string, project URL, publishable key, bucket and scoped upload JWT exclusively from **gdgoc-uj-dev**. Apply the matching schema to that project, seed synthetic members only, and point CSP_IMAGE_ORIGINS to its storage origin. Generate independent auth and attendance keys. Set BETTER_AUTH_URL, FRONTEND_URL and FRONTEND_ORIGINS to https://dev.gdguj.org, NEXT_PUBLIC_API_URL to https://api-dev.gdguj.org, and use a dev OAuth client with callback https://dev.gdguj.org/api/auth/callback/google. Use a Resend test setup or a verified dev sender and dev-scoped SMTP/API credentials. Use controlled test recipients. Keep the internal API_PROXY_TARGET and TRUST_PROXY_HOPS settings described above. For prod use the existing production service credentials. Migrate earlier private configuration into ~/.config/gdg/prod with mode 0600 if already configured.

```bash
cd /opt/gdg/oracle
for name in backend frontend network; do python3 configure.py dev "$name"; done
for name in backend frontend network tunnel backup; do python3 configure.py prod "$name"; done
for target in dev prod; do
  prefix=$(cut -d= -f2 "$HOME/.config/gdg/$target/network.env")
  docker network create --internal --subnet "$prefix.0/24" --ip-range "$prefix.128/25" "gdg-$target-app"
done
export DEV_PREFIX=$(cut -d= -f2 ~/.config/gdg/dev/network.env)
export PROD_PREFIX=$(cut -d= -f2 ~/.config/gdg/prod/network.env)
docker compose -p gdg-tunnel -f compose.tunnel.yml up -d --wait
install -d ~/.config/systemd/user
install -m 644 systemd/* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now gdg-backup.timer
```

7. Seed each environment's backend.sha and frontend.sha files under ~/.config/gdg/ENV with the exact owner-reviewed 40-character upstream main commits, one per file. Both repositories must include their Oracle build prerequisites. The first release reads its companion SHA from this file. Later releases reuse the companion SHA from the same environment's last healthy release. Leave prod keys unavailable until these pins, backups, production schema and cutover are approved. Stop the old production backend and connector at cutover to avoid duplicate schedulers or competing tunnel connections. Remove any independently configured Dokploy registry auto-updates and delete the obsolete Dokploy webhook secrets in each repo.

## Deploy, verify and roll back

Provide a mode-0600 migration.env beside backend.env containing DATABASE_URL for the migration-status connection. Apply approved migrations separately. The candidate must pass Prisma migration status before activation. Readiness selects the event ID and confirmation window.

Set SECURITY_ALERT_EMAIL to the monitored security role inbox. Verify report-read alert delivery using a synthetic event and record the receipt.

A main push runs the repo's tests and image build, without deploying. In Actions → Build and deploy backend image (or frontend image) → Run workflow, choose main and select dev or production. Review the run's SHA and the companion SHA in the current production release before approving the production environment. Schedule production requests one at a time so the approved companion remains current. The VM serializes releases across projects, checks main ancestry, builds both ARM images from pinned Git archives and activates them with a health deadline. A stale dev push is skipped. The projects use separate env files, images, networks and release history. Dev caps each app at 0.5 CPU and 768 MiB. Production caps each at 1.5 CPU and 2 GiB. Loopback frontend/API ports are 13000/13001 for dev and 3000/3001 for prod.

```sh
target=dev
active="$HOME/.local/state/gdg/$target/current"
docker compose -p "gdg-$target" --env-file "$active/tags.env" -f "$active/compose.yml" ps
cat "$active/backend.sha" "$active/frontend.sha"
curl -fsS http://127.0.0.1:13001/health/ready
```

Verify the dev login, /api rewrites, scoped storage upload and test email through Access. At production cutover check https://api.gdguj.org/health/ready, https://gdguj.org/api/health/ready and a test sign-in. Start gdg-backup.service and verify an encrypted completion manifest in R2. Configure uptime checks for production. A failed activation attempts to restore the last healthy pair. For owner-operated rollback restore matching configuration or schema if necessary and run `/opt/gdg/oracle/release.sh dev rollback` (or `prod rollback` after approval). Retain current and previous release images. Inspect and prune superseded source archives, build cache and images during maintenance, monitoring free disk on this shared VM.

## Backup encryption keys

On the owner’s Mac, install age and generate the identity offline: `age-keygen -o gdg-backup-identity.txt`. Record the public recipient printed by the command. Store the private identity file securely in the owner’s password manager or Keychain, and keep a recoverable offline copy. Give the operator only the public recipient; enter it as AGE_RECIPIENT when running `configure.py prod backup`. Never install the private identity on the backup server for normal operation. Backups fail closed without a recipient.

For a restore drill, temporarily place the identity file on the restore machine with owner-only permissions (`chmod 600`), enter its absolute path as AGE_IDENTITY_FILE in `configure.py prod restore`, and follow the disposable project procedure below. Remove the temporary identity and decrypted restore scratch data afterward. Confirm that the drill restores representative database records and storage objects.

To rotate, generate a new pair offline, preserve the new private identity securely, and update AGE_RECIPIENT in backup configuration for new backups. Retain the old identity until all backups encrypted to it expire after 14 days; use the identity matching the selected snapshot during restore.

## Restore a completed snapshot

The timer runs at 00:30 UTC. It archives the database with pg_dump custom format, then copies all S3-visible storage objects and records bucket inventory, object keys, content headers and SHA-256 digests. Every object, including complete.json.age, is encrypted with age before upload. The encrypted completion manifest is uploaded last. Reserve scratch space for the largest encrypted object during backup and the full decrypted snapshot during restore. Object uploads during a backup can race the database snapshot. For an exact cutover suspend storage writers and scheduled workers during the backup. Check the first backup on the real project for database permissions, bucket visibility and free-tier capacity.

1. Create a **fresh disposable Supabase project** with matching PostgreSQL major, extensions and managed roles. Keep writers and backend workers offline. Create destination S3 credentials. Use the target session/direct DB parameters and target storage credentials in restore.env, with read access to the **source R2 bucket**.
2. Identify a prefix under snapshots/ with complete.json.age, still within retention. Use only the ID between the slashes.

```sh
cd /opt/gdg/oracle
python3 configure.py prod restore
./restore.sh SNAPSHOT_ID
```

3. The script decrypts and authenticates every payload and verifies checksums before making changes, restores the public application schema (including Better Auth), restores storage bucket definitions and uploads files through Supabase S3 so its object catalog stays consistent. It rejects occupied destinations. A failure can leave partial data. Start the drill again with a fresh target. The full dump is available for selective recovery of custom schemas, database policies and managed-schema customizations using pg_restore --list and --use-list. Reapply any project-specific storage policies, object ownership requirements and dashboard settings before permitting clients. Supabase-managed roles, provider secrets and project settings require separate recovery.
4. Compare source snapshot counts against restored memberships, events, auth records and bucket objects. Check MIME types, public/private access and a representative download. Point a **single** backend at the recovered project when ready to cut over. Do not start a second scheduler against production data. Test external readiness and sign-in before changing public routes.

## Fallback hosts and local verification

**Hetzner**. Provision Ubuntu 24.04 ARM64 with the same SSH-only firewall. Supply the owner's public key in /home/ubuntu/.ssh/authorized_keys before bootstrap on a host with a different initial account. Follow this runbook using the new host and the same database and buckets. Stop the old backend and tunnel before starting the new Compose stack. The remotely managed tunnel routes can stay in place.

**Fly.io**. Build the backend Dockerfile and frontend Dockerfile.oracle for linux/amd64 if required by the chosen Machines, preserving the frontend build arguments. Use one app for the API (internal port 3001) and one for the frontend (3000), with the same environment and custom HTTPS hostnames. Configure the API Machine count to one, disable automatic stops, and use a stop-before-start deployment strategy for workers. Move DNS and certificate validation to the Fly endpoints at cutover. A small separate Linux runner must continue the backup timer when using Fly Machines in place of the systemd host. Verify pricing before either fallback.

**Mac**. Run ./smoke-kiri.sh from a Mac with Kiri started when the governor permits builds. It builds committed sources on the explicit Kiri context, uses a disposable database and checks API readiness and the frontend response. It publishes no host ports. The database fixture has no production records or scheduler migrations. Live provider acceptance tests require the owner's accounts.
