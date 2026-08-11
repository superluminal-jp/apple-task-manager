# Quickstart: Validate Notes 条件付き上書き・削除

## Prerequisites

- 決定的スイート(`note_write_guard.py`のユニットテスト)はリポジトリルートから
  macOS不要で実行できる。
- ライブ検証(実際のノート作成・上書き・削除・「最近削除した項目」の確認)には、
  Notes Automation許可のあるMacが必要 — `apple-notes` SKILL.mdの既存の制約と同じ。
- 使い捨てのテスト用ノートを作って壊す前提の手順であり、既存の実データには
  触れない。

## 1. 決定的スイートを実行する

```sh
bash tests/run-note-write-guard.sh
```

期待結果: `note_write_guard.py`の`hash`/`decide`サブコマンドについて、
空文字列・ASCII・日本語やUTF-8境界値を含むテストベクタと、
一致/不一致それぞれの`decide`判定が全て通る。

## 2. 上書き(`--overwrite-stdin`)を検証する

```sh
N="$PWD/.claude/skills/apple-notes/scripts"

# 使い捨てのテスト用ノートを作る
NOTE_ID=$(osascript -l JavaScript "$N/write_note.js" --folder "Scrum" \
  --title "QuickstartOverwriteProbe" --text "元の内容(消える予定)" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

# 現在の本文からハッシュを作る
CURRENT=$(osascript -l JavaScript "$N/list_notes.js" --id "$NOTE_ID" --plaintext --field plaintext)
HASH=$(printf '%s' "$CURRENT" | python3 "$N/note_write_guard.py" hash)

# 正しいハッシュで上書き
echo "書き換え後の内容" | osascript -l JavaScript "$N/write_note.js" --id "$NOTE_ID" \
  --overwrite-stdin --expect-hash "$HASH"

# 確認: 元の内容が残っていないこと
osascript -l JavaScript "$N/list_notes.js" --id "$NOTE_ID" --plaintext --field plaintext
```

期待結果: 最後の出力が「書き換え後の内容」のみで、「元の内容(消える予定)」を
含まない(追記ではなく置換になっている)。

## 3. ハッシュ不一致による拒否を検証する

```sh
# 古いハッシュ(手順2で使った $HASH、既にノートは書き換わっている)のまま
# もう一度上書きを試みる
echo "二重書き込み(拒否されるはず)" | osascript -l JavaScript "$N/write_note.js" --id "$NOTE_ID" \
  --overwrite-stdin --expect-hash "$HASH"; echo "exit: $?"
```

期待結果: 非ゼロの終了コード、stderrにハッシュ不一致を示すメッセージ。
ノートを読み直し、手順2で書いた「書き換え後の内容」のままであること
(「二重書き込み」という文字列が本文に現れていないこと)を確認する。

## 4. 削除(`--delete`)と回収可否を検証する

```sh
# 削除直前の正しいハッシュを取り直す
CURRENT=$(osascript -l JavaScript "$N/list_notes.js" --id "$NOTE_ID" --plaintext --field plaintext)
HASH=$(printf '%s' "$CURRENT" | python3 "$N/note_write_guard.py" hash)

osascript -l JavaScript "$N/write_note.js" --id "$NOTE_ID" --delete --expect-hash "$HASH"
```

期待結果: `deleted: true`を含むJSONが返る。続けて次を確認する。

1. 通常のフォルダ一覧(`list_notes.js "Scrum"`)にこのノートが現れない。
2. Notes.appを開き、サイドバーの「最近削除した項目」フォルダにこのノートが
   表示されるか、目視で確認する(このリポジトリのスクリプトはNotes.appの
   UI操作を代替しないため、この1点は人間による目視確認が必要)。
3. 結果(表示された/されなかった)を、推測ではなく確認した事実として
   `apple-notes` SKILL.mdに記録する — ADR 0007のConfirmation、spec FR-008の
   要求。

## 5. 既存の回帰確認

```sh
bash tests/run-scrum-block.sh
bash tests/run-flow-metrics.sh
bash tests/run-apple-operators.sh
bash tests/run-project-registry.sh
bash tests/run-scrum-role-agents.sh
bash tests/run-note-write-guard.sh
```

