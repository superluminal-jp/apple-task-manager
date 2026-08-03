#!/usr/bin/env bash
# Behavior test for the Apple Notes / Reminders operator artifacts.
#
# Verifies the skill+subagent pairing and its placement, decided in
# docs/adr/0005-project-scoped-apple-artifacts.md:
#   - .claude/skills/apple-{notes,reminders}/  — the standing conventions and
#     the scripts, usable on their own (Codex CLI has no subagent concept).
#   - .claude/agents/apple-{notes,reminders}-operator.md — workers that preload
#     those skills and whose tool allowlist makes "does not modify repository
#     files" a property of the environment rather than an instruction.
#   - the wiring: CLAUDE.md tells the scrum-master skill — vendored here from
#     my-claude-code, which is never modified for this project — to delegate
#     data access to them, and to keep the judgement.
#
# Deterministic: inspects repository files only. No network, no `claude` CLI,
# and no macOS -- nothing here executes osascript.
# Usage: bash tests/run-apple-operators.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS="$REPO_ROOT/.claude/skills"
AGENTS="$REPO_ROOT/.claude/agents"
PROJECT_MEMORY="$REPO_ROOT/CLAUDE.md"
# The scrum-master skill is vendored here (ADR 0005), so flow_metrics.py is in
# the repository rather than wherever the user happened to install my-claude-code.
FLOW_METRICS="$SKILLS/scrum-master/scripts/flow_metrics.py"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PASS=0
FAIL=0
FAIL_NAMES=""

check() {
  local name="$1" cond="$2"
  if [ "$cond" = "1" ]; then
    PASS=$((PASS + 1))
    printf "${GREEN}PASS${NC} %s\n" "$name"
  else
    FAIL=$((FAIL + 1))
    FAIL_NAMES="$FAIL_NAMES\n  - $name"
    printf "${RED}FAIL${NC} %s\n" "$name"
  fi
}

# Extracts the YAML frontmatter block (between the first two `---` lines).
frontmatter() {
  local file="$1"
  [ -f "$file" ] || return 0
  awk 'NR==1 && $0=="---"{inside=1; next} inside && $0=="---"{exit} inside' "$file"
}

# --- The two skills ---------------------------------------------------------

for app in notes reminders; do
  SKILL="$SKILLS/apple-$app/SKILL.md"

  [ -f "$SKILL" ] && c=1 || c=0
  check "apple-$app skill exists" "$c"

  FM=$(frontmatter "$SKILL")

  echo "$FM" | grep -Eq "^name: *apple-$app *$" && c=1 || c=0
  check "apple-$app skill declares its name" "$c"

  echo "$FM" | grep -Eq '^description: *[^ ]' && c=1 || c=0
  check "apple-$app skill declares a description" "$c"

  # A skill with disable-model-invocation cannot be preloaded into a subagent,
  # which would silently break the `skills:` wiring below.
  echo "$FM" | grep -Eq '^disable-model-invocation: *true' && c=0 || c=1
  check "apple-$app skill stays preloadable (no disable-model-invocation)" "$c"

  # Scripts must resolve at either install scope; a bare relative path breaks
  # once the skill is synced to ~/.claude/skills.
  grep -q 'CLAUDE_SKILL_DIR' "$SKILL" 2>/dev/null && c=1 || c=0
  check "apple-$app skill addresses its scripts by CLAUDE_SKILL_DIR" "$c"

  # Both permission layers fail differently and neither is grantable headlessly.
  grep -qi 'Automation' "$SKILL" 2>/dev/null && c=1 || c=0
  check "apple-$app skill documents the Automation (TCC) grant" "$c"

  # The write paths refuse destructive operations by construction; the skill
  # has to say so, or a reader will route around them with inline AppleScript
  # or their own EventKit code. The two skills word it differently because
  # their backends differ ("cannot delete" vs "no delete command").
  grep -Eqi 'cannot delete|no delete command' "$SKILL" 2>/dev/null && c=1 || c=0
  check "apple-$app skill states that deletion is unavailable" "$c"

  grep -q '## Sources' "$SKILL" 2>/dev/null && c=1 || c=0
  check "apple-$app skill cites its sources" "$c"
