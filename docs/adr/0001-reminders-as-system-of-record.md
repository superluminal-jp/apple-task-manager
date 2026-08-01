---
status: Proposed
date: 2026-08-01
deciders: repository maintainer
revised: 2026-08-01
---

# 0001. Reminders を Sprint Backlog の記録源とし、着手時刻は自前で記録する

> **改訂記録**：本 ADR は Accepted になる前に一度改訂された。初版は記録源への
> アクセスに EventKit を用い、`startDateComponents` を着手signalとする設計
> だったが、調査により同フィールドが Reminders の UI から設定できず、
> アプリで作成した reminder では `nil` になることが判明したため、着手時刻の
> 表現を差し替えた。アクセス機構そのものの決定は
> [ADR 0003](0003-applescript-only-automation.md) に分離した。
> （Accepted 後は改訂せず supersede する。本 ADR は Proposed のため改訂した。）

## Context and problem statement

個人用スクラム運用システムを Apple Reminders と Apple Notes の上に構築する。
最初に決めなければならないのは、**どのデータがどこにあるのが真実か**である。
この選択は後から変えると全データの移行を伴うため、実質的に一方通行の決定である。

調査により、2つのアプリの自動化能力がほぼ対称的に逆であることが判明した。

- **Reminders**：構造化フィールド（リスト・期日・完了日・優先度・完了状態）を
  持ち、機械的に読み書きできる。
- **Notes**：自由テキストのみ。本文は HTML。機械的な問い合わせは実質不可。

`my-claude-code` の `scrum-master` スキルが同梱する `scripts/flow_metrics.py`
は `item_id,started_at,completed_at` の3列を要求する。Reminders の
どのフィールドがこれに対応するかを確認したところ、**3列のうち2列は
ネイティブに存在するが、`started_at` に対応するフィールドは実用的に存在しない**
ことが判明した。

| スクリプトの要求 | Reminders 側 |
| --- | --- |
| `item_id` | `id`（text, read-only）— ネイティブ |
| `completed_at` | `completion date`（date）— ネイティブ |
| `started_at` | **対応なし** |

`started_at` が存在しない理由は2つある。

1. EventKit には `startDateComponents` があるが、**Reminders アプリの UI は
   この値を無視する**。UI から設定できず、アプリで作成した reminder を
   取得すると `nil` になる。
2. Reminders の AppleScript 辞書には start date に相当するプロパティが
   そもそも無い（`due date` と `remind me date` はあるが、いずれも
   「いつ着手したか」ではなく「いつまでに/いつ通知するか」である）。

`creation date` を代用する案は成立しない。作成時刻から完了までを測ると
それは Cycle Time ではなく Lead Time であり、Product Backlog に長く
置かれていた項目の Cycle Time を著しく過大に見せる[KGS21]。

## Decision

**Reminders を Sprint Backlog の記録源とし、Notes をナラティブ層とする。
`started_at` は Reminders のフィールドに頼らず、reminder の `body` に置く
機械可読ブロックに自前で記録する。**

したがって：

- Sprint Backlog の各項目は Reminders の reminder として存在する。
- 付加情報は `body` の機械可読ブロックに置く。**着手時刻もここに入れる。**

  ```
  --- scrum ---
  sprint: 7
  size: M
  started: 2026-08-01
  ---
  ```

- `item_id` は `id`、`completed_at` は `completion date` から取る。
  `started_at` は上記ブロックから取る。したがって `flow_metrics.py` は
  **無改造のまま**実データに適用できる（CSV を組み立てる側が3列を揃える）。
- WIP の判定は「`started:` が書かれていて未完了」とする。
- `creation date` は捨てずに保持し、Lead Time（作成→完了）を Cycle Time
  （着手→完了）と**別の指標として**扱う。両者の差は Product Backlog での
  待ち時間であり、それ自体が診断に使える。
- Sprint Goal・Definition of Done・レトロ記録・障害記録は Notes に置く。
  構造化された問い合わせの対象ではなく、人間が読む散文である。

### Alternatives considered

**Notes を記録源にする。** 却下。Shortcuts のみで完結し実装コストは最小で、
iPhone でも同等に動くという実利があった。しかし Notes には機械的な
問い合わせ経路がないため**フロー指標が一切取れない**。`flow_metrics.py` が
使えず「検査」を支える事実が残らないので、レトロが主観の振り返りに退行する。
経験主義を目的とするシステムとして本末転倒である。

