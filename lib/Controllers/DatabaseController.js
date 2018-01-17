'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _node = require('parse/node');

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _intersect = require('intersect');

var _intersect2 = _interopRequireDefault(_intersect);

var _deepcopy = require('deepcopy');

var _deepcopy2 = _interopRequireDefault(_deepcopy);

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

var _SchemaController = require('./SchemaController');

var SchemaController = _interopRequireWildcard(_SchemaController);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } } // A database adapter that works with data exported from the hosted
// Parse database.

function addWriteACL(query, acl) {
  var newQuery = _lodash2.default.cloneDeep(query);
  //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and
  newQuery._wperm = { "$in": [null].concat(_toConsumableArray(acl)) };
  return newQuery;
}

function addReadACL(query, acl) {
  var newQuery = _lodash2.default.cloneDeep(query);
  //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and
  newQuery._rperm = { "$in": [null, "*"].concat(_toConsumableArray(acl)) };
  return newQuery;
}

// Transforms a REST API formatted ACL object to our two-field mongo format.
var transformObjectACL = function transformObjectACL(_ref) {
  var ACL = _ref.ACL,
      result = _objectWithoutProperties(_ref, ['ACL']);

  if (!ACL) {
    return result;
  }

  result._wperm = [];
  result._rperm = [];

  for (var entry in ACL) {
    if (ACL[entry].read) {
      result._rperm.push(entry);
    }
    if (ACL[entry].write) {
      result._wperm.push(entry);
    }
  }
  return result;
};

var specialQuerykeys = ['$and', '$or', '_rperm', '_wperm', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count'];

var isSpecialQueryKey = function isSpecialQueryKey(key) {
  return specialQuerykeys.indexOf(key) >= 0;
};

var validateQuery = function validateQuery(query) {
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }

  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(validateQuery);

      /* In MongoDB, $or queries which are not alone at the top level of the
       * query can not make efficient use of indexes due to a long standing
       * bug known as SERVER-13732.
       *
       * This block restructures queries in which $or is not the sole top
       * level element by moving all other top-level predicates inside every
       * subdocument of the $or predicate, allowing MongoDB's query planner
       * to make full use of the most relevant indexes.
       *
       * EG:      {$or: [{a: 1}, {a: 2}], b: 2}
       * Becomes: {$or: [{a: 1, b: 2}, {a: 2, b: 2}]}
       *
       * https://jira.mongodb.org/browse/SERVER-13732
       */
      Object.keys(query).forEach(function (key) {
        var noCollisions = !query.$or.some(function (subq) {
          return subq.hasOwnProperty(key);
        });
        if (key != '$or' && noCollisions) {
          query.$or.forEach(function (subquery) {
            subquery[key] = query[key];
          });
          delete query[key];
        }
      });
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }

  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(validateQuery);
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }

  Object.keys(query).forEach(function (key) {
    if (query && query[key] && query[key].$regex) {
      if (typeof query[key].$options === 'string') {
        if (!query[key].$options.match(/^[imxs]+$/)) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $options value for query: ' + query[key].$options);
        }
      }
    }
    if (!isSpecialQueryKey(key) && !key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/)) {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, 'Invalid key name: ' + key);
    }
  });
};

function DatabaseController(adapter, schemaCache) {
  this.adapter = adapter;
  this.schemaCache = schemaCache;
  // We don't want a mutable this.schema, because then you could have
  // one request that uses different schemas for different parts of
  // it. Instead, use loadSchema to get a schema.
  this.schemaPromise = null;
}

DatabaseController.prototype.collectionExists = function (className) {
  return this.adapter.classExists(className);
};

DatabaseController.prototype.purgeCollection = function (className) {
  var _this = this;

  return this.loadSchema().then(function (schemaController) {
    return schemaController.getOneSchema(className);
  }).then(function (schema) {
    return _this.adapter.deleteObjectsByQuery(className, schema, {});
  });
};

