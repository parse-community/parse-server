// Sets a global variable to the current test spec
// ex: global.currentSpec.description
const { performance } = require('perf_hooks');

global.currentSpec = null;

const timerMap = {};
const duplicates = [];
/** The minimum execution time in seconds for a test to be considered slow. */
const slowTestLimit = 2;
/** The number of times to retry a flaky test. */
const retries = 3;
/** Full name of tests that fail randomly and are considered flaky */
const flakyTests = [
  "ParseLiveQuery handle invalid websocket payload length",
];
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

global.displaySlowTests = function() {
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

global.retryFlakyTests = function() {
  const originalSpecConstructor = jasmine.Spec;

  jasmine.Spec = function(attrs) {
    const spec = new originalSpecConstructor(attrs);
    const originalTestFn = spec.queueableFn.fn;
    const runOriginalTest = () => {
      if (originalTestFn.length == 0) {
        // handle async testing
        return originalTestFn();
      } else {
        // handle done() callback
        return new Promise((resolve) => {
          originalTestFn(resolve);
        });
      }
    };
    spec.queueableFn.fn = async function() {
      const runs = flakyTests.includes(spec.result.fullName) ? retries : 1;
      let exceptionCaught;
      let returnValue;

      for (let i = 0; i < runs; ++i) {
        spec.result.failedExpectations = [];
        returnValue = undefined;
        exceptionCaught = undefined;
        try {
          returnValue = await runOriginalTest();
        } catch (exception) {
          exceptionCaught = exception;
        }
        const failed = !spec.markedPending &&
            (exceptionCaught || spec.result.failedExpectations.length != 0);
        if (!failed) {
          break;
        }
      }
      if (exceptionCaught) {
        throw exceptionCaught;
      }
      return returnValue;
    };
    return spec;
  };
}

module.exports = CurrentSpecReporter;
