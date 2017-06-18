var equalObjects = require('./equalObjects');
var Id = require('./Id');
var Parse = require('parse/node');

/**
 * Query Hashes are deterministic hashes for Parse Queries.
 * Any two queries that have the same set of constraints will produce the same
 * hash. This lets us reliably group components by the queries they depend upon,
 * and quickly determine if a query has changed.
 */

/**
 * Convert $or queries into an array of where conditions
 */
function flattenOrQueries(where) {
  if (!where.hasOwnProperty('$or')) {
    return where;
  }
  var accum = [];
  for (var i = 0; i < where.$or.length; i++) {
    accum = accum.concat(where.$or[i]);
  }
  return accum;
}

/**
 * Deterministically turns an object into a string. Disregards ordering
 */
function stringify(object): string {
  if (typeof object !== 'object' || object === null) {
    if (typeof object === 'string') {
      return '"' + object.replace(/\|/g, '%|') + '"';
    }
    return object + '';
  }
  if (Array.isArray(object)) {
    var copy = object.map(stringify);
    copy.sort();
    return '[' + copy.join(',') + ']';
  }
  var sections = [];
  var keys = Object.keys(object);
  keys.sort();
  for (var k = 0; k < keys.length; k++) {
    sections.push(stringify(keys[k]) + ':' + stringify(object[keys[k]]));
  }
  return '{' + sections.join(',') + '}';
}

/**
 * Generate a hash from a query, with unique fields for columns, values, order,
 * skip, and limit.
 */
function queryHash(query) {
  if (query instanceof Parse.Query) {
    query = {
      className: query.className,
      where: query._where
    }
  }
  var where = flattenOrQueries(query.where || {});
  var columns = [];
  var values = [];
  var i;
  if (Array.isArray(where)) {
    var uniqueColumns = {};
    for (i = 0; i < where.length; i++) {
      var subValues = {};
      var keys = Object.keys(where[i]);
      keys.sort();
      for (var j = 0; j < keys.length; j++) {
        subValues[keys[j]] = where[i][keys[j]];
        uniqueColumns[keys[j]] = true;
      }
      values.push(subValues);
    }
    columns = Object.keys(uniqueColumns);
    columns.sort();
  } else {
    columns = Object.keys(where);
    columns.sort();
    for (i = 0; i < columns.length; i++) {
      values.push(where[columns[i]]);
    }
  }

  var sections = [columns.join(','), stringify(values)];

  return query.className + ':' + sections.join('|');
}

/**
 * matchesQuery -- Determines if an object would be returned by a Parse Query
 * It's a lightweight, where-clause only implementation of a full query engine.
 * Since we find queries that match objects, rather than objects that match
 * queries, we can avoid building a full-blown query tool.
 */
function matchesQuery(object: any, query: any): boolean {
  if (query instanceof Parse.Query) {
    var className =
      (object.id instanceof Id) ? object.id.className : object.className;
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
  if(key.indexOf(".") >= 0){
    // Key references a subobject
    var keyComponents = key.split(".");
    var subObjectKey = keyComponents[0];
    var keyRemainder = keyComponents.slice(1).join(".");
    return matchesKeyConstraints(object[subObjectKey] || {}, keyRemainder, constraints);
  }
  var i;
  if (key === '$or') {
    for (i = 0; i < constraints.length; i++) {
      if (matchesQuery(object, constraints[i])) {
        return true;
      }
    }
    return false;
  }
  if (key === '$relatedTo') {
    // Bail! We can't handle relational queries locally
    return false;
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
      return equalObjectsGeneric(object[key], constraints, function(obj, ptr) {
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
    if (compareTo.__type) {
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
    case '$ne':
      if (equalObjects(object[key], compareTo)) {
        return false;
      }
      break;
    case '$in':
      if (compareTo.indexOf(object[key]) < 0) {
        return false;
      }
      break;
    case '$nin':
      if (compareTo.indexOf(object[key]) > -1) {
        return false;
      }
      break;
    case '$all':
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
    case '$regex':
      if (typeof compareTo === 'object') {
        return compareTo.test(object[key]);
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
          expString += compareTo.substring(escapeStart + 2, escapeEnd)
            .replace(/\\\\\\\\E/g, '\\E').replace(/\W/g, '\\$&');
        }

        escapeStart = compareTo.indexOf('\\Q', escapeEnd);
      }
      expString += compareTo.substring(Math.max(escapeStart, escapeEnd + 2));
      var exp = new RegExp(expString, constraints.$options || '');
      if (!exp.test(object[key])) {
        return false;
      }
      break;
    case '$nearSphere':
      var distance = compareTo.radiansTo(object[key]);
      var max = constraints.$maxDistance || Infinity;
      return distance <= max;
    case '$within':
      var southWest = compareTo.$box[0];
      var northEast = compareTo.$box[1];
      if (southWest.latitude > northEast.latitude ||
            southWest.longitude > northEast.longitude) {
        // Invalid box, crosses the date line
        return false;
      }
      return (
        object[key].latitude > southWest.latitude &&
          object[key].latitude < northEast.latitude &&
          object[key].longitude > southWest.longitude &&
          object[key].longitude < northEast.longitude
      );
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
  matchesQuery: matchesQuery
};

module.exports = QueryTools;
