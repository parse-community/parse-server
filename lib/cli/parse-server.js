'use strict';

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _index = require('../index');

var _parseServer = require('./definitions/parse-server');

var _parseServer2 = _interopRequireDefault(_parseServer);

var _cluster = require('cluster');

var _cluster2 = _interopRequireDefault(_cluster);

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _runner = require('./utils/runner');

var _runner2 = _interopRequireDefault(_runner);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var help = function help() {
  console.log('  Get Started guide:');
  console.log('');
  console.log('    Please have a look at the get started guide!');
  console.log('    https://github.com/ParsePlatform/parse-server/wiki/Parse-Server-Guide');
  console.log('');
  console.log('');
  console.log('  Usage with npm start');
  console.log('');
  console.log('    $ npm start -- path/to/config.json');
  console.log('    $ npm start -- --appId APP_ID --masterKey MASTER_KEY --serverURL serverURL');
  console.log('    $ npm start -- --appId APP_ID --masterKey MASTER_KEY --serverURL serverURL');
  console.log('');
  console.log('');
  console.log('  Usage:');
  console.log('');
  console.log('    $ parse-server path/to/config.json');
  console.log('    $ parse-server -- --appId APP_ID --masterKey MASTER_KEY --serverURL serverURL');
  console.log('    $ parse-server -- --appId APP_ID --masterKey MASTER_KEY --serverURL serverURL');
  console.log('');
};

function startServer(options, callback) {
  var app = (0, _express2.default)();
  var api = new _index.ParseServer(options);
  app.use(options.mountPath, api);

  var server = app.listen(options.port, callback);
  if (options.startLiveQueryServer || options.liveQueryServerOptions) {
    var liveQueryServer = server;
    if (options.liveQueryPort) {
      liveQueryServer = (0, _express2.default)().listen(options.liveQueryPort, function () {
        console.log('ParseLiveQuery listening on ' + options.liveQueryPort);
      });
    }
    _index.ParseServer.createLiveQueryServer(liveQueryServer, options.liveQueryServerOptions);
  }
  var handleShutdown = function handleShutdown() {
    console.log('Termination signal received. Shutting down.');
    server.close(function () {
      process.exit(0);
    });
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

(0, _runner2.default)({
  definitions: _parseServer2.default,
  help: help,
  usage: '[options] <path/to/configuration.json>',
  start: function start(program, options, logOptions) {
    if (!options.serverURL) {
      options.serverURL = 'http://localhost:' + options.port + options.mountPath;
    }

    if (!options.appId || !options.masterKey || !options.serverURL) {
      program.outputHelp();
      console.error("");
      console.error('\x1B[31mERROR: appId and masterKey are required\x1B[0m');
      console.error("");
      process.exit(1);
    }

    if (options["liveQuery.classNames"]) {
      options.liveQuery = options.liveQuery || {};
      options.liveQuery.classNames = options["liveQuery.classNames"];
      delete options["liveQuery.classNames"];
    }
    if (options["liveQuery.redisURL"]) {
      options.liveQuery = options.liveQuery || {};
      options.liveQuery.redisURL = options["liveQuery.redisURL"];
      delete options["liveQuery.redisURL"];
    }

    if (options.cluster) {
      var numCPUs = typeof options.cluster === 'number' ? options.cluster : _os2.default.cpus().length;
      if (_cluster2.default.isMaster) {
        for (var i = 0; i < numCPUs; i++) {
          _cluster2.default.fork();
        }
        _cluster2.default.on('exit', function (worker, code, signal) {
          console.log('worker ' + worker.process.pid + ' died... Restarting');
          _cluster2.default.fork();
        });
      } else {
        startServer(options, function () {
          console.log('[' + process.pid + '] parse-server running on ' + options.serverURL);
        });
      }
    } else {
      startServer(options, function () {
        logOptions();
        console.log('');
        console.log('[' + process.pid + '] parse-server running on ' + options.serverURL);
      });
    }
  }
});