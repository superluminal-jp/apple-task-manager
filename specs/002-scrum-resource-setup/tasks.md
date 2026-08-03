# Tasks: Scrum Resource Setup

**Input**: Design documents from `/specs/002-scrum-resource-setup/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: Required by FR-015 and Constitution Principle III. Each behavior change
starts with a focused deterministic failure before implementation.

## Phase 1: Setup and Evidence

**Purpose**: Confirm the feature boundary and platform contracts.

- [x] T001 Verify the completed requirements checklist in `specs/002-scrum-resource-setup/checklists/requirements.md`
- [x] T002 Record Apple Notes dictionary and EventKit/Scrum Guide decisions in `specs/002-scrum-resource-setup/research.md`

---

## Phase 2: User Story 1 - Ensure a Notes Folder (Priority: P1) 🎯 MVP

**Goal**: Safely create or reuse one named folder in the Notes default account.

**Independent Test**: Ensure a unique name twice; observe one creation, one reuse,
one stable identifier, and no deletion capability.

### Tests for User Story 1

- [x] T003 [US1] Add deterministic contract checks for the shipped script, validation, default-account scope, exact matching, ambiguity failure, one-folder creation, idempotence output, and no delete path in `tests/run-apple-operators.sh`
- [x] T004 [US1] Run `tests/run-apple-operators.sh` and preserve the expected failing Notes ensure checks as red-phase evidence

### Implementation for User Story 1

- [x] T005 [US1] Implement the contract in `.claude/skills/apple-notes/scripts/ensure_folder.js`
- [x] T006 [US1] Document invocation, output, permission, idempotence, ambiguity, and safety in `.claude/skills/apple-notes/SKILL.md`
- [x] T007 [US1] Run the focused deterministic suite and confirm all Notes ensure checks pass

**Checkpoint**: Notes folder setup is independently safe and documented.

---

## Phase 3: User Story 2 - Ensure a Reminders List (Priority: P1)

**Goal**: Safely create or reuse one named reminder list in the default source.

**Independent Test**: Ensure a unique name twice; observe one EventKit save, one
reuse, one stable calendar identifier, and no calendar-removal capability.

### Tests for User Story 2

- [x] T008 [US2] Add deterministic contract checks for `ensure-list`, validation, exact matching, ambiguity failure, the official reminder-calendar initializer, default source, immediate save, result shape, and no remove-calendar path in `tests/run-apple-operators.sh`
- [x] T009 [US2] Run `tests/run-apple-operators.sh` and preserve the expected failing Reminders ensure checks as red-phase evidence

### Implementation for User Story 2

- [x] T010 [US2] Implement list result encoding and idempotent `ensure-list` in `.claude/skills/apple-reminders/scripts/main.swift`
- [x] T011 [US2] Document invocation, output, default-source behavior, official APIs, errors, and safety in `.claude/skills/apple-reminders/SKILL.md`
- [x] T012 [US2] Build the native CLI and run the deterministic suite until all Reminders ensure checks pass

**Checkpoint**: Reminders list setup is independently safe and documented.

---

## Phase 4: User Story 3 - Prepare a Scrum Workspace (Priority: P2)

**Goal**: Deliver reusable Scrum-aligned containers and note templates without
inventing product facts.

**Independent Test**: Inspect the target apps and confirm one folder, two lists, and
the eight expected placeholder-only template titles.

### Tests for User Story 3

- [x] T013 [US3] Add deterministic checks for all eight versioned template files, their required Scrum/supplemental labels, placeholder safety, and documented topology in `tests/run-apple-operators.sh`
- [x] T014 [US3] Run `tests/run-apple-operators.sh` and preserve the expected failing template/topology checks as red-phase evidence

### Implementation for User Story 3

- [x] T015 [P] [US3] Create Product Goal, Definition of Done, Sprint Planning, and Daily Scrum templates under `scrum/templates/`
- [x] T016 [P] [US3] Create Sprint Review, Sprint Retrospective, impediment log, and decision-rights templates under `scrum/templates/`
- [x] T017 [US3] Document the resource topology and safe setup workflow in `README.md`
- [x] T018 [US3] Run container ensure commands twice, then create each absent template note separately in Apple Notes and retain all created resources
- [x] T019 [US3] Inspect Notes and Reminders by scoped title/list queries and verify SC-001 through SC-004 without emitting unrelated user content

**Checkpoint**: The actual Apple-app workspace exists and is safe to reuse.

---

## Phase 5: Polish and Verification

- [x] T020 Run `bash tests/run-apple-operators.sh` and record the final pass count
- [x] T021 Run Spec Kit cross-artifact analysis over `spec.md`, `plan.md`, and `tasks.md`, resolving every critical inconsistency
- [x] T022 Re-check the constitution and public documentation against the implemented diff
- [x] T023 Mark every completed task `[x]` in `specs/002-scrum-resource-setup/tasks.md` and report deterministic and live evidence separately

---

## Dependencies & Execution Order

- T001–T002 precede behavior changes.
- US1 and US2 are independent after setup, but each must preserve its own red phase.
- US3 depends on both ensure commands because it uses their stable destinations.
- Final verification depends on all three stories and includes the Spec Kit analysis.

## Implementation Strategy

Implement the two smallest container primitives first, one red-green sequence at a
time. Then add the neutral template sources and perform individual observable app
writes. Do not bulk-create or clean up automatically. A live permission blocker does
not invalidate deterministic results, but must be reported explicitly.
