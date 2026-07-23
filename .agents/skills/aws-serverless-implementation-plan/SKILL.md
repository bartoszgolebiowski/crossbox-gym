---
name: aws-serverless-implementation-plan
description: 'Turn a technical AWS serverless architecture (service list, diagram description, or design doc) into an ordered, AWS CDK-oriented implementation plan, iteratively asking clarifying questions one at a time until every ambiguity is resolved or the user says done. Use when: user provides an AWS serverless architecture and asks for an implementation plan, build plan, or task breakdown; wants missing triggers, IAM permissions, error handling, or resource sequencing clarified before coding starts; says "turn this architecture into a plan", "plan the implementation", "break down this AWS design". Targets AWS CDK conventions for structure; does not write actual CDK or application code.'
argument-hint: 'path to the architecture doc/diagram description, e.g. docs/architecture.md'
---

# AWS Serverless Architecture → Implementation Plan

Turns a technical AWS serverless architecture into a precise, ordered, buildable implementation
plan through a one-question-at-a-time clarification loop. The output describes **what to build,
in what order, and with what configuration** (triggers, IAM, observability) — it does not contain
actual CDK/application code.

## When to Use
- User points to (or pastes) an AWS serverless architecture — a service list, diagram
  description, or design doc — and wants it turned into an implementation plan.
- The architecture has under-specified triggers, permissions, error handling, or build order.
- User wants all open questions resolved *before* writing any CDK or Lambda code.

## Target Conventions
Plans assume **AWS CDK** as the IaC tool (stacks/constructs, `cdk deploy` ordering) unless the
user's architecture doc states a different tool — record that verbatim and adapt terminology,
but don't ask the user to pick a tool if one is already implied.

## Default Assumptions (MVP-style, don't ask about these)
Unless the architecture doc explicitly says otherwise, apply these defaults to keep the loop
focused on real build ambiguity, not boilerplate:
- **Environments**: single default stage/environment (no dev/stage/prod split) unless multiple
  are mentioned. Note the assumption in the plan; don't ask.
- **Cost optimization**: out of scope for this pass — omit the topic, don't ask.
- **Testing strategy**: nice-to-have — add one short "Testing follow-up" bullet per compute
  resource (e.g. "unit test handler logic") but never treat missing test detail as a blocking
  ambiguity.

## Procedure

### 1. Load the architecture
- Resolve the file path or inline description (ask the user if not provided or ambiguous via
  `argument-hint`).
- Read/parse the full architecture before doing anything else — list every AWS resource
  mentioned (compute, storage, messaging, API surface, IAM, networking).

### 2. First-pass extraction
Build a working draft using the [implementation plan template](./assets/implementation-plan-template.md).
For every resource found, add a row/entry with what's already known. Leave a field explicitly
marked `[UNRESOLVED]` if the architecture doesn't cover it — do not invent configuration.

### 3. Detect ambiguities
Scan the draft and architecture for these categories, and collect a running ambiguity list. Skip
anything covered by the MVP defaults above (environments, cost, deep testing):
- **Missing trigger/event source** — a Lambda or consumer with no defined invoker (API Gateway
  route, EventBridge rule, SQS queue, S3 event, Step Functions state, schedule, etc.).
- **IAM/least-privilege gaps** — a resource that needs access to another with no permission
  scope defined (which actions, which resource ARN pattern).
- **API surface auth** — API Gateway/AppSync endpoints with no stated auth method (IAM, Cognito,
  API key, JWT authorizer, or explicitly public).
- **Data shape/access pattern gaps** — DynamoDB tables missing partition/sort key design or
  access patterns; S3 buckets missing key structure or lifecycle notes.
- **Error handling & retries** — no defined behavior for failures (DLQ, retry policy, on-failure
  destination) for async invocations (SQS, SNS, EventBridge, Step Functions).
- **Concurrency/limits** — nothing implied about reserved/provisioned concurrency where it would
  matter (e.g. throttling a downstream dependency) — only flag if the architecture implies a
  sensitive downstream limit.
- **Secrets/config management** — credentials or config values with no stated source (env var,
  SSM Parameter Store, Secrets Manager).
- **Networking** — a resource that needs VPC placement (e.g. RDS, ElastiCache access) with no
  stated networking setup.
- **Build/deploy order & dependencies** — resources that depend on each other with no implied
  sequencing (e.g. a Lambda needs a table ARN that must exist first).
- **Observability gaps** — no stated logging, tracing (X-Ray), or alarms for a compute resource.
- **Contradictions** — two parts of the architecture that can't both be true.

Rank the list by blocking impact: resolve items that affect the most other resources or the
build order first.

### 4. Resolve one ambiguity at a time
For each item, in ranked order:
1. Ask a single, specific, closed-ended question (use the ask-questions tool with concrete
   options — e.g. auth method choices, DLQ vs. no DLQ, sync vs. async — plus freeform when
   useful). Avoid open "how do you want this to work" questions.
2. Update the draft plan immediately with the answer, including the affected resource's IAM/
   trigger/observability fields.
3. Re-scan just the affected resource(s) for *new* ambiguities the answer may have introduced
   (e.g. picking Cognito auth introduces a "which user pool" question).
4. Move to the next item. Do not batch multiple unresolved questions into one turn.

Repeat until the ambiguity list is empty **or the user tells you to stop** (see step 5) —
whichever comes first.

### 5. Completion is user-driven, not automatic
This loop does not stop itself. After each resolved ambiguity (or small batch of related ones),
run the completeness checklist below as a *generator of more questions*, not as a stop condition:
- [ ] Every resource in the architecture has an entry in the implementation order.
- [ ] Every compute resource (Lambda, Fargate task) has a defined trigger.
- [ ] Every resource has explicit least-privilege IAM notes (no `*` actions/resources without
      justification).
- [ ] Every API surface has a stated auth method.
- [ ] Every async integration has a stated error-handling/retry/DLQ behavior.
- [ ] Every stateful resource has an access pattern or key-design note.
- [ ] Build order accounts for cross-resource dependencies.
- [ ] Every compute resource has at least a minimal observability note (logs/tracing/alarms).
- [ ] No two parts of the plan contradict each other.
- [ ] No `[UNRESOLVED]` markers remain.

If a checklist item fails, surface it as the next ambiguity question (step 4) — do not silently
fix it and do not treat a passing checklist as permission to finish. Keep iterating and
surfacing new gaps for as long as they exist.

Only stop the clarification loop when the user explicitly says the equivalent of "we are done" /
"that's enough" / "stop here". If the user says this while known `[UNRESOLVED]` items or
checklist gaps remain, mark those remaining items in the plan's "Open Questions" section rather
than blocking — the user's stop signal always wins.

### 6. Confirm and save
- Present a short summary of what was clarified (list of Q&A resolved) plus the final plan.
- This is triggered by the user's stop signal from step 5 — do not ask a separate "are you done"
  confirmation before it.
- Save to `docs/implementation-plan.md` (create the `docs/` folder if missing), unless the user
  specifies a different path.

## Output
A single Markdown file following the [template](./assets/implementation-plan-template.md): an
ordered, resource-by-resource AWS CDK implementation plan with triggers, IAM, and observability
resolved, ready to hand off to actual CDK/code implementation.
