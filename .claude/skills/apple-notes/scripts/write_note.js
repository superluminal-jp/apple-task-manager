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
    appendHtml: null,
    blockName: null,
    replaceHtml: null,
    overwrite: false,
    overwriteText: null,
    overwriteHtml: null,
    delete: false,
    expectHash: null,
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
    else if (arg === '--overwrite-stdin') {
      opts.overwrite = true;
      opts.overwriteText = readStdin();
      opts.overwriteHtml = toHtml(opts.overwriteText);
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

// Replaces the whole body, but only if the note's current body still hashes
// to opts.expectHash (see "Conditional overwrite and delete" in the header
// comment). Sets both `name` and the body's displayed title to the new first
// line, mirroring create()'s reasoning: the display title is derived from
// the body's first line, and `name` should not be left pointing at stale text.
function overwrite(app, opts) {
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

  note.name = (opts.overwriteText || '').split('\n')[0];
  note.body = opts.overwriteHtml || '';
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
