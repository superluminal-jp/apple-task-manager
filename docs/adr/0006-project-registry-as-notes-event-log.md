---
status: Accepted
date: 2026-08-11
deciders: repository maintainer
---

# 0006. プロジェクトレジストリは Notes ノート内の追記専用イベントログとして持つ

## Context and problem statement

[spec 004](../../specs/004-multi-project-scrum/spec.md)（複数プロジェクトを
Notes フォルダ・Reminders リストの組で分離管理する機能）は、「どのプロジェクトが
登録済みか」「各プロジェクトのリソース名は何か」「どのプロジェクトが現在
（current）か」を保持する**レジストリ**を必要とする。これをどこに、どういう
書き込みモデルで持つかを決めなければならない。

選択肢は主に3つ：(1) リポジトリ側の設定ファイル、(2) Notes ノート内に永続化、
(3) 永続化せず毎回動的に列挙する。さらに (2) を選んだ場合、Notes 側の制約が
追加の分岐を生む——`apple-notes` スキルの `write_note.js` は**ノートを新規作成
するか、既存ノートに追記するかしかできず、既存本文の置換・部分編集はできない**
（[`apple-notes` SKILL.md](../../.claude/skills/apple-notes/SKILL.md)
「`write_note.js` cannot delete and cannot replace a whole body — only append」）。
これは指示ではなく構造であり、「現在のプロジェクトを切り替える」
（spec FR-006 / User Story 3）ような**既存の1レコードを書き換える**設計は、
そもそも安全に実装できない。

## Decision

**プロジェクトレジストリは、リポジトリの設定ファイルではなく、専用の Apple Notes
ノート1件の中に、`register` / `set-current` の小さなフェンス付きブロックを
積み重ねる**追記専用イベントログ**として持つ。現在状態（登録済みプロジェクト
一覧・現在のプロジェクト）は、ノート本文を先頭から末尾まで畳み込む
（fold）ことで都度導出する。1レコードを書き換える設計は採らない。**

したがって：

- レジストリの真実は Apple Notes 内にあり、リポジトリには置かない。
  [ADR 0001](0001-reminders-as-system-of-record.md) が確立した
  「Reminders/Notes が記録源、リポジトリは自動化コードのみ」という設計を、
  このレジストリにも一貫して適用する。
- 新しいプロジェクトの登録も、現在プロジェクトの切り替えも、常に**追記**として
  表現される。`write_note.js` の唯一安全な書き込みプリミティブ（追記）だけで
  両方を実現でき、本文の置換・部分編集という新しい書き込み能力を追加する
  必要がない。
- 解決（resolve）ロジックは新しい純 Python スクリプト
  `project_registry.py` が担う。`scrum_block.py` が Reminders の `body` を
  解釈するのと同型の役割分担——「Apple 側 API で取得・書き込みし、Python で
  解釈する」——を Notes 側にも敷く。
- ブロックの書式は既存の `--- scrum ---` フェンス規約
  （[`apple-reminders` SKILL.md](../../.claude/skills/apple-reminders/SKILL.md)
  「The scrum block」）を踏襲し、閉じフェンスを欠いた不正なブロックは
  黙って無視せず解決を停止して報告する。

### Alternatives considered

**リポジトリ側の設定ファイル（例: `scrum/projects.json`）に置く。** 却下。
読み書きは単純（1レコードをその場で書き換えられ、fold ロジックも不要）だが、
[ADR 0001](0001-reminders-as-system-of-record.md) が確立した「記録源は
Apple アプリ側」というモデルに対して、リポジトリ側にもう1つの真実を作ることに
なる。個人のScrum運用における日常操作（プロジェクト登録・切り替え）のたびに
リポジトリへの git commit が要る運用になり、「clone すれば動き、データは
Apple アプリの中にある」という本システムの前提（README §2、
[ADR 0005](0005-project-scoped-apple-artifacts.md)）を崩す。

**永続化せず、毎回動的に列挙する（Reminders の全リスト名・Notes の全フォルダ名を
都度検索し、命名規則に合致するものをプロジェクトとみなす）。** 却下。
新しい保存形式を一切増やさない利点はあるが、「現在のプロジェクト」という
状態を表現する先がどこにも無くなる。加えて、既存データを移行した最初の
プロジェクト（[spec 004](../../specs/004-multi-project-scrum/spec.md)
User Story 4、`research.md` Decision 5）はリネームなしで命名規則に非準拠の
リソース名（"Scrum"・"Product Backlog"・"Sprint Backlog"）のまま登録される
ため、命名規則からの逆引きでは「まだ命名規則に従っていないプロジェクト」と
「プロジェクトではない無関係なフォルダ/リスト」を区別できない。

**Notes ノート内に置くが、1レコードとして都度書き換える。** 却下。
読み書きモデルとしては最も単純だが、`write_note.js` に本文の**置換・部分編集**
機能を新設しない限り実現できない。これは `apple-notes` スキルが意図的に
持たないと明言している能力（削除・リネーム・全文上書きの不可）と同じ種類の
リスクを追加することになり、既存の設計判断と整合しない。

## Consequences

- 肯定：記録源が一貫して Apple アプリ側にとどまり、リポジトリに第二の真実を
  作らない（[ADR 0001](0001-reminders-as-system-of-record.md) の延長）。
- 肯定：`write_note.js` に新しい書き込み能力（置換・部分編集）を追加せずに
  実現できる。削除・リネームを持たないという既存の設計判断と歩調が揃う。
- 肯定：追記専用ログは自然に監査履歴になる——いつ何を登録し、いつ current を
  切り替えたかが本文にそのまま残る。
- 否定：現在状態を得るには、ノート本文を毎回 fold する必要がある。登録件数が
  増えるほど解決コストは増える（個人利用の規模では無視できる想定だが、
  規模が変われば再検討の余地がある）。
- 否定：人間がノートを直接読んでも、生のイベント列が見えるだけで
  「今の状態」の要約にはならない。`project_registry.py resolve` を介した
  参照が前提になる。
- 否定：レジストリはこのリポジトリで作業しているときしか使えない
  （[ADR 0005](0005-project-scoped-apple-artifacts.md) が既に受け入れている
  制約と同種）。

## Confirmation

- `tests/test_project_registry.py` が、複数の `register`/`set-current`
  イベントを含む本文からの fold 解決、閉じフェンスを欠いた不正なブロックへの
  解決拒否、および同一名への矛盾した再登録（リネーム相当）の拒否を検証する
  （[`contracts/project-registry.md`](../../specs/004-multi-project-scrum/contracts/project-registry.md)）。
- `project_registry.py` に本文置換・部分編集・削除のいずれのサブコマンドも
  存在しないことを、リポジトリの構造上の確認として扱う（`apple-notes-operator`
  契約の確認方法と同様、コードレビューで確認する）。

## More information

- [spec 004: Multi-Project Scrum Workspaces](../../specs/004-multi-project-scrum/spec.md)
- [research.md Decision 1（本ADRの技術的根拠）](../../specs/004-multi-project-scrum/research.md)
- [contracts/project-registry.md](../../specs/004-multi-project-scrum/contracts/project-registry.md)
- 記録源をApple アプリ側に置く先行決定 — [ADR 0001](0001-reminders-as-system-of-record.md)
- 成果物をプロジェクトスコープで置く先行決定 — [ADR 0005](0005-project-scoped-apple-artifacts.md)
