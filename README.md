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

### インフラ費用は解消済み（役割エージェントの分は未着手）

ADR 0002 は「`my-claude-code` に `.claude/agents/` が存在せず、`install.sh` の
配布対象は `CUSTOM_SKILLS` の8スキルのみで、エージェントの配布経路がない」ことを
本決定の費用として記録していた。**この費用は支払われた。** `my-claude-code` は
その後 `.claude/agents/` を持ち、配布経路を用意している
（同リポジトリの ADR 0004）。名前指定の `MANAGED_AGENTS` 方式で、
`~/.claude/agents/` にある利用者自身のサブエージェントを壊さずに配布する。

したがって PO 役・Developers 役サブエージェントを追加する際、
新しい成果物カテゴリを作る作業はもう必要ない。定義を書いて
`MANAGED_AGENTS` に名前を足すだけである。両者はまだ書かれていないため、
Sprint 1 の作業項目としては残る。

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

**この制約は変わっていない。** `my-claude-code` はデータ側の入口だけを用意した
（次節）。ルーティング表には Apple 系の記述を一切足していないため、
「今スプリントどう？」と書いて `scrum-master` が自動で立ち上がることはない。
検査役を呼ぶのは依然として利用者の明示的な操作である。

---

## 4-bis. データ側の入口は `my-claude-code` に実装済み

§1 が要求する経路——Reminders を読み、`body` の機械可読ブロックを解釈し、
`flow_metrics.py` に無改造で食わせる——は `my-claude-code` 側に実装された。
本リポジトリで作り直す必要はない。

| 成果物 | 担当 |
| --- | --- |
| `apple-reminders` スキル | AppleScript 辞書の公開範囲、TCC 権限、`--- scrum ---` ブロックの書式。`list_reminders.js`・`write_reminder.js`・`scrum_block.py` を同梱 |
| `apple-notes` スキル | Notes の HTML 本文モデル、macOS 限定であること、リンク規約。`list_notes.js`・`write_note.js` を同梱 |
| `apple-reminders-operator` / `apple-notes-operator` サブエージェント | 上記スキルを `skills:` で読み込み、生の JSON／HTML を会話に入れずに結論だけ返す。`tools` から `Edit`・`Write` を外してあるため、リポジトリのファイルを変更できない |

§1 の設計との対応：

- **`started_at` の自前記録**：`scrum_block.py` が `--- scrum ---` ブロックを
  読み書きする。人が Reminders アプリで本文を壊した場合は、クラッシュではなく
  problem として報告される。閉じフェンスを失った本文への書き込みは拒否する
  ——どこまでがブロックでどこからが利用者の散文か判別できないため。
- **着手漏れ検出（ADR 0001 の必須要件）**：`scrum_block.py unstarted` が
  「未完了かつ `started:` なし」を一覧する。`csv` は該当項目を落とすと同時に
  stderr で件数を警告する。黙って母数から消えることはない。
- **`flow_metrics.py` を無改造で使う**：`csv` の出力列は
  `item_id,started_at,completed_at` で、実データが素通しで通る。
- **Reminders の削除はできない**：`write_reminder.js` に削除経路が存在しない。
  Cycle Time の唯一の記録を失う操作であり、Apple Event は
  destructive-command フックからは見えないため、削除は人がアプリ上で行う。

`scrum-master` スキル側にも、記録源が外部アプリにあるときは
両オペレーターに委譲する旨と、**委譲するのはデータアクセスだけで判断は
委譲しない**という境界が明記されている。

### 検証状態（正直に）

- `scrum_block.py` は **44 件の単体テストで検証済み**（`tests/run-scrum-block.sh`）。
  実 Reminders データを模した入力から `flow_metrics.py` まで通ることを含む。
- 成果物間の契約（エージェントがスキルを preload するか、`Edit`/`Write` を
  持たないか、インストーラーが配布するか）は `tests/run-apple-operators.sh` の
  65 件で検証済み。
- **JXA スクリプト（`.js` 4本）は一度も実行されていない。** 記録した環境が
  Linux コンテナで macOS が無いため。§7 の未検証事項はそのまま残る。
  最初の macOS 実行で、辞書のプロパティ名、`completion date` の埋まり方、
  Notes の `body` の扱い、TCC ダイアログの挙動を確認する必要がある。

## 5. 段階的な進め方

役割分離とデータ基盤を同時に立ち上げるが、順序に意味を持たせる。

### Sprint 1 — 薄い縦切り（1スプリント回すのに必要な最小限）

機構は §4-bis で実装済み。残るのは **macOS 上での検証と、人間側の運用**である。

- ~~Reminders を Sprint Backlog の記録源にする読み出し経路（`osascript`）~~
  → 実装済み（`list_reminders.js`）。**macOS 未検証**
- ~~`body` メタデータブロックの読み書きと、着手漏れ検出~~
  → 実装済み・単体テスト済み（`scrum_block.py`）
- ~~`flow_metrics.py` に無改造で食わせる変換~~
  → 実装済み・単体テスト済み（`scrum_block.py csv`）
- ~~Notes に Sprint Goal / Definition of Done / レトロ記録~~
  → 書き込み経路は実装済み（`write_note.js`）。**macOS 未検証**、中身は運用
- **最初の macOS 実行で JXA 4本を検証する**（§7 の未検証事項を潰す）——
  これが Sprint 1 の最初の作業項目になる
- **決定権の明文化**（Notes 上の1枚）— どの判断を PO の帽子で下すか、
  いつ切り替えるか。役割分離の効果の大半はここで出る
- PO 役・Developers 役サブエージェントの初版（非対称なブリーフ）——
  配布経路はもう存在するので、定義を書いて `MANAGED_AGENTS` に足すだけ
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
- `my-claude-code` の ADR 0004 — Apple 操作をスキル＋サブエージェントの対で提供し、
  サブエージェントを名前指定でユーザースコープへ配布する決定。ADR 0002 が
  「別途 ADR が必要になる」と予告した配布機構の決定に対応する
