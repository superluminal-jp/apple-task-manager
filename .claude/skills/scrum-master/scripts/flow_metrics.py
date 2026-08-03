#!/usr/bin/env python3
"""Compute Cycle Time, Work Item Age, Throughput, and WIP from a CSV of ticket dates.

Grounded in The Kanban Guide for Scrum Teams (Scrum.org / Vacanti / Yeret, 2021):
WIP, Cycle Time, Work Item Age, and Throughput are the four base flow metrics,
and a Service Level Expectation (SLE) is a probability + timeframe forecast
built from the observed Cycle Time distribution (e.g. "85% of items finish
within N days"). This script never invents numbers: every figure comes from
the rows in the input CSV.

Usage:
    python3 flow_metrics.py tickets.csv
    python3 flow_metrics.py tickets.csv --as-of 2026-07-31

Input CSV columns (header required): item_id,started_at,completed_at
Dates are ISO 8601 (e.g. 2026-07-01). Leave completed_at empty for items
still in progress -- they count toward WIP and Work Item Age, but not toward
Cycle Time or Throughput.

Two conventions this script applies, neither of which the Scrum Guide or the
Kanban Guide prescribes:

* **Both endpoints count.** An item started and completed on the same day has
  a Cycle Time of 1 day, not 0. Measuring bare elapsed days collapses the
  median to 0 on short sprints and makes the SLE ("85% within 0 days")
  meaningless. Work Item Age is counted the same way.
* **`--as-of` fixes the reporting date** (default: today). Work Item Age and
  the WIP/Throughput week range are all measured against it, so the same CSV
  always yields the same report.
"""
import argparse
import csv
import math
import statistics
import sys
from datetime import date, datetime, timedelta

# The Kanban Guide's own worked examples use the 85th percentile as the
# default Service Level Expectation -- it balances a useful forecast against
# being skewed by a handful of outliers. [KGS21, p.6]
SLE_PERCENTILE = 85


def parse_date(value: str) -> date:
    return datetime.fromisoformat(value.strip()).date()


def as_of_argument(value: str) -> date:
    """argparse type for --as-of; the raised message is what the user sees."""
    try:
        return parse_date(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"not an ISO 8601 date: {value!r}")


def cycle_time_days(started: date, completed: date) -> int:
    """Cycle Time in days, counting both endpoints (same day == 1 day)."""
    return (completed - started).days + 1


def work_item_age_days(started: date, as_of: date) -> int:
    """Work Item Age in days for an unfinished item, counting both endpoints."""
    return (as_of - started).days + 1


def percentile(values, pct):
    """Nearest-rank percentile: ceil(pct/100 * n), so the result is an observed value.

    ceil, not round: the SLE sentence asserts "pct% of items finished within
    N days", and rounding the rank down (which Python's banker's rounding does
    at exact .5 boundaries) yields an N that covers fewer than pct% of the
    observations -- i.e. a false claim.
    """
    ordered = sorted(values)
    if not ordered:
        return None
    rank = max(1, math.ceil(pct / 100 * len(ordered)))
    return ordered[min(rank, len(ordered)) - 1]


def iso_week_label(d: date) -> str:
    year, week, _ = d.isocalendar()
    return f"{year}-W{week:02d}"


def week_end(d: date) -> date:
    # ISO weeks run Monday-Sunday; return the Sunday for the week containing d.
    return d + timedelta(days=6 - d.weekday())


def week_ends_between(first: date, last: date):
    """Every ISO week end from the week containing `first` to the week containing `last`.

    Weeks are enumerated rather than derived from the data so that weeks with no
    activity still appear -- an empty week is an observation, not a gap to hide.
    """
    ends = []
    cursor = first
    while cursor <= last:
        wk_end = week_end(cursor)
        ends.append(wk_end)
        cursor = wk_end + timedelta(days=1)
    return ends


def load_items(path: str, as_of: date):
    """Read the CSV, skipping and warning on rows that can't be used rather than aborting."""
    items = []
    seen_ids = set()
    try:
        f = open(path, newline="", encoding="utf-8")
    except FileNotFoundError:
        print(f"error: file not found: {path}", file=sys.stderr)
        sys.exit(1)

    with f:
        reader = csv.DictReader(f)
        missing = {"item_id", "started_at"} - set(reader.fieldnames or [])
        if missing:
            print(f"error: CSV is missing required column(s): {', '.join(sorted(missing))}", file=sys.stderr)
            sys.exit(1)

        for i, row in enumerate(reader, start=2):  # header is row 1
            item_id = (row.get("item_id") or "").strip()
            if not item_id:
                print(f"warning: row {i}: missing item_id, skipped", file=sys.stderr)
                continue
            if item_id in seen_ids:
                print(f"warning: row {i}: duplicate item_id {item_id}, kept but the id is ambiguous", file=sys.stderr)
            seen_ids.add(item_id)

            try:
                started = parse_date(row["started_at"])
            except (ValueError, KeyError):
                print(f"warning: row {i} ({item_id}): unparseable started_at, skipped", file=sys.stderr)
                continue

            completed_raw = (row.get("completed_at") or "").strip()
            completed = None
            if completed_raw:
                try:
                    completed = parse_date(completed_raw)
                except ValueError:
                    print(f"warning: row {i} ({item_id}): unparseable completed_at, treated as in-progress", file=sys.stderr)
                if completed is not None and completed < started:
                    print(f"warning: row {i} ({item_id}): completed_at before started_at, skipped", file=sys.stderr)
                    continue

            if started > as_of:
                print(f"warning: row {i} ({item_id}): started_at is after --as-of {as_of.isoformat()}, excluded from Work Item Age", file=sys.stderr)

            items.append({"item_id": item_id, "started": started, "completed": completed})
    return items


