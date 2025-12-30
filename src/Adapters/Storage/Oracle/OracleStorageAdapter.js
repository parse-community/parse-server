// @flow
import { createClient } from './OracleClient';
// @flow-disable-next
import Parse from 'parse/node';
// @flow-disable-next
import _ from 'lodash';
// @flow-disable-next
import { v4 as uuidv4 } from 'uuid';
import sql from './sql';
import { StorageAdapter } from '../StorageAdapter';
import type { SchemaType, QueryType, QueryOptions } from '../StorageAdapter';
const Utils = require('../../../Utils');

// Oracle error codes
// ORA-00942: table or view does not exist
// ORA-00955: name is already used by an existing object
// ORA-01449: column does not exist
// ORA-00001: unique constraint violated
// ORA-00904: invalid identifier
const OracleRelationDoesNotExistError = '00942';
const OracleDuplicateRelationError = '00955';
const OracleDuplicateColumnError = '00955'; // Same as duplicate relation in Oracle
const OracleMissingColumnError = '01449';
const OracleUniqueIndexViolationError = '00001';
const logger = require('../../../logger');

const debug = function (...args: any) {
  args = ['ORACLE: ' + arguments[0]].concat(args.slice(1, args.length));
  const log = logger.getLogger();
  log.debug.apply(log, args);
};

const parseTypeToOracleType = type => {
  switch (type.type) {
    case 'String':
      return 'VARCHAR2(4000)';
    case 'Date':
      return 'TIMESTAMP WITH TIME ZONE';
    case 'Object':
      return 'JSON';
    case 'File':
      return 'VARCHAR2(4000)';
    case 'Boolean':
      return 'NUMBER(1)'; // Oracle uses NUMBER(1) for boolean (0/1)
    case 'Pointer':
      return 'VARCHAR2(120)';
    case 'Number':
      return 'NUMBER';
    case 'GeoPoint':
      return 'SDO_GEOMETRY'; // Oracle Spatial type
    case 'Bytes':
      return 'JSON';
    case 'Polygon':
      return 'SDO_GEOMETRY'; // Oracle Spatial type
    case 'Array':
      if (type.contents && type.contents.type === 'String') {
        return 'VARCHAR2(4000)'; // Will store as JSON array
      } else {
        return 'JSON';
      }
    default:
      throw `no type for ${JSON.stringify(type)} yet`;
  }
};

const ParseToOracleComparator = {
  $gt: '>',
  $lt: '<',
  $gte: '>=',
  $lte: '<=',
};

const mongoAggregateToOracle = {
  $dayOfMonth: 'DAY',
  $dayOfWeek: 'DOW',
  $dayOfYear: 'DDD',
  $isoDayOfWeek: 'D',
  $isoWeekYear: 'IYYY',
  $hour: 'HH24',
  $minute: 'MI',
  $second: 'SS',
  $millisecond: 'FF',
  $month: 'MM',
  $week: 'IW',
  $year: 'YYYY',
};

const toOracleValue = value => {
  if (typeof value === 'object') {
    if (value.__type === 'Date') {
      return value.iso;
    }
    if (value.__type === 'File') {
      return value.name;
    }
  }
  return value;
};

const toOracleValueCastType = value => {
  const oracleValue = toOracleValue(value);
  let castType;
  switch (typeof oracleValue) {
    case 'number':
      castType = 'NUMBER';
      break;
    case 'boolean':
      castType = 'NUMBER(1)';
      break;
    default:
      castType = undefined;
  }
  return castType;
};

const transformValue = value => {
  if (typeof value === 'object' && value.__type === 'Pointer') {
    return value.objectId;
  }
  return value;
};

// Duplicate from the mongo adapter...
const emptyCLPS = Object.freeze({
  find: {},
  get: {},
  count: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
  protectedFields: {},
});

const defaultCLPS = Object.freeze({
  ACL: {
    '*': {
      read: true,
      write: true,
    },
  },
  find: { '*': true },
  get: { '*': true },
  count: { '*': true },
  create: { '*': true },
  update: { '*': true },
  delete: { '*': true },
  addField: { '*': true },
  protectedFields: { '*': [] },
});

const toParseSchema = schema => {
  if (schema.className === '_User') {
    delete schema.fields._hashed_password;
  }
  if (schema.fields) {
    delete schema.fields._wperm;
    delete schema.fields._rperm;
  }
  let clps = defaultCLPS;
  if (schema.classLevelPermissions) {
    clps = { ...emptyCLPS, ...schema.classLevelPermissions };
  }
  let indexes = {};
  if (schema.indexes) {
    indexes = { ...schema.indexes };
  }
  return {
    className: schema.className,
    fields: schema.fields,
    classLevelPermissions: clps,
    indexes,
  };
};

