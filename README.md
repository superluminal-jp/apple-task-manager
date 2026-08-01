# apple-task-manager — 個人用スクラム運用システム（設計案）

Apple Reminders と Apple Notes を記録源に、`my-claude-code` の `scrum-master`
スキルを検査役として、**1人のプロダクト開発に経験主義（透明性・検査・適応）を
適用する**ための仕組み。

現状このリポジトリには実装がない。本ファイルは合意済みの設計方針であり、
実装前の入口（README-Driven Development）として書かれている。

---

## 0. これは Scrum ではない（最初に読むこと）

この仕組みを「個人Scrum」と呼ぶことはできるが、**Scrum ではない**。
曖昧にすると、機能を作るほど「Scrumをやっているつもり」が強化されるため、
最初に明示する。

**事実**：Scrum Guide はアカウンタビリティを人に割り当てる。
「プロダクトオーナーは1人であり、委員会ではない」[SG20, p.5]、
「プロダクトオーナーだけがスプリントを中止する権限を持つ」[SG20, p.8]。
そして「スクラムの一部だけを導入することも可能だが、それはスクラムとは言えない」
[SG20, p.13]。

**推論**（Guide の逐語ではなく、上記から導く含意）：アカウンタビリティとは
結果を引き受けることである。スキルやサブエージェントはテキストを生成するが、
何も引き受けない。したがってエージェントを増やしても生まれるのは**視点**であり、
**アカウンタビリティ**ではない。

### 単独運用で構造的に失われるもの

| 失われるもの | この仕組みで埋まるか |
| --- | --- |
| 外部からの実証（実利用者のフィードバック） | **埋まらない**。スプリント毎に実在の利用者との接点を予定として入れることでのみ緩和する |
| 利害が実際に異なる独立した視点 | **部分的に埋まる**。§4 の役割分離が担う |
| 3つのアカウンタビリティの分離 | 埋まらない。1人が全結果を引き受ける構造は変わらない |

したがって本システムの目的は「Scrum の再現」ではなく、
**Scrum の透明性・検査・適応を単独作業に適用し、欠けた外部検査役を
Claude が代替すること**である。

---

## 1. アーキテクチャ：2つのアプリの能力が正反対であることを利用する

調査の結果、Reminders と Notes は自動化能力がほぼ対称的に逆であり、
それが Scrum の2種類の作成物にそのまま対応する。

| | Reminders | Notes |
| --- | --- | --- |
| 自動化経路 | AppleScript ／ EventKit | **AppleScript のみ**（相当する framework なし、iOS 不可） |
| データ形状 | リスト／期日／完了日／優先度 | 自由テキスト（本文は HTML） |
| 機械的な問い合わせ | 可能 | 実質不可 |
| 担当する作成物 | Sprint Backlog、障害の期限 | Sprint Goal、Definition of Done、レトロ記録、障害記録 |

Notes に EventKit 相当の framework が無いため、**両アプリを1つの機構で扱える
経路は macOS 同梱の `osascript`（AppleScript／JXA）だけ**である。これを採用し、
外部依存をゼロにする（[ADR 0003](docs/adr/0003-applescript-only-automation.md)）。

**Reminders = 構造化された記録源（system of record）**、
**Notes = ナラティブ層**、
**Claude + `scrum-master` スキル = 外部検査役**。

### なぜ Reminders を記録源にするか

`scrum-master` スキルの `scripts/flow_metrics.py` が要求する入力は
`item_id,started_at,completed_at` の3列である。Reminders はこのうち
**2列をネイティブに持ち、残る1列は自前で記録する**。

| スクリプトの要求 | Reminders 側 |
| --- | --- |
| `item_id` | `id`（text, read-only）— ネイティブ |
| `completed_at` | `completion date`（date）— ネイティブ |
| `started_at` | **対応フィールドなし** → `body` に自前で記録 |

`started_at` に使える標準フィールドは存在しない。EventKit の
`startDateComponents` は**Reminders の UI が無視する**うえ、アプリで作成した
reminder では `nil` になり、AppleScript 辞書には start date 相当の
プロパティがそもそも無い。`creation date` の代用も不可で、それは Cycle Time
ではなく Lead Time を測ってしまう。

