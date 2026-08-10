# apple-task-manager — 個人用スクラム運用システム（設計案）

Apple Reminders と Apple Notes を記録源に、`scrum-master` スキルを検査役として、
**1人のプロダクト開発に経験主義（透明性・検査・適応）を適用する**ための仕組み。
必要なものはすべてこのリポジトリにある。

データ側の経路は `.claude/` に実装済み（§4-bis）で、**macOS上のビルド・
基本操作・単一プロジェクトのScrumワークスペース作成、および複数プロジェクト
機能（プロジェクト登録・分離・current切り替え・スプリントサブフォルダ）
まで実機検証済み**（§7）。残る運用面は実際の決定権の記入、iCloud同期後の
識別子検証、実利用者との接点である。

**Product Owner と Developers は実在する。** 判断・決定はユーザーが会話に
持ち込む——ユーザー自身であれ、ユーザーが代弁する実在の関係者であれ。
**Claude に期待する役割は Scrum Master のみ**であり、他のアカウンタビリティを
演じたり代行したりしない（詳細は §4）。

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
- 管理対象は**プロジェクト単位**（複数可）。プロジェクトごとに独立した Notes
  フォルダ1つと Reminders リスト2本（Product Backlog／Sprint Backlog）を持ち、
  Product Goal と Sprint Goal はそのプロジェクトの中で本来の意味で機能する
  （§4-bis「複数プロジェクトの管理」、
  [ADR 0006](docs/adr/0006-project-registry-as-notes-event-log.md)）。

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

Notes 側の格納先は、プロジェクトフォルダの中で**スプリントごとにサブフォルダを
分ける**。Sprint Goal・Sprint Review 記録・Retrospective 記録・障害記録は
そのスプリントのサブフォルダに入る。Product Goal と Definition of Done は
スプリントを跨ぐ標準成果物であるため、サブフォルダの外——プロジェクトフォルダ
直下——に置き、スプリントごとに複製しない（§4-bis「複数プロジェクトの管理」）。

---

## 4. 役割の扱い：Product Owner と Developers は実在する

Scrum Guide はアカウンタビリティを人に割り当てる。「プロダクトオーナーは
1人であり、委員会ではない」[SG20, p.5]、「プロダクトオーナーだけがスプリントを
中止する権限を持つ」[SG20, p.8]。アカウンタビリティとは結果を引き受けることで
あり、AI はテキストを生成するが何も引き受けない。

**したがって Claude に期待する役割は Scrum Master だけである。** Product
Owner・Developers の判断や決定は、実在する人物——ユーザー自身、または
ユーザーが代弁する実際の関係者——が会話に持ち込む。Claude はそれを
Scrum Guide の規範（透明性・検査・適応）に照らして検査するが、PO や
Developers の立場を演じたり、判断を代行したりしない。

正しい PO / Developers の振る舞い（アカウンタビリティの範囲、コミットメント、
Scrum Master との関わり方）を確認したいときは、vendoring した
`scrum-master` スキルの規範層を読む。

| 参照先 | 内容 |
| --- | --- |
| [`scrum-framework.md`](.claude/skills/scrum-master/references/scrum-framework.md) の「Scrum Team のアカウンタビリティ」 | Product Owner・Scrum Master・Developers それぞれの定義（Scrum Guide 逐語） |
| [`scrum-master-role.md`](.claude/skills/scrum-master/references/scrum-master-role.md) の「Product Owner への奉仕」 | Scrum Master が PO をどう支援するか |

これらは人間が読むための参照であり、AI が演じるための台本ではない。

### 過去の設計との違い（サブエージェントによる役割視点は廃止した）

以前は PO 役・Developers 役を `.claude/agents/product-owner-perspective.md` /
`developers-perspective.md` として実装し、別コンテキストのサブエージェントに
非対称なブリーフを与えて「独立した視点」を生成させていた。PO と Developers が
実在し、判断を直接会話に持ち込める以上、AI にその代行視点を演じさせることは
不要であり、実在のアカウンタビリティと AI の助言を混同させる紛らわしさの
原因になっていた。そのため両サブエージェントを廃止した
（[ADR 0002](docs/adr/0002-role-separation-via-subagents.md)、2026-08-09 改訂）。

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
ルーティングされない。** `my-claude-code` のルーティング表は変更せず、本リポジトリの
[`CLAUDE.md`](CLAUDE.md) に上記の明示的な入口を実装した。「今スプリントどう？」
だけで自動起動するのではなく、`scrum-master` を明示的に指定して呼ぶ。

