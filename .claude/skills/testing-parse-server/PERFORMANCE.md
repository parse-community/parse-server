# Performance verification

Parse Server runs in production for enterprises at scale. A regression here is not a code-quality problem, it is a **cost and availability problem for real deployments**: a millisecond added to the query path is paid on every request, by every app, forever. Regressions also arrive silently - nothing fails, nothing turns red locally, and the cost shows up in someone else's infrastructure bill.

So performance is treated exactly like correctness in this repo: **claims require evidence, and evidence requires method.** CI enforces this on every PR (`.github/workflows/ci-performance.yml`).

---

## When performance work is mandatory

Not every diff needs a benchmark. These do:

| Trigger | Why |
|---|---|
| You claim "faster", "no regression", "parity", "negligible", "bounded" | A claim without a measurement is a guess |
| You changed the **query path** | `RestQuery`, `DatabaseController`, `MongoTransform`, `PostgresStorageAdapter` - every request pays it |
| You changed **auth / ACL / CLP / protectedFields application** | Runs per object, per request |
| You changed the **schema cache**, config cache, or any cache | Cache misses multiply into DB load |
| You changed **triggers** (`beforeSave`/`afterFind`) or the object transform layer | Runs per object |
| You **removed an optimisation** ("this looks like dead code", "simplify this") | The single highest-risk category. See the pushdown case in [GOTCHAS.md](GOTCHAS.md) |
| You added work **inside a loop** over objects, keys, or results | Constant factor becomes O(n) cost |
| You added a DB round trip | Latency, not CPU, dominates real deployments |
| You touched file upload/download or LiveQuery fan-out | Throughput and memory paths |

If your change is on this list, the burden is on you to show the number, not on the reviewer to suspect one.

---

## Step 1 - Reason about complexity BEFORE measuring

A benchmark at small N cannot see an algorithmic regression. Read the diff for complexity first, because that is the class of defect that costs enterprises real money:

- **Did an O(1) become O(n), or an O(n) become O(n²)?** Nested loops over results, `Array.includes` inside a `map`, `Object.keys` inside a per-object loop.
- **Did a single query become N queries?** (N+1) Any DB call moved inside a loop over results, includes, or pointers.
- **Did a bounded fetch become unbounded?** Replacing a limit/sort pushdown with "fetch all, filter in JS" is the classic Parse Server regression - it looks cleaner and is catastrophically slower at scale. Measured at ~10-15× slower on a 50k-member relation, scaling linearly.
- **Did an index stop being used?** Changing a query shape, adding a `$or`, or altering sort keys can silently drop index usage. Verify with `explain`.
- **Did work move from startup to per-request?** A regex compiled, a schema fetched, or a config parsed per request instead of once.
- **Did a cache lookup become a cache miss?** Changing a cache key shape invalidates the cache without any test failing.

Then confirm with the DB itself rather than intuition:

```bash
# Mongo: is the index still used? Look for IXSCAN vs COLLSCAN.
mongosh mongodb://localhost:27017/dev --quiet --eval \
  'db.GameScore.find({name:"a"}).explain("executionStats").executionStats'

# Postgres: check the plan for Seq Scan on a table that should use an index.
docker exec parse-postgres psql -U postgres -d parse_server_postgres_adapter_test_database \
  -c 'EXPLAIN ANALYZE SELECT * FROM "GameScore" WHERE "name" = ''a'';'
```

A complexity regression found by reading costs minutes. Found by a production customer, it costs far more.

---

## Step 2 - Use the repo's benchmark harness

`benchmark/performance.js` boots its own real Parse Server (port 1337, appId `benchmark-app-id`) and is the same harness CI uses, so results are comparable to the gate.

```bash
npm run benchmark:quick    # BENCHMARK_ITERATIONS=10 — smoke test that it runs at all
npm run benchmark          # full run (mongodb-runner supplies the DB)
npm run benchmark:only     # assumes a mongod is already on :27017
```

