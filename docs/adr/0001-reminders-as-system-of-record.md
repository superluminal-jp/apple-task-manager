---
status: Proposed
date: 2026-08-01
deciders: repository maintainer
---

# 0001. Reminders を Sprint Backlog の記録源とし、公開 API（EventKit）のみに依存する

## Context and problem statement

個人用スクラム運用システムを Apple Reminders と Apple Notes の上に構築する。
最初に決めなければならないのは、**どのデータがどこにあるのが真実か**である。
この選択は後から変えると全データの移行を伴うため、実質的に一方通行の決定である。

調査により、2つのアプリの自動化能力がほぼ対称的に逆であることが判明した。

- **Reminders**：`EventKit` という正式な公開 framework を持ち、リスト・期日・
  開始日・完了日・優先度・完了状態を読み書きできる。
- **Notes**：公開 framework が存在しない。macOS の AppleScript
  経由でのみ操作でき、iOS では不可。本文は HTML。機械的な問い合わせは実質不可。

さらに決定的な事実として、`my-claude-code` の `scrum-master` スキルが同梱する
`scripts/flow_metrics.py` は `item_id,started_at,completed_at` の3列を要求し、
Reminders はこの3つを標準フィールドとしてネイティブに持つ
（`calendarItemIdentifier` / `startDateComponents` / `completionDate`）。

一方で公開 API には明確な天井がある。**EventKit は tags / subtasks /
sections / smart lists / flags / 添付を公開していない。** `remctl` などの
ツールは private framework（ReminderKit）と SQLite 直読みでこれを回避している。

したがって論点は2つに分かれた。

1. 記録源をどこに置くか（Reminders / Notes / リポジトリ内の外部ストア）
2. 公開 API のみに限定するか、private API に踏み込んでタグ等を得るか

## Decision

**Reminders を Sprint Backlog の記録源とし、Notes をナラティブ層とする。
アクセスは公開 API（EventKit）が公開する範囲のみに限定する。**

したがって：

- Sprint Backlog の各項目は Reminders の reminder として存在する。
  **開始日あり＝着手済（WIP）**、`isCompleted`＝完了。状態表現のための
  追加リストは作らない。
- Sprint Goal・Definition of Done・レトロ記録・障害記録は Notes に置く。
  これらは構造化された問い合わせの対象ではなく、人間が読む散文である。
- スプリント番号やサイズなどの付加情報は、**タグではなく** reminder の
  `notes` 本文に置く機械可読ブロックで表現する。
- private framework（ReminderKit）と Reminders の SQLite 直読みは採用しない。

### Alternatives considered

**Notes を記録源にする（案A）。** 却下。Shortcuts のみで完結し実装コストは
最小で、iPhone でも完全に同等に動くという実利があった。しかし Notes には
機械的な問い合わせ経路がないため、**フロー指標が一切取れない**。
`flow_metrics.py` は使えず、「検査」を支える事実が残らないので、
レトロが主観の振り返りに退行する。経験主義を目的とするシステムとして
本末転倒である。

**リポジトリ内の外部ストア（SQLite / JSONL）を真実とし、Apple 両アプリを
UI として双方向同期する（案C）。** 却下。メタデータの自由度は最大で、
git 履歴がそのまま監査ログになるという強い利点があった。しかし双方向同期は
本プロジェクト全体で最も難しい部分（競合解決、削除の伝播、ID 対応の維持）で
あり、労力の大半がそこに吸われる。利用者が1人という規模に対して明確な
過剰設計である。

**private API に踏み込んでタグ・サブタスクを使う。** 却下。タグはスプリントや
状態の表現に自然な道具であり、使えれば設計は素直になる。しかし private
framework と SQLite スキーマへの依存は、OS アップデートで壊れることを
前提とした依存である。壊れたときに失うのは機能ではなく**過去の全データの
読み出し経路**であり、記録源としては受け入れられないリスク非対称性がある。

## Consequences

- 肯定：`flow_metrics.py` を**無改造で**実データに適用できる。指標を創作せず
  済む経路がこれで確保される。
- 肯定：公開 API のみに依存するため、OS アップデートで記録源が読めなくなる
  リスクが低い。
- 肯定：状態を開始日と完了フラグで表現するため、リストが増えず Reminders の
  UI 上でも人間が直接扱える。
- 否定：タグが使えないため、付加情報が `notes` 本文の自前フォーマットになる。
  パースの責任がこちら側に来る。
- 否定：Notes への書き込みが AppleScript 依存＝**macOS 専用**になる。
  iPhone では Notes の自動更新ができない。
- 否定：Reminders と Notes に情報が分かれるため、「どちらに書くか」の判断が
  運用者に残る。README の対応表がその判断の唯一の根拠になる。
- 中立：Notes の本文が HTML であることの取り扱いは実装時に確認が必要。

## Confirmation

- `flow_metrics.py` の要求列（`item_id,started_at,completed_at`）と
  EventKit のフィールド対応が README の表に記載されている。
- Sprint 1 の完了条件に「実データから Cycle Time 分布が出ている」が含まれる。
  これが満たされれば本決定の中核的な前提が実証される。
- **未検証**：本決定を記録した環境（Linux、macOS なし）では EventKit も
  AppleScript も実行できていない。`EKCalendarItem.url` の可用性は
  Apple 公式ドキュメントが JavaScript 描画のため未確認。実装は macOS 上で
  行い、そこで初めて検証される。

## More information

- [EventKit](https://developer.apple.com/documentation/eventkit)
- [Introducing RemCTL（MacStories）](https://www.macstories.net/stories/introducing-remctl-the-power-user-reminders-cli-for-macos-and-ai-agents/)
  — EventKit が tags / subtasks / sections / smart lists を公開していない
  ことの出典
- [keith/reminders-cli](https://github.com/keith/reminders-cli)
- [The Notes Application — AppleScript](https://www.macosxautomation.com/applescript/notes/index.html)
