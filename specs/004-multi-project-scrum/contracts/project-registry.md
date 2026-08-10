# Contract: `project_registry.py`

Pure Python, platform-independent — mirrors the existing split in
`apple-reminders`: fetch and write with the platform API (`apple-notes`'s
`list_notes.js` / `write_note.js`), decide with Python. This script never calls
`osascript` itself; it only reads and writes text.

## Why a new script instead of extending `scrum_block.py`

`scrum_block.py` parses a *Reminders* body (`EKReminder.notes`, plain text). This
script parses a *Notes* body (HTML, read as `--plaintext`). The two are different
documents living in different apps with different write primitives (Reminders
bodies can be fully replaced; Notes bodies can only be appended to — see
`research.md` Decision 1), so the append-only event-log design here is not a
variant of `scrum_block.py`'s single mutable fence; it is a different contract.

## Invocation

```bash
# Fold every event in the registry note's plaintext body into current state.
# list_notes.js --id always returns a JSON array (uniform with folder
# listing), so --field plaintext is required to get the one item's raw text
# directly -- piping --plaintext alone yields a JSON array, not text.
osascript -l JavaScript "$N/list_notes.js" --id "<registry-note-id>" --plaintext --field plaintext \
  | python3 "$S/project_registry.py" resolve

# List every registered project name
... | python3 "$S/project_registry.py" list

# Which project is current (empty output, exit 0, if none set)
... | python3 "$S/project_registry.py" current

# Produce the text to append for a new registration (does not write to Notes)
python3 "$S/project_registry.py" register --name "ProjectA" \
  --notes-folder "ProjectA" \
  --product-backlog "ProjectA Product Backlog" \
  --sprint-backlog "ProjectA Sprint Backlog" \
  | osascript -l JavaScript "$N/write_note.js" --id "<registry-note-id>" --append-stdin

# Produce the text to append to switch current project (does not write to Notes)
python3 "$S/project_registry.py" set-current --name "ProjectA" \
  | osascript -l JavaScript "$N/write_note.js" --id "<registry-note-id>" --append-stdin
```

`resolve`, `list`, and `current` read the registry note's plaintext body from
stdin and report state. `register` and `set-current` take flags and print the
fenced block text to append — they never call `write_note.js` themselves; the
caller pipes the output into the existing append-only writer, the same
separation `scrum_block.py`'s `set` subcommand already uses for Reminders bodies.

## Block format

```text
--- projects ---
event: register
name: ProjectA
notes_folder: ProjectA
product_backlog: ProjectA Product Backlog
sprint_backlog: ProjectA Sprint Backlog
---
```

```text
--- projects ---
event: set-current
name: ProjectA
---
```

One event per fenced block. Prose above, below, and between blocks is preserved —
a human may read or annotate the registry note in Notes.app; only text inside a
`--- projects ---` … `---` fence is parsed. This mirrors the `--- scrum ---` fence
convention already used in Reminders bodies.

## `resolve` output

```json
{
  "projects": {
    "ProjectA": {
      "notes_folder": "ProjectA",
      "product_backlog": "ProjectA Product Backlog",
      "sprint_backlog": "ProjectA Sprint Backlog"
    }
  },
  "current": "ProjectA"
}
```

`current` is `null` when no `set-current` event has been folded yet.

## Failure behavior

- `register` refuses (non-zero exit, message to stderr, nothing printed to
  stdout) when the given `--name` is already registered with **different**
  resource names — this would be an unsupported rename, not a new registration.
  Re-registering the same name with identical resource names succeeds and prints
  the same block (idempotent, matching `ensure_folder.js`/`ensure-list`).
- `set-current` refuses when `--name` is not already registered by a prior
  `register` event visible in the piped-in current state (callers pass the
  `resolve` output, or a fresh empty state for a first-ever registration, so
  `set-current` before any `register` for that name fails).
- `resolve`/`list`/`current` stop and report a parse problem — naming the exact
  malformed block — rather than silently skipping it, when a `--- projects ---`
  fence has no closing `---`, an `event:` field names something other than
  `register`/`set-current`, or a required field for that event type is missing.
- Never invents a project's resource names. Every field in `resolve` output comes
  from a `register` event actually present in the note; nothing is guessed from a
  project's name.
