---

description: "Task list for 006-notes-template-format-fix"
---

# Tasks: Scrumテンプレートの Markdown 化と Notes 表示不具合の修正

**Input**: Design documents from `/specs/006-notes-template-format-fix/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/note-body-conversion.md, quickstart.md

**Tests**: Included and REQUIRED — this project's constitution (Principle III, NON-NEGOTIABLE) mandates a failing platform-independent test before every behavior change; this overrides the generic "tests optional" default.

**Organization**: Tasks are grouped by user story (spec.md priorities). US1 and US2 are both P1 and share the same two touched functions in `write_note.js`, so they are implemented together behind one pair of red→green commits per function, then verified independently per their own Independent Test criteria. US3 (Markdown templates) has no code dependency on US1/US2 and could be done first or in parallel — ordered after here only because the templates themselves become the realistic acceptance-test input for US1/US2's live-app check (quickstart.md §3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3 — maps to spec.md's three user stories

## Path Conventions

Single project, no `src/` — scripts live under `.claude/skills/apple-notes/scripts/`, tests under `tests/`, templates under `scrum/templates/` (see plan.md § Project Structure).

---

## Phase 1: Setup

**Purpose**: Establish the new deterministic test harness both US1 and US2 will write failing tests into. No behavior changes in this phase.

- [X] T001 Create `tests/test_note_body_conversion.js`: a Node-executable harness that reads `.claude/skills/apple-notes/scripts/write_note.js` as text, extracts the pure functions this feature will add (`dedupTitleLine`, `linesToBodyHtml` — names fixed here so T004/T008 implement exactly these), and exposes a way to invoke them in-process without `ObjC`/`Application`. Start with zero test cases — just the extraction/eval plumbing and a `console.log('no tests yet')` placeholder, so T002 has something to run.
- [X] T002 [P] Create `tests/run-note-body-conversion.sh`, mirroring `tests/run-note-write-guard.sh`'s structure (shebang, `set -uo pipefail`, comment block stating it needs no macOS/network/`claude` CLI, `node tests/test_note_body_conversion.js`, correct exit code propagation). Confirm it runs and exits 0 against T001's placeholder.

**Checkpoint**: `bash tests/run-note-body-conversion.sh` runs cleanly with no real assertions yet.

---

## Phase 2: Foundational

**Purpose**: No shared blocking infrastructure beyond Phase 1 — `write_note.js`'s existing `parseArgs`/`create`/`toHtml` are the only shared code US1 and US2 both touch, and each user story's tasks below already sequence red-before-green on those exact functions. Phase intentionally minimal.

**Checkpoint**: Proceed directly to Phase 3.

---

## Phase 3: User Story 1 - タイトルが一度だけ表示される (Priority: P1) 🎯 MVP

**Goal**: `create()`'s output never shows the title twice, per `contracts/note-body-conversion.md` Rule 1.

**Independent Test**: Feed `create()`'s conversion path a title and a body whose first line exactly repeats it; assert the rendered HTML contains the title text once. Feed a non-matching first line; assert it is preserved.

### Tests for User Story 1 ⚠️ Write first, confirm they FAIL

- [X] T003 [P] [US1] In `tests/test_note_body_conversion.js`, add cases for `dedupTitleLine(title, rawText)` per contract Rule 1's three example rows (exact-match first line dropped; no match unchanged; near-match `Definition of Done（上高地日帰り撮影）` unchanged). Run `bash tests/run-note-body-conversion.sh` and confirm it fails (function does not exist yet).

### Implementation for User Story 1

- [X] T004 [US1] In `.claude/skills/apple-notes/scripts/write_note.js`, add `dedupTitleLine(title, rawText)`: split on `\n`, compare the trimmed first line to the trimmed title with strict equality, drop that line (and its trailing newline) on match, else return `rawText` unchanged. Pure function, no `ObjC`/`Application` calls.
- [X] T005 [US1] In `parseArgs()`, stop discarding the caller's raw string for `--text`/`--text-stdin`: keep it on `opts.rawText` in addition to (or instead of, restructure as needed) the immediately-converted `opts.html`, so `create()` has the pre-HTML string `dedupTitleLine` needs. `--html` (raw HTML) is untouched — it has no `rawText` counterpart and stays out of scope (spec Assumptions).
- [X] T006 [US1] In `create()`, when `opts.rawText` is present, call `dedupTitleLine(opts.title, opts.rawText)` before building `body`, and feed the result into the (still-to-be-updated-by-US2) HTML conversion step instead of the pre-computed `opts.html`. When only raw `--html` was given, behavior is unchanged.
- [X] T007 [US1] Run `bash tests/run-note-body-conversion.sh`; confirm T003's cases now pass (green).

**Checkpoint**: Title dedup works in isolation, verified deterministically. User Story 1 is independently complete even before US2's list rendering exists — a body with no `- ` lines still gets today's per-line `<div>` rendering, just without the duplicated first line.

---

## Phase 4: User Story 2 - チェックリストが読みやすく区切られる (Priority: P1)

**Goal**: A maximal run of `- `-prefixed lines renders as `<ul><li>...</li></ul>`; everything else keeps today's `<div>`-per-line rendering, per `contracts/note-body-conversion.md` Rule 2.

**Independent Test**: Feed the conversion path a body with a `- ` run plus surrounding plain lines; assert the run becomes one `<ul>` with one `<li>` per item, in order, and the surrounding lines are still individual `<div>`s.

### Tests for User Story 2 ⚠️ Write first, confirm they FAIL

- [X] T008 [P] [US2] In `tests/test_note_body_conversion.js`, add cases for `linesToBodyHtml(text)` per contract Rule 2's three examples: (a) plain lines with no `- ` prefix render unchanged (one `<div>` each, matching today's `toHtml()` output byte-for-byte); (b) a `- ` run of 3 items renders as one `<ul>` with 3 `<li>`s; (c) the mixed paragraph/checklist/paragraph example renders with the checklist as one `<ul>` between two `<div>` groups, in order. Confirm the suite fails (function does not exist yet).

### Implementation for User Story 2

- [X] T009 [US2] In `write_note.js`, add `linesToBodyHtml(text)`: split on `\n`; walk the lines, buffering a maximal run of trimmed lines starting with `- ` into one `<ul>` of `<li>{escapeHtml(rest)}</li>` (reusing the existing `escapeHtml`), and every other line into `<div>{escapeHtml(line)}</div>` / `<div><br></div>` for blank lines exactly as today's `toHtml()` does. This function replaces `toHtml()`'s per-line-to-`<div>` body for the `--text`/`--text-stdin` path; `toHtml()` itself stays as-is for any other caller (if any remain after T005/T006's restructure) so `--append`/`--replace-block` output is provably unchanged.
- [X] T010 [US2] Wire `create()` (from T006) to run `linesToBodyHtml` on the post-`dedupTitleLine` text instead of the old pre-computed `opts.html`, so Rule 1 and Rule 2 apply in sequence in that order (dedup first, since a stripped title line must not become a spurious empty `<div>` before the list scan).
- [X] T011 [US2] Run `bash tests/run-note-body-conversion.sh`; confirm all T008 + T003 cases pass together (green), including that T003's dedup cases still pass now that `create()`'s pipeline has both steps wired.

**Checkpoint**: Both P1 stories are green under the deterministic suite. This is the MVP the spec's Success Criteria (SC-001, SC-002) describe.

---

## Phase 5: User Story 3 - テンプレートがMarkdownで保守される (Priority: P2)

**Goal**: `scrum/templates/*.md` replace `*.txt`, using `- ` for checklist fill-in sections (valid input to US2's Rule 2 with no translation step) and Markdown headings where the template has section titles; content and placeholders unchanged (FR-007).

**Independent Test**: List `scrum/templates/`; confirm 8 `.md` files, no `.txt` files, and that content (classification line, description, placeholders) matches the pre-migration `.txt` files 1:1 aside from format.

### Tests for User Story 3 ⚠️ Write first, confirm they FAIL

- [X] T012 [US3] Update `tests/run-apple-operators.sh`'s "Reusable Scrum workspace templates" section (`SCRUM_TEMPLATES` loop, currently checking `$template.txt`): change the extension to `.md`, keep the existing `［記入］` / `分類: Scrum定義` / `分類: 補助プラクティス` / `必須` content checks as-is (content is preserved per FR-007, only the extension and internal Markdown syntax change). Run `bash tests/run-apple-operators.sh`; confirm the template-related checks now fail (files are still `.txt`).

### Implementation for User Story 3

- [X] T013 [P] [US3] Convert `scrum/templates/product-goal.txt` → `product-goal.md`: same content, section titles become `##` headings, any checklist-style fill-in section uses `- ` per item. Delete the `.txt` file (git mv, not copy-and-leave).
- [X] T014 [P] [US3] Convert `scrum/templates/definition-of-done.txt` → `definition-of-done.md` the same way — this is the template whose checklist section is the one already exercised end-to-end in quickstart.md §3.
- [X] T015 [P] [US3] Convert `scrum/templates/sprint-planning.txt` → `sprint-planning.md`.
- [X] T016 [P] [US3] Convert `scrum/templates/daily-scrum.txt` → `daily-scrum.md`.
- [X] T017 [P] [US3] Convert `scrum/templates/sprint-review.txt` → `sprint-review.md`.
- [X] T018 [P] [US3] Convert `scrum/templates/sprint-retrospective.txt` → `sprint-retrospective.md`.
- [X] T019 [P] [US3] Convert `scrum/templates/impediment-log.txt` → `impediment-log.md`.
- [X] T020 [P] [US3] Convert `scrum/templates/decision-rights.txt` → `decision-rights.md`.
- [X] T021 [US3] Run `bash tests/run-apple-operators.sh`; confirm T012's updated checks now pass (green) and no other check regressed.
- [X] T022 [US3] Grep the repo for `scrum/templates/.*\.txt` outside `specs/**` (historical spec/plan documents under `specs/002-scrum-resource-setup/` describe what was built at that time and are not rewritten — see plan.md's Documentation note) and update any live documentation reference found (expected: none beyond the directory mention already present in README.md, per earlier investigation — this task is the verification, not a blind find-and-replace).

**Checkpoint**: All three user stories are independently green. `scrum/templates/` is fully Markdown; note creation from a filled-in template produces a single title and a real bulleted checklist.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation sync (Live Documentation rule) and final full-suite verification.

- [X] T023 [P] Update `.claude/skills/apple-notes/SKILL.md`'s `write_note.js` section: document that `--text`/`--text-stdin` now (a) drops a first line that exactly repeats `--title`, and (b) renders `- `-prefixed line runs as a real bulleted list — cite `contracts/note-body-conversion.md`-equivalent examples inline, consistent with how the existing `--replace-block` section is documented.
- [X] T024 [P] Update `README.md`'s `scrum/templates/` mention (§ "Notes用の再利用可能な本文は...") and its "検証状態（正直に）" section: add the new `tests/run-note-body-conversion.sh` suite with its actual case count once T011 is green, alongside the existing `tests/run-apple-operators.sh` entry (update that entry's stated case count too, since T012 added checks).
- [X] T025 Run the full deterministic suite in order: `bash tests/run-scrum-block.sh && bash tests/run-flow-metrics.sh && bash tests/run-apple-operators.sh && bash tests/run-scrum-role-agents.sh && bash tests/run-project-registry.sh && bash tests/run-note-write-guard.sh && bash tests/run-note-body-conversion.sh`. All MUST pass — this is a regression check that nothing outside this feature's scope broke.
- [X] T026 Perform the live-app scenario in `quickstart.md` §3 on macOS with Notes.app and an Automation grant available; report which of static/live evidence was obtained, per Constitution III and quickstart.md §4. If macOS/Notes.app is unavailable in this environment, state that explicitly rather than claiming it was verified.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Empty; nothing blocks Phase 3.
- **US1 (Phase 3)**: Depends on Phase 1 (needs the test harness). No dependency on US2 or US3.
- **US2 (Phase 4)**: Depends on Phase 1. T009-T011 build on the `create()` wiring T006 introduced in US1 (both stories touch the same `create()` call site), so in practice implement US1 fully before starting US2's implementation tasks, even though the two stories are conceptually independent and each has its own contract rule and test cases.
- **US3 (Phase 5)**: Depends on Phase 1 only for T012 (edits the shared `run-apple-operators.sh`); T013-T020 (the actual `.txt` → `.md` conversions) have no code dependency on US1/US2 and could run in parallel with Phase 3/4 if staffed separately — ordered after here because T014's converted `definition-of-done.md` is the natural live-app input for T026.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T001 and T002 are sequential (T002 needs T001's file to exist), not parallel despite both being Setup.
- T013-T020 (the 8 template conversions) are fully parallel — independent files.
- T023 and T024 (doc updates) are parallel — independent files — but both depend on T011/T021's green state to describe accurately.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup).
2. Phase 3 (US1) only — title dedup, verified deterministically.
3. **STOP and VALIDATE**: `bash tests/run-note-body-conversion.sh` green for T003's cases; `create()` no longer duplicates a repeated title even with today's un-migrated `.txt` templates as input.
4. This alone resolves the single most visible symptom in the reported bug (spec SC-001) and is safe to ship independently of US2/US3.

### Incremental Delivery

1. Phase 1 → Phase 3 (US1) → validate → optionally stop here.
2. Add Phase 4 (US2) → validate → checklist rendering fixed (SC-002).
3. Add Phase 5 (US3) → validate → templates are Markdown (SC-003, SC-004).
4. Phase 6 → docs synced, full regression, live-app evidence reported.

## Notes

- Every implementation task in US1/US2 is preceded by a test task in the same phase that must be run and observed failing first (Constitution III, NON-NEGOTIABLE) — do not skip the "confirm it fails" step even though it is not its own numbered task line; it is stated inline in T003/T008 and re-affirmed in Phase Notes here.
- `--append`, `--append-stdin`, `--append-html`, `--replace-block`, and raw `--html` are not touched by any task above — if a task appears to require changing one of them, stop and re-check against spec.md Assumptions before proceeding.

## Post-implementation correction (found during T026's live-app check)

T006's original scope ("call `dedupTitleLine` before building `body`") did not
by itself eliminate the reported duplication. Live-app testing during T026
isolated the actual cause: `create()` was passing **both** `name: opts.title`
and a `body` starting with `<h1>{title}</h1>` to `app.Note({...})`, and
Notes.app injects its own plain `name`-derived title line unconditionally
whenever `name` is set — independent of `body` content. T006 was extended,
within its existing scope (still just `create()`'s body-construction call), to
also stop passing `name`. `dedupTitleLine`/T004 remain necessary as defense in
depth for a caller who separately repeats the title inside `--text`. See
research.md "Root cause, corrected" for the three-note experiment that found
this, and T023/T024 (already covering `SKILL.md`/README updates) for where the
corrected explanation is documented. No task numbering changed — this is
recorded here rather than as a new Txxx because it was a within-scope
correction to T006's implementation, not new work outside the original task
list.

## Second post-implementation correction (found from live user feedback after T026)

After the DoD note's content edit was applied via `--overwrite-stdin` (a
separate, non-speckit data-correction task — see the top-level conversation,
not this task list), the user viewed the real note in Notes.app and reported
the checklist as plain, unbulleted text — a screenshot confirmed it. Cause:
`overwrite()` built its body via `toHtml(opts.overwriteText)`
(`opts.overwriteHtml`), never `linesToBodyHtml()` — spec.md's Assumptions had
explicitly scoped `--overwrite-stdin` out of Rule 2, on the assumption that no
report of the same problem existed for that path. It turned out the report
just hadn't happened yet, because nothing had exercised that path against a
real checklist until this session did. Fix: `overwrite()` now calls
`linesToBodyHtml(opts.overwriteText || '')` directly; `opts.overwriteHtml` and
its `toHtml()` computation in `parseArgs()` were removed as dead code. Title
dedup (Rule 1) was not extended to `overwrite()` — it has no separate `<h1>`
prepend to duplicate against (confirmed by the same three-note experiment
Rule 1 was built from). spec.md, plan.md, research.md, contracts/
note-body-conversion.md, and this skill's `SKILL.md` were updated in the same
change. `tests/run-apple-operators.sh`'s two grep-based checks referencing
`opts.overwriteHtml` were updated to match the new code.

---

## Phase 7: User Story 4 - Markdown書式をNotes標準書式として保持する (Priority: P1)

**Goal**: 公開Apple Eventsで実機保持できた段落、インライン、配置、Bulleted／Numbered Listを安全に変換し、保持できなかった5書式はNotes変更前に拒否する。

**Independent Test**: 対応書式を各1回含む入力が契約どおりのallow-list HTMLになり、未対応5書式と不正属性が書式名付きエラーになり、作成・代入処理より前に変換されることを純粋関数・静的統合テストで確認する。

### Tests for User Story 4 ⚠️ Write first, confirm they FAIL

- [X] T027 [US4] Add failing paragraph and inline cases for Title, Heading, Subheading, Body, Monostyled, bold, italic, underline, strikethrough, color, size, alignment, HTML escaping, unmatched markers, title dedup, and first-visible-line extraction in `tests/test_note_body_conversion.js`.
- [X] T028 [US4] Add failing Bulleted and Numbered List cases for same-level runs, kind changes, 2-space nesting, item continuation, invalid indentation, and depth overflow in `tests/test_note_body_conversion.js`.
- [X] T029 [US4] Add failing pre-write validation cases for Block Quote, Highlight, Font family, Dashed List, Checklist, invalid color, size, and alignment in `tests/test_note_body_conversion.js`; assert each error names the format or field.
- [X] T030 [US4] Add failing static integration assertions that create and overwrite fully convert before `folder.notes.push`, `note.name =`, or `note.body =`, while raw HTML/append/replace-block remain unchanged, in `tests/run-apple-operators.sh`.
- [X] T031 [US4] Run `tests/run-note-body-conversion.sh` and `tests/run-apple-operators.sh`, record the expected red failures, and do not edit implementation until the failures prove T027-T030 exercise missing behavior.

### Implementation for User Story 4

- [X] T032 [US4] Implement pure `validateNotesMarkdown`, `markdownToNotesHtml`, nested list rendering, inline allow-list rendering, and first-visible-line helpers while retaining the `linesToBodyHtml` compatibility export in `.claude/skills/apple-notes/scripts/write_note.js`.
- [X] T033 [US4] Wire create and hash-gated overwrite to finish validation/conversion before any Notes mutation, keep `app.Note` body-only title creation, and preserve raw HTML/append/replace-block behavior in `.claude/skills/apple-notes/scripts/write_note.js`.
- [X] T034 [US4] Run `tests/run-note-body-conversion.sh` and `tests/run-apple-operators.sh`; make all T027-T030 cases green, then refactor without changing outputs in `.claude/skills/apple-notes/scripts/write_note.js`.

**Checkpoint**: User Story 4 is deterministically complete and independently testable without Notes.app.

---

## Phase 8: User Story 2 correction - Bulleted List契約へ揃える (Priority: P1)

**Goal**: 旧実装の`- `近似を廃止し、対応済みの`* `だけをBulleted Listへ変換する。

**Independent Test**: `* item`がBulleted List、`- item`がDashed List未対応、`- [ ] item`がChecklist未対応になる。

- [X] T035 [US2] Replace obsolete `- ` list expectations with `* ` Bulleted List expectations and explicit Dashed List/Checklist rejection assertions in `tests/test_note_body_conversion.js`; confirm the pre-implementation red state is already captured by T031.
- [X] T036 [US2] Verify the implementation from T032 satisfies the corrected User Story 2 contract with `tests/run-note-body-conversion.sh`, without restoring any `- ` approximation in `.claude/skills/apple-notes/scripts/write_note.js`.

---

## Phase 9: User Story 3 correction - テンプレートを対応済み構文へ揃える (Priority: P2)

**Goal**: 8個のMarkdownテンプレートが未対応のDashed List/Checklistを要求せず、箇条書き欄に`* `を使う。

**Independent Test**: active templatesに行頭`- `または`- [ ]`が0件で、既存の分類・説明・記入欄が保持される。

- [X] T037 [US3] Add a failing active-template assertion for unsupported Dashed List and Checklist markers, while retaining the eight-file/content checks, in `tests/run-apple-operators.sh`.
- [X] T038 [US3] Convert active list markers from `- ` to supported `* ` without changing text or placeholders in all eight files under `scrum/templates/`.
- [X] T039 [US3] Run `tests/run-apple-operators.sh` and confirm the template inventory, preserved content, and unsupported-marker checks are green.

---

## Phase 10: Polish & Cross-Cutting Verification

**Purpose**: 公開契約・文書・実機証跡を実装に同期し、全回帰を確認する。

- [X] T040 [P] Update the supported syntax table, unsupported Option B errors, atomicity guarantee, and examples in `.claude/skills/apple-notes/SKILL.md`.
- [X] T041 [P] Update Notes formatting usage, template marker guidance, test counts, and honest live-verification status in `README.md`.
- [X] T042 Reconcile historical checklist approximation language and final decisions across `specs/006-notes-template-format-fix/spec.md`, `research.md`, `plan.md`, `data-model.md`, `contracts/note-body-conversion.md`, and `quickstart.md`.
- [X] T043 Run focused suites plus the repository regression suites listed in `quickstart.md`; record commands, counts, and any unrelated failure without claiming success for skipped checks.
- [X] T044 Perform one supported-format Notes.app probe covering all supported formats, including multi-word justify and nesting; visually inspect the result and retain its folder, title, and note ID as evidence.
- [X] T045 Perform create and overwrite non-mutation probes for each unsupported format as described in `quickstart.md`; confirm format-named errors and unchanged Notes state, retaining evidence rather than deleting records.

## Expansion Dependencies & Execution Order

- T027-T031 are the mandatory red phase and run before implementation.
- T032 precedes T033; T034 is the green/refactor gate for User Story 4.
- T035-T036 validate the corrected User Story 2 contract against T032.
- T037 must fail before T038; T039 is the User Story 3 green gate.
- T040 and T041 can run in parallel only after behavior is green. T042 follows all spec/code decisions.
- T043 precedes T044-T045. Live probes supplement deterministic evidence and do not replace it.

## Expansion Parallel Opportunities

- T027, T028, and T029 target disjoint test groups in one file and are conceptually separable, but should be edited sequentially here to avoid shared-file conflicts.
- T040 and T041 touch independent documentation files and are parallelizable.
- Supported and unsupported live probe scenarios are logically independent, but run sequentially to simplify retained evidence.

## Expansion Implementation Strategy

The expansion MVP is Phase 7 only: safe supported conversion plus pre-write rejection. Phase 8 removes the previous approximation explicitly, Phase 9 makes repository templates valid clients of the new contract, and Phase 10 synchronizes documentation and obtains final regression/live evidence.
