# Data Model: Scrum Role Perspective Agents

## Perspective Brief

An immutable, caller-provided input to exactly one isolated perspective.

### Common fields

- **decision**: The decision or forecast being inspected.
- **time horizon**: The Sprint or product horizon relevant to the decision.
- **facts**: Observed evidence with sources or an explicit statement that evidence is missing.
- **constraints**: Known limits that may affect the recommendation.
- **unknowns**: Information the caller knows is unavailable.

### Product Owner-only fields

- Product Goal
- user and stakeholder needs
- outcome or usage evidence
- candidate Product Backlog items and their expected outcomes

### Developers-only fields

- candidate Sprint Goal
- candidate Product Backlog items offered for discussion
- Definition of Done
- capacity and recent delivery evidence
- technical, operational, dependency, and quality constraints

### Validation rules

- Do not include the other perspective's completed or provisional report.
- Label estimates, beliefs, and assumptions as non-facts.
- Do not include unrelated Apple account content or raw data dumps.
- If the brief is insufficient, the perspective returns an evidence request and a
  bounded provisional view instead of inventing data.

## Perspective Report

An advisory result returned by one perspective.

### Fields

- **conclusion**: The recommended order or feasible forecast.
- **observed facts**: Evidence copied or derived without invention.
- **inferences and assumptions**: Reasoning explicitly separated from facts.
- **trade-offs and risks**: What the recommendation gains, loses, or could break.
- **evidence requests**: Missing information that could change the recommendation.
- **boundary statement**: What this perspective did not decide and which human retains the decision.

### Validation rules

- Product Owner reports may order Product Backlog candidates but may not assign work,
  own Sprint Backlog decisions, or dictate implementation.
- Developers reports may forecast work and expose quality or feasibility constraints
  but may not order the Product Backlog or invent product value.
- Every report states that it is advisory and holds no Scrum accountability.

## Decision Tension

A comparison record created after both reports complete.

### Fields

- **agreement**: Claims supported independently by both evidence sets.
- **disagreement**: Conflicting recommendations or assumptions.
- **evidence gap**: Missing observation needed to choose responsibly.
- **decision owner**: The human who accepts the outcome.
- **next inspection**: The next evidence-gathering action and review point.

### State transitions

```text
separate briefs -> separate reports -> visible tension -> human decision
  -> small action/experiment -> next inspection
```

Reports never merge before both complete. Agreement does not remove the requirement to
show each evidence path.
