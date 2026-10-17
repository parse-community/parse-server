# Reference

Verified against the repo. Where a value is a default, the default is stated.

---

## npm scripts

| Script | Command | Notes |
|---|---|---|
| `build` | `babel src/ -d lib/ --copy-files --extensions '.ts,.js'` | Run after **every** `src/` edit |
| `watch` | `babel --watch src/ -d lib/ --copy-files` | Leave running; still verify after branch switches |
| `build:types` | `tsc` | Regenerates `types/*.d.ts` |
| `watch:ts` | `tsc --watch` | |
| `test` | `mongodb-runner exec -t ${MONGODB_TOPOLOGY:=standalone} --version ${MONGODB_VERSION:=8.0.4} -- --port 27017 -- npm run testonly` | Spins an ephemeral mongod |
| `testonly` | `cross-env MONGODB_VERSION=… MONGODB_TOPOLOGY=… TESTING=1 jasmine` | Needs a mongod already on `:27017` |
| `test:postgres:testonly` | sets `PARSE_SERVER_TEST_DB=postgres` + `PARSE_SERVER_TEST_DATABASE_URI=postgres://postgres:password@localhost:5432/parse_server_postgres_adapter_test_database`, then `testonly` | |
| `test:mongodb:7.0.16` / `test:mongodb:8.0.4` | `MONGODB_VERSION=… npm run test` | Version-pinned runs |
| `test:types` | `eslint types/tests.ts -c ./types/eslint.config.mjs` | |
| `coverage` | `TESTING=1 nyc jasmine` | Report at `coverage/lcov-report/index.html` |
| `coverage:mongodb` | `mongodb-runner exec … -- npm run coverage` | **This is what CI actually runs**, not `npm test` |
| `lint` | `eslint --cache ./ --flag unstable_config_lookup_from_file` | The flag is required - see GOTCHAS.md |
| `lint-fix` | same with `--fix` | |
| `definitions` | `node ./resources/buildConfigDefinitions.js && prettier --write 'src/Options/*.js'` | After changing options |
| `ci:definitionsCheck` | `node ./ci/definitionsCheck.js` | CI gate |
| `ci:checkNodeEngine` | `node ./ci/nodeEngineCheck.js` | |
| `madge:circular` | `madge ./src --circular` | CI gate |
| `docs` | `jsdoc -c ./jsdoc-conf.json` | CI gate |
| `benchmark` | mongodb-runner + `benchmark:only` | |
| `benchmark:only` | `node --expose-gc benchmark/performance.js` | Assumes mongod running |
| `benchmark:quick` | `BENCHMARK_ITERATIONS=10 npm run benchmark:only` | Smoke run |
| `start` | `node ./bin/parse-server` | |

Running a single file: `TESTING=1 npx jasmine spec/X.spec.js`, or `npm test spec/X.spec.js` when you need mongodb-runner to supply the database.

Node engines: `>=20.19.0 <21 || >=22.12.0 <23 || >=24.11.0 <25`.

`package.json` declares a husky `pre-commit` → `lint-staged` hook, but husky is not installed and there is no `.husky/` directory - **the hook does not run**. Lint manually.

---

## Environment variables

### Selecting the backend

| Var | Effect |
|---|---|
| `TESTING=1` | **Required for every spec run.** `TestUtils.destroyAllDataPermanently` throws without it; also gates test-mode error formatting, listener registration, the facebook adapter's `test` credentials, IAP validation bypass, and Postgres warning suppression. Exactly `'1'` also switches the logs folder to `./test_logs/` |
| `PARSE_SERVER_TEST_DB` | `postgres` selects the Postgres adapter; unset/anything else = Mongo. Drives every `it_only_db` / `describe_only_db` / `on_db` helper |
| `PARSE_SERVER_TEST_DATABASE_URI` | Overrides the Postgres URI. Default `postgres://localhost:5432/parse_server_postgres_adapter_test_database` |
| `PARSE_SERVER_DATABASE_ADAPTER` | JSON adapter spec; takes priority over `PARSE_SERVER_TEST_DB` |
| `PARSE_SERVER_TEST_CACHE=redis` | Swaps in `RedisCacheAdapter` and enables the Redis-gated specs. Needs a real Redis on `:6379` |
| `MONGODB_VERSION` (default `8.0.4`) | mongodb-runner version; also gates `it_only_mongodb_version` |
| `MONGODB_TOPOLOGY` (default `standalone`) | `standalone` or `replset`. CI uses `replset` |
| `POSTGRES_VERSION` | Gates `it_only_postgres_version` |

