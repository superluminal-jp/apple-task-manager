#!/usr/bin/env python3
"""Read and write the machine-readable block inside a reminder's `body`.

Apple's public automation surfaces (AppleScript and EventKit alike) expose no
tag, no subtask, and no start-date field a human can set: `startDateComponents`
exists in EventKit but Reminders.app ignores it, and the AppleScript dictionary
has no equivalent at all. So the one field that is both free-form and editable
from every Apple client -- `body` -- carries the Scrum metadata, in a fenced
block:

    --- scrum ---
    sprint: 7
    size: M
    started: 2026-08-01
    note: x-coredata://ABC-123/ICNote/p42
    ---

Prose above and below the block is preserved untouched, because a human editing
the reminder in Reminders.app will put it there.

This module exists so the parsing lives in Python rather than in Swift: it is
unit-testable on any platform, while `remind-cli` beside it needs macOS and an
EventKit grant. The division is deliberate -- EventKit fetches and writes,
Python decides. It also means the parsing layer survived the backend moving
from AppleScript to EventKit without a single change: it reads the JSON
contract, not the framework.

Usage (stdin/stdout throughout, so it composes with the EventKit layer):

    remind-cli list "Sprint Backlog" | python3 scrum_block.py csv > tickets.csv
    remind-cli list "Sprint Backlog" --open-only | python3 scrum_block.py unstarted
    remind-cli get "<id>" | python3 -c 'import json,sys; print(json.load(sys.stdin)["body"] or "")' \\
      | python3 scrum_block.py set --started today

`csv` emits exactly the three columns `flow_metrics.py` reads, so the
scrum-master skill's flow metrics run over real Reminders data unmodified.
"""
import argparse
import csv
import json
import re
import sys
from datetime import date, datetime

# Every key the block may carry, in the order they are written back. A fixed
# order keeps a body byte-identical when nothing changed, so a no-op update
# does not show up as a modification in the user's sync history.
KEYS = ("sprint", "size", "started", "note")

# Keys whose value must be an ISO 8601 date. A malformed one is dropped rather
# than written through: `started` feeds Cycle Time, and a bad value there would
# corrupt a metric silently.
DATE_KEYS = ("started",)

OPEN_FENCE = "--- scrum ---"
CLOSE_FENCE = "---"

# The note-side counterpart of the `note:` key above. A note's body is HTML and
# is edited by hand, so a fenced block there would not survive; a single inline
# marker does. Both directions carry an identifier the app itself publishes,
# which is the most stable thing available -- see the skill's SKILL.md on why
# neither the GUI's linked-item UI nor the undocumented URL schemes are used.
# The marker is format-agnostic on purpose: it held AppleScript ids before the
# Reminders backend moved to EventKit, and holds externalIds now.
REMINDER_MARKER = re.compile(r"\[\[reminder:([^\]]+)\]\]")


# --- The block ---------------------------------------------------------------


def parse_block(body):
    """Extract the scrum block from `body`.

    Returns `(fields, problems)`. Never raises: a body a human broke by editing
    it in Reminders.app must degrade into a reported problem, not a crash that
    takes the whole sprint's data with it.
    """
    fields = {}
    problems = []
    if not body:
        return fields, problems

    lines = body.splitlines()
    try:
        start = next(i for i, line in enumerate(lines) if line.strip() == OPEN_FENCE)
    except StopIteration:
        return fields, problems

    end = None
    for i in range(start + 1, len(lines)):
        if lines[i].strip() == CLOSE_FENCE:
            end = i
            break
    if end is None:
        problems.append(f"unterminated scrum block: no closing {CLOSE_FENCE!r}")
        return fields, problems

    for line in lines[start + 1 : end]:
        if not line.strip():
            continue
        if ":" not in line:
            problems.append(f"unparsable line in scrum block: {line.strip()!r}")
            continue
        key, _, value = line.partition(":")
        key, value = key.strip(), value.strip()
        if key not in KEYS:
            problems.append(f"unknown key in scrum block: {key!r}")
            continue
        if key in DATE_KEYS and not _is_iso_date(value):
            problems.append(f"{key!r} is not an ISO 8601 date: {value!r}")
            continue
        fields[key] = value

    return fields, problems