---

## 4-bis. データ側の入口（本リポジトリに実装済み）

§1 が要求する経路——Reminders を読み、`body` の機械可読ブロックを解釈し、
`flow_metrics.py` に無改造で食わせる——は本リポジトリの `.claude/` に
プロジェクトスコープで実装されている。配布機構は無く、インストーラーも無い
（[ADR 0005](docs/adr/0005-project-scoped-apple-artifacts.md)）。

| 成果物 | 担当 |
| --- | --- |
| `apple-reminders` スキル | EventKit の公開範囲、ビルド手順、Reminders 権限、`--- scrum ---` ブロックの書式。`main.swift`（`remind-cli`）・`Info.plist`・`build.sh`・`scrum_block.py` を同梱 |
| `apple-notes` スキル | Notes の HTML 本文モデル、macOS 限定であること、リンク規約、複数プロジェクトのレジストリ規約。`list_notes.js`・`write_note.js`・`ensure_folder.js`（`--parent-id` でサブフォルダ対応）・`project_registry.py` を同梱 |
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

### 複数プロジェクトの管理

管理対象はプロジェクト単位で、プロジェクトごとに次の三点セットを持つ
（[spec 004](specs/004-multi-project-scrum/spec.md)、
[ADR 0006](docs/adr/0006-project-registry-as-notes-event-log.md)）。

| アプリ | コンテナ | 命名規則（新規プロジェクト） | 用途 |
| --- | --- | --- | --- |
| Notes | `<プロジェクト名>` フォルダ | プロジェクト名そのまま（装飾なし） | Goal、Definition of Done、スプリントごとのサブフォルダ |
| Reminders | `<プロジェクト名> Product Backlog` リスト | 種別語を末尾に付与 | Product Goalに向けた創発的で順序付けられた作業 |
| Reminders | `<プロジェクト名> Sprint Backlog` リスト | 種別語を末尾に付与 | Sprint Goal、選択した項目、実行可能な計画の作業側 |

どのプロジェクトが登録済みで、どれが「現在のプロジェクト」かは、Notes 内の
**専用レジストリノート**が持つ。`write_note.js` は追記しかできないため、
レジストリは1レコードを書き換える形ではなく、**追記専用のイベントログ**
（`register` / `set-current` の小さなブロックを積み重ね、読むときに畳み込む）
として実装されている。読み書きは `project_registry.py` が担う。

```bash
N="$PWD/.claude/skills/apple-notes/scripts"
R="$PWD/.claude/skills/apple-reminders/scripts"
CLI="$(bash "$R/build.sh")"

# レジストリノートを一度だけ作成する（以後は --id で参照する）
REGISTRY_ID=$(osascript -l JavaScript "$N/write_note.js" --folder "Scrum" \
  --title "Projects" --text "プロジェクトレジストリ。手動で削除しないこと。" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

# 新規プロジェクトを登録する（三点セットを作成してから登録）
"$CLI" ensure-list --name "ProjectA Product Backlog"
"$CLI" ensure-list --name "ProjectA Sprint Backlog"
osascript -l JavaScript "$N/ensure_folder.js" --name "ProjectA"

osascript -l JavaScript "$N/list_notes.js" --id "$REGISTRY_ID" --plaintext --field plaintext \
  | python3 "$N/project_registry.py" register --name "ProjectA" \
      --notes-folder "ProjectA" \
      --product-backlog "ProjectA Product Backlog" \
      --sprint-backlog "ProjectA Sprint Backlog" \
  | osascript -l JavaScript "$N/write_note.js" --id "$REGISTRY_ID" --append-stdin

# 登録済みプロジェクトの一覧と「現在のプロジェクト」を見る
osascript -l JavaScript "$N/list_notes.js" --id "$REGISTRY_ID" --plaintext --field plaintext \
  | python3 "$N/project_registry.py" resolve

# 「現在のプロジェクト」を切り替える
osascript -l JavaScript "$N/list_notes.js" --id "$REGISTRY_ID" --plaintext --field plaintext \
  | python3 "$N/project_registry.py" set-current --name "ProjectA" \
  | osascript -l JavaScript "$N/write_note.js" --id "$REGISTRY_ID" --append-stdin
```

