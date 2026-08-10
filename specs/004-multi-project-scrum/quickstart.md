# Quickstart: Validate Multi-Project Scrum Workspaces

## Prerequisites

- Run the deterministic suites from the repository root; they need no macOS app or
  permission.
- Live verification (folder/list creation, registry note read/write) needs a Mac
  with Reminders and Automation (Notes) permissions already granted, per the
  `apple-notes` and `apple-reminders` skills.

## 1. Run the focused contract suites

```sh
bash tests/run-project-registry.sh
bash tests/run-apple-operators.sh
```

Expected: all `project_registry.py` fold/register/set-current/failure-mode tests
pass; the operator contract suite reflects the extended `ensure_folder.js`,
`write_note.js`, and the new project-resolution rules with no regression in the
pre-existing checks.

## 2. Create the registry note and register the first (existing) project

```sh
N="$PWD/.claude/skills/apple-notes/scripts"
R="$PWD/.claude/skills/apple-reminders/scripts"
CLI="$(bash "$R/build.sh")"

REGISTRY_ID=$(osascript -l JavaScript "$N/write_note.js" --folder "Scrum" \
  --title "Projects" --text "Project registry. Do not delete or hand-edit the fenced blocks below." \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

# list_notes.js --id always returns a JSON array (uniform with folder listing);
# --field plaintext extracts the raw text of the one item directly, so it pipes
# straight into project_registry.py without a JSON-unwrap step.
osascript -l JavaScript "$N/list_notes.js" --id "$REGISTRY_ID" --plaintext --field plaintext \
  | python3 "$N/project_registry.py" register --name "Scrum" \
      --notes-folder "Scrum" \
      --product-backlog "Product Backlog" \
      --sprint-backlog "Sprint Backlog" \
  | osascript -l JavaScript "$N/write_note.js" --id "$REGISTRY_ID" --append-stdin
```

Expected: no new Notes folder or Reminders list is created by this step — it only
registers the pre-existing "Scrum" / "Product Backlog" / "Sprint Backlog" under
the project name "Scrum" (spec User Story 4). Choose a different first-project
name if "Scrum" is not the name you want; the registered resource names stay the
pre-existing ones regardless. If "Product Backlog"/"Sprint Backlog" do not exist
yet on this Mac, create them first with `"$CLI" ensure-list --name "..."` — that
establishes the documented §4-bis baseline, and is a separate step from
registration itself.

## 3. Register a brand-new second project

```sh
"$CLI" ensure-list --name "ProjectA Product Backlog"
"$CLI" ensure-list --name "ProjectA Sprint Backlog"
PROJECT_A_ID=$(osascript -l JavaScript "$N/ensure_folder.js" --name "ProjectA" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

osascript -l JavaScript "$N/list_notes.js" --id "$REGISTRY_ID" --plaintext --field plaintext \
  | python3 "$N/project_registry.py" register --name "ProjectA" \
      --notes-folder "ProjectA" \
      --product-backlog "ProjectA Product Backlog" \
      --sprint-backlog "ProjectA Sprint Backlog" \
  | osascript -l JavaScript "$N/write_note.js" --id "$REGISTRY_ID" --append-stdin
```

Expected: exactly one new Notes folder ("ProjectA") and two new Reminders lists
("ProjectA Product Backlog", "ProjectA Sprint Backlog") exist; the registry note
now folds to two registered projects.

## 4. Verify isolation (User Story 2)

```sh
"$CLI" create --list "ProjectA Sprint Backlog" --name "Isolation probe A"
"$CLI" create --list "Sprint Backlog" --name "Isolation probe Scrum"

"$CLI" list "ProjectA Sprint Backlog" | grep -c "Isolation probe"
"$CLI" list "Sprint Backlog" | grep -c "Isolation probe"
```

Expected: each list contains exactly its own probe item and not the other's.

## 5. Switch and verify the current project (User Story 3)

```sh
osascript -l JavaScript "$N/list_notes.js" --id "$REGISTRY_ID" --plaintext --field plaintext \
  | python3 "$N/project_registry.py" set-current --name "ProjectA" \
  | osascript -l JavaScript "$N/write_note.js" --id "$REGISTRY_ID" --append-stdin

osascript -l JavaScript "$N/list_notes.js" --id "$REGISTRY_ID" --plaintext --field plaintext \
  | python3 "$N/project_registry.py" current
```

