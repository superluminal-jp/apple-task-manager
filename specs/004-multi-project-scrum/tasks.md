# Tasks: Multi-Project Scrum Workspaces

**Input**: Design documents from `/specs/004-multi-project-scrum/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by the project constitution (Principle III, NON-NEGOTIABLE) and
by house convention (see `specs/003-scrum-role-agents/tasks.md`). Write and run
the focused suite before implementing `project_registry.py` or the operator rule
changes.

**Organization**: Tasks are grouped by user story from `spec.md` so each story
remains independently implementable and testable, in priority order (P1 → P2 →
P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on an incomplete
  task
- **[Story]**: User story from spec.md (US1–US5)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing conventions before adding to them.

- [x] T001 Inspect the existing script/test conventions this feature extends —
      `.claude/skills/apple-notes/scripts/`, `.claude/skills/apple-reminders/scripts/scrum_block.py`,
      `tests/test_scrum_block.py`, `tests/run-apple-operators.sh` — no code change

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish `project_registry.py`'s contract as a failing test suite
before any user story implements against it. Nearly every story depends on this
script (data-model.md § Project Registry Event).

**⚠️ CRITICAL**: No user story implementation may begin until this phase's red
result is recorded.

- [x] T002 [P] Write the `project_registry.py` contract test suite in
      `tests/test_project_registry.py`: `register`/`resolve`/`list`/`current`/
      `set-current` happy paths, idempotent re-registration, ambiguous-rename
      refusal, `set-current` on an unregistered name, and a malformed
      (unclosed-fence) block — per `specs/004-multi-project-scrum/contracts/project-registry.md`
- [x] T003 Create `tests/run-project-registry.sh`, mirroring
      `tests/run-scrum-block.sh`'s structure
- [x] T004 Run `tests/run-project-registry.sh` and preserve the failing (red)
      output as evidence before creating
      `.claude/skills/apple-notes/scripts/project_registry.py`

**Checkpoint**: The red phase fails only because `project_registry.py` does not exist yet.

---

## Phase 3: User Story 1 - Register a New Project (Priority: P1) 🎯 MVP

**Goal**: Registering a project by name provisions its Notes folder and two
Reminders lists and adds one entry to the registry note.

**Independent Test**: Register "ProjectA"; verify the Notes folder "ProjectA",
the Reminders lists "ProjectA Product Backlog" / "ProjectA Sprint Backlog", and
one new registry entry all exist.

- [x] T005 [US1] Implement the `register`, `resolve`, and `list` subcommands
      (block emission on `register`, fold-and-report on `resolve`/`list`) in
      `.claude/skills/apple-notes/scripts/project_registry.py`, making the
      corresponding T002 cases pass
- [x] T006 [US1] Replace the fixed single-workspace command block in
      `README.md` §4-bis ("Scrumワークスペースの準備") with the project-registration
      workflow (ensure-list ×2, `ensure_folder.js`, `project_registry.py register`,
      append via `write_note.js --append-stdin`)
- [x] T007 [US1] Add the registration and resolution rules from
      `specs/004-multi-project-scrum/contracts/project-resolution.md` to the
      "Rules" section of `.claude/agents/apple-notes-operator.md` and
      `.claude/agents/apple-reminders-operator.md`
- [x] T008 [US1] [P] Extend `tests/run-apple-operators.sh` with structural checks
      for `project_registry.py`'s `register`/`resolve`/`list` CLI surface and the
      registration rules added to both operator files in T007
- [x] T009 [US1] `tests/run-project-registry.sh` and `tests/run-apple-operators.sh`
      green; `quickstart.md` §2–3 run live on macOS 26.5.2 — registered the
      pre-existing "Scrum" project and a brand-new "QuickstartCheck" project.
      Found and fixed two real defects along the way (see quickstart.md
      "Verification Evidence"): `list_notes.js --id` needs `--field plaintext`,
      and `write_note.js --folder` needed an ambiguity refusal + `--folder-id`

**Checkpoint**: A brand-new project can be registered end to end — MVP delivered.

---

## Phase 4: User Story 2 - Keep Every Project's Data Isolated (Priority: P1)

**Goal**: Every Scrum-purpose Reminders/Notes operation resolves to exactly one
project and never reads or writes another project's resources.

**Independent Test**: With two registered projects each holding Sprint Backlog
items, a request scoped to one project never returns or modifies the other's
items.

- [x] T010 [US2] Add the resolution-order rule (explicit name → registry current
      → refuse) and the cross-project scope-enforcement rule from
      `contracts/project-resolution.md` to `.claude/agents/apple-notes-operator.md`
      and `.claude/agents/apple-reminders-operator.md` (extends the T007 rules
      with the isolation guarantee specifically)
- [x] T011 [US2] [P] Extend `tests/run-apple-operators.sh` with checks asserting
      both operator files state the resolution order and the "never touch
      another project's resources in the same operation" rule
- [x] T012 [US2] Update the "Flow data" rules in
      `.claude/agents/apple-reminders-operator.md` and the flow-metrics section of
      `.claude/skills/apple-reminders/SKILL.md` to state a flow-metrics run
      targets exactly one resolved project's Sprint Backlog list (FR-015)
- [x] T013 [US2] `tests/run-apple-operators.sh` green; `quickstart.md` §4 run
      live — probe reminders in "QuickstartCheck Sprint Backlog" and "Sprint
      Backlog" (the "Scrum" project) stayed isolated, each list containing
      only its own probe

**Checkpoint**: Project isolation is guaranteed and documented, not just assumed.

---

## Phase 5: User Story 3 - View and Switch the Current Project (Priority: P2)

**Goal**: See every registered project and which is current, and switch current,
via the registry note alone.

**Independent Test**: Switch current from "ProjectA" to "ProjectB"; a subsequent
project-unspecified request resolves to "ProjectB".

- [x] T014 [US3] Implement the `set-current` and `current` subcommands in
      `.claude/skills/apple-notes/scripts/project_registry.py`, making the
      remaining T002 cases pass
- [x] T015 [US3] [P] Document how to list registered projects and switch current
      in `README.md` §4-bis
- [x] T016 [US3] `tests/run-project-registry.sh` fully green (27/27);
      `quickstart.md` §5 run live — `set-current` then `current` round-tripped
      "ProjectA"-equivalent ("QuickstartCheck") correctly against the real
      registry note

**Checkpoint**: `project_registry.py`'s full CLI surface (T002's contract) is
implemented and current-project switching works end to end.

---

## Phase 6: User Story 4 - Bring Existing Single-Project Data Under the Registry (Priority: P2)

**Goal**: Register the pre-existing "Scrum" Notes folder and "Product
Backlog"/"Sprint Backlog" Reminders lists as the first project, verbatim, with no
data loss.

**Independent Test**: Register the pre-existing resources under a chosen name;
every existing note and reminder remains reachable, and zero new Notes folders or
Reminders lists are created as a side effect.

- [x] T017 [US4] Document the migration procedure — create the registry note
      inside the existing "Scrum" folder, then register "Scrum" /
      "Product Backlog" / "Sprint Backlog" verbatim (no rename) — in `README.md`
      §4-bis and the multi-project wiring section of `CLAUDE.md`
- [x] T018 [US4] [P] Extend `tests/test_project_registry.py` with an explicit case
      asserting `register` accepts resource names that do not follow the
      `<ProjectName> …` convention (spec FR-009)
- [x] T019 [US4] Executed `quickstart.md` §2 on the operator's actual Mac
      (macOS 26.5.2). Confirmed the registration step itself created zero new
      notes or reminders — it only appended a registry event pointing at the
      real, pre-existing "Scrum" folder and (freshly created in a separate,
      prior step) "Product Backlog"/"Sprint Backlog" lists (spec SC-003)

**Checkpoint**: The operator's real, existing data is under the registry with no loss.

---

## Phase 7: User Story 5 - Organize a Project's Notes by Sprint (Priority: P3)

**Goal**: Each Sprint's Sprint Goal, Sprint Review, Retrospective, and Impediment
records live in a Sprint-named subfolder under the project folder; Product Goal
and Definition of Done stay at the project root.

**Independent Test**: A Sprint Goal recorded for "Sprint 7" lands in a "Sprint 7"
subfolder; a Definition of Done note lands directly in the project folder.

- [x] T020 [US5] Extend `.claude/skills/apple-notes/scripts/ensure_folder.js`
      with the optional `--parent-id` scope per
      `specs/004-multi-project-scrum/contracts/apple-notes-ensure-folder-parent.md`
- [x] T021 [US5] [P] Add structural contract checks for the `--parent-id` flag and
      its scoped-ambiguity behavior to `tests/run-apple-operators.sh`
- [x] T022 [US5] Document Sprint-subfolder creation and the Product Goal/DoD
      root-placement rule (FR-011, FR-012) in `README.md` §3 and §4-bis and in
      `.claude/skills/apple-notes/SKILL.md`
- [x] T023 [US5] `tests/run-apple-operators.sh` green; `quickstart.md` §6 run
      live — `ensure_folder.js --parent-id` created "Sprint 1" under
      "QuickstartCheck" (`created: true`, then `created: false` idempotently
      on retry); Sprint Goal and Definition of Done notes landed in the
      correct folders via `write_note.js --folder-id`

**Checkpoint**: Sprint-level Notes organization works; standing artifacts never nest.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Close out constraints that span every story and verify the whole
feature together.

- [x] T024 [P] Document the "no Reminders sub-list" constraint (FR-014) and the
      ambiguity-refusal edge case (quickstart §7) in
      `.claude/skills/apple-reminders/SKILL.md` and both operator files
- [x] T025 Update the data-access delegation section of `CLAUDE.md` to reflect
      multi-project resolution — data access is still delegated to the operators,
      Scrum judgment is still not
- [x] T026 Run the full regression set: `tests/run-scrum-block.sh`,
      `tests/run-flow-metrics.sh`, `tests/run-apple-operators.sh`,
      `tests/run-project-registry.sh`, `tests/run-scrum-role-agents.sh`
- [x] T027 Verify `git diff --exit-code main -- .claude/skills/scrum-master`
      (vendored snapshot untouched) and inspect the full feature diff for new
      external dependencies or Apple-data mutations outside the documented scripts
- [x] T028 Mark all completed tasks in `specs/004-multi-project-scrum/tasks.md`
      and re-check the Constitution Check gates in
      `specs/004-multi-project-scrum/plan.md`
- [x] T029 Propose the ADR flagged in `plan.md`'s "Open governance item" (project
      registry stored inside a Notes note, not a repository config file) via the
      `adr` skill, before or alongside merging this feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — starts immediately.
- **Foundational (Phase 2)**: Depends on Phase 1; BLOCKS every user story
  (T005, T007, T010, T014, T018, T020 all read or extend
  `project_registry.py`'s contract established in T002).
- **User Stories (Phases 3–7)**: All depend on Phase 2's red-phase evidence.
  US1 and US2 are both P1 and may proceed in parallel once Phase 2 is done; US3
  depends on US1 (needs a registered project to switch to/from, and completes
  `project_registry.py`'s CLI surface T002 already specified); US4 depends on US1
  (registration mechanism must exist first — spec's own "Why this priority");
  US5 is independent of US2–US4 but depends on US1 (needs a registered project's
  folder to create a Sprint subfolder under).
- **Polish (Phase 8)**: Depends on all five user stories.

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only.
- **US2 (P1)**: Depends on Phase 2 and US1 (needs at least one registered project
  to demonstrate isolation against another).
- **US3 (P2)**: Depends on US1 (registration must exist before "current" is
  meaningful).
- **US4 (P2)**: Depends on US1 (reuses the same `register` mechanism).
- **US5 (P3)**: Depends on US1 (needs a project folder to nest a Sprint subfolder
  under); independent of US2, US3, US4.

### Parallel Opportunities

- T002 and T001 can run in parallel (different concerns, no file overlap).
- Within Phase 3, T008 (`tests/run-apple-operators.sh` checks) can proceed in
  parallel with T006/T007 once T005 exists, since it targets a different file.
- US3, US4, and US5 implementation tasks touch disjoint files
  (`project_registry.py`'s remaining subcommands vs. documentation vs.
  `ensure_folder.js`) and can proceed in parallel once US1 is complete, if
  staffed.
- T024 and T025 in Polish are independent of each other and of T026–T029.

## Parallel Example: After User Story 1 completes

```text
Task: Implement `set-current`/`current` in .claude/skills/apple-notes/scripts/project_registry.py (US3)
Task: Document the migration procedure in README.md §4-bis and CLAUDE.md (US4)
Task: Extend ensure_folder.js with --parent-id in .claude/skills/apple-notes/scripts/ensure_folder.js (US5)
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational — record the red result.
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: run `tests/run-project-registry.sh` and
   `specs/004-multi-project-scrum/quickstart.md` §2–3 independently.
5. Demonstrate registering a second project by hand before continuing.

### Incremental Delivery

1. Setup + Foundational → red-phase evidence recorded.
2. US1 → registration works → MVP.
3. US2 → isolation guaranteed and documented.
4. US3 → current-project switching, completing `project_registry.py`'s contract.
5. US4 → the operator's real existing data joins the registry.
6. US5 → Sprint-level Notes organization.
7. Polish → full regression, vendored-snapshot check, ADR proposal.

### Traceability

- US1: FR-001, FR-002, FR-003, FR-004, FR-005, FR-016
- US2: FR-007, FR-008, FR-015
- US3: FR-006
- US4: FR-009, FR-010
- US5: FR-011, FR-012, FR-013
- Polish: FR-014 (documented non-goal, no code)