プロジェクト名を省略したリクエストは、レジストリの「現在のプロジェクト」に
解決される。どちらも無い場合（名前指定なし・current 未設定）は、両オペレーター
とも操作を実行せず曖昧さを報告する——推測はしない。

**既存の単一運用データの移行**：現行の Notes「Scrum」フォルダと Reminders
「Product Backlog」「Sprint Backlog」は、**リネームせずそのままの名前で**
最初のプロジェクトとして登録できる。`ensure_folder.js` と `remind-cli` は
どちらもリネーム操作を持たないため（意図的な設計）、命名規則は新規作成
プロジェクトにのみ適用され、移行したプロジェクトは実際のリソース名を
そのままレジストリに記録する。

```bash
python3 "$N/project_registry.py" register --name "Scrum" \
  --notes-folder "Scrum" \
  --product-backlog "Product Backlog" \
  --sprint-backlog "Sprint Backlog" \
  | osascript -l JavaScript "$N/write_note.js" --id "$REGISTRY_ID" --append-stdin
```

このコマンドは新しい Notes フォルダも Reminders リストも作成しない——既存の
3つをレジストリに登録するだけである。

**スプリントごとのサブフォルダ**：プロジェクトフォルダの直下に、スプリント名の
サブフォルダを作る。Product Goal と Definition of Done はサブフォルダの外
（プロジェクトフォルダ直下）に置く。

```bash
osascript -l JavaScript "$N/ensure_folder.js" --name "Sprint 7" --parent-id "<プロジェクトフォルダのid>"
```

このフォルダにノートを書き込むときは `write_note.js --folder-id <サブフォルダのid>`
を使う。`--folder "Sprint 7"` のような名前指定は使わない——別プロジェクトも
同名のサブフォルダを持ちうるため、名前だけでは一意に定まらない。`write_note.js`
は名前指定が曖昧な場合は拒否するようになっている（黙って先着1件を選ばない）。

Notes用の再利用可能な本文は [`scrum/templates/`](scrum/templates/) に置く。
Product Goal、Definition of Done、Sprint Planning、Daily Scrum、Sprint Review、
Sprint Retrospectiveの6つはScrum Guideで定義されたコミットメント／イベントに
基づく。障害記録と決定権記録は有用な**補助プラクティス**であり、Scrumが必須と
する作成物ではない。テンプレートはすべて未記入欄で、Product Goalや作業、担当、
日付を自動生成しない。

各ノートは既存の `write_note.js` を1回ずつ呼んで作成する。一括作成や同名ノートの
上書きは行わず、先に対象フォルダを確認する。削除はNotes／Remindersの画面で
人が行う。プロジェクトの削除（レジストリ・フォルダ・リストいずれも）も同様に
自動化経路を持たない。

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
- `project_registry.py`（複数プロジェクトのレジストリを畳み込む純Python層）は
  **27 件の単体テストで検証済み**（`tests/run-project-registry.sh`）。
  不正な閉じフェンス、未登録プロジェクトへの `set-current`、矛盾するリソース名
  での再登録拒否などを含む。`scrum_block.py` と同様、macOS 不要で実行できる。
- 成果物間の契約（エージェントがスキルを preload するか、`Edit`/`Write` を
  持たないか、`build.sh` が `-sectcreate` を含むか、削除経路が無いか、
  `CLAUDE.md` が委譲と境界と vendoring の注意を明記しているか）は
  `tests/run-apple-operators.sh` の 120 件で検証済み。`scrum_block.py` の CSV 列と
  `flow_metrics.py` の入力は、**両方が本リポジトリにあるため実体同士を
  突き合わせる**（リテラルを信じない）。
- `product-owner-perspective` / `developers-perspective` は廃止した。
  両ファイルが `.claude/agents/` に存在しないこと、README・`CLAUDE.md` が
  これらを参照せず PO/Developers が実在する前提を明記していることは
  `tests/run-scrum-role-agents.sh` で検証済み。
- **`remind-cli` は macOS でビルド・実行済み。** リスト取得、作成、更新、完了を
  実データで確認し、EventKit が `completionDate` を設定することも確認した。
  iCloud 同期を跨いだ `externalId` の安定性は未検証である。
- **Notes の JXA スクリプト（`.js` 3本）は macOS で実行済み。** フォルダ作成・一覧、
  作成、追記、ID 直接読み取り、無効 ID の拒否を確認した。初回検証では、操作は
  成功しているのに JXA が `note.container` を解決できず結果返却だけが失敗する
  問題を発見した。現在はノート ID とフォルダ所属 ID の照合で解決し、同じ実機
  シナリオが成功する。直接 `container` 参照を戻さない契約も120件に含めた。

