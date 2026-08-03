---
status: Proposed
date: 2026-08-03
deciders: repository maintainer
supersedes: 0003-applescript-only-automation.md
---

# 0004. 自動化経路はアプリごとに最適なものを選ぶ（Reminders は EventKit、Notes は AppleScript）

> **[ADR 0003](0003-applescript-only-automation.md) を supersede する。**
> 0003 は「両アプリを `osascript` のみで操作する」と決めた。本 ADR は
> Reminders を EventKit に移し、Notes は AppleScript のまま残す。

## Context and problem statement

ADR 0003 は2つの制約から出発していた。(1) 外部サプライチェーンを使わない、
(2) Apple のアップデートへの追従が容易であること。そこから
「機構は1つであるべき」という要請を導き、**Notes に EventKit 相当の
framework が存在しない**という非対称性を理由に、両アプリを `osascript` に
揃えた。EventKit の却下理由は3つ挙げられていた——Notes を扱えないので
機構が2つになる、Xcode ツールチェーンとビルド成果物が発生する、
自前バイナリへの TCC 付与が増える。

**この決定の前提が変わった。** メンテナが「Notes と Reminders それぞれに
最適な方法を用いる。EventKit も使って良い」と明示した。すなわち
**「機構は1つ」という要請そのものが取り下げられた。**

前提が消えると、0003 の却下理由3つのうち最も重かったもの——「Notes を
扱えないので機構が2つになる」——は却下理由として成立しなくなる。残る2つ
（ツールチェーン、TCC）はコストではあるが、決定的ではない。

改めて評価すると、2つのアプリは**能力が対称的に逆**であり、
同じ扱いをすること自体が一方に損をさせている。

| | Reminders | Notes |
| --- | --- | --- |
| 公式 framework | **EventKit（あり）** | **なし** |
| 型付きオブジェクト | ○ | × |
| 述語による問い合わせ | ○（`predicateForReminders`） | × |
| 経路 | EventKit / AppleScript の2択 | AppleScript のみ |

本システムの中心的な用途は**フロー指標**である。Sprint Backlog を
リストごと取得し、日付と完了状態を機械的に処理する。この用途で
AppleScript を選ぶと、型のある値を文字列に落として parse し直すことになる。
Reminders 側にだけ存在する選択肢を、Notes 側の制約に合わせて捨てていた。

## Decision

**Reminders は EventKit（単一の Swift ファイルからビルドする `remind-cli`）で
操作する。Notes は AppleScript（JXA）のままとする。**

したがって：

- `remind-cli` は `main.swift` 1ファイル。`swiftc` を1回呼ぶだけで、
  **Package.swift もロックファイルも SPM も持たない。** 外部レジストリ
  由来の依存はゼロという 0003 の制約1は維持される。
- `Info.plist` をリンカで `__TEXT,__info_plist` セクションに埋め込む。
  これは飾りではない：TCC は実行中のバイナリから usage description を
  読むため、セクションが無いと**許可ダイアログがそもそも出ず**、
  利用者に付与手段が無いまま全呼び出しが「未許可」で失敗する。
- 権限カテゴリが分かれる。Reminders は**「リマインダー」**カテゴリ
  （`NSRemindersFullAccessUsageDescription`）、Notes は**「オートメーション」**。
  別々の許可であり、別々に拒否される。
- 使用する Reminders のプロパティは EventKit の公開 API に限る。
  private framework（ReminderKit）と SQLite 直読みは引き続き採用しない。
- Notes 側は一切変更しない。ADR 0003 の Notes に関する記述はそのまま有効で
  あり、本 ADR はそれを引き継ぐ。

### 変わらなかったこと（重要）

**`started_at` の自前記録は EventKit に移っても必要である。**
`EKReminder.startDateComponents` は存在するが、Reminders アプリの UI が
これを無視し、アプリで作成した reminder では `nil` になる
（[ADR 0001](0001-reminders-as-system-of-record.md)）。EventKit に移れば
解決する、という期待は成り立たない。`--- scrum ---` ブロックは残る。

**タグ・サブタスク・セクションは EventKit にも公開されていない。**
0003 が記録した代償はそのまま残る。

したがって ADR 0001 のデータモデルは無傷であり、`scrum_block.py` は
**1行も変更せずに**新しいバックエンドで動いた。46 件の単体テストがそれを
裏付けている。これは偶然ではなく、0003 が課した「パース処理は Python 側に
寄せ、スクリプトは取得と書き込みの薄い層に留める」という設計が効いた結果で
ある。**0003 の機構の選択は覆ったが、層の分け方は正しかった。**

### Alternatives considered

**0003 のまま `osascript` に揃え続ける。** 却下。機構が1つで済み、ビルドも
権限も増えないという実利は本物だった。しかしメンテナが「機構は1つ」を
要請しないと明示した以上、この案の主たる根拠が消える。残るのは
「Reminders 側で使えるはずの型と述語を捨て続ける」ことだけになる。

