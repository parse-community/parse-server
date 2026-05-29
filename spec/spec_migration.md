# Test Suite Migration Plan: REST-First, Modular, TypeScript

**Status:** Proposed
**Date:** 2026-05-20
**Scope:** `spec/` (≈135 spec files, ≈100k lines)

---

## 1. Goals

1. **REST-first.** Tests exercise Parse Server through its public HTTP API, not the
   Parse JS SDK. The SDK is a *separate product*; coupling the server's test suite to
   it hides REST regressions, pins us to SDK behaviour/versions, and means SDK bugs
   masquerade as server bugs.
2. **Modular & reorganised.** Replace the flat directory of giant files with a
   domain-based tree of focused files (target ≤ ~500 lines each).
3. **Higher code quality.** Eliminate the `done()` callback style, arbitrary
   `setTimeout` timing, missing cleanup, dead/skipped tests, and per-file boilerplate
   duplication.
4. **TypeScript.** The new shared test helpers (and, over time, the specs) are written
   in TypeScript with real types, so the test client is self-documenting and
   editor-checked.

## 2. Non-Goals

- Rewriting the suite in a single "big bang" — migration is **incremental and in-place**.
- Changing the test runner (we stay on **Jasmine** + `mongodb-runner`).
- Changing what is tested (coverage must be preserved or improved, never silently dropped).
- Eliminating WebSockets — **LiveQuery** is a WebSocket protocol with no REST equivalent
  and is handled with a dedicated WS test client (see §5.3).

---

## 3. Current State (baseline)

Measured at the time of writing — re-measure before starting to confirm.

| Signal | Value |
|---|---|
| Spec files | ~135 (`spec/**/*.spec.js`) |
| Files using `done()` | 78 |
| Total `done()` usages | ~2,090 |
| `setTimeout` instances | ~74 |
| `xit` / `fit` (disabled/focused) tests | ~29 |
| Files with **no** `afterEach`/`afterAll` | ~80 |
| Files mixing SDK **and** raw `request()` | 42 |
| Largest files | `ParseGraphQLServer.spec.js` (12,264), `ParseQuery.spec.js` (5,568), `CloudCode.spec.js` (5,067), `ParseUser.spec.js` (4,618), `schemas.spec.js` (3,882) |

**Runner facts that constrain the plan:**

- `spec/support/jasmine.json`: `spec_dir: "spec"`, `spec_files: ["**/*.[sS]pec.js"]`,
  `helpers: ["helper.js"]`, `random: true`.
- Specs run as **plain `.js` under Node** — there is **no runtime transpile hook today**.
  `babel.config.js` already includes `@babel/preset-typescript`, but it is only used for
  the `src/ → lib/` build, not for running specs.
- `spec/helper.js` (677 lines) provides globals: the `Parse` SDK instance,
  `reconfigureServer`, `createTestUser`, `TestObject`/`Item`/`Container`, fetch mocks,
  and DB-skip macros (`it_exclude_dbs`, `it_only_db`, `describe_only_db`, version gates).
- `lib/request.js` is the low-level HTTP client already used by 52 specs.

---

## 4. Decisions (confirmed)