Expected: prints `ProjectA`.

## 6. Verify Sprint subfolder placement (User Story 5)

```sh
SPRINT_ID=$(osascript -l JavaScript "$N/ensure_folder.js" --name "Sprint 7" --parent-id "$PROJECT_A_ID" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

# --folder-id, not --folder "Sprint 7": once more than one project can have its
# own "Sprint 7" subfolder, a name-only --folder match is ambiguous by
# construction and write_note.js now refuses it (contracts/apple-notes-write-note-folder-id.md).
osascript -l JavaScript "$N/write_note.js" --folder-id "$SPRINT_ID" \
  --title "Sprint 7 Goal" --text "Placeholder goal text."
osascript -l JavaScript "$N/write_note.js" --folder-id "$PROJECT_A_ID" \
  --title "Definition of Done" --text "Placeholder DoD text."
```

Expected: the Sprint Goal note is inside "ProjectA/Sprint 7"; the Definition of
Done note is directly inside "ProjectA", not inside "Sprint 7".

## 7. Verify ambiguity refusal (Edge Cases)

Ask for Sprint Backlog items with no project named and, in a fresh registry state,
no current project set. Expected: the operator reports the ambiguity (no project
named, none current) and performs no Reminders/Notes read.

Also verify the underlying primitive directly: if two projects each have their
own same-named subfolder (for example, both created a "Sprint 1"),
`write_note.js --folder "Sprint 1"` (by name, not `--folder-id`) must fail with
an ambiguity message rather than silently writing into one of them.

## 8. Run full regressions

```sh
bash tests/run-scrum-block.sh
bash tests/run-flow-metrics.sh
bash tests/run-apple-operators.sh
bash tests/run-project-registry.sh
bash tests/run-scrum-role-agents.sh
```

Expected: every existing deterministic suite still passes alongside the new one —
this feature changes no Reminders body format, no `flow_metrics.py` input, and no
existing agent contract.

## Cleanup

Retain all live resources created above for the user unless they ask otherwise.
If cleanup is desired, it is performed manually in Notes and Reminders — the
skills intentionally expose no deletion (spec Edge Cases; Constitution Principle
I).

## Verification Evidence (2026-08-10)

Run end-to-end on the operator's actual Mac (macOS 26.5.2), against real
account data — not a fresh/sandboxed account:

- §2: registry note created inside the real, pre-existing "Scrum" folder;
  "Scrum" registered pointing at the real "Product Backlog"/"Sprint Backlog"
  lists (created fresh on this Mac since they did not already exist here) with
  no rename attempted.
- §3: "QuickstartCheck" registered as a second project; exactly one new Notes
  folder and two new Reminders lists were created, `created: true` in each
  JSON result.
- §4: probe reminders created in each project's Sprint Backlog; each list
  contained exactly its own probe and not the other's.
- §5: `set-current` then `current` round-tripped correctly against the real
  note body.
- §6: `ensure_folder.js --parent-id` created "Sprint 1" under "QuickstartCheck"
  (`created: true`), and reported `created: false` with the same id on a
  second call (idempotence confirmed live). A Sprint Goal note and a
  Definition of Done note were written via `--folder-id` and landed in the
  correct folders.
- §7: after deliberately creating a second, same-named "Sprint 1" subfolder
  under a different parent, `write_note.js --folder "Sprint 1"` (by name)
  refused with an ambiguity message and exit code 1, instead of silently
  picking one — confirming the `--folder-id` fix documented in
  `contracts/apple-notes-write-note-folder-id.md`.
- Two defects were found and fixed during this run, not anticipated by the
  original plan: `list_notes.js --id ... --plaintext` returns a one-element
  JSON array, not a bare object — `--field plaintext` is required to get raw
  text usable as `project_registry.py`'s stdin; and `write_note.js --folder
  <name>` had no ambiguity check at all before this feature, which is now a
  real risk once same-named Sprint subfolders can exist across projects — see
  `contracts/apple-notes-write-note-folder-id.md`.
- Not run: cross-account or iCloud-sync-boundary scenarios; a true first-ever
  registration into a brand-new (non-"Scrum") first project name.
