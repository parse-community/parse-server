'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VolatileClassesSchemas = exports.convertSchemaToAdapterSchema = exports.defaultColumns = exports.systemClasses = exports.buildMergedSchemaObject = exports.invalidClassNameMessage = exports.fieldNameIsValid = exports.classNameIsValid = exports.load = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

// This class handles schema validation, persistence, and modification.
//
// Each individual Schema object should be immutable. The helpers to
// do things with the Schema just return a new schema when the schema
// is changed.
//
// The canonical place to store this Schema is in the database itself,
// in a _SCHEMA collection. This is not the right way to do it for an
// open source framework, but it's backward compatible, so we're
// keeping it this way for now.
//
// In API-handling code, you should only use the Schema class via the
// DatabaseController. This will let us replace the schema logic for
// different databases.
// TODO: hide all schema logic inside the database adapter.

var Parse = require('parse/node').Parse;


var defaultColumns = Object.freeze({
  // Contain the default columns for every parse object type (except _Join collection)
  _Default: {
    "objectId": { type: 'String' },
    "createdAt": { type: 'Date' },
    "updatedAt": { type: 'Date' },
    "ACL": { type: 'ACL' }
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _User: {
    "username": { type: 'String' },
    "password": { type: 'String' },
    "email": { type: 'String' },
    "emailVerified": { type: 'Boolean' },
    "authData": { type: 'Object' }
  },
  // The additional default columns for the _Installation collection (in addition to DefaultCols)
  _Installation: {
    "installationId": { type: 'String' },
    "deviceToken": { type: 'String' },
    "channels": { type: 'Array' },
    "deviceType": { type: 'String' },
    "pushType": { type: 'String' },
    "GCMSenderId": { type: 'String' },
    "timeZone": { type: 'String' },
    "localeIdentifier": { type: 'String' },
    "badge": { type: 'Number' },
    "appVersion": { type: 'String' },
    "appName": { type: 'String' },
    "appIdentifier": { type: 'String' },
    "parseVersion": { type: 'String' }
  },
  // The additional default columns for the _Role collection (in addition to DefaultCols)
  _Role: {
    "name": { type: 'String' },
    "users": { type: 'Relation', targetClass: '_User' },
    "roles": { type: 'Relation', targetClass: '_Role' }
  },
  // The additional default columns for the _Session collection (in addition to DefaultCols)
  _Session: {
    "restricted": { type: 'Boolean' },
    "user": { type: 'Pointer', targetClass: '_User' },
    "installationId": { type: 'String' },
    "sessionToken": { type: 'String' },
    "expiresAt": { type: 'Date' },
    "createdWith": { type: 'Object' }
  },
  _Product: {
    "productIdentifier": { type: 'String' },
    "download": { type: 'File' },
    "downloadName": { type: 'String' },
    "icon": { type: 'File' },
    "order": { type: 'Number' },
    "title": { type: 'String' },
    "subtitle": { type: 'String' }
  },
  _PushStatus: {
    "pushTime": { type: 'String' },
    "source": { type: 'String' }, // rest or webui
    "query": { type: 'String' }, // the stringified JSON query
    "payload": { type: 'String' }, // the stringified JSON payload,
    "title": { type: 'String' },
    "expiry": { type: 'Number' },
    "status": { type: 'String' },
    "numSent": { type: 'Number' },
    "numFailed": { type: 'Number' },
    "pushHash": { type: 'String' },
    "errorMessage": { type: 'Object' },
    "sentPerType": { type: 'Object' },
    "failedPerType": { type: 'Object' }
  },
  _JobStatus: {
    "jobName": { type: 'String' },
    "source": { type: 'String' },
    "status": { type: 'String' },
    "message": { type: 'String' },
    "params": { type: 'Object' }, // params received when calling the job
    "finishedAt": { type: 'Date' }
  },
  _Hooks: {
    "functionName": { type: 'String' },
    "className": { type: 'String' },
    "triggerName": { type: 'String' },
    "url": { type: 'String' }
  },
  _GlobalConfig: {
    "objectId": { type: 'String' },
    "params": { type: 'Object' }
  }
});

var requiredColumns = Object.freeze({
  _Product: ["productIdentifier", "icon", "order", "title", "subtitle"],
  _Role: ["name", "ACL"]
});

var systemClasses = Object.freeze(['_User', '_Installation', '_Role', '_Session', '_Product', '_PushStatus', '_JobStatus']);

var volatileClasses = Object.freeze(['_JobStatus', '_PushStatus', '_Hooks', '_GlobalConfig']);

// 10 alpha numberic chars + uppercase
var userIdRegex = /^[a-zA-Z0-9]{10}$/;
// Anything that start with role
var roleRegex = /^role:.*/;
// * permission
var publicRegex = /^\*$/;

var permissionKeyRegex = Object.freeze([userIdRegex, roleRegex, publicRegex]);

function verifyPermissionKey(key) {
  var result = permissionKeyRegex.reduce(function (isGood, regEx) {
    isGood = isGood || key.match(regEx) != null;
    return isGood;
  }, false);
  if (!result) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, '\'' + key + '\' is not a valid key for class level permissions');
  }
}

