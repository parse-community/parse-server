/**
 * Benchmark Comparison
 *
 * Compares the benchmark results of a pull request with those of its base branch. A benchmark
 * that is flagged as a regression is measured again several times for both branches, alternating
 * between them, so that a slowdown of the CI runner while the pull request was measured is not
 * mistaken for a regression. The comparison only fails if the regression persists in the retest.
 *
 * Run with: node benchmark/compare.js [baseline.json] [pr.json]
 *
 * Environment variables:
 * - BENCHMARK_BASE_DIR: Directory of the base branch build; flagged benchmarks are only measured
 *   again if this is set.
 * - BENCHMARK_PR_DIR: Directory of the pull request build; defaults to the current directory.
 * - BENCHMARK_COMMAND: Command that runs the benchmarks; defaults to `npm run benchmark`.
 */

const fs = require('fs');
const { spawnSync } = require('child_process');

// Change in percent above which a benchmark is flagged
const SLOWER_THRESHOLD = 25;
const MUCH_SLOWER_THRESHOLD = 50;
const FASTER_THRESHOLD = -25;

// Number of times a flagged benchmark is measured again for each branch; each measurement runs a
// fraction of the iterations so that the retest takes about as long as the initial measurement
const RETEST_ROUNDS = 3;

/**
 * Calculate the median of values.
 * @param {number[]} values The values.
 * @returns {number} The median.
 */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Compare benchmark results of the base branch with those of the pull request.
 * @param {Object[]} baseline The results of the base branch.
 * @param {Object[]} pr The results of the pull request.
 * @returns {{ rows: Object[], regressions: string[], hasImprovement: boolean }} The comparison
 * per benchmark, the names of benchmarks flagged as regression and whether any benchmark improved.
 */
function compareResults(baseline, pr) {
  const rows = baseline.map(baseResult => {
    const baseValue = parseFloat(baseResult.value);
    const prResult = pr.find(p => p.name === baseResult.name);
    if (!prResult) {
      return { name: baseResult.name, baseValue, status: '⚠️ Missing' };
    }
    const prValue = parseFloat(prResult.value);
    const change = ((prValue - baseValue) / baseValue) * 100;
    const row = { name: baseResult.name, baseValue, prValue, change, status: '✅' };
    if (change > MUCH_SLOWER_THRESHOLD) {
      row.status = '❌ Much Slower';
      row.isRegression = true;
    } else if (change > SLOWER_THRESHOLD) {
      row.status = '⚠️ Slower';
      row.isRegression = true;
    } else if (change < FASTER_THRESHOLD) {
      row.status = '🚀 Faster';
      row.isImprovement = true;
    }
    return row;
  });
  return {
    rows,
    regressions: rows.filter(row => row.isRegression).map(row => row.name),
    hasImprovement: rows.some(row => row.isImprovement),
  };
}

/**
 * Render compared benchmark results as a markdown table.
 * @param {Object[]} rows The rows returned by `compareResults`.
 * @returns {string[]} The table lines.
 */