DatabaseController.prototype.validateClassName = function (className) {
  if (!SchemaController.classNameIsValid(className)) {
    return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_CLASS_NAME, 'invalid className: ' + className));
  }
  return Promise.resolve();
};

// Returns a promise for a schemaController.
DatabaseController.prototype.loadSchema = function () {
  var _this2 = this;

  var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : { clearCache: false };

  if (!this.schemaPromise) {
    this.schemaPromise = SchemaController.load(this.adapter, this.schemaCache, options);
    this.schemaPromise.then(function () {
      return delete _this2.schemaPromise;
    }, function () {
      return delete _this2.schemaPromise;
    });
  }
  return this.schemaPromise;
};

// Returns a promise for the classname that is related to the given
// classname through the key.
// TODO: make this not in the DatabaseController interface
DatabaseController.prototype.redirectClassNameForKey = function (className, key) {
  return this.loadSchema().then(function (schema) {
    var t = schema.getExpectedType(className, key);
    if (t && t.type == 'Relation') {
      return t.targetClass;
    } else {
      return className;
    }
  });
};

// Uses the schema to validate the object (REST API format).
// Returns a promise that resolves to the new schema.
// This does not update this.schema, because in a situation like a
// batch request, that could confuse other users of the schema.
DatabaseController.prototype.validateObject = function (className, object, query, _ref2) {
  var _this3 = this;

  var acl = _ref2.acl;

  var schema = void 0;
  var isMaster = acl === undefined;
  var aclGroup = acl || [];
  return this.loadSchema().then(function (s) {
    schema = s;
    if (isMaster) {
      return Promise.resolve();
    }
    return _this3.canAddField(schema, className, object, aclGroup);
  }).then(function () {
    return schema.validateObject(className, object, query);
  });
};

// Filters out any data that shouldn't be on this REST-formatted object.
var filterSensitiveData = function filterSensitiveData(isMaster, aclGroup, className, object) {
  if (className !== '_User') {
    return object;
  }

  object.password = object._hashed_password;
  delete object._hashed_password;

  delete object.sessionToken;

  if (isMaster) {
    return object;
  }
  delete object._email_verify_token;
  delete object._perishable_token;
  delete object._perishable_token_expires_at;
  delete object._tombstone;
  delete object._email_verify_token_expires_at;
  delete object._failed_login_count;
  delete object._account_lockout_expires_at;
  delete object._password_changed_at;

  if (aclGroup.indexOf(object.objectId) > -1) {
    return object;
  }
  delete object.authData;
  return object;
};

// Runs an update on the database.
// Returns a promise for an object with the new values for field
// modifications that don't know their results ahead of time, like
// 'increment'.
// Options:
//   acl:  a list of strings. If the object to be updated has an ACL,
//         one of the provided strings must provide the caller with
//         write permissions.
var specialKeysForUpdate = ['_hashed_password', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count', '_perishable_token_expires_at', '_password_changed_at', '_password_history'];

var isSpecialUpdateKey = function isSpecialUpdateKey(key) {
  return specialKeysForUpdate.indexOf(key) >= 0;
};

DatabaseController.prototype.update = function (className, query, update) {
  var _this4 = this;

  var _ref3 = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {},
      acl = _ref3.acl,
      many = _ref3.many,
      upsert = _ref3.upsert;

  var skipSanitization = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;

  var originalUpdate = update;
  // Make a copy of the object, so we don't mutate the incoming data.
  update = (0, _deepcopy2.default)(update);

  var isMaster = acl === undefined;
  var aclGroup = acl || [];
  return this.loadSchema().then(function (schemaController) {
    return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'update')).then(function () {
      return _this4.handleRelationUpdates(className, query.objectId, update);
    }).then(function () {
      if (!isMaster) {
        query = _this4.addPointerPermissions(schemaController, className, 'update', query, aclGroup);
      }
      if (!query) {
        return Promise.resolve();
      }
      if (acl) {
        query = addWriteACL(query, acl);
      }
      validateQuery(query);
      return schemaController.getOneSchema(className, true).catch(function (error) {
        // If the schema doesn't exist, pretend it exists with no fields. This behaviour
        // will likely need revisiting.
        if (error === undefined) {
          return { fields: {} };
        }
        throw error;
      }).then(function (schema) {
        Object.keys(update).forEach(function (fieldName) {
          if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, 'Invalid field name for update: ' + fieldName);
          }
          fieldName = fieldName.split('.')[0];
          if (!SchemaController.fieldNameIsValid(fieldName) && !isSpecialUpdateKey(fieldName)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, 'Invalid field name for update: ' + fieldName);
          }
        });
        for (var updateOperation in update) {
          if (Object.keys(updateOperation).some(function (innerKey) {
            return innerKey.includes('$') || innerKey.includes('.');
          })) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
          }
        }
        update = transformObjectACL(update);
        transformAuthData(className, update, schema);
        if (many) {
          return _this4.adapter.updateObjectsByQuery(className, schema, query, update);
        } else if (upsert) {
          return _this4.adapter.upsertOneObject(className, schema, query, update);
        } else {
          return _this4.adapter.findOneAndUpdate(className, schema, query, update);
        }
      });
    }).then(function (result) {
      if (!result) {
        return Promise.reject(new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.'));
      }
      if (skipSanitization) {
        return Promise.resolve(result);
      }
      return sanitizeDatabaseResult(originalUpdate, result);
    });
  });
};

