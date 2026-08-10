# Feature Specification: Multi-Project Scrum Workspaces

**Feature Branch**: `004-multi-project-scrum`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Notesのフォルダ、Reminderのリストでプロジェクトを分けてそれぞれで管理できるようにアップデート" (Update so that projects can be separated and managed independently by Notes folder and Reminders list), clarified through an interactive session covering scope, naming, registry storage, migration, and Notes/Reminders nesting feasibility.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register a New Project (Priority: P1)

As the solo operator, I want to register a new project by name and have its Notes
folder and two Reminders lists (Product Backlog, Sprint Backlog) created and
recorded, so that a new product/initiative gets an isolated Scrum workspace without
hand-crafting folder and list names myself.

**Why this priority**: Nothing else in this feature is testable or usable until a
project can be created and named. This is the foundation the other stories build on.

**Independent Test**: Can be fully tested by registering a project named "ProjectA"
and verifying a Notes folder named "ProjectA" and two Reminders lists named
"ProjectA Product Backlog" / "ProjectA Sprint Backlog" exist, and that the project
registry note contains one new entry for "ProjectA".

**Acceptance Scenarios**:

1. **Given** no project named "ProjectA" exists yet, **When** the operator registers
   project "ProjectA", **Then** a Notes folder "ProjectA", a Reminders list "ProjectA
   Product Backlog", and a Reminders list "ProjectA Sprint Backlog" are created, and
   the registry note gains one entry mapping "ProjectA" to these three resources.
2. **Given** a project named "ProjectA" is already registered, **When** the operator
   registers "ProjectA" again, **Then** the existing resources are reused (no
   duplicate folder or list is created) and the registry is not duplicated.
3. **Given** a Notes folder or Reminders list with the target name already exists
   ambiguously (more than one exact match), **When** registration is attempted,
   **Then** registration stops and reports the ambiguity instead of guessing or
   creating a duplicate.

---

### User Story 2 - Keep Every Project's Data Isolated (Priority: P1)

As the solo operator managing more than one project, I want every Reminders or
Notes read/write performed for Scrum purposes to target exactly one named project's
resources, so that an action on one project can never leak into or overwrite
another project's backlog, goal, or records.

**Why this priority**: Isolation is the actual value of "separating projects" — a
multi-project structure that does not guarantee isolation is not meaningfully
different from a single shared workspace with longer names.

**Independent Test**: Can be fully tested by registering two projects, adding
distinct Sprint Backlog items to each, and verifying that a request scoped to one
project's Sprint Backlog never returns or modifies items belonging to the other
project's lists or folder.

**Acceptance Scenarios**:

1. **Given** two registered projects "ProjectA" and "ProjectB" each with items in
   their own Sprint Backlog, **When** a flow-metrics or listing request names
   "ProjectA", **Then** only "ProjectA Sprint Backlog" items are read and "ProjectB"
   resources are never opened.
2. **Given** two registered projects, **When** a reminder or note is created for
   "ProjectA", **Then** it is written only to "ProjectA"'s Notes folder or Reminders
   lists, never to "ProjectB"'s.

---

### User Story 3 - View and Switch the Current Project (Priority: P2)

As the solo operator, I want to see which projects are registered and which one is
"current," and switch the current project, so that I do not have to spell out the
full project name in every request during a working session.

**Why this priority**: Convenience and error-reduction on top of the isolation
guarantee established by User Story 2; valuable once more than one project exists,
but not required for the system to be usable or correct.

**Independent Test**: Can be fully tested by registering two projects, switching the
current project from one to the other via the registry note, and verifying a
request that omits a project name resolves to the newly current project.

**Acceptance Scenarios**:

1. **Given** two registered projects, **When** the operator asks which projects
   exist, **Then** the registry note's contents are returned, including which
   project is marked current.
2. **Given** "ProjectA" is current, **When** the operator switches current to
   "ProjectB", **Then** the registry reflects "ProjectB" as current and a subsequent
   project-unspecified request resolves to "ProjectB".

---

### User Story 4 - Bring Existing Single-Project Data Under the Registry (Priority: P2)

As the solo operator who already has one product's data in the pre-existing "Scrum"
Notes folder and "Product Backlog"/"Sprint Backlog" Reminders lists, I want that
existing data registered as my first project under a name I choose, so that I keep
using my existing Cycle Time history without losing or duplicating any reminder or
note.

**Why this priority**: Required before the feature is useful to the actual current
user and their live data, but depends on User Story 1's registration mechanism
existing first.

**Independent Test**: Can be fully tested by registering the pre-existing "Scrum"
folder and "Product Backlog"/"Sprint Backlog" lists under a chosen project name and
verifying every existing note and reminder is still reachable afterward, with zero
new Notes folders or Reminders lists created as a side effect.

