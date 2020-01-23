"use strict";

var _node = require("parse/node");

var _lodash = _interopRequireDefault(require("lodash"));

var _intersect = _interopRequireDefault(require("intersect"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var _logger = _interopRequireDefault(require("../logger"));

var SchemaController = _interopRequireWildcard(require("./SchemaController"));

var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function addWriteACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query); //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and


  newQuery._wperm = {
    $in: [null, ...acl]
  };
  return newQuery;
}

function addReadACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query); //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and


  newQuery._rperm = {
    $in: [null, '*', ...acl]
  };
  return newQuery;
} // Transforms a REST API formatted ACL object to our two-field mongo format.


const transformObjectACL = (_ref) => {
  let {
    ACL
  } = _ref,
      result = _objectWithoutProperties(_ref, ["ACL"]);

  if (!ACL) {
    return result;
  }

  result._wperm = [];
  result._rperm = [];

  for (const entry in ACL) {
    if (ACL[entry].read) {
      result._rperm.push(entry);
    }

    if (ACL[entry].write) {
      result._wperm.push(entry);
    }
  }

  return result;
};

const specialQuerykeys = ['$and', '$or', '$nor', '_rperm', '_wperm', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count'];

const isSpecialQueryKey = key => {
  return specialQuerykeys.indexOf(key) >= 0;
};

const validateQuery = (query, skipMongoDBServer13732Workaround) => {
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }

  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(el => validateQuery(el, skipMongoDBServer13732Workaround));

      if (!skipMongoDBServer13732Workaround) {
        /* In MongoDB 3.2 & 3.4, $or queries which are not alone at the top
         * level of the query can not make efficient use of indexes due to a
         * long standing bug known as SERVER-13732.
         *
         * This bug was fixed in MongoDB version 3.6.
         *
         * For versions pre-3.6, the below logic produces a substantial
         * performance improvement inside the database by avoiding the bug.
         *
         * For versions 3.6 and above, there is no performance improvement and
         * the logic is unnecessary. Some query patterns are even slowed by
         * the below logic, due to the bug having been fixed and better
         * query plans being chosen.
         *
         * When versions before 3.4 are no longer supported by this project,
         * this logic, and the accompanying `skipMongoDBServer13732Workaround`
         * flag, can be removed.
         *
         * This block restructures queries in which $or is not the sole top
         * level element by moving all other top-level predicates inside every
         * subdocument of the $or predicate, allowing MongoDB's query planner
         * to make full use of the most relevant indexes.
         *
         * EG:      {$or: [{a: 1}, {a: 2}], b: 2}
         * Becomes: {$or: [{a: 1, b: 2}, {a: 2, b: 2}]}
         *
         * The only exceptions are $near and $nearSphere operators, which are
         * constrained to only 1 operator per query. As a result, these ops
         * remain at the top level
         *
         * https://jira.mongodb.org/browse/SERVER-13732
         * https://github.com/parse-community/parse-server/issues/3767
         */
        Object.keys(query).forEach(key => {
          const noCollisions = !query.$or.some(subq => Object.prototype.hasOwnProperty.call(subq, key));
          let hasNears = false;

          if (query[key] != null && typeof query[key] == 'object') {
            hasNears = '$near' in query[key] || '$nearSphere' in query[key];
          }

          if (key != '$or' && noCollisions && !hasNears) {
            query.$or.forEach(subquery => {
              subquery[key] = query[key];
            });
            delete query[key];
          }
        });
        query.$or.forEach(el => validateQuery(el, skipMongoDBServer13732Workaround));
      }
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }

  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(el => validateQuery(el, skipMongoDBServer13732Workaround));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }

  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(el => validateQuery(el, skipMongoDBServer13732Workaround));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $nor format - use an array of at least 1 value.');
    }
  }

  Object.keys(query).forEach(key => {
    if (query && query[key] && query[key].$regex) {
      if (typeof query[key].$options === 'string') {
        if (!query[key].$options.match(/^[imxs]+$/)) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, `Bad $options value for query: ${query[key].$options}`);
        }
      }
    }

    if (!isSpecialQueryKey(key) && !key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/)) {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${key}`);
    }
  });
}; // Filters out any data that shouldn't be on this REST-formatted object.


const filterSensitiveData = (isMaster, aclGroup, auth, operation, schema, className, protectedFields, object) => {
  let userId = null;
  if (auth && auth.user) userId = auth.user.id; // replace protectedFields when using pointer-permissions

  const perms = schema.getClassLevelPermissions(className);

  if (perms) {
    const isReadOperation = ['get', 'find'].indexOf(operation) > -1;

    if (isReadOperation && perms.protectedFields) {
      // extract protectedFields added with the pointer-permission prefix
      const protectedFieldsPointerPerm = Object.keys(perms.protectedFields).filter(key => key.startsWith('userField:')).map(key => {
        return {
          key: key.substring(10),
          value: perms.protectedFields[key]
        };
      });
      const newProtectedFields = [];
      let overrideProtectedFields = false; // check if the object grants the current user access based on the extracted fields

      protectedFieldsPointerPerm.forEach(pointerPerm => {
        let pointerPermIncludesUser = false;
        const readUserFieldValue = object[pointerPerm.key];

        if (readUserFieldValue) {
          if (Array.isArray(readUserFieldValue)) {
            pointerPermIncludesUser = readUserFieldValue.some(user => user.objectId && user.objectId === userId);
          } else {
            pointerPermIncludesUser = readUserFieldValue.objectId && readUserFieldValue.objectId === userId;
          }
        }

        if (pointerPermIncludesUser) {
          overrideProtectedFields = true;
          newProtectedFields.push(...pointerPerm.value);
        }
      }); // if atleast one pointer-permission affected the current user override the protectedFields

      if (overrideProtectedFields) protectedFields = newProtectedFields;
    }
  }

  const isUserClass = className === '_User';
  /* special treat for the user class: don't filter protectedFields if currently loggedin user is
  the retrieved user */

  if (!(isUserClass && userId && object.objectId === userId)) protectedFields && protectedFields.forEach(k => delete object[k]);

  if (!isUserClass) {
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
  delete object._password_history;

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
const specialKeysForUpdate = ['_hashed_password', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count', '_perishable_token_expires_at', '_password_changed_at', '_password_history'];

const isSpecialUpdateKey = key => {
  return specialKeysForUpdate.indexOf(key) >= 0;
};

function expandResultOnKeyPath(object, key, value) {
  if (key.indexOf('.') < 0) {
    object[key] = value[key];
    return object;
  }

  const path = key.split('.');
  const firstKey = path[0];
  const nextPath = path.slice(1).join('.');
  object[firstKey] = expandResultOnKeyPath(object[firstKey] || {}, nextPath, value[firstKey]);
  delete object[key];
  return object;
}

function sanitizeDatabaseResult(originalObject, result) {
  const response = {};

  if (!result) {
    return Promise.resolve(response);
  }

  Object.keys(originalObject).forEach(key => {
    const keyUpdate = originalObject[key]; // determine if that was an op

    if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
      // only valid ops that produce an actionable result
      // the op may have happend on a keypath
      expandResultOnKeyPath(response, key, result);
    }
  });
  return Promise.resolve(response);
}

function joinTableName(className, key) {
  return `_Join:${key}:${className}`;
}

const flattenUpdateOperatorsForCreate = object => {
  for (const key in object) {
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
          throw new _node.Parse.Error(_node.Parse.Error.COMMAND_UNAVAILABLE, `The ${object[key].__op} operator is not supported yet.`);
      }
    }
  }
};

const transformAuthData = (className, object, schema) => {
  if (object.authData && className === '_User') {
    Object.keys(object.authData).forEach(provider => {
      const providerData = object.authData[provider];
      const fieldName = `_auth_data_${provider}`;

      if (providerData == null) {
        object[fieldName] = {
          __op: 'Delete'
        };
      } else {
        object[fieldName] = providerData;
        schema.fields[fieldName] = {
          type: 'Object'
        };
      }
    });
    delete object.authData;
  }
}; // Transforms a Database format ACL to a REST API format ACL


const untransformObjectACL = (_ref2) => {
  let {
    _rperm,
    _wperm
  } = _ref2,
      output = _objectWithoutProperties(_ref2, ["_rperm", "_wperm"]);

  if (_rperm || _wperm) {
    output.ACL = {};

    (_rperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          read: true
        };
      } else {
        output.ACL[entry]['read'] = true;
      }
    });

    (_wperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          write: true
        };
      } else {
        output.ACL[entry]['write'] = true;
      }
    });
  }

  return output;
};
/**
 * When querying, the fieldName may be compound, extract the root fieldName
 *     `temperature.celsius` becomes `temperature`
 * @param {string} fieldName that may be a compound field name
 * @returns {string} the root name of the field
 */


const getRootFieldName = fieldName => {
  return fieldName.split('.')[0];
};

const relationSchema = {
  fields: {
    relatedId: {
      type: 'String'
    },
    owningId: {
      type: 'String'
    }
  }
};

class DatabaseController {
  constructor(adapter, schemaCache, skipMongoDBServer13732Workaround) {
    this.adapter = adapter;
    this.schemaCache = schemaCache; // We don't want a mutable this.schema, because then you could have
    // one request that uses different schemas for different parts of
    // it. Instead, use loadSchema to get a schema.

    this.schemaPromise = null;
    this.skipMongoDBServer13732Workaround = skipMongoDBServer13732Workaround;
    this._transactionalSession = null;
  }

  collectionExists(className) {
    return this.adapter.classExists(className);
  }

  purgeCollection(className) {
    return this.loadSchema().then(schemaController => schemaController.getOneSchema(className)).then(schema => this.adapter.deleteObjectsByQuery(className, schema, {}));
  }

  validateClassName(className) {
    if (!SchemaController.classNameIsValid(className)) {
      return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_CLASS_NAME, 'invalid className: ' + className));
    }

    return Promise.resolve();
  } // Returns a promise for a schemaController.


  loadSchema(options = {
    clearCache: false
  }) {
    if (this.schemaPromise != null) {
      return this.schemaPromise;
    }

    this.schemaPromise = SchemaController.load(this.adapter, this.schemaCache, options);
    this.schemaPromise.then(() => delete this.schemaPromise, () => delete this.schemaPromise);
    return this.loadSchema(options);
  }

  loadSchemaIfNeeded(schemaController, options = {
    clearCache: false
  }) {
    return schemaController ? Promise.resolve(schemaController) : this.loadSchema(options);
  } // Returns a promise for the classname that is related to the given
  // classname through the key.
  // TODO: make this not in the DatabaseController interface


  redirectClassNameForKey(className, key) {
    return this.loadSchema().then(schema => {
      var t = schema.getExpectedType(className, key);

      if (t != null && typeof t !== 'string' && t.type === 'Relation') {
        return t.targetClass;
      }

      return className;
    });
  } // Uses the schema to validate the object (REST API format).
  // Returns a promise that resolves to the new schema.
  // This does not update this.schema, because in a situation like a
  // batch request, that could confuse other users of the schema.


  validateObject(className, object, query, {
    acl
  }) {
    let schema;
    const isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchema().then(s => {
      schema = s;

      if (isMaster) {
        return Promise.resolve();
      }

      return this.canAddField(schema, className, object, aclGroup);
    }).then(() => {
      return schema.validateObject(className, object, query);
    });
  }

  update(className, query, update, {
    acl,
    many,
    upsert
  } = {}, skipSanitization = false, validateOnly = false, validSchemaController) {
    const originalQuery = query;
    const originalUpdate = update; // Make a copy of the object, so we don't mutate the incoming data.

    update = (0, _deepcopy.default)(update);
    var relationUpdates = [];
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'update')).then(() => {
        relationUpdates = this.collectRelationUpdates(className, originalQuery.objectId, update);

        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'update', query, aclGroup);
        }

        if (!query) {
          return Promise.resolve();
        }

        if (acl) {
          query = addWriteACL(query, acl);
        }

        validateQuery(query, this.skipMongoDBServer13732Workaround);
        return schemaController.getOneSchema(className, true).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }

          throw error;
        }).then(schema => {
          Object.keys(update).forEach(fieldName => {
            if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }

            const rootFieldName = getRootFieldName(fieldName);

            if (!SchemaController.fieldNameIsValid(rootFieldName) && !isSpecialUpdateKey(rootFieldName)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }
          });

          for (const updateOperation in update) {
            if (update[updateOperation] && typeof update[updateOperation] === 'object' && Object.keys(update[updateOperation]).some(innerKey => innerKey.includes('$') || innerKey.includes('.'))) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
            }
          }

          update = transformObjectACL(update);
          transformAuthData(className, update, schema);

          if (validateOnly) {
            return this.adapter.find(className, schema, query, {}).then(result => {
              if (!result || !result.length) {
                throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
              }

              return {};
            });
          }

          if (many) {
            return this.adapter.updateObjectsByQuery(className, schema, query, update, this._transactionalSession);
          } else if (upsert) {
            return this.adapter.upsertOneObject(className, schema, query, update, this._transactionalSession);
          } else {
            return this.adapter.findOneAndUpdate(className, schema, query, update, this._transactionalSession);
          }
        });
      }).then(result => {
        if (!result) {
          throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }

        if (validateOnly) {
          return result;
        }

        return this.handleRelationUpdates(className, originalQuery.objectId, update, relationUpdates).then(() => {
          return result;
        });
      }).then(result => {
        if (skipSanitization) {
          return Promise.resolve(result);
        }

        return sanitizeDatabaseResult(originalUpdate, result);
      });
    });
  } // Collect all relation-updating operations from a REST-format update.
  // Returns a list of all relation updates to perform
  // This mutates update.


  collectRelationUpdates(className, objectId, update) {
    var ops = [];
    var deleteMe = [];
    objectId = update.objectId || objectId;

    var process = (op, key) => {
      if (!op) {
        return;
      }

      if (op.__op == 'AddRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }

      if (op.__op == 'RemoveRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }

      if (op.__op == 'Batch') {
        for (var x of op.ops) {
          process(x, key);
        }
      }
    };

    for (const key in update) {
      process(update[key], key);
    }

    for (const key of deleteMe) {
      delete update[key];
    }

    return ops;
  } // Processes relation-updating operations from a REST-format update.
  // Returns a promise that resolves when all updates have been performed


  handleRelationUpdates(className, objectId, update, ops) {
    var pending = [];
    objectId = update.objectId || objectId;
    ops.forEach(({
      key,
      op
    }) => {
      if (!op) {
        return;
      }

      if (op.__op == 'AddRelation') {
        for (const object of op.objects) {
          pending.push(this.addRelation(key, className, objectId, object.objectId));
        }
      }

      if (op.__op == 'RemoveRelation') {
        for (const object of op.objects) {
          pending.push(this.removeRelation(key, className, objectId, object.objectId));
        }
      }
    });
    return Promise.all(pending);
  } // Adds a relation.
  // Returns a promise that resolves successfully iff the add was successful.


  addRelation(key, fromClassName, fromId, toId) {
    const doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.upsertOneObject(`_Join:${key}:${fromClassName}`, relationSchema, doc, doc, this._transactionalSession);
  } // Removes a relation.
  // Returns a promise that resolves successfully iff the remove was
  // successful.


  removeRelation(key, fromClassName, fromId, toId) {
    var doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.deleteObjectsByQuery(`_Join:${key}:${fromClassName}`, relationSchema, doc, this._transactionalSession).catch(error => {
      // We don't care if they try to delete a non-existent relation.
      if (error.code == _node.Parse.Error.OBJECT_NOT_FOUND) {
        return;
      }

      throw error;
    });
  } // Removes objects matches this query from the database.
  // Returns a promise that resolves successfully iff the object was
  // deleted.
  // Options:
  //   acl:  a list of strings. If the object to be updated has an ACL,
  //         one of the provided strings must provide the caller with
  //         write permissions.


  destroy(className, query, {
    acl
  } = {}, validSchemaController) {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'delete')).then(() => {
        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'delete', query, aclGroup);

          if (!query) {
            throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
          }
        } // delete by query


        if (acl) {
          query = addWriteACL(query, acl);
        }

        validateQuery(query, this.skipMongoDBServer13732Workaround);
        return schemaController.getOneSchema(className).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }

          throw error;
        }).then(parseFormatSchema => this.adapter.deleteObjectsByQuery(className, parseFormatSchema, query, this._transactionalSession)).catch(error => {
          // When deleting sessions while changing passwords, don't throw an error if they don't have any sessions.
          if (className === '_Session' && error.code === _node.Parse.Error.OBJECT_NOT_FOUND) {
            return Promise.resolve({});
          }

          throw error;
        });
      });
    });
  } // Inserts an object into the database.
  // Returns a promise that resolves successfully iff the object saved.


  create(className, object, {
    acl
  } = {}, validateOnly = false, validSchemaController) {
    // Make a copy of the object, so we don't mutate the incoming data.
    const originalObject = object;
    object = transformObjectACL(object);
    object.createdAt = {
      iso: object.createdAt,
      __type: 'Date'
    };
    object.updatedAt = {
      iso: object.updatedAt,
      __type: 'Date'
    };
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    const relationUpdates = this.collectRelationUpdates(className, null, object);
    return this.validateClassName(className).then(() => this.loadSchemaIfNeeded(validSchemaController)).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'create')).then(() => schemaController.enforceClassExists(className)).then(() => schemaController.getOneSchema(className, true)).then(schema => {
        transformAuthData(className, object, schema);
        flattenUpdateOperatorsForCreate(object);

        if (validateOnly) {
          return {};
        }

        return this.adapter.createObject(className, SchemaController.convertSchemaToAdapterSchema(schema), object, this._transactionalSession);
      }).then(result => {
        if (validateOnly) {
          return originalObject;
        }

        return this.handleRelationUpdates(className, object.objectId, object, relationUpdates).then(() => {
          return sanitizeDatabaseResult(originalObject, result.ops[0]);
        });
      });
    });
  }

  canAddField(schema, className, object, aclGroup) {
    const classSchema = schema.schemaData[className];

    if (!classSchema) {
      return Promise.resolve();
    }

    const fields = Object.keys(object);
    const schemaFields = Object.keys(classSchema.fields);
    const newKeys = fields.filter(field => {
      // Skip fields that are unset
      if (object[field] && object[field].__op && object[field].__op === 'Delete') {
        return false;
      }

      return schemaFields.indexOf(field) < 0;
    });

    if (newKeys.length > 0) {
      return schema.validatePermission(className, aclGroup, 'addField');
    }

    return Promise.resolve();
  } // Won't delete collections in the system namespace

  /**
   * Delete all classes and clears the schema cache
   *
   * @param {boolean} fast set to true if it's ok to just delete rows and not indexes
   * @returns {Promise<void>} when the deletions completes
   */


  deleteEverything(fast = false) {
    this.schemaPromise = null;
    return Promise.all([this.adapter.deleteAllClasses(fast), this.schemaCache.clear()]);
  } // Returns a promise for a list of related ids given an owning id.
  // className here is the owning className.


  relatedIds(className, key, owningId, queryOptions) {
    const {
      skip,
      limit,
      sort
    } = queryOptions;
    const findOptions = {};

    if (sort && sort.createdAt && this.adapter.canSortOnJoinTables) {
      findOptions.sort = {
        _id: sort.createdAt
      };
      findOptions.limit = limit;
      findOptions.skip = skip;
      queryOptions.skip = 0;
    }

    return this.adapter.find(joinTableName(className, key), relationSchema, {
      owningId
    }, findOptions).then(results => results.map(result => result.relatedId));
  } // Returns a promise for a list of owning ids given some related ids.
  // className here is the owning className.


  owningIds(className, key, relatedIds) {
    return this.adapter.find(joinTableName(className, key), relationSchema, {
      relatedId: {
        $in: relatedIds
      }
    }, {}).then(results => results.map(result => result.owningId));
  } // Modifies query so that it no longer has $in on relation fields, or
  // equal-to-pointer constraints on relation fields.
  // Returns a promise that resolves when query is mutated


  reduceInRelation(className, query, schema) {
    // Search for an in-relation or equal-to-relation
    // Make it sequential for now, not sure of paralleization side effects
    if (query['$or']) {
      const ors = query['$or'];
      return Promise.all(ors.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$or'][index] = aQuery;
        });
      })).then(() => {
        return Promise.resolve(query);
      });
    }

    const promises = Object.keys(query).map(key => {
      const t = schema.getExpectedType(className, key);

      if (!t || t.type !== 'Relation') {
        return Promise.resolve(query);
      }

      let queries = null;

      if (query[key] && (query[key]['$in'] || query[key]['$ne'] || query[key]['$nin'] || query[key].__type == 'Pointer')) {
        // Build the list of queries
        queries = Object.keys(query[key]).map(constraintKey => {
          let relatedIds;
          let isNegation = false;

          if (constraintKey === 'objectId') {
            relatedIds = [query[key].objectId];
          } else if (constraintKey == '$in') {
            relatedIds = query[key]['$in'].map(r => r.objectId);
          } else if (constraintKey == '$nin') {
            isNegation = true;
            relatedIds = query[key]['$nin'].map(r => r.objectId);
          } else if (constraintKey == '$ne') {
            isNegation = true;
            relatedIds = [query[key]['$ne'].objectId];
          } else {
            return;
          }

          return {
            isNegation,
            relatedIds
          };
        });
      } else {
        queries = [{
          isNegation: false,
          relatedIds: []
        }];
      } // remove the current queryKey as we don,t need it anymore


      delete query[key]; // execute each query independently to build the list of
      // $in / $nin

      const promises = queries.map(q => {
        if (!q) {
          return Promise.resolve();
        }

        return this.owningIds(className, key, q.relatedIds).then(ids => {
          if (q.isNegation) {
            this.addNotInObjectIdsIds(ids, query);
          } else {
            this.addInObjectIdsIds(ids, query);
          }

          return Promise.resolve();
        });
      });
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      });
    });
    return Promise.all(promises).then(() => {
      return Promise.resolve(query);
    });
  } // Modifies query so that it no longer has $relatedTo
  // Returns a promise that resolves when query is mutated


  reduceRelationKeys(className, query, queryOptions) {
    if (query['$or']) {
      return Promise.all(query['$or'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions);
      }));
    }

    var relatedTo = query['$relatedTo'];

    if (relatedTo) {
      return this.relatedIds(relatedTo.object.className, relatedTo.key, relatedTo.object.objectId, queryOptions).then(ids => {
        delete query['$relatedTo'];
        this.addInObjectIdsIds(ids, query);
        return this.reduceRelationKeys(className, query, queryOptions);
      }).then(() => {});
    }
  }

  addInObjectIdsIds(ids = null, query) {
    const idsFromString = typeof query.objectId === 'string' ? [query.objectId] : null;
    const idsFromEq = query.objectId && query.objectId['$eq'] ? [query.objectId['$eq']] : null;
    const idsFromIn = query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null; // -disable-next

    const allIds = [idsFromString, idsFromEq, idsFromIn, ids].filter(list => list !== null);
    const totalLength = allIds.reduce((memo, list) => memo + list.length, 0);
    let idsIntersection = [];

    if (totalLength > 125) {
      idsIntersection = _intersect.default.big(allIds);
    } else {
      idsIntersection = (0, _intersect.default)(allIds);
    } // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.


    if (!('objectId' in query)) {
      query.objectId = {
        $in: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $in: undefined,
        $eq: query.objectId
      };
    }

    query.objectId['$in'] = idsIntersection;
    return query;
  }

  addNotInObjectIdsIds(ids = [], query) {
    const idsFromNin = query.objectId && query.objectId['$nin'] ? query.objectId['$nin'] : [];
    let allIds = [...idsFromNin, ...ids].filter(list => list !== null); // make a set and spread to remove duplicates

    allIds = [...new Set(allIds)]; // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.

    if (!('objectId' in query)) {
      query.objectId = {
        $nin: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $nin: undefined,
        $eq: query.objectId
      };
    }

    query.objectId['$nin'] = allIds;
    return query;
  } // Runs a query on the database.
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


  find(className, query, {
    skip,
    limit,
    acl,
    sort = {},
    count,
    keys,
    op,
    distinct,
    pipeline,
    readPreference,
    hint,
    explain
  } = {}, auth = {}, validSchemaController) {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    op = op || (typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find'); // Count operation if counting

    op = count === true ? 'count' : op;
    let classExists = true;
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      //Allow volatile classes if querying with Master (for _PushStatus)
      //TODO: Move volatile classes concept into mongo adapter, postgres adapter shouldn't care
      //that api.parse.com breaks when _PushStatus exists in mongo.
      return schemaController.getOneSchema(className, isMaster).catch(error => {
        // Behavior for non-existent classes is kinda weird on Parse.com. Probably doesn't matter too much.
        // For now, pretend the class exists but has no objects,
        if (error === undefined) {
          classExists = false;
          return {
            fields: {}
          };
        }

        throw error;
      }).then(schema => {
        // Parse.com treats queries on _created_at and _updated_at as if they were queries on createdAt and updatedAt,
        // so duplicate that behavior here. If both are specified, the correct behavior to match Parse.com is to
        // use the one that appears first in the sort list.
        if (sort._created_at) {
          sort.createdAt = sort._created_at;
          delete sort._created_at;
        }

        if (sort._updated_at) {
          sort.updatedAt = sort._updated_at;
          delete sort._updated_at;
        }

        const queryOptions = {
          skip,
          limit,
          sort,
          keys,
          readPreference,
          hint,
          explain
        };
        Object.keys(sort).forEach(fieldName => {
          if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Cannot sort by ${fieldName}`);
          }

          const rootFieldName = getRootFieldName(fieldName);

          if (!SchemaController.fieldNameIsValid(rootFieldName)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
          }
        });
        return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, op)).then(() => this.reduceRelationKeys(className, query, queryOptions)).then(() => this.reduceInRelation(className, query, schemaController)).then(() => {
          let protectedFields;

          if (!isMaster) {
            query = this.addPointerPermissions(schemaController, className, op, query, aclGroup);
            /* Don't use projections to optimize the protectedFields since the protectedFields
            based on pointer-permissions are determined after querying. The filtering can
            overwrite the protected fields. */

            protectedFields = this.addProtectedFields(schemaController, className, query, aclGroup, auth);
          }

          if (!query) {
            if (op === 'get') {
              throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
            } else {
              return [];
            }
          }

          if (!isMaster) {
            if (op === 'update' || op === 'delete') {
              query = addWriteACL(query, aclGroup);
            } else {
              query = addReadACL(query, aclGroup);
            }
          }

          validateQuery(query, this.skipMongoDBServer13732Workaround);

          if (count) {
            if (!classExists) {
              return 0;
            } else {
              return this.adapter.count(className, schema, query, readPreference, undefined, hint);
            }
          } else if (distinct) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.distinct(className, schema, query, distinct);
            }
          } else if (pipeline) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.aggregate(className, schema, pipeline, readPreference, hint, explain);
            }
          } else if (explain) {
            return this.adapter.find(className, schema, query, queryOptions);
          } else {
            return this.adapter.find(className, schema, query, queryOptions).then(objects => objects.map(object => {
              object = untransformObjectACL(object);
              return filterSensitiveData(isMaster, aclGroup, auth, op, schemaController, className, protectedFields, object);
            })).catch(error => {
              throw new _node.Parse.Error(_node.Parse.Error.INTERNAL_SERVER_ERROR, error);
            });
          }
        });
      });
    });
  }

  deleteSchema(className) {
    return this.loadSchema({
      clearCache: true
    }).then(schemaController => schemaController.getOneSchema(className, true)).catch(error => {
      if (error === undefined) {
        return {
          fields: {}
        };
      } else {
        throw error;
      }
    }).then(schema => {
      return this.collectionExists(className).then(() => this.adapter.count(className, {
        fields: {}
      }, null, '', false)).then(count => {
        if (count > 0) {
          throw new _node.Parse.Error(255, `Class ${className} is not empty, contains ${count} objects, cannot drop schema.`);
        }

        return this.adapter.deleteClass(className);
      }).then(wasParseCollection => {
        if (wasParseCollection) {
          const relationFieldNames = Object.keys(schema.fields).filter(fieldName => schema.fields[fieldName].type === 'Relation');
          return Promise.all(relationFieldNames.map(name => this.adapter.deleteClass(joinTableName(className, name)))).then(() => {
            return;
          });
        } else {
          return Promise.resolve();
        }
      });
    });
  }

  addPointerPermissions(schema, className, operation, query, aclGroup = []) {
    // Check if class has public permission for operation
    // If the BaseCLP pass, let go through
    if (schema.testPermissionsForClassName(className, aclGroup, operation)) {
      return query;
    }

    const perms = schema.getClassLevelPermissions(className);
    const field = ['get', 'find'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';
    const userACL = aclGroup.filter(acl => {
      return acl.indexOf('role:') != 0 && acl != '*';
    }); // the ACL should have exactly 1 user

    if (perms && perms[field] && perms[field].length > 0) {
      // No user set return undefined
      // If the length is > 1, that means we didn't de-dupe users correctly
      if (userACL.length != 1) {
        return;
      }

      const userId = userACL[0];
      const userPointer = {
        __type: 'Pointer',
        className: '_User',
        objectId: userId
      };
      const permFields = perms[field];
      const ors = permFields.flatMap(key => {
        // constraint for single pointer setup
        const q = {
          [key]: userPointer
        }; // constraint for users-array setup

        const qa = {
          [key]: {
            $all: [userPointer]
          }
        }; // if we already have a constraint on the key, use the $and

        if (Object.prototype.hasOwnProperty.call(query, key)) {
          return [{
            $and: [q, query]
          }, {
            $and: [qa, query]
          }];
        } // otherwise just add the constaint


        return [Object.assign({}, query, q), Object.assign({}, query, qa)];
      });
      return {
        $or: ors
      };
    } else {
      return query;
    }
  }

  addProtectedFields(schema, className, query = {}, aclGroup = [], auth = {}) {
    const perms = schema.getClassLevelPermissions(className);
    if (!perms) return null;
    const protectedFields = perms.protectedFields;
    if (!protectedFields) return null;
    if (aclGroup.indexOf(query.objectId) > -1) return null; // remove userField keys since they are filtered after querying

    let protectedKeys = Object.keys(protectedFields).reduce((acc, val) => {
      if (val.startsWith('userField:')) return acc;
      return acc.concat(protectedFields[val]);
    }, []);
    [...(auth.userRoles || [])].forEach(role => {
      const fields = protectedFields[role];

      if (fields) {
        protectedKeys = protectedKeys.filter(v => fields.includes(v));
      }
    });
    return protectedKeys;
  }

  createTransactionalSession() {
    return this.adapter.createTransactionalSession().then(transactionalSession => {
      this._transactionalSession = transactionalSession;
    });
  }

  commitTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to commit');
    }

    return this.adapter.commitTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  }

  abortTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to abort');
    }

    return this.adapter.abortTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  } // TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
  // have a Parse app without it having a _User collection.


  performInitialization() {
    const requiredUserFields = {
      fields: _objectSpread({}, SchemaController.defaultColumns._Default, {}, SchemaController.defaultColumns._User)
    };
    const requiredRoleFields = {
      fields: _objectSpread({}, SchemaController.defaultColumns._Default, {}, SchemaController.defaultColumns._Role)
    };
    const userClassPromise = this.loadSchema().then(schema => schema.enforceClassExists('_User'));
    const roleClassPromise = this.loadSchema().then(schema => schema.enforceClassExists('_Role'));
    const usernameUniqueness = userClassPromise.then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['username'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for usernames: ', error);

      throw error;
    });
    const emailUniqueness = userClassPromise.then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['email'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);

      throw error;
    });
    const roleUniqueness = roleClassPromise.then(() => this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for role name: ', error);

      throw error;
    });
    const indexPromise = this.adapter.updateSchemaWithIndexes(); // Create tables for volatile classes

    const adapterInit = this.adapter.performInitialization({
      VolatileClassesSchemas: SchemaController.VolatileClassesSchemas
    });
    return Promise.all([usernameUniqueness, emailUniqueness, roleUniqueness, adapterInit, indexPromise]);
  }

}