function sanitizeDatabaseResult(originalObject, result) {
  var response = {};
  if (!result) {
    return Promise.resolve(response);
  }
  Object.keys(originalObject).forEach(function (key) {
    var keyUpdate = originalObject[key];
    // determine if that was an op
    if (keyUpdate && (typeof keyUpdate === 'undefined' ? 'undefined' : _typeof(keyUpdate)) === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
      // only valid ops that produce an actionable result
      response[key] = result[key];
    }
  });
  return Promise.resolve(response);
}

// Processes relation-updating operations from a REST-format update.
// Returns a promise that resolves successfully when these are
// processed.
// This mutates update.
DatabaseController.prototype.handleRelationUpdates = function (className, objectId, update) {
  var _this5 = this;

  var pending = [];
  var deleteMe = [];
  objectId = update.objectId || objectId;

  var process = function process(op, key) {
    if (!op) {
      return;
    }
    if (op.__op == 'AddRelation') {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = op.objects[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var object = _step.value;

          pending.push(_this5.addRelation(key, className, objectId, object.objectId));
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

      deleteMe.push(key);
    }

    if (op.__op == 'RemoveRelation') {
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = op.objects[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var _object = _step2.value;

          pending.push(_this5.removeRelation(key, className, objectId, _object.objectId));
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      deleteMe.push(key);
    }

    if (op.__op == 'Batch') {
      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = op.ops[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var x = _step3.value;

          process(x, key);
        }
      } catch (err) {
        _didIteratorError3 = true;
        _iteratorError3 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion3 && _iterator3.return) {
            _iterator3.return();
          }
        } finally {
          if (_didIteratorError3) {
            throw _iteratorError3;
          }
        }
      }
    }
  };

  for (var key in update) {
    process(update[key], key);
  }
  var _iteratorNormalCompletion4 = true;
  var _didIteratorError4 = false;
  var _iteratorError4 = undefined;

  try {
    for (var _iterator4 = deleteMe[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
      var _key = _step4.value;

      delete update[_key];
    }
  } catch (err) {
    _didIteratorError4 = true;
    _iteratorError4 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion4 && _iterator4.return) {
        _iterator4.return();
      }
    } finally {
      if (_didIteratorError4) {
        throw _iteratorError4;
      }
    }
  }

  return Promise.all(pending);
};

// Adds a relation.
// Returns a promise that resolves successfully iff the add was successful.
var relationSchema = { fields: { relatedId: { type: 'String' }, owningId: { type: 'String' } } };
DatabaseController.prototype.addRelation = function (key, fromClassName, fromId, toId) {
  var doc = {
    relatedId: toId,
    owningId: fromId
  };
  return this.adapter.upsertOneObject('_Join:' + key + ':' + fromClassName, relationSchema, doc, doc);
};

