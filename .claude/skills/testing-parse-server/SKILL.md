---
name: testing-parse-server
description: Use when running, testing, verifying, reviewing, benchmarking or hardening a change in the parse-server repo - starting Parse Server with MongoDB/Postgres, running jasmine specs, writing specs that survive random-order isolation, hunting coverage gaps, probing edge cases, auditing security (injection, ACL/CLP bypass, prototype pollution, data exposure), checking for performance regressions or Mongo-vs-Postgres divergence, or before claiming a parse-server feature/bugfix works. Covers the "tests pass but ran against stale lib/" trap.
---

# Testing Parse Server

## Overview

Parse Server is a stable core product running in production for many organisations, with a long history of CVEs in exactly the places tests don't look. **A change is not "tested" until it has been exercised end-to-end against a real database - both MongoDB and PostgreSQL - with the change actually compiled in, attacked deliberately, and shipped with test coverage.**

A green run against stale code, against one backend, or against only the happy path is not verification. It is a green light you have not earned.

Two properties of this product raise the bar above ordinary web-app testing, and both fail *silently*:

- **Security.** Parse Server's advisory history is long and repetitive - the repo's own specs cite 28 GHSA advisories. Nothing turns red when a guard is missing from one of the several paths that need it.
- **Performance.** This runs at enterprise scale, where a millisecond added to the query path is paid on every request of every deployment, forever. Removing an "unused" optimisation produces a green suite and a production incident.

Four questions govern everything in this skill:

1. **Did the code I changed actually run?** (build, isolation, guard-proof)
2. **Did I try to break it, or only to confirm it?** (edges, negatives, security, concurrency)
3. **Does it behave the same everywhere it must?** (Mongo vs Postgres, REST vs stored, spec vs live server)
4. **What does it cost?** (complexity, benchmark vs base branch, behaviour at scale)

## Files in this skill

| File | Use it for |
|------|-----------|
| **[VERIFICATION.md](VERIFICATION.md)** | The procedure: build discipline, running specs, guard-proof, both backends, live REST, DB inspection, evidence you must produce before claiming done |
| **[ADVERSARIAL-QA.md](ADVERSARIAL-QA.md)** | Attacking your own change: coverage-gap analysis, edge/boundary matrix, consistency hunting, triage |
| **[SECURITY.md](SECURITY.md)** | 13 recurring attack primitives distilled from 28 shipped GHSA advisories, surface-by-surface probes, how to write a security spec, disclosure |
| **[PERFORMANCE.md](PERFORMANCE.md)** | Complexity review, the benchmark harness, base-branch comparison method, scale testing, the CI performance gate |
| **[REFERENCE.md](REFERENCE.md)** | Verified commands, npm scripts, env vars, harness globals, spec-scoping helpers, CI matrix, spec layout |
| **[GOTCHAS.md](GOTCHAS.md)** | Append-only log of traps already paid for. Skim before starting; append anything new you hit |

## Before you start: ask the file what it has been broken for

```bash
git log --oneline -- src/path/File.js | grep -iE "GHSA|injection|security|vulnerab"
```

Commit messages here carry GHSA ids, so this returns the attacks that have already succeeded on the lines you are editing. If it returns hits, your change is modifying a security control, not adding a feature - see [SECURITY.md](SECURITY.md).

## The Iron Law

```
TESTS LOAD lib/. EDITS LAND IN src/. NO BUILD = NO TEST.
```

Every spec does `require('../lib/...')`. Editing `src/` and running jasmine tests the *previous* build of your code. The suite goes green, you believe it, and you have verified nothing.

**After every `src/` edit: `npm run build`** (or keep `npm run watch` running), then **`grep` the compiled file to confirm your change is in `lib/`.** Not "usually" - every time, including after `git checkout`, `git stash`, rebase, or branch switch.

This is the single most common way an agent produces a confident, wrong "verified" claim in this repo.

## The rigor gate

Before claiming any `src/` change works, all eight must be true. Full procedure in [VERIFICATION.md](VERIFICATION.md).

1. **Built.** `npm run build` ran after the last edit, and `grep lib/` shows the change.
2. **Isolated.** Affected spec file(s) run alone (`random: true` makes multi-file runs state-couple). Find neighbours: `grep -rl <symbol> spec/`.
3. **Guard-proofed.** The new spec *fails* without the change. A spec that passes both ways tests nothing.
4. **Baselined.** Any failure reproduced on clean `alpha` before being blamed on your diff.
5. **Both backends.** Mongo *and* Postgres. Behaviour genuinely diverges.
6. **Attacked.** Negative paths and edges ([ADVERSARIAL-QA.md](ADVERSARIAL-QA.md)) and the reachable attack primitives ([SECURITY.md](SECURITY.md)) - not just the happy path.
7. **Costed.** Complexity reviewed, and benchmarked against the base branch if it is on a hot path ([PERFORMANCE.md](PERFORMANCE.md)).
8. **Covered + clean.** A spec that guards this going forward, plus `npm run lint`.

