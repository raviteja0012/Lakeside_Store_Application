# Supabase: feature surface

Researched 2026-08-12 against the vendor's live documentation, not from memory. 72 capabilities.

**This is a reference catalog, not a plan.** What we adopt and what we decline, with reasons,
lives in [CAPABILITIES.md](../CAPABILITIES.md). The services actually wired up today live in
[PLATFORM.md](../PLATFORM.md). Re-check anything here before acting on it: vendor pricing and
feature names move, and this is a dated snapshot.

Scope note from the researcher:

> Supabase (researched August 2026 against supabase.com/docs, supabase.com/pricing, supabase.com/changelog, and fdw.dev)


## AI & Vectors

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **AI & Vectors (pgvector)** | Store, index, and query embeddings in Postgres alongside relational data, with semantic, keyword, and hybrid search, plus migration tooling for structured embeddings. Open-source embedding models (e.g. gte-small) can run inside Edge Functions, and there is a Python client, Supabase Vecs, for bulk embedding management. | All plans, no separate charge beyond compute and disk. Documented integrations include OpenAI, Hugging Face, LangChain, and Amazon Bedrock. Index-type specifics (HNSW vs IVFFlat) are on the pgvector sub-pages rather than the AI overview. | GA |
| **Automatic embeddings** | A documented pattern that keeps embeddings current automatically by wiring together Edge Functions, pgmq, pg_net, and pg_cron so inserts and updates enqueue re-embedding work. Removes the need for an external embedding pipeline. | All plans; you pay only for the underlying Edge Function invocations, compute, and your embedding provider. | GA |

## APIs

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Data API / PostgREST** | Auto-generated REST API at https://<ref>.supabase.co/rest/v1/ that instantly reflects schema changes and supports CRUD, deep relational selects, Postgres functions, views, materialized views, and foreign tables, all enforced through RLS, roles, and grants. Can be hardened by exposing only a dedicated api schema, or disabled entirely so no auto-generated endpoints respond. | All plans, no separate charge (usage counts toward egress). Supabase has stated it is changing the platform default to revoke automatic grants to anon/authenticated/service_role so exposure becomes opt-in. | GA |
| **GraphQL API (pg_graphql)** | Auto-generated GraphQL endpoint at /graphql/v1 reflecting tables, views, materialized views, foreign tables, relationships, and computed fields, resolving in a single database round-trip and honouring RLS, roles, and grants. Accessible from a built-in GraphiQL IDE in Studio, supabase-js, or any HTTP client. | All plans, no separate charge. Note: GraphQL introspection is disabled by default for projects created after June 29, 2026. | GA |

## APIs / Security

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **API keys: publishable and secret keys** | New non-JWT keys replace the legacy anon and service_role JWTs: sb_publishable_... is low-privilege and browser-safe behind RLS, sb_secret_... carries BYPASSRLS and is rejected with HTTP 401 from browsers. Both systems work in parallel during migration and secret keys can be rotated from the dashboard. | All plans, no cost. Legacy anon/service_role keys are deprecated and stop working by December 31, 2026. | GA |

## Analytics / Data movement

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Supabase Pipelines (ETL / CDC)** | Managed change-data-capture that reads Postgres logical replication, copies existing tables, then streams inserts, updates, deletes, and truncates to an analytical destination, now with automatic detection and application of column add/remove/rename schema changes. Configured entirely in the dashboard. | Public alpha on all paid plans (announced July 21, 2026). Alpha pricing: $0.053 per hour per configured pipeline, $0.60/GB for initial sync, $3/GB for ongoing changes; Supabase says pricing may change with notice. BigQuery is the only generally available destination; ClickHouse, Snowflake, and DuckLake/DuckDB are request-only. | Public alpha |