## 5. 段階的な進め方

決定権の明文化とデータ基盤を同時に立ち上げるが、順序に意味を持たせる。

### Sprint 1 — 薄い縦切り（1スプリント回すのに必要な最小限）

機構は §4-bis で実装済み。macOS 上の基本経路も検証済みで、残るのは
**同期を跨ぐ識別子の検証と、人間側の運用**である。

- ~~Reminders を Sprint Backlog の記録源にする読み出し経路~~
  → 実装済み（EventKit の `remind-cli`）。**ビルド・基本操作を実機検証済み**
- ~~`body` メタデータブロックの読み書きと、着手漏れ検出~~
  → 実装済み・単体テスト済み（`scrum_block.py`）
- ~~`flow_metrics.py` に無改造で食わせる変換~~
  → 実装済み・単体テスト済み（`scrum_block.py csv`）
- ~~Notes に Sprint Goal / Definition of Done / レトロ記録~~
  → 書き込み経路は実装済み（`write_note.js`）。**作成・追記・ID 読み取りを
  macOS で検証済み**、記録内容の設計は運用として残る
- **iCloud 同期を跨ぐ `externalId` の安定性を確認する。** 基本操作と
  `completionDate` は確認済みだが、同期後の識別子は時間を置いた検証が要る。
- **決定権の明文化**（Notes 上の1枚）— どの判断を PO の帽子で下すか、
  どの判断を Developers の帽子で下すか、いつ切り替えるか。実在するPO・
  Developersのアカウンタビリティの境界を明文化するものであり、AIには持たせない
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

## 7. 残る未検証事項

正直に記録する。基本操作は macOS で検証したが、以下はまだ確認していない。

- `calendarItemExternalIdentifier` が iCloud 同期やアカウント間移動を跨いで
  安定すること。単一端末上の作成・更新・完了では確認できない。
- Notes の HTML チェックリストなど、構造化された複雑な本文の実表示。
  通常テキストの escaping、追記、`--plaintext` は実機確認済みである。
- 権限を一度拒否した状態、またはヘッドレス実行からの回復手順。Reminders と
  Notes の両アクセスが別カテゴリで動作することは確認したが、拒否経路は
  利用者のプライバシー設定を変更するためテストしていない。
- **複数プロジェクト機能（spec 004）は macOS 26.5.2 の実アカウントで実機検証済み**
  （`specs/004-multi-project-scrum/quickstart.md` の「Verification Evidence」）。
  プロジェクト登録・分離・current切り替え・`ensure_folder.js --parent-id` の
  冪等性・Sprintサブフォルダへの書き込みを確認した。この過程で当初の設計に
  無かった不具合を2件発見・修正している——`list_notes.js --id` の出力形状
  （`--field plaintext` が必要）、`write_note.js --folder` の曖昧性未検出
  （`--folder-id` を追加）。未検証なのは iCloud 同期を跨ぐシナリオと、複数
  アカウントにまたがる構成。

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
- [ADR 0002](docs/adr/0002-role-separation-via-subagents.md) — 役割視点をAIに
  演じさせず、実在するPO/Developersの判断を直接扱う（2026-08-09 改訂）
- [ADR 0003](docs/adr/0003-applescript-only-automation.md) — 自動化経路と依存方針
  （**[ADR 0004](docs/adr/0004-per-app-optimal-automation.md) に supersede 済み**。
  Notes に関する記述は引き続き有効）
- [ADR 0004](docs/adr/0004-per-app-optimal-automation.md) — アプリごとに最適な
  自動化経路を選ぶ（Reminders は EventKit、Notes は AppleScript）
- [ADR 0005](docs/adr/0005-project-scoped-apple-artifacts.md) — 成果物を本リポジトリに
  プロジェクトスコープで置き、`scrum-master` は vendoring する。ADR 0002 が
  「別途 ADR が必要になる」と予告した配布機構の論点に対応する
  （結論：配布機構は要らない）
- [ADR 0006](docs/adr/0006-project-registry-as-notes-event-log.md) — 複数プロジェクトの
  レジストリを、リポジトリ設定ファイルではなく Notes ノート内の追記専用
  イベントログとして持つ
