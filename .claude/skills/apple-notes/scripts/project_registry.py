#!/usr/bin/env python3
"""Read and fold the append-only project registry kept inside a Notes note.

Multi-project support (spec 004) needs a place to record which projects exist,
their Notes-folder/Reminders-list names, and which is current. `write_note.js`
can only create a note or append to one -- it cannot replace or partially edit
an existing body (see the `apple-notes` skill's "Scripts" table). So the
registry is not a single mutable record; it is a sequence of small fenced
`--- projects ---` blocks, each one immutable fact ("register" a project, or
"set-current" one), and current state is always the fold of every block in the
note, in order:

    --- projects ---
    event: register
    name: ProjectA
    notes_folder: ProjectA
    product_backlog: ProjectA Product Backlog
    sprint_backlog: ProjectA Sprint Backlog
    ---

    --- projects ---
    event: set-current
    name: ProjectA
    ---

Prose above, below, and between blocks is preserved -- a human may read or
annotate this note in Notes.app; only text inside a `--- projects ---` fence is
parsed. See docs/adr/0006-project-registry-as-notes-event-log.md for why this
shape was chosen over a single mutable record or a repository config file, and
specs/004-multi-project-scrum/contracts/project-registry.md for the full
contract.

Unlike scrum_block.py's single-block leniency (a broken block there degrades
into a reported problem so the rest of a reminder's data survives), a malformed
block here stops folding entirely: this script folds many blocks into one
cumulative state, so silently skipping a bad one could register a project with
a missing field and cascade incorrectly into every later resolution. One
broken block invalidates the whole read, the same way an unterminated fence
already does for scrum_block.py.

This module never calls osascript. It only reads the registry note's plaintext
body (via `list_notes.js --plaintext`) from stdin and, for a write, prints the
new block to append -- the caller pipes that into `write_note.js
--append-stdin`. Fetch and write with the platform API, decide with Python: the
same split `apple-reminders`'s scrum_block.py/remind-cli pair already uses.

Usage (stdin/stdout throughout, so it composes with the Notes layer):

    N="$PWD/.claude/skills/apple-notes/scripts"
    S="$PWD/.claude/skills/apple-notes/scripts"

    osascript -l JavaScript "$N/list_notes.js" --id "<id>" --plaintext \\
      | python3 "$S/project_registry.py" resolve

    osascript -l JavaScript "$N/list_notes.js" --id "<id>" --plaintext \\
      | python3 "$S/project_registry.py" register --name "ProjectA" \\
          --notes-folder "ProjectA" \\
          --product-backlog "ProjectA Product Backlog" \\
          --sprint-backlog "ProjectA Sprint Backlog" \\
      | osascript -l JavaScript "$N/write_note.js" --id "<id>" --append-stdin
"""
import argparse
import json
import sys

OPEN_FENCE = "--- projects ---"
CLOSE_FENCE = "---"

REGISTER_FIELDS = ("notes_folder", "product_backlog", "sprint_backlog")


class RegistryError(Exception):
    """A registry note's content cannot be trusted as-is.

    Raised for an unterminated block, an unrecognized event, a missing
    required field, or a set-current naming a project with no prior register
    event -- every case where continuing would mean guessing. Folding stops
    entirely rather than skipping the bad block and continuing, because later
    blocks may depend on state the bad block was supposed to establish.
    """


# --- Folding: the read side ---------------------------------------------------


def _iter_blocks(body):
    """Yield each `--- projects ---` block's inner lines, in note order.

    Raises RegistryError naming the starting line on an unterminated fence --
    there is no way to tell where a broken block ends and the user's prose
    begins, the same refusal `scrum_block.py`'s `render_block` already makes.
    """
    lines = (body or "").splitlines()
    i = 0
    while i < len(lines):
        if lines[i].strip() == OPEN_FENCE:
            start = i
            end = next(
                (j for j in range(start + 1, len(lines)) if lines[j].strip() == CLOSE_FENCE),
                None,
            )
            if end is None:
                raise RegistryError(
                    f"unterminated projects block starting at line {start + 1}: "
                    f"no closing {CLOSE_FENCE!r}"
                )
            yield lines[start + 1 : end]
            i = end + 1
        else:
            i += 1


