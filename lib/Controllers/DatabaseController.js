"use strict";

var _node = require("parse/node");

var _lodash = _interopRequireDefault(require("lodash"));

var _intersect = _interopRequireDefault(require("intersect"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var _logger = _interopRequireDefault(require("../logger"));

var SchemaController = _interopRequireWildcard(require("./SchemaController"));

var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");

var _MongoStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Mongo/MongoStorageAdapter"));

var _PostgresStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Postgres/PostgresStorageAdapter"));

var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

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


const transformObjectACL = _ref => {
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


const untransformObjectACL = _ref2 => {
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
  constructor(adapter, idempotencyOptions = {}) {
    this.adapter = adapter;
    this.idempotencyOptions = idempotencyOptions; // We don't want a mutable this.schema, because then you could have
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

      return schemaFields.indexOf(getRootFieldName(field)) < 0;
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

    if (query['$and']) {
      const ands = query['$and'];
      return Promise.all(ands.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$and'][index] = aQuery;
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

    if (query['$and']) {
      return Promise.all(query['$and'].map(aQuery => {
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
    await this.loadSchema().then(schema => schema.enforceClassExists('_Idempotency'));
    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['username']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for usernames: ', error);

      throw error;
    });
    await this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', false).catch(error => {
      _logger.default.warn('Unable to create case insensitive username index: ', error);

      throw error;
    });
    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['email']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);

      throw error;
    });
    await this.adapter.ensureIndex('_User', requiredUserFields, ['email'], 'case_insensitive_email', false).catch(error => {
      _logger.default.warn('Unable to create case insensitive email index: ', error);

      throw error;
    });
    await this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for role name: ', error);

      throw error;
    });
    await this.adapter.ensureUniqueness('_Idempotency', requiredIdempotencyFields, ['reqId']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for idempotency request ID: ', error);

      throw error;
    });
    const isMongoAdapter = this.adapter instanceof _MongoStorageAdapter.default;
    const isPostgresAdapter = this.adapter instanceof _PostgresStorageAdapter.default;

    if (isMongoAdapter || isPostgresAdapter) {
      let options = {};

      if (isMongoAdapter) {
        options = {
          ttl: 0
        };
      } else if (isPostgresAdapter) {
        options = this.idempotencyOptions;
        options.setIdempotencyFunction = true;
      }

      await this.adapter.ensureIndex('_Idempotency', requiredIdempotencyFields, ['expire'], 'ttl', false, options).catch(error => {
        _logger.default.warn('Unable to create TTL index for idempotency expire date: ', error);

        throw error;
      });
    }

    await this.adapter.updateSchemaWithIndexes();
  }

}

module.exports = DatabaseController; // Expose validateQuery for tests

