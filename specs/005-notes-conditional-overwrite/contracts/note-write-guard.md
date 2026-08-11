# Contract: `note_write_guard.py`

Pure Python、プラットフォーム非依存 — `scrum_block.py`/`project_registry.py`と
同じ役割分担(Apple側APIで取得・書き込みし、Pythonで解釈する)を担う新しい
スクリプト。このスクリプト自身は`osascript`を一切呼ばない。

## Invocation

```bash
# ノートのplaintext本文からSHA-256 hexdigestを計算して標準出力に返す。
# 呼び出し元(人間・エージェント)が --expect-hash に渡す値を作るのにも、
# write_note.js が書き込み直前の現在値を計算するのにも、同じサブコマンドを使う。
echo -n "<plaintext本文>" | python3 "$S/note_write_guard.py" hash

# 現在のplaintextと期待するハッシュを比較し、一致すれば "allow"、
# 不一致なら "refuse" を標準出力に返して終了コード0で終わる(判定結果を
# 呼び出し元プロセスの終了コードではなく出力で表現する — write_note.js側で
# 「refuseなら書き込まずエラーメッセージを出す」という次の分岐がしやすいように)。
echo -n "<現在のplaintext本文>" | python3 "$S/note_write_guard.py" decide --expect-hash "<hash>"
```

## `hash` サブコマンド

- 標準入力からUTF-8テキストを読み、SHA-256のhexdigest(64文字の小文字16進
  文字列)を標準出力に1行で返す。
- 空の標準入力に対しては、空文字列のSHA-256(`e3b0c442...`)を返す — エラーに
  しない(data-model.md「空文字列を許容する」)。

## `decide` サブコマンド

- `--expect-hash <hash>`を必須の引数として受け取る。省略された場合は
  非ゼロ終了コードとstderrへのメッセージで停止する(呼び出し側の使い方の
  誤りとして扱う — これは「ハッシュ不一致」とは別の失敗モード)。
- 標準入力から現在のplaintext本文を読み、`hash`サブコマンドと同じロジックで
  hexdigestを計算し、`--expect-hash`と単純な文字列比較(大文字小文字は区別
  する — hexdigestは常に小文字で生成されるため、呼び出し元が大文字で渡した
  場合は意図的に不一致として扱う)を行う。
- 一致すれば標準出力に`allow`、不一致なら`refuse`を返し、どちらの場合も
  終了コード0で終わる。比較結果を終了コードで表現しないのは、`write_note.js`
  側の`NSTask`呼び出しで「プロセス自体が異常終了したのか」と「正常に判定した
  結果がrefuseだったのか」を区別しやすくするため。

## Failure behavior

- `hash`/`decide`とも、標準入力が渡されない(パイプ元がない)場合はOSレベルで
  空入力として扱われる(空文字列のハッシュを返す) — スクリプト側で追加の
  エラー処理はしない。
- `decide`で`--expect-hash`が省略された場合のみ、非ゼロ終了・stderrメッセージ
  というエラー経路を持つ。それ以外に、このスクリプトが例外的に失敗する経路は
  ない(純粋な文字列処理のみで、ファイルI/O・ネットワーク・Apple Eventsを
  一切行わない)。

## Never does

- `osascript`を呼ばない。Notesのノートを読み書きしない。判定結果を元に
  実際の書き込み・削除を行うのは`write_note.js`の役目であり、このスクリプトは
  「一致するかどうか」を答えるだけ。
