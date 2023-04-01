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
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }
function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }
function addWriteACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query);
  //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and
  newQuery._wperm = {
    $in: [null, ...acl]
  };
  return newQuery;
}
function addReadACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query);
  //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and
  newQuery._rperm = {
    $in: [null, '*', ...acl]
  };
  return newQuery;
}

// Transforms a REST API formatted ACL object to our two-field mongo format.
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
const validateQuery = (query, isMaster, isMaintenance, update) => {
  if (isMaintenance) {
    isMaster = true;
  }
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }
  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(value => validateQuery(value, isMaster, isMaintenance, update));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }
  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(value => validateQuery(value, isMaster, isMaintenance, update));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }
  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(value => validateQuery(value, isMaster, isMaintenance, update));
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
};

// Filters out any data that shouldn't be on this REST-formatted object.
const filterSensitiveData = (isMaster, isMaintenance, aclGroup, auth, operation, schema, className, protectedFields, object) => {
  let userId = null;
  if (auth && auth.user) userId = auth.user.id;

  // replace protectedFields when using pointer-permissions
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
      let overrideProtectedFields = false;

      // check if the object grants the current user access based on the extracted fields
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
      });

      // if at least one pointer-permission affected the current user
      // intersect vs protectedFields from previous stage (@see addProtectedFields)
      // Sets theory (intersections): A x (B x C) == (A x B) x C
      if (overrideProtectedFields && protectedFields) {
        newProtectedFields.push(protectedFields);
      }
      // intersect all sets of protectedFields
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
  if (isUserClass) {
    object.password = object._hashed_password;
    delete object._hashed_password;
    delete object.sessionToken;
  }
  if (isMaintenance) {
    return object;
  }

  /* special treat for the user class: don't filter protectedFields if currently loggedin user is
  the retrieved user */
  if (!(isUserClass && userId && object.objectId === userId)) {
    var _perms$protectedField, _perms$protectedField2;
    protectedFields && protectedFields.forEach(k => delete object[k]);

    // fields not requested by client (excluded),
    // but were needed to apply protectedFields
    perms === null || perms === void 0 ? void 0 : (_perms$protectedField = perms.protectedFields) === null || _perms$protectedField === void 0 ? void 0 : (_perms$protectedField2 = _perms$protectedField.temporaryKeys) === null || _perms$protectedField2 === void 0 ? void 0 : _perms$protectedField2.forEach(k => delete object[k]);
  }
  for (const key in object) {
    if (key.charAt(0) === '_') {
      delete object[key];
    }
  }
  if (!isUserClass || isMaster) {
    return object;
  }
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
};
// Transforms a Database format ACL to a REST API format ACL
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
    this.idempotencyOptions = this.options.idempotencyOptions || {};
    // Prevent mutable this.schema, otherwise one request could use
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
  }

  // Returns a promise for a schemaController.
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
  }

  // Returns a promise for the classname that is related to the given
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
  }

  // Uses the schema to validate the object (REST API format).
  // Returns a promise that resolves to the new schema.
  // This does not update this.schema, because in a situation like a
  // batch request, that could confuse other users of the schema.
  validateObject(className, object, query, runOptions, maintenance) {
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
      return schema.validateObject(className, object, query, maintenance);
    });
  }
  update(className, query, update, {
    acl,
    many,
    upsert,
    addsField
  } = {}, skipSanitization = false, validateOnly = false, validSchemaController) {
    const originalQuery = query;
    const originalUpdate = update;
    // Make a copy of the object, so we don't mutate the incoming data.
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
        validateQuery(query, isMaster, false, true);
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
  }

  // Collect all relation-updating operations from a REST-format update.
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
  }

  // Processes relation-updating operations from a REST-format update.
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
  }

  // Adds a relation.
  // Returns a promise that resolves successfully iff the add was successful.
  addRelation(key, fromClassName, fromId, toId) {
    const doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.upsertOneObject(`_Join:${key}:${fromClassName}`, relationSchema, doc, doc, this._transactionalSession);
  }

  // Removes a relation.
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
  }

  // Removes objects matches this query from the database.
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
        }
        // delete by query
        if (acl) {
          query = addWriteACL(query, acl);
        }
        validateQuery(query, isMaster, false, false);
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
  }

  // Inserts an object into the database.
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
  }

  // Won't delete collections in the system namespace
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
  }

  // Returns a promise for a list of related ids given an owning id.
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
  }

  // Returns a promise for a list of owning ids given some related ids.
  // className here is the owning className.
  owningIds(className, key, relatedIds) {
    return this.adapter.find(joinTableName(className, key), relationSchema, {
      relatedId: {
        $in: relatedIds
      }
    }, {
      keys: ['owningId']
    }).then(results => results.map(result => result.owningId));
  }

  // Modifies query so that it no longer has $in on relation fields, or
  // equal-to-pointer constraints on relation fields.
  // Returns a promise that resolves when query is mutated
  reduceInRelation(className, query, schema) {
    // Search for an in-relation or equal-to-relation
    // Make it sequential for now, not sure of paralleization side effects
    const promises = [];
    if (query['$or']) {
      const ors = query['$or'];
      promises.push(...ors.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$or'][index] = aQuery;
        });
      }));
    }
    if (query['$and']) {
      const ands = query['$and'];
      promises.push(...ands.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$and'][index] = aQuery;
        });
      }));
    }
    const otherKeys = Object.keys(query).map(key => {
      if (key === '$and' || key === '$or') {
        return;
      }
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
      }

      // remove the current queryKey as we don,t need it anymore
      delete query[key];
      // execute each query independently to build the list of
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
    return Promise.all([...promises, ...otherKeys]).then(() => {
      return Promise.resolve(query);
    });
  }

  // Modifies query so that it no longer has $relatedTo
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
    const idsFromIn = query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null;

    // -disable-next
    const allIds = [idsFromString, idsFromEq, idsFromIn, ids].filter(list => list !== null);
    const totalLength = allIds.reduce((memo, list) => memo + list.length, 0);
    let idsIntersection = [];
    if (totalLength > 125) {
      idsIntersection = _intersect.default.big(allIds);
    } else {
      idsIntersection = (0, _intersect.default)(allIds);
    }

    // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
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
    let allIds = [...idsFromNin, ...ids].filter(list => list !== null);

    // make a set and spread to remove duplicates
    allIds = [...new Set(allIds)];

    // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
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
  }

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
    const isMaintenance = auth.isMaintenance;
    const isMaster = acl === undefined || isMaintenance;
    const aclGroup = acl || [];
    op = op || (typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find');
    // Count operation if counting
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
          if (!schema.fields[fieldName.split('.')[0]] && fieldName !== 'score') {
            delete sort[fieldName];
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
          validateQuery(query, isMaster, isMaintenance, false);
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
              return filterSensitiveData(isMaster, isMaintenance, aclGroup, auth, op, schemaController, className, protectedFields, object);
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
  }

  // This helps to create intermediate objects for simpler comparison of
  // key value pairs used in query objects. Each key value pair will represented
  // in a similar way to json
  objectToEntriesStrings(query) {
    return Object.entries(query).map(a => a.map(s => JSON.stringify(s)).join(':'));
  }

  // Naive logic reducer for OR operations meant to be used only for pointer permissions.
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
  }

  // Naive logic reducer for AND operations meant to be used only for pointer permissions.
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
  }

  // Constraints query using CLP's pointer permissions (PP) if any.
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
    }
    // the ACL should have exactly 1 user
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
        }
        // if we already have a constraint on the key, use the $and
        if (Object.prototype.hasOwnProperty.call(query, key)) {
          return this.reduceAndOperation({
            $and: [queryClause, query]
          });
        }
        // otherwise just add the constaint
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
    if (aclGroup.indexOf(query.objectId) > -1) return null;

    // for queries where "keys" are set and do not include all 'userField':{field},
    // we have to transparently include it, and then remove before returning to client
    // Because if such key not projected the permission won't be enforced properly
    // PS this is called when 'excludeKeys' already reduced to 'keys'
    const preserveKeys = queryOptions.keys;

    // these are keys that need to be included only
    // to be able to apply protectedFields by pointer
    // and then unset before returning to client (later in  filterSensitiveFields)
    const serverOnlyKeys = [];
    const authenticated = auth.user;

    // map to allow check without array search
    const roles = (auth.userRoles || []).reduce((acc, r) => {
      acc[r] = protectedFields[r];
      return acc;
    }, {});

    // array of sets of protected fields. separate item for each applicable criteria
    const protectedKeysSets = [];
    for (const key in protectedFields) {
      // skip userFields
      if (key.startsWith('userField:')) {
        if (preserveKeys) {
          const fieldName = key.substring(10);
          if (!preserveKeys.includes(fieldName)) {
            // 1. put it there temporarily
            queryOptions.keys && queryOptions.keys.push(fieldName);
            // 2. preserve it delete later
            serverOnlyKeys.push(fieldName);
          }
        }
        continue;
      }

      // add public tier
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
    }

    // check if there's a rule for current user's id
    if (authenticated) {
      const userId = auth.user.id;
      if (perms.protectedFields[userId]) {
        protectedKeysSets.push(perms.protectedFields[userId]);
      }
    }

    // preserve fields to be removed before sending response to client
    if (serverOnlyKeys.length > 0) {
      perms.protectedFields.temporaryKeys = serverOnlyKeys;
    }
    let protectedKeys = protectedKeysSets.reduce((acc, next) => {
      if (next) {
        acc.push(...next);
      }
      return acc;
    }, []);

    // intersect all sets of protectedFields
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
  }

  // TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
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
    const nextPath = path.slice(1).join('.');

    // Scan request data for denied keywords
    if (this.options && this.options.requestKeywordDenylist) {
      // Scan request data for denied keywords
      for (const keyword of this.options.requestKeywordDenylist) {
        const match = _Utils.default.objectContainsKeyValue({
          [firstKey]: true,
          [nextPath]: true
        }, keyword.key, true);
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
      const keyUpdate = originalObject[key];
      // determine if that was an op
      if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
        // only valid ops that produce an actionable result
        // the op may have happened on a keypath
        this._expandResultOnKeyPath(response, key, result);
      }
    });
    return Promise.resolve(response);
  }
}
module.exports = DatabaseController;
// Expose validateQuery for tests
module.exports._validateQuery = validateQuery;
module.exports.filterSensitiveData = filterSensitiveData;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJhZGRXcml0ZUFDTCIsInF1ZXJ5IiwiYWNsIiwibmV3UXVlcnkiLCJfIiwiY2xvbmVEZWVwIiwiX3dwZXJtIiwiJGluIiwiYWRkUmVhZEFDTCIsIl9ycGVybSIsInRyYW5zZm9ybU9iamVjdEFDTCIsIkFDTCIsInJlc3VsdCIsImVudHJ5IiwicmVhZCIsInB1c2giLCJ3cml0ZSIsInNwZWNpYWxRdWVyeUtleXMiLCJzcGVjaWFsTWFzdGVyUXVlcnlLZXlzIiwidmFsaWRhdGVRdWVyeSIsImlzTWFzdGVyIiwiaXNNYWludGVuYW5jZSIsInVwZGF0ZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiJG9yIiwiQXJyYXkiLCJmb3JFYWNoIiwidmFsdWUiLCIkYW5kIiwiJG5vciIsImxlbmd0aCIsIk9iamVjdCIsImtleXMiLCJrZXkiLCIkcmVnZXgiLCIkb3B0aW9ucyIsIm1hdGNoIiwiaW5jbHVkZXMiLCJJTlZBTElEX0tFWV9OQU1FIiwiZmlsdGVyU2Vuc2l0aXZlRGF0YSIsImFjbEdyb3VwIiwiYXV0aCIsIm9wZXJhdGlvbiIsInNjaGVtYSIsImNsYXNzTmFtZSIsInByb3RlY3RlZEZpZWxkcyIsIm9iamVjdCIsInVzZXJJZCIsInVzZXIiLCJpZCIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNSZWFkT3BlcmF0aW9uIiwiaW5kZXhPZiIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtIiwiZmlsdGVyIiwic3RhcnRzV2l0aCIsIm1hcCIsInN1YnN0cmluZyIsIm5ld1Byb3RlY3RlZEZpZWxkcyIsIm92ZXJyaWRlUHJvdGVjdGVkRmllbGRzIiwicG9pbnRlclBlcm0iLCJwb2ludGVyUGVybUluY2x1ZGVzVXNlciIsInJlYWRVc2VyRmllbGRWYWx1ZSIsImlzQXJyYXkiLCJzb21lIiwib2JqZWN0SWQiLCJmaWVsZHMiLCJ2IiwiaXNVc2VyQ2xhc3MiLCJwYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJzZXNzaW9uVG9rZW4iLCJrIiwidGVtcG9yYXJ5S2V5cyIsImNoYXJBdCIsImF1dGhEYXRhIiwic3BlY2lhbEtleXNGb3JVcGRhdGUiLCJpc1NwZWNpYWxVcGRhdGVLZXkiLCJqb2luVGFibGVOYW1lIiwiZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSIsIl9fb3AiLCJhbW91bnQiLCJJTlZBTElEX0pTT04iLCJvYmplY3RzIiwiQ09NTUFORF9VTkFWQUlMQUJMRSIsInRyYW5zZm9ybUF1dGhEYXRhIiwicHJvdmlkZXIiLCJwcm92aWRlckRhdGEiLCJmaWVsZE5hbWUiLCJ0eXBlIiwidW50cmFuc2Zvcm1PYmplY3RBQ0wiLCJvdXRwdXQiLCJnZXRSb290RmllbGROYW1lIiwic3BsaXQiLCJyZWxhdGlvblNjaGVtYSIsInJlbGF0ZWRJZCIsIm93bmluZ0lkIiwibWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2UiLCJvcHRpb25zIiwiZm9yY2VFbWFpbEFuZFVzZXJuYW1lVG9Mb3dlckNhc2UiLCJ0b0xvd2VyQ2FzZUZpZWxkcyIsInRvTG93ZXJDYXNlIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJhZGFwdGVyIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwic2NoZW1hUHJvbWlzZSIsIl90cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbGxlY3Rpb25FeGlzdHMiLCJjbGFzc0V4aXN0cyIsInB1cmdlQ29sbGVjdGlvbiIsImxvYWRTY2hlbWEiLCJ0aGVuIiwic2NoZW1hQ29udHJvbGxlciIsImdldE9uZVNjaGVtYSIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwidmFsaWRhdGVDbGFzc05hbWUiLCJTY2hlbWFDb250cm9sbGVyIiwiY2xhc3NOYW1lSXNWYWxpZCIsIlByb21pc2UiLCJyZWplY3QiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJyZXNvbHZlIiwiY2xlYXJDYWNoZSIsImxvYWQiLCJsb2FkU2NoZW1hSWZOZWVkZWQiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInQiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsIm1haW50ZW5hbmNlIiwidW5kZWZpbmVkIiwicyIsImNhbkFkZEZpZWxkIiwibWFueSIsInVwc2VydCIsImFkZHNGaWVsZCIsInNraXBTYW5pdGl6YXRpb24iLCJ2YWxpZGF0ZU9ubHkiLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJvcmlnaW5hbFF1ZXJ5Iiwib3JpZ2luYWxVcGRhdGUiLCJkZWVwY29weSIsInJlbGF0aW9uVXBkYXRlcyIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNvbGxlY3RSZWxhdGlvblVwZGF0ZXMiLCJhZGRQb2ludGVyUGVybWlzc2lvbnMiLCJjYXRjaCIsImVycm9yIiwicm9vdEZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWQiLCJ1cGRhdGVPcGVyYXRpb24iLCJpbm5lcktleSIsIklOVkFMSURfTkVTVEVEX0tFWSIsImZpbmQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cHNlcnRPbmVPYmplY3QiLCJmaW5kT25lQW5kVXBkYXRlIiwiaGFuZGxlUmVsYXRpb25VcGRhdGVzIiwiX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQiLCJvcHMiLCJkZWxldGVNZSIsInByb2Nlc3MiLCJvcCIsIngiLCJwZW5kaW5nIiwiYWRkUmVsYXRpb24iLCJyZW1vdmVSZWxhdGlvbiIsImFsbCIsImZyb21DbGFzc05hbWUiLCJmcm9tSWQiLCJ0b0lkIiwiZG9jIiwiY29kZSIsImRlc3Ryb3kiLCJwYXJzZUZvcm1hdFNjaGVtYSIsImNyZWF0ZSIsIm9yaWdpbmFsT2JqZWN0IiwiY3JlYXRlZEF0IiwiaXNvIiwiX190eXBlIiwidXBkYXRlZEF0IiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiY3JlYXRlT2JqZWN0IiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsImNsYXNzU2NoZW1hIiwic2NoZW1hRGF0YSIsInNjaGVtYUZpZWxkcyIsIm5ld0tleXMiLCJmaWVsZCIsImFjdGlvbiIsImRlbGV0ZUV2ZXJ5dGhpbmciLCJmYXN0IiwiU2NoZW1hQ2FjaGUiLCJjbGVhciIsImRlbGV0ZUFsbENsYXNzZXMiLCJyZWxhdGVkSWRzIiwicXVlcnlPcHRpb25zIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImZpbmRPcHRpb25zIiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIl9pZCIsInJlc3VsdHMiLCJvd25pbmdJZHMiLCJyZWR1Y2VJblJlbGF0aW9uIiwicHJvbWlzZXMiLCJvcnMiLCJhUXVlcnkiLCJpbmRleCIsImFuZHMiLCJvdGhlcktleXMiLCJxdWVyaWVzIiwiY29uc3RyYWludEtleSIsImlzTmVnYXRpb24iLCJyIiwicSIsImlkcyIsImFkZE5vdEluT2JqZWN0SWRzSWRzIiwiYWRkSW5PYmplY3RJZHNJZHMiLCJyZWR1Y2VSZWxhdGlvbktleXMiLCJyZWxhdGVkVG8iLCJpZHNGcm9tU3RyaW5nIiwiaWRzRnJvbUVxIiwiaWRzRnJvbUluIiwiYWxsSWRzIiwibGlzdCIsInRvdGFsTGVuZ3RoIiwicmVkdWNlIiwibWVtbyIsImlkc0ludGVyc2VjdGlvbiIsImludGVyc2VjdCIsImJpZyIsIiRlcSIsImlkc0Zyb21OaW4iLCJTZXQiLCIkbmluIiwiY291bnQiLCJkaXN0aW5jdCIsInBpcGVsaW5lIiwicmVhZFByZWZlcmVuY2UiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwiZXhwbGFpbiIsIl9jcmVhdGVkX2F0IiwiX3VwZGF0ZWRfYXQiLCJkaXNhYmxlQ2FzZUluc2Vuc2l0aXZpdHkiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJhZ2dyZWdhdGUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJkZWxldGVTY2hlbWEiLCJkZWxldGVDbGFzcyIsIndhc1BhcnNlQ29sbGVjdGlvbiIsInJlbGF0aW9uRmllbGROYW1lcyIsIm5hbWUiLCJkZWwiLCJyZWxvYWREYXRhIiwib2JqZWN0VG9FbnRyaWVzU3RyaW5ncyIsImVudHJpZXMiLCJhIiwiSlNPTiIsInN0cmluZ2lmeSIsImpvaW4iLCJyZWR1Y2VPck9wZXJhdGlvbiIsInJlcGVhdCIsImkiLCJqIiwic2hvcnRlciIsImxvbmdlciIsImZvdW5kRW50cmllcyIsImFjYyIsInNob3J0ZXJFbnRyaWVzIiwic3BsaWNlIiwicmVkdWNlQW5kT3BlcmF0aW9uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwidXNlckFDTCIsImdyb3VwS2V5IiwicGVybUZpZWxkcyIsInBvaW50ZXJGaWVsZHMiLCJ1c2VyUG9pbnRlciIsImZpZWxkRGVzY3JpcHRvciIsImZpZWxkVHlwZSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInF1ZXJ5Q2xhdXNlIiwiJGFsbCIsImFzc2lnbiIsInByZXNlcnZlS2V5cyIsInNlcnZlck9ubHlLZXlzIiwiYXV0aGVudGljYXRlZCIsInJvbGVzIiwidXNlclJvbGVzIiwicHJvdGVjdGVkS2V5c1NldHMiLCJwcm90ZWN0ZWRLZXlzIiwibmV4dCIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwicmVxdWlyZWRVc2VyRmllbGRzIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsIl9Vc2VyIiwicmVxdWlyZWRSb2xlRmllbGRzIiwiX1JvbGUiLCJyZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzIiwiX0lkZW1wb3RlbmN5IiwiZW5zdXJlVW5pcXVlbmVzcyIsImxvZ2dlciIsIndhcm4iLCJlbnN1cmVJbmRleCIsImlzTW9uZ29BZGFwdGVyIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsImlzUG9zdGdyZXNBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInR0bCIsInNldElkZW1wb3RlbmN5RnVuY3Rpb24iLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsIl9leHBhbmRSZXN1bHRPbktleVBhdGgiLCJwYXRoIiwiZmlyc3RLZXkiLCJuZXh0UGF0aCIsInNsaWNlIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJVdGlscyIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJyZXNwb25zZSIsImtleVVwZGF0ZSIsIm1vZHVsZSIsImV4cG9ydHMiLCJfdmFsaWRhdGVRdWVyeSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsi77u/Ly8gQGZsb3dcbi8vIEEgZGF0YWJhc2UgYWRhcHRlciB0aGF0IHdvcmtzIHdpdGggZGF0YSBleHBvcnRlZCBmcm9tIHRoZSBob3N0ZWRcbi8vIFBhcnNlIGRhdGFiYXNlLlxuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBpbnRlcnNlY3QgZnJvbSAnaW50ZXJzZWN0Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBVdGlscyBmcm9tICcuLi9VdGlscyc7XG5pbXBvcnQgKiBhcyBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4vU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IE1vbmdvU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHR5cGUgeyBMb2FkU2NoZW1hT3B0aW9ucyB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHR5cGUgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuLi9PcHRpb25zJztcbmltcG9ydCB0eXBlIHsgUXVlcnlPcHRpb25zLCBGdWxsUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5cbmZ1bmN0aW9uIGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfd3Blcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3dwZXJtID0geyAkaW46IFtudWxsLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuZnVuY3Rpb24gYWRkUmVhZEFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3JwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll9ycGVybSA9IHsgJGluOiBbbnVsbCwgJyonLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuLy8gVHJhbnNmb3JtcyBhIFJFU1QgQVBJIGZvcm1hdHRlZCBBQ0wgb2JqZWN0IHRvIG91ciB0d28tZmllbGQgbW9uZ28gZm9ybWF0LlxuY29uc3QgdHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgQUNMLCAuLi5yZXN1bHQgfSkgPT4ge1xuICBpZiAoIUFDTCkge1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICByZXN1bHQuX3dwZXJtID0gW107XG4gIHJlc3VsdC5fcnBlcm0gPSBbXTtcblxuICBmb3IgKGNvbnN0IGVudHJ5IGluIEFDTCkge1xuICAgIGlmIChBQ0xbZW50cnldLnJlYWQpIHtcbiAgICAgIHJlc3VsdC5fcnBlcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGlmIChBQ0xbZW50cnldLndyaXRlKSB7XG4gICAgICByZXN1bHQuX3dwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuY29uc3Qgc3BlY2lhbFF1ZXJ5S2V5cyA9IFsnJGFuZCcsICckb3InLCAnJG5vcicsICdfcnBlcm0nLCAnX3dwZXJtJ107XG5jb25zdCBzcGVjaWFsTWFzdGVyUXVlcnlLZXlzID0gW1xuICAuLi5zcGVjaWFsUXVlcnlLZXlzLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfdG9tYnN0b25lJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG5dO1xuXG5jb25zdCB2YWxpZGF0ZVF1ZXJ5ID0gKFxuICBxdWVyeTogYW55LFxuICBpc01hc3RlcjogYm9vbGVhbixcbiAgaXNNYWludGVuYW5jZTogYm9vbGVhbixcbiAgdXBkYXRlOiBib29sZWFuXG4pOiB2b2lkID0+IHtcbiAgaWYgKGlzTWFpbnRlbmFuY2UpIHtcbiAgICBpc01hc3RlciA9IHRydWU7XG4gIH1cbiAgaWYgKHF1ZXJ5LkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQ2Fubm90IHF1ZXJ5IG9uIEFDTC4nKTtcbiAgfVxuXG4gIGlmIChxdWVyeS4kb3IpIHtcbiAgICBpZiAocXVlcnkuJG9yIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCB1cGRhdGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJG9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJGFuZCkge1xuICAgIGlmIChxdWVyeS4kYW5kIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRhbmQuZm9yRWFjaCh2YWx1ZSA9PiB2YWxpZGF0ZVF1ZXJ5KHZhbHVlLCBpc01hc3RlciwgaXNNYWludGVuYW5jZSwgdXBkYXRlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQmFkICRhbmQgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kbm9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRub3IgaW5zdGFuY2VvZiBBcnJheSAmJiBxdWVyeS4kbm9yLmxlbmd0aCA+IDApIHtcbiAgICAgIHF1ZXJ5LiRub3IuZm9yRWFjaCh2YWx1ZSA9PiB2YWxpZGF0ZVF1ZXJ5KHZhbHVlLCBpc01hc3RlciwgaXNNYWludGVuYW5jZSwgdXBkYXRlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkbm9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSBvZiBhdCBsZWFzdCAxIHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAocXVlcnkgJiYgcXVlcnlba2V5XSAmJiBxdWVyeVtrZXldLiRyZWdleCkge1xuICAgICAgaWYgKHR5cGVvZiBxdWVyeVtrZXldLiRvcHRpb25zID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXF1ZXJ5W2tleV0uJG9wdGlvbnMubWF0Y2goL15baW14c10rJC8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgIGBCYWQgJG9wdGlvbnMgdmFsdWUgZm9yIHF1ZXJ5OiAke3F1ZXJ5W2tleV0uJG9wdGlvbnN9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKFxuICAgICAgIWtleS5tYXRjaCgvXlthLXpBLVpdW2EtekEtWjAtOV9cXC5dKiQvKSAmJlxuICAgICAgKCghc3BlY2lhbFF1ZXJ5S2V5cy5pbmNsdWRlcyhrZXkpICYmICFpc01hc3RlciAmJiAhdXBkYXRlKSB8fFxuICAgICAgICAodXBkYXRlICYmIGlzTWFzdGVyICYmICFzcGVjaWFsTWFzdGVyUXVlcnlLZXlzLmluY2x1ZGVzKGtleSkpKVxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBJbnZhbGlkIGtleSBuYW1lOiAke2tleX1gKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLy8gRmlsdGVycyBvdXQgYW55IGRhdGEgdGhhdCBzaG91bGRuJ3QgYmUgb24gdGhpcyBSRVNULWZvcm1hdHRlZCBvYmplY3QuXG5jb25zdCBmaWx0ZXJTZW5zaXRpdmVEYXRhID0gKFxuICBpc01hc3RlcjogYm9vbGVhbixcbiAgaXNNYWludGVuYW5jZTogYm9vbGVhbixcbiAgYWNsR3JvdXA6IGFueVtdLFxuICBhdXRoOiBhbnksXG4gIG9wZXJhdGlvbjogYW55LFxuICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlciB8IGFueSxcbiAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gIHByb3RlY3RlZEZpZWxkczogbnVsbCB8IEFycmF5PGFueT4sXG4gIG9iamVjdDogYW55XG4pID0+IHtcbiAgbGV0IHVzZXJJZCA9IG51bGw7XG4gIGlmIChhdXRoICYmIGF1dGgudXNlcikgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuXG4gIC8vIHJlcGxhY2UgcHJvdGVjdGVkRmllbGRzIHdoZW4gdXNpbmcgcG9pbnRlci1wZXJtaXNzaW9uc1xuICBjb25zdCBwZXJtcyA9XG4gICAgc2NoZW1hICYmIHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMgPyBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSkgOiB7fTtcbiAgaWYgKHBlcm1zKSB7XG4gICAgY29uc3QgaXNSZWFkT3BlcmF0aW9uID0gWydnZXQnLCAnZmluZCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xO1xuXG4gICAgaWYgKGlzUmVhZE9wZXJhdGlvbiAmJiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIGV4dHJhY3QgcHJvdGVjdGVkRmllbGRzIGFkZGVkIHdpdGggdGhlIHBvaW50ZXItcGVybWlzc2lvbiBwcmVmaXhcbiAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtID0gT2JqZWN0LmtleXMocGVybXMucHJvdGVjdGVkRmllbGRzKVxuICAgICAgICAuZmlsdGVyKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBrZXkuc3Vic3RyaW5nKDEwKSwgdmFsdWU6IHBlcm1zLnByb3RlY3RlZEZpZWxkc1trZXldIH07XG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBuZXdQcm90ZWN0ZWRGaWVsZHM6IEFycmF5PHN0cmluZz5bXSA9IFtdO1xuICAgICAgbGV0IG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gZmFsc2U7XG5cbiAgICAgIC8vIGNoZWNrIGlmIHRoZSBvYmplY3QgZ3JhbnRzIHRoZSBjdXJyZW50IHVzZXIgYWNjZXNzIGJhc2VkIG9uIHRoZSBleHRyYWN0ZWQgZmllbGRzXG4gICAgICBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybS5mb3JFYWNoKHBvaW50ZXJQZXJtID0+IHtcbiAgICAgICAgbGV0IHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IHJlYWRVc2VyRmllbGRWYWx1ZSA9IG9iamVjdFtwb2ludGVyUGVybS5rZXldO1xuICAgICAgICBpZiAocmVhZFVzZXJGaWVsZFZhbHVlKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVhZFVzZXJGaWVsZFZhbHVlKSkge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSByZWFkVXNlckZpZWxkVmFsdWUuc29tZShcbiAgICAgICAgICAgICAgdXNlciA9PiB1c2VyLm9iamVjdElkICYmIHVzZXIub2JqZWN0SWQgPT09IHVzZXJJZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPVxuICAgICAgICAgICAgICByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgJiYgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkID09PSB1c2VySWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyKSB7XG4gICAgICAgICAgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSB0cnVlO1xuICAgICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHBvaW50ZXJQZXJtLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIGlmIGF0IGxlYXN0IG9uZSBwb2ludGVyLXBlcm1pc3Npb24gYWZmZWN0ZWQgdGhlIGN1cnJlbnQgdXNlclxuICAgICAgLy8gaW50ZXJzZWN0IHZzIHByb3RlY3RlZEZpZWxkcyBmcm9tIHByZXZpb3VzIHN0YWdlIChAc2VlIGFkZFByb3RlY3RlZEZpZWxkcylcbiAgICAgIC8vIFNldHMgdGhlb3J5IChpbnRlcnNlY3Rpb25zKTogQSB4IChCIHggQykgPT0gKEEgeCBCKSB4IENcbiAgICAgIGlmIChvdmVycmlkZVByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocHJvdGVjdGVkRmllbGRzKTtcbiAgICAgIH1cbiAgICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgICAvLyBpZiB0aGVyZSdyZSBubyBwcm90Y3RlZEZpZWxkcyBieSBvdGhlciBjcml0ZXJpYSAoIGlkIC8gcm9sZSAvIGF1dGgpXG4gICAgICAgICAgLy8gdGhlbiB3ZSBtdXN0IGludGVyc2VjdCBlYWNoIHNldCAocGVyIHVzZXJGaWVsZClcbiAgICAgICAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gZmllbGRzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHMuZmlsdGVyKHYgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlzVXNlckNsYXNzID0gY2xhc3NOYW1lID09PSAnX1VzZXInO1xuICBpZiAoaXNVc2VyQ2xhc3MpIHtcbiAgICBvYmplY3QucGFzc3dvcmQgPSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBkZWxldGUgb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gICAgZGVsZXRlIG9iamVjdC5zZXNzaW9uVG9rZW47XG4gIH1cblxuICBpZiAoaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICAvKiBzcGVjaWFsIHRyZWF0IGZvciB0aGUgdXNlciBjbGFzczogZG9uJ3QgZmlsdGVyIHByb3RlY3RlZEZpZWxkcyBpZiBjdXJyZW50bHkgbG9nZ2VkaW4gdXNlciBpc1xuICB0aGUgcmV0cmlldmVkIHVzZXIgKi9cbiAgaWYgKCEoaXNVc2VyQ2xhc3MgJiYgdXNlcklkICYmIG9iamVjdC5vYmplY3RJZCA9PT0gdXNlcklkKSkge1xuICAgIHByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuXG4gICAgLy8gZmllbGRzIG5vdCByZXF1ZXN0ZWQgYnkgY2xpZW50IChleGNsdWRlZCksXG4gICAgLy8gYnV0IHdlcmUgbmVlZGVkIHRvIGFwcGx5IHByb3RlY3RlZEZpZWxkc1xuICAgIHBlcm1zPy5wcm90ZWN0ZWRGaWVsZHM/LnRlbXBvcmFyeUtleXM/LmZvckVhY2goayA9PiBkZWxldGUgb2JqZWN0W2tdKTtcbiAgfVxuXG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChrZXkuY2hhckF0KDApID09PSAnXycpIHtcbiAgICAgIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgICB9XG4gIH1cblxuICBpZiAoIWlzVXNlckNsYXNzIHx8IGlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIGlmIChhY2xHcm91cC5pbmRleE9mKG9iamVjdC5vYmplY3RJZCkgPiAtMSkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbi8vIFJ1bnMgYW4gdXBkYXRlIG9uIHRoZSBkYXRhYmFzZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBvYmplY3Qgd2l0aCB0aGUgbmV3IHZhbHVlcyBmb3IgZmllbGRcbi8vIG1vZGlmaWNhdGlvbnMgdGhhdCBkb24ndCBrbm93IHRoZWlyIHJlc3VsdHMgYWhlYWQgb2YgdGltZSwgbGlrZVxuLy8gJ2luY3JlbWVudCcuXG4vLyBPcHRpb25zOlxuLy8gICBhY2w6ICBhIGxpc3Qgb2Ygc3RyaW5ncy4gSWYgdGhlIG9iamVjdCB0byBiZSB1cGRhdGVkIGhhcyBhbiBBQ0wsXG4vLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4vLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuY29uc3Qgc3BlY2lhbEtleXNGb3JVcGRhdGUgPSBbXG4gICdfaGFzaGVkX3Bhc3N3b3JkJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50JyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLFxuICAnX3Bhc3N3b3JkX2hpc3RvcnknLFxuXTtcblxuY29uc3QgaXNTcGVjaWFsVXBkYXRlS2V5ID0ga2V5ID0+IHtcbiAgcmV0dXJuIHNwZWNpYWxLZXlzRm9yVXBkYXRlLmluZGV4T2Yoa2V5KSA+PSAwO1xufTtcblxuZnVuY3Rpb24gam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSkge1xuICByZXR1cm4gYF9Kb2luOiR7a2V5fToke2NsYXNzTmFtZX1gO1xufVxuXG5jb25zdCBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlID0gb2JqZWN0ID0+IHtcbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKG9iamVjdFtrZXldICYmIG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgIHN3aXRjaCAob2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgICBjYXNlICdJbmNyZW1lbnQnOlxuICAgICAgICAgIGlmICh0eXBlb2Ygb2JqZWN0W2tleV0uYW1vdW50ICE9PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5hbW91bnQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FkZCc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5vYmplY3RzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGRVbmlxdWUnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUmVtb3ZlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IFtdO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdEZWxldGUnOlxuICAgICAgICAgIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5DT01NQU5EX1VOQVZBSUxBQkxFLFxuICAgICAgICAgICAgYFRoZSAke29iamVjdFtrZXldLl9fb3B9IG9wZXJhdG9yIGlzIG5vdCBzdXBwb3J0ZWQgeWV0LmBcbiAgICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuY29uc3QgdHJhbnNmb3JtQXV0aERhdGEgPSAoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkgPT4ge1xuICBpZiAob2JqZWN0LmF1dGhEYXRhICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIE9iamVjdC5rZXlzKG9iamVjdC5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICBjb25zdCBwcm92aWRlckRhdGEgPSBvYmplY3QuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgY29uc3QgZmllbGROYW1lID0gYF9hdXRoX2RhdGFfJHtwcm92aWRlcn1gO1xuICAgICAgaWYgKHByb3ZpZGVyRGF0YSA9PSBudWxsKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fb3A6ICdEZWxldGUnLFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSBwcm92aWRlckRhdGE7XG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSA9IHsgdHlwZTogJ09iamVjdCcgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICB9XG59O1xuLy8gVHJhbnNmb3JtcyBhIERhdGFiYXNlIGZvcm1hdCBBQ0wgdG8gYSBSRVNUIEFQSSBmb3JtYXQgQUNMXG5jb25zdCB1bnRyYW5zZm9ybU9iamVjdEFDTCA9ICh7IF9ycGVybSwgX3dwZXJtLCAuLi5vdXRwdXQgfSkgPT4ge1xuICBpZiAoX3JwZXJtIHx8IF93cGVybSkge1xuICAgIG91dHB1dC5BQ0wgPSB7fTtcblxuICAgIChfcnBlcm0gfHwgW10pLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKCFvdXRwdXQuQUNMW2VudHJ5XSkge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XSA9IHsgcmVhZDogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3JlYWQnXSA9IHRydWU7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAoX3dwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHdyaXRlOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XVsnd3JpdGUnXSA9IHRydWU7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIG91dHB1dDtcbn07XG5cbi8qKlxuICogV2hlbiBxdWVyeWluZywgdGhlIGZpZWxkTmFtZSBtYXkgYmUgY29tcG91bmQsIGV4dHJhY3QgdGhlIHJvb3QgZmllbGROYW1lXG4gKiAgICAgYHRlbXBlcmF0dXJlLmNlbHNpdXNgIGJlY29tZXMgYHRlbXBlcmF0dXJlYFxuICogQHBhcmFtIHtzdHJpbmd9IGZpZWxkTmFtZSB0aGF0IG1heSBiZSBhIGNvbXBvdW5kIGZpZWxkIG5hbWVcbiAqIEByZXR1cm5zIHtzdHJpbmd9IHRoZSByb290IG5hbWUgb2YgdGhlIGZpZWxkXG4gKi9cbmNvbnN0IGdldFJvb3RGaWVsZE5hbWUgPSAoZmllbGROYW1lOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG59O1xuXG5jb25zdCByZWxhdGlvblNjaGVtYSA9IHtcbiAgZmllbGRzOiB7IHJlbGF0ZWRJZDogeyB0eXBlOiAnU3RyaW5nJyB9LCBvd25pbmdJZDogeyB0eXBlOiAnU3RyaW5nJyB9IH0sXG59O1xuXG5jb25zdCBtYXliZVRyYW5zZm9ybVVzZXJuYW1lQW5kRW1haWxUb0xvd2VyQ2FzZSA9IChvYmplY3QsIGNsYXNzTmFtZSwgb3B0aW9ucykgPT4ge1xuICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInICYmIG9wdGlvbnMuZm9yY2VFbWFpbEFuZFVzZXJuYW1lVG9Mb3dlckNhc2UpIHtcbiAgICBjb25zdCB0b0xvd2VyQ2FzZUZpZWxkcyA9IFsnZW1haWwnLCAndXNlcm5hbWUnXTtcbiAgICB0b0xvd2VyQ2FzZUZpZWxkcy5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldID09PSAnc3RyaW5nJykgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS50b0xvd2VyQ2FzZSgpO1xuICAgIH0pO1xuICB9XG59O1xuXG5jbGFzcyBEYXRhYmFzZUNvbnRyb2xsZXIge1xuICBhZGFwdGVyOiBTdG9yYWdlQWRhcHRlcjtcbiAgc2NoZW1hQ2FjaGU6IGFueTtcbiAgc2NoZW1hUHJvbWlzZTogP1Byb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPjtcbiAgX3RyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55O1xuICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnM7XG4gIGlkZW1wb3RlbmN5T3B0aW9uczogYW55O1xuXG4gIGNvbnN0cnVjdG9yKGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLCBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0aGlzLmFkYXB0ZXIgPSBhZGFwdGVyO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdGhpcy5pZGVtcG90ZW5jeU9wdGlvbnMgPSB0aGlzLm9wdGlvbnMuaWRlbXBvdGVuY3lPcHRpb25zIHx8IHt9O1xuICAgIC8vIFByZXZlbnQgbXV0YWJsZSB0aGlzLnNjaGVtYSwgb3RoZXJ3aXNlIG9uZSByZXF1ZXN0IGNvdWxkIHVzZVxuICAgIC8vIG11bHRpcGxlIHNjaGVtYXMsIHNvIGluc3RlYWQgdXNlIGxvYWRTY2hlbWEgdG8gZ2V0IGEgc2NoZW1hLlxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gIH1cblxuICBjb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICB9XG5cbiAgcHVyZ2VDb2xsZWN0aW9uKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihzY2hlbWEgPT4gdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCB7fSkpO1xuICB9XG5cbiAgdmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsICdpbnZhbGlkIGNsYXNzTmFtZTogJyArIGNsYXNzTmFtZSlcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHNjaGVtYUNvbnRyb2xsZXIuXG4gIGxvYWRTY2hlbWEoXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFQcm9taXNlICE9IG51bGwpIHtcbiAgICAgIHJldHVybiB0aGlzLnNjaGVtYVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IFNjaGVtYUNvbnRyb2xsZXIubG9hZCh0aGlzLmFkYXB0ZXIsIG9wdGlvbnMpO1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZS50aGVuKFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZSxcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2VcbiAgICApO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICBsb2FkU2NoZW1hSWZOZWVkZWQoXG4gICAgc2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIgPyBQcm9taXNlLnJlc29sdmUoc2NoZW1hQ29udHJvbGxlcikgOiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIGNsYXNzbmFtZSB0aGF0IGlzIHJlbGF0ZWQgdG8gdGhlIGdpdmVuXG4gIC8vIGNsYXNzbmFtZSB0aHJvdWdoIHRoZSBrZXkuXG4gIC8vIFRPRE86IG1ha2UgdGhpcyBub3QgaW4gdGhlIERhdGFiYXNlQ29udHJvbGxlciBpbnRlcmZhY2VcbiAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nKTogUHJvbWlzZTw/c3RyaW5nPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIHZhciB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAodCAhPSBudWxsICYmIHR5cGVvZiB0ICE9PSAnc3RyaW5nJyAmJiB0LnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHQudGFyZ2V0Q2xhc3M7XG4gICAgICB9XG4gICAgICByZXR1cm4gY2xhc3NOYW1lO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVXNlcyB0aGUgc2NoZW1hIHRvIHZhbGlkYXRlIHRoZSBvYmplY3QgKFJFU1QgQVBJIGZvcm1hdCkuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEuXG4gIC8vIFRoaXMgZG9lcyBub3QgdXBkYXRlIHRoaXMuc2NoZW1hLCBiZWNhdXNlIGluIGEgc2l0dWF0aW9uIGxpa2UgYVxuICAvLyBiYXRjaCByZXF1ZXN0LCB0aGF0IGNvdWxkIGNvbmZ1c2Ugb3RoZXIgdXNlcnMgb2YgdGhlIHNjaGVtYS5cbiAgdmFsaWRhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgcXVlcnk6IGFueSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnMsXG4gICAgbWFpbnRlbmFuY2U6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgbGV0IHNjaGVtYTtcbiAgICBjb25zdCBhY2wgPSBydW5PcHRpb25zLmFjbDtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cDogc3RyaW5nW10gPSBhY2wgfHwgW107XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hID0gcztcbiAgICAgICAgaWYgKGlzTWFzdGVyKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmNhbkFkZEZpZWxkKHNjaGVtYSwgY2xhc3NOYW1lLCBvYmplY3QsIGFjbEdyb3VwLCBydW5PcHRpb25zKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5LCBtYWludGVuYW5jZSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHsgYWNsLCBtYW55LCB1cHNlcnQsIGFkZHNGaWVsZCB9OiBGdWxsUXVlcnlPcHRpb25zID0ge30sXG4gICAgc2tpcFNhbml0aXphdGlvbjogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IHF1ZXJ5O1xuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0gdXBkYXRlO1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICB1cGRhdGUgPSBkZWVwY29weSh1cGRhdGUpO1xuICAgIHZhciByZWxhdGlvblVwZGF0ZXMgPSBbXTtcbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ3VwZGF0ZScpXG4gICAgICApXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLCB1cGRhdGUpO1xuICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgJ3VwZGF0ZScsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKGFkZHNGaWVsZCkge1xuICAgICAgICAgICAgICBxdWVyeSA9IHtcbiAgICAgICAgICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICdhZGRGaWVsZCcsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBmYWxzZSwgdHJ1ZSk7XG4gICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICAhU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkgJiZcbiAgICAgICAgICAgICAgICAgICFpc1NwZWNpYWxVcGRhdGVLZXkocm9vdEZpZWxkTmFtZSlcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIGZvciAoY29uc3QgdXBkYXRlT3BlcmF0aW9uIGluIHVwZGF0ZSkge1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dICYmXG4gICAgICAgICAgICAgICAgICB0eXBlb2YgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSkuc29tZShcbiAgICAgICAgICAgICAgICAgICAgaW5uZXJLZXkgPT4gaW5uZXJLZXkuaW5jbHVkZXMoJyQnKSB8fCBpbm5lcktleS5pbmNsdWRlcygnLicpXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICAgICAgICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB1cGRhdGUgPSB0cmFuc2Zvcm1PYmplY3RBQ0wodXBkYXRlKTtcbiAgICAgICAgICAgICAgbWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2UodXBkYXRlLCBjbGFzc05hbWUsIHRoaXMub3B0aW9ucyk7XG4gICAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwge30pLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0IHx8ICFyZXN1bHQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAobWFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cHNlcnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCxcbiAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmIChza2lwU2FuaXRpemF0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsVXBkYXRlLCByZXN1bHQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvbGxlY3QgYWxsIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIGxpc3Qgb2YgYWxsIHJlbGF0aW9uIHVwZGF0ZXMgdG8gcGVyZm9ybVxuICAvLyBUaGlzIG11dGF0ZXMgdXBkYXRlLlxuICBjb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogP3N0cmluZywgdXBkYXRlOiBhbnkpIHtcbiAgICB2YXIgb3BzID0gW107XG4gICAgdmFyIGRlbGV0ZU1lID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG5cbiAgICB2YXIgcHJvY2VzcyA9IChvcCwga2V5KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdCYXRjaCcpIHtcbiAgICAgICAgZm9yICh2YXIgeCBvZiBvcC5vcHMpIHtcbiAgICAgICAgICBwcm9jZXNzKHgsIGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gdXBkYXRlKSB7XG4gICAgICBwcm9jZXNzKHVwZGF0ZVtrZXldLCBrZXkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBkZWxldGVNZSkge1xuICAgICAgZGVsZXRlIHVwZGF0ZVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gb3BzO1xuICB9XG5cbiAgLy8gUHJvY2Vzc2VzIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbCB1cGRhdGVzIGhhdmUgYmVlbiBwZXJmb3JtZWRcbiAgaGFuZGxlUmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogc3RyaW5nLCB1cGRhdGU6IGFueSwgb3BzOiBhbnkpIHtcbiAgICB2YXIgcGVuZGluZyA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuICAgIG9wcy5mb3JFYWNoKCh7IGtleSwgb3AgfSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5hZGRSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaCh0aGlzLnJlbW92ZVJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwZW5kaW5nKTtcbiAgfVxuXG4gIC8vIEFkZHMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBhZGQgd2FzIHN1Y2Nlc3NmdWwuXG4gIGFkZFJlbGF0aW9uKGtleTogc3RyaW5nLCBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsIGZyb21JZDogc3RyaW5nLCB0b0lkOiBzdHJpbmcpIHtcbiAgICBjb25zdCBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICBkb2MsXG4gICAgICBkb2MsXG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmVzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgcmVtb3ZlIHdhc1xuICAvLyBzdWNjZXNzZnVsLlxuICByZW1vdmVSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgdmFyIGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICBkb2MsXG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCBjYXJlIGlmIHRoZXkgdHJ5IHRvIGRlbGV0ZSBhIG5vbi1leGlzdGVudCByZWxhdGlvbi5cbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBvYmplY3RzIG1hdGNoZXMgdGhpcyBxdWVyeSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgd2FzXG4gIC8vIGRlbGV0ZWQuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuICAvLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4gIC8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG4gIGRlc3Ryb3koXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2RlbGV0ZScpXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAnZGVsZXRlJyxcbiAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZGVsZXRlIGJ5IHF1ZXJ5XG4gICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICB9XG4gICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBmYWxzZSwgZmFsc2UpO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHBhcnNlRm9ybWF0U2NoZW1hID0+XG4gICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gV2hlbiBkZWxldGluZyBzZXNzaW9ucyB3aGlsZSBjaGFuZ2luZyBwYXNzd29yZHMsIGRvbid0IHRocm93IGFuIGVycm9yIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbnkgc2Vzc2lvbnMuXG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gSW5zZXJ0cyBhbiBvYmplY3QgaW50byB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHNhdmVkLlxuICBjcmVhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgY29uc3Qgb3JpZ2luYWxPYmplY3QgPSBvYmplY3Q7XG4gICAgb2JqZWN0ID0gdHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgbWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2Uob2JqZWN0LCBjbGFzc05hbWUsIHRoaXMub3B0aW9ucyk7XG4gICAgb2JqZWN0LmNyZWF0ZWRBdCA9IHsgaXNvOiBvYmplY3QuY3JlYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuICAgIG9iamVjdC51cGRhdGVkQXQgPSB7IGlzbzogb2JqZWN0LnVwZGF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcblxuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBjb25zdCByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBudWxsLCBvYmplY3QpO1xuICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdjcmVhdGUnKVxuICAgICAgICApXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5lbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lKSlcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpKVxuICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICAgICAgICAgIGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUob2JqZWN0KTtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgU2NoZW1hQ29udHJvbGxlci5jb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKHNjaGVtYSksXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxPYmplY3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3QsIHJlc3VsdC5vcHNbMF0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNhbkFkZEZpZWxkKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY2xhc3NTY2hlbWEgPSBzY2hlbWEuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgIGlmICghY2xhc3NTY2hlbWEpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcbiAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSBPYmplY3Qua2V5cyhjbGFzc1NjaGVtYS5maWVsZHMpO1xuICAgIGNvbnN0IG5ld0tleXMgPSBmaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIC8vIFNraXAgZmllbGRzIHRoYXQgYXJlIHVuc2V0XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkXSAmJiBvYmplY3RbZmllbGRdLl9fb3AgJiYgb2JqZWN0W2ZpZWxkXS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2NoZW1hRmllbGRzLmluZGV4T2YoZ2V0Um9vdEZpZWxkTmFtZShmaWVsZCkpIDwgMDtcbiAgICB9KTtcbiAgICBpZiAobmV3S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBhZGRzIGEgbWFya2VyIHRoYXQgbmV3IGZpZWxkIGlzIGJlaW5nIGFkZGluZyBkdXJpbmcgdXBkYXRlXG4gICAgICBydW5PcHRpb25zLmFkZHNGaWVsZCA9IHRydWU7XG5cbiAgICAgIGNvbnN0IGFjdGlvbiA9IHJ1bk9wdGlvbnMuYWN0aW9uO1xuICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2FkZEZpZWxkJywgYWN0aW9uKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV29uJ3QgZGVsZXRlIGNvbGxlY3Rpb25zIGluIHRoZSBzeXN0ZW0gbmFtZXNwYWNlXG4gIC8qKlxuICAgKiBEZWxldGUgYWxsIGNsYXNzZXMgYW5kIGNsZWFycyB0aGUgc2NoZW1hIGNhY2hlXG4gICAqXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gZmFzdCBzZXQgdG8gdHJ1ZSBpZiBpdCdzIG9rIHRvIGp1c3QgZGVsZXRlIHJvd3MgYW5kIG5vdCBpbmRleGVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSB3aGVuIHRoZSBkZWxldGlvbnMgY29tcGxldGVzXG4gICAqL1xuICBkZWxldGVFdmVyeXRoaW5nKGZhc3Q6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8YW55PiB7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQWxsQ2xhc3NlcyhmYXN0KTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2YgcmVsYXRlZCBpZHMgZ2l2ZW4gYW4gb3duaW5nIGlkLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgcmVsYXRlZElkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICBvd25pbmdJZDogc3RyaW5nLFxuICAgIHF1ZXJ5T3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8QXJyYXk8c3RyaW5nPj4ge1xuICAgIGNvbnN0IHsgc2tpcCwgbGltaXQsIHNvcnQgfSA9IHF1ZXJ5T3B0aW9ucztcbiAgICBjb25zdCBmaW5kT3B0aW9ucyA9IHt9O1xuICAgIGlmIChzb3J0ICYmIHNvcnQuY3JlYXRlZEF0ICYmIHRoaXMuYWRhcHRlci5jYW5Tb3J0T25Kb2luVGFibGVzKSB7XG4gICAgICBmaW5kT3B0aW9ucy5zb3J0ID0geyBfaWQ6IHNvcnQuY3JlYXRlZEF0IH07XG4gICAgICBmaW5kT3B0aW9ucy5saW1pdCA9IGxpbWl0O1xuICAgICAgZmluZE9wdGlvbnMuc2tpcCA9IHNraXA7XG4gICAgICBxdWVyeU9wdGlvbnMuc2tpcCA9IDA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLCByZWxhdGlvblNjaGVtYSwgeyBvd25pbmdJZCB9LCBmaW5kT3B0aW9ucylcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5yZWxhdGVkSWQpKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2Ygb3duaW5nIGlkcyBnaXZlbiBzb21lIHJlbGF0ZWQgaWRzLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgb3duaW5nSWRzKGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZywgcmVsYXRlZElkczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoXG4gICAgICAgIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgeyByZWxhdGVkSWQ6IHsgJGluOiByZWxhdGVkSWRzIH0gfSxcbiAgICAgICAgeyBrZXlzOiBbJ293bmluZ0lkJ10gfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0Lm93bmluZ0lkKSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJGluIG9uIHJlbGF0aW9uIGZpZWxkcywgb3JcbiAgLy8gZXF1YWwtdG8tcG9pbnRlciBjb25zdHJhaW50cyBvbiByZWxhdGlvbiBmaWVsZHMuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHNjaGVtYTogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBTZWFyY2ggZm9yIGFuIGluLXJlbGF0aW9uIG9yIGVxdWFsLXRvLXJlbGF0aW9uXG4gICAgLy8gTWFrZSBpdCBzZXF1ZW50aWFsIGZvciBub3csIG5vdCBzdXJlIG9mIHBhcmFsbGVpemF0aW9uIHNpZGUgZWZmZWN0c1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgY29uc3Qgb3JzID0gcXVlcnlbJyRvciddO1xuICAgICAgcHJvbWlzZXMucHVzaChcbiAgICAgICAgLi4ub3JzLm1hcCgoYVF1ZXJ5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBhUXVlcnksIHNjaGVtYSkudGhlbihhUXVlcnkgPT4ge1xuICAgICAgICAgICAgcXVlcnlbJyRvciddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChxdWVyeVsnJGFuZCddKSB7XG4gICAgICBjb25zdCBhbmRzID0gcXVlcnlbJyRhbmQnXTtcbiAgICAgIHByb21pc2VzLnB1c2goXG4gICAgICAgIC4uLmFuZHMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJGFuZCddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3RoZXJLZXlzID0gT2JqZWN0LmtleXMocXVlcnkpLm1hcChrZXkgPT4ge1xuICAgICAgaWYgKGtleSA9PT0gJyRhbmQnIHx8IGtleSA9PT0gJyRvcicpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKCF0IHx8IHQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIGxldCBxdWVyaWVzOiA/KGFueVtdKSA9IG51bGw7XG4gICAgICBpZiAoXG4gICAgICAgIHF1ZXJ5W2tleV0gJiZcbiAgICAgICAgKHF1ZXJ5W2tleV1bJyRpbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5lJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldLl9fdHlwZSA9PSAnUG9pbnRlcicpXG4gICAgICApIHtcbiAgICAgICAgLy8gQnVpbGQgdGhlIGxpc3Qgb2YgcXVlcmllc1xuICAgICAgICBxdWVyaWVzID0gT2JqZWN0LmtleXMocXVlcnlba2V5XSkubWFwKGNvbnN0cmFpbnRLZXkgPT4ge1xuICAgICAgICAgIGxldCByZWxhdGVkSWRzO1xuICAgICAgICAgIGxldCBpc05lZ2F0aW9uID0gZmFsc2U7XG4gICAgICAgICAgaWYgKGNvbnN0cmFpbnRLZXkgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckaW4nKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJGluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmluJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJG5pbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5lJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV1bJyRuZSddLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaXNOZWdhdGlvbixcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyaWVzID0gW3sgaXNOZWdhdGlvbjogZmFsc2UsIHJlbGF0ZWRJZHM6IFtdIH1dO1xuICAgICAgfVxuXG4gICAgICAvLyByZW1vdmUgdGhlIGN1cnJlbnQgcXVlcnlLZXkgYXMgd2UgZG9uLHQgbmVlZCBpdCBhbnltb3JlXG4gICAgICBkZWxldGUgcXVlcnlba2V5XTtcbiAgICAgIC8vIGV4ZWN1dGUgZWFjaCBxdWVyeSBpbmRlcGVuZGVudGx5IHRvIGJ1aWxkIHRoZSBsaXN0IG9mXG4gICAgICAvLyAkaW4gLyAkbmluXG4gICAgICBjb25zdCBwcm9taXNlcyA9IHF1ZXJpZXMubWFwKHEgPT4ge1xuICAgICAgICBpZiAoIXEpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMub3duaW5nSWRzKGNsYXNzTmFtZSwga2V5LCBxLnJlbGF0ZWRJZHMpLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBpZiAocS5pc05lZ2F0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLmFkZE5vdEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKFsuLi5wcm9taXNlcywgLi4ub3RoZXJLZXlzXSkudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkcmVsYXRlZFRvXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IGFueSwgcXVlcnlPcHRpb25zOiBhbnkpOiA/UHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJG9yJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgYVF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5WyckYW5kJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRhbmQnXS5tYXAoYVF1ZXJ5ID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBhUXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICB2YXIgcmVsYXRlZFRvID0gcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICBpZiAocmVsYXRlZFRvKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxhdGVkSWRzKFxuICAgICAgICByZWxhdGVkVG8ub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgcmVsYXRlZFRvLmtleSxcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICApXG4gICAgICAgIC50aGVuKGlkcyA9PiB7XG4gICAgICAgICAgZGVsZXRlIHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge30pO1xuICAgIH1cbiAgfVxuXG4gIGFkZEluT2JqZWN0SWRzSWRzKGlkczogP0FycmF5PHN0cmluZz4gPSBudWxsLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbVN0cmluZzogP0FycmF5PHN0cmluZz4gPVxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJyA/IFtxdWVyeS5vYmplY3RJZF0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21FcTogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRlcSddID8gW3F1ZXJ5Lm9iamVjdElkWyckZXEnXV0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21JbjogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRpbiddID8gcXVlcnkub2JqZWN0SWRbJyRpbiddIDogbnVsbDtcblxuICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgIGNvbnN0IGFsbElkczogQXJyYXk8QXJyYXk8c3RyaW5nPj4gPSBbaWRzRnJvbVN0cmluZywgaWRzRnJvbUVxLCBpZHNGcm9tSW4sIGlkc10uZmlsdGVyKFxuICAgICAgbGlzdCA9PiBsaXN0ICE9PSBudWxsXG4gICAgKTtcbiAgICBjb25zdCB0b3RhbExlbmd0aCA9IGFsbElkcy5yZWR1Y2UoKG1lbW8sIGxpc3QpID0+IG1lbW8gKyBsaXN0Lmxlbmd0aCwgMCk7XG5cbiAgICBsZXQgaWRzSW50ZXJzZWN0aW9uID0gW107XG4gICAgaWYgKHRvdGFsTGVuZ3RoID4gMTI1KSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QuYmlnKGFsbElkcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdChhbGxJZHMpO1xuICAgIH1cblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA9IGlkc0ludGVyc2VjdGlvbjtcblxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIGFkZE5vdEluT2JqZWN0SWRzSWRzKGlkczogc3RyaW5nW10gPSBbXSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21OaW4gPSBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJG5pbiddID8gcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA6IFtdO1xuICAgIGxldCBhbGxJZHMgPSBbLi4uaWRzRnJvbU5pbiwgLi4uaWRzXS5maWx0ZXIobGlzdCA9PiBsaXN0ICE9PSBudWxsKTtcblxuICAgIC8vIG1ha2UgYSBzZXQgYW5kIHNwcmVhZCB0byByZW1vdmUgZHVwbGljYXRlc1xuICAgIGFsbElkcyA9IFsuLi5uZXcgU2V0KGFsbElkcyldO1xuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPSBhbGxJZHM7XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gUnVucyBhIHF1ZXJ5IG9uIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhIGxpc3Qgb2YgaXRlbXMuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgc2tpcCAgICBudW1iZXIgb2YgcmVzdWx0cyB0byBza2lwLlxuICAvLyAgIGxpbWl0ICAgbGltaXQgdG8gdGhpcyBudW1iZXIgb2YgcmVzdWx0cy5cbiAgLy8gICBzb3J0ICAgIGFuIG9iamVjdCB3aGVyZSBrZXlzIGFyZSB0aGUgZmllbGRzIHRvIHNvcnQgYnkuXG4gIC8vICAgICAgICAgICB0aGUgdmFsdWUgaXMgKzEgZm9yIGFzY2VuZGluZywgLTEgZm9yIGRlc2NlbmRpbmcuXG4gIC8vICAgY291bnQgICBydW4gYSBjb3VudCBpbnN0ZWFkIG9mIHJldHVybmluZyByZXN1bHRzLlxuICAvLyAgIGFjbCAgICAgcmVzdHJpY3QgdGhpcyBvcGVyYXRpb24gd2l0aCBhbiBBQ0wgZm9yIHRoZSBwcm92aWRlZCBhcnJheVxuICAvLyAgICAgICAgICAgb2YgdXNlciBvYmplY3RJZHMgYW5kIHJvbGVzLiBhY2w6IG51bGwgbWVhbnMgbm8gdXNlci5cbiAgLy8gICAgICAgICAgIHdoZW4gdGhpcyBmaWVsZCBpcyBub3QgcHJlc2VudCwgZG9uJ3QgZG8gYW55dGhpbmcgcmVnYXJkaW5nIEFDTHMuXG4gIC8vICBjYXNlSW5zZW5zaXRpdmUgbWFrZSBzdHJpbmcgY29tcGFyaXNvbnMgY2FzZSBpbnNlbnNpdGl2ZVxuICAvLyBUT0RPOiBtYWtlIHVzZXJJZHMgbm90IG5lZWRlZCBoZXJlLiBUaGUgZGIgYWRhcHRlciBzaG91bGRuJ3Qga25vd1xuICAvLyBhbnl0aGluZyBhYm91dCB1c2VycywgaWRlYWxseS4gVGhlbiwgaW1wcm92ZSB0aGUgZm9ybWF0IG9mIHRoZSBBQ0xcbiAgLy8gYXJnIHRvIHdvcmsgbGlrZSB0aGUgb3RoZXJzLlxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgYWNsLFxuICAgICAgc29ydCA9IHt9LFxuICAgICAgY291bnQsXG4gICAgICBrZXlzLFxuICAgICAgb3AsXG4gICAgICBkaXN0aW5jdCxcbiAgICAgIHBpcGVsaW5lLFxuICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICBoaW50LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlID0gZmFsc2UsXG4gICAgICBleHBsYWluLFxuICAgIH06IGFueSA9IHt9LFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgaXNNYWludGVuYW5jZSA9IGF1dGguaXNNYWludGVuYW5jZTtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkIHx8IGlzTWFpbnRlbmFuY2U7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgb3AgPVxuICAgICAgb3AgfHwgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PSAnc3RyaW5nJyAmJiBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAxID8gJ2dldCcgOiAnZmluZCcpO1xuICAgIC8vIENvdW50IG9wZXJhdGlvbiBpZiBjb3VudGluZ1xuICAgIG9wID0gY291bnQgPT09IHRydWUgPyAnY291bnQnIDogb3A7XG5cbiAgICBsZXQgY2xhc3NFeGlzdHMgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAvL0FsbG93IHZvbGF0aWxlIGNsYXNzZXMgaWYgcXVlcnlpbmcgd2l0aCBNYXN0ZXIgKGZvciBfUHVzaFN0YXR1cylcbiAgICAgIC8vVE9ETzogTW92ZSB2b2xhdGlsZSBjbGFzc2VzIGNvbmNlcHQgaW50byBtb25nbyBhZGFwdGVyLCBwb3N0Z3JlcyBhZGFwdGVyIHNob3VsZG4ndCBjYXJlXG4gICAgICAvL3RoYXQgYXBpLnBhcnNlLmNvbSBicmVha3Mgd2hlbiBfUHVzaFN0YXR1cyBleGlzdHMgaW4gbW9uZ28uXG4gICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgaXNNYXN0ZXIpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gQmVoYXZpb3IgZm9yIG5vbi1leGlzdGVudCBjbGFzc2VzIGlzIGtpbmRhIHdlaXJkIG9uIFBhcnNlLmNvbS4gUHJvYmFibHkgZG9lc24ndCBtYXR0ZXIgdG9vIG11Y2guXG4gICAgICAgICAgLy8gRm9yIG5vdywgcHJldGVuZCB0aGUgY2xhc3MgZXhpc3RzIGJ1dCBoYXMgbm8gb2JqZWN0cyxcbiAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xhc3NFeGlzdHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgLy8gUGFyc2UuY29tIHRyZWF0cyBxdWVyaWVzIG9uIF9jcmVhdGVkX2F0IGFuZCBfdXBkYXRlZF9hdCBhcyBpZiB0aGV5IHdlcmUgcXVlcmllcyBvbiBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdCxcbiAgICAgICAgICAvLyBzbyBkdXBsaWNhdGUgdGhhdCBiZWhhdmlvciBoZXJlLiBJZiBib3RoIGFyZSBzcGVjaWZpZWQsIHRoZSBjb3JyZWN0IGJlaGF2aW9yIHRvIG1hdGNoIFBhcnNlLmNvbSBpcyB0b1xuICAgICAgICAgIC8vIHVzZSB0aGUgb25lIHRoYXQgYXBwZWFycyBmaXJzdCBpbiB0aGUgc29ydCBsaXN0LlxuICAgICAgICAgIGlmIChzb3J0Ll9jcmVhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LmNyZWF0ZWRBdCA9IHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHNvcnQuX3VwZGF0ZWRfYXQpIHtcbiAgICAgICAgICAgIHNvcnQudXBkYXRlZEF0ID0gc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBxdWVyeU9wdGlvbnMgPSB7XG4gICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICBzb3J0LFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZTogdGhpcy5vcHRpb25zLmRpc2FibGVDYXNlSW5zZW5zaXRpdml0eSA/IGZhbHNlIDogY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICB9O1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNvcnQpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgQ2Fubm90IHNvcnQgYnkgJHtmaWVsZE5hbWV9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZS5zcGxpdCgnLicpWzBdXSAmJiBmaWVsZE5hbWUgIT09ICdzY29yZScpIHtcbiAgICAgICAgICAgICAgZGVsZXRlIHNvcnRbZmllbGROYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wKVxuICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucykpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHM7XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgLyogRG9uJ3QgdXNlIHByb2plY3Rpb25zIHRvIG9wdGltaXplIHRoZSBwcm90ZWN0ZWRGaWVsZHMgc2luY2UgdGhlIHByb3RlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgYmFzZWQgb24gcG9pbnRlci1wZXJtaXNzaW9ucyBhcmUgZGV0ZXJtaW5lZCBhZnRlciBxdWVyeWluZy4gVGhlIGZpbHRlcmluZyBjYW5cbiAgICAgICAgICAgICAgICAgIG92ZXJ3cml0ZSB0aGUgcHJvdGVjdGVkIGZpZWxkcy4gKi9cbiAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ2dldCcpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAndXBkYXRlJyB8fCBvcCA9PT0gJ2RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCBmYWxzZSk7XG4gICAgICAgICAgICAgIGlmIChjb3VudCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNvdW50KFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIGhpbnRcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGRpc3RpbmN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRpc3RpbmN0KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgZGlzdGluY3QpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChwaXBlbGluZSkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5hZ2dyZWdhdGUoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBwaXBlbGluZSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICAgICAgICAgIGV4cGxhaW5cbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAgICAgICAgIC5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKVxuICAgICAgICAgICAgICAgICAgLnRoZW4ob2JqZWN0cyA9PlxuICAgICAgICAgICAgICAgICAgICBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdCA9IHVudHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgICAgICAgICAgICBpc01hc3RlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzTWFpbnRlbmFuY2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3RcbiAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGRlbGV0ZVNjaGVtYShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGxldCBzY2hlbWFDb250cm9sbGVyO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hQ29udHJvbGxlciA9IHM7XG4gICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMuYWRhcHRlci5jb3VudChjbGFzc05hbWUsIHsgZmllbGRzOiB7fSB9LCBudWxsLCAnJywgZmFsc2UpKVxuICAgICAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgICAgIGlmIChjb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIDI1NSxcbiAgICAgICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGlzIG5vdCBlbXB0eSwgY29udGFpbnMgJHtjb3VudH0gb2JqZWN0cywgY2Fubm90IGRyb3Agc2NoZW1hLmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoY2xhc3NOYW1lKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHdhc1BhcnNlQ29sbGVjdGlvbiA9PiB7XG4gICAgICAgICAgICBpZiAod2FzUGFyc2VDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZpbHRlcihcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgICAgIHJlbGF0aW9uRmllbGROYW1lcy5tYXAobmFtZSA9PlxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBuYW1lKSlcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgU2NoZW1hQ2FjaGUuZGVsKGNsYXNzTmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIucmVsb2FkRGF0YSgpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gVGhpcyBoZWxwcyB0byBjcmVhdGUgaW50ZXJtZWRpYXRlIG9iamVjdHMgZm9yIHNpbXBsZXIgY29tcGFyaXNvbiBvZlxuICAvLyBrZXkgdmFsdWUgcGFpcnMgdXNlZCBpbiBxdWVyeSBvYmplY3RzLiBFYWNoIGtleSB2YWx1ZSBwYWlyIHdpbGwgcmVwcmVzZW50ZWRcbiAgLy8gaW4gYSBzaW1pbGFyIHdheSB0byBqc29uXG4gIG9iamVjdFRvRW50cmllc1N0cmluZ3MocXVlcnk6IGFueSk6IEFycmF5PHN0cmluZz4ge1xuICAgIHJldHVybiBPYmplY3QuZW50cmllcyhxdWVyeSkubWFwKGEgPT4gYS5tYXAocyA9PiBKU09OLnN0cmluZ2lmeShzKSkuam9pbignOicpKTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIE9SIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VPck9wZXJhdGlvbihxdWVyeTogeyAkb3I6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kb3IpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRvci5tYXAocSA9PiB0aGlzLm9iamVjdFRvRW50cmllc1N0cmluZ3MocSkpO1xuICAgIGxldCByZXBlYXQgPSBmYWxzZTtcbiAgICBkbyB7XG4gICAgICByZXBlYXQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcmllcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcXVlcmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IFtzaG9ydGVyLCBsb25nZXJdID0gcXVlcmllc1tpXS5sZW5ndGggPiBxdWVyaWVzW2pdLmxlbmd0aCA/IFtqLCBpXSA6IFtpLCBqXTtcbiAgICAgICAgICBjb25zdCBmb3VuZEVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLnJlZHVjZShcbiAgICAgICAgICAgIChhY2MsIGVudHJ5KSA9PiBhY2MgKyAocXVlcmllc1tsb25nZXJdLmluY2x1ZGVzKGVudHJ5KSA/IDEgOiAwKSxcbiAgICAgICAgICAgIDBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNob3J0ZXJFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5sZW5ndGg7XG4gICAgICAgICAgaWYgKGZvdW5kRW50cmllcyA9PT0gc2hvcnRlckVudHJpZXMpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzaG9ydGVyIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGFpbmVkIGluIHRoZSBsb25nZXIgb25lLCB3ZSBjYW4gc3RyaWtlXG4gICAgICAgICAgICAvLyBvdXQgdGhlIGxvbmdlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRvci5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHF1ZXJpZXMuc3BsaWNlKGxvbmdlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJG9yLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kb3JbMF0gfTtcbiAgICAgIGRlbGV0ZSBxdWVyeS4kb3I7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIEFORCBvcGVyYXRpb25zIG1lYW50IHRvIGJlIHVzZWQgb25seSBmb3IgcG9pbnRlciBwZXJtaXNzaW9ucy5cbiAgcmVkdWNlQW5kT3BlcmF0aW9uKHF1ZXJ5OiB7ICRhbmQ6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kYW5kKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXMgPSBxdWVyeS4kYW5kLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgc2hvcnRlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRhbmQuc3BsaWNlKHNob3J0ZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJGFuZC5sZW5ndGggPT09IDEpIHtcbiAgICAgIHF1ZXJ5ID0geyAuLi5xdWVyeSwgLi4ucXVlcnkuJGFuZFswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRhbmQ7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIENvbnN0cmFpbnRzIHF1ZXJ5IHVzaW5nIENMUCdzIHBvaW50ZXIgcGVybWlzc2lvbnMgKFBQKSBpZiBhbnkuXG4gIC8vIDEuIEV0cmFjdCB0aGUgdXNlciBpZCBmcm9tIGNhbGxlcidzIEFDTGdyb3VwO1xuICAvLyAyLiBFeGN0cmFjdCBhIGxpc3Qgb2YgZmllbGQgbmFtZXMgdGhhdCBhcmUgUFAgZm9yIHRhcmdldCBjb2xsZWN0aW9uIGFuZCBvcGVyYXRpb247XG4gIC8vIDMuIENvbnN0cmFpbnQgdGhlIG9yaWdpbmFsIHF1ZXJ5IHNvIHRoYXQgZWFjaCBQUCBmaWVsZCBtdXN0XG4gIC8vIHBvaW50IHRvIGNhbGxlcidzIGlkIChvciBjb250YWluIGl0IGluIGNhc2Ugb2YgUFAgZmllbGQgYmVpbmcgYW4gYXJyYXkpXG4gIGFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdXG4gICk6IGFueSB7XG4gICAgLy8gQ2hlY2sgaWYgY2xhc3MgaGFzIHB1YmxpYyBwZXJtaXNzaW9uIGZvciBvcGVyYXRpb25cbiAgICAvLyBJZiB0aGUgQmFzZUNMUCBwYXNzLCBsZXQgZ28gdGhyb3VnaFxuICAgIGlmIChzY2hlbWEudGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG5cbiAgICBjb25zdCB1c2VyQUNMID0gYWNsR3JvdXAuZmlsdGVyKGFjbCA9PiB7XG4gICAgICByZXR1cm4gYWNsLmluZGV4T2YoJ3JvbGU6JykgIT0gMCAmJiBhY2wgIT0gJyonO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZ3JvdXBLZXkgPVxuICAgICAgWydnZXQnLCAnZmluZCcsICdjb3VudCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xID8gJ3JlYWRVc2VyRmllbGRzJyA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuXG4gICAgY29uc3QgcGVybUZpZWxkcyA9IFtdO1xuXG4gICAgaWYgKHBlcm1zW29wZXJhdGlvbl0gJiYgcGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKSB7XG4gICAgICBwZXJtRmllbGRzLnB1c2goLi4ucGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKTtcbiAgICB9XG5cbiAgICBpZiAocGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgICBpZiAoIXBlcm1GaWVsZHMuaW5jbHVkZXMoZmllbGQpKSB7XG4gICAgICAgICAgcGVybUZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgaWYgKHBlcm1GaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgICAgLy8gTm8gdXNlciBzZXQgcmV0dXJuIHVuZGVmaW5lZFxuICAgICAgLy8gSWYgdGhlIGxlbmd0aCBpcyA+IDEsIHRoYXQgbWVhbnMgd2UgZGlkbid0IGRlLWR1cGUgdXNlcnMgY29ycmVjdGx5XG4gICAgICBpZiAodXNlckFDTC5sZW5ndGggIT0gMSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VySWQgPSB1c2VyQUNMWzBdO1xuICAgICAgY29uc3QgdXNlclBvaW50ZXIgPSB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB1c2VySWQsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBxdWVyaWVzID0gcGVybUZpZWxkcy5tYXAoa2V5ID0+IHtcbiAgICAgICAgY29uc3QgZmllbGREZXNjcmlwdG9yID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9XG4gICAgICAgICAgZmllbGREZXNjcmlwdG9yICYmXG4gICAgICAgICAgdHlwZW9mIGZpZWxkRGVzY3JpcHRvciA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGREZXNjcmlwdG9yLCAndHlwZScpXG4gICAgICAgICAgICA/IGZpZWxkRGVzY3JpcHRvci50eXBlXG4gICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgbGV0IHF1ZXJ5Q2xhdXNlO1xuXG4gICAgICAgIGlmIChmaWVsZFR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHNpbmdsZSBwb2ludGVyIHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB1c2VyUG9pbnRlciB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHVzZXJzLWFycmF5IHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB7ICRhbGw6IFt1c2VyUG9pbnRlcl0gfSB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ09iamVjdCcpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciBvYmplY3Qgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGhpcyBtZWFucyB0aGF0IHRoZXJlIGlzIGEgQ0xQIGZpZWxkIG9mIGFuIHVuZXhwZWN0ZWQgdHlwZS4gVGhpcyBjb25kaXRpb24gc2hvdWxkIG5vdCBoYXBwZW4sIHdoaWNoIGlzXG4gICAgICAgICAgLy8gd2h5IGlzIGJlaW5nIHRyZWF0ZWQgYXMgYW4gZXJyb3IuXG4gICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICBgQW4gdW5leHBlY3RlZCBjb25kaXRpb24gb2NjdXJyZWQgd2hlbiByZXNvbHZpbmcgcG9pbnRlciBwZXJtaXNzaW9uczogJHtjbGFzc05hbWV9ICR7a2V5fWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIGlmIHdlIGFscmVhZHkgaGF2ZSBhIGNvbnN0cmFpbnQgb24gdGhlIGtleSwgdXNlIHRoZSAkYW5kXG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocXVlcnksIGtleSkpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VBbmRPcGVyYXRpb24oeyAkYW5kOiBbcXVlcnlDbGF1c2UsIHF1ZXJ5XSB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBvdGhlcndpc2UganVzdCBhZGQgdGhlIGNvbnN0YWludFxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHF1ZXJ5Q2xhdXNlKTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gcXVlcmllcy5sZW5ndGggPT09IDEgPyBxdWVyaWVzWzBdIDogdGhpcy5yZWR1Y2VPck9wZXJhdGlvbih7ICRvcjogcXVlcmllcyB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlciB8IGFueSxcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55ID0ge30sXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW10sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgcXVlcnlPcHRpb25zOiBGdWxsUXVlcnlPcHRpb25zID0ge31cbiAgKTogbnVsbCB8IHN0cmluZ1tdIHtcbiAgICBjb25zdCBwZXJtcyA9XG4gICAgICBzY2hlbWEgJiYgc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9uc1xuICAgICAgICA/IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKVxuICAgICAgICA6IHNjaGVtYTtcbiAgICBpZiAoIXBlcm1zKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IHBlcm1zLnByb3RlY3RlZEZpZWxkcztcbiAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoYWNsR3JvdXAuaW5kZXhPZihxdWVyeS5vYmplY3RJZCkgPiAtMSkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBmb3IgcXVlcmllcyB3aGVyZSBcImtleXNcIiBhcmUgc2V0IGFuZCBkbyBub3QgaW5jbHVkZSBhbGwgJ3VzZXJGaWVsZCc6e2ZpZWxkfSxcbiAgICAvLyB3ZSBoYXZlIHRvIHRyYW5zcGFyZW50bHkgaW5jbHVkZSBpdCwgYW5kIHRoZW4gcmVtb3ZlIGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50XG4gICAgLy8gQmVjYXVzZSBpZiBzdWNoIGtleSBub3QgcHJvamVjdGVkIHRoZSBwZXJtaXNzaW9uIHdvbid0IGJlIGVuZm9yY2VkIHByb3Blcmx5XG4gICAgLy8gUFMgdGhpcyBpcyBjYWxsZWQgd2hlbiAnZXhjbHVkZUtleXMnIGFscmVhZHkgcmVkdWNlZCB0byAna2V5cydcbiAgICBjb25zdCBwcmVzZXJ2ZUtleXMgPSBxdWVyeU9wdGlvbnMua2V5cztcblxuICAgIC8vIHRoZXNlIGFyZSBrZXlzIHRoYXQgbmVlZCB0byBiZSBpbmNsdWRlZCBvbmx5XG4gICAgLy8gdG8gYmUgYWJsZSB0byBhcHBseSBwcm90ZWN0ZWRGaWVsZHMgYnkgcG9pbnRlclxuICAgIC8vIGFuZCB0aGVuIHVuc2V0IGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50IChsYXRlciBpbiAgZmlsdGVyU2Vuc2l0aXZlRmllbGRzKVxuICAgIGNvbnN0IHNlcnZlck9ubHlLZXlzID0gW107XG5cbiAgICBjb25zdCBhdXRoZW50aWNhdGVkID0gYXV0aC51c2VyO1xuXG4gICAgLy8gbWFwIHRvIGFsbG93IGNoZWNrIHdpdGhvdXQgYXJyYXkgc2VhcmNoXG4gICAgY29uc3Qgcm9sZXMgPSAoYXV0aC51c2VyUm9sZXMgfHwgW10pLnJlZHVjZSgoYWNjLCByKSA9PiB7XG4gICAgICBhY2Nbcl0gPSBwcm90ZWN0ZWRGaWVsZHNbcl07XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIGFycmF5IG9mIHNldHMgb2YgcHJvdGVjdGVkIGZpZWxkcy4gc2VwYXJhdGUgaXRlbSBmb3IgZWFjaCBhcHBsaWNhYmxlIGNyaXRlcmlhXG4gICAgY29uc3QgcHJvdGVjdGVkS2V5c1NldHMgPSBbXTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gc2tpcCB1c2VyRmllbGRzXG4gICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSkge1xuICAgICAgICBpZiAocHJlc2VydmVLZXlzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZygxMCk7XG4gICAgICAgICAgaWYgKCFwcmVzZXJ2ZUtleXMuaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgICAgICAgLy8gMS4gcHV0IGl0IHRoZXJlIHRlbXBvcmFyaWx5XG4gICAgICAgICAgICBxdWVyeU9wdGlvbnMua2V5cyAmJiBxdWVyeU9wdGlvbnMua2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAvLyAyLiBwcmVzZXJ2ZSBpdCBkZWxldGUgbGF0ZXJcbiAgICAgICAgICAgIHNlcnZlck9ubHlLZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIGFkZCBwdWJsaWMgdGllclxuICAgICAgaWYgKGtleSA9PT0gJyonKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG4gICAgICAgICAgLy8gZm9yIGxvZ2dlZCBpbiB1c2Vyc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJvbGVzW2tleV0gJiYga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpIHtcbiAgICAgICAgICAvLyBhZGQgYXBwbGljYWJsZSByb2xlc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocm9sZXNba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjaGVjayBpZiB0aGVyZSdzIGEgcnVsZSBmb3IgY3VycmVudCB1c2VyJ3MgaWRcbiAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgY29uc3QgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuICAgICAgaWYgKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHByZXNlcnZlIGZpZWxkcyB0byBiZSByZW1vdmVkIGJlZm9yZSBzZW5kaW5nIHJlc3BvbnNlIHRvIGNsaWVudFxuICAgIGlmIChzZXJ2ZXJPbmx5S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyA9IHNlcnZlck9ubHlLZXlzO1xuICAgIH1cblxuICAgIGxldCBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5c1NldHMucmVkdWNlKChhY2MsIG5leHQpID0+IHtcbiAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgIGFjYy5wdXNoKC4uLm5leHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCBbXSk7XG5cbiAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgcHJvdGVjdGVkS2V5c1NldHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5cy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHByb3RlY3RlZEtleXM7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkudGhlbih0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uO1xuICAgIH0pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gY29tbWl0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBhYm9ydCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVE9ETzogY3JlYXRlIGluZGV4ZXMgb24gZmlyc3QgY3JlYXRpb24gb2YgYSBfVXNlciBvYmplY3QuIE90aGVyd2lzZSBpdCdzIGltcG9zc2libGUgdG9cbiAgLy8gaGF2ZSBhIFBhcnNlIGFwcCB3aXRob3V0IGl0IGhhdmluZyBhIF9Vc2VyIGNvbGxlY3Rpb24uXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpIHtcbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKHtcbiAgICAgIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXM6IFNjaGVtYUNvbnRyb2xsZXIuVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgICB9KTtcbiAgICBjb25zdCByZXF1aXJlZFVzZXJGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fVXNlcixcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZFJvbGVGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fUm9sZSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0lkZW1wb3RlbmN5LFxuICAgICAgfSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Vc2VyJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Sb2xlJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19JZGVtcG90ZW5jeScpKTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VybmFtZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgaWYgKCF0aGlzLm9wdGlvbnMuZGlzYWJsZUNhc2VJbnNlbnNpdGl2aXR5KSB7XG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddLCAnY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZScsIHRydWUpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSB1c2VybmFtZSBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcblxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfZW1haWwnLCB0cnVlKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgZW1haWwgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXIgZW1haWwgYWRkcmVzc2VzOiAnLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfUm9sZScsIHJlcXVpcmVkUm9sZUZpZWxkcywgWyduYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHJvbGUgbmFtZTogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgIC5lbnN1cmVVbmlxdWVuZXNzKCdfSWRlbXBvdGVuY3knLCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzLCBbJ3JlcUlkJ10pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciBpZGVtcG90ZW5jeSByZXF1ZXN0IElEOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCBpc01vbmdvQWRhcHRlciA9IHRoaXMuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXI7XG4gICAgY29uc3QgaXNQb3N0Z3Jlc0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyO1xuICAgIGlmIChpc01vbmdvQWRhcHRlciB8fCBpc1Bvc3RncmVzQWRhcHRlcikge1xuICAgICAgbGV0IG9wdGlvbnMgPSB7fTtcbiAgICAgIGlmIChpc01vbmdvQWRhcHRlcikge1xuICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgIHR0bDogMCxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHRoaXMuaWRlbXBvdGVuY3lPcHRpb25zO1xuICAgICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gPSB0cnVlO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydleHBpcmUnXSwgJ3R0bCcsIGZhbHNlLCBvcHRpb25zKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIFRUTCBpbmRleCBmb3IgaWRlbXBvdGVuY3kgZXhwaXJlIGRhdGU6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci51cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpO1xuICB9XG5cbiAgX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3Q6IGFueSwga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpIDwgMCkge1xuICAgICAgb2JqZWN0W2tleV0gPSB2YWx1ZVtrZXldO1xuICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICB9XG4gICAgY29uc3QgcGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgIGNvbnN0IGZpcnN0S2V5ID0gcGF0aFswXTtcbiAgICBjb25zdCBuZXh0UGF0aCA9IHBhdGguc2xpY2UoMSkuam9pbignLicpO1xuXG4gICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgIGlmICh0aGlzLm9wdGlvbnMgJiYgdGhpcy5vcHRpb25zLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICAgIGZvciAoY29uc3Qga2V5d29yZCBvZiB0aGlzLm9wdGlvbnMucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgICBjb25zdCBtYXRjaCA9IFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUoXG4gICAgICAgICAgeyBbZmlyc3RLZXldOiB0cnVlLCBbbmV4dFBhdGhdOiB0cnVlIH0sXG4gICAgICAgICAga2V5d29yZC5rZXksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgb2JqZWN0W2ZpcnN0S2V5XSA9IHRoaXMuX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChcbiAgICAgIG9iamVjdFtmaXJzdEtleV0gfHwge30sXG4gICAgICBuZXh0UGF0aCxcbiAgICAgIHZhbHVlW2ZpcnN0S2V5XVxuICAgICk7XG4gICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBfc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdDogYW55LCByZXN1bHQ6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSB7fTtcbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfVxuICAgIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBjb25zdCBrZXlVcGRhdGUgPSBvcmlnaW5hbE9iamVjdFtrZXldO1xuICAgICAgLy8gZGV0ZXJtaW5lIGlmIHRoYXQgd2FzIGFuIG9wXG4gICAgICBpZiAoXG4gICAgICAgIGtleVVwZGF0ZSAmJlxuICAgICAgICB0eXBlb2Yga2V5VXBkYXRlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBrZXlVcGRhdGUuX19vcCAmJlxuICAgICAgICBbJ0FkZCcsICdBZGRVbmlxdWUnLCAnUmVtb3ZlJywgJ0luY3JlbWVudCddLmluZGV4T2Yoa2V5VXBkYXRlLl9fb3ApID4gLTFcbiAgICAgICkge1xuICAgICAgICAvLyBvbmx5IHZhbGlkIG9wcyB0aGF0IHByb2R1Y2UgYW4gYWN0aW9uYWJsZSByZXN1bHRcbiAgICAgICAgLy8gdGhlIG9wIG1heSBoYXZlIGhhcHBlbmVkIG9uIGEga2V5cGF0aFxuICAgICAgICB0aGlzLl9leHBhbmRSZXN1bHRPbktleVBhdGgocmVzcG9uc2UsIGtleSwgcmVzdWx0KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgfVxuXG4gIHN0YXRpYyBfdmFsaWRhdGVRdWVyeTogKGFueSwgYm9vbGVhbiwgYm9vbGVhbiwgYm9vbGVhbikgPT4gdm9pZDtcbiAgc3RhdGljIGZpbHRlclNlbnNpdGl2ZURhdGE6IChib29sZWFuLCBib29sZWFuLCBhbnlbXSwgYW55LCBhbnksIGFueSwgc3RyaW5nLCBhbnlbXSwgYW55KSA9PiB2b2lkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERhdGFiYXNlQ29udHJvbGxlcjtcbi8vIEV4cG9zZSB2YWxpZGF0ZVF1ZXJ5IGZvciB0ZXN0c1xubW9kdWxlLmV4cG9ydHMuX3ZhbGlkYXRlUXVlcnkgPSB2YWxpZGF0ZVF1ZXJ5O1xubW9kdWxlLmV4cG9ydHMuZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IGZpbHRlclNlbnNpdGl2ZURhdGE7XG4iXSwibWFwcGluZ3MiOiI7O0FBS0E7QUFFQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUF3RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUt4RCxTQUFTQSxXQUFXLENBQUNDLEtBQUssRUFBRUMsR0FBRyxFQUFFO0VBQy9CLE1BQU1DLFFBQVEsR0FBR0MsZUFBQyxDQUFDQyxTQUFTLENBQUNKLEtBQUssQ0FBQztFQUNuQztFQUNBRSxRQUFRLENBQUNHLE1BQU0sR0FBRztJQUFFQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBR0wsR0FBRztFQUFFLENBQUM7RUFDekMsT0FBT0MsUUFBUTtBQUNqQjtBQUVBLFNBQVNLLFVBQVUsQ0FBQ1AsS0FBSyxFQUFFQyxHQUFHLEVBQUU7RUFDOUIsTUFBTUMsUUFBUSxHQUFHQyxlQUFDLENBQUNDLFNBQVMsQ0FBQ0osS0FBSyxDQUFDO0VBQ25DO0VBQ0FFLFFBQVEsQ0FBQ00sTUFBTSxHQUFHO0lBQUVGLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBR0wsR0FBRztFQUFFLENBQUM7RUFDOUMsT0FBT0MsUUFBUTtBQUNqQjs7QUFFQTtBQUNBLE1BQU1PLGtCQUFrQixHQUFHLFFBQXdCO0VBQUEsSUFBdkI7TUFBRUM7SUFBZSxDQUFDO0lBQVJDLE1BQU07RUFDMUMsSUFBSSxDQUFDRCxHQUFHLEVBQUU7SUFDUixPQUFPQyxNQUFNO0VBQ2Y7RUFFQUEsTUFBTSxDQUFDTixN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