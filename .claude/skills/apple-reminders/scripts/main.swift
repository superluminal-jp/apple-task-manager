// remind-cli — read and write Apple Reminders through EventKit.
//
// EventKit is Apple's official framework for Reminders, and the only route
// that exposes reminders as typed, queryable objects rather than Apple Event
// records that have to be parsed back out of osascript's output. That matters
// here because this data feeds flow metrics: a predicate-based fetch over a
// list is one call, and every field arrives with a type instead of a string.
//
// Notes has no equivalent framework, so it stays on AppleScript (see the
// apple-notes skill). Using the best route for each app is deliberate — the
// two apps genuinely differ, and pretending otherwise costs one of them.
//
// Build (see build.sh — the Info.plist section is not optional):
//   swiftc main.swift -o remind-cli \
//     -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker Info.plist
//
// Commands:
//   remind-cli lists
//   remind-cli ensure-list --name "Product Backlog"
//   remind-cli list "Sprint Backlog" [--open-only]
//   remind-cli get <identifier>
//   remind-cli create --list "Sprint Backlog" --name "..." [--body ...] [--due ISO8601]
//   remind-cli update <identifier> [--name ...] [--body ...|--body-stdin] [--due ISO8601]
//   remind-cli complete <identifier> [--undo]
//
// There is deliberately no delete command. Removing a reminder destroys the
// only record of its Cycle Time, and no guardrail hook can recognise a
// destructive EventKit call. Deletion stays a human action in Reminders.app.
//
// Output is JSON on stdout. Errors go to stderr with a non-zero exit, so
// "permission denied" and "empty list" are never confused: the latter is [].

import EventKit
import Foundation

// MARK: - Output shape
//
// Field names are the pipeline's, not EventKit's: `body` is EKReminder.notes,
// so scrum_block.py and its unit tests are unaffected by the move off
// AppleScript. Both identifiers are emitted -- see `preferredIdentifier`.

struct ReminderJSON: Encodable {
    let id: String
    let externalId: String?
    let name: String
    let body: String?
    let completed: Bool
    let completionDate: String?
    let creationDate: String?
    let modificationDate: String?
    let dueDate: String?
    let priority: Int
    let list: String
    let hasRecurrenceRules: Bool
}

struct ReminderListJSON: Encodable {
    let id: String
    let name: String
    let source: String
    let created: Bool
}

// MARK: - Store access

/// EventKit's permission lives under the *Reminders* privacy category, not
/// Automation — a different grant from the one the apple-notes skill needs.
/// macOS 14 split it into full and write-only access; this tool reads, so it
/// must ask for full access and must not silently accept write-only.
func authorizedStore() -> EKEventStore {
    let store = EKEventStore()
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false
    var failure: Error?

    if #available(macOS 14.0, *) {
        store.requestFullAccessToReminders { ok, error in
            granted = ok
            failure = error
            semaphore.signal()
        }
    } else {
        store.requestAccess(to: .reminder) { ok, error in
            granted = ok
            failure = error
            semaphore.signal()
        }
    }
    semaphore.wait()

    guard granted else {
        // The dialog cannot appear at all unless the binary carries an
        // __info_plist section with NSRemindersFullAccessUsageDescription, so
        // a denial here is as often a build problem as a user decision.
        fail("""
            reminders access not granted\(failure.map { ": \($0.localizedDescription)" } ?? "").
            Grant it in System Settings > Privacy & Security > Reminders, and \
            confirm the binary was built with the Info.plist section (see build.sh).
            """)
    }
    return store
}

/// Fetching is asynchronous in EventKit; every command needs the result before
/// it can print, so each fetch is bridged back to synchronous here.
func fetchReminders(_ store: EKEventStore, in calendars: [EKCalendar]?) -> [EKReminder] {
    let predicate = store.predicateForReminders(in: calendars)
    let semaphore = DispatchSemaphore(value: 0)
    var result: [EKReminder] = []
    store.fetchReminders(matching: predicate) { reminders in
        result = reminders ?? []
        semaphore.signal()
    }
    semaphore.wait()
    return result
}

