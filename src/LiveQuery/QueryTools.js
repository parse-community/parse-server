var equalObjects = require('./equalObjects');
var Id = require('./Id');
var Parse = require('parse/node');
var vm = require('vm');
var logger = require('../logger').default;

var regexTimeout = 0;
// IMPORTANT: vmContext is shared across all calls for performance (vm.createContext() is expensive).
// This is safe because safeRegexTest is synchronous — setting the context properties and calling
// runInContext happen in the same event loop tick with no interruption possible. Do NOT add any
// asynchronous operations (await, callbacks, promises) between setting vmContext properties and
// calling script.runInContext, as this would allow other calls to overwrite the context values
// and cause cross-contamination between regex evaluations.
var vmContext = vm.createContext(Object.create(null));
var scriptCache = new Map();
var SCRIPT_CACHE_MAX = 1000;

function setRegexTimeout(ms) {
  regexTimeout = ms;
}

// IMPORTANT: This function must remain synchronous. See vmContext comment above.
function safeRegexTest(pattern, flags, input) {
  try {
    if (!regexTimeout) {
      var re = new RegExp(pattern, flags);
      return re.test(input);
    }
    var cacheKey = flags + ':' + pattern;
    var script = scriptCache.get(cacheKey);
    if (!script) {
      if (scriptCache.size >= SCRIPT_CACHE_MAX) { scriptCache.clear(); }
      script = new vm.Script('new RegExp(pattern, flags).test(input)');
      scriptCache.set(cacheKey, script);
    }
    vmContext.pattern = pattern;
    vmContext.flags = flags;
    vmContext.input = input;
    return script.runInContext(vmContext, { timeout: regexTimeout });
  } catch (e) {
    if (e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      logger.warn(`Regex timeout: pattern "${pattern}" with flags "${flags}" exceeded ${regexTimeout}ms limit`);
    } else {
      logger.warn(`Invalid regex: pattern "${pattern}" with flags "${flags}": ${e.message}`);
    }
    return false;
  }
}

/**
 * Query Hashes are deterministic hashes for Parse Queries.
 * Any two queries that have the same set of constraints will produce the same
 * hash. This lets us reliably group components by the queries they depend upon,
 * and quickly determine if a query has changed.
 */

// Operators whose array argument is a set, so element order carries no meaning.
// Their elements are sorted before hashing; every other array is hashed in order.
var ORDER_INSENSITIVE_OPERATORS = ['$or', '$and', '$nor', '$in', '$nin', '$all', '$containedBy'];

/**
 * Canonically serializes a query `where` into an unambiguous string. Object keys
 * are sorted so key order never affects the result, and the elements of a set
 * operator (see ORDER_INSENSITIVE_OPERATORS) are sorted so their order does not
 * either; all other array order is preserved. Keys and values are JSON-encoded,
 * so every key, the whole structure, and each value type is represented
 * distinctly. Unlike the former flatten-and-list approach, this keeps every key
 * next to `$or` (including the server-added `_Session` `user` pointer and
 * `beforeSubscribe` constraints), so queries that differ only in those keys hash
 * differently.
 */
function canonicalize(value, orderInsensitive) {
  if (Array.isArray(value)) {
    var items = value.map(function (item) {
      return canonicalize(item, false);
    });
    if (orderInsensitive) {
      items.sort();
    }
    return '[' + items.join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    var keys = Object.keys(value).sort();
    var sections = keys.map(function (key) {
      return JSON.stringify(key) + ':' + canonicalize(value[key], ORDER_INSENSITIVE_OPERATORS.indexOf(key) > -1);
    });
    return '{' + sections.join(',') + '}';
  }
  return JSON.stringify(value);
}

/**
 * Generate a deterministic hash from a query's class name and `where` clause.
 * Any two queries with equivalent constraints produce the same hash.
 */
function queryHash(query) {
  if (query instanceof Parse.Query) {
    query = {
      className: query.className,
      where: query._where,
    };
  }
  return query.className + ':' + canonicalize(query.where || {}, false);
}

/**
 * contains -- Determines if an object is contained in a list with special handling for Parse pointers.
 */
