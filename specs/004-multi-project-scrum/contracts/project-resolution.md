# Contract: Project resolution for Scrum-purpose Apple operations

Applies to `apple-notes-operator` and `apple-reminders-operator` whenever a
request would read or write Reminders/Notes data for Scrum purposes (a Sprint
Backlog item, a Sprint Goal note, flow metrics, and so on). Requests that do not
concern a Scrum project (an unrelated reminder or note) are unaffected.

## Resolution order

1. **Explicit name.** If the request names a project, resolve it against the
   registry (`project_registry.py resolve`, fed by the registry note's
   plaintext body). Proceed only if that name is a registered project.
2. **Current project.** If no project is named, use the registry's `current`
   value from the same `resolve` output.
3. **Refuse.** If neither (1) nor (2) yields a registered project, stop before
   touching Reminders or Notes and report the ambiguity: name the missing input
   (no project named, and no current project set) and, if helpful, list the
   registered project names from step (1)'s lookup.

No other source of truth is consulted. In particular, an operator MUST NOT infer
a project from a reminder or note's own content (title guessing, folder-name
similarity) — only the registry's own event log resolves a project.

## Scope enforcement

Once a project is resolved, every Reminders/Notes call the operator makes for
that request MUST target only that project's three resource names
(`notes_folder`, `product_backlog`, `sprint_backlog`, as recorded by the
registry). An operator MUST NOT:

- List, read, or write another registered project's Notes folder or Reminders
  lists in the same request.
- Fall back to the pre-multi-project fixed names (`Scrum`, `Product Backlog`,
  `Sprint Backlog`) unless the resolved project's registry entry actually
  contains those names (true for the migrated first project, false for any
  other project — see `data-model.md` § Project).

## Ambiguity is reported, never guessed

An operator that cannot resolve a project MUST return the ambiguity to the
caller — not create a project, not pick the first or most-recently-registered
one, and not fall back to any hardcoded name. This mirrors the existing rule for
an ambiguous reminder identifier or an ambiguous exact-name folder/list match:
report the candidates, do not choose one.

## What this contract does not cover

- Creating or registering a project in the first place (`project-registry.md`
  covers the write side; project *creation* also calls the existing
  `ensure_folder.js` / `ensure-list` operations, unchanged, using the resolved
  project's names).
- Cross-project aggregation. There is no resolution outcome that means "every
  project" — out of scope per spec Assumptions.