## Auth

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Anonymous sign-ins** | Creates a real session with no email, password, or PII, so users can try an app before registering, then upgrade by verifying an email/phone or calling linkIdentity() for OAuth. Anonymous users hold the authenticated Postgres role but carry an is_anonymous JWT claim for RLS branching. | All plans; rate-limited to 30 requests/hour per IP (not customizable). Supabase strongly recommends invisible CAPTCHA or Cloudflare Turnstile. Whether anonymous users count toward billed MAU is not stated on the anonymous sign-in page. | GA |
| **Auth Hooks** | Six hook points implemented as Postgres functions or HTTP endpoints: Before User Created, Custom Access Token, Send SMS, Send Email, MFA Verification Attempt, and Password Verification Attempt. HTTP hooks follow the Standard Webhooks spec with webhook-id / webhook-timestamp / webhook-signature headers. | Before User Created, Custom Access Token, Send SMS, and Send Email are available on Free and Pro. MFA Verification Attempt and Password Verification Attempt require Team or Enterprise. Limits: 20 KB HTTP payload, 2s Postgres timeout, 5s HTTP timeout, up to 3 retries on 429/503. | GA |
| **Auth rate limits and custom SMTP** | Token-bucket rate limits protect the auth server: 1,800 token-refresh requests/hour per IP with bursts to 30, 30 anonymous sign-ins/hour per IP, project-wide OTP default of 30/hour, and a 60-second per-user window on signup confirmations. The built-in email provider sends only 2 emails per hour, so production requires custom SMTP. | All plans. Per-IP limits are not customizable; per-user and project-wide limits are adjustable in the dashboard or Management API. Team/Enterprise can request rate-limit increases via support. | GA |
| **Custom claims and RBAC** | The Custom Access Token hook injects roles and permissions from user_roles / role_permissions tables into the JWT before issuance, so RLS policies can authorize with an authorize() helper reading the claim. Claims appear in the access token but not the auth response, so clients decode the token (e.g. jwt-decode) to read them. | All plans (Custom Access Token hook is Free and Pro eligible), no cost. | GA |
| **Email, password, magic link and OTP auth** | Core Supabase Auth sign-up and sign-in with email/password, passwordless magic links, and one-time passwords over email or phone. Sessions use JWTs with refresh tokens and multi-device sign-in. | Billed by MAU: 50,000 included on Free, 100,000 on Pro/Team, then $0.00325/MAU. | GA |
| **Enterprise SSO (SAML 2.0)** | Connect any SAML 2.0 IdP for SP-initiated (signInWithSSO) or IdP-initiated login, configured from the CLI with a metadata XML file or URL. Attribute mappings pull email, name, and groups from assertions into JWT custom claims and auth.identities. | Pro Plan and above. 50 SSO MAUs included, then $0.015 per SSO MAU. | GA |
| **Multi-factor authentication (TOTP and phone)** | Enrol app-authenticator TOTP factors or SMS factors, with the assurance level surfaced as the aal claim (aal1 vs aal2) so RLS and app logic can require a second factor. You build the enrollment and challenge UI against the MFA API. | TOTP MFA is included on all plans. Phone/SMS MFA is the Advanced MFA - Phone add-on: $75/mo for the first project, $10/mo per additional project. | GA |
| **Passkeys (WebAuthn)** | Passwordless, phishing-resistant sign-in using Face ID, Touch ID, Windows Hello, a device PIN, or a hardware key, with Supabase Auth storing only the public key. auth.registerPasskey() and auth.signInWithPasskey() run the full WebAuthn ceremony, and discoverable credentials mean no email prompt is needed up front. | Launched in beta May 28, 2026. Experimental and requires explicit opt-in; needs supabase-js v2.105.0+, supabase_flutter v2.15.0+, or supabase-swift v2.48.0+. No separate charge documented. | Beta / experimental |
| **Phone / SMS auth** | SMS-based sign-in and OTP delivery through third-party gateways. Supported providers are MessageBird, Twilio, and Vonage. | All plans; you pay the SMS provider directly. Auth-side project OTP default is 30/hour (customizable) with a 60-second per-user window. | GA |
| **Social / OAuth providers** | Nineteen built-in social providers: Apple, Azure, Bitbucket, Discord, Facebook, Figma, GitHub, GitLab, Google, Kakao, Keycloak, LinkedIn, Notion, Slack, Spotify, Twitter, Twitch, WorkOS, and Zoom. Any other OAuth2 or OIDC-compatible IdP can be added through Custom OAuth/OIDC Providers. | All plans; counts toward the standard MAU quota with no per-provider fee. | GA |
| **Third-party auth (Clerk, Firebase, Auth0, Cognito, WorkOS)** | Supabase's APIs trust asymmetrically signed JWTs issued by Clerk, Firebase Auth, Auth0, AWS Cognito, or WorkOS, so external identity works against Data API, Storage, Realtime, and Functions with RLS intact, without migrating users. Symmetric signing is unsupported and key rotation takes up to 30 minutes to propagate. | $0.00325 per Third-Party MAU beyond the plan quota. Supabase Auth itself cannot be disabled. | GA |

