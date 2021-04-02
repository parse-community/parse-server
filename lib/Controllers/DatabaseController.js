"use strict";

var _node = require("parse/node");

var _lodash = _interopRequireDefault(require("lodash"));

var _intersect = _interopRequireDefault(require("intersect"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var _logger = _interopRequireDefault(require("../logger"));

var SchemaController = _interopRequireWildcard(require("./SchemaController"));

var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");

var _MongoStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Mongo/MongoStorageAdapter"));

var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));

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

const validateQuery = query => {
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }

  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(validateQuery);
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

  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(validateQuery);
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
}; // Runs an update on the database.
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
  constructor(adapter) {
    this.adapter = adapter; // We don't want a mutable this.schema, because then you could have
    // one request that uses different schemas for different parts of
    // it. Instead, use loadSchema to get a schema.

    this.schemaPromise = null;
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

    this.schemaPromise = SchemaController.load(this.adapter, options);
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

        validateQuery(query);
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

            if (!SchemaController.fieldNameIsValid(rootFieldName, className) && !isSpecialUpdateKey(rootFieldName)) {
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

        validateQuery(query);
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

    _SchemaCache.default.clear();

    return this.adapter.deleteAllClasses(fast);
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
    }, {
      keys: ['owningId']
    }).then(results => results.map(result => result.owningId));
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

          if (!SchemaController.fieldNameIsValid(rootFieldName, className)) {
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

          validateQuery(query);

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
    let schemaController;
    return this.loadSchema({
      clearCache: true
    }).then(s => {
      schemaController = s;
      return schemaController.getOneSchema(className, true);
    }).catch(error => {
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
            _SchemaCache.default.del(className);

            return schemaController.reloadData();
          });
        } else {
          return Promise.resolve();
        }
      });
    });
  } // This helps to create intermediate objects for simpler comparison of
  // key value pairs used in query objects. Each key value pair will represented
  // in a similar way to json


  objectToEntriesStrings(query) {
    return Object.entries(query).map(a => a.map(s => JSON.stringify(s)).join(':'));
  } // Naive logic reducer for OR operations meant to be used only for pointer permissions.


  reduceOrOperation(query) {
    if (!query.$or) {
      return query;
    }

    const queries = query.$or.map(q => this.objectToEntriesStrings(q));
    let repeat = false;

    do {
      repeat = false;

      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce((acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0), 0);
          const shorterEntries = queries[shorter].length;

          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the longer query.
            query.$or.splice(longer, 1);
            queries.splice(longer, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);

    if (query.$or.length === 1) {
      query = _objectSpread(_objectSpread({}, query), query.$or[0]);
      delete query.$or;
    }

    return query;
  } // Naive logic reducer for AND operations meant to be used only for pointer permissions.


  reduceAndOperation(query) {
    if (!query.$and) {
      return query;
    }

    const queries = query.$and.map(q => this.objectToEntriesStrings(q));
    let repeat = false;

    do {
      repeat = false;

      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce((acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0), 0);
          const shorterEntries = queries[shorter].length;

          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the shorter query.
            query.$and.splice(shorter, 1);
            queries.splice(shorter, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);

    if (query.$and.length === 1) {
      query = _objectSpread(_objectSpread({}, query), query.$and[0]);
      delete query.$and;
    }

    return query;
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
      const queries = permFields.map(key => {
        const fieldDescriptor = schema.getExpectedType(className, key);
        const fieldType = fieldDescriptor && typeof fieldDescriptor === 'object' && Object.prototype.hasOwnProperty.call(fieldDescriptor, 'type') ? fieldDescriptor.type : null;
        let queryClause;

        if (fieldType === 'Pointer') {
          // constraint for single pointer setup
          queryClause = {
            [key]: userPointer
          };
        } else if (fieldType === 'Array') {
          // constraint for users-array setup
          queryClause = {
            [key]: {
              $all: [userPointer]
            }
          };
        } else if (fieldType === 'Object') {
          // constraint for object setup
          queryClause = {
            [key]: userPointer
          };
        } else {
          // This means that there is a CLP field of an unexpected type. This condition should not happen, which is
          // why is being treated as an error.
          throw Error(`An unexpected condition occurred when resolving pointer permissions: ${className} ${key}`);
        } // if we already have a constraint on the key, use the $and


        if (Object.prototype.hasOwnProperty.call(query, key)) {
          return this.reduceAndOperation({
            $and: [queryClause, query]
          });
        } // otherwise just add the constaint


        return Object.assign({}, query, queryClause);
      });
      return queries.length === 1 ? queries[0] : this.reduceOrOperation({
        $or: queries
      });
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


  async performInitialization() {
    await this.adapter.performInitialization({
      VolatileClassesSchemas: SchemaController.VolatileClassesSchemas
    });
    const requiredUserFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._User)
    };
    const requiredRoleFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._Role)
    };
    const requiredIdempotencyFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._Idempotency)
    };
    await this.loadSchema().then(schema => schema.enforceClassExists('_User'));
    await this.loadSchema().then(schema => schema.enforceClassExists('_Role'));

    if (this.adapter instanceof _MongoStorageAdapter.default) {
      await this.loadSchema().then(schema => schema.enforceClassExists('_Idempotency'));
    }

    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['username']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for usernames: ', error);

      throw error;
    });
    await this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true).catch(error => {
      _logger.default.warn('Unable to create case insensitive username index: ', error);

      throw error;
    });
    await this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true).catch(error => {
      _logger.default.warn('Unable to create case insensitive username index: ', error);

      throw error;
    });
    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['email']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);

      throw error;
    });
    await this.adapter.ensureIndex('_User', requiredUserFields, ['email'], 'case_insensitive_email', true).catch(error => {
      _logger.default.warn('Unable to create case insensitive email index: ', error);

      throw error;
    });
    await this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for role name: ', error);

      throw error;
    });

    if (this.adapter instanceof _MongoStorageAdapter.default) {
      await this.adapter.ensureUniqueness('_Idempotency', requiredIdempotencyFields, ['reqId']).catch(error => {
        _logger.default.warn('Unable to ensure uniqueness for idempotency request ID: ', error);

        throw error;
      });
      await this.adapter.ensureIndex('_Idempotency', requiredIdempotencyFields, ['expire'], 'ttl', false, {
        ttl: 0
      }).catch(error => {
        _logger.default.warn('Unable to create TTL index for idempotency expire date: ', error);

        throw error;
      });
    }

    await this.adapter.updateSchemaWithIndexes();
  }

}

module.exports = DatabaseController; // Expose validateQuery for tests

module.exports._validateQuery = validateQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwibmFtZXMiOlsiYWRkV3JpdGVBQ0wiLCJxdWVyeSIsImFjbCIsIm5ld1F1ZXJ5IiwiXyIsImNsb25lRGVlcCIsIl93cGVybSIsIiRpbiIsImFkZFJlYWRBQ0wiLCJfcnBlcm0iLCJ0cmFuc2Zvcm1PYmplY3RBQ0wiLCJBQ0wiLCJyZXN1bHQiLCJlbnRyeSIsInJlYWQiLCJwdXNoIiwid3JpdGUiLCJzcGVjaWFsUXVlcnlrZXlzIiwiaXNTcGVjaWFsUXVlcnlLZXkiLCJrZXkiLCJpbmRleE9mIiwidmFsaWRhdGVRdWVyeSIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiJG9yIiwiQXJyYXkiLCJmb3JFYWNoIiwiJGFuZCIsIiRub3IiLCJsZW5ndGgiLCJPYmplY3QiLCJrZXlzIiwiJHJlZ2V4IiwiJG9wdGlvbnMiLCJtYXRjaCIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiaXNNYXN0ZXIiLCJhY2xHcm91cCIsImF1dGgiLCJvcGVyYXRpb24iLCJzY2hlbWEiLCJjbGFzc05hbWUiLCJwcm90ZWN0ZWRGaWVsZHMiLCJvYmplY3QiLCJ1c2VySWQiLCJ1c2VyIiwiaWQiLCJwZXJtcyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlzUmVhZE9wZXJhdGlvbiIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtIiwiZmlsdGVyIiwic3RhcnRzV2l0aCIsIm1hcCIsInN1YnN0cmluZyIsInZhbHVlIiwibmV3UHJvdGVjdGVkRmllbGRzIiwib3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMiLCJwb2ludGVyUGVybSIsInBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyIiwicmVhZFVzZXJGaWVsZFZhbHVlIiwiaXNBcnJheSIsInNvbWUiLCJvYmplY3RJZCIsImZpZWxkcyIsInYiLCJpbmNsdWRlcyIsImlzVXNlckNsYXNzIiwiayIsInRlbXBvcmFyeUtleXMiLCJwYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJzZXNzaW9uVG9rZW4iLCJfZW1haWxfdmVyaWZ5X3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3RvbWJzdG9uZSIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIl9wYXNzd29yZF9oaXN0b3J5IiwiYXV0aERhdGEiLCJzcGVjaWFsS2V5c0ZvclVwZGF0ZSIsImlzU3BlY2lhbFVwZGF0ZUtleSIsImV4cGFuZFJlc3VsdE9uS2V5UGF0aCIsInBhdGgiLCJzcGxpdCIsImZpcnN0S2V5IiwibmV4dFBhdGgiLCJzbGljZSIsImpvaW4iLCJzYW5pdGl6ZURhdGFiYXNlUmVzdWx0Iiwib3JpZ2luYWxPYmplY3QiLCJyZXNwb25zZSIsIlByb21pc2UiLCJyZXNvbHZlIiwia2V5VXBkYXRlIiwiX19vcCIsImpvaW5UYWJsZU5hbWUiLCJmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlIiwiYW1vdW50IiwiSU5WQUxJRF9KU09OIiwib2JqZWN0cyIsIkNPTU1BTkRfVU5BVkFJTEFCTEUiLCJ0cmFuc2Zvcm1BdXRoRGF0YSIsInByb3ZpZGVyIiwicHJvdmlkZXJEYXRhIiwiZmllbGROYW1lIiwidHlwZSIsInVudHJhbnNmb3JtT2JqZWN0QUNMIiwib3V0cHV0IiwiZ2V0Um9vdEZpZWxkTmFtZSIsInJlbGF0aW9uU2NoZW1hIiwicmVsYXRlZElkIiwib3duaW5nSWQiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFkYXB0ZXIiLCJzY2hlbWFQcm9taXNlIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29sbGVjdGlvbkV4aXN0cyIsImNsYXNzRXhpc3RzIiwicHVyZ2VDb2xsZWN0aW9uIiwibG9hZFNjaGVtYSIsInRoZW4iLCJzY2hlbWFDb250cm9sbGVyIiwiZ2V0T25lU2NoZW1hIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ2YWxpZGF0ZUNsYXNzTmFtZSIsIlNjaGVtYUNvbnRyb2xsZXIiLCJjbGFzc05hbWVJc1ZhbGlkIiwicmVqZWN0IiwiSU5WQUxJRF9DTEFTU19OQU1FIiwib3B0aW9ucyIsImNsZWFyQ2FjaGUiLCJsb2FkIiwibG9hZFNjaGVtYUlmTmVlZGVkIiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJ0IiwiZ2V0RXhwZWN0ZWRUeXBlIiwidGFyZ2V0Q2xhc3MiLCJ2YWxpZGF0ZU9iamVjdCIsInJ1bk9wdGlvbnMiLCJ1bmRlZmluZWQiLCJzIiwiY2FuQWRkRmllbGQiLCJ1cGRhdGUiLCJtYW55IiwidXBzZXJ0IiwiYWRkc0ZpZWxkIiwic2tpcFNhbml0aXphdGlvbiIsInZhbGlkYXRlT25seSIsInZhbGlkU2NoZW1hQ29udHJvbGxlciIsIm9yaWdpbmFsUXVlcnkiLCJvcmlnaW5hbFVwZGF0ZSIsInJlbGF0aW9uVXBkYXRlcyIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNvbGxlY3RSZWxhdGlvblVwZGF0ZXMiLCJhZGRQb2ludGVyUGVybWlzc2lvbnMiLCJjYXRjaCIsImVycm9yIiwicm9vdEZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWQiLCJ1cGRhdGVPcGVyYXRpb24iLCJpbm5lcktleSIsIklOVkFMSURfTkVTVEVEX0tFWSIsImZpbmQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cHNlcnRPbmVPYmplY3QiLCJmaW5kT25lQW5kVXBkYXRlIiwiaGFuZGxlUmVsYXRpb25VcGRhdGVzIiwib3BzIiwiZGVsZXRlTWUiLCJwcm9jZXNzIiwib3AiLCJ4IiwicGVuZGluZyIsImFkZFJlbGF0aW9uIiwicmVtb3ZlUmVsYXRpb24iLCJhbGwiLCJmcm9tQ2xhc3NOYW1lIiwiZnJvbUlkIiwidG9JZCIsImRvYyIsImNvZGUiLCJkZXN0cm95IiwicGFyc2VGb3JtYXRTY2hlbWEiLCJjcmVhdGUiLCJjcmVhdGVkQXQiLCJpc28iLCJfX3R5cGUiLCJ1cGRhdGVkQXQiLCJlbmZvcmNlQ2xhc3NFeGlzdHMiLCJjcmVhdGVPYmplY3QiLCJjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hIiwiY2xhc3NTY2hlbWEiLCJzY2hlbWFEYXRhIiwic2NoZW1hRmllbGRzIiwibmV3S2V5cyIsImZpZWxkIiwiYWN0aW9uIiwiZGVsZXRlRXZlcnl0aGluZyIsImZhc3QiLCJTY2hlbWFDYWNoZSIsImNsZWFyIiwiZGVsZXRlQWxsQ2xhc3NlcyIsInJlbGF0ZWRJZHMiLCJxdWVyeU9wdGlvbnMiLCJza2lwIiwibGltaXQiLCJzb3J0IiwiZmluZE9wdGlvbnMiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwiX2lkIiwicmVzdWx0cyIsIm93bmluZ0lkcyIsInJlZHVjZUluUmVsYXRpb24iLCJvcnMiLCJhUXVlcnkiLCJpbmRleCIsInByb21pc2VzIiwicXVlcmllcyIsImNvbnN0cmFpbnRLZXkiLCJpc05lZ2F0aW9uIiwiciIsInEiLCJpZHMiLCJhZGROb3RJbk9iamVjdElkc0lkcyIsImFkZEluT2JqZWN0SWRzSWRzIiwicmVkdWNlUmVsYXRpb25LZXlzIiwicmVsYXRlZFRvIiwiaWRzRnJvbVN0cmluZyIsImlkc0Zyb21FcSIsImlkc0Zyb21JbiIsImFsbElkcyIsImxpc3QiLCJ0b3RhbExlbmd0aCIsInJlZHVjZSIsIm1lbW8iLCJpZHNJbnRlcnNlY3Rpb24iLCJpbnRlcnNlY3QiLCJiaWciLCIkZXEiLCJpZHNGcm9tTmluIiwiU2V0IiwiJG5pbiIsImNvdW50IiwiZGlzdGluY3QiLCJwaXBlbGluZSIsInJlYWRQcmVmZXJlbmNlIiwiaGludCIsImNhc2VJbnNlbnNpdGl2ZSIsImV4cGxhaW4iLCJfY3JlYXRlZF9hdCIsIl91cGRhdGVkX2F0IiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiYWdncmVnYXRlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZGVsZXRlU2NoZW1hIiwiZGVsZXRlQ2xhc3MiLCJ3YXNQYXJzZUNvbGxlY3Rpb24iLCJyZWxhdGlvbkZpZWxkTmFtZXMiLCJuYW1lIiwiZGVsIiwicmVsb2FkRGF0YSIsIm9iamVjdFRvRW50cmllc1N0cmluZ3MiLCJlbnRyaWVzIiwiYSIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZWR1Y2VPck9wZXJhdGlvbiIsInJlcGVhdCIsImkiLCJqIiwic2hvcnRlciIsImxvbmdlciIsImZvdW5kRW50cmllcyIsImFjYyIsInNob3J0ZXJFbnRyaWVzIiwic3BsaWNlIiwicmVkdWNlQW5kT3BlcmF0aW9uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwidXNlckFDTCIsImdyb3VwS2V5IiwicGVybUZpZWxkcyIsInBvaW50ZXJGaWVsZHMiLCJ1c2VyUG9pbnRlciIsImZpZWxkRGVzY3JpcHRvciIsImZpZWxkVHlwZSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInF1ZXJ5Q2xhdXNlIiwiJGFsbCIsImFzc2lnbiIsInByZXNlcnZlS2V5cyIsInNlcnZlck9ubHlLZXlzIiwiYXV0aGVudGljYXRlZCIsInJvbGVzIiwidXNlclJvbGVzIiwicHJvdGVjdGVkS2V5c1NldHMiLCJwcm90ZWN0ZWRLZXlzIiwibmV4dCIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwicmVxdWlyZWRVc2VyRmllbGRzIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsIl9Vc2VyIiwicmVxdWlyZWRSb2xlRmllbGRzIiwiX1JvbGUiLCJyZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzIiwiX0lkZW1wb3RlbmN5IiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsImVuc3VyZVVuaXF1ZW5lc3MiLCJsb2dnZXIiLCJ3YXJuIiwiZW5zdXJlSW5kZXgiLCJ0dGwiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsIm1vZHVsZSIsImV4cG9ydHMiLCJfdmFsaWRhdGVRdWVyeSJdLCJtYXBwaW5ncyI6Ijs7QUFLQTs7QUFFQTs7QUFFQTs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBSUEsU0FBU0EsV0FBVCxDQUFxQkMsS0FBckIsRUFBNEJDLEdBQTVCLEVBQWlDO0FBQy9CLFFBQU1DLFFBQVEsR0FBR0MsZ0JBQUVDLFNBQUYsQ0FBWUosS0FBWixDQUFqQixDQUQrQixDQUUvQjs7O0FBQ0FFLEVBQUFBLFFBQVEsQ0FBQ0csTUFBVCxHQUFrQjtBQUFFQyxJQUFBQSxHQUFHLEVBQUUsQ0FBQyxJQUFELEVBQU8sR0FBR0wsR0FBVjtBQUFQLEdBQWxCO0FBQ0EsU0FBT0MsUUFBUDtBQUNEOztBQUVELFNBQVNLLFVBQVQsQ0FBb0JQLEtBQXBCLEVBQTJCQyxHQUEzQixFQUFnQztBQUM5QixRQUFNQyxRQUFRLEdBQUdDLGdCQUFFQyxTQUFGLENBQVlKLEtBQVosQ0FBakIsQ0FEOEIsQ0FFOUI7OztBQUNBRSxFQUFBQSxRQUFRLENBQUNNLE1BQVQsR0FBa0I7QUFBRUYsSUFBQUEsR0FBRyxFQUFFLENBQUMsSUFBRCxFQUFPLEdBQVAsRUFBWSxHQUFHTCxHQUFmO0FBQVAsR0FBbEI7QUFDQSxTQUFPQyxRQUFQO0FBQ0QsQyxDQUVEOzs7QUFDQSxNQUFNTyxrQkFBa0IsR0FBRyxVQUF3QjtBQUFBLE1BQXZCO0FBQUVDLElBQUFBO0FBQUYsR0FBdUI7QUFBQSxNQUFiQyxNQUFhOztBQUNqRCxNQUFJLENBQUNELEdBQUwsRUFBVTtBQUNSLFdBQU9DLE1BQVA7QUFDRDs7QUFFREEsRUFBQUEsTUFBTSxDQUFDTixNQUFQLEdBQWdCLEVBQWhCO0FBQ0FNLEVBQUFBLE1BQU0sQ0FBQ0gsTUFBUCxHQUFnQixFQUFoQjs7QUFFQSxPQUFLLE1BQU1JLEtBQVgsSUFBb0JGLEdBQXBCLEVBQXlCO0FBQ3ZC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S0FBSzNDLE9BQUwsQ0FDSDZNLFdBREcsQ0FDUyxjQURULEVBQ3lCTix5QkFEekIsRUFDb0QsQ0FBQyxRQUFELENBRHBELEVBQ2dFLEtBRGhFLEVBQ3VFLEtBRHZFLEVBQzhFO0FBQ2hGTyxRQUFBQSxHQUFHLEVBQUU7QUFEMkUsT0FEOUUsRUFJSHBLLEtBSkcsQ0FJR0MsS0FBSyxJQUFJO0FBQ2RnSyx3QkFBT0MsSUFBUCxDQUFZLDBEQUFaLEVBQXdFakssS0FBeEU7O0FBQ0EsY0FBTUEsS0FBTjtBQUNELE9BUEcsQ0FBTjtBQVFEOztBQUNELFVBQU0sS0FBSzNDLE9BQUwsQ0FBYStNLHVCQUFiLEVBQU47QUFDRDs7QUEvMENzQjs7QUFvMUN6QkMsTUFBTSxDQUFDQyxPQUFQLEdBQWlCbk4sa0JBQWpCLEMsQ0FDQTs7QUFDQWtOLE1BQU0sQ0FBQ0MsT0FBUCxDQUFlQyxjQUFmLEdBQWdDclQsYUFBaEMiLCJzb3VyY2VzQ29udGVudCI6WyLvu78vLyBAZmxvd1xuLy8gQSBkYXRhYmFzZSBhZGFwdGVyIHRoYXQgd29ya3Mgd2l0aCBkYXRhIGV4cG9ydGVkIGZyb20gdGhlIGhvc3RlZFxuLy8gUGFyc2UgZGF0YWJhc2UuXG5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGludGVyc2VjdCBmcm9tICdpbnRlcnNlY3QnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0ICogYXMgU2NoZW1hQ29udHJvbGxlciBmcm9tICcuL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBNb25nb1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHR5cGUgeyBMb2FkU2NoZW1hT3B0aW9ucyB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHR5cGUgeyBRdWVyeU9wdGlvbnMsIEZ1bGxRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcblxuZnVuY3Rpb24gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ193cGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fd3Blcm0gPSB7ICRpbjogW251bGwsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG5mdW5jdGlvbiBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfcnBlcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3JwZXJtID0geyAkaW46IFtudWxsLCAnKicsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG4vLyBUcmFuc2Zvcm1zIGEgUkVTVCBBUEkgZm9ybWF0dGVkIEFDTCBvYmplY3QgdG8gb3VyIHR3by1maWVsZCBtb25nbyBmb3JtYXQuXG5jb25zdCB0cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBBQ0wsIC4uLnJlc3VsdCB9KSA9PiB7XG4gIGlmICghQUNMKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHJlc3VsdC5fd3Blcm0gPSBbXTtcbiAgcmVzdWx0Ll9ycGVybSA9IFtdO1xuXG4gIGZvciAoY29uc3QgZW50cnkgaW4gQUNMKSB7XG4gICAgaWYgKEFDTFtlbnRyeV0ucmVhZCkge1xuICAgICAgcmVzdWx0Ll9ycGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gICAgaWYgKEFDTFtlbnRyeV0ud3JpdGUpIHtcbiAgICAgIHJlc3VsdC5fd3Blcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5jb25zdCBzcGVjaWFsUXVlcnlrZXlzID0gW1xuICAnJGFuZCcsXG4gICckb3InLFxuICAnJG5vcicsXG4gICdfcnBlcm0nLFxuICAnX3dwZXJtJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFF1ZXJ5S2V5ID0ga2V5ID0+IHtcbiAgcmV0dXJuIHNwZWNpYWxRdWVyeWtleXMuaW5kZXhPZihrZXkpID49IDA7XG59O1xuXG5jb25zdCB2YWxpZGF0ZVF1ZXJ5ID0gKHF1ZXJ5OiBhbnkpOiB2b2lkID0+IHtcbiAgaWYgKHF1ZXJ5LkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQ2Fubm90IHF1ZXJ5IG9uIEFDTC4nKTtcbiAgfVxuXG4gIGlmIChxdWVyeS4kb3IpIHtcbiAgICBpZiAocXVlcnkuJG9yIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkb3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kYW5kKSB7XG4gICAgaWYgKHF1ZXJ5LiRhbmQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJGFuZC5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkYW5kIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJG5vcikge1xuICAgIGlmIChxdWVyeS4kbm9yIGluc3RhbmNlb2YgQXJyYXkgJiYgcXVlcnkuJG5vci5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeS4kbm9yLmZvckVhY2godmFsaWRhdGVRdWVyeSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkbm9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSBvZiBhdCBsZWFzdCAxIHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAocXVlcnkgJiYgcXVlcnlba2V5XSAmJiBxdWVyeVtrZXldLiRyZWdleCkge1xuICAgICAgaWYgKHR5cGVvZiBxdWVyeVtrZXldLiRvcHRpb25zID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXF1ZXJ5W2tleV0uJG9wdGlvbnMubWF0Y2goL15baW14c10rJC8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgIGBCYWQgJG9wdGlvbnMgdmFsdWUgZm9yIHF1ZXJ5OiAke3F1ZXJ5W2tleV0uJG9wdGlvbnN9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFpc1NwZWNpYWxRdWVyeUtleShrZXkpICYmICFrZXkubWF0Y2goL15bYS16QS1aXVthLXpBLVowLTlfXFwuXSokLykpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgSW52YWxpZCBrZXkgbmFtZTogJHtrZXl9YCk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIEZpbHRlcnMgb3V0IGFueSBkYXRhIHRoYXQgc2hvdWxkbid0IGJlIG9uIHRoaXMgUkVTVC1mb3JtYXR0ZWQgb2JqZWN0LlxuY29uc3QgZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IChcbiAgaXNNYXN0ZXI6IGJvb2xlYW4sXG4gIGFjbEdyb3VwOiBhbnlbXSxcbiAgYXV0aDogYW55LFxuICBvcGVyYXRpb246IGFueSxcbiAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gIGNsYXNzTmFtZTogc3RyaW5nLFxuICBwcm90ZWN0ZWRGaWVsZHM6IG51bGwgfCBBcnJheTxhbnk+LFxuICBvYmplY3Q6IGFueVxuKSA9PiB7XG4gIGxldCB1c2VySWQgPSBudWxsO1xuICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHVzZXJJZCA9IGF1dGgudXNlci5pZDtcblxuICAvLyByZXBsYWNlIHByb3RlY3RlZEZpZWxkcyB3aGVuIHVzaW5nIHBvaW50ZXItcGVybWlzc2lvbnNcbiAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gIGlmIChwZXJtcykge1xuICAgIGNvbnN0IGlzUmVhZE9wZXJhdGlvbiA9IFsnZ2V0JywgJ2ZpbmQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMTtcblxuICAgIGlmIChpc1JlYWRPcGVyYXRpb24gJiYgcGVybXMucHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBleHRyYWN0IHByb3RlY3RlZEZpZWxkcyBhZGRlZCB3aXRoIHRoZSBwb2ludGVyLXBlcm1pc3Npb24gcHJlZml4XG4gICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybSA9IE9iamVjdC5rZXlzKHBlcm1zLnByb3RlY3RlZEZpZWxkcylcbiAgICAgICAgLmZpbHRlcihrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSlcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIHJldHVybiB7IGtleToga2V5LnN1YnN0cmluZygxMCksIHZhbHVlOiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB9O1xuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbmV3UHJvdGVjdGVkRmllbGRzOiBBcnJheTxzdHJpbmc+W10gPSBbXTtcbiAgICAgIGxldCBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IGZhbHNlO1xuXG4gICAgICAvLyBjaGVjayBpZiB0aGUgb2JqZWN0IGdyYW50cyB0aGUgY3VycmVudCB1c2VyIGFjY2VzcyBiYXNlZCBvbiB0aGUgZXh0cmFjdGVkIGZpZWxkc1xuICAgICAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0uZm9yRWFjaChwb2ludGVyUGVybSA9PiB7XG4gICAgICAgIGxldCBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IGZhbHNlO1xuICAgICAgICBjb25zdCByZWFkVXNlckZpZWxkVmFsdWUgPSBvYmplY3RbcG9pbnRlclBlcm0ua2V5XTtcbiAgICAgICAgaWYgKHJlYWRVc2VyRmllbGRWYWx1ZSkge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlYWRVc2VyRmllbGRWYWx1ZSkpIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gcmVhZFVzZXJGaWVsZFZhbHVlLnNvbWUoXG4gICAgICAgICAgICAgIHVzZXIgPT4gdXNlci5vYmplY3RJZCAmJiB1c2VyLm9iamVjdElkID09PSB1c2VySWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID1cbiAgICAgICAgICAgICAgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkICYmIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCA9PT0gdXNlcklkO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwb2ludGVyUGVybUluY2x1ZGVzVXNlcikge1xuICAgICAgICAgIG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gdHJ1ZTtcbiAgICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwb2ludGVyUGVybS52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBpZiBhdCBsZWFzdCBvbmUgcG9pbnRlci1wZXJtaXNzaW9uIGFmZmVjdGVkIHRoZSBjdXJyZW50IHVzZXJcbiAgICAgIC8vIGludGVyc2VjdCB2cyBwcm90ZWN0ZWRGaWVsZHMgZnJvbSBwcmV2aW91cyBzdGFnZSAoQHNlZSBhZGRQcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAvLyBTZXRzIHRoZW9yeSAoaW50ZXJzZWN0aW9ucyk6IEEgeCAoQiB4IEMpID09IChBIHggQikgeCBDXG4gICAgICBpZiAob3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgJiYgcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHByb3RlY3RlZEZpZWxkcyk7XG4gICAgICB9XG4gICAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgICAgLy8gaWYgdGhlcmUncmUgbm8gcHJvdGN0ZWRGaWVsZHMgYnkgb3RoZXIgY3JpdGVyaWEgKCBpZCAvIHJvbGUgLyBhdXRoKVxuICAgICAgICAgIC8vIHRoZW4gd2UgbXVzdCBpbnRlcnNlY3QgZWFjaCBzZXQgKHBlciB1c2VyRmllbGQpXG4gICAgICAgICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGZpZWxkcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBpc1VzZXJDbGFzcyA9IGNsYXNzTmFtZSA9PT0gJ19Vc2VyJztcblxuICAvKiBzcGVjaWFsIHRyZWF0IGZvciB0aGUgdXNlciBjbGFzczogZG9uJ3QgZmlsdGVyIHByb3RlY3RlZEZpZWxkcyBpZiBjdXJyZW50bHkgbG9nZ2VkaW4gdXNlciBpc1xuICB0aGUgcmV0cmlldmVkIHVzZXIgKi9cbiAgaWYgKCEoaXNVc2VyQ2xhc3MgJiYgdXNlcklkICYmIG9iamVjdC5vYmplY3RJZCA9PT0gdXNlcklkKSkge1xuICAgIHByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuXG4gICAgLy8gZmllbGRzIG5vdCByZXF1ZXN0ZWQgYnkgY2xpZW50IChleGNsdWRlZCksXG4gICAgLy9idXQgd2VyZSBuZWVkZWQgdG8gYXBwbHkgcHJvdGVjdHRlZEZpZWxkc1xuICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcyAmJlxuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMgJiZcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzLmZvckVhY2goayA9PiBkZWxldGUgb2JqZWN0W2tdKTtcbiAgfVxuXG4gIGlmICghaXNVc2VyQ2xhc3MpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgb2JqZWN0LnBhc3N3b3JkID0gb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gIGRlbGV0ZSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcblxuICBkZWxldGUgb2JqZWN0LnNlc3Npb25Ub2tlbjtcblxuICBpZiAoaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll90b21ic3RvbmU7XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9mYWlsZWRfbG9naW5fY291bnQ7XG4gIGRlbGV0ZSBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9oaXN0b3J5O1xuXG4gIGlmIChhY2xHcm91cC5pbmRleE9mKG9iamVjdC5vYmplY3RJZCkgPiAtMSkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbi8vIFJ1bnMgYW4gdXBkYXRlIG9uIHRoZSBkYXRhYmFzZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBvYmplY3Qgd2l0aCB0aGUgbmV3IHZhbHVlcyBmb3IgZmllbGRcbi8vIG1vZGlmaWNhdGlvbnMgdGhhdCBkb24ndCBrbm93IHRoZWlyIHJlc3VsdHMgYWhlYWQgb2YgdGltZSwgbGlrZVxuLy8gJ2luY3JlbWVudCcuXG4vLyBPcHRpb25zOlxuLy8gICBhY2w6ICBhIGxpc3Qgb2Ygc3RyaW5ncy4gSWYgdGhlIG9iamVjdCB0byBiZSB1cGRhdGVkIGhhcyBhbiBBQ0wsXG4vLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4vLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuY29uc3Qgc3BlY2lhbEtleXNGb3JVcGRhdGUgPSBbXG4gICdfaGFzaGVkX3Bhc3N3b3JkJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50JyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLFxuICAnX3Bhc3N3b3JkX2hpc3RvcnknLFxuXTtcblxuY29uc3QgaXNTcGVjaWFsVXBkYXRlS2V5ID0ga2V5ID0+IHtcbiAgcmV0dXJuIHNwZWNpYWxLZXlzRm9yVXBkYXRlLmluZGV4T2Yoa2V5KSA+PSAwO1xufTtcblxuZnVuY3Rpb24gZXhwYW5kUmVzdWx0T25LZXlQYXRoKG9iamVjdCwga2V5LCB2YWx1ZSkge1xuICBpZiAoa2V5LmluZGV4T2YoJy4nKSA8IDApIHtcbiAgICBvYmplY3Rba2V5XSA9IHZhbHVlW2tleV07XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBjb25zdCBwYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gIGNvbnN0IGZpcnN0S2V5ID0gcGF0aFswXTtcbiAgY29uc3QgbmV4dFBhdGggPSBwYXRoLnNsaWNlKDEpLmpvaW4oJy4nKTtcbiAgb2JqZWN0W2ZpcnN0S2V5XSA9IGV4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3RbZmlyc3RLZXldIHx8IHt9LCBuZXh0UGF0aCwgdmFsdWVbZmlyc3RLZXldKTtcbiAgZGVsZXRlIG9iamVjdFtrZXldO1xuICByZXR1cm4gb2JqZWN0O1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQpOiBQcm9taXNlPGFueT4ge1xuICBjb25zdCByZXNwb25zZSA9IHt9O1xuICBpZiAoIXJlc3VsdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICB9XG4gIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgY29uc3Qga2V5VXBkYXRlID0gb3JpZ2luYWxPYmplY3Rba2V5XTtcbiAgICAvLyBkZXRlcm1pbmUgaWYgdGhhdCB3YXMgYW4gb3BcbiAgICBpZiAoXG4gICAgICBrZXlVcGRhdGUgJiZcbiAgICAgIHR5cGVvZiBrZXlVcGRhdGUgPT09ICdvYmplY3QnICYmXG4gICAgICBrZXlVcGRhdGUuX19vcCAmJlxuICAgICAgWydBZGQnLCAnQWRkVW5pcXVlJywgJ1JlbW92ZScsICdJbmNyZW1lbnQnXS5pbmRleE9mKGtleVVwZGF0ZS5fX29wKSA+IC0xXG4gICAgKSB7XG4gICAgICAvLyBvbmx5IHZhbGlkIG9wcyB0aGF0IHByb2R1Y2UgYW4gYWN0aW9uYWJsZSByZXN1bHRcbiAgICAgIC8vIHRoZSBvcCBtYXkgaGF2ZSBoYXBwZW5kIG9uIGEga2V5cGF0aFxuICAgICAgZXhwYW5kUmVzdWx0T25LZXlQYXRoKHJlc3BvbnNlLCBrZXksIHJlc3VsdCk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG59XG5cbmZ1bmN0aW9uIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIGBfSm9pbjoke2tleX06JHtjbGFzc05hbWV9YDtcbn1cblxuY29uc3QgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSA9IG9iamVjdCA9PiB7XG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICBzd2l0Y2ggKG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldLmFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY2xhc3MgRGF0YWJhc2VDb250cm9sbGVyIHtcbiAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG4gIHNjaGVtYVByb21pc2U6ID9Qcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj47XG4gIF90cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueTtcblxuICBjb25zdHJ1Y3RvcihhZGFwdGVyOiBTdG9yYWdlQWRhcHRlcikge1xuICAgIHRoaXMuYWRhcHRlciA9IGFkYXB0ZXI7XG4gICAgLy8gV2UgZG9uJ3Qgd2FudCBhIG11dGFibGUgdGhpcy5zY2hlbWEsIGJlY2F1c2UgdGhlbiB5b3UgY291bGQgaGF2ZVxuICAgIC8vIG9uZSByZXF1ZXN0IHRoYXQgdXNlcyBkaWZmZXJlbnQgc2NoZW1hcyBmb3IgZGlmZmVyZW50IHBhcnRzIG9mXG4gICAgLy8gaXQuIEluc3RlYWQsIHVzZSBsb2FkU2NoZW1hIHRvIGdldCBhIHNjaGVtYS5cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgfVxuXG4gIGNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gIH1cblxuICBwdXJnZUNvbGxlY3Rpb24oY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHt9KSk7XG4gIH1cblxuICB2YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5jbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgJ2ludmFsaWQgY2xhc3NOYW1lOiAnICsgY2xhc3NOYW1lKVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgc2NoZW1hQ29udHJvbGxlci5cbiAgbG9hZFNjaGVtYShcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYVByb21pc2UgIT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHRoaXMuc2NoZW1hUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gU2NoZW1hQ29udHJvbGxlci5sb2FkKHRoaXMuYWRhcHRlciwgb3B0aW9ucyk7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlLnRoZW4oXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlLFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZVxuICAgICk7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIGxvYWRTY2hlbWFJZk5lZWRlZChcbiAgICBzY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlciA/IFByb21pc2UucmVzb2x2ZShzY2hlbWFDb250cm9sbGVyKSA6IHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgY2xhc3NuYW1lIHRoYXQgaXMgcmVsYXRlZCB0byB0aGUgZ2l2ZW5cbiAgLy8gY2xhc3NuYW1lIHRocm91Z2ggdGhlIGtleS5cbiAgLy8gVE9ETzogbWFrZSB0aGlzIG5vdCBpbiB0aGUgRGF0YWJhc2VDb250cm9sbGVyIGludGVyZmFjZVxuICByZWRpcmVjdENsYXNzTmFtZUZvcktleShjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcpOiBQcm9taXNlPD9zdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4ge1xuICAgICAgdmFyIHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICh0ICE9IG51bGwgJiYgdHlwZW9mIHQgIT09ICdzdHJpbmcnICYmIHQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gdC50YXJnZXRDbGFzcztcbiAgICAgIH1cbiAgICAgIHJldHVybiBjbGFzc05hbWU7XG4gICAgfSk7XG4gIH1cblxuICAvLyBVc2VzIHRoZSBzY2hlbWEgdG8gdmFsaWRhdGUgdGhlIG9iamVjdCAoUkVTVCBBUEkgZm9ybWF0KS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYS5cbiAgLy8gVGhpcyBkb2VzIG5vdCB1cGRhdGUgdGhpcy5zY2hlbWEsIGJlY2F1c2UgaW4gYSBzaXR1YXRpb24gbGlrZSBhXG4gIC8vIGJhdGNoIHJlcXVlc3QsIHRoYXQgY291bGQgY29uZnVzZSBvdGhlciB1c2VycyBvZiB0aGUgc2NoZW1hLlxuICB2YWxpZGF0ZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBxdWVyeTogYW55LFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBsZXQgc2NoZW1hO1xuICAgIGNvbnN0IGFjbCA9IHJ1bk9wdGlvbnMuYWNsO1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwOiBzdHJpbmdbXSA9IGFjbCB8fCBbXTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWEgPSBzO1xuICAgICAgICBpZiAoaXNNYXN0ZXIpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FuQWRkRmllbGQoc2NoZW1hLCBjbGFzc05hbWUsIG9iamVjdCwgYWNsR3JvdXAsIHJ1bk9wdGlvbnMpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB7IGFjbCwgbWFueSwgdXBzZXJ0LCBhZGRzRmllbGQgfTogRnVsbFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHNraXBTYW5pdGl6YXRpb246IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBxdWVyeTtcbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHVwZGF0ZTtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgdXBkYXRlID0gZGVlcGNvcHkodXBkYXRlKTtcbiAgICB2YXIgcmVsYXRpb25VcGRhdGVzID0gW107XG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICd1cGRhdGUnKVxuICAgICAgKVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZSwgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCwgdXBkYXRlKTtcbiAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICd1cGRhdGUnLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmIChhZGRzRmllbGQpIHtcbiAgICAgICAgICAgICAgcXVlcnkgPSB7XG4gICAgICAgICAgICAgICAgJGFuZDogW1xuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAnYWRkRmllbGQnLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5KTtcbiAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAgIC8vIHdpbGwgbGlrZWx5IG5lZWQgcmV2aXNpdGluZy5cbiAgICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSwgY2xhc3NOYW1lKSAmJlxuICAgICAgICAgICAgICAgICAgIWlzU3BlY2lhbFVwZGF0ZUtleShyb290RmllbGROYW1lKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCB1cGRhdGVPcGVyYXRpb24gaW4gdXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gJiZcbiAgICAgICAgICAgICAgICAgIHR5cGVvZiB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dKS5zb21lKFxuICAgICAgICAgICAgICAgICAgICBpbm5lcktleSA9PiBpbm5lcktleS5pbmNsdWRlcygnJCcpIHx8IGlubmVyS2V5LmluY2x1ZGVzKCcuJylcbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgICAgICAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHVwZGF0ZSA9IHRyYW5zZm9ybU9iamVjdEFDTCh1cGRhdGUpO1xuICAgICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHt9KS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCAhcmVzdWx0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKG1hbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodXBzZXJ0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmRPbmVBbmRVcGRhdGUoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsXG4gICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoc2tpcFNhbml0aXphdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbFVwZGF0ZSwgcmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDb2xsZWN0IGFsbCByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBsaXN0IG9mIGFsbCByZWxhdGlvbiB1cGRhdGVzIHRvIHBlcmZvcm1cbiAgLy8gVGhpcyBtdXRhdGVzIHVwZGF0ZS5cbiAgY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6ID9zdHJpbmcsIHVwZGF0ZTogYW55KSB7XG4gICAgdmFyIG9wcyA9IFtdO1xuICAgIHZhciBkZWxldGVNZSA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuXG4gICAgdmFyIHByb2Nlc3MgPSAob3AsIGtleSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnQmF0Y2gnKSB7XG4gICAgICAgIGZvciAodmFyIHggb2Ygb3Aub3BzKSB7XG4gICAgICAgICAgcHJvY2Vzcyh4LCBrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHVwZGF0ZSkge1xuICAgICAgcHJvY2Vzcyh1cGRhdGVba2V5XSwga2V5KTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBrZXkgb2YgZGVsZXRlTWUpIHtcbiAgICAgIGRlbGV0ZSB1cGRhdGVba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIG9wcztcbiAgfVxuXG4gIC8vIFByb2Nlc3NlcyByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBhbGwgdXBkYXRlcyBoYXZlIGJlZW4gcGVyZm9ybWVkXG4gIGhhbmRsZVJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6IHN0cmluZywgdXBkYXRlOiBhbnksIG9wczogYW55KSB7XG4gICAgdmFyIHBlbmRpbmcgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcbiAgICBvcHMuZm9yRWFjaCgoeyBrZXksIG9wIH0pID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKHRoaXMuYWRkUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5yZW1vdmVSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocGVuZGluZyk7XG4gIH1cblxuICAvLyBBZGRzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgYWRkIHdhcyBzdWNjZXNzZnVsLlxuICBhZGRSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgZG9jLFxuICAgICAgZG9jLFxuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIHJlbW92ZSB3YXNcbiAgLy8gc3VjY2Vzc2Z1bC5cbiAgcmVtb3ZlUmVsYXRpb24oa2V5OiBzdHJpbmcsIGZyb21DbGFzc05hbWU6IHN0cmluZywgZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZykge1xuICAgIHZhciBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgZG9jLFxuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gV2UgZG9uJ3QgY2FyZSBpZiB0aGV5IHRyeSB0byBkZWxldGUgYSBub24tZXhpc3RlbnQgcmVsYXRpb24uXG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgb2JqZWN0cyBtYXRjaGVzIHRoaXMgcXVlcnkgZnJvbSB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHdhc1xuICAvLyBkZWxldGVkLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbiAgLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuICAvLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuICBkZXN0cm95KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdkZWxldGUnKVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgJ2RlbGV0ZScsXG4gICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGRlbGV0ZSBieSBxdWVyeVxuICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgfVxuICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5KTtcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSlcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihwYXJzZUZvcm1hdFNjaGVtYSA9PlxuICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIHBhcnNlRm9ybWF0U2NoZW1hLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIFdoZW4gZGVsZXRpbmcgc2Vzc2lvbnMgd2hpbGUgY2hhbmdpbmcgcGFzc3dvcmRzLCBkb24ndCB0aHJvdyBhbiBlcnJvciBpZiB0aGV5IGRvbid0IGhhdmUgYW55IHNlc3Npb25zLlxuICAgICAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEluc2VydHMgYW4gb2JqZWN0IGludG8gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCBzYXZlZC5cbiAgY3JlYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIGNvbnN0IG9yaWdpbmFsT2JqZWN0ID0gb2JqZWN0O1xuICAgIG9iamVjdCA9IHRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuXG4gICAgb2JqZWN0LmNyZWF0ZWRBdCA9IHsgaXNvOiBvYmplY3QuY3JlYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuICAgIG9iamVjdC51cGRhdGVkQXQgPSB7IGlzbzogb2JqZWN0LnVwZGF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcblxuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBjb25zdCByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBudWxsLCBvYmplY3QpO1xuXG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2NyZWF0ZScpXG4gICAgICAgIClcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSkpXG4gICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgICAgICAgICAgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZShvYmplY3QpO1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBTY2hlbWFDb250cm9sbGVyLmNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoc2NoZW1hKSxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbE9iamVjdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBvYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzXG4gICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdCwgcmVzdWx0Lm9wc1swXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY2FuQWRkRmllbGQoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjbGFzc1NjaGVtYSA9IHNjaGVtYS5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgaWYgKCFjbGFzc1NjaGVtYSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xuICAgIGNvbnN0IHNjaGVtYUZpZWxkcyA9IE9iamVjdC5rZXlzKGNsYXNzU2NoZW1hLmZpZWxkcyk7XG4gICAgY29uc3QgbmV3S2V5cyA9IGZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgdW5zZXRcbiAgICAgIGlmIChvYmplY3RbZmllbGRdICYmIG9iamVjdFtmaWVsZF0uX19vcCAmJiBvYmplY3RbZmllbGRdLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzY2hlbWFGaWVsZHMuaW5kZXhPZihmaWVsZCkgPCAwO1xuICAgIH0pO1xuICAgIGlmIChuZXdLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIGFkZHMgYSBtYXJrZXIgdGhhdCBuZXcgZmllbGQgaXMgYmVpbmcgYWRkaW5nIGR1cmluZyB1cGRhdGVcbiAgICAgIHJ1bk9wdGlvbnMuYWRkc0ZpZWxkID0gdHJ1ZTtcblxuICAgICAgY29uc3QgYWN0aW9uID0gcnVuT3B0aW9ucy5hY3Rpb247XG4gICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnYWRkRmllbGQnLCBhY3Rpb24pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXb24ndCBkZWxldGUgY29sbGVjdGlvbnMgaW4gdGhlIHN5c3RlbSBuYW1lc3BhY2VcbiAgLyoqXG4gICAqIERlbGV0ZSBhbGwgY2xhc3NlcyBhbmQgY2xlYXJzIHRoZSBzY2hlbWEgY2FjaGVcbiAgICpcbiAgICogQHBhcmFtIHtib29sZWFufSBmYXN0IHNldCB0byB0cnVlIGlmIGl0J3Mgb2sgdG8ganVzdCBkZWxldGUgcm93cyBhbmQgbm90IGluZGV4ZXNcbiAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59IHdoZW4gdGhlIGRlbGV0aW9ucyBjb21wbGV0ZXNcbiAgICovXG4gIGRlbGV0ZUV2ZXJ5dGhpbmcoZmFzdDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVBbGxDbGFzc2VzKGZhc3QpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiByZWxhdGVkIGlkcyBnaXZlbiBhbiBvd25pbmcgaWQuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICByZWxhdGVkSWRzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nLFxuICAgIG93bmluZ0lkOiBzdHJpbmcsXG4gICAgcXVlcnlPcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxBcnJheTxzdHJpbmc+PiB7XG4gICAgY29uc3QgeyBza2lwLCBsaW1pdCwgc29ydCB9ID0gcXVlcnlPcHRpb25zO1xuICAgIGNvbnN0IGZpbmRPcHRpb25zID0ge307XG4gICAgaWYgKHNvcnQgJiYgc29ydC5jcmVhdGVkQXQgJiYgdGhpcy5hZGFwdGVyLmNhblNvcnRPbkpvaW5UYWJsZXMpIHtcbiAgICAgIGZpbmRPcHRpb25zLnNvcnQgPSB7IF9pZDogc29ydC5jcmVhdGVkQXQgfTtcbiAgICAgIGZpbmRPcHRpb25zLmxpbWl0ID0gbGltaXQ7XG4gICAgICBmaW5kT3B0aW9ucy5za2lwID0gc2tpcDtcbiAgICAgIHF1ZXJ5T3B0aW9ucy5za2lwID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksIHJlbGF0aW9uU2NoZW1hLCB7IG93bmluZ0lkIH0sIGZpbmRPcHRpb25zKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LnJlbGF0ZWRJZCkpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiBvd25pbmcgaWRzIGdpdmVuIHNvbWUgcmVsYXRlZCBpZHMuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICBvd25pbmdJZHMoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nLCByZWxhdGVkSWRzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChcbiAgICAgICAgam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICB7IHJlbGF0ZWRJZDogeyAkaW46IHJlbGF0ZWRJZHMgfSB9LFxuICAgICAgICB7IGtleXM6IFsnb3duaW5nSWQnXSB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQub3duaW5nSWQpKTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkaW4gb24gcmVsYXRpb24gZmllbGRzLCBvclxuICAvLyBlcXVhbC10by1wb2ludGVyIGNvbnN0cmFpbnRzIG9uIHJlbGF0aW9uIGZpZWxkcy5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IGFueSwgc2NoZW1hOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIFNlYXJjaCBmb3IgYW4gaW4tcmVsYXRpb24gb3IgZXF1YWwtdG8tcmVsYXRpb25cbiAgICAvLyBNYWtlIGl0IHNlcXVlbnRpYWwgZm9yIG5vdywgbm90IHN1cmUgb2YgcGFyYWxsZWl6YXRpb24gc2lkZSBlZmZlY3RzXG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgY29uc3Qgb3JzID0gcXVlcnlbJyRvciddO1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBvcnMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJG9yJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBwcm9taXNlcyA9IE9iamVjdC5rZXlzKHF1ZXJ5KS5tYXAoa2V5ID0+IHtcbiAgICAgIGNvbnN0IHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICghdCB8fCB0LnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgICB9XG4gICAgICBsZXQgcXVlcmllczogPyhhbnlbXSkgPSBudWxsO1xuICAgICAgaWYgKFxuICAgICAgICBxdWVyeVtrZXldICYmXG4gICAgICAgIChxdWVyeVtrZXldWyckaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuZSddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5pbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XS5fX3R5cGUgPT0gJ1BvaW50ZXInKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEJ1aWxkIHRoZSBsaXN0IG9mIHF1ZXJpZXNcbiAgICAgICAgcXVlcmllcyA9IE9iamVjdC5rZXlzKHF1ZXJ5W2tleV0pLm1hcChjb25zdHJhaW50S2V5ID0+IHtcbiAgICAgICAgICBsZXQgcmVsYXRlZElkcztcbiAgICAgICAgICBsZXQgaXNOZWdhdGlvbiA9IGZhbHNlO1xuICAgICAgICAgIGlmIChjb25zdHJhaW50S2V5ID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV0ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJGluJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IHF1ZXJ5W2tleV1bJyRpbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5pbicpIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24gPSB0cnVlO1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IHF1ZXJ5W2tleV1bJyRuaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuZScpIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24gPSB0cnVlO1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldWyckbmUnXS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24sXG4gICAgICAgICAgICByZWxhdGVkSWRzLFxuICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcmllcyA9IFt7IGlzTmVnYXRpb246IGZhbHNlLCByZWxhdGVkSWRzOiBbXSB9XTtcbiAgICAgIH1cblxuICAgICAgLy8gcmVtb3ZlIHRoZSBjdXJyZW50IHF1ZXJ5S2V5IGFzIHdlIGRvbix0IG5lZWQgaXQgYW55bW9yZVxuICAgICAgZGVsZXRlIHF1ZXJ5W2tleV07XG4gICAgICAvLyBleGVjdXRlIGVhY2ggcXVlcnkgaW5kZXBlbmRlbnRseSB0byBidWlsZCB0aGUgbGlzdCBvZlxuICAgICAgLy8gJGluIC8gJG5pblxuICAgICAgY29uc3QgcHJvbWlzZXMgPSBxdWVyaWVzLm1hcChxID0+IHtcbiAgICAgICAgaWYgKCFxKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLm93bmluZ0lkcyhjbGFzc05hbWUsIGtleSwgcS5yZWxhdGVkSWRzKS50aGVuKGlkcyA9PiB7XG4gICAgICAgICAgaWYgKHEuaXNOZWdhdGlvbikge1xuICAgICAgICAgICAgdGhpcy5hZGROb3RJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkcmVsYXRlZFRvXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IGFueSwgcXVlcnlPcHRpb25zOiBhbnkpOiA/UHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJG9yJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgYVF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG5cbiAgICB2YXIgcmVsYXRlZFRvID0gcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICBpZiAocmVsYXRlZFRvKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxhdGVkSWRzKFxuICAgICAgICByZWxhdGVkVG8ub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgcmVsYXRlZFRvLmtleSxcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICApXG4gICAgICAgIC50aGVuKGlkcyA9PiB7XG4gICAgICAgICAgZGVsZXRlIHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge30pO1xuICAgIH1cbiAgfVxuXG4gIGFkZEluT2JqZWN0SWRzSWRzKGlkczogP0FycmF5PHN0cmluZz4gPSBudWxsLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbVN0cmluZzogP0FycmF5PHN0cmluZz4gPVxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJyA/IFtxdWVyeS5vYmplY3RJZF0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21FcTogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRlcSddID8gW3F1ZXJ5Lm9iamVjdElkWyckZXEnXV0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21JbjogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRpbiddID8gcXVlcnkub2JqZWN0SWRbJyRpbiddIDogbnVsbDtcblxuICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgIGNvbnN0IGFsbElkczogQXJyYXk8QXJyYXk8c3RyaW5nPj4gPSBbaWRzRnJvbVN0cmluZywgaWRzRnJvbUVxLCBpZHNGcm9tSW4sIGlkc10uZmlsdGVyKFxuICAgICAgbGlzdCA9PiBsaXN0ICE9PSBudWxsXG4gICAgKTtcbiAgICBjb25zdCB0b3RhbExlbmd0aCA9IGFsbElkcy5yZWR1Y2UoKG1lbW8sIGxpc3QpID0+IG1lbW8gKyBsaXN0Lmxlbmd0aCwgMCk7XG5cbiAgICBsZXQgaWRzSW50ZXJzZWN0aW9uID0gW107XG4gICAgaWYgKHRvdGFsTGVuZ3RoID4gMTI1KSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QuYmlnKGFsbElkcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdChhbGxJZHMpO1xuICAgIH1cblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA9IGlkc0ludGVyc2VjdGlvbjtcblxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIGFkZE5vdEluT2JqZWN0SWRzSWRzKGlkczogc3RyaW5nW10gPSBbXSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21OaW4gPSBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJG5pbiddID8gcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA6IFtdO1xuICAgIGxldCBhbGxJZHMgPSBbLi4uaWRzRnJvbU5pbiwgLi4uaWRzXS5maWx0ZXIobGlzdCA9PiBsaXN0ICE9PSBudWxsKTtcblxuICAgIC8vIG1ha2UgYSBzZXQgYW5kIHNwcmVhZCB0byByZW1vdmUgZHVwbGljYXRlc1xuICAgIGFsbElkcyA9IFsuLi5uZXcgU2V0KGFsbElkcyldO1xuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPSBhbGxJZHM7XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gUnVucyBhIHF1ZXJ5IG9uIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhIGxpc3Qgb2YgaXRlbXMuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgc2tpcCAgICBudW1iZXIgb2YgcmVzdWx0cyB0byBza2lwLlxuICAvLyAgIGxpbWl0ICAgbGltaXQgdG8gdGhpcyBudW1iZXIgb2YgcmVzdWx0cy5cbiAgLy8gICBzb3J0ICAgIGFuIG9iamVjdCB3aGVyZSBrZXlzIGFyZSB0aGUgZmllbGRzIHRvIHNvcnQgYnkuXG4gIC8vICAgICAgICAgICB0aGUgdmFsdWUgaXMgKzEgZm9yIGFzY2VuZGluZywgLTEgZm9yIGRlc2NlbmRpbmcuXG4gIC8vICAgY291bnQgICBydW4gYSBjb3VudCBpbnN0ZWFkIG9mIHJldHVybmluZyByZXN1bHRzLlxuICAvLyAgIGFjbCAgICAgcmVzdHJpY3QgdGhpcyBvcGVyYXRpb24gd2l0aCBhbiBBQ0wgZm9yIHRoZSBwcm92aWRlZCBhcnJheVxuICAvLyAgICAgICAgICAgb2YgdXNlciBvYmplY3RJZHMgYW5kIHJvbGVzLiBhY2w6IG51bGwgbWVhbnMgbm8gdXNlci5cbiAgLy8gICAgICAgICAgIHdoZW4gdGhpcyBmaWVsZCBpcyBub3QgcHJlc2VudCwgZG9uJ3QgZG8gYW55dGhpbmcgcmVnYXJkaW5nIEFDTHMuXG4gIC8vICBjYXNlSW5zZW5zaXRpdmUgbWFrZSBzdHJpbmcgY29tcGFyaXNvbnMgY2FzZSBpbnNlbnNpdGl2ZVxuICAvLyBUT0RPOiBtYWtlIHVzZXJJZHMgbm90IG5lZWRlZCBoZXJlLiBUaGUgZGIgYWRhcHRlciBzaG91bGRuJ3Qga25vd1xuICAvLyBhbnl0aGluZyBhYm91dCB1c2VycywgaWRlYWxseS4gVGhlbiwgaW1wcm92ZSB0aGUgZm9ybWF0IG9mIHRoZSBBQ0xcbiAgLy8gYXJnIHRvIHdvcmsgbGlrZSB0aGUgb3RoZXJzLlxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgYWNsLFxuICAgICAgc29ydCA9IHt9LFxuICAgICAgY291bnQsXG4gICAgICBrZXlzLFxuICAgICAgb3AsXG4gICAgICBkaXN0aW5jdCxcbiAgICAgIHBpcGVsaW5lLFxuICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICBoaW50LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlID0gZmFsc2UsXG4gICAgICBleHBsYWluLFxuICAgIH06IGFueSA9IHt9LFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBvcCA9XG4gICAgICBvcCB8fCAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09ICdzdHJpbmcnICYmIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT09IDEgPyAnZ2V0JyA6ICdmaW5kJyk7XG4gICAgLy8gQ291bnQgb3BlcmF0aW9uIGlmIGNvdW50aW5nXG4gICAgb3AgPSBjb3VudCA9PT0gdHJ1ZSA/ICdjb3VudCcgOiBvcDtcblxuICAgIGxldCBjbGFzc0V4aXN0cyA9IHRydWU7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIC8vQWxsb3cgdm9sYXRpbGUgY2xhc3NlcyBpZiBxdWVyeWluZyB3aXRoIE1hc3RlciAoZm9yIF9QdXNoU3RhdHVzKVxuICAgICAgLy9UT0RPOiBNb3ZlIHZvbGF0aWxlIGNsYXNzZXMgY29uY2VwdCBpbnRvIG1vbmdvIGFkYXB0ZXIsIHBvc3RncmVzIGFkYXB0ZXIgc2hvdWxkbid0IGNhcmVcbiAgICAgIC8vdGhhdCBhcGkucGFyc2UuY29tIGJyZWFrcyB3aGVuIF9QdXNoU3RhdHVzIGV4aXN0cyBpbiBtb25nby5cbiAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCBpc01hc3RlcilcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAvLyBCZWhhdmlvciBmb3Igbm9uLWV4aXN0ZW50IGNsYXNzZXMgaXMga2luZGEgd2VpcmQgb24gUGFyc2UuY29tLiBQcm9iYWJseSBkb2Vzbid0IG1hdHRlciB0b28gbXVjaC5cbiAgICAgICAgICAvLyBGb3Igbm93LCBwcmV0ZW5kIHRoZSBjbGFzcyBleGlzdHMgYnV0IGhhcyBubyBvYmplY3RzLFxuICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjbGFzc0V4aXN0cyA9IGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAvLyBQYXJzZS5jb20gdHJlYXRzIHF1ZXJpZXMgb24gX2NyZWF0ZWRfYXQgYW5kIF91cGRhdGVkX2F0IGFzIGlmIHRoZXkgd2VyZSBxdWVyaWVzIG9uIGNyZWF0ZWRBdCBhbmQgdXBkYXRlZEF0LFxuICAgICAgICAgIC8vIHNvIGR1cGxpY2F0ZSB0aGF0IGJlaGF2aW9yIGhlcmUuIElmIGJvdGggYXJlIHNwZWNpZmllZCwgdGhlIGNvcnJlY3QgYmVoYXZpb3IgdG8gbWF0Y2ggUGFyc2UuY29tIGlzIHRvXG4gICAgICAgICAgLy8gdXNlIHRoZSBvbmUgdGhhdCBhcHBlYXJzIGZpcnN0IGluIHRoZSBzb3J0IGxpc3QuXG4gICAgICAgICAgaWYgKHNvcnQuX2NyZWF0ZWRfYXQpIHtcbiAgICAgICAgICAgIHNvcnQuY3JlYXRlZEF0ID0gc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc29ydC5fdXBkYXRlZF9hdCkge1xuICAgICAgICAgICAgc29ydC51cGRhdGVkQXQgPSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgICAgZGVsZXRlIHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHF1ZXJ5T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICBsaW1pdCxcbiAgICAgICAgICAgIHNvcnQsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICB9O1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNvcnQpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgQ2Fubm90IHNvcnQgYnkgJHtmaWVsZE5hbWV9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgb3ApXG4gICAgICAgICAgKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWFDb250cm9sbGVyKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHByb3RlY3RlZEZpZWxkcztcbiAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvKiBEb24ndCB1c2UgcHJvamVjdGlvbnMgdG8gb3B0aW1pemUgdGhlIHByb3RlY3RlZEZpZWxkcyBzaW5jZSB0aGUgcHJvdGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICBiYXNlZCBvbiBwb2ludGVyLXBlcm1pc3Npb25zIGFyZSBkZXRlcm1pbmVkIGFmdGVyIHF1ZXJ5aW5nLiBUaGUgZmlsdGVyaW5nIGNhblxuICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlIHRoZSBwcm90ZWN0ZWQgZmllbGRzLiAqL1xuICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHRoaXMuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAnZ2V0Jykge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBpZiAob3AgPT09ICd1cGRhdGUnIHx8IG9wID09PSAnZGVsZXRlJykge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFJlYWRBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSk7XG4gICAgICAgICAgICAgIGlmIChjb3VudCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNvdW50KFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIGhpbnRcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGRpc3RpbmN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRpc3RpbmN0KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgZGlzdGluY3QpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChwaXBlbGluZSkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5hZ2dyZWdhdGUoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBwaXBlbGluZSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICAgICAgICAgIGV4cGxhaW5cbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAgICAgICAgIC5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKVxuICAgICAgICAgICAgICAgICAgLnRoZW4ob2JqZWN0cyA9PlxuICAgICAgICAgICAgICAgICAgICBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdCA9IHVudHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgICAgICAgICAgICBpc01hc3RlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZGVsZXRlU2NoZW1hKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWFDb250cm9sbGVyID0gcztcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5hZGFwdGVyLmNvdW50KGNsYXNzTmFtZSwgeyBmaWVsZHM6IHt9IH0sIG51bGwsICcnLCBmYWxzZSkpXG4gICAgICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICAgICAgaWYgKGNvdW50ID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgMjU1LFxuICAgICAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gaXMgbm90IGVtcHR5LCBjb250YWlucyAke2NvdW50fSBvYmplY3RzLCBjYW5ub3QgZHJvcCBzY2hlbWEuYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhjbGFzc05hbWUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4od2FzUGFyc2VDb2xsZWN0aW9uID0+IHtcbiAgICAgICAgICAgIGlmICh3YXNQYXJzZUNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICAgICAgICAgIGZpZWxkTmFtZSA9PiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLm1hcChuYW1lID0+XG4gICAgICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3Moam9pblRhYmxlTmFtZShjbGFzc05hbWUsIG5hbWUpKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBTY2hlbWFDYWNoZS5kZWwoY2xhc3NOYW1lKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlci5yZWxvYWREYXRhKCk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBUaGlzIGhlbHBzIHRvIGNyZWF0ZSBpbnRlcm1lZGlhdGUgb2JqZWN0cyBmb3Igc2ltcGxlciBjb21wYXJpc29uIG9mXG4gIC8vIGtleSB2YWx1ZSBwYWlycyB1c2VkIGluIHF1ZXJ5IG9iamVjdHMuIEVhY2gga2V5IHZhbHVlIHBhaXIgd2lsbCByZXByZXNlbnRlZFxuICAvLyBpbiBhIHNpbWlsYXIgd2F5IHRvIGpzb25cbiAgb2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxdWVyeTogYW55KTogQXJyYXk8c3RyaW5nPiB7XG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHF1ZXJ5KS5tYXAoYSA9PiBhLm1hcChzID0+IEpTT04uc3RyaW5naWZ5KHMpKS5qb2luKCc6JykpO1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgT1Igb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZU9yT3BlcmF0aW9uKHF1ZXJ5OiB7ICRvcjogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRvcikge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJG9yLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgbG9uZ2VyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJG9yLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kb3IubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRvclswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRvcjtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgQU5EIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VBbmRPcGVyYXRpb24ocXVlcnk6IHsgJGFuZDogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRhbmQpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRhbmQubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBzaG9ydGVyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJGFuZC5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kYW5kLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kYW5kWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJGFuZDtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gQ29uc3RyYWludHMgcXVlcnkgdXNpbmcgQ0xQJ3MgcG9pbnRlciBwZXJtaXNzaW9ucyAoUFApIGlmIGFueS5cbiAgLy8gMS4gRXRyYWN0IHRoZSB1c2VyIGlkIGZyb20gY2FsbGVyJ3MgQUNMZ3JvdXA7XG4gIC8vIDIuIEV4Y3RyYWN0IGEgbGlzdCBvZiBmaWVsZCBuYW1lcyB0aGF0IGFyZSBQUCBmb3IgdGFyZ2V0IGNvbGxlY3Rpb24gYW5kIG9wZXJhdGlvbjtcbiAgLy8gMy4gQ29uc3RyYWludCB0aGUgb3JpZ2luYWwgcXVlcnkgc28gdGhhdCBlYWNoIFBQIGZpZWxkIG11c3RcbiAgLy8gcG9pbnQgdG8gY2FsbGVyJ3MgaWQgKG9yIGNvbnRhaW4gaXQgaW4gY2FzZSBvZiBQUCBmaWVsZCBiZWluZyBhbiBhcnJheSlcbiAgYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW11cbiAgKTogYW55IHtcbiAgICAvLyBDaGVjayBpZiBjbGFzcyBoYXMgcHVibGljIHBlcm1pc3Npb24gZm9yIG9wZXJhdGlvblxuICAgIC8vIElmIHRoZSBCYXNlQ0xQIHBhc3MsIGxldCBnbyB0aHJvdWdoXG4gICAgaWYgKHNjaGVtYS50ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcblxuICAgIGNvbnN0IHVzZXJBQ0wgPSBhY2xHcm91cC5maWx0ZXIoYWNsID0+IHtcbiAgICAgIHJldHVybiBhY2wuaW5kZXhPZigncm9sZTonKSAhPSAwICYmIGFjbCAhPSAnKic7XG4gICAgfSk7XG5cbiAgICBjb25zdCBncm91cEtleSA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICBjb25zdCBwZXJtRmllbGRzID0gW107XG5cbiAgICBpZiAocGVybXNbb3BlcmF0aW9uXSAmJiBwZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpIHtcbiAgICAgIHBlcm1GaWVsZHMucHVzaCguLi5wZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpO1xuICAgIH1cblxuICAgIGlmIChwZXJtc1tncm91cEtleV0pIHtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICAgIGlmICghcGVybUZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwZXJtRmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICBpZiAocGVybUZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgICAvLyBObyB1c2VyIHNldCByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAvLyBJZiB0aGUgbGVuZ3RoIGlzID4gMSwgdGhhdCBtZWFucyB3ZSBkaWRuJ3QgZGUtZHVwZSB1c2VycyBjb3JyZWN0bHlcbiAgICAgIGlmICh1c2VyQUNMLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXJJZCA9IHVzZXJBQ0xbMF07XG4gICAgICBjb25zdCB1c2VyUG9pbnRlciA9IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHF1ZXJpZXMgPSBwZXJtRmllbGRzLm1hcChrZXkgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZERlc2NyaXB0b3IgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgICAgY29uc3QgZmllbGRUeXBlID1cbiAgICAgICAgICBmaWVsZERlc2NyaXB0b3IgJiZcbiAgICAgICAgICB0eXBlb2YgZmllbGREZXNjcmlwdG9yID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZERlc2NyaXB0b3IsICd0eXBlJylcbiAgICAgICAgICAgID8gZmllbGREZXNjcmlwdG9yLnR5cGVcbiAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBsZXQgcXVlcnlDbGF1c2U7XG5cbiAgICAgICAgaWYgKGZpZWxkVHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3Igc2luZ2xlIHBvaW50ZXIgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3IgdXNlcnMtYXJyYXkgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHsgJGFsbDogW3VzZXJQb2ludGVyXSB9IH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnT2JqZWN0Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIG9iamVjdCBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogdXNlclBvaW50ZXIgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUaGlzIG1lYW5zIHRoYXQgdGhlcmUgaXMgYSBDTFAgZmllbGQgb2YgYW4gdW5leHBlY3RlZCB0eXBlLiBUaGlzIGNvbmRpdGlvbiBzaG91bGQgbm90IGhhcHBlbiwgd2hpY2ggaXNcbiAgICAgICAgICAvLyB3aHkgaXMgYmVpbmcgdHJlYXRlZCBhcyBhbiBlcnJvci5cbiAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgIGBBbiB1bmV4cGVjdGVkIGNvbmRpdGlvbiBvY2N1cnJlZCB3aGVuIHJlc29sdmluZyBwb2ludGVyIHBlcm1pc3Npb25zOiAke2NsYXNzTmFtZX0gJHtrZXl9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgY29uc3RyYWludCBvbiB0aGUga2V5LCB1c2UgdGhlICRhbmRcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChxdWVyeSwga2V5KSkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUFuZE9wZXJhdGlvbih7ICRhbmQ6IFtxdWVyeUNsYXVzZSwgcXVlcnldIH0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGFkZCB0aGUgY29uc3RhaW50XG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgcXVlcnlDbGF1c2UpO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBxdWVyaWVzLmxlbmd0aCA9PT0gMSA/IHF1ZXJpZXNbMF0gOiB0aGlzLnJlZHVjZU9yT3BlcmF0aW9uKHsgJG9yOiBxdWVyaWVzIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICB9XG5cbiAgYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnkgPSB7fSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICBxdWVyeU9wdGlvbnM6IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fVxuICApOiBudWxsIHwgc3RyaW5nW10ge1xuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuICAgIGlmICghcGVybXMpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gcGVybXMucHJvdGVjdGVkRmllbGRzO1xuICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSByZXR1cm4gbnVsbDtcblxuICAgIGlmIChhY2xHcm91cC5pbmRleE9mKHF1ZXJ5Lm9iamVjdElkKSA+IC0xKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIGZvciBxdWVyaWVzIHdoZXJlIFwia2V5c1wiIGFyZSBzZXQgYW5kIGRvIG5vdCBpbmNsdWRlIGFsbCAndXNlckZpZWxkJzp7ZmllbGR9LFxuICAgIC8vIHdlIGhhdmUgdG8gdHJhbnNwYXJlbnRseSBpbmNsdWRlIGl0LCBhbmQgdGhlbiByZW1vdmUgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnRcbiAgICAvLyBCZWNhdXNlIGlmIHN1Y2gga2V5IG5vdCBwcm9qZWN0ZWQgdGhlIHBlcm1pc3Npb24gd29uJ3QgYmUgZW5mb3JjZWQgcHJvcGVybHlcbiAgICAvLyBQUyB0aGlzIGlzIGNhbGxlZCB3aGVuICdleGNsdWRlS2V5cycgYWxyZWFkeSByZWR1Y2VkIHRvICdrZXlzJ1xuICAgIGNvbnN0IHByZXNlcnZlS2V5cyA9IHF1ZXJ5T3B0aW9ucy5rZXlzO1xuXG4gICAgLy8gdGhlc2UgYXJlIGtleXMgdGhhdCBuZWVkIHRvIGJlIGluY2x1ZGVkIG9ubHlcbiAgICAvLyB0byBiZSBhYmxlIHRvIGFwcGx5IHByb3RlY3RlZEZpZWxkcyBieSBwb2ludGVyXG4gICAgLy8gYW5kIHRoZW4gdW5zZXQgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnQgKGxhdGVyIGluICBmaWx0ZXJTZW5zaXRpdmVGaWVsZHMpXG4gICAgY29uc3Qgc2VydmVyT25seUtleXMgPSBbXTtcblxuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWQgPSBhdXRoLnVzZXI7XG5cbiAgICAvLyBtYXAgdG8gYWxsb3cgY2hlY2sgd2l0aG91dCBhcnJheSBzZWFyY2hcbiAgICBjb25zdCByb2xlcyA9IChhdXRoLnVzZXJSb2xlcyB8fCBbXSkucmVkdWNlKChhY2MsIHIpID0+IHtcbiAgICAgIGFjY1tyXSA9IHByb3RlY3RlZEZpZWxkc1tyXTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuXG4gICAgLy8gYXJyYXkgb2Ygc2V0cyBvZiBwcm90ZWN0ZWQgZmllbGRzLiBzZXBhcmF0ZSBpdGVtIGZvciBlYWNoIGFwcGxpY2FibGUgY3JpdGVyaWFcbiAgICBjb25zdCBwcm90ZWN0ZWRLZXlzU2V0cyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBza2lwIHVzZXJGaWVsZHNcbiAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKSB7XG4gICAgICAgIGlmIChwcmVzZXJ2ZUtleXMpIHtcbiAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBrZXkuc3Vic3RyaW5nKDEwKTtcbiAgICAgICAgICBpZiAoIXByZXNlcnZlS2V5cy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICAgICAgICAvLyAxLiBwdXQgaXQgdGhlcmUgdGVtcG9yYXJpbHlcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucy5rZXlzICYmIHF1ZXJ5T3B0aW9ucy5rZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIC8vIDIuIHByZXNlcnZlIGl0IGRlbGV0ZSBsYXRlclxuICAgICAgICAgICAgc2VydmVyT25seUtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gYWRkIHB1YmxpYyB0aWVyXG4gICAgICBpZiAoa2V5ID09PSAnKicpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgICBpZiAoa2V5ID09PSAnYXV0aGVudGljYXRlZCcpIHtcbiAgICAgICAgICAvLyBmb3IgbG9nZ2VkIGluIHVzZXJzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocm9sZXNba2V5XSAmJiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSkge1xuICAgICAgICAgIC8vIGFkZCBhcHBsaWNhYmxlIHJvbGVzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChyb2xlc1trZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGNoZWNrIGlmIHRoZXJlJ3MgYSBydWxlIGZvciBjdXJyZW50IHVzZXIncyBpZFxuICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICBjb25zdCB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG4gICAgICBpZiAocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gcHJlc2VydmUgZmllbGRzIHRvIGJlIHJlbW92ZWQgYmVmb3JlIHNlbmRpbmcgcmVzcG9uc2UgdG8gY2xpZW50XG4gICAgaWYgKHNlcnZlck9ubHlLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzID0gc2VydmVyT25seUtleXM7XG4gICAgfVxuXG4gICAgbGV0IHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzU2V0cy5yZWR1Y2UoKGFjYywgbmV4dCkgPT4ge1xuICAgICAgaWYgKG5leHQpIHtcbiAgICAgICAgYWNjLnB1c2goLi4ubmV4dCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIFtdKTtcblxuICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICBwcm90ZWN0ZWRLZXlzU2V0cy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvdGVjdGVkS2V5cztcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKS50aGVuKHRyYW5zYWN0aW9uYWxTZXNzaW9uID0+IHtcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gdHJhbnNhY3Rpb25hbFNlc3Npb247XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBjb21taXQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGFib3J0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICAvLyBUT0RPOiBjcmVhdGUgaW5kZXhlcyBvbiBmaXJzdCBjcmVhdGlvbiBvZiBhIF9Vc2VyIG9iamVjdC4gT3RoZXJ3aXNlIGl0J3MgaW1wb3NzaWJsZSB0b1xuICAvLyBoYXZlIGEgUGFyc2UgYXBwIHdpdGhvdXQgaXQgaGF2aW5nIGEgX1VzZXIgY29sbGVjdGlvbi5cbiAgYXN5bmMgcGVyZm9ybUluaXRpYWxpemF0aW9uKCkge1xuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIGNvbnN0IHJlcXVpcmVkVXNlckZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Vc2VyLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkUm9sZUZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Sb2xlLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgICB9LFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1VzZXInKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKSk7XG4gICAgaWYgKHRoaXMuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXIpIHtcbiAgICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19JZGVtcG90ZW5jeScpKTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlcm5hbWVzOiAnLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddLCAnY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZScsIHRydWUpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIHVzZXJuYW1lIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10sICdjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lJywgdHJ1ZSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgdXNlcm5hbWUgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VyIGVtYWlsIGFkZHJlc3NlczogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfZW1haWwnLCB0cnVlKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSBlbWFpbCBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Sb2xlJywgcmVxdWlyZWRSb2xlRmllbGRzLCBbJ25hbWUnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3Igcm9sZSBuYW1lOiAnLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcbiAgICBpZiAodGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgTW9uZ29TdG9yYWdlQWRhcHRlcikge1xuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVVbmlxdWVuZXNzKCdfSWRlbXBvdGVuY3knLCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzLCBbJ3JlcUlkJ10pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgaWRlbXBvdGVuY3kgcmVxdWVzdCBJRDogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcblxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydleHBpcmUnXSwgJ3R0bCcsIGZhbHNlLCB7XG4gICAgICAgICAgdHRsOiAwLFxuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIFRUTCBpbmRleCBmb3IgaWRlbXBvdGVuY3kgZXhwaXJlIGRhdGU6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci51cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpO1xuICB9XG5cbiAgc3RhdGljIF92YWxpZGF0ZVF1ZXJ5OiBhbnkgPT4gdm9pZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBEYXRhYmFzZUNvbnRyb2xsZXI7XG4vLyBFeHBvc2UgdmFsaWRhdGVRdWVyeSBmb3IgdGVzdHNcbm1vZHVsZS5leHBvcnRzLl92YWxpZGF0ZVF1ZXJ5ID0gdmFsaWRhdGVRdWVyeTtcbiJdfQ==