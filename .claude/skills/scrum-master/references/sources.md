# 根拠資料

## 目次

- [使い方](#使い方)
- [規範的な基準](#規範的な基準)
- [補完的な実践と研究](#補完的な実践と研究)
- [アンチパターンとコーチングの実務資料](#アンチパターンとコーチングの実務資料)
- [スケーリングフレームワークの資料](#スケーリングフレームワークの資料)
- [引用ルール](#引用ルール)

## 使い方

Scrumそのものの定義はScrum Guideを最優先する。ほかの資料は、Scrumを置き換えず、測定、フロー、ファシリテーション、アンチパターン、スケーリング、チーム環境を補完するために使う。

根拠の強さを次のように区別する。

1. **規範**：Scrum Guideに明記されたScrumの定義
2. **公式補完**：Scrum.orgなどが公開する補完ガイド、Nexus Guideなど公式のスケーリング拡張
3. **研究・実務知見**：査読研究、継続的な業界研究、広く参照される実務書
4. **文脈依存の技法**：現場で試し、結果を検査すべきプラクティス（レトロ形式など、特定の単一の出典を持たない慣行を含む）

## 規範的な基準

### [SG20] The Scrum Guide

Ken Schwaber and Jeff Sutherland, _The Scrum Guide: The Definitive Guide to Scrum—The Rules of the Game_, November 2020.

https://scrumguides.org/docs/scrumguide/v2020/2020-Scrum-Guide-US.pdf

適用する主要箇所：

- Scrumは複雑な問題に対する適応的な解決を通じて価値を生む軽量なフレームワーク（p.3）。
- 経験主義の柱は透明性、検査、適応（pp.3–4）。
- Scrum ValuesはCommitment、Focus、Openness、Respect、Courage（pp.4–5）。
- Scrum Teamは階層やサブチームを持たず、自己管理し、通常10人以下（p.5）。
- Scrum MasterはScrumの確立とScrum Teamの有効性に責任を持つ（p.6）。
- Product Ownerは価値最大化とProduct Backlog管理、DevelopersはSprint Backlog、品質、日々の適応に責任を持つ（pp.5–6）。
- Scrumイベントの目的と最大タイムボックス（pp.7–10）。
- Product Goal、Sprint Goal、Definition of Doneは各作成物へのコミットメント（pp.10–12）。
- Scrumを部分的に実施することは可能だが、その結果はScrumではない（p.13）。

Scrum Guideの最新版表示と各言語版：

https://scrumguides.org/

ページ番号は英語版（*The Scrum Guide*, November 2020）に基づく。日本語版PDFは目次が2ページに渡るため「スクラムの定義」以降、英語版より1ページ後ろにずれる（例：スクラムの定義は英語版p.3・日本語版p.4、スクラムマスターは英語版p.6・日本語版p.7）。日本語版で本文を確認する場合は+1ページで読み替える。

### [NXG] The Nexus Guide

Scrum.org, _The Nexus Guide_（最新版、2026-07-25取得）。

https://www.scrum.org/resources/online-nexus-guide

適用する主要箇所：Scrumを最小限の変更でスケールする公式拡張。約3〜9チームが単一のProduct Backlogから1つのIntegrated Increment を届け、参加チームから選出されるNexus Integration Teamと、チーム横断の依存管理のためのNexusレベルイベントを追加する。

### [AM01] Manifesto for Agile Software Development and Principles

Beck et al., _Manifesto for Agile Software Development_, 2001.

https://agilemanifesto.org/

https://agilemanifesto.org/principles.html

適用する主要箇所：

- 価値あるソフトウェアの早期・継続的な提供を優先する。
- ビジネス側と開発者の継続的な協働、持続可能なペース、技術的卓越性、自己組織化、定期的な振り返りを重視する。
- 右側にも価値があると認めつつ、左側をより重視する。文書、計画、プロセスを否定する根拠に使わない。

## 補完的な実践と研究

### [EBM24] Evidence-Based Management Guide

Scrum.org, _Evidence-Based Management Guide_, updated 2024.

https://www.scrum.org/resources/evidence-based-management-guide

更新内容の説明：

https://www.scrum.org/resources/blog/evidence-based-management-guide-2024-whats-new

Scrum Teamの活動量ではなく、顧客成果、組織能力、事業成果を改善するために使う。Strategic Goal、Intermediate Goal、Immediate Tactical Goalと、Current Value、Unrealized Value、Ability to Innovate、Time to Marketの4 Key Value Areasを文脈に応じて参照する。

### [KGS21] The Kanban Guide for Scrum Teams

Scrum.org, Daniel Vacanti, and Yuval Yeret, _The Kanban Guide for Scrum Teams_, January 2021.

https://scrumorg-website-prod.s3.amazonaws.com/drupal/2021-01/01-2021%20Kanban%20Guide.pdf

Scrumを置き換えず、価値のフローを改善する補完策として使う（p.3）。基本フロー指標はWIP、Cycle Time、Work Item Age、Throughput（p.4）。ワークフローの可視化、WIP制限、進行中作業の能動的管理、Definition of Workflowの検査と適応を扱う（pp.4–6）。

### [DORA26] DORA software delivery performance metrics

DORA / Google Cloud, _DORA's software delivery performance metrics_, current page retrieved 2026-07-25.

https://dora.dev/guides/dora-metrics/

ソフトウェア提供の改善に限って、Change Lead Time、Deployment Frequency、Failed Deployment Recovery Time、Change Fail Rate、Deployment Rework Rateを使う。異なる文脈のチーム比較、単一指標の目標化、チーム間競争を避け、同一アプリケーションまたはサービスの経時改善に使う。

### [EDM99] Psychological safety and learning behavior

Amy C. Edmondson, "Psychological Safety and Learning Behavior in Work Teams," _Administrative Science Quarterly_, 44(2), 350–383, 1999.

https://doi.org/10.2307/2666999

心理的安全性を、チームが対人的リスクを取っても安全だという共有信念として扱い、学習行動との関係を検討した査読研究。心理的安全性を「対立がない」「要求水準が低い」状態と混同しない。

補助的な実務向け解説：American Psychological Association, "What is psychological safety at work?" 2023.

https://www.apa.org/topics/healthy-workplaces/psychological-safety

### [ART] Agile Retrospectives

Esther Derby & Diana Larsen, _Agile Retrospectives: Making Good Teams Great_, Pragmatic Bookshelf, 2006.

レトロスペクティブの5段階構造（場を整える・データを集める・意味を探る・選ぶ・閉じる）の出典。[event-playbooks.md](event-playbooks.md)で使用。

### [ICA] Coaching Agile Teams

Lyssa Adkins, _Coaching Agile Teams: A Companion for ScrumMasters, Agile Coaches, and Project Managers in Transition_, Addison-Wesley, 2010.

Scrum Master／アジャイルコーチのスタンス（ファシリテーター、コーチ、ティーチャー、メンター、対立の航行者）の出典。[scrum-master-role.md](scrum-master-role.md)で使用。

## アンチパターンとコーチングの実務資料

### [SAP] Scrum.org anti-patterns series

- 27 Sprint Anti-Patterns — https://www.scrum.org/resources/blog/27-sprint-anti-patterns
- Scrum Anti-Patterns Taxonomy — https://www.scrum.org/resources/blog/scrum-anti-patterns-taxonomy
- How the Scrum Master supports the Product Owner — https://www.scrum.org/resources/blog/how-can-scrum-master-support-product-owner

### [ZBS] Zombie Scrum

Christiaan Verwijs & Johannes Schartau, zombiescrum.org。Scrum.org経由の解説：

Zombie Scrum: Symptoms, Causes and Treatment — https://www.scrum.org/resources/blog/zombie-scrum-symptoms-causes-and-treatment

### [AAP] Agile Alliance

Scrum Master Anti-Patterns — https://agilealliance.org/scrum-master-anti-patterns/

Agile Allianceの用語集・リソース全般 — https://agilealliance.org

### Scrum Alliance（補足）

- Scrum Events（タイムボックスの目安） — https://resources.scrumalliance.org/Article/scrum-events
- What Is Timeboxing in Scrum — https://resources.scrumalliance.org/Article/timeboxing-scrum
- Agile Glossary — https://www.scrumalliance.org/glossary

## スケーリングフレームワークの資料

### [LESS] LeSS（Large-Scale Scrum）

Craig Larman & Bas Vodde。https://less.works

役割を追加せず組織的複雑さを取り除くことでScrumをスケールするフレームワーク。単一のProduct Backlog／Product Owner／Definition of Doneを多数チームで共有する。

### [SAFE] SAFe（Scaled Agile Framework）

Scaled Agile, Inc.。https://scaledagileframework.com

Agile Release TrainsとProgram Incrementsを軸とする、より規定的な大規模フレームワーク。

### [SC@S] The Scrum@Scale Guide

Jeff Sutherland and Scrum Inc., *The Scrum@Scale Guide*, Version 2.1, February 2022.

https://www.scrumatscale.com/scrum-at-scale-guide/

適用する主要箇所：「Scrum@Scale helps an organization to focus multiple networks of Scrum Teams on prioritized goals.」(p.2) — 最小限のガバナンス構造（minimum viable bureaucracy）で複数チームを調整する別系統のスケーリングガイド。手元にある日本語訳はVersion 1.02（英語版2.1とは版が異なる）のため、[scaling-frameworks.md](scaling-frameworks.md)では直接引用ではなく要約として扱う。

## 引用ルール

- Scrumの必須事項を述べるときは`[SG20, p.X]`を付ける。
- アジャイルの価値・原則を根拠にするときは`[AM01]`を付ける。
- フロー指標やWIP制限は`[KGS21, p.X]`を付ける。
- EBMまたはDORAの指標は、適用範囲と注意点を併記する。
- スケーリングフレームワーク（Nexus/LeSS/SAFe/Scrum@Scale）は、Scrum Guide自体の一部ではなく別の実践体系として出典を分けて引用する。
- 心理的安全性について因果を断定しない。研究の設計と適用範囲を超えて一般化しない。
- 原文引用は必要最小限にし、引用符とページを付ける。通常は正確に要約して出典を示す。
- 出典間で矛盾があれば、Scrumの定義はScrum Guideを優先し、相違を明示する。