## Auth / Security

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **JWT signing keys (asymmetric)** | Projects can sign JWTs with asymmetric keys (ECC P-256 or RSA) instead of the shared HS256 secret, publishing public keys at /.well-known/jwks.json so clients verify locally with getClaims() and no shared secret can be leaked. Supabase explicitly warns that HS256 shared secrets enable user impersonation and create SOC 2 / HIPAA compliance risk. | All plans, no cost documented. The JWKS endpoint is edge-cached for 10 minutes, so wait at least 20 minutes before revoking a rotated key. | GA |

## Compliance

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **HIPAA compliance add-on** | Requires a signed BAA with Supabase, dedicated HIPAA-flagged projects, and adherence to security advisor guidance including keeping Postgres connection logging enabled. Supabase holds BAAs with its own vendors (e.g. AWS) that touch ePHI, and audits SOC 2 and HIPAA annually. | Listed on the pricing page as an add-on available on the Team plan (and Enterprise). Exact add-on price is not published; contact sales. Self-hosted Supabase is explicitly not HIPAA-compliant out of the box. | GA |
| **SOC 2 and ISO 27001** | The hosted platform carries SOC 2 controls across all environments with annual audits, and the pricing page lists SOC 2 and ISO 27001 certification against the Team plan. Continuous monitoring runs between audit periods. | Team plan ($599/mo) and Enterprise. Included, no separate add-on price. | GA |

