# AWS → GCP Migration Spec

Status: **Draft — revised for review, no infra changes made yet**
Scope: Migrate `ielts-ai-platform` off AWS (ECS/EC2 + RDS + ElastiCache + ALB + CloudFront + Cognito + S3 + Bedrock/Transcribe/Polly) onto GCP, replacing the entire Terraform stack in `infra/`.

**Situation (2026-08-12):** The AWS account is blocked and fully inaccessible — no console, no CLI, no data access (confirmed: cannot pull an RDS snapshot, list S3 objects, or export Cognito users). No local/CI backup of production data exists either. This is treated as a **fresh start on GCP, not a data migration** — there is nothing to carry over. If AWS account access is later recovered (a support/recovery case is worth filing in parallel, independent of this work), a real data-import pass could follow as a separate, optional effort; nothing in this plan depends on that happening. This materially simplifies §4, §6, and §7 below versus the original draft.

Decisions locked in for this spec (confirmed with stakeholder):
- **Compute:** Cloud Run (not GKE) — serverless, no cluster/ASG to operate, native WebSocket support.
- **Auth:** Identity Platform (not self-hosted) — managed identity, Google IdP, and MFA. **Browser flow: Firebase Auth SDK with a custom UI** (not FirebaseUI, not a hand-rolled OIDC flow) — fastest to implement and the natural fit since Identity Platform is Firebase Auth under the hood. Token verification moves from the load balancer into the NestJS app, since GCP load balancers have no Cognito-ALB-style OIDC gate.
- **AI services:** Vertex AI (Model Garden Claude, Speech-to-Text, Text-to-Speech) replacing Bedrock/Transcribe/Polly — keeps the "cloud-managed AI" pattern instead of switching to third-party APIs.
- **Terraform layout:** new stack lives in `infra-gcp/`, alongside the existing `infra/` (AWS). `infra/` stays untouched and unused as a historical/rollback reference; delete it only after the GCP stack is confirmed stable in production.

---

## 1. Current AWS Architecture (baseline)

Region: `ap-southeast-2` (Sydney), CloudFront cert in `us-east-1`. Domain: `neu-study.online` (Route 53).

| Layer | AWS Service | Notes |
|---|---|---|
| DNS | Route 53 | Hosted zone, alias records to ALB + CloudFront |
| TLS | ACM | Wildcard cert `*.neu-study.online`, one per region (ALB + CloudFront) |
| Network | VPC, public/private subnets, IGW, NAT Gateway, security groups | Foundation for everything else |
| Container registry | ECR | `ielts-ai-api`, `ielts-ai-web` |
| Compute | ECS on EC2 (ASG + launch template), 2 services (`api`, `web`) + 1 one-off migrate task | `hostPort=0` dynamic port mapping, `bridge` network mode |
| Load balancing | ALB | Host-based routing (`api.*` → API target group, default → Web target group), Cognito OIDC auth at listener, sticky sessions for Socket.IO |
| CDN | CloudFront | Fronts `web.*` only (origin = ALB, not S3); long-cache `/​_next/static/*` |
| Database | RDS PostgreSQL | Single instance, `db.t3.micro` |
| Cache/pubsub | ElastiCache Redis | Socket.IO adapter (`@socket.io/redis-adapter`), presence (`chat:presence:{uid}`, TTL 120s), typing indicators |
| Object storage | S3 | User uploads (audio/images), presigned URLs |
| Auth | Cognito | User Pool, Google social IdP, ALB app client (confidential) + frontend app client (PKCE) + backend app client, pre-signup Lambda for account linking |
| AI — LLM | Bedrock (Claude, `us-east-1`) | Falls back to OpenRouter if `OPENROUTER_API_KEY` set |
| AI — STT | Transcribe Streaming | Speaking/pronunciation gateways |
| AI — TTS | Polly | Pronunciation practice |
| Serverless | Lambda | Cognito pre-signup hook |
| Logs | CloudWatch Logs | `/ecs/ielts-ai/api`, `/ecs/ielts-ai/web` |
| CI/CD identity | IAM OIDC role | GitHub Actions assumes role via OIDC, no stored keys |
| IaC | Terraform, `infra/modules/*` (13 modules) | State backend: `backend "s3"`, see `infra/backend.tf` |

