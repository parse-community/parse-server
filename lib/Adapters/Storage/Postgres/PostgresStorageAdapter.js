"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PostgresStorageAdapter = void 0;

var _PostgresClient = require("./PostgresClient");

var _node = _interopRequireDefault(require("parse/node"));

var _lodash = _interopRequireDefault(require("lodash"));

var _sql = _interopRequireDefault(require("./sql"));

var _StorageAdapter = require("../StorageAdapter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';
const PostgresDuplicateColumnError = '42701';
const PostgresMissingColumnError = '42703';
const PostgresDuplicateObjectError = '42710';
const PostgresUniqueIndexViolationError = '23505';
const PostgresTransactionAbortedError = '25P02';

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
      return 'char(10)';

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
    clps = _objectSpread({}, emptyCLPS, {}, schema.classLevelPermissions);
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
              const constraintFieldName = transformDotField(fieldName);
              patterns.push(`(${constraintFieldName} <> $${index} OR ${constraintFieldName} IS NULL)`);
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
          values.push(fieldValue.$eq);
          patterns.push(`${transformDotField(fieldName)} = $${index++}`);
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
      if (fieldValue.$exists) {
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
        const postgresValue = toPostgresValue(fieldValue[cmp]);
        let constraintFieldName;

        if (fieldName.indexOf('.') >= 0) {
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

          constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
        } else {
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
    databaseOptions
  }) {
    this._collectionPrefix = collectionPrefix;
    const {
      client,
      pgp
    } = (0, _PostgresClient.createClient)(uri, databaseOptions);
    this._client = client;
    this._pgp = pgp;
    this.canSortOnJoinTables = false;
  } //Note that analyze=true will run the query, executing INSERTS, DELETES, etc.


  createExplainableQuery(query, analyze = false) {
    if (analyze) {
      return 'EXPLAIN (ANALYZE, FORMAT JSON) ' + query;
    } else {
      return 'EXPLAIN (FORMAT JSON) ' + query;
    }
  }

  handleShutdown() {
    if (!this._client) {
      return;
    }

    this._client.$pool.end();
  }

  async _ensureSchemaCollectionExists(conn) {
    conn = conn || this._client;
    await conn.none('CREATE TABLE IF NOT EXISTS "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )').catch(error => {
      if (error.code === PostgresDuplicateRelationError || error.code === PostgresUniqueIndexViolationError || error.code === PostgresDuplicateObjectError) {// Table already exists, must have been created by a different request. Ignore error.
      } else {
        throw error;
      }
    });
  }

  async classExists(name) {
    return this._client.one('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)', [name], a => a.exists);
  }

  async setClassLevelPermissions(className, CLPs) {
    const self = this;
    await this._client.task('set-class-level-permissions', async t => {
      await self._ensureSchemaCollectionExists(t);
      const values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)];
      await t.none(`UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1`, values);
    });
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
          if (!Object.prototype.hasOwnProperty.call(fields, key)) {
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
      if (insertedIndexes.length > 0) {
        await self.createIndexes(className, insertedIndexes, t);
      }

      if (deletedIndexes.length > 0) {
        await self.dropIndexes(className, deletedIndexes, t);
      }

      await self._ensureSchemaCollectionExists(t);
      await t.none('UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1', [className, 'schema', 'indexes', JSON.stringify(existingIndexes)]);
    });
  }

  async createClass(className, schema, conn) {
    conn = conn || this._client;
    return conn.tx('create-class', async t => {
      const q1 = this.createTable(className, schema, t);
      const q2 = t.none('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', {
        className,
        schema
      });
      const q3 = this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields, t); // TODO: The test should not verify the returned value, and then
      //  the method can be simplified, to avoid returning useless stuff.

      return t.batch([q1, q2, q3]);
    }).then(() => {
      return toParseSchema(schema);
    }).catch(err => {
      if (err.data[0].result.code === PostgresTransactionAbortedError) {
        err = err.data[1].result;
      }

      if (err.code === PostgresUniqueIndexViolationError && err.detail.includes(className)) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, `Class ${className} already exists.`);
      }

      throw err;
    });
  } // Just create a table, do not insert in schema


  async createTable(className, schema, conn) {
    conn = conn || this._client;
    const self = this;
    debug('createTable', className, schema);
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
    debug(qs, values);
    return conn.task('create-table', async t => {
      try {
        await self._ensureSchemaCollectionExists(t);
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
    debug('schemaUpgrade', {
      className,
      schema
    });
    conn = conn || this._client;
    const self = this;
    await conn.tx('schema-upgrade', async t => {
      const columns = await t.map('SELECT column_name FROM information_schema.columns WHERE table_name = $<className>', {
        className
      }, a => a.column_name);
      const newColumns = Object.keys(schema.fields).filter(item => columns.indexOf(item) === -1).map(fieldName => self.addFieldIfNotExists(className, fieldName, schema.fields[fieldName], t));
      await t.batch(newColumns);
    });
  }

  async addFieldIfNotExists(className, fieldName, type, conn) {
    // TODO: Must be revised for invalid logic...
    debug('addFieldIfNotExists', {
      className,
      fieldName,
      type
    });
    conn = conn || this._client;
    const self = this;
    await conn.tx('add-field-if-not-exists', async t => {
      if (type.type !== 'Relation') {
        try {
          await t.none('ALTER TABLE $<className:name> ADD COLUMN $<fieldName:name> $<postgresType:raw>', {
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
    return this._client.tx(t => t.none(this._pgp.helpers.concat(operations))).then(() => className.indexOf('_Join:') != 0); // resolves with false when _Join table
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
        const classes = ['_SCHEMA', '_PushStatus', '_JobStatus', '_JobSchedule', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_Audience', ...results.map(result => result.className), ...joins];
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
    debug('deleteFields', className, fieldNames);
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
        await t.none(`ALTER TABLE $1:name DROP COLUMN ${columns}`, values);
      }
    });
  } // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.


  async getAllClasses() {
    const self = this;
    return this._client.task('get-all-classes', async t => {
      await self._ensureSchemaCollectionExists(t);
      return await t.map('SELECT * FROM "_SCHEMA"', null, row => toParseSchema(_objectSpread({
        className: row.className
      }, row.schema)));
    });
  } // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.


  async getClass(className) {
    debug('getClass', className);
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
    debug('createObject', className, object);
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

      if (authDataMatch) {
        var provider = authDataMatch[1];
        object['authData'] = object['authData'] || {};
        object['authData'][provider] = object[fieldName];
        delete object[fieldName];
        fieldName = 'authData';
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
    debug(qs, values);
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
    debug('deleteObjectsByQuery', className, query);
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
    debug(qs, values);
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
    debug('findOneAndUpdate', className, query, update);
    return this.updateObjectsByQuery(className, schema, query, update, transactionalSession).then(val => val[0]);
  } // Apply the update to all objects that match the given Parse Query.


  async updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    debug('updateObjectsByQuery', className, query, update);
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
        debug('Not supported update', fieldName, fieldValue);
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
    debug('update: ', qs, values);
    const promise = (transactionalSession ? transactionalSession.t : this._client).any(qs, values);

    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }

    return promise;
  } // Hopefully, we can get rid of this. It's only used for config and hooks.


  upsertOneObject(className, schema, query, update, transactionalSession) {
    debug('upsertOneObject', {
      className,
      query,
      update
    });
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
    debug('find', className, query, {
      skip,
      limit,
      sort,
      keys,
      caseInsensitive,
      explain
    });
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
        } else if (key.length > 0) {
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
    debug(qs, values);
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
    // Use the same name for every ensureUniqueness attempt, because postgres
    // Will happily create the same index with multiple names.
    const constraintName = `unique_${fieldNames.sort().join('_')}`;
    const constraintPatterns = fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `ALTER TABLE $1:name ADD CONSTRAINT $2:name UNIQUE (${constraintPatterns.join()})`;
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
    debug('count', className, query, readPreference, estimate);
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
      if (a.approximate_row_count != null) {
        return +a.approximate_row_count;
      } else {
        return +a.count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }

      return 0;
    });
  }

  async distinct(className, schema, query, fieldName) {
    debug('distinct', className, query);
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

    debug(qs, values);
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
    debug('aggregate', className, pipeline, readPreference, hint, explain);
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

                  columns.push(`EXTRACT(${mongoAggregateToPostgres[operation]} FROM $${index}:name AT TIME ZONE 'UTC') AS $${index + 1}:name`);
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
    debug(qs, values);
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
    const promises = VolatileClassesSchemas.map(schema => {
      return this.createTable(schema.className, schema).catch(err => {
        if (err.code === PostgresDuplicateRelationError || err.code === _node.default.Error.INVALID_CLASS_NAME) {
          return Promise.resolve();
        }

        throw err;
      }).then(() => this.schemaUpgrade(schema.className, schema));
    });
    return Promise.all(promises).then(() => {
      return this._client.tx('perform-initialization', t => {
        return t.batch([t.none(_sql.default.misc.jsonObjectSetKeys), t.none(_sql.default.array.add), t.none(_sql.default.array.addUnique), t.none(_sql.default.array.remove), t.none(_sql.default.array.containsAll), t.none(_sql.default.array.containsAllRegex), t.none(_sql.default.array.contains)]);
      });
    }).then(data => {
      debug(`initializationDone in ${data.duration}`);
    }).catch(error => {
      /* eslint-disable no-console */
      console.error(error);
    });
  }

  async createIndexes(className, indexes, conn) {
    return (conn || this._client).tx(t => t.batch(indexes.map(i => {
      return t.none('CREATE INDEX $1:name ON $2:name ($3:name)', [i.name, className, i.key]);
    })));
  }

  async createIndexesIfNeeded(className, fieldName, type, conn) {
    await (conn || this._client).none('CREATE INDEX $1:name ON $2:name ($3:name)', [fieldName, className, type]);
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

  async ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, conn = null) {
    conn = conn != null ? conn : this._client;
    const defaultIndexName = `parse_default_${fieldNames.sort().join('_')}`;
    const indexNameOptions = indexName != null ? {
      name: indexName
    } : {
      name: defaultIndexName
    };
    const constraintPatterns = caseInsensitive ? fieldNames.map((fieldName, index) => `lower($${index + 3}:name) varchar_pattern_ops`) : fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE INDEX $1:name ON $2:name (${constraintPatterns.join()})`;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIuanMiXSwibmFtZXMiOlsiUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciIsIlBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVPYmplY3RFcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsIlBvc3RncmVzVHJhbnNhY3Rpb25BYm9ydGVkRXJyb3IiLCJsb2dnZXIiLCJyZXF1aXJlIiwiZGVidWciLCJhcmdzIiwiYXJndW1lbnRzIiwiY29uY2F0Iiwic2xpY2UiLCJsZW5ndGgiLCJsb2ciLCJnZXRMb2dnZXIiLCJhcHBseSIsInBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlIiwidHlwZSIsImNvbnRlbnRzIiwiSlNPTiIsInN0cmluZ2lmeSIsIlBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciIsIiRndCIsIiRsdCIsIiRndGUiLCIkbHRlIiwibW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzIiwiJGRheU9mTW9udGgiLCIkZGF5T2ZXZWVrIiwiJGRheU9mWWVhciIsIiRpc29EYXlPZldlZWsiLCIkaXNvV2Vla1llYXIiLCIkaG91ciIsIiRtaW51dGUiLCIkc2Vjb25kIiwiJG1pbGxpc2Vjb25kIiwiJG1vbnRoIiwiJHdlZWsiLCIkeWVhciIsInRvUG9zdGdyZXNWYWx1ZSIsInZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRyYW5zZm9ybVZhbHVlIiwib2JqZWN0SWQiLCJlbXB0eUNMUFMiLCJPYmplY3QiLCJmcmVlemUiLCJmaW5kIiwiZ2V0IiwiY291bnQiLCJjcmVhdGUiLCJ1cGRhdGUiLCJkZWxldGUiLCJhZGRGaWVsZCIsInByb3RlY3RlZEZpZWxkcyIsImRlZmF1bHRDTFBTIiwidG9QYXJzZVNjaGVtYSIsInNjaGVtYSIsImNsYXNzTmFtZSIsImZpZWxkcyIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfd3Blcm0iLCJfcnBlcm0iLCJjbHBzIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaW5kZXhlcyIsInRvUG9zdGdyZXNTY2hlbWEiLCJfcGFzc3dvcmRfaGlzdG9yeSIsImhhbmRsZURvdEZpZWxkcyIsIm9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwiZmllbGROYW1lIiwiaW5kZXhPZiIsImNvbXBvbmVudHMiLCJzcGxpdCIsImZpcnN0Iiwic2hpZnQiLCJjdXJyZW50T2JqIiwibmV4dCIsIl9fb3AiLCJ1bmRlZmluZWQiLCJ0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyIsIm1hcCIsImNtcHQiLCJpbmRleCIsInRyYW5zZm9ybURvdEZpZWxkIiwiam9pbiIsInRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkIiwic3Vic3RyIiwidmFsaWRhdGVLZXlzIiwia2V5IiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwiam9pblRhYmxlc0ZvclNjaGVtYSIsImxpc3QiLCJmaWVsZCIsInB1c2giLCJidWlsZFdoZXJlQ2xhdXNlIiwicXVlcnkiLCJjYXNlSW5zZW5zaXRpdmUiLCJwYXR0ZXJucyIsInZhbHVlcyIsInNvcnRzIiwiaXNBcnJheUZpZWxkIiwiaW5pdGlhbFBhdHRlcm5zTGVuZ3RoIiwiZmllbGRWYWx1ZSIsIiRleGlzdHMiLCJhdXRoRGF0YU1hdGNoIiwibWF0Y2giLCIkaW4iLCIkcmVnZXgiLCJNQVhfSU5UX1BMVVNfT05FIiwiY2xhdXNlcyIsImNsYXVzZVZhbHVlcyIsInN1YlF1ZXJ5IiwiY2xhdXNlIiwicGF0dGVybiIsIm9yT3JBbmQiLCJub3QiLCIkbmUiLCJjb25zdHJhaW50RmllbGROYW1lIiwicG9pbnQiLCJsb25naXR1ZGUiLCJsYXRpdHVkZSIsIiRlcSIsImlzSW5Pck5pbiIsIkFycmF5IiwiaXNBcnJheSIsIiRuaW4iLCJpblBhdHRlcm5zIiwiYWxsb3dOdWxsIiwibGlzdEVsZW0iLCJsaXN0SW5kZXgiLCJjcmVhdGVDb25zdHJhaW50IiwiYmFzZUFycmF5Iiwibm90SW4iLCJfIiwiZmxhdE1hcCIsImVsdCIsIklOVkFMSURfSlNPTiIsIiRhbGwiLCJpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoIiwiaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSIsImkiLCJwcm9jZXNzUmVnZXhQYXR0ZXJuIiwic3Vic3RyaW5nIiwiJGNvbnRhaW5lZEJ5IiwiYXJyIiwiJHRleHQiLCJzZWFyY2giLCIkc2VhcmNoIiwibGFuZ3VhZ2UiLCIkdGVybSIsIiRsYW5ndWFnZSIsIiRjYXNlU2Vuc2l0aXZlIiwiJGRpYWNyaXRpY1NlbnNpdGl2ZSIsIiRuZWFyU3BoZXJlIiwiZGlzdGFuY2UiLCIkbWF4RGlzdGFuY2UiLCJkaXN0YW5jZUluS00iLCIkd2l0aGluIiwiJGJveCIsImJveCIsImxlZnQiLCJib3R0b20iLCJyaWdodCIsInRvcCIsIiRnZW9XaXRoaW4iLCIkY2VudGVyU3BoZXJlIiwiY2VudGVyU3BoZXJlIiwiR2VvUG9pbnQiLCJHZW9Qb2ludENvZGVyIiwiaXNWYWxpZEpTT04iLCJfdmFsaWRhdGUiLCJpc05hTiIsIiRwb2x5Z29uIiwicG9seWdvbiIsInBvaW50cyIsImNvb3JkaW5hdGVzIiwiJGdlb0ludGVyc2VjdHMiLCIkcG9pbnQiLCJyZWdleCIsIm9wZXJhdG9yIiwib3B0cyIsIiRvcHRpb25zIiwicmVtb3ZlV2hpdGVTcGFjZSIsImNvbnZlcnRQb2x5Z29uVG9TUUwiLCJjbXAiLCJwZ0NvbXBhcmF0b3IiLCJwb3N0Z3Jlc1ZhbHVlIiwiY2FzdFR5cGUiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIl9jb2xsZWN0aW9uUHJlZml4IiwiY2xpZW50IiwicGdwIiwiX2NsaWVudCIsIl9wZ3AiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwiY3JlYXRlRXhwbGFpbmFibGVRdWVyeSIsImFuYWx5emUiLCJoYW5kbGVTaHV0ZG93biIsIiRwb29sIiwiZW5kIiwiX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMiLCJjb25uIiwibm9uZSIsImNhdGNoIiwiZXJyb3IiLCJjb2RlIiwiY2xhc3NFeGlzdHMiLCJvbmUiLCJhIiwiZXhpc3RzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInNlbGYiLCJ0YXNrIiwidCIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0Iiwic3VibWl0dGVkSW5kZXhlcyIsImV4aXN0aW5nSW5kZXhlcyIsIlByb21pc2UiLCJyZXNvbHZlIiwiX2lkXyIsIl9pZCIsImRlbGV0ZWRJbmRleGVzIiwiaW5zZXJ0ZWRJbmRleGVzIiwiSU5WQUxJRF9RVUVSWSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInR4IiwiY3JlYXRlSW5kZXhlcyIsImRyb3BJbmRleGVzIiwiY3JlYXRlQ2xhc3MiLCJxMSIsImNyZWF0ZVRhYmxlIiwicTIiLCJxMyIsImJhdGNoIiwidGhlbiIsImVyciIsImRhdGEiLCJyZXN1bHQiLCJkZXRhaWwiLCJEVVBMSUNBVEVfVkFMVUUiLCJ2YWx1ZXNBcnJheSIsInBhdHRlcm5zQXJyYXkiLCJhc3NpZ24iLCJfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQiLCJfZW1haWxfdmVyaWZ5X3Rva2VuIiwiX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0IiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsIl9wZXJpc2hhYmxlX3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwicmVsYXRpb25zIiwicGFyc2VUeXBlIiwicXMiLCJqb2luVGFibGUiLCJzY2hlbWFVcGdyYWRlIiwiY29sdW1ucyIsImNvbHVtbl9uYW1lIiwibmV3Q29sdW1ucyIsImZpbHRlciIsIml0ZW0iLCJhZGRGaWVsZElmTm90RXhpc3RzIiwicG9zdGdyZXNUeXBlIiwiYW55IiwicGF0aCIsImRlbGV0ZUNsYXNzIiwib3BlcmF0aW9ucyIsImhlbHBlcnMiLCJkZWxldGVBbGxDbGFzc2VzIiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJyZXN1bHRzIiwiam9pbnMiLCJyZWR1Y2UiLCJjbGFzc2VzIiwicXVlcmllcyIsImRlbGV0ZUZpZWxkcyIsImZpZWxkTmFtZXMiLCJpZHgiLCJnZXRBbGxDbGFzc2VzIiwicm93IiwiZ2V0Q2xhc3MiLCJjcmVhdGVPYmplY3QiLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbHVtbnNBcnJheSIsImdlb1BvaW50cyIsInByb3ZpZGVyIiwicG9wIiwiaW5pdGlhbFZhbHVlcyIsInZhbCIsInRlcm1pbmF0aW9uIiwiZ2VvUG9pbnRzSW5qZWN0cyIsImwiLCJjb2x1bW5zUGF0dGVybiIsImNvbCIsInZhbHVlc1BhdHRlcm4iLCJwcm9taXNlIiwib3BzIiwidW5kZXJseWluZ0Vycm9yIiwiY29uc3RyYWludCIsIm1hdGNoZXMiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsIndoZXJlIiwiT0JKRUNUX05PVF9GT1VORCIsImZpbmRPbmVBbmRVcGRhdGUiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwZGF0ZVBhdHRlcm5zIiwib3JpZ2luYWxVcGRhdGUiLCJkb3ROb3RhdGlvbk9wdGlvbnMiLCJnZW5lcmF0ZSIsImpzb25iIiwibGFzdEtleSIsImZpZWxkTmFtZUluZGV4Iiwic3RyIiwiYW1vdW50Iiwib2JqZWN0cyIsImtleXNUb0luY3JlbWVudCIsImsiLCJpbmNyZW1lbnRQYXR0ZXJucyIsImMiLCJrZXlzVG9EZWxldGUiLCJkZWxldGVQYXR0ZXJucyIsInAiLCJ1cGRhdGVPYmplY3QiLCJleHBlY3RlZFR5cGUiLCJyZWplY3QiLCJ3aGVyZUNsYXVzZSIsInVwc2VydE9uZU9iamVjdCIsImNyZWF0ZVZhbHVlIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImV4cGxhaW4iLCJoYXNMaW1pdCIsImhhc1NraXAiLCJ3aGVyZVBhdHRlcm4iLCJsaW1pdFBhdHRlcm4iLCJza2lwUGF0dGVybiIsInNvcnRQYXR0ZXJuIiwic29ydENvcHkiLCJzb3J0aW5nIiwidHJhbnNmb3JtS2V5IiwibWVtbyIsIm9yaWdpbmFsUXVlcnkiLCJwb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QiLCJ0YXJnZXRDbGFzcyIsInkiLCJ4IiwiY29vcmRzIiwicGFyc2VGbG9hdCIsImNyZWF0ZWRBdCIsInRvSVNPU3RyaW5nIiwidXBkYXRlZEF0IiwiZXhwaXJlc0F0IiwiZW5zdXJlVW5pcXVlbmVzcyIsImNvbnN0cmFpbnROYW1lIiwiY29uc3RyYWludFBhdHRlcm5zIiwibWVzc2FnZSIsInJlYWRQcmVmZXJlbmNlIiwiZXN0aW1hdGUiLCJhcHByb3hpbWF0ZV9yb3dfY291bnQiLCJkaXN0aW5jdCIsImNvbHVtbiIsImlzTmVzdGVkIiwiaXNQb2ludGVyRmllbGQiLCJ0cmFuc2Zvcm1lciIsImNoaWxkIiwiYWdncmVnYXRlIiwicGlwZWxpbmUiLCJoaW50IiwiY291bnRGaWVsZCIsImdyb3VwVmFsdWVzIiwiZ3JvdXBQYXR0ZXJuIiwic3RhZ2UiLCIkZ3JvdXAiLCJncm91cEJ5RmllbGRzIiwiYWxpYXMiLCJzb3VyY2UiLCJvcGVyYXRpb24iLCIkc3VtIiwiJG1heCIsIiRtaW4iLCIkYXZnIiwiJHByb2plY3QiLCIkbWF0Y2giLCIkb3IiLCJjb2xsYXBzZSIsImVsZW1lbnQiLCJtYXRjaFBhdHRlcm5zIiwiJGxpbWl0IiwiJHNraXAiLCIkc29ydCIsIm9yZGVyIiwiZSIsInRyaW0iLCJCb29sZWFuIiwicGFyc2VJbnQiLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwicHJvbWlzZXMiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJhbGwiLCJzcWwiLCJtaXNjIiwianNvbk9iamVjdFNldEtleXMiLCJhcnJheSIsImFkZCIsImFkZFVuaXF1ZSIsInJlbW92ZSIsImNvbnRhaW5zQWxsIiwiY29udGFpbnNBbGxSZWdleCIsImNvbnRhaW5zIiwiZHVyYXRpb24iLCJjb25zb2xlIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZ2V0SW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwidXBkYXRlRXN0aW1hdGVkQ291bnQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiZGVmYXVsdEluZGV4TmFtZSIsImluZGV4TmFtZU9wdGlvbnMiLCJ1bmlxdWUiLCJhciIsImZvdW5kSW5kZXgiLCJwdCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImVuZHNXaXRoIiwicmVwbGFjZSIsInMiLCJzdGFydHNXaXRoIiwibGl0ZXJhbGl6ZVJlZ2V4UGFydCIsImlzU3RhcnRzV2l0aFJlZ2V4IiwiZmlyc3RWYWx1ZXNJc1JlZ2V4Iiwic29tZSIsImNyZWF0ZUxpdGVyYWxSZWdleCIsInJlbWFpbmluZyIsIlJlZ0V4cCIsIm1hdGNoZXIxIiwicmVzdWx0MSIsInByZWZpeCIsIm1hdGNoZXIyIiwicmVzdWx0MiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUNBOztBQUVBOztBQUVBOztBQUNBOztBQWlCQTs7Ozs7Ozs7OztBQWZBLE1BQU1BLGlDQUFpQyxHQUFHLE9BQTFDO0FBQ0EsTUFBTUMsOEJBQThCLEdBQUcsT0FBdkM7QUFDQSxNQUFNQyw0QkFBNEIsR0FBRyxPQUFyQztBQUNBLE1BQU1DLDBCQUEwQixHQUFHLE9BQW5DO0FBQ0EsTUFBTUMsNEJBQTRCLEdBQUcsT0FBckM7QUFDQSxNQUFNQyxpQ0FBaUMsR0FBRyxPQUExQztBQUNBLE1BQU1DLCtCQUErQixHQUFHLE9BQXhDOztBQUNBLE1BQU1DLE1BQU0sR0FBR0MsT0FBTyxDQUFDLGlCQUFELENBQXRC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QUFPLENBQUN4WCxLQUFwQixDQUFmO0FBQ0EsVUFBTWtYLFNBQVMsR0FBR00sT0FBTyxDQUFDLENBQUQsQ0FBekI7QUFFQSxXQUFPWCxtQkFBbUIsQ0FBQ1MsTUFBRCxDQUFuQixHQUE4Qkwsa0JBQWtCLENBQUNDLFNBQUQsQ0FBdkQ7QUFDRCxHQW5CcUMsQ0FxQnRDOzs7QUFDQSxTQUFPUCxDQUFDLENBQ0xELE9BREksQ0FDSSxjQURKLEVBQ29CLElBRHBCLEVBRUpBLE9BRkksQ0FFSSxjQUZKLEVBRW9CLElBRnBCLEVBR0pBLE9BSEksQ0FHSSxNQUhKLEVBR1ksRUFIWixFQUlKQSxPQUpJLENBSUksTUFKSixFQUlZLEVBSlosRUFLSkEsT0FMSSxDQUtJLFNBTEosRUFLZ0IsTUFMaEIsRUFNSkEsT0FOSSxDQU1JLFVBTkosRUFNaUIsTUFOakIsQ0FBUDtBQU9EOztBQUVELElBQUlqUixhQUFhLEdBQUc7QUFDbEJDLEVBQUFBLFdBQVcsQ0FBQ3pJLEtBQUQsRUFBUTtBQUNqQixXQUNFLE9BQU9BLEtBQVAsS0FBaUIsUUFBakIsSUFBNkJBLEtBQUssS0FBSyxJQUF2QyxJQUErQ0EsS0FBSyxDQUFDQyxNQUFOLEtBQWlCLFVBRGxFO0FBR0Q7O0FBTGlCLENBQXBCO2VBUWU0SixzQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICcuL1Bvc3RncmVzQ2xpZW50Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHNxbCBmcm9tICcuL3NxbCc7XG5cbmNvbnN0IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvciA9ICc0MlAwMSc7XG5jb25zdCBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgPSAnNDJQMDcnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciA9ICc0MjcwMSc7XG5jb25zdCBQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvciA9ICc0MjcwMyc7XG5jb25zdCBQb3N0Z3Jlc0R1cGxpY2F0ZU9iamVjdEVycm9yID0gJzQyNzEwJztcbmNvbnN0IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciA9ICcyMzUwNSc7XG5jb25zdCBQb3N0Z3Jlc1RyYW5zYWN0aW9uQWJvcnRlZEVycm9yID0gJzI1UDAyJztcbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uLy4uLy4uL2xvZ2dlcicpO1xuXG5jb25zdCBkZWJ1ZyA9IGZ1bmN0aW9uICguLi5hcmdzOiBhbnkpIHtcbiAgYXJncyA9IFsnUEc6ICcgKyBhcmd1bWVudHNbMF1dLmNvbmNhdChhcmdzLnNsaWNlKDEsIGFyZ3MubGVuZ3RoKSk7XG4gIGNvbnN0IGxvZyA9IGxvZ2dlci5nZXRMb2dnZXIoKTtcbiAgbG9nLmRlYnVnLmFwcGx5KGxvZywgYXJncyk7XG59O1xuXG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCB0eXBlIHsgU2NoZW1hVHlwZSwgUXVlcnlUeXBlLCBRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5cbmNvbnN0IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlID0gKHR5cGUpID0+IHtcbiAgc3dpdGNoICh0eXBlLnR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiAndGltZXN0YW1wIHdpdGggdGltZSB6b25lJztcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdib29sZWFuJztcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIHJldHVybiAnY2hhcigxMCknO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiAncG9pbnQnO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiAnanNvbmInO1xuICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgcmV0dXJuICdwb2x5Z29uJztcbiAgICBjYXNlICdBcnJheSc6XG4gICAgICBpZiAodHlwZS5jb250ZW50cyAmJiB0eXBlLmNvbnRlbnRzLnR5cGUgPT09ICdTdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiAndGV4dFtdJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAnanNvbmInO1xuICAgICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBgbm8gdHlwZSBmb3IgJHtKU09OLnN0cmluZ2lmeSh0eXBlKX0geWV0YDtcbiAgfVxufTtcblxuY29uc3QgUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yID0ge1xuICAkZ3Q6ICc+JyxcbiAgJGx0OiAnPCcsXG4gICRndGU6ICc+PScsXG4gICRsdGU6ICc8PScsXG59O1xuXG5jb25zdCBtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMgPSB7XG4gICRkYXlPZk1vbnRoOiAnREFZJyxcbiAgJGRheU9mV2VlazogJ0RPVycsXG4gICRkYXlPZlllYXI6ICdET1knLFxuICAkaXNvRGF5T2ZXZWVrOiAnSVNPRE9XJyxcbiAgJGlzb1dlZWtZZWFyOiAnSVNPWUVBUicsXG4gICRob3VyOiAnSE9VUicsXG4gICRtaW51dGU6ICdNSU5VVEUnLFxuICAkc2Vjb25kOiAnU0VDT05EJyxcbiAgJG1pbGxpc2Vjb25kOiAnTUlMTElTRUNPTkRTJyxcbiAgJG1vbnRoOiAnTU9OVEgnLFxuICAkd2VlazogJ1dFRUsnLFxuICAkeWVhcjogJ1lFQVInLFxufTtcblxuY29uc3QgdG9Qb3N0Z3Jlc1ZhbHVlID0gKHZhbHVlKSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICByZXR1cm4gdmFsdWUuaXNvO1xuICAgIH1cbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9ICh2YWx1ZSkgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgIHJldHVybiB2YWx1ZS5vYmplY3RJZDtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG4vLyBEdXBsaWNhdGUgZnJvbSB0aGVuIG1vbmdvIGFkYXB0ZXIuLi5cbmNvbnN0IGVtcHR5Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7fSxcbiAgZ2V0OiB7fSxcbiAgY291bnQ6IHt9LFxuICBjcmVhdGU6IHt9LFxuICB1cGRhdGU6IHt9LFxuICBkZWxldGU6IHt9LFxuICBhZGRGaWVsZDoge30sXG4gIHByb3RlY3RlZEZpZWxkczoge30sXG59KTtcblxuY29uc3QgZGVmYXVsdENMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDogeyAnKic6IHRydWUgfSxcbiAgZ2V0OiB7ICcqJzogdHJ1ZSB9LFxuICBjb3VudDogeyAnKic6IHRydWUgfSxcbiAgY3JlYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICB1cGRhdGU6IHsgJyonOiB0cnVlIH0sXG4gIGRlbGV0ZTogeyAnKic6IHRydWUgfSxcbiAgYWRkRmllbGQ6IHsgJyonOiB0cnVlIH0sXG4gIHByb3RlY3RlZEZpZWxkczogeyAnKic6IFtdIH0sXG59KTtcblxuY29uc3QgdG9QYXJzZVNjaGVtYSA9IChzY2hlbWEpID0+IHtcbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICB9XG4gIGlmIChzY2hlbWEuZmllbGRzKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgfVxuICBsZXQgY2xwcyA9IGRlZmF1bHRDTFBTO1xuICBpZiAoc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucykge1xuICAgIGNscHMgPSB7IC4uLmVtcHR5Q0xQUywgLi4uc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyB9O1xuICB9XG4gIGxldCBpbmRleGVzID0ge307XG4gIGlmIChzY2hlbWEuaW5kZXhlcykge1xuICAgIGluZGV4ZXMgPSB7IC4uLnNjaGVtYS5pbmRleGVzIH07XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBjbGFzc05hbWU6IHNjaGVtYS5jbGFzc05hbWUsXG4gICAgZmllbGRzOiBzY2hlbWEuZmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogY2xwcyxcbiAgICBpbmRleGVzLFxuICB9O1xufTtcblxuY29uc3QgdG9Qb3N0Z3Jlc1NjaGVtYSA9IChzY2hlbWEpID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGhhbmRsZURvdEZpZWxkcyA9IChvYmplY3QpID0+IHtcbiAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKChmaWVsZE5hbWUpID0+IHtcbiAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICBjb25zdCBjb21wb25lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBmaXJzdCA9IGNvbXBvbmVudHMuc2hpZnQoKTtcbiAgICAgIG9iamVjdFtmaXJzdF0gPSBvYmplY3RbZmlyc3RdIHx8IHt9O1xuICAgICAgbGV0IGN1cnJlbnRPYmogPSBvYmplY3RbZmlyc3RdO1xuICAgICAgbGV0IG5leHQ7XG4gICAgICBsZXQgdmFsdWUgPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgIGlmICh2YWx1ZSAmJiB2YWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB2YWx1ZSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbmQtYXNzaWduICovXG4gICAgICB3aGlsZSAoKG5leHQgPSBjb21wb25lbnRzLnNoaWZ0KCkpKSB7XG4gICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IGN1cnJlbnRPYmpbbmV4dF0gfHwge307XG4gICAgICAgIGlmIChjb21wb25lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGN1cnJlbnRPYmpbbmV4dF0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBjdXJyZW50T2JqID0gY3VycmVudE9ialtuZXh0XTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMgPSAoZmllbGROYW1lKSA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKS5tYXAoKGNtcHQsIGluZGV4KSA9PiB7XG4gICAgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICByZXR1cm4gYFwiJHtjbXB0fVwiYDtcbiAgICB9XG4gICAgcmV0dXJuIGAnJHtjbXB0fSdgO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkID0gKGZpZWxkTmFtZSkgPT4ge1xuICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA9PT0gLTEpIHtcbiAgICByZXR1cm4gYFwiJHtmaWVsZE5hbWV9XCJgO1xuICB9XG4gIGNvbnN0IGNvbXBvbmVudHMgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpO1xuICBsZXQgbmFtZSA9IGNvbXBvbmVudHMuc2xpY2UoMCwgY29tcG9uZW50cy5sZW5ndGggLSAxKS5qb2luKCctPicpO1xuICBuYW1lICs9ICctPj4nICsgY29tcG9uZW50c1tjb21wb25lbnRzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4gbmFtZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkID0gKGZpZWxkTmFtZSkgPT4ge1xuICBpZiAodHlwZW9mIGZpZWxkTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gZmllbGROYW1lO1xuICB9XG4gIGlmIChmaWVsZE5hbWUgPT09ICckX2NyZWF0ZWRfYXQnKSB7XG4gICAgcmV0dXJuICdjcmVhdGVkQXQnO1xuICB9XG4gIGlmIChmaWVsZE5hbWUgPT09ICckX3VwZGF0ZWRfYXQnKSB7XG4gICAgcmV0dXJuICd1cGRhdGVkQXQnO1xuICB9XG4gIHJldHVybiBmaWVsZE5hbWUuc3Vic3RyKDEpO1xufTtcblxuY29uc3QgdmFsaWRhdGVLZXlzID0gKG9iamVjdCkgPT4ge1xuICBpZiAodHlwZW9mIG9iamVjdCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB2YWxpZGF0ZUtleXMob2JqZWN0W2tleV0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoa2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFJldHVybnMgdGhlIGxpc3Qgb2Ygam9pbiB0YWJsZXMgb24gYSBzY2hlbWFcbmNvbnN0IGpvaW5UYWJsZXNGb3JTY2hlbWEgPSAoc2NoZW1hKSA9PiB7XG4gIGNvbnN0IGxpc3QgPSBbXTtcbiAgaWYgKHNjaGVtYSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goKGZpZWxkKSA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBsaXN0LnB1c2goYF9Kb2luOiR7ZmllbGR9OiR7c2NoZW1hLmNsYXNzTmFtZX1gKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gbGlzdDtcbn07XG5cbmludGVyZmFjZSBXaGVyZUNsYXVzZSB7XG4gIHBhdHRlcm46IHN0cmluZztcbiAgdmFsdWVzOiBBcnJheTxhbnk+O1xuICBzb3J0czogQXJyYXk8YW55Pjtcbn1cblxuY29uc3QgYnVpbGRXaGVyZUNsYXVzZSA9ICh7XG4gIHNjaGVtYSxcbiAgcXVlcnksXG4gIGluZGV4LFxuICBjYXNlSW5zZW5zaXRpdmUsXG59KTogV2hlcmVDbGF1c2UgPT4ge1xuICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICBsZXQgdmFsdWVzID0gW107XG4gIGNvbnN0IHNvcnRzID0gW107XG5cbiAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGluaXRpYWxQYXR0ZXJuc0xlbmd0aCA9IHBhdHRlcm5zLmxlbmd0aDtcbiAgICBjb25zdCBmaWVsZFZhbHVlID0gcXVlcnlbZmllbGROYW1lXTtcblxuICAgIC8vIG5vdGhpbmcgaW4gdGhlIHNjaGVtYSwgaXQncyBnb25uYSBibG93IHVwXG4gICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgIC8vIGFzIGl0IHdvbid0IGV4aXN0XG4gICAgICBpZiAoZmllbGRWYWx1ZSAmJiBmaWVsZFZhbHVlLiRleGlzdHMgPT09IGZhbHNlKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgLy8gVE9ETzogSGFuZGxlIHF1ZXJ5aW5nIGJ5IF9hdXRoX2RhdGFfcHJvdmlkZXIsIGF1dGhEYXRhIGlzIHN0b3JlZCBpbiBhdXRoRGF0YSBmaWVsZFxuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSAmJlxuICAgICAgKGZpZWxkTmFtZSA9PT0gJ3VzZXJuYW1lJyB8fCBmaWVsZE5hbWUgPT09ICdlbWFpbCcpXG4gICAgKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGBMT1dFUigkJHtpbmRleH06bmFtZSkgPSBMT1dFUigkJHtpbmRleCArIDF9KWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgIGxldCBuYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgIGlmIChmaWVsZFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgSVMgTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChuYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgICBuYW1lID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06cmF3KTo6anNvbmIgQD4gJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChuYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRpbikpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS4kcmVnZXgpIHtcbiAgICAgICAgICAvLyBIYW5kbGUgbGF0ZXJcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3ID0gJCR7aW5kZXggKyAxfTo6dGV4dGApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgZmllbGRWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaW5kZXggKz0gMTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAvLyBDYW4ndCBjYXN0IGJvb2xlYW4gdG8gZG91YmxlIHByZWNpc2lvblxuICAgICAgaWYgKFxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdOdW1iZXInXG4gICAgICApIHtcbiAgICAgICAgLy8gU2hvdWxkIGFsd2F5cyByZXR1cm4gemVybyByZXN1bHRzXG4gICAgICAgIGNvbnN0IE1BWF9JTlRfUExVU19PTkUgPSA5MjIzMzcyMDM2ODU0Nzc1ODA4O1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIE1BWF9JTlRfUExVU19PTkUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChbJyRvcicsICckbm9yJywgJyRhbmQnXS5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICBjb25zdCBjbGF1c2VzID0gW107XG4gICAgICBjb25zdCBjbGF1c2VWYWx1ZXMgPSBbXTtcbiAgICAgIGZpZWxkVmFsdWUuZm9yRWFjaCgoc3ViUXVlcnkpID0+IHtcbiAgICAgICAgY29uc3QgY2xhdXNlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIHF1ZXJ5OiBzdWJRdWVyeSxcbiAgICAgICAgICBpbmRleCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2xhdXNlLnBhdHRlcm4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsYXVzZXMucHVzaChjbGF1c2UucGF0dGVybik7XG4gICAgICAgICAgY2xhdXNlVmFsdWVzLnB1c2goLi4uY2xhdXNlLnZhbHVlcyk7XG4gICAgICAgICAgaW5kZXggKz0gY2xhdXNlLnZhbHVlcy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvck9yQW5kID0gZmllbGROYW1lID09PSAnJGFuZCcgPyAnIEFORCAnIDogJyBPUiAnO1xuICAgICAgY29uc3Qgbm90ID0gZmllbGROYW1lID09PSAnJG5vcicgPyAnIE5PVCAnIDogJyc7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSgke2NsYXVzZXMuam9pbihvck9yQW5kKX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaCguLi5jbGF1c2VWYWx1ZXMpO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuJG5lID0gSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWUuJG5lXSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYE5PVCBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGlmIG5vdCBudWxsLCB3ZSBuZWVkIHRvIG1hbnVhbGx5IGV4Y2x1ZGUgbnVsbFxuICAgICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgICAgICAgIH0pIE9SICQke2luZGV4fTpuYW1lIElTIE5VTEwpYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPD4gJCR7aW5kZXh9IE9SICR7Y29uc3RyYWludEZpZWxkTmFtZX0gSVMgTlVMTClgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRuZTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlKTtcbiAgICAgICAgaW5kZXggKz0gMztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFRPRE86IHN1cHBvcnQgYXJyYXlzXG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS4kbmUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZmllbGRWYWx1ZS4kZXEgIT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGVxID09PSBudWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSA9ICQke2luZGV4Kyt9YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBpc0luT3JOaW4gPVxuICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgfHwgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRuaW4pO1xuICAgIGlmIChcbiAgICAgIEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pICYmXG4gICAgICBpc0FycmF5RmllbGQgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cyAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzLnR5cGUgPT09ICdTdHJpbmcnXG4gICAgKSB7XG4gICAgICBjb25zdCBpblBhdHRlcm5zID0gW107XG4gICAgICBsZXQgYWxsb3dOdWxsID0gZmFsc2U7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgZmllbGRWYWx1ZS4kaW4uZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICBpZiAobGlzdEVsZW0gPT09IG51bGwpIHtcbiAgICAgICAgICBhbGxvd051bGwgPSB0cnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleCAtIChhbGxvd051bGwgPyAxIDogMCl9YCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKGFsbG93TnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgSVMgTlVMTCBPUiAkJHtpbmRleH06bmFtZSAmJiBBUlJBWVske2luUGF0dGVybnMuam9pbigpfV0pYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgIH0gZWxzZSBpZiAoaXNJbk9yTmluKSB7XG4gICAgICB2YXIgY3JlYXRlQ29uc3RyYWludCA9IChiYXNlQXJyYXksIG5vdEluKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vdCA9IG5vdEluID8gJyBOT1QgJyA6ICcnO1xuICAgICAgICBpZiAoYmFzZUFycmF5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICBgJHtub3R9IGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGJhc2VBcnJheSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSGFuZGxlIE5lc3RlZCBEb3QgTm90YXRpb24gQWJvdmVcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIGJhc2VBcnJheS5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGlmIChsaXN0RWxlbSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4fWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7bm90fSBJTiAoJHtpblBhdHRlcm5zLmpvaW4oKX0pYCk7XG4gICAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghbm90SW4pIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBIYW5kbGUgZW1wdHkgYXJyYXlcbiAgICAgICAgICBpZiAobm90SW4pIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAxJyk7IC8vIFJldHVybiBhbGwgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAyJyk7IC8vIFJldHVybiBubyB2YWx1ZXNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChcbiAgICAgICAgICBfLmZsYXRNYXAoZmllbGRWYWx1ZS4kaW4sIChlbHQpID0+IGVsdCksXG4gICAgICAgICAgZmFsc2VcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZFZhbHVlLiRuaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChcbiAgICAgICAgICBfLmZsYXRNYXAoZmllbGRWYWx1ZS4kbmluLCAoZWx0KSA9PiBlbHQpLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRpbiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGluIHZhbHVlJyk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkbmluIHZhbHVlJyk7XG4gICAgfVxuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSAmJiBpc0FycmF5RmllbGQpIHtcbiAgICAgIGlmIChpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgaWYgKCFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgZmllbGRWYWx1ZS4kYWxsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRWYWx1ZS4kYWxsLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKGZpZWxkVmFsdWUuJGFsbFtpXS4kcmVnZXgpO1xuICAgICAgICAgIGZpZWxkVmFsdWUuJGFsbFtpXSA9IHZhbHVlLnN1YnN0cmluZygxKSArICclJztcbiAgICAgICAgfVxuICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGBhcnJheV9jb250YWluc19hbGxfcmVnZXgoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYGFycmF5X2NvbnRhaW5zX2FsbCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRhbGwpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRhbGwubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGFsbFswXS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kZXhpc3RzKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICB9XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaW5kZXggKz0gMTtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kY29udGFpbmVkQnkpIHtcbiAgICAgIGNvbnN0IGFyciA9IGZpZWxkVmFsdWUuJGNvbnRhaW5lZEJ5O1xuICAgICAgaWYgKCEoYXJyIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkY29udGFpbmVkQnk6IHNob3VsZCBiZSBhbiBhcnJheWBcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPEAgJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoYXJyKSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR0ZXh0KSB7XG4gICAgICBjb25zdCBzZWFyY2ggPSBmaWVsZFZhbHVlLiR0ZXh0LiRzZWFyY2g7XG4gICAgICBsZXQgbGFuZ3VhZ2UgPSAnZW5nbGlzaCc7XG4gICAgICBpZiAodHlwZW9mIHNlYXJjaCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFzZWFyY2guJHRlcm0gfHwgdHlwZW9mIHNlYXJjaC4kdGVybSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2BcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGxhbmd1YWdlICYmIHR5cGVvZiBzZWFyY2guJGxhbmd1YWdlICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRsYW5ndWFnZSwgc2hvdWxkIGJlIHN0cmluZ2BcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRsYW5ndWFnZSkge1xuICAgICAgICBsYW5ndWFnZSA9IHNlYXJjaC4kbGFuZ3VhZ2U7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICYmIHR5cGVvZiBzZWFyY2guJGNhc2VTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRjYXNlU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUgbm90IHN1cHBvcnRlZCwgcGxlYXNlIHVzZSAkcmVnZXggb3IgY3JlYXRlIGEgc2VwYXJhdGUgbG93ZXIgY2FzZSBjb2x1bW4uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAmJlxuICAgICAgICB0eXBlb2Ygc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlID09PSBmYWxzZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRkaWFjcml0aWNTZW5zaXRpdmUgLSBmYWxzZSBub3Qgc3VwcG9ydGVkLCBpbnN0YWxsIFBvc3RncmVzIFVuYWNjZW50IEV4dGVuc2lvbmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGB0b190c3ZlY3RvcigkJHtpbmRleH0sICQke2luZGV4ICsgMX06bmFtZSkgQEAgdG9fdHNxdWVyeSgkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSwgJCR7aW5kZXggKyAzfSlgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2gobGFuZ3VhZ2UsIGZpZWxkTmFtZSwgbGFuZ3VhZ2UsIHNlYXJjaC4kdGVybSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZWFyU3BoZXJlKSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lYXJTcGhlcmU7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGZpZWxkVmFsdWUuJG1heERpc3RhbmNlO1xuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgc29ydHMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgQVNDYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSwgZGlzdGFuY2VJbktNKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHdpdGhpbiAmJiBmaWVsZFZhbHVlLiR3aXRoaW4uJGJveCkge1xuICAgICAgY29uc3QgYm94ID0gZmllbGRWYWx1ZS4kd2l0aGluLiRib3g7XG4gICAgICBjb25zdCBsZWZ0ID0gYm94WzBdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IGJvdHRvbSA9IGJveFswXS5sYXRpdHVkZTtcbiAgICAgIGNvbnN0IHJpZ2h0ID0gYm94WzFdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IHRvcCA9IGJveFsxXS5sYXRpdHVkZTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OmJveGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCgke2xlZnR9LCAke2JvdHRvbX0pLCAoJHtyaWdodH0sICR7dG9wfSkpYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRjZW50ZXJTcGhlcmUpIHtcbiAgICAgIGNvbnN0IGNlbnRlclNwaGVyZSA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlO1xuICAgICAgaWYgKCEoY2VudGVyU3BoZXJlIGluc3RhbmNlb2YgQXJyYXkpIHx8IGNlbnRlclNwaGVyZS5sZW5ndGggPCAyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIHNob3VsZCBiZSBhbiBhcnJheSBvZiBQYXJzZS5HZW9Qb2ludCBhbmQgZGlzdGFuY2UnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBHZXQgcG9pbnQsIGNvbnZlcnQgdG8gZ2VvIHBvaW50IGlmIG5lY2Vzc2FyeSBhbmQgdmFsaWRhdGVcbiAgICAgIGxldCBwb2ludCA9IGNlbnRlclNwaGVyZVswXTtcbiAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICBwb2ludCA9IG5ldyBQYXJzZS5HZW9Qb2ludChwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgfSBlbHNlIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZ2VvIHBvaW50IGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAvLyBHZXQgZGlzdGFuY2UgYW5kIHZhbGlkYXRlXG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGNlbnRlclNwaGVyZVsxXTtcbiAgICAgIGlmIChpc05hTihkaXN0YW5jZSkgfHwgZGlzdGFuY2UgPCAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGRpc3RhbmNlIGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBjb25zdCBkaXN0YW5jZUluS00gPSBkaXN0YW5jZSAqIDYzNzEgKiAxMDAwO1xuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uKSB7XG4gICAgICBjb25zdCBwb2x5Z29uID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uO1xuICAgICAgbGV0IHBvaW50cztcbiAgICAgIGlmICh0eXBlb2YgcG9seWdvbiA9PT0gJ29iamVjdCcgJiYgcG9seWdvbi5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBpZiAoIXBvbHlnb24uY29vcmRpbmF0ZXMgfHwgcG9seWdvbi5jb29yZGluYXRlcy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyBQb2x5Z29uLmNvb3JkaW5hdGVzIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgbG9uL2xhdCBwYWlycydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb24uY29vcmRpbmF0ZXM7XG4gICAgICB9IGVsc2UgaWYgKHBvbHlnb24gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIEdlb1BvaW50cydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb247XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIFwiYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBiZSBQb2x5Z29uIG9iamVjdCBvciBBcnJheSBvZiBQYXJzZS5HZW9Qb2ludCdzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBvaW50cyA9IHBvaW50c1xuICAgICAgICAubWFwKChwb2ludCkgPT4ge1xuICAgICAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICAgICAgICByZXR1cm4gYCgke3BvaW50WzBdfSwgJHtwb2ludFsxXX0pYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHR5cGVvZiBwb2ludCAhPT0gJ29iamVjdCcgfHwgcG9pbnQuX190eXBlICE9PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCgke3BvaW50LmxvbmdpdHVkZX0sICR7cG9pbnQubGF0aXR1ZGV9KWA7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCcsICcpO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9pbnQgPEAgJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnRzfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzICYmIGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMuJHBvaW50KSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMuJHBvaW50O1xuICAgICAgaWYgKHR5cGVvZiBwb2ludCAhPT0gJ29iamVjdCcgfHwgcG9pbnQuX190eXBlICE9PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvSW50ZXJzZWN0IHZhbHVlOyAkcG9pbnQgc2hvdWxkIGJlIEdlb1BvaW50J1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvbHlnb24gQD4gJCR7aW5kZXggKyAxfTo6cG9pbnRgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50LmxvbmdpdHVkZX0sICR7cG9pbnQubGF0aXR1ZGV9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kcmVnZXgpIHtcbiAgICAgIGxldCByZWdleCA9IGZpZWxkVmFsdWUuJHJlZ2V4O1xuICAgICAgbGV0IG9wZXJhdG9yID0gJ34nO1xuICAgICAgY29uc3Qgb3B0cyA9IGZpZWxkVmFsdWUuJG9wdGlvbnM7XG4gICAgICBpZiAob3B0cykge1xuICAgICAgICBpZiAob3B0cy5pbmRleE9mKCdpJykgPj0gMCkge1xuICAgICAgICAgIG9wZXJhdG9yID0gJ34qJztcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0cy5pbmRleE9mKCd4JykgPj0gMCkge1xuICAgICAgICAgIHJlZ2V4ID0gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICByZWdleCA9IHByb2Nlc3NSZWdleFBhdHRlcm4ocmVnZXgpO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3ICR7b3BlcmF0b3J9ICckJHtpbmRleCArIDF9OnJhdydgKTtcbiAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIHJlZ2V4KTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWVdKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuaXNvKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSB+PSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICBpbmRleCArPSAzO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwoZmllbGRWYWx1ZS5jb29yZGluYXRlcyk7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSB+PSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKChjbXApID0+IHtcbiAgICAgIGlmIChmaWVsZFZhbHVlW2NtcF0gfHwgZmllbGRWYWx1ZVtjbXBdID09PSAwKSB7XG4gICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICBjb25zdCBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWVbY21wXSk7XG4gICAgICAgIGxldCBjb25zdHJhaW50RmllbGROYW1lO1xuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgbGV0IGNhc3RUeXBlO1xuICAgICAgICAgIHN3aXRjaCAodHlwZW9mIHBvc3RncmVzVmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICAgIGNhc3RUeXBlID0gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgICAgICBjYXN0VHlwZSA9ICdib29sZWFuJztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICBjYXN0VHlwZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3RyYWludEZpZWxkTmFtZSA9IGNhc3RUeXBlXG4gICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBgJCR7aW5kZXgrK306bmFtZWA7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgfVxuICAgICAgICB2YWx1ZXMucHVzaChwb3N0Z3Jlc1ZhbHVlKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXgrK31gKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChpbml0aWFsUGF0dGVybnNMZW5ndGggPT09IHBhdHRlcm5zLmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgUG9zdGdyZXMgZG9lc24ndCBzdXBwb3J0IHRoaXMgcXVlcnkgdHlwZSB5ZXQgJHtKU09OLnN0cmluZ2lmeShcbiAgICAgICAgICBmaWVsZFZhbHVlXG4gICAgICAgICl9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgdmFsdWVzID0gdmFsdWVzLm1hcCh0cmFuc2Zvcm1WYWx1ZSk7XG4gIHJldHVybiB7IHBhdHRlcm46IHBhdHRlcm5zLmpvaW4oJyBBTkQgJyksIHZhbHVlcywgc29ydHMgfTtcbn07XG5cbmV4cG9ydCBjbGFzcyBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICBjYW5Tb3J0T25Kb2luVGFibGVzOiBib29sZWFuO1xuXG4gIC8vIFByaXZhdGVcbiAgX2NvbGxlY3Rpb25QcmVmaXg6IHN0cmluZztcbiAgX2NsaWVudDogYW55O1xuICBfcGdwOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoeyB1cmksIGNvbGxlY3Rpb25QcmVmaXggPSAnJywgZGF0YWJhc2VPcHRpb25zIH06IGFueSkge1xuICAgIHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggPSBjb2xsZWN0aW9uUHJlZml4O1xuICAgIGNvbnN0IHsgY2xpZW50LCBwZ3AgfSA9IGNyZWF0ZUNsaWVudCh1cmksIGRhdGFiYXNlT3B0aW9ucyk7XG4gICAgdGhpcy5fY2xpZW50ID0gY2xpZW50O1xuICAgIHRoaXMuX3BncCA9IHBncDtcbiAgICB0aGlzLmNhblNvcnRPbkpvaW5UYWJsZXMgPSBmYWxzZTtcbiAgfVxuXG4gIC8vTm90ZSB0aGF0IGFuYWx5emU9dHJ1ZSB3aWxsIHJ1biB0aGUgcXVlcnksIGV4ZWN1dGluZyBJTlNFUlRTLCBERUxFVEVTLCBldGMuXG4gIGNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkocXVlcnk6IHN0cmluZywgYW5hbHl6ZTogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgaWYgKGFuYWx5emUpIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoQU5BTFlaRSwgRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuICdFWFBMQUlOIChGT1JNQVQgSlNPTikgJyArIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGlmICghdGhpcy5fY2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuX2NsaWVudC4kcG9vbC5lbmQoKTtcbiAgfVxuXG4gIGFzeW5jIF9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBhd2FpdCBjb25uXG4gICAgICAubm9uZShcbiAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIFwiX1NDSEVNQVwiICggXCJjbGFzc05hbWVcIiB2YXJDaGFyKDEyMCksIFwic2NoZW1hXCIganNvbmIsIFwiaXNQYXJzZUNsYXNzXCIgYm9vbCwgUFJJTUFSWSBLRVkgKFwiY2xhc3NOYW1lXCIpICknXG4gICAgICApXG4gICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgfHxcbiAgICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgfHxcbiAgICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZU9iamVjdEVycm9yXG4gICAgICAgICkge1xuICAgICAgICAgIC8vIFRhYmxlIGFscmVhZHkgZXhpc3RzLCBtdXN0IGhhdmUgYmVlbiBjcmVhdGVkIGJ5IGEgZGlmZmVyZW50IHJlcXVlc3QuIElnbm9yZSBlcnJvci5cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjbGFzc0V4aXN0cyhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50Lm9uZShcbiAgICAgICdTRUxFQ1QgRVhJU1RTIChTRUxFQ1QgMSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXMgV0hFUkUgdGFibGVfbmFtZSA9ICQxKScsXG4gICAgICBbbmFtZV0sXG4gICAgICAoYSkgPT4gYS5leGlzdHNcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBDTFBzOiBhbnkpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudGFzaygnc2V0LWNsYXNzLWxldmVsLXBlcm1pc3Npb25zJywgYXN5bmMgKHQpID0+IHtcbiAgICAgIGF3YWl0IHNlbGYuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHModCk7XG4gICAgICBjb25zdCB2YWx1ZXMgPSBbXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgJ3NjaGVtYScsXG4gICAgICAgICdjbGFzc0xldmVsUGVybWlzc2lvbnMnLFxuICAgICAgICBKU09OLnN0cmluZ2lmeShDTFBzKSxcbiAgICAgIF07XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgIGBVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlc1xuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEluZGV4ZXM6IGFueSxcbiAgICBleGlzdGluZ0luZGV4ZXM6IGFueSA9IHt9LFxuICAgIGZpZWxkczogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGlmIChzdWJtaXR0ZWRJbmRleGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nSW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgICBleGlzdGluZ0luZGV4ZXMgPSB7IF9pZF86IHsgX2lkOiAxIH0gfTtcbiAgICB9XG4gICAgY29uc3QgZGVsZXRlZEluZGV4ZXMgPSBbXTtcbiAgICBjb25zdCBpbnNlcnRlZEluZGV4ZXMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRJbmRleGVzKS5mb3JFYWNoKChuYW1lKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEluZGV4ZXNbbmFtZV07XG4gICAgICBpZiAoZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgZGVsZXRlZEluZGV4ZXMucHVzaChuYW1lKTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nSW5kZXhlc1tuYW1lXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGZpZWxkKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGtleSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCBjb25uLnR4KCdzZXQtaW5kZXhlcy13aXRoLXNjaGVtYS1mb3JtYXQnLCBhc3luYyAodCkgPT4ge1xuICAgICAgaWYgKGluc2VydGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGF3YWl0IHNlbGYuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcywgdCk7XG4gICAgICB9XG4gICAgICBpZiAoZGVsZXRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmRyb3BJbmRleGVzKGNsYXNzTmFtZSwgZGVsZXRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgYXdhaXQgc2VsZi5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyh0KTtcbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgJDI6bmFtZSA9IGpzb25fb2JqZWN0X3NldF9rZXkoJDI6bmFtZSwgJDM6OnRleHQsICQ0Ojpqc29uYikgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxJyxcbiAgICAgICAgW2NsYXNzTmFtZSwgJ3NjaGVtYScsICdpbmRleGVzJywgSlNPTi5zdHJpbmdpZnkoZXhpc3RpbmdJbmRleGVzKV1cbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiA/YW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIHJldHVybiBjb25uXG4gICAgICAudHgoJ2NyZWF0ZS1jbGFzcycsIGFzeW5jICh0KSA9PiB7XG4gICAgICAgIGNvbnN0IHExID0gdGhpcy5jcmVhdGVUYWJsZShjbGFzc05hbWUsIHNjaGVtYSwgdCk7XG4gICAgICAgIGNvbnN0IHEyID0gdC5ub25lKFxuICAgICAgICAgICdJTlNFUlQgSU5UTyBcIl9TQ0hFTUFcIiAoXCJjbGFzc05hbWVcIiwgXCJzY2hlbWFcIiwgXCJpc1BhcnNlQ2xhc3NcIikgVkFMVUVTICgkPGNsYXNzTmFtZT4sICQ8c2NoZW1hPiwgdHJ1ZSknLFxuICAgICAgICAgIHsgY2xhc3NOYW1lLCBzY2hlbWEgfVxuICAgICAgICApO1xuICAgICAgICBjb25zdCBxMyA9IHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIHNjaGVtYS5pbmRleGVzLFxuICAgICAgICAgIHt9LFxuICAgICAgICAgIHNjaGVtYS5maWVsZHMsXG4gICAgICAgICAgdFxuICAgICAgICApO1xuICAgICAgICAvLyBUT0RPOiBUaGUgdGVzdCBzaG91bGQgbm90IHZlcmlmeSB0aGUgcmV0dXJuZWQgdmFsdWUsIGFuZCB0aGVuXG4gICAgICAgIC8vICB0aGUgbWV0aG9kIGNhbiBiZSBzaW1wbGlmaWVkLCB0byBhdm9pZCByZXR1cm5pbmcgdXNlbGVzcyBzdHVmZi5cbiAgICAgICAgcmV0dXJuIHQuYmF0Y2goW3ExLCBxMiwgcTNdKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0b1BhcnNlU2NoZW1hKHNjaGVtYSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgaWYgKGVyci5kYXRhWzBdLnJlc3VsdC5jb2RlID09PSBQb3N0Z3Jlc1RyYW5zYWN0aW9uQWJvcnRlZEVycm9yKSB7XG4gICAgICAgICAgZXJyID0gZXJyLmRhdGFbMV0ucmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICBlcnIuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yICYmXG4gICAgICAgICAgZXJyLmRldGFpbC5pbmNsdWRlcyhjbGFzc05hbWUpXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBKdXN0IGNyZWF0ZSBhIHRhYmxlLCBkbyBub3QgaW5zZXJ0IGluIHNjaGVtYVxuICBhc3luYyBjcmVhdGVUYWJsZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgZGVidWcoJ2NyZWF0ZVRhYmxlJywgY2xhc3NOYW1lLCBzY2hlbWEpO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgY29uc3QgcGF0dGVybnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5hc3NpZ24oe30sIHNjaGVtYS5maWVsZHMpO1xuICAgIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIGZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fZmFpbGVkX2xvZ2luX2NvdW50ID0geyB0eXBlOiAnTnVtYmVyJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fcGFzc3dvcmRfaGlzdG9yeSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICAgIH1cbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIGNvbnN0IHJlbGF0aW9ucyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKGZpZWxkcykuZm9yRWFjaCgoZmllbGROYW1lKSA9PiB7XG4gICAgICBjb25zdCBwYXJzZVR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgIC8vIFNraXAgd2hlbiBpdCdzIGEgcmVsYXRpb25cbiAgICAgIC8vIFdlJ2xsIGNyZWF0ZSB0aGUgdGFibGVzIGxhdGVyXG4gICAgICBpZiAocGFyc2VUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmVsYXRpb25zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHBhcnNlVHlwZS5jb250ZW50cyA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIH1cbiAgICAgIHZhbHVlc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2gocGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUocGFyc2VUeXBlKSk7XG4gICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYCQke2luZGV4fTpuYW1lICQke2luZGV4ICsgMX06cmF3YCk7XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgUFJJTUFSWSBLRVkgKCQke2luZGV4fTpuYW1lKWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDI7XG4gICAgfSk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDE6bmFtZSAoJHtwYXR0ZXJuc0FycmF5LmpvaW4oKX0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi52YWx1ZXNBcnJheV07XG5cbiAgICBkZWJ1ZyhxcywgdmFsdWVzKTtcbiAgICByZXR1cm4gY29ubi50YXNrKCdjcmVhdGUtdGFibGUnLCBhc3luYyAodCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgc2VsZi5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyh0KTtcbiAgICAgICAgYXdhaXQgdC5ub25lKHFzLCB2YWx1ZXMpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIEVMU0U6IFRhYmxlIGFscmVhZHkgZXhpc3RzLCBtdXN0IGhhdmUgYmVlbiBjcmVhdGVkIGJ5IGEgZGlmZmVyZW50IHJlcXVlc3QuIElnbm9yZSB0aGUgZXJyb3IuXG4gICAgICB9XG4gICAgICBhd2FpdCB0LnR4KCdjcmVhdGUtdGFibGUtdHgnLCAodHgpID0+IHtcbiAgICAgICAgcmV0dXJuIHR4LmJhdGNoKFxuICAgICAgICAgIHJlbGF0aW9ucy5tYXAoKGZpZWxkTmFtZSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHR4Lm5vbmUoXG4gICAgICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzY2hlbWFVcGdyYWRlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGRlYnVnKCdzY2hlbWFVcGdyYWRlJywgeyBjbGFzc05hbWUsIHNjaGVtYSB9KTtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBhd2FpdCBjb25uLnR4KCdzY2hlbWEtdXBncmFkZScsIGFzeW5jICh0KSA9PiB7XG4gICAgICBjb25zdCBjb2x1bW5zID0gYXdhaXQgdC5tYXAoXG4gICAgICAgICdTRUxFQ1QgY29sdW1uX25hbWUgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucyBXSEVSRSB0YWJsZV9uYW1lID0gJDxjbGFzc05hbWU+JyxcbiAgICAgICAgeyBjbGFzc05hbWUgfSxcbiAgICAgICAgKGEpID0+IGEuY29sdW1uX25hbWVcbiAgICAgICk7XG4gICAgICBjb25zdCBuZXdDb2x1bW5zID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcigoaXRlbSkgPT4gY29sdW1ucy5pbmRleE9mKGl0ZW0pID09PSAtMSlcbiAgICAgICAgLm1hcCgoZmllbGROYW1lKSA9PlxuICAgICAgICAgIHNlbGYuYWRkRmllbGRJZk5vdEV4aXN0cyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSxcbiAgICAgICAgICAgIHRcbiAgICAgICAgICApXG4gICAgICAgICk7XG5cbiAgICAgIGF3YWl0IHQuYmF0Y2gobmV3Q29sdW1ucyk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBhZGRGaWVsZElmTm90RXhpc3RzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgIHR5cGU6IGFueSxcbiAgICBjb25uOiBhbnlcbiAgKSB7XG4gICAgLy8gVE9ETzogTXVzdCBiZSByZXZpc2VkIGZvciBpbnZhbGlkIGxvZ2ljLi4uXG4gICAgZGVidWcoJ2FkZEZpZWxkSWZOb3RFeGlzdHMnLCB7IGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlIH0pO1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBhd2FpdCBjb25uLnR4KCdhZGQtZmllbGQtaWYtbm90LWV4aXN0cycsIGFzeW5jICh0KSA9PiB7XG4gICAgICBpZiAodHlwZS50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICAgJ0FMVEVSIFRBQkxFICQ8Y2xhc3NOYW1lOm5hbWU+IEFERCBDT0xVTU4gJDxmaWVsZE5hbWU6bmFtZT4gJDxwb3N0Z3Jlc1R5cGU6cmF3PicsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgICBwb3N0Z3Jlc1R5cGU6IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHR5cGUpLFxuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgcmV0dXJuIHNlbGYuY3JlYXRlQ2xhc3MoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgeyBmaWVsZHM6IHsgW2ZpZWxkTmFtZV06IHR5cGUgfSB9LFxuICAgICAgICAgICAgICB0XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIENvbHVtbiBhbHJlYWR5IGV4aXN0cywgY3JlYXRlZCBieSBvdGhlciByZXF1ZXN0LiBDYXJyeSBvbiB0byBzZWUgaWYgaXQncyB0aGUgcmlnaHQgdHlwZS5cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgeyBqb2luVGFibGU6IGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCB9XG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHQuYW55KFxuICAgICAgICAnU0VMRUNUIFwic2NoZW1hXCIgRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+IGFuZCAoXCJzY2hlbWFcIjo6anNvbi0+XFwnZmllbGRzXFwnLT4kPGZpZWxkTmFtZT4pIGlzIG5vdCBudWxsJyxcbiAgICAgICAgeyBjbGFzc05hbWUsIGZpZWxkTmFtZSB9XG4gICAgICApO1xuXG4gICAgICBpZiAocmVzdWx0WzBdKSB7XG4gICAgICAgIHRocm93ICdBdHRlbXB0ZWQgdG8gYWRkIGEgZmllbGQgdGhhdCBhbHJlYWR5IGV4aXN0cyc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBwYXRoID0gYHtmaWVsZHMsJHtmaWVsZE5hbWV9fWA7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICAgIHsgcGF0aCwgdHlwZSwgY2xhc3NOYW1lIH1cbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIERyb3BzIGEgY29sbGVjdGlvbi4gUmVzb2x2ZXMgd2l0aCB0cnVlIGlmIGl0IHdhcyBhIFBhcnNlIFNjaGVtYSAoZWcuIF9Vc2VyLCBDdXN0b20sIGV0Yy4pXG4gIC8vIGFuZCByZXNvbHZlcyB3aXRoIGZhbHNlIGlmIGl0IHdhc24ndCAoZWcuIGEgam9pbiB0YWJsZSkuIFJlamVjdHMgaWYgZGVsZXRpb24gd2FzIGltcG9zc2libGUuXG4gIGFzeW5jIGRlbGV0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgb3BlcmF0aW9ucyA9IFtcbiAgICAgIHsgcXVlcnk6IGBEUk9QIFRBQkxFIElGIEVYSVNUUyAkMTpuYW1lYCwgdmFsdWVzOiBbY2xhc3NOYW1lXSB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTogYERFTEVURSBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlczogW2NsYXNzTmFtZV0sXG4gICAgICB9LFxuICAgIF07XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLnR4KCh0KSA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KG9wZXJhdGlvbnMpKSlcbiAgICAgIC50aGVuKCgpID0+IGNsYXNzTmFtZS5pbmRleE9mKCdfSm9pbjonKSAhPSAwKTsgLy8gcmVzb2x2ZXMgd2l0aCBmYWxzZSB3aGVuIF9Kb2luIHRhYmxlXG4gIH1cblxuICAvLyBEZWxldGUgYWxsIGRhdGEga25vd24gdG8gdGhpcyBhZGFwdGVyLiBVc2VkIGZvciB0ZXN0aW5nLlxuICBhc3luYyBkZWxldGVBbGxDbGFzc2VzKCkge1xuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgIGNvbnN0IGhlbHBlcnMgPSB0aGlzLl9wZ3AuaGVscGVycztcbiAgICBkZWJ1ZygnZGVsZXRlQWxsQ2xhc3NlcycpO1xuXG4gICAgYXdhaXQgdGhpcy5fY2xpZW50XG4gICAgICAudGFzaygnZGVsZXRlLWFsbC1jbGFzc2VzJywgYXN5bmMgKHQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdC5hbnkoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInKTtcbiAgICAgICAgICBjb25zdCBqb2lucyA9IHJlc3VsdHMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGxpc3QuY29uY2F0KGpvaW5UYWJsZXNGb3JTY2hlbWEoc2NoZW1hLnNjaGVtYSkpO1xuICAgICAgICAgIH0sIFtdKTtcbiAgICAgICAgICBjb25zdCBjbGFzc2VzID0gW1xuICAgICAgICAgICAgJ19TQ0hFTUEnLFxuICAgICAgICAgICAgJ19QdXNoU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU2NoZWR1bGUnLFxuICAgICAgICAgICAgJ19Ib29rcycsXG4gICAgICAgICAgICAnX0dsb2JhbENvbmZpZycsXG4gICAgICAgICAgICAnX0dyYXBoUUxDb25maWcnLFxuICAgICAgICAgICAgJ19BdWRpZW5jZScsXG4gICAgICAgICAgICAuLi5yZXN1bHRzLm1hcCgocmVzdWx0KSA9PiByZXN1bHQuY2xhc3NOYW1lKSxcbiAgICAgICAgICAgIC4uLmpvaW5zLFxuICAgICAgICAgIF07XG4gICAgICAgICAgY29uc3QgcXVlcmllcyA9IGNsYXNzZXMubWFwKChjbGFzc05hbWUpID0+ICh7XG4gICAgICAgICAgICBxdWVyeTogJ0RST1AgVEFCTEUgSUYgRVhJU1RTICQ8Y2xhc3NOYW1lOm5hbWU+JyxcbiAgICAgICAgICAgIHZhbHVlczogeyBjbGFzc05hbWUgfSxcbiAgICAgICAgICB9KSk7XG4gICAgICAgICAgYXdhaXQgdC50eCgodHgpID0+IHR4Lm5vbmUoaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gTm8gX1NDSEVNQSBjb2xsZWN0aW9uLiBEb24ndCBkZWxldGUgYW55dGhpbmcuXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGRlYnVnKGBkZWxldGVBbGxDbGFzc2VzIGRvbmUgaW4gJHtuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIG5vd31gKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBjb2x1bW4gYW5kIGFsbCB0aGUgZGF0YS4gRm9yIFJlbGF0aW9ucywgdGhlIF9Kb2luIGNvbGxlY3Rpb24gaXMgaGFuZGxlZFxuICAvLyBzcGVjaWFsbHksIHRoaXMgZnVuY3Rpb24gZG9lcyBub3QgZGVsZXRlIF9Kb2luIGNvbHVtbnMuIEl0IHNob3VsZCwgaG93ZXZlciwgaW5kaWNhdGVcbiAgLy8gdGhhdCB0aGUgcmVsYXRpb24gZmllbGRzIGRvZXMgbm90IGV4aXN0IGFueW1vcmUuIEluIG1vbmdvLCB0aGlzIG1lYW5zIHJlbW92aW5nIGl0IGZyb21cbiAgLy8gdGhlIF9TQ0hFTUEgY29sbGVjdGlvbi4gIFRoZXJlIHNob3VsZCBiZSBubyBhY3R1YWwgZGF0YSBpbiB0aGUgY29sbGVjdGlvbiB1bmRlciB0aGUgc2FtZSBuYW1lXG4gIC8vIGFzIHRoZSByZWxhdGlvbiBjb2x1bW4sIHNvIGl0J3MgZmluZSB0byBhdHRlbXB0IHRvIGRlbGV0ZSBpdC4gSWYgdGhlIGZpZWxkcyBsaXN0ZWQgdG8gYmVcbiAgLy8gZGVsZXRlZCBkbyBub3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gc2hvdWxkIHJldHVybiBzdWNjZXNzZnVsbHkgYW55d2F5cy4gQ2hlY2tpbmcgZm9yXG4gIC8vIGF0dGVtcHRzIHRvIGRlbGV0ZSBub24tZXhpc3RlbnQgZmllbGRzIGlzIHRoZSByZXNwb25zaWJpbGl0eSBvZiBQYXJzZSBTZXJ2ZXIuXG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBub3Qgb2JsaWdhdGVkIHRvIGRlbGV0ZSBmaWVsZHMgYXRvbWljYWxseS4gSXQgaXMgZ2l2ZW4gdGhlIGZpZWxkXG4gIC8vIG5hbWVzIGluIGEgbGlzdCBzbyB0aGF0IGRhdGFiYXNlcyB0aGF0IGFyZSBjYXBhYmxlIG9mIGRlbGV0aW5nIGZpZWxkcyBhdG9taWNhbGx5XG4gIC8vIG1heSBkbyBzby5cblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZS5cbiAgYXN5bmMgZGVsZXRlRmllbGRzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1ZygnZGVsZXRlRmllbGRzJywgY2xhc3NOYW1lLCBmaWVsZE5hbWVzKTtcbiAgICBmaWVsZE5hbWVzID0gZmllbGROYW1lcy5yZWR1Y2UoKGxpc3Q6IEFycmF5PHN0cmluZz4sIGZpZWxkTmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIGlmIChmaWVsZC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChmaWVsZE5hbWUpO1xuICAgICAgfVxuICAgICAgZGVsZXRlIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHJldHVybiBsaXN0O1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmZpZWxkTmFtZXNdO1xuICAgIGNvbnN0IGNvbHVtbnMgPSBmaWVsZE5hbWVzXG4gICAgICAubWFwKChuYW1lLCBpZHgpID0+IHtcbiAgICAgICAgcmV0dXJuIGAkJHtpZHggKyAyfTpuYW1lYDtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCBEUk9QIENPTFVNTicpO1xuXG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCdkZWxldGUtZmllbGRzJywgYXN5bmMgKHQpID0+IHtcbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIiA9ICQ8c2NoZW1hPiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+JyxcbiAgICAgICAgeyBzY2hlbWEsIGNsYXNzTmFtZSB9XG4gICAgICApO1xuICAgICAgaWYgKHZhbHVlcy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShgQUxURVIgVEFCTEUgJDE6bmFtZSBEUk9QIENPTFVNTiAke2NvbHVtbnN9YCwgdmFsdWVzKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIGFsbCBzY2hlbWFzIGtub3duIHRvIHRoaXMgYWRhcHRlciwgaW4gUGFyc2UgZm9ybWF0LiBJbiBjYXNlIHRoZVxuICAvLyBzY2hlbWFzIGNhbm5vdCBiZSByZXRyaWV2ZWQsIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVqZWN0cy4gUmVxdWlyZW1lbnRzIGZvciB0aGVcbiAgLy8gcmVqZWN0aW9uIHJlYXNvbiBhcmUgVEJELlxuICBhc3luYyBnZXRBbGxDbGFzc2VzKCkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQudGFzaygnZ2V0LWFsbC1jbGFzc2VzJywgYXN5bmMgKHQpID0+IHtcbiAgICAgIGF3YWl0IHNlbGYuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHModCk7XG4gICAgICByZXR1cm4gYXdhaXQgdC5tYXAoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInLCBudWxsLCAocm93KSA9PlxuICAgICAgICB0b1BhcnNlU2NoZW1hKHsgY2xhc3NOYW1lOiByb3cuY2xhc3NOYW1lLCAuLi5yb3cuc2NoZW1hIH0pXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgdGhlIHNjaGVtYSB3aXRoIHRoZSBnaXZlbiBuYW1lLCBpbiBQYXJzZSBmb3JtYXQuIElmXG4gIC8vIHRoaXMgYWRhcHRlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHNjaGVtYSwgcmV0dXJuIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aFxuICAvLyB1bmRlZmluZWQgYXMgdGhlIHJlYXNvbi5cbiAgYXN5bmMgZ2V0Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZ2V0Q2xhc3MnLCBjbGFzc05hbWUpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsIHtcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgfSlcbiAgICAgIC50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdC5sZW5ndGggIT09IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFswXS5zY2hlbWE7XG4gICAgICB9KVxuICAgICAgLnRoZW4odG9QYXJzZVNjaGVtYSk7XG4gIH1cblxuICAvLyBUT0RPOiByZW1vdmUgdGhlIG1vbmdvIGZvcm1hdCBkZXBlbmRlbmN5IGluIHRoZSByZXR1cm4gdmFsdWVcbiAgYXN5bmMgY3JlYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnY3JlYXRlT2JqZWN0JywgY2xhc3NOYW1lLCBvYmplY3QpO1xuICAgIGxldCBjb2x1bW5zQXJyYXkgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXNBcnJheSA9IFtdO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBnZW9Qb2ludHMgPSB7fTtcblxuICAgIG9iamVjdCA9IGhhbmRsZURvdEZpZWxkcyhvYmplY3QpO1xuXG4gICAgdmFsaWRhdGVLZXlzKG9iamVjdCk7XG5cbiAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goKGZpZWxkTmFtZSkgPT4ge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHZhciBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ10gPSBvYmplY3RbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBmaWVsZE5hbWUgPSAnYXV0aERhdGEnO1xuICAgICAgfVxuXG4gICAgICBjb2x1bW5zQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19mYWlsZWRfbG9naW5fY291bnQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2hpc3RvcnknXG4gICAgICAgICkge1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcpIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzd2l0Y2ggKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlKSB7XG4gICAgICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5vYmplY3RJZCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KG9iamVjdFtmaWVsZE5hbWVdKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdPYmplY3QnOlxuICAgICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICAgIGNhc2UgJ051bWJlcic6XG4gICAgICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdGaWxlJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm5hbWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2x5Z29uJzoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChvYmplY3RbZmllbGROYW1lXS5jb29yZGluYXRlcyk7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICAgIC8vIHBvcCB0aGUgcG9pbnQgYW5kIHByb2Nlc3MgbGF0ZXJcbiAgICAgICAgICBnZW9Qb2ludHNbZmllbGROYW1lXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICAgIGNvbHVtbnNBcnJheS5wb3AoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBgVHlwZSAke3NjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlfSBub3Qgc3VwcG9ydGVkIHlldGA7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb2x1bW5zQXJyYXkgPSBjb2x1bW5zQXJyYXkuY29uY2F0KE9iamVjdC5rZXlzKGdlb1BvaW50cykpO1xuICAgIGNvbnN0IGluaXRpYWxWYWx1ZXMgPSB2YWx1ZXNBcnJheS5tYXAoKHZhbCwgaW5kZXgpID0+IHtcbiAgICAgIGxldCB0ZXJtaW5hdGlvbiA9ICcnO1xuICAgICAgY29uc3QgZmllbGROYW1lID0gY29sdW1uc0FycmF5W2luZGV4XTtcbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6OnRleHRbXSc7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSdcbiAgICAgICkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6Ompzb25iJztcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJCR7aW5kZXggKyAyICsgY29sdW1uc0FycmF5Lmxlbmd0aH0ke3Rlcm1pbmF0aW9ufWA7XG4gICAgfSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzSW5qZWN0cyA9IE9iamVjdC5rZXlzKGdlb1BvaW50cykubWFwKChrZXkpID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gZ2VvUG9pbnRzW2tleV07XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlLmxvbmdpdHVkZSwgdmFsdWUubGF0aXR1ZGUpO1xuICAgICAgY29uc3QgbCA9IHZhbHVlc0FycmF5Lmxlbmd0aCArIGNvbHVtbnNBcnJheS5sZW5ndGg7XG4gICAgICByZXR1cm4gYFBPSU5UKCQke2x9LCAkJHtsICsgMX0pYDtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbHVtbnNQYXR0ZXJuID0gY29sdW1uc0FycmF5XG4gICAgICAubWFwKChjb2wsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAyfTpuYW1lYClcbiAgICAgIC5qb2luKCk7XG4gICAgY29uc3QgdmFsdWVzUGF0dGVybiA9IGluaXRpYWxWYWx1ZXMuY29uY2F0KGdlb1BvaW50c0luamVjdHMpLmpvaW4oKTtcblxuICAgIGNvbnN0IHFzID0gYElOU0VSVCBJTlRPICQxOm5hbWUgKCR7Y29sdW1uc1BhdHRlcm59KSBWQUxVRVMgKCR7dmFsdWVzUGF0dGVybn0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5jb2x1bW5zQXJyYXksIC4uLnZhbHVlc0FycmF5XTtcbiAgICBkZWJ1ZyhxcywgdmFsdWVzKTtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnRcbiAgICAgIDogdGhpcy5fY2xpZW50XG4gICAgKVxuICAgICAgLm5vbmUocXMsIHZhbHVlcylcbiAgICAgIC50aGVuKCgpID0+ICh7IG9wczogW29iamVjdF0gfSkpXG4gICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICAgIGVyci51bmRlcmx5aW5nRXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICBpZiAoZXJyb3IuY29uc3RyYWludCkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLmNvbnN0cmFpbnQubWF0Y2goL3VuaXF1ZV8oW2EtekEtWl0rKS8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMgJiYgQXJyYXkuaXNBcnJheShtYXRjaGVzKSkge1xuICAgICAgICAgICAgICBlcnIudXNlckluZm8gPSB7IGR1cGxpY2F0ZWRfZmllbGQ6IG1hdGNoZXNbMV0gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgZXJyb3IgPSBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICAvLyBJZiBubyBvYmplY3RzIG1hdGNoLCByZWplY3Qgd2l0aCBPQkpFQ1RfTk9UX0ZPVU5ELiBJZiBvYmplY3RzIGFyZSBmb3VuZCBhbmQgZGVsZXRlZCwgcmVzb2x2ZSB3aXRoIHVuZGVmaW5lZC5cbiAgLy8gSWYgdGhlcmUgaXMgc29tZSBvdGhlciBlcnJvciwgcmVqZWN0IHdpdGggSU5URVJOQUxfU0VSVkVSX0VSUk9SLlxuICBhc3luYyBkZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnZGVsZXRlT2JqZWN0c0J5UXVlcnknLCBjbGFzc05hbWUsIHF1ZXJ5KTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCBpbmRleCA9IDI7XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIGluZGV4LFxuICAgICAgcXVlcnksXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG4gICAgaWYgKE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT09IDApIHtcbiAgICAgIHdoZXJlLnBhdHRlcm4gPSAnVFJVRSc7XG4gICAgfVxuICAgIGNvbnN0IHFzID0gYFdJVEggZGVsZXRlZCBBUyAoREVMRVRFIEZST00gJDE6bmFtZSBXSEVSRSAke3doZXJlLnBhdHRlcm59IFJFVFVSTklORyAqKSBTRUxFQ1QgY291bnQoKikgRlJPTSBkZWxldGVkYDtcbiAgICBkZWJ1ZyhxcywgdmFsdWVzKTtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnRcbiAgICAgIDogdGhpcy5fY2xpZW50XG4gICAgKVxuICAgICAgLm9uZShxcywgdmFsdWVzLCAoYSkgPT4gK2EuY291bnQpXG4gICAgICAudGhlbigoY291bnQpID0+IHtcbiAgICAgICAgaWYgKGNvdW50ID09PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBjb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIEVMU0U6IERvbid0IGRlbGV0ZSBhbnl0aGluZyBpZiBkb2Vzbid0IGV4aXN0XG4gICAgICB9KTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG4gIC8vIFJldHVybiB2YWx1ZSBub3QgY3VycmVudGx5IHdlbGwgc3BlY2lmaWVkLlxuICBhc3luYyBmaW5kT25lQW5kVXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgZGVidWcoJ2ZpbmRPbmVBbmRVcGRhdGUnLCBjbGFzc05hbWUsIHF1ZXJ5LCB1cGRhdGUpO1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICB1cGRhdGUsXG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICkudGhlbigodmFsKSA9PiB2YWxbMF0pO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgYXN5bmMgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxbYW55XT4ge1xuICAgIGRlYnVnKCd1cGRhdGVPYmplY3RzQnlRdWVyeScsIGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgY29uc3QgdXBkYXRlUGF0dGVybnMgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcblxuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0geyAuLi51cGRhdGUgfTtcblxuICAgIC8vIFNldCBmbGFnIGZvciBkb3Qgbm90YXRpb24gZmllbGRzXG4gICAgY29uc3QgZG90Tm90YXRpb25PcHRpb25zID0ge307XG4gICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKChmaWVsZE5hbWUpID0+IHtcbiAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IGZpZWxkTmFtZS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBmaXJzdCA9IGNvbXBvbmVudHMuc2hpZnQoKTtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpcnN0XSA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHVwZGF0ZSA9IGhhbmRsZURvdEZpZWxkcyh1cGRhdGUpO1xuICAgIC8vIFJlc29sdmUgYXV0aERhdGEgZmlyc3QsXG4gICAgLy8gU28gd2UgZG9uJ3QgZW5kIHVwIHdpdGggbXVsdGlwbGUga2V5IHVwZGF0ZXNcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB1cGRhdGUpIHtcbiAgICAgIGNvbnN0IGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIGNvbnN0IHZhbHVlID0gdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIGRlbGV0ZSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddID0gdXBkYXRlWydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICB1cGRhdGVbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gdmFsdWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBmaWVsZFZhbHVlID0gdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAvLyBEcm9wIGFueSB1bmRlZmluZWQgdmFsdWVzLlxuICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PSAnYXV0aERhdGEnKSB7XG4gICAgICAgIC8vIFRoaXMgcmVjdXJzaXZlbHkgc2V0cyB0aGUganNvbl9vYmplY3RcbiAgICAgICAgLy8gT25seSAxIGxldmVsIGRlZXBcbiAgICAgICAgY29uc3QgZ2VuZXJhdGUgPSAoanNvbmI6IHN0cmluZywga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gYGpzb25fb2JqZWN0X3NldF9rZXkoQ09BTEVTQ0UoJHtqc29uYn0sICd7fSc6Ompzb25iKSwgJHtrZXl9LCAke3ZhbHVlfSk6Ompzb25iYDtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgbGFzdEtleSA9IGAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgIGNvbnN0IGZpZWxkTmFtZUluZGV4ID0gaW5kZXg7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGNvbnN0IHVwZGF0ZSA9IE9iamVjdC5rZXlzKGZpZWxkVmFsdWUpLnJlZHVjZShcbiAgICAgICAgICAobGFzdEtleTogc3RyaW5nLCBrZXk6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc3RyID0gZ2VuZXJhdGUoXG4gICAgICAgICAgICAgIGxhc3RLZXksXG4gICAgICAgICAgICAgIGAkJHtpbmRleH06OnRleHRgLFxuICAgICAgICAgICAgICBgJCR7aW5kZXggKyAxfTo6anNvbmJgXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIGxldCB2YWx1ZSA9IGZpZWxkVmFsdWVba2V5XTtcbiAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICBpZiAodmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIHN0cjtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGxhc3RLZXlcbiAgICAgICAgKTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7ZmllbGROYW1lSW5kZXh9Om5hbWUgPSAke3VwZGF0ZX1gKTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnSW5jcmVtZW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAwKSArICQke2luZGV4ICsgMX1gXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5hbW91bnQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGQnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke1xuICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIG51bGwpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdSZW1vdmUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfcmVtb3ZlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke1xuICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGRVbmlxdWUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkX3VuaXF1ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICAvL1RPRE86IHN0b3Agc3BlY2lhbCBjYXNpbmcgdGhpcy4gSXQgc2hvdWxkIGNoZWNrIGZvciBfX3R5cGUgPT09ICdEYXRlJyBhbmQgdXNlIC5pc29cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgICAgaW5kZXggKz0gMztcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwoZmllbGRWYWx1ZS5jb29yZGluYXRlcyk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgLy8gbm9vcFxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnT2JqZWN0J1xuICAgICAgKSB7XG4gICAgICAgIC8vIEdhdGhlciBrZXlzIHRvIGluY3JlbWVudFxuICAgICAgICBjb25zdCBrZXlzVG9JbmNyZW1lbnQgPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKChrKSA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldFxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IE9iamVjdC5rZXlzIGlzIGl0ZXJhdGluZyBvdmVyIHRoZSAqKm9yaWdpbmFsKiogdXBkYXRlIG9iamVjdFxuICAgICAgICAgICAgLy8gYW5kIHRoYXQgc29tZSBvZiB0aGUga2V5cyBvZiB0aGUgb3JpZ2luYWwgdXBkYXRlIGNvdWxkIGJlIG51bGwgb3IgdW5kZWZpbmVkOlxuICAgICAgICAgICAgLy8gKFNlZSB0aGUgYWJvdmUgY2hlY2sgYGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IHR5cGVvZiBmaWVsZFZhbHVlID09IFwidW5kZWZpbmVkXCIpYClcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnSW5jcmVtZW50JyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcCgoaykgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBsZXQgaW5jcmVtZW50UGF0dGVybnMgPSAnJztcbiAgICAgICAgaWYgKGtleXNUb0luY3JlbWVudC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaW5jcmVtZW50UGF0dGVybnMgPVxuICAgICAgICAgICAgJyB8fCAnICtcbiAgICAgICAgICAgIGtleXNUb0luY3JlbWVudFxuICAgICAgICAgICAgICAubWFwKChjKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYW1vdW50ID0gZmllbGRWYWx1ZVtjXS5hbW91bnQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBDT05DQVQoJ3tcIiR7Y31cIjonLCBDT0FMRVNDRSgkJHtpbmRleH06bmFtZS0+Picke2N9JywnMCcpOjppbnQgKyAke2Ftb3VudH0sICd9Jyk6Ompzb25iYDtcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgLmpvaW4oJyB8fCAnKTtcbiAgICAgICAgICAvLyBTdHJpcCB0aGUga2V5c1xuICAgICAgICAgIGtleXNUb0luY3JlbWVudC5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAgICAgICAgIGRlbGV0ZSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBrZXlzVG9EZWxldGU6IEFycmF5PHN0cmluZz4gPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKChrKSA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldC5cbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnRGVsZXRlJyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcCgoaykgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBjb25zdCBkZWxldGVQYXR0ZXJucyA9IGtleXNUb0RlbGV0ZS5yZWR1Y2UoXG4gICAgICAgICAgKHA6IHN0cmluZywgYzogc3RyaW5nLCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBwICsgYCAtICckJHtpbmRleCArIDEgKyBpfTp2YWx1ZSdgO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgJydcbiAgICAgICAgKTtcbiAgICAgICAgLy8gT3ZlcnJpZGUgT2JqZWN0XG4gICAgICAgIGxldCB1cGRhdGVPYmplY3QgPSBcIid7fSc6Ompzb25iXCI7XG5cbiAgICAgICAgaWYgKGRvdE5vdGF0aW9uT3B0aW9uc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgLy8gTWVyZ2UgT2JqZWN0XG4gICAgICAgICAgdXBkYXRlT2JqZWN0ID0gYENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAne30nOjpqc29uYilgO1xuICAgICAgICB9XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gKCR7dXBkYXRlT2JqZWN0fSAke2RlbGV0ZVBhdHRlcm5zfSAke2luY3JlbWVudFBhdHRlcm5zfSB8fCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMSArIGtleXNUb0RlbGV0ZS5sZW5ndGhcbiAgICAgICAgICB9Ojpqc29uYiApYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIC4uLmtleXNUb0RlbGV0ZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyICsga2V5c1RvRGVsZXRlLmxlbmd0aDtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZSkgJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknXG4gICAgICApIHtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKTtcbiAgICAgICAgaWYgKGV4cGVjdGVkVHlwZSA9PT0gJ3RleHRbXScpIHtcbiAgICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnRleHRbXWApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVidWcoJ05vdCBzdXBwb3J0ZWQgdXBkYXRlJywgZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICBgUG9zdGdyZXMgZG9lc24ndCBzdXBwb3J0IHVwZGF0ZSAke0pTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpfSB5ZXRgXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBpbmRleCxcbiAgICAgIHF1ZXJ5LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVDbGF1c2UgPVxuICAgICAgd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgcXMgPSBgVVBEQVRFICQxOm5hbWUgU0VUICR7dXBkYXRlUGF0dGVybnMuam9pbigpfSAke3doZXJlQ2xhdXNlfSBSRVRVUk5JTkcgKmA7XG4gICAgZGVidWcoJ3VwZGF0ZTogJywgcXMsIHZhbHVlcyk7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50XG4gICAgICA6IHRoaXMuX2NsaWVudFxuICAgICkuYW55KHFzLCB2YWx1ZXMpO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvLyBIb3BlZnVsbHksIHdlIGNhbiBnZXQgcmlkIG9mIHRoaXMuIEl0J3Mgb25seSB1c2VkIGZvciBjb25maWcgYW5kIGhvb2tzLlxuICB1cHNlcnRPbmVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ3Vwc2VydE9uZU9iamVjdCcsIHsgY2xhc3NOYW1lLCBxdWVyeSwgdXBkYXRlIH0pO1xuICAgIGNvbnN0IGNyZWF0ZVZhbHVlID0gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlT2JqZWN0KFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgc2NoZW1hLFxuICAgICAgY3JlYXRlVmFsdWUsXG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICkuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAvLyBpZ25vcmUgZHVwbGljYXRlIHZhbHVlIGVycm9ycyBhcyBpdCdzIHVwc2VydFxuICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLmZpbmRPbmVBbmRVcGRhdGUoXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBxdWVyeSxcbiAgICAgICAgdXBkYXRlLFxuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgeyBza2lwLCBsaW1pdCwgc29ydCwga2V5cywgY2FzZUluc2Vuc2l0aXZlLCBleHBsYWluIH06IFF1ZXJ5T3B0aW9uc1xuICApIHtcbiAgICBkZWJ1ZygnZmluZCcsIGNsYXNzTmFtZSwgcXVlcnksIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIHNvcnQsXG4gICAgICBrZXlzLFxuICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgZXhwbGFpbixcbiAgICB9KTtcbiAgICBjb25zdCBoYXNMaW1pdCA9IGxpbWl0ICE9PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgaGFzU2tpcCA9IHNraXAgIT09IHVuZGVmaW5lZDtcbiAgICBsZXQgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDIsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9XG4gICAgICB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCBsaW1pdFBhdHRlcm4gPSBoYXNMaW1pdCA/IGBMSU1JVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc0xpbWl0KSB7XG4gICAgICB2YWx1ZXMucHVzaChsaW1pdCk7XG4gICAgfVxuICAgIGNvbnN0IHNraXBQYXR0ZXJuID0gaGFzU2tpcCA/IGBPRkZTRVQgJCR7dmFsdWVzLmxlbmd0aCArIDF9YCA6ICcnO1xuICAgIGlmIChoYXNTa2lwKSB7XG4gICAgICB2YWx1ZXMucHVzaChza2lwKTtcbiAgICB9XG5cbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBpZiAoc29ydCkge1xuICAgICAgY29uc3Qgc29ydENvcHk6IGFueSA9IHNvcnQ7XG4gICAgICBjb25zdCBzb3J0aW5nID0gT2JqZWN0LmtleXMoc29ydClcbiAgICAgICAgLm1hcCgoa2V5KSA9PiB7XG4gICAgICAgICAgY29uc3QgdHJhbnNmb3JtS2V5ID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoa2V5KS5qb2luKCctPicpO1xuICAgICAgICAgIC8vIFVzaW5nICRpZHggcGF0dGVybiBnaXZlczogIG5vbi1pbnRlZ2VyIGNvbnN0YW50IGluIE9SREVSIEJZXG4gICAgICAgICAgaWYgKHNvcnRDb3B5W2tleV0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IEFTQ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IERFU0NgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgc29ydFBhdHRlcm4gPVxuICAgICAgICBzb3J0ICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LmtleXMoc29ydCkubGVuZ3RoID4gMFxuICAgICAgICAgID8gYE9SREVSIEJZICR7c29ydGluZ31gXG4gICAgICAgICAgOiAnJztcbiAgICB9XG4gICAgaWYgKHdoZXJlLnNvcnRzICYmIE9iamVjdC5rZXlzKCh3aGVyZS5zb3J0czogYW55KSkubGVuZ3RoID4gMCkge1xuICAgICAgc29ydFBhdHRlcm4gPSBgT1JERVIgQlkgJHt3aGVyZS5zb3J0cy5qb2luKCl9YDtcbiAgICB9XG5cbiAgICBsZXQgY29sdW1ucyA9ICcqJztcbiAgICBpZiAoa2V5cykge1xuICAgICAgLy8gRXhjbHVkZSBlbXB0eSBrZXlzXG4gICAgICAvLyBSZXBsYWNlIEFDTCBieSBpdCdzIGtleXNcbiAgICAgIGtleXMgPSBrZXlzLnJlZHVjZSgobWVtbywga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdBQ0wnKSB7XG4gICAgICAgICAgbWVtby5wdXNoKCdfcnBlcm0nKTtcbiAgICAgICAgICBtZW1vLnB1c2goJ193cGVybScpO1xuICAgICAgICB9IGVsc2UgaWYgKGtleS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgbWVtby5wdXNoKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LCBbXSk7XG4gICAgICBjb2x1bW5zID0ga2V5c1xuICAgICAgICAubWFwKChrZXksIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGtleSA9PT0gJyRzY29yZScpIHtcbiAgICAgICAgICAgIHJldHVybiBgdHNfcmFua19jZCh0b190c3ZlY3RvcigkJHsyfSwgJCR7M306bmFtZSksIHRvX3RzcXVlcnkoJCR7NH0sICQkezV9KSwgMzIpIGFzIHNjb3JlYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAkJHtpbmRleCArIHZhbHVlcy5sZW5ndGggKyAxfTpuYW1lYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHZhbHVlcyA9IHZhbHVlcy5jb25jYXQoa2V5cyk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufSAke3NraXBQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluXG4gICAgICA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KVxuICAgICAgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgLy8gUXVlcnkgb24gbm9uIGV4aXN0aW5nIHRhYmxlLCBkb24ndCBjcmFzaFxuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSlcbiAgICAgIC50aGVuKChyZXN1bHRzKSA9PiB7XG4gICAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKChvYmplY3QpID0+XG4gICAgICAgICAgdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSlcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydHMgZnJvbSBhIHBvc3RncmVzLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4gIC8vIERvZXMgbm90IHN0cmlwIG91dCBhbnl0aGluZyBiYXNlZCBvbiBhIGxhY2sgb2YgYXV0aGVudGljYXRpb24uXG4gIHBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHNjaGVtYTogYW55KSB7XG4gICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaCgoZmllbGROYW1lKSA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJyAmJiBvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkTmFtZV0sXG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICBsYXRpdHVkZTogb2JqZWN0W2ZpZWxkTmFtZV0ueSxcbiAgICAgICAgICBsb25naXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLngsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBsZXQgY29vcmRzID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGNvb3JkcyA9IGNvb3Jkcy5zdWJzdHIoMiwgY29vcmRzLmxlbmd0aCAtIDQpLnNwbGl0KCcpLCgnKTtcbiAgICAgICAgY29vcmRzID0gY29vcmRzLm1hcCgocG9pbnQpID0+IHtcbiAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgcGFyc2VGbG9hdChwb2ludC5zcGxpdCgnLCcpWzFdKSxcbiAgICAgICAgICAgIHBhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVswXSksXG4gICAgICAgICAgXTtcbiAgICAgICAgfSk7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1BvbHlnb24nLFxuICAgICAgICAgIGNvb3JkaW5hdGVzOiBjb29yZHMsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdGaWxlJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgICAgICBuYW1lOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICAvL1RPRE86IHJlbW92ZSB0aGlzIHJlbGlhbmNlIG9uIHRoZSBtb25nbyBmb3JtYXQuIERCIGFkYXB0ZXIgc2hvdWxkbid0IGtub3cgdGhlcmUgaXMgYSBkaWZmZXJlbmNlIGJldHdlZW4gY3JlYXRlZCBhdCBhbmQgYW55IG90aGVyIGRhdGUgZmllbGQuXG4gICAgaWYgKG9iamVjdC5jcmVhdGVkQXQpIHtcbiAgICAgIG9iamVjdC5jcmVhdGVkQXQgPSBvYmplY3QuY3JlYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QudXBkYXRlZEF0KSB7XG4gICAgICBvYmplY3QudXBkYXRlZEF0ID0gb2JqZWN0LnVwZGF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LmV4cGlyZXNBdCkge1xuICAgICAgb2JqZWN0LmV4cGlyZXNBdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0LmV4cGlyZXNBdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCkge1xuICAgICAgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgICBpc286IG9iamVjdFtmaWVsZE5hbWVdLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSBpbmRleC4gVW5pcXVlIGluZGV4ZXMgb24gbnVsbGFibGUgZmllbGRzIGFyZSBub3QgYWxsb3dlZC4gU2luY2Ugd2UgZG9uJ3RcbiAgLy8gY3VycmVudGx5IGtub3cgd2hpY2ggZmllbGRzIGFyZSBudWxsYWJsZSBhbmQgd2hpY2ggYXJlbid0LCB3ZSBpZ25vcmUgdGhhdCBjcml0ZXJpYS5cbiAgLy8gQXMgc3VjaCwgd2Ugc2hvdWxkbid0IGV4cG9zZSB0aGlzIGZ1bmN0aW9uIHRvIHVzZXJzIG9mIHBhcnNlIHVudGlsIHdlIGhhdmUgYW4gb3V0LW9mLWJhbmRcbiAgLy8gV2F5IG9mIGRldGVybWluaW5nIGlmIGEgZmllbGQgaXMgbnVsbGFibGUuIFVuZGVmaW5lZCBkb2Vzbid0IGNvdW50IGFnYWluc3QgdW5pcXVlbmVzcyxcbiAgLy8gd2hpY2ggaXMgd2h5IHdlIHVzZSBzcGFyc2UgaW5kZXhlcy5cbiAgYXN5bmMgZW5zdXJlVW5pcXVlbmVzcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgZmllbGROYW1lczogc3RyaW5nW11cbiAgKSB7XG4gICAgLy8gVXNlIHRoZSBzYW1lIG5hbWUgZm9yIGV2ZXJ5IGVuc3VyZVVuaXF1ZW5lc3MgYXR0ZW1wdCwgYmVjYXVzZSBwb3N0Z3Jlc1xuICAgIC8vIFdpbGwgaGFwcGlseSBjcmVhdGUgdGhlIHNhbWUgaW5kZXggd2l0aCBtdWx0aXBsZSBuYW1lcy5cbiAgICBjb25zdCBjb25zdHJhaW50TmFtZSA9IGB1bmlxdWVfJHtmaWVsZE5hbWVzLnNvcnQoKS5qb2luKCdfJyl9YDtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBmaWVsZE5hbWVzLm1hcChcbiAgICAgIChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYFxuICAgICk7XG4gICAgY29uc3QgcXMgPSBgQUxURVIgVEFCTEUgJDE6bmFtZSBBREQgQ09OU1RSQUlOVCAkMjpuYW1lIFVOSVFVRSAoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5ub25lKHFzLCBbY2xhc3NOYW1lLCBjb25zdHJhaW50TmFtZSwgLi4uZmllbGROYW1lc10pXG4gICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGNvbnN0cmFpbnROYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBJbmRleCBhbHJlYWR5IGV4aXN0cy4gSWdub3JlIGVycm9yLlxuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpXG4gICAgICAgICkge1xuICAgICAgICAgIC8vIENhc3QgdGhlIGVycm9yIGludG8gdGhlIHByb3BlciBwYXJzZSBlcnJvclxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBjb3VudC5cbiAgYXN5bmMgY291bnQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgcmVhZFByZWZlcmVuY2U/OiBzdHJpbmcsXG4gICAgZXN0aW1hdGU/OiBib29sZWFuID0gdHJ1ZVxuICApIHtcbiAgICBkZWJ1ZygnY291bnQnLCBjbGFzc05hbWUsIHF1ZXJ5LCByZWFkUHJlZmVyZW5jZSwgZXN0aW1hdGUpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiAyLFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID1cbiAgICAgIHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGxldCBxcyA9ICcnO1xuXG4gICAgaWYgKHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCB8fCAhZXN0aW1hdGUpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBjb3VudCgqKSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9IGVsc2Uge1xuICAgICAgcXMgPVxuICAgICAgICAnU0VMRUNUIHJlbHR1cGxlcyBBUyBhcHByb3hpbWF0ZV9yb3dfY291bnQgRlJPTSBwZ19jbGFzcyBXSEVSRSByZWxuYW1lID0gJDEnO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgKGEpID0+IHtcbiAgICAgICAgaWYgKGEuYXBwcm94aW1hdGVfcm93X2NvdW50ICE9IG51bGwpIHtcbiAgICAgICAgICByZXR1cm4gK2EuYXBwcm94aW1hdGVfcm93X2NvdW50O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiArYS5jb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBkaXN0aW5jdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICBmaWVsZE5hbWU6IHN0cmluZ1xuICApIHtcbiAgICBkZWJ1ZygnZGlzdGluY3QnLCBjbGFzc05hbWUsIHF1ZXJ5KTtcbiAgICBsZXQgZmllbGQgPSBmaWVsZE5hbWU7XG4gICAgbGV0IGNvbHVtbiA9IGZpZWxkTmFtZTtcbiAgICBjb25zdCBpc05lc3RlZCA9IGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIGZpZWxkID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgY29sdW1uID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgfVxuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGlzUG9pbnRlckZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJztcbiAgICBjb25zdCB2YWx1ZXMgPSBbZmllbGQsIGNvbHVtbiwgY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogNCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9XG4gICAgICB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCB0cmFuc2Zvcm1lciA9IGlzQXJyYXlGaWVsZCA/ICdqc29uYl9hcnJheV9lbGVtZW50cycgOiAnT04nO1xuICAgIGxldCBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6bmFtZSkgJDI6bmFtZSBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpyYXcpICQyOnJhdyBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKHJlc3VsdHMpID0+IHtcbiAgICAgICAgaWYgKCFpc05lc3RlZCkge1xuICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcigob2JqZWN0KSA9PiBvYmplY3RbZmllbGRdICE9PSBudWxsKTtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAoKG9iamVjdCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgICByZXR1cm4gb2JqZWN0W2ZpZWxkXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZF0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNoaWxkID0gZmllbGROYW1lLnNwbGl0KCcuJylbMV07XG4gICAgICAgIHJldHVybiByZXN1bHRzLm1hcCgob2JqZWN0KSA9PiBvYmplY3RbY29sdW1uXVtjaGlsZF0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKChyZXN1bHRzKSA9PlxuICAgICAgICByZXN1bHRzLm1hcCgob2JqZWN0KSA9PlxuICAgICAgICAgIHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpXG4gICAgICAgIClcbiAgICAgICk7XG4gIH1cblxuICBhc3luYyBhZ2dyZWdhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBhbnksXG4gICAgcGlwZWxpbmU6IGFueSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBoaW50OiA/bWl4ZWQsXG4gICAgZXhwbGFpbj86IGJvb2xlYW5cbiAgKSB7XG4gICAgZGVidWcoJ2FnZ3JlZ2F0ZScsIGNsYXNzTmFtZSwgcGlwZWxpbmUsIHJlYWRQcmVmZXJlbmNlLCBoaW50LCBleHBsYWluKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXg6IG51bWJlciA9IDI7XG4gICAgbGV0IGNvbHVtbnM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGNvdW50RmllbGQgPSBudWxsO1xuICAgIGxldCBncm91cFZhbHVlcyA9IG51bGw7XG4gICAgbGV0IHdoZXJlUGF0dGVybiA9ICcnO1xuICAgIGxldCBsaW1pdFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc2tpcFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBsZXQgZ3JvdXBQYXR0ZXJuID0gJyc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaXBlbGluZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3Qgc3RhZ2UgPSBwaXBlbGluZVtpXTtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRncm91cFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUgIT09ICcnKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTIFwib2JqZWN0SWRcImApO1xuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGZpZWxkID09PSAnX2lkJyAmJlxuICAgICAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCAhPT0gMFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgZ3JvdXBWYWx1ZXMgPSB2YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQnlGaWVsZHMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgYWxpYXMgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVthbGlhc10gPT09ICdzdHJpbmcnICYmIHZhbHVlW2FsaWFzXSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXSk7XG4gICAgICAgICAgICAgICAgaWYgKCFncm91cEJ5RmllbGRzLmluY2x1ZGVzKGBcIiR7c291cmNlfVwiYCkpIHtcbiAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb3BlcmF0aW9uID0gT2JqZWN0LmtleXModmFsdWVbYWxpYXNdKVswXTtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc11bb3BlcmF0aW9uXSk7XG4gICAgICAgICAgICAgICAgaWYgKG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgYEVYVFJBQ1QoJHtcbiAgICAgICAgICAgICAgICAgICAgICBtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXVxuICAgICAgICAgICAgICAgICAgICB9IEZST00gJCR7aW5kZXh9Om5hbWUgQVQgVElNRSBaT05FICdVVEMnKSBBUyAkJHtcbiAgICAgICAgICAgICAgICAgICAgICBpbmRleCArIDFcbiAgICAgICAgICAgICAgICAgICAgfTpuYW1lYFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHNvdXJjZSwgYWxpYXMpO1xuICAgICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06cmF3YDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGdyb3VwQnlGaWVsZHMuam9pbigpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZS4kc3VtKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUuJHN1bSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYFNVTSgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJHN1bSksIGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvdW50RmllbGQgPSBmaWVsZDtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYENPVU5UKCopIEFTICQke2luZGV4fTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQpO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kbWF4KSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgTUFYKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJG1heCksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kbWluKSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgTUlOKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJG1pbiksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kYXZnKSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgQVZHKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJGF2ZyksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbHVtbnMucHVzaCgnKicpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgIGlmIChjb2x1bW5zLmluY2x1ZGVzKCcqJykpIHtcbiAgICAgICAgICBjb2x1bW5zID0gW107XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJHByb2plY3RbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gMSB8fCB2YWx1ZSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgY29uc3QgcGF0dGVybnMgPSBbXTtcbiAgICAgICAgY29uc3Qgb3JPckFuZCA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChcbiAgICAgICAgICBzdGFnZS4kbWF0Y2gsXG4gICAgICAgICAgJyRvcidcbiAgICAgICAgKVxuICAgICAgICAgID8gJyBPUiAnXG4gICAgICAgICAgOiAnIEFORCAnO1xuXG4gICAgICAgIGlmIChzdGFnZS4kbWF0Y2guJG9yKSB7XG4gICAgICAgICAgY29uc3QgY29sbGFwc2UgPSB7fTtcbiAgICAgICAgICBzdGFnZS4kbWF0Y2guJG9yLmZvckVhY2goKGVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgY29sbGFwc2Vba2V5XSA9IGVsZW1lbnRba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBzdGFnZS4kbWF0Y2ggPSBjb2xsYXBzZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRtYXRjaCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJG1hdGNoW2ZpZWxkXTtcbiAgICAgICAgICBjb25zdCBtYXRjaFBhdHRlcm5zID0gW107XG4gICAgICAgICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKChjbXApID0+IHtcbiAgICAgICAgICAgIGlmICh2YWx1ZVtjbXBdKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICAgICAgICBtYXRjaFBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgICAgYCQke2luZGV4fTpuYW1lICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCArIDF9YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlW2NtcF0pKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAobWF0Y2hQYXR0ZXJucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJHttYXRjaFBhdHRlcm5zLmpvaW4oJyBBTkQgJyl9KWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJlxuICAgICAgICAgICAgbWF0Y2hQYXR0ZXJucy5sZW5ndGggPT09IDBcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQsIHZhbHVlKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHdoZXJlUGF0dGVybiA9XG4gICAgICAgICAgcGF0dGVybnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke3BhdHRlcm5zLmpvaW4oYCAke29yT3JBbmR9IGApfWAgOiAnJztcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbGltaXQpIHtcbiAgICAgICAgbGltaXRQYXR0ZXJuID0gYExJTUlUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRsaW1pdCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNraXApIHtcbiAgICAgICAgc2tpcFBhdHRlcm4gPSBgT0ZGU0VUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRza2lwKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc29ydCkge1xuICAgICAgICBjb25zdCBzb3J0ID0gc3RhZ2UuJHNvcnQ7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzb3J0KTtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGtleXNcbiAgICAgICAgICAubWFwKChrZXkpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gc29ydFtrZXldID09PSAxID8gJ0FTQycgOiAnREVTQyc7XG4gICAgICAgICAgICBjb25zdCBvcmRlciA9IGAkJHtpbmRleH06bmFtZSAke3RyYW5zZm9ybWVyfWA7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgcmV0dXJuIG9yZGVyO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmpvaW4oKTtcbiAgICAgICAgdmFsdWVzLnB1c2goLi4ua2V5cyk7XG4gICAgICAgIHNvcnRQYXR0ZXJuID1cbiAgICAgICAgICBzb3J0ICE9PSB1bmRlZmluZWQgJiYgc29ydGluZy5sZW5ndGggPiAwID8gYE9SREVSIEJZICR7c29ydGluZ31gIDogJyc7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGdyb3VwUGF0dGVybikge1xuICAgICAgY29sdW1ucy5mb3JFYWNoKChlLCBpLCBhKSA9PiB7XG4gICAgICAgIGlmIChlICYmIGUudHJpbSgpID09PSAnKicpIHtcbiAgICAgICAgICBhW2ldID0gJyc7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBgU0VMRUNUICR7Y29sdW1uc1xuICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgLmpvaW4oKX0gRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufSAke3NraXBQYXR0ZXJufSAke2dyb3VwUGF0dGVybn0gJHtzb3J0UGF0dGVybn0gJHtsaW1pdFBhdHRlcm59YDtcbiAgICBjb25zdCBxcyA9IGV4cGxhaW5cbiAgICAgID8gdGhpcy5jcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KG9yaWdpbmFsUXVlcnkpXG4gICAgICA6IG9yaWdpbmFsUXVlcnk7XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHZhbHVlcykudGhlbigoYSkgPT4ge1xuICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgcmV0dXJuIGE7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHRzID0gYS5tYXAoKG9iamVjdCkgPT5cbiAgICAgICAgdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSlcbiAgICAgICk7XG4gICAgICByZXN1bHRzLmZvckVhY2goKHJlc3VsdCkgPT4ge1xuICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdvYmplY3RJZCcpKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSB7fTtcbiAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBncm91cFZhbHVlcykge1xuICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkW2tleV0gPSByZXN1bHRba2V5XTtcbiAgICAgICAgICAgIGRlbGV0ZSByZXN1bHRba2V5XTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvdW50RmllbGQpIHtcbiAgICAgICAgICByZXN1bHRbY291bnRGaWVsZF0gPSBwYXJzZUludChyZXN1bHRbY291bnRGaWVsZF0sIDEwKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbih7IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgfTogYW55KSB7XG4gICAgLy8gVE9ETzogVGhpcyBtZXRob2QgbmVlZHMgdG8gYmUgcmV3cml0dGVuIHRvIG1ha2UgcHJvcGVyIHVzZSBvZiBjb25uZWN0aW9ucyAoQHZpdGFseS10KVxuICAgIGRlYnVnKCdwZXJmb3JtSW5pdGlhbGl6YXRpb24nKTtcbiAgICBjb25zdCBwcm9taXNlcyA9IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMubWFwKChzY2hlbWEpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVRhYmxlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSlcbiAgICAgICAgLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIHx8XG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5zY2hlbWFVcGdyYWRlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSkpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsaWVudC50eCgncGVyZm9ybS1pbml0aWFsaXphdGlvbicsICh0KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQuYmF0Y2goW1xuICAgICAgICAgICAgdC5ub25lKHNxbC5taXNjLmpzb25PYmplY3RTZXRLZXlzKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuYWRkKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuYWRkVW5pcXVlKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkucmVtb3ZlKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuY29udGFpbnNBbGwpLFxuICAgICAgICAgICAgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbFJlZ2V4KSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuY29udGFpbnMpLFxuICAgICAgICAgIF0pO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoZGF0YSkgPT4ge1xuICAgICAgICBkZWJ1ZyhgaW5pdGlhbGl6YXRpb25Eb25lIGluICR7ZGF0YS5kdXJhdGlvbn1gKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUluZGV4ZXMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgaW5kZXhlczogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgoKHQpID0+XG4gICAgICB0LmJhdGNoKFxuICAgICAgICBpbmRleGVzLm1hcCgoaSkgPT4ge1xuICAgICAgICAgIHJldHVybiB0Lm5vbmUoJ0NSRUFURSBJTkRFWCAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgICAgICAgaS5uYW1lLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaS5rZXksXG4gICAgICAgICAgXSk7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCAoXG4gICAgICBjb25uIHx8IHRoaXMuX2NsaWVudFxuICAgICkubm9uZSgnQ1JFQVRFIElOREVYICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLCBbXG4gICAgICBmaWVsZE5hbWUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0eXBlLFxuICAgIF0pO1xuICB9XG5cbiAgYXN5bmMgZHJvcEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSwgY29ubjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcXVlcmllcyA9IGluZGV4ZXMubWFwKChpKSA9PiAoe1xuICAgICAgcXVlcnk6ICdEUk9QIElOREVYICQxOm5hbWUnLFxuICAgICAgdmFsdWVzOiBpLFxuICAgIH0pKTtcbiAgICBhd2FpdCAoY29ubiB8fCB0aGlzLl9jbGllbnQpLnR4KCh0KSA9PlxuICAgICAgdC5ub25lKHRoaXMuX3BncC5oZWxwZXJzLmNvbmNhdChxdWVyaWVzKSlcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgZ2V0SW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHFzID0gJ1NFTEVDVCAqIEZST00gcGdfaW5kZXhlcyBXSEVSRSB0YWJsZW5hbWUgPSAke2NsYXNzTmFtZX0nO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQuYW55KHFzLCB7IGNsYXNzTmFtZSB9KTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFVzZWQgZm9yIHRlc3RpbmcgcHVycG9zZXNcbiAgYXN5bmMgdXBkYXRlRXN0aW1hdGVkQ291bnQoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50Lm5vbmUoJ0FOQUxZWkUgJDE6bmFtZScsIFtjbGFzc05hbWVdKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCk6IFByb21pc2U8YW55PiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICBjb25zdCB0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHt9O1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0ID0gdGhpcy5fY2xpZW50LnR4KCh0KSA9PiB7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgPSB0O1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlID0gcmVzb2x2ZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoID0gW107XG4gICAgICAgIHJlc29sdmUodHJhbnNhY3Rpb25hbFNlc3Npb24pO1xuICAgICAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlc3Npb24ucHJvbWlzZTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlc3Npb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUoXG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKVxuICAgICk7XG4gICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdDtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlc3Npb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdC5jYXRjaCgpO1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2goUHJvbWlzZS5yZWplY3QoKSk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZShcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSW5kZXgoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIGZpZWxkTmFtZXM6IHN0cmluZ1tdLFxuICAgIGluZGV4TmFtZTogP3N0cmluZyxcbiAgICBjYXNlSW5zZW5zaXRpdmU6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBjb25uOiA/YW55ID0gbnVsbFxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbm4gPSBjb25uICE9IG51bGwgPyBjb25uIDogdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IGRlZmF1bHRJbmRleE5hbWUgPSBgcGFyc2VfZGVmYXVsdF8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGluZGV4TmFtZU9wdGlvbnM6IE9iamVjdCA9XG4gICAgICBpbmRleE5hbWUgIT0gbnVsbCA/IHsgbmFtZTogaW5kZXhOYW1lIH0gOiB7IG5hbWU6IGRlZmF1bHRJbmRleE5hbWUgfTtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBjYXNlSW5zZW5zaXRpdmVcbiAgICAgID8gZmllbGROYW1lcy5tYXAoXG4gICAgICAgIChmaWVsZE5hbWUsIGluZGV4KSA9PiBgbG93ZXIoJCR7aW5kZXggKyAzfTpuYW1lKSB2YXJjaGFyX3BhdHRlcm5fb3BzYFxuICAgICAgKVxuICAgICAgOiBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBJTkRFWCAkMTpuYW1lIE9OICQyOm5hbWUgKCR7Y29uc3RyYWludFBhdHRlcm5zLmpvaW4oKX0pYDtcbiAgICBhd2FpdCBjb25uXG4gICAgICAubm9uZShxcywgW2luZGV4TmFtZU9wdGlvbnMubmFtZSwgY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXSlcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciAmJlxuICAgICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lT3B0aW9ucy5uYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBJbmRleCBhbHJlYWR5IGV4aXN0cy4gSWdub3JlIGVycm9yLlxuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lT3B0aW9ucy5uYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjb252ZXJ0UG9seWdvblRvU1FMKHBvbHlnb24pIHtcbiAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGBQb2x5Z29uIG11c3QgaGF2ZSBhdCBsZWFzdCAzIHZhbHVlc2BcbiAgICApO1xuICB9XG4gIGlmIChcbiAgICBwb2x5Z29uWzBdWzBdICE9PSBwb2x5Z29uW3BvbHlnb24ubGVuZ3RoIC0gMV1bMF0gfHxcbiAgICBwb2x5Z29uWzBdWzFdICE9PSBwb2x5Z29uW3BvbHlnb24ubGVuZ3RoIC0gMV1bMV1cbiAgKSB7XG4gICAgcG9seWdvbi5wdXNoKHBvbHlnb25bMF0pO1xuICB9XG4gIGNvbnN0IHVuaXF1ZSA9IHBvbHlnb24uZmlsdGVyKChpdGVtLCBpbmRleCwgYXIpID0+IHtcbiAgICBsZXQgZm91bmRJbmRleCA9IC0xO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXIubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHB0ID0gYXJbaV07XG4gICAgICBpZiAocHRbMF0gPT09IGl0ZW1bMF0gJiYgcHRbMV0gPT09IGl0ZW1bMV0pIHtcbiAgICAgICAgZm91bmRJbmRleCA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZm91bmRJbmRleCA9PT0gaW5kZXg7XG4gIH0pO1xuICBpZiAodW5pcXVlLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAnR2VvSlNPTjogTG9vcCBtdXN0IGhhdmUgYXQgbGVhc3QgMyBkaWZmZXJlbnQgdmVydGljZXMnXG4gICAgKTtcbiAgfVxuICBjb25zdCBwb2ludHMgPSBwb2x5Z29uXG4gICAgLm1hcCgocG9pbnQpID0+IHtcbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwYXJzZUZsb2F0KHBvaW50WzFdKSwgcGFyc2VGbG9hdChwb2ludFswXSkpO1xuICAgICAgcmV0dXJuIGAoJHtwb2ludFsxXX0sICR7cG9pbnRbMF19KWA7XG4gICAgfSlcbiAgICAuam9pbignLCAnKTtcbiAgcmV0dXJuIGAoJHtwb2ludHN9KWA7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpIHtcbiAgaWYgKCFyZWdleC5lbmRzV2l0aCgnXFxuJykpIHtcbiAgICByZWdleCArPSAnXFxuJztcbiAgfVxuXG4gIC8vIHJlbW92ZSBub24gZXNjYXBlZCBjb21tZW50c1xuICByZXR1cm4gKFxuICAgIHJlZ2V4XG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pIy4qXFxuL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSBsaW5lcyBzdGFydGluZyB3aXRoIGEgY29tbWVudFxuICAgICAgLnJlcGxhY2UoL14jLipcXG4vZ2ltLCAnJylcbiAgICAgIC8vIHJlbW92ZSBub24gZXNjYXBlZCB3aGl0ZXNwYWNlXG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pXFxzKy9naW0sICckMScpXG4gICAgICAvLyByZW1vdmUgd2hpdGVzcGFjZSBhdCB0aGUgYmVnaW5uaW5nIG9mIGEgbGluZVxuICAgICAgLnJlcGxhY2UoL15cXHMrLywgJycpXG4gICAgICAudHJpbSgpXG4gICk7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NSZWdleFBhdHRlcm4ocykge1xuICBpZiAocyAmJiBzLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIC8vIHJlZ2V4IGZvciBzdGFydHNXaXRoXG4gICAgcmV0dXJuICdeJyArIGxpdGVyYWxpemVSZWdleFBhcnQocy5zbGljZSgxKSk7XG4gIH0gZWxzZSBpZiAocyAmJiBzLmVuZHNXaXRoKCckJykpIHtcbiAgICAvLyByZWdleCBmb3IgZW5kc1dpdGhcbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDAsIHMubGVuZ3RoIC0gMSkpICsgJyQnO1xuICB9XG5cbiAgLy8gcmVnZXggZm9yIGNvbnRhaW5zXG4gIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMpO1xufVxuXG5mdW5jdGlvbiBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZSkge1xuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgIXZhbHVlLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXFxeXFxcXFEuKlxcXFxFLyk7XG4gIHJldHVybiAhIW1hdGNoZXM7XG59XG5cbmZ1bmN0aW9uIGlzQWxsVmFsdWVzUmVnZXhPck5vbmUodmFsdWVzKSB7XG4gIGlmICghdmFsdWVzIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RWYWx1ZXNJc1JlZ2V4ID0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzWzBdLiRyZWdleCk7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGZpcnN0VmFsdWVzSXNSZWdleDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAxLCBsZW5ndGggPSB2YWx1ZXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoZmlyc3RWYWx1ZXNJc1JlZ2V4ICE9PSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbaV0uJHJlZ2V4KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKHZhbHVlcykge1xuICByZXR1cm4gdmFsdWVzLnNvbWUoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlLiRyZWdleCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKSB7XG4gIHJldHVybiByZW1haW5pbmdcbiAgICAuc3BsaXQoJycpXG4gICAgLm1hcCgoYykgPT4ge1xuICAgICAgY29uc3QgcmVnZXggPSBSZWdFeHAoJ1swLTkgXXxcXFxccHtMfScsICd1Jyk7IC8vIFN1cHBvcnQgYWxsIHVuaWNvZGUgbGV0dGVyIGNoYXJzXG4gICAgICBpZiAoYy5tYXRjaChyZWdleCkgIT09IG51bGwpIHtcbiAgICAgICAgLy8gZG9uJ3QgZXNjYXBlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzXG4gICAgICAgIHJldHVybiBjO1xuICAgICAgfVxuICAgICAgLy8gZXNjYXBlIGV2ZXJ5dGhpbmcgZWxzZSAoc2luZ2xlIHF1b3RlcyB3aXRoIHNpbmdsZSBxdW90ZXMsIGV2ZXJ5dGhpbmcgZWxzZSB3aXRoIGEgYmFja3NsYXNoKVxuICAgICAgcmV0dXJuIGMgPT09IGAnYCA/IGAnJ2AgOiBgXFxcXCR7Y31gO1xuICAgIH0pXG4gICAgLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBsaXRlcmFsaXplUmVnZXhQYXJ0KHM6IHN0cmluZykge1xuICBjb25zdCBtYXRjaGVyMSA9IC9cXFxcUSgoPyFcXFxcRSkuKilcXFxcRSQvO1xuICBjb25zdCByZXN1bHQxOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIxKTtcbiAgaWYgKHJlc3VsdDEgJiYgcmVzdWx0MS5sZW5ndGggPiAxICYmIHJlc3VsdDEuaW5kZXggPiAtMSkge1xuICAgIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgYW5kIGFuIGVuZCBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cigwLCByZXN1bHQxLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQxWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gcHJvY2VzcyByZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgY29uc3QgbWF0Y2hlcjIgPSAvXFxcXFEoKD8hXFxcXEUpLiopJC87XG4gIGNvbnN0IHJlc3VsdDI6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjIpO1xuICBpZiAocmVzdWx0MiAmJiByZXN1bHQyLmxlbmd0aCA+IDEgJiYgcmVzdWx0Mi5pbmRleCA+IC0xKSB7XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHIoMCwgcmVzdWx0Mi5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MlsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHJlbW92ZSBhbGwgaW5zdGFuY2VzIG9mIFxcUSBhbmQgXFxFIGZyb20gdGhlIHJlbWFpbmluZyB0ZXh0ICYgZXNjYXBlIHNpbmdsZSBxdW90ZXNcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxFKS8sICckMScpXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcUSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC9eXFxcXEUvLCAnJylcbiAgICAucmVwbGFjZSgvXlxcXFxRLywgJycpXG4gICAgLnJlcGxhY2UoLyhbXiddKScvLCBgJDEnJ2ApXG4gICAgLnJlcGxhY2UoL14nKFteJ10pLywgYCcnJDFgKTtcbn1cblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnXG4gICAgKTtcbiAgfSxcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXI7XG4iXX0=