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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIuanMiXSwibmFtZXMiOlsiUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciIsIlBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVPYmplY3RFcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsImxvZ2dlciIsInJlcXVpcmUiLCJkZWJ1ZyIsImFyZ3MiLCJhcmd1bWVudHMiLCJjb25jYXQiLCJzbGljZSIsImxlbmd0aCIsImxvZyIsImdldExvZ2dlciIsImFwcGx5IiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwidmFsdWUiLCJfX3R5cGUiLCJpc28iLCJuYW1lIiwidHJhbnNmb3JtVmFsdWUiLCJvYmplY3RJZCIsImVtcHR5Q0xQUyIsIk9iamVjdCIsImZyZWV6ZSIsImZpbmQiLCJnZXQiLCJjb3VudCIsImNyZWF0ZSIsInVwZGF0ZSIsImRlbGV0ZSIsImFkZEZpZWxkIiwicHJvdGVjdGVkRmllbGRzIiwiZGVmYXVsdENMUFMiLCJ0b1BhcnNlU2NoZW1hIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2hhc2hlZF9wYXNzd29yZCIsIl93cGVybSIsIl9ycGVybSIsImNscHMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwidG9Qb3N0Z3Jlc1NjaGVtYSIsIl9wYXNzd29yZF9oaXN0b3J5IiwiaGFuZGxlRG90RmllbGRzIiwib2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJmaWVsZE5hbWUiLCJpbmRleE9mIiwiY29tcG9uZW50cyIsInNwbGl0IiwiZmlyc3QiLCJzaGlmdCIsImN1cnJlbnRPYmoiLCJuZXh0IiwiX19vcCIsInVuZGVmaW5lZCIsInRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzIiwibWFwIiwiY21wdCIsImluZGV4IiwidHJhbnNmb3JtRG90RmllbGQiLCJqb2luIiwidHJhbnNmb3JtQWdncmVnYXRlRmllbGQiLCJzdWJzdHIiLCJ2YWxpZGF0ZUtleXMiLCJrZXkiLCJpbmNsdWRlcyIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX05FU1RFRF9LRVkiLCJqb2luVGFibGVzRm9yU2NoZW1hIiwibGlzdCIsImZpZWxkIiwicHVzaCIsImJ1aWxkV2hlcmVDbGF1c2UiLCJxdWVyeSIsImNhc2VJbnNlbnNpdGl2ZSIsInBhdHRlcm5zIiwidmFsdWVzIiwic29ydHMiLCJpc0FycmF5RmllbGQiLCJpbml0aWFsUGF0dGVybnNMZW5ndGgiLCJmaWVsZFZhbHVlIiwiJGV4aXN0cyIsImF1dGhEYXRhTWF0Y2giLCJtYXRjaCIsIiRpbiIsIiRyZWdleCIsIk1BWF9JTlRfUExVU19PTkUiLCJjbGF1c2VzIiwiY2xhdXNlVmFsdWVzIiwic3ViUXVlcnkiLCJjbGF1c2UiLCJwYXR0ZXJuIiwib3JPckFuZCIsIm5vdCIsIiRuZSIsImNvbnN0cmFpbnRGaWVsZE5hbWUiLCJwb2ludCIsImxvbmdpdHVkZSIsImxhdGl0dWRlIiwiJGVxIiwiaXNJbk9yTmluIiwiQXJyYXkiLCJpc0FycmF5IiwiJG5pbiIsImluUGF0dGVybnMiLCJhbGxvd051bGwiLCJsaXN0RWxlbSIsImxpc3RJbmRleCIsImNyZWF0ZUNvbnN0cmFpbnQiLCJiYXNlQXJyYXkiLCJub3RJbiIsIl8iLCJmbGF0TWFwIiwiZWx0IiwiSU5WQUxJRF9KU09OIiwiJGFsbCIsImlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgiLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwiaSIsInByb2Nlc3NSZWdleFBhdHRlcm4iLCJzdWJzdHJpbmciLCIkY29udGFpbmVkQnkiLCJhcnIiLCIkdGV4dCIsInNlYXJjaCIsIiRzZWFyY2giLCJsYW5ndWFnZSIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwiJG5lYXJTcGhlcmUiLCJkaXN0YW5jZSIsIiRtYXhEaXN0YW5jZSIsImRpc3RhbmNlSW5LTSIsIiR3aXRoaW4iLCIkYm94IiwiYm94IiwibGVmdCIsImJvdHRvbSIsInJpZ2h0IiwidG9wIiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJjZW50ZXJTcGhlcmUiLCJHZW9Qb2ludCIsIkdlb1BvaW50Q29kZXIiLCJpc1ZhbGlkSlNPTiIsIl92YWxpZGF0ZSIsImlzTmFOIiwiJHBvbHlnb24iLCJwb2x5Z29uIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCIkZ2VvSW50ZXJzZWN0cyIsIiRwb2ludCIsInJlZ2V4Iiwib3BlcmF0b3IiLCJvcHRzIiwiJG9wdGlvbnMiLCJyZW1vdmVXaGl0ZVNwYWNlIiwiY29udmVydFBvbHlnb25Ub1NRTCIsImNtcCIsInBnQ29tcGFyYXRvciIsInBvc3RncmVzVmFsdWUiLCJjYXN0VHlwZSIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJ1cmkiLCJjb2xsZWN0aW9uUHJlZml4IiwiZGF0YWJhc2VPcHRpb25zIiwiX2NvbGxlY3Rpb25QcmVmaXgiLCJjbGllbnQiLCJwZ3AiLCJfY2xpZW50IiwiX3BncCIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5IiwiYW5hbHl6ZSIsImhhbmRsZVNodXRkb3duIiwiJHBvb2wiLCJlbmQiLCJfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyIsImNvbm4iLCJub25lIiwiY2F0Y2giLCJlcnJvciIsImNvZGUiLCJjbGFzc0V4aXN0cyIsIm9uZSIsImEiLCJleGlzdHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwic2VsZiIsInRhc2siLCJ0Iiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJzdWJtaXR0ZWRJbmRleGVzIiwiZXhpc3RpbmdJbmRleGVzIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfaWRfIiwiX2lkIiwiZGVsZXRlZEluZGV4ZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJJTlZBTElEX1FVRVJZIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidHgiLCJjcmVhdGVJbmRleGVzIiwiZHJvcEluZGV4ZXMiLCJjcmVhdGVDbGFzcyIsImNyZWF0ZVRhYmxlIiwiZXJyIiwiZGV0YWlsIiwiRFVQTElDQVRFX1ZBTFVFIiwidmFsdWVzQXJyYXkiLCJwYXR0ZXJuc0FycmF5IiwiYXNzaWduIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsInJlbGF0aW9ucyIsInBhcnNlVHlwZSIsInFzIiwiYmF0Y2giLCJqb2luVGFibGUiLCJzY2hlbWFVcGdyYWRlIiwiY29sdW1ucyIsImNvbHVtbl9uYW1lIiwibmV3Q29sdW1ucyIsImZpbHRlciIsIml0ZW0iLCJhZGRGaWVsZElmTm90RXhpc3RzIiwicG9zdGdyZXNUeXBlIiwicmVzdWx0IiwiYW55IiwicGF0aCIsImRlbGV0ZUNsYXNzIiwib3BlcmF0aW9ucyIsImhlbHBlcnMiLCJ0aGVuIiwiZGVsZXRlQWxsQ2xhc3NlcyIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwicmVzdWx0cyIsImpvaW5zIiwicmVkdWNlIiwiY2xhc3NlcyIsInF1ZXJpZXMiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwiaWR4IiwiZ2V0QWxsQ2xhc3NlcyIsInJvdyIsImdldENsYXNzIiwiY3JlYXRlT2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2x1bW5zQXJyYXkiLCJnZW9Qb2ludHMiLCJwcm92aWRlciIsInBvcCIsImluaXRpYWxWYWx1ZXMiLCJ2YWwiLCJ0ZXJtaW5hdGlvbiIsImdlb1BvaW50c0luamVjdHMiLCJsIiwiY29sdW1uc1BhdHRlcm4iLCJjb2wiLCJ2YWx1ZXNQYXR0ZXJuIiwicHJvbWlzZSIsIm9wcyIsInVuZGVybHlpbmdFcnJvciIsImNvbnN0cmFpbnQiLCJtYXRjaGVzIiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ3aGVyZSIsIk9CSkVDVF9OT1RfRk9VTkQiLCJmaW5kT25lQW5kVXBkYXRlIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGVQYXR0ZXJucyIsIm9yaWdpbmFsVXBkYXRlIiwiZG90Tm90YXRpb25PcHRpb25zIiwiZ2VuZXJhdGUiLCJqc29uYiIsImxhc3RLZXkiLCJmaWVsZE5hbWVJbmRleCIsInN0ciIsImFtb3VudCIsIm9iamVjdHMiLCJrZXlzVG9JbmNyZW1lbnQiLCJrIiwiaW5jcmVtZW50UGF0dGVybnMiLCJjIiwia2V5c1RvRGVsZXRlIiwiZGVsZXRlUGF0dGVybnMiLCJwIiwidXBkYXRlT2JqZWN0IiwiZXhwZWN0ZWRUeXBlIiwicmVqZWN0Iiwid2hlcmVDbGF1c2UiLCJ1cHNlcnRPbmVPYmplY3QiLCJjcmVhdGVWYWx1ZSIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJleHBsYWluIiwiaGFzTGltaXQiLCJoYXNTa2lwIiwid2hlcmVQYXR0ZXJuIiwibGltaXRQYXR0ZXJuIiwic2tpcFBhdHRlcm4iLCJzb3J0UGF0dGVybiIsInNvcnRDb3B5Iiwic29ydGluZyIsInRyYW5zZm9ybUtleSIsIm1lbW8iLCJvcmlnaW5hbFF1ZXJ5IiwicG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0IiwidGFyZ2V0Q2xhc3MiLCJ5IiwieCIsImNvb3JkcyIsInBhcnNlRmxvYXQiLCJjcmVhdGVkQXQiLCJ0b0lTT1N0cmluZyIsInVwZGF0ZWRBdCIsImV4cGlyZXNBdCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJjb25zdHJhaW50TmFtZSIsImNvbnN0cmFpbnRQYXR0ZXJucyIsIm1lc3NhZ2UiLCJyZWFkUHJlZmVyZW5jZSIsImVzdGltYXRlIiwiYXBwcm94aW1hdGVfcm93X2NvdW50IiwiZGlzdGluY3QiLCJjb2x1bW4iLCJpc05lc3RlZCIsImlzUG9pbnRlckZpZWxkIiwidHJhbnNmb3JtZXIiLCJjaGlsZCIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwiaGludCIsImNvdW50RmllbGQiLCJncm91cFZhbHVlcyIsImdyb3VwUGF0dGVybiIsInN0YWdlIiwiJGdyb3VwIiwiZ3JvdXBCeUZpZWxkcyIsImFsaWFzIiwic291cmNlIiwib3BlcmF0aW9uIiwiJHN1bSIsIiRtYXgiLCIkbWluIiwiJGF2ZyIsIiRwcm9qZWN0IiwiJG1hdGNoIiwiJG9yIiwiY29sbGFwc2UiLCJlbGVtZW50IiwibWF0Y2hQYXR0ZXJucyIsIiRsaW1pdCIsIiRza2lwIiwiJHNvcnQiLCJvcmRlciIsImUiLCJ0cmltIiwiQm9vbGVhbiIsInBhcnNlSW50IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInByb21pc2VzIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiYWxsIiwic3FsIiwibWlzYyIsImpzb25PYmplY3RTZXRLZXlzIiwiYXJyYXkiLCJhZGQiLCJhZGRVbmlxdWUiLCJyZW1vdmUiLCJjb250YWluc0FsbCIsImNvbnRhaW5zQWxsUmVnZXgiLCJjb250YWlucyIsImN0eCIsImR1cmF0aW9uIiwiY29uc29sZSIsImNyZWF0ZUluZGV4ZXNJZk5lZWRlZCIsImdldEluZGV4ZXMiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsInVwZGF0ZUVzdGltYXRlZENvdW50IiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJlbnN1cmVJbmRleCIsImluZGV4TmFtZSIsIm9wdGlvbnMiLCJkZWZhdWx0SW5kZXhOYW1lIiwiaW5kZXhOYW1lT3B0aW9ucyIsInVuaXF1ZSIsImFyIiwiZm91bmRJbmRleCIsInB0IiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZW5kc1dpdGgiLCJyZXBsYWNlIiwicyIsInN0YXJ0c1dpdGgiLCJsaXRlcmFsaXplUmVnZXhQYXJ0IiwiaXNTdGFydHNXaXRoUmVnZXgiLCJmaXJzdFZhbHVlc0lzUmVnZXgiLCJzb21lIiwiY3JlYXRlTGl0ZXJhbFJlZ2V4IiwicmVtYWluaW5nIiwiUmVnRXhwIiwibWF0Y2hlcjEiLCJyZXN1bHQxIiwicHJlZml4IiwibWF0Y2hlcjIiLCJyZXN1bHQyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ0E7O0FBRUE7O0FBRUE7O0FBQ0E7O0FBZ0JBOzs7Ozs7Ozs7O0FBZEEsTUFBTUEsaUNBQWlDLEdBQUcsT0FBMUM7QUFDQSxNQUFNQyw4QkFBOEIsR0FBRyxPQUF2QztBQUNBLE1BQU1DLDRCQUE0QixHQUFHLE9BQXJDO0FBQ0EsTUFBTUMsMEJBQTBCLEdBQUcsT0FBbkM7QUFDQSxNQUFNQyw0QkFBNEIsR0FBRyxPQUFyQztBQUNBLE1BQU1DLGlDQUFpQyxHQUFHLE9BQTFDOztBQUNBLE1BQU1DLE1BQU0sR0FBR0MsT0FBTyxDQUFDLGlCQUFELENBQXRCOztBQUVBLE1BQU1DLEtBQUssR0FBRyxVQUFVLEdBQUdDLElBQWIsRUFBd0I7QUFDcENBLEVBQUFBLElBQUksR0FBRyxD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cUMsQ0FxQnRDOzs7QUFDQSxTQUFPUCxDQUFDLENBQ0xELE9BREksQ0FDSSxjQURKLEVBQ29CLElBRHBCLEVBRUpBLE9BRkksQ0FFSSxjQUZKLEVBRW9CLElBRnBCLEVBR0pBLE9BSEksQ0FHSSxNQUhKLEVBR1ksRUFIWixFQUlKQSxPQUpJLENBSUksTUFKSixFQUlZLEVBSlosRUFLSkEsT0FMSSxDQUtJLFNBTEosRUFLZ0IsTUFMaEIsRUFNSkEsT0FOSSxDQU1JLFVBTkosRUFNaUIsTUFOakIsQ0FBUDtBQU9EOztBQUVELElBQUkvUSxhQUFhLEdBQUc7QUFDbEJDLEVBQUFBLFdBQVcsQ0FBQ3pJLEtBQUQsRUFBUTtBQUNqQixXQUFPLE9BQU9BLEtBQVAsS0FBaUIsUUFBakIsSUFBNkJBLEtBQUssS0FBSyxJQUF2QyxJQUErQ0EsS0FBSyxDQUFDQyxNQUFOLEtBQWlCLFVBQXZFO0FBQ0Q7O0FBSGlCLENBQXBCO2VBTWU0SixzQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICcuL1Bvc3RncmVzQ2xpZW50Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHNxbCBmcm9tICcuL3NxbCc7XG5cbmNvbnN0IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvciA9ICc0MlAwMSc7XG5jb25zdCBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgPSAnNDJQMDcnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciA9ICc0MjcwMSc7XG5jb25zdCBQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvciA9ICc0MjcwMyc7XG5jb25zdCBQb3N0Z3Jlc0R1cGxpY2F0ZU9iamVjdEVycm9yID0gJzQyNzEwJztcbmNvbnN0IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciA9ICcyMzUwNSc7XG5jb25zdCBsb2dnZXIgPSByZXF1aXJlKCcuLi8uLi8uLi9sb2dnZXInKTtcblxuY29uc3QgZGVidWcgPSBmdW5jdGlvbiAoLi4uYXJnczogYW55KSB7XG4gIGFyZ3MgPSBbJ1BHOiAnICsgYXJndW1lbnRzWzBdXS5jb25jYXQoYXJncy5zbGljZSgxLCBhcmdzLmxlbmd0aCkpO1xuICBjb25zdCBsb2cgPSBsb2dnZXIuZ2V0TG9nZ2VyKCk7XG4gIGxvZy5kZWJ1Zy5hcHBseShsb2csIGFyZ3MpO1xufTtcblxuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuXG5jb25zdCBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSA9IHR5cGUgPT4ge1xuICBzd2l0Y2ggKHR5cGUudHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ3BvaW50JztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgaWYgKHR5cGUuY29udGVudHMgJiYgdHlwZS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJykge1xuICAgICAgICByZXR1cm4gJ3RleHRbXSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ2pzb25iJztcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgYG5vIHR5cGUgZm9yICR7SlNPTi5zdHJpbmdpZnkodHlwZSl9IHlldGA7XG4gIH1cbn07XG5cbmNvbnN0IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciA9IHtcbiAgJGd0OiAnPicsXG4gICRsdDogJzwnLFxuICAkZ3RlOiAnPj0nLFxuICAkbHRlOiAnPD0nLFxufTtcblxuY29uc3QgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzID0ge1xuICAkZGF5T2ZNb250aDogJ0RBWScsXG4gICRkYXlPZldlZWs6ICdET1cnLFxuICAkZGF5T2ZZZWFyOiAnRE9ZJyxcbiAgJGlzb0RheU9mV2VlazogJ0lTT0RPVycsXG4gICRpc29XZWVrWWVhcjogJ0lTT1lFQVInLFxuICAkaG91cjogJ0hPVVInLFxuICAkbWludXRlOiAnTUlOVVRFJyxcbiAgJHNlY29uZDogJ1NFQ09ORCcsXG4gICRtaWxsaXNlY29uZDogJ01JTExJU0VDT05EUycsXG4gICRtb250aDogJ01PTlRIJyxcbiAgJHdlZWs6ICdXRUVLJyxcbiAgJHllYXI6ICdZRUFSJyxcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5pc287XG4gICAgfVxuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgIHJldHVybiB2YWx1ZS5vYmplY3RJZDtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG4vLyBEdXBsaWNhdGUgZnJvbSB0aGVuIG1vbmdvIGFkYXB0ZXIuLi5cbmNvbnN0IGVtcHR5Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7fSxcbiAgZ2V0OiB7fSxcbiAgY291bnQ6IHt9LFxuICBjcmVhdGU6IHt9LFxuICB1cGRhdGU6IHt9LFxuICBkZWxldGU6IHt9LFxuICBhZGRGaWVsZDoge30sXG4gIHByb3RlY3RlZEZpZWxkczoge30sXG59KTtcblxuY29uc3QgZGVmYXVsdENMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDogeyAnKic6IHRydWUgfSxcbiAgZ2V0OiB7ICcqJzogdHJ1ZSB9LFxuICBjb3VudDogeyAnKic6IHRydWUgfSxcbiAgY3JlYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICB1cGRhdGU6IHsgJyonOiB0cnVlIH0sXG4gIGRlbGV0ZTogeyAnKic6IHRydWUgfSxcbiAgYWRkRmllbGQ6IHsgJyonOiB0cnVlIH0sXG4gIHByb3RlY3RlZEZpZWxkczogeyAnKic6IFtdIH0sXG59KTtcblxuY29uc3QgdG9QYXJzZVNjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgfVxuICBpZiAoc2NoZW1hLmZpZWxkcykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIH1cbiAgbGV0IGNscHMgPSBkZWZhdWx0Q0xQUztcbiAgaWYgKHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMpIHtcbiAgICBjbHBzID0geyAuLi5lbXB0eUNMUFMsIC4uLnNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgfTtcbiAgfVxuICBsZXQgaW5kZXhlcyA9IHt9O1xuICBpZiAoc2NoZW1hLmluZGV4ZXMpIHtcbiAgICBpbmRleGVzID0geyAuLi5zY2hlbWEuaW5kZXhlcyB9O1xuICB9XG4gIHJldHVybiB7XG4gICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgIGZpZWxkczogc2NoZW1hLmZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGNscHMsXG4gICAgaW5kZXhlcyxcbiAgfTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoIXNjaGVtYSkge1xuICAgIHJldHVybiBzY2hlbWE7XG4gIH1cbiAgc2NoZW1hLmZpZWxkcyA9IHNjaGVtYS5maWVsZHMgfHwge307XG4gIHNjaGVtYS5maWVsZHMuX3dwZXJtID0geyB0eXBlOiAnQXJyYXknLCBjb250ZW50czogeyB0eXBlOiAnU3RyaW5nJyB9IH07XG4gIHNjaGVtYS5maWVsZHMuX3JwZXJtID0geyB0eXBlOiAnQXJyYXknLCBjb250ZW50czogeyB0eXBlOiAnU3RyaW5nJyB9IH07XG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgIHNjaGVtYS5maWVsZHMuX3Bhc3N3b3JkX2hpc3RvcnkgPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgfVxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY29uc3QgaGFuZGxlRG90RmllbGRzID0gb2JqZWN0ID0+IHtcbiAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAgY29uc3QgY29tcG9uZW50cyA9IGZpZWxkTmFtZS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICBvYmplY3RbZmlyc3RdID0gb2JqZWN0W2ZpcnN0XSB8fCB7fTtcbiAgICAgIGxldCBjdXJyZW50T2JqID0gb2JqZWN0W2ZpcnN0XTtcbiAgICAgIGxldCBuZXh0O1xuICAgICAgbGV0IHZhbHVlID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICBpZiAodmFsdWUgJiYgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdmFsdWUgPSB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgd2hpbGUgKChuZXh0ID0gY29tcG9uZW50cy5zaGlmdCgpKSkge1xuICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbmQtYXNzaWduICovXG4gICAgICAgIGN1cnJlbnRPYmpbbmV4dF0gPSBjdXJyZW50T2JqW25leHRdIHx8IHt9O1xuICAgICAgICBpZiAoY29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjdXJyZW50T2JqW25leHRdID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgY3VycmVudE9iaiA9IGN1cnJlbnRPYmpbbmV4dF07XG4gICAgICB9XG4gICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzID0gZmllbGROYW1lID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpLm1hcCgoY21wdCwgaW5kZXgpID0+IHtcbiAgICBpZiAoaW5kZXggPT09IDApIHtcbiAgICAgIHJldHVybiBgXCIke2NtcHR9XCJgO1xuICAgIH1cbiAgICByZXR1cm4gYCcke2NtcHR9J2A7XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG90RmllbGQgPSBmaWVsZE5hbWUgPT4ge1xuICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA9PT0gLTEpIHtcbiAgICByZXR1cm4gYFwiJHtmaWVsZE5hbWV9XCJgO1xuICB9XG4gIGNvbnN0IGNvbXBvbmVudHMgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpO1xuICBsZXQgbmFtZSA9IGNvbXBvbmVudHMuc2xpY2UoMCwgY29tcG9uZW50cy5sZW5ndGggLSAxKS5qb2luKCctPicpO1xuICBuYW1lICs9ICctPj4nICsgY29tcG9uZW50c1tjb21wb25lbnRzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4gbmFtZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKHR5cGVvZiBmaWVsZE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGZpZWxkTmFtZTtcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF9jcmVhdGVkX2F0Jykge1xuICAgIHJldHVybiAnY3JlYXRlZEF0JztcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF91cGRhdGVkX2F0Jykge1xuICAgIHJldHVybiAndXBkYXRlZEF0JztcbiAgfVxuICByZXR1cm4gZmllbGROYW1lLnN1YnN0cigxKTtcbn07XG5cbmNvbnN0IHZhbGlkYXRlS2V5cyA9IG9iamVjdCA9PiB7XG4gIGlmICh0eXBlb2Ygb2JqZWN0ID09ICdvYmplY3QnKSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldID09ICdvYmplY3QnKSB7XG4gICAgICAgIHZhbGlkYXRlS2V5cyhvYmplY3Rba2V5XSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gUmV0dXJucyB0aGUgbGlzdCBvZiBqb2luIHRhYmxlcyBvbiBhIHNjaGVtYVxuY29uc3Qgam9pblRhYmxlc0ZvclNjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGNvbnN0IGxpc3QgPSBbXTtcbiAgaWYgKHNjaGVtYSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgbGlzdC5wdXNoKGBfSm9pbjoke2ZpZWxkfToke3NjaGVtYS5jbGFzc05hbWV9YCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGxpc3Q7XG59O1xuXG5pbnRlcmZhY2UgV2hlcmVDbGF1c2Uge1xuICBwYXR0ZXJuOiBzdHJpbmc7XG4gIHZhbHVlczogQXJyYXk8YW55PjtcbiAgc29ydHM6IEFycmF5PGFueT47XG59XG5cbmNvbnN0IGJ1aWxkV2hlcmVDbGF1c2UgPSAoeyBzY2hlbWEsIHF1ZXJ5LCBpbmRleCwgY2FzZUluc2Vuc2l0aXZlIH0pOiBXaGVyZUNsYXVzZSA9PiB7XG4gIGNvbnN0IHBhdHRlcm5zID0gW107XG4gIGxldCB2YWx1ZXMgPSBbXTtcbiAgY29uc3Qgc29ydHMgPSBbXTtcblxuICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGluaXRpYWxQYXR0ZXJuc0xlbmd0aCA9IHBhdHRlcm5zLmxlbmd0aDtcbiAgICBjb25zdCBmaWVsZFZhbHVlID0gcXVlcnlbZmllbGROYW1lXTtcblxuICAgIC8vIG5vdGhpbmcgaW4gdGhlIHNjaGVtYSwgaXQncyBnb25uYSBibG93IHVwXG4gICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgIC8vIGFzIGl0IHdvbid0IGV4aXN0XG4gICAgICBpZiAoZmllbGRWYWx1ZSAmJiBmaWVsZFZhbHVlLiRleGlzdHMgPT09IGZhbHNlKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgLy8gVE9ETzogSGFuZGxlIHF1ZXJ5aW5nIGJ5IF9hdXRoX2RhdGFfcHJvdmlkZXIsIGF1dGhEYXRhIGlzIHN0b3JlZCBpbiBhdXRoRGF0YSBmaWVsZFxuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmIChjYXNlSW5zZW5zaXRpdmUgJiYgKGZpZWxkTmFtZSA9PT0gJ3VzZXJuYW1lJyB8fCBmaWVsZE5hbWUgPT09ICdlbWFpbCcpKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGBMT1dFUigkJHtpbmRleH06bmFtZSkgPSBMT1dFUigkJHtpbmRleCArIDF9KWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgIGxldCBuYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgIGlmIChmaWVsZFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgSVMgTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChuYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgICBuYW1lID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06cmF3KTo6anNvbmIgQD4gJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChuYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRpbikpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS4kcmVnZXgpIHtcbiAgICAgICAgICAvLyBIYW5kbGUgbGF0ZXJcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3ID0gJCR7aW5kZXggKyAxfTo6dGV4dGApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgZmllbGRWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaW5kZXggKz0gMTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAvLyBDYW4ndCBjYXN0IGJvb2xlYW4gdG8gZG91YmxlIHByZWNpc2lvblxuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ051bWJlcicpIHtcbiAgICAgICAgLy8gU2hvdWxkIGFsd2F5cyByZXR1cm4gemVybyByZXN1bHRzXG4gICAgICAgIGNvbnN0IE1BWF9JTlRfUExVU19PTkUgPSA5MjIzMzcyMDM2ODU0Nzc1ODA4O1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIE1BWF9JTlRfUExVU19PTkUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChbJyRvcicsICckbm9yJywgJyRhbmQnXS5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICBjb25zdCBjbGF1c2VzID0gW107XG4gICAgICBjb25zdCBjbGF1c2VWYWx1ZXMgPSBbXTtcbiAgICAgIGZpZWxkVmFsdWUuZm9yRWFjaChzdWJRdWVyeSA9PiB7XG4gICAgICAgIGNvbnN0IGNsYXVzZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICBxdWVyeTogc3ViUXVlcnksXG4gICAgICAgICAgaW5kZXgsXG4gICAgICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKGNsYXVzZS5wYXR0ZXJuLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjbGF1c2VzLnB1c2goY2xhdXNlLnBhdHRlcm4pO1xuICAgICAgICAgIGNsYXVzZVZhbHVlcy5wdXNoKC4uLmNsYXVzZS52YWx1ZXMpO1xuICAgICAgICAgIGluZGV4ICs9IGNsYXVzZS52YWx1ZXMubGVuZ3RoO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgY29uc3Qgb3JPckFuZCA9IGZpZWxkTmFtZSA9PT0gJyRhbmQnID8gJyBBTkQgJyA6ICcgT1IgJztcbiAgICAgIGNvbnN0IG5vdCA9IGZpZWxkTmFtZSA9PT0gJyRub3InID8gJyBOT1QgJyA6ICcnO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAke25vdH0oJHtjbGF1c2VzLmpvaW4ob3JPckFuZCl9KWApO1xuICAgICAgdmFsdWVzLnB1c2goLi4uY2xhdXNlVmFsdWVzKTtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kbmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICBmaWVsZFZhbHVlLiRuZSA9IEpTT04uc3RyaW5naWZ5KFtmaWVsZFZhbHVlLiRuZV0pO1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBOT1QgYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGRWYWx1ZS4kbmUgPT09IG51bGwpIHtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOT1QgTlVMTGApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBpZiBub3QgbnVsbCwgd2UgbmVlZCB0byBtYW51YWxseSBleGNsdWRlIG51bGxcbiAgICAgICAgICBpZiAoZmllbGRWYWx1ZS4kbmUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICBgKCQke2luZGV4fTpuYW1lIDw+IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pIE9SICQke2luZGV4fTpuYW1lIElTIE5VTEwpYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPD4gJCR7aW5kZXh9IE9SICR7Y29uc3RyYWludEZpZWxkTmFtZX0gSVMgTlVMTClgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVE9ETzogc3VwcG9ydCBhcnJheXNcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRlcSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kZXEgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke3RyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSl9ID0gJCR7aW5kZXgrK31gKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGlzSW5Pck5pbiA9IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pIHx8IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kbmluKTtcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSAmJlxuICAgICAgaXNBcnJheUZpZWxkICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJ1xuICAgICkge1xuICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgbGV0IGFsbG93TnVsbCA9IGZhbHNlO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGZpZWxkVmFsdWUuJGluLmZvckVhY2goKGxpc3RFbGVtLCBsaXN0SW5kZXgpID0+IHtcbiAgICAgICAgaWYgKGxpc3RFbGVtID09PSBudWxsKSB7XG4gICAgICAgICAgYWxsb3dOdWxsID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChsaXN0RWxlbSk7XG4gICAgICAgICAgaW5QYXR0ZXJucy5wdXNoKGAkJHtpbmRleCArIDEgKyBsaXN0SW5kZXggLSAoYWxsb3dOdWxsID8gMSA6IDApfWApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChhbGxvd051bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpuYW1lIElTIE5VTEwgT1IgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgIH0gZWxzZSBpZiAoaXNJbk9yTmluKSB7XG4gICAgICB2YXIgY3JlYXRlQ29uc3RyYWludCA9IChiYXNlQXJyYXksIG5vdEluKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vdCA9IG5vdEluID8gJyBOT1QgJyA6ICcnO1xuICAgICAgICBpZiAoYmFzZUFycmF5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke25vdH0gYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGJhc2VBcnJheSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSGFuZGxlIE5lc3RlZCBEb3QgTm90YXRpb24gQWJvdmVcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIGJhc2VBcnJheS5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGlmIChsaXN0RWxlbSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4fWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7bm90fSBJTiAoJHtpblBhdHRlcm5zLmpvaW4oKX0pYCk7XG4gICAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghbm90SW4pIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBIYW5kbGUgZW1wdHkgYXJyYXlcbiAgICAgICAgICBpZiAobm90SW4pIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAxJyk7IC8vIFJldHVybiBhbGwgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAyJyk7IC8vIFJldHVybiBubyB2YWx1ZXNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChcbiAgICAgICAgICBfLmZsYXRNYXAoZmllbGRWYWx1ZS4kaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIGZhbHNlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJG5pbiwgZWx0ID0+IGVsdCksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkaW4gdmFsdWUnKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuaW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRuaW4gdmFsdWUnKTtcbiAgICB9XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpICYmIGlzQXJyYXlGaWVsZCkge1xuICAgICAgaWYgKGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICBpZiAoIWlzQWxsVmFsdWVzUmVnZXhPck5vbmUoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdBbGwgJGFsbCB2YWx1ZXMgbXVzdCBiZSBvZiByZWdleCB0eXBlIG9yIG5vbmU6ICcgKyBmaWVsZFZhbHVlLiRhbGxcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZFZhbHVlLiRhbGwubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHByb2Nlc3NSZWdleFBhdHRlcm4oZmllbGRWYWx1ZS4kYWxsW2ldLiRyZWdleCk7XG4gICAgICAgICAgZmllbGRWYWx1ZS4kYWxsW2ldID0gdmFsdWUuc3Vic3RyaW5nKDEpICsgJyUnO1xuICAgICAgICB9XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zX2FsbF9yZWdleCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGwoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRhbGwpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRhbGwubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGFsbFswXS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kZXhpc3RzKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICB9XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaW5kZXggKz0gMTtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kY29udGFpbmVkQnkpIHtcbiAgICAgIGNvbnN0IGFyciA9IGZpZWxkVmFsdWUuJGNvbnRhaW5lZEJ5O1xuICAgICAgaWYgKCEoYXJyIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJGNvbnRhaW5lZEJ5OiBzaG91bGQgYmUgYW4gYXJyYXlgKTtcbiAgICAgIH1cblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPEAgJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoYXJyKSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR0ZXh0KSB7XG4gICAgICBjb25zdCBzZWFyY2ggPSBmaWVsZFZhbHVlLiR0ZXh0LiRzZWFyY2g7XG4gICAgICBsZXQgbGFuZ3VhZ2UgPSAnZW5nbGlzaCc7XG4gICAgICBpZiAodHlwZW9mIHNlYXJjaCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJHNlYXJjaCwgc2hvdWxkIGJlIG9iamVjdGApO1xuICAgICAgfVxuICAgICAgaWYgKCFzZWFyY2guJHRlcm0gfHwgdHlwZW9mIHNlYXJjaC4kdGVybSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJHRlcm0sIHNob3VsZCBiZSBzdHJpbmdgKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGxhbmd1YWdlICYmIHR5cGVvZiBzZWFyY2guJGxhbmd1YWdlICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkbGFuZ3VhZ2UsIHNob3VsZCBiZSBzdHJpbmdgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRsYW5ndWFnZSkge1xuICAgICAgICBsYW5ndWFnZSA9IHNlYXJjaC4kbGFuZ3VhZ2U7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICYmIHR5cGVvZiBzZWFyY2guJGNhc2VTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRjYXNlU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUgbm90IHN1cHBvcnRlZCwgcGxlYXNlIHVzZSAkcmVnZXggb3IgY3JlYXRlIGEgc2VwYXJhdGUgbG93ZXIgY2FzZSBjb2x1bW4uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICYmIHR5cGVvZiBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlID09PSBmYWxzZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRkaWFjcml0aWNTZW5zaXRpdmUgLSBmYWxzZSBub3Qgc3VwcG9ydGVkLCBpbnN0YWxsIFBvc3RncmVzIFVuYWNjZW50IEV4dGVuc2lvbmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGB0b190c3ZlY3RvcigkJHtpbmRleH0sICQke2luZGV4ICsgMX06bmFtZSkgQEAgdG9fdHNxdWVyeSgkJHtpbmRleCArIDJ9LCAkJHtpbmRleCArIDN9KWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChsYW5ndWFnZSwgZmllbGROYW1lLCBsYW5ndWFnZSwgc2VhcmNoLiR0ZXJtKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJG5lYXJTcGhlcmUpIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kbmVhclNwaGVyZTtcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gZmllbGRWYWx1ZS4kbWF4RGlzdGFuY2U7XG4gICAgICBjb25zdCBkaXN0YW5jZUluS00gPSBkaXN0YW5jZSAqIDYzNzEgKiAxMDAwO1xuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICBzb3J0cy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSBBU0NgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kd2l0aGluICYmIGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94KSB7XG4gICAgICBjb25zdCBib3ggPSBmaWVsZFZhbHVlLiR3aXRoaW4uJGJveDtcbiAgICAgIGNvbnN0IGxlZnQgPSBib3hbMF0ubG9uZ2l0dWRlO1xuICAgICAgY29uc3QgYm90dG9tID0gYm94WzBdLmxhdGl0dWRlO1xuICAgICAgY29uc3QgcmlnaHQgPSBib3hbMV0ubG9uZ2l0dWRlO1xuICAgICAgY29uc3QgdG9wID0gYm94WzFdLmxhdGl0dWRlO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9pbnQgPEAgJCR7aW5kZXggKyAxfTo6Ym94YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoKCR7bGVmdH0sICR7Ym90dG9tfSksICgke3JpZ2h0fSwgJHt0b3B9KSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb1dpdGhpbiAmJiBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZSkge1xuICAgICAgY29uc3QgY2VudGVyU3BoZXJlID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRjZW50ZXJTcGhlcmU7XG4gICAgICBpZiAoIShjZW50ZXJTcGhlcmUgaW5zdGFuY2VvZiBBcnJheSkgfHwgY2VudGVyU3BoZXJlLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgc2hvdWxkIGJlIGFuIGFycmF5IG9mIFBhcnNlLkdlb1BvaW50IGFuZCBkaXN0YW5jZSdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIEdldCBwb2ludCwgY29udmVydCB0byBnZW8gcG9pbnQgaWYgbmVjZXNzYXJ5IGFuZCB2YWxpZGF0ZVxuICAgICAgbGV0IHBvaW50ID0gY2VudGVyU3BoZXJlWzBdO1xuICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICB9IGVsc2UgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBnZW8gcG9pbnQgaW52YWxpZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIC8vIEdldCBkaXN0YW5jZSBhbmQgdmFsaWRhdGVcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gY2VudGVyU3BoZXJlWzFdO1xuICAgICAgaWYgKGlzTmFOKGRpc3RhbmNlKSB8fCBkaXN0YW5jZSA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZGlzdGFuY2UgaW52YWxpZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSA8PSAkJHtpbmRleCArIDN9YFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSwgZGlzdGFuY2VJbktNKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb1dpdGhpbiAmJiBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJHBvbHlnb24pIHtcbiAgICAgIGNvbnN0IHBvbHlnb24gPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJHBvbHlnb247XG4gICAgICBsZXQgcG9pbnRzO1xuICAgICAgaWYgKHR5cGVvZiBwb2x5Z29uID09PSAnb2JqZWN0JyAmJiBwb2x5Z29uLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGlmICghcG9seWdvbi5jb29yZGluYXRlcyB8fCBwb2x5Z29uLmNvb3JkaW5hdGVzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7IFBvbHlnb24uY29vcmRpbmF0ZXMgc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBsb24vbGF0IHBhaXJzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcG9pbnRzID0gcG9seWdvbi5jb29yZGluYXRlcztcbiAgICAgIH0gZWxzZSBpZiAocG9seWdvbiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgR2VvUG9pbnRzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcG9pbnRzID0gcG9seWdvbjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgXCJiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGJlIFBvbHlnb24gb2JqZWN0IG9yIEFycmF5IG9mIFBhcnNlLkdlb1BvaW50J3NcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcG9pbnRzID0gcG9pbnRzXG4gICAgICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICAgICAgICByZXR1cm4gYCgke3BvaW50WzBdfSwgJHtwb2ludFsxXX0pYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHR5cGVvZiBwb2ludCAhPT0gJ29iamVjdCcgfHwgcG9pbnQuX190eXBlICE9PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRnZW9XaXRoaW4gdmFsdWUnKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCgke3BvaW50LmxvbmdpdHVkZX0sICR7cG9pbnQubGF0aXR1ZGV9KWA7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCcsICcpO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9pbnQgPEAgJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnRzfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzICYmIGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMuJHBvaW50KSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMuJHBvaW50O1xuICAgICAgaWYgKHR5cGVvZiBwb2ludCAhPT0gJ29iamVjdCcgfHwgcG9pbnQuX190eXBlICE9PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvSW50ZXJzZWN0IHZhbHVlOyAkcG9pbnQgc2hvdWxkIGJlIEdlb1BvaW50J1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvbHlnb24gQD4gJCR7aW5kZXggKyAxfTo6cG9pbnRgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50LmxvbmdpdHVkZX0sICR7cG9pbnQubGF0aXR1ZGV9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kcmVnZXgpIHtcbiAgICAgIGxldCByZWdleCA9IGZpZWxkVmFsdWUuJHJlZ2V4O1xuICAgICAgbGV0IG9wZXJhdG9yID0gJ34nO1xuICAgICAgY29uc3Qgb3B0cyA9IGZpZWxkVmFsdWUuJG9wdGlvbnM7XG4gICAgICBpZiAob3B0cykge1xuICAgICAgICBpZiAob3B0cy5pbmRleE9mKCdpJykgPj0gMCkge1xuICAgICAgICAgIG9wZXJhdG9yID0gJ34qJztcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0cy5pbmRleE9mKCd4JykgPj0gMCkge1xuICAgICAgICAgIHJlZ2V4ID0gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICByZWdleCA9IHByb2Nlc3NSZWdleFBhdHRlcm4ocmVnZXgpO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3ICR7b3BlcmF0b3J9ICckJHtpbmRleCArIDF9OnJhdydgKTtcbiAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIHJlZ2V4KTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWVdKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuaXNvKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSB+PSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICBpbmRleCArPSAzO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwoZmllbGRWYWx1ZS5jb29yZGluYXRlcyk7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSB+PSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKGNtcCA9PiB7XG4gICAgICBpZiAoZmllbGRWYWx1ZVtjbXBdIHx8IGZpZWxkVmFsdWVbY21wXSA9PT0gMCkge1xuICAgICAgICBjb25zdCBwZ0NvbXBhcmF0b3IgPSBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3JbY21wXTtcbiAgICAgICAgY29uc3QgcG9zdGdyZXNWYWx1ZSA9IHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlW2NtcF0pO1xuICAgICAgICBsZXQgY29uc3RyYWludEZpZWxkTmFtZTtcbiAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgIGxldCBjYXN0VHlwZTtcbiAgICAgICAgICBzd2l0Y2ggKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlKSB7XG4gICAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgICBjYXN0VHlwZSA9ICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgICAgY2FzdFR5cGUgPSAnYm9vbGVhbic7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgY2FzdFR5cGUgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gYCQke2luZGV4Kyt9Om5hbWVgO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWVzLnB1c2gocG9zdGdyZXNWYWx1ZSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCR7Y29uc3RyYWludEZpZWxkTmFtZX0gJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4Kyt9YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID09PSBwYXR0ZXJucy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB0aGlzIHF1ZXJ5IHR5cGUgeWV0ICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgdmFsdWVzID0gdmFsdWVzLm1hcCh0cmFuc2Zvcm1WYWx1ZSk7XG4gIHJldHVybiB7IHBhdHRlcm46IHBhdHRlcm5zLmpvaW4oJyBBTkQgJyksIHZhbHVlcywgc29ydHMgfTtcbn07XG5cbmV4cG9ydCBjbGFzcyBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICBjYW5Tb3J0T25Kb2luVGFibGVzOiBib29sZWFuO1xuXG4gIC8vIFByaXZhdGVcbiAgX2NvbGxlY3Rpb25QcmVmaXg6IHN0cmluZztcbiAgX2NsaWVudDogYW55O1xuICBfcGdwOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoeyB1cmksIGNvbGxlY3Rpb25QcmVmaXggPSAnJywgZGF0YWJhc2VPcHRpb25zIH06IGFueSkge1xuICAgIHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggPSBjb2xsZWN0aW9uUHJlZml4O1xuICAgIGNvbnN0IHsgY2xpZW50LCBwZ3AgfSA9IGNyZWF0ZUNsaWVudCh1cmksIGRhdGFiYXNlT3B0aW9ucyk7XG4gICAgdGhpcy5fY2xpZW50ID0gY2xpZW50O1xuICAgIHRoaXMuX3BncCA9IHBncDtcbiAgICB0aGlzLmNhblNvcnRPbkpvaW5UYWJsZXMgPSBmYWxzZTtcbiAgfVxuXG4gIC8vTm90ZSB0aGF0IGFuYWx5emU9dHJ1ZSB3aWxsIHJ1biB0aGUgcXVlcnksIGV4ZWN1dGluZyBJTlNFUlRTLCBERUxFVEVTLCBldGMuXG4gIGNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkocXVlcnk6IHN0cmluZywgYW5hbHl6ZTogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgaWYgKGFuYWx5emUpIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoQU5BTFlaRSwgRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuICdFWFBMQUlOIChGT1JNQVQgSlNPTikgJyArIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGlmICghdGhpcy5fY2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuX2NsaWVudC4kcG9vbC5lbmQoKTtcbiAgfVxuXG4gIGFzeW5jIF9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBhd2FpdCBjb25uXG4gICAgICAubm9uZShcbiAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIFwiX1NDSEVNQVwiICggXCJjbGFzc05hbWVcIiB2YXJDaGFyKDEyMCksIFwic2NoZW1hXCIganNvbmIsIFwiaXNQYXJzZUNsYXNzXCIgYm9vbCwgUFJJTUFSWSBLRVkgKFwiY2xhc3NOYW1lXCIpICknXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIHx8XG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yIHx8XG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVPYmplY3RFcnJvclxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBUYWJsZSBhbHJlYWR5IGV4aXN0cywgbXVzdCBoYXZlIGJlZW4gY3JlYXRlZCBieSBhIGRpZmZlcmVudCByZXF1ZXN0LiBJZ25vcmUgZXJyb3IuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5vbmUoXG4gICAgICAnU0VMRUNUIEVYSVNUUyAoU0VMRUNUIDEgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzIFdIRVJFIHRhYmxlX25hbWUgPSAkMSknLFxuICAgICAgW25hbWVdLFxuICAgICAgYSA9PiBhLmV4aXN0c1xuICAgICk7XG4gIH1cblxuICBhc3luYyBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50YXNrKCdzZXQtY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGF3YWl0IHNlbGYuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHModCk7XG4gICAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAnc2NoZW1hJywgJ2NsYXNzTGV2ZWxQZXJtaXNzaW9ucycsIEpTT04uc3RyaW5naWZ5KENMUHMpXTtcbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgYFVQREFURSBcIl9TQ0hFTUFcIiBTRVQgJDI6bmFtZSA9IGpzb25fb2JqZWN0X3NldF9rZXkoJDI6bmFtZSwgJDM6OnRleHQsICQ0Ojpqc29uYikgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkSW5kZXhlczogYW55LFxuICAgIGV4aXN0aW5nSW5kZXhlczogYW55ID0ge30sXG4gICAgZmllbGRzOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHN1Ym1pdHRlZEluZGV4ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdJbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGV4aXN0aW5nSW5kZXhlcyA9IHsgX2lkXzogeyBfaWQ6IDEgfSB9O1xuICAgIH1cbiAgICBjb25zdCBkZWxldGVkSW5kZXhlcyA9IFtdO1xuICAgIGNvbnN0IGluc2VydGVkSW5kZXhlcyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEluZGV4ZXMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEluZGV4ZXNbbmFtZV07XG4gICAgICBpZiAoZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgSW5kZXggJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgZGVsZXRlZEluZGV4ZXMucHVzaChuYW1lKTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nSW5kZXhlc1tuYW1lXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGZpZWxkKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGRzLCBrZXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICAgIGBGaWVsZCAke2tleX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBhZGQgaW5kZXguYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBleGlzdGluZ0luZGV4ZXNbbmFtZV0gPSBmaWVsZDtcbiAgICAgICAgaW5zZXJ0ZWRJbmRleGVzLnB1c2goe1xuICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgYXdhaXQgY29ubi50eCgnc2V0LWluZGV4ZXMtd2l0aC1zY2hlbWEtZm9ybWF0JywgYXN5bmMgdCA9PiB7XG4gICAgICBpZiAoaW5zZXJ0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgYXdhaXQgc2VsZi5jcmVhdGVJbmRleGVzKGNsYXNzTmFtZSwgaW5zZXJ0ZWRJbmRleGVzLCB0KTtcbiAgICAgIH1cbiAgICAgIGlmIChkZWxldGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGF3YWl0IHNlbGYuZHJvcEluZGV4ZXMoY2xhc3NOYW1lLCBkZWxldGVkSW5kZXhlcywgdCk7XG4gICAgICB9XG4gICAgICBhd2FpdCBzZWxmLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKHQpO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDEnLFxuICAgICAgICBbY2xhc3NOYW1lLCAnc2NoZW1hJywgJ2luZGV4ZXMnLCBKU09OLnN0cmluZ2lmeShleGlzdGluZ0luZGV4ZXMpXVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46ID9hbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgcmV0dXJuIGNvbm5cbiAgICAgIC50eCgnY3JlYXRlLWNsYXNzJywgYXN5bmMgdCA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMuY3JlYXRlVGFibGUoY2xhc3NOYW1lLCBzY2hlbWEsIHQpO1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ0lOU0VSVCBJTlRPIFwiX1NDSEVNQVwiIChcImNsYXNzTmFtZVwiLCBcInNjaGVtYVwiLCBcImlzUGFyc2VDbGFzc1wiKSBWQUxVRVMgKCQ8Y2xhc3NOYW1lPiwgJDxzY2hlbWE+LCB0cnVlKScsXG4gICAgICAgICAgeyBjbGFzc05hbWUsIHNjaGVtYSB9XG4gICAgICAgICk7XG4gICAgICAgIGF3YWl0IHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoY2xhc3NOYW1lLCBzY2hlbWEuaW5kZXhlcywge30sIHNjaGVtYS5maWVsZHMsIHQpO1xuICAgICAgICByZXR1cm4gdG9QYXJzZVNjaGVtYShzY2hlbWEpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJiBlcnIuZGV0YWlsLmluY2x1ZGVzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLCBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gSnVzdCBjcmVhdGUgYSB0YWJsZSwgZG8gbm90IGluc2VydCBpbiBzY2hlbWFcbiAgYXN5bmMgY3JlYXRlVGFibGUoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogYW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGRlYnVnKCdjcmVhdGVUYWJsZScsIGNsYXNzTmFtZSwgc2NoZW1hKTtcbiAgICBjb25zdCB2YWx1ZXNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHBhdHRlcm5zQXJyYXkgPSBbXTtcbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3QuYXNzaWduKHt9LCBzY2hlbWEuZmllbGRzKTtcbiAgICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgZmllbGRzLl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2ZhaWxlZF9sb2dpbl9jb3VudCA9IHsgdHlwZTogJ051bWJlcicgfTtcbiAgICAgIGZpZWxkcy5fcGVyaXNoYWJsZV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2hpc3RvcnkgPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgICB9XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBjb25zdCByZWxhdGlvbnMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhmaWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGNvbnN0IHBhcnNlVHlwZSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgLy8gU2tpcCB3aGVuIGl0J3MgYSByZWxhdGlvblxuICAgICAgLy8gV2UnbGwgY3JlYXRlIHRoZSB0YWJsZXMgbGF0ZXJcbiAgICAgIGlmIChwYXJzZVR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZWxhdGlvbnMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgcGFyc2VUeXBlLmNvbnRlbnRzID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgfVxuICAgICAgdmFsdWVzQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaChwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZShwYXJzZVR5cGUpKTtcbiAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgJCR7aW5kZXh9Om5hbWUgJCR7aW5kZXggKyAxfTpyYXdgKTtcbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgcGF0dGVybnNBcnJheS5wdXNoKGBQUklNQVJZIEtFWSAoJCR7aW5kZXh9Om5hbWUpYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMjtcbiAgICB9KTtcbiAgICBjb25zdCBxcyA9IGBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkMTpuYW1lICgke3BhdHRlcm5zQXJyYXkuam9pbigpfSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLnZhbHVlc0FycmF5XTtcblxuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIHJldHVybiBjb25uLnRhc2soJ2NyZWF0ZS10YWJsZScsIGFzeW5jIHQgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgc2VsZi5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyh0KTtcbiAgICAgICAgYXdhaXQgdC5ub25lKHFzLCB2YWx1ZXMpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIEVMU0U6IFRhYmxlIGFscmVhZHkgZXhpc3RzLCBtdXN0IGhhdmUgYmVlbiBjcmVhdGVkIGJ5IGEgZGlmZmVyZW50IHJlcXVlc3QuIElnbm9yZSB0aGUgZXJyb3IuXG4gICAgICB9XG4gICAgICBhd2FpdCB0LnR4KCdjcmVhdGUtdGFibGUtdHgnLCB0eCA9PiB7XG4gICAgICAgIHJldHVybiB0eC5iYXRjaChcbiAgICAgICAgICByZWxhdGlvbnMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gdHgubm9uZShcbiAgICAgICAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQ8am9pblRhYmxlOm5hbWU+IChcInJlbGF0ZWRJZFwiIHZhckNoYXIoMTIwKSwgXCJvd25pbmdJZFwiIHZhckNoYXIoMTIwKSwgUFJJTUFSWSBLRVkoXCJyZWxhdGVkSWRcIiwgXCJvd25pbmdJZFwiKSApJyxcbiAgICAgICAgICAgICAgeyBqb2luVGFibGU6IGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNjaGVtYVVwZ3JhZGUoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogYW55KSB7XG4gICAgZGVidWcoJ3NjaGVtYVVwZ3JhZGUnLCB7IGNsYXNzTmFtZSwgc2NoZW1hIH0pO1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIGF3YWl0IGNvbm4udHgoJ3NjaGVtYS11cGdyYWRlJywgYXN5bmMgdCA9PiB7XG4gICAgICBjb25zdCBjb2x1bW5zID0gYXdhaXQgdC5tYXAoXG4gICAgICAgICdTRUxFQ1QgY29sdW1uX25hbWUgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucyBXSEVSRSB0YWJsZV9uYW1lID0gJDxjbGFzc05hbWU+JyxcbiAgICAgICAgeyBjbGFzc05hbWUgfSxcbiAgICAgICAgYSA9PiBhLmNvbHVtbl9uYW1lXG4gICAgICApO1xuICAgICAgY29uc3QgbmV3Q29sdW1ucyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiBjb2x1bW5zLmluZGV4T2YoaXRlbSkgPT09IC0xKVxuICAgICAgICAubWFwKGZpZWxkTmFtZSA9PlxuICAgICAgICAgIHNlbGYuYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLCB0KVxuICAgICAgICApO1xuXG4gICAgICBhd2FpdCB0LmJhdGNoKG5ld0NvbHVtbnMpO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSwgY29ubjogYW55KSB7XG4gICAgLy8gVE9ETzogTXVzdCBiZSByZXZpc2VkIGZvciBpbnZhbGlkIGxvZ2ljLi4uXG4gICAgZGVidWcoJ2FkZEZpZWxkSWZOb3RFeGlzdHMnLCB7IGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlIH0pO1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBhd2FpdCBjb25uLnR4KCdhZGQtZmllbGQtaWYtbm90LWV4aXN0cycsIGFzeW5jIHQgPT4ge1xuICAgICAgaWYgKHR5cGUudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAgICdBTFRFUiBUQUJMRSAkPGNsYXNzTmFtZTpuYW1lPiBBREQgQ09MVU1OIElGIE5PVCBFWElTVFMgJDxmaWVsZE5hbWU6bmFtZT4gJDxwb3N0Z3Jlc1R5cGU6cmF3PicsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgICBwb3N0Z3Jlc1R5cGU6IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHR5cGUpLFxuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgcmV0dXJuIHNlbGYuY3JlYXRlQ2xhc3MoY2xhc3NOYW1lLCB7IGZpZWxkczogeyBbZmllbGROYW1lXTogdHlwZSB9IH0sIHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIENvbHVtbiBhbHJlYWR5IGV4aXN0cywgY3JlYXRlZCBieSBvdGhlciByZXF1ZXN0LiBDYXJyeSBvbiB0byBzZWUgaWYgaXQncyB0aGUgcmlnaHQgdHlwZS5cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgeyBqb2luVGFibGU6IGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCB9XG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHQuYW55KFxuICAgICAgICAnU0VMRUNUIFwic2NoZW1hXCIgRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+IGFuZCAoXCJzY2hlbWFcIjo6anNvbi0+XFwnZmllbGRzXFwnLT4kPGZpZWxkTmFtZT4pIGlzIG5vdCBudWxsJyxcbiAgICAgICAgeyBjbGFzc05hbWUsIGZpZWxkTmFtZSB9XG4gICAgICApO1xuXG4gICAgICBpZiAocmVzdWx0WzBdKSB7XG4gICAgICAgIHRocm93ICdBdHRlbXB0ZWQgdG8gYWRkIGEgZmllbGQgdGhhdCBhbHJlYWR5IGV4aXN0cyc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBwYXRoID0gYHtmaWVsZHMsJHtmaWVsZE5hbWV9fWA7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICAgIHsgcGF0aCwgdHlwZSwgY2xhc3NOYW1lIH1cbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIERyb3BzIGEgY29sbGVjdGlvbi4gUmVzb2x2ZXMgd2l0aCB0cnVlIGlmIGl0IHdhcyBhIFBhcnNlIFNjaGVtYSAoZWcuIF9Vc2VyLCBDdXN0b20sIGV0Yy4pXG4gIC8vIGFuZCByZXNvbHZlcyB3aXRoIGZhbHNlIGlmIGl0IHdhc24ndCAoZWcuIGEgam9pbiB0YWJsZSkuIFJlamVjdHMgaWYgZGVsZXRpb24gd2FzIGltcG9zc2libGUuXG4gIGFzeW5jIGRlbGV0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgb3BlcmF0aW9ucyA9IFtcbiAgICAgIHsgcXVlcnk6IGBEUk9QIFRBQkxFIElGIEVYSVNUUyAkMTpuYW1lYCwgdmFsdWVzOiBbY2xhc3NOYW1lXSB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTogYERFTEVURSBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlczogW2NsYXNzTmFtZV0sXG4gICAgICB9LFxuICAgIF07XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLnR4KHQgPT4gdC5ub25lKHRoaXMuX3BncC5oZWxwZXJzLmNvbmNhdChvcGVyYXRpb25zKSkpXG4gICAgICAudGhlbigoKSA9PiBjbGFzc05hbWUuaW5kZXhPZignX0pvaW46JykgIT0gMCk7IC8vIHJlc29sdmVzIHdpdGggZmFsc2Ugd2hlbiBfSm9pbiB0YWJsZVxuICB9XG5cbiAgLy8gRGVsZXRlIGFsbCBkYXRhIGtub3duIHRvIHRoaXMgYWRhcHRlci4gVXNlZCBmb3IgdGVzdGluZy5cbiAgYXN5bmMgZGVsZXRlQWxsQ2xhc3NlcygpIHtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICBjb25zdCBoZWxwZXJzID0gdGhpcy5fcGdwLmhlbHBlcnM7XG4gICAgZGVidWcoJ2RlbGV0ZUFsbENsYXNzZXMnKTtcblxuICAgIGF3YWl0IHRoaXMuX2NsaWVudFxuICAgICAgLnRhc2soJ2RlbGV0ZS1hbGwtY2xhc3NlcycsIGFzeW5jIHQgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0LmFueSgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIicpO1xuICAgICAgICAgIGNvbnN0IGpvaW5zID0gcmVzdWx0cy5yZWR1Y2UoKGxpc3Q6IEFycmF5PHN0cmluZz4sIHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbGlzdC5jb25jYXQoam9pblRhYmxlc0ZvclNjaGVtYShzY2hlbWEuc2NoZW1hKSk7XG4gICAgICAgICAgfSwgW10pO1xuICAgICAgICAgIGNvbnN0IGNsYXNzZXMgPSBbXG4gICAgICAgICAgICAnX1NDSEVNQScsXG4gICAgICAgICAgICAnX1B1c2hTdGF0dXMnLFxuICAgICAgICAgICAgJ19Kb2JTdGF0dXMnLFxuICAgICAgICAgICAgJ19Kb2JTY2hlZHVsZScsXG4gICAgICAgICAgICAnX0hvb2tzJyxcbiAgICAgICAgICAgICdfR2xvYmFsQ29uZmlnJyxcbiAgICAgICAgICAgICdfR3JhcGhRTENvbmZpZycsXG4gICAgICAgICAgICAnX0F1ZGllbmNlJyxcbiAgICAgICAgICAgICdfSWRlbXBvdGVuY3knLFxuICAgICAgICAgICAgLi4ucmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5jbGFzc05hbWUpLFxuICAgICAgICAgICAgLi4uam9pbnMsXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdCBxdWVyaWVzID0gY2xhc3Nlcy5tYXAoY2xhc3NOYW1lID0+ICh7XG4gICAgICAgICAgICBxdWVyeTogJ0RST1AgVEFCTEUgSUYgRVhJU1RTICQ8Y2xhc3NOYW1lOm5hbWU+JyxcbiAgICAgICAgICAgIHZhbHVlczogeyBjbGFzc05hbWUgfSxcbiAgICAgICAgICB9KSk7XG4gICAgICAgICAgYXdhaXQgdC50eCh0eCA9PiB0eC5ub25lKGhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIE5vIF9TQ0hFTUEgY29sbGVjdGlvbi4gRG9uJ3QgZGVsZXRlIGFueXRoaW5nLlxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBkZWJ1ZyhgZGVsZXRlQWxsQ2xhc3NlcyBkb25lIGluICR7bmV3IERhdGUoKS5nZXRUaW1lKCkgLSBub3d9YCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZSB0aGUgY29sdW1uIGFuZCBhbGwgdGhlIGRhdGEuIEZvciBSZWxhdGlvbnMsIHRoZSBfSm9pbiBjb2xsZWN0aW9uIGlzIGhhbmRsZWRcbiAgLy8gc3BlY2lhbGx5LCB0aGlzIGZ1bmN0aW9uIGRvZXMgbm90IGRlbGV0ZSBfSm9pbiBjb2x1bW5zLiBJdCBzaG91bGQsIGhvd2V2ZXIsIGluZGljYXRlXG4gIC8vIHRoYXQgdGhlIHJlbGF0aW9uIGZpZWxkcyBkb2VzIG5vdCBleGlzdCBhbnltb3JlLiBJbiBtb25nbywgdGhpcyBtZWFucyByZW1vdmluZyBpdCBmcm9tXG4gIC8vIHRoZSBfU0NIRU1BIGNvbGxlY3Rpb24uICBUaGVyZSBzaG91bGQgYmUgbm8gYWN0dWFsIGRhdGEgaW4gdGhlIGNvbGxlY3Rpb24gdW5kZXIgdGhlIHNhbWUgbmFtZVxuICAvLyBhcyB0aGUgcmVsYXRpb24gY29sdW1uLCBzbyBpdCdzIGZpbmUgdG8gYXR0ZW1wdCB0byBkZWxldGUgaXQuIElmIHRoZSBmaWVsZHMgbGlzdGVkIHRvIGJlXG4gIC8vIGRlbGV0ZWQgZG8gbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gc3VjY2Vzc2Z1bGx5IGFueXdheXMuIENoZWNraW5nIGZvclxuICAvLyBhdHRlbXB0cyB0byBkZWxldGUgbm9uLWV4aXN0ZW50IGZpZWxkcyBpcyB0aGUgcmVzcG9uc2liaWxpdHkgb2YgUGFyc2UgU2VydmVyLlxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgbm90IG9ibGlnYXRlZCB0byBkZWxldGUgZmllbGRzIGF0b21pY2FsbHkuIEl0IGlzIGdpdmVuIHRoZSBmaWVsZFxuICAvLyBuYW1lcyBpbiBhIGxpc3Qgc28gdGhhdCBkYXRhYmFzZXMgdGhhdCBhcmUgY2FwYWJsZSBvZiBkZWxldGluZyBmaWVsZHMgYXRvbWljYWxseVxuICAvLyBtYXkgZG8gc28uXG5cbiAgLy8gUmV0dXJucyBhIFByb21pc2UuXG4gIGFzeW5jIGRlbGV0ZUZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGRlYnVnKCdkZWxldGVGaWVsZHMnLCBjbGFzc05hbWUsIGZpZWxkTmFtZXMpO1xuICAgIGZpZWxkTmFtZXMgPSBmaWVsZE5hbWVzLnJlZHVjZSgobGlzdDogQXJyYXk8c3RyaW5nPiwgZmllbGROYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgaWYgKGZpZWxkLnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgbGlzdC5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICB9XG4gICAgICBkZWxldGUgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuIGxpc3Q7XG4gICAgfSwgW10pO1xuXG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uZmllbGROYW1lc107XG4gICAgY29uc3QgY29sdW1ucyA9IGZpZWxkTmFtZXNcbiAgICAgIC5tYXAoKG5hbWUsIGlkeCkgPT4ge1xuICAgICAgICByZXR1cm4gYCQke2lkeCArIDJ9Om5hbWVgO1xuICAgICAgfSlcbiAgICAgIC5qb2luKCcsIERST1AgQ09MVU1OJyk7XG5cbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ2RlbGV0ZS1maWVsZHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGF3YWl0IHQubm9uZSgnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiID0gJDxzY2hlbWE+IFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIHNjaGVtYSxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgfSk7XG4gICAgICBpZiAodmFsdWVzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgYXdhaXQgdC5ub25lKGBBTFRFUiBUQUJMRSAkMTpuYW1lIERST1AgQ09MVU1OIElGIEVYSVNUUyAke2NvbHVtbnN9YCwgdmFsdWVzKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIGFsbCBzY2hlbWFzIGtub3duIHRvIHRoaXMgYWRhcHRlciwgaW4gUGFyc2UgZm9ybWF0LiBJbiBjYXNlIHRoZVxuICAvLyBzY2hlbWFzIGNhbm5vdCBiZSByZXRyaWV2ZWQsIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVqZWN0cy4gUmVxdWlyZW1lbnRzIGZvciB0aGVcbiAgLy8gcmVqZWN0aW9uIHJlYXNvbiBhcmUgVEJELlxuICBhc3luYyBnZXRBbGxDbGFzc2VzKCkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQudGFzaygnZ2V0LWFsbC1jbGFzc2VzJywgYXN5bmMgdCA9PiB7XG4gICAgICBhd2FpdCBzZWxmLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKHQpO1xuICAgICAgcmV0dXJuIGF3YWl0IHQubWFwKCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJywgbnVsbCwgcm93ID0+XG4gICAgICAgIHRvUGFyc2VTY2hlbWEoeyBjbGFzc05hbWU6IHJvdy5jbGFzc05hbWUsIC4uLnJvdy5zY2hlbWEgfSlcbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciB0aGUgc2NoZW1hIHdpdGggdGhlIGdpdmVuIG5hbWUsIGluIFBhcnNlIGZvcm1hdC4gSWZcbiAgLy8gdGhpcyBhZGFwdGVyIGRvZXNuJ3Qga25vdyBhYm91dCB0aGUgc2NoZW1hLCByZXR1cm4gYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aXRoXG4gIC8vIHVuZGVmaW5lZCBhcyB0aGUgcmVhc29uLlxuICBhc3luYyBnZXRDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGRlYnVnKCdnZXRDbGFzcycsIGNsYXNzTmFtZSk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueSgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+Jywge1xuICAgICAgICBjbGFzc05hbWUsXG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdC5sZW5ndGggIT09IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFswXS5zY2hlbWE7XG4gICAgICB9KVxuICAgICAgLnRoZW4odG9QYXJzZVNjaGVtYSk7XG4gIH1cblxuICAvLyBUT0RPOiByZW1vdmUgdGhlIG1vbmdvIGZvcm1hdCBkZXBlbmRlbmN5IGluIHRoZSByZXR1cm4gdmFsdWVcbiAgYXN5bmMgY3JlYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnY3JlYXRlT2JqZWN0JywgY2xhc3NOYW1lLCBvYmplY3QpO1xuICAgIGxldCBjb2x1bW5zQXJyYXkgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXNBcnJheSA9IFtdO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBnZW9Qb2ludHMgPSB7fTtcblxuICAgIG9iamVjdCA9IGhhbmRsZURvdEZpZWxkcyhvYmplY3QpO1xuXG4gICAgdmFsaWRhdGVLZXlzKG9iamVjdCk7XG5cbiAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB2YXIgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddID0gb2JqZWN0WydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZmllbGROYW1lID0gJ2F1dGhEYXRhJztcbiAgICAgIH1cblxuICAgICAgY29sdW1uc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2VtYWlsX3ZlcmlmeV90b2tlbicgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZmFpbGVkX2xvZ2luX2NvdW50JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wYXNzd29yZF9oaXN0b3J5J1xuICAgICAgICApIHtcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wYXNzd29yZF9jaGFuZ2VkX2F0J1xuICAgICAgICApIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc3dpdGNoIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSkge1xuICAgICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0ub2JqZWN0SWQpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBcnJheSc6XG4gICAgICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChKU09OLnN0cmluZ2lmeShvYmplY3RbZmllbGROYW1lXSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgICBjYXNlICdOdW1iZXInOlxuICAgICAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5uYW1lKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9seWdvbic6IHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwob2JqZWN0W2ZpZWxkTmFtZV0uY29vcmRpbmF0ZXMpO1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2godmFsdWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgICAgICAvLyBwb3AgdGhlIHBvaW50IGFuZCBwcm9jZXNzIGxhdGVyXG4gICAgICAgICAgZ2VvUG9pbnRzW2ZpZWxkTmFtZV0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgICBjb2x1bW5zQXJyYXkucG9wKCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgYFR5cGUgJHtzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZX0gbm90IHN1cHBvcnRlZCB5ZXRgO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29sdW1uc0FycmF5ID0gY29sdW1uc0FycmF5LmNvbmNhdChPYmplY3Qua2V5cyhnZW9Qb2ludHMpKTtcbiAgICBjb25zdCBpbml0aWFsVmFsdWVzID0gdmFsdWVzQXJyYXkubWFwKCh2YWwsIGluZGV4KSA9PiB7XG4gICAgICBsZXQgdGVybWluYXRpb24gPSAnJztcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGNvbHVtbnNBcnJheVtpbmRleF07XG4gICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgdGVybWluYXRpb24gPSAnOjp0ZXh0W10nO1xuICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgdGVybWluYXRpb24gPSAnOjpqc29uYic7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCQke2luZGV4ICsgMiArIGNvbHVtbnNBcnJheS5sZW5ndGh9JHt0ZXJtaW5hdGlvbn1gO1xuICAgIH0pO1xuICAgIGNvbnN0IGdlb1BvaW50c0luamVjdHMgPSBPYmplY3Qua2V5cyhnZW9Qb2ludHMpLm1hcChrZXkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBnZW9Qb2ludHNba2V5XTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2godmFsdWUubG9uZ2l0dWRlLCB2YWx1ZS5sYXRpdHVkZSk7XG4gICAgICBjb25zdCBsID0gdmFsdWVzQXJyYXkubGVuZ3RoICsgY29sdW1uc0FycmF5Lmxlbmd0aDtcbiAgICAgIHJldHVybiBgUE9JTlQoJCR7bH0sICQke2wgKyAxfSlgO1xuICAgIH0pO1xuXG4gICAgY29uc3QgY29sdW1uc1BhdHRlcm4gPSBjb2x1bW5zQXJyYXkubWFwKChjb2wsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAyfTpuYW1lYCkuam9pbigpO1xuICAgIGNvbnN0IHZhbHVlc1BhdHRlcm4gPSBpbml0aWFsVmFsdWVzLmNvbmNhdChnZW9Qb2ludHNJbmplY3RzKS5qb2luKCk7XG5cbiAgICBjb25zdCBxcyA9IGBJTlNFUlQgSU5UTyAkMTpuYW1lICgke2NvbHVtbnNQYXR0ZXJufSkgVkFMVUVTICgke3ZhbHVlc1BhdHRlcm59KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uY29sdW1uc0FycmF5LCAuLi52YWx1ZXNBcnJheV07XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpXG4gICAgICAubm9uZShxcywgdmFsdWVzKVxuICAgICAgLnRoZW4oKCkgPT4gKHsgb3BzOiBbb2JqZWN0XSB9KSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICAgIGVyci51bmRlcmx5aW5nRXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICBpZiAoZXJyb3IuY29uc3RyYWludCkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLmNvbnN0cmFpbnQubWF0Y2goL3VuaXF1ZV8oW2EtekEtWl0rKS8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMgJiYgQXJyYXkuaXNBcnJheShtYXRjaGVzKSkge1xuICAgICAgICAgICAgICBlcnIudXNlckluZm8gPSB7IGR1cGxpY2F0ZWRfZmllbGQ6IG1hdGNoZXNbMV0gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgZXJyb3IgPSBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICAvLyBJZiBubyBvYmplY3RzIG1hdGNoLCByZWplY3Qgd2l0aCBPQkpFQ1RfTk9UX0ZPVU5ELiBJZiBvYmplY3RzIGFyZSBmb3VuZCBhbmQgZGVsZXRlZCwgcmVzb2x2ZSB3aXRoIHVuZGVmaW5lZC5cbiAgLy8gSWYgdGhlcmUgaXMgc29tZSBvdGhlciBlcnJvciwgcmVqZWN0IHdpdGggSU5URVJOQUxfU0VSVkVSX0VSUk9SLlxuICBhc3luYyBkZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnZGVsZXRlT2JqZWN0c0J5UXVlcnknLCBjbGFzc05hbWUsIHF1ZXJ5KTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCBpbmRleCA9IDI7XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIGluZGV4LFxuICAgICAgcXVlcnksXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG4gICAgaWYgKE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT09IDApIHtcbiAgICAgIHdoZXJlLnBhdHRlcm4gPSAnVFJVRSc7XG4gICAgfVxuICAgIGNvbnN0IHFzID0gYFdJVEggZGVsZXRlZCBBUyAoREVMRVRFIEZST00gJDE6bmFtZSBXSEVSRSAke3doZXJlLnBhdHRlcm59IFJFVFVSTklORyAqKSBTRUxFQ1QgY291bnQoKikgRlJPTSBkZWxldGVkYDtcbiAgICBkZWJ1ZyhxcywgdmFsdWVzKTtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udCA6IHRoaXMuX2NsaWVudClcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiArYS5jb3VudClcbiAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgaWYgKGNvdW50ID09PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBjb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBEb24ndCBkZWxldGUgYW55dGhpbmcgaWYgZG9lc24ndCBleGlzdFxuICAgICAgfSk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuICAvLyBSZXR1cm4gdmFsdWUgbm90IGN1cnJlbnRseSB3ZWxsIHNwZWNpZmllZC5cbiAgYXN5bmMgZmluZE9uZUFuZFVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGRlYnVnKCdmaW5kT25lQW5kVXBkYXRlJywgY2xhc3NOYW1lLCBxdWVyeSwgdXBkYXRlKTtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVPYmplY3RzQnlRdWVyeShjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHVwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oXG4gICAgICB2YWwgPT4gdmFsWzBdXG4gICAgKTtcbiAgfVxuXG4gIC8vIEFwcGx5IHRoZSB1cGRhdGUgdG8gYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIGFzeW5jIHVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICk6IFByb21pc2U8W2FueV0+IHtcbiAgICBkZWJ1ZygndXBkYXRlT2JqZWN0c0J5UXVlcnknLCBjbGFzc05hbWUsIHF1ZXJ5LCB1cGRhdGUpO1xuICAgIGNvbnN0IHVwZGF0ZVBhdHRlcm5zID0gW107XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG5cbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHsgLi4udXBkYXRlIH07XG5cbiAgICAvLyBTZXQgZmxhZyBmb3IgZG90IG5vdGF0aW9uIGZpZWxkc1xuICAgIGNvbnN0IGRvdE5vdGF0aW9uT3B0aW9ucyA9IHt9O1xuICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgICBkb3ROb3RhdGlvbk9wdGlvbnNbZmlyc3RdID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaWVsZE5hbWVdID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdXBkYXRlID0gaGFuZGxlRG90RmllbGRzKHVwZGF0ZSk7XG4gICAgLy8gUmVzb2x2ZSBhdXRoRGF0YSBmaXJzdCxcbiAgICAvLyBTbyB3ZSBkb24ndCBlbmQgdXAgd2l0aCBtdWx0aXBsZSBrZXkgdXBkYXRlc1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICB1cGRhdGVbJ2F1dGhEYXRhJ10gPSB1cGRhdGVbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB1cGRhdGUpIHtcbiAgICAgIGNvbnN0IGZpZWxkVmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIC8vIERyb3AgYW55IHVuZGVmaW5lZCB2YWx1ZXMuXG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRlbGV0ZSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09ICdhdXRoRGF0YScpIHtcbiAgICAgICAgLy8gVGhpcyByZWN1cnNpdmVseSBzZXRzIHRoZSBqc29uX29iamVjdFxuICAgICAgICAvLyBPbmx5IDEgbGV2ZWwgZGVlcFxuICAgICAgICBjb25zdCBnZW5lcmF0ZSA9IChqc29uYjogc3RyaW5nLCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBganNvbl9vYmplY3Rfc2V0X2tleShDT0FMRVNDRSgke2pzb25ifSwgJ3t9Jzo6anNvbmIpLCAke2tleX0sICR7dmFsdWV9KTo6anNvbmJgO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBsYXN0S2V5ID0gYCQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgY29uc3QgZmllbGROYW1lSW5kZXggPSBpbmRleDtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgY29uc3QgdXBkYXRlID0gT2JqZWN0LmtleXMoZmllbGRWYWx1ZSkucmVkdWNlKChsYXN0S2V5OiBzdHJpbmcsIGtleTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc3RyID0gZ2VuZXJhdGUobGFzdEtleSwgYCQke2luZGV4fTo6dGV4dGAsIGAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgbGV0IHZhbHVlID0gZmllbGRWYWx1ZVtrZXldO1xuICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YWx1ZXMucHVzaChrZXksIHZhbHVlKTtcbiAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9LCBsYXN0S2V5KTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7ZmllbGROYW1lSW5kZXh9Om5hbWUgPSAke3VwZGF0ZX1gKTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnSW5jcmVtZW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAwKSArICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmFtb3VudCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGQoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIG51bGwpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdSZW1vdmUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfcmVtb3ZlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke1xuICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGRVbmlxdWUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkX3VuaXF1ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICAvL1RPRE86IHN0b3Agc3BlY2lhbCBjYXNpbmcgdGhpcy4gSXQgc2hvdWxkIGNoZWNrIGZvciBfX3R5cGUgPT09ICdEYXRlJyBhbmQgdXNlIC5pc29cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAvLyBub29wXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdPYmplY3QnXG4gICAgICApIHtcbiAgICAgICAgLy8gR2F0aGVyIGtleXMgdG8gaW5jcmVtZW50XG4gICAgICAgIGNvbnN0IGtleXNUb0luY3JlbWVudCA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldFxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IE9iamVjdC5rZXlzIGlzIGl0ZXJhdGluZyBvdmVyIHRoZSAqKm9yaWdpbmFsKiogdXBkYXRlIG9iamVjdFxuICAgICAgICAgICAgLy8gYW5kIHRoYXQgc29tZSBvZiB0aGUga2V5cyBvZiB0aGUgb3JpZ2luYWwgdXBkYXRlIGNvdWxkIGJlIG51bGwgb3IgdW5kZWZpbmVkOlxuICAgICAgICAgICAgLy8gKFNlZSB0aGUgYWJvdmUgY2hlY2sgYGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IHR5cGVvZiBmaWVsZFZhbHVlID09IFwidW5kZWZpbmVkXCIpYClcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnSW5jcmVtZW50JyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgbGV0IGluY3JlbWVudFBhdHRlcm5zID0gJyc7XG4gICAgICAgIGlmIChrZXlzVG9JbmNyZW1lbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGluY3JlbWVudFBhdHRlcm5zID1cbiAgICAgICAgICAgICcgfHwgJyArXG4gICAgICAgICAgICBrZXlzVG9JbmNyZW1lbnRcbiAgICAgICAgICAgICAgLm1hcChjID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhbW91bnQgPSBmaWVsZFZhbHVlW2NdLmFtb3VudDtcbiAgICAgICAgICAgICAgICByZXR1cm4gYENPTkNBVCgne1wiJHtjfVwiOicsIENPQUxFU0NFKCQke2luZGV4fTpuYW1lLT4+JyR7Y30nLCcwJyk6OmludCArICR7YW1vdW50fSwgJ30nKTo6anNvbmJgO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAuam9pbignIHx8ICcpO1xuICAgICAgICAgIC8vIFN0cmlwIHRoZSBrZXlzXG4gICAgICAgICAga2V5c1RvSW5jcmVtZW50LmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICAgIGRlbGV0ZSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBrZXlzVG9EZWxldGU6IEFycmF5PHN0cmluZz4gPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKGsgPT4ge1xuICAgICAgICAgICAgLy8gY2hvb3NlIHRvcCBsZXZlbCBmaWVsZHMgdGhhdCBoYXZlIGEgZGVsZXRlIG9wZXJhdGlvbiBzZXQuXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsVXBkYXRlW2tdO1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgICAgICAgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJylbMF0gPT09IGZpZWxkTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoayA9PiBrLnNwbGl0KCcuJylbMV0pO1xuXG4gICAgICAgIGNvbnN0IGRlbGV0ZVBhdHRlcm5zID0ga2V5c1RvRGVsZXRlLnJlZHVjZSgocDogc3RyaW5nLCBjOiBzdHJpbmcsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIHJldHVybiBwICsgYCAtICckJHtpbmRleCArIDEgKyBpfTp2YWx1ZSdgO1xuICAgICAgICB9LCAnJyk7XG4gICAgICAgIC8vIE92ZXJyaWRlIE9iamVjdFxuICAgICAgICBsZXQgdXBkYXRlT2JqZWN0ID0gXCIne30nOjpqc29uYlwiO1xuXG4gICAgICAgIGlmIChkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSkge1xuICAgICAgICAgIC8vIE1lcmdlIE9iamVjdFxuICAgICAgICAgIHVwZGF0ZU9iamVjdCA9IGBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ3t9Jzo6anNvbmIpYDtcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9ICgke3VwZGF0ZU9iamVjdH0gJHtkZWxldGVQYXR0ZXJuc30gJHtpbmNyZW1lbnRQYXR0ZXJuc30gfHwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDEgKyBrZXlzVG9EZWxldGUubGVuZ3RoXG4gICAgICAgICAgfTo6anNvbmIgKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCAuLi5rZXlzVG9EZWxldGUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMiArIGtleXNUb0RlbGV0ZS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUpICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5J1xuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSk7XG4gICAgICAgIGlmIChleHBlY3RlZFR5cGUgPT09ICd0ZXh0W10nKSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojp0ZXh0W11gKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdOb3Qgc3VwcG9ydGVkIHVwZGF0ZScsIGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB1cGRhdGUgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX0geWV0YFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlQ2xhdXNlID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgcXMgPSBgVVBEQVRFICQxOm5hbWUgU0VUICR7dXBkYXRlUGF0dGVybnMuam9pbigpfSAke3doZXJlQ2xhdXNlfSBSRVRVUk5JTkcgKmA7XG4gICAgZGVidWcoJ3VwZGF0ZTogJywgcXMsIHZhbHVlcyk7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpLmFueShxcywgdmFsdWVzKTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gSG9wZWZ1bGx5LCB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGlzLiBJdCdzIG9ubHkgdXNlZCBmb3IgY29uZmlnIGFuZCBob29rcy5cbiAgdXBzZXJ0T25lT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCd1cHNlcnRPbmVPYmplY3QnLCB7IGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSB9KTtcbiAgICBjb25zdCBjcmVhdGVWYWx1ZSA9IE9iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCB1cGRhdGUpO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZU9iamVjdChjbGFzc05hbWUsIHNjaGVtYSwgY3JlYXRlVmFsdWUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAvLyBpZ25vcmUgZHVwbGljYXRlIHZhbHVlIGVycm9ycyBhcyBpdCdzIHVwc2VydFxuICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLmZpbmRPbmVBbmRVcGRhdGUoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB1cGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgeyBza2lwLCBsaW1pdCwgc29ydCwga2V5cywgY2FzZUluc2Vuc2l0aXZlLCBleHBsYWluIH06IFF1ZXJ5T3B0aW9uc1xuICApIHtcbiAgICBkZWJ1ZygnZmluZCcsIGNsYXNzTmFtZSwgcXVlcnksIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIHNvcnQsXG4gICAgICBrZXlzLFxuICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgZXhwbGFpbixcbiAgICB9KTtcbiAgICBjb25zdCBoYXNMaW1pdCA9IGxpbWl0ICE9PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgaGFzU2tpcCA9IHNraXAgIT09IHVuZGVmaW5lZDtcbiAgICBsZXQgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDIsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IGxpbWl0UGF0dGVybiA9IGhhc0xpbWl0ID8gYExJTUlUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzTGltaXQpIHtcbiAgICAgIHZhbHVlcy5wdXNoKGxpbWl0KTtcbiAgICB9XG4gICAgY29uc3Qgc2tpcFBhdHRlcm4gPSBoYXNTa2lwID8gYE9GRlNFVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc1NraXApIHtcbiAgICAgIHZhbHVlcy5wdXNoKHNraXApO1xuICAgIH1cblxuICAgIGxldCBzb3J0UGF0dGVybiA9ICcnO1xuICAgIGlmIChzb3J0KSB7XG4gICAgICBjb25zdCBzb3J0Q29weTogYW55ID0gc29ydDtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBPYmplY3Qua2V5cyhzb3J0KVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgY29uc3QgdHJhbnNmb3JtS2V5ID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoa2V5KS5qb2luKCctPicpO1xuICAgICAgICAgIC8vIFVzaW5nICRpZHggcGF0dGVybiBnaXZlczogIG5vbi1pbnRlZ2VyIGNvbnN0YW50IGluIE9SREVSIEJZXG4gICAgICAgICAgaWYgKHNvcnRDb3B5W2tleV0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IEFTQ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IERFU0NgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgc29ydFBhdHRlcm4gPSBzb3J0ICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LmtleXMoc29ydCkubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgIH1cbiAgICBpZiAod2hlcmUuc29ydHMgJiYgT2JqZWN0LmtleXMoKHdoZXJlLnNvcnRzOiBhbnkpKS5sZW5ndGggPiAwKSB7XG4gICAgICBzb3J0UGF0dGVybiA9IGBPUkRFUiBCWSAke3doZXJlLnNvcnRzLmpvaW4oKX1gO1xuICAgIH1cblxuICAgIGxldCBjb2x1bW5zID0gJyonO1xuICAgIGlmIChrZXlzKSB7XG4gICAgICAvLyBFeGNsdWRlIGVtcHR5IGtleXNcbiAgICAgIC8vIFJlcGxhY2UgQUNMIGJ5IGl0J3Mga2V5c1xuICAgICAga2V5cyA9IGtleXMucmVkdWNlKChtZW1vLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgICBtZW1vLnB1c2goJ19ycGVybScpO1xuICAgICAgICAgIG1lbW8ucHVzaCgnX3dwZXJtJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoa2V5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBtZW1vLnB1c2goa2V5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sIFtdKTtcbiAgICAgIGNvbHVtbnMgPSBrZXlzXG4gICAgICAgIC5tYXAoKGtleSwgaW5kZXgpID0+IHtcbiAgICAgICAgICBpZiAoa2V5ID09PSAnJHNjb3JlJykge1xuICAgICAgICAgICAgcmV0dXJuIGB0c19yYW5rX2NkKHRvX3RzdmVjdG9yKCQkezJ9LCAkJHszfTpuYW1lKSwgdG9fdHNxdWVyeSgkJHs0fSwgJCR7NX0pLCAzMikgYXMgc2NvcmVgO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCQke2luZGV4ICsgdmFsdWVzLmxlbmd0aCArIDF9Om5hbWVgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgdmFsdWVzID0gdmFsdWVzLmNvbmNhdChrZXlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnN9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtzb3J0UGF0dGVybn0gJHtsaW1pdFBhdHRlcm59ICR7c2tpcFBhdHRlcm59YDtcbiAgICBjb25zdCBxcyA9IGV4cGxhaW4gPyB0aGlzLmNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkob3JpZ2luYWxRdWVyeSkgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFF1ZXJ5IG9uIG5vbiBleGlzdGluZyB0YWJsZSwgZG9uJ3QgY3Jhc2hcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydHMgZnJvbSBhIHBvc3RncmVzLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4gIC8vIERvZXMgbm90IHN0cmlwIG91dCBhbnl0aGluZyBiYXNlZCBvbiBhIGxhY2sgb2YgYXV0aGVudGljYXRpb24uXG4gIHBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHNjaGVtYTogYW55KSB7XG4gICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicgJiYgb2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgbGF0aXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLnksXG4gICAgICAgICAgbG9uZ2l0dWRlOiBvYmplY3RbZmllbGROYW1lXS54LFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgbGV0IGNvb3JkcyA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBjb29yZHMgPSBjb29yZHMuc3Vic3RyKDIsIGNvb3Jkcy5sZW5ndGggLSA0KS5zcGxpdCgnKSwoJyk7XG4gICAgICAgIGNvb3JkcyA9IGNvb3Jkcy5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgIHJldHVybiBbcGFyc2VGbG9hdChwb2ludC5zcGxpdCgnLCcpWzFdKSwgcGFyc2VGbG9hdChwb2ludC5zcGxpdCgnLCcpWzBdKV07XG4gICAgICAgIH0pO1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdQb2x5Z29uJyxcbiAgICAgICAgICBjb29yZGluYXRlczogY29vcmRzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnRmlsZScpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICAgICAgbmFtZTogb2JqZWN0W2ZpZWxkTmFtZV0sXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgLy9UT0RPOiByZW1vdmUgdGhpcyByZWxpYW5jZSBvbiB0aGUgbW9uZ28gZm9ybWF0LiBEQiBhZGFwdGVyIHNob3VsZG4ndCBrbm93IHRoZXJlIGlzIGEgZGlmZmVyZW5jZSBiZXR3ZWVuIGNyZWF0ZWQgYXQgYW5kIGFueSBvdGhlciBkYXRlIGZpZWxkLlxuICAgIGlmIChvYmplY3QuY3JlYXRlZEF0KSB7XG4gICAgICBvYmplY3QuY3JlYXRlZEF0ID0gb2JqZWN0LmNyZWF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LnVwZGF0ZWRBdCkge1xuICAgICAgb2JqZWN0LnVwZGF0ZWRBdCA9IG9iamVjdC51cGRhdGVkQXQudG9JU09TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5leHBpcmVzQXQpIHtcbiAgICAgIG9iamVjdC5leHBpcmVzQXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5leHBpcmVzQXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQpIHtcbiAgICAgIG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSBudWxsKSB7XG4gICAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgICAgaXNvOiBvYmplY3RbZmllbGROYW1lXS50b0lTT1N0cmluZygpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICAvLyBDcmVhdGUgYSB1bmlxdWUgaW5kZXguIFVuaXF1ZSBpbmRleGVzIG9uIG51bGxhYmxlIGZpZWxkcyBhcmUgbm90IGFsbG93ZWQuIFNpbmNlIHdlIGRvbid0XG4gIC8vIGN1cnJlbnRseSBrbm93IHdoaWNoIGZpZWxkcyBhcmUgbnVsbGFibGUgYW5kIHdoaWNoIGFyZW4ndCwgd2UgaWdub3JlIHRoYXQgY3JpdGVyaWEuXG4gIC8vIEFzIHN1Y2gsIHdlIHNob3VsZG4ndCBleHBvc2UgdGhpcyBmdW5jdGlvbiB0byB1c2VycyBvZiBwYXJzZSB1bnRpbCB3ZSBoYXZlIGFuIG91dC1vZi1iYW5kXG4gIC8vIFdheSBvZiBkZXRlcm1pbmluZyBpZiBhIGZpZWxkIGlzIG51bGxhYmxlLiBVbmRlZmluZWQgZG9lc24ndCBjb3VudCBhZ2FpbnN0IHVuaXF1ZW5lc3MsXG4gIC8vIHdoaWNoIGlzIHdoeSB3ZSB1c2Ugc3BhcnNlIGluZGV4ZXMuXG4gIGFzeW5jIGVuc3VyZVVuaXF1ZW5lc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pIHtcbiAgICBjb25zdCBjb25zdHJhaW50TmFtZSA9IGAke2NsYXNzTmFtZX1fdW5pcXVlXyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgY29uc3RyYWludFBhdHRlcm5zID0gZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSwgaW5kZXgpID0+IGAkJHtpbmRleCArIDN9Om5hbWVgKTtcbiAgICBjb25zdCBxcyA9IGBDUkVBVEUgVU5JUVVFIElOREVYIElGIE5PVCBFWElTVFMgJDI6bmFtZSBPTiAkMTpuYW1lKCR7Y29uc3RyYWludFBhdHRlcm5zLmpvaW4oKX0pYDtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50Lm5vbmUocXMsIFtjbGFzc05hbWUsIGNvbnN0cmFpbnROYW1lLCAuLi5maWVsZE5hbWVzXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGNvbnN0cmFpbnROYW1lKSkge1xuICAgICAgICAvLyBJbmRleCBhbHJlYWR5IGV4aXN0cy4gSWdub3JlIGVycm9yLlxuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yICYmXG4gICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gQ2FzdCB0aGUgZXJyb3IgaW50byB0aGUgcHJvcGVyIHBhcnNlIGVycm9yXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgY291bnQuXG4gIGFzeW5jIGNvdW50KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHJlYWRQcmVmZXJlbmNlPzogc3RyaW5nLFxuICAgIGVzdGltYXRlPzogYm9vbGVhbiA9IHRydWVcbiAgKSB7XG4gICAgZGVidWcoJ2NvdW50JywgY2xhc3NOYW1lLCBxdWVyeSwgcmVhZFByZWZlcmVuY2UsIGVzdGltYXRlKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGxldCBxcyA9ICcnO1xuXG4gICAgaWYgKHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCB8fCAhZXN0aW1hdGUpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBjb3VudCgqKSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9IGVsc2Uge1xuICAgICAgcXMgPSAnU0VMRUNUIHJlbHR1cGxlcyBBUyBhcHByb3hpbWF0ZV9yb3dfY291bnQgRlJPTSBwZ19jbGFzcyBXSEVSRSByZWxuYW1lID0gJDEnO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiB7XG4gICAgICAgIGlmIChhLmFwcHJveGltYXRlX3Jvd19jb3VudCAhPSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuICthLmFwcHJveGltYXRlX3Jvd19jb3VudDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gK2EuY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGRpc3RpbmN0KGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIHF1ZXJ5OiBRdWVyeVR5cGUsIGZpZWxkTmFtZTogc3RyaW5nKSB7XG4gICAgZGVidWcoJ2Rpc3RpbmN0JywgY2xhc3NOYW1lLCBxdWVyeSk7XG4gICAgbGV0IGZpZWxkID0gZmllbGROYW1lO1xuICAgIGxldCBjb2x1bW4gPSBmaWVsZE5hbWU7XG4gICAgY29uc3QgaXNOZXN0ZWQgPSBmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDA7XG4gICAgaWYgKGlzTmVzdGVkKSB7XG4gICAgICBmaWVsZCA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGZpZWxkTmFtZSkuam9pbignLT4nKTtcbiAgICAgIGNvbHVtbiA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xuICAgIH1cbiAgICBjb25zdCBpc0FycmF5RmllbGQgPVxuICAgICAgc2NoZW1hLmZpZWxkcyAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSc7XG4gICAgY29uc3QgaXNQb2ludGVyRmllbGQgPVxuICAgICAgc2NoZW1hLmZpZWxkcyAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJztcbiAgICBjb25zdCB2YWx1ZXMgPSBbZmllbGQsIGNvbHVtbiwgY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogNCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gaXNBcnJheUZpZWxkID8gJ2pzb25iX2FycmF5X2VsZW1lbnRzJyA6ICdPTic7XG4gICAgbGV0IHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpuYW1lKSAkMjpuYW1lIEZST00gJDM6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIGlmIChpc05lc3RlZCkge1xuICAgICAgcXMgPSBgU0VMRUNUIERJU1RJTkNUICR7dHJhbnNmb3JtZXJ9KCQxOnJhdykgJDI6cmF3IEZST00gJDM6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIH1cbiAgICBkZWJ1ZyhxcywgdmFsdWVzKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KHFzLCB2YWx1ZXMpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmICghaXNOZXN0ZWQpIHtcbiAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIob2JqZWN0ID0+IG9iamVjdFtmaWVsZF0gIT09IG51bGwpO1xuICAgICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgICByZXR1cm4gb2JqZWN0W2ZpZWxkXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZF0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNoaWxkID0gZmllbGROYW1lLnNwbGl0KCcuJylbMV07XG4gICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4gb2JqZWN0W2NvbHVtbl1bY2hpbGRdKTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+XG4gICAgICAgIHJlc3VsdHMubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSlcbiAgICAgICk7XG4gIH1cblxuICBhc3luYyBhZ2dyZWdhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBhbnksXG4gICAgcGlwZWxpbmU6IGFueSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBoaW50OiA/bWl4ZWQsXG4gICAgZXhwbGFpbj86IGJvb2xlYW5cbiAgKSB7XG4gICAgZGVidWcoJ2FnZ3JlZ2F0ZScsIGNsYXNzTmFtZSwgcGlwZWxpbmUsIHJlYWRQcmVmZXJlbmNlLCBoaW50LCBleHBsYWluKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXg6IG51bWJlciA9IDI7XG4gICAgbGV0IGNvbHVtbnM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGNvdW50RmllbGQgPSBudWxsO1xuICAgIGxldCBncm91cFZhbHVlcyA9IG51bGw7XG4gICAgbGV0IHdoZXJlUGF0dGVybiA9ICcnO1xuICAgIGxldCBsaW1pdFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc2tpcFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBsZXQgZ3JvdXBQYXR0ZXJuID0gJyc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaXBlbGluZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3Qgc3RhZ2UgPSBwaXBlbGluZVtpXTtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRncm91cFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUgIT09ICcnKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTIFwib2JqZWN0SWRcImApO1xuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ19pZCcgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiBPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICBncm91cFZhbHVlcyA9IHZhbHVlO1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBCeUZpZWxkcyA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBhbGlhcyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2FsaWFzXSA9PT0gJ3N0cmluZycgJiYgdmFsdWVbYWxpYXNdKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gdHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWVbYWxpYXNdKTtcbiAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgZ3JvdXBCeUZpZWxkcy5wdXNoKGBcIiR7c291cmNlfVwiYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHNvdXJjZSwgYWxpYXMpO1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWUgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcGVyYXRpb24gPSBPYmplY3Qua2V5cyh2YWx1ZVthbGlhc10pWzBdO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXVtvcGVyYXRpb25dKTtcbiAgICAgICAgICAgICAgICBpZiAobW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl0pIHtcbiAgICAgICAgICAgICAgICAgIGlmICghZ3JvdXBCeUZpZWxkcy5pbmNsdWRlcyhgXCIke3NvdXJjZX1cImApKSB7XG4gICAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICBgRVhUUkFDVCgke1xuICAgICAgICAgICAgICAgICAgICAgIG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dXG4gICAgICAgICAgICAgICAgICAgIH0gRlJPTSAkJHtpbmRleH06bmFtZSBBVCBUSU1FIFpPTkUgJ1VUQycpIEFTICQke2luZGV4ICsgMX06bmFtZWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9OnJhd2A7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChncm91cEJ5RmllbGRzLmpvaW4oKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuJHN1bSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlLiRzdW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBTVU0oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRzdW0pLCBmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb3VudEZpZWxkID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBDT1VOVCgqKSBBUyAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1heCkge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1BWCgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtYXgpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1pbikge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1JTigkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtaW4pLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJGF2Zykge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYEFWRygkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRhdmcpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2x1bW5zLnB1c2goJyonKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICBpZiAoY29sdW1ucy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgY29sdW1ucyA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRwcm9qZWN0W2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IDEgfHwgdmFsdWUgPT09IHRydWUpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5zID0gW107XG4gICAgICAgIGNvbnN0IG9yT3JBbmQgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2UuJG1hdGNoLCAnJG9yJylcbiAgICAgICAgICA/ICcgT1IgJ1xuICAgICAgICAgIDogJyBBTkQgJztcblxuICAgICAgICBpZiAoc3RhZ2UuJG1hdGNoLiRvcikge1xuICAgICAgICAgIGNvbnN0IGNvbGxhcHNlID0ge307XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLiRvci5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZWxlbWVudCkge1xuICAgICAgICAgICAgICBjb2xsYXBzZVtrZXldID0gZWxlbWVudFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHN0YWdlLiRtYXRjaCA9IGNvbGxhcHNlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kbWF0Y2hbZmllbGRdO1xuICAgICAgICAgIGNvbnN0IG1hdGNoUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgICAgICAgIGlmICh2YWx1ZVtjbXBdKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICAgICAgICBtYXRjaFBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkLCB0b1Bvc3RncmVzVmFsdWUodmFsdWVbY21wXSkpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGlmIChtYXRjaFBhdHRlcm5zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgke21hdGNoUGF0dGVybnMuam9pbignIEFORCAnKX0pYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIG1hdGNoUGF0dGVybnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkLCB2YWx1ZSk7XG4gICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB3aGVyZVBhdHRlcm4gPSBwYXR0ZXJucy5sZW5ndGggPiAwID8gYFdIRVJFICR7cGF0dGVybnMuam9pbihgICR7b3JPckFuZH0gYCl9YCA6ICcnO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRsaW1pdCkge1xuICAgICAgICBsaW1pdFBhdHRlcm4gPSBgTElNSVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJGxpbWl0KTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc2tpcCkge1xuICAgICAgICBza2lwUGF0dGVybiA9IGBPRkZTRVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJHNraXApO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRzb3J0KSB7XG4gICAgICAgIGNvbnN0IHNvcnQgPSBzdGFnZS4kc29ydDtcbiAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHNvcnQpO1xuICAgICAgICBjb25zdCBzb3J0aW5nID0ga2V5c1xuICAgICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gc29ydFtrZXldID09PSAxID8gJ0FTQycgOiAnREVTQyc7XG4gICAgICAgICAgICBjb25zdCBvcmRlciA9IGAkJHtpbmRleH06bmFtZSAke3RyYW5zZm9ybWVyfWA7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgcmV0dXJuIG9yZGVyO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmpvaW4oKTtcbiAgICAgICAgdmFsdWVzLnB1c2goLi4ua2V5cyk7XG4gICAgICAgIHNvcnRQYXR0ZXJuID0gc29ydCAhPT0gdW5kZWZpbmVkICYmIHNvcnRpbmcubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChncm91cFBhdHRlcm4pIHtcbiAgICAgIGNvbHVtbnMuZm9yRWFjaCgoZSwgaSwgYSkgPT4ge1xuICAgICAgICBpZiAoZSAmJiBlLnRyaW0oKSA9PT0gJyonKSB7XG4gICAgICAgICAgYVtpXSA9ICcnO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnNcbiAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgIC5qb2luKCl9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtza2lwUGF0dGVybn0gJHtncm91cFBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluID8gdGhpcy5jcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KG9yaWdpbmFsUXVlcnkpIDogb3JpZ2luYWxRdWVyeTtcbiAgICBkZWJ1ZyhxcywgdmFsdWVzKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgdmFsdWVzKS50aGVuKGEgPT4ge1xuICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgcmV0dXJuIGE7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHRzID0gYS5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdvYmplY3RJZCcpKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSB7fTtcbiAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBncm91cFZhbHVlcykge1xuICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkW2tleV0gPSByZXN1bHRba2V5XTtcbiAgICAgICAgICAgIGRlbGV0ZSByZXN1bHRba2V5XTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvdW50RmllbGQpIHtcbiAgICAgICAgICByZXN1bHRbY291bnRGaWVsZF0gPSBwYXJzZUludChyZXN1bHRbY291bnRGaWVsZF0sIDEwKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbih7IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgfTogYW55KSB7XG4gICAgLy8gVE9ETzogVGhpcyBtZXRob2QgbmVlZHMgdG8gYmUgcmV3cml0dGVuIHRvIG1ha2UgcHJvcGVyIHVzZSBvZiBjb25uZWN0aW9ucyAoQHZpdGFseS10KVxuICAgIGRlYnVnKCdwZXJmb3JtSW5pdGlhbGl6YXRpb24nKTtcbiAgICBjb25zdCBwcm9taXNlcyA9IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMubWFwKHNjaGVtYSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVUYWJsZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpXG4gICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgfHxcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUVcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLnNjaGVtYVVwZ3JhZGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2xpZW50LnR4KCdwZXJmb3JtLWluaXRpYWxpemF0aW9uJywgYXN5bmMgdCA9PiB7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5taXNjLmpzb25PYmplY3RTZXRLZXlzKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmFkZCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGRVbmlxdWUpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkucmVtb3ZlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zQWxsKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zQWxsUmVnZXgpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuY29udGFpbnMpO1xuICAgICAgICAgIHJldHVybiB0LmN0eDtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oY3R4ID0+IHtcbiAgICAgICAgZGVidWcoYGluaXRpYWxpemF0aW9uRG9uZSBpbiAke2N0eC5kdXJhdGlvbn1gKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46ID9hbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+XG4gICAgICB0LmJhdGNoKFxuICAgICAgICBpbmRleGVzLm1hcChpID0+IHtcbiAgICAgICAgICByZXR1cm4gdC5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgICAgICAgaS5uYW1lLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaS5rZXksXG4gICAgICAgICAgXSk7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCAoY29ubiB8fCB0aGlzLl9jbGllbnQpLm5vbmUoJ0NSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLCBbXG4gICAgICBmaWVsZE5hbWUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0eXBlLFxuICAgIF0pO1xuICB9XG5cbiAgYXN5bmMgZHJvcEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSwgY29ubjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcXVlcmllcyA9IGluZGV4ZXMubWFwKGkgPT4gKHtcbiAgICAgIHF1ZXJ5OiAnRFJPUCBJTkRFWCAkMTpuYW1lJyxcbiAgICAgIHZhbHVlczogaSxcbiAgICB9KSk7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+IHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgfVxuXG4gIGFzeW5jIGdldEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxcyA9ICdTRUxFQ1QgKiBGUk9NIHBnX2luZGV4ZXMgV0hFUkUgdGFibGVuYW1lID0gJHtjbGFzc05hbWV9JztcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgeyBjbGFzc05hbWUgfSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBVc2VkIGZvciB0ZXN0aW5nIHB1cnBvc2VzXG4gIGFzeW5jIHVwZGF0ZUVzdGltYXRlZENvdW50KGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKCdBTkFMWVpFICQxOm5hbWUnLCBbY2xhc3NOYW1lXSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZXNzaW9uID0ge307XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXN1bHQgPSB0aGlzLl9jbGllbnQudHgodCA9PiB7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgPSB0O1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICAgIH0pO1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaCA9IFtdO1xuICAgICAgICByZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnByb21pc2U7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZXNzaW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0O1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0LmNhdGNoKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChQcm9taXNlLnJlamVjdCgpKTtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSW5kZXgoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIGZpZWxkTmFtZXM6IHN0cmluZ1tdLFxuICAgIGluZGV4TmFtZTogP3N0cmluZyxcbiAgICBjYXNlSW5zZW5zaXRpdmU6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zPzogT2JqZWN0ID0ge31cbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgZGVmYXVsdEluZGV4TmFtZSA9IGBwYXJzZV9kZWZhdWx0XyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID1cbiAgICAgIGluZGV4TmFtZSAhPSBudWxsID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHsgbmFtZTogZGVmYXVsdEluZGV4TmFtZSB9O1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYGxvd2VyKCQke2luZGV4ICsgM306bmFtZSkgdmFyY2hhcl9wYXR0ZXJuX29wc2ApXG4gICAgICA6IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYCk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgYXdhaXQgY29ubi5ub25lKHFzLCBbaW5kZXhOYW1lT3B0aW9ucy5uYW1lLCBjbGFzc05hbWUsIC4uLmZpZWxkTmFtZXNdKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGluZGV4TmFtZU9wdGlvbnMubmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBJbmRleCBhbHJlYWR5IGV4aXN0cy4gSWdub3JlIGVycm9yLlxuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yICYmXG4gICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lT3B0aW9ucy5uYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIENhc3QgdGhlIGVycm9yIGludG8gdGhlIHByb3BlciBwYXJzZSBlcnJvclxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29udmVydFBvbHlnb25Ub1NRTChwb2x5Z29uKSB7XG4gIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgUG9seWdvbiBtdXN0IGhhdmUgYXQgbGVhc3QgMyB2YWx1ZXNgKTtcbiAgfVxuICBpZiAoXG4gICAgcG9seWdvblswXVswXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzBdIHx8XG4gICAgcG9seWdvblswXVsxXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzFdXG4gICkge1xuICAgIHBvbHlnb24ucHVzaChwb2x5Z29uWzBdKTtcbiAgfVxuICBjb25zdCB1bmlxdWUgPSBwb2x5Z29uLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgbGV0IGZvdW5kSW5kZXggPSAtMTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgaWYgKHB0WzBdID09PSBpdGVtWzBdICYmIHB0WzFdID09PSBpdGVtWzFdKSB7XG4gICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICB9KTtcbiAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICk7XG4gIH1cbiAgY29uc3QgcG9pbnRzID0gcG9seWdvblxuICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBhcnNlRmxvYXQocG9pbnRbMV0pLCBwYXJzZUZsb2F0KHBvaW50WzBdKSk7XG4gICAgICByZXR1cm4gYCgke3BvaW50WzFdfSwgJHtwb2ludFswXX0pYDtcbiAgICB9KVxuICAgIC5qb2luKCcsICcpO1xuICByZXR1cm4gYCgke3BvaW50c30pYDtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCkge1xuICBpZiAoIXJlZ2V4LmVuZHNXaXRoKCdcXG4nKSkge1xuICAgIHJlZ2V4ICs9ICdcXG4nO1xuICB9XG5cbiAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIGNvbW1lbnRzXG4gIHJldHVybiAoXG4gICAgcmVnZXhcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSkjLipcXG4vZ2ltLCAnJDEnKVxuICAgICAgLy8gcmVtb3ZlIGxpbmVzIHN0YXJ0aW5nIHdpdGggYSBjb21tZW50XG4gICAgICAucmVwbGFjZSgvXiMuKlxcbi9naW0sICcnKVxuICAgICAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIHdoaXRlc3BhY2VcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSlcXHMrL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSB3aGl0ZXNwYWNlIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBsaW5lXG4gICAgICAucmVwbGFjZSgvXlxccysvLCAnJylcbiAgICAgIC50cmltKClcbiAgKTtcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1JlZ2V4UGF0dGVybihzKSB7XG4gIGlmIChzICYmIHMuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgLy8gcmVnZXggZm9yIHN0YXJ0c1dpdGhcbiAgICByZXR1cm4gJ14nICsgbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDEpKTtcbiAgfSBlbHNlIGlmIChzICYmIHMuZW5kc1dpdGgoJyQnKSkge1xuICAgIC8vIHJlZ2V4IGZvciBlbmRzV2l0aFxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMuc2xpY2UoMCwgcy5sZW5ndGggLSAxKSkgKyAnJCc7XG4gIH1cblxuICAvLyByZWdleCBmb3IgY29udGFpbnNcbiAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocyk7XG59XG5cbmZ1bmN0aW9uIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlKSB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCAhdmFsdWUuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9cXF5cXFxcUS4qXFxcXEUvKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn1cblxuZnVuY3Rpb24gaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpIHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0uJHJlZ2V4KTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXS4kcmVnZXgpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgodmFsdWVzKSB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gaXNTdGFydHNXaXRoUmVnZXgodmFsdWUuJHJlZ2V4KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpIHtcbiAgcmV0dXJuIHJlbWFpbmluZ1xuICAgIC5zcGxpdCgnJylcbiAgICAubWFwKGMgPT4ge1xuICAgICAgY29uc3QgcmVnZXggPSBSZWdFeHAoJ1swLTkgXXxcXFxccHtMfScsICd1Jyk7IC8vIFN1cHBvcnQgYWxsIHVuaWNvZGUgbGV0dGVyIGNoYXJzXG4gICAgICBpZiAoYy5tYXRjaChyZWdleCkgIT09IG51bGwpIHtcbiAgICAgICAgLy8gZG9uJ3QgZXNjYXBlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzXG4gICAgICAgIHJldHVybiBjO1xuICAgICAgfVxuICAgICAgLy8gZXNjYXBlIGV2ZXJ5dGhpbmcgZWxzZSAoc2luZ2xlIHF1b3RlcyB3aXRoIHNpbmdsZSBxdW90ZXMsIGV2ZXJ5dGhpbmcgZWxzZSB3aXRoIGEgYmFja3NsYXNoKVxuICAgICAgcmV0dXJuIGMgPT09IGAnYCA/IGAnJ2AgOiBgXFxcXCR7Y31gO1xuICAgIH0pXG4gICAgLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBsaXRlcmFsaXplUmVnZXhQYXJ0KHM6IHN0cmluZykge1xuICBjb25zdCBtYXRjaGVyMSA9IC9cXFxcUSgoPyFcXFxcRSkuKilcXFxcRSQvO1xuICBjb25zdCByZXN1bHQxOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIxKTtcbiAgaWYgKHJlc3VsdDEgJiYgcmVzdWx0MS5sZW5ndGggPiAxICYmIHJlc3VsdDEuaW5kZXggPiAtMSkge1xuICAgIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgYW5kIGFuIGVuZCBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cigwLCByZXN1bHQxLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQxWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gcHJvY2VzcyByZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgY29uc3QgbWF0Y2hlcjIgPSAvXFxcXFEoKD8hXFxcXEUpLiopJC87XG4gIGNvbnN0IHJlc3VsdDI6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjIpO1xuICBpZiAocmVzdWx0MiAmJiByZXN1bHQyLmxlbmd0aCA+IDEgJiYgcmVzdWx0Mi5pbmRleCA+IC0xKSB7XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHIoMCwgcmVzdWx0Mi5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MlsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHJlbW92ZSBhbGwgaW5zdGFuY2VzIG9mIFxcUSBhbmQgXFxFIGZyb20gdGhlIHJlbWFpbmluZyB0ZXh0ICYgZXNjYXBlIHNpbmdsZSBxdW90ZXNcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxFKS8sICckMScpXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcUSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC9eXFxcXEUvLCAnJylcbiAgICAucmVwbGFjZSgvXlxcXFxRLywgJycpXG4gICAgLnJlcGxhY2UoLyhbXiddKScvLCBgJDEnJ2ApXG4gICAgLnJlcGxhY2UoL14nKFteJ10pLywgYCcnJDFgKTtcbn1cblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnO1xuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiJdfQ==