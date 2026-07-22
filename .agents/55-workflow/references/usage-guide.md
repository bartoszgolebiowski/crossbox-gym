# 55-Workflow Usage Guide

## Example Triggers for Using the 55-Workflow

Use the 55-workflow when you encounter:

### Architectural Complexity
- **Trigger:** "I need to add a new service that affects 3+ existing modules"
- **Why 55-workflow:** Multiple interdependencies require Phase 0 mapping and Phase 3 TODO placement to avoid accidental coupling
- **Phase 4 Pattern:** Use [Whack-A-Mole](./defect-patterns.md#pattern-1-whack-a-mole-bug-loop) test to validate module boundaries

### Data Model Uncertainty
- **Trigger:** "I'm not sure if my schema can handle this new feature requirement"
- **Why 55-workflow:** Phase 1 forces you to define the exact structure upfront; Phase 4 simulation tests it before you commit
- **Phase 4 Pattern:** Use [English-to-Code](./defect-patterns.md#pattern-2-english-to-code-translation-breakdown) test to catch schema conflicts

### High-Risk Changes
- **Trigger:** "Refactoring the payment processing pipeline or fulfillment workflow"
- **Why 55-workflow:** Phase 4 simulation can catch lifecycle timing bugs, orphaned state, and invariant violations
- **Phase 4 Pattern:** Use [Speculative Simulation](./defect-patterns.md#pattern-3-speculative-simulation-failure) test to validate state transitions

### Ambiguous Requirements
- **Trigger:** "I'm not 100% sure how this feature should integrate with the existing API"
- **Why 55-workflow:** Phases 0–2 force clarity; Phase 3 TODOs ensure reviewers can validate design before implementation
- **Phase 4 Pattern:** Use [Agent Slop](./defect-patterns.md#pattern-4-agent-slop-cascade) test to enforce module boundaries

### Cross-Team Collaboration
- **Trigger:** "Multiple engineers need to work on this, but we want coordinated implementation"
- **Why 55-workflow:** Each phase is a natural checkpoint; team can review and discuss before next phase
- **Phase 4.5:** Defect pattern validation ensures all known failure modes are addressed

---

## Chat Prompts to Invoke the Skill

Once created, you can invoke the skill in GitHub Copilot Chat:

```
/55-workflow implement a new discount calculation system
```

```
/55-workflow refactor the authentication flow
```

```
/55-workflow add multi-tenancy support to the order service
```

---

## Phases at a Glance

| Phase | Deliverable | Role |
|-------|-------------|------|
| 0 | Technical plan + module map | Clarify scope |
| 1 | Data structures + types | Define domain model |
| 2 | Function stubs + interfaces | Define API contracts |
| 3 | TODO comments + index | Mark implementation boundaries |
| 4 | Test findings + defect pattern validation | Validate design (then revert) |
| 4.5 | Defect pattern checklist | Confirm known failure modes addressed |
| 5 | Invariants checklist | Define safeguards |
| 6 | Production code + passing tests | Ship feature |

---

## Related Customizations to Consider

After using 55-workflow once, consider creating:

1. **File Instructions** for Phase 0 (`.github/instructions/phase-0-planning.instructions.md`)
   - Checkpoint template for what a good Phase 0 plan looks like
   - Checklist: modules affected, patterns to preserve, constraints documented

2. **File Instructions** for Phase 4 (`.github/instructions/phase-4-testing.instructions.md`)
   - Reference [Defect Patterns](./defect-patterns.md) in your language/framework
   - Test scaffolding templates for each defect pattern

3. **Hooks** for automatic Phase 3 TODO insertion (`.github/hooks/phase-3-validation.json`)
   - Pre-commit hook that validates TODO count and prevents accidental commits during Phase 4
   - Post-commit hook that documents approved phases in commit messages

4. **Custom Agent** for Phase 4 simulation (`55-workflow-simulator.agent.md`)
   - Restricted toolset: can read code, run tests, but CANNOT modify codebase
   - Automates test execution and failure report generation

5. **Prompt** for Phase 4.5 Defect Pattern Validation (`55-workflow-defect-patterns.prompt.md`)
   - Parameterized prompt that accepts Phase 4 findings
   - Generates Phase 4.5 checklist automatically

---

## Troubleshooting

### "I forgot to use the revert script — I modified Phase 4 code"
- Stop immediately
- Run: `bash .github/skills/55-workflow/scripts/revert-phase4.sh`
- Do not commit or merge yet
- Resume at Phase 4 findings review

### "Phase 4 simulation shows I need to redesign Phase 1"
- This is expected! Loop back to Phase 1
- Rewrite data structures
- Resubmit Phase 1 for approval
- Continue through Phases 2 → 3 → 4 → 4.5 again
- Unlimited iterations allowed until Phase 4-4.5 passes

### "Phase 4 simulation passed, but I'm not sure I tested the right defect patterns"
- Review [Defect Patterns Reference](./defect-patterns.md) for your codebase
- Map each pattern (Whack-A-Mole, English-to-Code, Simulation Timing, Agent Slop) to a test scenario
- If a pattern wasn't tested, enhance Phase 4 tests and re-simulate
- Use Phase 4.5 checklist to validate all patterns were covered

### "Phase 4 test failed due to defect pattern X—how do I fix it?"
- Identify which phase (1, 2, or 3) caused the defect
- See [Defect Patterns Reference](./defect-patterns.md) for root causes and solutions
- Make corrections to the appropriate phase
- Re-run Phase 4 simulation targeting that pattern specifically

### "Can't run integration tests — our app doesn't deploy locally"
- Phase 4 simulation should still run unit or isolated component tests
- Mock dependencies as needed (use temporary stubs)
- Document test limitations in Phase 4 report
- Proceed to Phase 4.5 and Phase 5 with explicit caveats

### "Lead Architect rejected Phase 2 interfaces"
- Redesign Phase 2
- Do NOT proceed to Phase 3 until Phase 2 is approved
- Resubmit updated Phase 2 for approval
- Once approved, continue to Phase 3, 4, 4.5
