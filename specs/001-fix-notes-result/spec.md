# Feature Specification: Reliable Apple Notes Results

**Feature Branch**: `codex/fix-apple-notes-result`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Investigate the Apple Notes operation failure and implement the fix using Spec Kit."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trust Successful Writes (Priority: P1)

As an operator, I need a successful note creation or append to return a successful,
machine-readable result so that I do not retry an operation that already changed my
note.

**Why this priority**: A false failure after a successful write can cause duplicate
notes or duplicate appended text and makes every write unsafe to automate.

**Independent Test**: Create one uniquely named note, append one uniquely identifiable
line, and verify that both commands succeed and identify the affected note.

**Acceptance Scenarios**:

1. **Given** an existing writable Notes folder, **When** an operator creates a note,
   **Then** exactly one note is created and the command returns a successful result
   containing its identifier, title, folder, and timestamps.
2. **Given** an existing note identifier, **When** an operator appends text,
   **Then** the text is appended exactly once and the command returns a successful
   result for that same note.

---

### User Story 2 - Resolve a Note by Identifier (Priority: P2)

As an operator following a cross-application reference, I need to retrieve one note
by its identifier so that links stored in reminders can be resolved without listing
or exposing unrelated notes.

**Why this priority**: Identifier lookup is the documented basis of the Notes and
Reminders linking convention, but it does not itself mutate user data.

**Independent Test**: Retrieve the note created in User Story 1 by identifier and
verify that the returned metadata and requested content belong only to that note.

**Acceptance Scenarios**:

1. **Given** a valid note identifier, **When** an operator requests that note,
   **Then** the command succeeds and returns the note's identifier, title, folder,
   timestamps, and only the requested content representation.
2. **Given** an identifier that does not resolve, **When** an operator requests or
   appends to it, **Then** the command fails without creating or modifying any note.

### Edge Cases

- A note belongs to an account or folder whose containing object cannot be read
  directly even though the note's other properties are readable.
- Several folders have the same displayed name; the result must describe the folder
  that actually contains the identified note without guessing from the name alone.
- A newly created note has not yet propagated all optional metadata; a successful
  write must not be reported as failed solely because result formatting requests an
  unavailable optional value.
- A folder contains private, unrelated notes; resolving one note must not emit their
  titles or bodies.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A successful note creation MUST exit successfully and return one valid
  result object for the created note.
- **FR-002**: A successful append MUST exit successfully and return one valid result
  object for the updated note.
- **FR-003**: A valid identifier lookup MUST exit successfully and return the matching
  note's metadata.
- **FR-004**: Each successful result MUST include the note identifier, title, actual
  containing folder name, creation timestamp, and modification timestamp.
- **FR-005**: Folder resolution MUST NOT depend on a containing-object property that
  is unavailable for otherwise valid notes.
- **FR-006**: Identifier resolution MUST NOT emit metadata or bodies from unrelated
  notes in its user-visible output.
- **FR-007**: An unresolvable identifier MUST fail before any write and MUST NOT fall
  back to creating a note.
- **FR-008**: Plain-text and HTML safety behavior, append-only behavior, and the lack
  of deletion MUST remain unchanged.
- **FR-009**: The regression MUST be covered by a deterministic test that fails on the
  previous implementation and passes on the corrected implementation.

### Key Entities

- **Note Result**: The single operation result containing identifier, title, actual
  folder name, creation timestamp, and modification timestamp.
- **Folder Membership**: The relationship between a note identifier and the folder
  that actually contains it; folder display names are not assumed to be unique.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a live macOS test, 100% of the create, append, and identifier-read
  operations on the uniquely named test note return success when the underlying
  Notes operation succeeds.
- **SC-002**: All successful operation results identify the same note and its actual
  folder with no unrelated note metadata in output.
- **SC-003**: The invalid-identifier scenario produces zero new notes and zero changes
  to existing notes.
- **SC-004**: All existing repository checks and the new regression check pass.

## Assumptions

- Tests that access Notes run on macOS with Notes Automation permission already
  granted; deterministic repository tests do not require Notes.app.
- The current command arguments and JSON field names remain the public interface.
- Folder names may be duplicated across accounts, so membership is determined from
  note identifiers rather than selecting a folder by name during identifier lookup.
- Test notes remain subject to the existing no-delete policy and are cleaned up by
  the user in Notes.app when desired.
