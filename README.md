# apple-task-manager — 個人用スクラム運用システム（設計案）

Apple Reminders と Apple Notes を記録源に、`scrum-master` スキルを検査役として、
**1人のプロダクト開発に経験主義（透明性・検査・適応）を適用する**ための仕組み。
必要なものはすべてこのリポジトリにある。

データ側の経路は `.claude/` に実装済み（§4-bis）。**ただしネイティブコードは
一度も macOS 上で実行されていない**（§7）。運用面——決定権の明文化、
役割別サブエージェント、実利用者との接点——は未着手で、Sprint 1 の作業である。

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
| 自動化経路 | AppleScript ／ **EventKit**（採用） | **AppleScript のみ**（相当する framework なし、iOS 不可） |
| データ形状 | リスト／期日／完了日／優先度 | 自由テキスト（本文は HTML） |
| 機械的な問い合わせ | 可能 | 実質不可 |
| 担当する作成物 | Sprint Backlog、障害の期限 | Sprint Goal、Definition of Done、レトロ記録、障害記録 |

この非対称性は自動化経路の選択にも及ぶ。**アプリごとに最適な経路を使う**
（[ADR 0004](docs/adr/0004-per-app-optimal-automation.md)、
[ADR 0003](docs/adr/0003-applescript-only-automation.md) を supersede）。

| | 経路 | 理由 |
| --- | --- | --- |
| Reminders | **EventKit**（単一 Swift ファイルからビルドする `remind-cli`） | 公式 framework。型付きオブジェクトと述語による問い合わせが使える。フロー指標という中心用途がまさにこれを要る |
| Notes | **AppleScript（JXA）** | 相当する framework が存在しない。選択肢が1つしかない |

両方を `osascript` に揃える初版の案は、Reminders 側にだけある選択肢を
Notes 側の制約に合わせて捨てていた。外部レジストリ由来の依存はゼロのまま
——`remind-cli` は Apple の framework だけに依存し、`Package.swift` も
ロックファイルも持たない。代償はビルド手順と、権限カテゴリが2つに
分かれること（Reminders／オートメーション）である。

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

これで `flow_metrics.py` を**フォークせずそのまま**実データに適用でき、
Cycle Time 分布・Work Item Age・週次 Throughput・WIP 推移が出る。
「指標を創作しない」を守れる経路が確保される。

CSV を組み立てるとき `--as-of YYYY-MM-DD` を必ず渡す。Work Item Age の基準日と
週範囲がこれで決まり、同じデータから常に同じ結果が出る。Daily の検査で使うのは
**Work Item Age**で、SLE を超えた進行中項目が停滞として印付けされる
（完了項目の Cycle Time は事後の分布であり、今日動かせる項目を示さない）。

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
- **外部依存ゼロ**。パッケージマニフェストもロックファイルも持たず、
  依存先は Apple 同梱の framework だけ。ただし Reminders 側は EventKit に
  移ったため**ビルド手順が1つある**（`swiftc` を1回、`build.sh` が冪等に
  実行）。Xcode Command Line Tools が要る。Notes 側は `osascript` のみで
  ビルド不要（[ADR 0004](docs/adr/0004-per-app-optimal-automation.md)）。
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

### インフラ費用は発生しなかった

ADR 0002 は「`my-claude-code` に `.claude/agents/` が存在せず、`install.sh` の
配布対象は `CUSTOM_SKILLS` の8スキルのみで、エージェントの配布経路がない」ことを
本決定の費用として記録し、配布機構を新設する作業が要ると見ていた。

**その作業は要らなかった。** サブエージェントは本リポジトリの
`.claude/agents/` にプロジェクトスコープで置く。Claude Code は
プロジェクトの `.claude/` を自動的に読むため、配布機構も
インストーラーも存在しない（[ADR 0005](docs/adr/0005-project-scoped-apple-artifacts.md)）。

一度は `my-claude-code` 側に置いて `install.sh` に名前指定の配布経路を
新設する案を実装したが、**依存の向きが逆だった**——汎用の Scrum スキルが
特定のタスクアプリの配線を抱え、参照元のリポジトリが参照する側の都合で
書き換わっていく。ADR 0005 がその経緯と却下理由を記録している。

