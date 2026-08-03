# apple-task-manager

個人用スクラム運用システム。Apple Reminders と Apple Notes を記録源に、
経験主義（透明性・検査・適応）を単独作業に適用する。設計の全体は
[README.md](README.md)、意思決定は [docs/adr/](docs/adr/) にある。

**これは Scrum ではない。** README §0 を先に読むこと。この但し書きを維持する
責任は残り続ける——放置すると「Scrum をやっているつもり」に退行する。

## リポジトリの境界

| リポジトリ | 役割 |
| --- | --- |
| **apple-task-manager**（ここ） | 実装。スキル、サブエージェント、スクリプト、テスト |
| **my-claude-code** | `scrum-master` スキルの**参照元**。ユーザースコープに導入済みのものを使う |

依存は一方向である。ここが `scrum-master` を利用し、`scrum-master` は
Apple のアプリを一切知らない。**この目的のために my-claude-code を変更しない。**
汎用の Scrum スキルに特定のタスクアプリの配線を持たせないことが、そもそも
正しい形である（[ADR 0005](docs/adr/0005-project-scoped-apple-artifacts.md)）。

`flow_metrics.py` は vendoring せず、導入済みの実体を使う：
`~/.claude/skills/scrum-master/scripts/flow_metrics.py`

## 検査役として振る舞うとき

Scrum の相談——スプリントの検査、Sprint Goal の吟味、レトロ、障害除去——では
`scrum-master` スキルを読み込む。**自動では立ち上がらない。** 同スキルの
ルーティングは個人利用を対象にしておらず、ここでもそれを変えていない。
呼ぶのは利用者の明示的な操作である（README §4）。

### データアクセスは委譲する

記録源の中身を本体の会話に読み込まない。リスト全件の JSON やノート本文の
HTML は、必要なのは結論だけなのに以後のセッション全体を占有する。

| サブエージェント | 担当 |
| --- | --- |
| `apple-reminders-operator` | Reminders 上の Sprint Backlog。取得・作成・完了、`item_id,started_at,completed_at` への変換、`flow_metrics.py` の実行まで行い指標だけを返す |
| `apple-notes-operator` | Notes 上の Sprint Goal、Definition of Done、レトロ記録、障害記録の読み書き |

**委譲するのはデータアクセスだけで、判断は委譲しない。** Sprint Goal が
作業一覧の言い換えになっていないかの検査、停滞項目の解釈、改善実験の設計、
アカウンタビリティの境界——これらは `scrum-master` の仕事として残る。
サブエージェントは事実を持ってくるだけで、何も検査しない。

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
bash tests/run-apple-operators.sh   # 成果物間の契約
```

いずれも決定的で macOS を必要としない。**ネイティブコードはどちらのスイートでも
実行されない**——`remind-cli` はコンパイルに macOS と `swiftc` が要り、Notes の
JXA は Notes.app と Automation 許可のある Mac でしか動かない。そちらを
「検証済み」と表現しない（README §7）。

## 依存方針

パッケージマニフェスト、ロックファイル、サードパーティ CLI、コミュニティ製
MCP サーバーを導入しない。依存先は Apple 同梱の framework と macOS 同梱の
`osascript` だけ（[ADR 0004](docs/adr/0004-per-app-optimal-automation.md)）。