var CLPValidKeys = Object.freeze(['find', 'get', 'create', 'update', 'delete', 'addField', 'readUserFields', 'writeUserFields']);
function validateCLP(perms, fields) {
  if (!perms) {
    return;
  }
  Object.keys(perms).forEach(function (operation) {
    if (CLPValidKeys.indexOf(operation) == -1) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, operation + ' is not a valid operation for class level permissions');
    }

    if (operation === 'readUserFields' || operation === 'writeUserFields') {
      if (!Array.isArray(perms[operation])) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, '\'' + perms[operation] + '\' is not a valid value for class level permissions ' + operation);
      } else {
        perms[operation].forEach(function (key) {
          if (!fields[key] || fields[key].type != 'Pointer' || fields[key].targetClass != '_User') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, '\'' + key + '\' is not a valid column for class level pointer permissions ' + operation);
          }
        });
      }
      return;
    }

    Object.keys(perms[operation]).forEach(function (key) {
      verifyPermissionKey(key);
      var perm = perms[operation][key];
      if (perm !== true) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, '\'' + perm + '\' is not a valid value for class level permissions ' + operation + ':' + key + ':' + perm);
      }
    });
  });
}
var joinClassRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
var classAndFieldRegex = /^[A-Za-z][A-Za-z0-9_]*$/;
function classNameIsValid(className) {
  // Valid classes must:
  return (
    // Be one of _User, _Installation, _Role, _Session OR
    systemClasses.indexOf(className) > -1 ||
    // Be a join table OR
    joinClassRegex.test(className) ||
    // Include only alpha-numeric and underscores, and not start with an underscore or number
    fieldNameIsValid(className)
  );
}

// Valid fields must be alpha-numeric, and not start with an underscore or number
function fieldNameIsValid(fieldName) {
  return classAndFieldRegex.test(fieldName);
}

// Checks that it's not trying to clobber one of the default fields of the class.
function fieldNameIsValidForClass(fieldName, className) {
  if (!fieldNameIsValid(fieldName)) {
    return false;
  }
  if (defaultColumns._Default[fieldName]) {
    return false;
  }
  if (defaultColumns[className] && defaultColumns[className][fieldName]) {
    return false;
  }
  return true;
}

function invalidClassNameMessage(className) {
  return 'Invalid classname: ' + className + ', classnames can only have alphanumeric characters and _, and must start with an alpha character ';
}

var invalidJsonError = new Parse.Error(Parse.Error.INVALID_JSON, "invalid JSON");
var validNonRelationOrPointerTypes = ['Number', 'String', 'Boolean', 'Date', 'Object', 'Array', 'GeoPoint', 'File'];
// Returns an error suitable for throwing if the type is invalid
var fieldTypeIsInvalid = function fieldTypeIsInvalid(_ref) {
  var type = _ref.type,
      targetClass = _ref.targetClass;

  if (['Pointer', 'Relation'].indexOf(type) >= 0) {
    if (!targetClass) {
      return new Parse.Error(135, 'type ' + type + ' needs a class name');
    } else if (typeof targetClass !== 'string') {
      return invalidJsonError;
    } else if (!classNameIsValid(targetClass)) {
      return new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(targetClass));
    } else {
      return undefined;
    }
  }
  if (typeof type !== 'string') {
    return invalidJsonError;
  }
  if (validNonRelationOrPointerTypes.indexOf(type) < 0) {
    return new Parse.Error(Parse.Error.INCORRECT_TYPE, 'invalid field type: ' + type);
  }
  return undefined;
};

