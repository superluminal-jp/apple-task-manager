# Research: Multi-Project Scrum Workspaces

## Decision 1: The project registry is an append-only event log, not a mutable record

- **Decision**: The registry Notes note holds a sequence of small fenced
  `--- projects ---` blocks, each describing one event (`register` a project, or
  `set-current` a project). Current state — the set of registered projects and
  which one is current — is computed by folding every block in the note top to
  bottom, not by editing a single record in place.
- **Rationale**: `apple-notes`'s `write_note.js` can only create a note or append
  to one; it cannot replace or partially edit an existing body (`apple-notes`
  SKILL.md, "Two constraints to state up front" / "Scripts" table — this is
  structural, the same reason deletion is unsupported). A registry designed as one
  mutable "current record" would need an in-place edit — e.g., flipping which
  project is current, or updating a project's stored resource names — that the
  available tooling cannot perform without either overwriting the whole note (which
  risks destroying a user's own prose, and which `write_note.js` refuses by design)
  or inventing a new script capability the constitution's Principle I (Preserve
  User Records) counsels against adding casually. An append-only log needs no
  in-place edit: registering a project or switching current is always a new
  append, which is exactly the one write primitive `write_note.js` already
  supports safely.
- **Alternatives considered**:
  - **One mutable block, rewritten on each change** (rejected): requires a
    body-replace operation that does not exist; building one would duplicate the
    same class of risk this project already declined to take on for Reminders tags
    (ADR 0001) and note deletion (`apple-notes` skill) — reaching for a capability
    Apple's public interfaces do not offer safely.
  - **One block per project, edited via `--id` targeting** (rejected): still
    requires editing an existing note body, which `write_note.js` cannot do; and
    even if it could, Notes exposes no note-level lock, so a stale read-modify-write
    could race a user's own manual edit in the app.
  - **Separate Notes note per project instead of one shared registry** (rejected):
    the clarification session already decided the registry MUST be one dedicated
    Notes note (README-facing decision, spec FR-005); scattering registration state
    across N notes reintroduces exactly the "which note is authoritative" ambiguity
    a single registry was meant to remove, and it does not fix the append-only
    problem — each per-project note would still need in-place edits to switch
    fields.

## Decision 2: Sprint subfolders extend `ensure_folder.js`, scoped to one parent

- **Decision**: Add an optional `--parent-id <id>` (or `--parent-name <name>`,
  resolved the same way the top-level case already resolves account folders) to
  `ensure_folder.js`. When given, matching, creation, and the ambiguity-refusal
  rule apply only among the direct children of that parent folder — the existing
  account-wide matching stays the default for a plain `--name`.
- **Rationale**: Notes' AppleScript dictionary exposes `folder.folders` as a
  writable element (`macosxautomation.com`, "The Notes Application — folder": the
  folder class "contains two elements, folders, notes" and is itself "contained by
  application, accounts, folders"; nested folders are created by targeting the
  parent folder with `tell folder parentFolder to make new folder`). This is the
  same idempotent, exact-match, ambiguity-refusing pattern `ensure_folder.js`
  already implements for the account root — only the search scope changes.
- **Alternatives considered**:
  - **A second script, `ensure_subfolder.js`** (rejected): the matching,
    ambiguity-refusal, and JSON-shape logic would be duplicated almost verbatim;
    the constitution's Principle V favors a self-contained, non-duplicated
    repository over two near-identical scripts.
  - **Give up on Sprint subfolders; keep all Sprint notes flat inside the project
    folder** (rejected): the clarification session explicitly chose Sprint
    subfolders (spec User Story 5); this alternative was already declined by the
    user, not newly discovered here.

## Decision 3: Reminders separation stays name-only; no sub-list capability is attempted

- **Decision**: `remind-cli` and its `ensure-list` command are unchanged. A
  project's two Reminders lists are distinguished only by their flat names
  (`<ProjectName> Product Backlog`, `<ProjectName> Sprint Backlog`); no list
  grouping, nesting, or "sub-list" concept is added.
- **Rationale**: EventKit's public API has no type or method for a reminder list
  group, confirmed directly by an Apple engineer on the Developer Forums ("It's not
  currently possible to view, modify, and create groups of reminder lists through
  EventKit," thread 683611) and unchanged as of 2024–2025 per the same thread. The
  in-app "Add Group" feature is layered on iCloud's own sync model, not on any
  route EventKit exposes, regardless of account type. The only documented
  workaround is direct SQLite access to Reminders' private store or reverse
  engineering `remindd` — both are exactly the class of private-framework,
  OS-update-fragile access Constitution Principle II and ADR 0001 (tags/subtasks)
  already ruled out for the same reason.
- **Alternatives considered**:
  - **Read Reminders' SQLite store directly for group membership** (rejected, see
    Rationale): reintroduces the private-store risk this project has already
    rejected once.
  - **Simulate grouping by a shared name prefix only, no folder object** (this is
    in fact the chosen design — see Decision above; recorded here to be explicit
    that "grouping" in the Reminders sense was considered and is not what the flat
    naming convention provides. The flat names give *searchability*, not an
    in-app visual group).

## Decision 4: Project resolution order for every Scrum-purpose operation

- **Decision**: An operation that touches Reminders or Notes for Scrum purposes
  resolves its target project in this order: (1) a project name given explicitly
  in the request; (2) otherwise, the registry's current project, resolved by
  folding the registry note's events; (3) otherwise, stop and report the
  ambiguity. No operation may silently default to "the most recently mentioned"
  or "the only other" project.
- **Rationale**: Directly satisfies spec FR-007/FR-008 and Constitution Principle
  IV (data access must not guess when resolution is ambiguous) — the same
  ambiguity-refusal posture `ensure_folder.js`, `ensure-list`, and
  `reminder(withIdentifier:)` already use for duplicate names.
- **Alternatives considered**:
  - **Default to the first registered project when none is named** (rejected):
    silently picks a project the caller did not name, exactly the guess Principle
    IV forbids.
  - **Require a project name on every single call, no current-project concept**
    (rejected): this was the "毎回名前を指定" option offered during clarification
    and explicitly not the one chosen — the user chose to keep a registry with a
    switchable current project (spec User Story 3).

## Decision 5: Migrating existing data is registration only, never rename

- **Decision**: Bringing the pre-existing "Scrum" Notes folder and "Product
  Backlog"/"Sprint Backlog" Reminders lists under the registry is exactly one
  `register` event naming their real, unchanged resource names. No script gains a
  rename capability.
- **Rationale**: Neither `ensure_folder.js` nor `remind-cli` has a rename
  operation, by explicit original design (`ensure_folder.js` docstring: "no move,
  rename, nested-folder, or deletion operation"; `apple-reminders` SKILL.md: "no
  source-selection, rename, bulk-create, or list-removal command"). The registry's
  event log already stores each project's actual resource names per event (Decision
  1), so it does not need every project to satisfy the `<ProjectName> …` naming
  convention — only newly created projects do, because they are provisioned
  through `ensure_folder.js`/`ensure-list` using that convention as the requested
  name.
- **Alternatives considered**:
  - **Add rename support to both scripts so the first project's resources can
    match the convention exactly** (rejected): a new mutation capability with no
    other user in this spec, expanding both scripts' risk surface for a purely
    cosmetic gain; the registry already tolerates non-conforming names for
    pre-existing projects without it.
