'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var toString = Object.prototype.toString;

/**
 * Determines whether two objects represent the same primitive, special Parse
 * type, or full Parse Object.
 */
function equalObjects(a, b) {
  if ((typeof a === 'undefined' ? 'undefined' : _typeof(a)) !== (typeof b === 'undefined' ? 'undefined' : _typeof(b))) {
    return false;
  }
  if ((typeof a === 'undefined' ? 'undefined' : _typeof(a)) !== 'object') {
    return a === b;
  }
  if (a === b) {
    return true;
  }
  if (toString.call(a) === '[object Date]') {
    if (toString.call(b) === '[object Date]') {
      return +a === +b;
    }
    return false;
  }
  if (Array.isArray(a)) {
    if (Array.isArray(b)) {
      if (a.length !== b.length) {
        return false;
      }
      for (var i = 0; i < a.length; i++) {
        if (!equalObjects(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
  if (Object.keys(a).length !== Object.keys(b).length) {
    return false;
  }
  for (var key in a) {
    if (!equalObjects(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

module.exports = equalObjects;