| Decision | Choice |
|---|---|
| Roll-out | **Incremental, in-place** — convert files where they live, reorganise directories as part of each migration. |
| Server access | **New typed REST test client** wrapping `lib/request.js`. |
| SDK | **Eliminate the Parse JS SDK** from all HTTP-level tests. Retain only a thin WS client for LiveQuery (not the SDK's LiveQuery client). |
| Quality | **Full cleanup bundled into each file's migration** — async/await, no `setTimeout` timing, cleanup hooks, monolith splitting, eslint tightening, `xit`/`fit` triage. |
| Language | **TypeScript** for helpers/clients (and incrementally for specs). |
| Layout | **Domain-based** directory tree. |

---

## 5. Target Architecture

### 5.1 TypeScript in specs — the enabling change

Add a single runtime transpile hook so Jasmine can load `.ts` helpers and specs:

- New file `spec/support/tsRegister.js` (plain JS — it is the bootstrap):
  ```js
  require('@babel/register')({
    extensions: ['.ts', '.js'],
    only: [/[\\/]spec[\\/]/],    // never transpile node_modules / lib
    cache: true,
  });
  ```
- `spec/support/jasmine.json`:
  - add `tsRegister.js` as the **first** helper (must run before `helper.js`),
  - widen `spec_files` to `["**/*.[sS]pec.[jt]s"]` so `.ts` specs are discovered,
  - keep `random: true`.

Babel config lives in `.babelrc` (repo root) and `spec/.babelrc`; the latter already
declares `@babel/preset-typescript`, and Babel auto-resolves it for any file under
`spec/`. So the hook needs **no** inline presets and **no** Babel config change — type
*stripping* is already covered. Type-*checking* (not just stripping) runs separately via a
`tsc --noEmit` lint step over `spec/` (see §8, Phase 0).

> Rationale: this keeps the runner unchanged, requires no precompile step, and lets
> `.js` and `.ts` specs coexist during the long incremental migration.

### 5.2 The REST test client (`spec/helpers/`)

A small, typed layer over the native `fetch` API (Node 18+). **No Parse SDK and no
parse-server internals** — true black-box REST. Each function returns typed parsed
responses and rejects with a typed error (carrying Parse `code` + `error`) on non-2xx,
since `fetch` only rejects on network failures. Reads the global `fetch` dynamically so it
stays compatible with `helper.js`'s `mockFetch` (which passes our server URLs through).

```
spec/helpers/
  request.ts          # typed fetch wrapper (status/headers/data) + expectParseError
  headers.ts          # header builders: appId, restKey, clientKey, masterKey,
                      #   sessionToken, masterKey-via-X-Parse-Master-Key, etc.
  client.ts           # ParseRestClient: createObject/getObject/updateObject/
                      #   deleteObject/find/aggregate/batch/runFunction/...
  users.ts            # signUp/logIn/logOut/me/requestPasswordReset over REST
  schema.ts           # schema GET/POST/PUT/DELETE helpers
  files.ts            # file upload/get/delete over REST
  fixtures.ts         # factories: makeUser(), makeObjects(n), makeRole() — REST-based
  reconfigure.ts      # reconfigureServer extracted & typed
  wsClient.ts         # LiveQuery WebSocket test client (see 5.3)
  index.ts            # global Jasmine setup (the slimmed successor to helper.js)
```

Design constraints (per repo CLAUDE.md / SOLID):
- One responsibility per module; the client is composed from small focused pieces.
- Public functions accept an explicit, typed options object — no hidden globals.
- Errors are explicit: helpers expose `expectParseError(promise, code)` rather than
  swallowing failures.
- No magic strings: app keys, URLs, default credentials come from a single typed
  `config.ts` constants module.

**Example shape (illustrative):**
```ts
export interface ParseObjectResponse { objectId: string; createdAt: string; }

export async function createObject(
  className: string,
  data: Record<string, unknown>,
  auth: AuthHeaders = masterKey(),
): Promise<ParseObjectResponse> { /* wraps request() POST /classes/:className */ }
```

### 5.3 LiveQuery / WebSocket client

LiveQuery has no REST surface. Provide `spec/helpers/wsClient.ts` — a minimal typed
WebSocket client that speaks the LiveQuery protocol (connect / subscribe / unsubscribe
and event assertions via awaited promises, **not** `setTimeout`). LiveQuery specs use
this instead of the SDK's `Parse.LiveQueryClient`.

### 5.4 Directory taxonomy (target)

```
spec/
  support/            # jasmine.json, tsRegister.js, reporters, adapter mocks
  helpers/            # typed clients & fixtures (§5.2)
  rest/
    objects/          # CRUD, batch, pointers, relations, data types
    query/            # split of ParseQuery.spec.js by concern (filtering, ordering,
                      #   pagination, includes, geo, aggregation, regex/security)
    users/            # signup, login, sessions, password reset, auth data
    files/
    schema/
  cloud/              # Cloud Code: beforeSave/afterSave/.../functions/jobs/validators
  auth/               # auth adapters (OAuth, LDAP, custom, V2)
  graphql/            # split of ParseGraphQLServer.spec.js (12k) by type/operation
  livequery/          # WebSocket-based, uses wsClient.ts
  server/             # config, CLI, middleware, security, deprecation, idempotency
  adapters/           # storage / cache / push / email adapter unit tests
```

Monolith splits are by **concern within the domain**, e.g.
`ParseQuery.spec.js` → `rest/query/{filtering,ordering,pagination,includes,geo,regex}.spec.ts`.

---

## 6. Per-File Migration Checklist (the quality bar)

Every file migrated must satisfy **all** of the following before its old version is deleted:

- [ ] Moved to its domain directory (§5.4) and renamed `.spec.ts`.
- [ ] **No Parse JS SDK** import (`parse/node`) — all server interaction via REST client
      (or `wsClient` for LiveQuery). SDK-specific assertions re-expressed as REST/header
      assertions.
- [ ] Every `it`/`beforeEach`/`afterEach` is `async` + `await`; **zero `done()`**.
- [ ] **No `setTimeout`-based timing.** Replace with awaited conditions / polling helper
      / WS event promises. (Genuine "wait for TTL to elapse" cases use a named, documented
      `advanceClock`/`waitFor` helper, not a bare magic number.)
- [ ] `afterEach` cleanup where the test creates server-side state not covered by the
      global DB wipe (hooks, config, spies, schema).
- [ ] No shared mutable module-level state leaking across `it` blocks.
- [ ] Magic numbers named/explained or sourced from `config.ts`.
- [ ] Setup boilerplate replaced by `fixtures.ts` factories.
- [ ] `xit`/`fit` triaged: each is either fixed & enabled, or deleted with a one-line
      rationale in the PR (no silent skips carried over). Tracked in a migration log.
- [ ] File ≤ ~500 lines (split if larger); `describe` blocks reflect concerns, not just
      hook types.
- [ ] Passes the tightened spec eslint config and `tsc --noEmit`.

---

## 7. Conventions & Standards (new)

- **eslint for specs** (`spec/eslint.config.js`): re-enable `no-unused-vars`,
  `require-atomic-updates`; add `no-restricted-imports` banning `parse/node` outside
  `spec/helpers/wsClient.ts`-style exceptions; keep the existing `no-restricted-syntax`
  rules. Add `@typescript-eslint` rules consistent with `src/` (no `any`).
- **Naming:** `domain/concern.spec.ts`; `describe('<feature> via REST', ...)`.
- **One assertion concept per test**, descriptive titles, no `equal()`-style helper
  aliases — use Jasmine matchers directly.
- **Determinism:** no order dependence (suite already runs `random: true`); no real time
  waits.

---

## 8. Phasing & Sequencing

Each phase is independently shippable and reviewable.

**Phase 0 — Infrastructure (no test behaviour change).**
- Add `@babel/register` hook + `tsRegister.js`; widen `spec_files` glob.
- Add `tsc --noEmit` lint over `spec/` and wire into `ci:check`.
- Land tightened spec eslint config in **warn** mode first.
- Acceptance: existing `.js` specs still pass unchanged; a trivial throwaway `.ts` spec runs.

**Phase 1 — Helpers & clients.**
- Build `spec/helpers/*` (REST client, headers, fixtures, reconfigure, config, wsClient).
- Port the global `helper.js` setup into typed `spec/helpers/index.ts` (keep `helper.js`
  as a thin shim re-exporting it until all specs move).
- Unit-test the REST client itself against a running server.
- Acceptance: clients have their own green specs; old suite untouched.

**Phase 2 — Pilot domain: `rest/objects/`.**
- Migrate object CRUD/batch specs end-to-end as the reference implementation.
- Establish the review template and the migration log.
- Acceptance: pilot files meet the §6 checklist; reviewers sign off on the pattern.

**Phase 3 — Domain-by-domain migration** (ordered by value/risk):
1. `rest/objects`, `rest/query` (largest behaviour surface)
2. `rest/users`, `auth`
3. `cloud`
4. `rest/schema`, `rest/files`, `server`
5. `graphql` (split the 12k-line monolith)
6. `livequery` (WS client)
7. `adapters` (mostly unit; least SDK coupling)

One domain per PR (or per-file PRs within a domain for the big ones). Old file deleted in
the same PR that lands its replacement, so coverage never forks.

**Phase 4 — Enforcement & cleanup.**
- Flip spec eslint + `no-restricted-imports` (ban `parse/node`) to **error**.
- Remove the `helper.js` shim; delete dead support files.
- Update CONTRIBUTING/test docs to describe the REST-first pattern.
- Acceptance: zero `parse/node` imports outside the sanctioned WS exception; zero `done()`;
  CI green.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Coverage silently dropped during port | nyc coverage diff per PR; migration log lists every deleted/skipped test with reason; old file deleted only in the same PR as its replacement. |
| Long-lived `.js`/`.ts` coexistence causes confusion | Phase 0 makes both run; lint ban on `parse/node` flips to error only in Phase 4; clear "migrated domains" tracker. |
| `@babel/register` slows test startup | `cache: true` + `only: [/spec\//]`; measure startup before/after in Phase 0. |
| LiveQuery WS client under-tested | Build & self-test `wsClient.ts` in Phase 1 before any LiveQuery spec depends on it. |
| Hidden SDK behaviour (e.g. client-side validation) had no REST equivalent | Audit during port; where the SDK was the actual subject (e.g. `ClientSDK.spec.js` = `X-Parse-Client-Version` parsing), re-express as explicit header tests. |
| Flaky tests masked by current auto-retry reporter | Removing `setTimeout` timing should reduce flakiness; keep `CurrentSpecReporter` retry during migration, then review its flaky-list afterwards. |
| Scope creep into `src/` refactors | Strictly out of scope; behaviour changes to `src/` are separate PRs. |

---

## 10. Success Criteria

- 0 `parse/node` imports in `spec/` outside the sanctioned WS helper.
- 0 `done()` callbacks; 0 timing-based `setTimeout` in specs.
- No spec file > ~500 lines; monoliths split by concern.
- All `xit`/`fit` resolved (fixed or removed with rationale).
- Spec eslint + `tsc --noEmit` enforced in CI.
- Coverage ≥ pre-migration baseline.

---

## 11. Open Questions / To Confirm Before Phase 3

- Per-file PRs vs per-domain PRs for the largest domains (`query`, `graphql`) — pick based
  on review bandwidth.
- Whether to convert specs to `.ts` immediately on migration or land as `.js`-on-REST first
  and TS-ify in a fast follow (recommended: `.ts` immediately, since the file is already
  being rewritten).
- Final disposition of the auto-retry flaky reporter after migration.
```