**Acceptance Scenarios**:

1. **Given** the pre-existing "Scrum" folder and "Product Backlog"/"Sprint Backlog"
   lists with existing notes and reminders, **When** the operator registers them as
   the first project under a chosen name, **Then** the registry records that
   project's Notes folder as "Scrum" and its Reminders lists as "Product Backlog" /
   "Sprint Backlog" verbatim — no rename is attempted, and no note or reminder is
   created, moved, or deleted.
2. **Given** the first project has been registered, **When** the operator later
   registers a second, brand-new project, **Then** the new project's resources
   follow the `<ProjectName>` / `<ProjectName> Product Backlog` / `<ProjectName>
   Sprint Backlog` naming convention while the first project's resources keep their
   original names.

---

### User Story 5 - Organize a Project's Notes by Sprint (Priority: P3)

As the solo operator running multiple Sprints within one project, I want each
Sprint's Sprint Goal, Sprint Review record, Retrospective record, and Impediment
record filed under a Sprint-named subfolder inside the project's Notes folder,
while the Product Goal and Definition of Done stay at the project's top level, so
that a growing history of Sprints does not clutter one flat folder and the
cross-Sprint commitments remain unambiguous.

**Why this priority**: A structural refinement for Notes readability once multiple
projects and Sprints already exist; not required for isolation or correctness.

**Independent Test**: Can be fully tested by creating Sprint records for two
different Sprints within one project and verifying each lands in its own
Sprint-named subfolder, while a Product Goal or Definition of Done note written for
that project lands directly in the project folder, not inside any Sprint subfolder.

**Acceptance Scenarios**:

1. **Given** a registered project with no "Sprint 7" subfolder yet, **When** a
   Sprint Goal is recorded for Sprint 7, **Then** a "Sprint 7" subfolder is created
   under the project's Notes folder and the note is placed inside it.
2. **Given** a registered project, **When** a Definition of Done note is recorded,
   **Then** it is placed directly under the project's Notes folder, not inside any
   Sprint subfolder, regardless of which Sprint is active.

### Edge Cases

- A request omits a project name and no project is marked current in the registry:
  the request MUST be refused with the ambiguity reported, not silently applied to
  an arbitrary or most-recently-used project.
- Two projects are registered with names that collide once mapped to resource names
  (e.g., differ only in trailing whitespace or case): registration MUST fail before
  creating a second, confusingly similar set of resources.
- The registry note's structure is damaged by direct manual editing in Notes (for
  example, its parseable block is left without a closing marker): registration and
  lookup MUST refuse to guess at project boundaries and MUST report the problem
  rather than silently misreading or overwriting entries.
- A caller asks to delete a project, or to remove its Notes folder or Reminders
  lists: no automated deletion exists for either app; the response MUST name where
  the operator would click in-app, consistent with the existing no-delete
  constraint for reminders and notes.
- A caller asks to create a sub-list (a list "inside" another list) in Reminders:
  this MUST be reported as technically unsupported by EventKit's public API, not
  attempted through an unsupported workaround.
- A Sprint subfolder name collides ambiguously with an existing, unrelated subfolder
  under the same project folder: creation MUST fail before writing, mirroring the
  existing top-level folder ambiguity rule.
- Flow-metrics are requested without naming a project and without a current project
  set: refused per the first edge case above, rather than aggregating across every
  registered project.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support registering a project identified by a
  human-chosen name, provisioning exactly one Notes folder and two Reminders lists
  (a Product Backlog and a Sprint Backlog) for it.
- **FR-002**: For a newly registered project, the Notes folder MUST be named exactly
  the project name, with no added prefix or suffix.
- **FR-003**: For a newly registered project, the two Reminders lists MUST be named
  `<ProjectName> Product Backlog` and `<ProjectName> Sprint Backlog`.
- **FR-004**: Project resource provisioning MUST reuse the existing idempotent,
  exact-name-match creation semantics (one reused match, no match creates one
  resource, multiple matches fail before writing) already documented for Notes
  folders and Reminders lists; it MUST NOT introduce new creation, rename, or
  deletion semantics.
- **FR-005**: The system MUST maintain a project registry as a single, dedicated
  Notes note recording, per registered project: its name, its Notes folder
  identifier, its two Reminders list names, and whether it is the current project.
- **FR-006**: The registry MUST support marking exactly one registered project as
  "current" at a time, and switching which project is current.
- **FR-007**: Every Scrum-purpose Reminders or Notes read or write MUST be scoped to
  exactly one project — either explicitly named by the caller or resolved from the
  registry's current project — and MUST NOT read or write another project's Notes
  folder or Reminders lists in the same operation.
