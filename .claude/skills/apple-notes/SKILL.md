---
name: apple-notes
description: Read and write Apple Notes from macOS through the bundled osascript (JXA) scripts — ensure a folder (optionally as a subfolder of another), list a folder as JSON, fetch or resolve one note by id, create a note, append to an existing one, conditionally overwrite or delete a note under a hash gate, and fold a multi-project registry kept in a Notes note. Use when a request needs content out of Notes.app, when a stable folder must be prepared, when prose has to be recorded there (a goal, a decision, a retrospective, a log entry), when a note must be linked to a reminder, or when a Scrum project must be registered or resolved by name.
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
- Plain text used by append and named-block operations is escaped and wrapped
  in one `<div>` per line. Create and whole-body overwrite accept the safe
  Markdown subset documented below and convert it to Notes-compatible HTML.
- Notes derives the displayed title from the **first line of the body**, not
  from `name`. At creation, `write_note.js` supplies only a body beginning with
  one `<h1>`; supplying `name` as well makes Notes inject a duplicate line.

There is no query language. Filtering a folder means fetching it and filtering
in the caller — fine for a working folder, slow across a large account. Prefer
a dedicated folder to a search over everything.

## Scripts

| Script | Does |
|---|---|
| `scripts/ensure_folder.js` | Create or reuse one exact-name folder in the default account, or, with `--parent-id`, as a direct child of another folder |
| `scripts/list_notes.js` | A folder (or one id, or `--folders`) as JSON |
| `scripts/write_note.js` | Create a note (by folder name or `--folder-id`), append to one by id, or — under a hash gate — overwrite or delete one; see "Conditional overwrite and delete" below |
| `scripts/note_write_guard.py` | Computes the SHA-256 hash gate `--overwrite-stdin`/`--delete` check against; see "Conditional overwrite and delete" below |
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

# Replace one named, fenced region in place (created on first write)
echo "status: in progress" \
  | osascript -l JavaScript "$S/write_note.js" --id "<id>" --replace-block "status" --replace-stdin
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

`write_note.js` can append, replace one named fenced region via
`--replace-block` (see below), or — as of
[ADR 0007](../../../docs/adr/0007-conditional-overwrite-delete-for-notes.md) —
conditionally replace the whole body or delete the note entirely via
`--overwrite-stdin` / `--delete` (see "Conditional overwrite and delete"
below). The old unconditional prohibition is gone; a hash gate replaces it,
not an open door — a note is still prose the user wrote, and a bad overwrite
still has no undo this script controls.

### Safe Markdown formatting for create and overwrite

