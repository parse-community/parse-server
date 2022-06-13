"use strict";

var _node = require("parse/node");

var _lodash = _interopRequireDefault(require("lodash"));

var _intersect = _interopRequireDefault(require("intersect"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var _logger = _interopRequireDefault(require("../logger"));

var _Utils = _interopRequireDefault(require("../Utils"));

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

const maybeTransformUsernameAndEmailToLowerCase = (object, className, options) => {
  if (className === '_User' && options.forceEmailAndUsernameToLowerCase) {
    const toLowerCaseFields = ['email', 'username'];
    toLowerCaseFields.forEach(key => {
      if (object[key]) object[key] = object[key].toLowerCase();
    });
  }
};

class DatabaseController {
  constructor(adapter, options) {
    this.adapter = adapter;
    this.options = options || {};
    this.idempotencyOptions = this.options.idempotencyOptions || {}; // Prevent mutable this.schema, otherwise one request could use
    // multiple schemas, so instead use loadSchema to get a schema.

    this.schemaPromise = null;
    this._transactionalSession = null;
    this.options = options;
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
          maybeTransformUsernameAndEmailToLowerCase(update, className, this.options);
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

        return this._sanitizeDatabaseResult(originalUpdate, result);
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
    maybeTransformUsernameAndEmailToLowerCase(object, className, this.options);
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
          return this._sanitizeDatabaseResult(originalObject, result.ops[0]);
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
          caseInsensitive: this.options.disableCaseInsensitivity ? false : caseInsensitive,
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

    if (!this.options.disableCaseInsensitivity) {
      await this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true).catch(error => {
        _logger.default.warn('Unable to create case insensitive username index: ', error);

        throw error;
      });
      await this.adapter.ensureIndex('_User', requiredUserFields, ['email'], 'case_insensitive_email', true).catch(error => {
        _logger.default.warn('Unable to create case insensitive email index: ', error);

        throw error;
      });
    }

    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['email']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);

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

  _expandResultOnKeyPath(object, key, value) {
    if (key.indexOf('.') < 0) {
      object[key] = value[key];
      return object;
    }

    const path = key.split('.');
    const firstKey = path[0];
    const nextPath = path.slice(1).join('.'); // Scan request data for denied keywords

    if (this.options && this.options.requestKeywordDenylist) {
      // Scan request data for denied keywords
      for (const keyword of this.options.requestKeywordDenylist) {
        const match = _Utils.default.objectContainsKeyValue({
          firstKey: undefined
        }, keyword.key, undefined);

        if (match) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Prohibited keyword in request data: ${JSON.stringify(keyword)}.`);
        }
      }
    }

    object[firstKey] = this._expandResultOnKeyPath(object[firstKey] || {}, nextPath, value[firstKey]);
    delete object[key];
    return object;
  }

  _sanitizeDatabaseResult(originalObject, result) {
    const response = {};

    if (!result) {
      return Promise.resolve(response);
    }

    Object.keys(originalObject).forEach(key => {
      const keyUpdate = originalObject[key]; // determine if that was an op

      if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
        // only valid ops that produce an actionable result
        // the op may have happened on a keypath
        this._expandResultOnKeyPath(response, key, result);
      }
    });
    return Promise.resolve(response);
  }

}

module.exports = DatabaseController; // Expose validateQuery for tests

module.exports._validateQuery = validateQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwibmFtZXMiOlsiYWRkV3JpdGVBQ0wiLCJxdWVyeSIsImFjbCIsIm5ld1F1ZXJ5IiwiXyIsImNsb25lRGVlcCIsIl93cGVybSIsIiRpbiIsImFkZFJlYWRBQ0wiLCJfcnBlcm0iLCJ0cmFuc2Zvcm1PYmplY3RBQ0wiLCJBQ0wiLCJyZXN1bHQiLCJlbnRyeSIsInJlYWQiLCJwdXNoIiwid3JpdGUiLCJzcGVjaWFsUXVlcnlrZXlzIiwiaXNTcGVjaWFsUXVlcnlLZXkiLCJrZXkiLCJpbmRleE9mIiwidmFsaWRhdGVRdWVyeSIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiJG9yIiwiQXJyYXkiLCJmb3JFYWNoIiwiJGFuZCIsIiRub3IiLCJsZW5ndGgiLCJPYmplY3QiLCJrZXlzIiwiJHJlZ2V4IiwiJG9wdGlvbnMiLCJtYXRjaCIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiaXNNYXN0ZXIiLCJhY2xHcm91cCIsImF1dGgiLCJvcGVyYXRpb24iLCJzY2hlbWEiLCJjbGFzc05hbWUiLCJwcm90ZWN0ZWRGaWVsZHMiLCJvYmplY3QiLCJ1c2VySWQiLCJ1c2VyIiwiaWQiLCJwZXJtcyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlzUmVhZE9wZXJhdGlvbiIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtIiwiZmlsdGVyIiwic3RhcnRzV2l0aCIsIm1hcCIsInN1YnN0cmluZyIsInZhbHVlIiwibmV3UHJvdGVjdGVkRmllbGRzIiwib3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMiLCJwb2ludGVyUGVybSIsInBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyIiwicmVhZFVzZXJGaWVsZFZhbHVlIiwiaXNBcnJheSIsInNvbWUiLCJvYmplY3RJZCIsImZpZWxkcyIsInYiLCJpbmNsdWRlcyIsImlzVXNlckNsYXNzIiwiayIsInRlbXBvcmFyeUtleXMiLCJwYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJzZXNzaW9uVG9rZW4iLCJfZW1haWxfdmVyaWZ5X3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3RvbWJzdG9uZSIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIl9wYXNzd29yZF9oaXN0b3J5IiwiYXV0aERhdGEiLCJzcGVjaWFsS2V5c0ZvclVwZGF0ZSIsImlzU3BlY2lhbFVwZGF0ZUtleSIsImpvaW5UYWJsZU5hbWUiLCJmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlIiwiX19vcCIsImFtb3VudCIsIklOVkFMSURfSlNPTiIsIm9iamVjdHMiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwidHJhbnNmb3JtQXV0aERhdGEiLCJwcm92aWRlciIsInByb3ZpZGVyRGF0YSIsImZpZWxkTmFtZSIsInR5cGUiLCJ1bnRyYW5zZm9ybU9iamVjdEFDTCIsIm91dHB1dCIsImdldFJvb3RGaWVsZE5hbWUiLCJzcGxpdCIsInJlbGF0aW9uU2NoZW1hIiwicmVsYXRlZElkIiwib3duaW5nSWQiLCJtYXliZVRyYW5zZm9ybVVzZXJuYW1lQW5kRW1haWxUb0xvd2VyQ2FzZSIsIm9wdGlvbnMiLCJmb3JjZUVtYWlsQW5kVXNlcm5hbWVUb0xvd2VyQ2FzZSIsInRvTG93ZXJDYXNlRmllbGRzIiwidG9Mb3dlckNhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFkYXB0ZXIiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJzY2hlbWFQcm9taXNlIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29sbGVjdGlvbkV4aXN0cyIsImNsYXNzRXhpc3RzIiwicHVyZ2VDb2xsZWN0aW9uIiwibG9hZFNjaGVtYSIsInRoZW4iLCJzY2hlbWFDb250cm9sbGVyIiwiZ2V0T25lU2NoZW1hIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ2YWxpZGF0ZUNsYXNzTmFtZSIsIlNjaGVtYUNvbnRyb2xsZXIiLCJjbGFzc05hbWVJc1ZhbGlkIiwiUHJvbWlzZSIsInJlamVjdCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsInJlc29sdmUiLCJjbGVhckNhY2hlIiwibG9hZCIsImxvYWRTY2hlbWFJZk5lZWRlZCIsInJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IiwidCIsImdldEV4cGVjdGVkVHlwZSIsInRhcmdldENsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJydW5PcHRpb25zIiwidW5kZWZpbmVkIiwicyIsImNhbkFkZEZpZWxkIiwidXBkYXRlIiwibWFueSIsInVwc2VydCIsImFkZHNGaWVsZCIsInNraXBTYW5pdGl6YXRpb24iLCJ2YWxpZGF0ZU9ubHkiLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJvcmlnaW5hbFF1ZXJ5Iiwib3JpZ2luYWxVcGRhdGUiLCJyZWxhdGlvblVwZGF0ZXMiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJjb2xsZWN0UmVsYXRpb25VcGRhdGVzIiwiYWRkUG9pbnRlclBlcm1pc3Npb25zIiwiY2F0Y2giLCJlcnJvciIsInJvb3RGaWVsZE5hbWUiLCJmaWVsZE5hbWVJc1ZhbGlkIiwidXBkYXRlT3BlcmF0aW9uIiwiaW5uZXJLZXkiLCJJTlZBTElEX05FU1RFRF9LRVkiLCJmaW5kIiwiT0JKRUNUX05PVF9GT1VORCIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBzZXJ0T25lT2JqZWN0IiwiZmluZE9uZUFuZFVwZGF0ZSIsImhhbmRsZVJlbGF0aW9uVXBkYXRlcyIsIl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0Iiwib3BzIiwiZGVsZXRlTWUiLCJwcm9jZXNzIiwib3AiLCJ4IiwicGVuZGluZyIsImFkZFJlbGF0aW9uIiwicmVtb3ZlUmVsYXRpb24iLCJhbGwiLCJmcm9tQ2xhc3NOYW1lIiwiZnJvbUlkIiwidG9JZCIsImRvYyIsImNvZGUiLCJkZXN0cm95IiwicGFyc2VGb3JtYXRTY2hlbWEiLCJjcmVhdGUiLCJvcmlnaW5hbE9iamVjdCIsImNyZWF0ZWRBdCIsImlzbyIsIl9fdHlwZSIsInVwZGF0ZWRBdCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImNyZWF0ZU9iamVjdCIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJjbGFzc1NjaGVtYSIsInNjaGVtYURhdGEiLCJzY2hlbWFGaWVsZHMiLCJuZXdLZXlzIiwiZmllbGQiLCJhY3Rpb24iLCJkZWxldGVFdmVyeXRoaW5nIiwiZmFzdCIsIlNjaGVtYUNhY2hlIiwiY2xlYXIiLCJkZWxldGVBbGxDbGFzc2VzIiwicmVsYXRlZElkcyIsInF1ZXJ5T3B0aW9ucyIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJmaW5kT3B0aW9ucyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJfaWQiLCJyZXN1bHRzIiwib3duaW5nSWRzIiwicmVkdWNlSW5SZWxhdGlvbiIsIm9ycyIsImFRdWVyeSIsImluZGV4IiwiYW5kcyIsInByb21pc2VzIiwicXVlcmllcyIsImNvbnN0cmFpbnRLZXkiLCJpc05lZ2F0aW9uIiwiciIsInEiLCJpZHMiLCJhZGROb3RJbk9iamVjdElkc0lkcyIsImFkZEluT2JqZWN0SWRzSWRzIiwicmVkdWNlUmVsYXRpb25LZXlzIiwicmVsYXRlZFRvIiwiaWRzRnJvbVN0cmluZyIsImlkc0Zyb21FcSIsImlkc0Zyb21JbiIsImFsbElkcyIsImxpc3QiLCJ0b3RhbExlbmd0aCIsInJlZHVjZSIsIm1lbW8iLCJpZHNJbnRlcnNlY3Rpb24iLCJpbnRlcnNlY3QiLCJiaWciLCIkZXEiLCJpZHNGcm9tTmluIiwiU2V0IiwiJG5pbiIsImNvdW50IiwiZGlzdGluY3QiLCJwaXBlbGluZSIsInJlYWRQcmVmZXJlbmNlIiwiaGludCIsImNhc2VJbnNlbnNpdGl2ZSIsImV4cGxhaW4iLCJfY3JlYXRlZF9hdCIsIl91cGRhdGVkX2F0IiwiZGlzYWJsZUNhc2VJbnNlbnNpdGl2aXR5IiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiYWdncmVnYXRlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZGVsZXRlU2NoZW1hIiwiZGVsZXRlQ2xhc3MiLCJ3YXNQYXJzZUNvbGxlY3Rpb24iLCJyZWxhdGlvbkZpZWxkTmFtZXMiLCJuYW1lIiwiZGVsIiwicmVsb2FkRGF0YSIsIm9iamVjdFRvRW50cmllc1N0cmluZ3MiLCJlbnRyaWVzIiwiYSIsIkpTT04iLCJzdHJpbmdpZnkiLCJqb2luIiwicmVkdWNlT3JPcGVyYXRpb24iLCJyZXBlYXQiLCJpIiwiaiIsInNob3J0ZXIiLCJsb25nZXIiLCJmb3VuZEVudHJpZXMiLCJhY2MiLCJzaG9ydGVyRW50cmllcyIsInNwbGljZSIsInJlZHVjZUFuZE9wZXJhdGlvbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsInVzZXJBQ0wiLCJncm91cEtleSIsInBlcm1GaWVsZHMiLCJwb2ludGVyRmllbGRzIiwidXNlclBvaW50ZXIiLCJmaWVsZERlc2NyaXB0b3IiLCJmaWVsZFR5cGUiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJxdWVyeUNsYXVzZSIsIiRhbGwiLCJhc3NpZ24iLCJwcmVzZXJ2ZUtleXMiLCJzZXJ2ZXJPbmx5S2V5cyIsImF1dGhlbnRpY2F0ZWQiLCJyb2xlcyIsInVzZXJSb2xlcyIsInByb3RlY3RlZEtleXNTZXRzIiwicHJvdGVjdGVkS2V5cyIsIm5leHQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInJlcXVpcmVkVXNlckZpZWxkcyIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJfVXNlciIsInJlcXVpcmVkUm9sZUZpZWxkcyIsIl9Sb2xlIiwicmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcyIsIl9JZGVtcG90ZW5jeSIsImVuc3VyZVVuaXF1ZW5lc3MiLCJsb2dnZXIiLCJ3YXJuIiwiZW5zdXJlSW5kZXgiLCJpc01vbmdvQWRhcHRlciIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJpc1Bvc3RncmVzQWRhcHRlciIsIlBvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJ0dGwiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJfZXhwYW5kUmVzdWx0T25LZXlQYXRoIiwicGF0aCIsImZpcnN0S2V5IiwibmV4dFBhdGgiLCJzbGljZSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJrZXl3b3JkIiwiVXRpbHMiLCJvYmplY3RDb250YWluc0tleVZhbHVlIiwicmVzcG9uc2UiLCJrZXlVcGRhdGUiLCJtb2R1bGUiLCJleHBvcnRzIiwiX3ZhbGlkYXRlUXVlcnkiXSwibWFwcGluZ3MiOiI7O0FBS0E7O0FBRUE7O0FBRUE7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUtBLFNBQVNBLFdBQVQsQ0FBcUJDLEtBQXJCLEVBQTRCQyxHQUE1QixFQUFpQztBQUMvQixRQUFNQyxRQUFRLEdBQUdDLGdCQUFFQyxTQUFGLENBQVlKLEtBQVosQ0FBakIsQ0FEK0IsQ0FFL0I7OztBQUNBRSxFQUFBQSxRQUFRLENBQUNHLE1BQVQsR0FBa0I7QUFBRUMsSUFBQUEsR0FBRyxFQUFFLENBQUMsSUFBRCxFQUFPLEdBQUdMLEdBQVY7QUFBUCxHQUFsQjtBQUNBLFNBQU9DLFFBQVA7QUFDRDs7QUFFRCxTQUFTSyxVQUFULENBQW9CUCxLQUFwQixFQUEyQkMsR0FBM0IsRUFBZ0M7QUFDOUIsUUFBTUMsUUFBUSxHQUFHQyxnQkFBRUMsU0FBRixDQUFZSixLQUFaLENBQWpCLENBRDhCLENBRTlCOzs7QUFDQUUsRUFBQUEsUUFBUSxDQUFDTSxNQUFULEdBQWtCO0FBQUVGLElBQUFBLEdBQUcs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QixFQUdqQnRSLEtBQUssQ0FBQ3FSLFFBQUQsQ0FIWSxDQUFuQjtBQUtBLFdBQU9qUyxNQUFNLENBQUMxQixHQUFELENBQWI7QUFDQSxXQUFPMEIsTUFBUDtBQUNEOztBQUVENkgsRUFBQUEsdUJBQXVCLENBQUNrQixjQUFELEVBQXNCaEwsTUFBdEIsRUFBaUQ7QUFDdEUsVUFBTXlVLFFBQVEsR0FBRyxFQUFqQjs7QUFDQSxRQUFJLENBQUN6VSxNQUFMLEVBQWE7QUFDWCxhQUFPb0gsT0FBTyxDQUFDRyxPQUFSLENBQWdCa04sUUFBaEIsQ0FBUDtBQUNEOztBQUNEdFQsSUFBQUEsTUFBTSxDQUFDQyxJQUFQLENBQVk0SixjQUFaLEVBQTRCakssT0FBNUIsQ0FBb0NSLEdBQUcsSUFBSTtBQUN6QyxZQUFNbVUsU0FBUyxHQUFHMUosY0FBYyxDQUFDekssR0FBRCxDQUFoQyxDQUR5QyxDQUV6Qzs7QUFDQSxVQUNFbVUsU0FBUyxJQUNULE9BQU9BLFNBQVAsS0FBcUIsUUFEckIsSUFFQUEsU0FBUyxDQUFDN1AsSUFGVixJQUdBLENBQUMsS0FBRCxFQUFRLFdBQVIsRUFBcUIsUUFBckIsRUFBK0IsV0FBL0IsRUFBNENyRSxPQUE1QyxDQUFvRGtVLFNBQVMsQ0FBQzdQLElBQTlELElBQXNFLENBQUMsQ0FKekUsRUFLRTtBQUNBO0FBQ0E7QUFDQSxhQUFLbVAsc0JBQUwsQ0FBNEJTLFFBQTVCLEVBQXNDbFUsR0FBdEMsRUFBMkNQLE1BQTNDO0FBQ0Q7QUFDRixLQWJEO0FBY0EsV0FBT29ILE9BQU8sQ0FBQ0csT0FBUixDQUFnQmtOLFFBQWhCLENBQVA7QUFDRDs7QUEvNUNzQjs7QUFvNkN6QkUsTUFBTSxDQUFDQyxPQUFQLEdBQWlCek8sa0JBQWpCLEMsQ0FDQTs7QUFDQXdPLE1BQU0sQ0FBQ0MsT0FBUCxDQUFlQyxjQUFmLEdBQWdDcFUsYUFBaEMiLCJzb3VyY2VzQ29udGVudCI6WyLvu78vLyBAZmxvd1xuLy8gQSBkYXRhYmFzZSBhZGFwdGVyIHRoYXQgd29ya3Mgd2l0aCBkYXRhIGV4cG9ydGVkIGZyb20gdGhlIGhvc3RlZFxuLy8gUGFyc2UgZGF0YWJhc2UuXG5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGludGVyc2VjdCBmcm9tICdpbnRlcnNlY3QnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCAqIGFzIFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgdHlwZSB7IExvYWRTY2hlbWFPcHRpb25zIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgdHlwZSB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4uL09wdGlvbnMnO1xuaW1wb3J0IHR5cGUgeyBRdWVyeU9wdGlvbnMsIEZ1bGxRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcblxuZnVuY3Rpb24gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ193cGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fd3Blcm0gPSB7ICRpbjogW251bGwsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG5mdW5jdGlvbiBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfcnBlcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3JwZXJtID0geyAkaW46IFtudWxsLCAnKicsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG4vLyBUcmFuc2Zvcm1zIGEgUkVTVCBBUEkgZm9ybWF0dGVkIEFDTCBvYmplY3QgdG8gb3VyIHR3by1maWVsZCBtb25nbyBmb3JtYXQuXG5jb25zdCB0cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBBQ0wsIC4uLnJlc3VsdCB9KSA9PiB7XG4gIGlmICghQUNMKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHJlc3VsdC5fd3Blcm0gPSBbXTtcbiAgcmVzdWx0Ll9ycGVybSA9IFtdO1xuXG4gIGZvciAoY29uc3QgZW50cnkgaW4gQUNMKSB7XG4gICAgaWYgKEFDTFtlbnRyeV0ucmVhZCkge1xuICAgICAgcmVzdWx0Ll9ycGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gICAgaWYgKEFDTFtlbnRyeV0ud3JpdGUpIHtcbiAgICAgIHJlc3VsdC5fd3Blcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5jb25zdCBzcGVjaWFsUXVlcnlrZXlzID0gW1xuICAnJGFuZCcsXG4gICckb3InLFxuICAnJG5vcicsXG4gICdfcnBlcm0nLFxuICAnX3dwZXJtJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFF1ZXJ5S2V5ID0ga2V5ID0+IHtcbiAgcmV0dXJuIHNwZWNpYWxRdWVyeWtleXMuaW5kZXhPZihrZXkpID49IDA7XG59O1xuXG5jb25zdCB2YWxpZGF0ZVF1ZXJ5ID0gKHF1ZXJ5OiBhbnkpOiB2b2lkID0+IHtcbiAgaWYgKHF1ZXJ5LkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQ2Fubm90IHF1ZXJ5IG9uIEFDTC4nKTtcbiAgfVxuXG4gIGlmIChxdWVyeS4kb3IpIHtcbiAgICBpZiAocXVlcnkuJG9yIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkb3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kYW5kKSB7XG4gICAgaWYgKHF1ZXJ5LiRhbmQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJGFuZC5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkYW5kIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJG5vcikge1xuICAgIGlmIChxdWVyeS4kbm9yIGluc3RhbmNlb2YgQXJyYXkgJiYgcXVlcnkuJG5vci5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeS4kbm9yLmZvckVhY2godmFsaWRhdGVRdWVyeSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkbm9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSBvZiBhdCBsZWFzdCAxIHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAocXVlcnkgJiYgcXVlcnlba2V5XSAmJiBxdWVyeVtrZXldLiRyZWdleCkge1xuICAgICAgaWYgKHR5cGVvZiBxdWVyeVtrZXldLiRvcHRpb25zID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXF1ZXJ5W2tleV0uJG9wdGlvbnMubWF0Y2goL15baW14c10rJC8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgIGBCYWQgJG9wdGlvbnMgdmFsdWUgZm9yIHF1ZXJ5OiAke3F1ZXJ5W2tleV0uJG9wdGlvbnN9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFpc1NwZWNpYWxRdWVyeUtleShrZXkpICYmICFrZXkubWF0Y2goL15bYS16QS1aXVthLXpBLVowLTlfXFwuXSokLykpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgSW52YWxpZCBrZXkgbmFtZTogJHtrZXl9YCk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIEZpbHRlcnMgb3V0IGFueSBkYXRhIHRoYXQgc2hvdWxkbid0IGJlIG9uIHRoaXMgUkVTVC1mb3JtYXR0ZWQgb2JqZWN0LlxuY29uc3QgZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IChcbiAgaXNNYXN0ZXI6IGJvb2xlYW4sXG4gIGFjbEdyb3VwOiBhbnlbXSxcbiAgYXV0aDogYW55LFxuICBvcGVyYXRpb246IGFueSxcbiAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gIGNsYXNzTmFtZTogc3RyaW5nLFxuICBwcm90ZWN0ZWRGaWVsZHM6IG51bGwgfCBBcnJheTxhbnk+LFxuICBvYmplY3Q6IGFueVxuKSA9PiB7XG4gIGxldCB1c2VySWQgPSBudWxsO1xuICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHVzZXJJZCA9IGF1dGgudXNlci5pZDtcblxuICAvLyByZXBsYWNlIHByb3RlY3RlZEZpZWxkcyB3aGVuIHVzaW5nIHBvaW50ZXItcGVybWlzc2lvbnNcbiAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gIGlmIChwZXJtcykge1xuICAgIGNvbnN0IGlzUmVhZE9wZXJhdGlvbiA9IFsnZ2V0JywgJ2ZpbmQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMTtcblxuICAgIGlmIChpc1JlYWRPcGVyYXRpb24gJiYgcGVybXMucHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBleHRyYWN0IHByb3RlY3RlZEZpZWxkcyBhZGRlZCB3aXRoIHRoZSBwb2ludGVyLXBlcm1pc3Npb24gcHJlZml4XG4gICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybSA9IE9iamVjdC5rZXlzKHBlcm1zLnByb3RlY3RlZEZpZWxkcylcbiAgICAgICAgLmZpbHRlcihrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSlcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIHJldHVybiB7IGtleToga2V5LnN1YnN0cmluZygxMCksIHZhbHVlOiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB9O1xuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbmV3UHJvdGVjdGVkRmllbGRzOiBBcnJheTxzdHJpbmc+W10gPSBbXTtcbiAgICAgIGxldCBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IGZhbHNlO1xuXG4gICAgICAvLyBjaGVjayBpZiB0aGUgb2JqZWN0IGdyYW50cyB0aGUgY3VycmVudCB1c2VyIGFjY2VzcyBiYXNlZCBvbiB0aGUgZXh0cmFjdGVkIGZpZWxkc1xuICAgICAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0uZm9yRWFjaChwb2ludGVyUGVybSA9PiB7XG4gICAgICAgIGxldCBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IGZhbHNlO1xuICAgICAgICBjb25zdCByZWFkVXNlckZpZWxkVmFsdWUgPSBvYmplY3RbcG9pbnRlclBlcm0ua2V5XTtcbiAgICAgICAgaWYgKHJlYWRVc2VyRmllbGRWYWx1ZSkge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlYWRVc2VyRmllbGRWYWx1ZSkpIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gcmVhZFVzZXJGaWVsZFZhbHVlLnNvbWUoXG4gICAgICAgICAgICAgIHVzZXIgPT4gdXNlci5vYmplY3RJZCAmJiB1c2VyLm9iamVjdElkID09PSB1c2VySWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID1cbiAgICAgICAgICAgICAgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkICYmIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCA9PT0gdXNlcklkO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwb2ludGVyUGVybUluY2x1ZGVzVXNlcikge1xuICAgICAgICAgIG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gdHJ1ZTtcbiAgICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwb2ludGVyUGVybS52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBpZiBhdCBsZWFzdCBvbmUgcG9pbnRlci1wZXJtaXNzaW9uIGFmZmVjdGVkIHRoZSBjdXJyZW50IHVzZXJcbiAgICAgIC8vIGludGVyc2VjdCB2cyBwcm90ZWN0ZWRGaWVsZHMgZnJvbSBwcmV2aW91cyBzdGFnZSAoQHNlZSBhZGRQcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAvLyBTZXRzIHRoZW9yeSAoaW50ZXJzZWN0aW9ucyk6IEEgeCAoQiB4IEMpID09IChBIHggQikgeCBDXG4gICAgICBpZiAob3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgJiYgcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHByb3RlY3RlZEZpZWxkcyk7XG4gICAgICB9XG4gICAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgICAgLy8gaWYgdGhlcmUncmUgbm8gcHJvdGN0ZWRGaWVsZHMgYnkgb3RoZXIgY3JpdGVyaWEgKCBpZCAvIHJvbGUgLyBhdXRoKVxuICAgICAgICAgIC8vIHRoZW4gd2UgbXVzdCBpbnRlcnNlY3QgZWFjaCBzZXQgKHBlciB1c2VyRmllbGQpXG4gICAgICAgICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGZpZWxkcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBpc1VzZXJDbGFzcyA9IGNsYXNzTmFtZSA9PT0gJ19Vc2VyJztcblxuICAvKiBzcGVjaWFsIHRyZWF0IGZvciB0aGUgdXNlciBjbGFzczogZG9uJ3QgZmlsdGVyIHByb3RlY3RlZEZpZWxkcyBpZiBjdXJyZW50bHkgbG9nZ2VkaW4gdXNlciBpc1xuICB0aGUgcmV0cmlldmVkIHVzZXIgKi9cbiAgaWYgKCEoaXNVc2VyQ2xhc3MgJiYgdXNlcklkICYmIG9iamVjdC5vYmplY3RJZCA9PT0gdXNlcklkKSkge1xuICAgIHByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuXG4gICAgLy8gZmllbGRzIG5vdCByZXF1ZXN0ZWQgYnkgY2xpZW50IChleGNsdWRlZCksXG4gICAgLy9idXQgd2VyZSBuZWVkZWQgdG8gYXBwbHkgcHJvdGVjdHRlZEZpZWxkc1xuICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcyAmJlxuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMgJiZcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzLmZvckVhY2goayA9PiBkZWxldGUgb2JqZWN0W2tdKTtcbiAgfVxuXG4gIGlmICghaXNVc2VyQ2xhc3MpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgb2JqZWN0LnBhc3N3b3JkID0gb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gIGRlbGV0ZSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcblxuICBkZWxldGUgb2JqZWN0LnNlc3Npb25Ub2tlbjtcblxuICBpZiAoaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll90b21ic3RvbmU7XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9mYWlsZWRfbG9naW5fY291bnQ7XG4gIGRlbGV0ZSBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9oaXN0b3J5O1xuXG4gIGlmIChhY2xHcm91cC5pbmRleE9mKG9iamVjdC5vYmplY3RJZCkgPiAtMSkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbi8vIFJ1bnMgYW4gdXBkYXRlIG9uIHRoZSBkYXRhYmFzZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBvYmplY3Qgd2l0aCB0aGUgbmV3IHZhbHVlcyBmb3IgZmllbGRcbi8vIG1vZGlmaWNhdGlvbnMgdGhhdCBkb24ndCBrbm93IHRoZWlyIHJlc3VsdHMgYWhlYWQgb2YgdGltZSwgbGlrZVxuLy8gJ2luY3JlbWVudCcuXG4vLyBPcHRpb25zOlxuLy8gICBhY2w6ICBhIGxpc3Qgb2Ygc3RyaW5ncy4gSWYgdGhlIG9iamVjdCB0byBiZSB1cGRhdGVkIGhhcyBhbiBBQ0wsXG4vLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4vLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuY29uc3Qgc3BlY2lhbEtleXNGb3JVcGRhdGUgPSBbXG4gICdfaGFzaGVkX3Bhc3N3b3JkJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50JyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLFxuICAnX3Bhc3N3b3JkX2hpc3RvcnknLFxuXTtcblxuY29uc3QgaXNTcGVjaWFsVXBkYXRlS2V5ID0ga2V5ID0+IHtcbiAgcmV0dXJuIHNwZWNpYWxLZXlzRm9yVXBkYXRlLmluZGV4T2Yoa2V5KSA+PSAwO1xufTtcblxuZnVuY3Rpb24gam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSkge1xuICByZXR1cm4gYF9Kb2luOiR7a2V5fToke2NsYXNzTmFtZX1gO1xufVxuXG5jb25zdCBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlID0gb2JqZWN0ID0+IHtcbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKG9iamVjdFtrZXldICYmIG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgIHN3aXRjaCAob2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgICBjYXNlICdJbmNyZW1lbnQnOlxuICAgICAgICAgIGlmICh0eXBlb2Ygb2JqZWN0W2tleV0uYW1vdW50ICE9PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5hbW91bnQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FkZCc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5vYmplY3RzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGRVbmlxdWUnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUmVtb3ZlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IFtdO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdEZWxldGUnOlxuICAgICAgICAgIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5DT01NQU5EX1VOQVZBSUxBQkxFLFxuICAgICAgICAgICAgYFRoZSAke29iamVjdFtrZXldLl9fb3B9IG9wZXJhdG9yIGlzIG5vdCBzdXBwb3J0ZWQgeWV0LmBcbiAgICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuY29uc3QgdHJhbnNmb3JtQXV0aERhdGEgPSAoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkgPT4ge1xuICBpZiAob2JqZWN0LmF1dGhEYXRhICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIE9iamVjdC5rZXlzKG9iamVjdC5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICBjb25zdCBwcm92aWRlckRhdGEgPSBvYmplY3QuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgY29uc3QgZmllbGROYW1lID0gYF9hdXRoX2RhdGFfJHtwcm92aWRlcn1gO1xuICAgICAgaWYgKHByb3ZpZGVyRGF0YSA9PSBudWxsKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fb3A6ICdEZWxldGUnLFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSBwcm92aWRlckRhdGE7XG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSA9IHsgdHlwZTogJ09iamVjdCcgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICB9XG59O1xuLy8gVHJhbnNmb3JtcyBhIERhdGFiYXNlIGZvcm1hdCBBQ0wgdG8gYSBSRVNUIEFQSSBmb3JtYXQgQUNMXG5jb25zdCB1bnRyYW5zZm9ybU9iamVjdEFDTCA9ICh7IF9ycGVybSwgX3dwZXJtLCAuLi5vdXRwdXQgfSkgPT4ge1xuICBpZiAoX3JwZXJtIHx8IF93cGVybSkge1xuICAgIG91dHB1dC5BQ0wgPSB7fTtcblxuICAgIChfcnBlcm0gfHwgW10pLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKCFvdXRwdXQuQUNMW2VudHJ5XSkge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XSA9IHsgcmVhZDogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3JlYWQnXSA9IHRydWU7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAoX3dwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHdyaXRlOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XVsnd3JpdGUnXSA9IHRydWU7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIG91dHB1dDtcbn07XG5cbi8qKlxuICogV2hlbiBxdWVyeWluZywgdGhlIGZpZWxkTmFtZSBtYXkgYmUgY29tcG91bmQsIGV4dHJhY3QgdGhlIHJvb3QgZmllbGROYW1lXG4gKiAgICAgYHRlbXBlcmF0dXJlLmNlbHNpdXNgIGJlY29tZXMgYHRlbXBlcmF0dXJlYFxuICogQHBhcmFtIHtzdHJpbmd9IGZpZWxkTmFtZSB0aGF0IG1heSBiZSBhIGNvbXBvdW5kIGZpZWxkIG5hbWVcbiAqIEByZXR1cm5zIHtzdHJpbmd9IHRoZSByb290IG5hbWUgb2YgdGhlIGZpZWxkXG4gKi9cbmNvbnN0IGdldFJvb3RGaWVsZE5hbWUgPSAoZmllbGROYW1lOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG59O1xuXG5jb25zdCByZWxhdGlvblNjaGVtYSA9IHtcbiAgZmllbGRzOiB7IHJlbGF0ZWRJZDogeyB0eXBlOiAnU3RyaW5nJyB9LCBvd25pbmdJZDogeyB0eXBlOiAnU3RyaW5nJyB9IH0sXG59O1xuXG5jb25zdCBtYXliZVRyYW5zZm9ybVVzZXJuYW1lQW5kRW1haWxUb0xvd2VyQ2FzZSA9IChvYmplY3QsIGNsYXNzTmFtZSwgb3B0aW9ucykgPT4ge1xuICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInICYmIG9wdGlvbnMuZm9yY2VFbWFpbEFuZFVzZXJuYW1lVG9Mb3dlckNhc2UpIHtcbiAgICBjb25zdCB0b0xvd2VyQ2FzZUZpZWxkcyA9IFsnZW1haWwnLCAndXNlcm5hbWUnXTtcbiAgICB0b0xvd2VyQ2FzZUZpZWxkcy5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAob2JqZWN0W2tleV0pIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0udG9Mb3dlckNhc2UoKTtcbiAgICB9KTtcbiAgfVxufTtcblxuY2xhc3MgRGF0YWJhc2VDb250cm9sbGVyIHtcbiAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG4gIHNjaGVtYVByb21pc2U6ID9Qcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj47XG4gIF90cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueTtcbiAgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zO1xuICBpZGVtcG90ZW5jeU9wdGlvbnM6IGFueTtcblxuICBjb25zdHJ1Y3RvcihhZGFwdGVyOiBTdG9yYWdlQWRhcHRlciwgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdGhpcy5hZGFwdGVyID0gYWRhcHRlcjtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHRoaXMuaWRlbXBvdGVuY3lPcHRpb25zID0gdGhpcy5vcHRpb25zLmlkZW1wb3RlbmN5T3B0aW9ucyB8fCB7fTtcbiAgICAvLyBQcmV2ZW50IG11dGFibGUgdGhpcy5zY2hlbWEsIG90aGVyd2lzZSBvbmUgcmVxdWVzdCBjb3VsZCB1c2VcbiAgICAvLyBtdWx0aXBsZSBzY2hlbWFzLCBzbyBpbnN0ZWFkIHVzZSBsb2FkU2NoZW1hIHRvIGdldCBhIHNjaGVtYS5cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICB9XG5cbiAgY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY2xhc3NFeGlzdHMoY2xhc3NOYW1lKTtcbiAgfVxuXG4gIHB1cmdlQ29sbGVjdGlvbihjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUpKVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShjbGFzc05hbWUsIHNjaGVtYSwge30pKTtcbiAgfVxuXG4gIHZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCAnaW52YWxpZCBjbGFzc05hbWU6ICcgKyBjbGFzc05hbWUpXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBzY2hlbWFDb250cm9sbGVyLlxuICBsb2FkU2NoZW1hKFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hUHJvbWlzZSAhPSBudWxsKSB7XG4gICAgICByZXR1cm4gdGhpcy5zY2hlbWFQcm9taXNlO1xuICAgIH1cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBTY2hlbWFDb250cm9sbGVyLmxvYWQodGhpcy5hZGFwdGVyLCBvcHRpb25zKTtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UudGhlbihcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2UsXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgbG9hZFNjaGVtYUlmTmVlZGVkKFxuICAgIHNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyID8gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYUNvbnRyb2xsZXIpIDogdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSBjbGFzc25hbWUgdGhhdCBpcyByZWxhdGVkIHRvIHRoZSBnaXZlblxuICAvLyBjbGFzc25hbWUgdGhyb3VnaCB0aGUga2V5LlxuICAvLyBUT0RPOiBtYWtlIHRoaXMgbm90IGluIHRoZSBEYXRhYmFzZUNvbnRyb2xsZXIgaW50ZXJmYWNlXG4gIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZyk6IFByb21pc2U8P3N0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PiB7XG4gICAgICB2YXIgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKHQgIT0gbnVsbCAmJiB0eXBlb2YgdCAhPT0gJ3N0cmluZycgJiYgdC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiB0LnRhcmdldENsYXNzO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGNsYXNzTmFtZTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFVzZXMgdGhlIHNjaGVtYSB0byB2YWxpZGF0ZSB0aGUgb2JqZWN0IChSRVNUIEFQSSBmb3JtYXQpLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hLlxuICAvLyBUaGlzIGRvZXMgbm90IHVwZGF0ZSB0aGlzLnNjaGVtYSwgYmVjYXVzZSBpbiBhIHNpdHVhdGlvbiBsaWtlIGFcbiAgLy8gYmF0Y2ggcmVxdWVzdCwgdGhhdCBjb3VsZCBjb25mdXNlIG90aGVyIHVzZXJzIG9mIHRoZSBzY2hlbWEuXG4gIHZhbGlkYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGxldCBzY2hlbWE7XG4gICAgY29uc3QgYWNsID0gcnVuT3B0aW9ucy5hY2w7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXA6IHN0cmluZ1tdID0gYWNsIHx8IFtdO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4ocyA9PiB7XG4gICAgICAgIHNjaGVtYSA9IHM7XG4gICAgICAgIGlmIChpc01hc3Rlcikge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5jYW5BZGRGaWVsZChzY2hlbWEsIGNsYXNzTmFtZSwgb2JqZWN0LCBhY2xHcm91cCwgcnVuT3B0aW9ucyk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHsgYWNsLCBtYW55LCB1cHNlcnQsIGFkZHNGaWVsZCB9OiBGdWxsUXVlcnlPcHRpb25zID0ge30sXG4gICAgc2tpcFNhbml0aXphdGlvbjogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IHF1ZXJ5O1xuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0gdXBkYXRlO1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICB1cGRhdGUgPSBkZWVwY29weSh1cGRhdGUpO1xuICAgIHZhciByZWxhdGlvblVwZGF0ZXMgPSBbXTtcbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ3VwZGF0ZScpXG4gICAgICApXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLCB1cGRhdGUpO1xuICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgJ3VwZGF0ZScsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKGFkZHNGaWVsZCkge1xuICAgICAgICAgICAgICBxdWVyeSA9IHtcbiAgICAgICAgICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICdhZGRGaWVsZCcsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnkpO1xuICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpICYmXG4gICAgICAgICAgICAgICAgICAhaXNTcGVjaWFsVXBkYXRlS2V5KHJvb3RGaWVsZE5hbWUpXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHVwZGF0ZU9wZXJhdGlvbiBpbiB1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSAmJlxuICAgICAgICAgICAgICAgICAgdHlwZW9mIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0pLnNvbWUoXG4gICAgICAgICAgICAgICAgICAgIGlubmVyS2V5ID0+IGlubmVyS2V5LmluY2x1ZGVzKCckJykgfHwgaW5uZXJLZXkuaW5jbHVkZXMoJy4nKVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdXBkYXRlID0gdHJhbnNmb3JtT2JqZWN0QUNMKHVwZGF0ZSk7XG4gICAgICAgICAgICAgIG1heWJlVHJhbnNmb3JtVXNlcm5hbWVBbmRFbWFpbFRvTG93ZXJDYXNlKHVwZGF0ZSwgY2xhc3NOYW1lLCB0aGlzLm9wdGlvbnMpO1xuICAgICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHt9KS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCAhcmVzdWx0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKG1hbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodXBzZXJ0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmRPbmVBbmRVcGRhdGUoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsXG4gICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoc2tpcFNhbml0aXphdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbFVwZGF0ZSwgcmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDb2xsZWN0IGFsbCByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBsaXN0IG9mIGFsbCByZWxhdGlvbiB1cGRhdGVzIHRvIHBlcmZvcm1cbiAgLy8gVGhpcyBtdXRhdGVzIHVwZGF0ZS5cbiAgY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6ID9zdHJpbmcsIHVwZGF0ZTogYW55KSB7XG4gICAgdmFyIG9wcyA9IFtdO1xuICAgIHZhciBkZWxldGVNZSA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuXG4gICAgdmFyIHByb2Nlc3MgPSAob3AsIGtleSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnQmF0Y2gnKSB7XG4gICAgICAgIGZvciAodmFyIHggb2Ygb3Aub3BzKSB7XG4gICAgICAgICAgcHJvY2Vzcyh4LCBrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHVwZGF0ZSkge1xuICAgICAgcHJvY2Vzcyh1cGRhdGVba2V5XSwga2V5KTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBrZXkgb2YgZGVsZXRlTWUpIHtcbiAgICAgIGRlbGV0ZSB1cGRhdGVba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIG9wcztcbiAgfVxuXG4gIC8vIFByb2Nlc3NlcyByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBhbGwgdXBkYXRlcyBoYXZlIGJlZW4gcGVyZm9ybWVkXG4gIGhhbmRsZVJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6IHN0cmluZywgdXBkYXRlOiBhbnksIG9wczogYW55KSB7XG4gICAgdmFyIHBlbmRpbmcgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcbiAgICBvcHMuZm9yRWFjaCgoeyBrZXksIG9wIH0pID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKHRoaXMuYWRkUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5yZW1vdmVSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocGVuZGluZyk7XG4gIH1cblxuICAvLyBBZGRzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgYWRkIHdhcyBzdWNjZXNzZnVsLlxuICBhZGRSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgZG9jLFxuICAgICAgZG9jLFxuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIHJlbW92ZSB3YXNcbiAgLy8gc3VjY2Vzc2Z1bC5cbiAgcmVtb3ZlUmVsYXRpb24oa2V5OiBzdHJpbmcsIGZyb21DbGFzc05hbWU6IHN0cmluZywgZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZykge1xuICAgIHZhciBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgZG9jLFxuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gV2UgZG9uJ3QgY2FyZSBpZiB0aGV5IHRyeSB0byBkZWxldGUgYSBub24tZXhpc3RlbnQgcmVsYXRpb24uXG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgb2JqZWN0cyBtYXRjaGVzIHRoaXMgcXVlcnkgZnJvbSB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHdhc1xuICAvLyBkZWxldGVkLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbiAgLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuICAvLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuICBkZXN0cm95KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdkZWxldGUnKVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgJ2RlbGV0ZScsXG4gICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGRlbGV0ZSBieSBxdWVyeVxuICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgfVxuICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5KTtcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSlcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihwYXJzZUZvcm1hdFNjaGVtYSA9PlxuICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIHBhcnNlRm9ybWF0U2NoZW1hLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIFdoZW4gZGVsZXRpbmcgc2Vzc2lvbnMgd2hpbGUgY2hhbmdpbmcgcGFzc3dvcmRzLCBkb24ndCB0aHJvdyBhbiBlcnJvciBpZiB0aGV5IGRvbid0IGhhdmUgYW55IHNlc3Npb25zLlxuICAgICAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEluc2VydHMgYW4gb2JqZWN0IGludG8gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCBzYXZlZC5cbiAgY3JlYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIGNvbnN0IG9yaWdpbmFsT2JqZWN0ID0gb2JqZWN0O1xuICAgIG9iamVjdCA9IHRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuICAgIG1heWJlVHJhbnNmb3JtVXNlcm5hbWVBbmRFbWFpbFRvTG93ZXJDYXNlKG9iamVjdCwgY2xhc3NOYW1lLCB0aGlzLm9wdGlvbnMpO1xuICAgIG9iamVjdC5jcmVhdGVkQXQgPSB7IGlzbzogb2JqZWN0LmNyZWF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcbiAgICBvYmplY3QudXBkYXRlZEF0ID0geyBpc286IG9iamVjdC51cGRhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG5cbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgY29uc3QgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZSwgbnVsbCwgb2JqZWN0KTtcbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWUpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnY3JlYXRlJylcbiAgICAgICAgKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSkpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKSlcbiAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgICAgICBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlKG9iamVjdCk7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIFNjaGVtYUNvbnRyb2xsZXIuY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShzY2hlbWEpLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsT2JqZWN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQub3BzWzBdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICBjYW5BZGRGaWVsZChcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNsYXNzU2NoZW1hID0gc2NoZW1hLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNsYXNzU2NoZW1hKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gICAgY29uc3Qgc2NoZW1hRmllbGRzID0gT2JqZWN0LmtleXMoY2xhc3NTY2hlbWEuZmllbGRzKTtcbiAgICBjb25zdCBuZXdLZXlzID0gZmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICAvLyBTa2lwIGZpZWxkcyB0aGF0IGFyZSB1bnNldFxuICAgICAgaWYgKG9iamVjdFtmaWVsZF0gJiYgb2JqZWN0W2ZpZWxkXS5fX29wICYmIG9iamVjdFtmaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNjaGVtYUZpZWxkcy5pbmRleE9mKGdldFJvb3RGaWVsZE5hbWUoZmllbGQpKSA8IDA7XG4gICAgfSk7XG4gICAgaWYgKG5ld0tleXMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYWRkcyBhIG1hcmtlciB0aGF0IG5ldyBmaWVsZCBpcyBiZWluZyBhZGRpbmcgZHVyaW5nIHVwZGF0ZVxuICAgICAgcnVuT3B0aW9ucy5hZGRzRmllbGQgPSB0cnVlO1xuXG4gICAgICBjb25zdCBhY3Rpb24gPSBydW5PcHRpb25zLmFjdGlvbjtcbiAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdhZGRGaWVsZCcsIGFjdGlvbik7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdvbid0IGRlbGV0ZSBjb2xsZWN0aW9ucyBpbiB0aGUgc3lzdGVtIG5hbWVzcGFjZVxuICAvKipcbiAgICogRGVsZXRlIGFsbCBjbGFzc2VzIGFuZCBjbGVhcnMgdGhlIHNjaGVtYSBjYWNoZVxuICAgKlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IGZhc3Qgc2V0IHRvIHRydWUgaWYgaXQncyBvayB0byBqdXN0IGRlbGV0ZSByb3dzIGFuZCBub3QgaW5kZXhlc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gd2hlbiB0aGUgZGVsZXRpb25zIGNvbXBsZXRlc1xuICAgKi9cbiAgZGVsZXRlRXZlcnl0aGluZyhmYXN0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPGFueT4ge1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUFsbENsYXNzZXMoZmFzdCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIHJlbGF0ZWQgaWRzIGdpdmVuIGFuIG93bmluZyBpZC5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIHJlbGF0ZWRJZHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgb3duaW5nSWQ6IHN0cmluZyxcbiAgICBxdWVyeU9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPEFycmF5PHN0cmluZz4+IHtcbiAgICBjb25zdCB7IHNraXAsIGxpbWl0LCBzb3J0IH0gPSBxdWVyeU9wdGlvbnM7XG4gICAgY29uc3QgZmluZE9wdGlvbnMgPSB7fTtcbiAgICBpZiAoc29ydCAmJiBzb3J0LmNyZWF0ZWRBdCAmJiB0aGlzLmFkYXB0ZXIuY2FuU29ydE9uSm9pblRhYmxlcykge1xuICAgICAgZmluZE9wdGlvbnMuc29ydCA9IHsgX2lkOiBzb3J0LmNyZWF0ZWRBdCB9O1xuICAgICAgZmluZE9wdGlvbnMubGltaXQgPSBsaW1pdDtcbiAgICAgIGZpbmRPcHRpb25zLnNraXAgPSBza2lwO1xuICAgICAgcXVlcnlPcHRpb25zLnNraXAgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSwgcmVsYXRpb25TY2hlbWEsIHsgb3duaW5nSWQgfSwgZmluZE9wdGlvbnMpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmVsYXRlZElkKSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIG93bmluZyBpZHMgZ2l2ZW4gc29tZSByZWxhdGVkIGlkcy5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIG93bmluZ0lkcyhjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcsIHJlbGF0ZWRJZHM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKFxuICAgICAgICBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIHsgcmVsYXRlZElkOiB7ICRpbjogcmVsYXRlZElkcyB9IH0sXG4gICAgICAgIHsga2V5czogWydvd25pbmdJZCddIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5vd25pbmdJZCkpO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRpbiBvbiByZWxhdGlvbiBmaWVsZHMsIG9yXG4gIC8vIGVxdWFsLXRvLXBvaW50ZXIgY29uc3RyYWludHMgb24gcmVsYXRpb24gZmllbGRzLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBzY2hlbWE6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gU2VhcmNoIGZvciBhbiBpbi1yZWxhdGlvbiBvciBlcXVhbC10by1yZWxhdGlvblxuICAgIC8vIE1ha2UgaXQgc2VxdWVudGlhbCBmb3Igbm93LCBub3Qgc3VyZSBvZiBwYXJhbGxlaXphdGlvbiBzaWRlIGVmZmVjdHNcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICBjb25zdCBvcnMgPSBxdWVyeVsnJG9yJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIG9ycy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHF1ZXJ5Wyckb3InXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgY29uc3QgYW5kcyA9IHF1ZXJ5WyckYW5kJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIGFuZHMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJGFuZCddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbWlzZXMgPSBPYmplY3Qua2V5cyhxdWVyeSkubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAoIXQgfHwgdC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfVxuICAgICAgbGV0IHF1ZXJpZXM6ID8oYW55W10pID0gbnVsbDtcbiAgICAgIGlmIChcbiAgICAgICAgcXVlcnlba2V5XSAmJlxuICAgICAgICAocXVlcnlba2V5XVsnJGluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmUnXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV0uX190eXBlID09ICdQb2ludGVyJylcbiAgICAgICkge1xuICAgICAgICAvLyBCdWlsZCB0aGUgbGlzdCBvZiBxdWVyaWVzXG4gICAgICAgIHF1ZXJpZXMgPSBPYmplY3Qua2V5cyhxdWVyeVtrZXldKS5tYXAoY29uc3RyYWludEtleSA9PiB7XG4gICAgICAgICAgbGV0IHJlbGF0ZWRJZHM7XG4gICAgICAgICAgbGV0IGlzTmVnYXRpb24gPSBmYWxzZTtcbiAgICAgICAgICBpZiAoY29uc3RyYWludEtleSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRpbicpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuaW4nKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckbmluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmUnKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XVsnJG5lJ10ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uLFxuICAgICAgICAgICAgcmVsYXRlZElkcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJpZXMgPSBbeyBpc05lZ2F0aW9uOiBmYWxzZSwgcmVsYXRlZElkczogW10gfV07XG4gICAgICB9XG5cbiAgICAgIC8vIHJlbW92ZSB0aGUgY3VycmVudCBxdWVyeUtleSBhcyB3ZSBkb24sdCBuZWVkIGl0IGFueW1vcmVcbiAgICAgIGRlbGV0ZSBxdWVyeVtrZXldO1xuICAgICAgLy8gZXhlY3V0ZSBlYWNoIHF1ZXJ5IGluZGVwZW5kZW50bHkgdG8gYnVpbGQgdGhlIGxpc3Qgb2ZcbiAgICAgIC8vICRpbiAvICRuaW5cbiAgICAgIGNvbnN0IHByb21pc2VzID0gcXVlcmllcy5tYXAocSA9PiB7XG4gICAgICAgIGlmICghcSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5vd25pbmdJZHMoY2xhc3NOYW1lLCBrZXksIHEucmVsYXRlZElkcykudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGlmIChxLmlzTmVnYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJHJlbGF0ZWRUb1xuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHF1ZXJ5T3B0aW9uczogYW55KTogP1Byb21pc2U8dm9pZD4ge1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRvciddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChxdWVyeVsnJGFuZCddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5WyckYW5kJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgYVF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgdmFyIHJlbGF0ZWRUbyA9IHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgaWYgKHJlbGF0ZWRUbykge1xuICAgICAgcmV0dXJuIHRoaXMucmVsYXRlZElkcyhcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHJlbGF0ZWRUby5rZXksXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3Qub2JqZWN0SWQsXG4gICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgKVxuICAgICAgICAudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICB9XG4gIH1cblxuICBhZGRJbk9iamVjdElkc0lkcyhpZHM6ID9BcnJheTxzdHJpbmc+ID0gbnVsbCwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21TdHJpbmc6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycgPyBbcXVlcnkub2JqZWN0SWRdIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tRXE6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckZXEnXSA/IFtxdWVyeS5vYmplY3RJZFsnJGVxJ11dIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tSW46ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA6IG51bGw7XG5cbiAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICBjb25zdCBhbGxJZHM6IEFycmF5PEFycmF5PHN0cmluZz4+ID0gW2lkc0Zyb21TdHJpbmcsIGlkc0Zyb21FcSwgaWRzRnJvbUluLCBpZHNdLmZpbHRlcihcbiAgICAgIGxpc3QgPT4gbGlzdCAhPT0gbnVsbFxuICAgICk7XG4gICAgY29uc3QgdG90YWxMZW5ndGggPSBhbGxJZHMucmVkdWNlKChtZW1vLCBsaXN0KSA9PiBtZW1vICsgbGlzdC5sZW5ndGgsIDApO1xuXG4gICAgbGV0IGlkc0ludGVyc2VjdGlvbiA9IFtdO1xuICAgIGlmICh0b3RhbExlbmd0aCA+IDEyNSkge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0LmJpZyhhbGxJZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QoYWxsSWRzKTtcbiAgICB9XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBxdWVyeS5vYmplY3RJZFsnJGluJ10gPSBpZHNJbnRlcnNlY3Rpb247XG5cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICBhZGROb3RJbk9iamVjdElkc0lkcyhpZHM6IHN0cmluZ1tdID0gW10sIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tTmluID0gcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gOiBbXTtcbiAgICBsZXQgYWxsSWRzID0gWy4uLmlkc0Zyb21OaW4sIC4uLmlkc10uZmlsdGVyKGxpc3QgPT4gbGlzdCAhPT0gbnVsbCk7XG5cbiAgICAvLyBtYWtlIGEgc2V0IGFuZCBzcHJlYWQgdG8gcmVtb3ZlIGR1cGxpY2F0ZXNcbiAgICBhbGxJZHMgPSBbLi4ubmV3IFNldChhbGxJZHMpXTtcblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBxdWVyeS5vYmplY3RJZFsnJG5pbiddID0gYWxsSWRzO1xuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIFJ1bnMgYSBxdWVyeSBvbiB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYSBsaXN0IG9mIGl0ZW1zLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIHNraXAgICAgbnVtYmVyIG9mIHJlc3VsdHMgdG8gc2tpcC5cbiAgLy8gICBsaW1pdCAgIGxpbWl0IHRvIHRoaXMgbnVtYmVyIG9mIHJlc3VsdHMuXG4gIC8vICAgc29ydCAgICBhbiBvYmplY3Qgd2hlcmUga2V5cyBhcmUgdGhlIGZpZWxkcyB0byBzb3J0IGJ5LlxuICAvLyAgICAgICAgICAgdGhlIHZhbHVlIGlzICsxIGZvciBhc2NlbmRpbmcsIC0xIGZvciBkZXNjZW5kaW5nLlxuICAvLyAgIGNvdW50ICAgcnVuIGEgY291bnQgaW5zdGVhZCBvZiByZXR1cm5pbmcgcmVzdWx0cy5cbiAgLy8gICBhY2wgICAgIHJlc3RyaWN0IHRoaXMgb3BlcmF0aW9uIHdpdGggYW4gQUNMIGZvciB0aGUgcHJvdmlkZWQgYXJyYXlcbiAgLy8gICAgICAgICAgIG9mIHVzZXIgb2JqZWN0SWRzIGFuZCByb2xlcy4gYWNsOiBudWxsIG1lYW5zIG5vIHVzZXIuXG4gIC8vICAgICAgICAgICB3aGVuIHRoaXMgZmllbGQgaXMgbm90IHByZXNlbnQsIGRvbid0IGRvIGFueXRoaW5nIHJlZ2FyZGluZyBBQ0xzLlxuICAvLyAgY2FzZUluc2Vuc2l0aXZlIG1ha2Ugc3RyaW5nIGNvbXBhcmlzb25zIGNhc2UgaW5zZW5zaXRpdmVcbiAgLy8gVE9ETzogbWFrZSB1c2VySWRzIG5vdCBuZWVkZWQgaGVyZS4gVGhlIGRiIGFkYXB0ZXIgc2hvdWxkbid0IGtub3dcbiAgLy8gYW55dGhpbmcgYWJvdXQgdXNlcnMsIGlkZWFsbHkuIFRoZW4sIGltcHJvdmUgdGhlIGZvcm1hdCBvZiB0aGUgQUNMXG4gIC8vIGFyZyB0byB3b3JrIGxpa2UgdGhlIG90aGVycy5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIGFjbCxcbiAgICAgIHNvcnQgPSB7fSxcbiAgICAgIGNvdW50LFxuICAgICAga2V5cyxcbiAgICAgIG9wLFxuICAgICAgZGlzdGluY3QsXG4gICAgICBwaXBlbGluZSxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSA9IGZhbHNlLFxuICAgICAgZXhwbGFpbixcbiAgICB9OiBhbnkgPSB7fSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgb3AgPVxuICAgICAgb3AgfHwgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PSAnc3RyaW5nJyAmJiBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAxID8gJ2dldCcgOiAnZmluZCcpO1xuICAgIC8vIENvdW50IG9wZXJhdGlvbiBpZiBjb3VudGluZ1xuICAgIG9wID0gY291bnQgPT09IHRydWUgPyAnY291bnQnIDogb3A7XG5cbiAgICBsZXQgY2xhc3NFeGlzdHMgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAvL0FsbG93IHZvbGF0aWxlIGNsYXNzZXMgaWYgcXVlcnlpbmcgd2l0aCBNYXN0ZXIgKGZvciBfUHVzaFN0YXR1cylcbiAgICAgIC8vVE9ETzogTW92ZSB2b2xhdGlsZSBjbGFzc2VzIGNvbmNlcHQgaW50byBtb25nbyBhZGFwdGVyLCBwb3N0Z3JlcyBhZGFwdGVyIHNob3VsZG4ndCBjYXJlXG4gICAgICAvL3RoYXQgYXBpLnBhcnNlLmNvbSBicmVha3Mgd2hlbiBfUHVzaFN0YXR1cyBleGlzdHMgaW4gbW9uZ28uXG4gICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgaXNNYXN0ZXIpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gQmVoYXZpb3IgZm9yIG5vbi1leGlzdGVudCBjbGFzc2VzIGlzIGtpbmRhIHdlaXJkIG9uIFBhcnNlLmNvbS4gUHJvYmFibHkgZG9lc24ndCBtYXR0ZXIgdG9vIG11Y2guXG4gICAgICAgICAgLy8gRm9yIG5vdywgcHJldGVuZCB0aGUgY2xhc3MgZXhpc3RzIGJ1dCBoYXMgbm8gb2JqZWN0cyxcbiAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xhc3NFeGlzdHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgLy8gUGFyc2UuY29tIHRyZWF0cyBxdWVyaWVzIG9uIF9jcmVhdGVkX2F0IGFuZCBfdXBkYXRlZF9hdCBhcyBpZiB0aGV5IHdlcmUgcXVlcmllcyBvbiBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdCxcbiAgICAgICAgICAvLyBzbyBkdXBsaWNhdGUgdGhhdCBiZWhhdmlvciBoZXJlLiBJZiBib3RoIGFyZSBzcGVjaWZpZWQsIHRoZSBjb3JyZWN0IGJlaGF2aW9yIHRvIG1hdGNoIFBhcnNlLmNvbSBpcyB0b1xuICAgICAgICAgIC8vIHVzZSB0aGUgb25lIHRoYXQgYXBwZWFycyBmaXJzdCBpbiB0aGUgc29ydCBsaXN0LlxuICAgICAgICAgIGlmIChzb3J0Ll9jcmVhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LmNyZWF0ZWRBdCA9IHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHNvcnQuX3VwZGF0ZWRfYXQpIHtcbiAgICAgICAgICAgIHNvcnQudXBkYXRlZEF0ID0gc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBxdWVyeU9wdGlvbnMgPSB7XG4gICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICBzb3J0LFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZTogdGhpcy5vcHRpb25zLmRpc2FibGVDYXNlSW5zZW5zaXRpdml0eSA/IGZhbHNlIDogY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICB9O1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNvcnQpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgQ2Fubm90IHNvcnQgYnkgJHtmaWVsZE5hbWV9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgb3ApXG4gICAgICAgICAgKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWFDb250cm9sbGVyKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHByb3RlY3RlZEZpZWxkcztcbiAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvKiBEb24ndCB1c2UgcHJvamVjdGlvbnMgdG8gb3B0aW1pemUgdGhlIHByb3RlY3RlZEZpZWxkcyBzaW5jZSB0aGUgcHJvdGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICBiYXNlZCBvbiBwb2ludGVyLXBlcm1pc3Npb25zIGFyZSBkZXRlcm1pbmVkIGFmdGVyIHF1ZXJ5aW5nLiBUaGUgZmlsdGVyaW5nIGNhblxuICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlIHRoZSBwcm90ZWN0ZWQgZmllbGRzLiAqL1xuICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHRoaXMuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAnZ2V0Jykge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBpZiAob3AgPT09ICd1cGRhdGUnIHx8IG9wID09PSAnZGVsZXRlJykge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFJlYWRBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSk7XG4gICAgICAgICAgICAgIGlmIChjb3VudCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNvdW50KFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIGhpbnRcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGRpc3RpbmN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRpc3RpbmN0KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgZGlzdGluY3QpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChwaXBlbGluZSkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5hZ2dyZWdhdGUoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBwaXBlbGluZSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICAgICAgICAgIGV4cGxhaW5cbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAgICAgICAgIC5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKVxuICAgICAgICAgICAgICAgICAgLnRoZW4ob2JqZWN0cyA9PlxuICAgICAgICAgICAgICAgICAgICBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdCA9IHVudHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgICAgICAgICAgICBpc01hc3RlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZGVsZXRlU2NoZW1hKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWFDb250cm9sbGVyID0gcztcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5hZGFwdGVyLmNvdW50KGNsYXNzTmFtZSwgeyBmaWVsZHM6IHt9IH0sIG51bGwsICcnLCBmYWxzZSkpXG4gICAgICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICAgICAgaWYgKGNvdW50ID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgMjU1LFxuICAgICAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gaXMgbm90IGVtcHR5LCBjb250YWlucyAke2NvdW50fSBvYmplY3RzLCBjYW5ub3QgZHJvcCBzY2hlbWEuYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhjbGFzc05hbWUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4od2FzUGFyc2VDb2xsZWN0aW9uID0+IHtcbiAgICAgICAgICAgIGlmICh3YXNQYXJzZUNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICAgICAgICAgIGZpZWxkTmFtZSA9PiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLm1hcChuYW1lID0+XG4gICAgICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3Moam9pblRhYmxlTmFtZShjbGFzc05hbWUsIG5hbWUpKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBTY2hlbWFDYWNoZS5kZWwoY2xhc3NOYW1lKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlci5yZWxvYWREYXRhKCk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBUaGlzIGhlbHBzIHRvIGNyZWF0ZSBpbnRlcm1lZGlhdGUgb2JqZWN0cyBmb3Igc2ltcGxlciBjb21wYXJpc29uIG9mXG4gIC8vIGtleSB2YWx1ZSBwYWlycyB1c2VkIGluIHF1ZXJ5IG9iamVjdHMuIEVhY2gga2V5IHZhbHVlIHBhaXIgd2lsbCByZXByZXNlbnRlZFxuICAvLyBpbiBhIHNpbWlsYXIgd2F5IHRvIGpzb25cbiAgb2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxdWVyeTogYW55KTogQXJyYXk8c3RyaW5nPiB7XG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHF1ZXJ5KS5tYXAoYSA9PiBhLm1hcChzID0+IEpTT04uc3RyaW5naWZ5KHMpKS5qb2luKCc6JykpO1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgT1Igb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZU9yT3BlcmF0aW9uKHF1ZXJ5OiB7ICRvcjogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRvcikge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJG9yLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgbG9uZ2VyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJG9yLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kb3IubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRvclswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRvcjtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgQU5EIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VBbmRPcGVyYXRpb24ocXVlcnk6IHsgJGFuZDogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRhbmQpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRhbmQubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBzaG9ydGVyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJGFuZC5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kYW5kLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kYW5kWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJGFuZDtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gQ29uc3RyYWludHMgcXVlcnkgdXNpbmcgQ0xQJ3MgcG9pbnRlciBwZXJtaXNzaW9ucyAoUFApIGlmIGFueS5cbiAgLy8gMS4gRXRyYWN0IHRoZSB1c2VyIGlkIGZyb20gY2FsbGVyJ3MgQUNMZ3JvdXA7XG4gIC8vIDIuIEV4Y3RyYWN0IGEgbGlzdCBvZiBmaWVsZCBuYW1lcyB0aGF0IGFyZSBQUCBmb3IgdGFyZ2V0IGNvbGxlY3Rpb24gYW5kIG9wZXJhdGlvbjtcbiAgLy8gMy4gQ29uc3RyYWludCB0aGUgb3JpZ2luYWwgcXVlcnkgc28gdGhhdCBlYWNoIFBQIGZpZWxkIG11c3RcbiAgLy8gcG9pbnQgdG8gY2FsbGVyJ3MgaWQgKG9yIGNvbnRhaW4gaXQgaW4gY2FzZSBvZiBQUCBmaWVsZCBiZWluZyBhbiBhcnJheSlcbiAgYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW11cbiAgKTogYW55IHtcbiAgICAvLyBDaGVjayBpZiBjbGFzcyBoYXMgcHVibGljIHBlcm1pc3Npb24gZm9yIG9wZXJhdGlvblxuICAgIC8vIElmIHRoZSBCYXNlQ0xQIHBhc3MsIGxldCBnbyB0aHJvdWdoXG4gICAgaWYgKHNjaGVtYS50ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcblxuICAgIGNvbnN0IHVzZXJBQ0wgPSBhY2xHcm91cC5maWx0ZXIoYWNsID0+IHtcbiAgICAgIHJldHVybiBhY2wuaW5kZXhPZigncm9sZTonKSAhPSAwICYmIGFjbCAhPSAnKic7XG4gICAgfSk7XG5cbiAgICBjb25zdCBncm91cEtleSA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICBjb25zdCBwZXJtRmllbGRzID0gW107XG5cbiAgICBpZiAocGVybXNbb3BlcmF0aW9uXSAmJiBwZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpIHtcbiAgICAgIHBlcm1GaWVsZHMucHVzaCguLi5wZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpO1xuICAgIH1cblxuICAgIGlmIChwZXJtc1tncm91cEtleV0pIHtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICAgIGlmICghcGVybUZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwZXJtRmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICBpZiAocGVybUZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgICAvLyBObyB1c2VyIHNldCByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAvLyBJZiB0aGUgbGVuZ3RoIGlzID4gMSwgdGhhdCBtZWFucyB3ZSBkaWRuJ3QgZGUtZHVwZSB1c2VycyBjb3JyZWN0bHlcbiAgICAgIGlmICh1c2VyQUNMLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXJJZCA9IHVzZXJBQ0xbMF07XG4gICAgICBjb25zdCB1c2VyUG9pbnRlciA9IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHF1ZXJpZXMgPSBwZXJtRmllbGRzLm1hcChrZXkgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZERlc2NyaXB0b3IgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgICAgY29uc3QgZmllbGRUeXBlID1cbiAgICAgICAgICBmaWVsZERlc2NyaXB0b3IgJiZcbiAgICAgICAgICB0eXBlb2YgZmllbGREZXNjcmlwdG9yID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZERlc2NyaXB0b3IsICd0eXBlJylcbiAgICAgICAgICAgID8gZmllbGREZXNjcmlwdG9yLnR5cGVcbiAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBsZXQgcXVlcnlDbGF1c2U7XG5cbiAgICAgICAgaWYgKGZpZWxkVHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3Igc2luZ2xlIHBvaW50ZXIgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3IgdXNlcnMtYXJyYXkgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHsgJGFsbDogW3VzZXJQb2ludGVyXSB9IH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnT2JqZWN0Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIG9iamVjdCBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogdXNlclBvaW50ZXIgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUaGlzIG1lYW5zIHRoYXQgdGhlcmUgaXMgYSBDTFAgZmllbGQgb2YgYW4gdW5leHBlY3RlZCB0eXBlLiBUaGlzIGNvbmRpdGlvbiBzaG91bGQgbm90IGhhcHBlbiwgd2hpY2ggaXNcbiAgICAgICAgICAvLyB3aHkgaXMgYmVpbmcgdHJlYXRlZCBhcyBhbiBlcnJvci5cbiAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgIGBBbiB1bmV4cGVjdGVkIGNvbmRpdGlvbiBvY2N1cnJlZCB3aGVuIHJlc29sdmluZyBwb2ludGVyIHBlcm1pc3Npb25zOiAke2NsYXNzTmFtZX0gJHtrZXl9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgY29uc3RyYWludCBvbiB0aGUga2V5LCB1c2UgdGhlICRhbmRcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChxdWVyeSwga2V5KSkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUFuZE9wZXJhdGlvbih7ICRhbmQ6IFtxdWVyeUNsYXVzZSwgcXVlcnldIH0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGFkZCB0aGUgY29uc3RhaW50XG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgcXVlcnlDbGF1c2UpO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBxdWVyaWVzLmxlbmd0aCA9PT0gMSA/IHF1ZXJpZXNbMF0gOiB0aGlzLnJlZHVjZU9yT3BlcmF0aW9uKHsgJG9yOiBxdWVyaWVzIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICB9XG5cbiAgYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnkgPSB7fSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICBxdWVyeU9wdGlvbnM6IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fVxuICApOiBudWxsIHwgc3RyaW5nW10ge1xuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuICAgIGlmICghcGVybXMpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gcGVybXMucHJvdGVjdGVkRmllbGRzO1xuICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSByZXR1cm4gbnVsbDtcblxuICAgIGlmIChhY2xHcm91cC5pbmRleE9mKHF1ZXJ5Lm9iamVjdElkKSA+IC0xKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIGZvciBxdWVyaWVzIHdoZXJlIFwia2V5c1wiIGFyZSBzZXQgYW5kIGRvIG5vdCBpbmNsdWRlIGFsbCAndXNlckZpZWxkJzp7ZmllbGR9LFxuICAgIC8vIHdlIGhhdmUgdG8gdHJhbnNwYXJlbnRseSBpbmNsdWRlIGl0LCBhbmQgdGhlbiByZW1vdmUgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnRcbiAgICAvLyBCZWNhdXNlIGlmIHN1Y2gga2V5IG5vdCBwcm9qZWN0ZWQgdGhlIHBlcm1pc3Npb24gd29uJ3QgYmUgZW5mb3JjZWQgcHJvcGVybHlcbiAgICAvLyBQUyB0aGlzIGlzIGNhbGxlZCB3aGVuICdleGNsdWRlS2V5cycgYWxyZWFkeSByZWR1Y2VkIHRvICdrZXlzJ1xuICAgIGNvbnN0IHByZXNlcnZlS2V5cyA9IHF1ZXJ5T3B0aW9ucy5rZXlzO1xuXG4gICAgLy8gdGhlc2UgYXJlIGtleXMgdGhhdCBuZWVkIHRvIGJlIGluY2x1ZGVkIG9ubHlcbiAgICAvLyB0byBiZSBhYmxlIHRvIGFwcGx5IHByb3RlY3RlZEZpZWxkcyBieSBwb2ludGVyXG4gICAgLy8gYW5kIHRoZW4gdW5zZXQgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnQgKGxhdGVyIGluICBmaWx0ZXJTZW5zaXRpdmVGaWVsZHMpXG4gICAgY29uc3Qgc2VydmVyT25seUtleXMgPSBbXTtcblxuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWQgPSBhdXRoLnVzZXI7XG5cbiAgICAvLyBtYXAgdG8gYWxsb3cgY2hlY2sgd2l0aG91dCBhcnJheSBzZWFyY2hcbiAgICBjb25zdCByb2xlcyA9IChhdXRoLnVzZXJSb2xlcyB8fCBbXSkucmVkdWNlKChhY2MsIHIpID0+IHtcbiAgICAgIGFjY1tyXSA9IHByb3RlY3RlZEZpZWxkc1tyXTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuXG4gICAgLy8gYXJyYXkgb2Ygc2V0cyBvZiBwcm90ZWN0ZWQgZmllbGRzLiBzZXBhcmF0ZSBpdGVtIGZvciBlYWNoIGFwcGxpY2FibGUgY3JpdGVyaWFcbiAgICBjb25zdCBwcm90ZWN0ZWRLZXlzU2V0cyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBza2lwIHVzZXJGaWVsZHNcbiAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKSB7XG4gICAgICAgIGlmIChwcmVzZXJ2ZUtleXMpIHtcbiAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBrZXkuc3Vic3RyaW5nKDEwKTtcbiAgICAgICAgICBpZiAoIXByZXNlcnZlS2V5cy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICAgICAgICAvLyAxLiBwdXQgaXQgdGhlcmUgdGVtcG9yYXJpbHlcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucy5rZXlzICYmIHF1ZXJ5T3B0aW9ucy5rZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIC8vIDIuIHByZXNlcnZlIGl0IGRlbGV0ZSBsYXRlclxuICAgICAgICAgICAgc2VydmVyT25seUtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gYWRkIHB1YmxpYyB0aWVyXG4gICAgICBpZiAoa2V5ID09PSAnKicpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgICBpZiAoa2V5ID09PSAnYXV0aGVudGljYXRlZCcpIHtcbiAgICAgICAgICAvLyBmb3IgbG9nZ2VkIGluIHVzZXJzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocm9sZXNba2V5XSAmJiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSkge1xuICAgICAgICAgIC8vIGFkZCBhcHBsaWNhYmxlIHJvbGVzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChyb2xlc1trZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGNoZWNrIGlmIHRoZXJlJ3MgYSBydWxlIGZvciBjdXJyZW50IHVzZXIncyBpZFxuICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICBjb25zdCB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG4gICAgICBpZiAocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gcHJlc2VydmUgZmllbGRzIHRvIGJlIHJlbW92ZWQgYmVmb3JlIHNlbmRpbmcgcmVzcG9uc2UgdG8gY2xpZW50XG4gICAgaWYgKHNlcnZlck9ubHlLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzID0gc2VydmVyT25seUtleXM7XG4gICAgfVxuXG4gICAgbGV0IHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzU2V0cy5yZWR1Y2UoKGFjYywgbmV4dCkgPT4ge1xuICAgICAgaWYgKG5leHQpIHtcbiAgICAgICAgYWNjLnB1c2goLi4ubmV4dCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIFtdKTtcblxuICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICBwcm90ZWN0ZWRLZXlzU2V0cy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvdGVjdGVkS2V5cztcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKS50aGVuKHRyYW5zYWN0aW9uYWxTZXNzaW9uID0+IHtcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gdHJhbnNhY3Rpb25hbFNlc3Npb247XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBjb21taXQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGFib3J0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICAvLyBUT0RPOiBjcmVhdGUgaW5kZXhlcyBvbiBmaXJzdCBjcmVhdGlvbiBvZiBhIF9Vc2VyIG9iamVjdC4gT3RoZXJ3aXNlIGl0J3MgaW1wb3NzaWJsZSB0b1xuICAvLyBoYXZlIGEgUGFyc2UgYXBwIHdpdGhvdXQgaXQgaGF2aW5nIGEgX1VzZXIgY29sbGVjdGlvbi5cbiAgYXN5bmMgcGVyZm9ybUluaXRpYWxpemF0aW9uKCkge1xuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIGNvbnN0IHJlcXVpcmVkVXNlckZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Vc2VyLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkUm9sZUZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Sb2xlLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgICB9LFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1VzZXInKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX0lkZW1wb3RlbmN5JykpO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXJuYW1lczogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBpZiAoIXRoaXMub3B0aW9ucy5kaXNhYmxlQ2FzZUluc2Vuc2l0aXZpdHkpIHtcbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10sICdjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lJywgdHJ1ZSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIHVzZXJuYW1lIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuXG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddLCAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsIHRydWUpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSBlbWFpbCBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlciBlbWFpbCBhZGRyZXNzZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Sb2xlJywgcmVxdWlyZWRSb2xlRmllbGRzLCBbJ25hbWUnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3Igcm9sZSBuYW1lOiAnLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgLmVuc3VyZVVuaXF1ZW5lc3MoJ19JZGVtcG90ZW5jeScsIHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMsIFsncmVxSWQnXSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIGlkZW1wb3RlbmN5IHJlcXVlc3QgSUQ6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcblxuICAgIGNvbnN0IGlzTW9uZ29BZGFwdGVyID0gdGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgTW9uZ29TdG9yYWdlQWRhcHRlcjtcbiAgICBjb25zdCBpc1Bvc3RncmVzQWRhcHRlciA9IHRoaXMuYWRhcHRlciBpbnN0YW5jZW9mIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXI7XG4gICAgaWYgKGlzTW9uZ29BZGFwdGVyIHx8IGlzUG9zdGdyZXNBZGFwdGVyKSB7XG4gICAgICBsZXQgb3B0aW9ucyA9IHt9O1xuICAgICAgaWYgKGlzTW9uZ29BZGFwdGVyKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgICAgdHRsOiAwLFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChpc1Bvc3RncmVzQWRhcHRlcikge1xuICAgICAgICBvcHRpb25zID0gdGhpcy5pZGVtcG90ZW5jeU9wdGlvbnM7XG4gICAgICAgIG9wdGlvbnMuc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA9IHRydWU7XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgLmVuc3VyZUluZGV4KCdfSWRlbXBvdGVuY3knLCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzLCBbJ2V4cGlyZSddLCAndHRsJywgZmFsc2UsIG9wdGlvbnMpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgVFRMIGluZGV4IGZvciBpZGVtcG90ZW5jeSBleHBpcmUgZGF0ZTogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLnVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk7XG4gIH1cblxuICBfZXhwYW5kUmVzdWx0T25LZXlQYXRoKG9iamVjdDogYW55LCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IGFueSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPCAwKSB7XG4gICAgICBvYmplY3Rba2V5XSA9IHZhbHVlW2tleV07XG4gICAgICByZXR1cm4gb2JqZWN0O1xuICAgIH1cbiAgICBjb25zdCBwYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgY29uc3QgZmlyc3RLZXkgPSBwYXRoWzBdO1xuICAgIGNvbnN0IG5leHRQYXRoID0gcGF0aC5zbGljZSgxKS5qb2luKCcuJyk7XG5cbiAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgaWYgKHRoaXMub3B0aW9ucyAmJiB0aGlzLm9wdGlvbnMucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgICAgZm9yIChjb25zdCBrZXl3b3JkIG9mIHRoaXMub3B0aW9ucy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICAgIGNvbnN0IG1hdGNoID0gVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZSh7IGZpcnN0S2V5OiB1bmRlZmluZWQgfSwga2V5d29yZC5rZXksIHVuZGVmaW5lZCk7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICBgUHJvaGliaXRlZCBrZXl3b3JkIGluIHJlcXVlc3QgZGF0YTogJHtKU09OLnN0cmluZ2lmeShrZXl3b3JkKX0uYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBvYmplY3RbZmlyc3RLZXldID0gdGhpcy5fZXhwYW5kUmVzdWx0T25LZXlQYXRoKFxuICAgICAgb2JqZWN0W2ZpcnN0S2V5XSB8fCB7fSxcbiAgICAgIG5leHRQYXRoLFxuICAgICAgdmFsdWVbZmlyc3RLZXldXG4gICAgKTtcbiAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIF9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0OiBhbnksIHJlc3VsdDogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IHt9O1xuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICB9XG4gICAgT2JqZWN0LmtleXMob3JpZ2luYWxPYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGNvbnN0IGtleVVwZGF0ZSA9IG9yaWdpbmFsT2JqZWN0W2tleV07XG4gICAgICAvLyBkZXRlcm1pbmUgaWYgdGhhdCB3YXMgYW4gb3BcbiAgICAgIGlmIChcbiAgICAgICAga2V5VXBkYXRlICYmXG4gICAgICAgIHR5cGVvZiBrZXlVcGRhdGUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIGtleVVwZGF0ZS5fX29wICYmXG4gICAgICAgIFsnQWRkJywgJ0FkZFVuaXF1ZScsICdSZW1vdmUnLCAnSW5jcmVtZW50J10uaW5kZXhPZihrZXlVcGRhdGUuX19vcCkgPiAtMVxuICAgICAgKSB7XG4gICAgICAgIC8vIG9ubHkgdmFsaWQgb3BzIHRoYXQgcHJvZHVjZSBhbiBhY3Rpb25hYmxlIHJlc3VsdFxuICAgICAgICAvLyB0aGUgb3AgbWF5IGhhdmUgaGFwcGVuZWQgb24gYSBrZXlwYXRoXG4gICAgICAgIHRoaXMuX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChyZXNwb25zZSwga2V5LCByZXN1bHQpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICB9XG5cbiAgc3RhdGljIF92YWxpZGF0ZVF1ZXJ5OiBhbnkgPT4gdm9pZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBEYXRhYmFzZUNvbnRyb2xsZXI7XG4vLyBFeHBvc2UgdmFsaWRhdGVRdWVyeSBmb3IgdGVzdHNcbm1vZHVsZS5leHBvcnRzLl92YWxpZGF0ZVF1ZXJ5ID0gdmFsaWRhdGVRdWVyeTtcbiJdfQ==