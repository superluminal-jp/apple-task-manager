# Quickstart: Prepare the Scrum Workspace

The implementation is complete only after the deterministic suite passes and these
native checks succeed on a permission-enabled Mac.

```bash
S="$PWD/.claude/skills/apple-notes/scripts"
R="$PWD/.claude/skills/apple-reminders/scripts"
CLI="$(bash "$R/build.sh")"

osascript -l JavaScript "$S/ensure_folder.js" --name "Scrum"
osascript -l JavaScript "$S/ensure_folder.js" --name "Scrum"

"$CLI" ensure-list --name "Product Backlog"
"$CLI" ensure-list --name "Product Backlog"
"$CLI" ensure-list --name "Sprint Backlog"
"$CLI" ensure-list --name "Sprint Backlog"
```

The first call for an absent target reports `created: true`; the second reports
`created: false` and the same identifier. Create template notes separately with the
existing append-safe writer, using each file in `scrum/templates/` as the body. Do
not overwrite an existing note with the same title; inspect the `Scrum` folder first.

Run deterministic verification:

```bash
bash tests/run-apple-operators.sh
```

Retain all live resources for the user. If cleanup is desired, it is performed
manually in Notes and Reminders because the skills intentionally expose no deletion.

## Verification Evidence (2026-08-03)

- Notes `Scrum`: first ensure created one folder; second ensure reused the same id.
- Reminders `Product Backlog`: first ensure created one list; second reused its id.
- Reminders `Sprint Backlog`: first ensure created one list; second reused its id.
- Notes inspection: exactly eight expected template titles, all containing an
  unfilled placeholder; six classified as Scrum-defined and two as supplemental.
- Deterministic suites: 120 operator checks, 17 flow-metric tests, and 46 Scrum-block
  tests passed (183 total). Swift compilation also passed.
- No existing user object was renamed, moved, overwritten, completed, or deleted.