function formatTable(rows) {
  const formatValue = value => (value === undefined ? 'N/A' : `${value.toFixed(2)} ms`);
  const formatChange = change => {
    if (change === undefined) {
      return '-';
    }
    return change > 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`;
  };
  return [
    '| Benchmark | Baseline | PR | Change | Status |',
    '|-----------|----------|----|---------| ------ |',
    ...rows.map(
      row =>
        `| ${row.name} | ${formatValue(row.baseValue)} | ${formatValue(row.prValue)} | ${formatChange(row.change)} | ${row.status} |`
    ),
  ];
}

/**
 * Extract the results from the output of a benchmark run, which logs the results as a JSON array.
 * @param {string} output The output of the benchmark run.
 * @returns {Object[]|null} The results, or null if the output contains no results.
 */
function extractResults(output) {
  const lines = output.split('\n');
  const start = lines.findIndex(line => line.startsWith('['));
  if (start === -1) {
    return null;
  }
  for (let end = start; end < lines.length; end++) {
    if (end !== start && !lines[end].startsWith(']')) {
      continue;
    }
    try {
      const results = JSON.parse(lines.slice(start, end + 1).join('\n'));
      if (Array.isArray(results)) {
        return results;
      }
    } catch {
      // Not the end of the results yet
    }
  }
  return null;
}

/**
 * Measure flagged benchmarks again, alternating between base branch and pull request.
 * @param {Object} options The options.
 * @param {string[]} options.names The names of the benchmarks to measure again.
 * @param {number} options.rounds The number of measurements per branch.
 * @param {Function} options.runBenchmark Runs benchmarks for a side (`base` or `pr`) and returns
 * the results, or null if the run failed.
 * @param {Function} options.log Logs progress.
 * @returns {Object[]} The comparison of the medians of the measurements per benchmark.
 */
function retest({ names, rounds, runBenchmark, log }) {
  const values = { base: {}, pr: {} };
  for (let round = 0; round < rounds; round++) {
    // Alternate the order in each round so that a gradual change of the runner speed affects both
    // branches equally
    const sides = round % 2 === 0 ? ['base', 'pr'] : ['pr', 'base'];
    for (const side of sides) {
      log(`Retest ${round + 1}/${rounds}: measuring ${side}...`);
      for (const result of runBenchmark(side, names) || []) {
        if (names.includes(result.name)) {
          values[side][result.name] = values[side][result.name] || [];
          values[side][result.name].push(parseFloat(result.value));
        }
      }
    }
  }
  return names.map(name => {
    // Only clear a regression if every measurement of both branches succeeded
    const isComplete = side => (values[side][name] || []).length >= rounds;
    if (!isComplete('base') || !isComplete('pr')) {
      return { name, status: '⚠️ Retest failed', isRegression: true };
    }
    const baseline = [{ name, value: median(values.base[name]) }];
    const pr = [{ name, value: median(values.pr[name]) }];
    return compareResults(baseline, pr).rows[0];
  });
}

/**
 * Evaluate benchmark results and print the comparison as markdown.
 * @param {Object} options The options.
 * @param {Object[]} options.baseline The results of the base branch.
 * @param {Object[]} options.pr The results of the pull request.
 * @param {Function} options.print Prints a line of the comparison.
 * @param {Function} [options.runBenchmark] Runs benchmarks for a side (`base` or `pr`) and returns
 * the results; if not set, flagged benchmarks are not measured again.
 * @param {number} [options.rounds] The number of measurements per branch in a retest.
 * @param {Function} [options.log] Logs progress.
 * @returns {number} The exit code; 1 if a regression was detected, otherwise 0.
 */
function evaluate({ baseline, pr, print, runBenchmark, rounds = RETEST_ROUNDS, log = () => {} }) {
  // Handle case where baseline doesn't exist (new feature)
  if (!Array.isArray(baseline) || baseline.length === 0) {
    if (!Array.isArray(pr) || pr.length === 0) {
      print('⚠️ Benchmark results are empty or invalid');
      return 0;
    }
    print('# Performance Benchmark Results');
    print('');
    print('> ℹ️ Baseline not available - this appears to be a new feature');
    print('');
    print('| Benchmark | Value | Details |');
    print('|-----------|-------|---------|');
    pr.forEach(result => {
      print(`| ${result.name} | ${result.value.toFixed(2)} ms | ${result.extra} |`);
    });
    print('');
    print('✅ **New benchmarks established for this feature.**');
    return 0;
  }

  if (!Array.isArray(pr) || pr.length === 0) {
    print('⚠️ PR benchmark results are empty or invalid');
    return 0;
  }

  const { rows, regressions, hasImprovement } = compareResults(baseline, pr);
  print('# Performance Comparison');
  print('');
  formatTable(rows).forEach(line => print(line));
  print('');

  let confirmedRegressions = regressions;
  if (regressions.length > 0 && runBenchmark) {
    print('## Retest');
    print('');
    print(
      `> Flagged benchmarks were measured again ${rounds} times for the base branch and for the PR, alternating between them. The values are the medians of these measurements.`
    );
    print('');
    const retestRows = retest({ names: regressions, rounds, runBenchmark, log });
    formatTable(retestRows).forEach(line => print(line));
    print('');
    confirmedRegressions = retestRows.filter(row => row.isRegression).map(row => row.name);
  }

  if (confirmedRegressions.length > 0) {
    print('⚠️ **Performance regressions detected.** Please review the changes.');
    return 1;
  }
  if (hasImprovement) {
    print('🚀 **Performance improvements detected!** Great work!');
  } else {
    print('✅ **No significant performance changes.**');
  }
  return 0;
}

/**
 * Create a function that runs benchmarks in the build directory of the base branch or the pull
 * request.
 * @param {Object} options The options.
 * @param {{ base: string, pr: string }} options.dirs The build directories.
 * @param {string} options.command The command that runs the benchmarks.
 * @param {number} options.iterationsFactor The factor applied to the iterations of each benchmark.
 * @param {string} options.logFile The file the output of each run is appended to.
 * @returns {Function} Runs the benchmarks with the given names for a side (`base` or `pr`) and
 * returns the results, or null if the run produced no results.
 */
function createBenchmarkRunner({ dirs, command, iterationsFactor, logFile }) {
  return (side, names) => {
    const run = spawnSync(command, {
      cwd: dirs[side],
      shell: true,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        BENCHMARK_NAMES: JSON.stringify(names),
        BENCHMARK_ITERATIONS_FACTOR: String(iterationsFactor),
      },
    });
    const stdout = run.stdout || '';
    fs.appendFileSync(logFile, `=== ${side} (exit code ${run.status}) ===\n${stdout}${run.stderr || ''}\n`);
    return extractResults(stdout);
  };
}

function main() {
  const [baselinePath = 'baseline.json', prPath = 'pr.json'] = process.argv.slice(2);
  const print = line => process.stdout.write(`${line}\n`);

  let baseline, pr;
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    pr = JSON.parse(fs.readFileSync(prPath, 'utf8'));
  } catch {
    print('⚠️ Could not parse benchmark results');
    return;
  }

  const baseDir = process.env.BENCHMARK_BASE_DIR;
  const runBenchmark = baseDir
    ? createBenchmarkRunner({
      dirs: { base: baseDir, pr: process.env.BENCHMARK_PR_DIR || '.' },
      command: process.env.BENCHMARK_COMMAND || 'npm run benchmark',
      iterationsFactor: 1 / RETEST_ROUNDS,
      logFile: 'retest-output.txt',
    })
    : undefined;

  process.exitCode = evaluate({
    baseline,
    pr,
    print,
    runBenchmark,
    log: message => process.stderr.write(`${message}\n`),
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  compareResults,
  createBenchmarkRunner,
  evaluate,
  extractResults,
  formatTable,
  median,
};