// Removes a relation.
// Returns a promise that resolves successfully iff the remove was
// successful.
DatabaseController.prototype.removeRelation = function (key, fromClassName, fromId, toId) {
  var doc = {
    relatedId: toId,
    owningId: fromId
  };
  return this.adapter.deleteObjectsByQuery('_Join:' + key + ':' + fromClassName, relationSchema, doc).catch(function (error) {
    // We don't care if they try to delete a non-existent relation.
    if (error.code == _node.Parse.Error.OBJECT_NOT_FOUND) {
      return;
    }
    throw error;
  });
};

// Removes objects matches this query from the database.
// Returns a promise that resolves successfully iff the object was
// deleted.
// Options:
//   acl:  a list of strings. If the object to be updated has an ACL,
//         one of the provided strings must provide the caller with
//         write permissions.
DatabaseController.prototype.destroy = function (className, query) {
  var _this6 = this;

  var _ref4 = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
      acl = _ref4.acl;

  var isMaster = acl === undefined;
  var aclGroup = acl || [];

  return this.loadSchema().then(function (schemaController) {
    return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'delete')).then(function () {
      if (!isMaster) {
        query = _this6.addPointerPermissions(schemaController, className, 'delete', query, aclGroup);
        if (!query) {
          throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }
      }
      // delete by query
      if (acl) {
        query = addWriteACL(query, acl);
      }
      validateQuery(query);
      return schemaController.getOneSchema(className).catch(function (error) {
        // If the schema doesn't exist, pretend it exists with no fields. This behaviour
        // will likely need revisiting.
        if (error === undefined) {
          return { fields: {} };
        }
        throw error;
      }).then(function (parseFormatSchema) {
        return _this6.adapter.deleteObjectsByQuery(className, parseFormatSchema, query);
      }).catch(function (error) {
        // When deleting sessions while changing passwords, don't throw an error if they don't have any sessions.
        if (className === "_Session" && error.code === _node.Parse.Error.OBJECT_NOT_FOUND) {
          return Promise.resolve({});
        }
        throw error;
      });
    });
  });
};

var flattenUpdateOperatorsForCreate = function flattenUpdateOperatorsForCreate(object) {
  for (var key in object) {
    if (object[key] && object[key].__op) {
      switch (object[key].__op) {
        case 'Increment':
          if (typeof object[key].amount !== 'number') {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = object[key].amount;
          break;
        case 'Add':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = object[key].objects;
          break;
        case 'AddUnique':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = object[key].objects;
          break;
        case 'Remove':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = [];
          break;
        case 'Delete':
          delete object[key];
          break;
        default:
          throw new _node.Parse.Error(_node.Parse.Error.COMMAND_UNAVAILABLE, 'The ' + object[key].__op + ' operator is not supported yet.');
      }
    }
  }
};

var transformAuthData = function transformAuthData(className, object, schema) {
  if (object.authData && className === '_User') {
    Object.keys(object.authData).forEach(function (provider) {
      var providerData = object.authData[provider];
      var fieldName = '_auth_data_' + provider;
      if (providerData == null) {
        object[fieldName] = {
          __op: 'Delete'
        };
      } else {
        object[fieldName] = providerData;
        schema.fields[fieldName] = { type: 'Object' };
      }
    });
    delete object.authData;
  }
};

// Inserts an object into the database.
// Returns a promise that resolves successfully iff the object saved.
DatabaseController.prototype.create = function (className, object) {
  var _this7 = this;

  var _ref5 = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
      acl = _ref5.acl;

  // Make a copy of the object, so we don't mutate the incoming data.
  var originalObject = object;
  object = transformObjectACL(object);

  object.createdAt = { iso: object.createdAt, __type: 'Date' };
  object.updatedAt = { iso: object.updatedAt, __type: 'Date' };

  var isMaster = acl === undefined;
  var aclGroup = acl || [];

  return this.validateClassName(className).then(function () {
    return _this7.loadSchema();
  }).then(function (schemaController) {
    return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'create')).then(function () {
      return _this7.handleRelationUpdates(className, null, object);
    }).then(function () {
      return schemaController.enforceClassExists(className);
    }).then(function () {
      return schemaController.reloadData();
    }).then(function () {
      return schemaController.getOneSchema(className, true);
    }).then(function (schema) {
      transformAuthData(className, object, schema);
      flattenUpdateOperatorsForCreate(object);
      return _this7.adapter.createObject(className, SchemaController.convertSchemaToAdapterSchema(schema), object);
    }).then(function (result) {
      return sanitizeDatabaseResult(originalObject, result.ops[0]);
    });
  });
};

