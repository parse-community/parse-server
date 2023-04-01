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
  return fieldName.substr(1);
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
    const now = new Date().getTime();
    const helpers = this._pgp.helpers;
    debug('deleteAllClasses');
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
        let coords = object[fieldName];
        coords = coords.substr(2, coords.length - 4).split('),(');
        coords = coords.map(point => {
          return [parseFloat(point.split(',')[1]), parseFloat(point.split(',')[0])];
        });
        object[fieldName] = {
          __type: 'Polygon',
          coordinates: coords
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
    const prefix = s.substr(0, result1.index);
    const remaining = result1[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // process regex that has a beginning specified for the literal text
  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2 = s.match(matcher2);
  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substr(0, result2.index);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJVdGlscyIsInJlcXVpcmUiLCJQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IiLCJQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IiLCJQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yIiwiUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IiLCJQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IiLCJsb2dnZXIiLCJkZWJ1ZyIsImFyZ3MiLCJhcmd1bWVudHMiLCJjb25jYXQiLCJzbGljZSIsImxlbmd0aCIsImxvZyIsImdldExvZ2dlciIsImFwcGx5IiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwidmFsdWUiLCJfX3R5cGUiLCJpc28iLCJuYW1lIiwidG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUiLCJwb3N0Z3Jlc1ZhbHVlIiwiY2FzdFR5cGUiLCJ1bmRlZmluZWQiLCJ0cmFuc2Zvcm1WYWx1ZSIsIm9iamVjdElkIiwiZW1wdHlDTFBTIiwiT2JqZWN0IiwiZnJlZXplIiwiZmluZCIsImdldCIsImNvdW50IiwiY3JlYXRlIiwidXBkYXRlIiwiZGVsZXRlIiwiYWRkRmllbGQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJkZWZhdWx0Q0xQUyIsInRvUGFyc2VTY2hlbWEiLCJzY2hlbWEiLCJjbGFzc05hbWUiLCJmaWVsZHMiLCJfaGFzaGVkX3Bhc3N3b3JkIiwiX3dwZXJtIiwiX3JwZXJtIiwiY2xwcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImluZGV4ZXMiLCJ0b1Bvc3RncmVzU2NoZW1hIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJoYW5kbGVEb3RGaWVsZHMiLCJvYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImZpZWxkTmFtZSIsImluZGV4T2YiLCJjb21wb25lbnRzIiwic3BsaXQiLCJmaXJzdCIsInNoaWZ0IiwiY3VycmVudE9iaiIsIm5leHQiLCJfX29wIiwidHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMiLCJtYXAiLCJjbXB0IiwiaW5kZXgiLCJ0cmFuc2Zvcm1Eb3RGaWVsZCIsImpvaW4iLCJ0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCIsInN1YnN0ciIsInZhbGlkYXRlS2V5cyIsImtleSIsImluY2x1ZGVzIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfTkVTVEVEX0tFWSIsImpvaW5UYWJsZXNGb3JTY2hlbWEiLCJsaXN0IiwiZmllbGQiLCJwdXNoIiwiYnVpbGRXaGVyZUNsYXVzZSIsInF1ZXJ5IiwiY2FzZUluc2Vuc2l0aXZlIiwicGF0dGVybnMiLCJ2YWx1ZXMiLCJzb3J0cyIsImlzQXJyYXlGaWVsZCIsImluaXRpYWxQYXR0ZXJuc0xlbmd0aCIsImZpZWxkVmFsdWUiLCIkZXhpc3RzIiwiYXV0aERhdGFNYXRjaCIsIm1hdGNoIiwiJGluIiwiJHJlZ2V4IiwiTUFYX0lOVF9QTFVTX09ORSIsImNsYXVzZXMiLCJjbGF1c2VWYWx1ZXMiLCJzdWJRdWVyeSIsImNsYXVzZSIsInBhdHRlcm4iLCJvck9yQW5kIiwibm90IiwiJG5lIiwiY29uc3RyYWludEZpZWxkTmFtZSIsIiRyZWxhdGl2ZVRpbWUiLCJJTlZBTElEX0pTT04iLCJwb2ludCIsImxvbmdpdHVkZSIsImxhdGl0dWRlIiwiJGVxIiwiaXNJbk9yTmluIiwiQXJyYXkiLCJpc0FycmF5IiwiJG5pbiIsImluUGF0dGVybnMiLCJhbGxvd051bGwiLCJsaXN0RWxlbSIsImxpc3RJbmRleCIsImNyZWF0ZUNvbnN0cmFpbnQiLCJiYXNlQXJyYXkiLCJub3RJbiIsIl8iLCJmbGF0TWFwIiwiZWx0IiwiJGFsbCIsImlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgiLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwiaSIsInByb2Nlc3NSZWdleFBhdHRlcm4iLCJzdWJzdHJpbmciLCIkY29udGFpbmVkQnkiLCJhcnIiLCIkdGV4dCIsInNlYXJjaCIsIiRzZWFyY2giLCJsYW5ndWFnZSIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwiJG5lYXJTcGhlcmUiLCJkaXN0YW5jZSIsIiRtYXhEaXN0YW5jZSIsImRpc3RhbmNlSW5LTSIsIiR3aXRoaW4iLCIkYm94IiwiYm94IiwibGVmdCIsImJvdHRvbSIsInJpZ2h0IiwidG9wIiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJjZW50ZXJTcGhlcmUiLCJHZW9Qb2ludCIsIkdlb1BvaW50Q29kZXIiLCJpc1ZhbGlkSlNPTiIsIl92YWxpZGF0ZSIsImlzTmFOIiwiJHBvbHlnb24iLCJwb2x5Z29uIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCIkZ2VvSW50ZXJzZWN0cyIsIiRwb2ludCIsInJlZ2V4Iiwib3BlcmF0b3IiLCJvcHRzIiwiJG9wdGlvbnMiLCJyZW1vdmVXaGl0ZVNwYWNlIiwiY29udmVydFBvbHlnb25Ub1NRTCIsImNtcCIsInBnQ29tcGFyYXRvciIsInBhcnNlclJlc3VsdCIsInJlbGF0aXZlVGltZVRvRGF0ZSIsInN0YXR1cyIsInJlc3VsdCIsImNvbnNvbGUiLCJlcnJvciIsImluZm8iLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIm9wdGlvbnMiLCJfY29sbGVjdGlvblByZWZpeCIsImVuYWJsZVNjaGVtYUhvb2tzIiwic2NoZW1hQ2FjaGVUdGwiLCJkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24iLCJjbGllbnQiLCJwZ3AiLCJjcmVhdGVDbGllbnQiLCJfY2xpZW50IiwiX29uY2hhbmdlIiwiX3BncCIsIl91dWlkIiwidXVpZHY0IiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIndhdGNoIiwiY2FsbGJhY2siLCJjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5IiwiYW5hbHl6ZSIsImhhbmRsZVNodXRkb3duIiwiX3N0cmVhbSIsImRvbmUiLCIkcG9vbCIsImVuZCIsIl9saXN0ZW5Ub1NjaGVtYSIsImNvbm5lY3QiLCJkaXJlY3QiLCJvbiIsImRhdGEiLCJwYXlsb2FkIiwicGFyc2UiLCJzZW5kZXJJZCIsIm5vbmUiLCJfbm90aWZ5U2NoZW1hQ2hhbmdlIiwiY2F0Y2giLCJfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyIsImNvbm4iLCJjbGFzc0V4aXN0cyIsIm9uZSIsImEiLCJleGlzdHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwidGFzayIsInQiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJzZWxmIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfaWRfIiwiX2lkIiwiZGVsZXRlZEluZGV4ZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJJTlZBTElEX1FVRVJZIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidHgiLCJjcmVhdGVJbmRleGVzIiwiZSIsImNvbHVtbkRvZXNOb3RFeGlzdEVycm9yIiwiZXJyb3JzIiwiY29kZSIsImRyb3BJbmRleGVzIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsImNyZWF0ZVRhYmxlIiwiZXJyIiwiZGV0YWlsIiwiRFVQTElDQVRFX1ZBTFVFIiwidmFsdWVzQXJyYXkiLCJwYXR0ZXJuc0FycmF5IiwiYXNzaWduIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsInJlbGF0aW9ucyIsInBhcnNlVHlwZSIsInFzIiwiYmF0Y2giLCJqb2luVGFibGUiLCJzY2hlbWFVcGdyYWRlIiwiY29sdW1ucyIsImNvbHVtbl9uYW1lIiwibmV3Q29sdW1ucyIsImZpbHRlciIsIml0ZW0iLCJhZGRGaWVsZElmTm90RXhpc3RzIiwicG9zdGdyZXNUeXBlIiwiYW55IiwicGF0aCIsInVwZGF0ZUZpZWxkT3B0aW9ucyIsImRlbGV0ZUNsYXNzIiwib3BlcmF0aW9ucyIsInJlc3BvbnNlIiwiaGVscGVycyIsInRoZW4iLCJkZWxldGVBbGxDbGFzc2VzIiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJyZXN1bHRzIiwiam9pbnMiLCJyZWR1Y2UiLCJjbGFzc2VzIiwicXVlcmllcyIsImRlbGV0ZUZpZWxkcyIsImZpZWxkTmFtZXMiLCJpZHgiLCJnZXRBbGxDbGFzc2VzIiwicm93IiwiZ2V0Q2xhc3MiLCJjcmVhdGVPYmplY3QiLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbHVtbnNBcnJheSIsImdlb1BvaW50cyIsImF1dGhEYXRhQWxyZWFkeUV4aXN0cyIsImF1dGhEYXRhIiwicHJvdmlkZXIiLCJwb3AiLCJpbml0aWFsVmFsdWVzIiwidmFsIiwidGVybWluYXRpb24iLCJnZW9Qb2ludHNJbmplY3RzIiwibCIsImNvbHVtbnNQYXR0ZXJuIiwiY29sIiwidmFsdWVzUGF0dGVybiIsInByb21pc2UiLCJvcHMiLCJ1bmRlcmx5aW5nRXJyb3IiLCJjb25zdHJhaW50IiwibWF0Y2hlcyIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5Iiwid2hlcmUiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiZmluZE9uZUFuZFVwZGF0ZSIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBkYXRlUGF0dGVybnMiLCJvcmlnaW5hbFVwZGF0ZSIsImRvdE5vdGF0aW9uT3B0aW9ucyIsImdlbmVyYXRlIiwianNvbmIiLCJsYXN0S2V5IiwiZmllbGROYW1lSW5kZXgiLCJzdHIiLCJhbW91bnQiLCJvYmplY3RzIiwia2V5c1RvSW5jcmVtZW50IiwiayIsImluY3JlbWVudFBhdHRlcm5zIiwiYyIsImtleXNUb0RlbGV0ZSIsImRlbGV0ZVBhdHRlcm5zIiwicCIsInVwZGF0ZU9iamVjdCIsImV4cGVjdGVkVHlwZSIsInJlamVjdCIsIndoZXJlQ2xhdXNlIiwidXBzZXJ0T25lT2JqZWN0IiwiY3JlYXRlVmFsdWUiLCJza2lwIiwibGltaXQiLCJzb3J0IiwiZXhwbGFpbiIsImhhc0xpbWl0IiwiaGFzU2tpcCIsIndoZXJlUGF0dGVybiIsImxpbWl0UGF0dGVybiIsInNraXBQYXR0ZXJuIiwic29ydFBhdHRlcm4iLCJzb3J0Q29weSIsInNvcnRpbmciLCJ0cmFuc2Zvcm1LZXkiLCJtZW1vIiwib3JpZ2luYWxRdWVyeSIsInBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdCIsInRhcmdldENsYXNzIiwieSIsIngiLCJjb29yZHMiLCJwYXJzZUZsb2F0IiwiY3JlYXRlZEF0IiwidG9JU09TdHJpbmciLCJ1cGRhdGVkQXQiLCJleHBpcmVzQXQiLCJlbnN1cmVVbmlxdWVuZXNzIiwiY29uc3RyYWludE5hbWUiLCJjb25zdHJhaW50UGF0dGVybnMiLCJtZXNzYWdlIiwicmVhZFByZWZlcmVuY2UiLCJlc3RpbWF0ZSIsImFwcHJveGltYXRlX3Jvd19jb3VudCIsImRpc3RpbmN0IiwiY29sdW1uIiwiaXNOZXN0ZWQiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybWVyIiwiY2hpbGQiLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsImhpbnQiLCJjb3VudEZpZWxkIiwiZ3JvdXBWYWx1ZXMiLCJncm91cFBhdHRlcm4iLCJzdGFnZSIsIiRncm91cCIsImdyb3VwQnlGaWVsZHMiLCJhbGlhcyIsInNvdXJjZSIsIm9wZXJhdGlvbiIsIiRzdW0iLCIkbWF4IiwiJG1pbiIsIiRhdmciLCIkcHJvamVjdCIsIiRtYXRjaCIsIiRvciIsImNvbGxhcHNlIiwiZWxlbWVudCIsIm1hdGNoUGF0dGVybnMiLCIkbGltaXQiLCIkc2tpcCIsIiRzb3J0Iiwib3JkZXIiLCJ0cmltIiwiQm9vbGVhbiIsInBhcnNlSW50IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInByb21pc2VzIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiYWxsIiwic3FsIiwibWlzYyIsImpzb25PYmplY3RTZXRLZXlzIiwiYXJyYXkiLCJhZGQiLCJhZGRVbmlxdWUiLCJyZW1vdmUiLCJjb250YWluc0FsbCIsImNvbnRhaW5zQWxsUmVnZXgiLCJjb250YWlucyIsImN0eCIsImR1cmF0aW9uIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZ2V0SW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwidXBkYXRlRXN0aW1hdGVkQ291bnQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiZGVmYXVsdEluZGV4TmFtZSIsImluZGV4TmFtZU9wdGlvbnMiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwiZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyIsImRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24iLCJ0dGxPcHRpb25zIiwidHRsIiwidW5pcXVlIiwiYXIiLCJmb3VuZEluZGV4IiwicHQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlbmRzV2l0aCIsInJlcGxhY2UiLCJzIiwic3RhcnRzV2l0aCIsImxpdGVyYWxpemVSZWdleFBhcnQiLCJpc1N0YXJ0c1dpdGhSZWdleCIsImZpcnN0VmFsdWVzSXNSZWdleCIsInNvbWUiLCJjcmVhdGVMaXRlcmFsUmVnZXgiLCJyZW1haW5pbmciLCJSZWdFeHAiLCJtYXRjaGVyMSIsInJlc3VsdDEiLCJwcmVmaXgiLCJtYXRjaGVyMiIsInJlc3VsdDIiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICcuL1Bvc3RncmVzQ2xpZW50Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCBzcWwgZnJvbSAnLi9zcWwnO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi8uLi8uLi9VdGlscycpO1xuXG5jb25zdCBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IgPSAnNDJQMDEnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yID0gJzQyUDA3JztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IgPSAnNDI3MDEnO1xuY29uc3QgUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IgPSAnNDI3MDMnO1xuY29uc3QgUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yID0gJzIzNTA1JztcbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uLy4uLy4uL2xvZ2dlcicpO1xuXG5jb25zdCBkZWJ1ZyA9IGZ1bmN0aW9uICguLi5hcmdzOiBhbnkpIHtcbiAgYXJncyA9IFsnUEc6ICcgKyBhcmd1bWVudHNbMF1dLmNvbmNhdChhcmdzLnNsaWNlKDEsIGFyZ3MubGVuZ3RoKSk7XG4gIGNvbnN0IGxvZyA9IGxvZ2dlci5nZXRMb2dnZXIoKTtcbiAgbG9nLmRlYnVnLmFwcGx5KGxvZywgYXJncyk7XG59O1xuXG5jb25zdCBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSA9IHR5cGUgPT4ge1xuICBzd2l0Y2ggKHR5cGUudHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ3BvaW50JztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgaWYgKHR5cGUuY29udGVudHMgJiYgdHlwZS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJykge1xuICAgICAgICByZXR1cm4gJ3RleHRbXSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ2pzb25iJztcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgYG5vIHR5cGUgZm9yICR7SlNPTi5zdHJpbmdpZnkodHlwZSl9IHlldGA7XG4gIH1cbn07XG5cbmNvbnN0IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciA9IHtcbiAgJGd0OiAnPicsXG4gICRsdDogJzwnLFxuICAkZ3RlOiAnPj0nLFxuICAkbHRlOiAnPD0nLFxufTtcblxuY29uc3QgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzID0ge1xuICAkZGF5T2ZNb250aDogJ0RBWScsXG4gICRkYXlPZldlZWs6ICdET1cnLFxuICAkZGF5T2ZZZWFyOiAnRE9ZJyxcbiAgJGlzb0RheU9mV2VlazogJ0lTT0RPVycsXG4gICRpc29XZWVrWWVhcjogJ0lTT1lFQVInLFxuICAkaG91cjogJ0hPVVInLFxuICAkbWludXRlOiAnTUlOVVRFJyxcbiAgJHNlY29uZDogJ1NFQ09ORCcsXG4gICRtaWxsaXNlY29uZDogJ01JTExJU0VDT05EUycsXG4gICRtb250aDogJ01PTlRIJyxcbiAgJHdlZWs6ICdXRUVLJyxcbiAgJHllYXI6ICdZRUFSJyxcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5pc287XG4gICAgfVxuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlID0gdmFsdWUgPT4ge1xuICBjb25zdCBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlKTtcbiAgbGV0IGNhc3RUeXBlO1xuICBzd2l0Y2ggKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIGNhc3RUeXBlID0gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICBjYXN0VHlwZSA9ICdib29sZWFuJztcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjYXN0VHlwZSA9IHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gY2FzdFR5cGU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuLy8gRHVwbGljYXRlIGZyb20gdGhlbiBtb25nbyBhZGFwdGVyLi4uXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGdldDoge30sXG4gIGNvdW50OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmNvbnN0IHRvUGFyc2VTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cbiAgaWYgKHNjaGVtYS5maWVsZHMpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICB9XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGlmIChzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5zY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH07XG4gIH1cbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKHNjaGVtYS5pbmRleGVzKSB7XG4gICAgaW5kZXhlcyA9IHsgLi4uc2NoZW1hLmluZGV4ZXMgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXMsXG4gIH07XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGhhbmRsZURvdEZpZWxkcyA9IG9iamVjdCA9PiB7XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgb2JqZWN0W2ZpcnN0XSA9IG9iamVjdFtmaXJzdF0gfHwge307XG4gICAgICBsZXQgY3VycmVudE9iaiA9IG9iamVjdFtmaXJzdF07XG4gICAgICBsZXQgbmV4dDtcbiAgICAgIGxldCB2YWx1ZSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHZhbHVlID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgIHdoaWxlICgobmV4dCA9IGNvbXBvbmVudHMuc2hpZnQoKSkpIHtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgICBjdXJyZW50T2JqW25leHRdID0gY3VycmVudE9ialtuZXh0XSB8fCB7fTtcbiAgICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRPYmogPSBjdXJyZW50T2JqW25leHRdO1xuICAgICAgfVxuICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyA9IGZpZWxkTmFtZSA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKS5tYXAoKGNtcHQsIGluZGV4KSA9PiB7XG4gICAgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICByZXR1cm4gYFwiJHtjbXB0fVwiYDtcbiAgICB9XG4gICAgcmV0dXJuIGAnJHtjbXB0fSdgO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgcmV0dXJuIGBcIiR7ZmllbGROYW1lfVwiYDtcbiAgfVxuICBjb25zdCBjb21wb25lbnRzID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKTtcbiAgbGV0IG5hbWUgPSBjb21wb25lbnRzLnNsaWNlKDAsIGNvbXBvbmVudHMubGVuZ3RoIC0gMSkuam9pbignLT4nKTtcbiAgbmFtZSArPSAnLT4+JyArIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIG5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmICh0eXBlb2YgZmllbGROYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBmaWVsZE5hbWU7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfY3JlYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ2NyZWF0ZWRBdCc7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfdXBkYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ3VwZGF0ZWRBdCc7XG4gIH1cbiAgcmV0dXJuIGZpZWxkTmFtZS5zdWJzdHIoMSk7XG59O1xuXG5jb25zdCB2YWxpZGF0ZUtleXMgPSBvYmplY3QgPT4ge1xuICBpZiAodHlwZW9mIG9iamVjdCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB2YWxpZGF0ZUtleXMob2JqZWN0W2tleV0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoa2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFJldHVybnMgdGhlIGxpc3Qgb2Ygam9pbiB0YWJsZXMgb24gYSBzY2hlbWFcbmNvbnN0IGpvaW5UYWJsZXNGb3JTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGlmIChzY2hlbWEpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChgX0pvaW46JHtmaWVsZH06JHtzY2hlbWEuY2xhc3NOYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBsaXN0O1xufTtcblxuaW50ZXJmYWNlIFdoZXJlQ2xhdXNlIHtcbiAgcGF0dGVybjogc3RyaW5nO1xuICB2YWx1ZXM6IEFycmF5PGFueT47XG4gIHNvcnRzOiBBcnJheTxhbnk+O1xufVxuXG5jb25zdCBidWlsZFdoZXJlQ2xhdXNlID0gKHsgc2NoZW1hLCBxdWVyeSwgaW5kZXgsIGNhc2VJbnNlbnNpdGl2ZSB9KTogV2hlcmVDbGF1c2UgPT4ge1xuICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICBsZXQgdmFsdWVzID0gW107XG4gIGNvbnN0IHNvcnRzID0gW107XG5cbiAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpbml0aWFsUGF0dGVybnNMZW5ndGggPSBwYXR0ZXJucy5sZW5ndGg7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IHF1ZXJ5W2ZpZWxkTmFtZV07XG5cbiAgICAvLyBub3RoaW5nIGluIHRoZSBzY2hlbWEsIGl0J3MgZ29ubmEgYmxvdyB1cFxuICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAvLyBhcyBpdCB3b24ndCBleGlzdFxuICAgICAgaWYgKGZpZWxkVmFsdWUgJiYgZmllbGRWYWx1ZS4kZXhpc3RzID09PSBmYWxzZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAvLyBUT0RPOiBIYW5kbGUgcXVlcnlpbmcgYnkgX2F1dGhfZGF0YV9wcm92aWRlciwgYXV0aERhdGEgaXMgc3RvcmVkIGluIGF1dGhEYXRhIGZpZWxkXG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKGNhc2VJbnNlbnNpdGl2ZSAmJiAoZmllbGROYW1lID09PSAndXNlcm5hbWUnIHx8IGZpZWxkTmFtZSA9PT0gJ2VtYWlsJykpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYExPV0VSKCQke2luZGV4fTpuYW1lKSA9IExPV0VSKCQke2luZGV4ICsgMX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgbGV0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKG5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRpbikge1xuICAgICAgICAgIG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpyYXcpOjpqc29uYiBAPiAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGluKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgICAgIC8vIEhhbmRsZSBsYXRlclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgPSAkJHtpbmRleCArIDF9Ojp0ZXh0YCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCBmaWVsZFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIC8vIENhbid0IGNhc3QgYm9vbGVhbiB0byBkb3VibGUgcHJlY2lzaW9uXG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnTnVtYmVyJykge1xuICAgICAgICAvLyBTaG91bGQgYWx3YXlzIHJldHVybiB6ZXJvIHJlc3VsdHNcbiAgICAgICAgY29uc3QgTUFYX0lOVF9QTFVTX09ORSA9IDkyMjMzNzIwMzY4NTQ3NzU4MDg7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgTUFYX0lOVF9QTFVTX09ORSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgfVxuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKFsnJG9yJywgJyRub3InLCAnJGFuZCddLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgIGNvbnN0IGNsYXVzZXMgPSBbXTtcbiAgICAgIGNvbnN0IGNsYXVzZVZhbHVlcyA9IFtdO1xuICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKHN1YlF1ZXJ5ID0+IHtcbiAgICAgICAgY29uc3QgY2xhdXNlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIHF1ZXJ5OiBzdWJRdWVyeSxcbiAgICAgICAgICBpbmRleCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2xhdXNlLnBhdHRlcm4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsYXVzZXMucHVzaChjbGF1c2UucGF0dGVybik7XG4gICAgICAgICAgY2xhdXNlVmFsdWVzLnB1c2goLi4uY2xhdXNlLnZhbHVlcyk7XG4gICAgICAgICAgaW5kZXggKz0gY2xhdXNlLnZhbHVlcy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvck9yQW5kID0gZmllbGROYW1lID09PSAnJGFuZCcgPyAnIEFORCAnIDogJyBPUiAnO1xuICAgICAgY29uc3Qgbm90ID0gZmllbGROYW1lID09PSAnJG5vcicgPyAnIE5PVCAnIDogJyc7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSgke2NsYXVzZXMuam9pbihvck9yQW5kKX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaCguLi5jbGF1c2VWYWx1ZXMpO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuJG5lID0gSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWUuJG5lXSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYE5PVCBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGlmIG5vdCBudWxsLCB3ZSBuZWVkIHRvIG1hbnVhbGx5IGV4Y2x1ZGUgbnVsbFxuICAgICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSkgT1IgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTClgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kbmUpO1xuICAgICAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gY2FzdFR5cGVcbiAgICAgICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPD4gJCR7aW5kZXggKyAxfSBPUiAke2NvbnN0cmFpbnRGaWVsZE5hbWV9IElTIE5VTEwpYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmUgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJG5lLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVE9ETzogc3VwcG9ydCBhcnJheXNcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRlcSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kZXEgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kZXEpO1xuICAgICAgICAgIGNvbnN0IGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSA9ICQke2luZGV4Kyt9YCk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGVxID09PSAnb2JqZWN0JyAmJiBmaWVsZFZhbHVlLiRlcS4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBpc0luT3JOaW4gPSBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSB8fCBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJG5pbik7XG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgJiZcbiAgICAgIGlzQXJyYXlGaWVsZCAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMudHlwZSA9PT0gJ1N0cmluZydcbiAgICApIHtcbiAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgIGxldCBhbGxvd051bGwgPSBmYWxzZTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBmaWVsZFZhbHVlLiRpbi5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgIGlmIChsaXN0RWxlbSA9PT0gbnVsbCkge1xuICAgICAgICAgIGFsbG93TnVsbCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4IC0gKGFsbG93TnVsbCA/IDEgOiAwKX1gKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoYWxsb3dOdWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06bmFtZSBJUyBOVUxMIE9SICQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICB9IGVsc2UgaWYgKGlzSW5Pck5pbikge1xuICAgICAgdmFyIGNyZWF0ZUNvbnN0cmFpbnQgPSAoYmFzZUFycmF5LCBub3RJbikgPT4ge1xuICAgICAgICBjb25zdCBub3QgPSBub3RJbiA/ICcgTk9UICcgOiAnJztcbiAgICAgICAgaWYgKGJhc2VBcnJheS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9IGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShiYXNlQXJyYXkpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEhhbmRsZSBOZXN0ZWQgRG90IE5vdGF0aW9uIEFib3ZlXG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICBiYXNlQXJyYXkuZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICAgICAgICBpZiAobGlzdEVsZW0gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleH1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke25vdH0gSU4gKCR7aW5QYXR0ZXJucy5qb2luKCl9KWApO1xuICAgICAgICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIW5vdEluKSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgICAgaW5kZXggPSBpbmRleCArIDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGFycmF5XG4gICAgICAgICAgaWYgKG5vdEluKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMScpOyAvLyBSZXR1cm4gYWxsIHZhbHVlc1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMicpOyAvLyBSZXR1cm4gbm8gdmFsdWVzXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJGluLCBlbHQgPT4gZWx0KSxcbiAgICAgICAgICBmYWxzZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5pbikge1xuICAgICAgICBjcmVhdGVDb25zdHJhaW50KFxuICAgICAgICAgIF8uZmxhdE1hcChmaWVsZFZhbHVlLiRuaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRpbiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGluIHZhbHVlJyk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkbmluIHZhbHVlJyk7XG4gICAgfVxuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSAmJiBpc0FycmF5RmllbGQpIHtcbiAgICAgIGlmIChpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgaWYgKCFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgZmllbGRWYWx1ZS4kYWxsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRWYWx1ZS4kYWxsLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKGZpZWxkVmFsdWUuJGFsbFtpXS4kcmVnZXgpO1xuICAgICAgICAgIGZpZWxkVmFsdWUuJGFsbFtpXSA9IHZhbHVlLnN1YnN0cmluZygxKSArICclJztcbiAgICAgICAgfVxuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGxfcmVnZXgoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnNfYWxsKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9Ojpqc29uYilgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS4kYWxsKSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kYWxsLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRhbGxbMF0ub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXhpc3RzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJGV4aXN0cy4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRleGlzdHMpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRjb250YWluZWRCeSkge1xuICAgICAgY29uc3QgYXJyID0gZmllbGRWYWx1ZS4kY29udGFpbmVkQnk7XG4gICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkY29udGFpbmVkQnk6IHNob3VsZCBiZSBhbiBhcnJheWApO1xuICAgICAgfVxuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA8QCAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShhcnIpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHRleHQpIHtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IGZpZWxkVmFsdWUuJHRleHQuJHNlYXJjaDtcbiAgICAgIGxldCBsYW5ndWFnZSA9ICdlbmdsaXNoJztcbiAgICAgIGlmICh0eXBlb2Ygc2VhcmNoICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YCk7XG4gICAgICB9XG4gICAgICBpZiAoIXNlYXJjaC4kdGVybSB8fCB0eXBlb2Ygc2VhcmNoLiR0ZXJtICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRsYW5ndWFnZSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGxhbmd1YWdlKSB7XG4gICAgICAgIGxhbmd1YWdlID0gc2VhcmNoLiRsYW5ndWFnZTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSBub3Qgc3VwcG9ydGVkLCBwbGVhc2UgdXNlICRyZWdleCBvciBjcmVhdGUgYSBzZXBhcmF0ZSBsb3dlciBjYXNlIGNvbHVtbi5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSAtIGZhbHNlIG5vdCBzdXBwb3J0ZWQsIGluc3RhbGwgUG9zdGdyZXMgVW5hY2NlbnQgRXh0ZW5zaW9uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYHRvX3RzdmVjdG9yKCQke2luZGV4fSwgJCR7aW5kZXggKyAxfTpuYW1lKSBAQCB0b190c3F1ZXJ5KCQke2luZGV4ICsgMn0sICQke2luZGV4ICsgM30pYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGxhbmd1YWdlLCBmaWVsZE5hbWUsIGxhbmd1YWdlLCBzZWFyY2guJHRlcm0pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kbmVhclNwaGVyZSkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRuZWFyU3BoZXJlO1xuICAgICAgY29uc3QgZGlzdGFuY2UgPSBmaWVsZFZhbHVlLiRtYXhEaXN0YW5jZTtcbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSA8PSAkJHtpbmRleCArIDN9YFxuICAgICAgKTtcbiAgICAgIHNvcnRzLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIEFTQ2BcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR3aXRoaW4gJiYgZmllbGRWYWx1ZS4kd2l0aGluLiRib3gpIHtcbiAgICAgIGNvbnN0IGJveCA9IGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94O1xuICAgICAgY29uc3QgbGVmdCA9IGJveFswXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCBib3R0b20gPSBib3hbMF0ubGF0aXR1ZGU7XG4gICAgICBjb25zdCByaWdodCA9IGJveFsxXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCB0b3AgPSBib3hbMV0ubGF0aXR1ZGU7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpib3hgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgoJHtsZWZ0fSwgJHtib3R0b219KSwgKCR7cmlnaHR9LCAke3RvcH0pKWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlKSB7XG4gICAgICBjb25zdCBjZW50ZXJTcGhlcmUgPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZTtcbiAgICAgIGlmICghKGNlbnRlclNwaGVyZSBpbnN0YW5jZW9mIEFycmF5KSB8fCBjZW50ZXJTcGhlcmUubGVuZ3RoIDwgMikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQgYW5kIGRpc3RhbmNlJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gR2V0IHBvaW50LCBjb252ZXJ0IHRvIGdlbyBwb2ludCBpZiBuZWNlc3NhcnkgYW5kIHZhbGlkYXRlXG4gICAgICBsZXQgcG9pbnQgPSBjZW50ZXJTcGhlcmVbMF07XG4gICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgIH0gZWxzZSBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGdlbyBwb2ludCBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgLy8gR2V0IGRpc3RhbmNlIGFuZCB2YWxpZGF0ZVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSBjZW50ZXJTcGhlcmVbMV07XG4gICAgICBpZiAoaXNOYU4oZGlzdGFuY2UpIHx8IGRpc3RhbmNlIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBkaXN0YW5jZSBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbikge1xuICAgICAgY29uc3QgcG9seWdvbiA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbjtcbiAgICAgIGxldCBwb2ludHM7XG4gICAgICBpZiAodHlwZW9mIHBvbHlnb24gPT09ICdvYmplY3QnICYmIHBvbHlnb24uX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgaWYgKCFwb2x5Z29uLmNvb3JkaW5hdGVzIHx8IHBvbHlnb24uY29vcmRpbmF0ZXMubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgUG9seWdvbi5jb29yZGluYXRlcyBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIGxvbi9sYXQgcGFpcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uLmNvb3JkaW5hdGVzO1xuICAgICAgfSBlbHNlIGlmIChwb2x5Z29uIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBHZW9Qb2ludHMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBcImJhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgYmUgUG9seWdvbiBvYmplY3Qgb3IgQXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQnc1wiXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwb2ludHMgPSBwb2ludHNcbiAgICAgICAgLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICAgIHJldHVybiBgKCR7cG9pbnRbMF19LCAke3BvaW50WzFdfSlgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGdlb1dpdGhpbiB2YWx1ZScpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oJywgJyk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludHN9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMgJiYgZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQpIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQ7XG4gICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9JbnRlcnNlY3QgdmFsdWU7ICRwb2ludCBzaG91bGQgYmUgR2VvUG9pbnQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9seWdvbiBAPiAkJHtpbmRleCArIDF9Ojpwb2ludGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgbGV0IHJlZ2V4ID0gZmllbGRWYWx1ZS4kcmVnZXg7XG4gICAgICBsZXQgb3BlcmF0b3IgPSAnfic7XG4gICAgICBjb25zdCBvcHRzID0gZmllbGRWYWx1ZS4kb3B0aW9ucztcbiAgICAgIGlmIChvcHRzKSB7XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ2knKSA+PSAwKSB7XG4gICAgICAgICAgb3BlcmF0b3IgPSAnfionO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ3gnKSA+PSAwKSB7XG4gICAgICAgICAgcmVnZXggPSByZW1vdmVXaGl0ZVNwYWNlKHJlZ2V4KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBuYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgIHJlZ2V4ID0gcHJvY2Vzc1JlZ2V4UGF0dGVybihyZWdleCk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgJHtvcGVyYXRvcn0gJyQke2luZGV4ICsgMX06cmF3J2ApO1xuICAgICAgdmFsdWVzLnB1c2gobmFtZSwgcmVnZXgpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZV0pKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5pc28pO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGluZGV4ICs9IDM7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgIGlmIChmaWVsZFZhbHVlW2NtcF0gfHwgZmllbGRWYWx1ZVtjbXBdID09PSAwKSB7XG4gICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICBsZXQgY29uc3RyYWludEZpZWxkTmFtZTtcbiAgICAgICAgbGV0IHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZVtjbXBdKTtcblxuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlW2NtcF0pO1xuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHBvc3RncmVzVmFsdWUgPT09ICdvYmplY3QnICYmIHBvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlICE9PSAnRGF0ZScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggRGF0ZSBmaWVsZCdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHBhcnNlclJlc3VsdCA9IFV0aWxzLnJlbGF0aXZlVGltZVRvRGF0ZShwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWUpO1xuICAgICAgICAgICAgaWYgKHBhcnNlclJlc3VsdC5zdGF0dXMgPT09ICdzdWNjZXNzJykge1xuICAgICAgICAgICAgICBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHBhcnNlclJlc3VsdC5yZXN1bHQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igd2hpbGUgcGFyc2luZyByZWxhdGl2ZSBkYXRlJywgcGFyc2VyUmVzdWx0KTtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICBgYmFkICRyZWxhdGl2ZVRpbWUgKCR7cG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lfSkgdmFsdWUuICR7cGFyc2VyUmVzdWx0LmluZm99YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gYCQke2luZGV4Kyt9Om5hbWVgO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWVzLnB1c2gocG9zdGdyZXNWYWx1ZSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCR7Y29uc3RyYWludEZpZWxkTmFtZX0gJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4Kyt9YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID09PSBwYXR0ZXJucy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB0aGlzIHF1ZXJ5IHR5cGUgeWV0ICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgdmFsdWVzID0gdmFsdWVzLm1hcCh0cmFuc2Zvcm1WYWx1ZSk7XG4gIHJldHVybiB7IHBhdHRlcm46IHBhdHRlcm5zLmpvaW4oJyBBTkQgJyksIHZhbHVlcywgc29ydHMgfTtcbn07XG5cbmV4cG9ydCBjbGFzcyBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICBjYW5Tb3J0T25Kb2luVGFibGVzOiBib29sZWFuO1xuICBlbmFibGVTY2hlbWFIb29rczogYm9vbGVhbjtcblxuICAvLyBQcml2YXRlXG4gIF9jb2xsZWN0aW9uUHJlZml4OiBzdHJpbmc7XG4gIF9jbGllbnQ6IGFueTtcbiAgX29uY2hhbmdlOiBhbnk7XG4gIF9wZ3A6IGFueTtcbiAgX3N0cmVhbTogYW55O1xuICBfdXVpZDogYW55O1xuICBzY2hlbWFDYWNoZVR0bDogP251bWJlcjtcbiAgZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uOiBib29sZWFuO1xuXG4gIGNvbnN0cnVjdG9yKHsgdXJpLCBjb2xsZWN0aW9uUHJlZml4ID0gJycsIGRhdGFiYXNlT3B0aW9ucyA9IHt9IH06IGFueSkge1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7IC4uLmRhdGFiYXNlT3B0aW9ucyB9O1xuICAgIHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggPSBjb2xsZWN0aW9uUHJlZml4O1xuICAgIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MgPSAhIWRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcztcbiAgICB0aGlzLnNjaGVtYUNhY2hlVHRsID0gZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsO1xuICAgIHRoaXMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uID0gISFkYXRhYmFzZU9wdGlvbnMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIFsnZW5hYmxlU2NoZW1hSG9va3MnLCAnc2NoZW1hQ2FjaGVUdGwnLCAnZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uJ10pIHtcbiAgICAgIGRlbGV0ZSBvcHRpb25zW2tleV07XG4gICAgfVxuXG4gICAgY29uc3QgeyBjbGllbnQsIHBncCB9ID0gY3JlYXRlQ2xpZW50KHVyaSwgb3B0aW9ucyk7XG4gICAgdGhpcy5fY2xpZW50ID0gY2xpZW50O1xuICAgIHRoaXMuX29uY2hhbmdlID0gKCkgPT4geyB9O1xuICAgIHRoaXMuX3BncCA9IHBncDtcbiAgICB0aGlzLl91dWlkID0gdXVpZHY0KCk7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gZmFsc2U7XG4gIH1cblxuICB3YXRjaChjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIHRoaXMuX29uY2hhbmdlID0gY2FsbGJhY2s7XG4gIH1cblxuICAvL05vdGUgdGhhdCBhbmFseXplPXRydWUgd2lsbCBydW4gdGhlIHF1ZXJ5LCBleGVjdXRpbmcgSU5TRVJUUywgREVMRVRFUywgZXRjLlxuICBjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KHF1ZXJ5OiBzdHJpbmcsIGFuYWx5emU6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIGlmIChhbmFseXplKSB7XG4gICAgICByZXR1cm4gJ0VYUExBSU4gKEFOQUxZWkUsIEZPUk1BVCBKU09OKSAnICsgcXVlcnk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAodGhpcy5fc3RyZWFtKSB7XG4gICAgICB0aGlzLl9zdHJlYW0uZG9uZSgpO1xuICAgICAgZGVsZXRlIHRoaXMuX3N0cmVhbTtcbiAgICB9XG4gICAgaWYgKCF0aGlzLl9jbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5fY2xpZW50LiRwb29sLmVuZCgpO1xuICB9XG5cbiAgYXN5bmMgX2xpc3RlblRvU2NoZW1hKCkge1xuICAgIGlmICghdGhpcy5fc3RyZWFtICYmIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MpIHtcbiAgICAgIHRoaXMuX3N0cmVhbSA9IGF3YWl0IHRoaXMuX2NsaWVudC5jb25uZWN0KHsgZGlyZWN0OiB0cnVlIH0pO1xuICAgICAgdGhpcy5fc3RyZWFtLmNsaWVudC5vbignbm90aWZpY2F0aW9uJywgZGF0YSA9PiB7XG4gICAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKGRhdGEucGF5bG9hZCk7XG4gICAgICAgIGlmIChwYXlsb2FkLnNlbmRlcklkICE9PSB0aGlzLl91dWlkKSB7XG4gICAgICAgICAgdGhpcy5fb25jaGFuZ2UoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBhd2FpdCB0aGlzLl9zdHJlYW0ubm9uZSgnTElTVEVOICQxficsICdzY2hlbWEuY2hhbmdlJyk7XG4gICAgfVxuICB9XG5cbiAgX25vdGlmeVNjaGVtYUNoYW5nZSgpIHtcbiAgICBpZiAodGhpcy5fc3RyZWFtKSB7XG4gICAgICB0aGlzLl9zdHJlYW1cbiAgICAgICAgLm5vbmUoJ05PVElGWSAkMX4sICQyJywgWydzY2hlbWEuY2hhbmdlJywgeyBzZW5kZXJJZDogdGhpcy5fdXVpZCB9XSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIE5vdGlmeTonLCBlcnJvcik7IC8vIHVubGlrZWx5IHRvIGV2ZXIgaGFwcGVuXG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIF9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBhd2FpdCBjb25uXG4gICAgICAubm9uZShcbiAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIFwiX1NDSEVNQVwiICggXCJjbGFzc05hbWVcIiB2YXJDaGFyKDEyMCksIFwic2NoZW1hXCIganNvbmIsIFwiaXNQYXJzZUNsYXNzXCIgYm9vbCwgUFJJTUFSWSBLRVkgKFwiY2xhc3NOYW1lXCIpICknXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5vbmUoXG4gICAgICAnU0VMRUNUIEVYSVNUUyAoU0VMRUNUIDEgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzIFdIRVJFIHRhYmxlX25hbWUgPSAkMSknLFxuICAgICAgW25hbWVdLFxuICAgICAgYSA9PiBhLmV4aXN0c1xuICAgICk7XG4gIH1cblxuICBhc3luYyBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSkge1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50YXNrKCdzZXQtY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsICdzY2hlbWEnLCAnY2xhc3NMZXZlbFBlcm1pc3Npb25zJywgSlNPTi5zdHJpbmdpZnkoQ0xQcyldO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICBgVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXNcbiAgICAgICk7XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyBzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRJbmRleGVzOiBhbnksXG4gICAgZXhpc3RpbmdJbmRleGVzOiBhbnkgPSB7fSxcbiAgICBmaWVsZHM6IGFueSxcbiAgICBjb25uOiA/YW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoc3VibWl0dGVkSW5kZXhlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0luZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZXhpc3RpbmdJbmRleGVzID0geyBfaWRfOiB7IF9pZDogMSB9IH07XG4gICAgfVxuICAgIGNvbnN0IGRlbGV0ZWRJbmRleGVzID0gW107XG4gICAgY29uc3QgaW5zZXJ0ZWRJbmRleGVzID0gW107XG4gICAgT2JqZWN0LmtleXMoc3VibWl0dGVkSW5kZXhlcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGBJbmRleCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBkZWxldGVkSW5kZXhlcy5wdXNoKG5hbWUpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAhdGhpcy5kaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24gJiZcbiAgICAgICAgICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGRzLCBrZXkpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICAgIGBGaWVsZCAke2tleX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBhZGQgaW5kZXguYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBleGlzdGluZ0luZGV4ZXNbbmFtZV0gPSBmaWVsZDtcbiAgICAgICAgaW5zZXJ0ZWRJbmRleGVzLnB1c2goe1xuICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgYXdhaXQgY29ubi50eCgnc2V0LWluZGV4ZXMtd2l0aC1zY2hlbWEtZm9ybWF0JywgYXN5bmMgdCA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAoaW5zZXJ0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBhd2FpdCBzZWxmLmNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lLCBpbnNlcnRlZEluZGV4ZXMsIHQpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbkRvZXNOb3RFeGlzdEVycm9yID0gZS5lcnJvcnM/LlswXT8uY29kZSA9PT0gJzQyNzAzJztcbiAgICAgICAgaWYgKGNvbHVtbkRvZXNOb3RFeGlzdEVycm9yICYmICF0aGlzLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbikge1xuICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChkZWxldGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGF3YWl0IHNlbGYuZHJvcEluZGV4ZXMoY2xhc3NOYW1lLCBkZWxldGVkSW5kZXhlcywgdCk7XG4gICAgICB9XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMScsXG4gICAgICAgIFtjbGFzc05hbWUsICdzY2hlbWEnLCAnaW5kZXhlcycsIEpTT04uc3RyaW5naWZ5KGV4aXN0aW5nSW5kZXhlcyldXG4gICAgICApO1xuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogP2FueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBwYXJzZVNjaGVtYSA9IGF3YWl0IGNvbm5cbiAgICAgIC50eCgnY3JlYXRlLWNsYXNzJywgYXN5bmMgdCA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMuY3JlYXRlVGFibGUoY2xhc3NOYW1lLCBzY2hlbWEsIHQpO1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ0lOU0VSVCBJTlRPIFwiX1NDSEVNQVwiIChcImNsYXNzTmFtZVwiLCBcInNjaGVtYVwiLCBcImlzUGFyc2VDbGFzc1wiKSBWQUxVRVMgKCQ8Y2xhc3NOYW1lPiwgJDxzY2hlbWE+LCB0cnVlKScsXG4gICAgICAgICAgeyBjbGFzc05hbWUsIHNjaGVtYSB9XG4gICAgICAgICk7XG4gICAgICAgIGF3YWl0IHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoY2xhc3NOYW1lLCBzY2hlbWEuaW5kZXhlcywge30sIHNjaGVtYS5maWVsZHMsIHQpO1xuICAgICAgICByZXR1cm4gdG9QYXJzZVNjaGVtYShzY2hlbWEpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJiBlcnIuZGV0YWlsLmluY2x1ZGVzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLCBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycjtcbiAgICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICAgIHJldHVybiBwYXJzZVNjaGVtYTtcbiAgfVxuXG4gIC8vIEp1c3QgY3JlYXRlIGEgdGFibGUsIGRvIG5vdCBpbnNlcnQgaW4gc2NoZW1hXG4gIGFzeW5jIGNyZWF0ZVRhYmxlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBkZWJ1ZygnY3JlYXRlVGFibGUnKTtcbiAgICBjb25zdCB2YWx1ZXNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHBhdHRlcm5zQXJyYXkgPSBbXTtcbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3QuYXNzaWduKHt9LCBzY2hlbWEuZmllbGRzKTtcbiAgICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgZmllbGRzLl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2ZhaWxlZF9sb2dpbl9jb3VudCA9IHsgdHlwZTogJ051bWJlcicgfTtcbiAgICAgIGZpZWxkcy5fcGVyaXNoYWJsZV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2hpc3RvcnkgPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgICB9XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBjb25zdCByZWxhdGlvbnMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhmaWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGNvbnN0IHBhcnNlVHlwZSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgLy8gU2tpcCB3aGVuIGl0J3MgYSByZWxhdGlvblxuICAgICAgLy8gV2UnbGwgY3JlYXRlIHRoZSB0YWJsZXMgbGF0ZXJcbiAgICAgIGlmIChwYXJzZVR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZWxhdGlvbnMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgcGFyc2VUeXBlLmNvbnRlbnRzID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgfVxuICAgICAgdmFsdWVzQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaChwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZShwYXJzZVR5cGUpKTtcbiAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgJCR7aW5kZXh9Om5hbWUgJCR7aW5kZXggKyAxfTpyYXdgKTtcbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgcGF0dGVybnNBcnJheS5wdXNoKGBQUklNQVJZIEtFWSAoJCR7aW5kZXh9Om5hbWUpYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMjtcbiAgICB9KTtcbiAgICBjb25zdCBxcyA9IGBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkMTpuYW1lICgke3BhdHRlcm5zQXJyYXkuam9pbigpfSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLnZhbHVlc0FycmF5XTtcblxuICAgIHJldHVybiBjb25uLnRhc2soJ2NyZWF0ZS10YWJsZScsIGFzeW5jIHQgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdC5ub25lKHFzLCB2YWx1ZXMpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIEVMU0U6IFRhYmxlIGFscmVhZHkgZXhpc3RzLCBtdXN0IGhhdmUgYmVlbiBjcmVhdGVkIGJ5IGEgZGlmZmVyZW50IHJlcXVlc3QuIElnbm9yZSB0aGUgZXJyb3IuXG4gICAgICB9XG4gICAgICBhd2FpdCB0LnR4KCdjcmVhdGUtdGFibGUtdHgnLCB0eCA9PiB7XG4gICAgICAgIHJldHVybiB0eC5iYXRjaChcbiAgICAgICAgICByZWxhdGlvbnMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gdHgubm9uZShcbiAgICAgICAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQ8am9pblRhYmxlOm5hbWU+IChcInJlbGF0ZWRJZFwiIHZhckNoYXIoMTIwKSwgXCJvd25pbmdJZFwiIHZhckNoYXIoMTIwKSwgUFJJTUFSWSBLRVkoXCJyZWxhdGVkSWRcIiwgXCJvd25pbmdJZFwiKSApJyxcbiAgICAgICAgICAgICAgeyBqb2luVGFibGU6IGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNjaGVtYVVwZ3JhZGUoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogYW55KSB7XG4gICAgZGVidWcoJ3NjaGVtYVVwZ3JhZGUnKTtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBhd2FpdCBjb25uLnRhc2soJ3NjaGVtYS11cGdyYWRlJywgYXN5bmMgdCA9PiB7XG4gICAgICBjb25zdCBjb2x1bW5zID0gYXdhaXQgdC5tYXAoXG4gICAgICAgICdTRUxFQ1QgY29sdW1uX25hbWUgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucyBXSEVSRSB0YWJsZV9uYW1lID0gJDxjbGFzc05hbWU+JyxcbiAgICAgICAgeyBjbGFzc05hbWUgfSxcbiAgICAgICAgYSA9PiBhLmNvbHVtbl9uYW1lXG4gICAgICApO1xuICAgICAgY29uc3QgbmV3Q29sdW1ucyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiBjb2x1bW5zLmluZGV4T2YoaXRlbSkgPT09IC0xKVxuICAgICAgICAubWFwKGZpZWxkTmFtZSA9PiBzZWxmLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkpO1xuXG4gICAgICBhd2FpdCB0LmJhdGNoKG5ld0NvbHVtbnMpO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIC8vIFRPRE86IE11c3QgYmUgcmV2aXNlZCBmb3IgaW52YWxpZCBsb2dpYy4uLlxuICAgIGRlYnVnKCdhZGRGaWVsZElmTm90RXhpc3RzJyk7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCdhZGQtZmllbGQtaWYtbm90LWV4aXN0cycsIGFzeW5jIHQgPT4ge1xuICAgICAgaWYgKHR5cGUudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAgICdBTFRFUiBUQUJMRSAkPGNsYXNzTmFtZTpuYW1lPiBBREQgQ09MVU1OIElGIE5PVCBFWElTVFMgJDxmaWVsZE5hbWU6bmFtZT4gJDxwb3N0Z3Jlc1R5cGU6cmF3PicsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgICBwb3N0Z3Jlc1R5cGU6IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHR5cGUpLFxuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgcmV0dXJuIHNlbGYuY3JlYXRlQ2xhc3MoY2xhc3NOYW1lLCB7IGZpZWxkczogeyBbZmllbGROYW1lXTogdHlwZSB9IH0sIHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIENvbHVtbiBhbHJlYWR5IGV4aXN0cywgY3JlYXRlZCBieSBvdGhlciByZXF1ZXN0LiBDYXJyeSBvbiB0byBzZWUgaWYgaXQncyB0aGUgcmlnaHQgdHlwZS5cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgeyBqb2luVGFibGU6IGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCB9XG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHQuYW55KFxuICAgICAgICAnU0VMRUNUIFwic2NoZW1hXCIgRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+IGFuZCAoXCJzY2hlbWFcIjo6anNvbi0+XFwnZmllbGRzXFwnLT4kPGZpZWxkTmFtZT4pIGlzIG5vdCBudWxsJyxcbiAgICAgICAgeyBjbGFzc05hbWUsIGZpZWxkTmFtZSB9XG4gICAgICApO1xuXG4gICAgICBpZiAocmVzdWx0WzBdKSB7XG4gICAgICAgIHRocm93ICdBdHRlbXB0ZWQgdG8gYWRkIGEgZmllbGQgdGhhdCBhbHJlYWR5IGV4aXN0cyc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBwYXRoID0gYHtmaWVsZHMsJHtmaWVsZE5hbWV9fWA7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICAgIHsgcGF0aCwgdHlwZSwgY2xhc3NOYW1lIH1cbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgndXBkYXRlLXNjaGVtYS1maWVsZC1vcHRpb25zJywgYXN5bmMgdCA9PiB7XG4gICAgICBjb25zdCBwYXRoID0gYHtmaWVsZHMsJHtmaWVsZE5hbWV9fWA7XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCI9anNvbmJfc2V0KFwic2NoZW1hXCIsICQ8cGF0aD4sICQ8dHlwZT4pICBXSEVSRSBcImNsYXNzTmFtZVwiPSQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgcGF0aCwgdHlwZSwgY2xhc3NOYW1lIH1cbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBEcm9wcyBhIGNvbGxlY3Rpb24uIFJlc29sdmVzIHdpdGggdHJ1ZSBpZiBpdCB3YXMgYSBQYXJzZSBTY2hlbWEgKGVnLiBfVXNlciwgQ3VzdG9tLCBldGMuKVxuICAvLyBhbmQgcmVzb2x2ZXMgd2l0aCBmYWxzZSBpZiBpdCB3YXNuJ3QgKGVnLiBhIGpvaW4gdGFibGUpLiBSZWplY3RzIGlmIGRlbGV0aW9uIHdhcyBpbXBvc3NpYmxlLlxuICBhc3luYyBkZWxldGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IG9wZXJhdGlvbnMgPSBbXG4gICAgICB7IHF1ZXJ5OiBgRFJPUCBUQUJMRSBJRiBFWElTVFMgJDE6bmFtZWAsIHZhbHVlczogW2NsYXNzTmFtZV0gfSxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBERUxFVEUgRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXM6IFtjbGFzc05hbWVdLFxuICAgICAgfSxcbiAgICBdO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fY2xpZW50XG4gICAgICAudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KG9wZXJhdGlvbnMpKSlcbiAgICAgIC50aGVuKCgpID0+IGNsYXNzTmFtZS5pbmRleE9mKCdfSm9pbjonKSAhPSAwKTsgLy8gcmVzb2x2ZXMgd2l0aCBmYWxzZSB3aGVuIF9Kb2luIHRhYmxlXG5cbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cblxuICAvLyBEZWxldGUgYWxsIGRhdGEga25vd24gdG8gdGhpcyBhZGFwdGVyLiBVc2VkIGZvciB0ZXN0aW5nLlxuICBhc3luYyBkZWxldGVBbGxDbGFzc2VzKCkge1xuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgIGNvbnN0IGhlbHBlcnMgPSB0aGlzLl9wZ3AuaGVscGVycztcbiAgICBkZWJ1ZygnZGVsZXRlQWxsQ2xhc3NlcycpO1xuXG4gICAgYXdhaXQgdGhpcy5fY2xpZW50XG4gICAgICAudGFzaygnZGVsZXRlLWFsbC1jbGFzc2VzJywgYXN5bmMgdCA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHQuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJyk7XG4gICAgICAgICAgY29uc3Qgam9pbnMgPSByZXN1bHRzLnJlZHVjZSgobGlzdDogQXJyYXk8c3RyaW5nPiwgc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBsaXN0LmNvbmNhdChqb2luVGFibGVzRm9yU2NoZW1hKHNjaGVtYS5zY2hlbWEpKTtcbiAgICAgICAgICB9LCBbXSk7XG4gICAgICAgICAgY29uc3QgY2xhc3NlcyA9IFtcbiAgICAgICAgICAgICdfU0NIRU1BJyxcbiAgICAgICAgICAgICdfUHVzaFN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlNjaGVkdWxlJyxcbiAgICAgICAgICAgICdfSG9va3MnLFxuICAgICAgICAgICAgJ19HbG9iYWxDb25maWcnLFxuICAgICAgICAgICAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgICAgICAgICAgICdfQXVkaWVuY2UnLFxuICAgICAgICAgICAgJ19JZGVtcG90ZW5jeScsXG4gICAgICAgICAgICAuLi5yZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LmNsYXNzTmFtZSksXG4gICAgICAgICAgICAuLi5qb2lucyxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0IHF1ZXJpZXMgPSBjbGFzc2VzLm1hcChjbGFzc05hbWUgPT4gKHtcbiAgICAgICAgICAgIHF1ZXJ5OiAnRFJPUCBUQUJMRSBJRiBFWElTVFMgJDxjbGFzc05hbWU6bmFtZT4nLFxuICAgICAgICAgICAgdmFsdWVzOiB7IGNsYXNzTmFtZSB9LFxuICAgICAgICAgIH0pKTtcbiAgICAgICAgICBhd2FpdCB0LnR4KHR4ID0+IHR4Lm5vbmUoaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gTm8gX1NDSEVNQSBjb2xsZWN0aW9uLiBEb24ndCBkZWxldGUgYW55dGhpbmcuXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGRlYnVnKGBkZWxldGVBbGxDbGFzc2VzIGRvbmUgaW4gJHtuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIG5vd31gKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBjb2x1bW4gYW5kIGFsbCB0aGUgZGF0YS4gRm9yIFJlbGF0aW9ucywgdGhlIF9Kb2luIGNvbGxlY3Rpb24gaXMgaGFuZGxlZFxuICAvLyBzcGVjaWFsbHksIHRoaXMgZnVuY3Rpb24gZG9lcyBub3QgZGVsZXRlIF9Kb2luIGNvbHVtbnMuIEl0IHNob3VsZCwgaG93ZXZlciwgaW5kaWNhdGVcbiAgLy8gdGhhdCB0aGUgcmVsYXRpb24gZmllbGRzIGRvZXMgbm90IGV4aXN0IGFueW1vcmUuIEluIG1vbmdvLCB0aGlzIG1lYW5zIHJlbW92aW5nIGl0IGZyb21cbiAgLy8gdGhlIF9TQ0hFTUEgY29sbGVjdGlvbi4gIFRoZXJlIHNob3VsZCBiZSBubyBhY3R1YWwgZGF0YSBpbiB0aGUgY29sbGVjdGlvbiB1bmRlciB0aGUgc2FtZSBuYW1lXG4gIC8vIGFzIHRoZSByZWxhdGlvbiBjb2x1bW4sIHNvIGl0J3MgZmluZSB0byBhdHRlbXB0IHRvIGRlbGV0ZSBpdC4gSWYgdGhlIGZpZWxkcyBsaXN0ZWQgdG8gYmVcbiAgLy8gZGVsZXRlZCBkbyBub3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gc2hvdWxkIHJldHVybiBzdWNjZXNzZnVsbHkgYW55d2F5cy4gQ2hlY2tpbmcgZm9yXG4gIC8vIGF0dGVtcHRzIHRvIGRlbGV0ZSBub24tZXhpc3RlbnQgZmllbGRzIGlzIHRoZSByZXNwb25zaWJpbGl0eSBvZiBQYXJzZSBTZXJ2ZXIuXG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBub3Qgb2JsaWdhdGVkIHRvIGRlbGV0ZSBmaWVsZHMgYXRvbWljYWxseS4gSXQgaXMgZ2l2ZW4gdGhlIGZpZWxkXG4gIC8vIG5hbWVzIGluIGEgbGlzdCBzbyB0aGF0IGRhdGFiYXNlcyB0aGF0IGFyZSBjYXBhYmxlIG9mIGRlbGV0aW5nIGZpZWxkcyBhdG9taWNhbGx5XG4gIC8vIG1heSBkbyBzby5cblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZS5cbiAgYXN5bmMgZGVsZXRlRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZGVidWcoJ2RlbGV0ZUZpZWxkcycpO1xuICAgIGZpZWxkTmFtZXMgPSBmaWVsZE5hbWVzLnJlZHVjZSgobGlzdDogQXJyYXk8c3RyaW5nPiwgZmllbGROYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgaWYgKGZpZWxkLnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgbGlzdC5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICB9XG4gICAgICBkZWxldGUgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuIGxpc3Q7XG4gICAgfSwgW10pO1xuXG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uZmllbGROYW1lc107XG4gICAgY29uc3QgY29sdW1ucyA9IGZpZWxkTmFtZXNcbiAgICAgIC5tYXAoKG5hbWUsIGlkeCkgPT4ge1xuICAgICAgICByZXR1cm4gYCQke2lkeCArIDJ9Om5hbWVgO1xuICAgICAgfSlcbiAgICAgIC5qb2luKCcsIERST1AgQ09MVU1OJyk7XG5cbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ2RlbGV0ZS1maWVsZHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGF3YWl0IHQubm9uZSgnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiID0gJDxzY2hlbWE+IFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIHNjaGVtYSxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgfSk7XG4gICAgICBpZiAodmFsdWVzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgYXdhaXQgdC5ub25lKGBBTFRFUiBUQUJMRSAkMTpuYW1lIERST1AgQ09MVU1OIElGIEVYSVNUUyAke2NvbHVtbnN9YCwgdmFsdWVzKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIGFsbCBzY2hlbWFzIGtub3duIHRvIHRoaXMgYWRhcHRlciwgaW4gUGFyc2UgZm9ybWF0LiBJbiBjYXNlIHRoZVxuICAvLyBzY2hlbWFzIGNhbm5vdCBiZSByZXRyaWV2ZWQsIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVqZWN0cy4gUmVxdWlyZW1lbnRzIGZvciB0aGVcbiAgLy8gcmVqZWN0aW9uIHJlYXNvbiBhcmUgVEJELlxuICBhc3luYyBnZXRBbGxDbGFzc2VzKCkge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQudGFzaygnZ2V0LWFsbC1jbGFzc2VzJywgYXN5bmMgdCA9PiB7XG4gICAgICByZXR1cm4gYXdhaXQgdC5tYXAoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInLCBudWxsLCByb3cgPT5cbiAgICAgICAgdG9QYXJzZVNjaGVtYSh7IGNsYXNzTmFtZTogcm93LmNsYXNzTmFtZSwgLi4ucm93LnNjaGVtYSB9KVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIHRoZSBzY2hlbWEgd2l0aCB0aGUgZ2l2ZW4gbmFtZSwgaW4gUGFyc2UgZm9ybWF0LiBJZlxuICAvLyB0aGlzIGFkYXB0ZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSBzY2hlbWEsIHJldHVybiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpdGhcbiAgLy8gdW5kZWZpbmVkIGFzIHRoZSByZWFzb24uXG4gIGFzeW5jIGdldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgZGVidWcoJ2dldENsYXNzJyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueSgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+Jywge1xuICAgICAgICBjbGFzc05hbWUsXG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdC5sZW5ndGggIT09IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFswXS5zY2hlbWE7XG4gICAgICB9KVxuICAgICAgLnRoZW4odG9QYXJzZVNjaGVtYSk7XG4gIH1cblxuICAvLyBUT0RPOiByZW1vdmUgdGhlIG1vbmdvIGZvcm1hdCBkZXBlbmRlbmN5IGluIHRoZSByZXR1cm4gdmFsdWVcbiAgYXN5bmMgY3JlYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnY3JlYXRlT2JqZWN0Jyk7XG4gICAgbGV0IGNvbHVtbnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGdlb1BvaW50cyA9IHt9O1xuXG4gICAgb2JqZWN0ID0gaGFuZGxlRG90RmllbGRzKG9iamVjdCk7XG5cbiAgICB2YWxpZGF0ZUtleXMob2JqZWN0KTtcblxuICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHZhciBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBjb25zdCBhdXRoRGF0YUFscmVhZHlFeGlzdHMgPSAhIW9iamVjdC5hdXRoRGF0YTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXSA9IG9iamVjdFsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGZpZWxkTmFtZSA9ICdhdXRoRGF0YSc7XG4gICAgICAgIC8vIEF2b2lkIGFkZGluZyBhdXRoRGF0YSBtdWx0aXBsZSB0aW1lcyB0byB0aGUgcXVlcnlcbiAgICAgICAgaWYgKGF1dGhEYXRhQWxyZWFkeUV4aXN0cykge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb2x1bW5zQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19mYWlsZWRfbG9naW5fY291bnQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2hpc3RvcnknXG4gICAgICAgICkge1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcpIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzd2l0Y2ggKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlKSB7XG4gICAgICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5vYmplY3RJZCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KG9iamVjdFtmaWVsZE5hbWVdKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdPYmplY3QnOlxuICAgICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICAgIGNhc2UgJ051bWJlcic6XG4gICAgICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdGaWxlJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm5hbWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2x5Z29uJzoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChvYmplY3RbZmllbGROYW1lXS5jb29yZGluYXRlcyk7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICAgIC8vIHBvcCB0aGUgcG9pbnQgYW5kIHByb2Nlc3MgbGF0ZXJcbiAgICAgICAgICBnZW9Qb2ludHNbZmllbGROYW1lXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICAgIGNvbHVtbnNBcnJheS5wb3AoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBgVHlwZSAke3NjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlfSBub3Qgc3VwcG9ydGVkIHlldGA7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb2x1bW5zQXJyYXkgPSBjb2x1bW5zQXJyYXkuY29uY2F0KE9iamVjdC5rZXlzKGdlb1BvaW50cykpO1xuICAgIGNvbnN0IGluaXRpYWxWYWx1ZXMgPSB2YWx1ZXNBcnJheS5tYXAoKHZhbCwgaW5kZXgpID0+IHtcbiAgICAgIGxldCB0ZXJtaW5hdGlvbiA9ICcnO1xuICAgICAgY29uc3QgZmllbGROYW1lID0gY29sdW1uc0FycmF5W2luZGV4XTtcbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6OnRleHRbXSc7XG4gICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6Ompzb25iJztcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJCR7aW5kZXggKyAyICsgY29sdW1uc0FycmF5Lmxlbmd0aH0ke3Rlcm1pbmF0aW9ufWA7XG4gICAgfSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzSW5qZWN0cyA9IE9iamVjdC5rZXlzKGdlb1BvaW50cykubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGdlb1BvaW50c1trZXldO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZS5sb25naXR1ZGUsIHZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGNvbnN0IGwgPSB2YWx1ZXNBcnJheS5sZW5ndGggKyBjb2x1bW5zQXJyYXkubGVuZ3RoO1xuICAgICAgcmV0dXJuIGBQT0lOVCgkJHtsfSwgJCR7bCArIDF9KWA7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2x1bW5zUGF0dGVybiA9IGNvbHVtbnNBcnJheS5tYXAoKGNvbCwgaW5kZXgpID0+IGAkJHtpbmRleCArIDJ9Om5hbWVgKS5qb2luKCk7XG4gICAgY29uc3QgdmFsdWVzUGF0dGVybiA9IGluaXRpYWxWYWx1ZXMuY29uY2F0KGdlb1BvaW50c0luamVjdHMpLmpvaW4oKTtcblxuICAgIGNvbnN0IHFzID0gYElOU0VSVCBJTlRPICQxOm5hbWUgKCR7Y29sdW1uc1BhdHRlcm59KSBWQUxVRVMgKCR7dmFsdWVzUGF0dGVybn0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5jb2x1bW5zQXJyYXksIC4uLnZhbHVlc0FycmF5XTtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udCA6IHRoaXMuX2NsaWVudClcbiAgICAgIC5ub25lKHFzLCB2YWx1ZXMpXG4gICAgICAudGhlbigoKSA9PiAoeyBvcHM6IFtvYmplY3RdIH0pKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvcikge1xuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgZXJyLnVuZGVybHlpbmdFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGlmIChlcnJvci5jb25zdHJhaW50KSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gZXJyb3IuY29uc3RyYWludC5tYXRjaCgvdW5pcXVlXyhbYS16QS1aXSspLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBlcnJvciA9IGVycjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGFzeW5jIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdkZWxldGVPYmplY3RzQnlRdWVyeScpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IGluZGV4ID0gMjtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcbiAgICBpZiAoT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgd2hlcmUucGF0dGVybiA9ICdUUlVFJztcbiAgICB9XG4gICAgY29uc3QgcXMgPSBgV0lUSCBkZWxldGVkIEFTIChERUxFVEUgRlJPTSAkMTpuYW1lIFdIRVJFICR7d2hlcmUucGF0dGVybn0gUkVUVVJOSU5HICopIFNFTEVDVCBjb3VudCgqKSBGUk9NIGRlbGV0ZWRgO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KVxuICAgICAgLm9uZShxcywgdmFsdWVzLCBhID0+ICthLmNvdW50KVxuICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIEVMU0U6IERvbid0IGRlbGV0ZSBhbnl0aGluZyBpZiBkb2Vzbid0IGV4aXN0XG4gICAgICB9KTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG4gIC8vIFJldHVybiB2YWx1ZSBub3QgY3VycmVudGx5IHdlbGwgc3BlY2lmaWVkLlxuICBhc3luYyBmaW5kT25lQW5kVXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgZGVidWcoJ2ZpbmRPbmVBbmRVcGRhdGUnKTtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVPYmplY3RzQnlRdWVyeShjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHVwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oXG4gICAgICB2YWwgPT4gdmFsWzBdXG4gICAgKTtcbiAgfVxuXG4gIC8vIEFwcGx5IHRoZSB1cGRhdGUgdG8gYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIGFzeW5jIHVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICk6IFByb21pc2U8W2FueV0+IHtcbiAgICBkZWJ1ZygndXBkYXRlT2JqZWN0c0J5UXVlcnknKTtcbiAgICBjb25zdCB1cGRhdGVQYXR0ZXJucyA9IFtdO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGxldCBpbmRleCA9IDI7XG4gICAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuXG4gICAgY29uc3Qgb3JpZ2luYWxVcGRhdGUgPSB7IC4uLnVwZGF0ZSB9O1xuXG4gICAgLy8gU2V0IGZsYWcgZm9yIGRvdCBub3RhdGlvbiBmaWVsZHNcbiAgICBjb25zdCBkb3ROb3RhdGlvbk9wdGlvbnMgPSB7fTtcbiAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IGZpZWxkTmFtZS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBmaXJzdCA9IGNvbXBvbmVudHMuc2hpZnQoKTtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpcnN0XSA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHVwZGF0ZSA9IGhhbmRsZURvdEZpZWxkcyh1cGRhdGUpO1xuICAgIC8vIFJlc29sdmUgYXV0aERhdGEgZmlyc3QsXG4gICAgLy8gU28gd2UgZG9uJ3QgZW5kIHVwIHdpdGggbXVsdGlwbGUga2V5IHVwZGF0ZXNcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB1cGRhdGUpIHtcbiAgICAgIGNvbnN0IGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIGNvbnN0IHZhbHVlID0gdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIGRlbGV0ZSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddID0gdXBkYXRlWydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICB1cGRhdGVbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gdmFsdWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBmaWVsZFZhbHVlID0gdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAvLyBEcm9wIGFueSB1bmRlZmluZWQgdmFsdWVzLlxuICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PSAnYXV0aERhdGEnKSB7XG4gICAgICAgIC8vIFRoaXMgcmVjdXJzaXZlbHkgc2V0cyB0aGUganNvbl9vYmplY3RcbiAgICAgICAgLy8gT25seSAxIGxldmVsIGRlZXBcbiAgICAgICAgY29uc3QgZ2VuZXJhdGUgPSAoanNvbmI6IHN0cmluZywga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gYGpzb25fb2JqZWN0X3NldF9rZXkoQ09BTEVTQ0UoJHtqc29uYn0sICd7fSc6Ompzb25iKSwgJHtrZXl9LCAke3ZhbHVlfSk6Ompzb25iYDtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgbGFzdEtleSA9IGAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgIGNvbnN0IGZpZWxkTmFtZUluZGV4ID0gaW5kZXg7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGNvbnN0IHVwZGF0ZSA9IE9iamVjdC5rZXlzKGZpZWxkVmFsdWUpLnJlZHVjZSgobGFzdEtleTogc3RyaW5nLCBrZXk6IHN0cmluZykgPT4ge1xuICAgICAgICAgIGNvbnN0IHN0ciA9IGdlbmVyYXRlKGxhc3RLZXksIGAkJHtpbmRleH06OnRleHRgLCBgJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgIGxldCB2YWx1ZSA9IGZpZWxkVmFsdWVba2V5XTtcbiAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2YWx1ZSA9IEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsdWVzLnB1c2goa2V5LCB2YWx1ZSk7XG4gICAgICAgICAgcmV0dXJuIHN0cjtcbiAgICAgICAgfSwgbGFzdEtleSk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2ZpZWxkTmFtZUluZGV4fTpuYW1lID0gJHt1cGRhdGV9YCk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0luY3JlbWVudCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgMCkgKyAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5hbW91bnQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGQnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke2luZGV4ICsgMX06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBudWxsKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnUmVtb3ZlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X3JlbW92ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtpbmRleCArIDFcbiAgICAgICAgICB9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZFVuaXF1ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGRfdW5pcXVlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke2luZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICAvL1RPRE86IHN0b3Agc3BlY2lhbCBjYXNpbmcgdGhpcy4gSXQgc2hvdWxkIGNoZWNrIGZvciBfX3R5cGUgPT09ICdEYXRlJyBhbmQgdXNlIC5pc29cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAvLyBub29wXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdPYmplY3QnXG4gICAgICApIHtcbiAgICAgICAgLy8gR2F0aGVyIGtleXMgdG8gaW5jcmVtZW50XG4gICAgICAgIGNvbnN0IGtleXNUb0luY3JlbWVudCA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldFxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IE9iamVjdC5rZXlzIGlzIGl0ZXJhdGluZyBvdmVyIHRoZSAqKm9yaWdpbmFsKiogdXBkYXRlIG9iamVjdFxuICAgICAgICAgICAgLy8gYW5kIHRoYXQgc29tZSBvZiB0aGUga2V5cyBvZiB0aGUgb3JpZ2luYWwgdXBkYXRlIGNvdWxkIGJlIG51bGwgb3IgdW5kZWZpbmVkOlxuICAgICAgICAgICAgLy8gKFNlZSB0aGUgYWJvdmUgY2hlY2sgYGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IHR5cGVvZiBmaWVsZFZhbHVlID09IFwidW5kZWZpbmVkXCIpYClcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnSW5jcmVtZW50JyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgbGV0IGluY3JlbWVudFBhdHRlcm5zID0gJyc7XG4gICAgICAgIGlmIChrZXlzVG9JbmNyZW1lbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGluY3JlbWVudFBhdHRlcm5zID1cbiAgICAgICAgICAgICcgfHwgJyArXG4gICAgICAgICAgICBrZXlzVG9JbmNyZW1lbnRcbiAgICAgICAgICAgICAgLm1hcChjID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhbW91bnQgPSBmaWVsZFZhbHVlW2NdLmFtb3VudDtcbiAgICAgICAgICAgICAgICByZXR1cm4gYENPTkNBVCgne1wiJHtjfVwiOicsIENPQUxFU0NFKCQke2luZGV4fTpuYW1lLT4+JyR7Y30nLCcwJyk6OmludCArICR7YW1vdW50fSwgJ30nKTo6anNvbmJgO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAuam9pbignIHx8ICcpO1xuICAgICAgICAgIC8vIFN0cmlwIHRoZSBrZXlzXG4gICAgICAgICAga2V5c1RvSW5jcmVtZW50LmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICAgIGRlbGV0ZSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBrZXlzVG9EZWxldGU6IEFycmF5PHN0cmluZz4gPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKGsgPT4ge1xuICAgICAgICAgICAgLy8gY2hvb3NlIHRvcCBsZXZlbCBmaWVsZHMgdGhhdCBoYXZlIGEgZGVsZXRlIG9wZXJhdGlvbiBzZXQuXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsVXBkYXRlW2tdO1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgICAgICAgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJylbMF0gPT09IGZpZWxkTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoayA9PiBrLnNwbGl0KCcuJylbMV0pO1xuXG4gICAgICAgIGNvbnN0IGRlbGV0ZVBhdHRlcm5zID0ga2V5c1RvRGVsZXRlLnJlZHVjZSgocDogc3RyaW5nLCBjOiBzdHJpbmcsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIHJldHVybiBwICsgYCAtICckJHtpbmRleCArIDEgKyBpfTp2YWx1ZSdgO1xuICAgICAgICB9LCAnJyk7XG4gICAgICAgIC8vIE92ZXJyaWRlIE9iamVjdFxuICAgICAgICBsZXQgdXBkYXRlT2JqZWN0ID0gXCIne30nOjpqc29uYlwiO1xuXG4gICAgICAgIGlmIChkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSkge1xuICAgICAgICAgIC8vIE1lcmdlIE9iamVjdFxuICAgICAgICAgIHVwZGF0ZU9iamVjdCA9IGBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ3t9Jzo6anNvbmIpYDtcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9ICgke3VwZGF0ZU9iamVjdH0gJHtkZWxldGVQYXR0ZXJuc30gJHtpbmNyZW1lbnRQYXR0ZXJuc30gfHwgJCR7aW5kZXggKyAxICsga2V5c1RvRGVsZXRlLmxlbmd0aFxuICAgICAgICAgIH06Ompzb25iIClgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgLi4ua2V5c1RvRGVsZXRlLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKSk7XG4gICAgICAgIGluZGV4ICs9IDIgKyBrZXlzVG9EZWxldGUubGVuZ3RoO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlKSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSdcbiAgICAgICkge1xuICAgICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZShzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pO1xuICAgICAgICBpZiAoZXhwZWN0ZWRUeXBlID09PSAndGV4dFtdJykge1xuICAgICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfTo6dGV4dFtdYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWJ1ZygnTm90IHN1cHBvcnRlZCB1cGRhdGUnLCB7IGZpZWxkTmFtZSwgZmllbGRWYWx1ZSB9KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICBgUG9zdGdyZXMgZG9lc24ndCBzdXBwb3J0IHVwZGF0ZSAke0pTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpfSB5ZXRgXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBpbmRleCxcbiAgICAgIHF1ZXJ5LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVDbGF1c2UgPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCBxcyA9IGBVUERBVEUgJDE6bmFtZSBTRVQgJHt1cGRhdGVQYXR0ZXJucy5qb2luKCl9ICR7d2hlcmVDbGF1c2V9IFJFVFVSTklORyAqYDtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udCA6IHRoaXMuX2NsaWVudCkuYW55KHFzLCB2YWx1ZXMpO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvLyBIb3BlZnVsbHksIHdlIGNhbiBnZXQgcmlkIG9mIHRoaXMuIEl0J3Mgb25seSB1c2VkIGZvciBjb25maWcgYW5kIGhvb2tzLlxuICB1cHNlcnRPbmVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ3Vwc2VydE9uZU9iamVjdCcpO1xuICAgIGNvbnN0IGNyZWF0ZVZhbHVlID0gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlT2JqZWN0KGNsYXNzTmFtZSwgc2NoZW1hLCBjcmVhdGVWYWx1ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIC8vIGlnbm9yZSBkdXBsaWNhdGUgdmFsdWUgZXJyb3JzIGFzIGl0J3MgdXBzZXJ0XG4gICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMuZmluZE9uZUFuZFVwZGF0ZShjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHVwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pO1xuICAgIH0pO1xuICB9XG5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB7IHNraXAsIGxpbWl0LCBzb3J0LCBrZXlzLCBjYXNlSW5zZW5zaXRpdmUsIGV4cGxhaW4gfTogUXVlcnlPcHRpb25zXG4gICkge1xuICAgIGRlYnVnKCdmaW5kJyk7XG4gICAgY29uc3QgaGFzTGltaXQgPSBsaW1pdCAhPT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGhhc1NraXAgPSBza2lwICE9PSB1bmRlZmluZWQ7XG4gICAgbGV0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiAyLFxuICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgbGltaXRQYXR0ZXJuID0gaGFzTGltaXQgPyBgTElNSVQgJCR7dmFsdWVzLmxlbmd0aCArIDF9YCA6ICcnO1xuICAgIGlmIChoYXNMaW1pdCkge1xuICAgICAgdmFsdWVzLnB1c2gobGltaXQpO1xuICAgIH1cbiAgICBjb25zdCBza2lwUGF0dGVybiA9IGhhc1NraXAgPyBgT0ZGU0VUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzU2tpcCkge1xuICAgICAgdmFsdWVzLnB1c2goc2tpcCk7XG4gICAgfVxuXG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgaWYgKHNvcnQpIHtcbiAgICAgIGNvbnN0IHNvcnRDb3B5OiBhbnkgPSBzb3J0O1xuICAgICAgY29uc3Qgc29ydGluZyA9IE9iamVjdC5rZXlzKHNvcnQpXG4gICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1LZXkgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhrZXkpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgLy8gVXNpbmcgJGlkeCBwYXR0ZXJuIGdpdmVzOiAgbm9uLWludGVnZXIgY29uc3RhbnQgaW4gT1JERVIgQllcbiAgICAgICAgICBpZiAoc29ydENvcHlba2V5XSA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIGAke3RyYW5zZm9ybUtleX0gQVNDYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAke3RyYW5zZm9ybUtleX0gREVTQ2A7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCk7XG4gICAgICBzb3J0UGF0dGVybiA9IHNvcnQgIT09IHVuZGVmaW5lZCAmJiBPYmplY3Qua2V5cyhzb3J0KS5sZW5ndGggPiAwID8gYE9SREVSIEJZICR7c29ydGluZ31gIDogJyc7XG4gICAgfVxuICAgIGlmICh3aGVyZS5zb3J0cyAmJiBPYmplY3Qua2V5cygod2hlcmUuc29ydHM6IGFueSkpLmxlbmd0aCA+IDApIHtcbiAgICAgIHNvcnRQYXR0ZXJuID0gYE9SREVSIEJZICR7d2hlcmUuc29ydHMuam9pbigpfWA7XG4gICAgfVxuXG4gICAgbGV0IGNvbHVtbnMgPSAnKic7XG4gICAgaWYgKGtleXMpIHtcbiAgICAgIC8vIEV4Y2x1ZGUgZW1wdHkga2V5c1xuICAgICAgLy8gUmVwbGFjZSBBQ0wgYnkgaXQncyBrZXlzXG4gICAgICBrZXlzID0ga2V5cy5yZWR1Y2UoKG1lbW8sIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5ID09PSAnQUNMJykge1xuICAgICAgICAgIG1lbW8ucHVzaCgnX3JwZXJtJyk7XG4gICAgICAgICAgbWVtby5wdXNoKCdfd3Blcm0nKTtcbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBrZXkubGVuZ3RoID4gMCAmJlxuICAgICAgICAgIC8vIFJlbW92ZSBzZWxlY3RlZCBmaWVsZCBub3QgcmVmZXJlbmNlZCBpbiB0aGUgc2NoZW1hXG4gICAgICAgICAgLy8gUmVsYXRpb24gaXMgbm90IGEgY29sdW1uIGluIHBvc3RncmVzXG4gICAgICAgICAgLy8gJHNjb3JlIGlzIGEgUGFyc2Ugc3BlY2lhbCBmaWVsZCBhbmQgaXMgYWxzbyBub3QgYSBjb2x1bW5cbiAgICAgICAgICAoKHNjaGVtYS5maWVsZHNba2V5XSAmJiBzY2hlbWEuZmllbGRzW2tleV0udHlwZSAhPT0gJ1JlbGF0aW9uJykgfHwga2V5ID09PSAnJHNjb3JlJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgbWVtby5wdXNoKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LCBbXSk7XG4gICAgICBjb2x1bW5zID0ga2V5c1xuICAgICAgICAubWFwKChrZXksIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGtleSA9PT0gJyRzY29yZScpIHtcbiAgICAgICAgICAgIHJldHVybiBgdHNfcmFua19jZCh0b190c3ZlY3RvcigkJHsyfSwgJCR7M306bmFtZSksIHRvX3RzcXVlcnkoJCR7NH0sICQkezV9KSwgMzIpIGFzIHNjb3JlYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAkJHtpbmRleCArIHZhbHVlcy5sZW5ndGggKyAxfTpuYW1lYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHZhbHVlcyA9IHZhbHVlcy5jb25jYXQoa2V5cyk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufSAke3NraXBQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluID8gdGhpcy5jcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KG9yaWdpbmFsUXVlcnkpIDogb3JpZ2luYWxRdWVyeTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KHFzLCB2YWx1ZXMpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBRdWVyeSBvbiBub24gZXhpc3RpbmcgdGFibGUsIGRvbid0IGNyYXNoXG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW107XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIENvbnZlcnRzIGZyb20gYSBwb3N0Z3Jlcy1mb3JtYXQgb2JqZWN0IHRvIGEgUkVTVC1mb3JtYXQgb2JqZWN0LlxuICAvLyBEb2VzIG5vdCBzdHJpcCBvdXQgYW55dGhpbmcgYmFzZWQgb24gYSBsYWNrIG9mIGF1dGhlbnRpY2F0aW9uLlxuICBwb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBzY2hlbWE6IGFueSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInICYmIG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgICAgIGxhdGl0dWRlOiBvYmplY3RbZmllbGROYW1lXS55LFxuICAgICAgICAgIGxvbmdpdHVkZTogb2JqZWN0W2ZpZWxkTmFtZV0ueCxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGxldCBjb29yZHMgPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgY29vcmRzID0gY29vcmRzLnN1YnN0cigyLCBjb29yZHMubGVuZ3RoIC0gNCkuc3BsaXQoJyksKCcpO1xuICAgICAgICBjb29yZHMgPSBjb29yZHMubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICByZXR1cm4gW3BhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVsxXSksIHBhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVswXSldO1xuICAgICAgICB9KTtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICAgICAgY29vcmRpbmF0ZXM6IGNvb3JkcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgICAgIG5hbWU6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIC8vVE9ETzogcmVtb3ZlIHRoaXMgcmVsaWFuY2Ugb24gdGhlIG1vbmdvIGZvcm1hdC4gREIgYWRhcHRlciBzaG91bGRuJ3Qga25vdyB0aGVyZSBpcyBhIGRpZmZlcmVuY2UgYmV0d2VlbiBjcmVhdGVkIGF0IGFuZCBhbnkgb3RoZXIgZGF0ZSBmaWVsZC5cbiAgICBpZiAob2JqZWN0LmNyZWF0ZWRBdCkge1xuICAgICAgb2JqZWN0LmNyZWF0ZWRBdCA9IG9iamVjdC5jcmVhdGVkQXQudG9JU09TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC51cGRhdGVkQXQpIHtcbiAgICAgIG9iamVjdC51cGRhdGVkQXQgPSBvYmplY3QudXBkYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QuZXhwaXJlc0F0KSB7XG4gICAgICBvYmplY3QuZXhwaXJlc0F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuZXhwaXJlc0F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0KSB7XG4gICAgICBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICAgIGlzbzogb2JqZWN0W2ZpZWxkTmFtZV0udG9JU09TdHJpbmcoKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBhc3luYyBlbnN1cmVVbmlxdWVuZXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgY29uc3RyYWludE5hbWUgPSBgJHtjbGFzc05hbWV9X3VuaXF1ZV8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYCk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFVOSVFVRSBJTkRFWCBJRiBOT1QgRVhJU1RTICQyOm5hbWUgT04gJDE6bmFtZSgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKHFzLCBbY2xhc3NOYW1lLCBjb25zdHJhaW50TmFtZSwgLi4uZmllbGROYW1lc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSkpIHtcbiAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGNvbnN0cmFpbnROYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIENhc3QgdGhlIGVycm9yIGludG8gdGhlIHByb3BlciBwYXJzZSBlcnJvclxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGNvdW50LlxuICBhc3luYyBjb3VudChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICByZWFkUHJlZmVyZW5jZT86IHN0cmluZyxcbiAgICBlc3RpbWF0ZT86IGJvb2xlYW4gPSB0cnVlXG4gICkge1xuICAgIGRlYnVnKCdjb3VudCcpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiAyLFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgbGV0IHFzID0gJyc7XG5cbiAgICBpZiAod2hlcmUucGF0dGVybi5sZW5ndGggPiAwIHx8ICFlc3RpbWF0ZSkge1xuICAgICAgcXMgPSBgU0VMRUNUIGNvdW50KCopIEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIH0gZWxzZSB7XG4gICAgICBxcyA9ICdTRUxFQ1QgcmVsdHVwbGVzIEFTIGFwcHJveGltYXRlX3Jvd19jb3VudCBGUk9NIHBnX2NsYXNzIFdIRVJFIHJlbG5hbWUgPSAkMSc7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLm9uZShxcywgdmFsdWVzLCBhID0+IHtcbiAgICAgICAgaWYgKGEuYXBwcm94aW1hdGVfcm93X2NvdW50ID09IG51bGwgfHwgYS5hcHByb3hpbWF0ZV9yb3dfY291bnQgPT0gLTEpIHtcbiAgICAgICAgICByZXR1cm4gIWlzTmFOKCthLmNvdW50KSA/ICthLmNvdW50IDogMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gK2EuYXBwcm94aW1hdGVfcm93X2NvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBkaXN0aW5jdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBxdWVyeTogUXVlcnlUeXBlLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIGRlYnVnKCdkaXN0aW5jdCcpO1xuICAgIGxldCBmaWVsZCA9IGZpZWxkTmFtZTtcbiAgICBsZXQgY29sdW1uID0gZmllbGROYW1lO1xuICAgIGNvbnN0IGlzTmVzdGVkID0gZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwO1xuICAgIGlmIChpc05lc3RlZCkge1xuICAgICAgZmllbGQgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICBjb2x1bW4gPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbiAgICB9XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGlzUG9pbnRlckZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcic7XG4gICAgY29uc3QgdmFsdWVzID0gW2ZpZWxkLCBjb2x1bW4sIGNsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCB0cmFuc2Zvcm1lciA9IGlzQXJyYXlGaWVsZCA/ICdqc29uYl9hcnJheV9lbGVtZW50cycgOiAnT04nO1xuICAgIGxldCBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6bmFtZSkgJDI6bmFtZSBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpyYXcpICQyOnJhdyBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yKSB7XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoIWlzTmVzdGVkKSB7XG4gICAgICAgICAgcmVzdWx0cyA9IHJlc3VsdHMuZmlsdGVyKG9iamVjdCA9PiBvYmplY3RbZmllbGRdICE9PSBudWxsKTtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgIGlmICghaXNQb2ludGVyRmllbGQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdFtmaWVsZF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGRdLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjaGlsZCA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzFdO1xuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IG9iamVjdFtjb2x1bW5dW2NoaWxkXSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PlxuICAgICAgICByZXN1bHRzLm1hcChvYmplY3QgPT4gdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpXG4gICAgICApO1xuICB9XG5cbiAgYXN5bmMgYWdncmVnYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogYW55LFxuICAgIHBpcGVsaW5lOiBhbnksXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgaGludDogP21peGVkLFxuICAgIGV4cGxhaW4/OiBib29sZWFuXG4gICkge1xuICAgIGRlYnVnKCdhZ2dyZWdhdGUnKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXg6IG51bWJlciA9IDI7XG4gICAgbGV0IGNvbHVtbnM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGNvdW50RmllbGQgPSBudWxsO1xuICAgIGxldCBncm91cFZhbHVlcyA9IG51bGw7XG4gICAgbGV0IHdoZXJlUGF0dGVybiA9ICcnO1xuICAgIGxldCBsaW1pdFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc2tpcFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBsZXQgZ3JvdXBQYXR0ZXJuID0gJyc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaXBlbGluZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3Qgc3RhZ2UgPSBwaXBlbGluZVtpXTtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRncm91cFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUgIT09ICcnKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTIFwib2JqZWN0SWRcImApO1xuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ19pZCcgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiBPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICBncm91cFZhbHVlcyA9IHZhbHVlO1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBCeUZpZWxkcyA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBhbGlhcyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2FsaWFzXSA9PT0gJ3N0cmluZycgJiYgdmFsdWVbYWxpYXNdKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gdHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWVbYWxpYXNdKTtcbiAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgZ3JvdXBCeUZpZWxkcy5wdXNoKGBcIiR7c291cmNlfVwiYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHNvdXJjZSwgYWxpYXMpO1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWUgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcGVyYXRpb24gPSBPYmplY3Qua2V5cyh2YWx1ZVthbGlhc10pWzBdO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXVtvcGVyYXRpb25dKTtcbiAgICAgICAgICAgICAgICBpZiAobW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl0pIHtcbiAgICAgICAgICAgICAgICAgIGlmICghZ3JvdXBCeUZpZWxkcy5pbmNsdWRlcyhgXCIke3NvdXJjZX1cImApKSB7XG4gICAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICBgRVhUUkFDVCgke21vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dXG4gICAgICAgICAgICAgICAgICAgIH0gRlJPTSAkJHtpbmRleH06bmFtZSBBVCBUSU1FIFpPTkUgJ1VUQycpOjppbnRlZ2VyIEFTICQke2luZGV4ICsgMX06bmFtZWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9OnJhd2A7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChncm91cEJ5RmllbGRzLmpvaW4oKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuJHN1bSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlLiRzdW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBTVU0oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRzdW0pLCBmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb3VudEZpZWxkID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBDT1VOVCgqKSBBUyAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1heCkge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1BWCgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtYXgpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1pbikge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1JTigkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtaW4pLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJGF2Zykge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYEFWRygkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRhdmcpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2x1bW5zLnB1c2goJyonKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICBpZiAoY29sdW1ucy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgY29sdW1ucyA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRwcm9qZWN0W2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IDEgfHwgdmFsdWUgPT09IHRydWUpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5zID0gW107XG4gICAgICAgIGNvbnN0IG9yT3JBbmQgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2UuJG1hdGNoLCAnJG9yJylcbiAgICAgICAgICA/ICcgT1IgJ1xuICAgICAgICAgIDogJyBBTkQgJztcblxuICAgICAgICBpZiAoc3RhZ2UuJG1hdGNoLiRvcikge1xuICAgICAgICAgIGNvbnN0IGNvbGxhcHNlID0ge307XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLiRvci5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZWxlbWVudCkge1xuICAgICAgICAgICAgICBjb2xsYXBzZVtrZXldID0gZWxlbWVudFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHN0YWdlLiRtYXRjaCA9IGNvbGxhcHNlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAobGV0IGZpZWxkIGluIHN0YWdlLiRtYXRjaCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJG1hdGNoW2ZpZWxkXTtcbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnKSB7XG4gICAgICAgICAgICBmaWVsZCA9ICdvYmplY3RJZCc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IG1hdGNoUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgICAgICAgIGlmICh2YWx1ZVtjbXBdKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICAgICAgICBtYXRjaFBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkLCB0b1Bvc3RncmVzVmFsdWUodmFsdWVbY21wXSkpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGlmIChtYXRjaFBhdHRlcm5zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgke21hdGNoUGF0dGVybnMuam9pbignIEFORCAnKX0pYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIG1hdGNoUGF0dGVybnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkLCB2YWx1ZSk7XG4gICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB3aGVyZVBhdHRlcm4gPSBwYXR0ZXJucy5sZW5ndGggPiAwID8gYFdIRVJFICR7cGF0dGVybnMuam9pbihgICR7b3JPckFuZH0gYCl9YCA6ICcnO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRsaW1pdCkge1xuICAgICAgICBsaW1pdFBhdHRlcm4gPSBgTElNSVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJGxpbWl0KTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc2tpcCkge1xuICAgICAgICBza2lwUGF0dGVybiA9IGBPRkZTRVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJHNraXApO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRzb3J0KSB7XG4gICAgICAgIGNvbnN0IHNvcnQgPSBzdGFnZS4kc29ydDtcbiAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHNvcnQpO1xuICAgICAgICBjb25zdCBzb3J0aW5nID0ga2V5c1xuICAgICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gc29ydFtrZXldID09PSAxID8gJ0FTQycgOiAnREVTQyc7XG4gICAgICAgICAgICBjb25zdCBvcmRlciA9IGAkJHtpbmRleH06bmFtZSAke3RyYW5zZm9ybWVyfWA7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgcmV0dXJuIG9yZGVyO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmpvaW4oKTtcbiAgICAgICAgdmFsdWVzLnB1c2goLi4ua2V5cyk7XG4gICAgICAgIHNvcnRQYXR0ZXJuID0gc29ydCAhPT0gdW5kZWZpbmVkICYmIHNvcnRpbmcubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChncm91cFBhdHRlcm4pIHtcbiAgICAgIGNvbHVtbnMuZm9yRWFjaCgoZSwgaSwgYSkgPT4ge1xuICAgICAgICBpZiAoZSAmJiBlLnRyaW0oKSA9PT0gJyonKSB7XG4gICAgICAgICAgYVtpXSA9ICcnO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnNcbiAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgIC5qb2luKCl9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtza2lwUGF0dGVybn0gJHtncm91cFBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluID8gdGhpcy5jcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KG9yaWdpbmFsUXVlcnkpIDogb3JpZ2luYWxRdWVyeTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgdmFsdWVzKS50aGVuKGEgPT4ge1xuICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgcmV0dXJuIGE7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHRzID0gYS5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdvYmplY3RJZCcpKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSB7fTtcbiAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBncm91cFZhbHVlcykge1xuICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkW2tleV0gPSByZXN1bHRba2V5XTtcbiAgICAgICAgICAgIGRlbGV0ZSByZXN1bHRba2V5XTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvdW50RmllbGQpIHtcbiAgICAgICAgICByZXN1bHRbY291bnRGaWVsZF0gPSBwYXJzZUludChyZXN1bHRbY291bnRGaWVsZF0sIDEwKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbih7IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgfTogYW55KSB7XG4gICAgLy8gVE9ETzogVGhpcyBtZXRob2QgbmVlZHMgdG8gYmUgcmV3cml0dGVuIHRvIG1ha2UgcHJvcGVyIHVzZSBvZiBjb25uZWN0aW9ucyAoQHZpdGFseS10KVxuICAgIGRlYnVnKCdwZXJmb3JtSW5pdGlhbGl6YXRpb24nKTtcbiAgICBhd2FpdCB0aGlzLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKCk7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzLm1hcChzY2hlbWEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlVGFibGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKVxuICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIHx8XG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5zY2hlbWFVcGdyYWRlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSkpO1xuICAgIH0pO1xuICAgIHByb21pc2VzLnB1c2godGhpcy5fbGlzdGVuVG9TY2hlbWEoKSk7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2xpZW50LnR4KCdwZXJmb3JtLWluaXRpYWxpemF0aW9uJywgYXN5bmMgdCA9PiB7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5taXNjLmpzb25PYmplY3RTZXRLZXlzKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmFkZCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGRVbmlxdWUpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkucmVtb3ZlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zQWxsKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zQWxsUmVnZXgpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuY29udGFpbnMpO1xuICAgICAgICAgIHJldHVybiB0LmN0eDtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oY3R4ID0+IHtcbiAgICAgICAgZGVidWcoYGluaXRpYWxpemF0aW9uRG9uZSBpbiAke2N0eC5kdXJhdGlvbn1gKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46ID9hbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+XG4gICAgICB0LmJhdGNoKFxuICAgICAgICBpbmRleGVzLm1hcChpID0+IHtcbiAgICAgICAgICByZXR1cm4gdC5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgICAgICAgaS5uYW1lLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaS5rZXksXG4gICAgICAgICAgXSk7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCAoY29ubiB8fCB0aGlzLl9jbGllbnQpLm5vbmUoJ0NSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLCBbXG4gICAgICBmaWVsZE5hbWUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0eXBlLFxuICAgIF0pO1xuICB9XG5cbiAgYXN5bmMgZHJvcEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSwgY29ubjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcXVlcmllcyA9IGluZGV4ZXMubWFwKGkgPT4gKHtcbiAgICAgIHF1ZXJ5OiAnRFJPUCBJTkRFWCAkMTpuYW1lJyxcbiAgICAgIHZhbHVlczogaSxcbiAgICB9KSk7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+IHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgfVxuXG4gIGFzeW5jIGdldEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxcyA9ICdTRUxFQ1QgKiBGUk9NIHBnX2luZGV4ZXMgV0hFUkUgdGFibGVuYW1lID0gJHtjbGFzc05hbWV9JztcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgeyBjbGFzc05hbWUgfSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBVc2VkIGZvciB0ZXN0aW5nIHB1cnBvc2VzXG4gIGFzeW5jIHVwZGF0ZUVzdGltYXRlZENvdW50KGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKCdBTkFMWVpFICQxOm5hbWUnLCBbY2xhc3NOYW1lXSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZXNzaW9uID0ge307XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXN1bHQgPSB0aGlzLl9jbGllbnQudHgodCA9PiB7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgPSB0O1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICAgIH0pO1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaCA9IFtdO1xuICAgICAgICByZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnByb21pc2U7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZXNzaW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0O1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0LmNhdGNoKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChQcm9taXNlLnJlamVjdCgpKTtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSW5kZXgoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIGZpZWxkTmFtZXM6IHN0cmluZ1tdLFxuICAgIGluZGV4TmFtZTogP3N0cmluZyxcbiAgICBjYXNlSW5zZW5zaXRpdmU6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zPzogT2JqZWN0ID0ge31cbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgZGVmYXVsdEluZGV4TmFtZSA9IGBwYXJzZV9kZWZhdWx0XyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID1cbiAgICAgIGluZGV4TmFtZSAhPSBudWxsID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHsgbmFtZTogZGVmYXVsdEluZGV4TmFtZSB9O1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYGxvd2VyKCQke2luZGV4ICsgM306bmFtZSkgdmFyY2hhcl9wYXR0ZXJuX29wc2ApXG4gICAgICA6IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYCk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgY29uc3Qgc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA9XG4gICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA6IGZhbHNlO1xuICAgIGlmIChzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uKSB7XG4gICAgICBhd2FpdCB0aGlzLmVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucyk7XG4gICAgfVxuICAgIGF3YWl0IGNvbm4ubm9uZShxcywgW2luZGV4TmFtZU9wdGlvbnMubmFtZSwgY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGluZGV4TmFtZU9wdGlvbnMubmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGVsZXRlSWRlbXBvdGVuY3lGdW5jdGlvbihvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBxcyA9ICdEUk9QIEZVTkNUSU9OIElGIEVYSVNUUyBpZGVtcG90ZW5jeV9kZWxldGVfZXhwaXJlZF9yZWNvcmRzKCknO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMpLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyhvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCB0dGxPcHRpb25zID0gb3B0aW9ucy50dGwgIT09IHVuZGVmaW5lZCA/IGAke29wdGlvbnMudHRsfSBzZWNvbmRzYCA6ICc2MCBzZWNvbmRzJztcbiAgICBjb25zdCBxcyA9XG4gICAgICAnQ1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04gaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpIFJFVFVSTlMgdm9pZCBMQU5HVUFHRSBwbHBnc3FsIEFTICQkIEJFR0lOIERFTEVURSBGUk9NIFwiX0lkZW1wb3RlbmN5XCIgV0hFUkUgZXhwaXJlIDwgTk9XKCkgLSBJTlRFUlZBTCAkMTsgRU5EOyAkJDsnO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMsIFt0dGxPcHRpb25zXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29udmVydFBvbHlnb25Ub1NRTChwb2x5Z29uKSB7XG4gIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgUG9seWdvbiBtdXN0IGhhdmUgYXQgbGVhc3QgMyB2YWx1ZXNgKTtcbiAgfVxuICBpZiAoXG4gICAgcG9seWdvblswXVswXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzBdIHx8XG4gICAgcG9seWdvblswXVsxXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzFdXG4gICkge1xuICAgIHBvbHlnb24ucHVzaChwb2x5Z29uWzBdKTtcbiAgfVxuICBjb25zdCB1bmlxdWUgPSBwb2x5Z29uLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgbGV0IGZvdW5kSW5kZXggPSAtMTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgaWYgKHB0WzBdID09PSBpdGVtWzBdICYmIHB0WzFdID09PSBpdGVtWzFdKSB7XG4gICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICB9KTtcbiAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICk7XG4gIH1cbiAgY29uc3QgcG9pbnRzID0gcG9seWdvblxuICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBhcnNlRmxvYXQocG9pbnRbMV0pLCBwYXJzZUZsb2F0KHBvaW50WzBdKSk7XG4gICAgICByZXR1cm4gYCgke3BvaW50WzFdfSwgJHtwb2ludFswXX0pYDtcbiAgICB9KVxuICAgIC5qb2luKCcsICcpO1xuICByZXR1cm4gYCgke3BvaW50c30pYDtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCkge1xuICBpZiAoIXJlZ2V4LmVuZHNXaXRoKCdcXG4nKSkge1xuICAgIHJlZ2V4ICs9ICdcXG4nO1xuICB9XG5cbiAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIGNvbW1lbnRzXG4gIHJldHVybiAoXG4gICAgcmVnZXhcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSkjLipcXG4vZ2ltLCAnJDEnKVxuICAgICAgLy8gcmVtb3ZlIGxpbmVzIHN0YXJ0aW5nIHdpdGggYSBjb21tZW50XG4gICAgICAucmVwbGFjZSgvXiMuKlxcbi9naW0sICcnKVxuICAgICAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIHdoaXRlc3BhY2VcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSlcXHMrL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSB3aGl0ZXNwYWNlIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBsaW5lXG4gICAgICAucmVwbGFjZSgvXlxccysvLCAnJylcbiAgICAgIC50cmltKClcbiAgKTtcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1JlZ2V4UGF0dGVybihzKSB7XG4gIGlmIChzICYmIHMuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgLy8gcmVnZXggZm9yIHN0YXJ0c1dpdGhcbiAgICByZXR1cm4gJ14nICsgbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDEpKTtcbiAgfSBlbHNlIGlmIChzICYmIHMuZW5kc1dpdGgoJyQnKSkge1xuICAgIC8vIHJlZ2V4IGZvciBlbmRzV2l0aFxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMuc2xpY2UoMCwgcy5sZW5ndGggLSAxKSkgKyAnJCc7XG4gIH1cblxuICAvLyByZWdleCBmb3IgY29udGFpbnNcbiAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocyk7XG59XG5cbmZ1bmN0aW9uIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlKSB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCAhdmFsdWUuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9cXF5cXFxcUS4qXFxcXEUvKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn1cblxuZnVuY3Rpb24gaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpIHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0uJHJlZ2V4KTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXS4kcmVnZXgpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgodmFsdWVzKSB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gaXNTdGFydHNXaXRoUmVnZXgodmFsdWUuJHJlZ2V4KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpIHtcbiAgcmV0dXJuIHJlbWFpbmluZ1xuICAgIC5zcGxpdCgnJylcbiAgICAubWFwKGMgPT4ge1xuICAgICAgY29uc3QgcmVnZXggPSBSZWdFeHAoJ1swLTkgXXxcXFxccHtMfScsICd1Jyk7IC8vIFN1cHBvcnQgYWxsIHVuaWNvZGUgbGV0dGVyIGNoYXJzXG4gICAgICBpZiAoYy5tYXRjaChyZWdleCkgIT09IG51bGwpIHtcbiAgICAgICAgLy8gZG9uJ3QgZXNjYXBlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzXG4gICAgICAgIHJldHVybiBjO1xuICAgICAgfVxuICAgICAgLy8gZXNjYXBlIGV2ZXJ5dGhpbmcgZWxzZSAoc2luZ2xlIHF1b3RlcyB3aXRoIHNpbmdsZSBxdW90ZXMsIGV2ZXJ5dGhpbmcgZWxzZSB3aXRoIGEgYmFja3NsYXNoKVxuICAgICAgcmV0dXJuIGMgPT09IGAnYCA/IGAnJ2AgOiBgXFxcXCR7Y31gO1xuICAgIH0pXG4gICAgLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBsaXRlcmFsaXplUmVnZXhQYXJ0KHM6IHN0cmluZykge1xuICBjb25zdCBtYXRjaGVyMSA9IC9cXFxcUSgoPyFcXFxcRSkuKilcXFxcRSQvO1xuICBjb25zdCByZXN1bHQxOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIxKTtcbiAgaWYgKHJlc3VsdDEgJiYgcmVzdWx0MS5sZW5ndGggPiAxICYmIHJlc3VsdDEuaW5kZXggPiAtMSkge1xuICAgIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgYW5kIGFuIGVuZCBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cigwLCByZXN1bHQxLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQxWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gcHJvY2VzcyByZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgY29uc3QgbWF0Y2hlcjIgPSAvXFxcXFEoKD8hXFxcXEUpLiopJC87XG4gIGNvbnN0IHJlc3VsdDI6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjIpO1xuICBpZiAocmVzdWx0MiAmJiByZXN1bHQyLmxlbmd0aCA+IDEgJiYgcmVzdWx0Mi5pbmRleCA+IC0xKSB7XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHIoMCwgcmVzdWx0Mi5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MlsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHJlbW92ZSBhbGwgaW5zdGFuY2VzIG9mIFxcUSBhbmQgXFxFIGZyb20gdGhlIHJlbWFpbmluZyB0ZXh0ICYgZXNjYXBlIHNpbmdsZSBxdW90ZXNcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxFKS8sICckMScpXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcUSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC9eXFxcXEUvLCAnJylcbiAgICAucmVwbGFjZSgvXlxcXFxRLywgJycpXG4gICAgLnJlcGxhY2UoLyhbXiddKScvLCBgJDEnJ2ApXG4gICAgLnJlcGxhY2UoL14nKFteJ10pLywgYCcnJDFgKTtcbn1cblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnO1xuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0E7QUFFQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQW1EO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUVuRCxNQUFNQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztBQUV2QyxNQUFNQyxpQ0FBaUMsR0FBRyxPQUFPO0FBQ2pELE1BQU1DLDhCQUE4QixHQUFHLE9BQU87QUFDOUMsTUFBTUMsNEJBQTRCLEdBQUcsT0FBTztBQUM1QyxNQUFNQywwQkFBMEIsR0FBRyxPQUFPO0FBQzFDLE1BQU1DLGlDQUFpQyxHQUFHLE9BQU87QUFDakQsTUFBTUMsTUFBTSxHQUFHTixPQUFPLENBQUMsaUJBQWlCLENBQUM7QUFFekMsTUFBTU8sS0FBSyxHQUFHLFVBQVUsR0FBR0MsSUFBUyxFQUFFO0VBQ3BDQSxJQUFJLEdBQUcsQ0FBQyxNQUFNLEdBQUdDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDQyxNQUFNLENBQUNGLElBQUksQ0FBQ0csS0FBSyxDQUFDLENBQUMsRUFBRUgsSUFBSSxDQUFDSSxNQUFNLENBQUMsQ0FBQztFQUNqRSxNQUFNQyxHQUFHLEdBQUdQLE1BQU0sQ0FBQ1EsU0FBUyxFQUFFO0VBQzlCRCxHQUFHLENBQUNOLEtBQUssQ0FBQ1EsS0FBSyxDQUFDRixHQUFHLEVBQUVMLElBQUksQ0FBQztBQUM1QixDQUFDO0FBRUQsTUFBTVEsdUJBQXVCLEdBQUdDLElBQUksSUFBSTtFQUN0QyxRQUFRQSxJQUFJLENBQUNBLElBQUk7SUFDZixLQUFL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