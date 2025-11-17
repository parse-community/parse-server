/**
 * Performance Benchmark Suite for Parse Server
 *
 * This suite measures the performance of critical Parse Server operations
 * using the Node.js Performance API. Results are output in a format
 * compatible with github-action-benchmark.
 *
 * Run with: npm run benchmark
 */

/* eslint-disable no-console */

const core = require('@actions/core');
const Parse = require('parse/node');
const { performance, PerformanceObserver } = require('perf_hooks');
const { MongoClient } = require('mongodb');
const { wrapMongoDBWithLatency } = require('./MongoLatencyWrapper');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/parse_benchmark_test';
const SERVER_URL = 'http://localhost:1337/parse';
const APP_ID = 'benchmark-app-id';
const MASTER_KEY = 'benchmark-master-key';
const ITERATIONS = process.env.BENCHMARK_ITERATIONS ? parseInt(process.env.BENCHMARK_ITERATIONS, 10) : undefined;
const LOG_ITERATIONS = false;

// Parse Server instance
let parseServer;
let mongoClient;

// Logging helpers
const logInfo = message => core.info(message);
const logError = message => core.error(message);

/**
 * Initialize Parse Server for benchmarking
 */
async function initializeParseServer() {
  const express = require('express');
  const { default: ParseServer } = require('../lib/index.js');

  const app = express();

  parseServer = new ParseServer({
    databaseURI: MONGODB_URI,
    appId: APP_ID,
    masterKey: MASTER_KEY,
    serverURL: SERVER_URL,
    silent: true,
    allowClientClassCreation: true,
    logLevel: 'error', // Minimal logging for performance
    verbose: false,
  });

  app.use('/parse', parseServer.app);

  return new Promise((resolve, reject) => {
    const server = app.listen(1337, (err) => {
      if (err) {
        reject(new Error(`Failed to start server: ${err.message}`));
        return;
      }
      Parse.initialize(APP_ID);
      Parse.masterKey = MASTER_KEY;
      Parse.serverURL = SERVER_URL;
      resolve(server);
    });

    server.on('error', (err) => {
      reject(new Error(`Server error: ${err.message}`));
    });
  });
}

/**
 * Clean up database between benchmarks
 */
async function cleanupDatabase() {
  try {
    if (!mongoClient) {
      mongoClient = await MongoClient.connect(MONGODB_URI);
    }
    const db = mongoClient.db();
    const collections = await db.listCollections().toArray();

    for (const collection of collections) {
      if (!collection.name.startsWith('system.')) {
        await db.collection(collection.name).deleteMany({});
      }
    }
  } catch (error) {
    throw new Error(`Failed to cleanup database: ${error.message}`);
  }
}

/**
 * Reset Parse SDK to use the default server
 */
function resetParseServer() {
  Parse.serverURL = SERVER_URL;
}

/**
 * Measure average time for an async operation over multiple iterations.
 * @param {Object} options Measurement options.
 * @param {string} options.name Name of the operation being measured.
 * @param {Function} options.operation Async function to measure.
 * @param {number} options.iterations Number of iterations to run; choose a value that is high
 * enough to create reliable benchmark metrics with low variance but low enough to keep test
 * duration reasonable around <=10 seconds.
 * @param {boolean} [options.skipWarmup=false] Skip warmup phase.
 * @param {number} [options.dbLatency] Artificial DB latency in milliseconds to apply during
 * this benchmark.
 */