DatabaseController.prototype.canAddField = function (schema, className, object, aclGroup) {
  var classSchema = schema.data[className];
  if (!classSchema) {
    return Promise.resolve();
  }
  var fields = Object.keys(object);
  var schemaFields = Object.keys(classSchema);
  var newKeys = fields.filter(function (field) {
    return schemaFields.indexOf(field) < 0;
  });
  if (newKeys.length > 0) {
    return schema.validatePermission(className, aclGroup, 'addField');
  }
  return Promise.resolve();
};

// Won't delete collections in the system namespace
// Returns a promise.
DatabaseController.prototype.deleteEverything = function () {
  this.schemaPromise = null;
  return Promise.all([this.adapter.deleteAllClasses(), this.schemaCache.clear()]);
};

// Returns a promise for a list of related ids given an owning id.
// className here is the owning className.
DatabaseController.prototype.relatedIds = function (className, key, owningId) {
  return this.adapter.find(joinTableName(className, key), relationSchema, { owningId: owningId }, {}).then(function (results) {
    return results.map(function (result) {
      return result.relatedId;
    });
  });
};

// Returns a promise for a list of owning ids given some related ids.
// className here is the owning className.
DatabaseController.prototype.owningIds = function (className, key, relatedIds) {
  return this.adapter.find(joinTableName(className, key), relationSchema, { relatedId: { '$in': relatedIds } }, {}).then(function (results) {
    return results.map(function (result) {
      return result.owningId;
    });
  });
};

// Modifies query so that it no longer has $in on relation fields, or
// equal-to-pointer constraints on relation fields.
// Returns a promise that resolves when query is mutated
DatabaseController.prototype.reduceInRelation = function (className, query, schema) {
  var _this8 = this;

  // Search for an in-relation or equal-to-relation
  // Make it sequential for now, not sure of paralleization side effects
  if (query['$or']) {
    var ors = query['$or'];
    return Promise.all(ors.map(function (aQuery, index) {
      return _this8.reduceInRelation(className, aQuery, schema).then(function (aQuery) {
        query['$or'][index] = aQuery;
      });
    })).then(function () {
      return Promise.resolve(query);
    });
  }

  var promises = Object.keys(query).map(function (key) {
    if (query[key] && (query[key]['$in'] || query[key]['$ne'] || query[key]['$nin'] || query[key].__type == 'Pointer')) {
      var t = schema.getExpectedType(className, key);
      if (!t || t.type !== 'Relation') {
        return Promise.resolve(query);
      }
      // Build the list of queries
      var queries = Object.keys(query[key]).map(function (constraintKey) {
        var relatedIds = void 0;
        var isNegation = false;
        if (constraintKey === 'objectId') {
          relatedIds = [query[key].objectId];
        } else if (constraintKey == '$in') {
          relatedIds = query[key]['$in'].map(function (r) {
            return r.objectId;
          });
        } else if (constraintKey == '$nin') {
          isNegation = true;
          relatedIds = query[key]['$nin'].map(function (r) {
            return r.objectId;
          });
        } else if (constraintKey == '$ne') {
          isNegation = true;
          relatedIds = [query[key]['$ne'].objectId];
        } else {
          return;
        }
        return {
          isNegation: isNegation,
          relatedIds: relatedIds
        };
      });

      // remove the current queryKey as we don,t need it anymore
      delete query[key];
      // execute each query independnently to build the list of
      // $in / $nin
      var _promises = queries.map(function (q) {
        if (!q) {
          return Promise.resolve();
        }
        return _this8.owningIds(className, key, q.relatedIds).then(function (ids) {
          if (q.isNegation) {
            _this8.addNotInObjectIdsIds(ids, query);
          } else {
            _this8.addInObjectIdsIds(ids, query);
          }
          return Promise.resolve();
        });
      });

      return Promise.all(_promises).then(function () {
        return Promise.resolve();
      });
    }
    return Promise.resolve();
  });

  return Promise.all(promises).then(function () {
    return Promise.resolve(query);
  });
};

