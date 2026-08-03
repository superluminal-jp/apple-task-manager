# Contract: Perspective Orchestration

## Sequence

1. Explicitly load the existing `scrum-master` skill for Scrum facilitation.
2. Obtain only necessary facts through `apple-reminders-operator` and
   `apple-notes-operator`; retain no raw account-wide data in the main context.
3. Construct the two asymmetric briefs without either perspective's recommendation.
4. Launch `product-owner-perspective` and `developers-perspective` in separate fresh
   contexts. Do not reveal one output to the other before both finish.
5. Compare the completed reports under the Scrum Master guidance. Preserve agreement,
   disagreement, assumptions, and evidence gaps as separate fields.
6. Present the decision tension, recommendation, next inspection, and risks to the
   human. The human accepts or rejects the decision.

## Invariants

- No agent is described as holding a Scrum accountability.
- Independent reports are not merged into consensus before comparison.
- External user feedback is not simulated or replaced with agent opinion.
- Direct Apple-data access remains delegated to the existing operators.
- The vendored `.claude/skills/scrum-master/` snapshot is not edited.
