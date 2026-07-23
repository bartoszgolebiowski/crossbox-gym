# Implementation Plan: [Architecture/System Name]

> AWS CDK-oriented. Describes what to build, in what order, and with what configuration —
> not actual CDK/application code.

## 1. Overview & Assumptions
- Purpose / system being implemented:
- IaC tool: AWS CDK (unless architecture states otherwise)
- Environment/stage strategy: single default stage (MVP assumption, unless stated otherwise)

## 2. Architecture Summary
| Resource | Type (Lambda/DynamoDB/API GW/SQS/...) | Purpose |
|---|---|---|

## 3. Implementation Order
Ordered build sequence, accounting for cross-resource dependencies (e.g. table before the
Lambda that references its ARN).

1. Resource — depends on: [none / resource(s)]
2. Resource — depends on: [...]

## 4. Resource Implementation Details
Repeat per resource.

### Resource: [Name]
- **CDK construct**: (e.g. `aws-lambda.Function`, `aws-dynamodb.Table`)
- **Trigger / event source**: (API Gateway route, EventBridge rule, SQS queue, S3 event, schedule, none)
- **Configuration notes**: (runtime, memory/timeout, key schema, access pattern, etc.)
- **IAM permissions needed**: (least-privilege actions + target resource ARN pattern)
- **Error handling / retries**: (DLQ, retry policy, on-failure destination, or N/A)
- **Observability**: (logs, X-Ray tracing, alarms)
- **Testing follow-up**: (short note, non-blocking)

## 5. Cross-Cutting Concerns
- **Secrets/config management**: (env vars / SSM Parameter Store / Secrets Manager)
- **Networking (VPC)**: (resources requiring VPC placement, or "none")
- **Auth (API surface)**: (IAM / Cognito / API key / JWT authorizer / public)

## 6. Open Questions (should be empty when finalized)
-

## 7. Resolved Ambiguities Log
| Question | Answer | Impact |
|---|---|---|
