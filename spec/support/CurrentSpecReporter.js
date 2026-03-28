// Sets a global variable to the current test spec
// ex: global.currentSpec.description
const { performance } = require('perf_hooks');

global.currentSpec = null;

/** The minimum execution time in seconds for a test to be considered slow. */
const slowTestLimit = 2;

const timerMap = {};
const duplicates = [];
class CurrentSpecReporter {
  specStarted(spec) {
    if (timerMap[spec.fullName]) {
      console.log('Duplicate spec: ' + spec.fullName);
      duplicates.push(spec.fullName);
    }
    timerMap[spec.fullName] = performance.now();
    global.currentSpec = spec;
  }
  specDone(result) {
    if (result.status === 'excluded') {
      delete timerMap[result.fullName];
      return;
    }
    timerMap[result.fullName] = (performance.now() - timerMap[result.fullName]) / 1000;
    global.currentSpec = null;
  }
}

global.displayTestStats = function() {
  const times = Object.values(timerMap).sort((a,b) => b - a).filter(time => time >= slowTestLimit);
  if (times.length > 0) {
    console.log(`Slow tests with execution time >=${slowTestLimit}s:`);
  }
  times.forEach((time) => {
    console.warn(`${time.toFixed(1)}s:`, Object.keys(timerMap).find(key => timerMap[key] === time));
  });
  console.log('\n');
  duplicates.forEach((spec) => {
    console.warn('Duplicate spec: ' + spec);
  });
  console.log('\n');
};

/**
 * Transitional compatibility shim for Jasmine 5.
 *
 * Jasmine 5 throws when a test or hook function uses both `async` and a `done` callback:
 * "An asynchronous before/it/after function was defined with the async keyword
 * but also took a done callback."
 *
 * Many existing tests use `async (done) => { ... done(); }`. This wrapper converts
 * those to promise-based functions by intercepting the `done` callback and resolving
 * a promise instead, so Jasmine sees a plain async function.
 *
 * To remove this shim, convert each file below so that tests and hooks use plain
 * `async () => {}` without a `done` parameter, then remove the file from this list.
 * Once the list is empty, delete this function and its call in `helper.js`.
 */
global.normalizeAsyncTests = function() {
  function wrapDoneCallback(fn) {
    if (fn.length > 0) {
      return function() {
        return new Promise((resolve) => {
          fn.call(this, resolve);
        });
      };
    }
    return fn;
  }

  function wrapGlobal(name) {
    const original = global[name];
    global[name] = function(descriptionOrFn, fn, timeout) {
      const args = Array.from(arguments);
      if (typeof descriptionOrFn === 'function') {
        args[0] = wrapDoneCallback(descriptionOrFn);
        return original.apply(this, args);
      }
      if (typeof fn === 'function') {
        args[1] = wrapDoneCallback(fn);
        return original.apply(this, args);
      }
      return original.apply(this, args);
    };
    if (original.each) {
      global[name].each = original.each;
    }
  }

  wrapGlobal('it');
  wrapGlobal('fit');
  wrapGlobal('beforeEach');
  wrapGlobal('afterEach');
  wrapGlobal('beforeAll');
  wrapGlobal('afterAll');
};

module.exports = CurrentSpecReporter;
