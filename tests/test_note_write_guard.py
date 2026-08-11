#!/usr/bin/env python3
"""Unit tests for .claude/skills/apple-notes/scripts/note_write_guard.py.

Standard library only (unittest) -- this repository deliberately carries no
Python package manifest, so the suite must run with a bare `python3`.

Mirrors tests/test_project_registry.py's shape: the script under test never
calls osascript, so every case here runs on any platform, with no Notes.app
and no Automation grant. See
specs/005-notes-conditional-overwrite/contracts/note-write-guard.md for the
contract this suite verifies.

Run via: bash tests/run-note-write-guard.sh
"""
import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / ".claude" / "skills" / "apple-notes" / "scripts" / "note_write_guard.py"


def load_module():
    spec = importlib.util.spec_from_file_location("note_write_guard", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


nwg = load_module()


def run_cli(stdin_text, *args):
    """Run the script with `stdin_text` on stdin; return (stdout, stderr, returncode)."""
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        input=stdin_text,
        capture_output=True,
        text=True,
    )
    return proc.stdout, proc.stderr, proc.returncode


# Known SHA-256 hexdigests, computed independently (not via this module) --
# transcribed verbatim so the test does not become tautological.
EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
ABC_HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
JAPANESE_HASH = "8dd64fbca0c5c81dcfdb7cd39683d5bd5aea62a6262eb5fc744c030ff10ed650"
EMOJI_HASH = "769b4cd5e7c41b22dcf3fe6828443e75ad0685697568c48e890bff0b2b793888"
MULTILINE_HASH = "2751a3a2f303ad21752038085e2b8c5f98ecff61a2e4ebbd43506a941725be80"


class Sha256PlaintextTests(unittest.TestCase):
    """Direct calls into sha256_plaintext() -- the pure function."""

    def test_empty_string(self):
        self.assertEqual(nwg.sha256_plaintext(""), EMPTY_HASH)

    def test_ascii(self):
        self.assertEqual(nwg.sha256_plaintext("abc"), ABC_HASH)

    def test_japanese_utf8(self):
        self.assertEqual(nwg.sha256_plaintext("上高地"), JAPANESE_HASH)

    def test_emoji_utf8(self):
        self.assertEqual(nwg.sha256_plaintext("🎌絵文字テスト"), EMOJI_HASH)

    def test_multiline(self):
        self.assertEqual(nwg.sha256_plaintext("line1\nline2\n"), MULTILINE_HASH)


class HashCliTests(unittest.TestCase):
    """The `hash` subcommand end-to-end, via subprocess."""

    def test_empty_stdin(self):
        stdout, stderr, code = run_cli("", "hash")
        self.assertEqual(code, 0, stderr)
        self.assertEqual(stdout.strip(), EMPTY_HASH)

    def test_japanese_stdin(self):
        stdout, stderr, code = run_cli("上高地", "hash")
        self.assertEqual(code, 0, stderr)
        self.assertEqual(stdout.strip(), JAPANESE_HASH)


class DecideTests(unittest.TestCase):
    """Direct calls into decide() -- the pure function."""

    def test_matching_hash_allows(self):
        self.assertEqual(nwg.decide("abc", ABC_HASH), "allow")

    def test_mismatched_hash_refuses(self):
        self.assertEqual(nwg.decide("abc", EMPTY_HASH), "refuse")

    def test_uppercase_hash_is_treated_as_mismatch(self):
        # hexdigest() always produces lowercase; an uppercase expected value
        # must not be treated as equivalent (contracts/note-write-guard.md).
        self.assertEqual(nwg.decide("abc", ABC_HASH.upper()), "refuse")

    def test_empty_plaintext_matching_empty_hash_allows(self):
        self.assertEqual(nwg.decide("", EMPTY_HASH), "allow")


class DecideCliTests(unittest.TestCase):
    """The `decide` subcommand end-to-end, via subprocess."""

    def test_matching_hash_prints_allow(self):
        stdout, stderr, code = run_cli("abc", "decide", "--expect-hash", ABC_HASH)
        self.assertEqual(code, 0, stderr)
        self.assertEqual(stdout.strip(), "allow")

    def test_mismatched_hash_prints_refuse(self):
        stdout, stderr, code = run_cli("abc", "decide", "--expect-hash", EMPTY_HASH)
        self.assertEqual(code, 0, stderr)
        self.assertEqual(stdout.strip(), "refuse")

    def test_missing_expect_hash_is_a_usage_error(self):
        stdout, stderr, code = run_cli("abc", "decide")
        self.assertNotEqual(code, 0)
        self.assertEqual(stdout, "")


if __name__ == "__main__":
    unittest.main()