## Database

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Daily backups** | Automatic daily physical backups (snapshots of the database directory) for paid projects, restorable from the dashboard with downtime proportional to database size. Custom role passwords are not included and must be reset after a restore. | Free: none (manual CLI db dump only, and backup downloads are unavailable). Pro: 7 days. Team: 14 days. Enterprise: up to 30 days. Included in the plan price. | GA |
| **Database Webhooks** | A dashboard wrapper over triggers plus pg_net that fires an async HTTP POST or GET with a JSON payload on INSERT, UPDATE, or DELETE, without blocking the write. Payloads carry table, schema, event type, and old/new records; call history lands in the net schema. | All plans, no separate charge. Only HTTP targets are supported (Edge Functions are called as an HTTP target). | GA |
| **Database functions and triggers** | Write PL/pgSQL or SQL functions callable over the Data API as RPC, and attach BEFORE/AFTER triggers on INSERT/UPDATE/DELETE. Underpins auth hooks, database webhooks, and broadcast-from-database. | All plans, no cost. | GA |
| **Dedicated pooler (PgBouncer)** | A PgBouncer instance co-located with your Postgres database for lower-latency transaction-mode pooling than the shared Supavisor pooler. Transaction mode only. | Paid plans only. No separate line-item price found; uses IPv6 by default or IPv4 with the add-on. | GA |
| **Foreign Data Wrappers (Supabase Wrappers)** | Query external systems as if they were Postgres tables. Native wrappers cover Airtable, Auth0, AWS Cognito, BigQuery, ClickHouse, DuckDB, DynamoDB, Firebase, Iceberg, Logflare, MongoDB, MySQL, Redis, S3 (CSV/JSON/Parquet), S3 Vectors, Stripe, and SQL Server; Wasm wrappers add Cal.com, Calendly, Clerk, Cloudflare D1, Gravatar, HubSpot, Infura, Notion, OpenAPI, Orb, Paddle, Shopify, Slack, and Snowflake. | All plans, no separate charge. Per-wrapper maturity/status is not published on fdw.dev's index page. | GA (framework); individual wrappers vary |
| **Full-text search** | Postgres tsvector/tsquery search with to_tsvector, to_tsquery, and websearch_to_tsquery for Google-style syntax, accelerated by GIN indexes on a generated tsvector column. Exposed in supabase-js via .textSearch(). | All plans, no cost. | GA |
| **Generated columns** | Postgres STORED generated columns compute a value from other columns automatically. Commonly used for a maintained tsvector search column so full-text indexes stay in sync without triggers. | All plans, no cost. | GA |
| **Managed Postgres** | Every project is a full dedicated Postgres instance with superuser-adjacent access via the SQL editor, roles, and direct connections. Major-version upgrades run via pg_upgrade with downtime; free projects also pick up minor versions when a paused project is restored. | All plans; cost is the compute add-on plus disk. Could not verify the exact default Postgres major version for August 2026 from the upgrade docs. | GA |
| **Point-in-Time Recovery (PITR)** | Combines physical backups with WAL archiving every two minutes to restore to any second within the retention window, giving a worst-case RPO of two minutes. Enabling PITR replaces daily backups. | Add-on for Pro, Team, and Enterprise; requires at least a Small compute add-on. 7-day retention $0.137/hr (~$100/mo), 14-day $0.274/hr (~$200/mo), 28-day $0.55/hr (~$400/mo). | GA |
| **Postgres extensions (50+ preinstalled)** | Over 50 extensions are preconfigured and toggled on per project from the dashboard or with CREATE EXTENSION, including pgvector, PostGIS, pg_cron, pgmq, pg_net, pg_stat_statements, pgTAP, pg_graphql, pgsodium/Vault, and postgis_tiger_geocoder. Additional extensions can be installed from the database.dev package manager. | Included on all plans at no extra charge. Note: extension version pinning was deprecated in a July 22, 2026 changelog entry. | GA |
| **Read Replicas** | Additional read-only Postgres databases kept asynchronously in sync with the primary, for load balancing, geographic latency reduction, and workload isolation. Replicas serve SELECT only and carry replication lag; Supabase advises exhausting compute scaling and indexing first. | Paid plans (docs' billing examples use Pro). Each replica bills mirrored compute at the primary's size, disk at a 1.25x multiplier for WAL archives, plus inherited IOPS/throughput and its own IPv4 charge. A bare single replica example totals about $46.25/mo; two replicas with IPv4 and provisioned IOPS/throughput reached ~$427/mo. Not covered by Spend Cap and compute credits do not apply. | GA |
| **Row Level Security (RLS)** | Postgres-native per-row authorization policies that Supabase wires to the JWT, so the same policy protects the REST API, GraphQL, Realtime, Storage, and direct SQL. Anonymous users run as the authenticated role but carry an is_anonymous claim policies can branch on. | All plans, no cost. Required in practice whenever the Data API is exposed. | GA |
| **Supabase Cron (pg_cron)** | Schedule recurring jobs in Postgres with cron syntax, from every second to once a year, running SQL, database functions, or HTTP calls via pg_net (the standard way to invoke Edge Functions on a schedule). Job definitions live in cron.job and run history in cron.job_run_details, with a dashboard UI under Integrations. | All plans, no separate charge. Supabase recommends no more than 8 concurrent jobs and a 10-minute ceiling per job. | GA |
| **Supabase Queues (pgmq)** | A Postgres-native durable message queue with guaranteed delivery and exactly-once semantics inside a configurable visibility window, plus optional archiving for audit. Managed in the dashboard, with granular authorization through API permissions and RLS. | All plans, no separate charge beyond the database resources consumed. Queue variants (unlogged/partitioned) and any per-message pricing were not stated in the overview docs. | GA |
| **Supabase Vault** | Encrypted secret storage inside Postgres using libsodium AEAD, with the root key held outside the database so secrets stay encrypted on disk, in backups, and in replication streams. Secrets live in vault.secrets and are read through the vault.decrypted_secrets view, typically to hold credentials for pg_net, cron jobs, and webhooks. | All plans, no cost. | GA |
| **Supavisor connection pooling** | A shared Postgres pooler offering session mode on port 5432 (persistent connections, IPv4-reachable on every tier) and transaction mode on port 6543 for serverless and edge workloads. Transaction mode does not support prepared statements, so they must be disabled client-side. | All plans, no separate charge. Pooler client limits scale with compute: 200 (Micro) up to 12,000 (16XL). | GA |
| **Table partitioning** | Native Postgres declarative partitioning by range, list, or hash to split large tables for faster queries, easier archival, and cheaper vacuum/index maintenance. Supabase documents native partitioning as preferable to pg_partman for performance. | All plans, no cost. pg_partman is referenced as an external management helper. | GA |

## Database / DevEx

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Branching (preview and persistent branches)** | Spins up a separate Supabase instance per branch with its own API credentials, running migrations, seeds, and Edge Function deploys; preview branches are auto-deleted when a PR merges or closes while persistent branches survive for staging or QA. Integrates with GitHub so pushes to main deploy to production. | Available on any plan, billed purely as usage on the branch's own compute, egress, disk, and storage. Default Micro compute is $0.01344/branch-hour (~$9.86/mo if left running). Not covered by Spend Cap; compute credits do not apply. | GA |

## Database / Observability

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Security Advisor and Performance Advisor** | Automated lint suites (29 documented checks) that flag missing RLS, auth.users exposure through views, security-definer risks, public bucket enumeration, GraphQL schema leakage, unindexed foreign keys, unused and duplicate indexes, table bloat, and extension placement. They run automatically and can be re-run manually from the dashboard. | All plans, no cost. No plan restriction documented. | GA |

## Developer tools

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Management API** | REST API for programmatic project and organization administration: creating projects, reading and updating configuration, managing SSO connections, and adjusting customizable auth rate limits. Authenticated with a Personal Access Token. | All plans, no separate charge. Note: the logs.all endpoint is migrating to logs (July 23, 2026 changelog). | GA |
| **Supabase CLI and local development** | Runs the full stack (Postgres, Auth, Storage, and more) locally in Docker for offline, quota-free, isolated development, and handles migrations, secrets and environment variables, TypeScript type generation from the schema, and deployment to the hosted platform. Also the tool used to configure SAML SSO connections and network restrictions. | Free and open source; local usage consumes no plan quota. Declarative schemas, seeding, config.toml details, and pgTAP testing are documented on the CLI getting-started pages rather than the local-development overview. | GA |
| **Supabase MCP server** | Lets AI assistants query and operate a Supabase project over the Model Context Protocol, with tool groups for Database, Debugging (logs and advisors), Development (API URLs, keys, type generation), Edge Functions, Account, Docs, Branching, and Storage. Read-only mode runs everything as a read-only Postgres user and project scoping via project_ref confines access to one project. | Free; hosted at https://mcp.supabase.com/mcp with a local endpoint at http://localhost:54321/mcp via the CLI. The Branching tool group requires a paid plan; Storage tools are disabled by default; Account tools are disabled in project-scoped mode. | GA |

## Edge Functions

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Edge Function background tasks** | EdgeRuntime.waitUntil(promise) returns a response immediately while work continues in the background, with beforeunload and unhandledrejection events for shutdown handling and error capture. Locally you must set policy = "per_worker" under [edge_runtime] in config.toml for tasks to finish. | All plans, no extra charge. Background work is still capped by the same wall-clock, CPU, and memory limits. | GA |
| **Edge Function ephemeral storage** | A writable /tmp directory reachable through Deno FS APIs or node:fs that resets on every invocation, for unzipping archives, transforming images, or streaming large files past the memory ceiling. Nothing persists after the invocation ends. | Free projects: up to 256 MB. Paid projects: up to 512 MB. No separate charge. | GA |
| **Edge Function regional invocation** | By default functions run nearest the caller; you can pin execution with the region option in functions.invoke(), the x-region header, or the forceFunctionRegion query parameter for CORS and webhook callers. 16 regions are available across Asia Pacific, North America, Europe, and South America. | All plans, no extra charge. Pinning disables automatic failover during a regional outage. | GA |
| **Edge Function runtime limits** | Each request gets 2 seconds of actual CPU time (async I/O excluded) and 256 MB of memory, with a 150-second request idle timeout before a 504. Worker wall-clock lifetime differs by plan. | Wall clock: 150s on Free, 400s on paid plans. Script size: 20 MB with local CLI bundling, 5 MB with server-side bundling. Per-payload request/response size limits are not documented. | GA |
| **Edge Functions** | Globally distributed Deno/TypeScript serverless functions deployed from the dashboard, CLI, or MCP, with project secrets exposed as environment variables and invocation logs and metrics in the dashboard. Intended for short-lived idempotent work such as webhooks, AI calls, email, and bots. | Free: 500,000 invocations/mo and up to 100 functions. Pro/Team: 2M invocations included then $2 per million; 500 functions on Pro, 1,000 on Team, unlimited on Enterprise. | GA |
| **Scheduled Edge Functions** | Functions are scheduled by combining pg_cron with pg_net: cron.schedule() runs a net.http_post() against the function URL on a cron expression. Auth tokens for the call should live in Supabase Vault rather than inline SQL. | All plans, no extra charge beyond invocation counts. No native (non-cron) scheduler is documented. | GA |

## Observability

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Log Drains** | Ships the entire Supabase log stack to external destinations: custom HTTP endpoint, OpenTelemetry (OTLP), Datadog, Grafana Loki, Amazon S3, Sentry, Axiom, Last9, and Syslog over TCP/TLS. HTTP destinations receive batched POSTs of at most 250 events or 1-second intervals. | Pro, Team, and Enterprise only. $60 per drain per month, plus $0.20 per million events and $0.09/GB egress. | GA |
| **Log Explorer** | ClickHouse-backed SQL querying across every log source: API/edge gateway, Postgres (with pgAudit), Auth, Storage, Realtime (off by default), Edge Functions (invocation and console), PostgREST, Supavisor, and PgBouncer. Every line is a row in a logs table tagged by source, with structured fields under log_attributes. | All plans; retention is the gate. Free: 1 day. Pro: 7 days. Team: 28 days. Enterprise: 90 days. Queries are capped at 1,000 rows. | GA |
| **Reports** | Prebuilt observability dashboards for API Gateway, Auth, Database, Edge Functions, PostgREST, Realtime, and Storage, covering request volume, error rates, latency, memory/CPU/IOPS, connections, cache hit rate, and regional distribution. Cloud-only; not available on self-hosted. | All plans, but time-range lookback is tiered: Free is limited to 24 hours, Enterprise up to 28 days. Advanced telemetry for detailed database metrics is Team and Enterprise only. | GA |

## Plans & billing

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Compute add-ons (Nano through 16XL)** | Sizes the dedicated Postgres instance behind a project, from a shared-CPU Nano on Free up to a 64-core / 256 GB 16XL. Nano through Medium use shared burstable CPU; Large and above get dedicated CPU. | Free = Nano (shared CPU, ~0.5 GB RAM). Paid: Micro $10, Small $15, Medium $60, Large $110, XL $210, 2XL $410, 4XL $960, 8XL $1,870, 12XL $2,800, 16XL $3,730 per month, billed hourly. Pro/Team include a $10/mo compute credit (one Micro). | GA |
| **Disk configuration (gp3 general purpose vs io2 high performance)** | Lets you scale database disk size, IOPS, and throughput independently of compute. Disk size can only be increased, and modifications are limited to four in any rolling 24-hour window. | gp3: 8 GB and 3,000 IOPS and 125 MB/s included, then $0.125/GB, $0.024/IOPS, $0.095/MB-s; max 16 TB. io2: $0.195/GB, $0.119/IOPS, throughput auto-scales; max 60 TB. Paid plans. | GA |
| **Included quotas and overage rates** | Each plan bundles MAUs, database disk, egress, and file storage, with metered overage beyond. Free: 50,000 MAU, 500 MB database, 5 GB egress + 5 GB cached egress, 1 GB file storage. | Pro/Team include 100,000 MAU then $0.00325/MAU; 8 GB disk then $0.125/GB; 250 GB egress then $0.09/GB; 250 GB cached egress then $0.03/GB; 100 GB file storage then $0.0213/GB. | GA |
| **Plan tiers (Free / Pro / Team / Enterprise)** | Four subscription tiers gate quotas and features across the whole platform; Free pauses projects after 1 week of inactivity and caps you at 2 active projects. Team adds SOC 2 / ISO 27001 posture, longer backups and logs, and priority support with SLAs. | Free $0/mo; Pro $25/mo (includes $10/mo compute credit); Team $599/mo (includes $10/mo compute credit); Enterprise custom. | GA |
| **Spend Cap** | Blocks further usage of a metered item once its quota is exhausted rather than billing overage, covering about twelve items including disk, storage size, egress, MAUs, realtime messages and peak connections, edge function invocations, logs, and image transformations. It explicitly excludes opt-in items: compute, read replicas, custom domains, branching, IPv4, and provisioned IOPS. | Pro Plan feature (Free plan never incurs charges). No cost to enable. No per-item budgets or threshold alerts. | GA |

## Platform

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Custom domains and vanity subdomains** | Serve your project's APIs from api.example.com instead of <ref>.supabase.co, which matters for OAuth callbacks, webhooks, and API portability; vanity subdomains are a lighter option giving my-brand.supabase.co with CLI setup and no DNS work. The original Supabase domain keeps working either way. | Custom domain: paid add-on on any paid plan, $10 per domain per month per project. Vanity subdomain: paid organization, marked experimental, no separate price found. Not covered by Spend Cap. | GA (custom domains); experimental (vanity subdomains) |
| **IPv4 address add-on** | Assigns a dedicated IPv4 address for direct database connections, since direct and dedicated-pooler connections are IPv6 by default. Enabling it makes the endpoint IPv4-only rather than dual-stack. | Pro Plan and above. $0.0055 per hour (about $4/month) per address, billed hourly with partial hours rounded up. Each read replica gets and bills its own IPv4. Not covered by Spend Cap. | GA |

## Platform / Security

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Network restrictions and SSL enforcement** | CIDR allowlists (IPv4 and IPv6) restrict who can open a Postgres connection, applied to all connection routes, pooled or direct; SSL enforcement requires encrypted connections. They do not cover HTTPS APIs like PostgREST, Storage, and Auth, or supabase-js. | Listed on the production checklist as required for database security; the docs page does not state a plan requirement. No separate charge found. Caveat: with restrictions on, Edge Functions lose direct database access and must use supabase-js. | GA |
| **Temporary token-based database access** | Admins grant time-boxed database access through Personal Access Tokens with role scoping and expiry up to 90 days, so a password never has to be shared. Shipped May 25, 2026. | Plan requirement and pricing not stated in the changelog entry I could reach. | GA (shipped May 2026) |

## Realtime

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Realtime Broadcast** | Low-latency pub/sub messaging over WebSocket, via REST/HTTP send, or straight from the database with realtime.send() and realtime.broadcast_changes(). Supports message acknowledgements, self-send loopback, binary payloads (ArrayBuffer/Uint8Array on supabase-js 2.91.0+), and replay of history on private channels via since/limit (messages retained roughly 72-96 hours). | Free: 2M messages/mo included. Pro/Team: 5M/mo then $2.50 per million. Binary payload support shipped June 11, 2026. | GA |
| **Realtime Postgres Changes** | Streams INSERT/UPDATE/DELETE events from Postgres logical replication to subscribed clients, filtered by schema, table, and column value. RLS applies to which rows a client may see. | Included with Realtime, no separate charge. Supabase generally steers high-scale workloads toward Broadcast-from-database instead. | GA |
| **Realtime Presence** | Synchronizes ephemeral per-client state across everyone on a channel, for who's-online indicators, active participant lists, and shared cursors. State is replicated between Realtime nodes rather than stored in Postgres. | Included with Realtime; counts toward the message and concurrent-connection quotas. | GA |
| **Realtime authorization (private channels)** | Channels are public (anyone may subscribe unauthenticated) or private, where subscription and send are gated by RLS policies written against realtime.messages. This is the mechanism that makes broadcast-from-database safe for multi-tenant apps. | All plans, no cost. Note the realtime schema was locked against user modification in a July 14, 2026 change. | GA |
| **Realtime quotas** | Hard per-plan ceilings on concurrent connections, messages per second, channel joins per second, channels per connection, and broadcast payload size. Exceeding them throttles or rejects connections rather than silently degrading. | Free: 200 concurrent connections, 100 msg/s, 100 joins/s, 100 channels/connection, 256 KB payload. Pro: 500 / 500 / 500 / 100 / 3,000 KB. Pro without spend cap and Team: 10,000 / 2,500 / 2,500 / 100 / 3,000 KB. Enterprise: customizable. Concurrent-connection overage on Pro/Team is $10 per 1,000. | GA |

## Storage

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Image transformations** | On-the-fly resize (1-2500 px), quality (20-100), resize mode (cover/contain/fill), and format conversion across PNG, JPEG, WebP, AVIF, GIF, ICO, SVG, BMP, TIFF (HEIC source only). Automatically serves WebP to capable clients with no code change; AVIF output is described as forthcoming. | Pro Plan and above. 100 origin images included per month on Pro/Team, then $5 per 1,000 origin images; Enterprise custom. Source images capped at 25 MB and 50 megapixels. | GA |
| **Resumable uploads (TUS)** | Implements the TUS protocol so interrupted uploads resume from the last completed chunk rather than restarting, with progress tracking. Recommended for files over 6 MB and unstable networks. | All plans. Fixed 6 MB chunk size, upload URLs valid up to 24 hours, one client per URL (concurrent attempts get 409). Use the direct storage hostname project-id.storage.supabase.co for best throughput. | GA |
| **S3-compatible Storage protocol** | Exposes Storage at https://<ref>.storage.supabase.co/storage/v1/s3 so any S3 SDK or tool works against it. Server-side S3 access keys grant full access across all buckets and bypass RLS, while session-token auth (project ref as access key, anon key as secret, user JWT as session token) scopes operations to the authenticated user under RLS. | All plans, no separate charge. The new publishable key is not yet supported for session-token S3 auth. | GA |
| **Smart CDN** | Global CDN across 285+ cities that syncs asset metadata to the edge so caches revalidate automatically when a file changes or is deleted, raising hit rate even across differing query strings. Invalidation propagates in up to 60 seconds; browser TTL is controlled by cacheControl at upload (default about one hour). | Smart CDN is automatically enabled on Pro Plan and above; Free projects get the basic CDN. No separate charge, but cached egress is metered ($0.03/GB over 250 GB on Pro/Team). | GA |
| **Storage: file buckets with RLS** | S3-backed object storage for media and documents, with public buckets served by direct URL and private buckets guarded by row-level security policies on storage.objects. Buckets can restrict allowed MIME types and set their own size ceiling below the project global limit. | Free: 1 GB storage and a 50 MB global upload limit. Pro/Team: 100 GB included then $0.0213/GB, with a global upload limit up to 500 GB. Enterprise: custom. | GA |

## Storage / AI

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Vector Buckets** | S3-backed durable storage for embeddings with built-in k-NN similarity search, cosine and other distance metrics, and metadata filtering, sized for tens of millions of vectors per index. Positioned as the archival/scale tier complementing pgvector's low-latency transactional tier, reachable from JS SDK methods or from Postgres via foreign data wrappers. | Public Alpha, Pro tier and above, in 5 regions (us-east-1, us-east-2, us-west-2, eu-central-1, ap-southeast-2). Free to use under a fair-use policy during Public Alpha; egress is still charged. | Public alpha |

## Storage / Analytics

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Analytics Buckets (Apache Iceberg)** | Iceberg-format buckets for large analytical datasets, data warehousing, historical archives, and complex aggregations, kept off the transactional Postgres instance. Pairs with the Iceberg foreign data wrapper and Supabase Pipelines. | Early/experimental. Supabase's own docs warn to 'expect rapid changes, limited features, and possible breaking updates.' No pricing, capacity limits, or plan requirement published as of this research. | Alpha / experimental |
