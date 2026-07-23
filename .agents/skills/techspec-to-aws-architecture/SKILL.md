---
name: techspec-to-aws-architecture
description: 'Convert a technology-agnostic technical specification (or PRD) into an AWS serverless architecture design, iteratively asking clarifying questions one at a time until every architecture decision is resolved. Use when: user provides a tech spec / PRD file path and asks to design the AWS architecture, pick AWS services, design DynamoDB tables, design Step Functions workflows, design API Gateway routes, or produce a serverless architecture document. Restricted to AWS serverless services only (Lambda, DynamoDB, Step Functions, API Gateway, IAM, SQS, SNS, EventBridge, S3, Cognito, AppSync, Aurora Serverless) — never proposes EC2, ECS/EKS, self-managed servers, containers, or non-AWS clouds. Produces a design document only, not IaC code.'
argument-hint: 'path to the technical spec/PRD file, e.g. docs/technical-spec.md'
---

# Tech Spec → AWS Serverless Architecture

Turns a technology-agnostic technical specification (ideally the output of the `prd-to-techspec`
skill) into a concrete **AWS serverless architecture design** through a one-question-at-a-time
clarification loop. The output describes **which AWS services**, **how they connect**, and
**why** — a design document, not implementation code.

## When to Use
- User points to a tech spec / PRD file and wants an AWS serverless architecture designed from it.
- User wants DynamoDB table/index design, Step Functions workflow design, API Gateway route
  design, SQS/SNS messaging design, or IAM role/policy design derived from documented behavior.
- User wants all architecture ambiguities (scale, consistency, orchestration, access patterns)
  resolved before any infrastructure-as-code or implementation work starts.

## Hard Constraints
- **AWS only.** Never propose non-AWS clouds, tools, or services.
- **Serverless only.** Allowed building blocks: Lambda, DynamoDB (+ Streams), Step Functions,
  API Gateway (REST/HTTP/WebSocket), IAM, SQS, SNS, EventBridge, S3, Cognito, AppSync, Aurora
  Serverless v2, Kinesis Data Streams (on-demand), Fargate is **not** allowed unless the user
  explicitly asks for it. Never propose EC2, self-managed containers/VMs, ECS/EKS, or any
  non-serverless/always-on compute or database.
- **Design document only.** Do not generate CDK/SAM/CloudFormation/Terraform code in this skill.
  If the user wants IaC, note it as a follow-up step, not part of this output.
- If the input document mentions a technology choice already, record it verbatim as a constraint
  but do not question or replace it.

## Procedure

### 1. Load the input document
- Resolve the file path (ask the user if not provided or ambiguous via `argument-hint`).
- Read the full document before doing anything else. Confirm it describes behavior/data/flows
  (a tech spec or PRD) — if it already contains technology choices, treat those as fixed
  constraints, not decisions to make.
- The expected/canonical shape (produced by the `prd-to-techspec` skill) has these sections:
  Overview, Actors & Roles, Functional Requirements (`FR-n` table), Business Rules, Data
  Entities (table with Attributes/Created by/Read by/Updated by/Deleted by/Retention),
  Workflows/User Flows, Non-Functional Requirements, Scope (In/Out), Open Questions, and a
  Resolved Ambiguities Log. If the document matches this shape, use the per-section mapping in
  step 2 directly. If it doesn't (a raw PRD or free-form notes), extract the equivalent
  information before mapping — do not skip sections just because they're not labeled the same.
- Treat the source document's **Resolved Ambiguities Log** and any non-empty **Open Questions**
  as locked product decisions: carry them forward as constraints, never re-ask them as if they
  were architecture ambiguities. Only ask about ambiguities that are new at the AWS-design layer.

### 2. First-pass mapping
Build a working draft using the [architecture template](./assets/architecture-template.md).
Walk the source document section by section and produce a candidate AWS mapping, tagging every
row with the source ID it traces back to (`FR-n`, entity name, or flow name) so the design stays
audit-able against the spec:

| Source section | Maps to |
|---|---|
| Actors & Roles | IAM principals / Cognito user groups or API Gateway authorizers — one row per actor |
| Functional Requirements (`FR-n`) | One or more Lambda functions + API Gateway route or Step Functions task per FR; keep the `FR-n` id in the design row |
| Business Rules | Validation/enforcement placement — Lambda business logic, DynamoDB conditional expressions/transactions, or Step Functions Choice states |
| Data Entities table | Direct input to DynamoDB table design: `Attributes` → item attributes, `Created/Read/Updated/Deleted by` → access patterns (drives PK/SK/GSI choice), `Retention` → TTL attribute or "none" |
| Workflows / User Flows | Each multi-step flow is a candidate Step Functions workflow (if stateful/long-running/branching) or a simple synchronous Lambda chain (if short and linear) — decide per flow, don't default to one or the other |
| Non-Functional Requirements | Observability section + IAM/security notes; never a blocking item |
| Scope (In/Out) | Bounds which AWS resources are proposed — do not design AWS resources for explicitly out-of-scope capabilities |

