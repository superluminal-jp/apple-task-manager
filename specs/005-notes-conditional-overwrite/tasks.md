---

description: "Task list for feature implementation"
---

# Tasks: Notes 条件付き上書き・削除

**Input**: Design documents from `/specs/005-notes-conditional-overwrite/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — すべて完了済み

**Tests**: Constitution Principle III(NON-NEGOTIABLE)が「すべての挙動変更は失敗するテストから始める」ことを要求するため、本フィーチャーではテストタスクは省略可能なオプションではない。ただし、macOS専用のApple Events層(JXA)には決定的なユニットテストが書けないという既存の制約(README §7、`apple-notes` SKILL.mdの既存パターン)はこのフィーチャーでも変わらない。そのため:
- 決定層(`note_write_guard.py`)は赤→緑の決定的ユニットテストを書く(Setup/Foundational Phase)。
- Apple Events層(`write_note.js`)は、既存の`specs/004-*/quickstart.md`と同じパターンで、実装後にmacOS実機でquickstart.mdの手順を実行し、"Verification Evidence"として結果を記録することを「テスト」として扱う。

**Organization**: spec.mdのUser Story(P1/P2/P3)ごとにグループ化する。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並行実行可能(別ファイル、依存タスクなし)
- **[Story]**: どのUser Storyに属するか(US1/US2/US3)

## Path Conventions

このリポジトリは`src/`構成を使わない。実際のパスは以下の通り:
- `.claude/skills/apple-notes/scripts/` — スクリプト本体
- `.claude/skills/apple-notes/SKILL.md` — スキルのドキュメント
- `.claude/agents/apple-notes-operator.md` — サブエージェント定義
- `tests/` — テストとスイートランナー
- `CLAUDE.md` — リポジトリ全体の運用規約

---

## Phase 1: Setup

**Purpose**: 新規ファイルの器を作る。ロジックはまだ入れない。

- [X] T001 `.claude/skills/apple-notes/scripts/note_write_guard.py` を新規作成する。shebang・モジュールdocstring・`hash`/`decide`サブコマンドの引数パーサの骨格のみ(ロジックは未実装、呼び出すとNotImplementededになる状態でよい)。
- [X] T002 [P] `tests/run-note-write-guard.sh` を新規作成する。既存の `tests/run-project-registry.sh` と同じ形(`python3 -m pytest` または既存スイートが使っている実行方式に合わせる — 既存の `tests/run-*.sh` を1つ読んで様式を揃える)で `tests/test_note_write_guard.py` を実行するランナー。

**Checkpoint**: 新規ファイルが存在し、既存の `tests/run-*.sh` 群を壊さない(まだ何もテストしていないので空実行で成功する)。

---

## Phase 2: Foundational(すべてのUser Storyをブロックする前提作業)

**Purpose**: US1(上書き)・US2(削除)がどちらも必要とする、ハッシュ判定ロジックと`write_note.js`側の受け口を先に作る。

**⚠️ CRITICAL**: このフェーズが終わるまでUser Story 3以外は着手できない。

- [X] T003 [P] `tests/test_note_write_guard.py` に `hash` サブコマンドの失敗するテストを書く: 空文字列 → `e3b0c442...`、ASCII文字列、日本語を含むUTF-8文字列(例: 「上高地」)、絵文字を含む文字列、について既知のSHA-256 hexdigestと一致することを検証する(data-model.md「Expected Hash」)。**この時点でテストは失敗する(RED)** — `note_write_guard.py`にロジックがまだない。
- [X] T004 T003を通す最小限の実装を `.claude/skills/apple-notes/scripts/note_write_guard.py` の `hash` サブコマンドに書く(標準ライブラリ`hashlib.sha256`のみ、contracts/note-write-guard.md準拠)。**GREEN。**
- [X] T005 [P] `tests/test_note_write_guard.py` に `decide` サブコマンドの失敗するテストを書く: ハッシュ一致→`allow`、不一致→`refuse`、`--expect-hash`省略→非ゼロ終了、大文字ハッシュを渡した場合は不一致として`refuse`扱い(contracts/note-write-guard.md)。**RED。**
- [X] T006 T005を通す最小限の実装を `note_write_guard.py` の `decide` サブコマンドに書く(data-model.md「Write Decision」の`decide()`をそのまま実装)。**GREEN。**(T001-T006: `bash tests/run-note-write-guard.sh` — 14 tests, OK)
- [X] T007 `.claude/skills/apple-notes/scripts/write_note.js` の引数パーサ(`parseArgs`)に `--overwrite-stdin`(真偽フラグ)、`--delete`(真偽フラグ)、`--expect-hash <value>` を追加する。この時点ではまだ処理を分岐させない(既存の`opts.blockName ? ... : opts.id ? ... : ...`という`run()`のディスパッチに新しい分岐を足す準備のみ)。`--expect-hash`が必要なのに欠けている場合はここでApple Eventsに触れる前にエラー終了する(contracts/write-note-overwrite-delete.md「Failure behavior」)。(引数バリデーションはosascriptで直接確認済み — 5パターンのエラーメッセージが期待通り)
- [X] T008 `.claude/skills/apple-notes/scripts/list_notes.js` の `toPlainText(html)` 関数を `write_note.js` に複製する(research.md §3)。複製であることをコメントで明記し、乖離を防ぐための注記を残す。

**Checkpoint**: `note_write_guard.py`の決定層は完全にテスト済み。`write_note.js`は新しいフラグを受け取れるが、まだ実際の上書き・削除は行わない。

---

## Phase 3: User Story 1 - 既存の自由記述を訂正する (Priority: P1) 🎯 MVP

**Goal**: `--overwrite-stdin --expect-hash <hash>` で、ハッシュが一致する場合のみノート本文全体を安全に置き換えられる。

**Independent Test**: quickstart.md 手順2・3(上書きの成功、および古いハッシュでの拒否)。

### Implementation for User Story 1

- [X] T009 [US1] `write_note.js` に、対象ノートの現在の本文からハッシュを計算する内部ヘルパーを実装する: `note.body()`を`toPlainText`(T008)でplaintext化 → `NSTemporaryDirectory()`配下の一時ファイルに書く → `NSTask`(`launchPath: /usr/bin/python3`, `arguments: [<note_write_guard.py の絶対パス>, "hash"]`, `standardInput: <一時ファイルのNSFileHandle>`)を実行 → 標準出力を読んでhexdigestを得る → 一時ファイルを削除する(research.md §2)。US2でも再利用するため、`--overwrite-stdin`専用にしない。(実装は`guardDecide`に統合 — `decide`サブコマンドが内部でハッシュ計算も行うため、`hash`単独呼び出しは不要だった)
- [X] T010 [US1] `write_note.js` の`run()`ディスパッチに`--overwrite-stdin`の分岐を追加する: T009のヘルパーで現在のハッシュを計算 → `note_write_guard.py decide --expect-hash <値>`をNSTask経由で呼ぶ(同じくT009のNSTaskパターンを再利用、標準入力は一時ファイル経由で現在のplaintext) → `refuse`ならノートに一切触れずエラー終了(contracts/write-note-overwrite-delete.md) → `allow`なら標準入力の新しい本文をHTML化して`note.body`を置換し、新しい本文の1行目を`note.name`にも設定する(research.md §5)。成功時は既存の`describe(note, folderName)`と同じ形状で返す。
- [X] T011 [US1] macOS実機で quickstart.md 手順2・3 を実行する: テスト用ノートを作成し正しいハッシュで上書き(元の内容が残っていないことを確認)、続けて古いハッシュのまま再度上書きを試み拒否されること(本文が変わっていないこと)を確認する。結果を`quickstart.md`に日付付きの"Verification Evidence"として追記する(spec 004の`quickstart.md`と同じ様式)。

**Checkpoint**: `--overwrite-stdin`は単独で完全に機能し、独立して検証できる(MVP)。

---

## Phase 4: User Story 2 - 不要になったノートを削除する (Priority: P2)

**Goal**: `--delete --expect-hash <hash>` で、ハッシュが一致する場合のみノートを削除でき、削除後の回収可否が検証済みの事実として分かっている。

**Independent Test**: quickstart.md 手順4(削除の成功、拒否、「最近削除した項目」での回収可否の目視確認)。

### Implementation for User Story 2

- [X] T012 [US2] `write_note.js` の`run()`ディスパッチに`--delete`の分岐を追加する: T009のヘルパーを再利用してハッシュ判定 → `refuse`なら削除せずエラー終了(US1と同じ失敗経路) → `allow`なら削除前に`id`・`name`・フォルダ名を取得してから`app.delete(note)`(research.md §4のJXAイディオム)でノートを削除し、`{id, name, folder, deleted: true}`を返す(contracts/write-note-overwrite-delete.md)。
- [X] T013 [US2] macOS実機で quickstart.md 手順4 を実行する: テスト用ノートを削除し、通常のフォルダ一覧から消えていることを確認した上で、Notes.appの「最近削除した項目」フォルダを目視で確認する。**回収可能かどうかを推測せず、実際に確認した結果**を`quickstart.md`に追記する。(確認済み: 同一idで「最近削除した項目」に実在)
- [X] T014 [US2] T013で確認した削除の回収可否(残る/残らない、残る場合の保持期間)を、事実として`.claude/skills/apple-notes/SKILL.md`に記録する(ADR 0007 Confirmation、spec FR-008 — 検証前に安全性を主張しない)。

**Checkpoint**: US1・US2ともに独立して機能する。

---

## Phase 5: User Story 3 - 実行前に利用者の承認を得る運用に揃える (Priority: P3)

**Goal**: `--overwrite-stdin`/`--delete`を呼ぶ前に、置き換える内容・削除対象を利用者に提示し承認を得る、という運用規約がドキュメントに明記されている。

**Independent Test**: `apple-notes` SKILL.mdと`apple-notes-operator.md`を読み、この規約が明記されていることを確認できる。

### Implementation for User Story 3

- [X] T015 [US3] `.claude/skills/apple-notes/SKILL.md` に `--overwrite-stdin`/`--delete`/`--expect-hash`の使い方(contracts/write-note-overwrite-delete.md準拠)と、「呼び出す前に利用者へ内容を提示し明示的な承認を得ること」という運用規約を追記する。T014で記録した削除の回収可否の事実もここに含める(US2で既に書いていれば、ここでは一箇所にまとまっていることを確認するだけでよい)。
- [X] T016 [US3] `.claude/agents/apple-notes-operator.md` に同じ運用規約(呼び出し前の利用者承認)を追記する。

**Checkpoint**: 3つのUser Storyすべてが独立して機能・検証済み。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 個別のUser Storyに閉じない、リポジトリ全体のドキュメント整合性と回帰確認。

- [X] T017 [P] `CLAUDE.md`の「破壊的操作」節を更新する: Notes側の全文上書き・削除がもはや構造的に不可能ではなく、`--expect-hash`による条件付きで可能になった実態を反映する。Remindersの削除が引き続き不可能であることは変更しない(spec FR-010)。
- [X] T018 quickstart.md 手順5(既存の全回帰スイート: `run-scrum-block.sh`, `run-flow-metrics.sh`, `run-apple-operators.sh`, `run-project-registry.sh`, `run-scrum-role-agents.sh`, `run-note-write-guard.sh`)を実行し、無修正で全て成功することを確認する(spec SC-004)。**注: `run-apple-operators.sh`は「Notesは削除機能を一切持たない」ことを検証する契約テストを含んでおり、ADR 0007による意図的な契約変更のため更新が必要だった(単なる無修正の回帰確認では済まなかった)。更新後、全159チェックがパス。**
- [X] T019 T008で複製した`toPlainText`が`list_notes.js`のものと同じ出力になることを確認した(research.md §3「Mitigation」)。関数本体を`diff`で突き合わせて完全一致を確認し、さらに実機検証(T011)で`list_notes.js --plaintext`から計算したハッシュが`write_note.js`内部の`toPlainText`が計算したハッシュと一致して`--overwrite-stdin`が成功したことでも間接的に裏付けられた。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし、即着手可能。
- **Foundational (Phase 2)**: Setup完了後。US1・US2・US1由来のドキュメントをすべてブロックする。US3(ドキュメントのみ)はFoundational完了前でも並行して下書きを進められるが、T015/T016の内容がT013/T014の検証結果に依存するため、実質的にはUS2完了後に確定する。
- **User Story 1 (Phase 3)**: Foundational完了後、他のUser Storyに依存しない。
- **User Story 2 (Phase 4)**: Foundational完了後。T009のハッシュ計算ヘルパーをUS1と共有するが、US1の完了を待つ必要はない(T009自体はFoundationalの一部)。
- **User Story 3 (Phase 5)**: US2のT013/T014(削除の回収可否の検証結果)に依存 — この事実がないとSKILL.mdに正確な記述を書けない。
- **Polish (Phase 6)**: すべてのUser Story完了後。

### Parallel Opportunities

- T001とT002は並行可能(別ファイル)。
- T003とT005は並行可能(同じファイルへの追記だが、独立したテストケース — 実際に同時編集する場合はコンフリクトに注意)。
- T017は他のPolishタスクと並行可能。

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup
2. Phase 2: Foundational(CRITICAL — 全User Storyをブロックする)
3. Phase 3: User Story 1
4. **STOP and VALIDATE**: quickstart.md 手順2・3を実機で実行し、上書きが単独で動くことを確認する。

### Incremental Delivery

1. Setup + Foundational → 土台完成
2. User Story 1(上書き)→ 独立検証 → MVP
3. User Story 2(削除)→ 独立検証
4. User Story 3(運用規約のドキュメント化)→ US2の検証結果に依存するため最後
5. Polish(CLAUDE.md更新、全回帰確認)

---

## Notes

- [P] = 別ファイル、依存タスクなし
- 各テストタスクは、対応する実装タスクの前に失敗する状態で書く(RED → GREEN)。
- Apple Events層(JXA)には決定的テストが書けないという既存の制約は変えない — 実装後のmacOS実機でのquickstart検証を「テスト」として扱い、証拠(Verification Evidence)を残す。
- T013・T014(削除の回収可否)は、検証前に結果を先取りして書かない。