App-code AWS SDK touchpoints (`apps/api/package.json` + `apps/api/src/`):
- `@aws-sdk/client-bedrock-runtime` → `apps/api/src/bedrock/bedrock.service.ts`
- `@aws-sdk/client-transcribe`, `client-transcribe-streaming` → `speaking.gateway.ts`, `pronunciation.gateway.ts`
- `@aws-sdk/client-polly` → `pronunciation/tts.service.ts`
- `@aws-sdk/client-s3`, `s3-request-presigner` → `chat/chat-upload.service.ts`, `upload/upload.service.ts`
- `@aws-sdk/client-cognito-identity-provider` → auth module (not listed above but implied by Cognito env vars)

CI/CD: `.github/workflows/deploy-api.yml` and `deploy-web.yml` — build → push ECR → render task def → `ecs run-task` (migrations) → `ecs deploy` → CloudFront invalidation (web only).

---

## 2. Target GCP Architecture

Proposed region: **`asia-southeast1` (Singapore)**. Compare with `australia-southeast1` (Sydney) before proceeding; see the decision criteria in §8.

> **Correction:** GCP also provides Cloud Run in `australia-southeast1` (Sydney). Region selection must be based on measured latency, Cloud SQL/Memorystore co-location, Vertex AI model availability, egress cost, quota, and data-residency requirements—not on the assumption that Sydney is unavailable.

