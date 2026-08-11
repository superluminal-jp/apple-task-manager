# Phase 0 Research: Notes 条件付き上書き・削除

Technical Contextに`NEEDS CLARIFICATION`は残っていない。本ドキュメントは、
実装方針を決めるうえで検討した選択肢と根拠を記録する。

## 1. ハッシュ計算をどこで行うか

**Decision**: SHA-256計算は新しいPythonモジュール`note_write_guard.py`
(標準ライブラリ`hashlib`のみ)に切り出す。`write_note.js`はノートの現在の
plaintext本文を取得した後、`python3 note_write_guard.py hash`にstdin経由で
渡して結果を受け取り、`--expect-hash`と文字列比較するだけにする。

**Rationale**:
- Constitution Principle III(Test First and Report Evidence)は、macOS不要な
  部分をプラットフォーム非依存に保つことを求めている。ハッシュ計算・比較を
  JS側に置くと、この決定的ロジックがosascript(macOS専用)経由でしか実行・
  検証できなくなる。Pythonに切り出せば`tests/test_note_write_guard.py`で
  空文字列・ASCII・日本語やUTF-8境界値を含む決定的テストを、macOS無しで
  赤→緑のまま書ける。
- 既存の`scrum_block.py`/`project_registry.py`が既に確立している
  「Apple側APIで取得・書き込みし、Pythonで解釈する」という分業パターンと
  一致する(`docs/adr/0006-project-registry-as-notes-event-log.md`参照)。
- `python3`はこのリポジトリ全体が既に依存しているmacOS同梱ツールであり、
  新しいサードパーティ依存の追加にあたらない([ADR 0004](../../docs/adr/0004-per-app-optimal-automation.md))。

**Alternatives considered**:
- **JS内に純粋なSHA-256実装をインラインで書く**: 却下。追加の外部依存は
  ゼロになるが、`osascript`でしか実行できないため決定的テストが書けず、
  Principle IIIの要求を満たせない。
- **ObjC bridging経由でCommonCryptoの`CC_SHA256`を呼ぶ**: 却下。JXAから
  C関数を直接呼ぶには型定義・メモリ管理をObjCブリッジ経由で組み立てる必要が
  あり複雑さに見合わない。Principle II(Public, Platform-Native Interfaces)は
  「不足している能力を回避するための私的フレームワーク」を禁じているわけ
  ではないが、標準ライブラリの`hashlib`で確実に達成できる要件のために
  複雑なブリッジコードを増やす理由がない。

## 2. `write_note.js`からPythonへどう安全に渡すか

**Decision**: `NSTask`(Foundation、既存の`ObjC.import('Foundation')`で
利用可能)を使い、`arguments`配列で`python3`と`note_write_guard.py`の
絶対パスを渡す。ノートのplaintext本文は、一時ファイル
(`NSTemporaryDirectory()`配下、ノート単位で一意な名前)に書き込んでから
`standardInput`としてそのファイルハンドルを渡す。標準出力(64文字の16進
文字列のみ)は`waitUntilExit`後に読み取る。一時ファイルは処理後に削除する。

**Rationale**:
- シェル文字列に本文を直接埋め込む(`doShellScript("... " + body + " ...")`)
  設計は、本文に含まれうる任意の文字(バッククォート、`$()`、引用符など)に
  よるコマンドインジェクションのリスクを構造的に持つ — OWASPのコマンド
  インジェクション対策(引数を文字列結合せず配列で渡す)に反する。`NSTask`の
  `arguments`配列渡しは、シェルのパース工程そのものを経由しないため、この
  クラスのリスクを構造的に排除できる。
- 標準入力を直接パイプ(`NSPipe`)でつなぐ方式は、書き込み側・読み取り側の
  どちらもブロックせずに同時に進める必要があり、ノート本文が大きい場合に
  デッドロックしうる(OSのパイプバッファを書き込み側が埋めてしまい、
  読み取られるまで進めない)。一時ファイル経由の標準入力にすればこの問題は
  発生しない。出力は64文字の固定長なので、`waitUntilExit`後にまとめて
  読んでも安全。

