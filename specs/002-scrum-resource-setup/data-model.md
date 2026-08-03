# Data Model: Scrum Resource Setup

## NotesFolderResult

| Field | Type | Rule |
| --- | --- | --- |
| `id` | String | Opaque Notes folder identifier; required after resolution |
| `name` | String | Trimmed, non-empty exact display name |
| `account` | String | Name of the Notes default account |
| `created` | Boolean | `true` only when this invocation performed the creation |

State transition: `absent → created`; `present → reused`. `ambiguous` and
`no-default-account` are terminal failures with no mutation.

## ReminderListResult

| Field | Type | Rule |
| --- | --- | --- |
| `id` | String | `EKCalendar.calendarIdentifier` |
| `name` | String | Trimmed, non-empty exact calendar title |
| `source` | String | Title of the source that owns the calendar |
| `created` | Boolean | `true` only when this invocation saved a new calendar |

State transition: `absent → new reminder calendar → source assigned → committed`;
`present → reused`. `ambiguous` and `no-default-source` fail before construction is
saved.

## ScrumTemplate

| Field | Type | Rule |
| --- | --- | --- |
| filename | String | Stable kebab-case repository filename |
| title | String | First line used as the Apple Notes title |
| classification | Enum | `scrum-defined` or `supplemental` |
| prompts | Text | Placeholders and inspection questions; no product facts |

Each template maps to one note in the `Scrum` folder. Template creation is additive
and occurs one note per invocation. The source files remain the reusable canonical
copy; subsequent edits to a user's note are not overwritten.

## ScrumWorkspace

- Notes folder: `Scrum`
- Reminders list: `Product Backlog`
- Reminders list: `Sprint Backlog`
- Notes: eight `ScrumTemplate` instances

The two list containers can be ensured independently. The Notes folder can be ensured
independently. No workspace-level identifier or deletion lifecycle is introduced.
