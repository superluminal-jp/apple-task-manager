# Quickstart: Validate Scrum Role Perspective Agents

## Prerequisites

- Run from the repository root.
- No Apple application, permission, network access, or external package is required for
  static validation.

## 1. Run the focused contract suite

```sh
bash tests/run-scrum-role-agents.sh
```

Expected: all agent-definition and routing tests pass.

## 2. Verify the vendored skill is untouched

```sh
git diff --exit-code main -- .claude/skills/scrum-master
```

Expected: no diff.

## 3. Forward-test the Product Owner perspective

Launch the agent in a fresh context with a Product Goal, two competing candidate
outcomes, and incomplete user evidence. Do not include a Developers report.

Expected: ordered recommendation, explicit evidence gap, and no work assignment or
claim of accountability.

## 4. Forward-test the Developers perspective

Launch the agent in a different fresh context with a candidate Sprint Goal, more work
than capacity supports, a strict Definition of Done, and one quality risk. Do not
include a Product Owner report.

Expected: reduced or reshaped forecast, explicit quality constraint, and no Product
Backlog ordering or invented value.

## 5. Inspect a conflict

Give both completed reports to the main Scrum Master-guided workflow only after both
agents finish.

Expected: the conflict and evidence gap remain visible, the next inspection is named,
and the human remains the decision owner.

## 6. Run regressions

```sh
bash tests/run-scrum-block.sh
bash tests/run-flow-metrics.sh
bash tests/run-apple-operators.sh
```

Expected: all existing deterministic suites pass. No native Apple data is accessed or
mutated by this feature.
