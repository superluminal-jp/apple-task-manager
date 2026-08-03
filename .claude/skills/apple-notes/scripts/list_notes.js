#!/usr/bin/osascript -l JavaScript
//
// Read notes out of Notes.app as JSON, one object per note.
//
//   osascript -l JavaScript list_notes.js "Scrum"
//   osascript -l JavaScript list_notes.js "Scrum" --with-body
//   osascript -l JavaScript list_notes.js --id "x-coredata://ABC/ICNote/p42" --with-body
//   osascript -l JavaScript list_notes.js --id "<id>" --field body
//   osascript -l JavaScript list_notes.js --folders
//
// Bodies are omitted unless asked for. A note body is full HTML, and a folder
// of retrospectives dumped in one call is a wall of markup nobody reads --
// list first, fetch the one body that matters second.
//
// Notes has no EventKit-equivalent framework: AppleScript (here, via JXA for
// JSON output) is the only supported programmatic route, and it is macOS-only.
// There is no iOS path at all.

ObjC.import('stdlib');
ObjC.import('Foundation');

function run(argv) {
  const opts = parseArgs(argv);
  const app = Application('Notes');

  try {
    if (opts.folders) {
      return JSON.stringify(app.folders.name(), null, 2);
    }

    const items = opts.id ? [byId(app, opts)] : fromFolder(app, opts);

    if (opts.field) {
      return items.map((item) => (item[opts.field] == null ? '' : String(item[opts.field]))).join('\n');
    }
    return JSON.stringify(items, null, 2);
  } catch (error) {
    return fail(error.message);
  }
}

function parseArgs(argv) {
  const opts = { folder: null, id: null, field: null, withBody: false, plaintext: false, folders: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--id') opts.id = argv[++i];
    else if (arg === '--field') { opts.field = argv[++i]; opts.withBody = true; }
    else if (arg === '--with-body') opts.withBody = true;
    else if (arg === '--plaintext') { opts.plaintext = true; opts.withBody = true; }
    else if (arg === '--folders') opts.folders = true;
    else if (arg.indexOf('--') === 0) fail('unknown option: ' + arg);
    else opts.folder = arg;
  }
  if (!opts.folders && !opts.id && !opts.folder) {
    fail('usage: list_notes.js <folder name> | --id <note id> | --folders');
  }
  return opts;
}

// Bulk property reads: one Apple Event per property for the whole folder.
function fromFolder(app, opts) {
  const folders = app.folders.whose({ name: opts.folder });
  if (folders.length === 0) fail('no such folder: ' + opts.folder);

  const notes = folders[0].notes;
  const columns = {
    id: notes.id(),
    name: notes.name(),
    creationDate: notes.creationDate(),
    modificationDate: notes.modificationDate(),
  };
  if (opts.withBody) columns.body = notes.body();

  const items = [];
  for (let i = 0; i < columns.id.length; i++) {
    const item = { folder: opts.folder };
    Object.keys(columns).forEach((key) => {
      item[key] = normalize(columns[key][i]);
    });
    if (opts.plaintext) item.plaintext = toPlainText(item.body);
    items.push(item);
  }
  return items;
}

// The link resolver: an id is what a reminder's `note:` key stores, so
// "open the note this item points at" bottoms out here.
function byId(app, opts) {
  let note;
  try {
    note = app.notes.byId(opts.id);
    note.name(); // Force the specifier to resolve now, not later.
  } catch (error) {
    fail('no note with id: ' + opts.id);
  }

  const item = {
    id: normalize(note.id()),
    name: normalize(note.name()),
    creationDate: normalize(note.creationDate()),
    modificationDate: normalize(note.modificationDate()),
    folder: normalize(note.container.name()),
  };
  if (opts.withBody) item.body = normalize(note.body());
  if (opts.plaintext) item.plaintext = toPlainText(item.body);
  return item;
}

// The dictionary's own `plaintext` property is not consistently documented
// across macOS versions, so this strips the markup here instead of depending
// on it. Good enough to read; never round-trip it back into a body.
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

function fail(message) {
  const text = $.NSString.alloc.initWithUTF8String('list_notes: ' + message + '\n');
  $.NSFileHandle.fileHandleWithStandardError.writeData(
    text.dataUsingEncoding($.NSUTF8StringEncoding)
  );
  $.exit(1);
}