| Env var | Effect |
|---|---|
| `BENCHMARK_ITERATIONS` | Overrides every benchmark's iteration count |
| `MONGODB_URI` | Default `mongodb://localhost:27017/parse_benchmark_test` |

**What the harness already does for you** (do not hand-roll these):

- **Warmup**: 20% of iterations run before measurement, discarding JIT and connection-pool warmup effects. Skippable with `skipWarmup`.
- **Outlier filtering**: interquartile range, dropping anything outside `Q1 - 1.5·IQR` … `Q3 + 1.5·IQR`.
- **Median (p50) as the primary metric**, with p95/p99 and the retained sample count (`n=filtered/total`) reported alongside. Median is used precisely because means are unstable under background load.
- **`measureMemoryOperation`** measures **GC pressure** rather than time - use it for allocation-heavy paths.
- **`MongoLatencyWrapper`** (`dbLatency` option) injects artificial DB latency, so you can see how a change behaves when the database is not on localhost. **Real deployments have network latency; your laptop does not.** A change that adds a round trip looks free locally and costs 5-50ms in production. Use `dbLatency` to expose it.

`npm run benchmark:quick` at 10 iterations proves the benchmark *runs*. It does not prove a performance claim - the sample is far too small.

### Adding a benchmark

Follow the existing patterns in `benchmark/performance.js`:

```js
async function benchmarkNewFeature() {
  return measureOperation({
    name: 'Feature Name',
    operation: async () => { await someOperation(); },
    iterations: 1_000,          // fewer for expensive operations
    // dbLatency: 20,           // optionally simulate a remote database
  });
}
```

Per CONTRIBUTING's guidelines: one well-defined operation per benchmark, realistic data, `cleanupDatabase()` between runs, iteration count matched to operation cost, and a comment explaining what it measures and why it matters.

Output is formatted for `github-action-benchmark`, which is what makes the CI comparison work - do not change the shape.

---

## Step 3 - Compare against the base branch, on the same data

The only meaningful performance statement is a **paired comparison**. An absolute number in isolation says nothing.

```bash
# Baseline
git worktree add /tmp/ps-base upstream/alpha
cd /tmp/ps-base && npm ci && npm run build
npm run benchmark > /tmp/base.txt 2>&1

# Your branch — same machine, same data, same iteration count
cd /path/to/your/branch && npm run build
npm run benchmark > /tmp/pr.txt 2>&1
```

Rules that make the comparison trustworthy:

- **Same machine, same session, nothing else running.** Do not compare a number from yesterday.
- **Alternate the runs** (A, B, A, B) when the delta is small - background load drifts over minutes, and a single A-then-B ordering bakes that drift into your result.
- **Pin the CPU if you can.** CI uses `taskset -c 0`; on macOS that is unavailable, so expect more noise and lean harder on alternating runs and the median.
- **Report the median with p95/p99**, never a single run's mean.
- **If the delta is within noise, say so.** "No measurable difference at N=1000, medians within 3%" is a legitimate, honest result. "It's faster" without a number is not.

### Sub-millisecond deltas

Wall-clock A/B is unreliable below roughly a millisecond on a dev machine - medians drift tens of percent between runs from background load alone. When the delta is that small, switch to noise-robust metrics:

- `process.cpuUsage()` per operation instead of wall clock.
- The V8 **sampling heap profiler** with `includeObjectsCollectedByMajorGC` / `includeObjectsCollectedByMinorGC`. Without those flags it reports only *live* objects and under-measures allocation by around 100×.
- **Allocation volume and GC cycle count** are the most stable signals at this scale - use `measureMemoryOperation`.

---

## Step 4 - Test at scale, not just at N=1

Constant-factor benchmarks miss the regressions that matter. For anything touching queries, relations, includes or result processing, build a realistic dataset and measure the **curve**, not a point:

