"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PostgresStorageAdapter = void 0;
var _PostgresClient = require("./PostgresClient");
var _node = _interopRequireDefault(require("parse/node"));
var _lodash = _interopRequireDefault(require("lodash"));
var _uuid = require("uuid");
var _sql = _interopRequireDefault(require("./sql"));
var _StorageAdapter = require("../StorageAdapter");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const Utils = require('../../../Utils');
const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';
const PostgresDuplicateColumnError = '42701';
const PostgresMissingColumnError = '42703';
const PostgresUniqueIndexViolationError = '23505';
const logger = require('../../../logger');
const debug = function (...args) {
  args = ['PG: ' + arguments[0]].concat(args.slice(1, args.length));
  const log = logger.getLogger();
  log.debug.apply(log, args);
};
const parseTypeToPostgresType = type => {
  switch (type.type) {
    case 'String':
      return 'text';
    case 'Date':
      return 'timestamp with time zone';
    case 'Object':
      return 'jsonb';
    case 'File':
      return 'text';
    case 'Boolean':
      return 'boolean';
    case 'Pointer':
      return 'text';
    case 'Number':
      return 'double precision';
    case 'GeoPoint':
      return 'point';
    case 'Bytes':
      return 'jsonb';
    case 'Polygon':
      return 'polygon';
    case 'Array':
      if (type.contents && type.contents.type === 'String') {
        return 'text[]';
      } else {
        return 'jsonb';
      }
    default:
      throw `no type for ${JSON.stringify(type)} yet`;
  }
};
const ParseToPosgresComparator = {
  $gt: '>',
  $lt: '<',
  $gte: '>=',
  $lte: '<='
};
const mongoAggregateToPostgres = {
  $dayOfMonth: 'DAY',
  $dayOfWeek: 'DOW',
  $dayOfYear: 'DOY',
  $isoDayOfWeek: 'ISODOW',
  $isoWeekYear: 'ISOYEAR',
  $hour: 'HOUR',
  $minute: 'MINUTE',
  $second: 'SECOND',
  $millisecond: 'MILLISECONDS',
  $month: 'MONTH',
  $week: 'WEEK',
  $year: 'YEAR'
};
const toPostgresValue = value => {
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
const toPostgresValueCastType = value => {
  const postgresValue = toPostgresValue(value);
  let castType;
  switch (typeof postgresValue) {
    case 'number':
      castType = 'double precision';
      break;
    case 'boolean':
      castType = 'boolean';
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

// Duplicate from then mongo adapter...
const emptyCLPS = Object.freeze({
  find: {},
  get: {},
  count: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
  protectedFields: {}
});
const defaultCLPS = Object.freeze({
  find: {
    '*': true
  },
  get: {
    '*': true
  },
  count: {
    '*': true
  },
  create: {
    '*': true
  },
  update: {
    '*': true
  },
  delete: {
    '*': true
  },
  addField: {
    '*': true
  },
  protectedFields: {
    '*': []
  }
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
    clps = _objectSpread(_objectSpread({}, emptyCLPS), schema.classLevelPermissions);
  }
  let indexes = {};
  if (schema.indexes) {
    indexes = _objectSpread({}, schema.indexes);
  }
  return {
    className: schema.className,
    fields: schema.fields,
    classLevelPermissions: clps,
    indexes
  };
};
const toPostgresSchema = schema => {
  if (!schema) {
    return schema;
  }
  schema.fields = schema.fields || {};
  schema.fields._wperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };
  schema.fields._rperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };
  if (schema.className === '_User') {
    schema.fields._hashed_password = {
      type: 'String'
    };
    schema.fields._password_history = {
      type: 'Array'
    };
  }
  return schema;
};
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
      /* eslint-disable no-cond-assign */
      while (next = components.shift()) {
        /* eslint-enable no-cond-assign */
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
    return `'${cmpt}'`;
  });
};
const transformDotField = fieldName => {
  if (fieldName.indexOf('.') === -1) {
    return `"${fieldName}"`;
  }
  const components = transformDotFieldToComponents(fieldName);
  let name = components.slice(0, components.length - 1).join('->');
  name += '->>' + components[components.length - 1];
  return name;
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
        throw new _node.default.Error(_node.default.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
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
const buildWhereClause = ({
  schema,
  query,
  index,
  caseInsensitive
}) => {
  const patterns = [];
  let values = [];
  const sorts = [];
  schema = toPostgresSchema(schema);
  for (const fieldName in query) {
    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
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
          name = transformDotFieldToComponents(fieldName).join('->');
          patterns.push(`($${index}:raw)::jsonb @> $${index + 1}::jsonb`);
          values.push(name, JSON.stringify(fieldValue.$in));
          index += 2;
        } else if (fieldValue.$regex) {
          // Handle later
        } else if (typeof fieldValue !== 'object') {
          patterns.push(`$${index}:raw = $${index + 1}::text`);
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
      // Can't cast boolean to double precision
      if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Number') {
        // Should always return zero results
        const MAX_INT_PLUS_ONE = 9223372036854775808;
        values.push(fieldName, MAX_INT_PLUS_ONE);
      } else {
        values.push(fieldName, fieldValue);
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
          caseInsensitive
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
        patterns.push(`NOT array_contains($${index}:name, $${index + 1})`);
      } else {
        if (fieldValue.$ne === null) {
          patterns.push(`$${index}:name IS NOT NULL`);
          values.push(fieldName);
          index += 1;
          continue;
        } else {
          // if not null, we need to manually exclude null
          if (fieldValue.$ne.__type === 'GeoPoint') {
            patterns.push(`($${index}:name <> POINT($${index + 1}, $${index + 2}) OR $${index}:name IS NULL)`);
          } else {
            if (fieldName.indexOf('.') >= 0) {
              const castType = toPostgresValueCastType(fieldValue.$ne);
              const constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
              patterns.push(`(${constraintFieldName} <> $${index + 1} OR ${constraintFieldName} IS NULL)`);
            } else if (typeof fieldValue.$ne === 'object' && fieldValue.$ne.$relativeTime) {
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
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
          const castType = toPostgresValueCastType(fieldValue.$eq);
          const constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
          values.push(fieldValue.$eq);
          patterns.push(`${constraintFieldName} = $${index++}`);
        } else if (typeof fieldValue.$eq === 'object' && fieldValue.$eq.$relativeTime) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
        } else {
          values.push(fieldName, fieldValue.$eq);
          patterns.push(`$${index}:name = $${index + 1}`);
          index += 2;
        }
      }
    }
    const isInOrNin = Array.isArray(fieldValue.$in) || Array.isArray(fieldValue.$nin);
    if (Array.isArray(fieldValue.$in) && isArrayField && schema.fields[fieldName].contents && schema.fields[fieldName].contents.type === 'String') {
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
      if (allowNull) {
        patterns.push(`($${index}:name IS NULL OR $${index}:name && ARRAY[${inPatterns.join()}])`);
      } else {
        patterns.push(`$${index}:name && ARRAY[${inPatterns.join()}]`);
      }
      index = index + 1 + inPatterns.length;
    } else if (isInOrNin) {
      var createConstraint = (baseArray, notIn) => {
        const not = notIn ? ' NOT ' : '';
        if (baseArray.length > 0) {
          if (isArrayField) {
            patterns.push(`${not} array_contains($${index}:name, $${index + 1})`);
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
        createConstraint(_lodash.default.flatMap(fieldValue.$in, elt => elt), false);
      }
      if (fieldValue.$nin) {
        createConstraint(_lodash.default.flatMap(fieldValue.$nin, elt => elt), true);
      }
    } else if (typeof fieldValue.$in !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $in value');
    } else if (typeof fieldValue.$nin !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $nin value');
    }
    if (Array.isArray(fieldValue.$all) && isArrayField) {
      if (isAnyValueRegexStartsWith(fieldValue.$all)) {
        if (!isAllValuesRegexOrNone(fieldValue.$all)) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'All $all values must be of regex type or none: ' + fieldValue.$all);
        }
        for (let i = 0; i < fieldValue.$all.length; i += 1) {
          const value = processRegexPattern(fieldValue.$all[i].$regex);
          fieldValue.$all[i] = value.substring(1) + '%';
        }
        patterns.push(`array_contains_all_regex($${index}:name, $${index + 1}::jsonb)`);
      } else {
        patterns.push(`array_contains_all($${index}:name, $${index + 1}::jsonb)`);
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
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
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
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $containedBy: should be an array`);
      }
      patterns.push(`$${index}:name <@ $${index + 1}::jsonb`);
      values.push(fieldName, JSON.stringify(arr));
      index += 2;
    }
    if (fieldValue.$text) {
      const search = fieldValue.$text.$search;
      let language = 'english';
      if (typeof search !== 'object') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $search, should be object`);
      }
      if (!search.$term || typeof search.$term !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $term, should be string`);
      }
      if (search.$language && typeof search.$language !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $language, should be string`);
      } else if (search.$language) {
        language = search.$language;
      }
      if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive, should be boolean`);
      } else if (search.$caseSensitive) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive not supported, please use $regex or create a separate lower case column.`);
      }
      if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive, should be boolean`);
      } else if (search.$diacriticSensitive === false) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive - false not supported, install Postgres Unaccent Extension`);
      }
      patterns.push(`to_tsvector($${index}, $${index + 1}:name) @@ to_tsquery($${index + 2}, $${index + 3})`);
      values.push(language, fieldName, language, search.$term);
      index += 4;
    }
    if (fieldValue.$nearSphere) {
      const point = fieldValue.$nearSphere;
      const distance = fieldValue.$maxDistance;
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      sorts.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) ASC`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }
    if (fieldValue.$within && fieldValue.$within.$box) {
      const box = fieldValue.$within.$box;
      const left = box[0].longitude;
      const bottom = box[0].latitude;
      const right = box[1].longitude;
      const top = box[1].latitude;
      patterns.push(`$${index}:name::point <@ $${index + 1}::box`);
      values.push(fieldName, `((${left}, ${bottom}), (${right}, ${top}))`);
      index += 2;
    }
    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$centerSphere) {
      const centerSphere = fieldValue.$geoWithin.$centerSphere;
      if (!(centerSphere instanceof Array) || centerSphere.length < 2) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere should be an array of Parse.GeoPoint and distance');
      }
      // Get point, convert to geo point if necessary and validate
      let point = centerSphere[0];
      if (point instanceof Array && point.length === 2) {
        point = new _node.default.GeoPoint(point[1], point[0]);
      } else if (!GeoPointCoder.isValidJSON(point)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
      }
      _node.default.GeoPoint._validate(point.latitude, point.longitude);
      // Get distance and validate
      const distance = centerSphere[1];
      if (isNaN(distance) || distance < 0) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere distance invalid');
      }
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }
    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$polygon) {
      const polygon = fieldValue.$geoWithin.$polygon;
      let points;
      if (typeof polygon === 'object' && polygon.__type === 'Polygon') {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; Polygon.coordinates should contain at least 3 lon/lat pairs');
        }
        points = polygon.coordinates;
      } else if (polygon instanceof Array) {
        if (polygon.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $polygon should contain at least 3 GeoPoints');
        }
        points = polygon;
      } else {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, "bad $geoWithin value; $polygon should be Polygon object or Array of Parse.GeoPoint's");
      }
      points = points.map(point => {
        if (point instanceof Array && point.length === 2) {
          _node.default.GeoPoint._validate(point[1], point[0]);
          return `(${point[0]}, ${point[1]})`;
        }
        if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value');
        } else {
          _node.default.GeoPoint._validate(point.latitude, point.longitude);
        }
        return `(${point.longitude}, ${point.latitude})`;
      }).join(', ');
      patterns.push(`$${index}:name::point <@ $${index + 1}::polygon`);
      values.push(fieldName, `(${points})`);
      index += 2;
    }
    if (fieldValue.$geoIntersects && fieldValue.$geoIntersects.$point) {
      const point = fieldValue.$geoIntersects.$point;
      if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoIntersect value; $point should be GeoPoint');
      } else {
        _node.default.GeoPoint._validate(point.latitude, point.longitude);
      }
      patterns.push(`$${index}:name::polygon @> $${index + 1}::point`);
      values.push(fieldName, `(${point.longitude}, ${point.latitude})`);
      index += 2;
    }
    if (fieldValue.$regex) {
      let regex = fieldValue.$regex;
      let operator = '~';
      const opts = fieldValue.$options;
      if (opts) {
        if (opts.indexOf('i') >= 0) {
          operator = '~*';
        }
        if (opts.indexOf('x') >= 0) {
          regex = removeWhiteSpace(regex);
        }
      }
      const name = transformDotField(fieldName);
      regex = processRegexPattern(regex);
      patterns.push(`$${index}:raw ${operator} '$${index + 1}:raw'`);
      values.push(name, regex);
      index += 2;
    }
    if (fieldValue.__type === 'Pointer') {
      if (isArrayField) {
        patterns.push(`array_contains($${index}:name, $${index + 1})`);
        values.push(fieldName, JSON.stringify([fieldValue]));
        index += 2;
      } else {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      }
    }
    if (fieldValue.__type === 'Date') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue.iso);
      index += 2;
    }
    if (fieldValue.__type === 'GeoPoint') {
      patterns.push(`$${index}:name ~= POINT($${index + 1}, $${index + 2})`);
      values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
      index += 3;
    }
    if (fieldValue.__type === 'Polygon') {
      const value = convertPolygonToSQL(fieldValue.coordinates);
      patterns.push(`$${index}:name ~= $${index + 1}::polygon`);
      values.push(fieldName, value);
      index += 2;
    }
    Object.keys(ParseToPosgresComparator).forEach(cmp => {
      if (fieldValue[cmp] || fieldValue[cmp] === 0) {
        const pgComparator = ParseToPosgresComparator[cmp];
        let constraintFieldName;
        let postgresValue = toPostgresValue(fieldValue[cmp]);
        if (fieldName.indexOf('.') >= 0) {
          const castType = toPostgresValueCastType(fieldValue[cmp]);
          constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
        } else {
          if (typeof postgresValue === 'object' && postgresValue.$relativeTime) {
            if (schema.fields[fieldName].type !== 'Date') {
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with Date field');
            }
            const parserResult = Utils.relativeTimeToDate(postgresValue.$relativeTime);
            if (parserResult.status === 'success') {
              postgresValue = toPostgresValue(parserResult.result);
            } else {
              console.error('Error while parsing relative date', parserResult);
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $relativeTime (${postgresValue.$relativeTime}) value. ${parserResult.info}`);
            }
          }
          constraintFieldName = `$${index++}:name`;
          values.push(fieldName);
        }
        values.push(postgresValue);
        patterns.push(`${constraintFieldName} ${pgComparator} $${index++}`);
      }
    });
    if (initialPatternsLength === patterns.length) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support this query type yet ${JSON.stringify(fieldValue)}`);
    }
  }
  values = values.map(transformValue);
  return {
    pattern: patterns.join(' AND '),
    values,
    sorts
  };
};
class PostgresStorageAdapter {
  // Private

  constructor({
    uri,
    collectionPrefix = '',
    databaseOptions = {}
  }) {
    const options = _objectSpread({}, databaseOptions);
    this._collectionPrefix = collectionPrefix;
    this.enableSchemaHooks = !!databaseOptions.enableSchemaHooks;
    this.schemaCacheTtl = databaseOptions.schemaCacheTtl;
    this.disableIndexFieldValidation = !!databaseOptions.disableIndexFieldValidation;
    for (const key of ['enableSchemaHooks', 'schemaCacheTtl', 'disableIndexFieldValidation']) {
      delete options[key];
    }
    const {
      client,
      pgp
    } = (0, _PostgresClient.createClient)(uri, options);
    this._client = client;
    this._onchange = () => {};
    this._pgp = pgp;
    this._uuid = (0, _uuid.v4)();
    this.canSortOnJoinTables = false;
  }
  watch(callback) {
    this._onchange = callback;
  }

  //Note that analyze=true will run the query, executing INSERTS, DELETES, etc.
  createExplainableQuery(query, analyze = false) {
    if (analyze) {
      return 'EXPLAIN (ANALYZE, FORMAT JSON) ' + query;
    } else {
      return 'EXPLAIN (FORMAT JSON) ' + query;
    }
  }
  handleShutdown() {
    if (this._stream) {
      this._stream.done();
      delete this._stream;
    }
    if (!this._client) {
      return;
    }
    this._client.$pool.end();
  }
  async _listenToSchema() {
    if (!this._stream && this.enableSchemaHooks) {
      this._stream = await this._client.connect({
        direct: true
      });
      this._stream.client.on('notification', data => {
        const payload = JSON.parse(data.payload);
        if (payload.senderId !== this._uuid) {
          this._onchange();
        }
      });
      await this._stream.none('LISTEN $1~', 'schema.change');
    }
  }
  _notifySchemaChange() {
    if (this._stream) {
      this._stream.none('NOTIFY $1~, $2', ['schema.change', {
        senderId: this._uuid
      }]).catch(error => {
        console.log('Failed to Notify:', error); // unlikely to ever happen
      });
    }
  }

  async _ensureSchemaCollectionExists(conn) {
    conn = conn || this._client;
    await conn.none('CREATE TABLE IF NOT EXISTS "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )').catch(error => {
      throw error;
    });
  }
  async classExists(name) {
    return this._client.one('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)', [name], a => a.exists);
  }
  async setClassLevelPermissions(className, CLPs) {
    await this._client.task('set-class-level-permissions', async t => {
      const values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)];
      await t.none(`UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1`, values);
    });
    this._notifySchemaChange();
  }
  async setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields, conn) {
    conn = conn || this._client;
    const self = this;
    if (submittedIndexes === undefined) {
      return Promise.resolve();
    }
    if (Object.keys(existingIndexes).length === 0) {
      existingIndexes = {
        _id_: {
          _id: 1
        }
      };
    }
    const deletedIndexes = [];
    const insertedIndexes = [];
    Object.keys(submittedIndexes).forEach(name => {
      const field = submittedIndexes[name];
      if (existingIndexes[name] && field.__op !== 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} exists, cannot update.`);
      }
      if (!existingIndexes[name] && field.__op === 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} does not exist, cannot delete.`);
      }
      if (field.__op === 'Delete') {
        deletedIndexes.push(name);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!this.disableIndexFieldValidation && !Object.prototype.hasOwnProperty.call(fields, key)) {
            throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Field ${key} does not exist, cannot add index.`);
          }
        });
        existingIndexes[name] = field;
        insertedIndexes.push({
          key: field,
          name
        });
      }
    });
    await conn.tx('set-indexes-with-schema-format', async t => {
      try {
        if (insertedIndexes.length > 0) {
          await self.createIndexes(className, insertedIndexes, t);
        }
      } catch (e) {
        var _e$errors, _e$errors$;
        const columnDoesNotExistError = ((_e$errors = e.errors) === null || _e$errors === void 0 ? void 0 : (_e$errors$ = _e$errors[0]) === null || _e$errors$ === void 0 ? void 0 : _e$errors$.code) === '42703';
        if (columnDoesNotExistError && !this.disableIndexFieldValidation) {
          throw e;
        }
      }
      if (deletedIndexes.length > 0) {
        await self.dropIndexes(className, deletedIndexes, t);
      }
      await t.none('UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1', [className, 'schema', 'indexes', JSON.stringify(existingIndexes)]);
    });
    this._notifySchemaChange();
  }
  async createClass(className, schema, conn) {
    conn = conn || this._client;
    const parseSchema = await conn.tx('create-class', async t => {
      await this.createTable(className, schema, t);
      await t.none('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', {
        className,
        schema
      });
      await this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields, t);
      return toParseSchema(schema);
    }).catch(err => {
      if (err.code === PostgresUniqueIndexViolationError && err.detail.includes(className)) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, `Class ${className} already exists.`);
      }
      throw err;
    });
    this._notifySchemaChange();
    return parseSchema;
  }

  // Just create a table, do not insert in schema
  async createTable(className, schema, conn) {
    conn = conn || this._client;
    debug('createTable');
    const valuesArray = [];
    const patternsArray = [];
    const fields = Object.assign({}, schema.fields);
    if (className === '_User') {
      fields._email_verify_token_expires_at = {
        type: 'Date'
      };
      fields._email_verify_token = {
        type: 'String'
      };
      fields._account_lockout_expires_at = {
        type: 'Date'
      };
      fields._failed_login_count = {
        type: 'Number'
      };
      fields._perishable_token = {
        type: 'String'
      };
      fields._perishable_token_expires_at = {
        type: 'Date'
      };
      fields._password_changed_at = {
        type: 'Date'
      };
      fields._password_history = {
        type: 'Array'
      };
    }
    let index = 2;
    const relations = [];
    Object.keys(fields).forEach(fieldName => {
      const parseType = fields[fieldName];
      // Skip when it's a relation
      // We'll create the tables later
      if (parseType.type === 'Relation') {
        relations.push(fieldName);
        return;
      }
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        parseType.contents = {
          type: 'String'
        };
      }
      valuesArray.push(fieldName);
      valuesArray.push(parseTypeToPostgresType(parseType));
      patternsArray.push(`$${index}:name $${index + 1}:raw`);
      if (fieldName === 'objectId') {
        patternsArray.push(`PRIMARY KEY ($${index}:name)`);
      }
      index = index + 2;
    });
    const qs = `CREATE TABLE IF NOT EXISTS $1:name (${patternsArray.join()})`;
    const values = [className, ...valuesArray];
    return conn.task('create-table', async t => {
      try {
        await t.none(qs, values);
      } catch (error) {
        if (error.code !== PostgresDuplicateRelationError) {
          throw error;
        }
        // ELSE: Table already exists, must have been created by a different request. Ignore the error.
      }

      await t.tx('create-table-tx', tx => {
        return tx.batch(relations.map(fieldName => {
          return tx.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
            joinTable: `_Join:${fieldName}:${className}`
          });
        }));
      });
    });
  }
  async schemaUpgrade(className, schema, conn) {
    debug('schemaUpgrade');
    conn = conn || this._client;
    const self = this;
    await conn.task('schema-upgrade', async t => {
      const columns = await t.map('SELECT column_name FROM information_schema.columns WHERE table_name = $<className>', {
        className
      }, a => a.column_name);
      const newColumns = Object.keys(schema.fields).filter(item => columns.indexOf(item) === -1).map(fieldName => self.addFieldIfNotExists(className, fieldName, schema.fields[fieldName]));
      await t.batch(newColumns);
    });
  }
  async addFieldIfNotExists(className, fieldName, type) {
    // TODO: Must be revised for invalid logic...
    debug('addFieldIfNotExists');
    const self = this;
    await this._client.tx('add-field-if-not-exists', async t => {
      if (type.type !== 'Relation') {
        try {
          await t.none('ALTER TABLE $<className:name> ADD COLUMN IF NOT EXISTS $<fieldName:name> $<postgresType:raw>', {
            className,
            fieldName,
            postgresType: parseTypeToPostgresType(type)
          });
        } catch (error) {
          if (error.code === PostgresRelationDoesNotExistError) {
            return self.createClass(className, {
              fields: {
                [fieldName]: type
              }
            }, t);
          }
          if (error.code !== PostgresDuplicateColumnError) {
            throw error;
          }
          // Column already exists, created by other request. Carry on to see if it's the right type.
        }
      } else {
        await t.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
          joinTable: `_Join:${fieldName}:${className}`
        });
      }
      const result = await t.any('SELECT "schema" FROM "_SCHEMA" WHERE "className" = $<className> and ("schema"::json->\'fields\'->$<fieldName>) is not null', {
        className,
        fieldName
      });
      if (result[0]) {
        throw 'Attempted to add a field that already exists';
      } else {
        const path = `{fields,${fieldName}}`;
        await t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {
          path,
          type,
          className
        });
      }
    });
    this._notifySchemaChange();
  }
  async updateFieldOptions(className, fieldName, type) {
    await this._client.tx('update-schema-field-options', async t => {
      const path = `{fields,${fieldName}}`;
      await t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {
        path,
        type,
        className
      });
    });
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  async deleteClass(className) {
    const operations = [{
      query: `DROP TABLE IF EXISTS $1:name`,
      values: [className]
    }, {
      query: `DELETE FROM "_SCHEMA" WHERE "className" = $1`,
      values: [className]
    }];
    const response = await this._client.tx(t => t.none(this._pgp.helpers.concat(operations))).then(() => className.indexOf('_Join:') != 0); // resolves with false when _Join table

    this._notifySchemaChange();
    return response;
  }

  // Delete all data known to this adapter. Used for testing.
  async deleteAllClasses() {
    var _this$_client;
    const now = new Date().getTime();
    const helpers = this._pgp.helpers;
    debug('deleteAllClasses');
    if ((_this$_client = this._client) !== null && _this$_client !== void 0 && _this$_client.$pool.ended) {
      return;
    }
    await this._client.task('delete-all-classes', async t => {
      try {
        const results = await t.any('SELECT * FROM "_SCHEMA"');
        const joins = results.reduce((list, schema) => {
          return list.concat(joinTablesForSchema(schema.schema));
        }, []);
        const classes = ['_SCHEMA', '_PushStatus', '_JobStatus', '_JobSchedule', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_Audience', '_Idempotency', ...results.map(result => result.className), ...joins];
        const queries = classes.map(className => ({
          query: 'DROP TABLE IF EXISTS $<className:name>',
          values: {
            className
          }
        }));
        await t.tx(tx => tx.none(helpers.concat(queries)));
      } catch (error) {
        if (error.code !== PostgresRelationDoesNotExistError) {
          throw error;
        }
        // No _SCHEMA collection. Don't delete anything.
      }
    }).then(() => {
      debug(`deleteAllClasses done in ${new Date().getTime() - now}`);
    });
  }

  // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  async deleteFields(className, schema, fieldNames) {
    debug('deleteFields');
    fieldNames = fieldNames.reduce((list, fieldName) => {
      const field = schema.fields[fieldName];
      if (field.type !== 'Relation') {
        list.push(fieldName);
      }
      delete schema.fields[fieldName];
      return list;
    }, []);
    const values = [className, ...fieldNames];
    const columns = fieldNames.map((name, idx) => {
      return `$${idx + 2}:name`;
    }).join(', DROP COLUMN');
    await this._client.tx('delete-fields', async t => {
      await t.none('UPDATE "_SCHEMA" SET "schema" = $<schema> WHERE "className" = $<className>', {
        schema,
        className
      });
      if (values.length > 1) {
        await t.none(`ALTER TABLE $1:name DROP COLUMN IF EXISTS ${columns}`, values);
      }
    });
    this._notifySchemaChange();
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  async getAllClasses() {
    return this._client.task('get-all-classes', async t => {
      return await t.map('SELECT * FROM "_SCHEMA"', null, row => toParseSchema(_objectSpread({
        className: row.className
      }, row.schema)));
    });
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  async getClass(className) {
    debug('getClass');
    return this._client.any('SELECT * FROM "_SCHEMA" WHERE "className" = $<className>', {
      className
    }).then(result => {
      if (result.length !== 1) {
        throw undefined;
      }
      return result[0].schema;
    }).then(toParseSchema);
  }

  // TODO: remove the mongo format dependency in the return value
  async createObject(className, schema, object, transactionalSession) {
    debug('createObject');
    let columnsArray = [];
    const valuesArray = [];
    schema = toPostgresSchema(schema);
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
        // Avoid adding authData multiple times to the query
        if (authDataAlreadyExists) {
          return;
        }
      }
      columnsArray.push(fieldName);
      if (!schema.fields[fieldName] && className === '_User') {
        if (fieldName === '_email_verify_token' || fieldName === '_failed_login_count' || fieldName === '_perishable_token' || fieldName === '_password_history') {
          valuesArray.push(object[fieldName]);
        }
        if (fieldName === '_email_verify_token_expires_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }
        if (fieldName === '_account_lockout_expires_at' || fieldName === '_perishable_token_expires_at' || fieldName === '_password_changed_at') {
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
            valuesArray.push(object[fieldName]);
          } else {
            valuesArray.push(JSON.stringify(object[fieldName]));
          }
          break;
        case 'Object':
        case 'Bytes':
        case 'String':
        case 'Number':
        case 'Boolean':
          valuesArray.push(object[fieldName]);
          break;
        case 'File':
          valuesArray.push(object[fieldName].name);
          break;
        case 'Polygon':
          {
            const value = convertPolygonToSQL(object[fieldName].coordinates);
            valuesArray.push(value);
            break;
          }
        case 'GeoPoint':
          // pop the point and process later
          geoPoints[fieldName] = object[fieldName];
          columnsArray.pop();
          break;
        default:
          throw `Type ${schema.fields[fieldName].type} not supported yet`;
      }
    });
    columnsArray = columnsArray.concat(Object.keys(geoPoints));
    const initialValues = valuesArray.map((val, index) => {
      let termination = '';
      const fieldName = columnsArray[index];
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        termination = '::text[]';
      } else if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        termination = '::jsonb';
      }
      return `$${index + 2 + columnsArray.length}${termination}`;
    });
    const geoPointsInjects = Object.keys(geoPoints).map(key => {
      const value = geoPoints[key];
      valuesArray.push(value.longitude, value.latitude);
      const l = valuesArray.length + columnsArray.length;
      return `POINT($${l}, $${l + 1})`;
    });
    const columnsPattern = columnsArray.map((col, index) => `$${index + 2}:name`).join();
    const valuesPattern = initialValues.concat(geoPointsInjects).join();
    const qs = `INSERT INTO $1:name (${columnsPattern}) VALUES (${valuesPattern})`;
    const values = [className, ...columnsArray, ...valuesArray];
    const promise = (transactionalSession ? transactionalSession.t : this._client).none(qs, values).then(() => ({
      ops: [object]
    })).catch(error => {
      if (error.code === PostgresUniqueIndexViolationError) {
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;
        if (error.constraint) {
          const matches = error.constraint.match(/unique_([a-zA-Z]+)/);
          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
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

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  async deleteObjectsByQuery(className, schema, query, transactionalSession) {
    debug('deleteObjectsByQuery');
    const values = [className];
    const index = 2;
    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false
    });
    values.push(...where.values);
    if (Object.keys(query).length === 0) {
      where.pattern = 'TRUE';
    }
    const qs = `WITH deleted AS (DELETE FROM $1:name WHERE ${where.pattern} RETURNING *) SELECT count(*) FROM deleted`;
    const promise = (transactionalSession ? transactionalSession.t : this._client).one(qs, values, a => +a.count).then(count => {
      if (count === 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      } else {
        return count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      // ELSE: Don't delete anything if doesn't exist
    });

    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }
  // Return value not currently well specified.
  async findOneAndUpdate(className, schema, query, update, transactionalSession) {
    debug('findOneAndUpdate');
    return this.updateObjectsByQuery(className, schema, query, update, transactionalSession).then(val => val[0]);
  }

  // Apply the update to all objects that match the given Parse Query.
  async updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    debug('updateObjectsByQuery');
    const updatePatterns = [];
    const values = [className];
    let index = 2;
    schema = toPostgresSchema(schema);
    const originalUpdate = _objectSpread({}, update);

    // Set flag for dot notation fields
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
    // Resolve authData first,
    // So we don't end up with multiple key updates
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
      // Drop any undefined values.
      if (typeof fieldValue === 'undefined') {
        delete update[fieldName];
      } else if (fieldValue === null) {
        updatePatterns.push(`$${index}:name = NULL`);
        values.push(fieldName);
        index += 1;
      } else if (fieldName == 'authData') {
        // This recursively sets the json_object
        // Only 1 level deep
        const generate = (jsonb, key, value) => {
          return `json_object_set_key(COALESCE(${jsonb}, '{}'::jsonb), ${key}, ${value})::jsonb`;
        };
        const lastKey = `$${index}:name`;
        const fieldNameIndex = index;
        index += 1;
        values.push(fieldName);
        const update = Object.keys(fieldValue).reduce((lastKey, key) => {
          const str = generate(lastKey, `$${index}::text`, `$${index + 1}::jsonb`);
          index += 2;
          let value = fieldValue[key];
          if (value) {
            if (value.__op === 'Delete') {
              value = null;
            } else {
              value = JSON.stringify(value);
            }
          }
          values.push(key, value);
          return str;
        }, lastKey);
        updatePatterns.push(`$${fieldNameIndex}:name = ${update}`);
      } else if (fieldValue.__op === 'Increment') {
        updatePatterns.push(`$${index}:name = COALESCE($${index}:name, 0) + $${index + 1}`);
        values.push(fieldName, fieldValue.amount);
        index += 2;
      } else if (fieldValue.__op === 'Add') {
        updatePatterns.push(`$${index}:name = array_add(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'Delete') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, null);
        index += 2;
      } else if (fieldValue.__op === 'Remove') {
        updatePatterns.push(`$${index}:name = array_remove(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'AddUnique') {
        updatePatterns.push(`$${index}:name = array_add_unique(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldName === 'updatedAt') {
        //TODO: stop special casing this. It should check for __type === 'Date' and use .iso
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'string') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'boolean') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'Pointer') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      } else if (fieldValue.__type === 'Date') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue instanceof Date) {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'File') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue.__type === 'GeoPoint') {
        updatePatterns.push(`$${index}:name = POINT($${index + 1}, $${index + 2})`);
        values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
        index += 3;
      } else if (fieldValue.__type === 'Polygon') {
        const value = convertPolygonToSQL(fieldValue.coordinates);
        updatePatterns.push(`$${index}:name = $${index + 1}::polygon`);
        values.push(fieldName, value);
        index += 2;
      } else if (fieldValue.__type === 'Relation') {
        // noop
      } else if (typeof fieldValue === 'number') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'object' && schema.fields[fieldName] && schema.fields[fieldName].type === 'Object') {
        // Gather keys to increment
        const keysToIncrement = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set
          // Note that Object.keys is iterating over the **original** update object
          // and that some of the keys of the original update could be null or undefined:
          // (See the above check `if (fieldValue === null || typeof fieldValue == "undefined")`)
          const value = originalUpdate[k];
          return value && value.__op === 'Increment' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        let incrementPatterns = '';
        if (keysToIncrement.length > 0) {
          incrementPatterns = ' || ' + keysToIncrement.map(c => {
            const amount = fieldValue[c].amount;
            return `CONCAT('{"${c}":', COALESCE($${index}:name->>'${c}','0')::int + ${amount}, '}')::jsonb`;
          }).join(' || ');
          // Strip the keys
          keysToIncrement.forEach(key => {
            delete fieldValue[key];
          });
        }
        const keysToDelete = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set.
          const value = originalUpdate[k];
          return value && value.__op === 'Delete' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        const deletePatterns = keysToDelete.reduce((p, c, i) => {
          return p + ` - '$${index + 1 + i}:value'`;
        }, '');
        // Override Object
        let updateObject = "'{}'::jsonb";
        if (dotNotationOptions[fieldName]) {
          // Merge Object
          updateObject = `COALESCE($${index}:name, '{}'::jsonb)`;
        }
        updatePatterns.push(`$${index}:name = (${updateObject} ${deletePatterns} ${incrementPatterns} || $${index + 1 + keysToDelete.length}::jsonb )`);
        values.push(fieldName, ...keysToDelete, JSON.stringify(fieldValue));
        index += 2 + keysToDelete.length;
      } else if (Array.isArray(fieldValue) && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        const expectedType = parseTypeToPostgresType(schema.fields[fieldName]);
        if (expectedType === 'text[]') {
          updatePatterns.push(`$${index}:name = $${index + 1}::text[]`);
          values.push(fieldName, fieldValue);
          index += 2;
        } else {
          updatePatterns.push(`$${index}:name = $${index + 1}::jsonb`);
          values.push(fieldName, JSON.stringify(fieldValue));
          index += 2;
        }
      } else {
        debug('Not supported update', {
          fieldName,
          fieldValue
        });
        return Promise.reject(new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support update ${JSON.stringify(fieldValue)} yet`));
      }
    }
    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false
    });
    values.push(...where.values);
    const whereClause = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const qs = `UPDATE $1:name SET ${updatePatterns.join()} ${whereClause} RETURNING *`;
    const promise = (transactionalSession ? transactionalSession.t : this._client).any(qs, values);
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  // Hopefully, we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update, transactionalSession) {
    debug('upsertOneObject');
    const createValue = Object.assign({}, query, update);
    return this.createObject(className, schema, createValue, transactionalSession).catch(error => {
      // ignore duplicate value errors as it's upsert
      if (error.code !== _node.default.Error.DUPLICATE_VALUE) {
        throw error;
      }
      return this.findOneAndUpdate(className, schema, query, update, transactionalSession);
    });
  }
  find(className, schema, query, {
    skip,
    limit,
    sort,
    keys,
    caseInsensitive,
    explain
  }) {
    debug('find');
    const hasLimit = limit !== undefined;
    const hasSkip = skip !== undefined;
    let values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const limitPattern = hasLimit ? `LIMIT $${values.length + 1}` : '';
    if (hasLimit) {
      values.push(limit);
    }
    const skipPattern = hasSkip ? `OFFSET $${values.length + 1}` : '';
    if (hasSkip) {
      values.push(skip);
    }
    let sortPattern = '';
    if (sort) {
      const sortCopy = sort;
      const sorting = Object.keys(sort).map(key => {
        const transformKey = transformDotFieldToComponents(key).join('->');
        // Using $idx pattern gives:  non-integer constant in ORDER BY
        if (sortCopy[key] === 1) {
          return `${transformKey} ASC`;
        }
        return `${transformKey} DESC`;
      }).join();
      sortPattern = sort !== undefined && Object.keys(sort).length > 0 ? `ORDER BY ${sorting}` : '';
    }
    if (where.sorts && Object.keys(where.sorts).length > 0) {
      sortPattern = `ORDER BY ${where.sorts.join()}`;
    }
    let columns = '*';
    if (keys) {
      // Exclude empty keys
      // Replace ACL by it's keys
      keys = keys.reduce((memo, key) => {
        if (key === 'ACL') {
          memo.push('_rperm');
          memo.push('_wperm');
        } else if (key.length > 0 && (
        // Remove selected field not referenced in the schema
        // Relation is not a column in postgres
        // $score is a Parse special field and is also not a column
        schema.fields[key] && schema.fields[key].type !== 'Relation' || key === '$score')) {
          memo.push(key);
        }
        return memo;
      }, []);
      columns = keys.map((key, index) => {
        if (key === '$score') {
          return `ts_rank_cd(to_tsvector($${2}, $${3}:name), to_tsquery($${4}, $${5}), 32) as score`;
        }
        return `$${index + values.length + 1}:name`;
      }).join();
      values = values.concat(keys);
    }
    const originalQuery = `SELECT ${columns} FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client.any(qs, values).catch(error => {
      // Query on non existing table, don't crash
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      return [];
    }).then(results => {
      if (explain) {
        return results;
      }
      return results.map(object => this.postgresObjectToParseObject(className, object, schema));
    });
  }

  // Converts from a postgres-format object to a REST-format object.
  // Does not strip out anything based on a lack of authentication.
  postgresObjectToParseObject(className, object, schema) {
    Object.keys(schema.fields).forEach(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer' && object[fieldName]) {
        object[fieldName] = {
          objectId: object[fieldName],
          __type: 'Pointer',
          className: schema.fields[fieldName].targetClass
        };
      }
      if (schema.fields[fieldName].type === 'Relation') {
        object[fieldName] = {
          __type: 'Relation',
          className: schema.fields[fieldName].targetClass
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'GeoPoint') {
        object[fieldName] = {
          __type: 'GeoPoint',
          latitude: object[fieldName].y,
          longitude: object[fieldName].x
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'Polygon') {
        let coords = new String(object[fieldName]);
        coords = coords.substring(2, coords.length - 2).split('),(');
        const updatedCoords = coords.map(point => {
          return [parseFloat(point.split(',')[1]), parseFloat(point.split(',')[0])];
        });
        object[fieldName] = {
          __type: 'Polygon',
          coordinates: updatedCoords
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'File') {
        object[fieldName] = {
          __type: 'File',
          name: object[fieldName]
        };
      }
    });
    //TODO: remove this reliance on the mongo format. DB adapter shouldn't know there is a difference between created at and any other date field.
    if (object.createdAt) {
      object.createdAt = object.createdAt.toISOString();
    }
    if (object.updatedAt) {
      object.updatedAt = object.updatedAt.toISOString();
    }
    if (object.expiresAt) {
      object.expiresAt = {
        __type: 'Date',
        iso: object.expiresAt.toISOString()
      };
    }
    if (object._email_verify_token_expires_at) {
      object._email_verify_token_expires_at = {
        __type: 'Date',
        iso: object._email_verify_token_expires_at.toISOString()
      };
    }
    if (object._account_lockout_expires_at) {
      object._account_lockout_expires_at = {
        __type: 'Date',
        iso: object._account_lockout_expires_at.toISOString()
      };
    }
    if (object._perishable_token_expires_at) {
      object._perishable_token_expires_at = {
        __type: 'Date',
        iso: object._perishable_token_expires_at.toISOString()
      };
    }
    if (object._password_changed_at) {
      object._password_changed_at = {
        __type: 'Date',
        iso: object._password_changed_at.toISOString()
      };
    }
    for (const fieldName in object) {
      if (object[fieldName] === null) {
        delete object[fieldName];
      }
      if (object[fieldName] instanceof Date) {
        object[fieldName] = {
          __type: 'Date',
          iso: object[fieldName].toISOString()
        };
      }
    }
    return object;
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  async ensureUniqueness(className, schema, fieldNames) {
    const constraintName = `${className}_unique_${fieldNames.sort().join('_')}`;
    const constraintPatterns = fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE UNIQUE INDEX IF NOT EXISTS $2:name ON $1:name(${constraintPatterns.join()})`;
    return this._client.none(qs, [className, constraintName, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(constraintName)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(constraintName)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  }

  // Executes a count.
  async count(className, schema, query, readPreference, estimate = true) {
    debug('count');
    const values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    let qs = '';
    if (where.pattern.length > 0 || !estimate) {
      qs = `SELECT count(*) FROM $1:name ${wherePattern}`;
    } else {
      qs = 'SELECT reltuples AS approximate_row_count FROM pg_class WHERE relname = $1';
    }
    return this._client.one(qs, values, a => {
      if (a.approximate_row_count == null || a.approximate_row_count == -1) {
        return !isNaN(+a.count) ? +a.count : 0;
      } else {
        return +a.approximate_row_count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      return 0;
    });
  }
  async distinct(className, schema, query, fieldName) {
    debug('distinct');
    let field = fieldName;
    let column = fieldName;
    const isNested = fieldName.indexOf('.') >= 0;
    if (isNested) {
      field = transformDotFieldToComponents(fieldName).join('->');
      column = fieldName.split('.')[0];
    }
    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const isPointerField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const values = [field, column, className];
    const where = buildWhereClause({
      schema,
      query,
      index: 4,
      caseInsensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const transformer = isArrayField ? 'jsonb_array_elements' : 'ON';
    let qs = `SELECT DISTINCT ${transformer}($1:name) $2:name FROM $3:name ${wherePattern}`;
    if (isNested) {
      qs = `SELECT DISTINCT ${transformer}($1:raw) $2:raw FROM $3:name ${wherePattern}`;
    }
    return this._client.any(qs, values).catch(error => {
      if (error.code === PostgresMissingColumnError) {
        return [];
      }
      throw error;
    }).then(results => {
      if (!isNested) {
        results = results.filter(object => object[field] !== null);
        return results.map(object => {
          if (!isPointerField) {
            return object[field];
          }
          return {
            __type: 'Pointer',
            className: schema.fields[fieldName].targetClass,
            objectId: object[field]
          };
        });
      }
      const child = fieldName.split('.')[1];
      return results.map(object => object[column][child]);
    }).then(results => results.map(object => this.postgresObjectToParseObject(className, object, schema)));
  }
  async aggregate(className, schema, pipeline, readPreference, hint, explain) {
    debug('aggregate');
    const values = [className];
    let index = 2;
    let columns = [];
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
                if (mongoAggregateToPostgres[operation]) {
                  if (!groupByFields.includes(`"${source}"`)) {
                    groupByFields.push(`"${source}"`);
                  }
                  columns.push(`EXTRACT(${mongoAggregateToPostgres[operation]} FROM $${index}:name AT TIME ZONE 'UTC')::integer AS $${index + 1}:name`);
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
        const orOrAnd = Object.prototype.hasOwnProperty.call(stage.$match, '$or') ? ' OR ' : ' AND ';
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
          Object.keys(ParseToPosgresComparator).forEach(cmp => {
            if (value[cmp]) {
              const pgComparator = ParseToPosgresComparator[cmp];
              matchPatterns.push(`$${index}:name ${pgComparator} $${index + 1}`);
              values.push(field, toPostgresValue(value[cmp]));
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
        limitPattern = `LIMIT $${index}`;
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
        const sorting = keys.map(key => {
          const transformer = sort[key] === 1 ? 'ASC' : 'DESC';
          const order = `$${index}:name ${transformer}`;
          index += 1;
          return order;
        }).join();
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
    const originalQuery = `SELECT ${columns.filter(Boolean).join()} FROM $1:name ${wherePattern} ${skipPattern} ${groupPattern} ${sortPattern} ${limitPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client.any(qs, values).then(a => {
      if (explain) {
        return a;
      }
      const results = a.map(object => this.postgresObjectToParseObject(className, object, schema));
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
  async performInitialization({
    VolatileClassesSchemas
  }) {
    // TODO: This method needs to be rewritten to make proper use of connections (@vitaly-t)
    debug('performInitialization');
    await this._ensureSchemaCollectionExists();
    const promises = VolatileClassesSchemas.map(schema => {
      return this.createTable(schema.className, schema).catch(err => {
        if (err.code === PostgresDuplicateRelationError || err.code === _node.default.Error.INVALID_CLASS_NAME) {
          return Promise.resolve();
        }
        throw err;
      }).then(() => this.schemaUpgrade(schema.className, schema));
    });
    promises.push(this._listenToSchema());
    return Promise.all(promises).then(() => {
      return this._client.tx('perform-initialization', async t => {
        await t.none(_sql.default.misc.jsonObjectSetKeys);
        await t.none(_sql.default.array.add);
        await t.none(_sql.default.array.addUnique);
        await t.none(_sql.default.array.remove);
        await t.none(_sql.default.array.containsAll);
        await t.none(_sql.default.array.containsAllRegex);
        await t.none(_sql.default.array.contains);
        return t.ctx;
      });
    }).then(ctx => {
      debug(`initializationDone in ${ctx.duration}`);
    }).catch(error => {
      /* eslint-disable no-console */
      console.error(error);
    });
  }
  async createIndexes(className, indexes, conn) {
    return (conn || this._client).tx(t => t.batch(indexes.map(i => {
      return t.none('CREATE INDEX IF NOT EXISTS $1:name ON $2:name ($3:name)', [i.name, className, i.key]);
    })));
  }
  async createIndexesIfNeeded(className, fieldName, type, conn) {
    await (conn || this._client).none('CREATE INDEX IF NOT EXISTS $1:name ON $2:name ($3:name)', [fieldName, className, type]);
  }
  async dropIndexes(className, indexes, conn) {
    const queries = indexes.map(i => ({
      query: 'DROP INDEX $1:name',
      values: i
    }));
    await (conn || this._client).tx(t => t.none(this._pgp.helpers.concat(queries)));
  }
  async getIndexes(className) {
    const qs = 'SELECT * FROM pg_indexes WHERE tablename = ${className}';
    return this._client.any(qs, {
      className
    });
  }
  async updateSchemaWithIndexes() {
    return Promise.resolve();
  }

  // Used for testing purposes
  async updateEstimatedCount(className) {
    return this._client.none('ANALYZE $1:name', [className]);
  }
  async createTransactionalSession() {
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
  commitTransactionalSession(transactionalSession) {
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return transactionalSession.result;
  }
  abortTransactionalSession(transactionalSession) {
    const result = transactionalSession.result.catch();
    transactionalSession.batch.push(Promise.reject());
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return result;
  }
  async ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const defaultIndexName = `parse_default_${fieldNames.sort().join('_')}`;
    const indexNameOptions = indexName != null ? {
      name: indexName
    } : {
      name: defaultIndexName
    };
    const constraintPatterns = caseInsensitive ? fieldNames.map((fieldName, index) => `lower($${index + 3}:name) varchar_pattern_ops`) : fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE INDEX IF NOT EXISTS $1:name ON $2:name (${constraintPatterns.join()})`;
    const setIdempotencyFunction = options.setIdempotencyFunction !== undefined ? options.setIdempotencyFunction : false;
    if (setIdempotencyFunction) {
      await this.ensureIdempotencyFunctionExists(options);
    }
    await conn.none(qs, [indexNameOptions.name, className, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(indexNameOptions.name)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(indexNameOptions.name)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  }
  async deleteIdempotencyFunction(options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const qs = 'DROP FUNCTION IF EXISTS idempotency_delete_expired_records()';
    return conn.none(qs).catch(error => {
      throw error;
    });
  }
  async ensureIdempotencyFunctionExists(options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const ttlOptions = options.ttl !== undefined ? `${options.ttl} seconds` : '60 seconds';
    const qs = 'CREATE OR REPLACE FUNCTION idempotency_delete_expired_records() RETURNS void LANGUAGE plpgsql AS $$ BEGIN DELETE FROM "_Idempotency" WHERE expire < NOW() - INTERVAL $1; END; $$;';
    return conn.none(qs, [ttlOptions]).catch(error => {
      throw error;
    });
  }
}
exports.PostgresStorageAdapter = PostgresStorageAdapter;
function convertPolygonToSQL(polygon) {
  if (polygon.length < 3) {
    throw new _node.default.Error(_node.default.Error.INVALID_JSON, `Polygon must have at least 3 values`);
  }
  if (polygon[0][0] !== polygon[polygon.length - 1][0] || polygon[0][1] !== polygon[polygon.length - 1][1]) {
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
    throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'GeoJSON: Loop must have at least 3 different vertices');
  }
  const points = polygon.map(point => {
    _node.default.GeoPoint._validate(parseFloat(point[1]), parseFloat(point[0]));
    return `(${point[1]}, ${point[0]})`;
  }).join(', ');
  return `(${points})`;
}
function removeWhiteSpace(regex) {
  if (!regex.endsWith('\n')) {
    regex += '\n';
  }

  // remove non escaped comments
  return regex.replace(/([^\\])#.*\n/gim, '$1')
  // remove lines starting with a comment
  .replace(/^#.*\n/gim, '')
  // remove non escaped whitespace
  .replace(/([^\\])\s+/gim, '$1')
  // remove whitespace at the beginning of a line
  .replace(/^\s+/, '').trim();
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
function createLiteralRegex(remaining) {
  return remaining.split('').map(c => {
    const regex = RegExp('[0-9 ]|\\p{L}', 'u'); // Support all unicode letter chars
    if (c.match(regex) !== null) {
      // don't escape alphanumeric characters
      return c;
    }
    // escape everything else (single quotes with single quotes, everything else with a backslash)
    return c === `'` ? `''` : `\\${c}`;
  }).join('');
}
function literalizeRegexPart(s) {
  const matcher1 = /\\Q((?!\\E).*)\\E$/;
  const result1 = s.match(matcher1);
  if (result1 && result1.length > 1 && result1.index > -1) {
    // process regex that has a beginning and an end specified for the literal text
    const prefix = s.substring(0, result1.index);
    const remaining = result1[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // process regex that has a beginning specified for the literal text
  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2 = s.match(matcher2);
  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substring(0, result2.index);
    const remaining = result2[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // remove all instances of \Q and \E from the remaining text & escape single quotes
  return s.replace(/([^\\])(\\E)/, '$1').replace(/([^\\])(\\Q)/, '$1').replace(/^\\E/, '').replace(/^\\Q/, '').replace(/([^'])'/, `$1''`).replace(/^'([^'])/, `''$1`);
}
var GeoPointCoder = {
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }
};
var _default = PostgresStorageAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJVdGlscyIsInJlcXVpcmUiLCJQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IiLCJQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IiLCJQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yIiwiUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IiLCJQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IiLCJsb2dnZXIiLCJkZWJ1ZyIsImFyZ3MiLCJhcmd1bWVudHMiLCJjb25jYXQiLCJzbGljZSIsImxlbmd0aCIsImxvZyIsImdldExvZ2dlciIsImFwcGx5IiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwidmFsdWUiLCJfX3R5cGUiLCJpc28iLCJuYW1lIiwidG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUiLCJwb3N0Z3Jlc1ZhbHVlIiwiY2FzdFR5cGUiLCJ1bmRlZmluZWQiLCJ0cmFuc2Zvcm1WYWx1ZSIsIm9iamVjdElkIiwiZW1wdHlDTFBTIiwiT2JqZWN0IiwiZnJlZXplIiwiZmluZCIsImdldCIsImNvdW50IiwiY3JlYXRlIiwidXBkYXRlIiwiZGVsZXRlIiwiYWRkRmllbGQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJkZWZhdWx0Q0xQUyIsInRvUGFyc2VTY2hlbWEiLCJzY2hlbWEiLCJjbGFzc05hbWUiLCJmaWVsZHMiLCJfaGFzaGVkX3Bhc3N3b3JkIiwiX3dwZXJtIiwiX3JwZXJtIiwiY2xwcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImluZGV4ZXMiLCJ0b1Bvc3RncmVzU2NoZW1hIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJoYW5kbGVEb3RGaWVsZHMiLCJvYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImZpZWxkTmFtZSIsImluZGV4T2YiLCJjb21wb25lbnRzIiwic3BsaXQiLCJmaXJzdCIsInNoaWZ0IiwiY3VycmVudE9iaiIsIm5leHQiLCJfX29wIiwidHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMiLCJtYXAiLCJjbXB0IiwiaW5kZXgiLCJ0cmFuc2Zvcm1Eb3RGaWVsZCIsImpvaW4iLCJ0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCIsInN1YnN0cmluZyIsInZhbGlkYXRlS2V5cyIsImtleSIsImluY2x1ZGVzIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfTkVTVEVEX0tFWSIsImpvaW5UYWJsZXNGb3JTY2hlbWEiLCJsaXN0IiwiZmllbGQiLCJwdXNoIiwiYnVpbGRXaGVyZUNsYXVzZSIsInF1ZXJ5IiwiY2FzZUluc2Vuc2l0aXZlIiwicGF0dGVybnMiLCJ2YWx1ZXMiLCJzb3J0cyIsImlzQXJyYXlGaWVsZCIsImluaXRpYWxQYXR0ZXJuc0xlbmd0aCIsImZpZWxkVmFsdWUiLCIkZXhpc3RzIiwiYXV0aERhdGFNYXRjaCIsIm1hdGNoIiwiJGluIiwiJHJlZ2V4IiwiTUFYX0lOVF9QTFVTX09ORSIsImNsYXVzZXMiLCJjbGF1c2VWYWx1ZXMiLCJzdWJRdWVyeSIsImNsYXVzZSIsInBhdHRlcm4iLCJvck9yQW5kIiwibm90IiwiJG5lIiwiY29uc3RyYWludEZpZWxkTmFtZSIsIiRyZWxhdGl2ZVRpbWUiLCJJTlZBTElEX0pTT04iLCJwb2ludCIsImxvbmdpdHVkZSIsImxhdGl0dWRlIiwiJGVxIiwiaXNJbk9yTmluIiwiQXJyYXkiLCJpc0FycmF5IiwiJG5pbiIsImluUGF0dGVybnMiLCJhbGxvd051bGwiLCJsaXN0RWxlbSIsImxpc3RJbmRleCIsImNyZWF0ZUNvbnN0cmFpbnQiLCJiYXNlQXJyYXkiLCJub3RJbiIsIl8iLCJmbGF0TWFwIiwiZWx0IiwiJGFsbCIsImlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgiLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwiaSIsInByb2Nlc3NSZWdleFBhdHRlcm4iLCIkY29udGFpbmVkQnkiLCJhcnIiLCIkdGV4dCIsInNlYXJjaCIsIiRzZWFyY2giLCJsYW5ndWFnZSIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwiJG5lYXJTcGhlcmUiLCJkaXN0YW5jZSIsIiRtYXhEaXN0YW5jZSIsImRpc3RhbmNlSW5LTSIsIiR3aXRoaW4iLCIkYm94IiwiYm94IiwibGVmdCIsImJvdHRvbSIsInJpZ2h0IiwidG9wIiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJjZW50ZXJTcGhlcmUiLCJHZW9Qb2ludCIsIkdlb1BvaW50Q29kZXIiLCJpc1ZhbGlkSlNPTiIsIl92YWxpZGF0ZSIsImlzTmFOIiwiJHBvbHlnb24iLCJwb2x5Z29uIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCIkZ2VvSW50ZXJzZWN0cyIsIiRwb2ludCIsInJlZ2V4Iiwib3BlcmF0b3IiLCJvcHRzIiwiJG9wdGlvbnMiLCJyZW1vdmVXaGl0ZVNwYWNlIiwiY29udmVydFBvbHlnb25Ub1NRTCIsImNtcCIsInBnQ29tcGFyYXRvciIsInBhcnNlclJlc3VsdCIsInJlbGF0aXZlVGltZVRvRGF0ZSIsInN0YXR1cyIsInJlc3VsdCIsImNvbnNvbGUiLCJlcnJvciIsImluZm8iLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIm9wdGlvbnMiLCJfY29sbGVjdGlvblByZWZpeCIsImVuYWJsZVNjaGVtYUhvb2tzIiwic2NoZW1hQ2FjaGVUdGwiLCJkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24iLCJjbGllbnQiLCJwZ3AiLCJjcmVhdGVDbGllbnQiLCJfY2xpZW50IiwiX29uY2hhbmdlIiwiX3BncCIsIl91dWlkIiwidXVpZHY0IiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIndhdGNoIiwiY2FsbGJhY2siLCJjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5IiwiYW5hbHl6ZSIsImhhbmRsZVNodXRkb3duIiwiX3N0cmVhbSIsImRvbmUiLCIkcG9vbCIsImVuZCIsIl9saXN0ZW5Ub1NjaGVtYSIsImNvbm5lY3QiLCJkaXJlY3QiLCJvbiIsImRhdGEiLCJwYXlsb2FkIiwicGFyc2UiLCJzZW5kZXJJZCIsIm5vbmUiLCJfbm90aWZ5U2NoZW1hQ2hhbmdlIiwiY2F0Y2giLCJfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyIsImNvbm4iLCJjbGFzc0V4aXN0cyIsIm9uZSIsImEiLCJleGlzdHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwidGFzayIsInQiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJzZWxmIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfaWRfIiwiX2lkIiwiZGVsZXRlZEluZGV4ZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJJTlZBTElEX1FVRVJZIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidHgiLCJjcmVhdGVJbmRleGVzIiwiZSIsImNvbHVtbkRvZXNOb3RFeGlzdEVycm9yIiwiZXJyb3JzIiwiY29kZSIsImRyb3BJbmRleGVzIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsImNyZWF0ZVRhYmxlIiwiZXJyIiwiZGV0YWlsIiwiRFVQTElDQVRFX1ZBTFVFIiwidmFsdWVzQXJyYXkiLCJwYXR0ZXJuc0FycmF5IiwiYXNzaWduIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsInJlbGF0aW9ucyIsInBhcnNlVHlwZSIsInFzIiwiYmF0Y2giLCJqb2luVGFibGUiLCJzY2hlbWFVcGdyYWRlIiwiY29sdW1ucyIsImNvbHVtbl9uYW1lIiwibmV3Q29sdW1ucyIsImZpbHRlciIsIml0ZW0iLCJhZGRGaWVsZElmTm90RXhpc3RzIiwicG9zdGdyZXNUeXBlIiwiYW55IiwicGF0aCIsInVwZGF0ZUZpZWxkT3B0aW9ucyIsImRlbGV0ZUNsYXNzIiwib3BlcmF0aW9ucyIsInJlc3BvbnNlIiwiaGVscGVycyIsInRoZW4iLCJkZWxldGVBbGxDbGFzc2VzIiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJlbmRlZCIsInJlc3VsdHMiLCJqb2lucyIsInJlZHVjZSIsImNsYXNzZXMiLCJxdWVyaWVzIiwiZGVsZXRlRmllbGRzIiwiZmllbGROYW1lcyIsImlkeCIsImdldEFsbENsYXNzZXMiLCJyb3ciLCJnZXRDbGFzcyIsImNyZWF0ZU9iamVjdCIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29sdW1uc0FycmF5IiwiZ2VvUG9pbnRzIiwiYXV0aERhdGFBbHJlYWR5RXhpc3RzIiwiYXV0aERhdGEiLCJwcm92aWRlciIsInBvcCIsImluaXRpYWxWYWx1ZXMiLCJ2YWwiLCJ0ZXJtaW5hdGlvbiIsImdlb1BvaW50c0luamVjdHMiLCJsIiwiY29sdW1uc1BhdHRlcm4iLCJjb2wiLCJ2YWx1ZXNQYXR0ZXJuIiwicHJvbWlzZSIsIm9wcyIsInVuZGVybHlpbmdFcnJvciIsImNvbnN0cmFpbnQiLCJtYXRjaGVzIiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ3aGVyZSIsIk9CSkVDVF9OT1RfRk9VTkQiLCJmaW5kT25lQW5kVXBkYXRlIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGVQYXR0ZXJucyIsIm9yaWdpbmFsVXBkYXRlIiwiZG90Tm90YXRpb25PcHRpb25zIiwiZ2VuZXJhdGUiLCJqc29uYiIsImxhc3RLZXkiLCJmaWVsZE5hbWVJbmRleCIsInN0ciIsImFtb3VudCIsIm9iamVjdHMiLCJrZXlzVG9JbmNyZW1lbnQiLCJrIiwiaW5jcmVtZW50UGF0dGVybnMiLCJjIiwia2V5c1RvRGVsZXRlIiwiZGVsZXRlUGF0dGVybnMiLCJwIiwidXBkYXRlT2JqZWN0IiwiZXhwZWN0ZWRUeXBlIiwicmVqZWN0Iiwid2hlcmVDbGF1c2UiLCJ1cHNlcnRPbmVPYmplY3QiLCJjcmVhdGVWYWx1ZSIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJleHBsYWluIiwiaGFzTGltaXQiLCJoYXNTa2lwIiwid2hlcmVQYXR0ZXJuIiwibGltaXRQYXR0ZXJuIiwic2tpcFBhdHRlcm4iLCJzb3J0UGF0dGVybiIsInNvcnRDb3B5Iiwic29ydGluZyIsInRyYW5zZm9ybUtleSIsIm1lbW8iLCJvcmlnaW5hbFF1ZXJ5IiwicG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0IiwidGFyZ2V0Q2xhc3MiLCJ5IiwieCIsImNvb3JkcyIsIlN0cmluZyIsInVwZGF0ZWRDb29yZHMiLCJwYXJzZUZsb2F0IiwiY3JlYXRlZEF0IiwidG9JU09TdHJpbmciLCJ1cGRhdGVkQXQiLCJleHBpcmVzQXQiLCJlbnN1cmVVbmlxdWVuZXNzIiwiY29uc3RyYWludE5hbWUiLCJjb25zdHJhaW50UGF0dGVybnMiLCJtZXNzYWdlIiwicmVhZFByZWZlcmVuY2UiLCJlc3RpbWF0ZSIsImFwcHJveGltYXRlX3Jvd19jb3VudCIsImRpc3RpbmN0IiwiY29sdW1uIiwiaXNOZXN0ZWQiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybWVyIiwiY2hpbGQiLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsImhpbnQiLCJjb3VudEZpZWxkIiwiZ3JvdXBWYWx1ZXMiLCJncm91cFBhdHRlcm4iLCJzdGFnZSIsIiRncm91cCIsImdyb3VwQnlGaWVsZHMiLCJhbGlhcyIsInNvdXJjZSIsIm9wZXJhdGlvbiIsIiRzdW0iLCIkbWF4IiwiJG1pbiIsIiRhdmciLCIkcHJvamVjdCIsIiRtYXRjaCIsIiRvciIsImNvbGxhcHNlIiwiZWxlbWVudCIsIm1hdGNoUGF0dGVybnMiLCIkbGltaXQiLCIkc2tpcCIsIiRzb3J0Iiwib3JkZXIiLCJ0cmltIiwiQm9vbGVhbiIsInBhcnNlSW50IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInByb21pc2VzIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiYWxsIiwic3FsIiwibWlzYyIsImpzb25PYmplY3RTZXRLZXlzIiwiYXJyYXkiLCJhZGQiLCJhZGRVbmlxdWUiLCJyZW1vdmUiLCJjb250YWluc0FsbCIsImNvbnRhaW5zQWxsUmVnZXgiLCJjb250YWlucyIsImN0eCIsImR1cmF0aW9uIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZ2V0SW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwidXBkYXRlRXN0aW1hdGVkQ291bnQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiZGVmYXVsdEluZGV4TmFtZSIsImluZGV4TmFtZU9wdGlvbnMiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwiZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyIsImRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24iLCJ0dGxPcHRpb25zIiwidHRsIiwidW5pcXVlIiwiYXIiLCJmb3VuZEluZGV4IiwicHQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlbmRzV2l0aCIsInJlcGxhY2UiLCJzIiwic3RhcnRzV2l0aCIsImxpdGVyYWxpemVSZWdleFBhcnQiLCJpc1N0YXJ0c1dpdGhSZWdleCIsImZpcnN0VmFsdWVzSXNSZWdleCIsInNvbWUiLCJjcmVhdGVMaXRlcmFsUmVnZXgiLCJyZW1haW5pbmciLCJSZWdFeHAiLCJtYXRjaGVyMSIsInJlc3VsdDEiLCJwcmVmaXgiLCJtYXRjaGVyMiIsInJlc3VsdDIiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICcuL1Bvc3RncmVzQ2xpZW50Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCBzcWwgZnJvbSAnLi9zcWwnO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi8uLi8uLi9VdGlscycpO1xuXG5jb25zdCBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IgPSAnNDJQMDEnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yID0gJzQyUDA3JztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IgPSAnNDI3MDEnO1xuY29uc3QgUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IgPSAnNDI3MDMnO1xuY29uc3QgUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yID0gJzIzNTA1JztcbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uLy4uLy4uL2xvZ2dlcicpO1xuXG5jb25zdCBkZWJ1ZyA9IGZ1bmN0aW9uICguLi5hcmdzOiBhbnkpIHtcbiAgYXJncyA9IFsnUEc6ICcgKyBhcmd1bWVudHNbMF1dLmNvbmNhdChhcmdzLnNsaWNlKDEsIGFyZ3MubGVuZ3RoKSk7XG4gIGNvbnN0IGxvZyA9IGxvZ2dlci5nZXRMb2dnZXIoKTtcbiAgbG9nLmRlYnVnLmFwcGx5KGxvZywgYXJncyk7XG59O1xuXG5jb25zdCBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSA9IHR5cGUgPT4ge1xuICBzd2l0Y2ggKHR5cGUudHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ3BvaW50JztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgaWYgKHR5cGUuY29udGVudHMgJiYgdHlwZS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJykge1xuICAgICAgICByZXR1cm4gJ3RleHRbXSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ2pzb25iJztcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgYG5vIHR5cGUgZm9yICR7SlNPTi5zdHJpbmdpZnkodHlwZSl9IHlldGA7XG4gIH1cbn07XG5cbmNvbnN0IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciA9IHtcbiAgJGd0OiAnPicsXG4gICRsdDogJzwnLFxuICAkZ3RlOiAnPj0nLFxuICAkbHRlOiAnPD0nLFxufTtcblxuY29uc3QgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzID0ge1xuICAkZGF5T2ZNb250aDogJ0RBWScsXG4gICRkYXlPZldlZWs6ICdET1cnLFxuICAkZGF5T2ZZZWFyOiAnRE9ZJyxcbiAgJGlzb0RheU9mV2VlazogJ0lTT0RPVycsXG4gICRpc29XZWVrWWVhcjogJ0lTT1lFQVInLFxuICAkaG91cjogJ0hPVVInLFxuICAkbWludXRlOiAnTUlOVVRFJyxcbiAgJHNlY29uZDogJ1NFQ09ORCcsXG4gICRtaWxsaXNlY29uZDogJ01JTExJU0VDT05EUycsXG4gICRtb250aDogJ01PTlRIJyxcbiAgJHdlZWs6ICdXRUVLJyxcbiAgJHllYXI6ICdZRUFSJyxcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5pc287XG4gICAgfVxuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlID0gdmFsdWUgPT4ge1xuICBjb25zdCBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlKTtcbiAgbGV0IGNhc3RUeXBlO1xuICBzd2l0Y2ggKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIGNhc3RUeXBlID0gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICBjYXN0VHlwZSA9ICdib29sZWFuJztcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjYXN0VHlwZSA9IHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gY2FzdFR5cGU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuLy8gRHVwbGljYXRlIGZyb20gdGhlbiBtb25nbyBhZGFwdGVyLi4uXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGdldDoge30sXG4gIGNvdW50OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmNvbnN0IHRvUGFyc2VTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cbiAgaWYgKHNjaGVtYS5maWVsZHMpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICB9XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGlmIChzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5zY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH07XG4gIH1cbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKHNjaGVtYS5pbmRleGVzKSB7XG4gICAgaW5kZXhlcyA9IHsgLi4uc2NoZW1hLmluZGV4ZXMgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXMsXG4gIH07XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGhhbmRsZURvdEZpZWxkcyA9IG9iamVjdCA9PiB7XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgb2JqZWN0W2ZpcnN0XSA9IG9iamVjdFtmaXJzdF0gfHwge307XG4gICAgICBsZXQgY3VycmVudE9iaiA9IG9iamVjdFtmaXJzdF07XG4gICAgICBsZXQgbmV4dDtcbiAgICAgIGxldCB2YWx1ZSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHZhbHVlID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgIHdoaWxlICgobmV4dCA9IGNvbXBvbmVudHMuc2hpZnQoKSkpIHtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgICBjdXJyZW50T2JqW25leHRdID0gY3VycmVudE9ialtuZXh0XSB8fCB7fTtcbiAgICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRPYmogPSBjdXJyZW50T2JqW25leHRdO1xuICAgICAgfVxuICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyA9IGZpZWxkTmFtZSA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKS5tYXAoKGNtcHQsIGluZGV4KSA9PiB7XG4gICAgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICByZXR1cm4gYFwiJHtjbXB0fVwiYDtcbiAgICB9XG4gICAgcmV0dXJuIGAnJHtjbXB0fSdgO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgcmV0dXJuIGBcIiR7ZmllbGROYW1lfVwiYDtcbiAgfVxuICBjb25zdCBjb21wb25lbnRzID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKTtcbiAgbGV0IG5hbWUgPSBjb21wb25lbnRzLnNsaWNlKDAsIGNvbXBvbmVudHMubGVuZ3RoIC0gMSkuam9pbignLT4nKTtcbiAgbmFtZSArPSAnLT4+JyArIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIG5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmICh0eXBlb2YgZmllbGROYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBmaWVsZE5hbWU7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfY3JlYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ2NyZWF0ZWRBdCc7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfdXBkYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ3VwZGF0ZWRBdCc7XG4gIH1cbiAgcmV0dXJuIGZpZWxkTmFtZS5zdWJzdHJpbmcoMSk7XG59O1xuXG5jb25zdCB2YWxpZGF0ZUtleXMgPSBvYmplY3QgPT4ge1xuICBpZiAodHlwZW9mIG9iamVjdCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB2YWxpZGF0ZUtleXMob2JqZWN0W2tleV0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoa2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFJldHVybnMgdGhlIGxpc3Qgb2Ygam9pbiB0YWJsZXMgb24gYSBzY2hlbWFcbmNvbnN0IGpvaW5UYWJsZXNGb3JTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGlmIChzY2hlbWEpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChgX0pvaW46JHtmaWVsZH06JHtzY2hlbWEuY2xhc3NOYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBsaXN0O1xufTtcblxuaW50ZXJmYWNlIFdoZXJlQ2xhdXNlIHtcbiAgcGF0dGVybjogc3RyaW5nO1xuICB2YWx1ZXM6IEFycmF5PGFueT47XG4gIHNvcnRzOiBBcnJheTxhbnk+O1xufVxuXG5jb25zdCBidWlsZFdoZXJlQ2xhdXNlID0gKHsgc2NoZW1hLCBxdWVyeSwgaW5kZXgsIGNhc2VJbnNlbnNpdGl2ZSB9KTogV2hlcmVDbGF1c2UgPT4ge1xuICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICBsZXQgdmFsdWVzID0gW107XG4gIGNvbnN0IHNvcnRzID0gW107XG5cbiAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpbml0aWFsUGF0dGVybnNMZW5ndGggPSBwYXR0ZXJucy5sZW5ndGg7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IHF1ZXJ5W2ZpZWxkTmFtZV07XG5cbiAgICAvLyBub3RoaW5nIGluIHRoZSBzY2hlbWEsIGl0J3MgZ29ubmEgYmxvdyB1cFxuICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAvLyBhcyBpdCB3b24ndCBleGlzdFxuICAgICAgaWYgKGZpZWxkVmFsdWUgJiYgZmllbGRWYWx1ZS4kZXhpc3RzID09PSBmYWxzZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAvLyBUT0RPOiBIYW5kbGUgcXVlcnlpbmcgYnkgX2F1dGhfZGF0YV9wcm92aWRlciwgYXV0aERhdGEgaXMgc3RvcmVkIGluIGF1dGhEYXRhIGZpZWxkXG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKGNhc2VJbnNlbnNpdGl2ZSAmJiAoZmllbGROYW1lID09PSAndXNlcm5hbWUnIHx8IGZpZWxkTmFtZSA9PT0gJ2VtYWlsJykpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYExPV0VSKCQke2luZGV4fTpuYW1lKSA9IExPV0VSKCQke2luZGV4ICsgMX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgbGV0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKG5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRpbikge1xuICAgICAgICAgIG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpyYXcpOjpqc29uYiBAPiAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGluKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgICAgIC8vIEhhbmRsZSBsYXRlclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgPSAkJHtpbmRleCArIDF9Ojp0ZXh0YCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCBmaWVsZFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIC8vIENhbid0IGNhc3QgYm9vbGVhbiB0byBkb3VibGUgcHJlY2lzaW9uXG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnTnVtYmVyJykge1xuICAgICAgICAvLyBTaG91bGQgYWx3YXlzIHJldHVybiB6ZXJvIHJlc3VsdHNcbiAgICAgICAgY29uc3QgTUFYX0lOVF9QTFVTX09ORSA9IDkyMjMzNzIwMzY4NTQ3NzU4MDg7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgTUFYX0lOVF9QTFVTX09ORSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgfVxuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKFsnJG9yJywgJyRub3InLCAnJGFuZCddLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgIGNvbnN0IGNsYXVzZXMgPSBbXTtcbiAgICAgIGNvbnN0IGNsYXVzZVZhbHVlcyA9IFtdO1xuICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKHN1YlF1ZXJ5ID0+IHtcbiAgICAgICAgY29uc3QgY2xhdXNlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIHF1ZXJ5OiBzdWJRdWVyeSxcbiAgICAgICAgICBpbmRleCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2xhdXNlLnBhdHRlcm4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsYXVzZXMucHVzaChjbGF1c2UucGF0dGVybik7XG4gICAgICAgICAgY2xhdXNlVmFsdWVzLnB1c2goLi4uY2xhdXNlLnZhbHVlcyk7XG4gICAgICAgICAgaW5kZXggKz0gY2xhdXNlLnZhbHVlcy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvck9yQW5kID0gZmllbGROYW1lID09PSAnJGFuZCcgPyAnIEFORCAnIDogJyBPUiAnO1xuICAgICAgY29uc3Qgbm90ID0gZmllbGROYW1lID09PSAnJG5vcicgPyAnIE5PVCAnIDogJyc7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSgke2NsYXVzZXMuam9pbihvck9yQW5kKX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaCguLi5jbGF1c2VWYWx1ZXMpO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuJG5lID0gSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWUuJG5lXSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYE5PVCBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGlmIG5vdCBudWxsLCB3ZSBuZWVkIHRvIG1hbnVhbGx5IGV4Y2x1ZGUgbnVsbFxuICAgICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSkgT1IgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTClgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kbmUpO1xuICAgICAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gY2FzdFR5cGVcbiAgICAgICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPD4gJCR7aW5kZXggKyAxfSBPUiAke2NvbnN0cmFpbnRGaWVsZE5hbWV9IElTIE5VTEwpYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmUgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJG5lLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVE9ETzogc3VwcG9ydCBhcnJheXNcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRlcSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kZXEgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kZXEpO1xuICAgICAgICAgIGNvbnN0IGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSA9ICQke2luZGV4Kyt9YCk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGVxID09PSAnb2JqZWN0JyAmJiBmaWVsZFZhbHVlLiRlcS4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBpc0luT3JOaW4gPSBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSB8fCBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJG5pbik7XG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgJiZcbiAgICAgIGlzQXJyYXlGaWVsZCAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMudHlwZSA9PT0gJ1N0cmluZydcbiAgICApIHtcbiAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgIGxldCBhbGxvd051bGwgPSBmYWxzZTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBmaWVsZFZhbHVlLiRpbi5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgIGlmIChsaXN0RWxlbSA9PT0gbnVsbCkge1xuICAgICAgICAgIGFsbG93TnVsbCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4IC0gKGFsbG93TnVsbCA/IDEgOiAwKX1gKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoYWxsb3dOdWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06bmFtZSBJUyBOVUxMIE9SICQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICB9IGVsc2UgaWYgKGlzSW5Pck5pbikge1xuICAgICAgdmFyIGNyZWF0ZUNvbnN0cmFpbnQgPSAoYmFzZUFycmF5LCBub3RJbikgPT4ge1xuICAgICAgICBjb25zdCBub3QgPSBub3RJbiA/ICcgTk9UICcgOiAnJztcbiAgICAgICAgaWYgKGJhc2VBcnJheS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9IGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShiYXNlQXJyYXkpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEhhbmRsZSBOZXN0ZWQgRG90IE5vdGF0aW9uIEFib3ZlXG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICBiYXNlQXJyYXkuZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICAgICAgICBpZiAobGlzdEVsZW0gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleH1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke25vdH0gSU4gKCR7aW5QYXR0ZXJucy5qb2luKCl9KWApO1xuICAgICAgICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIW5vdEluKSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgICAgaW5kZXggPSBpbmRleCArIDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGFycmF5XG4gICAgICAgICAgaWYgKG5vdEluKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMScpOyAvLyBSZXR1cm4gYWxsIHZhbHVlc1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMicpOyAvLyBSZXR1cm4gbm8gdmFsdWVzXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJGluLCBlbHQgPT4gZWx0KSxcbiAgICAgICAgICBmYWxzZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5pbikge1xuICAgICAgICBjcmVhdGVDb25zdHJhaW50KFxuICAgICAgICAgIF8uZmxhdE1hcChmaWVsZFZhbHVlLiRuaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRpbiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGluIHZhbHVlJyk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkbmluIHZhbHVlJyk7XG4gICAgfVxuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSAmJiBpc0FycmF5RmllbGQpIHtcbiAgICAgIGlmIChpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgaWYgKCFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgZmllbGRWYWx1ZS4kYWxsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRWYWx1ZS4kYWxsLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKGZpZWxkVmFsdWUuJGFsbFtpXS4kcmVnZXgpO1xuICAgICAgICAgIGZpZWxkVmFsdWUuJGFsbFtpXSA9IHZhbHVlLnN1YnN0cmluZygxKSArICclJztcbiAgICAgICAgfVxuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGxfcmVnZXgoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnNfYWxsKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9Ojpqc29uYilgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS4kYWxsKSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kYWxsLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRhbGxbMF0ub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXhpc3RzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJGV4aXN0cy4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRleGlzdHMpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRjb250YWluZWRCeSkge1xuICAgICAgY29uc3QgYXJyID0gZmllbGRWYWx1ZS4kY29udGFpbmVkQnk7XG4gICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkY29udGFpbmVkQnk6IHNob3VsZCBiZSBhbiBhcnJheWApO1xuICAgICAgfVxuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA8QCAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShhcnIpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHRleHQpIHtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IGZpZWxkVmFsdWUuJHRleHQuJHNlYXJjaDtcbiAgICAgIGxldCBsYW5ndWFnZSA9ICdlbmdsaXNoJztcbiAgICAgIGlmICh0eXBlb2Ygc2VhcmNoICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YCk7XG4gICAgICB9XG4gICAgICBpZiAoIXNlYXJjaC4kdGVybSB8fCB0eXBlb2Ygc2VhcmNoLiR0ZXJtICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRsYW5ndWFnZSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGxhbmd1YWdlKSB7XG4gICAgICAgIGxhbmd1YWdlID0gc2VhcmNoLiRsYW5ndWFnZTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSBub3Qgc3VwcG9ydGVkLCBwbGVhc2UgdXNlICRyZWdleCBvciBjcmVhdGUgYSBzZXBhcmF0ZSBsb3dlciBjYXNlIGNvbHVtbi5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSAtIGZhbHNlIG5vdCBzdXBwb3J0ZWQsIGluc3RhbGwgUG9zdGdyZXMgVW5hY2NlbnQgRXh0ZW5zaW9uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYHRvX3RzdmVjdG9yKCQke2luZGV4fSwgJCR7aW5kZXggKyAxfTpuYW1lKSBAQCB0b190c3F1ZXJ5KCQke2luZGV4ICsgMn0sICQke2luZGV4ICsgM30pYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGxhbmd1YWdlLCBmaWVsZE5hbWUsIGxhbmd1YWdlLCBzZWFyY2guJHRlcm0pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kbmVhclNwaGVyZSkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRuZWFyU3BoZXJlO1xuICAgICAgY29uc3QgZGlzdGFuY2UgPSBmaWVsZFZhbHVlLiRtYXhEaXN0YW5jZTtcbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSA8PSAkJHtpbmRleCArIDN9YFxuICAgICAgKTtcbiAgICAgIHNvcnRzLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIEFTQ2BcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR3aXRoaW4gJiYgZmllbGRWYWx1ZS4kd2l0aGluLiRib3gpIHtcbiAgICAgIGNvbnN0IGJveCA9IGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94O1xuICAgICAgY29uc3QgbGVmdCA9IGJveFswXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCBib3R0b20gPSBib3hbMF0ubGF0aXR1ZGU7XG4gICAgICBjb25zdCByaWdodCA9IGJveFsxXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCB0b3AgPSBib3hbMV0ubGF0aXR1ZGU7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpib3hgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgoJHtsZWZ0fSwgJHtib3R0b219KSwgKCR7cmlnaHR9LCAke3RvcH0pKWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlKSB7XG4gICAgICBjb25zdCBjZW50ZXJTcGhlcmUgPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZTtcbiAgICAgIGlmICghKGNlbnRlclNwaGVyZSBpbnN0YW5jZW9mIEFycmF5KSB8fCBjZW50ZXJTcGhlcmUubGVuZ3RoIDwgMikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQgYW5kIGRpc3RhbmNlJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gR2V0IHBvaW50LCBjb252ZXJ0IHRvIGdlbyBwb2ludCBpZiBuZWNlc3NhcnkgYW5kIHZhbGlkYXRlXG4gICAgICBsZXQgcG9pbnQgPSBjZW50ZXJTcGhlcmVbMF07XG4gICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgIH0gZWxzZSBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGdlbyBwb2ludCBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgLy8gR2V0IGRpc3RhbmNlIGFuZCB2YWxpZGF0ZVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSBjZW50ZXJTcGhlcmVbMV07XG4gICAgICBpZiAoaXNOYU4oZGlzdGFuY2UpIHx8IGRpc3RhbmNlIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBkaXN0YW5jZSBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbikge1xuICAgICAgY29uc3QgcG9seWdvbiA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbjtcbiAgICAgIGxldCBwb2ludHM7XG4gICAgICBpZiAodHlwZW9mIHBvbHlnb24gPT09ICdvYmplY3QnICYmIHBvbHlnb24uX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgaWYgKCFwb2x5Z29uLmNvb3JkaW5hdGVzIHx8IHBvbHlnb24uY29vcmRpbmF0ZXMubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgUG9seWdvbi5jb29yZGluYXRlcyBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIGxvbi9sYXQgcGFpcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uLmNvb3JkaW5hdGVzO1xuICAgICAgfSBlbHNlIGlmIChwb2x5Z29uIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBHZW9Qb2ludHMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBcImJhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgYmUgUG9seWdvbiBvYmplY3Qgb3IgQXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQnc1wiXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwb2ludHMgPSBwb2ludHNcbiAgICAgICAgLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICAgIHJldHVybiBgKCR7cG9pbnRbMF19LCAke3BvaW50WzFdfSlgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGdlb1dpdGhpbiB2YWx1ZScpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oJywgJyk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludHN9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMgJiYgZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQpIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQ7XG4gICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9JbnRlcnNlY3QgdmFsdWU7ICRwb2ludCBzaG91bGQgYmUgR2VvUG9pbnQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9seWdvbiBAPiAkJHtpbmRleCArIDF9Ojpwb2ludGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgbGV0IHJlZ2V4ID0gZmllbGRWYWx1ZS4kcmVnZXg7XG4gICAgICBsZXQgb3BlcmF0b3IgPSAnfic7XG4gICAgICBjb25zdCBvcHRzID0gZmllbGRWYWx1ZS4kb3B0aW9ucztcbiAgICAgIGlmIChvcHRzKSB7XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ2knKSA+PSAwKSB7XG4gICAgICAgICAgb3BlcmF0b3IgPSAnfionO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ3gnKSA+PSAwKSB7XG4gICAgICAgICAgcmVnZXggPSByZW1vdmVXaGl0ZVNwYWNlKHJlZ2V4KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBuYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgIHJlZ2V4ID0gcHJvY2Vzc1JlZ2V4UGF0dGVybihyZWdleCk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgJHtvcGVyYXRvcn0gJyQke2luZGV4ICsgMX06cmF3J2ApO1xuICAgICAgdmFsdWVzLnB1c2gobmFtZSwgcmVnZXgpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZV0pKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5pc28pO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGluZGV4ICs9IDM7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgIGlmIChmaWVsZFZhbHVlW2NtcF0gfHwgZmllbGRWYWx1ZVtjbXBdID09PSAwKSB7XG4gICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICBsZXQgY29uc3RyYWludEZpZWxkTmFtZTtcbiAgICAgICAgbGV0IHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZVtjbXBdKTtcblxuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlW2NtcF0pO1xuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHBvc3RncmVzVmFsdWUgPT09ICdvYmplY3QnICYmIHBvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlICE9PSAnRGF0ZScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggRGF0ZSBmaWVsZCdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHBhcnNlclJlc3VsdCA9IFV0aWxzLnJlbGF0aXZlVGltZVRvRGF0ZShwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWUpO1xuICAgICAgICAgICAgaWYgKHBhcnNlclJlc3VsdC5zdGF0dXMgPT09ICdzdWNjZXNzJykge1xuICAgICAgICAgICAgICBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHBhcnNlclJlc3VsdC5yZXN1bHQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igd2hpbGUgcGFyc2luZyByZWxhdGl2ZSBkYXRlJywgcGFyc2VyUmVzdWx0KTtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICBgYmFkICRyZWxhdGl2ZVRpbWUgKCR7cG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lfSkgdmFsdWUuICR7cGFyc2VyUmVzdWx0LmluZm99YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gYCQke2luZGV4Kyt9Om5hbWVgO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWVzLnB1c2gocG9zdGdyZXNWYWx1ZSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCR7Y29uc3RyYWludEZpZWxkTmFtZX0gJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4Kyt9YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID09PSBwYXR0ZXJucy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB0aGlzIHF1ZXJ5IHR5cGUgeWV0ICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgdmFsdWVzID0gdmFsdWVzLm1hcCh0cmFuc2Zvcm1WYWx1ZSk7XG4gIHJldHVybiB7IHBhdHRlcm46IHBhdHRlcm5zLmpvaW4oJyBBTkQgJyksIHZhbHVlcywgc29ydHMgfTtcbn07XG5cbmV4cG9ydCBjbGFzcyBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICBjYW5Tb3J0T25Kb2luVGFibGVzOiBib29sZWFuO1xuICBlbmFibGVTY2hlbWFIb29rczogYm9vbGVhbjtcblxuICAvLyBQcml2YXRlXG4gIF9jb2xsZWN0aW9uUHJlZml4OiBzdHJpbmc7XG4gIF9jbGllbnQ6IGFueTtcbiAgX29uY2hhbmdlOiBhbnk7XG4gIF9wZ3A6IGFueTtcbiAgX3N0cmVhbTogYW55O1xuICBfdXVpZDogYW55O1xuICBzY2hlbWFDYWNoZVR0bDogP251bWJlcjtcbiAgZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uOiBib29sZWFuO1xuXG4gIGNvbnN0cnVjdG9yKHsgdXJpLCBjb2xsZWN0aW9uUHJlZml4ID0gJycsIGRhdGFiYXNlT3B0aW9ucyA9IHt9IH06IGFueSkge1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7IC4uLmRhdGFiYXNlT3B0aW9ucyB9O1xuICAgIHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggPSBjb2xsZWN0aW9uUHJlZml4O1xuICAgIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MgPSAhIWRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcztcbiAgICB0aGlzLnNjaGVtYUNhY2hlVHRsID0gZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsO1xuICAgIHRoaXMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uID0gISFkYXRhYmFzZU9wdGlvbnMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIFsnZW5hYmxlU2NoZW1hSG9va3MnLCAnc2NoZW1hQ2FjaGVUdGwnLCAnZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uJ10pIHtcbiAgICAgIGRlbGV0ZSBvcHRpb25zW2tleV07XG4gICAgfVxuXG4gICAgY29uc3QgeyBjbGllbnQsIHBncCB9ID0gY3JlYXRlQ2xpZW50KHVyaSwgb3B0aW9ucyk7XG4gICAgdGhpcy5fY2xpZW50ID0gY2xpZW50O1xuICAgIHRoaXMuX29uY2hhbmdlID0gKCkgPT4geyB9O1xuICAgIHRoaXMuX3BncCA9IHBncDtcbiAgICB0aGlzLl91dWlkID0gdXVpZHY0KCk7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gZmFsc2U7XG4gIH1cblxuICB3YXRjaChjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIHRoaXMuX29uY2hhbmdlID0gY2FsbGJhY2s7XG4gIH1cblxuICAvL05vdGUgdGhhdCBhbmFseXplPXRydWUgd2lsbCBydW4gdGhlIHF1ZXJ5LCBleGVjdXRpbmcgSU5TRVJUUywgREVMRVRFUywgZXRjLlxuICBjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KHF1ZXJ5OiBzdHJpbmcsIGFuYWx5emU6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIGlmIChhbmFseXplKSB7XG4gICAgICByZXR1cm4gJ0VYUExBSU4gKEFOQUxZWkUsIEZPUk1BVCBKU09OKSAnICsgcXVlcnk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAodGhpcy5fc3RyZWFtKSB7XG4gICAgICB0aGlzLl9zdHJlYW0uZG9uZSgpO1xuICAgICAgZGVsZXRlIHRoaXMuX3N0cmVhbTtcbiAgICB9XG4gICAgaWYgKCF0aGlzLl9jbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5fY2xpZW50LiRwb29sLmVuZCgpO1xuICB9XG5cbiAgYXN5bmMgX2xpc3RlblRvU2NoZW1hKCkge1xuICAgIGlmICghdGhpcy5fc3RyZWFtICYmIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MpIHtcbiAgICAgIHRoaXMuX3N0cmVhbSA9IGF3YWl0IHRoaXMuX2NsaWVudC5jb25uZWN0KHsgZGlyZWN0OiB0cnVlIH0pO1xuICAgICAgdGhpcy5fc3RyZWFtLmNsaWVudC5vbignbm90aWZpY2F0aW9uJywgZGF0YSA9PiB7XG4gICAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKGRhdGEucGF5bG9hZCk7XG4gICAgICAgIGlmIChwYXlsb2FkLnNlbmRlcklkICE9PSB0aGlzLl91dWlkKSB7XG4gICAgICAgICAgdGhpcy5fb25jaGFuZ2UoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBhd2FpdCB0aGlzLl9zdHJlYW0ubm9uZSgnTElTVEVOICQxficsICdzY2hlbWEuY2hhbmdlJyk7XG4gICAgfVxuICB9XG5cbiAgX25vdGlmeVNjaGVtYUNoYW5nZSgpIHtcbiAgICBpZiAodGhpcy5fc3RyZWFtKSB7XG4gICAgICB0aGlzLl9zdHJlYW1cbiAgICAgICAgLm5vbmUoJ05PVElGWSAkMX4sICQyJywgWydzY2hlbWEuY2hhbmdlJywgeyBzZW5kZXJJZDogdGhpcy5fdXVpZCB9XSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIE5vdGlmeTonLCBlcnJvcik7IC8vIHVubGlrZWx5IHRvIGV2ZXIgaGFwcGVuXG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIF9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBhd2FpdCBjb25uXG4gICAgICAubm9uZShcbiAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIFwiX1NDSEVNQVwiICggXCJjbGFzc05hbWVcIiB2YXJDaGFyKDEyMCksIFwic2NoZW1hXCIganNvbmIsIFwiaXNQYXJzZUNsYXNzXCIgYm9vbCwgUFJJTUFSWSBLRVkgKFwiY2xhc3NOYW1lXCIpICknXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5vbmUoXG4gICAgICAnU0VMRUNUIEVYSVNUUyAoU0VMRUNUIDEgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzIFdIRVJFIHRhYmxlX25hbWUgPSAkMSknLFxuICAgICAgW25hbWVdLFxuICAgICAgYSA9PiBhLmV4aXN0c1xuICAgICk7XG4gIH1cblxuICBhc3luYyBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSkge1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50YXNrKCdzZXQtY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsICdzY2hlbWEnLCAnY2xhc3NMZXZlbFBlcm1pc3Npb25zJywgSlNPTi5zdHJpbmdpZnkoQ0xQcyldO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICBgVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXNcbiAgICAgICk7XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyBzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRJbmRleGVzOiBhbnksXG4gICAgZXhpc3RpbmdJbmRleGVzOiBhbnkgPSB7fSxcbiAgICBmaWVsZHM6IGFueSxcbiAgICBjb25uOiA/YW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoc3VibWl0dGVkSW5kZXhlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0luZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZXhpc3RpbmdJbmRleGVzID0geyBfaWRfOiB7IF9pZDogMSB9IH07XG4gICAgfVxuICAgIGNvbnN0IGRlbGV0ZWRJbmRleGVzID0gW107XG4gICAgY29uc3QgaW5zZXJ0ZWRJbmRleGVzID0gW107XG4gICAgT2JqZWN0LmtleXMoc3VibWl0dGVkSW5kZXhlcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGBJbmRleCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBkZWxldGVkSW5kZXhlcy5wdXNoKG5hbWUpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAhdGhpcy5kaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24gJiZcbiAgICAgICAgICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGRzLCBrZXkpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICAgIGBGaWVsZCAke2tleX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBhZGQgaW5kZXguYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBleGlzdGluZ0luZGV4ZXNbbmFtZV0gPSBmaWVsZDtcbiAgICAgICAgaW5zZXJ0ZWRJbmRleGVzLnB1c2goe1xuICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgYXdhaXQgY29ubi50eCgnc2V0LWluZGV4ZXMtd2l0aC1zY2hlbWEtZm9ybWF0JywgYXN5bmMgdCA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAoaW5zZXJ0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBhd2FpdCBzZWxmLmNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lLCBpbnNlcnRlZEluZGV4ZXMsIHQpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbkRvZXNOb3RFeGlzdEVycm9yID0gZS5lcnJvcnM/LlswXT8uY29kZSA9PT0gJzQyNzAzJztcbiAgICAgICAgaWYgKGNvbHVtbkRvZXNOb3RFeGlzdEVycm9yICYmICF0aGlzLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbikge1xuICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChkZWxldGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGF3YWl0IHNlbGYuZHJvcEluZGV4ZXMoY2xhc3NOYW1lLCBkZWxldGVkSW5kZXhlcywgdCk7XG4gICAgICB9XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMScsXG4gICAgICAgIFtjbGFzc05hbWUsICdzY2hlbWEnLCAnaW5kZXhlcycsIEpTT04uc3RyaW5naWZ5KGV4aXN0aW5nSW5kZXhlcyldXG4gICAgICApO1xuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogP2FueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBwYXJzZVNjaGVtYSA9IGF3YWl0IGNvbm5cbiAgICAgIC50eCgnY3JlYXRlLWNsYXNzJywgYXN5bmMgdCA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMuY3JlYXRlVGFibGUoY2xhc3NOYW1lLCBzY2hlbWEsIHQpO1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ0lOU0VSVCBJTlRPIFwiX1NDSEVNQVwiIChcImNsYXNzTmFtZVwiLCBcInNjaGVtYVwiLCBcImlzUGFyc2VDbGFzc1wiKSBWQUxVRVMgKCQ8Y2xhc3NOYW1lPiwgJDxzY2hlbWE+LCB0cnVlKScsXG4gICAgICAgICAgeyBjbGFzc05hbWUsIHNjaGVtYSB9XG4gICAgICAgICk7XG4gICAgICAgIGF3YWl0IHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoY2xhc3NOYW1lLCBzY2hlbWEuaW5kZXhlcywge30sIHNjaGVtYS5maWVsZHMsIHQpO1xuICAgICAgICByZXR1cm4gdG9QYXJzZVNjaGVtYShzY2hlbWEpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJiBlcnIuZGV0YWlsLmluY2x1ZGVzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLCBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycjtcbiAgICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICAgIHJldHVybiBwYXJzZVNjaGVtYTtcbiAgfVxuXG4gIC8vIEp1c3QgY3JlYXRlIGEgdGFibGUsIGRvIG5vdCBpbnNlcnQgaW4gc2NoZW1hXG4gIGFzeW5jIGNyZWF0ZVRhYmxlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBkZWJ1ZygnY3JlYXRlVGFibGUnKTtcbiAgICBjb25zdCB2YWx1ZXNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHBhdHRlcm5zQXJyYXkgPSBbXTtcbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3QuYXNzaWduKHt9LCBzY2hlbWEuZmllbGRzKTtcbiAgICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgZmllbGRzLl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2ZhaWxlZF9sb2dpbl9jb3VudCA9IHsgdHlwZTogJ051bWJlcicgfTtcbiAgICAgIGZpZWxkcy5fcGVyaXNoYWJsZV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2hpc3RvcnkgPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgICB9XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBjb25zdCByZWxhdGlvbnMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhmaWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGNvbnN0IHBhcnNlVHlwZSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgLy8gU2tpcCB3aGVuIGl0J3MgYSByZWxhdGlvblxuICAgICAgLy8gV2UnbGwgY3JlYXRlIHRoZSB0YWJsZXMgbGF0ZXJcbiAgICAgIGlmIChwYXJzZVR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZWxhdGlvbnMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgcGFyc2VUeXBlLmNvbnRlbnRzID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgfVxuICAgICAgdmFsdWVzQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaChwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZShwYXJzZVR5cGUpKTtcbiAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgJCR7aW5kZXh9Om5hbWUgJCR7aW5kZXggKyAxfTpyYXdgKTtcbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgcGF0dGVybnNBcnJheS5wdXNoKGBQUklNQVJZIEtFWSAoJCR7aW5kZXh9Om5hbWUpYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMjtcbiAgICB9KTtcbiAgICBjb25zdCBxcyA9IGBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkMTpuYW1lICgke3BhdHRlcm5zQXJyYXkuam9pbigpfSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLnZhbHVlc0FycmF5XTtcblxuICAgIHJldHVybiBjb25uLnRhc2soJ2NyZWF0ZS10YWJsZScsIGFzeW5jIHQgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdC5ub25lKHFzLCB2YWx1ZXMpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIEVMU0U6IFRhYmxlIGFscmVhZHkgZXhpc3RzLCBtdXN0IGhhdmUgYmVlbiBjcmVhdGVkIGJ5IGEgZGlmZmVyZW50IHJlcXVlc3QuIElnbm9yZSB0aGUgZXJyb3IuXG4gICAgICB9XG4gICAgICBhd2FpdCB0LnR4KCdjcmVhdGUtdGFibGUtdHgnLCB0eCA9PiB7XG4gICAgICAgIHJldHVybiB0eC5iYXRjaChcbiAgICAgICAgICByZWxhdGlvbnMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gdHgubm9uZShcbiAgICAgICAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQ8am9pblRhYmxlOm5hbWU+IChcInJlbGF0ZWRJZFwiIHZhckNoYXIoMTIwKSwgXCJvd25pbmdJZFwiIHZhckNoYXIoMTIwKSwgUFJJTUFSWSBLRVkoXCJyZWxhdGVkSWRcIiwgXCJvd25pbmdJZFwiKSApJyxcbiAgICAgICAgICAgICAgeyBqb2luVGFibGU6IGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNjaGVtYVVwZ3JhZGUoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogYW55KSB7XG4gICAgZGVidWcoJ3NjaGVtYVVwZ3JhZGUnKTtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBhd2FpdCBjb25uLnRhc2soJ3NjaGVtYS11cGdyYWRlJywgYXN5bmMgdCA9PiB7XG4gICAgICBjb25zdCBjb2x1bW5zID0gYXdhaXQgdC5tYXAoXG4gICAgICAgICdTRUxFQ1QgY29sdW1uX25hbWUgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucyBXSEVSRSB0YWJsZV9uYW1lID0gJDxjbGFzc05hbWU+JyxcbiAgICAgICAgeyBjbGFzc05hbWUgfSxcbiAgICAgICAgYSA9PiBhLmNvbHVtbl9uYW1lXG4gICAgICApO1xuICAgICAgY29uc3QgbmV3Q29sdW1ucyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiBjb2x1bW5zLmluZGV4T2YoaXRlbSkgPT09IC0xKVxuICAgICAgICAubWFwKGZpZWxkTmFtZSA9PiBzZWxmLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkpO1xuXG4gICAgICBhd2FpdCB0LmJhdGNoKG5ld0NvbHVtbnMpO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIC8vIFRPRE86IE11c3QgYmUgcmV2aXNlZCBmb3IgaW52YWxpZCBsb2dpYy4uLlxuICAgIGRlYnVnKCdhZGRGaWVsZElmTm90RXhpc3RzJyk7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCdhZGQtZmllbGQtaWYtbm90LWV4aXN0cycsIGFzeW5jIHQgPT4ge1xuICAgICAgaWYgKHR5cGUudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAgICdBTFRFUiBUQUJMRSAkPGNsYXNzTmFtZTpuYW1lPiBBREQgQ09MVU1OIElGIE5PVCBFWElTVFMgJDxmaWVsZE5hbWU6bmFtZT4gJDxwb3N0Z3Jlc1R5cGU6cmF3PicsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgICBwb3N0Z3Jlc1R5cGU6IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHR5cGUpLFxuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgcmV0dXJuIHNlbGYuY3JlYXRlQ2xhc3MoY2xhc3NOYW1lLCB7IGZpZWxkczogeyBbZmllbGROYW1lXTogdHlwZSB9IH0sIHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIENvbHVtbiBhbHJlYWR5IGV4aXN0cywgY3JlYXRlZCBieSBvdGhlciByZXF1ZXN0LiBDYXJyeSBvbiB0byBzZWUgaWYgaXQncyB0aGUgcmlnaHQgdHlwZS5cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgeyBqb2luVGFibGU6IGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCB9XG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHQuYW55KFxuICAgICAgICAnU0VMRUNUIFwic2NoZW1hXCIgRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+IGFuZCAoXCJzY2hlbWFcIjo6anNvbi0+XFwnZmllbGRzXFwnLT4kPGZpZWxkTmFtZT4pIGlzIG5vdCBudWxsJyxcbiAgICAgICAgeyBjbGFzc05hbWUsIGZpZWxkTmFtZSB9XG4gICAgICApO1xuXG4gICAgICBpZiAocmVzdWx0WzBdKSB7XG4gICAgICAgIHRocm93ICdBdHRlbXB0ZWQgdG8gYWRkIGEgZmllbGQgdGhhdCBhbHJlYWR5IGV4aXN0cyc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBwYXRoID0gYHtmaWVsZHMsJHtmaWVsZE5hbWV9fWA7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICAgIHsgcGF0aCwgdHlwZSwgY2xhc3NOYW1lIH1cbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgndXBkYXRlLXNjaGVtYS1maWVsZC1vcHRpb25zJywgYXN5bmMgdCA9PiB7XG4gICAgICBjb25zdCBwYXRoID0gYHtmaWVsZHMsJHtmaWVsZE5hbWV9fWA7XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCI9anNvbmJfc2V0KFwic2NoZW1hXCIsICQ8cGF0aD4sICQ8dHlwZT4pICBXSEVSRSBcImNsYXNzTmFtZVwiPSQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgcGF0aCwgdHlwZSwgY2xhc3NOYW1lIH1cbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBEcm9wcyBhIGNvbGxlY3Rpb24uIFJlc29sdmVzIHdpdGggdHJ1ZSBpZiBpdCB3YXMgYSBQYXJzZSBTY2hlbWEgKGVnLiBfVXNlciwgQ3VzdG9tLCBldGMuKVxuICAvLyBhbmQgcmVzb2x2ZXMgd2l0aCBmYWxzZSBpZiBpdCB3YXNuJ3QgKGVnLiBhIGpvaW4gdGFibGUpLiBSZWplY3RzIGlmIGRlbGV0aW9uIHdhcyBpbXBvc3NpYmxlLlxuICBhc3luYyBkZWxldGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IG9wZXJhdGlvbnMgPSBbXG4gICAgICB7IHF1ZXJ5OiBgRFJPUCBUQUJMRSBJRiBFWElTVFMgJDE6bmFtZWAsIHZhbHVlczogW2NsYXNzTmFtZV0gfSxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBERUxFVEUgRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXM6IFtjbGFzc05hbWVdLFxuICAgICAgfSxcbiAgICBdO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fY2xpZW50XG4gICAgICAudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KG9wZXJhdGlvbnMpKSlcbiAgICAgIC50aGVuKCgpID0+IGNsYXNzTmFtZS5pbmRleE9mKCdfSm9pbjonKSAhPSAwKTsgLy8gcmVzb2x2ZXMgd2l0aCBmYWxzZSB3aGVuIF9Kb2luIHRhYmxlXG5cbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cblxuICAvLyBEZWxldGUgYWxsIGRhdGEga25vd24gdG8gdGhpcyBhZGFwdGVyLiBVc2VkIGZvciB0ZXN0aW5nLlxuICBhc3luYyBkZWxldGVBbGxDbGFzc2VzKCkge1xuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgIGNvbnN0IGhlbHBlcnMgPSB0aGlzLl9wZ3AuaGVscGVycztcbiAgICBkZWJ1ZygnZGVsZXRlQWxsQ2xhc3NlcycpO1xuICAgIGlmICh0aGlzLl9jbGllbnQ/LiRwb29sLmVuZGVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuX2NsaWVudFxuICAgICAgLnRhc2soJ2RlbGV0ZS1hbGwtY2xhc3NlcycsIGFzeW5jIHQgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0LmFueSgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIicpO1xuICAgICAgICAgIGNvbnN0IGpvaW5zID0gcmVzdWx0cy5yZWR1Y2UoKGxpc3Q6IEFycmF5PHN0cmluZz4sIHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbGlzdC5jb25jYXQoam9pblRhYmxlc0ZvclNjaGVtYShzY2hlbWEuc2NoZW1hKSk7XG4gICAgICAgICAgfSwgW10pO1xuICAgICAgICAgIGNvbnN0IGNsYXNzZXMgPSBbXG4gICAgICAgICAgICAnX1NDSEVNQScsXG4gICAgICAgICAgICAnX1B1c2hTdGF0dXMnLFxuICAgICAgICAgICAgJ19Kb2JTdGF0dXMnLFxuICAgICAgICAgICAgJ19Kb2JTY2hlZHVsZScsXG4gICAgICAgICAgICAnX0hvb2tzJyxcbiAgICAgICAgICAgICdfR2xvYmFsQ29uZmlnJyxcbiAgICAgICAgICAgICdfR3JhcGhRTENvbmZpZycsXG4gICAgICAgICAgICAnX0F1ZGllbmNlJyxcbiAgICAgICAgICAgICdfSWRlbXBvdGVuY3knLFxuICAgICAgICAgICAgLi4ucmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5jbGFzc05hbWUpLFxuICAgICAgICAgICAgLi4uam9pbnMsXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdCBxdWVyaWVzID0gY2xhc3Nlcy5tYXAoY2xhc3NOYW1lID0+ICh7XG4gICAgICAgICAgICBxdWVyeTogJ0RST1AgVEFCTEUgSUYgRVhJU1RTICQ8Y2xhc3NOYW1lOm5hbWU+JyxcbiAgICAgICAgICAgIHZhbHVlczogeyBjbGFzc05hbWUgfSxcbiAgICAgICAgICB9KSk7XG4gICAgICAgICAgYXdhaXQgdC50eCh0eCA9PiB0eC5ub25lKGhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIE5vIF9TQ0hFTUEgY29sbGVjdGlvbi4gRG9uJ3QgZGVsZXRlIGFueXRoaW5nLlxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBkZWJ1ZyhgZGVsZXRlQWxsQ2xhc3NlcyBkb25lIGluICR7bmV3IERhdGUoKS5nZXRUaW1lKCkgLSBub3d9YCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZSB0aGUgY29sdW1uIGFuZCBhbGwgdGhlIGRhdGEuIEZvciBSZWxhdGlvbnMsIHRoZSBfSm9pbiBjb2xsZWN0aW9uIGlzIGhhbmRsZWRcbiAgLy8gc3BlY2lhbGx5LCB0aGlzIGZ1bmN0aW9uIGRvZXMgbm90IGRlbGV0ZSBfSm9pbiBjb2x1bW5zLiBJdCBzaG91bGQsIGhvd2V2ZXIsIGluZGljYXRlXG4gIC8vIHRoYXQgdGhlIHJlbGF0aW9uIGZpZWxkcyBkb2VzIG5vdCBleGlzdCBhbnltb3JlLiBJbiBtb25nbywgdGhpcyBtZWFucyByZW1vdmluZyBpdCBmcm9tXG4gIC8vIHRoZSBfU0NIRU1BIGNvbGxlY3Rpb24uICBUaGVyZSBzaG91bGQgYmUgbm8gYWN0dWFsIGRhdGEgaW4gdGhlIGNvbGxlY3Rpb24gdW5kZXIgdGhlIHNhbWUgbmFtZVxuICAvLyBhcyB0aGUgcmVsYXRpb24gY29sdW1uLCBzbyBpdCdzIGZpbmUgdG8gYXR0ZW1wdCB0byBkZWxldGUgaXQuIElmIHRoZSBmaWVsZHMgbGlzdGVkIHRvIGJlXG4gIC8vIGRlbGV0ZWQgZG8gbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gc3VjY2Vzc2Z1bGx5IGFueXdheXMuIENoZWNraW5nIGZvclxuICAvLyBhdHRlbXB0cyB0byBkZWxldGUgbm9uLWV4aXN0ZW50IGZpZWxkcyBpcyB0aGUgcmVzcG9uc2liaWxpdHkgb2YgUGFyc2UgU2VydmVyLlxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgbm90IG9ibGlnYXRlZCB0byBkZWxldGUgZmllbGRzIGF0b21pY2FsbHkuIEl0IGlzIGdpdmVuIHRoZSBmaWVsZFxuICAvLyBuYW1lcyBpbiBhIGxpc3Qgc28gdGhhdCBkYXRhYmFzZXMgdGhhdCBhcmUgY2FwYWJsZSBvZiBkZWxldGluZyBmaWVsZHMgYXRvbWljYWxseVxuICAvLyBtYXkgZG8gc28uXG5cbiAgLy8gUmV0dXJucyBhIFByb21pc2UuXG4gIGFzeW5jIGRlbGV0ZUZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGRlYnVnKCdkZWxldGVGaWVsZHMnKTtcbiAgICBmaWVsZE5hbWVzID0gZmllbGROYW1lcy5yZWR1Y2UoKGxpc3Q6IEFycmF5PHN0cmluZz4sIGZpZWxkTmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIGlmIChmaWVsZC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChmaWVsZE5hbWUpO1xuICAgICAgfVxuICAgICAgZGVsZXRlIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHJldHVybiBsaXN0O1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmZpZWxkTmFtZXNdO1xuICAgIGNvbnN0IGNvbHVtbnMgPSBmaWVsZE5hbWVzXG4gICAgICAubWFwKChuYW1lLCBpZHgpID0+IHtcbiAgICAgICAgcmV0dXJuIGAkJHtpZHggKyAyfTpuYW1lYDtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCBEUk9QIENPTFVNTicpO1xuXG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCdkZWxldGUtZmllbGRzJywgYXN5bmMgdCA9PiB7XG4gICAgICBhd2FpdCB0Lm5vbmUoJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIiA9ICQ8c2NoZW1hPiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+Jywge1xuICAgICAgICBzY2hlbWEsXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pO1xuICAgICAgaWYgKHZhbHVlcy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShgQUxURVIgVEFCTEUgJDE6bmFtZSBEUk9QIENPTFVNTiBJRiBFWElTVFMgJHtjb2x1bW5zfWAsIHZhbHVlcyk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciBhbGwgc2NoZW1hcyBrbm93biB0byB0aGlzIGFkYXB0ZXIsIGluIFBhcnNlIGZvcm1hdC4gSW4gY2FzZSB0aGVcbiAgLy8gc2NoZW1hcyBjYW5ub3QgYmUgcmV0cmlldmVkLCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMuIFJlcXVpcmVtZW50cyBmb3IgdGhlXG4gIC8vIHJlamVjdGlvbiByZWFzb24gYXJlIFRCRC5cbiAgYXN5bmMgZ2V0QWxsQ2xhc3NlcygpIHtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LnRhc2soJ2dldC1hbGwtY2xhc3NlcycsIGFzeW5jIHQgPT4ge1xuICAgICAgcmV0dXJuIGF3YWl0IHQubWFwKCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJywgbnVsbCwgcm93ID0+XG4gICAgICAgIHRvUGFyc2VTY2hlbWEoeyBjbGFzc05hbWU6IHJvdy5jbGFzc05hbWUsIC4uLnJvdy5zY2hlbWEgfSlcbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciB0aGUgc2NoZW1hIHdpdGggdGhlIGdpdmVuIG5hbWUsIGluIFBhcnNlIGZvcm1hdC4gSWZcbiAgLy8gdGhpcyBhZGFwdGVyIGRvZXNuJ3Qga25vdyBhYm91dCB0aGUgc2NoZW1hLCByZXR1cm4gYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aXRoXG4gIC8vIHVuZGVmaW5lZCBhcyB0aGUgcmVhc29uLlxuICBhc3luYyBnZXRDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGRlYnVnKCdnZXRDbGFzcycpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsIHtcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChyZXN1bHQubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRbMF0uc2NoZW1hO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHRvUGFyc2VTY2hlbWEpO1xuICB9XG5cbiAgLy8gVE9ETzogcmVtb3ZlIHRoZSBtb25nbyBmb3JtYXQgZGVwZW5kZW5jeSBpbiB0aGUgcmV0dXJuIHZhbHVlXG4gIGFzeW5jIGNyZWF0ZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ2NyZWF0ZU9iamVjdCcpO1xuICAgIGxldCBjb2x1bW5zQXJyYXkgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXNBcnJheSA9IFtdO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBnZW9Qb2ludHMgPSB7fTtcblxuICAgIG9iamVjdCA9IGhhbmRsZURvdEZpZWxkcyhvYmplY3QpO1xuXG4gICAgdmFsaWRhdGVLZXlzKG9iamVjdCk7XG5cbiAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB2YXIgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgY29uc3QgYXV0aERhdGFBbHJlYWR5RXhpc3RzID0gISFvYmplY3QuYXV0aERhdGE7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ10gPSBvYmplY3RbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBmaWVsZE5hbWUgPSAnYXV0aERhdGEnO1xuICAgICAgICAvLyBBdm9pZCBhZGRpbmcgYXV0aERhdGEgbXVsdGlwbGUgdGltZXMgdG8gdGhlIHF1ZXJ5XG4gICAgICAgIGlmIChhdXRoRGF0YUFscmVhZHlFeGlzdHMpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29sdW1uc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2VtYWlsX3ZlcmlmeV90b2tlbicgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZmFpbGVkX2xvZ2luX2NvdW50JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wYXNzd29yZF9oaXN0b3J5J1xuICAgICAgICApIHtcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wYXNzd29yZF9jaGFuZ2VkX2F0J1xuICAgICAgICApIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc3dpdGNoIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSkge1xuICAgICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0ub2JqZWN0SWQpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBcnJheSc6XG4gICAgICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChKU09OLnN0cmluZ2lmeShvYmplY3RbZmllbGROYW1lXSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgICBjYXNlICdOdW1iZXInOlxuICAgICAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5uYW1lKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9seWdvbic6IHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwob2JqZWN0W2ZpZWxkTmFtZV0uY29vcmRpbmF0ZXMpO1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2godmFsdWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgICAgICAvLyBwb3AgdGhlIHBvaW50IGFuZCBwcm9jZXNzIGxhdGVyXG4gICAgICAgICAgZ2VvUG9pbnRzW2ZpZWxkTmFtZV0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgICBjb2x1bW5zQXJyYXkucG9wKCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgYFR5cGUgJHtzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZX0gbm90IHN1cHBvcnRlZCB5ZXRgO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29sdW1uc0FycmF5ID0gY29sdW1uc0FycmF5LmNvbmNhdChPYmplY3Qua2V5cyhnZW9Qb2ludHMpKTtcbiAgICBjb25zdCBpbml0aWFsVmFsdWVzID0gdmFsdWVzQXJyYXkubWFwKCh2YWwsIGluZGV4KSA9PiB7XG4gICAgICBsZXQgdGVybWluYXRpb24gPSAnJztcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGNvbHVtbnNBcnJheVtpbmRleF07XG4gICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgdGVybWluYXRpb24gPSAnOjp0ZXh0W10nO1xuICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgdGVybWluYXRpb24gPSAnOjpqc29uYic7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCQke2luZGV4ICsgMiArIGNvbHVtbnNBcnJheS5sZW5ndGh9JHt0ZXJtaW5hdGlvbn1gO1xuICAgIH0pO1xuICAgIGNvbnN0IGdlb1BvaW50c0luamVjdHMgPSBPYmplY3Qua2V5cyhnZW9Qb2ludHMpLm1hcChrZXkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBnZW9Qb2ludHNba2V5XTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2godmFsdWUubG9uZ2l0dWRlLCB2YWx1ZS5sYXRpdHVkZSk7XG4gICAgICBjb25zdCBsID0gdmFsdWVzQXJyYXkubGVuZ3RoICsgY29sdW1uc0FycmF5Lmxlbmd0aDtcbiAgICAgIHJldHVybiBgUE9JTlQoJCR7bH0sICQke2wgKyAxfSlgO1xuICAgIH0pO1xuXG4gICAgY29uc3QgY29sdW1uc1BhdHRlcm4gPSBjb2x1bW5zQXJyYXkubWFwKChjb2wsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAyfTpuYW1lYCkuam9pbigpO1xuICAgIGNvbnN0IHZhbHVlc1BhdHRlcm4gPSBpbml0aWFsVmFsdWVzLmNvbmNhdChnZW9Qb2ludHNJbmplY3RzKS5qb2luKCk7XG5cbiAgICBjb25zdCBxcyA9IGBJTlNFUlQgSU5UTyAkMTpuYW1lICgke2NvbHVtbnNQYXR0ZXJufSkgVkFMVUVTICgke3ZhbHVlc1BhdHRlcm59KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uY29sdW1uc0FycmF5LCAuLi52YWx1ZXNBcnJheV07XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpXG4gICAgICAubm9uZShxcywgdmFsdWVzKVxuICAgICAgLnRoZW4oKCkgPT4gKHsgb3BzOiBbb2JqZWN0XSB9KSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICAgIGVyci51bmRlcmx5aW5nRXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICBpZiAoZXJyb3IuY29uc3RyYWludCkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLmNvbnN0cmFpbnQubWF0Y2goL3VuaXF1ZV8oW2EtekEtWl0rKS8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMgJiYgQXJyYXkuaXNBcnJheShtYXRjaGVzKSkge1xuICAgICAgICAgICAgICBlcnIudXNlckluZm8gPSB7IGR1cGxpY2F0ZWRfZmllbGQ6IG1hdGNoZXNbMV0gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgZXJyb3IgPSBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICAvLyBJZiBubyBvYmplY3RzIG1hdGNoLCByZWplY3Qgd2l0aCBPQkpFQ1RfTk9UX0ZPVU5ELiBJZiBvYmplY3RzIGFyZSBmb3VuZCBhbmQgZGVsZXRlZCwgcmVzb2x2ZSB3aXRoIHVuZGVmaW5lZC5cbiAgLy8gSWYgdGhlcmUgaXMgc29tZSBvdGhlciBlcnJvciwgcmVqZWN0IHdpdGggSU5URVJOQUxfU0VSVkVSX0VSUk9SLlxuICBhc3luYyBkZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnZGVsZXRlT2JqZWN0c0J5UXVlcnknKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCBpbmRleCA9IDI7XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIGluZGV4LFxuICAgICAgcXVlcnksXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG4gICAgaWYgKE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT09IDApIHtcbiAgICAgIHdoZXJlLnBhdHRlcm4gPSAnVFJVRSc7XG4gICAgfVxuICAgIGNvbnN0IHFzID0gYFdJVEggZGVsZXRlZCBBUyAoREVMRVRFIEZST00gJDE6bmFtZSBXSEVSRSAke3doZXJlLnBhdHRlcm59IFJFVFVSTklORyAqKSBTRUxFQ1QgY291bnQoKikgRlJPTSBkZWxldGVkYDtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udCA6IHRoaXMuX2NsaWVudClcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiArYS5jb3VudClcbiAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgaWYgKGNvdW50ID09PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBjb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBEb24ndCBkZWxldGUgYW55dGhpbmcgaWYgZG9lc24ndCBleGlzdFxuICAgICAgfSk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuICAvLyBSZXR1cm4gdmFsdWUgbm90IGN1cnJlbnRseSB3ZWxsIHNwZWNpZmllZC5cbiAgYXN5bmMgZmluZE9uZUFuZFVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGRlYnVnKCdmaW5kT25lQW5kVXBkYXRlJyk7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB1cGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKS50aGVuKFxuICAgICAgdmFsID0+IHZhbFswXVxuICAgICk7XG4gIH1cblxuICAvLyBBcHBseSB0aGUgdXBkYXRlIHRvIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICBhc3luYyB1cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApOiBQcm9taXNlPFthbnldPiB7XG4gICAgZGVidWcoJ3VwZGF0ZU9iamVjdHNCeVF1ZXJ5Jyk7XG4gICAgY29uc3QgdXBkYXRlUGF0dGVybnMgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcblxuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0geyAuLi51cGRhdGUgfTtcblxuICAgIC8vIFNldCBmbGFnIGZvciBkb3Qgbm90YXRpb24gZmllbGRzXG4gICAgY29uc3QgZG90Tm90YXRpb25PcHRpb25zID0ge307XG4gICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaXJzdF0gPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0gPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB1cGRhdGUgPSBoYW5kbGVEb3RGaWVsZHModXBkYXRlKTtcbiAgICAvLyBSZXNvbHZlIGF1dGhEYXRhIGZpcnN0LFxuICAgIC8vIFNvIHdlIGRvbid0IGVuZCB1cCB3aXRoIG11bHRpcGxlIGtleSB1cGRhdGVzXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXSA9IHVwZGF0ZVsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgZmllbGRWYWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgLy8gRHJvcCBhbnkgdW5kZWZpbmVkIHZhbHVlcy5cbiAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT0gJ2F1dGhEYXRhJykge1xuICAgICAgICAvLyBUaGlzIHJlY3Vyc2l2ZWx5IHNldHMgdGhlIGpzb25fb2JqZWN0XG4gICAgICAgIC8vIE9ubHkgMSBsZXZlbCBkZWVwXG4gICAgICAgIGNvbnN0IGdlbmVyYXRlID0gKGpzb25iOiBzdHJpbmcsIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGBqc29uX29iamVjdF9zZXRfa2V5KENPQUxFU0NFKCR7anNvbmJ9LCAne30nOjpqc29uYiksICR7a2V5fSwgJHt2YWx1ZX0pOjpqc29uYmA7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGxhc3RLZXkgPSBgJCR7aW5kZXh9Om5hbWVgO1xuICAgICAgICBjb25zdCBmaWVsZE5hbWVJbmRleCA9IGluZGV4O1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBjb25zdCB1cGRhdGUgPSBPYmplY3Qua2V5cyhmaWVsZFZhbHVlKS5yZWR1Y2UoKGxhc3RLZXk6IHN0cmluZywga2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICBjb25zdCBzdHIgPSBnZW5lcmF0ZShsYXN0S2V5LCBgJCR7aW5kZXh9Ojp0ZXh0YCwgYCQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICBsZXQgdmFsdWUgPSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdmFsdWUgPSBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbHVlcy5wdXNoKGtleSwgdmFsdWUpO1xuICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgIH0sIGxhc3RLZXkpO1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtmaWVsZE5hbWVJbmRleH06bmFtZSA9ICR7dXBkYXRlfWApO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdJbmNyZW1lbnQnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsIDApICsgJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuYW1vdW50KTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZChDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtpbmRleCArIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgbnVsbCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ1JlbW92ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9yZW1vdmUoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7aW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGRVbmlxdWUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkX3VuaXF1ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtpbmRleCArIDFcbiAgICAgICAgICB9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgLy9UT0RPOiBzdG9wIHNwZWNpYWwgY2FzaW5nIHRoaXMuIEl0IHNob3VsZCBjaGVjayBmb3IgX190eXBlID09PSAnRGF0ZScgYW5kIHVzZSAuaXNvXG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgICAgaW5kZXggKz0gMztcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwoZmllbGRWYWx1ZS5jb29yZGluYXRlcyk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgLy8gbm9vcFxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnT2JqZWN0J1xuICAgICAgKSB7XG4gICAgICAgIC8vIEdhdGhlciBrZXlzIHRvIGluY3JlbWVudFxuICAgICAgICBjb25zdCBrZXlzVG9JbmNyZW1lbnQgPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKGsgPT4ge1xuICAgICAgICAgICAgLy8gY2hvb3NlIHRvcCBsZXZlbCBmaWVsZHMgdGhhdCBoYXZlIGEgZGVsZXRlIG9wZXJhdGlvbiBzZXRcbiAgICAgICAgICAgIC8vIE5vdGUgdGhhdCBPYmplY3Qua2V5cyBpcyBpdGVyYXRpbmcgb3ZlciB0aGUgKipvcmlnaW5hbCoqIHVwZGF0ZSBvYmplY3RcbiAgICAgICAgICAgIC8vIGFuZCB0aGF0IHNvbWUgb2YgdGhlIGtleXMgb2YgdGhlIG9yaWdpbmFsIHVwZGF0ZSBjb3VsZCBiZSBudWxsIG9yIHVuZGVmaW5lZDpcbiAgICAgICAgICAgIC8vIChTZWUgdGhlIGFib3ZlIGNoZWNrIGBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCB0eXBlb2YgZmllbGRWYWx1ZSA9PSBcInVuZGVmaW5lZFwiKWApXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsVXBkYXRlW2tdO1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgICAgICAgdmFsdWUuX19vcCA9PT0gJ0luY3JlbWVudCcgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJylbMF0gPT09IGZpZWxkTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoayA9PiBrLnNwbGl0KCcuJylbMV0pO1xuXG4gICAgICAgIGxldCBpbmNyZW1lbnRQYXR0ZXJucyA9ICcnO1xuICAgICAgICBpZiAoa2V5c1RvSW5jcmVtZW50Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpbmNyZW1lbnRQYXR0ZXJucyA9XG4gICAgICAgICAgICAnIHx8ICcgK1xuICAgICAgICAgICAga2V5c1RvSW5jcmVtZW50XG4gICAgICAgICAgICAgIC5tYXAoYyA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYW1vdW50ID0gZmllbGRWYWx1ZVtjXS5hbW91bnQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBDT05DQVQoJ3tcIiR7Y31cIjonLCBDT0FMRVNDRSgkJHtpbmRleH06bmFtZS0+Picke2N9JywnMCcpOjppbnQgKyAke2Ftb3VudH0sICd9Jyk6Ompzb25iYDtcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgLmpvaW4oJyB8fCAnKTtcbiAgICAgICAgICAvLyBTdHJpcCB0aGUga2V5c1xuICAgICAgICAgIGtleXNUb0luY3JlbWVudC5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgICBkZWxldGUgZmllbGRWYWx1ZVtrZXldO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qga2V5c1RvRGVsZXRlOiBBcnJheTxzdHJpbmc+ID0gT2JqZWN0LmtleXMob3JpZ2luYWxVcGRhdGUpXG4gICAgICAgICAgLmZpbHRlcihrID0+IHtcbiAgICAgICAgICAgIC8vIGNob29zZSB0b3AgbGV2ZWwgZmllbGRzIHRoYXQgaGF2ZSBhIGRlbGV0ZSBvcGVyYXRpb24gc2V0LlxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcmlnaW5hbFVwZGF0ZVtrXTtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHZhbHVlICYmXG4gICAgICAgICAgICAgIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpWzBdID09PSBmaWVsZE5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGsgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBjb25zdCBkZWxldGVQYXR0ZXJucyA9IGtleXNUb0RlbGV0ZS5yZWR1Y2UoKHA6IHN0cmluZywgYzogc3RyaW5nLCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgICByZXR1cm4gcCArIGAgLSAnJCR7aW5kZXggKyAxICsgaX06dmFsdWUnYDtcbiAgICAgICAgfSwgJycpO1xuICAgICAgICAvLyBPdmVycmlkZSBPYmplY3RcbiAgICAgICAgbGV0IHVwZGF0ZU9iamVjdCA9IFwiJ3t9Jzo6anNvbmJcIjtcblxuICAgICAgICBpZiAoZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAvLyBNZXJnZSBPYmplY3RcbiAgICAgICAgICB1cGRhdGVPYmplY3QgPSBgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICd7fSc6Ompzb25iKWA7XG4gICAgICAgIH1cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSAoJHt1cGRhdGVPYmplY3R9ICR7ZGVsZXRlUGF0dGVybnN9ICR7aW5jcmVtZW50UGF0dGVybnN9IHx8ICQke2luZGV4ICsgMSArIGtleXNUb0RlbGV0ZS5sZW5ndGhcbiAgICAgICAgICB9Ojpqc29uYiApYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIC4uLmtleXNUb0RlbGV0ZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyICsga2V5c1RvRGVsZXRlLmxlbmd0aDtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZSkgJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknXG4gICAgICApIHtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKTtcbiAgICAgICAgaWYgKGV4cGVjdGVkVHlwZSA9PT0gJ3RleHRbXScpIHtcbiAgICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnRleHRbXWApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVidWcoJ05vdCBzdXBwb3J0ZWQgdXBkYXRlJywgeyBmaWVsZE5hbWUsIGZpZWxkVmFsdWUgfSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB1cGRhdGUgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX0geWV0YFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlQ2xhdXNlID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgcXMgPSBgVVBEQVRFICQxOm5hbWUgU0VUICR7dXBkYXRlUGF0dGVybnMuam9pbigpfSAke3doZXJlQ2xhdXNlfSBSRVRVUk5JTkcgKmA7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpLmFueShxcywgdmFsdWVzKTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gSG9wZWZ1bGx5LCB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGlzLiBJdCdzIG9ubHkgdXNlZCBmb3IgY29uZmlnIGFuZCBob29rcy5cbiAgdXBzZXJ0T25lT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCd1cHNlcnRPbmVPYmplY3QnKTtcbiAgICBjb25zdCBjcmVhdGVWYWx1ZSA9IE9iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCB1cGRhdGUpO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZU9iamVjdChjbGFzc05hbWUsIHNjaGVtYSwgY3JlYXRlVmFsdWUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAvLyBpZ25vcmUgZHVwbGljYXRlIHZhbHVlIGVycm9ycyBhcyBpdCdzIHVwc2VydFxuICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLmZpbmRPbmVBbmRVcGRhdGUoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB1cGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgeyBza2lwLCBsaW1pdCwgc29ydCwga2V5cywgY2FzZUluc2Vuc2l0aXZlLCBleHBsYWluIH06IFF1ZXJ5T3B0aW9uc1xuICApIHtcbiAgICBkZWJ1ZygnZmluZCcpO1xuICAgIGNvbnN0IGhhc0xpbWl0ID0gbGltaXQgIT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBoYXNTa2lwID0gc2tpcCAhPT0gdW5kZWZpbmVkO1xuICAgIGxldCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IGxpbWl0UGF0dGVybiA9IGhhc0xpbWl0ID8gYExJTUlUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzTGltaXQpIHtcbiAgICAgIHZhbHVlcy5wdXNoKGxpbWl0KTtcbiAgICB9XG4gICAgY29uc3Qgc2tpcFBhdHRlcm4gPSBoYXNTa2lwID8gYE9GRlNFVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc1NraXApIHtcbiAgICAgIHZhbHVlcy5wdXNoKHNraXApO1xuICAgIH1cblxuICAgIGxldCBzb3J0UGF0dGVybiA9ICcnO1xuICAgIGlmIChzb3J0KSB7XG4gICAgICBjb25zdCBzb3J0Q29weTogYW55ID0gc29ydDtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBPYmplY3Qua2V5cyhzb3J0KVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgY29uc3QgdHJhbnNmb3JtS2V5ID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoa2V5KS5qb2luKCctPicpO1xuICAgICAgICAgIC8vIFVzaW5nICRpZHggcGF0dGVybiBnaXZlczogIG5vbi1pbnRlZ2VyIGNvbnN0YW50IGluIE9SREVSIEJZXG4gICAgICAgICAgaWYgKHNvcnRDb3B5W2tleV0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IEFTQ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IERFU0NgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgc29ydFBhdHRlcm4gPSBzb3J0ICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LmtleXMoc29ydCkubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgIH1cbiAgICBpZiAod2hlcmUuc29ydHMgJiYgT2JqZWN0LmtleXMoKHdoZXJlLnNvcnRzOiBhbnkpKS5sZW5ndGggPiAwKSB7XG4gICAgICBzb3J0UGF0dGVybiA9IGBPUkRFUiBCWSAke3doZXJlLnNvcnRzLmpvaW4oKX1gO1xuICAgIH1cblxuICAgIGxldCBjb2x1bW5zID0gJyonO1xuICAgIGlmIChrZXlzKSB7XG4gICAgICAvLyBFeGNsdWRlIGVtcHR5IGtleXNcbiAgICAgIC8vIFJlcGxhY2UgQUNMIGJ5IGl0J3Mga2V5c1xuICAgICAga2V5cyA9IGtleXMucmVkdWNlKChtZW1vLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgICBtZW1vLnB1c2goJ19ycGVybScpO1xuICAgICAgICAgIG1lbW8ucHVzaCgnX3dwZXJtJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAga2V5Lmxlbmd0aCA+IDAgJiZcbiAgICAgICAgICAvLyBSZW1vdmUgc2VsZWN0ZWQgZmllbGQgbm90IHJlZmVyZW5jZWQgaW4gdGhlIHNjaGVtYVxuICAgICAgICAgIC8vIFJlbGF0aW9uIGlzIG5vdCBhIGNvbHVtbiBpbiBwb3N0Z3Jlc1xuICAgICAgICAgIC8vICRzY29yZSBpcyBhIFBhcnNlIHNwZWNpYWwgZmllbGQgYW5kIGlzIGFsc28gbm90IGEgY29sdW1uXG4gICAgICAgICAgKChzY2hlbWEuZmllbGRzW2tleV0gJiYgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgIT09ICdSZWxhdGlvbicpIHx8IGtleSA9PT0gJyRzY29yZScpXG4gICAgICAgICkge1xuICAgICAgICAgIG1lbW8ucHVzaChrZXkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfSwgW10pO1xuICAgICAgY29sdW1ucyA9IGtleXNcbiAgICAgICAgLm1hcCgoa2V5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIGlmIChrZXkgPT09ICckc2NvcmUnKSB7XG4gICAgICAgICAgICByZXR1cm4gYHRzX3JhbmtfY2QodG9fdHN2ZWN0b3IoJCR7Mn0sICQkezN9Om5hbWUpLCB0b190c3F1ZXJ5KCQkezR9LCAkJHs1fSksIDMyKSBhcyBzY29yZWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJCR7aW5kZXggKyB2YWx1ZXMubGVuZ3RoICsgMX06bmFtZWA7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCk7XG4gICAgICB2YWx1ZXMgPSB2YWx1ZXMuY29uY2F0KGtleXMpO1xuICAgIH1cblxuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBgU0VMRUNUICR7Y29sdW1uc30gRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufSAke3NvcnRQYXR0ZXJufSAke2xpbWl0UGF0dGVybn0gJHtza2lwUGF0dGVybn1gO1xuICAgIGNvbnN0IHFzID0gZXhwbGFpbiA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KSA6IG9yaWdpbmFsUXVlcnk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gUXVlcnkgb24gbm9uIGV4aXN0aW5nIHRhYmxlLCBkb24ndCBjcmFzaFxuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoZXhwbGFpbikge1xuICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4gdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBDb252ZXJ0cyBmcm9tIGEgcG9zdGdyZXMtZm9ybWF0IG9iamVjdCB0byBhIFJFU1QtZm9ybWF0IG9iamVjdC5cbiAgLy8gRG9lcyBub3Qgc3RyaXAgb3V0IGFueXRoaW5nIGJhc2VkIG9uIGEgbGFjayBvZiBhdXRoZW50aWNhdGlvbi5cbiAgcG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgc2NoZW1hOiBhbnkpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJyAmJiBvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkTmFtZV0sXG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICBsYXRpdHVkZTogb2JqZWN0W2ZpZWxkTmFtZV0ueSxcbiAgICAgICAgICBsb25naXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLngsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBsZXQgY29vcmRzID0gbmV3IFN0cmluZyhvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgIGNvb3JkcyA9IGNvb3Jkcy5zdWJzdHJpbmcoMiwgY29vcmRzLmxlbmd0aCAtIDIpLnNwbGl0KCcpLCgnKTtcbiAgICAgICAgY29uc3QgdXBkYXRlZENvb3JkcyA9IGNvb3Jkcy5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgIHJldHVybiBbcGFyc2VGbG9hdChwb2ludC5zcGxpdCgnLCcpWzFdKSwgcGFyc2VGbG9hdChwb2ludC5zcGxpdCgnLCcpWzBdKV07XG4gICAgICAgIH0pO1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdQb2x5Z29uJyxcbiAgICAgICAgICBjb29yZGluYXRlczogdXBkYXRlZENvb3JkcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgICAgIG5hbWU6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIC8vVE9ETzogcmVtb3ZlIHRoaXMgcmVsaWFuY2Ugb24gdGhlIG1vbmdvIGZvcm1hdC4gREIgYWRhcHRlciBzaG91bGRuJ3Qga25vdyB0aGVyZSBpcyBhIGRpZmZlcmVuY2UgYmV0d2VlbiBjcmVhdGVkIGF0IGFuZCBhbnkgb3RoZXIgZGF0ZSBmaWVsZC5cbiAgICBpZiAob2JqZWN0LmNyZWF0ZWRBdCkge1xuICAgICAgb2JqZWN0LmNyZWF0ZWRBdCA9IG9iamVjdC5jcmVhdGVkQXQudG9JU09TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC51cGRhdGVkQXQpIHtcbiAgICAgIG9iamVjdC51cGRhdGVkQXQgPSBvYmplY3QudXBkYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QuZXhwaXJlc0F0KSB7XG4gICAgICBvYmplY3QuZXhwaXJlc0F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuZXhwaXJlc0F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0KSB7XG4gICAgICBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICAgIGlzbzogb2JqZWN0W2ZpZWxkTmFtZV0udG9JU09TdHJpbmcoKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBhc3luYyBlbnN1cmVVbmlxdWVuZXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgY29uc3RyYWludE5hbWUgPSBgJHtjbGFzc05hbWV9X3VuaXF1ZV8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYCk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFVOSVFVRSBJTkRFWCBJRiBOT1QgRVhJU1RTICQyOm5hbWUgT04gJDE6bmFtZSgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKHFzLCBbY2xhc3NOYW1lLCBjb25zdHJhaW50TmFtZSwgLi4uZmllbGROYW1lc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSkpIHtcbiAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGNvbnN0cmFpbnROYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIENhc3QgdGhlIGVycm9yIGludG8gdGhlIHByb3BlciBwYXJzZSBlcnJvclxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGNvdW50LlxuICBhc3luYyBjb3VudChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICByZWFkUHJlZmVyZW5jZT86IHN0cmluZyxcbiAgICBlc3RpbWF0ZT86IGJvb2xlYW4gPSB0cnVlXG4gICkge1xuICAgIGRlYnVnKCdjb3VudCcpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiAyLFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgbGV0IHFzID0gJyc7XG5cbiAgICBpZiAod2hlcmUucGF0dGVybi5sZW5ndGggPiAwIHx8ICFlc3RpbWF0ZSkge1xuICAgICAgcXMgPSBgU0VMRUNUIGNvdW50KCopIEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIH0gZWxzZSB7XG4gICAgICBxcyA9ICdTRUxFQ1QgcmVsdHVwbGVzIEFTIGFwcHJveGltYXRlX3Jvd19jb3VudCBGUk9NIHBnX2NsYXNzIFdIRVJFIHJlbG5hbWUgPSAkMSc7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLm9uZShxcywgdmFsdWVzLCBhID0+IHtcbiAgICAgICAgaWYgKGEuYXBwcm94aW1hdGVfcm93X2NvdW50ID09IG51bGwgfHwgYS5hcHByb3hpbWF0ZV9yb3dfY291bnQgPT0gLTEpIHtcbiAgICAgICAgICByZXR1cm4gIWlzTmFOKCthLmNvdW50KSA/ICthLmNvdW50IDogMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gK2EuYXBwcm94aW1hdGVfcm93X2NvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBkaXN0aW5jdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBxdWVyeTogUXVlcnlUeXBlLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIGRlYnVnKCdkaXN0aW5jdCcpO1xuICAgIGxldCBmaWVsZCA9IGZpZWxkTmFtZTtcbiAgICBsZXQgY29sdW1uID0gZmllbGROYW1lO1xuICAgIGNvbnN0IGlzTmVzdGVkID0gZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwO1xuICAgIGlmIChpc05lc3RlZCkge1xuICAgICAgZmllbGQgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICBjb2x1bW4gPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbiAgICB9XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGlzUG9pbnRlckZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcic7XG4gICAgY29uc3QgdmFsdWVzID0gW2ZpZWxkLCBjb2x1bW4sIGNsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCB0cmFuc2Zvcm1lciA9IGlzQXJyYXlGaWVsZCA/ICdqc29uYl9hcnJheV9lbGVtZW50cycgOiAnT04nO1xuICAgIGxldCBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6bmFtZSkgJDI6bmFtZSBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpyYXcpICQyOnJhdyBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yKSB7XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoIWlzTmVzdGVkKSB7XG4gICAgICAgICAgcmVzdWx0cyA9IHJlc3VsdHMuZmlsdGVyKG9iamVjdCA9PiBvYmplY3RbZmllbGRdICE9PSBudWxsKTtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgIGlmICghaXNQb2ludGVyRmllbGQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdFtmaWVsZF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGRdLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjaGlsZCA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzFdO1xuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IG9iamVjdFtjb2x1bW5dW2NoaWxkXSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PlxuICAgICAgICByZXN1bHRzLm1hcChvYmplY3QgPT4gdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpXG4gICAgICApO1xuICB9XG5cbiAgYXN5bmMgYWdncmVnYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogYW55LFxuICAgIHBpcGVsaW5lOiBhbnksXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgaGludDogP21peGVkLFxuICAgIGV4cGxhaW4/OiBib29sZWFuXG4gICkge1xuICAgIGRlYnVnKCdhZ2dyZWdhdGUnKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXg6IG51bWJlciA9IDI7XG4gICAgbGV0IGNvbHVtbnM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGNvdW50RmllbGQgPSBudWxsO1xuICAgIGxldCBncm91cFZhbHVlcyA9IG51bGw7XG4gICAgbGV0IHdoZXJlUGF0dGVybiA9ICcnO1xuICAgIGxldCBsaW1pdFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc2tpcFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBsZXQgZ3JvdXBQYXR0ZXJuID0gJyc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaXBlbGluZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3Qgc3RhZ2UgPSBwaXBlbGluZVtpXTtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRncm91cFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUgIT09ICcnKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTIFwib2JqZWN0SWRcImApO1xuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ19pZCcgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiBPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICBncm91cFZhbHVlcyA9IHZhbHVlO1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBCeUZpZWxkcyA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBhbGlhcyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2FsaWFzXSA9PT0gJ3N0cmluZycgJiYgdmFsdWVbYWxpYXNdKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gdHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWVbYWxpYXNdKTtcbiAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgZ3JvdXBCeUZpZWxkcy5wdXNoKGBcIiR7c291cmNlfVwiYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHNvdXJjZSwgYWxpYXMpO1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWUgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcGVyYXRpb24gPSBPYmplY3Qua2V5cyh2YWx1ZVthbGlhc10pWzBdO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXVtvcGVyYXRpb25dKTtcbiAgICAgICAgICAgICAgICBpZiAobW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl0pIHtcbiAgICAgICAgICAgICAgICAgIGlmICghZ3JvdXBCeUZpZWxkcy5pbmNsdWRlcyhgXCIke3NvdXJjZX1cImApKSB7XG4gICAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICBgRVhUUkFDVCgke21vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dXG4gICAgICAgICAgICAgICAgICAgIH0gRlJPTSAkJHtpbmRleH06bmFtZSBBVCBUSU1FIFpPTkUgJ1VUQycpOjppbnRlZ2VyIEFTICQke2luZGV4ICsgMX06bmFtZWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9OnJhd2A7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChncm91cEJ5RmllbGRzLmpvaW4oKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuJHN1bSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlLiRzdW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBTVU0oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRzdW0pLCBmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb3VudEZpZWxkID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBDT1VOVCgqKSBBUyAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1heCkge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1BWCgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtYXgpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1pbikge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1JTigkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtaW4pLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJGF2Zykge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYEFWRygkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRhdmcpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2x1bW5zLnB1c2goJyonKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICBpZiAoY29sdW1ucy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgY29sdW1ucyA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRwcm9qZWN0W2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IDEgfHwgdmFsdWUgPT09IHRydWUpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5zID0gW107XG4gICAgICAgIGNvbnN0IG9yT3JBbmQgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2UuJG1hdGNoLCAnJG9yJylcbiAgICAgICAgICA/ICcgT1IgJ1xuICAgICAgICAgIDogJyBBTkQgJztcblxuICAgICAgICBpZiAoc3RhZ2UuJG1hdGNoLiRvcikge1xuICAgICAgICAgIGNvbnN0IGNvbGxhcHNlID0ge307XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLiRvci5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZWxlbWVudCkge1xuICAgICAgICAgICAgICBjb2xsYXBzZVtrZXldID0gZWxlbWVudFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHN0YWdlLiRtYXRjaCA9IGNvbGxhcHNlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAobGV0IGZpZWxkIGluIHN0YWdlLiRtYXRjaCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJG1hdGNoW2ZpZWxkXTtcbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnKSB7XG4gICAgICAgICAgICBmaWVsZCA9ICdvYmplY3RJZCc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IG1hdGNoUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgICAgICAgIGlmICh2YWx1ZVtjbXBdKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICAgICAgICBtYXRjaFBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkLCB0b1Bvc3RncmVzVmFsdWUodmFsdWVbY21wXSkpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGlmIChtYXRjaFBhdHRlcm5zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgke21hdGNoUGF0dGVybnMuam9pbignIEFORCAnKX0pYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIG1hdGNoUGF0dGVybnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkLCB2YWx1ZSk7XG4gICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB3aGVyZVBhdHRlcm4gPSBwYXR0ZXJucy5sZW5ndGggPiAwID8gYFdIRVJFICR7cGF0dGVybnMuam9pbihgICR7b3JPckFuZH0gYCl9YCA6ICcnO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRsaW1pdCkge1xuICAgICAgICBsaW1pdFBhdHRlcm4gPSBgTElNSVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJGxpbWl0KTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc2tpcCkge1xuICAgICAgICBza2lwUGF0dGVybiA9IGBPRkZTRVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJHNraXApO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRzb3J0KSB7XG4gICAgICAgIGNvbnN0IHNvcnQgPSBzdGFnZS4kc29ydDtcbiAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHNvcnQpO1xuICAgICAgICBjb25zdCBzb3J0aW5nID0ga2V5c1xuICAgICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gc29ydFtrZXldID09PSAxID8gJ0FTQycgOiAnREVTQyc7XG4gICAgICAgICAgICBjb25zdCBvcmRlciA9IGAkJHtpbmRleH06bmFtZSAke3RyYW5zZm9ybWVyfWA7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgcmV0dXJuIG9yZGVyO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmpvaW4oKTtcbiAgICAgICAgdmFsdWVzLnB1c2goLi4ua2V5cyk7XG4gICAgICAgIHNvcnRQYXR0ZXJuID0gc29ydCAhPT0gdW5kZWZpbmVkICYmIHNvcnRpbmcubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChncm91cFBhdHRlcm4pIHtcbiAgICAgIGNvbHVtbnMuZm9yRWFjaCgoZSwgaSwgYSkgPT4ge1xuICAgICAgICBpZiAoZSAmJiBlLnRyaW0oKSA9PT0gJyonKSB7XG4gICAgICAgICAgYVtpXSA9ICcnO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnNcbiAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgIC5qb2luKCl9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtza2lwUGF0dGVybn0gJHtncm91cFBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluID8gdGhpcy5jcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KG9yaWdpbmFsUXVlcnkpIDogb3JpZ2luYWxRdWVyeTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgdmFsdWVzKS50aGVuKGEgPT4ge1xuICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgcmV0dXJuIGE7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHRzID0gYS5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdvYmplY3RJZCcpKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSB7fTtcbiAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBncm91cFZhbHVlcykge1xuICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkW2tleV0gPSByZXN1bHRba2V5XTtcbiAgICAgICAgICAgIGRlbGV0ZSByZXN1bHRba2V5XTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvdW50RmllbGQpIHtcbiAgICAgICAgICByZXN1bHRbY291bnRGaWVsZF0gPSBwYXJzZUludChyZXN1bHRbY291bnRGaWVsZF0sIDEwKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbih7IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgfTogYW55KSB7XG4gICAgLy8gVE9ETzogVGhpcyBtZXRob2QgbmVlZHMgdG8gYmUgcmV3cml0dGVuIHRvIG1ha2UgcHJvcGVyIHVzZSBvZiBjb25uZWN0aW9ucyAoQHZpdGFseS10KVxuICAgIGRlYnVnKCdwZXJmb3JtSW5pdGlhbGl6YXRpb24nKTtcbiAgICBhd2FpdCB0aGlzLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKCk7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzLm1hcChzY2hlbWEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlVGFibGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKVxuICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIHx8XG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5zY2hlbWFVcGdyYWRlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSkpO1xuICAgIH0pO1xuICAgIHByb21pc2VzLnB1c2godGhpcy5fbGlzdGVuVG9TY2hlbWEoKSk7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2xpZW50LnR4KCdwZXJmb3JtLWluaXRpYWxpemF0aW9uJywgYXN5bmMgdCA9PiB7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5taXNjLmpzb25PYmplY3RTZXRLZXlzKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmFkZCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGRVbmlxdWUpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkucmVtb3ZlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zQWxsKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zQWxsUmVnZXgpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuY29udGFpbnMpO1xuICAgICAgICAgIHJldHVybiB0LmN0eDtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oY3R4ID0+IHtcbiAgICAgICAgZGVidWcoYGluaXRpYWxpemF0aW9uRG9uZSBpbiAke2N0eC5kdXJhdGlvbn1gKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46ID9hbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+XG4gICAgICB0LmJhdGNoKFxuICAgICAgICBpbmRleGVzLm1hcChpID0+IHtcbiAgICAgICAgICByZXR1cm4gdC5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgICAgICAgaS5uYW1lLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaS5rZXksXG4gICAgICAgICAgXSk7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCAoY29ubiB8fCB0aGlzLl9jbGllbnQpLm5vbmUoJ0NSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLCBbXG4gICAgICBmaWVsZE5hbWUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0eXBlLFxuICAgIF0pO1xuICB9XG5cbiAgYXN5bmMgZHJvcEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSwgY29ubjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcXVlcmllcyA9IGluZGV4ZXMubWFwKGkgPT4gKHtcbiAgICAgIHF1ZXJ5OiAnRFJPUCBJTkRFWCAkMTpuYW1lJyxcbiAgICAgIHZhbHVlczogaSxcbiAgICB9KSk7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+IHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgfVxuXG4gIGFzeW5jIGdldEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxcyA9ICdTRUxFQ1QgKiBGUk9NIHBnX2luZGV4ZXMgV0hFUkUgdGFibGVuYW1lID0gJHtjbGFzc05hbWV9JztcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgeyBjbGFzc05hbWUgfSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBVc2VkIGZvciB0ZXN0aW5nIHB1cnBvc2VzXG4gIGFzeW5jIHVwZGF0ZUVzdGltYXRlZENvdW50KGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKCdBTkFMWVpFICQxOm5hbWUnLCBbY2xhc3NOYW1lXSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZXNzaW9uID0ge307XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXN1bHQgPSB0aGlzLl9jbGllbnQudHgodCA9PiB7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgPSB0O1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICAgIH0pO1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaCA9IFtdO1xuICAgICAgICByZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnByb21pc2U7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZXNzaW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0O1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0LmNhdGNoKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChQcm9taXNlLnJlamVjdCgpKTtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSW5kZXgoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIGZpZWxkTmFtZXM6IHN0cmluZ1tdLFxuICAgIGluZGV4TmFtZTogP3N0cmluZyxcbiAgICBjYXNlSW5zZW5zaXRpdmU6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zPzogT2JqZWN0ID0ge31cbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgZGVmYXVsdEluZGV4TmFtZSA9IGBwYXJzZV9kZWZhdWx0XyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID1cbiAgICAgIGluZGV4TmFtZSAhPSBudWxsID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHsgbmFtZTogZGVmYXVsdEluZGV4TmFtZSB9O1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYGxvd2VyKCQke2luZGV4ICsgM306bmFtZSkgdmFyY2hhcl9wYXR0ZXJuX29wc2ApXG4gICAgICA6IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYCk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgY29uc3Qgc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA9XG4gICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA6IGZhbHNlO1xuICAgIGlmIChzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uKSB7XG4gICAgICBhd2FpdCB0aGlzLmVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucyk7XG4gICAgfVxuICAgIGF3YWl0IGNvbm4ubm9uZShxcywgW2luZGV4TmFtZU9wdGlvbnMubmFtZSwgY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGluZGV4TmFtZU9wdGlvbnMubmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGVsZXRlSWRlbXBvdGVuY3lGdW5jdGlvbihvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBxcyA9ICdEUk9QIEZVTkNUSU9OIElGIEVYSVNUUyBpZGVtcG90ZW5jeV9kZWxldGVfZXhwaXJlZF9yZWNvcmRzKCknO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMpLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyhvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCB0dGxPcHRpb25zID0gb3B0aW9ucy50dGwgIT09IHVuZGVmaW5lZCA/IGAke29wdGlvbnMudHRsfSBzZWNvbmRzYCA6ICc2MCBzZWNvbmRzJztcbiAgICBjb25zdCBxcyA9XG4gICAgICAnQ1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04gaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpIFJFVFVSTlMgdm9pZCBMQU5HVUFHRSBwbHBnc3FsIEFTICQkIEJFR0lOIERFTEVURSBGUk9NIFwiX0lkZW1wb3RlbmN5XCIgV0hFUkUgZXhwaXJlIDwgTk9XKCkgLSBJTlRFUlZBTCAkMTsgRU5EOyAkJDsnO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMsIFt0dGxPcHRpb25zXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29udmVydFBvbHlnb25Ub1NRTChwb2x5Z29uKSB7XG4gIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgUG9seWdvbiBtdXN0IGhhdmUgYXQgbGVhc3QgMyB2YWx1ZXNgKTtcbiAgfVxuICBpZiAoXG4gICAgcG9seWdvblswXVswXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzBdIHx8XG4gICAgcG9seWdvblswXVsxXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzFdXG4gICkge1xuICAgIHBvbHlnb24ucHVzaChwb2x5Z29uWzBdKTtcbiAgfVxuICBjb25zdCB1bmlxdWUgPSBwb2x5Z29uLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgbGV0IGZvdW5kSW5kZXggPSAtMTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgaWYgKHB0WzBdID09PSBpdGVtWzBdICYmIHB0WzFdID09PSBpdGVtWzFdKSB7XG4gICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICB9KTtcbiAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICk7XG4gIH1cbiAgY29uc3QgcG9pbnRzID0gcG9seWdvblxuICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBhcnNlRmxvYXQocG9pbnRbMV0pLCBwYXJzZUZsb2F0KHBvaW50WzBdKSk7XG4gICAgICByZXR1cm4gYCgke3BvaW50WzFdfSwgJHtwb2ludFswXX0pYDtcbiAgICB9KVxuICAgIC5qb2luKCcsICcpO1xuICByZXR1cm4gYCgke3BvaW50c30pYDtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCkge1xuICBpZiAoIXJlZ2V4LmVuZHNXaXRoKCdcXG4nKSkge1xuICAgIHJlZ2V4ICs9ICdcXG4nO1xuICB9XG5cbiAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIGNvbW1lbnRzXG4gIHJldHVybiAoXG4gICAgcmVnZXhcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSkjLipcXG4vZ2ltLCAnJDEnKVxuICAgICAgLy8gcmVtb3ZlIGxpbmVzIHN0YXJ0aW5nIHdpdGggYSBjb21tZW50XG4gICAgICAucmVwbGFjZSgvXiMuKlxcbi9naW0sICcnKVxuICAgICAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIHdoaXRlc3BhY2VcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSlcXHMrL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSB3aGl0ZXNwYWNlIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBsaW5lXG4gICAgICAucmVwbGFjZSgvXlxccysvLCAnJylcbiAgICAgIC50cmltKClcbiAgKTtcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1JlZ2V4UGF0dGVybihzKSB7XG4gIGlmIChzICYmIHMuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgLy8gcmVnZXggZm9yIHN0YXJ0c1dpdGhcbiAgICByZXR1cm4gJ14nICsgbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDEpKTtcbiAgfSBlbHNlIGlmIChzICYmIHMuZW5kc1dpdGgoJyQnKSkge1xuICAgIC8vIHJlZ2V4IGZvciBlbmRzV2l0aFxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMuc2xpY2UoMCwgcy5sZW5ndGggLSAxKSkgKyAnJCc7XG4gIH1cblxuICAvLyByZWdleCBmb3IgY29udGFpbnNcbiAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocyk7XG59XG5cbmZ1bmN0aW9uIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlKSB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCAhdmFsdWUuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9cXF5cXFxcUS4qXFxcXEUvKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn1cblxuZnVuY3Rpb24gaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpIHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0uJHJlZ2V4KTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXS4kcmVnZXgpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgodmFsdWVzKSB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gaXNTdGFydHNXaXRoUmVnZXgodmFsdWUuJHJlZ2V4KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpIHtcbiAgcmV0dXJuIHJlbWFpbmluZ1xuICAgIC5zcGxpdCgnJylcbiAgICAubWFwKGMgPT4ge1xuICAgICAgY29uc3QgcmVnZXggPSBSZWdFeHAoJ1swLTkgXXxcXFxccHtMfScsICd1Jyk7IC8vIFN1cHBvcnQgYWxsIHVuaWNvZGUgbGV0dGVyIGNoYXJzXG4gICAgICBpZiAoYy5tYXRjaChyZWdleCkgIT09IG51bGwpIHtcbiAgICAgICAgLy8gZG9uJ3QgZXNjYXBlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzXG4gICAgICAgIHJldHVybiBjO1xuICAgICAgfVxuICAgICAgLy8gZXNjYXBlIGV2ZXJ5dGhpbmcgZWxzZSAoc2luZ2xlIHF1b3RlcyB3aXRoIHNpbmdsZSBxdW90ZXMsIGV2ZXJ5dGhpbmcgZWxzZSB3aXRoIGEgYmFja3NsYXNoKVxuICAgICAgcmV0dXJuIGMgPT09IGAnYCA/IGAnJ2AgOiBgXFxcXCR7Y31gO1xuICAgIH0pXG4gICAgLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBsaXRlcmFsaXplUmVnZXhQYXJ0KHM6IHN0cmluZykge1xuICBjb25zdCBtYXRjaGVyMSA9IC9cXFxcUSgoPyFcXFxcRSkuKilcXFxcRSQvO1xuICBjb25zdCByZXN1bHQxOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIxKTtcbiAgaWYgKHJlc3VsdDEgJiYgcmVzdWx0MS5sZW5ndGggPiAxICYmIHJlc3VsdDEuaW5kZXggPiAtMSkge1xuICAgIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgYW5kIGFuIGVuZCBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cmluZygwLCByZXN1bHQxLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQxWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gcHJvY2VzcyByZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgY29uc3QgbWF0Y2hlcjIgPSAvXFxcXFEoKD8hXFxcXEUpLiopJC87XG4gIGNvbnN0IHJlc3VsdDI6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjIpO1xuICBpZiAocmVzdWx0MiAmJiByZXN1bHQyLmxlbmd0aCA+IDEgJiYgcmVzdWx0Mi5pbmRleCA+IC0xKSB7XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHJpbmcoMCwgcmVzdWx0Mi5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MlsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHJlbW92ZSBhbGwgaW5zdGFuY2VzIG9mIFxcUSBhbmQgXFxFIGZyb20gdGhlIHJlbWFpbmluZyB0ZXh0ICYgZXNjYXBlIHNpbmdsZSBxdW90ZXNcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxFKS8sICckMScpXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcUSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC9eXFxcXEUvLCAnJylcbiAgICAucmVwbGFjZSgvXlxcXFxRLywgJycpXG4gICAgLnJlcGxhY2UoLyhbXiddKScvLCBgJDEnJ2ApXG4gICAgLnJlcGxhY2UoL14nKFteJ10pLywgYCcnJDFgKTtcbn1cblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnO1xuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0E7QUFFQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQW1EO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUVuRCxNQUFNQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztBQUV2QyxNQUFNQyxpQ0FBaUMsR0FBRyxPQUFPO0FBQ2pELE1BQU1DLDhCQUE4QixHQUFHLE9BQU87QUFDOUMsTUFBTUMsNEJBQTRCLEdBQUcsT0FBTztBQUM1QyxNQUFNQywwQkFBMEIsR0FBRyxPQUFPO0FBQzFDLE1BQU1DLGlDQUFpQyxHQUFHLE9BQU87QUFDakQsTUFBTUMsTUFBTSxHQUFHTixPQUFPLENBQUMsaUJBQWlCLENBQUM7QUFFekMsTUFBTU8sS0FBSyxHQUFHLFVBQVUsR0FBR0MsSUFBUyxFQUFFO0VBQ3BDQSxJQUFJLEdBQUcsQ0FBQyxNQUFNLEdBQUdDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDQyxNQUFNLENBQUNGLElBQUksQ0FBQ0csS0FBSyxDQUFDLENBQUMsRUFBRUgsSUFBSSxDQUFDSSxNQUFNLENBQUMsQ0FBQztFQUNqRSxNQUFNQyxHQUFHLEdBQUdQLE1BQU0sQ0FBQ1EsU0FBUyxFQUFFO0VBQzlCRCxHQUFHLENBQUNOLEtBQUssQ0FBQ1EsS0FBSyxDQUFDRixHQUFHLEVBQUVMLElBQUksQ0FBQztBQUM1QixDQUFDO0FBRUQsTUFBTVEsdUJBQXVCLEdBQUdDLElBQUksSUFBSTtFQUN0QyxRQUFRQSxJQUFJLENBQUNBLElBQUk7SUFDZixLQUFLLFFBQVE7TUFDWCxPQUFPLE1BQU07SUFDZixLQUFLLE1BQU07TUFDVCxPQUFPLDBCQUEwQjtJQUNuQyxLQUFLLFFBQVE7TUFDWCxPQUFPLE9BQU87SUFDaEIsS0FBSyxNQUFNO01BQ1QsT0FBTyxNQUFNO0lBQ2YsS0FBSyxTQUFTO01BQ1osT0FBTyxTQUFTO0lBQ2xCLEtBQUssU0FBUztNQUNaLE9BQU8sTUFBTTtJQUNmLEtBQUssUUFBUTtNQUNYLE9BQU8sa0JBQWtCO0lBQzNCLEtBQUssVUFBVTtNQUNiLE9BQU8sT0FBTztJQUNoQixLQUFLLE9BQU87TUFDVixPQUFPLE9BQU87SUFDaEIsS0FBSyxTQUFTO01BQ1osT0FBTyxTQUFTO0lBQ2xCLEtBQUssT0FBTztNQUNWLElBQUlBLElBQUksQ0FBQ0MsUUFBUSxJQUFJRCxJQUFJLENBQUNDLFFBQVEsQ0FBQ0QsSUFBSSxLQUFLLFFBQVEsRUFBRTtRQUNwRCxPQUFPLFFBQVE7TUFDakIsQ0FBQyxNQUFNO1FBQ0wsT0FBTyxPQUFPO01BQ2hCO0lBQ0Y7TUFDRSxNQUFPLGVBQWNFLElBQUksQ0FBQ0MsU0FBUyxDQUFDSCxJQUFJLENBQUUsTUFBSztFQUFDO0FBRXRELENBQUM7QUFFRCxNQUFNSSx3QkFBd0IsR0FBRztFQUMvQkMsR0FBRyxFQUFFLEdBQUc7RUFDUkMsR0FBRyxFQUFFLEdBQUc7RUFDUkMsSUFBSSxFQUFFLElBQUk7RUFDVkMsSUFBSSxFQUFFO0FBQ1IsQ0FBQztBQUVELE1BQU1DLHdCQUF3QixHQUFHO0VBQy9CQyxXQUFXLEVBQUUsS0FBSztFQUNsQkMsVUFBVSxFQUFFLEtBQUs7RUFDakJDLFVBQVUsRUFBRSxLQUFLO0VBQ2pCQyxhQUFhLEVBQUUsUUFBUTtFQUN2QkMsWUFBWSxFQUFFLFNBQVM7RUFDdkJDLEtBQUssRUFBRSxNQUFNO0VBQ2JDLE9BQU8sRUFBRSxRQUFRO0VBQ2pCQyxPQUFPLEVBQUUsUUFBUTtFQUNqQkMsWUFBWSxFQUFFLGNBQWM7RUFDNUJDLE1BQU0sRUFBRSxPQUFPO0VBQ2ZDLEtBQUssRUFBRSxNQUFNO0VBQ2JDLEtBQUssRUFBRTtBQUNULENBQUM7QUFFRCxNQUFNQyxlQUFlLEdBQUdDLEtBQUssSUFBSTtFQUMvQixJQUFJLE9BQU9BLEtBQUssS0FBSyxRQUFRLEVBQUU7SUFDN0IsSUFBSUEsS0FBSyxDQUFDQyxNQUFNLEtBQUssTUFBTSxFQUFFO01BQzNCLE9BQU9ELEtBQUssQ0FBQ0UsR0FBRztJQUNsQjtJQUNBLElBQUlGLEtBQUssQ0FBQ0MsTUFBTSxLQUFLLE1BQU0sRUFBRTtNQUMzQixPQUFPRCxLQUFLLENBQUNHLElBQUk7SUFDbkI7RUFDRjtFQUNBLE9BQU9ILEtBQUs7QUFDZCxDQUFDO0FBRUQsTUFBTUksdUJBQXVCLEdBQUdKLEtBQUssSUFBSTtFQUN2QyxNQUFNSyxhQUFhLEdBQUdOLGVBQWUsQ0FBQ0MsS0FBSyxDQUFDO0VBQzVDLElBQUlNLFFBQVE7RUFDWixRQUFRLE9BQU9ELGFBQWE7SUFDMUIsS0FBSyxRQUFRO01BQ1hDLFFBQVEsR0FBRyxrQkFBa0I7TUFDN0I7SUFDRixLQUFLLFNBQVM7TUFDWkEsUUFBUSxHQUFHLFNBQVM7TUFDcEI7SUFDRjtNQUNFQSxRQUFRLEdBQUdDLFNBQVM7RUFBQztFQUV6QixPQUFPRCxRQUFRO0FBQ2pCLENBQUM7QUFFRCxNQUFNRSxjQUFjLEdBQUdSLEtBQUssSUFBSTtFQUM5QixJQUFJLE9BQU9BLEtBQUssS0FBSyxRQUFRLElBQUlBLEtBQUssQ0FBQ0MsTUFBTSxLQUFLLFNBQVMsRUFBRTtJQUMzRCxPQUFPRCxLQUFLLENBQUNTLFFBQVE7RUFDdkI7RUFDQSxPQUFPVCxLQUFLO0FBQ2QsQ0FBQzs7QUFFRDtBQUNBLE1BQU1VLFNBQVMsR0FBR0MsTUFBTSxDQUFDQyxNQUFNLENBQUM7RUFDOUJDLElBQUksRUFBRSxDQUFDLENBQUM7RUFDUkMsR0FBRyxFQUFFLENBQUMsQ0FBQztFQUNQQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0VBQ1RDLE1BQU0sRUFBRSxDQUFDLENBQUM7RUFDVkMsTUFBTSxFQUFFLENBQUMsQ0FBQztFQUNWQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0VBQ1ZDLFFBQVEsRUFBRSxDQUFDLENBQUM7RUFDWkMsZUFBZSxFQUFFLENBQUM7QUFDcEIsQ0FBQyxDQUFDO0FBRUYsTUFBTUMsV0FBVyxHQUFHVixNQUFNLENBQUNDLE1BQU0sQ0FBQztFQUNoQ0MsSUFBSSxFQUFFO0lBQUUsR0FBRyxFQUFFO0VBQUssQ0FBQztFQUNuQkMsR0FBRyxFQUFFO0lBQUUsR0FBRyxFQUFFO0VBQUssQ0FBQztFQUNsQkMsS0FBSyxFQUFFO0lBQUUsR0FBRyxFQUFFO0VBQUssQ0FBQztFQUNwQkMsTUFBTSxFQUFFO0lBQUUsR0FBRyxFQUFFO0VBQUssQ0FBQztFQUNyQkMsTUFBTSxFQUFFO0lBQUUsR0FBRyxFQUFFO0VBQUssQ0FBQztFQUNyQkMsTUFBTSxFQUFFO0lBQUUsR0FBRyxFQUFFO0VBQUssQ0FBQztFQUNyQkMsUUFBUSxFQUFFO0lBQUUsR0FBRyxFQUFFO0VBQUssQ0FBQztFQUN2QkMsZUFBZSxFQUFFO0lBQUUsR0FBRyxFQUFFO0VBQUc7QUFDN0IsQ0FBQyxDQUFDO0FBRUYsTUFBTUUsYUFBYSxHQUFHQyxNQUFNLElBQUk7RUFDOUIsSUFBSUEsTUFBTSxDQUFDQyxTQUFTLEtBQUssT0FBTyxFQUFFO0lBQ2hDLE9BQU9ELE1BQU0sQ0FBQ0UsTUFBTSxDQUFDQyxnQkFBZ0I7RUFDdkM7RUFDQSxJQUFJSCxNQUFNLENBQUNFLE1BQU0sRUFBRTtJQUNqQixPQUFPRixNQUFNLENBQUNFLE1BQU0sQ0FBQ0UsTUFBTTtJQUMzQixPQUFPSixNQUFNLENBQUNFLE1BQU0sQ0FBQ0csTUFBTTtFQUM3QjtFQUNBLElBQUlDLElBQUksR0FBR1IsV0FBVztFQUN0QixJQUFJRSxNQUFNLENBQUNPLHFCQUFxQixFQUFFO0lBQ2hDRCxJQUFJLG1DQUFRbkIsU0FBUyxHQUFLYSxNQUFNLENBQUNPLHFCQUFxQixDQUFFO0VBQzFEO0VBQ0EsSUFBSUMsT0FBTyxHQUFHLENBQUMsQ0FBQztFQUNoQixJQUFJUixNQUFNLENBQUNRLE9BQU8sRUFBRTtJQUNsQkEsT0FBTyxxQkFBUVIsTUFBTSxDQUFDUSxPQUFPLENBQUU7RUFDakM7RUFDQSxPQUFPO0lBQ0xQLFNBQVMsRUFBRUQsTUFBTSxDQUFDQyxTQUFTO0lBQzNCQyxNQUFNLEVBQUVGLE1BQU0sQ0FBQ0UsTUFBTTtJQUNyQksscUJBQXFCLEVBQUVELElBQUk7SUFDM0JFO0VBQ0YsQ0FBQztBQUNILENBQUM7QUFFRCxNQUFNQyxnQkFBZ0IsR0FBR1QsTUFBTSxJQUFJO0VBQ2pDLElBQUksQ0FBQ0EsTUFBTSxFQUFFO0lBQ1gsT0FBT0EsTUFBTTtFQUNmO0VBQ0FBLE1BQU0sQ0FBQ0UsTUFBTSxHQUFHRixNQUFNLENBQUNFLE1BQU0sSUFBSSxDQUFDLENBQUM7RUFDbkNGLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDRSxNQUFNLEdBQUc7SUFBRWxELElBQUksRUFBRSxPQUFPO0lBQUVDLFFBQVEsRUFBRTtNQUFFRCxJQUFJLEVBQUU7SUFBUztFQUFFLENBQUM7RUFDdEU4QyxNQUFNLENBQUNFLE1BQU0sQ0FBQ0csTUFBTSxHQUFHO0lBQUVuRCxJQUFJLEVBQUUsT0FBTztJQUFFQyxRQUFRLEVBQUU7TUFBRUQsSUFBSSxFQUFFO0lBQVM7RUFBRSxDQUFDO0VBQ3RFLElBQUk4QyxNQUFNLENBQUNDLFNBQVMsS0FBSyxPQUFPLEVBQUU7SUFDaENELE1BQU0sQ0FBQ0UsTUFBTSxDQUFDQyxnQkFBZ0IsR0FBRztNQUFFakQsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUNuRDhDLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDUSxpQkFBaUIsR0FBRztNQUFFeEQsSUFBSSxFQUFFO0lBQVEsQ0FBQztFQUNyRDtFQUNBLE9BQU84QyxNQUFNO0FBQ2YsQ0FBQztBQUVELE1BQU1XLGVBQWUsR0FBR0MsTUFBTSxJQUFJO0VBQ2hDeEIsTUFBTSxDQUFDeUIsSUFBSSxDQUFDRCxNQUFNLENBQUMsQ0FBQ0UsT0FBTyxDQUFDQyxTQUFTLElBQUk7SUFDdkMsSUFBSUEsU0FBUyxDQUFDQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUU7TUFDL0IsTUFBTUMsVUFBVSxHQUFHRixTQUFTLENBQUNHLEtBQUssQ0FBQyxHQUFHLENBQUM7TUFDdkMsTUFBTUMsS0FBSyxHQUFHRixVQUFVLENBQUNHLEtBQUssRUFBRTtNQUNoQ1IsTUFBTSxDQUFDTyxLQUFLLENBQUMsR0FBR1AsTUFBTSxDQUFDTyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7TUFDbkMsSUFBSUUsVUFBVSxHQUFHVCxNQUFNLENBQUNPLEtBQUssQ0FBQztNQUM5QixJQUFJRyxJQUFJO01BQ1IsSUFBSTdDLEtBQUssR0FBR21DLE1BQU0sQ0FBQ0csU0FBUyxDQUFDO01BQzdCLElBQUl0QyxLQUFLLElBQUlBLEtBQUssQ0FBQzhDLElBQUksS0FBSyxRQUFRLEVBQUU7UUFDcEM5QyxLQUFLLEdBQUdPLFNBQVM7TUFDbkI7TUFDQTtNQUNBLE9BQVFzQyxJQUFJLEdBQUdMLFVBQVUsQ0FBQ0csS0FBSyxFQUFFLEVBQUc7UUFDbEM7UUFDQUMsVUFBVSxDQUFDQyxJQUFJLENBQUMsR0FBR0QsVUFBVSxDQUFDQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDekMsSUFBSUwsVUFBVSxDQUFDcEUsTUFBTSxLQUFLLENBQUMsRUFBRTtVQUMzQndFLFVBQVUsQ0FBQ0MsSUFBSSxDQUFDLEdBQUc3QyxLQUFLO1FBQzFCO1FBQ0E0QyxVQUFVLEdBQUdBLFVBQVUsQ0FBQ0MsSUFBSSxDQUFDO01BQy9CO01BQ0EsT0FBT1YsTUFBTSxDQUFDRyxTQUFTLENBQUM7SUFDMUI7RUFDRixDQUFDLENBQUM7RUFDRixPQUFPSCxNQUFNO0FBQ2YsQ0FBQztBQUVELE1BQU1ZLDZCQUE2QixHQUFHVCxTQUFTLElBQUk7RUFDakQsT0FBT0EsU0FBUyxDQUFDRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUNPLEdBQUcsQ0FBQyxDQUFDQyxJQUFJLEVBQUVDLEtBQUssS0FBSztJQUMvQyxJQUFJQSxLQUFLLEtBQUssQ0FBQyxFQUFFO01BQ2YsT0FBUSxJQUFHRCxJQUFLLEdBQUU7SUFDcEI7SUFDQSxPQUFRLElBQUdBLElBQUssR0FBRTtFQUNwQixDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsTUFBTUUsaUJBQWlCLEdBQUdiLFNBQVMsSUFBSTtFQUNyQyxJQUFJQSxTQUFTLENBQUNDLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRTtJQUNqQyxPQUFRLElBQUdELFNBQVUsR0FBRTtFQUN6QjtFQUNBLE1BQU1FLFVBQVUsR0FBR08sNkJBQTZCLENBQUNULFNBQVMsQ0FBQztFQUMzRCxJQUFJbkMsSUFBSSxHQUFHcUMsVUFBVSxDQUFDckUsS0FBSyxDQUFDLENBQUMsRUFBRXFFLFVBQVUsQ0FBQ3BFLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQ2dGLElBQUksQ0FBQyxJQUFJLENBQUM7RUFDaEVqRCxJQUFJLElBQUksS0FBSyxHQUFHcUMsVUFBVSxDQUFDQSxVQUFVLENBQUNwRSxNQUFNLEdBQUcsQ0FBQyxDQUFDO0VBQ2pELE9BQU8rQixJQUFJO0FBQ2IsQ0FBQztBQUVELE1BQU1rRCx1QkFBdUIsR0FBR2YsU0FBUyxJQUFJO0VBQzNDLElBQUksT0FBT0EsU0FBUyxLQUFLLFFBQVEsRUFBRTtJQUNqQyxPQUFPQSxTQUFTO0VBQ2xCO0VBQ0EsSUFBSUEsU0FBUyxLQUFLLGNBQWMsRUFBRTtJQUNoQyxPQUFPLFdBQVc7RUFDcEI7RUFDQSxJQUFJQSxTQUFTLEtBQUssY0FBYyxFQUFFO0lBQ2hDLE9BQU8sV0FBVztFQUNwQjtFQUNBLE9BQU9BLFNBQVMsQ0FBQ2dCLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDL0IsQ0FBQztBQUVELE1BQU1DLFlBQVksR0FBR3BCLE1BQU0sSUFBSTtFQUM3QixJQUFJLE9BQU9BLE1BQU0sSUFBSSxRQUFRLEVBQUU7SUFDN0IsS0FBSyxNQUFNcUIsR0FBRyxJQUFJckIsTUFBTSxFQUFFO01BQ3hCLElBQUksT0FBT0EsTUFBTSxDQUFDcUIsR0FBRyxDQUFDLElBQUksUUFBUSxFQUFFO1FBQ2xDRCxZQUFZLENBQUNwQixNQUFNLENBQUNxQixHQUFHLENBQUMsQ0FBQztNQUMzQjtNQUVBLElBQUlBLEdBQUcsQ0FBQ0MsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJRCxHQUFHLENBQUNDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRTtRQUMxQyxNQUFNLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUNDLGtCQUFrQixFQUM5QiwwREFBMEQsQ0FDM0Q7TUFDSDtJQUNGO0VBQ0Y7QUFDRixDQUFDOztBQUVEO0FBQ0EsTUFBTUMsbUJBQW1CLEdBQUd0QyxNQUFNLElBQUk7RUFDcEMsTUFBTXVDLElBQUksR0FBRyxFQUFFO0VBQ2YsSUFBSXZDLE1BQU0sRUFBRTtJQUNWWixNQUFNLENBQUN5QixJQUFJLENBQUNiLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDLENBQUNZLE9BQU8sQ0FBQzBCLEtBQUssSUFBSTtNQUMxQyxJQUFJeEMsTUFBTSxDQUFDRSxNQUFNLENBQUNzQyxLQUFLLENBQUMsQ0FBQ3RGLElBQUksS0FBSyxVQUFVLEVBQUU7UUFDNUNxRixJQUFJLENBQUNFLElBQUksQ0FBRSxTQUFRRCxLQUFNLElBQUd4QyxNQUFNLENBQUNDLFNBQVUsRUFBQyxDQUFDO01BQ2pEO0lBQ0YsQ0FBQyxDQUFDO0VBQ0o7RUFDQSxPQUFPc0MsSUFBSTtBQUNiLENBQUM7QUFRRCxNQUFNRyxnQkFBZ0IsR0FBRyxDQUFDO0VBQUUxQyxNQUFNO0VBQUUyQyxLQUFLO0VBQUVoQixLQUFLO0VBQUVpQjtBQUFnQixDQUFDLEtBQWtCO0VBQ25GLE1BQU1DLFFBQVEsR0FBRyxFQUFFO0VBQ25CLElBQUlDLE1BQU0sR0FBRyxFQUFFO0VBQ2YsTUFBTUMsS0FBSyxHQUFHLEVBQUU7RUFFaEIvQyxNQUFNLEdBQUdTLGdCQUFnQixDQUFDVCxNQUFNLENBQUM7RUFDakMsS0FBSyxNQUFNZSxTQUFTLElBQUk0QixLQUFLLEVBQUU7SUFDN0IsTUFBTUssWUFBWSxHQUNoQmhELE1BQU0sQ0FBQ0UsTUFBTSxJQUFJRixNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLElBQUlmLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDYSxTQUFTLENBQUMsQ0FBQzdELElBQUksS0FBSyxPQUFPO0lBQ3hGLE1BQU0rRixxQkFBcUIsR0FBR0osUUFBUSxDQUFDaEcsTUFBTTtJQUM3QyxNQUFNcUcsVUFBVSxHQUFHUCxLQUFLLENBQUM1QixTQUFTLENBQUM7O0lBRW5DO0lBQ0EsSUFBSSxDQUFDZixNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLEVBQUU7TUFDN0I7TUFDQSxJQUFJbUMsVUFBVSxJQUFJQSxVQUFVLENBQUNDLE9BQU8sS0FBSyxLQUFLLEVBQUU7UUFDOUM7TUFDRjtJQUNGO0lBQ0EsTUFBTUMsYUFBYSxHQUFHckMsU0FBUyxDQUFDc0MsS0FBSyxDQUFDLDhCQUE4QixDQUFDO0lBQ3JFLElBQUlELGFBQWEsRUFBRTtNQUNqQjtNQUNBO0lBQ0YsQ0FBQyxNQUFNLElBQUlSLGVBQWUsS0FBSzdCLFNBQVMsS0FBSyxVQUFVLElBQUlBLFNBQVMsS0FBSyxPQUFPLENBQUMsRUFBRTtNQUNqRjhCLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLFVBQVNkLEtBQU0sbUJBQWtCQSxLQUFLLEdBQUcsQ0FBRSxHQUFFLENBQUM7TUFDN0RtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRW1DLFVBQVUsQ0FBQztNQUNsQ3ZCLEtBQUssSUFBSSxDQUFDO0lBQ1osQ0FBQyxNQUFNLElBQUlaLFNBQVMsQ0FBQ0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtNQUN0QyxJQUFJcEMsSUFBSSxHQUFHZ0QsaUJBQWlCLENBQUNiLFNBQVMsQ0FBQztNQUN2QyxJQUFJbUMsVUFBVSxLQUFLLElBQUksRUFBRTtRQUN2QkwsUUFBUSxDQUFDSixJQUFJLENBQUUsSUFBR2QsS0FBTSxjQUFhLENBQUM7UUFDdENtQixNQUFNLENBQUNMLElBQUksQ0FBQzdELElBQUksQ0FBQztRQUNqQitDLEtBQUssSUFBSSxDQUFDO1FBQ1Y7TUFDRixDQUFDLE1BQU07UUFDTCxJQUFJdUIsVUFBVSxDQUFDSSxHQUFHLEVBQUU7VUFDbEIxRSxJQUFJLEdBQUc0Qyw2QkFBNkIsQ0FBQ1QsU0FBUyxDQUFDLENBQUNjLElBQUksQ0FBQyxJQUFJLENBQUM7VUFDMURnQixRQUFRLENBQUNKLElBQUksQ0FBRSxLQUFJZCxLQUFNLG9CQUFtQkEsS0FBSyxHQUFHLENBQUUsU0FBUSxDQUFDO1VBQy9EbUIsTUFBTSxDQUFDTCxJQUFJLENBQUM3RCxJQUFJLEVBQUV4QixJQUFJLENBQUNDLFNBQVMsQ0FBQzZGLFVBQVUsQ0FBQ0ksR0FBRyxDQUFDLENBQUM7VUFDakQzQixLQUFLLElBQUksQ0FBQztRQUNaLENBQUMsTUFBTSxJQUFJdUIsVUFBVSxDQUFDSyxNQUFNLEVBQUU7VUFDNUI7UUFBQSxDQUNELE1BQU0sSUFBSSxPQUFPTCxVQUFVLEtBQUssUUFBUSxFQUFFO1VBQ3pDTCxRQUFRLENBQUNKLElBQUksQ0FBRSxJQUFHZCxLQUFNLFdBQVVBLEtBQUssR0FBRyxDQUFFLFFBQU8sQ0FBQztVQUNwRG1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDN0QsSUFBSSxFQUFFc0UsVUFBVSxDQUFDO1VBQzdCdkIsS0FBSyxJQUFJLENBQUM7UUFDWjtNQUNGO0lBQ0YsQ0FBQyxNQUFNLElBQUl1QixVQUFVLEtBQUssSUFBSSxJQUFJQSxVQUFVLEtBQUtsRSxTQUFTLEVBQUU7TUFDMUQ2RCxRQUFRLENBQUNKLElBQUksQ0FBRSxJQUFHZCxLQUFNLGVBQWMsQ0FBQztNQUN2Q21CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxDQUFDO01BQ3RCWSxLQUFLLElBQUksQ0FBQztNQUNWO0lBQ0YsQ0FBQyxNQUFNLElBQUksT0FBT3VCLFVBQVUsS0FBSyxRQUFRLEVBQUU7TUFDekNMLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLElBQUdkLEtBQU0sWUFBV0EsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUFDO01BQy9DbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLEVBQUVtQyxVQUFVLENBQUM7TUFDbEN2QixLQUFLLElBQUksQ0FBQztJQUNaLENBQUMsTUFBTSxJQUFJLE9BQU91QixVQUFVLEtBQUssU0FBUyxFQUFFO01BQzFDTCxRQUFRLENBQUNKLElBQUksQ0FBRSxJQUFHZCxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLEVBQUMsQ0FBQztNQUMvQztNQUNBLElBQUkzQixNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLElBQUlmLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDYSxTQUFTLENBQUMsQ0FBQzdELElBQUksS0FBSyxRQUFRLEVBQUU7UUFDMUU7UUFDQSxNQUFNc0csZ0JBQWdCLEdBQUcsbUJBQW1CO1FBQzVDVixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRXlDLGdCQUFnQixDQUFDO01BQzFDLENBQUMsTUFBTTtRQUNMVixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRW1DLFVBQVUsQ0FBQztNQUNwQztNQUNBdkIsS0FBSyxJQUFJLENBQUM7SUFDWixDQUFDLE1BQU0sSUFBSSxPQUFPdUIsVUFBVSxLQUFLLFFBQVEsRUFBRTtNQUN6Q0wsUUFBUSxDQUFDSixJQUFJLENBQUUsSUFBR2QsS0FBTSxZQUFXQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQUM7TUFDL0NtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRW1DLFVBQVUsQ0FBQztNQUNsQ3ZCLEtBQUssSUFBSSxDQUFDO0lBQ1osQ0FBQyxNQUFNLElBQUksQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDTyxRQUFRLENBQUNuQixTQUFTLENBQUMsRUFBRTtNQUN0RCxNQUFNMEMsT0FBTyxHQUFHLEVBQUU7TUFDbEIsTUFBTUMsWUFBWSxHQUFHLEVBQUU7TUFDdkJSLFVBQVUsQ0FBQ3BDLE9BQU8sQ0FBQzZDLFFBQVEsSUFBSTtRQUM3QixNQUFNQyxNQUFNLEdBQUdsQixnQkFBZ0IsQ0FBQztVQUM5QjFDLE1BQU07VUFDTjJDLEtBQUssRUFBRWdCLFFBQVE7VUFDZmhDLEtBQUs7VUFDTGlCO1FBQ0YsQ0FBQyxDQUFDO1FBQ0YsSUFBSWdCLE1BQU0sQ0FBQ0MsT0FBTyxDQUFDaEgsTUFBTSxHQUFHLENBQUMsRUFBRTtVQUM3QjRHLE9BQU8sQ0FBQ2hCLElBQUksQ0FBQ21CLE1BQU0sQ0FBQ0MsT0FBTyxDQUFDO1VBQzVCSCxZQUFZLENBQUNqQixJQUFJLENBQUMsR0FBR21CLE1BQU0sQ0FBQ2QsTUFBTSxDQUFDO1VBQ25DbkIsS0FBSyxJQUFJaUMsTUFBTSxDQUFDZCxNQUFNLENBQUNqRyxNQUFNO1FBQy9CO01BQ0YsQ0FBQyxDQUFDO01BRUYsTUFBTWlILE9BQU8sR0FBRy9DLFNBQVMsS0FBSyxNQUFNLEdBQUcsT0FBTyxHQUFHLE1BQU07TUFDdkQsTUFBTWdELEdBQUcsR0FBR2hELFNBQVMsS0FBSyxNQUFNLEdBQUcsT0FBTyxHQUFHLEVBQUU7TUFFL0M4QixRQUFRLENBQUNKLElBQUksQ0FBRSxHQUFFc0IsR0FBSSxJQUFHTixPQUFPLENBQUM1QixJQUFJLENBQUNpQyxPQUFPLENBQUUsR0FBRSxDQUFDO01BQ2pEaEIsTUFBTSxDQUFDTCxJQUFJLENBQUMsR0FBR2lCLFlBQVksQ0FBQztJQUM5QjtJQUVBLElBQUlSLFVBQVUsQ0FBQ2MsR0FBRyxLQUFLaEYsU0FBUyxFQUFFO01BQ2hDLElBQUlnRSxZQUFZLEVBQUU7UUFDaEJFLFVBQVUsQ0FBQ2MsR0FBRyxHQUFHNUcsSUFBSSxDQUFDQyxTQUFTLENBQUMsQ0FBQzZGLFVBQVUsQ0FBQ2MsR0FBRyxDQUFDLENBQUM7UUFDakRuQixRQUFRLENBQUNKLElBQUksQ0FBRSx1QkFBc0JkLEtBQU0sV0FBVUEsS0FBSyxHQUFHLENBQUUsR0FBRSxDQUFDO01BQ3BFLENBQUMsTUFBTTtRQUNMLElBQUl1QixVQUFVLENBQUNjLEdBQUcsS0FBSyxJQUFJLEVBQUU7VUFDM0JuQixRQUFRLENBQUNKLElBQUksQ0FBRSxJQUFHZCxLQUFNLG1CQUFrQixDQUFDO1VBQzNDbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLENBQUM7VUFDdEJZLEtBQUssSUFBSSxDQUFDO1VBQ1Y7UUFDRixDQUFDLE1BQU07VUFDTDtVQUNBLElBQUl1QixVQUFVLENBQUNjLEdBQUcsQ0FBQ3RGLE1BQU0sS0FBSyxVQUFVLEVBQUU7WUFDeENtRSxRQUFRLENBQUNKLElBQUksQ0FDVixLQUFJZCxLQUFNLG1CQUFrQkEsS0FBSyxHQUFHLENBQUUsTUFBS0EsS0FBSyxHQUFHLENBQUUsU0FBUUEsS0FBTSxnQkFBZSxDQUNwRjtVQUNILENBQUMsTUFBTTtZQUNMLElBQUlaLFNBQVMsQ0FBQ0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtjQUMvQixNQUFNakMsUUFBUSxHQUFHRix1QkFBdUIsQ0FBQ3FFLFVBQVUsQ0FBQ2MsR0FBRyxDQUFDO2NBQ3hELE1BQU1DLG1CQUFtQixHQUFHbEYsUUFBUSxHQUMvQixVQUFTNkMsaUJBQWlCLENBQUNiLFNBQVMsQ0FBRSxRQUFPaEMsUUFBUyxHQUFFLEdBQ3pENkMsaUJBQWlCLENBQUNiLFNBQVMsQ0FBQztjQUNoQzhCLFFBQVEsQ0FBQ0osSUFBSSxDQUNWLElBQUd3QixtQkFBb0IsUUFBT3RDLEtBQUssR0FBRyxDQUFFLE9BQU1zQyxtQkFBb0IsV0FBVSxDQUM5RTtZQUNILENBQUMsTUFBTSxJQUFJLE9BQU9mLFVBQVUsQ0FBQ2MsR0FBRyxLQUFLLFFBQVEsSUFBSWQsVUFBVSxDQUFDYyxHQUFHLENBQUNFLGFBQWEsRUFBRTtjQUM3RSxNQUFNLElBQUkvQixhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDK0IsWUFBWSxFQUN4Qiw0RUFBNEUsQ0FDN0U7WUFDSCxDQUFDLE1BQU07Y0FDTHRCLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLEtBQUlkLEtBQU0sYUFBWUEsS0FBSyxHQUFHLENBQUUsUUFBT0EsS0FBTSxnQkFBZSxDQUFDO1lBQzlFO1VBQ0Y7UUFDRjtNQUNGO01BQ0EsSUFBSXVCLFVBQVUsQ0FBQ2MsR0FBRyxDQUFDdEYsTUFBTSxLQUFLLFVBQVUsRUFBRTtRQUN4QyxNQUFNMEYsS0FBSyxHQUFHbEIsVUFBVSxDQUFDYyxHQUFHO1FBQzVCbEIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLEVBQUVxRCxLQUFLLENBQUNDLFNBQVMsRUFBRUQsS0FBSyxDQUFDRSxRQUFRLENBQUM7UUFDdkQzQyxLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTTtRQUNMO1FBQ0FtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRW1DLFVBQVUsQ0FBQ2MsR0FBRyxDQUFDO1FBQ3RDckMsS0FBSyxJQUFJLENBQUM7TUFDWjtJQUNGO0lBQ0EsSUFBSXVCLFVBQVUsQ0FBQ3FCLEdBQUcsS0FBS3ZGLFNBQVMsRUFBRTtNQUNoQyxJQUFJa0UsVUFBVSxDQUFDcUIsR0FBRyxLQUFLLElBQUksRUFBRTtRQUMzQjFCLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLElBQUdkLEtBQU0sZUFBYyxDQUFDO1FBQ3ZDbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLENBQUM7UUFDdEJZLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNO1FBQ0wsSUFBSVosU0FBUyxDQUFDQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFO1VBQy9CLE1BQU1qQyxRQUFRLEdBQUdGLHVCQUF1QixDQUFDcUUsVUFBVSxDQUFDcUIsR0FBRyxDQUFDO1VBQ3hELE1BQU1OLG1CQUFtQixHQUFHbEYsUUFBUSxHQUMvQixVQUFTNkMsaUJBQWlCLENBQUNiLFNBQVMsQ0FBRSxRQUFPaEMsUUFBUyxHQUFFLEdBQ3pENkMsaUJBQWlCLENBQUNiLFNBQVMsQ0FBQztVQUNoQytCLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDUyxVQUFVLENBQUNxQixHQUFHLENBQUM7VUFDM0IxQixRQUFRLENBQUNKLElBQUksQ0FBRSxHQUFFd0IsbUJBQW9CLE9BQU10QyxLQUFLLEVBQUcsRUFBQyxDQUFDO1FBQ3ZELENBQUMsTUFBTSxJQUFJLE9BQU91QixVQUFVLENBQUNxQixHQUFHLEtBQUssUUFBUSxJQUFJckIsVUFBVSxDQUFDcUIsR0FBRyxDQUFDTCxhQUFhLEVBQUU7VUFDN0UsTUFBTSxJQUFJL0IsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQytCLFlBQVksRUFDeEIsNEVBQTRFLENBQzdFO1FBQ0gsQ0FBQyxNQUFNO1VBQ0xyQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRW1DLFVBQVUsQ0FBQ3FCLEdBQUcsQ0FBQztVQUN0QzFCLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLElBQUdkLEtBQU0sWUFBV0EsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUFDO1VBQy9DQSxLQUFLLElBQUksQ0FBQztRQUNaO01BQ0Y7SUFDRjtJQUNBLE1BQU02QyxTQUFTLEdBQUdDLEtBQUssQ0FBQ0MsT0FBTyxDQUFDeEIsVUFBVSxDQUFDSSxHQUFHLENBQUMsSUFBSW1CLEtBQUssQ0FBQ0MsT0FBTyxDQUFDeEIsVUFBVSxDQUFDeUIsSUFBSSxDQUFDO0lBQ2pGLElBQ0VGLEtBQUssQ0FBQ0MsT0FBTyxDQUFDeEIsVUFBVSxDQUFDSSxHQUFHLENBQUMsSUFDN0JOLFlBQVksSUFDWmhELE1BQU0sQ0FBQ0UsTUFBTSxDQUFDYSxTQUFTLENBQUMsQ0FBQzVELFFBQVEsSUFDakM2QyxNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLENBQUM1RCxRQUFRLENBQUNELElBQUksS0FBSyxRQUFRLEVBQ25EO01BQ0EsTUFBTTBILFVBQVUsR0FBRyxFQUFFO01BQ3JCLElBQUlDLFNBQVMsR0FBRyxLQUFLO01BQ3JCL0IsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLENBQUM7TUFDdEJtQyxVQUFVLENBQUNJLEdBQUcsQ0FBQ3hDLE9BQU8sQ0FBQyxDQUFDZ0UsUUFBUSxFQUFFQyxTQUFTLEtBQUs7UUFDOUMsSUFBSUQsUUFBUSxLQUFLLElBQUksRUFBRTtVQUNyQkQsU0FBUyxHQUFHLElBQUk7UUFDbEIsQ0FBQyxNQUFNO1VBQ0wvQixNQUFNLENBQUNMLElBQUksQ0FBQ3FDLFFBQVEsQ0FBQztVQUNyQkYsVUFBVSxDQUFDbkMsSUFBSSxDQUFFLElBQUdkLEtBQUssR0FBRyxDQUFDLEdBQUdvRCxTQUFTLElBQUlGLFNBQVMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFFLEVBQUMsQ0FBQztRQUNwRTtNQUNGLENBQUMsQ0FBQztNQUNGLElBQUlBLFNBQVMsRUFBRTtRQUNiaEMsUUFBUSxDQUFDSixJQUFJLENBQUUsS0FBSWQsS0FBTSxxQkFBb0JBLEtBQU0sa0JBQWlCaUQsVUFBVSxDQUFDL0MsSUFBSSxFQUFHLElBQUcsQ0FBQztNQUM1RixDQUFDLE1BQU07UUFDTGdCLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLElBQUdkLEtBQU0sa0JBQWlCaUQsVUFBVSxDQUFDL0MsSUFBSSxFQUFHLEdBQUUsQ0FBQztNQUNoRTtNQUNBRixLQUFLLEdBQUdBLEtBQUssR0FBRyxDQUFDLEdBQUdpRCxVQUFVLENBQUMvSCxNQUFNO0lBQ3ZDLENBQUMsTUFBTSxJQUFJMkgsU0FBUyxFQUFFO01BQ3BCLElBQUlRLGdCQUFnQixHQUFHLENBQUNDLFNBQVMsRUFBRUMsS0FBSyxLQUFLO1FBQzNDLE1BQU1uQixHQUFHLEdBQUdtQixLQUFLLEdBQUcsT0FBTyxHQUFHLEVBQUU7UUFDaEMsSUFBSUQsU0FBUyxDQUFDcEksTUFBTSxHQUFHLENBQUMsRUFBRTtVQUN4QixJQUFJbUcsWUFBWSxFQUFFO1lBQ2hCSCxRQUFRLENBQUNKLElBQUksQ0FBRSxHQUFFc0IsR0FBSSxvQkFBbUJwQyxLQUFNLFdBQVVBLEtBQUssR0FBRyxDQUFFLEdBQUUsQ0FBQztZQUNyRW1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxFQUFFM0QsSUFBSSxDQUFDQyxTQUFTLENBQUM0SCxTQUFTLENBQUMsQ0FBQztZQUNqRHRELEtBQUssSUFBSSxDQUFDO1VBQ1osQ0FBQyxNQUFNO1lBQ0w7WUFDQSxJQUFJWixTQUFTLENBQUNDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUU7Y0FDL0I7WUFDRjtZQUNBLE1BQU00RCxVQUFVLEdBQUcsRUFBRTtZQUNyQjlCLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxDQUFDO1lBQ3RCa0UsU0FBUyxDQUFDbkUsT0FBTyxDQUFDLENBQUNnRSxRQUFRLEVBQUVDLFNBQVMsS0FBSztjQUN6QyxJQUFJRCxRQUFRLElBQUksSUFBSSxFQUFFO2dCQUNwQmhDLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDcUMsUUFBUSxDQUFDO2dCQUNyQkYsVUFBVSxDQUFDbkMsSUFBSSxDQUFFLElBQUdkLEtBQUssR0FBRyxDQUFDLEdBQUdvRCxTQUFVLEVBQUMsQ0FBQztjQUM5QztZQUNGLENBQUMsQ0FBQztZQUNGbEMsUUFBUSxDQUFDSixJQUFJLENBQUUsSUFBR2QsS0FBTSxTQUFRb0MsR0FBSSxRQUFPYSxVQUFVLENBQUMvQyxJQUFJLEVBQUcsR0FBRSxDQUFDO1lBQ2hFRixLQUFLLEdBQUdBLEtBQUssR0FBRyxDQUFDLEdBQUdpRCxVQUFVLENBQUMvSCxNQUFNO1VBQ3ZDO1FBQ0YsQ0FBQyxNQUFNLElBQUksQ0FBQ3FJLEtBQUssRUFBRTtVQUNqQnBDLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxDQUFDO1VBQ3RCOEIsUUFBUSxDQUFDSixJQUFJLENBQUUsSUFBR2QsS0FBTSxlQUFjLENBQUM7VUFDdkNBLEtBQUssR0FBR0EsS0FBSyxHQUFHLENBQUM7UUFDbkIsQ0FBQyxNQUFNO1VBQ0w7VUFDQSxJQUFJdUQsS0FBSyxFQUFFO1lBQ1RyQyxRQUFRLENBQUNKLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1VBQzFCLENBQUMsTUFBTTtZQUNMSSxRQUFRLENBQUNKLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1VBQzFCO1FBQ0Y7TUFDRixDQUFDOztNQUNELElBQUlTLFVBQVUsQ0FBQ0ksR0FBRyxFQUFFO1FBQ2xCMEIsZ0JBQWdCLENBQ2RHLGVBQUMsQ0FBQ0MsT0FBTyxDQUFDbEMsVUFBVSxDQUFDSSxHQUFHLEVBQUUrQixHQUFHLElBQUlBLEdBQUcsQ0FBQyxFQUNyQyxLQUFLLENBQ047TUFDSDtNQUNBLElBQUluQyxVQUFVLENBQUN5QixJQUFJLEVBQUU7UUFDbkJLLGdCQUFnQixDQUNkRyxlQUFDLENBQUNDLE9BQU8sQ0FBQ2xDLFVBQVUsQ0FBQ3lCLElBQUksRUFBRVUsR0FBRyxJQUFJQSxHQUFHLENBQUMsRUFDdEMsSUFBSSxDQUNMO01BQ0g7SUFDRixDQUFDLE1BQU0sSUFBSSxPQUFPbkMsVUFBVSxDQUFDSSxHQUFHLEtBQUssV0FBVyxFQUFFO01BQ2hELE1BQU0sSUFBSW5CLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQytCLFlBQVksRUFBRSxlQUFlLENBQUM7SUFDbEUsQ0FBQyxNQUFNLElBQUksT0FBT2pCLFVBQVUsQ0FBQ3lCLElBQUksS0FBSyxXQUFXLEVBQUU7TUFDakQsTUFBTSxJQUFJeEMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDK0IsWUFBWSxFQUFFLGdCQUFnQixDQUFDO0lBQ25FO0lBRUEsSUFBSU0sS0FBSyxDQUFDQyxPQUFPLENBQUN4QixVQUFVLENBQUNvQyxJQUFJLENBQUMsSUFBSXRDLFlBQVksRUFBRTtNQUNsRCxJQUFJdUMseUJBQXlCLENBQUNyQyxVQUFVLENBQUNvQyxJQUFJLENBQUMsRUFBRTtRQUM5QyxJQUFJLENBQUNFLHNCQUFzQixDQUFDdEMsVUFBVSxDQUFDb0MsSUFBSSxDQUFDLEVBQUU7VUFDNUMsTUFBTSxJQUFJbkQsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQytCLFlBQVksRUFDeEIsaURBQWlELEdBQUdqQixVQUFVLENBQUNvQyxJQUFJLENBQ3BFO1FBQ0g7UUFFQSxLQUFLLElBQUlHLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR3ZDLFVBQVUsQ0FBQ29DLElBQUksQ0FBQ3pJLE1BQU0sRUFBRTRJLENBQUMsSUFBSSxDQUFDLEVBQUU7VUFDbEQsTUFBTWhILEtBQUssR0FBR2lILG1CQUFtQixDQUFDeEMsVUFBVSxDQUFDb0MsSUFBSSxDQUFDRyxDQUFDLENBQUMsQ0FBQ2xDLE1BQU0sQ0FBQztVQUM1REwsVUFBVSxDQUFDb0MsSUFBSSxDQUFDRyxDQUFDLENBQUMsR0FBR2hILEtBQUssQ0FBQ3NELFNBQVMsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHO1FBQy9DO1FBQ0FjLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLDZCQUE0QmQsS0FBTSxXQUFVQSxLQUFLLEdBQUcsQ0FBRSxVQUFTLENBQUM7TUFDakYsQ0FBQyxNQUFNO1FBQ0xrQixRQUFRLENBQUNKLElBQUksQ0FBRSx1QkFBc0JkLEtBQU0sV0FBVUEsS0FBSyxHQUFHLENBQUUsVUFBUyxDQUFDO01BQzNFO01BQ0FtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRTNELElBQUksQ0FBQ0MsU0FBUyxDQUFDNkYsVUFBVSxDQUFDb0MsSUFBSSxDQUFDLENBQUM7TUFDdkQzRCxLQUFLLElBQUksQ0FBQztJQUNaLENBQUMsTUFBTSxJQUFJOEMsS0FBSyxDQUFDQyxPQUFPLENBQUN4QixVQUFVLENBQUNvQyxJQUFJLENBQUMsRUFBRTtNQUN6QyxJQUFJcEMsVUFBVSxDQUFDb0MsSUFBSSxDQUFDekksTUFBTSxLQUFLLENBQUMsRUFBRTtRQUNoQ2dHLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLElBQUdkLEtBQU0sWUFBV0EsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUFDO1FBQy9DbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLEVBQUVtQyxVQUFVLENBQUNvQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUNwRyxRQUFRLENBQUM7UUFDbkR5QyxLQUFLLElBQUksQ0FBQztNQUNaO0lBQ0Y7SUFFQSxJQUFJLE9BQU91QixVQUFVLENBQUNDLE9BQU8sS0FBSyxXQUFXLEVBQUU7TUFDN0MsSUFBSSxPQUFPRCxVQUFVLENBQUNDLE9BQU8sS0FBSyxRQUFRLElBQUlELFVBQVUsQ0FBQ0MsT0FBTyxDQUFDZSxhQUFhLEVBQUU7UUFDOUUsTUFBTSxJQUFJL0IsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQytCLFlBQVksRUFDeEIsNEVBQTRFLENBQzdFO01BQ0gsQ0FBQyxNQUFNLElBQUlqQixVQUFVLENBQUNDLE9BQU8sRUFBRTtRQUM3Qk4sUUFBUSxDQUFDSixJQUFJLENBQUUsSUFBR2QsS0FBTSxtQkFBa0IsQ0FBQztNQUM3QyxDQUFDLE1BQU07UUFDTGtCLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLElBQUdkLEtBQU0sZUFBYyxDQUFDO01BQ3pDO01BQ0FtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsQ0FBQztNQUN0QlksS0FBSyxJQUFJLENBQUM7SUFDWjtJQUVBLElBQUl1QixVQUFVLENBQUN5QyxZQUFZLEVBQUU7TUFDM0IsTUFBTUMsR0FBRyxHQUFHMUMsVUFBVSxDQUFDeUMsWUFBWTtNQUNuQyxJQUFJLEVBQUVDLEdBQUcsWUFBWW5CLEtBQUssQ0FBQyxFQUFFO1FBQzNCLE1BQU0sSUFBSXRDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQytCLFlBQVksRUFBRyxzQ0FBcUMsQ0FBQztNQUN6RjtNQUVBdEIsUUFBUSxDQUFDSixJQUFJLENBQUUsSUFBR2QsS0FBTSxhQUFZQSxLQUFLLEdBQUcsQ0FBRSxTQUFRLENBQUM7TUFDdkRtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRTNELElBQUksQ0FBQ0MsU0FBUyxDQUFDdUksR0FBRyxDQUFDLENBQUM7TUFDM0NqRSxLQUFLLElBQUksQ0FBQztJQUNaO0lBRUEsSUFBSXVCLFVBQVUsQ0FBQzJDLEtBQUssRUFBRTtNQUNwQixNQUFNQyxNQUFNLEdBQUc1QyxVQUFVLENBQUMyQyxLQUFLLENBQUNFLE9BQU87TUFDdkMsSUFBSUMsUUFBUSxHQUFHLFNBQVM7TUFDeEIsSUFBSSxPQUFPRixNQUFNLEtBQUssUUFBUSxFQUFFO1FBQzlCLE1BQU0sSUFBSTNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQytCLFlBQVksRUFBRyxzQ0FBcUMsQ0FBQztNQUN6RjtNQUNBLElBQUksQ0FBQzJCLE1BQU0sQ0FBQ0csS0FBSyxJQUFJLE9BQU9ILE1BQU0sQ0FBQ0csS0FBSyxLQUFLLFFBQVEsRUFBRTtRQUNyRCxNQUFNLElBQUk5RCxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUMrQixZQUFZLEVBQUcsb0NBQW1DLENBQUM7TUFDdkY7TUFDQSxJQUFJMkIsTUFBTSxDQUFDSSxTQUFTLElBQUksT0FBT0osTUFBTSxDQUFDSSxTQUFTLEtBQUssUUFBUSxFQUFFO1FBQzVELE1BQU0sSUFBSS9ELGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQytCLFlBQVksRUFBRyx3Q0FBdUMsQ0FBQztNQUMzRixDQUFDLE1BQU0sSUFBSTJCLE1BQU0sQ0FBQ0ksU0FBUyxFQUFFO1FBQzNCRixRQUFRLEdBQUdGLE1BQU0sQ0FBQ0ksU0FBUztNQUM3QjtNQUNBLElBQUlKLE1BQU0sQ0FBQ0ssY0FBYyxJQUFJLE9BQU9MLE1BQU0sQ0FBQ0ssY0FBYyxLQUFLLFNBQVMsRUFBRTtRQUN2RSxNQUFNLElBQUloRSxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDK0IsWUFBWSxFQUN2Qiw4Q0FBNkMsQ0FDL0M7TUFDSCxDQUFDLE1BQU0sSUFBSTJCLE1BQU0sQ0FBQ0ssY0FBYyxFQUFFO1FBQ2hDLE1BQU0sSUFBSWhFLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUMrQixZQUFZLEVBQ3ZCLG9HQUFtRyxDQUNyRztNQUNIO01BQ0EsSUFBSTJCLE1BQU0sQ0FBQ00sbUJBQW1CLElBQUksT0FBT04sTUFBTSxDQUFDTSxtQkFBbUIsS0FBSyxTQUFTLEVBQUU7UUFDakYsTUFBTSxJQUFJakUsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQytCLFlBQVksRUFDdkIsbURBQWtELENBQ3BEO01BQ0gsQ0FBQyxNQUFNLElBQUkyQixNQUFNLENBQUNNLG1CQUFtQixLQUFLLEtBQUssRUFBRTtRQUMvQyxNQUFNLElBQUlqRSxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDK0IsWUFBWSxFQUN2QiwyRkFBMEYsQ0FDNUY7TUFDSDtNQUNBdEIsUUFBUSxDQUFDSixJQUFJLENBQ1YsZ0JBQWVkLEtBQU0sTUFBS0EsS0FBSyxHQUFHLENBQUUseUJBQXdCQSxLQUFLLEdBQUcsQ0FBRSxNQUFLQSxLQUFLLEdBQUcsQ0FBRSxHQUFFLENBQ3pGO01BQ0RtQixNQUFNLENBQUNMLElBQUksQ0FBQ3VELFFBQVEsRUFBRWpGLFNBQVMsRUFBRWlGLFFBQVEsRUFBRUYsTUFBTSxDQUFDRyxLQUFLLENBQUM7TUFDeER0RSxLQUFLLElBQUksQ0FBQztJQUNaO0lBRUEsSUFBSXVCLFVBQVUsQ0FBQ21ELFdBQVcsRUFBRTtNQUMxQixNQUFNakMsS0FBSyxHQUFHbEIsVUFBVSxDQUFDbUQsV0FBVztNQUNwQyxNQUFNQyxRQUFRLEdBQUdwRCxVQUFVLENBQUNxRCxZQUFZO01BQ3hDLE1BQU1DLFlBQVksR0FBR0YsUUFBUSxHQUFHLElBQUksR0FBRyxJQUFJO01BQzNDekQsUUFBUSxDQUFDSixJQUFJLENBQ1Ysc0JBQXFCZCxLQUFNLDJCQUEwQkEsS0FBSyxHQUFHLENBQUUsTUFBS0EsS0FBSyxHQUFHLENBQzVFLG9CQUFtQkEsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUNoQztNQUNEb0IsS0FBSyxDQUFDTixJQUFJLENBQ1Asc0JBQXFCZCxLQUFNLDJCQUEwQkEsS0FBSyxHQUFHLENBQUUsTUFBS0EsS0FBSyxHQUFHLENBQzVFLGtCQUFpQixDQUNuQjtNQUNEbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLEVBQUVxRCxLQUFLLENBQUNDLFNBQVMsRUFBRUQsS0FBSyxDQUFDRSxRQUFRLEVBQUVrQyxZQUFZLENBQUM7TUFDckU3RSxLQUFLLElBQUksQ0FBQztJQUNaO0lBRUEsSUFBSXVCLFVBQVUsQ0FBQ3VELE9BQU8sSUFBSXZELFVBQVUsQ0FBQ3VELE9BQU8sQ0FBQ0MsSUFBSSxFQUFFO01BQ2pELE1BQU1DLEdBQUcsR0FBR3pELFVBQVUsQ0FBQ3VELE9BQU8sQ0FBQ0MsSUFBSTtNQUNuQyxNQUFNRSxJQUFJLEdBQUdELEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQ3RDLFNBQVM7TUFDN0IsTUFBTXdDLE1BQU0sR0FBR0YsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDckMsUUFBUTtNQUM5QixNQUFNd0MsS0FBSyxHQUFHSCxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUN0QyxTQUFTO01BQzlCLE1BQU0wQyxHQUFHLEdBQUdKLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQ3JDLFFBQVE7TUFFM0J6QixRQUFRLENBQUNKLElBQUksQ0FBRSxJQUFHZCxLQUFNLG9CQUFtQkEsS0FBSyxHQUFHLENBQUUsT0FBTSxDQUFDO01BQzVEbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLEVBQUcsS0FBSTZGLElBQUssS0FBSUMsTUFBTyxPQUFNQyxLQUFNLEtBQUlDLEdBQUksSUFBRyxDQUFDO01BQ3BFcEYsS0FBSyxJQUFJLENBQUM7SUFDWjtJQUVBLElBQUl1QixVQUFVLENBQUM4RCxVQUFVLElBQUk5RCxVQUFVLENBQUM4RCxVQUFVLENBQUNDLGFBQWEsRUFBRTtNQUNoRSxNQUFNQyxZQUFZLEdBQUdoRSxVQUFVLENBQUM4RCxVQUFVLENBQUNDLGFBQWE7TUFDeEQsSUFBSSxFQUFFQyxZQUFZLFlBQVl6QyxLQUFLLENBQUMsSUFBSXlDLFlBQVksQ0FBQ3JLLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDL0QsTUFBTSxJQUFJc0YsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQytCLFlBQVksRUFDeEIsdUZBQXVGLENBQ3hGO01BQ0g7TUFDQTtNQUNBLElBQUlDLEtBQUssR0FBRzhDLFlBQVksQ0FBQyxDQUFDLENBQUM7TUFDM0IsSUFBSTlDLEtBQUssWUFBWUssS0FBSyxJQUFJTCxLQUFLLENBQUN2SCxNQUFNLEtBQUssQ0FBQyxFQUFFO1FBQ2hEdUgsS0FBSyxHQUFHLElBQUlqQyxhQUFLLENBQUNnRixRQUFRLENBQUMvQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUVBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUNoRCxDQUFDLE1BQU0sSUFBSSxDQUFDZ0QsYUFBYSxDQUFDQyxXQUFXLENBQUNqRCxLQUFLLENBQUMsRUFBRTtRQUM1QyxNQUFNLElBQUlqQyxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDK0IsWUFBWSxFQUN4Qix1REFBdUQsQ0FDeEQ7TUFDSDtNQUNBaEMsYUFBSyxDQUFDZ0YsUUFBUSxDQUFDRyxTQUFTLENBQUNsRCxLQUFLLENBQUNFLFFBQVEsRUFBRUYsS0FBSyxDQUFDQyxTQUFTLENBQUM7TUFDekQ7TUFDQSxNQUFNaUMsUUFBUSxHQUFHWSxZQUFZLENBQUMsQ0FBQyxDQUFDO01BQ2hDLElBQUlLLEtBQUssQ0FBQ2pCLFFBQVEsQ0FBQyxJQUFJQSxRQUFRLEdBQUcsQ0FBQyxFQUFFO1FBQ25DLE1BQU0sSUFBSW5FLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUMrQixZQUFZLEVBQ3hCLHNEQUFzRCxDQUN2RDtNQUNIO01BQ0EsTUFBTXFDLFlBQVksR0FBR0YsUUFBUSxHQUFHLElBQUksR0FBRyxJQUFJO01BQzNDekQsUUFBUSxDQUFDSixJQUFJLENBQ1Ysc0JBQXFCZCxLQUFNLDJCQUEwQkEsS0FBSyxHQUFHLENBQUUsTUFBS0EsS0FBSyxHQUFHLENBQzVFLG9CQUFtQkEsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUNoQztNQUNEbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLEVBQUVxRCxLQUFLLENBQUNDLFNBQVMsRUFBRUQsS0FBSyxDQUFDRSxRQUFRLEVBQUVrQyxZQUFZLENBQUM7TUFDckU3RSxLQUFLLElBQUksQ0FBQztJQUNaO0lBRUEsSUFBSXVCLFVBQVUsQ0FBQzhELFVBQVUsSUFBSTlELFVBQVUsQ0FBQzhELFVBQVUsQ0FBQ1EsUUFBUSxFQUFFO01BQzNELE1BQU1DLE9BQU8sR0FBR3ZFLFVBQVUsQ0FBQzhELFVBQVUsQ0FBQ1EsUUFBUTtNQUM5QyxJQUFJRSxNQUFNO01BQ1YsSUFBSSxPQUFPRCxPQUFPLEtBQUssUUFBUSxJQUFJQSxPQUFPLENBQUMvSSxNQUFNLEtBQUssU0FBUyxFQUFFO1FBQy9ELElBQUksQ0FBQytJLE9BQU8sQ0FBQ0UsV0FBVyxJQUFJRixPQUFPLENBQUNFLFdBQVcsQ0FBQzlLLE1BQU0sR0FBRyxDQUFDLEVBQUU7VUFDMUQsTUFBTSxJQUFJc0YsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQytCLFlBQVksRUFDeEIsbUZBQW1GLENBQ3BGO1FBQ0g7UUFDQXVELE1BQU0sR0FBR0QsT0FBTyxDQUFDRSxXQUFXO01BQzlCLENBQUMsTUFBTSxJQUFJRixPQUFPLFlBQVloRCxLQUFLLEVBQUU7UUFDbkMsSUFBSWdELE9BQU8sQ0FBQzVLLE1BQU0sR0FBRyxDQUFDLEVBQUU7VUFDdEIsTUFBTSxJQUFJc0YsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQytCLFlBQVksRUFDeEIsb0VBQW9FLENBQ3JFO1FBQ0g7UUFDQXVELE1BQU0sR0FBR0QsT0FBTztNQUNsQixDQUFDLE1BQU07UUFDTCxNQUFNLElBQUl0RixhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDK0IsWUFBWSxFQUN4QixzRkFBc0YsQ0FDdkY7TUFDSDtNQUNBdUQsTUFBTSxHQUFHQSxNQUFNLENBQ1pqRyxHQUFHLENBQUMyQyxLQUFLLElBQUk7UUFDWixJQUFJQSxLQUFLLFlBQVlLLEtBQUssSUFBSUwsS0FBSyxDQUFDdkgsTUFBTSxLQUFLLENBQUMsRUFBRTtVQUNoRHNGLGFBQUssQ0FBQ2dGLFFBQVEsQ0FBQ0csU0FBUyxDQUFDbEQsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7VUFDNUMsT0FBUSxJQUFHQSxLQUFLLENBQUMsQ0FBQyxDQUFFLEtBQUlBLEtBQUssQ0FBQyxDQUFDLENBQUUsR0FBRTtRQUNyQztRQUNBLElBQUksT0FBT0EsS0FBSyxLQUFLLFFBQVEsSUFBSUEsS0FBSyxDQUFDMUYsTUFBTSxLQUFLLFVBQVUsRUFBRTtVQUM1RCxNQUFNLElBQUl5RCxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUMrQixZQUFZLEVBQUUsc0JBQXNCLENBQUM7UUFDekUsQ0FBQyxNQUFNO1VBQ0xoQyxhQUFLLENBQUNnRixRQUFRLENBQUNHLFNBQVMsQ0FBQ2xELEtBQUssQ0FBQ0UsUUFBUSxFQUFFRixLQUFLLENBQUNDLFNBQVMsQ0FBQztRQUMzRDtRQUNBLE9BQVEsSUFBR0QsS0FBSyxDQUFDQyxTQUFVLEtBQUlELEtBQUssQ0FBQ0UsUUFBUyxHQUFFO01BQ2xELENBQUMsQ0FBQyxDQUNEekMsSUFBSSxDQUFDLElBQUksQ0FBQztNQUViZ0IsUUFBUSxDQUFDSixJQUFJLENBQUUsSUFBR2QsS0FBTSxvQkFBbUJBLEtBQUssR0FBRyxDQUFFLFdBQVUsQ0FBQztNQUNoRW1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxFQUFHLElBQUcyRyxNQUFPLEdBQUUsQ0FBQztNQUNyQy9GLEtBQUssSUFBSSxDQUFDO0lBQ1o7SUFDQSxJQUFJdUIsVUFBVSxDQUFDMEUsY0FBYyxJQUFJMUUsVUFBVSxDQUFDMEUsY0FBYyxDQUFDQyxNQUFNLEVBQUU7TUFDakUsTUFBTXpELEtBQUssR0FBR2xCLFVBQVUsQ0FBQzBFLGNBQWMsQ0FBQ0MsTUFBTTtNQUM5QyxJQUFJLE9BQU96RCxLQUFLLEtBQUssUUFBUSxJQUFJQSxLQUFLLENBQUMxRixNQUFNLEtBQUssVUFBVSxFQUFFO1FBQzVELE1BQU0sSUFBSXlELGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUMrQixZQUFZLEVBQ3hCLG9EQUFvRCxDQUNyRDtNQUNILENBQUMsTUFBTTtRQUNMaEMsYUFBSyxDQUFDZ0YsUUFBUSxDQUFDRyxTQUFTLENBQUNsRCxLQUFLLENBQUNFLFFBQVEsRUFBRUYsS0FBSyxDQUFDQyxTQUFTLENBQUM7TUFDM0Q7TUFDQXhCLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLElBQUdkLEtBQU0sc0JBQXFCQSxLQUFLLEdBQUcsQ0FBRSxTQUFRLENBQUM7TUFDaEVtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRyxJQUFHcUQsS0FBSyxDQUFDQyxTQUFVLEtBQUlELEtBQUssQ0FBQ0UsUUFBUyxHQUFFLENBQUM7TUFDakUzQyxLQUFLLElBQUksQ0FBQztJQUNaO0lBRUEsSUFBSXVCLFVBQVUsQ0FBQ0ssTUFBTSxFQUFFO01BQ3JCLElBQUl1RSxLQUFLLEdBQUc1RSxVQUFVLENBQUNLLE1BQU07TUFDN0IsSUFBSXdFLFFBQVEsR0FBRyxHQUFHO01BQ2xCLE1BQU1DLElBQUksR0FBRzlFLFVBQVUsQ0FBQytFLFFBQVE7TUFDaEMsSUFBSUQsSUFBSSxFQUFFO1FBQ1IsSUFBSUEsSUFBSSxDQUFDaEgsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtVQUMxQitHLFFBQVEsR0FBRyxJQUFJO1FBQ2pCO1FBQ0EsSUFBSUMsSUFBSSxDQUFDaEgsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtVQUMxQjhHLEtBQUssR0FBR0ksZ0JBQWdCLENBQUNKLEtBQUssQ0FBQztRQUNqQztNQUNGO01BRUEsTUFBTWxKLElBQUksR0FBR2dELGlCQUFpQixDQUFDYixTQUFTLENBQUM7TUFDekMrRyxLQUFLLEdBQUdwQyxtQkFBbUIsQ0FBQ29DLEtBQUssQ0FBQztNQUVsQ2pGLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLElBQUdkLEtBQU0sUUFBT29HLFFBQVMsTUFBS3BHLEtBQUssR0FBRyxDQUFFLE9BQU0sQ0FBQztNQUM5RG1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDN0QsSUFBSSxFQUFFa0osS0FBSyxDQUFDO01BQ3hCbkcsS0FBSyxJQUFJLENBQUM7SUFDWjtJQUVBLElBQUl1QixVQUFVLENBQUN4RSxNQUFNLEtBQUssU0FBUyxFQUFFO01BQ25DLElBQUlzRSxZQUFZLEVBQUU7UUFDaEJILFFBQVEsQ0FBQ0osSUFBSSxDQUFFLG1CQUFrQmQsS0FBTSxXQUFVQSxLQUFLLEdBQUcsQ0FBRSxHQUFFLENBQUM7UUFDOURtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRTNELElBQUksQ0FBQ0MsU0FBUyxDQUFDLENBQUM2RixVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQ3BEdkIsS0FBSyxJQUFJLENBQUM7TUFDWixDQUFDLE1BQU07UUFDTGtCLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLElBQUdkLEtBQU0sWUFBV0EsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUFDO1FBQy9DbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLEVBQUVtQyxVQUFVLENBQUNoRSxRQUFRLENBQUM7UUFDM0N5QyxLQUFLLElBQUksQ0FBQztNQUNaO0lBQ0Y7SUFFQSxJQUFJdUIsVUFBVSxDQUFDeEUsTUFBTSxLQUFLLE1BQU0sRUFBRTtNQUNoQ21FLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLElBQUdkLEtBQU0sWUFBV0EsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUFDO01BQy9DbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLEVBQUVtQyxVQUFVLENBQUN2RSxHQUFHLENBQUM7TUFDdENnRCxLQUFLLElBQUksQ0FBQztJQUNaO0lBRUEsSUFBSXVCLFVBQVUsQ0FBQ3hFLE1BQU0sS0FBSyxVQUFVLEVBQUU7TUFDcENtRSxRQUFRLENBQUNKLElBQUksQ0FBRSxJQUFHZCxLQUFNLG1CQUFrQkEsS0FBSyxHQUFHLENBQUUsTUFBS0EsS0FBSyxHQUFHLENBQUUsR0FBRSxDQUFDO01BQ3RFbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLEVBQUVtQyxVQUFVLENBQUNtQixTQUFTLEVBQUVuQixVQUFVLENBQUNvQixRQUFRLENBQUM7TUFDakUzQyxLQUFLLElBQUksQ0FBQztJQUNaO0lBRUEsSUFBSXVCLFVBQVUsQ0FBQ3hFLE1BQU0sS0FBSyxTQUFTLEVBQUU7TUFDbkMsTUFBTUQsS0FBSyxHQUFHMEosbUJBQW1CLENBQUNqRixVQUFVLENBQUN5RSxXQUFXLENBQUM7TUFDekQ5RSxRQUFRLENBQUNKLElBQUksQ0FBRSxJQUFHZCxLQUFNLGFBQVlBLEtBQUssR0FBRyxDQUFFLFdBQVUsQ0FBQztNQUN6RG1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxFQUFFdEMsS0FBSyxDQUFDO01BQzdCa0QsS0FBSyxJQUFJLENBQUM7SUFDWjtJQUVBdkMsTUFBTSxDQUFDeUIsSUFBSSxDQUFDdkQsd0JBQXdCLENBQUMsQ0FBQ3dELE9BQU8sQ0FBQ3NILEdBQUcsSUFBSTtNQUNuRCxJQUFJbEYsVUFBVSxDQUFDa0YsR0FBRyxDQUFDLElBQUlsRixVQUFVLENBQUNrRixHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDNUMsTUFBTUMsWUFBWSxHQUFHL0ssd0JBQXdCLENBQUM4SyxHQUFHLENBQUM7UUFDbEQsSUFBSW5FLG1CQUFtQjtRQUN2QixJQUFJbkYsYUFBYSxHQUFHTixlQUFlLENBQUMwRSxVQUFVLENBQUNrRixHQUFHLENBQUMsQ0FBQztRQUVwRCxJQUFJckgsU0FBUyxDQUFDQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFO1VBQy9CLE1BQU1qQyxRQUFRLEdBQUdGLHVCQUF1QixDQUFDcUUsVUFBVSxDQUFDa0YsR0FBRyxDQUFDLENBQUM7VUFDekRuRSxtQkFBbUIsR0FBR2xGLFFBQVEsR0FDekIsVUFBUzZDLGlCQUFpQixDQUFDYixTQUFTLENBQUUsUUFBT2hDLFFBQVMsR0FBRSxHQUN6RDZDLGlCQUFpQixDQUFDYixTQUFTLENBQUM7UUFDbEMsQ0FBQyxNQUFNO1VBQ0wsSUFBSSxPQUFPakMsYUFBYSxLQUFLLFFBQVEsSUFBSUEsYUFBYSxDQUFDb0YsYUFBYSxFQUFFO1lBQ3BFLElBQUlsRSxNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLENBQUM3RCxJQUFJLEtBQUssTUFBTSxFQUFFO2NBQzVDLE1BQU0sSUFBSWlGLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUMrQixZQUFZLEVBQ3hCLGdEQUFnRCxDQUNqRDtZQUNIO1lBQ0EsTUFBTW1FLFlBQVksR0FBR3RNLEtBQUssQ0FBQ3VNLGtCQUFrQixDQUFDekosYUFBYSxDQUFDb0YsYUFBYSxDQUFDO1lBQzFFLElBQUlvRSxZQUFZLENBQUNFLE1BQU0sS0FBSyxTQUFTLEVBQUU7Y0FDckMxSixhQUFhLEdBQUdOLGVBQWUsQ0FBQzhKLFlBQVksQ0FBQ0csTUFBTSxDQUFDO1lBQ3RELENBQUMsTUFBTTtjQUNMQyxPQUFPLENBQUNDLEtBQUssQ0FBQyxtQ0FBbUMsRUFBRUwsWUFBWSxDQUFDO2NBQ2hFLE1BQU0sSUFBSW5HLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUMrQixZQUFZLEVBQ3ZCLHNCQUFxQnJGLGFBQWEsQ0FBQ29GLGFBQWMsWUFBV29FLFlBQVksQ0FBQ00sSUFBSyxFQUFDLENBQ2pGO1lBQ0g7VUFDRjtVQUNBM0UsbUJBQW1CLEdBQUksSUFBR3RDLEtBQUssRUFBRyxPQUFNO1VBQ3hDbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLENBQUM7UUFDeEI7UUFDQStCLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDM0QsYUFBYSxDQUFDO1FBQzFCK0QsUUFBUSxDQUFDSixJQUFJLENBQUUsR0FBRXdCLG1CQUFvQixJQUFHb0UsWUFBYSxLQUFJMUcsS0FBSyxFQUFHLEVBQUMsQ0FBQztNQUNyRTtJQUNGLENBQUMsQ0FBQztJQUVGLElBQUlzQixxQkFBcUIsS0FBS0osUUFBUSxDQUFDaEcsTUFBTSxFQUFFO01BQzdDLE1BQU0sSUFBSXNGLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUN5RyxtQkFBbUIsRUFDOUIsZ0RBQStDekwsSUFBSSxDQUFDQyxTQUFTLENBQUM2RixVQUFVLENBQUUsRUFBQyxDQUM3RTtJQUNIO0VBQ0Y7RUFDQUosTUFBTSxHQUFHQSxNQUFNLENBQUNyQixHQUFHLENBQUN4QyxjQUFjLENBQUM7RUFDbkMsT0FBTztJQUFFNEUsT0FBTyxFQUFFaEIsUUFBUSxDQUFDaEIsSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUFFaUIsTUFBTTtJQUFFQztFQUFNLENBQUM7QUFDM0QsQ0FBQztBQUVNLE1BQU0rRixzQkFBc0IsQ0FBMkI7RUFJNUQ7O0VBVUFDLFdBQVcsQ0FBQztJQUFFQyxHQUFHO0lBQUVDLGdCQUFnQixHQUFHLEVBQUU7SUFBRUMsZUFBZSxHQUFHLENBQUM7RUFBTyxDQUFDLEVBQUU7SUFDckUsTUFBTUMsT0FBTyxxQkFBUUQsZUFBZSxDQUFFO0lBQ3RDLElBQUksQ0FBQ0UsaUJBQWlCLEdBQUdILGdCQUFnQjtJQUN6QyxJQUFJLENBQUNJLGlCQUFpQixHQUFHLENBQUMsQ0FBQ0gsZUFBZSxDQUFDRyxpQkFBaUI7SUFDNUQsSUFBSSxDQUFDQyxjQUFjLEdBQUdKLGVBQWUsQ0FBQ0ksY0FBYztJQUNwRCxJQUFJLENBQUNDLDJCQUEyQixHQUFHLENBQUMsQ0FBQ0wsZUFBZSxDQUFDSywyQkFBMkI7SUFDaEYsS0FBSyxNQUFNdEgsR0FBRyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsZ0JBQWdCLEVBQUUsNkJBQTZCLENBQUMsRUFBRTtNQUN4RixPQUFPa0gsT0FBTyxDQUFDbEgsR0FBRyxDQUFDO0lBQ3JCO0lBRUEsTUFBTTtNQUFFdUgsTUFBTTtNQUFFQztJQUFJLENBQUMsR0FBRyxJQUFBQyw0QkFBWSxFQUFDVixHQUFHLEVBQUVHLE9BQU8sQ0FBQztJQUNsRCxJQUFJLENBQUNRLE9BQU8sR0FBR0gsTUFBTTtJQUNyQixJQUFJLENBQUNJLFNBQVMsR0FBRyxNQUFNLENBQUUsQ0FBQztJQUMxQixJQUFJLENBQUNDLElBQUksR0FBR0osR0FBRztJQUNmLElBQUksQ0FBQ0ssS0FBSyxHQUFHLElBQUFDLFFBQU0sR0FBRTtJQUNyQixJQUFJLENBQUNDLG1CQUFtQixHQUFHLEtBQUs7RUFDbEM7RUFFQUMsS0FBSyxDQUFDQyxRQUFvQixFQUFRO0lBQ2hDLElBQUksQ0FBQ04sU0FBUyxHQUFHTSxRQUFRO0VBQzNCOztFQUVBO0VBQ0FDLHNCQUFzQixDQUFDeEgsS0FBYSxFQUFFeUgsT0FBZ0IsR0FBRyxLQUFLLEVBQUU7SUFDOUQsSUFBSUEsT0FBTyxFQUFFO01BQ1gsT0FBTyxpQ0FBaUMsR0FBR3pILEtBQUs7SUFDbEQsQ0FBQyxNQUFNO01BQ0wsT0FBTyx3QkFBd0IsR0FBR0EsS0FBSztJQUN6QztFQUNGO0VBRUEwSCxjQUFjLEdBQUc7SUFDZixJQUFJLElBQUksQ0FBQ0MsT0FBTyxFQUFFO01BQ2hCLElBQUksQ0FBQ0EsT0FBTyxDQUFDQyxJQUFJLEVBQUU7TUFDbkIsT0FBTyxJQUFJLENBQUNELE9BQU87SUFDckI7SUFDQSxJQUFJLENBQUMsSUFBSSxDQUFDWCxPQUFPLEVBQUU7TUFDakI7SUFDRjtJQUNBLElBQUksQ0FBQ0EsT0FBTyxDQUFDYSxLQUFLLENBQUNDLEdBQUcsRUFBRTtFQUMxQjtFQUVBLE1BQU1DLGVBQWUsR0FBRztJQUN0QixJQUFJLENBQUMsSUFBSSxDQUFDSixPQUFPLElBQUksSUFBSSxDQUFDakIsaUJBQWlCLEVBQUU7TUFDM0MsSUFBSSxDQUFDaUIsT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDWCxPQUFPLENBQUNnQixPQUFPLENBQUM7UUFBRUMsTUFBTSxFQUFFO01BQUssQ0FBQyxDQUFDO01BQzNELElBQUksQ0FBQ04sT0FBTyxDQUFDZCxNQUFNLENBQUNxQixFQUFFLENBQUMsY0FBYyxFQUFFQyxJQUFJLElBQUk7UUFDN0MsTUFBTUMsT0FBTyxHQUFHM04sSUFBSSxDQUFDNE4sS0FBSyxDQUFDRixJQUFJLENBQUNDLE9BQU8sQ0FBQztRQUN4QyxJQUFJQSxPQUFPLENBQUNFLFFBQVEsS0FBSyxJQUFJLENBQUNuQixLQUFLLEVBQUU7VUFDbkMsSUFBSSxDQUFDRixTQUFTLEVBQUU7UUFDbEI7TUFDRixDQUFDLENBQUM7TUFDRixNQUFNLElBQUksQ0FBQ1UsT0FBTyxDQUFDWSxJQUFJLENBQUMsWUFBWSxFQUFFLGVBQWUsQ0FBQztJQUN4RDtFQUNGO0VBRUFDLG1CQUFtQixHQUFHO0lBQ3BCLElBQUksSUFBSSxDQUFDYixPQUFPLEVBQUU7TUFDaEIsSUFBSSxDQUFDQSxPQUFPLENBQ1RZLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLGVBQWUsRUFBRTtRQUFFRCxRQUFRLEVBQUUsSUFBSSxDQUFDbkI7TUFBTSxDQUFDLENBQUMsQ0FBQyxDQUNuRXNCLEtBQUssQ0FBQ3pDLEtBQUssSUFBSTtRQUNkRCxPQUFPLENBQUM1TCxHQUFHLENBQUMsbUJBQW1CLEVBQUU2TCxLQUFLLENBQUMsQ0FBQyxDQUFDO01BQzNDLENBQUMsQ0FBQztJQUNOO0VBQ0Y7O0VBRUEsTUFBTTBDLDZCQUE2QixDQUFDQyxJQUFTLEVBQUU7SUFDN0NBLElBQUksR0FBR0EsSUFBSSxJQUFJLElBQUksQ0FBQzNCLE9BQU87SUFDM0IsTUFBTTJCLElBQUksQ0FDUEosSUFBSSxDQUNILG1JQUFtSSxDQUNwSSxDQUNBRSxLQUFLLENBQUN6QyxLQUFLLElBQUk7TUFDZCxNQUFNQSxLQUFLO0lBQ2IsQ0FBQyxDQUFDO0VBQ047RUFFQSxNQUFNNEMsV0FBVyxDQUFDM00sSUFBWSxFQUFFO0lBQzlCLE9BQU8sSUFBSSxDQUFDK0ssT0FBTyxDQUFDNkIsR0FBRyxDQUNyQiwrRUFBK0UsRUFDL0UsQ0FBQzVNLElBQUksQ0FBQyxFQUNONk0sQ0FBQyxJQUFJQSxDQUFDLENBQUNDLE1BQU0sQ0FDZDtFQUNIO0VBRUEsTUFBTUMsd0JBQXdCLENBQUMxTCxTQUFpQixFQUFFMkwsSUFBUyxFQUFFO0lBQzNELE1BQU0sSUFBSSxDQUFDakMsT0FBTyxDQUFDa0MsSUFBSSxDQUFDLDZCQUE2QixFQUFFLE1BQU1DLENBQUMsSUFBSTtNQUNoRSxNQUFNaEosTUFBTSxHQUFHLENBQUM3QyxTQUFTLEVBQUUsUUFBUSxFQUFFLHVCQUF1QixFQUFFN0MsSUFBSSxDQUFDQyxTQUFTLENBQUN1TyxJQUFJLENBQUMsQ0FBQztNQUNuRixNQUFNRSxDQUFDLENBQUNaLElBQUksQ0FDVCx5R0FBd0csRUFDekdwSSxNQUFNLENBQ1A7SUFDSCxDQUFDLENBQUM7SUFDRixJQUFJLENBQUNxSSxtQkFBbUIsRUFBRTtFQUM1QjtFQUVBLE1BQU1ZLDBCQUEwQixDQUM5QjlMLFNBQWlCLEVBQ2pCK0wsZ0JBQXFCLEVBQ3JCQyxlQUFvQixHQUFHLENBQUMsQ0FBQyxFQUN6Qi9MLE1BQVcsRUFDWG9MLElBQVUsRUFDSztJQUNmQSxJQUFJLEdBQUdBLElBQUksSUFBSSxJQUFJLENBQUMzQixPQUFPO0lBQzNCLE1BQU11QyxJQUFJLEdBQUcsSUFBSTtJQUNqQixJQUFJRixnQkFBZ0IsS0FBS2hOLFNBQVMsRUFBRTtNQUNsQyxPQUFPbU4sT0FBTyxDQUFDQyxPQUFPLEVBQUU7SUFDMUI7SUFDQSxJQUFJaE4sTUFBTSxDQUFDeUIsSUFBSSxDQUFDb0wsZUFBZSxDQUFDLENBQUNwUCxNQUFNLEtBQUssQ0FBQyxFQUFFO01BQzdDb1AsZUFBZSxHQUFHO1FBQUVJLElBQUksRUFBRTtVQUFFQyxHQUFHLEVBQUU7UUFBRTtNQUFFLENBQUM7SUFDeEM7SUFDQSxNQUFNQyxjQUFjLEdBQUcsRUFBRTtJQUN6QixNQUFNQyxlQUFlLEdBQUcsRUFBRTtJQUMxQnBOLE1BQU0sQ0FBQ3lCLElBQUksQ0FBQ21MLGdCQUFnQixDQUFDLENBQUNsTCxPQUFPLENBQUNsQyxJQUFJLElBQUk7TUFDNUMsTUFBTTRELEtBQUssR0FBR3dKLGdCQUFnQixDQUFDcE4sSUFBSSxDQUFDO01BQ3BDLElBQUlxTixlQUFlLENBQUNyTixJQUFJLENBQUMsSUFBSTRELEtBQUssQ0FBQ2pCLElBQUksS0FBSyxRQUFRLEVBQUU7UUFDcEQsTUFBTSxJQUFJWSxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNxSyxhQUFhLEVBQUcsU0FBUTdOLElBQUsseUJBQXdCLENBQUM7TUFDMUY7TUFDQSxJQUFJLENBQUNxTixlQUFlLENBQUNyTixJQUFJLENBQUMsSUFBSTRELEtBQUssQ0FBQ2pCLElBQUksS0FBSyxRQUFRLEVBQUU7UUFDckQsTUFBTSxJQUFJWSxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDcUssYUFBYSxFQUN4QixTQUFRN04sSUFBSyxpQ0FBZ0MsQ0FDL0M7TUFDSDtNQUNBLElBQUk0RCxLQUFLLENBQUNqQixJQUFJLEtBQUssUUFBUSxFQUFFO1FBQzNCZ0wsY0FBYyxDQUFDOUosSUFBSSxDQUFDN0QsSUFBSSxDQUFDO1FBQ3pCLE9BQU9xTixlQUFlLENBQUNyTixJQUFJLENBQUM7TUFDOUIsQ0FBQyxNQUFNO1FBQ0xRLE1BQU0sQ0FBQ3lCLElBQUksQ0FBQzJCLEtBQUssQ0FBQyxDQUFDMUIsT0FBTyxDQUFDbUIsR0FBRyxJQUFJO1VBQ2hDLElBQ0UsQ0FBQyxJQUFJLENBQUNzSCwyQkFBMkIsSUFDakMsQ0FBQ25LLE1BQU0sQ0FBQ3NOLFNBQVMsQ0FBQ0MsY0FBYyxDQUFDQyxJQUFJLENBQUMxTSxNQUFNLEVBQUUrQixHQUFHLENBQUMsRUFDbEQ7WUFDQSxNQUFNLElBQUlFLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUNxSyxhQUFhLEVBQ3hCLFNBQVF4SyxHQUFJLG9DQUFtQyxDQUNqRDtVQUNIO1FBQ0YsQ0FBQyxDQUFDO1FBQ0ZnSyxlQUFlLENBQUNyTixJQUFJLENBQUMsR0FBRzRELEtBQUs7UUFDN0JnSyxlQUFlLENBQUMvSixJQUFJLENBQUM7VUFDbkJSLEdBQUcsRUFBRU8sS0FBSztVQUNWNUQ7UUFDRixDQUFDLENBQUM7TUFDSjtJQUNGLENBQUMsQ0FBQztJQUNGLE1BQU0wTSxJQUFJLENBQUN1QixFQUFFLENBQUMsZ0NBQWdDLEVBQUUsTUFBTWYsQ0FBQyxJQUFJO01BQ3pELElBQUk7UUFDRixJQUFJVSxlQUFlLENBQUMzUCxNQUFNLEdBQUcsQ0FBQyxFQUFFO1VBQzlCLE1BQU1xUCxJQUFJLENBQUNZLGFBQWEsQ0FBQzdNLFNBQVMsRUFBRXVNLGVBQWUsRUFBRVYsQ0FBQyxDQUFDO1FBQ3pEO01BQ0YsQ0FBQyxDQUFDLE9BQU9pQixDQUFDLEVBQUU7UUFBQTtRQUNWLE1BQU1DLHVCQUF1QixHQUFHLGNBQUFELENBQUMsQ0FBQ0UsTUFBTSw0REFBUixVQUFXLENBQUMsQ0FBQywrQ0FBYixXQUFlQyxJQUFJLE1BQUssT0FBTztRQUMvRCxJQUFJRix1QkFBdUIsSUFBSSxDQUFDLElBQUksQ0FBQ3pELDJCQUEyQixFQUFFO1VBQ2hFLE1BQU13RCxDQUFDO1FBQ1Q7TUFDRjtNQUNBLElBQUlSLGNBQWMsQ0FBQzFQLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDN0IsTUFBTXFQLElBQUksQ0FBQ2lCLFdBQVcsQ0FBQ2xOLFNBQVMsRUFBRXNNLGNBQWMsRUFBRVQsQ0FBQyxDQUFDO01BQ3REO01BQ0EsTUFBTUEsQ0FBQyxDQUFDWixJQUFJLENBQ1YseUdBQXlHLEVBQ3pHLENBQUNqTCxTQUFTLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRTdDLElBQUksQ0FBQ0MsU0FBUyxDQUFDNE8sZUFBZSxDQUFDLENBQUMsQ0FDbEU7SUFDSCxDQUFDLENBQUM7SUFDRixJQUFJLENBQUNkLG1CQUFtQixFQUFFO0VBQzVCO0VBRUEsTUFBTWlDLFdBQVcsQ0FBQ25OLFNBQWlCLEVBQUVELE1BQWtCLEVBQUVzTCxJQUFVLEVBQUU7SUFDbkVBLElBQUksR0FBR0EsSUFBSSxJQUFJLElBQUksQ0FBQzNCLE9BQU87SUFDM0IsTUFBTTBELFdBQVcsR0FBRyxNQUFNL0IsSUFBSSxDQUMzQnVCLEVBQUUsQ0FBQyxjQUFjLEVBQUUsTUFBTWYsQ0FBQyxJQUFJO01BQzdCLE1BQU0sSUFBSSxDQUFDd0IsV0FBVyxDQUFDck4sU0FBUyxFQUFFRCxNQUFNLEVBQUU4TCxDQUFDLENBQUM7TUFDNUMsTUFBTUEsQ0FBQyxDQUFDWixJQUFJLENBQ1Ysc0dBQXNHLEVBQ3RHO1FBQUVqTCxTQUFTO1FBQUVEO01BQU8sQ0FBQyxDQUN0QjtNQUNELE1BQU0sSUFBSSxDQUFDK0wsMEJBQTBCLENBQUM5TCxTQUFTLEVBQUVELE1BQU0sQ0FBQ1EsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFUixNQUFNLENBQUNFLE1BQU0sRUFBRTRMLENBQUMsQ0FBQztNQUN0RixPQUFPL0wsYUFBYSxDQUFDQyxNQUFNLENBQUM7SUFDOUIsQ0FBQyxDQUFDLENBQ0RvTCxLQUFLLENBQUNtQyxHQUFHLElBQUk7TUFDWixJQUFJQSxHQUFHLENBQUNMLElBQUksS0FBSzVRLGlDQUFpQyxJQUFJaVIsR0FBRyxDQUFDQyxNQUFNLENBQUN0TCxRQUFRLENBQUNqQyxTQUFTLENBQUMsRUFBRTtRQUNwRixNQUFNLElBQUlrQyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNxTCxlQUFlLEVBQUcsU0FBUXhOLFNBQVUsa0JBQWlCLENBQUM7TUFDMUY7TUFDQSxNQUFNc04sR0FBRztJQUNYLENBQUMsQ0FBQztJQUNKLElBQUksQ0FBQ3BDLG1CQUFtQixFQUFFO0lBQzFCLE9BQU9rQyxXQUFXO0VBQ3BCOztFQUVBO0VBQ0EsTUFBTUMsV0FBVyxDQUFDck4sU0FBaUIsRUFBRUQsTUFBa0IsRUFBRXNMLElBQVMsRUFBRTtJQUNsRUEsSUFBSSxHQUFHQSxJQUFJLElBQUksSUFBSSxDQUFDM0IsT0FBTztJQUMzQm5OLEtBQUssQ0FBQyxhQUFhLENBQUM7SUFDcEIsTUFBTWtSLFdBQVcsR0FBRyxFQUFFO0lBQ3RCLE1BQU1DLGFBQWEsR0FBRyxFQUFFO0lBQ3hCLE1BQU16TixNQUFNLEdBQUdkLE1BQU0sQ0FBQ3dPLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRTVOLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDO0lBQy9DLElBQUlELFNBQVMsS0FBSyxPQUFPLEVBQUU7TUFDekJDLE1BQU0sQ0FBQzJOLDhCQUE4QixHQUFHO1FBQUUzUSxJQUFJLEVBQUU7TUFBTyxDQUFDO01BQ3hEZ0QsTUFBTSxDQUFDNE4sbUJBQW1CLEdBQUc7UUFBRTVRLElBQUksRUFBRTtNQUFTLENBQUM7TUFDL0NnRCxNQUFNLENBQUM2TiwyQkFBMkIsR0FBRztRQUFFN1EsSUFBSSxFQUFFO01BQU8sQ0FBQztNQUNyRGdELE1BQU0sQ0FBQzhOLG1CQUFtQixHQUFHO1FBQUU5USxJQUFJLEVBQUU7TUFBUyxDQUFDO01BQy9DZ0QsTUFBTSxDQUFDK04saUJBQWlCLEdBQUc7UUFBRS9RLElBQUksRUFBRTtNQUFTLENBQUM7TUFDN0NnRCxNQUFNLENBQUNnTyw0QkFBNEIsR0FBRztRQUFFaFIsSUFBSSxFQUFFO01BQU8sQ0FBQztNQUN0RGdELE1BQU0sQ0FBQ2lPLG9CQUFvQixHQUFHO1FBQUVqUixJQUFJLEVBQUU7TUFBTyxDQUFDO01BQzlDZ0QsTUFBTSxDQUFDUSxpQkFBaUIsR0FBRztRQUFFeEQsSUFBSSxFQUFFO01BQVEsQ0FBQztJQUM5QztJQUNBLElBQUl5RSxLQUFLLEdBQUcsQ0FBQztJQUNiLE1BQU15TSxTQUFTLEdBQUcsRUFBRTtJQUNwQmhQLE1BQU0sQ0FBQ3lCLElBQUksQ0FBQ1gsTUFBTSxDQUFDLENBQUNZLE9BQU8sQ0FBQ0MsU0FBUyxJQUFJO01BQ3ZDLE1BQU1zTixTQUFTLEdBQUduTyxNQUFNLENBQUNhLFNBQVMsQ0FBQztNQUNuQztNQUNBO01BQ0EsSUFBSXNOLFNBQVMsQ0FBQ25SLElBQUksS0FBSyxVQUFVLEVBQUU7UUFDakNrUixTQUFTLENBQUMzTCxJQUFJLENBQUMxQixTQUFTLENBQUM7UUFDekI7TUFDRjtNQUNBLElBQUksQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUNDLE9BQU8sQ0FBQ0QsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ2hEc04sU0FBUyxDQUFDbFIsUUFBUSxHQUFHO1VBQUVELElBQUksRUFBRTtRQUFTLENBQUM7TUFDekM7TUFDQXdRLFdBQVcsQ0FBQ2pMLElBQUksQ0FBQzFCLFNBQVMsQ0FBQztNQUMzQjJNLFdBQVcsQ0FBQ2pMLElBQUksQ0FBQ3hGLHVCQUF1QixDQUFDb1IsU0FBUyxDQUFDLENBQUM7TUFDcERWLGFBQWEsQ0FBQ2xMLElBQUksQ0FBRSxJQUFHZCxLQUFNLFVBQVNBLEtBQUssR0FBRyxDQUFFLE1BQUssQ0FBQztNQUN0RCxJQUFJWixTQUFTLEtBQUssVUFBVSxFQUFFO1FBQzVCNE0sYUFBYSxDQUFDbEwsSUFBSSxDQUFFLGlCQUFnQmQsS0FBTSxRQUFPLENBQUM7TUFDcEQ7TUFDQUEsS0FBSyxHQUFHQSxLQUFLLEdBQUcsQ0FBQztJQUNuQixDQUFDLENBQUM7SUFDRixNQUFNMk0sRUFBRSxHQUFJLHVDQUFzQ1gsYUFBYSxDQUFDOUwsSUFBSSxFQUFHLEdBQUU7SUFDekUsTUFBTWlCLE1BQU0sR0FBRyxDQUFDN0MsU0FBUyxFQUFFLEdBQUd5TixXQUFXLENBQUM7SUFFMUMsT0FBT3BDLElBQUksQ0FBQ08sSUFBSSxDQUFDLGNBQWMsRUFBRSxNQUFNQyxDQUFDLElBQUk7TUFDMUMsSUFBSTtRQUNGLE1BQU1BLENBQUMsQ0FBQ1osSUFBSSxDQUFDb0QsRUFBRSxFQUFFeEwsTUFBTSxDQUFDO01BQzFCLENBQUMsQ0FBQyxPQUFPNkYsS0FBSyxFQUFFO1FBQ2QsSUFBSUEsS0FBSyxDQUFDdUUsSUFBSSxLQUFLL1EsOEJBQThCLEVBQUU7VUFDakQsTUFBTXdNLEtBQUs7UUFDYjtRQUNBO01BQ0Y7O01BQ0EsTUFBTW1ELENBQUMsQ0FBQ2UsRUFBRSxDQUFDLGlCQUFpQixFQUFFQSxFQUFFLElBQUk7UUFDbEMsT0FBT0EsRUFBRSxDQUFDMEIsS0FBSyxDQUNiSCxTQUFTLENBQUMzTSxHQUFHLENBQUNWLFNBQVMsSUFBSTtVQUN6QixPQUFPOEwsRUFBRSxDQUFDM0IsSUFBSSxDQUNaLHlJQUF5SSxFQUN6STtZQUFFc0QsU0FBUyxFQUFHLFNBQVF6TixTQUFVLElBQUdkLFNBQVU7VUFBRSxDQUFDLENBQ2pEO1FBQ0gsQ0FBQyxDQUFDLENBQ0g7TUFDSCxDQUFDLENBQUM7SUFDSixDQUFDLENBQUM7RUFDSjtFQUVBLE1BQU13TyxhQUFhLENBQUN4TyxTQUFpQixFQUFFRCxNQUFrQixFQUFFc0wsSUFBUyxFQUFFO0lBQ3BFOU8sS0FBSyxDQUFDLGVBQWUsQ0FBQztJQUN0QjhPLElBQUksR0FBR0EsSUFBSSxJQUFJLElBQUksQ0FBQzNCLE9BQU87SUFDM0IsTUFBTXVDLElBQUksR0FBRyxJQUFJO0lBRWpCLE1BQU1aLElBQUksQ0FBQ08sSUFBSSxDQUFDLGdCQUFnQixFQUFFLE1BQU1DLENBQUMsSUFBSTtNQUMzQyxNQUFNNEMsT0FBTyxHQUFHLE1BQU01QyxDQUFDLENBQUNySyxHQUFHLENBQ3pCLG9GQUFvRixFQUNwRjtRQUFFeEI7TUFBVSxDQUFDLEVBQ2J3TCxDQUFDLElBQUlBLENBQUMsQ0FBQ2tELFdBQVcsQ0FDbkI7TUFDRCxNQUFNQyxVQUFVLEdBQUd4UCxNQUFNLENBQUN5QixJQUFJLENBQUNiLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDLENBQzFDMk8sTUFBTSxDQUFDQyxJQUFJLElBQUlKLE9BQU8sQ0FBQzFOLE9BQU8sQ0FBQzhOLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQzVDck4sR0FBRyxDQUFDVixTQUFTLElBQUltTCxJQUFJLENBQUM2QyxtQkFBbUIsQ0FBQzlPLFNBQVMsRUFBRWMsU0FBUyxFQUFFZixNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLENBQUMsQ0FBQztNQUU3RixNQUFNK0ssQ0FBQyxDQUFDeUMsS0FBSyxDQUFDSyxVQUFVLENBQUM7SUFDM0IsQ0FBQyxDQUFDO0VBQ0o7RUFFQSxNQUFNRyxtQkFBbUIsQ0FBQzlPLFNBQWlCLEVBQUVjLFNBQWlCLEVBQUU3RCxJQUFTLEVBQUU7SUFDekU7SUFDQVYsS0FBSyxDQUFDLHFCQUFxQixDQUFDO0lBQzVCLE1BQU0wUCxJQUFJLEdBQUcsSUFBSTtJQUNqQixNQUFNLElBQUksQ0FBQ3ZDLE9BQU8sQ0FBQ2tELEVBQUUsQ0FBQyx5QkFBeUIsRUFBRSxNQUFNZixDQUFDLElBQUk7TUFDMUQsSUFBSTVPLElBQUksQ0FBQ0EsSUFBSSxLQUFLLFVBQVUsRUFBRTtRQUM1QixJQUFJO1VBQ0YsTUFBTTRPLENBQUMsQ0FBQ1osSUFBSSxDQUNWLDhGQUE4RixFQUM5RjtZQUNFakwsU0FBUztZQUNUYyxTQUFTO1lBQ1RpTyxZQUFZLEVBQUUvUix1QkFBdUIsQ0FBQ0MsSUFBSTtVQUM1QyxDQUFDLENBQ0Y7UUFDSCxDQUFDLENBQUMsT0FBT3lMLEtBQUssRUFBRTtVQUNkLElBQUlBLEtBQUssQ0FBQ3VFLElBQUksS0FBS2hSLGlDQUFpQyxFQUFFO1lBQ3BELE9BQU9nUSxJQUFJLENBQUNrQixXQUFXLENBQUNuTixTQUFTLEVBQUU7Y0FBRUMsTUFBTSxFQUFFO2dCQUFFLENBQUNhLFNBQVMsR0FBRzdEO2NBQUs7WUFBRSxDQUFDLEVBQUU0TyxDQUFDLENBQUM7VUFDMUU7VUFDQSxJQUFJbkQsS0FBSyxDQUFDdUUsSUFBSSxLQUFLOVEsNEJBQTRCLEVBQUU7WUFDL0MsTUFBTXVNLEtBQUs7VUFDYjtVQUNBO1FBQ0Y7TUFDRixDQUFDLE1BQU07UUFDTCxNQUFNbUQsQ0FBQyxDQUFDWixJQUFJLENBQ1YseUlBQXlJLEVBQ3pJO1VBQUVzRCxTQUFTLEVBQUcsU0FBUXpOLFNBQVUsSUFBR2QsU0FBVTtRQUFFLENBQUMsQ0FDakQ7TUFDSDtNQUVBLE1BQU13SSxNQUFNLEdBQUcsTUFBTXFELENBQUMsQ0FBQ21ELEdBQUcsQ0FDeEIsNEhBQTRILEVBQzVIO1FBQUVoUCxTQUFTO1FBQUVjO01BQVUsQ0FBQyxDQUN6QjtNQUVELElBQUkwSCxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDYixNQUFNLDhDQUE4QztNQUN0RCxDQUFDLE1BQU07UUFDTCxNQUFNeUcsSUFBSSxHQUFJLFdBQVVuTyxTQUFVLEdBQUU7UUFDcEMsTUFBTStLLENBQUMsQ0FBQ1osSUFBSSxDQUNWLHFHQUFxRyxFQUNyRztVQUFFZ0UsSUFBSTtVQUFFaFMsSUFBSTtVQUFFK0M7UUFBVSxDQUFDLENBQzFCO01BQ0g7SUFDRixDQUFDLENBQUM7SUFDRixJQUFJLENBQUNrTCxtQkFBbUIsRUFBRTtFQUM1QjtFQUVBLE1BQU1nRSxrQkFBa0IsQ0FBQ2xQLFNBQWlCLEVBQUVjLFNBQWlCLEVBQUU3RCxJQUFTLEVBQUU7SUFDeEUsTUFBTSxJQUFJLENBQUN5TSxPQUFPLENBQUNrRCxFQUFFLENBQUMsNkJBQTZCLEVBQUUsTUFBTWYsQ0FBQyxJQUFJO01BQzlELE1BQU1vRCxJQUFJLEdBQUksV0FBVW5PLFNBQVUsR0FBRTtNQUNwQyxNQUFNK0ssQ0FBQyxDQUFDWixJQUFJLENBQ1YscUdBQXFHLEVBQ3JHO1FBQUVnRSxJQUFJO1FBQUVoUyxJQUFJO1FBQUUrQztNQUFVLENBQUMsQ0FDMUI7SUFDSCxDQUFDLENBQUM7RUFDSjs7RUFFQTtFQUNBO0VBQ0EsTUFBTW1QLFdBQVcsQ0FBQ25QLFNBQWlCLEVBQUU7SUFDbkMsTUFBTW9QLFVBQVUsR0FBRyxDQUNqQjtNQUFFMU0sS0FBSyxFQUFHLDhCQUE2QjtNQUFFRyxNQUFNLEVBQUUsQ0FBQzdDLFNBQVM7SUFBRSxDQUFDLEVBQzlEO01BQ0UwQyxLQUFLLEVBQUcsOENBQTZDO01BQ3JERyxNQUFNLEVBQUUsQ0FBQzdDLFNBQVM7SUFDcEIsQ0FBQyxDQUNGO0lBQ0QsTUFBTXFQLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQzNGLE9BQU8sQ0FDaENrRCxFQUFFLENBQUNmLENBQUMsSUFBSUEsQ0FBQyxDQUFDWixJQUFJLENBQUMsSUFBSSxDQUFDckIsSUFBSSxDQUFDMEYsT0FBTyxDQUFDNVMsTUFBTSxDQUFDMFMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUNyREcsSUFBSSxDQUFDLE1BQU12UCxTQUFTLENBQUNlLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDOztJQUVqRCxJQUFJLENBQUNtSyxtQkFBbUIsRUFBRTtJQUMxQixPQUFPbUUsUUFBUTtFQUNqQjs7RUFFQTtFQUNBLE1BQU1HLGdCQUFnQixHQUFHO0lBQUE7SUFDdkIsTUFBTUMsR0FBRyxHQUFHLElBQUlDLElBQUksRUFBRSxDQUFDQyxPQUFPLEVBQUU7SUFDaEMsTUFBTUwsT0FBTyxHQUFHLElBQUksQ0FBQzFGLElBQUksQ0FBQzBGLE9BQU87SUFDakMvUyxLQUFLLENBQUMsa0JBQWtCLENBQUM7SUFDekIscUJBQUksSUFBSSxDQUFDbU4sT0FBTywwQ0FBWixjQUFjYSxLQUFLLENBQUNxRixLQUFLLEVBQUU7TUFDN0I7SUFDRjtJQUNBLE1BQU0sSUFBSSxDQUFDbEcsT0FBTyxDQUNma0MsSUFBSSxDQUFDLG9CQUFvQixFQUFFLE1BQU1DLENBQUMsSUFBSTtNQUNyQyxJQUFJO1FBQ0YsTUFBTWdFLE9BQU8sR0FBRyxNQUFNaEUsQ0FBQyxDQUFDbUQsR0FBRyxDQUFDLHlCQUF5QixDQUFDO1FBQ3RELE1BQU1jLEtBQUssR0FBR0QsT0FBTyxDQUFDRSxNQUFNLENBQUMsQ0FBQ3pOLElBQW1CLEVBQUV2QyxNQUFXLEtBQUs7VUFDakUsT0FBT3VDLElBQUksQ0FBQzVGLE1BQU0sQ0FBQzJGLG1CQUFtQixDQUFDdEMsTUFBTSxDQUFDQSxNQUFNLENBQUMsQ0FBQztRQUN4RCxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ04sTUFBTWlRLE9BQU8sR0FBRyxDQUNkLFNBQVMsRUFDVCxhQUFhLEVBQ2IsWUFBWSxFQUNaLGNBQWMsRUFDZCxRQUFRLEVBQ1IsZUFBZSxFQUNmLGdCQUFnQixFQUNoQixXQUFXLEVBQ1gsY0FBYyxFQUNkLEdBQUdILE9BQU8sQ0FBQ3JPLEdBQUcsQ0FBQ2dILE1BQU0sSUFBSUEsTUFBTSxDQUFDeEksU0FBUyxDQUFDLEVBQzFDLEdBQUc4UCxLQUFLLENBQ1Q7UUFDRCxNQUFNRyxPQUFPLEdBQUdELE9BQU8sQ0FBQ3hPLEdBQUcsQ0FBQ3hCLFNBQVMsS0FBSztVQUN4QzBDLEtBQUssRUFBRSx3Q0FBd0M7VUFDL0NHLE1BQU0sRUFBRTtZQUFFN0M7VUFBVTtRQUN0QixDQUFDLENBQUMsQ0FBQztRQUNILE1BQU02TCxDQUFDLENBQUNlLEVBQUUsQ0FBQ0EsRUFBRSxJQUFJQSxFQUFFLENBQUMzQixJQUFJLENBQUNxRSxPQUFPLENBQUM1UyxNQUFNLENBQUN1VCxPQUFPLENBQUMsQ0FBQyxDQUFDO01BQ3BELENBQUMsQ0FBQyxPQUFPdkgsS0FBSyxFQUFFO1FBQ2QsSUFBSUEsS0FBSyxDQUFDdUUsSUFBSSxLQUFLaFIsaUNBQWlDLEVBQUU7VUFDcEQsTUFBTXlNLEtBQUs7UUFDYjtRQUNBO01BQ0Y7SUFDRixDQUFDLENBQUMsQ0FDRDZHLElBQUksQ0FBQyxNQUFNO01BQ1ZoVCxLQUFLLENBQUUsNEJBQTJCLElBQUltVCxJQUFJLEVBQUUsQ0FBQ0MsT0FBTyxFQUFFLEdBQUdGLEdBQUksRUFBQyxDQUFDO0lBQ2pFLENBQUMsQ0FBQztFQUNOOztFQUVBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBOztFQUVBO0VBQ0E7RUFDQTs7RUFFQTtFQUNBLE1BQU1TLFlBQVksQ0FBQ2xRLFNBQWlCLEVBQUVELE1BQWtCLEVBQUVvUSxVQUFvQixFQUFpQjtJQUM3RjVULEtBQUssQ0FBQyxjQUFjLENBQUM7SUFDckI0VCxVQUFVLEdBQUdBLFVBQVUsQ0FBQ0osTUFBTSxDQUFDLENBQUN6TixJQUFtQixFQUFFeEIsU0FBaUIsS0FBSztNQUN6RSxNQUFNeUIsS0FBSyxHQUFHeEMsTUFBTSxDQUFDRSxNQUFNLENBQUNhLFNBQVMsQ0FBQztNQUN0QyxJQUFJeUIsS0FBSyxDQUFDdEYsSUFBSSxLQUFLLFVBQVUsRUFBRTtRQUM3QnFGLElBQUksQ0FBQ0UsSUFBSSxDQUFDMUIsU0FBUyxDQUFDO01BQ3RCO01BQ0EsT0FBT2YsTUFBTSxDQUFDRSxNQUFNLENBQUNhLFNBQVMsQ0FBQztNQUMvQixPQUFPd0IsSUFBSTtJQUNiLENBQUMsRUFBRSxFQUFFLENBQUM7SUFFTixNQUFNTyxNQUFNLEdBQUcsQ0FBQzdDLFNBQVMsRUFBRSxHQUFHbVEsVUFBVSxDQUFDO0lBQ3pDLE1BQU0xQixPQUFPLEdBQUcwQixVQUFVLENBQ3ZCM08sR0FBRyxDQUFDLENBQUM3QyxJQUFJLEVBQUV5UixHQUFHLEtBQUs7TUFDbEIsT0FBUSxJQUFHQSxHQUFHLEdBQUcsQ0FBRSxPQUFNO0lBQzNCLENBQUMsQ0FBQyxDQUNEeE8sSUFBSSxDQUFDLGVBQWUsQ0FBQztJQUV4QixNQUFNLElBQUksQ0FBQzhILE9BQU8sQ0FBQ2tELEVBQUUsQ0FBQyxlQUFlLEVBQUUsTUFBTWYsQ0FBQyxJQUFJO01BQ2hELE1BQU1BLENBQUMsQ0FBQ1osSUFBSSxDQUFDLDRFQUE0RSxFQUFFO1FBQ3pGbEwsTUFBTTtRQUNOQztNQUNGLENBQUMsQ0FBQztNQUNGLElBQUk2QyxNQUFNLENBQUNqRyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1FBQ3JCLE1BQU1pUCxDQUFDLENBQUNaLElBQUksQ0FBRSw2Q0FBNEN3RCxPQUFRLEVBQUMsRUFBRTVMLE1BQU0sQ0FBQztNQUM5RTtJQUNGLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQ3FJLG1CQUFtQixFQUFFO0VBQzVCOztFQUVBO0VBQ0E7RUFDQTtFQUNBLE1BQU1tRixhQUFhLEdBQUc7SUFDcEIsT0FBTyxJQUFJLENBQUMzRyxPQUFPLENBQUNrQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsTUFBTUMsQ0FBQyxJQUFJO01BQ3JELE9BQU8sTUFBTUEsQ0FBQyxDQUFDckssR0FBRyxDQUFDLHlCQUF5QixFQUFFLElBQUksRUFBRThPLEdBQUcsSUFDckR4USxhQUFhO1FBQUdFLFNBQVMsRUFBRXNRLEdBQUcsQ0FBQ3RRO01BQVMsR0FBS3NRLEdBQUcsQ0FBQ3ZRLE1BQU0sRUFBRyxDQUMzRDtJQUNILENBQUMsQ0FBQztFQUNKOztFQUVBO0VBQ0E7RUFDQTtFQUNBLE1BQU13USxRQUFRLENBQUN2USxTQUFpQixFQUFFO0lBQ2hDekQsS0FBSyxDQUFDLFVBQVUsQ0FBQztJQUNqQixPQUFPLElBQUksQ0FBQ21OLE9BQU8sQ0FDaEJzRixHQUFHLENBQUMsMERBQTBELEVBQUU7TUFDL0RoUDtJQUNGLENBQUMsQ0FBQyxDQUNEdVAsSUFBSSxDQUFDL0csTUFBTSxJQUFJO01BQ2QsSUFBSUEsTUFBTSxDQUFDNUwsTUFBTSxLQUFLLENBQUMsRUFBRTtRQUN2QixNQUFNbUMsU0FBUztNQUNqQjtNQUNBLE9BQU95SixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUN6SSxNQUFNO0lBQ3pCLENBQUMsQ0FBQyxDQUNEd1AsSUFBSSxDQUFDelAsYUFBYSxDQUFDO0VBQ3hCOztFQUVBO0VBQ0EsTUFBTTBRLFlBQVksQ0FDaEJ4USxTQUFpQixFQUNqQkQsTUFBa0IsRUFDbEJZLE1BQVcsRUFDWDhQLG9CQUEwQixFQUMxQjtJQUNBbFUsS0FBSyxDQUFDLGNBQWMsQ0FBQztJQUNyQixJQUFJbVUsWUFBWSxHQUFHLEVBQUU7SUFDckIsTUFBTWpELFdBQVcsR0FBRyxFQUFFO0lBQ3RCMU4sTUFBTSxHQUFHUyxnQkFBZ0IsQ0FBQ1QsTUFBTSxDQUFDO0lBQ2pDLE1BQU00USxTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBRXBCaFEsTUFBTSxHQUFHRCxlQUFlLENBQUNDLE1BQU0sQ0FBQztJQUVoQ29CLFlBQVksQ0FBQ3BCLE1BQU0sQ0FBQztJQUVwQnhCLE1BQU0sQ0FBQ3lCLElBQUksQ0FBQ0QsTUFBTSxDQUFDLENBQUNFLE9BQU8sQ0FBQ0MsU0FBUyxJQUFJO01BQ3ZDLElBQUlILE1BQU0sQ0FBQ0csU0FBUyxDQUFDLEtBQUssSUFBSSxFQUFFO1FBQzlCO01BQ0Y7TUFDQSxJQUFJcUMsYUFBYSxHQUFHckMsU0FBUyxDQUFDc0MsS0FBSyxDQUFDLDhCQUE4QixDQUFDO01BQ25FLE1BQU13TixxQkFBcUIsR0FBRyxDQUFDLENBQUNqUSxNQUFNLENBQUNrUSxRQUFRO01BQy9DLElBQUkxTixhQUFhLEVBQUU7UUFDakIsSUFBSTJOLFFBQVEsR0FBRzNOLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDL0J4QyxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUdBLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0NBLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQ21RLFFBQVEsQ0FBQyxHQUFHblEsTUFBTSxDQUFDRyxTQUFTLENBQUM7UUFDaEQsT0FBT0gsTUFBTSxDQUFDRyxTQUFTLENBQUM7UUFDeEJBLFNBQVMsR0FBRyxVQUFVO1FBQ3RCO1FBQ0EsSUFBSThQLHFCQUFxQixFQUFFO1VBQ3pCO1FBQ0Y7TUFDRjtNQUVBRixZQUFZLENBQUNsTyxJQUFJLENBQUMxQixTQUFTLENBQUM7TUFDNUIsSUFBSSxDQUFDZixNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLElBQUlkLFNBQVMsS0FBSyxPQUFPLEVBQUU7UUFDdEQsSUFDRWMsU0FBUyxLQUFLLHFCQUFxQixJQUNuQ0EsU0FBUyxLQUFLLHFCQUFxQixJQUNuQ0EsU0FBUyxLQUFLLG1CQUFtQixJQUNqQ0EsU0FBUyxLQUFLLG1CQUFtQixFQUNqQztVQUNBMk0sV0FBVyxDQUFDakwsSUFBSSxDQUFDN0IsTUFBTSxDQUFDRyxTQUFTLENBQUMsQ0FBQztRQUNyQztRQUVBLElBQUlBLFNBQVMsS0FBSyxnQ0FBZ0MsRUFBRTtVQUNsRCxJQUFJSCxNQUFNLENBQUNHLFNBQVMsQ0FBQyxFQUFFO1lBQ3JCMk0sV0FBVyxDQUFDakwsSUFBSSxDQUFDN0IsTUFBTSxDQUFDRyxTQUFTLENBQUMsQ0FBQ3BDLEdBQUcsQ0FBQztVQUN6QyxDQUFDLE1BQU07WUFDTCtPLFdBQVcsQ0FBQ2pMLElBQUksQ0FBQyxJQUFJLENBQUM7VUFDeEI7UUFDRjtRQUVBLElBQ0UxQixTQUFTLEtBQUssNkJBQTZCLElBQzNDQSxTQUFTLEtBQUssOEJBQThCLElBQzVDQSxTQUFTLEtBQUssc0JBQXNCLEVBQ3BDO1VBQ0EsSUFBSUgsTUFBTSxDQUFDRyxTQUFTLENBQUMsRUFBRTtZQUNyQjJNLFdBQVcsQ0FBQ2pMLElBQUksQ0FBQzdCLE1BQU0sQ0FBQ0csU0FBUyxDQUFDLENBQUNwQyxHQUFHLENBQUM7VUFDekMsQ0FBQyxNQUFNO1lBQ0wrTyxXQUFXLENBQUNqTCxJQUFJLENBQUMsSUFBSSxDQUFDO1VBQ3hCO1FBQ0Y7UUFDQTtNQUNGO01BQ0EsUUFBUXpDLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDYSxTQUFTLENBQUMsQ0FBQzdELElBQUk7UUFDbkMsS0FBSyxNQUFNO1VBQ1QsSUFBSTBELE1BQU0sQ0FBQ0csU0FBUyxDQUFDLEVBQUU7WUFDckIyTSxXQUFXLENBQUNqTCxJQUFJLENBQUM3QixNQUFNLENBQUNHLFNBQVMsQ0FBQyxDQUFDcEMsR0FBRyxDQUFDO1VBQ3pDLENBQUMsTUFBTTtZQUNMK08sV0FBVyxDQUFDakwsSUFBSSxDQUFDLElBQUksQ0FBQztVQUN4QjtVQUNBO1FBQ0YsS0FBSyxTQUFTO1VBQ1ppTCxXQUFXLENBQUNqTCxJQUFJLENBQUM3QixNQUFNLENBQUNHLFNBQVMsQ0FBQyxDQUFDN0IsUUFBUSxDQUFDO1VBQzVDO1FBQ0YsS0FBSyxPQUFPO1VBQ1YsSUFBSSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQzhCLE9BQU8sQ0FBQ0QsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQ2hEMk0sV0FBVyxDQUFDakwsSUFBSSxDQUFDN0IsTUFBTSxDQUFDRyxTQUFTLENBQUMsQ0FBQztVQUNyQyxDQUFDLE1BQU07WUFDTDJNLFdBQVcsQ0FBQ2pMLElBQUksQ0FBQ3JGLElBQUksQ0FBQ0MsU0FBUyxDQUFDdUQsTUFBTSxDQUFDRyxTQUFTLENBQUMsQ0FBQyxDQUFDO1VBQ3JEO1VBQ0E7UUFDRixLQUFLLFFBQVE7UUFDYixLQUFLLE9BQU87UUFDWixLQUFLLFFBQVE7UUFDYixLQUFLLFFBQVE7UUFDYixLQUFLLFNBQVM7VUFDWjJNLFdBQVcsQ0FBQ2pMLElBQUksQ0FBQzdCLE1BQU0sQ0FBQ0csU0FBUyxDQUFDLENBQUM7VUFDbkM7UUFDRixLQUFLLE1BQU07VUFDVDJNLFdBQVcsQ0FBQ2pMLElBQUksQ0FBQzdCLE1BQU0sQ0FBQ0csU0FBUyxDQUFDLENBQUNuQyxJQUFJLENBQUM7VUFDeEM7UUFDRixLQUFLLFNBQVM7VUFBRTtZQUNkLE1BQU1ILEtBQUssR0FBRzBKLG1CQUFtQixDQUFDdkgsTUFBTSxDQUFDRyxTQUFTLENBQUMsQ0FBQzRHLFdBQVcsQ0FBQztZQUNoRStGLFdBQVcsQ0FBQ2pMLElBQUksQ0FBQ2hFLEtBQUssQ0FBQztZQUN2QjtVQUNGO1FBQ0EsS0FBSyxVQUFVO1VBQ2I7VUFDQW1TLFNBQVMsQ0FBQzdQLFNBQVMsQ0FBQyxHQUFHSCxNQUFNLENBQUNHLFNBQVMsQ0FBQztVQUN4QzRQLFlBQVksQ0FBQ0ssR0FBRyxFQUFFO1VBQ2xCO1FBQ0Y7VUFDRSxNQUFPLFFBQU9oUixNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLENBQUM3RCxJQUFLLG9CQUFtQjtNQUFDO0lBRXRFLENBQUMsQ0FBQztJQUVGeVQsWUFBWSxHQUFHQSxZQUFZLENBQUNoVSxNQUFNLENBQUN5QyxNQUFNLENBQUN5QixJQUFJLENBQUMrUCxTQUFTLENBQUMsQ0FBQztJQUMxRCxNQUFNSyxhQUFhLEdBQUd2RCxXQUFXLENBQUNqTSxHQUFHLENBQUMsQ0FBQ3lQLEdBQUcsRUFBRXZQLEtBQUssS0FBSztNQUNwRCxJQUFJd1AsV0FBVyxHQUFHLEVBQUU7TUFDcEIsTUFBTXBRLFNBQVMsR0FBRzRQLFlBQVksQ0FBQ2hQLEtBQUssQ0FBQztNQUNyQyxJQUFJLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDWCxPQUFPLENBQUNELFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNoRG9RLFdBQVcsR0FBRyxVQUFVO01BQzFCLENBQUMsTUFBTSxJQUFJblIsTUFBTSxDQUFDRSxNQUFNLENBQUNhLFNBQVMsQ0FBQyxJQUFJZixNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLENBQUM3RCxJQUFJLEtBQUssT0FBTyxFQUFFO1FBQ2hGaVUsV0FBVyxHQUFHLFNBQVM7TUFDekI7TUFDQSxPQUFRLElBQUd4UCxLQUFLLEdBQUcsQ0FBQyxHQUFHZ1AsWUFBWSxDQUFDOVQsTUFBTyxHQUFFc1UsV0FBWSxFQUFDO0lBQzVELENBQUMsQ0FBQztJQUNGLE1BQU1DLGdCQUFnQixHQUFHaFMsTUFBTSxDQUFDeUIsSUFBSSxDQUFDK1AsU0FBUyxDQUFDLENBQUNuUCxHQUFHLENBQUNRLEdBQUcsSUFBSTtNQUN6RCxNQUFNeEQsS0FBSyxHQUFHbVMsU0FBUyxDQUFDM08sR0FBRyxDQUFDO01BQzVCeUwsV0FBVyxDQUFDakwsSUFBSSxDQUFDaEUsS0FBSyxDQUFDNEYsU0FBUyxFQUFFNUYsS0FBSyxDQUFDNkYsUUFBUSxDQUFDO01BQ2pELE1BQU0rTSxDQUFDLEdBQUczRCxXQUFXLENBQUM3USxNQUFNLEdBQUc4VCxZQUFZLENBQUM5VCxNQUFNO01BQ2xELE9BQVEsVUFBU3dVLENBQUUsTUFBS0EsQ0FBQyxHQUFHLENBQUUsR0FBRTtJQUNsQyxDQUFDLENBQUM7SUFFRixNQUFNQyxjQUFjLEdBQUdYLFlBQVksQ0FBQ2xQLEdBQUcsQ0FBQyxDQUFDOFAsR0FBRyxFQUFFNVAsS0FBSyxLQUFNLElBQUdBLEtBQUssR0FBRyxDQUFFLE9BQU0sQ0FBQyxDQUFDRSxJQUFJLEVBQUU7SUFDcEYsTUFBTTJQLGFBQWEsR0FBR1AsYUFBYSxDQUFDdFUsTUFBTSxDQUFDeVUsZ0JBQWdCLENBQUMsQ0FBQ3ZQLElBQUksRUFBRTtJQUVuRSxNQUFNeU0sRUFBRSxHQUFJLHdCQUF1QmdELGNBQWUsYUFBWUUsYUFBYyxHQUFFO0lBQzlFLE1BQU0xTyxNQUFNLEdBQUcsQ0FBQzdDLFNBQVMsRUFBRSxHQUFHMFEsWUFBWSxFQUFFLEdBQUdqRCxXQUFXLENBQUM7SUFDM0QsTUFBTStELE9BQU8sR0FBRyxDQUFDZixvQkFBb0IsR0FBR0Esb0JBQW9CLENBQUM1RSxDQUFDLEdBQUcsSUFBSSxDQUFDbkMsT0FBTyxFQUMxRXVCLElBQUksQ0FBQ29ELEVBQUUsRUFBRXhMLE1BQU0sQ0FBQyxDQUNoQjBNLElBQUksQ0FBQyxPQUFPO01BQUVrQyxHQUFHLEVBQUUsQ0FBQzlRLE1BQU07SUFBRSxDQUFDLENBQUMsQ0FBQyxDQUMvQndLLEtBQUssQ0FBQ3pDLEtBQUssSUFBSTtNQUNkLElBQUlBLEtBQUssQ0FBQ3VFLElBQUksS0FBSzVRLGlDQUFpQyxFQUFFO1FBQ3BELE1BQU1pUixHQUFHLEdBQUcsSUFBSXBMLGFBQUssQ0FBQ0MsS0FBSyxDQUN6QkQsYUFBSyxDQUFDQyxLQUFLLENBQUNxTCxlQUFlLEVBQzNCLCtEQUErRCxDQUNoRTtRQUNERixHQUFHLENBQUNvRSxlQUFlLEdBQUdoSixLQUFLO1FBQzNCLElBQUlBLEtBQUssQ0FBQ2lKLFVBQVUsRUFBRTtVQUNwQixNQUFNQyxPQUFPLEdBQUdsSixLQUFLLENBQUNpSixVQUFVLENBQUN2TyxLQUFLLENBQUMsb0JBQW9CLENBQUM7VUFDNUQsSUFBSXdPLE9BQU8sSUFBSXBOLEtBQUssQ0FBQ0MsT0FBTyxDQUFDbU4sT0FBTyxDQUFDLEVBQUU7WUFDckN0RSxHQUFHLENBQUN1RSxRQUFRLEdBQUc7Y0FBRUMsZ0JBQWdCLEVBQUVGLE9BQU8sQ0FBQyxDQUFDO1lBQUUsQ0FBQztVQUNqRDtRQUNGO1FBQ0FsSixLQUFLLEdBQUc0RSxHQUFHO01BQ2I7TUFDQSxNQUFNNUUsS0FBSztJQUNiLENBQUMsQ0FBQztJQUNKLElBQUkrSCxvQkFBb0IsRUFBRTtNQUN4QkEsb0JBQW9CLENBQUNuQyxLQUFLLENBQUM5TCxJQUFJLENBQUNnUCxPQUFPLENBQUM7SUFDMUM7SUFDQSxPQUFPQSxPQUFPO0VBQ2hCOztFQUVBO0VBQ0E7RUFDQTtFQUNBLE1BQU1PLG9CQUFvQixDQUN4Qi9SLFNBQWlCLEVBQ2pCRCxNQUFrQixFQUNsQjJDLEtBQWdCLEVBQ2hCK04sb0JBQTBCLEVBQzFCO0lBQ0FsVSxLQUFLLENBQUMsc0JBQXNCLENBQUM7SUFDN0IsTUFBTXNHLE1BQU0sR0FBRyxDQUFDN0MsU0FBUyxDQUFDO0lBQzFCLE1BQU0wQixLQUFLLEdBQUcsQ0FBQztJQUNmLE1BQU1zUSxLQUFLLEdBQUd2UCxnQkFBZ0IsQ0FBQztNQUM3QjFDLE1BQU07TUFDTjJCLEtBQUs7TUFDTGdCLEtBQUs7TUFDTEMsZUFBZSxFQUFFO0lBQ25CLENBQUMsQ0FBQztJQUNGRSxNQUFNLENBQUNMLElBQUksQ0FBQyxHQUFHd1AsS0FBSyxDQUFDblAsTUFBTSxDQUFDO0lBQzVCLElBQUkxRCxNQUFNLENBQUN5QixJQUFJLENBQUM4QixLQUFLLENBQUMsQ0FBQzlGLE1BQU0sS0FBSyxDQUFDLEVBQUU7TUFDbkNvVixLQUFLLENBQUNwTyxPQUFPLEdBQUcsTUFBTTtJQUN4QjtJQUNBLE1BQU15SyxFQUFFLEdBQUksOENBQTZDMkQsS0FBSyxDQUFDcE8sT0FBUSw0Q0FBMkM7SUFDbEgsTUFBTTROLE9BQU8sR0FBRyxDQUFDZixvQkFBb0IsR0FBR0Esb0JBQW9CLENBQUM1RSxDQUFDLEdBQUcsSUFBSSxDQUFDbkMsT0FBTyxFQUMxRTZCLEdBQUcsQ0FBQzhDLEVBQUUsRUFBRXhMLE1BQU0sRUFBRTJJLENBQUMsSUFBSSxDQUFDQSxDQUFDLENBQUNqTSxLQUFLLENBQUMsQ0FDOUJnUSxJQUFJLENBQUNoUSxLQUFLLElBQUk7TUFDYixJQUFJQSxLQUFLLEtBQUssQ0FBQyxFQUFFO1FBQ2YsTUFBTSxJQUFJMkMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDOFAsZ0JBQWdCLEVBQUUsbUJBQW1CLENBQUM7TUFDMUUsQ0FBQyxNQUFNO1FBQ0wsT0FBTzFTLEtBQUs7TUFDZDtJQUNGLENBQUMsQ0FBQyxDQUNENEwsS0FBSyxDQUFDekMsS0FBSyxJQUFJO01BQ2QsSUFBSUEsS0FBSyxDQUFDdUUsSUFBSSxLQUFLaFIsaUNBQWlDLEVBQUU7UUFDcEQsTUFBTXlNLEtBQUs7TUFDYjtNQUNBO0lBQ0YsQ0FBQyxDQUFDOztJQUNKLElBQUkrSCxvQkFBb0IsRUFBRTtNQUN4QkEsb0JBQW9CLENBQUNuQyxLQUFLLENBQUM5TCxJQUFJLENBQUNnUCxPQUFPLENBQUM7SUFDMUM7SUFDQSxPQUFPQSxPQUFPO0VBQ2hCO0VBQ0E7RUFDQSxNQUFNVSxnQkFBZ0IsQ0FDcEJsUyxTQUFpQixFQUNqQkQsTUFBa0IsRUFDbEIyQyxLQUFnQixFQUNoQmpELE1BQVcsRUFDWGdSLG9CQUEwQixFQUNaO0lBQ2RsVSxLQUFLLENBQUMsa0JBQWtCLENBQUM7SUFDekIsT0FBTyxJQUFJLENBQUM0VixvQkFBb0IsQ0FBQ25TLFNBQVMsRUFBRUQsTUFBTSxFQUFFMkMsS0FBSyxFQUFFakQsTUFBTSxFQUFFZ1Isb0JBQW9CLENBQUMsQ0FBQ2xCLElBQUksQ0FDM0YwQixHQUFHLElBQUlBLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FDZDtFQUNIOztFQUVBO0VBQ0EsTUFBTWtCLG9CQUFvQixDQUN4Qm5TLFNBQWlCLEVBQ2pCRCxNQUFrQixFQUNsQjJDLEtBQWdCLEVBQ2hCakQsTUFBVyxFQUNYZ1Isb0JBQTBCLEVBQ1Y7SUFDaEJsVSxLQUFLLENBQUMsc0JBQXNCLENBQUM7SUFDN0IsTUFBTTZWLGNBQWMsR0FBRyxFQUFFO0lBQ3pCLE1BQU12UCxNQUFNLEdBQUcsQ0FBQzdDLFNBQVMsQ0FBQztJQUMxQixJQUFJMEIsS0FBSyxHQUFHLENBQUM7SUFDYjNCLE1BQU0sR0FBR1MsZ0JBQWdCLENBQUNULE1BQU0sQ0FBQztJQUVqQyxNQUFNc1MsY0FBYyxxQkFBUTVTLE1BQU0sQ0FBRTs7SUFFcEM7SUFDQSxNQUFNNlMsa0JBQWtCLEdBQUcsQ0FBQyxDQUFDO0lBQzdCblQsTUFBTSxDQUFDeUIsSUFBSSxDQUFDbkIsTUFBTSxDQUFDLENBQUNvQixPQUFPLENBQUNDLFNBQVMsSUFBSTtNQUN2QyxJQUFJQSxTQUFTLENBQUNDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRTtRQUMvQixNQUFNQyxVQUFVLEdBQUdGLFNBQVMsQ0FBQ0csS0FBSyxDQUFDLEdBQUcsQ0FBQztRQUN2QyxNQUFNQyxLQUFLLEdBQUdGLFVBQVUsQ0FBQ0csS0FBSyxFQUFFO1FBQ2hDbVIsa0JBQWtCLENBQUNwUixLQUFLLENBQUMsR0FBRyxJQUFJO01BQ2xDLENBQUMsTUFBTTtRQUNMb1Isa0JBQWtCLENBQUN4UixTQUFTLENBQUMsR0FBRyxLQUFLO01BQ3ZDO0lBQ0YsQ0FBQyxDQUFDO0lBQ0ZyQixNQUFNLEdBQUdpQixlQUFlLENBQUNqQixNQUFNLENBQUM7SUFDaEM7SUFDQTtJQUNBLEtBQUssTUFBTXFCLFNBQVMsSUFBSXJCLE1BQU0sRUFBRTtNQUM5QixNQUFNMEQsYUFBYSxHQUFHckMsU0FBUyxDQUFDc0MsS0FBSyxDQUFDLDhCQUE4QixDQUFDO01BQ3JFLElBQUlELGFBQWEsRUFBRTtRQUNqQixJQUFJMk4sUUFBUSxHQUFHM04sYUFBYSxDQUFDLENBQUMsQ0FBQztRQUMvQixNQUFNM0UsS0FBSyxHQUFHaUIsTUFBTSxDQUFDcUIsU0FBUyxDQUFDO1FBQy9CLE9BQU9yQixNQUFNLENBQUNxQixTQUFTLENBQUM7UUFDeEJyQixNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUdBLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0NBLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQ3FSLFFBQVEsQ0FBQyxHQUFHdFMsS0FBSztNQUN0QztJQUNGO0lBRUEsS0FBSyxNQUFNc0MsU0FBUyxJQUFJckIsTUFBTSxFQUFFO01BQzlCLE1BQU13RCxVQUFVLEdBQUd4RCxNQUFNLENBQUNxQixTQUFTLENBQUM7TUFDcEM7TUFDQSxJQUFJLE9BQU9tQyxVQUFVLEtBQUssV0FBVyxFQUFFO1FBQ3JDLE9BQU94RCxNQUFNLENBQUNxQixTQUFTLENBQUM7TUFDMUIsQ0FBQyxNQUFNLElBQUltQyxVQUFVLEtBQUssSUFBSSxFQUFFO1FBQzlCbVAsY0FBYyxDQUFDNVAsSUFBSSxDQUFFLElBQUdkLEtBQU0sY0FBYSxDQUFDO1FBQzVDbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLENBQUM7UUFDdEJZLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNLElBQUlaLFNBQVMsSUFBSSxVQUFVLEVBQUU7UUFDbEM7UUFDQTtRQUNBLE1BQU15UixRQUFRLEdBQUcsQ0FBQ0MsS0FBYSxFQUFFeFEsR0FBVyxFQUFFeEQsS0FBVSxLQUFLO1VBQzNELE9BQVEsZ0NBQStCZ1UsS0FBTSxtQkFBa0J4USxHQUFJLEtBQUl4RCxLQUFNLFVBQVM7UUFDeEYsQ0FBQztRQUNELE1BQU1pVSxPQUFPLEdBQUksSUFBRy9RLEtBQU0sT0FBTTtRQUNoQyxNQUFNZ1IsY0FBYyxHQUFHaFIsS0FBSztRQUM1QkEsS0FBSyxJQUFJLENBQUM7UUFDVm1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxDQUFDO1FBQ3RCLE1BQU1yQixNQUFNLEdBQUdOLE1BQU0sQ0FBQ3lCLElBQUksQ0FBQ3FDLFVBQVUsQ0FBQyxDQUFDOE0sTUFBTSxDQUFDLENBQUMwQyxPQUFlLEVBQUV6USxHQUFXLEtBQUs7VUFDOUUsTUFBTTJRLEdBQUcsR0FBR0osUUFBUSxDQUFDRSxPQUFPLEVBQUcsSUFBRy9RLEtBQU0sUUFBTyxFQUFHLElBQUdBLEtBQUssR0FBRyxDQUFFLFNBQVEsQ0FBQztVQUN4RUEsS0FBSyxJQUFJLENBQUM7VUFDVixJQUFJbEQsS0FBSyxHQUFHeUUsVUFBVSxDQUFDakIsR0FBRyxDQUFDO1VBQzNCLElBQUl4RCxLQUFLLEVBQUU7WUFDVCxJQUFJQSxLQUFLLENBQUM4QyxJQUFJLEtBQUssUUFBUSxFQUFFO2NBQzNCOUMsS0FBSyxHQUFHLElBQUk7WUFDZCxDQUFDLE1BQU07Y0FDTEEsS0FBSyxHQUFHckIsSUFBSSxDQUFDQyxTQUFTLENBQUNvQixLQUFLLENBQUM7WUFDL0I7VUFDRjtVQUNBcUUsTUFBTSxDQUFDTCxJQUFJLENBQUNSLEdBQUcsRUFBRXhELEtBQUssQ0FBQztVQUN2QixPQUFPbVUsR0FBRztRQUNaLENBQUMsRUFBRUYsT0FBTyxDQUFDO1FBQ1hMLGNBQWMsQ0FBQzVQLElBQUksQ0FBRSxJQUFHa1EsY0FBZSxXQUFValQsTUFBTyxFQUFDLENBQUM7TUFDNUQsQ0FBQyxNQUFNLElBQUl3RCxVQUFVLENBQUMzQixJQUFJLEtBQUssV0FBVyxFQUFFO1FBQzFDOFEsY0FBYyxDQUFDNVAsSUFBSSxDQUFFLElBQUdkLEtBQU0scUJBQW9CQSxLQUFNLGdCQUFlQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQUM7UUFDbkZtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRW1DLFVBQVUsQ0FBQzJQLE1BQU0sQ0FBQztRQUN6Q2xSLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNLElBQUl1QixVQUFVLENBQUMzQixJQUFJLEtBQUssS0FBSyxFQUFFO1FBQ3BDOFEsY0FBYyxDQUFDNVAsSUFBSSxDQUNoQixJQUFHZCxLQUFNLCtCQUE4QkEsS0FBTSx5QkFBd0JBLEtBQUssR0FBRyxDQUFFLFVBQVMsQ0FDMUY7UUFDRG1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxFQUFFM0QsSUFBSSxDQUFDQyxTQUFTLENBQUM2RixVQUFVLENBQUM0UCxPQUFPLENBQUMsQ0FBQztRQUMxRG5SLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNLElBQUl1QixVQUFVLENBQUMzQixJQUFJLEtBQUssUUFBUSxFQUFFO1FBQ3ZDOFEsY0FBYyxDQUFDNVAsSUFBSSxDQUFFLElBQUdkLEtBQU0sWUFBV0EsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUFDO1FBQ3JEbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLEVBQUUsSUFBSSxDQUFDO1FBQzVCWSxLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJdUIsVUFBVSxDQUFDM0IsSUFBSSxLQUFLLFFBQVEsRUFBRTtRQUN2QzhRLGNBQWMsQ0FBQzVQLElBQUksQ0FDaEIsSUFBR2QsS0FBTSxrQ0FBaUNBLEtBQU0seUJBQXdCQSxLQUFLLEdBQUcsQ0FDaEYsVUFBUyxDQUNYO1FBQ0RtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRTNELElBQUksQ0FBQ0MsU0FBUyxDQUFDNkYsVUFBVSxDQUFDNFAsT0FBTyxDQUFDLENBQUM7UUFDMURuUixLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJdUIsVUFBVSxDQUFDM0IsSUFBSSxLQUFLLFdBQVcsRUFBRTtRQUMxQzhRLGNBQWMsQ0FBQzVQLElBQUksQ0FDaEIsSUFBR2QsS0FBTSxzQ0FBcUNBLEtBQU0seUJBQXdCQSxLQUFLLEdBQUcsQ0FDcEYsVUFBUyxDQUNYO1FBQ0RtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRTNELElBQUksQ0FBQ0MsU0FBUyxDQUFDNkYsVUFBVSxDQUFDNFAsT0FBTyxDQUFDLENBQUM7UUFDMURuUixLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJWixTQUFTLEtBQUssV0FBVyxFQUFFO1FBQ3BDO1FBQ0FzUixjQUFjLENBQUM1UCxJQUFJLENBQUUsSUFBR2QsS0FBTSxZQUFXQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQUM7UUFDckRtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRW1DLFVBQVUsQ0FBQztRQUNsQ3ZCLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNLElBQUksT0FBT3VCLFVBQVUsS0FBSyxRQUFRLEVBQUU7UUFDekNtUCxjQUFjLENBQUM1UCxJQUFJLENBQUUsSUFBR2QsS0FBTSxZQUFXQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQUM7UUFDckRtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRW1DLFVBQVUsQ0FBQztRQUNsQ3ZCLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNLElBQUksT0FBT3VCLFVBQVUsS0FBSyxTQUFTLEVBQUU7UUFDMUNtUCxjQUFjLENBQUM1UCxJQUFJLENBQUUsSUFBR2QsS0FBTSxZQUFXQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQUM7UUFDckRtQixNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRW1DLFVBQVUsQ0FBQztRQUNsQ3ZCLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNLElBQUl1QixVQUFVLENBQUN4RSxNQUFNLEtBQUssU0FBUyxFQUFFO1FBQzFDMlQsY0FBYyxDQUFDNVAsSUFBSSxDQUFFLElBQUdkLEtBQU0sWUFBV0EsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUFDO1FBQ3JEbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLEVBQUVtQyxVQUFVLENBQUNoRSxRQUFRLENBQUM7UUFDM0N5QyxLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJdUIsVUFBVSxDQUFDeEUsTUFBTSxLQUFLLE1BQU0sRUFBRTtRQUN2QzJULGNBQWMsQ0FBQzVQLElBQUksQ0FBRSxJQUFHZCxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLEVBQUMsQ0FBQztRQUNyRG1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxFQUFFdkMsZUFBZSxDQUFDMEUsVUFBVSxDQUFDLENBQUM7UUFDbkR2QixLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJdUIsVUFBVSxZQUFZeU0sSUFBSSxFQUFFO1FBQ3JDMEMsY0FBYyxDQUFDNVAsSUFBSSxDQUFFLElBQUdkLEtBQU0sWUFBV0EsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUFDO1FBQ3JEbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLEVBQUVtQyxVQUFVLENBQUM7UUFDbEN2QixLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJdUIsVUFBVSxDQUFDeEUsTUFBTSxLQUFLLE1BQU0sRUFBRTtRQUN2QzJULGNBQWMsQ0FBQzVQLElBQUksQ0FBRSxJQUFHZCxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLEVBQUMsQ0FBQztRQUNyRG1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxFQUFFdkMsZUFBZSxDQUFDMEUsVUFBVSxDQUFDLENBQUM7UUFDbkR2QixLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJdUIsVUFBVSxDQUFDeEUsTUFBTSxLQUFLLFVBQVUsRUFBRTtRQUMzQzJULGNBQWMsQ0FBQzVQLElBQUksQ0FBRSxJQUFHZCxLQUFNLGtCQUFpQkEsS0FBSyxHQUFHLENBQUUsTUFBS0EsS0FBSyxHQUFHLENBQUUsR0FBRSxDQUFDO1FBQzNFbUIsTUFBTSxDQUFDTCxJQUFJLENBQUMxQixTQUFTLEVBQUVtQyxVQUFVLENBQUNtQixTQUFTLEVBQUVuQixVQUFVLENBQUNvQixRQUFRLENBQUM7UUFDakUzQyxLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJdUIsVUFBVSxDQUFDeEUsTUFBTSxLQUFLLFNBQVMsRUFBRTtRQUMxQyxNQUFNRCxLQUFLLEdBQUcwSixtQkFBbUIsQ0FBQ2pGLFVBQVUsQ0FBQ3lFLFdBQVcsQ0FBQztRQUN6RDBLLGNBQWMsQ0FBQzVQLElBQUksQ0FBRSxJQUFHZCxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLFdBQVUsQ0FBQztRQUM5RG1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxFQUFFdEMsS0FBSyxDQUFDO1FBQzdCa0QsS0FBSyxJQUFJLENBQUM7TUFDWixDQUFDLE1BQU0sSUFBSXVCLFVBQVUsQ0FBQ3hFLE1BQU0sS0FBSyxVQUFVLEVBQUU7UUFDM0M7TUFBQSxDQUNELE1BQU0sSUFBSSxPQUFPd0UsVUFBVSxLQUFLLFFBQVEsRUFBRTtRQUN6Q21QLGNBQWMsQ0FBQzVQLElBQUksQ0FBRSxJQUFHZCxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLEVBQUMsQ0FBQztRQUNyRG1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxFQUFFbUMsVUFBVSxDQUFDO1FBQ2xDdkIsS0FBSyxJQUFJLENBQUM7TUFDWixDQUFDLE1BQU0sSUFDTCxPQUFPdUIsVUFBVSxLQUFLLFFBQVEsSUFDOUJsRCxNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLElBQ3hCZixNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLENBQUM3RCxJQUFJLEtBQUssUUFBUSxFQUMxQztRQUNBO1FBQ0EsTUFBTTZWLGVBQWUsR0FBRzNULE1BQU0sQ0FBQ3lCLElBQUksQ0FBQ3lSLGNBQWMsQ0FBQyxDQUNoRHpELE1BQU0sQ0FBQ21FLENBQUMsSUFBSTtVQUNYO1VBQ0E7VUFDQTtVQUNBO1VBQ0EsTUFBTXZVLEtBQUssR0FBRzZULGNBQWMsQ0FBQ1UsQ0FBQyxDQUFDO1VBQy9CLE9BQ0V2VSxLQUFLLElBQ0xBLEtBQUssQ0FBQzhDLElBQUksS0FBSyxXQUFXLElBQzFCeVIsQ0FBQyxDQUFDOVIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDckUsTUFBTSxLQUFLLENBQUMsSUFDekJtVyxDQUFDLENBQUM5UixLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUtILFNBQVM7UUFFakMsQ0FBQyxDQUFDLENBQ0RVLEdBQUcsQ0FBQ3VSLENBQUMsSUFBSUEsQ0FBQyxDQUFDOVIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTVCLElBQUkrUixpQkFBaUIsR0FBRyxFQUFFO1FBQzFCLElBQUlGLGVBQWUsQ0FBQ2xXLE1BQU0sR0FBRyxDQUFDLEVBQUU7VUFDOUJvVyxpQkFBaUIsR0FDZixNQUFNLEdBQ05GLGVBQWUsQ0FDWnRSLEdBQUcsQ0FBQ3lSLENBQUMsSUFBSTtZQUNSLE1BQU1MLE1BQU0sR0FBRzNQLFVBQVUsQ0FBQ2dRLENBQUMsQ0FBQyxDQUFDTCxNQUFNO1lBQ25DLE9BQVEsYUFBWUssQ0FBRSxrQkFBaUJ2UixLQUFNLFlBQVd1UixDQUFFLGlCQUFnQkwsTUFBTyxlQUFjO1VBQ2pHLENBQUMsQ0FBQyxDQUNEaFIsSUFBSSxDQUFDLE1BQU0sQ0FBQztVQUNqQjtVQUNBa1IsZUFBZSxDQUFDalMsT0FBTyxDQUFDbUIsR0FBRyxJQUFJO1lBQzdCLE9BQU9pQixVQUFVLENBQUNqQixHQUFHLENBQUM7VUFDeEIsQ0FBQyxDQUFDO1FBQ0o7UUFFQSxNQUFNa1IsWUFBMkIsR0FBRy9ULE1BQU0sQ0FBQ3lCLElBQUksQ0FBQ3lSLGNBQWMsQ0FBQyxDQUM1RHpELE1BQU0sQ0FBQ21FLENBQUMsSUFBSTtVQUNYO1VBQ0EsTUFBTXZVLEtBQUssR0FBRzZULGNBQWMsQ0FBQ1UsQ0FBQyxDQUFDO1VBQy9CLE9BQ0V2VSxLQUFLLElBQ0xBLEtBQUssQ0FBQzhDLElBQUksS0FBSyxRQUFRLElBQ3ZCeVIsQ0FBQyxDQUFDOVIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDckUsTUFBTSxLQUFLLENBQUMsSUFDekJtVyxDQUFDLENBQUM5UixLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUtILFNBQVM7UUFFakMsQ0FBQyxDQUFDLENBQ0RVLEdBQUcsQ0FBQ3VSLENBQUMsSUFBSUEsQ0FBQyxDQUFDOVIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTVCLE1BQU1rUyxjQUFjLEdBQUdELFlBQVksQ0FBQ25ELE1BQU0sQ0FBQyxDQUFDcUQsQ0FBUyxFQUFFSCxDQUFTLEVBQUV6TixDQUFTLEtBQUs7VUFDOUUsT0FBTzROLENBQUMsR0FBSSxRQUFPMVIsS0FBSyxHQUFHLENBQUMsR0FBRzhELENBQUUsU0FBUTtRQUMzQyxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ047UUFDQSxJQUFJNk4sWUFBWSxHQUFHLGFBQWE7UUFFaEMsSUFBSWYsa0JBQWtCLENBQUN4UixTQUFTLENBQUMsRUFBRTtVQUNqQztVQUNBdVMsWUFBWSxHQUFJLGFBQVkzUixLQUFNLHFCQUFvQjtRQUN4RDtRQUNBMFEsY0FBYyxDQUFDNVAsSUFBSSxDQUNoQixJQUFHZCxLQUFNLFlBQVcyUixZQUFhLElBQUdGLGNBQWUsSUFBR0gsaUJBQWtCLFFBQU90UixLQUFLLEdBQUcsQ0FBQyxHQUFHd1IsWUFBWSxDQUFDdFcsTUFDeEcsV0FBVSxDQUNaO1FBQ0RpRyxNQUFNLENBQUNMLElBQUksQ0FBQzFCLFNBQVMsRUFBRSxHQUFHb1MsWUFBWSxFQUFFL1YsSUFBSSxDQUFDQyxTQUFTLENBQUM2RixVQUFVLENBQUMsQ0FBQztRQUNuRXZCLEtBQUssSUFBSSxDQUFDLEdBQUd3UixZQUFZLENBQUN0VyxNQUFNO01BQ2xDLENBQUMsTUFBTSxJQUNMNEgsS0FBSyxDQUFDQyxPQUFPLENBQUN4QixVQUFVLENBQUMsSUFDekJsRCxNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLElBQ3hCZixNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLENBQUM3RCxJQUFJLEtBQUssT0FBTyxFQUN6QztRQUNBLE1BQU1xVyxZQUFZLEdBQUd0Vyx1QkFBdUIsQ0FBQytDLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDYSxTQUFTLENBQUMsQ0FBQztRQUN0RSxJQUFJd1MsWUFBWSxLQUFLLFFBQVEsRUFBRTtVQUM3QmxCLGNBQWMsQ0FBQzVQLElBQUksQ0FBRSxJQUFHZCxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLFVBQVMsQ0FBQztVQUM3RG1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxFQUFFbUMsVUFBVSxDQUFDO1VBQ2xDdkIsS0FBSyxJQUFJLENBQUM7UUFDWixDQUFDLE1BQU07VUFDTDBRLGNBQWMsQ0FBQzVQLElBQUksQ0FBRSxJQUFHZCxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLFNBQVEsQ0FBQztVQUM1RG1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDMUIsU0FBUyxFQUFFM0QsSUFBSSxDQUFDQyxTQUFTLENBQUM2RixVQUFVLENBQUMsQ0FBQztVQUNsRHZCLEtBQUssSUFBSSxDQUFDO1FBQ1o7TUFDRixDQUFDLE1BQU07UUFDTG5GLEtBQUssQ0FBQyxzQkFBc0IsRUFBRTtVQUFFdUUsU0FBUztVQUFFbUM7UUFBVyxDQUFDLENBQUM7UUFDeEQsT0FBT2lKLE9BQU8sQ0FBQ3FILE1BQU0sQ0FDbkIsSUFBSXJSLGFBQUssQ0FBQ0MsS0FBSyxDQUNiRCxhQUFLLENBQUNDLEtBQUssQ0FBQ3lHLG1CQUFtQixFQUM5QixtQ0FBa0N6TCxJQUFJLENBQUNDLFNBQVMsQ0FBQzZGLFVBQVUsQ0FBRSxNQUFLLENBQ3BFLENBQ0Y7TUFDSDtJQUNGO0lBRUEsTUFBTStPLEtBQUssR0FBR3ZQLGdCQUFnQixDQUFDO01BQzdCMUMsTUFBTTtNQUNOMkIsS0FBSztNQUNMZ0IsS0FBSztNQUNMQyxlQUFlLEVBQUU7SUFDbkIsQ0FBQyxDQUFDO0lBQ0ZFLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDLEdBQUd3UCxLQUFLLENBQUNuUCxNQUFNLENBQUM7SUFFNUIsTUFBTTJRLFdBQVcsR0FBR3hCLEtBQUssQ0FBQ3BPLE9BQU8sQ0FBQ2hILE1BQU0sR0FBRyxDQUFDLEdBQUksU0FBUW9WLEtBQUssQ0FBQ3BPLE9BQVEsRUFBQyxHQUFHLEVBQUU7SUFDNUUsTUFBTXlLLEVBQUUsR0FBSSxzQkFBcUIrRCxjQUFjLENBQUN4USxJQUFJLEVBQUcsSUFBRzRSLFdBQVksY0FBYTtJQUNuRixNQUFNaEMsT0FBTyxHQUFHLENBQUNmLG9CQUFvQixHQUFHQSxvQkFBb0IsQ0FBQzVFLENBQUMsR0FBRyxJQUFJLENBQUNuQyxPQUFPLEVBQUVzRixHQUFHLENBQUNYLEVBQUUsRUFBRXhMLE1BQU0sQ0FBQztJQUM5RixJQUFJNE4sb0JBQW9CLEVBQUU7TUFDeEJBLG9CQUFvQixDQUFDbkMsS0FBSyxDQUFDOUwsSUFBSSxDQUFDZ1AsT0FBTyxDQUFDO0lBQzFDO0lBQ0EsT0FBT0EsT0FBTztFQUNoQjs7RUFFQTtFQUNBaUMsZUFBZSxDQUNielQsU0FBaUIsRUFDakJELE1BQWtCLEVBQ2xCMkMsS0FBZ0IsRUFDaEJqRCxNQUFXLEVBQ1hnUixvQkFBMEIsRUFDMUI7SUFDQWxVLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQztJQUN4QixNQUFNbVgsV0FBVyxHQUFHdlUsTUFBTSxDQUFDd08sTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFakwsS0FBSyxFQUFFakQsTUFBTSxDQUFDO0lBQ3BELE9BQU8sSUFBSSxDQUFDK1EsWUFBWSxDQUFDeFEsU0FBUyxFQUFFRCxNQUFNLEVBQUUyVCxXQUFXLEVBQUVqRCxvQkFBb0IsQ0FBQyxDQUFDdEYsS0FBSyxDQUFDekMsS0FBSyxJQUFJO01BQzVGO01BQ0EsSUFBSUEsS0FBSyxDQUFDdUUsSUFBSSxLQUFLL0ssYUFBSyxDQUFDQyxLQUFLLENBQUNxTCxlQUFlLEVBQUU7UUFDOUMsTUFBTTlFLEtBQUs7TUFDYjtNQUNBLE9BQU8sSUFBSSxDQUFDd0osZ0JBQWdCLENBQUNsUyxTQUFTLEVBQUVELE1BQU0sRUFBRTJDLEtBQUssRUFBRWpELE1BQU0sRUFBRWdSLG9CQUFvQixDQUFDO0lBQ3RGLENBQUMsQ0FBQztFQUNKO0VBRUFwUixJQUFJLENBQ0ZXLFNBQWlCLEVBQ2pCRCxNQUFrQixFQUNsQjJDLEtBQWdCLEVBQ2hCO0lBQUVpUixJQUFJO0lBQUVDLEtBQUs7SUFBRUMsSUFBSTtJQUFFalQsSUFBSTtJQUFFK0IsZUFBZTtJQUFFbVI7RUFBc0IsQ0FBQyxFQUNuRTtJQUNBdlgsS0FBSyxDQUFDLE1BQU0sQ0FBQztJQUNiLE1BQU13WCxRQUFRLEdBQUdILEtBQUssS0FBSzdVLFNBQVM7SUFDcEMsTUFBTWlWLE9BQU8sR0FBR0wsSUFBSSxLQUFLNVUsU0FBUztJQUNsQyxJQUFJOEQsTUFBTSxHQUFHLENBQUM3QyxTQUFTLENBQUM7SUFDeEIsTUFBTWdTLEtBQUssR0FBR3ZQLGdCQUFnQixDQUFDO01BQzdCMUMsTUFBTTtNQUNOMkMsS0FBSztNQUNMaEIsS0FBSyxFQUFFLENBQUM7TUFDUmlCO0lBQ0YsQ0FBQyxDQUFDO0lBQ0ZFLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDLEdBQUd3UCxLQUFLLENBQUNuUCxNQUFNLENBQUM7SUFDNUIsTUFBTW9SLFlBQVksR0FBR2pDLEtBQUssQ0FBQ3BPLE9BQU8sQ0FBQ2hILE1BQU0sR0FBRyxDQUFDLEdBQUksU0FBUW9WLEtBQUssQ0FBQ3BPLE9BQVEsRUFBQyxHQUFHLEVBQUU7SUFDN0UsTUFBTXNRLFlBQVksR0FBR0gsUUFBUSxHQUFJLFVBQVNsUixNQUFNLENBQUNqRyxNQUFNLEdBQUcsQ0FBRSxFQUFDLEdBQUcsRUFBRTtJQUNsRSxJQUFJbVgsUUFBUSxFQUFFO01BQ1psUixNQUFNLENBQUNMLElBQUksQ0FBQ29SLEtBQUssQ0FBQztJQUNwQjtJQUNBLE1BQU1PLFdBQVcsR0FBR0gsT0FBTyxHQUFJLFdBQVVuUixNQUFNLENBQUNqRyxNQUFNLEdBQUcsQ0FBRSxFQUFDLEdBQUcsRUFBRTtJQUNqRSxJQUFJb1gsT0FBTyxFQUFFO01BQ1huUixNQUFNLENBQUNMLElBQUksQ0FBQ21SLElBQUksQ0FBQztJQUNuQjtJQUVBLElBQUlTLFdBQVcsR0FBRyxFQUFFO0lBQ3BCLElBQUlQLElBQUksRUFBRTtNQUNSLE1BQU1RLFFBQWEsR0FBR1IsSUFBSTtNQUMxQixNQUFNUyxPQUFPLEdBQUduVixNQUFNLENBQUN5QixJQUFJLENBQUNpVCxJQUFJLENBQUMsQ0FDOUJyUyxHQUFHLENBQUNRLEdBQUcsSUFBSTtRQUNWLE1BQU11UyxZQUFZLEdBQUdoVCw2QkFBNkIsQ0FBQ1MsR0FBRyxDQUFDLENBQUNKLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDbEU7UUFDQSxJQUFJeVMsUUFBUSxDQUFDclMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFO1VBQ3ZCLE9BQVEsR0FBRXVTLFlBQWEsTUFBSztRQUM5QjtRQUNBLE9BQVEsR0FBRUEsWUFBYSxPQUFNO01BQy9CLENBQUMsQ0FBQyxDQUNEM1MsSUFBSSxFQUFFO01BQ1R3UyxXQUFXLEdBQUdQLElBQUksS0FBSzlVLFNBQVMsSUFBSUksTUFBTSxDQUFDeUIsSUFBSSxDQUFDaVQsSUFBSSxDQUFDLENBQUNqWCxNQUFNLEdBQUcsQ0FBQyxHQUFJLFlBQVcwWCxPQUFRLEVBQUMsR0FBRyxFQUFFO0lBQy9GO0lBQ0EsSUFBSXRDLEtBQUssQ0FBQ2xQLEtBQUssSUFBSTNELE1BQU0sQ0FBQ3lCLElBQUksQ0FBRW9SLEtBQUssQ0FBQ2xQLEtBQUssQ0FBTyxDQUFDbEcsTUFBTSxHQUFHLENBQUMsRUFBRTtNQUM3RHdYLFdBQVcsR0FBSSxZQUFXcEMsS0FBSyxDQUFDbFAsS0FBSyxDQUFDbEIsSUFBSSxFQUFHLEVBQUM7SUFDaEQ7SUFFQSxJQUFJNk0sT0FBTyxHQUFHLEdBQUc7SUFDakIsSUFBSTdOLElBQUksRUFBRTtNQUNSO01BQ0E7TUFDQUEsSUFBSSxHQUFHQSxJQUFJLENBQUNtUCxNQUFNLENBQUMsQ0FBQ3lFLElBQUksRUFBRXhTLEdBQUcsS0FBSztRQUNoQyxJQUFJQSxHQUFHLEtBQUssS0FBSyxFQUFFO1VBQ2pCd1MsSUFBSSxDQUFDaFMsSUFBSSxDQUFDLFFBQVEsQ0FBQztVQUNuQmdTLElBQUksQ0FBQ2hTLElBQUksQ0FBQyxRQUFRLENBQUM7UUFDckIsQ0FBQyxNQUFNLElBQ0xSLEdBQUcsQ0FBQ3BGLE1BQU0sR0FBRyxDQUFDO1FBQ2Q7UUFDQTtRQUNBO1FBQ0VtRCxNQUFNLENBQUNFLE1BQU0sQ0FBQytCLEdBQUcsQ0FBQyxJQUFJakMsTUFBTSxDQUFDRSxNQUFNLENBQUMrQixHQUFHLENBQUMsQ0FBQy9FLElBQUksS0FBSyxVQUFVLElBQUsrRSxHQUFHLEtBQUssUUFBUSxDQUFDLEVBQ3BGO1VBQ0F3UyxJQUFJLENBQUNoUyxJQUFJLENBQUNSLEdBQUcsQ0FBQztRQUNoQjtRQUNBLE9BQU93UyxJQUFJO01BQ2IsQ0FBQyxFQUFFLEVBQUUsQ0FBQztNQUNOL0YsT0FBTyxHQUFHN04sSUFBSSxDQUNYWSxHQUFHLENBQUMsQ0FBQ1EsR0FBRyxFQUFFTixLQUFLLEtBQUs7UUFDbkIsSUFBSU0sR0FBRyxLQUFLLFFBQVEsRUFBRTtVQUNwQixPQUFRLDJCQUEwQixDQUFFLE1BQUssQ0FBRSx1QkFBc0IsQ0FBRSxNQUFLLENBQUUsaUJBQWdCO1FBQzVGO1FBQ0EsT0FBUSxJQUFHTixLQUFLLEdBQUdtQixNQUFNLENBQUNqRyxNQUFNLEdBQUcsQ0FBRSxPQUFNO01BQzdDLENBQUMsQ0FBQyxDQUNEZ0YsSUFBSSxFQUFFO01BQ1RpQixNQUFNLEdBQUdBLE1BQU0sQ0FBQ25HLE1BQU0sQ0FBQ2tFLElBQUksQ0FBQztJQUM5QjtJQUVBLE1BQU02VCxhQUFhLEdBQUksVUFBU2hHLE9BQVEsaUJBQWdCd0YsWUFBYSxJQUFHRyxXQUFZLElBQUdGLFlBQWEsSUFBR0MsV0FBWSxFQUFDO0lBQ3BILE1BQU05RixFQUFFLEdBQUd5RixPQUFPLEdBQUcsSUFBSSxDQUFDNUosc0JBQXNCLENBQUN1SyxhQUFhLENBQUMsR0FBR0EsYUFBYTtJQUMvRSxPQUFPLElBQUksQ0FBQy9LLE9BQU8sQ0FDaEJzRixHQUFHLENBQUNYLEVBQUUsRUFBRXhMLE1BQU0sQ0FBQyxDQUNmc0ksS0FBSyxDQUFDekMsS0FBSyxJQUFJO01BQ2Q7TUFDQSxJQUFJQSxLQUFLLENBQUN1RSxJQUFJLEtBQUtoUixpQ0FBaUMsRUFBRTtRQUNwRCxNQUFNeU0sS0FBSztNQUNiO01BQ0EsT0FBTyxFQUFFO0lBQ1gsQ0FBQyxDQUFDLENBQ0Q2RyxJQUFJLENBQUNNLE9BQU8sSUFBSTtNQUNmLElBQUlpRSxPQUFPLEVBQUU7UUFDWCxPQUFPakUsT0FBTztNQUNoQjtNQUNBLE9BQU9BLE9BQU8sQ0FBQ3JPLEdBQUcsQ0FBQ2IsTUFBTSxJQUFJLElBQUksQ0FBQytULDJCQUEyQixDQUFDMVUsU0FBUyxFQUFFVyxNQUFNLEVBQUVaLE1BQU0sQ0FBQyxDQUFDO0lBQzNGLENBQUMsQ0FBQztFQUNOOztFQUVBO0VBQ0E7RUFDQTJVLDJCQUEyQixDQUFDMVUsU0FBaUIsRUFBRVcsTUFBVyxFQUFFWixNQUFXLEVBQUU7SUFDdkVaLE1BQU0sQ0FBQ3lCLElBQUksQ0FBQ2IsTUFBTSxDQUFDRSxNQUFNLENBQUMsQ0FBQ1ksT0FBTyxDQUFDQyxTQUFTLElBQUk7TUFDOUMsSUFBSWYsTUFBTSxDQUFDRSxNQUFNLENBQUNhLFNBQVMsQ0FBQyxDQUFDN0QsSUFBSSxLQUFLLFNBQVMsSUFBSTBELE1BQU0sQ0FBQ0csU0FBUyxDQUFDLEVBQUU7UUFDcEVILE1BQU0sQ0FBQ0csU0FBUyxDQUFDLEdBQUc7VUFDbEI3QixRQUFRLEVBQUUwQixNQUFNLENBQUNHLFNBQVMsQ0FBQztVQUMzQnJDLE1BQU0sRUFBRSxTQUFTO1VBQ2pCdUIsU0FBUyxFQUFFRCxNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLENBQUM2VDtRQUN0QyxDQUFDO01BQ0g7TUFDQSxJQUFJNVUsTUFBTSxDQUFDRSxNQUFNLENBQUNhLFNBQVMsQ0FBQyxDQUFDN0QsSUFBSSxLQUFLLFVBQVUsRUFBRTtRQUNoRDBELE1BQU0sQ0FBQ0csU0FBUyxDQUFDLEdBQUc7VUFDbEJyQyxNQUFNLEVBQUUsVUFBVTtVQUNsQnVCLFNBQVMsRUFBRUQsTUFBTSxDQUFDRSxNQUFNLENBQUNhLFNBQVMsQ0FBQyxDQUFDNlQ7UUFDdEMsQ0FBQztNQUNIO01BQ0EsSUFBSWhVLE1BQU0sQ0FBQ0csU0FBUyxDQUFDLElBQUlmLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDYSxTQUFTLENBQUMsQ0FBQzdELElBQUksS0FBSyxVQUFVLEVBQUU7UUFDckUwRCxNQUFNLENBQUNHLFNBQVMsQ0FBQyxHQUFHO1VBQ2xCckMsTUFBTSxFQUFFLFVBQVU7VUFDbEI0RixRQUFRLEVBQUUxRCxNQUFNLENBQUNHLFNBQVMsQ0FBQyxDQUFDOFQsQ0FBQztVQUM3QnhRLFNBQVMsRUFBRXpELE1BQU0sQ0FBQ0csU0FBUyxDQUFDLENBQUMrVDtRQUMvQixDQUFDO01BQ0g7TUFDQSxJQUFJbFUsTUFBTSxDQUFDRyxTQUFTLENBQUMsSUFBSWYsTUFBTSxDQUFDRSxNQUFNLENBQUNhLFNBQVMsQ0FBQyxDQUFDN0QsSUFBSSxLQUFLLFNBQVMsRUFBRTtRQUNwRSxJQUFJNlgsTUFBTSxHQUFHLElBQUlDLE1BQU0sQ0FBQ3BVLE1BQU0sQ0FBQ0csU0FBUyxDQUFDLENBQUM7UUFDMUNnVSxNQUFNLEdBQUdBLE1BQU0sQ0FBQ2hULFNBQVMsQ0FBQyxDQUFDLEVBQUVnVCxNQUFNLENBQUNsWSxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUNxRSxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQzVELE1BQU0rVCxhQUFhLEdBQUdGLE1BQU0sQ0FBQ3RULEdBQUcsQ0FBQzJDLEtBQUssSUFBSTtVQUN4QyxPQUFPLENBQUM4USxVQUFVLENBQUM5USxLQUFLLENBQUNsRCxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRWdVLFVBQVUsQ0FBQzlRLEtBQUssQ0FBQ2xELEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNFLENBQUMsQ0FBQztRQUNGTixNQUFNLENBQUNHLFNBQVMsQ0FBQyxHQUFHO1VBQ2xCckMsTUFBTSxFQUFFLFNBQVM7VUFDakJpSixXQUFXLEVBQUVzTjtRQUNmLENBQUM7TUFDSDtNQUNBLElBQUlyVSxNQUFNLENBQUNHLFNBQVMsQ0FBQyxJQUFJZixNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLENBQUM3RCxJQUFJLEtBQUssTUFBTSxFQUFFO1FBQ2pFMEQsTUFBTSxDQUFDRyxTQUFTLENBQUMsR0FBRztVQUNsQnJDLE1BQU0sRUFBRSxNQUFNO1VBQ2RFLElBQUksRUFBRWdDLE1BQU0sQ0FBQ0csU0FBUztRQUN4QixDQUFDO01BQ0g7SUFDRixDQUFDLENBQUM7SUFDRjtJQUNBLElBQUlILE1BQU0sQ0FBQ3VVLFNBQVMsRUFBRTtNQUNwQnZVLE1BQU0sQ0FBQ3VVLFNBQVMsR0FBR3ZVLE1BQU0sQ0FBQ3VVLFNBQVMsQ0FBQ0MsV0FBVyxFQUFFO0lBQ25EO0lBQ0EsSUFBSXhVLE1BQU0sQ0FBQ3lVLFNBQVMsRUFBRTtNQUNwQnpVLE1BQU0sQ0FBQ3lVLFNBQVMsR0FBR3pVLE1BQU0sQ0FBQ3lVLFNBQVMsQ0FBQ0QsV0FBVyxFQUFFO0lBQ25EO0lBQ0EsSUFBSXhVLE1BQU0sQ0FBQzBVLFNBQVMsRUFBRTtNQUNwQjFVLE1BQU0sQ0FBQzBVLFNBQVMsR0FBRztRQUNqQjVXLE1BQU0sRUFBRSxNQUFNO1FBQ2RDLEdBQUcsRUFBRWlDLE1BQU0sQ0FBQzBVLFNBQVMsQ0FBQ0YsV0FBVztNQUNuQyxDQUFDO0lBQ0g7SUFDQSxJQUFJeFUsTUFBTSxDQUFDaU4sOEJBQThCLEVBQUU7TUFDekNqTixNQUFNLENBQUNpTiw4QkFBOEIsR0FBRztRQUN0Q25QLE1BQU0sRUFBRSxNQUFNO1FBQ2RDLEdBQUcsRUFBRWlDLE1BQU0sQ0FBQ2lOLDhCQUE4QixDQUFDdUgsV0FBVztNQUN4RCxDQUFDO0lBQ0g7SUFDQSxJQUFJeFUsTUFBTSxDQUFDbU4sMkJBQTJCLEVBQUU7TUFDdENuTixNQUFNLENBQUNtTiwyQkFBMkIsR0FBRztRQUNuQ3JQLE1BQU0sRUFBRSxNQUFNO1FBQ2RDLEdBQUcsRUFBRWlDLE1BQU0sQ0FBQ21OLDJCQUEyQixDQUFDcUgsV0FBVztNQUNyRCxDQUFDO0lBQ0g7SUFDQSxJQUFJeFUsTUFBTSxDQUFDc04sNEJBQTRCLEVBQUU7TUFDdkN0TixNQUFNLENBQUNzTiw0QkFBNEIsR0FBRztRQUNwQ3hQLE1BQU0sRUFBRSxNQUFNO1FBQ2RDLEdBQUcsRUFBRWlDLE1BQU0sQ0FBQ3NOLDRCQUE0QixDQUFDa0gsV0FBVztNQUN0RCxDQUFDO0lBQ0g7SUFDQSxJQUFJeFUsTUFBTSxDQUFDdU4sb0JBQW9CLEVBQUU7TUFDL0J2TixNQUFNLENBQUN1TixvQkFBb0IsR0FBRztRQUM1QnpQLE1BQU0sRUFBRSxNQUFNO1FBQ2RDLEdBQUcsRUFBRWlDLE1BQU0sQ0FBQ3VOLG9CQUFvQixDQUFDaUgsV0FBVztNQUM5QyxDQUFDO0lBQ0g7SUFFQSxLQUFLLE1BQU1yVSxTQUFTLElBQUlILE1BQU0sRUFBRTtNQUM5QixJQUFJQSxNQUFNLENBQUNHLFNBQVMsQ0FBQyxLQUFLLElBQUksRUFBRTtRQUM5QixPQUFPSCxNQUFNLENBQUNHLFNBQVMsQ0FBQztNQUMxQjtNQUNBLElBQUlILE1BQU0sQ0FBQ0csU0FBUyxDQUFDLFlBQVk0TyxJQUFJLEVBQUU7UUFDckMvTyxNQUFNLENBQUNHLFNBQVMsQ0FBQyxHQUFHO1VBQ2xCckMsTUFBTSxFQUFFLE1BQU07VUFDZEMsR0FBRyxFQUFFaUMsTUFBTSxDQUFDRyxTQUFTLENBQUMsQ0FBQ3FVLFdBQVc7UUFDcEMsQ0FBQztNQUNIO0lBQ0Y7SUFFQSxPQUFPeFUsTUFBTTtFQUNmOztFQUVBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQSxNQUFNMlUsZ0JBQWdCLENBQUN0VixTQUFpQixFQUFFRCxNQUFrQixFQUFFb1EsVUFBb0IsRUFBRTtJQUNsRixNQUFNb0YsY0FBYyxHQUFJLEdBQUV2VixTQUFVLFdBQVVtUSxVQUFVLENBQUMwRCxJQUFJLEVBQUUsQ0FBQ2pTLElBQUksQ0FBQyxHQUFHLENBQUUsRUFBQztJQUMzRSxNQUFNNFQsa0JBQWtCLEdBQUdyRixVQUFVLENBQUMzTyxHQUFHLENBQUMsQ0FBQ1YsU0FBUyxFQUFFWSxLQUFLLEtBQU0sSUFBR0EsS0FBSyxHQUFHLENBQUUsT0FBTSxDQUFDO0lBQ3JGLE1BQU0yTSxFQUFFLEdBQUksd0RBQXVEbUgsa0JBQWtCLENBQUM1VCxJQUFJLEVBQUcsR0FBRTtJQUMvRixPQUFPLElBQUksQ0FBQzhILE9BQU8sQ0FBQ3VCLElBQUksQ0FBQ29ELEVBQUUsRUFBRSxDQUFDck8sU0FBUyxFQUFFdVYsY0FBYyxFQUFFLEdBQUdwRixVQUFVLENBQUMsQ0FBQyxDQUFDaEYsS0FBSyxDQUFDekMsS0FBSyxJQUFJO01BQ3RGLElBQUlBLEtBQUssQ0FBQ3VFLElBQUksS0FBSy9RLDhCQUE4QixJQUFJd00sS0FBSyxDQUFDK00sT0FBTyxDQUFDeFQsUUFBUSxDQUFDc1QsY0FBYyxDQUFDLEVBQUU7UUFDM0Y7TUFBQSxDQUNELE1BQU0sSUFDTDdNLEtBQUssQ0FBQ3VFLElBQUksS0FBSzVRLGlDQUFpQyxJQUNoRHFNLEtBQUssQ0FBQytNLE9BQU8sQ0FBQ3hULFFBQVEsQ0FBQ3NULGNBQWMsQ0FBQyxFQUN0QztRQUNBO1FBQ0EsTUFBTSxJQUFJclQsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQ3FMLGVBQWUsRUFDM0IsK0RBQStELENBQ2hFO01BQ0gsQ0FBQyxNQUFNO1FBQ0wsTUFBTTlFLEtBQUs7TUFDYjtJQUNGLENBQUMsQ0FBQztFQUNKOztFQUVBO0VBQ0EsTUFBTW5KLEtBQUssQ0FDVFMsU0FBaUIsRUFDakJELE1BQWtCLEVBQ2xCMkMsS0FBZ0IsRUFDaEJnVCxjQUF1QixFQUN2QkMsUUFBa0IsR0FBRyxJQUFJLEVBQ3pCO0lBQ0FwWixLQUFLLENBQUMsT0FBTyxDQUFDO0lBQ2QsTUFBTXNHLE1BQU0sR0FBRyxDQUFDN0MsU0FBUyxDQUFDO0lBQzFCLE1BQU1nUyxLQUFLLEdBQUd2UCxnQkFBZ0IsQ0FBQztNQUM3QjFDLE1BQU07TUFDTjJDLEtBQUs7TUFDTGhCLEtBQUssRUFBRSxDQUFDO01BQ1JpQixlQUFlLEVBQUU7SUFDbkIsQ0FBQyxDQUFDO0lBQ0ZFLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDLEdBQUd3UCxLQUFLLENBQUNuUCxNQUFNLENBQUM7SUFFNUIsTUFBTW9SLFlBQVksR0FBR2pDLEtBQUssQ0FBQ3BPLE9BQU8sQ0FBQ2hILE1BQU0sR0FBRyxDQUFDLEdBQUksU0FBUW9WLEtBQUssQ0FBQ3BPLE9BQVEsRUFBQyxHQUFHLEVBQUU7SUFDN0UsSUFBSXlLLEVBQUUsR0FBRyxFQUFFO0lBRVgsSUFBSTJELEtBQUssQ0FBQ3BPLE9BQU8sQ0FBQ2hILE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQytZLFFBQVEsRUFBRTtNQUN6Q3RILEVBQUUsR0FBSSxnQ0FBK0I0RixZQUFhLEVBQUM7SUFDckQsQ0FBQyxNQUFNO01BQ0w1RixFQUFFLEdBQUcsNEVBQTRFO0lBQ25GO0lBRUEsT0FBTyxJQUFJLENBQUMzRSxPQUFPLENBQ2hCNkIsR0FBRyxDQUFDOEMsRUFBRSxFQUFFeEwsTUFBTSxFQUFFMkksQ0FBQyxJQUFJO01BQ3BCLElBQUlBLENBQUMsQ0FBQ29LLHFCQUFxQixJQUFJLElBQUksSUFBSXBLLENBQUMsQ0FBQ29LLHFCQUFxQixJQUFJLENBQUMsQ0FBQyxFQUFFO1FBQ3BFLE9BQU8sQ0FBQ3RPLEtBQUssQ0FBQyxDQUFDa0UsQ0FBQyxDQUFDak0sS0FBSyxDQUFDLEdBQUcsQ0FBQ2lNLENBQUMsQ0FBQ2pNLEtBQUssR0FBRyxDQUFDO01BQ3hDLENBQUMsTUFBTTtRQUNMLE9BQU8sQ0FBQ2lNLENBQUMsQ0FBQ29LLHFCQUFxQjtNQUNqQztJQUNGLENBQUMsQ0FBQyxDQUNEekssS0FBSyxDQUFDekMsS0FBSyxJQUFJO01BQ2QsSUFBSUEsS0FBSyxDQUFDdUUsSUFBSSxLQUFLaFIsaUNBQWlDLEVBQUU7UUFDcEQsTUFBTXlNLEtBQUs7TUFDYjtNQUNBLE9BQU8sQ0FBQztJQUNWLENBQUMsQ0FBQztFQUNOO0VBRUEsTUFBTW1OLFFBQVEsQ0FBQzdWLFNBQWlCLEVBQUVELE1BQWtCLEVBQUUyQyxLQUFnQixFQUFFNUIsU0FBaUIsRUFBRTtJQUN6RnZFLEtBQUssQ0FBQyxVQUFVLENBQUM7SUFDakIsSUFBSWdHLEtBQUssR0FBR3pCLFNBQVM7SUFDckIsSUFBSWdWLE1BQU0sR0FBR2hWLFNBQVM7SUFDdEIsTUFBTWlWLFFBQVEsR0FBR2pWLFNBQVMsQ0FBQ0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUM7SUFDNUMsSUFBSWdWLFFBQVEsRUFBRTtNQUNaeFQsS0FBSyxHQUFHaEIsNkJBQTZCLENBQUNULFNBQVMsQ0FBQyxDQUFDYyxJQUFJLENBQUMsSUFBSSxDQUFDO01BQzNEa1UsTUFBTSxHQUFHaFYsU0FBUyxDQUFDRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xDO0lBQ0EsTUFBTThCLFlBQVksR0FDaEJoRCxNQUFNLENBQUNFLE1BQU0sSUFBSUYsTUFBTSxDQUFDRSxNQUFNLENBQUNhLFNBQVMsQ0FBQyxJQUFJZixNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLENBQUM3RCxJQUFJLEtBQUssT0FBTztJQUN4RixNQUFNK1ksY0FBYyxHQUNsQmpXLE1BQU0sQ0FBQ0UsTUFBTSxJQUFJRixNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLElBQUlmLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDYSxTQUFTLENBQUMsQ0FBQzdELElBQUksS0FBSyxTQUFTO0lBQzFGLE1BQU00RixNQUFNLEdBQUcsQ0FBQ04sS0FBSyxFQUFFdVQsTUFBTSxFQUFFOVYsU0FBUyxDQUFDO0lBQ3pDLE1BQU1nUyxLQUFLLEdBQUd2UCxnQkFBZ0IsQ0FBQztNQUM3QjFDLE1BQU07TUFDTjJDLEtBQUs7TUFDTGhCLEtBQUssRUFBRSxDQUFDO01BQ1JpQixlQUFlLEVBQUU7SUFDbkIsQ0FBQyxDQUFDO0lBQ0ZFLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDLEdBQUd3UCxLQUFLLENBQUNuUCxNQUFNLENBQUM7SUFFNUIsTUFBTW9SLFlBQVksR0FBR2pDLEtBQUssQ0FBQ3BPLE9BQU8sQ0FBQ2hILE1BQU0sR0FBRyxDQUFDLEdBQUksU0FBUW9WLEtBQUssQ0FBQ3BPLE9BQVEsRUFBQyxHQUFHLEVBQUU7SUFDN0UsTUFBTXFTLFdBQVcsR0FBR2xULFlBQVksR0FBRyxzQkFBc0IsR0FBRyxJQUFJO0lBQ2hFLElBQUlzTCxFQUFFLEdBQUksbUJBQWtCNEgsV0FBWSxrQ0FBaUNoQyxZQUFhLEVBQUM7SUFDdkYsSUFBSThCLFFBQVEsRUFBRTtNQUNaMUgsRUFBRSxHQUFJLG1CQUFrQjRILFdBQVksZ0NBQStCaEMsWUFBYSxFQUFDO0lBQ25GO0lBQ0EsT0FBTyxJQUFJLENBQUN2SyxPQUFPLENBQ2hCc0YsR0FBRyxDQUFDWCxFQUFFLEVBQUV4TCxNQUFNLENBQUMsQ0FDZnNJLEtBQUssQ0FBQ3pDLEtBQUssSUFBSTtNQUNkLElBQUlBLEtBQUssQ0FBQ3VFLElBQUksS0FBSzdRLDBCQUEwQixFQUFFO1FBQzdDLE9BQU8sRUFBRTtNQUNYO01BQ0EsTUFBTXNNLEtBQUs7SUFDYixDQUFDLENBQUMsQ0FDRDZHLElBQUksQ0FBQ00sT0FBTyxJQUFJO01BQ2YsSUFBSSxDQUFDa0csUUFBUSxFQUFFO1FBQ2JsRyxPQUFPLEdBQUdBLE9BQU8sQ0FBQ2pCLE1BQU0sQ0FBQ2pPLE1BQU0sSUFBSUEsTUFBTSxDQUFDNEIsS0FBSyxDQUFDLEtBQUssSUFBSSxDQUFDO1FBQzFELE9BQU9zTixPQUFPLENBQUNyTyxHQUFHLENBQUNiLE1BQU0sSUFBSTtVQUMzQixJQUFJLENBQUNxVixjQUFjLEVBQUU7WUFDbkIsT0FBT3JWLE1BQU0sQ0FBQzRCLEtBQUssQ0FBQztVQUN0QjtVQUNBLE9BQU87WUFDTDlELE1BQU0sRUFBRSxTQUFTO1lBQ2pCdUIsU0FBUyxFQUFFRCxNQUFNLENBQUNFLE1BQU0sQ0FBQ2EsU0FBUyxDQUFDLENBQUM2VCxXQUFXO1lBQy9DMVYsUUFBUSxFQUFFMEIsTUFBTSxDQUFDNEIsS0FBSztVQUN4QixDQUFDO1FBQ0gsQ0FBQyxDQUFDO01BQ0o7TUFDQSxNQUFNMlQsS0FBSyxHQUFHcFYsU0FBUyxDQUFDRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO01BQ3JDLE9BQU80TyxPQUFPLENBQUNyTyxHQUFHLENBQUNiLE1BQU0sSUFBSUEsTUFBTSxDQUFDbVYsTUFBTSxDQUFDLENBQUNJLEtBQUssQ0FBQyxDQUFDO0lBQ3JELENBQUMsQ0FBQyxDQUNEM0csSUFBSSxDQUFDTSxPQUFPLElBQ1hBLE9BQU8sQ0FBQ3JPLEdBQUcsQ0FBQ2IsTUFBTSxJQUFJLElBQUksQ0FBQytULDJCQUEyQixDQUFDMVUsU0FBUyxFQUFFVyxNQUFNLEVBQUVaLE1BQU0sQ0FBQyxDQUFDLENBQ25GO0VBQ0w7RUFFQSxNQUFNb1csU0FBUyxDQUNiblcsU0FBaUIsRUFDakJELE1BQVcsRUFDWHFXLFFBQWEsRUFDYlYsY0FBdUIsRUFDdkJXLElBQVksRUFDWnZDLE9BQWlCLEVBQ2pCO0lBQ0F2WCxLQUFLLENBQUMsV0FBVyxDQUFDO0lBQ2xCLE1BQU1zRyxNQUFNLEdBQUcsQ0FBQzdDLFNBQVMsQ0FBQztJQUMxQixJQUFJMEIsS0FBYSxHQUFHLENBQUM7SUFDckIsSUFBSStNLE9BQWlCLEdBQUcsRUFBRTtJQUMxQixJQUFJNkgsVUFBVSxHQUFHLElBQUk7SUFDckIsSUFBSUMsV0FBVyxHQUFHLElBQUk7SUFDdEIsSUFBSXRDLFlBQVksR0FBRyxFQUFFO0lBQ3JCLElBQUlDLFlBQVksR0FBRyxFQUFFO0lBQ3JCLElBQUlDLFdBQVcsR0FBRyxFQUFFO0lBQ3BCLElBQUlDLFdBQVcsR0FBRyxFQUFFO0lBQ3BCLElBQUlvQyxZQUFZLEdBQUcsRUFBRTtJQUNyQixLQUFLLElBQUloUixDQUFDLEdBQUcsQ0FBQyxFQUFFQSxDQUFDLEdBQUc0USxRQUFRLENBQUN4WixNQUFNLEVBQUU0SSxDQUFDLElBQUksQ0FBQyxFQUFFO01BQzNDLE1BQU1pUixLQUFLLEdBQUdMLFFBQVEsQ0FBQzVRLENBQUMsQ0FBQztNQUN6QixJQUFJaVIsS0FBSyxDQUFDQyxNQUFNLEVBQUU7UUFDaEIsS0FBSyxNQUFNblUsS0FBSyxJQUFJa1UsS0FBSyxDQUFDQyxNQUFNLEVBQUU7VUFDaEMsTUFBTWxZLEtBQUssR0FBR2lZLEtBQUssQ0FBQ0MsTUFBTSxDQUFDblUsS0FBSyxDQUFDO1VBQ2pDLElBQUkvRCxLQUFLLEtBQUssSUFBSSxJQUFJQSxLQUFLLEtBQUtPLFNBQVMsRUFBRTtZQUN6QztVQUNGO1VBQ0EsSUFBSXdELEtBQUssS0FBSyxLQUFLLElBQUksT0FBTy9ELEtBQUssS0FBSyxRQUFRLElBQUlBLEtBQUssS0FBSyxFQUFFLEVBQUU7WUFDaEVpUSxPQUFPLENBQUNqTSxJQUFJLENBQUUsSUFBR2QsS0FBTSxxQkFBb0IsQ0FBQztZQUM1QzhVLFlBQVksR0FBSSxhQUFZOVUsS0FBTSxPQUFNO1lBQ3hDbUIsTUFBTSxDQUFDTCxJQUFJLENBQUNYLHVCQUF1QixDQUFDckQsS0FBSyxDQUFDLENBQUM7WUFDM0NrRCxLQUFLLElBQUksQ0FBQztZQUNWO1VBQ0Y7VUFDQSxJQUFJYSxLQUFLLEtBQUssS0FBSyxJQUFJLE9BQU8vRCxLQUFLLEtBQUssUUFBUSxJQUFJVyxNQUFNLENBQUN5QixJQUFJLENBQUNwQyxLQUFLLENBQUMsQ0FBQzVCLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDbkYyWixXQUFXLEdBQUcvWCxLQUFLO1lBQ25CLE1BQU1tWSxhQUFhLEdBQUcsRUFBRTtZQUN4QixLQUFLLE1BQU1DLEtBQUssSUFBSXBZLEtBQUssRUFBRTtjQUN6QixJQUFJLE9BQU9BLEtBQUssQ0FBQ29ZLEtBQUssQ0FBQyxLQUFLLFFBQVEsSUFBSXBZLEtBQUssQ0FBQ29ZLEtBQUssQ0FBQyxFQUFFO2dCQUNwRCxNQUFNQyxNQUFNLEdBQUdoVix1QkFBdUIsQ0FBQ3JELEtBQUssQ0FBQ29ZLEtBQUssQ0FBQyxDQUFDO2dCQUNwRCxJQUFJLENBQUNELGFBQWEsQ0FBQzFVLFFBQVEsQ0FBRSxJQUFHNFUsTUFBTyxHQUFFLENBQUMsRUFBRTtrQkFDMUNGLGFBQWEsQ0FBQ25VLElBQUksQ0FBRSxJQUFHcVUsTUFBTyxHQUFFLENBQUM7Z0JBQ25DO2dCQUNBaFUsTUFBTSxDQUFDTCxJQUFJLENBQUNxVSxNQUFNLEVBQUVELEtBQUssQ0FBQztnQkFDMUJuSSxPQUFPLENBQUNqTSxJQUFJLENBQUUsSUFBR2QsS0FBTSxhQUFZQSxLQUFLLEdBQUcsQ0FBRSxPQUFNLENBQUM7Z0JBQ3BEQSxLQUFLLElBQUksQ0FBQztjQUNaLENBQUMsTUFBTTtnQkFDTCxNQUFNb1YsU0FBUyxHQUFHM1gsTUFBTSxDQUFDeUIsSUFBSSxDQUFDcEMsS0FBSyxDQUFDb1ksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlDLE1BQU1DLE1BQU0sR0FBR2hWLHVCQUF1QixDQUFDckQsS0FBSyxDQUFDb1ksS0FBSyxDQUFDLENBQUNFLFNBQVMsQ0FBQyxDQUFDO2dCQUMvRCxJQUFJcFosd0JBQXdCLENBQUNvWixTQUFTLENBQUMsRUFBRTtrQkFDdkMsSUFBSSxDQUFDSCxhQUFhLENBQUMxVSxRQUFRLENBQUUsSUFBRzRVLE1BQU8sR0FBRSxDQUFDLEVBQUU7b0JBQzFDRixhQUFhLENBQUNuVSxJQUFJLENBQUUsSUFBR3FVLE1BQU8sR0FBRSxDQUFDO2tCQUNuQztrQkFDQXBJLE9BQU8sQ0FBQ2pNLElBQUksQ0FDVCxXQUFVOUUsd0JBQXdCLENBQUNvWixTQUFTLENBQzVDLFVBQVNwVixLQUFNLDBDQUF5Q0EsS0FBSyxHQUFHLENBQUUsT0FBTSxDQUMxRTtrQkFDRG1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDcVUsTUFBTSxFQUFFRCxLQUFLLENBQUM7a0JBQzFCbFYsS0FBSyxJQUFJLENBQUM7Z0JBQ1o7Y0FDRjtZQUNGO1lBQ0E4VSxZQUFZLEdBQUksYUFBWTlVLEtBQU0sTUFBSztZQUN2Q21CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDbVUsYUFBYSxDQUFDL1UsSUFBSSxFQUFFLENBQUM7WUFDakNGLEtBQUssSUFBSSxDQUFDO1lBQ1Y7VUFDRjtVQUNBLElBQUksT0FBT2xELEtBQUssS0FBSyxRQUFRLEVBQUU7WUFDN0IsSUFBSUEsS0FBSyxDQUFDdVksSUFBSSxFQUFFO2NBQ2QsSUFBSSxPQUFPdlksS0FBSyxDQUFDdVksSUFBSSxLQUFLLFFBQVEsRUFBRTtnQkFDbEN0SSxPQUFPLENBQUNqTSxJQUFJLENBQUUsUUFBT2QsS0FBTSxjQUFhQSxLQUFLLEdBQUcsQ0FBRSxPQUFNLENBQUM7Z0JBQ3pEbUIsTUFBTSxDQUFDTCxJQUFJLENBQUNYLHVCQUF1QixDQUFDckQsS0FBSyxDQUFDdVksSUFBSSxDQUFDLEVBQUV4VSxLQUFLLENBQUM7Z0JBQ3ZEYixLQUFLLElBQUksQ0FBQztjQUNaLENBQUMsTUFBTTtnQkFDTDRVLFVBQVUsR0FBRy9ULEtBQUs7Z0JBQ2xCa00sT0FBTyxDQUFDak0sSUFBSSxDQUFFLGdCQUFlZCxLQUFNLE9BQU0sQ0FBQztnQkFDMUNtQixNQUFNLENBQUNMLElBQUksQ0FBQ0QsS0FBSyxDQUFDO2dCQUNsQmIsS0FBSyxJQUFJLENBQUM7Y0FDWjtZQUNGO1lBQ0EsSUFBSWxELEtBQUssQ0FBQ3dZLElBQUksRUFBRTtjQUNkdkksT0FBTyxDQUFDak0sSUFBSSxDQUFFLFFBQU9kLEtBQU0sY0FBYUEsS0FBSyxHQUFHLENBQUUsT0FBTSxDQUFDO2NBQ3pEbUIsTUFBTSxDQUFDTCxJQUFJLENBQUNYLHVCQUF1QixDQUFDckQsS0FBSyxDQUFDd1ksSUFBSSxDQUFDLEVBQUV6VSxLQUFLLENBQUM7Y0FDdkRiLEtBQUssSUFBSSxDQUFDO1lBQ1o7WUFDQSxJQUFJbEQsS0FBSyxDQUFDeVksSUFBSSxFQUFFO2NBQ2R4SSxPQUFPLENBQUNqTSxJQUFJLENBQUUsUUFBT2QsS0FBTSxjQUFhQSxLQUFLLEdBQUcsQ0FBRSxPQUFNLENBQUM7Y0FDekRtQixNQUFNLENBQUNMLElBQUksQ0FBQ1gsdUJBQXVCLENBQUNyRCxLQUFLLENBQUN5WSxJQUFJLENBQUMsRUFBRTFVLEtBQUssQ0FBQztjQUN2RGIsS0FBSyxJQUFJLENBQUM7WUFDWjtZQUNBLElBQUlsRCxLQUFLLENBQUMwWSxJQUFJLEVBQUU7Y0FDZHpJLE9BQU8sQ0FBQ2pNLElBQUksQ0FBRSxRQUFPZCxLQUFNLGNBQWFBLEtBQUssR0FBRyxDQUFFLE9BQU0sQ0FBQztjQUN6RG1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDWCx1QkFBdUIsQ0FBQ3JELEtBQUssQ0FBQzBZLElBQUksQ0FBQyxFQUFFM1UsS0FBSyxDQUFDO2NBQ3ZEYixLQUFLLElBQUksQ0FBQztZQUNaO1VBQ0Y7UUFDRjtNQUNGLENBQUMsTUFBTTtRQUNMK00sT0FBTyxDQUFDak0sSUFBSSxDQUFDLEdBQUcsQ0FBQztNQUNuQjtNQUNBLElBQUlpVSxLQUFLLENBQUNVLFFBQVEsRUFBRTtRQUNsQixJQUFJMUksT0FBTyxDQUFDeE0sUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1VBQ3pCd00sT0FBTyxHQUFHLEVBQUU7UUFDZDtRQUNBLEtBQUssTUFBTWxNLEtBQUssSUFBSWtVLEtBQUssQ0FBQ1UsUUFBUSxFQUFFO1VBQ2xDLE1BQU0zWSxLQUFLLEdBQUdpWSxLQUFLLENBQUNVLFFBQVEsQ0FBQzVVLEtBQUssQ0FBQztVQUNuQyxJQUFJL0QsS0FBSyxLQUFLLENBQUMsSUFBSUEsS0FBSyxLQUFLLElBQUksRUFBRTtZQUNqQ2lRLE9BQU8sQ0FBQ2pNLElBQUksQ0FBRSxJQUFHZCxLQUFNLE9BQU0sQ0FBQztZQUM5Qm1CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDRCxLQUFLLENBQUM7WUFDbEJiLEtBQUssSUFBSSxDQUFDO1VBQ1o7UUFDRjtNQUNGO01BQ0EsSUFBSStVLEtBQUssQ0FBQ1csTUFBTSxFQUFFO1FBQ2hCLE1BQU14VSxRQUFRLEdBQUcsRUFBRTtRQUNuQixNQUFNaUIsT0FBTyxHQUFHMUUsTUFBTSxDQUFDc04sU0FBUyxDQUFDQyxjQUFjLENBQUNDLElBQUksQ0FBQzhKLEtBQUssQ0FBQ1csTUFBTSxFQUFFLEtBQUssQ0FBQyxHQUNyRSxNQUFNLEdBQ04sT0FBTztRQUVYLElBQUlYLEtBQUssQ0FBQ1csTUFBTSxDQUFDQyxHQUFHLEVBQUU7VUFDcEIsTUFBTUMsUUFBUSxHQUFHLENBQUMsQ0FBQztVQUNuQmIsS0FBSyxDQUFDVyxNQUFNLENBQUNDLEdBQUcsQ0FBQ3hXLE9BQU8sQ0FBQzBXLE9BQU8sSUFBSTtZQUNsQyxLQUFLLE1BQU12VixHQUFHLElBQUl1VixPQUFPLEVBQUU7Y0FDekJELFFBQVEsQ0FBQ3RWLEdBQUcsQ0FBQyxHQUFHdVYsT0FBTyxDQUFDdlYsR0FBRyxDQUFDO1lBQzlCO1VBQ0YsQ0FBQyxDQUFDO1VBQ0Z5VSxLQUFLLENBQUNXLE1BQU0sR0FBR0UsUUFBUTtRQUN6QjtRQUNBLEtBQUssSUFBSS9VLEtBQUssSUFBSWtVLEtBQUssQ0FBQ1csTUFBTSxFQUFFO1VBQzlCLE1BQU01WSxLQUFLLEdBQUdpWSxLQUFLLENBQUNXLE1BQU0sQ0FBQzdVLEtBQUssQ0FBQztVQUNqQyxJQUFJQSxLQUFLLEtBQUssS0FBSyxFQUFFO1lBQ25CQSxLQUFLLEdBQUcsVUFBVTtVQUNwQjtVQUNBLE1BQU1pVixhQUFhLEdBQUcsRUFBRTtVQUN4QnJZLE1BQU0sQ0FBQ3lCLElBQUksQ0FBQ3ZELHdCQUF3QixDQUFDLENBQUN3RCxPQUFPLENBQUNzSCxHQUFHLElBQUk7WUFDbkQsSUFBSTNKLEtBQUssQ0FBQzJKLEdBQUcsQ0FBQyxFQUFFO2NBQ2QsTUFBTUMsWUFBWSxHQUFHL0ssd0JBQXdCLENBQUM4SyxHQUFHLENBQUM7Y0FDbERxUCxhQUFhLENBQUNoVixJQUFJLENBQUUsSUFBR2QsS0FBTSxTQUFRMEcsWUFBYSxLQUFJMUcsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUFDO2NBQ2xFbUIsTUFBTSxDQUFDTCxJQUFJLENBQUNELEtBQUssRUFBRWhFLGVBQWUsQ0FBQ0MsS0FBSyxDQUFDMkosR0FBRyxDQUFDLENBQUMsQ0FBQztjQUMvQ3pHLEtBQUssSUFBSSxDQUFDO1lBQ1o7VUFDRixDQUFDLENBQUM7VUFDRixJQUFJOFYsYUFBYSxDQUFDNWEsTUFBTSxHQUFHLENBQUMsRUFBRTtZQUM1QmdHLFFBQVEsQ0FBQ0osSUFBSSxDQUFFLElBQUdnVixhQUFhLENBQUM1VixJQUFJLENBQUMsT0FBTyxDQUFFLEdBQUUsQ0FBQztVQUNuRDtVQUNBLElBQUk3QixNQUFNLENBQUNFLE1BQU0sQ0FBQ3NDLEtBQUssQ0FBQyxJQUFJeEMsTUFBTSxDQUFDRSxNQUFNLENBQUNzQyxLQUFLLENBQUMsQ0FBQ3RGLElBQUksSUFBSXVhLGFBQWEsQ0FBQzVhLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDbkZnRyxRQUFRLENBQUNKLElBQUksQ0FBRSxJQUFHZCxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLEVBQUMsQ0FBQztZQUMvQ21CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDRCxLQUFLLEVBQUUvRCxLQUFLLENBQUM7WUFDekJrRCxLQUFLLElBQUksQ0FBQztVQUNaO1FBQ0Y7UUFDQXVTLFlBQVksR0FBR3JSLFFBQVEsQ0FBQ2hHLE1BQU0sR0FBRyxDQUFDLEdBQUksU0FBUWdHLFFBQVEsQ0FBQ2hCLElBQUksQ0FBRSxJQUFHaUMsT0FBUSxHQUFFLENBQUUsRUFBQyxHQUFHLEVBQUU7TUFDcEY7TUFDQSxJQUFJNFMsS0FBSyxDQUFDZ0IsTUFBTSxFQUFFO1FBQ2hCdkQsWUFBWSxHQUFJLFVBQVN4UyxLQUFNLEVBQUM7UUFDaENtQixNQUFNLENBQUNMLElBQUksQ0FBQ2lVLEtBQUssQ0FBQ2dCLE1BQU0sQ0FBQztRQUN6Qi9WLEtBQUssSUFBSSxDQUFDO01BQ1o7TUFDQSxJQUFJK1UsS0FBSyxDQUFDaUIsS0FBSyxFQUFFO1FBQ2Z2RCxXQUFXLEdBQUksV0FBVXpTLEtBQU0sRUFBQztRQUNoQ21CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDaVUsS0FBSyxDQUFDaUIsS0FBSyxDQUFDO1FBQ3hCaFcsS0FBSyxJQUFJLENBQUM7TUFDWjtNQUNBLElBQUkrVSxLQUFLLENBQUNrQixLQUFLLEVBQUU7UUFDZixNQUFNOUQsSUFBSSxHQUFHNEMsS0FBSyxDQUFDa0IsS0FBSztRQUN4QixNQUFNL1csSUFBSSxHQUFHekIsTUFBTSxDQUFDeUIsSUFBSSxDQUFDaVQsSUFBSSxDQUFDO1FBQzlCLE1BQU1TLE9BQU8sR0FBRzFULElBQUksQ0FDakJZLEdBQUcsQ0FBQ1EsR0FBRyxJQUFJO1VBQ1YsTUFBTWlVLFdBQVcsR0FBR3BDLElBQUksQ0FBQzdSLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxLQUFLLEdBQUcsTUFBTTtVQUNwRCxNQUFNNFYsS0FBSyxHQUFJLElBQUdsVyxLQUFNLFNBQVF1VSxXQUFZLEVBQUM7VUFDN0N2VSxLQUFLLElBQUksQ0FBQztVQUNWLE9BQU9rVyxLQUFLO1FBQ2QsQ0FBQyxDQUFDLENBQ0RoVyxJQUFJLEVBQUU7UUFDVGlCLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDLEdBQUc1QixJQUFJLENBQUM7UUFDcEJ3VCxXQUFXLEdBQUdQLElBQUksS0FBSzlVLFNBQVMsSUFBSXVWLE9BQU8sQ0FBQzFYLE1BQU0sR0FBRyxDQUFDLEdBQUksWUFBVzBYLE9BQVEsRUFBQyxHQUFHLEVBQUU7TUFDckY7SUFDRjtJQUVBLElBQUlrQyxZQUFZLEVBQUU7TUFDaEIvSCxPQUFPLENBQUM1TixPQUFPLENBQUMsQ0FBQ2lNLENBQUMsRUFBRXRILENBQUMsRUFBRWdHLENBQUMsS0FBSztRQUMzQixJQUFJc0IsQ0FBQyxJQUFJQSxDQUFDLENBQUMrSyxJQUFJLEVBQUUsS0FBSyxHQUFHLEVBQUU7VUFDekJyTSxDQUFDLENBQUNoRyxDQUFDLENBQUMsR0FBRyxFQUFFO1FBQ1g7TUFDRixDQUFDLENBQUM7SUFDSjtJQUVBLE1BQU1pUCxhQUFhLEdBQUksVUFBU2hHLE9BQU8sQ0FDcENHLE1BQU0sQ0FBQ2tKLE9BQU8sQ0FBQyxDQUNmbFcsSUFBSSxFQUFHLGlCQUFnQnFTLFlBQWEsSUFBR0UsV0FBWSxJQUFHcUMsWUFBYSxJQUFHcEMsV0FBWSxJQUFHRixZQUFhLEVBQUM7SUFDdEcsTUFBTTdGLEVBQUUsR0FBR3lGLE9BQU8sR0FBRyxJQUFJLENBQUM1SixzQkFBc0IsQ0FBQ3VLLGFBQWEsQ0FBQyxHQUFHQSxhQUFhO0lBQy9FLE9BQU8sSUFBSSxDQUFDL0ssT0FBTyxDQUFDc0YsR0FBRyxDQUFDWCxFQUFFLEVBQUV4TCxNQUFNLENBQUMsQ0FBQzBNLElBQUksQ0FBQy9ELENBQUMsSUFBSTtNQUM1QyxJQUFJc0ksT0FBTyxFQUFFO1FBQ1gsT0FBT3RJLENBQUM7TUFDVjtNQUNBLE1BQU1xRSxPQUFPLEdBQUdyRSxDQUFDLENBQUNoSyxHQUFHLENBQUNiLE1BQU0sSUFBSSxJQUFJLENBQUMrVCwyQkFBMkIsQ0FBQzFVLFNBQVMsRUFBRVcsTUFBTSxFQUFFWixNQUFNLENBQUMsQ0FBQztNQUM1RjhQLE9BQU8sQ0FBQ2hQLE9BQU8sQ0FBQzJILE1BQU0sSUFBSTtRQUN4QixJQUFJLENBQUNySixNQUFNLENBQUNzTixTQUFTLENBQUNDLGNBQWMsQ0FBQ0MsSUFBSSxDQUFDbkUsTUFBTSxFQUFFLFVBQVUsQ0FBQyxFQUFFO1VBQzdEQSxNQUFNLENBQUN2SixRQUFRLEdBQUcsSUFBSTtRQUN4QjtRQUNBLElBQUlzWCxXQUFXLEVBQUU7VUFDZi9OLE1BQU0sQ0FBQ3ZKLFFBQVEsR0FBRyxDQUFDLENBQUM7VUFDcEIsS0FBSyxNQUFNK0MsR0FBRyxJQUFJdVUsV0FBVyxFQUFFO1lBQzdCL04sTUFBTSxDQUFDdkosUUFBUSxDQUFDK0MsR0FBRyxDQUFDLEdBQUd3RyxNQUFNLENBQUN4RyxHQUFHLENBQUM7WUFDbEMsT0FBT3dHLE1BQU0sQ0FBQ3hHLEdBQUcsQ0FBQztVQUNwQjtRQUNGO1FBQ0EsSUFBSXNVLFVBQVUsRUFBRTtVQUNkOU4sTUFBTSxDQUFDOE4sVUFBVSxDQUFDLEdBQUd5QixRQUFRLENBQUN2UCxNQUFNLENBQUM4TixVQUFVLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDdkQ7TUFDRixDQUFDLENBQUM7TUFDRixPQUFPekcsT0FBTztJQUNoQixDQUFDLENBQUM7RUFDSjtFQUVBLE1BQU1tSSxxQkFBcUIsQ0FBQztJQUFFQztFQUE0QixDQUFDLEVBQUU7SUFDM0Q7SUFDQTFiLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQztJQUM5QixNQUFNLElBQUksQ0FBQzZPLDZCQUE2QixFQUFFO0lBQzFDLE1BQU04TSxRQUFRLEdBQUdELHNCQUFzQixDQUFDelcsR0FBRyxDQUFDekIsTUFBTSxJQUFJO01BQ3BELE9BQU8sSUFBSSxDQUFDc04sV0FBVyxDQUFDdE4sTUFBTSxDQUFDQyxTQUFTLEVBQUVELE1BQU0sQ0FBQyxDQUM5Q29MLEtBQUssQ0FBQ21DLEdBQUcsSUFBSTtRQUNaLElBQ0VBLEdBQUcsQ0FBQ0wsSUFBSSxLQUFLL1EsOEJBQThCLElBQzNDb1IsR0FBRyxDQUFDTCxJQUFJLEtBQUsvSyxhQUFLLENBQUNDLEtBQUssQ0FBQ2dXLGtCQUFrQixFQUMzQztVQUNBLE9BQU9qTSxPQUFPLENBQUNDLE9BQU8sRUFBRTtRQUMxQjtRQUNBLE1BQU1tQixHQUFHO01BQ1gsQ0FBQyxDQUFDLENBQ0RpQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUNmLGFBQWEsQ0FBQ3pPLE1BQU0sQ0FBQ0MsU0FBUyxFQUFFRCxNQUFNLENBQUMsQ0FBQztJQUM3RCxDQUFDLENBQUM7SUFDRm1ZLFFBQVEsQ0FBQzFWLElBQUksQ0FBQyxJQUFJLENBQUNpSSxlQUFlLEVBQUUsQ0FBQztJQUNyQyxPQUFPeUIsT0FBTyxDQUFDa00sR0FBRyxDQUFDRixRQUFRLENBQUMsQ0FDekIzSSxJQUFJLENBQUMsTUFBTTtNQUNWLE9BQU8sSUFBSSxDQUFDN0YsT0FBTyxDQUFDa0QsRUFBRSxDQUFDLHdCQUF3QixFQUFFLE1BQU1mLENBQUMsSUFBSTtRQUMxRCxNQUFNQSxDQUFDLENBQUNaLElBQUksQ0FBQ29OLFlBQUcsQ0FBQ0MsSUFBSSxDQUFDQyxpQkFBaUIsQ0FBQztRQUN4QyxNQUFNMU0sQ0FBQyxDQUFDWixJQUFJLENBQUNvTixZQUFHLENBQUNHLEtBQUssQ0FBQ0MsR0FBRyxDQUFDO1FBQzNCLE1BQU01TSxDQUFDLENBQUNaLElBQUksQ0FBQ29OLFlBQUcsQ0FBQ0csS0FBSyxDQUFDRSxTQUFTLENBQUM7UUFDakMsTUFBTTdNLENBQUMsQ0FBQ1osSUFBSSxDQUFDb04sWUFBRyxDQUFDRyxLQUFLLENBQUNHLE1BQU0sQ0FBQztRQUM5QixNQUFNOU0sQ0FBQyxDQUFDWixJQUFJLENBQUNvTixZQUFHLENBQUNHLEtBQUssQ0FBQ0ksV0FBVyxDQUFDO1FBQ25DLE1BQU0vTSxDQUFDLENBQUNaLElBQUksQ0FBQ29OLFlBQUcsQ0FBQ0csS0FBSyxDQUFDSyxnQkFBZ0IsQ0FBQztRQUN4QyxNQUFNaE4sQ0FBQyxDQUFDWixJQUFJLENBQUNvTixZQUFHLENBQUNHLEtBQUssQ0FBQ00sUUFBUSxDQUFDO1FBQ2hDLE9BQU9qTixDQUFDLENBQUNrTixHQUFHO01BQ2QsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQ0R4SixJQUFJLENBQUN3SixHQUFHLElBQUk7TUFDWHhjLEtBQUssQ0FBRSx5QkFBd0J3YyxHQUFHLENBQUNDLFFBQVMsRUFBQyxDQUFDO0lBQ2hELENBQUMsQ0FBQyxDQUNEN04sS0FBSyxDQUFDekMsS0FBSyxJQUFJO01BQ2Q7TUFDQUQsT0FBTyxDQUFDQyxLQUFLLENBQUNBLEtBQUssQ0FBQztJQUN0QixDQUFDLENBQUM7RUFDTjtFQUVBLE1BQU1tRSxhQUFhLENBQUM3TSxTQUFpQixFQUFFTyxPQUFZLEVBQUU4SyxJQUFVLEVBQWlCO0lBQzlFLE9BQU8sQ0FBQ0EsSUFBSSxJQUFJLElBQUksQ0FBQzNCLE9BQU8sRUFBRWtELEVBQUUsQ0FBQ2YsQ0FBQyxJQUNoQ0EsQ0FBQyxDQUFDeUMsS0FBSyxDQUNML04sT0FBTyxDQUFDaUIsR0FBRyxDQUFDZ0UsQ0FBQyxJQUFJO01BQ2YsT0FBT3FHLENBQUMsQ0FBQ1osSUFBSSxDQUFDLHlEQUF5RCxFQUFFLENBQ3ZFekYsQ0FBQyxDQUFDN0csSUFBSSxFQUNOcUIsU0FBUyxFQUNUd0YsQ0FBQyxDQUFDeEQsR0FBRyxDQUNOLENBQUM7SUFDSixDQUFDLENBQUMsQ0FDSCxDQUNGO0VBQ0g7RUFFQSxNQUFNaVgscUJBQXFCLENBQ3pCalosU0FBaUIsRUFDakJjLFNBQWlCLEVBQ2pCN0QsSUFBUyxFQUNUb08sSUFBVSxFQUNLO0lBQ2YsTUFBTSxDQUFDQSxJQUFJLElBQUksSUFBSSxDQUFDM0IsT0FBTyxFQUFFdUIsSUFBSSxDQUFDLHlEQUF5RCxFQUFFLENBQzNGbkssU0FBUyxFQUNUZCxTQUFTLEVBQ1QvQyxJQUFJLENBQ0wsQ0FBQztFQUNKO0VBRUEsTUFBTWlRLFdBQVcsQ0FBQ2xOLFNBQWlCLEVBQUVPLE9BQVksRUFBRThLLElBQVMsRUFBaUI7SUFDM0UsTUFBTTRFLE9BQU8sR0FBRzFQLE9BQU8sQ0FBQ2lCLEdBQUcsQ0FBQ2dFLENBQUMsS0FBSztNQUNoQzlDLEtBQUssRUFBRSxvQkFBb0I7TUFDM0JHLE1BQU0sRUFBRTJDO0lBQ1YsQ0FBQyxDQUFDLENBQUM7SUFDSCxNQUFNLENBQUM2RixJQUFJLElBQUksSUFBSSxDQUFDM0IsT0FBTyxFQUFFa0QsRUFBRSxDQUFDZixDQUFDLElBQUlBLENBQUMsQ0FBQ1osSUFBSSxDQUFDLElBQUksQ0FBQ3JCLElBQUksQ0FBQzBGLE9BQU8sQ0FBQzVTLE1BQU0sQ0FBQ3VULE9BQU8sQ0FBQyxDQUFDLENBQUM7RUFDakY7RUFFQSxNQUFNaUosVUFBVSxDQUFDbFosU0FBaUIsRUFBRTtJQUNsQyxNQUFNcU8sRUFBRSxHQUFHLHlEQUF5RDtJQUNwRSxPQUFPLElBQUksQ0FBQzNFLE9BQU8sQ0FBQ3NGLEdBQUcsQ0FBQ1gsRUFBRSxFQUFFO01BQUVyTztJQUFVLENBQUMsQ0FBQztFQUM1QztFQUVBLE1BQU1tWix1QkFBdUIsR0FBa0I7SUFDN0MsT0FBT2pOLE9BQU8sQ0FBQ0MsT0FBTyxFQUFFO0VBQzFCOztFQUVBO0VBQ0EsTUFBTWlOLG9CQUFvQixDQUFDcFosU0FBaUIsRUFBRTtJQUM1QyxPQUFPLElBQUksQ0FBQzBKLE9BQU8sQ0FBQ3VCLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDakwsU0FBUyxDQUFDLENBQUM7RUFDMUQ7RUFFQSxNQUFNcVosMEJBQTBCLEdBQWlCO0lBQy9DLE9BQU8sSUFBSW5OLE9BQU8sQ0FBQ0MsT0FBTyxJQUFJO01BQzVCLE1BQU1zRSxvQkFBb0IsR0FBRyxDQUFDLENBQUM7TUFDL0JBLG9CQUFvQixDQUFDakksTUFBTSxHQUFHLElBQUksQ0FBQ2tCLE9BQU8sQ0FBQ2tELEVBQUUsQ0FBQ2YsQ0FBQyxJQUFJO1FBQ2pENEUsb0JBQW9CLENBQUM1RSxDQUFDLEdBQUdBLENBQUM7UUFDMUI0RSxvQkFBb0IsQ0FBQ2UsT0FBTyxHQUFHLElBQUl0RixPQUFPLENBQUNDLE9BQU8sSUFBSTtVQUNwRHNFLG9CQUFvQixDQUFDdEUsT0FBTyxHQUFHQSxPQUFPO1FBQ3hDLENBQUMsQ0FBQztRQUNGc0Usb0JBQW9CLENBQUNuQyxLQUFLLEdBQUcsRUFBRTtRQUMvQm5DLE9BQU8sQ0FBQ3NFLG9CQUFvQixDQUFDO1FBQzdCLE9BQU9BLG9CQUFvQixDQUFDZSxPQUFPO01BQ3JDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQztFQUNKO0VBRUE4SCwwQkFBMEIsQ0FBQzdJLG9CQUF5QixFQUFpQjtJQUNuRUEsb0JBQW9CLENBQUN0RSxPQUFPLENBQUNzRSxvQkFBb0IsQ0FBQzVFLENBQUMsQ0FBQ3lDLEtBQUssQ0FBQ21DLG9CQUFvQixDQUFDbkMsS0FBSyxDQUFDLENBQUM7SUFDdEYsT0FBT21DLG9CQUFvQixDQUFDakksTUFBTTtFQUNwQztFQUVBK1EseUJBQXlCLENBQUM5SSxvQkFBeUIsRUFBaUI7SUFDbEUsTUFBTWpJLE1BQU0sR0FBR2lJLG9CQUFvQixDQUFDakksTUFBTSxDQUFDMkMsS0FBSyxFQUFFO0lBQ2xEc0Ysb0JBQW9CLENBQUNuQyxLQUFLLENBQUM5TCxJQUFJLENBQUMwSixPQUFPLENBQUNxSCxNQUFNLEVBQUUsQ0FBQztJQUNqRDlDLG9CQUFvQixDQUFDdEUsT0FBTyxDQUFDc0Usb0JBQW9CLENBQUM1RSxDQUFDLENBQUN5QyxLQUFLLENBQUNtQyxvQkFBb0IsQ0FBQ25DLEtBQUssQ0FBQyxDQUFDO0lBQ3RGLE9BQU85RixNQUFNO0VBQ2Y7RUFFQSxNQUFNZ1IsV0FBVyxDQUNmeFosU0FBaUIsRUFDakJELE1BQWtCLEVBQ2xCb1EsVUFBb0IsRUFDcEJzSixTQUFrQixFQUNsQjlXLGVBQXdCLEdBQUcsS0FBSyxFQUNoQ3VHLE9BQWdCLEdBQUcsQ0FBQyxDQUFDLEVBQ1A7SUFDZCxNQUFNbUMsSUFBSSxHQUFHbkMsT0FBTyxDQUFDbUMsSUFBSSxLQUFLdE0sU0FBUyxHQUFHbUssT0FBTyxDQUFDbUMsSUFBSSxHQUFHLElBQUksQ0FBQzNCLE9BQU87SUFDckUsTUFBTWdRLGdCQUFnQixHQUFJLGlCQUFnQnZKLFVBQVUsQ0FBQzBELElBQUksRUFBRSxDQUFDalMsSUFBSSxDQUFDLEdBQUcsQ0FBRSxFQUFDO0lBQ3ZFLE1BQU0rWCxnQkFBd0IsR0FDNUJGLFNBQVMsSUFBSSxJQUFJLEdBQUc7TUFBRTlhLElBQUksRUFBRThhO0lBQVUsQ0FBQyxHQUFHO01BQUU5YSxJQUFJLEVBQUUrYTtJQUFpQixDQUFDO0lBQ3RFLE1BQU1sRSxrQkFBa0IsR0FBRzdTLGVBQWUsR0FDdEN3TixVQUFVLENBQUMzTyxHQUFHLENBQUMsQ0FBQ1YsU0FBUyxFQUFFWSxLQUFLLEtBQU0sVUFBU0EsS0FBSyxHQUFHLENBQUUsNEJBQTJCLENBQUMsR0FDckZ5TyxVQUFVLENBQUMzTyxHQUFHLENBQUMsQ0FBQ1YsU0FBUyxFQUFFWSxLQUFLLEtBQU0sSUFBR0EsS0FBSyxHQUFHLENBQUUsT0FBTSxDQUFDO0lBQzlELE1BQU0yTSxFQUFFLEdBQUksa0RBQWlEbUgsa0JBQWtCLENBQUM1VCxJQUFJLEVBQUcsR0FBRTtJQUN6RixNQUFNZ1ksc0JBQXNCLEdBQzFCMVEsT0FBTyxDQUFDMFEsc0JBQXNCLEtBQUs3YSxTQUFTLEdBQUdtSyxPQUFPLENBQUMwUSxzQkFBc0IsR0FBRyxLQUFLO0lBQ3ZGLElBQUlBLHNCQUFzQixFQUFFO01BQzFCLE1BQU0sSUFBSSxDQUFDQywrQkFBK0IsQ0FBQzNRLE9BQU8sQ0FBQztJQUNyRDtJQUNBLE1BQU1tQyxJQUFJLENBQUNKLElBQUksQ0FBQ29ELEVBQUUsRUFBRSxDQUFDc0wsZ0JBQWdCLENBQUNoYixJQUFJLEVBQUVxQixTQUFTLEVBQUUsR0FBR21RLFVBQVUsQ0FBQyxDQUFDLENBQUNoRixLQUFLLENBQUN6QyxLQUFLLElBQUk7TUFDcEYsSUFDRUEsS0FBSyxDQUFDdUUsSUFBSSxLQUFLL1EsOEJBQThCLElBQzdDd00sS0FBSyxDQUFDK00sT0FBTyxDQUFDeFQsUUFBUSxDQUFDMFgsZ0JBQWdCLENBQUNoYixJQUFJLENBQUMsRUFDN0M7UUFDQTtNQUFBLENBQ0QsTUFBTSxJQUNMK0osS0FBSyxDQUFDdUUsSUFBSSxLQUFLNVEsaUNBQWlDLElBQ2hEcU0sS0FBSyxDQUFDK00sT0FBTyxDQUFDeFQsUUFBUSxDQUFDMFgsZ0JBQWdCLENBQUNoYixJQUFJLENBQUMsRUFDN0M7UUFDQTtRQUNBLE1BQU0sSUFBSXVELGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUNxTCxlQUFlLEVBQzNCLCtEQUErRCxDQUNoRTtNQUNILENBQUMsTUFBTTtRQUNMLE1BQU05RSxLQUFLO01BQ2I7SUFDRixDQUFDLENBQUM7RUFDSjtFQUVBLE1BQU1vUix5QkFBeUIsQ0FBQzVRLE9BQWdCLEdBQUcsQ0FBQyxDQUFDLEVBQWdCO0lBQ25FLE1BQU1tQyxJQUFJLEdBQUduQyxPQUFPLENBQUNtQyxJQUFJLEtBQUt0TSxTQUFTLEdBQUdtSyxPQUFPLENBQUNtQyxJQUFJLEdBQUcsSUFBSSxDQUFDM0IsT0FBTztJQUNyRSxNQUFNMkUsRUFBRSxHQUFHLDhEQUE4RDtJQUN6RSxPQUFPaEQsSUFBSSxDQUFDSixJQUFJLENBQUNvRCxFQUFFLENBQUMsQ0FBQ2xELEtBQUssQ0FBQ3pDLEtBQUssSUFBSTtNQUNsQyxNQUFNQSxLQUFLO0lBQ2IsQ0FBQyxDQUFDO0VBQ0o7RUFFQSxNQUFNbVIsK0JBQStCLENBQUMzUSxPQUFnQixHQUFHLENBQUMsQ0FBQyxFQUFnQjtJQUN6RSxNQUFNbUMsSUFBSSxHQUFHbkMsT0FBTyxDQUFDbUMsSUFBSSxLQUFLdE0sU0FBUyxHQUFHbUssT0FBTyxDQUFDbUMsSUFBSSxHQUFHLElBQUksQ0FBQzNCLE9BQU87SUFDckUsTUFBTXFRLFVBQVUsR0FBRzdRLE9BQU8sQ0FBQzhRLEdBQUcsS0FBS2piLFNBQVMsR0FBSSxHQUFFbUssT0FBTyxDQUFDOFEsR0FBSSxVQUFTLEdBQUcsWUFBWTtJQUN0RixNQUFNM0wsRUFBRSxHQUNOLG1MQUFtTDtJQUNyTCxPQUFPaEQsSUFBSSxDQUFDSixJQUFJLENBQUNvRCxFQUFFLEVBQUUsQ0FBQzBMLFVBQVUsQ0FBQyxDQUFDLENBQUM1TyxLQUFLLENBQUN6QyxLQUFLLElBQUk7TUFDaEQsTUFBTUEsS0FBSztJQUNiLENBQUMsQ0FBQztFQUNKO0FBQ0Y7QUFBQztBQUVELFNBQVNSLG1CQUFtQixDQUFDVixPQUFPLEVBQUU7RUFDcEMsSUFBSUEsT0FBTyxDQUFDNUssTUFBTSxHQUFHLENBQUMsRUFBRTtJQUN0QixNQUFNLElBQUlzRixhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUMrQixZQUFZLEVBQUcscUNBQW9DLENBQUM7RUFDeEY7RUFDQSxJQUNFc0QsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLQSxPQUFPLENBQUNBLE9BQU8sQ0FBQzVLLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFDaEQ0SyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUtBLE9BQU8sQ0FBQ0EsT0FBTyxDQUFDNUssTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUNoRDtJQUNBNEssT0FBTyxDQUFDaEYsSUFBSSxDQUFDZ0YsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzFCO0VBQ0EsTUFBTXlTLE1BQU0sR0FBR3pTLE9BQU8sQ0FBQ29ILE1BQU0sQ0FBQyxDQUFDQyxJQUFJLEVBQUVuTixLQUFLLEVBQUV3WSxFQUFFLEtBQUs7SUFDakQsSUFBSUMsVUFBVSxHQUFHLENBQUMsQ0FBQztJQUNuQixLQUFLLElBQUkzVSxDQUFDLEdBQUcsQ0FBQyxFQUFFQSxDQUFDLEdBQUcwVSxFQUFFLENBQUN0ZCxNQUFNLEVBQUU0SSxDQUFDLElBQUksQ0FBQyxFQUFFO01BQ3JDLE1BQU00VSxFQUFFLEdBQUdGLEVBQUUsQ0FBQzFVLENBQUMsQ0FBQztNQUNoQixJQUFJNFUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLdkwsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJdUwsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLdkwsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFO1FBQzFDc0wsVUFBVSxHQUFHM1UsQ0FBQztRQUNkO01BQ0Y7SUFDRjtJQUNBLE9BQU8yVSxVQUFVLEtBQUt6WSxLQUFLO0VBQzdCLENBQUMsQ0FBQztFQUNGLElBQUl1WSxNQUFNLENBQUNyZCxNQUFNLEdBQUcsQ0FBQyxFQUFFO0lBQ3JCLE1BQU0sSUFBSXNGLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUNrWSxxQkFBcUIsRUFDakMsdURBQXVELENBQ3hEO0VBQ0g7RUFDQSxNQUFNNVMsTUFBTSxHQUFHRCxPQUFPLENBQ25CaEcsR0FBRyxDQUFDMkMsS0FBSyxJQUFJO0lBQ1pqQyxhQUFLLENBQUNnRixRQUFRLENBQUNHLFNBQVMsQ0FBQzROLFVBQVUsQ0FBQzlRLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFOFEsVUFBVSxDQUFDOVEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDcEUsT0FBUSxJQUFHQSxLQUFLLENBQUMsQ0FBQyxDQUFFLEtBQUlBLEtBQUssQ0FBQyxDQUFDLENBQUUsR0FBRTtFQUNyQyxDQUFDLENBQUMsQ0FDRHZDLElBQUksQ0FBQyxJQUFJLENBQUM7RUFDYixPQUFRLElBQUc2RixNQUFPLEdBQUU7QUFDdEI7QUFFQSxTQUFTUSxnQkFBZ0IsQ0FBQ0osS0FBSyxFQUFFO0VBQy9CLElBQUksQ0FBQ0EsS0FBSyxDQUFDeVMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFO0lBQ3pCelMsS0FBSyxJQUFJLElBQUk7RUFDZjs7RUFFQTtFQUNBLE9BQ0VBLEtBQUssQ0FDRjBTLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxJQUFJO0VBQ2hDO0VBQUEsQ0FDQ0EsT0FBTyxDQUFDLFdBQVcsRUFBRSxFQUFFO0VBQ3hCO0VBQUEsQ0FDQ0EsT0FBTyxDQUFDLGVBQWUsRUFBRSxJQUFJO0VBQzlCO0VBQUEsQ0FDQ0EsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FDbkIxQyxJQUFJLEVBQUU7QUFFYjtBQUVBLFNBQVNwUyxtQkFBbUIsQ0FBQytVLENBQUMsRUFBRTtFQUM5QixJQUFJQSxDQUFDLElBQUlBLENBQUMsQ0FBQ0MsVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFO0lBQzFCO0lBQ0EsT0FBTyxHQUFHLEdBQUdDLG1CQUFtQixDQUFDRixDQUFDLENBQUM3ZCxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDOUMsQ0FBQyxNQUFNLElBQUk2ZCxDQUFDLElBQUlBLENBQUMsQ0FBQ0YsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFO0lBQy9CO0lBQ0EsT0FBT0ksbUJBQW1CLENBQUNGLENBQUMsQ0FBQzdkLEtBQUssQ0FBQyxDQUFDLEVBQUU2ZCxDQUFDLENBQUM1ZCxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHO0VBQzVEOztFQUVBO0VBQ0EsT0FBTzhkLG1CQUFtQixDQUFDRixDQUFDLENBQUM7QUFDL0I7QUFFQSxTQUFTRyxpQkFBaUIsQ0FBQ25jLEtBQUssRUFBRTtFQUNoQyxJQUFJLENBQUNBLEtBQUssSUFBSSxPQUFPQSxLQUFLLEtBQUssUUFBUSxJQUFJLENBQUNBLEtBQUssQ0FBQ2ljLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRTtJQUNqRSxPQUFPLEtBQUs7RUFDZDtFQUVBLE1BQU03SSxPQUFPLEdBQUdwVCxLQUFLLENBQUM0RSxLQUFLLENBQUMsWUFBWSxDQUFDO0VBQ3pDLE9BQU8sQ0FBQyxDQUFDd08sT0FBTztBQUNsQjtBQUVBLFNBQVNyTSxzQkFBc0IsQ0FBQzFDLE1BQU0sRUFBRTtFQUN0QyxJQUFJLENBQUNBLE1BQU0sSUFBSSxDQUFDMkIsS0FBSyxDQUFDQyxPQUFPLENBQUM1QixNQUFNLENBQUMsSUFBSUEsTUFBTSxDQUFDakcsTUFBTSxLQUFLLENBQUMsRUFBRTtJQUM1RCxPQUFPLElBQUk7RUFDYjtFQUVBLE1BQU1nZSxrQkFBa0IsR0FBR0QsaUJBQWlCLENBQUM5WCxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUNTLE1BQU0sQ0FBQztFQUM5RCxJQUFJVCxNQUFNLENBQUNqRyxNQUFNLEtBQUssQ0FBQyxFQUFFO0lBQ3ZCLE9BQU9nZSxrQkFBa0I7RUFDM0I7RUFFQSxLQUFLLElBQUlwVixDQUFDLEdBQUcsQ0FBQyxFQUFFNUksTUFBTSxHQUFHaUcsTUFBTSxDQUFDakcsTUFBTSxFQUFFNEksQ0FBQyxHQUFHNUksTUFBTSxFQUFFLEVBQUU0SSxDQUFDLEVBQUU7SUFDdkQsSUFBSW9WLGtCQUFrQixLQUFLRCxpQkFBaUIsQ0FBQzlYLE1BQU0sQ0FBQzJDLENBQUMsQ0FBQyxDQUFDbEMsTUFBTSxDQUFDLEVBQUU7TUFDOUQsT0FBTyxLQUFLO0lBQ2Q7RUFDRjtFQUVBLE9BQU8sSUFBSTtBQUNiO0FBRUEsU0FBU2dDLHlCQUF5QixDQUFDekMsTUFBTSxFQUFFO0VBQ3pDLE9BQU9BLE1BQU0sQ0FBQ2dZLElBQUksQ0FBQyxVQUFVcmMsS0FBSyxFQUFFO0lBQ2xDLE9BQU9tYyxpQkFBaUIsQ0FBQ25jLEtBQUssQ0FBQzhFLE1BQU0sQ0FBQztFQUN4QyxDQUFDLENBQUM7QUFDSjtBQUVBLFNBQVN3WCxrQkFBa0IsQ0FBQ0MsU0FBUyxFQUFFO0VBQ3JDLE9BQU9BLFNBQVMsQ0FDYjlaLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FDVE8sR0FBRyxDQUFDeVIsQ0FBQyxJQUFJO0lBQ1IsTUFBTXBMLEtBQUssR0FBR21ULE1BQU0sQ0FBQyxlQUFlLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUM1QyxJQUFJL0gsQ0FBQyxDQUFDN1AsS0FBSyxDQUFDeUUsS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFO01BQzNCO01BQ0EsT0FBT29MLENBQUM7SUFDVjtJQUNBO0lBQ0EsT0FBT0EsQ0FBQyxLQUFNLEdBQUUsR0FBSSxJQUFHLEdBQUksS0FBSUEsQ0FBRSxFQUFDO0VBQ3BDLENBQUMsQ0FBQyxDQUNEclIsSUFBSSxDQUFDLEVBQUUsQ0FBQztBQUNiO0FBRUEsU0FBUzhZLG1CQUFtQixDQUFDRixDQUFTLEVBQUU7RUFDdEMsTUFBTVMsUUFBUSxHQUFHLG9CQUFvQjtFQUNyQyxNQUFNQyxPQUFZLEdBQUdWLENBQUMsQ0FBQ3BYLEtBQUssQ0FBQzZYLFFBQVEsQ0FBQztFQUN0QyxJQUFJQyxPQUFPLElBQUlBLE9BQU8sQ0FBQ3RlLE1BQU0sR0FBRyxDQUFDLElBQUlzZSxPQUFPLENBQUN4WixLQUFLLEdBQUcsQ0FBQyxDQUFDLEVBQUU7SUFDdkQ7SUFDQSxNQUFNeVosTUFBTSxHQUFHWCxDQUFDLENBQUMxWSxTQUFTLENBQUMsQ0FBQyxFQUFFb1osT0FBTyxDQUFDeFosS0FBSyxDQUFDO0lBQzVDLE1BQU1xWixTQUFTLEdBQUdHLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFFNUIsT0FBT1IsbUJBQW1CLENBQUNTLE1BQU0sQ0FBQyxHQUFHTCxrQkFBa0IsQ0FBQ0MsU0FBUyxDQUFDO0VBQ3BFOztFQUVBO0VBQ0EsTUFBTUssUUFBUSxHQUFHLGlCQUFpQjtFQUNsQyxNQUFNQyxPQUFZLEdBQUdiLENBQUMsQ0FBQ3BYLEtBQUssQ0FBQ2dZLFFBQVEsQ0FBQztFQUN0QyxJQUFJQyxPQUFPLElBQUlBLE9BQU8sQ0FBQ3plLE1BQU0sR0FBRyxDQUFDLElBQUl5ZSxPQUFPLENBQUMzWixLQUFLLEdBQUcsQ0FBQyxDQUFDLEVBQUU7SUFDdkQsTUFBTXlaLE1BQU0sR0FBR1gsQ0FBQyxDQUFDMVksU0FBUyxDQUFDLENBQUMsRUFBRXVaLE9BQU8sQ0FBQzNaLEtBQUssQ0FBQztJQUM1QyxNQUFNcVosU0FBUyxHQUFHTSxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBRTVCLE9BQU9YLG1CQUFtQixDQUFDUyxNQUFNLENBQUMsR0FBR0wsa0JBQWtCLENBQUNDLFNBQVMsQ0FBQztFQUNwRTs7RUFFQTtFQUNBLE9BQU9QLENBQUMsQ0FDTEQsT0FBTyxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FDN0JBLE9BQU8sQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQzdCQSxPQUFPLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUNuQkEsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FDbkJBLE9BQU8sQ0FBQyxTQUFTLEVBQUcsTUFBSyxDQUFDLENBQzFCQSxPQUFPLENBQUMsVUFBVSxFQUFHLE1BQUssQ0FBQztBQUNoQztBQUVBLElBQUlwVCxhQUFhLEdBQUc7RUFDbEJDLFdBQVcsQ0FBQzVJLEtBQUssRUFBRTtJQUNqQixPQUFPLE9BQU9BLEtBQUssS0FBSyxRQUFRLElBQUlBLEtBQUssS0FBSyxJQUFJLElBQUlBLEtBQUssQ0FBQ0MsTUFBTSxLQUFLLFVBQVU7RUFDbkY7QUFDRixDQUFDO0FBQUMsZUFFYW9LLHNCQUFzQjtBQUFBIn0=