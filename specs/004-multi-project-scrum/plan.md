# Implementation Plan: Multi-Project Scrum Workspaces

**Branch**: `004-multi-project-scrum` | **Date**: 2026-08-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-multi-project-scrum/spec.md`

## Summary

Let the solo operator register more than one project, each isolated to its own
Notes folder and pair of Reminders lists, and record which projects exist and
which is current in a dedicated Notes registry note. Because Notes bodies can
only be appended to (never replaced), the registry is designed as an append-only
event log rather than a mutable record — every registration or current-project
switch is a new fenced block, folded into current state by a new pure-Python
script. Sprint-level Notes organization extends the existing `ensure_folder.js`
with an optional parent scope; Reminders separation stays name-only because
EventKit's public API exposes no list-group capability. The pre-existing single
project's data is registered under its real, unrenamed resource names — no
rename operation is added to either app's tooling.

## Technical Context

**Language/Version**: JXA (`osascript -l JavaScript`) for Notes automation;
Swift 5.9 for the existing `remind-cli` (unchanged by this feature); Python 3
standard library for the new registry-parsing script and its tests; POSIX
Bash for the test runner

**Primary Dependencies**: None new. Existing Notes AppleScript dictionary,
existing EventKit-backed `remind-cli`, existing `apple-notes`/`apple-reminders`
skill scripts

**Storage**: A dedicated Apple Notes note (the project registry, one per Apple
account) plus one Notes folder and two Reminders lists per registered project.
No repository-tracked config file, database, or external store

**Testing**: Python `unittest` + `tests/run-*.sh` runners for
`project_registry.py` (platform-independent, mirrors `test_scrum_block.py`);
structural/contract checks in `tests/run-apple-operators.sh` for the extended
`ensure_folder.js` flags and the operators' project-resolution wiring; live-Mac
manual validation for JXA behavior per `quickstart.md`, distinguished from
static evidence per Constitution Principle III

**Target Platform**: macOS for all live Apple integration (Notes Automation,
Reminders EventKit); any standard development platform for the Python contract
suite

**Project Type**: Repository-scoped automation skills, subagents, and project
wiring (same shape as features 002 and 003 — not a client/server or mobile app)

**Performance Goals**: A registered project's resources are resolvable from the
registry in one note read plus one fold pass (spec SC-002: under one minute for
an operator to identify all projects and the current one)

**Constraints**: No new external dependency or package manifest; no rename or
delete capability added to either app's scripts; no attempt to create Reminders
list groups (not exposed by EventKit); Sprint subfolder matching/creation scoped
to one parent folder, never account-wide; every Scrum-purpose operation resolves
to exactly one project or refuses (spec FR-007, FR-008)

**Scale/Scope**: One new Python script (`project_registry.py`) and its test
suite; one additive flag on `ensure_folder.js`; updated resolution rules in both
existing operator subagents; updated project-scoping guidance in `CLAUDE.md` and
`README.md`; zero changes to `remind-cli`, `scrum_block.py`, `flow_metrics.py`,
or the vendored `scrum-master` skill

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Preserve User Records — PASS**: Registration and current-switch are
  append-only Notes writes (never a body replace); project and Sprint-subfolder
  creation reuse the existing idempotent, non-destructive `ensure_folder.js`/
  `ensure-list` semantics; no delete or rename capability is added to either
  script.
- **II. Use Public, Platform-Native Interfaces — PASS**: Sprint subfolders use
  the Notes AppleScript dictionary's documented `folder.folders` element (Notes
  has no framework, matching the existing skill's constraint); Reminders
  separation is name-only specifically *because* EventKit's public API has no
  list-group type — no private framework or SQLite access is introduced
  (research.md Decision 3).
- **III. Test First and Report Evidence — PASS (to enforce during
  `/speckit-tasks` and implementation)**: `project_registry.py` is pure Python
  and gets a red-then-green unit suite before implementation, matching
  `scrum_block.py`'s precedent; the `ensure_folder.js` extension gets structural
  contract checks plus a live-Mac quickstart pass, with the report distinguishing
  the two kinds of evidence.
- **IV. Separate Data Access from Judgment — PASS**: Project resolution
  (`contracts/project-resolution.md`) is a fact-lookup against the registry, not
  a Scrum judgment; operators continue to return resolved facts, never raw
  account-wide dumps, and refuse rather than guess on ambiguity.
- **V. Keep the Repository Self-Contained — PASS**: The registry lives inside a
  Notes note, not a new repository file, config format, or external service; the
  vendored `scrum-master` snapshot is untouched; no new dependency is introduced.

**Open governance item — resolved**: this feature makes an architecturally
significant, not-trivially-reversible choice — storing the project registry
inside a Notes note rather than a repository-tracked config file or a
dynamically-enumerated derivation — with explicitly rejected alternatives (see
`research.md` Decision 1 and the clarification session). Recorded as
[ADR 0006](../../docs/adr/0006-project-registry-as-notes-event-log.md)
(Accepted) before implementation began, the same way ADR 0005 recorded "where
do project artifacts live" for the vendored skill.

Post-design re-check: `data-model.md` and the three contracts keep every write
append-only or idempotent-create, keep Reminders untouched beyond naming, and
keep resolution refusal-on-ambiguity as the only fallback. No gate violation
remains.

**Post-implementation re-check** (after `/speckit-implement`): `project_registry.py`
(27 unit tests), the extended `ensure_folder.js` contract, and both operator
agents' rule text were verified statically — `tests/run-project-registry.sh`
and the extended `tests/run-apple-operators.sh` (148 checks) are green, and the
full regression set (`run-scrum-block.sh`, `run-flow-metrics.sh`,
`run-scrum-role-agents.sh`) stayed green with zero changes outside this
feature's files. The vendored `scrum-master` snapshot has no diff against
`main`.

**Live-Mac verification also completed** (`quickstart.md` §2–7, on macOS
26.5.2, against real account data): project registration, isolation,
current-project switching, and Sprint subfolders all work as specified. Two
defects not anticipated by this plan were found and fixed during that run:
`list_notes.js --id ... --plaintext` returns a one-element JSON array rather
than raw text (fixed by documenting `--field plaintext` everywhere the
registry note is read); and `write_note.js --folder <name>` had no ambiguity
check, which is a real risk once same-named Sprint subfolders exist across
projects (fixed by adding `--folder-id` and an ambiguity refusal — see
`contracts/apple-notes-write-note-folder-id.md`). Both fixes are covered by
new checks in `tests/run-apple-operators.sh`. No gate violation was
introduced by either fix (still append-only / idempotent-create / no rename
or delete). See `quickstart.md`'s "Verification Evidence" section for the
full run log.

## Project Structure

### Documentation (this feature)

```text
specs/004-multi-project-scrum/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── project-registry.md
│   ├── apple-notes-ensure-folder-parent.md
│   └── project-resolution.md
└── tasks.md              # /speckit-tasks output, not created by this command
```

### Source Code (repository root)

```text
.claude/skills/apple-notes/scripts/
├── ensure_folder.js          # extended: optional --parent-id scope
├── list_notes.js             # unchanged
├── write_note.js             # unchanged
└── project_registry.py       # new: append-only registry fold/register/set-current