// Modifies query so that it no longer has $relatedTo
// Returns a promise that resolves when query is mutated
DatabaseController.prototype.reduceRelationKeys = function (className, query) {
  var _this9 = this;

  if (query['$or']) {
    return Promise.all(query['$or'].map(function (aQuery) {
      return _this9.reduceRelationKeys(className, aQuery);
    }));
  }

  var relatedTo = query['$relatedTo'];
  if (relatedTo) {
    return this.relatedIds(relatedTo.object.className, relatedTo.key, relatedTo.object.objectId).then(function (ids) {
      delete query['$relatedTo'];
      _this9.addInObjectIdsIds(ids, query);
      return _this9.reduceRelationKeys(className, query);
    });
  }
};

DatabaseController.prototype.addInObjectIdsIds = function () {
  var ids = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
  var query = arguments[1];

  var idsFromString = typeof query.objectId === 'string' ? [query.objectId] : null;
  var idsFromEq = query.objectId && query.objectId['$eq'] ? [query.objectId['$eq']] : null;
  var idsFromIn = query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null;

  var allIds = [idsFromString, idsFromEq, idsFromIn, ids].filter(function (list) {
    return list !== null;
  });
  var totalLength = allIds.reduce(function (memo, list) {
    return memo + list.length;
  }, 0);

  var idsIntersection = [];
  if (totalLength > 125) {
    idsIntersection = _intersect2.default.big(allIds);
  } else {
    idsIntersection = (0, _intersect2.default)(allIds);
  }

  // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
  if (!('objectId' in query)) {
    query.objectId = {};
  } else if (typeof query.objectId === 'string') {
    query.objectId = {
      $eq: query.objectId
    };
  }
  query.objectId['$in'] = idsIntersection;

  return query;
};

DatabaseController.prototype.addNotInObjectIdsIds = function () {
  var ids = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
  var query = arguments[1];

  var idsFromNin = query.objectId && query.objectId['$nin'] ? query.objectId['$nin'] : [];
  var allIds = [].concat(_toConsumableArray(idsFromNin), _toConsumableArray(ids)).filter(function (list) {
    return list !== null;
  });

  // make a set and spread to remove duplicates
  allIds = [].concat(_toConsumableArray(new Set(allIds)));

  // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
  if (!('objectId' in query)) {
    query.objectId = {};
  } else if (typeof query.objectId === 'string') {
    query.objectId = {
      $eq: query.objectId
    };
  }

  query.objectId['$nin'] = allIds;
  return query;
};

