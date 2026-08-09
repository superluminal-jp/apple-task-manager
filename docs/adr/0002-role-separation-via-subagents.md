---
status: Proposed
date: 2026-08-01
deciders: repository maintainer
revised: 2026-08-09
---

> **改訂記録（2026-08-09）**：本 ADR は Accepted になる前に改訂された
> （[ADR 0001](0001-reminders-as-system-of-record.md)・[ADR 0005](0005-project-scoped-apple-artifacts.md)
> と同じ扱い：Proposed のうちは改訂し、Accepted 後は改訂せず supersede する）。
>
> 初版は「PO 役・Developers 役を別コンテキストのサブエージェントに演じさせ、
> 独立した助言視点を得る」と決定し、実際に `product-owner-perspective` /
> `developers-perspective` として実装した。その後、**Product Owner と
> Developers は実在の人物であり、その判断はユーザーが会話に直接持ち込む**
> ことが明確になった。実在するアカウンタビリティが存在するところに AI の
> 代行視点を重ねると、「AI が PO/Developers を演じている」という誤解を生む。
> **決定を反転し、両サブエージェントを廃止した。** 以下は改訂後の内容。

# 0002. 役割視点はサブエージェントに演じさせず、実在する PO/Developers の判断を直接扱う

## Context and problem statement

Scrum Guide は1つの Scrum Team に Product Owner / Scrum Master / Developers の
3つのアカウンタビリティを定義する[SG20, p.5]。個人用スクラムでは1人がこれを
すべて兼ねる場面がある。**しかし本システムにおいて Product Owner・Developers は
架空の存在ではない。** 実在の人物であり、その判断・決定はユーザーが会話に
直接持ち込む——ユーザー自身が担うことも、ユーザーが実際の関係者を代弁する
こともある。

初版の本 ADR は、ここに別の問題を持ち込んでいた。「価値と実現可能性の独立した
検査機会をどう作るか」という論点に対し、**AI に PO 役・Developers 役を演じさせて
助言視点を得る**という機構（`product-owner-perspective` /
`developers-perspective` サブエージェント）を実装し、実際に動かした。

その結果、次の問題が明らかになった。**アカウンタビリティは人に割り当てられる**
（「プロダクトオーナーは1人であり、委員会ではない」[SG20, p.5]、
「プロダクトオーナーだけがスプリントを中止する権限を持つ」[SG20, p.8]）。
アカウンタビリティとは結果を引き受けることであり、AI は何も引き受けない
（これは Guide の逐語ではなく、上記からの推論）。実在する PO/Developers が
すでに判断を持ち込めるところに AI の代行視点を重ねると、生まれるのは
**「AI が PO/Developers を演じている」という誤解**であり、実在するアカウンタ
ビリティと AI の助言の境界を曖昧にする。**AI に期待する役割は Scrum Master
だけである。**

## Decision

**役割視点をサブエージェントに演じさせない。Product Owner と Developers の
判断は、実在する人物が会話に直接持ち込む。Claude はそれを Scrum Guide の
規範（透明性・検査・適応）に照らして検査する Scrum Master としてのみ関わる。**

したがって：

- `.claude/agents/product-owner-perspective.md` /
  `developers-perspective.md` を廃止する。
- `my-claude-code` に `product-owner` / `developers` スキルを追加する案も
  同じ理由で採らない——AI がアカウンタビリティを代行する形をどこにも作らない。
- `scrum-master` スキルは現状のまま、ファシリテーター／検査役として残る。
  既存の狭いルーティング定義を変更しない。
- 正しい PO / Developers の振る舞いを確認したいときは、vendoring した
  `scrum-master` スキルの規範層（`scrum-framework.md` の「Scrum Team の
  アカウンタビリティ」、`scrum-master-role.md` の「Product Owner への奉仕」）
  を人間が読む。AI が演じるための台本にはしない。
- 本システムは「経験主義を単独作業に適用する仕組み」として文書化する
  （README、CLAUDE.md）。

### Alternatives considered

