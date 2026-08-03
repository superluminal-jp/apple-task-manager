# Feature Specification: Scrum Resource Setup

**Feature Branch**: `codex/fix-apple-notes-result`

**Created**: 2026-08-03

**Status**: Complete

**Input**: User description: "Extend the Apple Notes and Reminders skills with Spec Kit, use official documentation, and prepare the folders, lists, and templates needed for Scrum."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ensure a Notes Folder (Priority: P1)

As an operator, I need to ensure that a named folder exists in the default Apple
Notes account so that reusable Scrum templates have a stable destination without
creating duplicate folders.

**Why this priority**: The template workspace cannot be prepared safely until its
destination can be created and resolved idempotently.

**Independent Test**: Ensure a uniquely named folder twice and verify that the first
operation creates one folder while the second resolves the same folder without a
second write.

**Acceptance Scenarios**:

1. **Given** no exact-name folder in the default Notes account, **When** the operator
   ensures that name, **Then** exactly one folder is created and returned with a
   machine-readable `created: true` result.
2. **Given** one exact-name folder in the default Notes account, **When** the operator
   ensures that name, **Then** no folder is created and the existing folder is
   returned with `created: false`.
3. **Given** more than one exact-name folder in the default account, **When** the
   operator ensures that name, **Then** the command fails without creating a folder.

---

### User Story 2 - Ensure a Reminders List (Priority: P1)

As an operator, I need to ensure that a named Apple Reminders list exists in the
same source as the user's default reminders list so that Scrum backlog containers
can be prepared without guessing an account or creating duplicates.

**Why this priority**: Product and Sprint Backlogs need durable list containers,
and account selection must follow the user's configured default.

**Independent Test**: Ensure a uniquely named list twice and verify that EventKit
creates it once in the default reminder source and then returns the same identifier.

**Acceptance Scenarios**:

1. **Given** no exact-name reminder list, **When** the operator ensures that name,
   **Then** one reminder-capable list is created in the default reminder source and
   returned with `created: true`.
2. **Given** one exact-name list, **When** the operator ensures that name, **Then**
   no list is created and the existing list is returned with `created: false`.
3. **Given** multiple exact-name lists or no configured default reminder source,
   **When** the operator ensures that name, **Then** the command fails without a
   write and explains the ambiguity or missing prerequisite.

---

### User Story 3 - Prepare a Scrum Workspace (Priority: P2)

As a Scrum Team member, I need a Notes folder, backlog lists, and reusable templates
that reflect the Scrum Guide so that the team can begin transparent inspection and
adaptation without treating optional practices as Scrum requirements.

**Why this priority**: The resource set delivers the user's operational outcome once
the two safe container primitives exist.

**Independent Test**: Prepare the workspace in an empty destination and verify the
expected folder, two lists, and template titles exist; rerun container setup and
verify no duplicate containers are produced.

**Acceptance Scenarios**:

1. **Given** no Scrum workspace, **When** preparation is run, **Then** Notes contains
   a `Scrum` folder with reusable templates and Reminders contains `Product Backlog`
   and `Sprint Backlog` lists.
2. **Given** the containers already exist, **When** preparation is repeated, **Then**
   the same container identifiers are returned and no duplicate container is made.
3. **Given** no product context from the user, **When** templates are prepared,
   **Then** they contain prompts and placeholders only, not invented Product Goals,
   Sprint Goals, Product Backlog Items, owners, dates, or decisions.

### Edge Cases

- A folder or list name is empty or whitespace-only.
- The same displayed name appears more than once in the relevant scope.
- Notes has no usable default account or Reminders has no default reminder list.
- A permission grant is missing or denied for either application.
- A container is created successfully but optional metadata is temporarily absent.
- Existing user folders, lists, notes, and reminders are unrelated and must not be
  exposed, renamed, moved, overwritten, completed, or deleted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Notes skill MUST expose one command that ensures a single named
  folder in the Notes default account using the public Notes Apple Events dictionary.
