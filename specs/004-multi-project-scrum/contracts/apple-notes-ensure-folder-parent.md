# Contract: `ensure_folder.js` — parent-scoped extension

This is a delta on top of the existing contract at
[`specs/002-scrum-resource-setup/contracts/apple-notes-ensure-folder.md`](../../002-scrum-resource-setup/contracts/apple-notes-ensure-folder.md),
which stays accurate for the no-parent case and is not repeated here.

## New input

- `--parent-id <id>` (optional). When given together with `--name`, matching and
  creation are scoped to direct children of the folder with that `id`, not the
  Notes default account.
- `--parent-id` and the existing `--name` may be combined; `--name` alone keeps
  today's account-root behavior unchanged.
- An unresolvable `--parent-id` (no folder with that id) fails before Notes data
  is written, the same way an invalid account state fails today.

## Resolution (parent-scoped case only)

1. Resolve the folder identified by `--parent-id`.
2. Compare that folder's direct child folder names to `--name` using exact,
   case-sensitive equality — a folder of the same name anywhere else in the
   account (a different project, or the account root) does not match.
3. Zero matches: create one folder as a child of the parent folder.
4. One match: return it without a mutation.
5. More than one match: fail without a mutation.

## Success output

```json
{"account":"…","created":true,"id":"…","name":"Sprint 7","parent":"…"}
```

`parent` is the resolved parent folder's `id`, present only in the parent-scoped
case; the no-parent case's output shape is unchanged from the base contract.

## Failure behavior

Same failure classes as the base contract (invalid input, ambiguous exact-name
match, Automation denial, application errors), plus: an unresolvable
`--parent-id`. Still no delete, move, rename, account-selection, or bulk-create
operation — this extension adds one new scope to the existing match/create logic,
not a new capability class.
