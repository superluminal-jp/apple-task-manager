#!/usr/bin/osascript -l JavaScript
//
// Ensure one direct child folder exists in the Notes default account.
//
//   osascript -l JavaScript ensure_folder.js --name "Scrum"
//
// Exact matching makes retries idempotent. Multiple exact matches fail before
// creation because a displayed name is not an identifier and choosing one
// would silently guess. This script creates at most one folder and exposes no
// move, rename, nested-folder, or deletion operation.

ObjC.import('stdlib');
ObjC.import('Foundation');

function run(argv) {
  const name = parseName(argv);
  const app = Application('Notes');

  try {
    const account = app.defaultAccount;
    const accountName = account.name(); // Force the default-account specifier.
    const folders = account.folders();
    const matches = folders.filter((folder) => folder.name() === name);

    if (matches.length > 1) {
      fail('folder name is ambiguous in the default account: ' + name);
    }
    if (matches.length === 1) {
      return JSON.stringify(describe(matches[0], accountName, false), null, 2);
    }

    const folder = app.Folder({ name: name });
    account.folders.push(folder);
    return JSON.stringify(describe(folder, accountName, true), null, 2);
  } catch (error) {
    return fail(error.message);
  }
}

function parseName(argv) {
  let rawName = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--name') {
      i += 1;
      if (i >= argv.length) fail('--name needs a value');
      rawName = argv[i];
    } else {
      fail('unknown option or positional argument: ' + arg);
    }
  }
  if (rawName === null) fail('--name is required');
  const name = String(rawName).trim();
  if (name.length === 0) fail('--name must be non-empty');
  return name;
}

function describe(folder, accountName, created) {
  return {
    id: folder.id(),
    name: folder.name(),
    account: accountName,
    created: created,
  };
}

function fail(message) {
  const text = $.NSString.alloc.initWithUTF8String('ensure_folder: ' + message + '\n');
  $.NSFileHandle.fileHandleWithStandardError.writeData(
    text.dataUsingEncoding($.NSUTF8StringEncoding)
  );
  $.exit(1);
}