def render_block(body, fields):
    """Return `body` with its scrum block replaced by `fields` (added if absent).

    Raises ValueError on an unknown key -- writing one would produce a body this
    module then reports as a problem on the next read -- and on a block whose
    closing fence is missing, because there is no way to tell where a broken
    block ends and the user's prose begins. Refusing costs one manual fix;
    guessing costs whatever the user had typed underneath.
    """
    unknown = [key for key in fields if key not in KEYS]
    if unknown:
        raise ValueError(f"unknown scrum block key(s): {', '.join(sorted(unknown))}")

    block = "\n".join(
        [OPEN_FENCE]
        + [f"{key}: {fields[key]}" for key in KEYS if key in fields]
        + [CLOSE_FENCE]
    )

    body = body or ""
    lines = body.splitlines()
    start = next((i for i, line in enumerate(lines) if line.strip() == OPEN_FENCE), None)
    if start is None:
        return f"{body.rstrip()}\n\n{block}".lstrip("\n") if body.strip() else block

    end = next(
        (i for i in range(start + 1, len(lines)) if lines[i].strip() == CLOSE_FENCE),
        None,
    )
    if end is None:
        raise ValueError(
            f"unterminated scrum block: no closing {CLOSE_FENCE!r}; "
            "fix the body by hand before writing to it"
        )
    return "\n".join(lines[:start] + block.splitlines() + lines[end + 1 :])


# --- Cross-app linking -------------------------------------------------------


def reminder_marker(reminder_id):
    """The marker to paste into a note's body to point back at a reminder."""
    return f"[[reminder:{reminder_id}]]"


def find_reminder_markers(text):
    """Every reminder id referenced from a note body, in order of appearance."""
    return REMINDER_MARKER.findall(text or "")


# --- Items -------------------------------------------------------------------


def normalize(raw):
    """Turn one reminder from `list_reminders.js` into a flow-ready item."""
    fields, problems = parse_block(raw.get("body"))

    started_at = fields.get("started")
    completed = bool(raw.get("completed"))
    completed_at = _as_date(raw.get("completionDate"))

    if completed and not completed_at:
        # Reminders sets `completion date` itself, so an empty one means the
        # item was completed outside the app's own flow (or the sync has not
        # settled). Either way the item cannot enter Throughput.
        problems.append("marked complete but carries no completion date")

    if completed:
        state = "completed"
    elif started_at:
        state = "in_progress"
    else:
        state = "not_started"

    return {
        "id": raw.get("id"),
        "name": raw.get("name"),
        "list": raw.get("list"),
        "state": state,
        "started_at": started_at,
        "completed_at": completed_at,
        # Kept deliberately: created -> completed is Lead Time, and its gap
        # against Cycle Time is the item's wait in the Product Backlog.
        "created_at": _as_date(raw.get("creationDate")),
        "due_at": _as_date(raw.get("dueDate")),
        "sprint": fields.get("sprint"),
        "size": fields.get("size"),
        "note": fields.get("note"),
        "problems": problems,
    }


# --- Helpers -----------------------------------------------------------------


def _is_iso_date(value):
    try:
        date.fromisoformat(str(value)[:10])
        return True
    except (ValueError, TypeError):
        return False


def _as_date(value):
    """Truncate an ISO 8601 timestamp to its date, or None if there isn't one.

    `remind-cli` emits ISO 8601 internet date-times, so values arrive as
    `2026-08-05T14:30:00Z`. Flow metrics are counted in days; keeping the time
    would only invite timezone drift between two runs over the same data.
    """
    if not value:
        return None
    head = str(value).strip()[:10]
    try:
        return date.fromisoformat(head).isoformat()
    except ValueError:
        return None


def _read_items(stream):
    """Accept either a bare JSON array or `{"items": [...]}`."""
    text = stream.read()
    try:
        payload = json.loads(text) if text.strip() else []
    except json.JSONDecodeError as exc:
        raise SystemExit(f"scrum_block: input is not valid JSON: {exc}")
    if isinstance(payload, dict):
        payload = payload.get("items", [])
    if not isinstance(payload, list):
        raise SystemExit("scrum_block: expected a JSON array of reminders")
    return [normalize(item) for item in payload]


def _resolve_date(value, as_of):
    if value == "today":
        return (as_of or date.today()).isoformat()
    if not _is_iso_date(value):
        raise SystemExit(f"scrum_block: not an ISO 8601 date: {value!r}")
    return str(value)[:10]


# --- Commands ----------------------------------------------------------------


def cmd_parse(args):
    items = _read_items(sys.stdin)
    json.dump({"items": items}, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_csv(args):
    items = _read_items(sys.stdin)
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(["item_id", "started_at", "completed_at"])

    dropped = 0
    for item in items:
        if not item["started_at"]:
            # No start means no Cycle Time. Dropping the row is correct; doing
            # it silently is not, so the count goes to stderr and `unstarted`
            # names the items.
            dropped += 1
            continue
        writer.writerow([item["id"], item["started_at"], item["completed_at"] or ""])

    if dropped:
        print(
            f"scrum_block: {dropped} item(s) have no 'started:' and are absent from "
            "the flow data; run `scrum_block.py unstarted` to list them",
            file=sys.stderr,
        )
    return 0


def cmd_unstarted(args):
    """List open items with no recorded start -- the leak ADR 0001 requires catching."""
    items = _read_items(sys.stdin)
    missing = [i for i in items if i["state"] == "not_started"]

    if args.json:
        json.dump(missing, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0

    if not missing:
        print("Unstarted open items: none.")
        return 0

    print(f"Unstarted open items ({len(missing)}) -- absent from Cycle Time:")
    for item in missing:
        print(f"  - {item['name']}  [{item['id']}]")
    return 0


def cmd_set(args):
    body = sys.stdin.read()
    fields, _ = parse_block(body)

    if args.started is not None:
        fields["started"] = _resolve_date(args.started, args.as_of)
    for key in ("sprint", "size", "note"):
        value = getattr(args, key)
        if value is not None:
            fields[key] = value

    try:
        sys.stdout.write(render_block(body, fields))
    except ValueError as exc:
        raise SystemExit(f"scrum_block: {exc}")
    return 0


def build_parser():
    parser = argparse.ArgumentParser(
        description="Read and write the scrum block in a reminder body."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("parse", help="normalize reminders from stdin into JSON items")
    p.set_defaults(func=cmd_parse)

    p = sub.add_parser("csv", help="emit item_id,started_at,completed_at for flow_metrics.py")
    p.set_defaults(func=cmd_csv)

    p = sub.add_parser("unstarted", help="list open items missing a 'started:' date")
    p.add_argument("--json", action="store_true", help="emit JSON instead of a list")
    p.set_defaults(func=cmd_unstarted)

    p = sub.add_parser("set", help="update the block in a body read from stdin")
    p.add_argument("--sprint")
    p.add_argument("--size")
    p.add_argument("--started", help="ISO 8601 date, or 'today'")
    p.add_argument("--note", help="id of the linked note (x-coredata://...)")
    p.add_argument(
        "--as-of",
        type=lambda v: datetime.fromisoformat(v).date(),
        help="date that 'today' resolves to (default: today)",
    )
    p.set_defaults(func=cmd_set)

    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except SystemExit as exc:
        if isinstance(exc.code, str):
            print(exc.code, file=sys.stderr)
            return 2
        raise


if __name__ == "__main__":
    sys.exit(main())
