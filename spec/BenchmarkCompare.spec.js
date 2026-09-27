const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  compareResults,
  createBenchmarkRunner,
  evaluate,
  extractResults,
  formatTable,
  median,
} = require('../benchmark/compare');

const result = (name, value) => ({ name, value, unit: 'ms', range: '-', extra: 'p95: -' });

describe('Benchmark comparison', () => {
  describe('compareResults', () => {
    it('flags a benchmark that is more than 25% slower as a regression', () => {
      const { rows, regressions } = compareResults([result('A', 1)], [result('A', 1.3)]);
      expect(rows[0].status).toBe('⚠️ Slower');
      expect(regressions).toEqual(['A']);
    });

    it('flags a benchmark that is more than 50% slower as much slower', () => {
      const { rows, regressions } = compareResults([result('A', 1)], [result('A', 1.6)]);
      expect(rows[0].status).toBe('❌ Much Slower');
      expect(regressions).toEqual(['A']);
    });

    it('does not flag a benchmark that is exactly 25% slower', () => {
      const { rows, regressions } = compareResults([result('A', 100)], [result('A', 125)]);
      expect(rows[0].status).toBe('✅');
      expect(regressions).toEqual([]);
    });

    it('reports a benchmark that is more than 25% faster as an improvement', () => {
      const { rows, regressions, hasImprovement } = compareResults([result('A', 1)], [result('A', 0.7)]);
      expect(rows[0].status).toBe('🚀 Faster');
      expect(regressions).toEqual([]);
      expect(hasImprovement).toBe(true);
    });

    it('reports a benchmark that is missing in the PR results without flagging it', () => {
      const { rows, regressions } = compareResults([result('A', 1), result('B', 2)], [result('A', 1)]);
      expect(rows[1].status).toBe('⚠️ Missing');
      expect(regressions).toEqual([]);
    });
  });

  describe('formatTable', () => {
    it('renders the comparison as a markdown table', () => {
      const { rows } = compareResults([result('A', 1), result('B', 2)], [result('A', 1.3)]);
      expect(formatTable(rows)).toEqual([
        '| Benchmark | Baseline | PR | Change | Status |',
        '|-----------|----------|----|---------| ------ |',
        '| A | 1.00 ms | 1.30 ms | +30.0% | ⚠️ Slower |',
        '| B | 2.00 ms | N/A | - | ⚠️ Missing |',
      ]);
    });
  });

  describe('extractResults', () => {
    it('extracts the results from the benchmark output', () => {
      const results = [result('A', 1.23)];
      const output = [
        '> parse-server@9.0.0 benchmark:only',
        '::group::[1/1] A',
        'Result: 1.23 ms (p95: -)',
        '::endgroup::',
        JSON.stringify(results, null, 2),
        '::group::Summary',
        'Total duration: 1.0s',
      ].join('\n');
      expect(extractResults(output)).toEqual(results);
    });

    it('returns null if the output contains no results', () => {
      expect(extractResults('Error running benchmarks')).toBeNull();
    });
  });

  describe('median', () => {
    it('returns the middle value of an odd number of values', () => {
      expect(median([3, 1, 2])).toBe(2);
    });

    it('returns the mean of the two middle values of an even number of values', () => {
      expect(median([4, 1, 3, 2])).toBe(2.5);
    });
  });

  describe('evaluate', () => {
    const run = options => {
      const lines = [];
      const exitCode = evaluate({ print: line => lines.push(line), ...options });
      return { exitCode, output: lines.join('\n') };
    };

    // Returns a benchmark runner that yields the given values per side, one per call
    const runnerWith = values => {
      const calls = [];
      const runBenchmark = (side, names) => {
        calls.push([side, names]);
        const value = values[side].shift();
        return value === null ? null : names.map(name => result(name, value));
      };
      return { calls, runBenchmark };
    };

    it('passes without retest if no benchmark is flagged', () => {
      const runner = runnerWith({ base: [], pr: [] });
      const { exitCode, output } = run({
        baseline: [result('A', 1)],
        pr: [result('A', 1.1)],
        runBenchmark: runner.runBenchmark,
      });
      expect(exitCode).toBe(0);
      expect(runner.calls).toEqual([]);
      expect(output).toContain('✅ **No significant performance changes.**');
    });

    it('retests only the flagged benchmarks, alternating between base and PR', () => {
      const runner = runnerWith({ base: [1, 1, 1], pr: [1, 1, 1] });
      run({
        baseline: [result('A', 1), result('B', 1)],
        pr: [result('A', 1.3), result('B', 1)],
        runBenchmark: runner.runBenchmark,
        rounds: 3,
      });
      expect(runner.calls).toEqual([
        ['base', ['A']],
        ['pr', ['A']],
        ['pr', ['A']],
        ['base', ['A']],
        ['base', ['A']],
        ['pr', ['A']],
      ]);
    });

    it('passes if the regression does not persist in the retest', () => {
      const runner = runnerWith({ base: [1, 1, 1], pr: [1.02, 0.99, 1.01] });
      const { exitCode, output } = run({
        baseline: [result('A', 1)],
        pr: [result('A', 1.3)],
        runBenchmark: runner.runBenchmark,
        rounds: 3,
      });
      expect(exitCode).toBe(0);
      expect(output).toContain('| A | 1.00 ms | 1.01 ms | +1.0% | ✅ |');
      expect(output).toContain('✅ **No significant performance changes.**');
      expect(output).not.toContain('Performance regressions detected');
    });

    it('fails if the regression persists in the retest', () => {
      const runner = runnerWith({ base: [1, 1, 1], pr: [1.3, 1.3, 1.3] });
      const { exitCode, output } = run({
        baseline: [result('A', 1)],
        pr: [result('A', 1.3)],
        runBenchmark: runner.runBenchmark,
        rounds: 3,
      });
      expect(exitCode).toBe(1);
      expect(output).toContain('⚠️ **Performance regressions detected.** Please review the changes.');
    });

    it('uses the median of the retest measurements', () => {
      const outlier = runnerWith({ base: [1, 1, 1], pr: [1, 5, 1] });
      expect(run({
        baseline: [result('A', 1)],
        pr: [result('A', 1.3)],
        runBenchmark: outlier.runBenchmark,
        rounds: 3,
      }).exitCode).toBe(0);

      const persistent = runnerWith({ base: [1, 1, 1], pr: [1.3, 1, 1.3] });
      expect(run({
        baseline: [result('A', 1)],
        pr: [result('A', 1.3)],
        runBenchmark: persistent.runBenchmark,
        rounds: 3,
      }).exitCode).toBe(1);
    });

    it('fails if the retest yields no results for a flagged benchmark', () => {
      const runner = runnerWith({ base: [null, null, null], pr: [1, 1, 1] });
      const { exitCode, output } = run({
        baseline: [result('A', 1)],
        pr: [result('A', 1.3)],
        runBenchmark: runner.runBenchmark,
        rounds: 3,
      });
      expect(exitCode).toBe(1);
      expect(output).toContain('| A | N/A | N/A | - | ⚠️ Retest failed |');
    });

    it('fails if any retest measurement yields no results for a flagged benchmark', () => {
      const runner = runnerWith({ base: [null, 1, 1], pr: [1, 1, 1] });
      const { exitCode, output } = run({
        baseline: [result('A', 1)],
        pr: [result('A', 1.3)],
        runBenchmark: runner.runBenchmark,
        rounds: 3,
      });
      expect(exitCode).toBe(1);
      expect(output).toContain('| A | N/A | N/A | - | ⚠️ Retest failed |');
    });

    it('fails without retest if flagged benchmarks cannot be measured again', () => {
      const { exitCode, output } = run({
        baseline: [result('A', 1)],
        pr: [result('A', 1.3)],
      });
      expect(exitCode).toBe(1);
      expect(output).toContain('⚠️ **Performance regressions detected.** Please review the changes.');
    });

    it('reports improvements without retest', () => {
      const runner = runnerWith({ base: [], pr: [] });
      const { exitCode, output } = run({
        baseline: [result('A', 1)],
        pr: [result('A', 0.7)],
        runBenchmark: runner.runBenchmark,
      });
      expect(exitCode).toBe(0);
      expect(runner.calls).toEqual([]);
      expect(output).toContain('🚀 **Performance improvements detected!** Great work!');
    });

    it('establishes new benchmarks if there is no baseline', () => {
      const { exitCode, output } = run({ baseline: [], pr: [result('A', 1)] });
      expect(exitCode).toBe(0);
      expect(output).toContain('✅ **New benchmarks established for this feature.**');
    });

    it('passes with a warning if the PR results are empty', () => {
      const { exitCode, output } = run({ baseline: [result('A', 1)], pr: [] });
      expect(exitCode).toBe(0);
      expect(output).toBe('⚠️ PR benchmark results are empty or invalid');
    });
  });

  describe('createBenchmarkRunner', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'benchmark-compare-'));
      fs.mkdirSync(path.join(tmpDir, 'base'));
      fs.mkdirSync(path.join(tmpDir, 'pr'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('runs the benchmark command for the selected benchmarks in the directory of the side', () => {
      // Prints the directory name, the requested benchmark names and the iterations factor as results
      const script = [
        'const names = JSON.parse(process.env.BENCHMARK_NAMES);',
        'const dir = require("path").basename(process.cwd());',
        'const factor = process.env.BENCHMARK_ITERATIONS_FACTOR;',
        'console.log("log line");',
        'console.log(JSON.stringify(names.map(name => ({ name, value: 1, extra: dir + " " + factor })), null, 2));',
      ].join(' ');
      fs.writeFileSync(path.join(tmpDir, 'fake-benchmark.js'), script);
      const logFile = path.join(tmpDir, 'retest-output.txt');
      const runBenchmark = createBenchmarkRunner({
        dirs: { base: path.join(tmpDir, 'base'), pr: path.join(tmpDir, 'pr') },
        command: `node ${JSON.stringify(path.join(tmpDir, 'fake-benchmark.js'))}`,
        iterationsFactor: 0.5,
        logFile,
      });

      expect(runBenchmark('base', ['A', 'B'])).toEqual([
        { name: 'A', value: 1, extra: 'base 0.5' },
        { name: 'B', value: 1, extra: 'base 0.5' },
      ]);
      expect(runBenchmark('pr', ['A'])).toEqual([{ name: 'A', value: 1, extra: 'pr 0.5' }]);
      expect(fs.readFileSync(logFile, 'utf8')).toContain('log line');
    });

    it('returns null if the benchmark command produces no results', () => {
      const runBenchmark = createBenchmarkRunner({
        dirs: { base: path.join(tmpDir, 'base'), pr: path.join(tmpDir, 'pr') },
        command: 'node -e "process.exit(1)"',
        iterationsFactor: 1,
        logFile: path.join(tmpDir, 'retest-output.txt'),
      });
      expect(runBenchmark('base', ['A'])).toBeNull();
    });
  });

  describe('command line', () => {
    const script = path.join(__dirname, '../benchmark/compare.js');
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'benchmark-compare-'));
      fs.mkdirSync(path.join(tmpDir, 'base'));
      fs.mkdirSync(path.join(tmpDir, 'pr'));
      fs.writeFileSync(path.join(tmpDir, 'baseline.json'), JSON.stringify([result('A', 1)]));
      fs.writeFileSync(path.join(tmpDir, 'pr.json'), JSON.stringify([result('A', 1.3)]));
      // Reports the value of the environment variable of the side, named after its directory
      const benchmark = [
        'const side = require("path").basename(process.cwd()).toUpperCase();',
        'const names = JSON.parse(process.env.BENCHMARK_NAMES);',
        'const value = parseFloat(process.env["VALUE_" + side]);',
        'console.log(JSON.stringify(names.map(name => ({ name, value })), null, 2));',
      ].join(' ');
      fs.writeFileSync(path.join(tmpDir, 'fake-benchmark.js'), benchmark);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const compare = env =>
      spawnSync(process.execPath, [script, 'baseline.json', 'pr.json'], {
        cwd: tmpDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          BENCHMARK_BASE_DIR: 'base',
          BENCHMARK_PR_DIR: 'pr',
          BENCHMARK_COMMAND: `node ${JSON.stringify(path.join(tmpDir, 'fake-benchmark.js'))}`,
          ...env,
        },
      });

    it('exits with 1 if the regression persists in the retest', () => {
      const run = compare({ VALUE_BASE: '1', VALUE_PR: '1.3' });
      expect(run.status).toBe(1);
      expect(run.stdout).toContain('## Retest');
      expect(run.stdout).toContain('⚠️ **Performance regressions detected.** Please review the changes.');
    });

    it('exits with 0 if the regression does not persist in the retest', () => {
      const run = compare({ VALUE_BASE: '1', VALUE_PR: '1' });
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('## Retest');
      expect(run.stdout).toContain('✅ **No significant performance changes.**');
    });

    it('exits with 1 without retest if the base branch build is not set', () => {
      const run = compare({ BENCHMARK_BASE_DIR: '', VALUE_BASE: '1', VALUE_PR: '1' });
      expect(run.status).toBe(1);
      expect(run.stdout).not.toContain('## Retest');
    });

    it('exits with 0 if the results cannot be parsed', () => {
      fs.writeFileSync(path.join(tmpDir, 'pr.json'), 'not json');
      const run = compare({ VALUE_BASE: '1', VALUE_PR: '1' });
      expect(run.status).toBe(0);
      expect(run.stdout).toBe('⚠️ Could not parse benchmark results\n');
    });
  });
});