done

# --- Scripts ----------------------------------------------------------------

for script in main.swift Info.plist build.sh scrum_block.py; do
  [ -f "$SKILLS/apple-reminders/scripts/$script" ] && c=1 || c=0
  check "apple-reminders ships $script" "$c"
done

# The JXA layer for Reminders was superseded by EventKit; leaving it would give
# two ways to do the same thing and no statement of which is current.
ls "$SKILLS/apple-reminders/scripts/"*.js >/dev/null 2>&1 && c=0 || c=1
check "the superseded JXA Reminders scripts are gone" "$c"

# TCC reads the usage description out of the running binary. Without the
# section, no permission dialog can appear and every call fails as a denial
# the user has no way to reverse -- a build defect that mimics a user choice.
grep -q 'sectcreate' "$SKILLS/apple-reminders/scripts/build.sh" 2>/dev/null &&
  grep -q '__info_plist' "$SKILLS/apple-reminders/scripts/build.sh" 2>/dev/null && c=1 || c=0
check "build.sh links Info.plist into the binary so TCC can prompt" "$c"

grep -q 'NSRemindersFullAccessUsageDescription' \
  "$SKILLS/apple-reminders/scripts/Info.plist" 2>/dev/null && c=1 || c=0
check "Info.plist carries the macOS 14+ Reminders usage description" "$c"

# macOS 14 split Reminders access into full and write-only; this tool reads.
grep -q 'requestFullAccessToReminders' \
  "$SKILLS/apple-reminders/scripts/main.swift" 2>/dev/null && c=1 || c=0
check "main.swift requests full (not write-only) Reminders access" "$c"

# No package manifest, no lockfile: the build is one compiler call.
ls "$SKILLS/apple-reminders/scripts/Package.swift" \
  "$SKILLS/apple-reminders/scripts/"*.lock >/dev/null 2>&1 && c=0 || c=1
check "the EventKit build introduces no package manifest or lockfile" "$c"

# A compiled binary must not reach a diff.
grep -q 'apple-reminders/scripts/remind-cli' "$REPO_ROOT/.gitignore" 2>/dev/null && c=1 || c=0
check "the built remind-cli binary is gitignored" "$c"

# Both identifiers are emitted: local ids do not survive an account move, and
# link markers need the server-provided one.
for field in calendarItemIdentifier calendarItemExternalIdentifier; do
  grep -q "$field" "$SKILLS/apple-reminders/scripts/main.swift" 2>/dev/null && c=1 || c=0
  check "main.swift exposes $field" "$c"
done

for script in list_notes.js write_note.js; do
  [ -f "$SKILLS/apple-notes/scripts/$script" ] && c=1 || c=0
  check "apple-notes ships $script" "$c"
done