function contains(haystack: Array, needle: any): boolean {
  if (needle && needle.__type && needle.__type === 'Pointer') {
    for (const i in haystack) {
      const ptr = haystack[i];
      if (typeof ptr === 'string' && ptr === needle.objectId) {
        return true;
      }
      if (ptr.className === needle.className && ptr.objectId === needle.objectId) {
        return true;
      }
    }

    return false;
  }

  if (Array.isArray(needle)) {
    for (const need of needle) {
      if (contains(haystack, need)) {
        return true;
      }
    }
  }

  return haystack.indexOf(needle) > -1;
}
/**
 * matchesQuery -- Determines if an object would be returned by a Parse Query
 * It's a lightweight, where-clause only implementation of a full query engine.
 * Since we find queries that match objects, rather than objects that match
 * queries, we can avoid building a full-blown query tool.
 */
function matchesQuery(object: any, query: any): boolean {
  if (query instanceof Parse.Query) {
    var className = object.id instanceof Id ? object.id.className : object.className;
    if (className !== query.className) {
      return false;
    }
    return matchesQuery(object, query._where);
  }
  for (var field in query) {
    if (!matchesKeyConstraints(object, field, query[field])) {
      return false;
    }
  }
  return true;
}

function equalObjectsGeneric(obj, compareTo, eqlFn) {
  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      if (eqlFn(obj[i], compareTo)) {
        return true;
      }
    }
    return false;
  }

  return eqlFn(obj, compareTo);
}

/**
 * Determines whether an object matches a single key's constraints
 */
