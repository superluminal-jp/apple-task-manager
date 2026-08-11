#!/usr/bin/osascript -l JavaScript
//
// Create a note, append to one, replace a fenced region in place, or --
// under a hash gate -- overwrite or delete one. Prints the resulting note
// (or, for --delete, a pre-deletion snapshot) as JSON.
//
//   # create -- the first line becomes the title Notes.app displays
//   osascript -l JavaScript write_note.js --folder "Scrum" \
//     --title "Sprint 7 Goal" --text "Cut checkout drop-off on mobile."
//
//   # create into a folder resolved by id -- required once same-named folders
//   # can exist (e.g. every project's own "Sprint 1" subfolder)
//   osascript -l JavaScript write_note.js --folder-id "<folder id>" \
//     --title "Sprint 1 Goal" --text "..."
//
//   # append (body from stdin, so it can span lines)
//   echo "Retro action: shrink the WIP limit to 2" \
//     | osascript -l JavaScript write_note.js --id "<id>" --append-stdin
//
//   # append raw HTML when structure matters (a list, a table)
//   osascript -l JavaScript write_note.js --id "<id>" --append-html "<ul><li>a</li></ul>"
//
//   # replace one named, fenced region in place -- created on first write,
//   # replaced (not duplicated) on every write after that
//   echo "status: in progress" \
//     | osascript -l JavaScript write_note.js --id "<id>" --replace-block "status" --replace-stdin
//
//   # overwrite the whole body -- only if the note's current body still
//   # hashes to --expect-hash (see "Conditional overwrite and delete" below)
//   HASH=$(osascript -l JavaScript list_notes.js --id "<id>" --plaintext --field plaintext \
//     | python3 note_write_guard.py hash)
//   echo "corrected content" | osascript -l JavaScript write_note.js --id "<id>" \
//     --overwrite-stdin --expect-hash "$HASH"
//
//   # delete -- same hash gate, no stdin needed
//   osascript -l JavaScript write_note.js --id "<id>" --delete --expect-hash "$HASH"
//
// Rules this script enforces structurally rather than by convention:
//
//   1. **--id means append, --replace-block, --overwrite-stdin, or --delete,
//      never create.** An unresolvable id fails rather than creating a stray
//      note somewhere the user will not look for it.
//   2. **--folder matches ambiguously fail rather than picking one.** Once
//      subfolders exist (multi-project Sprint subfolders in particular,
//      apple-notes's `ensure_folder.js --parent-id`), two folders can share a
//      display name across different parents. `--folder <name>` searches the
//      whole account and refuses on more than one match; `--folder-id <id>`
//      is unambiguous by construction and is the only safe choice once a
//      collision is possible.
//   3. **--replace-block only ever touches its own fenced region.** It finds
//      `--- <name> ---` … `---` in the raw HTML body and replaces exactly
//      that span -- prose outside any fence is never read as replaceable, so
//      this cannot become a general whole-body replace by a different name.
//      It creates the block (appends it) if absent, the same posture
//      `scrum_block.py`'s `render_block` already takes on the Reminders side,
//      and it refuses -- rather than guessing -- when the fence is
//      unterminated or the block name matches more than once.
//
// A note body is HTML. Plain text passed to --text, --append-stdin,
// --replace-stdin, or --overwrite-stdin is escaped and wrapped in a <div>
// per line, because raw newlines do not render.
//
// ## Conditional overwrite and delete
//
// `--overwrite-stdin` (replace the whole body) and `--delete` (remove the
// note) both require `--expect-hash <sha256>`. Immediately before writing,
// this script recomputes the SHA-256 of the note's *current* plaintext body
// and calls out to `note_write_guard.py decide` to compare it against
// `--expect-hash`. If they do not match -- the note changed since the caller
// last read it -- **no write happens at all**, and the command fails. This is
// optimistic concurrency, not a permission check: it does not stop a caller
// who read the note seconds ago and is intentionally, correctly overwriting
// it. What it does stop is silently clobbering a note that changed out from
// under the caller between the read and the write.
//
// This is a real, irreversible capability -- unlike append and
// --replace-block, a wrong --overwrite-stdin or --delete call can destroy
// prose with no undo path this script controls. Anything that calls these
// two flags MUST present the replacement content (or the deletion target) to
// the user and get explicit approval first, every time -- see the
// "Conditional overwrite and delete" section of this skill's SKILL.md and
// docs/adr/0007-conditional-overwrite-delete-for-notes.md. That approval step
// cannot be enforced by this script; it is a convention the caller must
// follow, because no hook can inspect what an Apple Event actually sends
// (CLAUDE.md, "破壊的操作").

