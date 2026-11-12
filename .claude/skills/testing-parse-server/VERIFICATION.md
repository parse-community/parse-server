# Verification procedure

The order matters. Each step is cheap and catches a class of false "verified" claims that the steps after it cannot.

---

## Level model

Each level proves something the level above it cannot. Anything behavioural needs all four; a pure internal refactor may stop at level 2.

| Level | What it proves | How |
|-------|----------------|-----|
| 1. Spec | The code path behaves as asserted | `TESTING=1 npx jasmine spec/X.spec.js` |
| 2. Both backends | Behaviour does not diverge on Mongo vs Postgres | same file with `PARSE_SERVER_TEST_DB=postgres` |
| 3. Live REST | The real request path (express, middlewares, routers, auth, ACL) reaches the change | boot `bin/parse-server`, drive it with `curl` |
| 4. Stored state | What actually landed in the database is correct, and nothing leaked | `mongosh` / `psql` before and after |

A spec exercising a function is **not** the same as reproducing the reported symptom on a running server. For a bug fix, reproduce at level 3 *before* the fix, then show it gone after.

---

## Step 1 - Build, and prove the build took

```bash
npm run build                        # babel src/ -> lib/, ~1.5s
grep -n "myChange" lib/path/File.js  # confirm the change is actually in lib/
```

Or leave `npm run watch` running in a background shell for the session - but still grep after branch switches, `git checkout -- src/`, stash pops and rebases, because those change `src/` without triggering a rebuild you observed.

`npm run watch:ts` does the same for TypeScript sources (`src/` contains both `.js` and `.ts`; the babel build handles both via `--extensions '.ts,.js'`).

**Never skip the grep.** "I ran build" and "the change is in lib/" are different claims, and only the second one is evidence.

---

## Step 2 - Run the affected specs in isolation

The suite is `random: true` (`spec/support/jasmine.json`). Running many files together produces state-coupling failures that do not reproduce alone, which burns time on phantom bugs.

```bash
# 1. Find every spec that touches what you changed
grep -rl "validateQuery" spec/

# 2. Run them one file at a time
TESTING=1 npx jasmine spec/RestQuery.spec.js

# 3. Narrow further while iterating (jasmine 5.7.1 supports --filter)
TESTING=1 npx jasmine spec/RestQuery.spec.js --filter="internal field"
```

`TESTING=1` is mandatory - `TestUtils.destroyAllDataPermanently` (called by the harness `afterEach`) throws without it, and error formatting, listener registration and several adapter branches key off it.

If no mongod is running on `:27017`, use `npm test spec/RestQuery.spec.js`, which wraps the run in `mongodb-runner`.

**Only after the isolated files are green** should you run the full suite, and when you do, capture the full output to a file rather than piping through `tail` - failure detail lands mid-output and gets discarded.

```bash
npm test > /tmp/suite.log 2>&1; grep -nE "Failures|failed|✗" /tmp/suite.log
```

---

## Step 3 - Guard-proof the new spec

A spec that passes *with* your change proves nothing on its own. It has to fail *without* it.

```bash
git checkout <baseref> -- src/      # revert source only
npm run build
TESTING=1 npx jasmine spec/X.spec.js    # EXPECT: the new spec FAILS

git checkout HEAD -- src/           # restore your change
npm run build
TESTING=1 npx jasmine spec/X.spec.js    # EXPECT: PASS
```

If the new spec passes both ways, it is not testing your change - rewrite it.

**Use `git checkout <ref> -- src/`, not `git stash`.** Worktrees share one stash stack, and if your change is already committed, `git stash push` saves nothing while the following `git stash pop` silently pops an unrelated stash into your tree. Full detail in [GOTCHAS.md](GOTCHAS.md).

---

## Step 4 - Establish the baseline before blaming your diff

Some specs fail or flake on clean `alpha`. Before attributing any failure to your work:

```bash
git remote -v                                  # is it `upstream` or `origin`?
git worktree add /tmp/ps-base upstream/alpha
cd /tmp/ps-base && npm ci && npm run build
TESTING=1 npx jasmine spec/X.spec.js
```

Known-flaky specs are hardcoded in `spec/support/CurrentSpecReporter.js` (`flakyTests`, retried up to 5 times, with `afterEachFn` re-run between attempts). If your spec only passes because of that retry mechanism - or because you added its UUID to `spec/testExclusionList.json` via `it_id` - it is not isolated. Fix the isolation instead.

---

## Step 5 - Both backends

Behaviour genuinely diverges. A registered internal field with no Postgres column returns empty rather than throwing; regex handling, sort semantics, JSON operators and error text all differ.

One-time Postgres setup (PostGIS required, not just Postgres):

```bash
docker run -d --name parse-postgres -p 5432:5432 -e POSTGRES_PASSWORD=password --rm postgis/postgis:17-3.5-alpine
sleep 20
docker exec parse-postgres psql -U postgres -c 'CREATE DATABASE parse_server_postgres_adapter_test_database;'
docker exec parse-postgres psql -U postgres -d parse_server_postgres_adapter_test_database \
  -c 'CREATE EXTENSION pgcrypto; CREATE EXTENSION postgis;'
docker exec parse-postgres psql -U postgres -d parse_server_postgres_adapter_test_database \
  -c 'CREATE EXTENSION postgis_topology;'
```

Then:

```bash
TESTING=1 PARSE_SERVER_TEST_DB=postgres \
  PARSE_SERVER_TEST_DATABASE_URI=postgres://postgres:password@localhost:5432/parse_server_postgres_adapter_test_database \
  npx jasmine spec/X.spec.js

npm run test:postgres:testonly     # full Postgres suite
docker stop parse-postgres         # always tear down
```

`PARSE_SERVER_LOG_LEVEL=debug` turns on the Postgres adapter's SQL tracer - the fastest way to see what a query actually compiled to. (It does *not* give you debug-level winston logs inside specs; use `VERBOSE=1` for server logging. See [GOTCHAS.md](GOTCHAS.md).)

**Replset:** CI runs MongoDB on `replset` topology; most local setups are standalone. Transactions, change streams and parts of LiveQuery behave differently. Anything touching those needs `MONGODB_TOPOLOGY=replset npm test`.

---

## Step 6 - Drive the live system

Automated specs are necessary and not sufficient. For anything behavioural, drive the real REST API and look at what actually landed.

```bash
# A stray parse-server can hold :1337 without EADDRINUSE -> confusing phantom 403s. Check first.
lsof -iTCP:1337 -sTCP:LISTEN -Pn

node ./bin/parse-server --appId app --masterKey master \
  --databaseURI mongodb://localhost:27017/dev --port 1337 &
# REST base: http://localhost:1337/parse
```

Write `-H` flags **inline on every call**. Do not put them in a shell variable: unquoted `$VAR` word-splits in bash but *not* in zsh (macOS default), so the header silently becomes one token and auth fails with confusing 400/403s.

```bash
# CREATE
curl -s -X POST -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master -H Content-Type:application/json \
  -d '{"score":10,"name":"a"}' http://localhost:1337/parse/classes/GameScore
# QUERY (where must be url-encoded)
curl -s -G -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master \
  --data-urlencode 'where={"name":"a"}' http://localhost:1337/parse/classes/GameScore
# READ / UPDATE / DELETE
curl -s -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master http://localhost:1337/parse/classes/GameScore/<id>
curl -s -X PUT -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master -H Content-Type:application/json \
  -d '{"score":20}' http://localhost:1337/parse/classes/GameScore/<id>
curl -s -X DELETE -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master http://localhost:1337/parse/classes/GameScore/<id>
# Cloud function / signup / login / schema / health
curl -s -X POST -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master -H Content-Type:application/json \
  -d '{}' http://localhost:1337/parse/functions/myFunc
curl -s -X POST -H X-Parse-Application-Id:app -H Content-Type:application/json \
  -d '{"username":"u","password":"p"}' http://localhost:1337/parse/users
curl -s -G -H X-Parse-Application-Id:app --data-urlencode 'username=u' --data-urlencode 'password=p' \
  http://localhost:1337/parse/login
curl -s -H X-Parse-Application-Id:app -H X-Parse-Master-Key:master http://localhost:1337/parse/schemas/_User
curl -s -H X-Parse-Application-Id:app http://localhost:1337/parse/health
```

