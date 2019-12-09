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
  index
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

    if (fieldName.indexOf('.') >= 0) {
      let name = transformDotField(fieldName);

      if (fieldValue === null) {
        patterns.push(`${name} IS NULL`);
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
          index
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

  _ensureSchemaCollectionExists(conn) {
    conn = conn || this._client;
    return conn.none('CREATE TABLE IF NOT EXISTS "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )').catch(error => {
      if (error.code === PostgresDuplicateRelationError || error.code === PostgresUniqueIndexViolationError || error.code === PostgresDuplicateObjectError) {// Table already exists, must have been created by a different request. Ignore error.
      } else {
        throw error;
      }
    });
  }

  classExists(name) {
    return this._client.one('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)', [name], a => a.exists);
  }

  setClassLevelPermissions(className, CLPs) {
    const self = this;
    return this._client.task('set-class-level-permissions', async t => {
      await self._ensureSchemaCollectionExists(t);
      const values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)];
      await t.none(`UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className"=$1`, values);
    });
  }

  setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields, conn) {
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
    return conn.tx('set-indexes-with-schema-format', async t => {
      if (insertedIndexes.length > 0) {
        await self.createIndexes(className, insertedIndexes, t);
      }

      if (deletedIndexes.length > 0) {
        await self.dropIndexes(className, deletedIndexes, t);
      }

      await self._ensureSchemaCollectionExists(t);
      await t.none('UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className"=$1', [className, 'schema', 'indexes', JSON.stringify(existingIndexes)]);
    });
  }

  createClass(className, schema, conn) {
    conn = conn || this._client;
    return conn.tx('create-class', t => {
      const q1 = this.createTable(className, schema, t);
      const q2 = t.none('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', {
        className,
        schema
      });
      const q3 = this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields, t);
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


  createTable(className, schema, conn) {
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

  schemaUpgrade(className, schema, conn) {
    debug('schemaUpgrade', {
      className,
      schema
    });
    conn = conn || this._client;
    const self = this;
    return conn.tx('schema-upgrade', async t => {
      const columns = await t.map('SELECT column_name FROM information_schema.columns WHERE table_name = $<className>', {
        className
      }, a => a.column_name);
      const newColumns = Object.keys(schema.fields).filter(item => columns.indexOf(item) === -1).map(fieldName => self.addFieldIfNotExists(className, fieldName, schema.fields[fieldName], t));
      await t.batch(newColumns);
    });
  }

  addFieldIfNotExists(className, fieldName, type, conn) {
    // TODO: Must be revised for invalid logic...
    debug('addFieldIfNotExists', {
      className,
      fieldName,
      type
    });
    conn = conn || this._client;
    const self = this;
    return conn.tx('add-field-if-not-exists', async t => {
      if (type.type !== 'Relation') {
        try {
          await t.none('ALTER TABLE $<className:name> ADD COLUMN $<fieldName:name> $<postgresType:raw>', {
            className,
            fieldName,
            postgresType: parseTypeToPostgresType(type)
          });
        } catch (error) {
          if (error.code === PostgresRelationDoesNotExistError) {
            return await self.createClass(className, {
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


  deleteClass(className) {
    const operations = [{
      query: `DROP TABLE IF EXISTS $1:name`,
      values: [className]
    }, {
      query: `DELETE FROM "_SCHEMA" WHERE "className" = $1`,
      values: [className]
    }];
    return this._client.tx(t => t.none(this._pgp.helpers.concat(operations))).then(() => className.indexOf('_Join:') != 0); // resolves with false when _Join table
  } // Delete all data known to this adapter. Used for testing.


  deleteAllClasses() {
    const now = new Date().getTime();
    const helpers = this._pgp.helpers;
    debug('deleteAllClasses');
    return this._client.task('delete-all-classes', async t => {
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


  deleteFields(className, schema, fieldNames) {
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
    return this._client.tx('delete-fields', async t => {
      await t.none('UPDATE "_SCHEMA" SET "schema"=$<schema> WHERE "className"=$<className>', {
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


  getAllClasses() {
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


  getClass(className) {
    debug('getClass', className);
    return this._client.any('SELECT * FROM "_SCHEMA" WHERE "className"=$<className>', {
      className
    }).then(result => {
      if (result.length !== 1) {
        throw undefined;
      }

      return result[0].schema;
    }).then(toParseSchema);
  } // TODO: remove the mongo format dependency in the return value


  createObject(className, schema, object, transactionalSession) {
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


  deleteObjectsByQuery(className, schema, query, transactionalSession) {
    debug('deleteObjectsByQuery', className, query);
    const values = [className];
    const index = 2;
    const where = buildWhereClause({
      schema,
      index,
      query
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


  findOneAndUpdate(className, schema, query, update, transactionalSession) {
    debug('findOneAndUpdate', className, query, update);
    return this.updateObjectsByQuery(className, schema, query, update, transactionalSession).then(val => val[0]);
  } // Apply the update to all objects that match the given Parse Query.


  updateObjectsByQuery(className, schema, query, update, transactionalSession) {
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
      query
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
    keys
  }) {
    debug('find', className, query, {
      skip,
      limit,
      sort,
      keys
    });
    const hasLimit = limit !== undefined;
    const hasSkip = skip !== undefined;
    let values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2
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


  ensureUniqueness(className, schema, fieldNames) {
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


  count(className, schema, query, readPreference, estimate = true) {
    debug('count', className, query, readPreference, estimate);
    const values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2
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

  distinct(className, schema, query, fieldName) {
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
      index: 4
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

  aggregate(className, schema, pipeline) {
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

  performInitialization({
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

  createIndexes(className, indexes, conn) {
    return (conn || this._client).tx(t => t.batch(indexes.map(i => {
      return t.none('CREATE INDEX $1:name ON $2:name ($3:name)', [i.name, className, i.key]);
    })));
  }

  createIndexesIfNeeded(className, fieldName, type, conn) {
    return (conn || this._client).none('CREATE INDEX $1:name ON $2:name ($3:name)', [fieldName, className, type]);
  }

  dropIndexes(className, indexes, conn) {
    const queries = indexes.map(i => ({
      query: 'DROP INDEX $1:name',
      values: i
    }));
    return (conn || this._client).tx(t => t.none(this._pgp.helpers.concat(queries)));
  }

  getIndexes(className) {
    const qs = 'SELECT * FROM pg_indexes WHERE tablename = ${className}';
    return this._client.any(qs, {
      className
    });
  }

  updateSchemaWithIndexes() {
    return Promise.resolve();
  } // Used for testing purposes


  updateEstimatedCount(className) {
    return this._client.none('ANALYZE $1:name', [className]);
  }

  createTransactionalSession() {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIuanMiXSwibmFtZXMiOlsiUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciIsIlBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVPYmplY3RFcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsIlBvc3RncmVzVHJhbnNhY3Rpb25BYm9ydGVkRXJyb3IiLCJsb2dnZXIiLCJyZXF1aXJlIiwiZGVidWciLCJhcmdzIiwiYXJndW1lbnRzIiwiY29uY2F0Iiwic2xpY2UiLCJsZW5ndGgiLCJsb2ciLCJnZXRMb2dnZXIiLCJhcHBseSIsInBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlIiwidHlwZSIsImNvbnRlbnRzIiwiSlNPTiIsInN0cmluZ2lmeSIsIlBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciIsIiRndCIsIiRsdCIsIiRndGUiLCIkbHRlIiwibW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzIiwiJGRheU9mTW9udGgiLCIkZGF5T2ZXZWVrIiwiJGRheU9mWWVhciIsIiRpc29EYXlPZldlZWsiLCIkaXNvV2Vla1llYXIiLCIkaG91ciIsIiRtaW51dGUiLCIkc2Vjb25kIiwiJG1pbGxpc2Vjb25kIiwiJG1vbnRoIiwiJHdlZWsiLCIkeWVhciIsInRvUG9zdGdyZXNWYWx1ZSIsInZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRyYW5zZm9ybVZhbHVlIiwib2JqZWN0SWQiLCJlbXB0eUNMUFMiLCJPYmplY3QiLCJmcmVlemUiLCJmaW5kIiwiZ2V0IiwiY291bnQiLCJjcmVhdGUiLCJ1cGRhdGUiLCJkZWxldGUiLCJhZGRGaWVsZCIsInByb3RlY3RlZEZpZWxkcyIsImRlZmF1bHRDTFBTIiwidG9QYXJzZVNjaGVtYSIsInNjaGVtYSIsImNsYXNzTmFtZSIsImZpZWxkcyIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfd3Blcm0iLCJfcnBlcm0iLCJjbHBzIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaW5kZXhlcyIsInRvUG9zdGdyZXNTY2hlbWEiLCJfcGFzc3dvcmRfaGlzdG9yeSIsImhhbmRsZURvdEZpZWxkcyIsIm9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwiZmllbGROYW1lIiwiaW5kZXhPZiIsImNvbXBvbmVudHMiLCJzcGxpdCIsImZpcnN0Iiwic2hpZnQiLCJjdXJyZW50T2JqIiwibmV4dCIsIl9fb3AiLCJ1bmRlZmluZWQiLCJ0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyIsIm1hcCIsImNtcHQiLCJpbmRleCIsInRyYW5zZm9ybURvdEZpZWxkIiwiam9pbiIsInRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkIiwic3Vic3RyIiwidmFsaWRhdGVLZXlzIiwia2V5IiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwiam9pblRhYmxlc0ZvclNjaGVtYSIsImxpc3QiLCJmaWVsZCIsInB1c2giLCJidWlsZFdoZXJlQ2xhdXNlIiwicXVlcnkiLCJwYXR0ZXJucyIsInZhbHVlcyIsInNvcnRzIiwiaXNBcnJheUZpZWxkIiwiaW5pdGlhbFBhdHRlcm5zTGVuZ3RoIiwiZmllbGRWYWx1ZSIsIiRleGlzdHMiLCIkaW4iLCIkcmVnZXgiLCJNQVhfSU5UX1BMVVNfT05FIiwiY2xhdXNlcyIsImNsYXVzZVZhbHVlcyIsInN1YlF1ZXJ5IiwiY2xhdXNlIiwicGF0dGVybiIsIm9yT3JBbmQiLCJub3QiLCIkbmUiLCJjb25zdHJhaW50RmllbGROYW1lIiwicG9pbnQiLCJsb25naXR1ZGUiLCJsYXRpdHVkZSIsIiRlcSIsImlzSW5Pck5pbiIsIkFycmF5IiwiaXNBcnJheSIsIiRuaW4iLCJpblBhdHRlcm5zIiwiYWxsb3dOdWxsIiwibGlzdEVsZW0iLCJsaXN0SW5kZXgiLCJjcmVhdGVDb25zdHJhaW50IiwiYmFzZUFycmF5Iiwibm90SW4iLCJfIiwiZmxhdE1hcCIsImVsdCIsIklOVkFMSURfSlNPTiIsIiRhbGwiLCJpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoIiwiaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSIsImkiLCJwcm9jZXNzUmVnZXhQYXR0ZXJuIiwic3Vic3RyaW5nIiwiJGNvbnRhaW5lZEJ5IiwiYXJyIiwiJHRleHQiLCJzZWFyY2giLCIkc2VhcmNoIiwibGFuZ3VhZ2UiLCIkdGVybSIsIiRsYW5ndWFnZSIsIiRjYXNlU2Vuc2l0aXZlIiwiJGRpYWNyaXRpY1NlbnNpdGl2ZSIsIiRuZWFyU3BoZXJlIiwiZGlzdGFuY2UiLCIkbWF4RGlzdGFuY2UiLCJkaXN0YW5jZUluS00iLCIkd2l0aGluIiwiJGJveCIsImJveCIsImxlZnQiLCJib3R0b20iLCJyaWdodCIsInRvcCIsIiRnZW9XaXRoaW4iLCIkY2VudGVyU3BoZXJlIiwiY2VudGVyU3BoZXJlIiwiR2VvUG9pbnQiLCJHZW9Qb2ludENvZGVyIiwiaXNWYWxpZEpTT04iLCJfdmFsaWRhdGUiLCJpc05hTiIsIiRwb2x5Z29uIiwicG9seWdvbiIsInBvaW50cyIsImNvb3JkaW5hdGVzIiwiJGdlb0ludGVyc2VjdHMiLCIkcG9pbnQiLCJyZWdleCIsIm9wZXJhdG9yIiwib3B0cyIsIiRvcHRpb25zIiwicmVtb3ZlV2hpdGVTcGFjZSIsImNvbnZlcnRQb2x5Z29uVG9TUUwiLCJjbXAiLCJwZ0NvbXBhcmF0b3IiLCJwb3N0Z3Jlc1ZhbHVlIiwiY2FzdFR5cGUiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIl9jb2xsZWN0aW9uUHJlZml4IiwiY2xpZW50IiwicGdwIiwiX2NsaWVudCIsIl9wZ3AiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwiaGFuZGxlU2h1dGRvd24iLCIkcG9vbCIsImVuZCIsIl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzIiwiY29ubiIsIm5vbmUiLCJjYXRjaCIsImVycm9yIiwiY29kZSIsImNsYXNzRXhpc3RzIiwib25lIiwiYSIsImV4aXN0cyIsInNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIkNMUHMiLCJzZWxmIiwidGFzayIsInQiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJQcm9taXNlIiwicmVzb2x2ZSIsIl9pZF8iLCJfaWQiLCJkZWxldGVkSW5kZXhlcyIsImluc2VydGVkSW5kZXhlcyIsIklOVkFMSURfUVVFUlkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0eCIsImNyZWF0ZUluZGV4ZXMiLCJkcm9wSW5kZXhlcyIsImNyZWF0ZUNsYXNzIiwicTEiLCJjcmVhdGVUYWJsZSIsInEyIiwicTMiLCJiYXRjaCIsInRoZW4iLCJlcnIiLCJkYXRhIiwicmVzdWx0IiwiZGV0YWlsIiwiRFVQTElDQVRFX1ZBTFVFIiwidmFsdWVzQXJyYXkiLCJwYXR0ZXJuc0FycmF5IiwiYXNzaWduIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsInJlbGF0aW9ucyIsInBhcnNlVHlwZSIsInFzIiwiam9pblRhYmxlIiwic2NoZW1hVXBncmFkZSIsImNvbHVtbnMiLCJjb2x1bW5fbmFtZSIsIm5ld0NvbHVtbnMiLCJmaWx0ZXIiLCJpdGVtIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsInBvc3RncmVzVHlwZSIsImFueSIsInBhdGgiLCJkZWxldGVDbGFzcyIsIm9wZXJhdGlvbnMiLCJoZWxwZXJzIiwiZGVsZXRlQWxsQ2xhc3NlcyIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwicmVzdWx0cyIsImpvaW5zIiwicmVkdWNlIiwiY2xhc3NlcyIsInF1ZXJpZXMiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwiaWR4IiwiZ2V0QWxsQ2xhc3NlcyIsInJvdyIsImdldENsYXNzIiwiY3JlYXRlT2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2x1bW5zQXJyYXkiLCJnZW9Qb2ludHMiLCJhdXRoRGF0YU1hdGNoIiwibWF0Y2giLCJwcm92aWRlciIsInBvcCIsImluaXRpYWxWYWx1ZXMiLCJ2YWwiLCJ0ZXJtaW5hdGlvbiIsImdlb1BvaW50c0luamVjdHMiLCJsIiwiY29sdW1uc1BhdHRlcm4iLCJjb2wiLCJ2YWx1ZXNQYXR0ZXJuIiwicHJvbWlzZSIsIm9wcyIsInVuZGVybHlpbmdFcnJvciIsImNvbnN0cmFpbnQiLCJtYXRjaGVzIiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ3aGVyZSIsIk9CSkVDVF9OT1RfRk9VTkQiLCJmaW5kT25lQW5kVXBkYXRlIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGVQYXR0ZXJucyIsIm9yaWdpbmFsVXBkYXRlIiwiZG90Tm90YXRpb25PcHRpb25zIiwiZ2VuZXJhdGUiLCJqc29uYiIsImxhc3RLZXkiLCJmaWVsZE5hbWVJbmRleCIsInN0ciIsImFtb3VudCIsIm9iamVjdHMiLCJrZXlzVG9JbmNyZW1lbnQiLCJrIiwiaW5jcmVtZW50UGF0dGVybnMiLCJjIiwia2V5c1RvRGVsZXRlIiwiZGVsZXRlUGF0dGVybnMiLCJwIiwidXBkYXRlT2JqZWN0IiwiZXhwZWN0ZWRUeXBlIiwicmVqZWN0Iiwid2hlcmVDbGF1c2UiLCJ1cHNlcnRPbmVPYmplY3QiLCJjcmVhdGVWYWx1ZSIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJoYXNMaW1pdCIsImhhc1NraXAiLCJ3aGVyZVBhdHRlcm4iLCJsaW1pdFBhdHRlcm4iLCJza2lwUGF0dGVybiIsInNvcnRQYXR0ZXJuIiwic29ydENvcHkiLCJzb3J0aW5nIiwidHJhbnNmb3JtS2V5IiwibWVtbyIsInBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdCIsInRhcmdldENsYXNzIiwieSIsIngiLCJjb29yZHMiLCJwYXJzZUZsb2F0IiwiY3JlYXRlZEF0IiwidG9JU09TdHJpbmciLCJ1cGRhdGVkQXQiLCJleHBpcmVzQXQiLCJlbnN1cmVVbmlxdWVuZXNzIiwiY29uc3RyYWludE5hbWUiLCJjb25zdHJhaW50UGF0dGVybnMiLCJtZXNzYWdlIiwicmVhZFByZWZlcmVuY2UiLCJlc3RpbWF0ZSIsImFwcHJveGltYXRlX3Jvd19jb3VudCIsImRpc3RpbmN0IiwiY29sdW1uIiwiaXNOZXN0ZWQiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybWVyIiwiY2hpbGQiLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsImNvdW50RmllbGQiLCJncm91cFZhbHVlcyIsImdyb3VwUGF0dGVybiIsInN0YWdlIiwiJGdyb3VwIiwiZ3JvdXBCeUZpZWxkcyIsImFsaWFzIiwib3BlcmF0aW9uIiwic291cmNlIiwiJHN1bSIsIiRtYXgiLCIkbWluIiwiJGF2ZyIsIiRwcm9qZWN0IiwiJG1hdGNoIiwiJG9yIiwiY29sbGFwc2UiLCJlbGVtZW50IiwibWF0Y2hQYXR0ZXJucyIsIiRsaW1pdCIsIiRza2lwIiwiJHNvcnQiLCJvcmRlciIsInBhcnNlSW50IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInByb21pc2VzIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiYWxsIiwic3FsIiwibWlzYyIsImpzb25PYmplY3RTZXRLZXlzIiwiYXJyYXkiLCJhZGQiLCJhZGRVbmlxdWUiLCJyZW1vdmUiLCJjb250YWluc0FsbCIsImNvbnRhaW5zQWxsUmVnZXgiLCJjb250YWlucyIsImR1cmF0aW9uIiwiY29uc29sZSIsImNyZWF0ZUluZGV4ZXNJZk5lZWRlZCIsImdldEluZGV4ZXMiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsInVwZGF0ZUVzdGltYXRlZENvdW50IiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJ1bmlxdWUiLCJhciIsImZvdW5kSW5kZXgiLCJwdCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImVuZHNXaXRoIiwicmVwbGFjZSIsInRyaW0iLCJzIiwic3RhcnRzV2l0aCIsImxpdGVyYWxpemVSZWdleFBhcnQiLCJpc1N0YXJ0c1dpdGhSZWdleCIsImZpcnN0VmFsdWVzSXNSZWdleCIsInNvbWUiLCJjcmVhdGVMaXRlcmFsUmVnZXgiLCJyZW1haW5pbmciLCJSZWdFeHAiLCJtYXRjaGVyMSIsInJlc3VsdDEiLCJwcmVmaXgiLCJtYXRjaGVyMiIsInJlc3VsdDIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFDQTs7QUFFQTs7QUFFQTs7QUFDQTs7QUFpQkE7Ozs7Ozs7Ozs7QUFmQSxNQUFNQSxpQ0FBaUMsR0FBRyxPQUExQztBQUNBLE1BQU1DLDhCQUE4QixHQUFHLE9BQXZDO0FBQ0EsTUFBTUMsNEJBQTRCLEdBQUcsT0FBckM7QUFDQSxNQUFNQywwQkFBMEIsR0FBRyxPQUFuQztBQUNBLE1BQU1DLDRCQUE0QixHQUFHLE9BQXJDO0FBQ0EsTUFBTUMsaUNBQWlDLEdBQUcsT0FBMUM7QUFDQSxNQUFNQywrQkFBK0IsR0FBRyxPQUF4Qzs7QUFDQSxNQUFNQyxNQUFNLEdBQUdDLE9BQU8sQ0FBQyxpQkFBRCxDQUF0Qjs7QUFFQSxNQUFNQyxLQUFLLEdBQUcsVUFBUyxHQUFHQyxJQUFaLEVBQXVCO0FBQ25DQSxFQUFBQSxJQUFJLEdBQUcsQ0FBQyxTQUFTQyxTQUFTLENBQUMsQ0FBRCxDQUFuQixFQUF3QkMsTUFBeEIsQ0FBK0JGLElBQUksQ0FBQ0csS0FBTCxDQUFXLENBQVgsRUFBY0gsSUFBSSxDQUFDSSxN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QyxTQUFELENBQXZEO0FBQ0QsR0FUcUMsQ0FXdEM7OztBQUNBLFFBQU1LLFFBQVEsR0FBRyxpQkFBakI7QUFDQSxRQUFNQyxPQUFZLEdBQUdiLENBQUMsQ0FBQzVJLEtBQUYsQ0FBUXdKLFFBQVIsQ0FBckI7O0FBQ0EsTUFBSUMsT0FBTyxJQUFJQSxPQUFPLENBQUN2YixNQUFSLEdBQWlCLENBQTVCLElBQWlDdWIsT0FBTyxDQUFDNVcsS0FBUixHQUFnQixDQUFDLENBQXRELEVBQXlEO0FBQ3ZELFVBQU0wVyxNQUFNLEdBQUdYLENBQUMsQ0FBQzNWLE1BQUYsQ0FBUyxDQUFULEVBQVl3VyxPQUFPLENBQUM1VyxLQUFwQixDQUFmO0FBQ0EsVUFBTXNXLFNBQVMsR0FBR00sT0FBTyxDQUFDLENBQUQsQ0FBekI7QUFFQSxXQUFPWCxtQkFBbUIsQ0FBQ1MsTUFBRCxDQUFuQixHQUE4Qkwsa0JBQWtCLENBQUNDLFNBQUQsQ0FBdkQ7QUFDRCxHQW5CcUMsQ0FxQnRDOzs7QUFDQSxTQUFPUCxDQUFDLENBQ0xGLE9BREksQ0FDSSxjQURKLEVBQ29CLElBRHBCLEVBRUpBLE9BRkksQ0FFSSxjQUZKLEVBRW9CLElBRnBCLEVBR0pBLE9BSEksQ0FHSSxNQUhKLEVBR1ksRUFIWixFQUlKQSxPQUpJLENBSUksTUFKSixFQUlZLEVBSlosRUFLSkEsT0FMSSxDQUtJLFNBTEosRUFLZ0IsTUFMaEIsRUFNSkEsT0FOSSxDQU1JLFVBTkosRUFNaUIsTUFOakIsQ0FBUDtBQU9EOztBQUVELElBQUl2USxhQUFhLEdBQUc7QUFDbEJDLEVBQUFBLFdBQVcsQ0FBQ3RJLEtBQUQsRUFBUTtBQUNqQixXQUNFLE9BQU9BLEtBQVAsS0FBaUIsUUFBakIsSUFBNkJBLEtBQUssS0FBSyxJQUF2QyxJQUErQ0EsS0FBSyxDQUFDQyxNQUFOLEtBQWlCLFVBRGxFO0FBR0Q7O0FBTGlCLENBQXBCO2VBUWV5SixzQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICcuL1Bvc3RncmVzQ2xpZW50Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHNxbCBmcm9tICcuL3NxbCc7XG5cbmNvbnN0IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvciA9ICc0MlAwMSc7XG5jb25zdCBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgPSAnNDJQMDcnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciA9ICc0MjcwMSc7XG5jb25zdCBQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvciA9ICc0MjcwMyc7XG5jb25zdCBQb3N0Z3Jlc0R1cGxpY2F0ZU9iamVjdEVycm9yID0gJzQyNzEwJztcbmNvbnN0IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciA9ICcyMzUwNSc7XG5jb25zdCBQb3N0Z3Jlc1RyYW5zYWN0aW9uQWJvcnRlZEVycm9yID0gJzI1UDAyJztcbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uLy4uLy4uL2xvZ2dlcicpO1xuXG5jb25zdCBkZWJ1ZyA9IGZ1bmN0aW9uKC4uLmFyZ3M6IGFueSkge1xuICBhcmdzID0gWydQRzogJyArIGFyZ3VtZW50c1swXV0uY29uY2F0KGFyZ3Muc2xpY2UoMSwgYXJncy5sZW5ndGgpKTtcbiAgY29uc3QgbG9nID0gbG9nZ2VyLmdldExvZ2dlcigpO1xuICBsb2cuZGVidWcuYXBwbHkobG9nLCBhcmdzKTtcbn07XG5cbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHR5cGUgeyBTY2hlbWFUeXBlLCBRdWVyeVR5cGUsIFF1ZXJ5T3B0aW9ucyB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcblxuY29uc3QgcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUgPSB0eXBlID0+IHtcbiAgc3dpdGNoICh0eXBlLnR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiAndGltZXN0YW1wIHdpdGggdGltZSB6b25lJztcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdib29sZWFuJztcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIHJldHVybiAnY2hhcigxMCknO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiAncG9pbnQnO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiAnanNvbmInO1xuICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgcmV0dXJuICdwb2x5Z29uJztcbiAgICBjYXNlICdBcnJheSc6XG4gICAgICBpZiAodHlwZS5jb250ZW50cyAmJiB0eXBlLmNvbnRlbnRzLnR5cGUgPT09ICdTdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiAndGV4dFtdJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAnanNvbmInO1xuICAgICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBgbm8gdHlwZSBmb3IgJHtKU09OLnN0cmluZ2lmeSh0eXBlKX0geWV0YDtcbiAgfVxufTtcblxuY29uc3QgUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yID0ge1xuICAkZ3Q6ICc+JyxcbiAgJGx0OiAnPCcsXG4gICRndGU6ICc+PScsXG4gICRsdGU6ICc8PScsXG59O1xuXG5jb25zdCBtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMgPSB7XG4gICRkYXlPZk1vbnRoOiAnREFZJyxcbiAgJGRheU9mV2VlazogJ0RPVycsXG4gICRkYXlPZlllYXI6ICdET1knLFxuICAkaXNvRGF5T2ZXZWVrOiAnSVNPRE9XJyxcbiAgJGlzb1dlZWtZZWFyOiAnSVNPWUVBUicsXG4gICRob3VyOiAnSE9VUicsXG4gICRtaW51dGU6ICdNSU5VVEUnLFxuICAkc2Vjb25kOiAnU0VDT05EJyxcbiAgJG1pbGxpc2Vjb25kOiAnTUlMTElTRUNPTkRTJyxcbiAgJG1vbnRoOiAnTU9OVEgnLFxuICAkd2VlazogJ1dFRUsnLFxuICAkeWVhcjogJ1lFQVInLFxufTtcblxuY29uc3QgdG9Qb3N0Z3Jlc1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLmlzbztcbiAgICB9XG4gICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICByZXR1cm4gdmFsdWUubmFtZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuY29uc3QgdHJhbnNmb3JtVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgcmV0dXJuIHZhbHVlLm9iamVjdElkO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbi8vIER1cGxpY2F0ZSBmcm9tIHRoZW4gbW9uZ28gYWRhcHRlci4uLlxuY29uc3QgZW1wdHlDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHt9LFxuICBnZXQ6IHt9LFxuICBjb3VudDoge30sXG4gIGNyZWF0ZToge30sXG4gIHVwZGF0ZToge30sXG4gIGRlbGV0ZToge30sXG4gIGFkZEZpZWxkOiB7fSxcbiAgcHJvdGVjdGVkRmllbGRzOiB7fSxcbn0pO1xuXG5jb25zdCBkZWZhdWx0Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7ICcqJzogdHJ1ZSB9LFxuICBnZXQ6IHsgJyonOiB0cnVlIH0sXG4gIGNvdW50OiB7ICcqJzogdHJ1ZSB9LFxuICBjcmVhdGU6IHsgJyonOiB0cnVlIH0sXG4gIHVwZGF0ZTogeyAnKic6IHRydWUgfSxcbiAgZGVsZXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBhZGRGaWVsZDogeyAnKic6IHRydWUgfSxcbiAgcHJvdGVjdGVkRmllbGRzOiB7ICcqJzogW10gfSxcbn0pO1xuXG5jb25zdCB0b1BhcnNlU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICB9XG4gIGlmIChzY2hlbWEuZmllbGRzKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgfVxuICBsZXQgY2xwcyA9IGRlZmF1bHRDTFBTO1xuICBpZiAoc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucykge1xuICAgIGNscHMgPSB7IC4uLmVtcHR5Q0xQUywgLi4uc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyB9O1xuICB9XG4gIGxldCBpbmRleGVzID0ge307XG4gIGlmIChzY2hlbWEuaW5kZXhlcykge1xuICAgIGluZGV4ZXMgPSB7IC4uLnNjaGVtYS5pbmRleGVzIH07XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBjbGFzc05hbWU6IHNjaGVtYS5jbGFzc05hbWUsXG4gICAgZmllbGRzOiBzY2hlbWEuZmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogY2xwcyxcbiAgICBpbmRleGVzLFxuICB9O1xufTtcblxuY29uc3QgdG9Qb3N0Z3Jlc1NjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGlmICghc2NoZW1hKSB7XG4gICAgcmV0dXJuIHNjaGVtYTtcbiAgfVxuICBzY2hlbWEuZmllbGRzID0gc2NoZW1hLmZpZWxkcyB8fCB7fTtcbiAgc2NoZW1hLmZpZWxkcy5fd3Blcm0gPSB7IHR5cGU6ICdBcnJheScsIGNvbnRlbnRzOiB7IHR5cGU6ICdTdHJpbmcnIH0gfTtcbiAgc2NoZW1hLmZpZWxkcy5fcnBlcm0gPSB7IHR5cGU6ICdBcnJheScsIGNvbnRlbnRzOiB7IHR5cGU6ICdTdHJpbmcnIH0gfTtcbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgc2NoZW1hLmZpZWxkcy5fcGFzc3dvcmRfaGlzdG9yeSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICB9XG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG5jb25zdCBoYW5kbGVEb3RGaWVsZHMgPSBvYmplY3QgPT4ge1xuICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICBjb25zdCBjb21wb25lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBmaXJzdCA9IGNvbXBvbmVudHMuc2hpZnQoKTtcbiAgICAgIG9iamVjdFtmaXJzdF0gPSBvYmplY3RbZmlyc3RdIHx8IHt9O1xuICAgICAgbGV0IGN1cnJlbnRPYmogPSBvYmplY3RbZmlyc3RdO1xuICAgICAgbGV0IG5leHQ7XG4gICAgICBsZXQgdmFsdWUgPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgIGlmICh2YWx1ZSAmJiB2YWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB2YWx1ZSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbmQtYXNzaWduICovXG4gICAgICB3aGlsZSAoKG5leHQgPSBjb21wb25lbnRzLnNoaWZ0KCkpKSB7XG4gICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IGN1cnJlbnRPYmpbbmV4dF0gfHwge307XG4gICAgICAgIGlmIChjb21wb25lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGN1cnJlbnRPYmpbbmV4dF0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBjdXJyZW50T2JqID0gY3VycmVudE9ialtuZXh0XTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMgPSBmaWVsZE5hbWUgPT4ge1xuICByZXR1cm4gZmllbGROYW1lLnNwbGl0KCcuJykubWFwKChjbXB0LCBpbmRleCkgPT4ge1xuICAgIGlmIChpbmRleCA9PT0gMCkge1xuICAgICAgcmV0dXJuIGBcIiR7Y21wdH1cImA7XG4gICAgfVxuICAgIHJldHVybiBgJyR7Y21wdH0nYDtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID09PSAtMSkge1xuICAgIHJldHVybiBgXCIke2ZpZWxkTmFtZX1cImA7XG4gIH1cbiAgY29uc3QgY29tcG9uZW50cyA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGZpZWxkTmFtZSk7XG4gIGxldCBuYW1lID0gY29tcG9uZW50cy5zbGljZSgwLCBjb21wb25lbnRzLmxlbmd0aCAtIDEpLmpvaW4oJy0+Jyk7XG4gIG5hbWUgKz0gJy0+PicgKyBjb21wb25lbnRzW2NvbXBvbmVudHMubGVuZ3RoIC0gMV07XG4gIHJldHVybiBuYW1lO1xufTtcblxuY29uc3QgdHJhbnNmb3JtQWdncmVnYXRlRmllbGQgPSBmaWVsZE5hbWUgPT4ge1xuICBpZiAodHlwZW9mIGZpZWxkTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gZmllbGROYW1lO1xuICB9XG4gIGlmIChmaWVsZE5hbWUgPT09ICckX2NyZWF0ZWRfYXQnKSB7XG4gICAgcmV0dXJuICdjcmVhdGVkQXQnO1xuICB9XG4gIGlmIChmaWVsZE5hbWUgPT09ICckX3VwZGF0ZWRfYXQnKSB7XG4gICAgcmV0dXJuICd1cGRhdGVkQXQnO1xuICB9XG4gIHJldHVybiBmaWVsZE5hbWUuc3Vic3RyKDEpO1xufTtcblxuY29uc3QgdmFsaWRhdGVLZXlzID0gb2JqZWN0ID0+IHtcbiAgaWYgKHR5cGVvZiBvYmplY3QgPT0gJ29iamVjdCcpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICAgIGlmICh0eXBlb2Ygb2JqZWN0W2tleV0gPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdmFsaWRhdGVLZXlzKG9iamVjdFtrZXldKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGtleS5pbmNsdWRlcygnJCcpIHx8IGtleS5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG4vLyBSZXR1cm5zIHRoZSBsaXN0IG9mIGpvaW4gdGFibGVzIG9uIGEgc2NoZW1hXG5jb25zdCBqb2luVGFibGVzRm9yU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgY29uc3QgbGlzdCA9IFtdO1xuICBpZiAoc2NoZW1hKSB7XG4gICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZCA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBsaXN0LnB1c2goYF9Kb2luOiR7ZmllbGR9OiR7c2NoZW1hLmNsYXNzTmFtZX1gKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gbGlzdDtcbn07XG5cbmludGVyZmFjZSBXaGVyZUNsYXVzZSB7XG4gIHBhdHRlcm46IHN0cmluZztcbiAgdmFsdWVzOiBBcnJheTxhbnk+O1xuICBzb3J0czogQXJyYXk8YW55Pjtcbn1cblxuY29uc3QgYnVpbGRXaGVyZUNsYXVzZSA9ICh7IHNjaGVtYSwgcXVlcnksIGluZGV4IH0pOiBXaGVyZUNsYXVzZSA9PiB7XG4gIGNvbnN0IHBhdHRlcm5zID0gW107XG4gIGxldCB2YWx1ZXMgPSBbXTtcbiAgY29uc3Qgc29ydHMgPSBbXTtcblxuICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSc7XG4gICAgY29uc3QgaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID0gcGF0dGVybnMubGVuZ3RoO1xuICAgIGNvbnN0IGZpZWxkVmFsdWUgPSBxdWVyeVtmaWVsZE5hbWVdO1xuXG4gICAgLy8gbm90aGluZyBpbiB0aGUgc2NoZW1hLCBpdCdzIGdvbm5hIGJsb3cgdXBcbiAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgLy8gYXMgaXQgd29uJ3QgZXhpc3RcbiAgICAgIGlmIChmaWVsZFZhbHVlICYmIGZpZWxkVmFsdWUuJGV4aXN0cyA9PT0gZmFsc2UpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgbGV0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJHtuYW1lfSBJUyBOVUxMYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgICBuYW1lID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06cmF3KTo6anNvbmIgQD4gJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChuYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRpbikpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS4kcmVnZXgpIHtcbiAgICAgICAgICAvLyBIYW5kbGUgbGF0ZXJcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3ID0gJCR7aW5kZXggKyAxfTo6dGV4dGApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgZmllbGRWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaW5kZXggKz0gMTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAvLyBDYW4ndCBjYXN0IGJvb2xlYW4gdG8gZG91YmxlIHByZWNpc2lvblxuICAgICAgaWYgKFxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdOdW1iZXInXG4gICAgICApIHtcbiAgICAgICAgLy8gU2hvdWxkIGFsd2F5cyByZXR1cm4gemVybyByZXN1bHRzXG4gICAgICAgIGNvbnN0IE1BWF9JTlRfUExVU19PTkUgPSA5MjIzMzcyMDM2ODU0Nzc1ODA4O1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIE1BWF9JTlRfUExVU19PTkUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChbJyRvcicsICckbm9yJywgJyRhbmQnXS5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICBjb25zdCBjbGF1c2VzID0gW107XG4gICAgICBjb25zdCBjbGF1c2VWYWx1ZXMgPSBbXTtcbiAgICAgIGZpZWxkVmFsdWUuZm9yRWFjaChzdWJRdWVyeSA9PiB7XG4gICAgICAgIGNvbnN0IGNsYXVzZSA9IGJ1aWxkV2hlcmVDbGF1c2UoeyBzY2hlbWEsIHF1ZXJ5OiBzdWJRdWVyeSwgaW5kZXggfSk7XG4gICAgICAgIGlmIChjbGF1c2UucGF0dGVybi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY2xhdXNlcy5wdXNoKGNsYXVzZS5wYXR0ZXJuKTtcbiAgICAgICAgICBjbGF1c2VWYWx1ZXMucHVzaCguLi5jbGF1c2UudmFsdWVzKTtcbiAgICAgICAgICBpbmRleCArPSBjbGF1c2UudmFsdWVzLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG9yT3JBbmQgPSBmaWVsZE5hbWUgPT09ICckYW5kJyA/ICcgQU5EICcgOiAnIE9SICc7XG4gICAgICBjb25zdCBub3QgPSBmaWVsZE5hbWUgPT09ICckbm9yJyA/ICcgTk9UICcgOiAnJztcblxuICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9KCR7Y2xhdXNlcy5qb2luKG9yT3JBbmQpfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKC4uLmNsYXVzZVZhbHVlcyk7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJG5lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgZmllbGRWYWx1ZS4kbmUgPSBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZS4kbmVdKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgTk9UIGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lID09PSBudWxsKSB7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gaWYgbm90IG51bGwsIHdlIG5lZWQgdG8gbWFudWFsbHkgZXhjbHVkZSBudWxsXG4gICAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgYCgkJHtpbmRleH06bmFtZSA8PiBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArXG4gICAgICAgICAgICAgICAgMn0pIE9SICQke2luZGV4fTpuYW1lIElTIE5VTEwpYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPD4gJCR7aW5kZXh9IE9SICR7Y29uc3RyYWludEZpZWxkTmFtZX0gSVMgTlVMTClgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRuZTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlKTtcbiAgICAgICAgaW5kZXggKz0gMztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFRPRE86IHN1cHBvcnQgYXJyYXlzXG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS4kbmUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZmllbGRWYWx1ZS4kZXEgIT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGVxID09PSBudWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSA9ICQke2luZGV4Kyt9YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBpc0luT3JOaW4gPVxuICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgfHwgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRuaW4pO1xuICAgIGlmIChcbiAgICAgIEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pICYmXG4gICAgICBpc0FycmF5RmllbGQgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cyAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzLnR5cGUgPT09ICdTdHJpbmcnXG4gICAgKSB7XG4gICAgICBjb25zdCBpblBhdHRlcm5zID0gW107XG4gICAgICBsZXQgYWxsb3dOdWxsID0gZmFsc2U7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgZmllbGRWYWx1ZS4kaW4uZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICBpZiAobGlzdEVsZW0gPT09IG51bGwpIHtcbiAgICAgICAgICBhbGxvd051bGwgPSB0cnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleCAtIChhbGxvd051bGwgPyAxIDogMCl9YCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKGFsbG93TnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgSVMgTlVMTCBPUiAkJHtpbmRleH06bmFtZSAmJiBBUlJBWVske2luUGF0dGVybnMuam9pbigpfV0pYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgIH0gZWxzZSBpZiAoaXNJbk9yTmluKSB7XG4gICAgICB2YXIgY3JlYXRlQ29uc3RyYWludCA9IChiYXNlQXJyYXksIG5vdEluKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vdCA9IG5vdEluID8gJyBOT1QgJyA6ICcnO1xuICAgICAgICBpZiAoYmFzZUFycmF5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICBgJHtub3R9IGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGJhc2VBcnJheSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSGFuZGxlIE5lc3RlZCBEb3QgTm90YXRpb24gQWJvdmVcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIGJhc2VBcnJheS5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGlmIChsaXN0RWxlbSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4fWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7bm90fSBJTiAoJHtpblBhdHRlcm5zLmpvaW4oKX0pYCk7XG4gICAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghbm90SW4pIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBIYW5kbGUgZW1wdHkgYXJyYXlcbiAgICAgICAgICBpZiAobm90SW4pIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAxJyk7IC8vIFJldHVybiBhbGwgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAyJyk7IC8vIFJldHVybiBubyB2YWx1ZXNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChfLmZsYXRNYXAoZmllbGRWYWx1ZS4kaW4sIGVsdCA9PiBlbHQpLCBmYWxzZSk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXy5mbGF0TWFwKGZpZWxkVmFsdWUuJG5pbiwgZWx0ID0+IGVsdCksIHRydWUpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkaW4gdmFsdWUnKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuaW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRuaW4gdmFsdWUnKTtcbiAgICB9XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpICYmIGlzQXJyYXlGaWVsZCkge1xuICAgICAgaWYgKGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICBpZiAoIWlzQWxsVmFsdWVzUmVnZXhPck5vbmUoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdBbGwgJGFsbCB2YWx1ZXMgbXVzdCBiZSBvZiByZWdleCB0eXBlIG9yIG5vbmU6ICcgKyBmaWVsZFZhbHVlLiRhbGxcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZFZhbHVlLiRhbGwubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHByb2Nlc3NSZWdleFBhdHRlcm4oZmllbGRWYWx1ZS4kYWxsW2ldLiRyZWdleCk7XG4gICAgICAgICAgZmllbGRWYWx1ZS4kYWxsW2ldID0gdmFsdWUuc3Vic3RyaW5nKDEpICsgJyUnO1xuICAgICAgICB9XG4gICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYGFycmF5X2NvbnRhaW5zX2FsbF9yZWdleCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICBgYXJyYXlfY29udGFpbnNfYWxsKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGFsbCkpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGFsbC5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS4kYWxsWzBdLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGV4aXN0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRleGlzdHMpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRjb250YWluZWRCeSkge1xuICAgICAgY29uc3QgYXJyID0gZmllbGRWYWx1ZS4kY29udGFpbmVkQnk7XG4gICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICRjb250YWluZWRCeTogc2hvdWxkIGJlIGFuIGFycmF5YFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA8QCAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShhcnIpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHRleHQpIHtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IGZpZWxkVmFsdWUuJHRleHQuJHNlYXJjaDtcbiAgICAgIGxldCBsYW5ndWFnZSA9ICdlbmdsaXNoJztcbiAgICAgIGlmICh0eXBlb2Ygc2VhcmNoICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRzZWFyY2gsIHNob3VsZCBiZSBvYmplY3RgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoIXNlYXJjaC4kdGVybSB8fCB0eXBlb2Ygc2VhcmNoLiR0ZXJtICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICR0ZXJtLCBzaG91bGQgYmUgc3RyaW5nYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGxhbmd1YWdlKSB7XG4gICAgICAgIGxhbmd1YWdlID0gc2VhcmNoLiRsYW5ndWFnZTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSBub3Qgc3VwcG9ydGVkLCBwbGVhc2UgdXNlICRyZWdleCBvciBjcmVhdGUgYSBzZXBhcmF0ZSBsb3dlciBjYXNlIGNvbHVtbi5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICYmXG4gICAgICAgIHR5cGVvZiBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSAtIGZhbHNlIG5vdCBzdXBwb3J0ZWQsIGluc3RhbGwgUG9zdGdyZXMgVW5hY2NlbnQgRXh0ZW5zaW9uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYHRvX3RzdmVjdG9yKCQke2luZGV4fSwgJCR7aW5kZXggKyAxfTpuYW1lKSBAQCB0b190c3F1ZXJ5KCQke2luZGV4ICtcbiAgICAgICAgICAyfSwgJCR7aW5kZXggKyAzfSlgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2gobGFuZ3VhZ2UsIGZpZWxkTmFtZSwgbGFuZ3VhZ2UsIHNlYXJjaC4kdGVybSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZWFyU3BoZXJlKSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lYXJTcGhlcmU7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGZpZWxkVmFsdWUuJG1heERpc3RhbmNlO1xuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9kaXN0YW5jZV9zcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArXG4gICAgICAgICAgMX0sICQke2luZGV4ICsgMn0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICBzb3J0cy5wdXNoKFxuICAgICAgICBgU1RfZGlzdGFuY2Vfc3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggK1xuICAgICAgICAgIDF9LCAkJHtpbmRleCArIDJ9KTo6Z2VvbWV0cnkpIEFTQ2BcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR3aXRoaW4gJiYgZmllbGRWYWx1ZS4kd2l0aGluLiRib3gpIHtcbiAgICAgIGNvbnN0IGJveCA9IGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94O1xuICAgICAgY29uc3QgbGVmdCA9IGJveFswXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCBib3R0b20gPSBib3hbMF0ubGF0aXR1ZGU7XG4gICAgICBjb25zdCByaWdodCA9IGJveFsxXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCB0b3AgPSBib3hbMV0ubGF0aXR1ZGU7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpib3hgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgoJHtsZWZ0fSwgJHtib3R0b219KSwgKCR7cmlnaHR9LCAke3RvcH0pKWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlKSB7XG4gICAgICBjb25zdCBjZW50ZXJTcGhlcmUgPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZTtcbiAgICAgIGlmICghKGNlbnRlclNwaGVyZSBpbnN0YW5jZW9mIEFycmF5KSB8fCBjZW50ZXJTcGhlcmUubGVuZ3RoIDwgMikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQgYW5kIGRpc3RhbmNlJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gR2V0IHBvaW50LCBjb252ZXJ0IHRvIGdlbyBwb2ludCBpZiBuZWNlc3NhcnkgYW5kIHZhbGlkYXRlXG4gICAgICBsZXQgcG9pbnQgPSBjZW50ZXJTcGhlcmVbMF07XG4gICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgIH0gZWxzZSBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGdlbyBwb2ludCBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgLy8gR2V0IGRpc3RhbmNlIGFuZCB2YWxpZGF0ZVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSBjZW50ZXJTcGhlcmVbMV07XG4gICAgICBpZiAoaXNOYU4oZGlzdGFuY2UpIHx8IGRpc3RhbmNlIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBkaXN0YW5jZSBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9kaXN0YW5jZV9zcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArXG4gICAgICAgICAgMX0sICQke2luZGV4ICsgMn0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uKSB7XG4gICAgICBjb25zdCBwb2x5Z29uID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uO1xuICAgICAgbGV0IHBvaW50cztcbiAgICAgIGlmICh0eXBlb2YgcG9seWdvbiA9PT0gJ29iamVjdCcgJiYgcG9seWdvbi5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBpZiAoIXBvbHlnb24uY29vcmRpbmF0ZXMgfHwgcG9seWdvbi5jb29yZGluYXRlcy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyBQb2x5Z29uLmNvb3JkaW5hdGVzIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgbG9uL2xhdCBwYWlycydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb24uY29vcmRpbmF0ZXM7XG4gICAgICB9IGVsc2UgaWYgKHBvbHlnb24gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIEdlb1BvaW50cydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb247XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIFwiYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBiZSBQb2x5Z29uIG9iamVjdCBvciBBcnJheSBvZiBQYXJzZS5HZW9Qb2ludCdzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBvaW50cyA9IHBvaW50c1xuICAgICAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgICAgcmV0dXJuIGAoJHtwb2ludFswXX0sICR7cG9pbnRbMV19KWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbignLCAnKTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50c30pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cyAmJiBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludCkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludDtcbiAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb0ludGVyc2VjdCB2YWx1ZTsgJHBvaW50IHNob3VsZCBiZSBHZW9Qb2ludCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIH1cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2x5Z29uIEA+ICQke2luZGV4ICsgMX06OnBvaW50YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICBsZXQgcmVnZXggPSBmaWVsZFZhbHVlLiRyZWdleDtcbiAgICAgIGxldCBvcGVyYXRvciA9ICd+JztcbiAgICAgIGNvbnN0IG9wdHMgPSBmaWVsZFZhbHVlLiRvcHRpb25zO1xuICAgICAgaWYgKG9wdHMpIHtcbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZignaScpID49IDApIHtcbiAgICAgICAgICBvcGVyYXRvciA9ICd+Kic7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZigneCcpID49IDApIHtcbiAgICAgICAgICByZWdleCA9IHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgcmVnZXggPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKHJlZ2V4KTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyAke29wZXJhdG9yfSAnJCR7aW5kZXggKyAxfTpyYXcnYCk7XG4gICAgICB2YWx1ZXMucHVzaChuYW1lLCByZWdleCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KFtmaWVsZFZhbHVlXSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmlzbyk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgaW5kZXggKz0gMztcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIE9iamVjdC5rZXlzKFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcikuZm9yRWFjaChjbXAgPT4ge1xuICAgICAgaWYgKGZpZWxkVmFsdWVbY21wXSB8fCBmaWVsZFZhbHVlW2NtcF0gPT09IDApIHtcbiAgICAgICAgY29uc3QgcGdDb21wYXJhdG9yID0gUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yW2NtcF07XG4gICAgICAgIGNvbnN0IHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZVtjbXBdKTtcbiAgICAgICAgbGV0IGNvbnN0cmFpbnRGaWVsZE5hbWU7XG4gICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICBsZXQgY2FzdFR5cGU7XG4gICAgICAgICAgc3dpdGNoICh0eXBlb2YgcG9zdGdyZXNWYWx1ZSkge1xuICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgICAgY2FzdFR5cGUgPSAnZG91YmxlIHByZWNpc2lvbic7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICAgIGNhc3RUeXBlID0gJ2Jvb2xlYW4nO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgIGNhc3RUeXBlID0gdW5kZWZpbmVkO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gY2FzdFR5cGVcbiAgICAgICAgICAgID8gYENBU1QgKCgke3RyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSl9KSBBUyAke2Nhc3RUeXBlfSlgXG4gICAgICAgICAgICA6IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3RyYWludEZpZWxkTmFtZSA9IGAkJHtpbmRleCsrfTpuYW1lYDtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHZhbHVlcy5wdXNoKHBvc3RncmVzVmFsdWUpO1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAke2NvbnN0cmFpbnRGaWVsZE5hbWV9ICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCsrfWApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKGluaXRpYWxQYXR0ZXJuc0xlbmd0aCA9PT0gcGF0dGVybnMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBQb3N0Z3JlcyBkb2Vzbid0IHN1cHBvcnQgdGhpcyBxdWVyeSB0eXBlIHlldCAke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICAgIGZpZWxkVmFsdWVcbiAgICAgICAgKX1gXG4gICAgICApO1xuICAgIH1cbiAgfVxuICB2YWx1ZXMgPSB2YWx1ZXMubWFwKHRyYW5zZm9ybVZhbHVlKTtcbiAgcmV0dXJuIHsgcGF0dGVybjogcGF0dGVybnMuam9pbignIEFORCAnKSwgdmFsdWVzLCBzb3J0cyB9O1xufTtcblxuZXhwb3J0IGNsYXNzIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIGNhblNvcnRPbkpvaW5UYWJsZXM6IGJvb2xlYW47XG5cbiAgLy8gUHJpdmF0ZVxuICBfY29sbGVjdGlvblByZWZpeDogc3RyaW5nO1xuICBfY2xpZW50OiBhbnk7XG4gIF9wZ3A6IGFueTtcblxuICBjb25zdHJ1Y3Rvcih7IHVyaSwgY29sbGVjdGlvblByZWZpeCA9ICcnLCBkYXRhYmFzZU9wdGlvbnMgfTogYW55KSB7XG4gICAgdGhpcy5fY29sbGVjdGlvblByZWZpeCA9IGNvbGxlY3Rpb25QcmVmaXg7XG4gICAgY29uc3QgeyBjbGllbnQsIHBncCB9ID0gY3JlYXRlQ2xpZW50KHVyaSwgZGF0YWJhc2VPcHRpb25zKTtcbiAgICB0aGlzLl9jbGllbnQgPSBjbGllbnQ7XG4gICAgdGhpcy5fcGdwID0gcGdwO1xuICAgIHRoaXMuY2FuU29ydE9uSm9pblRhYmxlcyA9IGZhbHNlO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgaWYgKCF0aGlzLl9jbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5fY2xpZW50LiRwb29sLmVuZCgpO1xuICB9XG5cbiAgX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMoY29ubjogYW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIHJldHVybiBjb25uXG4gICAgICAubm9uZShcbiAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIFwiX1NDSEVNQVwiICggXCJjbGFzc05hbWVcIiB2YXJDaGFyKDEyMCksIFwic2NoZW1hXCIganNvbmIsIFwiaXNQYXJzZUNsYXNzXCIgYm9vbCwgUFJJTUFSWSBLRVkgKFwiY2xhc3NOYW1lXCIpICknXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIHx8XG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yIHx8XG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVPYmplY3RFcnJvclxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBUYWJsZSBhbHJlYWR5IGV4aXN0cywgbXVzdCBoYXZlIGJlZW4gY3JlYXRlZCBieSBhIGRpZmZlcmVudCByZXF1ZXN0LiBJZ25vcmUgZXJyb3IuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5vbmUoXG4gICAgICAnU0VMRUNUIEVYSVNUUyAoU0VMRUNUIDEgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzIFdIRVJFIHRhYmxlX25hbWUgPSAkMSknLFxuICAgICAgW25hbWVdLFxuICAgICAgYSA9PiBhLmV4aXN0c1xuICAgICk7XG4gIH1cblxuICBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQudGFzaygnc2V0LWNsYXNzLWxldmVsLXBlcm1pc3Npb25zJywgYXN5bmMgdCA9PiB7XG4gICAgICBhd2FpdCBzZWxmLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKHQpO1xuICAgICAgY29uc3QgdmFsdWVzID0gW1xuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICdzY2hlbWEnLFxuICAgICAgICAnY2xhc3NMZXZlbFBlcm1pc3Npb25zJyxcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoQ0xQcyksXG4gICAgICBdO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICBgVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiPSQxYCxcbiAgICAgICAgdmFsdWVzXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkSW5kZXhlczogYW55LFxuICAgIGV4aXN0aW5nSW5kZXhlczogYW55ID0ge30sXG4gICAgZmllbGRzOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHN1Ym1pdHRlZEluZGV4ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdJbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGV4aXN0aW5nSW5kZXhlcyA9IHsgX2lkXzogeyBfaWQ6IDEgfSB9O1xuICAgIH1cbiAgICBjb25zdCBkZWxldGVkSW5kZXhlcyA9IFtdO1xuICAgIGNvbnN0IGluc2VydGVkSW5kZXhlcyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEluZGV4ZXMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEluZGV4ZXNbbmFtZV07XG4gICAgICBpZiAoZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgZGVsZXRlZEluZGV4ZXMucHVzaChuYW1lKTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nSW5kZXhlc1tuYW1lXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGZpZWxkKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGRzLCBrZXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICAgIGBGaWVsZCAke2tleX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBhZGQgaW5kZXguYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBleGlzdGluZ0luZGV4ZXNbbmFtZV0gPSBmaWVsZDtcbiAgICAgICAgaW5zZXJ0ZWRJbmRleGVzLnB1c2goe1xuICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIGNvbm4udHgoJ3NldC1pbmRleGVzLXdpdGgtc2NoZW1hLWZvcm1hdCcsIGFzeW5jIHQgPT4ge1xuICAgICAgaWYgKGluc2VydGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGF3YWl0IHNlbGYuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcywgdCk7XG4gICAgICB9XG4gICAgICBpZiAoZGVsZXRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmRyb3BJbmRleGVzKGNsYXNzTmFtZSwgZGVsZXRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgYXdhaXQgc2VsZi5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyh0KTtcbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgJDI6bmFtZSA9IGpzb25fb2JqZWN0X3NldF9rZXkoJDI6bmFtZSwgJDM6OnRleHQsICQ0Ojpqc29uYikgV0hFUkUgXCJjbGFzc05hbWVcIj0kMScsXG4gICAgICAgIFtjbGFzc05hbWUsICdzY2hlbWEnLCAnaW5kZXhlcycsIEpTT04uc3RyaW5naWZ5KGV4aXN0aW5nSW5kZXhlcyldXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgY3JlYXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogP2FueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICByZXR1cm4gY29ublxuICAgICAgLnR4KCdjcmVhdGUtY2xhc3MnLCB0ID0+IHtcbiAgICAgICAgY29uc3QgcTEgPSB0aGlzLmNyZWF0ZVRhYmxlKGNsYXNzTmFtZSwgc2NoZW1hLCB0KTtcbiAgICAgICAgY29uc3QgcTIgPSB0Lm5vbmUoXG4gICAgICAgICAgJ0lOU0VSVCBJTlRPIFwiX1NDSEVNQVwiIChcImNsYXNzTmFtZVwiLCBcInNjaGVtYVwiLCBcImlzUGFyc2VDbGFzc1wiKSBWQUxVRVMgKCQ8Y2xhc3NOYW1lPiwgJDxzY2hlbWE+LCB0cnVlKScsXG4gICAgICAgICAgeyBjbGFzc05hbWUsIHNjaGVtYSB9XG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IHEzID0gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgc2NoZW1hLmluZGV4ZXMsXG4gICAgICAgICAge30sXG4gICAgICAgICAgc2NoZW1hLmZpZWxkcyxcbiAgICAgICAgICB0XG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiB0LmJhdGNoKFtxMSwgcTIsIHEzXSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdG9QYXJzZVNjaGVtYShzY2hlbWEpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmRhdGFbMF0ucmVzdWx0LmNvZGUgPT09IFBvc3RncmVzVHJhbnNhY3Rpb25BYm9ydGVkRXJyb3IpIHtcbiAgICAgICAgICBlcnIgPSBlcnIuZGF0YVsxXS5yZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIGVyci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgICBlcnIuZGV0YWlsLmluY2x1ZGVzKGNsYXNzTmFtZSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIEp1c3QgY3JlYXRlIGEgdGFibGUsIGRvIG5vdCBpbnNlcnQgaW4gc2NoZW1hXG4gIGNyZWF0ZVRhYmxlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBkZWJ1ZygnY3JlYXRlVGFibGUnLCBjbGFzc05hbWUsIHNjaGVtYSk7XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBjb25zdCBwYXR0ZXJuc0FycmF5ID0gW107XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmFzc2lnbih7fSwgc2NoZW1hLmZpZWxkcyk7XG4gICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9mYWlsZWRfbG9naW5fY291bnQgPSB7IHR5cGU6ICdOdW1iZXInIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gICAgfVxuICAgIGxldCBpbmRleCA9IDI7XG4gICAgY29uc3QgcmVsYXRpb25zID0gW107XG4gICAgT2JqZWN0LmtleXMoZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBjb25zdCBwYXJzZVR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgIC8vIFNraXAgd2hlbiBpdCdzIGEgcmVsYXRpb25cbiAgICAgIC8vIFdlJ2xsIGNyZWF0ZSB0aGUgdGFibGVzIGxhdGVyXG4gICAgICBpZiAocGFyc2VUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmVsYXRpb25zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHBhcnNlVHlwZS5jb250ZW50cyA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIH1cbiAgICAgIHZhbHVlc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2gocGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUocGFyc2VUeXBlKSk7XG4gICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYCQke2luZGV4fTpuYW1lICQke2luZGV4ICsgMX06cmF3YCk7XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgUFJJTUFSWSBLRVkgKCQke2luZGV4fTpuYW1lKWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDI7XG4gICAgfSk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDE6bmFtZSAoJHtwYXR0ZXJuc0FycmF5LmpvaW4oKX0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi52YWx1ZXNBcnJheV07XG5cbiAgICBkZWJ1ZyhxcywgdmFsdWVzKTtcbiAgICByZXR1cm4gY29ubi50YXNrKCdjcmVhdGUtdGFibGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHNlbGYuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHModCk7XG4gICAgICAgIGF3YWl0IHQubm9uZShxcywgdmFsdWVzKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBUYWJsZSBhbHJlYWR5IGV4aXN0cywgbXVzdCBoYXZlIGJlZW4gY3JlYXRlZCBieSBhIGRpZmZlcmVudCByZXF1ZXN0LiBJZ25vcmUgdGhlIGVycm9yLlxuICAgICAgfVxuICAgICAgYXdhaXQgdC50eCgnY3JlYXRlLXRhYmxlLXR4JywgdHggPT4ge1xuICAgICAgICByZXR1cm4gdHguYmF0Y2goXG4gICAgICAgICAgcmVsYXRpb25zLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHR4Lm5vbmUoXG4gICAgICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBzY2hlbWFVcGdyYWRlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGRlYnVnKCdzY2hlbWFVcGdyYWRlJywgeyBjbGFzc05hbWUsIHNjaGVtYSB9KTtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICByZXR1cm4gY29ubi50eCgnc2NoZW1hLXVwZ3JhZGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IGNvbHVtbnMgPSBhd2FpdCB0Lm1hcChcbiAgICAgICAgJ1NFTEVDVCBjb2x1bW5fbmFtZSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zIFdIRVJFIHRhYmxlX25hbWUgPSAkPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IGNsYXNzTmFtZSB9LFxuICAgICAgICBhID0+IGEuY29sdW1uX25hbWVcbiAgICAgICk7XG4gICAgICBjb25zdCBuZXdDb2x1bW5zID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGNvbHVtbnMuaW5kZXhPZihpdGVtKSA9PT0gLTEpXG4gICAgICAgIC5tYXAoZmllbGROYW1lID0+XG4gICAgICAgICAgc2VsZi5hZGRGaWVsZElmTm90RXhpc3RzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLFxuICAgICAgICAgICAgdFxuICAgICAgICAgIClcbiAgICAgICAgKTtcblxuICAgICAgYXdhaXQgdC5iYXRjaChuZXdDb2x1bW5zKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFkZEZpZWxkSWZOb3RFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55LFxuICAgIGNvbm46IGFueVxuICApIHtcbiAgICAvLyBUT0RPOiBNdXN0IGJlIHJldmlzZWQgZm9yIGludmFsaWQgbG9naWMuLi5cbiAgICBkZWJ1ZygnYWRkRmllbGRJZk5vdEV4aXN0cycsIHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUgfSk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBjb25uLnR4KCdhZGQtZmllbGQtaWYtbm90LWV4aXN0cycsIGFzeW5jIHQgPT4ge1xuICAgICAgaWYgKHR5cGUudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAgICdBTFRFUiBUQUJMRSAkPGNsYXNzTmFtZTpuYW1lPiBBREQgQ09MVU1OICQ8ZmllbGROYW1lOm5hbWU+ICQ8cG9zdGdyZXNUeXBlOnJhdz4nLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgICAgcG9zdGdyZXNUeXBlOiBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSh0eXBlKSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBhd2FpdCBzZWxmLmNyZWF0ZUNsYXNzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIHsgZmllbGRzOiB7IFtmaWVsZE5hbWVdOiB0eXBlIH0gfSxcbiAgICAgICAgICAgICAgdFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBDb2x1bW4gYWxyZWFkeSBleGlzdHMsIGNyZWF0ZWQgYnkgb3RoZXIgcmVxdWVzdC4gQ2Fycnkgb24gdG8gc2VlIGlmIGl0J3MgdGhlIHJpZ2h0IHR5cGUuXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0LmFueShcbiAgICAgICAgJ1NFTEVDVCBcInNjaGVtYVwiIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPiBhbmQgKFwic2NoZW1hXCI6Ompzb24tPlxcJ2ZpZWxkc1xcJy0+JDxmaWVsZE5hbWU+KSBpcyBub3QgbnVsbCcsXG4gICAgICAgIHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUgfVxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3VsdFswXSkge1xuICAgICAgICB0aHJvdyAnQXR0ZW1wdGVkIHRvIGFkZCBhIGZpZWxkIHRoYXQgYWxyZWFkeSBleGlzdHMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIj1qc29uYl9zZXQoXCJzY2hlbWFcIiwgJDxwYXRoPiwgJDx0eXBlPikgIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDxjbGFzc05hbWU+JyxcbiAgICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBEcm9wcyBhIGNvbGxlY3Rpb24uIFJlc29sdmVzIHdpdGggdHJ1ZSBpZiBpdCB3YXMgYSBQYXJzZSBTY2hlbWEgKGVnLiBfVXNlciwgQ3VzdG9tLCBldGMuKVxuICAvLyBhbmQgcmVzb2x2ZXMgd2l0aCBmYWxzZSBpZiBpdCB3YXNuJ3QgKGVnLiBhIGpvaW4gdGFibGUpLiBSZWplY3RzIGlmIGRlbGV0aW9uIHdhcyBpbXBvc3NpYmxlLlxuICBkZWxldGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IG9wZXJhdGlvbnMgPSBbXG4gICAgICB7IHF1ZXJ5OiBgRFJPUCBUQUJMRSBJRiBFWElTVFMgJDE6bmFtZWAsIHZhbHVlczogW2NsYXNzTmFtZV0gfSxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBERUxFVEUgRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXM6IFtjbGFzc05hbWVdLFxuICAgICAgfSxcbiAgICBdO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC50eCh0ID0+IHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQob3BlcmF0aW9ucykpKVxuICAgICAgLnRoZW4oKCkgPT4gY2xhc3NOYW1lLmluZGV4T2YoJ19Kb2luOicpICE9IDApOyAvLyByZXNvbHZlcyB3aXRoIGZhbHNlIHdoZW4gX0pvaW4gdGFibGVcbiAgfVxuXG4gIC8vIERlbGV0ZSBhbGwgZGF0YSBrbm93biB0byB0aGlzIGFkYXB0ZXIuIFVzZWQgZm9yIHRlc3RpbmcuXG4gIGRlbGV0ZUFsbENsYXNzZXMoKSB7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgY29uc3QgaGVscGVycyA9IHRoaXMuX3BncC5oZWxwZXJzO1xuICAgIGRlYnVnKCdkZWxldGVBbGxDbGFzc2VzJyk7XG5cbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAudGFzaygnZGVsZXRlLWFsbC1jbGFzc2VzJywgYXN5bmMgdCA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHQuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJyk7XG4gICAgICAgICAgY29uc3Qgam9pbnMgPSByZXN1bHRzLnJlZHVjZSgobGlzdDogQXJyYXk8c3RyaW5nPiwgc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBsaXN0LmNvbmNhdChqb2luVGFibGVzRm9yU2NoZW1hKHNjaGVtYS5zY2hlbWEpKTtcbiAgICAgICAgICB9LCBbXSk7XG4gICAgICAgICAgY29uc3QgY2xhc3NlcyA9IFtcbiAgICAgICAgICAgICdfU0NIRU1BJyxcbiAgICAgICAgICAgICdfUHVzaFN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlNjaGVkdWxlJyxcbiAgICAgICAgICAgICdfSG9va3MnLFxuICAgICAgICAgICAgJ19HbG9iYWxDb25maWcnLFxuICAgICAgICAgICAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgICAgICAgICAgICdfQXVkaWVuY2UnLFxuICAgICAgICAgICAgLi4ucmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5jbGFzc05hbWUpLFxuICAgICAgICAgICAgLi4uam9pbnMsXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdCBxdWVyaWVzID0gY2xhc3Nlcy5tYXAoY2xhc3NOYW1lID0+ICh7XG4gICAgICAgICAgICBxdWVyeTogJ0RST1AgVEFCTEUgSUYgRVhJU1RTICQ8Y2xhc3NOYW1lOm5hbWU+JyxcbiAgICAgICAgICAgIHZhbHVlczogeyBjbGFzc05hbWUgfSxcbiAgICAgICAgICB9KSk7XG4gICAgICAgICAgYXdhaXQgdC50eCh0eCA9PiB0eC5ub25lKGhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIE5vIF9TQ0hFTUEgY29sbGVjdGlvbi4gRG9uJ3QgZGVsZXRlIGFueXRoaW5nLlxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBkZWJ1ZyhgZGVsZXRlQWxsQ2xhc3NlcyBkb25lIGluICR7bmV3IERhdGUoKS5nZXRUaW1lKCkgLSBub3d9YCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZSB0aGUgY29sdW1uIGFuZCBhbGwgdGhlIGRhdGEuIEZvciBSZWxhdGlvbnMsIHRoZSBfSm9pbiBjb2xsZWN0aW9uIGlzIGhhbmRsZWRcbiAgLy8gc3BlY2lhbGx5LCB0aGlzIGZ1bmN0aW9uIGRvZXMgbm90IGRlbGV0ZSBfSm9pbiBjb2x1bW5zLiBJdCBzaG91bGQsIGhvd2V2ZXIsIGluZGljYXRlXG4gIC8vIHRoYXQgdGhlIHJlbGF0aW9uIGZpZWxkcyBkb2VzIG5vdCBleGlzdCBhbnltb3JlLiBJbiBtb25nbywgdGhpcyBtZWFucyByZW1vdmluZyBpdCBmcm9tXG4gIC8vIHRoZSBfU0NIRU1BIGNvbGxlY3Rpb24uICBUaGVyZSBzaG91bGQgYmUgbm8gYWN0dWFsIGRhdGEgaW4gdGhlIGNvbGxlY3Rpb24gdW5kZXIgdGhlIHNhbWUgbmFtZVxuICAvLyBhcyB0aGUgcmVsYXRpb24gY29sdW1uLCBzbyBpdCdzIGZpbmUgdG8gYXR0ZW1wdCB0byBkZWxldGUgaXQuIElmIHRoZSBmaWVsZHMgbGlzdGVkIHRvIGJlXG4gIC8vIGRlbGV0ZWQgZG8gbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gc3VjY2Vzc2Z1bGx5IGFueXdheXMuIENoZWNraW5nIGZvclxuICAvLyBhdHRlbXB0cyB0byBkZWxldGUgbm9uLWV4aXN0ZW50IGZpZWxkcyBpcyB0aGUgcmVzcG9uc2liaWxpdHkgb2YgUGFyc2UgU2VydmVyLlxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgbm90IG9ibGlnYXRlZCB0byBkZWxldGUgZmllbGRzIGF0b21pY2FsbHkuIEl0IGlzIGdpdmVuIHRoZSBmaWVsZFxuICAvLyBuYW1lcyBpbiBhIGxpc3Qgc28gdGhhdCBkYXRhYmFzZXMgdGhhdCBhcmUgY2FwYWJsZSBvZiBkZWxldGluZyBmaWVsZHMgYXRvbWljYWxseVxuICAvLyBtYXkgZG8gc28uXG5cbiAgLy8gUmV0dXJucyBhIFByb21pc2UuXG4gIGRlbGV0ZUZpZWxkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgZmllbGROYW1lczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZGVidWcoJ2RlbGV0ZUZpZWxkcycsIGNsYXNzTmFtZSwgZmllbGROYW1lcyk7XG4gICAgZmllbGROYW1lcyA9IGZpZWxkTmFtZXMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBmaWVsZE5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBsaXN0LnB1c2goZmllbGROYW1lKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gbGlzdDtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXTtcbiAgICBjb25zdCBjb2x1bW5zID0gZmllbGROYW1lc1xuICAgICAgLm1hcCgobmFtZSwgaWR4KSA9PiB7XG4gICAgICAgIHJldHVybiBgJCR7aWR4ICsgMn06bmFtZWA7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywgRFJPUCBDT0xVTU4nKTtcblxuICAgIHJldHVybiB0aGlzLl9jbGllbnQudHgoJ2RlbGV0ZS1maWVsZHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIj0kPHNjaGVtYT4gV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IHNjaGVtYSwgY2xhc3NOYW1lIH1cbiAgICAgICk7XG4gICAgICBpZiAodmFsdWVzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgYXdhaXQgdC5ub25lKGBBTFRFUiBUQUJMRSAkMTpuYW1lIERST1AgQ09MVU1OICR7Y29sdW1uc31gLCB2YWx1ZXMpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGdldEFsbENsYXNzZXMoKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC50YXNrKCdnZXQtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGF3YWl0IHNlbGYuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHModCk7XG4gICAgICByZXR1cm4gYXdhaXQgdC5tYXAoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInLCBudWxsLCByb3cgPT5cbiAgICAgICAgdG9QYXJzZVNjaGVtYSh7IGNsYXNzTmFtZTogcm93LmNsYXNzTmFtZSwgLi4ucm93LnNjaGVtYSB9KVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIHRoZSBzY2hlbWEgd2l0aCB0aGUgZ2l2ZW4gbmFtZSwgaW4gUGFyc2UgZm9ybWF0LiBJZlxuICAvLyB0aGlzIGFkYXB0ZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSBzY2hlbWEsIHJldHVybiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpdGhcbiAgLy8gdW5kZWZpbmVkIGFzIHRoZSByZWFzb24uXG4gIGdldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgZGVidWcoJ2dldENsYXNzJywgY2xhc3NOYW1lKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDxjbGFzc05hbWU+Jywge1xuICAgICAgICBjbGFzc05hbWUsXG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdC5sZW5ndGggIT09IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFswXS5zY2hlbWE7XG4gICAgICB9KVxuICAgICAgLnRoZW4odG9QYXJzZVNjaGVtYSk7XG4gIH1cblxuICAvLyBUT0RPOiByZW1vdmUgdGhlIG1vbmdvIGZvcm1hdCBkZXBlbmRlbmN5IGluIHRoZSByZXR1cm4gdmFsdWVcbiAgY3JlYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnY3JlYXRlT2JqZWN0JywgY2xhc3NOYW1lLCBvYmplY3QpO1xuICAgIGxldCBjb2x1bW5zQXJyYXkgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXNBcnJheSA9IFtdO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBnZW9Qb2ludHMgPSB7fTtcblxuICAgIG9iamVjdCA9IGhhbmRsZURvdEZpZWxkcyhvYmplY3QpO1xuXG4gICAgdmFsaWRhdGVLZXlzKG9iamVjdCk7XG5cbiAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB2YXIgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddID0gb2JqZWN0WydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZmllbGROYW1lID0gJ2F1dGhEYXRhJztcbiAgICAgIH1cblxuICAgICAgY29sdW1uc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2VtYWlsX3ZlcmlmeV90b2tlbicgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZmFpbGVkX2xvZ2luX2NvdW50JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wYXNzd29yZF9oaXN0b3J5J1xuICAgICAgICApIHtcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wYXNzd29yZF9jaGFuZ2VkX2F0J1xuICAgICAgICApIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc3dpdGNoIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSkge1xuICAgICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0ub2JqZWN0SWQpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBcnJheSc6XG4gICAgICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChKU09OLnN0cmluZ2lmeShvYmplY3RbZmllbGROYW1lXSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgICBjYXNlICdOdW1iZXInOlxuICAgICAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5uYW1lKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9seWdvbic6IHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwob2JqZWN0W2ZpZWxkTmFtZV0uY29vcmRpbmF0ZXMpO1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2godmFsdWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgICAgICAvLyBwb3AgdGhlIHBvaW50IGFuZCBwcm9jZXNzIGxhdGVyXG4gICAgICAgICAgZ2VvUG9pbnRzW2ZpZWxkTmFtZV0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgICBjb2x1bW5zQXJyYXkucG9wKCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgYFR5cGUgJHtzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZX0gbm90IHN1cHBvcnRlZCB5ZXRgO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29sdW1uc0FycmF5ID0gY29sdW1uc0FycmF5LmNvbmNhdChPYmplY3Qua2V5cyhnZW9Qb2ludHMpKTtcbiAgICBjb25zdCBpbml0aWFsVmFsdWVzID0gdmFsdWVzQXJyYXkubWFwKCh2YWwsIGluZGV4KSA9PiB7XG4gICAgICBsZXQgdGVybWluYXRpb24gPSAnJztcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGNvbHVtbnNBcnJheVtpbmRleF07XG4gICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgdGVybWluYXRpb24gPSAnOjp0ZXh0W10nO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknXG4gICAgICApIHtcbiAgICAgICAgdGVybWluYXRpb24gPSAnOjpqc29uYic7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCQke2luZGV4ICsgMiArIGNvbHVtbnNBcnJheS5sZW5ndGh9JHt0ZXJtaW5hdGlvbn1gO1xuICAgIH0pO1xuICAgIGNvbnN0IGdlb1BvaW50c0luamVjdHMgPSBPYmplY3Qua2V5cyhnZW9Qb2ludHMpLm1hcChrZXkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBnZW9Qb2ludHNba2V5XTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2godmFsdWUubG9uZ2l0dWRlLCB2YWx1ZS5sYXRpdHVkZSk7XG4gICAgICBjb25zdCBsID0gdmFsdWVzQXJyYXkubGVuZ3RoICsgY29sdW1uc0FycmF5Lmxlbmd0aDtcbiAgICAgIHJldHVybiBgUE9JTlQoJCR7bH0sICQke2wgKyAxfSlgO1xuICAgIH0pO1xuXG4gICAgY29uc3QgY29sdW1uc1BhdHRlcm4gPSBjb2x1bW5zQXJyYXlcbiAgICAgIC5tYXAoKGNvbCwgaW5kZXgpID0+IGAkJHtpbmRleCArIDJ9Om5hbWVgKVxuICAgICAgLmpvaW4oKTtcbiAgICBjb25zdCB2YWx1ZXNQYXR0ZXJuID0gaW5pdGlhbFZhbHVlcy5jb25jYXQoZ2VvUG9pbnRzSW5qZWN0cykuam9pbigpO1xuXG4gICAgY29uc3QgcXMgPSBgSU5TRVJUIElOVE8gJDE6bmFtZSAoJHtjb2x1bW5zUGF0dGVybn0pIFZBTFVFUyAoJHt2YWx1ZXNQYXR0ZXJufSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmNvbHVtbnNBcnJheSwgLi4udmFsdWVzQXJyYXldO1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udFxuICAgICAgOiB0aGlzLl9jbGllbnRcbiAgICApXG4gICAgICAubm9uZShxcywgdmFsdWVzKVxuICAgICAgLnRoZW4oKCkgPT4gKHsgb3BzOiBbb2JqZWN0XSB9KSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICAgIGVyci51bmRlcmx5aW5nRXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICBpZiAoZXJyb3IuY29uc3RyYWludCkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLmNvbnN0cmFpbnQubWF0Y2goL3VuaXF1ZV8oW2EtekEtWl0rKS8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMgJiYgQXJyYXkuaXNBcnJheShtYXRjaGVzKSkge1xuICAgICAgICAgICAgICBlcnIudXNlckluZm8gPSB7IGR1cGxpY2F0ZWRfZmllbGQ6IG1hdGNoZXNbMV0gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgZXJyb3IgPSBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICAvLyBJZiBubyBvYmplY3RzIG1hdGNoLCByZWplY3Qgd2l0aCBPQkpFQ1RfTk9UX0ZPVU5ELiBJZiBvYmplY3RzIGFyZSBmb3VuZCBhbmQgZGVsZXRlZCwgcmVzb2x2ZSB3aXRoIHVuZGVmaW5lZC5cbiAgLy8gSWYgdGhlcmUgaXMgc29tZSBvdGhlciBlcnJvciwgcmVqZWN0IHdpdGggSU5URVJOQUxfU0VSVkVSX0VSUk9SLlxuICBkZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnZGVsZXRlT2JqZWN0c0J5UXVlcnknLCBjbGFzc05hbWUsIHF1ZXJ5KTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCBpbmRleCA9IDI7XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHsgc2NoZW1hLCBpbmRleCwgcXVlcnkgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcbiAgICBpZiAoT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgd2hlcmUucGF0dGVybiA9ICdUUlVFJztcbiAgICB9XG4gICAgY29uc3QgcXMgPSBgV0lUSCBkZWxldGVkIEFTIChERUxFVEUgRlJPTSAkMTpuYW1lIFdIRVJFICR7d2hlcmUucGF0dGVybn0gUkVUVVJOSU5HICopIFNFTEVDVCBjb3VudCgqKSBGUk9NIGRlbGV0ZWRgO1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udFxuICAgICAgOiB0aGlzLl9jbGllbnRcbiAgICApXG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4gK2EuY291bnQpXG4gICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogRG9uJ3QgZGVsZXRlIGFueXRoaW5nIGlmIGRvZXNuJ3QgZXhpc3RcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBkZWJ1ZygnZmluZE9uZUFuZFVwZGF0ZScsIGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIHVwZGF0ZSxcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgKS50aGVuKHZhbCA9PiB2YWxbMF0pO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxbYW55XT4ge1xuICAgIGRlYnVnKCd1cGRhdGVPYmplY3RzQnlRdWVyeScsIGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgY29uc3QgdXBkYXRlUGF0dGVybnMgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcblxuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0geyAuLi51cGRhdGUgfTtcblxuICAgIC8vIFNldCBmbGFnIGZvciBkb3Qgbm90YXRpb24gZmllbGRzXG4gICAgY29uc3QgZG90Tm90YXRpb25PcHRpb25zID0ge307XG4gICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaXJzdF0gPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0gPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB1cGRhdGUgPSBoYW5kbGVEb3RGaWVsZHModXBkYXRlKTtcbiAgICAvLyBSZXNvbHZlIGF1dGhEYXRhIGZpcnN0LFxuICAgIC8vIFNvIHdlIGRvbid0IGVuZCB1cCB3aXRoIG11bHRpcGxlIGtleSB1cGRhdGVzXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXSA9IHVwZGF0ZVsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgZmllbGRWYWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgLy8gRHJvcCBhbnkgdW5kZWZpbmVkIHZhbHVlcy5cbiAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT0gJ2F1dGhEYXRhJykge1xuICAgICAgICAvLyBUaGlzIHJlY3Vyc2l2ZWx5IHNldHMgdGhlIGpzb25fb2JqZWN0XG4gICAgICAgIC8vIE9ubHkgMSBsZXZlbCBkZWVwXG4gICAgICAgIGNvbnN0IGdlbmVyYXRlID0gKGpzb25iOiBzdHJpbmcsIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGBqc29uX29iamVjdF9zZXRfa2V5KENPQUxFU0NFKCR7anNvbmJ9LCAne30nOjpqc29uYiksICR7a2V5fSwgJHt2YWx1ZX0pOjpqc29uYmA7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGxhc3RLZXkgPSBgJCR7aW5kZXh9Om5hbWVgO1xuICAgICAgICBjb25zdCBmaWVsZE5hbWVJbmRleCA9IGluZGV4O1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBjb25zdCB1cGRhdGUgPSBPYmplY3Qua2V5cyhmaWVsZFZhbHVlKS5yZWR1Y2UoXG4gICAgICAgICAgKGxhc3RLZXk6IHN0cmluZywga2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHN0ciA9IGdlbmVyYXRlKFxuICAgICAgICAgICAgICBsYXN0S2V5LFxuICAgICAgICAgICAgICBgJCR7aW5kZXh9Ojp0ZXh0YCxcbiAgICAgICAgICAgICAgYCQke2luZGV4ICsgMX06Ompzb25iYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChrZXksIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBsYXN0S2V5XG4gICAgICAgICk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2ZpZWxkTmFtZUluZGV4fTpuYW1lID0gJHt1cGRhdGV9YCk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0luY3JlbWVudCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgMCkgKyAkJHtpbmRleCArIDF9YFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuYW1vdW50KTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZChDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtpbmRleCArXG4gICAgICAgICAgICAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIG51bGwpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdSZW1vdmUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfcmVtb3ZlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke2luZGV4ICtcbiAgICAgICAgICAgIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZFVuaXF1ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGRfdW5pcXVlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke2luZGV4ICtcbiAgICAgICAgICAgIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgLy9UT0RPOiBzdG9wIHNwZWNpYWwgY2FzaW5nIHRoaXMuIEl0IHNob3VsZCBjaGVjayBmb3IgX190eXBlID09PSAnRGF0ZScgYW5kIHVzZSAuaXNvXG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIC8vIG5vb3BcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ09iamVjdCdcbiAgICAgICkge1xuICAgICAgICAvLyBHYXRoZXIga2V5cyB0byBpbmNyZW1lbnRcbiAgICAgICAgY29uc3Qga2V5c1RvSW5jcmVtZW50ID0gT2JqZWN0LmtleXMob3JpZ2luYWxVcGRhdGUpXG4gICAgICAgICAgLmZpbHRlcihrID0+IHtcbiAgICAgICAgICAgIC8vIGNob29zZSB0b3AgbGV2ZWwgZmllbGRzIHRoYXQgaGF2ZSBhIGRlbGV0ZSBvcGVyYXRpb24gc2V0XG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgT2JqZWN0LmtleXMgaXMgaXRlcmF0aW5nIG92ZXIgdGhlICoqb3JpZ2luYWwqKiB1cGRhdGUgb2JqZWN0XG4gICAgICAgICAgICAvLyBhbmQgdGhhdCBzb21lIG9mIHRoZSBrZXlzIG9mIHRoZSBvcmlnaW5hbCB1cGRhdGUgY291bGQgYmUgbnVsbCBvciB1bmRlZmluZWQ6XG4gICAgICAgICAgICAvLyAoU2VlIHRoZSBhYm92ZSBjaGVjayBgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIGZpZWxkVmFsdWUgPT0gXCJ1bmRlZmluZWRcIilgKVxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcmlnaW5hbFVwZGF0ZVtrXTtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHZhbHVlICYmXG4gICAgICAgICAgICAgIHZhbHVlLl9fb3AgPT09ICdJbmNyZW1lbnQnICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpWzBdID09PSBmaWVsZE5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGsgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBsZXQgaW5jcmVtZW50UGF0dGVybnMgPSAnJztcbiAgICAgICAgaWYgKGtleXNUb0luY3JlbWVudC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaW5jcmVtZW50UGF0dGVybnMgPVxuICAgICAgICAgICAgJyB8fCAnICtcbiAgICAgICAgICAgIGtleXNUb0luY3JlbWVudFxuICAgICAgICAgICAgICAubWFwKGMgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFtb3VudCA9IGZpZWxkVmFsdWVbY10uYW1vdW50O1xuICAgICAgICAgICAgICAgIHJldHVybiBgQ09OQ0FUKCd7XCIke2N9XCI6JywgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUtPj4nJHtjfScsJzAnKTo6aW50ICsgJHthbW91bnR9LCAnfScpOjpqc29uYmA7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5qb2luKCcgfHwgJyk7XG4gICAgICAgICAgLy8gU3RyaXAgdGhlIGtleXNcbiAgICAgICAgICBrZXlzVG9JbmNyZW1lbnQuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgICAgZGVsZXRlIGZpZWxkVmFsdWVba2V5XTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGtleXNUb0RlbGV0ZTogQXJyYXk8c3RyaW5nPiA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldC5cbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnRGVsZXRlJyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgY29uc3QgZGVsZXRlUGF0dGVybnMgPSBrZXlzVG9EZWxldGUucmVkdWNlKFxuICAgICAgICAgIChwOiBzdHJpbmcsIGM6IHN0cmluZywgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcCArIGAgLSAnJCR7aW5kZXggKyAxICsgaX06dmFsdWUnYDtcbiAgICAgICAgICB9LFxuICAgICAgICAgICcnXG4gICAgICAgICk7XG4gICAgICAgIC8vIE92ZXJyaWRlIE9iamVjdFxuICAgICAgICBsZXQgdXBkYXRlT2JqZWN0ID0gXCIne30nOjpqc29uYlwiO1xuXG4gICAgICAgIGlmIChkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSkge1xuICAgICAgICAgIC8vIE1lcmdlIE9iamVjdFxuICAgICAgICAgIHVwZGF0ZU9iamVjdCA9IGBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ3t9Jzo6anNvbmIpYDtcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9ICgke3VwZGF0ZU9iamVjdH0gJHtkZWxldGVQYXR0ZXJuc30gJHtpbmNyZW1lbnRQYXR0ZXJuc30gfHwgJCR7aW5kZXggK1xuICAgICAgICAgICAgMSArXG4gICAgICAgICAgICBrZXlzVG9EZWxldGUubGVuZ3RofTo6anNvbmIgKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCAuLi5rZXlzVG9EZWxldGUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMiArIGtleXNUb0RlbGV0ZS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUpICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5J1xuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSk7XG4gICAgICAgIGlmIChleHBlY3RlZFR5cGUgPT09ICd0ZXh0W10nKSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojp0ZXh0W11gKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdOb3Qgc3VwcG9ydGVkIHVwZGF0ZScsIGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB1cGRhdGUgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX0geWV0YFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2UoeyBzY2hlbWEsIGluZGV4LCBxdWVyeSB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVDbGF1c2UgPVxuICAgICAgd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgcXMgPSBgVVBEQVRFICQxOm5hbWUgU0VUICR7dXBkYXRlUGF0dGVybnMuam9pbigpfSAke3doZXJlQ2xhdXNlfSBSRVRVUk5JTkcgKmA7XG4gICAgZGVidWcoJ3VwZGF0ZTogJywgcXMsIHZhbHVlcyk7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50XG4gICAgICA6IHRoaXMuX2NsaWVudFxuICAgICkuYW55KHFzLCB2YWx1ZXMpO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvLyBIb3BlZnVsbHksIHdlIGNhbiBnZXQgcmlkIG9mIHRoaXMuIEl0J3Mgb25seSB1c2VkIGZvciBjb25maWcgYW5kIGhvb2tzLlxuICB1cHNlcnRPbmVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ3Vwc2VydE9uZU9iamVjdCcsIHsgY2xhc3NOYW1lLCBxdWVyeSwgdXBkYXRlIH0pO1xuICAgIGNvbnN0IGNyZWF0ZVZhbHVlID0gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlT2JqZWN0KFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgc2NoZW1hLFxuICAgICAgY3JlYXRlVmFsdWUsXG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgLy8gaWdub3JlIGR1cGxpY2F0ZSB2YWx1ZSBlcnJvcnMgYXMgaXQncyB1cHNlcnRcbiAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5maW5kT25lQW5kVXBkYXRlKFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIHNjaGVtYSxcbiAgICAgICAgcXVlcnksXG4gICAgICAgIHVwZGF0ZSxcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMgfTogUXVlcnlPcHRpb25zXG4gICkge1xuICAgIGRlYnVnKCdmaW5kJywgY2xhc3NOYW1lLCBxdWVyeSwgeyBza2lwLCBsaW1pdCwgc29ydCwga2V5cyB9KTtcbiAgICBjb25zdCBoYXNMaW1pdCA9IGxpbWl0ICE9PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgaGFzU2tpcCA9IHNraXAgIT09IHVuZGVmaW5lZDtcbiAgICBsZXQgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHsgc2NoZW1hLCBxdWVyeSwgaW5kZXg6IDIgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9XG4gICAgICB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCBsaW1pdFBhdHRlcm4gPSBoYXNMaW1pdCA/IGBMSU1JVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc0xpbWl0KSB7XG4gICAgICB2YWx1ZXMucHVzaChsaW1pdCk7XG4gICAgfVxuICAgIGNvbnN0IHNraXBQYXR0ZXJuID0gaGFzU2tpcCA/IGBPRkZTRVQgJCR7dmFsdWVzLmxlbmd0aCArIDF9YCA6ICcnO1xuICAgIGlmIChoYXNTa2lwKSB7XG4gICAgICB2YWx1ZXMucHVzaChza2lwKTtcbiAgICB9XG5cbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBpZiAoc29ydCkge1xuICAgICAgY29uc3Qgc29ydENvcHk6IGFueSA9IHNvcnQ7XG4gICAgICBjb25zdCBzb3J0aW5nID0gT2JqZWN0LmtleXMoc29ydClcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybUtleSA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGtleSkuam9pbignLT4nKTtcbiAgICAgICAgICAvLyBVc2luZyAkaWR4IHBhdHRlcm4gZ2l2ZXM6ICBub24taW50ZWdlciBjb25zdGFudCBpbiBPUkRFUiBCWVxuICAgICAgICAgIGlmIChzb3J0Q29weVtrZXldID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gYCR7dHJhbnNmb3JtS2V5fSBBU0NgO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCR7dHJhbnNmb3JtS2V5fSBERVNDYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHNvcnRQYXR0ZXJuID1cbiAgICAgICAgc29ydCAhPT0gdW5kZWZpbmVkICYmIE9iamVjdC5rZXlzKHNvcnQpLmxlbmd0aCA+IDBcbiAgICAgICAgICA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YFxuICAgICAgICAgIDogJyc7XG4gICAgfVxuICAgIGlmICh3aGVyZS5zb3J0cyAmJiBPYmplY3Qua2V5cygod2hlcmUuc29ydHM6IGFueSkpLmxlbmd0aCA+IDApIHtcbiAgICAgIHNvcnRQYXR0ZXJuID0gYE9SREVSIEJZICR7d2hlcmUuc29ydHMuam9pbigpfWA7XG4gICAgfVxuXG4gICAgbGV0IGNvbHVtbnMgPSAnKic7XG4gICAgaWYgKGtleXMpIHtcbiAgICAgIC8vIEV4Y2x1ZGUgZW1wdHkga2V5c1xuICAgICAgLy8gUmVwbGFjZSBBQ0wgYnkgaXQncyBrZXlzXG4gICAgICBrZXlzID0ga2V5cy5yZWR1Y2UoKG1lbW8sIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5ID09PSAnQUNMJykge1xuICAgICAgICAgIG1lbW8ucHVzaCgnX3JwZXJtJyk7XG4gICAgICAgICAgbWVtby5wdXNoKCdfd3Blcm0nKTtcbiAgICAgICAgfSBlbHNlIGlmIChrZXkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIG1lbW8ucHVzaChrZXkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfSwgW10pO1xuICAgICAgY29sdW1ucyA9IGtleXNcbiAgICAgICAgLm1hcCgoa2V5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIGlmIChrZXkgPT09ICckc2NvcmUnKSB7XG4gICAgICAgICAgICByZXR1cm4gYHRzX3JhbmtfY2QodG9fdHN2ZWN0b3IoJCR7Mn0sICQkezN9Om5hbWUpLCB0b190c3F1ZXJ5KCQkezR9LCAkJHs1fSksIDMyKSBhcyBzY29yZWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJCR7aW5kZXggKyB2YWx1ZXMubGVuZ3RoICsgMX06bmFtZWA7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCk7XG4gICAgICB2YWx1ZXMgPSB2YWx1ZXMuY29uY2F0KGtleXMpO1xuICAgIH1cblxuICAgIGNvbnN0IHFzID0gYFNFTEVDVCAke2NvbHVtbnN9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtzb3J0UGF0dGVybn0gJHtsaW1pdFBhdHRlcm59ICR7c2tpcFBhdHRlcm59YDtcbiAgICBkZWJ1ZyhxcywgdmFsdWVzKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KHFzLCB2YWx1ZXMpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBRdWVyeSBvbiBub24gZXhpc3RpbmcgdGFibGUsIGRvbid0IGNyYXNoXG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW107XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PlxuICAgICAgICByZXN1bHRzLm1hcChvYmplY3QgPT5cbiAgICAgICAgICB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKVxuICAgICAgICApXG4gICAgICApO1xuICB9XG5cbiAgLy8gQ29udmVydHMgZnJvbSBhIHBvc3RncmVzLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4gIC8vIERvZXMgbm90IHN0cmlwIG91dCBhbnl0aGluZyBiYXNlZCBvbiBhIGxhY2sgb2YgYXV0aGVudGljYXRpb24uXG4gIHBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHNjaGVtYTogYW55KSB7XG4gICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicgJiYgb2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgbGF0aXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLnksXG4gICAgICAgICAgbG9uZ2l0dWRlOiBvYmplY3RbZmllbGROYW1lXS54LFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgbGV0IGNvb3JkcyA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBjb29yZHMgPSBjb29yZHMuc3Vic3RyKDIsIGNvb3Jkcy5sZW5ndGggLSA0KS5zcGxpdCgnKSwoJyk7XG4gICAgICAgIGNvb3JkcyA9IGNvb3Jkcy5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMV0pLFxuICAgICAgICAgICAgcGFyc2VGbG9hdChwb2ludC5zcGxpdCgnLCcpWzBdKSxcbiAgICAgICAgICBdO1xuICAgICAgICB9KTtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICAgICAgY29vcmRpbmF0ZXM6IGNvb3JkcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgICAgIG5hbWU6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIC8vVE9ETzogcmVtb3ZlIHRoaXMgcmVsaWFuY2Ugb24gdGhlIG1vbmdvIGZvcm1hdC4gREIgYWRhcHRlciBzaG91bGRuJ3Qga25vdyB0aGVyZSBpcyBhIGRpZmZlcmVuY2UgYmV0d2VlbiBjcmVhdGVkIGF0IGFuZCBhbnkgb3RoZXIgZGF0ZSBmaWVsZC5cbiAgICBpZiAob2JqZWN0LmNyZWF0ZWRBdCkge1xuICAgICAgb2JqZWN0LmNyZWF0ZWRBdCA9IG9iamVjdC5jcmVhdGVkQXQudG9JU09TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC51cGRhdGVkQXQpIHtcbiAgICAgIG9iamVjdC51cGRhdGVkQXQgPSBvYmplY3QudXBkYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QuZXhwaXJlc0F0KSB7XG4gICAgICBvYmplY3QuZXhwaXJlc0F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuZXhwaXJlc0F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0KSB7XG4gICAgICBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICAgIGlzbzogb2JqZWN0W2ZpZWxkTmFtZV0udG9JU09TdHJpbmcoKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBlbnN1cmVVbmlxdWVuZXNzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXVxuICApIHtcbiAgICAvLyBVc2UgdGhlIHNhbWUgbmFtZSBmb3IgZXZlcnkgZW5zdXJlVW5pcXVlbmVzcyBhdHRlbXB0LCBiZWNhdXNlIHBvc3RncmVzXG4gICAgLy8gV2lsbCBoYXBwaWx5IGNyZWF0ZSB0aGUgc2FtZSBpbmRleCB3aXRoIG11bHRpcGxlIG5hbWVzLlxuICAgIGNvbnN0IGNvbnN0cmFpbnROYW1lID0gYHVuaXF1ZV8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGZpZWxkTmFtZXMubWFwKFxuICAgICAgKGZpZWxkTmFtZSwgaW5kZXgpID0+IGAkJHtpbmRleCArIDN9Om5hbWVgXG4gICAgKTtcbiAgICBjb25zdCBxcyA9IGBBTFRFUiBUQUJMRSAkMTpuYW1lIEFERCBDT05TVFJBSU5UICQyOm5hbWUgVU5JUVVFICgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLm5vbmUocXMsIFtjbGFzc05hbWUsIGNvbnN0cmFpbnROYW1lLCAuLi5maWVsZE5hbWVzXSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGNvbnN0cmFpbnROYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBJbmRleCBhbHJlYWR5IGV4aXN0cy4gSWdub3JlIGVycm9yLlxuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpXG4gICAgICAgICkge1xuICAgICAgICAgIC8vIENhc3QgdGhlIGVycm9yIGludG8gdGhlIHByb3BlciBwYXJzZSBlcnJvclxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBjb3VudC5cbiAgY291bnQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgcmVhZFByZWZlcmVuY2U/OiBzdHJpbmcsXG4gICAgZXN0aW1hdGU/OiBib29sZWFuID0gdHJ1ZVxuICApIHtcbiAgICBkZWJ1ZygnY291bnQnLCBjbGFzc05hbWUsIHF1ZXJ5LCByZWFkUHJlZmVyZW5jZSwgZXN0aW1hdGUpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7IHNjaGVtYSwgcXVlcnksIGluZGV4OiAyIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPVxuICAgICAgd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgbGV0IHFzID0gJyc7XG5cbiAgICBpZiAod2hlcmUucGF0dGVybi5sZW5ndGggPiAwIHx8ICFlc3RpbWF0ZSkge1xuICAgICAgcXMgPSBgU0VMRUNUIGNvdW50KCopIEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIH0gZWxzZSB7XG4gICAgICBxcyA9XG4gICAgICAgICdTRUxFQ1QgcmVsdHVwbGVzIEFTIGFwcHJveGltYXRlX3Jvd19jb3VudCBGUk9NIHBnX2NsYXNzIFdIRVJFIHJlbG5hbWUgPSAkMSc7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLm9uZShxcywgdmFsdWVzLCBhID0+IHtcbiAgICAgICAgaWYgKGEuYXBwcm94aW1hdGVfcm93X2NvdW50ICE9IG51bGwpIHtcbiAgICAgICAgICByZXR1cm4gK2EuYXBwcm94aW1hdGVfcm93X2NvdW50O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiArYS5jb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0pO1xuICB9XG5cbiAgZGlzdGluY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgZmllbGROYW1lOiBzdHJpbmdcbiAgKSB7XG4gICAgZGVidWcoJ2Rpc3RpbmN0JywgY2xhc3NOYW1lLCBxdWVyeSk7XG4gICAgbGV0IGZpZWxkID0gZmllbGROYW1lO1xuICAgIGxldCBjb2x1bW4gPSBmaWVsZE5hbWU7XG4gICAgY29uc3QgaXNOZXN0ZWQgPSBmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDA7XG4gICAgaWYgKGlzTmVzdGVkKSB7XG4gICAgICBmaWVsZCA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGZpZWxkTmFtZSkuam9pbignLT4nKTtcbiAgICAgIGNvbHVtbiA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xuICAgIH1cbiAgICBjb25zdCBpc0FycmF5RmllbGQgPVxuICAgICAgc2NoZW1hLmZpZWxkcyAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcic7XG4gICAgY29uc3QgdmFsdWVzID0gW2ZpZWxkLCBjb2x1bW4sIGNsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHsgc2NoZW1hLCBxdWVyeSwgaW5kZXg6IDQgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9XG4gICAgICB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCB0cmFuc2Zvcm1lciA9IGlzQXJyYXlGaWVsZCA/ICdqc29uYl9hcnJheV9lbGVtZW50cycgOiAnT04nO1xuICAgIGxldCBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6bmFtZSkgJDI6bmFtZSBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpyYXcpICQyOnJhdyBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yKSB7XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoIWlzTmVzdGVkKSB7XG4gICAgICAgICAgcmVzdWx0cyA9IHJlc3VsdHMuZmlsdGVyKG9iamVjdCA9PiBvYmplY3RbZmllbGRdICE9PSBudWxsKTtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgIGlmICghaXNQb2ludGVyRmllbGQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdFtmaWVsZF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGRdLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjaGlsZCA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzFdO1xuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IG9iamVjdFtjb2x1bW5dW2NoaWxkXSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PlxuICAgICAgICByZXN1bHRzLm1hcChvYmplY3QgPT5cbiAgICAgICAgICB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKVxuICAgICAgICApXG4gICAgICApO1xuICB9XG5cbiAgYWdncmVnYXRlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSkge1xuICAgIGRlYnVnKCdhZ2dyZWdhdGUnLCBjbGFzc05hbWUsIHBpcGVsaW5lKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXg6IG51bWJlciA9IDI7XG4gICAgbGV0IGNvbHVtbnM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGNvdW50RmllbGQgPSBudWxsO1xuICAgIGxldCBncm91cFZhbHVlcyA9IG51bGw7XG4gICAgbGV0IHdoZXJlUGF0dGVybiA9ICcnO1xuICAgIGxldCBsaW1pdFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc2tpcFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBsZXQgZ3JvdXBQYXR0ZXJuID0gJyc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaXBlbGluZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3Qgc3RhZ2UgPSBwaXBlbGluZVtpXTtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRncm91cFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUgIT09ICcnKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTIFwib2JqZWN0SWRcImApO1xuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGZpZWxkID09PSAnX2lkJyAmJlxuICAgICAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCAhPT0gMFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgZ3JvdXBWYWx1ZXMgPSB2YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQnlGaWVsZHMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgYWxpYXMgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgY29uc3Qgb3BlcmF0aW9uID0gT2JqZWN0LmtleXModmFsdWVbYWxpYXNdKVswXTtcbiAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gdHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWVbYWxpYXNdW29wZXJhdGlvbl0pO1xuICAgICAgICAgICAgICBpZiAobW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl0pIHtcbiAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgZ3JvdXBCeUZpZWxkcy5wdXNoKGBcIiR7c291cmNlfVwiYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChcbiAgICAgICAgICAgICAgICAgIGBFWFRSQUNUKCR7XG4gICAgICAgICAgICAgICAgICAgIG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dXG4gICAgICAgICAgICAgICAgICB9IEZST00gJCR7aW5kZXh9Om5hbWUgQVQgVElNRSBaT05FICdVVEMnKSBBUyAkJHtpbmRleCArXG4gICAgICAgICAgICAgICAgICAgIDF9Om5hbWVgXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9OnJhd2A7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChncm91cEJ5RmllbGRzLmpvaW4oKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuJHN1bSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlLiRzdW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBTVU0oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRzdW0pLCBmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb3VudEZpZWxkID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBDT1VOVCgqKSBBUyAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1heCkge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1BWCgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtYXgpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1pbikge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1JTigkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtaW4pLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJGF2Zykge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYEFWRygkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRhdmcpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2x1bW5zLnB1c2goJyonKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICBpZiAoY29sdW1ucy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgY29sdW1ucyA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRwcm9qZWN0W2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IDEgfHwgdmFsdWUgPT09IHRydWUpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5zID0gW107XG4gICAgICAgIGNvbnN0IG9yT3JBbmQgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoXG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLFxuICAgICAgICAgICckb3InXG4gICAgICAgIClcbiAgICAgICAgICA/ICcgT1IgJ1xuICAgICAgICAgIDogJyBBTkQgJztcblxuICAgICAgICBpZiAoc3RhZ2UuJG1hdGNoLiRvcikge1xuICAgICAgICAgIGNvbnN0IGNvbGxhcHNlID0ge307XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLiRvci5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZWxlbWVudCkge1xuICAgICAgICAgICAgICBjb2xsYXBzZVtrZXldID0gZWxlbWVudFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHN0YWdlLiRtYXRjaCA9IGNvbGxhcHNlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kbWF0Y2hbZmllbGRdO1xuICAgICAgICAgIGNvbnN0IG1hdGNoUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgICAgICAgIGlmICh2YWx1ZVtjbXBdKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICAgICAgICBtYXRjaFBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgICAgYCQke2luZGV4fTpuYW1lICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCArIDF9YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlW2NtcF0pKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAobWF0Y2hQYXR0ZXJucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJHttYXRjaFBhdHRlcm5zLmpvaW4oJyBBTkQgJyl9KWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJlxuICAgICAgICAgICAgbWF0Y2hQYXR0ZXJucy5sZW5ndGggPT09IDBcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQsIHZhbHVlKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHdoZXJlUGF0dGVybiA9XG4gICAgICAgICAgcGF0dGVybnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke3BhdHRlcm5zLmpvaW4oYCAke29yT3JBbmR9IGApfWAgOiAnJztcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbGltaXQpIHtcbiAgICAgICAgbGltaXRQYXR0ZXJuID0gYExJTUlUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRsaW1pdCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNraXApIHtcbiAgICAgICAgc2tpcFBhdHRlcm4gPSBgT0ZGU0VUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRza2lwKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc29ydCkge1xuICAgICAgICBjb25zdCBzb3J0ID0gc3RhZ2UuJHNvcnQ7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzb3J0KTtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGtleXNcbiAgICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1lciA9IHNvcnRba2V5XSA9PT0gMSA/ICdBU0MnIDogJ0RFU0MnO1xuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSBgJCR7aW5kZXh9Om5hbWUgJHt0cmFuc2Zvcm1lcn1gO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIHJldHVybiBvcmRlcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5qb2luKCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKC4uLmtleXMpO1xuICAgICAgICBzb3J0UGF0dGVybiA9XG4gICAgICAgICAgc29ydCAhPT0gdW5kZWZpbmVkICYmIHNvcnRpbmcubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHFzID0gYFNFTEVDVCAke2NvbHVtbnMuam9pbigpfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufSAke3NraXBQYXR0ZXJufSAke2dyb3VwUGF0dGVybn1gO1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5tYXAocXMsIHZhbHVlcywgYSA9PlxuICAgICAgICB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIGEsIHNjaGVtYSlcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdvYmplY3RJZCcpKSB7XG4gICAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSBudWxsO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IHt9O1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkW2tleV0gPSByZXN1bHRba2V5XTtcbiAgICAgICAgICAgICAgZGVsZXRlIHJlc3VsdFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY291bnRGaWVsZCkge1xuICAgICAgICAgICAgcmVzdWx0W2NvdW50RmllbGRdID0gcGFyc2VJbnQocmVzdWx0W2NvdW50RmllbGRdLCAxMCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICB9KTtcbiAgfVxuXG4gIHBlcmZvcm1Jbml0aWFsaXphdGlvbih7IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgfTogYW55KSB7XG4gICAgLy8gVE9ETzogVGhpcyBtZXRob2QgbmVlZHMgdG8gYmUgcmV3cml0dGVuIHRvIG1ha2UgcHJvcGVyIHVzZSBvZiBjb25uZWN0aW9ucyAoQHZpdGFseS10KVxuICAgIGRlYnVnKCdwZXJmb3JtSW5pdGlhbGl6YXRpb24nKTtcbiAgICBjb25zdCBwcm9taXNlcyA9IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMubWFwKHNjaGVtYSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVUYWJsZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpXG4gICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgfHxcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUVcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLnNjaGVtYVVwZ3JhZGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2xpZW50LnR4KCdwZXJmb3JtLWluaXRpYWxpemF0aW9uJywgdCA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQuYmF0Y2goW1xuICAgICAgICAgICAgdC5ub25lKHNxbC5taXNjLmpzb25PYmplY3RTZXRLZXlzKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuYWRkKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuYWRkVW5pcXVlKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkucmVtb3ZlKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuY29udGFpbnNBbGwpLFxuICAgICAgICAgICAgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbFJlZ2V4KSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuY29udGFpbnMpLFxuICAgICAgICAgIF0pO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbihkYXRhID0+IHtcbiAgICAgICAgZGVidWcoYGluaXRpYWxpemF0aW9uRG9uZSBpbiAke2RhdGEuZHVyYXRpb259YCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55LCBjb25uOiA/YW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PlxuICAgICAgdC5iYXRjaChcbiAgICAgICAgaW5kZXhlcy5tYXAoaSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQubm9uZSgnQ1JFQVRFIElOREVYICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLCBbXG4gICAgICAgICAgICBpLm5hbWUsXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBpLmtleSxcbiAgICAgICAgICBdKTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICApO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlc0lmTmVlZGVkKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgIHR5cGU6IGFueSxcbiAgICBjb25uOiA/YW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiAoY29ubiB8fCB0aGlzLl9jbGllbnQpLm5vbmUoXG4gICAgICAnQ1JFQVRFIElOREVYICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLFxuICAgICAgW2ZpZWxkTmFtZSwgY2xhc3NOYW1lLCB0eXBlXVxuICAgICk7XG4gIH1cblxuICBkcm9wSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55LCBjb25uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBxdWVyaWVzID0gaW5kZXhlcy5tYXAoaSA9PiAoe1xuICAgICAgcXVlcnk6ICdEUk9QIElOREVYICQxOm5hbWUnLFxuICAgICAgdmFsdWVzOiBpLFxuICAgIH0pKTtcbiAgICByZXR1cm4gKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+XG4gICAgICB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKVxuICAgICk7XG4gIH1cblxuICBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcXMgPSAnU0VMRUNUICogRlJPTSBwZ19pbmRleGVzIFdIRVJFIHRhYmxlbmFtZSA9ICR7Y2xhc3NOYW1lfSc7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHsgY2xhc3NOYW1lIH0pO1xuICB9XG5cbiAgdXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gVXNlZCBmb3IgdGVzdGluZyBwdXJwb3Nlc1xuICB1cGRhdGVFc3RpbWF0ZWRDb3VudChjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZSgnQU5BTFlaRSAkMTpuYW1lJywgW2NsYXNzTmFtZV0pO1xuICB9XG5cbiAgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBjb25zdCB0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHt9O1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0ID0gdGhpcy5fY2xpZW50LnR4KHQgPT4ge1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50ID0gdDtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICB9KTtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2ggPSBbXTtcbiAgICAgICAgcmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZShcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpXG4gICAgKTtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0O1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0LmNhdGNoKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChQcm9taXNlLnJlamVjdCgpKTtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKFxuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24udC5iYXRjaCh0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaClcbiAgICApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29udmVydFBvbHlnb25Ub1NRTChwb2x5Z29uKSB7XG4gIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgUG9seWdvbiBtdXN0IGhhdmUgYXQgbGVhc3QgMyB2YWx1ZXNgXG4gICAgKTtcbiAgfVxuICBpZiAoXG4gICAgcG9seWdvblswXVswXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzBdIHx8XG4gICAgcG9seWdvblswXVsxXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzFdXG4gICkge1xuICAgIHBvbHlnb24ucHVzaChwb2x5Z29uWzBdKTtcbiAgfVxuICBjb25zdCB1bmlxdWUgPSBwb2x5Z29uLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgbGV0IGZvdW5kSW5kZXggPSAtMTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgaWYgKHB0WzBdID09PSBpdGVtWzBdICYmIHB0WzFdID09PSBpdGVtWzFdKSB7XG4gICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICB9KTtcbiAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICk7XG4gIH1cbiAgY29uc3QgcG9pbnRzID0gcG9seWdvblxuICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBhcnNlRmxvYXQocG9pbnRbMV0pLCBwYXJzZUZsb2F0KHBvaW50WzBdKSk7XG4gICAgICByZXR1cm4gYCgke3BvaW50WzFdfSwgJHtwb2ludFswXX0pYDtcbiAgICB9KVxuICAgIC5qb2luKCcsICcpO1xuICByZXR1cm4gYCgke3BvaW50c30pYDtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCkge1xuICBpZiAoIXJlZ2V4LmVuZHNXaXRoKCdcXG4nKSkge1xuICAgIHJlZ2V4ICs9ICdcXG4nO1xuICB9XG5cbiAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIGNvbW1lbnRzXG4gIHJldHVybiAoXG4gICAgcmVnZXhcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSkjLipcXG4vZ2ltLCAnJDEnKVxuICAgICAgLy8gcmVtb3ZlIGxpbmVzIHN0YXJ0aW5nIHdpdGggYSBjb21tZW50XG4gICAgICAucmVwbGFjZSgvXiMuKlxcbi9naW0sICcnKVxuICAgICAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIHdoaXRlc3BhY2VcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSlcXHMrL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSB3aGl0ZXNwYWNlIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBsaW5lXG4gICAgICAucmVwbGFjZSgvXlxccysvLCAnJylcbiAgICAgIC50cmltKClcbiAgKTtcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1JlZ2V4UGF0dGVybihzKSB7XG4gIGlmIChzICYmIHMuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgLy8gcmVnZXggZm9yIHN0YXJ0c1dpdGhcbiAgICByZXR1cm4gJ14nICsgbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDEpKTtcbiAgfSBlbHNlIGlmIChzICYmIHMuZW5kc1dpdGgoJyQnKSkge1xuICAgIC8vIHJlZ2V4IGZvciBlbmRzV2l0aFxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMuc2xpY2UoMCwgcy5sZW5ndGggLSAxKSkgKyAnJCc7XG4gIH1cblxuICAvLyByZWdleCBmb3IgY29udGFpbnNcbiAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocyk7XG59XG5cbmZ1bmN0aW9uIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlKSB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCAhdmFsdWUuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9cXF5cXFxcUS4qXFxcXEUvKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn1cblxuZnVuY3Rpb24gaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpIHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0uJHJlZ2V4KTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXS4kcmVnZXgpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgodmFsdWVzKSB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZS4kcmVnZXgpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZykge1xuICByZXR1cm4gcmVtYWluaW5nXG4gICAgLnNwbGl0KCcnKVxuICAgIC5tYXAoYyA9PiB7XG4gICAgICBjb25zdCByZWdleCA9IFJlZ0V4cCgnWzAtOSBdfFxcXFxwe0x9JywgJ3UnKTsgLy8gU3VwcG9ydCBhbGwgdW5pY29kZSBsZXR0ZXIgY2hhcnNcbiAgICAgIGlmIChjLm1hdGNoKHJlZ2V4KSAhPT0gbnVsbCkge1xuICAgICAgICAvLyBkb24ndCBlc2NhcGUgYWxwaGFudW1lcmljIGNoYXJhY3RlcnNcbiAgICAgICAgcmV0dXJuIGM7XG4gICAgICB9XG4gICAgICAvLyBlc2NhcGUgZXZlcnl0aGluZyBlbHNlIChzaW5nbGUgcXVvdGVzIHdpdGggc2luZ2xlIHF1b3RlcywgZXZlcnl0aGluZyBlbHNlIHdpdGggYSBiYWNrc2xhc2gpXG4gICAgICByZXR1cm4gYyA9PT0gYCdgID8gYCcnYCA6IGBcXFxcJHtjfWA7XG4gICAgfSlcbiAgICAuam9pbignJyk7XG59XG5cbmZ1bmN0aW9uIGxpdGVyYWxpemVSZWdleFBhcnQoczogc3RyaW5nKSB7XG4gIGNvbnN0IG1hdGNoZXIxID0gL1xcXFxRKCg/IVxcXFxFKS4qKVxcXFxFJC87XG4gIGNvbnN0IHJlc3VsdDE6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjEpO1xuICBpZiAocmVzdWx0MSAmJiByZXN1bHQxLmxlbmd0aCA+IDEgJiYgcmVzdWx0MS5pbmRleCA+IC0xKSB7XG4gICAgLy8gcHJvY2VzcyByZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBhbmQgYW4gZW5kIHNwZWNpZmllZCBmb3IgdGhlIGxpdGVyYWwgdGV4dFxuICAgIGNvbnN0IHByZWZpeCA9IHMuc3Vic3RyKDAsIHJlc3VsdDEuaW5kZXgpO1xuICAgIGNvbnN0IHJlbWFpbmluZyA9IHJlc3VsdDFbMV07XG5cbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChwcmVmaXgpICsgY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZyk7XG4gIH1cblxuICAvLyBwcm9jZXNzIHJlZ2V4IHRoYXQgaGFzIGEgYmVnaW5uaW5nIHNwZWNpZmllZCBmb3IgdGhlIGxpdGVyYWwgdGV4dFxuICBjb25zdCBtYXRjaGVyMiA9IC9cXFxcUSgoPyFcXFxcRSkuKikkLztcbiAgY29uc3QgcmVzdWx0MjogYW55ID0gcy5tYXRjaChtYXRjaGVyMik7XG4gIGlmIChyZXN1bHQyICYmIHJlc3VsdDIubGVuZ3RoID4gMSAmJiByZXN1bHQyLmluZGV4ID4gLTEpIHtcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cigwLCByZXN1bHQyLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQyWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gcmVtb3ZlIGFsbCBpbnN0YW5jZXMgb2YgXFxRIGFuZCBcXEUgZnJvbSB0aGUgcmVtYWluaW5nIHRleHQgJiBlc2NhcGUgc2luZ2xlIHF1b3Rlc1xuICByZXR1cm4gc1xuICAgIC5yZXBsYWNlKC8oW15cXFxcXSkoXFxcXEUpLywgJyQxJylcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxRKS8sICckMScpXG4gICAgLnJlcGxhY2UoL15cXFxcRS8sICcnKVxuICAgIC5yZXBsYWNlKC9eXFxcXFEvLCAnJylcbiAgICAucmVwbGFjZSgvKFteJ10pJy8sIGAkMScnYClcbiAgICAucmVwbGFjZSgvXicoW14nXSkvLCBgJyckMWApO1xufVxuXG52YXIgR2VvUG9pbnRDb2RlciA9IHtcbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCdcbiAgICApO1xuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiJdfQ==