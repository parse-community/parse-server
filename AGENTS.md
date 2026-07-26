# Agent instructions

Instructions for AI coding agents working in this repository. Humans should read [CONTRIBUTING.md](CONTRIBUTING.md), which this file summarises and does not replace.

## The three rules agents get wrong

1. **Specs run against `lib/`, not `src/`.** Every spec does `require('../lib/...')`. A change to `src/` is invisible to the suite until it is compiled, so a green run on an unbuilt `lib/` proves nothing. Run `npm run build` after every `src/` edit (or leave `npm run watch` running), then `grep` the compiled file to confirm the change is in.
2. **Both database backends have to pass.** Behaviour genuinely diverges between MongoDB and Postgres, for example a registered internal field with no Postgres column returns empty instead of throwing. A MongoDB-only run is not verification for anything touching storage, queries or schemas.
3. **A change without a spec is not finished.** Add or adjust a spec that fails without the change and passes with it.

## Commands

```bash
npm install                # Node >=20.19 <21 || >=22.12 <23 || >=24.11 <25
npm run build              # babel src/ -> lib/, required before running specs
npm run watch              # same, on save

npm test                   # full suite, spins an ephemeral mongod
npm run testonly           # full suite against a mongod already listening on :27017
TESTING=1 npx jasmine spec/RestQuery.spec.js   # one spec file, TESTING=1 is required

npm run test:postgres:testonly                 # full suite against Postgres
npm run lint                                   # eslint, needs the repo's --flag, do not call npx eslint directly
npm run coverage           # coverage report at coverage/lcov-report/index.html
npm run build:types        # regenerate types/*.d.ts
npm run test:types         # lint types/tests.ts against the generated types
npm run definitions        # regenerate src/Options definitions after changing options
npm run madge:circular     # circular dependency check, CI runs this
```

Postgres needs a server with PostGIS enabled, not just a database created. CI runs PostGIS 16, 17 and 18:

```bash
docker run -d --name parse-pg -p 5432:5432 -e POSTGRES_PASSWORD=password postgis/postgis:17-3.5
docker exec parse-pg psql -U postgres -c "CREATE DATABASE parse_server_postgres_adapter_test_database;"
docker exec parse-pg psql -U postgres -d parse_server_postgres_adapter_test_database -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

## Specs

- Jasmine, config in `spec/support/jasmine.json`. `Parse` and `request` are globals and `helper.js` loads even for a single file.
- The suite runs with `random: true`, so a spec must not depend on anything another spec left behind. The harness wipes all data, clears the schema cache and removes Cloud Code hooks after every test, and reboots the default server after any test that called `reconfigureServer` with options. Create your own fixtures inside the test, and shut down any server you start yourself with `await shutdownServer(server)`.
- Running many spec files together causes state-coupling flakiness, so run the affected file in isolation for a clean signal.
- A new spec has to fail without your `src/` change and pass with it. Revert `src/`, rebuild, and watch it fail before you trust it.
- Boot a server with specific options inside a test with `await reconfigureServer({ ... })`.
- Scope by backend or version with `it_exclude_dbs(['postgres'])(...)`, `it_only_db('mongo')(...)`, `describe_only_db('postgres')(...)`, `it_only_mongodb_version('>=8')(...)`, `it_only_node_version(...)`.
- Write new specs with `async`/`await`. Older specs use `done()` callbacks and `.then()` chains, don't add more. Assert rejections with `await expectAsync(promise).toBeRejectedWith(...)` rather than `try`/`catch` plus `fail()`.
- Some specs are flaky or fail on a clean `alpha`. Known flaky ones are listed in `spec/support/CurrentSpecReporter.js` and retried automatically. Reproduce a failure on the base branch before attributing it to your change.

## Code quality

- **Keep the change in scope.** A pull request may only contain changes required to address its linked issue, because one PR is one changelog entry and one revertable commit, see [CONTRIBUTING.md](CONTRIBUTING.md#scope). Drive-by refactors, reformatting of untouched lines and opportunistic cleanups belong in their own issue and PR. If you spot something unrelated worth fixing, say so in the PR description instead of fixing it.
- **Don't deepen the Parse JS SDK dependency.** Parse Server currently imports `parse/node` in much of `src/`, which creates a circular development dependency between server and SDK, and [#8787](https://github.com/parse-community/parse-server/issues/8787) tracks removing it. New code should use internal modules where an equivalent exists rather than adding another SDK import, and should not push more server-only behaviour into the SDK.
- **TypeScript.** `src/` is mid-migration, some modules are already `.ts` (`ParseServer.ts`, `index.ts`, `logger.ts`, `LiveQuery/ParseLiveQueryServer.ts`) and the build handles both extensions. Prefer TypeScript for new modules and typed signatures over `any`. Type definitions in `types/` are generated by `npm run build:types` and must not be hand-edited, the one exception being `types/Options/index.d.ts` which is maintained manually alongside `src/Options/index.js`. Changing options also requires `npm run definitions`, which CI verifies.
- **Don't reformat what you didn't change.** `npm run prettier` rewrites whole files and will pull unrelated lines into the diff. Lint with `npm run lint` and fix only what your change introduced.
- Mocks belong in `spec/support`.
- New configuration options that can weaken a deployment need a security check, see [CONTRIBUTING.md](CONTRIBUTING.md#security-checks).

## Pull requests

- An issue is required for every pull request, reference it in the description. See [Issue vs. Pull Request](CONTRIBUTING.md#issue-vs-pull-request).
- Title syntax is `<type>: <summary>`, where type is one of `feat`, `fix`, `refactor`, `docs`, `style`, `build`, `perf`, `ci`, `test`. The title becomes the changelog entry, see [CONTRIBUTING.md](CONTRIBUTING.md#commit-message).
- Fill out the PR template rather than replacing it with a free-form summary.
- State how the change was verified, including which backends the specs were run against.

## Deeper guidance

`.claude/skills/testing-parse-server/` holds the full verification workflow, including driving a live server over REST and inspecting what actually landed in the database, plus [GOTCHAS.md](.claude/skills/testing-parse-server/GOTCHAS.md), an appendable list of traps this repo has already cost people time on. Add to it when you hit a new one.
