#!/usr/bin/env bash
# tests/test_note_body_conversion.js runner
# Usage: bash tests/run-note-body-conversion.sh
#
# Like tests/run-note-write-guard.sh, this suite exercises pure logic pulled
# out of a script that otherwise needs macOS (write_note.js's create() path
# needs Notes.app and an Automation grant). The functions under test --
# dedupTitleLine and linesToBodyHtml -- only manipulate strings, so this
# suite needs no model, no network, no dependencies, and no macOS.
#
# The Apple Events layer (write_note.js's actual create() call into Notes.app)
# is not covered here -- see specs/006-notes-template-format-fix/quickstart.md
# for the live-app scenario.
#
# Exit codes: 0 = all tests passed; 1 = at least one test failed.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT" || exit 1

node tests/test_note_body_conversion.js