そのため着手時刻は `body` の機械可読ブロックに書く。タグ・サブタスク・
セクションは Apple の公開経路（AppleScript / EventKit のいずれ）にも
公開されていないため、スプリント番号やサイズも同じブロックに入れる。

```
--- scrum ---
sprint: 7
size: M
started: 2026-08-01
---
```

これで `flow_metrics.py` は**無改造のまま**実データに適用でき、Cycle Time 分布・
週次 Throughput・WIP 推移が出る。「指標を創作しない」を守れる経路が確保される。

状態判定は次のとおり。**`started:` があり未完了＝着手済（WIP）**、
**`completed`＝完了**。`creation date` は保持し、Lead Time（作成→完了）を
Cycle Time（着手→完了）と別指標として扱う。両者の差は Product Backlog での
待ち時間そのもので、それ自体が診断に使える。

**運用上の代償**：着手を明示的に記録する一手間が発生する。忘れた項目は
Cycle Time の母数から落ちるため、**着手漏れの検出（未完了かつ `started:` なし
の一覧）は実装の必須要件**とする（[ADR 0001](docs/adr/0001-reminders-as-system-of-record.md)）。

---

## 2. 実行環境の前提

- **Mac 常用・iPhone は補助**。Notes への書き込み自動化は macOS の AppleScript
  に限られるため、Claude による Notes 書き込みは Mac 上でのみ行う。
- iPhone は Reminders への項目追加と閲覧を担う（iCloud 同期で Mac に反映）。
  iPhone 側の入力補助のみ Shortcuts を使う — 唯一の現実的な経路であり、
  読み書きの中心ではない。
- **依存ゼロ**。パッケージマニフェスト、ロックファイル、ビルド手順を持たない。
  クローンして `osascript` を叩けば動く状態を維持する。
- 管理対象は**特定の1プロダクト／プロジェクト**。したがって Product Goal と
  Sprint Goal が本来の意味で機能する。

---

## 3. Scrum イベントと構成要素の対応

| イベント | Reminders | Notes | Claude（検査役） |
| --- | --- | --- | --- |
| Sprint Planning | スプリント用リスト生成、項目に開始日 | Sprint Goal を記録 | Goal が「作業一覧の言い換え」になっていないか検査、実績ベースの容量確認 |
| Daily | 定期リマインダー | — | WIP・Work Item Age から停滞項目を提示 |
| Sprint Review | — | 成果と証拠を記録 | 「何を検査し、何を適応するか」を問う。外部接点の有無を確認 |
| Retrospective | 改善アクションを項目化 | 改善実験の書式で記録 | 実データを供給し、形式をスプリント毎に変える |
| 障害除去 | 期限付きリマインダー | 障害記録表 | エスカレーション条件の追跡 |

単独運用のための意図的な逸脱（何を変え、何を失うか）：

- **Daily Scrum 15分** → 1人では会議が成立しない。Sprint Goal に対する
  5分の書面検査に置き換える。目的は検査と適応であって会議ではない。
  失うもの：他者の観点による気づき。
- **Sprint Review** → 外部の利害関係者が不在。自己承認の儀式に退化する
  最大のリスクがあるため、**実在の利用者との接点をスプリント毎に1回
  予定として入れる**。自動化では代替できない。

---

## 4. 役割分離：サブエージェントで行い、スキルは増やさない

PO 役と Developers 役を**同一の会話**で Claude に演じさせると、独立した利害を
持たないため対話は即座に収束する（＝偽の合意）。役割分離の価値は
「別の指示書を持つこと」ではなく、**同じコンテキストを共有しないこと**にある。

したがって分離は**別コンテキストのサブエージェントに非対称な情報と目的を
与える**形で実装する。`my-claude-code` に `product-owner` /
`developers` スキルを追加する案は採らない
（[ADR 0002](docs/adr/0002-role-separation-via-subagents.md)）。