ObjC.import('stdlib');
ObjC.import('Foundation');

function run(argv) {
  const opts = parseArgs(argv);
  const app = Application('Notes');

  try {
    const result = opts.delete
      ? deleteNote(app, opts)
      : opts.overwrite
      ? overwrite(app, opts)
      : opts.blockName
      ? replaceBlock(app, opts)
      : opts.id
      ? append(app, opts)
      : create(app, opts);
    return JSON.stringify(result, null, 2);
  } catch (error) {
    return fail(error.message);
  }
}

function parseArgs(argv) {
  const opts = {
    id: null,
    folder: null,
    folderId: null,
    title: null,
    html: null,
    rawText: null,
    appendHtml: null,
    blockName: null,
    replaceHtml: null,
    overwrite: false,
    overwriteText: null,
    delete: false,
    expectHash: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--id') opts.id = argv[++i];
    else if (arg === '--folder') opts.folder = argv[++i];
    else if (arg === '--folder-id') opts.folderId = argv[++i];
    else if (arg === '--title') opts.title = argv[++i];
    else if (arg === '--text') opts.rawText = argv[++i];
    else if (arg === '--text-stdin') opts.rawText = readStdin();
    else if (arg === '--html') opts.html = argv[++i];
    else if (arg === '--append') opts.appendHtml = toHtml(argv[++i]);
    else if (arg === '--append-stdin') opts.appendHtml = toHtml(readStdin());
    else if (arg === '--append-html') opts.appendHtml = argv[++i];
    else if (arg === '--replace-block') opts.blockName = argv[++i];
    else if (arg === '--replace') opts.replaceHtml = toHtml(argv[++i]);
    else if (arg === '--replace-stdin') opts.replaceHtml = toHtml(readStdin());
    else if (arg === '--replace-html') opts.replaceHtml = argv[++i];
    else if (arg === '--overwrite-stdin') {
      opts.overwrite = true;
      opts.overwriteText = readStdin();
    }
    else if (arg === '--delete') opts.delete = true;
    else if (arg === '--expect-hash') opts.expectHash = argv[++i];
    else fail('unknown option: ' + arg);
  }

  if (opts.delete) {
    if (opts.overwrite || opts.blockName !== null || opts.appendHtml !== null) {
      fail('--delete cannot be combined with --overwrite-stdin, --replace-block, or --append*');
    }
    if (!opts.id) fail('--delete needs --id');
    if (!opts.expectHash) fail('--delete needs --expect-hash');
    return opts;
  }

  if (opts.overwrite) {
    if (opts.blockName !== null || opts.appendHtml !== null) {
      fail('--overwrite-stdin cannot be combined with --replace-block or --append*');
    }
    if (!opts.id) fail('--overwrite-stdin needs --id');
    if (!opts.expectHash) fail('--overwrite-stdin needs --expect-hash');
    return opts;
  }

  if (opts.blockName !== null) {
    if (!opts.id) fail('--replace-block needs --id');
    if (opts.appendHtml !== null) fail('use --append* or --replace-block, not both');
    if (opts.replaceHtml === null) fail('--replace-block needs one of --replace / --replace-stdin / --replace-html');
    const name = String(opts.blockName).trim();
    if (name.length === 0) fail('--replace-block must be non-empty');
    opts.blockName = name;
    return opts;
  }

  if (opts.id && opts.appendHtml === null) fail('--id needs one of --append / --append-stdin / --append-html / --replace-block / --overwrite-stdin / --delete');
  if (opts.folder && opts.folderId) fail('use --folder or --folder-id, not both');
  if (!opts.id && !opts.folder && !opts.folderId) fail('--folder or --folder-id is required when creating (--id appends)');
  if (!opts.id && !opts.title) fail('--title is required when creating');
  return opts;
}

