---
name: 55-workflow
description: 'Enforces a strict, 7-phase architecture-first engineering process with phased verification gates and speculative simulation loops. Use when: implementing complex features that require architectural validation before coding; want to prevent code quality degradation through mandatory approval checkpoints; need speculative testing to validate design assumptions before committing code; says "use 55 workflow", "run 55 process", "implement using 55".'
---

# 55-Workflow: Seven-Phase Architecture-First Engineering

A rigorous engineering protocol that ensures architectural integrity through mandatory approval gates and speculative simulation loops. Prevents code quality degradation by validating each phase before proceeding.

## Core Principle: The Golden Rule (GATING)

**You are FORBIDDEN from advancing to the next phase until explicit approval.**

The user (Lead Architect) must respond with "OK" or explicit approval before any phase advancement. If corrections are provided, rewrite the current phase assets and halt again for approval.

---

## Phase 0: Research & Plan

**Objective:** Establish architectural foundation and dependency map.

**Actions:**
1. Analyze current repository context and file structure
2. Map system architecture and affected modules
3. Identify existing design patterns in related code
4. Document architectural constraints and dependencies
5. Specify exactly which modules will change and what patterns will be preserved

**Output:**
- High-level technical plan with module change list
- Architectural constraints and preserved patterns
- Risk assessment (breaking changes, dependencies)

**Gate:** ✋ Ask: *"Is the Phase 0 Plan approved?"* and HALT.

---

## Phase 1: Data Structures (`structs`)

**Objective:** Define all data models, schemas, and types.

**Actions:**
1. Identify all data structures required for the feature
2. Define type-safe schemas, models, or domain objects
3. Document relationships between structures
4. **DO NOT** write any functional or operational logic

**Output:**
- Clean, type-safe data structures (interfaces, types, classes)
- Clear field documentation and constraints
- Relationship diagrams if complex

**Gate:** ✋ Ask: *"Are the Phase 1 Data Structures approved?"* and HALT.

---

## Phase 2: Interfaces & API Stubs

**Objective:** Define function signatures and service boundaries.

**Actions:**
1. Create function/method headers based on Phase 1 structures
2. Define interface stubs and contracts
3. Ensure minimal surface area—inline simple operations instead of multiplying types
4. Document parameter types and return types
5. **DO NOT** implement function bodies yet

**Output:**
- Code skeleton with function definitions (signatures only)
- No internal logic; structure only
- Clear API contracts

**Gate:** ✋ Ask: *"Are the Phase 2 Interfaces approved?"* and HALT.

---

## Phase 3: Design TODOs

**Objective:** Plant precise implementation markers in source code.

**Actions:**
1. Inject `// TODO:` comments into actual source files at exact locations
2. Each TODO describes what logic belongs there (not how to implement it)
3. Create a structural index mapping file paths, line numbers, and TODO descriptions
4. Use descriptive language: what problem does this solve, what inputs/outputs expected

**Output:**
- Modified source files with TODO comments (Phase 2 code + TODOs)
- Structural index: file path → line number → TODO description
- Clear boundaries for Phase 4 implementation

**Gate:** ✋ Ask: *"Is the Phase 3 TODO distribution approved?"* and HALT.

---

## Phase 4: Speculative Simulation & Revert

**Objective:** Test logic integrity against planned boundaries; identify design gaps before they cascade.

**Actions:**

**Part A: Simulation (Write & Test)**
1. Write temporary implementation inside TODO boundaries
2. Design tests that target your project's **known defect patterns** (see [Defect Patterns Reference](./references/defect-patterns.md)):
   - Whack-A-Mole coupling (cross-module state leaks)
   - English-to-Code translation (data model misalignment)
   - Speculative Simulation timing (lifecycle/invariant violations)
   - Agent Slop (hacky workarounds that blur boundaries)
3. Run integration tests or headless test suite against the mock implementation
   - If integration tests exist, run them directly
   - If no application is running on-host, ensure test framework can execute in isolation
   - Capture all test output, failures, edge cases, and defect pattern observations
4. Document findings: Which defect patterns did the simulation catch? Which tests confirmed boundaries?

**Part B: ⚠️ MANDATORY REVERT (Use Helper Script)**
5. Immediately after capturing output, **revert all modified codebase lines** back to pristine Phase 3 state using the provided [revert-phase4.sh](./scripts/revert-phase4.sh) script
6. The script will:
   - Run `git checkout` to revert modified files
   - Remove all temporary test artifacts and deployed resources
   - Confirm codebase is 100% clean
7. Verify script output confirms success before proceeding

**Output:**
- Simulation debrief report:
  - **Defect patterns validated:** Which failure modes did tests confirm the design prevents?
  - **Design gaps discovered:** Where did Phase 1 structures or Phase 2 interfaces fall short?
  - **Unexpected edge cases:** What timing or state transition issues emerged?
  - **Proposed fixes:** Specific changes needed in Phases 1, 2, or 3