// Runs a query on the database.
// Returns a promise that resolves to a list of items.
// Options:
//   skip    number of results to skip.
//   limit   limit to this number of results.
//   sort    an object where keys are the fields to sort by.
//           the value is +1 for ascending, -1 for descending.
//   count   run a count instead of returning results.
//   acl     restrict this operation with an ACL for the provided array
//           of user objectIds and roles. acl: null means no user.
//           when this field is not present, don't do anything regarding ACLs.
// TODO: make userIds not needed here. The db adapter shouldn't know
// anything about users, ideally. Then, improve the format of the ACL
// arg to work like the others.
DatabaseController.prototype.find = function (className, query) {
  var _this10 = this;

  var _ref6 = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
      skip = _ref6.skip,
      limit = _ref6.limit,
      acl = _ref6.acl,
      _ref6$sort = _ref6.sort,
      sort = _ref6$sort === undefined ? {} : _ref6$sort,
      count = _ref6.count,
      keys = _ref6.keys,
      op = _ref6.op;

  var isMaster = acl === undefined;
  var aclGroup = acl || [];
  op = op || (typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find');
  var classExists = true;
  return this.loadSchema().then(function (schemaController) {
    //Allow volatile classes if querying with Master (for _PushStatus)
    //TODO: Move volatile classes concept into mongo adatper, postgres adapter shouldn't care
    //that api.parse.com breaks when _PushStatus exists in mongo.
    return schemaController.getOneSchema(className, isMaster).catch(function (error) {
      // Behaviour for non-existent classes is kinda weird on Parse.com. Probably doesn't matter too much.
      // For now, pretend the class exists but has no objects,
      if (error === undefined) {
        classExists = false;
        return { fields: {} };
      }
      throw error;
    }).then(function (schema) {
      // Parse.com treats queries on _created_at and _updated_at as if they were queries on createdAt and updatedAt,
      // so duplicate that behaviour here. If both are specified, the corrent behaviour to match Parse.com is to
      // use the one that appears first in the sort list.
      if (sort._created_at) {
        sort.createdAt = sort._created_at;
        delete sort._created_at;
      }
      if (sort._updated_at) {
        sort.updatedAt = sort._updated_at;
        delete sort._updated_at;
      }
      Object.keys(sort).forEach(function (fieldName) {
        if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, 'Cannot sort by ' + fieldName);
        }
        if (!SchemaController.fieldNameIsValid(fieldName)) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, 'Invalid field name: ' + fieldName + '.');
        }
      });
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, op)).then(function () {
        return _this10.reduceRelationKeys(className, query);
      }).then(function () {
        return _this10.reduceInRelation(className, query, schemaController);
      }).then(function () {
        if (!isMaster) {
          query = _this10.addPointerPermissions(schemaController, className, op, query, aclGroup);
        }
        if (!query) {
          if (op == 'get') {
            throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
          } else {
            return [];
          }
        }
        if (!isMaster) {
          query = addReadACL(query, aclGroup);
        }
        validateQuery(query);
        if (count) {
          if (!classExists) {
            return 0;
          } else {
            return _this10.adapter.count(className, schema, query);
          }
        } else {
          if (!classExists) {
            return [];
          } else {
            return _this10.adapter.find(className, schema, query, { skip: skip, limit: limit, sort: sort, keys: keys }).then(function (objects) {
              return objects.map(function (object) {
                object = untransformObjectACL(object);
                return filterSensitiveData(isMaster, aclGroup, className, object);
              });
            });
          }
        }
      });
    });
  });
};

// Transforms a Database format ACL to a REST API format ACL
var untransformObjectACL = function untransformObjectACL(_ref7) {
  var _rperm = _ref7._rperm,
      _wperm = _ref7._wperm,
      output = _objectWithoutProperties(_ref7, ['_rperm', '_wperm']);

  if (_rperm || _wperm) {
    output.ACL = {};

    (_rperm || []).forEach(function (entry) {
      if (!output.ACL[entry]) {
        output.ACL[entry] = { read: true };
      } else {
        output.ACL[entry]['read'] = true;
      }
    });

    (_wperm || []).forEach(function (entry) {
      if (!output.ACL[entry]) {
        output.ACL[entry] = { write: true };
      } else {
        output.ACL[entry]['write'] = true;
      }
    });
  }
  return output;
};

