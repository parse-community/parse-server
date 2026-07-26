---
name: testing-parse-server
description: Use when running, testing, or verifying a change in the parse-server repo - starting Parse Server with MongoDB/Postgres, running jasmine specs (single file or suite), or before claiming a parse-server feature/bugfix works. Covers the "tests pass but ran against stale lib/" trap and testing both database backends.
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

# --- PostgreSQL: run ONE spec file (needs a PostGIS server) ---
docker run -d --name parse-pg -p 5432:5432 -e POSTGRES_PASSWORD=password postgis/postgis:15-3.4
docker exec parse-pg psql -U postgres -c "CREATE DATABASE parse_server_postgres_adapter_test_database;"
docker exec parse-pg psql -U postgres -d parse_server_postgres_adapter_test_database -c "CREATE EXTENSION IF NOT EXISTS postgis;"
TESTING=1 PARSE_SERVER_TEST_DB=postgres \
  PARSE_SERVER_TEST_DATABASE_URI=postgres://postgres:password@localhost:5432/parse_server_postgres_adapter_test_database \
  npx jasmine spec/RestQuery.spec.js
docker rm -f parse-pg               # always tear down
# Full Postgres suite: npm run test:postgres:testonly

# --- Lint (default eslint invocation misses per-dir config → false errors) ---
npm run lint                        # whole repo
npx eslint --flag unstable_config_lookup_from_file src/File.js spec/File.spec.js  # scoped
```

## Driving the live system & inspecting state

Automated specs are necessary but not sufficient. For anything behavioral, **drive the real REST API and look at what actually landed in the database** - the stored shape differs from the REST response (pointers become `_p_<field>`, ACL becomes `_rperm`/`_wperm`, passwords become `_hashed_password`), and bugs often hide in that gap.

**Boot a live server** (start a mongod on :27017 first - `mongodb-runner start` / docker / local). Run it backgrounded so you can hit it:

```bash
lsof -iTCP:1337 -sTCP:LISTEN -Pn    # first: a stray parse-server can bind :1337 without erroring → confusing routing. Pick a free --port.
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

# PostgreSQL (via the container). Test tables are prefixed `test_` → "test__User".
docker exec parse-pg psql -U postgres -d parse_server_postgres_adapter_test_database -c '\dt'
docker exec parse-pg psql -U postgres -d parse_server_postgres_adapter_test_database -c 'SELECT * FROM "_User";'
```

**Before/after is the method:** snapshot DB state → perform the operation via REST → snapshot again → diff. That is what proves a feature *did what it should* and *nothing it shouldn't* (no leaked internal fields, no stray writes).

**Inside a spec you can assert the stored shape too**, not just REST output - query with the master key, or read the adapter directly:

```js
const config = Config.get('test');
const stored = await config.database.adapter.find('_User', schema, { objectId: id }, {});
// assert internal fields (_hashed_password absent from client reads, _tombstone not present, etc.)
```

## Writing specs

Specs are jasmine, config at `spec/support/jasmine.json` (globals + `helper.js` load automatically even when you pass a single file).

- `Parse` and `request` are globals; call `await reconfigureServer({ ...options })` in a test to boot a server with specific config.
- Scope by backend: `it_exclude_dbs(['postgres'])('...', () => {})` skips on Postgres; `on_db('mongo', () => {...})` runs only on Mongo.
- Default per-test timeout is 10s; override with `PARSE_SERVER_TEST_TIMEOUT`.

## Common mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Edit `src/`, run tests without building | Tests run stale `lib/` - green means nothing | `npm run build` (or `npm run watch`) first; `grep lib/` to confirm |
| Only test MongoDB | Postgres-specific behavior (no-column fields, SQL) untested | Also run the spec with `PARSE_SERVER_TEST_DB=postgres` against PostGIS |
| Run many spec files together to "save time" | Random-order state coupling → phantom failures | Run the affected file(s) in isolation |
| Blame a failure on your diff immediately | Waste time on a pre-existing/flaky failure | Reproduce on `upstream/alpha` in a worktree first |
| Change behavior, no new/updated spec | Regression risk on a core product | Add a spec that fails without the change |
| Trust the REST response as "what's stored" | Miss leaked/mis-stored internal fields (`_p_*`, `_rperm`, `_hashed_password`) | Inspect the raw DB (mongosh/psql) before & after |
| Only assert via specs, never drive it | Behavioral bugs slip past mocked/unit paths | Boot a live server, POST/PUT/GET/DELETE, observe DB state |
| `npx eslint file.js` directly | Bogus "'expect' is not defined" errors | Use `npm run lint` / add `--flag unstable_config_lookup_from_file` |
