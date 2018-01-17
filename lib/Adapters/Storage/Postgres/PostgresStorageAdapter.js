'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PostgresStorageAdapter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _PostgresClient = require('./PostgresClient');

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _sql = require('./sql');

var _sql2 = _interopRequireDefault(_sql);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var PostgresRelationDoesNotExistError = '42P01';
var PostgresDuplicateRelationError = '42P07';
var PostgresDuplicateColumnError = '42701';
var PostgresDuplicateObjectError = '42710';
var PostgresUniqueIndexViolationError = '23505';
var PostgresTransactionAbortedError = '25P02';
var logger = require('../../../logger');

var debug = function debug() {
  var args = [].concat(Array.prototype.slice.call(arguments));
  args = ['PG: ' + arguments[0]].concat(args.slice(1, args.length));
  var log = logger.getLogger();
  log.debug.apply(log, args);
};

var parseTypeToPostgresType = function parseTypeToPostgresType(type) {
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
    case 'Array':
      if (type.contents && type.contents.type === 'String') {
        return 'text[]';
      } else {
        return 'jsonb';
      }
    default:
      throw 'no type for ' + JSON.stringify(type) + ' yet';
  }
};

var ParseToPosgresComparator = {
  '$gt': '>',
  '$lt': '<',
  '$gte': '>=',
  '$lte': '<='
};

var toPostgresValue = function toPostgresValue(value) {
  if ((typeof value === 'undefined' ? 'undefined' : _typeof(value)) === 'object') {
    if (value.__type === 'Date') {
      return value.iso;
    }
    if (value.__type === 'File') {
      return value.name;
    }
  }
  return value;
};

var transformValue = function transformValue(value) {
  if (value.__type === 'Pointer') {
    return value.objectId;
  }
  return value;
};

// Duplicate from then mongo adapter...
var emptyCLPS = Object.freeze({
  find: {},
  get: {},
  create: {},
  update: {},
  delete: {},
  addField: {}
});

var defaultCLPS = Object.freeze({
  find: { '*': true },
  get: { '*': true },
  create: { '*': true },
  update: { '*': true },
  delete: { '*': true },
  addField: { '*': true }
});

var toParseSchema = function toParseSchema(schema) {
  if (schema.className === '_User') {
    delete schema.fields._hashed_password;
  }
  if (schema.fields) {
    delete schema.fields._wperm;
    delete schema.fields._rperm;
  }
  var clps = defaultCLPS;
  if (schema.classLevelPermissions) {
    clps = _extends({}, emptyCLPS, schema.classLevelPermissions);
  }
  return {
    className: schema.className,
    fields: schema.fields,
    classLevelPermissions: clps
  };
};

var toPostgresSchema = function toPostgresSchema(schema) {
  if (!schema) {
    return schema;
  }
  schema.fields = schema.fields || {};
  schema.fields._wperm = { type: 'Array', contents: { type: 'String' } };
  schema.fields._rperm = { type: 'Array', contents: { type: 'String' } };
  if (schema.className === '_User') {
    schema.fields._hashed_password = { type: 'String' };
    schema.fields._password_history = { type: 'Array' };
  }
  return schema;
};