var convertSchemaToAdapterSchema = function convertSchemaToAdapterSchema(schema) {
  schema = injectDefaultSchema(schema);
  delete schema.fields.ACL;
  schema.fields._rperm = { type: 'Array' };
  schema.fields._wperm = { type: 'Array' };

  if (schema.className === '_User') {
    delete schema.fields.password;
    schema.fields._hashed_password = { type: 'String' };
  }

  return schema;
};

var convertAdapterSchemaToParseSchema = function convertAdapterSchemaToParseSchema(_ref2) {
  var schema = _objectWithoutProperties(_ref2, []);

  delete schema.fields._rperm;
  delete schema.fields._wperm;

  schema.fields.ACL = { type: 'ACL' };

  if (schema.className === '_User') {
    delete schema.fields.authData; //Auth data is implicit
    delete schema.fields._hashed_password;
    schema.fields.password = { type: 'String' };
  }

  return schema;
};

var injectDefaultSchema = function injectDefaultSchema(_ref3) {
  var className = _ref3.className,
      fields = _ref3.fields,
      classLevelPermissions = _ref3.classLevelPermissions;
  return {
    className: className,
    fields: _extends({}, defaultColumns._Default, defaultColumns[className] || {}, fields),
    classLevelPermissions: classLevelPermissions
  };
};

var _HooksSchema = { className: "_Hooks", fields: defaultColumns._Hooks };
var _GlobalConfigSchema = { className: "_GlobalConfig", fields: defaultColumns._GlobalConfig };
var _PushStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: "_PushStatus",
  fields: {},
  classLevelPermissions: {}
}));
var _JobStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: "_JobStatus",
  fields: {},
  classLevelPermissions: {}
}));
var VolatileClassesSchemas = [_HooksSchema, _JobStatusSchema, _PushStatusSchema, _GlobalConfigSchema];

var dbTypeMatchesObjectType = function dbTypeMatchesObjectType(dbType, objectType) {
  if (dbType.type !== objectType.type) return false;
  if (dbType.targetClass !== objectType.targetClass) return false;
  if (dbType === objectType.type) return true;
  if (dbType.type === objectType.type) return true;
  return false;
};

var typeToString = function typeToString(type) {
  if (type.targetClass) {
    return type.type + '<' + type.targetClass + '>';
  }
  return '' + (type.type || type);
};

// Stores the entire schema of the app in a weird hybrid format somewhere between
// the mongo format and the Parse format. Soon, this will all be Parse format.