**両方を EventKit に揃える。** 不可能。Notes に EventKit 相当が存在しない。
これは 0003 が正しく指摘した事実であり、本 ADR でも変わらない。

**Reminders を Shortcuts（`shortcuts run`）に寄せる。** 却下。iOS でも動く
という大きな利点は残るが、0003 の却下理由がそのまま有効である——
ショートカットは不透明なバイナリ形式で git の差分が読めず、構造化データの
入出力経路も貧弱。iPhone からの項目追加に使う位置づけも変えない。

**サードパーティ CLI（`keith/reminders-cli`、`remctl`）。** 却下。制約1
（外部サプライチェーンを使わない）は取り下げられていない。`remctl` は
private framework と SQLite 直読みに依存しており、制約2にも反する。
自前の `main.swift` は Apple の framework だけに依存する。

**`calendarItemIdentifier` だけを識別子として使う。** 却下。Apple の技術
資料は、カレンダー（アカウント）が変わるとこの値が変わりうることを示唆して
いる。サーバー提供の `calendarItemExternalIdentifier` を併せて出力し、
**アプリ間リンクのマーカーには external を使う**。ただし external は
一意性が保証されない（繰り返し項目が共有しうる）ため、複数一致した場合は
推測せず報告する。

## Consequences

- 肯定：**型のあるデータが型のまま届く。** 日付は `Date`、完了は `Bool`。
  文字列に落として parse し直す層が消える。
- 肯定：リストの取得が述語1回で済む。フロー指標の取得が実用的な速度になる。
- 肯定：`calendarItemExternalIdentifier`、繰り返しルールなど、AppleScript が
  公開していなかった情報に到達できる。
- 肯定：ADR 0001 のデータモデルと `scrum_block.py` が無傷で残った。
  層の分離が実際に機能したことが実証された。
- 否定：**ビルド手順が発生する。** 0003 が誇った「クローンして `osascript` を
  叩けば動く」は Reminders 側では成り立たなくなる。Xcode Command Line Tools が
  要る。`build.sh` を冪等にして緩和するが、消えはしない。
- 否定：**ビルド成果物の管理が発生する。** `remind-cli` は gitignore 対象。
  ビルドし忘れた状態は「スキルが壊れている」ように見える。
- 否定：**`Info.plist` の埋め込みを忘れると、利用者側で回復不能な失敗になる。**
  許可ダイアログが出ないため、拒否と区別がつかない。`build.sh` 経由でしか
  ビルドしないことと、テストで `-sectcreate` の存在を検査することで守る。
- 否定：**権限が2種類になった。** Reminders カテゴリと Automation カテゴリ。
  片方を許可しても他方は許可されない。失敗時にどちらかを明示する責任が増える。
- 否定：機構が2つになり、保守対象が Swift と JXA の両方になる。
- 中立：OS アップデートへの追従は、EventKit の方がむしろ堅い可能性がある
  （公開 API であり deprecation の予告がある）。一方で再ビルドの必要は
  生じうる。これは推論であり Apple の保証ではない。

## Confirmation

- `Package.swift` とロックファイルが存在しないことで、依存ゼロの維持が
  確認できる（`tests/run-apple-operators.sh` が検査）。
- `build.sh` に `-sectcreate` と `__info_plist` が含まれ、`Info.plist` に
  `NSRemindersFullAccessUsageDescription` が含まれることを同スイートが検査する。
- `main.swift` に削除経路（`.remove(`）と `delete` コマンドが存在しないことを
  同スイートが検査する。
- `scrum_block.py` の 46 件の単体テストが、バックエンド移行後も通ること。
- **未検証**：本決定を記録した環境（Linux コンテナ、macOS なし）では
  `swiftc` が存在せず、`remind-cli` はコンパイルすらされていない。
  EventKit は Darwin 専用のため、Linux 上での検証は原理的に不可能である。
  最初の macOS 実行で、ビルドの成否、TCC ダイアログの出現、
  `completionDate` の埋まり方を確認する必要がある。

## More information

- EventKit の権限 API — [`requestFullAccessToReminders`](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoreminders(completion:))
- 識別子 — [`calendarItemIdentifier`](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemidentifier)、
  [`calendarItemExternalIdentifier`](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemexternalidentifier)、
  変わりうることの解説 [apeth.com ch.32](https://www.apeth.com/iOSBook/ch32.html)
- 単体バイナリへの `Info.plist` 埋め込み — [keith/reminders-cli](https://deepwiki.com/keith/reminders-cli)
- EventKit 直結の Swift CLI による JSON 出力の先行例 — [ekctl](https://schappi.com/blog/meet-ekctl-a-command-line-interface-for-managing-calendars-and-reminders-on-maco)
- Notes に framework が存在しないこと — [Apple Developer Forums](https://developer.apple.com/forums/thread/775692)
- 記録源とデータモデル（無傷で残った） — [ADR 0001](0001-reminders-as-system-of-record.md)
- supersede 元 — [ADR 0003](0003-applescript-only-automation.md)
