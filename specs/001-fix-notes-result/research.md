# Research: Reliable Apple Notes Results

## Decision 1: Treat the containing-object property as unavailable

**Decision**: Do not call a note's containing-object property when formatting a
result.

**Rationale**: A live probe against the uniquely identified test note showed that
`name`, `id`, `creationDate`, and `modificationDate` all resolve, while the containing
object fails independently with `Can't convert types.` and its name fails with
`Can't get object.`. The create and append operations had already succeeded before
result formatting reached this property.

**Alternatives considered**:

- Keep the direct property and retry: rejected because the failure is deterministic,
  and retrying a completed append can duplicate user content.
- Omit the folder field: rejected because it changes the documented result contract.
- Report the completed write as failed: rejected because it misrepresents external
  state and encourages destructive retries.

## Decision 2: Resolve folder membership using note identifiers

**Decision**: For identifier-based operations, compare the target note ID against
each folder's note ID collection and return the matching folder's displayed name.
For creation, use the destination folder already selected by the command.

**Rationale**: A live macOS probe resolved the test note to exactly one folder by
reading folder identifiers, names, and note ID collections only. It did not read or
emit unrelated titles or bodies. Membership is based on the opaque note identifier,
so duplicate displayed folder names do not cause guessing.

**Alternatives considered**:

- Require a folder argument for ID operations: rejected because it breaks the CLI
  and cross-application link contract.
- List full notes and filter in the caller: rejected because it exposes unrelated
  metadata, increases output, and duplicates logic outside the skill.
- Use an undocumented URL or private Notes database: rejected by the constitution
  and the existing architecture decision.

## Decision 3: Add a deterministic structural regression plus live validation

**Decision**: Extend the existing Apple operator contract suite so it fails whenever
the unsupported containing-object access returns. Then run the current full suite and
a minimal live create/append/read scenario.

**Rationale**: Notes.app cannot run in Linux CI, while the known regression is a
specific unsupported property access that can be guarded deterministically. The live
scenario proves the native Apple Events behavior that a structural test cannot.

**Alternatives considered**:

- Add a third-party JavaScript runtime or Notes mock framework: rejected because the
  project forbids new dependencies and a mock would not reproduce this JXA behavior.
- Rely only on live manual testing: rejected because the same source regression could
  return without a deterministic repository gate.
