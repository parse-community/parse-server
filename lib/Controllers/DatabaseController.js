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
          newProtectedFields.push(pointerPerm.value);
        }
      }); // if at least one pointer-permission affected the current user
      // intersect vs protectedFields from previous stage (@see addProtectedFields)
      // Sets theory (intersections): A x (B x C) == (A x B) x C

      if (overrideProtectedFields && protectedFields) {
        newProtectedFields.push(protectedFields);
      } // intersect all sets of protectedFields


      newProtectedFields.forEach(fields => {
        if (fields) {
          // if there're no protctedFields by other criteria ( id / role / auth)
          // then we must intersect each set (per userField)
          if (!protectedFields) {
            protectedFields = fields;
          } else {
            protectedFields = protectedFields.filter(v => fields.includes(v));
          }
        }
      });
    }
  }

  const isUserClass = className === '_User';
  /* special treat for the user class: don't filter protectedFields if currently loggedin user is
  the retrieved user */

  if (!(isUserClass && userId && object.objectId === userId)) {
    protectedFields && protectedFields.forEach(k => delete object[k]); // fields not requested by client (excluded),
    //but were needed to apply protecttedFields

    perms.protectedFields && perms.protectedFields.temporaryKeys && perms.protectedFields.temporaryKeys.forEach(k => delete object[k]);
  }

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


  validateObject(className, object, query, runOptions) {
    let schema;
    const acl = runOptions.acl;
    const isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchema().then(s => {
      schema = s;

      if (isMaster) {
        return Promise.resolve();
      }

      return this.canAddField(schema, className, object, aclGroup, runOptions);
    }).then(() => {
      return schema.validateObject(className, object, query);
    });
  }

  update(className, query, update, {
    acl,
    many,
    upsert,
    addsField
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

          if (addsField) {
            query = {
              $and: [query, this.addPointerPermissions(schemaController, className, 'addField', query, aclGroup)]
            };
          }
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

  canAddField(schema, className, object, aclGroup, runOptions) {
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
      // adds a marker that new field is being adding during update
      runOptions.addsField = true;
      const action = runOptions.action;
      return schema.validatePermission(className, aclGroup, 'addField', action);
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
  //  caseInsensitive make string comparisons case insensitive
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
    caseInsensitive = false,
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
          caseInsensitive,
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

            protectedFields = this.addProtectedFields(schemaController, className, query, aclGroup, auth, queryOptions);
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
  } // Constraints query using CLP's pointer permissions (PP) if any.
  // 1. Etract the user id from caller's ACLgroup;
  // 2. Exctract a list of field names that are PP for target collection and operation;
  // 3. Constraint the original query so that each PP field must
  // point to caller's id (or contain it in case of PP field being an array)


  addPointerPermissions(schema, className, operation, query, aclGroup = []) {
    // Check if class has public permission for operation
    // If the BaseCLP pass, let go through
    if (schema.testPermissionsForClassName(className, aclGroup, operation)) {
      return query;
    }

    const perms = schema.getClassLevelPermissions(className);
    const userACL = aclGroup.filter(acl => {
      return acl.indexOf('role:') != 0 && acl != '*';
    });
    const groupKey = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';
    const permFields = [];

    if (perms[operation] && perms[operation].pointerFields) {
      permFields.push(...perms[operation].pointerFields);
    }

    if (perms[groupKey]) {
      for (const field of perms[groupKey]) {
        if (!permFields.includes(field)) {
          permFields.push(field);
        }
      }
    } // the ACL should have exactly 1 user


    if (permFields.length > 0) {
      // the ACL should have exactly 1 user
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

  addProtectedFields(schema, className, query = {}, aclGroup = [], auth = {}, queryOptions = {}) {
    const perms = schema.getClassLevelPermissions(className);
    if (!perms) return null;
    const protectedFields = perms.protectedFields;
    if (!protectedFields) return null;
    if (aclGroup.indexOf(query.objectId) > -1) return null; // for queries where "keys" are set and do not include all 'userField':{field},
    // we have to transparently include it, and then remove before returning to client
    // Because if such key not projected the permission won't be enforced properly
    // PS this is called when 'excludeKeys' already reduced to 'keys'

    const preserveKeys = queryOptions.keys; // these are keys that need to be included only
    // to be able to apply protectedFields by pointer
    // and then unset before returning to client (later in  filterSensitiveFields)

    const serverOnlyKeys = [];
    const authenticated = auth.user; // map to allow check without array search

    const roles = (auth.userRoles || []).reduce((acc, r) => {
      acc[r] = protectedFields[r];
      return acc;
    }, {}); // array of sets of protected fields. separate item for each applicable criteria

    const protectedKeysSets = [];

    for (const key in protectedFields) {
      // skip userFields
      if (key.startsWith('userField:')) {
        if (preserveKeys) {
          const fieldName = key.substring(10);

          if (!preserveKeys.includes(fieldName)) {
            // 1. put it there temporarily
            queryOptions.keys && queryOptions.keys.push(fieldName); // 2. preserve it delete later

            serverOnlyKeys.push(fieldName);
          }
        }

        continue;
      } // add public tier


      if (key === '*') {
        protectedKeysSets.push(protectedFields[key]);
        continue;
      }

      if (authenticated) {
        if (key === 'authenticated') {
          // for logged in users
          protectedKeysSets.push(protectedFields[key]);
          continue;
        }

        if (roles[key] && key.startsWith('role:')) {
          // add applicable roles
          protectedKeysSets.push(roles[key]);
        }
      }
    } // check if there's a rule for current user's id


    if (authenticated) {
      const userId = auth.user.id;

      if (perms.protectedFields[userId]) {
        protectedKeysSets.push(perms.protectedFields[userId]);
      }
    } // preserve fields to be removed before sending response to client


    if (serverOnlyKeys.length > 0) {
      perms.protectedFields.temporaryKeys = serverOnlyKeys;
    }

    let protectedKeys = protectedKeysSets.reduce((acc, next) => {
      if (next) {
        acc.push(...next);
      }

      return acc;
    }, []); // intersect all sets of protectedFields

    protectedKeysSets.forEach(fields => {
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
    const usernameCaseInsensitiveIndex = userClassPromise.then(() => this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true)).catch(error => {
      _logger.default.warn('Unable to create case insensitive username index: ', error);

      throw error;
    });
    const emailUniqueness = userClassPromise.then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['email'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);

      throw error;
    });
    const emailCaseInsensitiveIndex = userClassPromise.then(() => this.adapter.ensureIndex('_User', requiredUserFields, ['email'], 'case_insensitive_email', true)).catch(error => {
      _logger.default.warn('Unable to create case insensitive email index: ', error);

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
    return Promise.all([usernameUniqueness, usernameCaseInsensitiveIndex, emailUniqueness, emailCaseInsensitiveIndex, roleUniqueness, adapterInit, indexPromise]);
  }

}

module.exports = DatabaseController; // Expose validateQuery for tests

module.exports._validateQuery = validateQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwibmFtZXMiOlsiYWRkV3JpdGVBQ0wiLCJxdWVyeSIsImFjbCIsIm5ld1F1ZXJ5IiwiXyIsImNsb25lRGVlcCIsIl93cGVybSIsIiRpbiIsImFkZFJlYWRBQ0wiLCJfcnBlcm0iLCJ0cmFuc2Zvcm1PYmplY3RBQ0wiLCJBQ0wiLCJyZXN1bHQiLCJlbnRyeSIsInJlYWQiLCJwdXNoIiwid3JpdGUiLCJzcGVjaWFsUXVlcnlrZXlzIiwiaXNTcGVjaWFsUXVlcnlLZXkiLCJrZXkiLCJpbmRleE9mIiwidmFsaWRhdGVRdWVyeSIsInNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsImZvckVhY2giLCJlbCIsIk9iamVjdCIsImtleXMiLCJub0NvbGxpc2lvbnMiLCJzb21lIiwic3VicSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImhhc05lYXJzIiwic3VicXVlcnkiLCIkYW5kIiwiJG5vciIsImxlbmd0aCIsIiRyZWdleCIsIiRvcHRpb25zIiwibWF0Y2giLCJJTlZBTElEX0tFWV9OQU1FIiwiZmlsdGVyU2Vuc2l0aXZlRGF0YSIsImlzTWFzdGVyIiwiYWNsR3JvdXAiLCJhdXRoIiwib3BlcmF0aW9uIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwicHJvdGVjdGVkRmllbGRzIiwib2JqZWN0IiwidXNlcklkIiwidXNlciIsImlkIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1JlYWRPcGVyYXRpb24iLCJwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybSIsImZpbHRlciIsInN0YXJ0c1dpdGgiLCJtYXAiLCJzdWJzdHJpbmciLCJ2YWx1ZSIsIm5ld1Byb3RlY3RlZEZpZWxkcyIsIm92ZXJyaWRlUHJvdGVjdGVkRmllbGRzIiwicG9pbnRlclBlcm0iLCJwb2ludGVyUGVybUluY2x1ZGVzVXNlciIsInJlYWRVc2VyRmllbGRWYWx1ZSIsImlzQXJyYXkiLCJvYmplY3RJZCIsImZpZWxkcyIsInYiLCJpbmNsdWRlcyIsImlzVXNlckNsYXNzIiwiayIsInRlbXBvcmFyeUtleXMiLCJwYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJzZXNzaW9uVG9rZW4iLCJfZW1haWxfdmVyaWZ5X3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3RvbWJzdG9uZSIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIl9wYXNzd29yZF9oaXN0b3J5IiwiYXV0aERhdGEiLCJzcGVjaWFsS2V5c0ZvclVwZGF0ZSIsImlzU3BlY2lhbFVwZGF0ZUtleSIsImV4cGFuZFJlc3VsdE9uS2V5UGF0aCIsInBhdGgiLCJzcGxpdCIsImZpcnN0S2V5IiwibmV4dFBhdGgiLCJzbGljZSIsImpvaW4iLCJzYW5pdGl6ZURhdGFiYXNlUmVzdWx0Iiwib3JpZ2luYWxPYmplY3QiLCJyZXNwb25zZSIsIlByb21pc2UiLCJyZXNvbHZlIiwia2V5VXBkYXRlIiwiX19vcCIsImpvaW5UYWJsZU5hbWUiLCJmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlIiwiYW1vdW50IiwiSU5WQUxJRF9KU09OIiwib2JqZWN0cyIsIkNPTU1BTkRfVU5BVkFJTEFCTEUiLCJ0cmFuc2Zvcm1BdXRoRGF0YSIsInByb3ZpZGVyIiwicHJvdmlkZXJEYXRhIiwiZmllbGROYW1lIiwidHlwZSIsInVudHJhbnNmb3JtT2JqZWN0QUNMIiwib3V0cHV0IiwiZ2V0Um9vdEZpZWxkTmFtZSIsInJlbGF0aW9uU2NoZW1hIiwicmVsYXRlZElkIiwib3duaW5nSWQiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFkYXB0ZXIiLCJzY2hlbWFDYWNoZSIsInNjaGVtYVByb21pc2UiLCJfdHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2xsZWN0aW9uRXhpc3RzIiwiY2xhc3NFeGlzdHMiLCJwdXJnZUNvbGxlY3Rpb24iLCJsb2FkU2NoZW1hIiwidGhlbiIsInNjaGVtYUNvbnRyb2xsZXIiLCJnZXRPbmVTY2hlbWEiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsInZhbGlkYXRlQ2xhc3NOYW1lIiwiU2NoZW1hQ29udHJvbGxlciIsImNsYXNzTmFtZUlzVmFsaWQiLCJyZWplY3QiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJvcHRpb25zIiwiY2xlYXJDYWNoZSIsImxvYWQiLCJsb2FkU2NoZW1hSWZOZWVkZWQiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInQiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsInVuZGVmaW5lZCIsInMiLCJjYW5BZGRGaWVsZCIsInVwZGF0ZSIsIm1hbnkiLCJ1cHNlcnQiLCJhZGRzRmllbGQiLCJza2lwU2FuaXRpemF0aW9uIiwidmFsaWRhdGVPbmx5IiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwib3JpZ2luYWxRdWVyeSIsIm9yaWdpbmFsVXBkYXRlIiwicmVsYXRpb25VcGRhdGVzIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiY29sbGVjdFJlbGF0aW9uVXBkYXRlcyIsImFkZFBvaW50ZXJQZXJtaXNzaW9ucyIsImNhdGNoIiwiZXJyb3IiLCJyb290RmllbGROYW1lIiwiZmllbGROYW1lSXNWYWxpZCIsInVwZGF0ZU9wZXJhdGlvbiIsImlubmVyS2V5IiwiSU5WQUxJRF9ORVNURURfS0VZIiwiZmluZCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwc2VydE9uZU9iamVjdCIsImZpbmRPbmVBbmRVcGRhdGUiLCJoYW5kbGVSZWxhdGlvblVwZGF0ZXMiLCJvcHMiLCJkZWxldGVNZSIsInByb2Nlc3MiLCJvcCIsIngiLCJwZW5kaW5nIiwiYWRkUmVsYXRpb24iLCJyZW1vdmVSZWxhdGlvbiIsImFsbCIsImZyb21DbGFzc05hbWUiLCJmcm9tSWQiLCJ0b0lkIiwiZG9jIiwiY29kZSIsImRlc3Ryb3kiLCJwYXJzZUZvcm1hdFNjaGVtYSIsImNyZWF0ZSIsImNyZWF0ZWRBdCIsImlzbyIsIl9fdHlwZSIsInVwZGF0ZWRBdCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImNyZWF0ZU9iamVjdCIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJjbGFzc1NjaGVtYSIsInNjaGVtYURhdGEiLCJzY2hlbWFGaWVsZHMiLCJuZXdLZXlzIiwiZmllbGQiLCJhY3Rpb24iLCJkZWxldGVFdmVyeXRoaW5nIiwiZmFzdCIsImRlbGV0ZUFsbENsYXNzZXMiLCJjbGVhciIsInJlbGF0ZWRJZHMiLCJxdWVyeU9wdGlvbnMiLCJza2lwIiwibGltaXQiLCJzb3J0IiwiZmluZE9wdGlvbnMiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwiX2lkIiwicmVzdWx0cyIsIm93bmluZ0lkcyIsInJlZHVjZUluUmVsYXRpb24iLCJvcnMiLCJhUXVlcnkiLCJpbmRleCIsInByb21pc2VzIiwicXVlcmllcyIsImNvbnN0cmFpbnRLZXkiLCJpc05lZ2F0aW9uIiwiciIsInEiLCJpZHMiLCJhZGROb3RJbk9iamVjdElkc0lkcyIsImFkZEluT2JqZWN0SWRzSWRzIiwicmVkdWNlUmVsYXRpb25LZXlzIiwicmVsYXRlZFRvIiwiaWRzRnJvbVN0cmluZyIsImlkc0Zyb21FcSIsImlkc0Zyb21JbiIsImFsbElkcyIsImxpc3QiLCJ0b3RhbExlbmd0aCIsInJlZHVjZSIsIm1lbW8iLCJpZHNJbnRlcnNlY3Rpb24iLCJpbnRlcnNlY3QiLCJiaWciLCIkZXEiLCJpZHNGcm9tTmluIiwiU2V0IiwiJG5pbiIsImNvdW50IiwiZGlzdGluY3QiLCJwaXBlbGluZSIsInJlYWRQcmVmZXJlbmNlIiwiaGludCIsImNhc2VJbnNlbnNpdGl2ZSIsImV4cGxhaW4iLCJfY3JlYXRlZF9hdCIsIl91cGRhdGVkX2F0IiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiYWdncmVnYXRlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZGVsZXRlU2NoZW1hIiwiZGVsZXRlQ2xhc3MiLCJ3YXNQYXJzZUNvbGxlY3Rpb24iLCJyZWxhdGlvbkZpZWxkTmFtZXMiLCJuYW1lIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwidXNlckFDTCIsImdyb3VwS2V5IiwicGVybUZpZWxkcyIsInBvaW50ZXJGaWVsZHMiLCJ1c2VyUG9pbnRlciIsImZsYXRNYXAiLCJxYSIsIiRhbGwiLCJhc3NpZ24iLCJwcmVzZXJ2ZUtleXMiLCJzZXJ2ZXJPbmx5S2V5cyIsImF1dGhlbnRpY2F0ZWQiLCJyb2xlcyIsInVzZXJSb2xlcyIsImFjYyIsInByb3RlY3RlZEtleXNTZXRzIiwicHJvdGVjdGVkS2V5cyIsIm5leHQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwicmVxdWlyZWRVc2VyRmllbGRzIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsIl9Vc2VyIiwicmVxdWlyZWRSb2xlRmllbGRzIiwiX1JvbGUiLCJ1c2VyQ2xhc3NQcm9taXNlIiwicm9sZUNsYXNzUHJvbWlzZSIsInVzZXJuYW1lVW5pcXVlbmVzcyIsImVuc3VyZVVuaXF1ZW5lc3MiLCJsb2dnZXIiLCJ3YXJuIiwidXNlcm5hbWVDYXNlSW5zZW5zaXRpdmVJbmRleCIsImVuc3VyZUluZGV4IiwiZW1haWxVbmlxdWVuZXNzIiwiZW1haWxDYXNlSW5zZW5zaXRpdmVJbmRleCIsInJvbGVVbmlxdWVuZXNzIiwiaW5kZXhQcm9taXNlIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJhZGFwdGVySW5pdCIsIlZvbGF0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SSxzQkFBT0MsSUFBUCxDQUFZLGlEQUFaLEVBQStEMUksS0FBL0Q7O0FBQ0EsWUFBTUEsS0FBTjtBQUNELEtBYitCLENBQWxDO0FBZUEsVUFBTStJLGNBQWMsR0FBR1QsZ0JBQWdCLENBQ3BDMUssSUFEb0IsQ0FDZixNQUNKLEtBQUtSLE9BQUwsQ0FBYW9MLGdCQUFiLENBQThCLE9BQTlCLEVBQXVDTCxrQkFBdkMsRUFBMkQsQ0FBQyxNQUFELENBQTNELENBRm1CLEVBSXBCcEksS0FKb0IsQ0FJZEMsS0FBSyxJQUFJO0FBQ2R5SSxzQkFBT0MsSUFBUCxDQUFZLDZDQUFaLEVBQTJEMUksS0FBM0Q7O0FBQ0EsWUFBTUEsS0FBTjtBQUNELEtBUG9CLENBQXZCO0FBU0EsVUFBTWdKLFlBQVksR0FBRyxLQUFLNUwsT0FBTCxDQUFhNkwsdUJBQWIsRUFBckIsQ0FwRnNCLENBc0Z0Qjs7QUFDQSxVQUFNQyxXQUFXLEdBQUcsS0FBSzlMLE9BQUwsQ0FBYTBLLHFCQUFiLENBQW1DO0FBQ3JEcUIsTUFBQUEsc0JBQXNCLEVBQUVsTCxnQkFBZ0IsQ0FBQ2tMO0FBRFksS0FBbkMsQ0FBcEI7QUFHQSxXQUFPdE4sT0FBTyxDQUFDdUYsR0FBUixDQUFZLENBQ2pCbUgsa0JBRGlCLEVBRWpCSSw0QkFGaUIsRUFHakJFLGVBSGlCLEVBSWpCQyx5QkFKaUIsRUFLakJDLGNBTGlCLEVBTWpCRyxXQU5pQixFQU9qQkYsWUFQaUIsQ0FBWixDQUFQO0FBU0Q7O0FBaDRDc0I7O0FBcTRDekJJLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQm5NLGtCQUFqQixDLENBQ0E7O0FBQ0FrTSxNQUFNLENBQUNDLE9BQVAsQ0FBZUMsY0FBZixHQUFnQzlTLGFBQWhDIiwic291cmNlc0NvbnRlbnQiOlsi77u/Ly8gQGZsb3dcbi8vIEEgZGF0YWJhc2UgYWRhcHRlciB0aGF0IHdvcmtzIHdpdGggZGF0YSBleHBvcnRlZCBmcm9tIHRoZSBob3N0ZWRcbi8vIFBhcnNlIGRhdGFiYXNlLlxuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBpbnRlcnNlY3QgZnJvbSAnaW50ZXJzZWN0Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCAqIGFzIFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7XG4gIFF1ZXJ5T3B0aW9ucyxcbiAgRnVsbFF1ZXJ5T3B0aW9ucyxcbn0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5cbmZ1bmN0aW9uIGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfd3Blcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3dwZXJtID0geyAkaW46IFtudWxsLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuZnVuY3Rpb24gYWRkUmVhZEFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3JwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll9ycGVybSA9IHsgJGluOiBbbnVsbCwgJyonLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuLy8gVHJhbnNmb3JtcyBhIFJFU1QgQVBJIGZvcm1hdHRlZCBBQ0wgb2JqZWN0IHRvIG91ciB0d28tZmllbGQgbW9uZ28gZm9ybWF0LlxuY29uc3QgdHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgQUNMLCAuLi5yZXN1bHQgfSkgPT4ge1xuICBpZiAoIUFDTCkge1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICByZXN1bHQuX3dwZXJtID0gW107XG4gIHJlc3VsdC5fcnBlcm0gPSBbXTtcblxuICBmb3IgKGNvbnN0IGVudHJ5IGluIEFDTCkge1xuICAgIGlmIChBQ0xbZW50cnldLnJlYWQpIHtcbiAgICAgIHJlc3VsdC5fcnBlcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGlmIChBQ0xbZW50cnldLndyaXRlKSB7XG4gICAgICByZXN1bHQuX3dwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuY29uc3Qgc3BlY2lhbFF1ZXJ5a2V5cyA9IFtcbiAgJyRhbmQnLFxuICAnJG9yJyxcbiAgJyRub3InLFxuICAnX3JwZXJtJyxcbiAgJ193cGVybScsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxRdWVyeUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsUXVlcnlrZXlzLmluZGV4T2Yoa2V5KSA+PSAwO1xufTtcblxuY29uc3QgdmFsaWRhdGVRdWVyeSA9IChcbiAgcXVlcnk6IGFueSxcbiAgc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmQ6IGJvb2xlYW5cbik6IHZvaWQgPT4ge1xuICBpZiAocXVlcnkuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdDYW5ub3QgcXVlcnkgb24gQUNMLicpO1xuICB9XG5cbiAgaWYgKHF1ZXJ5LiRvcikge1xuICAgIGlmIChxdWVyeS4kb3IgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJG9yLmZvckVhY2goZWwgPT5cbiAgICAgICAgdmFsaWRhdGVRdWVyeShlbCwgc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmQpXG4gICAgICApO1xuXG4gICAgICBpZiAoIXNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kKSB7XG4gICAgICAgIC8qIEluIE1vbmdvREIgMy4yICYgMy40LCAkb3IgcXVlcmllcyB3aGljaCBhcmUgbm90IGFsb25lIGF0IHRoZSB0b3BcbiAgICAgICAgICogbGV2ZWwgb2YgdGhlIHF1ZXJ5IGNhbiBub3QgbWFrZSBlZmZpY2llbnQgdXNlIG9mIGluZGV4ZXMgZHVlIHRvIGFcbiAgICAgICAgICogbG9uZyBzdGFuZGluZyBidWcga25vd24gYXMgU0VSVkVSLTEzNzMyLlxuICAgICAgICAgKlxuICAgICAgICAgKiBUaGlzIGJ1ZyB3YXMgZml4ZWQgaW4gTW9uZ29EQiB2ZXJzaW9uIDMuNi5cbiAgICAgICAgICpcbiAgICAgICAgICogRm9yIHZlcnNpb25zIHByZS0zLjYsIHRoZSBiZWxvdyBsb2dpYyBwcm9kdWNlcyBhIHN1YnN0YW50aWFsXG4gICAgICAgICAqIHBlcmZvcm1hbmNlIGltcHJvdmVtZW50IGluc2lkZSB0aGUgZGF0YWJhc2UgYnkgYXZvaWRpbmcgdGhlIGJ1Zy5cbiAgICAgICAgICpcbiAgICAgICAgICogRm9yIHZlcnNpb25zIDMuNiBhbmQgYWJvdmUsIHRoZXJlIGlzIG5vIHBlcmZvcm1hbmNlIGltcHJvdmVtZW50IGFuZFxuICAgICAgICAgKiB0aGUgbG9naWMgaXMgdW5uZWNlc3NhcnkuIFNvbWUgcXVlcnkgcGF0dGVybnMgYXJlIGV2ZW4gc2xvd2VkIGJ5XG4gICAgICAgICAqIHRoZSBiZWxvdyBsb2dpYywgZHVlIHRvIHRoZSBidWcgaGF2aW5nIGJlZW4gZml4ZWQgYW5kIGJldHRlclxuICAgICAgICAgKiBxdWVyeSBwbGFucyBiZWluZyBjaG9zZW4uXG4gICAgICAgICAqXG4gICAgICAgICAqIFdoZW4gdmVyc2lvbnMgYmVmb3JlIDMuNCBhcmUgbm8gbG9uZ2VyIHN1cHBvcnRlZCBieSB0aGlzIHByb2plY3QsXG4gICAgICAgICAqIHRoaXMgbG9naWMsIGFuZCB0aGUgYWNjb21wYW55aW5nIGBza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZGBcbiAgICAgICAgICogZmxhZywgY2FuIGJlIHJlbW92ZWQuXG4gICAgICAgICAqXG4gICAgICAgICAqIFRoaXMgYmxvY2sgcmVzdHJ1Y3R1cmVzIHF1ZXJpZXMgaW4gd2hpY2ggJG9yIGlzIG5vdCB0aGUgc29sZSB0b3BcbiAgICAgICAgICogbGV2ZWwgZWxlbWVudCBieSBtb3ZpbmcgYWxsIG90aGVyIHRvcC1sZXZlbCBwcmVkaWNhdGVzIGluc2lkZSBldmVyeVxuICAgICAgICAgKiBzdWJkb2N1bWVudCBvZiB0aGUgJG9yIHByZWRpY2F0ZSwgYWxsb3dpbmcgTW9uZ29EQidzIHF1ZXJ5IHBsYW5uZXJcbiAgICAgICAgICogdG8gbWFrZSBmdWxsIHVzZSBvZiB0aGUgbW9zdCByZWxldmFudCBpbmRleGVzLlxuICAgICAgICAgKlxuICAgICAgICAgKiBFRzogICAgICB7JG9yOiBbe2E6IDF9LCB7YTogMn1dLCBiOiAyfVxuICAgICAgICAgKiBCZWNvbWVzOiB7JG9yOiBbe2E6IDEsIGI6IDJ9LCB7YTogMiwgYjogMn1dfVxuICAgICAgICAgKlxuICAgICAgICAgKiBUaGUgb25seSBleGNlcHRpb25zIGFyZSAkbmVhciBhbmQgJG5lYXJTcGhlcmUgb3BlcmF0b3JzLCB3aGljaCBhcmVcbiAgICAgICAgICogY29uc3RyYWluZWQgdG8gb25seSAxIG9wZXJhdG9yIHBlciBxdWVyeS4gQXMgYSByZXN1bHQsIHRoZXNlIG9wc1xuICAgICAgICAgKiByZW1haW4gYXQgdGhlIHRvcCBsZXZlbFxuICAgICAgICAgKlxuICAgICAgICAgKiBodHRwczovL2ppcmEubW9uZ29kYi5vcmcvYnJvd3NlL1NFUlZFUi0xMzczMlxuICAgICAgICAgKiBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvMzc2N1xuICAgICAgICAgKi9cbiAgICAgICAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBjb25zdCBub0NvbGxpc2lvbnMgPSAhcXVlcnkuJG9yLnNvbWUoc3VicSA9PlxuICAgICAgICAgICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN1YnEsIGtleSlcbiAgICAgICAgICApO1xuICAgICAgICAgIGxldCBoYXNOZWFycyA9IGZhbHNlO1xuICAgICAgICAgIGlmIChxdWVyeVtrZXldICE9IG51bGwgJiYgdHlwZW9mIHF1ZXJ5W2tleV0gPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGhhc05lYXJzID0gJyRuZWFyJyBpbiBxdWVyeVtrZXldIHx8ICckbmVhclNwaGVyZScgaW4gcXVlcnlba2V5XTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGtleSAhPSAnJG9yJyAmJiBub0NvbGxpc2lvbnMgJiYgIWhhc05lYXJzKSB7XG4gICAgICAgICAgICBxdWVyeS4kb3IuZm9yRWFjaChzdWJxdWVyeSA9PiB7XG4gICAgICAgICAgICAgIHN1YnF1ZXJ5W2tleV0gPSBxdWVyeVtrZXldO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBkZWxldGUgcXVlcnlba2V5XTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBxdWVyeS4kb3IuZm9yRWFjaChlbCA9PlxuICAgICAgICAgIHZhbGlkYXRlUXVlcnkoZWwsIHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICdCYWQgJG9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kYW5kKSB7XG4gICAgaWYgKHF1ZXJ5LiRhbmQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJGFuZC5mb3JFYWNoKGVsID0+XG4gICAgICAgIHZhbGlkYXRlUXVlcnkoZWwsIHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kKVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAnQmFkICRhbmQgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRub3IpIHtcbiAgICBpZiAocXVlcnkuJG5vciBpbnN0YW5jZW9mIEFycmF5ICYmIHF1ZXJ5LiRub3IubGVuZ3RoID4gMCkge1xuICAgICAgcXVlcnkuJG5vci5mb3JFYWNoKGVsID0+XG4gICAgICAgIHZhbGlkYXRlUXVlcnkoZWwsIHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kKVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAnQmFkICRub3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IG9mIGF0IGxlYXN0IDEgdmFsdWUuJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmIChxdWVyeSAmJiBxdWVyeVtrZXldICYmIHF1ZXJ5W2tleV0uJHJlZ2V4KSB7XG4gICAgICBpZiAodHlwZW9mIHF1ZXJ5W2tleV0uJG9wdGlvbnMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmICghcXVlcnlba2V5XS4kb3B0aW9ucy5tYXRjaCgvXltpbXhzXSskLykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgYEJhZCAkb3B0aW9ucyB2YWx1ZSBmb3IgcXVlcnk6ICR7cXVlcnlba2V5XS4kb3B0aW9uc31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIWlzU3BlY2lhbFF1ZXJ5S2V5KGtleSkgJiYgIWtleS5tYXRjaCgvXlthLXpBLVpdW2EtekEtWjAtOV9cXC5dKiQvKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICBgSW52YWxpZCBrZXkgbmFtZTogJHtrZXl9YFxuICAgICAgKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLy8gRmlsdGVycyBvdXQgYW55IGRhdGEgdGhhdCBzaG91bGRuJ3QgYmUgb24gdGhpcyBSRVNULWZvcm1hdHRlZCBvYmplY3QuXG5jb25zdCBmaWx0ZXJTZW5zaXRpdmVEYXRhID0gKFxuICBpc01hc3RlcjogYm9vbGVhbixcbiAgYWNsR3JvdXA6IGFueVtdLFxuICBhdXRoOiBhbnksXG4gIG9wZXJhdGlvbjogYW55LFxuICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gIHByb3RlY3RlZEZpZWxkczogbnVsbCB8IEFycmF5PGFueT4sXG4gIG9iamVjdDogYW55XG4pID0+IHtcbiAgbGV0IHVzZXJJZCA9IG51bGw7XG4gIGlmIChhdXRoICYmIGF1dGgudXNlcikgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuXG4gIC8vIHJlcGxhY2UgcHJvdGVjdGVkRmllbGRzIHdoZW4gdXNpbmcgcG9pbnRlci1wZXJtaXNzaW9uc1xuICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcbiAgaWYgKHBlcm1zKSB7XG4gICAgY29uc3QgaXNSZWFkT3BlcmF0aW9uID0gWydnZXQnLCAnZmluZCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xO1xuXG4gICAgaWYgKGlzUmVhZE9wZXJhdGlvbiAmJiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIGV4dHJhY3QgcHJvdGVjdGVkRmllbGRzIGFkZGVkIHdpdGggdGhlIHBvaW50ZXItcGVybWlzc2lvbiBwcmVmaXhcbiAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtID0gT2JqZWN0LmtleXMocGVybXMucHJvdGVjdGVkRmllbGRzKVxuICAgICAgICAuZmlsdGVyKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBrZXkuc3Vic3RyaW5nKDEwKSwgdmFsdWU6IHBlcm1zLnByb3RlY3RlZEZpZWxkc1trZXldIH07XG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBuZXdQcm90ZWN0ZWRGaWVsZHM6IEFycmF5PHN0cmluZz5bXSA9IFtdO1xuICAgICAgbGV0IG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gZmFsc2U7XG5cbiAgICAgIC8vIGNoZWNrIGlmIHRoZSBvYmplY3QgZ3JhbnRzIHRoZSBjdXJyZW50IHVzZXIgYWNjZXNzIGJhc2VkIG9uIHRoZSBleHRyYWN0ZWQgZmllbGRzXG4gICAgICBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybS5mb3JFYWNoKHBvaW50ZXJQZXJtID0+IHtcbiAgICAgICAgbGV0IHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IHJlYWRVc2VyRmllbGRWYWx1ZSA9IG9iamVjdFtwb2ludGVyUGVybS5rZXldO1xuICAgICAgICBpZiAocmVhZFVzZXJGaWVsZFZhbHVlKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVhZFVzZXJGaWVsZFZhbHVlKSkge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSByZWFkVXNlckZpZWxkVmFsdWUuc29tZShcbiAgICAgICAgICAgICAgdXNlciA9PiB1c2VyLm9iamVjdElkICYmIHVzZXIub2JqZWN0SWQgPT09IHVzZXJJZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPVxuICAgICAgICAgICAgICByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkID09PSB1c2VySWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyKSB7XG4gICAgICAgICAgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSB0cnVlO1xuICAgICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHBvaW50ZXJQZXJtLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIGlmIGF0IGxlYXN0IG9uZSBwb2ludGVyLXBlcm1pc3Npb24gYWZmZWN0ZWQgdGhlIGN1cnJlbnQgdXNlclxuICAgICAgLy8gaW50ZXJzZWN0IHZzIHByb3RlY3RlZEZpZWxkcyBmcm9tIHByZXZpb3VzIHN0YWdlIChAc2VlIGFkZFByb3RlY3RlZEZpZWxkcylcbiAgICAgIC8vIFNldHMgdGhlb3J5IChpbnRlcnNlY3Rpb25zKTogQSB4IChCIHggQykgPT0gKEEgeCBCKSB4IENcbiAgICAgIGlmIChvdmVycmlkZVByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocHJvdGVjdGVkRmllbGRzKTtcbiAgICAgIH1cbiAgICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgICAvLyBpZiB0aGVyZSdyZSBubyBwcm90Y3RlZEZpZWxkcyBieSBvdGhlciBjcml0ZXJpYSAoIGlkIC8gcm9sZSAvIGF1dGgpXG4gICAgICAgICAgLy8gdGhlbiB3ZSBtdXN0IGludGVyc2VjdCBlYWNoIHNldCAocGVyIHVzZXJGaWVsZClcbiAgICAgICAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gZmllbGRzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHMuZmlsdGVyKHYgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlzVXNlckNsYXNzID0gY2xhc3NOYW1lID09PSAnX1VzZXInO1xuXG4gIC8qIHNwZWNpYWwgdHJlYXQgZm9yIHRoZSB1c2VyIGNsYXNzOiBkb24ndCBmaWx0ZXIgcHJvdGVjdGVkRmllbGRzIGlmIGN1cnJlbnRseSBsb2dnZWRpbiB1c2VyIGlzXG4gIHRoZSByZXRyaWV2ZWQgdXNlciAqL1xuICBpZiAoIShpc1VzZXJDbGFzcyAmJiB1c2VySWQgJiYgb2JqZWN0Lm9iamVjdElkID09PSB1c2VySWQpKSB7XG4gICAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG5cbiAgICAvLyBmaWVsZHMgbm90IHJlcXVlc3RlZCBieSBjbGllbnQgKGV4Y2x1ZGVkKSxcbiAgICAvL2J1dCB3ZXJlIG5lZWRlZCB0byBhcHBseSBwcm90ZWN0dGVkRmllbGRzXG4gICAgcGVybXMucHJvdGVjdGVkRmllbGRzICYmXG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyAmJlxuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuICB9XG5cbiAgaWYgKCFpc1VzZXJDbGFzcykge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBvYmplY3QucGFzc3dvcmQgPSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcbiAgZGVsZXRlIG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuXG4gIGRlbGV0ZSBvYmplY3Quc2Vzc2lvblRva2VuO1xuXG4gIGlmIChpc01hc3Rlcikge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZGVsZXRlIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuO1xuICBkZWxldGUgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuO1xuICBkZWxldGUgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX3RvbWJzdG9uZTtcbiAgZGVsZXRlIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX2ZhaWxlZF9sb2dpbl9jb3VudDtcbiAgZGVsZXRlIG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX3Bhc3N3b3JkX2hpc3Rvcnk7XG5cbiAgaWYgKGFjbEdyb3VwLmluZGV4T2Yob2JqZWN0Lm9iamVjdElkKSA+IC0xKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuaW1wb3J0IHR5cGUgeyBMb2FkU2NoZW1hT3B0aW9ucyB9IGZyb20gJy4vdHlwZXMnO1xuXG4vLyBSdW5zIGFuIHVwZGF0ZSBvbiB0aGUgZGF0YWJhc2UuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gb2JqZWN0IHdpdGggdGhlIG5ldyB2YWx1ZXMgZm9yIGZpZWxkXG4vLyBtb2RpZmljYXRpb25zIHRoYXQgZG9uJ3Qga25vdyB0aGVpciByZXN1bHRzIGFoZWFkIG9mIHRpbWUsIGxpa2Vcbi8vICdpbmNyZW1lbnQnLlxuLy8gT3B0aW9uczpcbi8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbmNvbnN0IHNwZWNpYWxLZXlzRm9yVXBkYXRlID0gW1xuICAnX2hhc2hlZF9wYXNzd29yZCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFVwZGF0ZUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsS2V5c0ZvclVwZGF0ZS5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmZ1bmN0aW9uIGV4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3QsIGtleSwgdmFsdWUpIHtcbiAgaWYgKGtleS5pbmRleE9mKCcuJykgPCAwKSB7XG4gICAgb2JqZWN0W2tleV0gPSB2YWx1ZVtrZXldO1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgY29uc3QgcGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICBjb25zdCBmaXJzdEtleSA9IHBhdGhbMF07XG4gIGNvbnN0IG5leHRQYXRoID0gcGF0aC5zbGljZSgxKS5qb2luKCcuJyk7XG4gIG9iamVjdFtmaXJzdEtleV0gPSBleHBhbmRSZXN1bHRPbktleVBhdGgoXG4gICAgb2JqZWN0W2ZpcnN0S2V5XSB8fCB7fSxcbiAgICBuZXh0UGF0aCxcbiAgICB2YWx1ZVtmaXJzdEtleV1cbiAgKTtcbiAgZGVsZXRlIG9iamVjdFtrZXldO1xuICByZXR1cm4gb2JqZWN0O1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQpOiBQcm9taXNlPGFueT4ge1xuICBjb25zdCByZXNwb25zZSA9IHt9O1xuICBpZiAoIXJlc3VsdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICB9XG4gIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgY29uc3Qga2V5VXBkYXRlID0gb3JpZ2luYWxPYmplY3Rba2V5XTtcbiAgICAvLyBkZXRlcm1pbmUgaWYgdGhhdCB3YXMgYW4gb3BcbiAgICBpZiAoXG4gICAgICBrZXlVcGRhdGUgJiZcbiAgICAgIHR5cGVvZiBrZXlVcGRhdGUgPT09ICdvYmplY3QnICYmXG4gICAgICBrZXlVcGRhdGUuX19vcCAmJlxuICAgICAgWydBZGQnLCAnQWRkVW5pcXVlJywgJ1JlbW92ZScsICdJbmNyZW1lbnQnXS5pbmRleE9mKGtleVVwZGF0ZS5fX29wKSA+IC0xXG4gICAgKSB7XG4gICAgICAvLyBvbmx5IHZhbGlkIG9wcyB0aGF0IHByb2R1Y2UgYW4gYWN0aW9uYWJsZSByZXN1bHRcbiAgICAgIC8vIHRoZSBvcCBtYXkgaGF2ZSBoYXBwZW5kIG9uIGEga2V5cGF0aFxuICAgICAgZXhwYW5kUmVzdWx0T25LZXlQYXRoKHJlc3BvbnNlLCBrZXksIHJlc3VsdCk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG59XG5cbmZ1bmN0aW9uIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIGBfSm9pbjoke2tleX06JHtjbGFzc05hbWV9YDtcbn1cblxuY29uc3QgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSA9IG9iamVjdCA9PiB7XG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICBzd2l0Y2ggKG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldLmFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5J1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY2xhc3MgRGF0YWJhc2VDb250cm9sbGVyIHtcbiAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG4gIHNjaGVtYVByb21pc2U6ID9Qcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj47XG4gIHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kOiBib29sZWFuO1xuICBfdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsXG4gICAgc2NoZW1hQ2FjaGU6IGFueSxcbiAgICBza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZDogYm9vbGVhblxuICApIHtcbiAgICB0aGlzLmFkYXB0ZXIgPSBhZGFwdGVyO1xuICAgIHRoaXMuc2NoZW1hQ2FjaGUgPSBzY2hlbWFDYWNoZTtcbiAgICAvLyBXZSBkb24ndCB3YW50IGEgbXV0YWJsZSB0aGlzLnNjaGVtYSwgYmVjYXVzZSB0aGVuIHlvdSBjb3VsZCBoYXZlXG4gICAgLy8gb25lIHJlcXVlc3QgdGhhdCB1c2VzIGRpZmZlcmVudCBzY2hlbWFzIGZvciBkaWZmZXJlbnQgcGFydHMgb2ZcbiAgICAvLyBpdC4gSW5zdGVhZCwgdXNlIGxvYWRTY2hlbWEgdG8gZ2V0IGEgc2NoZW1hLlxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgdGhpcy5za2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZCA9IHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kO1xuICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgfVxuXG4gIGNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gIH1cblxuICBwdXJnZUNvbGxlY3Rpb24oY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHt9KSk7XG4gIH1cblxuICB2YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5jbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAnaW52YWxpZCBjbGFzc05hbWU6ICcgKyBjbGFzc05hbWVcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgc2NoZW1hQ29udHJvbGxlci5cbiAgbG9hZFNjaGVtYShcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYVByb21pc2UgIT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHRoaXMuc2NoZW1hUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gU2NoZW1hQ29udHJvbGxlci5sb2FkKFxuICAgICAgdGhpcy5hZGFwdGVyLFxuICAgICAgdGhpcy5zY2hlbWFDYWNoZSxcbiAgICAgIG9wdGlvbnNcbiAgICApO1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZS50aGVuKFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZSxcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2VcbiAgICApO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICBsb2FkU2NoZW1hSWZOZWVkZWQoXG4gICAgc2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgID8gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYUNvbnRyb2xsZXIpXG4gICAgICA6IHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgY2xhc3NuYW1lIHRoYXQgaXMgcmVsYXRlZCB0byB0aGUgZ2l2ZW5cbiAgLy8gY2xhc3NuYW1lIHRocm91Z2ggdGhlIGtleS5cbiAgLy8gVE9ETzogbWFrZSB0aGlzIG5vdCBpbiB0aGUgRGF0YWJhc2VDb250cm9sbGVyIGludGVyZmFjZVxuICByZWRpcmVjdENsYXNzTmFtZUZvcktleShjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcpOiBQcm9taXNlPD9zdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4ge1xuICAgICAgdmFyIHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICh0ICE9IG51bGwgJiYgdHlwZW9mIHQgIT09ICdzdHJpbmcnICYmIHQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gdC50YXJnZXRDbGFzcztcbiAgICAgIH1cbiAgICAgIHJldHVybiBjbGFzc05hbWU7XG4gICAgfSk7XG4gIH1cblxuICAvLyBVc2VzIHRoZSBzY2hlbWEgdG8gdmFsaWRhdGUgdGhlIG9iamVjdCAoUkVTVCBBUEkgZm9ybWF0KS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYS5cbiAgLy8gVGhpcyBkb2VzIG5vdCB1cGRhdGUgdGhpcy5zY2hlbWEsIGJlY2F1c2UgaW4gYSBzaXR1YXRpb24gbGlrZSBhXG4gIC8vIGJhdGNoIHJlcXVlc3QsIHRoYXQgY291bGQgY29uZnVzZSBvdGhlciB1c2VycyBvZiB0aGUgc2NoZW1hLlxuICB2YWxpZGF0ZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBxdWVyeTogYW55LFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBsZXQgc2NoZW1hO1xuICAgIGNvbnN0IGFjbCA9IHJ1bk9wdGlvbnMuYWNsO1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwOiBzdHJpbmdbXSA9IGFjbCB8fCBbXTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWEgPSBzO1xuICAgICAgICBpZiAoaXNNYXN0ZXIpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FuQWRkRmllbGQoXG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgcnVuT3B0aW9uc1xuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB7IGFjbCwgbWFueSwgdXBzZXJ0LCBhZGRzRmllbGQgfTogRnVsbFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHNraXBTYW5pdGl6YXRpb246IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBxdWVyeTtcbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHVwZGF0ZTtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgdXBkYXRlID0gZGVlcGNvcHkodXBkYXRlKTtcbiAgICB2YXIgcmVsYXRpb25VcGRhdGVzID0gW107XG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihcbiAgICAgIHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ3VwZGF0ZScpXG4gICAgICAgIClcbiAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgdXBkYXRlXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICd1cGRhdGUnLFxuICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgaWYgKGFkZHNGaWVsZCkge1xuICAgICAgICAgICAgICAgIHF1ZXJ5ID0ge1xuICAgICAgICAgICAgICAgICAgJGFuZDogW1xuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgJ2FkZEZpZWxkJyxcbiAgICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIHRoaXMuc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmQpO1xuICAgICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpXG4gICAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgICAgIC8vIHdpbGwgbGlrZWx5IG5lZWQgcmV2aXNpdGluZy5cbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICAgIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lKSAmJlxuICAgICAgICAgICAgICAgICAgICAhaXNTcGVjaWFsVXBkYXRlS2V5KHJvb3RGaWVsZE5hbWUpXG4gICAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCB1cGRhdGVPcGVyYXRpb24gaW4gdXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dICYmXG4gICAgICAgICAgICAgICAgICAgIHR5cGVvZiB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0pLnNvbWUoXG4gICAgICAgICAgICAgICAgICAgICAgaW5uZXJLZXkgPT5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlubmVyS2V5LmluY2x1ZGVzKCckJykgfHwgaW5uZXJLZXkuaW5jbHVkZXMoJy4nKVxuICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICAgICAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdXBkYXRlID0gdHJhbnNmb3JtT2JqZWN0QUNMKHVwZGF0ZSk7XG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgICAgICAgICAgICAgICAuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHt9KVxuICAgICAgICAgICAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0IHx8ICFyZXN1bHQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChtYW55KSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cHNlcnQpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLFxuICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmIChza2lwU2FuaXRpemF0aW9uKSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsVXBkYXRlLCByZXN1bHQpO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICAvLyBDb2xsZWN0IGFsbCByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBsaXN0IG9mIGFsbCByZWxhdGlvbiB1cGRhdGVzIHRvIHBlcmZvcm1cbiAgLy8gVGhpcyBtdXRhdGVzIHVwZGF0ZS5cbiAgY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6ID9zdHJpbmcsIHVwZGF0ZTogYW55KSB7XG4gICAgdmFyIG9wcyA9IFtdO1xuICAgIHZhciBkZWxldGVNZSA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuXG4gICAgdmFyIHByb2Nlc3MgPSAob3AsIGtleSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnQmF0Y2gnKSB7XG4gICAgICAgIGZvciAodmFyIHggb2Ygb3Aub3BzKSB7XG4gICAgICAgICAgcHJvY2Vzcyh4LCBrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHVwZGF0ZSkge1xuICAgICAgcHJvY2Vzcyh1cGRhdGVba2V5XSwga2V5KTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBrZXkgb2YgZGVsZXRlTWUpIHtcbiAgICAgIGRlbGV0ZSB1cGRhdGVba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIG9wcztcbiAgfVxuXG4gIC8vIFByb2Nlc3NlcyByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBhbGwgdXBkYXRlcyBoYXZlIGJlZW4gcGVyZm9ybWVkXG4gIGhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3RJZDogc3RyaW5nLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIG9wczogYW55XG4gICkge1xuICAgIHZhciBwZW5kaW5nID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG4gICAgb3BzLmZvckVhY2goKHsga2V5LCBvcCB9KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaChcbiAgICAgICAgICAgIHRoaXMuYWRkUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2goXG4gICAgICAgICAgICB0aGlzLnJlbW92ZVJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwZW5kaW5nKTtcbiAgfVxuXG4gIC8vIEFkZHMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBhZGQgd2FzIHN1Y2Nlc3NmdWwuXG4gIGFkZFJlbGF0aW9uKFxuICAgIGtleTogc3RyaW5nLFxuICAgIGZyb21DbGFzc05hbWU6IHN0cmluZyxcbiAgICBmcm9tSWQ6IHN0cmluZyxcbiAgICB0b0lkOiBzdHJpbmdcbiAgKSB7XG4gICAgY29uc3QgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgZG9jLFxuICAgICAgZG9jLFxuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIHJlbW92ZSB3YXNcbiAgLy8gc3VjY2Vzc2Z1bC5cbiAgcmVtb3ZlUmVsYXRpb24oXG4gICAga2V5OiBzdHJpbmcsXG4gICAgZnJvbUNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZyb21JZDogc3RyaW5nLFxuICAgIHRvSWQ6IHN0cmluZ1xuICApIHtcbiAgICB2YXIgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIGRvYyxcbiAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFdlIGRvbid0IGNhcmUgaWYgdGhleSB0cnkgdG8gZGVsZXRlIGEgbm9uLWV4aXN0ZW50IHJlbGF0aW9uLlxuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZW1vdmVzIG9iamVjdHMgbWF0Y2hlcyB0aGlzIHF1ZXJ5IGZyb20gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCB3YXNcbiAgLy8gZGVsZXRlZC5cbiAgLy8gT3B0aW9uczpcbiAgLy8gICBhY2w6ICBhIGxpc3Qgb2Ygc3RyaW5ncy4gSWYgdGhlIG9iamVjdCB0byBiZSB1cGRhdGVkIGhhcyBhbiBBQ0wsXG4gIC8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbiAgLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbiAgZGVzdHJveShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oXG4gICAgICBzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdkZWxldGUnKVxuICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgJ2RlbGV0ZScsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAgICAgJ09iamVjdCBub3QgZm91bmQuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBkZWxldGUgYnkgcXVlcnlcbiAgICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCB0aGlzLnNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kKTtcbiAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUpXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAgIC8vIHdpbGwgbGlrZWx5IG5lZWQgcmV2aXNpdGluZy5cbiAgICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4ocGFyc2VGb3JtYXRTY2hlbWEgPT5cbiAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICBwYXJzZUZvcm1hdFNjaGVtYSxcbiAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAvLyBXaGVuIGRlbGV0aW5nIHNlc3Npb25zIHdoaWxlIGNoYW5naW5nIHBhc3N3b3JkcywgZG9uJ3QgdGhyb3cgYW4gZXJyb3IgaWYgdGhleSBkb24ndCBoYXZlIGFueSBzZXNzaW9ucy5cbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJlxuICAgICAgICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkRcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIC8vIEluc2VydHMgYW4gb2JqZWN0IGludG8gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCBzYXZlZC5cbiAgY3JlYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIGNvbnN0IG9yaWdpbmFsT2JqZWN0ID0gb2JqZWN0O1xuICAgIG9iamVjdCA9IHRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuXG4gICAgb2JqZWN0LmNyZWF0ZWRBdCA9IHsgaXNvOiBvYmplY3QuY3JlYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuICAgIG9iamVjdC51cGRhdGVkQXQgPSB7IGlzbzogb2JqZWN0LnVwZGF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcblxuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBjb25zdCByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBudWxsLFxuICAgICAgb2JqZWN0XG4gICAgKTtcblxuICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdjcmVhdGUnKVxuICAgICAgICApXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5lbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lKSlcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpKVxuICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICAgICAgICAgIGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUob2JqZWN0KTtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgU2NoZW1hQ29udHJvbGxlci5jb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKHNjaGVtYSksXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxPYmplY3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHNhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3QsIHJlc3VsdC5vcHNbMF0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNhbkFkZEZpZWxkKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY2xhc3NTY2hlbWEgPSBzY2hlbWEuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgIGlmICghY2xhc3NTY2hlbWEpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcbiAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSBPYmplY3Qua2V5cyhjbGFzc1NjaGVtYS5maWVsZHMpO1xuICAgIGNvbnN0IG5ld0tleXMgPSBmaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIC8vIFNraXAgZmllbGRzIHRoYXQgYXJlIHVuc2V0XG4gICAgICBpZiAoXG4gICAgICAgIG9iamVjdFtmaWVsZF0gJiZcbiAgICAgICAgb2JqZWN0W2ZpZWxkXS5fX29wICYmXG4gICAgICAgIG9iamVjdFtmaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZSdcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2NoZW1hRmllbGRzLmluZGV4T2YoZmllbGQpIDwgMDtcbiAgICB9KTtcbiAgICBpZiAobmV3S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBhZGRzIGEgbWFya2VyIHRoYXQgbmV3IGZpZWxkIGlzIGJlaW5nIGFkZGluZyBkdXJpbmcgdXBkYXRlXG4gICAgICBydW5PcHRpb25zLmFkZHNGaWVsZCA9IHRydWU7XG5cbiAgICAgIGNvbnN0IGFjdGlvbiA9IHJ1bk9wdGlvbnMuYWN0aW9uO1xuICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2FkZEZpZWxkJywgYWN0aW9uKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV29uJ3QgZGVsZXRlIGNvbGxlY3Rpb25zIGluIHRoZSBzeXN0ZW0gbmFtZXNwYWNlXG4gIC8qKlxuICAgKiBEZWxldGUgYWxsIGNsYXNzZXMgYW5kIGNsZWFycyB0aGUgc2NoZW1hIGNhY2hlXG4gICAqXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gZmFzdCBzZXQgdG8gdHJ1ZSBpZiBpdCdzIG9rIHRvIGp1c3QgZGVsZXRlIHJvd3MgYW5kIG5vdCBpbmRleGVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSB3aGVuIHRoZSBkZWxldGlvbnMgY29tcGxldGVzXG4gICAqL1xuICBkZWxldGVFdmVyeXRoaW5nKGZhc3Q6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8YW55PiB7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZUFsbENsYXNzZXMoZmFzdCksXG4gICAgICB0aGlzLnNjaGVtYUNhY2hlLmNsZWFyKCksXG4gICAgXSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIHJlbGF0ZWQgaWRzIGdpdmVuIGFuIG93bmluZyBpZC5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIHJlbGF0ZWRJZHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgb3duaW5nSWQ6IHN0cmluZyxcbiAgICBxdWVyeU9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPEFycmF5PHN0cmluZz4+IHtcbiAgICBjb25zdCB7IHNraXAsIGxpbWl0LCBzb3J0IH0gPSBxdWVyeU9wdGlvbnM7XG4gICAgY29uc3QgZmluZE9wdGlvbnMgPSB7fTtcbiAgICBpZiAoc29ydCAmJiBzb3J0LmNyZWF0ZWRBdCAmJiB0aGlzLmFkYXB0ZXIuY2FuU29ydE9uSm9pblRhYmxlcykge1xuICAgICAgZmluZE9wdGlvbnMuc29ydCA9IHsgX2lkOiBzb3J0LmNyZWF0ZWRBdCB9O1xuICAgICAgZmluZE9wdGlvbnMubGltaXQgPSBsaW1pdDtcbiAgICAgIGZpbmRPcHRpb25zLnNraXAgPSBza2lwO1xuICAgICAgcXVlcnlPcHRpb25zLnNraXAgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChcbiAgICAgICAgam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICB7IG93bmluZ0lkIH0sXG4gICAgICAgIGZpbmRPcHRpb25zXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmVsYXRlZElkKSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIG93bmluZyBpZHMgZ2l2ZW4gc29tZSByZWxhdGVkIGlkcy5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIG93bmluZ0lkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICByZWxhdGVkSWRzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoXG4gICAgICAgIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgeyByZWxhdGVkSWQ6IHsgJGluOiByZWxhdGVkSWRzIH0gfSxcbiAgICAgICAge31cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5vd25pbmdJZCkpO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRpbiBvbiByZWxhdGlvbiBmaWVsZHMsIG9yXG4gIC8vIGVxdWFsLXRvLXBvaW50ZXIgY29uc3RyYWludHMgb24gcmVsYXRpb24gZmllbGRzLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBzY2hlbWE6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gU2VhcmNoIGZvciBhbiBpbi1yZWxhdGlvbiBvciBlcXVhbC10by1yZWxhdGlvblxuICAgIC8vIE1ha2UgaXQgc2VxdWVudGlhbCBmb3Igbm93LCBub3Qgc3VyZSBvZiBwYXJhbGxlaXphdGlvbiBzaWRlIGVmZmVjdHNcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICBjb25zdCBvcnMgPSBxdWVyeVsnJG9yJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIG9ycy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oXG4gICAgICAgICAgICBhUXVlcnkgPT4ge1xuICAgICAgICAgICAgICBxdWVyeVsnJG9yJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH0pXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IHByb21pc2VzID0gT2JqZWN0LmtleXMocXVlcnkpLm1hcChrZXkgPT4ge1xuICAgICAgY29uc3QgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKCF0IHx8IHQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIGxldCBxdWVyaWVzOiA/KGFueVtdKSA9IG51bGw7XG4gICAgICBpZiAoXG4gICAgICAgIHF1ZXJ5W2tleV0gJiZcbiAgICAgICAgKHF1ZXJ5W2tleV1bJyRpbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5lJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldLl9fdHlwZSA9PSAnUG9pbnRlcicpXG4gICAgICApIHtcbiAgICAgICAgLy8gQnVpbGQgdGhlIGxpc3Qgb2YgcXVlcmllc1xuICAgICAgICBxdWVyaWVzID0gT2JqZWN0LmtleXMocXVlcnlba2V5XSkubWFwKGNvbnN0cmFpbnRLZXkgPT4ge1xuICAgICAgICAgIGxldCByZWxhdGVkSWRzO1xuICAgICAgICAgIGxldCBpc05lZ2F0aW9uID0gZmFsc2U7XG4gICAgICAgICAgaWYgKGNvbnN0cmFpbnRLZXkgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckaW4nKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJGluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmluJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJG5pbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5lJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV1bJyRuZSddLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaXNOZWdhdGlvbixcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyaWVzID0gW3sgaXNOZWdhdGlvbjogZmFsc2UsIHJlbGF0ZWRJZHM6IFtdIH1dO1xuICAgICAgfVxuXG4gICAgICAvLyByZW1vdmUgdGhlIGN1cnJlbnQgcXVlcnlLZXkgYXMgd2UgZG9uLHQgbmVlZCBpdCBhbnltb3JlXG4gICAgICBkZWxldGUgcXVlcnlba2V5XTtcbiAgICAgIC8vIGV4ZWN1dGUgZWFjaCBxdWVyeSBpbmRlcGVuZGVudGx5IHRvIGJ1aWxkIHRoZSBsaXN0IG9mXG4gICAgICAvLyAkaW4gLyAkbmluXG4gICAgICBjb25zdCBwcm9taXNlcyA9IHF1ZXJpZXMubWFwKHEgPT4ge1xuICAgICAgICBpZiAoIXEpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMub3duaW5nSWRzKGNsYXNzTmFtZSwga2V5LCBxLnJlbGF0ZWRJZHMpLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBpZiAocS5pc05lZ2F0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLmFkZE5vdEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRyZWxhdGVkVG9cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlUmVsYXRpb25LZXlzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgcXVlcnlPcHRpb25zOiBhbnlcbiAgKTogP1Byb21pc2U8dm9pZD4ge1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRvciddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuXG4gICAgdmFyIHJlbGF0ZWRUbyA9IHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgaWYgKHJlbGF0ZWRUbykge1xuICAgICAgcmV0dXJuIHRoaXMucmVsYXRlZElkcyhcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHJlbGF0ZWRUby5rZXksXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3Qub2JqZWN0SWQsXG4gICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgKVxuICAgICAgICAudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICB9XG4gIH1cblxuICBhZGRJbk9iamVjdElkc0lkcyhpZHM6ID9BcnJheTxzdHJpbmc+ID0gbnVsbCwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21TdHJpbmc6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycgPyBbcXVlcnkub2JqZWN0SWRdIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tRXE6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckZXEnXSA/IFtxdWVyeS5vYmplY3RJZFsnJGVxJ11dIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tSW46ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA6IG51bGw7XG5cbiAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICBjb25zdCBhbGxJZHM6IEFycmF5PEFycmF5PHN0cmluZz4+ID0gW1xuICAgICAgaWRzRnJvbVN0cmluZyxcbiAgICAgIGlkc0Zyb21FcSxcbiAgICAgIGlkc0Zyb21JbixcbiAgICAgIGlkcyxcbiAgICBdLmZpbHRlcihsaXN0ID0+IGxpc3QgIT09IG51bGwpO1xuICAgIGNvbnN0IHRvdGFsTGVuZ3RoID0gYWxsSWRzLnJlZHVjZSgobWVtbywgbGlzdCkgPT4gbWVtbyArIGxpc3QubGVuZ3RoLCAwKTtcblxuICAgIGxldCBpZHNJbnRlcnNlY3Rpb24gPSBbXTtcbiAgICBpZiAodG90YWxMZW5ndGggPiAxMjUpIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdC5iaWcoYWxsSWRzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0KGFsbElkcyk7XG4gICAgfVxuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG4gICAgcXVlcnkub2JqZWN0SWRbJyRpbiddID0gaWRzSW50ZXJzZWN0aW9uO1xuXG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzOiBzdHJpbmdbXSA9IFtdLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbU5pbiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJG5pbiddID8gcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA6IFtdO1xuICAgIGxldCBhbGxJZHMgPSBbLi4uaWRzRnJvbU5pbiwgLi4uaWRzXS5maWx0ZXIobGlzdCA9PiBsaXN0ICE9PSBudWxsKTtcblxuICAgIC8vIG1ha2UgYSBzZXQgYW5kIHNwcmVhZCB0byByZW1vdmUgZHVwbGljYXRlc1xuICAgIGFsbElkcyA9IFsuLi5uZXcgU2V0KGFsbElkcyldO1xuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPSBhbGxJZHM7XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gUnVucyBhIHF1ZXJ5IG9uIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhIGxpc3Qgb2YgaXRlbXMuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgc2tpcCAgICBudW1iZXIgb2YgcmVzdWx0cyB0byBza2lwLlxuICAvLyAgIGxpbWl0ICAgbGltaXQgdG8gdGhpcyBudW1iZXIgb2YgcmVzdWx0cy5cbiAgLy8gICBzb3J0ICAgIGFuIG9iamVjdCB3aGVyZSBrZXlzIGFyZSB0aGUgZmllbGRzIHRvIHNvcnQgYnkuXG4gIC8vICAgICAgICAgICB0aGUgdmFsdWUgaXMgKzEgZm9yIGFzY2VuZGluZywgLTEgZm9yIGRlc2NlbmRpbmcuXG4gIC8vICAgY291bnQgICBydW4gYSBjb3VudCBpbnN0ZWFkIG9mIHJldHVybmluZyByZXN1bHRzLlxuICAvLyAgIGFjbCAgICAgcmVzdHJpY3QgdGhpcyBvcGVyYXRpb24gd2l0aCBhbiBBQ0wgZm9yIHRoZSBwcm92aWRlZCBhcnJheVxuICAvLyAgICAgICAgICAgb2YgdXNlciBvYmplY3RJZHMgYW5kIHJvbGVzLiBhY2w6IG51bGwgbWVhbnMgbm8gdXNlci5cbiAgLy8gICAgICAgICAgIHdoZW4gdGhpcyBmaWVsZCBpcyBub3QgcHJlc2VudCwgZG9uJ3QgZG8gYW55dGhpbmcgcmVnYXJkaW5nIEFDTHMuXG4gIC8vICBjYXNlSW5zZW5zaXRpdmUgbWFrZSBzdHJpbmcgY29tcGFyaXNvbnMgY2FzZSBpbnNlbnNpdGl2ZVxuICAvLyBUT0RPOiBtYWtlIHVzZXJJZHMgbm90IG5lZWRlZCBoZXJlLiBUaGUgZGIgYWRhcHRlciBzaG91bGRuJ3Qga25vd1xuICAvLyBhbnl0aGluZyBhYm91dCB1c2VycywgaWRlYWxseS4gVGhlbiwgaW1wcm92ZSB0aGUgZm9ybWF0IG9mIHRoZSBBQ0xcbiAgLy8gYXJnIHRvIHdvcmsgbGlrZSB0aGUgb3RoZXJzLlxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgYWNsLFxuICAgICAgc29ydCA9IHt9LFxuICAgICAgY291bnQsXG4gICAgICBrZXlzLFxuICAgICAgb3AsXG4gICAgICBkaXN0aW5jdCxcbiAgICAgIHBpcGVsaW5lLFxuICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICBoaW50LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlID0gZmFsc2UsXG4gICAgICBleHBsYWluLFxuICAgIH06IGFueSA9IHt9LFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBvcCA9XG4gICAgICBvcCB8fFxuICAgICAgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PSAnc3RyaW5nJyAmJiBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAxXG4gICAgICAgID8gJ2dldCdcbiAgICAgICAgOiAnZmluZCcpO1xuICAgIC8vIENvdW50IG9wZXJhdGlvbiBpZiBjb3VudGluZ1xuICAgIG9wID0gY291bnQgPT09IHRydWUgPyAnY291bnQnIDogb3A7XG5cbiAgICBsZXQgY2xhc3NFeGlzdHMgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oXG4gICAgICBzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgLy9BbGxvdyB2b2xhdGlsZSBjbGFzc2VzIGlmIHF1ZXJ5aW5nIHdpdGggTWFzdGVyIChmb3IgX1B1c2hTdGF0dXMpXG4gICAgICAgIC8vVE9ETzogTW92ZSB2b2xhdGlsZSBjbGFzc2VzIGNvbmNlcHQgaW50byBtb25nbyBhZGFwdGVyLCBwb3N0Z3JlcyBhZGFwdGVyIHNob3VsZG4ndCBjYXJlXG4gICAgICAgIC8vdGhhdCBhcGkucGFyc2UuY29tIGJyZWFrcyB3aGVuIF9QdXNoU3RhdHVzIGV4aXN0cyBpbiBtb25nby5cbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgaXNNYXN0ZXIpXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIEJlaGF2aW9yIGZvciBub24tZXhpc3RlbnQgY2xhc3NlcyBpcyBraW5kYSB3ZWlyZCBvbiBQYXJzZS5jb20uIFByb2JhYmx5IGRvZXNuJ3QgbWF0dGVyIHRvbyBtdWNoLlxuICAgICAgICAgICAgLy8gRm9yIG5vdywgcHJldGVuZCB0aGUgY2xhc3MgZXhpc3RzIGJ1dCBoYXMgbm8gb2JqZWN0cyxcbiAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgIGNsYXNzRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgIC8vIFBhcnNlLmNvbSB0cmVhdHMgcXVlcmllcyBvbiBfY3JlYXRlZF9hdCBhbmQgX3VwZGF0ZWRfYXQgYXMgaWYgdGhleSB3ZXJlIHF1ZXJpZXMgb24gY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQsXG4gICAgICAgICAgICAvLyBzbyBkdXBsaWNhdGUgdGhhdCBiZWhhdmlvciBoZXJlLiBJZiBib3RoIGFyZSBzcGVjaWZpZWQsIHRoZSBjb3JyZWN0IGJlaGF2aW9yIHRvIG1hdGNoIFBhcnNlLmNvbSBpcyB0b1xuICAgICAgICAgICAgLy8gdXNlIHRoZSBvbmUgdGhhdCBhcHBlYXJzIGZpcnN0IGluIHRoZSBzb3J0IGxpc3QuXG4gICAgICAgICAgICBpZiAoc29ydC5fY3JlYXRlZF9hdCkge1xuICAgICAgICAgICAgICBzb3J0LmNyZWF0ZWRBdCA9IHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNvcnQuX3VwZGF0ZWRfYXQpIHtcbiAgICAgICAgICAgICAgc29ydC51cGRhdGVkQXQgPSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgICAgICBkZWxldGUgc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHF1ZXJ5T3B0aW9ucyA9IHtcbiAgICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICAgIHNvcnQsXG4gICAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgT2JqZWN0LmtleXMoc29ydCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICBgQ2Fubm90IHNvcnQgYnkgJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSkpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgICAgIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucylcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgICAgIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWFDb250cm9sbGVyKVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgcHJvdGVjdGVkRmllbGRzO1xuICAgICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIC8qIERvbid0IHVzZSBwcm9qZWN0aW9ucyB0byBvcHRpbWl6ZSB0aGUgcHJvdGVjdGVkRmllbGRzIHNpbmNlIHRoZSBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgICAgIGJhc2VkIG9uIHBvaW50ZXItcGVybWlzc2lvbnMgYXJlIGRldGVybWluZWQgYWZ0ZXIgcXVlcnlpbmcuIFRoZSBmaWx0ZXJpbmcgY2FuXG4gICAgICAgICAgICAgICAgICBvdmVyd3JpdGUgdGhlIHByb3RlY3RlZCBmaWVsZHMuICovXG4gICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICAgICAgaWYgKG9wID09PSAnZ2V0Jykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ3VwZGF0ZScgfHwgb3AgPT09ICdkZWxldGUnKSB7XG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkUmVhZEFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCB0aGlzLnNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kKTtcbiAgICAgICAgICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNvdW50KFxuICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICAgIGhpbnRcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGRpc3RpbmN0KSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGlzdGluY3QoXG4gICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgICBkaXN0aW5jdFxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocGlwZWxpbmUpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5hZ2dyZWdhdGUoXG4gICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgICBwaXBlbGluZSxcbiAgICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgICAgICAgICAgIGV4cGxhaW5cbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAgICAgICAgICAgLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKG9iamVjdHMgPT5cbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0ID0gdW50cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmaWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICAgICAgICAgICAgICBpc01hc3RlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0XG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvclxuICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGRlbGV0ZVNjaGVtYShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKChzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZSlcbiAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmNvdW50KGNsYXNzTmFtZSwgeyBmaWVsZHM6IHt9IH0sIG51bGwsICcnLCBmYWxzZSlcbiAgICAgICAgICApXG4gICAgICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICAgICAgaWYgKGNvdW50ID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgMjU1LFxuICAgICAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gaXMgbm90IGVtcHR5LCBjb250YWlucyAke2NvdW50fSBvYmplY3RzLCBjYW5ub3QgZHJvcCBzY2hlbWEuYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhjbGFzc05hbWUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4od2FzUGFyc2VDb2xsZWN0aW9uID0+IHtcbiAgICAgICAgICAgIGlmICh3YXNQYXJzZUNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICAgICAgICAgIGZpZWxkTmFtZSA9PiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLm1hcChuYW1lID0+XG4gICAgICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3Moam9pblRhYmxlTmFtZShjbGFzc05hbWUsIG5hbWUpKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBDb25zdHJhaW50cyBxdWVyeSB1c2luZyBDTFAncyBwb2ludGVyIHBlcm1pc3Npb25zIChQUCkgaWYgYW55LlxuICAvLyAxLiBFdHJhY3QgdGhlIHVzZXIgaWQgZnJvbSBjYWxsZXIncyBBQ0xncm91cDtcbiAgLy8gMi4gRXhjdHJhY3QgYSBsaXN0IG9mIGZpZWxkIG5hbWVzIHRoYXQgYXJlIFBQIGZvciB0YXJnZXQgY29sbGVjdGlvbiBhbmQgb3BlcmF0aW9uO1xuICAvLyAzLiBDb25zdHJhaW50IHRoZSBvcmlnaW5hbCBxdWVyeSBzbyB0aGF0IGVhY2ggUFAgZmllbGQgbXVzdFxuICAvLyBwb2ludCB0byBjYWxsZXIncyBpZCAob3IgY29udGFpbiBpdCBpbiBjYXNlIG9mIFBQIGZpZWxkIGJlaW5nIGFuIGFycmF5KVxuICBhZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXVxuICApOiBhbnkge1xuICAgIC8vIENoZWNrIGlmIGNsYXNzIGhhcyBwdWJsaWMgcGVybWlzc2lvbiBmb3Igb3BlcmF0aW9uXG4gICAgLy8gSWYgdGhlIEJhc2VDTFAgcGFzcywgbGV0IGdvIHRocm91Z2hcbiAgICBpZiAoc2NoZW1hLnRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWUsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuXG4gICAgY29uc3QgdXNlckFDTCA9IGFjbEdyb3VwLmZpbHRlcihhY2wgPT4ge1xuICAgICAgcmV0dXJuIGFjbC5pbmRleE9mKCdyb2xlOicpICE9IDAgJiYgYWNsICE9ICcqJztcbiAgICB9KTtcblxuICAgIGNvbnN0IGdyb3VwS2V5ID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMVxuICAgICAgICA/ICdyZWFkVXNlckZpZWxkcydcbiAgICAgICAgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIGNvbnN0IHBlcm1GaWVsZHMgPSBbXTtcblxuICAgIGlmIChwZXJtc1tvcGVyYXRpb25dICYmIHBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcykge1xuICAgICAgcGVybUZpZWxkcy5wdXNoKC4uLnBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcyk7XG4gICAgfVxuXG4gICAgaWYgKHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBwZXJtc1tncm91cEtleV0pIHtcbiAgICAgICAgaWYgKCFwZXJtRmllbGRzLmluY2x1ZGVzKGZpZWxkKSkge1xuICAgICAgICAgIHBlcm1GaWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgIGlmIChwZXJtRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICAgIC8vIE5vIHVzZXIgc2V0IHJldHVybiB1bmRlZmluZWRcbiAgICAgIC8vIElmIHRoZSBsZW5ndGggaXMgPiAxLCB0aGF0IG1lYW5zIHdlIGRpZG4ndCBkZS1kdXBlIHVzZXJzIGNvcnJlY3RseVxuICAgICAgaWYgKHVzZXJBQ0wubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdXNlcklkID0gdXNlckFDTFswXTtcbiAgICAgIGNvbnN0IHVzZXJQb2ludGVyID0ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgICAgfTtcblxuICAgICAgY29uc3Qgb3JzID0gcGVybUZpZWxkcy5mbGF0TWFwKGtleSA9PiB7XG4gICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHNpbmdsZSBwb2ludGVyIHNldHVwXG4gICAgICAgIGNvbnN0IHEgPSB7XG4gICAgICAgICAgW2tleV06IHVzZXJQb2ludGVyLFxuICAgICAgICB9O1xuICAgICAgICAvLyBjb25zdHJhaW50IGZvciB1c2Vycy1hcnJheSBzZXR1cFxuICAgICAgICBjb25zdCBxYSA9IHtcbiAgICAgICAgICBba2V5XTogeyAkYWxsOiBbdXNlclBvaW50ZXJdIH0sXG4gICAgICAgIH07XG4gICAgICAgIC8vIGlmIHdlIGFscmVhZHkgaGF2ZSBhIGNvbnN0cmFpbnQgb24gdGhlIGtleSwgdXNlIHRoZSAkYW5kXG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocXVlcnksIGtleSkpIHtcbiAgICAgICAgICByZXR1cm4gW3sgJGFuZDogW3EsIHF1ZXJ5XSB9LCB7ICRhbmQ6IFtxYSwgcXVlcnldIH1dO1xuICAgICAgICB9XG4gICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGFkZCB0aGUgY29uc3RhaW50XG4gICAgICAgIHJldHVybiBbT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHEpLCBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgcWEpXTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHsgJG9yOiBvcnMgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55ID0ge30sXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW10sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgcXVlcnlPcHRpb25zOiBGdWxsUXVlcnlPcHRpb25zID0ge31cbiAgKTogbnVsbCB8IHN0cmluZ1tdIHtcbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXBlcm1zKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IHBlcm1zLnByb3RlY3RlZEZpZWxkcztcbiAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoYWNsR3JvdXAuaW5kZXhPZihxdWVyeS5vYmplY3RJZCkgPiAtMSkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBmb3IgcXVlcmllcyB3aGVyZSBcImtleXNcIiBhcmUgc2V0IGFuZCBkbyBub3QgaW5jbHVkZSBhbGwgJ3VzZXJGaWVsZCc6e2ZpZWxkfSxcbiAgICAvLyB3ZSBoYXZlIHRvIHRyYW5zcGFyZW50bHkgaW5jbHVkZSBpdCwgYW5kIHRoZW4gcmVtb3ZlIGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50XG4gICAgLy8gQmVjYXVzZSBpZiBzdWNoIGtleSBub3QgcHJvamVjdGVkIHRoZSBwZXJtaXNzaW9uIHdvbid0IGJlIGVuZm9yY2VkIHByb3Blcmx5XG4gICAgLy8gUFMgdGhpcyBpcyBjYWxsZWQgd2hlbiAnZXhjbHVkZUtleXMnIGFscmVhZHkgcmVkdWNlZCB0byAna2V5cydcbiAgICBjb25zdCBwcmVzZXJ2ZUtleXMgPSBxdWVyeU9wdGlvbnMua2V5cztcblxuICAgIC8vIHRoZXNlIGFyZSBrZXlzIHRoYXQgbmVlZCB0byBiZSBpbmNsdWRlZCBvbmx5XG4gICAgLy8gdG8gYmUgYWJsZSB0byBhcHBseSBwcm90ZWN0ZWRGaWVsZHMgYnkgcG9pbnRlclxuICAgIC8vIGFuZCB0aGVuIHVuc2V0IGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50IChsYXRlciBpbiAgZmlsdGVyU2Vuc2l0aXZlRmllbGRzKVxuICAgIGNvbnN0IHNlcnZlck9ubHlLZXlzID0gW107XG5cbiAgICBjb25zdCBhdXRoZW50aWNhdGVkID0gYXV0aC51c2VyO1xuXG4gICAgLy8gbWFwIHRvIGFsbG93IGNoZWNrIHdpdGhvdXQgYXJyYXkgc2VhcmNoXG4gICAgY29uc3Qgcm9sZXMgPSAoYXV0aC51c2VyUm9sZXMgfHwgW10pLnJlZHVjZSgoYWNjLCByKSA9PiB7XG4gICAgICBhY2Nbcl0gPSBwcm90ZWN0ZWRGaWVsZHNbcl07XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIGFycmF5IG9mIHNldHMgb2YgcHJvdGVjdGVkIGZpZWxkcy4gc2VwYXJhdGUgaXRlbSBmb3IgZWFjaCBhcHBsaWNhYmxlIGNyaXRlcmlhXG4gICAgY29uc3QgcHJvdGVjdGVkS2V5c1NldHMgPSBbXTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gc2tpcCB1c2VyRmllbGRzXG4gICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSkge1xuICAgICAgICBpZiAocHJlc2VydmVLZXlzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZygxMCk7XG4gICAgICAgICAgaWYgKCFwcmVzZXJ2ZUtleXMuaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgICAgICAgLy8gMS4gcHV0IGl0IHRoZXJlIHRlbXBvcmFyaWx5XG4gICAgICAgICAgICBxdWVyeU9wdGlvbnMua2V5cyAmJiBxdWVyeU9wdGlvbnMua2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAvLyAyLiBwcmVzZXJ2ZSBpdCBkZWxldGUgbGF0ZXJcbiAgICAgICAgICAgIHNlcnZlck9ubHlLZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIGFkZCBwdWJsaWMgdGllclxuICAgICAgaWYgKGtleSA9PT0gJyonKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG4gICAgICAgICAgLy8gZm9yIGxvZ2dlZCBpbiB1c2Vyc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJvbGVzW2tleV0gJiYga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpIHtcbiAgICAgICAgICAvLyBhZGQgYXBwbGljYWJsZSByb2xlc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocm9sZXNba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjaGVjayBpZiB0aGVyZSdzIGEgcnVsZSBmb3IgY3VycmVudCB1c2VyJ3MgaWRcbiAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgY29uc3QgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuICAgICAgaWYgKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHByZXNlcnZlIGZpZWxkcyB0byBiZSByZW1vdmVkIGJlZm9yZSBzZW5kaW5nIHJlc3BvbnNlIHRvIGNsaWVudFxuICAgIGlmIChzZXJ2ZXJPbmx5S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyA9IHNlcnZlck9ubHlLZXlzO1xuICAgIH1cblxuICAgIGxldCBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5c1NldHMucmVkdWNlKChhY2MsIG5leHQpID0+IHtcbiAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgIGFjYy5wdXNoKC4uLm5leHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCBbXSk7XG5cbiAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgcHJvdGVjdGVkS2V5c1NldHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5cy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHByb3RlY3RlZEtleXM7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKVxuICAgICAgLnRoZW4odHJhbnNhY3Rpb25hbFNlc3Npb24gPT4ge1xuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uO1xuICAgICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBjb21taXQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gYWJvcnQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gVE9ETzogY3JlYXRlIGluZGV4ZXMgb24gZmlyc3QgY3JlYXRpb24gb2YgYSBfVXNlciBvYmplY3QuIE90aGVyd2lzZSBpdCdzIGltcG9zc2libGUgdG9cbiAgLy8gaGF2ZSBhIFBhcnNlIGFwcCB3aXRob3V0IGl0IGhhdmluZyBhIF9Vc2VyIGNvbGxlY3Rpb24uXG4gIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpIHtcbiAgICBjb25zdCByZXF1aXJlZFVzZXJGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fVXNlcixcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZFJvbGVGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fUm9sZSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIGNvbnN0IHVzZXJDbGFzc1Byb21pc2UgPSB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PlxuICAgICAgc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1VzZXInKVxuICAgICk7XG4gICAgY29uc3Qgcm9sZUNsYXNzUHJvbWlzZSA9IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+XG4gICAgICBzY2hlbWEuZW5mb3JjZUNsYXNzRXhpc3RzKCdfUm9sZScpXG4gICAgKTtcblxuICAgIGNvbnN0IHVzZXJuYW1lVW5pcXVlbmVzcyA9IHVzZXJDbGFzc1Byb21pc2VcbiAgICAgIC50aGVuKCgpID0+XG4gICAgICAgIHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlcm5hbWVzOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCB1c2VybmFtZUNhc2VJbnNlbnNpdGl2ZUluZGV4ID0gdXNlckNsYXNzUHJvbWlzZVxuICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgdGhpcy5hZGFwdGVyLmVuc3VyZUluZGV4KFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgcmVxdWlyZWRVc2VyRmllbGRzLFxuICAgICAgICAgIFsndXNlcm5hbWUnXSxcbiAgICAgICAgICAnY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZScsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICAnVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIHVzZXJuYW1lIGluZGV4OiAnLFxuICAgICAgICAgIGVycm9yXG4gICAgICAgICk7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCBlbWFpbFVuaXF1ZW5lc3MgPSB1c2VyQ2xhc3NQcm9taXNlXG4gICAgICAudGhlbigoKSA9PlxuICAgICAgICB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICAgICdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXIgZW1haWwgYWRkcmVzc2VzOiAnLFxuICAgICAgICAgIGVycm9yXG4gICAgICAgICk7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCBlbWFpbENhc2VJbnNlbnNpdGl2ZUluZGV4ID0gdXNlckNsYXNzUHJvbWlzZVxuICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgdGhpcy5hZGFwdGVyLmVuc3VyZUluZGV4KFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgcmVxdWlyZWRVc2VyRmllbGRzLFxuICAgICAgICAgIFsnZW1haWwnXSxcbiAgICAgICAgICAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIGVtYWlsIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCByb2xlVW5pcXVlbmVzcyA9IHJvbGVDbGFzc1Byb21pc2VcbiAgICAgIC50aGVuKCgpID0+XG4gICAgICAgIHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfUm9sZScsIHJlcXVpcmVkUm9sZUZpZWxkcywgWyduYW1lJ10pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciByb2xlIG5hbWU6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcblxuICAgIGNvbnN0IGluZGV4UHJvbWlzZSA9IHRoaXMuYWRhcHRlci51cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpO1xuXG4gICAgLy8gQ3JlYXRlIHRhYmxlcyBmb3Igdm9sYXRpbGUgY2xhc3Nlc1xuICAgIGNvbnN0IGFkYXB0ZXJJbml0ID0gdGhpcy5hZGFwdGVyLnBlcmZvcm1Jbml0aWFsaXphdGlvbih7XG4gICAgICBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzOiBTY2hlbWFDb250cm9sbGVyLlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMsXG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKFtcbiAgICAgIHVzZXJuYW1lVW5pcXVlbmVzcyxcbiAgICAgIHVzZXJuYW1lQ2FzZUluc2Vuc2l0aXZlSW5kZXgsXG4gICAgICBlbWFpbFVuaXF1ZW5lc3MsXG4gICAgICBlbWFpbENhc2VJbnNlbnNpdGl2ZUluZGV4LFxuICAgICAgcm9sZVVuaXF1ZW5lc3MsXG4gICAgICBhZGFwdGVySW5pdCxcbiAgICAgIGluZGV4UHJvbWlzZSxcbiAgICBdKTtcbiAgfVxuXG4gIHN0YXRpYyBfdmFsaWRhdGVRdWVyeTogKGFueSwgYm9vbGVhbikgPT4gdm9pZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBEYXRhYmFzZUNvbnRyb2xsZXI7XG4vLyBFeHBvc2UgdmFsaWRhdGVRdWVyeSBmb3IgdGVzdHNcbm1vZHVsZS5leHBvcnRzLl92YWxpZGF0ZVF1ZXJ5ID0gdmFsaWRhdGVRdWVyeTtcbiJdfQ==