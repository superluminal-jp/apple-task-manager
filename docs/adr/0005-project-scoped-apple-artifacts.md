---
status: Proposed
date: 2026-08-03
deciders: repository maintainer
revised: 2026-08-03
---

# 0005. 成果物は本リポジトリにプロジェクトスコープで置き、`scrum-master` は vendoring する

> **改訂記録**：本 ADR は Accepted になる前に一度改訂された。初版は
> 「`scrum-master` は vendoring せず、`~/.claude/skills/` の導入済みの実体を
> 参照する」としていたが、メンテナが本リポジトリにも `scrum-master` スキルを
> 持たせる方針を示したため、**参照から vendoring へ変更**した。
> 置き場所の決定（成果物は本リポジトリにプロジェクトスコープで置き、
> `my-claude-code` を本プロジェクトのために変更しない）は変わっていない。
> （Accepted 後は改訂せず supersede する。本 ADR は Proposed のため改訂した。
> [ADR 0001](0001-reminders-as-system-of-record.md) と同じ扱い。）

## Context and problem statement

Apple Reminders / Notes を操作するスキルとサブエージェントを、どちらの
リポジトリに置くかを決める必要がある。

[ADR 0002](0002-role-separation-via-subagents.md) は視点分離をサブエージェントで
行うと決めたうえで、その費用として「`my-claude-code` には `.claude/agents/` が
存在せず、`install.sh` の配布対象は `CUSTOM_SKILLS` のスキルのみで、
エージェントの配布経路がない」ことを記録し、
「`.claude/agents/` を `my-claude-code` に新設する場合、その配布機構は
同リポジトリ側の決定であり、そこで別途 ADR が必要になる」と予告していた。

実際に一度その道を試した。`my-claude-code` に両スキルと両サブエージェントを置き、
`install.sh` に名前指定の配布経路（`MANAGED_AGENTS`）を新設し、
`scrum-master` スキル本体に「記録源が外部アプリにある場合」の節を足した。
動きはしたが、**依存の向きが逆だった。**

- 汎用の Scrum スキルが、特定のタスクアプリの配線を抱えることになる。
  `scrum-master` は Scrum Guide を規範とする助言のためのスキルであり、
  Apple 製アプリの存在を知る理由がない。
- `install.sh` に、他の管理パスと異なる同期規則を1つ増やすことになる。
  `sync_path()` は対象を `rm -rf` するため、利用者自身のサブエージェントが
  置かれる `~/.claude/agents/` には使えず、名前指定の例外が必要になった。
  この例外は**この用途のためだけ**に存在していた。
- `my-claude-code` の README・`README.ja.md`・`.codex/README.md` の配備表・
  スキル一覧・件数がすべて追随して変わる。参照元のリポジトリが、
  参照する側の都合で書き換わっていく。

そしてメンテナが方針を明示した：**`my-claude-code` は `scrum-master` スキルの
参照のためだけに使い、実装はすべて本リポジトリで行う。**

## Decision

**Apple 操作のスキル・サブエージェント・スクリプト・テストは、すべて本リポジトリの
`.claude/` と `tests/` にプロジェクトスコープで置く。`my-claude-code` は
`scrum-master` スキルの参照元であり、本プロジェクトのために一切変更しない。**

したがって：

- `.claude/skills/apple-reminders/`、`.claude/skills/apple-notes/`、
  `.claude/agents/apple-{reminders,notes}-operator.md`、`tests/` が本リポジトリに置かれる。
  Claude Code はプロジェクトスコープの `.claude/` を自動的に読むため、
  **配布機構は不要である。** インストーラーを持たない。
- **依存は一方向。** 本リポジトリが `scrum-master` を利用し、`scrum-master` は
  Apple のアプリを知らない。
