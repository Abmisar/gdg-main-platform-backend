# Authentication and authorization

The owner-authorized Better Auth/Resend migration replaces Supabase Auth. NestJS is the authentication and authorization authority; Next.js forwards same-origin requests. Supabase Postgres and Storage remain supported. See [migration audit and rollout plan](auth-migration-plan.md), [application auth OpenAPI](better-auth-openapi.yaml), and the installed Better Auth-generated schema at `/api/auth/open-api/generate-schema`.

## Credentials and sessions

Better Auth uses the existing PrismaService/PostgreSQL connection and dedicated `auth_user`, `auth_account`, `auth_session`, `auth_verification`, and `better_auth_rate_limit` tables. Its handler is mounted before Nest body parsing at `/api/auth/*`. Frontend proxy rewrites preserve this prefix, while application requests `/api/account/*` reach `/account/*`.

Email/password requires verified personal email. Verification links, password recovery, welcome and two-step email-change messages use the single Resend SDK service with escaped bilingual HTML and plain text. Arabic is RTL. The user's stored locale selects email language. Google uses the existing Google project credentials via `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; authorize the frontend-origin callback `/api/auth/callback/google`. No magic-link/OTP sign-in plugin is enabled.

Sessions use HttpOnly cookies, SameSite=Lax for OAuth callback navigation, Secure in production. Session cache is disabled, so guards read the database. Logout and password reset revoke database sessions. Better Auth enforces its own CSRF/origin protections. Application mutations with a session require the exact configured frontend origin. On Oracle, Compose supplies exact connector and frontend peer addresses in `TRUSTED_CF_PROXY_IPS` with `TRUST_PROXY_HOPS=0`. Both auth limiters use the Cloudflare visitor header from those peers and the socket address for other callers. Native auth rate limits persist in PostgreSQL, and application signup/recovery limits retain atomic PostgreSQL counters keyed by `BETTER_AUTH_SECRET`.

Supabase JWTs, refresh tokens and old `gdg_access`/`gdg_refresh` cookies are no longer accepted. Users must sign in again after cutover. Supabase email links issued before cutover must be reissued using the new flow.

## Person, membership and roles

`person.auth_user_id` preserves the auth UUID link. The global guard accepts only verified Better Auth identities, reconciles staged signup, and loads active Person/Member rows. A deactivated Person remains unauthorized. An inactive Member retains its Person identity but gets no member permissions. Client cookies, OAuth metadata and supplied role fields never grant permissions.

Unverified signup stores profile choices in `signup_verification`. Those choices are eligible for provisioning for 24 hours. First authenticated application access after verification atomically claims the staged row and creates the Person. Finalization is serialized on the Person row: non-members receive a non-member registration; applicants receive pending committee/global-role requests. Existing approval scopes, self-approval rejection and downstream committee/global permission checks remain unchanged.

A verified Google account without a profile completes the existing registration form. A verified identity may claim an active unlinked Person with the same personal email; this happens only after server-verified inbox/Google identity proof, never from a submitted email alone. Already-linked Person IDs are never reassigned by email. Recovery for an application-only Person creates an unverified auth row; successful reset proves inbox ownership, and subsequent authenticated reconciliation establishes the link.

Personal and university emails remain distinct. University email is profile data, never the credential or an authorization claim. Verified email changes require confirmation at the old address and verification at the new one, reject reserved application email addresses, invalidate outstanding recovery links, and synchronize the personal-email identity on application reconciliation.

## Public signup and recovery

`POST /account/check-email` remains available for legacy clients and answers `PASSWORD_REQUIRED` for every valid email. The frontend can always offer sign-in, signup and recovery. Valid submissions to `POST /account/signup` receive HTTP 201 with `data.emailVerificationRequired` set to `true`. Email/password applicants use this application route. Better Auth excludes the native HTTP signup route from its router and generated schema.

New credentials use the configured Better Auth password policy and hash. One transaction reserves the address and persists the credential and staged application. Repeat submissions preserve the original password and profile choices. The backend dispatches verification after commit. The receipt is independent of email transport. Users can request another verification email from the receipt screen or use password recovery for account setup. Public resend and recovery delivery failures emit an event containing the mail kind.

## Expired signup data

Set `SIGNUP_RETENTION_REPORT_ENABLED=true` to log the counts of expired `signup_verification` and `pending_signup` rows daily at 03:00 UTC. The default is disabled. Each enabled backend replica reports its own observation of the same database. Use one observation per reporting period. A failed query emits `expired_signup_counts_unavailable`. The report uses two aggregate reads and logs the two counts under `expired_signup_counts`.

Expiration controls provisioning eligibility. Physical retention and recovery policy require owner approval. The owner should use the counts to establish a retention window for each staging table, define how an applicant with expired data can resume, and verify restore and purge procedures before enabling deletion. This reporting job only counts rows.

## Imported passwords

The local-only importer reads an owner-exported JSON file containing `users` and `identities`. UUIDs, app links, verified status, locale, bcrypt credential hashes and Google subjects are preserved; sessions and OAuth tokens are not imported. Default mode validates against a local DB without writing. `--apply` is allowed only on loopback outside production. Import conflicts abort the transaction. Reruns preserve changed passwords.

Imported bcrypt is verified with bcrypt, including `$2a$`, `$2b$`, and `$2y$` variants. Successful verification upgrades the hash to Better Auth's current default with a compare-and-swap so a concurrent password reset is not overwritten. New and reset passwords use that default hash. For existing inputs longer than bcrypt's 72-byte boundary (including multibyte passwords), legacy verification semantics are retained and automatic upgrade is deferred to password reset to avoid changing which legacy input is accepted.

## Configuration and verification

Backend-only variables: `BETTER_AUTH_SECRET` (random, at least 32 characters), `BETTER_AUTH_URL` (public frontend origin), `FRONTEND_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, Google credentials, and `DATABASE_URL`. Image storage uses the Supabase URL, a publishable key and a scoped asset-upload token. See [the bucket and credential setup](../SETUP.md). Resend must have the sender domain verified. No frontend auth secrets or Supabase public auth keys are required.

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`; run `pnpm test:auth:local` only with an explicitly selected isolated loopback DATABASE_URL and committed migrations applied. The local integration tests record emails instead of sending them and mock all Google network requests. They cover staged signup, bcrypt import/upgrade, recovery, session revocation, unlinked-person proof, OAuth state/account linking, and two-address email change. Do not run migration/import against production in this workflow.

Google sign-in carries the selected EN/AR locale as presentation-only OAuth state. The user-create hook normalizes that state to `en`/`ar` before storing a new AuthUser; later logins do not overwrite the saved preference. No provider is listed as trusted for unverified-email account linking: a Google identity must have verified email before it can link by email.

Welcome delivery runs after verified email or a successful verified session. An atomic `welcomeSentAt` claim prevents repeated logins and email changes from sending another welcome; failures release the claim for a later login retry. Resend receives a stable per-user idempotency key for that welcome. This adds the nullable `welcomeSentAt` column; apply the migration before deployment. Integration tests cover fresh Arabic and English Google signup, persisted locale, welcome contents and no repeat welcome on subsequent Google login.
