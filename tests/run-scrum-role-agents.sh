#!/usr/bin/env bash
# Scrum role perspective agent contract test runner
# Usage: bash tests/run-scrum-role-agents.sh
#
# This suite checks Markdown agent definitions and project routing only. It uses
# the Python standard library, makes no model or network calls, and never reads
# or writes Apple Notes or Reminders.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT" || exit 1

PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s tests -p "test_scrum_role_agents.py" -v
