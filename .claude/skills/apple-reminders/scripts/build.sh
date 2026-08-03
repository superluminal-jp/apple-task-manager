#!/usr/bin/env bash
# Build remind-cli from main.swift. Idempotent: re-running is a no-op unless a
# source file changed.
#
# Usage:
#   bash build.sh          # build if out of date, print the binary path
#   bash build.sh --force  # rebuild unconditionally
#
# No package manifest, no lockfile, no SPM. One `swiftc` invocation over one
# source file, against a framework that ships with macOS -- the build step this
# skill accepts is a compiler call, not a dependency tree.
#
# The -sectcreate incantation is load-bearing, not boilerplate: TCC reads the
# usage description out of the running binary's __TEXT,__info_plist section.
# Without it the Reminders permission dialog never appears, and every call
# fails as "access not granted" with no way for the user to grant it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/main.swift"
PLIST="$SCRIPT_DIR/Info.plist"

# Built into the skill directory and gitignored: it is a build artifact, and a
# compiled binary has no business in a diff.
BINARY="$SCRIPT_DIR/remind-cli"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "build.sh: remind-cli requires macOS -- EventKit is a Darwin framework." >&2
  exit 1
fi

if ! command -v swiftc >/dev/null 2>&1; then
  echo "build.sh: swiftc not found. Install the Xcode Command Line Tools:" >&2
  echo "  xcode-select --install" >&2
  exit 1
fi

force=0
[ "${1:-}" = "--force" ] && force=1

if [ "$force" -eq 0 ] && [ -x "$BINARY" ] &&
  [ "$BINARY" -nt "$SOURCE" ] && [ "$BINARY" -nt "$PLIST" ]; then
  echo "$BINARY"
  exit 0
fi

swiftc "$SOURCE" -o "$BINARY" \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$PLIST"

echo "$BINARY"