- **FR-002**: The Reminders skill MUST expose an `ensure-list` command that ensures a
  single named reminder list through EventKit.
- **FR-003**: Both ensure commands MUST trim boundary whitespace, reject an empty
  resulting name before reading or writing app data, and use exact-name matching.
- **FR-004**: When exactly one match exists, each ensure command MUST return that
  existing container without writing and report `created: false`.
- **FR-005**: When no match exists, each ensure command MUST create exactly one
  container and report `created: true` with its identifier and name.
- **FR-006**: Multiple exact matches MUST be treated as ambiguous and MUST fail before
  any write rather than selecting one arbitrarily.
- **FR-007**: A new Reminders list MUST be an EventKit reminder calendar associated
  with the same source as `defaultCalendarForNewReminders()` and saved immediately.
- **FR-008**: Missing Notes Automation or Reminders full-access permission MUST
  produce an actionable, application-specific error.
- **FR-009**: Neither skill MUST expose folder/list deletion, whole-note replacement,
  or direct database access.
- **FR-010**: Each invocation MUST perform at most one external mutation; creating
  several Scrum resources requires separate, observable invocations.
- **FR-011**: Successful command output MUST be one JSON object containing `id`,
  `name`, `created`, and the relevant account/source name when available.
- **FR-012**: The Scrum workspace MUST contain a Notes folder named `Scrum` and
  Reminders lists named `Product Backlog` and `Sprint Backlog`.
- **FR-013**: The Notes folder MUST contain reusable templates covering Product Goal,
  Definition of Done, Sprint Planning, Daily Scrum inspection, Sprint Review, Sprint
  Retrospective, impediments, and decision rights.
- **FR-014**: Templates MUST distinguish Scrum-defined commitments and events from
  supplemental practices, and MUST use placeholders when product facts are unknown.
- **FR-015**: Deterministic tests MUST cover both public commands, their idempotence
  contract, validation, ambiguity behavior, official platform interfaces, and the
  absence of destructive operations before live-app validation occurs.
- **FR-016**: Skill documentation and repository guidance MUST describe the new
  commands, permissions, official API basis, safety limits, and prepared topology.

### Key Entities

- **Notes Folder Result**: Identifier, displayed name, default account name, and a
  Boolean indicating whether this invocation created the folder.
- **Reminder List Result**: EventKit calendar identifier, displayed name, source name,
  and a Boolean indicating whether this invocation created the list.
- **Scrum Template**: A named, reusable note containing prompts grounded in a Scrum
  artifact, commitment, event, or clearly labeled supplemental practice.
- **Scrum Workspace**: One Notes folder plus two Reminders lists; it contains no
  fabricated product decisions or Product Backlog Items.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In live macOS tests, ensuring each target folder or list twice leaves
  exactly one exact-name container and returns the same identifier both times.
- **SC-002**: The first ensure reports `created: true` when the target is absent and
  the second reports `created: false` in 100% of tested container operations.
- **SC-003**: The prepared workspace contains one `Scrum` folder, one `Product
  Backlog` list, one `Sprint Backlog` list, and all eight expected template titles.
- **SC-004**: Inspection finds zero invented Product Goals, Sprint Goals, backlog
  items, owners, dates, or decisions in the prepared templates.
- **SC-005**: All focused tests and the complete repository regression suite pass,
  with live-app evidence reported separately from deterministic test evidence.

## Assumptions

- The target is macOS with Apple Notes and Reminders available.
- Notes uses its configured default account; Reminders uses the source of the user's
  configured default reminders list. Account/source selection flags are out of scope.
- Existing exact-name containers are intentional and must be reused, not renamed.
- Templates are team aids; Scrum itself does not mandate these specific documents,
  list names, fields, or facilitation formats.
- Created live-app resources are retained for the user because automated deletion is
  prohibited; cleanup, if desired, remains manual in the Apple applications.
