# Contract: `write_note.js --overwrite-stdin` / `--delete`

既存の`write_note.js`(create / append / `--replace-block`)に、2つの新しい
書き込みモードを追加する。どちらも`--id`(対象ノート)と`--expect-hash`
(直前に読んだ本文のSHA-256)を必須とする。

## Invocation

```bash
S="${CLAUDE_SKILL_DIR}/scripts"

# 現在の本文を読み、ハッシュを計算してから、新しい本文で全文置換する
CURRENT=$(osascript -l JavaScript "$S/list_notes.js" --id "<id>" --plaintext --field plaintext)
HASH=$(printf '%s' "$CURRENT" | python3 "$S/note_write_guard.py" hash)
echo "新しい本文" | osascript -l JavaScript "$S/write_note.js" --id "<id>" \
  --overwrite-stdin --expect-hash "$HASH"

# 削除(標準入力は不要 — 消すだけなので新しい本文はない)
osascript -l JavaScript "$S/write_note.js" --id "<id>" --delete --expect-hash "$HASH"
```

## `--overwrite-stdin`

- `--id`と`--expect-hash`を必須とする。どちらか一方でも欠けている場合、
  Apple Eventsで対象ノートに触れる前にエラー終了する(spec FR-006)。
- 標準入力からテキストを読み、既存の`create`と同じエスケープ・`<div>`折り
  返し規則(1行1`<div>`)でHTMLに変換し、ノートの`body`全体をその内容で
  置き換える。
- 書き込み直前に、対象ノートの現在の`body`から`toPlainText`でplaintextを
  導出し、`note_write_guard.py decide --expect-hash <値>`に渡す。結果が
  `refuse`なら、**ノートに一切変更を加えず**、非ゼロ終了コードと
  「本文が変更されているため上書きを拒否した」旨のメッセージをstderrに出す
  (spec FR-004, FR-005)。
- `allow`の場合のみ、新しい本文の1行目を`note.name`にも設定した上で
  (research.md §5)、本文を置き換える。
- 成功時のJSON出力は既存の`create`/`append`/`replaceBlock`と同じ形状
  (`id`, `name`, `folder`, `creationDate`, `modificationDate`)。
- `--id`で指定した対象ノート以外を変更しない(spec FR-007)。既存の
  `--replace-block`の挙動には一切触れない(spec FR-011)。

## `--delete`

- `--id`と`--expect-hash`を必須とする。標準入力は不要(渡されても無視する
  — 削除に本文は要らない)。
- ハッシュ照合ロジックは`--overwrite-stdin`と共通(`decide`の同じ契約)。
  `refuse`の場合、ノートは削除されず、同じ形のエラーで停止する。
- `allow`の場合、削除前に`id`・`name`・フォルダ名を取得しておいてから、
  `app.delete(note)`(research.md §4のJXAイディオム)でノートを削除する。
- 成功時のJSON出力は`--overwrite-stdin`とは異なる形状にする(削除後は
  `modificationDate`等を取得し直せないため):

  ```json
  {
    "id": "x-coredata://...",
    "name": "削除前のタイトル",
    "folder": "削除前に所属していたフォルダ名",
    "deleted": true
  }
  ```

## Failure behavior(既存の規約を踏襲)

- `--id`が解決できない(存在しないノート)場合、既存の`append`/`replaceBlock`
  と同じく「no note with id: ...」で停止する — 新しいノートを作ってしまう
  ことは絶対にない(spec Assumptions、Constitution Principle I「識別子未解決時に
  黙って代替を作らない」は変更しない)。
- `--expect-hash`が省略された場合、ハッシュ照合以前に必須引数エラーとして
  停止する(`note_write_guard.py decide`まで到達させない)。
- ハッシュが一致しない場合、`refuse`としてエラー終了し、対象ノートには
  一切の変更を加えない(このコマンドの中核となる安全保証)。
- `--overwrite-stdin`と`--delete`を同時に指定するなど、モードの組み合わせが
  矛盾する呼び出しは、既存の`opts.blockName ? ... : opts.id ? ... : ...`という
  分岐に新しい分岐を素直に追加する形で実装する限り、後から指定した方が
  優先されるような曖昧さを生まない設計にする(実装時、既存の引数パーサの
  構造に合わせて具体的な優先順位を決める)。

## Never does

- `--replace-block`の対象ブロック検出・置換ロジックには触れない。
- `project_registry.py`が読むレジストリノートの運用方法を変えない —
  技術的に上書き・削除が可能になっても、レジストリは引き続き追記専用で
  運用する(ADR 0006、spec FR-012)。
- Remindersには一切触れない(このスクリプトはNotes専用のまま)。
