/**
 * MongoDB Latency Wrapper
 *
 * Utility to inject artificial latency into MongoDB operations for performance testing.
 * This wrapper temporarily wraps MongoDB Collection methods to add delays before
 * database operations execute.
 *
 * Usage:
 *   const { wrapMongoDBWithLatency } = require('./MongoLatencyWrapper');
 *
 *   // Before initializing Parse Server
 *   const unwrap = wrapMongoDBWithLatency(10); // 10ms delay
 *
 *   // ... run benchmarks ...
 *
 *   // Cleanup when done
 *   unwrap();
 */

const { Collection } = require('mongodb');

// Store original methods for restoration
const originalMethods = new Map();

/**
 * Wrap a Collection method to add artificial latency
 * @param {string} methodName - Name of the method to wrap
 * @param {number} latencyMs - Delay in milliseconds
 */
function wrapMethod(methodName, latencyMs) {
  if (!originalMethods.has(methodName)) {
    originalMethods.set(methodName, Collection.prototype[methodName]);
  }

  const originalMethod = originalMethods.get(methodName);

  Collection.prototype[methodName] = function (...args) {
    // For methods that return cursors (like find, aggregate), we need to delay the execution
    // but still return a cursor-like object
    const result = originalMethod.apply(this, args);

    // Check if result has cursor methods (toArray, forEach, etc.)
    if (result && typeof result.toArray === 'function') {
      // Wrap cursor methods that actually execute the query
      const originalToArray = result.toArray.bind(result);
      result.toArray = function() {
        // Wait for the original promise to settle, then delay the result
        return originalToArray().then(
          value => new Promise(resolve => setTimeout(() => resolve(value), latencyMs)),
          error => new Promise((_, reject) => setTimeout(() => reject(error), latencyMs))
        );
      };
      return result;
    }

    // For promise-returning methods, wrap the promise with delay
    if (result && typeof result.then === 'function') {
      // Wait for the original promise to settle, then delay the result
      return result.then(
        value => new Promise(resolve => setTimeout(() => resolve(value), latencyMs)),
        error => new Promise((_, reject) => setTimeout(() => reject(error), latencyMs))
      );
    }

    // For synchronous methods, just add delay
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(result);
      }, latencyMs);
    });
  };
}

/**
 * Wrap MongoDB Collection methods with artificial latency
 * @param {number} latencyMs - Delay in milliseconds to inject before each operation
 * @returns {Function} unwrap - Function to restore original methods
 */
function wrapMongoDBWithLatency(latencyMs) {
  if (typeof latencyMs !== 'number' || latencyMs < 0) {
    throw new Error('latencyMs must be a non-negative number');
  }

  if (latencyMs === 0) {
    // eslint-disable-next-line no-console
    console.log('Latency is 0ms, skipping MongoDB wrapping');
    return () => {}; // No-op unwrap function
  }

  // eslint-disable-next-line no-console
  console.log(`Wrapping MongoDB operations with ${latencyMs}ms artificial latency`);

  // List of MongoDB Collection methods to wrap
  const methodsToWrap = [
    'find',
    'findOne',
    'countDocuments',
    'estimatedDocumentCount',
    'distinct',
    'aggregate',
    'insertOne',
    'insertMany',
    'updateOne',
    'updateMany',
    'replaceOne',
    'deleteOne',
    'deleteMany',
    'findOneAndUpdate',
    'findOneAndReplace',
    'findOneAndDelete',
    'createIndex',
    'createIndexes',
    'dropIndex',
    'dropIndexes',
    'drop',
  ];

  methodsToWrap.forEach(methodName => {
    wrapMethod(methodName, latencyMs);
  });

  // Return unwrap function to restore original methods
  return function unwrap() {
    // eslint-disable-next-line no-console
    console.log('Removing MongoDB latency wrapper, restoring original methods');

    originalMethods.forEach((originalMethod, methodName) => {
      Collection.prototype[methodName] = originalMethod;
    });

    originalMethods.clear();
  };
}

module.exports = {
  wrapMongoDBWithLatency,
};
