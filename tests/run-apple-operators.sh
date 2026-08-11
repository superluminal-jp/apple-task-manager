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

  # Reminders still refuses destructive operations by construction -- the
  # skill has to say so, or a reader will route around it with their own
  # EventKit code. Notes no longer refuses unconditionally (ADR 0007,
  # Constitution v2.0.0 Principle I): it permits overwrite/delete under a
  # hash gate, and the skill must document that gate instead of claiming the
  # old absolute prohibition.
  if [ "$app" = "reminders" ]; then
    grep -Eqi 'no delete command' "$SKILL" 2>/dev/null && c=1 || c=0
    check "apple-$app skill states that deletion is unavailable" "$c"
  else
    grep -Eqi -- '--expect-hash' "$SKILL" 2>/dev/null && c=1 || c=0
    check "apple-$app skill documents the hash-gated overwrite/delete (ADR 0007)" "$c"
  fi

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

REMINDERS_SWIFT="$SKILLS/apple-reminders/scripts/main.swift"

grep -q 'case "ensure-list"' "$REMINDERS_SWIFT" 2>/dev/null && c=1 || c=0
check "remind-cli exposes ensure-list" "$c"

grep -q 'trimmingCharacters(in: .whitespacesAndNewlines)' \
  "$REMINDERS_SWIFT" 2>/dev/null &&
  grep -Eq 'must be non-empty|cannot be empty' "$REMINDERS_SWIFT" 2>/dev/null && c=1 || c=0
check "ensure-list trims and rejects an empty list name" "$c"

grep -q 'matches.count' "$REMINDERS_SWIFT" 2>/dev/null &&
  grep -Eq 'ambiguous|matches .* lists' "$REMINDERS_SWIFT" 2>/dev/null && c=1 || c=0
check "ensure-list reuses one exact match and rejects ambiguity" "$c"

grep -q 'EKCalendar(for: .reminder, eventStore: store)' \
  "$REMINDERS_SWIFT" 2>/dev/null && c=1 || c=0
check "ensure-list creates the official EventKit reminder calendar type" "$c"

grep -q 'defaultCalendarForNewReminders()?.source' \
  "$REMINDERS_SWIFT" 2>/dev/null && c=1 || c=0
check "ensure-list uses the configured default reminder source" "$c"

grep -q 'saveCalendar(calendar, commit: true)' \
  "$REMINDERS_SWIFT" 2>/dev/null && c=1 || c=0
check "ensure-list commits one calendar immediately" "$c"

grep -q 'struct ReminderListJSON' "$REMINDERS_SWIFT" 2>/dev/null &&
  grep -q 'let created: Bool' "$REMINDERS_SWIFT" 2>/dev/null && c=1 || c=0
check "ensure-list emits a typed result with the created flag" "$c"

grep -vE '^\s*//' "$REMINDERS_SWIFT" 2>/dev/null |
  grep -Eq 'removeCalendar\s*\(' && c=0 || c=1
check "main.swift contains no reminder-list deletion path" "$c"

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

NOTES_ENSURE="$SKILLS/apple-notes/scripts/ensure_folder.js"
[ -f "$NOTES_ENSURE" ] && c=1 || c=0
check "apple-notes ships ensure_folder.js" "$c"

grep -q 'defaultAccount' "$NOTES_ENSURE" 2>/dev/null && c=1 || c=0
check "ensure_folder.js scopes creation to the Notes default account" "$c"

grep -q '\.trim()' "$NOTES_ENSURE" 2>/dev/null &&
  grep -Eq 'empty|non-empty|required' "$NOTES_ENSURE" 2>/dev/null && c=1 || c=0
check "ensure_folder.js trims and rejects an empty folder name" "$c"

grep -q 'matches.length === 1' "$NOTES_ENSURE" 2>/dev/null &&
  grep -q 'matches.length > 1' "$NOTES_ENSURE" 2>/dev/null && c=1 || c=0
check "ensure_folder.js reuses one exact match and rejects ambiguity" "$c"

grep -q 'app.Folder' "$NOTES_ENSURE" 2>/dev/null &&
  grep -Eq 'folders\.push|folders\.unshift' "$NOTES_ENSURE" 2>/dev/null && c=1 || c=0
check "ensure_folder.js creates one folder through the Notes folder element" "$c"

grep -q 'created' "$NOTES_ENSURE" 2>/dev/null &&
  grep -q 'JSON.stringify' "$NOTES_ENSURE" 2>/dev/null && c=1 || c=0
