---
name: apple-notes
description: Read and write Apple Notes from macOS through the bundled osascript (JXA) scripts — ensure a folder (optionally as a subfolder of another), list a folder as JSON, fetch or resolve one note by id, create a note, append to an existing one, and fold a multi-project registry kept in a Notes note. Use when a request needs content out of Notes.app, when a stable folder must be prepared, when prose has to be recorded there (a goal, a decision, a retrospective, a log entry), when a note must be linked to a reminder, or when a Scrum project must be registered or resolved by name.
when_to_use: Any request touching Apple Notes or Notes.app on macOS — "what does my Sprint Goal note say", "write this up in Notes", "append today's decision", "find the retro note". Also load it before writing any AppleScript or JXA against Notes, so the HTML body model and the macOS-only constraint are known first.
---

# Apple Notes

Operate Notes.app from the command line through the scripts in this skill.

Run scripts by their absolute path so they work whether this skill is installed
at project or user scope:

```bash
osascript -l JavaScript "${CLAUDE_SKILL_DIR}/scripts/list_notes.js" "Scrum"
```

## Two constraints to state up front

**Notes has no framework.** There is no EventKit equivalent, no Contacts-style
API. Apple Events — AppleScript, or JXA on the same dictionary — is the only
supported programmatic route. Everything else (Shortcuts, Automator) is built on
top of it or is a GUI path.

**It is macOS-only.** There is no iOS route to write a note programmatically.
If a workflow needs to run from iPhone, the note side of it cannot; say so
rather than designing around a path that does not exist. Shortcuts is the only
realistic iPhone input path, and it is a human tapping a button, not automation.

## Before the first call

Two separate permissions, failing differently.

1. **Automation (TCC).** The first `osascript` call raises a dialog asking the
   terminal app to control Notes. Approve it, or pre-grant it at
   *System Settings → Privacy & Security → Automation → (terminal app) →
   Notes*. Errors `-1743`, `-10004`, and `-10827` mean this was denied.
2. **Claude Code permission.** The `Bash(osascript …)` call itself prompts.
   Nothing here is pre-approved on purpose — these scripts change the user's
   own notes.

Neither can be granted non-interactively. On a headless run, say so rather than
retrying.

## The property surface

`id`, `name`, `body`, `creation date`, `modification date`, `container`
(and `folder`: `name`, `id`, `container`).

`id` is the stable handle — formatted `x-coredata://<store>/ICNote/p<N>`. Treat
it as opaque.

**`body` is HTML, not text.** Everything follows from that:

- Bodies are omitted from list output unless asked for (`--with-body`). A folder
  of retrospectives fetched in one call is a wall of markup nobody reads.
- `--plaintext` strips the markup for reading. Never round-trip that back into
  a body — it is lossy by construction.
- Text written into a note is escaped and wrapped in one `<div>` per line. A
  bare newline is whitespace in HTML and would collapse paragraphs into a
  run-on line.
- Notes derives the displayed title from the **first line of the body**, not
  from `name`. `write_note.js` sets both.

There is no query language. Filtering a folder means fetching it and filtering
in the caller — fine for a working folder, slow across a large account. Prefer
a dedicated folder to a search over everything.

## Scripts

| Script | Does |
|---|---|
| `scripts/ensure_folder.js` | Create or reuse one exact-name folder in the default account, or, with `--parent-id`, as a direct child of another folder |
| `scripts/list_notes.js` | A folder (or one id, or `--folders`) as JSON |
| `scripts/write_note.js` | Create a note (by folder name or `--folder-id`), or append to one by id |
| `scripts/project_registry.py` | Fold the append-only multi-project registry kept inside a Notes note; see "The project registry" below |

```bash
S="${CLAUDE_SKILL_DIR}/scripts"

# Read
osascript -l JavaScript "$S/list_notes.js" --folders
osascript -l JavaScript "$S/list_notes.js" "Scrum"
osascript -l JavaScript "$S/list_notes.js" --id "<id>" --plaintext

# Ensure a stable destination (safe to retry)
osascript -l JavaScript "$S/ensure_folder.js" --name "Scrum"

# Ensure a subfolder inside another folder (safe to retry)
osascript -l JavaScript "$S/ensure_folder.js" --name "Sprint 7" --parent-id "<folder id>"

# Create -- first line becomes the title
osascript -l JavaScript "$S/write_note.js" --folder "Scrum" \
  --title "Sprint 7 Goal" --text "Cut checkout drop-off on mobile."

# Append
echo "Retro action: shrink the WIP limit to 2" \
  | osascript -l JavaScript "$S/write_note.js" --id "<id>" --append-stdin
```

`ensure_folder.js` trims the boundary whitespace and requires a non-empty name.
Without `--parent-id`, it searches direct child folders of Notes' configured
default account using an exact, case-sensitive name. With `--parent-id`, the
same matching is scoped to that folder's direct children instead — a
same-named folder anywhere else in the account neither matches nor blocks
creation. Either way: one match is reused with `created: false`; no match
creates one folder with `created: true`; multiple matches fail before writing.
The JSON result also contains the folder `id`, `name`, and either `account`
(no-parent case) or `parent` (the resolved parent folder id). It intentionally
has no account-selection, rename, move, bulk-create, or delete operation —
`--parent-id` adds one new scope to the existing match/create logic, not a new
capability class.

`write_note.js` cannot delete and cannot replace a whole body — only append.
Both are structural, not advisory. A note is prose the user wrote; a bad
overwrite loses it with no undo outside Notes.app. If a user asks for a
rewrite or a deletion, tell them where to click rather than working around it.

`write_note.js --folder <name>` matches by exact name across the whole
account and now refuses when more than one folder shares that name, instead
of silently using the first match. Once same-named subfolders can exist
across different projects (every project's own "Sprint 7"), use `--folder-id
<id>` instead — the id `ensure_folder.js` returned for that folder — which is
unambiguous by construction. See
`specs/004-multi-project-scrum/contracts/apple-notes-write-note-folder-id.md`.

## The project registry

Multi-project workspaces need somewhere to record which projects exist, their
Notes-folder/Reminders-list names, and which is current. Because `write_note.js`
can only create or append — never replace a body — the registry is not a
single record but an **append-only event log**: a dedicated Notes note holding
one small `--- projects ---` block per fact (`register` a project, or
`set-current` one). `project_registry.py` folds every block into current state;
it never calls `osascript` itself.

```bash
N="${CLAUDE_SKILL_DIR}/scripts"

# Current state (every registered project, and which is current).
# --field plaintext is required: list_notes.js --id always returns a
# JSON array, and --field extracts one item's raw text directly.
osascript -l JavaScript "$N/list_notes.js" --id "<registry-id>" --plaintext --field plaintext \
  | python3 "$N/project_registry.py" resolve

# Register a new project, then append the result
osascript -l JavaScript "$N/list_notes.js" --id "<registry-id>" --plaintext --field plaintext \
  | python3 "$N/project_registry.py" register --name "ProjectA" \
      --notes-folder "ProjectA" \
      --product-backlog "ProjectA Product Backlog" \
      --sprint-backlog "ProjectA Sprint Backlog" \
  | osascript -l JavaScript "$N/write_note.js" --id "<registry-id>" --append-stdin
```

See `docs/adr/0006-project-registry-as-notes-event-log.md` for why this shape
was chosen over a single mutable record or a repository config file, and
`specs/004-multi-project-scrum/contracts/project-registry.md` for the full
block format and failure behavior. As with `write_note.js`'s body handling, a
malformed block (an unclosed fence, an unknown event, a missing field) is
never guessed past — folding stops and reports the problem.

Registering a project **does not require renaming pre-existing resources**: a
Notes folder or Reminders list that already exists under a different naming
scheme (for example, the pre-multi-project "Scrum" folder) can be registered
under its real names verbatim, because neither `ensure_folder.js` nor
`remind-cli` has a rename operation.

### Sprint subfolders

Within one project's folder, file each Sprint's Sprint Goal, Sprint Review
record, Retrospective record, and Impediment record in a Sprint-named
subfolder (`ensure_folder.js --name "Sprint 7" --parent-id <project folder
id>`). Product Goal and Definition of Done go directly in the project
folder, never inside a Sprint subfolder — they are cross-Sprint standing
commitments per the Scrum Guide, not per-Sprint records that would need
re-creating (or, worse, silently diverging) every Sprint.

Write into either location with `write_note.js --folder-id <id>` (the id
`ensure_folder.js` just returned), not `--folder <name>` — different
projects' Sprint subfolders routinely share a name ("Sprint 7"), and only the
id is guaranteed unambiguous.

## Linking to a reminder

Notes' own "Add Link" feature is documented for Safari, Books, and Podcasts —
Reminders appears nowhere in it, and there is no Shortcuts action that returns
a shareable link or external identifier for a note. Undocumented schemes
(`applenotes:note/<UUID>`, `x-apple-reminderkit://`) exist but are unowned and
break without notice.

So links are stored as ids and resolved by script. Paste the marker into the
note's body:

```
[[reminder:x-apple-reminder://UUID]]
```

An inline marker rather than a fenced block, because a note body is HTML the
user edits by hand and a block would not survive. The reminder side is the
mirror image — a `note:` key inside the `--- scrum ---` block, defined in the
`apple-reminders` skill. Each skill states its own side so either one works
alone when it is the only one loaded.

Resolving either direction is an `--id` lookup. The trade-off is deliberate: no
one-tap native link, in exchange for a link built only on object ids, the most
basic and most stable thing both apps expose. Ids can go stale — verify a link
resolves before presenting it as live.

## Reporting back

Return the answer, not the transcript. A folder's worth of HTML bodies is not a
result; the two lines the caller asked about are. When a script fails, give the
error and which of the two permissions above is the likely cause.

## Sources

- No official route beyond AppleScript — [Apple Developer Forums, "Interacting with the Notes application"](https://developer.apple.com/forums/thread/775692)
- Notes AppleScript dictionary (`note`: `name`, `id`, `container`, `body`, `creation date`, `modification date`) — [The Notes Application](https://www.macosxautomation.com/applescript/notes/index.html), [The Note Class](https://www.macosxautomation.com/applescript/notes/04.html)
- "Add Link" documented targets (Safari, Books, Podcasts — no Reminders) — [Add links in Notes on Mac](https://support.apple.com/guide/notes/apde615d29c2/mac)
- Automation permission and the `-10827`-class errors — [Apple-CLI](https://lib.rs/crates/apple-cli)
- Viewing a scripting dictionary — [View an app's scripting dictionary in Script Editor](https://support.apple.com/guide/script-editor/view-an-apps-scripting-dictionary-scpedt1126/mac)
- Folder creation contract — the installed Notes scripting dictionary exposes
  the application's `default account`, account `folder` elements, and folder
  `name`/`id`; inspect it in Script Editor using Apple's procedure above.
