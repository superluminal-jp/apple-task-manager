# Implementation Plan: Notes 条件付き上書き・削除

**Branch**: `docs/adr-0007-notes-overwrite-delete` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-notes-conditional-overwrite/spec.md`

## Summary

`write_note.js` に `--overwrite-stdin`(全文置換)と `--delete`(削除)を追加する。
どちらも `--expect-hash <sha256>` を必須とし、書き込み直前に対象ノートの現在の
plaintext本文からハッシュを計算し直して一致を確認する(楽観的排他制御)。ハッシュ
計算・比較というプラットフォーム非依存の「決める」ロジックは新しい純Pythonモジュール
(`note_write_guard.py`)に切り出し、決定的ユニットテストを書く — 既存の
`scrum_block.py`/`project_registry.py`と同じ「Apple側APIで取得・書き込み、Pythonで
解釈する」分業を踏襲する。ADR 0007([Accepted](../../docs/adr/0007-conditional-overwrite-delete-for-notes.md))
と、これを受けて改定したConstitution v2.0.0のPrinciple Iが根拠。

## Technical Context

**Language/Version**: JXA(`osascript -l JavaScript`、Apple Events層)+ Python 3 標準ライブラリのみ(ハッシュ計算・比較の決定層)

**Primary Dependencies**: なし。macOS同梱の`osascript`/Notes Apple Eventsディクショナリ、`Foundation`(既存の`ObjC.import('Foundation')`)、macOS同梱の`python3`(このリポジトリ全体で既に依存している — `scrum_block.py`/`project_registry.py`/`flow_metrics.py`と同列)のみを使う([ADR 0004](../../docs/adr/0004-per-app-optimal-automation.md)準拠、新規サードパーティ依存なし)

**Storage**: N/A — Notes.appが記録源([ADR 0001](../../docs/adr/0001-reminders-as-system-of-record.md))

**Testing**: `tests/run-*.sh` 経由のPythonユニットテスト(決定層、macOS不要、決定的) + macOS実機でのライブ検証(Apple Events層、Notes Automation許可が必要)。Constitution Principle IIIの「macOS不要なテストはプラットフォーム非依存のまま」「ネイティブ挙動はmacOSで追加検証」を両方満たす

**Target Platform**: macOS(Apple Events書き込み層)。決定層(Pythonのハッシュ計算・比較)はプラットフォーム非依存

**Project Type**: 既存リポジトリのスキル内スクリプト追加(`src/`構成ではなく`.claude/skills/apple-notes/scripts/`配下)

**Performance Goals**: 適用外 — 個人利用の単一アカウント、ノート本文は数百〜数千文字規模。パフォーマンス最適化は本フィーチャーの目的ではない

**Constraints**: 新規サードパーティ依存を追加しない([ADR 0004](../../docs/adr/0004-per-app-optimal-automation.md))。`--overwrite-stdin`/`--delete`は`--id`で指定した対象ノート以外を変更してはならない。ハッシュ比較は書き込み直前に行い、キャッシュした古い値で判定してはならない(競合窓を最小化する設計そのものが目的)

**Scale/Scope**: 個人のApple IDアカウント1つ。並行書き込みは主に「人間がNotes.appで編集中に、同じノートをエージェントが上書きしようとする」という単純な競合ケースを想定する

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v2.0.0(本セッションでADR 0007を受けて改定済み)に対して評価する。

- **I. Preserve User Records** — PASS。改定後のPrinciple Iは、まさに本フィーチャーが
  実装する条件(`--expect-hash`による楽観的排他制御、実行前の利用者承認)を要求
  している。Reminders削除禁止・識別子未解決時の黙った代替作成禁止は変更せず、
  本フィーチャーもそれらに触れない(spec FR-012、Assumptions)。
- **II. Use Public, Platform-Native Interfaces** — PASS。Notes側はNotes Apple Events
  ディクショナリ(既存の`app.notes.byId(...)`)のみを使う。ハッシュ計算に
  CommonCrypto等の追加フレームワークをObjCブリッジ経由で呼ぶ案は複雑さの割に
  利点がないため採らず(Research参照)、macOS同梱でリポジトリ全体が既に依存
  している`python3`標準ライブラリの`hashlib`を使う — 新しいプライベート
  フレームワークや非公式スキームは導入しない。
- **III. Test First and Report Evidence** — PASS(設計として満たせる)。ハッシュ
  計算・比較という決定的ロジックをPythonに切り出すことで、赤→緑のユニット
  テストをmacOS無しで書ける。Apple Events層(実際のノート削除・上書き・
  ハッシュ不一致拒否・削除の回収可否)はmacOS実機での検証が必須で、報告時に
  静的/ユニットの証拠とライブアプリの証拠を区別する。
- **IV. Separate Data Access from Judgment** — PASS。`apple-notes-operator`は
  引き続き「事実の取得・変更結果の返却」のみを行う。「上書きしてよいか」の
  判断はユーザー(PO)が行い、オペレーターはその判断を実行するだけ(spec
  User Story 3、FR-009)。
- **V. Keep the Repository Self-Contained** — PASS。新しいスクリプト
  (`note_write_guard.py`)とテストはこのリポジトリ内に置く。外部リポジトリとの
  同期機構は導入しない。SKILL.md・CLAUDE.mdの該当箇所は同じ変更の中で更新する
  (spec FR-008/FR-009/FR-010)。

違反なし。Complexity Trackingは不要。

## Project Structure

### Documentation (this feature)

```text
specs/005-notes-conditional-overwrite/
├── plan.md              # このファイル
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
│   └── write-note-overwrite-delete.md
└── tasks.md              # Phase 2 output(/speckit-tasksで生成、本コマンドでは作らない)
```

### Source Code (repository root)

このリポジトリは汎用の`src/`構成を使わず、機能ごとにスキル配下へスクリプトを
置く既存レイアウトを踏襲する(`apple-notes`スキル、Option 1/2/3のいずれにも
該当しないため、実際のディレクトリで直接記述する)。

```text
.claude/skills/apple-notes/
├── scripts/
│   ├── write_note.js         # 変更: --overwrite-stdin, --delete, --expect-hash を追加
│   ├── note_write_guard.py   # 新規: sha256_plaintext() とCLI(hashサブコマンド)
│   ├── list_notes.js         # 変更なし(既存の --plaintext 読み取りをそのまま使う)
│   ├── ensure_folder.js      # 変更なし
│   └── project_registry.py   # 変更なし(ADR 0006は本フィーチャーの対象外)
└── SKILL.md                   # 変更: 新フラグの説明、実行前承認の運用規約、
                                #        削除の回収可否についての検証済み事実

