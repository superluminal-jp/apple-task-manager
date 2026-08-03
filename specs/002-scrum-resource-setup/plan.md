# Implementation Plan: Scrum Resource Setup

**Branch**: `codex/fix-apple-notes-result` | **Date**: 2026-08-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-scrum-resource-setup/spec.md`

## Summary

Add idempotent, single-container commands to the existing Apple Notes JXA skill
and EventKit-backed Reminders CLI, then use those commands plus versioned text
templates to prepare a Scrum workspace. Notes creates a folder only in the
dictionary-published default account. Reminders creates an `EKCalendar` for the
reminder entity type, attaches the source of the configured default reminder
calendar, and saves it immediately. Exact duplicate names fail rather than being
guessed. All behavior is driven by deterministic red tests before implementation
and followed by minimal live macOS checks.

## Technical Context

**Language/Version**: JavaScript for Automation supplied by macOS; Swift supported by the installed Xcode Command Line Tools; POSIX shell tests

**Primary Dependencies**: Notes Apple Events scripting dictionary, Foundation, EventKit; no third-party dependencies

**Storage**: User-owned Apple Notes and Reminders stores plus version-controlled plaintext templates

**Testing**: `tests/run-apple-operators.sh` deterministic contract checks; Swift compilation; minimal live `osascript` and EventKit operations on macOS

**Target Platform**: macOS 14 or later for full Reminders access, with compatibility fallback already present for earlier supported macOS

**Project Type**: Project-scoped automation skills and a native command-line helper

**Performance Goals**: One app mutation at most per invocation; exact-name lookup completes over the app's container collection

**Constraints**: No deletion, no whole-note replacement, no private frameworks or direct databases, no invented Scrum/product facts, no unrelated user-data output

**Scale/Scope**: Two new ensure commands, eight templates, one Notes folder, and two Reminders lists

## Constitution Check

*GATE: Passed before research; re-checked after design.*

- **Preserve User Records — PASS**: Additive folder/list/note creation only. Existing
  exact matches are reused. Ambiguity and missing identifiers fail before writes.
  No delete API or whole-body replacement is added.
- **Public, Platform-Native Interfaces — PASS**: Notes uses its installed scripting
  dictionary through JXA. Reminders uses EventKit `EKCalendar` and `EKEventStore`.
- **Test First — PASS**: Tasks require focused contract tests to fail before source
  changes, followed by compilation, the full deterministic suite, and live checks.
- **Separate Data Access from Judgment — PASS**: Operators return container facts.
  Versioned templates contain prompts only; no operator makes Scrum judgments.
- **Self-Contained — PASS**: Commands, tests, templates, specifications, and docs
  remain in this repository with Apple-supplied dependencies only.

Post-design re-check: **PASS**. The contracts retain one mutation per invocation,
explicit ambiguity errors, and no destructive operation. No ADR is required because
the implementation extends the already accepted per-app native architecture without
a new one-way-door decision.

## Project Structure

### Documentation (this feature)

```text
specs/002-scrum-resource-setup/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── apple-notes-ensure-folder.md
│   └── apple-reminders-ensure-list.md
└── tasks.md
```

### Source Code (repository root)

```text
.claude/skills/apple-notes/
├── SKILL.md
└── scripts/ensure_folder.js

.claude/skills/apple-reminders/
├── SKILL.md
└── scripts/main.swift

scrum/templates/
├── product-goal.txt
├── definition-of-done.txt
├── sprint-planning.txt
├── daily-scrum.txt
├── sprint-review.txt
├── sprint-retrospective.txt
├── impediment-log.txt
└── decision-rights.txt

tests/run-apple-operators.sh
README.md
```

**Structure Decision**: Extend the existing project-scoped skills in place. Keep
Scrum prompts in a neutral repository directory because the vendored `scrum-master`
snapshot is immutable and Apple data-access skills must not own Scrum judgment.

## Complexity Tracking

No constitution violations require justification.
