"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function ({
  definitions,
  help,
  usage,
  start
}) {
  _commander2.default.loadDefinitions(definitions);
  if (usage) {
    _commander2.default.usage(usage);
  }
  if (help) {
    _commander2.default.on('--help', help);
  }
  _commander2.default.parse(process.argv, process.env);

  const options = _commander2.default.getOptions();
  start(_commander2.default, options, function () {
    logStartupOptions(options);
  });
};

var _commander = require("./commander");

var _commander2 = _interopRequireDefault(_commander);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function logStartupOptions(options) {
  for (const key in options) {
    let value = options[key];
    if (key == "masterKey") {
      value = "***REDACTED***";
    }
    if (typeof value === 'object') {
      try {
        value = JSON.stringify(value);
      } catch (e) {
        if (value && value.constructor && value.constructor.name) {
          value = value.constructor.name;
        }
      }
    }
    /* eslint-disable no-console */
    console.log(`${key}: ${value}`);
    /* eslint-enable no-console */
  }
}