function create(app, opts) {
  // Finish validation and conversion before constructing or pushing a Notes
  // record. Unsupported native formats therefore cannot leave a partial note.
  const convertedHtml = opts.rawText !== null && opts.rawText !== undefined
    ? markdownToNotesHtml(dedupTitleLine(opts.title, opts.rawText))
    : (opts.html || '');
  const body = '<h1>' + escapeHtml(opts.title) + '</h1>' + convertedHtml;

  let folder, folderName;
  if (opts.folderId) {
    try {
      folder = app.folders.byId(opts.folderId);
      folderName = folder.name(); // Force the specifier to resolve now, not later.
    } catch (error) {
      fail('no folder with id: ' + opts.folderId);
    }
  } else {
    const matches = app.folders.whose({ name: opts.folder });
    if (matches.length === 0) fail('no such folder: ' + opts.folder);
    if (matches.length > 1) {
      fail(
        'folder name is ambiguous in the account: ' + opts.folder +
          ' -- use --folder-id (from ensure_folder.js) instead'
      );
    }
    folder = matches[0];
    folderName = opts.folder;
  }

  // Notes derives the displayed title from the first line of the body, so the
  // title is prepended as an <h1> -- and, critically, `name` is NOT also
  // passed to `Note()`. Setting `name` at creation time makes Notes.app
  // unconditionally inject its own plain `<div>{name}</div>` as the note's
  // literal first body line, in addition to whatever the body already
  // contains -- confirmed by direct experiment (specs/006-notes-template-
  // format-fix/research.md "Root cause, corrected"). That injection, not
  // anything a caller passes via --text, is what produced every previously
  // reported duplicated title: the <h1> we send is preserved as one styled
  // line, and Notes prepends a second, plain, `name`-derived line ahead of
  // it. Passing only `body` lets Notes derive both the display title and
  // `note.name()` from the <h1> alone, with nothing to duplicate against.
  //
  // A caller can still independently repeat the title as literal text inside
  // --text/--text-stdin (as this note's own history did) -- dedupTitleLine
  // guards against that separately (contracts/note-body-conversion.md Rule
  // 1), and markdownToNotesHtml renders only the allow-listed Notes formats.
  // Raw --html content (no opts.rawText) is used as-is.
  const note = app.Note({ body: body });
  folder.notes.push(note);
  return describe(note, folderName);
}

function append(app, opts) {
  let note;
  try {
    note = app.notes.byId(opts.id);
    note.name(); // Resolve now: a bad id must fail here, not silently later.
  } catch (error) {
    fail('no note with id: ' + opts.id);
  }
  // JXA cannot resolve a note's documented `container` property. Resolve the
  // folder before mutating so a membership failure cannot turn a completed
  // append into an error that the caller might retry.
  const folderName = folderNameForId(app, opts.id);
  note.body = note.body() + opts.appendHtml;
  return describe(note, folderName);
}

// A named block is fenced by two literal lines, written the same way toHtml()
// would wrap them: "--- <name> ---" to open, "---" to close. Matching against
// the raw HTML (not a stripped-down plaintext view) means the replacement can
// splice the body by a plain string slice -- no HTML parsing, no risk of
// mangling markup elsewhere in the note.
function openFenceHtml(name) {
  return '<div>--- ' + escapeHtml(name) + ' ---</div>';
}
const CLOSE_FENCE_HTML = '<div>---</div>';

// Returns {start, end} spanning the fenced block (inclusive of both fence
// lines) in `body`, or null if the block does not exist yet. Throws on an
// unterminated or duplicated block rather than returning a best guess -- see
// rule 4 in the header comment.
function findBlock(body, name) {
  const openTag = openFenceHtml(name);
  const first = body.indexOf(openTag);
  if (first === -1) return null;

  const second = body.indexOf(openTag, first + openTag.length);
  if (second !== -1) fail('block name is ambiguous in the note: ' + name);

  const close = body.indexOf(CLOSE_FENCE_HTML, first + openTag.length);
  if (close === -1) {
    fail(
      'unterminated block: ' + name + ' -- fix the note by hand before writing to it'
    );
  }
  return { start: first, end: close + CLOSE_FENCE_HTML.length };
}

