'use strict';

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _index = require('../index');

var _cliDefinitions = require('./cli-definitions');

var _cliDefinitions2 = _interopRequireDefault(_cliDefinitions);

var _commander = require('./utils/commander');

var _commander2 = _interopRequireDefault(_commander);

var _colors = require('colors');

var _colors2 = _interopRequireDefault(_colors);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

_commander2.default.loadDefinitions(_cliDefinitions2.default);

_commander2.default.usage('[options] <path/to/configuration.json>');

_commander2.default.on('--help', function () {
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
});

_commander2.default.parse(process.argv, process.env);

var options = _commander2.default.getOptions();

if (!options.serverURL) {
  options.serverURL = 'http://localhost:' + options.port + options.mountPath;
}

if (!options.appId || !options.masterKey || !options.serverURL) {
  _commander2.default.outputHelp();
  console.error("");
  console.error(_colors2.default.red("ERROR: appId and masterKey are required"));
  console.error("");
  process.exit(1);
}

var app = (0, _express2.default)();
var api = new _index.ParseServer(options);
app.use(options.mountPath, api);

var server = app.listen(options.port, function () {

  for (var key in options) {
    var value = options[key];
    if (key == "masterKey") {
      value = "***REDACTED***";
    }
    console.log(key + ': ' + value);
  }
  console.log('');
  console.log('parse-server running on ' + options.serverURL);
});

var handleShutdown = function handleShutdown() {
  console.log('Termination signal received. Shutting down.');
  server.close(function () {
    process.exit(0);
  });
};
process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);