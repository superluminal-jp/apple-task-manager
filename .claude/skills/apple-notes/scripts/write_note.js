#!/usr/bin/osascript -l JavaScript
//
// Create a note, or append to one. Prints the resulting note as JSON.
//
//   # create -- the first line becomes the title Notes.app displays
//   osascript -l JavaScript write_note.js --folder "Scrum" \
//     --title "Sprint 7 Goal" --text "Cut checkout drop-off on mobile."
//
//   # append (body from stdin, so it can span lines)
//   echo "Retro action: shrink the WIP limit to 2" \
//     | osascript -l JavaScript write_note.js --id "<id>" --append-stdin
//
//   # append raw HTML when structure matters (a list, a table)
//   osascript -l JavaScript write_note.js --id "<id>" --append-html "<ul><li>a</li></ul>"
//
// Two rules this script enforces structurally rather than by convention:
//
//   1. **No delete, and no whole-body replace.** A note is narrative the user
//      wrote; the failure mode of a bad overwrite is losing prose with no undo
//      outside Notes.app itself. Append is additive and safe to retry.
//   2. **--id means append, never create.** An unresolvable id fails rather
//      than creating a stray note somewhere the user will not look for it.
//
// A note body is HTML. Plain text passed to --text or --append-stdin is escaped
// and wrapped in a <div> per line, because raw newlines do not render.

ObjC.import('stdlib');
ObjC.import('Foundation');

function run(argv) {
  const opts = parseArgs(argv);
  const app = Application('Notes');

  try {
    const result = opts.id ? append(app, opts) : create(app, opts);
    return JSON.stringify(result, null, 2);
  } catch (error) {
    return fail(error.message);
  }
}

function parseArgs(argv) {
  const opts = { id: null, folder: null, title: null, html: null, appendHtml: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--id') opts.id = argv[++i];
    else if (arg === '--folder') opts.folder = argv[++i];
    else if (arg === '--title') opts.title = argv[++i];
    else if (arg === '--text') opts.html = toHtml(argv[++i]);
    else if (arg === '--text-stdin') opts.html = toHtml(readStdin());
    else if (arg === '--html') opts.html = argv[++i];
    else if (arg === '--append') opts.appendHtml = toHtml(argv[++i]);
    else if (arg === '--append-stdin') opts.appendHtml = toHtml(readStdin());
    else if (arg === '--append-html') opts.appendHtml = argv[++i];
    else fail('unknown option: ' + arg);
  }
  if (opts.id && opts.appendHtml === null) fail('--id needs one of --append / --append-stdin / --append-html');
  if (!opts.id && !opts.folder) fail('--folder is required when creating (--id appends)');
  if (!opts.id && !opts.title) fail('--title is required when creating');
  return opts;
}

function create(app, opts) {
  const folders = app.folders.whose({ name: opts.folder });
  if (folders.length === 0) fail('no such folder: ' + opts.folder);

  // Notes derives the displayed title from the first line of the body, so the
  // title is prepended as an <h1> rather than only set as the `name` property.
  const body = '<h1>' + escapeHtml(opts.title) + '</h1>' + (opts.html || '');
  const note = app.Note({ name: opts.title, body: body });
  folders[0].notes.push(note);
  return describe(note, opts.folder);
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
