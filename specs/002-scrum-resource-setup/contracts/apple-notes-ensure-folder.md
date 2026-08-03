# Contract: Apple Notes `ensure_folder.js`

## Invocation

```bash
osascript -l JavaScript "$S/ensure_folder.js" --name "Scrum"
```

## Input

- `--name <text>` is required.
- Leading and trailing whitespace is removed.
- An empty result fails before Notes data is read or written.
- Unknown flags and positional arguments fail.

## Resolution

1. Resolve the Notes default account.
2. Compare direct child folder names using exact, case-sensitive equality.
3. Zero matches: create one folder in that account.
4. One match: return it without a mutation.
5. More than one match: fail without a mutation.

## Success output

```json
{"account":"…","created":true,"id":"…","name":"Scrum"}
```

One JSON object is written to stdout. `created` is `false` for reuse.

## Failure behavior

Errors are written to stderr and exit non-zero. Failures include invalid input,
missing default account, duplicate exact-name folders, Automation denial, application
errors, and inability to obtain required result metadata. There is no delete, move,
rename, nested-folder, account-selection, or bulk-create operation.
