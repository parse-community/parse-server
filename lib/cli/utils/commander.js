'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var _commander = require('commander');

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _definitions = void 0;
var _reverseDefinitions = void 0;
var _defaults = void 0;

_commander.Command.prototype.loadDefinitions = function (definitions) {
  _definitions = definitions;

  Object.keys(definitions).reduce(function (program, opt) {
    if (_typeof(definitions[opt]) == "object") {
      var additionalOptions = definitions[opt];
      if (additionalOptions.required === true) {
        return program.option('--' + opt + ' <' + opt + '>', additionalOptions.help, additionalOptions.action);
      } else {
        return program.option('--' + opt + ' [' + opt + ']', additionalOptions.help, additionalOptions.action);
      }
    }
    return program.option('--' + opt + ' [' + opt + ']');
  }, this);

  _defaults = Object.keys(definitions).reduce(function (defs, opt) {
    if (_definitions[opt].default) {
      defs[opt] = _definitions[opt].default;
    }
    return defs;
  }, {});

  _reverseDefinitions = Object.keys(definitions).reduce(function (object, key) {
    var value = definitions[key];
    if ((typeof value === 'undefined' ? 'undefined' : _typeof(value)) == "object") {
      value = value.env;
    }
    if (value) {
      object[value] = key;
    }
    return object;
  }, {});

  /* istanbul ignore next */
  this.on('--help', function () {
    console.log('  Configure From Environment:');
    console.log('');
    Object.keys(_reverseDefinitions).forEach(function (key) {
      console.log('    $ ' + key + '=\'' + _reverseDefinitions[key] + '\'');
    });
    console.log('');
  });
};

function parseEnvironment() {
  var env = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

  return Object.keys(_reverseDefinitions).reduce(function (options, key) {
    if (env[key]) {
      var originalKey = _reverseDefinitions[key];
      var action = function action(option) {
        return option;
      };
      if (_typeof(_definitions[originalKey]) === "object") {
        action = _definitions[originalKey].action || action;
      }
      options[_reverseDefinitions[key]] = action(env[key]);
    }
    return options;
  }, {});
}

function parseConfigFile(program) {
  var options = {};
  if (program.args.length > 0) {
    var jsonPath = program.args[0];
    jsonPath = _path2.default.resolve(jsonPath);
    var jsonConfig = require(jsonPath);
    if (jsonConfig.apps) {
      if (jsonConfig.apps.length > 1) {
        throw 'Multiple apps are not supported';
      }
      options = jsonConfig.apps[0];
    } else {
      options = jsonConfig;
    }
    Object.keys(options).forEach(function (key) {
      var value = options[key];
      if (!_definitions[key]) {
        throw 'error: unknown option ' + key;
      }
      var action = _definitions[key].action;
      if (action) {
        options[key] = action(value);
      }
    });
    console.log('Configuration loaded from ' + jsonPath);
  }
  return options;
}

_commander.Command.prototype.setValuesIfNeeded = function (options) {
  var _this = this;

  Object.keys(options).forEach(function (key) {
    if (!_this[key]) {
      _this[key] = options[key];
    }
  });
};

_commander.Command.prototype._parse = _commander.Command.prototype.parse;

_commander.Command.prototype.parse = function (args, env) {
  this._parse(args);
  // Parse the environment first
  var envOptions = parseEnvironment(env);
  var fromFile = parseConfigFile(this);
  // Load the env if not passed from command line
  this.setValuesIfNeeded(envOptions);
  // Load from file to override
  this.setValuesIfNeeded(fromFile);
  // Last set the defaults
  this.setValuesIfNeeded(_defaults);
};

_commander.Command.prototype.getOptions = function () {
  var _this2 = this;

  return Object.keys(_definitions).reduce(function (options, key) {
    if (typeof _this2[key] !== 'undefined') {
      options[key] = _this2[key];
    }
    return options;
  }, {});
};

exports.default = new _commander.Command();