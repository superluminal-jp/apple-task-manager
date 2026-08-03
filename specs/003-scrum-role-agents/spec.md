# Feature Specification: Scrum Role Perspective Agents

**Feature Branch**: `codex/scrum-role-agents`

**Created**: 2026-08-04

**Status**: Complete

**Input**: User description: "スクラムマスターとして必要なスキルをskill/subagent化。use speckit."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect Product Value Independently (Priority: P1)

As the person making a product decision alone, I want an isolated Product Owner
perspective to challenge value, outcomes, evidence, and Product Backlog ordering
without seeing the implementation-side brief, so that apparent agreement does not
replace an independent product inspection.

**Why this priority**: Product value and ordering determine what is worth building;
without an independent challenge, the system can optimize delivery of the wrong work.

**Independent Test**: Give the Product Owner perspective only a Product Goal,
outcome evidence, stakeholder needs, and candidate backlog items. Verify that it
returns an ordered recommendation, unresolved evidence gaps, and explicit trade-offs
without assigning work, estimating implementation effort, or claiming human
accountability.

**Acceptance Scenarios**:

1. **Given** competing backlog candidates and outcome evidence, **When** the Product
   Owner perspective is invoked in its own context, **Then** it recommends an order
   grounded in value and evidence and names what could change that order.
2. **Given** missing user evidence, **When** the perspective is invoked, **Then** it
   identifies the missing evidence instead of inventing demand or declaring certainty.

---

### User Story 2 - Inspect Delivery Feasibility Independently (Priority: P1)

As the person doing the development work alone, I want an isolated Developers
perspective to challenge feasibility, quality, capacity, and the plan for a Done
Increment without seeing the product-side recommendation, so that product pressure
does not silently override technical reality.

**Why this priority**: A product recommendation is not a feasible Sprint forecast;
quality and capacity require an independent inspection before commitment.

**Independent Test**: Give the Developers perspective only a candidate Sprint Goal,
candidate items, Definition of Done, capacity evidence, and technical constraints.
Verify that it returns a feasible forecast and risks without reordering the Product
Backlog, inventing product value, accepting assigned work, or claiming human
accountability.

**Acceptance Scenarios**:

1. **Given** more candidate work than the available evidence supports, **When** the
   Developers perspective is invoked in its own context, **Then** it reduces or
   reshapes the forecast and explains the quality or capacity constraint.
2. **Given** an item that cannot satisfy the Definition of Done, **When** the
   perspective is invoked, **Then** it exposes the gap and does not normalize a
   weaker meaning of Done.

---

### User Story 3 - Facilitate Tension Without False Accountability (Priority: P2)

As a solo operator using the vendored Scrum Master guidance, I want a clear project
entry point for running both perspectives in separate contexts and inspecting their
disagreement, so that I can make the final decision while preserving transparency,
inspection, and adaptation.

**Why this priority**: Separate opinions create value only when their tension is made
visible and returned to the human decision-maker; agents cannot assume Scrum
accountabilities.

**Independent Test**: Follow the documented workflow with conflicting Product Owner
and Developers outputs. Verify that the workflow keeps both outputs separate,
identifies the decision and evidence gap, invokes the existing Scrum Master skill for
facilitation, and leaves the final decision with the human.

**Acceptance Scenarios**:

1. **Given** conflicting ordering and feasibility recommendations, **When** the
   operator follows the project workflow, **Then** the conflict is presented as an
   inspectable decision rather than merged into an artificial consensus.
2. **Given** either perspective claims authority to decide for the user, **When** the
   workflow is reviewed, **Then** that claim is rejected and the human decision owner
   remains explicit.

### Edge Cases

- A perspective receives both the product-side and delivery-side private brief; it
  must flag the contaminated context rather than present the result as independent.
- One perspective lacks its minimum evidence; it must return an evidence request and
  bounded provisional view instead of fabricating facts.
- The two perspectives agree; the workflow must still expose their distinct evidence
  and reasoning rather than treating agreement as proof.
