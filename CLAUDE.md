# apple-task-manager

個人用スクラム運用システム。Apple Reminders と Apple Notes を記録源に、
経験主義（透明性・検査・適応）を単独作業に適用する。設計の全体は
[README.md](README.md)、意思決定は [docs/adr/](docs/adr/) にある。

**これは Scrum ではない。** README §0 を先に読むこと。この但し書きを維持する
責任は残り続ける——放置すると「Scrum をやっているつもり」に退行する。

## リポジトリの境界

**本リポジトリは自己完結している。** クローンすれば動き、`my-claude-code` の
インストールを前提としない。`scrum-master` スキルはここに vendoring されている
（[ADR 0005](docs/adr/0005-project-scoped-apple-artifacts.md)）。

**この目的のために my-claude-code を変更しない。** 汎用の Scrum スキルに
特定のタスクアプリの配線を持たせないことが、そもそも正しい形である。

### vendoring した `scrum-master` の扱い

`.claude/skills/scrum-master/` は `my-claude-code` からの**スナップショット**で
あり、上流は生きている（同リポジトリで保守が続く）。同期の仕組みは持たない
——出所を記録することと、リンクを維持することは別である。

- **ここで編集しない。** 編集すれば、上流と黙って乖離する。Scrum の作法そのものを
  変えたくなったら、上流（`my-claude-code`）で直してから取り込み直す。
- 本リポジトリ固有の取り決め——両オペレーターへの委譲、着手記録の扱い——は
  vendoring したスキルではなく**このファイル**に書く。下の節がそれである。
- 取り込み元のコミットは ADR 0005 に記録されている。乖離を疑ったらそこと
  差分を取る。

`flow_metrics.py` も同じ扱いで、`.claude/skills/scrum-master/scripts/` にある。
単体テスト（`tests/test_flow_metrics.py`）も一緒に取り込んであるため、
取り込んだコードが検証されないまま置かれることはない。

## 検査役として振る舞うとき

Scrum の相談——スプリントの検査、Sprint Goal の吟味、レトロ、障害除去——では
`scrum-master` スキルを読み込む。**自動では立ち上がらない。** 同スキルの
ルーティング定義は個人利用を対象にしておらず、vendoring したコピーでも
それを書き換えていない。呼ぶのは利用者の明示的な操作である（README §4）。

### 役割視点は別コンテキストで検査する

価値と実現可能性の両方を検査するときは、同じ会話でPO役とDevelopers役を
演じ分けない。次の順で実行する。

1. `scrum-master` スキルを明示的に読み込む。
2. 必要な記録だけを `apple-reminders-operator` と `apple-notes-operator` に取得させる。
3. PO側にはProduct Goal、利用者・ステークホルダーの証拠、成果の証拠、候補項目を
   渡し、`product-owner-perspective` を**別コンテキスト**で起動する。
4. Developers側には候補Sprint Goal、候補項目、Definition of Done、容量実績、
   技術・品質制約を渡し、`developers-perspective` を別コンテキストで起動する。
5. 両者が完了するまで、**相手のレポートを渡さない**。片方の結論を要約して
   混ぜることも、同じ親会話の全履歴を渡すこともしない。
6. 両レポートの事実、推論、仮定、対立、証拠不足を `scrum-master` の規範で
   比較し、次の検査機会を示す。**最終判断は人間**に返す。

両エージェントはアカウンタビリティではなく助言用の視点である。合意しても
独立した根拠を並べ、対立しても偽の合意に丸めない。どちらかのブリーフに相手の
レポートが入った場合、その結果を独立した検査として扱わず、新しいコンテキストで
やり直す。

### データアクセスは委譲する

記録源の中身を本体の会話に読み込まない。リスト全件の JSON やノート本文の
HTML は、必要なのは結論だけなのに以後のセッション全体を占有する。

| サブエージェント | 担当 |
| --- | --- |
| `apple-reminders-operator` | Reminders 上の Sprint Backlog。取得・作成・完了、`item_id,started_at,completed_at` への変換、`flow_metrics.py` の実行まで行い指標だけを返す |
| `apple-notes-operator` | Notes 上の Sprint Goal、Definition of Done、レトロ記録、障害記録の読み書き |

**Appleオペレーターに委譲するのはデータアクセスだけで、判断は委譲しない。** Sprint Goal が
作業一覧の言い換えになっていないかの検査、停滞項目の解釈、改善実験の設計、
アカウンタビリティの境界——これらは `scrum-master` の仕事として残る。
データアクセス用サブエージェントは事実を持ってくるだけで、何も検査しない。
役割視点エージェントは、渡された限定的な事実だけを検査し、Appleアプリへ直接
アクセスしない。

**指標を受け取ったら、必ず着手記録のない項目の件数を併せて報告する。**
着手が記録されていない項目は Cycle Time の母数から落ちる。母数を伏せた
中央値は Sprint の中央値ではなく、透明性を損なう。

Lead Time（作成→完了）と Cycle Time（着手→完了）は別物として扱う。
両者の差は Product Backlog での待ち時間であり、それ自体が診断に使える。

## 破壊的操作

**Reminders と Notes の削除・全文上書きは行わない。** どちらの書き込み経路にも
削除機能が存在せず（`remind-cli` に `delete` コマンドが無く、`write_note.js` は
append のみ）、これは指示ではなく構造である。インライン AppleScript や
その場限りの Swift で迂回しない。

理由は2つ。リマインダーの削除は Cycle Time の唯一の記録を失う。そして
**EventKit の呼び出しも Apple Event も、destructive-command フックからは
見えない**——シェルコマンドは検査できても、それが送るメッセージは検査できない。
利用者が削除を求めたら、アプリ上のどこを操作するかを伝える。

## 実行環境

- **macOS 必須。** Reminders は EventKit（Darwin 専用）、Notes は AppleScript。
  Linux や CI では動かない。
- **権限は2カテゴリに分かれる。** Reminders（EventKit）とオートメーション（Notes）。
  別々に承認が要り、別々に拒否される。どちらも非対話では付与できない。
- **`remind-cli` はビルドが要る。** gitignore 対象。無ければ
  `.claude/skills/apple-reminders/scripts/build.sh` を実行してから続ける。
- **iPhone は補助。** Notes への書き込み自動化は macOS のみ。iPhone からの
  項目追加は Shortcuts が唯一の現実的な経路で、これは人がボタンを押す操作である。

## 検証

```sh
bash tests/run-scrum-block.sh       # scrum_block.py の単体テスト
bash tests/run-flow-metrics.sh      # flow_metrics.py の単体テスト（vendoring 分）
bash tests/run-apple-operators.sh   # 成果物間の契約
bash tests/run-scrum-role-agents.sh # 役割視点と別コンテキスト配線の契約
```

いずれも決定的で macOS を必要としない。**ネイティブコードはどちらのスイートでも
実行されない**——`remind-cli` はコンパイルに macOS と `swiftc` が要り、Notes の
JXA は Notes.app と Automation 許可のある Mac でしか動かない。そちらを
「検証済み」と表現しない（README §7）。

## 依存方針

パッケージマニフェスト、ロックファイル、サードパーティ CLI、コミュニティ製
MCP サーバーを導入しない。依存先は Apple 同梱の framework と macOS 同梱の
`osascript` だけ（[ADR 0004](docs/adr/0004-per-app-optimal-automation.md)）。
