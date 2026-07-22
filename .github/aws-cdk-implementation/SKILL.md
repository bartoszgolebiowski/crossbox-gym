---
name: aws-cdk-implementation
description: 'Implement an AWS CDK (Node.js/TypeScript) serverless application from an implementation plan, then write a CLI-invocable integration test suite that deploys the stack, exercises its main flow and edge cases, and always destroys it afterward. Use when: user has an implementation-plan.md (or AWS serverless architecture doc) and wants actual CDK code written; wants integration tests that deploy, validate, and tear down a CDK stack to prove it really works end-to-end; says "implement this plan", "build the CDK app", "write integration tests against the deployed stack", "turn the plan into code". Implementation always comes first, integration tests second; tests run via a single CLI command (npm script) that deploys real AWS resources, tests against them (discovered via CloudFormation stack outputs, never mocked), then destroys them.'
argument-hint: 'path to implementation plan, e.g. docs/implementation-plan.md'
---

# AWS CDK Implementation + Integration Tests

Turns an AWS serverless implementation plan into a real Node.js/TypeScript CDK application, then
adds a CLI-invocable integration test suite that **deploys the stack, exercises its main flow and
edge cases, then always destroys it** — proving the system works without leaving billable
infrastructure behind. Two strict phases, in order: **implementation first, integration tests
second.**

## When to Use
- User has an implementation plan (e.g. `docs/implementation-plan.md`, typically produced by the
  `aws-serverless-implementation-plan` skill) and wants the actual CDK/Lambda code written.
- User wants integration tests that prove a deployed stack behaves correctly — not unit tests,
  not mocked tests.
- User wants those tests runnable from the command line (CI or local terminal).

## Target Conventions
- **IaC**: AWS CDK, TypeScript, Node.js.
- **Lambda runtime**: Node.js (TypeScript), unless the plan states otherwise.
- **Integration test runner**: Node's built-in test runner (`node:test` + `node:assert/strict`)
  run via `tsx` — no extra test framework dependency required unless the repo already has one.
- **Resource discovery for tests**: CloudFormation stack outputs (`DescribeStacksCommand`) —
  never hardcode ARNs, URLs, or table names in a test.

## Phase Order (strict)
1. **Implementation** — CDK app + Lambda handler code, validated with `cdk synth`.
2. **Integration tests** — an ephemeral **deploy → test → destroy** lifecycle: the stack is
   deployed, the test suite runs against it, then the stack is always destroyed afterward
   (success or failure) so no billable resources are left running. This is how the user
   confirms the system really works end-to-end without leaving infrastructure behind.

Never start Phase 2 before Phase 1's code synths cleanly. Never run the deploy → test → destroy
lifecycle without explicit user confirmation first — it performs real, billable deploy/destroy
actions against AWS, and **destroys the named stack unconditionally when it finishes**. Only
ever run it against a dedicated, disposable stack instance — confirm the exact stack name with
the user every time, and never against a stack they rely on staying up.

## Phase 1: Implementation

### 1. Load context
- Read the implementation plan (path from `argument-hint`, or ask if not provided/found).
- Follow any links to architecture/tech-spec docs it references for extra detail the plan
  omits.
- Extract: full resource list, the plan's numbered **Implementation Order**, and each
  resource's CDK construct, trigger, IAM notes, error handling, and observability notes.

### 2. Scaffold or reuse the CDK project
See [CDK project conventions](./references/cdk-conventions.md) for file layout, naming, and
tagging details. If a CDK app already exists in the repo, extend it — never scaffold a second
one alongside it.

### 3. Implement resources in the plan's order
Follow the plan's **Implementation Order** section exactly — a resource's dependencies must
exist in code before the resource references them (e.g. a table defined before the Lambda that
calls `grantReadWriteData` on it). For each resource:
- Create the CDK construct matching the plan's **CDK construct** field.
- Wire the **trigger/event source** exactly as specified (API Gateway route, Step Functions
  task, EventBridge rule, queue, schedule, custom resource lifecycle, etc.).
- Apply **IAM permissions** as least-privilege grants (e.g. `table.grantReadWriteData(fn)`,
  scoped `PolicyStatement`s) — never wildcard actions/resources unless the plan explicitly
  calls for it.
- Implement **error handling/retries** (DLQ, retry policy, Step Functions `addCatch`/`addRetry`)
  exactly as specified.
- Apply the **observability** notes as specified (log retention, tracing on/off, alarms) —
  don't add extras the plan didn't ask for.
- Write real Lambda handler logic implementing the described behavior (no stub `TODO` bodies).
  Keep handlers thin; put shared logic in importable lib modules.
- Add a `CfnOutput` for **every** resource identifier integration tests will need later: API
  base URL, table names, queue URLs, state machine ARN, etc. This is the only supported way
  tests discover deployed resources — if it's not output, it can't be tested.