func calendar(named name: String, in store: EKEventStore) -> EKCalendar {
    let calendars = store.calendars(for: .reminder)
    guard let match = calendars.first(where: { $0.title == name }) else {
        let available = calendars.map(\.title).sorted().joined(separator: ", ")
        fail("no such list: \(name). Available: \(available)")
    }
    return match
}

/// Resolve by either identifier this tool emits.
///
/// `calendarItemExternalIdentifier` is the server-provided (CalDAV) id and is
/// the one stored in cross-app link markers, because it survives the local
/// `calendarItemIdentifier` changing when an item moves between accounts. It
/// is not guaranteed unique — Apple documents that a recurring item can share
/// one — so a lookup that yields several is reported rather than guessed at.
func reminder(withIdentifier id: String, in store: EKEventStore) -> EKReminder {
    if let item = store.calendarItem(withIdentifier: id) as? EKReminder {
        return item
    }
    let matches = fetchReminders(store, in: nil)
        .filter { $0.calendarItemExternalIdentifier == id }
    switch matches.count {
    case 0: fail("no reminder with identifier: \(id)")
    case 1: return matches[0]
    default:
        fail("identifier \(id) matches \(matches.count) reminders; use the local id instead")
    }
}

// MARK: - Encoding

let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
}()

func iso(_ date: Date?) -> String? {
    date.map { isoFormatter.string(from: $0) }
}

/// EventKit models a due date as DateComponents, not a Date, because a
/// reminder can be due on a day with no time. Collapsing it to a Date here
/// would invent a time the user never set; the calendar conversion keeps the
/// components' own meaning.
func iso(_ components: DateComponents?) -> String? {
    guard let components, let date = Calendar.current.date(from: components) else { return nil }
    return isoFormatter.string(from: date)
}

func encode(_ reminder: EKReminder) -> ReminderJSON {
    ReminderJSON(
        id: reminder.calendarItemIdentifier,
        externalId: reminder.calendarItemExternalIdentifier,
        name: reminder.title ?? "",
        body: reminder.notes,
        completed: reminder.isCompleted,
        completionDate: iso(reminder.completionDate),
        creationDate: iso(reminder.creationDate),
        modificationDate: iso(reminder.lastModifiedDate),
        dueDate: iso(reminder.dueDateComponents),
        priority: reminder.priority,
        list: reminder.calendar?.title ?? "",
        hasRecurrenceRules: reminder.hasRecurrenceRules
    )
}

func emit<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    guard let data = try? encoder.encode(value),
          let text = String(data: data, encoding: .utf8) else {
        fail("could not encode output as JSON")
    }
    print(text)
}

// MARK: - Argument handling

struct Args {
    private var flags: [String: String] = [:]
    private(set) var positional: [String] = []

    init(_ argv: [String]) {
        var index = 0
        while index < argv.count {
            let arg = argv[index]
            if arg.hasPrefix("--") {
                let key = String(arg.dropFirst(2))
                // Valueless flags must not swallow the next argument.
                if key == "open-only" || key == "undo" || key == "body-stdin" {
                    flags[key] = "true"
                } else {
                    index += 1
                    guard index < argv.count else { fail("--\(key) needs a value") }
                    flags[key] = argv[index]
                }
            } else {
                positional.append(arg)
            }
            index += 1
        }
    }

    func string(_ key: String) -> String? { flags[key] }
    func bool(_ key: String) -> Bool { flags[key] == "true" }
    func require(_ key: String) -> String {
        guard let value = flags[key] else { fail("--\(key) is required") }
        return value
    }

    func rejectUnknownFlags(allowed: Set<String>) {
        let unknown = Set(flags.keys).subtracting(allowed)
        guard unknown.isEmpty else {
            fail("unknown option: --\(unknown.sorted()[0])")
        }
    }
}

/// ISO 8601 in, so a caller never has to guess this machine's locale format.
func parseDate(_ text: String, flag: String) -> Date {
    if let date = isoFormatter.date(from: text) { return date }
    let dayOnly = DateFormatter()
    dayOnly.dateFormat = "yyyy-MM-dd"
    dayOnly.timeZone = TimeZone.current
    if let date = dayOnly.date(from: text) { return date }
    fail("\(flag) is not an ISO 8601 date: \(text)")
}

func readStdin() -> String {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    return String(data: data, encoding: .utf8) ?? ""
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("remind-cli: \(message)\n".utf8))
    exit(1)
}