`create()` no longer passes `name` to `app.Note({...})` — only `body` (which
still starts with `<h1>{title}</h1>`). Passing `name` alongside `body` at
creation time made Notes.app inject its own extra, plain title line
*unconditionally*, regardless of what `--text` contained — confirmed by direct
experiment (three throwaway notes) during
[spec 006](../../../specs/006-notes-template-format-fix/research.md#decision-root-cause-of-the-reported-bug),
after an earlier, narrower fix (only stripping a caller-repeated title line)
turned out not to be sufficient on its own. Notes still derives both the
display title and `note.name()` correctly from the body's first line with no
`name` set.

On top of that structural fix, these rules apply to `create()`'s
`--text`/`--text-stdin` and to hash-gated `--overwrite-stdin`:

- **Title dedup** (`create()`'s `--text`/`--text-stdin` only): if the
  supplied text's first line (plain or `# Title`), trimmed, exactly matches
  `--title`, trimmed, that line is dropped before conversion. Nothing stops a caller from also
  typing the title as literal text, so this remains defense in depth on top
  of the `name` fix above. A first line that only resembles the title (e.g.
  has a suffix in parentheses) is not touched; only an exact match counts.
  `overwrite()` (`--overwrite-stdin`) does not need this rule — it sets
  `note.body` via plain property assignment on an already-existing note,
  which does not trigger Notes' title-injection behavior.
- **Validate and convert before writing**: the complete input is validated and
  converted before `folder.notes.push`, `note.name =`, or `note.body =`. An
  unsupported format or invalid attribute cannot create a partial note or
  partially replace an existing one. The overwrite hash check remains
  mandatory and occurs after conversion but before assignment.

Supported input syntax:

| Input | Notes format |
|---|---|
| `# Title`, `## Heading`, `### Subheading`, plain line | Title, Heading, Subheading, Body |
| fenced block with triple backticks | Monostyled |
| `**bold**`, `*italic*`, `++underline++`, `~~strike~~` | Bold, Italic, Underline, Strikethrough |
| `[text]{color=#RRGGBB size=24}` | Text color and/or size (1–512 px) |
| `{align=left|center|right|justify}text` | Paragraph alignment |
| `* item`, `1. item` | Bulleted List, Numbered List |
| two spaces before a list marker; an indented unmarked line before any nested list | Nested list; item-internal line break |

List nesting is limited to levels 0–8 and may not skip a level. An item
continuation must precede that item's nested list; a later continuation is
rejected because Notes would render it as an empty bullet. All input text
is HTML-escaped first; only converter-generated tags and validated style values
enter the body.

Apple's Notes guide also exposes formats the public Apple Events HTML boundary
did not preserve in the 2026-08-11 live probe. Under the selected **Option B**,
the script does not use Accessibility/UI automation and does not count a visual
approximation as support. It fails before writing and names the format:

| Input request | Result |
|---|---|
| `> quote` | `Block Quote` unsupported error |
| `==highlight==` | `Highlight` unsupported error |
| `{font=…}`, CSS `font-family`, `<font …>` | `Font family` unsupported error |
| `- item` | `Dashed List` unsupported error |
| `- [ ] item` / `- [x] item` | `Checklist` unsupported error |

Use `* ` for a normal Bulleted List. A dash is deliberately not treated as a
bullet because Notes documents Dashed List as a distinct native format.

`--html` (raw, caller-supplied HTML) is unaffected by the Markdown conversion
and rejection rules — it is used
as-is, since the caller already controls its structure. So are `--append`,
`--append-stdin`, `--append-html`, and `--replace-block`. See
[`specs/006-notes-template-format-fix/contracts/note-body-conversion.md`](../../../specs/006-notes-template-format-fix/contracts/note-body-conversion.md)
for the exact input → output mapping and worked examples.

### Editing a named block in place

`--replace-block <name>` (with `--id`, plus one of `--replace <text>` /
`--replace-stdin` / `--replace-html <html>`) finds a `--- <name> ---` … `---`
fenced region in the note's raw HTML body and replaces exactly that span —
never anything outside it. If the block does not exist yet, it is created
(appended), the same "ensure" posture `ensure_folder.js`/`ensure-list` already
take; if it exists exactly once, it is replaced; if the name matches more than
once, or the fence is unterminated, the call refuses rather than guessing.
This is the same fence convention already used for the `--- projects ---`
registry blocks and for Reminders' `--- scrum ---` block — only the mechanism
differs (Notes needs an HTML-aware splice; Reminders' body is plain text).

Use this for machine-owned structured content inside a note (a status line, a
checklist, the project registry) — not for editing a human's free-form prose;
free-form prose has its own, separate mechanism below.

`write_note.js --folder <name>` matches by exact name across the whole
account and now refuses when more than one folder shares that name, instead
of silently using the first match. Once same-named subfolders can exist
across different projects (every project's own "Sprint 7"), use `--folder-id
<id>` instead — the id `ensure_folder.js` returned for that folder — which is
unambiguous by construction. See
`specs/004-multi-project-scrum/contracts/apple-notes-write-note-folder-id.md`.

### Conditional overwrite and delete

`--overwrite-stdin` (replace the whole body from stdin) and `--delete`
(remove the note) both require `--expect-hash <sha256>` — the SHA-256
hexdigest of the note's plaintext body, computed from a `--plaintext` read
taken immediately beforehand:

```bash
S="${CLAUDE_SKILL_DIR}/scripts"

CURRENT=$(osascript -l JavaScript "$S/list_notes.js" --id "<id>" --plaintext --field plaintext)
HASH=$(printf '%s' "$CURRENT" | python3 "$S/note_write_guard.py" hash)

# Whole-body replace
echo "corrected content" | osascript -l JavaScript "$S/write_note.js" --id "<id>" \
  --overwrite-stdin --expect-hash "$HASH"

# Delete
osascript -l JavaScript "$S/write_note.js" --id "<id>" --delete --expect-hash "$HASH"
```

Before either call, `write_note.js` recomputes the hash of the note's
*current* plaintext body (via `note_write_guard.py decide`, run as a
subprocess with the current body piped in through a temp file) and compares
it to `--expect-hash`. If they don't match — the note changed since the
caller last read it — the call refuses: **no write happens, at all**, and the
command exits non-zero. This is optimistic concurrency, not a permission
check: a caller that read the note seconds ago and is correctly, deliberately
overwriting it sails through. What it stops is silently clobbering a note
that changed out from under the caller between the read and the write.

**This is a real, irreversible capability.** Unlike append and
`--replace-block`, a wrong `--overwrite-stdin` or `--delete` call can destroy
a human's prose. The hash gate does not, and cannot, protect against a
caller that read the note correctly and then made the wrong call anyway — no
hook can inspect what an Apple Event actually sends (`CLAUDE.md`, "破壊的操作").
**Before calling either flag, present the replacement content — or, for
`--delete`, the note being deleted — to the user and get their explicit
approval, every time.** This is a convention this script cannot enforce; it
is the operator's responsibility, spelled out again in
`apple-notes-operator`'s own instructions.

**Deletion recoverability (verified 2026-08-11, live, on this Mac):**
`--delete` moves the note into Notes.app's "Recently Deleted" folder — the
same place a UI-driven delete lands it, confirmed by re-reading the same note
id out of that folder immediately after deleting it via this script. Apple's
own support documentation states notes stay there for up to 30 days before
permanent removal; this session did not (could not, in one sitting) verify
the 30-day figure itself, only that the note lands there at all. Do not
extend this to "always recoverable" — a purged or iCloud-sync-boundary case
was not tested.

See
[ADR 0007](../../../docs/adr/0007-conditional-overwrite-delete-for-notes.md),
[specs/005-notes-conditional-overwrite](../../../specs/005-notes-conditional-overwrite/)
for the full design and live-verification evidence, and
[Constitution](../../../.specify/memory/constitution.md) v2.0.0 Principle I
for the governing rule.

## The project registry

Multi-project workspaces need somewhere to record which projects exist, their
Notes-folder/Reminders-list names, and which is current. Although
`write_note.js` has a separately approved, hash-gated whole-body overwrite,
the registry deliberately uses an **append-only event log**: a dedicated Notes note holding
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

- Notes text styles, font/color/size, highlighting, and alignment — [Format notes on Mac](https://support.apple.com/guide/notes/format-notes-apd1955d3b21/mac)
- Bulleted, Dashed, Numbered, Checklist, nesting, and item line breaks — [Add lists in Notes on Mac](https://support.apple.com/guide/notes/add-lists-apd93c815aa0/4.13/mac/26)
- Title, Heading, Subheading, Body, Monostyled, and Block Quote shortcuts — [Keyboard shortcuts and gestures in Notes on Mac](https://support.apple.com/guide/notes/keyboard-shortcuts-and-gestures-apd46c25187e/mac)
- No official route beyond AppleScript — [Apple Developer Forums, "Interacting with the Notes application"](https://developer.apple.com/forums/thread/775692)
- Notes AppleScript dictionary (`note`: `name`, `id`, `container`, `body`, `creation date`, `modification date`) — [The Notes Application](https://www.macosxautomation.com/applescript/notes/index.html), [The Note Class](https://www.macosxautomation.com/applescript/notes/04.html)
- "Add Link" documented targets (Safari, Books, Podcasts — no Reminders) — [Add links in Notes on Mac](https://support.apple.com/guide/notes/apde615d29c2/mac)
- Automation permission and the `-10827`-class errors — [Apple-CLI](https://lib.rs/crates/apple-cli)
- Viewing a scripting dictionary — [View an app's scripting dictionary in Script Editor](https://support.apple.com/guide/script-editor/view-an-apps-scripting-dictionary-scpedt1126/mac)
- Folder creation contract — the installed Notes scripting dictionary exposes
  the application's `default account`, account `folder` elements, and folder
  `name`/`id`; inspect it in Script Editor using Apple's procedure above.