## What your change type demands

Do not apply the same ceremony to every diff. Pick the row, do everything in it.

| Change type | Required verification |
|---|---|
| Pure refactor, no behaviour change | Build → affected specs isolated → both backends if the code is adapter-adjacent → lint |
| Bug fix | Everything above **+** reproduce the symptom on a live server *before* the fix, guard-proof the new spec, confirm gone after |
| New feature / endpoint | Everything above **+** live REST exercise, DB state inspection, negative + permission tests, docs/definitions if options changed |
| Query / where-clause / operator handling | **+** injection probes (operator smuggling, regex, dot-notation field names, prototype-pollution keys), both backends mandatory ([SECURITY.md](SECURITY.md)) |
| ACL / CLP / protectedFields / session / auth | **+** full permission matrix: anonymous, wrong user, right user, role member, master key, read-only master key, maintenance key ([SECURITY.md](SECURITY.md)) |
| Anything reachable from LiveQuery, GraphQL or `/batch` | **+** verify the guard exists on *every* path, not just REST - the shape of several past advisories |
| Schema / storage adapter | **+** both backends mandatory, stored-shape inspection, migration/existing-data path |
| Transactions, change streams, LiveQuery | **+** replset topology (`MONGODB_TOPOLOGY=replset`) - standalone will not exercise the path |
| Options (`src/Options/`) | **+** `npm run definitions`, `npm run build:types`, `npm run test:types`, `npm run ci:definitionsCheck`; is the default the safe one? |
| Hot path (query, ACL application, cache, triggers, transforms) | **+** complexity review and a base-branch benchmark comparison ([PERFORMANCE.md](PERFORMANCE.md)) |
| Removing code that "looks unused" | **+** prove it is not an optimisation or a live guard. Highest-risk category in this repo - [PERFORMANCE.md](PERFORMANCE.md) and [GOTCHAS.md](GOTCHAS.md) |
| Any performance claim ("faster", "no regression") | **+** measured evidence against the base branch on the same data ([PERFORMANCE.md](PERFORMANCE.md)) |
| Security fix | **+** everything, plus a spec that reproduces the exploit and fails without the fix; put it in `spec/vulnerabilities.spec.js` and name the GHSA id |

## Quick reference

Full list in [REFERENCE.md](REFERENCE.md).

```bash
# Build (after EVERY src/ edit) — or leave `npm run watch` running
npm run build && grep -n "myChange" lib/path/File.js

# One spec file, MongoDB (needs a mongod on :27017)
TESTING=1 npx jasmine spec/RestQuery.spec.js

# One spec, no mongod running — let mongodb-runner supply one
npm test spec/RestQuery.spec.js

# Narrow to specific tests inside a file (jasmine 5.7 supports --filter)
TESTING=1 npx jasmine spec/RestQuery.spec.js --filter="internal field"

# Same spec against Postgres (needs PostGIS + extensions; see REFERENCE.md)
TESTING=1 PARSE_SERVER_TEST_DB=postgres \
  PARSE_SERVER_TEST_DATABASE_URI=postgres://postgres:password@localhost:5432/parse_server_postgres_adapter_test_database \
  npx jasmine spec/RestQuery.spec.js

# See what the server is doing during a spec (VERBOSE for logs; LOG_LEVEL=debug for the Postgres SQL tracer)
VERBOSE=1 TESTING=1 npx jasmine spec/X.spec.js
PARSE_SERVER_LOG_LEVEL=debug TESTING=1 PARSE_SERVER_TEST_DB=postgres npx jasmine spec/X.spec.js

# Full suites
npm test                        # Mongo, ephemeral mongod
npm run testonly                # Mongo, existing mongod on :27017
npm run test:postgres:testonly  # Postgres
MONGODB_TOPOLOGY=replset npm test   # what CI actually runs

# Lint (the bare `npx eslint file.js` form produces bogus errors — see GOTCHAS.md)
npm run lint
```

## Performance is a correctness property here

A correctness test at small N says nothing about cost, and cost is what enterprise deployments pay. Full method in **[PERFORMANCE.md](PERFORMANCE.md)**; the short version:

- **Read the diff for complexity before benchmarking.** O(n)→O(n²), a query moved inside a loop (N+1), a limit/sort pushdown replaced by fetch-all-and-filter, a query shape that drops an index. A benchmark at small N cannot see any of these.
- **Never remove an optimisation because it looks like dead code.** Removing one pushdown measured ~10-15× slower at 50k members. Prove it is unused before deleting it.
- **A claim needs a paired measurement** against the base branch, same machine, same data, medians not means. "Reads are bounded so it's fine" is a hypothesis.
- **Measure with latency and at scale.** Localhost hides added round trips (`dbLatency` in the harness exposes them); N=10 hides curve changes.
- CI compares PR vs base benchmarks and **fails the job on any regression over 25%** - but only for operations that *have* a benchmark. No red mark is not evidence of no regression.

