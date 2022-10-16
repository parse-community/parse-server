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

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
}; // Duplicate from then mongo adapter...


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
}; // Returns the list of join tables on a schema


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
    const fieldValue = query[fieldName]; // nothing in the schema, it's gonna blow up

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
        } else if (fieldValue.$regex) {// Handle later
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
      patterns.push(`$${index}:name = $${index + 1}`); // Can't cast boolean to double precision

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
      } // Get point, convert to geo point if necessary and validate


      let point = centerSphere[0];

      if (point instanceof Array && point.length === 2) {
        point = new _node.default.GeoPoint(point[1], point[0]);
      } else if (!GeoPointCoder.isValidJSON(point)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
      }

      _node.default.GeoPoint._validate(point.latitude, point.longitude); // Get distance and validate


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
    this._collectionPrefix = collectionPrefix;
    this.enableSchemaHooks = !!databaseOptions.enableSchemaHooks;
    this.disableIndexFieldValidation = !!databaseOptions.disableIndexFieldValidation;
    delete databaseOptions.enableSchemaHooks;
    delete databaseOptions.disableIndexFieldValidation;
    const {
      client,
      pgp
    } = (0, _PostgresClient.createClient)(uri, databaseOptions);
    this._client = client;

    this._onchange = () => {};

    this._pgp = pgp;
    this._uuid = (0, _uuid.v4)();
    this.canSortOnJoinTables = false;
  }

  watch(callback) {
    this._onchange = callback;
  } //Note that analyze=true will run the query, executing INSERTS, DELETES, etc.


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
  } // Just create a table, do not insert in schema


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
      const parseType = fields[fieldName]; // Skip when it's a relation
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
        } // ELSE: Table already exists, must have been created by a different request. Ignore the error.

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
          } // Column already exists, created by other request. Carry on to see if it's the right type.

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
  } // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
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
  } // Delete all data known to this adapter. Used for testing.


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
        } // No _SCHEMA collection. Don't delete anything.

      }
    }).then(() => {
      debug(`deleteAllClasses done in ${new Date().getTime() - now}`);
    });
  } // Remove the column and all the data. For Relations, the _Join collection is handled
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
  } // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.


  async getAllClasses() {
    return this._client.task('get-all-classes', async t => {
      return await t.map('SELECT * FROM "_SCHEMA"', null, row => toParseSchema(_objectSpread({
        className: row.className
      }, row.schema)));
    });
  } // Return a promise for the schema with the given name, in Parse format. If
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
  } // TODO: remove the mongo format dependency in the return value


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
        fieldName = 'authData'; // Avoid adding authData multiple times to the query

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
  } // Remove all objects that match the given Parse Query.
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
      } // ELSE: Don't delete anything if doesn't exist

    });

    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }

    return promise;
  } // Return value not currently well specified.


  async findOneAndUpdate(className, schema, query, update, transactionalSession) {
    debug('findOneAndUpdate');
    return this.updateObjectsByQuery(className, schema, query, update, transactionalSession).then(val => val[0]);
  } // Apply the update to all objects that match the given Parse Query.


  async updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    debug('updateObjectsByQuery');
    const updatePatterns = [];
    const values = [className];
    let index = 2;
    schema = toPostgresSchema(schema);

    const originalUpdate = _objectSpread({}, update); // Set flag for dot notation fields


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
    update = handleDotFields(update); // Resolve authData first,
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
      const fieldValue = update[fieldName]; // Drop any undefined values.

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
      } else if (fieldValue.__type === 'Relation') {// noop
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
          }).join(' || '); // Strip the keys

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
        }, ''); // Override Object

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
  } // Hopefully, we can get rid of this. It's only used for config and hooks.


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
        const transformKey = transformDotFieldToComponents(key).join('->'); // Using $idx pattern gives:  non-integer constant in ORDER BY

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
        } else if (key.length > 0 && (schema.fields[key] && schema.fields[key].type !== 'Relation' || key === '$score')) {
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
  } // Converts from a postgres-format object to a REST-format object.
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
    }); //TODO: remove this reliance on the mongo format. DB adapter shouldn't know there is a difference between created at and any other date field.

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
  } // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.


  async ensureUniqueness(className, schema, fieldNames) {
    const constraintName = `${className}_unique_${fieldNames.sort().join('_')}`;
    const constraintPatterns = fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE UNIQUE INDEX IF NOT EXISTS $2:name ON $1:name(${constraintPatterns.join()})`;
    return this._client.none(qs, [className, constraintName, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(constraintName)) {// Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(constraintName)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  } // Executes a count.


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

        for (const field in stage.$match) {
          const value = stage.$match[field];
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
  } // Used for testing purposes


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
      if (error.code === PostgresDuplicateRelationError && error.message.includes(indexNameOptions.name)) {// Index already exists. Ignore error.
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
  } // remove non escaped comments


  return regex.replace(/([^\\])#.*\n/gim, '$1') // remove lines starting with a comment
  .replace(/^#.*\n/gim, '') // remove non escaped whitespace
  .replace(/([^\\])\s+/gim, '$1') // remove whitespace at the beginning of a line
  .replace(/^\s+/, '').trim();
}

function processRegexPattern(s) {
  if (s && s.startsWith('^')) {
    // regex for startsWith
    return '^' + literalizeRegexPart(s.slice(1));
  } else if (s && s.endsWith('$')) {
    // regex for endsWith
    return literalizeRegexPart(s.slice(0, s.length - 1)) + '$';
  } // regex for contains


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
    } // escape everything else (single quotes with single quotes, everything else with a backslash)


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
  } // process regex that has a beginning specified for the literal text


  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2 = s.match(matcher2);

  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substr(0, result2.index);
    const remaining = result2[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  } // remove all instances of \Q and \E from the remaining text & escape single quotes


  return s.replace(/([^\\])(\\E)/, '$1').replace(/([^\\])(\\Q)/, '$1').replace(/^\\E/, '').replace(/^\\Q/, '').replace(/([^'])'/, `$1''`).replace(/^'([^'])/, `''$1`);
}

var GeoPointCoder = {
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }

};
var _default = PostgresStorageAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIuanMiXSwibmFtZXMiOlsiVXRpbHMiLCJyZXF1aXJlIiwiUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciIsIlBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yIiwiUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yIiwibG9nZ2VyIiwiZGVidWciLCJhcmdzIiwiYXJndW1lbnRzIiwiY29uY2F0Iiwic2xpY2UiLCJsZW5ndGgiLCJsb2ciLCJnZXRMb2dnZXIiLCJhcHBseSIsInBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlIiwidHlwZSIsImNvbnRlbnRzIiwiSlNPTiIsInN0cmluZ2lmeSIsIlBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciIsIiRndCIsIiRsdCIsIiRndGUiLCIkbHRlIiwibW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzIiwiJGRheU9mTW9udGgiLCIkZGF5T2ZXZWVrIiwiJGRheU9mWWVhciIsIiRpc29EYXlPZldlZWsiLCIkaXNvV2Vla1llYXIiLCIkaG91ciIsIiRtaW51dGUiLCIkc2Vjb25kIiwiJG1pbGxpc2Vjb25kIiwiJG1vbnRoIiwiJHdlZWsiLCIkeWVhciIsInRvUG9zdGdyZXNWYWx1ZSIsInZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlIiwicG9zdGdyZXNWYWx1ZSIsImNhc3RUeXBlIiwidW5kZWZpbmVkIiwidHJhbnNmb3JtVmFsdWUiLCJvYmplY3RJZCIsImVtcHR5Q0xQUyIsIk9iamVjdCIsImZyZWV6ZSIsImZpbmQiLCJnZXQiLCJjb3VudCIsImNyZWF0ZSIsInVwZGF0ZSIsImRlbGV0ZSIsImFkZEZpZWxkIiwicHJvdGVjdGVkRmllbGRzIiwiZGVmYXVsdENMUFMiLCJ0b1BhcnNlU2NoZW1hIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2hhc2hlZF9wYXNzd29yZCIsIl93cGVybSIsIl9ycGVybSIsImNscHMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwidG9Qb3N0Z3Jlc1NjaGVtYSIsIl9wYXNzd29yZF9oaXN0b3J5IiwiaGFuZGxlRG90RmllbGRzIiwib2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJmaWVsZE5hbWUiLCJpbmRleE9mIiwiY29tcG9uZW50cyIsInNwbGl0IiwiZmlyc3QiLCJzaGlmdCIsImN1cnJlbnRPYmoiLCJuZXh0IiwiX19vcCIsInRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzIiwibWFwIiwiY21wdCIsImluZGV4IiwidHJhbnNmb3JtRG90RmllbGQiLCJqb2luIiwidHJhbnNmb3JtQWdncmVnYXRlRmllbGQiLCJzdWJzdHIiLCJ2YWxpZGF0ZUtleXMiLCJrZXkiLCJpbmNsdWRlcyIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX05FU1RFRF9LRVkiLCJqb2luVGFibGVzRm9yU2NoZW1hIiwibGlzdCIsImZpZWxkIiwicHVzaCIsImJ1aWxkV2hlcmVDbGF1c2UiLCJxdWVyeSIsImNhc2VJbnNlbnNpdGl2ZSIsInBhdHRlcm5zIiwidmFsdWVzIiwic29ydHMiLCJpc0FycmF5RmllbGQiLCJpbml0aWFsUGF0dGVybnNMZW5ndGgiLCJmaWVsZFZhbHVlIiwiJGV4aXN0cyIsImF1dGhEYXRhTWF0Y2giLCJtYXRjaCIsIiRpbiIsIiRyZWdleCIsIk1BWF9JTlRfUExVU19PTkUiLCJjbGF1c2VzIiwiY2xhdXNlVmFsdWVzIiwic3ViUXVlcnkiLCJjbGF1c2UiLCJwYXR0ZXJuIiwib3JPckFuZCIsIm5vdCIsIiRuZSIsImNvbnN0cmFpbnRGaWVsZE5hbWUiLCIkcmVsYXRpdmVUaW1lIiwiSU5WQUxJRF9KU09OIiwicG9pbnQiLCJsb25naXR1ZGUiLCJsYXRpdHVkZSIsIiRlcSIsImlzSW5Pck5pbiIsIkFycmF5IiwiaXNBcnJheSIsIiRuaW4iLCJpblBhdHRlcm5zIiwiYWxsb3dOdWxsIiwibGlzdEVsZW0iLCJsaXN0SW5kZXgiLCJjcmVhdGVDb25zdHJhaW50IiwiYmFzZUFycmF5Iiwibm90SW4iLCJfIiwiZmxhdE1hcCIsImVsdCIsIiRhbGwiLCJpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoIiwiaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSIsImkiLCJwcm9jZXNzUmVnZXhQYXR0ZXJuIiwic3Vic3RyaW5nIiwiJGNvbnRhaW5lZEJ5IiwiYXJyIiwiJHRleHQiLCJzZWFyY2giLCIkc2VhcmNoIiwibGFuZ3VhZ2UiLCIkdGVybSIsIiRsYW5ndWFnZSIsIiRjYXNlU2Vuc2l0aXZlIiwiJGRpYWNyaXRpY1NlbnNpdGl2ZSIsIiRuZWFyU3BoZXJlIiwiZGlzdGFuY2UiLCIkbWF4RGlzdGFuY2UiLCJkaXN0YW5jZUluS00iLCIkd2l0aGluIiwiJGJveCIsImJveCIsImxlZnQiLCJib3R0b20iLCJyaWdodCIsInRvcCIsIiRnZW9XaXRoaW4iLCIkY2VudGVyU3BoZXJlIiwiY2VudGVyU3BoZXJlIiwiR2VvUG9pbnQiLCJHZW9Qb2ludENvZGVyIiwiaXNWYWxpZEpTT04iLCJfdmFsaWRhdGUiLCJpc05hTiIsIiRwb2x5Z29uIiwicG9seWdvbiIsInBvaW50cyIsImNvb3JkaW5hdGVzIiwiJGdlb0ludGVyc2VjdHMiLCIkcG9pbnQiLCJyZWdleCIsIm9wZXJhdG9yIiwib3B0cyIsIiRvcHRpb25zIiwicmVtb3ZlV2hpdGVTcGFjZSIsImNvbnZlcnRQb2x5Z29uVG9TUUwiLCJjbXAiLCJwZ0NvbXBhcmF0b3IiLCJwYXJzZXJSZXN1bHQiLCJyZWxhdGl2ZVRpbWVUb0RhdGUiLCJzdGF0dXMiLCJyZXN1bHQiLCJjb25zb2xlIiwiZXJyb3IiLCJpbmZvIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsIlBvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsInVyaSIsImNvbGxlY3Rpb25QcmVmaXgiLCJkYXRhYmFzZU9wdGlvbnMiLCJfY29sbGVjdGlvblByZWZpeCIsImVuYWJsZVNjaGVtYUhvb2tzIiwiZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uIiwiY2xpZW50IiwicGdwIiwiX2NsaWVudCIsIl9vbmNoYW5nZSIsIl9wZ3AiLCJfdXVpZCIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJ3YXRjaCIsImNhbGxiYWNrIiwiY3JlYXRlRXhwbGFpbmFibGVRdWVyeSIsImFuYWx5emUiLCJoYW5kbGVTaHV0ZG93biIsIl9zdHJlYW0iLCJkb25lIiwiJHBvb2wiLCJlbmQiLCJfbGlzdGVuVG9TY2hlbWEiLCJjb25uZWN0IiwiZGlyZWN0Iiwib24iLCJkYXRhIiwicGF5bG9hZCIsInBhcnNlIiwic2VuZGVySWQiLCJub25lIiwiX25vdGlmeVNjaGVtYUNoYW5nZSIsImNhdGNoIiwiX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMiLCJjb25uIiwiY2xhc3NFeGlzdHMiLCJvbmUiLCJhIiwiZXhpc3RzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInRhc2siLCJ0Iiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJzdWJtaXR0ZWRJbmRleGVzIiwiZXhpc3RpbmdJbmRleGVzIiwic2VsZiIsIlByb21pc2UiLCJyZXNvbHZlIiwiX2lkXyIsIl9pZCIsImRlbGV0ZWRJbmRleGVzIiwiaW5zZXJ0ZWRJbmRleGVzIiwiSU5WQUxJRF9RVUVSWSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInR4IiwiY3JlYXRlSW5kZXhlcyIsImUiLCJjb2x1bW5Eb2VzTm90RXhpc3RFcnJvciIsImVycm9ycyIsImNvZGUiLCJkcm9wSW5kZXhlcyIsImNyZWF0ZUNsYXNzIiwicGFyc2VTY2hlbWEiLCJjcmVhdGVUYWJsZSIsImVyciIsImRldGFpbCIsIkRVUExJQ0FURV9WQUxVRSIsInZhbHVlc0FycmF5IiwicGF0dGVybnNBcnJheSIsImFzc2lnbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfZmFpbGVkX2xvZ2luX2NvdW50IiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJyZWxhdGlvbnMiLCJwYXJzZVR5cGUiLCJxcyIsImJhdGNoIiwiam9pblRhYmxlIiwic2NoZW1hVXBncmFkZSIsImNvbHVtbnMiLCJjb2x1bW5fbmFtZSIsIm5ld0NvbHVtbnMiLCJmaWx0ZXIiLCJpdGVtIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsInBvc3RncmVzVHlwZSIsImFueSIsInBhdGgiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJkZWxldGVDbGFzcyIsIm9wZXJhdGlvbnMiLCJyZXNwb25zZSIsImhlbHBlcnMiLCJ0aGVuIiwiZGVsZXRlQWxsQ2xhc3NlcyIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwicmVzdWx0cyIsImpvaW5zIiwicmVkdWNlIiwiY2xhc3NlcyIsInF1ZXJpZXMiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwiaWR4IiwiZ2V0QWxsQ2xhc3NlcyIsInJvdyIsImdldENsYXNzIiwiY3JlYXRlT2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2x1bW5zQXJyYXkiLCJnZW9Qb2ludHMiLCJhdXRoRGF0YUFscmVhZHlFeGlzdHMiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicG9wIiwiaW5pdGlhbFZhbHVlcyIsInZhbCIsInRlcm1pbmF0aW9uIiwiZ2VvUG9pbnRzSW5qZWN0cyIsImwiLCJjb2x1bW5zUGF0dGVybiIsImNvbCIsInZhbHVlc1BhdHRlcm4iLCJwcm9taXNlIiwib3BzIiwidW5kZXJseWluZ0Vycm9yIiwiY29uc3RyYWludCIsIm1hdGNoZXMiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsIndoZXJlIiwiT0JKRUNUX05PVF9GT1VORCIsImZpbmRPbmVBbmRVcGRhdGUiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwZGF0ZVBhdHRlcm5zIiwib3JpZ2luYWxVcGRhdGUiLCJkb3ROb3RhdGlvbk9wdGlvbnMiLCJnZW5lcmF0ZSIsImpzb25iIiwibGFzdEtleSIsImZpZWxkTmFtZUluZGV4Iiwic3RyIiwiYW1vdW50Iiwib2JqZWN0cyIsImtleXNUb0luY3JlbWVudCIsImsiLCJpbmNyZW1lbnRQYXR0ZXJucyIsImMiLCJrZXlzVG9EZWxldGUiLCJkZWxldGVQYXR0ZXJucyIsInAiLCJ1cGRhdGVPYmplY3QiLCJleHBlY3RlZFR5cGUiLCJyZWplY3QiLCJ3aGVyZUNsYXVzZSIsInVwc2VydE9uZU9iamVjdCIsImNyZWF0ZVZhbHVlIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImV4cGxhaW4iLCJoYXNMaW1pdCIsImhhc1NraXAiLCJ3aGVyZVBhdHRlcm4iLCJsaW1pdFBhdHRlcm4iLCJza2lwUGF0dGVybiIsInNvcnRQYXR0ZXJuIiwic29ydENvcHkiLCJzb3J0aW5nIiwidHJhbnNmb3JtS2V5IiwibWVtbyIsIm9yaWdpbmFsUXVlcnkiLCJwb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QiLCJ0YXJnZXRDbGFzcyIsInkiLCJ4IiwiY29vcmRzIiwicGFyc2VGbG9hdCIsImNyZWF0ZWRBdCIsInRvSVNPU3RyaW5nIiwidXBkYXRlZEF0IiwiZXhwaXJlc0F0IiwiZW5zdXJlVW5pcXVlbmVzcyIsImNvbnN0cmFpbnROYW1lIiwiY29uc3RyYWludFBhdHRlcm5zIiwibWVzc2FnZSIsInJlYWRQcmVmZXJlbmNlIiwiZXN0aW1hdGUiLCJhcHByb3hpbWF0ZV9yb3dfY291bnQiLCJkaXN0aW5jdCIsImNvbHVtbiIsImlzTmVzdGVkIiwiaXNQb2ludGVyRmllbGQiLCJ0cmFuc2Zvcm1lciIsImNoaWxkIiwiYWdncmVnYXRlIiwicGlwZWxpbmUiLCJoaW50IiwiY291bnRGaWVsZCIsImdyb3VwVmFsdWVzIiwiZ3JvdXBQYXR0ZXJuIiwic3RhZ2UiLCIkZ3JvdXAiLCJncm91cEJ5RmllbGRzIiwiYWxpYXMiLCJzb3VyY2UiLCJvcGVyYXRpb24iLCIkc3VtIiwiJG1heCIsIiRtaW4iLCIkYXZnIiwiJHByb2plY3QiLCIkbWF0Y2giLCIkb3IiLCJjb2xsYXBzZSIsImVsZW1lbnQiLCJtYXRjaFBhdHRlcm5zIiwiJGxpbWl0IiwiJHNraXAiLCIkc29ydCIsIm9yZGVyIiwidHJpbSIsIkJvb2xlYW4iLCJwYXJzZUludCIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJwcm9taXNlcyIsIklOVkFMSURfQ0xBU1NfTkFNRSIsImFsbCIsInNxbCIsIm1pc2MiLCJqc29uT2JqZWN0U2V0S2V5cyIsImFycmF5IiwiYWRkIiwiYWRkVW5pcXVlIiwicmVtb3ZlIiwiY29udGFpbnNBbGwiLCJjb250YWluc0FsbFJlZ2V4IiwiY29udGFpbnMiLCJjdHgiLCJkdXJhdGlvbiIsImNyZWF0ZUluZGV4ZXNJZk5lZWRlZCIsImdldEluZGV4ZXMiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsInVwZGF0ZUVzdGltYXRlZENvdW50IiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJlbnN1cmVJbmRleCIsImluZGV4TmFtZSIsIm9wdGlvbnMiLCJkZWZhdWx0SW5kZXhOYW1lIiwiaW5kZXhOYW1lT3B0aW9ucyIsInNldElkZW1wb3RlbmN5RnVuY3Rpb24iLCJlbnN1cmVJZGVtcG90ZW5jeUZ1bmN0aW9uRXhpc3RzIiwiZGVsZXRlSWRlbXBvdGVuY3lGdW5jdGlvbiIsInR0bE9wdGlvbnMiLCJ0dGwiLCJ1bmlxdWUiLCJhciIsImZvdW5kSW5kZXgiLCJwdCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImVuZHNXaXRoIiwicmVwbGFjZSIsInMiLCJzdGFydHNXaXRoIiwibGl0ZXJhbGl6ZVJlZ2V4UGFydCIsImlzU3RhcnRzV2l0aFJlZ2V4IiwiZmlyc3RWYWx1ZXNJc1JlZ2V4Iiwic29tZSIsImNyZWF0ZUxpdGVyYWxSZWdleCIsInJlbWFpbmluZyIsIlJlZ0V4cCIsIm1hdGNoZXIxIiwicmVzdWx0MSIsInByZWZpeCIsIm1hdGNoZXIyIiwicmVzdWx0MiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUNBOztBQUVBOztBQUVBOztBQUVBOztBQUNBOztBQUNBOzs7Ozs7Ozs7O0FBRUEsTUFBTUEsS0FBSyxHQUFHQyxPQUFPLENBQUMsZ0JBQUQsQ0FBckI7O0FBRUEsTUFBTUMsaUNBQWlDLEdBQUcsT0FBMUM7QUFDQSxNQUFNQyw4QkFBOEIsR0FBRyxPQUF2QztBQUNBLE1BQU1DLDRCQUE0QixHQUFHLE9BQXJDO0FBQ0EsTUFBTUMsMEJBQTBCLEdBQUcsT0FBbkM7QUFDQSxNQUFNQyxpQ0FBaUMsR0FBRyxPQUExQzs7QUFDQSxNQUFNQyxNQUFNLEdBQUdOLE9BQU8sQ0FBQyxpQkFBRCxDQUF0Qjs7QUFFQSxNQUFNTyxLQUFLLEdBQUcsVUFBVSxHQUFHQyxJQUFiLEVBQXdCO0FBQ3BDQSxFQUFBQSxJQUFJLEdBQUcsQ0FBQyxTQUFTQyxTQUFTLENBQUMsQ0FBRCxDQUFuQixFQUF3QkMsTUFBeEIsQ0FBK0JGLElBQUksQ0FBQ0csS0FBTCxDQUFXLENBQVgsRUFBY0gsSUFBSSxDQUFDSSxNQUFuQixDQUEvQixDQUFQO0FBQ0EsUUFBTUMsR0FBRyxHQUFHUCxNQUFNLENBQUNRLFNBQVAsRUFBWjtBQUNBRCxFQUFBQSxHQUFHLENBQUNOLEtBQUosQ0FBVVEsS0FBVixDQUFnQkYsR0FBaEIsRUFBcUJMLElBQXJCO0FBQ0QsQ0FKRDs7QUFNQSxNQUFNUSx1QkFBdUIsR0FBR0MsSUFBSSxJQUFJO0FBQ3RDLFVBQVFBLElBQUksQ0FBQ0EsSUFBYjtBQUNFLFNBQUssUUFBTDtBQUNFLGFBQU8sTUFBUDs7QUFDRixTQUFLLE1BQUw7QUFDRSxhQUFPLDBCQUFQOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU8s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T0FBTyxJQUFJQSxPQUFPLENBQUNwZSxNQUFSLEdBQWlCLENBQTVCLElBQWlDb2UsT0FBTyxDQUFDdFosS0FBUixHQUFnQixDQUFDLENBQXRELEVBQXlEO0FBQ3ZELFVBQU1vWixNQUFNLEdBQUdYLENBQUMsQ0FBQ3JZLE1BQUYsQ0FBUyxDQUFULEVBQVlrWixPQUFPLENBQUN0WixLQUFwQixDQUFmO0FBQ0EsVUFBTWdaLFNBQVMsR0FBR00sT0FBTyxDQUFDLENBQUQsQ0FBekI7QUFFQSxXQUFPWCxtQkFBbUIsQ0FBQ1MsTUFBRCxDQUFuQixHQUE4Qkwsa0JBQWtCLENBQUNDLFNBQUQsQ0FBdkQ7QUFDRCxHQW5CcUMsQ0FxQnRDOzs7QUFDQSxTQUFPUCxDQUFDLENBQ0xELE9BREksQ0FDSSxjQURKLEVBQ29CLElBRHBCLEVBRUpBLE9BRkksQ0FFSSxjQUZKLEVBRW9CLElBRnBCLEVBR0pBLE9BSEksQ0FHSSxNQUhKLEVBR1ksRUFIWixFQUlKQSxPQUpJLENBSUksTUFKSixFQUlZLEVBSlosRUFLSkEsT0FMSSxDQUtJLFNBTEosRUFLZ0IsTUFMaEIsRUFNSkEsT0FOSSxDQU1JLFVBTkosRUFNaUIsTUFOakIsQ0FBUDtBQU9EOztBQUVELElBQUk5UyxhQUFhLEdBQUc7QUFDbEJDLEVBQUFBLFdBQVcsQ0FBQzdJLEtBQUQsRUFBUTtBQUNqQixXQUFPLE9BQU9BLEtBQVAsS0FBaUIsUUFBakIsSUFBNkJBLEtBQUssS0FBSyxJQUF2QyxJQUErQ0EsS0FBSyxDQUFDQyxNQUFOLEtBQWlCLFVBQXZFO0FBQ0Q7O0FBSGlCLENBQXBCO2VBTWVxSyxzQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICcuL1Bvc3RncmVzQ2xpZW50Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCBzcWwgZnJvbSAnLi9zcWwnO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi8uLi8uLi9VdGlscycpO1xuXG5jb25zdCBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IgPSAnNDJQMDEnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yID0gJzQyUDA3JztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IgPSAnNDI3MDEnO1xuY29uc3QgUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IgPSAnNDI3MDMnO1xuY29uc3QgUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yID0gJzIzNTA1JztcbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uLy4uLy4uL2xvZ2dlcicpO1xuXG5jb25zdCBkZWJ1ZyA9IGZ1bmN0aW9uICguLi5hcmdzOiBhbnkpIHtcbiAgYXJncyA9IFsnUEc6ICcgKyBhcmd1bWVudHNbMF1dLmNvbmNhdChhcmdzLnNsaWNlKDEsIGFyZ3MubGVuZ3RoKSk7XG4gIGNvbnN0IGxvZyA9IGxvZ2dlci5nZXRMb2dnZXIoKTtcbiAgbG9nLmRlYnVnLmFwcGx5KGxvZywgYXJncyk7XG59O1xuXG5jb25zdCBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSA9IHR5cGUgPT4ge1xuICBzd2l0Y2ggKHR5cGUudHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ3BvaW50JztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgaWYgKHR5cGUuY29udGVudHMgJiYgdHlwZS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJykge1xuICAgICAgICByZXR1cm4gJ3RleHRbXSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ2pzb25iJztcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgYG5vIHR5cGUgZm9yICR7SlNPTi5zdHJpbmdpZnkodHlwZSl9IHlldGA7XG4gIH1cbn07XG5cbmNvbnN0IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciA9IHtcbiAgJGd0OiAnPicsXG4gICRsdDogJzwnLFxuICAkZ3RlOiAnPj0nLFxuICAkbHRlOiAnPD0nLFxufTtcblxuY29uc3QgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzID0ge1xuICAkZGF5T2ZNb250aDogJ0RBWScsXG4gICRkYXlPZldlZWs6ICdET1cnLFxuICAkZGF5T2ZZZWFyOiAnRE9ZJyxcbiAgJGlzb0RheU9mV2VlazogJ0lTT0RPVycsXG4gICRpc29XZWVrWWVhcjogJ0lTT1lFQVInLFxuICAkaG91cjogJ0hPVVInLFxuICAkbWludXRlOiAnTUlOVVRFJyxcbiAgJHNlY29uZDogJ1NFQ09ORCcsXG4gICRtaWxsaXNlY29uZDogJ01JTExJU0VDT05EUycsXG4gICRtb250aDogJ01PTlRIJyxcbiAgJHdlZWs6ICdXRUVLJyxcbiAgJHllYXI6ICdZRUFSJyxcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5pc287XG4gICAgfVxuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlID0gdmFsdWUgPT4ge1xuICBjb25zdCBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlKTtcbiAgbGV0IGNhc3RUeXBlO1xuICBzd2l0Y2ggKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIGNhc3RUeXBlID0gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICBjYXN0VHlwZSA9ICdib29sZWFuJztcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjYXN0VHlwZSA9IHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gY2FzdFR5cGU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuLy8gRHVwbGljYXRlIGZyb20gdGhlbiBtb25nbyBhZGFwdGVyLi4uXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGdldDoge30sXG4gIGNvdW50OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmNvbnN0IHRvUGFyc2VTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cbiAgaWYgKHNjaGVtYS5maWVsZHMpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICB9XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGlmIChzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5zY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH07XG4gIH1cbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKHNjaGVtYS5pbmRleGVzKSB7XG4gICAgaW5kZXhlcyA9IHsgLi4uc2NoZW1hLmluZGV4ZXMgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXMsXG4gIH07XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGhhbmRsZURvdEZpZWxkcyA9IG9iamVjdCA9PiB7XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgb2JqZWN0W2ZpcnN0XSA9IG9iamVjdFtmaXJzdF0gfHwge307XG4gICAgICBsZXQgY3VycmVudE9iaiA9IG9iamVjdFtmaXJzdF07XG4gICAgICBsZXQgbmV4dDtcbiAgICAgIGxldCB2YWx1ZSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHZhbHVlID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgIHdoaWxlICgobmV4dCA9IGNvbXBvbmVudHMuc2hpZnQoKSkpIHtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgICBjdXJyZW50T2JqW25leHRdID0gY3VycmVudE9ialtuZXh0XSB8fCB7fTtcbiAgICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRPYmogPSBjdXJyZW50T2JqW25leHRdO1xuICAgICAgfVxuICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyA9IGZpZWxkTmFtZSA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKS5tYXAoKGNtcHQsIGluZGV4KSA9PiB7XG4gICAgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICByZXR1cm4gYFwiJHtjbXB0fVwiYDtcbiAgICB9XG4gICAgcmV0dXJuIGAnJHtjbXB0fSdgO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgcmV0dXJuIGBcIiR7ZmllbGROYW1lfVwiYDtcbiAgfVxuICBjb25zdCBjb21wb25lbnRzID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKTtcbiAgbGV0IG5hbWUgPSBjb21wb25lbnRzLnNsaWNlKDAsIGNvbXBvbmVudHMubGVuZ3RoIC0gMSkuam9pbignLT4nKTtcbiAgbmFtZSArPSAnLT4+JyArIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIG5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmICh0eXBlb2YgZmllbGROYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBmaWVsZE5hbWU7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfY3JlYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ2NyZWF0ZWRBdCc7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfdXBkYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ3VwZGF0ZWRBdCc7XG4gIH1cbiAgcmV0dXJuIGZpZWxkTmFtZS5zdWJzdHIoMSk7XG59O1xuXG5jb25zdCB2YWxpZGF0ZUtleXMgPSBvYmplY3QgPT4ge1xuICBpZiAodHlwZW9mIG9iamVjdCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB2YWxpZGF0ZUtleXMob2JqZWN0W2tleV0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoa2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFJldHVybnMgdGhlIGxpc3Qgb2Ygam9pbiB0YWJsZXMgb24gYSBzY2hlbWFcbmNvbnN0IGpvaW5UYWJsZXNGb3JTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGlmIChzY2hlbWEpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChgX0pvaW46JHtmaWVsZH06JHtzY2hlbWEuY2xhc3NOYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBsaXN0O1xufTtcblxuaW50ZXJmYWNlIFdoZXJlQ2xhdXNlIHtcbiAgcGF0dGVybjogc3RyaW5nO1xuICB2YWx1ZXM6IEFycmF5PGFueT47XG4gIHNvcnRzOiBBcnJheTxhbnk+O1xufVxuXG5jb25zdCBidWlsZFdoZXJlQ2xhdXNlID0gKHsgc2NoZW1hLCBxdWVyeSwgaW5kZXgsIGNhc2VJbnNlbnNpdGl2ZSB9KTogV2hlcmVDbGF1c2UgPT4ge1xuICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICBsZXQgdmFsdWVzID0gW107XG4gIGNvbnN0IHNvcnRzID0gW107XG5cbiAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpbml0aWFsUGF0dGVybnNMZW5ndGggPSBwYXR0ZXJucy5sZW5ndGg7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IHF1ZXJ5W2ZpZWxkTmFtZV07XG5cbiAgICAvLyBub3RoaW5nIGluIHRoZSBzY2hlbWEsIGl0J3MgZ29ubmEgYmxvdyB1cFxuICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAvLyBhcyBpdCB3b24ndCBleGlzdFxuICAgICAgaWYgKGZpZWxkVmFsdWUgJiYgZmllbGRWYWx1ZS4kZXhpc3RzID09PSBmYWxzZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAvLyBUT0RPOiBIYW5kbGUgcXVlcnlpbmcgYnkgX2F1dGhfZGF0YV9wcm92aWRlciwgYXV0aERhdGEgaXMgc3RvcmVkIGluIGF1dGhEYXRhIGZpZWxkXG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKGNhc2VJbnNlbnNpdGl2ZSAmJiAoZmllbGROYW1lID09PSAndXNlcm5hbWUnIHx8IGZpZWxkTmFtZSA9PT0gJ2VtYWlsJykpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYExPV0VSKCQke2luZGV4fTpuYW1lKSA9IExPV0VSKCQke2luZGV4ICsgMX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgbGV0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKG5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRpbikge1xuICAgICAgICAgIG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpyYXcpOjpqc29uYiBAPiAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGluKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgICAgIC8vIEhhbmRsZSBsYXRlclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgPSAkJHtpbmRleCArIDF9Ojp0ZXh0YCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCBmaWVsZFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIC8vIENhbid0IGNhc3QgYm9vbGVhbiB0byBkb3VibGUgcHJlY2lzaW9uXG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnTnVtYmVyJykge1xuICAgICAgICAvLyBTaG91bGQgYWx3YXlzIHJldHVybiB6ZXJvIHJlc3VsdHNcbiAgICAgICAgY29uc3QgTUFYX0lOVF9QTFVTX09ORSA9IDkyMjMzNzIwMzY4NTQ3NzU4MDg7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgTUFYX0lOVF9QTFVTX09ORSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgfVxuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKFsnJG9yJywgJyRub3InLCAnJGFuZCddLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgIGNvbnN0IGNsYXVzZXMgPSBbXTtcbiAgICAgIGNvbnN0IGNsYXVzZVZhbHVlcyA9IFtdO1xuICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKHN1YlF1ZXJ5ID0+IHtcbiAgICAgICAgY29uc3QgY2xhdXNlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIHF1ZXJ5OiBzdWJRdWVyeSxcbiAgICAgICAgICBpbmRleCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2xhdXNlLnBhdHRlcm4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsYXVzZXMucHVzaChjbGF1c2UucGF0dGVybik7XG4gICAgICAgICAgY2xhdXNlVmFsdWVzLnB1c2goLi4uY2xhdXNlLnZhbHVlcyk7XG4gICAgICAgICAgaW5kZXggKz0gY2xhdXNlLnZhbHVlcy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvck9yQW5kID0gZmllbGROYW1lID09PSAnJGFuZCcgPyAnIEFORCAnIDogJyBPUiAnO1xuICAgICAgY29uc3Qgbm90ID0gZmllbGROYW1lID09PSAnJG5vcicgPyAnIE5PVCAnIDogJyc7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSgke2NsYXVzZXMuam9pbihvck9yQW5kKX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaCguLi5jbGF1c2VWYWx1ZXMpO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuJG5lID0gSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWUuJG5lXSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYE5PVCBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGlmIG5vdCBudWxsLCB3ZSBuZWVkIHRvIG1hbnVhbGx5IGV4Y2x1ZGUgbnVsbFxuICAgICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSkgT1IgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTClgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kbmUpO1xuICAgICAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gY2FzdFR5cGVcbiAgICAgICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPD4gJCR7aW5kZXggKyAxfSBPUiAke2NvbnN0cmFpbnRGaWVsZE5hbWV9IElTIE5VTEwpYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmUgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJG5lLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVE9ETzogc3VwcG9ydCBhcnJheXNcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRlcSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kZXEgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kZXEpO1xuICAgICAgICAgIGNvbnN0IGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSA9ICQke2luZGV4Kyt9YCk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGVxID09PSAnb2JqZWN0JyAmJiBmaWVsZFZhbHVlLiRlcS4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBpc0luT3JOaW4gPSBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSB8fCBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJG5pbik7XG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgJiZcbiAgICAgIGlzQXJyYXlGaWVsZCAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMudHlwZSA9PT0gJ1N0cmluZydcbiAgICApIHtcbiAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgIGxldCBhbGxvd051bGwgPSBmYWxzZTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBmaWVsZFZhbHVlLiRpbi5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgIGlmIChsaXN0RWxlbSA9PT0gbnVsbCkge1xuICAgICAgICAgIGFsbG93TnVsbCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4IC0gKGFsbG93TnVsbCA/IDEgOiAwKX1gKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoYWxsb3dOdWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06bmFtZSBJUyBOVUxMIE9SICQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICB9IGVsc2UgaWYgKGlzSW5Pck5pbikge1xuICAgICAgdmFyIGNyZWF0ZUNvbnN0cmFpbnQgPSAoYmFzZUFycmF5LCBub3RJbikgPT4ge1xuICAgICAgICBjb25zdCBub3QgPSBub3RJbiA/ICcgTk9UICcgOiAnJztcbiAgICAgICAgaWYgKGJhc2VBcnJheS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9IGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShiYXNlQXJyYXkpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEhhbmRsZSBOZXN0ZWQgRG90IE5vdGF0aW9uIEFib3ZlXG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICBiYXNlQXJyYXkuZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICAgICAgICBpZiAobGlzdEVsZW0gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleH1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke25vdH0gSU4gKCR7aW5QYXR0ZXJucy5qb2luKCl9KWApO1xuICAgICAgICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIW5vdEluKSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgICAgaW5kZXggPSBpbmRleCArIDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGFycmF5XG4gICAgICAgICAgaWYgKG5vdEluKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMScpOyAvLyBSZXR1cm4gYWxsIHZhbHVlc1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMicpOyAvLyBSZXR1cm4gbm8gdmFsdWVzXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJGluLCBlbHQgPT4gZWx0KSxcbiAgICAgICAgICBmYWxzZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5pbikge1xuICAgICAgICBjcmVhdGVDb25zdHJhaW50KFxuICAgICAgICAgIF8uZmxhdE1hcChmaWVsZFZhbHVlLiRuaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRpbiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGluIHZhbHVlJyk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkbmluIHZhbHVlJyk7XG4gICAgfVxuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSAmJiBpc0FycmF5RmllbGQpIHtcbiAgICAgIGlmIChpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgaWYgKCFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgZmllbGRWYWx1ZS4kYWxsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRWYWx1ZS4kYWxsLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKGZpZWxkVmFsdWUuJGFsbFtpXS4kcmVnZXgpO1xuICAgICAgICAgIGZpZWxkVmFsdWUuJGFsbFtpXSA9IHZhbHVlLnN1YnN0cmluZygxKSArICclJztcbiAgICAgICAgfVxuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGxfcmVnZXgoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnNfYWxsKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9Ojpqc29uYilgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS4kYWxsKSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kYWxsLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRhbGxbMF0ub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXhpc3RzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJGV4aXN0cy4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRleGlzdHMpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRjb250YWluZWRCeSkge1xuICAgICAgY29uc3QgYXJyID0gZmllbGRWYWx1ZS4kY29udGFpbmVkQnk7XG4gICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkY29udGFpbmVkQnk6IHNob3VsZCBiZSBhbiBhcnJheWApO1xuICAgICAgfVxuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA8QCAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShhcnIpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHRleHQpIHtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IGZpZWxkVmFsdWUuJHRleHQuJHNlYXJjaDtcbiAgICAgIGxldCBsYW5ndWFnZSA9ICdlbmdsaXNoJztcbiAgICAgIGlmICh0eXBlb2Ygc2VhcmNoICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YCk7XG4gICAgICB9XG4gICAgICBpZiAoIXNlYXJjaC4kdGVybSB8fCB0eXBlb2Ygc2VhcmNoLiR0ZXJtICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRsYW5ndWFnZSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGxhbmd1YWdlKSB7XG4gICAgICAgIGxhbmd1YWdlID0gc2VhcmNoLiRsYW5ndWFnZTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSBub3Qgc3VwcG9ydGVkLCBwbGVhc2UgdXNlICRyZWdleCBvciBjcmVhdGUgYSBzZXBhcmF0ZSBsb3dlciBjYXNlIGNvbHVtbi5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSAtIGZhbHNlIG5vdCBzdXBwb3J0ZWQsIGluc3RhbGwgUG9zdGdyZXMgVW5hY2NlbnQgRXh0ZW5zaW9uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYHRvX3RzdmVjdG9yKCQke2luZGV4fSwgJCR7aW5kZXggKyAxfTpuYW1lKSBAQCB0b190c3F1ZXJ5KCQke2luZGV4ICsgMn0sICQke2luZGV4ICsgM30pYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGxhbmd1YWdlLCBmaWVsZE5hbWUsIGxhbmd1YWdlLCBzZWFyY2guJHRlcm0pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kbmVhclNwaGVyZSkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRuZWFyU3BoZXJlO1xuICAgICAgY29uc3QgZGlzdGFuY2UgPSBmaWVsZFZhbHVlLiRtYXhEaXN0YW5jZTtcbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSA8PSAkJHtpbmRleCArIDN9YFxuICAgICAgKTtcbiAgICAgIHNvcnRzLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIEFTQ2BcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR3aXRoaW4gJiYgZmllbGRWYWx1ZS4kd2l0aGluLiRib3gpIHtcbiAgICAgIGNvbnN0IGJveCA9IGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94O1xuICAgICAgY29uc3QgbGVmdCA9IGJveFswXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCBib3R0b20gPSBib3hbMF0ubGF0aXR1ZGU7XG4gICAgICBjb25zdCByaWdodCA9IGJveFsxXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCB0b3AgPSBib3hbMV0ubGF0aXR1ZGU7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpib3hgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgoJHtsZWZ0fSwgJHtib3R0b219KSwgKCR7cmlnaHR9LCAke3RvcH0pKWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlKSB7XG4gICAgICBjb25zdCBjZW50ZXJTcGhlcmUgPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZTtcbiAgICAgIGlmICghKGNlbnRlclNwaGVyZSBpbnN0YW5jZW9mIEFycmF5KSB8fCBjZW50ZXJTcGhlcmUubGVuZ3RoIDwgMikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQgYW5kIGRpc3RhbmNlJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gR2V0IHBvaW50LCBjb252ZXJ0IHRvIGdlbyBwb2ludCBpZiBuZWNlc3NhcnkgYW5kIHZhbGlkYXRlXG4gICAgICBsZXQgcG9pbnQgPSBjZW50ZXJTcGhlcmVbMF07XG4gICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgIH0gZWxzZSBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGdlbyBwb2ludCBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgLy8gR2V0IGRpc3RhbmNlIGFuZCB2YWxpZGF0ZVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSBjZW50ZXJTcGhlcmVbMV07XG4gICAgICBpZiAoaXNOYU4oZGlzdGFuY2UpIHx8IGRpc3RhbmNlIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBkaXN0YW5jZSBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbikge1xuICAgICAgY29uc3QgcG9seWdvbiA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbjtcbiAgICAgIGxldCBwb2ludHM7XG4gICAgICBpZiAodHlwZW9mIHBvbHlnb24gPT09ICdvYmplY3QnICYmIHBvbHlnb24uX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgaWYgKCFwb2x5Z29uLmNvb3JkaW5hdGVzIHx8IHBvbHlnb24uY29vcmRpbmF0ZXMubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgUG9seWdvbi5jb29yZGluYXRlcyBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIGxvbi9sYXQgcGFpcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uLmNvb3JkaW5hdGVzO1xuICAgICAgfSBlbHNlIGlmIChwb2x5Z29uIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBHZW9Qb2ludHMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBcImJhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgYmUgUG9seWdvbiBvYmplY3Qgb3IgQXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQnc1wiXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwb2ludHMgPSBwb2ludHNcbiAgICAgICAgLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICAgIHJldHVybiBgKCR7cG9pbnRbMF19LCAke3BvaW50WzFdfSlgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGdlb1dpdGhpbiB2YWx1ZScpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oJywgJyk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludHN9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMgJiYgZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQpIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQ7XG4gICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9JbnRlcnNlY3QgdmFsdWU7ICRwb2ludCBzaG91bGQgYmUgR2VvUG9pbnQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9seWdvbiBAPiAkJHtpbmRleCArIDF9Ojpwb2ludGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgbGV0IHJlZ2V4ID0gZmllbGRWYWx1ZS4kcmVnZXg7XG4gICAgICBsZXQgb3BlcmF0b3IgPSAnfic7XG4gICAgICBjb25zdCBvcHRzID0gZmllbGRWYWx1ZS4kb3B0aW9ucztcbiAgICAgIGlmIChvcHRzKSB7XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ2knKSA+PSAwKSB7XG4gICAgICAgICAgb3BlcmF0b3IgPSAnfionO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ3gnKSA+PSAwKSB7XG4gICAgICAgICAgcmVnZXggPSByZW1vdmVXaGl0ZVNwYWNlKHJlZ2V4KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBuYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgIHJlZ2V4ID0gcHJvY2Vzc1JlZ2V4UGF0dGVybihyZWdleCk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgJHtvcGVyYXRvcn0gJyQke2luZGV4ICsgMX06cmF3J2ApO1xuICAgICAgdmFsdWVzLnB1c2gobmFtZSwgcmVnZXgpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZV0pKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5pc28pO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGluZGV4ICs9IDM7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgIGlmIChmaWVsZFZhbHVlW2NtcF0gfHwgZmllbGRWYWx1ZVtjbXBdID09PSAwKSB7XG4gICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICBsZXQgY29uc3RyYWludEZpZWxkTmFtZTtcbiAgICAgICAgbGV0IHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZVtjbXBdKTtcblxuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlW2NtcF0pO1xuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHBvc3RncmVzVmFsdWUgPT09ICdvYmplY3QnICYmIHBvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlICE9PSAnRGF0ZScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggRGF0ZSBmaWVsZCdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHBhcnNlclJlc3VsdCA9IFV0aWxzLnJlbGF0aXZlVGltZVRvRGF0ZShwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWUpO1xuICAgICAgICAgICAgaWYgKHBhcnNlclJlc3VsdC5zdGF0dXMgPT09ICdzdWNjZXNzJykge1xuICAgICAgICAgICAgICBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHBhcnNlclJlc3VsdC5yZXN1bHQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igd2hpbGUgcGFyc2luZyByZWxhdGl2ZSBkYXRlJywgcGFyc2VyUmVzdWx0KTtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICBgYmFkICRyZWxhdGl2ZVRpbWUgKCR7cG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lfSkgdmFsdWUuICR7cGFyc2VyUmVzdWx0LmluZm99YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gYCQke2luZGV4Kyt9Om5hbWVgO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWVzLnB1c2gocG9zdGdyZXNWYWx1ZSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCR7Y29uc3RyYWludEZpZWxkTmFtZX0gJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4Kyt9YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID09PSBwYXR0ZXJucy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB0aGlzIHF1ZXJ5IHR5cGUgeWV0ICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgdmFsdWVzID0gdmFsdWVzLm1hcCh0cmFuc2Zvcm1WYWx1ZSk7XG4gIHJldHVybiB7IHBhdHRlcm46IHBhdHRlcm5zLmpvaW4oJyBBTkQgJyksIHZhbHVlcywgc29ydHMgfTtcbn07XG5cbmV4cG9ydCBjbGFzcyBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICBjYW5Tb3J0T25Kb2luVGFibGVzOiBib29sZWFuO1xuICBlbmFibGVTY2hlbWFIb29rczogYm9vbGVhbjtcblxuICAvLyBQcml2YXRlXG4gIF9jb2xsZWN0aW9uUHJlZml4OiBzdHJpbmc7XG4gIF9jbGllbnQ6IGFueTtcbiAgX29uY2hhbmdlOiBhbnk7XG4gIF9wZ3A6IGFueTtcbiAgX3N0cmVhbTogYW55O1xuICBfdXVpZDogYW55O1xuICBkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb246IGJvb2xlYW47XG5cbiAgY29uc3RydWN0b3IoeyB1cmksIGNvbGxlY3Rpb25QcmVmaXggPSAnJywgZGF0YWJhc2VPcHRpb25zID0ge30gfTogYW55KSB7XG4gICAgdGhpcy5fY29sbGVjdGlvblByZWZpeCA9IGNvbGxlY3Rpb25QcmVmaXg7XG4gICAgdGhpcy5lbmFibGVTY2hlbWFIb29rcyA9ICEhZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzO1xuICAgIHRoaXMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uID0gISFkYXRhYmFzZU9wdGlvbnMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uO1xuICAgIGRlbGV0ZSBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgZGVsZXRlIGRhdGFiYXNlT3B0aW9ucy5kaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb247XG5cbiAgICBjb25zdCB7IGNsaWVudCwgcGdwIH0gPSBjcmVhdGVDbGllbnQodXJpLCBkYXRhYmFzZU9wdGlvbnMpO1xuICAgIHRoaXMuX2NsaWVudCA9IGNsaWVudDtcbiAgICB0aGlzLl9vbmNoYW5nZSA9ICgpID0+IHt9O1xuICAgIHRoaXMuX3BncCA9IHBncDtcbiAgICB0aGlzLl91dWlkID0gdXVpZHY0KCk7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gZmFsc2U7XG4gIH1cblxuICB3YXRjaChjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIHRoaXMuX29uY2hhbmdlID0gY2FsbGJhY2s7XG4gIH1cblxuICAvL05vdGUgdGhhdCBhbmFseXplPXRydWUgd2lsbCBydW4gdGhlIHF1ZXJ5LCBleGVjdXRpbmcgSU5TRVJUUywgREVMRVRFUywgZXRjLlxuICBjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KHF1ZXJ5OiBzdHJpbmcsIGFuYWx5emU6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIGlmIChhbmFseXplKSB7XG4gICAgICByZXR1cm4gJ0VYUExBSU4gKEFOQUxZWkUsIEZPUk1BVCBKU09OKSAnICsgcXVlcnk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAodGhpcy5fc3RyZWFtKSB7XG4gICAgICB0aGlzLl9zdHJlYW0uZG9uZSgpO1xuICAgICAgZGVsZXRlIHRoaXMuX3N0cmVhbTtcbiAgICB9XG4gICAgaWYgKCF0aGlzLl9jbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5fY2xpZW50LiRwb29sLmVuZCgpO1xuICB9XG5cbiAgYXN5bmMgX2xpc3RlblRvU2NoZW1hKCkge1xuICAgIGlmICghdGhpcy5fc3RyZWFtICYmIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MpIHtcbiAgICAgIHRoaXMuX3N0cmVhbSA9IGF3YWl0IHRoaXMuX2NsaWVudC5jb25uZWN0KHsgZGlyZWN0OiB0cnVlIH0pO1xuICAgICAgdGhpcy5fc3RyZWFtLmNsaWVudC5vbignbm90aWZpY2F0aW9uJywgZGF0YSA9PiB7XG4gICAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKGRhdGEucGF5bG9hZCk7XG4gICAgICAgIGlmIChwYXlsb2FkLnNlbmRlcklkICE9PSB0aGlzLl91dWlkKSB7XG4gICAgICAgICAgdGhpcy5fb25jaGFuZ2UoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBhd2FpdCB0aGlzLl9zdHJlYW0ubm9uZSgnTElTVEVOICQxficsICdzY2hlbWEuY2hhbmdlJyk7XG4gICAgfVxuICB9XG5cbiAgX25vdGlmeVNjaGVtYUNoYW5nZSgpIHtcbiAgICBpZiAodGhpcy5fc3RyZWFtKSB7XG4gICAgICB0aGlzLl9zdHJlYW1cbiAgICAgICAgLm5vbmUoJ05PVElGWSAkMX4sICQyJywgWydzY2hlbWEuY2hhbmdlJywgeyBzZW5kZXJJZDogdGhpcy5fdXVpZCB9XSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIE5vdGlmeTonLCBlcnJvcik7IC8vIHVubGlrZWx5IHRvIGV2ZXIgaGFwcGVuXG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIF9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBhd2FpdCBjb25uXG4gICAgICAubm9uZShcbiAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIFwiX1NDSEVNQVwiICggXCJjbGFzc05hbWVcIiB2YXJDaGFyKDEyMCksIFwic2NoZW1hXCIganNvbmIsIFwiaXNQYXJzZUNsYXNzXCIgYm9vbCwgUFJJTUFSWSBLRVkgKFwiY2xhc3NOYW1lXCIpICknXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5vbmUoXG4gICAgICAnU0VMRUNUIEVYSVNUUyAoU0VMRUNUIDEgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzIFdIRVJFIHRhYmxlX25hbWUgPSAkMSknLFxuICAgICAgW25hbWVdLFxuICAgICAgYSA9PiBhLmV4aXN0c1xuICAgICk7XG4gIH1cblxuICBhc3luYyBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSkge1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50YXNrKCdzZXQtY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsICdzY2hlbWEnLCAnY2xhc3NMZXZlbFBlcm1pc3Npb25zJywgSlNPTi5zdHJpbmdpZnkoQ0xQcyldO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICBgVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXNcbiAgICAgICk7XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyBzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRJbmRleGVzOiBhbnksXG4gICAgZXhpc3RpbmdJbmRleGVzOiBhbnkgPSB7fSxcbiAgICBmaWVsZHM6IGFueSxcbiAgICBjb25uOiA/YW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoc3VibWl0dGVkSW5kZXhlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0luZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZXhpc3RpbmdJbmRleGVzID0geyBfaWRfOiB7IF9pZDogMSB9IH07XG4gICAgfVxuICAgIGNvbnN0IGRlbGV0ZWRJbmRleGVzID0gW107XG4gICAgY29uc3QgaW5zZXJ0ZWRJbmRleGVzID0gW107XG4gICAgT2JqZWN0LmtleXMoc3VibWl0dGVkSW5kZXhlcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGBJbmRleCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBkZWxldGVkSW5kZXhlcy5wdXNoKG5hbWUpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAhdGhpcy5kaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24gJiZcbiAgICAgICAgICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGRzLCBrZXkpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICAgIGBGaWVsZCAke2tleX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBhZGQgaW5kZXguYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBleGlzdGluZ0luZGV4ZXNbbmFtZV0gPSBmaWVsZDtcbiAgICAgICAgaW5zZXJ0ZWRJbmRleGVzLnB1c2goe1xuICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgYXdhaXQgY29ubi50eCgnc2V0LWluZGV4ZXMtd2l0aC1zY2hlbWEtZm9ybWF0JywgYXN5bmMgdCA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAoaW5zZXJ0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBhd2FpdCBzZWxmLmNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lLCBpbnNlcnRlZEluZGV4ZXMsIHQpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbkRvZXNOb3RFeGlzdEVycm9yID0gZS5lcnJvcnM/LlswXT8uY29kZSA9PT0gJzQyNzAzJztcbiAgICAgICAgaWYgKGNvbHVtbkRvZXNOb3RFeGlzdEVycm9yICYmICF0aGlzLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbikge1xuICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChkZWxldGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGF3YWl0IHNlbGYuZHJvcEluZGV4ZXMoY2xhc3NOYW1lLCBkZWxldGVkSW5kZXhlcywgdCk7XG4gICAgICB9XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMScsXG4gICAgICAgIFtjbGFzc05hbWUsICdzY2hlbWEnLCAnaW5kZXhlcycsIEpTT04uc3RyaW5naWZ5KGV4aXN0aW5nSW5kZXhlcyldXG4gICAgICApO1xuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogP2FueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBwYXJzZVNjaGVtYSA9IGF3YWl0IGNvbm5cbiAgICAgIC50eCgnY3JlYXRlLWNsYXNzJywgYXN5bmMgdCA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMuY3JlYXRlVGFibGUoY2xhc3NOYW1lLCBzY2hlbWEsIHQpO1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ0lOU0VSVCBJTlRPIFwiX1NDSEVNQVwiIChcImNsYXNzTmFtZVwiLCBcInNjaGVtYVwiLCBcImlzUGFyc2VDbGFzc1wiKSBWQUxVRVMgKCQ8Y2xhc3NOYW1lPiwgJDxzY2hlbWE+LCB0cnVlKScsXG4gICAgICAgICAgeyBjbGFzc05hbWUsIHNjaGVtYSB9XG4gICAgICAgICk7XG4gICAgICAgIGF3YWl0IHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoY2xhc3NOYW1lLCBzY2hlbWEuaW5kZXhlcywge30sIHNjaGVtYS5maWVsZHMsIHQpO1xuICAgICAgICByZXR1cm4gdG9QYXJzZVNjaGVtYShzY2hlbWEpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJiBlcnIuZGV0YWlsLmluY2x1ZGVzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLCBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycjtcbiAgICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICAgIHJldHVybiBwYXJzZVNjaGVtYTtcbiAgfVxuXG4gIC8vIEp1c3QgY3JlYXRlIGEgdGFibGUsIGRvIG5vdCBpbnNlcnQgaW4gc2NoZW1hXG4gIGFzeW5jIGNyZWF0ZVRhYmxlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBkZWJ1ZygnY3JlYXRlVGFibGUnKTtcbiAgICBjb25zdCB2YWx1ZXNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHBhdHRlcm5zQXJyYXkgPSBbXTtcbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3QuYXNzaWduKHt9LCBzY2hlbWEuZmllbGRzKTtcbiAgICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgZmllbGRzLl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2ZhaWxlZF9sb2dpbl9jb3VudCA9IHsgdHlwZTogJ051bWJlcicgfTtcbiAgICAgIGZpZWxkcy5fcGVyaXNoYWJsZV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2hpc3RvcnkgPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgICB9XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBjb25zdCByZWxhdGlvbnMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhmaWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGNvbnN0IHBhcnNlVHlwZSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgLy8gU2tpcCB3aGVuIGl0J3MgYSByZWxhdGlvblxuICAgICAgLy8gV2UnbGwgY3JlYXRlIHRoZSB0YWJsZXMgbGF0ZXJcbiAgICAgIGlmIChwYXJzZVR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZWxhdGlvbnMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgcGFyc2VUeXBlLmNvbnRlbnRzID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgfVxuICAgICAgdmFsdWVzQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaChwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZShwYXJzZVR5cGUpKTtcbiAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgJCR7aW5kZXh9Om5hbWUgJCR7aW5kZXggKyAxfTpyYXdgKTtcbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgcGF0dGVybnNBcnJheS5wdXNoKGBQUklNQVJZIEtFWSAoJCR7aW5kZXh9Om5hbWUpYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMjtcbiAgICB9KTtcbiAgICBjb25zdCBxcyA9IGBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkMTpuYW1lICgke3BhdHRlcm5zQXJyYXkuam9pbigpfSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLnZhbHVlc0FycmF5XTtcblxuICAgIHJldHVybiBjb25uLnRhc2soJ2NyZWF0ZS10YWJsZScsIGFzeW5jIHQgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdC5ub25lKHFzLCB2YWx1ZXMpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIEVMU0U6IFRhYmxlIGFscmVhZHkgZXhpc3RzLCBtdXN0IGhhdmUgYmVlbiBjcmVhdGVkIGJ5IGEgZGlmZmVyZW50IHJlcXVlc3QuIElnbm9yZSB0aGUgZXJyb3IuXG4gICAgICB9XG4gICAgICBhd2FpdCB0LnR4KCdjcmVhdGUtdGFibGUtdHgnLCB0eCA9PiB7XG4gICAgICAgIHJldHVybiB0eC5iYXRjaChcbiAgICAgICAgICByZWxhdGlvbnMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gdHgubm9uZShcbiAgICAgICAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQ8am9pblRhYmxlOm5hbWU+IChcInJlbGF0ZWRJZFwiIHZhckNoYXIoMTIwKSwgXCJvd25pbmdJZFwiIHZhckNoYXIoMTIwKSwgUFJJTUFSWSBLRVkoXCJyZWxhdGVkSWRcIiwgXCJvd25pbmdJZFwiKSApJyxcbiAgICAgICAgICAgICAgeyBqb2luVGFibGU6IGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNjaGVtYVVwZ3JhZGUoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogYW55KSB7XG4gICAgZGVidWcoJ3NjaGVtYVVwZ3JhZGUnKTtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBhd2FpdCBjb25uLnRhc2soJ3NjaGVtYS11cGdyYWRlJywgYXN5bmMgdCA9PiB7XG4gICAgICBjb25zdCBjb2x1bW5zID0gYXdhaXQgdC5tYXAoXG4gICAgICAgICdTRUxFQ1QgY29sdW1uX25hbWUgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucyBXSEVSRSB0YWJsZV9uYW1lID0gJDxjbGFzc05hbWU+JyxcbiAgICAgICAgeyBjbGFzc05hbWUgfSxcbiAgICAgICAgYSA9PiBhLmNvbHVtbl9uYW1lXG4gICAgICApO1xuICAgICAgY29uc3QgbmV3Q29sdW1ucyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiBjb2x1bW5zLmluZGV4T2YoaXRlbSkgPT09IC0xKVxuICAgICAgICAubWFwKGZpZWxkTmFtZSA9PiBzZWxmLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkpO1xuXG4gICAgICBhd2FpdCB0LmJhdGNoKG5ld0NvbHVtbnMpO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIC8vIFRPRE86IE11c3QgYmUgcmV2aXNlZCBmb3IgaW52YWxpZCBsb2dpYy4uLlxuICAgIGRlYnVnKCdhZGRGaWVsZElmTm90RXhpc3RzJyk7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCdhZGQtZmllbGQtaWYtbm90LWV4aXN0cycsIGFzeW5jIHQgPT4ge1xuICAgICAgaWYgKHR5cGUudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAgICdBTFRFUiBUQUJMRSAkPGNsYXNzTmFtZTpuYW1lPiBBREQgQ09MVU1OIElGIE5PVCBFWElTVFMgJDxmaWVsZE5hbWU6bmFtZT4gJDxwb3N0Z3Jlc1R5cGU6cmF3PicsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgICBwb3N0Z3Jlc1R5cGU6IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHR5cGUpLFxuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgcmV0dXJuIHNlbGYuY3JlYXRlQ2xhc3MoY2xhc3NOYW1lLCB7IGZpZWxkczogeyBbZmllbGROYW1lXTogdHlwZSB9IH0sIHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIENvbHVtbiBhbHJlYWR5IGV4aXN0cywgY3JlYXRlZCBieSBvdGhlciByZXF1ZXN0LiBDYXJyeSBvbiB0byBzZWUgaWYgaXQncyB0aGUgcmlnaHQgdHlwZS5cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgeyBqb2luVGFibGU6IGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCB9XG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHQuYW55KFxuICAgICAgICAnU0VMRUNUIFwic2NoZW1hXCIgRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+IGFuZCAoXCJzY2hlbWFcIjo6anNvbi0+XFwnZmllbGRzXFwnLT4kPGZpZWxkTmFtZT4pIGlzIG5vdCBudWxsJyxcbiAgICAgICAgeyBjbGFzc05hbWUsIGZpZWxkTmFtZSB9XG4gICAgICApO1xuXG4gICAgICBpZiAocmVzdWx0WzBdKSB7XG4gICAgICAgIHRocm93ICdBdHRlbXB0ZWQgdG8gYWRkIGEgZmllbGQgdGhhdCBhbHJlYWR5IGV4aXN0cyc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBwYXRoID0gYHtmaWVsZHMsJHtmaWVsZE5hbWV9fWA7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICAgIHsgcGF0aCwgdHlwZSwgY2xhc3NOYW1lIH1cbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgndXBkYXRlLXNjaGVtYS1maWVsZC1vcHRpb25zJywgYXN5bmMgdCA9PiB7XG4gICAgICBjb25zdCBwYXRoID0gYHtmaWVsZHMsJHtmaWVsZE5hbWV9fWA7XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCI9anNvbmJfc2V0KFwic2NoZW1hXCIsICQ8cGF0aD4sICQ8dHlwZT4pICBXSEVSRSBcImNsYXNzTmFtZVwiPSQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgcGF0aCwgdHlwZSwgY2xhc3NOYW1lIH1cbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBEcm9wcyBhIGNvbGxlY3Rpb24uIFJlc29sdmVzIHdpdGggdHJ1ZSBpZiBpdCB3YXMgYSBQYXJzZSBTY2hlbWEgKGVnLiBfVXNlciwgQ3VzdG9tLCBldGMuKVxuICAvLyBhbmQgcmVzb2x2ZXMgd2l0aCBmYWxzZSBpZiBpdCB3YXNuJ3QgKGVnLiBhIGpvaW4gdGFibGUpLiBSZWplY3RzIGlmIGRlbGV0aW9uIHdhcyBpbXBvc3NpYmxlLlxuICBhc3luYyBkZWxldGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IG9wZXJhdGlvbnMgPSBbXG4gICAgICB7IHF1ZXJ5OiBgRFJPUCBUQUJMRSBJRiBFWElTVFMgJDE6bmFtZWAsIHZhbHVlczogW2NsYXNzTmFtZV0gfSxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBERUxFVEUgRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXM6IFtjbGFzc05hbWVdLFxuICAgICAgfSxcbiAgICBdO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fY2xpZW50XG4gICAgICAudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KG9wZXJhdGlvbnMpKSlcbiAgICAgIC50aGVuKCgpID0+IGNsYXNzTmFtZS5pbmRleE9mKCdfSm9pbjonKSAhPSAwKTsgLy8gcmVzb2x2ZXMgd2l0aCBmYWxzZSB3aGVuIF9Kb2luIHRhYmxlXG5cbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cblxuICAvLyBEZWxldGUgYWxsIGRhdGEga25vd24gdG8gdGhpcyBhZGFwdGVyLiBVc2VkIGZvciB0ZXN0aW5nLlxuICBhc3luYyBkZWxldGVBbGxDbGFzc2VzKCkge1xuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgIGNvbnN0IGhlbHBlcnMgPSB0aGlzLl9wZ3AuaGVscGVycztcbiAgICBkZWJ1ZygnZGVsZXRlQWxsQ2xhc3NlcycpO1xuXG4gICAgYXdhaXQgdGhpcy5fY2xpZW50XG4gICAgICAudGFzaygnZGVsZXRlLWFsbC1jbGFzc2VzJywgYXN5bmMgdCA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHQuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJyk7XG4gICAgICAgICAgY29uc3Qgam9pbnMgPSByZXN1bHRzLnJlZHVjZSgobGlzdDogQXJyYXk8c3RyaW5nPiwgc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBsaXN0LmNvbmNhdChqb2luVGFibGVzRm9yU2NoZW1hKHNjaGVtYS5zY2hlbWEpKTtcbiAgICAgICAgICB9LCBbXSk7XG4gICAgICAgICAgY29uc3QgY2xhc3NlcyA9IFtcbiAgICAgICAgICAgICdfU0NIRU1BJyxcbiAgICAgICAgICAgICdfUHVzaFN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlNjaGVkdWxlJyxcbiAgICAgICAgICAgICdfSG9va3MnLFxuICAgICAgICAgICAgJ19HbG9iYWxDb25maWcnLFxuICAgICAgICAgICAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgICAgICAgICAgICdfQXVkaWVuY2UnLFxuICAgICAgICAgICAgJ19JZGVtcG90ZW5jeScsXG4gICAgICAgICAgICAuLi5yZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LmNsYXNzTmFtZSksXG4gICAgICAgICAgICAuLi5qb2lucyxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0IHF1ZXJpZXMgPSBjbGFzc2VzLm1hcChjbGFzc05hbWUgPT4gKHtcbiAgICAgICAgICAgIHF1ZXJ5OiAnRFJPUCBUQUJMRSBJRiBFWElTVFMgJDxjbGFzc05hbWU6bmFtZT4nLFxuICAgICAgICAgICAgdmFsdWVzOiB7IGNsYXNzTmFtZSB9LFxuICAgICAgICAgIH0pKTtcbiAgICAgICAgICBhd2FpdCB0LnR4KHR4ID0+IHR4Lm5vbmUoaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gTm8gX1NDSEVNQSBjb2xsZWN0aW9uLiBEb24ndCBkZWxldGUgYW55dGhpbmcuXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGRlYnVnKGBkZWxldGVBbGxDbGFzc2VzIGRvbmUgaW4gJHtuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIG5vd31gKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBjb2x1bW4gYW5kIGFsbCB0aGUgZGF0YS4gRm9yIFJlbGF0aW9ucywgdGhlIF9Kb2luIGNvbGxlY3Rpb24gaXMgaGFuZGxlZFxuICAvLyBzcGVjaWFsbHksIHRoaXMgZnVuY3Rpb24gZG9lcyBub3QgZGVsZXRlIF9Kb2luIGNvbHVtbnMuIEl0IHNob3VsZCwgaG93ZXZlciwgaW5kaWNhdGVcbiAgLy8gdGhhdCB0aGUgcmVsYXRpb24gZmllbGRzIGRvZXMgbm90IGV4aXN0IGFueW1vcmUuIEluIG1vbmdvLCB0aGlzIG1lYW5zIHJlbW92aW5nIGl0IGZyb21cbiAgLy8gdGhlIF9TQ0hFTUEgY29sbGVjdGlvbi4gIFRoZXJlIHNob3VsZCBiZSBubyBhY3R1YWwgZGF0YSBpbiB0aGUgY29sbGVjdGlvbiB1bmRlciB0aGUgc2FtZSBuYW1lXG4gIC8vIGFzIHRoZSByZWxhdGlvbiBjb2x1bW4sIHNvIGl0J3MgZmluZSB0byBhdHRlbXB0IHRvIGRlbGV0ZSBpdC4gSWYgdGhlIGZpZWxkcyBsaXN0ZWQgdG8gYmVcbiAgLy8gZGVsZXRlZCBkbyBub3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gc2hvdWxkIHJldHVybiBzdWNjZXNzZnVsbHkgYW55d2F5cy4gQ2hlY2tpbmcgZm9yXG4gIC8vIGF0dGVtcHRzIHRvIGRlbGV0ZSBub24tZXhpc3RlbnQgZmllbGRzIGlzIHRoZSByZXNwb25zaWJpbGl0eSBvZiBQYXJzZSBTZXJ2ZXIuXG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBub3Qgb2JsaWdhdGVkIHRvIGRlbGV0ZSBmaWVsZHMgYXRvbWljYWxseS4gSXQgaXMgZ2l2ZW4gdGhlIGZpZWxkXG4gIC8vIG5hbWVzIGluIGEgbGlzdCBzbyB0aGF0IGRhdGFiYXNlcyB0aGF0IGFyZSBjYXBhYmxlIG9mIGRlbGV0aW5nIGZpZWxkcyBhdG9taWNhbGx5XG4gIC8vIG1heSBkbyBzby5cblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZS5cbiAgYXN5bmMgZGVsZXRlRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZGVidWcoJ2RlbGV0ZUZpZWxkcycpO1xuICAgIGZpZWxkTmFtZXMgPSBmaWVsZE5hbWVzLnJlZHVjZSgobGlzdDogQXJyYXk8c3RyaW5nPiwgZmllbGROYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgaWYgKGZpZWxkLnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgbGlzdC5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICB9XG4gICAgICBkZWxldGUgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuIGxpc3Q7XG4gICAgfSwgW10pO1xuXG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uZmllbGROYW1lc107XG4gICAgY29uc3QgY29sdW1ucyA9IGZpZWxkTmFtZXNcbiAgICAgIC5tYXAoKG5hbWUsIGlkeCkgPT4ge1xuICAgICAgICByZXR1cm4gYCQke2lkeCArIDJ9Om5hbWVgO1xuICAgICAgfSlcbiAgICAgIC5qb2luKCcsIERST1AgQ09MVU1OJyk7XG5cbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ2RlbGV0ZS1maWVsZHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGF3YWl0IHQubm9uZSgnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiID0gJDxzY2hlbWE+IFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIHNjaGVtYSxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgfSk7XG4gICAgICBpZiAodmFsdWVzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgYXdhaXQgdC5ub25lKGBBTFRFUiBUQUJMRSAkMTpuYW1lIERST1AgQ09MVU1OIElGIEVYSVNUUyAke2NvbHVtbnN9YCwgdmFsdWVzKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIGFsbCBzY2hlbWFzIGtub3duIHRvIHRoaXMgYWRhcHRlciwgaW4gUGFyc2UgZm9ybWF0LiBJbiBjYXNlIHRoZVxuICAvLyBzY2hlbWFzIGNhbm5vdCBiZSByZXRyaWV2ZWQsIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVqZWN0cy4gUmVxdWlyZW1lbnRzIGZvciB0aGVcbiAgLy8gcmVqZWN0aW9uIHJlYXNvbiBhcmUgVEJELlxuICBhc3luYyBnZXRBbGxDbGFzc2VzKCkge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQudGFzaygnZ2V0LWFsbC1jbGFzc2VzJywgYXN5bmMgdCA9PiB7XG4gICAgICByZXR1cm4gYXdhaXQgdC5tYXAoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInLCBudWxsLCByb3cgPT5cbiAgICAgICAgdG9QYXJzZVNjaGVtYSh7IGNsYXNzTmFtZTogcm93LmNsYXNzTmFtZSwgLi4ucm93LnNjaGVtYSB9KVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIHRoZSBzY2hlbWEgd2l0aCB0aGUgZ2l2ZW4gbmFtZSwgaW4gUGFyc2UgZm9ybWF0LiBJZlxuICAvLyB0aGlzIGFkYXB0ZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSBzY2hlbWEsIHJldHVybiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpdGhcbiAgLy8gdW5kZWZpbmVkIGFzIHRoZSByZWFzb24uXG4gIGFzeW5jIGdldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgZGVidWcoJ2dldENsYXNzJyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueSgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+Jywge1xuICAgICAgICBjbGFzc05hbWUsXG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdC5sZW5ndGggIT09IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFswXS5zY2hlbWE7XG4gICAgICB9KVxuICAgICAgLnRoZW4odG9QYXJzZVNjaGVtYSk7XG4gIH1cblxuICAvLyBUT0RPOiByZW1vdmUgdGhlIG1vbmdvIGZvcm1hdCBkZXBlbmRlbmN5IGluIHRoZSByZXR1cm4gdmFsdWVcbiAgYXN5bmMgY3JlYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnY3JlYXRlT2JqZWN0Jyk7XG4gICAgbGV0IGNvbHVtbnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGdlb1BvaW50cyA9IHt9O1xuXG4gICAgb2JqZWN0ID0gaGFuZGxlRG90RmllbGRzKG9iamVjdCk7XG5cbiAgICB2YWxpZGF0ZUtleXMob2JqZWN0KTtcblxuICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHZhciBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBjb25zdCBhdXRoRGF0YUFscmVhZHlFeGlzdHMgPSAhIW9iamVjdC5hdXRoRGF0YTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXSA9IG9iamVjdFsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGZpZWxkTmFtZSA9ICdhdXRoRGF0YSc7XG4gICAgICAgIC8vIEF2b2lkIGFkZGluZyBhdXRoRGF0YSBtdWx0aXBsZSB0aW1lcyB0byB0aGUgcXVlcnlcbiAgICAgICAgaWYgKGF1dGhEYXRhQWxyZWFkeUV4aXN0cykge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb2x1bW5zQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19mYWlsZWRfbG9naW5fY291bnQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2hpc3RvcnknXG4gICAgICAgICkge1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcpIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzd2l0Y2ggKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlKSB7XG4gICAgICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5vYmplY3RJZCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KG9iamVjdFtmaWVsZE5hbWVdKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdPYmplY3QnOlxuICAgICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICAgIGNhc2UgJ051bWJlcic6XG4gICAgICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdGaWxlJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm5hbWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2x5Z29uJzoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChvYmplY3RbZmllbGROYW1lXS5jb29yZGluYXRlcyk7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICAgIC8vIHBvcCB0aGUgcG9pbnQgYW5kIHByb2Nlc3MgbGF0ZXJcbiAgICAgICAgICBnZW9Qb2ludHNbZmllbGROYW1lXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICAgIGNvbHVtbnNBcnJheS5wb3AoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBgVHlwZSAke3NjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlfSBub3Qgc3VwcG9ydGVkIHlldGA7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb2x1bW5zQXJyYXkgPSBjb2x1bW5zQXJyYXkuY29uY2F0KE9iamVjdC5rZXlzKGdlb1BvaW50cykpO1xuICAgIGNvbnN0IGluaXRpYWxWYWx1ZXMgPSB2YWx1ZXNBcnJheS5tYXAoKHZhbCwgaW5kZXgpID0+IHtcbiAgICAgIGxldCB0ZXJtaW5hdGlvbiA9ICcnO1xuICAgICAgY29uc3QgZmllbGROYW1lID0gY29sdW1uc0FycmF5W2luZGV4XTtcbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6OnRleHRbXSc7XG4gICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6Ompzb25iJztcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJCR7aW5kZXggKyAyICsgY29sdW1uc0FycmF5Lmxlbmd0aH0ke3Rlcm1pbmF0aW9ufWA7XG4gICAgfSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzSW5qZWN0cyA9IE9iamVjdC5rZXlzKGdlb1BvaW50cykubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGdlb1BvaW50c1trZXldO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZS5sb25naXR1ZGUsIHZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGNvbnN0IGwgPSB2YWx1ZXNBcnJheS5sZW5ndGggKyBjb2x1bW5zQXJyYXkubGVuZ3RoO1xuICAgICAgcmV0dXJuIGBQT0lOVCgkJHtsfSwgJCR7bCArIDF9KWA7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2x1bW5zUGF0dGVybiA9IGNvbHVtbnNBcnJheS5tYXAoKGNvbCwgaW5kZXgpID0+IGAkJHtpbmRleCArIDJ9Om5hbWVgKS5qb2luKCk7XG4gICAgY29uc3QgdmFsdWVzUGF0dGVybiA9IGluaXRpYWxWYWx1ZXMuY29uY2F0KGdlb1BvaW50c0luamVjdHMpLmpvaW4oKTtcblxuICAgIGNvbnN0IHFzID0gYElOU0VSVCBJTlRPICQxOm5hbWUgKCR7Y29sdW1uc1BhdHRlcm59KSBWQUxVRVMgKCR7dmFsdWVzUGF0dGVybn0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5jb2x1bW5zQXJyYXksIC4uLnZhbHVlc0FycmF5XTtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udCA6IHRoaXMuX2NsaWVudClcbiAgICAgIC5ub25lKHFzLCB2YWx1ZXMpXG4gICAgICAudGhlbigoKSA9PiAoeyBvcHM6IFtvYmplY3RdIH0pKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvcikge1xuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgZXJyLnVuZGVybHlpbmdFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGlmIChlcnJvci5jb25zdHJhaW50KSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gZXJyb3IuY29uc3RyYWludC5tYXRjaCgvdW5pcXVlXyhbYS16QS1aXSspLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBlcnJvciA9IGVycjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGFzeW5jIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdkZWxldGVPYmplY3RzQnlRdWVyeScpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IGluZGV4ID0gMjtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcbiAgICBpZiAoT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgd2hlcmUucGF0dGVybiA9ICdUUlVFJztcbiAgICB9XG4gICAgY29uc3QgcXMgPSBgV0lUSCBkZWxldGVkIEFTIChERUxFVEUgRlJPTSAkMTpuYW1lIFdIRVJFICR7d2hlcmUucGF0dGVybn0gUkVUVVJOSU5HICopIFNFTEVDVCBjb3VudCgqKSBGUk9NIGRlbGV0ZWRgO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KVxuICAgICAgLm9uZShxcywgdmFsdWVzLCBhID0+ICthLmNvdW50KVxuICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIEVMU0U6IERvbid0IGRlbGV0ZSBhbnl0aGluZyBpZiBkb2Vzbid0IGV4aXN0XG4gICAgICB9KTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG4gIC8vIFJldHVybiB2YWx1ZSBub3QgY3VycmVudGx5IHdlbGwgc3BlY2lmaWVkLlxuICBhc3luYyBmaW5kT25lQW5kVXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgZGVidWcoJ2ZpbmRPbmVBbmRVcGRhdGUnKTtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVPYmplY3RzQnlRdWVyeShjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHVwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oXG4gICAgICB2YWwgPT4gdmFsWzBdXG4gICAgKTtcbiAgfVxuXG4gIC8vIEFwcGx5IHRoZSB1cGRhdGUgdG8gYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIGFzeW5jIHVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICk6IFByb21pc2U8W2FueV0+IHtcbiAgICBkZWJ1ZygndXBkYXRlT2JqZWN0c0J5UXVlcnknKTtcbiAgICBjb25zdCB1cGRhdGVQYXR0ZXJucyA9IFtdO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGxldCBpbmRleCA9IDI7XG4gICAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuXG4gICAgY29uc3Qgb3JpZ2luYWxVcGRhdGUgPSB7IC4uLnVwZGF0ZSB9O1xuXG4gICAgLy8gU2V0IGZsYWcgZm9yIGRvdCBub3RhdGlvbiBmaWVsZHNcbiAgICBjb25zdCBkb3ROb3RhdGlvbk9wdGlvbnMgPSB7fTtcbiAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IGZpZWxkTmFtZS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBmaXJzdCA9IGNvbXBvbmVudHMuc2hpZnQoKTtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpcnN0XSA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHVwZGF0ZSA9IGhhbmRsZURvdEZpZWxkcyh1cGRhdGUpO1xuICAgIC8vIFJlc29sdmUgYXV0aERhdGEgZmlyc3QsXG4gICAgLy8gU28gd2UgZG9uJ3QgZW5kIHVwIHdpdGggbXVsdGlwbGUga2V5IHVwZGF0ZXNcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB1cGRhdGUpIHtcbiAgICAgIGNvbnN0IGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIGNvbnN0IHZhbHVlID0gdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIGRlbGV0ZSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddID0gdXBkYXRlWydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICB1cGRhdGVbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gdmFsdWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBmaWVsZFZhbHVlID0gdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAvLyBEcm9wIGFueSB1bmRlZmluZWQgdmFsdWVzLlxuICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PSAnYXV0aERhdGEnKSB7XG4gICAgICAgIC8vIFRoaXMgcmVjdXJzaXZlbHkgc2V0cyB0aGUganNvbl9vYmplY3RcbiAgICAgICAgLy8gT25seSAxIGxldmVsIGRlZXBcbiAgICAgICAgY29uc3QgZ2VuZXJhdGUgPSAoanNvbmI6IHN0cmluZywga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gYGpzb25fb2JqZWN0X3NldF9rZXkoQ09BTEVTQ0UoJHtqc29uYn0sICd7fSc6Ompzb25iKSwgJHtrZXl9LCAke3ZhbHVlfSk6Ompzb25iYDtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgbGFzdEtleSA9IGAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgIGNvbnN0IGZpZWxkTmFtZUluZGV4ID0gaW5kZXg7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGNvbnN0IHVwZGF0ZSA9IE9iamVjdC5rZXlzKGZpZWxkVmFsdWUpLnJlZHVjZSgobGFzdEtleTogc3RyaW5nLCBrZXk6IHN0cmluZykgPT4ge1xuICAgICAgICAgIGNvbnN0IHN0ciA9IGdlbmVyYXRlKGxhc3RLZXksIGAkJHtpbmRleH06OnRleHRgLCBgJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgIGxldCB2YWx1ZSA9IGZpZWxkVmFsdWVba2V5XTtcbiAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2YWx1ZSA9IEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsdWVzLnB1c2goa2V5LCB2YWx1ZSk7XG4gICAgICAgICAgcmV0dXJuIHN0cjtcbiAgICAgICAgfSwgbGFzdEtleSk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2ZpZWxkTmFtZUluZGV4fTpuYW1lID0gJHt1cGRhdGV9YCk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0luY3JlbWVudCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgMCkgKyAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5hbW91bnQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGQnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke2luZGV4ICsgMX06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBudWxsKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnUmVtb3ZlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X3JlbW92ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkVW5pcXVlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZF91bmlxdWUoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDFcbiAgICAgICAgICB9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgLy9UT0RPOiBzdG9wIHNwZWNpYWwgY2FzaW5nIHRoaXMuIEl0IHNob3VsZCBjaGVjayBmb3IgX190eXBlID09PSAnRGF0ZScgYW5kIHVzZSAuaXNvXG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgICAgaW5kZXggKz0gMztcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwoZmllbGRWYWx1ZS5jb29yZGluYXRlcyk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgLy8gbm9vcFxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnT2JqZWN0J1xuICAgICAgKSB7XG4gICAgICAgIC8vIEdhdGhlciBrZXlzIHRvIGluY3JlbWVudFxuICAgICAgICBjb25zdCBrZXlzVG9JbmNyZW1lbnQgPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKGsgPT4ge1xuICAgICAgICAgICAgLy8gY2hvb3NlIHRvcCBsZXZlbCBmaWVsZHMgdGhhdCBoYXZlIGEgZGVsZXRlIG9wZXJhdGlvbiBzZXRcbiAgICAgICAgICAgIC8vIE5vdGUgdGhhdCBPYmplY3Qua2V5cyBpcyBpdGVyYXRpbmcgb3ZlciB0aGUgKipvcmlnaW5hbCoqIHVwZGF0ZSBvYmplY3RcbiAgICAgICAgICAgIC8vIGFuZCB0aGF0IHNvbWUgb2YgdGhlIGtleXMgb2YgdGhlIG9yaWdpbmFsIHVwZGF0ZSBjb3VsZCBiZSBudWxsIG9yIHVuZGVmaW5lZDpcbiAgICAgICAgICAgIC8vIChTZWUgdGhlIGFib3ZlIGNoZWNrIGBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCB0eXBlb2YgZmllbGRWYWx1ZSA9PSBcInVuZGVmaW5lZFwiKWApXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsVXBkYXRlW2tdO1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgICAgICAgdmFsdWUuX19vcCA9PT0gJ0luY3JlbWVudCcgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJylbMF0gPT09IGZpZWxkTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoayA9PiBrLnNwbGl0KCcuJylbMV0pO1xuXG4gICAgICAgIGxldCBpbmNyZW1lbnRQYXR0ZXJucyA9ICcnO1xuICAgICAgICBpZiAoa2V5c1RvSW5jcmVtZW50Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpbmNyZW1lbnRQYXR0ZXJucyA9XG4gICAgICAgICAgICAnIHx8ICcgK1xuICAgICAgICAgICAga2V5c1RvSW5jcmVtZW50XG4gICAgICAgICAgICAgIC5tYXAoYyA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYW1vdW50ID0gZmllbGRWYWx1ZVtjXS5hbW91bnQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBDT05DQVQoJ3tcIiR7Y31cIjonLCBDT0FMRVNDRSgkJHtpbmRleH06bmFtZS0+Picke2N9JywnMCcpOjppbnQgKyAke2Ftb3VudH0sICd9Jyk6Ompzb25iYDtcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgLmpvaW4oJyB8fCAnKTtcbiAgICAgICAgICAvLyBTdHJpcCB0aGUga2V5c1xuICAgICAgICAgIGtleXNUb0luY3JlbWVudC5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgICBkZWxldGUgZmllbGRWYWx1ZVtrZXldO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qga2V5c1RvRGVsZXRlOiBBcnJheTxzdHJpbmc+ID0gT2JqZWN0LmtleXMob3JpZ2luYWxVcGRhdGUpXG4gICAgICAgICAgLmZpbHRlcihrID0+IHtcbiAgICAgICAgICAgIC8vIGNob29zZSB0b3AgbGV2ZWwgZmllbGRzIHRoYXQgaGF2ZSBhIGRlbGV0ZSBvcGVyYXRpb24gc2V0LlxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcmlnaW5hbFVwZGF0ZVtrXTtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHZhbHVlICYmXG4gICAgICAgICAgICAgIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpWzBdID09PSBmaWVsZE5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGsgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBjb25zdCBkZWxldGVQYXR0ZXJucyA9IGtleXNUb0RlbGV0ZS5yZWR1Y2UoKHA6IHN0cmluZywgYzogc3RyaW5nLCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgICByZXR1cm4gcCArIGAgLSAnJCR7aW5kZXggKyAxICsgaX06dmFsdWUnYDtcbiAgICAgICAgfSwgJycpO1xuICAgICAgICAvLyBPdmVycmlkZSBPYmplY3RcbiAgICAgICAgbGV0IHVwZGF0ZU9iamVjdCA9IFwiJ3t9Jzo6anNvbmJcIjtcblxuICAgICAgICBpZiAoZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAvLyBNZXJnZSBPYmplY3RcbiAgICAgICAgICB1cGRhdGVPYmplY3QgPSBgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICd7fSc6Ompzb25iKWA7XG4gICAgICAgIH1cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSAoJHt1cGRhdGVPYmplY3R9ICR7ZGVsZXRlUGF0dGVybnN9ICR7aW5jcmVtZW50UGF0dGVybnN9IHx8ICQke1xuICAgICAgICAgICAgaW5kZXggKyAxICsga2V5c1RvRGVsZXRlLmxlbmd0aFxuICAgICAgICAgIH06Ompzb25iIClgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgLi4ua2V5c1RvRGVsZXRlLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKSk7XG4gICAgICAgIGluZGV4ICs9IDIgKyBrZXlzVG9EZWxldGUubGVuZ3RoO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlKSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSdcbiAgICAgICkge1xuICAgICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZShzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pO1xuICAgICAgICBpZiAoZXhwZWN0ZWRUeXBlID09PSAndGV4dFtdJykge1xuICAgICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfTo6dGV4dFtdYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWJ1ZygnTm90IHN1cHBvcnRlZCB1cGRhdGUnLCB7IGZpZWxkTmFtZSwgZmllbGRWYWx1ZSB9KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICBgUG9zdGdyZXMgZG9lc24ndCBzdXBwb3J0IHVwZGF0ZSAke0pTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpfSB5ZXRgXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBpbmRleCxcbiAgICAgIHF1ZXJ5LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVDbGF1c2UgPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCBxcyA9IGBVUERBVEUgJDE6bmFtZSBTRVQgJHt1cGRhdGVQYXR0ZXJucy5qb2luKCl9ICR7d2hlcmVDbGF1c2V9IFJFVFVSTklORyAqYDtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udCA6IHRoaXMuX2NsaWVudCkuYW55KHFzLCB2YWx1ZXMpO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvLyBIb3BlZnVsbHksIHdlIGNhbiBnZXQgcmlkIG9mIHRoaXMuIEl0J3Mgb25seSB1c2VkIGZvciBjb25maWcgYW5kIGhvb2tzLlxuICB1cHNlcnRPbmVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ3Vwc2VydE9uZU9iamVjdCcpO1xuICAgIGNvbnN0IGNyZWF0ZVZhbHVlID0gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlT2JqZWN0KGNsYXNzTmFtZSwgc2NoZW1hLCBjcmVhdGVWYWx1ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIC8vIGlnbm9yZSBkdXBsaWNhdGUgdmFsdWUgZXJyb3JzIGFzIGl0J3MgdXBzZXJ0XG4gICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMuZmluZE9uZUFuZFVwZGF0ZShjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHVwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pO1xuICAgIH0pO1xuICB9XG5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB7IHNraXAsIGxpbWl0LCBzb3J0LCBrZXlzLCBjYXNlSW5zZW5zaXRpdmUsIGV4cGxhaW4gfTogUXVlcnlPcHRpb25zXG4gICkge1xuICAgIGRlYnVnKCdmaW5kJyk7XG4gICAgY29uc3QgaGFzTGltaXQgPSBsaW1pdCAhPT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGhhc1NraXAgPSBza2lwICE9PSB1bmRlZmluZWQ7XG4gICAgbGV0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiAyLFxuICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgbGltaXRQYXR0ZXJuID0gaGFzTGltaXQgPyBgTElNSVQgJCR7dmFsdWVzLmxlbmd0aCArIDF9YCA6ICcnO1xuICAgIGlmIChoYXNMaW1pdCkge1xuICAgICAgdmFsdWVzLnB1c2gobGltaXQpO1xuICAgIH1cbiAgICBjb25zdCBza2lwUGF0dGVybiA9IGhhc1NraXAgPyBgT0ZGU0VUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzU2tpcCkge1xuICAgICAgdmFsdWVzLnB1c2goc2tpcCk7XG4gICAgfVxuXG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgaWYgKHNvcnQpIHtcbiAgICAgIGNvbnN0IHNvcnRDb3B5OiBhbnkgPSBzb3J0O1xuICAgICAgY29uc3Qgc29ydGluZyA9IE9iamVjdC5rZXlzKHNvcnQpXG4gICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1LZXkgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhrZXkpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgLy8gVXNpbmcgJGlkeCBwYXR0ZXJuIGdpdmVzOiAgbm9uLWludGVnZXIgY29uc3RhbnQgaW4gT1JERVIgQllcbiAgICAgICAgICBpZiAoc29ydENvcHlba2V5XSA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIGAke3RyYW5zZm9ybUtleX0gQVNDYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAke3RyYW5zZm9ybUtleX0gREVTQ2A7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCk7XG4gICAgICBzb3J0UGF0dGVybiA9IHNvcnQgIT09IHVuZGVmaW5lZCAmJiBPYmplY3Qua2V5cyhzb3J0KS5sZW5ndGggPiAwID8gYE9SREVSIEJZICR7c29ydGluZ31gIDogJyc7XG4gICAgfVxuICAgIGlmICh3aGVyZS5zb3J0cyAmJiBPYmplY3Qua2V5cygod2hlcmUuc29ydHM6IGFueSkpLmxlbmd0aCA+IDApIHtcbiAgICAgIHNvcnRQYXR0ZXJuID0gYE9SREVSIEJZICR7d2hlcmUuc29ydHMuam9pbigpfWA7XG4gICAgfVxuXG4gICAgbGV0IGNvbHVtbnMgPSAnKic7XG4gICAgaWYgKGtleXMpIHtcbiAgICAgIC8vIEV4Y2x1ZGUgZW1wdHkga2V5c1xuICAgICAgLy8gUmVwbGFjZSBBQ0wgYnkgaXQncyBrZXlzXG4gICAgICBrZXlzID0ga2V5cy5yZWR1Y2UoKG1lbW8sIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5ID09PSAnQUNMJykge1xuICAgICAgICAgIG1lbW8ucHVzaCgnX3JwZXJtJyk7XG4gICAgICAgICAgbWVtby5wdXNoKCdfd3Blcm0nKTtcbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBrZXkubGVuZ3RoID4gMCAmJlxuICAgICAgICAgIC8vIFJlbW92ZSBzZWxlY3RlZCBmaWVsZCBub3QgcmVmZXJlbmNlZCBpbiB0aGUgc2NoZW1hXG4gICAgICAgICAgLy8gUmVsYXRpb24gaXMgbm90IGEgY29sdW1uIGluIHBvc3RncmVzXG4gICAgICAgICAgLy8gJHNjb3JlIGlzIGEgUGFyc2Ugc3BlY2lhbCBmaWVsZCBhbmQgaXMgYWxzbyBub3QgYSBjb2x1bW5cbiAgICAgICAgICAoKHNjaGVtYS5maWVsZHNba2V5XSAmJiBzY2hlbWEuZmllbGRzW2tleV0udHlwZSAhPT0gJ1JlbGF0aW9uJykgfHwga2V5ID09PSAnJHNjb3JlJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgbWVtby5wdXNoKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LCBbXSk7XG4gICAgICBjb2x1bW5zID0ga2V5c1xuICAgICAgICAubWFwKChrZXksIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGtleSA9PT0gJyRzY29yZScpIHtcbiAgICAgICAgICAgIHJldHVybiBgdHNfcmFua19jZCh0b190c3ZlY3RvcigkJHsyfSwgJCR7M306bmFtZSksIHRvX3RzcXVlcnkoJCR7NH0sICQkezV9KSwgMzIpIGFzIHNjb3JlYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAkJHtpbmRleCArIHZhbHVlcy5sZW5ndGggKyAxfTpuYW1lYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHZhbHVlcyA9IHZhbHVlcy5jb25jYXQoa2V5cyk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufSAke3NraXBQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluID8gdGhpcy5jcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KG9yaWdpbmFsUXVlcnkpIDogb3JpZ2luYWxRdWVyeTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KHFzLCB2YWx1ZXMpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBRdWVyeSBvbiBub24gZXhpc3RpbmcgdGFibGUsIGRvbid0IGNyYXNoXG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW107XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIENvbnZlcnRzIGZyb20gYSBwb3N0Z3Jlcy1mb3JtYXQgb2JqZWN0IHRvIGEgUkVTVC1mb3JtYXQgb2JqZWN0LlxuICAvLyBEb2VzIG5vdCBzdHJpcCBvdXQgYW55dGhpbmcgYmFzZWQgb24gYSBsYWNrIG9mIGF1dGhlbnRpY2F0aW9uLlxuICBwb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBzY2hlbWE6IGFueSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInICYmIG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgICAgIGxhdGl0dWRlOiBvYmplY3RbZmllbGROYW1lXS55LFxuICAgICAgICAgIGxvbmdpdHVkZTogb2JqZWN0W2ZpZWxkTmFtZV0ueCxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGxldCBjb29yZHMgPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgY29vcmRzID0gY29vcmRzLnN1YnN0cigyLCBjb29yZHMubGVuZ3RoIC0gNCkuc3BsaXQoJyksKCcpO1xuICAgICAgICBjb29yZHMgPSBjb29yZHMubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICByZXR1cm4gW3BhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVsxXSksIHBhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVswXSldO1xuICAgICAgICB9KTtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICAgICAgY29vcmRpbmF0ZXM6IGNvb3JkcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgICAgIG5hbWU6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIC8vVE9ETzogcmVtb3ZlIHRoaXMgcmVsaWFuY2Ugb24gdGhlIG1vbmdvIGZvcm1hdC4gREIgYWRhcHRlciBzaG91bGRuJ3Qga25vdyB0aGVyZSBpcyBhIGRpZmZlcmVuY2UgYmV0d2VlbiBjcmVhdGVkIGF0IGFuZCBhbnkgb3RoZXIgZGF0ZSBmaWVsZC5cbiAgICBpZiAob2JqZWN0LmNyZWF0ZWRBdCkge1xuICAgICAgb2JqZWN0LmNyZWF0ZWRBdCA9IG9iamVjdC5jcmVhdGVkQXQudG9JU09TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC51cGRhdGVkQXQpIHtcbiAgICAgIG9iamVjdC51cGRhdGVkQXQgPSBvYmplY3QudXBkYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QuZXhwaXJlc0F0KSB7XG4gICAgICBvYmplY3QuZXhwaXJlc0F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuZXhwaXJlc0F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0KSB7XG4gICAgICBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICAgIGlzbzogb2JqZWN0W2ZpZWxkTmFtZV0udG9JU09TdHJpbmcoKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBhc3luYyBlbnN1cmVVbmlxdWVuZXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgY29uc3RyYWludE5hbWUgPSBgJHtjbGFzc05hbWV9X3VuaXF1ZV8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYCk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFVOSVFVRSBJTkRFWCBJRiBOT1QgRVhJU1RTICQyOm5hbWUgT04gJDE6bmFtZSgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKHFzLCBbY2xhc3NOYW1lLCBjb25zdHJhaW50TmFtZSwgLi4uZmllbGROYW1lc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSkpIHtcbiAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGNvbnN0cmFpbnROYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIENhc3QgdGhlIGVycm9yIGludG8gdGhlIHByb3BlciBwYXJzZSBlcnJvclxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGNvdW50LlxuICBhc3luYyBjb3VudChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICByZWFkUHJlZmVyZW5jZT86IHN0cmluZyxcbiAgICBlc3RpbWF0ZT86IGJvb2xlYW4gPSB0cnVlXG4gICkge1xuICAgIGRlYnVnKCdjb3VudCcpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiAyLFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgbGV0IHFzID0gJyc7XG5cbiAgICBpZiAod2hlcmUucGF0dGVybi5sZW5ndGggPiAwIHx8ICFlc3RpbWF0ZSkge1xuICAgICAgcXMgPSBgU0VMRUNUIGNvdW50KCopIEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIH0gZWxzZSB7XG4gICAgICBxcyA9ICdTRUxFQ1QgcmVsdHVwbGVzIEFTIGFwcHJveGltYXRlX3Jvd19jb3VudCBGUk9NIHBnX2NsYXNzIFdIRVJFIHJlbG5hbWUgPSAkMSc7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLm9uZShxcywgdmFsdWVzLCBhID0+IHtcbiAgICAgICAgaWYgKGEuYXBwcm94aW1hdGVfcm93X2NvdW50ID09IG51bGwgfHwgYS5hcHByb3hpbWF0ZV9yb3dfY291bnQgPT0gLTEpIHtcbiAgICAgICAgICByZXR1cm4gIWlzTmFOKCthLmNvdW50KSA/ICthLmNvdW50IDogMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gK2EuYXBwcm94aW1hdGVfcm93X2NvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBkaXN0aW5jdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBxdWVyeTogUXVlcnlUeXBlLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIGRlYnVnKCdkaXN0aW5jdCcpO1xuICAgIGxldCBmaWVsZCA9IGZpZWxkTmFtZTtcbiAgICBsZXQgY29sdW1uID0gZmllbGROYW1lO1xuICAgIGNvbnN0IGlzTmVzdGVkID0gZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwO1xuICAgIGlmIChpc05lc3RlZCkge1xuICAgICAgZmllbGQgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICBjb2x1bW4gPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbiAgICB9XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGlzUG9pbnRlckZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcic7XG4gICAgY29uc3QgdmFsdWVzID0gW2ZpZWxkLCBjb2x1bW4sIGNsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCB0cmFuc2Zvcm1lciA9IGlzQXJyYXlGaWVsZCA/ICdqc29uYl9hcnJheV9lbGVtZW50cycgOiAnT04nO1xuICAgIGxldCBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6bmFtZSkgJDI6bmFtZSBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpyYXcpICQyOnJhdyBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yKSB7XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoIWlzTmVzdGVkKSB7XG4gICAgICAgICAgcmVzdWx0cyA9IHJlc3VsdHMuZmlsdGVyKG9iamVjdCA9PiBvYmplY3RbZmllbGRdICE9PSBudWxsKTtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgIGlmICghaXNQb2ludGVyRmllbGQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdFtmaWVsZF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGRdLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjaGlsZCA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzFdO1xuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IG9iamVjdFtjb2x1bW5dW2NoaWxkXSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PlxuICAgICAgICByZXN1bHRzLm1hcChvYmplY3QgPT4gdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpXG4gICAgICApO1xuICB9XG5cbiAgYXN5bmMgYWdncmVnYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogYW55LFxuICAgIHBpcGVsaW5lOiBhbnksXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgaGludDogP21peGVkLFxuICAgIGV4cGxhaW4/OiBib29sZWFuXG4gICkge1xuICAgIGRlYnVnKCdhZ2dyZWdhdGUnKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXg6IG51bWJlciA9IDI7XG4gICAgbGV0IGNvbHVtbnM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGNvdW50RmllbGQgPSBudWxsO1xuICAgIGxldCBncm91cFZhbHVlcyA9IG51bGw7XG4gICAgbGV0IHdoZXJlUGF0dGVybiA9ICcnO1xuICAgIGxldCBsaW1pdFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc2tpcFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBsZXQgZ3JvdXBQYXR0ZXJuID0gJyc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaXBlbGluZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3Qgc3RhZ2UgPSBwaXBlbGluZVtpXTtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRncm91cFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUgIT09ICcnKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTIFwib2JqZWN0SWRcImApO1xuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ19pZCcgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiBPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICBncm91cFZhbHVlcyA9IHZhbHVlO1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBCeUZpZWxkcyA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBhbGlhcyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2FsaWFzXSA9PT0gJ3N0cmluZycgJiYgdmFsdWVbYWxpYXNdKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gdHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWVbYWxpYXNdKTtcbiAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgZ3JvdXBCeUZpZWxkcy5wdXNoKGBcIiR7c291cmNlfVwiYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHNvdXJjZSwgYWxpYXMpO1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWUgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcGVyYXRpb24gPSBPYmplY3Qua2V5cyh2YWx1ZVthbGlhc10pWzBdO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXVtvcGVyYXRpb25dKTtcbiAgICAgICAgICAgICAgICBpZiAobW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl0pIHtcbiAgICAgICAgICAgICAgICAgIGlmICghZ3JvdXBCeUZpZWxkcy5pbmNsdWRlcyhgXCIke3NvdXJjZX1cImApKSB7XG4gICAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICBgRVhUUkFDVCgke1xuICAgICAgICAgICAgICAgICAgICAgIG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dXG4gICAgICAgICAgICAgICAgICAgIH0gRlJPTSAkJHtpbmRleH06bmFtZSBBVCBUSU1FIFpPTkUgJ1VUQycpOjppbnRlZ2VyIEFTICQke2luZGV4ICsgMX06bmFtZWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9OnJhd2A7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChncm91cEJ5RmllbGRzLmpvaW4oKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuJHN1bSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlLiRzdW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBTVU0oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRzdW0pLCBmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb3VudEZpZWxkID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBDT1VOVCgqKSBBUyAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1heCkge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1BWCgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtYXgpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1pbikge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1JTigkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtaW4pLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJGF2Zykge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYEFWRygkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRhdmcpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2x1bW5zLnB1c2goJyonKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICBpZiAoY29sdW1ucy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgY29sdW1ucyA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRwcm9qZWN0W2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IDEgfHwgdmFsdWUgPT09IHRydWUpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5zID0gW107XG4gICAgICAgIGNvbnN0IG9yT3JBbmQgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2UuJG1hdGNoLCAnJG9yJylcbiAgICAgICAgICA/ICcgT1IgJ1xuICAgICAgICAgIDogJyBBTkQgJztcblxuICAgICAgICBpZiAoc3RhZ2UuJG1hdGNoLiRvcikge1xuICAgICAgICAgIGNvbnN0IGNvbGxhcHNlID0ge307XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLiRvci5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZWxlbWVudCkge1xuICAgICAgICAgICAgICBjb2xsYXBzZVtrZXldID0gZWxlbWVudFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHN0YWdlLiRtYXRjaCA9IGNvbGxhcHNlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kbWF0Y2hbZmllbGRdO1xuICAgICAgICAgIGNvbnN0IG1hdGNoUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgICAgICAgIGlmICh2YWx1ZVtjbXBdKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICAgICAgICBtYXRjaFBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkLCB0b1Bvc3RncmVzVmFsdWUodmFsdWVbY21wXSkpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGlmIChtYXRjaFBhdHRlcm5zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgke21hdGNoUGF0dGVybnMuam9pbignIEFORCAnKX0pYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIG1hdGNoUGF0dGVybnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkLCB2YWx1ZSk7XG4gICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB3aGVyZVBhdHRlcm4gPSBwYXR0ZXJucy5sZW5ndGggPiAwID8gYFdIRVJFICR7cGF0dGVybnMuam9pbihgICR7b3JPckFuZH0gYCl9YCA6ICcnO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRsaW1pdCkge1xuICAgICAgICBsaW1pdFBhdHRlcm4gPSBgTElNSVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJGxpbWl0KTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc2tpcCkge1xuICAgICAgICBza2lwUGF0dGVybiA9IGBPRkZTRVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJHNraXApO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRzb3J0KSB7XG4gICAgICAgIGNvbnN0IHNvcnQgPSBzdGFnZS4kc29ydDtcbiAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHNvcnQpO1xuICAgICAgICBjb25zdCBzb3J0aW5nID0ga2V5c1xuICAgICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gc29ydFtrZXldID09PSAxID8gJ0FTQycgOiAnREVTQyc7XG4gICAgICAgICAgICBjb25zdCBvcmRlciA9IGAkJHtpbmRleH06bmFtZSAke3RyYW5zZm9ybWVyfWA7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgcmV0dXJuIG9yZGVyO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmpvaW4oKTtcbiAgICAgICAgdmFsdWVzLnB1c2goLi4ua2V5cyk7XG4gICAgICAgIHNvcnRQYXR0ZXJuID0gc29ydCAhPT0gdW5kZWZpbmVkICYmIHNvcnRpbmcubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChncm91cFBhdHRlcm4pIHtcbiAgICAgIGNvbHVtbnMuZm9yRWFjaCgoZSwgaSwgYSkgPT4ge1xuICAgICAgICBpZiAoZSAmJiBlLnRyaW0oKSA9PT0gJyonKSB7XG4gICAgICAgICAgYVtpXSA9ICcnO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnNcbiAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgIC5qb2luKCl9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtza2lwUGF0dGVybn0gJHtncm91cFBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluID8gdGhpcy5jcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KG9yaWdpbmFsUXVlcnkpIDogb3JpZ2luYWxRdWVyeTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgdmFsdWVzKS50aGVuKGEgPT4ge1xuICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgcmV0dXJuIGE7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHRzID0gYS5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdvYmplY3RJZCcpKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSB7fTtcbiAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBncm91cFZhbHVlcykge1xuICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkW2tleV0gPSByZXN1bHRba2V5XTtcbiAgICAgICAgICAgIGRlbGV0ZSByZXN1bHRba2V5XTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvdW50RmllbGQpIHtcbiAgICAgICAgICByZXN1bHRbY291bnRGaWVsZF0gPSBwYXJzZUludChyZXN1bHRbY291bnRGaWVsZF0sIDEwKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbih7IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgfTogYW55KSB7XG4gICAgLy8gVE9ETzogVGhpcyBtZXRob2QgbmVlZHMgdG8gYmUgcmV3cml0dGVuIHRvIG1ha2UgcHJvcGVyIHVzZSBvZiBjb25uZWN0aW9ucyAoQHZpdGFseS10KVxuICAgIGRlYnVnKCdwZXJmb3JtSW5pdGlhbGl6YXRpb24nKTtcbiAgICBhd2FpdCB0aGlzLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKCk7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzLm1hcChzY2hlbWEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlVGFibGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKVxuICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIHx8XG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5zY2hlbWFVcGdyYWRlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSkpO1xuICAgIH0pO1xuICAgIHByb21pc2VzLnB1c2godGhpcy5fbGlzdGVuVG9TY2hlbWEoKSk7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2xpZW50LnR4KCdwZXJmb3JtLWluaXRpYWxpemF0aW9uJywgYXN5bmMgdCA9PiB7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5taXNjLmpzb25PYmplY3RTZXRLZXlzKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmFkZCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGRVbmlxdWUpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkucmVtb3ZlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zQWxsKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zQWxsUmVnZXgpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuY29udGFpbnMpO1xuICAgICAgICAgIHJldHVybiB0LmN0eDtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oY3R4ID0+IHtcbiAgICAgICAgZGVidWcoYGluaXRpYWxpemF0aW9uRG9uZSBpbiAke2N0eC5kdXJhdGlvbn1gKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46ID9hbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+XG4gICAgICB0LmJhdGNoKFxuICAgICAgICBpbmRleGVzLm1hcChpID0+IHtcbiAgICAgICAgICByZXR1cm4gdC5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgICAgICAgaS5uYW1lLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaS5rZXksXG4gICAgICAgICAgXSk7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCAoY29ubiB8fCB0aGlzLl9jbGllbnQpLm5vbmUoJ0NSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLCBbXG4gICAgICBmaWVsZE5hbWUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0eXBlLFxuICAgIF0pO1xuICB9XG5cbiAgYXN5bmMgZHJvcEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSwgY29ubjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcXVlcmllcyA9IGluZGV4ZXMubWFwKGkgPT4gKHtcbiAgICAgIHF1ZXJ5OiAnRFJPUCBJTkRFWCAkMTpuYW1lJyxcbiAgICAgIHZhbHVlczogaSxcbiAgICB9KSk7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+IHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgfVxuXG4gIGFzeW5jIGdldEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxcyA9ICdTRUxFQ1QgKiBGUk9NIHBnX2luZGV4ZXMgV0hFUkUgdGFibGVuYW1lID0gJHtjbGFzc05hbWV9JztcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgeyBjbGFzc05hbWUgfSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBVc2VkIGZvciB0ZXN0aW5nIHB1cnBvc2VzXG4gIGFzeW5jIHVwZGF0ZUVzdGltYXRlZENvdW50KGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKCdBTkFMWVpFICQxOm5hbWUnLCBbY2xhc3NOYW1lXSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZXNzaW9uID0ge307XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXN1bHQgPSB0aGlzLl9jbGllbnQudHgodCA9PiB7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgPSB0O1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICAgIH0pO1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaCA9IFtdO1xuICAgICAgICByZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnByb21pc2U7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZXNzaW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0O1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0LmNhdGNoKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChQcm9taXNlLnJlamVjdCgpKTtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSW5kZXgoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIGZpZWxkTmFtZXM6IHN0cmluZ1tdLFxuICAgIGluZGV4TmFtZTogP3N0cmluZyxcbiAgICBjYXNlSW5zZW5zaXRpdmU6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zPzogT2JqZWN0ID0ge31cbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgZGVmYXVsdEluZGV4TmFtZSA9IGBwYXJzZV9kZWZhdWx0XyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID1cbiAgICAgIGluZGV4TmFtZSAhPSBudWxsID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHsgbmFtZTogZGVmYXVsdEluZGV4TmFtZSB9O1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYGxvd2VyKCQke2luZGV4ICsgM306bmFtZSkgdmFyY2hhcl9wYXR0ZXJuX29wc2ApXG4gICAgICA6IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYCk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgY29uc3Qgc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA9XG4gICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA6IGZhbHNlO1xuICAgIGlmIChzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uKSB7XG4gICAgICBhd2FpdCB0aGlzLmVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucyk7XG4gICAgfVxuICAgIGF3YWl0IGNvbm4ubm9uZShxcywgW2luZGV4TmFtZU9wdGlvbnMubmFtZSwgY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGluZGV4TmFtZU9wdGlvbnMubmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGVsZXRlSWRlbXBvdGVuY3lGdW5jdGlvbihvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBxcyA9ICdEUk9QIEZVTkNUSU9OIElGIEVYSVNUUyBpZGVtcG90ZW5jeV9kZWxldGVfZXhwaXJlZF9yZWNvcmRzKCknO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMpLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyhvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCB0dGxPcHRpb25zID0gb3B0aW9ucy50dGwgIT09IHVuZGVmaW5lZCA/IGAke29wdGlvbnMudHRsfSBzZWNvbmRzYCA6ICc2MCBzZWNvbmRzJztcbiAgICBjb25zdCBxcyA9XG4gICAgICAnQ1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04gaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpIFJFVFVSTlMgdm9pZCBMQU5HVUFHRSBwbHBnc3FsIEFTICQkIEJFR0lOIERFTEVURSBGUk9NIFwiX0lkZW1wb3RlbmN5XCIgV0hFUkUgZXhwaXJlIDwgTk9XKCkgLSBJTlRFUlZBTCAkMTsgRU5EOyAkJDsnO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMsIFt0dGxPcHRpb25zXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29udmVydFBvbHlnb25Ub1NRTChwb2x5Z29uKSB7XG4gIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgUG9seWdvbiBtdXN0IGhhdmUgYXQgbGVhc3QgMyB2YWx1ZXNgKTtcbiAgfVxuICBpZiAoXG4gICAgcG9seWdvblswXVswXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzBdIHx8XG4gICAgcG9seWdvblswXVsxXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzFdXG4gICkge1xuICAgIHBvbHlnb24ucHVzaChwb2x5Z29uWzBdKTtcbiAgfVxuICBjb25zdCB1bmlxdWUgPSBwb2x5Z29uLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgbGV0IGZvdW5kSW5kZXggPSAtMTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgaWYgKHB0WzBdID09PSBpdGVtWzBdICYmIHB0WzFdID09PSBpdGVtWzFdKSB7XG4gICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICB9KTtcbiAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICk7XG4gIH1cbiAgY29uc3QgcG9pbnRzID0gcG9seWdvblxuICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBhcnNlRmxvYXQocG9pbnRbMV0pLCBwYXJzZUZsb2F0KHBvaW50WzBdKSk7XG4gICAgICByZXR1cm4gYCgke3BvaW50WzFdfSwgJHtwb2ludFswXX0pYDtcbiAgICB9KVxuICAgIC5qb2luKCcsICcpO1xuICByZXR1cm4gYCgke3BvaW50c30pYDtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCkge1xuICBpZiAoIXJlZ2V4LmVuZHNXaXRoKCdcXG4nKSkge1xuICAgIHJlZ2V4ICs9ICdcXG4nO1xuICB9XG5cbiAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIGNvbW1lbnRzXG4gIHJldHVybiAoXG4gICAgcmVnZXhcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSkjLipcXG4vZ2ltLCAnJDEnKVxuICAgICAgLy8gcmVtb3ZlIGxpbmVzIHN0YXJ0aW5nIHdpdGggYSBjb21tZW50XG4gICAgICAucmVwbGFjZSgvXiMuKlxcbi9naW0sICcnKVxuICAgICAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIHdoaXRlc3BhY2VcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSlcXHMrL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSB3aGl0ZXNwYWNlIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBsaW5lXG4gICAgICAucmVwbGFjZSgvXlxccysvLCAnJylcbiAgICAgIC50cmltKClcbiAgKTtcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1JlZ2V4UGF0dGVybihzKSB7XG4gIGlmIChzICYmIHMuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgLy8gcmVnZXggZm9yIHN0YXJ0c1dpdGhcbiAgICByZXR1cm4gJ14nICsgbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDEpKTtcbiAgfSBlbHNlIGlmIChzICYmIHMuZW5kc1dpdGgoJyQnKSkge1xuICAgIC8vIHJlZ2V4IGZvciBlbmRzV2l0aFxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMuc2xpY2UoMCwgcy5sZW5ndGggLSAxKSkgKyAnJCc7XG4gIH1cblxuICAvLyByZWdleCBmb3IgY29udGFpbnNcbiAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocyk7XG59XG5cbmZ1bmN0aW9uIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlKSB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCAhdmFsdWUuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9cXF5cXFxcUS4qXFxcXEUvKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn1cblxuZnVuY3Rpb24gaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpIHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0uJHJlZ2V4KTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXS4kcmVnZXgpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgodmFsdWVzKSB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gaXNTdGFydHNXaXRoUmVnZXgodmFsdWUuJHJlZ2V4KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpIHtcbiAgcmV0dXJuIHJlbWFpbmluZ1xuICAgIC5zcGxpdCgnJylcbiAgICAubWFwKGMgPT4ge1xuICAgICAgY29uc3QgcmVnZXggPSBSZWdFeHAoJ1swLTkgXXxcXFxccHtMfScsICd1Jyk7IC8vIFN1cHBvcnQgYWxsIHVuaWNvZGUgbGV0dGVyIGNoYXJzXG4gICAgICBpZiAoYy5tYXRjaChyZWdleCkgIT09IG51bGwpIHtcbiAgICAgICAgLy8gZG9uJ3QgZXNjYXBlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzXG4gICAgICAgIHJldHVybiBjO1xuICAgICAgfVxuICAgICAgLy8gZXNjYXBlIGV2ZXJ5dGhpbmcgZWxzZSAoc2luZ2xlIHF1b3RlcyB3aXRoIHNpbmdsZSBxdW90ZXMsIGV2ZXJ5dGhpbmcgZWxzZSB3aXRoIGEgYmFja3NsYXNoKVxuICAgICAgcmV0dXJuIGMgPT09IGAnYCA/IGAnJ2AgOiBgXFxcXCR7Y31gO1xuICAgIH0pXG4gICAgLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBsaXRlcmFsaXplUmVnZXhQYXJ0KHM6IHN0cmluZykge1xuICBjb25zdCBtYXRjaGVyMSA9IC9cXFxcUSgoPyFcXFxcRSkuKilcXFxcRSQvO1xuICBjb25zdCByZXN1bHQxOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIxKTtcbiAgaWYgKHJlc3VsdDEgJiYgcmVzdWx0MS5sZW5ndGggPiAxICYmIHJlc3VsdDEuaW5kZXggPiAtMSkge1xuICAgIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgYW5kIGFuIGVuZCBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cigwLCByZXN1bHQxLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQxWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gcHJvY2VzcyByZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgY29uc3QgbWF0Y2hlcjIgPSAvXFxcXFEoKD8hXFxcXEUpLiopJC87XG4gIGNvbnN0IHJlc3VsdDI6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjIpO1xuICBpZiAocmVzdWx0MiAmJiByZXN1bHQyLmxlbmd0aCA+IDEgJiYgcmVzdWx0Mi5pbmRleCA+IC0xKSB7XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHIoMCwgcmVzdWx0Mi5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MlsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHJlbW92ZSBhbGwgaW5zdGFuY2VzIG9mIFxcUSBhbmQgXFxFIGZyb20gdGhlIHJlbWFpbmluZyB0ZXh0ICYgZXNjYXBlIHNpbmdsZSBxdW90ZXNcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxFKS8sICckMScpXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcUSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC9eXFxcXEUvLCAnJylcbiAgICAucmVwbGFjZSgvXlxcXFxRLywgJycpXG4gICAgLnJlcGxhY2UoLyhbXiddKScvLCBgJDEnJ2ApXG4gICAgLnJlcGxhY2UoL14nKFteJ10pLywgYCcnJDFgKTtcbn1cblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnO1xuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiJdfQ==