const definitions = require('./definitions/parse-live-query-server');
const runner = require('./utils/runner');
const { ParseServer } = require('../index');

runner({
  definitions,
  start: function(program, options, logOptions) {
    logOptions();
    ParseServer.createLiveQueryServer(undefined, options);
  }
})