check "ensure_folder.js reports idempotence as machine-readable JSON" "$c"

grep -vE '^\s*//' "$NOTES_ENSURE" 2>/dev/null |
  grep -Eq '\.delete\s*\(|\bdelete\s*\(|\bremove\s*\(' && c=0 || c=1
check "ensure_folder.js contains no folder deletion path" "$c"

# --- Reusable Scrum workspace templates -----------------------------------

SCRUM_TEMPLATES="$REPO_ROOT/scrum/templates"
for template in product-goal definition-of-done sprint-planning daily-scrum \
  sprint-review sprint-retrospective impediment-log decision-rights; do
  FILE="$SCRUM_TEMPLATES/$template.md"
  [ -f "$FILE" ] && c=1 || c=0
  check "Scrum workspace ships $template template" "$c"

  grep -q '［記入］' "$FILE" 2>/dev/null && c=1 || c=0
  check "$template template uses placeholders instead of invented facts" "$c"
done

# Templates are Markdown now (spec 006) -- .txt must be gone, not just .md present.
ls "$SCRUM_TEMPLATES"/*.txt >/dev/null 2>&1 && c=0 || c=1
check "no .txt templates remain in scrum/templates (spec 006 Markdown migration)" "$c"

for template in product-goal definition-of-done sprint-planning daily-scrum \
  sprint-review sprint-retrospective; do
  grep -q '分類: Scrum定義' "$SCRUM_TEMPLATES/$template.md" 2>/dev/null && c=1 || c=0
  check "$template identifies its Scrum-defined basis" "$c"
done

for template in impediment-log decision-rights; do
  grep -q '分類: 補助プラクティス' "$SCRUM_TEMPLATES/$template.md" 2>/dev/null &&
    grep -q '必須' "$SCRUM_TEMPLATES/$template.md" 2>/dev/null && c=1 || c=0
  check "$template is clearly supplemental rather than mandatory Scrum" "$c"
done

# Active templates use the supported Bulleted List marker. A leading dash is
# Notes' distinct Dashed List request and must not be approximated as bullets.
grep -qE '^\* ' "$SCRUM_TEMPLATES/definition-of-done.md" 2>/dev/null && c=1 || c=0
check "definition-of-done template uses supported Bulleted List syntax" "$c"

grep -R -qE '^- |^- \[[ xX]\]' "$SCRUM_TEMPLATES" 2>/dev/null && c=0 || c=1
check "active Scrum templates contain no unsupported Dashed List or Checklist markers" "$c"

# Confirmed by live experiment (specs/006-notes-template-format-fix/research.md
# "Root cause, corrected"): passing `name` to app.Note() alongside a body that
# already starts with <h1>{title}</h1> makes Notes.app inject its own extra
# plain-text title line -- this is the actual cause of every reported doubled
# title, independent of what --text contains. create() must construct the
# note from `body` alone.
grep -q 'app.Note({ body: body })' "$SKILLS/apple-notes/scripts/write_note.js" 2>/dev/null && c=1 || c=0
check "create() does not pass name alongside body (avoids Notes' own title-duplication)" "$c"

grep -q 'function dedupTitleLine' "$SKILLS/apple-notes/scripts/write_note.js" 2>/dev/null && c=1 || c=0
check "write_note.js exposes dedupTitleLine for a caller-repeated title line" "$c"

grep -q 'function linesToBodyHtml' "$SKILLS/apple-notes/scripts/write_note.js" 2>/dev/null && c=1 || c=0
check "write_note.js exposes linesToBodyHtml for Markdown-list checklist rendering" "$c"

grep -q 'function validateNotesMarkdown' "$SKILLS/apple-notes/scripts/write_note.js" 2>/dev/null &&
  grep -q 'function markdownToNotesHtml' "$SKILLS/apple-notes/scripts/write_note.js" 2>/dev/null &&
  grep -q 'function firstVisibleLine' "$SKILLS/apple-notes/scripts/write_note.js" 2>/dev/null && c=1 || c=0
check "write_note.js exposes pure validation, Markdown conversion, and visible-name helpers" "$c"

grep -q 'Product Backlog' "$REPO_ROOT/README.md" 2>/dev/null &&
  grep -q 'Sprint Backlog' "$REPO_ROOT/README.md" 2>/dev/null &&
  grep -q 'scrum/templates' "$REPO_ROOT/README.md" 2>/dev/null && c=1 || c=0
check "README documents the prepared Scrum workspace topology" "$c"

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
  grep -E '\.remove\s*\(|\bremoveReminder|EKSpan' >/dev/null && c=0 || c=1
check "main.swift contains no deletion path" "$c"

code_only "$SKILLS/apple-reminders/scripts/main.swift" |
  grep -E '"delete"' >/dev/null && c=0 || c=1
check "remind-cli exposes no delete command" "$c"

# Reminders still carries no deletion path at all (unchanged by ADR 0007,
# which is Notes-only -- spec 005's FR-012/Assumptions explicitly keep
# Reminders out of scope).
code_only "$SKILLS/apple-reminders/scripts/main.swift" |
  grep -E '\bdelete\s*\(' >/dev/null && c=0 || c=1
check "apple-reminders scripts carry no deletion path" "$c"

# Notes now has a deletion path (ADR 0007), but it must be reachable only via
# app.delete(note) -- the JXA idiom this script uses -- and never bypassed.
code_only "$SKILLS/apple-notes/scripts/write_note.js" |
  grep -E 'app\.delete\(note\)' >/dev/null && c=1 || c=0
check "write_note.js's deletion path uses the app.delete(note) JXA idiom" "$c"

NOTES_WRITE_SCRIPT="$SKILLS/apple-notes/scripts/write_note.js"

# Both new destructive operations (overwrite, delete) must check the hash
# gate (guardDecide) and fail closed before touching the note -- never skip
# straight to the write/delete on a caller's say-so alone.
guard_precedes_action() {
  local func_start="$1" action="$2"
  awk -v start="$func_start" -v action="$action" '
    $0 ~ start { infunc=1 }
    infunc && /guardDecide\(/ { saw_guard=1 }
    infunc && saw_guard && /!== .allow./ { saw_check=1 }
    infunc && $0 ~ action {
      if (saw_guard && saw_check) print "1"; else print "0"
      exit
    }
    infunc && /^}/ { infunc=0 }
  ' "$NOTES_WRITE_SCRIPT"
}

conversion_precedes_action() {
  local func_start="$1" action="$2"
  awk -v start="$func_start" -v action="$action" '
    $0 ~ start { infunc=1 }
    infunc && /markdownToNotesHtml/ { converted=1 }
    infunc && $0 ~ action { print converted ? "1" : "0"; exit }
    infunc && /^}/ { infunc=0 }
  ' "$NOTES_WRITE_SCRIPT"
}

[ "$(conversion_precedes_action '^function create' 'folder\.notes\.push')" = "1" ] && c=1 || c=0
check "create() converts and validates Markdown before creating a Notes record" "$c"

[ "$(conversion_precedes_action '^function overwrite' 'note\.name =')" = "1" ] && c=1 || c=0
check "overwrite() converts and validates Markdown before assigning note fields" "$c"

[ "$(guard_precedes_action '^function overwrite' 'note\\.body =')" = "1" ] && c=1 || c=0
check "overwrite() checks the hash gate and fails closed before writing the new body" "$c"

[ "$(guard_precedes_action '^function deleteNote' 'app\\.delete\\(note\\)')" = "1" ] && c=1 || c=0
check "deleteNote() checks the hash gate and fails closed before deleting" "$c"

# The same for whole-body replacement in Notes: every OTHER assignment to an
# existing note's body (append, --replace-block) must still be derived from
# its current contents -- either inline (`note.body = note.body() + ...`) or
# via a variable this file built from a `const body = note.body()` read.
# The overwrite assignment from a precomputed converted body is the one
# deliberate exception -- a caller-supplied whole-new-body -- and its safety
# is checked separately above (the hash gate), not by derivation from the old
# body (there is none; that's the point of an overwrite).
BODY_WRITES=$(code_only "$NOTES_WRITE_SCRIPT" | grep -E 'note\.body\s*=')
BODY_WRITES_SAFE=1
if [ -z "$BODY_WRITES" ]; then
  BODY_WRITES_SAFE=0
else
  while IFS= read -r line; do
    case "$line" in
    *'note.body()'*) ;;               # reads and writes in the same statement
    *'note.body = convertedHtml'*) ;; # the gated overwrite path, checked above
    *'note.body = newBody'*)
      grep -q 'const body = note\.body()' "$NOTES_WRITE_SCRIPT" 2>/dev/null || BODY_WRITES_SAFE=0
      ;;
    *) BODY_WRITES_SAFE=0 ;;
    esac
  done <<<"$BODY_WRITES"
fi
[ "$BODY_WRITES_SAFE" = "1" ] && c=1 || c=0
check "write_note.js's append/replace-block paths still derive from the existing body" "$c"

# A note body is HTML: unescaped user text would swallow the rest of the note.
grep -q 'escapeHtml' "$SKILLS/apple-notes/scripts/write_note.js" 2>/dev/null && c=1 || c=0
check "write_note.js escapes text before it enters the HTML body" "$c"

# Notes exposes a `container` property in its dictionary, but JXA cannot resolve
# it for an otherwise valid note specifier (`Can't get object`). A write has
# already happened by the time result formatting reaches that property, so using
# it turns success into a false failure and invites a duplicate retry.
for script in list_notes.js write_note.js; do
  code_only "$SKILLS/apple-notes/scripts/$script" |
    grep -E 'note\.container' >/dev/null && c=0 || c=1
  check "$script does not resolve a note folder through note.container" "$c"

  grep -q 'folderNameForId' "$SKILLS/apple-notes/scripts/$script" 2>/dev/null && c=1 || c=0
  check "$script can resolve folder membership from a note id" "$c"
done

grep -q 'notes\.id()' "$SKILLS/apple-notes/scripts/list_notes.js" 2>/dev/null && c=1 || c=0
check "list_notes.js matches note ids against folder membership" "$c"

grep -q 'notes\.id()' "$SKILLS/apple-notes/scripts/write_note.js" 2>/dev/null && c=1 || c=0
check "write_note.js matches appended note ids against folder membership" "$c"

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

# --- Multi-project support (spec 004, ADR 0006) -----------------------------

PROJECT_REGISTRY="$SKILLS/apple-notes/scripts/project_registry.py"
[ -f "$PROJECT_REGISTRY" ] && c=1 || c=0
check "apple-notes ships project_registry.py" "$c"

for sub in '"resolve"' '"list"' '"current"' '"register"' '"set-current"'; do
  grep -q "add_parser($sub" "$PROJECT_REGISTRY" 2>/dev/null && c=1 || c=0
  check "project_registry.py exposes the $sub subcommand" "$c"
done

# The registry has no rename or delete event type by design (docs/adr/0006).
grep -vE '^\s*#' "$PROJECT_REGISTRY" 2>/dev/null |
  grep -Eq '"rename"|"delete"|"unregister"' && c=0 || c=1
check "project_registry.py exposes no rename/delete/unregister event" "$c"

grep -q 'class RegistryError' "$PROJECT_REGISTRY" 2>/dev/null &&
  grep -q 'unterminated' "$PROJECT_REGISTRY" 2>/dev/null && c=1 || c=0
check "project_registry.py refuses an unterminated block rather than guessing" "$c"

# --- Notes subfolder support (ensure_folder.js --parent-id, spec 004 US5) ---

grep -q -- '--parent-id' "$NOTES_ENSURE" 2>/dev/null && c=1 || c=0
check "ensure_folder.js accepts --parent-id" "$c"

grep -q 'app.folders.byId' "$NOTES_ENSURE" 2>/dev/null && c=1 || c=0
check "ensure_folder.js resolves a parent folder by id" "$c"

grep -q 'ensureInParent' "$NOTES_ENSURE" 2>/dev/null &&
  grep -q 'parent.folders()' "$NOTES_ENSURE" 2>/dev/null && c=1 || c=0
check "ensure_folder.js scopes parent-mode matching to that folder's children" "$c"

grep -q 'ambiguous under parent' "$NOTES_ENSURE" 2>/dev/null && c=1 || c=0
check "ensure_folder.js reports parent-scoped ambiguity distinctly" "$c"

# --- Project resolution wiring in both operators (spec 004, contracts/project-resolution.md) ---

for app in notes reminders; do
  AGENT="$AGENTS/apple-$app-operator.md"

  grep -q '## Project resolution' "$AGENT" 2>/dev/null && c=1 || c=0
  check "apple-$app-operator documents project resolution" "$c"

  grep -qi 'Explicit name' "$AGENT" 2>/dev/null &&
    grep -qi 'Current project' "$AGENT" 2>/dev/null &&
    grep -qi 'Refuse' "$AGENT" 2>/dev/null && c=1 || c=0
  check "apple-$app-operator states the resolution order (name -> current -> refuse)" "$c"

  grep -qi "never touch another project" "$AGENT" 2>/dev/null && c=1 || c=0
  check "apple-$app-operator states the cross-project isolation rule" "$c"
done

grep -qi 'exactly one resolved project' "$AGENTS/apple-reminders-operator.md" 2>/dev/null && c=1 || c=0
check "apple-reminders-operator scopes flow metrics to one resolved project" "$c"

grep -qi 'list group' "$AGENTS/apple-reminders-operator.md" 2>/dev/null && c=1 || c=0
check "apple-reminders-operator states Reminders list grouping is unsupported" "$c"

grep -qi 'list group' "$SKILLS/apple-reminders/SKILL.md" 2>/dev/null &&
  grep -q '683611' "$SKILLS/apple-reminders/SKILL.md" 2>/dev/null && c=1 || c=0
check "apple-reminders SKILL.md documents the EventKit list-group limitation with its source" "$c"

grep -q 'project_registry.py' "$SKILLS/apple-notes/SKILL.md" 2>/dev/null && c=1 || c=0
check "apple-notes SKILL.md documents project_registry.py" "$c"

grep -qi 'Sprint subfolder' "$SKILLS/apple-notes/SKILL.md" 2>/dev/null &&
  grep -q 'Definition of Done' "$SKILLS/apple-notes/SKILL.md" 2>/dev/null && c=1 || c=0
check "apple-notes SKILL.md documents Sprint subfolders and the standing-artifact root rule" "$c"

grep -q '複数プロジェクト' "$PROJECT_MEMORY" 2>/dev/null && c=1 || c=0
check "CLAUDE.md documents multi-project resolution delegation" "$c"

# --- write_note.js --folder-id and ambiguity refusal (found during live verification) ---

NOTES_WRITE="$SKILLS/apple-notes/scripts/write_note.js"

grep -q -- '--folder-id' "$NOTES_WRITE" 2>/dev/null && c=1 || c=0
check "write_note.js accepts --folder-id" "$c"

grep -q 'matches.length > 1' "$NOTES_WRITE" 2>/dev/null &&
  grep -qi 'ambiguous' "$NOTES_WRITE" 2>/dev/null && c=1 || c=0
check "write_note.js refuses an ambiguous --folder name match" "$c"

grep -qi 'folder-id' "$SKILLS/apple-notes/SKILL.md" 2>/dev/null && c=1 || c=0
check "apple-notes SKILL.md documents --folder-id for colliding folder names" "$c"

grep -qi 'folder-id' "$AGENTS/apple-notes-operator.md" 2>/dev/null && c=1 || c=0
check "apple-notes-operator is told to use --folder-id for Sprint subfolders" "$c"

# --- write_note.js --replace-block (targeted in-place editing) -------------

grep -q -- '--replace-block' "$NOTES_WRITE" 2>/dev/null && c=1 || c=0
check "write_note.js accepts --replace-block" "$c"

for flag in '--replace ' '--replace-stdin' '--replace-html'; do
  grep -q -- "$flag" "$NOTES_WRITE" 2>/dev/null && c=1 || c=0
  check "write_note.js's --replace-block accepts content via $flag" "$c"
done

# Creates the block if absent (upsert), same posture as scrum_block.py's
# render_block -- a caller should not have to know whether this is the first
# write.
grep -q 'findBlock' "$NOTES_WRITE" 2>/dev/null &&
  grep -Eq 'match === null' "$NOTES_WRITE" 2>/dev/null && c=1 || c=0
check "write_note.js creates a named block on first write (upsert)" "$c"

# Refuses rather than guesses on an unterminated or duplicated block, the same
# posture scrum_block.py already takes for the Reminders side.
grep -qi 'unterminated block' "$NOTES_WRITE" 2>/dev/null && c=1 || c=0
check "write_note.js refuses an unterminated named block" "$c"

grep -qi 'block name is ambiguous' "$NOTES_WRITE" 2>/dev/null && c=1 || c=0
check "write_note.js refuses a duplicated named block" "$c"

grep -qi 'replace-block' "$SKILLS/apple-notes/SKILL.md" 2>/dev/null && c=1 || c=0
check "apple-notes SKILL.md documents --replace-block" "$c"

echo
if [ "$FAIL" -eq 0 ]; then
  printf "${GREEN}All %d checks passed.${NC}\n" "$PASS"
  exit 0
else
  printf "${RED}%d passed, %d failed:${NC}" "$PASS" "$FAIL"
  printf "%b\n" "$FAIL_NAMES"
  exit 1
fi