**Gate:** ✋ Ask: *"Are the Phase 4 simulation insights approved?"* and HALT.

---

## Phase 4.5: Defect Pattern Validation Checklist

**Objective:** Validate that Phase 4 simulation caught your project's specific failure modes.

**Actions:**
1. Review the [Defect Patterns Reference](./references/defect-patterns.md) for your codebase type
2. For each defect pattern, ask:
   - **Did Phase 4 tests target this pattern?** (e.g., cross-module coupling, state timing)
   - **If yes, did the simulation reveal any flaws?** (Document as part of Phase 4 findings)
   - **If no, should Phase 4 tests be enhanced?** (Add test scenarios before re-simulating)
3. Update Phase 4 debrief with pattern validation results:
   ```
   ✓ Pattern 1 (Whack-A-Mole): Tested. No flaws found.
   ✓ Pattern 2 (English-to-Code): Tested. Found schema gap in GSI design.
   ✓ Pattern 3 (Simulation Timing): Tested. Discovered orphaned order issue.
   ✓ Pattern 4 (Agent Slop): Tested. Handler stayed within boundaries.
   ```
4. If any pattern was not tested, update Phase 4 test coverage and re-simulate

**Output:**
- Updated Phase 4 debrief showing defect pattern validation results
- Confirmation that known failure modes are addressed by the simulation

**Gate:** ✋ Ask: *"Are the Phase 4.5 defect pattern validations approved?"* and HALT.

---

## Phase 5: Invariants Validation

**Objective:** Define protective boundaries and logical safety conditions (design-level).

**Actions:**
1. Extract edge conditions and boundary limits from Phase 4 simulation results
2. Define logical constraints the system must **never** violate (conceptual guardrails)
   - Example: "Cart item quantity must always be ≥ 0"
   - Example: "Order status transitions must follow: pending → processing → completed (never backward)"
   - Example: "User ID in request must always match authenticated user ID"
3. Create a strict checklist of invariants protecting code integrity
4. Document the consequence if each invariant is violated (data corruption, security risk, crash, etc.)
5. **Do not write code yet**—these are design constraints that will guide assertion placement in Phase 6

**Output:**
- Invariants checklist: [conceptual constraint] → [consequence if broken]
- Clear description of what breaks if invariants are violated
- Suggested assertion code locations (these get added in Phase 6 implementation)

**Gate:** ✋ Ask: *"Are the Phase 5 Invariants approved?"* and HALT.

---

## Phase 6: Final Production Implementation

**Objective:** Write permanent, production-quality code.

**Actions:**
1. Implement logic within TODO boundaries
2. Factor in all Phase 4 simulation insights and structural corrections
3. Embed Phase 5 invariant checks at appropriate points
4. Follow existing codebase patterns and conventions
5. Ensure all tests pass (integration, unit, etc.)

**Output:**
- Clean, optimized, fully implemented feature set
- Integrated into target branch/file structure
- All tests passing
- Code review ready

---

## Workflow Summary

```
Phase 0 (Plan) → Approve
    ↓
Phase 1 (Structs) → Approve
    ↓
Phase 2 (Interfaces) → Approve
    ↓
Phase 3 (TODOs) → Approve
    ↓
Phase 4 (Simulate → Revert) → Approve
    ↓
Phase 4.5 (Defect Pattern Validation) → Approve
    ↓
Phase 5 (Invariants) → Approve
    ↓
Phase 6 (Implement) → Ship
```

**Iteration on Phase 4-4.5 Failure:**

If Phase 4 or 4.5 reveals design flaws:
- You may loop back to Phase 1, 2, or 3 and rewrite as needed
- Re-submit updated phase for approval before continuing
- Repeat Phase 4 simulation with new design
- Run Phase 4.5 defect pattern validation again
- **Unlimited iterations allowed** until Phase 4-4.5 passes without major issues
- Only then proceed to Phase 5

---

## Key Rules

1. **No phase skipping:** Every phase must produce deliverables and gain approval.
2. **Simulation purity:** Phase 4 code must be completely reverted—no partial keeps.
3. **TODOs are sacred:** Phase 3 TODOs define the exact implementation boundary; don't deviate in Phase 6 without re-approval.
4. **Approval-first:** Always halt and ask for approval; never assume "OK" from silence.
5. **Revert discipline:** If Phase 4 test output is unclear, revert and re-iterate with better test scaffolding before proceeding to Phase 5.

---

## Resources

- [Defect Patterns Reference](./references/defect-patterns.md): Catalog of failure modes (Whack-A-Mole, English-to-Code, Simulation Timing, Agent Slop) with Phase 4 test examples
- [Usage Guide](./references/usage-guide.md): Example triggers, chat prompts, troubleshooting
- [Revert Script](./scripts/revert-phase4.sh): Automated Phase 4 cleanup helper
