# Contract: Markdown-to-Notes HTML conversion for `write_note.js`

この契約は`create()`の`--text`/`--text-stdin`と、`overwrite()`の`--overwrite-stdin`に適用する。raw `--html`、`--append`、`--append-stdin`、`--append-html`、`--replace-block`は対象外。

## Processing order and atomicity

1. 入力全体の未対応書式と属性値を検証する。
2. createだけ、先頭の重複タイトルを除去する。
3. 全文をHTMLへ変換し、書き込み計画を完成させる。
4. overwriteだけ、既存本文ハッシュを照合する。
5. 初めてNotesの作成または本文代入を行う。

1–4で失敗した場合、Notesを部分的に作成・変更してはならない。`Application('Notes')`の取得や読み取りは許されるが、`folder.notes.push()`、`note.name =`、`note.body =`より前に変換を完了する。

## Title deduplication

createでは`title.trim()`と、本文の先頭行をtrimした文字列を大文字小文字も含めて完全一致比較する。先頭行が`# `で始まる場合は、そのprefixを除いた文字列を比較する。一致時だけその1行を除去する。部分一致、2行目以降、`##`/`###`は除去しない。

`app.Note()`には`name`を渡さず、完成HTMLの先頭に`<h1>{escaped title}</h1>`を1回だけ置く。

## Block syntax

| Input | Output | Notes format |
|---|---|---|
| `# text` | `<h1>…</h1>` | Title |
| `## text` | `<h2>…</h2>` | Heading |
| `### text` | `<h3>…</h3>` | Subheading |
| plain line | `<div>…</div>` | Body |
| empty line | `<div><br></div>` | Empty Body |
| fenced block with triple backticks | `<pre>…</pre>` | Monostyled |
| `* item` | `<ul><li>…</li></ul>` | Bulleted List |
| `1. item` | `<ol><li>…</li></ol>` | Numbered List |
| `{align=left}text` | paragraph with allow-listed `text-align` | Alignment |

Alignment values are exactly `left`, `center`, `right`, `justify`. Prefix applies to one paragraph only and may precede a heading or body line, but not a list item or fenced block.

Fenced blocks may use an optional language label, which is not displayed and does not change Notes formatting. Their content is HTML-escaped and inline formatting is not parsed. An unclosed fence is preserved as ordinary readable text rather than consuming the rest of the note.

## Inline syntax

| Input | Output |
|---|---|
| `**bold**` | `<b>bold</b>` |
| `*italic*` | `<i>italic</i>` |
| `++underline++` | `<u>underline</u>` |
| `~~strike~~` | `<s>strike</s>` |
| `[text]{color=#RRGGBB}` | `<span style="color: #RRGGBB">text</span>` |
| `[text]{size=N}` | `<span style="font-size: Npx">text</span>` |
| `[text]{color=#RRGGBB size=N}` | one allow-listed span with both properties |

`N` is an integer from 1 through 512. Attribute order may be `color size` or `size color`, with one ASCII space between attributes. Attribute text is never copied directly into HTML. Balanced supported inline markers may nest; unmatched markers remain escaped readable text and must not affect later content.

## Lists

- A Bulleted item starts with `* `; a Numbered item starts with one or more decimal digits followed by `. `.
- Exactly two leading ASCII spaces represent one nesting level. Tabs and odd indentation are invalid.
- Nesting depth is 0–8. Deeper input fails before writing rather than flattening.
- A line indented exactly two spaces beyond the current item, with no list marker, becomes an item-internal `<br>` continuation. Continuation lines must appear before that item's nested list; Notes closes the parent item when a nested list begins, so a later continuation is rejected before writing instead of becoming an empty bullet.
- A list kind change at the same or nested level starts the corresponding `<ul>` or `<ol>` while preserving order.
- User text inside every item and continuation is escaped before inline parsing.

## Unsupported native formats (Option B)

The following requests fail before writing and include the displayed format name in the error:

| Detection | Error format |
|---|---|
| line beginning `> ` | `Block Quote` |
| balanced `==text==` | `Highlight` |
| `{font=…}`, CSS `font-family`, or an HTML `<font` tag in plain input | `Font family` |
| line beginning `- ` | `Dashed List` |
| line beginning `- [ ] ` or `- [x] ` | `Checklist` |

Checklist is detected before the more general Dashed List rule. These formats must not be silently converted to Body or Bulleted List. Accessibility/UI automation is prohibited.

## Safety and errors

- Escape `&`, `<`, `>`, `"`, and `'` from user-controlled text before inserting it into generated markup.
- Only converter-generated tags and allow-listed style values may appear in converted HTML.
- Invalid color, size, alignment, list indentation, or nesting produces a pre-write error naming the field and reason.
- Unsupported native format requests produce a pre-write error even if the rest of the input is valid.
- Unknown or unmatched ordinary Markdown punctuation remains readable escaped text.

## Compatibility

- `linesToBodyHtml(text)` remains an exported compatibility alias for the new converter.
- Existing `dedupTitleLine(title, text)` remains exported and gains `# title` handling.
- New pure exports include validation, conversion, and first-visible-line helpers so Node tests can run without Notes.app.
- overwrite retains its exact SHA-256 guard semantics; the first visible source line becomes the note name, without Markdown markers.