var handleDotFields = function handleDotFields(object) {
  Object.keys(object).forEach(function (fieldName) {
    if (fieldName.indexOf('.') > -1) {
      var components = fieldName.split('.');
      var first = components.shift();
      object[first] = object[first] || {};
      var currentObj = object[first];
      var next = void 0;
      var value = object[fieldName];
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

var validateKeys = function validateKeys(object) {
  if ((typeof object === 'undefined' ? 'undefined' : _typeof(object)) == 'object') {
    for (var key in object) {
      if (_typeof(object[key]) == 'object') {
        validateKeys(object[key]);
      }

      if (key.includes('$') || key.includes('.')) {
        throw new _node2.default.Error(_node2.default.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
      }
    }
  }
};

// Returns the list of join tables on a schema
var joinTablesForSchema = function joinTablesForSchema(schema) {
  var list = [];
  if (schema) {
    Object.keys(schema.fields).forEach(function (field) {
      if (schema.fields[field].type === 'Relation') {
        list.push('_Join:' + field + ':' + schema.className);
      }
    });
  }
  return list;
};

var buildWhereClause = function buildWhereClause(_ref) {
  var schema = _ref.schema,
      query = _ref.query,
      index = _ref.index;

  var patterns = [];
  var values = [];
  var sorts = [];

  schema = toPostgresSchema(schema);

  var _loop = function _loop(fieldName) {
    var isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    var initialPatternsLength = patterns.length;
    var fieldValue = query[fieldName];

    // nothingin the schema, it's gonna blow up
    if (!schema.fields[fieldName]) {
      // as it won't exist
      if (fieldValue.$exists === false) {
        return 'continue';
      }
    }

    if (fieldName.indexOf('.') >= 0) {
      var components = fieldName.split('.').map(function (cmpt, index) {
        if (index === 0) {
          return '"' + cmpt + '"';
        }
        return '\'' + cmpt + '\'';
      });
      var name = components.slice(0, components.length - 1).join('->');
      name += '->>' + components[components.length - 1];
      patterns.push(name + ' = \'' + fieldValue + '\'');
    } else if (typeof fieldValue === 'string') {
      patterns.push('$' + index + ':name = $' + (index + 1));
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (typeof fieldValue === 'boolean') {
      patterns.push('$' + index + ':name = $' + (index + 1));
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (typeof fieldValue === 'number') {
      patterns.push('$' + index + ':name = $' + (index + 1));
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (fieldName === '$or' || fieldName === '$and') {
      var _values;

      var clauses = [];
      var clauseValues = [];
      fieldValue.forEach(function (subQuery) {
        var clause = buildWhereClause({ schema: schema, query: subQuery, index: index });
        if (clause.pattern.length > 0) {
          clauses.push(clause.pattern);
          clauseValues.push.apply(clauseValues, _toConsumableArray(clause.values));
          index += clause.values.length;
        }
      });
      var orOrAnd = fieldName === '$or' ? ' OR ' : ' AND ';
      patterns.push('(' + clauses.join(orOrAnd) + ')');
      (_values = values).push.apply(_values, clauseValues);
    }

    if (fieldValue.$ne) {
      if (isArrayField) {
        fieldValue.$ne = JSON.stringify([fieldValue.$ne]);
        patterns.push('NOT array_contains($' + index + ':name, $' + (index + 1) + ')');
      } else {
        if (fieldValue.$ne === null) {
          patterns.push('$' + index + ':name <> $' + (index + 1));
        } else {
          // if not null, we need to manually exclude null
          patterns.push('($' + index + ':name <> $' + (index + 1) + ' OR $' + index + ':name IS NULL)');
        }
      }

      // TODO: support arrays
      values.push(fieldName, fieldValue.$ne);
      index += 2;
    }

    if (fieldValue.$eq) {
      patterns.push('$' + index + ':name = $' + (index + 1));
      values.push(fieldName, fieldValue.$eq);
      index += 2;
    }
    var isInOrNin = Array.isArray(fieldValue.$in) || Array.isArray(fieldValue.$nin);
    if (Array.isArray(fieldValue.$in) && isArrayField && schema.fields[fieldName].contents && schema.fields[fieldName].contents.type === 'String') {
      var inPatterns = [];
      var allowNull = false;
      values.push(fieldName);
      fieldValue.$in.forEach(function (listElem, listIndex) {
        if (listElem === null) {
          allowNull = true;
        } else {
          values.push(listElem);
          inPatterns.push('$' + (index + 1 + listIndex - (allowNull ? 1 : 0)));
        }
      });
      if (allowNull) {
        patterns.push('($' + index + ':name IS NULL OR $' + index + ':name && ARRAY[' + inPatterns.join(',') + '])');
      } else {
        patterns.push('$' + index + ':name && ARRAY[' + inPatterns.join(',') + ']');
      }
      index = index + 1 + inPatterns.length;
    } else if (isInOrNin) {
      createConstraint = function createConstraint(baseArray, notIn) {
        if (baseArray.length > 0) {
          var not = notIn ? ' NOT ' : '';
          if (isArrayField) {
            patterns.push(not + ' array_contains($' + index + ':name, $' + (index + 1) + ')');
            values.push(fieldName, JSON.stringify(baseArray));
            index += 2;
          } else {
            var _inPatterns = [];
            values.push(fieldName);
            baseArray.forEach(function (listElem, listIndex) {
              values.push(listElem);
              _inPatterns.push('$' + (index + 1 + listIndex));
            });
            patterns.push('$' + index + ':name ' + not + ' IN (' + _inPatterns.join(',') + ')');
            index = index + 1 + _inPatterns.length;
          }
        } else if (!notIn) {
          values.push(fieldName);
          patterns.push('$' + index + ':name IS NULL');
          index = index + 1;
        }
      };

      if (fieldValue.$in) {
        createConstraint(_lodash2.default.flatMap(fieldValue.$in, function (elt) {
          return elt;
        }), false);
      }
      if (fieldValue.$nin) {
        createConstraint(_lodash2.default.flatMap(fieldValue.$nin, function (elt) {
          return elt;
        }), true);
      }
    }

    if (Array.isArray(fieldValue.$all) && isArrayField) {
      patterns.push('array_contains_all($' + index + ':name, $' + (index + 1) + '::jsonb)');
      values.push(fieldName, JSON.stringify(fieldValue.$all));
      index += 2;
    }

    if (typeof fieldValue.$exists !== 'undefined') {
      if (fieldValue.$exists) {
        patterns.push('$' + index + ':name IS NOT NULL');
      } else {
        patterns.push('$' + index + ':name IS NULL');
      }
      values.push(fieldName);
      index += 1;
    }

    if (fieldValue.$nearSphere) {
      var point = fieldValue.$nearSphere;
      var distance = fieldValue.$maxDistance;
      var distanceInKM = distance * 6371 * 1000;
      patterns.push('ST_distance_sphere($' + index + ':name::geometry, POINT($' + (index + 1) + ', $' + (index + 2) + ')::geometry) <= $' + (index + 3));
      sorts.push('ST_distance_sphere($' + index + ':name::geometry, POINT($' + (index + 1) + ', $' + (index + 2) + ')::geometry) ASC');
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }

    if (fieldValue.$within && fieldValue.$within.$box) {
      var box = fieldValue.$within.$box;
      var left = box[0].longitude;
      var bottom = box[0].latitude;
      var right = box[1].longitude;
      var top = box[1].latitude;

      patterns.push('$' + index + ':name::point <@ $' + (index + 1) + '::box');
      values.push(fieldName, '((' + left + ', ' + bottom + '), (' + right + ', ' + top + '))');
      index += 2;
    }

    if (fieldValue.$regex) {
      var regex = fieldValue.$regex;
      var operator = '~';
      var opts = fieldValue.$options;
      if (opts) {
        if (opts.indexOf('i') >= 0) {
          operator = '~*';
        }
        if (opts.indexOf('x') >= 0) {
          regex = removeWhiteSpace(regex);
        }
      }

      regex = processRegexPattern(regex);

      patterns.push('$' + index + ':name ' + operator + ' \'$' + (index + 1) + ':raw\'');
      values.push(fieldName, regex);
      index += 2;
    }

    if (fieldValue.__type === 'Pointer') {
      if (isArrayField) {
        patterns.push('array_contains($' + index + ':name, $' + (index + 1) + ')');
        values.push(fieldName, JSON.stringify([fieldValue]));
        index += 2;
      } else {
        patterns.push('$' + index + ':name = $' + (index + 1));
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      }
    }

    if (fieldValue.__type === 'Date') {
      patterns.push('$' + index + ':name = $' + (index + 1));
      values.push(fieldName, fieldValue.iso);
      index += 2;
    }

    Object.keys(ParseToPosgresComparator).forEach(function (cmp) {
      if (fieldValue[cmp]) {
        var pgComparator = ParseToPosgresComparator[cmp];
        patterns.push('$' + index + ':name ' + pgComparator + ' $' + (index + 1));
        values.push(fieldName, toPostgresValue(fieldValue[cmp]));
        index += 2;
      }
    });

    if (initialPatternsLength === patterns.length) {
      throw new _node2.default.Error(_node2.default.Error.OPERATION_FORBIDDEN, 'Postgres doesn\'t support this query type yet ' + JSON.stringify(fieldValue));
    }
  };

  for (var fieldName in query) {
    var createConstraint;

    var _ret = _loop(fieldName);

    if (_ret === 'continue') continue;
  }
  values = values.map(transformValue);
  return { pattern: patterns.join(' AND '), values: values, sorts: sorts };
};

var PostgresStorageAdapter = exports.PostgresStorageAdapter = function () {
  // Private
  function PostgresStorageAdapter(_ref2) {
    var uri = _ref2.uri,
        _ref2$collectionPrefi = _ref2.collectionPrefix,
        collectionPrefix = _ref2$collectionPrefi === undefined ? '' : _ref2$collectionPrefi,
        databaseOptions = _ref2.databaseOptions;

    _classCallCheck(this, PostgresStorageAdapter);

    this._collectionPrefix = collectionPrefix;
    this._client = (0, _PostgresClient.createClient)(uri, databaseOptions);
  }

  _createClass(PostgresStorageAdapter, [{
    key: '_ensureSchemaCollectionExists',
    value: function _ensureSchemaCollectionExists(conn) {
      conn = conn || this._client;
      return conn.none('CREATE TABLE IF NOT EXISTS "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )').catch(function (error) {
        if (error.code === PostgresDuplicateRelationError || error.code === PostgresUniqueIndexViolationError || error.code === PostgresDuplicateObjectError) {
          // Table already exists, must have been created by a different request. Ignore error.
        } else {
          throw error;
        }
      });
    }
  }, {
    key: 'classExists',
    value: function classExists(name) {
      return this._client.one('SELECT EXISTS (SELECT 1 FROM   information_schema.tables WHERE table_name = $1)', [name]).then(function (res) {
        return res.exists;
      });
    }
  }, {
    key: 'setClassLevelPermissions',
    value: function setClassLevelPermissions(className, CLPs) {
      var _this = this;

      return this._ensureSchemaCollectionExists().then(function () {
        var values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)];
        return _this._client.none('UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className"=$1 ', values);
      });
    }
  }, {
    key: 'createClass',
    value: function createClass(className, schema) {
      var _this2 = this;

      return this._client.tx(function (t) {
        var q1 = _this2.createTable(className, schema, t);
        var q2 = t.none('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', { className: className, schema: schema });

        return t.batch([q1, q2]);
      }).then(function () {
        return toParseSchema(schema);
      }).catch(function (err) {
        if (Array.isArray(err.data) && err.data.length > 1 && err.data[0].result.code === PostgresTransactionAbortedError) {
          err = err.data[1].result;
        }

        if (err.code === PostgresUniqueIndexViolationError && err.detail.includes(className)) {
          throw new _node2.default.Error(_node2.default.Error.DUPLICATE_VALUE, 'Class ' + className + ' already exists.');
        }
        throw err;
      });
    }

    // Just create a table, do not insert in schema

  }, {
    key: 'createTable',
    value: function createTable(className, schema, conn) {
      conn = conn || this._client;
      debug('createTable', className, schema);
      var valuesArray = [];
      var patternsArray = [];
      var fields = Object.assign({}, schema.fields);
      if (className === '_User') {
        fields._email_verify_token_expires_at = { type: 'Date' };
        fields._email_verify_token = { type: 'String' };
        fields._account_lockout_expires_at = { type: 'Date' };
        fields._failed_login_count = { type: 'Number' };
        fields._perishable_token = { type: 'String' };
        fields._perishable_token_expires_at = { type: 'Date' };
        fields._password_changed_at = { type: 'Date' };
        fields._password_history = { type: 'Array' };
      }
      var index = 2;
      var relations = [];
      Object.keys(fields).forEach(function (fieldName) {
        var parseType = fields[fieldName];
        // Skip when it's a relation
        // We'll create the tables later
        if (parseType.type === 'Relation') {
          relations.push(fieldName);
          return;
        }
        if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
          parseType.contents = { type: 'String' };
        }
        valuesArray.push(fieldName);
        valuesArray.push(parseTypeToPostgresType(parseType));
        patternsArray.push('$' + index + ':name $' + (index + 1) + ':raw');
        if (fieldName === 'objectId') {
          patternsArray.push('PRIMARY KEY ($' + index + ':name)');
        }
        index = index + 2;
      });
      var qs = 'CREATE TABLE IF NOT EXISTS $1:name (' + patternsArray.join(',') + ')';
      var values = [className].concat(valuesArray);
      return this._ensureSchemaCollectionExists(conn).then(function () {
        return conn.none(qs, values);
      }).catch(function (error) {
        if (error.code === PostgresDuplicateRelationError) {
          // Table already exists, must have been created by a different request. Ignore error.
        } else {
          throw error;
        }
      }).then(function () {
        // Create the relation tables
        return Promise.all(relations.map(function (fieldName) {
          return conn.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', { joinTable: '_Join:' + fieldName + ':' + className });
        }));
      });
    }
  }, {
    key: 'addFieldIfNotExists',
    value: function addFieldIfNotExists(className, fieldName, type) {
      var _this3 = this;

      // TODO: Must be revised for invalid logic...
      debug('addFieldIfNotExists', { className: className, fieldName: fieldName, type: type });
      return this._client.tx("addFieldIfNotExists", function (t) {
        var promise = Promise.resolve();
        if (type.type !== 'Relation') {
          promise = t.none('ALTER TABLE $<className:name> ADD COLUMN $<fieldName:name> $<postgresType:raw>', {
            className: className,
            fieldName: fieldName,
            postgresType: parseTypeToPostgresType(type)
          }).catch(function (error) {
            if (error.code === PostgresRelationDoesNotExistError) {
              return _this3.createClass(className, { fields: _defineProperty({}, fieldName, type) });
            } else if (error.code === PostgresDuplicateColumnError) {
              // Column already exists, created by other request. Carry on to
              // See if it's the right type.
            } else {
              throw error;
            }
          });
        } else {
          promise = t.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', { joinTable: '_Join:' + fieldName + ':' + className });
        }
        return promise.then(function () {
          return t.any('SELECT "schema" FROM "_SCHEMA" WHERE "className" = $<className> and ("schema"::json->\'fields\'->$<fieldName>) is not null', { className: className, fieldName: fieldName });
        }).then(function (result) {
          if (result[0]) {
            throw "Attempted to add a field that already exists";
          } else {
            var path = '{fields,' + fieldName + '}';
            return t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', { path: path, type: type, className: className });
          }
        });
      });
    }

    // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
    // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.

  }, {
    key: 'deleteClass',
    value: function deleteClass(className) {
      var _this4 = this;

      return Promise.resolve().then(function () {
        var operations = [['DROP TABLE IF EXISTS $1:name', [className]], ['DELETE FROM "_SCHEMA" WHERE "className"=$1', [className]]];
        return _this4._client.tx(function (t) {
          return t.batch(operations.map(function (statement) {
            return t.none(statement[0], statement[1]);
          }));
        });
      }).then(function () {
        // resolves with false when _Join table
        return className.indexOf('_Join:') != 0;
      });
    }

    // Delete all data known to this adapter. Used for testing.

  }, {
    key: 'deleteAllClasses',
    value: function deleteAllClasses() {
      var _this5 = this;

      var now = new Date().getTime();
      debug('deleteAllClasses');
      return this._client.any('SELECT * FROM "_SCHEMA"').then(function (results) {
        var joins = results.reduce(function (list, schema) {
          return list.concat(joinTablesForSchema(schema.schema));
        }, []);
        var classes = ['_SCHEMA', '_PushStatus', '_JobStatus', '_Hooks', '_GlobalConfig'].concat(_toConsumableArray(results.map(function (result) {
          return result.className;
        })), _toConsumableArray(joins));
        return _this5._client.tx(function (t) {
          return t.batch(classes.map(function (className) {
            return t.none('DROP TABLE IF EXISTS $<className:name>', { className: className });
          }));
        });
      }, function (error) {
        if (error.code === PostgresRelationDoesNotExistError) {
          // No _SCHEMA collection. Don't delete anything.
          return;
        } else {
          throw error;
        }
      }).then(function () {
        debug('deleteAllClasses done in ' + (new Date().getTime() - now));
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

  }, {
    key: 'deleteFields',
    value: function deleteFields(className, schema, fieldNames) {
      var _this6 = this;

      debug('deleteFields', className, fieldNames);
      return Promise.resolve().then(function () {
        fieldNames = fieldNames.reduce(function (list, fieldName) {
          var field = schema.fields[fieldName];
          if (field.type !== 'Relation') {
            list.push(fieldName);
          }
          delete schema.fields[fieldName];
          return list;
        }, []);

        var values = [className].concat(_toConsumableArray(fieldNames));
        var columns = fieldNames.map(function (name, idx) {
          return '$' + (idx + 2) + ':name';
        }).join(', DROP COLUMN');

        var doBatch = function doBatch(t) {
          var batch = [t.none('UPDATE "_SCHEMA" SET "schema"=$<schema> WHERE "className"=$<className>', { schema: schema, className: className })];
          if (values.length > 1) {
            batch.push(t.none('ALTER TABLE $1:name DROP COLUMN ' + columns, values));
          }
          return batch;
        };
        return _this6._client.tx(function (t) {
          return t.batch(doBatch(t));
        });
      });
    }

    // Return a promise for all schemas known to this adapter, in Parse format. In case the
    // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
    // rejection reason are TBD.

  }, {
    key: 'getAllClasses',
    value: function getAllClasses() {
      var _this7 = this;

      return this._ensureSchemaCollectionExists().then(function () {
        return _this7._client.map('SELECT * FROM "_SCHEMA"', null, function (row) {
          return _extends({ className: row.className }, row.schema);
        });
      }).then(function (res) {
        return res.map(toParseSchema);
      });
    }

    // Return a promise for the schema with the given name, in Parse format. If
    // this adapter doesn't know about the schema, return a promise that rejects with
    // undefined as the reason.

  }, {
    key: 'getClass',
    value: function getClass(className) {
      debug('getClass', className);
      return this._client.any('SELECT * FROM "_SCHEMA" WHERE "className"=$<className>', { className: className }).then(function (result) {
        if (result.length === 1) {
          return result[0].schema;
        } else {
          throw undefined;
        }
      }).then(toParseSchema);
    }

    // TODO: remove the mongo format dependency in the return value

  }, {
    key: 'createObject',
    value: function createObject(className, schema, object) {
      debug('createObject', className, object);
      var columnsArray = [];
      var valuesArray = [];
      schema = toPostgresSchema(schema);
      var geoPoints = {};

      object = handleDotFields(object);

      validateKeys(object);

      Object.keys(object).forEach(function (fieldName) {
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
          case 'String':
          case 'Number':
          case 'Boolean':
            valuesArray.push(object[fieldName]);
            break;
          case 'File':
            valuesArray.push(object[fieldName].name);
            break;
          case 'GeoPoint':
            // pop the point and process later
            geoPoints[fieldName] = object[fieldName];
            columnsArray.pop();
            break;
          default:
            throw 'Type ' + schema.fields[fieldName].type + ' not supported yet';
        }
      });

      columnsArray = columnsArray.concat(Object.keys(geoPoints));
      var initialValues = valuesArray.map(function (val, index) {
        var termination = '';
        var fieldName = columnsArray[index];
        if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
          termination = '::text[]';
        } else if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
          termination = '::jsonb';
        }
        return '$' + (index + 2 + columnsArray.length) + termination;
      });
      var geoPointsInjects = Object.keys(geoPoints).map(function (key) {
        var value = geoPoints[key];
        valuesArray.push(value.longitude, value.latitude);
        var l = valuesArray.length + columnsArray.length;
        return 'POINT($' + l + ', $' + (l + 1) + ')';
      });

      var columnsPattern = columnsArray.map(function (col, index) {
        return '$' + (index + 2) + ':name';
      }).join(',');
      var valuesPattern = initialValues.concat(geoPointsInjects).join(',');

      var qs = 'INSERT INTO $1:name (' + columnsPattern + ') VALUES (' + valuesPattern + ')';
      var values = [className].concat(_toConsumableArray(columnsArray), valuesArray);
      debug(qs, values);
      return this._client.any(qs, values).then(function () {
        return { ops: [object] };
      }).catch(function (error) {
        if (error.code === PostgresUniqueIndexViolationError) {
          throw new _node2.default.Error(_node2.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        } else {
          throw error;
        }
      });
    }

    // Remove all objects that match the given Parse Query.
    // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
    // If there is some other error, reject with INTERNAL_SERVER_ERROR.

  }, {
    key: 'deleteObjectsByQuery',
    value: function deleteObjectsByQuery(className, schema, query) {
      debug('deleteObjectsByQuery', className, query);
      var values = [className];
      var index = 2;
      var where = buildWhereClause({ schema: schema, index: index, query: query });
      values.push.apply(values, _toConsumableArray(where.values));
      if (Object.keys(query).length === 0) {
        where.pattern = 'TRUE';
      }
      var qs = 'WITH deleted AS (DELETE FROM $1:name WHERE ' + where.pattern + ' RETURNING *) SELECT count(*) FROM deleted';
      debug(qs, values);
      return this._client.one(qs, values, function (a) {
        return +a.count;
      }).then(function (count) {
        if (count === 0) {
          throw new _node2.default.Error(_node2.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
        } else {
          return count;
        }
      });
    }
    // Return value not currently well specified.

  }, {
    key: 'findOneAndUpdate',
    value: function findOneAndUpdate(className, schema, query, update) {
      debug('findOneAndUpdate', className, query, update);
      return this.updateObjectsByQuery(className, schema, query, update).then(function (val) {
        return val[0];
      });
    }

    // Apply the update to all objects that match the given Parse Query.

  }, {
    key: 'updateObjectsByQuery',
    value: function updateObjectsByQuery(className, schema, query, update) {
      debug('updateObjectsByQuery', className, query, update);
      var updatePatterns = [];
      var values = [className];
      var index = 2;
      schema = toPostgresSchema(schema);

      var originalUpdate = _extends({}, update);
      update = handleDotFields(update);
      // Resolve authData first,
      // So we don't end up with multiple key updates
      for (var fieldName in update) {
        var authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
        if (authDataMatch) {
          var provider = authDataMatch[1];
          var value = update[fieldName];
          delete update[fieldName];
          update['authData'] = update['authData'] || {};
          update['authData'][provider] = value;
        }
      }

      var _loop2 = function _loop2(_fieldName) {
        var fieldValue = update[_fieldName];
        if (fieldValue === null) {
          updatePatterns.push('$' + index + ':name = NULL');
          values.push(_fieldName);
          index += 1;
        } else if (_fieldName == 'authData') {
          // This recursively sets the json_object
          // Only 1 level deep
          var generate = function generate(jsonb, key, value) {
            return 'json_object_set_key(COALESCE(' + jsonb + ', \'{}\'::jsonb), ' + key + ', ' + value + ')::jsonb';
          };
          var lastKey = '$' + index + ':name';
          var fieldNameIndex = index;
          index += 1;
          values.push(_fieldName);
          var _update = Object.keys(fieldValue).reduce(function (lastKey, key) {
            var str = generate(lastKey, '$' + index + '::text', '$' + (index + 1) + '::jsonb');
            index += 2;
            var value = fieldValue[key];
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
          updatePatterns.push('$' + fieldNameIndex + ':name = ' + _update);
        } else if (fieldValue.__op === 'Increment') {
          updatePatterns.push('$' + index + ':name = COALESCE($' + index + ':name, 0) + $' + (index + 1));
          values.push(_fieldName, fieldValue.amount);
          index += 2;
        } else if (fieldValue.__op === 'Add') {
          updatePatterns.push('$' + index + ':name = array_add(COALESCE($' + index + ':name, \'[]\'::jsonb), $' + (index + 1) + '::jsonb)');
          values.push(_fieldName, JSON.stringify(fieldValue.objects));
          index += 2;
        } else if (fieldValue.__op === 'Delete') {
          updatePatterns.push('$' + index + ':name = $' + (index + 1));
          values.push(_fieldName, null);
          index += 2;
        } else if (fieldValue.__op === 'Remove') {
          updatePatterns.push('$' + index + ':name = array_remove(COALESCE($' + index + ':name, \'[]\'::jsonb), $' + (index + 1) + '::jsonb)');
          values.push(_fieldName, JSON.stringify(fieldValue.objects));
          index += 2;
        } else if (fieldValue.__op === 'AddUnique') {
          updatePatterns.push('$' + index + ':name = array_add_unique(COALESCE($' + index + ':name, \'[]\'::jsonb), $' + (index + 1) + '::jsonb)');
          values.push(_fieldName, JSON.stringify(fieldValue.objects));
          index += 2;
        } else if (_fieldName === 'updatedAt') {
          //TODO: stop special casing this. It should check for __type === 'Date' and use .iso
          updatePatterns.push('$' + index + ':name = $' + (index + 1));
          values.push(_fieldName, fieldValue);
          index += 2;
        } else if (typeof fieldValue === 'string') {
          updatePatterns.push('$' + index + ':name = $' + (index + 1));
          values.push(_fieldName, fieldValue);
          index += 2;
        } else if (typeof fieldValue === 'boolean') {
          updatePatterns.push('$' + index + ':name = $' + (index + 1));
          values.push(_fieldName, fieldValue);
          index += 2;
        } else if (fieldValue.__type === 'Pointer') {
          updatePatterns.push('$' + index + ':name = $' + (index + 1));
          values.push(_fieldName, fieldValue.objectId);
          index += 2;
        } else if (fieldValue.__type === 'Date') {
          updatePatterns.push('$' + index + ':name = $' + (index + 1));
          values.push(_fieldName, toPostgresValue(fieldValue));
          index += 2;
        } else if (fieldValue instanceof Date) {
          updatePatterns.push('$' + index + ':name = $' + (index + 1));
          values.push(_fieldName, fieldValue);
          index += 2;
        } else if (fieldValue.__type === 'File') {
          updatePatterns.push('$' + index + ':name = $' + (index + 1));
          values.push(_fieldName, toPostgresValue(fieldValue));
          index += 2;
        } else if (fieldValue.__type === 'GeoPoint') {
          updatePatterns.push('$' + index + ':name = POINT($' + (index + 1) + ', $' + (index + 2) + ')');
          values.push(_fieldName, fieldValue.latitude, fieldValue.longitude);
          index += 3;
        } else if (fieldValue.__type === 'Relation') {
          // noop
        } else if (typeof fieldValue === 'number') {
          updatePatterns.push('$' + index + ':name = $' + (index + 1));
          values.push(_fieldName, fieldValue);
          index += 2;
        } else if ((typeof fieldValue === 'undefined' ? 'undefined' : _typeof(fieldValue)) === 'object' && schema.fields[_fieldName] && schema.fields[_fieldName].type === 'Object') {
          // Gather keys to increment
          var keysToIncrement = Object.keys(originalUpdate).filter(function (k) {
            // choose top level fields that have a delete operation set
            return originalUpdate[k].__op === 'Increment' && k.split('.').length === 2 && k.split(".")[0] === _fieldName;
          }).map(function (k) {
            return k.split('.')[1];
          });

          var incrementPatterns = '';
          if (keysToIncrement.length > 0) {
            incrementPatterns = ' || ' + keysToIncrement.map(function (c) {
              var amount = fieldValue[c].amount;
              return 'CONCAT(\'{"' + c + '":\', COALESCE($' + index + ':name->>\'' + c + '\',\'0\')::int + ' + amount + ', \'}\')::jsonb';
            }).join(' || ');
            // Strip the keys
            keysToIncrement.forEach(function (key) {
              delete fieldValue[key];
            });
          }

          var keysToDelete = Object.keys(originalUpdate).filter(function (k) {
            // choose top level fields that have a delete operation set
            return originalUpdate[k].__op === 'Delete' && k.split('.').length === 2 && k.split(".")[0] === _fieldName;
          }).map(function (k) {
            return k.split('.')[1];
          });

          var deletePatterns = keysToDelete.reduce(function (p, c, i) {
            return p + (' - \'$' + (index + 1 + i) + ':value\'');
          }, '');

          updatePatterns.push('$' + index + ':name = ( COALESCE($' + index + ':name, \'{}\'::jsonb) ' + deletePatterns + ' ' + incrementPatterns + ' || $' + (index + 1 + keysToDelete.length) + '::jsonb )');

          values.push.apply(values, [_fieldName].concat(_toConsumableArray(keysToDelete), [JSON.stringify(fieldValue)]));
          index += 2 + keysToDelete.length;
        } else if (Array.isArray(fieldValue) && schema.fields[_fieldName] && schema.fields[_fieldName].type === 'Array') {
          var expectedType = parseTypeToPostgresType(schema.fields[_fieldName]);
          if (expectedType === 'text[]') {
            updatePatterns.push('$' + index + ':name = $' + (index + 1) + '::text[]');
          } else {
            var type = 'text';
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
              for (var _iterator = fieldValue[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                var elt = _step.value;

                if ((typeof elt === 'undefined' ? 'undefined' : _typeof(elt)) == 'object') {
                  type = 'json';
                  break;
                }
              }
            } catch (err) {
              _didIteratorError = true;
              _iteratorError = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion && _iterator.return) {
                  _iterator.return();
                }
              } finally {
                if (_didIteratorError) {
                  throw _iteratorError;
                }
              }
            }

            updatePatterns.push('$' + index + ':name = array_to_json($' + (index + 1) + '::' + type + '[])::jsonb');
          }
          values.push(_fieldName, fieldValue);
          index += 2;
        } else {
          debug('Not supported update', _fieldName, fieldValue);
          return {
            v: Promise.reject(new _node2.default.Error(_node2.default.Error.OPERATION_FORBIDDEN, 'Postgres doesn\'t support update ' + JSON.stringify(fieldValue) + ' yet'))
          };
        }
      };

      for (var _fieldName in update) {
        var _ret2 = _loop2(_fieldName);

        if ((typeof _ret2 === 'undefined' ? 'undefined' : _typeof(_ret2)) === "object") return _ret2.v;
      }

      var where = buildWhereClause({ schema: schema, index: index, query: query });
      values.push.apply(values, _toConsumableArray(where.values));

      var qs = 'UPDATE $1:name SET ' + updatePatterns.join(',') + ' WHERE ' + where.pattern + ' RETURNING *';
      debug('update: ', qs, values);
      return this._client.any(qs, values); // TODO: This is unsafe, verification is needed, or a different query method;
    }

    // Hopefully, we can get rid of this. It's only used for config and hooks.

  }, {
    key: 'upsertOneObject',
    value: function upsertOneObject(className, schema, query, update) {
      var _this8 = this;

      debug('upsertOneObject', { className: className, query: query, update: update });
      var createValue = Object.assign({}, query, update);
      return this.createObject(className, schema, createValue).catch(function (err) {
        // ignore duplicate value errors as it's upsert
        if (err.code === _node2.default.Error.DUPLICATE_VALUE) {
          return _this8.findOneAndUpdate(className, schema, query, update);
        }
        throw err;
      });
    }
  }, {
    key: 'find',
    value: function find(className, schema, query, _ref3) {
      var _values2;

      var skip = _ref3.skip,
          limit = _ref3.limit,
          sort = _ref3.sort,
          keys = _ref3.keys;

      debug('find', className, query, { skip: skip, limit: limit, sort: sort, keys: keys });
      var hasLimit = limit !== undefined;
      var hasSkip = skip !== undefined;
      var values = [className];
      var where = buildWhereClause({ schema: schema, query: query, index: 2 });
      (_values2 = values).push.apply(_values2, _toConsumableArray(where.values));

      var wherePattern = where.pattern.length > 0 ? 'WHERE ' + where.pattern : '';
      var limitPattern = hasLimit ? 'LIMIT $' + (values.length + 1) : '';
      if (hasLimit) {
        values.push(limit);
      }
      var skipPattern = hasSkip ? 'OFFSET $' + (values.length + 1) : '';
      if (hasSkip) {
        values.push(skip);
      }

      var sortPattern = '';
      if (sort) {
        var sorting = Object.keys(sort).map(function (key) {
          // Using $idx pattern gives:  non-integer constant in ORDER BY
          if (sort[key] === 1) {
            return '"' + key + '" ASC';
          }
          return '"' + key + '" DESC';
        }).join(',');
        sortPattern = sort !== undefined && Object.keys(sort).length > 0 ? 'ORDER BY ' + sorting : '';
      }
      if (where.sorts && Object.keys(where.sorts).length > 0) {
        sortPattern = 'ORDER BY ' + where.sorts.join(',');
      }

      var columns = '*';
      if (keys) {
        // Exclude empty keys
        keys = keys.filter(function (key) {
          return key.length > 0;
        });
        columns = keys.map(function (key, index) {
          return '$' + (index + values.length + 1) + ':name';
        }).join(',');
        values = values.concat(keys);
      }

      var qs = 'SELECT ' + columns + ' FROM $1:name ' + wherePattern + ' ' + sortPattern + ' ' + limitPattern + ' ' + skipPattern;
      debug(qs, values);
      return this._client.any(qs, values).catch(function (err) {
        // Query on non existing table, don't crash
        if (err.code === PostgresRelationDoesNotExistError) {
          return [];
        }
        return Promise.reject(err);
      }).then(function (results) {
        return results.map(function (object) {
          Object.keys(schema.fields).forEach(function (fieldName) {
            if (schema.fields[fieldName].type === 'Pointer' && object[fieldName]) {
              object[fieldName] = { objectId: object[fieldName], __type: 'Pointer', className: schema.fields[fieldName].targetClass };
            }
            if (schema.fields[fieldName].type === 'Relation') {
              object[fieldName] = {
                __type: "Relation",
                className: schema.fields[fieldName].targetClass
              };
            }
            if (object[fieldName] && schema.fields[fieldName].type === 'GeoPoint') {
              object[fieldName] = {
                __type: "GeoPoint",
                latitude: object[fieldName].y,
                longitude: object[fieldName].x
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
            object.expiresAt = { __type: 'Date', iso: object.expiresAt.toISOString() };
          }
          if (object._email_verify_token_expires_at) {
            object._email_verify_token_expires_at = { __type: 'Date', iso: object._email_verify_token_expires_at.toISOString() };
          }
          if (object._account_lockout_expires_at) {
            object._account_lockout_expires_at = { __type: 'Date', iso: object._account_lockout_expires_at.toISOString() };
          }
          if (object._perishable_token_expires_at) {
            object._perishable_token_expires_at = { __type: 'Date', iso: object._perishable_token_expires_at.toISOString() };
          }
          if (object._password_changed_at) {
            object._password_changed_at = { __type: 'Date', iso: object._password_changed_at.toISOString() };
          }

          for (var fieldName in object) {
            if (object[fieldName] === null) {
              delete object[fieldName];
            }
            if (object[fieldName] instanceof Date) {
              object[fieldName] = { __type: 'Date', iso: object[fieldName].toISOString() };
            }
          }

          return object;
        });
      });
    }

    // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
    // currently know which fields are nullable and which aren't, we ignore that criteria.
    // As such, we shouldn't expose this function to users of parse until we have an out-of-band
    // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
    // which is why we use sparse indexes.

  }, {
    key: 'ensureUniqueness',
    value: function ensureUniqueness(className, schema, fieldNames) {
      // Use the same name for every ensureUniqueness attempt, because postgres
      // Will happily create the same index with multiple names.
      var constraintName = 'unique_' + fieldNames.sort().join('_');
      var constraintPatterns = fieldNames.map(function (fieldName, index) {
        return '$' + (index + 3) + ':name';
      });
      var qs = 'ALTER TABLE $1:name ADD CONSTRAINT $2:name UNIQUE (' + constraintPatterns.join(',') + ')';
      return this._client.none(qs, [className, constraintName].concat(_toConsumableArray(fieldNames))).catch(function (error) {
        if (error.code === PostgresDuplicateRelationError && error.message.includes(constraintName)) {
          // Index already exists. Ignore error.
        } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(constraintName)) {
          // Cast the error into the proper parse error
          throw new _node2.default.Error(_node2.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        } else {
          throw error;
        }
      });
    }

    // Executes a count.

  }, {
    key: 'count',
    value: function count(className, schema, query) {
      debug('count', className, query);
      var values = [className];
      var where = buildWhereClause({ schema: schema, query: query, index: 2 });
      values.push.apply(values, _toConsumableArray(where.values));

      var wherePattern = where.pattern.length > 0 ? 'WHERE ' + where.pattern : '';
      var qs = 'SELECT count(*) FROM $1:name ' + wherePattern;
      return this._client.one(qs, values, function (a) {
        return +a.count;
      }).catch(function (err) {
        if (err.code === PostgresRelationDoesNotExistError) {
          return 0;
        }
        throw err;
      });
    }
  }, {
    key: 'performInitialization',
    value: function performInitialization(_ref4) {
      var _this9 = this;

      var VolatileClassesSchemas = _ref4.VolatileClassesSchemas;

      debug('performInitialization');
      var promises = VolatileClassesSchemas.map(function (schema) {
        return _this9.createTable(schema.className, schema).catch(function (err) {
          if (err.code === PostgresDuplicateRelationError || err.code === _node2.default.Error.INVALID_CLASS_NAME) {
            return Promise.resolve();
          }
          throw err;
        });
      });
      return Promise.all(promises).then(function () {
        return _this9._client.tx(function (t) {
          return t.batch([t.none(_sql2.default.misc.jsonObjectSetKeys), t.none(_sql2.default.array.add), t.none(_sql2.default.array.addUnique), t.none(_sql2.default.array.remove), t.none(_sql2.default.array.containsAll), t.none(_sql2.default.array.contains)]);
        });
      }).then(function (data) {
        debug('initializationDone in ' + data.duration);
      }).catch(function (error) {
        /* eslint-disable no-console */
        console.error(error);
      });
    }
  }]);

  return PostgresStorageAdapter;
}();

function removeWhiteSpace(regex) {
  if (!regex.endsWith('\n')) {
    regex += '\n';
  }

  // remove non escaped comments
  return regex.replace(/([^\\])#.*\n/gmi, '$1')
  // remove lines starting with a comment
  .replace(/^#.*\n/gmi, '')
  // remove non escaped whitespace
  .replace(/([^\\])\s+/gmi, '$1')
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

function createLiteralRegex(remaining) {
  return remaining.split('').map(function (c) {
    if (c.match(/[0-9a-zA-Z]/) !== null) {
      // don't escape alphanumeric characters
      return c;
    }
    // escape everything else (single quotes with single quotes, everything else with a backslash)
    return c === '\'' ? '\'\'' : '\\' + c;
  }).join('');
}

function literalizeRegexPart(s) {
  var matcher1 = /\\Q((?!\\E).*)\\E$/;
  var result1 = s.match(matcher1);
  if (result1 && result1.length > 1 && result1.index > -1) {
    // process regex that has a beginning and an end specified for the literal text
    var prefix = s.substr(0, result1.index);
    var remaining = result1[1];

    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // process regex that has a beginning specified for the literal text
  var matcher2 = /\\Q((?!\\E).*)$/;
  var result2 = s.match(matcher2);
  if (result2 && result2.length > 1 && result2.index > -1) {
    var _prefix = s.substr(0, result2.index);
    var _remaining = result2[1];

    return literalizeRegexPart(_prefix) + createLiteralRegex(_remaining);
  }

  // remove all instances of \Q and \E from the remaining text & escape single quotes
  return s.replace(/([^\\])(\\E)/, '$1').replace(/([^\\])(\\Q)/, '$1').replace(/^\\E/, '').replace(/^\\Q/, '').replace(/([^'])'/, '$1\'\'').replace(/^'([^'])/, '\'\'$1');
}

exports.default = PostgresStorageAdapter;

module.exports = PostgresStorageAdapter; // Required for tests