# Phase 0 Research: MarkdownからNotes標準フォーマットへの変換

No `[NEEDS CLARIFICATION]` markers remained in spec.md, so this phase records the
design decisions the plan depends on rather than resolving open unknowns.

## Decision: Apple公式一覧と公開書き込み境界

**Finding**: Apple公式の[Format notes on Mac](https://support.apple.com/guide/notes/format-notes-apd1955d3b21/mac)は、Title／Heading／Subheading／Body、太字／斜体／下線／取り消し線、ハイライト、フォント／色／サイズ、配置を案内する。公式の[Add lists in Notes on Mac](https://support.apple.com/guide/notes/add-lists-apd93c815aa0/4.13/mac/26)と[Keyboard shortcuts and gestures in Notes on Mac](https://support.apple.com/guide/notes/keyboard-shortcuts-and-gestures-apd46c25187e/mac)は、Monostyled、Block Quote、Bulleted／Dashed／Numbered List、Checklist、リスト階層と項目内改行を独立した書式として列挙する。

インストール済みNotes.app（macOS 26.5.2）の公式Scripting Dictionaryで書き込み可能なノート内容は `body`（"the HTML content of the note"）だけであり、各書式専用のApple Eventsプロパティはない。

**Decision**: 公式一覧を機能インベントリの正本とする一方、実装はConstitution IIに従いNotesの公開Apple Events `body`だけを使用する。Accessibility/UI操作、非公開データベース、未文書化URLや内部属性は使用しない。表・リンク・添付・音声・数式は公式ガイド上で挿入コンテンツとして別分類のため、このテキスト書式機能には含めない。

**Alternatives considered**:
- Accessibility/UI操作ですべての書式を適用する案: ユーザーがOption Bを選択したため却下。既存の公開インターフェース原則を維持し、前面アプリやローカライズ済みメニューへの依存を増やさない。
- Notes内部HTML属性やデータベースを解析する案: 公開契約でなく、OS更新で壊れ得るうえConstitution IIに反するため却下。

## Decision: 実機プローブで確認した対応表

**Finding**: `zzz-006-format-probe-20260811` フォルダの同名ノート（ID末尾 `p2278`）へ、公開Apple Events経由で候補HTMLを1件書き込んだ。ユーザー提供の実画面画像と `body` 読み戻しを突き合わせた結果は次のとおり。

| 公式書式 | Apple Events `body` 入力結果 |
|---|---|
| Title / Heading / Subheading / Body | 保持。見出し階層が視覚的に区別される |
| Monostyled | 保持。Courier系の等幅表示になる |
| Bold / Italic / Underline / Strikethrough | 保持 |
| Text color / size | 保持 |
| Alignment | left / center / rightを実画面で保持。justifyは複数語の追加ライブ検証対象 |
| Bulleted / Numbered List | 保持 |
| Nested list | 少なくとも1階層を保持 |
| Block Quote | 通常Bodyへ平坦化 |
| Highlight | 背景色が消え通常文字列になる |
| Dashed List | Bulleted Listへ平坦化 |
| Checklist | Bulleted Listへ平坦化し完了状態も消失 |
| Font family | `font-family` と `font face="Marker Felt"` の双方が通常フォントへ平坦化 |

**Decision**: 保持できる書式だけをMarkdown変換対象にする。Block Quote、Highlight、Font family、Dashed List、Checklistは書き込み前に書式名を含むエラーとし、Notesへ部分的な変更を加えない。見た目だけの近似を「対応」と数えない。

**Alternatives considered**:
- 5書式を通常段落・箇条書きへ近似する案: ユーザーの明示したOption BとFR-018に反し、入力意図が失われたことも見えなくなるため却下。
- `body` 読み戻しHTMLだけで対応可否を判定する案: 読み戻しHTMLは配置や番号付きリストの内部状態を完全には表さなかった。実画面画像と組み合わせる必要があるため却下。

## Decision: Markdownと安全なNotes属性の入力契約

**Decision**: 依存パッケージを追加せず、`write_note.js` 内の決定的なパーサーで次を扱う。

- `#` / `##` / `###`、通常段落、フェンスコードブロックをTitle／Heading／Subheading／Body／Monostyledへ変換する。
- `**bold**`、`*italic*`、`++underline++`、`~~strike~~` を対応するインライン書式へ変換する。
- `* item` と `1. item` をBulleted／Numbered Listへ変換し、2スペース単位のインデントをリスト階層、同じ項目内のインデント継続行を項目内改行として扱う。
- `[text]{color=#RRGGBB size=N}` を色・サイズの限定属性、`{align=left|center|right|justify}text` を段落配置として扱う。色は6桁16進、サイズは1〜512の整数だけを許可する。
- 生HTMLは許可せず、すべての利用者文字列を先にエスケープする。限定属性だけを検証後にHTMLへ組み立てる。
- `> `、`==...==`、`font` 属性、`- `、`- [ ]` / `- [x]` はそれぞれBlock Quote、Highlight、Font family、Dashed List、Checklist要求として検出し、変換前に拒否する。

**Rationale**: 標準Markdownで表現できるものは既知の記法を使い、表現できないが保持可能な色・サイズ・配置だけを小さなallow-list構文で補う。任意HTMLやCSSを受け付けないため、依存なしでも入力境界を安全かつテスト可能に保てる。

**Alternatives considered**:
- Markdownライブラリを追加する案: 現在のゼロ依存・自己完結原則に反し、今回必要な限定構文より攻撃面と更新負担が大きいため却下。
- 生HTMLをMarkdown内で許可する案: 任意タグ・属性のサニタイズを新たに正しく実装する必要があり、既存の明示的な `--html` 経路との責務も重複するため却下。

## Decision: 検証はApple Events呼び出しより前に完了させる

**Decision**: `--text` / `--text-stdin` / `--overwrite-stdin` のMarkdownは、Notesオブジェクトの作成・本文代入より前に純粋関数で検証・変換する。未対応書式や不正属性が1件でもあれば、エラーを返してApple Notesを変更しない。`--overwrite-stdin` の既存ハッシュゲートはその後も必須であり、変換機能はゲートを迂回しない。

**Rationale**: FR-017とConstitution Iを同時に満たし、部分書き込みや入力エラーによる既存ノート破損を構造的に防ぐ。

**Alternatives considered**:
- 可能な部分だけ書いて警告する案: 原子性を失い、ユーザーの書式意図と既存ノートを同時に壊し得るため却下。

## Verification evidence: final implementation (2026-08-11)

The retained folder `zzz-006-format-probe-20260811` contains these probe records:

| Note | ID suffix | Evidence |
|---|---|---|
| `zzz-006-format-probe-20260811` | `p2278` | Original official-format boundary probe used to choose Option B. |
| `zzz-006-format-implementation-20260811-2` | `p2279` | First end-to-end implementation probe. The user-supplied screenshot showed Title, Heading, Subheading, Body, Monostyled, inline styles, color/size, alignments, Bulleted/Numbered Lists, and nesting. It also exposed one invalid empty bullet when a parent continuation followed its nested list. |
| `zzz-006-list-continuation-probe-20260811` | `p2280` | Raw HTML candidates. The user-supplied screenshot confirmed `<br>` and child `<div>` both become an item-internal line break, including when placed before a nested list. |
| `zzz-006-format-implementation-20260811-3` | `p2281` | Final CLI probe with the continuation before the nested list. Notes readback preserved the continuation as U+2028 inside the same `<li>`, then preserved the nested item. |

The discovered ordering constraint is now enforced: a continuation after an
item's nested list fails as `List continuation` before writing, rather than
creating an empty bullet. The focused suite records this regression and passes
34/34 cases.

Create probes for Block Quote, Highlight, Font family, Dashed List, and
Checklist each exited non-zero with the exact format name; a folder listing
confirmed that none of their five unique titles was created. The same five
inputs were presented to hash-gated overwrite against dedicated probe `p2280`;
all five failed before assignment and a before/after plaintext comparison was
identical. No probe record was deleted.

## Superseded decision: `--overwrite-stdin` checklist approximation

**Status (superseded 2026-08-11)**: This section records why conversion was
extended to overwrite, but its `- ` → Bulleted List approximation is no longer
the active contract. The later official-format probe established that Dashed
List and Checklist are distinct Notes formats and are not preserved by public
Apple Events. The active decision is Option B above: `* ` is Bulleted List;
`- ` and `- [ ]` fail before writing.

**Finding**: After using `--overwrite-stdin` to apply the user's approved edit to
the real 上高地 Definition of Done note (revoke one checklist item, add another),
the user viewed the result in Notes.app and reported it as "全て平文のテキストに
なってしまって視認性が悪い" (it all became plain text and is hard to read) — a
screenshot showed every checklist item as a separate plain paragraph line, no
bullet marker, exactly the readability problem this spec exists to fix. The cause:
`overwrite()` built its new body from `toHtml(opts.overwriteText)` (via
`opts.overwriteHtml`, computed in `parseArgs()`), never `linesToBodyHtml()` — the
original spec Assumptions had explicitly scoped `--overwrite-stdin` out, on the
(reasonable-looking, but wrong in practice) basis that no report of the same
problem existed for that path.

**Decision**: Bring `--overwrite-stdin` in scope for Rule 2 (checklist rendering)
only, not Rule 1 (title dedup): `overwrite()` sets `note.name` and `note.body`
via plain property assignment on an already-existing note, which the earlier
three-note experiment (see "Root cause, corrected" above) already showed does
*not* trigger Notes.app's title-injection behavior — that behavior is specific to
`app.Note({name, body})` at construction time. So there is no duplicate-title
structure for `dedupTitleLine` to guard against here; only the checklist
rendering gap was real. `overwrite()` now calls
`note.body = linesToBodyHtml(opts.overwriteText || '')` directly;
`opts.overwriteHtml`/`toHtml(opts.overwriteText)` in `parseArgs()` became dead
code once nothing read it, and was removed rather than left stale.

**Alternatives considered**:
- *Leave `--overwrite-stdin` as originally scoped, tell the user to phrase future
  corrections differently*: rejected — the user is not the one choosing the HTML
  conversion path; `--overwrite-stdin` is the only mechanism this script offers
  for a whole-body correction like theirs (no fenced block existed to target with
  `--replace-block`), so the gap was in the tool, not the usage.
- *Re-derive `overwriteHtml` from `opts.rawText`/`toHtml` and add a separate,
  parallel "smart" path*: rejected — `linesToBodyHtml` already is the general
  replacement for `toHtml` wherever list-aware rendering is wanted; keeping both
  would leave two conversion functions with overlapping purpose and no clear rule
  for which one for a future path to call.

## Decision: Root cause of the reported bug

**Initial hypothesis (superseded below)**: `write_note.js`'s `create()` always
prepends `<h1>{title}</h1>` to the body
(`.claude/skills/apple-notes/scripts/write_note.js:209-211`). The initial theory
was that the bug only occurred when a caller's `--text`/`--text-stdin` content
*also* happened to start with a line equal to the title. This looked consistent
with the live 上高地 Definition of Done note, whose plaintext body's first two
non-blank lines were both `Definition of Done`.

**Root cause, corrected (found during implementation, live-app testing on
2026-08-11)**: a caller-repeated title line is not required to reproduce the bug.
Direct experiment against Notes.app (three throwaway notes in a scratch folder)
isolated the real cause:

| Call | Result |
|---|---|
| `app.Note({ name: "Test A", body: "<div>Test A</div><div>rest A</div>" })` | Body becomes `<div>Test A</div><div>Test A</div><div>rest A</div>` — duplicated even though the body's own first line already matched `name` exactly, and neither line used `<h1>`. |
| `app.Note({ name: "Test B", body: "<div>rest only B, no title line</div>" })` | Body becomes `<div>Test B</div><div>rest only B, no title line</div>` — Notes still injects a `name`-derived line even when nothing in the body resembles it. |
| `app.Note({ body: "<h1>Test C</h1><div>rest C</div>" })` (no `name` passed) | Body becomes `<div><b><span style="font-size: 24px">Test C</span></b></div><div>rest C</div>` — the title appears exactly once, styled from the `<h1>`, and `note.name()` correctly reads back `"Test C"` with no `name` ever set explicitly. |

Conclusion: passing `name` to `Application('Notes').Note({...})` at creation time
makes Notes.app **unconditionally inject its own plain `<div>{name}</div>`** as
the note's literal first body line — independent of whatever the `body` argument
already contains. `create()`'s original code passed **both** `name: opts.title`
and a body that started with `<h1>{title}</h1>`, so every note it created got a
plain `name`-derived line *and* a styled `<h1>`-derived line: two lines, always,
regardless of what `--text` contained. The 上高地 note likely never had a
caller-repeated title line at all — the "two `Definition of Done` lines" in its
plaintext are fully explained by this `name`+`<h1>` combination alone.

**Decision**: Two independent fixes, not one:

1. **Primary fix** — `create()` must call `app.Note({ body: body })` only, never
   also passing `name`. This alone eliminates the title duplication that existed
   in 100% of notes this script has ever created, regardless of `--text` content.
2. **Defense in depth** — a caller can still independently type the title as
   literal text inside `--text`/`--text-stdin` (nothing prevents that, and it is
   not intrinsically wrong input). `dedupTitleLine` still strips an exact-match
   first line before conversion, so that case does not produce a second title
   line stacked on top of the first fix's already-correct single title.

Fix 1 satisfies FR-001/FR-002 by construction (no code path can duplicate the
title once `name` is never passed). Fix 2 remains necessary for the corpus this
spec's Independent Test criteria describe (a caller who repeats the title) and
was validated against Notes.app directly (see quickstart.md §3): text whose
first line repeated the title produced a note with the title exactly once.

**Alternatives considered**:
- *Document-only fix* (add a stronger warning to SKILL.md, do not touch the
  script): rejected — the existing docs already say "first line becomes the
  title" and the bug still happened; a second sentence is unlikely to close the
  gap a first sentence didn't. Now further disqualified: the actual defect was
  never something a caller could avoid by following documentation, since it fired
  on every note regardless of `--text` content.
- *Always strip the first line of `--text`, unconditionally*: rejected — would
  silently eat real content whenever it happens to occupy line one and isn't the
  title, violating FR-003 (a caller passing content that doesn't repeat the title
  must not lose it).
- *Keep `name` and instead strip Notes' injected line after the fact*: rejected —
  would require reading the note back after every `create()` call and editing it
  again (a second write, doubling Apple Events calls and introducing a race with
  no purpose), when simply not passing `name` avoids the injection in the first
  place.

## Decision: Dedup rule is exact match on the trimmed first line

**Decision**: Compare the title (trimmed) against the first line of the supplied
text, trimmed, using strict string equality. A leading `# ` is removed for this
comparison only. If they match exactly, drop that line before conversion.

**Rationale**: A caller that means to duplicate the title always produces an exact
match (this is what happened in the live note — literally `Definition of Done` in
both places). Fuzzy or partial matching (e.g., prefix match, punctuation-insensitive
match) risks stripping legitimate content whose first line happens to resemble the
title (spec Edge Cases: `Definition of Done（上高地日帰り撮影）` must NOT be
treated as a duplicate). Exact match has no false-positive risk beyond the case
it's meant to catch.

**Alternatives considered**:
- *Case/whitespace-insensitive fuzzy match*: rejected per the edge case above —
  over-eager stripping is worse than an occasional missed duplicate, since a
  missed duplicate reproduces today's bug (visible, easy to notice and re-run)
  while an over-eager strip silently deletes the caller's first real line
  (invisible until someone reads the note and finds a sentence missing).

## Superseded decision: treating dash lines as checklist-like bullets

**Status (superseded 2026-08-11)**: Kept as implementation history only. The
active contract uses `* ` for Bulleted List and rejects `- ` as unsupported
Dashed List and `- [ ]`/`- [x]` as unsupported Checklist.

**Decision**: `toHtml()` treats a maximal run of consecutive lines that each start
with `- ` (after trimming leading whitespace) as one checklist, and renders it as
`<ul><li>...</li></ul>` instead of one bare `<div>` per line. Lines outside such a
run keep today's exact behavior (one `<div>` per line, blank lines become
`<div><br></div>`).

