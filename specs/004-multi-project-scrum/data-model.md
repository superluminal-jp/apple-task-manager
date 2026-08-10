# Data Model: Multi-Project Scrum Workspaces

## Project

A named unit of Scrum work management. Not a Swift/Python class — a resolved
combination of one Notes folder and two Reminders lists, addressed by name.

### Fields

- **name**: The human-chosen project name. Unique across the registry.
- **notes_folder**: The exact Notes folder name (and, once created, its stable
  `id`) holding that project's notes.
- **product_backlog**: The exact Reminders list name for that project's Product
  Backlog.
- **sprint_backlog**: The exact Reminders list name for that project's Sprint
  Backlog.

### Validation rules

- `name` MUST be non-empty after trimming boundary whitespace (same rule
  `ensure_folder.js` and `ensure-list` already apply to their `--name`).
- For a newly created project, `notes_folder` MUST equal `name` exactly, and
  `product_backlog`/`sprint_backlog` MUST equal `"<name> Product Backlog"` /
  `"<name> Sprint Backlog"` exactly (spec FR-002, FR-003).
- For a project registered from pre-existing resources, `notes_folder`,
  `product_backlog`, and `sprint_backlog` MAY be any already-existing exact names
  — the naming convention above is not retroactively enforced (spec FR-009,
  Research Decision 5).
- A project's three resource names MUST be resolvable via the existing exact-match
  lookups (`ensure_folder.js`, `remind-cli ensure-list`/`list`) without ambiguity
  before any Reminders/Notes operation proceeds for that project.

## Project Registry Event

One immutable, appended fact in the registry Notes note. The registry's current
state is always the fold of every event in note order (Research Decision 1); no
event is ever edited or removed once written.

### Common fields

- **event**: `register` or `set-current`.
- **name**: The project name the event refers to.

### `register`-only fields

- **notes_folder**, **product_backlog**, **sprint_backlog**: The project's three
  resource names at the time of this registration (see Project fields above).

### Validation rules

- A `register` event for a `name` that is already registered with different
  resource names MUST be rejected before writing — re-registering the same project
  with the same resource names is a no-op (mirrors `ensure_folder.js`/`ensure-list`
  idempotence); re-registering with different resource names is an ambiguous
  rename attempt and MUST be refused rather than silently applied (no rename
  capability exists — Research Decision 5).
- A `set-current` event for a `name` that is not yet registered MUST be rejected
  before writing.
- Folding is order-preserving and last-write-wins per field: the current project
  is the `name` from the last `set-current` event; a project's resource names are
  those from its (only, by the rule above) `register` event.
- A malformed block (missing its closing fence, unparseable field) MUST stop
  folding and report the problem rather than silently skipping it or guessing
  where it ends — the same refusal rule `scrum_block.py` already applies to a
  reminder body with a missing closing fence.

## Sprint Subfolder

A Notes folder created as a direct child of a project's `notes_folder`, named for
one Sprint (e.g., `Sprint 7`).

### Fields

- **name**: The Sprint's folder name.
- **parent**: The owning project's `notes_folder` id.

### Validation rules

- Matching and creation are scoped to direct children of `parent` only — a
  same-named folder elsewhere in the account (in a different project, or at the
  account root) MUST NOT match or block creation (Research Decision 2).
- More than one direct child of `parent` with the same exact name fails creation
  before any write, mirroring the top-level `ensure_folder.js` rule.
- Holds that Sprint's Sprint Goal, Sprint Review record, Retrospective record, and
  Impediment record notes (spec FR-011).

## Standing Artifact

A Product Goal or Definition of Done note. Not a distinct schema from an ordinary
Notes note — called out separately only because of where it MUST live.

### Validation rules

- MUST be created directly under a project's `notes_folder`, never inside any
  Sprint Subfolder of that project (spec FR-012) — it is a cross-Sprint commitment
  per the Scrum Guide, not a per-Sprint record.

## State transitions

```text
(no registry note) -> first `register` event -> project resolvable by name
                                               -> (optional) `set-current` event
                                               -> project resolvable with no name given

registered project -> Sprint subfolder created on first Sprint record
                    -> further Sprint records reuse the same subfolder (idempotent)
```

There is no `unregister` or `delete` event type. Removing a project's registry
entry, Notes folder, or Reminders lists is a manual, human, in-app action — no
automated deletion exists for either app (spec Edge Cases; Constitution Principle
I).
