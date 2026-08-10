---
name: apple-reminders
description: Read and write Apple Reminders from macOS through the bundled EventKit CLI (remind-cli) — ensure or list a Reminders list as JSON, create, update or complete a reminder, resolve one by identifier, and read or write the machine-readable scrum block inside a reminder body. Use when a request needs reminder or task data out of Reminders.app, when a stable list must be prepared, when items must be added or completed there, or when a Sprint Backlog kept in Reminders has to become flow-metric input.
when_to_use: Any request touching Apple Reminders or Reminders.app on macOS — "what's on my Sprint Backlog", "add a reminder", "mark it done", "which items did I forget to start", "turn my reminders into cycle time data". Also load it before writing any EventKit, AppleScript, or JXA against Reminders, so the property surface, the build step, and the permission model are known first.
---

# Apple Reminders

Operate Reminders.app through `remind-cli`, a small EventKit tool built from
the single Swift file in this skill. Fetch and write with EventKit; decide with
Python. That split is the design: `scrum_block.py` is unit-tested on any
platform, while the Swift half only runs on macOS.

## Why EventKit here, and AppleScript for Notes

The two apps are not symmetrical, so they do not get the same treatment.

**Reminders has EventKit** — Apple's official framework, and the only route
that returns reminders as typed, queryable objects instead of Apple Event
records to be parsed back out of `osascript` output. For data that feeds flow
metrics that is the difference that matters: a predicate fetch over a list is
one call, every field arrives typed, and properties AppleScript never exposed
(recurrence rules, the server-side external identifier, priority semantics)
are reachable.

**Notes has no equivalent** — no framework at all. AppleScript is the only
supported route, so the `apple-notes` skill uses it. Using the best route for
each app costs a second mechanism; pretending they are alike costs one of them
the better one.

The price of EventKit is a build step and a different permission category.
Both are handled below, and neither is optional.

## Before the first call

### 1. Build the tool

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/build.sh"   # prints the binary path; no-op if current
```

Needs the Xcode Command Line Tools (`xcode-select --install`). One `swiftc`
call over one file — no package manifest, no lockfile, no SPM.

The binary is gitignored. If it is missing, build it rather than reporting a
broken skill.

**Do not build by hand without the linker flags.** `build.sh` links
`Info.plist` into the binary's `__TEXT,__info_plist` section, and that is
load-bearing: TCC reads the usage description out of the running binary, so a
bare Mach-O with no such section gives the permission dialog nowhere to come
from. Every call then fails as "access not granted" with no way for the user
to grant it — a build defect that looks exactly like a user denial.

### 2. Grant Reminders access

EventKit's permission is the **Reminders** privacy category — *not* Automation,
which is what the `apple-notes` skill needs. They are separate grants and are
denied separately.

The first run raises a dialog. If it does not appear, or was denied, the user
grants it at *System Settings → Privacy & Security → Reminders*. macOS 14 split
this into full and write-only access; this tool reads, so it requests full
access and will not silently proceed with write-only.

Neither the build nor the grant can be done non-interactively. On a headless
run, say so rather than retrying.

The `Bash` call itself also prompts in Claude Code. Nothing here is
pre-approved on purpose — these commands change the user's own task data.

## The property surface

`remind-cli` emits, per reminder: `id`, `externalId`, `name`, `body`,
`completed`, `completionDate`, `creationDate`, `modificationDate`, `dueDate`,
`priority`, `list`, `hasRecurrenceRules`.

`body` is `EKReminder.notes`. The field carries the pipeline's name rather than
EventKit's so that `scrum_block.py` and its tests are unaffected by which
backend produced the JSON.

**Two identifiers, and they are not interchangeable:**

- `id` (`calendarItemIdentifier`) — local, and documented as *not* guaranteed
  to persist when an item moves between accounts.
- `externalId` (`calendarItemExternalIdentifier`) — the server-provided CalDAV
  identifier, stable across that move. **Cross-app link markers store this
  one.** It is not guaranteed unique — Apple documents that recurring items can
  share one — so a lookup returning several is reported, never guessed at.

`get`, `update`, and `complete` accept either.

### What is still not reachable

- **Tags, subtasks, sections, smart lists.** Absent from EventKit *and*
  AppleScript. Reaching them needs the private ReminderKit framework or reading
  Reminders' SQLite store directly — both break on OS updates. Do not offer
  either; put the information in the body block instead.
- **A start date.** `EKReminder.startDateComponents` exists, but Reminders.app
  ignores it and returns `nil` for anything created in the app. Switching to
  EventKit did **not** solve this — it is why `started` still lives in the body
  block.
- **The GUI's "linked item" chip.** Not `EKReminder.url`, and not reproducible
  from any public API. See *Linking to a note*.

## Commands

| Command | Does |
|---|---|
| `lists` | Every reminder list, by name |
| `ensure-list --name <name>` | Create or reuse one exact-name list in the default reminder source |
| `list <name> [--open-only]` | One list as JSON |
| `get <identifier>` | One reminder, by either identifier |
| `create --list … --name …` | Create one |
| `update <identifier> …` | Update one; never creates |
| `complete <identifier> [--undo]` | Complete or reopen one |

```bash
CLI="$(bash "${CLAUDE_SKILL_DIR}/scripts/build.sh")"

