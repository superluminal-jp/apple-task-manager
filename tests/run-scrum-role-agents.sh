#!/usr/bin/env bash
# Abolished PO/Developers perspective agent contract test runner
# Usage: bash tests/run-scrum-role-agents.sh
#
# This suite checks that the role-perspective subagents were removed and that
# project routing reflects real PO/Developers accountability instead. It uses
# the Python standard library, makes no model or network calls, and never reads
# or writes Apple Notes or Reminders.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT" || exit 1

PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s tests -p "test_scrum_role_agents.py" -v