**Rationale**: The spec (FR-004) defines a checklist item as "箇条書きとして書かれ
た行" (a line written as a bullet) — this makes "checklist" a property of how the
caller *writes* the input, not something the script has to guess from content
(e.g., detecting "looks like a checklist" from run length or vocabulary would be
unreliable and unrelated to the actual fix). It also composes directly with Story
3: templates already move to Markdown, and Markdown's own checklist convention is
a `- ` (or `- [ ] `) prefix — so a template's fill-in checklist section, filled in
verbatim, is already valid input to this rule with no extra translation step.
`<ul><li>` is the same fix WebKit-rendering hosts (Notes.app's body renderer is
WebKit-based, per Notes' documented `body` being HTML) use to add both the
bullet marker and the inter-item spacing the bug report is missing — one change
addresses both the "no bullets" and "no spacing" complaints in the report, because
they are the same underlying cause (bare `<div>` has no list semantics or
default spacing in WebKit's default stylesheet, whereas `<li>` does).

**Alternatives considered**:
- *Detect checklists by heuristic (e.g., "3+ consecutive non-blank lines")*:
  rejected — cannot distinguish a real checklist from an ordinary multi-line
  paragraph the caller intentionally wrote without blank lines, which would
  violate FR-005 (must not change existing plain-paragraph display).
- *Insert blank-line spacing between every line unconditionally, without real
  `<ul><li>` markup*: rejected — adds spacing but no bullet marker, so items
  still read as an undifferentiated list of sentences; also changes the display
  of prose paragraphs that today render as adjacent `<div>` lines by design
  (multi-line free text, e.g. a Sprint Review summary), which FR-005 forbids.

## Decision: Testing approach for JXA logic without macOS

**Finding**: `write_note.js` is invoked as `osascript -l JavaScript`, and most of
its functions use `ObjC.import`/`Application('Notes')`, which only run under
`osascript` on macOS. But title deduplication, validation, visible-name
extraction, inline parsing, list parsing, and Markdown-to-HTML conversion are
pure string transforms, with no `ObjC`, no `Application`, no filesystem, and no
network access.

**Decision**: Extract these as small, dependency-free functions inside
`write_note.js` (structurally, same file — no shared-module mechanism exists in
this repo's JXA scripts, see the file's own comment on the duplicated
`toPlainText()`), then test them with a plain Node script
(`tests/test_note_body_conversion.js`) that reads `write_note.js`'s source,
evaluates only the pure functions (no `ObjC`/`Application` calls occur unless a
function under test calls them, and these do not), and asserts on their return
values. `tests/run-note-body-conversion.sh` is a thin runner mirroring
`tests/run-note-write-guard.sh`'s structure (deterministic, no `claude` CLI, no
network, no macOS). This keeps Constitution III's requirement — "Tests that can
run without macOS MUST remain platform-independent" — satisfiable for the actual
behavior change, while the full `create()` → Apple Events → Notes.app path
remains a live-app check reported separately, exactly as it already is for the
rest of this script.

**Alternatives considered**:
- *Skip automated tests for this script, rely on live-app manual checks only*:
  rejected — violates Constitution III (NON-NEGOTIABLE) and the project's
  existing precedent, since `note_write_guard.py`'s hash-gate logic already gets
  this same platform-independent treatment for the same reason (pure logic
  inside a script that otherwise needs macOS).
- *Rewrite `write_note.js` in a form Jest/Mocha could import directly*: rejected
  — out of scope; the repository has no JS test framework or package manifest,
  and introducing one only for this feature would violate Constitution V (no new
  dependency) and this feature's own Assumptions (format-only change, not a
  rewrite).
