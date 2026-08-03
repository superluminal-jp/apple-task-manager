# Contract: Apple Reminders `ensure-list`

## Invocation

```bash
"$CLI" ensure-list --name "Product Backlog"
```

## Input

- `--name <text>` is required.
- Leading and trailing whitespace is removed.
- An empty result fails before EventKit store access.
- Unknown flags and positional arguments fail under the CLI's existing argument model.

## Resolution

1. Request full Reminders access through the existing store helper.
2. Compare reminder calendar titles using exact, case-sensitive equality.
3. Zero matches: require `defaultCalendarForNewReminders()`, create an
   `EKCalendar` for `.reminder` in the same event store, assign the default calendar's
   source and requested title, then save with `commit: true`.
4. One match: return it without a mutation.
5. More than one match: fail without a mutation.

## Success output

```json
{"created":true,"id":"…","name":"Product Backlog","source":"…"}
```

One JSON object is written to stdout. `created` is `false` for reuse.

## Failure behavior

Errors are written to stderr and exit non-zero. Failures include invalid input,
permission denial, duplicate exact-name lists, missing default reminder list/source,
and EventKit save failure. There is no list removal, rename, source-selection, or
bulk-create command.