.claude/skills/apple-reminders/scripts/
├── main.swift                # unchanged (remind-cli)
├── scrum_block.py            # unchanged
└── build.sh                  # unchanged

.claude/agents/
├── apple-notes-operator.md       # updated: project-resolution rules (contracts/project-resolution.md)
└── apple-reminders-operator.md   # updated: project-resolution rules (contracts/project-resolution.md)

CLAUDE.md                     # updated: multi-project wiring, registry note location
README.md                     # updated: multi-project workspace description (§1, §2, §4-bis)

tests/
├── test_project_registry.py      # new, mirrors test_scrum_block.py
├── run-project-registry.sh       # new
└── run-apple-operators.sh        # extended: ensure_folder.js parent-flag contract,
                                   #           operator project-resolution wiring

docs/adr/                     # a new ADR is expected here before/alongside
                               # implementation — see "Open governance item" above;
                               # not created by this command
```

**Structure Decision**: Follow the existing repository convention exactly —
platform automation stays split by app (`apple-notes` vs `apple-reminders`
skills), Python owns parsing/decision logic that must be testable off-macOS,
JXA/Swift stay thin wrappers over the platform API, project-specific wiring
lives in `CLAUDE.md`/`README.md` rather than the vendored `scrum-master`
snapshot, and deterministic tests live in `tests/`. No new top-level directory,
package manifest, or build system is introduced.

## Complexity Tracking

No constitution gate violation requires justification. The one open item is
governance documentation (an ADR), tracked above, not a principle violation.