"$CLI" lists
"$CLI" ensure-list --name "Product Backlog"
"$CLI" list "Sprint Backlog" --open-only
"$CLI" get "<identifier>"
"$CLI" create --list "Sprint Backlog" --name "Ship the login form" --due 2026-08-08
"$CLI" complete "<identifier>"
```

`ensure-list` trims boundary whitespace and requires a non-empty name. It uses
exact, case-sensitive matching across reminder-capable EventKit calendars. One
match is reused with `created: false`; no match creates one reminder calendar
in the same source as the user's configured default reminder list and returns
`created: true`; multiple matches fail before writing. The JSON result contains
`id`, `name`, `source`, and `created`. If no default reminder list/source is
configured, the command stops instead of guessing an account. There is no
source-selection, rename, bulk-create, or list-removal command, and each call
can create at most one list.

There is no delete command, and `update` never falls back to creating. Both are
structural, not advisory. Deleting a reminder destroys the only record of its
Cycle Time and no guardrail hook can recognise a destructive EventKit call, so
deletion stays a human action in Reminders.app — if a user asks for one, tell
them where to click.

**There is no list-grouping ("sub-list") command, and none is planned.**
EventKit's public API exposes no type or method for a reminder list group —
confirmed directly by an Apple engineer on the Developer Forums (thread
683611: "It's not currently possible to view, modify, and create groups of
reminder lists through EventKit"), current as of 2024–2025, and true
regardless of account type (iCloud or otherwise). The only workaround is
direct access to Reminders' private SQLite store, which this skill does not
use for the same reason it does not use it for tags or subtasks: private
schemas break on OS updates. Multi-project separation on the Reminders side is
achieved only through flat list naming (`<Project> Product Backlog` /
`<Project> Sprint Backlog`) — see `docs/adr/0006-project-registry-as-notes-event-log.md`.

Never set `completionDate` by hand. EventKit sets it when `isCompleted` flips,
so the timestamp comes from the framework rather than this process's clock.

## The scrum block

An opt-in convention, used when a Sprint Backlog lives in Reminders. Because
neither tags nor a usable start date are reachable, the metadata goes in `body`:

```
--- scrum ---
sprint: 7
size: M
started: 2026-08-01
note: x-coredata://ABC-123/ICNote/p42
---
```

Prose above and below the fence is preserved — a human editing the reminder in
Reminders.app will put it there. `scrum_block.py` is the only thing that should
write this block; it refuses to rewrite a body whose closing fence is missing
rather than guess where the user's prose begins.

```bash
CLI="$(bash "${CLAUDE_SKILL_DIR}/scripts/build.sh")"
S="${CLAUDE_SKILL_DIR}/scripts"
FLOW="$HOME/.claude/skills/scrum-master/scripts/flow_metrics.py"

# Flow-metric input, then the metrics themselves
"$CLI" list "Sprint Backlog" | python3 "$S/scrum_block.py" csv > tickets.csv
python3 "$FLOW" tickets.csv --as-of "$(date +%F)"

# Items in flight that never recorded a start -- these are missing from
# Cycle Time entirely, so check this before trusting any of the numbers
"$CLI" list "Sprint Backlog" --open-only | python3 "$S/scrum_block.py" unstarted

