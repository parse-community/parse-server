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
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM user_tables WHERE table_name = '_SCHEMA') THEN 1 ELSE 0 END as cnt FROM DUAL",
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
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM user_tables WHERE table_name = :1) THEN 1 ELSE 0 END as cnt FROM DUAL",
      [name.toUpperCase()],
      a => a.cnt > 0
    );
  }

  async setClassLevelPermissions(className: string, CLPs: any) {
    await this._client.task('set-class-level-permissions', async t => {
      const values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)];
      await t.none(
        `UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3, $4) WHERE "className" = $1`,
        values
      );
    });
    this._notifySchemaChange();
  }

  async setIndexesWithSchemaFormat(
    className: string,
    submittedIndexes: any,
    existingIndexes: any = {},
    fields: any,
    conn: ?any
  ): Promise<void> {
    conn = conn || this._client;
    const self = this;
    if (submittedIndexes === undefined) {
      return Promise.resolve();
    }
    if (Object.keys(existingIndexes).length === 0) {
      existingIndexes = { _id_: { _id: 1 } };
    }
    const deletedIndexes = [];
    const insertedIndexes = [];
    Object.keys(submittedIndexes).forEach(name => {
      const field = submittedIndexes[name];
      if (existingIndexes[name] && field.__op !== 'Delete') {
        throw new Parse.Error(Parse.Error.INVALID_QUERY, `Index ${name} exists, cannot update.`);
      }
      if (!existingIndexes[name] && field.__op === 'Delete') {
        throw new Parse.Error(
          Parse.Error.INVALID_QUERY,
          `Index ${name} does not exist, cannot delete.`
        );
      }
      if (field.__op === 'Delete') {
        deletedIndexes.push(name);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (
            !this.disableIndexFieldValidation &&
            !Object.prototype.hasOwnProperty.call(fields, key)
          ) {
            throw new Parse.Error(
              Parse.Error.INVALID_QUERY,
              `Field ${key} does not exist, cannot add index.`
            );
          }
        });
        existingIndexes[name] = field;
        insertedIndexes.push({
          key: field,
          name,
        });
      }
    });
    await conn.tx('set-indexes-with-schema-format', async t => {
      try {
        if (insertedIndexes.length > 0) {
          await self.createIndexes(className, insertedIndexes, t);
        }
      } catch (e) {
        const columnDoesNotExistError = isOracleError(e, OracleMissingColumnError);
        if (columnDoesNotExistError) {
          if (!this.disableIndexFieldValidation) {
            throw e;
          }
        } else {
          throw e;
        }
      }
      if (deletedIndexes.length > 0) {
        await self.dropIndexes(className, deletedIndexes, t);
      }
      await t.none(
        'UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3, $4) WHERE "className" = $1',
        [className, 'schema', 'indexes', JSON.stringify(existingIndexes)]
      );
    });
    this._notifySchemaChange();
  }

  async createClass(className: string, schema: SchemaType, conn: ?any) {
    conn = conn || this._client;
    const parseSchema = await conn
      .tx('create-class', async t => {
        await this.createTable(className, schema, t);
        await t.none(
          'INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($1, $2, 1)',
          [className, JSON.stringify(schema)]
        );
        await this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields, t);
        return toParseSchema(schema);
      })
      .catch(err => {
        if (isOracleError(err, OracleUniqueIndexViolationError) && err.message && err.message.includes(className)) {
          throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, `Class ${className} already exists.`);
        }
        throw err;
      });
    this._notifySchemaChange();
    return parseSchema;
  }

  // Just create a table, do not insert in schema
  async createTable(className: string, schema: SchemaType, conn: any) {
    conn = conn || this._client;
    debug('createTable');
    const valuesArray = [];
    const patternsArray = [];
    const fields = Object.assign({}, schema.fields);
    if (className === '_User') {
      fields._email_verify_token_expires_at = { type: 'Date' };
      fields._email_verify_token = { type: 'String' };
      fields._account_lockout_expires_at = { type: 'Date' };
      fields._failed_login_count = { type: 'Number' };
      fields._perishable_token = { type: 'String' };
      fields._perishable_token_expires_at = { type: 'Date' };
      fields._password_changed_at = { type: 'Date' };
      fields._password_history = { type: 'Array' };
    }
    let index = 2;
    const relations = [];
    Object.keys(fields).forEach(fieldName => {
      const parseType = fields[fieldName];
      // Skip when it's a relation
      if (parseType.type === 'Relation') {
        relations.push(fieldName);
        return;
      }
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        parseType.contents = { type: 'String' };
      }
      valuesArray.push(fieldName);
      valuesArray.push(parseTypeToOracleType(parseType));
      patternsArray.push(`$${index}:name $${index + 1}:raw`);
      if (fieldName === 'objectId') {
        patternsArray.push(`PRIMARY KEY ($${index}:name)`);
      }
      index = index + 2;
    });
    
    // Oracle doesn't support IF NOT EXISTS in CREATE TABLE, need to check first
    const tableExists = await conn.one(
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM user_tables WHERE table_name = :1) THEN 1 ELSE 0 END as cnt FROM DUAL",
      [className.toUpperCase()],
      a => a.cnt > 0
    ).catch(() => false);

    if (!tableExists) {
      const qs = `CREATE TABLE $1:name (${patternsArray.join()})`;
      const values = [className, ...valuesArray];

      return conn.task('create-table', async t => {
        try {
          await t.none(qs, values);
        } catch (error) {
          if (!isOracleError(error, OracleDuplicateRelationError)) {
            throw error;
          }
          // Table already exists, must have been created by a different request. Ignore the error.
        }
        await t.tx('create-table-tx', tx => {
          return tx.batch(
            relations.map(fieldName => {
              const joinTable = `_Join:${fieldName}:${className}`;
              return tx.one(
                "SELECT COUNT(*) as cnt FROM user_tables WHERE table_name = :1",
                [joinTable.toUpperCase()],
                a => a.cnt > 0
              ).then(exists => {
                if (!exists) {
                  return tx.none(
                    'CREATE TABLE $1:name ("relatedId" VARCHAR2(120), "owningId" VARCHAR2(120), PRIMARY KEY("relatedId", "owningId") )',
                    [joinTable]
                  );
                }
              });
            })
          );
        });
      });
    }
  }

  async schemaUpgrade(className: string, schema: SchemaType, conn: any) {
    debug('schemaUpgrade');
    conn = conn || this._client;
    const self = this;

    await conn.task('schema-upgrade', async t => {
      const columns = await t.map(
        "SELECT column_name FROM user_tab_columns WHERE table_name = :1",
        [className.toUpperCase()],
        a => a.column_name.toLowerCase()
      );
      const newColumns = Object.keys(schema.fields)
        .filter(item => columns.indexOf(item.toLowerCase()) === -1)
        .map(fieldName => self.addFieldIfNotExists(className, fieldName, schema.fields[fieldName]));

      await t.batch(newColumns);
    });
  }

  async addFieldIfNotExists(className: string, fieldName: string, type: any) {
    debug('addFieldIfNotExists');
    const self = this;
    await this._client.tx('add-field-if-not-exists', async t => {
      if (type.type !== 'Relation') {
        try {
          // Check if column exists first
          const columnExists = await t.one(
            "SELECT CASE WHEN EXISTS (SELECT 1 FROM user_tab_columns WHERE table_name = :1 AND column_name = :2) THEN 1 ELSE 0 END as cnt FROM DUAL",
            [className.toUpperCase(), fieldName.toUpperCase()],
            a => a.cnt > 0
          ).catch(() => false);

          if (!columnExists) {
            await t.none(
              'ALTER TABLE $1:name ADD $2:name $3:raw',
              {
                className,
                fieldName,
                oracleType: parseTypeToOracleType(type),
              }
            );
          }
        } catch (error) {
          if (isOracleError(error, OracleRelationDoesNotExistError)) {
            return self.createClass(className, { fields: { [fieldName]: type } }, t);
          }
          if (!isOracleError(error, OracleDuplicateColumnError)) {
            throw error;
          }
          // Column already exists, created by other request. Carry on.
        }
      } else {
        const joinTable = `_Join:${fieldName}:${className}`;
        const tableExists = await t.one(
          "SELECT CASE WHEN EXISTS (SELECT 1 FROM user_tables WHERE table_name = :1) THEN 1 ELSE 0 END as cnt FROM DUAL",
          [joinTable.toUpperCase()],
          a => a.cnt > 0
        ).catch(() => false);

        if (!tableExists) {
          await t.none(
            'CREATE TABLE $1:name ("relatedId" VARCHAR2(120), "owningId" VARCHAR2(120), PRIMARY KEY("relatedId", "owningId") )',
            [joinTable]
          );
        }
      }

      const result = await t.any(
        'SELECT "schema" FROM "_SCHEMA" WHERE "className" = $1 AND JSON_EXISTS("schema", \'$.fields.$2\') = 1',
        [className, fieldName]
      );

      if (result[0]) {
        throw 'Attempted to add a field that already exists';
      } else {
        await t.none(
          'UPDATE "_SCHEMA" SET "schema" = JSON_MERGEPATCH("schema", $1) WHERE "className" = $2',
          [JSON.stringify({ fields: { [fieldName]: type } }), className]
        );
      }
    });
    this._notifySchemaChange();
  }

  async updateFieldOptions(className: string, fieldName: string, type: any) {
    await this._client.tx('update-schema-field-options', async t => {
      await t.none(
        'UPDATE "_SCHEMA" SET "schema" = JSON_MERGEPATCH("schema", $1) WHERE "className" = $2',
        [JSON.stringify({ fields: { [fieldName]: type } }), className]
      );
    });
  }

  async deleteClass(className: string) {
    const operations = [
      { query: `BEGIN EXECUTE IMMEDIATE 'DROP TABLE $1:name'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;`, values: [className] },
      {
        query: `DELETE FROM "_SCHEMA" WHERE "className" = $1`,
        values: [className],
      },
    ];
    const response = await this._client
      .tx(t => {
        return t.batch(operations.map(op => t.none(op.query, op.values)));
      })
      .then(() => className.indexOf('_Join:') != 0);

    this._notifySchemaChange();
    return response;
  }

  async deleteAllClasses() {
    const now = new Date().getTime();
    debug('deleteAllClasses');
    if (this._client?.$pool.ended) {
      return;
    }
    await this._client
      .task('delete-all-classes', async t => {
        try {
          const results = await t.any('SELECT * FROM "_SCHEMA"');
          const joins = results.reduce((list: Array<string>, schema: any) => {
            return list.concat(joinTablesForSchema(schema.schema));
          }, []);
          const classes = [
            '_SCHEMA',
            '_PushStatus',
            '_JobStatus',
            '_JobSchedule',
            '_Hooks',
            '_GlobalConfig',
            '_GraphQLConfig',
            '_Audience',
            '_Idempotency',
            ...results.map(result => result.className),
            ...joins,
          ];
          const queries = classes.map(className => ({
            query: "BEGIN EXECUTE IMMEDIATE 'DROP TABLE \"' || :1 || '\"'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;",
            values: [className],
          }));
          await t.tx(tx => {
            return tx.batch(queries.map(q => tx.none(q.query, q.values)));
          });
        } catch (error) {
          if (!isOracleError(error, OracleRelationDoesNotExistError)) {
            throw error;
          }
          // No _SCHEMA collection. Don't delete anything.
        }
      })
      .then(() => {
        debug(`deleteAllClasses done in ${new Date().getTime() - now}`);
      });
  }

  async deleteFields(className: string, schema: SchemaType, fieldNames: string[]): Promise<void> {
    debug('deleteFields');
    fieldNames = fieldNames.reduce((list: Array<string>, fieldName: string) => {
      const field = schema.fields[fieldName];
      if (field.type !== 'Relation') {
        list.push(fieldName);
      }
      delete schema.fields[fieldName];
      return list;
    }, []);

    await this._client.tx('delete-fields', async t => {
      await t.none('UPDATE "_SCHEMA" SET "schema" = $1 WHERE "className" = $2', {
        schema: JSON.stringify(schema),
        className,
      });
      if (fieldNames.length > 0) {
        // Oracle ALTER TABLE DROP COLUMN syntax
        const columns = fieldNames.map(name => `"${name}"`).join(', ');
        await t.none(`ALTER TABLE $1:name DROP (${columns})`, [className]);
      }
    });
    this._notifySchemaChange();
  }

  async getAllClasses() {
    return this._client.task('get-all-classes', async t => {
      return await t.map('SELECT * FROM "_SCHEMA"', null, row =>
        toParseSchema({ className: row.className, ...JSON.parse(row.schema) })
      );
    });
  }

  async getClass(className: string) {
    debug('getClass');
    return this._client
      .any('SELECT * FROM "_SCHEMA" WHERE "className" = $1', [className])
      .then(result => {
        if (result.length !== 1) {
          throw undefined;
        }
        return JSON.parse(result[0].schema);
      })
      .then(toParseSchema);
  }

  async createObject(
    className: string,
    schema: SchemaType,
    object: any,
    transactionalSession: ?any
  ) {
    debug('createObject');
    let columnsArray = [];
    const valuesArray = [];
    schema = toOracleSchema(schema);
    const geoPoints = {};

    object = handleDotFields(object);
    validateKeys(object);

    Object.keys(object).forEach(fieldName => {
      if (object[fieldName] === null) {
        return;
      }
      var authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      const authDataAlreadyExists = !!object.authData;
      if (authDataMatch) {
        var provider = authDataMatch[1];
        object['authData'] = object['authData'] || {};
        object['authData'][provider] = object[fieldName];
        delete object[fieldName];
        fieldName = 'authData';
        if (authDataAlreadyExists) {
          return;
        }
      }

      columnsArray.push(fieldName);
      if (!schema.fields[fieldName] && className === '_User') {
        if (
          fieldName === '_email_verify_token' ||
          fieldName === '_failed_login_count' ||
          fieldName === '_perishable_token' ||
          fieldName === '_password_history'
        ) {
          valuesArray.push(object[fieldName]);
        }

        if (fieldName === '_email_verify_token_expires_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }

        if (
          fieldName === '_account_lockout_expires_at' ||
          fieldName === '_perishable_token_expires_at' ||
          fieldName === '_password_changed_at'
        ) {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }
        return;
      }
      switch (schema.fields[fieldName].type) {
        case 'Date':
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
          break;
        case 'Pointer':
          valuesArray.push(object[fieldName].objectId);
          break;
        case 'Array':
          if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
            valuesArray.push(JSON.stringify(object[fieldName]));
          } else {
            valuesArray.push(JSON.stringify(object[fieldName]));
          }
          break;
        case 'Object':
        case 'Bytes':
          valuesArray.push(JSON.stringify(object[fieldName]));
          break;
        case 'String':
        case 'Number':
          valuesArray.push(object[fieldName]);
          break;
        case 'Boolean':
          valuesArray.push(object[fieldName] ? 1 : 0);
          break;
        case 'File':
          valuesArray.push(object[fieldName].name);
          break;
        case 'Polygon': {
          const value = convertPolygonToSQL(object[fieldName].coordinates);
          // Oracle Spatial polygon - simplified for now
          valuesArray.push(value);
          break;
        }
        case 'GeoPoint':
          geoPoints[fieldName] = object[fieldName];
          columnsArray.pop();
          break;
        default:
          throw `Type ${schema.fields[fieldName].type} not supported yet`;
      }
    });

    columnsArray = columnsArray.concat(Object.keys(geoPoints));
    const initialValues = valuesArray.map((val, index) => {
      const fieldName = columnsArray[index];
      if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        return `$${index + 2 + columnsArray.length}`;
      } else if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Object') {
        return `$${index + 2 + columnsArray.length}`;
      }
      return `$${index + 2 + columnsArray.length}`;
    });
    const geoPointsInjects = Object.keys(geoPoints).map(key => {
      const value = geoPoints[key];
      valuesArray.push(value.longitude, value.latitude);
      const l = valuesArray.length + columnsArray.length;
      // Oracle Spatial point
      return `SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE($${l}, $${l + 1}, NULL), NULL, NULL)`;
    });

    const columnsPattern = columnsArray.map((col, index) => `$${index + 2}:name`).join();
    const valuesPattern = initialValues.concat(geoPointsInjects).join();

    const qs = `INSERT INTO $1:name (${columnsPattern}) VALUES (${valuesPattern})`;
    const values = [className, ...columnsArray, ...valuesArray];
    const promise = (transactionalSession ? transactionalSession.t : this._client)
      .none(qs, values)
      .then(() => ({ ops: [object] }))
      .catch(error => {
        if (isOracleError(error, OracleUniqueIndexViolationError)) {
          const err = new Parse.Error(
            Parse.Error.DUPLICATE_VALUE,
            'A duplicate value for a field with unique values was provided'
          );
          err.underlyingError = error;
          if (error.constraint) {
            const matches = error.constraint.match(/unique_([a-zA-Z]+)/);
            if (matches && Array.isArray(matches)) {
              err.userInfo = { duplicated_field: matches[1] };
            }
          }
          error = err;
        }
        throw error;
      });
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  async deleteObjectsByQuery(
    className: string,
    schema: SchemaType,
    query: QueryType,
    transactionalSession: ?any
  ) {
    debug('deleteObjectsByQuery');
    const values = [className];
    const index = 2;
    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false,
    });
    values.push(...where.values);
    if (Object.keys(query).length === 0) {
      where.pattern = '1=1';
    }
    // First get count, then delete
    const countValues = [...values];
    const countQs = `SELECT COUNT(*) as cnt FROM $1:name WHERE ${where.pattern}`;
    const promise = (transactionalSession ? transactionalSession.t : this._client)
      .one(countQs, countValues, a => +a.cnt)
      .then(count => {
        if (count === 0) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }
        // Now delete
        const deleteQs = `DELETE FROM $1:name WHERE ${where.pattern}`;
        return (transactionalSession ? transactionalSession.t : this._client)
          .none(deleteQs, values)
          .then(() => count);
      })
      .catch(error => {
        if (!isOracleError(error, OracleRelationDoesNotExistError)) {
          throw error;
        }
        // Don't delete anything if doesn't exist
        return 0;
      });
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  async findOneAndUpdate(
    className: string,
    schema: SchemaType,
    query: QueryType,
    update: any,
    transactionalSession: ?any
  ): Promise<any> {
    debug('findOneAndUpdate');
    return this.updateObjectsByQuery(className, schema, query, update, transactionalSession).then(
      val => val[0]
    );
  }

  async updateObjectsByQuery(
    className: string,
    schema: SchemaType,
    query: QueryType,
    update: any,
    transactionalSession: ?any
  ): Promise<[any]> {
    debug('updateObjectsByQuery');
    const updatePatterns = [];
    const values = [className];
    let index = 2;
    schema = toOracleSchema(schema);

    const originalUpdate = { ...update };
    const dotNotationOptions = {};
    Object.keys(update).forEach(fieldName => {
      if (fieldName.indexOf('.') > -1) {
        const components = fieldName.split('.');
        const first = components.shift();
        dotNotationOptions[first] = true;
      } else {
        dotNotationOptions[fieldName] = false;
      }
    });
    update = handleDotFields(update);

    for (const fieldName in update) {
      const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      if (authDataMatch) {
        var provider = authDataMatch[1];
        const value = update[fieldName];
        delete update[fieldName];
        update['authData'] = update['authData'] || {};
        update['authData'][provider] = value;
      }
    }

    for (const fieldName in update) {
      const fieldValue = update[fieldName];
      if (typeof fieldValue === 'undefined') {
        delete update[fieldName];
      } else if (fieldValue === null) {
        updatePatterns.push(`$${index}:name = NULL`);
        values.push(fieldName);
        index += 1;
      } else if (fieldName == 'authData') {
        // Oracle JSON merge
        updatePatterns.push(`$${index}:name = JSON_MERGEPATCH(COALESCE($${index}:name, '{}'), $${index + 1})`);
        values.push(fieldName, JSON.stringify(fieldValue));
        index += 2;
      } else if (fieldValue.__op === 'Increment') {
        updatePatterns.push(`$${index}:name = NVL($${index}:name, 0) + $${index + 1}`);
        values.push(fieldName, fieldValue.amount);
        index += 2;
      } else if (fieldValue.__op === 'Add') {
        updatePatterns.push(
          `$${index}:name = array_add(COALESCE($${index}:name, '[]'), $${index + 1})`
        );
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'Delete') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, null);
        index += 2;
      } else if (fieldValue.__op === 'Remove') {
        updatePatterns.push(
          `$${index}:name = array_remove(COALESCE($${index}:name, '[]'), $${index + 1})`
        );
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'AddUnique') {
        updatePatterns.push(
          `$${index}:name = array_add_unique(COALESCE($${index}:name, '[]'), $${index + 1})`
        );
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldName === 'updatedAt') {
        updatePatterns.push(`$${index}:name = TO_TIMESTAMP_TZ($${index + 1}, 'YYYY-MM-DD"T"HH24:MI:SS.FFTZH:TZM')`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'string') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'boolean') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue ? 1 : 0);
        index += 2;
      } else if (fieldValue.__type === 'Pointer') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      } else if (fieldValue.__type === 'Date') {
        updatePatterns.push(`$${index}:name = TO_TIMESTAMP_TZ($${index + 1}, 'YYYY-MM-DD"T"HH24:MI:SS.FFTZH:TZM')`);
        values.push(fieldName, toOracleValue(fieldValue));
        index += 2;
      } else if (fieldValue instanceof Date) {
        updatePatterns.push(`$${index}:name = TO_TIMESTAMP_TZ($${index + 1}, 'YYYY-MM-DD"T"HH24:MI:SS.FFTZH:TZM')`);
        values.push(fieldName, fieldValue.toISOString());
        index += 2;
      } else if (fieldValue.__type === 'File') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toOracleValue(fieldValue));
        index += 2;
      } else if (fieldValue.__type === 'GeoPoint') {
        updatePatterns.push(`$${index}:name = SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE($${index + 1}, $${index + 2}, NULL), NULL, NULL)`);
        values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
        index += 3;
      } else if (fieldValue.__type === 'Polygon') {
        const value = convertPolygonToSQL(fieldValue.coordinates);
        // Oracle Spatial polygon update
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, value);
        index += 2;
      } else if (fieldValue.__type === 'Relation') {
        // noop
      } else if (typeof fieldValue === 'number') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (
        typeof fieldValue === 'object' &&
        schema.fields[fieldName] &&
        schema.fields[fieldName].type === 'Object'
      ) {
        // Oracle JSON merge for objects
        updatePatterns.push(
          `$${index}:name = JSON_MERGEPATCH(COALESCE($${index}:name, '{}'), $${index + 1})`
        );
        values.push(fieldName, JSON.stringify(fieldValue));
        index += 2;
      } else if (
        Array.isArray(fieldValue) &&
        schema.fields[fieldName] &&
        schema.fields[fieldName].type === 'Array'
      ) {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, JSON.stringify(fieldValue));
        index += 2;
      } else {
        debug('Not supported update', { fieldName, fieldValue });
        return Promise.reject(
          new Parse.Error(
            Parse.Error.OPERATION_FORBIDDEN,
            `Oracle doesn't support update ${JSON.stringify(fieldValue)} yet`
          )
        );
      }
    }

    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false,
    });
    values.push(...where.values);

    const whereClause = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    // Oracle UPDATE - need to fetch rows separately since RETURNING works differently
    const qs = `UPDATE $1:name SET ${updatePatterns.join()} ${whereClause}`;
    const promise = (transactionalSession ? transactionalSession.t : this._client)
      .none(qs, values)
      .then(() => {
        // Fetch updated rows after update
        const selectQs = `SELECT * FROM $1:name ${whereClause}`;
        return (transactionalSession ? transactionalSession.t : this._client).any(selectQs, values);
      });
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  upsertOneObject(
    className: string,
    schema: SchemaType,
    query: QueryType,
    update: any,
    transactionalSession: ?any
  ) {
    debug('upsertOneObject');
    const createValue = Object.assign({}, query, update);
    return this.createObject(className, schema, createValue, transactionalSession).catch(error => {
      if (error.code !== Parse.Error.DUPLICATE_VALUE) {
        throw error;
      }
      return this.findOneAndUpdate(className, schema, query, update, transactionalSession);
    });
  }

  find(
    className: string,
    schema: SchemaType,
    query: QueryType,
    { skip, limit, sort, keys, caseInsensitive, explain }: QueryOptions
  ) {
    debug('find');
    const hasLimit = limit !== undefined;
    const hasSkip = skip !== undefined;
    let values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive,
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const limitPattern = hasLimit ? `FETCH FIRST $${values.length + 1} ROWS ONLY` : '';
    if (hasLimit) {
      values.push(limit);
    }
    const skipPattern = hasSkip ? `OFFSET $${values.length + 1}` : '';
    if (hasSkip) {
      values.push(skip);
    }

    let sortPattern = '';
    if (sort) {
      const sortCopy: any = sort;
      const sorting = Object.keys(sort)
        .map(key => {
          const transformKey = transformDotFieldToComponents(key).join('.');
          if (sortCopy[key] === 1) {
            return `${transformKey} ASC`;
          }
          return `${transformKey} DESC`;
        })
        .join();
      sortPattern = sort !== undefined && Object.keys(sort).length > 0 ? `ORDER BY ${sorting}` : '';
    }
    if (where.sorts && Object.keys((where.sorts: any)).length > 0) {
      sortPattern = `ORDER BY ${where.sorts.join()}`;
    }

    let columns = '*';
    if (keys) {
      keys = keys.reduce((memo, key) => {
        if (key === 'ACL') {
          memo.push('_rperm');
          memo.push('_wperm');
        } else if (
          key.length > 0 &&
          ((schema.fields[key] && schema.fields[key].type !== 'Relation') || key === '$score')
        ) {
          memo.push(key);
        }
        return memo;
      }, []);
      columns = keys
        .map((key, index) => {
          if (key === '$score') {
            // Oracle text search ranking - simplified
            return `1 as score`;
          }
          return `$${index + values.length + 1}:name`;
        })
        .join();
      values = values.concat(keys);
    }

    const originalQuery = `SELECT ${columns} FROM $1:name ${wherePattern} ${sortPattern} ${skipPattern} ${limitPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client
      .any(qs, values)
      .catch(error => {
        if (!isOracleError(error, OracleRelationDoesNotExistError)) {
          throw error;
        }
        return [];
      })
      .then(results => {
        if (explain) {
          return results;
        }
        return results.map(object => this.oracleObjectToParseObject(className, object, schema));
      });
  }

  oracleObjectToParseObject(className: string, object: any, schema: any) {
    Object.keys(schema.fields).forEach(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer' && object[fieldName]) {
        object[fieldName] = {
          objectId: object[fieldName],
          __type: 'Pointer',
          className: schema.fields[fieldName].targetClass,
        };
      }
      if (schema.fields[fieldName].type === 'Relation') {
        object[fieldName] = {
          __type: 'Relation',
          className: schema.fields[fieldName].targetClass,
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'GeoPoint') {
        // Oracle Spatial to Parse GeoPoint
        object[fieldName] = {
          __type: 'GeoPoint',
          latitude: object[fieldName].SDO_POINT.Y,
          longitude: object[fieldName].SDO_POINT.X,
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'Polygon') {
        // Oracle Spatial polygon to Parse Polygon
        // Simplified - would need proper conversion
        object[fieldName] = {
          __type: 'Polygon',
          coordinates: [],
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'File') {
        object[fieldName] = {
          __type: 'File',
          name: object[fieldName],
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'Array') {
        if (typeof object[fieldName] === 'string') {
          object[fieldName] = JSON.parse(object[fieldName]);
        }
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'Object') {
        if (typeof object[fieldName] === 'string') {
          object[fieldName] = JSON.parse(object[fieldName]);
        }
      }
    });
    if (object.createdAt) {
      object.createdAt = object.createdAt.toISOString();
    }
    if (object.updatedAt) {
      object.updatedAt = object.updatedAt.toISOString();
    }
    if (object.expiresAt) {
      object.expiresAt = {
        __type: 'Date',
        iso: object.expiresAt.toISOString(),
      };
    }
    if (object._email_verify_token_expires_at) {
      object._email_verify_token_expires_at = {
        __type: 'Date',
        iso: object._email_verify_token_expires_at.toISOString(),
      };
    }
    if (object._account_lockout_expires_at) {
      object._account_lockout_expires_at = {
        __type: 'Date',
        iso: object._account_lockout_expires_at.toISOString(),
      };
    }
    if (object._perishable_token_expires_at) {
      object._perishable_token_expires_at = {
        __type: 'Date',
        iso: object._perishable_token_expires_at.toISOString(),
      };
    }
    if (object._password_changed_at) {
      object._password_changed_at = {
        __type: 'Date',
        iso: object._password_changed_at.toISOString(),
      };
    }

    for (const fieldName in object) {
      if (object[fieldName] === null) {
        delete object[fieldName];
      }
      if (object[fieldName] instanceof Date) {
        object[fieldName] = {
          __type: 'Date',
          iso: object[fieldName].toISOString(),
        };
      }
    }

    return object;
  }

  async ensureUniqueness(className: string, schema: SchemaType, fieldNames: string[]) {
    const constraintName = `${className}_unique_${fieldNames.sort().join('_')}`;
    const constraintPatterns = fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    // Oracle doesn't support IF NOT EXISTS, need to check first
    const indexExists = await this._client.one(
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM user_indexes WHERE index_name = :1) THEN 1 ELSE 0 END as cnt FROM DUAL",
      [constraintName.toUpperCase()],
      a => a.cnt > 0
    ).catch(() => false);

    if (!indexExists) {
      const qs = `CREATE UNIQUE INDEX $2:name ON $1:name(${constraintPatterns.join()})`;
      return this._client.none(qs, [className, constraintName, ...fieldNames]).catch(error => {
        if (isOracleError(error, OracleDuplicateRelationError) && error.message && error.message.includes(constraintName)) {
          // Index already exists. Ignore error.
        } else if (
          isOracleError(error, OracleUniqueIndexViolationError) &&
          error.message && error.message.includes(constraintName)
        ) {
          throw new Parse.Error(
            Parse.Error.DUPLICATE_VALUE,
            'A duplicate value for a field with unique values was provided'
          );
        } else {
          throw error;
        }
      });
    }
  }

  async count(
    className: string,
    schema: SchemaType,
    query: QueryType,
    readPreference?: string,
    estimate?: boolean = true
  ) {
    debug('count');
    const values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive: false,
    });
    values.push(...where.values);

    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    let qs = '';

    if (where.pattern.length > 0 || !estimate) {
      qs = `SELECT count(*) as cnt FROM $1:name ${wherePattern}`;
    } else {
      // Oracle approximate count
      qs = "SELECT num_rows as approximate_row_count FROM user_tables WHERE table_name = :1";
    }

    return this._client
      .one(qs, values, a => {
        if (a.approximate_row_count == null || a.approximate_row_count == -1) {
          return !isNaN(+a.cnt) ? +a.cnt : 0;
        } else {
          return +a.approximate_row_count;
        }
      })
      .catch(error => {
        if (!isOracleError(error, OracleRelationDoesNotExistError)) {
          throw error;
        }
        return 0;
      });
  }

  async distinct(className: string, schema: SchemaType, query: QueryType, fieldName: string) {
    debug('distinct');
    let field = fieldName;
    let column = fieldName;
    const isNested = fieldName.indexOf('.') >= 0;
    if (isNested) {
      field = transformDotField(fieldName);
      column = fieldName.split('.')[0];
    }
    const isArrayField =
      schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const isPointerField =
      schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const values = [field, column, className];
    const where = buildWhereClause({
      schema,
      query,
      index: 4,
      caseInsensitive: false,
    });
    values.push(...where.values);

    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    // Oracle DISTINCT with JSON array elements
    let qs = `SELECT DISTINCT $1:name FROM $3:name ${wherePattern}`;
    if (isNested) {
      qs = `SELECT DISTINCT $1:raw FROM $3:name ${wherePattern}`;
    }
    return this._client
      .any(qs, values)
      .catch(error => {
        if (isOracleError(error, OracleMissingColumnError)) {
          return [];
        }
        throw error;
      })
      .then(results => {
        if (!isNested) {
          results = results.filter(object => object[field] !== null);
          return results.map(object => {
            if (!isPointerField) {
              return object[field];
            }
            return {
              __type: 'Pointer',
              className: schema.fields[fieldName].targetClass,
              objectId: object[field],
            };
          });
        }
        const child = fieldName.split('.')[1];
        return results.map(object => object[column][child]);
      })
      .then(results =>
        results.map(object => this.oracleObjectToParseObject(className, object, schema))
      );
  }

  async aggregate(
    className: string,
    schema: any,
    pipeline: any,
    readPreference: ?string,
    hint: ?mixed,
    explain?: boolean
  ) {
    debug('aggregate');
    const values = [className];
    let index: number = 2;
    let columns: string[] = [];
    let countField = null;
    let groupValues = null;
    let wherePattern = '';
    let limitPattern = '';
    let skipPattern = '';
    let sortPattern = '';
    let groupPattern = '';
    for (let i = 0; i < pipeline.length; i += 1) {
      const stage = pipeline[i];
      if (stage.$group) {
        for (const field in stage.$group) {
          const value = stage.$group[field];
          if (value === null || value === undefined) {
            continue;
          }
          if (field === '_id' && typeof value === 'string' && value !== '') {
            columns.push(`$${index}:name AS "objectId"`);
            groupPattern = `GROUP BY $${index}:name`;
            values.push(transformAggregateField(value));
            index += 1;
            continue;
          }
          if (field === '_id' && typeof value === 'object' && Object.keys(value).length !== 0) {
            groupValues = value;
            const groupByFields = [];
            for (const alias in value) {
              if (typeof value[alias] === 'string' && value[alias]) {
                const source = transformAggregateField(value[alias]);
                if (!groupByFields.includes(`"${source}"`)) {
                  groupByFields.push(`"${source}"`);
                }
                values.push(source, alias);
                columns.push(`$${index}:name AS $${index + 1}:name`);
                index += 2;
              } else {
                const operation = Object.keys(value[alias])[0];
                const source = transformAggregateField(value[alias][operation]);
                if (mongoAggregateToOracle[operation]) {
                  if (!groupByFields.includes(`"${source}"`)) {
                    groupByFields.push(`"${source}"`);
                  }
                  columns.push(
                    `EXTRACT(${mongoAggregateToOracle[operation]
                    } FROM $${index}:name) AS $${index + 1}:name`
                  );
                  values.push(source, alias);
                  index += 2;
                }
              }
            }
            groupPattern = `GROUP BY $${index}:raw`;
            values.push(groupByFields.join());
            index += 1;
            continue;
          }
          if (typeof value === 'object') {
            if (value.$sum) {
              if (typeof value.$sum === 'string') {
                columns.push(`SUM($${index}:name) AS $${index + 1}:name`);
                values.push(transformAggregateField(value.$sum), field);
                index += 2;
              } else {
                countField = field;
                columns.push(`COUNT(*) AS $${index}:name`);
                values.push(field);
                index += 1;
              }
            }
            if (value.$max) {
              columns.push(`MAX($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$max), field);
              index += 2;
            }
            if (value.$min) {
              columns.push(`MIN($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$min), field);
              index += 2;
            }
            if (value.$avg) {
              columns.push(`AVG($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$avg), field);
              index += 2;
            }
          }
        }
      } else {
        columns.push('*');
      }
      if (stage.$project) {
        if (columns.includes('*')) {
          columns = [];
        }
        for (const field in stage.$project) {
          const value = stage.$project[field];
          if (value === 1 || value === true) {
            columns.push(`$${index}:name`);
            values.push(field);
            index += 1;
          }
        }
      }
      if (stage.$match) {
        const patterns = [];
        const orOrAnd = Object.prototype.hasOwnProperty.call(stage.$match, '$or')
          ? ' OR '
          : ' AND ';

        if (stage.$match.$or) {
          const collapse = {};
          stage.$match.$or.forEach(element => {
            for (const key in element) {
              collapse[key] = element[key];
            }
          });
          stage.$match = collapse;
        }
        for (let field in stage.$match) {
          const value = stage.$match[field];
          if (field === '_id') {
            field = 'objectId';
          }
          const matchPatterns = [];
          Object.keys(ParseToOracleComparator).forEach(cmp => {
            if (value[cmp]) {
              const oracleComparator = ParseToOracleComparator[cmp];
              matchPatterns.push(`$${index}:name ${oracleComparator} $${index + 1}`);
              values.push(field, toOracleValue(value[cmp]));
              index += 2;
            }
          });
          if (matchPatterns.length > 0) {
            patterns.push(`(${matchPatterns.join(' AND ')})`);
          }
          if (schema.fields[field] && schema.fields[field].type && matchPatterns.length === 0) {
            patterns.push(`$${index}:name = $${index + 1}`);
            values.push(field, value);
            index += 2;
          }
        }
        wherePattern = patterns.length > 0 ? `WHERE ${patterns.join(` ${orOrAnd} `)}` : '';
      }
      if (stage.$limit) {
        limitPattern = `FETCH FIRST $${index} ROWS ONLY`;
        values.push(stage.$limit);
        index += 1;
      }
      if (stage.$skip) {
        skipPattern = `OFFSET $${index}`;
        values.push(stage.$skip);
        index += 1;
      }
      if (stage.$sort) {
        const sort = stage.$sort;
        const keys = Object.keys(sort);
        const sorting = keys
          .map(key => {
            const transformer = sort[key] === 1 ? 'ASC' : 'DESC';
            const order = `$${index}:name ${transformer}`;
            index += 1;
            return order;
          })
          .join();
        values.push(...keys);
        sortPattern = sort !== undefined && sorting.length > 0 ? `ORDER BY ${sorting}` : '';
      }
    }

    if (groupPattern) {
      columns.forEach((e, i, a) => {
        if (e && e.trim() === '*') {
          a[i] = '';
        }
      });
    }

    const originalQuery = `SELECT ${columns
      .filter(Boolean)
      .join()} FROM $1:name ${wherePattern} ${skipPattern} ${groupPattern} ${sortPattern} ${limitPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client.any(qs, values).then(a => {
      if (explain) {
        return a;
      }
      const results = a.map(object => this.oracleObjectToParseObject(className, object, schema));
      results.forEach(result => {
        if (!Object.prototype.hasOwnProperty.call(result, 'objectId')) {
          result.objectId = null;
        }
        if (groupValues) {
          result.objectId = {};
          for (const key in groupValues) {
            result.objectId[key] = result[key];
            delete result[key];
          }
        }
        if (countField) {
          result[countField] = parseInt(result[countField], 10);
        }
      });
      return results;
    });
  }

  async performInitialization({ VolatileClassesSchemas }: any) {
    debug('performInitialization');
    await this._ensureSchemaCollectionExists();
    const promises = VolatileClassesSchemas.map(schema => {
      return this.createTable(schema.className, schema)
        .catch(err => {
          if (
            isOracleError(err, OracleDuplicateRelationError) ||
            err.code === Parse.Error.INVALID_CLASS_NAME
          ) {
            return Promise.resolve();
          }
          throw err;
        })
        .then(() => this.schemaUpgrade(schema.className, schema));
    });
    promises.push(this._listenToSchema());
    return Promise.all(promises)
      .then(() => {
        return this._client.tx('perform-initialization', async t => {
          await t.none(sql.misc.jsonObjectSetKeys);
          await t.none(sql.array.add);
          await t.none(sql.array.addUnique);
          await t.none(sql.array.remove);
          await t.none(sql.array.containsAll);
          await t.none(sql.array.containsAllRegex);
          await t.none(sql.array.contains);
          return t.ctx;
        });
      })
      .then(ctx => {
        debug(`initializationDone in ${ctx.duration || 0}`);
      })
      .catch(error => {
        // eslint-disable-next-line no-console
        console.error(error);
      });
  }

  async createIndexes(className: string, indexes: any, conn: ?any): Promise<void> {
    return (conn || this._client).tx(t =>
      t.batch(
        indexes.map(i => {
          const indexName = i.name;
          // Check if index exists first
          return t.one(
            "SELECT CASE WHEN EXISTS (SELECT 1 FROM user_indexes WHERE index_name = :1) THEN 1 ELSE 0 END as cnt FROM DUAL",
            [indexName.toUpperCase()],
            a => a.cnt > 0
          ).then(exists => {
            if (!exists) {
              return t.none('CREATE INDEX $1:name ON $2:name ($3:name)', [
                indexName,
                className,
                i.key,
              ]);
            }
          });
        })
      )
    );
  }

  async createIndexesIfNeeded(
    className: string,
    fieldName: string,
    type: any,
    conn: ?any
  ): Promise<void> {
    const indexExists = await (conn || this._client).one(
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM user_indexes WHERE index_name = :1) THEN 1 ELSE 0 END as cnt FROM DUAL",
      [fieldName.toUpperCase()],
      a => a.cnt > 0
    ).catch(() => false);

    if (!indexExists) {
      await (conn || this._client).none('CREATE INDEX $1:name ON $2:name ($3:name)', [
        fieldName,
        className,
        type,
      ]);
    }
  }

  async dropIndexes(className: string, indexes: any, conn: any): Promise<void> {
    const queries = indexes.map(i => ({
      query: 'DROP INDEX $1:name',
      values: [i],
    }));
    await (conn || this._client).tx(t => {
      return t.batch(queries.map(q => t.none(q.query, q.values)));
    });
  }

  async getIndexes(className: string) {
    const qs = "SELECT * FROM user_indexes WHERE table_name = :1";
    return this._client.any(qs, [className.toUpperCase()]);
  }

  async updateSchemaWithIndexes(): Promise<void> {
    return Promise.resolve();
  }

  async updateEstimatedCount(className: string) {
    return this._client.none('ANALYZE TABLE $1:name', [className]);
  }

  async createTransactionalSession(): Promise<any> {
    return new Promise(resolve => {
      const transactionalSession = {};
      transactionalSession.result = this._client.tx(t => {
        transactionalSession.t = t;
        transactionalSession.promise = new Promise(resolve => {
          transactionalSession.resolve = resolve;
        });
        transactionalSession.batch = [];
        resolve(transactionalSession);
        return transactionalSession.promise;
      });
    });
  }

  commitTransactionalSession(transactionalSession: any): Promise<void> {
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return transactionalSession.result;
  }

  abortTransactionalSession(transactionalSession: any): Promise<void> {
    const result = transactionalSession.result.catch();
    transactionalSession.batch.push(Promise.reject());
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return result;
  }

  async ensureIndex(
    className: string,
    schema: SchemaType,
    fieldNames: string[],
    indexName: ?string,
    caseInsensitive: boolean = false,
    options?: Object = {}
  ): Promise<any> {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const defaultIndexName = `parse_default_${fieldNames.sort().join('_')}`;
    const indexNameOptions: Object =
      indexName != null ? { name: indexName } : { name: defaultIndexName };
    const constraintPatterns = caseInsensitive
      ? fieldNames.map((fieldName, index) => `LOWER($${index + 3}:name)`)
      : fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    
    const indexExists = await conn.one(
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM user_indexes WHERE index_name = :1) THEN 1 ELSE 0 END as cnt FROM DUAL",
      [indexNameOptions.name.toUpperCase()],
      a => a.cnt > 0
    ).catch(() => false);

    if (!indexExists) {
      const qs = `CREATE INDEX $1:name ON $2:name (${constraintPatterns.join()})`;
      await conn.none(qs, [indexNameOptions.name, className, ...fieldNames]).catch(error => {
        if (
          isOracleError(error, OracleDuplicateRelationError) &&
          error.message && error.message.includes(indexNameOptions.name)
        ) {
          // Index already exists. Ignore error.
        } else if (
          isOracleError(error, OracleUniqueIndexViolationError) &&
          error.message && error.message.includes(indexNameOptions.name)
        ) {
          throw new Parse.Error(
            Parse.Error.DUPLICATE_VALUE,
            'A duplicate value for a field with unique values was provided'
          );
        } else {
          throw error;
        }
      });
    }
  }

  async deleteIdempotencyFunction(options?: Object = {}): Promise<any> {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const qs = 'DROP FUNCTION idempotency_delete_expired_records';
    return conn.none(qs).catch(error => {
      // Ignore if function doesn't exist
      if (!isOracleError(error, OracleRelationDoesNotExistError)) {
        throw error;
      }
    });
  }

  async ensureIdempotencyFunctionExists(options?: Object = {}): Promise<any> {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const ttlOptions = options.ttl !== undefined ? `${options.ttl}` : '60';
    const qs =
      `CREATE OR REPLACE FUNCTION idempotency_delete_expired_records RETURN void AS BEGIN DELETE FROM "_Idempotency" WHERE expire < SYSTIMESTAMP - INTERVAL '${ttlOptions}' SECOND; END;`;
    return conn.none(qs).catch(error => {
      throw error;
    });
  }
}

export default OracleStorageAdapter;