module.exports = DatabaseController; // Expose validateQuery for tests

module.exports._validateQuery = validateQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwibmFtZXMiOlsiYWRkV3JpdGVBQ0wiLCJxdWVyeSIsImFjbCIsIm5ld1F1ZXJ5IiwiXyIsImNsb25lRGVlcCIsIl93cGVybSIsIiRpbiIsImFkZFJlYWRBQ0wiLCJfcnBlcm0iLCJ0cmFuc2Zvcm1PYmplY3RBQ0wiLCJBQ0wiLCJyZXN1bHQiLCJlbnRyeSIsInJlYWQiLCJwdXNoIiwid3JpdGUiLCJzcGVjaWFsUXVlcnlrZXlzIiwiaXNTcGVjaWFsUXVlcnlLZXkiLCJrZXkiLCJpbmRleE9mIiwidmFsaWRhdGVRdWVyeSIsInNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsImZvckVhY2giLCJlbCIsIk9iamVjdCIsImtleXMiLCJub0NvbGxpc2lvbnMiLCJzb21lIiwic3VicSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImhhc05lYXJzIiwic3VicXVlcnkiLCIkYW5kIiwiJG5vciIsImxlbmd0aCIsIiRyZWdleCIsIiRvcHRpb25zIiwibWF0Y2giLCJJTlZBTElEX0tFWV9OQU1FIiwiZmlsdGVyU2Vuc2l0aXZlRGF0YSIsImlzTWFzdGVyIiwiYWNsR3JvdXAiLCJhdXRoIiwib3BlcmF0aW9uIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwicHJvdGVjdGVkRmllbGRzIiwib2JqZWN0IiwidXNlcklkIiwidXNlciIsImlkIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1JlYWRPcGVyYXRpb24iLCJwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybSIsImZpbHRlciIsInN0YXJ0c1dpdGgiLCJtYXAiLCJzdWJzdHJpbmciLCJ2YWx1ZSIsIm5ld1Byb3RlY3RlZEZpZWxkcyIsIm92ZXJyaWRlUHJvdGVjdGVkRmllbGRzIiwicG9pbnRlclBlcm0iLCJwb2ludGVyUGVybUluY2x1ZGVzVXNlciIsInJlYWRVc2VyRmllbGRWYWx1ZSIsImlzQXJyYXkiLCJvYmplY3RJZCIsImlzVXNlckNsYXNzIiwiayIsInBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsInNlc3Npb25Ub2tlbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfdG9tYnN0b25lIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJhdXRoRGF0YSIsInNwZWNpYWxLZXlzRm9yVXBkYXRlIiwiaXNTcGVjaWFsVXBkYXRlS2V5IiwiZXhwYW5kUmVzdWx0T25LZXlQYXRoIiwicGF0aCIsInNwbGl0IiwiZmlyc3RLZXkiLCJuZXh0UGF0aCIsInNsaWNlIiwiam9pbiIsInNhbml0aXplRGF0YWJhc2VSZXN1bHQiLCJvcmlnaW5hbE9iamVjdCIsInJlc3BvbnNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJrZXlVcGRhdGUiLCJfX29wIiwiam9pblRhYmxlTmFtZSIsImZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUiLCJhbW91bnQiLCJJTlZBTElEX0pTT04iLCJvYmplY3RzIiwiQ09NTUFORF9VTkFWQUlMQUJMRSIsInRyYW5zZm9ybUF1dGhEYXRhIiwicHJvdmlkZXIiLCJwcm92aWRlckRhdGEiLCJmaWVsZE5hbWUiLCJmaWVsZHMiLCJ0eXBlIiwidW50cmFuc2Zvcm1PYmplY3RBQ0wiLCJvdXRwdXQiLCJnZXRSb290RmllbGROYW1lIiwicmVsYXRpb25TY2hlbWEiLCJyZWxhdGVkSWQiLCJvd25pbmdJZCIsIkRhdGFiYXNlQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYWRhcHRlciIsInNjaGVtYUNhY2hlIiwic2NoZW1hUHJvbWlzZSIsIl90cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbGxlY3Rpb25FeGlzdHMiLCJjbGFzc0V4aXN0cyIsInB1cmdlQ29sbGVjdGlvbiIsImxvYWRTY2hlbWEiLCJ0aGVuIiwic2NoZW1hQ29udHJvbGxlciIsImdldE9uZVNjaGVtYSIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwidmFsaWRhdGVDbGFzc05hbWUiLCJTY2hlbWFDb250cm9sbGVyIiwiY2xhc3NOYW1lSXNWYWxpZCIsInJlamVjdCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsIm9wdGlvbnMiLCJjbGVhckNhY2hlIiwibG9hZCIsImxvYWRTY2hlbWFJZk5lZWRlZCIsInJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IiwidCIsImdldEV4cGVjdGVkVHlwZSIsInRhcmdldENsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJ1bmRlZmluZWQiLCJzIiwiY2FuQWRkRmllbGQiLCJ1cGRhdGUiLCJtYW55IiwidXBzZXJ0Iiwic2tpcFNhbml0aXphdGlvbiIsInZhbGlkYXRlT25seSIsInZhbGlkU2NoZW1hQ29udHJvbGxlciIsIm9yaWdpbmFsUXVlcnkiLCJvcmlnaW5hbFVwZGF0ZSIsInJlbGF0aW9uVXBkYXRlcyIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNvbGxlY3RSZWxhdGlvblVwZGF0ZXMiLCJhZGRQb2ludGVyUGVybWlzc2lvbnMiLCJjYXRjaCIsImVycm9yIiwicm9vdEZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWQiLCJ1cGRhdGVPcGVyYXRpb24iLCJpbm5lcktleSIsImluY2x1ZGVzIiwiSU5WQUxJRF9ORVNURURfS0VZIiwiZmluZCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwc2VydE9uZU9iamVjdCIsImZpbmRPbmVBbmRVcGRhdGUiLCJoYW5kbGVSZWxhdGlvblVwZGF0ZXMiLCJvcHMiLCJkZWxldGVNZSIsInByb2Nlc3MiLCJvcCIsIngiLCJwZW5kaW5nIiwiYWRkUmVsYXRpb24iLCJyZW1vdmVSZWxhdGlvbiIsImFsbCIsImZyb21DbGFzc05hbWUiLCJmcm9tSWQiLCJ0b0lkIiwiZG9jIiwiY29kZSIsImRlc3Ryb3kiLCJwYXJzZUZvcm1hdFNjaGVtYSIsImNyZWF0ZSIsImNyZWF0ZWRBdCIsImlzbyIsIl9fdHlwZSIsInVwZGF0ZWRBdCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImNyZWF0ZU9iamVjdCIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJjbGFzc1NjaGVtYSIsInNjaGVtYURhdGEiLCJzY2hlbWFGaWVsZHMiLCJuZXdLZXlzIiwiZmllbGQiLCJkZWxldGVFdmVyeXRoaW5nIiwiZmFzdCIsImRlbGV0ZUFsbENsYXNzZXMiLCJjbGVhciIsInJlbGF0ZWRJZHMiLCJxdWVyeU9wdGlvbnMiLCJza2lwIiwibGltaXQiLCJzb3J0IiwiZmluZE9wdGlvbnMiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwiX2lkIiwicmVzdWx0cyIsIm93bmluZ0lkcyIsInJlZHVjZUluUmVsYXRpb24iLCJvcnMiLCJhUXVlcnkiLCJpbmRleCIsInByb21pc2VzIiwicXVlcmllcyIsImNvbnN0cmFpbnRLZXkiLCJpc05lZ2F0aW9uIiwiciIsInEiLCJpZHMiLCJhZGROb3RJbk9iamVjdElkc0lkcyIsImFkZEluT2JqZWN0SWRzSWRzIiwicmVkdWNlUmVsYXRpb25LZXlzIiwicmVsYXRlZFRvIiwiaWRzRnJvbVN0cmluZyIsImlkc0Zyb21FcSIsImlkc0Zyb21JbiIsImFsbElkcyIsImxpc3QiLCJ0b3RhbExlbmd0aCIsInJlZHVjZSIsIm1lbW8iLCJpZHNJbnRlcnNlY3Rpb24iLCJpbnRlcnNlY3QiLCJiaWciLCIkZXEiLCJpZHNGcm9tTmluIiwiU2V0IiwiJG5pbiIsImNvdW50IiwiZGlzdGluY3QiLCJwaXBlbGluZSIsInJlYWRQcmVmZXJlbmNlIiwiaGludCIsImV4cGxhaW4iLCJfY3JlYXRlZF9hdCIsIl91cGRhdGVkX2F0IiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiYWdncmVnYXRlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZGVsZXRlU2NoZW1hIiwiZGVsZXRlQ2xhc3MiLCJ3YXNQYXJzZUNvbGxlY3Rpb24iLCJyZWxhdGlvbkZpZWxkTmFtZXMiLCJuYW1lIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwidXNlckFDTCIsInVzZXJQb2ludGVyIiwicGVybUZpZWxkcyIsImZsYXRNYXAiLCJxYSIsIiRhbGwiLCJhc3NpZ24iLCJwcm90ZWN0ZWRLZXlzIiwiYWNjIiwidmFsIiwiY29uY2F0IiwidXNlclJvbGVzIiwicm9sZSIsInYiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwicmVxdWlyZWRVc2VyRmllbGRzIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsIl9Vc2VyIiwicmVxdWlyZWRSb2xlRmllbGRzIiwiX1JvbGUiLCJ1c2VyQ2xhc3NQcm9taXNlIiwicm9sZUNsYXNzUHJvbWlzZSIsInVzZXJuYW1lVW5pcXVlbmVzcyIsImVuc3VyZVVuaXF1ZW5lc3MiLCJsb2dnZXIiLCJ3YXJuIiwiZW1haWxVbmlxdWVuZXNzIiwicm9sZVVuaXF1ZW5lc3MiLCJpbmRleFByb21pc2UiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsImFkYXB0ZXJJbml0IiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsIm1vZHVsZSIsImV4cG9ydHMiLCJfdmFsaWRhdGVRdWVyeSJdLCJtYXBwaW5ncyI6Ijs7QUFLQTs7QUFFQTs7QUFFQTs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBTUEsU0FBU0EsV0FBVCxDQUFxQkMsS0FBckIsRUFBNEJDLEdBQTVCLEVBQWlDO0FBQy9CLFFBQU1DLFFBQVEsR0FBR0MsZ0JBQUVDLFNBQUYsQ0FBWUosS0FBWixDQUFqQixD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STtBQUNkb0ksc0JBQU9DLElBQVAsQ0FDRSx3REFERixFQUVFckksS0FGRjs7QUFJQSxZQUFNQSxLQUFOO0FBQ0QsS0FWcUIsQ0FBeEI7QUFZQSxVQUFNdUksY0FBYyxHQUFHTixnQkFBZ0IsQ0FDcENuSyxJQURvQixDQUNmLE1BQ0osS0FBS1IsT0FBTCxDQUFhNkssZ0JBQWIsQ0FBOEIsT0FBOUIsRUFBdUNMLGtCQUF2QyxFQUEyRCxDQUFDLE1BQUQsQ0FBM0QsQ0FGbUIsRUFJcEIvSCxLQUpvQixDQUlkQyxLQUFLLElBQUk7QUFDZG9JLHNCQUFPQyxJQUFQLENBQVksNkNBQVosRUFBMkRySSxLQUEzRDs7QUFDQSxZQUFNQSxLQUFOO0FBQ0QsS0FQb0IsQ0FBdkI7QUFTQSxVQUFNd0ksWUFBWSxHQUFHLEtBQUtsTCxPQUFMLENBQWFtTCx1QkFBYixFQUFyQixDQW5Ec0IsQ0FxRHRCOztBQUNBLFVBQU1DLFdBQVcsR0FBRyxLQUFLcEwsT0FBTCxDQUFhbUsscUJBQWIsQ0FBbUM7QUFDckRrQixNQUFBQSxzQkFBc0IsRUFBRXhLLGdCQUFnQixDQUFDd0s7QUFEWSxLQUFuQyxDQUFwQjtBQUdBLFdBQU83TSxPQUFPLENBQUN1RixHQUFSLENBQVksQ0FDakI2RyxrQkFEaUIsRUFFakJJLGVBRmlCLEVBR2pCQyxjQUhpQixFQUlqQkcsV0FKaUIsRUFLakJGLFlBTGlCLENBQVosQ0FBUDtBQU9EOztBQWp1Q3NCOztBQXN1Q3pCSSxNQUFNLENBQUNDLE9BQVAsR0FBaUJ6TCxrQkFBakIsQyxDQUNBOztBQUNBd0wsTUFBTSxDQUFDQyxPQUFQLENBQWVDLGNBQWYsR0FBZ0NqUyxhQUFoQyIsInNvdXJjZXNDb250ZW50IjpbIu+7vy8vIEBmbG93XG4vLyBBIGRhdGFiYXNlIGFkYXB0ZXIgdGhhdCB3b3JrcyB3aXRoIGRhdGEgZXhwb3J0ZWQgZnJvbSB0aGUgaG9zdGVkXG4vLyBQYXJzZSBkYXRhYmFzZS5cblxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgaW50ZXJzZWN0IGZyb20gJ2ludGVyc2VjdCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgKiBhcyBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4vU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHR5cGUge1xuICBRdWVyeU9wdGlvbnMsXG4gIEZ1bGxRdWVyeU9wdGlvbnMsXG59IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuXG5mdW5jdGlvbiBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3dwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll93cGVybSA9IHsgJGluOiBbbnVsbCwgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbmZ1bmN0aW9uIGFkZFJlYWRBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ19ycGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fcnBlcm0gPSB7ICRpbjogW251bGwsICcqJywgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbi8vIFRyYW5zZm9ybXMgYSBSRVNUIEFQSSBmb3JtYXR0ZWQgQUNMIG9iamVjdCB0byBvdXIgdHdvLWZpZWxkIG1vbmdvIGZvcm1hdC5cbmNvbnN0IHRyYW5zZm9ybU9iamVjdEFDTCA9ICh7IEFDTCwgLi4ucmVzdWx0IH0pID0+IHtcbiAgaWYgKCFBQ0wpIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcmVzdWx0Ll93cGVybSA9IFtdO1xuICByZXN1bHQuX3JwZXJtID0gW107XG5cbiAgZm9yIChjb25zdCBlbnRyeSBpbiBBQ0wpIHtcbiAgICBpZiAoQUNMW2VudHJ5XS5yZWFkKSB7XG4gICAgICByZXN1bHQuX3JwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgICBpZiAoQUNMW2VudHJ5XS53cml0ZSkge1xuICAgICAgcmVzdWx0Ll93cGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmNvbnN0IHNwZWNpYWxRdWVyeWtleXMgPSBbXG4gICckYW5kJyxcbiAgJyRvcicsXG4gICckbm9yJyxcbiAgJ19ycGVybScsXG4gICdfd3Blcm0nLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuXTtcblxuY29uc3QgaXNTcGVjaWFsUXVlcnlLZXkgPSBrZXkgPT4ge1xuICByZXR1cm4gc3BlY2lhbFF1ZXJ5a2V5cy5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmNvbnN0IHZhbGlkYXRlUXVlcnkgPSAoXG4gIHF1ZXJ5OiBhbnksXG4gIHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kOiBib29sZWFuXG4pOiB2b2lkID0+IHtcbiAgaWYgKHF1ZXJ5LkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQ2Fubm90IHF1ZXJ5IG9uIEFDTC4nKTtcbiAgfVxuXG4gIGlmIChxdWVyeS4kb3IpIHtcbiAgICBpZiAocXVlcnkuJG9yIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKGVsID0+XG4gICAgICAgIHZhbGlkYXRlUXVlcnkoZWwsIHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kKVxuICAgICAgKTtcblxuICAgICAgaWYgKCFza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZCkge1xuICAgICAgICAvKiBJbiBNb25nb0RCIDMuMiAmIDMuNCwgJG9yIHF1ZXJpZXMgd2hpY2ggYXJlIG5vdCBhbG9uZSBhdCB0aGUgdG9wXG4gICAgICAgICAqIGxldmVsIG9mIHRoZSBxdWVyeSBjYW4gbm90IG1ha2UgZWZmaWNpZW50IHVzZSBvZiBpbmRleGVzIGR1ZSB0byBhXG4gICAgICAgICAqIGxvbmcgc3RhbmRpbmcgYnVnIGtub3duIGFzIFNFUlZFUi0xMzczMi5cbiAgICAgICAgICpcbiAgICAgICAgICogVGhpcyBidWcgd2FzIGZpeGVkIGluIE1vbmdvREIgdmVyc2lvbiAzLjYuXG4gICAgICAgICAqXG4gICAgICAgICAqIEZvciB2ZXJzaW9ucyBwcmUtMy42LCB0aGUgYmVsb3cgbG9naWMgcHJvZHVjZXMgYSBzdWJzdGFudGlhbFxuICAgICAgICAgKiBwZXJmb3JtYW5jZSBpbXByb3ZlbWVudCBpbnNpZGUgdGhlIGRhdGFiYXNlIGJ5IGF2b2lkaW5nIHRoZSBidWcuXG4gICAgICAgICAqXG4gICAgICAgICAqIEZvciB2ZXJzaW9ucyAzLjYgYW5kIGFib3ZlLCB0aGVyZSBpcyBubyBwZXJmb3JtYW5jZSBpbXByb3ZlbWVudCBhbmRcbiAgICAgICAgICogdGhlIGxvZ2ljIGlzIHVubmVjZXNzYXJ5LiBTb21lIHF1ZXJ5IHBhdHRlcm5zIGFyZSBldmVuIHNsb3dlZCBieVxuICAgICAgICAgKiB0aGUgYmVsb3cgbG9naWMsIGR1ZSB0byB0aGUgYnVnIGhhdmluZyBiZWVuIGZpeGVkIGFuZCBiZXR0ZXJcbiAgICAgICAgICogcXVlcnkgcGxhbnMgYmVpbmcgY2hvc2VuLlxuICAgICAgICAgKlxuICAgICAgICAgKiBXaGVuIHZlcnNpb25zIGJlZm9yZSAzLjQgYXJlIG5vIGxvbmdlciBzdXBwb3J0ZWQgYnkgdGhpcyBwcm9qZWN0LFxuICAgICAgICAgKiB0aGlzIGxvZ2ljLCBhbmQgdGhlIGFjY29tcGFueWluZyBgc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmRgXG4gICAgICAgICAqIGZsYWcsIGNhbiBiZSByZW1vdmVkLlxuICAgICAgICAgKlxuICAgICAgICAgKiBUaGlzIGJsb2NrIHJlc3RydWN0dXJlcyBxdWVyaWVzIGluIHdoaWNoICRvciBpcyBub3QgdGhlIHNvbGUgdG9wXG4gICAgICAgICAqIGxldmVsIGVsZW1lbnQgYnkgbW92aW5nIGFsbCBvdGhlciB0b3AtbGV2ZWwgcHJlZGljYXRlcyBpbnNpZGUgZXZlcnlcbiAgICAgICAgICogc3ViZG9jdW1lbnQgb2YgdGhlICRvciBwcmVkaWNhdGUsIGFsbG93aW5nIE1vbmdvREIncyBxdWVyeSBwbGFubmVyXG4gICAgICAgICAqIHRvIG1ha2UgZnVsbCB1c2Ugb2YgdGhlIG1vc3QgcmVsZXZhbnQgaW5kZXhlcy5cbiAgICAgICAgICpcbiAgICAgICAgICogRUc6ICAgICAgeyRvcjogW3thOiAxfSwge2E6IDJ9XSwgYjogMn1cbiAgICAgICAgICogQmVjb21lczogeyRvcjogW3thOiAxLCBiOiAyfSwge2E6IDIsIGI6IDJ9XX1cbiAgICAgICAgICpcbiAgICAgICAgICogVGhlIG9ubHkgZXhjZXB0aW9ucyBhcmUgJG5lYXIgYW5kICRuZWFyU3BoZXJlIG9wZXJhdG9ycywgd2hpY2ggYXJlXG4gICAgICAgICAqIGNvbnN0cmFpbmVkIHRvIG9ubHkgMSBvcGVyYXRvciBwZXIgcXVlcnkuIEFzIGEgcmVzdWx0LCB0aGVzZSBvcHNcbiAgICAgICAgICogcmVtYWluIGF0IHRoZSB0b3AgbGV2ZWxcbiAgICAgICAgICpcbiAgICAgICAgICogaHR0cHM6Ly9qaXJhLm1vbmdvZGIub3JnL2Jyb3dzZS9TRVJWRVItMTM3MzJcbiAgICAgICAgICogaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzM3NjdcbiAgICAgICAgICovXG4gICAgICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgY29uc3Qgbm9Db2xsaXNpb25zID0gIXF1ZXJ5LiRvci5zb21lKHN1YnEgPT5cbiAgICAgICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdWJxLCBrZXkpXG4gICAgICAgICAgKTtcbiAgICAgICAgICBsZXQgaGFzTmVhcnMgPSBmYWxzZTtcbiAgICAgICAgICBpZiAocXVlcnlba2V5XSAhPSBudWxsICYmIHR5cGVvZiBxdWVyeVtrZXldID09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBoYXNOZWFycyA9ICckbmVhcicgaW4gcXVlcnlba2V5XSB8fCAnJG5lYXJTcGhlcmUnIGluIHF1ZXJ5W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChrZXkgIT0gJyRvcicgJiYgbm9Db2xsaXNpb25zICYmICFoYXNOZWFycykge1xuICAgICAgICAgICAgcXVlcnkuJG9yLmZvckVhY2goc3VicXVlcnkgPT4ge1xuICAgICAgICAgICAgICBzdWJxdWVyeVtrZXldID0gcXVlcnlba2V5XTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgZGVsZXRlIHF1ZXJ5W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcXVlcnkuJG9yLmZvckVhY2goZWwgPT5cbiAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KGVsLCBza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAnQmFkICRvciBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJGFuZCkge1xuICAgIGlmIChxdWVyeS4kYW5kIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRhbmQuZm9yRWFjaChlbCA9PlxuICAgICAgICB2YWxpZGF0ZVF1ZXJ5KGVsLCBza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZClcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkYW5kIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kbm9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRub3IgaW5zdGFuY2VvZiBBcnJheSAmJiBxdWVyeS4kbm9yLmxlbmd0aCA+IDApIHtcbiAgICAgIHF1ZXJ5LiRub3IuZm9yRWFjaChlbCA9PlxuICAgICAgICB2YWxpZGF0ZVF1ZXJ5KGVsLCBza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZClcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkbm9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSBvZiBhdCBsZWFzdCAxIHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAocXVlcnkgJiYgcXVlcnlba2V5XSAmJiBxdWVyeVtrZXldLiRyZWdleCkge1xuICAgICAgaWYgKHR5cGVvZiBxdWVyeVtrZXldLiRvcHRpb25zID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXF1ZXJ5W2tleV0uJG9wdGlvbnMubWF0Y2goL15baW14c10rJC8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgIGBCYWQgJG9wdGlvbnMgdmFsdWUgZm9yIHF1ZXJ5OiAke3F1ZXJ5W2tleV0uJG9wdGlvbnN9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFpc1NwZWNpYWxRdWVyeUtleShrZXkpICYmICFrZXkubWF0Y2goL15bYS16QS1aXVthLXpBLVowLTlfXFwuXSokLykpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgYEludmFsaWQga2V5IG5hbWU6ICR7a2V5fWBcbiAgICAgICk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIEZpbHRlcnMgb3V0IGFueSBkYXRhIHRoYXQgc2hvdWxkbid0IGJlIG9uIHRoaXMgUkVTVC1mb3JtYXR0ZWQgb2JqZWN0LlxuY29uc3QgZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IChcbiAgaXNNYXN0ZXI6IGJvb2xlYW4sXG4gIGFjbEdyb3VwOiBhbnlbXSxcbiAgYXV0aDogYW55LFxuICBvcGVyYXRpb246IGFueSxcbiAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gIGNsYXNzTmFtZTogc3RyaW5nLFxuICBwcm90ZWN0ZWRGaWVsZHM6IG51bGwgfCBBcnJheTxhbnk+LFxuICBvYmplY3Q6IGFueVxuKSA9PiB7XG4gIGxldCB1c2VySWQgPSBudWxsO1xuICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHVzZXJJZCA9IGF1dGgudXNlci5pZDtcblxuICAvLyByZXBsYWNlIHByb3RlY3RlZEZpZWxkcyB3aGVuIHVzaW5nIHBvaW50ZXItcGVybWlzc2lvbnNcbiAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gIGlmIChwZXJtcykge1xuICAgIGNvbnN0IGlzUmVhZE9wZXJhdGlvbiA9IFsnZ2V0JywgJ2ZpbmQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMTtcblxuICAgIGlmIChpc1JlYWRPcGVyYXRpb24gJiYgcGVybXMucHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBleHRyYWN0IHByb3RlY3RlZEZpZWxkcyBhZGRlZCB3aXRoIHRoZSBwb2ludGVyLXBlcm1pc3Npb24gcHJlZml4XG4gICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybSA9IE9iamVjdC5rZXlzKHBlcm1zLnByb3RlY3RlZEZpZWxkcylcbiAgICAgICAgLmZpbHRlcihrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSlcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIHJldHVybiB7IGtleToga2V5LnN1YnN0cmluZygxMCksIHZhbHVlOiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB9O1xuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbmV3UHJvdGVjdGVkRmllbGRzOiBBcnJheTxzdHJpbmc+ID0gW107XG4gICAgICBsZXQgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSBmYWxzZTtcblxuICAgICAgLy8gY2hlY2sgaWYgdGhlIG9iamVjdCBncmFudHMgdGhlIGN1cnJlbnQgdXNlciBhY2Nlc3MgYmFzZWQgb24gdGhlIGV4dHJhY3RlZCBmaWVsZHNcbiAgICAgIHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtLmZvckVhY2gocG9pbnRlclBlcm0gPT4ge1xuICAgICAgICBsZXQgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgcmVhZFVzZXJGaWVsZFZhbHVlID0gb2JqZWN0W3BvaW50ZXJQZXJtLmtleV07XG4gICAgICAgIGlmIChyZWFkVXNlckZpZWxkVmFsdWUpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyZWFkVXNlckZpZWxkVmFsdWUpKSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IHJlYWRVc2VyRmllbGRWYWx1ZS5zb21lKFxuICAgICAgICAgICAgICB1c2VyID0+IHVzZXIub2JqZWN0SWQgJiYgdXNlci5vYmplY3RJZCA9PT0gdXNlcklkXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9XG4gICAgICAgICAgICAgIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgPT09IHVzZXJJZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocG9pbnRlclBlcm1JbmNsdWRlc1VzZXIpIHtcbiAgICAgICAgICBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IHRydWU7XG4gICAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2goLi4ucG9pbnRlclBlcm0udmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gaWYgYXRsZWFzdCBvbmUgcG9pbnRlci1wZXJtaXNzaW9uIGFmZmVjdGVkIHRoZSBjdXJyZW50IHVzZXIgb3ZlcnJpZGUgdGhlIHByb3RlY3RlZEZpZWxkc1xuICAgICAgaWYgKG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzKSBwcm90ZWN0ZWRGaWVsZHMgPSBuZXdQcm90ZWN0ZWRGaWVsZHM7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaXNVc2VyQ2xhc3MgPSBjbGFzc05hbWUgPT09ICdfVXNlcic7XG5cbiAgLyogc3BlY2lhbCB0cmVhdCBmb3IgdGhlIHVzZXIgY2xhc3M6IGRvbid0IGZpbHRlciBwcm90ZWN0ZWRGaWVsZHMgaWYgY3VycmVudGx5IGxvZ2dlZGluIHVzZXIgaXNcbiAgdGhlIHJldHJpZXZlZCB1c2VyICovXG4gIGlmICghKGlzVXNlckNsYXNzICYmIHVzZXJJZCAmJiBvYmplY3Qub2JqZWN0SWQgPT09IHVzZXJJZCkpXG4gICAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG5cbiAgaWYgKCFpc1VzZXJDbGFzcykge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBvYmplY3QucGFzc3dvcmQgPSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcbiAgZGVsZXRlIG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuXG4gIGRlbGV0ZSBvYmplY3Quc2Vzc2lvblRva2VuO1xuXG4gIGlmIChpc01hc3Rlcikge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZGVsZXRlIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuO1xuICBkZWxldGUgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuO1xuICBkZWxldGUgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX3RvbWJzdG9uZTtcbiAgZGVsZXRlIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX2ZhaWxlZF9sb2dpbl9jb3VudDtcbiAgZGVsZXRlIG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX3Bhc3N3b3JkX2hpc3Rvcnk7XG5cbiAgaWYgKGFjbEdyb3VwLmluZGV4T2Yob2JqZWN0Lm9iamVjdElkKSA+IC0xKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuaW1wb3J0IHR5cGUgeyBMb2FkU2NoZW1hT3B0aW9ucyB9IGZyb20gJy4vdHlwZXMnO1xuXG4vLyBSdW5zIGFuIHVwZGF0ZSBvbiB0aGUgZGF0YWJhc2UuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gb2JqZWN0IHdpdGggdGhlIG5ldyB2YWx1ZXMgZm9yIGZpZWxkXG4vLyBtb2RpZmljYXRpb25zIHRoYXQgZG9uJ3Qga25vdyB0aGVpciByZXN1bHRzIGFoZWFkIG9mIHRpbWUsIGxpa2Vcbi8vICdpbmNyZW1lbnQnLlxuLy8gT3B0aW9uczpcbi8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbmNvbnN0IHNwZWNpYWxLZXlzRm9yVXBkYXRlID0gW1xuICAnX2hhc2hlZF9wYXNzd29yZCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFVwZGF0ZUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsS2V5c0ZvclVwZGF0ZS5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmZ1bmN0aW9uIGV4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3QsIGtleSwgdmFsdWUpIHtcbiAgaWYgKGtleS5pbmRleE9mKCcuJykgPCAwKSB7XG4gICAgb2JqZWN0W2tleV0gPSB2YWx1ZVtrZXldO1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgY29uc3QgcGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICBjb25zdCBmaXJzdEtleSA9IHBhdGhbMF07XG4gIGNvbnN0IG5leHRQYXRoID0gcGF0aC5zbGljZSgxKS5qb2luKCcuJyk7XG4gIG9iamVjdFtmaXJzdEtleV0gPSBleHBhbmRSZXN1bHRPbktleVBhdGgoXG4gICAgb2JqZWN0W2ZpcnN0S2V5XSB8fCB7fSxcbiAgICBuZXh0UGF0aCxcbiAgICB2YWx1ZVtmaXJzdEtleV1cbiAgKTtcbiAgZGVsZXRlIG9iamVjdFtrZXldO1xuICByZXR1cm4gb2JqZWN0O1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQpOiBQcm9taXNlPGFueT4ge1xuICBjb25zdCByZXNwb25zZSA9IHt9O1xuICBpZiAoIXJlc3VsdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICB9XG4gIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgY29uc3Qga2V5VXBkYXRlID0gb3JpZ2luYWxPYmplY3Rba2V5XTtcbiAgICAvLyBkZXRlcm1pbmUgaWYgdGhhdCB3YXMgYW4gb3BcbiAgICBpZiAoXG4gICAgICBrZXlVcGRhdGUgJiZcbiAgICAgIHR5cGVvZiBrZXlVcGRhdGUgPT09ICdvYmplY3QnICYmXG4gICAgICBrZXlVcGRhdGUuX19vcCAmJlxuICAgICAgWydBZGQnLCAnQWRkVW5pcXVlJywgJ1JlbW92ZScsICdJbmNyZW1lbnQnXS5pbmRleE9mKGtleVVwZGF0ZS5fX29wKSA+IC0xXG4gICAgKSB7XG4gICAgICAvLyBvbmx5IHZhbGlkIG9wcyB0aGF0IHByb2R1Y2UgYW4gYWN0aW9uYWJsZSByZXN1bHRcbiAgICAgIC8vIHRoZSBvcCBtYXkgaGF2ZSBoYXBwZW5kIG9uIGEga2V5cGF0aFxuICAgICAgZXhwYW5kUmVzdWx0T25LZXlQYXRoKHJlc3BvbnNlLCBrZXksIHJlc3VsdCk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG59XG5cbmZ1bmN0aW9uIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIGBfSm9pbjoke2tleX06JHtjbGFzc05hbWV9YDtcbn1cblxuY29uc3QgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSA9IG9iamVjdCA9PiB7XG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICBzd2l0Y2ggKG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldLmFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5J1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY2xhc3MgRGF0YWJhc2VDb250cm9sbGVyIHtcbiAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG4gIHNjaGVtYVByb21pc2U6ID9Qcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj47XG4gIHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kOiBib29sZWFuO1xuICBfdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsXG4gICAgc2NoZW1hQ2FjaGU6IGFueSxcbiAgICBza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZDogYm9vbGVhblxuICApIHtcbiAgICB0aGlzLmFkYXB0ZXIgPSBhZGFwdGVyO1xuICAgIHRoaXMuc2NoZW1hQ2FjaGUgPSBzY2hlbWFDYWNoZTtcbiAgICAvLyBXZSBkb24ndCB3YW50IGEgbXV0YWJsZSB0aGlzLnNjaGVtYSwgYmVjYXVzZSB0aGVuIHlvdSBjb3VsZCBoYXZlXG4gICAgLy8gb25lIHJlcXVlc3QgdGhhdCB1c2VzIGRpZmZlcmVudCBzY2hlbWFzIGZvciBkaWZmZXJlbnQgcGFydHMgb2ZcbiAgICAvLyBpdC4gSW5zdGVhZCwgdXNlIGxvYWRTY2hlbWEgdG8gZ2V0IGEgc2NoZW1hLlxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgdGhpcy5za2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZCA9IHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kO1xuICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgfVxuXG4gIGNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gIH1cblxuICBwdXJnZUNvbGxlY3Rpb24oY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHt9KSk7XG4gIH1cblxuICB2YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5jbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAnaW52YWxpZCBjbGFzc05hbWU6ICcgKyBjbGFzc05hbWVcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgc2NoZW1hQ29udHJvbGxlci5cbiAgbG9hZFNjaGVtYShcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYVByb21pc2UgIT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHRoaXMuc2NoZW1hUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gU2NoZW1hQ29udHJvbGxlci5sb2FkKFxuICAgICAgdGhpcy5hZGFwdGVyLFxuICAgICAgdGhpcy5zY2hlbWFDYWNoZSxcbiAgICAgIG9wdGlvbnNcbiAgICApO1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZS50aGVuKFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZSxcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2VcbiAgICApO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICBsb2FkU2NoZW1hSWZOZWVkZWQoXG4gICAgc2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgID8gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYUNvbnRyb2xsZXIpXG4gICAgICA6IHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgY2xhc3NuYW1lIHRoYXQgaXMgcmVsYXRlZCB0byB0aGUgZ2l2ZW5cbiAgLy8gY2xhc3NuYW1lIHRocm91Z2ggdGhlIGtleS5cbiAgLy8gVE9ETzogbWFrZSB0aGlzIG5vdCBpbiB0aGUgRGF0YWJhc2VDb250cm9sbGVyIGludGVyZmFjZVxuICByZWRpcmVjdENsYXNzTmFtZUZvcktleShjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcpOiBQcm9taXNlPD9zdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4ge1xuICAgICAgdmFyIHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICh0ICE9IG51bGwgJiYgdHlwZW9mIHQgIT09ICdzdHJpbmcnICYmIHQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gdC50YXJnZXRDbGFzcztcbiAgICAgIH1cbiAgICAgIHJldHVybiBjbGFzc05hbWU7XG4gICAgfSk7XG4gIH1cblxuICAvLyBVc2VzIHRoZSBzY2hlbWEgdG8gdmFsaWRhdGUgdGhlIG9iamVjdCAoUkVTVCBBUEkgZm9ybWF0KS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYS5cbiAgLy8gVGhpcyBkb2VzIG5vdCB1cGRhdGUgdGhpcy5zY2hlbWEsIGJlY2F1c2UgaW4gYSBzaXR1YXRpb24gbGlrZSBhXG4gIC8vIGJhdGNoIHJlcXVlc3QsIHRoYXQgY291bGQgY29uZnVzZSBvdGhlciB1c2VycyBvZiB0aGUgc2NoZW1hLlxuICB2YWxpZGF0ZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBxdWVyeTogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBsZXQgc2NoZW1hO1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwOiBzdHJpbmdbXSA9IGFjbCB8fCBbXTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWEgPSBzO1xuICAgICAgICBpZiAoaXNNYXN0ZXIpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FuQWRkRmllbGQoc2NoZW1hLCBjbGFzc05hbWUsIG9iamVjdCwgYWNsR3JvdXApO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB7IGFjbCwgbWFueSwgdXBzZXJ0IH06IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICBza2lwU2FuaXRpemF0aW9uOiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gcXVlcnk7XG4gICAgY29uc3Qgb3JpZ2luYWxVcGRhdGUgPSB1cGRhdGU7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIHVwZGF0ZSA9IGRlZXBjb3B5KHVwZGF0ZSk7XG4gICAgdmFyIHJlbGF0aW9uVXBkYXRlcyA9IFtdO1xuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oXG4gICAgICBzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICd1cGRhdGUnKVxuICAgICAgICApXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHVwZGF0ZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAndXBkYXRlJyxcbiAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCB0aGlzLnNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kKTtcbiAgICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKVxuICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICAgICFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSkgJiZcbiAgICAgICAgICAgICAgICAgICAgIWlzU3BlY2lhbFVwZGF0ZUtleShyb290RmllbGROYW1lKVxuICAgICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdXBkYXRlT3BlcmF0aW9uIGluIHVwZGF0ZSkge1xuICAgICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSAmJlxuICAgICAgICAgICAgICAgICAgICB0eXBlb2YgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dKS5zb21lKFxuICAgICAgICAgICAgICAgICAgICAgIGlubmVyS2V5ID0+XG4gICAgICAgICAgICAgICAgICAgICAgICBpbm5lcktleS5pbmNsdWRlcygnJCcpIHx8IGlubmVyS2V5LmluY2x1ZGVzKCcuJylcbiAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHVwZGF0ZSA9IHRyYW5zZm9ybU9iamVjdEFDTCh1cGRhdGUpO1xuICAgICAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgICAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAgICAgICAgICAgLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB7fSlcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCAhcmVzdWx0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgICAgICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobWFueSkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodXBzZXJ0KSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmRPbmVBbmRVcGRhdGUoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAoc2tpcFNhbml0aXphdGlvbikge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbFVwZGF0ZSwgcmVzdWx0KTtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgLy8gQ29sbGVjdCBhbGwgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgbGlzdCBvZiBhbGwgcmVsYXRpb24gdXBkYXRlcyB0byBwZXJmb3JtXG4gIC8vIFRoaXMgbXV0YXRlcyB1cGRhdGUuXG4gIGNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdElkOiA/c3RyaW5nLCB1cGRhdGU6IGFueSkge1xuICAgIHZhciBvcHMgPSBbXTtcbiAgICB2YXIgZGVsZXRlTWUgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcblxuICAgIHZhciBwcm9jZXNzID0gKG9wLCBrZXkpID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0JhdGNoJykge1xuICAgICAgICBmb3IgKHZhciB4IG9mIG9wLm9wcykge1xuICAgICAgICAgIHByb2Nlc3MoeCwga2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IGtleSBpbiB1cGRhdGUpIHtcbiAgICAgIHByb2Nlc3ModXBkYXRlW2tleV0sIGtleSk7XG4gICAgfVxuICAgIGZvciAoY29uc3Qga2V5IG9mIGRlbGV0ZU1lKSB7XG4gICAgICBkZWxldGUgdXBkYXRlW2tleV07XG4gICAgfVxuICAgIHJldHVybiBvcHM7XG4gIH1cblxuICAvLyBQcm9jZXNzZXMgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gYWxsIHVwZGF0ZXMgaGF2ZSBiZWVuIHBlcmZvcm1lZFxuICBoYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0SWQ6IHN0cmluZyxcbiAgICB1cGRhdGU6IGFueSxcbiAgICBvcHM6IGFueVxuICApIHtcbiAgICB2YXIgcGVuZGluZyA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuICAgIG9wcy5mb3JFYWNoKCh7IGtleSwgb3AgfSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2goXG4gICAgICAgICAgICB0aGlzLmFkZFJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKFxuICAgICAgICAgICAgdGhpcy5yZW1vdmVSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZClcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocGVuZGluZyk7XG4gIH1cblxuICAvLyBBZGRzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgYWRkIHdhcyBzdWNjZXNzZnVsLlxuICBhZGRSZWxhdGlvbihcbiAgICBrZXk6IHN0cmluZyxcbiAgICBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZnJvbUlkOiBzdHJpbmcsXG4gICAgdG9JZDogc3RyaW5nXG4gICkge1xuICAgIGNvbnN0IGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgIGRvYyxcbiAgICAgIGRvYyxcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSByZW1vdmUgd2FzXG4gIC8vIHN1Y2Nlc3NmdWwuXG4gIHJlbW92ZVJlbGF0aW9uKFxuICAgIGtleTogc3RyaW5nLFxuICAgIGZyb21DbGFzc05hbWU6IHN0cmluZyxcbiAgICBmcm9tSWQ6IHN0cmluZyxcbiAgICB0b0lkOiBzdHJpbmdcbiAgKSB7XG4gICAgdmFyIGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICBkb2MsXG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCBjYXJlIGlmIHRoZXkgdHJ5IHRvIGRlbGV0ZSBhIG5vbi1leGlzdGVudCByZWxhdGlvbi5cbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBvYmplY3RzIG1hdGNoZXMgdGhpcyBxdWVyeSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgd2FzXG4gIC8vIGRlbGV0ZWQuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuICAvLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4gIC8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG4gIGRlc3Ryb3koXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKFxuICAgICAgc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnZGVsZXRlJylcbiAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICdkZWxldGUnLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gZGVsZXRlIGJ5IHF1ZXJ5XG4gICAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgdGhpcy5za2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZCk7XG4gICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHBhcnNlRm9ybWF0U2NoZW1hID0+XG4gICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gV2hlbiBkZWxldGluZyBzZXNzaW9ucyB3aGlsZSBjaGFuZ2luZyBwYXNzd29yZHMsIGRvbid0IHRocm93IGFuIGVycm9yIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbnkgc2Vzc2lvbnMuXG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicgJiZcbiAgICAgICAgICAgICAgICBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICAvLyBJbnNlcnRzIGFuIG9iamVjdCBpbnRvIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgc2F2ZWQuXG4gIGNyZWF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICBjb25zdCBvcmlnaW5hbE9iamVjdCA9IG9iamVjdDtcbiAgICBvYmplY3QgPSB0cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcblxuICAgIG9iamVjdC5jcmVhdGVkQXQgPSB7IGlzbzogb2JqZWN0LmNyZWF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcbiAgICBvYmplY3QudXBkYXRlZEF0ID0geyBpc286IG9iamVjdC51cGRhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG5cbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgY29uc3QgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgbnVsbCxcbiAgICAgIG9iamVjdFxuICAgICk7XG5cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWUpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnY3JlYXRlJylcbiAgICAgICAgKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSkpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKSlcbiAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgICAgICBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlKG9iamVjdCk7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIFNjaGVtYUNvbnRyb2xsZXIuY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShzY2hlbWEpLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsT2JqZWN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBzYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQub3BzWzBdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICBjYW5BZGRGaWVsZChcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBhY2xHcm91cDogc3RyaW5nW11cbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY2xhc3NTY2hlbWEgPSBzY2hlbWEuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgIGlmICghY2xhc3NTY2hlbWEpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcbiAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSBPYmplY3Qua2V5cyhjbGFzc1NjaGVtYS5maWVsZHMpO1xuICAgIGNvbnN0IG5ld0tleXMgPSBmaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIC8vIFNraXAgZmllbGRzIHRoYXQgYXJlIHVuc2V0XG4gICAgICBpZiAoXG4gICAgICAgIG9iamVjdFtmaWVsZF0gJiZcbiAgICAgICAgb2JqZWN0W2ZpZWxkXS5fX29wICYmXG4gICAgICAgIG9iamVjdFtmaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZSdcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2NoZW1hRmllbGRzLmluZGV4T2YoZmllbGQpIDwgMDtcbiAgICB9KTtcbiAgICBpZiAobmV3S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnYWRkRmllbGQnKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV29uJ3QgZGVsZXRlIGNvbGxlY3Rpb25zIGluIHRoZSBzeXN0ZW0gbmFtZXNwYWNlXG4gIC8qKlxuICAgKiBEZWxldGUgYWxsIGNsYXNzZXMgYW5kIGNsZWFycyB0aGUgc2NoZW1hIGNhY2hlXG4gICAqXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gZmFzdCBzZXQgdG8gdHJ1ZSBpZiBpdCdzIG9rIHRvIGp1c3QgZGVsZXRlIHJvd3MgYW5kIG5vdCBpbmRleGVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSB3aGVuIHRoZSBkZWxldGlvbnMgY29tcGxldGVzXG4gICAqL1xuICBkZWxldGVFdmVyeXRoaW5nKGZhc3Q6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8YW55PiB7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZUFsbENsYXNzZXMoZmFzdCksXG4gICAgICB0aGlzLnNjaGVtYUNhY2hlLmNsZWFyKCksXG4gICAgXSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIHJlbGF0ZWQgaWRzIGdpdmVuIGFuIG93bmluZyBpZC5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIHJlbGF0ZWRJZHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgb3duaW5nSWQ6IHN0cmluZyxcbiAgICBxdWVyeU9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPEFycmF5PHN0cmluZz4+IHtcbiAgICBjb25zdCB7IHNraXAsIGxpbWl0LCBzb3J0IH0gPSBxdWVyeU9wdGlvbnM7XG4gICAgY29uc3QgZmluZE9wdGlvbnMgPSB7fTtcbiAgICBpZiAoc29ydCAmJiBzb3J0LmNyZWF0ZWRBdCAmJiB0aGlzLmFkYXB0ZXIuY2FuU29ydE9uSm9pblRhYmxlcykge1xuICAgICAgZmluZE9wdGlvbnMuc29ydCA9IHsgX2lkOiBzb3J0LmNyZWF0ZWRBdCB9O1xuICAgICAgZmluZE9wdGlvbnMubGltaXQgPSBsaW1pdDtcbiAgICAgIGZpbmRPcHRpb25zLnNraXAgPSBza2lwO1xuICAgICAgcXVlcnlPcHRpb25zLnNraXAgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChcbiAgICAgICAgam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICB7IG93bmluZ0lkIH0sXG4gICAgICAgIGZpbmRPcHRpb25zXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmVsYXRlZElkKSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIG93bmluZyBpZHMgZ2l2ZW4gc29tZSByZWxhdGVkIGlkcy5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIG93bmluZ0lkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICByZWxhdGVkSWRzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoXG4gICAgICAgIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgeyByZWxhdGVkSWQ6IHsgJGluOiByZWxhdGVkSWRzIH0gfSxcbiAgICAgICAge31cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5vd25pbmdJZCkpO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRpbiBvbiByZWxhdGlvbiBmaWVsZHMsIG9yXG4gIC8vIGVxdWFsLXRvLXBvaW50ZXIgY29uc3RyYWludHMgb24gcmVsYXRpb24gZmllbGRzLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBzY2hlbWE6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gU2VhcmNoIGZvciBhbiBpbi1yZWxhdGlvbiBvciBlcXVhbC10by1yZWxhdGlvblxuICAgIC8vIE1ha2UgaXQgc2VxdWVudGlhbCBmb3Igbm93LCBub3Qgc3VyZSBvZiBwYXJhbGxlaXphdGlvbiBzaWRlIGVmZmVjdHNcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICBjb25zdCBvcnMgPSBxdWVyeVsnJG9yJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIG9ycy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oXG4gICAgICAgICAgICBhUXVlcnkgPT4ge1xuICAgICAgICAgICAgICBxdWVyeVsnJG9yJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH0pXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IHByb21pc2VzID0gT2JqZWN0LmtleXMocXVlcnkpLm1hcChrZXkgPT4ge1xuICAgICAgY29uc3QgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKCF0IHx8IHQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIGxldCBxdWVyaWVzOiA/KGFueVtdKSA9IG51bGw7XG4gICAgICBpZiAoXG4gICAgICAgIHF1ZXJ5W2tleV0gJiZcbiAgICAgICAgKHF1ZXJ5W2tleV1bJyRpbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5lJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldLl9fdHlwZSA9PSAnUG9pbnRlcicpXG4gICAgICApIHtcbiAgICAgICAgLy8gQnVpbGQgdGhlIGxpc3Qgb2YgcXVlcmllc1xuICAgICAgICBxdWVyaWVzID0gT2JqZWN0LmtleXMocXVlcnlba2V5XSkubWFwKGNvbnN0cmFpbnRLZXkgPT4ge1xuICAgICAgICAgIGxldCByZWxhdGVkSWRzO1xuICAgICAgICAgIGxldCBpc05lZ2F0aW9uID0gZmFsc2U7XG4gICAgICAgICAgaWYgKGNvbnN0cmFpbnRLZXkgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckaW4nKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJGluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmluJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJG5pbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5lJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV1bJyRuZSddLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaXNOZWdhdGlvbixcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyaWVzID0gW3sgaXNOZWdhdGlvbjogZmFsc2UsIHJlbGF0ZWRJZHM6IFtdIH1dO1xuICAgICAgfVxuXG4gICAgICAvLyByZW1vdmUgdGhlIGN1cnJlbnQgcXVlcnlLZXkgYXMgd2UgZG9uLHQgbmVlZCBpdCBhbnltb3JlXG4gICAgICBkZWxldGUgcXVlcnlba2V5XTtcbiAgICAgIC8vIGV4ZWN1dGUgZWFjaCBxdWVyeSBpbmRlcGVuZGVudGx5IHRvIGJ1aWxkIHRoZSBsaXN0IG9mXG4gICAgICAvLyAkaW4gLyAkbmluXG4gICAgICBjb25zdCBwcm9taXNlcyA9IHF1ZXJpZXMubWFwKHEgPT4ge1xuICAgICAgICBpZiAoIXEpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMub3duaW5nSWRzKGNsYXNzTmFtZSwga2V5LCBxLnJlbGF0ZWRJZHMpLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBpZiAocS5pc05lZ2F0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLmFkZE5vdEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRyZWxhdGVkVG9cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlUmVsYXRpb25LZXlzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgcXVlcnlPcHRpb25zOiBhbnlcbiAgKTogP1Byb21pc2U8dm9pZD4ge1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRvciddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuXG4gICAgdmFyIHJlbGF0ZWRUbyA9IHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgaWYgKHJlbGF0ZWRUbykge1xuICAgICAgcmV0dXJuIHRoaXMucmVsYXRlZElkcyhcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHJlbGF0ZWRUby5rZXksXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3Qub2JqZWN0SWQsXG4gICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgKVxuICAgICAgICAudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICB9XG4gIH1cblxuICBhZGRJbk9iamVjdElkc0lkcyhpZHM6ID9BcnJheTxzdHJpbmc+ID0gbnVsbCwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21TdHJpbmc6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycgPyBbcXVlcnkub2JqZWN0SWRdIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tRXE6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckZXEnXSA/IFtxdWVyeS5vYmplY3RJZFsnJGVxJ11dIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tSW46ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA6IG51bGw7XG5cbiAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICBjb25zdCBhbGxJZHM6IEFycmF5PEFycmF5PHN0cmluZz4+ID0gW1xuICAgICAgaWRzRnJvbVN0cmluZyxcbiAgICAgIGlkc0Zyb21FcSxcbiAgICAgIGlkc0Zyb21JbixcbiAgICAgIGlkcyxcbiAgICBdLmZpbHRlcihsaXN0ID0+IGxpc3QgIT09IG51bGwpO1xuICAgIGNvbnN0IHRvdGFsTGVuZ3RoID0gYWxsSWRzLnJlZHVjZSgobWVtbywgbGlzdCkgPT4gbWVtbyArIGxpc3QubGVuZ3RoLCAwKTtcblxuICAgIGxldCBpZHNJbnRlcnNlY3Rpb24gPSBbXTtcbiAgICBpZiAodG90YWxMZW5ndGggPiAxMjUpIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdC5iaWcoYWxsSWRzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0KGFsbElkcyk7XG4gICAgfVxuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG4gICAgcXVlcnkub2JqZWN0SWRbJyRpbiddID0gaWRzSW50ZXJzZWN0aW9uO1xuXG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzOiBzdHJpbmdbXSA9IFtdLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbU5pbiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJG5pbiddID8gcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA6IFtdO1xuICAgIGxldCBhbGxJZHMgPSBbLi4uaWRzRnJvbU5pbiwgLi4uaWRzXS5maWx0ZXIobGlzdCA9PiBsaXN0ICE9PSBudWxsKTtcblxuICAgIC8vIG1ha2UgYSBzZXQgYW5kIHNwcmVhZCB0byByZW1vdmUgZHVwbGljYXRlc1xuICAgIGFsbElkcyA9IFsuLi5uZXcgU2V0KGFsbElkcyldO1xuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPSBhbGxJZHM7XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gUnVucyBhIHF1ZXJ5IG9uIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhIGxpc3Qgb2YgaXRlbXMuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgc2tpcCAgICBudW1iZXIgb2YgcmVzdWx0cyB0byBza2lwLlxuICAvLyAgIGxpbWl0ICAgbGltaXQgdG8gdGhpcyBudW1iZXIgb2YgcmVzdWx0cy5cbiAgLy8gICBzb3J0ICAgIGFuIG9iamVjdCB3aGVyZSBrZXlzIGFyZSB0aGUgZmllbGRzIHRvIHNvcnQgYnkuXG4gIC8vICAgICAgICAgICB0aGUgdmFsdWUgaXMgKzEgZm9yIGFzY2VuZGluZywgLTEgZm9yIGRlc2NlbmRpbmcuXG4gIC8vICAgY291bnQgICBydW4gYSBjb3VudCBpbnN0ZWFkIG9mIHJldHVybmluZyByZXN1bHRzLlxuICAvLyAgIGFjbCAgICAgcmVzdHJpY3QgdGhpcyBvcGVyYXRpb24gd2l0aCBhbiBBQ0wgZm9yIHRoZSBwcm92aWRlZCBhcnJheVxuICAvLyAgICAgICAgICAgb2YgdXNlciBvYmplY3RJZHMgYW5kIHJvbGVzLiBhY2w6IG51bGwgbWVhbnMgbm8gdXNlci5cbiAgLy8gICAgICAgICAgIHdoZW4gdGhpcyBmaWVsZCBpcyBub3QgcHJlc2VudCwgZG9uJ3QgZG8gYW55dGhpbmcgcmVnYXJkaW5nIEFDTHMuXG4gIC8vIFRPRE86IG1ha2UgdXNlcklkcyBub3QgbmVlZGVkIGhlcmUuIFRoZSBkYiBhZGFwdGVyIHNob3VsZG4ndCBrbm93XG4gIC8vIGFueXRoaW5nIGFib3V0IHVzZXJzLCBpZGVhbGx5LiBUaGVuLCBpbXByb3ZlIHRoZSBmb3JtYXQgb2YgdGhlIEFDTFxuICAvLyBhcmcgdG8gd29yayBsaWtlIHRoZSBvdGhlcnMuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBhY2wsXG4gICAgICBzb3J0ID0ge30sXG4gICAgICBjb3VudCxcbiAgICAgIGtleXMsXG4gICAgICBvcCxcbiAgICAgIGRpc3RpbmN0LFxuICAgICAgcGlwZWxpbmUsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgIGhpbnQsXG4gICAgICBleHBsYWluLFxuICAgIH06IGFueSA9IHt9LFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBvcCA9XG4gICAgICBvcCB8fFxuICAgICAgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PSAnc3RyaW5nJyAmJiBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAxXG4gICAgICAgID8gJ2dldCdcbiAgICAgICAgOiAnZmluZCcpO1xuICAgIC8vIENvdW50IG9wZXJhdGlvbiBpZiBjb3VudGluZ1xuICAgIG9wID0gY291bnQgPT09IHRydWUgPyAnY291bnQnIDogb3A7XG5cbiAgICBsZXQgY2xhc3NFeGlzdHMgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oXG4gICAgICBzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgLy9BbGxvdyB2b2xhdGlsZSBjbGFzc2VzIGlmIHF1ZXJ5aW5nIHdpdGggTWFzdGVyIChmb3IgX1B1c2hTdGF0dXMpXG4gICAgICAgIC8vVE9ETzogTW92ZSB2b2xhdGlsZSBjbGFzc2VzIGNvbmNlcHQgaW50byBtb25nbyBhZGFwdGVyLCBwb3N0Z3JlcyBhZGFwdGVyIHNob3VsZG4ndCBjYXJlXG4gICAgICAgIC8vdGhhdCBhcGkucGFyc2UuY29tIGJyZWFrcyB3aGVuIF9QdXNoU3RhdHVzIGV4aXN0cyBpbiBtb25nby5cbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgaXNNYXN0ZXIpXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIEJlaGF2aW9yIGZvciBub24tZXhpc3RlbnQgY2xhc3NlcyBpcyBraW5kYSB3ZWlyZCBvbiBQYXJzZS5jb20uIFByb2JhYmx5IGRvZXNuJ3QgbWF0dGVyIHRvbyBtdWNoLlxuICAgICAgICAgICAgLy8gRm9yIG5vdywgcHJldGVuZCB0aGUgY2xhc3MgZXhpc3RzIGJ1dCBoYXMgbm8gb2JqZWN0cyxcbiAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgIGNsYXNzRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgIC8vIFBhcnNlLmNvbSB0cmVhdHMgcXVlcmllcyBvbiBfY3JlYXRlZF9hdCBhbmQgX3VwZGF0ZWRfYXQgYXMgaWYgdGhleSB3ZXJlIHF1ZXJpZXMgb24gY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQsXG4gICAgICAgICAgICAvLyBzbyBkdXBsaWNhdGUgdGhhdCBiZWhhdmlvciBoZXJlLiBJZiBib3RoIGFyZSBzcGVjaWZpZWQsIHRoZSBjb3JyZWN0IGJlaGF2aW9yIHRvIG1hdGNoIFBhcnNlLmNvbSBpcyB0b1xuICAgICAgICAgICAgLy8gdXNlIHRoZSBvbmUgdGhhdCBhcHBlYXJzIGZpcnN0IGluIHRoZSBzb3J0IGxpc3QuXG4gICAgICAgICAgICBpZiAoc29ydC5fY3JlYXRlZF9hdCkge1xuICAgICAgICAgICAgICBzb3J0LmNyZWF0ZWRBdCA9IHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNvcnQuX3VwZGF0ZWRfYXQpIHtcbiAgICAgICAgICAgICAgc29ydC51cGRhdGVkQXQgPSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgICAgICBkZWxldGUgc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHF1ZXJ5T3B0aW9ucyA9IHtcbiAgICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICAgIHNvcnQsXG4gICAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgICBleHBsYWluLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIE9iamVjdC5rZXlzKHNvcnQpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgYENhbm5vdCBzb3J0IGJ5ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfS5gXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCBvcClcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgICAgICAgICB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgICAgICAgICB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hQ29udHJvbGxlcilcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IHByb3RlY3RlZEZpZWxkcztcbiAgICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAvKiBEb24ndCB1c2UgcHJvamVjdGlvbnMgdG8gb3B0aW1pemUgdGhlIHByb3RlY3RlZEZpZWxkcyBzaW5jZSB0aGUgcHJvdGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICBiYXNlZCBvbiBwb2ludGVyLXBlcm1pc3Npb25zIGFyZSBkZXRlcm1pbmVkIGFmdGVyIHF1ZXJ5aW5nLiBUaGUgZmlsdGVyaW5nIGNhblxuICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlIHRoZSBwcm90ZWN0ZWQgZmllbGRzLiAqL1xuICAgICAgICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gdGhpcy5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICBhdXRoXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgICBpZiAob3AgPT09ICdnZXQnKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgICAgaWYgKG9wID09PSAndXBkYXRlJyB8fCBvcCA9PT0gJ2RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIHRoaXMuc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmQpO1xuICAgICAgICAgICAgICAgIGlmIChjb3VudCkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY291bnQoXG4gICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgICAgaGludFxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZGlzdGluY3QpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kaXN0aW5jdChcbiAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICAgIGRpc3RpbmN0XG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwaXBlbGluZSkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFnZ3JlZ2F0ZShcbiAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICAgIHBpcGVsaW5lLFxuICAgICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICAgICAgICAgICAgZXhwbGFpblxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXhwbGFpbikge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgICAgICAgICAgICAgICAuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucylcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4ob2JqZWN0cyA9PlxuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3QgPSB1bnRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBvYmplY3RcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yXG4gICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgZGVsZXRlU2NoZW1hKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICB0aGlzLmFkYXB0ZXIuY291bnQoY2xhc3NOYW1lLCB7IGZpZWxkczoge30gfSwgbnVsbCwgJycsIGZhbHNlKVxuICAgICAgICAgIClcbiAgICAgICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgICAgICBpZiAoY291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAyNTUsXG4gICAgICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBpcyBub3QgZW1wdHksIGNvbnRhaW5zICR7Y291bnR9IG9iamVjdHMsIGNhbm5vdCBkcm9wIHNjaGVtYS5gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGNsYXNzTmFtZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbih3YXNQYXJzZUNvbGxlY3Rpb24gPT4ge1xuICAgICAgICAgICAgaWYgKHdhc1BhcnNlQ29sbGVjdGlvbikge1xuICAgICAgICAgICAgICBjb25zdCByZWxhdGlvbkZpZWxkTmFtZXMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5maWx0ZXIoXG4gICAgICAgICAgICAgICAgZmllbGROYW1lID0+IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgICAgICAgICByZWxhdGlvbkZpZWxkTmFtZXMubWFwKG5hbWUgPT5cbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwgbmFtZSkpXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdXG4gICkge1xuICAgIC8vIENoZWNrIGlmIGNsYXNzIGhhcyBwdWJsaWMgcGVybWlzc2lvbiBmb3Igb3BlcmF0aW9uXG4gICAgLy8gSWYgdGhlIEJhc2VDTFAgcGFzcywgbGV0IGdvIHRocm91Z2hcbiAgICBpZiAoc2NoZW1hLnRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWUsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuICAgIGNvbnN0IGZpZWxkID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMVxuICAgICAgICA/ICdyZWFkVXNlckZpZWxkcydcbiAgICAgICAgOiAnd3JpdGVVc2VyRmllbGRzJztcbiAgICBjb25zdCB1c2VyQUNMID0gYWNsR3JvdXAuZmlsdGVyKGFjbCA9PiB7XG4gICAgICByZXR1cm4gYWNsLmluZGV4T2YoJ3JvbGU6JykgIT0gMCAmJiBhY2wgIT0gJyonO1xuICAgIH0pO1xuICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICBpZiAocGVybXMgJiYgcGVybXNbZmllbGRdICYmIHBlcm1zW2ZpZWxkXS5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBObyB1c2VyIHNldCByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAvLyBJZiB0aGUgbGVuZ3RoIGlzID4gMSwgdGhhdCBtZWFucyB3ZSBkaWRuJ3QgZGUtZHVwZSB1c2VycyBjb3JyZWN0bHlcbiAgICAgIGlmICh1c2VyQUNMLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXJJZCA9IHVzZXJBQ0xbMF07XG4gICAgICBjb25zdCB1c2VyUG9pbnRlciA9IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHBlcm1GaWVsZHMgPSBwZXJtc1tmaWVsZF07XG4gICAgICBjb25zdCBvcnMgPSBwZXJtRmllbGRzLmZsYXRNYXAoa2V5ID0+IHtcbiAgICAgICAgLy8gY29uc3RyYWludCBmb3Igc2luZ2xlIHBvaW50ZXIgc2V0dXBcbiAgICAgICAgY29uc3QgcSA9IHtcbiAgICAgICAgICBba2V5XTogdXNlclBvaW50ZXIsXG4gICAgICAgIH07XG4gICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHVzZXJzLWFycmF5IHNldHVwXG4gICAgICAgIGNvbnN0IHFhID0ge1xuICAgICAgICAgIFtrZXldOiB7ICRhbGw6IFt1c2VyUG9pbnRlcl0gfSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgY29uc3RyYWludCBvbiB0aGUga2V5LCB1c2UgdGhlICRhbmRcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChxdWVyeSwga2V5KSkge1xuICAgICAgICAgIHJldHVybiBbeyAkYW5kOiBbcSwgcXVlcnldIH0sIHsgJGFuZDogW3FhLCBxdWVyeV0gfV07XG4gICAgICAgIH1cbiAgICAgICAgLy8gb3RoZXJ3aXNlIGp1c3QgYWRkIHRoZSBjb25zdGFpbnRcbiAgICAgICAgcmV0dXJuIFtPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgcSksIE9iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCBxYSldO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4geyAkb3I6IG9ycyB9O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICB9XG5cbiAgYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnkgPSB7fSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXSxcbiAgICBhdXRoOiBhbnkgPSB7fVxuICApIHtcbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXBlcm1zKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IHBlcm1zLnByb3RlY3RlZEZpZWxkcztcbiAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoYWNsR3JvdXAuaW5kZXhPZihxdWVyeS5vYmplY3RJZCkgPiAtMSkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyByZW1vdmUgdXNlckZpZWxkIGtleXMgc2luY2UgdGhleSBhcmUgZmlsdGVyZWQgYWZ0ZXIgcXVlcnlpbmdcbiAgICBsZXQgcHJvdGVjdGVkS2V5cyA9IE9iamVjdC5rZXlzKHByb3RlY3RlZEZpZWxkcykucmVkdWNlKChhY2MsIHZhbCkgPT4ge1xuICAgICAgaWYgKHZhbC5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpIHJldHVybiBhY2M7XG4gICAgICByZXR1cm4gYWNjLmNvbmNhdChwcm90ZWN0ZWRGaWVsZHNbdmFsXSk7XG4gICAgfSwgW10pO1xuXG4gICAgWy4uLihhdXRoLnVzZXJSb2xlcyB8fCBbXSldLmZvckVhY2gocm9sZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHNbcm9sZV07XG4gICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvdGVjdGVkS2V5cztcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5jcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpXG4gICAgICAudGhlbih0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9PiB7XG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gdHJhbnNhY3Rpb25hbFNlc3Npb247XG4gICAgICB9KTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGNvbW1pdCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgICAgIH0pO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBhYm9ydCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbilcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBUT0RPOiBjcmVhdGUgaW5kZXhlcyBvbiBmaXJzdCBjcmVhdGlvbiBvZiBhIF9Vc2VyIG9iamVjdC4gT3RoZXJ3aXNlIGl0J3MgaW1wb3NzaWJsZSB0b1xuICAvLyBoYXZlIGEgUGFyc2UgYXBwIHdpdGhvdXQgaXQgaGF2aW5nIGEgX1VzZXIgY29sbGVjdGlvbi5cbiAgcGVyZm9ybUluaXRpYWxpemF0aW9uKCkge1xuICAgIGNvbnN0IHJlcXVpcmVkVXNlckZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Vc2VyLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkUm9sZUZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Sb2xlLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgY29uc3QgdXNlckNsYXNzUHJvbWlzZSA9IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+XG4gICAgICBzY2hlbWEuZW5mb3JjZUNsYXNzRXhpc3RzKCdfVXNlcicpXG4gICAgKTtcbiAgICBjb25zdCByb2xlQ2xhc3NQcm9taXNlID0gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT5cbiAgICAgIHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Sb2xlJylcbiAgICApO1xuXG4gICAgY29uc3QgdXNlcm5hbWVVbmlxdWVuZXNzID0gdXNlckNsYXNzUHJvbWlzZVxuICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VybmFtZXM6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcblxuICAgIGNvbnN0IGVtYWlsVW5pcXVlbmVzcyA9IHVzZXJDbGFzc1Byb21pc2VcbiAgICAgIC50aGVuKCgpID0+XG4gICAgICAgIHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlciBlbWFpbCBhZGRyZXNzZXM6ICcsXG4gICAgICAgICAgZXJyb3JcbiAgICAgICAgKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcblxuICAgIGNvbnN0IHJvbGVVbmlxdWVuZXNzID0gcm9sZUNsYXNzUHJvbWlzZVxuICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Sb2xlJywgcmVxdWlyZWRSb2xlRmllbGRzLCBbJ25hbWUnXSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHJvbGUgbmFtZTogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgaW5kZXhQcm9taXNlID0gdGhpcy5hZGFwdGVyLnVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk7XG5cbiAgICAvLyBDcmVhdGUgdGFibGVzIGZvciB2b2xhdGlsZSBjbGFzc2VzXG4gICAgY29uc3QgYWRhcHRlckluaXQgPSB0aGlzLmFkYXB0ZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKHtcbiAgICAgIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXM6IFNjaGVtYUNvbnRyb2xsZXIuVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgICB9KTtcbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoW1xuICAgICAgdXNlcm5hbWVVbmlxdWVuZXNzLFxuICAgICAgZW1haWxVbmlxdWVuZXNzLFxuICAgICAgcm9sZVVuaXF1ZW5lc3MsXG4gICAgICBhZGFwdGVySW5pdCxcbiAgICAgIGluZGV4UHJvbWlzZSxcbiAgICBdKTtcbiAgfVxuXG4gIHN0YXRpYyBfdmFsaWRhdGVRdWVyeTogKGFueSwgYm9vbGVhbikgPT4gdm9pZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBEYXRhYmFzZUNvbnRyb2xsZXI7XG4vLyBFeHBvc2UgdmFsaWRhdGVRdWVyeSBmb3IgdGVzdHNcbm1vZHVsZS5leHBvcnRzLl92YWxpZGF0ZVF1ZXJ5ID0gdmFsaWRhdGVRdWVyeTtcbiJdfQ==