| Layer | AWS Service | GCP Replacement | Notes |
|---|---|---|---|
| DNS | Route 53 | **Cloud DNS** | Re-delegate domain NS records at registrar; keep TTLs low during cutover |
| TLS | ACM | **Google-managed SSL certificates** | Attached to the external HTTPS Load Balancer; no region split needed (single global LB) |
| Network | VPC/subnets/NAT/SGs | **VPC + Direct VPC egress or Serverless VPC Access connector** | Cloud Run is serverless — no ASG/EC2/launch template needed. Choose the egress method based on whether Memorystore and/or Cloud SQL use private IPs; configure Cloud NAT only if the selected routing requires it. |
| Container registry | ECR | **Artifact Registry** | Docker repos: `ielts-ai-api`, `ielts-ai-web` |
| Compute | ECS/EC2 | **Cloud Run** (2 services: `api`, `web`) + **Cloud Run Jobs** (1 job: `migrate`) | No cluster, no instances, no dynamic port mapping — Cloud Run handles all of that. Scales to zero when idle (cost win for a thesis-scale project) or set `min-instances=1` to avoid cold starts. |
| Load balancing + CDN | ALB + CloudFront | **External HTTPS Load Balancer** with **Serverless NEGs** (one per Cloud Run service) + **Cloud CDN** enabled on the web backend only | Single LB replaces both ALB and CloudFront: URL map does host-based routing (`api.*` → API NEG, `web.*`/default → Web NEG), Cloud CDN caches `/_next/static/*` the same way CloudFront did. One static global IP. |
| WebSocket / sticky sessions | ALB sticky sessions | **Cloud Run session affinity** (best effort) + Redis Socket.IO adapter + reconnectable application sessions | Cloud Run supports WebSockets natively, but affinity is not a guarantee. Redis synchronizes Socket.IO events; it does not recover process-local audio/transcription sessions. |
| Database | RDS PostgreSQL | **Cloud SQL for PostgreSQL** | Choose public-IP Cloud SQL connector or private-IP Direct VPC egress/VPC connector explicitly. Configure pool limits and Cloud Run max instances to prevent connection exhaustion. |
| Cache/pubsub | ElastiCache Redis | **Memorystore for Redis** | Requires the Serverless VPC Access connector (Memorystore has no public IP by design) |
| Object storage | S3 | **Cloud Storage (GCS)** | Signed URLs replace presigned URLs (near drop-in API shape) |
| Auth | Cognito | **Identity Platform** | Identity Platform is not a direct Cognito Hosted UI replacement. Choose Firebase Auth SDK/custom UI or a fully specified OIDC flow. JWT verification moves into NestJS; public clients must not be able to supply trusted identity headers. |
| AI — LLM | Bedrock (Claude) | **Vertex AI Model Garden (Claude)** | Same models, different SDK (`@google-cloud/vertexai` or Anthropic's Vertex SDK variant). OpenRouter fallback path in code can stay as-is. |
| AI — STT | Transcribe Streaming | **Speech-to-Text streaming API** | Comparable streaming gRPC API |
| AI — TTS | Polly | **Text-to-Speech API** | Comparable REST/gRPC API, similar voice-selection model |
| Serverless function | Lambda (pre-signup) | **Identity Platform Blocking Functions** (Cloud Functions gen2) | Direct conceptual equivalent — "before create" / "before sign-in" blocking triggers |
| Logs | CloudWatch Logs | **Cloud Logging** | Automatic for Cloud Run, no config needed |
| Secrets | Task def plaintext env / SSM (unused here) | **Secret Manager** | Recommend moving `DATABASE_URL`, `JWT_SECRET`, `PAYPAL_CLIENT_SECRET`, etc. from plain env vars into Secret Manager, mounted as env vars on the Cloud Run service — tightens what the current ECS setup does today |
| CI/CD identity | IAM OIDC role | **Workload Identity Federation** | Same no-stored-keys pattern, GCP's equivalent primitive |
| IaC | Terraform (AWS provider) | **Terraform (Google provider)** | Same tool, new provider + module rewrite |

### Architecture diagram (target)

```
                    Cloud DNS
                        |
          Google-managed cert (single, multi-SAN)
                        |
        External HTTPS Load Balancer (1 static IP)
           /                              \
   host: api.neu-study.online      host: web.neu-study.online
          |                                |
   Serverless NEG (api)              Serverless NEG (web)
          |                          + Cloud CDN (static assets)
          |                                |
     Cloud Run: api                   Cloud Run: web
    (session affinity)                (Next.js SSR)
          |
   +------+-------+-------------------+
   |              |                   |
Cloud SQL     Memorystore        Cloud Storage
(Postgres)    (Redis, via         (uploads)
              VPC connector)

Identity Platform  ---- JWT verified in NestJS middleware ---- Cloud Run: api
Vertex AI (Claude, STT, TTS)  ---- called from Cloud Run: api
```

---

## 3. Terraform Module Plan

Mirror the existing `infra/modules/*` layout under a new `infra-gcp/modules/*` root (see decision above), one module per concern. The AWS side actually has 13 modules (`acm, alb, cloudfront, cognito, dns, dns-records, ecr, ecs, elasticache, iam, networking, rds, s3`), not 12:

| New module | Replaces | Key resources |
|---|---|---|
| `modules/network` | `networking` | `google_compute_network`, `google_compute_subnetwork`, `google_compute_router` + `google_compute_router_nat`, `google_vpc_access_connector` |
| `modules/dns` | `dns`, `dns-records` | `google_dns_managed_zone`, `google_dns_record_set` |
| `modules/certs` | `acm` (x2) | `google_compute_managed_ssl_certificate` (single cert, multi-domain) |
| `modules/artifact-registry` | `ecr` | `google_artifact_registry_repository` x2 |
| `modules/cloud-sql` | `rds` | `google_sql_database_instance`, `google_sql_database`, `google_sql_user` |
| `modules/memorystore` | `elasticache` | `google_redis_instance` |
| `modules/storage` | `s3` | `google_storage_bucket`, IAM bindings for signed-URL service account |
| `modules/identity-platform` | `cognito` | `google_identity_platform_config`, `google_identity_platform_default_supported_idp_config` (Google IdP), tenant config, blocking function wiring |
| `modules/cloud-run` | `ecs` | `google_cloud_run_v2_service` (api, web), `google_cloud_run_v2_job` (migrate), IAM invoker bindings |
| `modules/load-balancer` | `alb`, `cloudfront` | `google_compute_backend_service` (+ Cloud CDN flag), `google_compute_url_map`, `google_compute_target_https_proxy`, `google_compute_global_forwarding_rule`, `google_compute_region_network_endpoint_group` (serverless NEG) |
| `modules/iam` | `iam` | `google_iam_workload_identity_pool`, provider, service account bindings for GitHub Actions |
| `modules/vertex-ai` | *(new — no AWS equivalent module, was inline SDK calls)* | Enable APIs, service account + roles for Vertex AI / Speech / TTS |

Root `main.tf` wiring follows the same dependency-pipeline pattern already documented in `docs/plans/aws-terraform-guide.md` — network → data/services → cloud-run (depends on artifact-registry, cloud-sql, memorystore, identity-platform, vertex-ai) → load-balancer (depends on Cloud Run NEGs) → DNS records. Certificate provisioning and DNS authorization must complete before traffic cutover.

State backend: `infra/backend.tf` currently uses `backend "s3"` (bucket `ielts-ai-terraform-state-704298683492`, `use_lockfile = true` — native S3 object-lock locking, no DynamoDB table). Move to a **GCS bucket backend** (`terraform { backend "gcs" { bucket = "..." prefix = "..." } }`), which has the equivalent native locking built in (object generation preconditions) — no separate lock resource needed there either. This is a brand-new bucket/state, not a migration of the AWS state file (per §6).

---

## 4. Application Code Changes

### `apps/api`
- **Auth middleware**: confirmed via code read — the API does **not** verify JWTs itself today. `auth/guards/jwt-auth.guard.ts` reads the `x-amzn-oidc-data` header the ALB injects after it terminates the Cognito OIDC flow, and delegates to `AlbJwtService`/`AlbUserService`. Replace this with an Identity Platform ID-token verification guard: verify signature, issuer, project/audience, expiry, token type, and email verification policy in NestJS itself. Strip or reject externally supplied identity headers; only verified token claims may create or resolve a user.
- **The header trust isn't confined to one guard** — five WebSocket gateways read `x-amzn-oidc-data` directly for their own auth, not just via the shared guard: `chat.gateway.ts`, `live-exam.gateway.ts`, `speaking.gateway.ts`, `pronunciation.gateway.ts`, `notifications.gateway.ts`. Each needs to be individually rewired to verify the Identity Platform token instead — this is the largest single chunk of app-code work in the whole migration, budget accordingly.
- **Public-route policy**: explicitly preserve unauthenticated health checks, login/configuration endpoints, static/public content, and PayPal webhook signature verification. Add tests proving protected HTTP routes and every WebSocket namespace cannot bypass the guard.
- **No identity-continuity/account-claim flow needed**: since this is a fresh start with no AWS user data carried over (see situation note at top), there is no existing-user claim/recovery flow to build for launch. `apps/api/infra/lambda/pre-signup/index.ts` currently does account linking (blocks native signup if a federated user shares the email; on federated sign-in, links to a matching native account via `AdminLinkProviderForUserCommand`) — that's still a useful *forward-looking* feature (a new user signing up with password, then later with Google, on the same email) and can be ported as an Identity Platform blocking function, but it's a nice-to-have for a later phase, not a launch blocker, and has nothing to do with AWS migration continuity.
- **SDK swaps** (package.json + service files):
  - `@aws-sdk/client-bedrock-runtime` → `@google-cloud/vertexai` (or Anthropic's `@anthropic-ai/vertex-sdk`) in `bedrock.service.ts` (rename to `vertex-ai.service.ts` or keep name, update internals)
  - `@aws-sdk/client-transcribe(-streaming)` → `@google-cloud/speech` in `speaking.gateway.ts`, `pronunciation.gateway.ts`
  - `@aws-sdk/client-polly` → `@google-cloud/text-to-speech` in `pronunciation/tts.service.ts`
  - `@aws-sdk/client-s3` + `s3-request-presigner` → `@google-cloud/storage` (has built-in `getSignedUrl`) in `chat-upload.service.ts`, `upload.service.ts`
  - `@aws-sdk/client-cognito-identity-provider` → Identity Platform Admin SDK (`firebase-admin` targeting the GCP project, since Identity Platform is Firebase Auth under the hood) for any server-side user management calls
- **Env vars**: replace `AWS_REGION`, `COGNITO_*`, `AWS_BEDROCK_REGION`, `AWS_TRANSCRIBE_REGION`, `AWS_POLLY_REGION`, `S3_BUCKET_NAME` with `GCP_PROJECT_ID`, `GCP_REGION`, `IDENTITY_PLATFORM_*`, `GCS_BUCKET_NAME`. Auth to GCP APIs from Cloud Run uses the attached service account (Application Default Credentials) — no static keys, same "no secrets for cloud SDK auth" property ECS had via task role.

### `apps/web`
- **Auth flow: Firebase Auth SDK with a custom UI** (decided — not FirebaseUI, not a hand-rolled OIDC flow). Do not assume an Identity Platform Hosted UI exists with Cognito-compatible behavior; the app builds its own login/signup screens against the Firebase Auth JS SDK.
- Define token refresh, logout, secure cookie attributes, CSRF protection, redirect URIs, Google provider configuration, and how the refreshed ID token is presented to HTTP and Socket.IO connections.
- Env vars: `NEXT_PUBLIC_COGNITO_DOMAIN`/`NEXT_PUBLIC_COGNITO_CLIENT_ID` → `NEXT_PUBLIC_FIREBASE_CONFIG` (web configuration is not a secret), while API/WS URLs point at the new LB.

### `apps/api/infra/cognito/*` and `apps/api/infra/lambda/pre-signup/*` — later phase, not launch-blocking
- These are per-app Terraform/Lambda for Cognito account-linking (see `cognito-account-linking-spec.md`, `cognito-migration-plan.md`), confirmed to do real email-based account linking (blocks duplicate native signup, links federated identity to existing native account on verified email match). Since there's no AWS user data to migrate, none of this is needed for GCP launch. If/when it's rebuilt, port the *behavior* (not the code) to an Identity Platform `beforeCreate`/`beforeSignIn` blocking function only after mapping Cognito event payloads, error behavior, timeouts, retries, and race conditions — a `beforeCreate` function is not automatically behavior-compatible with the existing Lambda.

---

## 5. CI/CD Changes

Rewrite `.github/workflows/deploy-api.yml` and `deploy-web.yml`:

| Step | Current (AWS) | New (GCP) |
|---|---|---|
| Auth | `aws-actions/configure-aws-credentials` (OIDC role) | `google-github-actions/auth` (Workload Identity Federation) |
| Registry login | `aws-actions/amazon-ecr-login` | `google-github-actions/auth` covers Artifact Registry too (or `docker/login-action` against `REGION-docker.pkg.dev`) |
| Build & push | `docker/build-push-action` → ECR tags | Same action, tags point at Artifact Registry |
| Migration step | `ecs run-task` + `wait tasks-stopped` + exit-code check | `gcloud run jobs execute migrate --wait`, with migration locking, pre-migration backup, expand/contract compatibility, and explicit failure handling |
| Deploy | `amazon-ecs-deploy-task-definition` (rolling update, wait-for-stability) | `google-github-actions/deploy-cloudrun` (revision-based deploy, `--no-traffic` + gradual rollout optional, or immediate 100%) |
| CDN invalidation | `aws cloudfront create-invalidation` | `gcloud compute url-maps invalidate-cdn-cache` |

`infra.yml` (Terraform plan/apply workflow) needs its AWS auth step swapped the same way.

---

## 6. Data Migration Plan

**There is no data migration.** The AWS account is fully locked out — no RDS, S3, or Cognito access — and no local/CI backup exists. GCP stands up empty:

1. **Database**: Cloud SQL for PostgreSQL is created fresh via `prisma migrate deploy` (same migration files already in `apps/api/prisma/migrations/`) — no `pg_dump`/`pg_restore` from RDS. Seed only what's needed for the app to function (reference data, admin account), not user data.
2. **Object storage**: GCS bucket(s) created fresh and empty. No transfer from S3.
3. **Users (Cognito → Identity Platform)**: no existing users to carry over or claim. Identity Platform starts empty; everyone signs up fresh through the new Firebase Auth SDK flow. This removes the entire account-claim/recovery design problem the original draft flagged — it doesn't apply here.
4. **Terraform state**: `infra-gcp/` gets its own fresh GCS backend state (per §3) — not a migration of `infra/backend.tf`'s S3 state, which stays as-is and becomes historical.
5. **If AWS access is later recovered** (see situation note at top — worth pursuing via AWS Support in parallel, independent of this build): treat that as a *separate, optional* future effort — e.g. importing salvaged user records or uploaded files into the already-running GCP stack — not a blocker or a phase of this plan.

---

## 7. Launch Plan

No parallel-run/rollback choreography is needed — AWS is already down and serving no traffic, and there's no data to keep in sync or reverse-sync (§6). This is a direct launch, not a cutover:

1. Stand up the full GCP stack via `infra-gcp/` Terraform. Configure Cloud Run ingress so traffic cannot bypass the intended load balancer controls.
2. Deploy app images to Cloud Run, point them at the fresh Cloud SQL + Memorystore instances, run migrations (`prisma migrate deploy` via the Cloud Run Job).
3. Smoke-test the GCP stack through the intended LB path: new signup (Firebase Auth SDK), protected HTTP routes, all five WebSocket namespaces/gateways (§4), reconnect during a Cloud Run revision rollout, file upload/download, AI features (Vertex AI Claude/STT/TTS), and PayPal webhook reachability against the new URL.
4. Point `api.neu-study.online` / `web.neu-study.online` at the GCP load balancer once certificate issuance and health checks are green. No need to pre-lower TTLs for a graceful multi-day cutover window — there's no live AWS traffic to protect during the switch — but do it anyway if you want fast rollback of *DNS* (not data) in case the GCP stack has a launch-day problem.
5. Monitor error rates, latency, WebSocket disconnects, authentication failures, database errors, AI quota/errors, upload failures, and payment webhook delivery closely for the first days.
6. Rollback, if needed pre-launch, is simple (nothing is live yet — just fix and redeploy). Post-launch rollback means reverting DNS to... nothing, since AWS can't serve traffic — so treat pre-launch smoke-testing (step 3) as the real safety net, not a rollback plan.
7. Once AWS account access is decided (recovered vs. abandoned), either pursue the optional data-import effort noted in §6, or formally decommission/close out the AWS account and archive `infra/` as historical.

---

## 8. Open Questions (need your input before implementation starts)

Resolved: auth flow (Firebase Auth SDK), repo layout (`infra-gcp/` alongside `infra/`), data/downtime strategy (moot — no data, no live traffic), existing-user continuity (moot — no existing users). Still open:

- **GCP region**: compare `australia-southeast1` (Sydney) and `asia-southeast1` (Singapore) using measured latency, pricing, service/model availability, quotas, egress, and data residency. Given the urgency, a reasonable default if you don't want to spend time benchmarking: pick `asia-southeast1` for broader Vertex AI model/service availability (historically GCP ships new services to Singapore before Sydney), and revisit later if latency proves to be a problem — this is a "ship now, optimize later" call given the account is currently down.
- **Cold starts**: Cloud Run `min-instances=0` saves the most money but adds cold-start latency on the API (worse for WebSocket reconnects). Set `min-instances=1` for `api` (small always-on cost) and `0` for `web`?
- **Cloud SQL connectivity**: choose public IP + Cloud SQL connector or private IP + Direct VPC egress/VPC connector; set connection pool and max-instance limits.
- **WebSocket recovery**: define reconnect/resume semantics for local audio/transcription sessions and credit deductions — real in-process state (`private sessions: Map` in `pronunciation.gateway.ts` and `speaking.gateway.ts`) doesn't survive a revision replacement, and Redis only helps with the Socket.IO transport layer, not this app-level session state.

---

## 9. Suggested Phasing

Since there's no live AWS traffic to protect and no data migration gating things, phases can move faster than the original draft assumed — but the release gates (below) still apply before calling this production-ready, since the app has real users going forward from launch.

1. **Foundation**: `network`, `dns`, `certs`, `artifact-registry` modules — no app impact yet.
2. **Data tier**: `cloud-sql`, `memorystore`, `storage` modules, provisioned empty; run `prisma migrate deploy` against Cloud SQL. No migration scripts needed (§6).
3. **Auth**: `identity-platform` module + NestJS auth-guard rewrite (guard + all five gateways, §4) + Next.js Firebase Auth SDK flow — testable in isolation against Identity Platform before compute is wired up.
4. **AI services**: Vertex AI SDK swaps in `apps/api`, tested against Vertex AI directly (independent of hosting platform).
5. **Compute + LB**: `cloud-run`, `load-balancer` modules; deploy images; wire everything together; smoke-test on GCP-native URLs.
6. **CI/CD**: rewrite GitHub Actions workflows, point `main`-branch deploys at GCP.
7. **Launch**: execute §7.

### Release gates

Before pointing DNS at the GCP stack (§7 step 4):

- All five WebSocket gateways (`chat`, `live-exam`, `speaking`, `pronunciation`, `notifications`) verify Identity Platform tokens correctly — no leftover `x-amzn-oidc-data` trust anywhere.
- WebSocket clients reconnect during a Cloud Run revision rollout without losing or double-charging a session.
- Cloud SQL connection limits remain safe under expected Cloud Run concurrency and max instances.
- Public routes, PayPal webhooks, protected routes, cookies, CSRF, and WebSocket authentication have automated tests.
- Monitoring, alerting, backups, budgets, quotas, WIF restrictions, and Secret Manager access are configured.
- A failed deployment and a database migration failure have tested recovery procedures.

Each phase is independently reviewable/mergeable; nothing in phases 1–6 touches production DNS.
