---
name: testing-parse-server
description: Use when running, testing, or verifying a change in the parse-server repo - starting Parse Server with MongoDB/Postgres, running jasmine specs (single file or suite), writing specs that hold up under random-order isolation, or before claiming a parse-server feature/bugfix works. Covers the "tests pass but ran against stale lib/" trap and testing both database backends.
---

# Testing Parse Server

## Overview

Parse Server is a stable core product used in production by many. **A change is not "tested" until it has been exercised end-to-end against a real database - both MongoDB and PostgreSQL - with the change actually compiled in, and shipped with test coverage.** A green run against stale code, or against only one backend, is not verification.

**Recurring lessons live in [GOTCHAS.md](GOTCHAS.md)** - skim it before you start, and append any new trap you hit (terse dot points, not stories).

## The rigor checklist

Before claiming any `src/` change works:

1. **Build `lib/` first.** Tests `require('../lib/...')`, NOT `src/`. Editing `src/` is invisible to the suite until you compile. Skipping this is the #1 silent trap - you get a green run that never touched your change.
2. **Confirm the change is in `lib/`.** After building, `grep` the compiled file. Don't trust green on faith.
3. **Run the affected spec file(s) in isolation.** The suite is `random: true`; running many files together causes state-coupling flakiness. One file = clean signal. Find neighbouring specs worth running by grepping `spec/` for the symbol you changed (e.g. `grep -rl validateQuery spec/`).
4. **Know the baseline before blaming your change.** Some specs fail/flake on clean `alpha` too. If a failure appears, reproduce it on the base branch (a git worktree off `upstream/alpha`, or `origin/alpha` if there's no `upstream` remote - check `git remote -v`) before attributing it to your work.
5. **Test BOTH backends.** Behavior genuinely differs (e.g. a registered field with no Postgres column returns empty instead of throwing). Mongo-only is not enough for core changes.
6. **Ship coverage.** Add or adjust a spec that fails without your change and passes with it. Rigorous = the change is guarded going forward.
7. **Lint.** `npm run lint` (needs a non-default flag - see below).

## Levels of verification

Each level catches what the level above it cannot. Anything behavioral needs all four; a pure refactor may stop at level 2.

| Level | What it proves | How |
|-------|----------------|-----|
| 1. Unit/spec | The code path behaves as asserted | `TESTING=1 npx jasmine spec/X.spec.js` |
| 2. Both backends | Behaviour doesn't diverge on Mongo vs Postgres | same file with `PARSE_SERVER_TEST_DB=postgres` |
| 3. Live REST | The real request path (express, middleware, routers, auth) reaches the change | boot `bin/parse-server`, drive it with `curl` |
| 4. Stored state | What actually landed in the database is correct and nothing leaked | `mongosh` / `psql` before and after |

A spec exercising a function is not the same as reproducing the reported symptom on a running server. For a bug fix, reproduce the symptom at level 3 **before** the fix, then show it gone after.

## The guard-proof

A spec that passes with your change proves nothing on its own; it has to fail without it.

```bash
git stash push -- src/            # or: git checkout <baseref> -- src/
npm run build && TESTING=1 npx jasmine spec/X.spec.js   # expect FAIL on the new spec
git stash pop                     # or: git checkout HEAD -- src/
npm run build && TESTING=1 npx jasmine spec/X.spec.js   # expect PASS
```

If the new spec passes both ways, it isn't testing the change. Note the stash caveat in GOTCHAS.md when working in a worktree or when the change is already committed.

## Quick reference

```bash
# --- Build (do this after EVERY src/ edit) ---
npm run build                       # babel src/ -> lib/  (~1.5s)
npm run watch                       # OR: auto-rebuild lib/ on save (avoids the stale-lib trap)
grep -n "myChange" lib/path/File.js # confirm the change compiled in

# --- MongoDB: run ONE spec file ---
# If a mongod is already listening on :27017:
TESTING=1 npx jasmine spec/RestQuery.spec.js
# If not, let mongodb-runner spin an ephemeral one:
MONGODB_VERSION=8.0.4 MONGODB_TOPOLOGY=standalone \
  mongodb-runner exec -t standalone --version 8.0.4 -- --port 27017 -- \
  npx cross-env TESTING=1 jasmine spec/RestQuery.spec.js

# --- MongoDB: full suite ---
npm test           # spins ephemeral mongod, then runs everything
npm run testonly   # runs against an already-running mongod on :27017

# --- PostgreSQL: run ONE spec file (needs a PostGIS server; CI runs PostGIS 16/17/18) ---
docker run -d --name parse-pg -p 5432:5432 -e POSTGRES_PASSWORD=password postgis/postgis:17-3.5
docker exec parse-pg psql -U postgres -c "CREATE DATABASE parse_server_postgres_adapter_test_database;"
docker exec parse-pg psql -U postgres -d parse_server_postgres_adapter_test_database -c "CREATE EXTENSION IF NOT EXISTS postgis;"
TESTING=1 PARSE_SERVER_TEST_DB=postgres \
  PARSE_SERVER_TEST_DATABASE_URI=postgres://postgres:password@localhost:5432/parse_server_postgres_adapter_test_database \
  npx jasmine spec/RestQuery.spec.js
docker rm -f parse-pg               # always tear down
# Full Postgres suite: npm run test:postgres:testonly

# --- Types, definitions, structure (CI checks all of these) ---
npm run build:types                 # regenerate types/*.d.ts (never hand-edit them)
npm run test:types                  # lint types/tests.ts against generated types
npm run definitions                 # regenerate src/Options after changing options
npm run ci:definitionsCheck         # what CI runs to verify the above was done
npm run madge:circular              # circular dependency check
npm run coverage                    # coverage/lcov-report/index.html

# --- Lint (default eslint invocation misses per-dir config -> false errors) ---
npm run lint                        # whole repo
npx eslint --flag unstable_config_lookup_from_file src/File.js spec/File.spec.js  # scoped
```

## What CI will run

Matching CI locally avoids the slow loop of pushing to find out. `.github/workflows/ci.yml` runs:

- MongoDB 7.0.16 and 8.0.4, both **replset** topology, on Node 24.11.0
- MongoDB 8.0.4 standalone on Node 20.19.0 and 22.12.0, plus a Redis-cache variant
- Postgres via PostGIS 16-3.5, 17-3.5 and 18-3.6
- Lint, definitions check, circular dependencies, types, Node engine check, CodeQL, Docker build

Replset is the topology most local setups don't have. Transactions and change streams behave differently on standalone, so anything touching those needs a replset run: `MONGODB_TOPOLOGY=replset npm test`.

## Test isolation

The harness in `spec/helper.js` gives every test a clean world, and the rules below exist because the suite runs in **random order**: a spec that depends on another spec's leftovers will pass alone and fail in CI.

What the harness does for you:

- `beforeAll` boots one server via `reconfigureServer()` and points the `Parse` SDK global at it.
- `afterEach` wipes all data (`destroyAllDataPermanently`), clears the schema cache, removes all Cloud Code hooks, logs the current user out, restores mocked `fetch`, resets `protectedFields`, and asserts that no unexpected `_`-prefixed class was left behind.
- If a test called `reconfigureServer({ ...options })` with a non-empty config, the harness reboots the default server after that test, so config changes don't bleed into the next one.

What you still have to do:

- **Create your own fixtures inside the test.** Never rely on objects, users, roles or schemas created by another spec, including one earlier in the same file.
- **Don't assert on global counts** ("there should be 3 objects") unless the test created all of them.
- **Reconfigure inside the test that needs it**, with `await reconfigureServer({ ... })`, not in a `beforeAll`, so the harness knows to restore the default server.
- **Shut down any server you start yourself** with `await shutdownServer(server)`; it also asserts no connections were left open.
- **Mock `fetch` via `mockFetch`**, not by overwriting the global directly, so `restoreFetch` can undo it.
- **Don't depend on wall-clock ordering.** Sequential saves can land on the same millisecond, so sort ties are nondeterministic; add an explicit secondary sort or assert on a set.
- **Clean up timers, intervals and listeners** you register, otherwise they fire during later specs.

Known-flaky specs are listed in `spec/support/CurrentSpecReporter.js` and get retried automatically. Every test wrapped in `it_id('<uuid>')(it)(...)` can also be disabled by adding its UUID to an optional `spec/testExclusionList.json`, which is not committed. If your spec needs either mechanism to pass, it usually means it isn't isolated.

## Writing specs

Specs are jasmine, config at `spec/support/jasmine.json` (globals + `helper.js` load automatically even when you pass a single file).

- `Parse` and `request` are globals; call `await reconfigureServer({ ...options })` in a test to boot a server with specific config.
- Scope by backend or version: `it_exclude_dbs(['postgres'])(...)`, `it_only_db('mongo')(...)`, `describe_only_db('postgres')(...)`, `it_only_mongodb_version('>=8')(...)`, `it_only_postgres_version(...)`, `it_only_node_version(...)`.
- Useful globals from `helper.js`: `reconfigureServer`, `shutdownServer`, `defaultConfiguration`, `databaseAdapter`, `mockFetch`/`restoreFetch`, `createTestUser`, `TestObject`, `Item`, `Container`, `range`, `jfail`.
- Write `async`/`await`; assert rejections with `await expectAsync(p).toBeRejectedWith(...)` rather than `try`/`catch` + `fail()`. Older specs use `done()` callbacks, don't add more.
- Default per-test timeout is 10s; override with `PARSE_SERVER_TEST_TIMEOUT`.
- Test the failure modes, not just the happy path: wrong ACL/CLP, missing master key, invalid input, empty result, and the Postgres-vs-Mongo divergence for the same call.

## Driving the live system & inspecting state

Automated specs are necessary but not sufficient. For anything behavioral, **drive the real REST API and look at what actually landed in the database** - the stored shape differs from the REST response (pointers become `_p_<field>`, ACL becomes `_rperm`/`_wperm`, passwords become `_hashed_password`), and bugs often hide in that gap.

**Boot a live server** (start a mongod on :27017 first - `mongodb-runner start` / docker / local). Run it backgrounded so you can hit it:

```bash
lsof -iTCP:1337 -sTCP:LISTEN -Pn    # first: a stray parse-server can bind :1337 without erroring -> confusing routing. Pick a free --port.
node ./bin/parse-server --appId app --masterKey master \
  --databaseURI mongodb://localhost:27017/dev --port 1337 &
# REST base: http://localhost:1337/parse
```

**Exercise it with REST** (master key bypasses ACL/CLP so you can see and change everything).
Write the `-H` flags **inline on every call** - do NOT stuff them in a shell variable: unquoted `$VAR` word-splits in bash but NOT in zsh (the default shell on macOS), which silently breaks the headers and yields 400/403s.

```bash
# CREATE (POST)
curl -s -X POST -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master -H Content-Type:application/json \
  -d '{"score":10,"name":"a"}' http://localhost:1337/parse/classes/GameScore
# QUERY (GET) - where clause must be url-encoded
curl -s -G -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master \
  --data-urlencode 'where={"name":"a"}' http://localhost:1337/parse/classes/GameScore
# READ one / UPDATE (PUT) / DELETE
curl -s -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master http://localhost:1337/parse/classes/GameScore/<id>
curl -s -X PUT -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master -H Content-Type:application/json \
  -d '{"score":20}' http://localhost:1337/parse/classes/GameScore/<id>
curl -s -X DELETE -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master http://localhost:1337/parse/classes/GameScore/<id>
# Cloud function / user signup / schema (master-key only) / health
curl -s -X POST -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master -H Content-Type:application/json \
  -d '{}' http://localhost:1337/parse/functions/myFunc
curl -s -X POST -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master -H Content-Type:application/json \
  -d '{"username":"u","password":"p"}' http://localhost:1337/parse/users
curl -s -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master http://localhost:1337/parse/schemas/_User
curl -s -H X-Parse-Application-Id:app http://localhost:1337/parse/health
```

**Inspect the raw database directly** - this is how you confirm what was *stored*, not just what REST echoed back:

```bash
# MongoDB (mongosh). Live dev DB has no prefix; the TEST db is
# `parseServerMongoAdapterTestDatabase` with a `test_` collection prefix (e.g. test__User).
mongosh mongodb://localhost:27017/dev --quiet --eval 'db.getCollectionNames()'
mongosh mongodb://localhost:27017/dev --quiet --eval 'db.GameScore.find().pretty()'
mongosh mongodb://localhost:27017/dev --quiet --eval 'db._User.find().pretty()'  # see _hashed_password, _rperm, _p_* etc.

# PostgreSQL (via the container). Test tables are prefixed `test_` -> "test__User".
docker exec parse-pg psql -U postgres -d parse_server_postgres_adapter_test_database -c '\dt'
docker exec parse-pg psql -U postgres -d parse_server_postgres_adapter_test_database -c 'SELECT * FROM "_User";'
```

**Before/after is the method:** snapshot DB state -> perform the operation via REST -> snapshot again -> diff. That is what proves a feature *did what it should* and *nothing it shouldn't* (no leaked internal fields, no stray writes).

**Inside a spec you can assert the stored shape too**, not just REST output - query with the master key, or read the adapter directly:

```js
const config = Config.get('test');
const stored = await config.database.adapter.find('_User', schema, { objectId: id }, {});
// assert internal fields (_hashed_password absent from client reads, _tombstone not present, etc.)
```

## Non-functional claims

A correctness test at small N says nothing about performance. Before claiming "faster", "no regression" or "parity", measure it: build a realistic dataset, drive the real REST path, and compare against the base branch on the same data. `npm run benchmark` (or `benchmark:quick`) is the starting point, but note the in-process caveat in GOTCHAS.md - a driver that requires `parse/node` in the same process bypasses express entirely.

## Common mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Edit `src/`, run tests without building | Tests run stale `lib/` - green means nothing | `npm run build` (or `npm run watch`) first; `grep lib/` to confirm |
| Only test MongoDB | Postgres-specific behavior (no-column fields, SQL) untested | Also run the spec with `PARSE_SERVER_TEST_DB=postgres` against PostGIS |
| Only test standalone Mongo | Transaction/change-stream paths differ | Run `MONGODB_TOPOLOGY=replset` for anything touching those |
| Run many spec files together to "save time" | Random-order state coupling -> phantom failures | Run the affected file(s) in isolation |
| Blame a failure on your diff immediately | Waste time on a pre-existing/flaky failure | Reproduce on `upstream/alpha` in a worktree first |
| New spec never checked against the old code | The spec may not test the change at all | Guard-proof it: revert `src/`, rebuild, watch it fail |
| Rely on data another spec created | Passes alone, fails in random order | Create fixtures inside the test |
| Change behavior, no new/updated spec | Regression risk on a core product | Add a spec that fails without the change |
| Trust the REST response as "what's stored" | Miss leaked/mis-stored internal fields (`_p_*`, `_rperm`, `_hashed_password`) | Inspect the raw DB (mongosh/psql) before & after |
| Only assert via specs, never drive it | Behavioral bugs slip past mocked/unit paths | Boot a live server, POST/PUT/GET/DELETE, observe DB state |
| Hand-edit `types/*.d.ts` | Overwritten on next generation | `npm run build:types`; only `types/Options/index.d.ts` is manual |
| `npx eslint file.js` directly | Bogus "'expect' is not defined" errors | Use `npm run lint` / add `--flag unstable_config_lookup_from_file` |
| `prettier --write` on a touched file | Reformats unrelated lines into your diff | Fix only what your change introduced |