- **`scrum-master` スキルは本リポジトリに vendoring する**（改訂による変更点）。
  `.claude/skills/scrum-master/` に SKILL.md・`references/` 8本・
  `scripts/flow_metrics.py` を置き、単体テスト（`tests/test_flow_metrics.py`、
  `tests/run-flow-metrics.sh`）も併せて取り込む。**取り込んだコードを
  検証されないまま置かない。**
  - 取り込み元：`my-claude-code`、`main` の `2559a50`（2026-08-03 時点）。
  - **同期の仕組みは作らない**——sync スクリプトも drift テストも持たない。
    出所を記録することと、リンクを維持することは別である
    （`my-claude-code` の ADR 0003 が同じ判断を先に下している）。
  - **ここでは編集しない。** Scrum の作法を変えたくなったら上流で直して
    取り込み直す。本リポジトリ固有の取り決めは `CLAUDE.md` に書く。
- **`scrum-master` への配線は本リポジトリの `CLAUDE.md` が持つ。** プロジェクト
  メモリはまさにこの用途——このプロジェクトでだけ成り立つ取り決め——のためにある。
  「委譲するのはデータアクセスだけで判断は委譲しない」「着手記録のない項目の
  件数を必ず添える」もここに書く。
- サブエージェントの `tools` から `Edit`・`Write` を外す設計は維持する。
  「Reminders/Notes は変えるがリポジトリのファイルは変えない」が指示ではなく
  構造になる。

### Alternatives considered

**`my-claude-code` に置き、`install.sh` で配布する（一度実装した案）。**
却下。ユーザースコープに入るためどのプロジェクトからでも使えるという実利が
あり、実際に動作もした。却下理由は依存の向きである。汎用の Scrum スキルが
特定のタスクアプリの配線を持ち、参照元のリポジトリが参照する側の都合で
書き換わる。加えて、`~/.claude/agents/` を壊さないための名前指定の例外が
`install.sh` に残り、それはこの用途のためだけに存在するものだった。

**両リポジトリに置く（スキルは共有、サブエージェントはプロジェクト）。** 却下。
最も柔軟に見えるが、`--- scrum ---` ブロックの書式や識別子の扱いといった
契約が2箇所に分かれ、どちらが正かが曖昧になる。テストも分割され、
`tests/run-apple-operators.sh` が検査している成果物間の対応関係を
1つのスイートで見られなくなる。

**`scrum-master` を vendoring せず、`~/.claude/skills/` の導入済みの実体を
参照する（初版の決定）。** 却下（改訂による変更）。コピーが本家から乖離しない
という利点は本物であり、初版はそれを理由に採った。却下理由は2つ。
(1) **本リポジトリが自己完結しなくなる。** クローンしただけでは動かず、
`my-claude-code` の `install.sh` を先に実行してあることが暗黙の前提になる。
検査役が「導入済みかどうか」に依存する構成は、記録源の設計としては脆い。
(2) `flow_metrics.py` の存在がテストから検査できず、**skip として報告する
しかなくなる**。検証されていないことを報告できるのは正直だが、検証できる方が
よい。乖離の危険は、取り込み元のコミットを記録し「ここでは編集しない」と
明示することで受け止める。

**プロジェクトスコープを諦め、`osascript` を直接叩く運用にする（スキルも
サブエージェントも作らない）。** 却下。成果物が減るが、出力の隔離
（リマインダー一覧の JSON が会話を占有しない）と、`tools` 許可リストによる
構造的な制約が両方失われる。この2つは [ADR 0002](0002-role-separation-via-subagents.md)
以来の設計の核であり、置き場所の問題とは独立している。

## Consequences

- 肯定：**依存が一方向になる。** `scrum-master` は Apple を知らず、汎用のまま残る。
- 肯定：`my-claude-code` に本プロジェクトの都合で入れた変更がすべて不要になる——
  `install.sh` の `MANAGED_AGENTS`、`CUSTOM_SKILLS` への追加、
  `scrum-master` SKILL.md の節、`permissions.md` の追記、
  配備表と README 3種の件数。同リポジトリは元の状態に戻った。