const toOracleSchema = schema => {
  if (!schema) {
    return schema;
  }
  schema.fields = schema.fields || {};
  schema.fields._wperm = { type: 'Array', contents: { type: 'String' } };
  schema.fields._rperm = { type: 'Array', contents: { type: 'String' } };
  if (schema.className === '_User') {
    schema.fields._hashed_password = { type: 'String' };
    schema.fields._password_history = { type: 'Array' };
  }
  return schema;
};

const isArrayIndex = (arrayIndex) => Array.from(arrayIndex).every(c => c >= '0' && c <= '9');

const handleDotFields = object => {
  Object.keys(object).forEach(fieldName => {
    if (fieldName.indexOf('.') > -1) {
      const components = fieldName.split('.');
      const first = components.shift();
      object[first] = object[first] || {};
      let currentObj = object[first];
      let next;
      let value = object[fieldName];
      if (value && value.__op === 'Delete') {
        value = undefined;
      }
      while ((next = components.shift())) {
        currentObj[next] = currentObj[next] || {};
        if (components.length === 0) {
          currentObj[next] = value;
        }
        currentObj = currentObj[next];
      }
      delete object[fieldName];
    }
  });
  return object;
};

const transformDotFieldToComponents = fieldName => {
  return fieldName.split('.').map((cmpt, index) => {
    if (index === 0) {
      return `"${cmpt}"`;
    }
    if (isArrayIndex(cmpt)) {
      return Number(cmpt);
    } else {
      return `'${cmpt}'`;
    }
  });
};

// Oracle JSON path syntax: JSON_EXISTS, JSON_VALUE, JSON_QUERY
const transformDotField = fieldName => {
  if (fieldName.indexOf('.') === -1) {
    return `"${fieldName}"`;
  }
  const components = transformDotFieldToComponents(fieldName);
  // Oracle uses JSON_VALUE for scalar values, JSON_QUERY for objects/arrays
  // For now, use JSON_VALUE with default path
  let path = '$';
  for (let i = 1; i < components.length; i++) {
    if (typeof components[i] === 'number') {
      path += `[${components[i]}]`;
    } else {
      path += `.${components[i]}`;
    }
  }
  return `JSON_VALUE("${components[0]}", '${path}')`;
};

const transformAggregateField = fieldName => {
  if (typeof fieldName !== 'string') {
    return fieldName;
  }
  if (fieldName === '$_created_at') {
    return 'createdAt';
  }
  if (fieldName === '$_updated_at') {
    return 'updatedAt';
  }
  return fieldName.substring(1);
};

const validateKeys = object => {
  if (typeof object == 'object') {
    for (const key in object) {
      if (typeof object[key] == 'object') {
        validateKeys(object[key]);
      }

      if (key.includes('$') || key.includes('.')) {
        throw new Parse.Error(
          Parse.Error.INVALID_NESTED_KEY,
          "Nested keys should not contain the '$' or '.' characters"
        );
      }
    }
  }
};

// Returns the list of join tables on a schema
const joinTablesForSchema = schema => {
  const list = [];
  if (schema) {
    Object.keys(schema.fields).forEach(field => {
      if (schema.fields[field].type === 'Relation') {
        list.push(`_Join:${field}:${schema.className}`);
      }
    });
  }
  return list;
};

interface WhereClause {
  pattern: string;
  values: Array<any>;
  sorts: Array<any>;
}

// Helper to check Oracle error code
const isOracleError = (error, code) => {
  if (!error || !error.errorNum) {
    return false;
  }
  // Oracle error codes are in error.errorNum or error.code
  const errorCode = String(error.errorNum || error.code || '');
  return errorCode.includes(code);
};