**リポジトリ内の外部ストア（SQLite / JSONL）を真実とし、Apple 両アプリを
UI として双方向同期する。** 却下。メタデータの自由度は最大で、git 履歴が
そのまま監査ログになるという強い利点があった。しかし双方向同期は本
プロジェクト全体で最も難しい部分（競合解決、削除の伝播、ID 対応の維持）で
あり、労力の大半がそこに吸われる。利用者が1人という規模に対して明確な
過剰設計である。

**`startDateComponents` を着手signalに使う（初版の設計）。** 却下。
EventKit の正規フィールドであり意味的にも正しいが、**Reminders の UI が
この値を無視する**ため、iPhone や Mac のアプリ上から着手を記録できない。
プログラム経由でしか書けないフィールドを状態の真実にすると、
「アプリで操作すると状態が壊れる」という最悪の運用になる。

**`creation date` を `started_at` として使う。** 却下。実装は最も簡単で
追加の記録が不要だが、測っているものが Cycle Time ではなく Lead Time に
なる。Product Backlog に長く置かれた項目の Cycle Time が待ち時間で
膨らみ、指標が「作業の速さ」を表さなくなる。指標を歪めるより、
着手を明示的に記録するコストを受け入れる。

**タグやサブタスクで状態を表現する。** 却下（機構の詳細は
[ADR 0003](0003-applescript-only-automation.md)）。タグは状態表現に自然な
道具だが、Apple の公開自動化経路（EventKit / AppleScript）はいずれも
タグを公開していない。取得するには private framework か SQLite 直読みが
必要で、外部依存とOSアップデート追従性の要件に反する。

## Consequences

- 肯定：`flow_metrics.py` を無改造で実データに適用できる。指標を創作せず
  済む経路が確保される。
- 肯定：着手時刻が Apple の実装詳細に依存しない。UI が無視するフィールドや
  非公開スキーマに状態を預けないため、OS アップデートで壊れない。
- 肯定：Cycle Time と Lead Time を分離して観測できる。両者の差が
  Product Backlog の待ち時間として診断に使える。
- 否定：**着手を明示的に記録する運用上の一手間が発生する。** 忘れると
  その項目は Cycle Time の母数から落ちる。着手漏れの検出（未完了かつ
  `started:` なしの項目を一覧する）が実装の必須要件になる。
- 否定：`body` に構造を持たせるため、パースの責任がこちら側に来る。
  人間が Reminders アプリ上で `body` を直接編集して壊す可能性がある。
- 否定：タグが使えないため、スプリント番号等も同じ `body` ブロックに入る。
- 否定：Notes への書き込みが macOS 専用になる。iPhone では Notes の
  自動更新ができない。
- 中立：Notes の `body` が HTML であることの取り扱いは実装時に確認が必要。

## Confirmation

- `flow_metrics.py` の要求列と Reminders 側の対応が本 ADR と README の表に
  記載されており、`started_at` が自前管理であることが明示されている。
- Sprint 1 の完了条件に「実データから Cycle Time 分布が出ている」が含まれる。
  これが満たされれば本決定の中核的な前提が実証される。
- 着手漏れ検出（未完了かつ `started:` なし）が Sprint 1 の実装に含まれる。
- **未検証**：本決定を記録した環境（Linux、macOS なし）では AppleScript を
  実行できていない。プロパティの存在は公開資料で確認したが、実挙動は
  macOS 上で初めて検証される。

## More information

- Reminders の AppleScript プロパティ（`id` / `body` / `completed` /
  `completion date` / `due date` / `remind me date` / `priority` /
  `creation date` / `modification date` / `container`）の確認元：
  [Demonstration of using AppleScript with Reminders.app](https://gist.github.com/n8henrie/c3a5bf270b8200e33591)
- [`startDateComponents`](https://developer.apple.com/documentation/eventkit/ekreminder/startdatecomponents)
  と、Reminders の UI がこれを無視することの報告：
  [Apple Developer Forums](https://developer.apple.com/forums/thread/676018)
- Cycle Time / Lead Time / WIP の定義：`scrum-master` スキルの
  `references/sources.md` の `[KGS21]`（Kanban Guide for Scrum Teams）
- アクセス機構の決定 — [ADR 0003](0003-applescript-only-automation.md)
- 役割分離の決定 — [ADR 0002](0002-role-separation-via-subagents.md)
