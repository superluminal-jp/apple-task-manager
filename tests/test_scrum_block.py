#!/usr/bin/env python3
"""Unit tests for .claude/skills/apple-reminders/scripts/scrum_block.py.

Standard library only (unittest) -- this repository deliberately carries no
Python package manifest, so the suite must run with a bare `python3`.

These tests are the reason the parsing layer is Python and not Swift: they run
on any platform, with no Reminders.app, no TCC prompt, and no macOS. The
EventKit CLI beside `scrum_block.py` is a thin fetch/write layer and is
deliberately not covered here -- it cannot be executed off macOS.

The fixtures below are `remind-cli` output. They were AppleScript output before
the Reminders backend moved to EventKit, and every test survived that move
unchanged: this layer reads the JSON contract, not the framework.

Run via: bash tests/run-scrum-block.sh
"""
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / ".claude" / "skills" / "apple-reminders" / "scripts" / "scrum_block.py"


def load_module():
    spec = importlib.util.spec_from_file_location("scrum_block", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sb = load_module()


def run_cli(payload, *args):
    """Run the script with `payload` on stdin; return (stdout, stderr, returncode)."""
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        input=json.dumps(payload) if not isinstance(payload, str) else payload,
        capture_output=True,
        text=True,
    )
    return proc.stdout, proc.stderr, proc.returncode


def reminder(**overrides):
    """A reminder as `remind-cli` emits it, with a full scrum block."""
    base = {
        "id": "11111111-1111-1111-1111-111111111111",
        "externalId": "22222222-2222-2222-2222-222222222222",
        "name": "Ship the login form",
        "body": "--- scrum ---\nsprint: 7\nsize: M\nstarted: 2026-08-01\n---",
        "completed": False,
        "completionDate": None,
        "creationDate": "2026-07-20T09:00:00Z",
        "modificationDate": "2026-07-20T09:00:00Z",
        "dueDate": None,
        "priority": 0,
        "list": "Sprint Backlog",
        "hasRecurrenceRules": False,
    }
    base.update(overrides)
    return base


# --- The body block: parsing -----------------------------------------------


class ParseBlockTests(unittest.TestCase):
    def test_reads_every_documented_key(self):
        fields, _ = sb.parse_block(
            "--- scrum ---\nsprint: 7\nsize: M\nstarted: 2026-08-01\n---"
        )
        self.assertEqual(fields, {"sprint": "7", "size": "M", "started": "2026-08-01"})

    def test_body_without_a_block_yields_no_fields(self):
        fields, problems = sb.parse_block("Just a plain note the user typed.")
        self.assertEqual(fields, {})
        self.assertEqual(problems, [])

    def test_empty_body_yields_no_fields(self):
        self.assertEqual(sb.parse_block("")[0], {})
        self.assertEqual(sb.parse_block(None)[0], {})

    def test_prose_around_the_block_is_ignored(self):
        fields, _ = sb.parse_block(
            "Blocked on the API.\n\n--- scrum ---\nsprint: 7\n---\n\nSee the note."
        )
        self.assertEqual(fields, {"sprint": "7"})

    def test_unterminated_block_is_reported_not_crashed(self):
        fields, problems = sb.parse_block("--- scrum ---\nsprint: 7\nstarted: 2026-08-01")
        self.assertEqual(fields, {})
        self.assertTrue(any("unterminated" in p for p in problems))

    def test_unparsable_line_inside_the_block_is_reported(self):
        fields, problems = sb.parse_block("--- scrum ---\nsprint 7\n---")
        self.assertEqual(fields, {})
        self.assertTrue(any("sprint 7" in p for p in problems))

    def test_unknown_key_is_reported_and_dropped(self):
        fields, problems = sb.parse_block("--- scrum ---\nspint: 7\n---")
        self.assertEqual(fields, {})
        self.assertTrue(any("spint" in p for p in problems))

    def test_started_must_be_an_iso_date(self):
        fields, problems = sb.parse_block("--- scrum ---\nstarted: last tuesday\n---")
        self.assertNotIn("started", fields)
        self.assertTrue(any("started" in p for p in problems))

    def test_surrounding_whitespace_is_tolerated(self):
        fields, _ = sb.parse_block("--- scrum ---\n  sprint :  7  \n---")
        self.assertEqual(fields["sprint"], "7")


# --- The body block: serializing -------------------------------------------