### 4. Validate
- Run `npx cdk synth` and fix any compile/synth errors before moving to the next resource
  group. Do this at least once at the end even if run incrementally.
- Do **not** run `cdk deploy` yourself during this phase — that belongs to the Phase 2
  deploy → test → destroy lifecycle, run only with explicit confirmation.

### 5. Confirm before Phase 2
Confirm the stack name + region to use for the ephemeral test lifecycle, and get explicit
confirmation that it's safe to deploy-then-destroy that stack (i.e. it's not a persistent
deployment someone relies on).

## Phase 2: Integration Tests

### 1. Location, runner, CLI entry point
- Put tests under `integration-tests/`, one `*.test.ts` file per user-facing flow or resource
  group.
- Copy the [deploy → test → destroy orchestrator](./assets/run-integration-tests.mjs) into
  `scripts/run-integration-tests.mjs` and add this npm script:
  ```json
  "scripts": {
    "test:integration": "node scripts/run-integration-tests.mjs"
  }
  ```
- Invocation: `npm run test:integration -- --stack <StackName> --region <region>`. The script:
  1. Runs `cdk deploy <stack> --require-approval never`.
  2. Runs the test suite (`node --import tsx --test integration-tests/**/*.test.ts`) against the
     now-live stack.
  3. Runs `cdk destroy <stack> --force` in a `finally` block — **always**, whether tests passed
     or failed — so no billable resources are left behind.
- Support both CLI flags (`process.argv`) and env vars (`STACK_NAME`, `AWS_REGION`) as a
  fallback, so it also works unattended in CI.

### 2. Discover deployed resources
Copy the [stack-outputs helper](./assets/stack-outputs.ts) into
`integration-tests/lib/stack-outputs.ts`. It wraps `@aws-sdk/client-cloudformation`
`DescribeStacksCommand` for the given stack name/region and returns a `Record<key, value>` of
every `CfnOutput`. Every test resolves identifiers through this helper — never hardcoded. By the
time tests run, the orchestrator has already deployed the stack, so outputs are guaranteed to
exist.

### 3. Write tests: main flow first, then edge cases
Use the [example test template](./assets/example-flow.test.ts) as the starting pattern. For
each primary user-facing workflow in the plan/architecture:
1. One test (or `describe` block) drives the **main/happy-path flow end-to-end** using real
   AWS SDK v3 clients or HTTP calls against the deployed API — assert on real responses, and on
   real downstream state (DynamoDB item, Step Functions execution status) where useful.
2. Then add edge cases **derived from the plan's own error-handling/validation notes only** —
   don't invent scenarios the plan doesn't imply. Typical categories, only where the plan
   implies them:
   - Invalid/missing input at an API route (expect 4xx).
   - Not-found lookups (expect 404) — e.g. unknown id.
   - A documented failure/catch path in a state machine.
   - A documented idempotency/concurrency behavior (e.g. duplicate submission).
- Use unique, prefixed test data for every write (e.g. `test-${Date.now()}-...`). Cleanup of
  individual test rows in `after()`/`afterEach()` is still good practice for readability/fast
  reruns, but isn't load-bearing — the whole stack (and all its data) is destroyed after the run
  regardless.
- Every test must exercise the real deployed resource — never mock the AWS SDK or the API.

### 4. Confirm before running
Running `npm run test:integration` deploys real AWS infrastructure, performs real writes, and
then **destroys that infrastructure unconditionally** when it's done. Before executing it, tell
the user exactly what will be deployed and destroyed and get explicit confirmation — never run
it silently while "finishing up", and never run it against a stack name that isn't a disposable,
dedicated test instance.

## Completion Checklist
- [ ] Every resource from the plan's Implementation Order is implemented, in that order.
- [ ] Every IAM grant is least-privilege and matches the plan (no unexplained wildcards).
- [ ] Every trigger/event source matches the plan.
- [ ] Every resource identifier a test needs is exposed via `CfnOutput`.
- [ ] `cdk synth` succeeds with no errors.
- [ ] Integration tests cover the main flow end-to-end against the deployed stack.
- [ ] Integration tests cover edge cases implied by the plan's error-handling notes (no invented
      scenarios).
- [ ] The whole lifecycle runs via one CLI command (`npm run test:integration`).
- [ ] The stack is always destroyed after the run, success or failure (`finally` block, not
      conditional on test outcome).
- [ ] No test hardcodes a resource identifier — all resolved via stack outputs.
- [ ] The user confirmed the stack name is a disposable test instance before the first run.

## Output
- A CDK TypeScript app implementing the plan (`bin/`, `lib/`, Lambda handler code, `CfnOutput`s).
- An `integration-tests/` suite plus a `scripts/run-integration-tests.mjs` orchestrator, runnable
  via `npm run test:integration -- --stack <name> --region <region>`: deploys the stack, runs the
  main flow + plan-derived edge cases against it, then destroys the stack unconditionally.
