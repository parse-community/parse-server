**Scope**
Build a first-class SQLite backend for Parse Server in this repo with full feature parity. No skipped tests, no exclusion list, no disabled features, no “MVP”, no no-ops.

**Required Repo Changes**
- Add a new adapter under `/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/src/Adapters/Storage/SQLite/`, with `SQLiteStorageAdapter.js` as the main entrypoint.
- Wire URI dispatch in [index.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/src/Controllers/index.js:215) so `sqlite:` and `file:` use the SQLite adapter.
- Add real test-harness support in [helper.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/spec/helper.js:67) and fix reconfiguration behavior in [helper.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/spec/helper.js:196) so SQLite tests recreate the adapter correctly.
- Remove or generalize Mongo/Postgres-only gating in [DatabaseController.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/src/Controllers/DatabaseController.js:2047) and [middlewares.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/src/middlewares.js:781).
- Add package dependency and scripts in [package.json](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/package.json), including a `test:sqlite:testonly` path.
- Update configuration docs/help text in [Definitions.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/src/Options/Definitions.js:179) if SQLite becomes supported.

**Adapter Contract**
- Implement the entire storage interface in [StorageAdapter.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/src/Adapters/Storage/StorageAdapter.js:37), including `distinct`, `aggregate`, `watch`, and transactions through [StorageAdapter.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/src/Adapters/Storage/StorageAdapter.js:146).
- Base the implementation on the Postgres adapter structure, not the Mongo adapter.
- Reuse the SQL-compilation approach from [PostgresStorageAdapter.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/src/Adapters/Storage/Postgres/PostgresStorageAdapter.js:297), [PostgresStorageAdapter.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/src/Adapters/Storage/Postgres/PostgresStorageAdapter.js:2204), [PostgresStorageAdapter.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/src/Adapters/Storage/Postgres/PostgresStorageAdapter.js:2268), and [PostgresStorageAdapter.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/src/Adapters/Storage/Postgres/PostgresStorageAdapter.js:2599).

**Feature Requirements**
- Full CRUD, schema creation, field add/delete/update, class deletion, `_SCHEMA` persistence, CLPs, indexes, uniqueness, authData uniqueness, and relation tables.
- Full query semantics for generic Parse behavior, including nested dot-path fields, array operators, regex, pointer fields, null/exists, pagination, sorting, projections, count, distinct, and aggregate.
- Full update semantics, including nested object mutation, increment, array add/remove/addUnique, upsert, and duplicate detection with correct `Parse.Error` mapping.
- Full geospatial semantics. If the implementation uses `lat/lng`, R*Tree, or another storage shape, that is fine only if `$nearSphere`, `$maxDistance`, `$within.$box`, `$geoWithin.$centerSphere`, `$geoWithin.$polygon`, `$geoIntersects`, and distance sorting all behave identically to Parse expectations.
- Real transaction support for request/batch flows, not simulated best-effort behavior.
- Real `watch()` / schema-hook behavior for `enableSchemaHooks`; no no-op. Match the intent of [SchemaController.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/src/Controllers/SchemaController.js:733) and the existing Postgres notification path in [PostgresStorageAdapter.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/src/Adapters/Storage/Postgres/PostgresStorageAdapter.js:946).
- Idempotency support, including expiry cleanup behavior equivalent to current SQL-backed support.

**Security Requirements**
- Do not interpolate unvalidated field names or JSON path segments into SQL.
- Mirror the Postgres hardening level for sort, distinct, aggregate, and nested JSON updates.
- Add SQLite coverage for the SQL-injection classes currently asserted for Postgres in [vulnerabilities.spec.js](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/spec/vulnerabilities.spec.js:1185).

**Testing Requirements**
- No `spec/testExclusionList.json`.
- No hiding behind `it_only_db`, `describe_only_db`, or `it_exclude_dbs` gaps. If a Postgres-only or Mongo-only spec covers behavior SQLite also claims to support, broaden that spec or add a SQLite equivalent.
- SQLite must run the normal suite as a real backend option, not only adapter-unit tests.
- Add SQLite-specific tests where coverage is currently missing, especially for security, geo, idempotency, and schema hooks.

**Acceptance Criteria**
- `npm run build`
- `npm run lint`
- `PARSE_SERVER_TEST_DB=sqlite PARSE_SERVER_TEST_DATABASE_URI=<sqlite target> npm run testonly`
- Zero failures attributable to SQLite.
- Zero skipped or excluded tests attributable to SQLite.
- Mongo and Postgres still pass unchanged.

**Implementation Constraint**
- Use a cross-version Node driver compatible with this repo’s supported engines in [package.json](/Users/swittkongdachalert/Documents/Projects/Libraries/parse-server/package.json:142). `better-sqlite3` is the obvious choice for the attempt.
