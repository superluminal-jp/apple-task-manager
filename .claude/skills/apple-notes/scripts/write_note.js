#!/usr/bin/osascript -l JavaScript
//
// Create a note, or append to one. Prints the resulting note as JSON.
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
// Four rules this script enforces structurally rather than by convention:
//
//   1. **No delete, and no whole-body replace.** A note is narrative the user
//      wrote; the failure mode of a bad overwrite is losing prose with no undo
//      outside Notes.app itself. Append is additive and safe to retry.
//   2. **--id means append or --replace-block, never create.** An unresolvable
//      id fails rather than creating a stray note somewhere the user will not
//      look for it.
//   3. **--folder matches ambiguously fail rather than picking one.** Once
//      subfolders exist (multi-project Sprint subfolders in particular,
//      apple-notes's `ensure_folder.js --parent-id`), two folders can share a
//      display name across different parents. `--folder <name>` searches the
//      whole account and refuses on more than one match; `--folder-id <id>`
//      is unambiguous by construction and is the only safe choice once a
//      collision is possible.
//   4. **--replace-block only ever touches its own fenced region.** It finds
//      `--- <name> ---` … `---` in the raw HTML body and replaces exactly
//      that span -- prose outside any fence is never read as replaceable, so
//      this cannot become a general whole-body replace by a different name.
//      It creates the block (appends it) if absent, the same posture
//      `scrum_block.py`'s `render_block` already takes on the Reminders side,
//      and it refuses -- rather than guessing -- when the fence is
//      unterminated or the block name matches more than once.
//
// A note body is HTML. Plain text passed to --text, --append-stdin, or
// --replace-stdin is escaped and wrapped in a <div> per line, because raw
// newlines do not render.

ObjC.import('stdlib');
ObjC.import('Foundation');

function run(argv) {
  const opts = parseArgs(argv);
  const app = Application('Notes');

  try {
    const result = opts.blockName ? replaceBlock(app, opts) : opts.id ? append(app, opts) : create(app, opts);
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
    appendHtml: null,
    blockName: null,
    replaceHtml: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--id') opts.id = argv[++i];
    else if (arg === '--folder') opts.folder = argv[++i];
    else if (arg === '--folder-id') opts.folderId = argv[++i];
    else if (arg === '--title') opts.title = argv[++i];
    else if (arg === '--text') opts.html = toHtml(argv[++i]);
    else if (arg === '--text-stdin') opts.html = toHtml(readStdin());
    else if (arg === '--html') opts.html = argv[++i];
    else if (arg === '--append') opts.appendHtml = toHtml(argv[++i]);
    else if (arg === '--append-stdin') opts.appendHtml = toHtml(readStdin());
    else if (arg === '--append-html') opts.appendHtml = argv[++i];
    else if (arg === '--replace-block') opts.blockName = argv[++i];
    else if (arg === '--replace') opts.replaceHtml = toHtml(argv[++i]);
    else if (arg === '--replace-stdin') opts.replaceHtml = toHtml(readStdin());
    else if (arg === '--replace-html') opts.replaceHtml = argv[++i];
    else fail('unknown option: ' + arg);
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

  if (opts.id && opts.appendHtml === null) fail('--id needs one of --append / --append-stdin / --append-html / --replace-block');
  if (opts.folder && opts.folderId) fail('use --folder or --folder-id, not both');
  if (!opts.id && !opts.folder && !opts.folderId) fail('--folder or --folder-id is required when creating (--id appends)');
  if (!opts.id && !opts.title) fail('--title is required when creating');
  return opts;
}

function create(app, opts) {
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
  // title is prepended as an <h1> rather than only set as the `name` property.
  const body = '<h1>' + escapeHtml(opts.title) + '</h1>' + (opts.html || '');
  const note = app.Note({ name: opts.title, body: body });
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
    .replace(/"/g, '&quot;');
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
