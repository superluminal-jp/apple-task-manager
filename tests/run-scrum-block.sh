#!/usr/bin/env bash
# scrum_block.py unit test runner
# Usage: bash tests/run-scrum-block.sh
#
# Like tests/run-flow-metrics.sh, this suite does not call the claude CLI -- it
# is a plain stdlib unittest run over the apple-reminders skill's
# scrum_block.py, so it needs no model, no network, and no dependencies.
#
# It also does not need macOS: scrum_block.py is deliberately the half of the
# skill that can be tested anywhere. The JXA scripts beside it only run on a
# Mac with Reminders.app and an Automation grant, and are not covered here.
#
# Exit codes: 0 = all tests passed; 1 = at least one test failed.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT" || exit 1

python3 -m unittest discover -s tests -p "test_scrum_block.py" -v