Mark every candidate mapping `[ASSUMPTION]` or `[UNRESOLVED]` until confirmed — do not treat a
first-pass guess as final.

### 3. Detect ambiguities
Scan the draft against these categories and collect a running, ranked ambiguity list
(rank by how many downstream decisions they block):
- **Data access patterns** — what queries/lookups are needed per entity; drives DynamoDB
  partition key / sort key / GSI design and capacity mode (on-demand vs provisioned).
- **Consistency requirements** — strong vs eventual consistency per read path.
- **Orchestration vs choreography** — does a flow need a stateful Step Functions workflow
  (with retries/branching/timeouts), or is a simple Lambda-to-Lambda / event chain enough?
- **Sync vs async boundaries** — which operations must respond immediately (API Gateway +
  Lambda, synchronous) vs can be queued/fanned-out (SQS, SNS, EventBridge).
- **Pub/sub vs point-to-point** — one consumer (SQS) vs multiple independent consumers (SNS/EventBridge).
- **API exposure & auth model** — REST vs HTTP API, public vs authenticated, which identity
  mechanism (Cognito, IAM, API key) fronts each route.
- **Idempotency & retry semantics** — what happens on duplicate delivery or retried steps.
- **Error handling & dead-letter behavior** — what happens to failed messages/executions.
- **Throughput/scale expectations** — only if implied by the domain; drives on-demand vs
  provisioned capacity choices. Don't chase precise numbers for an MVP/POC unless the source
  document raises them.
- **IAM boundaries** — least-privilege intent per component (what can this Lambda/service
  actually read/write), not full policy JSON.
- **Data lifecycle** — TTL/expiry, archival needs, if relevant to DynamoDB/S3 design.
- **Observability** — treat as nice-to-have/non-blocking (CloudWatch logs/metrics/alarms);
  never block on it.

Skip categories the source document already answers unambiguously.

### 4. Resolve one ambiguity at a time
For each item, in ranked order:
1. Ask a single, specific, closed-ended question (use the ask-questions tool with concrete
   AWS-service-level options plus freeform) — e.g. "Should order state transitions be an SQS
   queue per stage, or one Step Functions Standard workflow per order?"
2. Update the draft immediately with the answer, including the concrete AWS service and its
   configuration (e.g. table keys, queue name, state names).
3. Re-scan just the affected section for *new* ambiguities the answer introduces.
4. Move to the next item. Do not batch multiple unresolved questions into one turn.

Repeat until the ambiguity list is empty **or the user tells you to stop** (see step 5) —
whichever comes first.

### 5. Completion is user-driven, not automatic
This loop does not stop itself. After each resolved ambiguity (or small batch of related ones),
run the completeness checklist below as a *generator of more questions*, not as a stop condition:
- [ ] Every entity/flow in the source document maps to a concrete AWS service (no bare
      "TBD" or `[UNRESOLVED]` markers).
- [ ] Every DynamoDB table has a defined partition key, sort key (if any), and GSIs needed to
      satisfy every stated access pattern.
- [ ] Every Step Functions workflow has defined states, transitions, and failure/retry handling.
- [ ] Every API Gateway route has a defined method, auth mechanism, and backing Lambda.
- [ ] Every SQS/SNS/EventBridge resource has defined producers, consumers, and DLQ behavior.
- [ ] Every Lambda has a stated trigger and a one-line responsibility.
- [ ] IAM intent is stated per component (least-privilege direction, not full policy text).
- [ ] No non-serverless or non-AWS service appears anywhere in the design.
- [ ] Scope boundaries (in-scope vs out-of-scope for this design pass) are explicit.
- [ ] Every row in the design traces back to a source `FR-n`, entity, actor, or flow name —
      no orphaned AWS resources with no corresponding spec requirement.
- [ ] Every Business Rule in the source document has a stated enforcement mechanism
      (Lambda logic, DynamoDB conditional write/transaction, or Step Functions Choice state).

If a checklist item fails, surface it as the next ambiguity question (step 4) — do not silently
fix it and do not treat a passing checklist as permission to finish. Keep iterating and
surfacing new gaps for as long as they exist.

Only stop the clarification loop when the user explicitly says the equivalent of "we are done" /
"that's enough" / "stop here". If the user says this while known `[UNRESOLVED]` items or
checklist gaps remain, mark those remaining items in the design's "Open Questions" section rather
than blocking — the user's stop signal always wins.

### 6. Confirm and save
- Present a short summary of what was decided (list of Q&A resolved) plus the final design,
  including a Mermaid architecture diagram.
- This is triggered by the user's stop signal from step 5 — do not ask a separate "are you done"
  confirmation before it.
- Save to `docs/aws-architecture.md` (create the `docs/` folder if missing), unless the user
  specifies a different path.

## Output
A single Markdown file following the [template](./assets/architecture-template.md): a concrete,
AWS-serverless-only architecture design (services, data model, workflows, messaging, IAM intent,
diagram) ready to hand off to an IaC implementation step.
