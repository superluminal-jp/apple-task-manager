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
| 公開API | **EventKit**（正式framework） | **なし**（macOS の AppleScript のみ、iOS 不可） |
| データ形状 | リスト／期日／開始日／完了日／優先度 | 自由テキスト（本文は HTML） |
| 機械的な問い合わせ | 可能 | 実質不可 |
| 担当する作成物 | Sprint Backlog、障害の期限 | Sprint Goal、Definition of Done、レトロ記録、障害記録 |

**Reminders = 構造化された記録源（system of record）**、
**Notes = ナラティブ層**、
**Claude + `scrum-master` スキル = 外部検査役**。

### なぜ Reminders を記録源にするのが最も効率的か

`scrum-master` スキルの `scripts/flow_metrics.py` が要求する入力は
`item_id,started_at,completed_at` の3列である。Reminders はこの3つを
**標準フィールドとしてネイティブに持つ**。

| スクリプトの要求 | Reminders / EventKit のフィールド |
| --- | --- |
| `item_id` | `calendarItemIdentifier` |
| `started_at` | `startDateComponents` |
| `completed_at` | `completionDate` |

つまり**既存スクリプトを1行も変えずに**実データの Cycle Time 分布・
週次 Throughput・WIP 推移が出る。これが2つのアプリを結ぶ最も安い接続点であり、
「指標を創作しない」という原則を守れる唯一の経路でもある。

副産物として、状態管理に余分なリストが不要になる。
**開始日あり＝着手済（WIP）**、**`isCompleted`＝完了**。Work Item Age も算出できる。

### 設計を縛る制約：EventKit はタグを公開していない

公開 API である EventKit は **tags / subtasks / sections / smart lists /
flags / 添付を公開していない**。`remctl` などのツールはこれを private framework
（ReminderKit）と SQLite 直読みで回避している。

**帰結：タグを前提にした設計にしてはならない。** スプリント番号やサイズは
リスト分割と、reminder の `notes` 本文に置く機械可読ブロックで表現する。

```
--- scrum ---
sprint: 7
size: M
---
```

private API 系ツールは魅力的だが、OS アップデートで壊れる前提の依存になる。
初期実装では採用しない（[ADR 0001](docs/adr/0001-reminders-as-system-of-record.md)）。

---

## 2. 実行環境の前提

- **Mac 常用・iPhone は補助**。Notes への書き込み自動化は macOS の AppleScript
  に限られるため、Claude による Notes 書き込みは Mac 上でのみ行う。
- iPhone は Reminders への項目追加と閲覧を担う（iCloud 同期で Mac に反映）。
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

- Reminders を Sprint Backlog の記録源にする読み出し経路
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

- `EKCalendarItem.url` が利用可能か — Apple 公式ドキュメントページが
  JavaScript 描画のため取得できず未確認。`notes` 本文に情報を置く設計は
  この結果に依存しない。
- AppleScript による Notes の読み書きの実挙動（本文が HTML であることの
  取り扱い、チェックリストの可否）。
- Reminders CLI／MCP のどれを採用するか。`--format json` と正規 ID を返す
  経路が必要。
- **本設計に含まれるコードは一切この環境で実行検証されていない。**
  実装は macOS 上で行う。

---

## 参照

- Scrum Guide 2020（`my-claude-code` の
  `.claude/skills/scrum-master/references/sources.md` の `[SG20]`）
- `scrum-master` スキル本体 — `my-claude-code/.claude/skills/scrum-master/`
- [EventKit](https://developer.apple.com/documentation/eventkit) —
  Reminders の公開 API
- [RemCTL の紹介記事（MacStories）](https://www.macstories.net/stories/introducing-remctl-the-power-user-reminders-cli-for-macos-and-ai-agents/)
  — EventKit がタグ・サブタスク等を公開していないことの出典
- [keith/reminders-cli](https://github.com/keith/reminders-cli)
- [The Notes Application — AppleScript](https://www.macosxautomation.com/applescript/notes/index.html)
