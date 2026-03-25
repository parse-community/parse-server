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
 * Wraps test functions that use both `async` and a `done` callback, which Jasmine 5
 * does not support. This converts `async (done) => { ... }` to a promise-based
 * function so Jasmine does not throw:
 * "An asynchronous before/it/after function was defined with the async keyword
 * but also took a done callback."
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

  // Wrap it() specs
  const originalSpecConstructor = jasmine.Spec;
  jasmine.Spec = function(attrs) {
    const spec = new originalSpecConstructor(attrs);
    spec.queueableFn.fn = wrapDoneCallback(spec.queueableFn.fn);
    return spec;
  };

  // Wrap beforeEach/afterEach/beforeAll/afterAll
  const originalBeforeEach = jasmine.Suite.prototype.beforeEach;
  jasmine.Suite.prototype.beforeEach = function(fn) {
    fn.fn = wrapDoneCallback(fn.fn);
    return originalBeforeEach.call(this, fn);
  };
  const originalAfterEach = jasmine.Suite.prototype.afterEach;
  jasmine.Suite.prototype.afterEach = function(fn) {
    fn.fn = wrapDoneCallback(fn.fn);
    return originalAfterEach.call(this, fn);
  };
  const originalBeforeAll = jasmine.Suite.prototype.beforeAll;
  jasmine.Suite.prototype.beforeAll = function(fn) {
    fn.fn = wrapDoneCallback(fn.fn);
    return originalBeforeAll.call(this, fn);
  };
  const originalAfterAll = jasmine.Suite.prototype.afterAll;
  jasmine.Suite.prototype.afterAll = function(fn) {
    fn.fn = wrapDoneCallback(fn.fn);
    return originalAfterAll.call(this, fn);
  };
};

module.exports = CurrentSpecReporter;
