---
description: "Task list for reliable Apple Notes operation results"
---

# Tasks: Reliable Apple Notes Results

**Input**: Design documents from `/specs/001-fix-notes-result/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by FR-009 and the project constitution. The regression test MUST
be added and observed failing before either JXA implementation is changed.

## Phase 1: Setup (Shared Context)

**Purpose**: Confirm the investigated failure and implementation boundaries.

- [x] T001 Confirm the live-property probe, chosen membership strategy, and CLI contract are recorded consistently in specs/001-fix-notes-result/research.md and specs/001-fix-notes-result/contracts/apple-notes-cli.md

---

## Phase 2: Foundational (TDD Red Gate)

**Purpose**: Establish the deterministic regression contract before implementation.

**⚠️ CRITICAL**: No JXA implementation changes begin until this phase demonstrates a failure.

- [x] T002 Add deterministic regression assertions for FR-004, FR-005, and FR-009 to tests/run-apple-operators.sh, covering both .claude/skills/apple-notes/scripts/write_note.js and .claude/skills/apple-notes/scripts/list_notes.js
- [x] T003 Run tests/run-apple-operators.sh and confirm the new regression assertion fails against the current direct containing-object access in tests/run-apple-operators.sh

**Checkpoint**: Red phase captured; implementation may begin.

---

## Phase 3: User Story 1 - Trust Successful Writes (Priority: P1) 🎯 MVP

**Goal**: Successful create and append operations return successful Note Result JSON.

**Independent Test**: Create one uniquely named note, append one line by ID, and
verify both commands exit 0 and report the same note and folder.

- [x] T004 [US1] Pass the already selected folder into create-result formatting and resolve append-result folder membership without direct containing-object access in .claude/skills/apple-notes/scripts/write_note.js
- [x] T005 [US1] Run tests/run-apple-operators.sh and confirm the write-side regression assertions pass for FR-001, FR-002, FR-004, FR-005, FR-007, and FR-008

**Checkpoint**: Write operations can report completed mutations truthfully.

---

## Phase 4: User Story 2 - Resolve a Note by Identifier (Priority: P2)

**Goal**: Direct ID lookup returns one correct Note Result without unrelated output.

**Independent Test**: Read the US1 test note by ID and verify its metadata and
requested body representation are returned successfully and exclusively.

- [x] T006 [US2] Resolve the actual folder by note-ID membership and remove direct containing-object access from identifier lookup in .claude/skills/apple-notes/scripts/list_notes.js
- [x] T007 [US2] Run tests/run-apple-operators.sh and confirm all ID-lookup regression assertions pass for FR-003 through FR-009

**Checkpoint**: Both user stories work independently through their documented CLI contracts.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Synchronize verification documentation and prove no regressions.

- [x] T008 Update the Notes native verification status and regression evidence in README.md
- [x] T009 Run tests/run-apple-operators.sh, tests/run-scrum-block.sh, and tests/run-flow-metrics.sh as the full deterministic regression
- [x] T010 Run the create, append, valid-ID read, and invalid-ID no-mutation scenarios from specs/001-fix-notes-result/quickstart.md on macOS and record the retained test-note name in the completion report
- [x] T011 Resolve shellcheck warnings introduced by the bundled Spec Kit scripts in .specify/scripts/bash/

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks all implementation.
- **User Story 1 (Phase 3)**: Depends on the failing regression test.
- **User Story 2 (Phase 4)**: Depends on the shared regression contract and follows
  US1 because both scripts implement the same membership rule.
- **Polish (Phase 5)**: Depends on both user stories.

### User Story Dependencies

- **User Story 1 (P1)**: Independently delivers truthful write results.
- **User Story 2 (P2)**: Independently delivers identifier lookup; it reuses the
  membership rule proven by US1 but does not require a write at runtime.

### Parallel Opportunities

None. Tests must precede code, and the two scripts implement the same contract. The
small scope favors sequential review over coordination overhead.

## Implementation Strategy

### MVP First

1. Complete the TDD red gate.
2. Implement and validate User Story 1.
3. Stop and confirm successful writes no longer return false failures.
4. Add User Story 2 and complete the full regression.

### Incremental Delivery

Each user story ends at an independently testable checkpoint. No task changes the
public arguments, destructive-operation policy, or third-party dependency surface.