## Red flags - stop and go back

Each of these means the verification is not done, regardless of what the terminal printed:

- "The tests passed" - but you did not run `npm run build` after your last edit
- "I ran the full suite" - a failure scrolled past, or you piped through `| tail`
- "The spec passes" - but you never checked it fails without the change
- "It works on Mongo" - and the change touches queries, schema, or the adapter layer
- "It's just a refactor" - and you skipped the isolated spec run
- "A spec exercises that function" - but you never drove it over real HTTP
- "The REST response looks right" - and you never looked at what was stored
- "No new spec, the existing ones cover it" - then guard-proof it: they pass without your change too
- "This failure is pre-existing" - asserted, not reproduced on clean `alpha`
- "It's faster" - measured at N=10, in-process, or without a base-branch comparison
- "No performance impact" - asserted from reading the diff, on a hot path, with no number
- "This code looks unused" - deleting an optimisation or a legacy guard without proving it is dead
- "The REST path is protected" - and you never checked LiveQuery, GraphQL, `/batch` or the direct DB path
- "It validates the input" - and you only tried top-level keys, not nested or dot-notation
- "It rejected the attack" - but you asserted *that* it rejected, not the specific error, so it may reject for the wrong reason
- Reaching for `it_id` exclusion or the flaky-retry list to make your spec pass - it isn't isolated; fix that instead

## Common mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Edit `src/`, run tests without building | Tests run stale `lib/` - green means nothing | `npm run build` (or `npm run watch`); `grep lib/` to confirm |
| Only test MongoDB | Postgres-specific behaviour untested (no-column fields, SQL, regex escaping) | Run the spec with `PARSE_SERVER_TEST_DB=postgres` |
| Only test standalone Mongo | Transaction / change-stream / LiveQuery paths differ, and CI's two version-matrix jobs run replset | `MONGODB_TOPOLOGY=replset npm test` |
| Run many spec files together to "save time" | Random-order state coupling → phantom failures | Run the affected file(s) in isolation |
| Blame a failure on your diff immediately | Time wasted on a pre-existing/flaky failure | Reproduce on clean `alpha` in a worktree first |
| New spec never checked against old code | The spec may not test the change at all | Guard-proof: revert `src/`, rebuild, watch it fail |
| Rely on data another spec created | Passes alone, fails in random order | Create fixtures inside the test |
| Test only the happy path | Ships the bug in the error/permission path | Work [ADVERSARIAL-QA.md](ADVERSARIAL-QA.md) |
| Validate only top-level keys | Dot-notation and nested keys bypass it - 5 advisories live here | Probe nested + `a.b` forms ([SECURITY.md](SECURITY.md)) |
| Fix the REST path only | LiveQuery/GraphQL/batch keep the vulnerability | Add the guard and a spec to every path |
| Delete "dead" code on inspection | It may be an optimisation or a live legacy guard | Prove it, and benchmark ([PERFORMANCE.md](PERFORMANCE.md)) |
| Trust the REST response as "what's stored" | Miss leaked/mis-stored internals (`_p_*`, `_rperm`, `_hashed_password`) | Inspect the raw DB before & after |
| Assert only via specs, never drive it | Behavioural bugs slip past the spec harness | Boot a live server, POST/PUT/GET/DELETE, observe DB |
| Hand-edit `types/*.d.ts` | Overwritten on next generation | `npm run build:types`; only `types/Options/index.d.ts` is manual |
| `npx eslint file.js` directly | Bogus "'expect' is not defined" errors | `npm run lint`, or add `--flag unstable_config_lookup_from_file` |
| `prettier --write` on a touched file | Reformats unrelated lines into your diff | Fix only what your change introduced |
| Pipe a long run through `\| tail -N` | Failure details discarded, only the summary survives | Capture full output to a file, grep it afterwards |

## Reporting results

State what you ran, on what, and what it printed. Never soften a failure and never generalise a partial run.

- ✅ "Built, then `TESTING=1 npx jasmine spec/RestQuery.spec.js` → 42 specs, 0 failures. Same file on Postgres → 40 specs, 2 excluded (`it_exclude_dbs`), 0 failures. Guard-proof: reverted `src/`, rebuilt, new spec failed as expected."
- ❌ "Tests pass." / "Verified working." / "Should be fine now."

If something was not run - Postgres, replset, the live server - say so explicitly rather than letting silence imply coverage.