class RenderBlockTests(unittest.TestCase):
    def test_adds_a_block_to_a_body_that_has_none(self):
        body = sb.render_block("Blocked on the API.", {"sprint": "7"})
        self.assertIn("--- scrum ---\nsprint: 7\n---", body)
        self.assertTrue(body.startswith("Blocked on the API."))

    def test_replaces_an_existing_block_in_place(self):
        original = "Prose.\n\n--- scrum ---\nsprint: 6\n---\n\nMore prose."
        body = sb.render_block(original, {"sprint": "7"})
        self.assertEqual(body.count("--- scrum ---"), 1)
        self.assertIn("sprint: 7", body)
        self.assertNotIn("sprint: 6", body)
        self.assertIn("More prose.", body)

    def test_round_trips_through_the_parser(self):
        fields = {"sprint": "7", "size": "M", "started": "2026-08-01"}
        self.assertEqual(sb.parse_block(sb.render_block("", fields))[0], fields)

    def test_keys_are_written_in_a_stable_order(self):
        forward = sb.render_block("", {"sprint": "7", "started": "2026-08-01"})
        reverse = sb.render_block("", {"started": "2026-08-01", "sprint": "7"})
        self.assertEqual(forward, reverse)

    def test_rejects_an_unknown_key(self):
        with self.assertRaises(ValueError):
            sb.render_block("", {"spint": "7"})

    def test_refuses_to_rewrite_a_broken_block_rather_than_lose_prose(self):
        with self.assertRaises(ValueError):
            sb.render_block("--- scrum ---\nsprint: 6\nstill my notes", {"sprint": "7"})

    def test_prose_after_the_block_survives_a_rewrite(self):
        body = sb.render_block(
            "--- scrum ---\nsprint: 6\n---\nstill my notes", {"sprint": "7"}
        )
        self.assertIn("still my notes", body)
        self.assertIn("sprint: 7", body)


# --- Cross-app linking ------------------------------------------------------


class LinkingTests(unittest.TestCase):
    def test_note_id_survives_a_round_trip(self):
        note_id = "x-coredata://ABC-123/ICNote/p42"
        body = sb.render_block("", {"note": note_id})
        self.assertEqual(sb.parse_block(body)[0]["note"], note_id)

    def test_reminder_marker_is_the_note_side_counterpart(self):
        marker = sb.reminder_marker("22222222-2222-2222-2222-222222222222")
        self.assertEqual(marker, "[[reminder:22222222-2222-2222-2222-222222222222]]")

    def test_reminder_markers_are_found_in_free_text(self):
        found = sb.find_reminder_markers(
            "<div>Retro for Sprint 7</div><div>[[reminder:ext-A]] "
            "and [[reminder:ext-B]]</div>"
        )
        self.assertEqual(found, ["ext-A", "ext-B"])

    def test_marker_format_is_agnostic_to_the_backend(self):
        """It held AppleScript ids before EventKit; both must still round-trip."""
        for identifier in ("x-apple-reminder://UUID", "22222222-2222-2222-2222-222222222222"):
            self.assertEqual(
                sb.find_reminder_markers(sb.reminder_marker(identifier)), [identifier]
            )

    def test_no_markers_in_plain_text(self):
        self.assertEqual(sb.find_reminder_markers("nothing to see"), [])


# --- Item normalization -----------------------------------------------------