const buildWhereClause = ({ schema, query, index, caseInsensitive }): WhereClause => {
  const patterns = [];
  let values = [];
  const sorts = [];

  schema = toOracleSchema(schema);
  for (const fieldName in query) {
    const isArrayField =
      schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const initialPatternsLength = patterns.length;
    const fieldValue = query[fieldName];

    // nothing in the schema, it's gonna blow up
    if (!schema.fields[fieldName]) {
      // as it won't exist
      if (fieldValue && fieldValue.$exists === false) {
        continue;
      }
    }
    const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
    if (authDataMatch) {
      // TODO: Handle querying by _auth_data_provider, authData is stored in authData field
      continue;
    } else if (caseInsensitive && (fieldName === 'username' || fieldName === 'email')) {
      patterns.push(`LOWER($${index}:name) = LOWER($${index + 1})`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (fieldName.indexOf('.') >= 0) {
      let name = transformDotField(fieldName);
      if (fieldValue === null) {
        patterns.push(`$${index}:raw IS NULL`);
        values.push(name);
        index += 1;
        continue;
      } else {
        if (fieldValue.$in) {
          // Oracle JSON path query
          const path = transformDotFieldToComponents(fieldName).slice(1).join('.');
          patterns.push(`JSON_EXISTS($${index}:name, '$${path} ? (@ == $${index + 1})')`);
          values.push(fieldName.split('.')[0], JSON.stringify(fieldValue.$in));
          index += 2;
        } else if (fieldValue.$regex) {
          // Handle later
        } else if (typeof fieldValue !== 'object') {
          patterns.push(`$${index}:raw = $${index + 1}`);
          values.push(name, fieldValue);
          index += 2;
        }
      }
    } else if (fieldValue === null || fieldValue === undefined) {
      patterns.push(`$${index}:name IS NULL`);
      values.push(fieldName);
      index += 1;
      continue;
    } else if (typeof fieldValue === 'string') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (typeof fieldValue === 'boolean') {
      patterns.push(`$${index}:name = $${index + 1}`);
      // Oracle uses NUMBER(1) for boolean
      if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Number') {
        // Should always return zero results
        const MAX_INT_PLUS_ONE = 9223372036854775808;
        values.push(fieldName, MAX_INT_PLUS_ONE);
      } else {
        values.push(fieldName, fieldValue ? 1 : 0);
      }
      index += 2;
    } else if (typeof fieldValue === 'number') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (['$or', '$nor', '$and'].includes(fieldName)) {
      const clauses = [];
      const clauseValues = [];
      fieldValue.forEach(subQuery => {
        const clause = buildWhereClause({
          schema,
          query: subQuery,
          index,
          caseInsensitive,
        });
        if (clause.pattern.length > 0) {
          clauses.push(clause.pattern);
          clauseValues.push(...clause.values);
          index += clause.values.length;
        }
      });

      const orOrAnd = fieldName === '$and' ? ' AND ' : ' OR ';
      const not = fieldName === '$nor' ? ' NOT ' : '';

      patterns.push(`${not}(${clauses.join(orOrAnd)})`);
      values.push(...clauseValues);
    }

    if (fieldValue.$ne !== undefined) {
      if (isArrayField) {
        fieldValue.$ne = JSON.stringify([fieldValue.$ne]);
        patterns.push(`array_contains($${index}:name, $${index + 1}) = 0`);
      } else {
        if (fieldValue.$ne === null) {
          patterns.push(`$${index}:name IS NOT NULL`);
          values.push(fieldName);
          index += 1;
          continue;
        } else {
          // if not null, we need to manually exclude null
          if (fieldValue.$ne.__type === 'GeoPoint') {
            // Oracle Spatial - simplified for now
            patterns.push(
              `($${index}:name IS NULL OR SDO_GEOM.SDO_DISTANCE($${index}:name, SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE($${index + 1}, $${index + 2}, NULL), NULL, NULL), 0.005) > 0.001)`
            );
          } else {
            if (fieldName.indexOf('.') >= 0) {
              const castType = toOracleValueCastType(fieldValue.$ne);
              const constraintFieldName = castType
                ? `CAST ((${transformDotField(fieldName)}) AS ${castType})`
                : transformDotField(fieldName);
              patterns.push(
                `(${constraintFieldName} <> $${index + 1} OR ${constraintFieldName} IS NULL)`
              );
            } else if (typeof fieldValue.$ne === 'object' && fieldValue.$ne.$relativeTime) {
              throw new Parse.Error(
                Parse.Error.INVALID_JSON,
                '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators'
              );
            } else {
              patterns.push(`($${index}:name <> $${index + 1} OR $${index}:name IS NULL)`);
            }
          }
        }
      }
      if (fieldValue.$ne.__type === 'GeoPoint') {
        const point = fieldValue.$ne;
        values.push(fieldName, point.longitude, point.latitude);
        index += 3;
      } else {
        // TODO: support arrays
        values.push(fieldName, fieldValue.$ne);
        index += 2;
      }
    }
    if (fieldValue.$eq !== undefined) {
      if (fieldValue.$eq === null) {
        patterns.push(`$${index}:name IS NULL`);
        values.push(fieldName);
        index += 1;
      } else {
        if (fieldName.indexOf('.') >= 0) {
          const castType = toOracleValueCastType(fieldValue.$eq);
          const constraintFieldName = castType
            ? `CAST ((${transformDotField(fieldName)}) AS ${castType})`
            : transformDotField(fieldName);
          values.push(fieldValue.$eq);
          patterns.push(`${constraintFieldName} = $${index++}`);
        } else if (typeof fieldValue.$eq === 'object' && fieldValue.$eq.$relativeTime) {
          throw new Parse.Error(
            Parse.Error.INVALID_JSON,
            '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators'
          );
        } else {
          values.push(fieldName, fieldValue.$eq);
          patterns.push(`$${index}:name = $${index + 1}`);
          index += 2;
        }
      }
    }
    const isInOrNin = Array.isArray(fieldValue.$in) || Array.isArray(fieldValue.$nin);
    if (
      Array.isArray(fieldValue.$in) &&
      isArrayField &&
      schema.fields[fieldName].contents &&
      schema.fields[fieldName].contents.type === 'String'
    ) {
      // Oracle JSON array contains check
      const inPatterns = [];
      let allowNull = false;
      values.push(fieldName);
      fieldValue.$in.forEach((listElem, listIndex) => {
        if (listElem === null) {
          allowNull = true;
        } else {
          values.push(listElem);
          inPatterns.push(`$${index + 1 + listIndex - (allowNull ? 1 : 0)}`);
        }
      });
      // Use JSON_EXISTS for array contains
      if (allowNull) {
        patterns.push(`($${index}:name IS NULL OR JSON_EXISTS($${index}:name, '$[*] ? (@ == $${index + 1})'))`);
      } else {
        patterns.push(`JSON_EXISTS($${index}:name, '$[*] ? (@ in (${inPatterns.map((_, i) => `$${index + 1 + i}`).join(',')}))')`);
      }
      index = index + 1 + inPatterns.length;
    } else if (isInOrNin) {
      var createConstraint = (baseArray, notIn) => {
        const not = notIn ? ' NOT ' : '';
        if (baseArray.length > 0) {
          if (isArrayField) {
            patterns.push(`${not}array_contains($${index}:name, $${index + 1}) = 1`);
            values.push(fieldName, JSON.stringify(baseArray));
            index += 2;
          } else {
            // Handle Nested Dot Notation Above
            if (fieldName.indexOf('.') >= 0) {
              return;
            }
            const inPatterns = [];
            values.push(fieldName);
            baseArray.forEach((listElem, listIndex) => {
              if (listElem != null) {
                values.push(listElem);
                inPatterns.push(`$${index + 1 + listIndex}`);
              }
            });
            patterns.push(`$${index}:name ${not} IN (${inPatterns.join()})`);
            index = index + 1 + inPatterns.length;
          }
        } else if (!notIn) {
          values.push(fieldName);
          patterns.push(`$${index}:name IS NULL`);
          index = index + 1;
        } else {
          // Handle empty array
          if (notIn) {
            patterns.push('1 = 1'); // Return all values
          } else {
            patterns.push('1 = 2'); // Return no values
          }
        }
      };
      if (fieldValue.$in) {
        createConstraint(
          _.flatMap(fieldValue.$in, elt => elt),
          false
        );
      }
      if (fieldValue.$nin) {
        createConstraint(
          _.flatMap(fieldValue.$nin, elt => elt),
          true
        );
      }
    } else if (typeof fieldValue.$in !== 'undefined') {
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $in value');
    } else if (typeof fieldValue.$nin !== 'undefined') {
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $nin value');
    }

    if (Array.isArray(fieldValue.$all) && isArrayField) {
      if (isAnyValueRegexStartsWith(fieldValue.$all)) {
        if (!isAllValuesRegexOrNone(fieldValue.$all)) {
          throw new Parse.Error(
            Parse.Error.INVALID_JSON,
            'All $all values must be of regex type or none: ' + fieldValue.$all
          );
        }

        for (let i = 0; i < fieldValue.$all.length; i += 1) {
          const value = processRegexPattern(fieldValue.$all[i].$regex);
          fieldValue.$all[i] = value.substring(1) + '%';
        }
        patterns.push(`array_contains_all_regex($${index}:name, $${index + 1}) = 1`);
      } else {
        patterns.push(`array_contains_all($${index}:name, $${index + 1}) = 1`);
      }
      values.push(fieldName, JSON.stringify(fieldValue.$all));
      index += 2;
    } else if (Array.isArray(fieldValue.$all)) {
      if (fieldValue.$all.length === 1) {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.$all[0].objectId);
        index += 2;
      }
    }

    if (typeof fieldValue.$exists !== 'undefined') {
      if (typeof fieldValue.$exists === 'object' && fieldValue.$exists.$relativeTime) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators'
        );
      } else if (fieldValue.$exists) {
        patterns.push(`$${index}:name IS NOT NULL`);
      } else {
        patterns.push(`$${index}:name IS NULL`);
      }
      values.push(fieldName);
      index += 1;
    }

    if (fieldValue.$containedBy) {
      const arr = fieldValue.$containedBy;
      if (!(arr instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $containedBy: should be an array`);
      }

      // Oracle JSON containment
      patterns.push(`JSON_CONTAINS($${index}:name, $${index + 1}) = 1`);
      values.push(fieldName, JSON.stringify(arr));
      index += 2;
    }

    if (fieldValue.$text) {
      // Oracle text search - using CONTAINS or JSON text search
      const search = fieldValue.$text.$search;
      let language = 'english';
      if (typeof search !== 'object') {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $search, should be object`);
      }
      if (!search.$term || typeof search.$term !== 'string') {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $term, should be string`);
      }
      if (search.$language && typeof search.$language !== 'string') {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $language, should be string`);
      } else if (search.$language) {
        language = search.$language;
      }
      if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $caseSensitive, should be boolean`
        );
      } else if (search.$caseSensitive) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $caseSensitive not supported, please use $regex or create a separate lower case column.`
        );
      }
      if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $diacriticSensitive, should be boolean`
        );
      } else if (search.$diacriticSensitive === false) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $diacriticSensitive - false not supported`
        );
      }
      // Oracle text search - simplified for now
      patterns.push(
        `CONTAINS($${index}:name, $${index + 1}) > 0`
      );
      values.push(fieldName, search.$term);
      index += 2;
    }

    if (fieldValue.$nearSphere) {
      const point = fieldValue.$nearSphere;
      const distance = fieldValue.$maxDistance;
      const distanceInMeters = distance * 6371 * 1000;
      // Oracle Spatial distance
      patterns.push(
        `SDO_GEOM.SDO_DISTANCE($${index}:name, SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE($${index + 1}, $${index + 2}, NULL), NULL, NULL), 0.005) <= $${index + 3}`
      );
      sorts.push(
        `SDO_GEOM.SDO_DISTANCE($${index}:name, SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE($${index + 1}, $${index + 2}, NULL), NULL, NULL), 0.005) ASC`
      );
      values.push(fieldName, point.longitude, point.latitude, distanceInMeters);
      index += 4;
    }

    if (fieldValue.$within && fieldValue.$within.$box) {
      const box = fieldValue.$within.$box;
      const left = box[0].longitude;
      const bottom = box[0].latitude;
      const right = box[1].longitude;
      const top = box[1].latitude;

      // Oracle Spatial box query
      patterns.push(
        `SDO_INSIDE($${index}:name, SDO_GEOMETRY(2003, 4326, NULL, SDO_ELEM_INFO_ARRAY(1, 1003, 3), SDO_ORDINATE_ARRAY($${index + 1}, $${index + 2}, $${index + 3}, $${index + 4})), 0.005) = 'TRUE'`
      );
      values.push(fieldName, left, bottom, right, top);
      index += 5;
    }

    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$centerSphere) {
      const centerSphere = fieldValue.$geoWithin.$centerSphere;
      if (!(centerSphere instanceof Array) || centerSphere.length < 2) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'bad $geoWithin value; $centerSphere should be an array of Parse.GeoPoint and distance'
        );
      }
      // Get point, convert to geo point if necessary and validate
      let point = centerSphere[0];
      if (point instanceof Array && point.length === 2) {
        point = new Parse.GeoPoint(point[1], point[0]);
      } else if (!GeoPointCoder.isValidJSON(point)) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'bad $geoWithin value; $centerSphere geo point invalid'
        );
      }
      Parse.GeoPoint._validate(point.latitude, point.longitude);
      // Get distance and validate
      const distance = centerSphere[1];
      if (isNaN(distance) || distance < 0) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'bad $geoWithin value; $centerSphere distance invalid'
        );
      }
      const distanceInMeters = distance * 6371 * 1000;
      patterns.push(
        `SDO_GEOM.SDO_DISTANCE($${index}:name, SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE($${index + 1}, $${index + 2}, NULL), NULL, NULL), 0.005) <= $${index + 3}`
      );
      values.push(fieldName, point.longitude, point.latitude, distanceInMeters);
      index += 4;
    }

    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$polygon) {
      const polygon = fieldValue.$geoWithin.$polygon;
      let points;
      if (typeof polygon === 'object' && polygon.__type === 'Polygon') {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          throw new Parse.Error(
            Parse.Error.INVALID_JSON,
            'bad $geoWithin value; Polygon.coordinates should contain at least 3 lon/lat pairs'
          );
        }
        points = polygon.coordinates;
      } else if (polygon instanceof Array) {
        if (polygon.length < 3) {
          throw new Parse.Error(
            Parse.Error.INVALID_JSON,
            'bad $geoWithin value; $polygon should contain at least 3 GeoPoints'
          );
        }
        points = polygon;
      } else {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          "bad $geoWithin value; $polygon should be Polygon object or Array of Parse.GeoPoint's"
        );
      }
      // Oracle Spatial polygon - simplified
      const ordinates = [];
      points.forEach(point => {
        if (point instanceof Array && point.length === 2) {
          Parse.GeoPoint._validate(point[1], point[0]);
          ordinates.push(point[0], point[1]);
        } else if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value');
        } else {
          Parse.GeoPoint._validate(point.latitude, point.longitude);
          ordinates.push(point.longitude, point.latitude);
        }
      });

      patterns.push(
        `SDO_INSIDE($${index}:name, SDO_GEOMETRY(2003, 4326, NULL, SDO_ELEM_INFO_ARRAY(1, 1003, 1), SDO_ORDINATE_ARRAY(${ordinates.map((_, i) => `$${index + 1 + i}`).join(',')})), 0.005) = 'TRUE'`
      );
      values.push(fieldName, ...ordinates);
      index += 1 + ordinates.length;
    }
    if (fieldValue.$geoIntersects && fieldValue.$geoIntersects.$point) {
      const point = fieldValue.$geoIntersects.$point;
      if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'bad $geoIntersect value; $point should be GeoPoint'
        );
      } else {
        Parse.GeoPoint._validate(point.latitude, point.longitude);
      }
      // Oracle Spatial intersection
      patterns.push(
        `SDO_ANYINTERACT($${index}:name, SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE($${index + 1}, $${index + 2}, NULL), NULL, NULL), 0.005) = 'TRUE'`
      );
      values.push(fieldName, point.longitude, point.latitude);
      index += 3;
    }

    if (fieldValue.$regex) {
      let regex = fieldValue.$regex;
      let operator = 'REGEXP_LIKE';
      const opts = fieldValue.$options;
      if (opts) {
        if (opts.indexOf('i') >= 0) {
          operator = 'REGEXP_LIKE'; // Case insensitive
        }
        if (opts.indexOf('x') >= 0) {
          regex = removeWhiteSpace(regex);
        }
      }

      const name = transformDotField(fieldName);
      regex = processRegexPattern(regex);

      if (opts && opts.indexOf('i') >= 0) {
        patterns.push(`REGEXP_LIKE($${index}:raw, $${index + 1}, 'i')`);
      } else {
        patterns.push(`REGEXP_LIKE($${index}:raw, $${index + 1})`);
      }
      values.push(name, regex);
      index += 2;
    }

    if (fieldValue.__type === 'Pointer') {
      if (isArrayField) {
        patterns.push(`array_contains($${index}:name, $${index + 1}) = 1`);
        values.push(fieldName, JSON.stringify([fieldValue]));
        index += 2;
      } else {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      }
    }

    if (fieldValue.__type === 'Date') {
      patterns.push(`$${index}:name = TO_TIMESTAMP_TZ($${index + 1}, 'YYYY-MM-DD"T"HH24:MI:SS.FFTZH:TZM')`);
      values.push(fieldName, fieldValue.iso);
      index += 2;
    }

    if (fieldValue.__type === 'GeoPoint') {
      // Oracle Spatial point equality
      patterns.push(
        `SDO_EQUAL($${index}:name, SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE($${index + 1}, $${index + 2}, NULL), NULL, NULL)) = 'TRUE'`
      );
      values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
      index += 3;
    }

    if (fieldValue.__type === 'Polygon') {
      const value = convertPolygonToSQL(fieldValue.coordinates);
      // Oracle Spatial polygon equality
      patterns.push(`SDO_EQUAL($${index}:name, $${index + 1}) = 'TRUE'`);
      values.push(fieldName, value);
      index += 2;
    }

    Object.keys(ParseToOracleComparator).forEach(cmp => {
      if (fieldValue[cmp] || fieldValue[cmp] === 0) {
        const oracleComparator = ParseToOracleComparator[cmp];
        let constraintFieldName;
        let oracleValue = toOracleValue(fieldValue[cmp]);

        if (fieldName.indexOf('.') >= 0) {
          const castType = toOracleValueCastType(fieldValue[cmp]);
          constraintFieldName = castType
            ? `CAST ((${transformDotField(fieldName)}) AS ${castType})`
            : transformDotField(fieldName);
        } else {
          if (typeof oracleValue === 'object' && oracleValue.$relativeTime) {
            if (schema.fields[fieldName].type !== 'Date') {
              throw new Parse.Error(
                Parse.Error.INVALID_JSON,
                '$relativeTime can only be used with Date field'
              );
            }
            const parserResult = Utils.relativeTimeToDate(oracleValue.$relativeTime);
            if (parserResult.status === 'success') {
              oracleValue = toOracleValue(parserResult.result);
            } else {
              // eslint-disable-next-line no-console
              console.error('Error while parsing relative date', parserResult);
              throw new Parse.Error(
                Parse.Error.INVALID_JSON,
                `bad $relativeTime (${oracleValue.$relativeTime}) value. ${parserResult.info}`
              );
            }
          }
          constraintFieldName = `$${index++}:name`;
          values.push(fieldName);
        }
        values.push(oracleValue);
        patterns.push(`${constraintFieldName} ${oracleComparator} $${index++}`);
      }
    });

    if (initialPatternsLength === patterns.length) {
      throw new Parse.Error(
        Parse.Error.OPERATION_FORBIDDEN,
        `Oracle doesn't support this query type yet ${JSON.stringify(fieldValue)}`
      );
    }
  }
  values = values.map(transformValue);
  return { pattern: patterns.join(' AND '), values, sorts };
};

