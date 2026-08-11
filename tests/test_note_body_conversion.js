#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const path = require('path');

global.ObjC = { import() {} };

const SCRIPT = path.join(
  __dirname, '..', '.claude', 'skills', 'apple-notes', 'scripts', 'write_note.js'
);
const {
  dedupTitleLine,
  firstVisibleLine,
  linesToBodyHtml,
  markdownToNotesHtml,
  validateNotesMarkdown,
} = require(SCRIPT);

let pass = 0;
let fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    fail += 1;
    failures.push(name);
    console.log(`FAIL ${name}`);
    console.log(`     ${error.message}`);
  }
}

function rejectsFormat(input, expectedName) {
  assert.throws(
    () => validateNotesMarkdown(input),
    (error) => error instanceof Error && error.message.includes(expectedName)
  );
}

// Title behavior.
test('dedupTitleLine drops an exact-match plain first line', () => {
  assert.equal(
    dedupTitleLine('Definition of Done', 'Definition of Done\n\n本文'),
    '\n本文'
  );
});

test('dedupTitleLine drops an exact-match Markdown Title first line', () => {
  assert.equal(
    dedupTitleLine('Definition of Done', '# Definition of Done\n\n本文'),
    '\n本文'
  );
});

test('dedupTitleLine leaves a near-match untouched', () => {
  assert.equal(
    dedupTitleLine(
      'Definition of Done',
      '# Definition of Done（上高地日帰り撮影）\n本文'
    ),
    '# Definition of Done（上高地日帰り撮影）\n本文'
  );
});

test('firstVisibleLine removes supported block and inline markers', () => {
  assert.equal(
    firstVisibleLine('\n## **Sprint** ++Review++'),
    'Sprint Review'
  );
});

// Paragraph styles and inline formatting.
test('markdownToNotesHtml renders Notes paragraph styles', () => {
  assert.equal(
    markdownToNotesHtml('# Title\n## Heading\n### Subheading\nBody'),
    '<h1>Title</h1><h2>Heading</h2><h3>Subheading</h3><div>Body</div>'
  );
});

test('markdownToNotesHtml renders fenced blocks as Monostyled', () => {
  assert.equal(
    markdownToNotesHtml('```js\nconst x = <tag>;\nsecond\n```'),
    '<pre>const x = &lt;tag&gt;;\nsecond</pre>'
  );
});

test('markdownToNotesHtml renders all supported inline styles', () => {
  assert.equal(
    markdownToNotesHtml(
      'A **bold** *italic* ++under++ ~~strike~~ [paint]{color=#CC0000 size=24}.'
    ),
    '<div>A <b>bold</b> <i>italic</i> <u>under</u> <s>strike</s> ' +
      '<span style="color: #CC0000; font-size: 24px">paint</span>.</div>'
  );
});

test('markdownToNotesHtml supports nested balanced inline styles', () => {
  assert.equal(
    markdownToNotesHtml('**bold and *italic***'),
    '<div><b>bold and <i>italic</i></b></div>'
  );
});

test('markdownToNotesHtml applies alignment to one paragraph only', () => {
  assert.equal(
    markdownToNotesHtml('{align=center}Centered words\n{align=right}Right\nBody'),
    '<div style="text-align: center">Centered words</div>' +
      '<div style="text-align: right">Right</div><div>Body</div>'
  );
});

test('markdownToNotesHtml escapes raw HTML and quotes', () => {
  assert.equal(
    markdownToNotesHtml('<script>"x" & \'y\'</script>'),
    '<div>&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;</div>'
  );
});

test('unmatched inline markers remain readable text', () => {
  assert.equal(
    markdownToNotesHtml('before **open and ++open'),
    '<div>before **open and ++open</div>'
  );
});

test('linesToBodyHtml remains a converter compatibility alias', () => {
  assert.equal(linesToBodyHtml('## Heading'), '<h2>Heading</h2>');
});

// Lists.
test('Bulleted List uses * markers', () => {
  assert.equal(
    markdownToNotesHtml('* one\n* two'),
    '<ul><li>one</li><li>two</li></ul>'
  );
});

test('Numbered List uses decimal markers and preserves order', () => {
  assert.equal(
    markdownToNotesHtml('1. one\n2. two'),
    '<ol><li>one</li><li>two</li></ol>'
  );
});

test('same-level list kind changes preserve sequence', () => {
  assert.equal(
    markdownToNotesHtml('* bullet\n1. number'),
    '<ul><li>bullet</li></ul><ol><li>number</li></ol>'
  );
});

test('two-space indentation creates a nested list', () => {
  assert.equal(
    markdownToNotesHtml('* parent\n  * child\n* next'),
    '<ul><li>parent<ul><li>child</li></ul></li><li>next</li></ul>'
  );
});

test('indented unmarked text creates an item continuation', () => {
  assert.equal(
    markdownToNotesHtml('* parent\n  continuation'),
    '<ul><li>parent<br>continuation</li></ul>'
  );
});

test('item continuation before a nested list stays inside its parent item', () => {
  assert.equal(
    markdownToNotesHtml('* parent\n  continuation\n  * child\n* next'),
    '<ul><li>parent<br>continuation<ul><li>child</li></ul></li><li>next</li></ul>'
  );
});

test('item continuation after a nested list is rejected instead of creating an empty bullet', () => {
  rejectsFormat('* parent\n  * child\n  late continuation', 'List continuation');
});

test('a blank line ends list context before an indented body paragraph', () => {
  assert.equal(
    markdownToNotesHtml('* parent\n  * child\n\n  indented body'),
    '<ul><li>parent<ul><li>child</li></ul></li></ul>' +
      '<div><br></div><div>  indented body</div>'
  );
});

test('odd list indentation is rejected before conversion', () => {
  rejectsFormat(' * item', 'List indentation');
});

test('tabs in list indentation are rejected before conversion', () => {
  rejectsFormat('\t* item', 'List indentation');
});

test('list nesting deeper than level 8 is rejected', () => {
  rejectsFormat('                  * too deep', 'List nesting');
});

// Unsupported native formats and invalid allow-list attributes.
test('Block Quote is rejected', () => rejectsFormat('> quote', 'Block Quote'));
test('Highlight is rejected', () => rejectsFormat('==highlight==', 'Highlight'));
test('Font family syntax is rejected', () => rejectsFormat('{font=Marker Felt}x', 'Font family'));
test('CSS font-family is rejected', () => rejectsFormat('font-family: serif', 'Font family'));
test('HTML font tag is rejected in plain input', () => rejectsFormat('<font face="serif">x</font>', 'Font family'));
test('Dashed List is rejected', () => rejectsFormat('- dashed', 'Dashed List'));
test('unchecked Checklist is rejected before Dashed List', () => rejectsFormat('- [ ] todo', 'Checklist'));
test('checked Checklist is rejected before Dashed List', () => rejectsFormat('- [x] done', 'Checklist'));
test('invalid color is rejected', () => rejectsFormat('[x]{color=red}', 'color'));
test('invalid size is rejected', () => rejectsFormat('[x]{size=0}', 'size'));
test('invalid alignment is rejected', () => rejectsFormat('{align=middle}x', 'alignment'));

console.log(`\n${pass} passed, ${fail} failed.`);
if (fail > 0) {
  console.log('Failing: ' + failures.join(', '));
  process.exit(1);
}
