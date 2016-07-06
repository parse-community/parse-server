'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _DatabaseAdapter = require('./DatabaseAdapter');

var unsupported = function unsupported() {
  throw 'Only supported in test environment';
};

var _destroyAllDataPermanently = void 0;
if (process.env.TESTING) {
  _destroyAllDataPermanently = _DatabaseAdapter.destroyAllDataPermanently;
} else {
  _destroyAllDataPermanently = unsupported;
}

exports.default = {
  destroyAllDataPermanently: _destroyAllDataPermanently };