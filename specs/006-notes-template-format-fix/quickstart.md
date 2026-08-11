# Quickstart: Notes formatting validation

## Prerequisites

- Repository root is the current directory.
- `node` and `bash` are available.
- Live checks require macOS, Notes.app, and approved Notes Automation access.

## 1. Deterministic conversion tests

```bash
tests/run-note-body-conversion.sh
tests/run-apple-operators.sh
```

The focused suite must cover every supported block, inline, alignment, list, nesting, escaping, title-dedup, overwrite-name, and pre-write rejection rule. The broader suite checks that existing Notes operations and template references remain compatible.

## 2. Template inventory

```bash
rg --files scrum/templates
rg -n 'scrum/templates/[^ ]+\.txt' README.md .claude specs tests
rg -n '^- |^- \[[ xX]\]' scrum/templates
```

Expected: exactly eight `.md` templates, no stale `.txt` references outside historical research/spec context, and no unsupported Dashed List or Checklist syntax in active templates. Bulleted fields use `* `.

## 3. Supported live probe (macOS)

Create one uniquely named disposable probe note using `--text-stdin`. Include:

```markdown
# matching title
## Heading
### Subheading
Body with **bold**, *italic*, ++underline++, ~~strike~~ and [color/size]{color=#CC0000 size=24}.
{align=center}A centered sentence with enough words to show alignment.
{align=right}A right-aligned sentence.
{align=justify}A sufficiently long justified sentence that wraps across more than one visual line in Notes.
```

Also include a fenced code block, Bulleted List, Numbered List, one item continuation followed by one nested item, and confirm visually that each is distinguishable and editable as the corresponding Notes format. Confirm the title appears once. A continuation after a nested list must be rejected before writing because Notes would otherwise render an empty bullet.

## 4. Unsupported-format atomicity

For each of Block Quote, Highlight, Font family, Dashed List, and Checklist:

1. Use a unique note title that does not already exist.
2. Invoke create with one unsupported construct.
3. Confirm the command reports the exact format name.
4. Confirm no note with that title was created.

For overwrite, record a target note's body hash, invoke each invalid input with that hash, then confirm both body and hash are unchanged. Pure tests and static call-order checks are the mandatory regression evidence; the live check supplements them.

## 5. Report

Report separately:

- deterministic tests and counts;
- static regression suite;
- live supported-format visual result;
- unsupported-format non-mutation result;
- retained probe folder/note names and IDs;
- any account- or OS-specific limitation.

Do not delete probe records unless the user explicitly requests deletion.