async function measureOperation({ name, operation, iterations, skipWarmup = false, dbLatency }) {
  // Override iterations if global ITERATIONS is set
  iterations = ITERATIONS || iterations;

  // Determine warmup count (20% of iterations)
  const warmupCount = skipWarmup ? 0 : Math.floor(iterations * 0.2);
  const times = [];

  // Apply artificial latency if specified
  let unwrapLatency = null;
  if (dbLatency !== undefined && dbLatency > 0) {
    logInfo(`Applying ${dbLatency}ms artificial DB latency for this benchmark`);
    unwrapLatency = wrapMongoDBWithLatency(dbLatency);
  }

  try {
    if (warmupCount > 0) {
      logInfo(`Starting warmup phase of ${warmupCount} iterations...`);
      const warmupStart = performance.now();
      for (let i = 0; i < warmupCount; i++) {
        await operation();
      }
      logInfo(`Warmup took: ${(performance.now() - warmupStart).toFixed(2)}ms`);
    }

    // Measurement phase
    logInfo(`Starting measurement phase of ${iterations} iterations...`);
    const progressInterval = Math.ceil(iterations / 10); // Log every 10%
    const measurementStart = performance.now();

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await operation();
      const end = performance.now();
      const duration = end - start;
      times.push(duration);

      // Log progress every 10% or individual iterations if LOG_ITERATIONS is enabled
      if (LOG_ITERATIONS) {
        logInfo(`Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
      } else if ((i + 1) % progressInterval === 0 || i + 1 === iterations) {
        const progress = Math.round(((i + 1) / iterations) * 100);
        logInfo(`Progress: ${progress}%`);
      }
    }

    logInfo(`Measurement took: ${(performance.now() - measurementStart).toFixed(2)}ms`);

    // Sort times for percentile calculations
    times.sort((a, b) => a - b);

    // Filter outliers using Interquartile Range (IQR) method
    const q1Index = Math.floor(times.length * 0.25);
    const q3Index = Math.floor(times.length * 0.75);
    const q1 = times[q1Index];
    const q3 = times[q3Index];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const filtered = times.filter(t => t >= lowerBound && t <= upperBound);

    // Calculate statistics on filtered data
    const median = filtered[Math.floor(filtered.length * 0.5)];
    const p95 = filtered[Math.floor(filtered.length * 0.95)];
    const p99 = filtered[Math.floor(filtered.length * 0.99)];
    const min = filtered[0];
    const max = filtered[filtered.length - 1];

    return {
      name,
      value: median, // Use median (p50) as primary metric for stability in CI
      unit: 'ms',
      range: `${min.toFixed(2)} - ${max.toFixed(2)}`,
      extra: `p95: ${p95.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms, n=${filtered.length}/${times.length}`,
    };
  } finally {
    // Remove latency wrapper if it was applied
    if (unwrapLatency) {
      unwrapLatency();
      logInfo('Removed artificial DB latency');
    }
  }
}

/**
 * Benchmark: Object Create
 */
async function benchmarkObjectCreate() {
  let counter = 0;

  return measureOperation({
    name: 'Object Create',
    iterations: 1_000,
    operation: async () => {
      const TestObject = Parse.Object.extend('BenchmarkTest');
      const obj = new TestObject();
      obj.set('testField', `test-value-${counter++}`);
      obj.set('number', counter);
      obj.set('boolean', true);
      await obj.save();
    },
  });
}

/**
 * Benchmark: Object Read (by ID)
 */
async function benchmarkObjectRead() {
  // Setup: Create test objects
  const TestObject = Parse.Object.extend('BenchmarkTest');
  const objects = [];

  for (let i = 0; i < 1_000; i++) {
    const obj = new TestObject();
    obj.set('testField', `read-test-${i}`);
    objects.push(obj);
  }

  await Parse.Object.saveAll(objects);

  let counter = 0;

  return measureOperation({
    name: 'Object Read',
    iterations: 1_000,
    operation: async () => {
      const query = new Parse.Query('BenchmarkTest');
      await query.get(objects[counter++ % objects.length].id);
    },
  });
}

/**
 * Benchmark: Object Update
 */
async function benchmarkObjectUpdate() {
  // Setup: Create test objects
  const TestObject = Parse.Object.extend('BenchmarkTest');
  const objects = [];

  for (let i = 0; i < 1_000; i++) {
    const obj = new TestObject();
    obj.set('testField', `update-test-${i}`);
    obj.set('counter', 0);
    objects.push(obj);
  }

  await Parse.Object.saveAll(objects);

  let counter = 0;

  return measureOperation({
    name: 'Object Update',
    iterations: 1_000,
    operation: async () => {
      const obj = objects[counter++ % objects.length];
      obj.increment('counter');
      obj.set('lastUpdated', new Date());
      await obj.save();
    },
  });
}

/**
 * Benchmark: Simple Query
 */
async function benchmarkSimpleQuery() {
  // Setup: Create test data
  const TestObject = Parse.Object.extend('BenchmarkTest');
  const objects = [];

  for (let i = 0; i < 100; i++) {
    const obj = new TestObject();
    obj.set('category', i % 10);
    obj.set('value', i);
    objects.push(obj);
  }

  await Parse.Object.saveAll(objects);

  let counter = 0;

  return measureOperation({
    name: 'Simple Query',
    iterations: 1_000,
    operation: async () => {
      const query = new Parse.Query('BenchmarkTest');
      query.equalTo('category', counter++ % 10);
      await query.find();
    },
  });
}

/**
 * Benchmark: Batch Save (saveAll)
 */
async function benchmarkBatchSave() {
  const BATCH_SIZE = 10;

  return measureOperation({
    name: 'Batch Save (10 objects)',
    iterations: 1_000,
    operation: async () => {
      const TestObject = Parse.Object.extend('BenchmarkTest');
      const objects = [];

      for (let i = 0; i < BATCH_SIZE; i++) {
        const obj = new TestObject();
        obj.set('batchField', `batch-${i}`);
        obj.set('timestamp', new Date());
        objects.push(obj);
      }

      await Parse.Object.saveAll(objects);
    },
  });
}

/**
 * Benchmark: User Signup
 */
async function benchmarkUserSignup() {
  let counter = 0;

  return measureOperation({
    name: 'User Signup',
    iterations: 500,
    operation: async () => {
      counter++;
      const user = new Parse.User();
      user.set('username', `benchmark_user_${Date.now()}_${counter}`);
      user.set('password', 'benchmark_password');
      user.set('email', `benchmark${counter}@example.com`);
      await user.signUp();
    },
  });
}

/**
 * Benchmark: User Login
 */
async function benchmarkUserLogin() {
  // Setup: Create test users
  const users = [];

  for (let i = 0; i < 10; i++) {
    const user = new Parse.User();
    user.set('username', `benchmark_login_user_${i}`);
    user.set('password', 'benchmark_password');
    user.set('email', `login${i}@example.com`);
    await user.signUp();
    users.push({ username: user.get('username'), password: 'benchmark_password' });
    await Parse.User.logOut();
  }

  let counter = 0;

  return measureOperation({
    name: 'User Login',
    iterations: 500,
    operation: async () => {
      const userCreds = users[counter++ % users.length];
      await Parse.User.logIn(userCreds.username, userCreds.password);
      await Parse.User.logOut();
    },
  });
}

/**
 * Benchmark: Query with Include (Parallel Include Pointers)
 */
async function benchmarkQueryWithInclude() {
  // Setup: Create nested object hierarchy
  const Level2Class = Parse.Object.extend('Level2');
  const Level1Class = Parse.Object.extend('Level1');
  const RootClass = Parse.Object.extend('Root');

  return measureOperation({
    name: 'Query with Include (2 levels)',
    skipWarmup: true,
    dbLatency: 50,
    iterations: 100,
    operation: async () => {
      // Create 10 Level2 objects
      const level2Objects = [];
      for (let i = 0; i < 10; i++) {
        const obj = new Level2Class();
        obj.set('name', `level2-${i}`);
        obj.set('value', i);
        level2Objects.push(obj);
      }
      await Parse.Object.saveAll(level2Objects);

      // Create 10 Level1 objects, each pointing to a Level2 object
      const level1Objects = [];
      for (let i = 0; i < 10; i++) {
        const obj = new Level1Class();
        obj.set('name', `level1-${i}`);
        obj.set('level2', level2Objects[i % level2Objects.length]);
        level1Objects.push(obj);
      }
      await Parse.Object.saveAll(level1Objects);

      // Create 10 Root objects, each pointing to a Level1 object
      const rootObjects = [];
      for (let i = 0; i < 10; i++) {
        const obj = new RootClass();
        obj.set('name', `root-${i}`);
        obj.set('level1', level1Objects[i % level1Objects.length]);
        rootObjects.push(obj);
      }
      await Parse.Object.saveAll(rootObjects);

      const query = new Parse.Query('Root');
      query.include('level1.level2');
      await query.find();
    },
  });
}

/**
 * Run all benchmarks
 */
async function runBenchmarks() {
  logInfo('Starting Parse Server Performance Benchmarks...');

  let server;

  try {
    // Initialize Parse Server
    logInfo('Initializing Parse Server...');
    server = await initializeParseServer();

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    const results = [];

    // Define all benchmarks to run
    const benchmarks = [
      { name: 'Object Create', fn: benchmarkObjectCreate },
      { name: 'Object Read', fn: benchmarkObjectRead },
      { name: 'Object Update', fn: benchmarkObjectUpdate },
      { name: 'Simple Query', fn: benchmarkSimpleQuery },
      { name: 'Batch Save', fn: benchmarkBatchSave },
      { name: 'User Signup', fn: benchmarkUserSignup },
      { name: 'User Login', fn: benchmarkUserLogin },
      { name: 'Query with Include', fn: benchmarkQueryWithInclude },
    ];

    // Run each benchmark with database cleanup
    for (const benchmark of benchmarks) {
      logInfo(`\nRunning benchmark '${benchmark.name}'...`);
      resetParseServer();
      await cleanupDatabase();
      results.push(await benchmark.fn());
    }

    // Output results in github-action-benchmark format (stdout)
    logInfo(JSON.stringify(results, null, 2));

    // Output summary to stderr for visibility
    logInfo('Benchmarks completed successfully!');
    logInfo('Summary:');
    results.forEach(result => {
      logInfo(`  ${result.name}: ${result.value.toFixed(2)} ${result.unit} (${result.extra})`);
    });

  } catch (error) {
    logError('Error running benchmarks:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (mongoClient) {
      await mongoClient.close();
    }
    if (server) {
      server.close();
    }
    // Give some time for cleanup
    setTimeout(() => process.exit(0), 1000);
  }
}

// Run benchmarks if executed directly
if (require.main === module) {
  runBenchmarks();
}

module.exports = { runBenchmarks };