function matchesKeyConstraints(object, key, constraints) {
  if (constraints === null) {
    return false;
  }
  if (key.indexOf('.') >= 0) {
    // Key references a subobject
    var keyComponents = key.split('.');
    var subObjectKey = keyComponents[0];
    var keyRemainder = keyComponents.slice(1).join('.');
    return matchesKeyConstraints(object[subObjectKey] || {}, keyRemainder, constraints);
  }
  var i;
  if (key === '$or') {
    if (!Array.isArray(constraints)) {
      return false;
    }
    for (i = 0; i < constraints.length; i++) {
      if (matchesQuery(object, constraints[i])) {
        return true;
      }
    }
    return false;
  }
  if (key === '$and') {
    if (!Array.isArray(constraints)) {
      return false;
    }
    for (i = 0; i < constraints.length; i++) {
      if (!matchesQuery(object, constraints[i])) {
        return false;
      }
    }
    return true;
  }
  if (key === '$nor') {
    if (!Array.isArray(constraints)) {
      return false;
    }
    for (i = 0; i < constraints.length; i++) {
      if (matchesQuery(object, constraints[i])) {
        return false;
      }
    }
    return true;
  }
  if (key === '$relatedTo') {
    // Bail! We can't handle relational queries locally
    return false;
  }
  // Decode Date JSON value
  if (object[key] && object[key].__type == 'Date') {
    object[key] = new Date(object[key].iso);
  }
  // Equality (or Array contains) cases
  if (typeof constraints !== 'object') {
    if (Array.isArray(object[key])) {
      return object[key].indexOf(constraints) > -1;
    }
    return object[key] === constraints;
  }
  var compareTo;
  if (constraints.__type) {
    if (constraints.__type === 'Pointer') {
      return equalObjectsGeneric(object[key], constraints, function (obj, ptr) {
        return (
          typeof obj !== 'undefined' &&
          ptr.className === obj.className &&
          ptr.objectId === obj.objectId
        );
      });
    }

    return equalObjectsGeneric(object[key], Parse._decode(key, constraints), equalObjects);
  }
  // More complex cases
  for (var condition in constraints) {
    compareTo = constraints[condition];
    if (compareTo?.__type) {
      compareTo = Parse._decode(key, compareTo);
    }
    switch (condition) {
      case '$lt':
        if (object[key] >= compareTo) {
          return false;
        }
        break;
      case '$lte':
        if (object[key] > compareTo) {
          return false;
        }
        break;
      case '$gt':
        if (object[key] <= compareTo) {
          return false;
        }
        break;
      case '$gte':
        if (object[key] < compareTo) {
          return false;
        }
        break;
      case '$eq':
        if (!equalObjects(object[key], compareTo)) {
          return false;
        }
        break;
      case '$ne':
        if (equalObjects(object[key], compareTo)) {
          return false;
        }
        break;
      case '$in':
        if (!contains(compareTo, object[key])) {
          return false;
        }
        break;
      case '$nin':
        if (contains(compareTo, object[key])) {
          return false;
        }
        break;
      case '$all':
        if (!object[key]) {
          return false;
        }
        for (i = 0; i < compareTo.length; i++) {
          if (object[key].indexOf(compareTo[i]) < 0) {
            return false;
          }
        }
        break;
      case '$exists': {
        const propertyExists = typeof object[key] !== 'undefined';
        const existenceIsRequired = constraints['$exists'];
        if (typeof constraints['$exists'] !== 'boolean') {
          // The SDK will never submit a non-boolean for $exists, but if someone
          // tries to submit a non-boolean for $exits outside the SDKs, just ignore it.
          break;
        }
        if ((!propertyExists && existenceIsRequired) || (propertyExists && !existenceIsRequired)) {
          return false;
        }
        break;
      }
      case '$regex': {
        if (typeof compareTo === 'object') {
          if (!safeRegexTest(compareTo.source, compareTo.flags, object[key])) {
            return false;
          }
          break;
        }
        // JS doesn't support perl-style escaping
        var expString = '';
        var escapeEnd = -2;
        var escapeStart = compareTo.indexOf('\\Q');
        while (escapeStart > -1) {
          // Add the unescaped portion
          expString += compareTo.substring(escapeEnd + 2, escapeStart);
          escapeEnd = compareTo.indexOf('\\E', escapeStart);
          if (escapeEnd > -1) {
            expString += compareTo
              .substring(escapeStart + 2, escapeEnd)
              .replace(/\\\\\\\\E/g, '\\E')
              .replace(/\W/g, '\\$&');
          }

          escapeStart = compareTo.indexOf('\\Q', escapeEnd);
        }
        expString += compareTo.substring(Math.max(escapeStart, escapeEnd + 2));
        if (!safeRegexTest(expString, constraints.$options || '', object[key])) {
          return false;
        }
        break;
      }
      case '$nearSphere':
        if (!compareTo || !object[key]) {
          return false;
        }
        var distance = compareTo.radiansTo(object[key]);
        var max = constraints.$maxDistance || Infinity;
        return distance <= max;
      case '$within':
        if (!compareTo || !object[key]) {
          return false;
        }
        var southWest = compareTo.$box[0];
        var northEast = compareTo.$box[1];
        if (southWest.latitude > northEast.latitude || southWest.longitude > northEast.longitude) {
          // Invalid box, crosses the date line
          return false;
        }
        return (
          object[key].latitude > southWest.latitude &&
          object[key].latitude < northEast.latitude &&
          object[key].longitude > southWest.longitude &&
          object[key].longitude < northEast.longitude
        );
      case '$containedBy': {
        for (const value of object[key]) {
          if (!contains(compareTo, value)) {
            return false;
          }
        }
        return true;
      }
      case '$geoWithin': {
        if (compareTo.$polygon) {
          const points = compareTo.$polygon.map(geoPoint => [
            geoPoint.latitude,
            geoPoint.longitude,
          ]);
          const polygon = new Parse.Polygon(points);
          return polygon.containsPoint(object[key]);
        }
        if (compareTo.$centerSphere) {
          const [WGS84Point, maxDistance] = compareTo.$centerSphere;
          const centerPoint = new Parse.GeoPoint({
            latitude: WGS84Point[1],
            longitude: WGS84Point[0],
          });
          const point = new Parse.GeoPoint(object[key]);
          const distance = point.radiansTo(centerPoint);
          return distance <= maxDistance;
        }
        break;
      }
      case '$geoIntersects': {
        const polygon = new Parse.Polygon(object[key].coordinates);
        const point = new Parse.GeoPoint(compareTo.$point);
        return polygon.containsPoint(point);
      }
      case '$options':
        // Not a query type, but a way to add options to $regex. Ignore and
        // avoid the default
        break;
      case '$maxDistance':
        // Not a query type, but a way to add a cap to $nearSphere. Ignore and
        // avoid the default
        break;
      case '$select':
        return false;
      case '$dontSelect':
        return false;
      default:
        return false;
    }
  }
  return true;
}

var QueryTools = {
  queryHash: queryHash,
  matchesQuery: matchesQuery,
  setRegexTimeout: setRegexTimeout,
};

module.exports = QueryTools;
