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
        await t.none(`ALTER TABLE $1:name DROP COLUMN IF EXISTS ${columns}`, values);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIuanMiXSwibmFtZXMiOlsiUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciIsIlBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVPYmplY3RFcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsIlBvc3RncmVzVHJhbnNhY3Rpb25BYm9ydGVkRXJyb3IiLCJsb2dnZXIiLCJyZXF1aXJlIiwiZGVidWciLCJhcmdzIiwiYXJndW1lbnRzIiwiY29uY2F0Iiwic2xpY2UiLCJsZW5ndGgiLCJsb2ciLCJnZXRMb2dnZXIiLCJhcHBseSIsInBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlIiwidHlwZSIsImNvbnRlbnRzIiwiSlNPTiIsInN0cmluZ2lmeSIsIlBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciIsIiRndCIsIiRsdCIsIiRndGUiLCIkbHRlIiwibW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzIiwiJGRheU9mTW9udGgiLCIkZGF5T2ZXZWVrIiwiJGRheU9mWWVhciIsIiRpc29EYXlPZldlZWsiLCIkaXNvV2Vla1llYXIiLCIkaG91ciIsIiRtaW51dGUiLCIkc2Vjb25kIiwiJG1pbGxpc2Vjb25kIiwiJG1vbnRoIiwiJHdlZWsiLCIkeWVhciIsInRvUG9zdGdyZXNWYWx1ZSIsInZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRyYW5zZm9ybVZhbHVlIiwib2JqZWN0SWQiLCJlbXB0eUNMUFMiLCJPYmplY3QiLCJmcmVlemUiLCJmaW5kIiwiZ2V0IiwiY291bnQiLCJjcmVhdGUiLCJ1cGRhdGUiLCJkZWxldGUiLCJhZGRGaWVsZCIsInByb3RlY3RlZEZpZWxkcyIsImRlZmF1bHRDTFBTIiwidG9QYXJzZVNjaGVtYSIsInNjaGVtYSIsImNsYXNzTmFtZSIsImZpZWxkcyIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfd3Blcm0iLCJfcnBlcm0iLCJjbHBzIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaW5kZXhlcyIsInRvUG9zdGdyZXNTY2hlbWEiLCJfcGFzc3dvcmRfaGlzdG9yeSIsImhhbmRsZURvdEZpZWxkcyIsIm9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwiZmllbGROYW1lIiwiaW5kZXhPZiIsImNvbXBvbmVudHMiLCJzcGxpdCIsImZpcnN0Iiwic2hpZnQiLCJjdXJyZW50T2JqIiwibmV4dCIsIl9fb3AiLCJ1bmRlZmluZWQiLCJ0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyIsIm1hcCIsImNtcHQiLCJpbmRleCIsInRyYW5zZm9ybURvdEZpZWxkIiwiam9pbiIsInRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkIiwic3Vic3RyIiwidmFsaWRhdGVLZXlzIiwia2V5IiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwiam9pblRhYmxlc0ZvclNjaGVtYSIsImxpc3QiLCJmaWVsZCIsInB1c2giLCJidWlsZFdoZXJlQ2xhdXNlIiwicXVlcnkiLCJjYXNlSW5zZW5zaXRpdmUiLCJwYXR0ZXJucyIsInZhbHVlcyIsInNvcnRzIiwiaXNBcnJheUZpZWxkIiwiaW5pdGlhbFBhdHRlcm5zTGVuZ3RoIiwiZmllbGRWYWx1ZSIsIiRleGlzdHMiLCJhdXRoRGF0YU1hdGNoIiwibWF0Y2giLCIkaW4iLCIkcmVnZXgiLCJNQVhfSU5UX1BMVVNfT05FIiwiY2xhdXNlcyIsImNsYXVzZVZhbHVlcyIsInN1YlF1ZXJ5IiwiY2xhdXNlIiwicGF0dGVybiIsIm9yT3JBbmQiLCJub3QiLCIkbmUiLCJjb25zdHJhaW50RmllbGROYW1lIiwicG9pbnQiLCJsb25naXR1ZGUiLCJsYXRpdHVkZSIsIiRlcSIsImlzSW5Pck5pbiIsIkFycmF5IiwiaXNBcnJheSIsIiRuaW4iLCJpblBhdHRlcm5zIiwiYWxsb3dOdWxsIiwibGlzdEVsZW0iLCJsaXN0SW5kZXgiLCJjcmVhdGVDb25zdHJhaW50IiwiYmFzZUFycmF5Iiwibm90SW4iLCJfIiwiZmxhdE1hcCIsImVsdCIsIklOVkFMSURfSlNPTiIsIiRhbGwiLCJpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoIiwiaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSIsImkiLCJwcm9jZXNzUmVnZXhQYXR0ZXJuIiwic3Vic3RyaW5nIiwiJGNvbnRhaW5lZEJ5IiwiYXJyIiwiJHRleHQiLCJzZWFyY2giLCIkc2VhcmNoIiwibGFuZ3VhZ2UiLCIkdGVybSIsIiRsYW5ndWFnZSIsIiRjYXNlU2Vuc2l0aXZlIiwiJGRpYWNyaXRpY1NlbnNpdGl2ZSIsIiRuZWFyU3BoZXJlIiwiZGlzdGFuY2UiLCIkbWF4RGlzdGFuY2UiLCJkaXN0YW5jZUluS00iLCIkd2l0aGluIiwiJGJveCIsImJveCIsImxlZnQiLCJib3R0b20iLCJyaWdodCIsInRvcCIsIiRnZW9XaXRoaW4iLCIkY2VudGVyU3BoZXJlIiwiY2VudGVyU3BoZXJlIiwiR2VvUG9pbnQiLCJHZW9Qb2ludENvZGVyIiwiaXNWYWxpZEpTT04iLCJfdmFsaWRhdGUiLCJpc05hTiIsIiRwb2x5Z29uIiwicG9seWdvbiIsInBvaW50cyIsImNvb3JkaW5hdGVzIiwiJGdlb0ludGVyc2VjdHMiLCIkcG9pbnQiLCJyZWdleCIsIm9wZXJhdG9yIiwib3B0cyIsIiRvcHRpb25zIiwicmVtb3ZlV2hpdGVTcGFjZSIsImNvbnZlcnRQb2x5Z29uVG9TUUwiLCJjbXAiLCJwZ0NvbXBhcmF0b3IiLCJwb3N0Z3Jlc1ZhbHVlIiwiY2FzdFR5cGUiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIl9jb2xsZWN0aW9uUHJlZml4IiwiY2xpZW50IiwicGdwIiwiX2NsaWVudCIsIl9wZ3AiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwiY3JlYXRlRXhwbGFpbmFibGVRdWVyeSIsImFuYWx5emUiLCJoYW5kbGVTaHV0ZG93biIsIiRwb29sIiwiZW5kIiwiX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMiLCJjb25uIiwibm9uZSIsImNhdGNoIiwiZXJyb3IiLCJjb2RlIiwiY2xhc3NFeGlzdHMiLCJvbmUiLCJhIiwiZXhpc3RzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInNlbGYiLCJ0YXNrIiwidCIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0Iiwic3VibWl0dGVkSW5kZXhlcyIsImV4aXN0aW5nSW5kZXhlcyIsIlByb21pc2UiLCJyZXNvbHZlIiwiX2lkXyIsIl9pZCIsImRlbGV0ZWRJbmRleGVzIiwiaW5zZXJ0ZWRJbmRleGVzIiwiSU5WQUxJRF9RVUVSWSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInR4IiwiY3JlYXRlSW5kZXhlcyIsImRyb3BJbmRleGVzIiwiY3JlYXRlQ2xhc3MiLCJxMSIsImNyZWF0ZVRhYmxlIiwicTIiLCJxMyIsImJhdGNoIiwidGhlbiIsImVyciIsImRhdGEiLCJyZXN1bHQiLCJkZXRhaWwiLCJEVVBMSUNBVEVfVkFMVUUiLCJ2YWx1ZXNBcnJheSIsInBhdHRlcm5zQXJyYXkiLCJhc3NpZ24iLCJfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQiLCJfZW1haWxfdmVyaWZ5X3Rva2VuIiwiX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0IiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsIl9wZXJpc2hhYmxlX3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwicmVsYXRpb25zIiwicGFyc2VUeXBlIiwicXMiLCJqb2luVGFibGUiLCJzY2hlbWFVcGdyYWRlIiwiY29sdW1ucyIsImNvbHVtbl9uYW1lIiwibmV3Q29sdW1ucyIsImZpbHRlciIsIml0ZW0iLCJhZGRGaWVsZElmTm90RXhpc3RzIiwicG9zdGdyZXNUeXBlIiwiYW55IiwicGF0aCIsImRlbGV0ZUNsYXNzIiwib3BlcmF0aW9ucyIsImhlbHBlcnMiLCJkZWxldGVBbGxDbGFzc2VzIiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJyZXN1bHRzIiwiam9pbnMiLCJyZWR1Y2UiLCJjbGFzc2VzIiwicXVlcmllcyIsImRlbGV0ZUZpZWxkcyIsImZpZWxkTmFtZXMiLCJpZHgiLCJnZXRBbGxDbGFzc2VzIiwicm93IiwiZ2V0Q2xhc3MiLCJjcmVhdGVPYmplY3QiLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbHVtbnNBcnJheSIsImdlb1BvaW50cyIsInByb3ZpZGVyIiwicG9wIiwiaW5pdGlhbFZhbHVlcyIsInZhbCIsInRlcm1pbmF0aW9uIiwiZ2VvUG9pbnRzSW5qZWN0cyIsImwiLCJjb2x1bW5zUGF0dGVybiIsImNvbCIsInZhbHVlc1BhdHRlcm4iLCJwcm9taXNlIiwib3BzIiwidW5kZXJseWluZ0Vycm9yIiwiY29uc3RyYWludCIsIm1hdGNoZXMiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsIndoZXJlIiwiT0JKRUNUX05PVF9GT1VORCIsImZpbmRPbmVBbmRVcGRhdGUiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwZGF0ZVBhdHRlcm5zIiwib3JpZ2luYWxVcGRhdGUiLCJkb3ROb3RhdGlvbk9wdGlvbnMiLCJnZW5lcmF0ZSIsImpzb25iIiwibGFzdEtleSIsImZpZWxkTmFtZUluZGV4Iiwic3RyIiwiYW1vdW50Iiwib2JqZWN0cyIsImtleXNUb0luY3JlbWVudCIsImsiLCJpbmNyZW1lbnRQYXR0ZXJucyIsImMiLCJrZXlzVG9EZWxldGUiLCJkZWxldGVQYXR0ZXJucyIsInAiLCJ1cGRhdGVPYmplY3QiLCJleHBlY3RlZFR5cGUiLCJyZWplY3QiLCJ3aGVyZUNsYXVzZSIsInVwc2VydE9uZU9iamVjdCIsImNyZWF0ZVZhbHVlIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImV4cGxhaW4iLCJoYXNMaW1pdCIsImhhc1NraXAiLCJ3aGVyZVBhdHRlcm4iLCJsaW1pdFBhdHRlcm4iLCJza2lwUGF0dGVybiIsInNvcnRQYXR0ZXJuIiwic29ydENvcHkiLCJzb3J0aW5nIiwidHJhbnNmb3JtS2V5IiwibWVtbyIsIm9yaWdpbmFsUXVlcnkiLCJwb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QiLCJ0YXJnZXRDbGFzcyIsInkiLCJ4IiwiY29vcmRzIiwicGFyc2VGbG9hdCIsImNyZWF0ZWRBdCIsInRvSVNPU3RyaW5nIiwidXBkYXRlZEF0IiwiZXhwaXJlc0F0IiwiZW5zdXJlVW5pcXVlbmVzcyIsImNvbnN0cmFpbnROYW1lIiwiY29uc3RyYWludFBhdHRlcm5zIiwibWVzc2FnZSIsInJlYWRQcmVmZXJlbmNlIiwiZXN0aW1hdGUiLCJhcHByb3hpbWF0ZV9yb3dfY291bnQiLCJkaXN0aW5jdCIsImNvbHVtbiIsImlzTmVzdGVkIiwiaXNQb2ludGVyRmllbGQiLCJ0cmFuc2Zvcm1lciIsImNoaWxkIiwiYWdncmVnYXRlIiwicGlwZWxpbmUiLCJoaW50IiwiY291bnRGaWVsZCIsImdyb3VwVmFsdWVzIiwiZ3JvdXBQYXR0ZXJuIiwic3RhZ2UiLCIkZ3JvdXAiLCJncm91cEJ5RmllbGRzIiwiYWxpYXMiLCJzb3VyY2UiLCJvcGVyYXRpb24iLCIkc3VtIiwiJG1heCIsIiRtaW4iLCIkYXZnIiwiJHByb2plY3QiLCIkbWF0Y2giLCIkb3IiLCJjb2xsYXBzZSIsImVsZW1lbnQiLCJtYXRjaFBhdHRlcm5zIiwiJGxpbWl0IiwiJHNraXAiLCIkc29ydCIsIm9yZGVyIiwiZSIsInRyaW0iLCJCb29sZWFuIiwicGFyc2VJbnQiLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwicHJvbWlzZXMiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJhbGwiLCJzcWwiLCJtaXNjIiwianNvbk9iamVjdFNldEtleXMiLCJhcnJheSIsImFkZCIsImFkZFVuaXF1ZSIsInJlbW92ZSIsImNvbnRhaW5zQWxsIiwiY29udGFpbnNBbGxSZWdleCIsImNvbnRhaW5zIiwiZHVyYXRpb24iLCJjb25zb2xlIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZ2V0SW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwidXBkYXRlRXN0aW1hdGVkQ291bnQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwib3B0aW9ucyIsImRlZmF1bHRJbmRleE5hbWUiLCJpbmRleE5hbWVPcHRpb25zIiwidW5pcXVlIiwiYXIiLCJmb3VuZEluZGV4IiwicHQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlbmRzV2l0aCIsInJlcGxhY2UiLCJzIiwic3RhcnRzV2l0aCIsImxpdGVyYWxpemVSZWdleFBhcnQiLCJpc1N0YXJ0c1dpdGhSZWdleCIsImZpcnN0VmFsdWVzSXNSZWdleCIsInNvbWUiLCJjcmVhdGVMaXRlcmFsUmVnZXgiLCJyZW1haW5pbmciLCJSZWdFeHAiLCJtYXRjaGVyMSIsInJlc3VsdDEiLCJwcmVmaXgiLCJtYXRjaGVyMiIsInJlc3VsdDIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFDQTs7QUFFQTs7QUFFQTs7QUFDQTs7QUFpQkE7Ozs7Ozs7Ozs7QUFmQSxNQUFNQSxpQ0FBaUMsR0FBRyxPQUExQztBQUNBLE1BQU1DLDhCQUE4QixHQUFHLE9BQXZDO0FBQ0EsTUFBTUMsNEJBQTRCLEdBQUcsT0FBckM7QUFDQSxNQUFNQywwQkFBMEIsR0FBRyxPQUFuQztBQUNBLE1BQU1DLDRCQUE0QixHQUFHLE9BQXJDO0FBQ0EsTUFBTUMsaUNBQWlDLEdBQUcsT0FBMUM7QUFDQSxNQUFNQywrQkFBK0IsR0FBRyxPQUF4Qzs7QUFDQSxNQUFNQyxNQUFNLEdBQUdDLE9BQU8sQ0FBQyxp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R1gsQ0FBQyxDQUFDeFcsTUFBRixDQUFTLENBQVQsRUFBWXFYLE9BQU8sQ0FBQ3pYLEtBQXBCLENBQWY7QUFDQSxVQUFNbVgsU0FBUyxHQUFHTSxPQUFPLENBQUMsQ0FBRCxDQUF6QjtBQUVBLFdBQU9YLG1CQUFtQixDQUFDUyxNQUFELENBQW5CLEdBQThCTCxrQkFBa0IsQ0FBQ0MsU0FBRCxDQUF2RDtBQUNELEdBbkJxQyxDQXFCdEM7OztBQUNBLFNBQU9QLENBQUMsQ0FDTEQsT0FESSxDQUNJLGNBREosRUFDb0IsSUFEcEIsRUFFSkEsT0FGSSxDQUVJLGNBRkosRUFFb0IsSUFGcEIsRUFHSkEsT0FISSxDQUdJLE1BSEosRUFHWSxFQUhaLEVBSUpBLE9BSkksQ0FJSSxNQUpKLEVBSVksRUFKWixFQUtKQSxPQUxJLENBS0ksU0FMSixFQUtnQixNQUxoQixFQU1KQSxPQU5JLENBTUksVUFOSixFQU1pQixNQU5qQixDQUFQO0FBT0Q7O0FBRUQsSUFBSWxSLGFBQWEsR0FBRztBQUNsQkMsRUFBQUEsV0FBVyxDQUFDekksS0FBRCxFQUFRO0FBQ2pCLFdBQ0UsT0FBT0EsS0FBUCxLQUFpQixRQUFqQixJQUE2QkEsS0FBSyxLQUFLLElBQXZDLElBQStDQSxLQUFLLENBQUNDLE1BQU4sS0FBaUIsVUFEbEU7QUFHRDs7QUFMaUIsQ0FBcEI7ZUFRZTRKLHNCIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbmltcG9ydCB7IGNyZWF0ZUNsaWVudCB9IGZyb20gJy4vUG9zdGdyZXNDbGllbnQnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgc3FsIGZyb20gJy4vc3FsJztcblxuY29uc3QgUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yID0gJzQyUDAxJztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciA9ICc0MlAwNyc7XG5jb25zdCBQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yID0gJzQyNzAxJztcbmNvbnN0IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yID0gJzQyNzAzJztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlT2JqZWN0RXJyb3IgPSAnNDI3MTAnO1xuY29uc3QgUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yID0gJzIzNTA1JztcbmNvbnN0IFBvc3RncmVzVHJhbnNhY3Rpb25BYm9ydGVkRXJyb3IgPSAnMjVQMDInO1xuY29uc3QgbG9nZ2VyID0gcmVxdWlyZSgnLi4vLi4vLi4vbG9nZ2VyJyk7XG5cbmNvbnN0IGRlYnVnID0gZnVuY3Rpb24gKC4uLmFyZ3M6IGFueSkge1xuICBhcmdzID0gWydQRzogJyArIGFyZ3VtZW50c1swXV0uY29uY2F0KGFyZ3Muc2xpY2UoMSwgYXJncy5sZW5ndGgpKTtcbiAgY29uc3QgbG9nID0gbG9nZ2VyLmdldExvZ2dlcigpO1xuICBsb2cuZGVidWcuYXBwbHkobG9nLCBhcmdzKTtcbn07XG5cbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHR5cGUgeyBTY2hlbWFUeXBlLCBRdWVyeVR5cGUsIFF1ZXJ5T3B0aW9ucyB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcblxuY29uc3QgcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUgPSB0eXBlID0+IHtcbiAgc3dpdGNoICh0eXBlLnR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiAndGltZXN0YW1wIHdpdGggdGltZSB6b25lJztcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdib29sZWFuJztcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiAnZG91YmxlIHByZWNpc2lvbic7XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuICdwb2ludCc7XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gJ3BvbHlnb24nO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIGlmICh0eXBlLmNvbnRlbnRzICYmIHR5cGUuY29udGVudHMudHlwZSA9PT0gJ1N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuICd0ZXh0W10nO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IGBubyB0eXBlIGZvciAke0pTT04uc3RyaW5naWZ5KHR5cGUpfSB5ZXRgO1xuICB9XG59O1xuXG5jb25zdCBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IgPSB7XG4gICRndDogJz4nLFxuICAkbHQ6ICc8JyxcbiAgJGd0ZTogJz49JyxcbiAgJGx0ZTogJzw9Jyxcbn07XG5cbmNvbnN0IG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3JlcyA9IHtcbiAgJGRheU9mTW9udGg6ICdEQVknLFxuICAkZGF5T2ZXZWVrOiAnRE9XJyxcbiAgJGRheU9mWWVhcjogJ0RPWScsXG4gICRpc29EYXlPZldlZWs6ICdJU09ET1cnLFxuICAkaXNvV2Vla1llYXI6ICdJU09ZRUFSJyxcbiAgJGhvdXI6ICdIT1VSJyxcbiAgJG1pbnV0ZTogJ01JTlVURScsXG4gICRzZWNvbmQ6ICdTRUNPTkQnLFxuICAkbWlsbGlzZWNvbmQ6ICdNSUxMSVNFQ09ORFMnLFxuICAkbW9udGg6ICdNT05USCcsXG4gICR3ZWVrOiAnV0VFSycsXG4gICR5ZWFyOiAnWUVBUicsXG59O1xuXG5jb25zdCB0b1Bvc3RncmVzVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICByZXR1cm4gdmFsdWUuaXNvO1xuICAgIH1cbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuLy8gRHVwbGljYXRlIGZyb20gdGhlbiBtb25nbyBhZGFwdGVyLi4uXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGdldDoge30sXG4gIGNvdW50OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmNvbnN0IHRvUGFyc2VTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cbiAgaWYgKHNjaGVtYS5maWVsZHMpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICB9XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGlmIChzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5zY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH07XG4gIH1cbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKHNjaGVtYS5pbmRleGVzKSB7XG4gICAgaW5kZXhlcyA9IHsgLi4uc2NoZW1hLmluZGV4ZXMgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXMsXG4gIH07XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGhhbmRsZURvdEZpZWxkcyA9IG9iamVjdCA9PiB7XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgb2JqZWN0W2ZpcnN0XSA9IG9iamVjdFtmaXJzdF0gfHwge307XG4gICAgICBsZXQgY3VycmVudE9iaiA9IG9iamVjdFtmaXJzdF07XG4gICAgICBsZXQgbmV4dDtcbiAgICAgIGxldCB2YWx1ZSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHZhbHVlID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgIHdoaWxlICgobmV4dCA9IGNvbXBvbmVudHMuc2hpZnQoKSkpIHtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgICBjdXJyZW50T2JqW25leHRdID0gY3VycmVudE9ialtuZXh0XSB8fCB7fTtcbiAgICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRPYmogPSBjdXJyZW50T2JqW25leHRdO1xuICAgICAgfVxuICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyA9IGZpZWxkTmFtZSA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKS5tYXAoKGNtcHQsIGluZGV4KSA9PiB7XG4gICAgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICByZXR1cm4gYFwiJHtjbXB0fVwiYDtcbiAgICB9XG4gICAgcmV0dXJuIGAnJHtjbXB0fSdgO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgcmV0dXJuIGBcIiR7ZmllbGROYW1lfVwiYDtcbiAgfVxuICBjb25zdCBjb21wb25lbnRzID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKTtcbiAgbGV0IG5hbWUgPSBjb21wb25lbnRzLnNsaWNlKDAsIGNvbXBvbmVudHMubGVuZ3RoIC0gMSkuam9pbignLT4nKTtcbiAgbmFtZSArPSAnLT4+JyArIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIG5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmICh0eXBlb2YgZmllbGROYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBmaWVsZE5hbWU7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfY3JlYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ2NyZWF0ZWRBdCc7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfdXBkYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ3VwZGF0ZWRBdCc7XG4gIH1cbiAgcmV0dXJuIGZpZWxkTmFtZS5zdWJzdHIoMSk7XG59O1xuXG5jb25zdCB2YWxpZGF0ZUtleXMgPSBvYmplY3QgPT4ge1xuICBpZiAodHlwZW9mIG9iamVjdCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB2YWxpZGF0ZUtleXMob2JqZWN0W2tleV0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoa2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFJldHVybnMgdGhlIGxpc3Qgb2Ygam9pbiB0YWJsZXMgb24gYSBzY2hlbWFcbmNvbnN0IGpvaW5UYWJsZXNGb3JTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGlmIChzY2hlbWEpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChgX0pvaW46JHtmaWVsZH06JHtzY2hlbWEuY2xhc3NOYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBsaXN0O1xufTtcblxuaW50ZXJmYWNlIFdoZXJlQ2xhdXNlIHtcbiAgcGF0dGVybjogc3RyaW5nO1xuICB2YWx1ZXM6IEFycmF5PGFueT47XG4gIHNvcnRzOiBBcnJheTxhbnk+O1xufVxuXG5jb25zdCBidWlsZFdoZXJlQ2xhdXNlID0gKHtcbiAgc2NoZW1hLFxuICBxdWVyeSxcbiAgaW5kZXgsXG4gIGNhc2VJbnNlbnNpdGl2ZSxcbn0pOiBXaGVyZUNsYXVzZSA9PiB7XG4gIGNvbnN0IHBhdHRlcm5zID0gW107XG4gIGxldCB2YWx1ZXMgPSBbXTtcbiAgY29uc3Qgc29ydHMgPSBbXTtcblxuICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSc7XG4gICAgY29uc3QgaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID0gcGF0dGVybnMubGVuZ3RoO1xuICAgIGNvbnN0IGZpZWxkVmFsdWUgPSBxdWVyeVtmaWVsZE5hbWVdO1xuXG4gICAgLy8gbm90aGluZyBpbiB0aGUgc2NoZW1hLCBpdCdzIGdvbm5hIGJsb3cgdXBcbiAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgLy8gYXMgaXQgd29uJ3QgZXhpc3RcbiAgICAgIGlmIChmaWVsZFZhbHVlICYmIGZpZWxkVmFsdWUuJGV4aXN0cyA9PT0gZmFsc2UpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAvLyBUT0RPOiBIYW5kbGUgcXVlcnlpbmcgYnkgX2F1dGhfZGF0YV9wcm92aWRlciwgYXV0aERhdGEgaXMgc3RvcmVkIGluIGF1dGhEYXRhIGZpZWxkXG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgY2FzZUluc2Vuc2l0aXZlICYmXG4gICAgICAoZmllbGROYW1lID09PSAndXNlcm5hbWUnIHx8IGZpZWxkTmFtZSA9PT0gJ2VtYWlsJylcbiAgICApIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYExPV0VSKCQke2luZGV4fTpuYW1lKSA9IExPV0VSKCQke2luZGV4ICsgMX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgbGV0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKG5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRpbikge1xuICAgICAgICAgIG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpyYXcpOjpqc29uYiBAPiAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGluKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgICAgIC8vIEhhbmRsZSBsYXRlclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgPSAkJHtpbmRleCArIDF9Ojp0ZXh0YCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCBmaWVsZFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIC8vIENhbid0IGNhc3QgYm9vbGVhbiB0byBkb3VibGUgcHJlY2lzaW9uXG4gICAgICBpZiAoXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ051bWJlcidcbiAgICAgICkge1xuICAgICAgICAvLyBTaG91bGQgYWx3YXlzIHJldHVybiB6ZXJvIHJlc3VsdHNcbiAgICAgICAgY29uc3QgTUFYX0lOVF9QTFVTX09ORSA9IDkyMjMzNzIwMzY4NTQ3NzU4MDg7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgTUFYX0lOVF9QTFVTX09ORSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgfVxuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKFsnJG9yJywgJyRub3InLCAnJGFuZCddLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgIGNvbnN0IGNsYXVzZXMgPSBbXTtcbiAgICAgIGNvbnN0IGNsYXVzZVZhbHVlcyA9IFtdO1xuICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKHN1YlF1ZXJ5ID0+IHtcbiAgICAgICAgY29uc3QgY2xhdXNlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIHF1ZXJ5OiBzdWJRdWVyeSxcbiAgICAgICAgICBpbmRleCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2xhdXNlLnBhdHRlcm4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsYXVzZXMucHVzaChjbGF1c2UucGF0dGVybik7XG4gICAgICAgICAgY2xhdXNlVmFsdWVzLnB1c2goLi4uY2xhdXNlLnZhbHVlcyk7XG4gICAgICAgICAgaW5kZXggKz0gY2xhdXNlLnZhbHVlcy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvck9yQW5kID0gZmllbGROYW1lID09PSAnJGFuZCcgPyAnIEFORCAnIDogJyBPUiAnO1xuICAgICAgY29uc3Qgbm90ID0gZmllbGROYW1lID09PSAnJG5vcicgPyAnIE5PVCAnIDogJyc7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSgke2NsYXVzZXMuam9pbihvck9yQW5kKX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaCguLi5jbGF1c2VWYWx1ZXMpO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuJG5lID0gSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWUuJG5lXSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYE5PVCBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGlmIG5vdCBudWxsLCB3ZSBuZWVkIHRvIG1hbnVhbGx5IGV4Y2x1ZGUgbnVsbFxuICAgICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgICAgICAgIH0pIE9SICQke2luZGV4fTpuYW1lIElTIE5VTEwpYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPD4gJCR7aW5kZXh9IE9SICR7Y29uc3RyYWludEZpZWxkTmFtZX0gSVMgTlVMTClgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRuZTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlKTtcbiAgICAgICAgaW5kZXggKz0gMztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFRPRE86IHN1cHBvcnQgYXJyYXlzXG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS4kbmUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZmllbGRWYWx1ZS4kZXEgIT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGVxID09PSBudWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSA9ICQke2luZGV4Kyt9YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBpc0luT3JOaW4gPVxuICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgfHwgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRuaW4pO1xuICAgIGlmIChcbiAgICAgIEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pICYmXG4gICAgICBpc0FycmF5RmllbGQgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cyAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzLnR5cGUgPT09ICdTdHJpbmcnXG4gICAgKSB7XG4gICAgICBjb25zdCBpblBhdHRlcm5zID0gW107XG4gICAgICBsZXQgYWxsb3dOdWxsID0gZmFsc2U7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgZmllbGRWYWx1ZS4kaW4uZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICBpZiAobGlzdEVsZW0gPT09IG51bGwpIHtcbiAgICAgICAgICBhbGxvd051bGwgPSB0cnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleCAtIChhbGxvd051bGwgPyAxIDogMCl9YCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKGFsbG93TnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgSVMgTlVMTCBPUiAkJHtpbmRleH06bmFtZSAmJiBBUlJBWVske2luUGF0dGVybnMuam9pbigpfV0pYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgIH0gZWxzZSBpZiAoaXNJbk9yTmluKSB7XG4gICAgICB2YXIgY3JlYXRlQ29uc3RyYWludCA9IChiYXNlQXJyYXksIG5vdEluKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vdCA9IG5vdEluID8gJyBOT1QgJyA6ICcnO1xuICAgICAgICBpZiAoYmFzZUFycmF5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICBgJHtub3R9IGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGJhc2VBcnJheSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSGFuZGxlIE5lc3RlZCBEb3QgTm90YXRpb24gQWJvdmVcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIGJhc2VBcnJheS5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGlmIChsaXN0RWxlbSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4fWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7bm90fSBJTiAoJHtpblBhdHRlcm5zLmpvaW4oKX0pYCk7XG4gICAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghbm90SW4pIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBIYW5kbGUgZW1wdHkgYXJyYXlcbiAgICAgICAgICBpZiAobm90SW4pIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAxJyk7IC8vIFJldHVybiBhbGwgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAyJyk7IC8vIFJldHVybiBubyB2YWx1ZXNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChcbiAgICAgICAgICBfLmZsYXRNYXAoZmllbGRWYWx1ZS4kaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIGZhbHNlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJG5pbiwgZWx0ID0+IGVsdCksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkaW4gdmFsdWUnKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuaW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRuaW4gdmFsdWUnKTtcbiAgICB9XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpICYmIGlzQXJyYXlGaWVsZCkge1xuICAgICAgaWYgKGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICBpZiAoIWlzQWxsVmFsdWVzUmVnZXhPck5vbmUoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdBbGwgJGFsbCB2YWx1ZXMgbXVzdCBiZSBvZiByZWdleCB0eXBlIG9yIG5vbmU6ICcgKyBmaWVsZFZhbHVlLiRhbGxcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZFZhbHVlLiRhbGwubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHByb2Nlc3NSZWdleFBhdHRlcm4oZmllbGRWYWx1ZS4kYWxsW2ldLiRyZWdleCk7XG4gICAgICAgICAgZmllbGRWYWx1ZS4kYWxsW2ldID0gdmFsdWUuc3Vic3RyaW5nKDEpICsgJyUnO1xuICAgICAgICB9XG4gICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYGFycmF5X2NvbnRhaW5zX2FsbF9yZWdleCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICBgYXJyYXlfY29udGFpbnNfYWxsKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGFsbCkpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGFsbC5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS4kYWxsWzBdLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGV4aXN0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRleGlzdHMpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRjb250YWluZWRCeSkge1xuICAgICAgY29uc3QgYXJyID0gZmllbGRWYWx1ZS4kY29udGFpbmVkQnk7XG4gICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICRjb250YWluZWRCeTogc2hvdWxkIGJlIGFuIGFycmF5YFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA8QCAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShhcnIpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHRleHQpIHtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IGZpZWxkVmFsdWUuJHRleHQuJHNlYXJjaDtcbiAgICAgIGxldCBsYW5ndWFnZSA9ICdlbmdsaXNoJztcbiAgICAgIGlmICh0eXBlb2Ygc2VhcmNoICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRzZWFyY2gsIHNob3VsZCBiZSBvYmplY3RgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoIXNlYXJjaC4kdGVybSB8fCB0eXBlb2Ygc2VhcmNoLiR0ZXJtICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICR0ZXJtLCBzaG91bGQgYmUgc3RyaW5nYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGxhbmd1YWdlKSB7XG4gICAgICAgIGxhbmd1YWdlID0gc2VhcmNoLiRsYW5ndWFnZTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSBub3Qgc3VwcG9ydGVkLCBwbGVhc2UgdXNlICRyZWdleCBvciBjcmVhdGUgYSBzZXBhcmF0ZSBsb3dlciBjYXNlIGNvbHVtbi5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICYmXG4gICAgICAgIHR5cGVvZiBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSAtIGZhbHNlIG5vdCBzdXBwb3J0ZWQsIGluc3RhbGwgUG9zdGdyZXMgVW5hY2NlbnQgRXh0ZW5zaW9uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYHRvX3RzdmVjdG9yKCQke2luZGV4fSwgJCR7aW5kZXggKyAxfTpuYW1lKSBAQCB0b190c3F1ZXJ5KCQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9LCAkJHtpbmRleCArIDN9KWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChsYW5ndWFnZSwgZmllbGROYW1lLCBsYW5ndWFnZSwgc2VhcmNoLiR0ZXJtKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJG5lYXJTcGhlcmUpIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kbmVhclNwaGVyZTtcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gZmllbGRWYWx1ZS4kbWF4RGlzdGFuY2U7XG4gICAgICBjb25zdCBkaXN0YW5jZUluS00gPSBkaXN0YW5jZSAqIDYzNzEgKiAxMDAwO1xuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICBzb3J0cy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSBBU0NgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kd2l0aGluICYmIGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94KSB7XG4gICAgICBjb25zdCBib3ggPSBmaWVsZFZhbHVlLiR3aXRoaW4uJGJveDtcbiAgICAgIGNvbnN0IGxlZnQgPSBib3hbMF0ubG9uZ2l0dWRlO1xuICAgICAgY29uc3QgYm90dG9tID0gYm94WzBdLmxhdGl0dWRlO1xuICAgICAgY29uc3QgcmlnaHQgPSBib3hbMV0ubG9uZ2l0dWRlO1xuICAgICAgY29uc3QgdG9wID0gYm94WzFdLmxhdGl0dWRlO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9pbnQgPEAgJCR7aW5kZXggKyAxfTo6Ym94YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoKCR7bGVmdH0sICR7Ym90dG9tfSksICgke3JpZ2h0fSwgJHt0b3B9KSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb1dpdGhpbiAmJiBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZSkge1xuICAgICAgY29uc3QgY2VudGVyU3BoZXJlID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRjZW50ZXJTcGhlcmU7XG4gICAgICBpZiAoIShjZW50ZXJTcGhlcmUgaW5zdGFuY2VvZiBBcnJheSkgfHwgY2VudGVyU3BoZXJlLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgc2hvdWxkIGJlIGFuIGFycmF5IG9mIFBhcnNlLkdlb1BvaW50IGFuZCBkaXN0YW5jZSdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIEdldCBwb2ludCwgY29udmVydCB0byBnZW8gcG9pbnQgaWYgbmVjZXNzYXJ5IGFuZCB2YWxpZGF0ZVxuICAgICAgbGV0IHBvaW50ID0gY2VudGVyU3BoZXJlWzBdO1xuICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICB9IGVsc2UgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBnZW8gcG9pbnQgaW52YWxpZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIC8vIEdldCBkaXN0YW5jZSBhbmQgdmFsaWRhdGVcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gY2VudGVyU3BoZXJlWzFdO1xuICAgICAgaWYgKGlzTmFOKGRpc3RhbmNlKSB8fCBkaXN0YW5jZSA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZGlzdGFuY2UgaW52YWxpZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSA8PSAkJHtpbmRleCArIDN9YFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSwgZGlzdGFuY2VJbktNKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb1dpdGhpbiAmJiBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJHBvbHlnb24pIHtcbiAgICAgIGNvbnN0IHBvbHlnb24gPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJHBvbHlnb247XG4gICAgICBsZXQgcG9pbnRzO1xuICAgICAgaWYgKHR5cGVvZiBwb2x5Z29uID09PSAnb2JqZWN0JyAmJiBwb2x5Z29uLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGlmICghcG9seWdvbi5jb29yZGluYXRlcyB8fCBwb2x5Z29uLmNvb3JkaW5hdGVzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7IFBvbHlnb24uY29vcmRpbmF0ZXMgc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBsb24vbGF0IHBhaXJzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcG9pbnRzID0gcG9seWdvbi5jb29yZGluYXRlcztcbiAgICAgIH0gZWxzZSBpZiAocG9seWdvbiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgR2VvUG9pbnRzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcG9pbnRzID0gcG9seWdvbjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgXCJiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGJlIFBvbHlnb24gb2JqZWN0IG9yIEFycmF5IG9mIFBhcnNlLkdlb1BvaW50J3NcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcG9pbnRzID0gcG9pbnRzXG4gICAgICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICAgICAgICByZXR1cm4gYCgke3BvaW50WzBdfSwgJHtwb2ludFsxXX0pYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHR5cGVvZiBwb2ludCAhPT0gJ29iamVjdCcgfHwgcG9pbnQuX190eXBlICE9PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCgke3BvaW50LmxvbmdpdHVkZX0sICR7cG9pbnQubGF0aXR1ZGV9KWA7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCcsICcpO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9pbnQgPEAgJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnRzfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzICYmIGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMuJHBvaW50KSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMuJHBvaW50O1xuICAgICAgaWYgKHR5cGVvZiBwb2ludCAhPT0gJ29iamVjdCcgfHwgcG9pbnQuX190eXBlICE9PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvSW50ZXJzZWN0IHZhbHVlOyAkcG9pbnQgc2hvdWxkIGJlIEdlb1BvaW50J1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvbHlnb24gQD4gJCR7aW5kZXggKyAxfTo6cG9pbnRgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50LmxvbmdpdHVkZX0sICR7cG9pbnQubGF0aXR1ZGV9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kcmVnZXgpIHtcbiAgICAgIGxldCByZWdleCA9IGZpZWxkVmFsdWUuJHJlZ2V4O1xuICAgICAgbGV0IG9wZXJhdG9yID0gJ34nO1xuICAgICAgY29uc3Qgb3B0cyA9IGZpZWxkVmFsdWUuJG9wdGlvbnM7XG4gICAgICBpZiAob3B0cykge1xuICAgICAgICBpZiAob3B0cy5pbmRleE9mKCdpJykgPj0gMCkge1xuICAgICAgICAgIG9wZXJhdG9yID0gJ34qJztcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0cy5pbmRleE9mKCd4JykgPj0gMCkge1xuICAgICAgICAgIHJlZ2V4ID0gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICByZWdleCA9IHByb2Nlc3NSZWdleFBhdHRlcm4ocmVnZXgpO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3ICR7b3BlcmF0b3J9ICckJHtpbmRleCArIDF9OnJhdydgKTtcbiAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIHJlZ2V4KTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWVdKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuaXNvKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSB+PSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICBpbmRleCArPSAzO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwoZmllbGRWYWx1ZS5jb29yZGluYXRlcyk7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSB+PSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKGNtcCA9PiB7XG4gICAgICBpZiAoZmllbGRWYWx1ZVtjbXBdIHx8IGZpZWxkVmFsdWVbY21wXSA9PT0gMCkge1xuICAgICAgICBjb25zdCBwZ0NvbXBhcmF0b3IgPSBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3JbY21wXTtcbiAgICAgICAgY29uc3QgcG9zdGdyZXNWYWx1ZSA9IHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlW2NtcF0pO1xuICAgICAgICBsZXQgY29uc3RyYWludEZpZWxkTmFtZTtcbiAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgIGxldCBjYXN0VHlwZTtcbiAgICAgICAgICBzd2l0Y2ggKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlKSB7XG4gICAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgICBjYXN0VHlwZSA9ICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgICAgY2FzdFR5cGUgPSAnYm9vbGVhbic7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgY2FzdFR5cGUgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gYCQke2luZGV4Kyt9Om5hbWVgO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWVzLnB1c2gocG9zdGdyZXNWYWx1ZSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCR7Y29uc3RyYWludEZpZWxkTmFtZX0gJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4Kyt9YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID09PSBwYXR0ZXJucy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB0aGlzIHF1ZXJ5IHR5cGUgeWV0ICR7SlNPTi5zdHJpbmdpZnkoXG4gICAgICAgICAgZmllbGRWYWx1ZVxuICAgICAgICApfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG4gIHZhbHVlcyA9IHZhbHVlcy5tYXAodHJhbnNmb3JtVmFsdWUpO1xuICByZXR1cm4geyBwYXR0ZXJuOiBwYXR0ZXJucy5qb2luKCcgQU5EICcpLCB2YWx1ZXMsIHNvcnRzIH07XG59O1xuXG5leHBvcnQgY2xhc3MgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBpbXBsZW1lbnRzIFN0b3JhZ2VBZGFwdGVyIHtcbiAgY2FuU29ydE9uSm9pblRhYmxlczogYm9vbGVhbjtcblxuICAvLyBQcml2YXRlXG4gIF9jb2xsZWN0aW9uUHJlZml4OiBzdHJpbmc7XG4gIF9jbGllbnQ6IGFueTtcbiAgX3BncDogYW55O1xuXG4gIGNvbnN0cnVjdG9yKHsgdXJpLCBjb2xsZWN0aW9uUHJlZml4ID0gJycsIGRhdGFiYXNlT3B0aW9ucyB9OiBhbnkpIHtcbiAgICB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ID0gY29sbGVjdGlvblByZWZpeDtcbiAgICBjb25zdCB7IGNsaWVudCwgcGdwIH0gPSBjcmVhdGVDbGllbnQodXJpLCBkYXRhYmFzZU9wdGlvbnMpO1xuICAgIHRoaXMuX2NsaWVudCA9IGNsaWVudDtcbiAgICB0aGlzLl9wZ3AgPSBwZ3A7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gZmFsc2U7XG4gIH1cblxuICAvL05vdGUgdGhhdCBhbmFseXplPXRydWUgd2lsbCBydW4gdGhlIHF1ZXJ5LCBleGVjdXRpbmcgSU5TRVJUUywgREVMRVRFUywgZXRjLlxuICBjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KHF1ZXJ5OiBzdHJpbmcsIGFuYWx5emU6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIGlmIChhbmFseXplKSB7XG4gICAgICByZXR1cm4gJ0VYUExBSU4gKEFOQUxZWkUsIEZPUk1BVCBKU09OKSAnICsgcXVlcnk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAoIXRoaXMuX2NsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLl9jbGllbnQuJHBvb2wuZW5kKCk7XG4gIH1cblxuICBhc3luYyBfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyhjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgYXdhaXQgY29ublxuICAgICAgLm5vbmUoXG4gICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBcIl9TQ0hFTUFcIiAoIFwiY2xhc3NOYW1lXCIgdmFyQ2hhcigxMjApLCBcInNjaGVtYVwiIGpzb25iLCBcImlzUGFyc2VDbGFzc1wiIGJvb2wsIFBSSU1BUlkgS0VZIChcImNsYXNzTmFtZVwiKSApJ1xuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciB8fFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciB8fFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlT2JqZWN0RXJyb3JcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gVGFibGUgYWxyZWFkeSBleGlzdHMsIG11c3QgaGF2ZSBiZWVuIGNyZWF0ZWQgYnkgYSBkaWZmZXJlbnQgcmVxdWVzdC4gSWdub3JlIGVycm9yLlxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGNsYXNzRXhpc3RzKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQub25lKFxuICAgICAgJ1NFTEVDVCBFWElTVFMgKFNFTEVDVCAxIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlcyBXSEVSRSB0YWJsZV9uYW1lID0gJDEpJyxcbiAgICAgIFtuYW1lXSxcbiAgICAgIGEgPT4gYS5leGlzdHNcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBDTFBzOiBhbnkpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudGFzaygnc2V0LWNsYXNzLWxldmVsLXBlcm1pc3Npb25zJywgYXN5bmMgdCA9PiB7XG4gICAgICBhd2FpdCBzZWxmLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKHQpO1xuICAgICAgY29uc3QgdmFsdWVzID0gW1xuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICdzY2hlbWEnLFxuICAgICAgICAnY2xhc3NMZXZlbFBlcm1pc3Npb25zJyxcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoQ0xQcyksXG4gICAgICBdO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICBgVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXNcbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRJbmRleGVzOiBhbnksXG4gICAgZXhpc3RpbmdJbmRleGVzOiBhbnkgPSB7fSxcbiAgICBmaWVsZHM6IGFueSxcbiAgICBjb25uOiA/YW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoc3VibWl0dGVkSW5kZXhlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0luZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZXhpc3RpbmdJbmRleGVzID0geyBfaWRfOiB7IF9pZDogMSB9IH07XG4gICAgfVxuICAgIGNvbnN0IGRlbGV0ZWRJbmRleGVzID0gW107XG4gICAgY29uc3QgaW5zZXJ0ZWRJbmRleGVzID0gW107XG4gICAgT2JqZWN0LmtleXMoc3VibWl0dGVkSW5kZXhlcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBkZWxldGVkSW5kZXhlcy5wdXNoKG5hbWUpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGtleSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCBjb25uLnR4KCdzZXQtaW5kZXhlcy13aXRoLXNjaGVtYS1mb3JtYXQnLCBhc3luYyB0ID0+IHtcbiAgICAgIGlmIChpbnNlcnRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lLCBpbnNlcnRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgaWYgKGRlbGV0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgYXdhaXQgc2VsZi5kcm9wSW5kZXhlcyhjbGFzc05hbWUsIGRlbGV0ZWRJbmRleGVzLCB0KTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHNlbGYuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHModCk7XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMScsXG4gICAgICAgIFtjbGFzc05hbWUsICdzY2hlbWEnLCAnaW5kZXhlcycsIEpTT04uc3RyaW5naWZ5KGV4aXN0aW5nSW5kZXhlcyldXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogP2FueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICByZXR1cm4gY29ublxuICAgICAgLnR4KCdjcmVhdGUtY2xhc3MnLCBhc3luYyB0ID0+IHtcbiAgICAgICAgY29uc3QgcTEgPSB0aGlzLmNyZWF0ZVRhYmxlKGNsYXNzTmFtZSwgc2NoZW1hLCB0KTtcbiAgICAgICAgY29uc3QgcTIgPSB0Lm5vbmUoXG4gICAgICAgICAgJ0lOU0VSVCBJTlRPIFwiX1NDSEVNQVwiIChcImNsYXNzTmFtZVwiLCBcInNjaGVtYVwiLCBcImlzUGFyc2VDbGFzc1wiKSBWQUxVRVMgKCQ8Y2xhc3NOYW1lPiwgJDxzY2hlbWE+LCB0cnVlKScsXG4gICAgICAgICAgeyBjbGFzc05hbWUsIHNjaGVtYSB9XG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IHEzID0gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgc2NoZW1hLmluZGV4ZXMsXG4gICAgICAgICAge30sXG4gICAgICAgICAgc2NoZW1hLmZpZWxkcyxcbiAgICAgICAgICB0XG4gICAgICAgICk7XG4gICAgICAgIC8vIFRPRE86IFRoZSB0ZXN0IHNob3VsZCBub3QgdmVyaWZ5IHRoZSByZXR1cm5lZCB2YWx1ZSwgYW5kIHRoZW5cbiAgICAgICAgLy8gIHRoZSBtZXRob2QgY2FuIGJlIHNpbXBsaWZpZWQsIHRvIGF2b2lkIHJldHVybmluZyB1c2VsZXNzIHN0dWZmLlxuICAgICAgICByZXR1cm4gdC5iYXRjaChbcTEsIHEyLCBxM10pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRvUGFyc2VTY2hlbWEoc2NoZW1hKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5kYXRhWzBdLnJlc3VsdC5jb2RlID09PSBQb3N0Z3Jlc1RyYW5zYWN0aW9uQWJvcnRlZEVycm9yKSB7XG4gICAgICAgICAgZXJyID0gZXJyLmRhdGFbMV0ucmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICBlcnIuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yICYmXG4gICAgICAgICAgZXJyLmRldGFpbC5pbmNsdWRlcyhjbGFzc05hbWUpXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBKdXN0IGNyZWF0ZSBhIHRhYmxlLCBkbyBub3QgaW5zZXJ0IGluIHNjaGVtYVxuICBhc3luYyBjcmVhdGVUYWJsZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgZGVidWcoJ2NyZWF0ZVRhYmxlJywgY2xhc3NOYW1lLCBzY2hlbWEpO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgY29uc3QgcGF0dGVybnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5hc3NpZ24oe30sIHNjaGVtYS5maWVsZHMpO1xuICAgIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIGZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fZmFpbGVkX2xvZ2luX2NvdW50ID0geyB0eXBlOiAnTnVtYmVyJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fcGFzc3dvcmRfaGlzdG9yeSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICAgIH1cbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIGNvbnN0IHJlbGF0aW9ucyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKGZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgY29uc3QgcGFyc2VUeXBlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAvLyBTa2lwIHdoZW4gaXQncyBhIHJlbGF0aW9uXG4gICAgICAvLyBXZSdsbCBjcmVhdGUgdGhlIHRhYmxlcyBsYXRlclxuICAgICAgaWYgKHBhcnNlVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJlbGF0aW9ucy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICBwYXJzZVR5cGUuY29udGVudHMgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICB9XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHBhcnNlVHlwZSkpO1xuICAgICAgcGF0dGVybnNBcnJheS5wdXNoKGAkJHtpbmRleH06bmFtZSAkJHtpbmRleCArIDF9OnJhd2ApO1xuICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYFBSSU1BUlkgS0VZICgkJHtpbmRleH06bmFtZSlgKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ID0gaW5kZXggKyAyO1xuICAgIH0pO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQxOm5hbWUgKCR7cGF0dGVybnNBcnJheS5qb2luKCl9KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4udmFsdWVzQXJyYXldO1xuXG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgcmV0dXJuIGNvbm4udGFzaygnY3JlYXRlLXRhYmxlJywgYXN5bmMgdCA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBzZWxmLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKHQpO1xuICAgICAgICBhd2FpdCB0Lm5vbmUocXMsIHZhbHVlcyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogVGFibGUgYWxyZWFkeSBleGlzdHMsIG11c3QgaGF2ZSBiZWVuIGNyZWF0ZWQgYnkgYSBkaWZmZXJlbnQgcmVxdWVzdC4gSWdub3JlIHRoZSBlcnJvci5cbiAgICAgIH1cbiAgICAgIGF3YWl0IHQudHgoJ2NyZWF0ZS10YWJsZS10eCcsIHR4ID0+IHtcbiAgICAgICAgcmV0dXJuIHR4LmJhdGNoKFxuICAgICAgICAgIHJlbGF0aW9ucy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHJldHVybiB0eC5ub25lKFxuICAgICAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgc2NoZW1hVXBncmFkZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBkZWJ1Zygnc2NoZW1hVXBncmFkZScsIHsgY2xhc3NOYW1lLCBzY2hlbWEgfSk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgYXdhaXQgY29ubi50eCgnc2NoZW1hLXVwZ3JhZGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IGNvbHVtbnMgPSBhd2FpdCB0Lm1hcChcbiAgICAgICAgJ1NFTEVDVCBjb2x1bW5fbmFtZSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zIFdIRVJFIHRhYmxlX25hbWUgPSAkPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IGNsYXNzTmFtZSB9LFxuICAgICAgICBhID0+IGEuY29sdW1uX25hbWVcbiAgICAgICk7XG4gICAgICBjb25zdCBuZXdDb2x1bW5zID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGNvbHVtbnMuaW5kZXhPZihpdGVtKSA9PT0gLTEpXG4gICAgICAgIC5tYXAoZmllbGROYW1lID0+XG4gICAgICAgICAgc2VsZi5hZGRGaWVsZElmTm90RXhpc3RzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLFxuICAgICAgICAgICAgdFxuICAgICAgICAgIClcbiAgICAgICAgKTtcblxuICAgICAgYXdhaXQgdC5iYXRjaChuZXdDb2x1bW5zKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGFkZEZpZWxkSWZOb3RFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55LFxuICAgIGNvbm46IGFueVxuICApIHtcbiAgICAvLyBUT0RPOiBNdXN0IGJlIHJldmlzZWQgZm9yIGludmFsaWQgbG9naWMuLi5cbiAgICBkZWJ1ZygnYWRkRmllbGRJZk5vdEV4aXN0cycsIHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUgfSk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGF3YWl0IGNvbm4udHgoJ2FkZC1maWVsZC1pZi1ub3QtZXhpc3RzJywgYXN5bmMgdCA9PiB7XG4gICAgICBpZiAodHlwZS50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICAgJ0FMVEVSIFRBQkxFICQ8Y2xhc3NOYW1lOm5hbWU+IEFERCBDT0xVTU4gSUYgTk9UIEVYSVNUUyAkPGZpZWxkTmFtZTpuYW1lPiAkPHBvc3RncmVzVHlwZTpyYXc+JyxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgICAgIHBvc3RncmVzVHlwZTogcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUodHlwZSksXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gc2VsZi5jcmVhdGVDbGFzcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGZpZWxkczogeyBbZmllbGROYW1lXTogdHlwZSB9IH0sXG4gICAgICAgICAgICAgIHRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gQ29sdW1uIGFscmVhZHkgZXhpc3RzLCBjcmVhdGVkIGJ5IG90aGVyIHJlcXVlc3QuIENhcnJ5IG9uIHRvIHNlZSBpZiBpdCdzIHRoZSByaWdodCB0eXBlLlxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQ8am9pblRhYmxlOm5hbWU+IChcInJlbGF0ZWRJZFwiIHZhckNoYXIoMTIwKSwgXCJvd25pbmdJZFwiIHZhckNoYXIoMTIwKSwgUFJJTUFSWSBLRVkoXCJyZWxhdGVkSWRcIiwgXCJvd25pbmdJZFwiKSApJyxcbiAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdC5hbnkoXG4gICAgICAgICdTRUxFQ1QgXCJzY2hlbWFcIiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4gYW5kIChcInNjaGVtYVwiOjpqc29uLT5cXCdmaWVsZHNcXCctPiQ8ZmllbGROYW1lPikgaXMgbm90IG51bGwnLFxuICAgICAgICB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH1cbiAgICAgICk7XG5cbiAgICAgIGlmIChyZXN1bHRbMF0pIHtcbiAgICAgICAgdGhyb3cgJ0F0dGVtcHRlZCB0byBhZGQgYSBmaWVsZCB0aGF0IGFscmVhZHkgZXhpc3RzJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBge2ZpZWxkcywke2ZpZWxkTmFtZX19YDtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCI9anNvbmJfc2V0KFwic2NoZW1hXCIsICQ8cGF0aD4sICQ8dHlwZT4pICBXSEVSRSBcImNsYXNzTmFtZVwiPSQ8Y2xhc3NOYW1lPicsXG4gICAgICAgICAgeyBwYXRoLCB0eXBlLCBjbGFzc05hbWUgfVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgYXN5bmMgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBvcGVyYXRpb25zID0gW1xuICAgICAgeyBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTICQxOm5hbWVgLCB2YWx1ZXM6IFtjbGFzc05hbWVdIH0sXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgREVMRVRFIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzOiBbY2xhc3NOYW1lXSxcbiAgICAgIH0sXG4gICAgXTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KG9wZXJhdGlvbnMpKSlcbiAgICAgIC50aGVuKCgpID0+IGNsYXNzTmFtZS5pbmRleE9mKCdfSm9pbjonKSAhPSAwKTsgLy8gcmVzb2x2ZXMgd2l0aCBmYWxzZSB3aGVuIF9Kb2luIHRhYmxlXG4gIH1cblxuICAvLyBEZWxldGUgYWxsIGRhdGEga25vd24gdG8gdGhpcyBhZGFwdGVyLiBVc2VkIGZvciB0ZXN0aW5nLlxuICBhc3luYyBkZWxldGVBbGxDbGFzc2VzKCkge1xuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgIGNvbnN0IGhlbHBlcnMgPSB0aGlzLl9wZ3AuaGVscGVycztcbiAgICBkZWJ1ZygnZGVsZXRlQWxsQ2xhc3NlcycpO1xuXG4gICAgYXdhaXQgdGhpcy5fY2xpZW50XG4gICAgICAudGFzaygnZGVsZXRlLWFsbC1jbGFzc2VzJywgYXN5bmMgdCA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHQuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJyk7XG4gICAgICAgICAgY29uc3Qgam9pbnMgPSByZXN1bHRzLnJlZHVjZSgobGlzdDogQXJyYXk8c3RyaW5nPiwgc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBsaXN0LmNvbmNhdChqb2luVGFibGVzRm9yU2NoZW1hKHNjaGVtYS5zY2hlbWEpKTtcbiAgICAgICAgICB9LCBbXSk7XG4gICAgICAgICAgY29uc3QgY2xhc3NlcyA9IFtcbiAgICAgICAgICAgICdfU0NIRU1BJyxcbiAgICAgICAgICAgICdfUHVzaFN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlNjaGVkdWxlJyxcbiAgICAgICAgICAgICdfSG9va3MnLFxuICAgICAgICAgICAgJ19HbG9iYWxDb25maWcnLFxuICAgICAgICAgICAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgICAgICAgICAgICdfQXVkaWVuY2UnLFxuICAgICAgICAgICAgJ19JZGVtcG90ZW5jeScsXG4gICAgICAgICAgICAuLi5yZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LmNsYXNzTmFtZSksXG4gICAgICAgICAgICAuLi5qb2lucyxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0IHF1ZXJpZXMgPSBjbGFzc2VzLm1hcChjbGFzc05hbWUgPT4gKHtcbiAgICAgICAgICAgIHF1ZXJ5OiAnRFJPUCBUQUJMRSBJRiBFWElTVFMgJDxjbGFzc05hbWU6bmFtZT4nLFxuICAgICAgICAgICAgdmFsdWVzOiB7IGNsYXNzTmFtZSB9LFxuICAgICAgICAgIH0pKTtcbiAgICAgICAgICBhd2FpdCB0LnR4KHR4ID0+IHR4Lm5vbmUoaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gTm8gX1NDSEVNQSBjb2xsZWN0aW9uLiBEb24ndCBkZWxldGUgYW55dGhpbmcuXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGRlYnVnKGBkZWxldGVBbGxDbGFzc2VzIGRvbmUgaW4gJHtuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIG5vd31gKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBjb2x1bW4gYW5kIGFsbCB0aGUgZGF0YS4gRm9yIFJlbGF0aW9ucywgdGhlIF9Kb2luIGNvbGxlY3Rpb24gaXMgaGFuZGxlZFxuICAvLyBzcGVjaWFsbHksIHRoaXMgZnVuY3Rpb24gZG9lcyBub3QgZGVsZXRlIF9Kb2luIGNvbHVtbnMuIEl0IHNob3VsZCwgaG93ZXZlciwgaW5kaWNhdGVcbiAgLy8gdGhhdCB0aGUgcmVsYXRpb24gZmllbGRzIGRvZXMgbm90IGV4aXN0IGFueW1vcmUuIEluIG1vbmdvLCB0aGlzIG1lYW5zIHJlbW92aW5nIGl0IGZyb21cbiAgLy8gdGhlIF9TQ0hFTUEgY29sbGVjdGlvbi4gIFRoZXJlIHNob3VsZCBiZSBubyBhY3R1YWwgZGF0YSBpbiB0aGUgY29sbGVjdGlvbiB1bmRlciB0aGUgc2FtZSBuYW1lXG4gIC8vIGFzIHRoZSByZWxhdGlvbiBjb2x1bW4sIHNvIGl0J3MgZmluZSB0byBhdHRlbXB0IHRvIGRlbGV0ZSBpdC4gSWYgdGhlIGZpZWxkcyBsaXN0ZWQgdG8gYmVcbiAgLy8gZGVsZXRlZCBkbyBub3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gc2hvdWxkIHJldHVybiBzdWNjZXNzZnVsbHkgYW55d2F5cy4gQ2hlY2tpbmcgZm9yXG4gIC8vIGF0dGVtcHRzIHRvIGRlbGV0ZSBub24tZXhpc3RlbnQgZmllbGRzIGlzIHRoZSByZXNwb25zaWJpbGl0eSBvZiBQYXJzZSBTZXJ2ZXIuXG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBub3Qgb2JsaWdhdGVkIHRvIGRlbGV0ZSBmaWVsZHMgYXRvbWljYWxseS4gSXQgaXMgZ2l2ZW4gdGhlIGZpZWxkXG4gIC8vIG5hbWVzIGluIGEgbGlzdCBzbyB0aGF0IGRhdGFiYXNlcyB0aGF0IGFyZSBjYXBhYmxlIG9mIGRlbGV0aW5nIGZpZWxkcyBhdG9taWNhbGx5XG4gIC8vIG1heSBkbyBzby5cblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZS5cbiAgYXN5bmMgZGVsZXRlRmllbGRzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1ZygnZGVsZXRlRmllbGRzJywgY2xhc3NOYW1lLCBmaWVsZE5hbWVzKTtcbiAgICBmaWVsZE5hbWVzID0gZmllbGROYW1lcy5yZWR1Y2UoKGxpc3Q6IEFycmF5PHN0cmluZz4sIGZpZWxkTmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIGlmIChmaWVsZC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChmaWVsZE5hbWUpO1xuICAgICAgfVxuICAgICAgZGVsZXRlIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHJldHVybiBsaXN0O1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmZpZWxkTmFtZXNdO1xuICAgIGNvbnN0IGNvbHVtbnMgPSBmaWVsZE5hbWVzXG4gICAgICAubWFwKChuYW1lLCBpZHgpID0+IHtcbiAgICAgICAgcmV0dXJuIGAkJHtpZHggKyAyfTpuYW1lYDtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCBEUk9QIENPTFVNTicpO1xuXG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCdkZWxldGUtZmllbGRzJywgYXN5bmMgdCA9PiB7XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCIgPSAkPHNjaGVtYT4gV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgc2NoZW1hLCBjbGFzc05hbWUgfVxuICAgICAgKTtcbiAgICAgIGlmICh2YWx1ZXMubGVuZ3RoID4gMSkge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgYEFMVEVSIFRBQkxFICQxOm5hbWUgRFJPUCBDT0xVTU4gSUYgRVhJU1RTICR7Y29sdW1uc31gLFxuICAgICAgICAgIHZhbHVlc1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGFzeW5jIGdldEFsbENsYXNzZXMoKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC50YXNrKCdnZXQtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGF3YWl0IHNlbGYuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHModCk7XG4gICAgICByZXR1cm4gYXdhaXQgdC5tYXAoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInLCBudWxsLCByb3cgPT5cbiAgICAgICAgdG9QYXJzZVNjaGVtYSh7IGNsYXNzTmFtZTogcm93LmNsYXNzTmFtZSwgLi4ucm93LnNjaGVtYSB9KVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIHRoZSBzY2hlbWEgd2l0aCB0aGUgZ2l2ZW4gbmFtZSwgaW4gUGFyc2UgZm9ybWF0LiBJZlxuICAvLyB0aGlzIGFkYXB0ZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSBzY2hlbWEsIHJldHVybiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpdGhcbiAgLy8gdW5kZWZpbmVkIGFzIHRoZSByZWFzb24uXG4gIGFzeW5jIGdldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgZGVidWcoJ2dldENsYXNzJywgY2xhc3NOYW1lKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLnNjaGVtYTtcbiAgICAgIH0pXG4gICAgICAudGhlbih0b1BhcnNlU2NoZW1hKTtcbiAgfVxuXG4gIC8vIFRPRE86IHJlbW92ZSB0aGUgbW9uZ28gZm9ybWF0IGRlcGVuZGVuY3kgaW4gdGhlIHJldHVybiB2YWx1ZVxuICBhc3luYyBjcmVhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIG9iamVjdDogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdjcmVhdGVPYmplY3QnLCBjbGFzc05hbWUsIG9iamVjdCk7XG4gICAgbGV0IGNvbHVtbnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGdlb1BvaW50cyA9IHt9O1xuXG4gICAgb2JqZWN0ID0gaGFuZGxlRG90RmllbGRzKG9iamVjdCk7XG5cbiAgICB2YWxpZGF0ZUtleXMob2JqZWN0KTtcblxuICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHZhciBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ10gPSBvYmplY3RbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBmaWVsZE5hbWUgPSAnYXV0aERhdGEnO1xuICAgICAgfVxuXG4gICAgICBjb2x1bW5zQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19mYWlsZWRfbG9naW5fY291bnQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2hpc3RvcnknXG4gICAgICAgICkge1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcpIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzd2l0Y2ggKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlKSB7XG4gICAgICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5vYmplY3RJZCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KG9iamVjdFtmaWVsZE5hbWVdKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdPYmplY3QnOlxuICAgICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICAgIGNhc2UgJ051bWJlcic6XG4gICAgICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdGaWxlJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm5hbWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2x5Z29uJzoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChvYmplY3RbZmllbGROYW1lXS5jb29yZGluYXRlcyk7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICAgIC8vIHBvcCB0aGUgcG9pbnQgYW5kIHByb2Nlc3MgbGF0ZXJcbiAgICAgICAgICBnZW9Qb2ludHNbZmllbGROYW1lXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICAgIGNvbHVtbnNBcnJheS5wb3AoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBgVHlwZSAke3NjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlfSBub3Qgc3VwcG9ydGVkIHlldGA7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb2x1bW5zQXJyYXkgPSBjb2x1bW5zQXJyYXkuY29uY2F0KE9iamVjdC5rZXlzKGdlb1BvaW50cykpO1xuICAgIGNvbnN0IGluaXRpYWxWYWx1ZXMgPSB2YWx1ZXNBcnJheS5tYXAoKHZhbCwgaW5kZXgpID0+IHtcbiAgICAgIGxldCB0ZXJtaW5hdGlvbiA9ICcnO1xuICAgICAgY29uc3QgZmllbGROYW1lID0gY29sdW1uc0FycmF5W2luZGV4XTtcbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6OnRleHRbXSc7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSdcbiAgICAgICkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6Ompzb25iJztcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJCR7aW5kZXggKyAyICsgY29sdW1uc0FycmF5Lmxlbmd0aH0ke3Rlcm1pbmF0aW9ufWA7XG4gICAgfSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzSW5qZWN0cyA9IE9iamVjdC5rZXlzKGdlb1BvaW50cykubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGdlb1BvaW50c1trZXldO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZS5sb25naXR1ZGUsIHZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGNvbnN0IGwgPSB2YWx1ZXNBcnJheS5sZW5ndGggKyBjb2x1bW5zQXJyYXkubGVuZ3RoO1xuICAgICAgcmV0dXJuIGBQT0lOVCgkJHtsfSwgJCR7bCArIDF9KWA7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2x1bW5zUGF0dGVybiA9IGNvbHVtbnNBcnJheVxuICAgICAgLm1hcCgoY29sLCBpbmRleCkgPT4gYCQke2luZGV4ICsgMn06bmFtZWApXG4gICAgICAuam9pbigpO1xuICAgIGNvbnN0IHZhbHVlc1BhdHRlcm4gPSBpbml0aWFsVmFsdWVzLmNvbmNhdChnZW9Qb2ludHNJbmplY3RzKS5qb2luKCk7XG5cbiAgICBjb25zdCBxcyA9IGBJTlNFUlQgSU5UTyAkMTpuYW1lICgke2NvbHVtbnNQYXR0ZXJufSkgVkFMVUVTICgke3ZhbHVlc1BhdHRlcm59KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uY29sdW1uc0FycmF5LCAuLi52YWx1ZXNBcnJheV07XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50XG4gICAgICA6IHRoaXMuX2NsaWVudFxuICAgIClcbiAgICAgIC5ub25lKHFzLCB2YWx1ZXMpXG4gICAgICAudGhlbigoKSA9PiAoeyBvcHM6IFtvYmplY3RdIH0pKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvcikge1xuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgZXJyLnVuZGVybHlpbmdFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGlmIChlcnJvci5jb25zdHJhaW50KSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gZXJyb3IuY29uc3RyYWludC5tYXRjaCgvdW5pcXVlXyhbYS16QS1aXSspLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBlcnJvciA9IGVycjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGFzeW5jIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdkZWxldGVPYmplY3RzQnlRdWVyeScsIGNsYXNzTmFtZSwgcXVlcnkpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IGluZGV4ID0gMjtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcbiAgICBpZiAoT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgd2hlcmUucGF0dGVybiA9ICdUUlVFJztcbiAgICB9XG4gICAgY29uc3QgcXMgPSBgV0lUSCBkZWxldGVkIEFTIChERUxFVEUgRlJPTSAkMTpuYW1lIFdIRVJFICR7d2hlcmUucGF0dGVybn0gUkVUVVJOSU5HICopIFNFTEVDVCBjb3VudCgqKSBGUk9NIGRlbGV0ZWRgO1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udFxuICAgICAgOiB0aGlzLl9jbGllbnRcbiAgICApXG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4gK2EuY291bnQpXG4gICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogRG9uJ3QgZGVsZXRlIGFueXRoaW5nIGlmIGRvZXNuJ3QgZXhpc3RcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGFzeW5jIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBkZWJ1ZygnZmluZE9uZUFuZFVwZGF0ZScsIGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIHVwZGF0ZSxcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgKS50aGVuKHZhbCA9PiB2YWxbMF0pO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgYXN5bmMgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxbYW55XT4ge1xuICAgIGRlYnVnKCd1cGRhdGVPYmplY3RzQnlRdWVyeScsIGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgY29uc3QgdXBkYXRlUGF0dGVybnMgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcblxuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0geyAuLi51cGRhdGUgfTtcblxuICAgIC8vIFNldCBmbGFnIGZvciBkb3Qgbm90YXRpb24gZmllbGRzXG4gICAgY29uc3QgZG90Tm90YXRpb25PcHRpb25zID0ge307XG4gICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaXJzdF0gPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0gPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB1cGRhdGUgPSBoYW5kbGVEb3RGaWVsZHModXBkYXRlKTtcbiAgICAvLyBSZXNvbHZlIGF1dGhEYXRhIGZpcnN0LFxuICAgIC8vIFNvIHdlIGRvbid0IGVuZCB1cCB3aXRoIG11bHRpcGxlIGtleSB1cGRhdGVzXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXSA9IHVwZGF0ZVsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgZmllbGRWYWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgLy8gRHJvcCBhbnkgdW5kZWZpbmVkIHZhbHVlcy5cbiAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT0gJ2F1dGhEYXRhJykge1xuICAgICAgICAvLyBUaGlzIHJlY3Vyc2l2ZWx5IHNldHMgdGhlIGpzb25fb2JqZWN0XG4gICAgICAgIC8vIE9ubHkgMSBsZXZlbCBkZWVwXG4gICAgICAgIGNvbnN0IGdlbmVyYXRlID0gKGpzb25iOiBzdHJpbmcsIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGBqc29uX29iamVjdF9zZXRfa2V5KENPQUxFU0NFKCR7anNvbmJ9LCAne30nOjpqc29uYiksICR7a2V5fSwgJHt2YWx1ZX0pOjpqc29uYmA7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGxhc3RLZXkgPSBgJCR7aW5kZXh9Om5hbWVgO1xuICAgICAgICBjb25zdCBmaWVsZE5hbWVJbmRleCA9IGluZGV4O1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBjb25zdCB1cGRhdGUgPSBPYmplY3Qua2V5cyhmaWVsZFZhbHVlKS5yZWR1Y2UoXG4gICAgICAgICAgKGxhc3RLZXk6IHN0cmluZywga2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHN0ciA9IGdlbmVyYXRlKFxuICAgICAgICAgICAgICBsYXN0S2V5LFxuICAgICAgICAgICAgICBgJCR7aW5kZXh9Ojp0ZXh0YCxcbiAgICAgICAgICAgICAgYCQke2luZGV4ICsgMX06Ompzb25iYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChrZXksIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBsYXN0S2V5XG4gICAgICAgICk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2ZpZWxkTmFtZUluZGV4fTpuYW1lID0gJHt1cGRhdGV9YCk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0luY3JlbWVudCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgMCkgKyAkJHtpbmRleCArIDF9YFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuYW1vdW50KTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZChDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBudWxsKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnUmVtb3ZlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X3JlbW92ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkVW5pcXVlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZF91bmlxdWUoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDFcbiAgICAgICAgICB9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgLy9UT0RPOiBzdG9wIHNwZWNpYWwgY2FzaW5nIHRoaXMuIEl0IHNob3VsZCBjaGVjayBmb3IgX190eXBlID09PSAnRGF0ZScgYW5kIHVzZSAuaXNvXG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIC8vIG5vb3BcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ09iamVjdCdcbiAgICAgICkge1xuICAgICAgICAvLyBHYXRoZXIga2V5cyB0byBpbmNyZW1lbnRcbiAgICAgICAgY29uc3Qga2V5c1RvSW5jcmVtZW50ID0gT2JqZWN0LmtleXMob3JpZ2luYWxVcGRhdGUpXG4gICAgICAgICAgLmZpbHRlcihrID0+IHtcbiAgICAgICAgICAgIC8vIGNob29zZSB0b3AgbGV2ZWwgZmllbGRzIHRoYXQgaGF2ZSBhIGRlbGV0ZSBvcGVyYXRpb24gc2V0XG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgT2JqZWN0LmtleXMgaXMgaXRlcmF0aW5nIG92ZXIgdGhlICoqb3JpZ2luYWwqKiB1cGRhdGUgb2JqZWN0XG4gICAgICAgICAgICAvLyBhbmQgdGhhdCBzb21lIG9mIHRoZSBrZXlzIG9mIHRoZSBvcmlnaW5hbCB1cGRhdGUgY291bGQgYmUgbnVsbCBvciB1bmRlZmluZWQ6XG4gICAgICAgICAgICAvLyAoU2VlIHRoZSBhYm92ZSBjaGVjayBgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIGZpZWxkVmFsdWUgPT0gXCJ1bmRlZmluZWRcIilgKVxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcmlnaW5hbFVwZGF0ZVtrXTtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHZhbHVlICYmXG4gICAgICAgICAgICAgIHZhbHVlLl9fb3AgPT09ICdJbmNyZW1lbnQnICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpWzBdID09PSBmaWVsZE5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGsgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBsZXQgaW5jcmVtZW50UGF0dGVybnMgPSAnJztcbiAgICAgICAgaWYgKGtleXNUb0luY3JlbWVudC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaW5jcmVtZW50UGF0dGVybnMgPVxuICAgICAgICAgICAgJyB8fCAnICtcbiAgICAgICAgICAgIGtleXNUb0luY3JlbWVudFxuICAgICAgICAgICAgICAubWFwKGMgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFtb3VudCA9IGZpZWxkVmFsdWVbY10uYW1vdW50O1xuICAgICAgICAgICAgICAgIHJldHVybiBgQ09OQ0FUKCd7XCIke2N9XCI6JywgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUtPj4nJHtjfScsJzAnKTo6aW50ICsgJHthbW91bnR9LCAnfScpOjpqc29uYmA7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5qb2luKCcgfHwgJyk7XG4gICAgICAgICAgLy8gU3RyaXAgdGhlIGtleXNcbiAgICAgICAgICBrZXlzVG9JbmNyZW1lbnQuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgICAgZGVsZXRlIGZpZWxkVmFsdWVba2V5XTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGtleXNUb0RlbGV0ZTogQXJyYXk8c3RyaW5nPiA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldC5cbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnRGVsZXRlJyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgY29uc3QgZGVsZXRlUGF0dGVybnMgPSBrZXlzVG9EZWxldGUucmVkdWNlKFxuICAgICAgICAgIChwOiBzdHJpbmcsIGM6IHN0cmluZywgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcCArIGAgLSAnJCR7aW5kZXggKyAxICsgaX06dmFsdWUnYDtcbiAgICAgICAgICB9LFxuICAgICAgICAgICcnXG4gICAgICAgICk7XG4gICAgICAgIC8vIE92ZXJyaWRlIE9iamVjdFxuICAgICAgICBsZXQgdXBkYXRlT2JqZWN0ID0gXCIne30nOjpqc29uYlwiO1xuXG4gICAgICAgIGlmIChkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSkge1xuICAgICAgICAgIC8vIE1lcmdlIE9iamVjdFxuICAgICAgICAgIHVwZGF0ZU9iamVjdCA9IGBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ3t9Jzo6anNvbmIpYDtcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9ICgke3VwZGF0ZU9iamVjdH0gJHtkZWxldGVQYXR0ZXJuc30gJHtpbmNyZW1lbnRQYXR0ZXJuc30gfHwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDEgKyBrZXlzVG9EZWxldGUubGVuZ3RoXG4gICAgICAgICAgfTo6anNvbmIgKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCAuLi5rZXlzVG9EZWxldGUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMiArIGtleXNUb0RlbGV0ZS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUpICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5J1xuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSk7XG4gICAgICAgIGlmIChleHBlY3RlZFR5cGUgPT09ICd0ZXh0W10nKSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojp0ZXh0W11gKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdOb3Qgc3VwcG9ydGVkIHVwZGF0ZScsIGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB1cGRhdGUgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX0geWV0YFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlQ2xhdXNlID1cbiAgICAgIHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHFzID0gYFVQREFURSAkMTpuYW1lIFNFVCAke3VwZGF0ZVBhdHRlcm5zLmpvaW4oKX0gJHt3aGVyZUNsYXVzZX0gUkVUVVJOSU5HICpgO1xuICAgIGRlYnVnKCd1cGRhdGU6ICcsIHFzLCB2YWx1ZXMpO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udFxuICAgICAgOiB0aGlzLl9jbGllbnRcbiAgICApLmFueShxcywgdmFsdWVzKTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gSG9wZWZ1bGx5LCB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGlzLiBJdCdzIG9ubHkgdXNlZCBmb3IgY29uZmlnIGFuZCBob29rcy5cbiAgdXBzZXJ0T25lT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCd1cHNlcnRPbmVPYmplY3QnLCB7IGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSB9KTtcbiAgICBjb25zdCBjcmVhdGVWYWx1ZSA9IE9iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCB1cGRhdGUpO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZU9iamVjdChcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHNjaGVtYSxcbiAgICAgIGNyZWF0ZVZhbHVlLFxuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICApLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIC8vIGlnbm9yZSBkdXBsaWNhdGUgdmFsdWUgZXJyb3JzIGFzIGl0J3MgdXBzZXJ0XG4gICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBzY2hlbWEsXG4gICAgICAgIHF1ZXJ5LFxuICAgICAgICB1cGRhdGUsXG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB7IHNraXAsIGxpbWl0LCBzb3J0LCBrZXlzLCBjYXNlSW5zZW5zaXRpdmUsIGV4cGxhaW4gfTogUXVlcnlPcHRpb25zXG4gICkge1xuICAgIGRlYnVnKCdmaW5kJywgY2xhc3NOYW1lLCBxdWVyeSwge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgc29ydCxcbiAgICAgIGtleXMsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICBleHBsYWluLFxuICAgIH0pO1xuICAgIGNvbnN0IGhhc0xpbWl0ID0gbGltaXQgIT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBoYXNTa2lwID0gc2tpcCAhPT0gdW5kZWZpbmVkO1xuICAgIGxldCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID1cbiAgICAgIHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IGxpbWl0UGF0dGVybiA9IGhhc0xpbWl0ID8gYExJTUlUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzTGltaXQpIHtcbiAgICAgIHZhbHVlcy5wdXNoKGxpbWl0KTtcbiAgICB9XG4gICAgY29uc3Qgc2tpcFBhdHRlcm4gPSBoYXNTa2lwID8gYE9GRlNFVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc1NraXApIHtcbiAgICAgIHZhbHVlcy5wdXNoKHNraXApO1xuICAgIH1cblxuICAgIGxldCBzb3J0UGF0dGVybiA9ICcnO1xuICAgIGlmIChzb3J0KSB7XG4gICAgICBjb25zdCBzb3J0Q29weTogYW55ID0gc29ydDtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBPYmplY3Qua2V5cyhzb3J0KVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgY29uc3QgdHJhbnNmb3JtS2V5ID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoa2V5KS5qb2luKCctPicpO1xuICAgICAgICAgIC8vIFVzaW5nICRpZHggcGF0dGVybiBnaXZlczogIG5vbi1pbnRlZ2VyIGNvbnN0YW50IGluIE9SREVSIEJZXG4gICAgICAgICAgaWYgKHNvcnRDb3B5W2tleV0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IEFTQ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IERFU0NgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgc29ydFBhdHRlcm4gPVxuICAgICAgICBzb3J0ICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LmtleXMoc29ydCkubGVuZ3RoID4gMFxuICAgICAgICAgID8gYE9SREVSIEJZICR7c29ydGluZ31gXG4gICAgICAgICAgOiAnJztcbiAgICB9XG4gICAgaWYgKHdoZXJlLnNvcnRzICYmIE9iamVjdC5rZXlzKCh3aGVyZS5zb3J0czogYW55KSkubGVuZ3RoID4gMCkge1xuICAgICAgc29ydFBhdHRlcm4gPSBgT1JERVIgQlkgJHt3aGVyZS5zb3J0cy5qb2luKCl9YDtcbiAgICB9XG5cbiAgICBsZXQgY29sdW1ucyA9ICcqJztcbiAgICBpZiAoa2V5cykge1xuICAgICAgLy8gRXhjbHVkZSBlbXB0eSBrZXlzXG4gICAgICAvLyBSZXBsYWNlIEFDTCBieSBpdCdzIGtleXNcbiAgICAgIGtleXMgPSBrZXlzLnJlZHVjZSgobWVtbywga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdBQ0wnKSB7XG4gICAgICAgICAgbWVtby5wdXNoKCdfcnBlcm0nKTtcbiAgICAgICAgICBtZW1vLnB1c2goJ193cGVybScpO1xuICAgICAgICB9IGVsc2UgaWYgKGtleS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgbWVtby5wdXNoKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LCBbXSk7XG4gICAgICBjb2x1bW5zID0ga2V5c1xuICAgICAgICAubWFwKChrZXksIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGtleSA9PT0gJyRzY29yZScpIHtcbiAgICAgICAgICAgIHJldHVybiBgdHNfcmFua19jZCh0b190c3ZlY3RvcigkJHsyfSwgJCR7M306bmFtZSksIHRvX3RzcXVlcnkoJCR7NH0sICQkezV9KSwgMzIpIGFzIHNjb3JlYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAkJHtpbmRleCArIHZhbHVlcy5sZW5ndGggKyAxfTpuYW1lYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHZhbHVlcyA9IHZhbHVlcy5jb25jYXQoa2V5cyk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufSAke3NraXBQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluXG4gICAgICA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KVxuICAgICAgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFF1ZXJ5IG9uIG5vbiBleGlzdGluZyB0YWJsZSwgZG9uJ3QgY3Jhc2hcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+XG4gICAgICAgICAgdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSlcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydHMgZnJvbSBhIHBvc3RncmVzLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4gIC8vIERvZXMgbm90IHN0cmlwIG91dCBhbnl0aGluZyBiYXNlZCBvbiBhIGxhY2sgb2YgYXV0aGVudGljYXRpb24uXG4gIHBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHNjaGVtYTogYW55KSB7XG4gICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicgJiYgb2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgbGF0aXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLnksXG4gICAgICAgICAgbG9uZ2l0dWRlOiBvYmplY3RbZmllbGROYW1lXS54LFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgbGV0IGNvb3JkcyA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBjb29yZHMgPSBjb29yZHMuc3Vic3RyKDIsIGNvb3Jkcy5sZW5ndGggLSA0KS5zcGxpdCgnKSwoJyk7XG4gICAgICAgIGNvb3JkcyA9IGNvb3Jkcy5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMV0pLFxuICAgICAgICAgICAgcGFyc2VGbG9hdChwb2ludC5zcGxpdCgnLCcpWzBdKSxcbiAgICAgICAgICBdO1xuICAgICAgICB9KTtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICAgICAgY29vcmRpbmF0ZXM6IGNvb3JkcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgICAgIG5hbWU6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIC8vVE9ETzogcmVtb3ZlIHRoaXMgcmVsaWFuY2Ugb24gdGhlIG1vbmdvIGZvcm1hdC4gREIgYWRhcHRlciBzaG91bGRuJ3Qga25vdyB0aGVyZSBpcyBhIGRpZmZlcmVuY2UgYmV0d2VlbiBjcmVhdGVkIGF0IGFuZCBhbnkgb3RoZXIgZGF0ZSBmaWVsZC5cbiAgICBpZiAob2JqZWN0LmNyZWF0ZWRBdCkge1xuICAgICAgb2JqZWN0LmNyZWF0ZWRBdCA9IG9iamVjdC5jcmVhdGVkQXQudG9JU09TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC51cGRhdGVkQXQpIHtcbiAgICAgIG9iamVjdC51cGRhdGVkQXQgPSBvYmplY3QudXBkYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QuZXhwaXJlc0F0KSB7XG4gICAgICBvYmplY3QuZXhwaXJlc0F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuZXhwaXJlc0F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0KSB7XG4gICAgICBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICAgIGlzbzogb2JqZWN0W2ZpZWxkTmFtZV0udG9JU09TdHJpbmcoKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBhc3luYyBlbnN1cmVVbmlxdWVuZXNzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXVxuICApIHtcbiAgICBjb25zdCBjb25zdHJhaW50TmFtZSA9IGAke2NsYXNzTmFtZX1fdW5pcXVlXyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgY29uc3RyYWludFBhdHRlcm5zID0gZmllbGROYW1lcy5tYXAoXG4gICAgICAoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWBcbiAgICApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBVTklRVUUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMjpuYW1lIE9OICQxOm5hbWUoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5ub25lKHFzLCBbY2xhc3NOYW1lLCBjb25zdHJhaW50TmFtZSwgLi4uZmllbGROYW1lc10pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmXG4gICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGNvbnN0cmFpbnROYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgY291bnQuXG4gIGFzeW5jIGNvdW50KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHJlYWRQcmVmZXJlbmNlPzogc3RyaW5nLFxuICAgIGVzdGltYXRlPzogYm9vbGVhbiA9IHRydWVcbiAgKSB7XG4gICAgZGVidWcoJ2NvdW50JywgY2xhc3NOYW1lLCBxdWVyeSwgcmVhZFByZWZlcmVuY2UsIGVzdGltYXRlKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9XG4gICAgICB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBsZXQgcXMgPSAnJztcblxuICAgIGlmICh3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgfHwgIWVzdGltYXRlKSB7XG4gICAgICBxcyA9IGBTRUxFQ1QgY291bnQoKikgRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHFzID1cbiAgICAgICAgJ1NFTEVDVCByZWx0dXBsZXMgQVMgYXBwcm94aW1hdGVfcm93X2NvdW50IEZST00gcGdfY2xhc3MgV0hFUkUgcmVsbmFtZSA9ICQxJztcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4ge1xuICAgICAgICBpZiAoYS5hcHByb3hpbWF0ZV9yb3dfY291bnQgIT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiArYS5hcHByb3hpbWF0ZV9yb3dfY291bnQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICthLmNvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBkaXN0aW5jdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICBmaWVsZE5hbWU6IHN0cmluZ1xuICApIHtcbiAgICBkZWJ1ZygnZGlzdGluY3QnLCBjbGFzc05hbWUsIHF1ZXJ5KTtcbiAgICBsZXQgZmllbGQgPSBmaWVsZE5hbWU7XG4gICAgbGV0IGNvbHVtbiA9IGZpZWxkTmFtZTtcbiAgICBjb25zdCBpc05lc3RlZCA9IGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIGZpZWxkID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgY29sdW1uID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgfVxuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGlzUG9pbnRlckZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJztcbiAgICBjb25zdCB2YWx1ZXMgPSBbZmllbGQsIGNvbHVtbiwgY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogNCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9XG4gICAgICB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCB0cmFuc2Zvcm1lciA9IGlzQXJyYXlGaWVsZCA/ICdqc29uYl9hcnJheV9lbGVtZW50cycgOiAnT04nO1xuICAgIGxldCBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6bmFtZSkgJDI6bmFtZSBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpyYXcpICQyOnJhdyBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yKSB7XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoIWlzTmVzdGVkKSB7XG4gICAgICAgICAgcmVzdWx0cyA9IHJlc3VsdHMuZmlsdGVyKG9iamVjdCA9PiBvYmplY3RbZmllbGRdICE9PSBudWxsKTtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgIGlmICghaXNQb2ludGVyRmllbGQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdFtmaWVsZF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGRdLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjaGlsZCA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzFdO1xuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IG9iamVjdFtjb2x1bW5dW2NoaWxkXSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PlxuICAgICAgICByZXN1bHRzLm1hcChvYmplY3QgPT5cbiAgICAgICAgICB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKVxuICAgICAgICApXG4gICAgICApO1xuICB9XG5cbiAgYXN5bmMgYWdncmVnYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogYW55LFxuICAgIHBpcGVsaW5lOiBhbnksXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgaGludDogP21peGVkLFxuICAgIGV4cGxhaW4/OiBib29sZWFuXG4gICkge1xuICAgIGRlYnVnKCdhZ2dyZWdhdGUnLCBjbGFzc05hbWUsIHBpcGVsaW5lLCByZWFkUHJlZmVyZW5jZSwgaGludCwgZXhwbGFpbik7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4OiBudW1iZXIgPSAyO1xuICAgIGxldCBjb2x1bW5zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBjb3VudEZpZWxkID0gbnVsbDtcbiAgICBsZXQgZ3JvdXBWYWx1ZXMgPSBudWxsO1xuICAgIGxldCB3aGVyZVBhdHRlcm4gPSAnJztcbiAgICBsZXQgbGltaXRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNraXBQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IGdyb3VwUGF0dGVybiA9ICcnO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGlwZWxpbmUubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHN0YWdlID0gcGlwZWxpbmVbaV07XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kZ3JvdXBbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJyAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlICE9PSAnJykge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyBcIm9iamVjdElkXCJgKTtcbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBmaWVsZCA9PT0gJ19pZCcgJiZcbiAgICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgIE9iamVjdC5rZXlzKHZhbHVlKS5sZW5ndGggIT09IDBcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIGdyb3VwVmFsdWVzID0gdmFsdWU7XG4gICAgICAgICAgICBjb25zdCBncm91cEJ5RmllbGRzID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGFsaWFzIGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWVbYWxpYXNdID09PSAnc3RyaW5nJyAmJiB2YWx1ZVthbGlhc10pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc10pO1xuICAgICAgICAgICAgICAgIGlmICghZ3JvdXBCeUZpZWxkcy5pbmNsdWRlcyhgXCIke3NvdXJjZX1cImApKSB7XG4gICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goc291cmNlLCBhbGlhcyk7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9wZXJhdGlvbiA9IE9iamVjdC5rZXlzKHZhbHVlW2FsaWFzXSlbMF07XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gdHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWVbYWxpYXNdW29wZXJhdGlvbl0pO1xuICAgICAgICAgICAgICAgIGlmIChtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXSkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFncm91cEJ5RmllbGRzLmluY2x1ZGVzKGBcIiR7c291cmNlfVwiYCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXBCeUZpZWxkcy5wdXNoKGBcIiR7c291cmNlfVwiYCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goXG4gICAgICAgICAgICAgICAgICAgIGBFWFRSQUNUKCR7XG4gICAgICAgICAgICAgICAgICAgICAgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl1cbiAgICAgICAgICAgICAgICAgICAgfSBGUk9NICQke2luZGV4fTpuYW1lIEFUIFRJTUUgWk9ORSAnVVRDJykgQVMgJCR7XG4gICAgICAgICAgICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgICAgICAgICAgIH06bmFtZWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9OnJhd2A7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChncm91cEJ5RmllbGRzLmpvaW4oKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuJHN1bSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlLiRzdW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBTVU0oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRzdW0pLCBmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb3VudEZpZWxkID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBDT1VOVCgqKSBBUyAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1heCkge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1BWCgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtYXgpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1pbikge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1JTigkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtaW4pLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJGF2Zykge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYEFWRygkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRhdmcpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2x1bW5zLnB1c2goJyonKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICBpZiAoY29sdW1ucy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgY29sdW1ucyA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRwcm9qZWN0W2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IDEgfHwgdmFsdWUgPT09IHRydWUpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5zID0gW107XG4gICAgICAgIGNvbnN0IG9yT3JBbmQgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoXG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLFxuICAgICAgICAgICckb3InXG4gICAgICAgIClcbiAgICAgICAgICA/ICcgT1IgJ1xuICAgICAgICAgIDogJyBBTkQgJztcblxuICAgICAgICBpZiAoc3RhZ2UuJG1hdGNoLiRvcikge1xuICAgICAgICAgIGNvbnN0IGNvbGxhcHNlID0ge307XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLiRvci5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZWxlbWVudCkge1xuICAgICAgICAgICAgICBjb2xsYXBzZVtrZXldID0gZWxlbWVudFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHN0YWdlLiRtYXRjaCA9IGNvbGxhcHNlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kbWF0Y2hbZmllbGRdO1xuICAgICAgICAgIGNvbnN0IG1hdGNoUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgICAgICAgIGlmICh2YWx1ZVtjbXBdKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICAgICAgICBtYXRjaFBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgICAgYCQke2luZGV4fTpuYW1lICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCArIDF9YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlW2NtcF0pKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAobWF0Y2hQYXR0ZXJucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJHttYXRjaFBhdHRlcm5zLmpvaW4oJyBBTkQgJyl9KWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJlxuICAgICAgICAgICAgbWF0Y2hQYXR0ZXJucy5sZW5ndGggPT09IDBcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQsIHZhbHVlKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHdoZXJlUGF0dGVybiA9XG4gICAgICAgICAgcGF0dGVybnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke3BhdHRlcm5zLmpvaW4oYCAke29yT3JBbmR9IGApfWAgOiAnJztcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbGltaXQpIHtcbiAgICAgICAgbGltaXRQYXR0ZXJuID0gYExJTUlUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRsaW1pdCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNraXApIHtcbiAgICAgICAgc2tpcFBhdHRlcm4gPSBgT0ZGU0VUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRza2lwKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc29ydCkge1xuICAgICAgICBjb25zdCBzb3J0ID0gc3RhZ2UuJHNvcnQ7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzb3J0KTtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGtleXNcbiAgICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1lciA9IHNvcnRba2V5XSA9PT0gMSA/ICdBU0MnIDogJ0RFU0MnO1xuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSBgJCR7aW5kZXh9Om5hbWUgJHt0cmFuc2Zvcm1lcn1gO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIHJldHVybiBvcmRlcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5qb2luKCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKC4uLmtleXMpO1xuICAgICAgICBzb3J0UGF0dGVybiA9XG4gICAgICAgICAgc29ydCAhPT0gdW5kZWZpbmVkICYmIHNvcnRpbmcubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChncm91cFBhdHRlcm4pIHtcbiAgICAgIGNvbHVtbnMuZm9yRWFjaCgoZSwgaSwgYSkgPT4ge1xuICAgICAgICBpZiAoZSAmJiBlLnRyaW0oKSA9PT0gJyonKSB7XG4gICAgICAgICAgYVtpXSA9ICcnO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnNcbiAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgIC5qb2luKCl9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtza2lwUGF0dGVybn0gJHtncm91cFBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluXG4gICAgICA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KVxuICAgICAgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQuYW55KHFzLCB2YWx1ZXMpLnRoZW4oYSA9PiB7XG4gICAgICBpZiAoZXhwbGFpbikge1xuICAgICAgICByZXR1cm4gYTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhLm1hcChvYmplY3QgPT5cbiAgICAgICAgdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSlcbiAgICAgICk7XG4gICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdWx0LCAnb2JqZWN0SWQnKSkge1xuICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGdyb3VwVmFsdWVzKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0ge307XG4gICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZFtrZXldID0gcmVzdWx0W2tleV07XG4gICAgICAgICAgICBkZWxldGUgcmVzdWx0W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjb3VudEZpZWxkKSB7XG4gICAgICAgICAgcmVzdWx0W2NvdW50RmllbGRdID0gcGFyc2VJbnQocmVzdWx0W2NvdW50RmllbGRdLCAxMCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBwZXJmb3JtSW5pdGlhbGl6YXRpb24oeyBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIH06IGFueSkge1xuICAgIC8vIFRPRE86IFRoaXMgbWV0aG9kIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB0byBtYWtlIHByb3BlciB1c2Ugb2YgY29ubmVjdGlvbnMgKEB2aXRhbHktdClcbiAgICBkZWJ1ZygncGVyZm9ybUluaXRpYWxpemF0aW9uJyk7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzLm1hcChzY2hlbWEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlVGFibGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKVxuICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIHx8XG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5zY2hlbWFVcGdyYWRlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSkpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsaWVudC50eCgncGVyZm9ybS1pbml0aWFsaXphdGlvbicsIHQgPT4ge1xuICAgICAgICAgIHJldHVybiB0LmJhdGNoKFtcbiAgICAgICAgICAgIHQubm9uZShzcWwubWlzYy5qc29uT2JqZWN0U2V0S2V5cyksXG4gICAgICAgICAgICB0Lm5vbmUoc3FsLmFycmF5LmFkZCksXG4gICAgICAgICAgICB0Lm5vbmUoc3FsLmFycmF5LmFkZFVuaXF1ZSksXG4gICAgICAgICAgICB0Lm5vbmUoc3FsLmFycmF5LnJlbW92ZSksXG4gICAgICAgICAgICB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zQWxsKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuY29udGFpbnNBbGxSZWdleCksXG4gICAgICAgICAgICB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zKSxcbiAgICAgICAgICBdKTtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgIGRlYnVnKGBpbml0aWFsaXphdGlvbkRvbmUgaW4gJHtkYXRhLmR1cmF0aW9ufWApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUluZGV4ZXMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgaW5kZXhlczogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PlxuICAgICAgdC5iYXRjaChcbiAgICAgICAgaW5kZXhlcy5tYXAoaSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQubm9uZSgnQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgkMzpuYW1lKScsIFtcbiAgICAgICAgICAgIGkubmFtZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGkua2V5LFxuICAgICAgICAgIF0pO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzSWZOZWVkZWQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgKFxuICAgICAgY29ubiB8fCB0aGlzLl9jbGllbnRcbiAgICApLm5vbmUoJ0NSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLCBbXG4gICAgICBmaWVsZE5hbWUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0eXBlLFxuICAgIF0pO1xuICB9XG5cbiAgYXN5bmMgZHJvcEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSwgY29ubjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcXVlcmllcyA9IGluZGV4ZXMubWFwKGkgPT4gKHtcbiAgICAgIHF1ZXJ5OiAnRFJPUCBJTkRFWCAkMTpuYW1lJyxcbiAgICAgIHZhbHVlczogaSxcbiAgICB9KSk7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+XG4gICAgICB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKVxuICAgICk7XG4gIH1cblxuICBhc3luYyBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcXMgPSAnU0VMRUNUICogRlJPTSBwZ19pbmRleGVzIFdIRVJFIHRhYmxlbmFtZSA9ICR7Y2xhc3NOYW1lfSc7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHsgY2xhc3NOYW1lIH0pO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gVXNlZCBmb3IgdGVzdGluZyBwdXJwb3Nlc1xuICBhc3luYyB1cGRhdGVFc3RpbWF0ZWRDb3VudChjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZSgnQU5BTFlaRSAkMTpuYW1lJywgW2NsYXNzTmFtZV0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBjb25zdCB0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHt9O1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0ID0gdGhpcy5fY2xpZW50LnR4KHQgPT4ge1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50ID0gdDtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICB9KTtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2ggPSBbXTtcbiAgICAgICAgcmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZShcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpXG4gICAgKTtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0O1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0LmNhdGNoKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChQcm9taXNlLnJlamVjdCgpKTtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKFxuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24udC5iYXRjaCh0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaClcbiAgICApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBhc3luYyBlbnN1cmVJbmRleChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgZmllbGROYW1lczogc3RyaW5nW10sXG4gICAgaW5kZXhOYW1lOiA/c3RyaW5nLFxuICAgIGNhc2VJbnNlbnNpdGl2ZTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIG9wdGlvbnM/OiBPYmplY3QgPSB7fVxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBkZWZhdWx0SW5kZXhOYW1lID0gYHBhcnNlX2RlZmF1bHRfJHtmaWVsZE5hbWVzLnNvcnQoKS5qb2luKCdfJyl9YDtcbiAgICBjb25zdCBpbmRleE5hbWVPcHRpb25zOiBPYmplY3QgPVxuICAgICAgaW5kZXhOYW1lICE9IG51bGwgPyB7IG5hbWU6IGluZGV4TmFtZSB9IDogeyBuYW1lOiBkZWZhdWx0SW5kZXhOYW1lIH07XG4gICAgY29uc3QgY29uc3RyYWludFBhdHRlcm5zID0gY2FzZUluc2Vuc2l0aXZlXG4gICAgICA/IGZpZWxkTmFtZXMubWFwKFxuICAgICAgICAoZmllbGROYW1lLCBpbmRleCkgPT4gYGxvd2VyKCQke2luZGV4ICsgM306bmFtZSkgdmFyY2hhcl9wYXR0ZXJuX29wc2BcbiAgICAgIClcbiAgICAgIDogZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSwgaW5kZXgpID0+IGAkJHtpbmRleCArIDN9Om5hbWVgKTtcbiAgICBjb25zdCBxcyA9IGBDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCR7Y29uc3RyYWludFBhdHRlcm5zLmpvaW4oKX0pYDtcbiAgICBhd2FpdCBjb25uXG4gICAgICAubm9uZShxcywgW2luZGV4TmFtZU9wdGlvbnMubmFtZSwgY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGluZGV4TmFtZU9wdGlvbnMubmFtZSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGluZGV4TmFtZU9wdGlvbnMubmFtZSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gQ2FzdCB0aGUgZXJyb3IgaW50byB0aGUgcHJvcGVyIHBhcnNlIGVycm9yXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29udmVydFBvbHlnb25Ub1NRTChwb2x5Z29uKSB7XG4gIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgUG9seWdvbiBtdXN0IGhhdmUgYXQgbGVhc3QgMyB2YWx1ZXNgXG4gICAgKTtcbiAgfVxuICBpZiAoXG4gICAgcG9seWdvblswXVswXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzBdIHx8XG4gICAgcG9seWdvblswXVsxXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzFdXG4gICkge1xuICAgIHBvbHlnb24ucHVzaChwb2x5Z29uWzBdKTtcbiAgfVxuICBjb25zdCB1bmlxdWUgPSBwb2x5Z29uLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgbGV0IGZvdW5kSW5kZXggPSAtMTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgaWYgKHB0WzBdID09PSBpdGVtWzBdICYmIHB0WzFdID09PSBpdGVtWzFdKSB7XG4gICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICB9KTtcbiAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICk7XG4gIH1cbiAgY29uc3QgcG9pbnRzID0gcG9seWdvblxuICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBhcnNlRmxvYXQocG9pbnRbMV0pLCBwYXJzZUZsb2F0KHBvaW50WzBdKSk7XG4gICAgICByZXR1cm4gYCgke3BvaW50WzFdfSwgJHtwb2ludFswXX0pYDtcbiAgICB9KVxuICAgIC5qb2luKCcsICcpO1xuICByZXR1cm4gYCgke3BvaW50c30pYDtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCkge1xuICBpZiAoIXJlZ2V4LmVuZHNXaXRoKCdcXG4nKSkge1xuICAgIHJlZ2V4ICs9ICdcXG4nO1xuICB9XG5cbiAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIGNvbW1lbnRzXG4gIHJldHVybiAoXG4gICAgcmVnZXhcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSkjLipcXG4vZ2ltLCAnJDEnKVxuICAgICAgLy8gcmVtb3ZlIGxpbmVzIHN0YXJ0aW5nIHdpdGggYSBjb21tZW50XG4gICAgICAucmVwbGFjZSgvXiMuKlxcbi9naW0sICcnKVxuICAgICAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIHdoaXRlc3BhY2VcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSlcXHMrL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSB3aGl0ZXNwYWNlIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBsaW5lXG4gICAgICAucmVwbGFjZSgvXlxccysvLCAnJylcbiAgICAgIC50cmltKClcbiAgKTtcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1JlZ2V4UGF0dGVybihzKSB7XG4gIGlmIChzICYmIHMuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgLy8gcmVnZXggZm9yIHN0YXJ0c1dpdGhcbiAgICByZXR1cm4gJ14nICsgbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDEpKTtcbiAgfSBlbHNlIGlmIChzICYmIHMuZW5kc1dpdGgoJyQnKSkge1xuICAgIC8vIHJlZ2V4IGZvciBlbmRzV2l0aFxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMuc2xpY2UoMCwgcy5sZW5ndGggLSAxKSkgKyAnJCc7XG4gIH1cblxuICAvLyByZWdleCBmb3IgY29udGFpbnNcbiAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocyk7XG59XG5cbmZ1bmN0aW9uIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlKSB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCAhdmFsdWUuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9cXF5cXFxcUS4qXFxcXEUvKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn1cblxuZnVuY3Rpb24gaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpIHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0uJHJlZ2V4KTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXS4kcmVnZXgpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgodmFsdWVzKSB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gaXNTdGFydHNXaXRoUmVnZXgodmFsdWUuJHJlZ2V4KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpIHtcbiAgcmV0dXJuIHJlbWFpbmluZ1xuICAgIC5zcGxpdCgnJylcbiAgICAubWFwKGMgPT4ge1xuICAgICAgY29uc3QgcmVnZXggPSBSZWdFeHAoJ1swLTkgXXxcXFxccHtMfScsICd1Jyk7IC8vIFN1cHBvcnQgYWxsIHVuaWNvZGUgbGV0dGVyIGNoYXJzXG4gICAgICBpZiAoYy5tYXRjaChyZWdleCkgIT09IG51bGwpIHtcbiAgICAgICAgLy8gZG9uJ3QgZXNjYXBlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzXG4gICAgICAgIHJldHVybiBjO1xuICAgICAgfVxuICAgICAgLy8gZXNjYXBlIGV2ZXJ5dGhpbmcgZWxzZSAoc2luZ2xlIHF1b3RlcyB3aXRoIHNpbmdsZSBxdW90ZXMsIGV2ZXJ5dGhpbmcgZWxzZSB3aXRoIGEgYmFja3NsYXNoKVxuICAgICAgcmV0dXJuIGMgPT09IGAnYCA/IGAnJ2AgOiBgXFxcXCR7Y31gO1xuICAgIH0pXG4gICAgLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBsaXRlcmFsaXplUmVnZXhQYXJ0KHM6IHN0cmluZykge1xuICBjb25zdCBtYXRjaGVyMSA9IC9cXFxcUSgoPyFcXFxcRSkuKilcXFxcRSQvO1xuICBjb25zdCByZXN1bHQxOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIxKTtcbiAgaWYgKHJlc3VsdDEgJiYgcmVzdWx0MS5sZW5ndGggPiAxICYmIHJlc3VsdDEuaW5kZXggPiAtMSkge1xuICAgIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgYW5kIGFuIGVuZCBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cigwLCByZXN1bHQxLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQxWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gcHJvY2VzcyByZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgY29uc3QgbWF0Y2hlcjIgPSAvXFxcXFEoKD8hXFxcXEUpLiopJC87XG4gIGNvbnN0IHJlc3VsdDI6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjIpO1xuICBpZiAocmVzdWx0MiAmJiByZXN1bHQyLmxlbmd0aCA+IDEgJiYgcmVzdWx0Mi5pbmRleCA+IC0xKSB7XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHIoMCwgcmVzdWx0Mi5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MlsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHJlbW92ZSBhbGwgaW5zdGFuY2VzIG9mIFxcUSBhbmQgXFxFIGZyb20gdGhlIHJlbWFpbmluZyB0ZXh0ICYgZXNjYXBlIHNpbmdsZSBxdW90ZXNcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxFKS8sICckMScpXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcUSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC9eXFxcXEUvLCAnJylcbiAgICAucmVwbGFjZSgvXlxcXFxRLywgJycpXG4gICAgLnJlcGxhY2UoLyhbXiddKScvLCBgJDEnJ2ApXG4gICAgLnJlcGxhY2UoL14nKFteJ10pLywgYCcnJDFgKTtcbn1cblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnXG4gICAgKTtcbiAgfSxcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXI7XG4iXX0=