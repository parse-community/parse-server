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
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } // -disable-next
// -disable-next
// -disable-next
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUG9zdGdyZXNDbGllbnQiLCJyZXF1aXJlIiwiX25vZGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2xvZGFzaCIsIl91dWlkIiwiX3NxbCIsIl9TdG9yYWdlQWRhcHRlciIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsIm9iamVjdCIsImVudW1lcmFibGVPbmx5Iiwia2V5cyIsIk9iamVjdCIsImdldE93blByb3BlcnR5U3ltYm9scyIsInN5bWJvbHMiLCJmaWx0ZXIiLCJzeW0iLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsInRhcmdldCIsImkiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJzb3VyY2UiLCJmb3JFYWNoIiwia2V5IiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsImNhbGwiLCJUeXBlRXJyb3IiLCJOdW1iZXIiLCJVdGlscyIsIlBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvciIsIlBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciIsIlBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IiLCJQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsImxvZ2dlciIsImRlYnVnIiwiYXJncyIsImNvbmNhdCIsInNsaWNlIiwibG9nIiwiZ2V0TG9nZ2VyIiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlIiwicG9zdGdyZXNWYWx1ZSIsImNhc3RUeXBlIiwidHJhbnNmb3JtVmFsdWUiLCJvYmplY3RJZCIsImVtcHR5Q0xQUyIsImZyZWV6ZSIsImZpbmQiLCJnZXQiLCJjb3VudCIsImNyZWF0ZSIsInVwZGF0ZSIsImRlbGV0ZSIsImFkZEZpZWxkIiwicHJvdGVjdGVkRmllbGRzIiwiZGVmYXVsdENMUFMiLCJ0b1BhcnNlU2NoZW1hIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2hhc2hlZF9wYXNzd29yZCIsIl93cGVybSIsIl9ycGVybSIsImNscHMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwidG9Qb3N0Z3Jlc1NjaGVtYSIsIl9wYXNzd29yZF9oaXN0b3J5IiwiaGFuZGxlRG90RmllbGRzIiwiZmllbGROYW1lIiwiaW5kZXhPZiIsImNvbXBvbmVudHMiLCJzcGxpdCIsImZpcnN0Iiwic2hpZnQiLCJjdXJyZW50T2JqIiwibmV4dCIsIl9fb3AiLCJ0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyIsIm1hcCIsImNtcHQiLCJpbmRleCIsInRyYW5zZm9ybURvdEZpZWxkIiwiam9pbiIsInRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkIiwic3Vic3RyaW5nIiwidmFsaWRhdGVLZXlzIiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwiam9pblRhYmxlc0ZvclNjaGVtYSIsImxpc3QiLCJmaWVsZCIsImJ1aWxkV2hlcmVDbGF1c2UiLCJxdWVyeSIsImNhc2VJbnNlbnNpdGl2ZSIsInBhdHRlcm5zIiwidmFsdWVzIiwic29ydHMiLCJpc0FycmF5RmllbGQiLCJpbml0aWFsUGF0dGVybnNMZW5ndGgiLCJmaWVsZFZhbHVlIiwiJGV4aXN0cyIsImF1dGhEYXRhTWF0Y2giLCJtYXRjaCIsIiRpbiIsIiRyZWdleCIsIk1BWF9JTlRfUExVU19PTkUiLCJjbGF1c2VzIiwiY2xhdXNlVmFsdWVzIiwic3ViUXVlcnkiLCJjbGF1c2UiLCJwYXR0ZXJuIiwib3JPckFuZCIsIm5vdCIsIiRuZSIsImNvbnN0cmFpbnRGaWVsZE5hbWUiLCIkcmVsYXRpdmVUaW1lIiwiSU5WQUxJRF9KU09OIiwicG9pbnQiLCJsb25naXR1ZGUiLCJsYXRpdHVkZSIsIiRlcSIsImlzSW5Pck5pbiIsIkFycmF5IiwiaXNBcnJheSIsIiRuaW4iLCJpblBhdHRlcm5zIiwiYWxsb3dOdWxsIiwibGlzdEVsZW0iLCJsaXN0SW5kZXgiLCJjcmVhdGVDb25zdHJhaW50IiwiYmFzZUFycmF5Iiwibm90SW4iLCJfIiwiZmxhdE1hcCIsImVsdCIsIiRhbGwiLCJpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoIiwiaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSIsInByb2Nlc3NSZWdleFBhdHRlcm4iLCIkY29udGFpbmVkQnkiLCJhcnIiLCIkdGV4dCIsInNlYXJjaCIsIiRzZWFyY2giLCJsYW5ndWFnZSIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwiJG5lYXJTcGhlcmUiLCJkaXN0YW5jZSIsIiRtYXhEaXN0YW5jZSIsImRpc3RhbmNlSW5LTSIsIiR3aXRoaW4iLCIkYm94IiwiYm94IiwibGVmdCIsImJvdHRvbSIsInJpZ2h0IiwidG9wIiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJjZW50ZXJTcGhlcmUiLCJHZW9Qb2ludCIsIkdlb1BvaW50Q29kZXIiLCJpc1ZhbGlkSlNPTiIsIl92YWxpZGF0ZSIsImlzTmFOIiwiJHBvbHlnb24iLCJwb2x5Z29uIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCIkZ2VvSW50ZXJzZWN0cyIsIiRwb2ludCIsInJlZ2V4Iiwib3BlcmF0b3IiLCJvcHRzIiwiJG9wdGlvbnMiLCJyZW1vdmVXaGl0ZVNwYWNlIiwiY29udmVydFBvbHlnb25Ub1NRTCIsImNtcCIsInBnQ29tcGFyYXRvciIsInBhcnNlclJlc3VsdCIsInJlbGF0aXZlVGltZVRvRGF0ZSIsInN0YXR1cyIsInJlc3VsdCIsImNvbnNvbGUiLCJlcnJvciIsImluZm8iLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIm9wdGlvbnMiLCJfY29sbGVjdGlvblByZWZpeCIsImVuYWJsZVNjaGVtYUhvb2tzIiwic2NoZW1hQ2FjaGVUdGwiLCJkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24iLCJjbGllbnQiLCJwZ3AiLCJjcmVhdGVDbGllbnQiLCJfY2xpZW50IiwiX29uY2hhbmdlIiwiX3BncCIsInV1aWR2NCIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJ3YXRjaCIsImNhbGxiYWNrIiwiY3JlYXRlRXhwbGFpbmFibGVRdWVyeSIsImFuYWx5emUiLCJoYW5kbGVTaHV0ZG93biIsIl9zdHJlYW0iLCJkb25lIiwiJHBvb2wiLCJlbmQiLCJfbGlzdGVuVG9TY2hlbWEiLCJjb25uZWN0IiwiZGlyZWN0Iiwib24iLCJkYXRhIiwicGF5bG9hZCIsInBhcnNlIiwic2VuZGVySWQiLCJub25lIiwiX25vdGlmeVNjaGVtYUNoYW5nZSIsImNhdGNoIiwiX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMiLCJjb25uIiwiY2xhc3NFeGlzdHMiLCJvbmUiLCJhIiwiZXhpc3RzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInRhc2siLCJ0Iiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJzdWJtaXR0ZWRJbmRleGVzIiwiZXhpc3RpbmdJbmRleGVzIiwic2VsZiIsIlByb21pc2UiLCJyZXNvbHZlIiwiX2lkXyIsIl9pZCIsImRlbGV0ZWRJbmRleGVzIiwiaW5zZXJ0ZWRJbmRleGVzIiwiSU5WQUxJRF9RVUVSWSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwidHgiLCJjcmVhdGVJbmRleGVzIiwiZSIsIl9lJGVycm9ycyIsIl9lJGVycm9ycyQiLCJjb2x1bW5Eb2VzTm90RXhpc3RFcnJvciIsImVycm9ycyIsImNvZGUiLCJkcm9wSW5kZXhlcyIsImNyZWF0ZUNsYXNzIiwicGFyc2VTY2hlbWEiLCJjcmVhdGVUYWJsZSIsImVyciIsImRldGFpbCIsIkRVUExJQ0FURV9WQUxVRSIsInZhbHVlc0FycmF5IiwicGF0dGVybnNBcnJheSIsImFzc2lnbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfZmFpbGVkX2xvZ2luX2NvdW50IiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJyZWxhdGlvbnMiLCJwYXJzZVR5cGUiLCJxcyIsImJhdGNoIiwiam9pblRhYmxlIiwic2NoZW1hVXBncmFkZSIsImNvbHVtbnMiLCJjb2x1bW5fbmFtZSIsIm5ld0NvbHVtbnMiLCJpdGVtIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsInBvc3RncmVzVHlwZSIsImFueSIsInBhdGgiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJkZWxldGVDbGFzcyIsIm9wZXJhdGlvbnMiLCJyZXNwb25zZSIsImhlbHBlcnMiLCJ0aGVuIiwiZGVsZXRlQWxsQ2xhc3NlcyIsIl90aGlzJF9jbGllbnQiLCJub3ciLCJEYXRlIiwiZ2V0VGltZSIsImVuZGVkIiwicmVzdWx0cyIsImpvaW5zIiwicmVkdWNlIiwiY2xhc3NlcyIsInF1ZXJpZXMiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwiaWR4IiwiZ2V0QWxsQ2xhc3NlcyIsInJvdyIsImdldENsYXNzIiwiY3JlYXRlT2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2x1bW5zQXJyYXkiLCJnZW9Qb2ludHMiLCJhdXRoRGF0YUFscmVhZHlFeGlzdHMiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicG9wIiwiaW5pdGlhbFZhbHVlcyIsInZhbCIsInRlcm1pbmF0aW9uIiwiZ2VvUG9pbnRzSW5qZWN0cyIsImwiLCJjb2x1bW5zUGF0dGVybiIsImNvbCIsInZhbHVlc1BhdHRlcm4iLCJwcm9taXNlIiwib3BzIiwidW5kZXJseWluZ0Vycm9yIiwiY29uc3RyYWludCIsIm1hdGNoZXMiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsIndoZXJlIiwiT0JKRUNUX05PVF9GT1VORCIsImZpbmRPbmVBbmRVcGRhdGUiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwZGF0ZVBhdHRlcm5zIiwib3JpZ2luYWxVcGRhdGUiLCJkb3ROb3RhdGlvbk9wdGlvbnMiLCJnZW5lcmF0ZSIsImpzb25iIiwibGFzdEtleSIsImZpZWxkTmFtZUluZGV4Iiwic3RyIiwiYW1vdW50Iiwib2JqZWN0cyIsImtleXNUb0luY3JlbWVudCIsImsiLCJpbmNyZW1lbnRQYXR0ZXJucyIsImMiLCJrZXlzVG9EZWxldGUiLCJkZWxldGVQYXR0ZXJucyIsInAiLCJ1cGRhdGVPYmplY3QiLCJleHBlY3RlZFR5cGUiLCJyZWplY3QiLCJ3aGVyZUNsYXVzZSIsInVwc2VydE9uZU9iamVjdCIsImNyZWF0ZVZhbHVlIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImV4cGxhaW4iLCJoYXNMaW1pdCIsImhhc1NraXAiLCJ3aGVyZVBhdHRlcm4iLCJsaW1pdFBhdHRlcm4iLCJza2lwUGF0dGVybiIsInNvcnRQYXR0ZXJuIiwic29ydENvcHkiLCJzb3J0aW5nIiwidHJhbnNmb3JtS2V5IiwibWVtbyIsIm9yaWdpbmFsUXVlcnkiLCJwb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QiLCJ0YXJnZXRDbGFzcyIsInkiLCJ4IiwiY29vcmRzIiwidXBkYXRlZENvb3JkcyIsInBhcnNlRmxvYXQiLCJjcmVhdGVkQXQiLCJ0b0lTT1N0cmluZyIsInVwZGF0ZWRBdCIsImV4cGlyZXNBdCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJjb25zdHJhaW50TmFtZSIsImNvbnN0cmFpbnRQYXR0ZXJucyIsIm1lc3NhZ2UiLCJyZWFkUHJlZmVyZW5jZSIsImVzdGltYXRlIiwiYXBwcm94aW1hdGVfcm93X2NvdW50IiwiZGlzdGluY3QiLCJjb2x1bW4iLCJpc05lc3RlZCIsImlzUG9pbnRlckZpZWxkIiwidHJhbnNmb3JtZXIiLCJjaGlsZCIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwiY291bnRGaWVsZCIsImdyb3VwVmFsdWVzIiwiZ3JvdXBQYXR0ZXJuIiwic3RhZ2UiLCIkZ3JvdXAiLCJncm91cEJ5RmllbGRzIiwiYWxpYXMiLCJvcGVyYXRpb24iLCIkc3VtIiwiJG1heCIsIiRtaW4iLCIkYXZnIiwiJHByb2plY3QiLCIkbWF0Y2giLCIkb3IiLCJjb2xsYXBzZSIsImVsZW1lbnQiLCJtYXRjaFBhdHRlcm5zIiwiJGxpbWl0IiwiJHNraXAiLCIkc29ydCIsIm9yZGVyIiwidHJpbSIsIkJvb2xlYW4iLCJwYXJzZUludCIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJwcm9taXNlcyIsIklOVkFMSURfQ0xBU1NfTkFNRSIsImFsbCIsInNxbCIsIm1pc2MiLCJqc29uT2JqZWN0U2V0S2V5cyIsImFycmF5IiwiYWRkIiwiYWRkVW5pcXVlIiwicmVtb3ZlIiwiY29udGFpbnNBbGwiLCJjb250YWluc0FsbFJlZ2V4IiwiY29udGFpbnMiLCJjdHgiLCJkdXJhdGlvbiIsImNyZWF0ZUluZGV4ZXNJZk5lZWRlZCIsImdldEluZGV4ZXMiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsInVwZGF0ZUVzdGltYXRlZENvdW50IiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJlbnN1cmVJbmRleCIsImluZGV4TmFtZSIsImRlZmF1bHRJbmRleE5hbWUiLCJpbmRleE5hbWVPcHRpb25zIiwic2V0SWRlbXBvdGVuY3lGdW5jdGlvbiIsImVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMiLCJkZWxldGVJZGVtcG90ZW5jeUZ1bmN0aW9uIiwidHRsT3B0aW9ucyIsInR0bCIsImV4cG9ydHMiLCJ1bmlxdWUiLCJhciIsImZvdW5kSW5kZXgiLCJwdCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImVuZHNXaXRoIiwicmVwbGFjZSIsInMiLCJzdGFydHNXaXRoIiwibGl0ZXJhbGl6ZVJlZ2V4UGFydCIsImlzU3RhcnRzV2l0aFJlZ2V4IiwiZmlyc3RWYWx1ZXNJc1JlZ2V4Iiwic29tZSIsImNyZWF0ZUxpdGVyYWxSZWdleCIsInJlbWFpbmluZyIsIlJlZ0V4cCIsIm1hdGNoZXIxIiwicmVzdWx0MSIsInByZWZpeCIsIm1hdGNoZXIyIiwicmVzdWx0MiIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAnLi9Qb3N0Z3Jlc0NsaWVudCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5pbXBvcnQgc3FsIGZyb20gJy4vc3FsJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHR5cGUgeyBTY2hlbWFUeXBlLCBRdWVyeVR5cGUsIFF1ZXJ5T3B0aW9ucyB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcbmNvbnN0IFV0aWxzID0gcmVxdWlyZSgnLi4vLi4vLi4vVXRpbHMnKTtcblxuY29uc3QgUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yID0gJzQyUDAxJztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciA9ICc0MlAwNyc7XG5jb25zdCBQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yID0gJzQyNzAxJztcbmNvbnN0IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yID0gJzQyNzAzJztcbmNvbnN0IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciA9ICcyMzUwNSc7XG5jb25zdCBsb2dnZXIgPSByZXF1aXJlKCcuLi8uLi8uLi9sb2dnZXInKTtcblxuY29uc3QgZGVidWcgPSBmdW5jdGlvbiAoLi4uYXJnczogYW55KSB7XG4gIGFyZ3MgPSBbJ1BHOiAnICsgYXJndW1lbnRzWzBdXS5jb25jYXQoYXJncy5zbGljZSgxLCBhcmdzLmxlbmd0aCkpO1xuICBjb25zdCBsb2cgPSBsb2dnZXIuZ2V0TG9nZ2VyKCk7XG4gIGxvZy5kZWJ1Zy5hcHBseShsb2csIGFyZ3MpO1xufTtcblxuY29uc3QgcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUgPSB0eXBlID0+IHtcbiAgc3dpdGNoICh0eXBlLnR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiAndGltZXN0YW1wIHdpdGggdGltZSB6b25lJztcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdib29sZWFuJztcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiAnZG91YmxlIHByZWNpc2lvbic7XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuICdwb2ludCc7XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gJ3BvbHlnb24nO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIGlmICh0eXBlLmNvbnRlbnRzICYmIHR5cGUuY29udGVudHMudHlwZSA9PT0gJ1N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuICd0ZXh0W10nO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IGBubyB0eXBlIGZvciAke0pTT04uc3RyaW5naWZ5KHR5cGUpfSB5ZXRgO1xuICB9XG59O1xuXG5jb25zdCBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IgPSB7XG4gICRndDogJz4nLFxuICAkbHQ6ICc8JyxcbiAgJGd0ZTogJz49JyxcbiAgJGx0ZTogJzw9Jyxcbn07XG5cbmNvbnN0IG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3JlcyA9IHtcbiAgJGRheU9mTW9udGg6ICdEQVknLFxuICAkZGF5T2ZXZWVrOiAnRE9XJyxcbiAgJGRheU9mWWVhcjogJ0RPWScsXG4gICRpc29EYXlPZldlZWs6ICdJU09ET1cnLFxuICAkaXNvV2Vla1llYXI6ICdJU09ZRUFSJyxcbiAgJGhvdXI6ICdIT1VSJyxcbiAgJG1pbnV0ZTogJ01JTlVURScsXG4gICRzZWNvbmQ6ICdTRUNPTkQnLFxuICAkbWlsbGlzZWNvbmQ6ICdNSUxMSVNFQ09ORFMnLFxuICAkbW9udGg6ICdNT05USCcsXG4gICR3ZWVrOiAnV0VFSycsXG4gICR5ZWFyOiAnWUVBUicsXG59O1xuXG5jb25zdCB0b1Bvc3RncmVzVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICByZXR1cm4gdmFsdWUuaXNvO1xuICAgIH1cbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZSA9IHZhbHVlID0+IHtcbiAgY29uc3QgcG9zdGdyZXNWYWx1ZSA9IHRvUG9zdGdyZXNWYWx1ZSh2YWx1ZSk7XG4gIGxldCBjYXN0VHlwZTtcbiAgc3dpdGNoICh0eXBlb2YgcG9zdGdyZXNWYWx1ZSkge1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICBjYXN0VHlwZSA9ICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgY2FzdFR5cGUgPSAnYm9vbGVhbic7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgY2FzdFR5cGUgPSB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIGNhc3RUeXBlO1xufTtcblxuY29uc3QgdHJhbnNmb3JtVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgcmV0dXJuIHZhbHVlLm9iamVjdElkO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbi8vIER1cGxpY2F0ZSBmcm9tIHRoZW4gbW9uZ28gYWRhcHRlci4uLlxuY29uc3QgZW1wdHlDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHt9LFxuICBnZXQ6IHt9LFxuICBjb3VudDoge30sXG4gIGNyZWF0ZToge30sXG4gIHVwZGF0ZToge30sXG4gIGRlbGV0ZToge30sXG4gIGFkZEZpZWxkOiB7fSxcbiAgcHJvdGVjdGVkRmllbGRzOiB7fSxcbn0pO1xuXG5jb25zdCBkZWZhdWx0Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7ICcqJzogdHJ1ZSB9LFxuICBnZXQ6IHsgJyonOiB0cnVlIH0sXG4gIGNvdW50OiB7ICcqJzogdHJ1ZSB9LFxuICBjcmVhdGU6IHsgJyonOiB0cnVlIH0sXG4gIHVwZGF0ZTogeyAnKic6IHRydWUgfSxcbiAgZGVsZXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBhZGRGaWVsZDogeyAnKic6IHRydWUgfSxcbiAgcHJvdGVjdGVkRmllbGRzOiB7ICcqJzogW10gfSxcbn0pO1xuXG5jb25zdCB0b1BhcnNlU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICB9XG4gIGlmIChzY2hlbWEuZmllbGRzKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgfVxuICBsZXQgY2xwcyA9IGRlZmF1bHRDTFBTO1xuICBpZiAoc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucykge1xuICAgIGNscHMgPSB7IC4uLmVtcHR5Q0xQUywgLi4uc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyB9O1xuICB9XG4gIGxldCBpbmRleGVzID0ge307XG4gIGlmIChzY2hlbWEuaW5kZXhlcykge1xuICAgIGluZGV4ZXMgPSB7IC4uLnNjaGVtYS5pbmRleGVzIH07XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBjbGFzc05hbWU6IHNjaGVtYS5jbGFzc05hbWUsXG4gICAgZmllbGRzOiBzY2hlbWEuZmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogY2xwcyxcbiAgICBpbmRleGVzLFxuICB9O1xufTtcblxuY29uc3QgdG9Qb3N0Z3Jlc1NjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGlmICghc2NoZW1hKSB7XG4gICAgcmV0dXJuIHNjaGVtYTtcbiAgfVxuICBzY2hlbWEuZmllbGRzID0gc2NoZW1hLmZpZWxkcyB8fCB7fTtcbiAgc2NoZW1hLmZpZWxkcy5fd3Blcm0gPSB7IHR5cGU6ICdBcnJheScsIGNvbnRlbnRzOiB7IHR5cGU6ICdTdHJpbmcnIH0gfTtcbiAgc2NoZW1hLmZpZWxkcy5fcnBlcm0gPSB7IHR5cGU6ICdBcnJheScsIGNvbnRlbnRzOiB7IHR5cGU6ICdTdHJpbmcnIH0gfTtcbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgc2NoZW1hLmZpZWxkcy5fcGFzc3dvcmRfaGlzdG9yeSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICB9XG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG5jb25zdCBoYW5kbGVEb3RGaWVsZHMgPSBvYmplY3QgPT4ge1xuICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICBjb25zdCBjb21wb25lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBmaXJzdCA9IGNvbXBvbmVudHMuc2hpZnQoKTtcbiAgICAgIG9iamVjdFtmaXJzdF0gPSBvYmplY3RbZmlyc3RdIHx8IHt9O1xuICAgICAgbGV0IGN1cnJlbnRPYmogPSBvYmplY3RbZmlyc3RdO1xuICAgICAgbGV0IG5leHQ7XG4gICAgICBsZXQgdmFsdWUgPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgIGlmICh2YWx1ZSAmJiB2YWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB2YWx1ZSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbmQtYXNzaWduICovXG4gICAgICB3aGlsZSAoKG5leHQgPSBjb21wb25lbnRzLnNoaWZ0KCkpKSB7XG4gICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IGN1cnJlbnRPYmpbbmV4dF0gfHwge307XG4gICAgICAgIGlmIChjb21wb25lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGN1cnJlbnRPYmpbbmV4dF0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBjdXJyZW50T2JqID0gY3VycmVudE9ialtuZXh0XTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMgPSBmaWVsZE5hbWUgPT4ge1xuICByZXR1cm4gZmllbGROYW1lLnNwbGl0KCcuJykubWFwKChjbXB0LCBpbmRleCkgPT4ge1xuICAgIGlmIChpbmRleCA9PT0gMCkge1xuICAgICAgcmV0dXJuIGBcIiR7Y21wdH1cImA7XG4gICAgfVxuICAgIHJldHVybiBgJyR7Y21wdH0nYDtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID09PSAtMSkge1xuICAgIHJldHVybiBgXCIke2ZpZWxkTmFtZX1cImA7XG4gIH1cbiAgY29uc3QgY29tcG9uZW50cyA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGZpZWxkTmFtZSk7XG4gIGxldCBuYW1lID0gY29tcG9uZW50cy5zbGljZSgwLCBjb21wb25lbnRzLmxlbmd0aCAtIDEpLmpvaW4oJy0+Jyk7XG4gIG5hbWUgKz0gJy0+PicgKyBjb21wb25lbnRzW2NvbXBvbmVudHMubGVuZ3RoIC0gMV07XG4gIHJldHVybiBuYW1lO1xufTtcblxuY29uc3QgdHJhbnNmb3JtQWdncmVnYXRlRmllbGQgPSBmaWVsZE5hbWUgPT4ge1xuICBpZiAodHlwZW9mIGZpZWxkTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gZmllbGROYW1lO1xuICB9XG4gIGlmIChmaWVsZE5hbWUgPT09ICckX2NyZWF0ZWRfYXQnKSB7XG4gICAgcmV0dXJuICdjcmVhdGVkQXQnO1xuICB9XG4gIGlmIChmaWVsZE5hbWUgPT09ICckX3VwZGF0ZWRfYXQnKSB7XG4gICAgcmV0dXJuICd1cGRhdGVkQXQnO1xuICB9XG4gIHJldHVybiBmaWVsZE5hbWUuc3Vic3RyaW5nKDEpO1xufTtcblxuY29uc3QgdmFsaWRhdGVLZXlzID0gb2JqZWN0ID0+IHtcbiAgaWYgKHR5cGVvZiBvYmplY3QgPT0gJ29iamVjdCcpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICAgIGlmICh0eXBlb2Ygb2JqZWN0W2tleV0gPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdmFsaWRhdGVLZXlzKG9iamVjdFtrZXldKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGtleS5pbmNsdWRlcygnJCcpIHx8IGtleS5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG4vLyBSZXR1cm5zIHRoZSBsaXN0IG9mIGpvaW4gdGFibGVzIG9uIGEgc2NoZW1hXG5jb25zdCBqb2luVGFibGVzRm9yU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgY29uc3QgbGlzdCA9IFtdO1xuICBpZiAoc2NoZW1hKSB7XG4gICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZCA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBsaXN0LnB1c2goYF9Kb2luOiR7ZmllbGR9OiR7c2NoZW1hLmNsYXNzTmFtZX1gKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gbGlzdDtcbn07XG5cbmludGVyZmFjZSBXaGVyZUNsYXVzZSB7XG4gIHBhdHRlcm46IHN0cmluZztcbiAgdmFsdWVzOiBBcnJheTxhbnk+O1xuICBzb3J0czogQXJyYXk8YW55Pjtcbn1cblxuY29uc3QgYnVpbGRXaGVyZUNsYXVzZSA9ICh7IHNjaGVtYSwgcXVlcnksIGluZGV4LCBjYXNlSW5zZW5zaXRpdmUgfSk6IFdoZXJlQ2xhdXNlID0+IHtcbiAgY29uc3QgcGF0dGVybnMgPSBbXTtcbiAgbGV0IHZhbHVlcyA9IFtdO1xuICBjb25zdCBzb3J0cyA9IFtdO1xuXG4gIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcbiAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gcXVlcnkpIHtcbiAgICBjb25zdCBpc0FycmF5RmllbGQgPVxuICAgICAgc2NoZW1hLmZpZWxkcyAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSc7XG4gICAgY29uc3QgaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID0gcGF0dGVybnMubGVuZ3RoO1xuICAgIGNvbnN0IGZpZWxkVmFsdWUgPSBxdWVyeVtmaWVsZE5hbWVdO1xuXG4gICAgLy8gbm90aGluZyBpbiB0aGUgc2NoZW1hLCBpdCdzIGdvbm5hIGJsb3cgdXBcbiAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgLy8gYXMgaXQgd29uJ3QgZXhpc3RcbiAgICAgIGlmIChmaWVsZFZhbHVlICYmIGZpZWxkVmFsdWUuJGV4aXN0cyA9PT0gZmFsc2UpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgLy8gVE9ETzogSGFuZGxlIHF1ZXJ5aW5nIGJ5IF9hdXRoX2RhdGFfcHJvdmlkZXIsIGF1dGhEYXRhIGlzIHN0b3JlZCBpbiBhdXRoRGF0YSBmaWVsZFxuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmIChjYXNlSW5zZW5zaXRpdmUgJiYgKGZpZWxkTmFtZSA9PT0gJ3VzZXJuYW1lJyB8fCBmaWVsZE5hbWUgPT09ICdlbWFpbCcpKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGBMT1dFUigkJHtpbmRleH06bmFtZSkgPSBMT1dFUigkJHtpbmRleCArIDF9KWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgIGxldCBuYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgIGlmIChmaWVsZFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgSVMgTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChuYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgICBuYW1lID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06cmF3KTo6anNvbmIgQD4gJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChuYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRpbikpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS4kcmVnZXgpIHtcbiAgICAgICAgICAvLyBIYW5kbGUgbGF0ZXJcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3ID0gJCR7aW5kZXggKyAxfTo6dGV4dGApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgZmllbGRWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaW5kZXggKz0gMTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAvLyBDYW4ndCBjYXN0IGJvb2xlYW4gdG8gZG91YmxlIHByZWNpc2lvblxuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ051bWJlcicpIHtcbiAgICAgICAgLy8gU2hvdWxkIGFsd2F5cyByZXR1cm4gemVybyByZXN1bHRzXG4gICAgICAgIGNvbnN0IE1BWF9JTlRfUExVU19PTkUgPSA5MjIzMzcyMDM2ODU0Nzc1ODA4O1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIE1BWF9JTlRfUExVU19PTkUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChbJyRvcicsICckbm9yJywgJyRhbmQnXS5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICBjb25zdCBjbGF1c2VzID0gW107XG4gICAgICBjb25zdCBjbGF1c2VWYWx1ZXMgPSBbXTtcbiAgICAgIGZpZWxkVmFsdWUuZm9yRWFjaChzdWJRdWVyeSA9PiB7XG4gICAgICAgIGNvbnN0IGNsYXVzZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICBxdWVyeTogc3ViUXVlcnksXG4gICAgICAgICAgaW5kZXgsXG4gICAgICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKGNsYXVzZS5wYXR0ZXJuLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjbGF1c2VzLnB1c2goY2xhdXNlLnBhdHRlcm4pO1xuICAgICAgICAgIGNsYXVzZVZhbHVlcy5wdXNoKC4uLmNsYXVzZS52YWx1ZXMpO1xuICAgICAgICAgIGluZGV4ICs9IGNsYXVzZS52YWx1ZXMubGVuZ3RoO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgY29uc3Qgb3JPckFuZCA9IGZpZWxkTmFtZSA9PT0gJyRhbmQnID8gJyBBTkQgJyA6ICcgT1IgJztcbiAgICAgIGNvbnN0IG5vdCA9IGZpZWxkTmFtZSA9PT0gJyRub3InID8gJyBOT1QgJyA6ICcnO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAke25vdH0oJHtjbGF1c2VzLmpvaW4ob3JPckFuZCl9KWApO1xuICAgICAgdmFsdWVzLnB1c2goLi4uY2xhdXNlVmFsdWVzKTtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kbmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICBmaWVsZFZhbHVlLiRuZSA9IEpTT04uc3RyaW5naWZ5KFtmaWVsZFZhbHVlLiRuZV0pO1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBOT1QgYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGRWYWx1ZS4kbmUgPT09IG51bGwpIHtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOT1QgTlVMTGApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBpZiBub3QgbnVsbCwgd2UgbmVlZCB0byBtYW51YWxseSBleGNsdWRlIG51bGxcbiAgICAgICAgICBpZiAoZmllbGRWYWx1ZS4kbmUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICBgKCQke2luZGV4fTpuYW1lIDw+IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pIE9SICQke2luZGV4fTpuYW1lIElTIE5VTEwpYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgICAgICBjb25zdCBjYXN0VHlwZSA9IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlKGZpZWxkVmFsdWUuJG5lKTtcbiAgICAgICAgICAgICAgY29uc3QgY29uc3RyYWludEZpZWxkTmFtZSA9IGNhc3RUeXBlXG4gICAgICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgICAgICA6IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgICAgYCgke2NvbnN0cmFpbnRGaWVsZE5hbWV9IDw+ICQke2luZGV4ICsgMX0gT1IgJHtjb25zdHJhaW50RmllbGROYW1lfSBJUyBOVUxMKWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJG5lID09PSAnb2JqZWN0JyAmJiBmaWVsZFZhbHVlLiRuZS4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpuYW1lIDw+ICQke2luZGV4ICsgMX0gT1IgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTClgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRuZTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlKTtcbiAgICAgICAgaW5kZXggKz0gMztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFRPRE86IHN1cHBvcnQgYXJyYXlzXG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS4kbmUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZmllbGRWYWx1ZS4kZXEgIT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGVxID09PSBudWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICBjb25zdCBjYXN0VHlwZSA9IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlKGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gY2FzdFR5cGVcbiAgICAgICAgICAgID8gYENBU1QgKCgke3RyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSl9KSBBUyAke2Nhc3RUeXBlfSlgXG4gICAgICAgICAgICA6IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGRWYWx1ZS4kZXEpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPSAkJHtpbmRleCsrfWApO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRlcSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kZXEuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS4kZXEpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgaXNJbk9yTmluID0gQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgfHwgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRuaW4pO1xuICAgIGlmIChcbiAgICAgIEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pICYmXG4gICAgICBpc0FycmF5RmllbGQgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cyAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzLnR5cGUgPT09ICdTdHJpbmcnXG4gICAgKSB7XG4gICAgICBjb25zdCBpblBhdHRlcm5zID0gW107XG4gICAgICBsZXQgYWxsb3dOdWxsID0gZmFsc2U7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgZmllbGRWYWx1ZS4kaW4uZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICBpZiAobGlzdEVsZW0gPT09IG51bGwpIHtcbiAgICAgICAgICBhbGxvd051bGwgPSB0cnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleCAtIChhbGxvd051bGwgPyAxIDogMCl9YCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKGFsbG93TnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9Om5hbWUgSVMgTlVMTCBPUiAkJHtpbmRleH06bmFtZSAmJiBBUlJBWVske2luUGF0dGVybnMuam9pbigpfV0pYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAmJiBBUlJBWVske2luUGF0dGVybnMuam9pbigpfV1gKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ID0gaW5kZXggKyAxICsgaW5QYXR0ZXJucy5sZW5ndGg7XG4gICAgfSBlbHNlIGlmIChpc0luT3JOaW4pIHtcbiAgICAgIHZhciBjcmVhdGVDb25zdHJhaW50ID0gKGJhc2VBcnJheSwgbm90SW4pID0+IHtcbiAgICAgICAgY29uc3Qgbm90ID0gbm90SW4gPyAnIE5PVCAnIDogJyc7XG4gICAgICAgIGlmIChiYXNlQXJyYXkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoYmFzZUFycmF5KSk7XG4gICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBIYW5kbGUgTmVzdGVkIERvdCBOb3RhdGlvbiBBYm92ZVxuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBpblBhdHRlcm5zID0gW107XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgYmFzZUFycmF5LmZvckVhY2goKGxpc3RFbGVtLCBsaXN0SW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgaWYgKGxpc3RFbGVtICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChsaXN0RWxlbSk7XG4gICAgICAgICAgICAgICAgaW5QYXR0ZXJucy5wdXNoKGAkJHtpbmRleCArIDEgKyBsaXN0SW5kZXh9YCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJHtub3R9IElOICgke2luUGF0dGVybnMuam9pbigpfSlgKTtcbiAgICAgICAgICAgIGluZGV4ID0gaW5kZXggKyAxICsgaW5QYXR0ZXJucy5sZW5ndGg7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKCFub3RJbikge1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgICAgIGluZGV4ID0gaW5kZXggKyAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEhhbmRsZSBlbXB0eSBhcnJheVxuICAgICAgICAgIGlmIChub3RJbikge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaCgnMSA9IDEnKTsgLy8gUmV0dXJuIGFsbCB2YWx1ZXNcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaCgnMSA9IDInKTsgLy8gUmV0dXJuIG5vIHZhbHVlc1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRpbikge1xuICAgICAgICBjcmVhdGVDb25zdHJhaW50KFxuICAgICAgICAgIF8uZmxhdE1hcChmaWVsZFZhbHVlLiRpbiwgZWx0ID0+IGVsdCksXG4gICAgICAgICAgZmFsc2VcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZFZhbHVlLiRuaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChcbiAgICAgICAgICBfLmZsYXRNYXAoZmllbGRWYWx1ZS4kbmluLCBlbHQgPT4gZWx0KSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kaW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRpbiB2YWx1ZScpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJG5pbiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJG5pbiB2YWx1ZScpO1xuICAgIH1cblxuICAgIGlmIChBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGFsbCkgJiYgaXNBcnJheUZpZWxkKSB7XG4gICAgICBpZiAoaXNBbnlWYWx1ZVJlZ2V4U3RhcnRzV2l0aChmaWVsZFZhbHVlLiRhbGwpKSB7XG4gICAgICAgIGlmICghaXNBbGxWYWx1ZXNSZWdleE9yTm9uZShmaWVsZFZhbHVlLiRhbGwpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ0FsbCAkYWxsIHZhbHVlcyBtdXN0IGJlIG9mIHJlZ2V4IHR5cGUgb3Igbm9uZTogJyArIGZpZWxkVmFsdWUuJGFsbFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkVmFsdWUuJGFsbC5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gcHJvY2Vzc1JlZ2V4UGF0dGVybihmaWVsZFZhbHVlLiRhbGxbaV0uJHJlZ2V4KTtcbiAgICAgICAgICBmaWVsZFZhbHVlLiRhbGxbaV0gPSB2YWx1ZS5zdWJzdHJpbmcoMSkgKyAnJSc7XG4gICAgICAgIH1cbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnNfYWxsX3JlZ2V4KCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9Ojpqc29uYilgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zX2FsbCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYCk7XG4gICAgICB9XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGFsbCkpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGFsbC5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS4kYWxsWzBdLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGV4aXN0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXhpc3RzID09PSAnb2JqZWN0JyAmJiBmaWVsZFZhbHVlLiRleGlzdHMuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS4kZXhpc3RzKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICB9XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaW5kZXggKz0gMTtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kY29udGFpbmVkQnkpIHtcbiAgICAgIGNvbnN0IGFyciA9IGZpZWxkVmFsdWUuJGNvbnRhaW5lZEJ5O1xuICAgICAgaWYgKCEoYXJyIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJGNvbnRhaW5lZEJ5OiBzaG91bGQgYmUgYW4gYXJyYXlgKTtcbiAgICAgIH1cblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPEAgJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoYXJyKSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR0ZXh0KSB7XG4gICAgICBjb25zdCBzZWFyY2ggPSBmaWVsZFZhbHVlLiR0ZXh0LiRzZWFyY2g7XG4gICAgICBsZXQgbGFuZ3VhZ2UgPSAnZW5nbGlzaCc7XG4gICAgICBpZiAodHlwZW9mIHNlYXJjaCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJHNlYXJjaCwgc2hvdWxkIGJlIG9iamVjdGApO1xuICAgICAgfVxuICAgICAgaWYgKCFzZWFyY2guJHRlcm0gfHwgdHlwZW9mIHNlYXJjaC4kdGVybSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJHRlcm0sIHNob3VsZCBiZSBzdHJpbmdgKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGxhbmd1YWdlICYmIHR5cGVvZiBzZWFyY2guJGxhbmd1YWdlICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkbGFuZ3VhZ2UsIHNob3VsZCBiZSBzdHJpbmdgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRsYW5ndWFnZSkge1xuICAgICAgICBsYW5ndWFnZSA9IHNlYXJjaC4kbGFuZ3VhZ2U7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICYmIHR5cGVvZiBzZWFyY2guJGNhc2VTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRjYXNlU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUgbm90IHN1cHBvcnRlZCwgcGxlYXNlIHVzZSAkcmVnZXggb3IgY3JlYXRlIGEgc2VwYXJhdGUgbG93ZXIgY2FzZSBjb2x1bW4uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICYmIHR5cGVvZiBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlID09PSBmYWxzZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRkaWFjcml0aWNTZW5zaXRpdmUgLSBmYWxzZSBub3Qgc3VwcG9ydGVkLCBpbnN0YWxsIFBvc3RncmVzIFVuYWNjZW50IEV4dGVuc2lvbmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGB0b190c3ZlY3RvcigkJHtpbmRleH0sICQke2luZGV4ICsgMX06bmFtZSkgQEAgdG9fdHNxdWVyeSgkJHtpbmRleCArIDJ9LCAkJHtpbmRleCArIDN9KWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChsYW5ndWFnZSwgZmllbGROYW1lLCBsYW5ndWFnZSwgc2VhcmNoLiR0ZXJtKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJG5lYXJTcGhlcmUpIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kbmVhclNwaGVyZTtcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gZmllbGRWYWx1ZS4kbWF4RGlzdGFuY2U7XG4gICAgICBjb25zdCBkaXN0YW5jZUluS00gPSBkaXN0YW5jZSAqIDYzNzEgKiAxMDAwO1xuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICBzb3J0cy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSBBU0NgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kd2l0aGluICYmIGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94KSB7XG4gICAgICBjb25zdCBib3ggPSBmaWVsZFZhbHVlLiR3aXRoaW4uJGJveDtcbiAgICAgIGNvbnN0IGxlZnQgPSBib3hbMF0ubG9uZ2l0dWRlO1xuICAgICAgY29uc3QgYm90dG9tID0gYm94WzBdLmxhdGl0dWRlO1xuICAgICAgY29uc3QgcmlnaHQgPSBib3hbMV0ubG9uZ2l0dWRlO1xuICAgICAgY29uc3QgdG9wID0gYm94WzFdLmxhdGl0dWRlO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9pbnQgPEAgJCR7aW5kZXggKyAxfTo6Ym94YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoKCR7bGVmdH0sICR7Ym90dG9tfSksICgke3JpZ2h0fSwgJHt0b3B9KSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb1dpdGhpbiAmJiBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZSkge1xuICAgICAgY29uc3QgY2VudGVyU3BoZXJlID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRjZW50ZXJTcGhlcmU7XG4gICAgICBpZiAoIShjZW50ZXJTcGhlcmUgaW5zdGFuY2VvZiBBcnJheSkgfHwgY2VudGVyU3BoZXJlLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgc2hvdWxkIGJlIGFuIGFycmF5IG9mIFBhcnNlLkdlb1BvaW50IGFuZCBkaXN0YW5jZSdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIEdldCBwb2ludCwgY29udmVydCB0byBnZW8gcG9pbnQgaWYgbmVjZXNzYXJ5IGFuZCB2YWxpZGF0ZVxuICAgICAgbGV0IHBvaW50ID0gY2VudGVyU3BoZXJlWzBdO1xuICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICB9IGVsc2UgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBnZW8gcG9pbnQgaW52YWxpZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIC8vIEdldCBkaXN0YW5jZSBhbmQgdmFsaWRhdGVcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gY2VudGVyU3BoZXJlWzFdO1xuICAgICAgaWYgKGlzTmFOKGRpc3RhbmNlKSB8fCBkaXN0YW5jZSA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZGlzdGFuY2UgaW52YWxpZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSA8PSAkJHtpbmRleCArIDN9YFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSwgZGlzdGFuY2VJbktNKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb1dpdGhpbiAmJiBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJHBvbHlnb24pIHtcbiAgICAgIGNvbnN0IHBvbHlnb24gPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJHBvbHlnb247XG4gICAgICBsZXQgcG9pbnRzO1xuICAgICAgaWYgKHR5cGVvZiBwb2x5Z29uID09PSAnb2JqZWN0JyAmJiBwb2x5Z29uLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGlmICghcG9seWdvbi5jb29yZGluYXRlcyB8fCBwb2x5Z29uLmNvb3JkaW5hdGVzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7IFBvbHlnb24uY29vcmRpbmF0ZXMgc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBsb24vbGF0IHBhaXJzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcG9pbnRzID0gcG9seWdvbi5jb29yZGluYXRlcztcbiAgICAgIH0gZWxzZSBpZiAocG9seWdvbiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgR2VvUG9pbnRzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcG9pbnRzID0gcG9seWdvbjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgXCJiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGJlIFBvbHlnb24gb2JqZWN0IG9yIEFycmF5IG9mIFBhcnNlLkdlb1BvaW50J3NcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcG9pbnRzID0gcG9pbnRzXG4gICAgICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICAgICAgICByZXR1cm4gYCgke3BvaW50WzBdfSwgJHtwb2ludFsxXX0pYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHR5cGVvZiBwb2ludCAhPT0gJ29iamVjdCcgfHwgcG9pbnQuX190eXBlICE9PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRnZW9XaXRoaW4gdmFsdWUnKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCgke3BvaW50LmxvbmdpdHVkZX0sICR7cG9pbnQubGF0aXR1ZGV9KWA7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCcsICcpO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9pbnQgPEAgJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnRzfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzICYmIGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMuJHBvaW50KSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMuJHBvaW50O1xuICAgICAgaWYgKHR5cGVvZiBwb2ludCAhPT0gJ29iamVjdCcgfHwgcG9pbnQuX190eXBlICE9PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvSW50ZXJzZWN0IHZhbHVlOyAkcG9pbnQgc2hvdWxkIGJlIEdlb1BvaW50J1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvbHlnb24gQD4gJCR7aW5kZXggKyAxfTo6cG9pbnRgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50LmxvbmdpdHVkZX0sICR7cG9pbnQubGF0aXR1ZGV9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kcmVnZXgpIHtcbiAgICAgIGxldCByZWdleCA9IGZpZWxkVmFsdWUuJHJlZ2V4O1xuICAgICAgbGV0IG9wZXJhdG9yID0gJ34nO1xuICAgICAgY29uc3Qgb3B0cyA9IGZpZWxkVmFsdWUuJG9wdGlvbnM7XG4gICAgICBpZiAob3B0cykge1xuICAgICAgICBpZiAob3B0cy5pbmRleE9mKCdpJykgPj0gMCkge1xuICAgICAgICAgIG9wZXJhdG9yID0gJ34qJztcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0cy5pbmRleE9mKCd4JykgPj0gMCkge1xuICAgICAgICAgIHJlZ2V4ID0gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICByZWdleCA9IHByb2Nlc3NSZWdleFBhdHRlcm4ocmVnZXgpO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3ICR7b3BlcmF0b3J9ICckJHtpbmRleCArIDF9OnJhdydgKTtcbiAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIHJlZ2V4KTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWVdKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuaXNvKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSB+PSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICBpbmRleCArPSAzO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwoZmllbGRWYWx1ZS5jb29yZGluYXRlcyk7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSB+PSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKGNtcCA9PiB7XG4gICAgICBpZiAoZmllbGRWYWx1ZVtjbXBdIHx8IGZpZWxkVmFsdWVbY21wXSA9PT0gMCkge1xuICAgICAgICBjb25zdCBwZ0NvbXBhcmF0b3IgPSBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3JbY21wXTtcbiAgICAgICAgbGV0IGNvbnN0cmFpbnRGaWVsZE5hbWU7XG4gICAgICAgIGxldCBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWVbY21wXSk7XG5cbiAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZVtjbXBdKTtcbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gY2FzdFR5cGVcbiAgICAgICAgICAgID8gYENBU1QgKCgke3RyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSl9KSBBUyAke2Nhc3RUeXBlfSlgXG4gICAgICAgICAgICA6IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlID09PSAnb2JqZWN0JyAmJiBwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSAhPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIERhdGUgZmllbGQnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBwYXJzZXJSZXN1bHQgPSBVdGlscy5yZWxhdGl2ZVRpbWVUb0RhdGUocG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lKTtcbiAgICAgICAgICAgIGlmIChwYXJzZXJSZXN1bHQuc3RhdHVzID09PSAnc3VjY2VzcycpIHtcbiAgICAgICAgICAgICAgcG9zdGdyZXNWYWx1ZSA9IHRvUG9zdGdyZXNWYWx1ZShwYXJzZXJSZXN1bHQucmVzdWx0KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHdoaWxlIHBhcnNpbmcgcmVsYXRpdmUgZGF0ZScsIHBhcnNlclJlc3VsdCk7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgYGJhZCAkcmVsYXRpdmVUaW1lICgke3Bvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZX0pIHZhbHVlLiAke3BhcnNlclJlc3VsdC5pbmZvfWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3RyYWludEZpZWxkTmFtZSA9IGAkJHtpbmRleCsrfTpuYW1lYDtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHZhbHVlcy5wdXNoKHBvc3RncmVzVmFsdWUpO1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAke2NvbnN0cmFpbnRGaWVsZE5hbWV9ICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCsrfWApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKGluaXRpYWxQYXR0ZXJuc0xlbmd0aCA9PT0gcGF0dGVybnMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBQb3N0Z3JlcyBkb2Vzbid0IHN1cHBvcnQgdGhpcyBxdWVyeSB0eXBlIHlldCAke0pTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG4gIHZhbHVlcyA9IHZhbHVlcy5tYXAodHJhbnNmb3JtVmFsdWUpO1xuICByZXR1cm4geyBwYXR0ZXJuOiBwYXR0ZXJucy5qb2luKCcgQU5EICcpLCB2YWx1ZXMsIHNvcnRzIH07XG59O1xuXG5leHBvcnQgY2xhc3MgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBpbXBsZW1lbnRzIFN0b3JhZ2VBZGFwdGVyIHtcbiAgY2FuU29ydE9uSm9pblRhYmxlczogYm9vbGVhbjtcbiAgZW5hYmxlU2NoZW1hSG9va3M6IGJvb2xlYW47XG5cbiAgLy8gUHJpdmF0ZVxuICBfY29sbGVjdGlvblByZWZpeDogc3RyaW5nO1xuICBfY2xpZW50OiBhbnk7XG4gIF9vbmNoYW5nZTogYW55O1xuICBfcGdwOiBhbnk7XG4gIF9zdHJlYW06IGFueTtcbiAgX3V1aWQ6IGFueTtcbiAgc2NoZW1hQ2FjaGVUdGw6ID9udW1iZXI7XG4gIGRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbjogYm9vbGVhbjtcblxuICBjb25zdHJ1Y3Rvcih7IHVyaSwgY29sbGVjdGlvblByZWZpeCA9ICcnLCBkYXRhYmFzZU9wdGlvbnMgPSB7fSB9OiBhbnkpIHtcbiAgICBjb25zdCBvcHRpb25zID0geyAuLi5kYXRhYmFzZU9wdGlvbnMgfTtcbiAgICB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ID0gY29sbGVjdGlvblByZWZpeDtcbiAgICB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzID0gISFkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgdGhpcy5zY2hlbWFDYWNoZVR0bCA9IGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bDtcbiAgICB0aGlzLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbiA9ICEhZGF0YWJhc2VPcHRpb25zLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbjtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbJ2VuYWJsZVNjaGVtYUhvb2tzJywgJ3NjaGVtYUNhY2hlVHRsJywgJ2Rpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbiddKSB7XG4gICAgICBkZWxldGUgb3B0aW9uc1trZXldO1xuICAgIH1cblxuICAgIGNvbnN0IHsgY2xpZW50LCBwZ3AgfSA9IGNyZWF0ZUNsaWVudCh1cmksIG9wdGlvbnMpO1xuICAgIHRoaXMuX2NsaWVudCA9IGNsaWVudDtcbiAgICB0aGlzLl9vbmNoYW5nZSA9ICgpID0+IHt9O1xuICAgIHRoaXMuX3BncCA9IHBncDtcbiAgICB0aGlzLl91dWlkID0gdXVpZHY0KCk7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gZmFsc2U7XG4gIH1cblxuICB3YXRjaChjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIHRoaXMuX29uY2hhbmdlID0gY2FsbGJhY2s7XG4gIH1cblxuICAvL05vdGUgdGhhdCBhbmFseXplPXRydWUgd2lsbCBydW4gdGhlIHF1ZXJ5LCBleGVjdXRpbmcgSU5TRVJUUywgREVMRVRFUywgZXRjLlxuICBjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KHF1ZXJ5OiBzdHJpbmcsIGFuYWx5emU6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIGlmIChhbmFseXplKSB7XG4gICAgICByZXR1cm4gJ0VYUExBSU4gKEFOQUxZWkUsIEZPUk1BVCBKU09OKSAnICsgcXVlcnk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAodGhpcy5fc3RyZWFtKSB7XG4gICAgICB0aGlzLl9zdHJlYW0uZG9uZSgpO1xuICAgICAgZGVsZXRlIHRoaXMuX3N0cmVhbTtcbiAgICB9XG4gICAgaWYgKCF0aGlzLl9jbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5fY2xpZW50LiRwb29sLmVuZCgpO1xuICB9XG5cbiAgYXN5bmMgX2xpc3RlblRvU2NoZW1hKCkge1xuICAgIGlmICghdGhpcy5fc3RyZWFtICYmIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MpIHtcbiAgICAgIHRoaXMuX3N0cmVhbSA9IGF3YWl0IHRoaXMuX2NsaWVudC5jb25uZWN0KHsgZGlyZWN0OiB0cnVlIH0pO1xuICAgICAgdGhpcy5fc3RyZWFtLmNsaWVudC5vbignbm90aWZpY2F0aW9uJywgZGF0YSA9PiB7XG4gICAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKGRhdGEucGF5bG9hZCk7XG4gICAgICAgIGlmIChwYXlsb2FkLnNlbmRlcklkICE9PSB0aGlzLl91dWlkKSB7XG4gICAgICAgICAgdGhpcy5fb25jaGFuZ2UoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBhd2FpdCB0aGlzLl9zdHJlYW0ubm9uZSgnTElTVEVOICQxficsICdzY2hlbWEuY2hhbmdlJyk7XG4gICAgfVxuICB9XG5cbiAgX25vdGlmeVNjaGVtYUNoYW5nZSgpIHtcbiAgICBpZiAodGhpcy5fc3RyZWFtKSB7XG4gICAgICB0aGlzLl9zdHJlYW1cbiAgICAgICAgLm5vbmUoJ05PVElGWSAkMX4sICQyJywgWydzY2hlbWEuY2hhbmdlJywgeyBzZW5kZXJJZDogdGhpcy5fdXVpZCB9XSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIE5vdGlmeTonLCBlcnJvcik7IC8vIHVubGlrZWx5IHRvIGV2ZXIgaGFwcGVuXG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIF9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBhd2FpdCBjb25uXG4gICAgICAubm9uZShcbiAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIFwiX1NDSEVNQVwiICggXCJjbGFzc05hbWVcIiB2YXJDaGFyKDEyMCksIFwic2NoZW1hXCIganNvbmIsIFwiaXNQYXJzZUNsYXNzXCIgYm9vbCwgUFJJTUFSWSBLRVkgKFwiY2xhc3NOYW1lXCIpICknXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5vbmUoXG4gICAgICAnU0VMRUNUIEVYSVNUUyAoU0VMRUNUIDEgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzIFdIRVJFIHRhYmxlX25hbWUgPSAkMSknLFxuICAgICAgW25hbWVdLFxuICAgICAgYSA9PiBhLmV4aXN0c1xuICAgICk7XG4gIH1cblxuICBhc3luYyBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSkge1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50YXNrKCdzZXQtY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsICdzY2hlbWEnLCAnY2xhc3NMZXZlbFBlcm1pc3Npb25zJywgSlNPTi5zdHJpbmdpZnkoQ0xQcyldO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICBgVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXNcbiAgICAgICk7XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyBzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRJbmRleGVzOiBhbnksXG4gICAgZXhpc3RpbmdJbmRleGVzOiBhbnkgPSB7fSxcbiAgICBmaWVsZHM6IGFueSxcbiAgICBjb25uOiA/YW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoc3VibWl0dGVkSW5kZXhlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0luZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZXhpc3RpbmdJbmRleGVzID0geyBfaWRfOiB7IF9pZDogMSB9IH07XG4gICAgfVxuICAgIGNvbnN0IGRlbGV0ZWRJbmRleGVzID0gW107XG4gICAgY29uc3QgaW5zZXJ0ZWRJbmRleGVzID0gW107XG4gICAgT2JqZWN0LmtleXMoc3VibWl0dGVkSW5kZXhlcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGBJbmRleCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBkZWxldGVkSW5kZXhlcy5wdXNoKG5hbWUpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAhdGhpcy5kaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24gJiZcbiAgICAgICAgICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGRzLCBrZXkpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICAgIGBGaWVsZCAke2tleX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBhZGQgaW5kZXguYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBleGlzdGluZ0luZGV4ZXNbbmFtZV0gPSBmaWVsZDtcbiAgICAgICAgaW5zZXJ0ZWRJbmRleGVzLnB1c2goe1xuICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgYXdhaXQgY29ubi50eCgnc2V0LWluZGV4ZXMtd2l0aC1zY2hlbWEtZm9ybWF0JywgYXN5bmMgdCA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAoaW5zZXJ0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBhd2FpdCBzZWxmLmNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lLCBpbnNlcnRlZEluZGV4ZXMsIHQpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbkRvZXNOb3RFeGlzdEVycm9yID0gZS5lcnJvcnM/LlswXT8uY29kZSA9PT0gJzQyNzAzJztcbiAgICAgICAgaWYgKGNvbHVtbkRvZXNOb3RFeGlzdEVycm9yICYmICF0aGlzLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbikge1xuICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChkZWxldGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGF3YWl0IHNlbGYuZHJvcEluZGV4ZXMoY2xhc3NOYW1lLCBkZWxldGVkSW5kZXhlcywgdCk7XG4gICAgICB9XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMScsXG4gICAgICAgIFtjbGFzc05hbWUsICdzY2hlbWEnLCAnaW5kZXhlcycsIEpTT04uc3RyaW5naWZ5KGV4aXN0aW5nSW5kZXhlcyldXG4gICAgICApO1xuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogP2FueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBwYXJzZVNjaGVtYSA9IGF3YWl0IGNvbm5cbiAgICAgIC50eCgnY3JlYXRlLWNsYXNzJywgYXN5bmMgdCA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMuY3JlYXRlVGFibGUoY2xhc3NOYW1lLCBzY2hlbWEsIHQpO1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ0lOU0VSVCBJTlRPIFwiX1NDSEVNQVwiIChcImNsYXNzTmFtZVwiLCBcInNjaGVtYVwiLCBcImlzUGFyc2VDbGFzc1wiKSBWQUxVRVMgKCQ8Y2xhc3NOYW1lPiwgJDxzY2hlbWE+LCB0cnVlKScsXG4gICAgICAgICAgeyBjbGFzc05hbWUsIHNjaGVtYSB9XG4gICAgICAgICk7XG4gICAgICAgIGF3YWl0IHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoY2xhc3NOYW1lLCBzY2hlbWEuaW5kZXhlcywge30sIHNjaGVtYS5maWVsZHMsIHQpO1xuICAgICAgICByZXR1cm4gdG9QYXJzZVNjaGVtYShzY2hlbWEpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJiBlcnIuZGV0YWlsLmluY2x1ZGVzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLCBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycjtcbiAgICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICAgIHJldHVybiBwYXJzZVNjaGVtYTtcbiAgfVxuXG4gIC8vIEp1c3QgY3JlYXRlIGEgdGFibGUsIGRvIG5vdCBpbnNlcnQgaW4gc2NoZW1hXG4gIGFzeW5jIGNyZWF0ZVRhYmxlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBkZWJ1ZygnY3JlYXRlVGFibGUnKTtcbiAgICBjb25zdCB2YWx1ZXNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHBhdHRlcm5zQXJyYXkgPSBbXTtcbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3QuYXNzaWduKHt9LCBzY2hlbWEuZmllbGRzKTtcbiAgICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgZmllbGRzLl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2ZhaWxlZF9sb2dpbl9jb3VudCA9IHsgdHlwZTogJ051bWJlcicgfTtcbiAgICAgIGZpZWxkcy5fcGVyaXNoYWJsZV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2hpc3RvcnkgPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgICB9XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBjb25zdCByZWxhdGlvbnMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhmaWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGNvbnN0IHBhcnNlVHlwZSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgLy8gU2tpcCB3aGVuIGl0J3MgYSByZWxhdGlvblxuICAgICAgLy8gV2UnbGwgY3JlYXRlIHRoZSB0YWJsZXMgbGF0ZXJcbiAgICAgIGlmIChwYXJzZVR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZWxhdGlvbnMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgcGFyc2VUeXBlLmNvbnRlbnRzID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgfVxuICAgICAgdmFsdWVzQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaChwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZShwYXJzZVR5cGUpKTtcbiAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgJCR7aW5kZXh9Om5hbWUgJCR7aW5kZXggKyAxfTpyYXdgKTtcbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgcGF0dGVybnNBcnJheS5wdXNoKGBQUklNQVJZIEtFWSAoJCR7aW5kZXh9Om5hbWUpYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMjtcbiAgICB9KTtcbiAgICBjb25zdCBxcyA9IGBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkMTpuYW1lICgke3BhdHRlcm5zQXJyYXkuam9pbigpfSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLnZhbHVlc0FycmF5XTtcblxuICAgIHJldHVybiBjb25uLnRhc2soJ2NyZWF0ZS10YWJsZScsIGFzeW5jIHQgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdC5ub25lKHFzLCB2YWx1ZXMpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIEVMU0U6IFRhYmxlIGFscmVhZHkgZXhpc3RzLCBtdXN0IGhhdmUgYmVlbiBjcmVhdGVkIGJ5IGEgZGlmZmVyZW50IHJlcXVlc3QuIElnbm9yZSB0aGUgZXJyb3IuXG4gICAgICB9XG4gICAgICBhd2FpdCB0LnR4KCdjcmVhdGUtdGFibGUtdHgnLCB0eCA9PiB7XG4gICAgICAgIHJldHVybiB0eC5iYXRjaChcbiAgICAgICAgICByZWxhdGlvbnMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gdHgubm9uZShcbiAgICAgICAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQ8am9pblRhYmxlOm5hbWU+IChcInJlbGF0ZWRJZFwiIHZhckNoYXIoMTIwKSwgXCJvd25pbmdJZFwiIHZhckNoYXIoMTIwKSwgUFJJTUFSWSBLRVkoXCJyZWxhdGVkSWRcIiwgXCJvd25pbmdJZFwiKSApJyxcbiAgICAgICAgICAgICAgeyBqb2luVGFibGU6IGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNjaGVtYVVwZ3JhZGUoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogYW55KSB7XG4gICAgZGVidWcoJ3NjaGVtYVVwZ3JhZGUnKTtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBhd2FpdCBjb25uLnRhc2soJ3NjaGVtYS11cGdyYWRlJywgYXN5bmMgdCA9PiB7XG4gICAgICBjb25zdCBjb2x1bW5zID0gYXdhaXQgdC5tYXAoXG4gICAgICAgICdTRUxFQ1QgY29sdW1uX25hbWUgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucyBXSEVSRSB0YWJsZV9uYW1lID0gJDxjbGFzc05hbWU+JyxcbiAgICAgICAgeyBjbGFzc05hbWUgfSxcbiAgICAgICAgYSA9PiBhLmNvbHVtbl9uYW1lXG4gICAgICApO1xuICAgICAgY29uc3QgbmV3Q29sdW1ucyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiBjb2x1bW5zLmluZGV4T2YoaXRlbSkgPT09IC0xKVxuICAgICAgICAubWFwKGZpZWxkTmFtZSA9PiBzZWxmLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkpO1xuXG4gICAgICBhd2FpdCB0LmJhdGNoKG5ld0NvbHVtbnMpO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIC8vIFRPRE86IE11c3QgYmUgcmV2aXNlZCBmb3IgaW52YWxpZCBsb2dpYy4uLlxuICAgIGRlYnVnKCdhZGRGaWVsZElmTm90RXhpc3RzJyk7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCdhZGQtZmllbGQtaWYtbm90LWV4aXN0cycsIGFzeW5jIHQgPT4ge1xuICAgICAgaWYgKHR5cGUudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAgICdBTFRFUiBUQUJMRSAkPGNsYXNzTmFtZTpuYW1lPiBBREQgQ09MVU1OIElGIE5PVCBFWElTVFMgJDxmaWVsZE5hbWU6bmFtZT4gJDxwb3N0Z3Jlc1R5cGU6cmF3PicsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgICBwb3N0Z3Jlc1R5cGU6IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHR5cGUpLFxuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgcmV0dXJuIHNlbGYuY3JlYXRlQ2xhc3MoY2xhc3NOYW1lLCB7IGZpZWxkczogeyBbZmllbGROYW1lXTogdHlwZSB9IH0sIHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIENvbHVtbiBhbHJlYWR5IGV4aXN0cywgY3JlYXRlZCBieSBvdGhlciByZXF1ZXN0LiBDYXJyeSBvbiB0byBzZWUgaWYgaXQncyB0aGUgcmlnaHQgdHlwZS5cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgeyBqb2luVGFibGU6IGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCB9XG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHQuYW55KFxuICAgICAgICAnU0VMRUNUIFwic2NoZW1hXCIgRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+IGFuZCAoXCJzY2hlbWFcIjo6anNvbi0+XFwnZmllbGRzXFwnLT4kPGZpZWxkTmFtZT4pIGlzIG5vdCBudWxsJyxcbiAgICAgICAgeyBjbGFzc05hbWUsIGZpZWxkTmFtZSB9XG4gICAgICApO1xuXG4gICAgICBpZiAocmVzdWx0WzBdKSB7XG4gICAgICAgIHRocm93ICdBdHRlbXB0ZWQgdG8gYWRkIGEgZmllbGQgdGhhdCBhbHJlYWR5IGV4aXN0cyc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBwYXRoID0gYHtmaWVsZHMsJHtmaWVsZE5hbWV9fWA7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICAgIHsgcGF0aCwgdHlwZSwgY2xhc3NOYW1lIH1cbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgndXBkYXRlLXNjaGVtYS1maWVsZC1vcHRpb25zJywgYXN5bmMgdCA9PiB7XG4gICAgICBjb25zdCBwYXRoID0gYHtmaWVsZHMsJHtmaWVsZE5hbWV9fWA7XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCI9anNvbmJfc2V0KFwic2NoZW1hXCIsICQ8cGF0aD4sICQ8dHlwZT4pICBXSEVSRSBcImNsYXNzTmFtZVwiPSQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgcGF0aCwgdHlwZSwgY2xhc3NOYW1lIH1cbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBEcm9wcyBhIGNvbGxlY3Rpb24uIFJlc29sdmVzIHdpdGggdHJ1ZSBpZiBpdCB3YXMgYSBQYXJzZSBTY2hlbWEgKGVnLiBfVXNlciwgQ3VzdG9tLCBldGMuKVxuICAvLyBhbmQgcmVzb2x2ZXMgd2l0aCBmYWxzZSBpZiBpdCB3YXNuJ3QgKGVnLiBhIGpvaW4gdGFibGUpLiBSZWplY3RzIGlmIGRlbGV0aW9uIHdhcyBpbXBvc3NpYmxlLlxuICBhc3luYyBkZWxldGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IG9wZXJhdGlvbnMgPSBbXG4gICAgICB7IHF1ZXJ5OiBgRFJPUCBUQUJMRSBJRiBFWElTVFMgJDE6bmFtZWAsIHZhbHVlczogW2NsYXNzTmFtZV0gfSxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBERUxFVEUgRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXM6IFtjbGFzc05hbWVdLFxuICAgICAgfSxcbiAgICBdO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fY2xpZW50XG4gICAgICAudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KG9wZXJhdGlvbnMpKSlcbiAgICAgIC50aGVuKCgpID0+IGNsYXNzTmFtZS5pbmRleE9mKCdfSm9pbjonKSAhPSAwKTsgLy8gcmVzb2x2ZXMgd2l0aCBmYWxzZSB3aGVuIF9Kb2luIHRhYmxlXG5cbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cblxuICAvLyBEZWxldGUgYWxsIGRhdGEga25vd24gdG8gdGhpcyBhZGFwdGVyLiBVc2VkIGZvciB0ZXN0aW5nLlxuICBhc3luYyBkZWxldGVBbGxDbGFzc2VzKCkge1xuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgIGNvbnN0IGhlbHBlcnMgPSB0aGlzLl9wZ3AuaGVscGVycztcbiAgICBkZWJ1ZygnZGVsZXRlQWxsQ2xhc3NlcycpO1xuICAgIGlmICh0aGlzLl9jbGllbnQ/LiRwb29sLmVuZGVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuX2NsaWVudFxuICAgICAgLnRhc2soJ2RlbGV0ZS1hbGwtY2xhc3NlcycsIGFzeW5jIHQgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0LmFueSgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIicpO1xuICAgICAgICAgIGNvbnN0IGpvaW5zID0gcmVzdWx0cy5yZWR1Y2UoKGxpc3Q6IEFycmF5PHN0cmluZz4sIHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbGlzdC5jb25jYXQoam9pblRhYmxlc0ZvclNjaGVtYShzY2hlbWEuc2NoZW1hKSk7XG4gICAgICAgICAgfSwgW10pO1xuICAgICAgICAgIGNvbnN0IGNsYXNzZXMgPSBbXG4gICAgICAgICAgICAnX1NDSEVNQScsXG4gICAgICAgICAgICAnX1B1c2hTdGF0dXMnLFxuICAgICAgICAgICAgJ19Kb2JTdGF0dXMnLFxuICAgICAgICAgICAgJ19Kb2JTY2hlZHVsZScsXG4gICAgICAgICAgICAnX0hvb2tzJyxcbiAgICAgICAgICAgICdfR2xvYmFsQ29uZmlnJyxcbiAgICAgICAgICAgICdfR3JhcGhRTENvbmZpZycsXG4gICAgICAgICAgICAnX0F1ZGllbmNlJyxcbiAgICAgICAgICAgICdfSWRlbXBvdGVuY3knLFxuICAgICAgICAgICAgLi4ucmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5jbGFzc05hbWUpLFxuICAgICAgICAgICAgLi4uam9pbnMsXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdCBxdWVyaWVzID0gY2xhc3Nlcy5tYXAoY2xhc3NOYW1lID0+ICh7XG4gICAgICAgICAgICBxdWVyeTogJ0RST1AgVEFCTEUgSUYgRVhJU1RTICQ8Y2xhc3NOYW1lOm5hbWU+JyxcbiAgICAgICAgICAgIHZhbHVlczogeyBjbGFzc05hbWUgfSxcbiAgICAgICAgICB9KSk7XG4gICAgICAgICAgYXdhaXQgdC50eCh0eCA9PiB0eC5ub25lKGhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIE5vIF9TQ0hFTUEgY29sbGVjdGlvbi4gRG9uJ3QgZGVsZXRlIGFueXRoaW5nLlxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBkZWJ1ZyhgZGVsZXRlQWxsQ2xhc3NlcyBkb25lIGluICR7bmV3IERhdGUoKS5nZXRUaW1lKCkgLSBub3d9YCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZSB0aGUgY29sdW1uIGFuZCBhbGwgdGhlIGRhdGEuIEZvciBSZWxhdGlvbnMsIHRoZSBfSm9pbiBjb2xsZWN0aW9uIGlzIGhhbmRsZWRcbiAgLy8gc3BlY2lhbGx5LCB0aGlzIGZ1bmN0aW9uIGRvZXMgbm90IGRlbGV0ZSBfSm9pbiBjb2x1bW5zLiBJdCBzaG91bGQsIGhvd2V2ZXIsIGluZGljYXRlXG4gIC8vIHRoYXQgdGhlIHJlbGF0aW9uIGZpZWxkcyBkb2VzIG5vdCBleGlzdCBhbnltb3JlLiBJbiBtb25nbywgdGhpcyBtZWFucyByZW1vdmluZyBpdCBmcm9tXG4gIC8vIHRoZSBfU0NIRU1BIGNvbGxlY3Rpb24uICBUaGVyZSBzaG91bGQgYmUgbm8gYWN0dWFsIGRhdGEgaW4gdGhlIGNvbGxlY3Rpb24gdW5kZXIgdGhlIHNhbWUgbmFtZVxuICAvLyBhcyB0aGUgcmVsYXRpb24gY29sdW1uLCBzbyBpdCdzIGZpbmUgdG8gYXR0ZW1wdCB0byBkZWxldGUgaXQuIElmIHRoZSBmaWVsZHMgbGlzdGVkIHRvIGJlXG4gIC8vIGRlbGV0ZWQgZG8gbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gc3VjY2Vzc2Z1bGx5IGFueXdheXMuIENoZWNraW5nIGZvclxuICAvLyBhdHRlbXB0cyB0byBkZWxldGUgbm9uLWV4aXN0ZW50IGZpZWxkcyBpcyB0aGUgcmVzcG9uc2liaWxpdHkgb2YgUGFyc2UgU2VydmVyLlxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgbm90IG9ibGlnYXRlZCB0byBkZWxldGUgZmllbGRzIGF0b21pY2FsbHkuIEl0IGlzIGdpdmVuIHRoZSBmaWVsZFxuICAvLyBuYW1lcyBpbiBhIGxpc3Qgc28gdGhhdCBkYXRhYmFzZXMgdGhhdCBhcmUgY2FwYWJsZSBvZiBkZWxldGluZyBmaWVsZHMgYXRvbWljYWxseVxuICAvLyBtYXkgZG8gc28uXG5cbiAgLy8gUmV0dXJucyBhIFByb21pc2UuXG4gIGFzeW5jIGRlbGV0ZUZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGRlYnVnKCdkZWxldGVGaWVsZHMnKTtcbiAgICBmaWVsZE5hbWVzID0gZmllbGROYW1lcy5yZWR1Y2UoKGxpc3Q6IEFycmF5PHN0cmluZz4sIGZpZWxkTmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIGlmIChmaWVsZC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChmaWVsZE5hbWUpO1xuICAgICAgfVxuICAgICAgZGVsZXRlIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHJldHVybiBsaXN0O1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmZpZWxkTmFtZXNdO1xuICAgIGNvbnN0IGNvbHVtbnMgPSBmaWVsZE5hbWVzXG4gICAgICAubWFwKChuYW1lLCBpZHgpID0+IHtcbiAgICAgICAgcmV0dXJuIGAkJHtpZHggKyAyfTpuYW1lYDtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCBEUk9QIENPTFVNTicpO1xuXG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCdkZWxldGUtZmllbGRzJywgYXN5bmMgdCA9PiB7XG4gICAgICBhd2FpdCB0Lm5vbmUoJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIiA9ICQ8c2NoZW1hPiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+Jywge1xuICAgICAgICBzY2hlbWEsXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pO1xuICAgICAgaWYgKHZhbHVlcy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShgQUxURVIgVEFCTEUgJDE6bmFtZSBEUk9QIENPTFVNTiBJRiBFWElTVFMgJHtjb2x1bW5zfWAsIHZhbHVlcyk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciBhbGwgc2NoZW1hcyBrbm93biB0byB0aGlzIGFkYXB0ZXIsIGluIFBhcnNlIGZvcm1hdC4gSW4gY2FzZSB0aGVcbiAgLy8gc2NoZW1hcyBjYW5ub3QgYmUgcmV0cmlldmVkLCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMuIFJlcXVpcmVtZW50cyBmb3IgdGhlXG4gIC8vIHJlamVjdGlvbiByZWFzb24gYXJlIFRCRC5cbiAgYXN5bmMgZ2V0QWxsQ2xhc3NlcygpIHtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LnRhc2soJ2dldC1hbGwtY2xhc3NlcycsIGFzeW5jIHQgPT4ge1xuICAgICAgcmV0dXJuIGF3YWl0IHQubWFwKCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJywgbnVsbCwgcm93ID0+XG4gICAgICAgIHRvUGFyc2VTY2hlbWEoeyBjbGFzc05hbWU6IHJvdy5jbGFzc05hbWUsIC4uLnJvdy5zY2hlbWEgfSlcbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciB0aGUgc2NoZW1hIHdpdGggdGhlIGdpdmVuIG5hbWUsIGluIFBhcnNlIGZvcm1hdC4gSWZcbiAgLy8gdGhpcyBhZGFwdGVyIGRvZXNuJ3Qga25vdyBhYm91dCB0aGUgc2NoZW1hLCByZXR1cm4gYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aXRoXG4gIC8vIHVuZGVmaW5lZCBhcyB0aGUgcmVhc29uLlxuICBhc3luYyBnZXRDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGRlYnVnKCdnZXRDbGFzcycpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsIHtcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChyZXN1bHQubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRbMF0uc2NoZW1hO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHRvUGFyc2VTY2hlbWEpO1xuICB9XG5cbiAgLy8gVE9ETzogcmVtb3ZlIHRoZSBtb25nbyBmb3JtYXQgZGVwZW5kZW5jeSBpbiB0aGUgcmV0dXJuIHZhbHVlXG4gIGFzeW5jIGNyZWF0ZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ2NyZWF0ZU9iamVjdCcpO1xuICAgIGxldCBjb2x1bW5zQXJyYXkgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXNBcnJheSA9IFtdO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBnZW9Qb2ludHMgPSB7fTtcblxuICAgIG9iamVjdCA9IGhhbmRsZURvdEZpZWxkcyhvYmplY3QpO1xuXG4gICAgdmFsaWRhdGVLZXlzKG9iamVjdCk7XG5cbiAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB2YXIgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgY29uc3QgYXV0aERhdGFBbHJlYWR5RXhpc3RzID0gISFvYmplY3QuYXV0aERhdGE7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ10gPSBvYmplY3RbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBmaWVsZE5hbWUgPSAnYXV0aERhdGEnO1xuICAgICAgICAvLyBBdm9pZCBhZGRpbmcgYXV0aERhdGEgbXVsdGlwbGUgdGltZXMgdG8gdGhlIHF1ZXJ5XG4gICAgICAgIGlmIChhdXRoRGF0YUFscmVhZHlFeGlzdHMpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29sdW1uc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2VtYWlsX3ZlcmlmeV90b2tlbicgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZmFpbGVkX2xvZ2luX2NvdW50JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wYXNzd29yZF9oaXN0b3J5J1xuICAgICAgICApIHtcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wYXNzd29yZF9jaGFuZ2VkX2F0J1xuICAgICAgICApIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc3dpdGNoIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSkge1xuICAgICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0ub2JqZWN0SWQpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBcnJheSc6XG4gICAgICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChKU09OLnN0cmluZ2lmeShvYmplY3RbZmllbGROYW1lXSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgICBjYXNlICdOdW1iZXInOlxuICAgICAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5uYW1lKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9seWdvbic6IHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwob2JqZWN0W2ZpZWxkTmFtZV0uY29vcmRpbmF0ZXMpO1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2godmFsdWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgICAgICAvLyBwb3AgdGhlIHBvaW50IGFuZCBwcm9jZXNzIGxhdGVyXG4gICAgICAgICAgZ2VvUG9pbnRzW2ZpZWxkTmFtZV0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgICBjb2x1bW5zQXJyYXkucG9wKCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgYFR5cGUgJHtzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZX0gbm90IHN1cHBvcnRlZCB5ZXRgO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29sdW1uc0FycmF5ID0gY29sdW1uc0FycmF5LmNvbmNhdChPYmplY3Qua2V5cyhnZW9Qb2ludHMpKTtcbiAgICBjb25zdCBpbml0aWFsVmFsdWVzID0gdmFsdWVzQXJyYXkubWFwKCh2YWwsIGluZGV4KSA9PiB7XG4gICAgICBsZXQgdGVybWluYXRpb24gPSAnJztcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGNvbHVtbnNBcnJheVtpbmRleF07XG4gICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgdGVybWluYXRpb24gPSAnOjp0ZXh0W10nO1xuICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgdGVybWluYXRpb24gPSAnOjpqc29uYic7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCQke2luZGV4ICsgMiArIGNvbHVtbnNBcnJheS5sZW5ndGh9JHt0ZXJtaW5hdGlvbn1gO1xuICAgIH0pO1xuICAgIGNvbnN0IGdlb1BvaW50c0luamVjdHMgPSBPYmplY3Qua2V5cyhnZW9Qb2ludHMpLm1hcChrZXkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBnZW9Qb2ludHNba2V5XTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2godmFsdWUubG9uZ2l0dWRlLCB2YWx1ZS5sYXRpdHVkZSk7XG4gICAgICBjb25zdCBsID0gdmFsdWVzQXJyYXkubGVuZ3RoICsgY29sdW1uc0FycmF5Lmxlbmd0aDtcbiAgICAgIHJldHVybiBgUE9JTlQoJCR7bH0sICQke2wgKyAxfSlgO1xuICAgIH0pO1xuXG4gICAgY29uc3QgY29sdW1uc1BhdHRlcm4gPSBjb2x1bW5zQXJyYXkubWFwKChjb2wsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAyfTpuYW1lYCkuam9pbigpO1xuICAgIGNvbnN0IHZhbHVlc1BhdHRlcm4gPSBpbml0aWFsVmFsdWVzLmNvbmNhdChnZW9Qb2ludHNJbmplY3RzKS5qb2luKCk7XG5cbiAgICBjb25zdCBxcyA9IGBJTlNFUlQgSU5UTyAkMTpuYW1lICgke2NvbHVtbnNQYXR0ZXJufSkgVkFMVUVTICgke3ZhbHVlc1BhdHRlcm59KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uY29sdW1uc0FycmF5LCAuLi52YWx1ZXNBcnJheV07XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpXG4gICAgICAubm9uZShxcywgdmFsdWVzKVxuICAgICAgLnRoZW4oKCkgPT4gKHsgb3BzOiBbb2JqZWN0XSB9KSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICAgIGVyci51bmRlcmx5aW5nRXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICBpZiAoZXJyb3IuY29uc3RyYWludCkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLmNvbnN0cmFpbnQubWF0Y2goL3VuaXF1ZV8oW2EtekEtWl0rKS8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMgJiYgQXJyYXkuaXNBcnJheShtYXRjaGVzKSkge1xuICAgICAgICAgICAgICBlcnIudXNlckluZm8gPSB7IGR1cGxpY2F0ZWRfZmllbGQ6IG1hdGNoZXNbMV0gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgZXJyb3IgPSBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICAvLyBJZiBubyBvYmplY3RzIG1hdGNoLCByZWplY3Qgd2l0aCBPQkpFQ1RfTk9UX0ZPVU5ELiBJZiBvYmplY3RzIGFyZSBmb3VuZCBhbmQgZGVsZXRlZCwgcmVzb2x2ZSB3aXRoIHVuZGVmaW5lZC5cbiAgLy8gSWYgdGhlcmUgaXMgc29tZSBvdGhlciBlcnJvciwgcmVqZWN0IHdpdGggSU5URVJOQUxfU0VSVkVSX0VSUk9SLlxuICBhc3luYyBkZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnZGVsZXRlT2JqZWN0c0J5UXVlcnknKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCBpbmRleCA9IDI7XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIGluZGV4LFxuICAgICAgcXVlcnksXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG4gICAgaWYgKE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT09IDApIHtcbiAgICAgIHdoZXJlLnBhdHRlcm4gPSAnVFJVRSc7XG4gICAgfVxuICAgIGNvbnN0IHFzID0gYFdJVEggZGVsZXRlZCBBUyAoREVMRVRFIEZST00gJDE6bmFtZSBXSEVSRSAke3doZXJlLnBhdHRlcm59IFJFVFVSTklORyAqKSBTRUxFQ1QgY291bnQoKikgRlJPTSBkZWxldGVkYDtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udCA6IHRoaXMuX2NsaWVudClcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiArYS5jb3VudClcbiAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgaWYgKGNvdW50ID09PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBjb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBEb24ndCBkZWxldGUgYW55dGhpbmcgaWYgZG9lc24ndCBleGlzdFxuICAgICAgfSk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuICAvLyBSZXR1cm4gdmFsdWUgbm90IGN1cnJlbnRseSB3ZWxsIHNwZWNpZmllZC5cbiAgYXN5bmMgZmluZE9uZUFuZFVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGRlYnVnKCdmaW5kT25lQW5kVXBkYXRlJyk7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB1cGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKS50aGVuKFxuICAgICAgdmFsID0+IHZhbFswXVxuICAgICk7XG4gIH1cblxuICAvLyBBcHBseSB0aGUgdXBkYXRlIHRvIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICBhc3luYyB1cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApOiBQcm9taXNlPFthbnldPiB7XG4gICAgZGVidWcoJ3VwZGF0ZU9iamVjdHNCeVF1ZXJ5Jyk7XG4gICAgY29uc3QgdXBkYXRlUGF0dGVybnMgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcblxuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0geyAuLi51cGRhdGUgfTtcblxuICAgIC8vIFNldCBmbGFnIGZvciBkb3Qgbm90YXRpb24gZmllbGRzXG4gICAgY29uc3QgZG90Tm90YXRpb25PcHRpb25zID0ge307XG4gICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaXJzdF0gPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0gPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB1cGRhdGUgPSBoYW5kbGVEb3RGaWVsZHModXBkYXRlKTtcbiAgICAvLyBSZXNvbHZlIGF1dGhEYXRhIGZpcnN0LFxuICAgIC8vIFNvIHdlIGRvbid0IGVuZCB1cCB3aXRoIG11bHRpcGxlIGtleSB1cGRhdGVzXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXSA9IHVwZGF0ZVsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgZmllbGRWYWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgLy8gRHJvcCBhbnkgdW5kZWZpbmVkIHZhbHVlcy5cbiAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT0gJ2F1dGhEYXRhJykge1xuICAgICAgICAvLyBUaGlzIHJlY3Vyc2l2ZWx5IHNldHMgdGhlIGpzb25fb2JqZWN0XG4gICAgICAgIC8vIE9ubHkgMSBsZXZlbCBkZWVwXG4gICAgICAgIGNvbnN0IGdlbmVyYXRlID0gKGpzb25iOiBzdHJpbmcsIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGBqc29uX29iamVjdF9zZXRfa2V5KENPQUxFU0NFKCR7anNvbmJ9LCAne30nOjpqc29uYiksICR7a2V5fSwgJHt2YWx1ZX0pOjpqc29uYmA7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGxhc3RLZXkgPSBgJCR7aW5kZXh9Om5hbWVgO1xuICAgICAgICBjb25zdCBmaWVsZE5hbWVJbmRleCA9IGluZGV4O1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBjb25zdCB1cGRhdGUgPSBPYmplY3Qua2V5cyhmaWVsZFZhbHVlKS5yZWR1Y2UoKGxhc3RLZXk6IHN0cmluZywga2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICBjb25zdCBzdHIgPSBnZW5lcmF0ZShsYXN0S2V5LCBgJCR7aW5kZXh9Ojp0ZXh0YCwgYCQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICBsZXQgdmFsdWUgPSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdmFsdWUgPSBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbHVlcy5wdXNoKGtleSwgdmFsdWUpO1xuICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgIH0sIGxhc3RLZXkpO1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtmaWVsZE5hbWVJbmRleH06bmFtZSA9ICR7dXBkYXRlfWApO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdJbmNyZW1lbnQnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsIDApICsgJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuYW1vdW50KTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZChDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtpbmRleCArIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgbnVsbCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ1JlbW92ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9yZW1vdmUoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDFcbiAgICAgICAgICB9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZFVuaXF1ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGRfdW5pcXVlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke1xuICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIC8vVE9ETzogc3RvcCBzcGVjaWFsIGNhc2luZyB0aGlzLiBJdCBzaG91bGQgY2hlY2sgZm9yIF9fdHlwZSA9PT0gJ0RhdGUnIGFuZCB1c2UgLmlzb1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSlgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIC8vIG5vb3BcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ09iamVjdCdcbiAgICAgICkge1xuICAgICAgICAvLyBHYXRoZXIga2V5cyB0byBpbmNyZW1lbnRcbiAgICAgICAgY29uc3Qga2V5c1RvSW5jcmVtZW50ID0gT2JqZWN0LmtleXMob3JpZ2luYWxVcGRhdGUpXG4gICAgICAgICAgLmZpbHRlcihrID0+IHtcbiAgICAgICAgICAgIC8vIGNob29zZSB0b3AgbGV2ZWwgZmllbGRzIHRoYXQgaGF2ZSBhIGRlbGV0ZSBvcGVyYXRpb24gc2V0XG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgT2JqZWN0LmtleXMgaXMgaXRlcmF0aW5nIG92ZXIgdGhlICoqb3JpZ2luYWwqKiB1cGRhdGUgb2JqZWN0XG4gICAgICAgICAgICAvLyBhbmQgdGhhdCBzb21lIG9mIHRoZSBrZXlzIG9mIHRoZSBvcmlnaW5hbCB1cGRhdGUgY291bGQgYmUgbnVsbCBvciB1bmRlZmluZWQ6XG4gICAgICAgICAgICAvLyAoU2VlIHRoZSBhYm92ZSBjaGVjayBgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIGZpZWxkVmFsdWUgPT0gXCJ1bmRlZmluZWRcIilgKVxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcmlnaW5hbFVwZGF0ZVtrXTtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHZhbHVlICYmXG4gICAgICAgICAgICAgIHZhbHVlLl9fb3AgPT09ICdJbmNyZW1lbnQnICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpWzBdID09PSBmaWVsZE5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGsgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBsZXQgaW5jcmVtZW50UGF0dGVybnMgPSAnJztcbiAgICAgICAgaWYgKGtleXNUb0luY3JlbWVudC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaW5jcmVtZW50UGF0dGVybnMgPVxuICAgICAgICAgICAgJyB8fCAnICtcbiAgICAgICAgICAgIGtleXNUb0luY3JlbWVudFxuICAgICAgICAgICAgICAubWFwKGMgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFtb3VudCA9IGZpZWxkVmFsdWVbY10uYW1vdW50O1xuICAgICAgICAgICAgICAgIHJldHVybiBgQ09OQ0FUKCd7XCIke2N9XCI6JywgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUtPj4nJHtjfScsJzAnKTo6aW50ICsgJHthbW91bnR9LCAnfScpOjpqc29uYmA7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5qb2luKCcgfHwgJyk7XG4gICAgICAgICAgLy8gU3RyaXAgdGhlIGtleXNcbiAgICAgICAgICBrZXlzVG9JbmNyZW1lbnQuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgICAgZGVsZXRlIGZpZWxkVmFsdWVba2V5XTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGtleXNUb0RlbGV0ZTogQXJyYXk8c3RyaW5nPiA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldC5cbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnRGVsZXRlJyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgY29uc3QgZGVsZXRlUGF0dGVybnMgPSBrZXlzVG9EZWxldGUucmVkdWNlKChwOiBzdHJpbmcsIGM6IHN0cmluZywgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHAgKyBgIC0gJyQke2luZGV4ICsgMSArIGl9OnZhbHVlJ2A7XG4gICAgICAgIH0sICcnKTtcbiAgICAgICAgLy8gT3ZlcnJpZGUgT2JqZWN0XG4gICAgICAgIGxldCB1cGRhdGVPYmplY3QgPSBcIid7fSc6Ompzb25iXCI7XG5cbiAgICAgICAgaWYgKGRvdE5vdGF0aW9uT3B0aW9uc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgLy8gTWVyZ2UgT2JqZWN0XG4gICAgICAgICAgdXBkYXRlT2JqZWN0ID0gYENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAne30nOjpqc29uYilgO1xuICAgICAgICB9XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gKCR7dXBkYXRlT2JqZWN0fSAke2RlbGV0ZVBhdHRlcm5zfSAke2luY3JlbWVudFBhdHRlcm5zfSB8fCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMSArIGtleXNUb0RlbGV0ZS5sZW5ndGhcbiAgICAgICAgICB9Ojpqc29uYiApYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIC4uLmtleXNUb0RlbGV0ZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyICsga2V5c1RvRGVsZXRlLmxlbmd0aDtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZSkgJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknXG4gICAgICApIHtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKTtcbiAgICAgICAgaWYgKGV4cGVjdGVkVHlwZSA9PT0gJ3RleHRbXScpIHtcbiAgICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnRleHRbXWApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVidWcoJ05vdCBzdXBwb3J0ZWQgdXBkYXRlJywgeyBmaWVsZE5hbWUsIGZpZWxkVmFsdWUgfSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB1cGRhdGUgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX0geWV0YFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlQ2xhdXNlID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgcXMgPSBgVVBEQVRFICQxOm5hbWUgU0VUICR7dXBkYXRlUGF0dGVybnMuam9pbigpfSAke3doZXJlQ2xhdXNlfSBSRVRVUk5JTkcgKmA7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpLmFueShxcywgdmFsdWVzKTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gSG9wZWZ1bGx5LCB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGlzLiBJdCdzIG9ubHkgdXNlZCBmb3IgY29uZmlnIGFuZCBob29rcy5cbiAgdXBzZXJ0T25lT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCd1cHNlcnRPbmVPYmplY3QnKTtcbiAgICBjb25zdCBjcmVhdGVWYWx1ZSA9IE9iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCB1cGRhdGUpO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZU9iamVjdChjbGFzc05hbWUsIHNjaGVtYSwgY3JlYXRlVmFsdWUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAvLyBpZ25vcmUgZHVwbGljYXRlIHZhbHVlIGVycm9ycyBhcyBpdCdzIHVwc2VydFxuICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLmZpbmRPbmVBbmRVcGRhdGUoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB1cGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgeyBza2lwLCBsaW1pdCwgc29ydCwga2V5cywgY2FzZUluc2Vuc2l0aXZlLCBleHBsYWluIH06IFF1ZXJ5T3B0aW9uc1xuICApIHtcbiAgICBkZWJ1ZygnZmluZCcpO1xuICAgIGNvbnN0IGhhc0xpbWl0ID0gbGltaXQgIT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBoYXNTa2lwID0gc2tpcCAhPT0gdW5kZWZpbmVkO1xuICAgIGxldCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IGxpbWl0UGF0dGVybiA9IGhhc0xpbWl0ID8gYExJTUlUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzTGltaXQpIHtcbiAgICAgIHZhbHVlcy5wdXNoKGxpbWl0KTtcbiAgICB9XG4gICAgY29uc3Qgc2tpcFBhdHRlcm4gPSBoYXNTa2lwID8gYE9GRlNFVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc1NraXApIHtcbiAgICAgIHZhbHVlcy5wdXNoKHNraXApO1xuICAgIH1cblxuICAgIGxldCBzb3J0UGF0dGVybiA9ICcnO1xuICAgIGlmIChzb3J0KSB7XG4gICAgICBjb25zdCBzb3J0Q29weTogYW55ID0gc29ydDtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBPYmplY3Qua2V5cyhzb3J0KVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgY29uc3QgdHJhbnNmb3JtS2V5ID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoa2V5KS5qb2luKCctPicpO1xuICAgICAgICAgIC8vIFVzaW5nICRpZHggcGF0dGVybiBnaXZlczogIG5vbi1pbnRlZ2VyIGNvbnN0YW50IGluIE9SREVSIEJZXG4gICAgICAgICAgaWYgKHNvcnRDb3B5W2tleV0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IEFTQ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IERFU0NgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgc29ydFBhdHRlcm4gPSBzb3J0ICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LmtleXMoc29ydCkubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgIH1cbiAgICBpZiAod2hlcmUuc29ydHMgJiYgT2JqZWN0LmtleXMoKHdoZXJlLnNvcnRzOiBhbnkpKS5sZW5ndGggPiAwKSB7XG4gICAgICBzb3J0UGF0dGVybiA9IGBPUkRFUiBCWSAke3doZXJlLnNvcnRzLmpvaW4oKX1gO1xuICAgIH1cblxuICAgIGxldCBjb2x1bW5zID0gJyonO1xuICAgIGlmIChrZXlzKSB7XG4gICAgICAvLyBFeGNsdWRlIGVtcHR5IGtleXNcbiAgICAgIC8vIFJlcGxhY2UgQUNMIGJ5IGl0J3Mga2V5c1xuICAgICAga2V5cyA9IGtleXMucmVkdWNlKChtZW1vLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgICBtZW1vLnB1c2goJ19ycGVybScpO1xuICAgICAgICAgIG1lbW8ucHVzaCgnX3dwZXJtJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAga2V5Lmxlbmd0aCA+IDAgJiZcbiAgICAgICAgICAvLyBSZW1vdmUgc2VsZWN0ZWQgZmllbGQgbm90IHJlZmVyZW5jZWQgaW4gdGhlIHNjaGVtYVxuICAgICAgICAgIC8vIFJlbGF0aW9uIGlzIG5vdCBhIGNvbHVtbiBpbiBwb3N0Z3Jlc1xuICAgICAgICAgIC8vICRzY29yZSBpcyBhIFBhcnNlIHNwZWNpYWwgZmllbGQgYW5kIGlzIGFsc28gbm90IGEgY29sdW1uXG4gICAgICAgICAgKChzY2hlbWEuZmllbGRzW2tleV0gJiYgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgIT09ICdSZWxhdGlvbicpIHx8IGtleSA9PT0gJyRzY29yZScpXG4gICAgICAgICkge1xuICAgICAgICAgIG1lbW8ucHVzaChrZXkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfSwgW10pO1xuICAgICAgY29sdW1ucyA9IGtleXNcbiAgICAgICAgLm1hcCgoa2V5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIGlmIChrZXkgPT09ICckc2NvcmUnKSB7XG4gICAgICAgICAgICByZXR1cm4gYHRzX3JhbmtfY2QodG9fdHN2ZWN0b3IoJCR7Mn0sICQkezN9Om5hbWUpLCB0b190c3F1ZXJ5KCQkezR9LCAkJHs1fSksIDMyKSBhcyBzY29yZWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJCR7aW5kZXggKyB2YWx1ZXMubGVuZ3RoICsgMX06bmFtZWA7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCk7XG4gICAgICB2YWx1ZXMgPSB2YWx1ZXMuY29uY2F0KGtleXMpO1xuICAgIH1cblxuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBgU0VMRUNUICR7Y29sdW1uc30gRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufSAke3NvcnRQYXR0ZXJufSAke2xpbWl0UGF0dGVybn0gJHtza2lwUGF0dGVybn1gO1xuICAgIGNvbnN0IHFzID0gZXhwbGFpbiA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KSA6IG9yaWdpbmFsUXVlcnk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gUXVlcnkgb24gbm9uIGV4aXN0aW5nIHRhYmxlLCBkb24ndCBjcmFzaFxuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoZXhwbGFpbikge1xuICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4gdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBDb252ZXJ0cyBmcm9tIGEgcG9zdGdyZXMtZm9ybWF0IG9iamVjdCB0byBhIFJFU1QtZm9ybWF0IG9iamVjdC5cbiAgLy8gRG9lcyBub3Qgc3RyaXAgb3V0IGFueXRoaW5nIGJhc2VkIG9uIGEgbGFjayBvZiBhdXRoZW50aWNhdGlvbi5cbiAgcG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgc2NoZW1hOiBhbnkpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJyAmJiBvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkTmFtZV0sXG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICBsYXRpdHVkZTogb2JqZWN0W2ZpZWxkTmFtZV0ueSxcbiAgICAgICAgICBsb25naXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLngsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBsZXQgY29vcmRzID0gbmV3IFN0cmluZyhvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgIGNvb3JkcyA9IGNvb3Jkcy5zdWJzdHJpbmcoMiwgY29vcmRzLmxlbmd0aCAtIDIpLnNwbGl0KCcpLCgnKTtcbiAgICAgICAgY29uc3QgdXBkYXRlZENvb3JkcyA9IGNvb3Jkcy5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgIHJldHVybiBbcGFyc2VGbG9hdChwb2ludC5zcGxpdCgnLCcpWzFdKSwgcGFyc2VGbG9hdChwb2ludC5zcGxpdCgnLCcpWzBdKV07XG4gICAgICAgIH0pO1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdQb2x5Z29uJyxcbiAgICAgICAgICBjb29yZGluYXRlczogdXBkYXRlZENvb3JkcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgICAgIG5hbWU6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIC8vVE9ETzogcmVtb3ZlIHRoaXMgcmVsaWFuY2Ugb24gdGhlIG1vbmdvIGZvcm1hdC4gREIgYWRhcHRlciBzaG91bGRuJ3Qga25vdyB0aGVyZSBpcyBhIGRpZmZlcmVuY2UgYmV0d2VlbiBjcmVhdGVkIGF0IGFuZCBhbnkgb3RoZXIgZGF0ZSBmaWVsZC5cbiAgICBpZiAob2JqZWN0LmNyZWF0ZWRBdCkge1xuICAgICAgb2JqZWN0LmNyZWF0ZWRBdCA9IG9iamVjdC5jcmVhdGVkQXQudG9JU09TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC51cGRhdGVkQXQpIHtcbiAgICAgIG9iamVjdC51cGRhdGVkQXQgPSBvYmplY3QudXBkYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QuZXhwaXJlc0F0KSB7XG4gICAgICBvYmplY3QuZXhwaXJlc0F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuZXhwaXJlc0F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0KSB7XG4gICAgICBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICAgIGlzbzogb2JqZWN0W2ZpZWxkTmFtZV0udG9JU09TdHJpbmcoKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBhc3luYyBlbnN1cmVVbmlxdWVuZXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgY29uc3RyYWludE5hbWUgPSBgJHtjbGFzc05hbWV9X3VuaXF1ZV8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYCk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFVOSVFVRSBJTkRFWCBJRiBOT1QgRVhJU1RTICQyOm5hbWUgT04gJDE6bmFtZSgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKHFzLCBbY2xhc3NOYW1lLCBjb25zdHJhaW50TmFtZSwgLi4uZmllbGROYW1lc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSkpIHtcbiAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGNvbnN0cmFpbnROYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIENhc3QgdGhlIGVycm9yIGludG8gdGhlIHByb3BlciBwYXJzZSBlcnJvclxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGNvdW50LlxuICBhc3luYyBjb3VudChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICByZWFkUHJlZmVyZW5jZT86IHN0cmluZyxcbiAgICBlc3RpbWF0ZT86IGJvb2xlYW4gPSB0cnVlXG4gICkge1xuICAgIGRlYnVnKCdjb3VudCcpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiAyLFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgbGV0IHFzID0gJyc7XG5cbiAgICBpZiAod2hlcmUucGF0dGVybi5sZW5ndGggPiAwIHx8ICFlc3RpbWF0ZSkge1xuICAgICAgcXMgPSBgU0VMRUNUIGNvdW50KCopIEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIH0gZWxzZSB7XG4gICAgICBxcyA9ICdTRUxFQ1QgcmVsdHVwbGVzIEFTIGFwcHJveGltYXRlX3Jvd19jb3VudCBGUk9NIHBnX2NsYXNzIFdIRVJFIHJlbG5hbWUgPSAkMSc7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLm9uZShxcywgdmFsdWVzLCBhID0+IHtcbiAgICAgICAgaWYgKGEuYXBwcm94aW1hdGVfcm93X2NvdW50ID09IG51bGwgfHwgYS5hcHByb3hpbWF0ZV9yb3dfY291bnQgPT0gLTEpIHtcbiAgICAgICAgICByZXR1cm4gIWlzTmFOKCthLmNvdW50KSA/ICthLmNvdW50IDogMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gK2EuYXBwcm94aW1hdGVfcm93X2NvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBkaXN0aW5jdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBxdWVyeTogUXVlcnlUeXBlLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIGRlYnVnKCdkaXN0aW5jdCcpO1xuICAgIGxldCBmaWVsZCA9IGZpZWxkTmFtZTtcbiAgICBsZXQgY29sdW1uID0gZmllbGROYW1lO1xuICAgIGNvbnN0IGlzTmVzdGVkID0gZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwO1xuICAgIGlmIChpc05lc3RlZCkge1xuICAgICAgZmllbGQgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICBjb2x1bW4gPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbiAgICB9XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGlzUG9pbnRlckZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcic7XG4gICAgY29uc3QgdmFsdWVzID0gW2ZpZWxkLCBjb2x1bW4sIGNsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCB0cmFuc2Zvcm1lciA9IGlzQXJyYXlGaWVsZCA/ICdqc29uYl9hcnJheV9lbGVtZW50cycgOiAnT04nO1xuICAgIGxldCBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6bmFtZSkgJDI6bmFtZSBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpyYXcpICQyOnJhdyBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yKSB7XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoIWlzTmVzdGVkKSB7XG4gICAgICAgICAgcmVzdWx0cyA9IHJlc3VsdHMuZmlsdGVyKG9iamVjdCA9PiBvYmplY3RbZmllbGRdICE9PSBudWxsKTtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgIGlmICghaXNQb2ludGVyRmllbGQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdFtmaWVsZF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGRdLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjaGlsZCA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzFdO1xuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IG9iamVjdFtjb2x1bW5dW2NoaWxkXSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PlxuICAgICAgICByZXN1bHRzLm1hcChvYmplY3QgPT4gdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpXG4gICAgICApO1xuICB9XG5cbiAgYXN5bmMgYWdncmVnYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogYW55LFxuICAgIHBpcGVsaW5lOiBhbnksXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgaGludDogP21peGVkLFxuICAgIGV4cGxhaW4/OiBib29sZWFuXG4gICkge1xuICAgIGRlYnVnKCdhZ2dyZWdhdGUnKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXg6IG51bWJlciA9IDI7XG4gICAgbGV0IGNvbHVtbnM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGNvdW50RmllbGQgPSBudWxsO1xuICAgIGxldCBncm91cFZhbHVlcyA9IG51bGw7XG4gICAgbGV0IHdoZXJlUGF0dGVybiA9ICcnO1xuICAgIGxldCBsaW1pdFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc2tpcFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBsZXQgZ3JvdXBQYXR0ZXJuID0gJyc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaXBlbGluZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3Qgc3RhZ2UgPSBwaXBlbGluZVtpXTtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRncm91cFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUgIT09ICcnKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTIFwib2JqZWN0SWRcImApO1xuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ19pZCcgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiBPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICBncm91cFZhbHVlcyA9IHZhbHVlO1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBCeUZpZWxkcyA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBhbGlhcyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2FsaWFzXSA9PT0gJ3N0cmluZycgJiYgdmFsdWVbYWxpYXNdKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gdHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWVbYWxpYXNdKTtcbiAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgZ3JvdXBCeUZpZWxkcy5wdXNoKGBcIiR7c291cmNlfVwiYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHNvdXJjZSwgYWxpYXMpO1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWUgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcGVyYXRpb24gPSBPYmplY3Qua2V5cyh2YWx1ZVthbGlhc10pWzBdO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXVtvcGVyYXRpb25dKTtcbiAgICAgICAgICAgICAgICBpZiAobW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl0pIHtcbiAgICAgICAgICAgICAgICAgIGlmICghZ3JvdXBCeUZpZWxkcy5pbmNsdWRlcyhgXCIke3NvdXJjZX1cImApKSB7XG4gICAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICBgRVhUUkFDVCgke1xuICAgICAgICAgICAgICAgICAgICAgIG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dXG4gICAgICAgICAgICAgICAgICAgIH0gRlJPTSAkJHtpbmRleH06bmFtZSBBVCBUSU1FIFpPTkUgJ1VUQycpOjppbnRlZ2VyIEFTICQke2luZGV4ICsgMX06bmFtZWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9OnJhd2A7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChncm91cEJ5RmllbGRzLmpvaW4oKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuJHN1bSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlLiRzdW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBTVU0oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRzdW0pLCBmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb3VudEZpZWxkID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBDT1VOVCgqKSBBUyAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1heCkge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1BWCgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtYXgpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1pbikge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1JTigkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtaW4pLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJGF2Zykge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYEFWRygkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRhdmcpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2x1bW5zLnB1c2goJyonKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICBpZiAoY29sdW1ucy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgY29sdW1ucyA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRwcm9qZWN0W2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IDEgfHwgdmFsdWUgPT09IHRydWUpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5zID0gW107XG4gICAgICAgIGNvbnN0IG9yT3JBbmQgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2UuJG1hdGNoLCAnJG9yJylcbiAgICAgICAgICA/ICcgT1IgJ1xuICAgICAgICAgIDogJyBBTkQgJztcblxuICAgICAgICBpZiAoc3RhZ2UuJG1hdGNoLiRvcikge1xuICAgICAgICAgIGNvbnN0IGNvbGxhcHNlID0ge307XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLiRvci5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZWxlbWVudCkge1xuICAgICAgICAgICAgICBjb2xsYXBzZVtrZXldID0gZWxlbWVudFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHN0YWdlLiRtYXRjaCA9IGNvbGxhcHNlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAobGV0IGZpZWxkIGluIHN0YWdlLiRtYXRjaCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJG1hdGNoW2ZpZWxkXTtcbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnKSB7XG4gICAgICAgICAgICBmaWVsZCA9ICdvYmplY3RJZCc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IG1hdGNoUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgICAgICAgIGlmICh2YWx1ZVtjbXBdKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICAgICAgICBtYXRjaFBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkLCB0b1Bvc3RncmVzVmFsdWUodmFsdWVbY21wXSkpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGlmIChtYXRjaFBhdHRlcm5zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgke21hdGNoUGF0dGVybnMuam9pbignIEFORCAnKX0pYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIG1hdGNoUGF0dGVybnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkLCB2YWx1ZSk7XG4gICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB3aGVyZVBhdHRlcm4gPSBwYXR0ZXJucy5sZW5ndGggPiAwID8gYFdIRVJFICR7cGF0dGVybnMuam9pbihgICR7b3JPckFuZH0gYCl9YCA6ICcnO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRsaW1pdCkge1xuICAgICAgICBsaW1pdFBhdHRlcm4gPSBgTElNSVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJGxpbWl0KTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc2tpcCkge1xuICAgICAgICBza2lwUGF0dGVybiA9IGBPRkZTRVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJHNraXApO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRzb3J0KSB7XG4gICAgICAgIGNvbnN0IHNvcnQgPSBzdGFnZS4kc29ydDtcbiAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHNvcnQpO1xuICAgICAgICBjb25zdCBzb3J0aW5nID0ga2V5c1xuICAgICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gc29ydFtrZXldID09PSAxID8gJ0FTQycgOiAnREVTQyc7XG4gICAgICAgICAgICBjb25zdCBvcmRlciA9IGAkJHtpbmRleH06bmFtZSAke3RyYW5zZm9ybWVyfWA7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgcmV0dXJuIG9yZGVyO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmpvaW4oKTtcbiAgICAgICAgdmFsdWVzLnB1c2goLi4ua2V5cyk7XG4gICAgICAgIHNvcnRQYXR0ZXJuID0gc29ydCAhPT0gdW5kZWZpbmVkICYmIHNvcnRpbmcubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChncm91cFBhdHRlcm4pIHtcbiAgICAgIGNvbHVtbnMuZm9yRWFjaCgoZSwgaSwgYSkgPT4ge1xuICAgICAgICBpZiAoZSAmJiBlLnRyaW0oKSA9PT0gJyonKSB7XG4gICAgICAgICAgYVtpXSA9ICcnO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnNcbiAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgIC5qb2luKCl9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtza2lwUGF0dGVybn0gJHtncm91cFBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluID8gdGhpcy5jcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KG9yaWdpbmFsUXVlcnkpIDogb3JpZ2luYWxRdWVyeTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgdmFsdWVzKS50aGVuKGEgPT4ge1xuICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgcmV0dXJuIGE7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHRzID0gYS5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdvYmplY3RJZCcpKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSB7fTtcbiAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBncm91cFZhbHVlcykge1xuICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkW2tleV0gPSByZXN1bHRba2V5XTtcbiAgICAgICAgICAgIGRlbGV0ZSByZXN1bHRba2V5XTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvdW50RmllbGQpIHtcbiAgICAgICAgICByZXN1bHRbY291bnRGaWVsZF0gPSBwYXJzZUludChyZXN1bHRbY291bnRGaWVsZF0sIDEwKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbih7IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgfTogYW55KSB7XG4gICAgLy8gVE9ETzogVGhpcyBtZXRob2QgbmVlZHMgdG8gYmUgcmV3cml0dGVuIHRvIG1ha2UgcHJvcGVyIHVzZSBvZiBjb25uZWN0aW9ucyAoQHZpdGFseS10KVxuICAgIGRlYnVnKCdwZXJmb3JtSW5pdGlhbGl6YXRpb24nKTtcbiAgICBhd2FpdCB0aGlzLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKCk7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzLm1hcChzY2hlbWEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlVGFibGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKVxuICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIHx8XG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5zY2hlbWFVcGdyYWRlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSkpO1xuICAgIH0pO1xuICAgIHByb21pc2VzLnB1c2godGhpcy5fbGlzdGVuVG9TY2hlbWEoKSk7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2xpZW50LnR4KCdwZXJmb3JtLWluaXRpYWxpemF0aW9uJywgYXN5bmMgdCA9PiB7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5taXNjLmpzb25PYmplY3RTZXRLZXlzKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmFkZCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGRVbmlxdWUpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkucmVtb3ZlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zQWxsKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zQWxsUmVnZXgpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuY29udGFpbnMpO1xuICAgICAgICAgIHJldHVybiB0LmN0eDtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oY3R4ID0+IHtcbiAgICAgICAgZGVidWcoYGluaXRpYWxpemF0aW9uRG9uZSBpbiAke2N0eC5kdXJhdGlvbn1gKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46ID9hbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+XG4gICAgICB0LmJhdGNoKFxuICAgICAgICBpbmRleGVzLm1hcChpID0+IHtcbiAgICAgICAgICByZXR1cm4gdC5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgICAgICAgaS5uYW1lLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaS5rZXksXG4gICAgICAgICAgXSk7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCAoY29ubiB8fCB0aGlzLl9jbGllbnQpLm5vbmUoJ0NSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLCBbXG4gICAgICBmaWVsZE5hbWUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0eXBlLFxuICAgIF0pO1xuICB9XG5cbiAgYXN5bmMgZHJvcEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSwgY29ubjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcXVlcmllcyA9IGluZGV4ZXMubWFwKGkgPT4gKHtcbiAgICAgIHF1ZXJ5OiAnRFJPUCBJTkRFWCAkMTpuYW1lJyxcbiAgICAgIHZhbHVlczogaSxcbiAgICB9KSk7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+IHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgfVxuXG4gIGFzeW5jIGdldEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxcyA9ICdTRUxFQ1QgKiBGUk9NIHBnX2luZGV4ZXMgV0hFUkUgdGFibGVuYW1lID0gJHtjbGFzc05hbWV9JztcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgeyBjbGFzc05hbWUgfSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBVc2VkIGZvciB0ZXN0aW5nIHB1cnBvc2VzXG4gIGFzeW5jIHVwZGF0ZUVzdGltYXRlZENvdW50KGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKCdBTkFMWVpFICQxOm5hbWUnLCBbY2xhc3NOYW1lXSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZXNzaW9uID0ge307XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXN1bHQgPSB0aGlzLl9jbGllbnQudHgodCA9PiB7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgPSB0O1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICAgIH0pO1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaCA9IFtdO1xuICAgICAgICByZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnByb21pc2U7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZXNzaW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0O1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0LmNhdGNoKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChQcm9taXNlLnJlamVjdCgpKTtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSW5kZXgoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIGZpZWxkTmFtZXM6IHN0cmluZ1tdLFxuICAgIGluZGV4TmFtZTogP3N0cmluZyxcbiAgICBjYXNlSW5zZW5zaXRpdmU6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zPzogT2JqZWN0ID0ge31cbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgZGVmYXVsdEluZGV4TmFtZSA9IGBwYXJzZV9kZWZhdWx0XyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID1cbiAgICAgIGluZGV4TmFtZSAhPSBudWxsID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHsgbmFtZTogZGVmYXVsdEluZGV4TmFtZSB9O1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYGxvd2VyKCQke2luZGV4ICsgM306bmFtZSkgdmFyY2hhcl9wYXR0ZXJuX29wc2ApXG4gICAgICA6IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYCk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgY29uc3Qgc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA9XG4gICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA6IGZhbHNlO1xuICAgIGlmIChzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uKSB7XG4gICAgICBhd2FpdCB0aGlzLmVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucyk7XG4gICAgfVxuICAgIGF3YWl0IGNvbm4ubm9uZShxcywgW2luZGV4TmFtZU9wdGlvbnMubmFtZSwgY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGluZGV4TmFtZU9wdGlvbnMubmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGVsZXRlSWRlbXBvdGVuY3lGdW5jdGlvbihvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBxcyA9ICdEUk9QIEZVTkNUSU9OIElGIEVYSVNUUyBpZGVtcG90ZW5jeV9kZWxldGVfZXhwaXJlZF9yZWNvcmRzKCknO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMpLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyhvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCB0dGxPcHRpb25zID0gb3B0aW9ucy50dGwgIT09IHVuZGVmaW5lZCA/IGAke29wdGlvbnMudHRsfSBzZWNvbmRzYCA6ICc2MCBzZWNvbmRzJztcbiAgICBjb25zdCBxcyA9XG4gICAgICAnQ1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04gaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpIFJFVFVSTlMgdm9pZCBMQU5HVUFHRSBwbHBnc3FsIEFTICQkIEJFR0lOIERFTEVURSBGUk9NIFwiX0lkZW1wb3RlbmN5XCIgV0hFUkUgZXhwaXJlIDwgTk9XKCkgLSBJTlRFUlZBTCAkMTsgRU5EOyAkJDsnO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMsIFt0dGxPcHRpb25zXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29udmVydFBvbHlnb25Ub1NRTChwb2x5Z29uKSB7XG4gIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgUG9seWdvbiBtdXN0IGhhdmUgYXQgbGVhc3QgMyB2YWx1ZXNgKTtcbiAgfVxuICBpZiAoXG4gICAgcG9seWdvblswXVswXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzBdIHx8XG4gICAgcG9seWdvblswXVsxXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzFdXG4gICkge1xuICAgIHBvbHlnb24ucHVzaChwb2x5Z29uWzBdKTtcbiAgfVxuICBjb25zdCB1bmlxdWUgPSBwb2x5Z29uLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgbGV0IGZvdW5kSW5kZXggPSAtMTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgaWYgKHB0WzBdID09PSBpdGVtWzBdICYmIHB0WzFdID09PSBpdGVtWzFdKSB7XG4gICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICB9KTtcbiAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICk7XG4gIH1cbiAgY29uc3QgcG9pbnRzID0gcG9seWdvblxuICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBhcnNlRmxvYXQocG9pbnRbMV0pLCBwYXJzZUZsb2F0KHBvaW50WzBdKSk7XG4gICAgICByZXR1cm4gYCgke3BvaW50WzFdfSwgJHtwb2ludFswXX0pYDtcbiAgICB9KVxuICAgIC5qb2luKCcsICcpO1xuICByZXR1cm4gYCgke3BvaW50c30pYDtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCkge1xuICBpZiAoIXJlZ2V4LmVuZHNXaXRoKCdcXG4nKSkge1xuICAgIHJlZ2V4ICs9ICdcXG4nO1xuICB9XG5cbiAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIGNvbW1lbnRzXG4gIHJldHVybiAoXG4gICAgcmVnZXhcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSkjLipcXG4vZ2ltLCAnJDEnKVxuICAgICAgLy8gcmVtb3ZlIGxpbmVzIHN0YXJ0aW5nIHdpdGggYSBjb21tZW50XG4gICAgICAucmVwbGFjZSgvXiMuKlxcbi9naW0sICcnKVxuICAgICAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIHdoaXRlc3BhY2VcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSlcXHMrL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSB3aGl0ZXNwYWNlIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBsaW5lXG4gICAgICAucmVwbGFjZSgvXlxccysvLCAnJylcbiAgICAgIC50cmltKClcbiAgKTtcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1JlZ2V4UGF0dGVybihzKSB7XG4gIGlmIChzICYmIHMuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgLy8gcmVnZXggZm9yIHN0YXJ0c1dpdGhcbiAgICByZXR1cm4gJ14nICsgbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDEpKTtcbiAgfSBlbHNlIGlmIChzICYmIHMuZW5kc1dpdGgoJyQnKSkge1xuICAgIC8vIHJlZ2V4IGZvciBlbmRzV2l0aFxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMuc2xpY2UoMCwgcy5sZW5ndGggLSAxKSkgKyAnJCc7XG4gIH1cblxuICAvLyByZWdleCBmb3IgY29udGFpbnNcbiAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocyk7XG59XG5cbmZ1bmN0aW9uIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlKSB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCAhdmFsdWUuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9cXF5cXFxcUS4qXFxcXEUvKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn1cblxuZnVuY3Rpb24gaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpIHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0uJHJlZ2V4KTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXS4kcmVnZXgpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgodmFsdWVzKSB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gaXNTdGFydHNXaXRoUmVnZXgodmFsdWUuJHJlZ2V4KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpIHtcbiAgcmV0dXJuIHJlbWFpbmluZ1xuICAgIC5zcGxpdCgnJylcbiAgICAubWFwKGMgPT4ge1xuICAgICAgY29uc3QgcmVnZXggPSBSZWdFeHAoJ1swLTkgXXxcXFxccHtMfScsICd1Jyk7IC8vIFN1cHBvcnQgYWxsIHVuaWNvZGUgbGV0dGVyIGNoYXJzXG4gICAgICBpZiAoYy5tYXRjaChyZWdleCkgIT09IG51bGwpIHtcbiAgICAgICAgLy8gZG9uJ3QgZXNjYXBlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzXG4gICAgICAgIHJldHVybiBjO1xuICAgICAgfVxuICAgICAgLy8gZXNjYXBlIGV2ZXJ5dGhpbmcgZWxzZSAoc2luZ2xlIHF1b3RlcyB3aXRoIHNpbmdsZSBxdW90ZXMsIGV2ZXJ5dGhpbmcgZWxzZSB3aXRoIGEgYmFja3NsYXNoKVxuICAgICAgcmV0dXJuIGMgPT09IGAnYCA/IGAnJ2AgOiBgXFxcXCR7Y31gO1xuICAgIH0pXG4gICAgLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBsaXRlcmFsaXplUmVnZXhQYXJ0KHM6IHN0cmluZykge1xuICBjb25zdCBtYXRjaGVyMSA9IC9cXFxcUSgoPyFcXFxcRSkuKilcXFxcRSQvO1xuICBjb25zdCByZXN1bHQxOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIxKTtcbiAgaWYgKHJlc3VsdDEgJiYgcmVzdWx0MS5sZW5ndGggPiAxICYmIHJlc3VsdDEuaW5kZXggPiAtMSkge1xuICAgIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgYW5kIGFuIGVuZCBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cmluZygwLCByZXN1bHQxLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQxWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gcHJvY2VzcyByZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgY29uc3QgbWF0Y2hlcjIgPSAvXFxcXFEoKD8hXFxcXEUpLiopJC87XG4gIGNvbnN0IHJlc3VsdDI6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjIpO1xuICBpZiAocmVzdWx0MiAmJiByZXN1bHQyLmxlbmd0aCA+IDEgJiYgcmVzdWx0Mi5pbmRleCA+IC0xKSB7XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHJpbmcoMCwgcmVzdWx0Mi5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MlsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHJlbW92ZSBhbGwgaW5zdGFuY2VzIG9mIFxcUSBhbmQgXFxFIGZyb20gdGhlIHJlbWFpbmluZyB0ZXh0ICYgZXNjYXBlIHNpbmdsZSBxdW90ZXNcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxFKS8sICckMScpXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcUSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC9eXFxcXEUvLCAnJylcbiAgICAucmVwbGFjZSgvXlxcXFxRLywgJycpXG4gICAgLnJlcGxhY2UoLyhbXiddKScvLCBgJDEnJ2ApXG4gICAgLnJlcGxhY2UoL14nKFteJ10pLywgYCcnJDFgKTtcbn1cblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnO1xuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsSUFBQUEsZUFBQSxHQUFBQyxPQUFBO0FBRUEsSUFBQUMsS0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBRUEsSUFBQUcsT0FBQSxHQUFBRCxzQkFBQSxDQUFBRixPQUFBO0FBRUEsSUFBQUksS0FBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssSUFBQSxHQUFBSCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQU0sZUFBQSxHQUFBTixPQUFBO0FBQW1ELFNBQUFFLHVCQUFBSyxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBQUEsU0FBQUcsUUFBQUMsTUFBQSxFQUFBQyxjQUFBLFFBQUFDLElBQUEsR0FBQUMsTUFBQSxDQUFBRCxJQUFBLENBQUFGLE1BQUEsT0FBQUcsTUFBQSxDQUFBQyxxQkFBQSxRQUFBQyxPQUFBLEdBQUFGLE1BQUEsQ0FBQUMscUJBQUEsQ0FBQUosTUFBQSxHQUFBQyxjQUFBLEtBQUFJLE9BQUEsR0FBQUEsT0FBQSxDQUFBQyxNQUFBLFdBQUFDLEdBQUEsV0FBQUosTUFBQSxDQUFBSyx3QkFBQSxDQUFBUixNQUFBLEVBQUFPLEdBQUEsRUFBQUUsVUFBQSxPQUFBUCxJQUFBLENBQUFRLElBQUEsQ0FBQUMsS0FBQSxDQUFBVCxJQUFBLEVBQUFHLE9BQUEsWUFBQUgsSUFBQTtBQUFBLFNBQUFVLGNBQUFDLE1BQUEsYUFBQUMsQ0FBQSxNQUFBQSxDQUFBLEdBQUFDLFNBQUEsQ0FBQUMsTUFBQSxFQUFBRixDQUFBLFVBQUFHLE1BQUEsV0FBQUYsU0FBQSxDQUFBRCxDQUFBLElBQUFDLFNBQUEsQ0FBQUQsQ0FBQSxRQUFBQSxDQUFBLE9BQUFmLE9BQUEsQ0FBQUksTUFBQSxDQUFBYyxNQUFBLE9BQUFDLE9BQUEsV0FBQUMsR0FBQSxJQUFB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