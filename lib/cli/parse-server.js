'use strict';

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _index = require('../index');

var _index2 = _interopRequireDefault(_index);

var _parseServer = require('./definitions/parse-server');

var _parseServer2 = _interopRequireDefault(_parseServer);

var _cluster = require('cluster');

var _cluster2 = _interopRequireDefault(_cluster);

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _runner = require('./utils/runner');

var _runner2 = _interopRequireDefault(_runner);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable no-console */
var path = require("path");

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
  if (options.middleware) {
    var middleware = void 0;
    if (typeof options.middleware == 'function') {
      middleware = options.middleware;
    }if (typeof options.middleware == 'string') {
      middleware = require(path.resolve(process.cwd(), options.middleware));
    } else {
      throw "middleware should be a string or a function";
    }
    app.use(middleware);
  }

  var parseServer = new _index2.default(options);
  var sockets = {};
  app.use(options.mountPath, parseServer.app);

  var server = app.listen(options.port, options.host, callback);
  server.on('connection', initializeConnections);

  if (options.startLiveQueryServer || options.liveQueryServerOptions) {
    var liveQueryServer = server;
    if (options.liveQueryPort) {
      liveQueryServer = (0, _express2.default)().listen(options.liveQueryPort, function () {
        console.log('ParseLiveQuery listening on ' + options.liveQueryPort);
      });
    }
    _index2.default.createLiveQueryServer(liveQueryServer, options.liveQueryServerOptions);
  }

  function initializeConnections(socket) {
    /* Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM if it has client connections that haven't timed out. (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
       This function, along with `destroyAliveConnections()`, intend to fix this behavior such that parse server will close all open connections and initiate the shutdown process as soon as it receives a SIGINT/SIGTERM signal. */

    var socketId = socket.remoteAddress + ':' + socket.remotePort;
    sockets[socketId] = socket;

    socket.on('close', function () {
      delete sockets[socketId];
    });
  }

  function destroyAliveConnections() {
    for (var socketId in sockets) {
      try {
        sockets[socketId].destroy();
      } catch (e) {/* */}
    }
  }

  var handleShutdown = function handleShutdown() {
    console.log('Termination signal received. Shutting down.');
    destroyAliveConnections();
    server.close();
    parseServer.handleShutdown();
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
        logOptions();
        for (var i = 0; i < numCPUs; i++) {
          _cluster2.default.fork();
        }
        _cluster2.default.on('exit', function (worker, code) {
          console.log('worker ' + worker.process.pid + ' died (' + code + ')... Restarting');
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

/* eslint-enable no-console */