DatabaseController.prototype.deleteSchema = function (className) {
  var _this11 = this;

  return this.loadSchema(true).then(function (schemaController) {
    return schemaController.getOneSchema(className, true);
  }).catch(function (error) {
    if (error === undefined) {
      return { fields: {} };
    } else {
      throw error;
    }
  }).then(function (schema) {
    return _this11.collectionExists(className).then(function () {
      return _this11.adapter.count(className, { fields: {} });
    }).then(function (count) {
      if (count > 0) {
        throw new _node.Parse.Error(255, 'Class ' + className + ' is not empty, contains ' + count + ' objects, cannot drop schema.');
      }
      return _this11.adapter.deleteClass(className);
    }).then(function (wasParseCollection) {
      if (wasParseCollection) {
        var relationFieldNames = Object.keys(schema.fields).filter(function (fieldName) {
          return schema.fields[fieldName].type === 'Relation';
        });
        return Promise.all(relationFieldNames.map(function (name) {
          return _this11.adapter.deleteClass(joinTableName(className, name));
        }));
      } else {
        return Promise.resolve();
      }
    });
  });
};

DatabaseController.prototype.addPointerPermissions = function (schema, className, operation, query) {
  var aclGroup = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : [];

  // Check if class has public permission for operation
  // If the BaseCLP pass, let go through
  if (schema.testBaseCLP(className, aclGroup, operation)) {
    return query;
  }
  var perms = schema.perms[className];
  var field = ['get', 'find'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';
  var userACL = aclGroup.filter(function (acl) {
    return acl.indexOf('role:') != 0 && acl != '*';
  });
  // the ACL should have exactly 1 user
  if (perms && perms[field] && perms[field].length > 0) {
    // No user set return undefined
    // If the length is > 1, that means we didn't dedup users correctly
    if (userACL.length != 1) {
      return;
    }
    var userId = userACL[0];
    var userPointer = {
      "__type": "Pointer",
      "className": "_User",
      "objectId": userId
    };

    var permFields = perms[field];
    var ors = permFields.map(function (key) {
      var q = _defineProperty({}, key, userPointer);
      return { '$and': [q, query] };
    });
    if (ors.length > 1) {
      return { '$or': ors };
    }
    return ors[0];
  } else {
    return query;
  }
};

// TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
// have a Parse app without it having a _User collection.
DatabaseController.prototype.performInitialization = function () {
  var _this12 = this;

  var requiredUserFields = { fields: _extends({}, SchemaController.defaultColumns._Default, SchemaController.defaultColumns._User) };
  var requiredRoleFields = { fields: _extends({}, SchemaController.defaultColumns._Default, SchemaController.defaultColumns._Role) };

  var userClassPromise = this.loadSchema().then(function (schema) {
    return schema.enforceClassExists('_User');
  });
  var roleClassPromise = this.loadSchema().then(function (schema) {
    return schema.enforceClassExists('_Role');
  });

  var usernameUniqueness = userClassPromise.then(function () {
    return _this12.adapter.ensureUniqueness('_User', requiredUserFields, ['username']);
  }).catch(function (error) {
    _logger2.default.warn('Unable to ensure uniqueness for usernames: ', error);
    throw error;
  });

  var emailUniqueness = userClassPromise.then(function () {
    return _this12.adapter.ensureUniqueness('_User', requiredUserFields, ['email']);
  }).catch(function (error) {
    _logger2.default.warn('Unable to ensure uniqueness for user email addresses: ', error);
    throw error;
  });

  var roleUniqueness = roleClassPromise.then(function () {
    return _this12.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name']);
  }).catch(function (error) {
    _logger2.default.warn('Unable to ensure uniqueness for role name: ', error);
    throw error;
  });

  // Create tables for volatile classes
  var adapterInit = this.adapter.performInitialization({ VolatileClassesSchemas: SchemaController.VolatileClassesSchemas });
  return Promise.all([usernameUniqueness, emailUniqueness, roleUniqueness, adapterInit]);
};

function joinTableName(className, key) {
  return '_Join:' + key + ':' + className;
}

// Expose validateQuery for tests
DatabaseController._validateQuery = validateQuery;
module.exports = DatabaseController;