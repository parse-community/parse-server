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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJVdGlscyIsInJlcXVpcmUiLCJQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IiLCJQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IiLCJQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yIiwiUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IiLCJQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IiLCJsb2dnZXIiLCJkZWJ1ZyIsImFyZ3MiLCJhcmd1bWVudHMiLCJjb25jYXQiLCJzbGljZSIsImxlbmd0aCIsImxvZyIsImdldExvZ2dlciIsImFwcGx5IiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwidmFsdWUiLCJfX3R5cGUiLCJpc28iLCJuYW1lIiwidG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUiLCJwb3N0Z3Jlc1ZhbHVlIiwiY2FzdFR5cGUiLCJ1bmRlZmluZWQiLCJ0cmFuc2Zvcm1WYWx1ZSIsIm9iamVjdElkIiwiZW1wdHlDTFBTIiwiT2JqZWN0IiwiZnJlZXplIiwiZmluZCIsImdldCIsImNvdW50IiwiY3JlYXRlIiwidXBkYXRlIiwiZGVsZXRlIiwiYWRkRmllbGQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJkZWZhdWx0Q0xQUyIsInRvUGFyc2VTY2hlbWEiLCJzY2hlbWEiLCJjbGFzc05hbWUiLCJmaWVsZHMiLCJfaGFzaGVkX3Bhc3N3b3JkIiwiX3dwZXJtIiwiX3JwZXJtIiwiY2xwcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImluZGV4ZXMiLCJ0b1Bvc3RncmVzU2NoZW1hIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJoYW5kbGVEb3RGaWVsZHMiLCJvYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImZpZWxkTmFtZSIsImluZGV4T2YiLCJjb21wb25lbnRzIiwic3BsaXQiLCJmaXJzdCIsInNoaWZ0IiwiY3VycmVudE9iaiIsIm5leHQiLCJfX29wIiwidHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMiLCJtYXAiLCJjbXB0IiwiaW5kZXgiLCJ0cmFuc2Zvcm1Eb3RGaWVsZCIsImpvaW4iLCJ0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCIsInN1YnN0cmluZyIsInZhbGlkYXRlS2V5cyIsImtleSIsImluY2x1ZGVzIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfTkVTVEVEX0tFWSIsImpvaW5UYWJsZXNGb3JTY2hlbWEiLCJsaXN0IiwiZmllbGQiLCJwdXNoIiwiYnVpbGRXaGVyZUNsYXVzZSIsInF1ZXJ5IiwiY2FzZUluc2Vuc2l0aXZlIiwicGF0dGVybnMiLCJ2YWx1ZXMiLCJzb3J0cyIsImlzQXJyYXlGaWVsZCIsImluaXRpYWxQYXR0ZXJuc0xlbmd0aCIsImZpZWxkVmFsdWUiLCIkZXhpc3RzIiwiYXV0aERhdGFNYXRjaCIsIm1hdGNoIiwiJGluIiwiJHJlZ2V4IiwiTUFYX0lOVF9QTFVTX09ORSIsImNsYXVzZXMiLCJjbGF1c2VWYWx1ZXMiLCJzdWJRdWVyeSIsImNsYXVzZSIsInBhdHRlcm4iLCJvck9yQW5kIiwibm90IiwiJG5lIiwiY29uc3RyYWludEZpZWxkTmFtZSIsIiRyZWxhdGl2ZVRpbWUiLCJJTlZBTElEX0pTT04iLCJwb2ludCIsImxvbmdpdHVkZSIsImxhdGl0dWRlIiwiJGVxIiwiaXNJbk9yTmluIiwiQXJyYXkiLCJpc0FycmF5IiwiJG5pbiIsImluUGF0dGVybnMiLCJhbGxvd051bGwiLCJsaXN0RWxlbSIsImxpc3RJbmRleCIsImNyZWF0ZUNvbnN0cmFpbnQiLCJiYXNlQXJyYXkiLCJub3RJbiIsIl8iLCJmbGF0TWFwIiwiZWx0IiwiJGFsbCIsImlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgiLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwiaSIsInByb2Nlc3NSZWdleFBhdHRlcm4iLCIkY29udGFpbmVkQnkiLCJhcnIiLCIkdGV4dCIsInNlYXJjaCIsIiRzZWFyY2giLCJsYW5ndWFnZSIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwiJG5lYXJTcGhlcmUiLCJkaXN0YW5jZSIsIiRtYXhEaXN0YW5jZSIsImRpc3RhbmNlSW5LTSIsIiR3aXRoaW4iLCIkYm94IiwiYm94IiwibGVmdCIsImJvdHRvbSIsInJpZ2h0IiwidG9wIiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJjZW50ZXJTcGhlcmUiLCJHZW9Qb2ludCIsIkdlb1BvaW50Q29kZXIiLCJpc1ZhbGlkSlNPTiIsIl92YWxpZGF0ZSIsImlzTmFOIiwiJHBvbHlnb24iLCJwb2x5Z29uIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCIkZ2VvSW50ZXJzZWN0cyIsIiRwb2ludCIsInJlZ2V4Iiwib3BlcmF0b3IiLCJvcHRzIiwiJG9wdGlvbnMiLCJyZW1vdmVXaGl0ZVNwYWNlIiwiY29udmVydFBvbHlnb25Ub1NRTCIsImNtcCIsInBnQ29tcGFyYXRvciIsInBhcnNlclJlc3VsdCIsInJlbGF0aXZlVGltZVRvRGF0ZSIsInN0YXR1cyIsInJlc3VsdCIsImNvbnNvbGUiLCJlcnJvciIsImluZm8iLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIm9wdGlvbnMiLCJfY29sbGVjdGlvblByZWZpeCIsImVuYWJsZVNjaGVtYUhvb2tzIiwic2NoZW1hQ2FjaGVUdGwiLCJkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24iLCJjbGllbnQiLCJwZ3AiLCJjcmVhdGVDbGllbnQiLCJfY2xpZW50IiwiX29uY2hhbmdlIiwiX3BncCIsIl91dWlkIiwidXVpZHY0IiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIndhdGNoIiwiY2FsbGJhY2siLCJjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5IiwiYW5hbHl6ZSIsImhhbmRsZVNodXRkb3duIiwiX3N0cmVhbSIsImRvbmUiLCIkcG9vbCIsImVuZCIsIl9saXN0ZW5Ub1NjaGVtYSIsImNvbm5lY3QiLCJkaXJlY3QiLCJvbiIsImRhdGEiLCJwYXlsb2FkIiwicGFyc2UiLCJzZW5kZXJJZCIsIm5vbmUiLCJfbm90aWZ5U2NoZW1hQ2hhbmdlIiwiY2F0Y2giLCJfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyIsImNvbm4iLCJjbGFzc0V4aXN0cyIsIm9uZSIsImEiLCJleGlzdHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwidGFzayIsInQiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJzZWxmIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfaWRfIiwiX2lkIiwiZGVsZXRlZEluZGV4ZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJJTlZBTElEX1FVRVJZIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidHgiLCJjcmVhdGVJbmRleGVzIiwiZSIsImNvbHVtbkRvZXNOb3RFeGlzdEVycm9yIiwiZXJyb3JzIiwiY29kZSIsImRyb3BJbmRleGVzIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsImNyZWF0ZVRhYmxlIiwiZXJyIiwiZGV0YWlsIiwiRFVQTElDQVRFX1ZBTFVFIiwidmFsdWVzQXJyYXkiLCJwYXR0ZXJuc0FycmF5IiwiYXNzaWduIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsInJlbGF0aW9ucyIsInBhcnNlVHlwZSIsInFzIiwiYmF0Y2giLCJqb2luVGFibGUiLCJzY2hlbWFVcGdyYWRlIiwiY29sdW1ucyIsImNvbHVtbl9uYW1lIiwibmV3Q29sdW1ucyIsImZpbHRlciIsIml0ZW0iLCJhZGRGaWVsZElmTm90RXhpc3RzIiwicG9zdGdyZXNUeXBlIiwiYW55IiwicGF0aCIsInVwZGF0ZUZpZWxkT3B0aW9ucyIsImRlbGV0ZUNsYXNzIiwib3BlcmF0aW9ucyIsInJlc3BvbnNlIiwiaGVscGVycyIsInRoZW4iLCJkZWxldGVBbGxDbGFzc2VzIiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJlbmRlZCIsInJlc3VsdHMiLCJqb2lucyIsInJlZHVjZSIsImNsYXNzZXMiLCJxdWVyaWVzIiwiZGVsZXRlRmllbGRzIiwiZmllbGROYW1lcyIsImlkeCIsImdldEFsbENsYXNzZXMiLCJyb3ciLCJnZXRDbGFzcyIsImNyZWF0ZU9iamVjdCIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29sdW1uc0FycmF5IiwiZ2VvUG9pbnRzIiwiYXV0aERhdGFBbHJlYWR5RXhpc3RzIiwiYXV0aERhdGEiLCJwcm92aWRlciIsInBvcCIsImluaXRpYWxWYWx1ZXMiLCJ2YWwiLCJ0ZXJtaW5hdGlvbiIsImdlb1BvaW50c0luamVjdHMiLCJsIiwiY29sdW1uc1BhdHRlcm4iLCJjb2wiLCJ2YWx1ZXNQYXR0ZXJuIiwicHJvbWlzZSIsIm9wcyIsInVuZGVybHlpbmdFcnJvciIsImNvbnN0cmFpbnQiLCJtYXRjaGVzIiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ3aGVyZSIsIk9CSkVDVF9OT1RfRk9VTkQiLCJmaW5kT25lQW5kVXBkYXRlIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGVQYXR0ZXJucyIsIm9yaWdpbmFsVXBkYXRlIiwiZG90Tm90YXRpb25PcHRpb25zIiwiZ2VuZXJhdGUiLCJqc29uYiIsImxhc3RLZXkiLCJmaWVsZE5hbWVJbmRleCIsInN0ciIsImFtb3VudCIsIm9iamVjdHMiLCJrZXlzVG9JbmNyZW1lbnQiLCJrIiwiaW5jcmVtZW50UGF0dGVybnMiLCJjIiwia2V5c1RvRGVsZXRlIiwiZGVsZXRlUGF0dGVybnMiLCJwIiwidXBkYXRlT2JqZWN0IiwiZXhwZWN0ZWRUeXBlIiwicmVqZWN0Iiwid2hlcmVDbGF1c2UiLCJ1cHNlcnRPbmVPYmplY3QiLCJjcmVhdGVWYWx1ZSIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJleHBsYWluIiwiaGFzTGltaXQiLCJoYXNTa2lwIiwid2hlcmVQYXR0ZXJuIiwibGltaXRQYXR0ZXJuIiwic2tpcFBhdHRlcm4iLCJzb3J0UGF0dGVybiIsInNvcnRDb3B5Iiwic29ydGluZyIsInRyYW5zZm9ybUtleSIsIm1lbW8iLCJvcmlnaW5hbFF1ZXJ5IiwicG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0IiwidGFyZ2V0Q2xhc3MiLCJ5IiwieCIsImNvb3JkcyIsIlN0cmluZyIsInVwZGF0ZWRDb29yZHMiLCJwYXJzZUZsb2F0IiwiY3JlYXRlZEF0IiwidG9JU09TdHJpbmciLCJ1cGRhdGVkQXQiLCJleHBpcmVzQXQiLCJlbnN1cmVVbmlxdWVuZXNzIiwiY29uc3RyYWludE5hbWUiLCJjb25zdHJhaW50UGF0dGVybnMiLCJtZXNzYWdlIiwicmVhZFByZWZlcmVuY2UiLCJlc3RpbWF0ZSIsImFwcHJveGltYXRlX3Jvd19jb3VudCIsImRpc3RpbmN0IiwiY29sdW1uIiwiaXNOZXN0ZWQiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybWVyIiwiY2hpbGQiLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsImhpbnQiLCJjb3VudEZpZWxkIiwiZ3JvdXBWYWx1ZXMiLCJncm91cFBhdHRlcm4iLCJzdGFnZSIsIiRncm91cCIsImdyb3VwQnlGaWVsZHMiLCJhbGlhcyIsInNvdXJjZSIsIm9wZXJhdGlvbiIsIiRzdW0iLCIkbWF4IiwiJG1pbiIsIiRhdmciLCIkcHJvamVjdCIsIiRtYXRjaCIsIiRvciIsImNvbGxhcHNlIiwiZWxlbWVudCIsIm1hdGNoUGF0dGVybnMiLCIkbGltaXQiLCIkc2tpcCIsIiRzb3J0Iiwib3JkZXIiLCJ0cmltIiwiQm9vbGVhbiIsInBhcnNlSW50IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInByb21pc2VzIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiYWxsIiwic3FsIiwibWlzYyIsImpzb25PYmplY3RTZXRLZXlzIiwiYXJyYXkiLCJhZGQiLCJhZGRVbmlxdWUiLCJyZW1vdmUiLCJjb250YWluc0FsbCIsImNvbnRhaW5zQWxsUmVnZXgiLCJjb250YWlucyIsImN0eCIsImR1cmF0aW9uIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZ2V0SW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwidXBkYXRlRXN0aW1hdGVkQ291bnQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiZGVmYXVsdEluZGV4TmFtZSIsImluZGV4TmFtZU9wdGlvbnMiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwiZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyIsImRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24iLCJ0dGxPcHRpb25zIiwidHRsIiwidW5pcXVlIiwiYXIiLCJmb3VuZEluZGV4IiwicHQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlbmRzV2l0aCIsInJlcGxhY2UiLCJzIiwic3RhcnRzV2l0aCIsImxpdGVyYWxpemVSZWdleFBhcnQiLCJpc1N0YXJ0c1dpdGhSZWdleCIsImZpcnN0VmFsdWVzSXNSZWdleCIsInNvbWUiLCJjcmVhdGVMaXRlcmFsUmVnZXgiLCJyZW1haW5pbmciLCJSZWdFeHAiLCJtYXRjaGVyMSIsInJlc3VsdDEiLCJwcmVmaXgiLCJtYXRjaGVyMiIsInJlc3VsdDIiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICcuL1Bvc3RncmVzQ2xpZW50Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCBzcWwgZnJvbSAnLi9zcWwnO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi8uLi8uLi9VdGlscycpO1xuXG5jb25zdCBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IgPSAnNDJQMDEnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yID0gJzQyUDA3JztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IgPSAnNDI3MDEnO1xuY29uc3QgUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IgPSAnNDI3MDMnO1xuY29uc3QgUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yID0gJzIzNTA1JztcbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uLy4uLy4uL2xvZ2dlcicpO1xuXG5jb25zdCBkZWJ1ZyA9IGZ1bmN0aW9uICguLi5hcmdzOiBhbnkpIHtcbiAgYXJncyA9IFsnUEc6ICcgKyBhcmd1bWVudHNbMF1dLmNvbmNhdChhcmdzLnNsaWNlKDEsIGFyZ3MubGVuZ3RoKSk7XG4gIGNvbnN0IGxvZyA9IGxvZ2dlci5nZXRMb2dnZXIoKTtcbiAgbG9nLmRlYnVnLmFwcGx5KGxvZywgYXJncyk7XG59O1xuXG5jb25zdCBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSA9IHR5cGUgPT4ge1xuICBzd2l0Y2ggKHR5cGUudHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ3BvaW50JztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgaWYgKHR5cGUuY29udGVudHMgJiYgdHlwZS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJykge1xuICAgICAgICByZXR1cm4gJ3RleHRbXSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ2pzb25iJztcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgYG5vIHR5cGUgZm9yICR7SlNPTi5zdHJpbmdpZnkodHlwZSl9IHlldGA7XG4gIH1cbn07XG5cbmNvbnN0IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciA9IHtcbiAgJGd0OiAnPicsXG4gICRsdDogJzwnLFxuICAkZ3RlOiAnPj0nLFxuICAkbHRlOiAnPD0nLFxufTtcblxuY29uc3QgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzID0ge1xuICAkZGF5T2ZNb250aDogJ0RBWScsXG4gICRkYXlPZldlZWs6ICdET1cnLFxuICAkZGF5T2ZZZWFyOiAnRE9ZJyxcbiAgJGlzb0RheU9mV2VlazogJ0lTT0RPVycsXG4gICRpc29XZWVrWWVhcjogJ0lTT1lFQVInLFxuICAkaG91cjogJ0hPVVInLFxuICAkbWludXRlOiAnTUlOVVRFJyxcbiAgJHNlY29uZDogJ1NFQ09ORCcsXG4gICRtaWxsaXNlY29uZDogJ01JTExJU0VDT05EUycsXG4gICRtb250aDogJ01PTlRIJyxcbiAgJHdlZWs6ICdXRUVLJyxcbiAgJHllYXI6ICdZRUFSJyxcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5pc287XG4gICAgfVxuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlID0gdmFsdWUgPT4ge1xuICBjb25zdCBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlKTtcbiAgbGV0IGNhc3RUeXBlO1xuICBzd2l0Y2ggKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIGNhc3RUeXBlID0gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICBjYXN0VHlwZSA9ICdib29sZWFuJztcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjYXN0VHlwZSA9IHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gY2FzdFR5cGU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuLy8gRHVwbGljYXRlIGZyb20gdGhlbiBtb25nbyBhZGFwdGVyLi4uXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGdldDoge30sXG4gIGNvdW50OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmNvbnN0IHRvUGFyc2VTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cbiAgaWYgKHNjaGVtYS5maWVsZHMpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICB9XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGlmIChzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5zY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH07XG4gIH1cbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKHNjaGVtYS5pbmRleGVzKSB7XG4gICAgaW5kZXhlcyA9IHsgLi4uc2NoZW1hLmluZGV4ZXMgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXMsXG4gIH07XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGhhbmRsZURvdEZpZWxkcyA9IG9iamVjdCA9PiB7XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgb2JqZWN0W2ZpcnN0XSA9IG9iamVjdFtmaXJzdF0gfHwge307XG4gICAgICBsZXQgY3VycmVudE9iaiA9IG9iamVjdFtmaXJzdF07XG4gICAgICBsZXQgbmV4dDtcbiAgICAgIGxldCB2YWx1ZSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHZhbHVlID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgIHdoaWxlICgobmV4dCA9IGNvbXBvbmVudHMuc2hpZnQoKSkpIHtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgICBjdXJyZW50T2JqW25leHRdID0gY3VycmVudE9ialtuZXh0XSB8fCB7fTtcbiAgICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRPYmogPSBjdXJyZW50T2JqW25leHRdO1xuICAgICAgfVxuICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyA9IGZpZWxkTmFtZSA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKS5tYXAoKGNtcHQsIGluZGV4KSA9PiB7XG4gICAgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICByZXR1cm4gYFwiJHtjbXB0fVwiYDtcbiAgICB9XG4gICAgcmV0dXJuIGAnJHtjbXB0fSdgO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgcmV0dXJuIGBcIiR7ZmllbGROYW1lfVwiYDtcbiAgfVxuICBjb25zdCBjb21wb25lbnRzID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKTtcbiAgbGV0IG5hbWUgPSBjb21wb25lbnRzLnNsaWNlKDAsIGNvbXBvbmVudHMubGVuZ3RoIC0gMSkuam9pbignLT4nKTtcbiAgbmFtZSArPSAnLT4+JyArIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIG5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmICh0eXBlb2YgZmllbGROYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBmaWVsZE5hbWU7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfY3JlYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ2NyZWF0ZWRBdCc7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfdXBkYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ3VwZGF0ZWRBdCc7XG4gIH1cbiAgcmV0dXJuIGZpZWxkTmFtZS5zdWJzdHJpbmcoMSk7XG59O1xuXG5jb25zdCB2YWxpZGF0ZUtleXMgPSBvYmplY3QgPT4ge1xuICBpZiAodHlwZW9mIG9iamVjdCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB2YWxpZGF0ZUtleXMob2JqZWN0W2tleV0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoa2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFJldHVybnMgdGhlIGxpc3Qgb2Ygam9pbiB0YWJsZXMgb24gYSBzY2hlbWFcbmNvbnN0IGpvaW5UYWJsZXNGb3JTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGlmIChzY2hlbWEpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChgX0pvaW46JHtmaWVsZH06JHtzY2hlbWEuY2xhc3NOYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBsaXN0O1xufTtcblxuaW50ZXJmYWNlIFdoZXJlQ2xhdXNlIHtcbiAgcGF0dGVybjogc3RyaW5nO1xuICB2YWx1ZXM6IEFycmF5PGFueT47XG4gIHNvcnRzOiBBcnJheTxhbnk+O1xufVxuXG5jb25zdCBidWlsZFdoZXJlQ2xhdXNlID0gKHsgc2NoZW1hLCBxdWVyeSwgaW5kZXgsIGNhc2VJbnNlbnNpdGl2ZSB9KTogV2hlcmVDbGF1c2UgPT4ge1xuICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICBsZXQgdmFsdWVzID0gW107XG4gIGNvbnN0IHNvcnRzID0gW107XG5cbiAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpbml0aWFsUGF0dGVybnNMZW5ndGggPSBwYXR0ZXJucy5sZW5ndGg7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IHF1ZXJ5W2ZpZWxkTmFtZV07XG5cbiAgICAvLyBub3RoaW5nIGluIHRoZSBzY2hlbWEsIGl0J3MgZ29ubmEgYmxvdyB1cFxuICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAvLyBhcyBpdCB3b24ndCBleGlzdFxuICAgICAgaWYgKGZpZWxkVmFsdWUgJiYgZmllbGRWYWx1ZS4kZXhpc3RzID09PSBmYWxzZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAvLyBUT0RPOiBIYW5kbGUgcXVlcnlpbmcgYnkgX2F1dGhfZGF0YV9wcm92aWRlciwgYXV0aERhdGEgaXMgc3RvcmVkIGluIGF1dGhEYXRhIGZpZWxkXG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKGNhc2VJbnNlbnNpdGl2ZSAmJiAoZmllbGROYW1lID09PSAndXNlcm5hbWUnIHx8IGZpZWxkTmFtZSA9PT0gJ2VtYWlsJykpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYExPV0VSKCQke2luZGV4fTpuYW1lKSA9IExPV0VSKCQke2luZGV4ICsgMX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgbGV0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKG5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRpbikge1xuICAgICAgICAgIG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpyYXcpOjpqc29uYiBAPiAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGluKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgICAgIC8vIEhhbmRsZSBsYXRlclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgPSAkJHtpbmRleCArIDF9Ojp0ZXh0YCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCBmaWVsZFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIC8vIENhbid0IGNhc3QgYm9vbGVhbiB0byBkb3VibGUgcHJlY2lzaW9uXG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnTnVtYmVyJykge1xuICAgICAgICAvLyBTaG91bGQgYWx3YXlzIHJldHVybiB6ZXJvIHJlc3VsdHNcbiAgICAgICAgY29uc3QgTUFYX0lOVF9QTFVTX09ORSA9IDkyMjMzNzIwMzY4NTQ3NzU4MDg7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgTUFYX0lOVF9QTFVTX09ORSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgfVxuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKFsnJG9yJywgJyRub3InLCAnJGFuZCddLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgIGNvbnN0IGNsYXVzZXMgPSBbXTtcbiAgICAgIGNvbnN0IGNsYXVzZVZhbHVlcyA9IFtdO1xuICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKHN1YlF1ZXJ5ID0+IHtcbiAgICAgICAgY29uc3QgY2xhdXNlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIHF1ZXJ5OiBzdWJRdWVyeSxcbiAgICAgICAgICBpbmRleCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2xhdXNlLnBhdHRlcm4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsYXVzZXMucHVzaChjbGF1c2UucGF0dGVybik7XG4gICAgICAgICAgY2xhdXNlVmFsdWVzLnB1c2goLi4uY2xhdXNlLnZhbHVlcyk7XG4gICAgICAgICAgaW5kZXggKz0gY2xhdXNlLnZhbHVlcy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvck9yQW5kID0gZmllbGROYW1lID09PSAnJGFuZCcgPyAnIEFORCAnIDogJyBPUiAnO1xuICAgICAgY29uc3Qgbm90ID0gZmllbGROYW1lID09PSAnJG5vcicgPyAnIE5PVCAnIDogJyc7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSgke2NsYXVzZXMuam9pbihvck9yQW5kKX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaCguLi5jbGF1c2VWYWx1ZXMpO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuJG5lID0gSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWUuJG5lXSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYE5PVCBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGlmIG5vdCBudWxsLCB3ZSBuZWVkIHRvIG1hbnVhbGx5IGV4Y2x1ZGUgbnVsbFxuICAgICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSkgT1IgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTClgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kbmUpO1xuICAgICAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gY2FzdFR5cGVcbiAgICAgICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPD4gJCR7aW5kZXggKyAxfSBPUiAke2NvbnN0cmFpbnRGaWVsZE5hbWV9IElTIE5VTEwpYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmUgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJG5lLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVE9ETzogc3VwcG9ydCBhcnJheXNcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRlcSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kZXEgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kZXEpO1xuICAgICAgICAgIGNvbnN0IGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSA9ICQke2luZGV4Kyt9YCk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGVxID09PSAnb2JqZWN0JyAmJiBmaWVsZFZhbHVlLiRlcS4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBpc0luT3JOaW4gPSBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSB8fCBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJG5pbik7XG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgJiZcbiAgICAgIGlzQXJyYXlGaWVsZCAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMudHlwZSA9PT0gJ1N0cmluZydcbiAgICApIHtcbiAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgIGxldCBhbGxvd051bGwgPSBmYWxzZTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBmaWVsZFZhbHVlLiRpbi5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgIGlmIChsaXN0RWxlbSA9PT0gbnVsbCkge1xuICAgICAgICAgIGFsbG93TnVsbCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4IC0gKGFsbG93TnVsbCA/IDEgOiAwKX1gKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoYWxsb3dOdWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06bmFtZSBJUyBOVUxMIE9SICQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICB9IGVsc2UgaWYgKGlzSW5Pck5pbikge1xuICAgICAgdmFyIGNyZWF0ZUNvbnN0cmFpbnQgPSAoYmFzZUFycmF5LCBub3RJbikgPT4ge1xuICAgICAgICBjb25zdCBub3QgPSBub3RJbiA/ICcgTk9UICcgOiAnJztcbiAgICAgICAgaWYgKGJhc2VBcnJheS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9IGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShiYXNlQXJyYXkpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEhhbmRsZSBOZXN0ZWQgRG90IE5vdGF0aW9uIEFib3ZlXG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICBiYXNlQXJyYXkuZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICAgICAgICBpZiAobGlzdEVsZW0gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleH1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke25vdH0gSU4gKCR7aW5QYXR0ZXJucy5qb2luKCl9KWApO1xuICAgICAgICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIW5vdEluKSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgICAgaW5kZXggPSBpbmRleCArIDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGFycmF5XG4gICAgICAgICAgaWYgKG5vdEluKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMScpOyAvLyBSZXR1cm4gYWxsIHZhbHVlc1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMicpOyAvLyBSZXR1cm4gbm8gdmFsdWVzXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJGluLCBlbHQgPT4gZWx0KSxcbiAgICAgICAgICBmYWxzZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5pbikge1xuICAgICAgICBjcmVhdGVDb25zdHJhaW50KFxuICAgICAgICAgIF8uZmxhdE1hcChmaWVsZFZhbHVlLiRuaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRpbiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGluIHZhbHVlJyk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkbmluIHZhbHVlJyk7XG4gICAgfVxuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSAmJiBpc0FycmF5RmllbGQpIHtcbiAgICAgIGlmIChpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgaWYgKCFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgZmllbGRWYWx1ZS4kYWxsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRWYWx1ZS4kYWxsLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKGZpZWxkVmFsdWUuJGFsbFtpXS4kcmVnZXgpO1xuICAgICAgICAgIGZpZWxkVmFsdWUuJGFsbFtpXSA9IHZhbHVlLnN1YnN0cmluZygxKSArICclJztcbiAgICAgICAgfVxuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGxfcmVnZXgoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnNfYWxsKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9Ojpqc29uYilgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS4kYWxsKSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kYWxsLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRhbGxbMF0ub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXhpc3RzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJGV4aXN0cy4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRleGlzdHMpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRjb250YWluZWRCeSkge1xuICAgICAgY29uc3QgYXJyID0gZmllbGRWYWx1ZS4kY29udGFpbmVkQnk7XG4gICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkY29udGFpbmVkQnk6IHNob3VsZCBiZSBhbiBhcnJheWApO1xuICAgICAgfVxuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA8QCAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShhcnIpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHRleHQpIHtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IGZpZWxkVmFsdWUuJHRleHQuJHNlYXJjaDtcbiAgICAgIGxldCBsYW5ndWFnZSA9ICdlbmdsaXNoJztcbiAgICAgIGlmICh0eXBlb2Ygc2VhcmNoICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YCk7XG4gICAgICB9XG4gICAgICBpZiAoIXNlYXJjaC4kdGVybSB8fCB0eXBlb2Ygc2VhcmNoLiR0ZXJtICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRsYW5ndWFnZSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGxhbmd1YWdlKSB7XG4gICAgICAgIGxhbmd1YWdlID0gc2VhcmNoLiRsYW5ndWFnZTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSBub3Qgc3VwcG9ydGVkLCBwbGVhc2UgdXNlICRyZWdleCBvciBjcmVhdGUgYSBzZXBhcmF0ZSBsb3dlciBjYXNlIGNvbHVtbi5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSAtIGZhbHNlIG5vdCBzdXBwb3J0ZWQsIGluc3RhbGwgUG9zdGdyZXMgVW5hY2NlbnQgRXh0ZW5zaW9uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYHRvX3RzdmVjdG9yKCQke2luZGV4fSwgJCR7aW5kZXggKyAxfTpuYW1lKSBAQCB0b190c3F1ZXJ5KCQke2luZGV4ICsgMn0sICQke2luZGV4ICsgM30pYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGxhbmd1YWdlLCBmaWVsZE5hbWUsIGxhbmd1YWdlLCBzZWFyY2guJHRlcm0pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kbmVhclNwaGVyZSkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRuZWFyU3BoZXJlO1xuICAgICAgY29uc3QgZGlzdGFuY2UgPSBmaWVsZFZhbHVlLiRtYXhEaXN0YW5jZTtcbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSA8PSAkJHtpbmRleCArIDN9YFxuICAgICAgKTtcbiAgICAgIHNvcnRzLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIEFTQ2BcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR3aXRoaW4gJiYgZmllbGRWYWx1ZS4kd2l0aGluLiRib3gpIHtcbiAgICAgIGNvbnN0IGJveCA9IGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94O1xuICAgICAgY29uc3QgbGVmdCA9IGJveFswXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCBib3R0b20gPSBib3hbMF0ubGF0aXR1ZGU7XG4gICAgICBjb25zdCByaWdodCA9IGJveFsxXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCB0b3AgPSBib3hbMV0ubGF0aXR1ZGU7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpib3hgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgoJHtsZWZ0fSwgJHtib3R0b219KSwgKCR7cmlnaHR9LCAke3RvcH0pKWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlKSB7XG4gICAgICBjb25zdCBjZW50ZXJTcGhlcmUgPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZTtcbiAgICAgIGlmICghKGNlbnRlclNwaGVyZSBpbnN0YW5jZW9mIEFycmF5KSB8fCBjZW50ZXJTcGhlcmUubGVuZ3RoIDwgMikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQgYW5kIGRpc3RhbmNlJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gR2V0IHBvaW50LCBjb252ZXJ0IHRvIGdlbyBwb2ludCBpZiBuZWNlc3NhcnkgYW5kIHZhbGlkYXRlXG4gICAgICBsZXQgcG9pbnQgPSBjZW50ZXJTcGhlcmVbMF07XG4gICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgIH0gZWxzZSBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGdlbyBwb2ludCBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgLy8gR2V0IGRpc3RhbmNlIGFuZCB2YWxpZGF0ZVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSBjZW50ZXJTcGhlcmVbMV07XG4gICAgICBpZiAoaXNOYU4oZGlzdGFuY2UpIHx8IGRpc3RhbmNlIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBkaXN0YW5jZSBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbikge1xuICAgICAgY29uc3QgcG9seWdvbiA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbjtcbiAgICAgIGxldCBwb2ludHM7XG4gICAgICBpZiAodHlwZW9mIHBvbHlnb24gPT09ICdvYmplY3QnICYmIHBvbHlnb24uX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgaWYgKCFwb2x5Z29uLmNvb3JkaW5hdGVzIHx8IHBvbHlnb24uY29vcmRpbmF0ZXMubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgUG9seWdvbi5jb29yZGluYXRlcyBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIGxvbi9sYXQgcGFpcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uLmNvb3JkaW5hdGVzO1xuICAgICAgfSBlbHNlIGlmIChwb2x5Z29uIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBHZW9Qb2ludHMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBcImJhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgYmUgUG9seWdvbiBvYmplY3Qgb3IgQXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQnc1wiXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwb2ludHMgPSBwb2ludHNcbiAgICAgICAgLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICAgIHJldHVybiBgKCR7cG9pbnRbMF19LCAke3BvaW50WzFdfSlgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGdlb1dpdGhpbiB2YWx1ZScpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oJywgJyk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludHN9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMgJiYgZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQpIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQ7XG4gICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9JbnRlcnNlY3QgdmFsdWU7ICRwb2ludCBzaG91bGQgYmUgR2VvUG9pbnQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9seWdvbiBAPiAkJHtpbmRleCArIDF9Ojpwb2ludGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgbGV0IHJlZ2V4ID0gZmllbGRWYWx1ZS4kcmVnZXg7XG4gICAgICBsZXQgb3BlcmF0b3IgPSAnfic7XG4gICAgICBjb25zdCBvcHRzID0gZmllbGRWYWx1ZS4kb3B0aW9ucztcbiAgICAgIGlmIChvcHRzKSB7XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ2knKSA+PSAwKSB7XG4gICAgICAgICAgb3BlcmF0b3IgPSAnfionO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ3gnKSA+PSAwKSB7XG4gICAgICAgICAgcmVnZXggPSByZW1vdmVXaGl0ZVNwYWNlKHJlZ2V4KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBuYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgIHJlZ2V4ID0gcHJvY2Vzc1JlZ2V4UGF0dGVybihyZWdleCk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgJHtvcGVyYXRvcn0gJyQke2luZGV4ICsgMX06cmF3J2ApO1xuICAgICAgdmFsdWVzLnB1c2gobmFtZSwgcmVnZXgpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZV0pKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5pc28pO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGluZGV4ICs9IDM7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgIGlmIChmaWVsZFZhbHVlW2NtcF0gfHwgZmllbGRWYWx1ZVtjbXBdID09PSAwKSB7XG4gICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICBsZXQgY29uc3RyYWludEZpZWxkTmFtZTtcbiAgICAgICAgbGV0IHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZVtjbXBdKTtcblxuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlW2NtcF0pO1xuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHBvc3RncmVzVmFsdWUgPT09ICdvYmplY3QnICYmIHBvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlICE9PSAnRGF0ZScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggRGF0ZSBmaWVsZCdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHBhcnNlclJlc3VsdCA9IFV0aWxzLnJlbGF0aXZlVGltZVRvRGF0ZShwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWUpO1xuICAgICAgICAgICAgaWYgKHBhcnNlclJlc3VsdC5zdGF0dXMgPT09ICdzdWNjZXNzJykge1xuICAgICAgICAgICAgICBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHBhcnNlclJlc3VsdC5yZXN1bHQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igd2hpbGUgcGFyc2luZyByZWxhdGl2ZSBkYXRlJywgcGFyc2VyUmVzdWx0KTtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICBgYmFkICRyZWxhdGl2ZVRpbWUgKCR7cG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lfSkgdmFsdWUuICR7cGFyc2VyUmVzdWx0LmluZm99YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gYCQke2luZGV4Kyt9Om5hbWVgO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWVzLnB1c2gocG9zdGdyZXNWYWx1ZSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCR7Y29uc3RyYWludEZpZWxkTmFtZX0gJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4Kyt9YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID09PSBwYXR0ZXJucy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB0aGlzIHF1ZXJ5IHR5cGUgeWV0ICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgdmFsdWVzID0gdmFsdWVzLm1hcCh0cmFuc2Zvcm1WYWx1ZSk7XG4gIHJldHVybiB7IHBhdHRlcm46IHBhdHRlcm5zLmpvaW4oJyBBTkQgJyksIHZhbHVlcywgc29ydHMgfTtcbn07XG5cbmV4cG9ydCBjbGFzcyBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICBjYW5Tb3J0T25Kb2luVGFibGVzOiBib29sZWFuO1xuICBlbmFibGVTY2hlbWFIb29rczogYm9vbGVhbjtcblxuICAvLyBQcml2YXRlXG4gIF9jb2xsZWN0aW9uUHJlZml4OiBzdHJpbmc7XG4gIF9jbGllbnQ6IGFueTtcbiAgX29uY2hhbmdlOiBhbnk7XG4gIF9wZ3A6IGFueTtcbiAgX3N0cmVhbTogYW55O1xuICBfdXVpZDogYW55O1xuICBzY2hlbWFDYWNoZVR0bDogP251bWJlcjtcbiAgZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uOiBib29sZWFuO1xuXG4gIGNvbnN0cnVjdG9yKHsgdXJpLCBjb2xsZWN0aW9uUHJlZml4ID0gJycsIGRhdGFiYXNlT3B0aW9ucyA9IHt9IH06IGFueSkge1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7IC4uLmRhdGFiYXNlT3B0aW9ucyB9O1xuICAgIHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggPSBjb2xsZWN0aW9uUHJlZml4O1xuICAgIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MgPSAhIWRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcztcbiAgICB0aGlzLnNjaGVtYUNhY2hlVHRsID0gZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsO1xuICAgIHRoaXMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uID0gISFkYXRhYmFzZU9wdGlvbnMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIFsnZW5hYmxlU2NoZW1hSG9va3MnLCAnc2NoZW1hQ2FjaGVUdGwnLCAnZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uJ10pIHtcbiAgICAgIGRlbGV0ZSBvcHRpb25zW2tleV07XG4gICAgfVxuXG4gICAgY29uc3QgeyBjbGllbnQsIHBncCB9ID0gY3JlYXRlQ2xpZW50KHVyaSwgb3B0aW9ucyk7XG4gICAgdGhpcy5fY2xpZW50ID0gY2xpZW50O1xuICAgIHRoaXMuX29uY2hhbmdlID0gKCkgPT4ge307XG4gICAgdGhpcy5fcGdwID0gcGdwO1xuICAgIHRoaXMuX3V1aWQgPSB1dWlkdjQoKTtcbiAgICB0aGlzLmNhblNvcnRPbkpvaW5UYWJsZXMgPSBmYWxzZTtcbiAgfVxuXG4gIHdhdGNoKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSBjYWxsYmFjaztcbiAgfVxuXG4gIC8vTm90ZSB0aGF0IGFuYWx5emU9dHJ1ZSB3aWxsIHJ1biB0aGUgcXVlcnksIGV4ZWN1dGluZyBJTlNFUlRTLCBERUxFVEVTLCBldGMuXG4gIGNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkocXVlcnk6IHN0cmluZywgYW5hbHl6ZTogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgaWYgKGFuYWx5emUpIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoQU5BTFlaRSwgRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuICdFWFBMQUlOIChGT1JNQVQgSlNPTikgJyArIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGlmICh0aGlzLl9zdHJlYW0pIHtcbiAgICAgIHRoaXMuX3N0cmVhbS5kb25lKCk7XG4gICAgICBkZWxldGUgdGhpcy5fc3RyZWFtO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuX2NsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLl9jbGllbnQuJHBvb2wuZW5kKCk7XG4gIH1cblxuICBhc3luYyBfbGlzdGVuVG9TY2hlbWEoKSB7XG4gICAgaWYgKCF0aGlzLl9zdHJlYW0gJiYgdGhpcy5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgdGhpcy5fc3RyZWFtID0gYXdhaXQgdGhpcy5fY2xpZW50LmNvbm5lY3QoeyBkaXJlY3Q6IHRydWUgfSk7XG4gICAgICB0aGlzLl9zdHJlYW0uY2xpZW50Lm9uKCdub3RpZmljYXRpb24nLCBkYXRhID0+IHtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoZGF0YS5wYXlsb2FkKTtcbiAgICAgICAgaWYgKHBheWxvYWQuc2VuZGVySWQgIT09IHRoaXMuX3V1aWQpIHtcbiAgICAgICAgICB0aGlzLl9vbmNoYW5nZSgpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHRoaXMuX3N0cmVhbS5ub25lKCdMSVNURU4gJDF+JywgJ3NjaGVtYS5jaGFuZ2UnKTtcbiAgICB9XG4gIH1cblxuICBfbm90aWZ5U2NoZW1hQ2hhbmdlKCkge1xuICAgIGlmICh0aGlzLl9zdHJlYW0pIHtcbiAgICAgIHRoaXMuX3N0cmVhbVxuICAgICAgICAubm9uZSgnTk9USUZZICQxfiwgJDInLCBbJ3NjaGVtYS5jaGFuZ2UnLCB7IHNlbmRlcklkOiB0aGlzLl91dWlkIH1dKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gTm90aWZ5OicsIGVycm9yKTsgLy8gdW5saWtlbHkgdG8gZXZlciBoYXBwZW5cbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMoY29ubjogYW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGF3YWl0IGNvbm5cbiAgICAgIC5ub25lKFxuICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgXCJfU0NIRU1BXCIgKCBcImNsYXNzTmFtZVwiIHZhckNoYXIoMTIwKSwgXCJzY2hlbWFcIiBqc29uYiwgXCJpc1BhcnNlQ2xhc3NcIiBib29sLCBQUklNQVJZIEtFWSAoXCJjbGFzc05hbWVcIikgKSdcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjbGFzc0V4aXN0cyhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50Lm9uZShcbiAgICAgICdTRUxFQ1QgRVhJU1RTIChTRUxFQ1QgMSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXMgV0hFUkUgdGFibGVfbmFtZSA9ICQxKScsXG4gICAgICBbbmFtZV0sXG4gICAgICBhID0+IGEuZXhpc3RzXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgQ0xQczogYW55KSB7XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnRhc2soJ3NldC1jbGFzcy1sZXZlbC1wZXJtaXNzaW9ucycsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgJ3NjaGVtYScsICdjbGFzc0xldmVsUGVybWlzc2lvbnMnLCBKU09OLnN0cmluZ2lmeShDTFBzKV07XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgIGBVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlc1xuICAgICAgKTtcbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIHNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEluZGV4ZXM6IGFueSxcbiAgICBleGlzdGluZ0luZGV4ZXM6IGFueSA9IHt9LFxuICAgIGZpZWxkczogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGlmIChzdWJtaXR0ZWRJbmRleGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nSW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgICBleGlzdGluZ0luZGV4ZXMgPSB7IF9pZF86IHsgX2lkOiAxIH0gfTtcbiAgICB9XG4gICAgY29uc3QgZGVsZXRlZEluZGV4ZXMgPSBbXTtcbiAgICBjb25zdCBpbnNlcnRlZEluZGV4ZXMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRJbmRleGVzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRJbmRleGVzW25hbWVdO1xuICAgICAgaWYgKGV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgYEluZGV4ICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmApO1xuICAgICAgfVxuICAgICAgaWYgKCFleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIGRlbGV0ZWRJbmRleGVzLnB1c2gobmFtZSk7XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0luZGV4ZXNbbmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3Qua2V5cyhmaWVsZCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICF0aGlzLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbiAmJlxuICAgICAgICAgICAgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGtleSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCBjb25uLnR4KCdzZXQtaW5kZXhlcy13aXRoLXNjaGVtYS1mb3JtYXQnLCBhc3luYyB0ID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmIChpbnNlcnRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGF3YWl0IHNlbGYuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcywgdCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc3QgY29sdW1uRG9lc05vdEV4aXN0RXJyb3IgPSBlLmVycm9ycz8uWzBdPy5jb2RlID09PSAnNDI3MDMnO1xuICAgICAgICBpZiAoY29sdW1uRG9lc05vdEV4aXN0RXJyb3IgJiYgIXRoaXMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uKSB7XG4gICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGRlbGV0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgYXdhaXQgc2VsZi5kcm9wSW5kZXhlcyhjbGFzc05hbWUsIGRlbGV0ZWRJbmRleGVzLCB0KTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgJDI6bmFtZSA9IGpzb25fb2JqZWN0X3NldF9rZXkoJDI6bmFtZSwgJDM6OnRleHQsICQ0Ojpqc29uYikgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxJyxcbiAgICAgICAgW2NsYXNzTmFtZSwgJ3NjaGVtYScsICdpbmRleGVzJywgSlNPTi5zdHJpbmdpZnkoZXhpc3RpbmdJbmRleGVzKV1cbiAgICAgICk7XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiA/YW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gYXdhaXQgY29ublxuICAgICAgLnR4KCdjcmVhdGUtY2xhc3MnLCBhc3luYyB0ID0+IHtcbiAgICAgICAgYXdhaXQgdGhpcy5jcmVhdGVUYWJsZShjbGFzc05hbWUsIHNjaGVtYSwgdCk7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnSU5TRVJUIElOVE8gXCJfU0NIRU1BXCIgKFwiY2xhc3NOYW1lXCIsIFwic2NoZW1hXCIsIFwiaXNQYXJzZUNsYXNzXCIpIFZBTFVFUyAoJDxjbGFzc05hbWU+LCAkPHNjaGVtYT4sIHRydWUpJyxcbiAgICAgICAgICB7IGNsYXNzTmFtZSwgc2NoZW1hIH1cbiAgICAgICAgKTtcbiAgICAgICAgYXdhaXQgdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChjbGFzc05hbWUsIHNjaGVtYS5pbmRleGVzLCB7fSwgc2NoZW1hLmZpZWxkcywgdCk7XG4gICAgICAgIHJldHVybiB0b1BhcnNlU2NoZW1hKHNjaGVtYSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yICYmIGVyci5kZXRhaWwuaW5jbHVkZXMoY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gICAgcmV0dXJuIHBhcnNlU2NoZW1hO1xuICB9XG5cbiAgLy8gSnVzdCBjcmVhdGUgYSB0YWJsZSwgZG8gbm90IGluc2VydCBpbiBzY2hlbWFcbiAgYXN5bmMgY3JlYXRlVGFibGUoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogYW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGRlYnVnKCdjcmVhdGVUYWJsZScpO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgY29uc3QgcGF0dGVybnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5hc3NpZ24oe30sIHNjaGVtYS5maWVsZHMpO1xuICAgIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIGZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fZmFpbGVkX2xvZ2luX2NvdW50ID0geyB0eXBlOiAnTnVtYmVyJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fcGFzc3dvcmRfaGlzdG9yeSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICAgIH1cbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIGNvbnN0IHJlbGF0aW9ucyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKGZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgY29uc3QgcGFyc2VUeXBlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAvLyBTa2lwIHdoZW4gaXQncyBhIHJlbGF0aW9uXG4gICAgICAvLyBXZSdsbCBjcmVhdGUgdGhlIHRhYmxlcyBsYXRlclxuICAgICAgaWYgKHBhcnNlVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJlbGF0aW9ucy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICBwYXJzZVR5cGUuY29udGVudHMgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICB9XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHBhcnNlVHlwZSkpO1xuICAgICAgcGF0dGVybnNBcnJheS5wdXNoKGAkJHtpbmRleH06bmFtZSAkJHtpbmRleCArIDF9OnJhd2ApO1xuICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYFBSSU1BUlkgS0VZICgkJHtpbmRleH06bmFtZSlgKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ID0gaW5kZXggKyAyO1xuICAgIH0pO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQxOm5hbWUgKCR7cGF0dGVybnNBcnJheS5qb2luKCl9KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4udmFsdWVzQXJyYXldO1xuXG4gICAgcmV0dXJuIGNvbm4udGFzaygnY3JlYXRlLXRhYmxlJywgYXN5bmMgdCA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0Lm5vbmUocXMsIHZhbHVlcyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogVGFibGUgYWxyZWFkeSBleGlzdHMsIG11c3QgaGF2ZSBiZWVuIGNyZWF0ZWQgYnkgYSBkaWZmZXJlbnQgcmVxdWVzdC4gSWdub3JlIHRoZSBlcnJvci5cbiAgICAgIH1cbiAgICAgIGF3YWl0IHQudHgoJ2NyZWF0ZS10YWJsZS10eCcsIHR4ID0+IHtcbiAgICAgICAgcmV0dXJuIHR4LmJhdGNoKFxuICAgICAgICAgIHJlbGF0aW9ucy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHJldHVybiB0eC5ub25lKFxuICAgICAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgc2NoZW1hVXBncmFkZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBkZWJ1Zygnc2NoZW1hVXBncmFkZScpO1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIGF3YWl0IGNvbm4udGFzaygnc2NoZW1hLXVwZ3JhZGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IGNvbHVtbnMgPSBhd2FpdCB0Lm1hcChcbiAgICAgICAgJ1NFTEVDVCBjb2x1bW5fbmFtZSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zIFdIRVJFIHRhYmxlX25hbWUgPSAkPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IGNsYXNzTmFtZSB9LFxuICAgICAgICBhID0+IGEuY29sdW1uX25hbWVcbiAgICAgICk7XG4gICAgICBjb25zdCBuZXdDb2x1bW5zID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGNvbHVtbnMuaW5kZXhPZihpdGVtKSA9PT0gLTEpXG4gICAgICAgIC5tYXAoZmllbGROYW1lID0+IHNlbGYuYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSk7XG5cbiAgICAgIGF3YWl0IHQuYmF0Y2gobmV3Q29sdW1ucyk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBhZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgLy8gVE9ETzogTXVzdCBiZSByZXZpc2VkIGZvciBpbnZhbGlkIGxvZ2ljLi4uXG4gICAgZGVidWcoJ2FkZEZpZWxkSWZOb3RFeGlzdHMnKTtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ2FkZC1maWVsZC1pZi1ub3QtZXhpc3RzJywgYXN5bmMgdCA9PiB7XG4gICAgICBpZiAodHlwZS50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICAgJ0FMVEVSIFRBQkxFICQ8Y2xhc3NOYW1lOm5hbWU+IEFERCBDT0xVTU4gSUYgTk9UIEVYSVNUUyAkPGZpZWxkTmFtZTpuYW1lPiAkPHBvc3RncmVzVHlwZTpyYXc+JyxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgICAgIHBvc3RncmVzVHlwZTogcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUodHlwZSksXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gc2VsZi5jcmVhdGVDbGFzcyhjbGFzc05hbWUsIHsgZmllbGRzOiB7IFtmaWVsZE5hbWVdOiB0eXBlIH0gfSwgdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gQ29sdW1uIGFscmVhZHkgZXhpc3RzLCBjcmVhdGVkIGJ5IG90aGVyIHJlcXVlc3QuIENhcnJ5IG9uIHRvIHNlZSBpZiBpdCdzIHRoZSByaWdodCB0eXBlLlxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQ8am9pblRhYmxlOm5hbWU+IChcInJlbGF0ZWRJZFwiIHZhckNoYXIoMTIwKSwgXCJvd25pbmdJZFwiIHZhckNoYXIoMTIwKSwgUFJJTUFSWSBLRVkoXCJyZWxhdGVkSWRcIiwgXCJvd25pbmdJZFwiKSApJyxcbiAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdC5hbnkoXG4gICAgICAgICdTRUxFQ1QgXCJzY2hlbWFcIiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4gYW5kIChcInNjaGVtYVwiOjpqc29uLT5cXCdmaWVsZHNcXCctPiQ8ZmllbGROYW1lPikgaXMgbm90IG51bGwnLFxuICAgICAgICB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH1cbiAgICAgICk7XG5cbiAgICAgIGlmIChyZXN1bHRbMF0pIHtcbiAgICAgICAgdGhyb3cgJ0F0dGVtcHRlZCB0byBhZGQgYSBmaWVsZCB0aGF0IGFscmVhZHkgZXhpc3RzJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBge2ZpZWxkcywke2ZpZWxkTmFtZX19YDtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCI9anNvbmJfc2V0KFwic2NoZW1hXCIsICQ8cGF0aD4sICQ8dHlwZT4pICBXSEVSRSBcImNsYXNzTmFtZVwiPSQ8Y2xhc3NOYW1lPicsXG4gICAgICAgICAgeyBwYXRoLCB0eXBlLCBjbGFzc05hbWUgfVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCd1cGRhdGUtc2NoZW1hLWZpZWxkLW9wdGlvbnMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IHBhdGggPSBge2ZpZWxkcywke2ZpZWxkTmFtZX19YDtcbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIj1qc29uYl9zZXQoXCJzY2hlbWFcIiwgJDxwYXRoPiwgJDx0eXBlPikgIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDxjbGFzc05hbWU+JyxcbiAgICAgICAgeyBwYXRoLCB0eXBlLCBjbGFzc05hbWUgfVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIERyb3BzIGEgY29sbGVjdGlvbi4gUmVzb2x2ZXMgd2l0aCB0cnVlIGlmIGl0IHdhcyBhIFBhcnNlIFNjaGVtYSAoZWcuIF9Vc2VyLCBDdXN0b20sIGV0Yy4pXG4gIC8vIGFuZCByZXNvbHZlcyB3aXRoIGZhbHNlIGlmIGl0IHdhc24ndCAoZWcuIGEgam9pbiB0YWJsZSkuIFJlamVjdHMgaWYgZGVsZXRpb24gd2FzIGltcG9zc2libGUuXG4gIGFzeW5jIGRlbGV0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgb3BlcmF0aW9ucyA9IFtcbiAgICAgIHsgcXVlcnk6IGBEUk9QIFRBQkxFIElGIEVYSVNUUyAkMTpuYW1lYCwgdmFsdWVzOiBbY2xhc3NOYW1lXSB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTogYERFTEVURSBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlczogW2NsYXNzTmFtZV0sXG4gICAgICB9LFxuICAgIF07XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl9jbGllbnRcbiAgICAgIC50eCh0ID0+IHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQob3BlcmF0aW9ucykpKVxuICAgICAgLnRoZW4oKCkgPT4gY2xhc3NOYW1lLmluZGV4T2YoJ19Kb2luOicpICE9IDApOyAvLyByZXNvbHZlcyB3aXRoIGZhbHNlIHdoZW4gX0pvaW4gdGFibGVcblxuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuXG4gIC8vIERlbGV0ZSBhbGwgZGF0YSBrbm93biB0byB0aGlzIGFkYXB0ZXIuIFVzZWQgZm9yIHRlc3RpbmcuXG4gIGFzeW5jIGRlbGV0ZUFsbENsYXNzZXMoKSB7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgY29uc3QgaGVscGVycyA9IHRoaXMuX3BncC5oZWxwZXJzO1xuICAgIGRlYnVnKCdkZWxldGVBbGxDbGFzc2VzJyk7XG4gICAgaWYgKHRoaXMuX2NsaWVudD8uJHBvb2wuZW5kZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50XG4gICAgICAudGFzaygnZGVsZXRlLWFsbC1jbGFzc2VzJywgYXN5bmMgdCA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHQuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJyk7XG4gICAgICAgICAgY29uc3Qgam9pbnMgPSByZXN1bHRzLnJlZHVjZSgobGlzdDogQXJyYXk8c3RyaW5nPiwgc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBsaXN0LmNvbmNhdChqb2luVGFibGVzRm9yU2NoZW1hKHNjaGVtYS5zY2hlbWEpKTtcbiAgICAgICAgICB9LCBbXSk7XG4gICAgICAgICAgY29uc3QgY2xhc3NlcyA9IFtcbiAgICAgICAgICAgICdfU0NIRU1BJyxcbiAgICAgICAgICAgICdfUHVzaFN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlNjaGVkdWxlJyxcbiAgICAgICAgICAgICdfSG9va3MnLFxuICAgICAgICAgICAgJ19HbG9iYWxDb25maWcnLFxuICAgICAgICAgICAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgICAgICAgICAgICdfQXVkaWVuY2UnLFxuICAgICAgICAgICAgJ19JZGVtcG90ZW5jeScsXG4gICAgICAgICAgICAuLi5yZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LmNsYXNzTmFtZSksXG4gICAgICAgICAgICAuLi5qb2lucyxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0IHF1ZXJpZXMgPSBjbGFzc2VzLm1hcChjbGFzc05hbWUgPT4gKHtcbiAgICAgICAgICAgIHF1ZXJ5OiAnRFJPUCBUQUJMRSBJRiBFWElTVFMgJDxjbGFzc05hbWU6bmFtZT4nLFxuICAgICAgICAgICAgdmFsdWVzOiB7IGNsYXNzTmFtZSB9LFxuICAgICAgICAgIH0pKTtcbiAgICAgICAgICBhd2FpdCB0LnR4KHR4ID0+IHR4Lm5vbmUoaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gTm8gX1NDSEVNQSBjb2xsZWN0aW9uLiBEb24ndCBkZWxldGUgYW55dGhpbmcuXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGRlYnVnKGBkZWxldGVBbGxDbGFzc2VzIGRvbmUgaW4gJHtuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIG5vd31gKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBjb2x1bW4gYW5kIGFsbCB0aGUgZGF0YS4gRm9yIFJlbGF0aW9ucywgdGhlIF9Kb2luIGNvbGxlY3Rpb24gaXMgaGFuZGxlZFxuICAvLyBzcGVjaWFsbHksIHRoaXMgZnVuY3Rpb24gZG9lcyBub3QgZGVsZXRlIF9Kb2luIGNvbHVtbnMuIEl0IHNob3VsZCwgaG93ZXZlciwgaW5kaWNhdGVcbiAgLy8gdGhhdCB0aGUgcmVsYXRpb24gZmllbGRzIGRvZXMgbm90IGV4aXN0IGFueW1vcmUuIEluIG1vbmdvLCB0aGlzIG1lYW5zIHJlbW92aW5nIGl0IGZyb21cbiAgLy8gdGhlIF9TQ0hFTUEgY29sbGVjdGlvbi4gIFRoZXJlIHNob3VsZCBiZSBubyBhY3R1YWwgZGF0YSBpbiB0aGUgY29sbGVjdGlvbiB1bmRlciB0aGUgc2FtZSBuYW1lXG4gIC8vIGFzIHRoZSByZWxhdGlvbiBjb2x1bW4sIHNvIGl0J3MgZmluZSB0byBhdHRlbXB0IHRvIGRlbGV0ZSBpdC4gSWYgdGhlIGZpZWxkcyBsaXN0ZWQgdG8gYmVcbiAgLy8gZGVsZXRlZCBkbyBub3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gc2hvdWxkIHJldHVybiBzdWNjZXNzZnVsbHkgYW55d2F5cy4gQ2hlY2tpbmcgZm9yXG4gIC8vIGF0dGVtcHRzIHRvIGRlbGV0ZSBub24tZXhpc3RlbnQgZmllbGRzIGlzIHRoZSByZXNwb25zaWJpbGl0eSBvZiBQYXJzZSBTZXJ2ZXIuXG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBub3Qgb2JsaWdhdGVkIHRvIGRlbGV0ZSBmaWVsZHMgYXRvbWljYWxseS4gSXQgaXMgZ2l2ZW4gdGhlIGZpZWxkXG4gIC8vIG5hbWVzIGluIGEgbGlzdCBzbyB0aGF0IGRhdGFiYXNlcyB0aGF0IGFyZSBjYXBhYmxlIG9mIGRlbGV0aW5nIGZpZWxkcyBhdG9taWNhbGx5XG4gIC8vIG1heSBkbyBzby5cblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZS5cbiAgYXN5bmMgZGVsZXRlRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZGVidWcoJ2RlbGV0ZUZpZWxkcycpO1xuICAgIGZpZWxkTmFtZXMgPSBmaWVsZE5hbWVzLnJlZHVjZSgobGlzdDogQXJyYXk8c3RyaW5nPiwgZmllbGROYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgaWYgKGZpZWxkLnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgbGlzdC5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICB9XG4gICAgICBkZWxldGUgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuIGxpc3Q7XG4gICAgfSwgW10pO1xuXG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uZmllbGROYW1lc107XG4gICAgY29uc3QgY29sdW1ucyA9IGZpZWxkTmFtZXNcbiAgICAgIC5tYXAoKG5hbWUsIGlkeCkgPT4ge1xuICAgICAgICByZXR1cm4gYCQke2lkeCArIDJ9Om5hbWVgO1xuICAgICAgfSlcbiAgICAgIC5qb2luKCcsIERST1AgQ09MVU1OJyk7XG5cbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ2RlbGV0ZS1maWVsZHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGF3YWl0IHQubm9uZSgnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiID0gJDxzY2hlbWE+IFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIHNjaGVtYSxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgfSk7XG4gICAgICBpZiAodmFsdWVzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgYXdhaXQgdC5ub25lKGBBTFRFUiBUQUJMRSAkMTpuYW1lIERST1AgQ09MVU1OIElGIEVYSVNUUyAke2NvbHVtbnN9YCwgdmFsdWVzKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIGFsbCBzY2hlbWFzIGtub3duIHRvIHRoaXMgYWRhcHRlciwgaW4gUGFyc2UgZm9ybWF0LiBJbiBjYXNlIHRoZVxuICAvLyBzY2hlbWFzIGNhbm5vdCBiZSByZXRyaWV2ZWQsIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVqZWN0cy4gUmVxdWlyZW1lbnRzIGZvciB0aGVcbiAgLy8gcmVqZWN0aW9uIHJlYXNvbiBhcmUgVEJELlxuICBhc3luYyBnZXRBbGxDbGFzc2VzKCkge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQudGFzaygnZ2V0LWFsbC1jbGFzc2VzJywgYXN5bmMgdCA9PiB7XG4gICAgICByZXR1cm4gYXdhaXQgdC5tYXAoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInLCBudWxsLCByb3cgPT5cbiAgICAgICAgdG9QYXJzZVNjaGVtYSh7IGNsYXNzTmFtZTogcm93LmNsYXNzTmFtZSwgLi4ucm93LnNjaGVtYSB9KVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIHRoZSBzY2hlbWEgd2l0aCB0aGUgZ2l2ZW4gbmFtZSwgaW4gUGFyc2UgZm9ybWF0LiBJZlxuICAvLyB0aGlzIGFkYXB0ZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSBzY2hlbWEsIHJldHVybiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpdGhcbiAgLy8gdW5kZWZpbmVkIGFzIHRoZSByZWFzb24uXG4gIGFzeW5jIGdldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgZGVidWcoJ2dldENsYXNzJyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueSgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+Jywge1xuICAgICAgICBjbGFzc05hbWUsXG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdC5sZW5ndGggIT09IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFswXS5zY2hlbWE7XG4gICAgICB9KVxuICAgICAgLnRoZW4odG9QYXJzZVNjaGVtYSk7XG4gIH1cblxuICAvLyBUT0RPOiByZW1vdmUgdGhlIG1vbmdvIGZvcm1hdCBkZXBlbmRlbmN5IGluIHRoZSByZXR1cm4gdmFsdWVcbiAgYXN5bmMgY3JlYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnY3JlYXRlT2JqZWN0Jyk7XG4gICAgbGV0IGNvbHVtbnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGdlb1BvaW50cyA9IHt9O1xuXG4gICAgb2JqZWN0ID0gaGFuZGxlRG90RmllbGRzKG9iamVjdCk7XG5cbiAgICB2YWxpZGF0ZUtleXMob2JqZWN0KTtcblxuICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHZhciBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBjb25zdCBhdXRoRGF0YUFscmVhZHlFeGlzdHMgPSAhIW9iamVjdC5hdXRoRGF0YTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXSA9IG9iamVjdFsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGZpZWxkTmFtZSA9ICdhdXRoRGF0YSc7XG4gICAgICAgIC8vIEF2b2lkIGFkZGluZyBhdXRoRGF0YSBtdWx0aXBsZSB0aW1lcyB0byB0aGUgcXVlcnlcbiAgICAgICAgaWYgKGF1dGhEYXRhQWxyZWFkeUV4aXN0cykge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb2x1bW5zQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19mYWlsZWRfbG9naW5fY291bnQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2hpc3RvcnknXG4gICAgICAgICkge1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcpIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzd2l0Y2ggKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlKSB7XG4gICAgICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5vYmplY3RJZCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KG9iamVjdFtmaWVsZE5hbWVdKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdPYmplY3QnOlxuICAgICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICAgIGNhc2UgJ051bWJlcic6XG4gICAgICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdGaWxlJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm5hbWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2x5Z29uJzoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChvYmplY3RbZmllbGROYW1lXS5jb29yZGluYXRlcyk7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICAgIC8vIHBvcCB0aGUgcG9pbnQgYW5kIHByb2Nlc3MgbGF0ZXJcbiAgICAgICAgICBnZW9Qb2ludHNbZmllbGROYW1lXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICAgIGNvbHVtbnNBcnJheS5wb3AoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBgVHlwZSAke3NjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlfSBub3Qgc3VwcG9ydGVkIHlldGA7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb2x1bW5zQXJyYXkgPSBjb2x1bW5zQXJyYXkuY29uY2F0KE9iamVjdC5rZXlzKGdlb1BvaW50cykpO1xuICAgIGNvbnN0IGluaXRpYWxWYWx1ZXMgPSB2YWx1ZXNBcnJheS5tYXAoKHZhbCwgaW5kZXgpID0+IHtcbiAgICAgIGxldCB0ZXJtaW5hdGlvbiA9ICcnO1xuICAgICAgY29uc3QgZmllbGROYW1lID0gY29sdW1uc0FycmF5W2luZGV4XTtcbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6OnRleHRbXSc7XG4gICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6Ompzb25iJztcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJCR7aW5kZXggKyAyICsgY29sdW1uc0FycmF5Lmxlbmd0aH0ke3Rlcm1pbmF0aW9ufWA7XG4gICAgfSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzSW5qZWN0cyA9IE9iamVjdC5rZXlzKGdlb1BvaW50cykubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGdlb1BvaW50c1trZXldO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZS5sb25naXR1ZGUsIHZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGNvbnN0IGwgPSB2YWx1ZXNBcnJheS5sZW5ndGggKyBjb2x1bW5zQXJyYXkubGVuZ3RoO1xuICAgICAgcmV0dXJuIGBQT0lOVCgkJHtsfSwgJCR7bCArIDF9KWA7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2x1bW5zUGF0dGVybiA9IGNvbHVtbnNBcnJheS5tYXAoKGNvbCwgaW5kZXgpID0+IGAkJHtpbmRleCArIDJ9Om5hbWVgKS5qb2luKCk7XG4gICAgY29uc3QgdmFsdWVzUGF0dGVybiA9IGluaXRpYWxWYWx1ZXMuY29uY2F0KGdlb1BvaW50c0luamVjdHMpLmpvaW4oKTtcblxuICAgIGNvbnN0IHFzID0gYElOU0VSVCBJTlRPICQxOm5hbWUgKCR7Y29sdW1uc1BhdHRlcm59KSBWQUxVRVMgKCR7dmFsdWVzUGF0dGVybn0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5jb2x1bW5zQXJyYXksIC4uLnZhbHVlc0FycmF5XTtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udCA6IHRoaXMuX2NsaWVudClcbiAgICAgIC5ub25lKHFzLCB2YWx1ZXMpXG4gICAgICAudGhlbigoKSA9PiAoeyBvcHM6IFtvYmplY3RdIH0pKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvcikge1xuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgZXJyLnVuZGVybHlpbmdFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGlmIChlcnJvci5jb25zdHJhaW50KSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gZXJyb3IuY29uc3RyYWludC5tYXRjaCgvdW5pcXVlXyhbYS16QS1aXSspLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBlcnJvciA9IGVycjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGFzeW5jIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdkZWxldGVPYmplY3RzQnlRdWVyeScpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IGluZGV4ID0gMjtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcbiAgICBpZiAoT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgd2hlcmUucGF0dGVybiA9ICdUUlVFJztcbiAgICB9XG4gICAgY29uc3QgcXMgPSBgV0lUSCBkZWxldGVkIEFTIChERUxFVEUgRlJPTSAkMTpuYW1lIFdIRVJFICR7d2hlcmUucGF0dGVybn0gUkVUVVJOSU5HICopIFNFTEVDVCBjb3VudCgqKSBGUk9NIGRlbGV0ZWRgO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KVxuICAgICAgLm9uZShxcywgdmFsdWVzLCBhID0+ICthLmNvdW50KVxuICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIEVMU0U6IERvbid0IGRlbGV0ZSBhbnl0aGluZyBpZiBkb2Vzbid0IGV4aXN0XG4gICAgICB9KTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG4gIC8vIFJldHVybiB2YWx1ZSBub3QgY3VycmVudGx5IHdlbGwgc3BlY2lmaWVkLlxuICBhc3luYyBmaW5kT25lQW5kVXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgZGVidWcoJ2ZpbmRPbmVBbmRVcGRhdGUnKTtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVPYmplY3RzQnlRdWVyeShjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHVwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oXG4gICAgICB2YWwgPT4gdmFsWzBdXG4gICAgKTtcbiAgfVxuXG4gIC8vIEFwcGx5IHRoZSB1cGRhdGUgdG8gYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIGFzeW5jIHVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICk6IFByb21pc2U8W2FueV0+IHtcbiAgICBkZWJ1ZygndXBkYXRlT2JqZWN0c0J5UXVlcnknKTtcbiAgICBjb25zdCB1cGRhdGVQYXR0ZXJucyA9IFtdO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGxldCBpbmRleCA9IDI7XG4gICAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuXG4gICAgY29uc3Qgb3JpZ2luYWxVcGRhdGUgPSB7IC4uLnVwZGF0ZSB9O1xuXG4gICAgLy8gU2V0IGZsYWcgZm9yIGRvdCBub3RhdGlvbiBmaWVsZHNcbiAgICBjb25zdCBkb3ROb3RhdGlvbk9wdGlvbnMgPSB7fTtcbiAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IGZpZWxkTmFtZS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBmaXJzdCA9IGNvbXBvbmVudHMuc2hpZnQoKTtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpcnN0XSA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHVwZGF0ZSA9IGhhbmRsZURvdEZpZWxkcyh1cGRhdGUpO1xuICAgIC8vIFJlc29sdmUgYXV0aERhdGEgZmlyc3QsXG4gICAgLy8gU28gd2UgZG9uJ3QgZW5kIHVwIHdpdGggbXVsdGlwbGUga2V5IHVwZGF0ZXNcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB1cGRhdGUpIHtcbiAgICAgIGNvbnN0IGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIGNvbnN0IHZhbHVlID0gdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIGRlbGV0ZSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddID0gdXBkYXRlWydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICB1cGRhdGVbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gdmFsdWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBmaWVsZFZhbHVlID0gdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAvLyBEcm9wIGFueSB1bmRlZmluZWQgdmFsdWVzLlxuICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PSAnYXV0aERhdGEnKSB7XG4gICAgICAgIC8vIFRoaXMgcmVjdXJzaXZlbHkgc2V0cyB0aGUganNvbl9vYmplY3RcbiAgICAgICAgLy8gT25seSAxIGxldmVsIGRlZXBcbiAgICAgICAgY29uc3QgZ2VuZXJhdGUgPSAoanNvbmI6IHN0cmluZywga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gYGpzb25fb2JqZWN0X3NldF9rZXkoQ09BTEVTQ0UoJHtqc29uYn0sICd7fSc6Ompzb25iKSwgJHtrZXl9LCAke3ZhbHVlfSk6Ompzb25iYDtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgbGFzdEtleSA9IGAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgIGNvbnN0IGZpZWxkTmFtZUluZGV4ID0gaW5kZXg7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGNvbnN0IHVwZGF0ZSA9IE9iamVjdC5rZXlzKGZpZWxkVmFsdWUpLnJlZHVjZSgobGFzdEtleTogc3RyaW5nLCBrZXk6IHN0cmluZykgPT4ge1xuICAgICAgICAgIGNvbnN0IHN0ciA9IGdlbmVyYXRlKGxhc3RLZXksIGAkJHtpbmRleH06OnRleHRgLCBgJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgIGxldCB2YWx1ZSA9IGZpZWxkVmFsdWVba2V5XTtcbiAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2YWx1ZSA9IEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsdWVzLnB1c2goa2V5LCB2YWx1ZSk7XG4gICAgICAgICAgcmV0dXJuIHN0cjtcbiAgICAgICAgfSwgbGFzdEtleSk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2ZpZWxkTmFtZUluZGV4fTpuYW1lID0gJHt1cGRhdGV9YCk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0luY3JlbWVudCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgMCkgKyAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5hbW91bnQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGQnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke2luZGV4ICsgMX06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBudWxsKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnUmVtb3ZlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X3JlbW92ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkVW5pcXVlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZF91bmlxdWUoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDFcbiAgICAgICAgICB9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgLy9UT0RPOiBzdG9wIHNwZWNpYWwgY2FzaW5nIHRoaXMuIEl0IHNob3VsZCBjaGVjayBmb3IgX190eXBlID09PSAnRGF0ZScgYW5kIHVzZSAuaXNvXG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgICAgaW5kZXggKz0gMztcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwoZmllbGRWYWx1ZS5jb29yZGluYXRlcyk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgLy8gbm9vcFxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnT2JqZWN0J1xuICAgICAgKSB7XG4gICAgICAgIC8vIEdhdGhlciBrZXlzIHRvIGluY3JlbWVudFxuICAgICAgICBjb25zdCBrZXlzVG9JbmNyZW1lbnQgPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKGsgPT4ge1xuICAgICAgICAgICAgLy8gY2hvb3NlIHRvcCBsZXZlbCBmaWVsZHMgdGhhdCBoYXZlIGEgZGVsZXRlIG9wZXJhdGlvbiBzZXRcbiAgICAgICAgICAgIC8vIE5vdGUgdGhhdCBPYmplY3Qua2V5cyBpcyBpdGVyYXRpbmcgb3ZlciB0aGUgKipvcmlnaW5hbCoqIHVwZGF0ZSBvYmplY3RcbiAgICAgICAgICAgIC8vIGFuZCB0aGF0IHNvbWUgb2YgdGhlIGtleXMgb2YgdGhlIG9yaWdpbmFsIHVwZGF0ZSBjb3VsZCBiZSBudWxsIG9yIHVuZGVmaW5lZDpcbiAgICAgICAgICAgIC8vIChTZWUgdGhlIGFib3ZlIGNoZWNrIGBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCB0eXBlb2YgZmllbGRWYWx1ZSA9PSBcInVuZGVmaW5lZFwiKWApXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsVXBkYXRlW2tdO1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgICAgICAgdmFsdWUuX19vcCA9PT0gJ0luY3JlbWVudCcgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJylbMF0gPT09IGZpZWxkTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoayA9PiBrLnNwbGl0KCcuJylbMV0pO1xuXG4gICAgICAgIGxldCBpbmNyZW1lbnRQYXR0ZXJucyA9ICcnO1xuICAgICAgICBpZiAoa2V5c1RvSW5jcmVtZW50Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpbmNyZW1lbnRQYXR0ZXJucyA9XG4gICAgICAgICAgICAnIHx8ICcgK1xuICAgICAgICAgICAga2V5c1RvSW5jcmVtZW50XG4gICAgICAgICAgICAgIC5tYXAoYyA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYW1vdW50ID0gZmllbGRWYWx1ZVtjXS5hbW91bnQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBDT05DQVQoJ3tcIiR7Y31cIjonLCBDT0FMRVNDRSgkJHtpbmRleH06bmFtZS0+Picke2N9JywnMCcpOjppbnQgKyAke2Ftb3VudH0sICd9Jyk6Ompzb25iYDtcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgLmpvaW4oJyB8fCAnKTtcbiAgICAgICAgICAvLyBTdHJpcCB0aGUga2V5c1xuICAgICAgICAgIGtleXNUb0luY3JlbWVudC5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgICBkZWxldGUgZmllbGRWYWx1ZVtrZXldO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qga2V5c1RvRGVsZXRlOiBBcnJheTxzdHJpbmc+ID0gT2JqZWN0LmtleXMob3JpZ2luYWxVcGRhdGUpXG4gICAgICAgICAgLmZpbHRlcihrID0+IHtcbiAgICAgICAgICAgIC8vIGNob29zZSB0b3AgbGV2ZWwgZmllbGRzIHRoYXQgaGF2ZSBhIGRlbGV0ZSBvcGVyYXRpb24gc2V0LlxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcmlnaW5hbFVwZGF0ZVtrXTtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHZhbHVlICYmXG4gICAgICAgICAgICAgIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpWzBdID09PSBmaWVsZE5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGsgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBjb25zdCBkZWxldGVQYXR0ZXJucyA9IGtleXNUb0RlbGV0ZS5yZWR1Y2UoKHA6IHN0cmluZywgYzogc3RyaW5nLCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgICByZXR1cm4gcCArIGAgLSAnJCR7aW5kZXggKyAxICsgaX06dmFsdWUnYDtcbiAgICAgICAgfSwgJycpO1xuICAgICAgICAvLyBPdmVycmlkZSBPYmplY3RcbiAgICAgICAgbGV0IHVwZGF0ZU9iamVjdCA9IFwiJ3t9Jzo6anNvbmJcIjtcblxuICAgICAgICBpZiAoZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAvLyBNZXJnZSBPYmplY3RcbiAgICAgICAgICB1cGRhdGVPYmplY3QgPSBgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICd7fSc6Ompzb25iKWA7XG4gICAgICAgIH1cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSAoJHt1cGRhdGVPYmplY3R9ICR7ZGVsZXRlUGF0dGVybnN9ICR7aW5jcmVtZW50UGF0dGVybnN9IHx8ICQke1xuICAgICAgICAgICAgaW5kZXggKyAxICsga2V5c1RvRGVsZXRlLmxlbmd0aFxuICAgICAgICAgIH06Ompzb25iIClgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgLi4ua2V5c1RvRGVsZXRlLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKSk7XG4gICAgICAgIGluZGV4ICs9IDIgKyBrZXlzVG9EZWxldGUubGVuZ3RoO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlKSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSdcbiAgICAgICkge1xuICAgICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZShzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pO1xuICAgICAgICBpZiAoZXhwZWN0ZWRUeXBlID09PSAndGV4dFtdJykge1xuICAgICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfTo6dGV4dFtdYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWJ1ZygnTm90IHN1cHBvcnRlZCB1cGRhdGUnLCB7IGZpZWxkTmFtZSwgZmllbGRWYWx1ZSB9KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICBgUG9zdGdyZXMgZG9lc24ndCBzdXBwb3J0IHVwZGF0ZSAke0pTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpfSB5ZXRgXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBpbmRleCxcbiAgICAgIHF1ZXJ5LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVDbGF1c2UgPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCBxcyA9IGBVUERBVEUgJDE6bmFtZSBTRVQgJHt1cGRhdGVQYXR0ZXJucy5qb2luKCl9ICR7d2hlcmVDbGF1c2V9IFJFVFVSTklORyAqYDtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udCA6IHRoaXMuX2NsaWVudCkuYW55KHFzLCB2YWx1ZXMpO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvLyBIb3BlZnVsbHksIHdlIGNhbiBnZXQgcmlkIG9mIHRoaXMuIEl0J3Mgb25seSB1c2VkIGZvciBjb25maWcgYW5kIGhvb2tzLlxuICB1cHNlcnRPbmVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ3Vwc2VydE9uZU9iamVjdCcpO1xuICAgIGNvbnN0IGNyZWF0ZVZhbHVlID0gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlT2JqZWN0KGNsYXNzTmFtZSwgc2NoZW1hLCBjcmVhdGVWYWx1ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIC8vIGlnbm9yZSBkdXBsaWNhdGUgdmFsdWUgZXJyb3JzIGFzIGl0J3MgdXBzZXJ0XG4gICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMuZmluZE9uZUFuZFVwZGF0ZShjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHVwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pO1xuICAgIH0pO1xuICB9XG5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB7IHNraXAsIGxpbWl0LCBzb3J0LCBrZXlzLCBjYXNlSW5zZW5zaXRpdmUsIGV4cGxhaW4gfTogUXVlcnlPcHRpb25zXG4gICkge1xuICAgIGRlYnVnKCdmaW5kJyk7XG4gICAgY29uc3QgaGFzTGltaXQgPSBsaW1pdCAhPT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGhhc1NraXAgPSBza2lwICE9PSB1bmRlZmluZWQ7XG4gICAgbGV0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiAyLFxuICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgbGltaXRQYXR0ZXJuID0gaGFzTGltaXQgPyBgTElNSVQgJCR7dmFsdWVzLmxlbmd0aCArIDF9YCA6ICcnO1xuICAgIGlmIChoYXNMaW1pdCkge1xuICAgICAgdmFsdWVzLnB1c2gobGltaXQpO1xuICAgIH1cbiAgICBjb25zdCBza2lwUGF0dGVybiA9IGhhc1NraXAgPyBgT0ZGU0VUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzU2tpcCkge1xuICAgICAgdmFsdWVzLnB1c2goc2tpcCk7XG4gICAgfVxuXG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgaWYgKHNvcnQpIHtcbiAgICAgIGNvbnN0IHNvcnRDb3B5OiBhbnkgPSBzb3J0O1xuICAgICAgY29uc3Qgc29ydGluZyA9IE9iamVjdC5rZXlzKHNvcnQpXG4gICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1LZXkgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhrZXkpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgLy8gVXNpbmcgJGlkeCBwYXR0ZXJuIGdpdmVzOiAgbm9uLWludGVnZXIgY29uc3RhbnQgaW4gT1JERVIgQllcbiAgICAgICAgICBpZiAoc29ydENvcHlba2V5XSA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIGAke3RyYW5zZm9ybUtleX0gQVNDYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAke3RyYW5zZm9ybUtleX0gREVTQ2A7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCk7XG4gICAgICBzb3J0UGF0dGVybiA9IHNvcnQgIT09IHVuZGVmaW5lZCAmJiBPYmplY3Qua2V5cyhzb3J0KS5sZW5ndGggPiAwID8gYE9SREVSIEJZICR7c29ydGluZ31gIDogJyc7XG4gICAgfVxuICAgIGlmICh3aGVyZS5zb3J0cyAmJiBPYmplY3Qua2V5cygod2hlcmUuc29ydHM6IGFueSkpLmxlbmd0aCA+IDApIHtcbiAgICAgIHNvcnRQYXR0ZXJuID0gYE9SREVSIEJZICR7d2hlcmUuc29ydHMuam9pbigpfWA7XG4gICAgfVxuXG4gICAgbGV0IGNvbHVtbnMgPSAnKic7XG4gICAgaWYgKGtleXMpIHtcbiAgICAgIC8vIEV4Y2x1ZGUgZW1wdHkga2V5c1xuICAgICAgLy8gUmVwbGFjZSBBQ0wgYnkgaXQncyBrZXlzXG4gICAgICBrZXlzID0ga2V5cy5yZWR1Y2UoKG1lbW8sIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5ID09PSAnQUNMJykge1xuICAgICAgICAgIG1lbW8ucHVzaCgnX3JwZXJtJyk7XG4gICAgICAgICAgbWVtby5wdXNoKCdfd3Blcm0nKTtcbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBrZXkubGVuZ3RoID4gMCAmJlxuICAgICAgICAgIC8vIFJlbW92ZSBzZWxlY3RlZCBmaWVsZCBub3QgcmVmZXJlbmNlZCBpbiB0aGUgc2NoZW1hXG4gICAgICAgICAgLy8gUmVsYXRpb24gaXMgbm90IGEgY29sdW1uIGluIHBvc3RncmVzXG4gICAgICAgICAgLy8gJHNjb3JlIGlzIGEgUGFyc2Ugc3BlY2lhbCBmaWVsZCBhbmQgaXMgYWxzbyBub3QgYSBjb2x1bW5cbiAgICAgICAgICAoKHNjaGVtYS5maWVsZHNba2V5XSAmJiBzY2hlbWEuZmllbGRzW2tleV0udHlwZSAhPT0gJ1JlbGF0aW9uJykgfHwga2V5ID09PSAnJHNjb3JlJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgbWVtby5wdXNoKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LCBbXSk7XG4gICAgICBjb2x1bW5zID0ga2V5c1xuICAgICAgICAubWFwKChrZXksIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGtleSA9PT0gJyRzY29yZScpIHtcbiAgICAgICAgICAgIHJldHVybiBgdHNfcmFua19jZCh0b190c3ZlY3RvcigkJHsyfSwgJCR7M306bmFtZSksIHRvX3RzcXVlcnkoJCR7NH0sICQkezV9KSwgMzIpIGFzIHNjb3JlYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAkJHtpbmRleCArIHZhbHVlcy5sZW5ndGggKyAxfTpuYW1lYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHZhbHVlcyA9IHZhbHVlcy5jb25jYXQoa2V5cyk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufSAke3NraXBQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluID8gdGhpcy5jcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KG9yaWdpbmFsUXVlcnkpIDogb3JpZ2luYWxRdWVyeTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KHFzLCB2YWx1ZXMpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBRdWVyeSBvbiBub24gZXhpc3RpbmcgdGFibGUsIGRvbid0IGNyYXNoXG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW107XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIENvbnZlcnRzIGZyb20gYSBwb3N0Z3Jlcy1mb3JtYXQgb2JqZWN0IHRvIGEgUkVTVC1mb3JtYXQgb2JqZWN0LlxuICAvLyBEb2VzIG5vdCBzdHJpcCBvdXQgYW55dGhpbmcgYmFzZWQgb24gYSBsYWNrIG9mIGF1dGhlbnRpY2F0aW9uLlxuICBwb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBzY2hlbWE6IGFueSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInICYmIG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgICAgIGxhdGl0dWRlOiBvYmplY3RbZmllbGROYW1lXS55LFxuICAgICAgICAgIGxvbmdpdHVkZTogb2JqZWN0W2ZpZWxkTmFtZV0ueCxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGxldCBjb29yZHMgPSBuZXcgU3RyaW5nKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgY29vcmRzID0gY29vcmRzLnN1YnN0cmluZygyLCBjb29yZHMubGVuZ3RoIC0gMikuc3BsaXQoJyksKCcpO1xuICAgICAgICBjb25zdCB1cGRhdGVkQ29vcmRzID0gY29vcmRzLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgcmV0dXJuIFtwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMV0pLCBwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMF0pXTtcbiAgICAgICAgfSk7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1BvbHlnb24nLFxuICAgICAgICAgIGNvb3JkaW5hdGVzOiB1cGRhdGVkQ29vcmRzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnRmlsZScpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICAgICAgbmFtZTogb2JqZWN0W2ZpZWxkTmFtZV0sXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgLy9UT0RPOiByZW1vdmUgdGhpcyByZWxpYW5jZSBvbiB0aGUgbW9uZ28gZm9ybWF0LiBEQiBhZGFwdGVyIHNob3VsZG4ndCBrbm93IHRoZXJlIGlzIGEgZGlmZmVyZW5jZSBiZXR3ZWVuIGNyZWF0ZWQgYXQgYW5kIGFueSBvdGhlciBkYXRlIGZpZWxkLlxuICAgIGlmIChvYmplY3QuY3JlYXRlZEF0KSB7XG4gICAgICBvYmplY3QuY3JlYXRlZEF0ID0gb2JqZWN0LmNyZWF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LnVwZGF0ZWRBdCkge1xuICAgICAgb2JqZWN0LnVwZGF0ZWRBdCA9IG9iamVjdC51cGRhdGVkQXQudG9JU09TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5leHBpcmVzQXQpIHtcbiAgICAgIG9iamVjdC5leHBpcmVzQXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5leHBpcmVzQXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQpIHtcbiAgICAgIG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSBudWxsKSB7XG4gICAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgICAgaXNvOiBvYmplY3RbZmllbGROYW1lXS50b0lTT1N0cmluZygpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICAvLyBDcmVhdGUgYSB1bmlxdWUgaW5kZXguIFVuaXF1ZSBpbmRleGVzIG9uIG51bGxhYmxlIGZpZWxkcyBhcmUgbm90IGFsbG93ZWQuIFNpbmNlIHdlIGRvbid0XG4gIC8vIGN1cnJlbnRseSBrbm93IHdoaWNoIGZpZWxkcyBhcmUgbnVsbGFibGUgYW5kIHdoaWNoIGFyZW4ndCwgd2UgaWdub3JlIHRoYXQgY3JpdGVyaWEuXG4gIC8vIEFzIHN1Y2gsIHdlIHNob3VsZG4ndCBleHBvc2UgdGhpcyBmdW5jdGlvbiB0byB1c2VycyBvZiBwYXJzZSB1bnRpbCB3ZSBoYXZlIGFuIG91dC1vZi1iYW5kXG4gIC8vIFdheSBvZiBkZXRlcm1pbmluZyBpZiBhIGZpZWxkIGlzIG51bGxhYmxlLiBVbmRlZmluZWQgZG9lc24ndCBjb3VudCBhZ2FpbnN0IHVuaXF1ZW5lc3MsXG4gIC8vIHdoaWNoIGlzIHdoeSB3ZSB1c2Ugc3BhcnNlIGluZGV4ZXMuXG4gIGFzeW5jIGVuc3VyZVVuaXF1ZW5lc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pIHtcbiAgICBjb25zdCBjb25zdHJhaW50TmFtZSA9IGAke2NsYXNzTmFtZX1fdW5pcXVlXyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgY29uc3RyYWludFBhdHRlcm5zID0gZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSwgaW5kZXgpID0+IGAkJHtpbmRleCArIDN9Om5hbWVgKTtcbiAgICBjb25zdCBxcyA9IGBDUkVBVEUgVU5JUVVFIElOREVYIElGIE5PVCBFWElTVFMgJDI6bmFtZSBPTiAkMTpuYW1lKCR7Y29uc3RyYWludFBhdHRlcm5zLmpvaW4oKX0pYDtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50Lm5vbmUocXMsIFtjbGFzc05hbWUsIGNvbnN0cmFpbnROYW1lLCAuLi5maWVsZE5hbWVzXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGNvbnN0cmFpbnROYW1lKSkge1xuICAgICAgICAvLyBJbmRleCBhbHJlYWR5IGV4aXN0cy4gSWdub3JlIGVycm9yLlxuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yICYmXG4gICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gQ2FzdCB0aGUgZXJyb3IgaW50byB0aGUgcHJvcGVyIHBhcnNlIGVycm9yXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgY291bnQuXG4gIGFzeW5jIGNvdW50KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHJlYWRQcmVmZXJlbmNlPzogc3RyaW5nLFxuICAgIGVzdGltYXRlPzogYm9vbGVhbiA9IHRydWVcbiAgKSB7XG4gICAgZGVidWcoJ2NvdW50Jyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDIsXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBsZXQgcXMgPSAnJztcblxuICAgIGlmICh3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgfHwgIWVzdGltYXRlKSB7XG4gICAgICBxcyA9IGBTRUxFQ1QgY291bnQoKikgRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHFzID0gJ1NFTEVDVCByZWx0dXBsZXMgQVMgYXBwcm94aW1hdGVfcm93X2NvdW50IEZST00gcGdfY2xhc3MgV0hFUkUgcmVsbmFtZSA9ICQxJztcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4ge1xuICAgICAgICBpZiAoYS5hcHByb3hpbWF0ZV9yb3dfY291bnQgPT0gbnVsbCB8fCBhLmFwcHJveGltYXRlX3Jvd19jb3VudCA9PSAtMSkge1xuICAgICAgICAgIHJldHVybiAhaXNOYU4oK2EuY291bnQpID8gK2EuY291bnQgOiAwO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiArYS5hcHByb3hpbWF0ZV9yb3dfY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGRpc3RpbmN0KGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIHF1ZXJ5OiBRdWVyeVR5cGUsIGZpZWxkTmFtZTogc3RyaW5nKSB7XG4gICAgZGVidWcoJ2Rpc3RpbmN0Jyk7XG4gICAgbGV0IGZpZWxkID0gZmllbGROYW1lO1xuICAgIGxldCBjb2x1bW4gPSBmaWVsZE5hbWU7XG4gICAgY29uc3QgaXNOZXN0ZWQgPSBmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDA7XG4gICAgaWYgKGlzTmVzdGVkKSB7XG4gICAgICBmaWVsZCA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGZpZWxkTmFtZSkuam9pbignLT4nKTtcbiAgICAgIGNvbHVtbiA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xuICAgIH1cbiAgICBjb25zdCBpc0FycmF5RmllbGQgPVxuICAgICAgc2NoZW1hLmZpZWxkcyAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSc7XG4gICAgY29uc3QgaXNQb2ludGVyRmllbGQgPVxuICAgICAgc2NoZW1hLmZpZWxkcyAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJztcbiAgICBjb25zdCB2YWx1ZXMgPSBbZmllbGQsIGNvbHVtbiwgY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogNCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gaXNBcnJheUZpZWxkID8gJ2pzb25iX2FycmF5X2VsZW1lbnRzJyA6ICdPTic7XG4gICAgbGV0IHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpuYW1lKSAkMjpuYW1lIEZST00gJDM6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIGlmIChpc05lc3RlZCkge1xuICAgICAgcXMgPSBgU0VMRUNUIERJU1RJTkNUICR7dHJhbnNmb3JtZXJ9KCQxOnJhdykgJDI6cmF3IEZST00gJDM6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KHFzLCB2YWx1ZXMpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmICghaXNOZXN0ZWQpIHtcbiAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIob2JqZWN0ID0+IG9iamVjdFtmaWVsZF0gIT09IG51bGwpO1xuICAgICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgICByZXR1cm4gb2JqZWN0W2ZpZWxkXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZF0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNoaWxkID0gZmllbGROYW1lLnNwbGl0KCcuJylbMV07XG4gICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4gb2JqZWN0W2NvbHVtbl1bY2hpbGRdKTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+XG4gICAgICAgIHJlc3VsdHMubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSlcbiAgICAgICk7XG4gIH1cblxuICBhc3luYyBhZ2dyZWdhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBhbnksXG4gICAgcGlwZWxpbmU6IGFueSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBoaW50OiA/bWl4ZWQsXG4gICAgZXhwbGFpbj86IGJvb2xlYW5cbiAgKSB7XG4gICAgZGVidWcoJ2FnZ3JlZ2F0ZScpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGxldCBpbmRleDogbnVtYmVyID0gMjtcbiAgICBsZXQgY29sdW1uczogc3RyaW5nW10gPSBbXTtcbiAgICBsZXQgY291bnRGaWVsZCA9IG51bGw7XG4gICAgbGV0IGdyb3VwVmFsdWVzID0gbnVsbDtcbiAgICBsZXQgd2hlcmVQYXR0ZXJuID0gJyc7XG4gICAgbGV0IGxpbWl0UGF0dGVybiA9ICcnO1xuICAgIGxldCBza2lwUGF0dGVybiA9ICcnO1xuICAgIGxldCBzb3J0UGF0dGVybiA9ICcnO1xuICAgIGxldCBncm91cFBhdHRlcm4gPSAnJztcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBpcGVsaW5lLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBzdGFnZSA9IHBpcGVsaW5lW2ldO1xuICAgICAgaWYgKHN0YWdlLiRncm91cCkge1xuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRncm91cCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJGdyb3VwW2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ19pZCcgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiB2YWx1ZSAhPT0gJycpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWUgQVMgXCJvYmplY3RJZFwiYCk7XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9Om5hbWVgO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJyAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIE9iamVjdC5rZXlzKHZhbHVlKS5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICAgIGdyb3VwVmFsdWVzID0gdmFsdWU7XG4gICAgICAgICAgICBjb25zdCBncm91cEJ5RmllbGRzID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGFsaWFzIGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWVbYWxpYXNdID09PSAnc3RyaW5nJyAmJiB2YWx1ZVthbGlhc10pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc10pO1xuICAgICAgICAgICAgICAgIGlmICghZ3JvdXBCeUZpZWxkcy5pbmNsdWRlcyhgXCIke3NvdXJjZX1cImApKSB7XG4gICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goc291cmNlLCBhbGlhcyk7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9wZXJhdGlvbiA9IE9iamVjdC5rZXlzKHZhbHVlW2FsaWFzXSlbMF07XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gdHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWVbYWxpYXNdW29wZXJhdGlvbl0pO1xuICAgICAgICAgICAgICAgIGlmIChtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXSkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFncm91cEJ5RmllbGRzLmluY2x1ZGVzKGBcIiR7c291cmNlfVwiYCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXBCeUZpZWxkcy5wdXNoKGBcIiR7c291cmNlfVwiYCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goXG4gICAgICAgICAgICAgICAgICAgIGBFWFRSQUNUKCR7XG4gICAgICAgICAgICAgICAgICAgICAgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl1cbiAgICAgICAgICAgICAgICAgICAgfSBGUk9NICQke2luZGV4fTpuYW1lIEFUIFRJTUUgWk9ORSAnVVRDJyk6OmludGVnZXIgQVMgJCR7aW5kZXggKyAxfTpuYW1lYFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHNvdXJjZSwgYWxpYXMpO1xuICAgICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06cmF3YDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGdyb3VwQnlGaWVsZHMuam9pbigpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZS4kc3VtKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUuJHN1bSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYFNVTSgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJHN1bSksIGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvdW50RmllbGQgPSBmaWVsZDtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYENPVU5UKCopIEFTICQke2luZGV4fTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQpO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kbWF4KSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgTUFYKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJG1heCksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kbWluKSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgTUlOKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJG1pbiksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kYXZnKSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgQVZHKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJGF2ZyksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbHVtbnMucHVzaCgnKicpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgIGlmIChjb2x1bW5zLmluY2x1ZGVzKCcqJykpIHtcbiAgICAgICAgICBjb2x1bW5zID0gW107XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJHByb2plY3RbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gMSB8fCB2YWx1ZSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgY29uc3QgcGF0dGVybnMgPSBbXTtcbiAgICAgICAgY29uc3Qgb3JPckFuZCA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdGFnZS4kbWF0Y2gsICckb3InKVxuICAgICAgICAgID8gJyBPUiAnXG4gICAgICAgICAgOiAnIEFORCAnO1xuXG4gICAgICAgIGlmIChzdGFnZS4kbWF0Y2guJG9yKSB7XG4gICAgICAgICAgY29uc3QgY29sbGFwc2UgPSB7fTtcbiAgICAgICAgICBzdGFnZS4kbWF0Y2guJG9yLmZvckVhY2goZWxlbWVudCA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBlbGVtZW50KSB7XG4gICAgICAgICAgICAgIGNvbGxhcHNlW2tleV0gPSBlbGVtZW50W2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoID0gY29sbGFwc2U7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChsZXQgZmllbGQgaW4gc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kbWF0Y2hbZmllbGRdO1xuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ19pZCcpIHtcbiAgICAgICAgICAgIGZpZWxkID0gJ29iamVjdElkJztcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgbWF0Y2hQYXR0ZXJucyA9IFtdO1xuICAgICAgICAgIE9iamVjdC5rZXlzKFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcikuZm9yRWFjaChjbXAgPT4ge1xuICAgICAgICAgICAgaWYgKHZhbHVlW2NtcF0pIHtcbiAgICAgICAgICAgICAgY29uc3QgcGdDb21wYXJhdG9yID0gUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yW2NtcF07XG4gICAgICAgICAgICAgIG1hdGNoUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQsIHRvUG9zdGdyZXNWYWx1ZSh2YWx1ZVtjbXBdKSk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgaWYgKG1hdGNoUGF0dGVybnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgKCR7bWF0Y2hQYXR0ZXJucy5qb2luKCcgQU5EICcpfSlgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgJiYgbWF0Y2hQYXR0ZXJucy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQsIHZhbHVlKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHdoZXJlUGF0dGVybiA9IHBhdHRlcm5zLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHtwYXR0ZXJucy5qb2luKGAgJHtvck9yQW5kfSBgKX1gIDogJyc7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJGxpbWl0KSB7XG4gICAgICAgIGxpbWl0UGF0dGVybiA9IGBMSU1JVCAkJHtpbmRleH1gO1xuICAgICAgICB2YWx1ZXMucHVzaChzdGFnZS4kbGltaXQpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRza2lwKSB7XG4gICAgICAgIHNraXBQYXR0ZXJuID0gYE9GRlNFVCAkJHtpbmRleH1gO1xuICAgICAgICB2YWx1ZXMucHVzaChzdGFnZS4kc2tpcCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNvcnQpIHtcbiAgICAgICAgY29uc3Qgc29ydCA9IHN0YWdlLiRzb3J0O1xuICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoc29ydCk7XG4gICAgICAgIGNvbnN0IHNvcnRpbmcgPSBrZXlzXG4gICAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdHJhbnNmb3JtZXIgPSBzb3J0W2tleV0gPT09IDEgPyAnQVNDJyA6ICdERVNDJztcbiAgICAgICAgICAgIGNvbnN0IG9yZGVyID0gYCQke2luZGV4fTpuYW1lICR7dHJhbnNmb3JtZXJ9YDtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICByZXR1cm4gb3JkZXI7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuam9pbigpO1xuICAgICAgICB2YWx1ZXMucHVzaCguLi5rZXlzKTtcbiAgICAgICAgc29ydFBhdHRlcm4gPSBzb3J0ICE9PSB1bmRlZmluZWQgJiYgc29ydGluZy5sZW5ndGggPiAwID8gYE9SREVSIEJZICR7c29ydGluZ31gIDogJyc7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGdyb3VwUGF0dGVybikge1xuICAgICAgY29sdW1ucy5mb3JFYWNoKChlLCBpLCBhKSA9PiB7XG4gICAgICAgIGlmIChlICYmIGUudHJpbSgpID09PSAnKicpIHtcbiAgICAgICAgICBhW2ldID0gJyc7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBgU0VMRUNUICR7Y29sdW1uc1xuICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgLmpvaW4oKX0gRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufSAke3NraXBQYXR0ZXJufSAke2dyb3VwUGF0dGVybn0gJHtzb3J0UGF0dGVybn0gJHtsaW1pdFBhdHRlcm59YDtcbiAgICBjb25zdCBxcyA9IGV4cGxhaW4gPyB0aGlzLmNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkob3JpZ2luYWxRdWVyeSkgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQuYW55KHFzLCB2YWx1ZXMpLnRoZW4oYSA9PiB7XG4gICAgICBpZiAoZXhwbGFpbikge1xuICAgICAgICByZXR1cm4gYTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhLm1hcChvYmplY3QgPT4gdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3VsdCwgJ29iamVjdElkJykpIHtcbiAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGlmIChncm91cFZhbHVlcykge1xuICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IHt9O1xuICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGdyb3VwVmFsdWVzKSB7XG4gICAgICAgICAgICByZXN1bHQub2JqZWN0SWRba2V5XSA9IHJlc3VsdFtrZXldO1xuICAgICAgICAgICAgZGVsZXRlIHJlc3VsdFtrZXldO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoY291bnRGaWVsZCkge1xuICAgICAgICAgIHJlc3VsdFtjb3VudEZpZWxkXSA9IHBhcnNlSW50KHJlc3VsdFtjb3VudEZpZWxkXSwgMTApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgcGVyZm9ybUluaXRpYWxpemF0aW9uKHsgVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyB9OiBhbnkpIHtcbiAgICAvLyBUT0RPOiBUaGlzIG1ldGhvZCBuZWVkcyB0byBiZSByZXdyaXR0ZW4gdG8gbWFrZSBwcm9wZXIgdXNlIG9mIGNvbm5lY3Rpb25zIChAdml0YWx5LXQpXG4gICAgZGVidWcoJ3BlcmZvcm1Jbml0aWFsaXphdGlvbicpO1xuICAgIGF3YWl0IHRoaXMuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMoKTtcbiAgICBjb25zdCBwcm9taXNlcyA9IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMubWFwKHNjaGVtYSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVUYWJsZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpXG4gICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgfHxcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUVcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLnNjaGVtYVVwZ3JhZGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKSk7XG4gICAgfSk7XG4gICAgcHJvbWlzZXMucHVzaCh0aGlzLl9saXN0ZW5Ub1NjaGVtYSgpKTtcbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jbGllbnQudHgoJ3BlcmZvcm0taW5pdGlhbGl6YXRpb24nLCBhc3luYyB0ID0+IHtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLm1pc2MuanNvbk9iamVjdFNldEtleXMpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuYWRkKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmFkZFVuaXF1ZSk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5yZW1vdmUpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuY29udGFpbnNBbGwpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuY29udGFpbnNBbGxSZWdleCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWlucyk7XG4gICAgICAgICAgcmV0dXJuIHQuY3R4O1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbihjdHggPT4ge1xuICAgICAgICBkZWJ1ZyhgaW5pdGlhbGl6YXRpb25Eb25lIGluICR7Y3R4LmR1cmF0aW9ufWApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSwgY29ubjogP2FueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiAoY29ubiB8fCB0aGlzLl9jbGllbnQpLnR4KHQgPT5cbiAgICAgIHQuYmF0Y2goXG4gICAgICAgIGluZGV4ZXMubWFwKGkgPT4ge1xuICAgICAgICAgIHJldHVybiB0Lm5vbmUoJ0NSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLCBbXG4gICAgICAgICAgICBpLm5hbWUsXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBpLmtleSxcbiAgICAgICAgICBdKTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlSW5kZXhlc0lmTmVlZGVkKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgIHR5cGU6IGFueSxcbiAgICBjb25uOiA/YW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IChjb25uIHx8IHRoaXMuX2NsaWVudCkubm9uZSgnQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgkMzpuYW1lKScsIFtcbiAgICAgIGZpZWxkTmFtZSxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHR5cGUsXG4gICAgXSk7XG4gIH1cblxuICBhc3luYyBkcm9wSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55LCBjb25uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBxdWVyaWVzID0gaW5kZXhlcy5tYXAoaSA9PiAoe1xuICAgICAgcXVlcnk6ICdEUk9QIElOREVYICQxOm5hbWUnLFxuICAgICAgdmFsdWVzOiBpLFxuICAgIH0pKTtcbiAgICBhd2FpdCAoY29ubiB8fCB0aGlzLl9jbGllbnQpLnR4KHQgPT4gdC5ub25lKHRoaXMuX3BncC5oZWxwZXJzLmNvbmNhdChxdWVyaWVzKSkpO1xuICB9XG5cbiAgYXN5bmMgZ2V0SW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHFzID0gJ1NFTEVDVCAqIEZST00gcGdfaW5kZXhlcyBXSEVSRSB0YWJsZW5hbWUgPSAke2NsYXNzTmFtZX0nO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQuYW55KHFzLCB7IGNsYXNzTmFtZSB9KTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFVzZWQgZm9yIHRlc3RpbmcgcHVycG9zZXNcbiAgYXN5bmMgdXBkYXRlRXN0aW1hdGVkQ291bnQoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50Lm5vbmUoJ0FOQUxZWkUgJDE6bmFtZScsIFtjbGFzc05hbWVdKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCk6IFByb21pc2U8YW55PiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgY29uc3QgdHJhbnNhY3Rpb25hbFNlc3Npb24gPSB7fTtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdCA9IHRoaXMuX2NsaWVudC50eCh0ID0+IHtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24udCA9IHQ7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlID0gcmVzb2x2ZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoID0gW107XG4gICAgICAgIHJlc29sdmUodHJhbnNhY3Rpb25hbFNlc3Npb24pO1xuICAgICAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlc3Npb24ucHJvbWlzZTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlc3Npb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUodHJhbnNhY3Rpb25hbFNlc3Npb24udC5iYXRjaCh0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaCkpO1xuICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXN1bHQ7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZXNzaW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXN1bHQuY2F0Y2goKTtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKFByb21pc2UucmVqZWN0KCkpO1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUodHJhbnNhY3Rpb25hbFNlc3Npb24udC5iYXRjaCh0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaCkpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBhc3luYyBlbnN1cmVJbmRleChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgZmllbGROYW1lczogc3RyaW5nW10sXG4gICAgaW5kZXhOYW1lOiA/c3RyaW5nLFxuICAgIGNhc2VJbnNlbnNpdGl2ZTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIG9wdGlvbnM/OiBPYmplY3QgPSB7fVxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBkZWZhdWx0SW5kZXhOYW1lID0gYHBhcnNlX2RlZmF1bHRfJHtmaWVsZE5hbWVzLnNvcnQoKS5qb2luKCdfJyl9YDtcbiAgICBjb25zdCBpbmRleE5hbWVPcHRpb25zOiBPYmplY3QgPVxuICAgICAgaW5kZXhOYW1lICE9IG51bGwgPyB7IG5hbWU6IGluZGV4TmFtZSB9IDogeyBuYW1lOiBkZWZhdWx0SW5kZXhOYW1lIH07XG4gICAgY29uc3QgY29uc3RyYWludFBhdHRlcm5zID0gY2FzZUluc2Vuc2l0aXZlXG4gICAgICA/IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgbG93ZXIoJCR7aW5kZXggKyAzfTpuYW1lKSB2YXJjaGFyX3BhdHRlcm5fb3BzYClcbiAgICAgIDogZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSwgaW5kZXgpID0+IGAkJHtpbmRleCArIDN9Om5hbWVgKTtcbiAgICBjb25zdCBxcyA9IGBDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCR7Y29uc3RyYWludFBhdHRlcm5zLmpvaW4oKX0pYDtcbiAgICBjb25zdCBzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uID1cbiAgICAgIG9wdGlvbnMuc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIDogZmFsc2U7XG4gICAgaWYgKHNldElkZW1wb3RlbmN5RnVuY3Rpb24pIHtcbiAgICAgIGF3YWl0IHRoaXMuZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyhvcHRpb25zKTtcbiAgICB9XG4gICAgYXdhaXQgY29ubi5ub25lKHFzLCBbaW5kZXhOYW1lT3B0aW9ucy5uYW1lLCBjbGFzc05hbWUsIC4uLmZpZWxkTmFtZXNdKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGluZGV4TmFtZU9wdGlvbnMubmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBJbmRleCBhbHJlYWR5IGV4aXN0cy4gSWdub3JlIGVycm9yLlxuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yICYmXG4gICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lT3B0aW9ucy5uYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIENhc3QgdGhlIGVycm9yIGludG8gdGhlIHByb3BlciBwYXJzZSBlcnJvclxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBkZWxldGVJZGVtcG90ZW5jeUZ1bmN0aW9uKG9wdGlvbnM/OiBPYmplY3QgPSB7fSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgY29ubiA9IG9wdGlvbnMuY29ubiAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5jb25uIDogdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHFzID0gJ0RST1AgRlVOQ1RJT04gSUYgRVhJU1RTIGlkZW1wb3RlbmN5X2RlbGV0ZV9leHBpcmVkX3JlY29yZHMoKSc7XG4gICAgcmV0dXJuIGNvbm4ubm9uZShxcykuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBlbnN1cmVJZGVtcG90ZW5jeUZ1bmN0aW9uRXhpc3RzKG9wdGlvbnM/OiBPYmplY3QgPSB7fSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgY29ubiA9IG9wdGlvbnMuY29ubiAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5jb25uIDogdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHR0bE9wdGlvbnMgPSBvcHRpb25zLnR0bCAhPT0gdW5kZWZpbmVkID8gYCR7b3B0aW9ucy50dGx9IHNlY29uZHNgIDogJzYwIHNlY29uZHMnO1xuICAgIGNvbnN0IHFzID1cbiAgICAgICdDUkVBVEUgT1IgUkVQTEFDRSBGVU5DVElPTiBpZGVtcG90ZW5jeV9kZWxldGVfZXhwaXJlZF9yZWNvcmRzKCkgUkVUVVJOUyB2b2lkIExBTkdVQUdFIHBscGdzcWwgQVMgJCQgQkVHSU4gREVMRVRFIEZST00gXCJfSWRlbXBvdGVuY3lcIiBXSEVSRSBleHBpcmUgPCBOT1coKSAtIElOVEVSVkFMICQxOyBFTkQ7ICQkOyc7XG4gICAgcmV0dXJuIGNvbm4ubm9uZShxcywgW3R0bE9wdGlvbnNdKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjb252ZXJ0UG9seWdvblRvU1FMKHBvbHlnb24pIHtcbiAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBQb2x5Z29uIG11c3QgaGF2ZSBhdCBsZWFzdCAzIHZhbHVlc2ApO1xuICB9XG4gIGlmIChcbiAgICBwb2x5Z29uWzBdWzBdICE9PSBwb2x5Z29uW3BvbHlnb24ubGVuZ3RoIC0gMV1bMF0gfHxcbiAgICBwb2x5Z29uWzBdWzFdICE9PSBwb2x5Z29uW3BvbHlnb24ubGVuZ3RoIC0gMV1bMV1cbiAgKSB7XG4gICAgcG9seWdvbi5wdXNoKHBvbHlnb25bMF0pO1xuICB9XG4gIGNvbnN0IHVuaXF1ZSA9IHBvbHlnb24uZmlsdGVyKChpdGVtLCBpbmRleCwgYXIpID0+IHtcbiAgICBsZXQgZm91bmRJbmRleCA9IC0xO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXIubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHB0ID0gYXJbaV07XG4gICAgICBpZiAocHRbMF0gPT09IGl0ZW1bMF0gJiYgcHRbMV0gPT09IGl0ZW1bMV0pIHtcbiAgICAgICAgZm91bmRJbmRleCA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZm91bmRJbmRleCA9PT0gaW5kZXg7XG4gIH0pO1xuICBpZiAodW5pcXVlLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAnR2VvSlNPTjogTG9vcCBtdXN0IGhhdmUgYXQgbGVhc3QgMyBkaWZmZXJlbnQgdmVydGljZXMnXG4gICAgKTtcbiAgfVxuICBjb25zdCBwb2ludHMgPSBwb2x5Z29uXG4gICAgLm1hcChwb2ludCA9PiB7XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocGFyc2VGbG9hdChwb2ludFsxXSksIHBhcnNlRmxvYXQocG9pbnRbMF0pKTtcbiAgICAgIHJldHVybiBgKCR7cG9pbnRbMV19LCAke3BvaW50WzBdfSlgO1xuICAgIH0pXG4gICAgLmpvaW4oJywgJyk7XG4gIHJldHVybiBgKCR7cG9pbnRzfSlgO1xufVxuXG5mdW5jdGlvbiByZW1vdmVXaGl0ZVNwYWNlKHJlZ2V4KSB7XG4gIGlmICghcmVnZXguZW5kc1dpdGgoJ1xcbicpKSB7XG4gICAgcmVnZXggKz0gJ1xcbic7XG4gIH1cblxuICAvLyByZW1vdmUgbm9uIGVzY2FwZWQgY29tbWVudHNcbiAgcmV0dXJuIChcbiAgICByZWdleFxuICAgICAgLnJlcGxhY2UoLyhbXlxcXFxdKSMuKlxcbi9naW0sICckMScpXG4gICAgICAvLyByZW1vdmUgbGluZXMgc3RhcnRpbmcgd2l0aCBhIGNvbW1lbnRcbiAgICAgIC5yZXBsYWNlKC9eIy4qXFxuL2dpbSwgJycpXG4gICAgICAvLyByZW1vdmUgbm9uIGVzY2FwZWQgd2hpdGVzcGFjZVxuICAgICAgLnJlcGxhY2UoLyhbXlxcXFxdKVxccysvZ2ltLCAnJDEnKVxuICAgICAgLy8gcmVtb3ZlIHdoaXRlc3BhY2UgYXQgdGhlIGJlZ2lubmluZyBvZiBhIGxpbmVcbiAgICAgIC5yZXBsYWNlKC9eXFxzKy8sICcnKVxuICAgICAgLnRyaW0oKVxuICApO1xufVxuXG5mdW5jdGlvbiBwcm9jZXNzUmVnZXhQYXR0ZXJuKHMpIHtcbiAgaWYgKHMgJiYgcy5zdGFydHNXaXRoKCdeJykpIHtcbiAgICAvLyByZWdleCBmb3Igc3RhcnRzV2l0aFxuICAgIHJldHVybiAnXicgKyBsaXRlcmFsaXplUmVnZXhQYXJ0KHMuc2xpY2UoMSkpO1xuICB9IGVsc2UgaWYgKHMgJiYgcy5lbmRzV2l0aCgnJCcpKSB7XG4gICAgLy8gcmVnZXggZm9yIGVuZHNXaXRoXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocy5zbGljZSgwLCBzLmxlbmd0aCAtIDEpKSArICckJztcbiAgfVxuXG4gIC8vIHJlZ2V4IGZvciBjb250YWluc1xuICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzKTtcbn1cblxuZnVuY3Rpb24gaXNTdGFydHNXaXRoUmVnZXgodmFsdWUpIHtcbiAgaWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnIHx8ICF2YWx1ZS5zdGFydHNXaXRoKCdeJykpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBtYXRjaGVzID0gdmFsdWUubWF0Y2goL1xcXlxcXFxRLipcXFxcRS8pO1xuICByZXR1cm4gISFtYXRjaGVzO1xufVxuXG5mdW5jdGlvbiBpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKHZhbHVlcykge1xuICBpZiAoIXZhbHVlcyB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZXMpIHx8IHZhbHVlcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGNvbnN0IGZpcnN0VmFsdWVzSXNSZWdleCA9IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1swXS4kcmVnZXgpO1xuICBpZiAodmFsdWVzLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBmaXJzdFZhbHVlc0lzUmVnZXg7XG4gIH1cblxuICBmb3IgKGxldCBpID0gMSwgbGVuZ3RoID0gdmFsdWVzLmxlbmd0aDsgaSA8IGxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGZpcnN0VmFsdWVzSXNSZWdleCAhPT0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzW2ldLiRyZWdleCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaXNBbnlWYWx1ZVJlZ2V4U3RhcnRzV2l0aCh2YWx1ZXMpIHtcbiAgcmV0dXJuIHZhbHVlcy5zb21lKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZS4kcmVnZXgpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZykge1xuICByZXR1cm4gcmVtYWluaW5nXG4gICAgLnNwbGl0KCcnKVxuICAgIC5tYXAoYyA9PiB7XG4gICAgICBjb25zdCByZWdleCA9IFJlZ0V4cCgnWzAtOSBdfFxcXFxwe0x9JywgJ3UnKTsgLy8gU3VwcG9ydCBhbGwgdW5pY29kZSBsZXR0ZXIgY2hhcnNcbiAgICAgIGlmIChjLm1hdGNoKHJlZ2V4KSAhPT0gbnVsbCkge1xuICAgICAgICAvLyBkb24ndCBlc2NhcGUgYWxwaGFudW1lcmljIGNoYXJhY3RlcnNcbiAgICAgICAgcmV0dXJuIGM7XG4gICAgICB9XG4gICAgICAvLyBlc2NhcGUgZXZlcnl0aGluZyBlbHNlIChzaW5nbGUgcXVvdGVzIHdpdGggc2luZ2xlIHF1b3RlcywgZXZlcnl0aGluZyBlbHNlIHdpdGggYSBiYWNrc2xhc2gpXG4gICAgICByZXR1cm4gYyA9PT0gYCdgID8gYCcnYCA6IGBcXFxcJHtjfWA7XG4gICAgfSlcbiAgICAuam9pbignJyk7XG59XG5cbmZ1bmN0aW9uIGxpdGVyYWxpemVSZWdleFBhcnQoczogc3RyaW5nKSB7XG4gIGNvbnN0IG1hdGNoZXIxID0gL1xcXFxRKCg/IVxcXFxFKS4qKVxcXFxFJC87XG4gIGNvbnN0IHJlc3VsdDE6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjEpO1xuICBpZiAocmVzdWx0MSAmJiByZXN1bHQxLmxlbmd0aCA+IDEgJiYgcmVzdWx0MS5pbmRleCA+IC0xKSB7XG4gICAgLy8gcHJvY2VzcyByZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBhbmQgYW4gZW5kIHNwZWNpZmllZCBmb3IgdGhlIGxpdGVyYWwgdGV4dFxuICAgIGNvbnN0IHByZWZpeCA9IHMuc3Vic3RyaW5nKDAsIHJlc3VsdDEuaW5kZXgpO1xuICAgIGNvbnN0IHJlbWFpbmluZyA9IHJlc3VsdDFbMV07XG5cbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChwcmVmaXgpICsgY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZyk7XG4gIH1cblxuICAvLyBwcm9jZXNzIHJlZ2V4IHRoYXQgaGFzIGEgYmVnaW5uaW5nIHNwZWNpZmllZCBmb3IgdGhlIGxpdGVyYWwgdGV4dFxuICBjb25zdCBtYXRjaGVyMiA9IC9cXFxcUSgoPyFcXFxcRSkuKikkLztcbiAgY29uc3QgcmVzdWx0MjogYW55ID0gcy5tYXRjaChtYXRjaGVyMik7XG4gIGlmIChyZXN1bHQyICYmIHJlc3VsdDIubGVuZ3RoID4gMSAmJiByZXN1bHQyLmluZGV4ID4gLTEpIHtcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cmluZygwLCByZXN1bHQyLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQyWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gcmVtb3ZlIGFsbCBpbnN0YW5jZXMgb2YgXFxRIGFuZCBcXEUgZnJvbSB0aGUgcmVtYWluaW5nIHRleHQgJiBlc2NhcGUgc2luZ2xlIHF1b3Rlc1xuICByZXR1cm4gc1xuICAgIC5yZXBsYWNlKC8oW15cXFxcXSkoXFxcXEUpLywgJyQxJylcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxRKS8sICckMScpXG4gICAgLnJlcGxhY2UoL15cXFxcRS8sICcnKVxuICAgIC5yZXBsYWNlKC9eXFxcXFEvLCAnJylcbiAgICAucmVwbGFjZSgvKFteJ10pJy8sIGAkMScnYClcbiAgICAucmVwbGFjZSgvXicoW14nXSkvLCBgJyckMWApO1xufVxuXG52YXIgR2VvUG9pbnRDb2RlciA9IHtcbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCc7XG4gIH0sXG59O1xuXG5leHBvcnQgZGVmYXVsdCBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQTtBQUVBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFBbUQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBRW5ELE1BQU1BLEtBQUssR0FBR0MsT0FBTyxDQUFDLGdCQUFnQixDQUFDO0FBRXZDLE1BQU1DLGlDQUFpQyxHQUFHLE9BQU87QUFDakQsTUFBTUMsOEJBQThCLEdBQUcsT0FBTztBQUM5QyxNQUFNQyw0QkFBNEIsR0FBRyxPQUFPO0FBQzVDLE1BQU1DLDBCQUEwQixHQUFHLE9BQU87QUFDMUMsTUFBTUMsaUNBQWlDLEdBQUcsT0FBTztBQUNqRCxNQUFNQyxNQUFNLEdBQUdOLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQztBQUV6QyxNQUFNTyxLQUFLLEdBQUcsVUFBVSxHQUFHQyxJQUFTLEVBQUU7RUFDcENBLElBQUksR0FBRyxDQUFDLE1BQU0sR0FBR0MsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUNDLE1BQU0sQ0FBQ0YsSUFBSSxDQUFDRyxLQUFLLENB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