var SchemaController = function () {
  function SchemaController(databaseAdapter, schemaCache) {
    _classCallCheck(this, SchemaController);

    this._dbAdapter = databaseAdapter;
    this._cache = schemaCache;
    // this.data[className][fieldName] tells you the type of that field, in mongo format
    this.data = {};
    // this.perms[className][operation] tells you the acl-style permissions
    this.perms = {};
  }

  _createClass(SchemaController, [{
    key: 'reloadData',
    value: function reloadData() {
      var _this = this;

      var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : { clearCache: false };

      var promise = Promise.resolve();
      if (options.clearCache) {
        promise = promise.then(function () {
          return _this._cache.clear();
        });
      }
      if (this.reloadDataPromise && !options.clearCache) {
        return this.reloadDataPromise;
      }
      this.data = {};
      this.perms = {};
      this.reloadDataPromise = promise.then(function () {
        return _this.getAllClasses(options);
      }).then(function (allSchemas) {
        allSchemas.forEach(function (schema) {
          _this.data[schema.className] = injectDefaultSchema(schema).fields;
          _this.perms[schema.className] = schema.classLevelPermissions;
        });

        // Inject the in-memory classes
        volatileClasses.forEach(function (className) {
          _this.data[className] = injectDefaultSchema({
            className: className,
            fields: {},
            classLevelPermissions: {}
          });
        });
        delete _this.reloadDataPromise;
      }, function (err) {
        delete _this.reloadDataPromise;
        throw err;
      });
      return this.reloadDataPromise;
    }
  }, {
    key: 'getAllClasses',
    value: function getAllClasses() {
      var _this2 = this;

      var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : { clearCache: false };

      var promise = Promise.resolve();
      if (options.clearCache) {
        promise = this._cache.clear();
      }
      return promise.then(function () {
        return _this2._cache.getAllClasses();
      }).then(function (allClasses) {
        if (allClasses && allClasses.length && !options.clearCache) {
          return Promise.resolve(allClasses);
        }
        return _this2._dbAdapter.getAllClasses().then(function (allSchemas) {
          return allSchemas.map(injectDefaultSchema);
        }).then(function (allSchemas) {
          return _this2._cache.setAllClasses(allSchemas).then(function () {
            return allSchemas;
          });
        });
      });
    }
  }, {
    key: 'getOneSchema',
    value: function getOneSchema(className) {
      var _this3 = this;

      var allowVolatileClasses = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : { clearCache: false };

      var promise = Promise.resolve();
      if (options.clearCache) {
        promise = this._cache.clear();
      }
      return promise.then(function () {
        if (allowVolatileClasses && volatileClasses.indexOf(className) > -1) {
          return Promise.resolve(_this3.data[className]);
        }
        return _this3._cache.getOneSchema(className).then(function (cached) {
          if (cached && !options.clearCache) {
            return Promise.resolve(cached);
          }
          return _this3._dbAdapter.getClass(className).then(injectDefaultSchema).then(function (result) {
            return _this3._cache.setOneSchema(className, result).then(function () {
              return result;
            });
          });
        });
      });
    }

    // Create a new class that includes the three default fields.
    // ACL is an implicit column that does not get an entry in the
    // _SCHEMAS database. Returns a promise that resolves with the
    // created schema, in mongo format.
    // on success, and rejects with an error on fail. Ensure you
    // have authorization (master key, or client class creation
    // enabled) before calling this function.

  }, {
    key: 'addClassIfNotExists',
    value: function addClassIfNotExists(className) {
      var _this4 = this;

      var fields = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var classLevelPermissions = arguments[2];

      var validationError = this.validateNewClass(className, fields, classLevelPermissions);
      if (validationError) {
        return Promise.reject(validationError);
      }

      return this._dbAdapter.createClass(className, convertSchemaToAdapterSchema({ fields: fields, classLevelPermissions: classLevelPermissions, className: className })).then(convertAdapterSchemaToParseSchema).then(function (res) {
        return _this4._cache.clear().then(function () {
          return Promise.resolve(res);
        });
      }).catch(function (error) {
        if (error && error.code === Parse.Error.DUPLICATE_VALUE) {
          throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, 'Class ' + className + ' already exists.');
        } else {
          throw error;
        }
      });
    }
  }, {
    key: 'updateClass',
    value: function updateClass(className, submittedFields, classLevelPermissions, database) {
      var _this5 = this;

      return this.getOneSchema(className).then(function (schema) {
        var existingFields = schema.fields;
        Object.keys(submittedFields).forEach(function (name) {
          var field = submittedFields[name];
          if (existingFields[name] && field.__op !== 'Delete') {
            throw new Parse.Error(255, 'Field ' + name + ' exists, cannot update.');
          }
          if (!existingFields[name] && field.__op === 'Delete') {
            throw new Parse.Error(255, 'Field ' + name + ' does not exist, cannot delete.');
          }
        });

        delete existingFields._rperm;
        delete existingFields._wperm;
        var newSchema = buildMergedSchemaObject(existingFields, submittedFields);
        var validationError = _this5.validateSchemaData(className, newSchema, classLevelPermissions, Object.keys(existingFields));
        if (validationError) {
          throw new Parse.Error(validationError.code, validationError.error);
        }

        // Finally we have checked to make sure the request is valid and we can start deleting fields.
        // Do all deletions first, then a single save to _SCHEMA collection to handle all additions.
        var deletePromises = [];
        var insertedFields = [];
        Object.keys(submittedFields).forEach(function (fieldName) {
          if (submittedFields[fieldName].__op === 'Delete') {
            var promise = _this5.deleteField(fieldName, className, database);
            deletePromises.push(promise);
          } else {
            insertedFields.push(fieldName);
          }
        });

        return Promise.all(deletePromises) // Delete Everything
        .then(function () {
          return _this5.reloadData({ clearCache: true });
        }) // Reload our Schema, so we have all the new values
        .then(function () {
          var promises = insertedFields.map(function (fieldName) {
            var type = submittedFields[fieldName];
            return _this5.enforceFieldExists(className, fieldName, type);
          });
          return Promise.all(promises);
        }).then(function () {
          return _this5.setPermissions(className, classLevelPermissions, newSchema);
        })
        //TODO: Move this logic into the database adapter
        .then(function () {
          return {
            className: className,
            fields: _this5.data[className],
            classLevelPermissions: _this5.perms[className]
          };
        });
      }).catch(function (error) {
        if (error === undefined) {
          throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, 'Class ' + className + ' does not exist.');
        } else {
          throw error;
        }
      });
    }

    // Returns a promise that resolves successfully to the new schema
    // object or fails with a reason.

  }, {
    key: 'enforceClassExists',
    value: function enforceClassExists(className) {
      var _this6 = this;

      if (this.data[className]) {
        return Promise.resolve(this);
      }
      // We don't have this class. Update the schema
      return this.addClassIfNotExists(className)
      // The schema update succeeded. Reload the schema
      .then(function () {
        return _this6.reloadData({ clearCache: true });
      }).catch(function (error) {
        // The schema update failed. This can be okay - it might
        // have failed because there's a race condition and a different
        // client is making the exact same schema update that we want.
        // So just reload the schema.
        return _this6.reloadData({ clearCache: true });
      }).then(function () {
        // Ensure that the schema now validates
        if (_this6.data[className]) {
          return _this6;
        } else {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'Failed to add ' + className);
        }
      }).catch(function (error) {
        // The schema still doesn't validate. Give up
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'schema class name does not revalidate');
      });
    }
  }, {
    key: 'validateNewClass',
    value: function validateNewClass(className) {
      var fields = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var classLevelPermissions = arguments[2];

      if (this.data[className]) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, 'Class ' + className + ' already exists.');
      }
      if (!classNameIsValid(className)) {
        return {
          code: Parse.Error.INVALID_CLASS_NAME,
          error: invalidClassNameMessage(className)
        };
      }
      return this.validateSchemaData(className, fields, classLevelPermissions, []);
    }
  }, {
    key: 'validateSchemaData',
    value: function validateSchemaData(className, fields, classLevelPermissions, existingFieldNames) {
      for (var fieldName in fields) {
        if (existingFieldNames.indexOf(fieldName) < 0) {
          if (!fieldNameIsValid(fieldName)) {
            return {
              code: Parse.Error.INVALID_KEY_NAME,
              error: 'invalid field name: ' + fieldName
            };
          }
          if (!fieldNameIsValidForClass(fieldName, className)) {
            return {
              code: 136,
              error: 'field ' + fieldName + ' cannot be added'
            };
          }
          var error = fieldTypeIsInvalid(fields[fieldName]);
          if (error) return { code: error.code, error: error.message };
        }
      }

      for (var _fieldName in defaultColumns[className]) {
        fields[_fieldName] = defaultColumns[className][_fieldName];
      }

      var geoPoints = Object.keys(fields).filter(function (key) {
        return fields[key] && fields[key].type === 'GeoPoint';
      });
      if (geoPoints.length > 1) {
        return {
          code: Parse.Error.INCORRECT_TYPE,
          error: 'currently, only one GeoPoint field may exist in an object. Adding ' + geoPoints[1] + ' when ' + geoPoints[0] + ' already exists.'
        };
      }
      validateCLP(classLevelPermissions, fields);
    }

    // Sets the Class-level permissions for a given className, which must exist.

  }, {
    key: 'setPermissions',
    value: function setPermissions(className, perms, newSchema) {
      var _this7 = this;

      if (typeof perms === 'undefined') {
        return Promise.resolve();
      }
      validateCLP(perms, newSchema);
      return this._dbAdapter.setClassLevelPermissions(className, perms).then(function () {
        return _this7.reloadData({ clearCache: true });
      });
    }

    // Returns a promise that resolves successfully to the new schema
    // object if the provided className-fieldName-type tuple is valid.
    // The className must already be validated.
    // If 'freeze' is true, refuse to update the schema for this field.

  }, {
    key: 'enforceFieldExists',
    value: function enforceFieldExists(className, fieldName, type, freeze) {
      var _this8 = this;

      if (fieldName.indexOf(".") > 0) {
        // subdocument key (x.y) => ok if x is of type 'object'
        fieldName = fieldName.split(".")[0];
        type = 'Object';
      }
      if (!fieldNameIsValid(fieldName)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'Invalid field name: ' + fieldName + '.');
      }

      // If someone tries to create a new field with null/undefined as the value, return;
      if (!type) {
        return Promise.resolve(this);
      }

      return this.reloadData().then(function () {
        var expectedType = _this8.getExpectedType(className, fieldName);
        if (typeof type === 'string') {
          type = { type: type };
        }

        if (expectedType) {
          if (!dbTypeMatchesObjectType(expectedType, type)) {
            throw new Parse.Error(Parse.Error.INCORRECT_TYPE, 'schema mismatch for ' + className + '.' + fieldName + '; expected ' + typeToString(expectedType) + ' but got ' + typeToString(type));
          }
          return _this8;
        }

        return _this8._dbAdapter.addFieldIfNotExists(className, fieldName, type).then(function () {
          // The update succeeded. Reload the schema
          return _this8.reloadData({ clearCache: true });
        }, function (error) {
          //TODO: introspect the error and only reload if the error is one for which is makes sense to reload

          // The update failed. This can be okay - it might have been a race
          // condition where another client updated the schema in the same
          // way that we wanted to. So, just reload the schema
          return _this8.reloadData({ clearCache: true });
        }).then(function (error) {
          // Ensure that the schema now validates
          if (!dbTypeMatchesObjectType(_this8.getExpectedType(className, fieldName), type)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'Could not add field ' + fieldName);
          }
          // Remove the cached schema
          _this8._cache.clear();
          return _this8;
        });
      });
    }

    // Delete a field, and remove that data from all objects. This is intended
    // to remove unused fields, if other writers are writing objects that include
    // this field, the field may reappear. Returns a Promise that resolves with
    // no object on success, or rejects with { code, error } on failure.
    // Passing the database and prefix is necessary in order to drop relation collections
    // and remove fields from objects. Ideally the database would belong to
    // a database adapter and this function would close over it or access it via member.

  }, {
    key: 'deleteField',
    value: function deleteField(fieldName, className, database) {
      var _this9 = this;

      if (!classNameIsValid(className)) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(className));
      }
      if (!fieldNameIsValid(fieldName)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'invalid field name: ' + fieldName);
      }
      //Don't allow deleting the default fields.
      if (!fieldNameIsValidForClass(fieldName, className)) {
        throw new Parse.Error(136, 'field ' + fieldName + ' cannot be changed');
      }

      return this.getOneSchema(className, false, { clearCache: true }).catch(function (error) {
        if (error === undefined) {
          throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, 'Class ' + className + ' does not exist.');
        } else {
          throw error;
        }
      }).then(function (schema) {
        if (!schema.fields[fieldName]) {
          throw new Parse.Error(255, 'Field ' + fieldName + ' does not exist, cannot delete.');
        }
        if (schema.fields[fieldName].type == 'Relation') {
          //For relations, drop the _Join table
          return database.adapter.deleteFields(className, schema, [fieldName]).then(function () {
            return database.adapter.deleteClass('_Join:' + fieldName + ':' + className);
          });
        }
        return database.adapter.deleteFields(className, schema, [fieldName]);
      }).then(function () {
        _this9._cache.clear();
      });
    }

    // Validates an object provided in REST format.
    // Returns a promise that resolves to the new schema if this object is
    // valid.

  }, {
    key: 'validateObject',
    value: function validateObject(className, object, query) {
      var geocount = 0;
      var promise = this.enforceClassExists(className);

      var _loop = function _loop(fieldName) {
        if (object[fieldName] === undefined) {
          return 'continue';
        }
        var expected = getType(object[fieldName]);
        if (expected === 'GeoPoint') {
          geocount++;
        }
        if (geocount > 1) {
          // Make sure all field validation operations run before we return.
          // If not - we are continuing to run logic, but already provided response from the server.
          return {
            v: promise.then(function () {
              return Promise.reject(new Parse.Error(Parse.Error.INCORRECT_TYPE, 'there can only be one geopoint field in a class'));
            })
          };
        }
        if (!expected) {
          return 'continue';
        }
        if (fieldName === 'ACL') {
          // Every object has ACL implicitly.
          return 'continue';
        }

        promise = promise.then(function (schema) {
          return schema.enforceFieldExists(className, fieldName, expected);
        });
      };

      for (var fieldName in object) {
        var _ret = _loop(fieldName);

        switch (_ret) {
          case 'continue':
            continue;

          default:
            if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
        }
      }
      promise = thenValidateRequiredColumns(promise, className, object, query);
      return promise;
    }

    // Validates that all the properties are set for the object

  }, {
    key: 'validateRequiredColumns',
    value: function validateRequiredColumns(className, object, query) {
      var columns = requiredColumns[className];
      if (!columns || columns.length == 0) {
        return Promise.resolve(this);
      }

      var missingColumns = columns.filter(function (column) {
        if (query && query.objectId) {
          if (object[column] && _typeof(object[column]) === "object") {
            // Trying to delete a required column
            return object[column].__op == 'Delete';
          }
          // Not trying to do anything there
          return false;
        }
        return !object[column];
      });

      if (missingColumns.length > 0) {
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, missingColumns[0] + ' is required.');
      }
      return Promise.resolve(this);
    }

    // Validates the base CLP for an operation

  }, {
    key: 'testBaseCLP',
    value: function testBaseCLP(className, aclGroup, operation) {
      if (!this.perms[className] || !this.perms[className][operation]) {
        return true;
      }
      var classPerms = this.perms[className];
      var perms = classPerms[operation];
      // Handle the public scenario quickly
      if (perms['*']) {
        return true;
      }
      // Check permissions against the aclGroup provided (array of userId/roles)
      if (aclGroup.some(function (acl) {
        return perms[acl] === true;
      })) {
        return true;
      }
      return false;
    }

    // Validates an operation passes class-level-permissions set in the schema

  }, {
    key: 'validatePermission',
    value: function validatePermission(className, aclGroup, operation) {
      if (this.testBaseCLP(className, aclGroup, operation)) {
        return Promise.resolve();
      }

      if (!this.perms[className] || !this.perms[className][operation]) {
        return true;
      }
      var classPerms = this.perms[className];
      var perms = classPerms[operation];
      // No matching CLP, let's check the Pointer permissions
      // And handle those later
      var permissionField = ['get', 'find'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';

      // Reject create when write lockdown
      if (permissionField == 'writeUserFields' && operation == 'create') {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied for action ' + operation + ' on class ' + className + '.');
      }

      // Process the readUserFields later
      if (Array.isArray(classPerms[permissionField]) && classPerms[permissionField].length > 0) {
        return Promise.resolve();
      }
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied for action ' + operation + ' on class ' + className + '.');
    }
  }, {
    key: 'getExpectedType',


    // Returns the expected type for a className+key combination
    // or undefined if the schema is not set
    value: function getExpectedType(className, fieldName) {
      if (this.data && this.data[className]) {
        var expectedType = this.data[className][fieldName];
        return expectedType === 'map' ? 'Object' : expectedType;
      }
      return undefined;
    }
  }, {
    key: 'hasClass',


    // Checks if a given class is in the schema.
    value: function hasClass(className) {
      var _this10 = this;

      return this.reloadData().then(function () {
        return !!_this10.data[className];
      });
    }
  }]);

  return SchemaController;
}();