.claude/agents/apple-notes-operator.md  # 変更: --overwrite-stdin/--delete 呼び出し前に
                                          #        内容を提示し承認を得る運用規約を明記

tests/
├── test_note_write_guard.py  # 新規: sha256_plaintext()のユニットテスト(空文字列・
│                               #        ASCII・日本語/絵文字を含むUTF-8境界値)
└── run-note-write-guard.sh   # 新規: 既存 tests/run-*.sh と同じ形のスイートランナー

docs/adr/0007-conditional-overwrite-delete-for-notes.md  # 既にAccepted、変更なし
.specify/memory/constitution.md                           # 既にv2.0.0へ改定済み、変更なし
CLAUDE.md                                                  # 変更: 「破壊的操作」節を実態に合わせる
```

**Structure Decision**: 既存の`apple-notes`スキルへの追加として実装する。新しい
トップレベルディレクトリは作らない。ハッシュ計算・比較という決定的ロジックのみ
新しいPythonモジュールに切り出し、`scrum_block.py`/`project_registry.py`と同じ
「Apple側APIで取得・書き込みし、Pythonで解釈する」分業パターンに揃える。

## Complexity Tracking

*Constitution Checkに違反なし。本セクションは適用外。*

## Post-Design Constitution Check

*Phase 1(research.md, data-model.md, contracts/, quickstart.md)完了後の再評価。*

- **I. Preserve User Records** — PASS(維持)。設計はハッシュ照合を`decide`
  という純関数に切り出し、`REFUSE`の場合はApple Events層に一切到達しない
  構造にした(data-model.md「Write Decision」)。実行前の利用者承認は
  コードでは強制できない運用規約のままであり、これはADR 0007が明示的に
  受容した残余リスクとして変わらない。
- **II. Use Public, Platform-Native Interfaces** — PASS(維持)。`NSTask`は
  Foundation(既に利用中)の範囲内。CommonCrypto等の新しいフレームワーク
  ブリッジは採用しなかった(research.md §1)。
- **III. Test First and Report Evidence** — PASS(設計で達成可能)。
  `note_write_guard.py`の`decide`が純関数として切り出されたことで、
  quickstart.mdの手順1(決定的テスト)と手順2〜4(ライブ検証)が明確に
  分離できた。
- **IV. Separate Data Access from Judgment** — PASS(維持)。設計変更なし。
- **V. Keep the Repository Self-Contained** — PASS(維持)。新規ファイルは
  すべてこのリポジトリ内(`scripts/`, `tests/`)。

違反なし。tasks生成に進める。
