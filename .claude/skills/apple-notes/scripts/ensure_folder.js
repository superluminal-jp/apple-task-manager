#!/usr/bin/osascript -l JavaScript
//
// Ensure one direct child folder exists -- in the Notes default account, or,
// with --parent-id, inside another folder.
//
//   osascript -l JavaScript ensure_folder.js --name "Scrum"
//   osascript -l JavaScript ensure_folder.js --name "Sprint 7" --parent-id "<folder id>"
//
// Exact matching makes retries idempotent. Multiple exact matches fail before
// creation because a displayed name is not an identifier and choosing one
// would silently guess. --parent-id scopes both the match and the creation to
// that folder's direct children only -- a same-named folder anywhere else in
// the account (a different project, or the account root) neither matches nor
// blocks creation. This script creates at most one folder and exposes no
// move, rename, or deletion operation, with or without --parent-id.
//
// The Notes AppleScript dictionary documents `folder` as containing both
// `folders` and `notes` elements, so a folder can hold subfolders the same
// way the default account does; --parent-id targets that element instead of
// the account's.

ObjC.import('stdlib');
ObjC.import('Foundation');

function run(argv) {
  const opts = parseArgs(argv);
  const app = Application('Notes');

  try {
    if (opts.parentId) {
      return JSON.stringify(ensureInParent(app, opts), null, 2);
    }
    return JSON.stringify(ensureInAccount(app, opts), null, 2);
  } catch (error) {
    return fail(error.message);
  }
}

function ensureInAccount(app, opts) {
  const account = app.defaultAccount;
  const accountName = account.name(); // Force the default-account specifier.
  const matches = account.folders().filter((folder) => folder.name() === opts.name);

  if (matches.length > 1) {
    fail('folder name is ambiguous in the default account: ' + opts.name);
  }
  if (matches.length === 1) {
    return describe(matches[0], accountName, false);
  }

  const folder = app.Folder({ name: opts.name });
  account.folders.push(folder);
  return describe(folder, accountName, true);
}

function ensureInParent(app, opts) {
  let parent;
  try {
    parent = app.folders.byId(opts.parentId);
    parent.name(); // Force the specifier to resolve now, not later.
  } catch (error) {
    fail('no folder with id: ' + opts.parentId);
  }

  const matches = parent.folders().filter((folder) => folder.name() === opts.name);

  if (matches.length > 1) {
    fail('folder name is ambiguous under parent ' + opts.parentId + ': ' + opts.name);
  }
  if (matches.length === 1) {
    return describe(matches[0], null, false, opts.parentId);
  }

  const folder = app.Folder({ name: opts.name });
  parent.folders.push(folder);
  return describe(folder, null, true, opts.parentId);
}

function parseArgs(argv) {
  const opts = { name: null, parentId: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--name') {
      i += 1;
      if (i >= argv.length) fail('--name needs a value');
      opts.name = argv[i];
    } else if (arg === '--parent-id') {
      i += 1;
      if (i >= argv.length) fail('--parent-id needs a value');
      opts.parentId = argv[i];
    } else {
      fail('unknown option or positional argument: ' + arg);
    }
  }
  if (opts.name === null) fail('--name is required');
  const name = String(opts.name).trim();
  if (name.length === 0) fail('--name must be non-empty');
  opts.name = name;
  return opts;
}

function describe(folder, accountName, created, parentId) {
  const result = {
    id: folder.id(),
    name: folder.name(),
    created: created,
  };
  if (parentId) {
    result.parent = parentId;
  } else {
    result.account = accountName;
  }
  return result;
}

function fail(message) {
  const text = $.NSString.alloc.initWithUTF8String('ensure_folder: ' + message + '\n');
  $.NSFileHandle.fileHandleWithStandardError.writeData(
    text.dataUsingEncoding($.NSUTF8StringEncoding)
  );
  $.exit(1);
}
