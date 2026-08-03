# Tasks: Scrum Role Perspective Agents

**Input**: Design documents from `/specs/003-scrum-role-agents/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by the project constitution and feature FR-010. Write and run the
focused contract suite before adding agent definitions or routing behavior.

**Organization**: Tasks are grouped by user story so each perspective and the
facilitation workflow remain independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because files do not overlap and prerequisites are complete
- **[Story]**: User story from spec.md

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the repository-scoped design and preserve the vendored baseline.

- [x] T001 Record the unchanged vendored Scrum Master baseline and inspect existing agent conventions in `.claude/skills/scrum-master/` and `.claude/agents/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the deterministic contracts before implementation.

- [x] T002 Create contract tests for frontmatter, read-only tools, asymmetric briefs, decision boundaries, accountability statements, routing sequence, and vendored-skill immutability in `tests/test_scrum_role_agents.py`
- [x] T003 Create the focused standard-library test entry point in `tests/run-scrum-role-agents.sh`
- [x] T004 Run `tests/run-scrum-role-agents.sh` and preserve the expected failing result before creating `.claude/agents/product-owner-perspective.md`, `.claude/agents/developers-perspective.md`, or updating `CLAUDE.md`

**Checkpoint**: The red phase fails only because the scoped behavior is absent.

---

## Phase 3: User Story 1 - Inspect Product Value Independently (Priority: P1) 🎯 MVP

**Goal**: Provide a bounded, read-only Product Owner perspective with an asymmetric
input contract and explicit accountability boundary.

**Independent Test**: The focused suite accepts the Product Owner definition and a
fresh-context scenario orders candidates from product evidence without assigning work.

- [x] T005 [US1] Implement the Product Owner perspective contract in `.claude/agents/product-owner-perspective.md`
- [x] T006 [US1] Run the focused contract suite and the Product Owner forward-test scenario from `specs/003-scrum-role-agents/quickstart.md`

**Checkpoint**: Product value can be inspected independently without delivery-side contamination.

---

## Phase 4: User Story 2 - Inspect Delivery Feasibility Independently (Priority: P1)

**Goal**: Provide a bounded, read-only Developers perspective with an asymmetric input
contract and explicit accountability boundary.

**Independent Test**: The focused suite accepts the Developers definition and a
fresh-context scenario reduces or reshapes an infeasible forecast without ordering the
Product Backlog.

- [x] T007 [US2] Implement the Developers perspective contract in `.claude/agents/developers-perspective.md`
- [x] T008 [US2] Run the focused contract suite and the Developers forward-test scenario from `specs/003-scrum-role-agents/quickstart.md`

**Checkpoint**: Delivery feasibility can be inspected independently without product-side contamination.

---

## Phase 5: User Story 3 - Facilitate Tension Without False Accountability (Priority: P2)

**Goal**: Make separate invocation and Scrum Master-guided comparison a discoverable,
repeatable project workflow while retaining human decision ownership.

**Independent Test**: Project guidance contains every orchestration step and a conflict
scenario preserves distinct evidence, disagreement, and the human decision owner.

- [x] T009 [US3] Add the separate-context orchestration and routing contract to `CLAUDE.md`
- [x] T010 [US3] Replace the stale unimplemented status with the operating workflow and verification command in `README.md`
- [x] T011 [US3] Run the focused contract suite and the conflicting-report forward-test scenario from `specs/003-scrum-role-agents/quickstart.md`

**Checkpoint**: The human can invoke both agents independently and inspect tension under the existing Scrum Master guidance.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the complete feature without Apple data mutation or vendored drift.

- [x] T012 Run the focused suite plus `tests/run-scrum-block.sh`, `tests/run-flow-metrics.sh`, and `tests/run-apple-operators.sh`
- [x] T013 Verify `git diff --exit-code main -- .claude/skills/scrum-master` and inspect the final diff for external dependencies, Apple-data mutations, and scope drift
- [x] T014 Mark all completed tasks in `specs/003-scrum-role-agents/tasks.md` and re-check the constitution gates in `specs/003-scrum-role-agents/plan.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on T001 and blocks all user-story implementation.
- **US1 and US2 (Phases 3–4)**: Depend on the red test evidence; their definition files
  are independent, but the focused suite is expected to remain partially red until both exist.
- **US3 (Phase 5)**: Depends on both perspective contracts so routing references real agents.
- **Polish (Phase 6)**: Depends on all user stories.

### User Story Dependencies

- **US1**: Independent after Phase 2.
- **US2**: Independent after Phase 2.
- **US3**: Depends on US1 and US2 for orchestration, but its documentation contract is independently testable.

### Parallel Opportunities

- T005 and T007 affect different agent files and can be implemented in parallel after the red phase.
- Forward tests for US1 and US2 require fresh contexts and can run independently.
- Regression suites in T012 are independent after implementation.

## Parallel Example: User Stories 1 and 2

```text
Task: Implement `.claude/agents/product-owner-perspective.md` from its contract.
Task: Implement `.claude/agents/developers-perspective.md` from its contract.
```

## Implementation Strategy

### MVP First

1. Complete the static red phase.
2. Implement and validate the Product Owner perspective (US1).
3. Implement and validate the Developers perspective (US2).
4. Add the orchestration entry point (US3).
5. Run conflict forward-testing and regressions.

### Traceability

- US1: FR-001, FR-003, FR-004, FR-006, FR-007
- US2: FR-002, FR-003, FR-005, FR-006, FR-007
- US3: FR-008, FR-009, FR-010, FR-011
