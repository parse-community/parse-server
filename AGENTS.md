# Agent instructions

Instructions for AI coding agents working in this repository. Humans should read [CONTRIBUTING.md](CONTRIBUTING.md), which this file summarises and does not replace.

## What Parse Server is

Parse Server is an open source backend, an express module providing a Parse-compatible API server. Applications talk to it through the Parse client SDKs over REST, GraphQL and a WebSocket protocol (LiveQuery), and it persists their data to MongoDB or PostgreSQL. It is not an application, it is infrastructure other people deploy and run in production, so backward compatibility, security and performance are correctness properties here rather than nice-to-haves. See the [README](README.md) and the [Parse Server guide](https://docs.parseplatform.org/parse-server/guide/) for the product-level picture.

Development happens on `alpha`, which is the default branch and the one to target. Changes flow `alpha` → `beta` → `release`, with LTS on `release-#.x.x`.

The concepts the code assumes you already know:

- **Classes and objects.** A class is a collection of schema-ed objects, reached at `/parse/classes/<ClassName>`. Classes beginning with `_` are system classes: `_User`, `_Installation`, `_Role`, `_Session`, `_Product`, `_PushStatus`, `_JobStatus`, `_JobSchedule`, `_Audience`, `_Idempotency` (`src/Controllers/SchemaController.js`). They mostly flow through the same write and query path as any other class, with extra rules layered on.
- **Authorization has two independent layers.** Per-object **ACLs**, stored as `_rperm`/`_wperm` arrays, and per-class **CLPs** validated by `SchemaController.validatePermission`. On top of those, `protectedFields` hides named fields from readers. All three must be enforced on every path that can reach data, not just the obvious one.
- **Keys.** The **master key** bypasses ACL and CLP entirely, so a test that only uses it proves nothing about authorization. There are also a read-only master key, a maintenance key, and per-user **session tokens**.
- **Cloud Code.** User-supplied `beforeSave`/`afterSave`/`beforeFind`/`afterFind` triggers, invoked from `src/triggers.js`, run inside the request path and can change what the rest of the pipeline sees.
- **Adapters.** Storage, files, cache, email, push, pub/sub and analytics are all pluggable behind adapter interfaces in `src/Adapters/`, which is why behaviour can differ per backend.
- **Stored shape is not REST shape.** Pointers are stored as `_p_<field>`, ACLs as `_rperm`/`_wperm`, passwords as `_hashed_password`. Inspect the database, not just the response, when verifying a change.

## How a request flows

Almost everything funnels through one chain, which is why a guard added in a single router usually is not enough:

```
express app (src/ParseServer.ts)
  -> middlewares (src/middlewares.js): CORS, body parsing, handleParseHeaders (validates keys, builds req.config),
     rate limiting, handleParseSession (resolves req.auth from the session token)
  -> PromiseRouter (src/PromiseRouter.js) -> the feature router (src/Routers/*.js, e.g. ClassesRouter)
  -> src/rest.js, the thin dispatch layer
  -> RestWrite.js / RestQuery.js, which run the ordered pipeline: ACL/role resolution, class-creation and schema
     validation, Cloud Code triggers, then the database operation
  -> DatabaseController (src/Controllers/DatabaseController.js): schema load, CLP check, protectedFields
  -> storage adapter (src/Adapters/Storage/Mongo|Postgres), with MongoTransform.js converting
     Parse objects to and from stored documents
  -> handleParseErrors formats the response
```

`/batch`, GraphQL and LiveQuery are separate entry points that reach the same data, so a change to the REST path frequently needs the equivalent treatment in `src/GraphQL/` and `src/LiveQuery/`.

## Where things live

| Path | Contents |
|---|---|
| `src/Routers/` | One router per endpoint group (`ClassesRouter`, `UsersRouter`, `FilesRouter`, `SchemasRouter`, …) |
| `src/RestWrite.js`, `src/RestQuery.js`, `src/rest.js` | The write and read pipelines every class operation goes through |
| `src/Controllers/` | Service layer: `DatabaseController`, `SchemaController`, `UserController`, `FilesController`, `PushController`, … |
| `src/Adapters/` | Pluggable backends, including the Mongo and Postgres storage adapters |
| `src/LiveQuery/`, `src/GraphQL/` | The realtime WebSocket server and the generated GraphQL API |
| `src/Options/` | Server option definitions, parsers and docs. Generated, see `npm run definitions` |
| `src/Security/` | The Security Checks feature that audits a deployment's configuration |
| `src/triggers.js`, `src/Auth.js`, `src/middlewares.js` | Cloud Code dispatch, authentication, and the express middleware chain |
| `spec/` | The jasmine suite, with helpers and fixtures in `spec/support/` |
| `lib/` | Build output, gitignored. Never edit it, edit `src/` and rebuild |
| `types/` | Generated type definitions, committed but not hand-edited, see `npm run build:types` |

## The three rules agents get wrong

1. **Specs run against `lib/`, not `src/`.** Every spec does `require('../lib/...')`. A change to `src/` is invisible to the suite until it is compiled, so a green run on an unbuilt `lib/` proves nothing. Run `npm run build` after every `src/` edit (or leave `npm run watch` running), then `grep` the compiled file to confirm the change is in.
2. **Both database backends have to pass.** Behaviour genuinely diverges between MongoDB and Postgres, for example a registered internal field with no Postgres column returns empty instead of throwing. A MongoDB-only run is not verification for anything touching storage, queries or schemas.
3. **A change without a spec is not finished.** Add or adjust a spec that fails without the change and passes with it.

## Scope

An issue and a pull request must be limited to one distinct concern, and a pull request may contain only the changes required to address its linked issue, see [CONTRIBUTING.md](CONTRIBUTING.md#scope). Keep pull requests small; large ones will be rejected, and a complex feature should be split into several incremental pull requests.

The reasons are worth knowing, because they are what make the rule stick:

- A pull request is one changelog entry, and one entry should not have to describe several unrelated changes.
- A pull request is one commit. Per-concern commits are what make the history usable when someone is bisecting a bug a year from now.
- If a pull request has to be reverted, unrelated changes are reverted with it, which risks publishing a broken release or needing a follow-up fix.

**This overrides the instinct to fix everything you find, and agents violate it more than humans do.** General coding guidance often says that when you find a bug you should find the whole cluster and fix it. In this repository the first half is right and the second half is wrong. Noticing that a bug has three sibling instances is valuable; fixing all three in one pull request is not. Fix the one in scope, and report the others in the pull request description or as new issues.

Concretely, and regardless of how small the change looks: no drive-by refactors, no opportunistic cleanups, and no reformatting of lines you did not otherwise change.

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

Task-specific workflows:

- [adding-a-server-option](.claude/skills/adding-a-server-option/SKILL.md) — the most repeated change in this repo. `src/Options/index.js` is the only file you edit by hand; two are generated and CI checks you regenerated them, one type definition is manually maintained, and a security-relevant option needs a security check.
- [changing-behaviour-safely](.claude/skills/changing-behaviour-safely/SKILL.md) — deciding whether a change is breaking, avoiding the break where possible, keeping the client SDKs and the REST/GraphQL/LiveQuery/batch surfaces consistent, and the deprecation mechanism when a break is justified.

`.claude/skills/testing-parse-server/` holds the full verification workflow, split by concern:

- [SKILL.md](.claude/skills/testing-parse-server/SKILL.md) — start here: the build-before-test rule, the rigor gate, and which verification each type of change actually demands.
- [VERIFICATION.md](.claude/skills/testing-parse-server/VERIFICATION.md) — the procedure, including guard-proofing a spec against the unfixed code, running both backends, driving a live server over REST and inspecting what actually landed in the database.
- [SECURITY.md](.claude/skills/testing-parse-server/SECURITY.md) — the recurring attack primitives behind this repo's past advisories, mapped to the surfaces they apply to, and how to write a security spec.
- [PERFORMANCE.md](.claude/skills/testing-parse-server/PERFORMANCE.md) — complexity review, the benchmark harness, and comparing against the base branch before claiming a performance result.
- [ADVERSARIAL-QA.md](.claude/skills/testing-parse-server/ADVERSARIAL-QA.md) — finding coverage gaps, probing edges, and hunting inconsistencies between backends and API paths.
- [REFERENCE.md](.claude/skills/testing-parse-server/REFERENCE.md) — commands, environment variables, spec harness globals and the CI matrix.
- [GOTCHAS.md](.claude/skills/testing-parse-server/GOTCHAS.md) — an appendable list of traps this repo has already cost people time on. Add to it when you hit a new one.
