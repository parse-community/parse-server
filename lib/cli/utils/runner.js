"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.default = function (_ref) {
  var definitions = _ref.definitions,
      help = _ref.help,
      usage = _ref.usage,
      start = _ref.start;

  _commander2.default.loadDefinitions(definitions);
  if (usage) {
    _commander2.default.usage(usage);
  }
  if (help) {
    _commander2.default.on('--help', help);
  }
  _commander2.default.parse(process.argv, process.env);

  var options = _commander2.default.getOptions();
  start(_commander2.default, options, function () {
    logStartupOptions(options);
  });
};

var _commander = require("./commander");

var _commander2 = _interopRequireDefault(_commander);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function logStartupOptions(options) {
  for (var key in options) {
    var value = options[key];
    if (key == "masterKey") {
      value = "***REDACTED***";
    }
    if ((typeof value === "undefined" ? "undefined" : _typeof(value)) === 'object') {
      value = JSON.stringify(value);
    }
    /* eslint-disable no-console */
    console.log(key + ": " + value);
    /* eslint-enable no-console */
  }
}