class NormalizeTests(unittest.TestCase):
    def test_started_and_completed_come_from_their_documented_sources(self):
        item = sb.normalize(
            reminder(completed=True, completionDate="2026-08-05T14:30:00")
        )
        self.assertEqual(item["started_at"], "2026-08-01")
        self.assertEqual(item["completed_at"], "2026-08-05")

    def test_timestamps_are_truncated_to_dates(self):
        item = sb.normalize(reminder(creationDate="2026-07-20T09:15:00Z"))
        self.assertEqual(item["created_at"], "2026-07-20")

    def test_eventkit_only_fields_do_not_disturb_normalization(self):
        """externalId and hasRecurrenceRules arrived with the EventKit backend."""
        item = sb.normalize(reminder())
        self.assertEqual(item["id"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(item["state"], "in_progress")

    def test_an_item_with_started_and_no_completion_is_in_progress(self):
        item = sb.normalize(reminder())
        self.assertEqual(item["state"], "in_progress")

    def test_an_item_without_started_is_not_started(self):
        item = sb.normalize(reminder(body=""))
        self.assertEqual(item["state"], "not_started")
        self.assertIsNone(item["started_at"])

    def test_a_completed_item_is_done_even_without_started(self):
        item = sb.normalize(reminder(body="", completed=True, completionDate="2026-08-05"))
        self.assertEqual(item["state"], "completed")

    def test_completed_flag_without_a_date_is_reported_as_a_problem(self):
        item = sb.normalize(reminder(completed=True, completionDate=None))
        self.assertEqual(item["state"], "completed")
        self.assertTrue(any("completion date" in p for p in item["problems"]))


# --- CLI: csv ---------------------------------------------------------------


class CsvCommandTests(unittest.TestCase):
    def test_emits_the_exact_header_flow_metrics_requires(self):
        out, _, code = run_cli([reminder()], "csv")
        self.assertEqual(code, 0)
        self.assertEqual(out.splitlines()[0], "item_id,started_at,completed_at")

    def test_in_progress_item_has_an_empty_completed_at(self):
        out, _, _ = run_cli([reminder()], "csv")
        row = out.splitlines()[1]
        self.assertTrue(row.endswith(",2026-08-01,"))

    def test_completed_item_carries_both_dates(self):
        out, _, _ = run_cli(
            [reminder(completed=True, completionDate="2026-08-05")], "csv"
        )
        self.assertIn(",2026-08-01,2026-08-05", out)

    def test_items_that_never_started_are_left_out_of_the_flow_data(self):
        out, _, _ = run_cli([reminder(body=""), reminder()], "csv")
        self.assertEqual(len(out.strip().splitlines()), 2)  # header + the started one

    def test_output_feeds_flow_metrics_unmodified(self):
        """The whole point of ADR 0001: flow_metrics.py runs unforked."""
        out, _, _ = run_cli(
            [
                reminder(id="A", completed=True, completionDate="2026-08-05"),
                reminder(id="B"),
            ],
            "csv",
        )
        # The scrum-master skill is vendored here (ADR 0005), so this runs the
        # real script rather than skipping when my-claude-code is not installed.
        flow = REPO_ROOT / ".claude" / "skills" / "scrum-master" / "scripts" / "flow_metrics.py"
        csv_path = Path(self.enterContext(__import__("tempfile").TemporaryDirectory()))
        target = csv_path / "tickets.csv"
        target.write_text(out)
        proc = subprocess.run(
            [sys.executable, str(flow), str(target), "--as-of", "2026-08-10"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("Cycle Time", proc.stdout)


# --- CLI: unstarted (the detection ADR 0001 makes mandatory) ----------------


class UnstartedCommandTests(unittest.TestCase):
    def test_lists_open_items_that_never_recorded_a_start(self):
        out, _, code = run_cli(
            [reminder(id="A", name="Forgotten", body=""), reminder(id="B")], "unstarted"
        )
        self.assertEqual(code, 0)
        self.assertIn("Forgotten", out)
        self.assertNotIn("Ship the login form", out)

    def test_completed_items_are_never_reported_as_unstarted(self):
        out, _, _ = run_cli(
            [reminder(body="", completed=True, completionDate="2026-08-05")], "unstarted"
        )
        self.assertNotIn("Ship the login form", out)

    def test_says_so_plainly_when_nothing_is_missing(self):
        out, _, code = run_cli([reminder()], "unstarted")
        self.assertEqual(code, 0)
        self.assertIn("none", out.lower())

    def test_json_output_is_available_for_scripting(self):
        out, _, _ = run_cli([reminder(id="A", body="")], "unstarted", "--json")
        self.assertEqual([i["id"] for i in json.loads(out)], ["A"])


# --- CLI: parse and set -----------------------------------------------------


class ParseAndSetCommandTests(unittest.TestCase):
    def test_parse_surfaces_problems_alongside_items(self):
        out, _, code = run_cli([reminder(body="--- scrum ---\nsprint: 7")], "parse")
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertTrue(payload["items"][0]["problems"])

    def test_set_updates_a_body_read_from_stdin(self):
        out, _, code = run_cli(
            "Blocked on the API.", "set", "--started", "2026-08-01", "--sprint", "7"
        )
        self.assertEqual(code, 0)
        self.assertEqual(
            sb.parse_block(out)[0], {"sprint": "7", "started": "2026-08-01"}
        )
        self.assertIn("Blocked on the API.", out)

    def test_set_preserves_keys_it_was_not_asked_to_change(self):
        out, _, _ = run_cli(
            "--- scrum ---\nsprint: 7\nsize: M\n---", "set", "--started", "2026-08-01"
        )
        self.assertEqual(
            sb.parse_block(out)[0],
            {"sprint": "7", "size": "M", "started": "2026-08-01"},
        )

    def test_set_today_resolves_against_an_explicit_date(self):
        out, _, _ = run_cli("", "set", "--started", "today", "--as-of", "2026-08-03")
        self.assertEqual(sb.parse_block(out)[0]["started"], "2026-08-03")

    def test_set_rejects_a_malformed_date_instead_of_writing_it(self):
        _, err, code = run_cli("", "set", "--started", "last tuesday")
        self.assertEqual(code, 2)
        self.assertIn("last tuesday", err)

    def test_set_refuses_a_broken_block_instead_of_truncating_the_body(self):
        out, err, code = run_cli(
            "--- scrum ---\nsprint: 6\nstill my notes", "set", "--sprint", "7"
        )
        self.assertEqual(code, 2)
        self.assertEqual(out, "")
        self.assertIn("unterminated", err)


# --- CLI: input handling ----------------------------------------------------


class InputHandlingTests(unittest.TestCase):
    def test_malformed_json_fails_with_a_clear_message(self):
        _, err, code = run_cli("{not json", "csv")
        self.assertEqual(code, 2)
        self.assertIn("JSON", err)

    def test_a_json_object_with_an_items_key_is_accepted(self):
        out, _, code = run_cli({"items": [reminder()]}, "csv")
        self.assertEqual(code, 0)
        self.assertIn("2026-08-01", out)

    def test_empty_input_is_not_a_crash(self):
        out, _, code = run_cli([], "csv")
        self.assertEqual(code, 0)
        self.assertEqual(out.strip(), "item_id,started_at,completed_at")


if __name__ == "__main__":
    unittest.main()
