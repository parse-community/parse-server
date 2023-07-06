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
    try {
      _Utils.default.checkProhibitedKeywords(this.options, update);
    } catch (error) {
      return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, error));
    }
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
    try {
      _Utils.default.checkProhibitedKeywords(this.options, object);
    } catch (error) {
      return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, error));
    }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJhZGRXcml0ZUFDTCIsInF1ZXJ5IiwiYWNsIiwibmV3UXVlcnkiLCJfIiwiY2xvbmVEZWVwIiwiX3dwZXJtIiwiJGluIiwiYWRkUmVhZEFDTCIsIl9ycGVybSIsInRyYW5zZm9ybU9iamVjdEFDTCIsIkFDTCIsInJlc3VsdCIsImVudHJ5IiwicmVhZCIsInB1c2giLCJ3cml0ZSIsInNwZWNpYWxRdWVyeUtleXMiLCJzcGVjaWFsTWFzdGVyUXVlcnlLZXlzIiwidmFsaWRhdGVRdWVyeSIsImlzTWFzdGVyIiwiaXNNYWludGVuYW5jZSIsInVwZGF0ZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiJG9yIiwiQXJyYXkiLCJmb3JFYWNoIiwidmFsdWUiLCIkYW5kIiwiJG5vciIsImxlbmd0aCIsIk9iamVjdCIsImtleXMiLCJrZXkiLCIkcmVnZXgiLCIkb3B0aW9ucyIsIm1hdGNoIiwiaW5jbHVkZXMiLCJJTlZBTElEX0tFWV9OQU1FIiwiZmlsdGVyU2Vuc2l0aXZlRGF0YSIsImFjbEdyb3VwIiwiYXV0aCIsIm9wZXJhdGlvbiIsInNjaGVtYSIsImNsYXNzTmFtZSIsInByb3RlY3RlZEZpZWxkcyIsIm9iamVjdCIsInVzZXJJZCIsInVzZXIiLCJpZCIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNSZWFkT3BlcmF0aW9uIiwiaW5kZXhPZiIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtIiwiZmlsdGVyIiwic3RhcnRzV2l0aCIsIm1hcCIsInN1YnN0cmluZyIsIm5ld1Byb3RlY3RlZEZpZWxkcyIsIm92ZXJyaWRlUHJvdGVjdGVkRmllbGRzIiwicG9pbnRlclBlcm0iLCJwb2ludGVyUGVybUluY2x1ZGVzVXNlciIsInJlYWRVc2VyRmllbGRWYWx1ZSIsImlzQXJyYXkiLCJzb21lIiwib2JqZWN0SWQiLCJmaWVsZHMiLCJ2IiwiaXNVc2VyQ2xhc3MiLCJwYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJzZXNzaW9uVG9rZW4iLCJrIiwidGVtcG9yYXJ5S2V5cyIsImNoYXJBdCIsImF1dGhEYXRhIiwic3BlY2lhbEtleXNGb3JVcGRhdGUiLCJpc1NwZWNpYWxVcGRhdGVLZXkiLCJqb2luVGFibGVOYW1lIiwiZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSIsIl9fb3AiLCJhbW91bnQiLCJJTlZBTElEX0pTT04iLCJvYmplY3RzIiwiQ09NTUFORF9VTkFWQUlMQUJMRSIsInRyYW5zZm9ybUF1dGhEYXRhIiwicHJvdmlkZXIiLCJwcm92aWRlckRhdGEiLCJmaWVsZE5hbWUiLCJ0eXBlIiwidW50cmFuc2Zvcm1PYmplY3RBQ0wiLCJvdXRwdXQiLCJnZXRSb290RmllbGROYW1lIiwic3BsaXQiLCJyZWxhdGlvblNjaGVtYSIsInJlbGF0ZWRJZCIsIm93bmluZ0lkIiwibWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2UiLCJvcHRpb25zIiwiZm9yY2VFbWFpbEFuZFVzZXJuYW1lVG9Mb3dlckNhc2UiLCJ0b0xvd2VyQ2FzZUZpZWxkcyIsInRvTG93ZXJDYXNlIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJhZGFwdGVyIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwic2NoZW1hUHJvbWlzZSIsIl90cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbGxlY3Rpb25FeGlzdHMiLCJjbGFzc0V4aXN0cyIsInB1cmdlQ29sbGVjdGlvbiIsImxvYWRTY2hlbWEiLCJ0aGVuIiwic2NoZW1hQ29udHJvbGxlciIsImdldE9uZVNjaGVtYSIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwidmFsaWRhdGVDbGFzc05hbWUiLCJTY2hlbWFDb250cm9sbGVyIiwiY2xhc3NOYW1lSXNWYWxpZCIsIlByb21pc2UiLCJyZWplY3QiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJyZXNvbHZlIiwiY2xlYXJDYWNoZSIsImxvYWQiLCJsb2FkU2NoZW1hSWZOZWVkZWQiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInQiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsIm1haW50ZW5hbmNlIiwidW5kZWZpbmVkIiwicyIsImNhbkFkZEZpZWxkIiwibWFueSIsInVwc2VydCIsImFkZHNGaWVsZCIsInNraXBTYW5pdGl6YXRpb24iLCJ2YWxpZGF0ZU9ubHkiLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJVdGlscyIsImNoZWNrUHJvaGliaXRlZEtleXdvcmRzIiwiZXJyb3IiLCJvcmlnaW5hbFF1ZXJ5Iiwib3JpZ2luYWxVcGRhdGUiLCJkZWVwY29weSIsInJlbGF0aW9uVXBkYXRlcyIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNvbGxlY3RSZWxhdGlvblVwZGF0ZXMiLCJhZGRQb2ludGVyUGVybWlzc2lvbnMiLCJjYXRjaCIsInJvb3RGaWVsZE5hbWUiLCJmaWVsZE5hbWVJc1ZhbGlkIiwidXBkYXRlT3BlcmF0aW9uIiwiaW5uZXJLZXkiLCJJTlZBTElEX05FU1RFRF9LRVkiLCJmaW5kIiwiT0JKRUNUX05PVF9GT1VORCIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBzZXJ0T25lT2JqZWN0IiwiZmluZE9uZUFuZFVwZGF0ZSIsImhhbmRsZVJlbGF0aW9uVXBkYXRlcyIsIl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0Iiwib3BzIiwiZGVsZXRlTWUiLCJwcm9jZXNzIiwib3AiLCJ4IiwicGVuZGluZyIsImFkZFJlbGF0aW9uIiwicmVtb3ZlUmVsYXRpb24iLCJhbGwiLCJmcm9tQ2xhc3NOYW1lIiwiZnJvbUlkIiwidG9JZCIsImRvYyIsImNvZGUiLCJkZXN0cm95IiwicGFyc2VGb3JtYXRTY2hlbWEiLCJjcmVhdGUiLCJvcmlnaW5hbE9iamVjdCIsImNyZWF0ZWRBdCIsImlzbyIsIl9fdHlwZSIsInVwZGF0ZWRBdCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImNyZWF0ZU9iamVjdCIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJjbGFzc1NjaGVtYSIsInNjaGVtYURhdGEiLCJzY2hlbWFGaWVsZHMiLCJuZXdLZXlzIiwiZmllbGQiLCJhY3Rpb24iLCJkZWxldGVFdmVyeXRoaW5nIiwiZmFzdCIsIlNjaGVtYUNhY2hlIiwiY2xlYXIiLCJkZWxldGVBbGxDbGFzc2VzIiwicmVsYXRlZElkcyIsInF1ZXJ5T3B0aW9ucyIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJmaW5kT3B0aW9ucyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJfaWQiLCJyZXN1bHRzIiwib3duaW5nSWRzIiwicmVkdWNlSW5SZWxhdGlvbiIsInByb21pc2VzIiwib3JzIiwiYVF1ZXJ5IiwiaW5kZXgiLCJhbmRzIiwib3RoZXJLZXlzIiwicXVlcmllcyIsImNvbnN0cmFpbnRLZXkiLCJpc05lZ2F0aW9uIiwiciIsInEiLCJpZHMiLCJhZGROb3RJbk9iamVjdElkc0lkcyIsImFkZEluT2JqZWN0SWRzSWRzIiwicmVkdWNlUmVsYXRpb25LZXlzIiwicmVsYXRlZFRvIiwiaWRzRnJvbVN0cmluZyIsImlkc0Zyb21FcSIsImlkc0Zyb21JbiIsImFsbElkcyIsImxpc3QiLCJ0b3RhbExlbmd0aCIsInJlZHVjZSIsIm1lbW8iLCJpZHNJbnRlcnNlY3Rpb24iLCJpbnRlcnNlY3QiLCJiaWciLCIkZXEiLCJpZHNGcm9tTmluIiwiU2V0IiwiJG5pbiIsImNvdW50IiwiZGlzdGluY3QiLCJwaXBlbGluZSIsInJlYWRQcmVmZXJlbmNlIiwiaGludCIsImNhc2VJbnNlbnNpdGl2ZSIsImV4cGxhaW4iLCJfY3JlYXRlZF9hdCIsIl91cGRhdGVkX2F0IiwiZGlzYWJsZUNhc2VJbnNlbnNpdGl2aXR5IiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiYWdncmVnYXRlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZGVsZXRlU2NoZW1hIiwiZGVsZXRlQ2xhc3MiLCJ3YXNQYXJzZUNvbGxlY3Rpb24iLCJyZWxhdGlvbkZpZWxkTmFtZXMiLCJuYW1lIiwiZGVsIiwicmVsb2FkRGF0YSIsIm9iamVjdFRvRW50cmllc1N0cmluZ3MiLCJlbnRyaWVzIiwiYSIsIkpTT04iLCJzdHJpbmdpZnkiLCJqb2luIiwicmVkdWNlT3JPcGVyYXRpb24iLCJyZXBlYXQiLCJpIiwiaiIsInNob3J0ZXIiLCJsb25nZXIiLCJmb3VuZEVudHJpZXMiLCJhY2MiLCJzaG9ydGVyRW50cmllcyIsInNwbGljZSIsInJlZHVjZUFuZE9wZXJhdGlvbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsInVzZXJBQ0wiLCJncm91cEtleSIsInBlcm1GaWVsZHMiLCJwb2ludGVyRmllbGRzIiwidXNlclBvaW50ZXIiLCJmaWVsZERlc2NyaXB0b3IiLCJmaWVsZFR5cGUiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJxdWVyeUNsYXVzZSIsIiRhbGwiLCJhc3NpZ24iLCJwcmVzZXJ2ZUtleXMiLCJzZXJ2ZXJPbmx5S2V5cyIsImF1dGhlbnRpY2F0ZWQiLCJyb2xlcyIsInVzZXJSb2xlcyIsInByb3RlY3RlZEtleXNTZXRzIiwicHJvdGVjdGVkS2V5cyIsIm5leHQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInJlcXVpcmVkVXNlckZpZWxkcyIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJfVXNlciIsInJlcXVpcmVkUm9sZUZpZWxkcyIsIl9Sb2xlIiwicmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcyIsIl9JZGVtcG90ZW5jeSIsImVuc3VyZVVuaXF1ZW5lc3MiLCJsb2dnZXIiLCJ3YXJuIiwiZW5zdXJlSW5kZXgiLCJpc01vbmdvQWRhcHRlciIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJpc1Bvc3RncmVzQWRhcHRlciIsIlBvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJ0dGwiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJfZXhwYW5kUmVzdWx0T25LZXlQYXRoIiwicGF0aCIsImZpcnN0S2V5IiwibmV4dFBhdGgiLCJzbGljZSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJrZXl3b3JkIiwib2JqZWN0Q29udGFpbnNLZXlWYWx1ZSIsInJlc3BvbnNlIiwia2V5VXBkYXRlIiwibW9kdWxlIiwiZXhwb3J0cyIsIl92YWxpZGF0ZVF1ZXJ5Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyLvu78vLyBAZmxvd1xuLy8gQSBkYXRhYmFzZSBhZGFwdGVyIHRoYXQgd29ya3Mgd2l0aCBkYXRhIGV4cG9ydGVkIGZyb20gdGhlIGhvc3RlZFxuLy8gUGFyc2UgZGF0YWJhc2UuXG5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGludGVyc2VjdCBmcm9tICdpbnRlcnNlY3QnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCAqIGFzIFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgdHlwZSB7IExvYWRTY2hlbWFPcHRpb25zIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgdHlwZSB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4uL09wdGlvbnMnO1xuaW1wb3J0IHR5cGUgeyBRdWVyeU9wdGlvbnMsIEZ1bGxRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcblxuZnVuY3Rpb24gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ193cGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fd3Blcm0gPSB7ICRpbjogW251bGwsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG5mdW5jdGlvbiBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfcnBlcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3JwZXJtID0geyAkaW46IFtudWxsLCAnKicsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG4vLyBUcmFuc2Zvcm1zIGEgUkVTVCBBUEkgZm9ybWF0dGVkIEFDTCBvYmplY3QgdG8gb3VyIHR3by1maWVsZCBtb25nbyBmb3JtYXQuXG5jb25zdCB0cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBBQ0wsIC4uLnJlc3VsdCB9KSA9PiB7XG4gIGlmICghQUNMKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHJlc3VsdC5fd3Blcm0gPSBbXTtcbiAgcmVzdWx0Ll9ycGVybSA9IFtdO1xuXG4gIGZvciAoY29uc3QgZW50cnkgaW4gQUNMKSB7XG4gICAgaWYgKEFDTFtlbnRyeV0ucmVhZCkge1xuICAgICAgcmVzdWx0Ll9ycGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gICAgaWYgKEFDTFtlbnRyeV0ud3JpdGUpIHtcbiAgICAgIHJlc3VsdC5fd3Blcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5jb25zdCBzcGVjaWFsUXVlcnlLZXlzID0gWyckYW5kJywgJyRvcicsICckbm9yJywgJ19ycGVybScsICdfd3Blcm0nXTtcbmNvbnN0IHNwZWNpYWxNYXN0ZXJRdWVyeUtleXMgPSBbXG4gIC4uLnNwZWNpYWxRdWVyeUtleXMsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ190b21ic3RvbmUnLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IHZhbGlkYXRlUXVlcnkgPSAoXG4gIHF1ZXJ5OiBhbnksXG4gIGlzTWFzdGVyOiBib29sZWFuLFxuICBpc01haW50ZW5hbmNlOiBib29sZWFuLFxuICB1cGRhdGU6IGJvb2xlYW5cbik6IHZvaWQgPT4ge1xuICBpZiAoaXNNYWludGVuYW5jZSkge1xuICAgIGlzTWFzdGVyID0gdHJ1ZTtcbiAgfVxuICBpZiAocXVlcnkuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdDYW5ub3QgcXVlcnkgb24gQUNMLicpO1xuICB9XG5cbiAgaWYgKHF1ZXJ5LiRvcikge1xuICAgIGlmIChxdWVyeS4kb3IgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJG9yLmZvckVhY2godmFsdWUgPT4gdmFsaWRhdGVRdWVyeSh2YWx1ZSwgaXNNYXN0ZXIsIGlzTWFpbnRlbmFuY2UsIHVwZGF0ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkb3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kYW5kKSB7XG4gICAgaWYgKHF1ZXJ5LiRhbmQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJGFuZC5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCB1cGRhdGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJGFuZCBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRub3IpIHtcbiAgICBpZiAocXVlcnkuJG5vciBpbnN0YW5jZW9mIEFycmF5ICYmIHF1ZXJ5LiRub3IubGVuZ3RoID4gMCkge1xuICAgICAgcXVlcnkuJG5vci5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCB1cGRhdGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAnQmFkICRub3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IG9mIGF0IGxlYXN0IDEgdmFsdWUuJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmIChxdWVyeSAmJiBxdWVyeVtrZXldICYmIHF1ZXJ5W2tleV0uJHJlZ2V4KSB7XG4gICAgICBpZiAodHlwZW9mIHF1ZXJ5W2tleV0uJG9wdGlvbnMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmICghcXVlcnlba2V5XS4kb3B0aW9ucy5tYXRjaCgvXltpbXhzXSskLykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgYEJhZCAkb3B0aW9ucyB2YWx1ZSBmb3IgcXVlcnk6ICR7cXVlcnlba2V5XS4kb3B0aW9uc31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoXG4gICAgICAha2V5Lm1hdGNoKC9eW2EtekEtWl1bYS16QS1aMC05X1xcLl0qJC8pICYmXG4gICAgICAoKCFzcGVjaWFsUXVlcnlLZXlzLmluY2x1ZGVzKGtleSkgJiYgIWlzTWFzdGVyICYmICF1cGRhdGUpIHx8XG4gICAgICAgICh1cGRhdGUgJiYgaXNNYXN0ZXIgJiYgIXNwZWNpYWxNYXN0ZXJRdWVyeUtleXMuaW5jbHVkZXMoa2V5KSkpXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQga2V5IG5hbWU6ICR7a2V5fWApO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vLyBGaWx0ZXJzIG91dCBhbnkgZGF0YSB0aGF0IHNob3VsZG4ndCBiZSBvbiB0aGlzIFJFU1QtZm9ybWF0dGVkIG9iamVjdC5cbmNvbnN0IGZpbHRlclNlbnNpdGl2ZURhdGEgPSAoXG4gIGlzTWFzdGVyOiBib29sZWFuLFxuICBpc01haW50ZW5hbmNlOiBib29sZWFuLFxuICBhY2xHcm91cDogYW55W10sXG4gIGF1dGg6IGFueSxcbiAgb3BlcmF0aW9uOiBhbnksXG4gIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyIHwgYW55LFxuICBjbGFzc05hbWU6IHN0cmluZyxcbiAgcHJvdGVjdGVkRmllbGRzOiBudWxsIHwgQXJyYXk8YW55PixcbiAgb2JqZWN0OiBhbnlcbikgPT4ge1xuICBsZXQgdXNlcklkID0gbnVsbDtcbiAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG5cbiAgLy8gcmVwbGFjZSBwcm90ZWN0ZWRGaWVsZHMgd2hlbiB1c2luZyBwb2ludGVyLXBlcm1pc3Npb25zXG4gIGNvbnN0IHBlcm1zID1cbiAgICBzY2hlbWEgJiYgc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyA/IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSA6IHt9O1xuICBpZiAocGVybXMpIHtcbiAgICBjb25zdCBpc1JlYWRPcGVyYXRpb24gPSBbJ2dldCcsICdmaW5kJ10uaW5kZXhPZihvcGVyYXRpb24pID4gLTE7XG5cbiAgICBpZiAoaXNSZWFkT3BlcmF0aW9uICYmIHBlcm1zLnByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gZXh0cmFjdCBwcm90ZWN0ZWRGaWVsZHMgYWRkZWQgd2l0aCB0aGUgcG9pbnRlci1wZXJtaXNzaW9uIHByZWZpeFxuICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0gPSBPYmplY3Qua2V5cyhwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpXG4gICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICByZXR1cm4geyBrZXk6IGtleS5zdWJzdHJpbmcoMTApLCB2YWx1ZTogcGVybXMucHJvdGVjdGVkRmllbGRzW2tleV0gfTtcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG5ld1Byb3RlY3RlZEZpZWxkczogQXJyYXk8c3RyaW5nPltdID0gW107XG4gICAgICBsZXQgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSBmYWxzZTtcblxuICAgICAgLy8gY2hlY2sgaWYgdGhlIG9iamVjdCBncmFudHMgdGhlIGN1cnJlbnQgdXNlciBhY2Nlc3MgYmFzZWQgb24gdGhlIGV4dHJhY3RlZCBmaWVsZHNcbiAgICAgIHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtLmZvckVhY2gocG9pbnRlclBlcm0gPT4ge1xuICAgICAgICBsZXQgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgcmVhZFVzZXJGaWVsZFZhbHVlID0gb2JqZWN0W3BvaW50ZXJQZXJtLmtleV07XG4gICAgICAgIGlmIChyZWFkVXNlckZpZWxkVmFsdWUpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyZWFkVXNlckZpZWxkVmFsdWUpKSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IHJlYWRVc2VyRmllbGRWYWx1ZS5zb21lKFxuICAgICAgICAgICAgICB1c2VyID0+IHVzZXIub2JqZWN0SWQgJiYgdXNlci5vYmplY3RJZCA9PT0gdXNlcklkXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9XG4gICAgICAgICAgICAgIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCAmJiByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgPT09IHVzZXJJZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocG9pbnRlclBlcm1JbmNsdWRlc1VzZXIpIHtcbiAgICAgICAgICBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IHRydWU7XG4gICAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocG9pbnRlclBlcm0udmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gaWYgYXQgbGVhc3Qgb25lIHBvaW50ZXItcGVybWlzc2lvbiBhZmZlY3RlZCB0aGUgY3VycmVudCB1c2VyXG4gICAgICAvLyBpbnRlcnNlY3QgdnMgcHJvdGVjdGVkRmllbGRzIGZyb20gcHJldmlvdXMgc3RhZ2UgKEBzZWUgYWRkUHJvdGVjdGVkRmllbGRzKVxuICAgICAgLy8gU2V0cyB0aGVvcnkgKGludGVyc2VjdGlvbnMpOiBBIHggKEIgeCBDKSA9PSAoQSB4IEIpIHggQ1xuICAgICAgaWYgKG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwcm90ZWN0ZWRGaWVsZHMpO1xuICAgICAgfVxuICAgICAgLy8gaW50ZXJzZWN0IGFsbCBzZXRzIG9mIHByb3RlY3RlZEZpZWxkc1xuICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLmZvckVhY2goZmllbGRzID0+IHtcbiAgICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICAgIC8vIGlmIHRoZXJlJ3JlIG5vIHByb3RjdGVkRmllbGRzIGJ5IG90aGVyIGNyaXRlcmlhICggaWQgLyByb2xlIC8gYXV0aClcbiAgICAgICAgICAvLyB0aGVuIHdlIG11c3QgaW50ZXJzZWN0IGVhY2ggc2V0IChwZXIgdXNlckZpZWxkKVxuICAgICAgICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBmaWVsZHM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHByb3RlY3RlZEZpZWxkcy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaXNVc2VyQ2xhc3MgPSBjbGFzc05hbWUgPT09ICdfVXNlcic7XG4gIGlmIChpc1VzZXJDbGFzcykge1xuICAgIG9iamVjdC5wYXNzd29yZCA9IG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIGRlbGV0ZSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBkZWxldGUgb2JqZWN0LnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIGlmIChpc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8qIHNwZWNpYWwgdHJlYXQgZm9yIHRoZSB1c2VyIGNsYXNzOiBkb24ndCBmaWx0ZXIgcHJvdGVjdGVkRmllbGRzIGlmIGN1cnJlbnRseSBsb2dnZWRpbiB1c2VyIGlzXG4gIHRoZSByZXRyaWV2ZWQgdXNlciAqL1xuICBpZiAoIShpc1VzZXJDbGFzcyAmJiB1c2VySWQgJiYgb2JqZWN0Lm9iamVjdElkID09PSB1c2VySWQpKSB7XG4gICAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG5cbiAgICAvLyBmaWVsZHMgbm90IHJlcXVlc3RlZCBieSBjbGllbnQgKGV4Y2x1ZGVkKSxcbiAgICAvLyBidXQgd2VyZSBuZWVkZWQgdG8gYXBwbHkgcHJvdGVjdGVkRmllbGRzXG4gICAgcGVybXM/LnByb3RlY3RlZEZpZWxkcz8udGVtcG9yYXJ5S2V5cz8uZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuICB9XG5cbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKGtleS5jaGFyQXQoMCkgPT09ICdfJykge1xuICAgICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgIH1cbiAgfVxuXG4gIGlmICghaXNVc2VyQ2xhc3MgfHwgaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgaWYgKGFjbEdyb3VwLmluZGV4T2Yob2JqZWN0Lm9iamVjdElkKSA+IC0xKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuLy8gUnVucyBhbiB1cGRhdGUgb24gdGhlIGRhdGFiYXNlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGFuIG9iamVjdCB3aXRoIHRoZSBuZXcgdmFsdWVzIGZvciBmaWVsZFxuLy8gbW9kaWZpY2F0aW9ucyB0aGF0IGRvbid0IGtub3cgdGhlaXIgcmVzdWx0cyBhaGVhZCBvZiB0aW1lLCBsaWtlXG4vLyAnaW5jcmVtZW50Jy5cbi8vIE9wdGlvbnM6XG4vLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbi8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbi8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG5jb25zdCBzcGVjaWFsS2V5c0ZvclVwZGF0ZSA9IFtcbiAgJ19oYXNoZWRfcGFzc3dvcmQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxVcGRhdGVLZXkgPSBrZXkgPT4ge1xuICByZXR1cm4gc3BlY2lhbEtleXNGb3JVcGRhdGUuaW5kZXhPZihrZXkpID49IDA7XG59O1xuXG5mdW5jdGlvbiBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSB7XG4gIHJldHVybiBgX0pvaW46JHtrZXl9OiR7Y2xhc3NOYW1lfWA7XG59XG5cbmNvbnN0IGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUgPSBvYmplY3QgPT4ge1xuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0W2tleV0gJiYgb2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgc3dpdGNoIChvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XS5hbW91bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLmFtb3VudDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5vYmplY3RzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gW107XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICAgICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgICAgICBgVGhlICR7b2JqZWN0W2tleV0uX19vcH0gb3BlcmF0b3IgaXMgbm90IHN1cHBvcnRlZCB5ZXQuYFxuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BdXRoRGF0YSA9IChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSA9PiB7XG4gIGlmIChvYmplY3QuYXV0aERhdGEgJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgT2JqZWN0LmtleXMob2JqZWN0LmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IG9iamVjdC5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICBjb25zdCBmaWVsZE5hbWUgPSBgX2F1dGhfZGF0YV8ke3Byb3ZpZGVyfWA7XG4gICAgICBpZiAocHJvdmlkZXJEYXRhID09IG51bGwpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX19vcDogJ0RlbGV0ZScsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHByb3ZpZGVyRGF0YTtcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdID0geyB0eXBlOiAnT2JqZWN0JyB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIH1cbn07XG4vLyBUcmFuc2Zvcm1zIGEgRGF0YWJhc2UgZm9ybWF0IEFDTCB0byBhIFJFU1QgQVBJIGZvcm1hdCBBQ0xcbmNvbnN0IHVudHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgX3JwZXJtLCBfd3Blcm0sIC4uLm91dHB1dCB9KSA9PiB7XG4gIGlmIChfcnBlcm0gfHwgX3dwZXJtKSB7XG4gICAgb3V0cHV0LkFDTCA9IHt9O1xuXG4gICAgKF9ycGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyByZWFkOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XVsncmVhZCddID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIChfd3Blcm0gfHwgW10pLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKCFvdXRwdXQuQUNMW2VudHJ5XSkge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XSA9IHsgd3JpdGU6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWyd3cml0ZSddID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gb3V0cHV0O1xufTtcblxuLyoqXG4gKiBXaGVuIHF1ZXJ5aW5nLCB0aGUgZmllbGROYW1lIG1heSBiZSBjb21wb3VuZCwgZXh0cmFjdCB0aGUgcm9vdCBmaWVsZE5hbWVcbiAqICAgICBgdGVtcGVyYXR1cmUuY2Vsc2l1c2AgYmVjb21lcyBgdGVtcGVyYXR1cmVgXG4gKiBAcGFyYW0ge3N0cmluZ30gZmllbGROYW1lIHRoYXQgbWF5IGJlIGEgY29tcG91bmQgZmllbGQgbmFtZVxuICogQHJldHVybnMge3N0cmluZ30gdGhlIHJvb3QgbmFtZSBvZiB0aGUgZmllbGRcbiAqL1xuY29uc3QgZ2V0Um9vdEZpZWxkTmFtZSA9IChmaWVsZE5hbWU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbn07XG5cbmNvbnN0IHJlbGF0aW9uU2NoZW1hID0ge1xuICBmaWVsZHM6IHsgcmVsYXRlZElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sIG93bmluZ0lkOiB7IHR5cGU6ICdTdHJpbmcnIH0gfSxcbn07XG5cbmNvbnN0IG1heWJlVHJhbnNmb3JtVXNlcm5hbWVBbmRFbWFpbFRvTG93ZXJDYXNlID0gKG9iamVjdCwgY2xhc3NOYW1lLCBvcHRpb25zKSA9PiB7XG4gIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicgJiYgb3B0aW9ucy5mb3JjZUVtYWlsQW5kVXNlcm5hbWVUb0xvd2VyQ2FzZSkge1xuICAgIGNvbnN0IHRvTG93ZXJDYXNlRmllbGRzID0gWydlbWFpbCcsICd1c2VybmFtZSddO1xuICAgIHRvTG93ZXJDYXNlRmllbGRzLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmICh0eXBlb2Ygb2JqZWN0W2tleV0gPT09ICdzdHJpbmcnKSBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLnRvTG93ZXJDYXNlKCk7XG4gICAgfSk7XG4gIH1cbn07XG5cbmNsYXNzIERhdGFiYXNlQ29udHJvbGxlciB7XG4gIGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyO1xuICBzY2hlbWFDYWNoZTogYW55O1xuICBzY2hlbWFQcm9taXNlOiA/UHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+O1xuICBfdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnk7XG4gIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucztcbiAgaWRlbXBvdGVuY3lPcHRpb25zOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIHRoaXMuYWRhcHRlciA9IGFkYXB0ZXI7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucyA9IHRoaXMub3B0aW9ucy5pZGVtcG90ZW5jeU9wdGlvbnMgfHwge307XG4gICAgLy8gUHJldmVudCBtdXRhYmxlIHRoaXMuc2NoZW1hLCBvdGhlcndpc2Ugb25lIHJlcXVlc3QgY291bGQgdXNlXG4gICAgLy8gbXVsdGlwbGUgc2NoZW1hcywgc28gaW5zdGVhZCB1c2UgbG9hZFNjaGVtYSB0byBnZXQgYSBzY2hlbWEuXG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgfVxuXG4gIGNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gIH1cblxuICBwdXJnZUNvbGxlY3Rpb24oY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHt9KSk7XG4gIH1cblxuICB2YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5jbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgJ2ludmFsaWQgY2xhc3NOYW1lOiAnICsgY2xhc3NOYW1lKVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgc2NoZW1hQ29udHJvbGxlci5cbiAgbG9hZFNjaGVtYShcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYVByb21pc2UgIT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHRoaXMuc2NoZW1hUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gU2NoZW1hQ29udHJvbGxlci5sb2FkKHRoaXMuYWRhcHRlciwgb3B0aW9ucyk7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlLnRoZW4oXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlLFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZVxuICAgICk7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIGxvYWRTY2hlbWFJZk5lZWRlZChcbiAgICBzY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlciA/IFByb21pc2UucmVzb2x2ZShzY2hlbWFDb250cm9sbGVyKSA6IHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgY2xhc3NuYW1lIHRoYXQgaXMgcmVsYXRlZCB0byB0aGUgZ2l2ZW5cbiAgLy8gY2xhc3NuYW1lIHRocm91Z2ggdGhlIGtleS5cbiAgLy8gVE9ETzogbWFrZSB0aGlzIG5vdCBpbiB0aGUgRGF0YWJhc2VDb250cm9sbGVyIGludGVyZmFjZVxuICByZWRpcmVjdENsYXNzTmFtZUZvcktleShjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcpOiBQcm9taXNlPD9zdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4ge1xuICAgICAgdmFyIHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICh0ICE9IG51bGwgJiYgdHlwZW9mIHQgIT09ICdzdHJpbmcnICYmIHQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gdC50YXJnZXRDbGFzcztcbiAgICAgIH1cbiAgICAgIHJldHVybiBjbGFzc05hbWU7XG4gICAgfSk7XG4gIH1cblxuICAvLyBVc2VzIHRoZSBzY2hlbWEgdG8gdmFsaWRhdGUgdGhlIG9iamVjdCAoUkVTVCBBUEkgZm9ybWF0KS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYS5cbiAgLy8gVGhpcyBkb2VzIG5vdCB1cGRhdGUgdGhpcy5zY2hlbWEsIGJlY2F1c2UgaW4gYSBzaXR1YXRpb24gbGlrZSBhXG4gIC8vIGJhdGNoIHJlcXVlc3QsIHRoYXQgY291bGQgY29uZnVzZSBvdGhlciB1c2VycyBvZiB0aGUgc2NoZW1hLlxuICB2YWxpZGF0ZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBxdWVyeTogYW55LFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9ucyxcbiAgICBtYWludGVuYW5jZTogYm9vbGVhblxuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBsZXQgc2NoZW1hO1xuICAgIGNvbnN0IGFjbCA9IHJ1bk9wdGlvbnMuYWNsO1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwOiBzdHJpbmdbXSA9IGFjbCB8fCBbXTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWEgPSBzO1xuICAgICAgICBpZiAoaXNNYXN0ZXIpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FuQWRkRmllbGQoc2NoZW1hLCBjbGFzc05hbWUsIG9iamVjdCwgYWNsR3JvdXAsIHJ1bk9wdGlvbnMpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgcXVlcnksIG1haW50ZW5hbmNlKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgdXBkYXRlOiBhbnksXG4gICAgeyBhY2wsIG1hbnksIHVwc2VydCwgYWRkc0ZpZWxkIH06IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICBza2lwU2FuaXRpemF0aW9uOiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0cnkge1xuICAgICAgVXRpbHMuY2hlY2tQcm9oaWJpdGVkS2V5d29yZHModGhpcy5vcHRpb25zLCB1cGRhdGUpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGVycm9yKSk7XG4gICAgfVxuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBxdWVyeTtcbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHVwZGF0ZTtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgdXBkYXRlID0gZGVlcGNvcHkodXBkYXRlKTtcbiAgICB2YXIgcmVsYXRpb25VcGRhdGVzID0gW107XG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICd1cGRhdGUnKVxuICAgICAgKVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZSwgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCwgdXBkYXRlKTtcbiAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICd1cGRhdGUnLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmIChhZGRzRmllbGQpIHtcbiAgICAgICAgICAgICAgcXVlcnkgPSB7XG4gICAgICAgICAgICAgICAgJGFuZDogW1xuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAnYWRkRmllbGQnLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCBpc01hc3RlciwgZmFsc2UsIHRydWUpO1xuICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpICYmXG4gICAgICAgICAgICAgICAgICAhaXNTcGVjaWFsVXBkYXRlS2V5KHJvb3RGaWVsZE5hbWUpXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHVwZGF0ZU9wZXJhdGlvbiBpbiB1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSAmJlxuICAgICAgICAgICAgICAgICAgdHlwZW9mIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0pLnNvbWUoXG4gICAgICAgICAgICAgICAgICAgIGlubmVyS2V5ID0+IGlubmVyS2V5LmluY2x1ZGVzKCckJykgfHwgaW5uZXJLZXkuaW5jbHVkZXMoJy4nKVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdXBkYXRlID0gdHJhbnNmb3JtT2JqZWN0QUNMKHVwZGF0ZSk7XG4gICAgICAgICAgICAgIG1heWJlVHJhbnNmb3JtVXNlcm5hbWVBbmRFbWFpbFRvTG93ZXJDYXNlKHVwZGF0ZSwgY2xhc3NOYW1lLCB0aGlzLm9wdGlvbnMpO1xuICAgICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHt9KS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCAhcmVzdWx0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKG1hbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodXBzZXJ0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmRPbmVBbmRVcGRhdGUoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsXG4gICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoc2tpcFNhbml0aXphdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbFVwZGF0ZSwgcmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDb2xsZWN0IGFsbCByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBsaXN0IG9mIGFsbCByZWxhdGlvbiB1cGRhdGVzIHRvIHBlcmZvcm1cbiAgLy8gVGhpcyBtdXRhdGVzIHVwZGF0ZS5cbiAgY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6ID9zdHJpbmcsIHVwZGF0ZTogYW55KSB7XG4gICAgdmFyIG9wcyA9IFtdO1xuICAgIHZhciBkZWxldGVNZSA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuXG4gICAgdmFyIHByb2Nlc3MgPSAob3AsIGtleSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnQmF0Y2gnKSB7XG4gICAgICAgIGZvciAodmFyIHggb2Ygb3Aub3BzKSB7XG4gICAgICAgICAgcHJvY2Vzcyh4LCBrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHVwZGF0ZSkge1xuICAgICAgcHJvY2Vzcyh1cGRhdGVba2V5XSwga2V5KTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBrZXkgb2YgZGVsZXRlTWUpIHtcbiAgICAgIGRlbGV0ZSB1cGRhdGVba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIG9wcztcbiAgfVxuXG4gIC8vIFByb2Nlc3NlcyByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBhbGwgdXBkYXRlcyBoYXZlIGJlZW4gcGVyZm9ybWVkXG4gIGhhbmRsZVJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6IHN0cmluZywgdXBkYXRlOiBhbnksIG9wczogYW55KSB7XG4gICAgdmFyIHBlbmRpbmcgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcbiAgICBvcHMuZm9yRWFjaCgoeyBrZXksIG9wIH0pID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKHRoaXMuYWRkUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5yZW1vdmVSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocGVuZGluZyk7XG4gIH1cblxuICAvLyBBZGRzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgYWRkIHdhcyBzdWNjZXNzZnVsLlxuICBhZGRSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgZG9jLFxuICAgICAgZG9jLFxuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIHJlbW92ZSB3YXNcbiAgLy8gc3VjY2Vzc2Z1bC5cbiAgcmVtb3ZlUmVsYXRpb24oa2V5OiBzdHJpbmcsIGZyb21DbGFzc05hbWU6IHN0cmluZywgZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZykge1xuICAgIHZhciBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgZG9jLFxuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gV2UgZG9uJ3QgY2FyZSBpZiB0aGV5IHRyeSB0byBkZWxldGUgYSBub24tZXhpc3RlbnQgcmVsYXRpb24uXG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgb2JqZWN0cyBtYXRjaGVzIHRoaXMgcXVlcnkgZnJvbSB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHdhc1xuICAvLyBkZWxldGVkLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbiAgLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuICAvLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuICBkZXN0cm95KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdkZWxldGUnKVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgJ2RlbGV0ZScsXG4gICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGRlbGV0ZSBieSBxdWVyeVxuICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgfVxuICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCBpc01hc3RlciwgZmFsc2UsIGZhbHNlKTtcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSlcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihwYXJzZUZvcm1hdFNjaGVtYSA9PlxuICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIHBhcnNlRm9ybWF0U2NoZW1hLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIFdoZW4gZGVsZXRpbmcgc2Vzc2lvbnMgd2hpbGUgY2hhbmdpbmcgcGFzc3dvcmRzLCBkb24ndCB0aHJvdyBhbiBlcnJvciBpZiB0aGV5IGRvbid0IGhhdmUgYW55IHNlc3Npb25zLlxuICAgICAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEluc2VydHMgYW4gb2JqZWN0IGludG8gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCBzYXZlZC5cbiAgY3JlYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgdHJ5IHtcbiAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKHRoaXMub3B0aW9ucywgb2JqZWN0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBlcnJvcikpO1xuICAgIH1cbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgY29uc3Qgb3JpZ2luYWxPYmplY3QgPSBvYmplY3Q7XG4gICAgb2JqZWN0ID0gdHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgbWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2Uob2JqZWN0LCBjbGFzc05hbWUsIHRoaXMub3B0aW9ucyk7XG4gICAgb2JqZWN0LmNyZWF0ZWRBdCA9IHsgaXNvOiBvYmplY3QuY3JlYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuICAgIG9iamVjdC51cGRhdGVkQXQgPSB7IGlzbzogb2JqZWN0LnVwZGF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcblxuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBjb25zdCByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBudWxsLCBvYmplY3QpO1xuICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdjcmVhdGUnKVxuICAgICAgICApXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5lbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lKSlcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpKVxuICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICAgICAgICAgIGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUob2JqZWN0KTtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgU2NoZW1hQ29udHJvbGxlci5jb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKHNjaGVtYSksXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxPYmplY3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3QsIHJlc3VsdC5vcHNbMF0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNhbkFkZEZpZWxkKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY2xhc3NTY2hlbWEgPSBzY2hlbWEuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgIGlmICghY2xhc3NTY2hlbWEpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcbiAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSBPYmplY3Qua2V5cyhjbGFzc1NjaGVtYS5maWVsZHMpO1xuICAgIGNvbnN0IG5ld0tleXMgPSBmaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIC8vIFNraXAgZmllbGRzIHRoYXQgYXJlIHVuc2V0XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkXSAmJiBvYmplY3RbZmllbGRdLl9fb3AgJiYgb2JqZWN0W2ZpZWxkXS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2NoZW1hRmllbGRzLmluZGV4T2YoZ2V0Um9vdEZpZWxkTmFtZShmaWVsZCkpIDwgMDtcbiAgICB9KTtcbiAgICBpZiAobmV3S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBhZGRzIGEgbWFya2VyIHRoYXQgbmV3IGZpZWxkIGlzIGJlaW5nIGFkZGluZyBkdXJpbmcgdXBkYXRlXG4gICAgICBydW5PcHRpb25zLmFkZHNGaWVsZCA9IHRydWU7XG5cbiAgICAgIGNvbnN0IGFjdGlvbiA9IHJ1bk9wdGlvbnMuYWN0aW9uO1xuICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2FkZEZpZWxkJywgYWN0aW9uKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV29uJ3QgZGVsZXRlIGNvbGxlY3Rpb25zIGluIHRoZSBzeXN0ZW0gbmFtZXNwYWNlXG4gIC8qKlxuICAgKiBEZWxldGUgYWxsIGNsYXNzZXMgYW5kIGNsZWFycyB0aGUgc2NoZW1hIGNhY2hlXG4gICAqXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gZmFzdCBzZXQgdG8gdHJ1ZSBpZiBpdCdzIG9rIHRvIGp1c3QgZGVsZXRlIHJvd3MgYW5kIG5vdCBpbmRleGVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSB3aGVuIHRoZSBkZWxldGlvbnMgY29tcGxldGVzXG4gICAqL1xuICBkZWxldGVFdmVyeXRoaW5nKGZhc3Q6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8YW55PiB7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQWxsQ2xhc3NlcyhmYXN0KTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2YgcmVsYXRlZCBpZHMgZ2l2ZW4gYW4gb3duaW5nIGlkLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgcmVsYXRlZElkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICBvd25pbmdJZDogc3RyaW5nLFxuICAgIHF1ZXJ5T3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8QXJyYXk8c3RyaW5nPj4ge1xuICAgIGNvbnN0IHsgc2tpcCwgbGltaXQsIHNvcnQgfSA9IHF1ZXJ5T3B0aW9ucztcbiAgICBjb25zdCBmaW5kT3B0aW9ucyA9IHt9O1xuICAgIGlmIChzb3J0ICYmIHNvcnQuY3JlYXRlZEF0ICYmIHRoaXMuYWRhcHRlci5jYW5Tb3J0T25Kb2luVGFibGVzKSB7XG4gICAgICBmaW5kT3B0aW9ucy5zb3J0ID0geyBfaWQ6IHNvcnQuY3JlYXRlZEF0IH07XG4gICAgICBmaW5kT3B0aW9ucy5saW1pdCA9IGxpbWl0O1xuICAgICAgZmluZE9wdGlvbnMuc2tpcCA9IHNraXA7XG4gICAgICBxdWVyeU9wdGlvbnMuc2tpcCA9IDA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLCByZWxhdGlvblNjaGVtYSwgeyBvd25pbmdJZCB9LCBmaW5kT3B0aW9ucylcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5yZWxhdGVkSWQpKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2Ygb3duaW5nIGlkcyBnaXZlbiBzb21lIHJlbGF0ZWQgaWRzLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgb3duaW5nSWRzKGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZywgcmVsYXRlZElkczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoXG4gICAgICAgIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgeyByZWxhdGVkSWQ6IHsgJGluOiByZWxhdGVkSWRzIH0gfSxcbiAgICAgICAgeyBrZXlzOiBbJ293bmluZ0lkJ10gfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0Lm93bmluZ0lkKSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJGluIG9uIHJlbGF0aW9uIGZpZWxkcywgb3JcbiAgLy8gZXF1YWwtdG8tcG9pbnRlciBjb25zdHJhaW50cyBvbiByZWxhdGlvbiBmaWVsZHMuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHNjaGVtYTogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBTZWFyY2ggZm9yIGFuIGluLXJlbGF0aW9uIG9yIGVxdWFsLXRvLXJlbGF0aW9uXG4gICAgLy8gTWFrZSBpdCBzZXF1ZW50aWFsIGZvciBub3csIG5vdCBzdXJlIG9mIHBhcmFsbGVpemF0aW9uIHNpZGUgZWZmZWN0c1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgY29uc3Qgb3JzID0gcXVlcnlbJyRvciddO1xuICAgICAgcHJvbWlzZXMucHVzaChcbiAgICAgICAgLi4ub3JzLm1hcCgoYVF1ZXJ5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBhUXVlcnksIHNjaGVtYSkudGhlbihhUXVlcnkgPT4ge1xuICAgICAgICAgICAgcXVlcnlbJyRvciddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChxdWVyeVsnJGFuZCddKSB7XG4gICAgICBjb25zdCBhbmRzID0gcXVlcnlbJyRhbmQnXTtcbiAgICAgIHByb21pc2VzLnB1c2goXG4gICAgICAgIC4uLmFuZHMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJGFuZCddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3RoZXJLZXlzID0gT2JqZWN0LmtleXMocXVlcnkpLm1hcChrZXkgPT4ge1xuICAgICAgaWYgKGtleSA9PT0gJyRhbmQnIHx8IGtleSA9PT0gJyRvcicpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKCF0IHx8IHQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIGxldCBxdWVyaWVzOiA/KGFueVtdKSA9IG51bGw7XG4gICAgICBpZiAoXG4gICAgICAgIHF1ZXJ5W2tleV0gJiZcbiAgICAgICAgKHF1ZXJ5W2tleV1bJyRpbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5lJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldLl9fdHlwZSA9PSAnUG9pbnRlcicpXG4gICAgICApIHtcbiAgICAgICAgLy8gQnVpbGQgdGhlIGxpc3Qgb2YgcXVlcmllc1xuICAgICAgICBxdWVyaWVzID0gT2JqZWN0LmtleXMocXVlcnlba2V5XSkubWFwKGNvbnN0cmFpbnRLZXkgPT4ge1xuICAgICAgICAgIGxldCByZWxhdGVkSWRzO1xuICAgICAgICAgIGxldCBpc05lZ2F0aW9uID0gZmFsc2U7XG4gICAgICAgICAgaWYgKGNvbnN0cmFpbnRLZXkgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckaW4nKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJGluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmluJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJG5pbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5lJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV1bJyRuZSddLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaXNOZWdhdGlvbixcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyaWVzID0gW3sgaXNOZWdhdGlvbjogZmFsc2UsIHJlbGF0ZWRJZHM6IFtdIH1dO1xuICAgICAgfVxuXG4gICAgICAvLyByZW1vdmUgdGhlIGN1cnJlbnQgcXVlcnlLZXkgYXMgd2UgZG9uLHQgbmVlZCBpdCBhbnltb3JlXG4gICAgICBkZWxldGUgcXVlcnlba2V5XTtcbiAgICAgIC8vIGV4ZWN1dGUgZWFjaCBxdWVyeSBpbmRlcGVuZGVudGx5IHRvIGJ1aWxkIHRoZSBsaXN0IG9mXG4gICAgICAvLyAkaW4gLyAkbmluXG4gICAgICBjb25zdCBwcm9taXNlcyA9IHF1ZXJpZXMubWFwKHEgPT4ge1xuICAgICAgICBpZiAoIXEpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMub3duaW5nSWRzKGNsYXNzTmFtZSwga2V5LCBxLnJlbGF0ZWRJZHMpLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBpZiAocS5pc05lZ2F0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLmFkZE5vdEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKFsuLi5wcm9taXNlcywgLi4ub3RoZXJLZXlzXSkudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkcmVsYXRlZFRvXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IGFueSwgcXVlcnlPcHRpb25zOiBhbnkpOiA/UHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJG9yJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgYVF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5WyckYW5kJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRhbmQnXS5tYXAoYVF1ZXJ5ID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBhUXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICB2YXIgcmVsYXRlZFRvID0gcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICBpZiAocmVsYXRlZFRvKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxhdGVkSWRzKFxuICAgICAgICByZWxhdGVkVG8ub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgcmVsYXRlZFRvLmtleSxcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICApXG4gICAgICAgIC50aGVuKGlkcyA9PiB7XG4gICAgICAgICAgZGVsZXRlIHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4geyB9KTtcbiAgICB9XG4gIH1cblxuICBhZGRJbk9iamVjdElkc0lkcyhpZHM6ID9BcnJheTxzdHJpbmc+ID0gbnVsbCwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21TdHJpbmc6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycgPyBbcXVlcnkub2JqZWN0SWRdIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tRXE6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckZXEnXSA/IFtxdWVyeS5vYmplY3RJZFsnJGVxJ11dIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tSW46ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA6IG51bGw7XG5cbiAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICBjb25zdCBhbGxJZHM6IEFycmF5PEFycmF5PHN0cmluZz4+ID0gW2lkc0Zyb21TdHJpbmcsIGlkc0Zyb21FcSwgaWRzRnJvbUluLCBpZHNdLmZpbHRlcihcbiAgICAgIGxpc3QgPT4gbGlzdCAhPT0gbnVsbFxuICAgICk7XG4gICAgY29uc3QgdG90YWxMZW5ndGggPSBhbGxJZHMucmVkdWNlKChtZW1vLCBsaXN0KSA9PiBtZW1vICsgbGlzdC5sZW5ndGgsIDApO1xuXG4gICAgbGV0IGlkc0ludGVyc2VjdGlvbiA9IFtdO1xuICAgIGlmICh0b3RhbExlbmd0aCA+IDEyNSkge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0LmJpZyhhbGxJZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QoYWxsSWRzKTtcbiAgICB9XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBxdWVyeS5vYmplY3RJZFsnJGluJ10gPSBpZHNJbnRlcnNlY3Rpb247XG5cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICBhZGROb3RJbk9iamVjdElkc0lkcyhpZHM6IHN0cmluZ1tdID0gW10sIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tTmluID0gcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gOiBbXTtcbiAgICBsZXQgYWxsSWRzID0gWy4uLmlkc0Zyb21OaW4sIC4uLmlkc10uZmlsdGVyKGxpc3QgPT4gbGlzdCAhPT0gbnVsbCk7XG5cbiAgICAvLyBtYWtlIGEgc2V0IGFuZCBzcHJlYWQgdG8gcmVtb3ZlIGR1cGxpY2F0ZXNcbiAgICBhbGxJZHMgPSBbLi4ubmV3IFNldChhbGxJZHMpXTtcblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBxdWVyeS5vYmplY3RJZFsnJG5pbiddID0gYWxsSWRzO1xuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIFJ1bnMgYSBxdWVyeSBvbiB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYSBsaXN0IG9mIGl0ZW1zLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIHNraXAgICAgbnVtYmVyIG9mIHJlc3VsdHMgdG8gc2tpcC5cbiAgLy8gICBsaW1pdCAgIGxpbWl0IHRvIHRoaXMgbnVtYmVyIG9mIHJlc3VsdHMuXG4gIC8vICAgc29ydCAgICBhbiBvYmplY3Qgd2hlcmUga2V5cyBhcmUgdGhlIGZpZWxkcyB0byBzb3J0IGJ5LlxuICAvLyAgICAgICAgICAgdGhlIHZhbHVlIGlzICsxIGZvciBhc2NlbmRpbmcsIC0xIGZvciBkZXNjZW5kaW5nLlxuICAvLyAgIGNvdW50ICAgcnVuIGEgY291bnQgaW5zdGVhZCBvZiByZXR1cm5pbmcgcmVzdWx0cy5cbiAgLy8gICBhY2wgICAgIHJlc3RyaWN0IHRoaXMgb3BlcmF0aW9uIHdpdGggYW4gQUNMIGZvciB0aGUgcHJvdmlkZWQgYXJyYXlcbiAgLy8gICAgICAgICAgIG9mIHVzZXIgb2JqZWN0SWRzIGFuZCByb2xlcy4gYWNsOiBudWxsIG1lYW5zIG5vIHVzZXIuXG4gIC8vICAgICAgICAgICB3aGVuIHRoaXMgZmllbGQgaXMgbm90IHByZXNlbnQsIGRvbid0IGRvIGFueXRoaW5nIHJlZ2FyZGluZyBBQ0xzLlxuICAvLyAgY2FzZUluc2Vuc2l0aXZlIG1ha2Ugc3RyaW5nIGNvbXBhcmlzb25zIGNhc2UgaW5zZW5zaXRpdmVcbiAgLy8gVE9ETzogbWFrZSB1c2VySWRzIG5vdCBuZWVkZWQgaGVyZS4gVGhlIGRiIGFkYXB0ZXIgc2hvdWxkbid0IGtub3dcbiAgLy8gYW55dGhpbmcgYWJvdXQgdXNlcnMsIGlkZWFsbHkuIFRoZW4sIGltcHJvdmUgdGhlIGZvcm1hdCBvZiB0aGUgQUNMXG4gIC8vIGFyZyB0byB3b3JrIGxpa2UgdGhlIG90aGVycy5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIGFjbCxcbiAgICAgIHNvcnQgPSB7fSxcbiAgICAgIGNvdW50LFxuICAgICAga2V5cyxcbiAgICAgIG9wLFxuICAgICAgZGlzdGluY3QsXG4gICAgICBwaXBlbGluZSxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSA9IGZhbHNlLFxuICAgICAgZXhwbGFpbixcbiAgICB9OiBhbnkgPSB7fSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFpbnRlbmFuY2UgPSBhdXRoLmlzTWFpbnRlbmFuY2U7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZCB8fCBpc01haW50ZW5hbmNlO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIG9wID1cbiAgICAgIG9wIHx8ICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT0gJ3N0cmluZycgJiYgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMSA/ICdnZXQnIDogJ2ZpbmQnKTtcbiAgICAvLyBDb3VudCBvcGVyYXRpb24gaWYgY291bnRpbmdcbiAgICBvcCA9IGNvdW50ID09PSB0cnVlID8gJ2NvdW50JyA6IG9wO1xuXG4gICAgbGV0IGNsYXNzRXhpc3RzID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgLy9BbGxvdyB2b2xhdGlsZSBjbGFzc2VzIGlmIHF1ZXJ5aW5nIHdpdGggTWFzdGVyIChmb3IgX1B1c2hTdGF0dXMpXG4gICAgICAvL1RPRE86IE1vdmUgdm9sYXRpbGUgY2xhc3NlcyBjb25jZXB0IGludG8gbW9uZ28gYWRhcHRlciwgcG9zdGdyZXMgYWRhcHRlciBzaG91bGRuJ3QgY2FyZVxuICAgICAgLy90aGF0IGFwaS5wYXJzZS5jb20gYnJlYWtzIHdoZW4gX1B1c2hTdGF0dXMgZXhpc3RzIGluIG1vbmdvLlxuICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGlzTWFzdGVyKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIC8vIEJlaGF2aW9yIGZvciBub24tZXhpc3RlbnQgY2xhc3NlcyBpcyBraW5kYSB3ZWlyZCBvbiBQYXJzZS5jb20uIFByb2JhYmx5IGRvZXNuJ3QgbWF0dGVyIHRvbyBtdWNoLlxuICAgICAgICAgIC8vIEZvciBub3csIHByZXRlbmQgdGhlIGNsYXNzIGV4aXN0cyBidXQgaGFzIG5vIG9iamVjdHMsXG4gICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNsYXNzRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgIC8vIFBhcnNlLmNvbSB0cmVhdHMgcXVlcmllcyBvbiBfY3JlYXRlZF9hdCBhbmQgX3VwZGF0ZWRfYXQgYXMgaWYgdGhleSB3ZXJlIHF1ZXJpZXMgb24gY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQsXG4gICAgICAgICAgLy8gc28gZHVwbGljYXRlIHRoYXQgYmVoYXZpb3IgaGVyZS4gSWYgYm90aCBhcmUgc3BlY2lmaWVkLCB0aGUgY29ycmVjdCBiZWhhdmlvciB0byBtYXRjaCBQYXJzZS5jb20gaXMgdG9cbiAgICAgICAgICAvLyB1c2UgdGhlIG9uZSB0aGF0IGFwcGVhcnMgZmlyc3QgaW4gdGhlIHNvcnQgbGlzdC5cbiAgICAgICAgICBpZiAoc29ydC5fY3JlYXRlZF9hdCkge1xuICAgICAgICAgICAgc29ydC5jcmVhdGVkQXQgPSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgZGVsZXRlIHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzb3J0Ll91cGRhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LnVwZGF0ZWRBdCA9IHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcXVlcnlPcHRpb25zID0ge1xuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgc29ydCxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICBjYXNlSW5zZW5zaXRpdmU6IHRoaXMub3B0aW9ucy5kaXNhYmxlQ2FzZUluc2Vuc2l0aXZpdHkgPyBmYWxzZSA6IGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgICAgfTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzb3J0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYENhbm5vdCBzb3J0IGJ5ICR7ZmllbGROYW1lfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWUuc3BsaXQoJy4nKVswXV0gJiYgZmllbGROYW1lICE9PSAnc2NvcmUnKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBzb3J0W2ZpZWxkTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCBvcClcbiAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICBsZXQgcHJvdGVjdGVkRmllbGRzO1xuICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIC8qIERvbid0IHVzZSBwcm9qZWN0aW9ucyB0byBvcHRpbWl6ZSB0aGUgcHJvdGVjdGVkRmllbGRzIHNpbmNlIHRoZSBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgICAgIGJhc2VkIG9uIHBvaW50ZXItcGVybWlzc2lvbnMgYXJlIGRldGVybWluZWQgYWZ0ZXIgcXVlcnlpbmcuIFRoZSBmaWx0ZXJpbmcgY2FuXG4gICAgICAgICAgICAgICAgICBvdmVyd3JpdGUgdGhlIHByb3RlY3RlZCBmaWVsZHMuICovXG4gICAgICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gdGhpcy5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgICAgICBpZiAob3AgPT09ICdnZXQnKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ3VwZGF0ZScgfHwgb3AgPT09ICdkZWxldGUnKSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkUmVhZEFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCBpc01hc3RlciwgaXNNYWludGVuYW5jZSwgZmFsc2UpO1xuICAgICAgICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb3VudChcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICBoaW50XG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChkaXN0aW5jdCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kaXN0aW5jdChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIGRpc3RpbmN0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAocGlwZWxpbmUpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWdncmVnYXRlKFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcGlwZWxpbmUsXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgICAgICAgICBleHBsYWluXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAgICAgICAgICAgICAuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucylcbiAgICAgICAgICAgICAgICAgIC50aGVuKG9iamVjdHMgPT5cbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3QgPSB1bnRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmaWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc01haW50ZW5hbmNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0XG4gICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBkZWxldGVTY2hlbWEoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsZXQgc2NoZW1hQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLnRoZW4ocyA9PiB7XG4gICAgICAgIHNjaGVtYUNvbnRyb2xsZXIgPSBzO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKChzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZSlcbiAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLmFkYXB0ZXIuY291bnQoY2xhc3NOYW1lLCB7IGZpZWxkczoge30gfSwgbnVsbCwgJycsIGZhbHNlKSlcbiAgICAgICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgICAgICBpZiAoY291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAyNTUsXG4gICAgICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBpcyBub3QgZW1wdHksIGNvbnRhaW5zICR7Y291bnR9IG9iamVjdHMsIGNhbm5vdCBkcm9wIHNjaGVtYS5gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGNsYXNzTmFtZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbih3YXNQYXJzZUNvbGxlY3Rpb24gPT4ge1xuICAgICAgICAgICAgaWYgKHdhc1BhcnNlQ29sbGVjdGlvbikge1xuICAgICAgICAgICAgICBjb25zdCByZWxhdGlvbkZpZWxkTmFtZXMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5maWx0ZXIoXG4gICAgICAgICAgICAgICAgZmllbGROYW1lID0+IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgICAgICAgICByZWxhdGlvbkZpZWxkTmFtZXMubWFwKG5hbWUgPT5cbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwgbmFtZSkpXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIFNjaGVtYUNhY2hlLmRlbChjbGFzc05hbWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyLnJlbG9hZERhdGEoKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFRoaXMgaGVscHMgdG8gY3JlYXRlIGludGVybWVkaWF0ZSBvYmplY3RzIGZvciBzaW1wbGVyIGNvbXBhcmlzb24gb2ZcbiAgLy8ga2V5IHZhbHVlIHBhaXJzIHVzZWQgaW4gcXVlcnkgb2JqZWN0cy4gRWFjaCBrZXkgdmFsdWUgcGFpciB3aWxsIHJlcHJlc2VudGVkXG4gIC8vIGluIGEgc2ltaWxhciB3YXkgdG8ganNvblxuICBvYmplY3RUb0VudHJpZXNTdHJpbmdzKHF1ZXJ5OiBhbnkpOiBBcnJheTxzdHJpbmc+IHtcbiAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMocXVlcnkpLm1hcChhID0+IGEubWFwKHMgPT4gSlNPTi5zdHJpbmdpZnkocykpLmpvaW4oJzonKSk7XG4gIH1cblxuICAvLyBOYWl2ZSBsb2dpYyByZWR1Y2VyIGZvciBPUiBvcGVyYXRpb25zIG1lYW50IHRvIGJlIHVzZWQgb25seSBmb3IgcG9pbnRlciBwZXJtaXNzaW9ucy5cbiAgcmVkdWNlT3JPcGVyYXRpb24ocXVlcnk6IHsgJG9yOiBBcnJheTxhbnk+IH0pOiBhbnkge1xuICAgIGlmICghcXVlcnkuJG9yKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXMgPSBxdWVyeS4kb3IubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBsb25nZXIgcXVlcnkuXG4gICAgICAgICAgICBxdWVyeS4kb3Iuc3BsaWNlKGxvbmdlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcmVwZWF0ID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gd2hpbGUgKHJlcGVhdCk7XG4gICAgaWYgKHF1ZXJ5LiRvci5sZW5ndGggPT09IDEpIHtcbiAgICAgIHF1ZXJ5ID0geyAuLi5xdWVyeSwgLi4ucXVlcnkuJG9yWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJG9yO1xuICAgIH1cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBOYWl2ZSBsb2dpYyByZWR1Y2VyIGZvciBBTkQgb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZUFuZE9wZXJhdGlvbihxdWVyeTogeyAkYW5kOiBBcnJheTxhbnk+IH0pOiBhbnkge1xuICAgIGlmICghcXVlcnkuJGFuZCkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJGFuZC5tYXAocSA9PiB0aGlzLm9iamVjdFRvRW50cmllc1N0cmluZ3MocSkpO1xuICAgIGxldCByZXBlYXQgPSBmYWxzZTtcbiAgICBkbyB7XG4gICAgICByZXBlYXQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcmllcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcXVlcmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IFtzaG9ydGVyLCBsb25nZXJdID0gcXVlcmllc1tpXS5sZW5ndGggPiBxdWVyaWVzW2pdLmxlbmd0aCA/IFtqLCBpXSA6IFtpLCBqXTtcbiAgICAgICAgICBjb25zdCBmb3VuZEVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLnJlZHVjZShcbiAgICAgICAgICAgIChhY2MsIGVudHJ5KSA9PiBhY2MgKyAocXVlcmllc1tsb25nZXJdLmluY2x1ZGVzKGVudHJ5KSA/IDEgOiAwKSxcbiAgICAgICAgICAgIDBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNob3J0ZXJFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5sZW5ndGg7XG4gICAgICAgICAgaWYgKGZvdW5kRW50cmllcyA9PT0gc2hvcnRlckVudHJpZXMpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzaG9ydGVyIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGFpbmVkIGluIHRoZSBsb25nZXIgb25lLCB3ZSBjYW4gc3RyaWtlXG4gICAgICAgICAgICAvLyBvdXQgdGhlIHNob3J0ZXIgcXVlcnkuXG4gICAgICAgICAgICBxdWVyeS4kYW5kLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHF1ZXJpZXMuc3BsaWNlKHNob3J0ZXIsIDEpO1xuICAgICAgICAgICAgcmVwZWF0ID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gd2hpbGUgKHJlcGVhdCk7XG4gICAgaWYgKHF1ZXJ5LiRhbmQubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRhbmRbMF0gfTtcbiAgICAgIGRlbGV0ZSBxdWVyeS4kYW5kO1xuICAgIH1cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBDb25zdHJhaW50cyBxdWVyeSB1c2luZyBDTFAncyBwb2ludGVyIHBlcm1pc3Npb25zIChQUCkgaWYgYW55LlxuICAvLyAxLiBFdHJhY3QgdGhlIHVzZXIgaWQgZnJvbSBjYWxsZXIncyBBQ0xncm91cDtcbiAgLy8gMi4gRXhjdHJhY3QgYSBsaXN0IG9mIGZpZWxkIG5hbWVzIHRoYXQgYXJlIFBQIGZvciB0YXJnZXQgY29sbGVjdGlvbiBhbmQgb3BlcmF0aW9uO1xuICAvLyAzLiBDb25zdHJhaW50IHRoZSBvcmlnaW5hbCBxdWVyeSBzbyB0aGF0IGVhY2ggUFAgZmllbGQgbXVzdFxuICAvLyBwb2ludCB0byBjYWxsZXIncyBpZCAob3IgY29udGFpbiBpdCBpbiBjYXNlIG9mIFBQIGZpZWxkIGJlaW5nIGFuIGFycmF5KVxuICBhZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXVxuICApOiBhbnkge1xuICAgIC8vIENoZWNrIGlmIGNsYXNzIGhhcyBwdWJsaWMgcGVybWlzc2lvbiBmb3Igb3BlcmF0aW9uXG4gICAgLy8gSWYgdGhlIEJhc2VDTFAgcGFzcywgbGV0IGdvIHRocm91Z2hcbiAgICBpZiAoc2NoZW1hLnRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWUsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuXG4gICAgY29uc3QgdXNlckFDTCA9IGFjbEdyb3VwLmZpbHRlcihhY2wgPT4ge1xuICAgICAgcmV0dXJuIGFjbC5pbmRleE9mKCdyb2xlOicpICE9IDAgJiYgYWNsICE9ICcqJztcbiAgICB9KTtcblxuICAgIGNvbnN0IGdyb3VwS2V5ID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMSA/ICdyZWFkVXNlckZpZWxkcycgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIGNvbnN0IHBlcm1GaWVsZHMgPSBbXTtcblxuICAgIGlmIChwZXJtc1tvcGVyYXRpb25dICYmIHBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcykge1xuICAgICAgcGVybUZpZWxkcy5wdXNoKC4uLnBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcyk7XG4gICAgfVxuXG4gICAgaWYgKHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBwZXJtc1tncm91cEtleV0pIHtcbiAgICAgICAgaWYgKCFwZXJtRmllbGRzLmluY2x1ZGVzKGZpZWxkKSkge1xuICAgICAgICAgIHBlcm1GaWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgIGlmIChwZXJtRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICAgIC8vIE5vIHVzZXIgc2V0IHJldHVybiB1bmRlZmluZWRcbiAgICAgIC8vIElmIHRoZSBsZW5ndGggaXMgPiAxLCB0aGF0IG1lYW5zIHdlIGRpZG4ndCBkZS1kdXBlIHVzZXJzIGNvcnJlY3RseVxuICAgICAgaWYgKHVzZXJBQ0wubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdXNlcklkID0gdXNlckFDTFswXTtcbiAgICAgIGNvbnN0IHVzZXJQb2ludGVyID0ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcXVlcmllcyA9IHBlcm1GaWVsZHMubWFwKGtleSA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkRGVzY3JpcHRvciA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgICBjb25zdCBmaWVsZFR5cGUgPVxuICAgICAgICAgIGZpZWxkRGVzY3JpcHRvciAmJlxuICAgICAgICAgICAgdHlwZW9mIGZpZWxkRGVzY3JpcHRvciA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZERlc2NyaXB0b3IsICd0eXBlJylcbiAgICAgICAgICAgID8gZmllbGREZXNjcmlwdG9yLnR5cGVcbiAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBsZXQgcXVlcnlDbGF1c2U7XG5cbiAgICAgICAgaWYgKGZpZWxkVHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3Igc2luZ2xlIHBvaW50ZXIgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3IgdXNlcnMtYXJyYXkgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHsgJGFsbDogW3VzZXJQb2ludGVyXSB9IH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnT2JqZWN0Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIG9iamVjdCBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogdXNlclBvaW50ZXIgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUaGlzIG1lYW5zIHRoYXQgdGhlcmUgaXMgYSBDTFAgZmllbGQgb2YgYW4gdW5leHBlY3RlZCB0eXBlLiBUaGlzIGNvbmRpdGlvbiBzaG91bGQgbm90IGhhcHBlbiwgd2hpY2ggaXNcbiAgICAgICAgICAvLyB3aHkgaXMgYmVpbmcgdHJlYXRlZCBhcyBhbiBlcnJvci5cbiAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgIGBBbiB1bmV4cGVjdGVkIGNvbmRpdGlvbiBvY2N1cnJlZCB3aGVuIHJlc29sdmluZyBwb2ludGVyIHBlcm1pc3Npb25zOiAke2NsYXNzTmFtZX0gJHtrZXl9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgY29uc3RyYWludCBvbiB0aGUga2V5LCB1c2UgdGhlICRhbmRcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChxdWVyeSwga2V5KSkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUFuZE9wZXJhdGlvbih7ICRhbmQ6IFtxdWVyeUNsYXVzZSwgcXVlcnldIH0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGFkZCB0aGUgY29uc3RhaW50XG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgcXVlcnlDbGF1c2UpO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBxdWVyaWVzLmxlbmd0aCA9PT0gMSA/IHF1ZXJpZXNbMF0gOiB0aGlzLnJlZHVjZU9yT3BlcmF0aW9uKHsgJG9yOiBxdWVyaWVzIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICB9XG5cbiAgYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyIHwgYW55LFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnkgPSB7fSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICBxdWVyeU9wdGlvbnM6IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fVxuICApOiBudWxsIHwgc3RyaW5nW10ge1xuICAgIGNvbnN0IHBlcm1zID1cbiAgICAgIHNjaGVtYSAmJiBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zXG4gICAgICAgID8gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpXG4gICAgICAgIDogc2NoZW1hO1xuICAgIGlmICghcGVybXMpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gcGVybXMucHJvdGVjdGVkRmllbGRzO1xuICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSByZXR1cm4gbnVsbDtcblxuICAgIGlmIChhY2xHcm91cC5pbmRleE9mKHF1ZXJ5Lm9iamVjdElkKSA+IC0xKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIGZvciBxdWVyaWVzIHdoZXJlIFwia2V5c1wiIGFyZSBzZXQgYW5kIGRvIG5vdCBpbmNsdWRlIGFsbCAndXNlckZpZWxkJzp7ZmllbGR9LFxuICAgIC8vIHdlIGhhdmUgdG8gdHJhbnNwYXJlbnRseSBpbmNsdWRlIGl0LCBhbmQgdGhlbiByZW1vdmUgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnRcbiAgICAvLyBCZWNhdXNlIGlmIHN1Y2gga2V5IG5vdCBwcm9qZWN0ZWQgdGhlIHBlcm1pc3Npb24gd29uJ3QgYmUgZW5mb3JjZWQgcHJvcGVybHlcbiAgICAvLyBQUyB0aGlzIGlzIGNhbGxlZCB3aGVuICdleGNsdWRlS2V5cycgYWxyZWFkeSByZWR1Y2VkIHRvICdrZXlzJ1xuICAgIGNvbnN0IHByZXNlcnZlS2V5cyA9IHF1ZXJ5T3B0aW9ucy5rZXlzO1xuXG4gICAgLy8gdGhlc2UgYXJlIGtleXMgdGhhdCBuZWVkIHRvIGJlIGluY2x1ZGVkIG9ubHlcbiAgICAvLyB0byBiZSBhYmxlIHRvIGFwcGx5IHByb3RlY3RlZEZpZWxkcyBieSBwb2ludGVyXG4gICAgLy8gYW5kIHRoZW4gdW5zZXQgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnQgKGxhdGVyIGluICBmaWx0ZXJTZW5zaXRpdmVGaWVsZHMpXG4gICAgY29uc3Qgc2VydmVyT25seUtleXMgPSBbXTtcblxuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWQgPSBhdXRoLnVzZXI7XG5cbiAgICAvLyBtYXAgdG8gYWxsb3cgY2hlY2sgd2l0aG91dCBhcnJheSBzZWFyY2hcbiAgICBjb25zdCByb2xlcyA9IChhdXRoLnVzZXJSb2xlcyB8fCBbXSkucmVkdWNlKChhY2MsIHIpID0+IHtcbiAgICAgIGFjY1tyXSA9IHByb3RlY3RlZEZpZWxkc1tyXTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuXG4gICAgLy8gYXJyYXkgb2Ygc2V0cyBvZiBwcm90ZWN0ZWQgZmllbGRzLiBzZXBhcmF0ZSBpdGVtIGZvciBlYWNoIGFwcGxpY2FibGUgY3JpdGVyaWFcbiAgICBjb25zdCBwcm90ZWN0ZWRLZXlzU2V0cyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBza2lwIHVzZXJGaWVsZHNcbiAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKSB7XG4gICAgICAgIGlmIChwcmVzZXJ2ZUtleXMpIHtcbiAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBrZXkuc3Vic3RyaW5nKDEwKTtcbiAgICAgICAgICBpZiAoIXByZXNlcnZlS2V5cy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICAgICAgICAvLyAxLiBwdXQgaXQgdGhlcmUgdGVtcG9yYXJpbHlcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucy5rZXlzICYmIHF1ZXJ5T3B0aW9ucy5rZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIC8vIDIuIHByZXNlcnZlIGl0IGRlbGV0ZSBsYXRlclxuICAgICAgICAgICAgc2VydmVyT25seUtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gYWRkIHB1YmxpYyB0aWVyXG4gICAgICBpZiAoa2V5ID09PSAnKicpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgICBpZiAoa2V5ID09PSAnYXV0aGVudGljYXRlZCcpIHtcbiAgICAgICAgICAvLyBmb3IgbG9nZ2VkIGluIHVzZXJzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocm9sZXNba2V5XSAmJiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSkge1xuICAgICAgICAgIC8vIGFkZCBhcHBsaWNhYmxlIHJvbGVzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChyb2xlc1trZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGNoZWNrIGlmIHRoZXJlJ3MgYSBydWxlIGZvciBjdXJyZW50IHVzZXIncyBpZFxuICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICBjb25zdCB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG4gICAgICBpZiAocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gcHJlc2VydmUgZmllbGRzIHRvIGJlIHJlbW92ZWQgYmVmb3JlIHNlbmRpbmcgcmVzcG9uc2UgdG8gY2xpZW50XG4gICAgaWYgKHNlcnZlck9ubHlLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzID0gc2VydmVyT25seUtleXM7XG4gICAgfVxuXG4gICAgbGV0IHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzU2V0cy5yZWR1Y2UoKGFjYywgbmV4dCkgPT4ge1xuICAgICAgaWYgKG5leHQpIHtcbiAgICAgICAgYWNjLnB1c2goLi4ubmV4dCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIFtdKTtcblxuICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICBwcm90ZWN0ZWRLZXlzU2V0cy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvdGVjdGVkS2V5cztcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKS50aGVuKHRyYW5zYWN0aW9uYWxTZXNzaW9uID0+IHtcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gdHJhbnNhY3Rpb25hbFNlc3Npb247XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBjb21taXQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGFib3J0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICAvLyBUT0RPOiBjcmVhdGUgaW5kZXhlcyBvbiBmaXJzdCBjcmVhdGlvbiBvZiBhIF9Vc2VyIG9iamVjdC4gT3RoZXJ3aXNlIGl0J3MgaW1wb3NzaWJsZSB0b1xuICAvLyBoYXZlIGEgUGFyc2UgYXBwIHdpdGhvdXQgaXQgaGF2aW5nIGEgX1VzZXIgY29sbGVjdGlvbi5cbiAgYXN5bmMgcGVyZm9ybUluaXRpYWxpemF0aW9uKCkge1xuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIGNvbnN0IHJlcXVpcmVkVXNlckZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Vc2VyLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkUm9sZUZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Sb2xlLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgICB9LFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1VzZXInKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX0lkZW1wb3RlbmN5JykpO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXJuYW1lczogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBpZiAoIXRoaXMub3B0aW9ucy5kaXNhYmxlQ2FzZUluc2Vuc2l0aXZpdHkpIHtcbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10sICdjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lJywgdHJ1ZSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIHVzZXJuYW1lIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuXG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddLCAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsIHRydWUpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSBlbWFpbCBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlciBlbWFpbCBhZGRyZXNzZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Sb2xlJywgcmVxdWlyZWRSb2xlRmllbGRzLCBbJ25hbWUnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3Igcm9sZSBuYW1lOiAnLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgLmVuc3VyZVVuaXF1ZW5lc3MoJ19JZGVtcG90ZW5jeScsIHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMsIFsncmVxSWQnXSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIGlkZW1wb3RlbmN5IHJlcXVlc3QgSUQ6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcblxuICAgIGNvbnN0IGlzTW9uZ29BZGFwdGVyID0gdGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgTW9uZ29TdG9yYWdlQWRhcHRlcjtcbiAgICBjb25zdCBpc1Bvc3RncmVzQWRhcHRlciA9IHRoaXMuYWRhcHRlciBpbnN0YW5jZW9mIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXI7XG4gICAgaWYgKGlzTW9uZ29BZGFwdGVyIHx8IGlzUG9zdGdyZXNBZGFwdGVyKSB7XG4gICAgICBsZXQgb3B0aW9ucyA9IHt9O1xuICAgICAgaWYgKGlzTW9uZ29BZGFwdGVyKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgICAgdHRsOiAwLFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChpc1Bvc3RncmVzQWRhcHRlcikge1xuICAgICAgICBvcHRpb25zID0gdGhpcy5pZGVtcG90ZW5jeU9wdGlvbnM7XG4gICAgICAgIG9wdGlvbnMuc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA9IHRydWU7XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgLmVuc3VyZUluZGV4KCdfSWRlbXBvdGVuY3knLCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzLCBbJ2V4cGlyZSddLCAndHRsJywgZmFsc2UsIG9wdGlvbnMpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgVFRMIGluZGV4IGZvciBpZGVtcG90ZW5jeSBleHBpcmUgZGF0ZTogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLnVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk7XG4gIH1cblxuICBfZXhwYW5kUmVzdWx0T25LZXlQYXRoKG9iamVjdDogYW55LCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IGFueSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPCAwKSB7XG4gICAgICBvYmplY3Rba2V5XSA9IHZhbHVlW2tleV07XG4gICAgICByZXR1cm4gb2JqZWN0O1xuICAgIH1cbiAgICBjb25zdCBwYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgY29uc3QgZmlyc3RLZXkgPSBwYXRoWzBdO1xuICAgIGNvbnN0IG5leHRQYXRoID0gcGF0aC5zbGljZSgxKS5qb2luKCcuJyk7XG5cbiAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgaWYgKHRoaXMub3B0aW9ucyAmJiB0aGlzLm9wdGlvbnMucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgICAgZm9yIChjb25zdCBrZXl3b3JkIG9mIHRoaXMub3B0aW9ucy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICAgIGNvbnN0IG1hdGNoID0gVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZShcbiAgICAgICAgICB7IFtmaXJzdEtleV06IHRydWUsIFtuZXh0UGF0aF06IHRydWUgfSxcbiAgICAgICAgICBrZXl3b3JkLmtleSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICBgUHJvaGliaXRlZCBrZXl3b3JkIGluIHJlcXVlc3QgZGF0YTogJHtKU09OLnN0cmluZ2lmeShrZXl3b3JkKX0uYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBvYmplY3RbZmlyc3RLZXldID0gdGhpcy5fZXhwYW5kUmVzdWx0T25LZXlQYXRoKFxuICAgICAgb2JqZWN0W2ZpcnN0S2V5XSB8fCB7fSxcbiAgICAgIG5leHRQYXRoLFxuICAgICAgdmFsdWVbZmlyc3RLZXldXG4gICAgKTtcbiAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIF9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0OiBhbnksIHJlc3VsdDogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IHt9O1xuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICB9XG4gICAgT2JqZWN0LmtleXMob3JpZ2luYWxPYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGNvbnN0IGtleVVwZGF0ZSA9IG9yaWdpbmFsT2JqZWN0W2tleV07XG4gICAgICAvLyBkZXRlcm1pbmUgaWYgdGhhdCB3YXMgYW4gb3BcbiAgICAgIGlmIChcbiAgICAgICAga2V5VXBkYXRlICYmXG4gICAgICAgIHR5cGVvZiBrZXlVcGRhdGUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIGtleVVwZGF0ZS5fX29wICYmXG4gICAgICAgIFsnQWRkJywgJ0FkZFVuaXF1ZScsICdSZW1vdmUnLCAnSW5jcmVtZW50J10uaW5kZXhPZihrZXlVcGRhdGUuX19vcCkgPiAtMVxuICAgICAgKSB7XG4gICAgICAgIC8vIG9ubHkgdmFsaWQgb3BzIHRoYXQgcHJvZHVjZSBhbiBhY3Rpb25hYmxlIHJlc3VsdFxuICAgICAgICAvLyB0aGUgb3AgbWF5IGhhdmUgaGFwcGVuZWQgb24gYSBrZXlwYXRoXG4gICAgICAgIHRoaXMuX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChyZXNwb25zZSwga2V5LCByZXN1bHQpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICB9XG5cbiAgc3RhdGljIF92YWxpZGF0ZVF1ZXJ5OiAoYW55LCBib29sZWFuLCBib29sZWFuLCBib29sZWFuKSA9PiB2b2lkO1xuICBzdGF0aWMgZmlsdGVyU2Vuc2l0aXZlRGF0YTogKGJvb2xlYW4sIGJvb2xlYW4sIGFueVtdLCBhbnksIGFueSwgYW55LCBzdHJpbmcsIGFueVtdLCBhbnkpID0+IHZvaWQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRGF0YWJhc2VDb250cm9sbGVyO1xuLy8gRXhwb3NlIHZhbGlkYXRlUXVlcnkgZm9yIHRlc3RzXG5tb2R1bGUuZXhwb3J0cy5fdmFsaWRhdGVRdWVyeSA9IHZhbGlkYXRlUXVlcnk7XG5tb2R1bGUuZXhwb3J0cy5maWx0ZXJTZW5zaXRpdmVEYXRhID0gZmlsdGVyU2Vuc2l0aXZlRGF0YTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFLQTtBQUVBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQXdEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBS3hELFNBQVNBLFdBQVcsQ0FBQ0MsS0FBSyxFQUFFQyxHQUFHLEVBQUU7RUFDL0IsTUFBTUMsUUFBUSxHQUFHQyxlQUFDLENBQUNDLFNBQVMsQ0FBQ0osS0FBSyxDQUFDO0VBQ25DO0VBQ0FFLFFBQVEsQ0FBQ0csTUFBTSxHQUFHO0lBQUVDLEdBQUcsRUFBRSxDQUFDLElBQUksRUFB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