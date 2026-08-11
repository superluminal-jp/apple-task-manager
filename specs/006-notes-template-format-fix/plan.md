# Implementation Plan: MarkdownからNotes標準フォーマットへの変換

**Branch**: `feat/notes-template-format-fix` | **Date**: 2026-08-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-notes-template-format-fix/spec.md`

## Summary

`write_note.js` の新規作成とハッシュ確認済み全文置換に、許可リスト方式のMarkdown変換を追加する。公開Apple EventsのHTML本文で保持できるTitle／Heading／Subheading／Body／Monostyled、太字／斜体／下線／取り消し線／色／サイズ、配置、Bulleted／Numbered ListをNotes標準書式として出力する。実機で保持されなかったBlock Quote、Highlight、Font family、Dashed List、Checklistは、Accessibility/UI自動化や見た目だけの近似を使わず、Apple Eventsによる変更より前に書式名付きエラーとする。既存のタイトル重複修正、raw `--html`、追記、名前付きブロック置換は維持する。

## Technical Context

**Language/Version**: JavaScript for Automation (JXA; `osascript -l JavaScript`) とNode互換の純粋JavaScript、Bashテストランナー、Markdown文書

**Primary Dependencies**: 追加なし。Notes Scripting Dictionary、既存のObjCブリッジ、標準JavaScriptのみ

**Storage**: `scrum/templates/*.md` とApple NotesのHTML本文。データベースなし

**Testing**: `tests/run-note-body-conversion.sh` のNode単体テスト、`tests/run-apple-operators.sh` の静的回帰、macOS Notes.appでの非破壊ライブ検証

**Target Platform**: macOS Notes.app。純粋変換テストはNode実行環境

**Project Type**: 単一の個人自動化リポジトリ

**Performance Goals**: ノート本文長に対してO(n)。外部プロセス・ネットワーク・UI操作を追加しない

**Constraints**:

- 公開Apple Eventsだけを使い、Accessibility/UI自動化を使わない。
- プレーン入力はHTMLエスケープ後、許可した書式だけを生成する。raw `--html` は既存の上級者向け経路として対象外。
- 変換と未対応書式検証をNotesの作成・本文代入より先に完了する。
- 全文置換の既存ハッシュゲートを維持する。
- `--append`、`--replace-block`、`--delete` の動作を変えない。
- 追加依存や共有JSモジュールを導入しない。

**Scale/Scope**: 1 JXAスクリプト、8テンプレート、2テストファイル、README、Apple Notesスキル文書、Spec Kit成果物

## Constitution Check

*GATE: Phase 0前とPhase 1設計後の双方で確認。*

- **I. Preserve User Records** — PASS。全文置換のハッシュゲートを維持し、構文検証と変換を作成・代入より前に完了するため、不正入力で部分更新しない。
- **II. Use Public, Platform-Native Interfaces** — PASS。Notes Scripting Dictionaryの`body`へのHTML書き込みだけを使用する。Accessibility/UI自動化は明示的に不採用。
- **III. Test First and Report Evidence** — PASS。各変換と拒否規則を失敗する純粋関数テストから実装し、決定論的テストと実機結果を分けて報告する。
- **IV. Separate Data Access from Judgment** — N/A。Scrum判断ではなく、明示的な入力構文からHTMLへの決定論的変換。
- **V. Keep the Repository Self-Contained** — PASS。依存追加なし。公開挙動と同じ変更でREADME、スキル文書、テンプレートを同期する。

違反や追加の複雑性例外はない。

## Project Structure

### Documentation (this feature)

```text
specs/006-notes-template-format-fix/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── note-body-conversion.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
.claude/skills/apple-notes/
├── scripts/write_note.js
└── SKILL.md

scrum/templates/
├── product-goal.md
├── definition-of-done.md
├── sprint-planning.md
├── daily-scrum.md
├── sprint-review.md
├── sprint-retrospective.md
├── impediment-log.md
└── decision-rights.md

README.md

tests/
├── test_note_body_conversion.js
├── run-note-body-conversion.sh
└── run-apple-operators.sh
```

**Structure Decision**: 既存の単一プロジェクト構成を維持し、変換器は所有元である`write_note.js`内の純粋関数として実装する。NodeからはJXA副作用を実行せずに関数だけを読み込んで検証する。

## Design

1. `dedupTitleLine(title, text)` は先頭のプレーンタイトルと `# ` Titleの完全一致だけを除去する。
2. `validateNotesMarkdown(text)` は未対応5書式と不正な色・サイズ・配置・リスト階層を検出し、書式名付きの例外を投げる。
3. `markdownToNotesHtml(text)` は検証済み入力をHTMLエスケープし、契約の段落・インライン・配置・リストだけを生成する。
4. `create()` は本文を完全変換してから`app.Note({body})`を作成する。`name`は渡さず、Titleの二重生成を防ぐ。
5. `overwrite()` は本文を完全変換してから既存ハッシュを照合し、合致時だけ`name`と`body`を代入する。
6. テンプレートは対応済みのBulleted List記法`* `を使い、ChecklistやDashed Listを要求しない。

## Complexity Tracking

*Constitution違反なし。*
