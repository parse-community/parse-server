const equalObjects = require('./equalObjects');
const Id = require('./Id');
const Parse = require('parse/node');

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
  if (!Object.prototype.hasOwnProperty.call(where, '$or')) {
    return where;
  }
  let accum = [];
  for (let i = 0; i < where.$or.length; i++) {
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
      return `"${object.replace(/\|/g, '%|')}"`;
    }
    return `${object}`;
  }
  if (Array.isArray(object)) {
    const copy = object.map(stringify);
    copy.sort();
    return `[${copy.join(',')}]`;
  }
  const sections = [];
  const keys = Object.keys(object);
  keys.sort();
  for (let k = 0; k < keys.length; k++) {
    sections.push(`${stringify(keys[k])}:${stringify(object[keys[k]])}`);
  }
  return `{${sections.join(',')}}`;
}

/**
 * Generate a hash from a query, with unique fields for columns, values, order,
 * skip, and limit.
 */
function queryHash(query) {
  if (query instanceof Parse.Query) {
    query = {
      className: query.className,
      where: query._where,
    };
  }
  const where = flattenOrQueries(query.where || {});
  let columns = [];
  const values = [];
  let i;
  if (Array.isArray(where)) {
    const uniqueColumns = {};
    for (i = 0; i < where.length; i++) {
      const subValues = {};
      const keys = Object.keys(where[i]);
      keys.sort();
      for (let j = 0; j < keys.length; j++) {
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

  const sections = [columns.join(','), stringify(values)];

  return `${query.className}:${sections.join('|')}`;
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
    const className = object.id instanceof Id ? object.id.className : object.className;
    if (className !== query.className) {
      return false;
    }
    return matchesQuery(object, query._where);
  }
  for (const field in query) {
    if (!matchesKeyConstraints(object, field, query[field])) {
      return false;
    }
  }
  return true;
}

function equalObjectsGeneric(obj, compareTo, eqlFn) {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
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
    const keyComponents = key.split('.');
    const subObjectKey = keyComponents[0];
    const keyRemainder = keyComponents.slice(1).join('.');
    return matchesKeyConstraints(object[subObjectKey] || {}, keyRemainder, constraints);
  }
  let i;
  if (key === '$or') {
    for (i = 0; i < constraints.length; i++) {
      if (matchesQuery(object, constraints[i])) {
        return true;
      }
    }
    return false;
  }
  if (key === '$and') {
    for (i = 0; i < constraints.length; i++) {
      if (!matchesQuery(object, constraints[i])) {
        return false;
      }
    }
    return true;
  }
  if (key === '$nor') {
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
  if (object[key] && object[key].__type === 'Date') {
    object[key] = new Date(object[key].iso);
  }
  // Equality (or Array contains) cases
  if (typeof constraints !== 'object') {
    if (Array.isArray(object[key])) {
      return object[key].indexOf(constraints) > -1;
    }
    return object[key] === constraints;
  }
  let compareTo;
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
  for (const condition in constraints) {
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
          return compareTo.test(object[key]);
        }
        // JS doesn't support perl-style escaping
        let expString = '';
        let escapeEnd = -2;
        let escapeStart = compareTo.indexOf('\\Q');
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
        const exp = new RegExp(expString, constraints.$options || '');
        if (!exp.test(object[key])) {
          return false;
        }
        break;
      }
      case '$nearSphere': {
        if (!compareTo || !object[key]) {
          return false;
        }
        const distance = compareTo.radiansTo(object[key]);
        const max = constraints.$maxDistance || Infinity;
        return distance <= max;
      }
      case '$within': {
        if (!compareTo || !object[key]) {
          return false;
        }
        const southWest = compareTo.$box[0];
        const northEast = compareTo.$box[1];
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
      }
      case '$containedBy': {
        for (const value of object[key]) {
          if (!contains(compareTo, value)) {
            return false;
          }
        }
        return true;
      }
      case '$geoWithin': {
        const points = compareTo.$polygon.map(geoPoint => [geoPoint.latitude, geoPoint.longitude]);
        const polygon = new Parse.Polygon(points);
        return polygon.containsPoint(object[key]);
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

const QueryTools = {
  queryHash: queryHash,
  matchesQuery: matchesQuery,
};

module.exports = QueryTools;
