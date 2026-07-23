# CDK Project Conventions (TypeScript / Node.js)

Reference for Phase 1 of the `aws-cdk-implementation` skill.

## File layout

```
bin/<app-name>.ts        # CDK app entry point, instantiates the stack(s)
lib/<name>-stack.ts       # Main stack — composes constructs
lib/constructs/*.ts       # One file per resource group when the plan has many resources
lib/handlers/<fn>/        # One folder per Lambda, e.g. lib/handlers/list-products/index.ts
cdk.json
tsconfig.json
package.json
```

Split `lib/<name>-stack.ts` into `lib/constructs/*.ts` once a single stack file would exceed
roughly 200-300 lines or ~10 resources — group by domain area (e.g. `products.ts`, `cart.ts`,
`checkout.ts`, `fulfillment.ts`), matching the plan's own resource groupings if it has them.

## Scaffolding

If no CDK app exists yet, scaffold with `npx cdk init app --language typescript` in an empty
directory (or a dedicated subfolder if the repo has other content, e.g. `docs/`), then add
`@aws-sdk/client-cloudformation` as a dependency of the (future) integration tests and, if
Lambdas need other AWS SDK v3 clients at runtime, those too.

## Lambda bundling

Use `aws-cdk-lib/aws-lambda-nodejs`'s `NodejsFunction` construct for every handler, not the raw
`lambda.Function` with a pre-zipped asset — it bundles TypeScript with esbuild automatically, so
handler source lives directly under `lib/handlers/<fn>/index.ts` with no manual build step.

## Naming

- Construct IDs match the plan's resource names verbatim (e.g. `ProductsTable`, `SubmitOrder`)
  so the plan can be cross-referenced against the code.
- Stack name: derive from the plan's system name (e.g. `OrderManagementStack`) unless the user
  states otherwise.
- `CfnOutput` export names: `<StackName>-<ResourceName>-<Field>` (e.g. `ApiBaseUrl`,
  `ProductsTableName`) — stable, predictable names the integration tests rely on.

## IAM

- Prefer grant methods (`table.grantReadData(fn)`, `queue.grantSendMessages(fn)`,
  `stateMachine.grantStartExecution(fn)`) over hand-written `PolicyStatement`s — they scope to
  the exact resource ARN automatically.
- When a hand-written `PolicyStatement` is unavoidable, scope `resources` to the specific ARN,
  never `['*']`, unless the plan explicitly says the action requires it (e.g. `cloudwatch:*`
  namespace-level metrics with no ARN concept).

## Error handling

- Async Lambda integrations (SQS, SNS, EventBridge targets): configure `deadLetterQueue` and
  `retryAttempts` per the plan's notes.
- Step Functions tasks: use `.addRetry({...})` / `.addCatch({...})` matching the plan's stated
  retry/catch behavior; don't add defaults the plan doesn't mention.

## Observability

- Default Lambda log retention should be set explicitly (e.g. `logRetention: RetentionDays.ONE_WEEK`)
  rather than left as CDK's default (infinite) — unless the plan states a retention value, ask
  once rather than guessing.
- X-Ray tracing: only enable (`tracing: Tracing.ACTIVE`) if the plan says so.

## Outputs required for integration tests

Every one of these, if present in the plan, needs a `CfnOutput`:
- API Gateway/AppSync base URL.
- Table names (not ARNs — the AWS SDK v3 DynamoDB client needs table *names*).
- Queue URLs (not ARNs — `SendMessageCommand` needs the URL).
- State machine ARN.
- Any custom-resource-produced value a test might need to assert against.

## Seed/custom resource data

If the plan calls for seeding data (e.g. a custom resource reading a JSON fixture file), bundle
the fixture as a CDK asset and keep the seeding Lambda idempotent (overwrite-by-key) so repeated
`cdk deploy` runs don't duplicate rows — this also keeps integration tests deterministic across
reruns.
