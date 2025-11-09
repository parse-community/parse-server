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

const Parse = require('parse/node');
const { performance, PerformanceObserver } = require('perf_hooks');
const { MongoClient } = require('mongodb');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/parse_benchmark_test';
const SERVER_URL = 'http://localhost:1337/parse';
const APP_ID = 'benchmark-app-id';
const MASTER_KEY = 'benchmark-master-key';
const ITERATIONS = parseInt(process.env.BENCHMARK_ITERATIONS || '1000', 10);

// Parse Server instance
let parseServer;
let mongoClient;

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
 * Measure average time for an async operation over multiple iterations
 * Uses warmup iterations, median metric, and outlier filtering for robustness
 */
async function measureOperation(name, operation, iterations = ITERATIONS) {
  const warmupCount = Math.floor(iterations * 0.2); // 20% warmup iterations
  const times = [];

  // Warmup phase - stabilize JIT compilation and caches
  for (let i = 0; i < warmupCount; i++) {
    await operation();
  }

  // Measurement phase
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await operation();
    const end = performance.now();
    times.push(end - start);
  }

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
}

/**
 * Benchmark: Object Create
 */
async function benchmarkObjectCreate() {
  let counter = 0;

  return measureOperation('Object Create', async () => {
    const TestObject = Parse.Object.extend('BenchmarkTest');
    const obj = new TestObject();
    obj.set('testField', `test-value-${counter++}`);
    obj.set('number', counter);
    obj.set('boolean', true);
    await obj.save();
  });
}

/**
 * Benchmark: Object Read (by ID)
 */
async function benchmarkObjectRead() {
  // Setup: Create test objects
  const TestObject = Parse.Object.extend('BenchmarkTest');
  const objects = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const obj = new TestObject();
    obj.set('testField', `read-test-${i}`);
    objects.push(obj);
  }

  await Parse.Object.saveAll(objects);

  let counter = 0;

  return measureOperation('Object Read', async () => {
    const query = new Parse.Query('BenchmarkTest');
    await query.get(objects[counter++ % objects.length].id);
  });
}

/**
 * Benchmark: Object Update
 */
async function benchmarkObjectUpdate() {
  // Setup: Create test objects
  const TestObject = Parse.Object.extend('BenchmarkTest');
  const objects = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const obj = new TestObject();
    obj.set('testField', `update-test-${i}`);
    obj.set('counter', 0);
    objects.push(obj);
  }

  await Parse.Object.saveAll(objects);

  let counter = 0;

  return measureOperation('Object Update', async () => {
    const obj = objects[counter++ % objects.length];
    obj.increment('counter');
    obj.set('lastUpdated', new Date());
    await obj.save();
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

  return measureOperation('Simple Query', async () => {
    const query = new Parse.Query('BenchmarkTest');
    query.equalTo('category', counter++ % 10);
    await query.find();
  });
}

/**
 * Benchmark: Batch Save (saveAll)
 */
async function benchmarkBatchSave() {
  const BATCH_SIZE = 10;

  return measureOperation('Batch Save (10 objects)', async () => {
    const TestObject = Parse.Object.extend('BenchmarkTest');
    const objects = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      const obj = new TestObject();
      obj.set('batchField', `batch-${i}`);
      obj.set('timestamp', new Date());
      objects.push(obj);
    }

    await Parse.Object.saveAll(objects);
  });
}

/**
 * Benchmark: User Signup
 */
async function benchmarkUserSignup() {
  let counter = 0;

  return measureOperation('User Signup', async () => {
    counter++;
    const user = new Parse.User();
    user.set('username', `benchmark_user_${Date.now()}_${counter}`);
    user.set('password', 'benchmark_password');
    user.set('email', `benchmark${counter}@example.com`);
    await user.signUp();
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

  return measureOperation('User Login', async () => {
    const userCreds = users[counter++ % users.length];
    await Parse.User.logIn(userCreds.username, userCreds.password);
    await Parse.User.logOut();
  });
}

/**
 * Run all benchmarks
 */
async function runBenchmarks() {
  console.log('Starting Parse Server Performance Benchmarks...');
  console.log(`Iterations per benchmark: ${ITERATIONS}`);

  let server;

  try {
    // Initialize Parse Server
    console.log('Initializing Parse Server...');
    server = await initializeParseServer();

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    const results = [];

    // Run each benchmark with database cleanup
    console.log('Running Object Create benchmark...');
    await cleanupDatabase();
    results.push(await benchmarkObjectCreate());

    console.log('Running Object Read benchmark...');
    await cleanupDatabase();
    results.push(await benchmarkObjectRead());

    console.log('Running Object Update benchmark...');
    await cleanupDatabase();
    results.push(await benchmarkObjectUpdate());

    console.log('Running Simple Query benchmark...');
    await cleanupDatabase();
    results.push(await benchmarkSimpleQuery());

    console.log('Running Batch Save benchmark...');
    await cleanupDatabase();
    results.push(await benchmarkBatchSave());

    console.log('Running User Signup benchmark...');
    await cleanupDatabase();
    results.push(await benchmarkUserSignup());

    console.log('Running User Login benchmark...');
    await cleanupDatabase();
    results.push(await benchmarkUserLogin());

    // Output results in github-action-benchmark format (stdout)
    console.log(JSON.stringify(results, null, 2));

    // Output summary to stderr for visibility
    console.log('Benchmarks completed successfully!');
    console.log('Summary:');
    results.forEach(result => {
      console.log(`  ${result.name}: ${result.value.toFixed(2)} ${result.unit} (${result.extra})`);
    });

  } catch (error) {
    console.error('Error running benchmarks:', error);
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