function replaceBlock(app, opts) {
  let note;
  try {
    note = app.notes.byId(opts.id);
    note.name(); // Resolve now: a bad id must fail here, not silently later.
  } catch (error) {
    fail('no note with id: ' + opts.id);
  }
  const folderName = folderNameForId(app, opts.id);

  const body = note.body() || '';
  const newBlock = openFenceHtml(opts.blockName) + opts.replaceHtml + CLOSE_FENCE_HTML;
  const existing = findBlock(body, opts.blockName);

  const newBody = existing === null
    ? body + newBlock
    : body.slice(0, existing.start) + newBlock + body.slice(existing.end);

  note.body = newBody;
  return describe(note, folderName);
}

// Replaces the whole body, but only if the note's current body still hashes
// to opts.expectHash (see "Conditional overwrite and delete" in the header
// comment). Sets both `name` and the body's displayed title to the new first
// line, mirroring create()'s reasoning: the display title is derived from
// the body's first line, and `name` should not be left pointing at stale
// text. Unlike create(), no dedupTitleLine step is needed here: overwrite()
// never prepends a separate <h1> the way create() does, so there is no
// second title-shaped line for a matching first line to collide with. The
// Markdown conversion still applies, the same as create(). It is completed
// before resolving or mutating the existing note so invalid input is atomic.
function overwrite(app, opts) {
  const overwriteText = opts.overwriteText || '';
  const convertedHtml = markdownToNotesHtml(overwriteText);
  const convertedName = firstVisibleLine(overwriteText);

  let note;
  try {
    note = app.notes.byId(opts.id);
    note.name(); // Resolve now: a bad id must fail here, not silently later.
  } catch (error) {
    fail('no note with id: ' + opts.id);
  }
  const folderName = folderNameForId(app, opts.id);

  const currentPlaintext = toPlainText(note.body() || '') || '';
  if (guardDecide(currentPlaintext, opts.expectHash) !== 'allow') {
    fail(
      'overwrite refused: the note has changed since it was last read ' +
        '(hash mismatch) -- read it again before retrying'
    );
  }

  note.name = convertedName;
  note.body = convertedHtml;
  return describe(note, folderName);
}

// Deletes the note, but only under the same hash gate as overwrite(). The
// id/name/folder are captured before deleting -- once app.delete(note) runs,
// the note object can no longer be queried.
function deleteNote(app, opts) {
  let note;
  try {
    note = app.notes.byId(opts.id);
    note.name(); // Resolve now: a bad id must fail here, not silently later.
  } catch (error) {
    fail('no note with id: ' + opts.id);
  }
  const folderName = folderNameForId(app, opts.id);
  const snapshot = describe(note, folderName);

  const currentPlaintext = toPlainText(note.body() || '') || '';
  if (guardDecide(currentPlaintext, opts.expectHash) !== 'allow') {
    fail(
      'delete refused: the note has changed since it was last read ' +
        '(hash mismatch) -- read it again before retrying'
    );
  }

  app.delete(note);
  snapshot.deleted = true;
  return snapshot;
}

// Calls note_write_guard.py's `decide` subcommand and returns its trimmed
// stdout ("allow" or "refuse"). `plaintext` goes to the subprocess via a
// temp file, not a pipe written from this process -- writing a large body
// into an NSPipe while nothing reads it can deadlock (the OS pipe buffer
// fills before python3 starts reading); a temp file has no such limit. The
// subprocess's own stdout is tiny (one word) and safe to read in one shot
// after waitUntilExit. See
// specs/005-notes-conditional-overwrite/research.md §2.
function guardDecide(plaintext, expectHash) {
  const guardPath = guardScriptPath();
  const tempPath = writeTempFile(plaintext);
  try {
    const task = $.NSTask.alloc.init;
    task.launchPath = '/usr/bin/env';
    task.arguments = ['python3', guardPath, 'decide', '--expect-hash', expectHash];
    task.standardInput = $.NSFileHandle.fileHandleForReadingAtPath(tempPath);
    const outPipe = $.NSPipe.pipe;
    task.standardOutput = outPipe;
    task.launch;
    task.waitUntilExit;
    if (task.terminationStatus !== 0) {
      fail('note_write_guard.py exited with status ' + task.terminationStatus);
    }
    const data = outPipe.fileHandleForReading.readDataToEndOfFile;
    const text = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
    return (text || '').trim();
  } finally {
    $.NSFileManager.defaultManager.removeItemAtPathError(tempPath, null);
  }
}

