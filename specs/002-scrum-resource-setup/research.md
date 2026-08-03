# Research: Scrum Resource Setup

## Decision 1: Create Notes folders through the installed Notes dictionary

**Decision**: Use JXA against `Application("Notes")`, resolve `defaultAccount`,
search that account's `folders` by exact name, and create through the dictionary's
folder element collection.

**Rationale**: Apple documents Script Editor's scripting dictionary as the place to
inspect an app's supported commands, classes, and properties, including a JavaScript
view. The installed Notes dictionary exposes `default account`, account `folders`,
and folder `name`/`id`; this is the public application-specific surface available on
the current Mac.

**Official sources**:

- [View an app's scripting dictionary in Script Editor on Mac](https://support.apple.com/guide/script-editor/scpedt1126/mac)
- Installed `/System/Applications/Notes.app` scripting definition inspected on
  2026-08-03 (`default account`, account folder elements, folder `name` and `id`).

**Alternatives rejected**:

- Direct Notes database access: private, brittle, and contrary to the constitution.
- UI scripting: less specific, accessibility-dependent, and unnecessary because the
  application publishes the needed folder model.
- Searching all accounts: can expose unrelated account structure and makes duplicate
  names ambiguous beyond the requested default destination.

## Decision 2: Create Reminders lists as EventKit reminder calendars

**Decision**: After full Reminders access, search `calendars(for: .reminder)` by
exact title. For an absent list, instantiate `EKCalendar(for: .reminder,
eventStore: store)`, assign the source of `defaultCalendarForNewReminders()`, set the
title, and call `saveCalendar(_:commit:)` with `true`.

**Rationale**: Apple's `EKCalendar` documentation identifies this initializer as the
way to create a calendar for a given entity type. The default-reminders method returns
the user's configured default list, and its source property represents the owning
account. Saving with `commit: true` persists immediately. All EventKit objects remain
attached to the same store, as Apple requires.

**Official sources**:

- [EKCalendar](https://developer.apple.com/documentation/eventkit/ekcalendar)
- [EKEventStore](https://developer.apple.com/documentation/eventkit/ekeventstore)
- [defaultCalendarForNewReminders()](https://developer.apple.com/documentation/eventkit/ekeventstore/defaultcalendarfornewreminders())
- [EKCalendar.source](https://developer.apple.com/documentation/eventkit/ekcalendar/source)
- [saveCalendar(_:commit:)](https://developer.apple.com/documentation/eventkit/ekeventstore/savecalendar(_:commit:))
- [Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)

**Alternatives rejected**:

- Selecting the first writable EventKit source: array order is not a user preference
  and would silently guess an account.
- Creating through AppleScript/JXA: EventKit is the official typed Reminders API and
  is already the repository's accepted backend.
- Private ReminderKit or SQLite: unsupported and prohibited.

## Decision 3: Make both operations idempotent and ambiguity-intolerant

**Decision**: Normalize only leading/trailing whitespace, require a non-empty name,
and use case-sensitive exact-name matching. Zero matches creates one object, one match
returns it, and more than one match fails before mutation.

**Rationale**: Display names are not identifiers. Exact matching avoids surprising
reuse; a duplicate set cannot be resolved safely without an account/source selector
that is outside this feature. A `created` Boolean makes retries observable.

**Alternatives rejected**:

- Case-insensitive or fuzzy matching: could bind to an unintended user container.
- Always create: makes retry after a transport/result failure unsafe.
- Choose first duplicate: violates the no-guessing rule.

## Decision 4: Ground resource topology in the official Scrum Guide

**Decision**: Create list containers for Product Backlog and Sprint Backlog, and
templates for Product Goal, Definition of Done, Sprint Planning, Daily Scrum,
Sprint Review, Sprint Retrospective, impediments, and decision rights. The last two
are labeled supplemental practices rather than mandatory Scrum artifacts.

**Rationale**: The official 2020 Scrum Guide defines Product Backlog/Product Goal,
Sprint Backlog/Sprint Goal, and Increment/Definition of Done as the artifact and
commitment pairs. It defines the events as opportunities to inspect and adapt and
allows teams to choose structures and techniques. The supplemental templates improve
transparency without claiming Scrum mandates a particular form.

**Official source**:

- [The 2020 Scrum Guide](https://scrumguides.org/scrum-guide.html)

**Alternatives rejected**:

- Creating a separate list for every event: events are not backlogs and this would
  confuse containers with Scrum artifacts.
- Pre-filling goals, work, owners, or dates: those are product decisions unavailable
  from the request and must not be invented.

## Decision 5: Keep one external mutation per command

**Decision**: Container ensure commands create at most one object. Each template note
is created through its own existing write command during live setup.

**Rationale**: The mutation boundary remains reviewable, errors identify one target,
and retries cannot duplicate an entire workspace. It also keeps the Apple data-access
skills separate from Scrum content selection.

**Alternatives rejected**:

- A bulk `setup-scrum` native command: combines data access and Scrum judgment and can
  leave a partially written workspace with an unclear retry boundary.
