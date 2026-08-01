---
status: Proposed
date: 2026-08-01
deciders: repository maintainer
---

# 0003. 自動化は macOS 同梱の `osascript`（AppleScript / JXA）のみで行う

## Context and problem statement

Reminders と Notes をプログラムから操作する経路を1つ選ぶ必要がある。
制約として次の2点が与えられた。

1. **外部サプライチェーンを使わない** — サードパーティの CLI、
   コミュニティ製 MCP サーバー、パッケージレジストリ経由の依存を導入しない。
2. **Apple のアップデートへの追従が容易であること**。

この2点は、初版の設計で保留にしていた「Reminders へのアクセス経路をどれに
するか（`keith/reminders-cli` / MCP サーバー / Swift 自作）」という論点を
そのまま決着させる。前2つは制約1で除外される。

残る候補は Apple 純正の3経路である。

| 経路 | 提供元 | 両アプリ対応 | 追加依存 |
| --- | --- | --- | --- |
| `osascript`（AppleScript / JXA） | macOS 同梱 | Reminders ✓ / Notes ✓ | なし |
| Shortcuts（`shortcuts run`） | Apple アプリ | Reminders ✓ / Notes ✓ | なし（GUI で作成） |
| Swift + EventKit | Apple framework | Reminders のみ | Xcode ツールチェーン |

決定的な非対称性が1つある。**Notes には EventKit に相当する framework が
存在しない。** したがって EventKit を選んでも Notes は AppleScript で
扱うことになり、機構が2つに増える。

## Decision

**Reminders と Notes の両方を、macOS 同梱の `osascript` から
AppleScript（必要に応じて JXA）で操作する。EventKit と Swift ツールチェーンは
使わない。**

したがって：

- スクリプトはリポジトリ内の**プレーンテキストの `.applescript` /
  `.js` ファイル**として置き、`osascript` で実行する。
- ビルド手順、パッケージマニフェスト、ロックファイルを一切持たない。
- 使用するプロパティは公開されている辞書の範囲に限る。Reminders は
  `id` / `name` / `body` / `completed` / `completion date` / `due date` /
  `remind me date` / `priority` / `creation date` / `modification date` /
  `container`、Notes は `id` / `name` / `body` / `creation date` /
  `modification date` / `container` と `folder`。
- private framework（ReminderKit）と Reminders/Notes の SQLite 直読みは
  採用しない。

### Alternatives considered

**Swift + EventKit で自前のバイナリを作る。** 却下。EventKit は Apple の
正式な framework であり、Reminders に対しては最も「公式」な経路で、型が
あり将来の機能追加も受けやすい。却下理由は3つ。(1) **Notes を扱えない**
ため、結局 AppleScript も併用することになり機構が2つになる。
(2) Xcode / Command Line Tools というツールチェーン依存と、ビルド成果物
（バイナリ）の管理が発生する。外部レジストリではないので制約1には触れないが、
「追従が容易」からは遠ざかる — OS 更新のたびに再ビルドと再署名の可能性を
負う。(3) TCC（プライバシー許可）を自前バイナリに与える必要があり、
署名や entitlement の扱いが増える。`osascript` は OS 同梱バイナリとして
既に許可の枠組みに乗っている。

**Shortcuts を機構にする（`shortcuts run` から呼ぶ）。** 却下。Apple が
現在最も積極的に開発している自動化基盤で、iOS でも動くという大きな利点が
あった。却下理由は2つ。(1) **ショートカットは不透明なバイナリ形式**であり、
git で差分が読めない・レビューできない・テキストとして生成や修正ができない。
本リポジトリの成果物としては、変更履歴が意味を持たなくなる。
(2) CLI から構造化データを入出力する経路が貧弱で、reminder 一覧を
機械可読な形で取り出す用途に向かない。ただし **iPhone からの項目追加は
Shortcuts が唯一の現実的な経路**なので、入力側の補助としては使う
（機構としての中心には置かない）。