PO 役・Developers 役サブエージェントを追加する際も、`.claude/agents/` に
ファイルを1つ置くだけである。両者はまだ書かれていないため、Sprint 1 の
作業項目としては残る。

### 前提の確認：`scrum-master` は個人利用を自動ルーティングしない

`my-claude-code` は本設計の直前のコミットで、`scrum-master` スキルから
solo/個人利用の記述を意図的に削除している（`references/solo-practice.md` を削除し、
`skill-routing.md`・`.claude/CLAUDE.md`・`.codex/AGENTS.md`・README の宣言を揃えた
BREAKING CHANGE：「scrum-master no longer auto-routes personal/solo Scrum Master
requests (weekly planning, daily check-ins, solo retrospectives)」）。
`skill-routing.md` に solo/personal/個人 の記述は現在1件も無い。

これは ADR 0002 の判断（役割別スキルを追加しない）と**同じ方向を独立に裏付ける**
——個人運用の作法を共有スキルに持たせない、という判断がすでに下されている。

同時に本設計への制約になる。**個人スクラムの相談は `scrum-master` に自動で
ルーティングされない。** したがって本システム側が入口を用意する必要がある
（明示的な呼び出し、または apple-task-manager 側のエントリポイント）。
「Claude が検査役として自動で立ち上がる」ことを前提にしてはならない。
Sprint 1 でこの入口の形を決める。

**この制約は変わっていない。** 用意したのはデータ側の入口だけである（次節）。
`my-claude-code` のルーティング表には手を触れていないため、「今スプリント
どう？」と書いて `scrum-master` が自動で立ち上がることはない。検査役を呼ぶのは
依然として利用者の明示的な操作である。本リポジトリの
[`CLAUDE.md`](CLAUDE.md) にもそう明記してある。

---

## 4-bis. データ側の入口（本リポジトリに実装済み）

§1 が要求する経路——Reminders を読み、`body` の機械可読ブロックを解釈し、
`flow_metrics.py` に無改造で食わせる——は本リポジトリの `.claude/` に
プロジェクトスコープで実装されている。配布機構は無く、インストーラーも無い
（[ADR 0005](docs/adr/0005-project-scoped-apple-artifacts.md)）。

| 成果物 | 担当 |
| --- | --- |
| `apple-reminders` スキル | EventKit の公開範囲、ビルド手順、Reminders 権限、`--- scrum ---` ブロックの書式。`main.swift`（`remind-cli`）・`Info.plist`・`build.sh`・`scrum_block.py` を同梱 |
| `apple-notes` スキル | Notes の HTML 本文モデル、macOS 限定であること、リンク規約。`list_notes.js`・`write_note.js` を同梱 |
| `apple-reminders-operator` / `apple-notes-operator` サブエージェント | 上記スキルを `skills:` で読み込み、生の JSON／HTML を会話に入れずに結論だけ返す。`tools` から `Edit`・`Write` を外してあるため、リポジトリのファイルを変更できない |

§1 の設計との対応：

- **`started_at` の自前記録は EventKit でも必要**：`startDateComponents` は
  存在するが Reminders アプリの UI が無視するため、EventKit に移っても
  解決しない。`scrum_block.py` が `--- scrum ---` ブロックを
  読み書きする。人が Reminders アプリで本文を壊した場合は、クラッシュではなく
  problem として報告される。閉じフェンスを失った本文への書き込みは拒否する
  ——どこまでがブロックでどこからが利用者の散文か判別できないため。
- **着手漏れ検出（ADR 0001 の必須要件）**：`scrum_block.py unstarted` が
  「未完了かつ `started:` なし」を一覧する。`csv` は該当項目を落とすと同時に
  stderr で件数を警告する。黙って母数から消えることはない。
- **`flow_metrics.py` を無改造で使う**：`csv` の出力列は
  `item_id,started_at,completed_at` で、実データが素通しで通る。