- 肯定：配布機構が要らない。Claude Code がプロジェクトスコープの `.claude/` を
  読むため、インストーラーもリストも持たない。ADR 0002 が費用として記録した
  「新しい成果物カテゴリと配布経路を作る作業」は、**支払う必要がなくなった。**
- 肯定：成果物・契約・テストが1リポジトリに揃い、変更が1つの diff で読める。
- 肯定：**本リポジトリが自己完結する**（改訂による変更点）。クローンすれば動き、
  `my-claude-code` の `install.sh` を先に実行してあることを前提にしない。
- 肯定：`scrum_block.py` の CSV 列と `flow_metrics.py` の入力という契約が、
  **リポジトリを跨がなくなった。** 両側が同じリポジトリにあるため、テストは
  リテラルを信じるのではなく実体同士を突き合わせる。skip も消えた。
- 否定：**両オペレーターは本リポジトリで作業しているときしか使えない。** 他の
  プロジェクトから「リマインダーに追加して」と頼んでも起動しない。本システムの
  管理対象が特定の1プロダクトである以上（README §2）実害は小さいが、制約ではある。
- 否定：**`scrum-master` のコピーが上流から乖離しうる**（改訂による変更点）。
  `my-claude-code` の ADR 0003 は外部ディレクトリを「上流ではない」と宣言できたが、
  ここでは**上流が生きている**——同リポジトリで保守が続く。同期の仕組みを
  持たない以上、乖離は起こりうる。受け止め方は3つ：取り込み元のコミットを
  本 ADR に記録する、`CLAUDE.md` に「ここでは編集しない」と明記する、
  固有の取り決めは vendoring 先ではなく `CLAUDE.md` に書く。
- 否定：リポジトリの規模が増える（SKILL.md + `references/` 8本 +
  `scripts/` + テスト2本）。本リポジトリの diff に、本プロジェクトが
  変更しないファイルが混ざる。
- 中立：Codex CLI 側には何も配布されない。以前の案では
  `~/.agents/skills/` にリンクされていたが、プロジェクトスコープでは
  Codex も本リポジトリの `.claude/skills/` を読むかどうかに依存する。
  本システムは Claude Code 前提で運用する。

## Confirmation

- `tests/run-apple-operators.sh` が、(a) 両スキル・両サブエージェントが
  本リポジトリに存在すること、(b) `install.sh` が**存在しない**こと
  （プロジェクトスコープで足りることの裏返し）、(c) `scrum-master` と
  `flow_metrics.py` が vendoring されていること、(d) パッケージマニフェストと
  ロックファイルが無いこと、(e) `CLAUDE.md` が両オペレーターへの委譲と
  「判断は委譲しない」「着手記録のない項目」を明記し、かつ vendoring された
  コピーであることを警告していることを検査する。
- `tests/run-flow-metrics.sh` が、vendoring した `flow_metrics.py` を
  17 件の単体テストで検証する。取り込んだコードが未検証のまま置かれない。
- `my-claude-code` 側で本プロジェクト由来の変更が残っていないことは、
  同リポジトリの diff が空であることで確認できる。
- 乖離を疑ったときは、本 ADR に記録した取り込み元コミット（`2559a50`）と
  `.claude/skills/scrum-master/` を突き合わせる。
- **未検証**：本決定を記録した環境（Linux コンテナ、macOS なし）では
  Claude Code がプロジェクトスコープの `.claude/agents/` を実際に読むことを
  実行確認していない。公式ドキュメントの記載に基づく。

## More information

- 配布機構が必要になると予告していた決定 — [ADR 0002](0002-role-separation-via-subagents.md)
- 自動化経路の決定 — [ADR 0004](0004-per-app-optimal-automation.md)
- サブエージェントのスコープと `skills:` — [Create custom subagents](https://code.claude.com/docs/en/sub-agents)（2026-08-03 閲覧）
- プロジェクトメモリ（`CLAUDE.md`）の位置づけ — [Manage Claude's memory](https://code.claude.com/docs/en/memory)