def print_cycle_time(cycle_times):
    if not cycle_times:
        print("## Cycle Time\n\nNo completed items to measure.\n")
        return None
    p85 = percentile(cycle_times, SLE_PERCENTILE)
    print("## Cycle Time (days, both endpoints counted)\n")
    print("| min | median | p85 (SLE) | max |")
    print("|---|---|---|---|")
    print(f"| {min(cycle_times)} | {statistics.median(cycle_times)} | {p85} | {max(cycle_times)} |")
    print(f"\nSLE: {SLE_PERCENTILE}% of completed items finished within {p85} day(s), "
          f"based on {len(cycle_times)} observations. [KGS21, p.6]\n")
    return p85


def print_work_item_age(open_items, as_of, sle):
    """Age of every unfinished item, oldest first, flagged against the SLE.

    This is the only base flow metric that describes work still in hand, so it
    is the one a daily inspection can act on. Items past the SLE are the
    Kanban Guide's own risk signal. [KGS21, pp.7-8]
    """
    measurable = [i for i in open_items if i["started"] <= as_of]
    print(f"## Work Item Age (days as of {as_of.isoformat()}, both endpoints counted)\n")
    if not measurable:
        print("No items in progress.\n")
        return
    rows = sorted(
        ((work_item_age_days(i["started"], as_of), i) for i in measurable),
        key=lambda pair: pair[0],
        reverse=True,
    )
    print("| Item | Started | Age | vs SLE |")
    print("|---|---|---|---|")
    for age, item in rows:
        if sle is None:
            flag = "no SLE yet"
        elif age > sle:
            flag = f"exceeds SLE ({sle}d)"
        else:
            flag = "within"
        print(f"| {item['item_id']} | {item['started'].isoformat()} | {age} | {flag} |")
    if sle is not None:
        over = sum(1 for age, _ in rows if age > sle)
        if over:
            print(f"\n{over} of {len(rows)} in-progress item(s) are older than the "
                  f"{SLE_PERCENTILE}% SLE of {sle} day(s). [KGS21, pp.7-8]\n")
        else:
            print()
    else:
        print()


def print_throughput(completed_items, week_ends):
    print("## Throughput (completed items per ISO week)\n")
    counts = {iso_week_label(e): 0 for e in week_ends}
    for i in completed_items:
        label = iso_week_label(i["completed"])
        if label in counts:
            counts[label] += 1
    print("| Week | Completed |")
    print("|---|---|")
    for e in week_ends:
        label = iso_week_label(e)
        print(f"| {label} | {counts[label]} |")
    print()


def print_wip(items, week_ends):
    print("## WIP (snapshot at end of each ISO week)\n")
    print("| Week | WIP |")
    print("|---|---|")
    for e in week_ends:
        wip = sum(
            1 for i in items
            if i["started"] <= e and (i["completed"] is None or i["completed"] > e)
        )
        print(f"| {iso_week_label(e)} | {wip} |")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv_path", help="CSV file with item_id,started_at,completed_at")
    parser.add_argument(
        "--as-of",
        type=as_of_argument,
        default=date.today(),
        metavar="YYYY-MM-DD",
        help="reporting date for Work Item Age and the week range (default: today)",
    )
    args = parser.parse_args()
    as_of = args.as_of

    items = load_items(args.csv_path, as_of)
    if not items:
        print("No usable rows found.", file=sys.stderr)
        sys.exit(1)

    completed_items = [i for i in items if i["completed"] is not None]
    open_items = [i for i in items if i["completed"] is None]
    cycle_times = [cycle_time_days(i["started"], i["completed"]) for i in completed_items]

    print(f"# Flow metrics — {args.csv_path} (as of {as_of.isoformat()})\n")
    print(f"- Items read: {len(items)}")
    print(f"- Completed: {len(completed_items)}")
    print(f"- In progress: {len(open_items)}\n")

    sle = print_cycle_time(cycle_times)
    print_work_item_age(open_items, as_of, sle)

    week_ends = week_ends_between(min(i["started"] for i in items), as_of)
    if week_ends:
        print_throughput(completed_items, week_ends)
        print_wip(items, week_ends)


if __name__ == "__main__":
    main()
