#!/usr/bin/env python3
"""Unit tests for .claude/skills/scrum-master/scripts/flow_metrics.py.

Standard library only (unittest) -- this repository deliberately carries no
Python package manifest, so the suite must run with a bare `python3`.

Run via: bash tests/run-flow-metrics.sh
"""
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / ".claude" / "skills" / "scrum-master" / "scripts" / "flow_metrics.py"


def load_module():
    spec = importlib.util.spec_from_file_location("flow_metrics", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fm = load_module()


def run_cli(rows, *args):
    """Run the script against a temporary CSV and return (stdout, stderr, returncode)."""
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="") as f:
        f.write("item_id,started_at,completed_at\n")
        for row in rows:
            f.write(",".join(row) + "\n")
        path = f.name
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), path, *args],
        capture_output=True, text=True,
    )
    return proc.stdout, proc.stderr, proc.returncode


class PercentileHonoursItsStatedCoverage(unittest.TestCase):
    """The SLE sentence claims "P% of items finished within N days"; N must make that true.

    Nearest-rank percentile is ceil(P/100 * N). Using round() instead pulls the
    rank down on exact .5 boundaries (Python rounds half to even), which reports
    an N that covers less than P% of observations -- a fabricated statistic.
    """

    def test_p85_of_ten_observations_covers_at_least_85_percent(self):
        values = list(range(1, 11))  # 0.85 * 10 == 8.5 -- the round()-vs-ceil boundary
        result = fm.percentile(values, 85)
        covered = sum(1 for v in values if v <= result) / len(values) * 100
        self.assertGreaterEqual(covered, 85)

    def test_p85_never_understates_coverage_across_sample_sizes(self):
        for n in range(1, 41):
            values = list(range(1, n + 1))
            result = fm.percentile(values, 85)
            covered = sum(1 for v in values if v <= result) / len(values) * 100
            with self.subTest(n=n):
                self.assertGreaterEqual(covered, 85)

    def test_percentile_returns_an_observed_value_not_an_interpolation(self):
        values = [2, 4, 9]
        self.assertIn(fm.percentile(values, 85), values)

    def test_percentile_of_empty_input_is_none(self):
        self.assertIsNone(fm.percentile([], 85))


class CycleTimeCountsBothEndpoints(unittest.TestCase):
    """Same-day work is one day of Cycle Time, not zero.

    Counting elapsed days alone reports 0 for same-day items, which collapses the
    median to 0 on short sprints and makes the SLE ("85% within 0 days")
    meaningless. Inclusive counting is a practitioner convention, not a Scrum
    Guide requirement.
    """

    def test_same_day_start_and_completion_is_one_day(self):
        self.assertEqual(fm.cycle_time_days(date(2026, 8, 1), date(2026, 8, 1)), 1)

    def test_start_and_completion_two_days_apart_is_three_days(self):
        self.assertEqual(fm.cycle_time_days(date(2026, 8, 1), date(2026, 8, 3)), 3)


class WorkItemAgeMeasuresUnfinishedWork(unittest.TestCase):
    """Work Item Age is elapsed time from start to now for items not yet finished.

    It is one of the four base flow metrics and is the only one that can change
    today's behaviour, so it drives daily inspection.
    """

    def test_age_of_item_started_today_is_one_day(self):
        self.assertEqual(fm.work_item_age_days(date(2026, 8, 1), date(2026, 8, 1)), 1)

    def test_age_counts_both_endpoints(self):
        self.assertEqual(fm.work_item_age_days(date(2026, 8, 1), date(2026, 8, 5)), 5)

    def test_open_items_appear_in_the_work_item_age_section(self):
        stdout, _, _ = run_cli(
            [("A", "2026-07-01", "2026-07-02"), ("OPEN-1", "2026-07-20", "")],
            "--as-of", "2026-07-25",
        )
        self.assertIn("Work Item Age", stdout)
        self.assertIn("OPEN-1", stdout)

    def test_open_item_older_than_the_sle_is_flagged(self):
        # Five completed items at 1 day each -> SLE is 1 day. The open item is far older.
        rows = [(f"C{i}", "2026-07-01", "2026-07-01") for i in range(5)]
        rows.append(("STUCK", "2026-07-01", ""))
        stdout, _, _ = run_cli(rows, "--as-of", "2026-07-20")
        self.assertRegex(stdout, r"STUCK.*(exceeds|over SLE|!)")

    def test_completed_items_are_absent_from_the_work_item_age_section(self):
        stdout, _, _ = run_cli(
            [("DONE-1", "2026-07-01", "2026-07-02"), ("OPEN-1", "2026-07-20", "")],
            "--as-of", "2026-07-25",
        )
        age_section = stdout.split("Work Item Age", 1)[1]
        self.assertNotIn("DONE-1", age_section)


class ThroughputShowsEveryWeekInRange(unittest.TestCase):
    """A week with no completions is a real observation and must not vanish.

    Omitting zero rows hides exactly the gaps a team needs to inspect, and made
    the Throughput table inconsistent with the WIP table, which already walked
    every week.
    """

    def test_week_with_no_completions_is_reported_as_zero(self):
        # 2026-07-06 is a Monday; skip the following week entirely.
        stdout, _, _ = run_cli(
            [("A", "2026-07-06", "2026-07-06"), ("B", "2026-07-20", "2026-07-20")],
            "--as-of", "2026-07-26",
        )
        throughput = stdout.split("Throughput", 1)[1].split("## ", 1)[0]
        self.assertIn("2026-W29", throughput)
        self.assertRegex(throughput, r"\|\s*2026-W29\s*\|\s*0\s*\|")


class OutputIsDeterministic(unittest.TestCase):
    """Tests cannot assert on output that silently depends on the clock."""

    def test_same_as_of_date_produces_identical_metrics(self):
        rows = [("A", "2026-07-01", "2026-07-03"), ("B", "2026-07-02", "")]
        first, _, _ = run_cli(rows, "--as-of", "2026-07-10")
        second, _, _ = run_cli(rows, "--as-of", "2026-07-10")
        # The title line echoes the input path, which differs per temp file; every
        # computed figure below it must match.
        self.assertEqual(first.split("\n", 1)[1], second.split("\n", 1)[1])

    def test_as_of_date_bounds_the_reported_weeks(self):
        rows = [("A", "2026-07-01", "2026-07-03")]
        stdout, _, _ = run_cli(rows, "--as-of", "2026-07-10")
        self.assertNotIn("2026-W30", stdout)

    def test_unparseable_as_of_is_rejected(self):
        _, stderr, code = run_cli([("A", "2026-07-01", "")], "--as-of", "not-a-date")
        self.assertNotEqual(code, 0)
        self.assertIn("as-of", stderr)


class MalformedInputIsReportedNotSilentlyAccepted(unittest.TestCase):
    def test_duplicate_item_id_is_warned_about(self):
        _, stderr, _ = run_cli(
            [("DUP", "2026-07-01", "2026-07-02"), ("DUP", "2026-07-03", "2026-07-04")],
            "--as-of", "2026-07-10",
        )
        self.assertIn("DUP", stderr)

    def test_item_started_after_the_as_of_date_is_warned_about(self):
        _, stderr, _ = run_cli([("FUTURE", "2026-07-20", "")], "--as-of", "2026-07-10")
        self.assertIn("FUTURE", stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