module.exports._validateQuery = validateQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwibmFtZXMiOlsiYWRkV3JpdGVBQ0wiLCJxdWVyeSIsImFjbCIsIm5ld1F1ZXJ5IiwiXyIsImNsb25lRGVlcCIsIl93cGVybSIsIiRpbiIsImFkZFJlYWRBQ0wiLCJfcnBlcm0iLCJ0cmFuc2Zvcm1PYmplY3RBQ0wiLCJBQ0wiLCJyZXN1bHQiLCJlbnRyeSIsInJlYWQiLCJwdXNoIiwid3JpdGUiLCJzcGVjaWFsUXVlcnlrZXlzIiwiaXNTcGVjaWFsUXVlcnlLZXkiLCJrZXkiLCJpbmRleE9mIiwidmFsaWRhdGVRdWVyeSIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiJG9yIiwiQXJyYXkiLCJmb3JFYWNoIiwiJGFuZCIsIiRub3IiLCJsZW5ndGgiLCJPYmplY3QiLCJrZXlzIiwiJHJlZ2V4IiwiJG9wdGlvbnMiLCJtYXRjaCIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiaXNNYXN0ZXIiLCJhY2xHcm91cCIsImF1dGgiLCJvcGVyYXRpb24iLCJzY2hlbWEiLCJjbGFzc05hbWUiLCJwcm90ZWN0ZWRGaWVsZHMiLCJvYmplY3QiLCJ1c2VySWQiLCJ1c2VyIiwiaWQiLCJwZXJtcyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlzUmVhZE9wZXJhdGlvbiIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtIiwiZmlsdGVyIiwic3RhcnRzV2l0aCIsIm1hcCIsInN1YnN0cmluZyIsInZhbHVlIiwibmV3UHJvdGVjdGVkRmllbGRzIiwib3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMiLCJwb2ludGVyUGVybSIsInBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyIiwicmVhZFVzZXJGaWVsZFZhbHVlIiwiaXNBcnJheSIsInNvbWUiLCJvYmplY3RJZCIsImZpZWxkcyIsInYiLCJpbmNsdWRlcyIsImlzVXNlckNsYXNzIiwiayIsInRlbXBvcmFyeUtleXMiLCJwYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJzZXNzaW9uVG9rZW4iLCJfZW1haWxfdmVyaWZ5X3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3RvbWJzdG9uZSIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIl9wYXNzd29yZF9oaXN0b3J5IiwiYXV0aERhdGEiLCJzcGVjaWFsS2V5c0ZvclVwZGF0ZSIsImlzU3BlY2lhbFVwZGF0ZUtleSIsImV4cGFuZFJlc3VsdE9uS2V5UGF0aCIsInBhdGgiLCJzcGxpdCIsImZpcnN0S2V5IiwibmV4dFBhdGgiLCJzbGljZSIsImpvaW4iLCJzYW5pdGl6ZURhdGFiYXNlUmVzdWx0Iiwib3JpZ2luYWxPYmplY3QiLCJyZXNwb25zZSIsIlByb21pc2UiLCJyZXNvbHZlIiwia2V5VXBkYXRlIiwiX19vcCIsImpvaW5UYWJsZU5hbWUiLCJmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlIiwiYW1vdW50IiwiSU5WQUxJRF9KU09OIiwib2JqZWN0cyIsIkNPTU1BTkRfVU5BVkFJTEFCTEUiLCJ0cmFuc2Zvcm1BdXRoRGF0YSIsInByb3ZpZGVyIiwicHJvdmlkZXJEYXRhIiwiZmllbGROYW1lIiwidHlwZSIsInVudHJhbnNmb3JtT2JqZWN0QUNMIiwib3V0cHV0IiwiZ2V0Um9vdEZpZWxkTmFtZSIsInJlbGF0aW9uU2NoZW1hIiwicmVsYXRlZElkIiwib3duaW5nSWQiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFkYXB0ZXIiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJzY2hlbWFQcm9taXNlIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29sbGVjdGlvbkV4aXN0cyIsImNsYXNzRXhpc3RzIiwicHVyZ2VDb2xsZWN0aW9uIiwibG9hZFNjaGVtYSIsInRoZW4iLCJzY2hlbWFDb250cm9sbGVyIiwiZ2V0T25lU2NoZW1hIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ2YWxpZGF0ZUNsYXNzTmFtZSIsIlNjaGVtYUNvbnRyb2xsZXIiLCJjbGFzc05hbWVJc1ZhbGlkIiwicmVqZWN0IiwiSU5WQUxJRF9DTEFTU19OQU1FIiwib3B0aW9ucyIsImNsZWFyQ2FjaGUiLCJsb2FkIiwibG9hZFNjaGVtYUlmTmVlZGVkIiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJ0IiwiZ2V0RXhwZWN0ZWRUeXBlIiwidGFyZ2V0Q2xhc3MiLCJ2YWxpZGF0ZU9iamVjdCIsInJ1bk9wdGlvbnMiLCJ1bmRlZmluZWQiLCJzIiwiY2FuQWRkRmllbGQiLCJ1cGRhdGUiLCJtYW55IiwidXBzZXJ0IiwiYWRkc0ZpZWxkIiwic2tpcFNhbml0aXphdGlvbiIsInZhbGlkYXRlT25seSIsInZhbGlkU2NoZW1hQ29udHJvbGxlciIsIm9yaWdpbmFsUXVlcnkiLCJvcmlnaW5hbFVwZGF0ZSIsInJlbGF0aW9uVXBkYXRlcyIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNvbGxlY3RSZWxhdGlvblVwZGF0ZXMiLCJhZGRQb2ludGVyUGVybWlzc2lvbnMiLCJjYXRjaCIsImVycm9yIiwicm9vdEZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWQiLCJ1cGRhdGVPcGVyYXRpb24iLCJpbm5lcktleSIsIklOVkFMSURfTkVTVEVEX0tFWSIsImZpbmQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cHNlcnRPbmVPYmplY3QiLCJmaW5kT25lQW5kVXBkYXRlIiwiaGFuZGxlUmVsYXRpb25VcGRhdGVzIiwib3BzIiwiZGVsZXRlTWUiLCJwcm9jZXNzIiwib3AiLCJ4IiwicGVuZGluZyIsImFkZFJlbGF0aW9uIiwicmVtb3ZlUmVsYXRpb24iLCJhbGwiLCJmcm9tQ2xhc3NOYW1lIiwiZnJvbUlkIiwidG9JZCIsImRvYyIsImNvZGUiLCJkZXN0cm95IiwicGFyc2VGb3JtYXRTY2hlbWEiLCJjcmVhdGUiLCJjcmVhdGVkQXQiLCJpc28iLCJfX3R5cGUiLCJ1cGRhdGVkQXQiLCJlbmZvcmNlQ2xhc3NFeGlzdHMiLCJjcmVhdGVPYmplY3QiLCJjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hIiwiY2xhc3NTY2hlbWEiLCJzY2hlbWFEYXRhIiwic2NoZW1hRmllbGRzIiwibmV3S2V5cyIsImZpZWxkIiwiYWN0aW9uIiwiZGVsZXRlRXZlcnl0aGluZyIsImZhc3QiLCJTY2hlbWFDYWNoZSIsImNsZWFyIiwiZGVsZXRlQWxsQ2xhc3NlcyIsInJlbGF0ZWRJZHMiLCJxdWVyeU9wdGlvbnMiLCJza2lwIiwibGltaXQiLCJzb3J0IiwiZmluZE9wdGlvbnMiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwiX2lkIiwicmVzdWx0cyIsIm93bmluZ0lkcyIsInJlZHVjZUluUmVsYXRpb24iLCJvcnMiLCJhUXVlcnkiLCJpbmRleCIsImFuZHMiLCJwcm9taXNlcyIsInF1ZXJpZXMiLCJjb25zdHJhaW50S2V5IiwiaXNOZWdhdGlvbiIsInIiLCJxIiwiaWRzIiwiYWRkTm90SW5PYmplY3RJZHNJZHMiLCJhZGRJbk9iamVjdElkc0lkcyIsInJlZHVjZVJlbGF0aW9uS2V5cyIsInJlbGF0ZWRUbyIsImlkc0Zyb21TdHJpbmciLCJpZHNGcm9tRXEiLCJpZHNGcm9tSW4iLCJhbGxJZHMiLCJsaXN0IiwidG90YWxMZW5ndGgiLCJyZWR1Y2UiLCJtZW1vIiwiaWRzSW50ZXJzZWN0aW9uIiwiaW50ZXJzZWN0IiwiYmlnIiwiJGVxIiwiaWRzRnJvbU5pbiIsIlNldCIsIiRuaW4iLCJjb3VudCIsImRpc3RpbmN0IiwicGlwZWxpbmUiLCJyZWFkUHJlZmVyZW5jZSIsImhpbnQiLCJjYXNlSW5zZW5zaXRpdmUiLCJleHBsYWluIiwiX2NyZWF0ZWRfYXQiLCJfdXBkYXRlZF9hdCIsImFkZFByb3RlY3RlZEZpZWxkcyIsImFnZ3JlZ2F0ZSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImRlbGV0ZVNjaGVtYSIsImRlbGV0ZUNsYXNzIiwid2FzUGFyc2VDb2xsZWN0aW9uIiwicmVsYXRpb25GaWVsZE5hbWVzIiwibmFtZSIsImRlbCIsInJlbG9hZERhdGEiLCJvYmplY3RUb0VudHJpZXNTdHJpbmdzIiwiZW50cmllcyIsImEiLCJKU09OIiwic3RyaW5naWZ5IiwicmVkdWNlT3JPcGVyYXRpb24iLCJyZXBlYXQiLCJpIiwiaiIsInNob3J0ZXIiLCJsb25nZXIiLCJmb3VuZEVudHJpZXMiLCJhY2MiLCJzaG9ydGVyRW50cmllcyIsInNwbGljZSIsInJlZHVjZUFuZE9wZXJhdGlvbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsInVzZXJBQ0wiLCJncm91cEtleSIsInBlcm1GaWVsZHMiLCJwb2ludGVyRmllbGRzIiwidXNlclBvaW50ZXIiLCJmaWVsZERlc2NyaXB0b3IiLCJmaWVsZFR5cGUiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJxdWVyeUNsYXVzZSIsIiRhbGwiLCJhc3NpZ24iLCJwcmVzZXJ2ZUtleXMiLCJzZXJ2ZXJPbmx5S2V5cyIsImF1dGhlbnRpY2F0ZWQiLCJyb2xlcyIsInVzZXJSb2xlcyIsInByb3RlY3RlZEtleXNTZXRzIiwicHJvdGVjdGVkS2V5cyIsIm5leHQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInJlcXVpcmVkVXNlckZpZWxkcyIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJfVXNlciIsInJlcXVpcmVkUm9sZUZpZWxkcyIsIl9Sb2xlIiwicmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcyIsIl9JZGVtcG90ZW5jeSIsImVuc3VyZVVuaXF1ZW5lc3MiLCJsb2dnZXIiLCJ3YXJuIiwiZW5zdXJlSW5kZXgiLCJpc01vbmdvQWRhcHRlciIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJpc1Bvc3RncmVzQWRhcHRlciIsIlBvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJ0dGwiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJtb2R1bGUiLCJleHBvcnRzIiwiX3ZhbGlkYXRlUXVlcnkiXSwibWFwcGluZ3MiOiI7O0FBS0E7O0FBRUE7O0FBRUE7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUlBLFNBQVNBLFdBQVQsQ0FBcUJDLEtBQXJCLEVBQTRCQyxHQUE1QixFQUFpQztBQUMvQixRQUFNQyxRQUFRLEdBQUdDLGdCQUFFQyxTQUFGLENBQVlKLEtBQVosQ0FBakIsQ0FEK0IsQ0FFL0I7OztBQUNBRSxFQUFBQSxRQUFRLENBQUNHLE1BQVQsR0FBa0I7QUFBRUMsSUFBQUEsR0FBRyxFQUFFLENBQUMsSUFBRCxFQUFPLEdBQUdMLEdBQVY7QUFBUCxHQUFsQjtBQUNBLFNBQU9DLFFBQVA7QUFDRDs7QUFFRCxTQUFTSyxVQUFULENBQW9CUCxLQUFwQixFQUEyQkMsR0FBM0IsRUFBZ0M7QUFDOUIsUUFBTUMsUUFBUSxHQUFHQyxnQkFBRUMsU0FBRixDQUFZSixLQUFaLENBQWpCLENBRDhCLENBRTlCOzs7QUFDQUUsRUFBQUEsUUFBUSxDQUFDTSxNQUFULEdBQWtCO0FBQUVGLElBQUFBLEdBQUcsRUFBRSxDQUFDLElBQUQsRUFBTyxHQUFQLEVBQVksR0FBR0wsR0FBZjtBQUFQLEdBQWxCO0FBQ0EsU0FBT0MsUUFBUDtBQUNELEMsQ0FFRDs7O0FBQ0EsTUFBTU8sa0JBQWtCLEdBQUcsUUFBd0I7QUFBQSxNQUF2QjtBQUFFQyxJQUFBQTtBQUFGLEdBQXVCO0FBQUEsTUFBYkMsTUFBYTs7QUFDakQsTUFBSSxDQUFDRCxHQUFMLEVBQVU7QUFDUixXQUFPQyxNQUFQO0FBQ0Q7O0FBRURB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LElBQWpDO0FBQ0Q7O0FBQ0QsWUFBTSxLQUFLcE4sT0FBTCxDQUNIOE0sV0FERyxDQUNTLGNBRFQsRUFDeUJMLHlCQUR6QixFQUNvRCxDQUFDLFFBQUQsQ0FEcEQsRUFDZ0UsS0FEaEUsRUFDdUUsS0FEdkUsRUFDOEV4TCxPQUQ5RSxFQUVIMEIsS0FGRyxDQUVHQyxLQUFLLElBQUk7QUFDZGdLLHdCQUFPQyxJQUFQLENBQVksMERBQVosRUFBd0VqSyxLQUF4RTs7QUFDQSxjQUFNQSxLQUFOO0FBQ0QsT0FMRyxDQUFOO0FBTUQ7O0FBQ0QsVUFBTSxLQUFLNUMsT0FBTCxDQUFhcU4sdUJBQWIsRUFBTjtBQUNEOztBQXAyQ3NCOztBQXkyQ3pCQyxNQUFNLENBQUNDLE9BQVAsR0FBaUJ6TixrQkFBakIsQyxDQUNBOztBQUNBd04sTUFBTSxDQUFDQyxPQUFQLENBQWVDLGNBQWYsR0FBZ0MzVCxhQUFoQyIsInNvdXJjZXNDb250ZW50IjpbIu+7vy8vIEBmbG93XG4vLyBBIGRhdGFiYXNlIGFkYXB0ZXIgdGhhdCB3b3JrcyB3aXRoIGRhdGEgZXhwb3J0ZWQgZnJvbSB0aGUgaG9zdGVkXG4vLyBQYXJzZSBkYXRhYmFzZS5cblxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgaW50ZXJzZWN0IGZyb20gJ2ludGVyc2VjdCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgKiBhcyBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4vU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IE1vbmdvU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHR5cGUgeyBMb2FkU2NoZW1hT3B0aW9ucyB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHR5cGUgeyBRdWVyeU9wdGlvbnMsIEZ1bGxRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcblxuZnVuY3Rpb24gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ193cGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fd3Blcm0gPSB7ICRpbjogW251bGwsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG5mdW5jdGlvbiBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfcnBlcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3JwZXJtID0geyAkaW46IFtudWxsLCAnKicsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG4vLyBUcmFuc2Zvcm1zIGEgUkVTVCBBUEkgZm9ybWF0dGVkIEFDTCBvYmplY3QgdG8gb3VyIHR3by1maWVsZCBtb25nbyBmb3JtYXQuXG5jb25zdCB0cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBBQ0wsIC4uLnJlc3VsdCB9KSA9PiB7XG4gIGlmICghQUNMKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHJlc3VsdC5fd3Blcm0gPSBbXTtcbiAgcmVzdWx0Ll9ycGVybSA9IFtdO1xuXG4gIGZvciAoY29uc3QgZW50cnkgaW4gQUNMKSB7XG4gICAgaWYgKEFDTFtlbnRyeV0ucmVhZCkge1xuICAgICAgcmVzdWx0Ll9ycGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gICAgaWYgKEFDTFtlbnRyeV0ud3JpdGUpIHtcbiAgICAgIHJlc3VsdC5fd3Blcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5jb25zdCBzcGVjaWFsUXVlcnlrZXlzID0gW1xuICAnJGFuZCcsXG4gICckb3InLFxuICAnJG5vcicsXG4gICdfcnBlcm0nLFxuICAnX3dwZXJtJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFF1ZXJ5S2V5ID0ga2V5ID0+IHtcbiAgcmV0dXJuIHNwZWNpYWxRdWVyeWtleXMuaW5kZXhPZihrZXkpID49IDA7XG59O1xuXG5jb25zdCB2YWxpZGF0ZVF1ZXJ5ID0gKHF1ZXJ5OiBhbnkpOiB2b2lkID0+IHtcbiAgaWYgKHF1ZXJ5LkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQ2Fubm90IHF1ZXJ5IG9uIEFDTC4nKTtcbiAgfVxuXG4gIGlmIChxdWVyeS4kb3IpIHtcbiAgICBpZiAocXVlcnkuJG9yIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkb3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kYW5kKSB7XG4gICAgaWYgKHF1ZXJ5LiRhbmQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJGFuZC5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkYW5kIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJG5vcikge1xuICAgIGlmIChxdWVyeS4kbm9yIGluc3RhbmNlb2YgQXJyYXkgJiYgcXVlcnkuJG5vci5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeS4kbm9yLmZvckVhY2godmFsaWRhdGVRdWVyeSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkbm9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSBvZiBhdCBsZWFzdCAxIHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAocXVlcnkgJiYgcXVlcnlba2V5XSAmJiBxdWVyeVtrZXldLiRyZWdleCkge1xuICAgICAgaWYgKHR5cGVvZiBxdWVyeVtrZXldLiRvcHRpb25zID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXF1ZXJ5W2tleV0uJG9wdGlvbnMubWF0Y2goL15baW14c10rJC8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgIGBCYWQgJG9wdGlvbnMgdmFsdWUgZm9yIHF1ZXJ5OiAke3F1ZXJ5W2tleV0uJG9wdGlvbnN9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFpc1NwZWNpYWxRdWVyeUtleShrZXkpICYmICFrZXkubWF0Y2goL15bYS16QS1aXVthLXpBLVowLTlfXFwuXSokLykpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgSW52YWxpZCBrZXkgbmFtZTogJHtrZXl9YCk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIEZpbHRlcnMgb3V0IGFueSBkYXRhIHRoYXQgc2hvdWxkbid0IGJlIG9uIHRoaXMgUkVTVC1mb3JtYXR0ZWQgb2JqZWN0LlxuY29uc3QgZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IChcbiAgaXNNYXN0ZXI6IGJvb2xlYW4sXG4gIGFjbEdyb3VwOiBhbnlbXSxcbiAgYXV0aDogYW55LFxuICBvcGVyYXRpb246IGFueSxcbiAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gIGNsYXNzTmFtZTogc3RyaW5nLFxuICBwcm90ZWN0ZWRGaWVsZHM6IG51bGwgfCBBcnJheTxhbnk+LFxuICBvYmplY3Q6IGFueVxuKSA9PiB7XG4gIGxldCB1c2VySWQgPSBudWxsO1xuICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHVzZXJJZCA9IGF1dGgudXNlci5pZDtcblxuICAvLyByZXBsYWNlIHByb3RlY3RlZEZpZWxkcyB3aGVuIHVzaW5nIHBvaW50ZXItcGVybWlzc2lvbnNcbiAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gIGlmIChwZXJtcykge1xuICAgIGNvbnN0IGlzUmVhZE9wZXJhdGlvbiA9IFsnZ2V0JywgJ2ZpbmQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMTtcblxuICAgIGlmIChpc1JlYWRPcGVyYXRpb24gJiYgcGVybXMucHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBleHRyYWN0IHByb3RlY3RlZEZpZWxkcyBhZGRlZCB3aXRoIHRoZSBwb2ludGVyLXBlcm1pc3Npb24gcHJlZml4XG4gICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybSA9IE9iamVjdC5rZXlzKHBlcm1zLnByb3RlY3RlZEZpZWxkcylcbiAgICAgICAgLmZpbHRlcihrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSlcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIHJldHVybiB7IGtleToga2V5LnN1YnN0cmluZygxMCksIHZhbHVlOiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB9O1xuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbmV3UHJvdGVjdGVkRmllbGRzOiBBcnJheTxzdHJpbmc+W10gPSBbXTtcbiAgICAgIGxldCBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IGZhbHNlO1xuXG4gICAgICAvLyBjaGVjayBpZiB0aGUgb2JqZWN0IGdyYW50cyB0aGUgY3VycmVudCB1c2VyIGFjY2VzcyBiYXNlZCBvbiB0aGUgZXh0cmFjdGVkIGZpZWxkc1xuICAgICAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0uZm9yRWFjaChwb2ludGVyUGVybSA9PiB7XG4gICAgICAgIGxldCBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IGZhbHNlO1xuICAgICAgICBjb25zdCByZWFkVXNlckZpZWxkVmFsdWUgPSBvYmplY3RbcG9pbnRlclBlcm0ua2V5XTtcbiAgICAgICAgaWYgKHJlYWRVc2VyRmllbGRWYWx1ZSkge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlYWRVc2VyRmllbGRWYWx1ZSkpIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gcmVhZFVzZXJGaWVsZFZhbHVlLnNvbWUoXG4gICAgICAgICAgICAgIHVzZXIgPT4gdXNlci5vYmplY3RJZCAmJiB1c2VyLm9iamVjdElkID09PSB1c2VySWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID1cbiAgICAgICAgICAgICAgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkICYmIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCA9PT0gdXNlcklkO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwb2ludGVyUGVybUluY2x1ZGVzVXNlcikge1xuICAgICAgICAgIG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gdHJ1ZTtcbiAgICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwb2ludGVyUGVybS52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBpZiBhdCBsZWFzdCBvbmUgcG9pbnRlci1wZXJtaXNzaW9uIGFmZmVjdGVkIHRoZSBjdXJyZW50IHVzZXJcbiAgICAgIC8vIGludGVyc2VjdCB2cyBwcm90ZWN0ZWRGaWVsZHMgZnJvbSBwcmV2aW91cyBzdGFnZSAoQHNlZSBhZGRQcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAvLyBTZXRzIHRoZW9yeSAoaW50ZXJzZWN0aW9ucyk6IEEgeCAoQiB4IEMpID09IChBIHggQikgeCBDXG4gICAgICBpZiAob3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgJiYgcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHByb3RlY3RlZEZpZWxkcyk7XG4gICAgICB9XG4gICAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgICAgLy8gaWYgdGhlcmUncmUgbm8gcHJvdGN0ZWRGaWVsZHMgYnkgb3RoZXIgY3JpdGVyaWEgKCBpZCAvIHJvbGUgLyBhdXRoKVxuICAgICAgICAgIC8vIHRoZW4gd2UgbXVzdCBpbnRlcnNlY3QgZWFjaCBzZXQgKHBlciB1c2VyRmllbGQpXG4gICAgICAgICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGZpZWxkcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBpc1VzZXJDbGFzcyA9IGNsYXNzTmFtZSA9PT0gJ19Vc2VyJztcblxuICAvKiBzcGVjaWFsIHRyZWF0IGZvciB0aGUgdXNlciBjbGFzczogZG9uJ3QgZmlsdGVyIHByb3RlY3RlZEZpZWxkcyBpZiBjdXJyZW50bHkgbG9nZ2VkaW4gdXNlciBpc1xuICB0aGUgcmV0cmlldmVkIHVzZXIgKi9cbiAgaWYgKCEoaXNVc2VyQ2xhc3MgJiYgdXNlcklkICYmIG9iamVjdC5vYmplY3RJZCA9PT0gdXNlcklkKSkge1xuICAgIHByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuXG4gICAgLy8gZmllbGRzIG5vdCByZXF1ZXN0ZWQgYnkgY2xpZW50IChleGNsdWRlZCksXG4gICAgLy9idXQgd2VyZSBuZWVkZWQgdG8gYXBwbHkgcHJvdGVjdHRlZEZpZWxkc1xuICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcyAmJlxuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMgJiZcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzLmZvckVhY2goayA9PiBkZWxldGUgb2JqZWN0W2tdKTtcbiAgfVxuXG4gIGlmICghaXNVc2VyQ2xhc3MpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgb2JqZWN0LnBhc3N3b3JkID0gb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gIGRlbGV0ZSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcblxuICBkZWxldGUgb2JqZWN0LnNlc3Npb25Ub2tlbjtcblxuICBpZiAoaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll90b21ic3RvbmU7XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9mYWlsZWRfbG9naW5fY291bnQ7XG4gIGRlbGV0ZSBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9oaXN0b3J5O1xuXG4gIGlmIChhY2xHcm91cC5pbmRleE9mKG9iamVjdC5vYmplY3RJZCkgPiAtMSkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbi8vIFJ1bnMgYW4gdXBkYXRlIG9uIHRoZSBkYXRhYmFzZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBvYmplY3Qgd2l0aCB0aGUgbmV3IHZhbHVlcyBmb3IgZmllbGRcbi8vIG1vZGlmaWNhdGlvbnMgdGhhdCBkb24ndCBrbm93IHRoZWlyIHJlc3VsdHMgYWhlYWQgb2YgdGltZSwgbGlrZVxuLy8gJ2luY3JlbWVudCcuXG4vLyBPcHRpb25zOlxuLy8gICBhY2w6ICBhIGxpc3Qgb2Ygc3RyaW5ncy4gSWYgdGhlIG9iamVjdCB0byBiZSB1cGRhdGVkIGhhcyBhbiBBQ0wsXG4vLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4vLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuY29uc3Qgc3BlY2lhbEtleXNGb3JVcGRhdGUgPSBbXG4gICdfaGFzaGVkX3Bhc3N3b3JkJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50JyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLFxuICAnX3Bhc3N3b3JkX2hpc3RvcnknLFxuXTtcblxuY29uc3QgaXNTcGVjaWFsVXBkYXRlS2V5ID0ga2V5ID0+IHtcbiAgcmV0dXJuIHNwZWNpYWxLZXlzRm9yVXBkYXRlLmluZGV4T2Yoa2V5KSA+PSAwO1xufTtcblxuZnVuY3Rpb24gZXhwYW5kUmVzdWx0T25LZXlQYXRoKG9iamVjdCwga2V5LCB2YWx1ZSkge1xuICBpZiAoa2V5LmluZGV4T2YoJy4nKSA8IDApIHtcbiAgICBvYmplY3Rba2V5XSA9IHZhbHVlW2tleV07XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBjb25zdCBwYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gIGNvbnN0IGZpcnN0S2V5ID0gcGF0aFswXTtcbiAgY29uc3QgbmV4dFBhdGggPSBwYXRoLnNsaWNlKDEpLmpvaW4oJy4nKTtcbiAgb2JqZWN0W2ZpcnN0S2V5XSA9IGV4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3RbZmlyc3RLZXldIHx8IHt9LCBuZXh0UGF0aCwgdmFsdWVbZmlyc3RLZXldKTtcbiAgZGVsZXRlIG9iamVjdFtrZXldO1xuICByZXR1cm4gb2JqZWN0O1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQpOiBQcm9taXNlPGFueT4ge1xuICBjb25zdCByZXNwb25zZSA9IHt9O1xuICBpZiAoIXJlc3VsdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICB9XG4gIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgY29uc3Qga2V5VXBkYXRlID0gb3JpZ2luYWxPYmplY3Rba2V5XTtcbiAgICAvLyBkZXRlcm1pbmUgaWYgdGhhdCB3YXMgYW4gb3BcbiAgICBpZiAoXG4gICAgICBrZXlVcGRhdGUgJiZcbiAgICAgIHR5cGVvZiBrZXlVcGRhdGUgPT09ICdvYmplY3QnICYmXG4gICAgICBrZXlVcGRhdGUuX19vcCAmJlxuICAgICAgWydBZGQnLCAnQWRkVW5pcXVlJywgJ1JlbW92ZScsICdJbmNyZW1lbnQnXS5pbmRleE9mKGtleVVwZGF0ZS5fX29wKSA+IC0xXG4gICAgKSB7XG4gICAgICAvLyBvbmx5IHZhbGlkIG9wcyB0aGF0IHByb2R1Y2UgYW4gYWN0aW9uYWJsZSByZXN1bHRcbiAgICAgIC8vIHRoZSBvcCBtYXkgaGF2ZSBoYXBwZW5kIG9uIGEga2V5cGF0aFxuICAgICAgZXhwYW5kUmVzdWx0T25LZXlQYXRoKHJlc3BvbnNlLCBrZXksIHJlc3VsdCk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG59XG5cbmZ1bmN0aW9uIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIGBfSm9pbjoke2tleX06JHtjbGFzc05hbWV9YDtcbn1cblxuY29uc3QgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSA9IG9iamVjdCA9PiB7XG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICBzd2l0Y2ggKG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldLmFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY2xhc3MgRGF0YWJhc2VDb250cm9sbGVyIHtcbiAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIGlkZW1wb3RlbmN5T3B0aW9uczogYW55O1xuICBzY2hlbWFDYWNoZTogYW55O1xuICBzY2hlbWFQcm9taXNlOiA/UHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+O1xuICBfdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnk7XG5cbiAgY29uc3RydWN0b3IoYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIGlkZW1wb3RlbmN5T3B0aW9ucz86IE9iamVjdCA9IHt9KSB7XG4gICAgdGhpcy5hZGFwdGVyID0gYWRhcHRlcjtcbiAgICB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucyA9IGlkZW1wb3RlbmN5T3B0aW9ucztcbiAgICAvLyBXZSBkb24ndCB3YW50IGEgbXV0YWJsZSB0aGlzLnNjaGVtYSwgYmVjYXVzZSB0aGVuIHlvdSBjb3VsZCBoYXZlXG4gICAgLy8gb25lIHJlcXVlc3QgdGhhdCB1c2VzIGRpZmZlcmVudCBzY2hlbWFzIGZvciBkaWZmZXJlbnQgcGFydHMgb2ZcbiAgICAvLyBpdC4gSW5zdGVhZCwgdXNlIGxvYWRTY2hlbWEgdG8gZ2V0IGEgc2NoZW1hLlxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICB9XG5cbiAgY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY2xhc3NFeGlzdHMoY2xhc3NOYW1lKTtcbiAgfVxuXG4gIHB1cmdlQ29sbGVjdGlvbihjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUpKVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShjbGFzc05hbWUsIHNjaGVtYSwge30pKTtcbiAgfVxuXG4gIHZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCAnaW52YWxpZCBjbGFzc05hbWU6ICcgKyBjbGFzc05hbWUpXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBzY2hlbWFDb250cm9sbGVyLlxuICBsb2FkU2NoZW1hKFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hUHJvbWlzZSAhPSBudWxsKSB7XG4gICAgICByZXR1cm4gdGhpcy5zY2hlbWFQcm9taXNlO1xuICAgIH1cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBTY2hlbWFDb250cm9sbGVyLmxvYWQodGhpcy5hZGFwdGVyLCBvcHRpb25zKTtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UudGhlbihcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2UsXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgbG9hZFNjaGVtYUlmTmVlZGVkKFxuICAgIHNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyID8gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYUNvbnRyb2xsZXIpIDogdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSBjbGFzc25hbWUgdGhhdCBpcyByZWxhdGVkIHRvIHRoZSBnaXZlblxuICAvLyBjbGFzc25hbWUgdGhyb3VnaCB0aGUga2V5LlxuICAvLyBUT0RPOiBtYWtlIHRoaXMgbm90IGluIHRoZSBEYXRhYmFzZUNvbnRyb2xsZXIgaW50ZXJmYWNlXG4gIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZyk6IFByb21pc2U8P3N0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PiB7XG4gICAgICB2YXIgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKHQgIT0gbnVsbCAmJiB0eXBlb2YgdCAhPT0gJ3N0cmluZycgJiYgdC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiB0LnRhcmdldENsYXNzO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGNsYXNzTmFtZTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFVzZXMgdGhlIHNjaGVtYSB0byB2YWxpZGF0ZSB0aGUgb2JqZWN0IChSRVNUIEFQSSBmb3JtYXQpLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hLlxuICAvLyBUaGlzIGRvZXMgbm90IHVwZGF0ZSB0aGlzLnNjaGVtYSwgYmVjYXVzZSBpbiBhIHNpdHVhdGlvbiBsaWtlIGFcbiAgLy8gYmF0Y2ggcmVxdWVzdCwgdGhhdCBjb3VsZCBjb25mdXNlIG90aGVyIHVzZXJzIG9mIHRoZSBzY2hlbWEuXG4gIHZhbGlkYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGxldCBzY2hlbWE7XG4gICAgY29uc3QgYWNsID0gcnVuT3B0aW9ucy5hY2w7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXA6IHN0cmluZ1tdID0gYWNsIHx8IFtdO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4ocyA9PiB7XG4gICAgICAgIHNjaGVtYSA9IHM7XG4gICAgICAgIGlmIChpc01hc3Rlcikge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5jYW5BZGRGaWVsZChzY2hlbWEsIGNsYXNzTmFtZSwgb2JqZWN0LCBhY2xHcm91cCwgcnVuT3B0aW9ucyk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHsgYWNsLCBtYW55LCB1cHNlcnQsIGFkZHNGaWVsZCB9OiBGdWxsUXVlcnlPcHRpb25zID0ge30sXG4gICAgc2tpcFNhbml0aXphdGlvbjogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IHF1ZXJ5O1xuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0gdXBkYXRlO1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICB1cGRhdGUgPSBkZWVwY29weSh1cGRhdGUpO1xuICAgIHZhciByZWxhdGlvblVwZGF0ZXMgPSBbXTtcbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ3VwZGF0ZScpXG4gICAgICApXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLCB1cGRhdGUpO1xuICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgJ3VwZGF0ZScsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKGFkZHNGaWVsZCkge1xuICAgICAgICAgICAgICBxdWVyeSA9IHtcbiAgICAgICAgICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICdhZGRGaWVsZCcsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnkpO1xuICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpICYmXG4gICAgICAgICAgICAgICAgICAhaXNTcGVjaWFsVXBkYXRlS2V5KHJvb3RGaWVsZE5hbWUpXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHVwZGF0ZU9wZXJhdGlvbiBpbiB1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSAmJlxuICAgICAgICAgICAgICAgICAgdHlwZW9mIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0pLnNvbWUoXG4gICAgICAgICAgICAgICAgICAgIGlubmVyS2V5ID0+IGlubmVyS2V5LmluY2x1ZGVzKCckJykgfHwgaW5uZXJLZXkuaW5jbHVkZXMoJy4nKVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdXBkYXRlID0gdHJhbnNmb3JtT2JqZWN0QUNMKHVwZGF0ZSk7XG4gICAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwge30pLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0IHx8ICFyZXN1bHQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAobWFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cHNlcnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCxcbiAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmIChza2lwU2FuaXRpemF0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBzYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsVXBkYXRlLCByZXN1bHQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvbGxlY3QgYWxsIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIGxpc3Qgb2YgYWxsIHJlbGF0aW9uIHVwZGF0ZXMgdG8gcGVyZm9ybVxuICAvLyBUaGlzIG11dGF0ZXMgdXBkYXRlLlxuICBjb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogP3N0cmluZywgdXBkYXRlOiBhbnkpIHtcbiAgICB2YXIgb3BzID0gW107XG4gICAgdmFyIGRlbGV0ZU1lID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG5cbiAgICB2YXIgcHJvY2VzcyA9IChvcCwga2V5KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdCYXRjaCcpIHtcbiAgICAgICAgZm9yICh2YXIgeCBvZiBvcC5vcHMpIHtcbiAgICAgICAgICBwcm9jZXNzKHgsIGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gdXBkYXRlKSB7XG4gICAgICBwcm9jZXNzKHVwZGF0ZVtrZXldLCBrZXkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBkZWxldGVNZSkge1xuICAgICAgZGVsZXRlIHVwZGF0ZVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gb3BzO1xuICB9XG5cbiAgLy8gUHJvY2Vzc2VzIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbCB1cGRhdGVzIGhhdmUgYmVlbiBwZXJmb3JtZWRcbiAgaGFuZGxlUmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogc3RyaW5nLCB1cGRhdGU6IGFueSwgb3BzOiBhbnkpIHtcbiAgICB2YXIgcGVuZGluZyA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuICAgIG9wcy5mb3JFYWNoKCh7IGtleSwgb3AgfSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5hZGRSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaCh0aGlzLnJlbW92ZVJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwZW5kaW5nKTtcbiAgfVxuXG4gIC8vIEFkZHMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBhZGQgd2FzIHN1Y2Nlc3NmdWwuXG4gIGFkZFJlbGF0aW9uKGtleTogc3RyaW5nLCBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsIGZyb21JZDogc3RyaW5nLCB0b0lkOiBzdHJpbmcpIHtcbiAgICBjb25zdCBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICBkb2MsXG4gICAgICBkb2MsXG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmVzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgcmVtb3ZlIHdhc1xuICAvLyBzdWNjZXNzZnVsLlxuICByZW1vdmVSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgdmFyIGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICBkb2MsXG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCBjYXJlIGlmIHRoZXkgdHJ5IHRvIGRlbGV0ZSBhIG5vbi1leGlzdGVudCByZWxhdGlvbi5cbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBvYmplY3RzIG1hdGNoZXMgdGhpcyBxdWVyeSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgd2FzXG4gIC8vIGRlbGV0ZWQuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuICAvLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4gIC8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG4gIGRlc3Ryb3koXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2RlbGV0ZScpXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAnZGVsZXRlJyxcbiAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZGVsZXRlIGJ5IHF1ZXJ5XG4gICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICB9XG4gICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnkpO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHBhcnNlRm9ybWF0U2NoZW1hID0+XG4gICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gV2hlbiBkZWxldGluZyBzZXNzaW9ucyB3aGlsZSBjaGFuZ2luZyBwYXNzd29yZHMsIGRvbid0IHRocm93IGFuIGVycm9yIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbnkgc2Vzc2lvbnMuXG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gSW5zZXJ0cyBhbiBvYmplY3QgaW50byB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHNhdmVkLlxuICBjcmVhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgY29uc3Qgb3JpZ2luYWxPYmplY3QgPSBvYmplY3Q7XG4gICAgb2JqZWN0ID0gdHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG5cbiAgICBvYmplY3QuY3JlYXRlZEF0ID0geyBpc286IG9iamVjdC5jcmVhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG4gICAgb2JqZWN0LnVwZGF0ZWRBdCA9IHsgaXNvOiBvYmplY3QudXBkYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuXG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIGNvbnN0IHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWUsIG51bGwsIG9iamVjdCk7XG5cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWUpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnY3JlYXRlJylcbiAgICAgICAgKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSkpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKSlcbiAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgICAgICBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlKG9iamVjdCk7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIFNjaGVtYUNvbnRyb2xsZXIuY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShzY2hlbWEpLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsT2JqZWN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBzYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQub3BzWzBdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICBjYW5BZGRGaWVsZChcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNsYXNzU2NoZW1hID0gc2NoZW1hLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNsYXNzU2NoZW1hKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gICAgY29uc3Qgc2NoZW1hRmllbGRzID0gT2JqZWN0LmtleXMoY2xhc3NTY2hlbWEuZmllbGRzKTtcbiAgICBjb25zdCBuZXdLZXlzID0gZmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICAvLyBTa2lwIGZpZWxkcyB0aGF0IGFyZSB1bnNldFxuICAgICAgaWYgKG9iamVjdFtmaWVsZF0gJiYgb2JqZWN0W2ZpZWxkXS5fX29wICYmIG9iamVjdFtmaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNjaGVtYUZpZWxkcy5pbmRleE9mKGdldFJvb3RGaWVsZE5hbWUoZmllbGQpKSA8IDA7XG4gICAgfSk7XG4gICAgaWYgKG5ld0tleXMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYWRkcyBhIG1hcmtlciB0aGF0IG5ldyBmaWVsZCBpcyBiZWluZyBhZGRpbmcgZHVyaW5nIHVwZGF0ZVxuICAgICAgcnVuT3B0aW9ucy5hZGRzRmllbGQgPSB0cnVlO1xuXG4gICAgICBjb25zdCBhY3Rpb24gPSBydW5PcHRpb25zLmFjdGlvbjtcbiAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdhZGRGaWVsZCcsIGFjdGlvbik7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdvbid0IGRlbGV0ZSBjb2xsZWN0aW9ucyBpbiB0aGUgc3lzdGVtIG5hbWVzcGFjZVxuICAvKipcbiAgICogRGVsZXRlIGFsbCBjbGFzc2VzIGFuZCBjbGVhcnMgdGhlIHNjaGVtYSBjYWNoZVxuICAgKlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IGZhc3Qgc2V0IHRvIHRydWUgaWYgaXQncyBvayB0byBqdXN0IGRlbGV0ZSByb3dzIGFuZCBub3QgaW5kZXhlc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gd2hlbiB0aGUgZGVsZXRpb25zIGNvbXBsZXRlc1xuICAgKi9cbiAgZGVsZXRlRXZlcnl0aGluZyhmYXN0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPGFueT4ge1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUFsbENsYXNzZXMoZmFzdCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIHJlbGF0ZWQgaWRzIGdpdmVuIGFuIG93bmluZyBpZC5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIHJlbGF0ZWRJZHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgb3duaW5nSWQ6IHN0cmluZyxcbiAgICBxdWVyeU9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPEFycmF5PHN0cmluZz4+IHtcbiAgICBjb25zdCB7IHNraXAsIGxpbWl0LCBzb3J0IH0gPSBxdWVyeU9wdGlvbnM7XG4gICAgY29uc3QgZmluZE9wdGlvbnMgPSB7fTtcbiAgICBpZiAoc29ydCAmJiBzb3J0LmNyZWF0ZWRBdCAmJiB0aGlzLmFkYXB0ZXIuY2FuU29ydE9uSm9pblRhYmxlcykge1xuICAgICAgZmluZE9wdGlvbnMuc29ydCA9IHsgX2lkOiBzb3J0LmNyZWF0ZWRBdCB9O1xuICAgICAgZmluZE9wdGlvbnMubGltaXQgPSBsaW1pdDtcbiAgICAgIGZpbmRPcHRpb25zLnNraXAgPSBza2lwO1xuICAgICAgcXVlcnlPcHRpb25zLnNraXAgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSwgcmVsYXRpb25TY2hlbWEsIHsgb3duaW5nSWQgfSwgZmluZE9wdGlvbnMpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmVsYXRlZElkKSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIG93bmluZyBpZHMgZ2l2ZW4gc29tZSByZWxhdGVkIGlkcy5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIG93bmluZ0lkcyhjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcsIHJlbGF0ZWRJZHM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKFxuICAgICAgICBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIHsgcmVsYXRlZElkOiB7ICRpbjogcmVsYXRlZElkcyB9IH0sXG4gICAgICAgIHsga2V5czogWydvd25pbmdJZCddIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5vd25pbmdJZCkpO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRpbiBvbiByZWxhdGlvbiBmaWVsZHMsIG9yXG4gIC8vIGVxdWFsLXRvLXBvaW50ZXIgY29uc3RyYWludHMgb24gcmVsYXRpb24gZmllbGRzLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBzY2hlbWE6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gU2VhcmNoIGZvciBhbiBpbi1yZWxhdGlvbiBvciBlcXVhbC10by1yZWxhdGlvblxuICAgIC8vIE1ha2UgaXQgc2VxdWVudGlhbCBmb3Igbm93LCBub3Qgc3VyZSBvZiBwYXJhbGxlaXphdGlvbiBzaWRlIGVmZmVjdHNcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICBjb25zdCBvcnMgPSBxdWVyeVsnJG9yJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIG9ycy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHF1ZXJ5Wyckb3InXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgY29uc3QgYW5kcyA9IHF1ZXJ5WyckYW5kJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIGFuZHMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJGFuZCddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbWlzZXMgPSBPYmplY3Qua2V5cyhxdWVyeSkubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAoIXQgfHwgdC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfVxuICAgICAgbGV0IHF1ZXJpZXM6ID8oYW55W10pID0gbnVsbDtcbiAgICAgIGlmIChcbiAgICAgICAgcXVlcnlba2V5XSAmJlxuICAgICAgICAocXVlcnlba2V5XVsnJGluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmUnXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV0uX190eXBlID09ICdQb2ludGVyJylcbiAgICAgICkge1xuICAgICAgICAvLyBCdWlsZCB0aGUgbGlzdCBvZiBxdWVyaWVzXG4gICAgICAgIHF1ZXJpZXMgPSBPYmplY3Qua2V5cyhxdWVyeVtrZXldKS5tYXAoY29uc3RyYWludEtleSA9PiB7XG4gICAgICAgICAgbGV0IHJlbGF0ZWRJZHM7XG4gICAgICAgICAgbGV0IGlzTmVnYXRpb24gPSBmYWxzZTtcbiAgICAgICAgICBpZiAoY29uc3RyYWludEtleSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRpbicpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuaW4nKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckbmluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmUnKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XVsnJG5lJ10ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uLFxuICAgICAgICAgICAgcmVsYXRlZElkcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJpZXMgPSBbeyBpc05lZ2F0aW9uOiBmYWxzZSwgcmVsYXRlZElkczogW10gfV07XG4gICAgICB9XG5cbiAgICAgIC8vIHJlbW92ZSB0aGUgY3VycmVudCBxdWVyeUtleSBhcyB3ZSBkb24sdCBuZWVkIGl0IGFueW1vcmVcbiAgICAgIGRlbGV0ZSBxdWVyeVtrZXldO1xuICAgICAgLy8gZXhlY3V0ZSBlYWNoIHF1ZXJ5IGluZGVwZW5kZW50bHkgdG8gYnVpbGQgdGhlIGxpc3Qgb2ZcbiAgICAgIC8vICRpbiAvICRuaW5cbiAgICAgIGNvbnN0IHByb21pc2VzID0gcXVlcmllcy5tYXAocSA9PiB7XG4gICAgICAgIGlmICghcSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5vd25pbmdJZHMoY2xhc3NOYW1lLCBrZXksIHEucmVsYXRlZElkcykudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGlmIChxLmlzTmVnYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJHJlbGF0ZWRUb1xuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHF1ZXJ5T3B0aW9uczogYW55KTogP1Byb21pc2U8dm9pZD4ge1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRvciddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChxdWVyeVsnJGFuZCddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5WyckYW5kJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgYVF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgdmFyIHJlbGF0ZWRUbyA9IHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgaWYgKHJlbGF0ZWRUbykge1xuICAgICAgcmV0dXJuIHRoaXMucmVsYXRlZElkcyhcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHJlbGF0ZWRUby5rZXksXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3Qub2JqZWN0SWQsXG4gICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgKVxuICAgICAgICAudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHsgfSk7XG4gICAgfVxuICB9XG5cbiAgYWRkSW5PYmplY3RJZHNJZHMoaWRzOiA/QXJyYXk8c3RyaW5nPiA9IG51bGwsIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tU3RyaW5nOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnID8gW3F1ZXJ5Lm9iamVjdElkXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUVxOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGVxJ10gPyBbcXVlcnkub2JqZWN0SWRbJyRlcSddXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUluOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGluJ10gPyBxdWVyeS5vYmplY3RJZFsnJGluJ10gOiBudWxsO1xuXG4gICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgY29uc3QgYWxsSWRzOiBBcnJheTxBcnJheTxzdHJpbmc+PiA9IFtpZHNGcm9tU3RyaW5nLCBpZHNGcm9tRXEsIGlkc0Zyb21JbiwgaWRzXS5maWx0ZXIoXG4gICAgICBsaXN0ID0+IGxpc3QgIT09IG51bGxcbiAgICApO1xuICAgIGNvbnN0IHRvdGFsTGVuZ3RoID0gYWxsSWRzLnJlZHVjZSgobWVtbywgbGlzdCkgPT4gbWVtbyArIGxpc3QubGVuZ3RoLCAwKTtcblxuICAgIGxldCBpZHNJbnRlcnNlY3Rpb24gPSBbXTtcbiAgICBpZiAodG90YWxMZW5ndGggPiAxMjUpIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdC5iaWcoYWxsSWRzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0KGFsbElkcyk7XG4gICAgfVxuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG4gICAgcXVlcnkub2JqZWN0SWRbJyRpbiddID0gaWRzSW50ZXJzZWN0aW9uO1xuXG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzOiBzdHJpbmdbXSA9IFtdLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbU5pbiA9IHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPyBxdWVyeS5vYmplY3RJZFsnJG5pbiddIDogW107XG4gICAgbGV0IGFsbElkcyA9IFsuLi5pZHNGcm9tTmluLCAuLi5pZHNdLmZpbHRlcihsaXN0ID0+IGxpc3QgIT09IG51bGwpO1xuXG4gICAgLy8gbWFrZSBhIHNldCBhbmQgc3ByZWFkIHRvIHJlbW92ZSBkdXBsaWNhdGVzXG4gICAgYWxsSWRzID0gWy4uLm5ldyBTZXQoYWxsSWRzKV07XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA9IGFsbElkcztcbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBSdW5zIGEgcXVlcnkgb24gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGEgbGlzdCBvZiBpdGVtcy5cbiAgLy8gT3B0aW9uczpcbiAgLy8gICBza2lwICAgIG51bWJlciBvZiByZXN1bHRzIHRvIHNraXAuXG4gIC8vICAgbGltaXQgICBsaW1pdCB0byB0aGlzIG51bWJlciBvZiByZXN1bHRzLlxuICAvLyAgIHNvcnQgICAgYW4gb2JqZWN0IHdoZXJlIGtleXMgYXJlIHRoZSBmaWVsZHMgdG8gc29ydCBieS5cbiAgLy8gICAgICAgICAgIHRoZSB2YWx1ZSBpcyArMSBmb3IgYXNjZW5kaW5nLCAtMSBmb3IgZGVzY2VuZGluZy5cbiAgLy8gICBjb3VudCAgIHJ1biBhIGNvdW50IGluc3RlYWQgb2YgcmV0dXJuaW5nIHJlc3VsdHMuXG4gIC8vICAgYWNsICAgICByZXN0cmljdCB0aGlzIG9wZXJhdGlvbiB3aXRoIGFuIEFDTCBmb3IgdGhlIHByb3ZpZGVkIGFycmF5XG4gIC8vICAgICAgICAgICBvZiB1c2VyIG9iamVjdElkcyBhbmQgcm9sZXMuIGFjbDogbnVsbCBtZWFucyBubyB1c2VyLlxuICAvLyAgICAgICAgICAgd2hlbiB0aGlzIGZpZWxkIGlzIG5vdCBwcmVzZW50LCBkb24ndCBkbyBhbnl0aGluZyByZWdhcmRpbmcgQUNMcy5cbiAgLy8gIGNhc2VJbnNlbnNpdGl2ZSBtYWtlIHN0cmluZyBjb21wYXJpc29ucyBjYXNlIGluc2Vuc2l0aXZlXG4gIC8vIFRPRE86IG1ha2UgdXNlcklkcyBub3QgbmVlZGVkIGhlcmUuIFRoZSBkYiBhZGFwdGVyIHNob3VsZG4ndCBrbm93XG4gIC8vIGFueXRoaW5nIGFib3V0IHVzZXJzLCBpZGVhbGx5LiBUaGVuLCBpbXByb3ZlIHRoZSBmb3JtYXQgb2YgdGhlIEFDTFxuICAvLyBhcmcgdG8gd29yayBsaWtlIHRoZSBvdGhlcnMuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBhY2wsXG4gICAgICBzb3J0ID0ge30sXG4gICAgICBjb3VudCxcbiAgICAgIGtleXMsXG4gICAgICBvcCxcbiAgICAgIGRpc3RpbmN0LFxuICAgICAgcGlwZWxpbmUsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgIGhpbnQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUgPSBmYWxzZSxcbiAgICAgIGV4cGxhaW4sXG4gICAgfTogYW55ID0ge30sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIG9wID1cbiAgICAgIG9wIHx8ICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT0gJ3N0cmluZycgJiYgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMSA/ICdnZXQnIDogJ2ZpbmQnKTtcbiAgICAvLyBDb3VudCBvcGVyYXRpb24gaWYgY291bnRpbmdcbiAgICBvcCA9IGNvdW50ID09PSB0cnVlID8gJ2NvdW50JyA6IG9wO1xuXG4gICAgbGV0IGNsYXNzRXhpc3RzID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgLy9BbGxvdyB2b2xhdGlsZSBjbGFzc2VzIGlmIHF1ZXJ5aW5nIHdpdGggTWFzdGVyIChmb3IgX1B1c2hTdGF0dXMpXG4gICAgICAvL1RPRE86IE1vdmUgdm9sYXRpbGUgY2xhc3NlcyBjb25jZXB0IGludG8gbW9uZ28gYWRhcHRlciwgcG9zdGdyZXMgYWRhcHRlciBzaG91bGRuJ3QgY2FyZVxuICAgICAgLy90aGF0IGFwaS5wYXJzZS5jb20gYnJlYWtzIHdoZW4gX1B1c2hTdGF0dXMgZXhpc3RzIGluIG1vbmdvLlxuICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGlzTWFzdGVyKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIC8vIEJlaGF2aW9yIGZvciBub24tZXhpc3RlbnQgY2xhc3NlcyBpcyBraW5kYSB3ZWlyZCBvbiBQYXJzZS5jb20uIFByb2JhYmx5IGRvZXNuJ3QgbWF0dGVyIHRvbyBtdWNoLlxuICAgICAgICAgIC8vIEZvciBub3csIHByZXRlbmQgdGhlIGNsYXNzIGV4aXN0cyBidXQgaGFzIG5vIG9iamVjdHMsXG4gICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNsYXNzRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgIC8vIFBhcnNlLmNvbSB0cmVhdHMgcXVlcmllcyBvbiBfY3JlYXRlZF9hdCBhbmQgX3VwZGF0ZWRfYXQgYXMgaWYgdGhleSB3ZXJlIHF1ZXJpZXMgb24gY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQsXG4gICAgICAgICAgLy8gc28gZHVwbGljYXRlIHRoYXQgYmVoYXZpb3IgaGVyZS4gSWYgYm90aCBhcmUgc3BlY2lmaWVkLCB0aGUgY29ycmVjdCBiZWhhdmlvciB0byBtYXRjaCBQYXJzZS5jb20gaXMgdG9cbiAgICAgICAgICAvLyB1c2UgdGhlIG9uZSB0aGF0IGFwcGVhcnMgZmlyc3QgaW4gdGhlIHNvcnQgbGlzdC5cbiAgICAgICAgICBpZiAoc29ydC5fY3JlYXRlZF9hdCkge1xuICAgICAgICAgICAgc29ydC5jcmVhdGVkQXQgPSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgZGVsZXRlIHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzb3J0Ll91cGRhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LnVwZGF0ZWRBdCA9IHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcXVlcnlPcHRpb25zID0ge1xuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgc29ydCxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgICAgICBleHBsYWluLFxuICAgICAgICAgIH07XG4gICAgICAgICAgT2JqZWN0LmtleXMoc29ydCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBDYW5ub3Qgc29ydCBieSAke2ZpZWxkTmFtZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfS5gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCBvcClcbiAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICBsZXQgcHJvdGVjdGVkRmllbGRzO1xuICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIC8qIERvbid0IHVzZSBwcm9qZWN0aW9ucyB0byBvcHRpbWl6ZSB0aGUgcHJvdGVjdGVkRmllbGRzIHNpbmNlIHRoZSBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgICAgIGJhc2VkIG9uIHBvaW50ZXItcGVybWlzc2lvbnMgYXJlIGRldGVybWluZWQgYWZ0ZXIgcXVlcnlpbmcuIFRoZSBmaWx0ZXJpbmcgY2FuXG4gICAgICAgICAgICAgICAgICBvdmVyd3JpdGUgdGhlIHByb3RlY3RlZCBmaWVsZHMuICovXG4gICAgICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gdGhpcy5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgICAgICBpZiAob3AgPT09ICdnZXQnKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ3VwZGF0ZScgfHwgb3AgPT09ICdkZWxldGUnKSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkUmVhZEFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5KTtcbiAgICAgICAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY291bnQoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgaGludFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZGlzdGluY3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGlzdGluY3QoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBkaXN0aW5jdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBpcGVsaW5lKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFnZ3JlZ2F0ZShcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHBpcGVsaW5lLFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgICAgICAgZXhwbGFpblxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXhwbGFpbikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgICAgICAgICAgICAgLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpXG4gICAgICAgICAgICAgICAgICAudGhlbihvYmplY3RzID0+XG4gICAgICAgICAgICAgICAgICAgIG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0ID0gdW50cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0XG4gICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBkZWxldGVTY2hlbWEoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsZXQgc2NoZW1hQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLnRoZW4ocyA9PiB7XG4gICAgICAgIHNjaGVtYUNvbnRyb2xsZXIgPSBzO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKChzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZSlcbiAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLmFkYXB0ZXIuY291bnQoY2xhc3NOYW1lLCB7IGZpZWxkczoge30gfSwgbnVsbCwgJycsIGZhbHNlKSlcbiAgICAgICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgICAgICBpZiAoY291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAyNTUsXG4gICAgICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBpcyBub3QgZW1wdHksIGNvbnRhaW5zICR7Y291bnR9IG9iamVjdHMsIGNhbm5vdCBkcm9wIHNjaGVtYS5gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGNsYXNzTmFtZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbih3YXNQYXJzZUNvbGxlY3Rpb24gPT4ge1xuICAgICAgICAgICAgaWYgKHdhc1BhcnNlQ29sbGVjdGlvbikge1xuICAgICAgICAgICAgICBjb25zdCByZWxhdGlvbkZpZWxkTmFtZXMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5maWx0ZXIoXG4gICAgICAgICAgICAgICAgZmllbGROYW1lID0+IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgICAgICAgICByZWxhdGlvbkZpZWxkTmFtZXMubWFwKG5hbWUgPT5cbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwgbmFtZSkpXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIFNjaGVtYUNhY2hlLmRlbChjbGFzc05hbWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyLnJlbG9hZERhdGEoKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFRoaXMgaGVscHMgdG8gY3JlYXRlIGludGVybWVkaWF0ZSBvYmplY3RzIGZvciBzaW1wbGVyIGNvbXBhcmlzb24gb2ZcbiAgLy8ga2V5IHZhbHVlIHBhaXJzIHVzZWQgaW4gcXVlcnkgb2JqZWN0cy4gRWFjaCBrZXkgdmFsdWUgcGFpciB3aWxsIHJlcHJlc2VudGVkXG4gIC8vIGluIGEgc2ltaWxhciB3YXkgdG8ganNvblxuICBvYmplY3RUb0VudHJpZXNTdHJpbmdzKHF1ZXJ5OiBhbnkpOiBBcnJheTxzdHJpbmc+IHtcbiAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMocXVlcnkpLm1hcChhID0+IGEubWFwKHMgPT4gSlNPTi5zdHJpbmdpZnkocykpLmpvaW4oJzonKSk7XG4gIH1cblxuICAvLyBOYWl2ZSBsb2dpYyByZWR1Y2VyIGZvciBPUiBvcGVyYXRpb25zIG1lYW50IHRvIGJlIHVzZWQgb25seSBmb3IgcG9pbnRlciBwZXJtaXNzaW9ucy5cbiAgcmVkdWNlT3JPcGVyYXRpb24ocXVlcnk6IHsgJG9yOiBBcnJheTxhbnk+IH0pOiBhbnkge1xuICAgIGlmICghcXVlcnkuJG9yKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXMgPSBxdWVyeS4kb3IubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBsb25nZXIgcXVlcnkuXG4gICAgICAgICAgICBxdWVyeS4kb3Iuc3BsaWNlKGxvbmdlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcmVwZWF0ID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gd2hpbGUgKHJlcGVhdCk7XG4gICAgaWYgKHF1ZXJ5LiRvci5sZW5ndGggPT09IDEpIHtcbiAgICAgIHF1ZXJ5ID0geyAuLi5xdWVyeSwgLi4ucXVlcnkuJG9yWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJG9yO1xuICAgIH1cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBOYWl2ZSBsb2dpYyByZWR1Y2VyIGZvciBBTkQgb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZUFuZE9wZXJhdGlvbihxdWVyeTogeyAkYW5kOiBBcnJheTxhbnk+IH0pOiBhbnkge1xuICAgIGlmICghcXVlcnkuJGFuZCkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJGFuZC5tYXAocSA9PiB0aGlzLm9iamVjdFRvRW50cmllc1N0cmluZ3MocSkpO1xuICAgIGxldCByZXBlYXQgPSBmYWxzZTtcbiAgICBkbyB7XG4gICAgICByZXBlYXQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcmllcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcXVlcmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IFtzaG9ydGVyLCBsb25nZXJdID0gcXVlcmllc1tpXS5sZW5ndGggPiBxdWVyaWVzW2pdLmxlbmd0aCA/IFtqLCBpXSA6IFtpLCBqXTtcbiAgICAgICAgICBjb25zdCBmb3VuZEVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLnJlZHVjZShcbiAgICAgICAgICAgIChhY2MsIGVudHJ5KSA9PiBhY2MgKyAocXVlcmllc1tsb25nZXJdLmluY2x1ZGVzKGVudHJ5KSA/IDEgOiAwKSxcbiAgICAgICAgICAgIDBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNob3J0ZXJFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5sZW5ndGg7XG4gICAgICAgICAgaWYgKGZvdW5kRW50cmllcyA9PT0gc2hvcnRlckVudHJpZXMpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzaG9ydGVyIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGFpbmVkIGluIHRoZSBsb25nZXIgb25lLCB3ZSBjYW4gc3RyaWtlXG4gICAgICAgICAgICAvLyBvdXQgdGhlIHNob3J0ZXIgcXVlcnkuXG4gICAgICAgICAgICBxdWVyeS4kYW5kLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHF1ZXJpZXMuc3BsaWNlKHNob3J0ZXIsIDEpO1xuICAgICAgICAgICAgcmVwZWF0ID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gd2hpbGUgKHJlcGVhdCk7XG4gICAgaWYgKHF1ZXJ5LiRhbmQubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRhbmRbMF0gfTtcbiAgICAgIGRlbGV0ZSBxdWVyeS4kYW5kO1xuICAgIH1cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBDb25zdHJhaW50cyBxdWVyeSB1c2luZyBDTFAncyBwb2ludGVyIHBlcm1pc3Npb25zIChQUCkgaWYgYW55LlxuICAvLyAxLiBFdHJhY3QgdGhlIHVzZXIgaWQgZnJvbSBjYWxsZXIncyBBQ0xncm91cDtcbiAgLy8gMi4gRXhjdHJhY3QgYSBsaXN0IG9mIGZpZWxkIG5hbWVzIHRoYXQgYXJlIFBQIGZvciB0YXJnZXQgY29sbGVjdGlvbiBhbmQgb3BlcmF0aW9uO1xuICAvLyAzLiBDb25zdHJhaW50IHRoZSBvcmlnaW5hbCBxdWVyeSBzbyB0aGF0IGVhY2ggUFAgZmllbGQgbXVzdFxuICAvLyBwb2ludCB0byBjYWxsZXIncyBpZCAob3IgY29udGFpbiBpdCBpbiBjYXNlIG9mIFBQIGZpZWxkIGJlaW5nIGFuIGFycmF5KVxuICBhZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXVxuICApOiBhbnkge1xuICAgIC8vIENoZWNrIGlmIGNsYXNzIGhhcyBwdWJsaWMgcGVybWlzc2lvbiBmb3Igb3BlcmF0aW9uXG4gICAgLy8gSWYgdGhlIEJhc2VDTFAgcGFzcywgbGV0IGdvIHRocm91Z2hcbiAgICBpZiAoc2NoZW1hLnRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWUsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuXG4gICAgY29uc3QgdXNlckFDTCA9IGFjbEdyb3VwLmZpbHRlcihhY2wgPT4ge1xuICAgICAgcmV0dXJuIGFjbC5pbmRleE9mKCdyb2xlOicpICE9IDAgJiYgYWNsICE9ICcqJztcbiAgICB9KTtcblxuICAgIGNvbnN0IGdyb3VwS2V5ID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMSA/ICdyZWFkVXNlckZpZWxkcycgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIGNvbnN0IHBlcm1GaWVsZHMgPSBbXTtcblxuICAgIGlmIChwZXJtc1tvcGVyYXRpb25dICYmIHBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcykge1xuICAgICAgcGVybUZpZWxkcy5wdXNoKC4uLnBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcyk7XG4gICAgfVxuXG4gICAgaWYgKHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBwZXJtc1tncm91cEtleV0pIHtcbiAgICAgICAgaWYgKCFwZXJtRmllbGRzLmluY2x1ZGVzKGZpZWxkKSkge1xuICAgICAgICAgIHBlcm1GaWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgIGlmIChwZXJtRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICAgIC8vIE5vIHVzZXIgc2V0IHJldHVybiB1bmRlZmluZWRcbiAgICAgIC8vIElmIHRoZSBsZW5ndGggaXMgPiAxLCB0aGF0IG1lYW5zIHdlIGRpZG4ndCBkZS1kdXBlIHVzZXJzIGNvcnJlY3RseVxuICAgICAgaWYgKHVzZXJBQ0wubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdXNlcklkID0gdXNlckFDTFswXTtcbiAgICAgIGNvbnN0IHVzZXJQb2ludGVyID0ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcXVlcmllcyA9IHBlcm1GaWVsZHMubWFwKGtleSA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkRGVzY3JpcHRvciA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgICBjb25zdCBmaWVsZFR5cGUgPVxuICAgICAgICAgIGZpZWxkRGVzY3JpcHRvciAmJlxuICAgICAgICAgICAgdHlwZW9mIGZpZWxkRGVzY3JpcHRvciA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZERlc2NyaXB0b3IsICd0eXBlJylcbiAgICAgICAgICAgID8gZmllbGREZXNjcmlwdG9yLnR5cGVcbiAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBsZXQgcXVlcnlDbGF1c2U7XG5cbiAgICAgICAgaWYgKGZpZWxkVHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3Igc2luZ2xlIHBvaW50ZXIgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3IgdXNlcnMtYXJyYXkgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHsgJGFsbDogW3VzZXJQb2ludGVyXSB9IH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnT2JqZWN0Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIG9iamVjdCBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogdXNlclBvaW50ZXIgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUaGlzIG1lYW5zIHRoYXQgdGhlcmUgaXMgYSBDTFAgZmllbGQgb2YgYW4gdW5leHBlY3RlZCB0eXBlLiBUaGlzIGNvbmRpdGlvbiBzaG91bGQgbm90IGhhcHBlbiwgd2hpY2ggaXNcbiAgICAgICAgICAvLyB3aHkgaXMgYmVpbmcgdHJlYXRlZCBhcyBhbiBlcnJvci5cbiAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgIGBBbiB1bmV4cGVjdGVkIGNvbmRpdGlvbiBvY2N1cnJlZCB3aGVuIHJlc29sdmluZyBwb2ludGVyIHBlcm1pc3Npb25zOiAke2NsYXNzTmFtZX0gJHtrZXl9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgY29uc3RyYWludCBvbiB0aGUga2V5LCB1c2UgdGhlICRhbmRcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChxdWVyeSwga2V5KSkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUFuZE9wZXJhdGlvbih7ICRhbmQ6IFtxdWVyeUNsYXVzZSwgcXVlcnldIH0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGFkZCB0aGUgY29uc3RhaW50XG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgcXVlcnlDbGF1c2UpO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBxdWVyaWVzLmxlbmd0aCA9PT0gMSA/IHF1ZXJpZXNbMF0gOiB0aGlzLnJlZHVjZU9yT3BlcmF0aW9uKHsgJG9yOiBxdWVyaWVzIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICB9XG5cbiAgYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnkgPSB7fSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICBxdWVyeU9wdGlvbnM6IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fVxuICApOiBudWxsIHwgc3RyaW5nW10ge1xuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuICAgIGlmICghcGVybXMpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gcGVybXMucHJvdGVjdGVkRmllbGRzO1xuICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSByZXR1cm4gbnVsbDtcblxuICAgIGlmIChhY2xHcm91cC5pbmRleE9mKHF1ZXJ5Lm9iamVjdElkKSA+IC0xKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIGZvciBxdWVyaWVzIHdoZXJlIFwia2V5c1wiIGFyZSBzZXQgYW5kIGRvIG5vdCBpbmNsdWRlIGFsbCAndXNlckZpZWxkJzp7ZmllbGR9LFxuICAgIC8vIHdlIGhhdmUgdG8gdHJhbnNwYXJlbnRseSBpbmNsdWRlIGl0LCBhbmQgdGhlbiByZW1vdmUgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnRcbiAgICAvLyBCZWNhdXNlIGlmIHN1Y2gga2V5IG5vdCBwcm9qZWN0ZWQgdGhlIHBlcm1pc3Npb24gd29uJ3QgYmUgZW5mb3JjZWQgcHJvcGVybHlcbiAgICAvLyBQUyB0aGlzIGlzIGNhbGxlZCB3aGVuICdleGNsdWRlS2V5cycgYWxyZWFkeSByZWR1Y2VkIHRvICdrZXlzJ1xuICAgIGNvbnN0IHByZXNlcnZlS2V5cyA9IHF1ZXJ5T3B0aW9ucy5rZXlzO1xuXG4gICAgLy8gdGhlc2UgYXJlIGtleXMgdGhhdCBuZWVkIHRvIGJlIGluY2x1ZGVkIG9ubHlcbiAgICAvLyB0byBiZSBhYmxlIHRvIGFwcGx5IHByb3RlY3RlZEZpZWxkcyBieSBwb2ludGVyXG4gICAgLy8gYW5kIHRoZW4gdW5zZXQgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnQgKGxhdGVyIGluICBmaWx0ZXJTZW5zaXRpdmVGaWVsZHMpXG4gICAgY29uc3Qgc2VydmVyT25seUtleXMgPSBbXTtcblxuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWQgPSBhdXRoLnVzZXI7XG5cbiAgICAvLyBtYXAgdG8gYWxsb3cgY2hlY2sgd2l0aG91dCBhcnJheSBzZWFyY2hcbiAgICBjb25zdCByb2xlcyA9IChhdXRoLnVzZXJSb2xlcyB8fCBbXSkucmVkdWNlKChhY2MsIHIpID0+IHtcbiAgICAgIGFjY1tyXSA9IHByb3RlY3RlZEZpZWxkc1tyXTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuXG4gICAgLy8gYXJyYXkgb2Ygc2V0cyBvZiBwcm90ZWN0ZWQgZmllbGRzLiBzZXBhcmF0ZSBpdGVtIGZvciBlYWNoIGFwcGxpY2FibGUgY3JpdGVyaWFcbiAgICBjb25zdCBwcm90ZWN0ZWRLZXlzU2V0cyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBza2lwIHVzZXJGaWVsZHNcbiAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKSB7XG4gICAgICAgIGlmIChwcmVzZXJ2ZUtleXMpIHtcbiAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBrZXkuc3Vic3RyaW5nKDEwKTtcbiAgICAgICAgICBpZiAoIXByZXNlcnZlS2V5cy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICAgICAgICAvLyAxLiBwdXQgaXQgdGhlcmUgdGVtcG9yYXJpbHlcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucy5rZXlzICYmIHF1ZXJ5T3B0aW9ucy5rZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIC8vIDIuIHByZXNlcnZlIGl0IGRlbGV0ZSBsYXRlclxuICAgICAgICAgICAgc2VydmVyT25seUtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gYWRkIHB1YmxpYyB0aWVyXG4gICAgICBpZiAoa2V5ID09PSAnKicpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgICBpZiAoa2V5ID09PSAnYXV0aGVudGljYXRlZCcpIHtcbiAgICAgICAgICAvLyBmb3IgbG9nZ2VkIGluIHVzZXJzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocm9sZXNba2V5XSAmJiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSkge1xuICAgICAgICAgIC8vIGFkZCBhcHBsaWNhYmxlIHJvbGVzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChyb2xlc1trZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGNoZWNrIGlmIHRoZXJlJ3MgYSBydWxlIGZvciBjdXJyZW50IHVzZXIncyBpZFxuICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICBjb25zdCB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG4gICAgICBpZiAocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gcHJlc2VydmUgZmllbGRzIHRvIGJlIHJlbW92ZWQgYmVmb3JlIHNlbmRpbmcgcmVzcG9uc2UgdG8gY2xpZW50XG4gICAgaWYgKHNlcnZlck9ubHlLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzID0gc2VydmVyT25seUtleXM7XG4gICAgfVxuXG4gICAgbGV0IHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzU2V0cy5yZWR1Y2UoKGFjYywgbmV4dCkgPT4ge1xuICAgICAgaWYgKG5leHQpIHtcbiAgICAgICAgYWNjLnB1c2goLi4ubmV4dCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIFtdKTtcblxuICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICBwcm90ZWN0ZWRLZXlzU2V0cy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvdGVjdGVkS2V5cztcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKS50aGVuKHRyYW5zYWN0aW9uYWxTZXNzaW9uID0+IHtcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gdHJhbnNhY3Rpb25hbFNlc3Npb247XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBjb21taXQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGFib3J0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICAvLyBUT0RPOiBjcmVhdGUgaW5kZXhlcyBvbiBmaXJzdCBjcmVhdGlvbiBvZiBhIF9Vc2VyIG9iamVjdC4gT3RoZXJ3aXNlIGl0J3MgaW1wb3NzaWJsZSB0b1xuICAvLyBoYXZlIGEgUGFyc2UgYXBwIHdpdGhvdXQgaXQgaGF2aW5nIGEgX1VzZXIgY29sbGVjdGlvbi5cbiAgYXN5bmMgcGVyZm9ybUluaXRpYWxpemF0aW9uKCkge1xuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIGNvbnN0IHJlcXVpcmVkVXNlckZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Vc2VyLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkUm9sZUZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Sb2xlLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgICB9LFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1VzZXInKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX0lkZW1wb3RlbmN5JykpO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXJuYW1lczogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLCBmYWxzZSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgdXNlcm5hbWUgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlciBlbWFpbCBhZGRyZXNzZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10sICdjYXNlX2luc2Vuc2l0aXZlX2VtYWlsJywgZmFsc2UpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIGVtYWlsIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1JvbGUnLCByZXF1aXJlZFJvbGVGaWVsZHMsIFsnbmFtZSddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciByb2xlIG5hbWU6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlVW5pcXVlbmVzcygnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydyZXFJZCddKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgaWRlbXBvdGVuY3kgcmVxdWVzdCBJRDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgaXNNb25nb0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBNb25nb1N0b3JhZ2VBZGFwdGVyO1xuICAgIGNvbnN0IGlzUG9zdGdyZXNBZGFwdGVyID0gdGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiAgICBpZiAoaXNNb25nb0FkYXB0ZXIgfHwgaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgIGxldCBvcHRpb25zID0ge307XG4gICAgICBpZiAoaXNNb25nb0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICB0dGw6IDAsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKGlzUG9zdGdyZXNBZGFwdGVyKSB7XG4gICAgICAgIG9wdGlvbnMgPSB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucztcbiAgICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19JZGVtcG90ZW5jeScsIHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMsIFsnZXhwaXJlJ10sICd0dGwnLCBmYWxzZSwgb3B0aW9ucylcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBUVEwgaW5kZXggZm9yIGlkZW1wb3RlbmN5IGV4cGlyZSBkYXRlOiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIudXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTtcbiAgfVxuXG4gIHN0YXRpYyBfdmFsaWRhdGVRdWVyeTogYW55ID0+IHZvaWQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRGF0YWJhc2VDb250cm9sbGVyO1xuLy8gRXhwb3NlIHZhbGlkYXRlUXVlcnkgZm9yIHRlc3RzXG5tb2R1bGUuZXhwb3J0cy5fdmFsaWRhdGVRdWVyeSA9IHZhbGlkYXRlUXVlcnk7XG4iXX0=