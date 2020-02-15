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
      patterns.push(`ST_distance_sphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      sorts.push(`ST_distance_sphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) ASC`);
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
      patterns.push(`ST_distance_sphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
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
    caseInsensitive
  }) {
    debug('find', className, query, {
      skip,
      limit,
      sort,
      keys,
      caseInsensitive
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

    const qs = `SELECT ${columns} FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern}`;
    debug(qs, values);
    return this._client.any(qs, values).catch(error => {
      // Query on non existing table, don't crash
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }

      return [];
    }).then(results => results.map(object => this.postgresObjectToParseObject(className, object, schema)));
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

  async aggregate(className, schema, pipeline) {
    debug('aggregate', className, pipeline);
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

    const qs = `SELECT ${columns.join()} FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern} ${groupPattern}`;
    debug(qs, values);
    return this._client.map(qs, values, a => this.postgresObjectToParseObject(className, a, schema)).then(results => {
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
  } // TODO: implement?


  ensureIndex() {
    return Promise.resolve();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIuanMiXSwibmFtZXMiOlsiUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciIsIlBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVPYmplY3RFcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsIlBvc3RncmVzVHJhbnNhY3Rpb25BYm9ydGVkRXJyb3IiLCJsb2dnZXIiLCJyZXF1aXJlIiwiZGVidWciLCJhcmdzIiwiYXJndW1lbnRzIiwiY29uY2F0Iiwic2xpY2UiLCJsZW5ndGgiLCJsb2ciLCJnZXRMb2dnZXIiLCJhcHBseSIsInBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlIiwidHlwZSIsImNvbnRlbnRzIiwiSlNPTiIsInN0cmluZ2lmeSIsIlBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciIsIiRndCIsIiRsdCIsIiRndGUiLCIkbHRlIiwibW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzIiwiJGRheU9mTW9udGgiLCIkZGF5T2ZXZWVrIiwiJGRheU9mWWVhciIsIiRpc29EYXlPZldlZWsiLCIkaXNvV2Vla1llYXIiLCIkaG91ciIsIiRtaW51dGUiLCIkc2Vjb25kIiwiJG1pbGxpc2Vjb25kIiwiJG1vbnRoIiwiJHdlZWsiLCIkeWVhciIsInRvUG9zdGdyZXNWYWx1ZSIsInZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRyYW5zZm9ybVZhbHVlIiwib2JqZWN0SWQiLCJlbXB0eUNMUFMiLCJPYmplY3QiLCJmcmVlemUiLCJmaW5kIiwiZ2V0IiwiY291bnQiLCJjcmVhdGUiLCJ1cGRhdGUiLCJkZWxldGUiLCJhZGRGaWVsZCIsInByb3RlY3RlZEZpZWxkcyIsImRlZmF1bHRDTFBTIiwidG9QYXJzZVNjaGVtYSIsInNjaGVtYSIsImNsYXNzTmFtZSIsImZpZWxkcyIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfd3Blcm0iLCJfcnBlcm0iLCJjbHBzIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaW5kZXhlcyIsInRvUG9zdGdyZXNTY2hlbWEiLCJfcGFzc3dvcmRfaGlzdG9yeSIsImhhbmRsZURvdEZpZWxkcyIsIm9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwiZmllbGROYW1lIiwiaW5kZXhPZiIsImNvbXBvbmVudHMiLCJzcGxpdCIsImZpcnN0Iiwic2hpZnQiLCJjdXJyZW50T2JqIiwibmV4dCIsIl9fb3AiLCJ1bmRlZmluZWQiLCJ0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyIsIm1hcCIsImNtcHQiLCJpbmRleCIsInRyYW5zZm9ybURvdEZpZWxkIiwiam9pbiIsInRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkIiwic3Vic3RyIiwidmFsaWRhdGVLZXlzIiwia2V5IiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwiam9pblRhYmxlc0ZvclNjaGVtYSIsImxpc3QiLCJmaWVsZCIsInB1c2giLCJidWlsZFdoZXJlQ2xhdXNlIiwicXVlcnkiLCJjYXNlSW5zZW5zaXRpdmUiLCJwYXR0ZXJucyIsInZhbHVlcyIsInNvcnRzIiwiaXNBcnJheUZpZWxkIiwiaW5pdGlhbFBhdHRlcm5zTGVuZ3RoIiwiZmllbGRWYWx1ZSIsIiRleGlzdHMiLCJhdXRoRGF0YU1hdGNoIiwibWF0Y2giLCIkaW4iLCIkcmVnZXgiLCJNQVhfSU5UX1BMVVNfT05FIiwiY2xhdXNlcyIsImNsYXVzZVZhbHVlcyIsInN1YlF1ZXJ5IiwiY2xhdXNlIiwicGF0dGVybiIsIm9yT3JBbmQiLCJub3QiLCIkbmUiLCJjb25zdHJhaW50RmllbGROYW1lIiwicG9pbnQiLCJsb25naXR1ZGUiLCJsYXRpdHVkZSIsIiRlcSIsImlzSW5Pck5pbiIsIkFycmF5IiwiaXNBcnJheSIsIiRuaW4iLCJpblBhdHRlcm5zIiwiYWxsb3dOdWxsIiwibGlzdEVsZW0iLCJsaXN0SW5kZXgiLCJjcmVhdGVDb25zdHJhaW50IiwiYmFzZUFycmF5Iiwibm90SW4iLCJfIiwiZmxhdE1hcCIsImVsdCIsIklOVkFMSURfSlNPTiIsIiRhbGwiLCJpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoIiwiaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSIsImkiLCJwcm9jZXNzUmVnZXhQYXR0ZXJuIiwic3Vic3RyaW5nIiwiJGNvbnRhaW5lZEJ5IiwiYXJyIiwiJHRleHQiLCJzZWFyY2giLCIkc2VhcmNoIiwibGFuZ3VhZ2UiLCIkdGVybSIsIiRsYW5ndWFnZSIsIiRjYXNlU2Vuc2l0aXZlIiwiJGRpYWNyaXRpY1NlbnNpdGl2ZSIsIiRuZWFyU3BoZXJlIiwiZGlzdGFuY2UiLCIkbWF4RGlzdGFuY2UiLCJkaXN0YW5jZUluS00iLCIkd2l0aGluIiwiJGJveCIsImJveCIsImxlZnQiLCJib3R0b20iLCJyaWdodCIsInRvcCIsIiRnZW9XaXRoaW4iLCIkY2VudGVyU3BoZXJlIiwiY2VudGVyU3BoZXJlIiwiR2VvUG9pbnQiLCJHZW9Qb2ludENvZGVyIiwiaXNWYWxpZEpTT04iLCJfdmFsaWRhdGUiLCJpc05hTiIsIiRwb2x5Z29uIiwicG9seWdvbiIsInBvaW50cyIsImNvb3JkaW5hdGVzIiwiJGdlb0ludGVyc2VjdHMiLCIkcG9pbnQiLCJyZWdleCIsIm9wZXJhdG9yIiwib3B0cyIsIiRvcHRpb25zIiwicmVtb3ZlV2hpdGVTcGFjZSIsImNvbnZlcnRQb2x5Z29uVG9TUUwiLCJjbXAiLCJwZ0NvbXBhcmF0b3IiLCJwb3N0Z3Jlc1ZhbHVlIiwiY2FzdFR5cGUiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIl9jb2xsZWN0aW9uUHJlZml4IiwiY2xpZW50IiwicGdwIiwiX2NsaWVudCIsIl9wZ3AiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwiaGFuZGxlU2h1dGRvd24iLCIkcG9vbCIsImVuZCIsIl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzIiwiY29ubiIsIm5vbmUiLCJjYXRjaCIsImVycm9yIiwiY29kZSIsImNsYXNzRXhpc3RzIiwib25lIiwiYSIsImV4aXN0cyIsInNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIkNMUHMiLCJzZWxmIiwidGFzayIsInQiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJQcm9taXNlIiwicmVzb2x2ZSIsIl9pZF8iLCJfaWQiLCJkZWxldGVkSW5kZXhlcyIsImluc2VydGVkSW5kZXhlcyIsIklOVkFMSURfUVVFUlkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0eCIsImNyZWF0ZUluZGV4ZXMiLCJkcm9wSW5kZXhlcyIsImNyZWF0ZUNsYXNzIiwicTEiLCJjcmVhdGVUYWJsZSIsInEyIiwicTMiLCJiYXRjaCIsInRoZW4iLCJlcnIiLCJkYXRhIiwicmVzdWx0IiwiZGV0YWlsIiwiRFVQTElDQVRFX1ZBTFVFIiwidmFsdWVzQXJyYXkiLCJwYXR0ZXJuc0FycmF5IiwiYXNzaWduIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsInJlbGF0aW9ucyIsInBhcnNlVHlwZSIsInFzIiwiam9pblRhYmxlIiwic2NoZW1hVXBncmFkZSIsImNvbHVtbnMiLCJjb2x1bW5fbmFtZSIsIm5ld0NvbHVtbnMiLCJmaWx0ZXIiLCJpdGVtIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsInBvc3RncmVzVHlwZSIsImFueSIsInBhdGgiLCJkZWxldGVDbGFzcyIsIm9wZXJhdGlvbnMiLCJoZWxwZXJzIiwiZGVsZXRlQWxsQ2xhc3NlcyIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwicmVzdWx0cyIsImpvaW5zIiwicmVkdWNlIiwiY2xhc3NlcyIsInF1ZXJpZXMiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwiaWR4IiwiZ2V0QWxsQ2xhc3NlcyIsInJvdyIsImdldENsYXNzIiwiY3JlYXRlT2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2x1bW5zQXJyYXkiLCJnZW9Qb2ludHMiLCJwcm92aWRlciIsInBvcCIsImluaXRpYWxWYWx1ZXMiLCJ2YWwiLCJ0ZXJtaW5hdGlvbiIsImdlb1BvaW50c0luamVjdHMiLCJsIiwiY29sdW1uc1BhdHRlcm4iLCJjb2wiLCJ2YWx1ZXNQYXR0ZXJuIiwicHJvbWlzZSIsIm9wcyIsInVuZGVybHlpbmdFcnJvciIsImNvbnN0cmFpbnQiLCJtYXRjaGVzIiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ3aGVyZSIsIk9CSkVDVF9OT1RfRk9VTkQiLCJmaW5kT25lQW5kVXBkYXRlIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGVQYXR0ZXJucyIsIm9yaWdpbmFsVXBkYXRlIiwiZG90Tm90YXRpb25PcHRpb25zIiwiZ2VuZXJhdGUiLCJqc29uYiIsImxhc3RLZXkiLCJmaWVsZE5hbWVJbmRleCIsInN0ciIsImFtb3VudCIsIm9iamVjdHMiLCJrZXlzVG9JbmNyZW1lbnQiLCJrIiwiaW5jcmVtZW50UGF0dGVybnMiLCJjIiwia2V5c1RvRGVsZXRlIiwiZGVsZXRlUGF0dGVybnMiLCJwIiwidXBkYXRlT2JqZWN0IiwiZXhwZWN0ZWRUeXBlIiwicmVqZWN0Iiwid2hlcmVDbGF1c2UiLCJ1cHNlcnRPbmVPYmplY3QiLCJjcmVhdGVWYWx1ZSIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJoYXNMaW1pdCIsImhhc1NraXAiLCJ3aGVyZVBhdHRlcm4iLCJsaW1pdFBhdHRlcm4iLCJza2lwUGF0dGVybiIsInNvcnRQYXR0ZXJuIiwic29ydENvcHkiLCJzb3J0aW5nIiwidHJhbnNmb3JtS2V5IiwibWVtbyIsInBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdCIsInRhcmdldENsYXNzIiwieSIsIngiLCJjb29yZHMiLCJwYXJzZUZsb2F0IiwiY3JlYXRlZEF0IiwidG9JU09TdHJpbmciLCJ1cGRhdGVkQXQiLCJleHBpcmVzQXQiLCJlbnN1cmVVbmlxdWVuZXNzIiwiY29uc3RyYWludE5hbWUiLCJjb25zdHJhaW50UGF0dGVybnMiLCJtZXNzYWdlIiwicmVhZFByZWZlcmVuY2UiLCJlc3RpbWF0ZSIsImFwcHJveGltYXRlX3Jvd19jb3VudCIsImRpc3RpbmN0IiwiY29sdW1uIiwiaXNOZXN0ZWQiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybWVyIiwiY2hpbGQiLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsImNvdW50RmllbGQiLCJncm91cFZhbHVlcyIsImdyb3VwUGF0dGVybiIsInN0YWdlIiwiJGdyb3VwIiwiZ3JvdXBCeUZpZWxkcyIsImFsaWFzIiwib3BlcmF0aW9uIiwic291cmNlIiwiJHN1bSIsIiRtYXgiLCIkbWluIiwiJGF2ZyIsIiRwcm9qZWN0IiwiJG1hdGNoIiwiJG9yIiwiY29sbGFwc2UiLCJlbGVtZW50IiwibWF0Y2hQYXR0ZXJucyIsIiRsaW1pdCIsIiRza2lwIiwiJHNvcnQiLCJvcmRlciIsInBhcnNlSW50IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInByb21pc2VzIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiYWxsIiwic3FsIiwibWlzYyIsImpzb25PYmplY3RTZXRLZXlzIiwiYXJyYXkiLCJhZGQiLCJhZGRVbmlxdWUiLCJyZW1vdmUiLCJjb250YWluc0FsbCIsImNvbnRhaW5zQWxsUmVnZXgiLCJjb250YWlucyIsImR1cmF0aW9uIiwiY29uc29sZSIsImNyZWF0ZUluZGV4ZXNJZk5lZWRlZCIsImdldEluZGV4ZXMiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsInVwZGF0ZUVzdGltYXRlZENvdW50IiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJlbnN1cmVJbmRleCIsInVuaXF1ZSIsImFyIiwiZm91bmRJbmRleCIsInB0IiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZW5kc1dpdGgiLCJyZXBsYWNlIiwidHJpbSIsInMiLCJzdGFydHNXaXRoIiwibGl0ZXJhbGl6ZVJlZ2V4UGFydCIsImlzU3RhcnRzV2l0aFJlZ2V4IiwiZmlyc3RWYWx1ZXNJc1JlZ2V4Iiwic29tZSIsImNyZWF0ZUxpdGVyYWxSZWdleCIsInJlbWFpbmluZyIsIlJlZ0V4cCIsIm1hdGNoZXIxIiwicmVzdWx0MSIsInByZWZpeCIsIm1hdGNoZXIyIiwicmVzdWx0MiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUNBOztBQUVBOztBQUVBOztBQUNBOztBQWlCQTs7Ozs7Ozs7OztBQWZBLE1BQU1BLGlDQUFpQyxHQUFHLE9BQTFDO0FBQ0EsTUFBTUMsOEJBQThCLEdBQUcsT0FBdkM7QUFDQSxNQUFNQyw0QkFBNEIsR0FBRyxPQUFyQztBQUNBLE1BQU1DLDBCQUEwQixHQUFHLE9BQW5DO0FBQ0EsTUFBTUMsNEJBQTRCLEdBQUcsT0FBckM7QUFDQSxNQUFNQyxpQ0FBaUMsR0FBRyxPQUExQztBQUNBLE1BQU1DLCtCQUErQixHQUFHLE9BQXhDOztBQUNBLE1BQU1DLE1BQU0sR0FBR0MsT0FBTyxDQUFDLGlCQUFELENBQXRCOztBQUVBLE1BQU1DLEtBQUssR0FBRyxVQUFTLEdBQUdDLElBQVosRUFBdUI7QUFDbkNBLEVBQUFBLElBQUksR0FBRyxDQUFDLFNBQVNDLFNBQVMsQ0FBQyxDQUFELENBQW5CLEVBQXdCQyxNQUF4QixDQUErQkYsSUFBSSxDQUFDRyxL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Q0FBQ3piLE1BQVIsR0FBaUIsQ0FBNUIsSUFBaUN5YixPQUFPLENBQUM5VyxLQUFSLEdBQWdCLENBQUMsQ0FBdEQsRUFBeUQ7QUFDdkQsVUFBTTRXLE1BQU0sR0FBR1gsQ0FBQyxDQUFDN1YsTUFBRixDQUFTLENBQVQsRUFBWTBXLE9BQU8sQ0FBQzlXLEtBQXBCLENBQWY7QUFDQSxVQUFNd1csU0FBUyxHQUFHTSxPQUFPLENBQUMsQ0FBRCxDQUF6QjtBQUVBLFdBQU9YLG1CQUFtQixDQUFDUyxNQUFELENBQW5CLEdBQThCTCxrQkFBa0IsQ0FBQ0MsU0FBRCxDQUF2RDtBQUNELEdBbkJxQyxDQXFCdEM7OztBQUNBLFNBQU9QLENBQUMsQ0FDTEYsT0FESSxDQUNJLGNBREosRUFDb0IsSUFEcEIsRUFFSkEsT0FGSSxDQUVJLGNBRkosRUFFb0IsSUFGcEIsRUFHSkEsT0FISSxDQUdJLE1BSEosRUFHWSxFQUhaLEVBSUpBLE9BSkksQ0FJSSxNQUpKLEVBSVksRUFKWixFQUtKQSxPQUxJLENBS0ksU0FMSixFQUtnQixNQUxoQixFQU1KQSxPQU5JLENBTUksVUFOSixFQU1pQixNQU5qQixDQUFQO0FBT0Q7O0FBRUQsSUFBSXRRLGFBQWEsR0FBRztBQUNsQkMsRUFBQUEsV0FBVyxDQUFDekksS0FBRCxFQUFRO0FBQ2pCLFdBQ0UsT0FBT0EsS0FBUCxLQUFpQixRQUFqQixJQUE2QkEsS0FBSyxLQUFLLElBQXZDLElBQStDQSxLQUFLLENBQUNDLE1BQU4sS0FBaUIsVUFEbEU7QUFHRDs7QUFMaUIsQ0FBcEI7ZUFRZTRKLHNCIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbmltcG9ydCB7IGNyZWF0ZUNsaWVudCB9IGZyb20gJy4vUG9zdGdyZXNDbGllbnQnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgc3FsIGZyb20gJy4vc3FsJztcblxuY29uc3QgUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yID0gJzQyUDAxJztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciA9ICc0MlAwNyc7XG5jb25zdCBQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yID0gJzQyNzAxJztcbmNvbnN0IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yID0gJzQyNzAzJztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlT2JqZWN0RXJyb3IgPSAnNDI3MTAnO1xuY29uc3QgUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yID0gJzIzNTA1JztcbmNvbnN0IFBvc3RncmVzVHJhbnNhY3Rpb25BYm9ydGVkRXJyb3IgPSAnMjVQMDInO1xuY29uc3QgbG9nZ2VyID0gcmVxdWlyZSgnLi4vLi4vLi4vbG9nZ2VyJyk7XG5cbmNvbnN0IGRlYnVnID0gZnVuY3Rpb24oLi4uYXJnczogYW55KSB7XG4gIGFyZ3MgPSBbJ1BHOiAnICsgYXJndW1lbnRzWzBdXS5jb25jYXQoYXJncy5zbGljZSgxLCBhcmdzLmxlbmd0aCkpO1xuICBjb25zdCBsb2cgPSBsb2dnZXIuZ2V0TG9nZ2VyKCk7XG4gIGxvZy5kZWJ1Zy5hcHBseShsb2csIGFyZ3MpO1xufTtcblxuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuXG5jb25zdCBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSA9IHR5cGUgPT4ge1xuICBzd2l0Y2ggKHR5cGUudHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuICdjaGFyKDEwKSc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiAnZG91YmxlIHByZWNpc2lvbic7XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuICdwb2ludCc7XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gJ3BvbHlnb24nO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIGlmICh0eXBlLmNvbnRlbnRzICYmIHR5cGUuY29udGVudHMudHlwZSA9PT0gJ1N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuICd0ZXh0W10nO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IGBubyB0eXBlIGZvciAke0pTT04uc3RyaW5naWZ5KHR5cGUpfSB5ZXRgO1xuICB9XG59O1xuXG5jb25zdCBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IgPSB7XG4gICRndDogJz4nLFxuICAkbHQ6ICc8JyxcbiAgJGd0ZTogJz49JyxcbiAgJGx0ZTogJzw9Jyxcbn07XG5cbmNvbnN0IG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3JlcyA9IHtcbiAgJGRheU9mTW9udGg6ICdEQVknLFxuICAkZGF5T2ZXZWVrOiAnRE9XJyxcbiAgJGRheU9mWWVhcjogJ0RPWScsXG4gICRpc29EYXlPZldlZWs6ICdJU09ET1cnLFxuICAkaXNvV2Vla1llYXI6ICdJU09ZRUFSJyxcbiAgJGhvdXI6ICdIT1VSJyxcbiAgJG1pbnV0ZTogJ01JTlVURScsXG4gICRzZWNvbmQ6ICdTRUNPTkQnLFxuICAkbWlsbGlzZWNvbmQ6ICdNSUxMSVNFQ09ORFMnLFxuICAkbW9udGg6ICdNT05USCcsXG4gICR3ZWVrOiAnV0VFSycsXG4gICR5ZWFyOiAnWUVBUicsXG59O1xuXG5jb25zdCB0b1Bvc3RncmVzVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICByZXR1cm4gdmFsdWUuaXNvO1xuICAgIH1cbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuLy8gRHVwbGljYXRlIGZyb20gdGhlbiBtb25nbyBhZGFwdGVyLi4uXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGdldDoge30sXG4gIGNvdW50OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmNvbnN0IHRvUGFyc2VTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cbiAgaWYgKHNjaGVtYS5maWVsZHMpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICB9XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGlmIChzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5zY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH07XG4gIH1cbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKHNjaGVtYS5pbmRleGVzKSB7XG4gICAgaW5kZXhlcyA9IHsgLi4uc2NoZW1hLmluZGV4ZXMgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXMsXG4gIH07XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGhhbmRsZURvdEZpZWxkcyA9IG9iamVjdCA9PiB7XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgb2JqZWN0W2ZpcnN0XSA9IG9iamVjdFtmaXJzdF0gfHwge307XG4gICAgICBsZXQgY3VycmVudE9iaiA9IG9iamVjdFtmaXJzdF07XG4gICAgICBsZXQgbmV4dDtcbiAgICAgIGxldCB2YWx1ZSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHZhbHVlID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgIHdoaWxlICgobmV4dCA9IGNvbXBvbmVudHMuc2hpZnQoKSkpIHtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgICBjdXJyZW50T2JqW25leHRdID0gY3VycmVudE9ialtuZXh0XSB8fCB7fTtcbiAgICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRPYmogPSBjdXJyZW50T2JqW25leHRdO1xuICAgICAgfVxuICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyA9IGZpZWxkTmFtZSA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKS5tYXAoKGNtcHQsIGluZGV4KSA9PiB7XG4gICAgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICByZXR1cm4gYFwiJHtjbXB0fVwiYDtcbiAgICB9XG4gICAgcmV0dXJuIGAnJHtjbXB0fSdgO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgcmV0dXJuIGBcIiR7ZmllbGROYW1lfVwiYDtcbiAgfVxuICBjb25zdCBjb21wb25lbnRzID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKTtcbiAgbGV0IG5hbWUgPSBjb21wb25lbnRzLnNsaWNlKDAsIGNvbXBvbmVudHMubGVuZ3RoIC0gMSkuam9pbignLT4nKTtcbiAgbmFtZSArPSAnLT4+JyArIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIG5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmICh0eXBlb2YgZmllbGROYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBmaWVsZE5hbWU7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfY3JlYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ2NyZWF0ZWRBdCc7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfdXBkYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ3VwZGF0ZWRBdCc7XG4gIH1cbiAgcmV0dXJuIGZpZWxkTmFtZS5zdWJzdHIoMSk7XG59O1xuXG5jb25zdCB2YWxpZGF0ZUtleXMgPSBvYmplY3QgPT4ge1xuICBpZiAodHlwZW9mIG9iamVjdCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB2YWxpZGF0ZUtleXMob2JqZWN0W2tleV0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoa2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFJldHVybnMgdGhlIGxpc3Qgb2Ygam9pbiB0YWJsZXMgb24gYSBzY2hlbWFcbmNvbnN0IGpvaW5UYWJsZXNGb3JTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGlmIChzY2hlbWEpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChgX0pvaW46JHtmaWVsZH06JHtzY2hlbWEuY2xhc3NOYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBsaXN0O1xufTtcblxuaW50ZXJmYWNlIFdoZXJlQ2xhdXNlIHtcbiAgcGF0dGVybjogc3RyaW5nO1xuICB2YWx1ZXM6IEFycmF5PGFueT47XG4gIHNvcnRzOiBBcnJheTxhbnk+O1xufVxuXG5jb25zdCBidWlsZFdoZXJlQ2xhdXNlID0gKHtcbiAgc2NoZW1hLFxuICBxdWVyeSxcbiAgaW5kZXgsXG4gIGNhc2VJbnNlbnNpdGl2ZSxcbn0pOiBXaGVyZUNsYXVzZSA9PiB7XG4gIGNvbnN0IHBhdHRlcm5zID0gW107XG4gIGxldCB2YWx1ZXMgPSBbXTtcbiAgY29uc3Qgc29ydHMgPSBbXTtcblxuICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSc7XG4gICAgY29uc3QgaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID0gcGF0dGVybnMubGVuZ3RoO1xuICAgIGNvbnN0IGZpZWxkVmFsdWUgPSBxdWVyeVtmaWVsZE5hbWVdO1xuXG4gICAgLy8gbm90aGluZyBpbiB0aGUgc2NoZW1hLCBpdCdzIGdvbm5hIGJsb3cgdXBcbiAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgLy8gYXMgaXQgd29uJ3QgZXhpc3RcbiAgICAgIGlmIChmaWVsZFZhbHVlICYmIGZpZWxkVmFsdWUuJGV4aXN0cyA9PT0gZmFsc2UpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAvLyBUT0RPOiBIYW5kbGUgcXVlcnlpbmcgYnkgX2F1dGhfZGF0YV9wcm92aWRlciwgYXV0aERhdGEgaXMgc3RvcmVkIGluIGF1dGhEYXRhIGZpZWxkXG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgY2FzZUluc2Vuc2l0aXZlICYmXG4gICAgICAoZmllbGROYW1lID09PSAndXNlcm5hbWUnIHx8IGZpZWxkTmFtZSA9PT0gJ2VtYWlsJylcbiAgICApIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYExPV0VSKCQke2luZGV4fTpuYW1lKSA9IExPV0VSKCQke2luZGV4ICsgMX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgbGV0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKG5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRpbikge1xuICAgICAgICAgIG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpyYXcpOjpqc29uYiBAPiAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGluKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgICAgIC8vIEhhbmRsZSBsYXRlclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgPSAkJHtpbmRleCArIDF9Ojp0ZXh0YCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCBmaWVsZFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIC8vIENhbid0IGNhc3QgYm9vbGVhbiB0byBkb3VibGUgcHJlY2lzaW9uXG4gICAgICBpZiAoXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ051bWJlcidcbiAgICAgICkge1xuICAgICAgICAvLyBTaG91bGQgYWx3YXlzIHJldHVybiB6ZXJvIHJlc3VsdHNcbiAgICAgICAgY29uc3QgTUFYX0lOVF9QTFVTX09ORSA9IDkyMjMzNzIwMzY4NTQ3NzU4MDg7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgTUFYX0lOVF9QTFVTX09ORSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgfVxuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKFsnJG9yJywgJyRub3InLCAnJGFuZCddLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgIGNvbnN0IGNsYXVzZXMgPSBbXTtcbiAgICAgIGNvbnN0IGNsYXVzZVZhbHVlcyA9IFtdO1xuICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKHN1YlF1ZXJ5ID0+IHtcbiAgICAgICAgY29uc3QgY2xhdXNlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIHF1ZXJ5OiBzdWJRdWVyeSxcbiAgICAgICAgICBpbmRleCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2xhdXNlLnBhdHRlcm4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsYXVzZXMucHVzaChjbGF1c2UucGF0dGVybik7XG4gICAgICAgICAgY2xhdXNlVmFsdWVzLnB1c2goLi4uY2xhdXNlLnZhbHVlcyk7XG4gICAgICAgICAgaW5kZXggKz0gY2xhdXNlLnZhbHVlcy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvck9yQW5kID0gZmllbGROYW1lID09PSAnJGFuZCcgPyAnIEFORCAnIDogJyBPUiAnO1xuICAgICAgY29uc3Qgbm90ID0gZmllbGROYW1lID09PSAnJG5vcicgPyAnIE5PVCAnIDogJyc7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSgke2NsYXVzZXMuam9pbihvck9yQW5kKX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaCguLi5jbGF1c2VWYWx1ZXMpO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuJG5lID0gSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWUuJG5lXSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYE5PVCBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGlmIG5vdCBudWxsLCB3ZSBuZWVkIHRvIG1hbnVhbGx5IGV4Y2x1ZGUgbnVsbFxuICAgICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggK1xuICAgICAgICAgICAgICAgIDJ9KSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgY29uc3QgY29uc3RyYWludEZpZWxkTmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgICAgYCgke2NvbnN0cmFpbnRGaWVsZE5hbWV9IDw+ICQke2luZGV4fSBPUiAke2NvbnN0cmFpbnRGaWVsZE5hbWV9IElTIE5VTEwpYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCQke2luZGV4fTpuYW1lIDw+ICQke2luZGV4ICsgMX0gT1IgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTClgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kbmU7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBUT0RPOiBzdXBwb3J0IGFycmF5c1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJG5lKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGVxICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRlcSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGRWYWx1ZS4kZXEpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0gPSAkJHtpbmRleCsrfWApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS4kZXEpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgaXNJbk9yTmluID1cbiAgICAgIEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pIHx8IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kbmluKTtcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSAmJlxuICAgICAgaXNBcnJheUZpZWxkICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJ1xuICAgICkge1xuICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgbGV0IGFsbG93TnVsbCA9IGZhbHNlO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGZpZWxkVmFsdWUuJGluLmZvckVhY2goKGxpc3RFbGVtLCBsaXN0SW5kZXgpID0+IHtcbiAgICAgICAgaWYgKGxpc3RFbGVtID09PSBudWxsKSB7XG4gICAgICAgICAgYWxsb3dOdWxsID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChsaXN0RWxlbSk7XG4gICAgICAgICAgaW5QYXR0ZXJucy5wdXNoKGAkJHtpbmRleCArIDEgKyBsaXN0SW5kZXggLSAoYWxsb3dOdWxsID8gMSA6IDApfWApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChhbGxvd051bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICBgKCQke2luZGV4fTpuYW1lIElTIE5VTEwgT1IgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dKWBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICB9IGVsc2UgaWYgKGlzSW5Pck5pbikge1xuICAgICAgdmFyIGNyZWF0ZUNvbnN0cmFpbnQgPSAoYmFzZUFycmF5LCBub3RJbikgPT4ge1xuICAgICAgICBjb25zdCBub3QgPSBub3RJbiA/ICcgTk9UICcgOiAnJztcbiAgICAgICAgaWYgKGJhc2VBcnJheS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgYCR7bm90fSBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShiYXNlQXJyYXkpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEhhbmRsZSBOZXN0ZWQgRG90IE5vdGF0aW9uIEFib3ZlXG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICBiYXNlQXJyYXkuZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICAgICAgICBpZiAobGlzdEVsZW0gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleH1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke25vdH0gSU4gKCR7aW5QYXR0ZXJucy5qb2luKCl9KWApO1xuICAgICAgICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIW5vdEluKSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgICAgaW5kZXggPSBpbmRleCArIDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGFycmF5XG4gICAgICAgICAgaWYgKG5vdEluKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMScpOyAvLyBSZXR1cm4gYWxsIHZhbHVlc1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMicpOyAvLyBSZXR1cm4gbm8gdmFsdWVzXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJGluLCBlbHQgPT4gZWx0KSxcbiAgICAgICAgICBmYWxzZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5pbikge1xuICAgICAgICBjcmVhdGVDb25zdHJhaW50KFxuICAgICAgICAgIF8uZmxhdE1hcChmaWVsZFZhbHVlLiRuaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRpbiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGluIHZhbHVlJyk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkbmluIHZhbHVlJyk7XG4gICAgfVxuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSAmJiBpc0FycmF5RmllbGQpIHtcbiAgICAgIGlmIChpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgaWYgKCFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgZmllbGRWYWx1ZS4kYWxsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRWYWx1ZS4kYWxsLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKGZpZWxkVmFsdWUuJGFsbFtpXS4kcmVnZXgpO1xuICAgICAgICAgIGZpZWxkVmFsdWUuJGFsbFtpXSA9IHZhbHVlLnN1YnN0cmluZygxKSArICclJztcbiAgICAgICAgfVxuICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGBhcnJheV9jb250YWluc19hbGxfcmVnZXgoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYGFycmF5X2NvbnRhaW5zX2FsbCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRhbGwpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRhbGwubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGFsbFswXS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kZXhpc3RzKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICB9XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaW5kZXggKz0gMTtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kY29udGFpbmVkQnkpIHtcbiAgICAgIGNvbnN0IGFyciA9IGZpZWxkVmFsdWUuJGNvbnRhaW5lZEJ5O1xuICAgICAgaWYgKCEoYXJyIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkY29udGFpbmVkQnk6IHNob3VsZCBiZSBhbiBhcnJheWBcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPEAgJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoYXJyKSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR0ZXh0KSB7XG4gICAgICBjb25zdCBzZWFyY2ggPSBmaWVsZFZhbHVlLiR0ZXh0LiRzZWFyY2g7XG4gICAgICBsZXQgbGFuZ3VhZ2UgPSAnZW5nbGlzaCc7XG4gICAgICBpZiAodHlwZW9mIHNlYXJjaCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFzZWFyY2guJHRlcm0gfHwgdHlwZW9mIHNlYXJjaC4kdGVybSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2BcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGxhbmd1YWdlICYmIHR5cGVvZiBzZWFyY2guJGxhbmd1YWdlICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRsYW5ndWFnZSwgc2hvdWxkIGJlIHN0cmluZ2BcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRsYW5ndWFnZSkge1xuICAgICAgICBsYW5ndWFnZSA9IHNlYXJjaC4kbGFuZ3VhZ2U7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICYmIHR5cGVvZiBzZWFyY2guJGNhc2VTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRjYXNlU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUgbm90IHN1cHBvcnRlZCwgcGxlYXNlIHVzZSAkcmVnZXggb3IgY3JlYXRlIGEgc2VwYXJhdGUgbG93ZXIgY2FzZSBjb2x1bW4uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAmJlxuICAgICAgICB0eXBlb2Ygc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlID09PSBmYWxzZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRkaWFjcml0aWNTZW5zaXRpdmUgLSBmYWxzZSBub3Qgc3VwcG9ydGVkLCBpbnN0YWxsIFBvc3RncmVzIFVuYWNjZW50IEV4dGVuc2lvbmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGB0b190c3ZlY3RvcigkJHtpbmRleH0sICQke2luZGV4ICsgMX06bmFtZSkgQEAgdG9fdHNxdWVyeSgkJHtpbmRleCArXG4gICAgICAgICAgMn0sICQke2luZGV4ICsgM30pYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGxhbmd1YWdlLCBmaWVsZE5hbWUsIGxhbmd1YWdlLCBzZWFyY2guJHRlcm0pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kbmVhclNwaGVyZSkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRuZWFyU3BoZXJlO1xuICAgICAgY29uc3QgZGlzdGFuY2UgPSBmaWVsZFZhbHVlLiRtYXhEaXN0YW5jZTtcbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfZGlzdGFuY2Vfc3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggK1xuICAgICAgICAgIDF9LCAkJHtpbmRleCArIDJ9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgc29ydHMucHVzaChcbiAgICAgICAgYFNUX2Rpc3RhbmNlX3NwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICtcbiAgICAgICAgICAxfSwgJCR7aW5kZXggKyAyfSk6Omdlb21ldHJ5KSBBU0NgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kd2l0aGluICYmIGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94KSB7XG4gICAgICBjb25zdCBib3ggPSBmaWVsZFZhbHVlLiR3aXRoaW4uJGJveDtcbiAgICAgIGNvbnN0IGxlZnQgPSBib3hbMF0ubG9uZ2l0dWRlO1xuICAgICAgY29uc3QgYm90dG9tID0gYm94WzBdLmxhdGl0dWRlO1xuICAgICAgY29uc3QgcmlnaHQgPSBib3hbMV0ubG9uZ2l0dWRlO1xuICAgICAgY29uc3QgdG9wID0gYm94WzFdLmxhdGl0dWRlO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9pbnQgPEAgJCR7aW5kZXggKyAxfTo6Ym94YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoKCR7bGVmdH0sICR7Ym90dG9tfSksICgke3JpZ2h0fSwgJHt0b3B9KSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb1dpdGhpbiAmJiBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZSkge1xuICAgICAgY29uc3QgY2VudGVyU3BoZXJlID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRjZW50ZXJTcGhlcmU7XG4gICAgICBpZiAoIShjZW50ZXJTcGhlcmUgaW5zdGFuY2VvZiBBcnJheSkgfHwgY2VudGVyU3BoZXJlLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgc2hvdWxkIGJlIGFuIGFycmF5IG9mIFBhcnNlLkdlb1BvaW50IGFuZCBkaXN0YW5jZSdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIEdldCBwb2ludCwgY29udmVydCB0byBnZW8gcG9pbnQgaWYgbmVjZXNzYXJ5IGFuZCB2YWxpZGF0ZVxuICAgICAgbGV0IHBvaW50ID0gY2VudGVyU3BoZXJlWzBdO1xuICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICB9IGVsc2UgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBnZW8gcG9pbnQgaW52YWxpZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIC8vIEdldCBkaXN0YW5jZSBhbmQgdmFsaWRhdGVcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gY2VudGVyU3BoZXJlWzFdO1xuICAgICAgaWYgKGlzTmFOKGRpc3RhbmNlKSB8fCBkaXN0YW5jZSA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZGlzdGFuY2UgaW52YWxpZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfZGlzdGFuY2Vfc3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggK1xuICAgICAgICAgIDF9LCAkJHtpbmRleCArIDJ9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbikge1xuICAgICAgY29uc3QgcG9seWdvbiA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbjtcbiAgICAgIGxldCBwb2ludHM7XG4gICAgICBpZiAodHlwZW9mIHBvbHlnb24gPT09ICdvYmplY3QnICYmIHBvbHlnb24uX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgaWYgKCFwb2x5Z29uLmNvb3JkaW5hdGVzIHx8IHBvbHlnb24uY29vcmRpbmF0ZXMubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgUG9seWdvbi5jb29yZGluYXRlcyBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIGxvbi9sYXQgcGFpcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uLmNvb3JkaW5hdGVzO1xuICAgICAgfSBlbHNlIGlmIChwb2x5Z29uIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBHZW9Qb2ludHMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBcImJhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgYmUgUG9seWdvbiBvYmplY3Qgb3IgQXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQnc1wiXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwb2ludHMgPSBwb2ludHNcbiAgICAgICAgLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICAgIHJldHVybiBgKCR7cG9pbnRbMF19LCAke3BvaW50WzFdfSlgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWUnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oJywgJyk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludHN9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMgJiYgZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQpIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQ7XG4gICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9JbnRlcnNlY3QgdmFsdWU7ICRwb2ludCBzaG91bGQgYmUgR2VvUG9pbnQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9seWdvbiBAPiAkJHtpbmRleCArIDF9Ojpwb2ludGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgbGV0IHJlZ2V4ID0gZmllbGRWYWx1ZS4kcmVnZXg7XG4gICAgICBsZXQgb3BlcmF0b3IgPSAnfic7XG4gICAgICBjb25zdCBvcHRzID0gZmllbGRWYWx1ZS4kb3B0aW9ucztcbiAgICAgIGlmIChvcHRzKSB7XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ2knKSA+PSAwKSB7XG4gICAgICAgICAgb3BlcmF0b3IgPSAnfionO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ3gnKSA+PSAwKSB7XG4gICAgICAgICAgcmVnZXggPSByZW1vdmVXaGl0ZVNwYWNlKHJlZ2V4KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBuYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgIHJlZ2V4ID0gcHJvY2Vzc1JlZ2V4UGF0dGVybihyZWdleCk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgJHtvcGVyYXRvcn0gJyQke2luZGV4ICsgMX06cmF3J2ApO1xuICAgICAgdmFsdWVzLnB1c2gobmFtZSwgcmVnZXgpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZV0pKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5pc28pO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGluZGV4ICs9IDM7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgIGlmIChmaWVsZFZhbHVlW2NtcF0gfHwgZmllbGRWYWx1ZVtjbXBdID09PSAwKSB7XG4gICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICBjb25zdCBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWVbY21wXSk7XG4gICAgICAgIGxldCBjb25zdHJhaW50RmllbGROYW1lO1xuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgbGV0IGNhc3RUeXBlO1xuICAgICAgICAgIHN3aXRjaCAodHlwZW9mIHBvc3RncmVzVmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICAgIGNhc3RUeXBlID0gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgICAgICBjYXN0VHlwZSA9ICdib29sZWFuJztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICBjYXN0VHlwZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3RyYWludEZpZWxkTmFtZSA9IGNhc3RUeXBlXG4gICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBgJCR7aW5kZXgrK306bmFtZWA7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgfVxuICAgICAgICB2YWx1ZXMucHVzaChwb3N0Z3Jlc1ZhbHVlKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXgrK31gKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChpbml0aWFsUGF0dGVybnNMZW5ndGggPT09IHBhdHRlcm5zLmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgUG9zdGdyZXMgZG9lc24ndCBzdXBwb3J0IHRoaXMgcXVlcnkgdHlwZSB5ZXQgJHtKU09OLnN0cmluZ2lmeShcbiAgICAgICAgICBmaWVsZFZhbHVlXG4gICAgICAgICl9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgdmFsdWVzID0gdmFsdWVzLm1hcCh0cmFuc2Zvcm1WYWx1ZSk7XG4gIHJldHVybiB7IHBhdHRlcm46IHBhdHRlcm5zLmpvaW4oJyBBTkQgJyksIHZhbHVlcywgc29ydHMgfTtcbn07XG5cbmV4cG9ydCBjbGFzcyBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICBjYW5Tb3J0T25Kb2luVGFibGVzOiBib29sZWFuO1xuXG4gIC8vIFByaXZhdGVcbiAgX2NvbGxlY3Rpb25QcmVmaXg6IHN0cmluZztcbiAgX2NsaWVudDogYW55O1xuICBfcGdwOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoeyB1cmksIGNvbGxlY3Rpb25QcmVmaXggPSAnJywgZGF0YWJhc2VPcHRpb25zIH06IGFueSkge1xuICAgIHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggPSBjb2xsZWN0aW9uUHJlZml4O1xuICAgIGNvbnN0IHsgY2xpZW50LCBwZ3AgfSA9IGNyZWF0ZUNsaWVudCh1cmksIGRhdGFiYXNlT3B0aW9ucyk7XG4gICAgdGhpcy5fY2xpZW50ID0gY2xpZW50O1xuICAgIHRoaXMuX3BncCA9IHBncDtcbiAgICB0aGlzLmNhblNvcnRPbkpvaW5UYWJsZXMgPSBmYWxzZTtcbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGlmICghdGhpcy5fY2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuX2NsaWVudC4kcG9vbC5lbmQoKTtcbiAgfVxuXG4gIGFzeW5jIF9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBhd2FpdCBjb25uXG4gICAgICAubm9uZShcbiAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIFwiX1NDSEVNQVwiICggXCJjbGFzc05hbWVcIiB2YXJDaGFyKDEyMCksIFwic2NoZW1hXCIganNvbmIsIFwiaXNQYXJzZUNsYXNzXCIgYm9vbCwgUFJJTUFSWSBLRVkgKFwiY2xhc3NOYW1lXCIpICknXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIHx8XG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yIHx8XG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVPYmplY3RFcnJvclxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBUYWJsZSBhbHJlYWR5IGV4aXN0cywgbXVzdCBoYXZlIGJlZW4gY3JlYXRlZCBieSBhIGRpZmZlcmVudCByZXF1ZXN0LiBJZ25vcmUgZXJyb3IuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5vbmUoXG4gICAgICAnU0VMRUNUIEVYSVNUUyAoU0VMRUNUIDEgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzIFdIRVJFIHRhYmxlX25hbWUgPSAkMSknLFxuICAgICAgW25hbWVdLFxuICAgICAgYSA9PiBhLmV4aXN0c1xuICAgICk7XG4gIH1cblxuICBhc3luYyBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50YXNrKCdzZXQtY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGF3YWl0IHNlbGYuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHModCk7XG4gICAgICBjb25zdCB2YWx1ZXMgPSBbXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgJ3NjaGVtYScsXG4gICAgICAgICdjbGFzc0xldmVsUGVybWlzc2lvbnMnLFxuICAgICAgICBKU09OLnN0cmluZ2lmeShDTFBzKSxcbiAgICAgIF07XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgIGBVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlc1xuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEluZGV4ZXM6IGFueSxcbiAgICBleGlzdGluZ0luZGV4ZXM6IGFueSA9IHt9LFxuICAgIGZpZWxkczogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGlmIChzdWJtaXR0ZWRJbmRleGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nSW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgICBleGlzdGluZ0luZGV4ZXMgPSB7IF9pZF86IHsgX2lkOiAxIH0gfTtcbiAgICB9XG4gICAgY29uc3QgZGVsZXRlZEluZGV4ZXMgPSBbXTtcbiAgICBjb25zdCBpbnNlcnRlZEluZGV4ZXMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRJbmRleGVzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRJbmRleGVzW25hbWVdO1xuICAgICAgaWYgKGV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIGRlbGV0ZWRJbmRleGVzLnB1c2gobmFtZSk7XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0luZGV4ZXNbbmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3Qua2V5cyhmaWVsZCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkcywga2V5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICBgRmllbGQgJHtrZXl9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgYWRkIGluZGV4LmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzW25hbWVdID0gZmllbGQ7XG4gICAgICAgIGluc2VydGVkSW5kZXhlcy5wdXNoKHtcbiAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgIG5hbWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IGNvbm4udHgoJ3NldC1pbmRleGVzLXdpdGgtc2NoZW1hLWZvcm1hdCcsIGFzeW5jIHQgPT4ge1xuICAgICAgaWYgKGluc2VydGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGF3YWl0IHNlbGYuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcywgdCk7XG4gICAgICB9XG4gICAgICBpZiAoZGVsZXRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmRyb3BJbmRleGVzKGNsYXNzTmFtZSwgZGVsZXRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgYXdhaXQgc2VsZi5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyh0KTtcbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgJDI6bmFtZSA9IGpzb25fb2JqZWN0X3NldF9rZXkoJDI6bmFtZSwgJDM6OnRleHQsICQ0Ojpqc29uYikgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxJyxcbiAgICAgICAgW2NsYXNzTmFtZSwgJ3NjaGVtYScsICdpbmRleGVzJywgSlNPTi5zdHJpbmdpZnkoZXhpc3RpbmdJbmRleGVzKV1cbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiA/YW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIHJldHVybiBjb25uXG4gICAgICAudHgoJ2NyZWF0ZS1jbGFzcycsIGFzeW5jIHQgPT4ge1xuICAgICAgICBjb25zdCBxMSA9IHRoaXMuY3JlYXRlVGFibGUoY2xhc3NOYW1lLCBzY2hlbWEsIHQpO1xuICAgICAgICBjb25zdCBxMiA9IHQubm9uZShcbiAgICAgICAgICAnSU5TRVJUIElOVE8gXCJfU0NIRU1BXCIgKFwiY2xhc3NOYW1lXCIsIFwic2NoZW1hXCIsIFwiaXNQYXJzZUNsYXNzXCIpIFZBTFVFUyAoJDxjbGFzc05hbWU+LCAkPHNjaGVtYT4sIHRydWUpJyxcbiAgICAgICAgICB7IGNsYXNzTmFtZSwgc2NoZW1hIH1cbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgcTMgPSB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBzY2hlbWEuaW5kZXhlcyxcbiAgICAgICAgICB7fSxcbiAgICAgICAgICBzY2hlbWEuZmllbGRzLFxuICAgICAgICAgIHRcbiAgICAgICAgKTtcbiAgICAgICAgLy8gVE9ETzogVGhlIHRlc3Qgc2hvdWxkIG5vdCB2ZXJpZnkgdGhlIHJldHVybmVkIHZhbHVlLCBhbmQgdGhlblxuICAgICAgICAvLyAgdGhlIG1ldGhvZCBjYW4gYmUgc2ltcGxpZmllZCwgdG8gYXZvaWQgcmV0dXJuaW5nIHVzZWxlc3Mgc3R1ZmYuXG4gICAgICAgIHJldHVybiB0LmJhdGNoKFtxMSwgcTIsIHEzXSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdG9QYXJzZVNjaGVtYShzY2hlbWEpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmRhdGFbMF0ucmVzdWx0LmNvZGUgPT09IFBvc3RncmVzVHJhbnNhY3Rpb25BYm9ydGVkRXJyb3IpIHtcbiAgICAgICAgICBlcnIgPSBlcnIuZGF0YVsxXS5yZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIGVyci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgICBlcnIuZGV0YWlsLmluY2x1ZGVzKGNsYXNzTmFtZSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIEp1c3QgY3JlYXRlIGEgdGFibGUsIGRvIG5vdCBpbnNlcnQgaW4gc2NoZW1hXG4gIGFzeW5jIGNyZWF0ZVRhYmxlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBkZWJ1ZygnY3JlYXRlVGFibGUnLCBjbGFzc05hbWUsIHNjaGVtYSk7XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBjb25zdCBwYXR0ZXJuc0FycmF5ID0gW107XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmFzc2lnbih7fSwgc2NoZW1hLmZpZWxkcyk7XG4gICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9mYWlsZWRfbG9naW5fY291bnQgPSB7IHR5cGU6ICdOdW1iZXInIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gICAgfVxuICAgIGxldCBpbmRleCA9IDI7XG4gICAgY29uc3QgcmVsYXRpb25zID0gW107XG4gICAgT2JqZWN0LmtleXMoZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBjb25zdCBwYXJzZVR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgIC8vIFNraXAgd2hlbiBpdCdzIGEgcmVsYXRpb25cbiAgICAgIC8vIFdlJ2xsIGNyZWF0ZSB0aGUgdGFibGVzIGxhdGVyXG4gICAgICBpZiAocGFyc2VUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmVsYXRpb25zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHBhcnNlVHlwZS5jb250ZW50cyA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIH1cbiAgICAgIHZhbHVlc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2gocGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUocGFyc2VUeXBlKSk7XG4gICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYCQke2luZGV4fTpuYW1lICQke2luZGV4ICsgMX06cmF3YCk7XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgUFJJTUFSWSBLRVkgKCQke2luZGV4fTpuYW1lKWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDI7XG4gICAgfSk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDE6bmFtZSAoJHtwYXR0ZXJuc0FycmF5LmpvaW4oKX0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi52YWx1ZXNBcnJheV07XG5cbiAgICBkZWJ1ZyhxcywgdmFsdWVzKTtcbiAgICByZXR1cm4gY29ubi50YXNrKCdjcmVhdGUtdGFibGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHNlbGYuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHModCk7XG4gICAgICAgIGF3YWl0IHQubm9uZShxcywgdmFsdWVzKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBUYWJsZSBhbHJlYWR5IGV4aXN0cywgbXVzdCBoYXZlIGJlZW4gY3JlYXRlZCBieSBhIGRpZmZlcmVudCByZXF1ZXN0LiBJZ25vcmUgdGhlIGVycm9yLlxuICAgICAgfVxuICAgICAgYXdhaXQgdC50eCgnY3JlYXRlLXRhYmxlLXR4JywgdHggPT4ge1xuICAgICAgICByZXR1cm4gdHguYmF0Y2goXG4gICAgICAgICAgcmVsYXRpb25zLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHR4Lm5vbmUoXG4gICAgICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzY2hlbWFVcGdyYWRlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGRlYnVnKCdzY2hlbWFVcGdyYWRlJywgeyBjbGFzc05hbWUsIHNjaGVtYSB9KTtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBhd2FpdCBjb25uLnR4KCdzY2hlbWEtdXBncmFkZScsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgY29sdW1ucyA9IGF3YWl0IHQubWFwKFxuICAgICAgICAnU0VMRUNUIGNvbHVtbl9uYW1lIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgV0hFUkUgdGFibGVfbmFtZSA9ICQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgY2xhc3NOYW1lIH0sXG4gICAgICAgIGEgPT4gYS5jb2x1bW5fbmFtZVxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5ld0NvbHVtbnMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gY29sdW1ucy5pbmRleE9mKGl0ZW0pID09PSAtMSlcbiAgICAgICAgLm1hcChmaWVsZE5hbWUgPT5cbiAgICAgICAgICBzZWxmLmFkZEZpZWxkSWZOb3RFeGlzdHMoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0sXG4gICAgICAgICAgICB0XG4gICAgICAgICAgKVxuICAgICAgICApO1xuXG4gICAgICBhd2FpdCB0LmJhdGNoKG5ld0NvbHVtbnMpO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgYWRkRmllbGRJZk5vdEV4aXN0cyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBhbnksXG4gICAgY29ubjogYW55XG4gICkge1xuICAgIC8vIFRPRE86IE11c3QgYmUgcmV2aXNlZCBmb3IgaW52YWxpZCBsb2dpYy4uLlxuICAgIGRlYnVnKCdhZGRGaWVsZElmTm90RXhpc3RzJywgeyBjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSB9KTtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgYXdhaXQgY29ubi50eCgnYWRkLWZpZWxkLWlmLW5vdC1leGlzdHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGlmICh0eXBlLnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgICAnQUxURVIgVEFCTEUgJDxjbGFzc05hbWU6bmFtZT4gQUREIENPTFVNTiAkPGZpZWxkTmFtZTpuYW1lPiAkPHBvc3RncmVzVHlwZTpyYXc+JyxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgICAgIHBvc3RncmVzVHlwZTogcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUodHlwZSksXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gc2VsZi5jcmVhdGVDbGFzcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGZpZWxkczogeyBbZmllbGROYW1lXTogdHlwZSB9IH0sXG4gICAgICAgICAgICAgIHRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gQ29sdW1uIGFscmVhZHkgZXhpc3RzLCBjcmVhdGVkIGJ5IG90aGVyIHJlcXVlc3QuIENhcnJ5IG9uIHRvIHNlZSBpZiBpdCdzIHRoZSByaWdodCB0eXBlLlxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQ8am9pblRhYmxlOm5hbWU+IChcInJlbGF0ZWRJZFwiIHZhckNoYXIoMTIwKSwgXCJvd25pbmdJZFwiIHZhckNoYXIoMTIwKSwgUFJJTUFSWSBLRVkoXCJyZWxhdGVkSWRcIiwgXCJvd25pbmdJZFwiKSApJyxcbiAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdC5hbnkoXG4gICAgICAgICdTRUxFQ1QgXCJzY2hlbWFcIiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4gYW5kIChcInNjaGVtYVwiOjpqc29uLT5cXCdmaWVsZHNcXCctPiQ8ZmllbGROYW1lPikgaXMgbm90IG51bGwnLFxuICAgICAgICB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH1cbiAgICAgICk7XG5cbiAgICAgIGlmIChyZXN1bHRbMF0pIHtcbiAgICAgICAgdGhyb3cgJ0F0dGVtcHRlZCB0byBhZGQgYSBmaWVsZCB0aGF0IGFscmVhZHkgZXhpc3RzJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBge2ZpZWxkcywke2ZpZWxkTmFtZX19YDtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCI9anNvbmJfc2V0KFwic2NoZW1hXCIsICQ8cGF0aD4sICQ8dHlwZT4pICBXSEVSRSBcImNsYXNzTmFtZVwiPSQ8Y2xhc3NOYW1lPicsXG4gICAgICAgICAgeyBwYXRoLCB0eXBlLCBjbGFzc05hbWUgfVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgYXN5bmMgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBvcGVyYXRpb25zID0gW1xuICAgICAgeyBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTICQxOm5hbWVgLCB2YWx1ZXM6IFtjbGFzc05hbWVdIH0sXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgREVMRVRFIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzOiBbY2xhc3NOYW1lXSxcbiAgICAgIH0sXG4gICAgXTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KG9wZXJhdGlvbnMpKSlcbiAgICAgIC50aGVuKCgpID0+IGNsYXNzTmFtZS5pbmRleE9mKCdfSm9pbjonKSAhPSAwKTsgLy8gcmVzb2x2ZXMgd2l0aCBmYWxzZSB3aGVuIF9Kb2luIHRhYmxlXG4gIH1cblxuICAvLyBEZWxldGUgYWxsIGRhdGEga25vd24gdG8gdGhpcyBhZGFwdGVyLiBVc2VkIGZvciB0ZXN0aW5nLlxuICBhc3luYyBkZWxldGVBbGxDbGFzc2VzKCkge1xuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgIGNvbnN0IGhlbHBlcnMgPSB0aGlzLl9wZ3AuaGVscGVycztcbiAgICBkZWJ1ZygnZGVsZXRlQWxsQ2xhc3NlcycpO1xuXG4gICAgYXdhaXQgdGhpcy5fY2xpZW50XG4gICAgICAudGFzaygnZGVsZXRlLWFsbC1jbGFzc2VzJywgYXN5bmMgdCA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHQuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJyk7XG4gICAgICAgICAgY29uc3Qgam9pbnMgPSByZXN1bHRzLnJlZHVjZSgobGlzdDogQXJyYXk8c3RyaW5nPiwgc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBsaXN0LmNvbmNhdChqb2luVGFibGVzRm9yU2NoZW1hKHNjaGVtYS5zY2hlbWEpKTtcbiAgICAgICAgICB9LCBbXSk7XG4gICAgICAgICAgY29uc3QgY2xhc3NlcyA9IFtcbiAgICAgICAgICAgICdfU0NIRU1BJyxcbiAgICAgICAgICAgICdfUHVzaFN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlNjaGVkdWxlJyxcbiAgICAgICAgICAgICdfSG9va3MnLFxuICAgICAgICAgICAgJ19HbG9iYWxDb25maWcnLFxuICAgICAgICAgICAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgICAgICAgICAgICdfQXVkaWVuY2UnLFxuICAgICAgICAgICAgLi4ucmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5jbGFzc05hbWUpLFxuICAgICAgICAgICAgLi4uam9pbnMsXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdCBxdWVyaWVzID0gY2xhc3Nlcy5tYXAoY2xhc3NOYW1lID0+ICh7XG4gICAgICAgICAgICBxdWVyeTogJ0RST1AgVEFCTEUgSUYgRVhJU1RTICQ8Y2xhc3NOYW1lOm5hbWU+JyxcbiAgICAgICAgICAgIHZhbHVlczogeyBjbGFzc05hbWUgfSxcbiAgICAgICAgICB9KSk7XG4gICAgICAgICAgYXdhaXQgdC50eCh0eCA9PiB0eC5ub25lKGhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIE5vIF9TQ0hFTUEgY29sbGVjdGlvbi4gRG9uJ3QgZGVsZXRlIGFueXRoaW5nLlxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBkZWJ1ZyhgZGVsZXRlQWxsQ2xhc3NlcyBkb25lIGluICR7bmV3IERhdGUoKS5nZXRUaW1lKCkgLSBub3d9YCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZSB0aGUgY29sdW1uIGFuZCBhbGwgdGhlIGRhdGEuIEZvciBSZWxhdGlvbnMsIHRoZSBfSm9pbiBjb2xsZWN0aW9uIGlzIGhhbmRsZWRcbiAgLy8gc3BlY2lhbGx5LCB0aGlzIGZ1bmN0aW9uIGRvZXMgbm90IGRlbGV0ZSBfSm9pbiBjb2x1bW5zLiBJdCBzaG91bGQsIGhvd2V2ZXIsIGluZGljYXRlXG4gIC8vIHRoYXQgdGhlIHJlbGF0aW9uIGZpZWxkcyBkb2VzIG5vdCBleGlzdCBhbnltb3JlLiBJbiBtb25nbywgdGhpcyBtZWFucyByZW1vdmluZyBpdCBmcm9tXG4gIC8vIHRoZSBfU0NIRU1BIGNvbGxlY3Rpb24uICBUaGVyZSBzaG91bGQgYmUgbm8gYWN0dWFsIGRhdGEgaW4gdGhlIGNvbGxlY3Rpb24gdW5kZXIgdGhlIHNhbWUgbmFtZVxuICAvLyBhcyB0aGUgcmVsYXRpb24gY29sdW1uLCBzbyBpdCdzIGZpbmUgdG8gYXR0ZW1wdCB0byBkZWxldGUgaXQuIElmIHRoZSBmaWVsZHMgbGlzdGVkIHRvIGJlXG4gIC8vIGRlbGV0ZWQgZG8gbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gc3VjY2Vzc2Z1bGx5IGFueXdheXMuIENoZWNraW5nIGZvclxuICAvLyBhdHRlbXB0cyB0byBkZWxldGUgbm9uLWV4aXN0ZW50IGZpZWxkcyBpcyB0aGUgcmVzcG9uc2liaWxpdHkgb2YgUGFyc2UgU2VydmVyLlxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgbm90IG9ibGlnYXRlZCB0byBkZWxldGUgZmllbGRzIGF0b21pY2FsbHkuIEl0IGlzIGdpdmVuIHRoZSBmaWVsZFxuICAvLyBuYW1lcyBpbiBhIGxpc3Qgc28gdGhhdCBkYXRhYmFzZXMgdGhhdCBhcmUgY2FwYWJsZSBvZiBkZWxldGluZyBmaWVsZHMgYXRvbWljYWxseVxuICAvLyBtYXkgZG8gc28uXG5cbiAgLy8gUmV0dXJucyBhIFByb21pc2UuXG4gIGFzeW5jIGRlbGV0ZUZpZWxkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgZmllbGROYW1lczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZGVidWcoJ2RlbGV0ZUZpZWxkcycsIGNsYXNzTmFtZSwgZmllbGROYW1lcyk7XG4gICAgZmllbGROYW1lcyA9IGZpZWxkTmFtZXMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBmaWVsZE5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBsaXN0LnB1c2goZmllbGROYW1lKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gbGlzdDtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXTtcbiAgICBjb25zdCBjb2x1bW5zID0gZmllbGROYW1lc1xuICAgICAgLm1hcCgobmFtZSwgaWR4KSA9PiB7XG4gICAgICAgIHJldHVybiBgJCR7aWR4ICsgMn06bmFtZWA7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywgRFJPUCBDT0xVTU4nKTtcblxuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnZGVsZXRlLWZpZWxkcycsIGFzeW5jIHQgPT4ge1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiID0gJDxzY2hlbWE+IFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IHNjaGVtYSwgY2xhc3NOYW1lIH1cbiAgICAgICk7XG4gICAgICBpZiAodmFsdWVzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgYXdhaXQgdC5ub25lKGBBTFRFUiBUQUJMRSAkMTpuYW1lIERST1AgQ09MVU1OICR7Y29sdW1uc31gLCB2YWx1ZXMpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGFzeW5jIGdldEFsbENsYXNzZXMoKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC50YXNrKCdnZXQtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGF3YWl0IHNlbGYuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHModCk7XG4gICAgICByZXR1cm4gYXdhaXQgdC5tYXAoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInLCBudWxsLCByb3cgPT5cbiAgICAgICAgdG9QYXJzZVNjaGVtYSh7IGNsYXNzTmFtZTogcm93LmNsYXNzTmFtZSwgLi4ucm93LnNjaGVtYSB9KVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIHRoZSBzY2hlbWEgd2l0aCB0aGUgZ2l2ZW4gbmFtZSwgaW4gUGFyc2UgZm9ybWF0LiBJZlxuICAvLyB0aGlzIGFkYXB0ZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSBzY2hlbWEsIHJldHVybiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpdGhcbiAgLy8gdW5kZWZpbmVkIGFzIHRoZSByZWFzb24uXG4gIGFzeW5jIGdldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgZGVidWcoJ2dldENsYXNzJywgY2xhc3NOYW1lKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLnNjaGVtYTtcbiAgICAgIH0pXG4gICAgICAudGhlbih0b1BhcnNlU2NoZW1hKTtcbiAgfVxuXG4gIC8vIFRPRE86IHJlbW92ZSB0aGUgbW9uZ28gZm9ybWF0IGRlcGVuZGVuY3kgaW4gdGhlIHJldHVybiB2YWx1ZVxuICBhc3luYyBjcmVhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIG9iamVjdDogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdjcmVhdGVPYmplY3QnLCBjbGFzc05hbWUsIG9iamVjdCk7XG4gICAgbGV0IGNvbHVtbnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGdlb1BvaW50cyA9IHt9O1xuXG4gICAgb2JqZWN0ID0gaGFuZGxlRG90RmllbGRzKG9iamVjdCk7XG5cbiAgICB2YWxpZGF0ZUtleXMob2JqZWN0KTtcblxuICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHZhciBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ10gPSBvYmplY3RbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBmaWVsZE5hbWUgPSAnYXV0aERhdGEnO1xuICAgICAgfVxuXG4gICAgICBjb2x1bW5zQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19mYWlsZWRfbG9naW5fY291bnQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2hpc3RvcnknXG4gICAgICAgICkge1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcpIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzd2l0Y2ggKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlKSB7XG4gICAgICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5vYmplY3RJZCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KG9iamVjdFtmaWVsZE5hbWVdKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdPYmplY3QnOlxuICAgICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICAgIGNhc2UgJ051bWJlcic6XG4gICAgICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdGaWxlJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm5hbWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2x5Z29uJzoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChvYmplY3RbZmllbGROYW1lXS5jb29yZGluYXRlcyk7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICAgIC8vIHBvcCB0aGUgcG9pbnQgYW5kIHByb2Nlc3MgbGF0ZXJcbiAgICAgICAgICBnZW9Qb2ludHNbZmllbGROYW1lXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICAgIGNvbHVtbnNBcnJheS5wb3AoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBgVHlwZSAke3NjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlfSBub3Qgc3VwcG9ydGVkIHlldGA7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb2x1bW5zQXJyYXkgPSBjb2x1bW5zQXJyYXkuY29uY2F0KE9iamVjdC5rZXlzKGdlb1BvaW50cykpO1xuICAgIGNvbnN0IGluaXRpYWxWYWx1ZXMgPSB2YWx1ZXNBcnJheS5tYXAoKHZhbCwgaW5kZXgpID0+IHtcbiAgICAgIGxldCB0ZXJtaW5hdGlvbiA9ICcnO1xuICAgICAgY29uc3QgZmllbGROYW1lID0gY29sdW1uc0FycmF5W2luZGV4XTtcbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6OnRleHRbXSc7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSdcbiAgICAgICkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6Ompzb25iJztcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJCR7aW5kZXggKyAyICsgY29sdW1uc0FycmF5Lmxlbmd0aH0ke3Rlcm1pbmF0aW9ufWA7XG4gICAgfSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzSW5qZWN0cyA9IE9iamVjdC5rZXlzKGdlb1BvaW50cykubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGdlb1BvaW50c1trZXldO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZS5sb25naXR1ZGUsIHZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGNvbnN0IGwgPSB2YWx1ZXNBcnJheS5sZW5ndGggKyBjb2x1bW5zQXJyYXkubGVuZ3RoO1xuICAgICAgcmV0dXJuIGBQT0lOVCgkJHtsfSwgJCR7bCArIDF9KWA7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2x1bW5zUGF0dGVybiA9IGNvbHVtbnNBcnJheVxuICAgICAgLm1hcCgoY29sLCBpbmRleCkgPT4gYCQke2luZGV4ICsgMn06bmFtZWApXG4gICAgICAuam9pbigpO1xuICAgIGNvbnN0IHZhbHVlc1BhdHRlcm4gPSBpbml0aWFsVmFsdWVzLmNvbmNhdChnZW9Qb2ludHNJbmplY3RzKS5qb2luKCk7XG5cbiAgICBjb25zdCBxcyA9IGBJTlNFUlQgSU5UTyAkMTpuYW1lICgke2NvbHVtbnNQYXR0ZXJufSkgVkFMVUVTICgke3ZhbHVlc1BhdHRlcm59KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uY29sdW1uc0FycmF5LCAuLi52YWx1ZXNBcnJheV07XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50XG4gICAgICA6IHRoaXMuX2NsaWVudFxuICAgIClcbiAgICAgIC5ub25lKHFzLCB2YWx1ZXMpXG4gICAgICAudGhlbigoKSA9PiAoeyBvcHM6IFtvYmplY3RdIH0pKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvcikge1xuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgZXJyLnVuZGVybHlpbmdFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGlmIChlcnJvci5jb25zdHJhaW50KSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gZXJyb3IuY29uc3RyYWludC5tYXRjaCgvdW5pcXVlXyhbYS16QS1aXSspLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBlcnJvciA9IGVycjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGFzeW5jIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdkZWxldGVPYmplY3RzQnlRdWVyeScsIGNsYXNzTmFtZSwgcXVlcnkpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IGluZGV4ID0gMjtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcbiAgICBpZiAoT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgd2hlcmUucGF0dGVybiA9ICdUUlVFJztcbiAgICB9XG4gICAgY29uc3QgcXMgPSBgV0lUSCBkZWxldGVkIEFTIChERUxFVEUgRlJPTSAkMTpuYW1lIFdIRVJFICR7d2hlcmUucGF0dGVybn0gUkVUVVJOSU5HICopIFNFTEVDVCBjb3VudCgqKSBGUk9NIGRlbGV0ZWRgO1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udFxuICAgICAgOiB0aGlzLl9jbGllbnRcbiAgICApXG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4gK2EuY291bnQpXG4gICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogRG9uJ3QgZGVsZXRlIGFueXRoaW5nIGlmIGRvZXNuJ3QgZXhpc3RcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGFzeW5jIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBkZWJ1ZygnZmluZE9uZUFuZFVwZGF0ZScsIGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIHVwZGF0ZSxcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgKS50aGVuKHZhbCA9PiB2YWxbMF0pO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgYXN5bmMgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxbYW55XT4ge1xuICAgIGRlYnVnKCd1cGRhdGVPYmplY3RzQnlRdWVyeScsIGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgY29uc3QgdXBkYXRlUGF0dGVybnMgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcblxuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0geyAuLi51cGRhdGUgfTtcblxuICAgIC8vIFNldCBmbGFnIGZvciBkb3Qgbm90YXRpb24gZmllbGRzXG4gICAgY29uc3QgZG90Tm90YXRpb25PcHRpb25zID0ge307XG4gICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaXJzdF0gPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0gPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB1cGRhdGUgPSBoYW5kbGVEb3RGaWVsZHModXBkYXRlKTtcbiAgICAvLyBSZXNvbHZlIGF1dGhEYXRhIGZpcnN0LFxuICAgIC8vIFNvIHdlIGRvbid0IGVuZCB1cCB3aXRoIG11bHRpcGxlIGtleSB1cGRhdGVzXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXSA9IHVwZGF0ZVsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgZmllbGRWYWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgLy8gRHJvcCBhbnkgdW5kZWZpbmVkIHZhbHVlcy5cbiAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT0gJ2F1dGhEYXRhJykge1xuICAgICAgICAvLyBUaGlzIHJlY3Vyc2l2ZWx5IHNldHMgdGhlIGpzb25fb2JqZWN0XG4gICAgICAgIC8vIE9ubHkgMSBsZXZlbCBkZWVwXG4gICAgICAgIGNvbnN0IGdlbmVyYXRlID0gKGpzb25iOiBzdHJpbmcsIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGBqc29uX29iamVjdF9zZXRfa2V5KENPQUxFU0NFKCR7anNvbmJ9LCAne30nOjpqc29uYiksICR7a2V5fSwgJHt2YWx1ZX0pOjpqc29uYmA7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGxhc3RLZXkgPSBgJCR7aW5kZXh9Om5hbWVgO1xuICAgICAgICBjb25zdCBmaWVsZE5hbWVJbmRleCA9IGluZGV4O1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBjb25zdCB1cGRhdGUgPSBPYmplY3Qua2V5cyhmaWVsZFZhbHVlKS5yZWR1Y2UoXG4gICAgICAgICAgKGxhc3RLZXk6IHN0cmluZywga2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHN0ciA9IGdlbmVyYXRlKFxuICAgICAgICAgICAgICBsYXN0S2V5LFxuICAgICAgICAgICAgICBgJCR7aW5kZXh9Ojp0ZXh0YCxcbiAgICAgICAgICAgICAgYCQke2luZGV4ICsgMX06Ompzb25iYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChrZXksIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBsYXN0S2V5XG4gICAgICAgICk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2ZpZWxkTmFtZUluZGV4fTpuYW1lID0gJHt1cGRhdGV9YCk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0luY3JlbWVudCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgMCkgKyAkJHtpbmRleCArIDF9YFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuYW1vdW50KTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZChDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtpbmRleCArXG4gICAgICAgICAgICAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIG51bGwpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdSZW1vdmUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfcmVtb3ZlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke2luZGV4ICtcbiAgICAgICAgICAgIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZFVuaXF1ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGRfdW5pcXVlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke2luZGV4ICtcbiAgICAgICAgICAgIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgLy9UT0RPOiBzdG9wIHNwZWNpYWwgY2FzaW5nIHRoaXMuIEl0IHNob3VsZCBjaGVjayBmb3IgX190eXBlID09PSAnRGF0ZScgYW5kIHVzZSAuaXNvXG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIC8vIG5vb3BcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ09iamVjdCdcbiAgICAgICkge1xuICAgICAgICAvLyBHYXRoZXIga2V5cyB0byBpbmNyZW1lbnRcbiAgICAgICAgY29uc3Qga2V5c1RvSW5jcmVtZW50ID0gT2JqZWN0LmtleXMob3JpZ2luYWxVcGRhdGUpXG4gICAgICAgICAgLmZpbHRlcihrID0+IHtcbiAgICAgICAgICAgIC8vIGNob29zZSB0b3AgbGV2ZWwgZmllbGRzIHRoYXQgaGF2ZSBhIGRlbGV0ZSBvcGVyYXRpb24gc2V0XG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgT2JqZWN0LmtleXMgaXMgaXRlcmF0aW5nIG92ZXIgdGhlICoqb3JpZ2luYWwqKiB1cGRhdGUgb2JqZWN0XG4gICAgICAgICAgICAvLyBhbmQgdGhhdCBzb21lIG9mIHRoZSBrZXlzIG9mIHRoZSBvcmlnaW5hbCB1cGRhdGUgY291bGQgYmUgbnVsbCBvciB1bmRlZmluZWQ6XG4gICAgICAgICAgICAvLyAoU2VlIHRoZSBhYm92ZSBjaGVjayBgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIGZpZWxkVmFsdWUgPT0gXCJ1bmRlZmluZWRcIilgKVxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcmlnaW5hbFVwZGF0ZVtrXTtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHZhbHVlICYmXG4gICAgICAgICAgICAgIHZhbHVlLl9fb3AgPT09ICdJbmNyZW1lbnQnICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpWzBdID09PSBmaWVsZE5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGsgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBsZXQgaW5jcmVtZW50UGF0dGVybnMgPSAnJztcbiAgICAgICAgaWYgKGtleXNUb0luY3JlbWVudC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaW5jcmVtZW50UGF0dGVybnMgPVxuICAgICAgICAgICAgJyB8fCAnICtcbiAgICAgICAgICAgIGtleXNUb0luY3JlbWVudFxuICAgICAgICAgICAgICAubWFwKGMgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFtb3VudCA9IGZpZWxkVmFsdWVbY10uYW1vdW50O1xuICAgICAgICAgICAgICAgIHJldHVybiBgQ09OQ0FUKCd7XCIke2N9XCI6JywgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUtPj4nJHtjfScsJzAnKTo6aW50ICsgJHthbW91bnR9LCAnfScpOjpqc29uYmA7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5qb2luKCcgfHwgJyk7XG4gICAgICAgICAgLy8gU3RyaXAgdGhlIGtleXNcbiAgICAgICAgICBrZXlzVG9JbmNyZW1lbnQuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgICAgZGVsZXRlIGZpZWxkVmFsdWVba2V5XTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGtleXNUb0RlbGV0ZTogQXJyYXk8c3RyaW5nPiA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldC5cbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnRGVsZXRlJyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgY29uc3QgZGVsZXRlUGF0dGVybnMgPSBrZXlzVG9EZWxldGUucmVkdWNlKFxuICAgICAgICAgIChwOiBzdHJpbmcsIGM6IHN0cmluZywgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcCArIGAgLSAnJCR7aW5kZXggKyAxICsgaX06dmFsdWUnYDtcbiAgICAgICAgICB9LFxuICAgICAgICAgICcnXG4gICAgICAgICk7XG4gICAgICAgIC8vIE92ZXJyaWRlIE9iamVjdFxuICAgICAgICBsZXQgdXBkYXRlT2JqZWN0ID0gXCIne30nOjpqc29uYlwiO1xuXG4gICAgICAgIGlmIChkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSkge1xuICAgICAgICAgIC8vIE1lcmdlIE9iamVjdFxuICAgICAgICAgIHVwZGF0ZU9iamVjdCA9IGBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ3t9Jzo6anNvbmIpYDtcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9ICgke3VwZGF0ZU9iamVjdH0gJHtkZWxldGVQYXR0ZXJuc30gJHtpbmNyZW1lbnRQYXR0ZXJuc30gfHwgJCR7aW5kZXggK1xuICAgICAgICAgICAgMSArXG4gICAgICAgICAgICBrZXlzVG9EZWxldGUubGVuZ3RofTo6anNvbmIgKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCAuLi5rZXlzVG9EZWxldGUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMiArIGtleXNUb0RlbGV0ZS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUpICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5J1xuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSk7XG4gICAgICAgIGlmIChleHBlY3RlZFR5cGUgPT09ICd0ZXh0W10nKSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojp0ZXh0W11gKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdOb3Qgc3VwcG9ydGVkIHVwZGF0ZScsIGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB1cGRhdGUgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX0geWV0YFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlQ2xhdXNlID1cbiAgICAgIHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHFzID0gYFVQREFURSAkMTpuYW1lIFNFVCAke3VwZGF0ZVBhdHRlcm5zLmpvaW4oKX0gJHt3aGVyZUNsYXVzZX0gUkVUVVJOSU5HICpgO1xuICAgIGRlYnVnKCd1cGRhdGU6ICcsIHFzLCB2YWx1ZXMpO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udFxuICAgICAgOiB0aGlzLl9jbGllbnRcbiAgICApLmFueShxcywgdmFsdWVzKTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gSG9wZWZ1bGx5LCB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGlzLiBJdCdzIG9ubHkgdXNlZCBmb3IgY29uZmlnIGFuZCBob29rcy5cbiAgdXBzZXJ0T25lT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCd1cHNlcnRPbmVPYmplY3QnLCB7IGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSB9KTtcbiAgICBjb25zdCBjcmVhdGVWYWx1ZSA9IE9iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCB1cGRhdGUpO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZU9iamVjdChcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHNjaGVtYSxcbiAgICAgIGNyZWF0ZVZhbHVlLFxuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICApLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIC8vIGlnbm9yZSBkdXBsaWNhdGUgdmFsdWUgZXJyb3JzIGFzIGl0J3MgdXBzZXJ0XG4gICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBzY2hlbWEsXG4gICAgICAgIHF1ZXJ5LFxuICAgICAgICB1cGRhdGUsXG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB7IHNraXAsIGxpbWl0LCBzb3J0LCBrZXlzLCBjYXNlSW5zZW5zaXRpdmUgfTogUXVlcnlPcHRpb25zXG4gICkge1xuICAgIGRlYnVnKCdmaW5kJywgY2xhc3NOYW1lLCBxdWVyeSwge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgc29ydCxcbiAgICAgIGtleXMsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgfSk7XG4gICAgY29uc3QgaGFzTGltaXQgPSBsaW1pdCAhPT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGhhc1NraXAgPSBza2lwICE9PSB1bmRlZmluZWQ7XG4gICAgbGV0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiAyLFxuICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPVxuICAgICAgd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgbGltaXRQYXR0ZXJuID0gaGFzTGltaXQgPyBgTElNSVQgJCR7dmFsdWVzLmxlbmd0aCArIDF9YCA6ICcnO1xuICAgIGlmIChoYXNMaW1pdCkge1xuICAgICAgdmFsdWVzLnB1c2gobGltaXQpO1xuICAgIH1cbiAgICBjb25zdCBza2lwUGF0dGVybiA9IGhhc1NraXAgPyBgT0ZGU0VUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzU2tpcCkge1xuICAgICAgdmFsdWVzLnB1c2goc2tpcCk7XG4gICAgfVxuXG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgaWYgKHNvcnQpIHtcbiAgICAgIGNvbnN0IHNvcnRDb3B5OiBhbnkgPSBzb3J0O1xuICAgICAgY29uc3Qgc29ydGluZyA9IE9iamVjdC5rZXlzKHNvcnQpXG4gICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1LZXkgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhrZXkpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgLy8gVXNpbmcgJGlkeCBwYXR0ZXJuIGdpdmVzOiAgbm9uLWludGVnZXIgY29uc3RhbnQgaW4gT1JERVIgQllcbiAgICAgICAgICBpZiAoc29ydENvcHlba2V5XSA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIGAke3RyYW5zZm9ybUtleX0gQVNDYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAke3RyYW5zZm9ybUtleX0gREVTQ2A7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCk7XG4gICAgICBzb3J0UGF0dGVybiA9XG4gICAgICAgIHNvcnQgIT09IHVuZGVmaW5lZCAmJiBPYmplY3Qua2V5cyhzb3J0KS5sZW5ndGggPiAwXG4gICAgICAgICAgPyBgT1JERVIgQlkgJHtzb3J0aW5nfWBcbiAgICAgICAgICA6ICcnO1xuICAgIH1cbiAgICBpZiAod2hlcmUuc29ydHMgJiYgT2JqZWN0LmtleXMoKHdoZXJlLnNvcnRzOiBhbnkpKS5sZW5ndGggPiAwKSB7XG4gICAgICBzb3J0UGF0dGVybiA9IGBPUkRFUiBCWSAke3doZXJlLnNvcnRzLmpvaW4oKX1gO1xuICAgIH1cblxuICAgIGxldCBjb2x1bW5zID0gJyonO1xuICAgIGlmIChrZXlzKSB7XG4gICAgICAvLyBFeGNsdWRlIGVtcHR5IGtleXNcbiAgICAgIC8vIFJlcGxhY2UgQUNMIGJ5IGl0J3Mga2V5c1xuICAgICAga2V5cyA9IGtleXMucmVkdWNlKChtZW1vLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgICBtZW1vLnB1c2goJ19ycGVybScpO1xuICAgICAgICAgIG1lbW8ucHVzaCgnX3dwZXJtJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoa2V5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBtZW1vLnB1c2goa2V5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sIFtdKTtcbiAgICAgIGNvbHVtbnMgPSBrZXlzXG4gICAgICAgIC5tYXAoKGtleSwgaW5kZXgpID0+IHtcbiAgICAgICAgICBpZiAoa2V5ID09PSAnJHNjb3JlJykge1xuICAgICAgICAgICAgcmV0dXJuIGB0c19yYW5rX2NkKHRvX3RzdmVjdG9yKCQkezJ9LCAkJHszfTpuYW1lKSwgdG9fdHNxdWVyeSgkJHs0fSwgJCR7NX0pLCAzMikgYXMgc2NvcmVgO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCQke2luZGV4ICsgdmFsdWVzLmxlbmd0aCArIDF9Om5hbWVgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgdmFsdWVzID0gdmFsdWVzLmNvbmNhdChrZXlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBxcyA9IGBTRUxFQ1QgJHtjb2x1bW5zfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufSAke3NraXBQYXR0ZXJufWA7XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gUXVlcnkgb24gbm9uIGV4aXN0aW5nIHRhYmxlLCBkb24ndCBjcmFzaFxuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT5cbiAgICAgICAgcmVzdWx0cy5tYXAob2JqZWN0ID0+XG4gICAgICAgICAgdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSlcbiAgICAgICAgKVxuICAgICAgKTtcbiAgfVxuXG4gIC8vIENvbnZlcnRzIGZyb20gYSBwb3N0Z3Jlcy1mb3JtYXQgb2JqZWN0IHRvIGEgUkVTVC1mb3JtYXQgb2JqZWN0LlxuICAvLyBEb2VzIG5vdCBzdHJpcCBvdXQgYW55dGhpbmcgYmFzZWQgb24gYSBsYWNrIG9mIGF1dGhlbnRpY2F0aW9uLlxuICBwb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBzY2hlbWE6IGFueSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInICYmIG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgICAgIGxhdGl0dWRlOiBvYmplY3RbZmllbGROYW1lXS55LFxuICAgICAgICAgIGxvbmdpdHVkZTogb2JqZWN0W2ZpZWxkTmFtZV0ueCxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGxldCBjb29yZHMgPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgY29vcmRzID0gY29vcmRzLnN1YnN0cigyLCBjb29yZHMubGVuZ3RoIC0gNCkuc3BsaXQoJyksKCcpO1xuICAgICAgICBjb29yZHMgPSBjb29yZHMubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgcGFyc2VGbG9hdChwb2ludC5zcGxpdCgnLCcpWzFdKSxcbiAgICAgICAgICAgIHBhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVswXSksXG4gICAgICAgICAgXTtcbiAgICAgICAgfSk7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1BvbHlnb24nLFxuICAgICAgICAgIGNvb3JkaW5hdGVzOiBjb29yZHMsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdGaWxlJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgICAgICBuYW1lOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICAvL1RPRE86IHJlbW92ZSB0aGlzIHJlbGlhbmNlIG9uIHRoZSBtb25nbyBmb3JtYXQuIERCIGFkYXB0ZXIgc2hvdWxkbid0IGtub3cgdGhlcmUgaXMgYSBkaWZmZXJlbmNlIGJldHdlZW4gY3JlYXRlZCBhdCBhbmQgYW55IG90aGVyIGRhdGUgZmllbGQuXG4gICAgaWYgKG9iamVjdC5jcmVhdGVkQXQpIHtcbiAgICAgIG9iamVjdC5jcmVhdGVkQXQgPSBvYmplY3QuY3JlYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QudXBkYXRlZEF0KSB7XG4gICAgICBvYmplY3QudXBkYXRlZEF0ID0gb2JqZWN0LnVwZGF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LmV4cGlyZXNBdCkge1xuICAgICAgb2JqZWN0LmV4cGlyZXNBdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0LmV4cGlyZXNBdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCkge1xuICAgICAgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgICBpc286IG9iamVjdFtmaWVsZE5hbWVdLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSBpbmRleC4gVW5pcXVlIGluZGV4ZXMgb24gbnVsbGFibGUgZmllbGRzIGFyZSBub3QgYWxsb3dlZC4gU2luY2Ugd2UgZG9uJ3RcbiAgLy8gY3VycmVudGx5IGtub3cgd2hpY2ggZmllbGRzIGFyZSBudWxsYWJsZSBhbmQgd2hpY2ggYXJlbid0LCB3ZSBpZ25vcmUgdGhhdCBjcml0ZXJpYS5cbiAgLy8gQXMgc3VjaCwgd2Ugc2hvdWxkbid0IGV4cG9zZSB0aGlzIGZ1bmN0aW9uIHRvIHVzZXJzIG9mIHBhcnNlIHVudGlsIHdlIGhhdmUgYW4gb3V0LW9mLWJhbmRcbiAgLy8gV2F5IG9mIGRldGVybWluaW5nIGlmIGEgZmllbGQgaXMgbnVsbGFibGUuIFVuZGVmaW5lZCBkb2Vzbid0IGNvdW50IGFnYWluc3QgdW5pcXVlbmVzcyxcbiAgLy8gd2hpY2ggaXMgd2h5IHdlIHVzZSBzcGFyc2UgaW5kZXhlcy5cbiAgYXN5bmMgZW5zdXJlVW5pcXVlbmVzcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgZmllbGROYW1lczogc3RyaW5nW11cbiAgKSB7XG4gICAgLy8gVXNlIHRoZSBzYW1lIG5hbWUgZm9yIGV2ZXJ5IGVuc3VyZVVuaXF1ZW5lc3MgYXR0ZW1wdCwgYmVjYXVzZSBwb3N0Z3Jlc1xuICAgIC8vIFdpbGwgaGFwcGlseSBjcmVhdGUgdGhlIHNhbWUgaW5kZXggd2l0aCBtdWx0aXBsZSBuYW1lcy5cbiAgICBjb25zdCBjb25zdHJhaW50TmFtZSA9IGB1bmlxdWVfJHtmaWVsZE5hbWVzLnNvcnQoKS5qb2luKCdfJyl9YDtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBmaWVsZE5hbWVzLm1hcChcbiAgICAgIChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYFxuICAgICk7XG4gICAgY29uc3QgcXMgPSBgQUxURVIgVEFCTEUgJDE6bmFtZSBBREQgQ09OU1RSQUlOVCAkMjpuYW1lIFVOSVFVRSAoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5ub25lKHFzLCBbY2xhc3NOYW1lLCBjb25zdHJhaW50TmFtZSwgLi4uZmllbGROYW1lc10pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmXG4gICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGNvbnN0cmFpbnROYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgY291bnQuXG4gIGFzeW5jIGNvdW50KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHJlYWRQcmVmZXJlbmNlPzogc3RyaW5nLFxuICAgIGVzdGltYXRlPzogYm9vbGVhbiA9IHRydWVcbiAgKSB7XG4gICAgZGVidWcoJ2NvdW50JywgY2xhc3NOYW1lLCBxdWVyeSwgcmVhZFByZWZlcmVuY2UsIGVzdGltYXRlKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9XG4gICAgICB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBsZXQgcXMgPSAnJztcblxuICAgIGlmICh3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgfHwgIWVzdGltYXRlKSB7XG4gICAgICBxcyA9IGBTRUxFQ1QgY291bnQoKikgRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHFzID1cbiAgICAgICAgJ1NFTEVDVCByZWx0dXBsZXMgQVMgYXBwcm94aW1hdGVfcm93X2NvdW50IEZST00gcGdfY2xhc3MgV0hFUkUgcmVsbmFtZSA9ICQxJztcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4ge1xuICAgICAgICBpZiAoYS5hcHByb3hpbWF0ZV9yb3dfY291bnQgIT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiArYS5hcHByb3hpbWF0ZV9yb3dfY291bnQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICthLmNvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBkaXN0aW5jdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICBmaWVsZE5hbWU6IHN0cmluZ1xuICApIHtcbiAgICBkZWJ1ZygnZGlzdGluY3QnLCBjbGFzc05hbWUsIHF1ZXJ5KTtcbiAgICBsZXQgZmllbGQgPSBmaWVsZE5hbWU7XG4gICAgbGV0IGNvbHVtbiA9IGZpZWxkTmFtZTtcbiAgICBjb25zdCBpc05lc3RlZCA9IGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIGZpZWxkID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgY29sdW1uID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgfVxuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGlzUG9pbnRlckZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJztcbiAgICBjb25zdCB2YWx1ZXMgPSBbZmllbGQsIGNvbHVtbiwgY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogNCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9XG4gICAgICB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCB0cmFuc2Zvcm1lciA9IGlzQXJyYXlGaWVsZCA/ICdqc29uYl9hcnJheV9lbGVtZW50cycgOiAnT04nO1xuICAgIGxldCBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6bmFtZSkgJDI6bmFtZSBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpyYXcpICQyOnJhdyBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yKSB7XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoIWlzTmVzdGVkKSB7XG4gICAgICAgICAgcmVzdWx0cyA9IHJlc3VsdHMuZmlsdGVyKG9iamVjdCA9PiBvYmplY3RbZmllbGRdICE9PSBudWxsKTtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgIGlmICghaXNQb2ludGVyRmllbGQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdFtmaWVsZF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGRdLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjaGlsZCA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzFdO1xuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IG9iamVjdFtjb2x1bW5dW2NoaWxkXSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PlxuICAgICAgICByZXN1bHRzLm1hcChvYmplY3QgPT5cbiAgICAgICAgICB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKVxuICAgICAgICApXG4gICAgICApO1xuICB9XG5cbiAgYXN5bmMgYWdncmVnYXRlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSkge1xuICAgIGRlYnVnKCdhZ2dyZWdhdGUnLCBjbGFzc05hbWUsIHBpcGVsaW5lKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXg6IG51bWJlciA9IDI7XG4gICAgbGV0IGNvbHVtbnM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGNvdW50RmllbGQgPSBudWxsO1xuICAgIGxldCBncm91cFZhbHVlcyA9IG51bGw7XG4gICAgbGV0IHdoZXJlUGF0dGVybiA9ICcnO1xuICAgIGxldCBsaW1pdFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc2tpcFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBsZXQgZ3JvdXBQYXR0ZXJuID0gJyc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaXBlbGluZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3Qgc3RhZ2UgPSBwaXBlbGluZVtpXTtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRncm91cFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUgIT09ICcnKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTIFwib2JqZWN0SWRcImApO1xuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGZpZWxkID09PSAnX2lkJyAmJlxuICAgICAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCAhPT0gMFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgZ3JvdXBWYWx1ZXMgPSB2YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQnlGaWVsZHMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgYWxpYXMgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgY29uc3Qgb3BlcmF0aW9uID0gT2JqZWN0LmtleXModmFsdWVbYWxpYXNdKVswXTtcbiAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gdHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWVbYWxpYXNdW29wZXJhdGlvbl0pO1xuICAgICAgICAgICAgICBpZiAobW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl0pIHtcbiAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgZ3JvdXBCeUZpZWxkcy5wdXNoKGBcIiR7c291cmNlfVwiYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChcbiAgICAgICAgICAgICAgICAgIGBFWFRSQUNUKCR7XG4gICAgICAgICAgICAgICAgICAgIG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dXG4gICAgICAgICAgICAgICAgICB9IEZST00gJCR7aW5kZXh9Om5hbWUgQVQgVElNRSBaT05FICdVVEMnKSBBUyAkJHtpbmRleCArXG4gICAgICAgICAgICAgICAgICAgIDF9Om5hbWVgXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9OnJhd2A7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChncm91cEJ5RmllbGRzLmpvaW4oKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuJHN1bSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlLiRzdW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBTVU0oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRzdW0pLCBmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb3VudEZpZWxkID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBDT1VOVCgqKSBBUyAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1heCkge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1BWCgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtYXgpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1pbikge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1JTigkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtaW4pLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJGF2Zykge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYEFWRygkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRhdmcpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2x1bW5zLnB1c2goJyonKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICBpZiAoY29sdW1ucy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgY29sdW1ucyA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRwcm9qZWN0W2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IDEgfHwgdmFsdWUgPT09IHRydWUpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5zID0gW107XG4gICAgICAgIGNvbnN0IG9yT3JBbmQgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoXG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLFxuICAgICAgICAgICckb3InXG4gICAgICAgIClcbiAgICAgICAgICA/ICcgT1IgJ1xuICAgICAgICAgIDogJyBBTkQgJztcblxuICAgICAgICBpZiAoc3RhZ2UuJG1hdGNoLiRvcikge1xuICAgICAgICAgIGNvbnN0IGNvbGxhcHNlID0ge307XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLiRvci5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZWxlbWVudCkge1xuICAgICAgICAgICAgICBjb2xsYXBzZVtrZXldID0gZWxlbWVudFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHN0YWdlLiRtYXRjaCA9IGNvbGxhcHNlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kbWF0Y2hbZmllbGRdO1xuICAgICAgICAgIGNvbnN0IG1hdGNoUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgICAgICAgIGlmICh2YWx1ZVtjbXBdKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICAgICAgICBtYXRjaFBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgICAgYCQke2luZGV4fTpuYW1lICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCArIDF9YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlW2NtcF0pKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAobWF0Y2hQYXR0ZXJucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJHttYXRjaFBhdHRlcm5zLmpvaW4oJyBBTkQgJyl9KWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJlxuICAgICAgICAgICAgbWF0Y2hQYXR0ZXJucy5sZW5ndGggPT09IDBcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQsIHZhbHVlKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHdoZXJlUGF0dGVybiA9XG4gICAgICAgICAgcGF0dGVybnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke3BhdHRlcm5zLmpvaW4oYCAke29yT3JBbmR9IGApfWAgOiAnJztcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbGltaXQpIHtcbiAgICAgICAgbGltaXRQYXR0ZXJuID0gYExJTUlUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRsaW1pdCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNraXApIHtcbiAgICAgICAgc2tpcFBhdHRlcm4gPSBgT0ZGU0VUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRza2lwKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc29ydCkge1xuICAgICAgICBjb25zdCBzb3J0ID0gc3RhZ2UuJHNvcnQ7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzb3J0KTtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGtleXNcbiAgICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1lciA9IHNvcnRba2V5XSA9PT0gMSA/ICdBU0MnIDogJ0RFU0MnO1xuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSBgJCR7aW5kZXh9Om5hbWUgJHt0cmFuc2Zvcm1lcn1gO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIHJldHVybiBvcmRlcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5qb2luKCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKC4uLmtleXMpO1xuICAgICAgICBzb3J0UGF0dGVybiA9XG4gICAgICAgICAgc29ydCAhPT0gdW5kZWZpbmVkICYmIHNvcnRpbmcubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHFzID0gYFNFTEVDVCAke2NvbHVtbnMuam9pbigpfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufSAke3NraXBQYXR0ZXJufSAke2dyb3VwUGF0dGVybn1gO1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5tYXAocXMsIHZhbHVlcywgYSA9PlxuICAgICAgICB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIGEsIHNjaGVtYSlcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdvYmplY3RJZCcpKSB7XG4gICAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSBudWxsO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IHt9O1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkW2tleV0gPSByZXN1bHRba2V5XTtcbiAgICAgICAgICAgICAgZGVsZXRlIHJlc3VsdFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY291bnRGaWVsZCkge1xuICAgICAgICAgICAgcmVzdWx0W2NvdW50RmllbGRdID0gcGFyc2VJbnQocmVzdWx0W2NvdW50RmllbGRdLCAxMCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbih7IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgfTogYW55KSB7XG4gICAgLy8gVE9ETzogVGhpcyBtZXRob2QgbmVlZHMgdG8gYmUgcmV3cml0dGVuIHRvIG1ha2UgcHJvcGVyIHVzZSBvZiBjb25uZWN0aW9ucyAoQHZpdGFseS10KVxuICAgIGRlYnVnKCdwZXJmb3JtSW5pdGlhbGl6YXRpb24nKTtcbiAgICBjb25zdCBwcm9taXNlcyA9IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMubWFwKHNjaGVtYSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVUYWJsZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpXG4gICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgfHxcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUVcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLnNjaGVtYVVwZ3JhZGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2xpZW50LnR4KCdwZXJmb3JtLWluaXRpYWxpemF0aW9uJywgdCA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQuYmF0Y2goW1xuICAgICAgICAgICAgdC5ub25lKHNxbC5taXNjLmpzb25PYmplY3RTZXRLZXlzKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuYWRkKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuYWRkVW5pcXVlKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkucmVtb3ZlKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuY29udGFpbnNBbGwpLFxuICAgICAgICAgICAgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbFJlZ2V4KSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuY29udGFpbnMpLFxuICAgICAgICAgIF0pO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbihkYXRhID0+IHtcbiAgICAgICAgZGVidWcoYGluaXRpYWxpemF0aW9uRG9uZSBpbiAke2RhdGEuZHVyYXRpb259YCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlSW5kZXhlcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBpbmRleGVzOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+XG4gICAgICB0LmJhdGNoKFxuICAgICAgICBpbmRleGVzLm1hcChpID0+IHtcbiAgICAgICAgICByZXR1cm4gdC5ub25lKCdDUkVBVEUgSU5ERVggJDE6bmFtZSBPTiAkMjpuYW1lICgkMzpuYW1lKScsIFtcbiAgICAgICAgICAgIGkubmFtZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGkua2V5LFxuICAgICAgICAgIF0pO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzSWZOZWVkZWQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgKFxuICAgICAgY29ubiB8fCB0aGlzLl9jbGllbnRcbiAgICApLm5vbmUoJ0NSRUFURSBJTkRFWCAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgZmllbGROYW1lLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHlwZSxcbiAgICBdKTtcbiAgfVxuXG4gIGFzeW5jIGRyb3BJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHF1ZXJpZXMgPSBpbmRleGVzLm1hcChpID0+ICh7XG4gICAgICBxdWVyeTogJ0RST1AgSU5ERVggJDE6bmFtZScsXG4gICAgICB2YWx1ZXM6IGksXG4gICAgfSkpO1xuICAgIGF3YWl0IChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PlxuICAgICAgdC5ub25lKHRoaXMuX3BncC5oZWxwZXJzLmNvbmNhdChxdWVyaWVzKSlcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgZ2V0SW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHFzID0gJ1NFTEVDVCAqIEZST00gcGdfaW5kZXhlcyBXSEVSRSB0YWJsZW5hbWUgPSAke2NsYXNzTmFtZX0nO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQuYW55KHFzLCB7IGNsYXNzTmFtZSB9KTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFVzZWQgZm9yIHRlc3RpbmcgcHVycG9zZXNcbiAgYXN5bmMgdXBkYXRlRXN0aW1hdGVkQ291bnQoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50Lm5vbmUoJ0FOQUxZWkUgJDE6bmFtZScsIFtjbGFzc05hbWVdKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCk6IFByb21pc2U8YW55PiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgY29uc3QgdHJhbnNhY3Rpb25hbFNlc3Npb24gPSB7fTtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdCA9IHRoaXMuX2NsaWVudC50eCh0ID0+IHtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24udCA9IHQ7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlID0gcmVzb2x2ZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoID0gW107XG4gICAgICAgIHJlc29sdmUodHJhbnNhY3Rpb25hbFNlc3Npb24pO1xuICAgICAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlc3Npb24ucHJvbWlzZTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlc3Npb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUoXG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKVxuICAgICk7XG4gICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdDtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlc3Npb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdC5jYXRjaCgpO1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2goUHJvbWlzZS5yZWplY3QoKSk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZShcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gVE9ETzogaW1wbGVtZW50P1xuICBlbnN1cmVJbmRleCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29udmVydFBvbHlnb25Ub1NRTChwb2x5Z29uKSB7XG4gIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgUG9seWdvbiBtdXN0IGhhdmUgYXQgbGVhc3QgMyB2YWx1ZXNgXG4gICAgKTtcbiAgfVxuICBpZiAoXG4gICAgcG9seWdvblswXVswXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzBdIHx8XG4gICAgcG9seWdvblswXVsxXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzFdXG4gICkge1xuICAgIHBvbHlnb24ucHVzaChwb2x5Z29uWzBdKTtcbiAgfVxuICBjb25zdCB1bmlxdWUgPSBwb2x5Z29uLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgbGV0IGZvdW5kSW5kZXggPSAtMTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgaWYgKHB0WzBdID09PSBpdGVtWzBdICYmIHB0WzFdID09PSBpdGVtWzFdKSB7XG4gICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICB9KTtcbiAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICk7XG4gIH1cbiAgY29uc3QgcG9pbnRzID0gcG9seWdvblxuICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBhcnNlRmxvYXQocG9pbnRbMV0pLCBwYXJzZUZsb2F0KHBvaW50WzBdKSk7XG4gICAgICByZXR1cm4gYCgke3BvaW50WzFdfSwgJHtwb2ludFswXX0pYDtcbiAgICB9KVxuICAgIC5qb2luKCcsICcpO1xuICByZXR1cm4gYCgke3BvaW50c30pYDtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCkge1xuICBpZiAoIXJlZ2V4LmVuZHNXaXRoKCdcXG4nKSkge1xuICAgIHJlZ2V4ICs9ICdcXG4nO1xuICB9XG5cbiAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIGNvbW1lbnRzXG4gIHJldHVybiAoXG4gICAgcmVnZXhcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSkjLipcXG4vZ2ltLCAnJDEnKVxuICAgICAgLy8gcmVtb3ZlIGxpbmVzIHN0YXJ0aW5nIHdpdGggYSBjb21tZW50XG4gICAgICAucmVwbGFjZSgvXiMuKlxcbi9naW0sICcnKVxuICAgICAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIHdoaXRlc3BhY2VcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSlcXHMrL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSB3aGl0ZXNwYWNlIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBsaW5lXG4gICAgICAucmVwbGFjZSgvXlxccysvLCAnJylcbiAgICAgIC50cmltKClcbiAgKTtcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1JlZ2V4UGF0dGVybihzKSB7XG4gIGlmIChzICYmIHMuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgLy8gcmVnZXggZm9yIHN0YXJ0c1dpdGhcbiAgICByZXR1cm4gJ14nICsgbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDEpKTtcbiAgfSBlbHNlIGlmIChzICYmIHMuZW5kc1dpdGgoJyQnKSkge1xuICAgIC8vIHJlZ2V4IGZvciBlbmRzV2l0aFxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMuc2xpY2UoMCwgcy5sZW5ndGggLSAxKSkgKyAnJCc7XG4gIH1cblxuICAvLyByZWdleCBmb3IgY29udGFpbnNcbiAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocyk7XG59XG5cbmZ1bmN0aW9uIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlKSB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCAhdmFsdWUuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9cXF5cXFxcUS4qXFxcXEUvKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn1cblxuZnVuY3Rpb24gaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpIHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0uJHJlZ2V4KTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXS4kcmVnZXgpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgodmFsdWVzKSB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZS4kcmVnZXgpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZykge1xuICByZXR1cm4gcmVtYWluaW5nXG4gICAgLnNwbGl0KCcnKVxuICAgIC5tYXAoYyA9PiB7XG4gICAgICBjb25zdCByZWdleCA9IFJlZ0V4cCgnWzAtOSBdfFxcXFxwe0x9JywgJ3UnKTsgLy8gU3VwcG9ydCBhbGwgdW5pY29kZSBsZXR0ZXIgY2hhcnNcbiAgICAgIGlmIChjLm1hdGNoKHJlZ2V4KSAhPT0gbnVsbCkge1xuICAgICAgICAvLyBkb24ndCBlc2NhcGUgYWxwaGFudW1lcmljIGNoYXJhY3RlcnNcbiAgICAgICAgcmV0dXJuIGM7XG4gICAgICB9XG4gICAgICAvLyBlc2NhcGUgZXZlcnl0aGluZyBlbHNlIChzaW5nbGUgcXVvdGVzIHdpdGggc2luZ2xlIHF1b3RlcywgZXZlcnl0aGluZyBlbHNlIHdpdGggYSBiYWNrc2xhc2gpXG4gICAgICByZXR1cm4gYyA9PT0gYCdgID8gYCcnYCA6IGBcXFxcJHtjfWA7XG4gICAgfSlcbiAgICAuam9pbignJyk7XG59XG5cbmZ1bmN0aW9uIGxpdGVyYWxpemVSZWdleFBhcnQoczogc3RyaW5nKSB7XG4gIGNvbnN0IG1hdGNoZXIxID0gL1xcXFxRKCg/IVxcXFxFKS4qKVxcXFxFJC87XG4gIGNvbnN0IHJlc3VsdDE6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjEpO1xuICBpZiAocmVzdWx0MSAmJiByZXN1bHQxLmxlbmd0aCA+IDEgJiYgcmVzdWx0MS5pbmRleCA+IC0xKSB7XG4gICAgLy8gcHJvY2VzcyByZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBhbmQgYW4gZW5kIHNwZWNpZmllZCBmb3IgdGhlIGxpdGVyYWwgdGV4dFxuICAgIGNvbnN0IHByZWZpeCA9IHMuc3Vic3RyKDAsIHJlc3VsdDEuaW5kZXgpO1xuICAgIGNvbnN0IHJlbWFpbmluZyA9IHJlc3VsdDFbMV07XG5cbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChwcmVmaXgpICsgY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZyk7XG4gIH1cblxuICAvLyBwcm9jZXNzIHJlZ2V4IHRoYXQgaGFzIGEgYmVnaW5uaW5nIHNwZWNpZmllZCBmb3IgdGhlIGxpdGVyYWwgdGV4dFxuICBjb25zdCBtYXRjaGVyMiA9IC9cXFxcUSgoPyFcXFxcRSkuKikkLztcbiAgY29uc3QgcmVzdWx0MjogYW55ID0gcy5tYXRjaChtYXRjaGVyMik7XG4gIGlmIChyZXN1bHQyICYmIHJlc3VsdDIubGVuZ3RoID4gMSAmJiByZXN1bHQyLmluZGV4ID4gLTEpIHtcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cigwLCByZXN1bHQyLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQyWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gcmVtb3ZlIGFsbCBpbnN0YW5jZXMgb2YgXFxRIGFuZCBcXEUgZnJvbSB0aGUgcmVtYWluaW5nIHRleHQgJiBlc2NhcGUgc2luZ2xlIHF1b3Rlc1xuICByZXR1cm4gc1xuICAgIC5yZXBsYWNlKC8oW15cXFxcXSkoXFxcXEUpLywgJyQxJylcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxRKS8sICckMScpXG4gICAgLnJlcGxhY2UoL15cXFxcRS8sICcnKVxuICAgIC5yZXBsYWNlKC9eXFxcXFEvLCAnJylcbiAgICAucmVwbGFjZSgvKFteJ10pJy8sIGAkMScnYClcbiAgICAucmVwbGFjZSgvXicoW14nXSkvLCBgJyckMWApO1xufVxuXG52YXIgR2VvUG9pbnRDb2RlciA9IHtcbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCdcbiAgICApO1xuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiJdfQ==