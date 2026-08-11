#!/usr/bin/env bash
# note_write_guard.py unit test runner
# Usage: bash tests/run-note-write-guard.sh
#
# Like tests/run-project-registry.sh, this suite does not call the claude CLI
# or osascript -- it is a plain stdlib unittest run over the apple-notes
# skill's note_write_guard.py, so it needs no model, no network, and no
# dependencies, and no macOS.
#
# The Apple Events layer (write_note.js's --overwrite-stdin/--delete) is not
# covered here -- it can only be validated on a Mac with Notes.app and an
# Automation grant. See specs/005-notes-conditional-overwrite/quickstart.md.
#
# Exit codes: 0 = all tests passed; 1 = at least one test failed.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT" || exit 1

python3 -m unittest discover -s tests -p "test_note_write_guard.py" -v
