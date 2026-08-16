# Implementation Plan: CrossBox Gym — Automated Gym Platform (MVP)

> AWS CDK-oriented. Describes what to build, in what order, and with what configuration —
> not actual CDK/application code.
> Derived from: [`docs/aws-architecture.md`](file:///C:/Users/golebiowskib/OneDrive%20-%20TRANSITION%20TECHNOLOGIES%20PSC%20S.A/Desktop/coding/crossbox-gym/docs/aws-architecture.md)

## 1. Overview & Assumptions

- **Purpose:** Single-tenant, serverless, automated gym management platform — 24/7 access control via QR codes, Stripe billing, admin management panel. MVP scope: 1 gym owner, multiple locations, 2 roles (Member + Admin).
- **IaC tool:** AWS CDK (TypeScript)
- **Stack strategy:** Single monolithic `CrossboxGymStack` — all resources in one stack, no cross-stack references.
- **Environment/stage strategy:** Single default stage (MVP). The `isTestEnvironment` CDK context parameter toggles test-mode behavior (mock providers, `RemovalPolicy.DESTROY`).
- **Lambda runtime:** Node.js 22.x with TypeScript, bundled via esbuild.
- **Cost optimization:** Out of scope for this pass.
- **Testing strategy:** Provider adapter pattern enables automated integration testing. Per-Lambda unit test notes included as non-blocking follow-ups.

---

## 2. Architecture Summary

| # | Resource | Type | Purpose |
|---|---|---|---|
| 1 | `MainTable` | DynamoDB | Single-table: Users, Subscriptions, Locations, Devices, Consent, Tokens, Config. 6 GSIs. |
| 2 | `EntryLogs` | DynamoDB | Entry access logs. 12-month TTL. 1 GSI (AntiPassbackIndex). |
| 3 | `AuditLogs` | DynamoDB | Admin audit trail. Append-only, indefinite retention. |
| 4 | `UnlockQueue` | SQS | Decouples verification from physical lock command. |
| 5 | `UserPool` | Cognito | Identity: email+password, `admins` group, JWT tokens. |
| 6 | `UserPoolClient` | Cognito | Single app client for all consumers. |
| 7 | `StaticAssetsBucket` | S3 | PWA, admin panel, landing page, locations.json. |
| 8 | `CDNDistribution` | CloudFront | CDN for S3 static assets. OAC access. |
| 9 | `HttpApi` | API Gateway (HTTP) | 24 routes. Cognito JWT authorizer on protected routes. |
| 10 | `AuthHandler` | Lambda | Login, magic links, set-password. |
| 11 | `CheckoutHandler` | Lambda | Create Stripe Checkout session. |
| 12 | `StripeWebhookHandler` | Lambda | Process Stripe webhook events → provision accounts, status transitions. |
| 13 | `MemberHandler` | Lambda | Dashboard, consent, QR, portal session. |
| 14 | `VerifyEntry` | Lambda | QR verification → subscription check → anti-passback → unlock. |
| 15 | `ExecuteUnlock` | Lambda | HTTP POST to door lock relay. |
| 16 | `AdminHandler` | Lambda | All admin CRUD: locations, devices, members, overrides, unlock, HMAC rotation. |
| 17 | `GraceExpiryCron` | Lambda | Scheduled: transition stale PAST_DUE → SUSPENDED. |
| 18 | `GraceExpiryRule` | CloudWatch Events | Cron trigger: every 30 minutes. |

---

## 3. Implementation Order

Ordered build sequence. Each step depends on the resources listed. Within a single CDK stack, CDK resolves deploy ordering automatically via token references — this order is for **implementation** (coding) sequencing.

| # | Resource(s) | Depends on | Rationale |
|---|---|---|---|
| 1 | **CDK project scaffolding** | — | Initialize CDK app, tsconfig, esbuild config, project structure. |
| 2 | **`MainTable`** (DynamoDB + 6 GSIs) | — | Foundation data layer. Every Lambda reads/writes here. |
| 3 | **`EntryLogs`** (DynamoDB + 1 GSI) | — | Separate table, independent of MainTable. |
| 4 | **`AuditLogs`** (DynamoDB) | — | Separate table, independent. |
| 5 | **`UnlockQueue`** (SQS) | — | Messaging layer. ExecuteUnlock Lambda depends on this. |
| 6 | **`UserPool`** + **`UserPoolClient`** (Cognito) | — | Identity layer. Multiple Lambdas need pool ID/client ID. API Gateway JWT authorizer needs pool ARN. |
| 7 | **`StaticAssetsBucket`** (S3) | — | Storage. AdminHandler writes locations.json. CloudFront needs this as origin. |
| 8 | **`CDNDistribution`** (CloudFront) | `StaticAssetsBucket` | Needs S3 bucket as origin with OAC. |
| 9 | **Provider adapters & Centralized Env** (shared Lambda code) | — | Define PaymentProvider (`payment/`), LockProvider interfaces + mock/real implementations. Shared `env.ts` module for environment configuration. |
| 10 | **`HttpApi`** (API Gateway) + Cognito JWT authorizer | `UserPool` | API surface. Needs Cognito for JWT authorizer. Routes added with Lambda integrations. |
| 11 | **`AuthHandler`** (Lambda) | `MainTable`, `UserPool`, `HttpApi` | Reads/writes tokens + rate limits in MainTable, calls Cognito APIs. |
| 12 | **`CheckoutHandler`** (Lambda) | `HttpApi` | Calls Stripe API (external). Minimal AWS dependencies. |
| 13 | **`StripeWebhookHandler`** (Lambda) | `MainTable`, `UserPool`, `HttpApi` | Modular event handlers (`events/`): writes users/subscriptions to MainTable, creates Cognito users. |
| 14 | **`MemberHandler`** (Lambda) | `MainTable`, `HttpApi` | Reads user/subscription/consent/config/locations from MainTable. |
| 15 | **`VerifyEntry`** (Lambda) | `MainTable`, `EntryLogs`, `UnlockQueue`, `HttpApi` | Reads from MainTable (device, subscription, config), writes to EntryLogs, publishes to UnlockQueue. |
| 16 | **`ExecuteUnlock`** (Lambda) | `MainTable`, `UnlockQueue` | Triggered by SQS. Reads device connection params from MainTable, calls lock HTTP endpoint. |
| 17 | **`AdminHandler`** (Lambda) | `MainTable`, `AuditLogs`, `UnlockQueue`, `StaticAssetsBucket`, `HttpApi` | Most dependencies — CRUD on all tables, writes to S3, publishes to SQS. |
| 18 | **`GraceExpiryCron`** (Lambda) + **`GraceExpiryRule`** (CloudWatch Events) | `MainTable` | Scheduled scan of MainTable GSI1. |
| 19 | **CORS configuration** | `HttpApi`, `CDNDistribution` | Configure allowed origins (CloudFront domain for prod, localhost for dev). |
| 20 | **`isTestEnvironment` parameter** + test-mode wiring | All resources | CDK context parameter that sets RemovalPolicy.DESTROY, autoDeleteObjects, mock providers. |
| 21 | **Seed admin script** (`npm run seed`) | `UserPool` (deployed) | Post-deploy script. Creates initial admin user in Cognito. |
| 22 | **CloudFormation stack outputs** | All resources | Export ApiUrl, UserPoolId, UserPoolClientId, MainTableName, EntryLogsTableName, UnlockQueueUrl for test runner. |

---

## 4. Resource Implementation Details

### 4.1 Resource: CDK Project Scaffolding

- **What:** Initialize CDK TypeScript project with esbuild bundling support.
- **Project structure:**
  ```
  /
  ├── bin/
  │   └── app.ts                    # CDK app entry point
  ├── lib/
  │   └── crossbox-gym-stack.ts     # Single stack definition
  ├── src/
  │   ├── handlers/                 # Lambda handler entry points
  │   │   ├── auth.ts
  │   │   ├── member.ts
  │   │   ├── checkout.ts
  │   │   ├── stripe-webhook.ts
  │   │   ├── verify-entry.ts
  │   │   ├── execute-unlock.ts
  │   │   ├── admin.ts
  │   │   └── grace-expiry-cron.ts
  │   ├── providers/                # Adapter pattern implementations
  │   │   ├── payment/
  │   │   ├── lock/
  │   │   └── email/
  │   └── shared/                   # Shared utilities, types, constants
  ├── scripts/
  │   └── seed-admin.ts             # Post-deploy admin seed script
  ├── test/                         # Integration test suite
  ├── cdk.json
  ├── tsconfig.json
  └── package.json
  ```
- **Testing follow-up:** Verify `cdk synth` produces valid CloudFormation template.

---

### 4.2 Resource: `MainTable` (DynamoDB)

- **CDK construct:** `aws-dynamodb.Table`
- **Trigger / event source:** N/A (data store)
- **Configuration:**
  - Table name: contextual (CDK-generated or explicit)
  - Partition key: `PK` (String)
  - Sort key: `SK` (String)
  - Billing mode: PAY_PER_REQUEST (on-demand)
  - TTL attribute: `ttl`
  - Removal policy: `RETAIN` (production) / `DESTROY` (test, via `isTestEnvironment`)
- **GSIs (6):**

  | GSI | PK | SK | Projection | Purpose |
  |---|---|---|---|---|
  | `EmailIndex` | `email` | — | ALL | User lookup by email |
  | `CognitoSubIndex` | `cognito_sub` | — | KEYS_ONLY | JWT sub → user_id |
  | `StripeSubIndex` | `stripe_subscription_id` | — | ALL | Webhook → subscription |
  | `ApiKeyIndex` | `api_key_hash` | — | ALL | Device auth by API key |
  | `DeviceIdIndex` | `device_id` | — | ALL | Direct device lookup |
  | `GSI1` | `GSI1PK` | `GSI1SK` | ALL | Overloaded: locations list + status queries |

- **IAM permissions needed:** Granted per-Lambda (see individual Lambda entries).
- **Error handling / retries:** N/A
- **Observability:** Default DynamoDB metrics in CloudWatch.
- **Testing follow-up:** Validate all 6 GSI projections return expected attributes.

---

### 4.3 Resource: `EntryLogs` (DynamoDB)

- **CDK construct:** `aws-dynamodb.Table`
- **Configuration:**
  - Partition key: `PK` (String) = `USER#<user_id>`
  - Sort key: `SK` (String) = `ENTRY#<timestamp>#<entry_id>`
  - Billing mode: PAY_PER_REQUEST
  - TTL attribute: `ttl` (set to timestamp + 12 months)
  - Removal policy: `RETAIN` / `DESTROY` (test)
- **GSIs (1):**

  | GSI | PK | SK | Purpose |
  |---|---|---|---|
  | `AntiPassbackIndex` | `USER#<user_id>#LOC#<location_id>` | `timestamp` | Anti-passback check: last entry for user+location |

- **Testing follow-up:** Verify TTL auto-purges expired entries.

---

### 4.4 Resource: `AuditLogs` (DynamoDB)

- **CDK construct:** `aws-dynamodb.Table`
- **Configuration:**
  - Partition key: `PK` (String) = `AUDIT#<admin_id>`
  - Sort key: `SK` (String) = `<timestamp>#<audit_id>`
  - Billing mode: PAY_PER_REQUEST
  - TTL: none (indefinite retention)
  - Removal policy: `RETAIN` / `DESTROY` (test)
- **GSIs:** None
- **Testing follow-up:** Verify append-only writes.

---

### 4.5 Resource: `UnlockQueue` (SQS)

- **CDK construct:** `aws-sqs.Queue`
- **Configuration:**
  - Queue type: Standard
  - Visibility timeout: 30 seconds
  - Max receive count: 3 (messages discarded after 3 failed attempts — no DLQ for MVP)
- **Producers:** `VerifyEntry` Lambda, `AdminHandler` Lambda
- **Consumer:** `ExecuteUnlock` Lambda (event source mapping, batch size: 1)
- **Error handling:** Failed messages are discarded after 3 retries. Failures logged to CloudWatch by `ExecuteUnlock` Lambda. User can re-scan QR code to retry.
- **Testing follow-up:** Verify message consumption and retry behavior.

---

### 4.7 Resource: `UserPool` (Cognito)

- **CDK construct:** `aws-cognito.UserPool`
- **Configuration:**
  - Sign-in: email as username
  - Password policy: 8+ chars, require mixed case + numbers (CDK defaults)
  - MFA: off
  - Custom attributes: `custom:role` (String, mutable)
  - User group: `admins` (created via `aws-cognito.CfnUserPoolGroup`)
  - Self-sign-up: disabled (users created by StripeWebhookHandler or admin)
  - Account recovery: email only
  - Removal policy: `RETAIN` / `DESTROY` (test)
- **Testing follow-up:** Verify user creation and group assignment via seed script.

---

### 4.8 Resource: `UserPoolClient` (Cognito)

- **CDK construct:** `aws-cognito.UserPoolClient`
- **Configuration:**
  - Auth flows: `USER_PASSWORD_AUTH`, `ALLOW_ADMIN_USER_PASSWORD_AUTH`
  - Access token TTL: 1 hour
  - Refresh token TTL: 30 days
  - No client secret (public client for PWA/admin panel)
  - Shared by all consumers (PWA, admin panel, Lambda backends)
- **Testing follow-up:** Verify token refresh works with 30-day refresh token.

---

### 4.9 Resource: `StaticAssetsBucket` (S3)

- **CDK construct:** `aws-s3.Bucket`
- **Configuration:**
  - Access: private (no public read)
  - Block all public access: true
  - Versioning: disabled (MVP)
  - `autoDeleteObjects: true` when `isTestEnvironment` (for clean teardown)
  - Removal policy: `RETAIN` / `DESTROY` (test)
- **Key structure:**
  ```
  /pwa/          → Member PWA SPA
  /admin/        → Admin panel SPA
  /landing/      → Landing page
  /public/locations.json  → Public locations data
  ```
- **Testing follow-up:** Verify `AdminHandler` can write `locations.json`.

---

### 4.10 Resource: `CDNDistribution` (CloudFront)

- **CDK construct:** `aws-cloudfront.Distribution`
- **Configuration:**
  - Origin: `StaticAssetsBucket` via OAC (Origin Access Control)
  - Default behavior: S3 origin, GET/HEAD allowed, CachingOptimized policy
  - Default root object: `index.html`
  - Custom error responses: 403 → `/index.html` (200), 404 → `/index.html` (200) — SPA routing
  - Price class: PriceClass_100 (cheapest, US/EU only — MVP)
  - No custom domain for MVP (use CloudFront `*.cloudfront.net` URL)
- **IAM:** OAC automatically creates the S3 bucket policy allowing CloudFront access.
- **Testing follow-up:** Verify SPA routing returns correct `index.html` for sub-paths.

---

### 4.11 Resource: `HttpApi` (API Gateway)

- **CDK construct:** `aws-apigatewayv2.HttpApi`
- **Configuration:**
  - Protocol: HTTP
  - CORS:
    - Allowed origins: `http://localhost:5173`, `http://localhost:3000` (dev) / CloudFront domain (prod) — via CDK context
    - Allowed methods: GET, POST, PUT, DELETE, OPTIONS
    - Allowed headers: Content-Type, Authorization, X-Api-Key
    - Max age: 86400s (24 hours)
  - Cognito JWT authorizer attached to `/member/*`, `/admin/*`, `/auth/set-password` routes
  - No authorizer on: `/checkout/*`, `/auth/login`, `/auth/magic-link`, `/auth/magic-link/verify`, `/device/*`, `/webhook/*`
- **Routes (24):** See architecture doc section 4 for complete route table.
- **Observability:** Default API Gateway access logs to CloudWatch.
- **Testing follow-up:** Verify JWT authorizer rejects requests without valid token.

---

### 4.12 Resource: `AuthHandler` (Lambda)

- **CDK construct:** `aws-lambda-nodejs.NodejsFunction` (esbuild)
- **Trigger:** API Gateway routes: `POST /auth/login`, `POST /auth/magic-link`, `GET /auth/magic-link/verify`, `POST /auth/set-password`
- **Configuration:**
  - Runtime: Node.js 22.x
  - Memory: 256 MB
  - Timeout: 30 seconds
  - Handler: `src/handlers/auth.handler`
  - Environment variables:
    - `MAIN_TABLE_NAME` — DynamoDB MainTable name
    - `USER_POOL_ID` — Cognito User Pool ID
    - `USER_POOL_CLIENT_ID` — Cognito User Pool Client ID
     - `FRONTEND_URL` — Magic link redirect base URL
- **IAM permissions:**
  - `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem` on `MainTable` (scoped to `TOKEN#*`, `RATELIMIT#*`, `USER#*` key prefixes via condition)
  - `dynamodb:Query` on `MainTable` `EmailIndex` GSI
  - `cognito-idp:AdminInitiateAuth`, `AdminSetUserPassword`, `AdminCreateUser` on User Pool ARN
- **Error handling:** Sync API response — return HTTP error codes. No DLQ.
- **Observability:** CloudWatch Logs (default).
- **Testing follow-up:** Unit test magic link token generation/validation, rate limiting logic.

---

### 4.13 Resource: `CheckoutHandler` (Lambda)

- **CDK construct:** `aws-lambda-nodejs.NodejsFunction`
- **Trigger:** API Gateway: `POST /checkout/session`
- **Configuration:**
  - Runtime: Node.js 22.x
  - Memory: 256 MB
  - Timeout: 30 seconds
  - Handler: `src/handlers/checkout.handler`
  - Environment variables:
    - `PAYMENT_PROVIDER` — `stripe` | `mock`
    - `STRIPE_SECRET_KEY`
- **IAM permissions:** None required for payment key (passed via env).
- **Error handling:** Sync API response. No DLQ.
- **Observability:** CloudWatch Logs.
- **Provider adapters used:** `PaymentProvider`
- **Testing follow-up:** Unit test Stripe session creation, mock provider returns dummy URL.

---

### 4.14 Resource: `StripeWebhookHandler` (Lambda)

- **CDK construct:** `aws-lambda-nodejs.NodejsFunction`
- **Trigger:** API Gateway: `POST /webhook/stripe`
- **Configuration:**
  - Runtime: Node.js 22.x
  - Memory: 256 MB
  - Timeout: 30 seconds
  - Handler: `src/handlers/stripe-webhook.handler`
  - Environment variables:
    - `MAIN_TABLE_NAME`
    - `USER_POOL_ID`
    - `PAYMENT_PROVIDER` — `stripe` | `mock`
    - `STRIPE_SECRET_KEY`
- **IAM permissions:**
  - `dynamodb:PutItem`, `UpdateItem`, `GetItem` on `MainTable`
  - `dynamodb:Query` on `MainTable` `EmailIndex`, `StripeSubIndex` GSIs
  - `cognito-idp:AdminCreateUser` on User Pool ARN
  - `cognito-idp:AdminAddUserToGroup` on User Pool ARN (for adding to default member group if needed)
- **Error handling:** Return 200 to Stripe on success. Return 500 on transient failure — Stripe retries for up to 3 days. All operations are idempotent (check-before-write).
- **Observability:** CloudWatch Logs. Monitor error rate — indicates provisioning or status transition failures.
- **Provider adapters used:** `PaymentProvider`
- **Testing follow-up:** Unit test each event type handler, idempotency of user/subscription creation.

---

### 4.15 Resource: `MemberHandler` (Lambda)

- **CDK construct:** `aws-lambda-nodejs.NodejsFunction`
- **Trigger:** API Gateway: `GET /member/dashboard`, `POST /member/consent`, `POST /member/qr`, `POST /member/portal-session`
- **Configuration:**
  - Runtime: Node.js 22.x
  - Memory: 256 MB
  - Timeout: 30 seconds
  - Handler: `src/handlers/member.handler`
  - Environment variables:
    - `MAIN_TABLE_NAME`
    - `PAYMENT_PROVIDER` — `stripe` | `mock`
    - `STRIPE_SECRET_KEY`
- **IAM permissions:**
  - `dynamodb:GetItem`, `Query`, `PutItem` on `MainTable` (user, subscription, consent, config, locations via GSI1)
  - `dynamodb:Query` on `MainTable` `CognitoSubIndex` GSI (JWT sub → user_id)
- **Error handling:** Sync API response. No DLQ.
- **Observability:** CloudWatch Logs.
- **Provider adapters used:** `PaymentProvider`
- **Testing follow-up:** Unit test QR HMAC generation, consent check logic, subscription status access rules.

---

### 4.16 Resource: `VerifyEntry` (Lambda)

- **CDK construct:** `aws-lambda-nodejs.NodejsFunction`
- **Trigger:** API Gateway: `POST /device/verify`
- **Configuration:**
  - Runtime: Node.js 22.x
  - Memory: **1024 MB** (full vCPU — performance-critical)
  - Timeout: **10 seconds** (target: <500ms p99)
  - Handler: `src/handlers/verify-entry.handler`
  - Bundling: esbuild, tree-shake aggressively, no large SDK imports
  - Environment variables:
    - `MAIN_TABLE_NAME`
    - `ENTRY_LOGS_TABLE_NAME`
    - `UNLOCK_QUEUE_URL`
- **IAM permissions:**
  - `dynamodb:GetItem`, `Query` on `MainTable` (devices via `ApiKeyIndex`, subscriptions, config/HMAC keys)
  - `dynamodb:PutItem`, `Query` on `EntryLogs` (write entry log + anti-passback check via `AntiPassbackIndex`)
  - `sqs:SendMessage` on `UnlockQueue` ARN
- **Error handling:** Sync response with `{result, reason, feedback}`. No DLQ on the Lambda itself — failures return error response to scanner.
- **Observability:** CloudWatch Logs. Monitor Duration p99 metric (target: <500ms).
- **Anti-passback logic:** Query `AntiPassbackIndex` (`PK=USER#<id>#LOC#<loc_id>`, SK descending, Limit 1). If last successful entry timestamp is within 15 min → deny. The EntryLog record IS the cooldown — no separate item.
- **Testing follow-up:** Unit test full verification chain: API key lookup → HMAC validation → status check → anti-passback → success/deny paths.

---

### 4.17 Resource: `ExecuteUnlock` (Lambda)

- **CDK construct:** `aws-lambda-nodejs.NodejsFunction`
- **Trigger:** SQS `UnlockQueue` (event source mapping, batch size: 1)
- **Configuration:**
  - Runtime: Node.js 22.x
  - Memory: 256 MB
  - Timeout: **10 seconds** (HTTP call to lock + 5s relay)
  - Handler: `src/handlers/execute-unlock.handler`
  - Environment variables:
    - `MAIN_TABLE_NAME`
    - `LOCK_PROVIDER` — `http` | `mock`
- **IAM permissions:**
  - `dynamodb:GetItem` on `MainTable` (device connection_params lookup)
  - `sqs:ReceiveMessage`, `DeleteMessage`, `GetQueueAttributes` on `UnlockQueue` (auto-granted by event source mapping)
- **Error handling:** SQS retries up to 3 times (maxReceiveCount: 3). After 3 failures → message is discarded (no DLQ for MVP). Lambda logs failure to CloudWatch and throws error to trigger SQS retry. User can re-scan QR to retry.
- **Observability:** CloudWatch Logs.
- **Provider adapters used:** `LockProvider`
- **Testing follow-up:** Unit test HTTP call to lock endpoint, mock provider logs unlock payload.

---

### 4.18 Resource: `AdminHandler` (Lambda)

- **CDK construct:** `aws-lambda-nodejs.NodejsFunction`
- **Trigger:** API Gateway: 14 routes under `/admin/*` (see architecture section 4)
- **Configuration:**
  - Runtime: Node.js 22.x
  - Memory: 256 MB
  - Timeout: 30 seconds
  - Handler: `src/handlers/admin.handler`
  - Environment variables:
    - `MAIN_TABLE_NAME`
    - `AUDIT_LOGS_TABLE_NAME`
    - `UNLOCK_QUEUE_URL`
- **IAM permissions:**
  - `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `Scan` on `MainTable`
  - `dynamodb:Query` on `MainTable` GSIs: `EmailIndex`, `GSI1`, `DeviceIdIndex`
  - `dynamodb:PutItem` on `AuditLogs`
  - `sqs:SendMessage` on `UnlockQueue` ARN
- **Error handling:** Sync API response. AuditLog writes are best-effort (log failure but don't block the admin action).
- **Observability:** CloudWatch Logs.
- **Authorization:** Lambda checks `cognito:groups` claim in JWT contains `admins`. Returns 403 if not.
- **Testing follow-up:** Unit test CRUD operations, audit log writing, HMAC key rotation logic.

---

### 4.19 Resource: `GraceExpiryCron` (Lambda + CloudWatch Events Rule)

- **CDK construct:** `aws-lambda-nodejs.NodejsFunction` + `aws-events.Rule` + `aws-events-targets.LambdaFunction`
- **Trigger:** CloudWatch Events rule: `rate(30 minutes)`
- **Configuration:**
  - Runtime: Node.js 22.x
  - Memory: 256 MB
  - Timeout: **60 seconds** (may scan and update multiple items)
  - Handler: `src/handlers/grace-expiry-cron.handler`
  - Environment variables:
    - `MAIN_TABLE_NAME`
- **IAM permissions:**
  - `dynamodb:Query` on `MainTable` `GSI1` (query `GSI1PK=STATUS#PAST_DUE`, filter `grace_period_end < NOW()`)
  - `dynamodb:UpdateItem` on `MainTable` (conditional: `status = PAST_DUE` before setting `SUSPENDED`)
- **Error handling:** If Lambda times out, next cron run (30 min later) picks up remaining items. Conditional updates prevent double-transitions.
- **Observability:** CloudWatch Logs. Monitor error count.
- **Testing follow-up:** Unit test conditional status transition.

---

## 5. Cross-Cutting Concerns

### 5.1 Secrets / Config Management

| Secret / Config | Storage | Access Method | Used By |
|---|---|---|---|
| Stripe secret key | Lambda environment variable: `STRIPE_SECRET_KEY` | Direct env var read. | `CheckoutHandler`, `StripeWebhookHandler`, `MemberHandler` |
| HMAC signing keys | DynamoDB `MainTable` (`CONFIG#HMAC_CURRENT_KEY`, `CONFIG#HMAC_PREVIOUS_KEY`) | `GetItem` at runtime per request. | `VerifyEntry`, `MemberHandler` (QR gen), `AdminHandler` (rotation) |
| SES sender email | Lambda environment variable: `SES_SENDER_EMAIL` | Direct env var read. | `AuthHandler`, `StripeWebhookHandler`, `GraceExpiryCron` |

**Pre-deployment prerequisites:**
1. Configure `STRIPE_SECRET_KEY` environment variable
2. Verify SES domain identity (DNS records)
3. Seed initial HMAC key in DynamoDB MainTable (`CONFIG#HMAC_CURRENT_KEY`)

### 5.2 Networking (VPC)

**None.** All resources are serverless and run outside a VPC. No RDS, ElastiCache, or other VPC-bound resources. Door lock communication is via public internet HTTP.

### 5.3 Auth (API Surface)

| Route Group | Auth Method | Implementation |
|---|---|---|
| `/member/*`, `/auth/set-password` | Cognito JWT | API Gateway JWT authorizer (L2 construct) |
| `/admin/*` | Cognito JWT + `admins` group | API Gateway JWT authorizer + Lambda-level group check |
| `/device/verify` | API key in header | No API GW auth — Lambda validates `api_key_hash` via `ApiKeyIndex` GSI |
| `/webhook/stripe` | Stripe signature | No API GW auth — Lambda validates `stripe-signature` header |
| `/checkout/session`, `/auth/login`, `/auth/magic-link`, `/auth/magic-link/verify` | None (public) | No auth |

### 5.4 Provider Adapter Pattern

Three adapter interfaces with real + mock implementations, selected via environment variable:

| `PaymentProvider` | `PAYMENT_PROVIDER` | `StripePaymentProvider` — calls Stripe API | `MockPaymentProvider` — returns dummy URLs, processes `x-mock-event` header | `CheckoutHandler`, `StripeWebhookHandler`, `MemberHandler` |
| `LockProvider` | `LOCK_PROVIDER` | `HttpLockProvider` — HTTP POST to lock IP | `MockLockProvider` — logs to CloudWatch, writes dummy record to DynamoDB | `ExecuteUnlock` |

**Test environment (`isTestEnvironment=true`):** Env vars set to `mock`. Lambda IAM policies for SSM (Stripe keys) are conditionally omitted — mock providers don't need them.

### 5.5 `isTestEnvironment` CDK Context Parameter

When `true`:
- All DynamoDB tables: `RemovalPolicy.DESTROY`
- S3 bucket: `RemovalPolicy.DESTROY` + `autoDeleteObjects: true`
- Cognito User Pool: `RemovalPolicy.DESTROY`
- All Lambdas: `PAYMENT_PROVIDER=mock`, `LOCK_PROVIDER=mock`
- SSM IAM permissions: conditionally excluded (not needed with mock providers)

### 5.6 CloudFormation Stack Outputs

| Output Key | Value | Purpose |
|---|---|---|
| `ApiUrl` | API Gateway endpoint URL | Test runner base URL |
| `UserPoolId` | Cognito User Pool ID | Seed script, test runner |
| `UserPoolClientId` | Cognito User Pool Client ID | Seed script, test runner |
| `MainTableName` | DynamoDB MainTable name | Test runner data setup/assertions |
| `EntryLogsTableName` | DynamoDB EntryLogs name | Test runner assertions |
| `UnlockQueueUrl` | SQS UnlockQueue URL | Test runner assertions |
| `CloudFrontUrl` | CloudFront distribution domain | CORS config, frontend deployment target |

---

## 6. Open Questions

_None — all ambiguities resolved during clarification._

---

## 7. Resolved Ambiguities Log

| # | Question | Answer | Impact |
|---|---|---|---|
| 1 | CDK stack structure? | Single monolithic `CrossboxGymStack`. | No cross-stack refs, simpler deployment. |
| 2 | Lambda runtime/language? | Node.js 22.x with TypeScript, esbuild bundling. | Consistent with CDK language. |
| 3 | Default Lambda memory/timeout? | 256 MB / 30s for all except `VerifyEntry` (1024 MB / 10s), `ExecuteUnlock` (256 MB / 10s), `GraceExpiryCron` (256 MB / 60s). | Cost-effective MVP defaults. |
| 4 | SES identity setup? | Domain identity, pre-verified outside CDK. Sender email via env var. | CDK doesn't manage DNS. |
| 5 | UnlockQueue SQS config? | Visibility timeout: 30s, maxReceiveCount: 3, batch size: 1. | Reliable one-at-a-time unlock processing. |
| 6 | CloudFront + API Gateway? | No API proxying. API GW uses own URL. CloudFront serves S3 only. | Simpler CloudFront, CORS needed on API GW. |
| 7 | Cognito app clients? | Single shared UserPoolClient for all consumers. | Simpler auth config. |
| 8 | Seed admin method? | `npm run seed` CLI script (post-deploy). | No Custom Resource Lambda overhead. |
| 9 | CloudFront SPA routing? | Custom error response (403/404 → `/index.html` with 200). | Root index.html routes to correct SPA. |
| 10 | ExecuteUnlock timeout? | 10 seconds. | Accounts for HTTP call + 5s relay + network. |
| 11 | Stripe SSM parameters? | Pre-provisioned SecureString. CDK grants GetParameter + KMS Decrypt. | Most secure, manual setup required. |
| 12 | X-Ray tracing? | No X-Ray for MVP. CloudWatch Logs only. | Lower cost, simpler. |
| 13 | GraceExpiryCron timeout? | 60 seconds. | Room for batch processing. |
| 14 | S3 access control? | CloudFront OAC. Bucket private. | Modern best practice, no direct S3 access. |
| 15 | CORS config? | GET/POST/PUT/DELETE/OPTIONS. Headers: Content-Type, Authorization, X-Api-Key. Max age: 24h. | Standard secure CORS. |
| 16 | Anti-passback cooldown? | EntryLog IS the cooldown. No separate item. | Simpler data model. |
| 17 | VerifyEntry timeout? | 10 seconds (target <500ms p99). | Generous for cold starts. |
| 18 | DynamoDB GSI count? | Keep all 6 on MainTable. All serve core MVP access patterns. | No simplification needed. |
| 19 | Provider adapter in plan? | Included — defines 3 providers, env vars, and isTestEnvironment wiring. | Affects IAM, env vars, test stack. |
