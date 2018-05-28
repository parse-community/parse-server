"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
class NullCacheAdapter {

  constructor() {}

  get() {
    return new Promise(resolve => {
      return resolve(null);
    });
  }

  put() {
    return Promise.resolve();
  }

  del() {
    return Promise.resolve();
  }

  clear() {
    return Promise.resolve();
  }
}

exports.NullCacheAdapter = NullCacheAdapter;
exports.default = NullCacheAdapter;