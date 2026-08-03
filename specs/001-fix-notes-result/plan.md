# Implementation Plan: Reliable Apple Notes Results

**Branch**: `codex/fix-apple-notes-result` | **Date**: 2026-08-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-fix-notes-result/spec.md`

## Summary

Keep the existing Apple Notes CLI and JSON shape, but stop reading a note's
unresolvable containing-object property. Creation already knows its destination
folder; identifier-based operations will resolve folder membership by comparing the
target note ID with each folder's note ID collection. Add a deterministic structural
regression test before implementation, then validate create, append, and ID lookup
against Notes.app on macOS.

## Technical Context

**Language/Version**: JavaScript for Automation (JXA) supplied by current macOS

**Primary Dependencies**: macOS `osascript`, Notes.app Apple Events dictionary;
no third-party dependencies

**Storage**: Apple Notes account data managed by Notes.app

**Testing**: Bash deterministic contract suite plus a minimal live Notes.app scenario

**Target Platform**: macOS with Notes Automation permission

**Project Type**: Project-scoped CLI skill scripts

**Performance Goals**: One-note operations finish within the normal Notes Apple
Events interaction time; folder resolution reads IDs only and never note bodies

**Constraints**: Append-only writes; no delete or whole-body replacement; preserve
the existing CLI arguments and JSON fields; do not expose unrelated notes

**Scale/Scope**: Two JXA scripts, one deterministic test suite, and verification
documentation; personal Notes accounts with tens of folders and ordinary note counts

## Constitution Check

*GATE: Passed before research and passed again after design.*

- **Preserve User Records**: PASS. No write semantics change; invalid IDs still fail
  before mutation and no delete/replace path is added.
- **Public, Platform-Native Interfaces**: PASS. The solution stays within the Notes
  Apple Events dictionary and macOS `osascript`.
- **Test First and Report Evidence**: PASS. A deterministic red test precedes the
  code change, followed by full regression and a live macOS check.
- **Separate Data Access from Judgment**: PASS. Identifier resolution returns only
  the requested note; membership matching reads identifiers but emits no unrelated
  data.
- **Self-Contained Repository**: PASS. All code, tests, Spec Kit artifacts, and docs
  remain in this repository with no new dependency.

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-notes-result/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── apple-notes-cli.md
└── tasks.md
```

### Source Code (repository root)

```text
.claude/skills/apple-notes/
├── SKILL.md
└── scripts/
    ├── list_notes.js
    └── write_note.js

tests/
└── run-apple-operators.sh

README.md
```

**Structure Decision**: Modify the existing project-scoped Apple Notes skill in
place. The deterministic contract assertions remain in the repository's existing
Apple operator suite so no new test runner or dependency is introduced.

## Complexity Tracking

No constitution violations or additional complexity exceptions.
