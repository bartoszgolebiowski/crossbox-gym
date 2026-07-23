---
name: prd-to-techspec
description: 'Convert a PRD (Product Requirements Document / business requirements doc) into a technology-agnostic technical specification, iteratively asking clarifying questions one at a time until every ambiguity is resolved. Use when: user provides a PRD or business requirements file and asks to turn it into a technical spec, functional spec, or requirements analysis; wants gaps, contradictions, or vague requirements clarified before implementation starts; says "analyze this PRD", "clarify requirements", "turn business requirements into a tech spec". Does NOT choose technologies, frameworks, or architecture — output stays implementation-agnostic.'
argument-hint: 'path to the PRD file, e.g. docs/prd.md'
---

# PRD → Technical Specification

Turns a business-facing PRD into a precise, unambiguous, technology-agnostic technical
specification through a one-question-at-a-time clarification loop. The output describes
**what** the system must do (behavior, rules, data, flows) — never **how** it is built
(no languages, frameworks, databases, or libraries).

## When to Use
- User points to a PRD / business requirements file and wants it turned into a technical spec.
- Requirements contain vague terms, missing edge cases, undefined actors, or conflicting statements.
- User wants all open questions resolved *before* any implementation or tech-stack discussion.

## Hard Constraint
Never introduce or ask about technology choices (languages, frameworks, databases, hosting,
libraries, architecture patterns). If the PRD itself mentions a technology, record it verbatim
as a constraint but do not expand on it or suggest alternatives. Tech-stack decisions are out of
scope for this skill.

## Default Assumptions (MVP/POC)
Unless the PRD explicitly says otherwise, apply these defaults instead of asking about them —
they exist to keep the loop focused on real product ambiguity, not boilerplate:
- **Tenancy**: single-tenant.
- **Audit/logging**: nice-to-have — note it as an optional, non-blocking item in Non-Functional
  Requirements; never treat its absence as an ambiguity to resolve.
- **Compliance/regulatory**: out of scope for this pass — omit the topic entirely, don't ask.
- Treat the spec as for an MVP/POC: favor "good enough to build and test the core flow" over
  exhaustive enterprise-grade requirements (e.g. don't chase multi-region scale, RBAC depth, or
  disaster-recovery detail unless the PRD raises it).

## Procedure

### 1. Load the PRD
- Resolve the file path (ask the user if not provided or ambiguous via `argument-hint`).
- Read the full document before doing anything else.

### 2. First-pass extraction
Build a working draft using the [technical spec template](./assets/tech-spec-template.md).
For every section, extract what the PRD already states. Leave a section explicitly marked
`[UNRESOLVED]` if the PRD doesn't cover it — do not invent content.

### 3. Detect ambiguities
Scan the draft and PRD for these categories, and collect a running ambiguity list. Skip
anything covered by the MVP/POC defaults above (tenancy, audit, compliance):
- **Vague quantifiers/terms** — "fast", "many", "some users", "soon", "appropriate" without a definition.
- **Undefined actors/roles** — mentioned but not described (permissions, what they can/can't do).
- **Missing acceptance criteria** — a requirement with no way to verify it's satisfied.
- **Edge cases & error paths** — what happens on invalid input, empty state, concurrent access, limits exceeded.
- **Contradictions** — two statements in the PRD that can't both be true.
- **Data ownership/lifecycle gaps** — what data exists, who creates/reads/updates/deletes it, retention.
- **Undefined business rules** — conditions, thresholds, or calculations implied but not specified.
- **Non-functional gaps relevant to an MVP** — expected scale/load, availability expectations, only if implied by the domain.
- **Out-of-scope ambiguity** — unclear whether something is in or out of scope for this iteration.

Rank the list by blocking impact: resolve items that affect the most other requirements first.

### 4. Resolve one ambiguity at a time
For each item, in ranked order:
1. Ask a single, specific, closed-ended question (use the ask-questions tool with concrete
   options plus freeform when possible — avoid open "what do you think should happen" questions).
2. Update the draft spec immediately with the answer.
3. Re-scan just the affected section for *new* ambiguities the answer may have introduced.
4. Move to the next item. Do not batch multiple unresolved questions into one turn.

Repeat until the ambiguity list is empty **or the user tells you to stop** (see step 5) —
whichever comes first.

### 5. Completion is user-driven, not automatic
This loop does not stop itself. After each resolved ambiguity (or small batch of related ones),
run the completeness checklist below as a *generator of more questions*, not as a stop condition:
- [ ] Every section in the template is filled in — no `[UNRESOLVED]` markers remain.
- [ ] Every functional requirement has a testable/verifiable acceptance criterion.
- [ ] Every actor/role referenced has defined permissions and interactions.
- [ ] Every user-facing flow has documented error/edge-case behavior.
- [ ] No two statements in the spec contradict each other.
- [ ] Scope boundaries (in-scope vs out-of-scope) are explicit.
- [ ] No technology, framework, or implementation detail has been introduced by this skill.

If a checklist item fails, surface it as the next ambiguity question (step 4) — do not silently
fix it and do not treat a passing checklist as permission to finish. Keep iterating and
surfacing new gaps for as long as they exist.

Only stop the clarification loop when the user explicitly says the equivalent of "we are done" /
"that's enough" / "stop here". If the user says this while known `[UNRESOLVED]` items or
checklist gaps remain, mark those remaining items in the spec's "Open Questions" section rather
than blocking — the user's stop signal always wins.

### 6. Confirm and save
- Present a short summary of what was clarified (list of Q&A resolved) plus the final spec.
- This is triggered by the user's stop signal from step 5 — do not ask a separate "are you done"
  confirmation before it.
- Save to `docs/technical-spec.md` (create the `docs/` folder if missing), unless the user
  specifies a different path.

## Output
A single Markdown file following the [template](./assets/tech-spec-template.md), fully
resolved, technology-agnostic, ready to hand off to a separate architecture/tech-stack
decision step.