- **Reminders の削除はできない**：`remind-cli` に `delete` コマンドも
  `EKEventStore.remove` の呼び出しも存在しない。Cycle Time の唯一の記録を
  失う操作であり、EventKit の呼び出しは destructive-command フックからは
  見えないため、削除は人がアプリ上で行う。

配線は本リポジトリの [`CLAUDE.md`](CLAUDE.md) が持つ——両オペレーターへの
委譲、**委譲するのはデータアクセスだけで判断は委譲しない**という境界、
着手記録のない項目の件数を必ず添えること。`scrum-master` スキル自体は
Apple のアプリを一切知らない。依存は一方向である。

### リポジトリの境界

**本リポジトリは自己完結している。** クローンすれば動き、`my-claude-code` の
インストールを前提としない。

| リポジトリ | 役割 |
| --- | --- |
| **apple-task-manager**（ここ） | 実装のすべて。Apple 操作のスキル、サブエージェント、スクリプト、テスト、配線、および vendoring した `scrum-master` |
| **my-claude-code** | `scrum-master` の**取り込み元**。本プロジェクトのために変更しない |

`scrum-master` スキルは `.claude/skills/scrum-master/` に vendoring されている
（SKILL.md、`references/` 8本、`scripts/flow_metrics.py`、および単体テスト）。
**上流は生きているが、同期の仕組みは持たない**——出所を記録することと、
リンクを維持することは別である。したがって：

- **ここでは編集しない。** Scrum の作法そのものを変えたくなったら、上流で
  直してから取り込み直す。
- 本プロジェクト固有の取り決めは、vendoring したスキルではなく
  [`CLAUDE.md`](CLAUDE.md) に書く。
- 取り込み元のコミットは [ADR 0005](docs/adr/0005-project-scoped-apple-artifacts.md)
  に記録してある。乖離を疑ったらそこと差分を取る。

### 検証状態（正直に）

- `scrum_block.py` は **46 件の単体テストで検証済み**（`tests/run-scrum-block.sh`）。
  実 Reminders データを模した入力から `flow_metrics.py` まで通ることを含む。
  **バックエンドが AppleScript から EventKit に移った際、このファイルは
  1行も変わらず全テストが通った**——層の分離が実際に機能した証拠である。
- vendoring した `flow_metrics.py` は **17 件の単体テストで検証済み**
  （`tests/run-flow-metrics.sh`）。取り込んだコードを未検証のまま置かない。
- 成果物間の契約（エージェントがスキルを preload するか、`Edit`/`Write` を
  持たないか、`build.sh` が `-sectcreate` を含むか、削除経路が無いか、
  `CLAUDE.md` が委譲と境界と vendoring の注意を明記しているか）は
  `tests/run-apple-operators.sh` の 74 件で検証済み。`scrum_block.py` の CSV 列と
  `flow_metrics.py` の入力は、**両方が本リポジトリにあるため実体同士を
  突き合わせる**（リテラルを信じない）。
- **`remind-cli` はコンパイルすらされていない。** EventKit は Darwin 専用で、
  記録した環境（Linux コンテナ）には `swiftc` が無い。Linux 上での検証は
  原理的に不可能である。
- **Notes の JXA スクリプト（`.js` 2本）も一度も実行されていない。**
  同じ理由。§7 の未検証事項はそのまま残る。

## 5. 段階的な進め方

役割分離とデータ基盤を同時に立ち上げるが、順序に意味を持たせる。

### Sprint 1 — 薄い縦切り（1スプリント回すのに必要な最小限）

機構は §4-bis で実装済み。残るのは **macOS 上での検証と、人間側の運用**である。

- ~~Reminders を Sprint Backlog の記録源にする読み出し経路~~
  → 実装済み（EventKit の `remind-cli`）。**ビルド・実行とも未検証**
- ~~`body` メタデータブロックの読み書きと、着手漏れ検出~~
  → 実装済み・単体テスト済み（`scrum_block.py`）
- ~~`flow_metrics.py` に無改造で食わせる変換~~
  → 実装済み・単体テスト済み（`scrum_block.py csv`）