### Timing and diagnostics

| Var | Effect |
|---|---|
| `PARSE_SERVER_TEST_TIMEOUT` | Per-test timeout in ms. **Default 10000**; CI sets 20000 |
| `VERBOSE` | Un-silences the test server and forces `logLevel='verbose'` |
| `PARSE_SERVER_LOG_LEVEL` | Un-silences the test server, and enables the **Postgres SQL tracer** when set to `debug`. **Caveat: it does not actually set the winston level in specs** - see below |
| `JSON_LOGS` | JSON-formatted logs (note: `JSON_LOGS`, with the underscore) |
| `PARSE_SERVER_LOGS_FOLDER` | Default `./logs/`; `./test_logs/` under `TESTING=1` |
| `BENCHMARK_ITERATIONS` | Benchmark iteration count |
| `MONGODB_URI` | Benchmark DB, default `mongodb://localhost:27017/parse_benchmark_test` |

**The log-level trap.** `spec/helper.js` passes `verbose: !silent` into the server config, and setting *either* `VERBOSE` or `PARSE_SERVER_LOG_LEVEL` sets `silent = false`. `configureLogger` then applies `if (verbose) logLevel = 'verbose'` **last**, overriding whatever level you asked for. So inside specs, `PARSE_SERVER_LOG_LEVEL=debug` gets you verbose-level winston output, not debug. What it *does* still do is enable the Postgres SQL tracer, because `PostgresClient.js` reads `process.env.PARSE_SERVER_LOG_LEVEL === 'debug'` directly rather than going through the logger. Use it for SQL tracing; do not expect debug-level log lines.

---

## The test harness (`spec/helper.js`)

Loaded automatically by `spec/support/jasmine.json` (`helpers: ["helper.js"]`) even when you run a single file.

### The default test server

| Setting | Value |
|---|---|
| URL | `http://localhost:8378/1` (port 8378, mount path `/1`) |
| `appId` | `test` |
| `masterKey` | `test` |
| `maintenanceKey` | `testing` |
| `readOnlyMasterKey` | `read-only-test` |
| `javascriptKey` / `restAPIKey` / `clientKey` / `dotNetKey` / `webhookKey` | `test` / `rest` / `client` / `windows` / `hook` |
| Mongo test DB | `parseServerMongoAdapterTestDatabase`, collection prefix `test_` |
| Postgres test DB | `parse_server_postgres_adapter_test_database`, table prefix `test_` |
| Files adapter | GridFS on Mongo, `FSAdapter` on Postgres (automatic) |
| LiveQuery | enabled by default for `classNames: ['TestObject']` |
| `allowClientClassCreation` | `true` |
| `protectedFields` default | `{ _User: { '*': ['email'] } }` |

### Lifecycle

- **`beforeAll`** - restores `fetch`, boots one server via `reconfigureServer()`, initialises the `Parse` SDK global, enables unsafe current user, and sets `REQUEST_ATTEMPT_LIMIT = 1` so the SDK does not retry and mask failures.
- **`afterEach`** (`global.afterEachFn`) - restores `fetch`; `Parse.Cloud._removeAllHooks()`; resets the LiveQuery client; resets `protectedFields`; **asserts no unexpected `_`-prefixed class was left behind** (allowed: non-`_` classes, `_Join:*`, and `_User`/`_Installation`/`_Role`/`_Session`/`_Product`/`_Audience`/`_Idempotency`); logs the user out; `destroyAllDataPermanently`; clears the schema cache; and if the test called `reconfigureServer` with a non-empty config, reboots the default server.
- **`afterAll`** - restores `fetch`, prints slow/duplicate/flaky stats.

`reconfigureServer` also installs an express error handler that calls `fail('should not call next')` - an unhandled express error fails the current spec rather than vanishing.

`shutdownServer(server)` asserts **no connections were left open** - it is a leak detector, not just a teardown.

