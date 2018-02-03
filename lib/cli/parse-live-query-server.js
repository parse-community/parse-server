'use strict';

var _parseLiveQueryServer = require('./definitions/parse-live-query-server');

var _parseLiveQueryServer2 = _interopRequireDefault(_parseLiveQueryServer);

var _runner = require('./utils/runner');

var _runner2 = _interopRequireDefault(_runner);

var _index = require('../index');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(0, _runner2.default)({
  definitions: _parseLiveQueryServer2.default,
  start: function (program, options, logOptions) {
    logOptions();
    _index.ParseServer.createLiveQueryServer(undefined, options);
  }
});