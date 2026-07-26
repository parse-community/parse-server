# Parse Server gotchas

Append-only list of recurring, actionable lessons - things that prevent getting stuck next time. Add terse dot points, not debugging narratives. One line each: the trap → what to do.

## Build & test harness
- **Green specs are NOT "tested". KEY GOTCHA:** passing jasmine specs (even both backends + guard-proof) is necessary but NOT sufficient - you must ALSO boot a live server, reproduce the actual issue over the real REST API, and inspect the DB before claiming a fix works or opening a PR. Do the live end-to-end BEFORE the PR, not after. A spec exercising the code path is not the same as reproducing the user's reported symptom on a running server.
- Specs `require('../lib/...')`, never `src/`. After any `src/` edit, `npm run build` (or leave `npm run watch` running) or the suite tests stale code. A green run on unbuilt `lib/` means nothing - `grep lib/` to confirm your change is in.
- The jasmine suite is `random: true`. Running many spec files together causes state-coupling flakiness (phantom failures that don't reproduce alone). Run the affected file(s) in isolation; if a combined run fails, re-run the single file before believing it.
- Before blaming a failure on your diff, reproduce it on clean `upstream/alpha` (git worktree). Some specs fail pre-existingly - e.g. `vulnerabilities.spec.js` "Request denylist … polluted data" (`TypeError: message.split is not a function`).
- Worktrees SHARE one stash stack. To revert a change for a guard-proof, use `git checkout <baseref> -- <files>` (then `git checkout HEAD -- <files>` to restore) - NOT `git stash`. Danger: if your changes are already committed, `git stash push <paths>` saves nothing ("No local changes to save"), and a following `git stash pop` silently pops an UNRELATED pre-existing stash (another worktree's WIP) into your tree. If it happens: `git stash push -u -m "restored: <what>"` to put it back on the stack, working tree clean, your commit is unaffected.
- `npm test` spins an ephemeral mongod (mongodb-runner); `npm run testonly` uses an already-running mongod on :27017. Pick the right one based on whether a mongod is already up.
- Single spec file: `TESTING=1 npx jasmine spec/X.spec.js` - `TESTING=1` is required (server setup/teardown and error formatting branch on it).
- Default per-test timeout is 10s; override with `PARSE_SERVER_TEST_TIMEOUT`.

## Lint & format
- Plain `npx eslint file.js` reports false `'expect'/'describe' is not defined` on specs. Use `npm run lint` or add `--flag unstable_config_lookup_from_file` for per-directory config.
- `no-fallthrough`: a plain comment placed *between* fall-through `case` labels trips "Expected a 'break' statement before 'case'". Put the comment before the first case of the group (right after the previous `break`), or give the case its own body.
- Prettier flags pre-existing unrelated lines in some files. Don't `prettier --write` blindly - it will reformat code you didn't touch. Diff against baseline first; only fix what your change introduced.

## Code behavior (know before you "clean up")
- `DatabaseController.internalFields` drives ONLY query-key validation (`specialMasterQueryKeys`) and `specialKeysForUpdate` (fields with `masterWrite:true`). It does NOT strip fields from read results. Removing an entry changes whether master-key queries on that key are allowed, not read-stripping.
- `MongoTransform.mongoObjectToParseObject` `default:` branch THROWS `"bad key in untransform: <key>"` for any unknown `_`-prefixed key. So a `case '_field'` passthrough may be a live guard for legacy data (see #570), not dead code - check the default branch before deleting one.
- Stored shape ≠ REST shape: pointers → `_p_<field>`, ACL → `_rperm`/`_wperm`, password → `_hashed_password`. Inspect the raw DB to catch leaked/mis-stored internal fields.
- Relation join rows (`_Join:<key>:<class>`) hold ONLY `{ _id, relatedId, owningId }`. Parse does NOT set `_id` - Mongo assigns a native monotonic `ObjectId`. The `canSortOnJoinTables` limit/sort pushdown in `relatedIds()` relies on this: it sorts the join table by `_id` as a proxy for target `createdAt` order (valid only when members were added in createdAt order). When SYNTHESIZING a large relation to benchmark this path, you MUST insert join rows with monotonic ObjectId `_id`s in creation order (omit `_id` and use ordered `insertMany`, or hand-build increasing ObjectIds). Random string `_id`s (mimicking Parse objectIds) are WRONG - they sort in a different BSON type bracket and make the pushdown return garbage, silently invalidating the benchmark. Parse never cleans join rows on target delete, so dangling `relatedId`s (pointing at deleted objects) are a normal state to test.

## Performance / non-functional claims
- A correctness-only test (small N) proves NOTHING about performance. Before asserting a change is "performant" / "parity with X" / "no regression", BENCHMARK it on a real server at scale (build a 10k–50k-member relation / large dataset, time the real REST path, compare fix-vs-baseline on the SAME data). "Postgres already does it" / "reads are bounded" is a hypothesis, not evidence. Removing the `canSortOnJoinTables` pushdown (fetch-all relatedIds + build an `objectId:{$in:[all]}`) measured ~10–15× slower than the pushdown at 50k members (~150ms vs ~10ms) and scales linearly with relation size - the kind of regression only a scale benchmark reveals.

## Databases & backends
- Test against BOTH Mongo and Postgres - behavior diverges. A registered internal field with no DB column (e.g. `_session_token`, `_tombstone` on `_User`) returns empty on a master-key query rather than throwing; that path only shows on Postgres.
- "Registered internal field" ≠ "has a DB column." `_User` default columns are only `username/password/email/emailVerified/authData`; session tokens live in `_Session`.
- Postgres tests need the PostGIS extension enabled on the test DB, not just the DB created. Use `postgis/postgis` image, then `CREATE EXTENSION postgis`.
- Test collections/tables are prefixed `test_` (Mongo test DB `parseServerMongoAdapterTestDatabase`, and Postgres). A live dev DB is unprefixed.
- Scope specs by backend with `it_exclude_dbs(['postgres'])(...)` or `on_db('mongo', cb)`.

## Live server
- Default REST base is `http://localhost:1337/parse`; master key header is `X-Parse-Master-Key` (bypasses ACL/CLP).
- curl `where` clauses must be URL-encoded: `-G --data-urlencode 'where={...}'`.
- Write curl `-H` flags inline, not in a shell var. Unquoted `$VAR` word-splits in bash but NOT zsh (the default shell on macOS) → the header becomes one token, auth silently fails with 400/403. (Or use `bash -c '...'` / zsh `${=VAR}`.)
- A stray parse-server can bind `:1337` without an `EADDRINUSE` error, so a "fresh" boot may route to the old process (phantom 403/unauthorized). Check `lsof -iTCP:1337 -sTCP:LISTEN -Pn` first, or boot on another port.
- `Parse.Query order by createdAt` (ParseQuery.spec.js) flakes in full-suite runs: three sequential saves can tie on the same-millisecond `createdAt` with no secondary sort, so descending order between the tied pair is nondeterministic. Rerun the file in isolation before blaming your diff.
- When running the full suite via a background task, don't pipe through `| tail -N` - a failure's details land mid-output and get discarded, leaving only the summary line. Capture full output (`| cat`) and grep the file afterwards.

## Benchmarking & profiling
- Any load driver that `require`s `parse/node` in the SAME process as ParseServer gets the SDK's RESTController swapped to `ParseServerRESTController` → all "HTTP" ops route internally (PromiseRouter direct), bypassing express, every middleware, real HTTP, and even the `start()` server-state check. `benchmark/performance.js` measures this internal path. For real HTTP numbers, run the client in a SEPARATE process.
- `Config.put` can store a Config INSTANCE back into AppCache (`addRateLimit`, masterKey-TTL path) → cacheInfo is not always a plain flat object. Copy it with `for..in` (includes inherited keys), never `Object.keys`/spread, or you silently gut the config.
- Wall-clock A/B on a dev machine is useless at sub-ms scale: medians drift tens of % between runs from background load. Use `process.cpuUsage()` per op + V8 sampling heap profiler with `includeObjectsCollectedByMajorGC/MinorGC` (without those flags it reports only LIVE objects, under-measuring allocation ~100×), in alternating paired runs (A,B,A,B) - allocation volume and GC-cycle count are the most noise-robust metrics.
- `mongod --fork` is incompatible with macOS; use `nohup mongod ... &`.