### Globals available in every spec

**Server control:** `reconfigureServer(config = {})`, `shutdownServer(server)`, `defaultConfiguration`, `databaseAdapter`, `databaseURI`.

**Fixtures:** `Parse`, `TestObject`, `Item`, `Container`, `create(options, cb)`, `createTestUser()` (user `test` / `moon-y`), `range(n)`.

**Assertions:** `ok`, `equal`, `strictEqual`, `notEqual`, `arrayContains`, `jequal` (deep JSON compare), `jfail(err)`.

**Mocking:** `mockFetch(mockResponses)` / `restoreFetch()` (requests to the test server URL pass through un-mocked and unrecorded; unmatched URLs resolve `{ok:false}` rather than rejecting); `jasmine.mockLibrary(path, exportName, mock)` / `jasmine.restoreLibrary(...)` to swap a module export; `jasmine.timeout(ms = 100)` promise sleep; `mockCustomAuthenticator`, `mockFacebookAuthenticator`.

### Spec-scoping helpers

| Helper | Purpose |
|---|---|
| `it_only_db(db)` / `fit_only_db(db)` | Run only on `'mongo'` or `'postgres'` |
| `it_exclude_dbs([...])` / `fit_exclude_dbs([...])` | Skip on the listed backends |
| `describe_only_db(db)` / `fdescribe_only_db(db)` | Suite-level backend gating |
| `describe_only(fn)` / `fdescribe_only(fn)` | Suite gated on any boolean predicate (used for `PARSE_SERVER_TEST_CACHE === 'redis'`) |
| `it_only_mongodb_version(range)` | semver against `MONGODB_VERSION` |
| `it_only_postgres_version(range)` | semver against `POSTGRES_VERSION` |
| `it_only_node_version(range)` | semver against `process.version` |
| `on_db(db, cb, elseCb)` | Branch inside a test body or when building a value |
| `it_id(uuid)(it)('name', fn)` | Lets the test be disabled by UUID via the optional, uncommitted `spec/testExclusionList.json` |

Usage: `it_only_db('mongo')('does a mongo thing', async () => { … })`.

### Flaky-test retries

`spec/support/CurrentSpecReporter.js` holds a **hardcoded** `flakyTests` array of exact spec full names; those specs are retried up to **5** times, with `afterEachFn` re-run between attempts. `slowTestLimit` is 2 seconds - anything slower is reported at the end alongside duplicate spec names and retry counts.

Needing either the retry list or `it_id` exclusion to go green means the spec is not isolated. Fix the isolation.

---

## Writing specs

Jasmine 5.7.1. Config: `spec/support/jasmine.json` → `{ spec_dir: "spec", spec_files: ["**/*.[sS]pec.js"], helpers: ["helper.js"], random: true }`. No default filter; `--filter=<regex>` and `--filter-path` are supported by the CLI.

- Write `async`/`await`. Assert rejections with `await expectAsync(p).toBeRejectedWith(new Parse.Error(code, msg))` - not `try`/`catch` + `fail()`. Older specs use `done()` callbacks; do not add more.
- Call `await reconfigureServer({ … })` **inside the test that needs it**, never in `beforeAll`, so the harness knows to restore the default server afterwards.
- Create every fixture inside the test. Never depend on another spec's objects, users, roles or schemas - the suite is random-order.
- Do not assert on global counts unless the test created every counted object.
- Clean up timers, intervals and listeners; shut down any server you started with `await shutdownServer(server)`.
- Add an explicit secondary sort (or assert on a set) rather than relying on `createdAt` ordering.
- Cloud Code can be defined inline in the test (`Parse.Cloud.define(...)`; wiped by `afterEach`) or via `reconfigureServer({ cloud: '<path>' | fn })`.
- Test failure modes, not just the happy path: wrong ACL/CLP, missing master key, invalid input, empty result, and the Postgres-vs-Mongo divergence for the same call.

---

## What CI runs

`.github/workflows/ci.yml` - default `NODE_VERSION: 24.11.0`, `PARSE_SERVER_TEST_TIMEOUT: 20000`.

**check-mongo** (`npm run coverage:mongodb`):