- ~~Notes に Sprint Goal / Definition of Done / レトロ記録~~
  → 書き込み経路は実装済み（`write_note.js`）。**macOS 未検証**、中身は運用
- **最初の macOS 実行で通す**（§7 の未検証事項を潰す）。順序が決まっている：
  1. `build.sh` が通るか（Xcode Command Line Tools）
  2. 初回実行で**リマインダー**の許可ダイアログが出るか——出なければ
     `Info.plist` の埋め込みが効いていないので、ビルドの問題であって
     利用者の拒否ではない
  3. `completionDate` が実際に埋まるか、`externalId` が同期を跨いで安定か
  4. Notes 側の Automation 許可と、`body` が HTML であることの取り扱い
- **決定権の明文化**（Notes 上の1枚）— どの判断を PO の帽子で下すか、
  いつ切り替えるか。役割分離の効果の大半はここで出る
- PO 役・Developers 役サブエージェントの初版（非対称なブリーフ）——
  `.claude/agents/` にファイルを1つ置くだけ。配布機構は要らない
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

- **`remind-cli` はコンパイルされていない。** EventKit は Darwin 専用で、
  この環境に `swiftc` が無い。API の形は Apple の公式リファレンスで確認したが、
  ビルドが通ることは未確認。
- EventKit のプロパティの実挙動。特に Reminders の `completionDate` が確実に
  埋まるか、`calendarItemExternalIdentifier` が iCloud 同期を跨いで安定か。
- **`Info.plist` のセクション埋め込みが実際に TCC に効くか。** これが効かないと
  許可ダイアログが出ず、利用者側から回復できない。ビルド直後に最も先に
  確認すべき項目。
- Notes の読み書きの実挙動（`body` が HTML であることの取り扱い、
  チェックリストの可否）。`plaintext` プロパティの有無は資料が一致せず未確認
  のため、実装ではタグ除去を自前で行っている。
- **権限が2カテゴリに分かれたこと**の実挙動。Reminders（EventKit）と
  オートメーション（Notes）は別々に承認が要り、ヘッドレス実行では
  どちらも詰まる。
- **本設計に含まれるネイティブコードは一切この環境で実行検証されていない**
  （Linux コンテナ、macOS なし）。検証済みなのは Python 層のみ。

---

## 参照

- Scrum Guide 2020（`.claude/skills/scrum-master/references/sources.md` の `[SG20]`）
- `scrum-master` スキル本体 — `.claude/skills/scrum-master/`
  （`my-claude-code` の `main` `2559a50` から vendoring。ここでは編集しない）
- [`requestFullAccessToReminders`](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoreminders(completion:))
  — EventKit の権限 API（macOS 14 でフル／書き込み専用に分離）
- [`calendarItemExternalIdentifier`](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemexternalidentifier)
  — アプリ間リンクのマーカーに使うサーバー提供の識別子
- [keith/reminders-cli](https://deepwiki.com/keith/reminders-cli)
  — 単体バイナリへの `Info.plist` 埋め込みの先行例
- [Demonstration of using AppleScript with Reminders.app](https://gist.github.com/n8henrie/c3a5bf270b8200e33591)
  — Reminders の AppleScript プロパティの確認元（ADR 0003 時点の調査。
  EventKit へ移行後も、公開経路の範囲を照合する資料として有効）
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
  （**[ADR 0004](docs/adr/0004-per-app-optimal-automation.md) に supersede 済み**。
  Notes に関する記述は引き続き有効）
- [ADR 0004](docs/adr/0004-per-app-optimal-automation.md) — アプリごとに最適な
  自動化経路を選ぶ（Reminders は EventKit、Notes は AppleScript）
- [ADR 0005](docs/adr/0005-project-scoped-apple-artifacts.md) — 成果物を本リポジトリに
  プロジェクトスコープで置き、`scrum-master` は vendoring する。ADR 0002 が
  「別途 ADR が必要になる」と予告した配布機構の論点に対応する
  （結論：配布機構は要らない）
