# GDG platform infrastructure record

This file records how production infrastructure for gdguj.org was set up, what each piece is, and what is still pending. No secret values are stored here. RUNBOOK.md covers day-to-day operation.

Last updated: 2026-11-26.

## Decisions

| Topic | Decision | Reason |
|---|---|---|
| Hosting | Oracle Cloud Always Free, region Saudi Arabia West (Jeddah), `me-jeddah-1` | The only realistic always-on $0 option for a Next.js frontend plus a NestJS backend with in-process schedulers. Jeddah keeps latency low for students. |
| Server type | `VM.Standard.A1.Flex` (Ampere ARM), 2 OCPU, 12 GB RAM, Ubuntu 24.04 | The free ARM allowance is 2 OCPU / 12 GB since Oracle's July 2026 change. The free x86 shape (`VM.Standard.E2.1.Micro`) has only 1 GB RAM, too small for both apps. Node, Next.js, NestJS and Docker run natively on ARM64. |
| Containers | Docker Engine with Docker Compose | Familiar tooling, large documentation base, same OCI images work on the fallback hosts. |
| Ingress | Cloudflare Tunnel, remotely managed | No inbound ports on the server except SSH. Cloudflare handles DNS, TLS and edge protection on the free plan. |
| Database and files | Supabase Free, unchanged | Existing production data stays where it is. The backend's 15-second polling keeps the project active so it does not pause. |
| Email | Resend, unchanged | Account email uses the HTTPS API. Registration and membership email use SMTP on port 465 because Oracle blocks outbound port 25. |
| Backups | Nightly `pg_dump` and storage sync to Cloudflare R2, 14-day retention | Supabase Free has no automatic daily backups. |
| Fallback hosts | Hetzner Cloud (about €6/month) or Fly.io (about $2–5/month) | Same compose stack and images. Oracle can change Always Free rules without notice, so a tested move path is kept. |

Rejected options: Fly.io (no ongoing free tier in 2026), Render Free and Railway Free (services sleep, which stops the schedulers), Koyeb Free (256 MB RAM), Cloudflare Workers plus Cloud Run (needs the schedulers redesigned).

## Cloudflare

Account: the GDG Cloudflare account that owns the `gdguj.org` zone.

### Tunnel

- Name: `gdg`
- Tunnel ID: `1ff1c37a-3062-447c-a6dd-c52c306a211f`
- Type: remotely managed (`config_src: cloudflare`). Routes live in Cloudflare, the server runs `cloudflared tunnel run` with a connector token.
- Published routes, identical to `cloudflared.yml.example`:

| Hostname | Service |
|---|---|
| `gdguj.org` | `http://gdg-frontend:3000` |
| `www.gdguj.org` | `http://gdg-frontend:3000` |
| `api.gdguj.org` | `http://gdg-backend:3001` |
| everything else | `http_status:404` |

### DNS

Proxied CNAME records created by `cloudflared tunnel route dns`, all pointing at `1ff1c37a-3062-447c-a6dd-c52c306a211f.cfargotunnel.com`:

- `gdguj.org`
- `www.gdguj.org`
- `api.gdguj.org`

The zone had no records before this, so nothing was replaced. Until the server connects, these hostnames show a Cloudflare tunnel error page.

Still to configure: a permanent edge redirect from `www.gdguj.org` to the apex, preserving path and query, so sign-in stays on one origin.

### R2 backups

- Bucket name: `gdg-backups` (private)
- Lifecycle: objects under `snapshots/` expire after 14 days
- Status: pending. R2 must be enabled once in the Cloudflare dashboard before the bucket can be created. After enabling, run:

```sh
wrangler r2 bucket create gdg-backups
wrangler r2 bucket lifecycle add gdg-backups expire-snapshots snapshots/ --expire-days 14
```

- An R2 API token with Object Read & Write, scoped to `gdg-backups` only, is created in the dashboard and entered on the server through `configure.py backup`.

## Oracle Cloud

- Tenancy: `gdscuj`, home region `me-jeddah-1`
- Account status: Free Trial. Upgrade to Pay As You Go is pending. Set a $1 monthly budget alert after upgrading.
- Instance: `gdg-prod`
  - Availability domain: AD-1
  - Shape: `VM.Standard.A1.Flex`, 2 OCPU, 12 GB RAM, Always Free-eligible
  - Image: Canonical Ubuntu 24.04
  - Boot volume: default 46.6 GB (Always Free allows 200 GB total)
  - Network: VCN `vcn-20261126-1904` and public subnet `subnet-20261126-1904` (`10.0.0.0/24`), created by the instance wizard
  - Private IP: `10.0.0.190`
  - Internet access: the VCN's internet gateway and default route table, plus network security group `ig-quick-action-NSG` (all egress allowed, created with the "Connect public subnet to internet" quick action)
  - Public IP: an ephemeral public IPv4 on the primary VNIC, used only for administrator SSH. Web traffic arrives through the Cloudflare Tunnel.
  - SSH: one ed25519 public key, comment `gdg-oracle-deploy`. The private key is held only by the administrator.
- Status: instance created and **Running** (2026-11-26, 16:08 UTC). Assigning the ephemeral public IP is pending.

After the instance exists, restrict the subnet security list so TCP 22 is open only to the administrator's IP, and remove other public ingress. Outbound must allow DNS, HTTPS, Cloudflare Tunnel (TCP/UDP 7844), Resend SMTP (TCP 465) and the Supabase PostgreSQL port.

## Secrets

Never commit or paste these. They are entered on the server with `python3 configure.py <service>`, which uses hidden prompts.

| Service | Values |
|---|---|
| backend | Supabase connection strings and storage credentials, existing Better Auth secret, existing attendance encryption key, Resend API key and sender addresses, Google OAuth client ID and secret |
| frontend | Public API URL and the same auth settings the frontend already expects |
| tunnel | Cloudflare tunnel connector token for `gdg` |
| backup | Supabase backup connection string, R2 endpoint, access key ID and secret for `gdg-backups` |

Google OAuth callback to register: `https://gdguj.org/api/auth/callback/google`.

## Remaining steps

1. Assign the ephemeral public IP to `gdg-prod` (VNIC → IP administration → Edit → Ephemeral public IP) and note it.
2. Upgrade the Oracle account to Pay As You Go and add a $1 budget alert.
3. Enable R2, create `gdg-backups` with its lifecycle rule, and create the scoped R2 token.
4. Lock SSH to the administrator IP in the security list.
5. Bootstrap the server with `bootstrap.sh`, enter secrets with `configure.py`, and deploy with `release.sh`.
6. Verify readiness, sign-in, email delivery and the first R2 snapshot.
7. Add the `www` to apex redirect and UptimeRobot checks for the frontend and API readiness.