なお、この選択には `my-claude-code` 側のインフラ費用がある。同リポジトリには
現時点で `.claude/agents/` が存在せず、`install.sh` の配布対象は
`CUSTOM_SKILLS` の8スキルのみで、エージェントの配布経路がない。

---

## 5. 段階的な進め方

役割分離とデータ基盤を同時に立ち上げるが、順序に意味を持たせる。

### Sprint 1 — 薄い縦切り（1スプリント回すのに必要な最小限）

- Reminders を Sprint Backlog の記録源にする読み出し経路（`osascript`）
- `body` メタデータブロックの読み書きと、**着手漏れ検出**
  （未完了かつ `started:` なしの一覧）
- `flow_metrics.py` に無改造で食わせる変換
- Notes に Sprint Goal / Definition of Done / レトロ記録
- **決定権の明文化**（Notes 上の1枚）— どの判断を PO の帽子で下すか、
  いつ切り替えるか。役割分離の効果の大半はここで出る
- PO 役・Developers 役サブエージェントの初版（非対称なブリーフ）
- **実在の利用者との接点を1回スケジュール**

### Sprint 2 — 判断ポイント

1スプリント分の実データとレトロを見て、**どこで単独運用が実際に壊れたか**を
確認してから拡張範囲を決める。仕組みを先に太らせない。

---

## 6. 成功判定とガードレール

Sprint 1 終了時点で確認する。

| 区分 | 判定 |
| --- | --- |
| 結果 | 実データから Cycle Time 分布が出ている |
| 結果 | Sprint Goal が作業一覧の言い換えになっていない |
| 結果 | 改善実験が担当・検査日付きで1件記録されている |
| **ガードレール** | **運用コスト（仕組みの維持に週何分使ったか）**。返りより高ければ縮小する |

指標は評価や統制ではなく、透明性・検査・適応のために使う。1人しかいないため
比較対象は過去の自分だけであり、他者との比較には一切使わない。

---

## 7. 未検証事項（実装時に確認する）

正直に記録する。以下は本設計を書いた環境（Linux コンテナ、macOS なし）では
検証できなかった。

- AppleScript 辞書のプロパティは公開資料で確認したが、**実挙動は未確認**。
  特に Reminders の `completion date` が確実に埋まるか、`id` が iCloud 同期を
  跨いで安定か。
- Notes の読み書きの実挙動（`body` が HTML であることの取り扱い、
  チェックリストの可否）。`plaintext` プロパティの有無は資料が一致せず未確認。
- **TCC（Automation 許可）の挙動**。初回実行時に Reminders/Notes を制御する
  許可の対話的承認が必要で、ヘッドレス実行で詰まる可能性がある。
- **本設計に含まれるコードは一切この環境で実行検証されていない**
  （Linux コンテナ、macOS なし）。実装は macOS 上で行う。

---

## 参照

- Scrum Guide 2020（`my-claude-code` の
  `.claude/skills/scrum-master/references/sources.md` の `[SG20]`）
- `scrum-master` スキル本体 — `my-claude-code/.claude/skills/scrum-master/`
- [Demonstration of using AppleScript with Reminders.app](https://gist.github.com/n8henrie/c3a5bf270b8200e33591)
  — Reminders の AppleScript プロパティの確認元
- [The Notes Application — AppleScript](https://www.macosxautomation.com/applescript/notes/index.html)
  — Notes の AppleScript 辞書
- [`startDateComponents`](https://developer.apple.com/documentation/eventkit/ekreminder/startdatecomponents)
  と [UI が無視することの報告](https://developer.apple.com/forums/thread/676018)
- [RemCTL の紹介記事（MacStories）](https://www.macstories.net/stories/introducing-remctl-the-power-user-reminders-cli-for-macos-and-ai-agents/)
  — タグ・サブタスク等が公開経路に無いことの出典

### 意思決定記録

- [ADR 0001](docs/adr/0001-reminders-as-system-of-record.md) — 記録源とデータモデル
- [ADR 0002](docs/adr/0002-role-separation-via-subagents.md) — 役割分離の機構
- [ADR 0003](docs/adr/0003-applescript-only-automation.md) — 自動化経路と依存方針
