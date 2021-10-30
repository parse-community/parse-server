// Sets a global variable to the current test spec
// ex: global.currentSpec.description

global.currentSpec = null;

class CurrentSpecReporter {
  specStarted(spec) {
    global.currentSpec = spec;
  }
  specDone() {
    global.currentSpec = null;
  }
}

module.exports = CurrentSpecReporter;
