// Sets a global variable to the current test spec
// ex: global.currentSpec.description
const { performance } = require('perf_hooks');
global.currentSpec = null;

const timerMap = {};

class CurrentSpecReporter {
  specStarted(spec) {
    if (timerMap[spec.fullName]) {
      console.log('Duplicate spec: ' + spec.fullName);
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
  console.log('Showing slowest tests:');
  const times = Object.values(timerMap).sort((a,b) => b - a);
  times.forEach((time) => {
    // Show test taking longer than 2 second
    if (time > 2) {
      console.warn(Object.keys(timerMap).find(key => timerMap[key] === time), `${time.toFixed(3)}s`);
    }
  });
  console.log('\n');
};

module.exports = CurrentSpecReporter;
