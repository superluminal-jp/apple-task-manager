#!/usr/bin/env bash
# project_registry.py unit test runner
# Usage: bash tests/run-project-registry.sh
#
# Like tests/run-scrum-block.sh, this suite does not call the claude CLI -- it
# is a plain stdlib unittest run over the apple-notes skill's
# project_registry.py, so it needs no model, no network, and no dependencies.
#
# It also does not need macOS: project_registry.py is deliberately the half of
# the multi-project feature that can be tested anywhere (docs/adr/0006). The
# JXA scripts beside it only run on a Mac with Notes.app and an Automation
# grant, and are not covered here.
#
# Exit codes: 0 = all tests passed; 1 = at least one test failed.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT" || exit 1

python3 -m unittest discover -s tests -p "test_project_registry.py" -v
