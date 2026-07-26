---
name: development-workflow
description: Development guidelines, selective stack deployment instructions via npm run commands, AWS CLI Lambda log debugging, fast UI S3/CloudFront updates without full CDK deploy, and AWS Serverless CDK best practices for Crossbox Gym.
---

# Development & AWS CDK Workflow Guide

This skill defines the standard operating procedures for developing, deploying, and debugging the **Crossbox Gym** AWS Serverless CDK stack and UI frontend applications.

---

## 1. Stack Architecture & Mapping

The project consists of three decoupled CDK stacks defined in `bin/app.ts` and `lib/stacks/`:

| Stack Short Name | CDK Stack Class | Stack ID (Default) | Key Resources |
| :--- | :--- | :--- | :--- |
| **`data`** | `CrossboxDataStack` | `CrossboxGymDevDataStack` | DynamoDB Tables (`MainTable`, `EntryLogsTable`, `AuditLogsTable`), Cognito User Pool & Client, SQS Queue (`UnlockQueue`). |
| **`api`** | `CrossboxApiStack` | `CrossboxGymDevApiStack` | API Gateway HTTP API, 8 Node.js Lambdas (`AuthHandler`, `CheckoutHandler`, `StripeWebhookHandler`, `MemberHandler`, `VerifyEntry`, `ExecuteUnlock`, `AdminHandler`, `GraceExpiryCron`), EventBridge EventBus. |
| **`frontend`** / **`ui`** | `CrossboxFrontendStack` | `CrossboxGymDevFrontendStack` | S3 Buckets (`AppAssetsBucket`, `AdminAssetsBucket`), CloudFront Distributions (`AppDistribution`, `AdminDistribution`), S3 Bucket Deployments. |

---

## 2. Selective Stack Deployments (`npm run deploy`)

> [!IMPORTANT]
> **Golden Rule**: NEVER redeploy all stacks unless cross-stack interfaces/contracts change. Always target only the specific stack(s) you modified to save deployment time and reduce CloudFormation risk.

### Commands Syntax

Our deployment runner `scripts/deploy.mjs` handles stack targeting and environment prefixing automatically.

#### A. Deploy API Stack Only (Lambda logic, routes, EventBridge)
```bash
npm run deploy -- -s api
```

#### B. Deploy API Stack with Hotswap (Instant Lambda Code Push)
When modifying TypeScript code in `lib/handlers/*` (without changing IAM or CDK resource definitions), use `--hotswap` to update Lambda code directly in seconds bypassing CloudFormation changeset creation:
```bash
npm run deploy -- -s api --hotswap
```

#### C. Deploy Frontend Stack Only (S3 Buckets & CloudFront CDK updates)
```bash
npm run deploy -- -s frontend
```

#### D. Deploy Data Stack Only (DynamoDB schema, Cognito, SQS changes)
```bash
npm run deploy -- -s data
```

#### E. Deploy Multiple Specific Stacks
```bash
npm run deploy -- -s api,frontend
```

#### F. Full Stack Deployment (All Stacks)
```bash
npm run deploy
```

---

## 3. Fast UI Deployment (Direct S3 Sync + CloudFront Invalidation)

When making frontend changes in `frontend/app` (Member App) or `frontend/admin` (Admin App), running a full CDK deploy is unnecessary. You can update the UI instantly via AWS CLI S3 sync and CloudFront cache invalidation.

### Safe UI Release

Use the scripted release path for UI-only changes:

```bash
npm run deploy:ui
```

It builds both Vite applications, reads the deployed API Gateway and Cognito configuration from `cdk-outputs.json`, writes the matching `config.json` into each artifact, uploads to the two S3 buckets, and invalidates both CloudFront distributions. It fails without the required deployed outputs instead of publishing an empty API URL.

Deploy the frontend CDK stack first whenever the frontend infrastructure or its outputs change:

```bash
npm run deploy -- -s frontend
```

---

## 4. Debugging Lambdas & Reading Logs via AWS CLI

When investigating backend API errors or testing Lambda handlers, use the AWS CLI `aws logs` and `aws lambda` tools.

### A. List Project Lambdas
```bash
aws lambda list-functions --query "Functions[?contains(FunctionName, 'Crossbox')].FunctionName" --output table
```

### B. Read Real-Time Live Logs (Tail)
Tail log output in real-time as requests hit the API:
```bash
aws logs tail /aws/lambda/<FunctionName> --follow
```
*Example:*
```bash
aws logs tail /aws/lambda/CrossboxGymDevApiStack-AuthHandler... --follow
```

### C. View Recent Log Entries
View logs for the last 15 minutes or 1 hour:
```bash
aws logs tail /aws/lambda/<FunctionName> --since 15m
aws logs tail /aws/lambda/<FunctionName> --since 1h
```

### D. Filter Logs for Errors & Exceptions
Filter CloudWatch log events for errors:
```bash
aws logs tail /aws/lambda/<FunctionName> --filter-pattern "ERROR" --since 24h
```

### E. List & Inspect Log Streams
```bash
aws logs describe-log-streams --log-group-name /aws/lambda/<FunctionName> --order-by LastEventTime --descending --limit 5
```

### F. Invoke Lambda Function Directly via CLI
Invoke a Lambda with a mock API Gateway event payload to test execution and response:
```bash
aws lambda invoke --function-name <FunctionName> --payload '{"body": "{\"action\":\"login\"}"}' response.json
cat response.json
```

---

## 5. Additional Serverless & CDK Best Practices

1. **Environment Variables**:
   - Copy `.env.example` to `.env` to set local environment variables (`AWS_REGION`, `STRIPE_TEST_SECRET_KEY`, etc.).
   - `.env` is automatically parsed by `scripts/deploy.mjs` and `bin/app.ts`.

2. **Integration Testing**:
   - Fast test execution against deployed infrastructure:
     ```bash
     npm run test:integration:fast
     ```
   - Full test run (deploy then test):
     ```bash
     npm run test:integration:full
     ```

3. **Seeding Test Data**:
   - Seed initial admin users and system data:
     ```bash
     npm run seed
     ```

4. **Resource Removal Safety**:
   - Stacks set `isTest` flag based on CDK context or environment. When `isTest` is `true`, S3 buckets and DynamoDB tables use `RemovalPolicy.DESTROY` for fast cleanup during teardown (`npm run destroy`). Ensure production deployments use persistent configurations.
