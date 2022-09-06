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

const specialQueryKeys = ['$and', '$or', '$nor', '_rperm', '_wperm'];
const specialMasterQueryKeys = [...specialQueryKeys, '_email_verify_token', '_perishable_token', '_tombstone', '_email_verify_token_expires_at', '_failed_login_count', '_account_lockout_expires_at', '_password_changed_at', '_password_history'];

const validateQuery = (query, isMaster, update) => {
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }

  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(value => validateQuery(value, isMaster, update));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }

  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(value => validateQuery(value, isMaster, update));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }

  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(value => validateQuery(value, isMaster, update));
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

    if (!key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/) && (!specialQueryKeys.includes(key) && !isMaster && !update || update && isMaster && !specialMasterQueryKeys.includes(key))) {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${key}`);
    }
  });
}; // Filters out any data that shouldn't be on this REST-formatted object.


const filterSensitiveData = (isMaster, aclGroup, auth, operation, schema, className, protectedFields, object) => {
  let userId = null;
  if (auth && auth.user) userId = auth.user.id; // replace protectedFields when using pointer-permissions

  const perms = schema && schema.getClassLevelPermissions ? schema.getClassLevelPermissions(className) : {};

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

  if (isUserClass) {
    object.password = object._hashed_password;
    delete object._hashed_password;
    delete object.sessionToken;
  }

  if (isMaster) {
    return object;
  }

  for (const key in object) {
    if (key.charAt(0) === '_') {
      delete object[key];
    }
  }

  if (!isUserClass) {
    return object;
  }

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
      if (typeof object[key] === 'string') object[key] = object[key].toLowerCase();
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

        validateQuery(query, isMaster, true);
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

        validateQuery(query, isMaster, false);
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

          validateQuery(query, isMaster, false);

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
    const perms = schema && schema.getClassLevelPermissions ? schema.getClassLevelPermissions(className) : schema;
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
module.exports.filterSensitiveData = filterSensitiveData;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwibmFtZXMiOlsiYWRkV3JpdGVBQ0wiLCJxdWVyeSIsImFjbCIsIm5ld1F1ZXJ5IiwiXyIsImNsb25lRGVlcCIsIl93cGVybSIsIiRpbiIsImFkZFJlYWRBQ0wiLCJfcnBlcm0iLCJ0cmFuc2Zvcm1PYmplY3RBQ0wiLCJBQ0wiLCJyZXN1bHQiLCJlbnRyeSIsInJlYWQiLCJwdXNoIiwid3JpdGUiLCJzcGVjaWFsUXVlcnlLZXlzIiwic3BlY2lhbE1hc3RlclF1ZXJ5S2V5cyIsInZhbGlkYXRlUXVlcnkiLCJpc01hc3RlciIsInVwZGF0ZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiJG9yIiwiQXJyYXkiLCJmb3JFYWNoIiwidmFsdWUiLCIkYW5kIiwiJG5vciIsImxlbmd0aCIsIk9iamVjdCIsImtleXMiLCJrZXkiLCIkcmVnZXgiLCIkb3B0aW9ucyIsIm1hdGNoIiwiaW5jbHVkZXMiLCJJTlZBTElEX0tFWV9OQU1FIiwiZmlsdGVyU2Vuc2l0aXZlRGF0YSIsImFjbEdyb3VwIiwiYXV0aCIsIm9wZXJhdGlvbiIsInNjaGVtYSIsImNsYXNzTmFtZSIsInByb3RlY3RlZEZpZWxkcyIsIm9iamVjdCIsInVzZXJJZCIsInVzZXIiLCJpZCIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNSZWFkT3BlcmF0aW9uIiwiaW5kZXhPZiIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtIiwiZmlsdGVyIiwic3RhcnRzV2l0aCIsIm1hcCIsInN1YnN0cmluZyIsIm5ld1Byb3RlY3RlZEZpZWxkcyIsIm92ZXJyaWRlUHJvdGVjdGVkRmllbGRzIiwicG9pbnRlclBlcm0iLCJwb2ludGVyUGVybUluY2x1ZGVzVXNlciIsInJlYWRVc2VyRmllbGRWYWx1ZSIsImlzQXJyYXkiLCJzb21lIiwib2JqZWN0SWQiLCJmaWVsZHMiLCJ2IiwiaXNVc2VyQ2xhc3MiLCJrIiwidGVtcG9yYXJ5S2V5cyIsInBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsInNlc3Npb25Ub2tlbiIsImNoYXJBdCIsImF1dGhEYXRhIiwic3BlY2lhbEtleXNGb3JVcGRhdGUiLCJpc1NwZWNpYWxVcGRhdGVLZXkiLCJqb2luVGFibGVOYW1lIiwiZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSIsIl9fb3AiLCJhbW91bnQiLCJJTlZBTElEX0pTT04iLCJvYmplY3RzIiwiQ09NTUFORF9VTkFWQUlMQUJMRSIsInRyYW5zZm9ybUF1dGhEYXRhIiwicHJvdmlkZXIiLCJwcm92aWRlckRhdGEiLCJmaWVsZE5hbWUiLCJ0eXBlIiwidW50cmFuc2Zvcm1PYmplY3RBQ0wiLCJvdXRwdXQiLCJnZXRSb290RmllbGROYW1lIiwic3BsaXQiLCJyZWxhdGlvblNjaGVtYSIsInJlbGF0ZWRJZCIsIm93bmluZ0lkIiwibWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2UiLCJvcHRpb25zIiwiZm9yY2VFbWFpbEFuZFVzZXJuYW1lVG9Mb3dlckNhc2UiLCJ0b0xvd2VyQ2FzZUZpZWxkcyIsInRvTG93ZXJDYXNlIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJhZGFwdGVyIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwic2NoZW1hUHJvbWlzZSIsIl90cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbGxlY3Rpb25FeGlzdHMiLCJjbGFzc0V4aXN0cyIsInB1cmdlQ29sbGVjdGlvbiIsImxvYWRTY2hlbWEiLCJ0aGVuIiwic2NoZW1hQ29udHJvbGxlciIsImdldE9uZVNjaGVtYSIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwidmFsaWRhdGVDbGFzc05hbWUiLCJTY2hlbWFDb250cm9sbGVyIiwiY2xhc3NOYW1lSXNWYWxpZCIsIlByb21pc2UiLCJyZWplY3QiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJyZXNvbHZlIiwiY2xlYXJDYWNoZSIsImxvYWQiLCJsb2FkU2NoZW1hSWZOZWVkZWQiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInQiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsInVuZGVmaW5lZCIsInMiLCJjYW5BZGRGaWVsZCIsIm1hbnkiLCJ1cHNlcnQiLCJhZGRzRmllbGQiLCJza2lwU2FuaXRpemF0aW9uIiwidmFsaWRhdGVPbmx5IiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwib3JpZ2luYWxRdWVyeSIsIm9yaWdpbmFsVXBkYXRlIiwicmVsYXRpb25VcGRhdGVzIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiY29sbGVjdFJlbGF0aW9uVXBkYXRlcyIsImFkZFBvaW50ZXJQZXJtaXNzaW9ucyIsImNhdGNoIiwiZXJyb3IiLCJyb290RmllbGROYW1lIiwiZmllbGROYW1lSXNWYWxpZCIsInVwZGF0ZU9wZXJhdGlvbiIsImlubmVyS2V5IiwiSU5WQUxJRF9ORVNURURfS0VZIiwiZmluZCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwc2VydE9uZU9iamVjdCIsImZpbmRPbmVBbmRVcGRhdGUiLCJoYW5kbGVSZWxhdGlvblVwZGF0ZXMiLCJfc2FuaXRpemVEYXRhYmFzZVJlc3VsdCIsIm9wcyIsImRlbGV0ZU1lIiwicHJvY2VzcyIsIm9wIiwieCIsInBlbmRpbmciLCJhZGRSZWxhdGlvbiIsInJlbW92ZVJlbGF0aW9uIiwiYWxsIiwiZnJvbUNsYXNzTmFtZSIsImZyb21JZCIsInRvSWQiLCJkb2MiLCJjb2RlIiwiZGVzdHJveSIsInBhcnNlRm9ybWF0U2NoZW1hIiwiY3JlYXRlIiwib3JpZ2luYWxPYmplY3QiLCJjcmVhdGVkQXQiLCJpc28iLCJfX3R5cGUiLCJ1cGRhdGVkQXQiLCJlbmZvcmNlQ2xhc3NFeGlzdHMiLCJjcmVhdGVPYmplY3QiLCJjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hIiwiY2xhc3NTY2hlbWEiLCJzY2hlbWFEYXRhIiwic2NoZW1hRmllbGRzIiwibmV3S2V5cyIsImZpZWxkIiwiYWN0aW9uIiwiZGVsZXRlRXZlcnl0aGluZyIsImZhc3QiLCJTY2hlbWFDYWNoZSIsImNsZWFyIiwiZGVsZXRlQWxsQ2xhc3NlcyIsInJlbGF0ZWRJZHMiLCJxdWVyeU9wdGlvbnMiLCJza2lwIiwibGltaXQiLCJzb3J0IiwiZmluZE9wdGlvbnMiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwiX2lkIiwicmVzdWx0cyIsIm93bmluZ0lkcyIsInJlZHVjZUluUmVsYXRpb24iLCJvcnMiLCJhUXVlcnkiLCJpbmRleCIsImFuZHMiLCJwcm9taXNlcyIsInF1ZXJpZXMiLCJjb25zdHJhaW50S2V5IiwiaXNOZWdhdGlvbiIsInIiLCJxIiwiaWRzIiwiYWRkTm90SW5PYmplY3RJZHNJZHMiLCJhZGRJbk9iamVjdElkc0lkcyIsInJlZHVjZVJlbGF0aW9uS2V5cyIsInJlbGF0ZWRUbyIsImlkc0Zyb21TdHJpbmciLCJpZHNGcm9tRXEiLCJpZHNGcm9tSW4iLCJhbGxJZHMiLCJsaXN0IiwidG90YWxMZW5ndGgiLCJyZWR1Y2UiLCJtZW1vIiwiaWRzSW50ZXJzZWN0aW9uIiwiaW50ZXJzZWN0IiwiYmlnIiwiJGVxIiwiaWRzRnJvbU5pbiIsIlNldCIsIiRuaW4iLCJjb3VudCIsImRpc3RpbmN0IiwicGlwZWxpbmUiLCJyZWFkUHJlZmVyZW5jZSIsImhpbnQiLCJjYXNlSW5zZW5zaXRpdmUiLCJleHBsYWluIiwiX2NyZWF0ZWRfYXQiLCJfdXBkYXRlZF9hdCIsImRpc2FibGVDYXNlSW5zZW5zaXRpdml0eSIsImFkZFByb3RlY3RlZEZpZWxkcyIsImFnZ3JlZ2F0ZSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImRlbGV0ZVNjaGVtYSIsImRlbGV0ZUNsYXNzIiwid2FzUGFyc2VDb2xsZWN0aW9uIiwicmVsYXRpb25GaWVsZE5hbWVzIiwibmFtZSIsImRlbCIsInJlbG9hZERhdGEiLCJvYmplY3RUb0VudHJpZXNTdHJpbmdzIiwiZW50cmllcyIsImEiLCJKU09OIiwic3RyaW5naWZ5Iiwiam9pbiIsInJlZHVjZU9yT3BlcmF0aW9uIiwicmVwZWF0IiwiaSIsImoiLCJzaG9ydGVyIiwibG9uZ2VyIiwiZm91bmRFbnRyaWVzIiwiYWNjIiwic2hvcnRlckVudHJpZXMiLCJzcGxpY2UiLCJyZWR1Y2VBbmRPcGVyYXRpb24iLCJ0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUiLCJ1c2VyQUNMIiwiZ3JvdXBLZXkiLCJwZXJtRmllbGRzIiwicG9pbnRlckZpZWxkcyIsInVzZXJQb2ludGVyIiwiZmllbGREZXNjcmlwdG9yIiwiZmllbGRUeXBlIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwicXVlcnlDbGF1c2UiLCIkYWxsIiwiYXNzaWduIiwicHJlc2VydmVLZXlzIiwic2VydmVyT25seUtleXMiLCJhdXRoZW50aWNhdGVkIiwicm9sZXMiLCJ1c2VyUm9sZXMiLCJwcm90ZWN0ZWRLZXlzU2V0cyIsInByb3RlY3RlZEtleXMiLCJuZXh0IiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJyZXF1aXJlZFVzZXJGaWVsZHMiLCJkZWZhdWx0Q29sdW1ucyIsIl9EZWZhdWx0IiwiX1VzZXIiLCJyZXF1aXJlZFJvbGVGaWVsZHMiLCJfUm9sZSIsInJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMiLCJfSWRlbXBvdGVuY3kiLCJlbnN1cmVVbmlxdWVuZXNzIiwibG9nZ2VyIiwid2FybiIsImVuc3VyZUluZGV4IiwiaXNNb25nb0FkYXB0ZXIiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiaXNQb3N0Z3Jlc0FkYXB0ZXIiLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwidHRsIiwic2V0SWRlbXBvdGVuY3lGdW5jdGlvbiIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwiX2V4cGFuZFJlc3VsdE9uS2V5UGF0aCIsInBhdGgiLCJmaXJzdEtleSIsIm5leHRQYXRoIiwic2xpY2UiLCJyZXF1ZXN0S2V5d29yZERlbnlsaXN0Iiwia2V5d29yZCIsIlV0aWxzIiwib2JqZWN0Q29udGFpbnNLZXlWYWx1ZSIsInJlc3BvbnNlIiwia2V5VXBkYXRlIiwibW9kdWxlIiwiZXhwb3J0cyIsIl92YWxpZGF0ZVF1ZXJ5Il0sIm1hcHBpbmdzIjoiOztBQUtBOztBQUVBOztBQUVBOztBQUVBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFLQSxTQUFTQSxXQUFULENBQXFCQyxLQUFyQixFQUE0QkMsR0FBNUIsRUFBaUM7QUFDL0IsUUFBTUMsUUFBUSxHQUFHQyxnQkFBRUMsU0FBRixDQUFZSixLQUFaLENBQWpCLENBRCtCLENBRS9COzs7QUFDQUUsRUFBQUEsUUFBUSxDQUFDRyxNQUFULEdBQWtCO0FBQUVDLElBQUFBLEdBQUcsRUFBRSxDQUFDLElBQUQsRUFBTyxHQUFHTCxHQUFWO0FBQVAsR0FBbEI7QUFDQSxTQUFPQyxRQUFQO0FBQ0Q7O0FBRUQsU0FBU0ssVUFBVCxDQUFvQlAsS0FBcEIsRUFBMkJDLEdBQTNCLEVBQWdDO0FBQzlCLFFBQU1DLFFBQVEsR0FBR0MsZ0JBQUVDLFNBQUYsQ0FBWUosS0FBWixDQUFqQixDQUQ4QixDQUU5Qjs7O0FBQ0FFLEVBQUFBLFFBQVEsQ0FBQ00sTUFBVCxHQUFrQjtBQUFFRixJQUFBQSxHQUFHLEVBQUUsQ0FBQyxJQUFELEVBQU8sR0FBUCxFQUFZLEdBQUdMLEdBQWY7QUFBUCxHQUFsQjtBQUNBLFNBQU9DLFFBQVA7QUFDRCxDLENBRUQ7OztBQUNBLE1BQU1PLGtCQUFrQixHQUFHLFFBQXdCO0FBQUEsTUFBdkI7QUFBRUMsSUFBQUE7QUFBRixHQUF1QjtBQUFBLE1BQWJDLE1BQWE7O0FBQ2pELE1BQUksQ0FBQ0QsR0FBTCxFQUFVO0FBQ1IsV0FBT0Ms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QU0sQ0FBQ0MsT0FBUCxDQUFlQyxjQUFmLEdBQWdDOVQsYUFBaEM7QUFDQTRULE1BQU0sQ0FBQ0MsT0FBUCxDQUFleFMsbUJBQWYsR0FBcUNBLG1CQUFyQyIsInNvdXJjZXNDb250ZW50IjpbIu+7vy8vIEBmbG93XG4vLyBBIGRhdGFiYXNlIGFkYXB0ZXIgdGhhdCB3b3JrcyB3aXRoIGRhdGEgZXhwb3J0ZWQgZnJvbSB0aGUgaG9zdGVkXG4vLyBQYXJzZSBkYXRhYmFzZS5cblxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgaW50ZXJzZWN0IGZyb20gJ2ludGVyc2VjdCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgVXRpbHMgZnJvbSAnLi4vVXRpbHMnO1xuaW1wb3J0ICogYXMgU2NoZW1hQ29udHJvbGxlciBmcm9tICcuL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBNb25nb1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFNjaGVtYUNhY2hlIGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL1NjaGVtYUNhY2hlJztcbmltcG9ydCB0eXBlIHsgTG9hZFNjaGVtYU9wdGlvbnMgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB0eXBlIHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi4vT3B0aW9ucyc7XG5pbXBvcnQgdHlwZSB7IFF1ZXJ5T3B0aW9ucywgRnVsbFF1ZXJ5T3B0aW9ucyB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuXG5mdW5jdGlvbiBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3dwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll93cGVybSA9IHsgJGluOiBbbnVsbCwgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbmZ1bmN0aW9uIGFkZFJlYWRBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ19ycGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fcnBlcm0gPSB7ICRpbjogW251bGwsICcqJywgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbi8vIFRyYW5zZm9ybXMgYSBSRVNUIEFQSSBmb3JtYXR0ZWQgQUNMIG9iamVjdCB0byBvdXIgdHdvLWZpZWxkIG1vbmdvIGZvcm1hdC5cbmNvbnN0IHRyYW5zZm9ybU9iamVjdEFDTCA9ICh7IEFDTCwgLi4ucmVzdWx0IH0pID0+IHtcbiAgaWYgKCFBQ0wpIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcmVzdWx0Ll93cGVybSA9IFtdO1xuICByZXN1bHQuX3JwZXJtID0gW107XG5cbiAgZm9yIChjb25zdCBlbnRyeSBpbiBBQ0wpIHtcbiAgICBpZiAoQUNMW2VudHJ5XS5yZWFkKSB7XG4gICAgICByZXN1bHQuX3JwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgICBpZiAoQUNMW2VudHJ5XS53cml0ZSkge1xuICAgICAgcmVzdWx0Ll93cGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmNvbnN0IHNwZWNpYWxRdWVyeUtleXMgPSBbJyRhbmQnLCAnJG9yJywgJyRub3InLCAnX3JwZXJtJywgJ193cGVybSddO1xuY29uc3Qgc3BlY2lhbE1hc3RlclF1ZXJ5S2V5cyA9IFtcbiAgLi4uc3BlY2lhbFF1ZXJ5S2V5cyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX3RvbWJzdG9uZScsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLFxuICAnX3Bhc3N3b3JkX2hpc3RvcnknLFxuXTtcblxuY29uc3QgdmFsaWRhdGVRdWVyeSA9IChxdWVyeTogYW55LCBpc01hc3RlcjogYm9vbGVhbiwgdXBkYXRlOiBib29sZWFuKTogdm9pZCA9PiB7XG4gIGlmIChxdWVyeS5BQ0wpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0Nhbm5vdCBxdWVyeSBvbiBBQ0wuJyk7XG4gIH1cblxuICBpZiAocXVlcnkuJG9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRvciBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBxdWVyeS4kb3IuZm9yRWFjaCh2YWx1ZSA9PiB2YWxpZGF0ZVF1ZXJ5KHZhbHVlLCBpc01hc3RlciwgdXBkYXRlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQmFkICRvciBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRhbmQpIHtcbiAgICBpZiAocXVlcnkuJGFuZCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBxdWVyeS4kYW5kLmZvckVhY2godmFsdWUgPT4gdmFsaWRhdGVRdWVyeSh2YWx1ZSwgaXNNYXN0ZXIsIHVwZGF0ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkYW5kIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJG5vcikge1xuICAgIGlmIChxdWVyeS4kbm9yIGluc3RhbmNlb2YgQXJyYXkgJiYgcXVlcnkuJG5vci5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeS4kbm9yLmZvckVhY2godmFsdWUgPT4gdmFsaWRhdGVRdWVyeSh2YWx1ZSwgaXNNYXN0ZXIsIHVwZGF0ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICdCYWQgJG5vciBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgb2YgYXQgbGVhc3QgMSB2YWx1ZS4nXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIE9iamVjdC5rZXlzKHF1ZXJ5KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKHF1ZXJ5ICYmIHF1ZXJ5W2tleV0gJiYgcXVlcnlba2V5XS4kcmVnZXgpIHtcbiAgICAgIGlmICh0eXBlb2YgcXVlcnlba2V5XS4kb3B0aW9ucyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaWYgKCFxdWVyeVtrZXldLiRvcHRpb25zLm1hdGNoKC9eW2lteHNdKyQvKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICBgQmFkICRvcHRpb25zIHZhbHVlIGZvciBxdWVyeTogJHtxdWVyeVtrZXldLiRvcHRpb25zfWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChcbiAgICAgICFrZXkubWF0Y2goL15bYS16QS1aXVthLXpBLVowLTlfXFwuXSokLykgJiZcbiAgICAgICgoIXNwZWNpYWxRdWVyeUtleXMuaW5jbHVkZXMoa2V5KSAmJiAhaXNNYXN0ZXIgJiYgIXVwZGF0ZSkgfHxcbiAgICAgICAgKHVwZGF0ZSAmJiBpc01hc3RlciAmJiAhc3BlY2lhbE1hc3RlclF1ZXJ5S2V5cy5pbmNsdWRlcyhrZXkpKSlcbiAgICApIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgSW52YWxpZCBrZXkgbmFtZTogJHtrZXl9YCk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIEZpbHRlcnMgb3V0IGFueSBkYXRhIHRoYXQgc2hvdWxkbid0IGJlIG9uIHRoaXMgUkVTVC1mb3JtYXR0ZWQgb2JqZWN0LlxuY29uc3QgZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IChcbiAgaXNNYXN0ZXI6IGJvb2xlYW4sXG4gIGFjbEdyb3VwOiBhbnlbXSxcbiAgYXV0aDogYW55LFxuICBvcGVyYXRpb246IGFueSxcbiAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIgfCBhbnksXG4gIGNsYXNzTmFtZTogc3RyaW5nLFxuICBwcm90ZWN0ZWRGaWVsZHM6IG51bGwgfCBBcnJheTxhbnk+LFxuICBvYmplY3Q6IGFueVxuKSA9PiB7XG4gIGxldCB1c2VySWQgPSBudWxsO1xuICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHVzZXJJZCA9IGF1dGgudXNlci5pZDtcblxuICAvLyByZXBsYWNlIHByb3RlY3RlZEZpZWxkcyB3aGVuIHVzaW5nIHBvaW50ZXItcGVybWlzc2lvbnNcbiAgY29uc3QgcGVybXMgPVxuICAgIHNjaGVtYSAmJiBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zID8gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpIDoge307XG4gIGlmIChwZXJtcykge1xuICAgIGNvbnN0IGlzUmVhZE9wZXJhdGlvbiA9IFsnZ2V0JywgJ2ZpbmQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMTtcblxuICAgIGlmIChpc1JlYWRPcGVyYXRpb24gJiYgcGVybXMucHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBleHRyYWN0IHByb3RlY3RlZEZpZWxkcyBhZGRlZCB3aXRoIHRoZSBwb2ludGVyLXBlcm1pc3Npb24gcHJlZml4XG4gICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybSA9IE9iamVjdC5rZXlzKHBlcm1zLnByb3RlY3RlZEZpZWxkcylcbiAgICAgICAgLmZpbHRlcihrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSlcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIHJldHVybiB7IGtleToga2V5LnN1YnN0cmluZygxMCksIHZhbHVlOiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB9O1xuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbmV3UHJvdGVjdGVkRmllbGRzOiBBcnJheTxzdHJpbmc+W10gPSBbXTtcbiAgICAgIGxldCBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IGZhbHNlO1xuXG4gICAgICAvLyBjaGVjayBpZiB0aGUgb2JqZWN0IGdyYW50cyB0aGUgY3VycmVudCB1c2VyIGFjY2VzcyBiYXNlZCBvbiB0aGUgZXh0cmFjdGVkIGZpZWxkc1xuICAgICAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0uZm9yRWFjaChwb2ludGVyUGVybSA9PiB7XG4gICAgICAgIGxldCBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IGZhbHNlO1xuICAgICAgICBjb25zdCByZWFkVXNlckZpZWxkVmFsdWUgPSBvYmplY3RbcG9pbnRlclBlcm0ua2V5XTtcbiAgICAgICAgaWYgKHJlYWRVc2VyRmllbGRWYWx1ZSkge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlYWRVc2VyRmllbGRWYWx1ZSkpIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gcmVhZFVzZXJGaWVsZFZhbHVlLnNvbWUoXG4gICAgICAgICAgICAgIHVzZXIgPT4gdXNlci5vYmplY3RJZCAmJiB1c2VyLm9iamVjdElkID09PSB1c2VySWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID1cbiAgICAgICAgICAgICAgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkICYmIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCA9PT0gdXNlcklkO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwb2ludGVyUGVybUluY2x1ZGVzVXNlcikge1xuICAgICAgICAgIG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gdHJ1ZTtcbiAgICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwb2ludGVyUGVybS52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBpZiBhdCBsZWFzdCBvbmUgcG9pbnRlci1wZXJtaXNzaW9uIGFmZmVjdGVkIHRoZSBjdXJyZW50IHVzZXJcbiAgICAgIC8vIGludGVyc2VjdCB2cyBwcm90ZWN0ZWRGaWVsZHMgZnJvbSBwcmV2aW91cyBzdGFnZSAoQHNlZSBhZGRQcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAvLyBTZXRzIHRoZW9yeSAoaW50ZXJzZWN0aW9ucyk6IEEgeCAoQiB4IEMpID09IChBIHggQikgeCBDXG4gICAgICBpZiAob3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgJiYgcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHByb3RlY3RlZEZpZWxkcyk7XG4gICAgICB9XG4gICAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgICAgLy8gaWYgdGhlcmUncmUgbm8gcHJvdGN0ZWRGaWVsZHMgYnkgb3RoZXIgY3JpdGVyaWEgKCBpZCAvIHJvbGUgLyBhdXRoKVxuICAgICAgICAgIC8vIHRoZW4gd2UgbXVzdCBpbnRlcnNlY3QgZWFjaCBzZXQgKHBlciB1c2VyRmllbGQpXG4gICAgICAgICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGZpZWxkcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBpc1VzZXJDbGFzcyA9IGNsYXNzTmFtZSA9PT0gJ19Vc2VyJztcblxuICAvKiBzcGVjaWFsIHRyZWF0IGZvciB0aGUgdXNlciBjbGFzczogZG9uJ3QgZmlsdGVyIHByb3RlY3RlZEZpZWxkcyBpZiBjdXJyZW50bHkgbG9nZ2VkaW4gdXNlciBpc1xuICB0aGUgcmV0cmlldmVkIHVzZXIgKi9cbiAgaWYgKCEoaXNVc2VyQ2xhc3MgJiYgdXNlcklkICYmIG9iamVjdC5vYmplY3RJZCA9PT0gdXNlcklkKSkge1xuICAgIHByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuXG4gICAgLy8gZmllbGRzIG5vdCByZXF1ZXN0ZWQgYnkgY2xpZW50IChleGNsdWRlZCksXG4gICAgLy9idXQgd2VyZSBuZWVkZWQgdG8gYXBwbHkgcHJvdGVjdHRlZEZpZWxkc1xuICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcyAmJlxuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMgJiZcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzLmZvckVhY2goayA9PiBkZWxldGUgb2JqZWN0W2tdKTtcbiAgfVxuXG4gIGlmIChpc1VzZXJDbGFzcykge1xuICAgIG9iamVjdC5wYXNzd29yZCA9IG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIGRlbGV0ZSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBkZWxldGUgb2JqZWN0LnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIGlmIChpc01hc3Rlcikge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKGtleS5jaGFyQXQoMCkgPT09ICdfJykge1xuICAgICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgIH1cbiAgfVxuXG4gIGlmICghaXNVc2VyQ2xhc3MpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgaWYgKGFjbEdyb3VwLmluZGV4T2Yob2JqZWN0Lm9iamVjdElkKSA+IC0xKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuLy8gUnVucyBhbiB1cGRhdGUgb24gdGhlIGRhdGFiYXNlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGFuIG9iamVjdCB3aXRoIHRoZSBuZXcgdmFsdWVzIGZvciBmaWVsZFxuLy8gbW9kaWZpY2F0aW9ucyB0aGF0IGRvbid0IGtub3cgdGhlaXIgcmVzdWx0cyBhaGVhZCBvZiB0aW1lLCBsaWtlXG4vLyAnaW5jcmVtZW50Jy5cbi8vIE9wdGlvbnM6XG4vLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbi8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbi8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG5jb25zdCBzcGVjaWFsS2V5c0ZvclVwZGF0ZSA9IFtcbiAgJ19oYXNoZWRfcGFzc3dvcmQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxVcGRhdGVLZXkgPSBrZXkgPT4ge1xuICByZXR1cm4gc3BlY2lhbEtleXNGb3JVcGRhdGUuaW5kZXhPZihrZXkpID49IDA7XG59O1xuXG5mdW5jdGlvbiBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSB7XG4gIHJldHVybiBgX0pvaW46JHtrZXl9OiR7Y2xhc3NOYW1lfWA7XG59XG5cbmNvbnN0IGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUgPSBvYmplY3QgPT4ge1xuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0W2tleV0gJiYgb2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgc3dpdGNoIChvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XS5hbW91bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLmFtb3VudDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5vYmplY3RzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gW107XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICAgICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgICAgICBgVGhlICR7b2JqZWN0W2tleV0uX19vcH0gb3BlcmF0b3IgaXMgbm90IHN1cHBvcnRlZCB5ZXQuYFxuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BdXRoRGF0YSA9IChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSA9PiB7XG4gIGlmIChvYmplY3QuYXV0aERhdGEgJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgT2JqZWN0LmtleXMob2JqZWN0LmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IG9iamVjdC5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICBjb25zdCBmaWVsZE5hbWUgPSBgX2F1dGhfZGF0YV8ke3Byb3ZpZGVyfWA7XG4gICAgICBpZiAocHJvdmlkZXJEYXRhID09IG51bGwpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX19vcDogJ0RlbGV0ZScsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHByb3ZpZGVyRGF0YTtcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdID0geyB0eXBlOiAnT2JqZWN0JyB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIH1cbn07XG4vLyBUcmFuc2Zvcm1zIGEgRGF0YWJhc2UgZm9ybWF0IEFDTCB0byBhIFJFU1QgQVBJIGZvcm1hdCBBQ0xcbmNvbnN0IHVudHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgX3JwZXJtLCBfd3Blcm0sIC4uLm91dHB1dCB9KSA9PiB7XG4gIGlmIChfcnBlcm0gfHwgX3dwZXJtKSB7XG4gICAgb3V0cHV0LkFDTCA9IHt9O1xuXG4gICAgKF9ycGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyByZWFkOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XVsncmVhZCddID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIChfd3Blcm0gfHwgW10pLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKCFvdXRwdXQuQUNMW2VudHJ5XSkge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XSA9IHsgd3JpdGU6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWyd3cml0ZSddID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gb3V0cHV0O1xufTtcblxuLyoqXG4gKiBXaGVuIHF1ZXJ5aW5nLCB0aGUgZmllbGROYW1lIG1heSBiZSBjb21wb3VuZCwgZXh0cmFjdCB0aGUgcm9vdCBmaWVsZE5hbWVcbiAqICAgICBgdGVtcGVyYXR1cmUuY2Vsc2l1c2AgYmVjb21lcyBgdGVtcGVyYXR1cmVgXG4gKiBAcGFyYW0ge3N0cmluZ30gZmllbGROYW1lIHRoYXQgbWF5IGJlIGEgY29tcG91bmQgZmllbGQgbmFtZVxuICogQHJldHVybnMge3N0cmluZ30gdGhlIHJvb3QgbmFtZSBvZiB0aGUgZmllbGRcbiAqL1xuY29uc3QgZ2V0Um9vdEZpZWxkTmFtZSA9IChmaWVsZE5hbWU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbn07XG5cbmNvbnN0IHJlbGF0aW9uU2NoZW1hID0ge1xuICBmaWVsZHM6IHsgcmVsYXRlZElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sIG93bmluZ0lkOiB7IHR5cGU6ICdTdHJpbmcnIH0gfSxcbn07XG5cbmNvbnN0IG1heWJlVHJhbnNmb3JtVXNlcm5hbWVBbmRFbWFpbFRvTG93ZXJDYXNlID0gKG9iamVjdCwgY2xhc3NOYW1lLCBvcHRpb25zKSA9PiB7XG4gIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicgJiYgb3B0aW9ucy5mb3JjZUVtYWlsQW5kVXNlcm5hbWVUb0xvd2VyQ2FzZSkge1xuICAgIGNvbnN0IHRvTG93ZXJDYXNlRmllbGRzID0gWydlbWFpbCcsICd1c2VybmFtZSddO1xuICAgIHRvTG93ZXJDYXNlRmllbGRzLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmICh0eXBlb2Ygb2JqZWN0W2tleV0gPT09ICdzdHJpbmcnKSBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLnRvTG93ZXJDYXNlKCk7XG4gICAgfSk7XG4gIH1cbn07XG5cbmNsYXNzIERhdGFiYXNlQ29udHJvbGxlciB7XG4gIGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyO1xuICBzY2hlbWFDYWNoZTogYW55O1xuICBzY2hlbWFQcm9taXNlOiA/UHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+O1xuICBfdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnk7XG4gIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucztcbiAgaWRlbXBvdGVuY3lPcHRpb25zOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIHRoaXMuYWRhcHRlciA9IGFkYXB0ZXI7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucyA9IHRoaXMub3B0aW9ucy5pZGVtcG90ZW5jeU9wdGlvbnMgfHwge307XG4gICAgLy8gUHJldmVudCBtdXRhYmxlIHRoaXMuc2NoZW1hLCBvdGhlcndpc2Ugb25lIHJlcXVlc3QgY291bGQgdXNlXG4gICAgLy8gbXVsdGlwbGUgc2NoZW1hcywgc28gaW5zdGVhZCB1c2UgbG9hZFNjaGVtYSB0byBnZXQgYSBzY2hlbWEuXG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgfVxuXG4gIGNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gIH1cblxuICBwdXJnZUNvbGxlY3Rpb24oY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHt9KSk7XG4gIH1cblxuICB2YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5jbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgJ2ludmFsaWQgY2xhc3NOYW1lOiAnICsgY2xhc3NOYW1lKVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgc2NoZW1hQ29udHJvbGxlci5cbiAgbG9hZFNjaGVtYShcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYVByb21pc2UgIT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHRoaXMuc2NoZW1hUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gU2NoZW1hQ29udHJvbGxlci5sb2FkKHRoaXMuYWRhcHRlciwgb3B0aW9ucyk7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlLnRoZW4oXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlLFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZVxuICAgICk7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIGxvYWRTY2hlbWFJZk5lZWRlZChcbiAgICBzY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlciA/IFByb21pc2UucmVzb2x2ZShzY2hlbWFDb250cm9sbGVyKSA6IHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgY2xhc3NuYW1lIHRoYXQgaXMgcmVsYXRlZCB0byB0aGUgZ2l2ZW5cbiAgLy8gY2xhc3NuYW1lIHRocm91Z2ggdGhlIGtleS5cbiAgLy8gVE9ETzogbWFrZSB0aGlzIG5vdCBpbiB0aGUgRGF0YWJhc2VDb250cm9sbGVyIGludGVyZmFjZVxuICByZWRpcmVjdENsYXNzTmFtZUZvcktleShjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcpOiBQcm9taXNlPD9zdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4ge1xuICAgICAgdmFyIHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICh0ICE9IG51bGwgJiYgdHlwZW9mIHQgIT09ICdzdHJpbmcnICYmIHQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gdC50YXJnZXRDbGFzcztcbiAgICAgIH1cbiAgICAgIHJldHVybiBjbGFzc05hbWU7XG4gICAgfSk7XG4gIH1cblxuICAvLyBVc2VzIHRoZSBzY2hlbWEgdG8gdmFsaWRhdGUgdGhlIG9iamVjdCAoUkVTVCBBUEkgZm9ybWF0KS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYS5cbiAgLy8gVGhpcyBkb2VzIG5vdCB1cGRhdGUgdGhpcy5zY2hlbWEsIGJlY2F1c2UgaW4gYSBzaXR1YXRpb24gbGlrZSBhXG4gIC8vIGJhdGNoIHJlcXVlc3QsIHRoYXQgY291bGQgY29uZnVzZSBvdGhlciB1c2VycyBvZiB0aGUgc2NoZW1hLlxuICB2YWxpZGF0ZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBxdWVyeTogYW55LFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBsZXQgc2NoZW1hO1xuICAgIGNvbnN0IGFjbCA9IHJ1bk9wdGlvbnMuYWNsO1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwOiBzdHJpbmdbXSA9IGFjbCB8fCBbXTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWEgPSBzO1xuICAgICAgICBpZiAoaXNNYXN0ZXIpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FuQWRkRmllbGQoc2NoZW1hLCBjbGFzc05hbWUsIG9iamVjdCwgYWNsR3JvdXAsIHJ1bk9wdGlvbnMpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB7IGFjbCwgbWFueSwgdXBzZXJ0LCBhZGRzRmllbGQgfTogRnVsbFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHNraXBTYW5pdGl6YXRpb246IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBxdWVyeTtcbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHVwZGF0ZTtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgdXBkYXRlID0gZGVlcGNvcHkodXBkYXRlKTtcbiAgICB2YXIgcmVsYXRpb25VcGRhdGVzID0gW107XG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICd1cGRhdGUnKVxuICAgICAgKVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZSwgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCwgdXBkYXRlKTtcbiAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICd1cGRhdGUnLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmIChhZGRzRmllbGQpIHtcbiAgICAgICAgICAgICAgcXVlcnkgPSB7XG4gICAgICAgICAgICAgICAgJGFuZDogW1xuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAnYWRkRmllbGQnLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCBpc01hc3RlciwgdHJ1ZSk7XG4gICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICAhU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkgJiZcbiAgICAgICAgICAgICAgICAgICFpc1NwZWNpYWxVcGRhdGVLZXkocm9vdEZpZWxkTmFtZSlcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIGZvciAoY29uc3QgdXBkYXRlT3BlcmF0aW9uIGluIHVwZGF0ZSkge1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dICYmXG4gICAgICAgICAgICAgICAgICB0eXBlb2YgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSkuc29tZShcbiAgICAgICAgICAgICAgICAgICAgaW5uZXJLZXkgPT4gaW5uZXJLZXkuaW5jbHVkZXMoJyQnKSB8fCBpbm5lcktleS5pbmNsdWRlcygnLicpXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICAgICAgICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB1cGRhdGUgPSB0cmFuc2Zvcm1PYmplY3RBQ0wodXBkYXRlKTtcbiAgICAgICAgICAgICAgbWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2UodXBkYXRlLCBjbGFzc05hbWUsIHRoaXMub3B0aW9ucyk7XG4gICAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwge30pLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0IHx8ICFyZXN1bHQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAobWFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cHNlcnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCxcbiAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmIChza2lwU2FuaXRpemF0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsVXBkYXRlLCByZXN1bHQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvbGxlY3QgYWxsIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIGxpc3Qgb2YgYWxsIHJlbGF0aW9uIHVwZGF0ZXMgdG8gcGVyZm9ybVxuICAvLyBUaGlzIG11dGF0ZXMgdXBkYXRlLlxuICBjb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogP3N0cmluZywgdXBkYXRlOiBhbnkpIHtcbiAgICB2YXIgb3BzID0gW107XG4gICAgdmFyIGRlbGV0ZU1lID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG5cbiAgICB2YXIgcHJvY2VzcyA9IChvcCwga2V5KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdCYXRjaCcpIHtcbiAgICAgICAgZm9yICh2YXIgeCBvZiBvcC5vcHMpIHtcbiAgICAgICAgICBwcm9jZXNzKHgsIGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gdXBkYXRlKSB7XG4gICAgICBwcm9jZXNzKHVwZGF0ZVtrZXldLCBrZXkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBkZWxldGVNZSkge1xuICAgICAgZGVsZXRlIHVwZGF0ZVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gb3BzO1xuICB9XG5cbiAgLy8gUHJvY2Vzc2VzIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbCB1cGRhdGVzIGhhdmUgYmVlbiBwZXJmb3JtZWRcbiAgaGFuZGxlUmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogc3RyaW5nLCB1cGRhdGU6IGFueSwgb3BzOiBhbnkpIHtcbiAgICB2YXIgcGVuZGluZyA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuICAgIG9wcy5mb3JFYWNoKCh7IGtleSwgb3AgfSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5hZGRSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaCh0aGlzLnJlbW92ZVJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwZW5kaW5nKTtcbiAgfVxuXG4gIC8vIEFkZHMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBhZGQgd2FzIHN1Y2Nlc3NmdWwuXG4gIGFkZFJlbGF0aW9uKGtleTogc3RyaW5nLCBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsIGZyb21JZDogc3RyaW5nLCB0b0lkOiBzdHJpbmcpIHtcbiAgICBjb25zdCBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICBkb2MsXG4gICAgICBkb2MsXG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmVzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgcmVtb3ZlIHdhc1xuICAvLyBzdWNjZXNzZnVsLlxuICByZW1vdmVSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgdmFyIGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICBkb2MsXG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCBjYXJlIGlmIHRoZXkgdHJ5IHRvIGRlbGV0ZSBhIG5vbi1leGlzdGVudCByZWxhdGlvbi5cbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBvYmplY3RzIG1hdGNoZXMgdGhpcyBxdWVyeSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgd2FzXG4gIC8vIGRlbGV0ZWQuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuICAvLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4gIC8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG4gIGRlc3Ryb3koXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2RlbGV0ZScpXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAnZGVsZXRlJyxcbiAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZGVsZXRlIGJ5IHF1ZXJ5XG4gICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICB9XG4gICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBmYWxzZSk7XG4gICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUpXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgIC8vIHdpbGwgbGlrZWx5IG5lZWQgcmV2aXNpdGluZy5cbiAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocGFyc2VGb3JtYXRTY2hlbWEgPT5cbiAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBwYXJzZUZvcm1hdFNjaGVtYSxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBXaGVuIGRlbGV0aW5nIHNlc3Npb25zIHdoaWxlIGNoYW5naW5nIHBhc3N3b3JkcywgZG9uJ3QgdGhyb3cgYW4gZXJyb3IgaWYgdGhleSBkb24ndCBoYXZlIGFueSBzZXNzaW9ucy5cbiAgICAgICAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBJbnNlcnRzIGFuIG9iamVjdCBpbnRvIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgc2F2ZWQuXG4gIGNyZWF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICBjb25zdCBvcmlnaW5hbE9iamVjdCA9IG9iamVjdDtcbiAgICBvYmplY3QgPSB0cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcbiAgICBtYXliZVRyYW5zZm9ybVVzZXJuYW1lQW5kRW1haWxUb0xvd2VyQ2FzZShvYmplY3QsIGNsYXNzTmFtZSwgdGhpcy5vcHRpb25zKTtcbiAgICBvYmplY3QuY3JlYXRlZEF0ID0geyBpc286IG9iamVjdC5jcmVhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG4gICAgb2JqZWN0LnVwZGF0ZWRBdCA9IHsgaXNvOiBvYmplY3QudXBkYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuXG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIGNvbnN0IHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWUsIG51bGwsIG9iamVjdCk7XG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2NyZWF0ZScpXG4gICAgICAgIClcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSkpXG4gICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgICAgICAgICAgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZShvYmplY3QpO1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBTY2hlbWFDb250cm9sbGVyLmNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoc2NoZW1hKSxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbE9iamVjdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBvYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzXG4gICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdCwgcmVzdWx0Lm9wc1swXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY2FuQWRkRmllbGQoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjbGFzc1NjaGVtYSA9IHNjaGVtYS5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgaWYgKCFjbGFzc1NjaGVtYSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xuICAgIGNvbnN0IHNjaGVtYUZpZWxkcyA9IE9iamVjdC5rZXlzKGNsYXNzU2NoZW1hLmZpZWxkcyk7XG4gICAgY29uc3QgbmV3S2V5cyA9IGZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgdW5zZXRcbiAgICAgIGlmIChvYmplY3RbZmllbGRdICYmIG9iamVjdFtmaWVsZF0uX19vcCAmJiBvYmplY3RbZmllbGRdLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzY2hlbWFGaWVsZHMuaW5kZXhPZihnZXRSb290RmllbGROYW1lKGZpZWxkKSkgPCAwO1xuICAgIH0pO1xuICAgIGlmIChuZXdLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIGFkZHMgYSBtYXJrZXIgdGhhdCBuZXcgZmllbGQgaXMgYmVpbmcgYWRkaW5nIGR1cmluZyB1cGRhdGVcbiAgICAgIHJ1bk9wdGlvbnMuYWRkc0ZpZWxkID0gdHJ1ZTtcblxuICAgICAgY29uc3QgYWN0aW9uID0gcnVuT3B0aW9ucy5hY3Rpb247XG4gICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnYWRkRmllbGQnLCBhY3Rpb24pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXb24ndCBkZWxldGUgY29sbGVjdGlvbnMgaW4gdGhlIHN5c3RlbSBuYW1lc3BhY2VcbiAgLyoqXG4gICAqIERlbGV0ZSBhbGwgY2xhc3NlcyBhbmQgY2xlYXJzIHRoZSBzY2hlbWEgY2FjaGVcbiAgICpcbiAgICogQHBhcmFtIHtib29sZWFufSBmYXN0IHNldCB0byB0cnVlIGlmIGl0J3Mgb2sgdG8ganVzdCBkZWxldGUgcm93cyBhbmQgbm90IGluZGV4ZXNcbiAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59IHdoZW4gdGhlIGRlbGV0aW9ucyBjb21wbGV0ZXNcbiAgICovXG4gIGRlbGV0ZUV2ZXJ5dGhpbmcoZmFzdDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVBbGxDbGFzc2VzKGZhc3QpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiByZWxhdGVkIGlkcyBnaXZlbiBhbiBvd25pbmcgaWQuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICByZWxhdGVkSWRzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nLFxuICAgIG93bmluZ0lkOiBzdHJpbmcsXG4gICAgcXVlcnlPcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxBcnJheTxzdHJpbmc+PiB7XG4gICAgY29uc3QgeyBza2lwLCBsaW1pdCwgc29ydCB9ID0gcXVlcnlPcHRpb25zO1xuICAgIGNvbnN0IGZpbmRPcHRpb25zID0ge307XG4gICAgaWYgKHNvcnQgJiYgc29ydC5jcmVhdGVkQXQgJiYgdGhpcy5hZGFwdGVyLmNhblNvcnRPbkpvaW5UYWJsZXMpIHtcbiAgICAgIGZpbmRPcHRpb25zLnNvcnQgPSB7IF9pZDogc29ydC5jcmVhdGVkQXQgfTtcbiAgICAgIGZpbmRPcHRpb25zLmxpbWl0ID0gbGltaXQ7XG4gICAgICBmaW5kT3B0aW9ucy5za2lwID0gc2tpcDtcbiAgICAgIHF1ZXJ5T3B0aW9ucy5za2lwID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksIHJlbGF0aW9uU2NoZW1hLCB7IG93bmluZ0lkIH0sIGZpbmRPcHRpb25zKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LnJlbGF0ZWRJZCkpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiBvd25pbmcgaWRzIGdpdmVuIHNvbWUgcmVsYXRlZCBpZHMuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICBvd25pbmdJZHMoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nLCByZWxhdGVkSWRzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChcbiAgICAgICAgam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICB7IHJlbGF0ZWRJZDogeyAkaW46IHJlbGF0ZWRJZHMgfSB9LFxuICAgICAgICB7IGtleXM6IFsnb3duaW5nSWQnXSB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQub3duaW5nSWQpKTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkaW4gb24gcmVsYXRpb24gZmllbGRzLCBvclxuICAvLyBlcXVhbC10by1wb2ludGVyIGNvbnN0cmFpbnRzIG9uIHJlbGF0aW9uIGZpZWxkcy5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IGFueSwgc2NoZW1hOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIFNlYXJjaCBmb3IgYW4gaW4tcmVsYXRpb24gb3IgZXF1YWwtdG8tcmVsYXRpb25cbiAgICAvLyBNYWtlIGl0IHNlcXVlbnRpYWwgZm9yIG5vdywgbm90IHN1cmUgb2YgcGFyYWxsZWl6YXRpb24gc2lkZSBlZmZlY3RzXG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgY29uc3Qgb3JzID0gcXVlcnlbJyRvciddO1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBvcnMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJG9yJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5WyckYW5kJ10pIHtcbiAgICAgIGNvbnN0IGFuZHMgPSBxdWVyeVsnJGFuZCddO1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBhbmRzLm1hcCgoYVF1ZXJ5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBhUXVlcnksIHNjaGVtYSkudGhlbihhUXVlcnkgPT4ge1xuICAgICAgICAgICAgcXVlcnlbJyRhbmQnXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IHByb21pc2VzID0gT2JqZWN0LmtleXMocXVlcnkpLm1hcChrZXkgPT4ge1xuICAgICAgY29uc3QgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKCF0IHx8IHQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIGxldCBxdWVyaWVzOiA/KGFueVtdKSA9IG51bGw7XG4gICAgICBpZiAoXG4gICAgICAgIHF1ZXJ5W2tleV0gJiZcbiAgICAgICAgKHF1ZXJ5W2tleV1bJyRpbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5lJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldLl9fdHlwZSA9PSAnUG9pbnRlcicpXG4gICAgICApIHtcbiAgICAgICAgLy8gQnVpbGQgdGhlIGxpc3Qgb2YgcXVlcmllc1xuICAgICAgICBxdWVyaWVzID0gT2JqZWN0LmtleXMocXVlcnlba2V5XSkubWFwKGNvbnN0cmFpbnRLZXkgPT4ge1xuICAgICAgICAgIGxldCByZWxhdGVkSWRzO1xuICAgICAgICAgIGxldCBpc05lZ2F0aW9uID0gZmFsc2U7XG4gICAgICAgICAgaWYgKGNvbnN0cmFpbnRLZXkgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckaW4nKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJGluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmluJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJG5pbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5lJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV1bJyRuZSddLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaXNOZWdhdGlvbixcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyaWVzID0gW3sgaXNOZWdhdGlvbjogZmFsc2UsIHJlbGF0ZWRJZHM6IFtdIH1dO1xuICAgICAgfVxuXG4gICAgICAvLyByZW1vdmUgdGhlIGN1cnJlbnQgcXVlcnlLZXkgYXMgd2UgZG9uLHQgbmVlZCBpdCBhbnltb3JlXG4gICAgICBkZWxldGUgcXVlcnlba2V5XTtcbiAgICAgIC8vIGV4ZWN1dGUgZWFjaCBxdWVyeSBpbmRlcGVuZGVudGx5IHRvIGJ1aWxkIHRoZSBsaXN0IG9mXG4gICAgICAvLyAkaW4gLyAkbmluXG4gICAgICBjb25zdCBwcm9taXNlcyA9IHF1ZXJpZXMubWFwKHEgPT4ge1xuICAgICAgICBpZiAoIXEpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMub3duaW5nSWRzKGNsYXNzTmFtZSwga2V5LCBxLnJlbGF0ZWRJZHMpLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBpZiAocS5pc05lZ2F0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLmFkZE5vdEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRyZWxhdGVkVG9cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBxdWVyeU9wdGlvbnM6IGFueSk6ID9Qcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5Wyckb3InXS5tYXAoYVF1ZXJ5ID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBhUXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJGFuZCddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIHZhciByZWxhdGVkVG8gPSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgIGlmIChyZWxhdGVkVG8pIHtcbiAgICAgIHJldHVybiB0aGlzLnJlbGF0ZWRJZHMoXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICByZWxhdGVkVG8ua2V5LFxuICAgICAgICByZWxhdGVkVG8ub2JqZWN0Lm9iamVjdElkLFxuICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgIClcbiAgICAgICAgLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBkZWxldGUgcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7fSk7XG4gICAgfVxuICB9XG5cbiAgYWRkSW5PYmplY3RJZHNJZHMoaWRzOiA/QXJyYXk8c3RyaW5nPiA9IG51bGwsIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tU3RyaW5nOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnID8gW3F1ZXJ5Lm9iamVjdElkXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUVxOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGVxJ10gPyBbcXVlcnkub2JqZWN0SWRbJyRlcSddXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUluOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGluJ10gPyBxdWVyeS5vYmplY3RJZFsnJGluJ10gOiBudWxsO1xuXG4gICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgY29uc3QgYWxsSWRzOiBBcnJheTxBcnJheTxzdHJpbmc+PiA9IFtpZHNGcm9tU3RyaW5nLCBpZHNGcm9tRXEsIGlkc0Zyb21JbiwgaWRzXS5maWx0ZXIoXG4gICAgICBsaXN0ID0+IGxpc3QgIT09IG51bGxcbiAgICApO1xuICAgIGNvbnN0IHRvdGFsTGVuZ3RoID0gYWxsSWRzLnJlZHVjZSgobWVtbywgbGlzdCkgPT4gbWVtbyArIGxpc3QubGVuZ3RoLCAwKTtcblxuICAgIGxldCBpZHNJbnRlcnNlY3Rpb24gPSBbXTtcbiAgICBpZiAodG90YWxMZW5ndGggPiAxMjUpIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdC5iaWcoYWxsSWRzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0KGFsbElkcyk7XG4gICAgfVxuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG4gICAgcXVlcnkub2JqZWN0SWRbJyRpbiddID0gaWRzSW50ZXJzZWN0aW9uO1xuXG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzOiBzdHJpbmdbXSA9IFtdLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbU5pbiA9IHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPyBxdWVyeS5vYmplY3RJZFsnJG5pbiddIDogW107XG4gICAgbGV0IGFsbElkcyA9IFsuLi5pZHNGcm9tTmluLCAuLi5pZHNdLmZpbHRlcihsaXN0ID0+IGxpc3QgIT09IG51bGwpO1xuXG4gICAgLy8gbWFrZSBhIHNldCBhbmQgc3ByZWFkIHRvIHJlbW92ZSBkdXBsaWNhdGVzXG4gICAgYWxsSWRzID0gWy4uLm5ldyBTZXQoYWxsSWRzKV07XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA9IGFsbElkcztcbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBSdW5zIGEgcXVlcnkgb24gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGEgbGlzdCBvZiBpdGVtcy5cbiAgLy8gT3B0aW9uczpcbiAgLy8gICBza2lwICAgIG51bWJlciBvZiByZXN1bHRzIHRvIHNraXAuXG4gIC8vICAgbGltaXQgICBsaW1pdCB0byB0aGlzIG51bWJlciBvZiByZXN1bHRzLlxuICAvLyAgIHNvcnQgICAgYW4gb2JqZWN0IHdoZXJlIGtleXMgYXJlIHRoZSBmaWVsZHMgdG8gc29ydCBieS5cbiAgLy8gICAgICAgICAgIHRoZSB2YWx1ZSBpcyArMSBmb3IgYXNjZW5kaW5nLCAtMSBmb3IgZGVzY2VuZGluZy5cbiAgLy8gICBjb3VudCAgIHJ1biBhIGNvdW50IGluc3RlYWQgb2YgcmV0dXJuaW5nIHJlc3VsdHMuXG4gIC8vICAgYWNsICAgICByZXN0cmljdCB0aGlzIG9wZXJhdGlvbiB3aXRoIGFuIEFDTCBmb3IgdGhlIHByb3ZpZGVkIGFycmF5XG4gIC8vICAgICAgICAgICBvZiB1c2VyIG9iamVjdElkcyBhbmQgcm9sZXMuIGFjbDogbnVsbCBtZWFucyBubyB1c2VyLlxuICAvLyAgICAgICAgICAgd2hlbiB0aGlzIGZpZWxkIGlzIG5vdCBwcmVzZW50LCBkb24ndCBkbyBhbnl0aGluZyByZWdhcmRpbmcgQUNMcy5cbiAgLy8gIGNhc2VJbnNlbnNpdGl2ZSBtYWtlIHN0cmluZyBjb21wYXJpc29ucyBjYXNlIGluc2Vuc2l0aXZlXG4gIC8vIFRPRE86IG1ha2UgdXNlcklkcyBub3QgbmVlZGVkIGhlcmUuIFRoZSBkYiBhZGFwdGVyIHNob3VsZG4ndCBrbm93XG4gIC8vIGFueXRoaW5nIGFib3V0IHVzZXJzLCBpZGVhbGx5LiBUaGVuLCBpbXByb3ZlIHRoZSBmb3JtYXQgb2YgdGhlIEFDTFxuICAvLyBhcmcgdG8gd29yayBsaWtlIHRoZSBvdGhlcnMuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBhY2wsXG4gICAgICBzb3J0ID0ge30sXG4gICAgICBjb3VudCxcbiAgICAgIGtleXMsXG4gICAgICBvcCxcbiAgICAgIGRpc3RpbmN0LFxuICAgICAgcGlwZWxpbmUsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgIGhpbnQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUgPSBmYWxzZSxcbiAgICAgIGV4cGxhaW4sXG4gICAgfTogYW55ID0ge30sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIG9wID1cbiAgICAgIG9wIHx8ICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT0gJ3N0cmluZycgJiYgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMSA/ICdnZXQnIDogJ2ZpbmQnKTtcbiAgICAvLyBDb3VudCBvcGVyYXRpb24gaWYgY291bnRpbmdcbiAgICBvcCA9IGNvdW50ID09PSB0cnVlID8gJ2NvdW50JyA6IG9wO1xuXG4gICAgbGV0IGNsYXNzRXhpc3RzID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgLy9BbGxvdyB2b2xhdGlsZSBjbGFzc2VzIGlmIHF1ZXJ5aW5nIHdpdGggTWFzdGVyIChmb3IgX1B1c2hTdGF0dXMpXG4gICAgICAvL1RPRE86IE1vdmUgdm9sYXRpbGUgY2xhc3NlcyBjb25jZXB0IGludG8gbW9uZ28gYWRhcHRlciwgcG9zdGdyZXMgYWRhcHRlciBzaG91bGRuJ3QgY2FyZVxuICAgICAgLy90aGF0IGFwaS5wYXJzZS5jb20gYnJlYWtzIHdoZW4gX1B1c2hTdGF0dXMgZXhpc3RzIGluIG1vbmdvLlxuICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGlzTWFzdGVyKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIC8vIEJlaGF2aW9yIGZvciBub24tZXhpc3RlbnQgY2xhc3NlcyBpcyBraW5kYSB3ZWlyZCBvbiBQYXJzZS5jb20uIFByb2JhYmx5IGRvZXNuJ3QgbWF0dGVyIHRvbyBtdWNoLlxuICAgICAgICAgIC8vIEZvciBub3csIHByZXRlbmQgdGhlIGNsYXNzIGV4aXN0cyBidXQgaGFzIG5vIG9iamVjdHMsXG4gICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNsYXNzRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgIC8vIFBhcnNlLmNvbSB0cmVhdHMgcXVlcmllcyBvbiBfY3JlYXRlZF9hdCBhbmQgX3VwZGF0ZWRfYXQgYXMgaWYgdGhleSB3ZXJlIHF1ZXJpZXMgb24gY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQsXG4gICAgICAgICAgLy8gc28gZHVwbGljYXRlIHRoYXQgYmVoYXZpb3IgaGVyZS4gSWYgYm90aCBhcmUgc3BlY2lmaWVkLCB0aGUgY29ycmVjdCBiZWhhdmlvciB0byBtYXRjaCBQYXJzZS5jb20gaXMgdG9cbiAgICAgICAgICAvLyB1c2UgdGhlIG9uZSB0aGF0IGFwcGVhcnMgZmlyc3QgaW4gdGhlIHNvcnQgbGlzdC5cbiAgICAgICAgICBpZiAoc29ydC5fY3JlYXRlZF9hdCkge1xuICAgICAgICAgICAgc29ydC5jcmVhdGVkQXQgPSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgZGVsZXRlIHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzb3J0Ll91cGRhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LnVwZGF0ZWRBdCA9IHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcXVlcnlPcHRpb25zID0ge1xuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgc29ydCxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICBjYXNlSW5zZW5zaXRpdmU6IHRoaXMub3B0aW9ucy5kaXNhYmxlQ2FzZUluc2Vuc2l0aXZpdHkgPyBmYWxzZSA6IGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgICAgfTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzb3J0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYENhbm5vdCBzb3J0IGJ5ICR7ZmllbGROYW1lfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wKVxuICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucykpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHM7XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgLyogRG9uJ3QgdXNlIHByb2plY3Rpb25zIHRvIG9wdGltaXplIHRoZSBwcm90ZWN0ZWRGaWVsZHMgc2luY2UgdGhlIHByb3RlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgYmFzZWQgb24gcG9pbnRlci1wZXJtaXNzaW9ucyBhcmUgZGV0ZXJtaW5lZCBhZnRlciBxdWVyeWluZy4gVGhlIGZpbHRlcmluZyBjYW5cbiAgICAgICAgICAgICAgICAgIG92ZXJ3cml0ZSB0aGUgcHJvdGVjdGVkIGZpZWxkcy4gKi9cbiAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ2dldCcpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAndXBkYXRlJyB8fCBvcCA9PT0gJ2RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBmYWxzZSk7XG4gICAgICAgICAgICAgIGlmIChjb3VudCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNvdW50KFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIGhpbnRcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGRpc3RpbmN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRpc3RpbmN0KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgZGlzdGluY3QpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChwaXBlbGluZSkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5hZ2dyZWdhdGUoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBwaXBlbGluZSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICAgICAgICAgIGV4cGxhaW5cbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAgICAgICAgIC5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKVxuICAgICAgICAgICAgICAgICAgLnRoZW4ob2JqZWN0cyA9PlxuICAgICAgICAgICAgICAgICAgICBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdCA9IHVudHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgICAgICAgICAgICBpc01hc3RlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZGVsZXRlU2NoZW1hKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWFDb250cm9sbGVyID0gcztcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5hZGFwdGVyLmNvdW50KGNsYXNzTmFtZSwgeyBmaWVsZHM6IHt9IH0sIG51bGwsICcnLCBmYWxzZSkpXG4gICAgICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICAgICAgaWYgKGNvdW50ID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgMjU1LFxuICAgICAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gaXMgbm90IGVtcHR5LCBjb250YWlucyAke2NvdW50fSBvYmplY3RzLCBjYW5ub3QgZHJvcCBzY2hlbWEuYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhjbGFzc05hbWUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4od2FzUGFyc2VDb2xsZWN0aW9uID0+IHtcbiAgICAgICAgICAgIGlmICh3YXNQYXJzZUNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICAgICAgICAgIGZpZWxkTmFtZSA9PiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLm1hcChuYW1lID0+XG4gICAgICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3Moam9pblRhYmxlTmFtZShjbGFzc05hbWUsIG5hbWUpKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBTY2hlbWFDYWNoZS5kZWwoY2xhc3NOYW1lKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlci5yZWxvYWREYXRhKCk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBUaGlzIGhlbHBzIHRvIGNyZWF0ZSBpbnRlcm1lZGlhdGUgb2JqZWN0cyBmb3Igc2ltcGxlciBjb21wYXJpc29uIG9mXG4gIC8vIGtleSB2YWx1ZSBwYWlycyB1c2VkIGluIHF1ZXJ5IG9iamVjdHMuIEVhY2gga2V5IHZhbHVlIHBhaXIgd2lsbCByZXByZXNlbnRlZFxuICAvLyBpbiBhIHNpbWlsYXIgd2F5IHRvIGpzb25cbiAgb2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxdWVyeTogYW55KTogQXJyYXk8c3RyaW5nPiB7XG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHF1ZXJ5KS5tYXAoYSA9PiBhLm1hcChzID0+IEpTT04uc3RyaW5naWZ5KHMpKS5qb2luKCc6JykpO1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgT1Igb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZU9yT3BlcmF0aW9uKHF1ZXJ5OiB7ICRvcjogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRvcikge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJG9yLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgbG9uZ2VyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJG9yLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kb3IubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRvclswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRvcjtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgQU5EIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VBbmRPcGVyYXRpb24ocXVlcnk6IHsgJGFuZDogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRhbmQpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRhbmQubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBzaG9ydGVyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJGFuZC5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kYW5kLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kYW5kWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJGFuZDtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gQ29uc3RyYWludHMgcXVlcnkgdXNpbmcgQ0xQJ3MgcG9pbnRlciBwZXJtaXNzaW9ucyAoUFApIGlmIGFueS5cbiAgLy8gMS4gRXRyYWN0IHRoZSB1c2VyIGlkIGZyb20gY2FsbGVyJ3MgQUNMZ3JvdXA7XG4gIC8vIDIuIEV4Y3RyYWN0IGEgbGlzdCBvZiBmaWVsZCBuYW1lcyB0aGF0IGFyZSBQUCBmb3IgdGFyZ2V0IGNvbGxlY3Rpb24gYW5kIG9wZXJhdGlvbjtcbiAgLy8gMy4gQ29uc3RyYWludCB0aGUgb3JpZ2luYWwgcXVlcnkgc28gdGhhdCBlYWNoIFBQIGZpZWxkIG11c3RcbiAgLy8gcG9pbnQgdG8gY2FsbGVyJ3MgaWQgKG9yIGNvbnRhaW4gaXQgaW4gY2FzZSBvZiBQUCBmaWVsZCBiZWluZyBhbiBhcnJheSlcbiAgYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW11cbiAgKTogYW55IHtcbiAgICAvLyBDaGVjayBpZiBjbGFzcyBoYXMgcHVibGljIHBlcm1pc3Npb24gZm9yIG9wZXJhdGlvblxuICAgIC8vIElmIHRoZSBCYXNlQ0xQIHBhc3MsIGxldCBnbyB0aHJvdWdoXG4gICAgaWYgKHNjaGVtYS50ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcblxuICAgIGNvbnN0IHVzZXJBQ0wgPSBhY2xHcm91cC5maWx0ZXIoYWNsID0+IHtcbiAgICAgIHJldHVybiBhY2wuaW5kZXhPZigncm9sZTonKSAhPSAwICYmIGFjbCAhPSAnKic7XG4gICAgfSk7XG5cbiAgICBjb25zdCBncm91cEtleSA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICBjb25zdCBwZXJtRmllbGRzID0gW107XG5cbiAgICBpZiAocGVybXNbb3BlcmF0aW9uXSAmJiBwZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpIHtcbiAgICAgIHBlcm1GaWVsZHMucHVzaCguLi5wZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpO1xuICAgIH1cblxuICAgIGlmIChwZXJtc1tncm91cEtleV0pIHtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICAgIGlmICghcGVybUZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwZXJtRmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICBpZiAocGVybUZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgICAvLyBObyB1c2VyIHNldCByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAvLyBJZiB0aGUgbGVuZ3RoIGlzID4gMSwgdGhhdCBtZWFucyB3ZSBkaWRuJ3QgZGUtZHVwZSB1c2VycyBjb3JyZWN0bHlcbiAgICAgIGlmICh1c2VyQUNMLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXJJZCA9IHVzZXJBQ0xbMF07XG4gICAgICBjb25zdCB1c2VyUG9pbnRlciA9IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHF1ZXJpZXMgPSBwZXJtRmllbGRzLm1hcChrZXkgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZERlc2NyaXB0b3IgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgICAgY29uc3QgZmllbGRUeXBlID1cbiAgICAgICAgICBmaWVsZERlc2NyaXB0b3IgJiZcbiAgICAgICAgICB0eXBlb2YgZmllbGREZXNjcmlwdG9yID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZERlc2NyaXB0b3IsICd0eXBlJylcbiAgICAgICAgICAgID8gZmllbGREZXNjcmlwdG9yLnR5cGVcbiAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBsZXQgcXVlcnlDbGF1c2U7XG5cbiAgICAgICAgaWYgKGZpZWxkVHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3Igc2luZ2xlIHBvaW50ZXIgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3IgdXNlcnMtYXJyYXkgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHsgJGFsbDogW3VzZXJQb2ludGVyXSB9IH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnT2JqZWN0Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIG9iamVjdCBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogdXNlclBvaW50ZXIgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUaGlzIG1lYW5zIHRoYXQgdGhlcmUgaXMgYSBDTFAgZmllbGQgb2YgYW4gdW5leHBlY3RlZCB0eXBlLiBUaGlzIGNvbmRpdGlvbiBzaG91bGQgbm90IGhhcHBlbiwgd2hpY2ggaXNcbiAgICAgICAgICAvLyB3aHkgaXMgYmVpbmcgdHJlYXRlZCBhcyBhbiBlcnJvci5cbiAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgIGBBbiB1bmV4cGVjdGVkIGNvbmRpdGlvbiBvY2N1cnJlZCB3aGVuIHJlc29sdmluZyBwb2ludGVyIHBlcm1pc3Npb25zOiAke2NsYXNzTmFtZX0gJHtrZXl9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgY29uc3RyYWludCBvbiB0aGUga2V5LCB1c2UgdGhlICRhbmRcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChxdWVyeSwga2V5KSkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUFuZE9wZXJhdGlvbih7ICRhbmQ6IFtxdWVyeUNsYXVzZSwgcXVlcnldIH0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGFkZCB0aGUgY29uc3RhaW50XG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgcXVlcnlDbGF1c2UpO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBxdWVyaWVzLmxlbmd0aCA9PT0gMSA/IHF1ZXJpZXNbMF0gOiB0aGlzLnJlZHVjZU9yT3BlcmF0aW9uKHsgJG9yOiBxdWVyaWVzIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICB9XG5cbiAgYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyIHwgYW55LFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnkgPSB7fSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICBxdWVyeU9wdGlvbnM6IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fVxuICApOiBudWxsIHwgc3RyaW5nW10ge1xuICAgIGNvbnN0IHBlcm1zID1cbiAgICAgIHNjaGVtYSAmJiBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zXG4gICAgICAgID8gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpXG4gICAgICAgIDogc2NoZW1hO1xuICAgIGlmICghcGVybXMpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gcGVybXMucHJvdGVjdGVkRmllbGRzO1xuICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSByZXR1cm4gbnVsbDtcblxuICAgIGlmIChhY2xHcm91cC5pbmRleE9mKHF1ZXJ5Lm9iamVjdElkKSA+IC0xKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIGZvciBxdWVyaWVzIHdoZXJlIFwia2V5c1wiIGFyZSBzZXQgYW5kIGRvIG5vdCBpbmNsdWRlIGFsbCAndXNlckZpZWxkJzp7ZmllbGR9LFxuICAgIC8vIHdlIGhhdmUgdG8gdHJhbnNwYXJlbnRseSBpbmNsdWRlIGl0LCBhbmQgdGhlbiByZW1vdmUgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnRcbiAgICAvLyBCZWNhdXNlIGlmIHN1Y2gga2V5IG5vdCBwcm9qZWN0ZWQgdGhlIHBlcm1pc3Npb24gd29uJ3QgYmUgZW5mb3JjZWQgcHJvcGVybHlcbiAgICAvLyBQUyB0aGlzIGlzIGNhbGxlZCB3aGVuICdleGNsdWRlS2V5cycgYWxyZWFkeSByZWR1Y2VkIHRvICdrZXlzJ1xuICAgIGNvbnN0IHByZXNlcnZlS2V5cyA9IHF1ZXJ5T3B0aW9ucy5rZXlzO1xuXG4gICAgLy8gdGhlc2UgYXJlIGtleXMgdGhhdCBuZWVkIHRvIGJlIGluY2x1ZGVkIG9ubHlcbiAgICAvLyB0byBiZSBhYmxlIHRvIGFwcGx5IHByb3RlY3RlZEZpZWxkcyBieSBwb2ludGVyXG4gICAgLy8gYW5kIHRoZW4gdW5zZXQgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnQgKGxhdGVyIGluICBmaWx0ZXJTZW5zaXRpdmVGaWVsZHMpXG4gICAgY29uc3Qgc2VydmVyT25seUtleXMgPSBbXTtcblxuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWQgPSBhdXRoLnVzZXI7XG5cbiAgICAvLyBtYXAgdG8gYWxsb3cgY2hlY2sgd2l0aG91dCBhcnJheSBzZWFyY2hcbiAgICBjb25zdCByb2xlcyA9IChhdXRoLnVzZXJSb2xlcyB8fCBbXSkucmVkdWNlKChhY2MsIHIpID0+IHtcbiAgICAgIGFjY1tyXSA9IHByb3RlY3RlZEZpZWxkc1tyXTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuXG4gICAgLy8gYXJyYXkgb2Ygc2V0cyBvZiBwcm90ZWN0ZWQgZmllbGRzLiBzZXBhcmF0ZSBpdGVtIGZvciBlYWNoIGFwcGxpY2FibGUgY3JpdGVyaWFcbiAgICBjb25zdCBwcm90ZWN0ZWRLZXlzU2V0cyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBza2lwIHVzZXJGaWVsZHNcbiAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKSB7XG4gICAgICAgIGlmIChwcmVzZXJ2ZUtleXMpIHtcbiAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBrZXkuc3Vic3RyaW5nKDEwKTtcbiAgICAgICAgICBpZiAoIXByZXNlcnZlS2V5cy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICAgICAgICAvLyAxLiBwdXQgaXQgdGhlcmUgdGVtcG9yYXJpbHlcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucy5rZXlzICYmIHF1ZXJ5T3B0aW9ucy5rZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIC8vIDIuIHByZXNlcnZlIGl0IGRlbGV0ZSBsYXRlclxuICAgICAgICAgICAgc2VydmVyT25seUtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gYWRkIHB1YmxpYyB0aWVyXG4gICAgICBpZiAoa2V5ID09PSAnKicpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgICBpZiAoa2V5ID09PSAnYXV0aGVudGljYXRlZCcpIHtcbiAgICAgICAgICAvLyBmb3IgbG9nZ2VkIGluIHVzZXJzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocm9sZXNba2V5XSAmJiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSkge1xuICAgICAgICAgIC8vIGFkZCBhcHBsaWNhYmxlIHJvbGVzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChyb2xlc1trZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGNoZWNrIGlmIHRoZXJlJ3MgYSBydWxlIGZvciBjdXJyZW50IHVzZXIncyBpZFxuICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICBjb25zdCB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG4gICAgICBpZiAocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gcHJlc2VydmUgZmllbGRzIHRvIGJlIHJlbW92ZWQgYmVmb3JlIHNlbmRpbmcgcmVzcG9uc2UgdG8gY2xpZW50XG4gICAgaWYgKHNlcnZlck9ubHlLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzID0gc2VydmVyT25seUtleXM7XG4gICAgfVxuXG4gICAgbGV0IHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzU2V0cy5yZWR1Y2UoKGFjYywgbmV4dCkgPT4ge1xuICAgICAgaWYgKG5leHQpIHtcbiAgICAgICAgYWNjLnB1c2goLi4ubmV4dCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIFtdKTtcblxuICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICBwcm90ZWN0ZWRLZXlzU2V0cy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvdGVjdGVkS2V5cztcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKS50aGVuKHRyYW5zYWN0aW9uYWxTZXNzaW9uID0+IHtcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gdHJhbnNhY3Rpb25hbFNlc3Npb247XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBjb21taXQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGFib3J0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICAvLyBUT0RPOiBjcmVhdGUgaW5kZXhlcyBvbiBmaXJzdCBjcmVhdGlvbiBvZiBhIF9Vc2VyIG9iamVjdC4gT3RoZXJ3aXNlIGl0J3MgaW1wb3NzaWJsZSB0b1xuICAvLyBoYXZlIGEgUGFyc2UgYXBwIHdpdGhvdXQgaXQgaGF2aW5nIGEgX1VzZXIgY29sbGVjdGlvbi5cbiAgYXN5bmMgcGVyZm9ybUluaXRpYWxpemF0aW9uKCkge1xuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIGNvbnN0IHJlcXVpcmVkVXNlckZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Vc2VyLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkUm9sZUZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Sb2xlLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgICB9LFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1VzZXInKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX0lkZW1wb3RlbmN5JykpO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXJuYW1lczogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBpZiAoIXRoaXMub3B0aW9ucy5kaXNhYmxlQ2FzZUluc2Vuc2l0aXZpdHkpIHtcbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10sICdjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lJywgdHJ1ZSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIHVzZXJuYW1lIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuXG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddLCAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsIHRydWUpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSBlbWFpbCBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlciBlbWFpbCBhZGRyZXNzZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Sb2xlJywgcmVxdWlyZWRSb2xlRmllbGRzLCBbJ25hbWUnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3Igcm9sZSBuYW1lOiAnLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgLmVuc3VyZVVuaXF1ZW5lc3MoJ19JZGVtcG90ZW5jeScsIHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMsIFsncmVxSWQnXSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIGlkZW1wb3RlbmN5IHJlcXVlc3QgSUQ6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcblxuICAgIGNvbnN0IGlzTW9uZ29BZGFwdGVyID0gdGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgTW9uZ29TdG9yYWdlQWRhcHRlcjtcbiAgICBjb25zdCBpc1Bvc3RncmVzQWRhcHRlciA9IHRoaXMuYWRhcHRlciBpbnN0YW5jZW9mIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXI7XG4gICAgaWYgKGlzTW9uZ29BZGFwdGVyIHx8IGlzUG9zdGdyZXNBZGFwdGVyKSB7XG4gICAgICBsZXQgb3B0aW9ucyA9IHt9O1xuICAgICAgaWYgKGlzTW9uZ29BZGFwdGVyKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgICAgdHRsOiAwLFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChpc1Bvc3RncmVzQWRhcHRlcikge1xuICAgICAgICBvcHRpb25zID0gdGhpcy5pZGVtcG90ZW5jeU9wdGlvbnM7XG4gICAgICAgIG9wdGlvbnMuc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA9IHRydWU7XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgLmVuc3VyZUluZGV4KCdfSWRlbXBvdGVuY3knLCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzLCBbJ2V4cGlyZSddLCAndHRsJywgZmFsc2UsIG9wdGlvbnMpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgVFRMIGluZGV4IGZvciBpZGVtcG90ZW5jeSBleHBpcmUgZGF0ZTogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLnVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk7XG4gIH1cblxuICBfZXhwYW5kUmVzdWx0T25LZXlQYXRoKG9iamVjdDogYW55LCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IGFueSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPCAwKSB7XG4gICAgICBvYmplY3Rba2V5XSA9IHZhbHVlW2tleV07XG4gICAgICByZXR1cm4gb2JqZWN0O1xuICAgIH1cbiAgICBjb25zdCBwYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgY29uc3QgZmlyc3RLZXkgPSBwYXRoWzBdO1xuICAgIGNvbnN0IG5leHRQYXRoID0gcGF0aC5zbGljZSgxKS5qb2luKCcuJyk7XG5cbiAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgaWYgKHRoaXMub3B0aW9ucyAmJiB0aGlzLm9wdGlvbnMucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgICAgZm9yIChjb25zdCBrZXl3b3JkIG9mIHRoaXMub3B0aW9ucy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICAgIGNvbnN0IG1hdGNoID0gVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZSh7IGZpcnN0S2V5OiB1bmRlZmluZWQgfSwga2V5d29yZC5rZXksIHVuZGVmaW5lZCk7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICBgUHJvaGliaXRlZCBrZXl3b3JkIGluIHJlcXVlc3QgZGF0YTogJHtKU09OLnN0cmluZ2lmeShrZXl3b3JkKX0uYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBvYmplY3RbZmlyc3RLZXldID0gdGhpcy5fZXhwYW5kUmVzdWx0T25LZXlQYXRoKFxuICAgICAgb2JqZWN0W2ZpcnN0S2V5XSB8fCB7fSxcbiAgICAgIG5leHRQYXRoLFxuICAgICAgdmFsdWVbZmlyc3RLZXldXG4gICAgKTtcbiAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIF9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0OiBhbnksIHJlc3VsdDogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IHt9O1xuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICB9XG4gICAgT2JqZWN0LmtleXMob3JpZ2luYWxPYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGNvbnN0IGtleVVwZGF0ZSA9IG9yaWdpbmFsT2JqZWN0W2tleV07XG4gICAgICAvLyBkZXRlcm1pbmUgaWYgdGhhdCB3YXMgYW4gb3BcbiAgICAgIGlmIChcbiAgICAgICAga2V5VXBkYXRlICYmXG4gICAgICAgIHR5cGVvZiBrZXlVcGRhdGUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIGtleVVwZGF0ZS5fX29wICYmXG4gICAgICAgIFsnQWRkJywgJ0FkZFVuaXF1ZScsICdSZW1vdmUnLCAnSW5jcmVtZW50J10uaW5kZXhPZihrZXlVcGRhdGUuX19vcCkgPiAtMVxuICAgICAgKSB7XG4gICAgICAgIC8vIG9ubHkgdmFsaWQgb3BzIHRoYXQgcHJvZHVjZSBhbiBhY3Rpb25hYmxlIHJlc3VsdFxuICAgICAgICAvLyB0aGUgb3AgbWF5IGhhdmUgaGFwcGVuZWQgb24gYSBrZXlwYXRoXG4gICAgICAgIHRoaXMuX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChyZXNwb25zZSwga2V5LCByZXN1bHQpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICB9XG5cbiAgc3RhdGljIF92YWxpZGF0ZVF1ZXJ5OiAoYW55LCBib29sZWFuLCBib29sZWFuKSA9PiB2b2lkO1xuICBzdGF0aWMgZmlsdGVyU2Vuc2l0aXZlRGF0YTogKGJvb2xlYW4sIGFueVtdLCBhbnksIGFueSwgYW55LCBzdHJpbmcsIGFueVtdLCBhbnkpID0+IHZvaWQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRGF0YWJhc2VDb250cm9sbGVyO1xuLy8gRXhwb3NlIHZhbGlkYXRlUXVlcnkgZm9yIHRlc3RzXG5tb2R1bGUuZXhwb3J0cy5fdmFsaWRhdGVRdWVyeSA9IHZhbGlkYXRlUXVlcnk7XG5tb2R1bGUuZXhwb3J0cy5maWx0ZXJTZW5zaXRpdmVEYXRhID0gZmlsdGVyU2Vuc2l0aXZlRGF0YTtcbiJdfQ==