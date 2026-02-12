/**
 * Performance Benchmark Suite for Parse Server
 *
 * This suite measures the performance of critical Parse Server operations
 * using the Node.js Performance API. Results are output in a format
 * compatible with github-action-benchmark.
 *
 * Run with: npm run benchmark
 */

const Parse = require('parse/node');
const { performance } = require('node:perf_hooks');
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
let core;

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
async function benchmarkObjectCreate(name) {
  let counter = 0;

  return measureOperation({
    name,
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
async function benchmarkObjectRead(name) {
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
    name,
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
async function benchmarkObjectUpdate(name) {
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
    name,
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
async function benchmarkSimpleQuery(name) {
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
    name,
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
async function benchmarkBatchSave(name) {
  const BATCH_SIZE = 10;

  return measureOperation({
    name,
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
async function benchmarkUserSignup(name) {
  let counter = 0;

  return measureOperation({
    name,
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
async function benchmarkUserLogin(name) {
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
    name,
    iterations: 500,
    operation: async () => {
      const userCreds = users[counter++ % users.length];
      await Parse.User.logIn(userCreds.username, userCreds.password);
      await Parse.User.logOut();
    },
  });
}

/**
 * Benchmark: Query with Include (Parallel Pointers)
 * Tests the performance improvement when fetching multiple pointers at the same level.
 */
async function benchmarkQueryWithIncludeParallel(name) {
  const PointerAClass = Parse.Object.extend('PointerA');
  const PointerBClass = Parse.Object.extend('PointerB');
  const PointerCClass = Parse.Object.extend('PointerC');
  const RootClass = Parse.Object.extend('Root');

  // Create pointer objects
  const pointerAObjects = [];
  for (let i = 0; i < 10; i++) {
    const obj = new PointerAClass();
    obj.set('name', `pointerA-${i}`);
    pointerAObjects.push(obj);
  }
  await Parse.Object.saveAll(pointerAObjects);

  const pointerBObjects = [];
  for (let i = 0; i < 10; i++) {
    const obj = new PointerBClass();
    obj.set('name', `pointerB-${i}`);
    pointerBObjects.push(obj);
  }
  await Parse.Object.saveAll(pointerBObjects);

  const pointerCObjects = [];
  for (let i = 0; i < 10; i++) {
    const obj = new PointerCClass();
    obj.set('name', `pointerC-${i}`);
    pointerCObjects.push(obj);
  }
  await Parse.Object.saveAll(pointerCObjects);

  // Create Root objects with multiple pointers at the same level
  const rootObjects = [];
  for (let i = 0; i < 10; i++) {
    const obj = new RootClass();
    obj.set('name', `root-${i}`);
    obj.set('pointerA', pointerAObjects[i % pointerAObjects.length]);
    obj.set('pointerB', pointerBObjects[i % pointerBObjects.length]);
    obj.set('pointerC', pointerCObjects[i % pointerCObjects.length]);
    rootObjects.push(obj);
  }
  await Parse.Object.saveAll(rootObjects);

  return measureOperation({
    name,
    skipWarmup: true,
    dbLatency: 100,
    iterations: 100,
    operation: async () => {
      const query = new Parse.Query('Root');
      // Include multiple pointers at the same level - should fetch in parallel
      query.include(['pointerA', 'pointerB', 'pointerC']);
      await query.find();
    },
  });
}

/**
 * Benchmark: Query with Include (Nested Pointers with Parallel Leaf Nodes)
 * Tests the PR's optimization for parallel fetching at each nested level.
 * Pattern: p1.p2.p3, p1.p2.p4, p1.p2.p5
 * After fetching p2, we know the objectIds and can fetch p3, p4, p5 in parallel.
 */
async function benchmarkQueryWithIncludeNested(name) {
  const Level3AClass = Parse.Object.extend('Level3A');
  const Level3BClass = Parse.Object.extend('Level3B');
  const Level3CClass = Parse.Object.extend('Level3C');
  const Level2Class = Parse.Object.extend('Level2');
  const Level1Class = Parse.Object.extend('Level1');
  const RootClass = Parse.Object.extend('Root');

  // Create Level3 objects (leaf nodes)
  const level3AObjects = [];
  for (let i = 0; i < 10; i++) {
    const obj = new Level3AClass();
    obj.set('name', `level3A-${i}`);
    level3AObjects.push(obj);
  }
  await Parse.Object.saveAll(level3AObjects);

  const level3BObjects = [];
  for (let i = 0; i < 10; i++) {
    const obj = new Level3BClass();
    obj.set('name', `level3B-${i}`);
    level3BObjects.push(obj);
  }
  await Parse.Object.saveAll(level3BObjects);

  const level3CObjects = [];
  for (let i = 0; i < 10; i++) {
    const obj = new Level3CClass();
    obj.set('name', `level3C-${i}`);
    level3CObjects.push(obj);
  }
  await Parse.Object.saveAll(level3CObjects);

  // Create Level2 objects pointing to multiple Level3 objects
  const level2Objects = [];
  for (let i = 0; i < 10; i++) {
    const obj = new Level2Class();
    obj.set('name', `level2-${i}`);
    obj.set('level3A', level3AObjects[i % level3AObjects.length]);
    obj.set('level3B', level3BObjects[i % level3BObjects.length]);
    obj.set('level3C', level3CObjects[i % level3CObjects.length]);
    level2Objects.push(obj);
  }
  await Parse.Object.saveAll(level2Objects);

  // Create Level1 objects pointing to Level2
  const level1Objects = [];
  for (let i = 0; i < 10; i++) {
    const obj = new Level1Class();
    obj.set('name', `level1-${i}`);
    obj.set('level2', level2Objects[i % level2Objects.length]);
    level1Objects.push(obj);
  }
  await Parse.Object.saveAll(level1Objects);

  // Create Root objects pointing to Level1
  const rootObjects = [];
  for (let i = 0; i < 10; i++) {
    const obj = new RootClass();
    obj.set('name', `root-${i}`);
    obj.set('level1', level1Objects[i % level1Objects.length]);
    rootObjects.push(obj);
  }
  await Parse.Object.saveAll(rootObjects);

  return measureOperation({
    name,
    skipWarmup: true,
    dbLatency: 100,
    iterations: 100,
    operation: async () => {
      const query = new Parse.Query('Root');
      // After fetching level1.level2, the PR should fetch level3A, level3B, level3C in parallel
      query.include(['level1.level2.level3A', 'level1.level2.level3B', 'level1.level2.level3C']);
      await query.find();
    },
  });
}

/**
 * Run all benchmarks
 */
async function runBenchmarks() {
  core = await import('@actions/core');
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
      { name: 'Object.save (create)', fn: benchmarkObjectCreate },
      { name: 'Object.save (update)', fn: benchmarkObjectUpdate },
      { name: 'Object.saveAll (batch save)', fn: benchmarkBatchSave },
      { name: 'Query.get (by objectId)', fn: benchmarkObjectRead },
      { name: 'Query.find (simple query)', fn: benchmarkSimpleQuery },
      { name: 'User.signUp', fn: benchmarkUserSignup },
      { name: 'User.login', fn: benchmarkUserLogin },
      { name: 'Query.include (parallel pointers)', fn: benchmarkQueryWithIncludeParallel },
      { name: 'Query.include (nested pointers)', fn: benchmarkQueryWithIncludeNested },
    ];

    // Run each benchmark with database cleanup
    for (const benchmark of benchmarks) {
      logInfo(`\nRunning benchmark '${benchmark.name}'...`);
      resetParseServer();
      await cleanupDatabase();
      results.push(await benchmark.fn(benchmark.name));
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