// Writes `text` (UTF-8) to a fresh temp file and returns its path. Used only
// to feed guardDecide()'s subprocess stdin -- never a note body, never
// user-facing.
function writeTempFile(text) {
  const dir = ObjC.unwrap($.NSTemporaryDirectory());
  const unique = ObjC.unwrap($.NSProcessInfo.processInfo.globallyUniqueString);
  const path = dir + 'apple-notes-write-guard-' + unique + '.txt';
  const nsText = $.NSString.alloc.initWithString(text === null || text === undefined ? '' : text);
  nsText.writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
  return path;
}

// note_write_guard.py lives beside this script. JXA has no __dirname, so the
// path is recovered from the raw process argv (NSProcessInfo sees the whole
// `osascript -l JavaScript <path> ...` invocation, unlike the `argv`
// parameter run() receives, which only holds this script's own arguments).
function guardScriptPath() {
  const args = ObjC.deepUnwrap($.NSProcessInfo.processInfo.arguments);
  for (let i = 0; i < args.length; i++) {
    if (typeof args[i] === 'string' && args[i].endsWith('write_note.js')) {
      const dir = ObjC.unwrap(
        $.NSString.alloc.initWithString(args[i]).stringByDeletingLastPathComponent
      );
      return dir + '/note_write_guard.py';
    }
  }
  fail('could not locate note_write_guard.py: write_note.js was not found in the process arguments');
}

function folderNameForId(app, noteId) {
  const folders = app.folders();
  let match = null;
  for (let i = 0; i < folders.length; i++) {
    if (folders[i].notes.id().indexOf(noteId) === -1) continue;
    if (match !== null) fail('note belongs to multiple folders: ' + noteId);
    match = normalize(folders[i].name());
  }
  if (match === null) fail('could not resolve folder for note: ' + noteId);
  return match;
}

function describe(note, folderName) {
  return {
    id: normalize(note.id()),
    name: normalize(note.name()),
    folder: normalize(folderName),
    creationDate: normalize(note.creationDate()),
    modificationDate: normalize(note.modificationDate()),
  };
}