// Returns a promise for a new Schema.


exports.default = SchemaController;
var load = function load(dbAdapter, schemaCache, options) {
  var schema = new SchemaController(dbAdapter, schemaCache);
  return schema.reloadData(options).then(function () {
    return schema;
  });
};

// Builds a new schema (in schema API response format) out of an
// existing mongo schema + a schemas API put request. This response
// does not include the default fields, as it is intended to be passed
// to mongoSchemaFromFieldsAndClassName. No validation is done here, it
// is done in mongoSchemaFromFieldsAndClassName.
function buildMergedSchemaObject(existingFields, putRequest) {
  var newSchema = {};
  var sysSchemaField = Object.keys(defaultColumns).indexOf(existingFields._id) === -1 ? [] : Object.keys(defaultColumns[existingFields._id]);
  for (var oldField in existingFields) {
    if (oldField !== '_id' && oldField !== 'ACL' && oldField !== 'updatedAt' && oldField !== 'createdAt' && oldField !== 'objectId') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(oldField) !== -1) {
        continue;
      }
      var fieldIsDeleted = putRequest[oldField] && putRequest[oldField].__op === 'Delete';
      if (!fieldIsDeleted) {
        newSchema[oldField] = existingFields[oldField];
      }
    }
  }
  for (var newField in putRequest) {
    if (newField !== 'objectId' && putRequest[newField].__op !== 'Delete') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(newField) !== -1) {
        continue;
      }
      newSchema[newField] = putRequest[newField];
    }
  }
  return newSchema;
}