| Entry | Mongo | Topology | Node | Extra |
|---|---|---|---|---|
| MongoDB 7 ReplicaSet | 7.0.16 | replset | 24.11.0 | |
| MongoDB 8 ReplicaSet | 8.0.4 | replset | 24.11.0 | |
| Redis Cache | 8.0.4 | standalone | 24.11.0 | `PARSE_SERVER_TEST_CACHE=redis` |
| Node 20 | 8.0.4 | standalone | 20.19.0 | |
| Node 22 | 8.0.4 | standalone | 22.12.0 | |

**check-postgres** (`npm run coverage`): PostGIS `16-3.5`, `17-3.5`, `18-3.6`, each with a Redis service container; runs `scripts/before_script_postgres_conf.sh` and `scripts/before_script_postgres.sh` first.

**Other gates:** Lint, Check Definitions, Circular Dependencies, Docs, Docker Build (amd64 + arm64), NPM Lock File Version, Check Types, Node Engine Check, CodeQL.

**`ci-performance.yml`** runs `npm run benchmark` on the base branch and the PR branch and compares. **Both regression bands fail the job** (exit code 1): >25% is labelled "Slower", >50% "Much Slower". There is no warn-only tier that lets a regression through.

**Replset is the topology most local setups lack.** Transactions and change streams behave differently on standalone, so run `MONGODB_TOPOLOGY=replset npm test` for anything touching them.

---

## `spec/` layout

~135 spec files: 121 directly under `spec/` named `<SubjectUnderTest>.spec.js`, plus 14 provider adapters under `spec/Adapters/Auth/`.

| Directory | Contents |
|---|---|
| `spec/support/` | `helper.js`'s companions: `CurrentSpecReporter.js`, `jasmine.json`, mock adapters (`MockPushAdapter`, `MockEmailAdapter`, `MockDatabaseAdapter`, `MockAdapter`, `MockLdapServer`), custom-auth fixtures (`myoauth.js`, `CustomAuth.js`), `cert/` TLS certs, `lorem.txt` |
| `spec/cloud/` | Sample cloud-code files for cloud-loading tests (relative, absolute, ESM) |
| `spec/configs/` | JSON fixtures for `CLI.spec.js` |
| `spec/dependencies/` | Self-contained fake npm packages exercising `AdapterLoader` |
| `spec/Adapters/Auth/` | Per-provider OAuth adapter specs |

**Security-relevant specs:** `vulnerabilities.spec.js`, `RegexVulnerabilities.spec.js`, `ProtectedFields.spec.js`, `SecurityCheck.spec.js`, `SecurityCheckGroups.spec.js`.

---

## Specialised areas

| Area | What you need |
|---|---|
| **LiveQuery** | Nothing special - enabled by default in the test config with the in-process `EventEmitterPubSub`. `ParseLiveQuery.spec.js` uses the real client API; `ParseLiveQueryServer.spec.js` is unit-level via `jasmine.mockLibrary`. Redis-backed LiveQuery is gated behind `PARSE_SERVER_TEST_CACHE=redis` in `ParseLiveQueryRedis.spec.js` |
| **Auth adapters** | Spy on the shared HTTP helper: `spyOn(require('../lib/Adapters/Auth/httpsRequest'), 'get').and.callFake(...)`. No network, no `nock`. LDAP is the exception - `spec/LdapAuth.spec.js` boots `spec/support/MockLdapServer.js` (a real self-contained `ldapjs` server) on ports 12345/12346 |
| **Files** | Automatic per backend (GridFS on Mongo, FS on Postgres). No S3 adapter in this repo |
| **Push** | Inline mock adapter objects passed via `reconfigureServer({ push: { adapter } })`; poll `_PushStatus` with `jasmine.timeout()`. No real APNs/FCM contact |
| **Redis / rate limiting** | `PARSE_SERVER_TEST_CACHE=redis` + a real Redis on `:6379` (`docker run -p 6379:6379 redis`). Only `RedisCacheAdapter.spec.js`, `ParseLiveQueryRedis.spec.js` and part of `RateLimit.spec.js` need it; `RedisPubSub.spec.js` mocks the module |
| **Benchmarks** | `benchmark/performance.js` boots its own server on port 1337; `MongoLatencyWrapper.js` injects artificial DB latency |