func save(_ reminder: EKReminder, in store: EKEventStore) {
    do {
        try store.save(reminder, commit: true)
    } catch {
        fail("could not save: \(error.localizedDescription)")
    }
}

// MARK: - Commands

let argv = Array(CommandLine.arguments.dropFirst())
guard let command = argv.first else {
    fail("usage: remind-cli <lists|ensure-list|list|get|create|update|complete> [...]")
}
let args = Args(Array(argv.dropFirst()))

switch command {
case "lists":
    let store = authorizedStore()
    emit(store.calendars(for: .reminder).map(\.title).sorted())

case "ensure-list":
    args.rejectUnknownFlags(allowed: ["name"])
    guard args.positional.isEmpty else {
        fail("usage: remind-cli ensure-list --name <list name>")
    }
    let name = args.require("name").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { fail("--name must be non-empty") }

    let store = authorizedStore()
    let matches = store.calendars(for: .reminder).filter { $0.title == name }
    switch matches.count {
    case 1:
        let calendar = matches[0]
        emit(ReminderListJSON(
            id: calendar.calendarIdentifier,
            name: calendar.title,
            source: calendar.source?.title ?? "",
            created: false
        ))
    case 2...:
        fail("list name is ambiguous: \(name) matches \(matches.count) lists")
    default:
        guard let source = store.defaultCalendarForNewReminders()?.source else {
            fail("no default Reminders list/source is configured")
        }
        let calendar = EKCalendar(for: .reminder, eventStore: store)
        calendar.title = name
        calendar.source = source
        do {
            try store.saveCalendar(calendar, commit: true)
        } catch {
            fail("could not save list: \(error.localizedDescription)")
        }
        emit(ReminderListJSON(
            id: calendar.calendarIdentifier,
            name: calendar.title,
            source: source.title,
            created: true
        ))
    }

case "list":
    guard let name = args.positional.first else { fail("usage: remind-cli list <list name>") }
    let store = authorizedStore()
    let target = calendar(named: name, in: store)
    var reminders = fetchReminders(store, in: [target])
    if args.bool("open-only") {
        reminders = reminders.filter { !$0.isCompleted }
    }
    emit(reminders.map(encode))

case "get":
    guard let id = args.positional.first else { fail("usage: remind-cli get <identifier>") }
    let store = authorizedStore()
    emit(encode(reminder(withIdentifier: id, in: store)))

case "create":
    let store = authorizedStore()
    let reminder = EKReminder(eventStore: store)
    reminder.calendar = calendar(named: args.require("list"), in: store)
    reminder.title = args.require("name")
    if args.bool("body-stdin") {
        reminder.notes = readStdin()
    } else if let body = args.string("body") {
        reminder.notes = body
    }
    if let due = args.string("due") {
        reminder.dueDateComponents = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute], from: parseDate(due, flag: "--due")
        )
    }
    if let priority = args.string("priority") { reminder.priority = Int(priority) ?? 0 }
    save(reminder, in: store)
    emit(encode(reminder))

case "update":
    // An identifier is required and never falls back to creating: a typo must
    // not silently fork the backlog into a duplicate item.
    guard let id = args.positional.first else { fail("usage: remind-cli update <identifier> [...]") }
    let store = authorizedStore()
    let target = reminder(withIdentifier: id, in: store)
    if let name = args.string("name") { target.title = name }
    if args.bool("body-stdin") {
        target.notes = readStdin()
    } else if let body = args.string("body") {
        target.notes = body
    }
    if let due = args.string("due") {
        target.dueDateComponents = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute], from: parseDate(due, flag: "--due")
        )
    }
    if let priority = args.string("priority") { target.priority = Int(priority) ?? 0 }
    save(target, in: store)
    emit(encode(target))

case "complete":
    guard let id = args.positional.first else { fail("usage: remind-cli complete <identifier>") }
    let store = authorizedStore()
    let target = reminder(withIdentifier: id, in: store)
    // `completionDate` is set by EventKit when isCompleted flips, so the
    // timestamp comes from the framework rather than this process's clock.
    target.isCompleted = !args.bool("undo")
    save(target, in: store)
    emit(encode(target))

default:
    fail("unknown command: \(command)")
}
