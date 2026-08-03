# Data Model: Reliable Apple Notes Results

## Note Result

Represents one note returned after creation, append, or identifier lookup.

| Field | Required | Rule |
| --- | --- | --- |
| `id` | Yes | Opaque stable handle returned by Notes.app |
| `name` | Yes | Displayed note title |
| `folder` | Yes | Displayed name of the folder that contains this note |
| `creationDate` | Yes | ISO-8601 timestamp |
| `modificationDate` | Yes | ISO-8601 timestamp |
| `body` | On request | HTML body; never emitted by default |
| `plaintext` | On request | Lossy reading view derived from HTML; never written back |

## Folder Membership

Relates one note identifier to the folder whose note identifier collection contains
it.

- Matching key: exact opaque note identifier.
- Displayed folder names are not unique and are not matching keys.
- A valid note must resolve to one folder for the result contract.
- No unrelated note title or body is required for membership resolution.

## State Transitions

```text
create request -> note created -> result described
append request -> identifier resolved -> body appended -> result described
read request   -> identifier resolved -> result described
invalid id     -> resolution failure -> no mutation
```
