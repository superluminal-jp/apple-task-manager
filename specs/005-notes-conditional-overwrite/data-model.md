# Phase 1 Data Model: Notes 条件付き上書き・削除

このフィーチャーはデータベースを持たない(Notes.appそのものが記録源、
[ADR 0001](../../docs/adr/0001-reminders-as-system-of-record.md))。ここでは
CLI呼び出しをまたいでやり取りされる概念上のエンティティと、その検証ルールを
記述する。

## Note(既存、変更なし)

Notes.app内の1件のノート。本フィーチャーが新たに参照するフィールドのみ記す
(全体は`apple-notes` SKILL.mdの「The property surface」参照)。

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | string(opaque) | `x-coredata://...`形式の不透明なハンドル。`--id`で指定する対象 |
| `body` | string(HTML) | 実際の格納形式 |
| `plaintext` | string(derived) | `body`のHTMLタグを除去した表現。`list_notes.js`の`toPlainText`と`write_note.js`が複製する同名関数で導出する。**保存されたフィールドではなく、都度計算される導出値** |
| `name` | string | Notes内部のタイトルプロパティ。表示タイトルは本文の1行目から派生するため、`--overwrite-stdin`は両方を新しい1行目に揃える(research.md §5) |

## Expected Hash(新規、永続化しない)

呼び出し元が「直前に読んだ」と主張するノート本文の状態を表す、呼び出しごとの
一時的な値。ノートには保存されない。

| フィールド | 型 | 検証ルール |
|---|---|---|
| `--expect-hash` | string | 64文字の小文字16進文字列(SHA-256のhexdigest形式)。この形式に一致しない値が渡された場合、`note_write_guard.py`は「hashを計算した」とは扱わず、単なる不一致として拒否する(形式チェックのために別のエラー種別を設けない — 「一致しない」の一種として扱うことで失敗モードを増やさない) |

## Write Decision(新規、`note_write_guard.py`の中核ロジック)

`--overwrite-stdin`/`--delete`の実行可否を決める、副作用のない純粋な判定。

```text
decide(current_plaintext: str, expected_hash: str) -> ALLOW | REFUSE

current_hash := sha256_hexdigest(current_plaintext)
if current_hash == expected_hash: ALLOW
else: REFUSE
```

**状態遷移はない** — この判定はノートの現在の状態と呼び出し引数だけから
決まる純関数であり、呼び出しをまたいだ内部状態を持たない。これが
`tests/test_note_write_guard.py`で決定的にテストできる理由でもある。

### 検証ルール

- `current_plaintext`は空文字列を許容する(空のノート本文も有効な状態)。
- `expected_hash`が省略された場合、`decide`を呼ぶ前に`write_note.js`側で
  必須引数エラーとして拒否する(spec FR-006) — `decide`自体は「省略」という
  入力を受け取らない契約にする(呼び出し前提条件として上位層が保証する)。
- `ALLOW`の場合のみ、`write_note.js`はApple Events経由の実書き込み
  (`--overwrite-stdin`なら本文置換、`--delete`なら削除)を実行する。
  `REFUSE`の場合、Apple Events層は一切呼ばれない — 「読んでから書くまでに
  変わっていた」ことが分かった時点で、実際の書き込み経路に到達させない。

## Write Outcome(既存の`describe()`パターンを踏襲)

`--overwrite-stdin`成功時は、既存の`create`/`append`/`replaceBlock`と同じ
`describe(note, folderName)`形状(`id`, `name`, `folder`, `creationDate`,
`modificationDate`)のJSONを返す。`--delete`成功時は、対象が既に一覧から
消えているため同じ形状を返せない — 削除前に確認した`id`・`name`・`folder`と、
`deleted: true`を含む別形状のJSONを返す(contracts/参照)。
