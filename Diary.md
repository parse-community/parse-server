## 2026-07-06

### Constraints
- Only touch the SQLite adapter boundary and adapter-focused tests.
- Do not modify Parse Server core or unrelated code to accommodate SQLite.
- Use nvm Node at `~/.nvm/versions/node/v22.22.0/bin/node` and matching `npm`.

### Files Intentionally Modified
- `src/Adapters/Storage/SQLite/SQLiteStorageAdapter.js`
- `spec/SQLiteStorageAdapter.spec.js`
- `Diary.md`

### What Is Already Fixed
- Shared `sqlite://:memory:` behavior across adapter instances uses a shared temp DB path instead of isolated connections.
- Pointer/scalar and nested-array query handling was already improved in the adapter.
- Polygon behavior was normalized in the adapter:
  - normalize polygon coordinates on write/read
  - support `$geoIntersects: { $point: ... }` against polygon fields
  - reject degenerate polygons
- Pointer-array matching now ignores junk array elements instead of blowing up on JSON extraction.
- SQLite `$text` now uses FTS5, not JS-side filtering:
  - validates `$text` / `$search` option types
  - uses lazily-created FTS5 virtual tables and triggers per class/field
  - supports default folded search and diacritic-sensitive search
  - supports `$score` projection and score sorting
- `distinct()` now does more work in SQL:
  - plain scalar distinct
  - nested dot-path distinct
  - array flattening via `json_each()`
  - pointer result shaping
- `aggregate()` was replaced with a stage-based SQL pipeline builder instead of the old stub:
  - `$match`
  - `$project`
  - `$addFields`
  - `$group`
  - `$sort`
  - `$skip`
  - `$limit`
  - `$count`
  - `$lookup`
  - `$unwind`
  - expression support for `$expr`, `$multiply`, `$substr`, date-part extraction, and the `$$NOW`/`$dateSubtract` case used in spec

### Specs Already Verified Green
- `spec/SQLiteStorageAdapter.spec.js`
- `spec/ParsePolygon.spec.js`
- `spec/PointerPermissions.spec.js --filter="should work with arrays containing valid & invalid elements"`
- `spec/ParseUser.spec.js --filter="rejects creating a session for another user if the user does not exist"`
- `spec/vulnerabilities.spec.js --filter="rejects non-master key querying internal field _email_verify_token"`
- `spec/ParseQuery.FullTextSearch.spec.js` under SQLite
- `spec/ParseQuery.Aggregate.spec.js --filter='readOnlyMasterKey'`
- `spec/ParseQuery.Aggregate.spec.js --filter='aggregate allow multiple of same stage'`
- `spec/ParseQuery.Aggregate.spec.js --filter='should only query aggregate with master key'`
- exact aggregate filters already rechecked under SQLite:
  - `groups objects by field`
  - `projects objects`
  - `rawFieldNames: true does not rewrite Parse-style names`
  - `matches expression with $dateSubtract from $$NOW`
  - `groups and multiplies`
  - `projects pointer query`
- exact distinct filters already rechecked under SQLite:
  - `distinct createdAt`
  - `distinct updatedAt`
  - `distinct pointer`

### Remaining Failure Clusters

#### Aggregate
- File: `spec/ParseQuery.Aggregate.spec.js`
- Broad aggregate coverage is now functionally in place; exact failing semantic cases from earlier are green in isolation.
- The remaining problem is intermittent full-suite harness instability in randomized aggregate runs:
  - failures move between tests such as `should only query aggregate with master key`, `aggregate allow multiple of same stage`, or the read-only-master-key block
  - isolated runs of those same specs pass
  - the failure mode is usually `fetch failed` and sometimes `Error while closing parse server ... ERR_SERVER_NOT_RUNNING`
- This now looks more like server lifecycle / restart-order flake than a deterministic SQLite aggregate semantics bug.
- Important note: earlier noisy failures were worsened by overlapping jasmine runs on the same Parse test port; serial runs only should be used for server-backed spec files.

### Best Path Forward
- Keep Parse Server core untouched.
- Keep pushing work into SQLite SQL features instead of JS post-processing where practical.
- Use serial runs only for server-backed spec files.
- Treat the remaining aggregate failures as lifecycle/restart debugging unless a spec can be made to fail in isolation.
- If a serial full-suite aggregate run still fails, capture the failing seed and the immediately preceding spec order before changing adapter code again.