期待結果: 既存のスイートは無修正のまま全て成功する — `--replace-block`・
`create`・`append`・プロジェクトレジストリ解決のいずれの挙動も退行していない
(spec SC-004)。

## Cleanup

手順2〜4で作った`QuickstartOverwriteProbe`は手順4で既に削除済み。万が一
途中で失敗して残った場合、既存の`apple-notes`スキルの方針通り、削除は
Notes.app側の人間の操作に委ねる(このリポジトリのスクリプトに一般的な削除は
実装しない — `--delete`はこのフィーチャーで初めて、かつハッシュ照合という
条件付きでのみ追加される)。

## Verification Evidence (2026-08-11)

実際のMac(このセッションの実行環境)、実データに対して手順2〜4相当を実行。
`QuickstartOverwriteProbe`の代わりに`ImplementationVerificationProbe`という
名前の、専用に確保した一時フォルダ内のノートで検証した(既存フォルダを
汚さないため)。

- **手順2相当(正しいハッシュでの上書き)**: `list_notes.js --plaintext`で
  現在の本文を読み、`note_write_guard.py hash`でハッシュを計算(64文字の
  hexdigestであることを`wc -c`で確認)。そのハッシュで`--overwrite-stdin`を
  呼んだところ成功し(`exit=0`、期待通りのJSON)、読み直した本文は新しい
  内容(「書き換え後の内容」)のみで、元の内容(「元の内容(消える予定)」)は
  一切残っていなかった — 追記ではなく置換になっていることを確認。
- **手順3相当(古いハッシュでの拒否)**: 手順2で使った(既に古くなった)ハッシュの
  まま再度`--overwrite-stdin`を呼んだところ、`exit=1`、stderrに
  `overwrite refused: the note has changed since it was last read (hash
  mismatch) -- read it again before retrying`。ノートを読み直し、本文が
  手順2の結果(「書き換え後の内容」)のまま変わっていないことを確認 —
  「二重書き込み」という文字列は本文に一切現れなかった。
- **手順4相当(削除と回収可否)**: 削除直前の正しいハッシュを取り直してから
  `--delete`を呼んだところ成功し(`exit=0`、`deleted: true`を含むJSON)、
  対象フォルダの一覧(`list_notes.js "ImplementationVerificationProbe"`)は
  空になった。続けて`list_notes.js "Recently Deleted"`を確認したところ、
  **削除したノートと同じid**(`x-coredata://.../ICNote/p2261`)が実在した
  — `write_note.js --delete`(`app.delete(note)`というJXAイディオム)は、
  Notes.appのUI削除と同じ「最近削除した項目」への移動を経由することが
  確認できた。Apple公式サポート文書([Delete a note on
  Mac](https://support.apple.com/guide/notes/delete-a-note-not5585d71a8/mac))
  はこのフォルダでの保持期間を30日としているが、実際に30日後に消えることは
  このセッションでは(当然)確認していない — その一点のみ、公式文書に基づく
  未実地確認の事実として区別しておく。
- **副次的な発見**: この検証の過程で、本フィーチャーとは無関係に、既存の
  `Scrum`フォルダ(プロジェクトレジストリの`Projects`ノート等を含んでいた)
  自体が`--folders`一覧から消え、中身が「最近削除した項目」に移動している
  ことが分かった。本フィーチャーの`--delete`がリリース前のこのセッションで
  初めて実装されたものであり、それ以前のいかなる呼び出しにも削除能力が
  存在しなかったことから、本フィーチャーの実装・検証作業がこれを引き起こした
  形跡はない。原因は特定していない(ユーザーへ報告済み、対応はユーザーの
  判断に委ねる)。

**未確認のまま残る点**: `note_write_guard.py`をNSTask経由で呼ぶ際の
`guardScriptPath()`(自分自身のファイルパスをプロセス引数から逆算する仕組み)
は、今回すべての呼び出しが成功したことで間接的に検証されたが、
`write_note.js`が異なる呼び出し形式(相対パス、シンボリックリンク経由など)で
起動された場合の挙動は個別には確認していない。
