# Research: Scrum Role Perspective Agents

## Decision 1: Use two project-scoped agents, not new role skills

- **Decision**: Add independent Product Owner and Developers perspective definitions
  under `.claude/agents/`; retain the existing `scrum-master` skill as facilitator.
- **Rationale**: ADR 0002 identifies context separation—not prompt naming—as the
  mechanism that prevents false agreement. New role skills would load in the same
  conversation and create ambiguous routing while duplicating Scrum guidance.
- **Alternatives considered**: Product Owner and Developers skills (rejected: shared
  context and routing ambiguity); role modes inside `scrum-master` (rejected: weakest
  separation); no separation (rejected: leaves the documented false-consensus risk).

## Decision 2: Make the briefs intentionally asymmetric

- **Decision**: The Product Owner brief contains Product Goal, user/stakeholder
  evidence, outcome evidence, constraints, and candidate items. The Developers brief
  contains a candidate Sprint Goal, candidate items, Definition of Done, capacity
  evidence, technical constraints, dependencies, and quality signals. Neither brief
  contains the other perspective's private report.
- **Rationale**: Independent evidence and decision boundaries create useful tension.
  Giving both agents the full conversation or the other recommendation leaks the
  answer and recreates false consensus.
- **Alternatives considered**: Identical full-context briefs (rejected: contaminates
  independence); hidden arbitrary facts (rejected: creates manufactured disagreement
  rather than legitimate decision tension).

## Decision 3: Keep agents read-only and outside Apple data access

- **Decision**: Allow only repository reading and searching. Supply selected facts in
  the prompt or referenced project artifact; use existing Apple operators to obtain
  Notes and Reminders data.
- **Rationale**: The constitution requires separation of data access from judgment and
  protection of unrelated account content. Role perspectives do not need direct data
  mutation or shell execution.
- **Alternatives considered**: Preload Apple skills or allow shell access (rejected:
  expands capability and privacy scope without supporting the role decision).

## Decision 4: Validate structure statically and behavior by forward test

- **Decision**: Add deterministic standard-library tests for frontmatter, tools,
  required contracts, asymmetry, accountability boundaries, routing, and the unchanged
  vendored skill. Then run at least three fresh-context scenarios using the prompts as
  actual agents would receive them.
- **Rationale**: Static tests catch configuration drift; behavioral tests reveal whether
  the instructions generalize without leaking expected answers.
- **Alternatives considered**: Static tests only (rejected: cannot validate judgment
  boundaries); model tests only (rejected: non-deterministic and weak at detecting
  missing configuration fields).