**初版の決定：非対称なブリーフを与えた別コンテキストのサブエージェントとして
役割視点を実装する。** 実装し、実際に動かした。同一会話で PO 役と
Developers 役を演じさせると独立した利害を持たないため対話が即座に収束する
（偽の合意）という観察は正しく、別コンテキスト化はその対策として機能した。
**却下（反転）した理由は視点の質ではなく前提である。** PO/Developers は
実在するため、AI の代行視点はそもそも要らない。要るところに実装したのではなく、
要らないところに実装していた。

**`my-claude-code` に `product-owner` と `developers` スキルを追加する。**
却下。理由は初版と同じ2点に加え、根本の前提問題（実在するアカウンタビリティを
AI に演じさせるべきではない）が上乗せされる。
(1) スキルは `.claude/CLAUDE.md` の常時読み込まれるルーティング一覧に載り、
`scrum-master` を含む Scrum 系スキルが3つに増えて毎ターンの分岐が増える。
(2) スキルは同一会話にロードされるためコンテキストを共有し、偽の合意という
失敗モードを解決しない。

**既存 `scrum-master` スキル内の3スタンスとして表現する。** 却下。
同スキルには既に「支援モード」（ティーチャー／メンター／ファシリテーター／
コーチ等）という同型の機構があるが、帽子の切り替えを同一コンテキストで
宣言するだけでは分離が最も弱い。加えてこれも実在するアカウンタビリティを
AI に演じさせる前提を含む点で、そもそも採らない。

**視点分離を実装せず、決定権の明文化（運用規約）のみとする。** 採用。
「どの判断を PO の帽子で下すか、どの判断を Developers の帽子で下すかを
Notes に明文化する」ことは Sprint 1 に含める。実在するアカウンタビリティの
境界を人間自身が明文化するものであり、AI の代行を必要としない。

## Consequences

- 肯定：AI が PO/Developers を演じているという誤解が構造的に生じなくなる。
  実在するアカウンタビリティと AI の助言（Scrum Master としての検査）の
  境界が明確になる。
- 肯定：`product-owner-perspective` / `developers-perspective` の保守
  （フロンティア更新、テスト、`.claude/agents/` の管理）が不要になる。
- 肯定：`my-claude-code` の常時ロードされるルーティング表を汚さない。
  Scrum 系スキルは `scrum-master` のみのまま。
- 否定：**独立した利害を持つ視点による検査機会は、AI では代替しない。**
  必要なら実在の関係者にユーザーが直接確認し、その判断を会話に持ち込む
  ほかない。単独運用でこれが構造的に失われることは変わらず、埋まらない。
- 否定：一度実装したサブエージェント（2ファイル、単体テスト8件）を廃止する
  手戻りが発生した。判断の反転自体は健全な検査・適応だが、費用はゼロではない。
- 中立：`scrum-master` スキルの規範層（vendoring 済み）が、PO/Developers の
  正しい振る舞いを確認する唯一の参照先になる。ここを編集しない制約
  （[ADR 0005](0005-project-scoped-apple-artifacts.md)）は変わらない。

## Confirmation

- `.claude/agents/` に `product-owner-perspective.md` /
  `developers-perspective.md` が存在しないことを `tests/run-scrum-role-agents.sh`
  で検証する。
- README・`CLAUDE.md` が両サブエージェントを参照せず、PO/Developers が実在する
  前提とその判断の持ち込み方を明記していることを同スイートで検証する。
- `.claude/skills/scrum-master/` の vendoring スナップショットが変更されて
  いないことを同スイートで検証する（規範層への参照はするが編集はしない）。

## More information

- Scrum Guide 2020 — `.claude/skills/scrum-master/references/sources.md` の
  `[SG20]` エントリ
- 誰が Scrum Master を兼任できるかについての Guide の非制限と実務上の
  利益相反の議論 — 同 `references/scrum-master-role.md`「誰が Scrum Master
  になれるか」
- PO/Developers の正しい振る舞いの参照先 —
  `.claude/skills/scrum-master/references/scrum-framework.md`
  「Scrum Team のアカウンタビリティ」、同 `scrum-master-role.md`
  「Product Owner への奉仕」
- 記録源側の決定 — [ADR 0001](0001-reminders-as-system-of-record.md)
- 成果物の置き場所の決定 — [ADR 0005](0005-project-scoped-apple-artifacts.md)
