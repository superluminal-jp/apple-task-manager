#!/usr/bin/env python3
"""Decide whether a Notes write may proceed, and compute the hash it checks.

Pure Python, standard library only -- this script never calls osascript. It
mirrors the split scrum_block.py and project_registry.py already use in this
repository: Apple-side scripts fetch and write via Apple Events; this module
only computes and compares.

    hash    <stdin: plaintext>                    -> sha256 hexdigest
    decide  <stdin: plaintext> --expect-hash <h>   -> "allow" or "refuse"

See specs/005-notes-conditional-overwrite/contracts/note-write-guard.md for
the full contract this module implements.
"""
import argparse
import hashlib
import sys


def sha256_plaintext(text: str) -> str:
    """Return the SHA-256 hexdigest of `text`, encoded as UTF-8."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def decide(current_plaintext: str, expect_hash: str) -> str:
    """Return "allow" if `current_plaintext` hashes to `expect_hash`, else "refuse"."""
    return "allow" if sha256_plaintext(current_plaintext) == expect_hash else "refuse"


def main(argv):
    parser = argparse.ArgumentParser(prog="note_write_guard.py")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("hash")

    decide_parser = subparsers.add_parser("decide")
    decide_parser.add_argument("--expect-hash", required=True)

    args = parser.parse_args(argv)
    stdin_text = sys.stdin.read()

    if args.command == "hash":
        print(sha256_plaintext(stdin_text))
    elif args.command == "decide":
        print(decide(stdin_text, args.expect_hash))


if __name__ == "__main__":
    main(sys.argv[1:])
