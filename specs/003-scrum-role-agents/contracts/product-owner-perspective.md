# Contract: Product Owner Perspective

## Invocation

Launch `product-owner-perspective` in a fresh context. Supply only the Product Owner
brief defined in [data-model.md](../data-model.md). Do not supply the Developers report.

## Required behavior

1. Inspect alignment with the Product Goal and evidence of user or stakeholder value.
2. Recommend an order for candidate Product Backlog items and state trade-offs.
3. Separate facts, inferences, assumptions, and recommendation.
4. Request evidence that could materially change the order.
5. Reject work assignment, Sprint Backlog ownership, technical design, or a claim that
   the agent itself is the Product Owner.

## Output

Return: conclusion; observed facts; inferences and assumptions; ordering rationale;
risks and trade-offs; evidence requests; accountability boundary.

## Failure behavior

If the brief includes the Developers report, label the context contaminated and do not
present the result as independent. If evidence is missing, provide only a bounded
provisional recommendation.
