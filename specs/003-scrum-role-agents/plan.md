# Implementation Plan: Scrum Role Perspective Agents

**Branch**: `codex/scrum-role-agents` | **Date**: 2026-08-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-scrum-role-agents/spec.md`

## Summary

Add two project-scoped, independently invokable advisory agents: one inspects
product value and Product Backlog ordering, while the other inspects delivery
feasibility, quality, capacity, and Sprint forecasting. Keep the vendored
`scrum-master` skill unchanged and document a project workflow that collects facts,
runs the perspectives in separate contexts with asymmetric briefs, and uses the
existing Scrum Master guidance to facilitate visible tension for a human decision.

## Technical Context

**Language/Version**: Markdown agent definitions; Python 3 standard library for contract tests; POSIX-compatible Bash test runner

**Primary Dependencies**: Existing Claude project agent format and vendored `scrum-master` skill; no new packages

**Storage**: Repository Markdown files only; no Apple Notes or Reminders writes

**Testing**: Python `unittest`, shell runner, and independent multi-agent forward tests

**Target Platform**: Static contract tests on any standard development platform; agent use in project-scoped Claude environments

**Project Type**: Repository-scoped agent and workflow configuration

**Performance Goals**: Required brief, report contract, and decision owner discoverable in under two minutes

**Constraints**: Preserve asymmetric contexts; do not edit the vendored Scrum Master snapshot; no external dependencies; no direct Apple-data access; no claimed Scrum accountability

**Scale/Scope**: Two perspective definitions, one project routing workflow, one focused contract suite, and synchronized user documentation

## Constitution Check

*GATE: Passed before Phase 0 and re-checked after Phase 1.*

- **I. Preserve User Records — PASS**: New agents have no Apple mutation tooling and the feature performs no live data writes.
- **II. Use Public, Platform-Native Interfaces — PASS**: No Apple interface is added or changed.
- **III. Test First and Report Evidence — PASS**: Contract tests are written and run red before agent definitions or routing guidance are added; focused and full suites run after implementation.
- **IV. Separate Data Access from Judgment — PASS**: Existing Apple operators remain the only data-access agents; the new agents receive selected facts and perform judgment only.
- **V. Keep the Repository Self-Contained — PASS**: All definitions, tests, specs, and guidance live in this repository; the vendored `scrum-master` directory remains untouched.

Post-design re-check: the contracts explicitly prohibit direct Apple-data access and
false accountability, and require separate contexts. No gate violation remains.

## Project Structure

### Documentation (this feature)

```text
specs/003-scrum-role-agents/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── developers-perspective.md
│   ├── orchestration.md
│   └── product-owner-perspective.md
└── tasks.md
```

### Source Code (repository root)

```text
.claude/
├── agents/
│   ├── developers-perspective.md
│   └── product-owner-perspective.md
└── skills/
    └── scrum-master/                 # unchanged vendored snapshot

CLAUDE.md                             # project routing and orchestration contract
README.md                             # user-facing operating workflow and status

tests/
├── run-scrum-role-agents.sh
└── test_scrum_role_agents.py
```

**Structure Decision**: Follow the repository's existing project-scoped agent
convention under `.claude/agents/`. Keep role judgment in agent definitions, routing
in `CLAUDE.md`, user operation in `README.md`, and deterministic contract checks in
`tests/`. Do not add a new role skill because ADR 0002 selected independent contexts,
and the existing `scrum-master` skill already owns Scrum facilitation guidance.

## Complexity Tracking

No constitution violation requires justification.
