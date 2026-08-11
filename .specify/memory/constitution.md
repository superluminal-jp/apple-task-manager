<!--
Sync Impact Report
- Version change: 1.0.0 -> 2.0.0
- Modified principles:
  - I. Preserve User Records — relaxed from an unconditional prohibition on
    deleting or whole-body-replacing Apple Notes to a conditional permission
    gated by optimistic concurrency (SHA-256 hash match) and mandatory
    user approval per call. The Reminders prohibition (no delete) and the
    "no silent replacement record" rule are unchanged. This is a backward
    incompatible redefinition of a MUST NOT statement, hence MAJOR.
- Added sections: none
- Removed sections: none
- Clarified: Platform and Safety Constraints gained one bullet making explicit
  that a `--plaintext` capture MUST NOT be written back as a complete body,
  since that capture is lossy — directly relevant now that a complete-body
  replace operation exists.
- Templates reviewed:
  - ✅ .specify/templates/plan-template.md
  - ✅ .specify/templates/spec-template.md
  - ✅ .specify/templates/tasks-template.md
- Runtime guidance reviewed:
  - ✅ README.md
  - ✅ CLAUDE.md (to be updated in the same implementation change per its own
    live-documentation rule, tracked by specs/005-notes-conditional-overwrite)
- Related decision record: docs/adr/0007-conditional-overwrite-delete-for-notes.md
- Follow-up TODOs: none
-->
# Apple Task Manager Constitution

## Core Principles

### I. Preserve User Records
Automation MUST NOT delete Apple Reminders, and MUST NOT silently create a
replacement record when an identifier cannot be resolved. Writes MUST be
limited to the object and operation requested, and destructive cleanup of
Reminders MUST remain a visible human action in the Apple application. This
protects the only durable record of Cycle Time and flow history from an
unreviewable automation mistake.

Apple Notes MAY be deleted, or have their entire body replaced, but only
through an operation that enforces optimistic concurrency: the caller MUST
supply the SHA-256 hash of the note's current plaintext body, captured
immediately before the call, and the operation MUST refuse to write — making
no change at all — when that hash does not match the note's actual current
body at write time. The caller MUST present the replacement content or
deletion target to the user and obtain explicit approval before each such
call; this is an operational safeguard, not one tooling can enforce, since no
hook can inspect what an Apple Event actually sends.

This conditional capability exists because
[ADR 0007](../../docs/adr/0007-conditional-overwrite-delete-for-notes.md)
determined that in-place correction of a note's free-form content — including
content the user themselves authored — is worth the residual risk of a
correctly-informed but mistaken destructive call, a risk the hash gate does
not and cannot eliminate. What the hash gate does eliminate is the separate,
structural risk of clobbering a note that changed between when it was read
and when it was written.

### II. Use Public, Platform-Native Interfaces
Reminders access MUST use EventKit and Notes access MUST use the Notes Apple
Events dictionary through macOS-provided tooling. Private frameworks,
undocumented URL schemes, direct database access, third-party automation CLIs,
and package dependencies MUST NOT be introduced to bypass a missing capability.
Unsupported properties or platforms MUST be reported honestly instead of being
approximated.

### III. Test First and Report Evidence (NON-NEGOTIABLE)
Every behavior change MUST begin with a deterministic failing test that states
the contract, followed by the smallest implementation that makes it pass. Tests
that can run without macOS MUST remain platform-independent. Native macOS
behavior MUST additionally be validated on macOS when permissions and apps are
available, and reports MUST distinguish static/unit evidence from live-app
evidence. Failing tests MUST never be deleted, disabled, or weakened to obtain a
passing result.

### IV. Separate Data Access from Judgment
Apple application operators MUST return the requested fact or mutation result,
not raw account-wide JSON or HTML. Scrum interpretation and product judgment
MUST remain outside the Apple data-access layer. Identifiers, counts, dates, and
metrics MUST come from the documented tooling output and MUST NOT be invented or
guessed when resolution is ambiguous.

### V. Keep the Repository Self-Contained
The repository MUST contain the skills, scripts, tests, specifications, and
project-specific wiring required for its behavior. The vendored `scrum-master`
snapshot MUST NOT be edited locally; project-specific rules belong in
`CLAUDE.md`. Public behavior, usage, or constraints changed by an implementation
MUST be documented in the same change. New dependencies or cross-repository
synchronization mechanisms require an explicit architectural decision.

## Platform and Safety Constraints

- Native Apple integration targets macOS only.
- Notes Automation and Reminders privacy grants are separate prerequisites and
  MUST produce actionable, category-specific failure messages.
- Notes bodies are HTML. Plain text MUST be escaped before writing, and lossy
  plaintext views MUST NOT be written back as complete bodies — this applies
  to any complete-body write, including the hash-gated overwrite permitted by
  Principle I: a `--plaintext` capture of a note MUST NOT be fed back
  unmodified as its new body, since that capture cannot represent rich
  formatting, images, or structure the original body may have held.
- Reminders identifiers and Notes identifiers are opaque. Failed or ambiguous
  resolution MUST stop the operation without creating another record.
- Logs, tests, and reports MUST avoid exposing unrelated note bodies, reminder
  bodies, credentials, tokens, or other private account content.

## Development Workflow

1. Define measurable behavior in a feature specification before changing public
   behavior.
2. Record technical choices and constraints in the implementation plan; propose
   an ADR for hard-to-reverse architectural decisions.
3. Generate dependency-ordered tasks with an explicit red-green-refactor
   sequence.
4. Run the focused failing test before implementation and preserve its failure
   output as evidence of the red phase.
5. Implement only the scoped behavior, then run focused and full regression
   suites.
6. When native behavior changes, run a minimal live-app scenario against a
   uniquely identified test record and report any retained test artifact.
7. Keep repository and user-data changes separate in the completion report.

## Governance

This constitution is the highest project-local development authority. Specs,
plans, tasks, implementation, and reviews MUST demonstrate compliance with every
MUST statement. An amendment requires an explicit rationale, impact review of
dependent templates and runtime guidance, and semantic versioning: MAJOR for a
removed or incompatible principle, MINOR for a new or materially expanded
principle, and PATCH for non-semantic clarification. Compliance MUST be checked
before implementation and again before completion.

**Version**: 2.0.0 | **Ratified**: 2026-08-03 | **Last Amended**: 2026-08-11