- **FR-008**: When a request does not name a project and the registry has no current
  project set, the system MUST stop and report the ambiguity instead of guessing.
- **FR-009**: The system MUST allow registering a pre-existing Notes folder and pair
  of Reminders lists under a chosen project name without renaming them; the registry
  MUST store each project's actual resource names, not assume they always follow the
  `<ProjectName> …` convention.
- **FR-010**: The pre-existing single-project resources (the "Scrum" Notes folder
  and the "Product Backlog" / "Sprint Backlog" Reminders lists) MUST be registrable
  as the first project under a user-chosen project name with zero notes or reminders
  created, moved, or deleted as a side effect of registration.
- **FR-011**: Within a project's Notes folder, the system MUST support creating one
  subfolder per Sprint (named for that Sprint) to hold that Sprint's Sprint Goal,
  Sprint Review record, Retrospective record, and Impediment record.
- **FR-012**: Product Goal and Definition of Done notes MUST be stored directly
  under the project's Notes folder, never inside a Sprint subfolder.
- **FR-013**: Sprint subfolder creation MUST use the same idempotent,
  ambiguity-refusing exact-name-match semantics as top-level Notes folder creation,
  scoped to children of the project's folder.
- **FR-014**: The system MUST NOT attempt to create or manage Reminders sub-lists or
  list groups; this is not exposed by EventKit's public API for any Reminders
  account type.
- **FR-015**: A flow-metrics computation (Cycle Time, Lead Time, Work Item Age,
  unstarted-item count) MUST run against exactly one project's Sprint Backlog list
  per invocation; cross-project aggregation is out of scope for this feature.
- **FR-016**: The implementation MUST NOT introduce a new external dependency,
  package manifest, or non-Apple-application data store; the project registry MUST
  live inside a Notes note.

### Key Entities *(include if feature involves data)*

- **Project**: A named unit of Scrum work management, associated with exactly one
  Notes folder and two Reminders lists (Product Backlog, Sprint Backlog). Identified
  by its human-chosen name.
- **Project Registry Note**: A single Notes note that is the source of truth for
  which projects exist, their resource names/identifiers, and which project is
  currently active.
- **Sprint Subfolder**: A Notes subfolder inside a project's Notes folder, holding
  that Sprint's Sprint Goal, Sprint Review record, Retrospective record, and
  Impediment record.
- **Standing Artifact**: A Product Goal or Definition of Done note. Lives at the
  project's Notes folder root because it is a cross-Sprint commitment, not
  duplicated per Sprint.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After registering two projects, 100% of Reminders/Notes reads and
  writes scoped to one project's name touch only that project's three resources, in
  a verification pass covering both projects.
- **SC-002**: An operator can identify every registered project and which one is
  current, and switch the current project, using only the registry note's content
  in under one minute.
- **SC-003**: The pre-existing single-project data becomes a registered project with
  zero reminders or notes lost, duplicated, or moved.
- **SC-004**: Flow metrics (Cycle Time, Lead Time, unstarted count) can be produced
  for any one selected registered project without manually filtering out another
  project's items.
- **SC-005**: A request that omits a project name with no current project set is
  refused with a clear ambiguity report in 100% of tested cases — never silently
  applied to a guessed project.

## Assumptions

- Reminders sub-lists or list groups are not exposed by EventKit's public API for
  any Reminders account type (confirmed against Apple Developer Forums thread
  683611, current as of 2024–2025); this feature does not attempt them, and
  Reminders-side separation is achieved only through per-project list naming.
- Notes supports nested folders through AppleScript by targeting a parent folder
  and creating a folder within it; the existing `ensure_folder.js` intentionally
  supports only one top-level layer today, so Sprint subfolder support (FR-011,
  FR-013) requires extending that script to accept a parent folder — that extension
  is in scope for this feature's implementation, not a pre-existing capability.
- Neither `ensure_folder.js` nor `remind-cli ensure-list` has a rename operation by
  design; this feature does not add one. Bringing the pre-existing single-project
  resources under the registry (FR-009, FR-010, User Story 4) therefore registers
  them under their existing names rather than renaming them to match the
  `<ProjectName> …` convention used by newly created projects.
- Product Goal and Definition of Done are treated as cross-Sprint standing
  commitments per the Scrum Guide, and therefore are not duplicated or nested per
  Sprint.
- Cross-project aggregate reporting (e.g., combined flow metrics across every
  registered project) is out of scope for this feature and may be considered later
  if a real need appears.
- The specific name chosen for the first (pre-existing) registered project is a
  content decision made by the operator at implementation/rollout time, not fixed
  by this specification.
- Deleting a project, or a project's Notes folder or Reminders list, remains a
  manual, human, in-app action, consistent with the existing repository-wide
  constraint that no delete operation exists for either app.
