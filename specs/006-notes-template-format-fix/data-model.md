# Phase 1 Data Model: MarkdownからNotes標準フォーマットへの変換

この機能は永続DBを追加しない。以下は`write_note.js`内を流れる値と検証境界を表す。

## NotesMarkdownInput

| Field | Type | Rules |
|---|---|---|
| `title` | string or null | 新規作成時は必須。全文置換時は本文の最初の可視行から求める。 |
| `text` | string | UTF-8相当のプレーン文字列。raw HTMLとして解釈しない。 |
| `operation` | `create` or `overwrite` | Markdown変換対象の経路。 |
| `expectedHash` | string or null | overwriteでは必須。既存本文のSHA-256と完全一致が必要。 |

状態遷移:

`received` → `validated` → `converted` → `hash-verified`（overwriteのみ）→ `written`

`validated`以前の失敗ではNotesレコードを作成・変更しない。`converted`以前にApple Eventsの書き込みを行わない。

## MarkdownBlock

| Kind | Input | Notes HTML |
|---|---|---|
| Title | `# text` | `<h1>text</h1>` |
| Heading | `## text` | `<h2>text</h2>` |
| Subheading | `### text` | `<h3>text</h3>` |
| Body | plain line | `<div>text</div>` |
| Blank | empty line | `<div><br></div>` |
| Monostyled | fenced code block | `<pre>…</pre>` |
| Bulleted item | `* text` | `<ul><li>…</li></ul>` |
| Numbered item | `1. text` | `<ol><li>…</li></ol>` |
| Aligned paragraph | `{align=value}text` | allow-listed `text-align` on the paragraph |

Bulleted/Numbered items may be nested by exactly two spaces per level. A line indented two spaces beyond its current item without a list marker is an item-internal line break and must precede that item's nested list. The maximum supported nesting depth is documented by the conversion contract and validated before writing.

## InlineSpan

| Kind | Input | Notes HTML |
|---|---|---|
| Bold | `**text**` | `<b>text</b>` |
| Italic | `*text*` | `<i>text</i>` |
| Underline | `++text++` | `<u>text</u>` |
| Strikethrough | `~~text~~` | `<s>text</s>` |
| Color/size | `[text]{color=#RRGGBB size=N}` | allow-listed `<span style="…">text</span>` |

`color`は6桁の16進RGB、`size`は1–512の整数。片方だけでもよい。文字列は先にHTMLエスケープし、変換器が生成したタグ以外は実行可能マークアップにならない。

## UnsupportedFormat

| Format | Detection example | Result |
|---|---|---|
| Block Quote | `> text` | pre-write error |
| Highlight | `==text==` | pre-write error |
| Font family | `{font=…}`, `font-family`, `<font …>` | pre-write error |
| Dashed List | `- text` | pre-write error |
| Checklist | `- [ ] text`, `- [x] text` | pre-write error |

エラーは少なくとも`format`と`reason`を含む。対応済み構文の不正値（色、サイズ、配置、階層）も同じくpre-write errorとする。未閉鎖の通常インライン記号は文字列として保持し、後続範囲を巻き込まない。

## NoteWritePlan

| Field | Type | Rules |
|---|---|---|
| `name` | string | createは指定title、overwriteは変換元の最初の可視テキスト。 |
| `bodyHtml` | string | 検証済み・変換済みのHTML。createではtitleが1回だけ含まれる。 |
| `mutatesExisting` | boolean | overwriteのみtrue。 |

`NoteWritePlan`が完成するまでNotesの作成・本文代入を行わない。

## Template

`scrum/templates/`の8ファイル。拡張子は`.md`で、見出しは`#`/`##`/`###`、箇条書き欄は対応済みの`* `を使う。既存の記入欄・説明・分類の意味内容を保持する。
