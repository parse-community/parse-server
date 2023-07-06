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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJhZGRXcml0ZUFDTCIsInF1ZXJ5IiwiYWNsIiwibmV3UXVlcnkiLCJfIiwiY2xvbmVEZWVwIiwiX3dwZXJtIiwiJGluIiwiYWRkUmVhZEFDTCIsIl9ycGVybSIsInRyYW5zZm9ybU9iamVjdEFDTCIsIkFDTCIsInJlc3VsdCIsImVudHJ5IiwicmVhZCIsInB1c2giLCJ3cml0ZSIsInNwZWNpYWxRdWVyeUtleXMiLCJzcGVjaWFsTWFzdGVyUXVlcnlLZXlzIiwidmFsaWRhdGVRdWVyeSIsImlzTWFzdGVyIiwiaXNNYWludGVuYW5jZSIsInVwZGF0ZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiJG9yIiwiQXJyYXkiLCJmb3JFYWNoIiwidmFsdWUiLCIkYW5kIiwiJG5vciIsImxlbmd0aCIsIk9iamVjdCIsImtleXMiLCJrZXkiLCIkcmVnZXgiLCIkb3B0aW9ucyIsIm1hdGNoIiwiaW5jbHVkZXMiLCJJTlZBTElEX0tFWV9OQU1FIiwiZmlsdGVyU2Vuc2l0aXZlRGF0YSIsImFjbEdyb3VwIiwiYXV0aCIsIm9wZXJhdGlvbiIsInNjaGVtYSIsImNsYXNzTmFtZSIsInByb3RlY3RlZEZpZWxkcyIsIm9iamVjdCIsInVzZXJJZCIsInVzZXIiLCJpZCIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNSZWFkT3BlcmF0aW9uIiwiaW5kZXhPZiIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtIiwiZmlsdGVyIiwic3RhcnRzV2l0aCIsIm1hcCIsInN1YnN0cmluZyIsIm5ld1Byb3RlY3RlZEZpZWxkcyIsIm92ZXJyaWRlUHJvdGVjdGVkRmllbGRzIiwicG9pbnRlclBlcm0iLCJwb2ludGVyUGVybUluY2x1ZGVzVXNlciIsInJlYWRVc2VyRmllbGRWYWx1ZSIsImlzQXJyYXkiLCJzb21lIiwib2JqZWN0SWQiLCJmaWVsZHMiLCJ2IiwiaXNVc2VyQ2xhc3MiLCJwYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJzZXNzaW9uVG9rZW4iLCJrIiwidGVtcG9yYXJ5S2V5cyIsImNoYXJBdCIsImF1dGhEYXRhIiwic3BlY2lhbEtleXNGb3JVcGRhdGUiLCJpc1NwZWNpYWxVcGRhdGVLZXkiLCJqb2luVGFibGVOYW1lIiwiZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSIsIl9fb3AiLCJhbW91bnQiLCJJTlZBTElEX0pTT04iLCJvYmplY3RzIiwiQ09NTUFORF9VTkFWQUlMQUJMRSIsInRyYW5zZm9ybUF1dGhEYXRhIiwicHJvdmlkZXIiLCJwcm92aWRlckRhdGEiLCJmaWVsZE5hbWUiLCJ0eXBlIiwidW50cmFuc2Zvcm1PYmplY3RBQ0wiLCJvdXRwdXQiLCJnZXRSb290RmllbGROYW1lIiwic3BsaXQiLCJyZWxhdGlvblNjaGVtYSIsInJlbGF0ZWRJZCIsIm93bmluZ0lkIiwibWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2UiLCJvcHRpb25zIiwiZm9yY2VFbWFpbEFuZFVzZXJuYW1lVG9Mb3dlckNhc2UiLCJ0b0xvd2VyQ2FzZUZpZWxkcyIsInRvTG93ZXJDYXNlIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJhZGFwdGVyIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwic2NoZW1hUHJvbWlzZSIsIl90cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbGxlY3Rpb25FeGlzdHMiLCJjbGFzc0V4aXN0cyIsInB1cmdlQ29sbGVjdGlvbiIsImxvYWRTY2hlbWEiLCJ0aGVuIiwic2NoZW1hQ29udHJvbGxlciIsImdldE9uZVNjaGVtYSIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwidmFsaWRhdGVDbGFzc05hbWUiLCJTY2hlbWFDb250cm9sbGVyIiwiY2xhc3NOYW1lSXNWYWxpZCIsIlByb21pc2UiLCJyZWplY3QiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJyZXNvbHZlIiwiY2xlYXJDYWNoZSIsImxvYWQiLCJsb2FkU2NoZW1hSWZOZWVkZWQiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInQiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsIm1haW50ZW5hbmNlIiwidW5kZWZpbmVkIiwicyIsImNhbkFkZEZpZWxkIiwibWFueSIsInVwc2VydCIsImFkZHNGaWVsZCIsInNraXBTYW5pdGl6YXRpb24iLCJ2YWxpZGF0ZU9ubHkiLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJVdGlscyIsImNoZWNrUHJvaGliaXRlZEtleXdvcmRzIiwiZXJyb3IiLCJvcmlnaW5hbFF1ZXJ5Iiwib3JpZ2luYWxVcGRhdGUiLCJkZWVwY29weSIsInJlbGF0aW9uVXBkYXRlcyIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNvbGxlY3RSZWxhdGlvblVwZGF0ZXMiLCJhZGRQb2ludGVyUGVybWlzc2lvbnMiLCJjYXRjaCIsInJvb3RGaWVsZE5hbWUiLCJmaWVsZE5hbWVJc1ZhbGlkIiwidXBkYXRlT3BlcmF0aW9uIiwiaW5uZXJLZXkiLCJJTlZBTElEX05FU1RFRF9LRVkiLCJmaW5kIiwiT0JKRUNUX05PVF9GT1VORCIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBzZXJ0T25lT2JqZWN0IiwiZmluZE9uZUFuZFVwZGF0ZSIsImhhbmRsZVJlbGF0aW9uVXBkYXRlcyIsIl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0Iiwib3BzIiwiZGVsZXRlTWUiLCJwcm9jZXNzIiwib3AiLCJ4IiwicGVuZGluZyIsImFkZFJlbGF0aW9uIiwicmVtb3ZlUmVsYXRpb24iLCJhbGwiLCJmcm9tQ2xhc3NOYW1lIiwiZnJvbUlkIiwidG9JZCIsImRvYyIsImNvZGUiLCJkZXN0cm95IiwicGFyc2VGb3JtYXRTY2hlbWEiLCJjcmVhdGUiLCJvcmlnaW5hbE9iamVjdCIsImNyZWF0ZWRBdCIsImlzbyIsIl9fdHlwZSIsInVwZGF0ZWRBdCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImNyZWF0ZU9iamVjdCIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJjbGFzc1NjaGVtYSIsInNjaGVtYURhdGEiLCJzY2hlbWFGaWVsZHMiLCJuZXdLZXlzIiwiZmllbGQiLCJhY3Rpb24iLCJkZWxldGVFdmVyeXRoaW5nIiwiZmFzdCIsIlNjaGVtYUNhY2hlIiwiY2xlYXIiLCJkZWxldGVBbGxDbGFzc2VzIiwicmVsYXRlZElkcyIsInF1ZXJ5T3B0aW9ucyIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJmaW5kT3B0aW9ucyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJfaWQiLCJyZXN1bHRzIiwib3duaW5nSWRzIiwicmVkdWNlSW5SZWxhdGlvbiIsInByb21pc2VzIiwib3JzIiwiYVF1ZXJ5IiwiaW5kZXgiLCJhbmRzIiwib3RoZXJLZXlzIiwicXVlcmllcyIsImNvbnN0cmFpbnRLZXkiLCJpc05lZ2F0aW9uIiwiciIsInEiLCJpZHMiLCJhZGROb3RJbk9iamVjdElkc0lkcyIsImFkZEluT2JqZWN0SWRzSWRzIiwicmVkdWNlUmVsYXRpb25LZXlzIiwicmVsYXRlZFRvIiwiaWRzRnJvbVN0cmluZyIsImlkc0Zyb21FcSIsImlkc0Zyb21JbiIsImFsbElkcyIsImxpc3QiLCJ0b3RhbExlbmd0aCIsInJlZHVjZSIsIm1lbW8iLCJpZHNJbnRlcnNlY3Rpb24iLCJpbnRlcnNlY3QiLCJiaWciLCIkZXEiLCJpZHNGcm9tTmluIiwiU2V0IiwiJG5pbiIsImNvdW50IiwiZGlzdGluY3QiLCJwaXBlbGluZSIsInJlYWRQcmVmZXJlbmNlIiwiaGludCIsImNhc2VJbnNlbnNpdGl2ZSIsImV4cGxhaW4iLCJfY3JlYXRlZF9hdCIsIl91cGRhdGVkX2F0IiwiZGlzYWJsZUNhc2VJbnNlbnNpdGl2aXR5IiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiYWdncmVnYXRlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZGVsZXRlU2NoZW1hIiwiZGVsZXRlQ2xhc3MiLCJ3YXNQYXJzZUNvbGxlY3Rpb24iLCJyZWxhdGlvbkZpZWxkTmFtZXMiLCJuYW1lIiwiZGVsIiwicmVsb2FkRGF0YSIsIm9iamVjdFRvRW50cmllc1N0cmluZ3MiLCJlbnRyaWVzIiwiYSIsIkpTT04iLCJzdHJpbmdpZnkiLCJqb2luIiwicmVkdWNlT3JPcGVyYXRpb24iLCJyZXBlYXQiLCJpIiwiaiIsInNob3J0ZXIiLCJsb25nZXIiLCJmb3VuZEVudHJpZXMiLCJhY2MiLCJzaG9ydGVyRW50cmllcyIsInNwbGljZSIsInJlZHVjZUFuZE9wZXJhdGlvbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsInVzZXJBQ0wiLCJncm91cEtleSIsInBlcm1GaWVsZHMiLCJwb2ludGVyRmllbGRzIiwidXNlclBvaW50ZXIiLCJmaWVsZERlc2NyaXB0b3IiLCJmaWVsZFR5cGUiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJxdWVyeUNsYXVzZSIsIiRhbGwiLCJhc3NpZ24iLCJwcmVzZXJ2ZUtleXMiLCJzZXJ2ZXJPbmx5S2V5cyIsImF1dGhlbnRpY2F0ZWQiLCJyb2xlcyIsInVzZXJSb2xlcyIsInByb3RlY3RlZEtleXNTZXRzIiwicHJvdGVjdGVkS2V5cyIsIm5leHQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInJlcXVpcmVkVXNlckZpZWxkcyIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJfVXNlciIsInJlcXVpcmVkUm9sZUZpZWxkcyIsIl9Sb2xlIiwicmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcyIsIl9JZGVtcG90ZW5jeSIsImVuc3VyZVVuaXF1ZW5lc3MiLCJsb2dnZXIiLCJ3YXJuIiwiZW5zdXJlSW5kZXgiLCJpc01vbmdvQWRhcHRlciIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJpc1Bvc3RncmVzQWRhcHRlciIsIlBvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJ0dGwiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJfZXhwYW5kUmVzdWx0T25LZXlQYXRoIiwicGF0aCIsImZpcnN0S2V5IiwibmV4dFBhdGgiLCJzbGljZSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJrZXl3b3JkIiwib2JqZWN0Q29udGFpbnNLZXlWYWx1ZSIsInJlc3BvbnNlIiwia2V5VXBkYXRlIiwibW9kdWxlIiwiZXhwb3J0cyIsIl92YWxpZGF0ZVF1ZXJ5Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyLvu78vLyBAZmxvd1xuLy8gQSBkYXRhYmFzZSBhZGFwdGVyIHRoYXQgd29ya3Mgd2l0aCBkYXRhIGV4cG9ydGVkIGZyb20gdGhlIGhvc3RlZFxuLy8gUGFyc2UgZGF0YWJhc2UuXG5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGludGVyc2VjdCBmcm9tICdpbnRlcnNlY3QnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCAqIGFzIFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgdHlwZSB7IExvYWRTY2hlbWFPcHRpb25zIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgdHlwZSB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4uL09wdGlvbnMnO1xuaW1wb3J0IHR5cGUgeyBRdWVyeU9wdGlvbnMsIEZ1bGxRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcblxuZnVuY3Rpb24gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ193cGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fd3Blcm0gPSB7ICRpbjogW251bGwsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG5mdW5jdGlvbiBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfcnBlcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3JwZXJtID0geyAkaW46IFtudWxsLCAnKicsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG4vLyBUcmFuc2Zvcm1zIGEgUkVTVCBBUEkgZm9ybWF0dGVkIEFDTCBvYmplY3QgdG8gb3VyIHR3by1maWVsZCBtb25nbyBmb3JtYXQuXG5jb25zdCB0cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBBQ0wsIC4uLnJlc3VsdCB9KSA9PiB7XG4gIGlmICghQUNMKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHJlc3VsdC5fd3Blcm0gPSBbXTtcbiAgcmVzdWx0Ll9ycGVybSA9IFtdO1xuXG4gIGZvciAoY29uc3QgZW50cnkgaW4gQUNMKSB7XG4gICAgaWYgKEFDTFtlbnRyeV0ucmVhZCkge1xuICAgICAgcmVzdWx0Ll9ycGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gICAgaWYgKEFDTFtlbnRyeV0ud3JpdGUpIHtcbiAgICAgIHJlc3VsdC5fd3Blcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5jb25zdCBzcGVjaWFsUXVlcnlLZXlzID0gWyckYW5kJywgJyRvcicsICckbm9yJywgJ19ycGVybScsICdfd3Blcm0nXTtcbmNvbnN0IHNwZWNpYWxNYXN0ZXJRdWVyeUtleXMgPSBbXG4gIC4uLnNwZWNpYWxRdWVyeUtleXMsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ190b21ic3RvbmUnLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IHZhbGlkYXRlUXVlcnkgPSAoXG4gIHF1ZXJ5OiBhbnksXG4gIGlzTWFzdGVyOiBib29sZWFuLFxuICBpc01haW50ZW5hbmNlOiBib29sZWFuLFxuICB1cGRhdGU6IGJvb2xlYW5cbik6IHZvaWQgPT4ge1xuICBpZiAoaXNNYWludGVuYW5jZSkge1xuICAgIGlzTWFzdGVyID0gdHJ1ZTtcbiAgfVxuICBpZiAocXVlcnkuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdDYW5ub3QgcXVlcnkgb24gQUNMLicpO1xuICB9XG5cbiAgaWYgKHF1ZXJ5LiRvcikge1xuICAgIGlmIChxdWVyeS4kb3IgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJG9yLmZvckVhY2godmFsdWUgPT4gdmFsaWRhdGVRdWVyeSh2YWx1ZSwgaXNNYXN0ZXIsIGlzTWFpbnRlbmFuY2UsIHVwZGF0ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkb3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kYW5kKSB7XG4gICAgaWYgKHF1ZXJ5LiRhbmQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJGFuZC5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCB1cGRhdGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJGFuZCBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRub3IpIHtcbiAgICBpZiAocXVlcnkuJG5vciBpbnN0YW5jZW9mIEFycmF5ICYmIHF1ZXJ5LiRub3IubGVuZ3RoID4gMCkge1xuICAgICAgcXVlcnkuJG5vci5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCB1cGRhdGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAnQmFkICRub3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IG9mIGF0IGxlYXN0IDEgdmFsdWUuJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmIChxdWVyeSAmJiBxdWVyeVtrZXldICYmIHF1ZXJ5W2tleV0uJHJlZ2V4KSB7XG4gICAgICBpZiAodHlwZW9mIHF1ZXJ5W2tleV0uJG9wdGlvbnMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmICghcXVlcnlba2V5XS4kb3B0aW9ucy5tYXRjaCgvXltpbXhzXSskLykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgYEJhZCAkb3B0aW9ucyB2YWx1ZSBmb3IgcXVlcnk6ICR7cXVlcnlba2V5XS4kb3B0aW9uc31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoXG4gICAgICAha2V5Lm1hdGNoKC9eW2EtekEtWl1bYS16QS1aMC05X1xcLl0qJC8pICYmXG4gICAgICAoKCFzcGVjaWFsUXVlcnlLZXlzLmluY2x1ZGVzKGtleSkgJiYgIWlzTWFzdGVyICYmICF1cGRhdGUpIHx8XG4gICAgICAgICh1cGRhdGUgJiYgaXNNYXN0ZXIgJiYgIXNwZWNpYWxNYXN0ZXJRdWVyeUtleXMuaW5jbHVkZXMoa2V5KSkpXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQga2V5IG5hbWU6ICR7a2V5fWApO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vLyBGaWx0ZXJzIG91dCBhbnkgZGF0YSB0aGF0IHNob3VsZG4ndCBiZSBvbiB0aGlzIFJFU1QtZm9ybWF0dGVkIG9iamVjdC5cbmNvbnN0IGZpbHRlclNlbnNpdGl2ZURhdGEgPSAoXG4gIGlzTWFzdGVyOiBib29sZWFuLFxuICBpc01haW50ZW5hbmNlOiBib29sZWFuLFxuICBhY2xHcm91cDogYW55W10sXG4gIGF1dGg6IGFueSxcbiAgb3BlcmF0aW9uOiBhbnksXG4gIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyIHwgYW55LFxuICBjbGFzc05hbWU6IHN0cmluZyxcbiAgcHJvdGVjdGVkRmllbGRzOiBudWxsIHwgQXJyYXk8YW55PixcbiAgb2JqZWN0OiBhbnlcbikgPT4ge1xuICBsZXQgdXNlcklkID0gbnVsbDtcbiAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG5cbiAgLy8gcmVwbGFjZSBwcm90ZWN0ZWRGaWVsZHMgd2hlbiB1c2luZyBwb2ludGVyLXBlcm1pc3Npb25zXG4gIGNvbnN0IHBlcm1zID1cbiAgICBzY2hlbWEgJiYgc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyA/IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSA6IHt9O1xuICBpZiAocGVybXMpIHtcbiAgICBjb25zdCBpc1JlYWRPcGVyYXRpb24gPSBbJ2dldCcsICdmaW5kJ10uaW5kZXhPZihvcGVyYXRpb24pID4gLTE7XG5cbiAgICBpZiAoaXNSZWFkT3BlcmF0aW9uICYmIHBlcm1zLnByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gZXh0cmFjdCBwcm90ZWN0ZWRGaWVsZHMgYWRkZWQgd2l0aCB0aGUgcG9pbnRlci1wZXJtaXNzaW9uIHByZWZpeFxuICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0gPSBPYmplY3Qua2V5cyhwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpXG4gICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICByZXR1cm4geyBrZXk6IGtleS5zdWJzdHJpbmcoMTApLCB2YWx1ZTogcGVybXMucHJvdGVjdGVkRmllbGRzW2tleV0gfTtcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG5ld1Byb3RlY3RlZEZpZWxkczogQXJyYXk8c3RyaW5nPltdID0gW107XG4gICAgICBsZXQgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSBmYWxzZTtcblxuICAgICAgLy8gY2hlY2sgaWYgdGhlIG9iamVjdCBncmFudHMgdGhlIGN1cnJlbnQgdXNlciBhY2Nlc3MgYmFzZWQgb24gdGhlIGV4dHJhY3RlZCBmaWVsZHNcbiAgICAgIHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtLmZvckVhY2gocG9pbnRlclBlcm0gPT4ge1xuICAgICAgICBsZXQgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgcmVhZFVzZXJGaWVsZFZhbHVlID0gb2JqZWN0W3BvaW50ZXJQZXJtLmtleV07XG4gICAgICAgIGlmIChyZWFkVXNlckZpZWxkVmFsdWUpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyZWFkVXNlckZpZWxkVmFsdWUpKSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IHJlYWRVc2VyRmllbGRWYWx1ZS5zb21lKFxuICAgICAgICAgICAgICB1c2VyID0+IHVzZXIub2JqZWN0SWQgJiYgdXNlci5vYmplY3RJZCA9PT0gdXNlcklkXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9XG4gICAgICAgICAgICAgIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCAmJiByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgPT09IHVzZXJJZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocG9pbnRlclBlcm1JbmNsdWRlc1VzZXIpIHtcbiAgICAgICAgICBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IHRydWU7XG4gICAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocG9pbnRlclBlcm0udmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gaWYgYXQgbGVhc3Qgb25lIHBvaW50ZXItcGVybWlzc2lvbiBhZmZlY3RlZCB0aGUgY3VycmVudCB1c2VyXG4gICAgICAvLyBpbnRlcnNlY3QgdnMgcHJvdGVjdGVkRmllbGRzIGZyb20gcHJldmlvdXMgc3RhZ2UgKEBzZWUgYWRkUHJvdGVjdGVkRmllbGRzKVxuICAgICAgLy8gU2V0cyB0aGVvcnkgKGludGVyc2VjdGlvbnMpOiBBIHggKEIgeCBDKSA9PSAoQSB4IEIpIHggQ1xuICAgICAgaWYgKG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwcm90ZWN0ZWRGaWVsZHMpO1xuICAgICAgfVxuICAgICAgLy8gaW50ZXJzZWN0IGFsbCBzZXRzIG9mIHByb3RlY3RlZEZpZWxkc1xuICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLmZvckVhY2goZmllbGRzID0+IHtcbiAgICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICAgIC8vIGlmIHRoZXJlJ3JlIG5vIHByb3RjdGVkRmllbGRzIGJ5IG90aGVyIGNyaXRlcmlhICggaWQgLyByb2xlIC8gYXV0aClcbiAgICAgICAgICAvLyB0aGVuIHdlIG11c3QgaW50ZXJzZWN0IGVhY2ggc2V0IChwZXIgdXNlckZpZWxkKVxuICAgICAgICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBmaWVsZHM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHByb3RlY3RlZEZpZWxkcy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaXNVc2VyQ2xhc3MgPSBjbGFzc05hbWUgPT09ICdfVXNlcic7XG4gIGlmIChpc1VzZXJDbGFzcykge1xuICAgIG9iamVjdC5wYXNzd29yZCA9IG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIGRlbGV0ZSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBkZWxldGUgb2JqZWN0LnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIGlmIChpc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8qIHNwZWNpYWwgdHJlYXQgZm9yIHRoZSB1c2VyIGNsYXNzOiBkb24ndCBmaWx0ZXIgcHJvdGVjdGVkRmllbGRzIGlmIGN1cnJlbnRseSBsb2dnZWRpbiB1c2VyIGlzXG4gIHRoZSByZXRyaWV2ZWQgdXNlciAqL1xuICBpZiAoIShpc1VzZXJDbGFzcyAmJiB1c2VySWQgJiYgb2JqZWN0Lm9iamVjdElkID09PSB1c2VySWQpKSB7XG4gICAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG5cbiAgICAvLyBmaWVsZHMgbm90IHJlcXVlc3RlZCBieSBjbGllbnQgKGV4Y2x1ZGVkKSxcbiAgICAvLyBidXQgd2VyZSBuZWVkZWQgdG8gYXBwbHkgcHJvdGVjdGVkRmllbGRzXG4gICAgcGVybXM/LnByb3RlY3RlZEZpZWxkcz8udGVtcG9yYXJ5S2V5cz8uZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuICB9XG5cbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKGtleS5jaGFyQXQoMCkgPT09ICdfJykge1xuICAgICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgIH1cbiAgfVxuXG4gIGlmICghaXNVc2VyQ2xhc3MgfHwgaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgaWYgKGFjbEdyb3VwLmluZGV4T2Yob2JqZWN0Lm9iamVjdElkKSA+IC0xKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuLy8gUnVucyBhbiB1cGRhdGUgb24gdGhlIGRhdGFiYXNlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGFuIG9iamVjdCB3aXRoIHRoZSBuZXcgdmFsdWVzIGZvciBmaWVsZFxuLy8gbW9kaWZpY2F0aW9ucyB0aGF0IGRvbid0IGtub3cgdGhlaXIgcmVzdWx0cyBhaGVhZCBvZiB0aW1lLCBsaWtlXG4vLyAnaW5jcmVtZW50Jy5cbi8vIE9wdGlvbnM6XG4vLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbi8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbi8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG5jb25zdCBzcGVjaWFsS2V5c0ZvclVwZGF0ZSA9IFtcbiAgJ19oYXNoZWRfcGFzc3dvcmQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxVcGRhdGVLZXkgPSBrZXkgPT4ge1xuICByZXR1cm4gc3BlY2lhbEtleXNGb3JVcGRhdGUuaW5kZXhPZihrZXkpID49IDA7XG59O1xuXG5mdW5jdGlvbiBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSB7XG4gIHJldHVybiBgX0pvaW46JHtrZXl9OiR7Y2xhc3NOYW1lfWA7XG59XG5cbmNvbnN0IGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUgPSBvYmplY3QgPT4ge1xuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0W2tleV0gJiYgb2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgc3dpdGNoIChvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XS5hbW91bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLmFtb3VudDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5vYmplY3RzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gW107XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICAgICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgICAgICBgVGhlICR7b2JqZWN0W2tleV0uX19vcH0gb3BlcmF0b3IgaXMgbm90IHN1cHBvcnRlZCB5ZXQuYFxuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BdXRoRGF0YSA9IChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSA9PiB7XG4gIGlmIChvYmplY3QuYXV0aERhdGEgJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgT2JqZWN0LmtleXMob2JqZWN0LmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IG9iamVjdC5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICBjb25zdCBmaWVsZE5hbWUgPSBgX2F1dGhfZGF0YV8ke3Byb3ZpZGVyfWA7XG4gICAgICBpZiAocHJvdmlkZXJEYXRhID09IG51bGwpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX19vcDogJ0RlbGV0ZScsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHByb3ZpZGVyRGF0YTtcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdID0geyB0eXBlOiAnT2JqZWN0JyB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIH1cbn07XG4vLyBUcmFuc2Zvcm1zIGEgRGF0YWJhc2UgZm9ybWF0IEFDTCB0byBhIFJFU1QgQVBJIGZvcm1hdCBBQ0xcbmNvbnN0IHVudHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgX3JwZXJtLCBfd3Blcm0sIC4uLm91dHB1dCB9KSA9PiB7XG4gIGlmIChfcnBlcm0gfHwgX3dwZXJtKSB7XG4gICAgb3V0cHV0LkFDTCA9IHt9O1xuXG4gICAgKF9ycGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyByZWFkOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XVsncmVhZCddID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIChfd3Blcm0gfHwgW10pLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKCFvdXRwdXQuQUNMW2VudHJ5XSkge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XSA9IHsgd3JpdGU6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWyd3cml0ZSddID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gb3V0cHV0O1xufTtcblxuLyoqXG4gKiBXaGVuIHF1ZXJ5aW5nLCB0aGUgZmllbGROYW1lIG1heSBiZSBjb21wb3VuZCwgZXh0cmFjdCB0aGUgcm9vdCBmaWVsZE5hbWVcbiAqICAgICBgdGVtcGVyYXR1cmUuY2Vsc2l1c2AgYmVjb21lcyBgdGVtcGVyYXR1cmVgXG4gKiBAcGFyYW0ge3N0cmluZ30gZmllbGROYW1lIHRoYXQgbWF5IGJlIGEgY29tcG91bmQgZmllbGQgbmFtZVxuICogQHJldHVybnMge3N0cmluZ30gdGhlIHJvb3QgbmFtZSBvZiB0aGUgZmllbGRcbiAqL1xuY29uc3QgZ2V0Um9vdEZpZWxkTmFtZSA9IChmaWVsZE5hbWU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbn07XG5cbmNvbnN0IHJlbGF0aW9uU2NoZW1hID0ge1xuICBmaWVsZHM6IHsgcmVsYXRlZElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sIG93bmluZ0lkOiB7IHR5cGU6ICdTdHJpbmcnIH0gfSxcbn07XG5cbmNvbnN0IG1heWJlVHJhbnNmb3JtVXNlcm5hbWVBbmRFbWFpbFRvTG93ZXJDYXNlID0gKG9iamVjdCwgY2xhc3NOYW1lLCBvcHRpb25zKSA9PiB7XG4gIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicgJiYgb3B0aW9ucy5mb3JjZUVtYWlsQW5kVXNlcm5hbWVUb0xvd2VyQ2FzZSkge1xuICAgIGNvbnN0IHRvTG93ZXJDYXNlRmllbGRzID0gWydlbWFpbCcsICd1c2VybmFtZSddO1xuICAgIHRvTG93ZXJDYXNlRmllbGRzLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmICh0eXBlb2Ygb2JqZWN0W2tleV0gPT09ICdzdHJpbmcnKSBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLnRvTG93ZXJDYXNlKCk7XG4gICAgfSk7XG4gIH1cbn07XG5cbmNsYXNzIERhdGFiYXNlQ29udHJvbGxlciB7XG4gIGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyO1xuICBzY2hlbWFDYWNoZTogYW55O1xuICBzY2hlbWFQcm9taXNlOiA/UHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+O1xuICBfdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnk7XG4gIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucztcbiAgaWRlbXBvdGVuY3lPcHRpb25zOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIHRoaXMuYWRhcHRlciA9IGFkYXB0ZXI7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucyA9IHRoaXMub3B0aW9ucy5pZGVtcG90ZW5jeU9wdGlvbnMgfHwge307XG4gICAgLy8gUHJldmVudCBtdXRhYmxlIHRoaXMuc2NoZW1hLCBvdGhlcndpc2Ugb25lIHJlcXVlc3QgY291bGQgdXNlXG4gICAgLy8gbXVsdGlwbGUgc2NoZW1hcywgc28gaW5zdGVhZCB1c2UgbG9hZFNjaGVtYSB0byBnZXQgYSBzY2hlbWEuXG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgfVxuXG4gIGNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gIH1cblxuICBwdXJnZUNvbGxlY3Rpb24oY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHt9KSk7XG4gIH1cblxuICB2YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5jbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgJ2ludmFsaWQgY2xhc3NOYW1lOiAnICsgY2xhc3NOYW1lKVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgc2NoZW1hQ29udHJvbGxlci5cbiAgbG9hZFNjaGVtYShcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYVByb21pc2UgIT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHRoaXMuc2NoZW1hUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gU2NoZW1hQ29udHJvbGxlci5sb2FkKHRoaXMuYWRhcHRlciwgb3B0aW9ucyk7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlLnRoZW4oXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlLFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZVxuICAgICk7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIGxvYWRTY2hlbWFJZk5lZWRlZChcbiAgICBzY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlciA/IFByb21pc2UucmVzb2x2ZShzY2hlbWFDb250cm9sbGVyKSA6IHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgY2xhc3NuYW1lIHRoYXQgaXMgcmVsYXRlZCB0byB0aGUgZ2l2ZW5cbiAgLy8gY2xhc3NuYW1lIHRocm91Z2ggdGhlIGtleS5cbiAgLy8gVE9ETzogbWFrZSB0aGlzIG5vdCBpbiB0aGUgRGF0YWJhc2VDb250cm9sbGVyIGludGVyZmFjZVxuICByZWRpcmVjdENsYXNzTmFtZUZvcktleShjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcpOiBQcm9taXNlPD9zdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4ge1xuICAgICAgdmFyIHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICh0ICE9IG51bGwgJiYgdHlwZW9mIHQgIT09ICdzdHJpbmcnICYmIHQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gdC50YXJnZXRDbGFzcztcbiAgICAgIH1cbiAgICAgIHJldHVybiBjbGFzc05hbWU7XG4gICAgfSk7XG4gIH1cblxuICAvLyBVc2VzIHRoZSBzY2hlbWEgdG8gdmFsaWRhdGUgdGhlIG9iamVjdCAoUkVTVCBBUEkgZm9ybWF0KS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYS5cbiAgLy8gVGhpcyBkb2VzIG5vdCB1cGRhdGUgdGhpcy5zY2hlbWEsIGJlY2F1c2UgaW4gYSBzaXR1YXRpb24gbGlrZSBhXG4gIC8vIGJhdGNoIHJlcXVlc3QsIHRoYXQgY291bGQgY29uZnVzZSBvdGhlciB1c2VycyBvZiB0aGUgc2NoZW1hLlxuICB2YWxpZGF0ZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBxdWVyeTogYW55LFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9ucyxcbiAgICBtYWludGVuYW5jZTogYm9vbGVhblxuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBsZXQgc2NoZW1hO1xuICAgIGNvbnN0IGFjbCA9IHJ1bk9wdGlvbnMuYWNsO1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwOiBzdHJpbmdbXSA9IGFjbCB8fCBbXTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWEgPSBzO1xuICAgICAgICBpZiAoaXNNYXN0ZXIpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FuQWRkRmllbGQoc2NoZW1hLCBjbGFzc05hbWUsIG9iamVjdCwgYWNsR3JvdXAsIHJ1bk9wdGlvbnMpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgcXVlcnksIG1haW50ZW5hbmNlKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgdXBkYXRlOiBhbnksXG4gICAgeyBhY2wsIG1hbnksIHVwc2VydCwgYWRkc0ZpZWxkIH06IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICBza2lwU2FuaXRpemF0aW9uOiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0cnkge1xuICAgICAgVXRpbHMuY2hlY2tQcm9oaWJpdGVkS2V5d29yZHModGhpcy5vcHRpb25zLCB1cGRhdGUpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGVycm9yKSk7XG4gICAgfVxuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBxdWVyeTtcbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHVwZGF0ZTtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgdXBkYXRlID0gZGVlcGNvcHkodXBkYXRlKTtcbiAgICB2YXIgcmVsYXRpb25VcGRhdGVzID0gW107XG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICd1cGRhdGUnKVxuICAgICAgKVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZSwgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCwgdXBkYXRlKTtcbiAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICd1cGRhdGUnLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmIChhZGRzRmllbGQpIHtcbiAgICAgICAgICAgICAgcXVlcnkgPSB7XG4gICAgICAgICAgICAgICAgJGFuZDogW1xuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAnYWRkRmllbGQnLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCBpc01hc3RlciwgZmFsc2UsIHRydWUpO1xuICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpICYmXG4gICAgICAgICAgICAgICAgICAhaXNTcGVjaWFsVXBkYXRlS2V5KHJvb3RGaWVsZE5hbWUpXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHVwZGF0ZU9wZXJhdGlvbiBpbiB1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSAmJlxuICAgICAgICAgICAgICAgICAgdHlwZW9mIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0pLnNvbWUoXG4gICAgICAgICAgICAgICAgICAgIGlubmVyS2V5ID0+IGlubmVyS2V5LmluY2x1ZGVzKCckJykgfHwgaW5uZXJLZXkuaW5jbHVkZXMoJy4nKVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdXBkYXRlID0gdHJhbnNmb3JtT2JqZWN0QUNMKHVwZGF0ZSk7XG4gICAgICAgICAgICAgIG1heWJlVHJhbnNmb3JtVXNlcm5hbWVBbmRFbWFpbFRvTG93ZXJDYXNlKHVwZGF0ZSwgY2xhc3NOYW1lLCB0aGlzLm9wdGlvbnMpO1xuICAgICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHt9KS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCAhcmVzdWx0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKG1hbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodXBzZXJ0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmRPbmVBbmRVcGRhdGUoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsXG4gICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoc2tpcFNhbml0aXphdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbFVwZGF0ZSwgcmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDb2xsZWN0IGFsbCByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBsaXN0IG9mIGFsbCByZWxhdGlvbiB1cGRhdGVzIHRvIHBlcmZvcm1cbiAgLy8gVGhpcyBtdXRhdGVzIHVwZGF0ZS5cbiAgY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6ID9zdHJpbmcsIHVwZGF0ZTogYW55KSB7XG4gICAgdmFyIG9wcyA9IFtdO1xuICAgIHZhciBkZWxldGVNZSA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuXG4gICAgdmFyIHByb2Nlc3MgPSAob3AsIGtleSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnQmF0Y2gnKSB7XG4gICAgICAgIGZvciAodmFyIHggb2Ygb3Aub3BzKSB7XG4gICAgICAgICAgcHJvY2Vzcyh4LCBrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHVwZGF0ZSkge1xuICAgICAgcHJvY2Vzcyh1cGRhdGVba2V5XSwga2V5KTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBrZXkgb2YgZGVsZXRlTWUpIHtcbiAgICAgIGRlbGV0ZSB1cGRhdGVba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIG9wcztcbiAgfVxuXG4gIC8vIFByb2Nlc3NlcyByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBhbGwgdXBkYXRlcyBoYXZlIGJlZW4gcGVyZm9ybWVkXG4gIGhhbmRsZVJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6IHN0cmluZywgdXBkYXRlOiBhbnksIG9wczogYW55KSB7XG4gICAgdmFyIHBlbmRpbmcgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcbiAgICBvcHMuZm9yRWFjaCgoeyBrZXksIG9wIH0pID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKHRoaXMuYWRkUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5yZW1vdmVSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocGVuZGluZyk7XG4gIH1cblxuICAvLyBBZGRzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgYWRkIHdhcyBzdWNjZXNzZnVsLlxuICBhZGRSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgZG9jLFxuICAgICAgZG9jLFxuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIHJlbW92ZSB3YXNcbiAgLy8gc3VjY2Vzc2Z1bC5cbiAgcmVtb3ZlUmVsYXRpb24oa2V5OiBzdHJpbmcsIGZyb21DbGFzc05hbWU6IHN0cmluZywgZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZykge1xuICAgIHZhciBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgZG9jLFxuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gV2UgZG9uJ3QgY2FyZSBpZiB0aGV5IHRyeSB0byBkZWxldGUgYSBub24tZXhpc3RlbnQgcmVsYXRpb24uXG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgb2JqZWN0cyBtYXRjaGVzIHRoaXMgcXVlcnkgZnJvbSB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHdhc1xuICAvLyBkZWxldGVkLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbiAgLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuICAvLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuICBkZXN0cm95KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdkZWxldGUnKVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgJ2RlbGV0ZScsXG4gICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGRlbGV0ZSBieSBxdWVyeVxuICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgfVxuICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCBpc01hc3RlciwgZmFsc2UsIGZhbHNlKTtcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSlcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihwYXJzZUZvcm1hdFNjaGVtYSA9PlxuICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIHBhcnNlRm9ybWF0U2NoZW1hLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIFdoZW4gZGVsZXRpbmcgc2Vzc2lvbnMgd2hpbGUgY2hhbmdpbmcgcGFzc3dvcmRzLCBkb24ndCB0aHJvdyBhbiBlcnJvciBpZiB0aGV5IGRvbid0IGhhdmUgYW55IHNlc3Npb25zLlxuICAgICAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEluc2VydHMgYW4gb2JqZWN0IGludG8gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCBzYXZlZC5cbiAgY3JlYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgdHJ5IHtcbiAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKHRoaXMub3B0aW9ucywgb2JqZWN0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBlcnJvcikpO1xuICAgIH1cbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgY29uc3Qgb3JpZ2luYWxPYmplY3QgPSBvYmplY3Q7XG4gICAgb2JqZWN0ID0gdHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgbWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2Uob2JqZWN0LCBjbGFzc05hbWUsIHRoaXMub3B0aW9ucyk7XG4gICAgb2JqZWN0LmNyZWF0ZWRBdCA9IHsgaXNvOiBvYmplY3QuY3JlYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuICAgIG9iamVjdC51cGRhdGVkQXQgPSB7IGlzbzogb2JqZWN0LnVwZGF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcblxuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBjb25zdCByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBudWxsLCBvYmplY3QpO1xuICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdjcmVhdGUnKVxuICAgICAgICApXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5lbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lKSlcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpKVxuICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICAgICAgICAgIGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUob2JqZWN0KTtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgU2NoZW1hQ29udHJvbGxlci5jb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKHNjaGVtYSksXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxPYmplY3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3QsIHJlc3VsdC5vcHNbMF0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNhbkFkZEZpZWxkKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY2xhc3NTY2hlbWEgPSBzY2hlbWEuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgIGlmICghY2xhc3NTY2hlbWEpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcbiAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSBPYmplY3Qua2V5cyhjbGFzc1NjaGVtYS5maWVsZHMpO1xuICAgIGNvbnN0IG5ld0tleXMgPSBmaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIC8vIFNraXAgZmllbGRzIHRoYXQgYXJlIHVuc2V0XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkXSAmJiBvYmplY3RbZmllbGRdLl9fb3AgJiYgb2JqZWN0W2ZpZWxkXS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2NoZW1hRmllbGRzLmluZGV4T2YoZ2V0Um9vdEZpZWxkTmFtZShmaWVsZCkpIDwgMDtcbiAgICB9KTtcbiAgICBpZiAobmV3S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBhZGRzIGEgbWFya2VyIHRoYXQgbmV3IGZpZWxkIGlzIGJlaW5nIGFkZGluZyBkdXJpbmcgdXBkYXRlXG4gICAgICBydW5PcHRpb25zLmFkZHNGaWVsZCA9IHRydWU7XG5cbiAgICAgIGNvbnN0IGFjdGlvbiA9IHJ1bk9wdGlvbnMuYWN0aW9uO1xuICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2FkZEZpZWxkJywgYWN0aW9uKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV29uJ3QgZGVsZXRlIGNvbGxlY3Rpb25zIGluIHRoZSBzeXN0ZW0gbmFtZXNwYWNlXG4gIC8qKlxuICAgKiBEZWxldGUgYWxsIGNsYXNzZXMgYW5kIGNsZWFycyB0aGUgc2NoZW1hIGNhY2hlXG4gICAqXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gZmFzdCBzZXQgdG8gdHJ1ZSBpZiBpdCdzIG9rIHRvIGp1c3QgZGVsZXRlIHJvd3MgYW5kIG5vdCBpbmRleGVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSB3aGVuIHRoZSBkZWxldGlvbnMgY29tcGxldGVzXG4gICAqL1xuICBkZWxldGVFdmVyeXRoaW5nKGZhc3Q6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8YW55PiB7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQWxsQ2xhc3NlcyhmYXN0KTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2YgcmVsYXRlZCBpZHMgZ2l2ZW4gYW4gb3duaW5nIGlkLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgcmVsYXRlZElkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICBvd25pbmdJZDogc3RyaW5nLFxuICAgIHF1ZXJ5T3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8QXJyYXk8c3RyaW5nPj4ge1xuICAgIGNvbnN0IHsgc2tpcCwgbGltaXQsIHNvcnQgfSA9IHF1ZXJ5T3B0aW9ucztcbiAgICBjb25zdCBmaW5kT3B0aW9ucyA9IHt9O1xuICAgIGlmIChzb3J0ICYmIHNvcnQuY3JlYXRlZEF0ICYmIHRoaXMuYWRhcHRlci5jYW5Tb3J0T25Kb2luVGFibGVzKSB7XG4gICAgICBmaW5kT3B0aW9ucy5zb3J0ID0geyBfaWQ6IHNvcnQuY3JlYXRlZEF0IH07XG4gICAgICBmaW5kT3B0aW9ucy5saW1pdCA9IGxpbWl0O1xuICAgICAgZmluZE9wdGlvbnMuc2tpcCA9IHNraXA7XG4gICAgICBxdWVyeU9wdGlvbnMuc2tpcCA9IDA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLCByZWxhdGlvblNjaGVtYSwgeyBvd25pbmdJZCB9LCBmaW5kT3B0aW9ucylcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5yZWxhdGVkSWQpKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2Ygb3duaW5nIGlkcyBnaXZlbiBzb21lIHJlbGF0ZWQgaWRzLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgb3duaW5nSWRzKGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZywgcmVsYXRlZElkczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoXG4gICAgICAgIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgeyByZWxhdGVkSWQ6IHsgJGluOiByZWxhdGVkSWRzIH0gfSxcbiAgICAgICAgeyBrZXlzOiBbJ293bmluZ0lkJ10gfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0Lm93bmluZ0lkKSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJGluIG9uIHJlbGF0aW9uIGZpZWxkcywgb3JcbiAgLy8gZXF1YWwtdG8tcG9pbnRlciBjb25zdHJhaW50cyBvbiByZWxhdGlvbiBmaWVsZHMuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHNjaGVtYTogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBTZWFyY2ggZm9yIGFuIGluLXJlbGF0aW9uIG9yIGVxdWFsLXRvLXJlbGF0aW9uXG4gICAgLy8gTWFrZSBpdCBzZXF1ZW50aWFsIGZvciBub3csIG5vdCBzdXJlIG9mIHBhcmFsbGVpemF0aW9uIHNpZGUgZWZmZWN0c1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgY29uc3Qgb3JzID0gcXVlcnlbJyRvciddO1xuICAgICAgcHJvbWlzZXMucHVzaChcbiAgICAgICAgLi4ub3JzLm1hcCgoYVF1ZXJ5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBhUXVlcnksIHNjaGVtYSkudGhlbihhUXVlcnkgPT4ge1xuICAgICAgICAgICAgcXVlcnlbJyRvciddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChxdWVyeVsnJGFuZCddKSB7XG4gICAgICBjb25zdCBhbmRzID0gcXVlcnlbJyRhbmQnXTtcbiAgICAgIHByb21pc2VzLnB1c2goXG4gICAgICAgIC4uLmFuZHMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJGFuZCddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3RoZXJLZXlzID0gT2JqZWN0LmtleXMocXVlcnkpLm1hcChrZXkgPT4ge1xuICAgICAgaWYgKGtleSA9PT0gJyRhbmQnIHx8IGtleSA9PT0gJyRvcicpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKCF0IHx8IHQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIGxldCBxdWVyaWVzOiA/KGFueVtdKSA9IG51bGw7XG4gICAgICBpZiAoXG4gICAgICAgIHF1ZXJ5W2tleV0gJiZcbiAgICAgICAgKHF1ZXJ5W2tleV1bJyRpbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5lJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldLl9fdHlwZSA9PSAnUG9pbnRlcicpXG4gICAgICApIHtcbiAgICAgICAgLy8gQnVpbGQgdGhlIGxpc3Qgb2YgcXVlcmllc1xuICAgICAgICBxdWVyaWVzID0gT2JqZWN0LmtleXMocXVlcnlba2V5XSkubWFwKGNvbnN0cmFpbnRLZXkgPT4ge1xuICAgICAgICAgIGxldCByZWxhdGVkSWRzO1xuICAgICAgICAgIGxldCBpc05lZ2F0aW9uID0gZmFsc2U7XG4gICAgICAgICAgaWYgKGNvbnN0cmFpbnRLZXkgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckaW4nKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJGluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmluJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJG5pbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5lJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV1bJyRuZSddLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaXNOZWdhdGlvbixcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyaWVzID0gW3sgaXNOZWdhdGlvbjogZmFsc2UsIHJlbGF0ZWRJZHM6IFtdIH1dO1xuICAgICAgfVxuXG4gICAgICAvLyByZW1vdmUgdGhlIGN1cnJlbnQgcXVlcnlLZXkgYXMgd2UgZG9uLHQgbmVlZCBpdCBhbnltb3JlXG4gICAgICBkZWxldGUgcXVlcnlba2V5XTtcbiAgICAgIC8vIGV4ZWN1dGUgZWFjaCBxdWVyeSBpbmRlcGVuZGVudGx5IHRvIGJ1aWxkIHRoZSBsaXN0IG9mXG4gICAgICAvLyAkaW4gLyAkbmluXG4gICAgICBjb25zdCBwcm9taXNlcyA9IHF1ZXJpZXMubWFwKHEgPT4ge1xuICAgICAgICBpZiAoIXEpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMub3duaW5nSWRzKGNsYXNzTmFtZSwga2V5LCBxLnJlbGF0ZWRJZHMpLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBpZiAocS5pc05lZ2F0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLmFkZE5vdEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKFsuLi5wcm9taXNlcywgLi4ub3RoZXJLZXlzXSkudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkcmVsYXRlZFRvXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IGFueSwgcXVlcnlPcHRpb25zOiBhbnkpOiA/UHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJG9yJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgYVF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5WyckYW5kJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRhbmQnXS5tYXAoYVF1ZXJ5ID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBhUXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICB2YXIgcmVsYXRlZFRvID0gcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICBpZiAocmVsYXRlZFRvKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxhdGVkSWRzKFxuICAgICAgICByZWxhdGVkVG8ub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgcmVsYXRlZFRvLmtleSxcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICApXG4gICAgICAgIC50aGVuKGlkcyA9PiB7XG4gICAgICAgICAgZGVsZXRlIHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge30pO1xuICAgIH1cbiAgfVxuXG4gIGFkZEluT2JqZWN0SWRzSWRzKGlkczogP0FycmF5PHN0cmluZz4gPSBudWxsLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbVN0cmluZzogP0FycmF5PHN0cmluZz4gPVxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJyA/IFtxdWVyeS5vYmplY3RJZF0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21FcTogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRlcSddID8gW3F1ZXJ5Lm9iamVjdElkWyckZXEnXV0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21JbjogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRpbiddID8gcXVlcnkub2JqZWN0SWRbJyRpbiddIDogbnVsbDtcblxuICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgIGNvbnN0IGFsbElkczogQXJyYXk8QXJyYXk8c3RyaW5nPj4gPSBbaWRzRnJvbVN0cmluZywgaWRzRnJvbUVxLCBpZHNGcm9tSW4sIGlkc10uZmlsdGVyKFxuICAgICAgbGlzdCA9PiBsaXN0ICE9PSBudWxsXG4gICAgKTtcbiAgICBjb25zdCB0b3RhbExlbmd0aCA9IGFsbElkcy5yZWR1Y2UoKG1lbW8sIGxpc3QpID0+IG1lbW8gKyBsaXN0Lmxlbmd0aCwgMCk7XG5cbiAgICBsZXQgaWRzSW50ZXJzZWN0aW9uID0gW107XG4gICAgaWYgKHRvdGFsTGVuZ3RoID4gMTI1KSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QuYmlnKGFsbElkcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdChhbGxJZHMpO1xuICAgIH1cblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA9IGlkc0ludGVyc2VjdGlvbjtcblxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIGFkZE5vdEluT2JqZWN0SWRzSWRzKGlkczogc3RyaW5nW10gPSBbXSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21OaW4gPSBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJG5pbiddID8gcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA6IFtdO1xuICAgIGxldCBhbGxJZHMgPSBbLi4uaWRzRnJvbU5pbiwgLi4uaWRzXS5maWx0ZXIobGlzdCA9PiBsaXN0ICE9PSBudWxsKTtcblxuICAgIC8vIG1ha2UgYSBzZXQgYW5kIHNwcmVhZCB0byByZW1vdmUgZHVwbGljYXRlc1xuICAgIGFsbElkcyA9IFsuLi5uZXcgU2V0KGFsbElkcyldO1xuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPSBhbGxJZHM7XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gUnVucyBhIHF1ZXJ5IG9uIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhIGxpc3Qgb2YgaXRlbXMuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgc2tpcCAgICBudW1iZXIgb2YgcmVzdWx0cyB0byBza2lwLlxuICAvLyAgIGxpbWl0ICAgbGltaXQgdG8gdGhpcyBudW1iZXIgb2YgcmVzdWx0cy5cbiAgLy8gICBzb3J0ICAgIGFuIG9iamVjdCB3aGVyZSBrZXlzIGFyZSB0aGUgZmllbGRzIHRvIHNvcnQgYnkuXG4gIC8vICAgICAgICAgICB0aGUgdmFsdWUgaXMgKzEgZm9yIGFzY2VuZGluZywgLTEgZm9yIGRlc2NlbmRpbmcuXG4gIC8vICAgY291bnQgICBydW4gYSBjb3VudCBpbnN0ZWFkIG9mIHJldHVybmluZyByZXN1bHRzLlxuICAvLyAgIGFjbCAgICAgcmVzdHJpY3QgdGhpcyBvcGVyYXRpb24gd2l0aCBhbiBBQ0wgZm9yIHRoZSBwcm92aWRlZCBhcnJheVxuICAvLyAgICAgICAgICAgb2YgdXNlciBvYmplY3RJZHMgYW5kIHJvbGVzLiBhY2w6IG51bGwgbWVhbnMgbm8gdXNlci5cbiAgLy8gICAgICAgICAgIHdoZW4gdGhpcyBmaWVsZCBpcyBub3QgcHJlc2VudCwgZG9uJ3QgZG8gYW55dGhpbmcgcmVnYXJkaW5nIEFDTHMuXG4gIC8vICBjYXNlSW5zZW5zaXRpdmUgbWFrZSBzdHJpbmcgY29tcGFyaXNvbnMgY2FzZSBpbnNlbnNpdGl2ZVxuICAvLyBUT0RPOiBtYWtlIHVzZXJJZHMgbm90IG5lZWRlZCBoZXJlLiBUaGUgZGIgYWRhcHRlciBzaG91bGRuJ3Qga25vd1xuICAvLyBhbnl0aGluZyBhYm91dCB1c2VycywgaWRlYWxseS4gVGhlbiwgaW1wcm92ZSB0aGUgZm9ybWF0IG9mIHRoZSBBQ0xcbiAgLy8gYXJnIHRvIHdvcmsgbGlrZSB0aGUgb3RoZXJzLlxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgYWNsLFxuICAgICAgc29ydCA9IHt9LFxuICAgICAgY291bnQsXG4gICAgICBrZXlzLFxuICAgICAgb3AsXG4gICAgICBkaXN0aW5jdCxcbiAgICAgIHBpcGVsaW5lLFxuICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICBoaW50LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlID0gZmFsc2UsXG4gICAgICBleHBsYWluLFxuICAgIH06IGFueSA9IHt9LFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgaXNNYWludGVuYW5jZSA9IGF1dGguaXNNYWludGVuYW5jZTtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkIHx8IGlzTWFpbnRlbmFuY2U7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgb3AgPVxuICAgICAgb3AgfHwgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PSAnc3RyaW5nJyAmJiBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAxID8gJ2dldCcgOiAnZmluZCcpO1xuICAgIC8vIENvdW50IG9wZXJhdGlvbiBpZiBjb3VudGluZ1xuICAgIG9wID0gY291bnQgPT09IHRydWUgPyAnY291bnQnIDogb3A7XG5cbiAgICBsZXQgY2xhc3NFeGlzdHMgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAvL0FsbG93IHZvbGF0aWxlIGNsYXNzZXMgaWYgcXVlcnlpbmcgd2l0aCBNYXN0ZXIgKGZvciBfUHVzaFN0YXR1cylcbiAgICAgIC8vVE9ETzogTW92ZSB2b2xhdGlsZSBjbGFzc2VzIGNvbmNlcHQgaW50byBtb25nbyBhZGFwdGVyLCBwb3N0Z3JlcyBhZGFwdGVyIHNob3VsZG4ndCBjYXJlXG4gICAgICAvL3RoYXQgYXBpLnBhcnNlLmNvbSBicmVha3Mgd2hlbiBfUHVzaFN0YXR1cyBleGlzdHMgaW4gbW9uZ28uXG4gICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgaXNNYXN0ZXIpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gQmVoYXZpb3IgZm9yIG5vbi1leGlzdGVudCBjbGFzc2VzIGlzIGtpbmRhIHdlaXJkIG9uIFBhcnNlLmNvbS4gUHJvYmFibHkgZG9lc24ndCBtYXR0ZXIgdG9vIG11Y2guXG4gICAgICAgICAgLy8gRm9yIG5vdywgcHJldGVuZCB0aGUgY2xhc3MgZXhpc3RzIGJ1dCBoYXMgbm8gb2JqZWN0cyxcbiAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xhc3NFeGlzdHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgLy8gUGFyc2UuY29tIHRyZWF0cyBxdWVyaWVzIG9uIF9jcmVhdGVkX2F0IGFuZCBfdXBkYXRlZF9hdCBhcyBpZiB0aGV5IHdlcmUgcXVlcmllcyBvbiBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdCxcbiAgICAgICAgICAvLyBzbyBkdXBsaWNhdGUgdGhhdCBiZWhhdmlvciBoZXJlLiBJZiBib3RoIGFyZSBzcGVjaWZpZWQsIHRoZSBjb3JyZWN0IGJlaGF2aW9yIHRvIG1hdGNoIFBhcnNlLmNvbSBpcyB0b1xuICAgICAgICAgIC8vIHVzZSB0aGUgb25lIHRoYXQgYXBwZWFycyBmaXJzdCBpbiB0aGUgc29ydCBsaXN0LlxuICAgICAgICAgIGlmIChzb3J0Ll9jcmVhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LmNyZWF0ZWRBdCA9IHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHNvcnQuX3VwZGF0ZWRfYXQpIHtcbiAgICAgICAgICAgIHNvcnQudXBkYXRlZEF0ID0gc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBxdWVyeU9wdGlvbnMgPSB7XG4gICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICBzb3J0LFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZTogdGhpcy5vcHRpb25zLmRpc2FibGVDYXNlSW5zZW5zaXRpdml0eSA/IGZhbHNlIDogY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICB9O1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNvcnQpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgQ2Fubm90IHNvcnQgYnkgJHtmaWVsZE5hbWV9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZS5zcGxpdCgnLicpWzBdXSAmJiBmaWVsZE5hbWUgIT09ICdzY29yZScpIHtcbiAgICAgICAgICAgICAgZGVsZXRlIHNvcnRbZmllbGROYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wKVxuICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucykpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHM7XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgLyogRG9uJ3QgdXNlIHByb2plY3Rpb25zIHRvIG9wdGltaXplIHRoZSBwcm90ZWN0ZWRGaWVsZHMgc2luY2UgdGhlIHByb3RlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgYmFzZWQgb24gcG9pbnRlci1wZXJtaXNzaW9ucyBhcmUgZGV0ZXJtaW5lZCBhZnRlciBxdWVyeWluZy4gVGhlIGZpbHRlcmluZyBjYW5cbiAgICAgICAgICAgICAgICAgIG92ZXJ3cml0ZSB0aGUgcHJvdGVjdGVkIGZpZWxkcy4gKi9cbiAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ2dldCcpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAndXBkYXRlJyB8fCBvcCA9PT0gJ2RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCBmYWxzZSk7XG4gICAgICAgICAgICAgIGlmIChjb3VudCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNvdW50KFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIGhpbnRcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGRpc3RpbmN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRpc3RpbmN0KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgZGlzdGluY3QpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChwaXBlbGluZSkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5hZ2dyZWdhdGUoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBwaXBlbGluZSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICAgICAgICAgIGV4cGxhaW5cbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAgICAgICAgIC5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKVxuICAgICAgICAgICAgICAgICAgLnRoZW4ob2JqZWN0cyA9PlxuICAgICAgICAgICAgICAgICAgICBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdCA9IHVudHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgICAgICAgICAgICBpc01hc3RlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzTWFpbnRlbmFuY2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3RcbiAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGRlbGV0ZVNjaGVtYShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGxldCBzY2hlbWFDb250cm9sbGVyO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hQ29udHJvbGxlciA9IHM7XG4gICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMuYWRhcHRlci5jb3VudChjbGFzc05hbWUsIHsgZmllbGRzOiB7fSB9LCBudWxsLCAnJywgZmFsc2UpKVxuICAgICAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgICAgIGlmIChjb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIDI1NSxcbiAgICAgICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGlzIG5vdCBlbXB0eSwgY29udGFpbnMgJHtjb3VudH0gb2JqZWN0cywgY2Fubm90IGRyb3Agc2NoZW1hLmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoY2xhc3NOYW1lKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHdhc1BhcnNlQ29sbGVjdGlvbiA9PiB7XG4gICAgICAgICAgICBpZiAod2FzUGFyc2VDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZpbHRlcihcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgICAgIHJlbGF0aW9uRmllbGROYW1lcy5tYXAobmFtZSA9PlxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBuYW1lKSlcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgU2NoZW1hQ2FjaGUuZGVsKGNsYXNzTmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIucmVsb2FkRGF0YSgpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gVGhpcyBoZWxwcyB0byBjcmVhdGUgaW50ZXJtZWRpYXRlIG9iamVjdHMgZm9yIHNpbXBsZXIgY29tcGFyaXNvbiBvZlxuICAvLyBrZXkgdmFsdWUgcGFpcnMgdXNlZCBpbiBxdWVyeSBvYmplY3RzLiBFYWNoIGtleSB2YWx1ZSBwYWlyIHdpbGwgcmVwcmVzZW50ZWRcbiAgLy8gaW4gYSBzaW1pbGFyIHdheSB0byBqc29uXG4gIG9iamVjdFRvRW50cmllc1N0cmluZ3MocXVlcnk6IGFueSk6IEFycmF5PHN0cmluZz4ge1xuICAgIHJldHVybiBPYmplY3QuZW50cmllcyhxdWVyeSkubWFwKGEgPT4gYS5tYXAocyA9PiBKU09OLnN0cmluZ2lmeShzKSkuam9pbignOicpKTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIE9SIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VPck9wZXJhdGlvbihxdWVyeTogeyAkb3I6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kb3IpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRvci5tYXAocSA9PiB0aGlzLm9iamVjdFRvRW50cmllc1N0cmluZ3MocSkpO1xuICAgIGxldCByZXBlYXQgPSBmYWxzZTtcbiAgICBkbyB7XG4gICAgICByZXBlYXQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcmllcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcXVlcmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IFtzaG9ydGVyLCBsb25nZXJdID0gcXVlcmllc1tpXS5sZW5ndGggPiBxdWVyaWVzW2pdLmxlbmd0aCA/IFtqLCBpXSA6IFtpLCBqXTtcbiAgICAgICAgICBjb25zdCBmb3VuZEVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLnJlZHVjZShcbiAgICAgICAgICAgIChhY2MsIGVudHJ5KSA9PiBhY2MgKyAocXVlcmllc1tsb25nZXJdLmluY2x1ZGVzKGVudHJ5KSA/IDEgOiAwKSxcbiAgICAgICAgICAgIDBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNob3J0ZXJFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5sZW5ndGg7XG4gICAgICAgICAgaWYgKGZvdW5kRW50cmllcyA9PT0gc2hvcnRlckVudHJpZXMpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzaG9ydGVyIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGFpbmVkIGluIHRoZSBsb25nZXIgb25lLCB3ZSBjYW4gc3RyaWtlXG4gICAgICAgICAgICAvLyBvdXQgdGhlIGxvbmdlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRvci5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHF1ZXJpZXMuc3BsaWNlKGxvbmdlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJG9yLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kb3JbMF0gfTtcbiAgICAgIGRlbGV0ZSBxdWVyeS4kb3I7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIEFORCBvcGVyYXRpb25zIG1lYW50IHRvIGJlIHVzZWQgb25seSBmb3IgcG9pbnRlciBwZXJtaXNzaW9ucy5cbiAgcmVkdWNlQW5kT3BlcmF0aW9uKHF1ZXJ5OiB7ICRhbmQ6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kYW5kKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXMgPSBxdWVyeS4kYW5kLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgc2hvcnRlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRhbmQuc3BsaWNlKHNob3J0ZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJGFuZC5sZW5ndGggPT09IDEpIHtcbiAgICAgIHF1ZXJ5ID0geyAuLi5xdWVyeSwgLi4ucXVlcnkuJGFuZFswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRhbmQ7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIENvbnN0cmFpbnRzIHF1ZXJ5IHVzaW5nIENMUCdzIHBvaW50ZXIgcGVybWlzc2lvbnMgKFBQKSBpZiBhbnkuXG4gIC8vIDEuIEV0cmFjdCB0aGUgdXNlciBpZCBmcm9tIGNhbGxlcidzIEFDTGdyb3VwO1xuICAvLyAyLiBFeGN0cmFjdCBhIGxpc3Qgb2YgZmllbGQgbmFtZXMgdGhhdCBhcmUgUFAgZm9yIHRhcmdldCBjb2xsZWN0aW9uIGFuZCBvcGVyYXRpb247XG4gIC8vIDMuIENvbnN0cmFpbnQgdGhlIG9yaWdpbmFsIHF1ZXJ5IHNvIHRoYXQgZWFjaCBQUCBmaWVsZCBtdXN0XG4gIC8vIHBvaW50IHRvIGNhbGxlcidzIGlkIChvciBjb250YWluIGl0IGluIGNhc2Ugb2YgUFAgZmllbGQgYmVpbmcgYW4gYXJyYXkpXG4gIGFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdXG4gICk6IGFueSB7XG4gICAgLy8gQ2hlY2sgaWYgY2xhc3MgaGFzIHB1YmxpYyBwZXJtaXNzaW9uIGZvciBvcGVyYXRpb25cbiAgICAvLyBJZiB0aGUgQmFzZUNMUCBwYXNzLCBsZXQgZ28gdGhyb3VnaFxuICAgIGlmIChzY2hlbWEudGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG5cbiAgICBjb25zdCB1c2VyQUNMID0gYWNsR3JvdXAuZmlsdGVyKGFjbCA9PiB7XG4gICAgICByZXR1cm4gYWNsLmluZGV4T2YoJ3JvbGU6JykgIT0gMCAmJiBhY2wgIT0gJyonO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZ3JvdXBLZXkgPVxuICAgICAgWydnZXQnLCAnZmluZCcsICdjb3VudCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xID8gJ3JlYWRVc2VyRmllbGRzJyA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuXG4gICAgY29uc3QgcGVybUZpZWxkcyA9IFtdO1xuXG4gICAgaWYgKHBlcm1zW29wZXJhdGlvbl0gJiYgcGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKSB7XG4gICAgICBwZXJtRmllbGRzLnB1c2goLi4ucGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKTtcbiAgICB9XG5cbiAgICBpZiAocGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgICBpZiAoIXBlcm1GaWVsZHMuaW5jbHVkZXMoZmllbGQpKSB7XG4gICAgICAgICAgcGVybUZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgaWYgKHBlcm1GaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgICAgLy8gTm8gdXNlciBzZXQgcmV0dXJuIHVuZGVmaW5lZFxuICAgICAgLy8gSWYgdGhlIGxlbmd0aCBpcyA+IDEsIHRoYXQgbWVhbnMgd2UgZGlkbid0IGRlLWR1cGUgdXNlcnMgY29ycmVjdGx5XG4gICAgICBpZiAodXNlckFDTC5sZW5ndGggIT0gMSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VySWQgPSB1c2VyQUNMWzBdO1xuICAgICAgY29uc3QgdXNlclBvaW50ZXIgPSB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB1c2VySWQsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBxdWVyaWVzID0gcGVybUZpZWxkcy5tYXAoa2V5ID0+IHtcbiAgICAgICAgY29uc3QgZmllbGREZXNjcmlwdG9yID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9XG4gICAgICAgICAgZmllbGREZXNjcmlwdG9yICYmXG4gICAgICAgICAgdHlwZW9mIGZpZWxkRGVzY3JpcHRvciA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGREZXNjcmlwdG9yLCAndHlwZScpXG4gICAgICAgICAgICA/IGZpZWxkRGVzY3JpcHRvci50eXBlXG4gICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgbGV0IHF1ZXJ5Q2xhdXNlO1xuXG4gICAgICAgIGlmIChmaWVsZFR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHNpbmdsZSBwb2ludGVyIHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB1c2VyUG9pbnRlciB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHVzZXJzLWFycmF5IHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB7ICRhbGw6IFt1c2VyUG9pbnRlcl0gfSB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ09iamVjdCcpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciBvYmplY3Qgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGhpcyBtZWFucyB0aGF0IHRoZXJlIGlzIGEgQ0xQIGZpZWxkIG9mIGFuIHVuZXhwZWN0ZWQgdHlwZS4gVGhpcyBjb25kaXRpb24gc2hvdWxkIG5vdCBoYXBwZW4sIHdoaWNoIGlzXG4gICAgICAgICAgLy8gd2h5IGlzIGJlaW5nIHRyZWF0ZWQgYXMgYW4gZXJyb3IuXG4gICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICBgQW4gdW5leHBlY3RlZCBjb25kaXRpb24gb2NjdXJyZWQgd2hlbiByZXNvbHZpbmcgcG9pbnRlciBwZXJtaXNzaW9uczogJHtjbGFzc05hbWV9ICR7a2V5fWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIGlmIHdlIGFscmVhZHkgaGF2ZSBhIGNvbnN0cmFpbnQgb24gdGhlIGtleSwgdXNlIHRoZSAkYW5kXG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocXVlcnksIGtleSkpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VBbmRPcGVyYXRpb24oeyAkYW5kOiBbcXVlcnlDbGF1c2UsIHF1ZXJ5XSB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBvdGhlcndpc2UganVzdCBhZGQgdGhlIGNvbnN0YWludFxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHF1ZXJ5Q2xhdXNlKTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gcXVlcmllcy5sZW5ndGggPT09IDEgPyBxdWVyaWVzWzBdIDogdGhpcy5yZWR1Y2VPck9wZXJhdGlvbih7ICRvcjogcXVlcmllcyB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlciB8IGFueSxcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55ID0ge30sXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW10sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgcXVlcnlPcHRpb25zOiBGdWxsUXVlcnlPcHRpb25zID0ge31cbiAgKTogbnVsbCB8IHN0cmluZ1tdIHtcbiAgICBjb25zdCBwZXJtcyA9XG4gICAgICBzY2hlbWEgJiYgc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9uc1xuICAgICAgICA/IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKVxuICAgICAgICA6IHNjaGVtYTtcbiAgICBpZiAoIXBlcm1zKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IHBlcm1zLnByb3RlY3RlZEZpZWxkcztcbiAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoYWNsR3JvdXAuaW5kZXhPZihxdWVyeS5vYmplY3RJZCkgPiAtMSkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBmb3IgcXVlcmllcyB3aGVyZSBcImtleXNcIiBhcmUgc2V0IGFuZCBkbyBub3QgaW5jbHVkZSBhbGwgJ3VzZXJGaWVsZCc6e2ZpZWxkfSxcbiAgICAvLyB3ZSBoYXZlIHRvIHRyYW5zcGFyZW50bHkgaW5jbHVkZSBpdCwgYW5kIHRoZW4gcmVtb3ZlIGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50XG4gICAgLy8gQmVjYXVzZSBpZiBzdWNoIGtleSBub3QgcHJvamVjdGVkIHRoZSBwZXJtaXNzaW9uIHdvbid0IGJlIGVuZm9yY2VkIHByb3Blcmx5XG4gICAgLy8gUFMgdGhpcyBpcyBjYWxsZWQgd2hlbiAnZXhjbHVkZUtleXMnIGFscmVhZHkgcmVkdWNlZCB0byAna2V5cydcbiAgICBjb25zdCBwcmVzZXJ2ZUtleXMgPSBxdWVyeU9wdGlvbnMua2V5cztcblxuICAgIC8vIHRoZXNlIGFyZSBrZXlzIHRoYXQgbmVlZCB0byBiZSBpbmNsdWRlZCBvbmx5XG4gICAgLy8gdG8gYmUgYWJsZSB0byBhcHBseSBwcm90ZWN0ZWRGaWVsZHMgYnkgcG9pbnRlclxuICAgIC8vIGFuZCB0aGVuIHVuc2V0IGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50IChsYXRlciBpbiAgZmlsdGVyU2Vuc2l0aXZlRmllbGRzKVxuICAgIGNvbnN0IHNlcnZlck9ubHlLZXlzID0gW107XG5cbiAgICBjb25zdCBhdXRoZW50aWNhdGVkID0gYXV0aC51c2VyO1xuXG4gICAgLy8gbWFwIHRvIGFsbG93IGNoZWNrIHdpdGhvdXQgYXJyYXkgc2VhcmNoXG4gICAgY29uc3Qgcm9sZXMgPSAoYXV0aC51c2VyUm9sZXMgfHwgW10pLnJlZHVjZSgoYWNjLCByKSA9PiB7XG4gICAgICBhY2Nbcl0gPSBwcm90ZWN0ZWRGaWVsZHNbcl07XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIGFycmF5IG9mIHNldHMgb2YgcHJvdGVjdGVkIGZpZWxkcy4gc2VwYXJhdGUgaXRlbSBmb3IgZWFjaCBhcHBsaWNhYmxlIGNyaXRlcmlhXG4gICAgY29uc3QgcHJvdGVjdGVkS2V5c1NldHMgPSBbXTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gc2tpcCB1c2VyRmllbGRzXG4gICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSkge1xuICAgICAgICBpZiAocHJlc2VydmVLZXlzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZygxMCk7XG4gICAgICAgICAgaWYgKCFwcmVzZXJ2ZUtleXMuaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgICAgICAgLy8gMS4gcHV0IGl0IHRoZXJlIHRlbXBvcmFyaWx5XG4gICAgICAgICAgICBxdWVyeU9wdGlvbnMua2V5cyAmJiBxdWVyeU9wdGlvbnMua2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAvLyAyLiBwcmVzZXJ2ZSBpdCBkZWxldGUgbGF0ZXJcbiAgICAgICAgICAgIHNlcnZlck9ubHlLZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIGFkZCBwdWJsaWMgdGllclxuICAgICAgaWYgKGtleSA9PT0gJyonKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG4gICAgICAgICAgLy8gZm9yIGxvZ2dlZCBpbiB1c2Vyc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJvbGVzW2tleV0gJiYga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpIHtcbiAgICAgICAgICAvLyBhZGQgYXBwbGljYWJsZSByb2xlc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocm9sZXNba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjaGVjayBpZiB0aGVyZSdzIGEgcnVsZSBmb3IgY3VycmVudCB1c2VyJ3MgaWRcbiAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgY29uc3QgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuICAgICAgaWYgKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHByZXNlcnZlIGZpZWxkcyB0byBiZSByZW1vdmVkIGJlZm9yZSBzZW5kaW5nIHJlc3BvbnNlIHRvIGNsaWVudFxuICAgIGlmIChzZXJ2ZXJPbmx5S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyA9IHNlcnZlck9ubHlLZXlzO1xuICAgIH1cblxuICAgIGxldCBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5c1NldHMucmVkdWNlKChhY2MsIG5leHQpID0+IHtcbiAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgIGFjYy5wdXNoKC4uLm5leHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCBbXSk7XG5cbiAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgcHJvdGVjdGVkS2V5c1NldHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5cy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHByb3RlY3RlZEtleXM7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkudGhlbih0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uO1xuICAgIH0pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gY29tbWl0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBhYm9ydCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVE9ETzogY3JlYXRlIGluZGV4ZXMgb24gZmlyc3QgY3JlYXRpb24gb2YgYSBfVXNlciBvYmplY3QuIE90aGVyd2lzZSBpdCdzIGltcG9zc2libGUgdG9cbiAgLy8gaGF2ZSBhIFBhcnNlIGFwcCB3aXRob3V0IGl0IGhhdmluZyBhIF9Vc2VyIGNvbGxlY3Rpb24uXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpIHtcbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKHtcbiAgICAgIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXM6IFNjaGVtYUNvbnRyb2xsZXIuVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgICB9KTtcbiAgICBjb25zdCByZXF1aXJlZFVzZXJGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fVXNlcixcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZFJvbGVGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fUm9sZSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0lkZW1wb3RlbmN5LFxuICAgICAgfSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Vc2VyJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Sb2xlJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19JZGVtcG90ZW5jeScpKTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VybmFtZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgaWYgKCF0aGlzLm9wdGlvbnMuZGlzYWJsZUNhc2VJbnNlbnNpdGl2aXR5KSB7XG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddLCAnY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZScsIHRydWUpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSB1c2VybmFtZSBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcblxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfZW1haWwnLCB0cnVlKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgZW1haWwgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXIgZW1haWwgYWRkcmVzc2VzOiAnLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfUm9sZScsIHJlcXVpcmVkUm9sZUZpZWxkcywgWyduYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHJvbGUgbmFtZTogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgIC5lbnN1cmVVbmlxdWVuZXNzKCdfSWRlbXBvdGVuY3knLCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzLCBbJ3JlcUlkJ10pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciBpZGVtcG90ZW5jeSByZXF1ZXN0IElEOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCBpc01vbmdvQWRhcHRlciA9IHRoaXMuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXI7XG4gICAgY29uc3QgaXNQb3N0Z3Jlc0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyO1xuICAgIGlmIChpc01vbmdvQWRhcHRlciB8fCBpc1Bvc3RncmVzQWRhcHRlcikge1xuICAgICAgbGV0IG9wdGlvbnMgPSB7fTtcbiAgICAgIGlmIChpc01vbmdvQWRhcHRlcikge1xuICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgIHR0bDogMCxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHRoaXMuaWRlbXBvdGVuY3lPcHRpb25zO1xuICAgICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gPSB0cnVlO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydleHBpcmUnXSwgJ3R0bCcsIGZhbHNlLCBvcHRpb25zKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIFRUTCBpbmRleCBmb3IgaWRlbXBvdGVuY3kgZXhwaXJlIGRhdGU6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci51cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpO1xuICB9XG5cbiAgX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3Q6IGFueSwga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpIDwgMCkge1xuICAgICAgb2JqZWN0W2tleV0gPSB2YWx1ZVtrZXldO1xuICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICB9XG4gICAgY29uc3QgcGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgIGNvbnN0IGZpcnN0S2V5ID0gcGF0aFswXTtcbiAgICBjb25zdCBuZXh0UGF0aCA9IHBhdGguc2xpY2UoMSkuam9pbignLicpO1xuXG4gICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgIGlmICh0aGlzLm9wdGlvbnMgJiYgdGhpcy5vcHRpb25zLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICAgIGZvciAoY29uc3Qga2V5d29yZCBvZiB0aGlzLm9wdGlvbnMucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgICBjb25zdCBtYXRjaCA9IFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUoXG4gICAgICAgICAgeyBbZmlyc3RLZXldOiB0cnVlLCBbbmV4dFBhdGhdOiB0cnVlIH0sXG4gICAgICAgICAga2V5d29yZC5rZXksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgb2JqZWN0W2ZpcnN0S2V5XSA9IHRoaXMuX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChcbiAgICAgIG9iamVjdFtmaXJzdEtleV0gfHwge30sXG4gICAgICBuZXh0UGF0aCxcbiAgICAgIHZhbHVlW2ZpcnN0S2V5XVxuICAgICk7XG4gICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBfc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdDogYW55LCByZXN1bHQ6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSB7fTtcbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfVxuICAgIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBjb25zdCBrZXlVcGRhdGUgPSBvcmlnaW5hbE9iamVjdFtrZXldO1xuICAgICAgLy8gZGV0ZXJtaW5lIGlmIHRoYXQgd2FzIGFuIG9wXG4gICAgICBpZiAoXG4gICAgICAgIGtleVVwZGF0ZSAmJlxuICAgICAgICB0eXBlb2Yga2V5VXBkYXRlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBrZXlVcGRhdGUuX19vcCAmJlxuICAgICAgICBbJ0FkZCcsICdBZGRVbmlxdWUnLCAnUmVtb3ZlJywgJ0luY3JlbWVudCddLmluZGV4T2Yoa2V5VXBkYXRlLl9fb3ApID4gLTFcbiAgICAgICkge1xuICAgICAgICAvLyBvbmx5IHZhbGlkIG9wcyB0aGF0IHByb2R1Y2UgYW4gYWN0aW9uYWJsZSByZXN1bHRcbiAgICAgICAgLy8gdGhlIG9wIG1heSBoYXZlIGhhcHBlbmVkIG9uIGEga2V5cGF0aFxuICAgICAgICB0aGlzLl9leHBhbmRSZXN1bHRPbktleVBhdGgocmVzcG9uc2UsIGtleSwgcmVzdWx0KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgfVxuXG4gIHN0YXRpYyBfdmFsaWRhdGVRdWVyeTogKGFueSwgYm9vbGVhbiwgYm9vbGVhbiwgYm9vbGVhbikgPT4gdm9pZDtcbiAgc3RhdGljIGZpbHRlclNlbnNpdGl2ZURhdGE6IChib29sZWFuLCBib29sZWFuLCBhbnlbXSwgYW55LCBhbnksIGFueSwgc3RyaW5nLCBhbnlbXSwgYW55KSA9PiB2b2lkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERhdGFiYXNlQ29udHJvbGxlcjtcbi8vIEV4cG9zZSB2YWxpZGF0ZVF1ZXJ5IGZvciB0ZXN0c1xubW9kdWxlLmV4cG9ydHMuX3ZhbGlkYXRlUXVlcnkgPSB2YWxpZGF0ZVF1ZXJ5O1xubW9kdWxlLmV4cG9ydHMuZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IGZpbHRlclNlbnNpdGl2ZURhdGE7XG4iXSwibWFwcGluZ3MiOiI7O0FBS0E7QUFFQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUF3RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUt4RCxTQUFTQSxXQUFXLENBQUNDLEtBQUssRUFBRUMsR0FBRyxFQUFFO0VBQy9CLE1BQU1DLFFBQVEsR0FBR0MsZUFBQyxDQUFDQyxTQUFTLENBQUNKLEtBQUssQ0FBQztFQUNuQztFQUNBRSxRQUFRLENBQUNHLE1BQU0sR0FBRztJQUFFQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FB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