# The parsing layer is Python precisely so it can be tested off macOS.
python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('sb', '$SKILLS/apple-reminders/scripts/scrum_block.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.exit(0 if m.parse_block('--- scrum ---\nsprint: 7\n---')[0] == {'sprint': '7'} else 1)
" >/dev/null 2>&1 && c=1 || c=0
check "scrum_block.py imports and parses a block" "$c"

# ADR 0001's whole premise: flow_metrics.py runs over Reminders data unforked.
# Both sides of that contract are now in this repository, so compare them
# directly rather than asserting a literal against an absent file.
CSV_HEADER=$(echo '[]' | python3 "$SKILLS/apple-reminders/scripts/scrum_block.py" csv 2>/dev/null)
FLOW_HEADER=$(grep -o 'item_id,started_at,completed_at' "$FLOW_METRICS" 2>/dev/null | head -1)
[ -n "$FLOW_HEADER" ] && [ "$CSV_HEADER" = "$FLOW_HEADER" ] && c=1 || c=0
check "scrum_block.py csv header matches what flow_metrics.py reads" "$c"

# ADR 0001 makes detecting items with no recorded start a required capability.
python3 "$SKILLS/apple-reminders/scripts/scrum_block.py" unstarted --help >/dev/null 2>&1 && c=1 || c=0
check "scrum_block.py exposes the unstarted-item detection" "$c"

# The write paths must not carry a deletion capability at all. Comment lines
# are stripped first: both files discuss deletion at length in order to explain
# why they refuse it, and matching that prose would assert the opposite of the
# code.
code_only() { grep -vE '^\s*//' "$1" 2>/dev/null; }

# EventKit deletes via EKEventStore.remove(_:commit:).
code_only "$SKILLS/apple-reminders/scripts/main.swift" |
  grep -Eq '\.remove\s*\(|\bremoveReminder|EKSpan' && c=0 || c=1
check "main.swift contains no deletion path" "$c"

code_only "$SKILLS/apple-reminders/scripts/main.swift" |
  grep -Eq '"delete"' && c=0 || c=1
check "remind-cli exposes no delete command" "$c"

code_only "$SKILLS/apple-notes/scripts/write_note.js" |
  grep -Eq '\.delete\s*\(|\bdelete\s*\(|\bremove\s*\(' && c=0 || c=1
check "write_note.js contains no deletion path" "$c"

# The same for whole-body replacement in Notes: every assignment to an existing
# note's body must build on its current contents, so append is the only path.
BODY_WRITES=$(code_only "$SKILLS/apple-notes/scripts/write_note.js" | grep -E 'note\.body\s*=')
[ -n "$BODY_WRITES" ] &&
  ! printf '%s\n' "$BODY_WRITES" | grep -qv 'note\.body()' && c=1 || c=0
check "write_note.js only appends, never replaces a body" "$c"

# A note body is HTML: unescaped user text would swallow the rest of the note.
grep -q 'escapeHtml' "$SKILLS/apple-notes/scripts/write_note.js" 2>/dev/null && c=1 || c=0
check "write_note.js escapes text before it enters the HTML body" "$c"

# --- The two operator subagents ---------------------------------------------

for app in notes reminders; do
  AGENT="$AGENTS/apple-$app-operator.md"

  [ -f "$AGENT" ] && c=1 || c=0
  check "apple-$app-operator subagent is defined" "$c"

  FM=$(frontmatter "$AGENT")

  echo "$FM" | grep -Eq "^name: *apple-$app-operator *$" && c=1 || c=0
  check "apple-$app-operator declares its name" "$c"

  echo "$FM" | grep -Eq '^description: *[^ ]' && c=1 || c=0
  check "apple-$app-operator declares a description so Claude can delegate" "$c"

  # The pairing decided in ADR 0004: the skill carries the conventions, the
  # subagent preloads them. Without this the subagent starts cold and blind.
  echo "$FM" | grep -A3 '^skills:' | grep -Eq "^ *- *apple-$app *$" && c=1 || c=0
  check "apple-$app-operator preloads the apple-$app skill" "$c"

  TOOLS=$(echo "$FM" | grep -E '^tools:' || true)
  [ -n "$TOOLS" ] && c=1 || c=0
  check "apple-$app-operator restricts tools via an allowlist" "$c"

  echo "$TOOLS" | grep -q 'Bash' && c=1 || c=0
  check "apple-$app-operator may run Bash (osascript needs it)" "$c"

  # "Changes Reminders/Notes, never the repository" must be structural.
  echo "$TOOLS" | grep -Eq '\bEdit\b' && c=0 || c=1
  check "apple-$app-operator cannot Edit repository files" "$c"

  echo "$TOOLS" | grep -Eq '\bWrite\b' && c=0 || c=1
  check "apple-$app-operator cannot Write repository files" "$c"

  # A subagent has no AskUserQuestion, so ambiguity must stop it, not be guessed.
  grep -qi 'cannot ask' "$AGENT" 2>/dev/null && c=1 || c=0
  check "apple-$app-operator states it cannot ask and must not guess" "$c"

  # Compression is the reason it exists.
  grep -Eqi 'never paste|not the transcript' "$AGENT" 2>/dev/null && c=1 || c=0
  check "apple-$app-operator is told to return the answer, not the dump" "$c"

  grep -qi 'delete' "$AGENT" 2>/dev/null && c=1 || c=0
  check "apple-$app-operator carries the no-delete rule" "$c"
done

# --- Placement (ADR 0005) --------------------------------------------------

# The artifacts live here, project-scoped. my-claude-code stays a reference for
# the scrum-master skill and is never modified to accommodate this project.
for agent in apple-notes-operator apple-reminders-operator; do
  [ -f "$AGENTS/$agent.md" ] && c=1 || c=0
  check "$agent lives in this repository" "$c"
done

# No installer, and nothing to install: project scope is the whole mechanism.
[ -f "$REPO_ROOT/install.sh" ] && c=0 || c=1
check "no installer is needed (artifacts are project-scoped)" "$c"

# The scrum-master skill is vendored so this repository runs without depending
# on my-claude-code having been installed. Provenance is recorded in ADR 0005;
# no sync machinery exists, by decision.
[ -f "$SKILLS/scrum-master/SKILL.md" ] && c=1 || c=0
check "the scrum-master skill is vendored here" "$c"

[ -f "$FLOW_METRICS" ] && c=1 || c=0
check "flow_metrics.py ships with the vendored skill" "$c"

# Editing the vendored copy is how a snapshot silently forks from a live
# upstream. CLAUDE.md is always loaded, so that is where the warning has to be.
grep -q 'vendor' "$PROJECT_MEMORY" 2>/dev/null && c=1 || c=0
check "CLAUDE.md flags scrum-master as a vendored snapshot" "$c"

# The zero-external-dependency constraint survived the move to EventKit.
ls "$REPO_ROOT/package.json" "$REPO_ROOT/requirements.txt" \
  "$REPO_ROOT/Package.swift" "$REPO_ROOT"/*.lock >/dev/null 2>&1 && c=0 || c=1
check "the repository carries no package manifest or lockfile" "$c"

# --- The scrum-master wiring (project memory, not the shared skill) ---------

[ -f "$PROJECT_MEMORY" ] && c=1 || c=0
check "CLAUDE.md carries the project wiring" "$c"

for agent in apple-notes-operator apple-reminders-operator; do
  grep -q "$agent" "$PROJECT_MEMORY" 2>/dev/null && c=1 || c=0
  check "CLAUDE.md routes data access to $agent" "$c"
done

# Delegation is for data access only; the inspection stays with scrum-master.
grep -q '判断は委譲しない' "$PROJECT_MEMORY" 2>/dev/null && c=1 || c=0
check "CLAUDE.md delegates data access but not judgement" "$c"

# Items with no recorded start fall out of Cycle Time; reporting a median
# without saying so is exactly the transparency failure scrum-master exists
# to name.
grep -q '着手記録のない項目' "$PROJECT_MEMORY" 2>/dev/null && c=1 || c=0
check "CLAUDE.md requires reporting items missing from the flow data" "$c"

# The inspector is not automatic -- README section 4's constraint still holds,
# and pretending otherwise would be the "doing Scrum" self-deception the
# design exists to avoid.
grep -Eq '自動で|明示' "$PROJECT_MEMORY" 2>/dev/null && c=1 || c=0
check "CLAUDE.md states the inspector must be invoked explicitly" "$c"

# --- No hook can see an EventKit call; the rule has to be self-applied ------

grep -qi 'delete' "$PROJECT_MEMORY" 2>/dev/null && c=1 || c=0
check "CLAUDE.md states deletion stays a human action" "$c"

echo
if [ "$FAIL" -eq 0 ]; then
  printf "${GREEN}All %d checks passed.${NC}\n" "$PASS"
  exit 0
else
  printf "${RED}%d passed, %d failed:${NC}" "$PASS" "$FAIL"
  printf "%b\n" "$FAIL_NAMES"
  exit 1
fi
