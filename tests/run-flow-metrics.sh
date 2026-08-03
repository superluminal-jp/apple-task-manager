#!/usr/bin/env bash
# flow_metrics.py unit test runner (vendored with the scrum-master skill)
# Usage: bash tests/run-flow-metrics.sh
#
# Unlike the other suites in this directory, this one does not call the claude
# CLI -- it is a plain stdlib unittest run over the scrum-master skill's
# flow_metrics.py, so it needs no model, no network, and no dependencies.
#
# Exit codes: 0 = all tests passed; 1 = at least one test failed.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT" || exit 1

python3 -m unittest discover -s tests -p "test_flow_metrics.py" -v
