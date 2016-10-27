'use strict';

var _parseLiveQueryServer = require('./definitions/parse-live-query-server');

var _parseLiveQueryServer2 = _interopRequireDefault(_parseLiveQueryServer);

var _runner = require('./utils/runner');

var _runner2 = _interopRequireDefault(_runner);

var _index = require('../index');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(0, _runner2.default)({
  definitions: _parseLiveQueryServer2.default,
  start: function start(program, options, logOptions) {
    logOptions();
    var app = (0, _express2.default)();
    var httpServer = require('http').createServer(app);
    httpServer.listen(options.port);
    _index.ParseServer.createLiveQueryServer(httpServer, options);
  }
});