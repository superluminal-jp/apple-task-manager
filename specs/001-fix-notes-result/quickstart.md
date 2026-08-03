# Quickstart: Validate Reliable Apple Notes Results

## Prerequisites

- macOS with Notes.app available.
- Automation permission for the current terminal/Codex process to control Notes.
- A writable Notes folder selected for a uniquely named test note.

## Deterministic regression

Run the Apple operator contract suite:

```sh
bash tests/run-apple-operators.sh
```

Expected: all checks pass, including the regression that prohibits direct use of a
note's unavailable containing-object property.

## Live validation

Using the commands documented in `.claude/skills/apple-notes/SKILL.md`:

1. Create one uniquely named test note and retain the returned ID.
2. Append one uniquely identifiable line using that ID.
3. Read that note directly by ID with `--plaintext`.
4. Confirm all three commands exit successfully, return the same ID and actual folder,
   and contain no unrelated note metadata.
5. Invoke the ID lookup with a known-invalid ID and confirm it fails without creating
   or modifying a note.

The skill has no delete operation. Remove the uniquely named test note manually in
Notes.app after validation if cleanup is desired.

## Full regression

```sh
bash tests/run-scrum-block.sh
bash tests/run-flow-metrics.sh
bash tests/run-apple-operators.sh
```

Expected: every suite passes. Report deterministic results separately from the live
macOS result.
