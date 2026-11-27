# GDG production security release

## Build and staging

Approve the staged backend and frontend commit SHAs and record the previous healthy release before cutover. On Oracle, check out the approved commits and run `deploy/oracle/release.sh`. It builds linux/arm64 application images on the VM, records both source SHAs and the release tag, pulls the pinned tunnel connector, then activates the release and waits for health. Keep the prior images and compatible private configuration. Failed activation attempts to restore the last healthy release. For a later rollback, restore compatible configuration and run `./release.sh rollback` in the Oracle kit. Coordinate schema recovery separately. GHCR publishes a supplementary CI image.

- Stage both components together. Apply the reviewed SQL migrations using the approved migrator role before starting a release that requires them. Record schema version, backup and restore evidence, and rollback responsibility. The backend runtime image is separate from the migrator.
- Set `FRONTEND_URL` to the browser’s public HTTPS origin. If set, `BETTER_AUTH_URL` uses the same origin. Configure additional `FRONTEND_ORIGINS` as explicit bare HTTPS origins. Inject a random backend-only `BETTER_AUTH_SECRET` through the deployment secret store. Match Google OAuth callbacks and the verified sending identity to the approved hosts.
- Stage verified email signup, duplicates, reset, OAuth, and the separate profile-completion step using synthetic accounts. Check profile, event detail, registration and session responses through the frontend proxy and API ingress. Confirm `private, no-store` on personalized data, QR and auth responses. Verify public static assets still cache.
- Review report-only CSP on both locales, auth, attendance camera and event pages. Enforce only after the active integration and asset origins are accounted for.

## Storage, mail and retention

- Preserve the existing event image URLs. Provision and inspect the bucket in Supabase before enabling uploads. Set `SUPABASE_ASSET_BUCKET` to the approved bucket if the legacy `event-images` bucket must remain private. Grant the dedicated uploader role only the bucket-metadata read and object-insert permissions documented in backend setup. Inject the publishable key and short-lived scoped upload token and agree token renewal before expiry.
- Preserve multipart Content-Length through the managed ingress and apply the body limits documented for the upload routes. Stage authorized event and announcement uploads and verify immutable existing asset URLs.
- Verify SMTP certificate validation on the configured relay. Port 465 uses implicit TLS. Other ports require STARTTLS.
- Enable the optional `SIGNUP_RETENTION_REPORT_ENABLED` setting only where operators need counts of expired pending records. The job reports counts without deleting records. Agree a retention window, recovery path and purge authorization before enabling any destructive retention workflow.

## Edge and tunnel checks

Cloudflare Tunnel reaches the containers over HTTP inside Compose. Verify proxied DNS, HTTPS redirects and TLS 1.2 or newer at both public hostnames. Review registrar and DNSSEC settings before changes. Confirm no public application ports and verify separate rate limits for two visitors through both the API hostname and internal frontend rewrite. Check edge cache bypass, WAF rules and upload limits for the staged paths.
