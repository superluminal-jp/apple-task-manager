# Contract: `write_note.js` — `--folder-id` and ambiguity refusal

Discovered during live macOS verification of this feature, not anticipated in
the original plan: `write_note.js --folder <name>` searched the whole account
by name and used the **first** match with no ambiguity check, unlike
`ensure_folder.js`. Once Sprint subfolders exist (`ensure_folder.js
--parent-id`), two different projects' Sprint subfolders can legitimately
share a display name ("Sprint 1"), so a name-only `--folder` lookup could
silently file a note under the wrong project's subfolder. This contract
documents the fix: an unambiguous `--folder-id` option, and a refusal instead
of a silent first-match when `--folder <name>` is itself ambiguous.

## New input

- `--folder-id <id>` (alternative to `--folder <name>`, for creation only).
  Creates the note directly in the folder with that id — no name search, so
  it cannot be ambiguous. This is the only safe choice once same-named
  subfolders can exist across different projects.
- `--folder <name>` and `--folder-id <id>` are mutually exclusive; passing
  both fails before any Notes data is written.
- An unresolvable `--folder-id` (no folder with that id) fails the same way
  an unresolvable `--id` (note) already does.

## Changed behavior (no new flag)

- `--folder <name>` now fails when more than one folder in the account has
  that exact name, instead of silently using the first match. The failure
  message names the collision and suggests `--folder-id` (get one from
  `ensure_folder.js`'s JSON result).
- The zero-match and single-match cases are unchanged from the prior
  contract.

## When to use which

- A **project's own folder**, or any folder whose name is unique in the
  account (the common case before this feature): `--folder <name>` is fine,
  and is now also safe by construction (ambiguity refuses rather than
  guesses).
- A **Sprint subfolder**, or any folder created via `ensure_folder.js
  --parent-id`: use `--folder-id`, passing the id `ensure_folder.js` returned
  for that call. Do not rely on the name being unique across projects.

## Failure behavior

Same failure classes as the base contract (missing `--folder`/`--folder-id`,
unresolvable id, missing `--title` when creating), plus: both `--folder` and
`--folder-id` given, an ambiguous `--folder` name match, and an unresolvable
`--folder-id`. Still no delete, move, rename, or bulk-create — this is a
resolution-precision fix, not a new capability class.