- Measure at N = 100, 1k, 10k, 50k. **A change is safe only if the shape of the curve is unchanged**, not merely if the small-N number looks fine.
- Test wide results (many fields), deep results (nested includes), and large relations.
- Test with concurrency, not just sequentially - lock contention and pool exhaustion only appear under parallel load.
- Watch memory across the run, not just time: a change that buffers results instead of streaming will pass a timing benchmark and OOM a production instance.

When synthesising large datasets, make them **structurally realistic**. The relation-join case in [GOTCHAS.md](GOTCHAS.md) is the cautionary tale: inserting join rows with random string `_id`s instead of monotonic ObjectIds silently invalidates the entire benchmark, because the code under test relies on `_id` ordering as a proxy for creation order.

---

## Step 5 - Measure the real path

**The trap:** any load driver that `require`s `parse/node` in the *same process* as ParseServer gets the SDK's RESTController swapped for `ParseServerRESTController`. Every "HTTP" operation is then routed internally through PromiseRouter, bypassing express, all middleware, real HTTP and even the server-state check.

That path is legitimate to measure - it is what `benchmark/performance.js` measures - but it is **not** what a production client experiences. For real end-to-end HTTP numbers, run the client in a **separate process** from the server.

Be explicit about which one you measured. "Internal path, 2.1ms median" and "over HTTP, 2.1ms median" are different claims.

---

## The CI gate

`.github/workflows/ci-performance.yml` runs on PRs to `alpha`/`beta`/`release`/`next-major`:

1. Checks out the **PR's** benchmark script, saves it aside.
2. Checks out the **base** branch, restores the PR's benchmark script over it, `npm ci`, `npm run build`, runs `taskset -c 0 npm run benchmark` → baseline artifact.
3. Repeats on the PR branch → PR artifact.
4. Compares and writes a table to the job summary.

Thresholds: **any regression over 25% fails the job** (exit code 1) - >25% is labelled "Slower", >50% "Much Slower", but both set the same failure. >25% faster is flagged as an improvement. There is no warn-only band that lets a regression merge.

Two consequences worth knowing:

- Because the PR's benchmark script is run against *both* branches, a **new** benchmark you add gets a real baseline. Adding one is cheap and permanent protection.
- The gate only covers operations that have a benchmark. **If your hot path is not in `benchmark/performance.js`, CI cannot protect it** - the absence of a red mark is not evidence of no regression.

---

## Evidence template

```
Claim:        <"no regression on the query path" / "1.4× faster on X">
Complexity:   <what changed algorithmically; index/plan check result>
Harness:      npm run benchmark (BENCHMARK_ITERATIONS=<n>), <machine idle / taskset>
Baseline:     <branch/sha> — median <x>ms, p95 <y>ms, n=<filtered/total>
Branch:       median <x>ms, p95 <y>ms, n=<filtered/total>
Delta:        <±%>  (<within noise / significant>)
Scale:        N=100/1k/10k/50k -> <curve shape unchanged? memory flat?>
DB latency:   <dbLatency run, or "not run">
Path:         <in-process internal path | real HTTP, separate process>
```

---

## Anti-patterns

| Anti-pattern | Why it is wrong |
|---|---|
| "Reads are bounded, so it's fine" | A hypothesis, not a measurement |
| "Postgres already does it this way" | Different adapter, different cost model |
| Benchmarking at N=10 | `benchmark:quick` proves it runs, nothing more |
| Comparing to a number from a previous session | Machine state differs; the comparison is meaningless |
| Single A-then-B run for a small delta | Drift is indistinguishable from signal; alternate runs |
| Reporting a mean | Outliers dominate; the harness reports median for this reason |
| Measuring on localhost only | Hides added round trips; use `dbLatency` |
| Timing only, never memory | Buffering regressions pass timing and OOM in production |
| Removing an "unused" optimisation without measuring | The single most expensive mistake available in this repo |
| Claiming improvement without a base-branch comparison | Unfalsifiable |