Crucially: run the **same call without the master key**, and with a *session token of the wrong user*, to see the permission path. Master key bypasses ACL/CLP entirely, so a master-key-only test proves nothing about authorization.

```bash
-H X-Parse-Session-Token:r:<token>      # act as a specific user
```

---

## Step 7 - Inspect what was stored

The stored shape is not the REST shape, and bugs hide in the gap: pointers become `_p_<field>`, ACL becomes `_rperm`/`_wperm`, passwords become `_hashed_password`, and internal metadata (`_session_token`, `_perishable_token`, `_failed_login_count`) lives alongside your data.

```bash
# MongoDB. Live dev DB is unprefixed; the TEST db is
# `parseServerMongoAdapterTestDatabase` with a `test_` collection prefix (test__User, test_GameScore).
mongosh mongodb://localhost:27017/dev --quiet --eval 'db.getCollectionNames()'
mongosh mongodb://localhost:27017/dev --quiet --eval 'db.GameScore.find().pretty()'
mongosh mongodb://localhost:27017/dev --quiet --eval 'db._User.find().pretty()'

# PostgreSQL. Test tables are prefixed too -> "test__User".
docker exec parse-postgres psql -U postgres -d parse_server_postgres_adapter_test_database -c '\dt'
docker exec parse-postgres psql -U postgres -d parse_server_postgres_adapter_test_database -c 'SELECT * FROM "_User";'
```

**Before/after is the method:** snapshot state → perform the operation over REST → snapshot again → diff. That is what proves the change *did what it should* **and** *nothing it shouldn't* - no leaked internal fields, no stray writes, no orphaned rows.

Inside a spec you can assert stored shape directly rather than trusting REST output:

```js
const config = Config.get('test');
const stored = await config.database.adapter.find('_User', schema, { objectId: id }, {});
// assert internals: _hashed_password never reaches a client read, _rperm is what you expect, etc.
```

---

## Step 8 - Coverage, options, lint

```bash
npm run lint                  # eslint with the per-directory config flag CI uses
npm run coverage              # -> coverage/lcov-report/index.html
npm run madge:circular        # circular dependency check (CI gate)
```

If you touched `src/Options/`:

```bash
npm run definitions           # regenerate src/Options/Definitions.js + docs
npm run build:types           # regenerate types/*.d.ts (never hand-edit; types/Options/index.d.ts is the one manual file)
npm run test:types
npm run ci:definitionsCheck   # exactly what CI verifies
```

---

## Evidence template

When reporting, produce this - not an adjective:

```
Change:      <one line>
Build:       npm run build; grep -n "<symbol>" lib/<file>  -> present
Specs:       TESTING=1 npx jasmine spec/<X>.spec.js  -> N specs, 0 failures
Guard-proof: reverted src/, rebuilt -> new spec FAILED (as required); restored -> PASS
Postgres:    same file, PARSE_SERVER_TEST_DB=postgres -> N specs, M excluded, 0 failures
Replset:     <run / not applicable because ...>
Live REST:   <the exact curl(s), the response before and after the fix>
Stored:      <the mongosh/psql diff>
Adversarial: <gaps/edges probed from ADVERSARIAL-QA.md and what held>
Security:    <which primitives from SECURITY.md were reachable, what you probed, results>
Performance: <complexity review + base-branch numbers, or why not applicable — PERFORMANCE.md>
Lint:        npm run lint -> clean
Not run:     <anything you skipped, explicitly>
```

The `Not run` line is not optional. Silence about a backend or a level reads as coverage you did not produce.