# Record a start (read-modify-write; the block spans lines, hence stdin)
"$CLI" get "<id>" | python3 -c 'import json,sys; print(json.load(sys.stdin)["body"] or "")' \
  | python3 "$S/scrum_block.py" set --started today \
  | "$CLI" update "<id>" --body-stdin
```

`csv` emits exactly `item_id,started_at,completed_at`, which is what the
`scrum-master` skill's `flow_metrics.py` reads — so real Reminders data runs
through it unmodified, and no metric has to be invented.

Two properties of the data worth stating whenever these numbers are reported:

- **An item with no `started` is absent from Cycle Time.** `csv` drops it and
  warns on stderr; `unstarted` names it. Report the count alongside the metrics
  — a median over half the sprint is not a median of the sprint.
- **`creationDate` → completion is Lead Time, not Cycle Time.** The gap between
  the two is the item's wait in the Product Backlog. Keep them separate; never
  substitute one for the other.

## Linking to a note

The chip that Reminders shows for a GUI-created link cannot be produced from
any public API. `EKReminder.url` is a different field that does not drive it —
a long-standing report on the Apple Developer Forums — and the
`x-apple-reminderkit://` scheme that does is undocumented and unowned.

So links are stored as identifiers and resolved by command: the `note:` key
above holds a note's id, and the note's body holds `[[reminder:<externalId>]]`
going the other way. Resolving either direction is a `get` (or the notes
skill's `--id`) lookup. The trade-off is deliberate — no one-tap native link,
in exchange for a link built only on the identifiers both apps publish.

Use `externalId` in markers, for the stability reason above. Identifiers can
still go stale: a deleted target leaves an orphan marker. Verify a link
resolves before presenting it as live.

## Reporting back

Return the answer, not the transcript. A list of 200 reminders is JSON the
caller does not need; the three overdue ones are. When a command fails, say
which of the three preconditions is the likely cause — the build, the Reminders
grant, or the Claude Code Bash permission.

## Sources

- `EKEventStore.requestFullAccessToReminders` and the macOS 14 full/write-only split — [Apple Developer Documentation](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoreminders(completion:))
- Creating a reminder-capable calendar — [`EKCalendar.init(for:eventStore:)`](https://developer.apple.com/documentation/eventkit/ekcalendar/init(for:eventstore:))
- Selecting the user's configured destination — [`defaultCalendarForNewReminders()`](https://developer.apple.com/documentation/eventkit/ekeventstore/defaultcalendarfornewreminders()) and [`EKCalendar.source`](https://developer.apple.com/documentation/eventkit/ekcalendar/source)
- Persisting a calendar immediately — [`saveCalendar(_:commit:)`](https://developer.apple.com/documentation/eventkit/ekeventstore/savecalendar(_:commit:))
- `calendarItemIdentifier` — [Apple Developer Documentation](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemidentifier)
- `calendarItemExternalIdentifier`, the server-provided identifier — [Apple Developer Documentation](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemexternalidentifier)
- `calendarItemIdentifier` not persisting across calendar changes — [Programming iOS, ch. 32](https://www.apeth.com/iOSBook/ch32.html)
- `startDateComponents` and Reminders.app ignoring it — [Apple Developer Documentation](https://developer.apple.com/documentation/eventkit/ekreminder/startdatecomponents), [Apple Developer Forums thread 676018](https://developer.apple.com/forums/thread/676018)
- `EKReminder.url` not driving the GUI link — [Apple Developer Forums thread 128140](https://developer.apple.com/forums/thread/128140), [thread 739541](https://developer.apple.com/forums/thread/739541)
- Embedding `Info.plist` in a single-file CLI so TCC can show a dialog — [keith/reminders-cli architecture](https://deepwiki.com/keith/reminders-cli), [mcp-server-apple-reminders](https://www.mcpserverfinder.com/servers/fradser/mcp-server-apple-reminders)
- EventKit-backed Swift CLI with JSON output as prior art — [ekctl](https://schappi.com/blog/meet-ekctl-a-command-line-interface-for-managing-calendars-and-reminders-on-maco)
- Tags and subtasks absent from the public surface — [Introducing RemCTL (MacStories)](https://www.macstories.net/stories/introducing-remctl-the-power-user-reminders-cli-for-macos-and-ai-agents/)
- Cycle Time / Lead Time / WIP definitions — `scrum-master` skill, `references/sources.md` `[KGS21]`