**サードパーティ CLI（`keith/reminders-cli`、`remctl`）や
コミュニティ MCP サーバー。** 却下。`--format json` と正規 ID を返す
即戦力の機能があり、初版では有力候補だった。制約1により除外。加えて
`remctl` は private framework と SQLite 直読みに依存しており、
制約2（追従容易性）にも反する — 依存先が非公開である以上、Apple の更新で
壊れることを前提にした依存になる。

**AppleScript ではなく JXA を主言語にする。** 部分的に採用。同じ Open
Scripting Architecture 上にあり `osascript -l JavaScript` で実行できるため
依存は変わらない。JSON の組み立てが素直なので、**出力の整形が必要な箇所では
JXA を使う**。ただし Apple の両アプリの辞書は AppleScript 前提で
書かれており、用例も圧倒的に多いため、既定は AppleScript とする。

## Consequences

- 肯定：**依存ゼロ。** クローンして `osascript` を叩けば動く。
  パッケージマニフェストもロックファイルもビルド手順も無い。
- 肯定：スクリプトがプレーンテキストなので git で差分が読め、レビューでき、
  生成・修正ができる。
- 肯定：機構が1つで両アプリを扱える。Notes 側だけ別技術という分裂がない。
- 肯定：Apple の更新への追従が「辞書のプロパティが変わったか確認する」
  だけで済む。再ビルドも再署名も、依存の更新も無い。
- 否定：**AppleScript は Apple が積極的に開発している基盤ではない。**
  長期的に Shortcuts へ寄せる圧力はありうる。ただし削除の予告は現時点で
  無く、削除されるとしても告知期間が長いことが期待できる（これは推論であり
  Apple の保証ではない）。
- 否定：公開辞書の範囲に限るため、タグ・サブタスク・セクションは使えない。
  ADR 0001 の `body` メタデータブロックがその代償である。
- 否定：AppleScript は型が弱く、エラー処理と日付の扱いが煩雑。
  テストも書きにくい。パース処理は Python 側に寄せ、AppleScript は
  取得と書き込みの薄い層に留める必要がある。
- 否定：初回実行時に「Reminders/Notes を制御する許可」（TCC / Automation）を
  対話的に承認する必要があり、ヘッドレス実行では詰まりうる。
- 中立：iPhone からの入力は Shortcuts に頼る。機構が完全に1つになるわけでは
  なく、「読み書きの中心は osascript、iPhone 入力は Shortcuts」という
  役割分担になる。

## Confirmation

- リポジトリにパッケージマニフェスト（`package.json`、`Package.swift`、
  `requirements.txt` 等）とロックファイルが存在しないことで確認できる。
- スクリプトが `.applescript` / `.js` のプレーンテキストであること。
- 使用プロパティが本 ADR の列挙範囲に収まっていること。範囲外の
  プロパティ（タグ等）への参照が無いこと。
- **未検証**：本決定を記録した環境（Linux、macOS なし）では `osascript` を
  実行していない。辞書のプロパティは公開資料で確認したが、実挙動と
  TCC の挙動は macOS 上で初めて検証される。

## More information

- Reminders の AppleScript プロパティ確認元：
  [Demonstration of using AppleScript with Reminders.app](https://gist.github.com/n8henrie/c3a5bf270b8200e33591)
- Notes の AppleScript 辞書（`note`：`name` / `id` / `container` / `body` /
  `creation date` / `modification date`、`folder`：`name` / `id` /
  `container`）：[The Notes Application — AppleScript](https://www.macosxautomation.com/applescript/notes/index.html)
- タグ・サブタスク等が公開経路に無いことの出典：
  [Introducing RemCTL（MacStories）](https://www.macstories.net/stories/introducing-remctl-the-power-user-reminders-cli-for-macos-and-ai-agents/)
- 記録源とデータモデルの決定 — [ADR 0001](0001-reminders-as-system-of-record.md)