function convertPolygonToSQL(polygon) {
  if (polygon.length < 3) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `Polygon must have at least 3 values`);
  }
  if (
    polygon[0][0] !== polygon[polygon.length - 1][0] ||
    polygon[0][1] !== polygon[polygon.length - 1][1]
  ) {
    polygon.push(polygon[0]);
  }
  const unique = polygon.filter((item, index, ar) => {
    let foundIndex = -1;
    for (let i = 0; i < ar.length; i += 1) {
      const pt = ar[i];
      if (pt[0] === item[0] && pt[1] === item[1]) {
        foundIndex = i;
        break;
      }
    }
    return foundIndex === index;
  });
  if (unique.length < 3) {
    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      'GeoJSON: Loop must have at least 3 different vertices'
    );
  }
  // Oracle Spatial polygon format
  const ordinates = [];
  polygon.forEach(point => {
    Parse.GeoPoint._validate(parseFloat(point[1]), parseFloat(point[0]));
    ordinates.push(point[0], point[1]);
  });
  return ordinates.join(',');
}

function removeWhiteSpace(regex) {
  if (!regex.endsWith('\n')) {
    regex += '\n';
  }

  // remove non escaped comments
  return (
    regex
      .replace(/([^\\])#.*\n/gim, '$1')
      // remove lines starting with a comment
      .replace(/^#.*\n/gim, '')
      // remove non escaped whitespace
      .replace(/([^\\])\s+/gim, '$1')
      // remove whitespace at the beginning of a line
      .replace(/^\s+/, '')
      .trim()
  );
}

function processRegexPattern(s) {
  if (s && s.startsWith('^')) {
    // regex for startsWith
    return '^' + literalizeRegexPart(s.slice(1));
  } else if (s && s.endsWith('$')) {
    // regex for endsWith
    return literalizeRegexPart(s.slice(0, s.length - 1)) + '$';
  }

  // regex for contains
  return literalizeRegexPart(s);
}

function isStartsWithRegex(value) {
  if (!value || typeof value !== 'string' || !value.startsWith('^')) {
    return false;
  }

  const matches = value.match(/\^\\Q.*\\E/);
  return !!matches;
}

function isAllValuesRegexOrNone(values) {
  if (!values || !Array.isArray(values) || values.length === 0) {
    return true;
  }

  const firstValuesIsRegex = isStartsWithRegex(values[0].$regex);
  if (values.length === 1) {
    return firstValuesIsRegex;
  }

  for (let i = 1, length = values.length; i < length; ++i) {
    if (firstValuesIsRegex !== isStartsWithRegex(values[i].$regex)) {
      return false;
    }
  }

  return true;
}

function isAnyValueRegexStartsWith(values) {
  return values.some(function (value) {
    return isStartsWithRegex(value.$regex);
  });
}

function createLiteralRegex(remaining: string) {
  return remaining
    .split('')
    .map(c => {
      const regex = RegExp('[0-9 ]|\\p{L}', 'u'); // Support all Unicode letter chars
      if (c.match(regex) !== null) {
        // Don't escape alphanumeric characters
        return c;
      }
      // Escape everything else (single quotes with single quotes, everything else with a backslash)
      return c === `'` ? `''` : `\\${c}`;
    })
    .join('');
}

function literalizeRegexPart(s: string) {
  const matcher1 = /\\Q((?!\\E).*)\\E$/;
  const result1: any = s.match(matcher1);
  if (result1 && result1.length > 1 && result1.index > -1) {
    // Process Regex that has a beginning and an end specified for the literal text
    const prefix = s.substring(0, result1.index);
    const remaining = result1[1];

    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // Process Regex that has a beginning specified for the literal text
  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2: any = s.match(matcher2);
  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substring(0, result2.index);
    const remaining = result2[1];

    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // Remove problematic chars from remaining text
  return s
    // Remove all instances of \Q and \E
    .replace(/([^\\])(\\E)/, '$1')
    .replace(/([^\\])(\\Q)/, '$1')
    .replace(/^\\E/, '')
    .replace(/^\\Q/, '')
    // Ensure even number of single quote sequences by adding an extra single quote if needed;
    // this ensures that every single quote is escaped
    .replace(/'+/g, match => {
      return match.length % 2 === 0 ? match : match + "'";
    });
}

var GeoPointCoder = {
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  },
};

export class OracleStorageAdapter implements StorageAdapter {
  canSortOnJoinTables: boolean;
  enableSchemaHooks: boolean;

  // Private
  _collectionPrefix: string;
  _client: any;
  _onchange: any;
  _oracledb: any;
  _stream: any;
  _uuid: any;
  schemaCacheTtl: ?number;
  disableIndexFieldValidation: boolean;

  constructor({ uri, collectionPrefix = '', databaseOptions = {} }: any) {
    const options = { ...databaseOptions };
    this._collectionPrefix = collectionPrefix;
    this.enableSchemaHooks = !!databaseOptions.enableSchemaHooks;
    this.disableIndexFieldValidation = !!databaseOptions.disableIndexFieldValidation;

    this.schemaCacheTtl = databaseOptions.schemaCacheTtl;
    for (const key of ['enableSchemaHooks', 'schemaCacheTtl', 'disableIndexFieldValidation']) {
      delete options[key];
    }

    const { client, oracledb } = createClient(uri, options);
    this._client = client;
    this._onchange = () => { };
    this._oracledb = oracledb;
    this._uuid = uuidv4();
    this.canSortOnJoinTables = false;
  }

  watch(callback: () => void): void {
    this._onchange = callback;
  }

  //Note that analyze=true will run the query, executing INSERTS, DELETES, etc.
  createExplainableQuery(query: string, analyze: boolean = false) {
    // Oracle uses EXPLAIN PLAN
    if (analyze) {
      return 'EXPLAIN PLAN FOR ' + query;
    } else {
      return 'EXPLAIN PLAN FOR ' + query;
    }
  }

  handleShutdown() {
    if (this._stream) {
      this._stream.close();
      delete this._stream;
    }
    if (!this._client) {
      return;
    }
    this._client.$pool.end();
  }

  async _listenToSchema() {
    // Oracle doesn't have native LISTEN/NOTIFY like Postgres
    // Schema hooks would need to be implemented differently for Oracle
    // For now, we'll skip this feature
    if (!this._stream && this.enableSchemaHooks) {
      debug('Schema hooks not yet implemented for Oracle');
    }
  }

  _notifySchemaChange() {
    // Oracle doesn't have native LISTEN/NOTIFY
    // Would need alternative implementation (e.g., polling or Advanced Queuing)
    if (this.enableSchemaHooks) {
      debug('Schema change notification not yet implemented for Oracle');
    }
  }

  async _ensureSchemaCollectionExists(conn: any) {
    conn = conn || this._client;
    // Oracle doesn't support IF NOT EXISTS in CREATE TABLE, need to check first
    const tableExists = await conn.one(
      "SELECT COUNT(*) as cnt FROM user_tables WHERE table_name = '"_SCHEMA"'",
      [],
      a => a.cnt > 0
    ).catch(() => false);

    if (!tableExists) {
      await conn.none(
        'CREATE TABLE "_SCHEMA" ( "className" VARCHAR2(120), "schema" JSON, "isParseClass" NUMBER(1), PRIMARY KEY ("className") )'
      ).catch(error => {
        // Check if it's a "name already used" error
        if (!isOracleError(error, OracleDuplicateRelationError)) {
          throw error;
        }
      });
    }
  }

  async classExists(name: string) {
    return this._client.one(
      "SELECT COUNT(*) as cnt FROM user_tables WHERE table_name = :1",
      [name.toUpperCase()],
      a => a.cnt > 0
    );
  }

