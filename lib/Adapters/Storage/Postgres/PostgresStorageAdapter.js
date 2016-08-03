'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var pgp = require('pg-promise')();

var PostgresRelationDoesNotExistError = '42P01';
var PostgresDuplicateRelationError = '42P07';
var PostgresDuplicateColumnError = '42701';
var PostgresUniqueIndexViolationError = '23505';

var parseTypeToPostgresType = function parseTypeToPostgresType(type) {
  switch (type.type) {
    case 'String':
      return 'text';
    case 'Date':
      return 'timestamp';
    case 'Object':
      return 'jsonb';
    case 'Boolean':
      return 'boolean';
    case 'Pointer':
      return 'char(10)';
    case 'Number':
      return 'double precision';
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

var buildWhereClause = function buildWhereClause(_ref) {
  var schema = _ref.schema;
  var query = _ref.query;
  var index = _ref.index;

  var patterns = [];
  var values = [];
  for (var fieldName in query) {
    var fieldValue = query[fieldName];
    if (typeof fieldValue === 'string') {
      patterns.push('$' + index + ':name = $' + (index + 1));
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (fieldValue.$ne) {
      patterns.push('$' + index + ':name <> $' + (index + 1));
      values.push(fieldName, fieldValue.$ne);
      index += 2;
    } else if (fieldName === '$or') {
      fieldValue.map(function (subQuery) {
        return buildWhereClause({ schema: schema, query: subQuery, index: index });
      }).forEach(function (result) {
        patterns.push(result.pattern);
        values.push.apply(values, _toConsumableArray(result.values));
      });
    } else if (Array.isArray(fieldValue.$in) && schema.fields[fieldName].type === 'Array') {
      (function () {
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
      })();
    } else if (Array.isArray(fieldValue.$in) && schema.fields[fieldName].type === 'String') {
      (function () {
        var inPatterns = [];
        values.push(fieldName);
        fieldValue.$in.forEach(function (listElem, listIndex) {
          values.push(listElem);
          inPatterns.push('$' + (index + 1 + listIndex));
        });
        patterns.push('$' + index + ':name IN (' + inPatterns.join(',') + ')');
        index = index + 1 + inPatterns.length;
      })();
    } else if (fieldValue.__type === 'Pointer') {
      patterns.push('$' + index + ':name = $' + (index + 1));
      values.push(fieldName, fieldValue.objectId);
      index += 2;
    } else {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Postgres doesn\'t support this query type yet');
    }
  }
  return { pattern: patterns.join(' AND '), values: values };
};

var PostgresStorageAdapter = exports.PostgresStorageAdapter = function () {
  // Private
  function PostgresStorageAdapter(_ref2) {
    var uri = _ref2.uri;
    var _ref2$collectionPrefi = _ref2.collectionPrefix;
    var collectionPrefix = _ref2$collectionPrefi === undefined ? '' : _ref2$collectionPrefi;

    _classCallCheck(this, PostgresStorageAdapter);

    this._collectionPrefix = collectionPrefix;
    this._client = pgp(uri);
  }

  _createClass(PostgresStorageAdapter, [{
    key: '_ensureSchemaCollectionExists',
    value: function _ensureSchemaCollectionExists() {
      return this._client.query('CREATE TABLE "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )').catch(function (error) {
        if (error.code === PostgresDuplicateRelationError) {
          // Table already exists, must have been created by a different request. Ignore error.
        } else {
          throw error;
        }
      });
    }
  }, {
    key: 'classExists',
    value: function classExists(name) {
      return notImplemented();
    }
  }, {
    key: 'setClassLevelPermissions',
    value: function setClassLevelPermissions(className, CLPs) {
      return notImplemented();
    }
  }, {
    key: 'createClass',
    value: function createClass(className, schema) {
      var _this = this;

      var valuesArray = [];
      var patternsArray = [];
      Object.keys(schema.fields).forEach(function (fieldName, index) {
        valuesArray.push(fieldName);
        var parseType = schema.fields[fieldName];
        if (['_rperm', '_wperm'].includes(fieldName)) {
          parseType.contents = { type: 'String' };
        }
        valuesArray.push(parseTypeToPostgresType(parseType));
        patternsArray.push('$' + (index * 2 + 2) + ':name $' + (index * 2 + 3) + ':raw');
      });
      return this._ensureSchemaCollectionExists().then(function () {
        return _this._client.query('CREATE TABLE $1:name (' + patternsArray.join(',') + ')', [className].concat(valuesArray));
      }).catch(function (error) {
        if (error.code === PostgresDuplicateRelationError) {
          // Table already exists, must have been created by a different request. Ignore error.
        } else {
          throw error;
        }
      }).then(function () {
        return _this._client.query('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', { className: className, schema: schema });
      }).then(function () {
        return schema;
      });
    }
  }, {
    key: 'addFieldIfNotExists',
    value: function addFieldIfNotExists(className, fieldName, type) {
      var _this2 = this;

      // TODO: Must be revised for invalid logic...
      return this._client.tx("addFieldIfNotExists", function (t) {
        return t.query('ALTER TABLE $<className:name> ADD COLUMN $<fieldName:name> $<postgresType:raw>', {
          className: className,
          fieldName: fieldName,
          postgresType: parseTypeToPostgresType(type)
        }).catch(function (error) {
          if (error.code === PostgresRelationDoesNotExistError) {
            return _this2.createClass(className, { fields: _defineProperty({}, fieldName, type) });
          } else if (error.code === PostgresDuplicateColumnError) {
            // Column already exists, created by other request. Carry on to
            // See if it's the right type.
          } else {
            throw error;
          }
        }).then(function () {
          return t.query('SELECT "schema" FROM "_SCHEMA" WHERE "className" = $<className>', { className: className });
        }).then(function (result) {
          if (fieldName in result[0].schema) {
            throw "Attempted to add a field that already exists";
          } else {
            result[0].schema.fields[fieldName] = type;
            return t.query('UPDATE "_SCHEMA" SET "schema"=$<schema> WHERE "className"=$<className>', { schema: result[0].schema, className: className });
          }
        });
      });
    }

    // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
    // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.

  }, {
    key: 'deleteClass',
    value: function deleteClass(className) {
      return notImplemented();
    }

    // Delete all data known to this adapter. Used for testing.

  }, {
    key: 'deleteAllClasses',
    value: function deleteAllClasses() {
      var _this3 = this;

      return this._client.query('SELECT "className" FROM "_SCHEMA"').then(function (results) {
        var classes = ['_SCHEMA'].concat(_toConsumableArray(results.map(function (result) {
          return result.className;
        })));
        return _this3._client.tx(function (t) {
          return t.batch(classes.map(function (className) {
            return t.none('DROP TABLE $<className:name>', { className: className });
          }));
        });
      }, function (error) {
        if (error.code === PostgresRelationDoesNotExistError) {
          // No _SCHEMA collection. Don't delete anything.
          return;
        } else {
          throw error;
        }
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
      return notImplemented();
    }

    // Return a promise for all schemas known to this adapter, in Parse format. In case the
    // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
    // rejection reason are TBD.

  }, {
    key: 'getAllClasses',
    value: function getAllClasses() {
      var _this4 = this;

      return this._ensureSchemaCollectionExists().then(function () {
        return _this4._client.map('SELECT * FROM "_SCHEMA"', null, function (row) {
          return _extends({ className: row.className }, row.schema);
        });
      });
    }

    // Return a promise for the schema with the given name, in Parse format. If
    // this adapter doesn't know about the schema, return a promise that rejects with
    // undefined as the reason.

  }, {
    key: 'getClass',
    value: function getClass(className) {
      return this._client.query('SELECT * FROM "_SCHEMA" WHERE "className"=$<className>', { className: className }).then(function (result) {
        if (result.length === 1) {
          return result[0].schema;
        } else {
          throw undefined;
        }
      });
    }

    // TODO: remove the mongo format dependency in the return value

  }, {
    key: 'createObject',
    value: function createObject(className, schema, object) {
      var columnsArray = [];
      var valuesArray = [];
      Object.keys(object).forEach(function (fieldName) {
        columnsArray.push(fieldName);
        switch (schema.fields[fieldName].type) {
          case 'Date':
            valuesArray.push(object[fieldName].iso);
            break;
          case 'Pointer':
            valuesArray.push(object[fieldName].objectId);
            break;
          case 'Array':
            if (['_rperm', '_wperm'].includes(fieldName)) {
              valuesArray.push(object[fieldName]);
            } else {
              valuesArray.push(JSON.stringify(object[fieldName]));
            }
            break;
          case 'Object':
            valuesArray.push(object[fieldName]);
            break;
          case 'String':
            valuesArray.push(object[fieldName]);
            break;
          case 'Number':
            valuesArray.push(object[fieldName]);
            break;
          case 'Boolean':
            valuesArray.push(object[fieldName]);
            break;
          default:
            throw 'Type ' + schema.fields[fieldName].type + ' not supported yet';
            break;
        }
      });
      var columnsPattern = columnsArray.map(function (col, index) {
        return '$' + (index + 2) + ':name';
      }).join(',');
      var valuesPattern = valuesArray.map(function (val, index) {
        return '$' + (index + 2 + columnsArray.length) + (['_rperm', '_wperm'].includes(columnsArray[index]) ? '::text[]' : '');
      }).join(',');
      var qs = 'INSERT INTO $1:name (' + columnsPattern + ') VALUES (' + valuesPattern + ')';
      var values = [className].concat(columnsArray, valuesArray);
      return this._client.query(qs, values).then(function () {
        return { ops: [object] };
      }).catch(function (error) {
        if (error.code === PostgresUniqueIndexViolationError) {
          throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
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
      return this._client.one('WITH deleted AS (DELETE FROM $<className:name> RETURNING *) SELECT count(*) FROM deleted', { className: className }, function (res) {
        return parseInt(res.count);
      }).then(function (count) {
        if (count === 0) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        } else {
          return count;
        }
      });
    }

    // Apply the update to all objects that match the given Parse Query.

  }, {
    key: 'updateObjectsByQuery',
    value: function updateObjectsByQuery(className, schema, query, update) {
      return notImplemented();
    }

    // Return value not currently well specified.

  }, {
    key: 'findOneAndUpdate',
    value: function findOneAndUpdate(className, schema, query, update) {
      var conditionPatterns = [];
      var updatePatterns = [];
      var values = [className];
      var index = 2;

      for (var fieldName in update) {
        var fieldValue = update[fieldName];
        if (fieldValue.__op === 'Increment') {
          updatePatterns.push('$' + index + ':name = COALESCE($' + index + ':name, 0) + $' + (index + 1));
          values.push(fieldName, fieldValue.amount);
          index += 2;
        } else if (fieldValue.__op === 'Add') {
          updatePatterns.push('$' + index + ':name = COALESCE($' + index + ':name, \'[]\'::jsonb) || $' + (index + 1));
          values.push(fieldName, fieldValue.objects);
          index += 2;
        } else if (fieldValue.__op === 'Remove') {
          return Promise.reject(new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Postgres does not support Remove operator.'));
        } else if (fieldValue.__op === 'AddUnique') {
          return Promise.reject(new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Postgres does not support AddUnique operator'));
        } else if (fieldName === 'updatedAt') {
          //TODO: stop special casing this. It should check for __type === 'Date' and use .iso
          updatePatterns.push('$' + index + ':name = $' + (index + 1));
          values.push(fieldName, new Date(fieldValue));
          index += 2;
        } else if (typeof fieldValue === 'string') {
          updatePatterns.push('$' + index + ':name = $' + (index + 1));
          values.push(fieldName, fieldValue);
          index += 2;
        } else if (fieldValue.__type === 'Pointer') {
          updatePatterns.push('$' + index + ':name = $' + (index + 1));
          values.push(fieldName, fieldValue.objectId);
          index += 2;
        } else {
          return Promise.reject(new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Postgres doesn\'t support update ' + JSON.stringify(fieldValue) + ' yet'));
        }
      }

      var where = buildWhereClause({ schema: schema, index: index, query: query });
      values.push.apply(values, _toConsumableArray(where.values));

      var qs = 'UPDATE $1:name SET ' + updatePatterns.join(',') + ' WHERE ' + where.pattern + ' RETURNING *';
      return this._client.query(qs, values).then(function (val) {
        return val[0];
      }); // TODO: This is unsafe, verification is needed, or a different query method;
    }

    // Hopefully, we can get rid of this. It's only used for config and hooks.

  }, {
    key: 'upsertOneObject',
    value: function upsertOneObject(className, schema, query, update) {
      return notImplemented();
    }
  }, {
    key: 'find',
    value: function find(className, schema, query, _ref3) {
      var skip = _ref3.skip;
      var limit = _ref3.limit;
      var sort = _ref3.sort;

      var values = [className];
      var where = buildWhereClause({ schema: schema, query: query, index: 2 });
      values.push.apply(values, _toConsumableArray(where.values));

      var wherePattern = where.pattern.length > 0 ? 'WHERE ' + where.pattern : '';
      var limitPattern = limit !== undefined ? 'LIMIT $' + (values.length + 1) : '';

      var qs = 'SELECT * FROM $1:name ' + wherePattern + ' ' + limitPattern;
      if (limit !== undefined) {
        values.push(limit);
      }
      return this._client.query(qs, values).then(function (results) {
        return results.map(function (object) {
          Object.keys(schema.fields).filter(function (field) {
            return schema.fields[field].type === 'Pointer';
          }).forEach(function (fieldName) {
            object[fieldName] = { objectId: object[fieldName], __type: 'Pointer', className: schema.fields[fieldName].targetClass };
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
      return this._client.query(qs, [className, constraintName].concat(_toConsumableArray(fieldNames))).catch(function (error) {
        if (error.code === PostgresDuplicateRelationError && error.message.includes(constraintName)) {
          // Index already exists. Ignore error.
        } else {
          throw error;
        }
      });
    }

    // Executes a count.

  }, {
    key: 'count',
    value: function count(className, schema, query) {
      var values = [className];
      var where = buildWhereClause({ schema: schema, query: query, index: 2 });
      values.push.apply(values, _toConsumableArray(where.values));

      var wherePattern = where.pattern.length > 0 ? 'WHERE ' + where.pattern : '';
      var qs = 'SELECT COUNT(*) FROM $1:name ' + wherePattern;
      return this._client.query(qs, values).then(function (result) {
        return parseInt(result[0].count);
      });
    }
  }]);

  return PostgresStorageAdapter;
}();

function notImplemented() {
  return Promise.reject(new Error('Not implemented yet.'));
}

exports.default = PostgresStorageAdapter;

module.exports = PostgresStorageAdapter; // Required for tests