def _parse_event(block_lines):
    """Parse one block's lines into a validated event dict, or raise."""
    fields = {}
    for line in block_lines:
        if not line.strip():
            continue
        if ":" not in line:
            raise RegistryError(f"unparsable line in projects block: {line.strip()!r}")
        key, _, value = line.partition(":")
        fields[key.strip()] = value.strip()

    event = fields.get("event")
    if event not in ("register", "set-current"):
        raise RegistryError(f"unknown event in projects block: {event!r}")

    name = fields.get("name")
    if not name:
        raise RegistryError("projects block is missing required field: name")

    if event == "set-current":
        return {"event": "set-current", "name": name}

    missing = [key for key in REGISTER_FIELDS if key not in fields]
    if missing:
        raise RegistryError(
            f"register block for {name!r} is missing required field(s): "
            f"{', '.join(missing)}"
        )
    return {"event": "register", "name": name, **{k: fields[k] for k in REGISTER_FIELDS}}


def fold(body):
    """Fold every event in `body` into `{"projects": {...}, "current": str|None}`.

    Raises RegistryError on the first malformed or invariant-violating block
    (see the class docstring). Never guesses a project's resource names --
    every field in the result came from a `register` event actually present in
    the note.
    """
    state = {"projects": {}, "current": None}
    for block_lines in _iter_blocks(body):
        event = _parse_event(block_lines)
        if event["event"] == "register":
            state["projects"][event["name"]] = {k: event[k] for k in REGISTER_FIELDS}
        else:
            if event["name"] not in state["projects"]:
                raise RegistryError(
                    f"set-current for unregistered project: {event['name']!r}"
                )
            state["current"] = event["name"]
    return state


# --- Rendering: the write side -------------------------------------------------


def render_register_block(name, notes_folder, product_backlog, sprint_backlog):
    """The `--- projects ---` text to append for a new registration."""
    return "\n".join(
        [
            OPEN_FENCE,
            "event: register",
            f"name: {name}",
            f"notes_folder: {notes_folder}",
            f"product_backlog: {product_backlog}",
            f"sprint_backlog: {sprint_backlog}",
            CLOSE_FENCE,
        ]
    )


def render_set_current_block(name):
    """The `--- projects ---` text to append to switch the current project."""
    return "\n".join([OPEN_FENCE, "event: set-current", f"name: {name}", CLOSE_FENCE])


# --- Commands ------------------------------------------------------------------


def cmd_resolve(args):
    state = fold(sys.stdin.read())
    json.dump(state, sys.stdout, indent=2, ensure_ascii=False, sort_keys=True)
    sys.stdout.write("\n")
    return 0


def cmd_list(args):
    state = fold(sys.stdin.read())
    json.dump(sorted(state["projects"]), sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_current(args):
    state = fold(sys.stdin.read())
    if state["current"]:
        print(state["current"])
    return 0


def cmd_register(args):
    state = fold(sys.stdin.read())

    new = {
        "notes_folder": args.notes_folder,
        "product_backlog": args.product_backlog,
        "sprint_backlog": args.sprint_backlog,
    }
    existing = state["projects"].get(args.name)
    if existing is not None and existing != new:
        raise SystemExit(
            f"project_registry: {args.name!r} is already registered with different "
            f"resource names ({existing}); rename is not supported -- choose a "
            "different project name, or register the existing names verbatim"
        )

    sys.stdout.write(
        render_register_block(
            args.name, args.notes_folder, args.product_backlog, args.sprint_backlog
        )
    )
    return 0


def cmd_set_current(args):
    state = fold(sys.stdin.read())
    if args.name not in state["projects"]:
        raise SystemExit(
            f"project_registry: {args.name!r} is not registered; run `register` "
            "for it first"
        )
    sys.stdout.write(render_set_current_block(args.name))
    return 0


def build_parser():
    parser = argparse.ArgumentParser(
        description="Read and fold the append-only project registry kept inside a Notes note."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("resolve", help="fold the registry note (stdin) into current state as JSON")
    p.set_defaults(func=cmd_resolve)

    p = sub.add_parser("list", help="every registered project name, as a sorted JSON array")
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("current", help="the current project's name (empty if none is set)")
    p.set_defaults(func=cmd_current)

    p = sub.add_parser("register", help="emit the block to append for a new registration")
    p.add_argument("--name", required=True)
    p.add_argument("--notes-folder", required=True)
    p.add_argument("--product-backlog", required=True)
    p.add_argument("--sprint-backlog", required=True)
    p.set_defaults(func=cmd_register)

    p = sub.add_parser("set-current", help="emit the block to append to switch current")
    p.add_argument("--name", required=True)
    p.set_defaults(func=cmd_set_current)

    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except RegistryError as exc:
        print(f"project_registry: {exc}", file=sys.stderr)
        return 2
    except SystemExit as exc:
        if isinstance(exc.code, str):
            print(exc.code, file=sys.stderr)
            return 2
        raise


if __name__ == "__main__":
    sys.exit(main())