// Drops a first line that exactly repeats `title` (both trimmed), so a
// caller's --text/--text-stdin content does not duplicate the <h1> create()
// already prepends -- see contracts/note-body-conversion.md Rule 1. Only an
// exact match counts: a first line that merely resembles the title (e.g. a
// title with a suffix in parentheses) is real content and must survive.
function dedupTitleLine(title, rawText) {
  const lines = String(rawText).split('\n');
  const first = lines[0].trim().replace(/^#\s+/, '');
  if (first === String(title).trim()) {
    return lines.slice(1).join('\n');
  }
  return rawText;
}

const MAX_LIST_LEVEL = 8;
const ALIGNMENTS = ['left', 'center', 'right', 'justify'];

function formatError(format, reason) {
  throw new Error('unsupported Notes format: ' + format + ' -- ' + reason);
}

function closedFenceLines(lines) {
  const fenced = {};
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!/^```/.test(lines[i])) continue;
    if (open === -1) {
      open = i;
    } else {
      for (let j = open; j <= i; j++) fenced[j] = true;
      open = -1;
    }
  }
  return fenced;
}

function parseListLine(line) {
  if (/^\t+/.test(line) && /^(?:\t+)(?:\* |\d+\. )/.test(line)) {
    formatError('List indentation', 'tabs are not allowed; use two spaces per level');
  }
  const match = /^( *)(\* |\d+\. )(.*)$/.exec(line);
  if (!match) return null;
  if (match[1].length % 2 !== 0) {
    formatError('List indentation', 'use exactly two spaces per level');
  }
  const level = match[1].length / 2;
  if (level > MAX_LIST_LEVEL) {
    formatError('List nesting', 'maximum supported level is ' + MAX_LIST_LEVEL);
  }
  return {
    level: level,
    kind: match[2] === '* ' ? 'ul' : 'ol',
    text: match[3],
  };
}

function parseSpanAttributes(spec) {
  const tokens = String(spec).trim().split(/ +/).filter(Boolean);
  const attrs = {};
  if (tokens.length === 0) formatError('attribute', 'empty formatting attribute');
  for (let i = 0; i < tokens.length; i++) {
    const pair = /^([a-z]+)=(.+)$/.exec(tokens[i]);
    if (!pair) formatError('attribute', 'expected name=value');
    if (pair[1] === 'color') {
      if (!/^#[0-9A-Fa-f]{6}$/.test(pair[2])) {
        formatError('color', 'use a six-digit #RRGGBB value');
      }
      attrs.color = pair[2].toUpperCase();
    } else if (pair[1] === 'size') {
      if (!/^\d+$/.test(pair[2]) || Number(pair[2]) < 1 || Number(pair[2]) > 512) {
        formatError('size', 'use an integer from 1 through 512');
      }
      attrs.size = Number(pair[2]);
    } else if (pair[1] === 'font') {
      formatError('Font family', 'public Apple Events do not preserve font family');
    } else {
      formatError('attribute', 'unknown attribute: ' + pair[1]);
    }
  }
  return attrs;
}

function validateNotesMarkdown(text) {
  const lines = String(text).split('\n');
  const fenced = closedFenceLines(lines);
  let previousListLevel = null;
  const listItemSeen = {};
  const nestedListSeen = {};
  function resetListContext() {
    previousListLevel = null;
    Object.keys(listItemSeen).forEach((key) => {
      delete listItemSeen[key];
      delete nestedListSeen[key];
    });
  }

  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const line = lines[i];

    if (/^\s*-\s+\[[ xX]\]\s+/.test(line)) {
      formatError('Checklist', 'public Apple Events do not preserve checklist state');
    }
    if (/^\s*-\s+/.test(line)) {
      formatError('Dashed List', 'public Apple Events flatten it to a bulleted list');
    }
    if (/^\s*>\s?/.test(line)) {
      formatError('Block Quote', 'public Apple Events flatten it to Body');
    }
    if (/==[^=\n]+==/.test(line)) {
      formatError('Highlight', 'public Apple Events discard highlighting');
    }
    if (/\{font=|font-family\s*:|<font\b/i.test(line)) {
      formatError('Font family', 'public Apple Events do not preserve font family');
    }

    const alignLike = /^\{align=([^}]*)\}/.exec(line);
    if (alignLike && ALIGNMENTS.indexOf(alignLike[1]) === -1) {
      formatError('alignment', 'use left, center, right, or justify');
    }
    if (/^\{align=/.test(line) && !alignLike) {
      formatError('alignment', 'close the alignment prefix with }');
    }
    if (alignLike && /^(?:\* |\d+\. )/.test(line.slice(alignLike[0].length))) {
      formatError('alignment', 'alignment prefixes cannot be applied to list items');
    }

    const list = parseListLine(line);
    if (list) {
      if (previousListLevel === null && list.level !== 0) {
        formatError('List nesting', 'a nested item needs a parent item');
      }
      if (previousListLevel !== null && list.level > previousListLevel + 1) {
        formatError('List nesting', 'levels cannot be skipped');
      }
      if (list.level > 0) nestedListSeen[list.level - 1] = true;
      listItemSeen[list.level] = true;
      nestedListSeen[list.level] = false;
      Object.keys(listItemSeen).forEach((key) => {
        if (Number(key) > list.level) {
          delete listItemSeen[key];
          delete nestedListSeen[key];
        }
      });
      previousListLevel = list.level;
    } else if (line.trim() !== '') {
      const continuation = /^( +)(.*)$/.exec(line);
      if (continuation && continuation[1].length % 2 === 0) {
        const parentLevel = continuation[1].length / 2 - 1;
        if (parentLevel >= 0 && listItemSeen[parentLevel] && nestedListSeen[parentLevel]) {
          formatError(
            'List continuation',
            'place item continuation lines before a nested list'
          );
        }
      } else if (!/^ +/.test(line)) {
        resetListContext();
      }
    } else {
      resetListContext();
    }

    const spanPattern = /\[[^\]\n]*\]\{([^}\n]*)\}/g;
    let spanMatch;
    while ((spanMatch = spanPattern.exec(line)) !== null) {
      parseSpanAttributes(spanMatch[1]);
    }
  }
  return true;
}

function findClosingDelimiter(text, start, delimiter) {
  if (delimiter === '*') {
    for (let i = start + 1; i < text.length; i++) {
      if (text[i] === '*' && text[i - 1] !== '*' && text[i + 1] !== '*') return i;
    }
    return -1;
  }
  let found = text.indexOf(delimiter, start + delimiter.length);
  if (delimiter === '**' && found !== -1 && text[found + 2] === '*') found += 1;
  return found;
}

function renderInline(text) {
  const source = String(text);
  let html = '';
  let i = 0;
  while (i < source.length) {
    if (source.slice(i, i + 2) === '**') {
      const close = findClosingDelimiter(source, i, '**');
      if (close !== -1) {
        html += '<b>' + renderInline(source.slice(i + 2, close)) + '</b>';
        i = close + 2;
        continue;
      }
    }
    if (source[i] === '*' && source[i + 1] !== '*') {
      const close = findClosingDelimiter(source, i, '*');
      if (close !== -1) {
        html += '<i>' + renderInline(source.slice(i + 1, close)) + '</i>';
        i = close + 1;
        continue;
      }
    }

    const paired = [
      { delimiter: '++', open: '<u>', close: '</u>' },
      { delimiter: '~~', open: '<s>', close: '</s>' },
    ];
    let renderedPair = false;
    for (let p = 0; p < paired.length; p++) {
      const token = paired[p];
      if (source.slice(i, i + 2) !== token.delimiter) continue;
      const close = findClosingDelimiter(source, i, token.delimiter);
      if (close === -1) continue;
      html += token.open + renderInline(source.slice(i + 2, close)) + token.close;
      i = close + 2;
      renderedPair = true;
      break;
    }
    if (renderedPair) continue;

    if (source[i] === '[') {
      const textEnd = source.indexOf(']', i + 1);
      if (textEnd !== -1 && source[textEnd + 1] === '{') {
        const attrEnd = source.indexOf('}', textEnd + 2);
        if (attrEnd !== -1) {
          const attrs = parseSpanAttributes(source.slice(textEnd + 2, attrEnd));
          const styles = [];
          if (attrs.color) styles.push('color: ' + attrs.color);
          if (attrs.size) styles.push('font-size: ' + attrs.size + 'px');
          html += '<span style="' + styles.join('; ') + '">' +
            renderInline(source.slice(i + 1, textEnd)) + '</span>';
          i = attrEnd + 1;
          continue;
        }
      }
    }

    html += escapeHtml(source[i]);
    i++;
  }
  return html;
}

function listSequenceToHtml(lines, start, level) {
  let html = '';
  let index = start;
  while (index < lines.length) {
    const item = parseListLine(lines[index]);
    if (!item || item.level !== level) break;
    const group = listGroupToHtml(lines, index, level, item.kind);
    html += group.html;
    index = group.index;
  }
  return { html: html, index: index };
}

function listGroupToHtml(lines, start, level, kind) {
  let html = '<' + kind + '>';
  let index = start;
  while (index < lines.length) {
    const item = parseListLine(lines[index]);
    if (!item || item.level !== level || item.kind !== kind) break;
    html += '<li>' + renderInline(item.text);
    index++;
    let sawNestedList = false;

    while (index < lines.length) {
      const nested = parseListLine(lines[index]);
      if (nested && nested.level === level + 1) {
        const sequence = listSequenceToHtml(lines, index, level + 1);
        html += sequence.html;
        index = sequence.index;
        sawNestedList = true;
        continue;
      }
      if (nested) break;

      const continuation = /^( +)(.*)$/.exec(lines[index]);
      if (continuation && continuation[1].length === (level + 1) * 2 && continuation[2]) {
        if (sawNestedList) {
          formatError(
            'List continuation',
            'place item continuation lines before a nested list'
          );
        }
        html += '<br>' + renderInline(continuation[2]);
        index++;
        continue;
      }
      break;
    }
    html += '</li>';
  }
  html += '</' + kind + '>';
  return { html: html, index: index };
}

function paragraphToHtml(line) {
  let content = line;
  let style = '';
  const align = /^\{align=(left|center|right|justify)\}/.exec(content);
  if (align) {
    style = ' style="text-align: ' + align[1] + '"';
    content = content.slice(align[0].length);
  }

  let tag = 'div';
  let heading = /^(#{1,3})\s+(.*)$/.exec(content);
  if (heading) {
    tag = 'h' + heading[1].length;
    content = heading[2];
  }
  const rendered = content.length ? renderInline(content) : '<br>';
  return '<' + tag + style + '>' + rendered + '</' + tag + '>';
}

function markdownToNotesHtml(text) {
  const source = String(text);
  validateNotesMarkdown(source);
  const lines = source.split('\n');
  let html = '';
  let i = 0;
  while (i < lines.length) {
    if (/^```/.test(lines[i])) {
      let close = i + 1;
      while (close < lines.length && !/^```\s*$/.test(lines[close])) close++;
      if (close < lines.length) {
        html += '<pre>' + escapeHtml(lines.slice(i + 1, close).join('\n')) + '</pre>';
        i = close + 1;
        continue;
      }
    }

    const list = parseListLine(lines[i]);
    if (list) {
      if (list.level !== 0) formatError('List nesting', 'a nested item needs a parent item');
      const sequence = listSequenceToHtml(lines, i, 0);
      html += sequence.html;
      i = sequence.index;
      continue;
    }

    html += paragraphToHtml(lines[i]);
    i++;
  }
  return html;
}

function firstVisibleLine(text) {
  const lines = String(text).split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!line) continue;
    line = line.replace(/^\{align=(?:left|center|right|justify)\}/, '');
    line = line.replace(/^#{1,3}\s+/, '');
    line = line.replace(/^(?:\* |\d+\. )/, '');
    line = line.replace(/\[([^\]]+)\]\{[^}]+\}/g, '$1');
    line = line.replace(/\*\*([^*]+)\*\*/g, '$1');
    line = line.replace(/\*([^*]+)\*/g, '$1');
    line = line.replace(/\+\+([^+]+)\+\+/g, '$1');
    line = line.replace(/~~([^~]+)~~/g, '$1');
    if (line) return line;
  }
  return '';
}

// Compatibility name used by earlier callers and tests.
function linesToBodyHtml(text) {
  return markdownToNotesHtml(text);
}

// One <div> per line: a bare "\n" is whitespace in HTML and would collapse the
// user's paragraphs into a single run-on line.
function toHtml(text) {
  if (text === null || text === undefined) return null;
  return String(text)
    .split('\n')
    .map((line) => '<div>' + (line.length ? escapeHtml(line) : '<br>') + '</div>')
    .join('');
}

// Text arriving here is the user's own note content, but it lands in a markup
// document: an unescaped "<" would silently swallow everything after it.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Duplicated verbatim from list_notes.js's toPlainText(). Notes/JXA scripts
// in this repo are self-contained files with no shared-module mechanism
// (research.md §3), so this is a deliberate copy, not drift: overwrite()'s
// hash gate must derive plaintext the same way a caller reading the note via
// `list_notes.js --plaintext` would, or the hash the caller computed would
// never match. Keep both copies identical -- see
// specs/005-notes-conditional-overwrite/research.md §3 "Mitigation" for the
// live check that guards against divergence.
function toPlainText(html) {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalize(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function readStdin() {
  const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function fail(message) {
  const text = $.NSString.alloc.initWithUTF8String('write_note: ' + message + '\n');
  $.NSFileHandle.fileHandleWithStandardError.writeData(
    text.dataUsingEncoding($.NSUTF8StringEncoding)
  );
  $.exit(1);
}

// `module` does not exist under `osascript -l JavaScript`, so this is a
// no-op there -- it exists only so tests/test_note_body_conversion.js can
// `require()` the pure functions above under plain Node, with no Notes.app
// and no Automation grant. See specs/006-notes-template-format-fix/research.md.
if (typeof module !== 'undefined') {
  module.exports = {
    dedupTitleLine,
    firstVisibleLine,
    linesToBodyHtml,
    markdownToNotesHtml,
    validateNotesMarkdown,
  };
}