**Alternatives considered**:
- **`doShellScript`に文字列結合で埋め込む**: 却下(上記のインジェクション
  リスク)。
- **`NSTask` + `NSPipe`を標準入力にも使う**: 却下(大きな本文でのデッドロック
  リスク)。一時ファイル経由の方が単純で安全。

## 3. Plaintext抽出の一貫性

**Decision**: `write_note.js`は`list_notes.js`の`toPlainText(html)`関数と
同じロジックを複製して持つ。

**Rationale**: 利用者やエージェントが「読んだ」と認識する内容(`list_notes.js
--plaintext`の出力)と、ハッシュ比較の対象を一致させる必要がある(spec
Assumptions)。JXAスクリプト間でモジュールを共有する標準的な仕組みがこの
リポジトリにはなく(各スクリプトは`osascript -l JavaScript <path>`で独立に
実行される自己完結型ファイル)、複製が現実的な選択になる。

**Mitigation**: 複製の乖離を防ぐため、`tests/test_note_write_guard.py`とは
別に、両ファイルの`toPlainText`が同じ入力に対して同じ出力を返すことを
確認するテストケース(既知のHTML断片セットに対する比較)を用意する。これは
Pythonではなく両JSファイルの出力を実機で突き合わせる形になるため、ライブ
検証の一部として扱う(macOS実機が必要)。

## 4. 削除(`--delete`)の構文と回収可否

**Decision(構文)**: JXAの標準的な削除イディオムである`app.delete(note)`
(AppleScriptの汎用Standard Suite `delete`コマンドの、要素参照に対する呼び出し)
を使う。

**未確定・実装時にライブ検証が必要な事実**: Apple公式サポート文書は、
Notes.app(Mac)上でノートを削除すると「最近削除した項目」フォルダに移動し、
30日間は復元可能であること、また同フォルダがAppleScriptからも
`folder "Recently Deleted"`として参照可能であることを示すコミュニティ事例が
ある(出典は下記)。ただしこれはUI経由の削除、およびAppleScript一般での
経験であり、`app.delete(note)`というJXAの呼び出し経路が同じ「最近削除した
項目」への移動を経由するのか、それとも別の削除経路(即時完全削除)になるのかは、
このセッションでは検証していない。

ADR 0007のConfirmation、spec FR-008、Constitution Principle IIIのいずれも、
検証せずに「安全な削除」と書くことを禁じている。実装フェーズで、使い捨ての
テスト用ノートを作成 → `--delete`で削除 → `list_notes.js --folders`等で
「最近削除した項目」フォルダの中身を確認、という手順を踏み、結果(残る/残らない、
残る場合は何日分か画面上で確認できたか)を`apple-notes`スキルのSKILL.mdに
事実として記録する(spec FR-008、tasks.mdのライブ検証タスクとして追跡)。

**Sources**:
- [Delete a note on Mac – Apple Support](https://support.apple.com/guide/notes/delete-a-note-not5585d71a8/mac) — Mac上のノート削除は「最近削除した項目」に移動し30日間保持されると明記。
- [Apple Notes–Get the Name of All Notes not in "Recently Deleted"? – Late Night Software forum](https://forum.latenightsw.com/t/apple-notes-get-the-name-of-all-notes-not-in-recently-deleted/4434) — 「最近削除した項目」がAppleScriptから`folder "Recently Deleted"`として参照可能であることのコミュニティでの言及。

## 5. `--overwrite-stdin`とノートの表示タイトルの整合

**Decision**: `--overwrite-stdin`は、新しい本文の1行目をタイトルとして
`note.name`にも明示的に設定する(既存の`create`関数が「本文の1行目が表示
タイトルになるが、`name`プロパティは別に持つため両方を設定する」という
コメント付きで行っているのと同じ処理)。

**Rationale**: 全文置換なので、本文の1行目が変われば表示タイトルも当然
変わるべきであり、既存の`create`パスの挙動と一貫させることで、`name`
プロパティと表示タイトルが食い違う状態を防ぐ。