// Given a schema promise, construct another schema promise that
// validates this field once the schema loads.
function thenValidateRequiredColumns(schemaPromise, className, object, query) {
  return schemaPromise.then(function (schema) {
    return schema.validateRequiredColumns(className, object, query);
  });
}

// Gets the type from a REST API formatted object, where 'type' is
// extended past javascript types to include the rest of the Parse
// type system.
// The output should be a valid schema value.
// TODO: ensure that this is compatible with the format used in Open DB
function getType(obj) {
  var type = typeof obj === 'undefined' ? 'undefined' : _typeof(obj);
  switch (type) {
    case 'boolean':
      return 'Boolean';
    case 'string':
      return 'String';
    case 'number':
      return 'Number';
    case 'map':
    case 'object':
      if (!obj) {
        return undefined;
      }
      return getObjectType(obj);
    case 'function':
    case 'symbol':
    case 'undefined':
    default:
      throw 'bad obj: ' + obj;
  }
}

// This gets the type for non-JSON types like pointers and files, but
// also gets the appropriate type for $ operators.
// Returns null if the type is unknown.
function getObjectType(obj) {
  if (obj instanceof Array) {
    return 'Array';
  }
  if (obj.__type) {
    switch (obj.__type) {
      case 'Pointer':
        if (obj.className) {
          return {
            type: 'Pointer',
            targetClass: obj.className
          };
        }
      case 'File':
        if (obj.name) {
          return 'File';
        }
      case 'Date':
        if (obj.iso) {
          return 'Date';
        }
      case 'GeoPoint':
        if (obj.latitude != null && obj.longitude != null) {
          return 'GeoPoint';
        }
      case 'Bytes':
        if (obj.base64) {
          return;
        }
      default:
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, "This is not a valid " + obj.__type);
    }
  }
  if (obj['$ne']) {
    return getObjectType(obj['$ne']);
  }
  if (obj.__op) {
    switch (obj.__op) {
      case 'Increment':
        return 'Number';
      case 'Delete':
        return null;
      case 'Add':
      case 'AddUnique':
      case 'Remove':
        return 'Array';
      case 'AddRelation':
      case 'RemoveRelation':
        return {
          type: 'Relation',
          targetClass: obj.objects[0].className
        };
      case 'Batch':
        return getObjectType(obj.ops[0]);
      default:
        throw 'unexpected op: ' + obj.__op;
    }
  }
  return 'Object';
}

exports.load = load;
exports.classNameIsValid = classNameIsValid;
exports.fieldNameIsValid = fieldNameIsValid;
exports.invalidClassNameMessage = invalidClassNameMessage;
exports.buildMergedSchemaObject = buildMergedSchemaObject;
exports.systemClasses = systemClasses;
exports.defaultColumns = defaultColumns;
exports.convertSchemaToAdapterSchema = convertSchemaToAdapterSchema;
exports.VolatileClassesSchemas = VolatileClassesSchemas;