- A request tries to use the agents as actual Product Owner, Developers, or Scrum
  Master accountabilities; the response must state that agents provide perspectives
  only and that a human remains accountable.
- A perspective is asked to read or mutate Apple Notes or Reminders directly; it must
  route data access through the existing operators and must not expose raw account data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST provide an independently invokable Product Owner
  perspective with an explicit input contract, decision boundary, and output contract.
- **FR-002**: The repository MUST provide an independently invokable Developers
  perspective with an explicit input contract, decision boundary, and output contract.
- **FR-003**: The two perspectives MUST receive intentionally asymmetric briefs and
  MUST identify when the caller contaminates independence by providing the other
  perspective's private recommendation.
- **FR-004**: The Product Owner perspective MUST focus on value, outcomes, user and
  stakeholder evidence, Product Goal, and Product Backlog ordering; it MUST NOT assign
  work, own the Sprint Backlog, or make technical implementation decisions.
- **FR-005**: The Developers perspective MUST focus on feasibility, quality,
  Definition of Done, capacity evidence, technical constraints, and a Sprint forecast;
  it MUST NOT order the Product Backlog or invent product value.
- **FR-006**: Both perspectives MUST distinguish facts, inferences, assumptions, and
  recommendations; they MUST NOT invent user data, product evidence, capacity, dates,
  counts, or metrics.
- **FR-007**: Both perspectives MUST state that they provide advisory perspectives and
  do not hold Scrum accountabilities or make the final human decision.
- **FR-008**: Project guidance MUST define a repeatable sequence that gathers facts via
  existing Apple data operators, launches the two perspectives in separate contexts,
  compares their outputs, invokes the existing `scrum-master` skill to facilitate the
  tension, and returns the decision to the human.
- **FR-009**: The vendored `.claude/skills/scrum-master/` snapshot MUST remain
  unchanged; project-specific routing MUST be documented outside that directory.
- **FR-010**: Agent definitions and their routing contract MUST be covered by
  deterministic, platform-independent tests that fail when frontmatter, asymmetry,
  accountability boundaries, or the documented entry point regress.
- **FR-011**: The implementation MUST introduce no external package, cross-repository
  synchronization, destructive Apple-data operation, or direct Apple-data access from
  the new judgment agents.

### Key Entities

- **Perspective Brief**: The minimum facts supplied to one isolated perspective,
  including a perspective-specific evidence set and excluding the other perspective's
  private recommendation.
- **Perspective Report**: A structured advisory output that separates facts,
  inferences, assumptions, recommendation, risks, and evidence requests.
- **Decision Tension**: A visible disagreement or evidence gap between the two reports
  that the Scrum Master guidance facilitates without resolving on the user's behalf.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All automated contract checks pass for both perspective definitions and
  the project routing guidance on any platform with the repository's standard tools.
- **SC-002**: In at least three forward-test scenarios (value conflict, capacity or
  quality conflict, and missing evidence), each perspective stays within its decision
  boundary and produces no invented fact.
- **SC-003**: A caller can identify the required brief, expected report, and human
  decision owner for either perspective in under two minutes from project guidance.
- **SC-004**: A forward test with conflicting recommendations preserves at least one
  explicit tension or evidence gap instead of collapsing the outputs into unexplained
  consensus.
- **SC-005**: The implementation changes zero files in the vendored `scrum-master`
  snapshot and adds zero external dependencies or Apple-record mutations.

## Assumptions

- The existing vendored `scrum-master` skill remains the normative Scrum facilitation
  and coaching capability; this feature adds project-scoped perspective agents, not
  replacement role skills.
- The existing `apple-reminders-operator` and `apple-notes-operator` remain the only
  agents that access Apple application data.
- The primary agent or human caller is responsible for launching the Product Owner and
  Developers perspectives in separate contexts and withholding the other report until
  both have completed.
- Initial delivery targets repository-scoped Claude subagent definitions; Codex
  multi-agent execution is used only to forward-test the transferable prompts.
- External user feedback cannot be synthesized by an agent and remains a human
  activity outside this feature.
