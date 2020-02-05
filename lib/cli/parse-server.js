'use strict';

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

const help = function () {
  console.log('  Get Started guide:');
  console.log('');
  console.log('    Please have a look at the get started guide!');
  console.log('    http://docs.parseplatform.org/parse-server/guide/');
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
}; /* eslint-disable no-console */


(0, _runner2.default)({
  definitions: _parseServer2.default,
  help,
  usage: '[options] <path/to/configuration.json>',
  start: function (program, options, logOptions) {
    if (!options.appId || !options.masterKey) {
      program.outputHelp();
      console.error("");
      console.error('\u001b[31mERROR: appId and masterKey are required\u001b[0m');
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
      const numCPUs = typeof options.cluster === 'number' ? options.cluster : _os2.default.cpus().length;
      if (_cluster2.default.isMaster) {
        logOptions();
        for (let i = 0; i < numCPUs; i++) {
          _cluster2.default.fork();
        }
        _cluster2.default.on('exit', (worker, code) => {
          console.log(`worker ${worker.process.pid} died (${code})... Restarting`);
          _cluster2.default.fork();
        });
      } else {
        _index2.default.start(options, () => {
          console.log('[' + process.pid + '] parse-server running on ' + options.serverURL);
        });
      }
    } else {
      _index2.default.start(options, () => {
        logOptions();
        console.log('');
        console.log('[' + process.pid + '] parse-server running on ' + options.serverURL);
      });
    }
  }
});

/* eslint-enable no-console */