# Apple Notes CLI Contract

## Create

```text
write_note.js --folder <folder> --title <title> (--text <text> | --text-stdin | --html <html>)
```

- Success: exit 0 and emit one Note Result JSON object.
- Failure before creation: non-zero exit and an actionable message on stderr.
- The first line remains the displayed title.

## Append

```text
write_note.js --id <note-id> (--append <text> | --append-stdin | --append-html <html>)
```

- Success: append exactly once, exit 0, and emit the updated Note Result JSON object.
- Unknown ID: non-zero exit; do not create or modify a note.

## Read by Identifier

```text
list_notes.js --id <note-id> [--with-body | --plaintext | --field <field>]
```

- Success: exit 0 and emit only the identified Note Result.
- Bodies remain omitted unless requested.
- Unknown ID: non-zero exit and no mutation.

## Stable Result Fields

```json
{
  "id": "<opaque-note-id>",
  "name": "<display-title>",
  "folder": "<actual-containing-folder-name>",
  "creationDate": "<ISO-8601>",
  "modificationDate": "<ISO-8601>"
}
```
