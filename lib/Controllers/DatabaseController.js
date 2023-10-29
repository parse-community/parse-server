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
function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; } // A database adapter that works with data exported from the hosted
// Parse database.
// -disable-next
// -disable-next
// -disable-next
// -disable-next
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
        case 'SetOnInsert':
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
      if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment', 'SetOnInsert'].indexOf(keyUpdate.__op) > -1) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9pbnRlcnNlY3QiLCJfZGVlcGNvcHkiLCJfbG9nZ2VyIiwiX1V0aWxzIiwiU2NoZW1hQ29udHJvbGxlciIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX01vbmdvU3RvcmFnZUFkYXB0ZXIiLCJfUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsIl9TY2hlbWFDYWNoZSIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsIm5vZGVJbnRlcm9wIiwiV2Vha01hcCIsImNhY2hlQmFiZWxJbnRlcm9wIiwiY2FjaGVOb2RlSW50ZXJvcCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiY2FjaGUiLCJoYXMiLCJnZXQiLCJuZXdPYmoiLCJoYXNQcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImRlc2MiLCJzZXQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsIlR5cGVFcnJvciIsIk51bWJlciIsIl9vYmplY3RXaXRob3V0UHJvcGVydGllcyIsImV4Y2x1ZGVkIiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzTG9vc2UiLCJzb3VyY2VTeW1ib2xLZXlzIiwiaW5kZXhPZiIsInByb3BlcnR5SXNFbnVtZXJhYmxlIiwic291cmNlS2V5cyIsImFkZFdyaXRlQUNMIiwicXVlcnkiLCJhY2wiLCJuZXdRdWVyeSIsIl8iLCJjbG9uZURlZXAiLCJfd3Blcm0iLCIkaW4iLCJhZGRSZWFkQUNMIiwiX3JwZXJtIiwidHJhbnNmb3JtT2JqZWN0QUNMIiwiX3JlZiIsIkFDTCIsInJlc3VsdCIsImVudHJ5IiwicmVhZCIsIndyaXRlIiwic3BlY2lhbFF1ZXJ5S2V5cyIsInNwZWNpYWxNYXN0ZXJRdWVyeUtleXMiLCJ2YWxpZGF0ZVF1ZXJ5IiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwidXBkYXRlIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsIiRhbmQiLCIkbm9yIiwiJHJlZ2V4IiwiJG9wdGlvbnMiLCJtYXRjaCIsImluY2x1ZGVzIiwiSU5WQUxJRF9LRVlfTkFNRSIsImZpbHRlclNlbnNpdGl2ZURhdGEiLCJhY2xHcm91cCIsImF1dGgiLCJvcGVyYXRpb24iLCJzY2hlbWEiLCJjbGFzc05hbWUiLCJwcm90ZWN0ZWRGaWVsZHMiLCJ1c2VySWQiLCJ1c2VyIiwiaWQiLCJwZXJtcyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlzUmVhZE9wZXJhdGlvbiIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtIiwic3RhcnRzV2l0aCIsIm1hcCIsInN1YnN0cmluZyIsIm5ld1Byb3RlY3RlZEZpZWxkcyIsIm92ZXJyaWRlUHJvdGVjdGVkRmllbGRzIiwicG9pbnRlclBlcm0iLCJwb2ludGVyUGVybUluY2x1ZGVzVXNlciIsInJlYWRVc2VyRmllbGRWYWx1ZSIsImlzQXJyYXkiLCJzb21lIiwib2JqZWN0SWQiLCJmaWVsZHMiLCJ2IiwiaXNVc2VyQ2xhc3MiLCJwYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJzZXNzaW9uVG9rZW4iLCJfcGVybXMkcHJvdGVjdGVkRmllbGQiLCJfcGVybXMkcHJvdGVjdGVkRmllbGQyIiwiayIsInRlbXBvcmFyeUtleXMiLCJjaGFyQXQiLCJhdXRoRGF0YSIsInNwZWNpYWxLZXlzRm9yVXBkYXRlIiwiaXNTcGVjaWFsVXBkYXRlS2V5Iiwiam9pblRhYmxlTmFtZSIsImZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUiLCJfX29wIiwiYW1vdW50IiwiSU5WQUxJRF9KU09OIiwib2JqZWN0cyIsIkNPTU1BTkRfVU5BVkFJTEFCTEUiLCJ0cmFuc2Zvcm1BdXRoRGF0YSIsInByb3ZpZGVyIiwicHJvdmlkZXJEYXRhIiwiZmllbGROYW1lIiwidHlwZSIsInVudHJhbnNmb3JtT2JqZWN0QUNMIiwiX3JlZjIiLCJvdXRwdXQiLCJnZXRSb290RmllbGROYW1lIiwic3BsaXQiLCJyZWxhdGlvblNjaGVtYSIsInJlbGF0ZWRJZCIsIm93bmluZ0lkIiwibWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2UiLCJvcHRpb25zIiwiZm9yY2VFbWFpbEFuZFVzZXJuYW1lVG9Mb3dlckNhc2UiLCJ0b0xvd2VyQ2FzZUZpZWxkcyIsInRvTG93ZXJDYXNlIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJhZGFwdGVyIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwic2NoZW1hUHJvbWlzZSIsIl90cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbGxlY3Rpb25FeGlzdHMiLCJjbGFzc0V4aXN0cyIsInB1cmdlQ29sbGVjdGlvbiIsImxvYWRTY2hlbWEiLCJ0aGVuIiwic2NoZW1hQ29udHJvbGxlciIsImdldE9uZVNjaGVtYSIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwidmFsaWRhdGVDbGFzc05hbWUiLCJjbGFzc05hbWVJc1ZhbGlkIiwiUHJvbWlzZSIsInJlamVjdCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsInJlc29sdmUiLCJjbGVhckNhY2hlIiwibG9hZCIsImxvYWRTY2hlbWFJZk5lZWRlZCIsInJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IiwidCIsImdldEV4cGVjdGVkVHlwZSIsInRhcmdldENsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJydW5PcHRpb25zIiwibWFpbnRlbmFuY2UiLCJzIiwiY2FuQWRkRmllbGQiLCJtYW55IiwidXBzZXJ0IiwiYWRkc0ZpZWxkIiwic2tpcFNhbml0aXphdGlvbiIsInZhbGlkYXRlT25seSIsInZhbGlkU2NoZW1hQ29udHJvbGxlciIsIlV0aWxzIiwiY2hlY2tQcm9oaWJpdGVkS2V5d29yZHMiLCJlcnJvciIsIm9yaWdpbmFsUXVlcnkiLCJvcmlnaW5hbFVwZGF0ZSIsImRlZXBjb3B5IiwicmVsYXRpb25VcGRhdGVzIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiY29sbGVjdFJlbGF0aW9uVXBkYXRlcyIsImFkZFBvaW50ZXJQZXJtaXNzaW9ucyIsImNhdGNoIiwicm9vdEZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWQiLCJ1cGRhdGVPcGVyYXRpb24iLCJpbm5lcktleSIsIklOVkFMSURfTkVTVEVEX0tFWSIsImZpbmQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cHNlcnRPbmVPYmplY3QiLCJmaW5kT25lQW5kVXBkYXRlIiwiaGFuZGxlUmVsYXRpb25VcGRhdGVzIiwiX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQiLCJvcHMiLCJkZWxldGVNZSIsInByb2Nlc3MiLCJvcCIsIngiLCJwZW5kaW5nIiwiYWRkUmVsYXRpb24iLCJyZW1vdmVSZWxhdGlvbiIsImFsbCIsImZyb21DbGFzc05hbWUiLCJmcm9tSWQiLCJ0b0lkIiwiZG9jIiwiY29kZSIsImRlc3Ryb3kiLCJwYXJzZUZvcm1hdFNjaGVtYSIsImNyZWF0ZSIsIm9yaWdpbmFsT2JqZWN0IiwiY3JlYXRlZEF0IiwiaXNvIiwiX190eXBlIiwidXBkYXRlZEF0IiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiY3JlYXRlT2JqZWN0IiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsImNsYXNzU2NoZW1hIiwic2NoZW1hRGF0YSIsInNjaGVtYUZpZWxkcyIsIm5ld0tleXMiLCJmaWVsZCIsImFjdGlvbiIsImRlbGV0ZUV2ZXJ5dGhpbmciLCJmYXN0IiwiU2NoZW1hQ2FjaGUiLCJjbGVhciIsImRlbGV0ZUFsbENsYXNzZXMiLCJyZWxhdGVkSWRzIiwicXVlcnlPcHRpb25zIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImZpbmRPcHRpb25zIiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIl9pZCIsInJlc3VsdHMiLCJvd25pbmdJZHMiLCJyZWR1Y2VJblJlbGF0aW9uIiwicHJvbWlzZXMiLCJvcnMiLCJhUXVlcnkiLCJpbmRleCIsImFuZHMiLCJvdGhlcktleXMiLCJxdWVyaWVzIiwiY29uc3RyYWludEtleSIsImlzTmVnYXRpb24iLCJyIiwicSIsImlkcyIsImFkZE5vdEluT2JqZWN0SWRzSWRzIiwiYWRkSW5PYmplY3RJZHNJZHMiLCJyZWR1Y2VSZWxhdGlvbktleXMiLCJyZWxhdGVkVG8iLCJpZHNGcm9tU3RyaW5nIiwiaWRzRnJvbUVxIiwiaWRzRnJvbUluIiwiYWxsSWRzIiwibGlzdCIsInRvdGFsTGVuZ3RoIiwicmVkdWNlIiwibWVtbyIsImlkc0ludGVyc2VjdGlvbiIsImludGVyc2VjdCIsImJpZyIsIiRlcSIsImlkc0Zyb21OaW4iLCJTZXQiLCIkbmluIiwiY291bnQiLCJkaXN0aW5jdCIsInBpcGVsaW5lIiwicmVhZFByZWZlcmVuY2UiLCJjYXNlSW5zZW5zaXRpdmUiLCJleHBsYWluIiwiX2NyZWF0ZWRfYXQiLCJfdXBkYXRlZF9hdCIsImRpc2FibGVDYXNlSW5zZW5zaXRpdml0eSIsImFkZFByb3RlY3RlZEZpZWxkcyIsImFnZ3JlZ2F0ZSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImRlbGV0ZVNjaGVtYSIsImRlbGV0ZUNsYXNzIiwid2FzUGFyc2VDb2xsZWN0aW9uIiwicmVsYXRpb25GaWVsZE5hbWVzIiwibmFtZSIsImRlbCIsInJlbG9hZERhdGEiLCJvYmplY3RUb0VudHJpZXNTdHJpbmdzIiwiZW50cmllcyIsImEiLCJKU09OIiwic3RyaW5naWZ5Iiwiam9pbiIsInJlZHVjZU9yT3BlcmF0aW9uIiwicmVwZWF0IiwiaiIsInNob3J0ZXIiLCJsb25nZXIiLCJmb3VuZEVudHJpZXMiLCJhY2MiLCJzaG9ydGVyRW50cmllcyIsInNwbGljZSIsInJlZHVjZUFuZE9wZXJhdGlvbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsInVzZXJBQ0wiLCJncm91cEtleSIsInBlcm1GaWVsZHMiLCJwb2ludGVyRmllbGRzIiwidXNlclBvaW50ZXIiLCJmaWVsZERlc2NyaXB0b3IiLCJmaWVsZFR5cGUiLCJxdWVyeUNsYXVzZSIsIiRhbGwiLCJhc3NpZ24iLCJwcmVzZXJ2ZUtleXMiLCJzZXJ2ZXJPbmx5S2V5cyIsImF1dGhlbnRpY2F0ZWQiLCJyb2xlcyIsInVzZXJSb2xlcyIsInByb3RlY3RlZEtleXNTZXRzIiwicHJvdGVjdGVkS2V5cyIsIm5leHQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInJlcXVpcmVkVXNlckZpZWxkcyIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJfVXNlciIsInJlcXVpcmVkUm9sZUZpZWxkcyIsIl9Sb2xlIiwicmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcyIsIl9JZGVtcG90ZW5jeSIsImVuc3VyZVVuaXF1ZW5lc3MiLCJsb2dnZXIiLCJ3YXJuIiwiZW5zdXJlSW5kZXgiLCJpc01vbmdvQWRhcHRlciIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJpc1Bvc3RncmVzQWRhcHRlciIsIlBvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJ0dGwiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJfZXhwYW5kUmVzdWx0T25LZXlQYXRoIiwicGF0aCIsImZpcnN0S2V5IiwibmV4dFBhdGgiLCJzbGljZSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJrZXl3b3JkIiwib2JqZWN0Q29udGFpbnNLZXlWYWx1ZSIsInJlc3BvbnNlIiwia2V5VXBkYXRlIiwibW9kdWxlIiwiZXhwb3J0cyIsIl92YWxpZGF0ZVF1ZXJ5Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyLvu78vLyBAZmxvd1xuLy8gQSBkYXRhYmFzZSBhZGFwdGVyIHRoYXQgd29ya3Mgd2l0aCBkYXRhIGV4cG9ydGVkIGZyb20gdGhlIGhvc3RlZFxuLy8gUGFyc2UgZGF0YWJhc2UuXG5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGludGVyc2VjdCBmcm9tICdpbnRlcnNlY3QnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCAqIGFzIFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgdHlwZSB7IExvYWRTY2hlbWFPcHRpb25zIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgdHlwZSB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4uL09wdGlvbnMnO1xuaW1wb3J0IHR5cGUgeyBRdWVyeU9wdGlvbnMsIEZ1bGxRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcblxuZnVuY3Rpb24gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ193cGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fd3Blcm0gPSB7ICRpbjogW251bGwsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG5mdW5jdGlvbiBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfcnBlcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3JwZXJtID0geyAkaW46IFtudWxsLCAnKicsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG4vLyBUcmFuc2Zvcm1zIGEgUkVTVCBBUEkgZm9ybWF0dGVkIEFDTCBvYmplY3QgdG8gb3VyIHR3by1maWVsZCBtb25nbyBmb3JtYXQuXG5jb25zdCB0cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBBQ0wsIC4uLnJlc3VsdCB9KSA9PiB7XG4gIGlmICghQUNMKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHJlc3VsdC5fd3Blcm0gPSBbXTtcbiAgcmVzdWx0Ll9ycGVybSA9IFtdO1xuXG4gIGZvciAoY29uc3QgZW50cnkgaW4gQUNMKSB7XG4gICAgaWYgKEFDTFtlbnRyeV0ucmVhZCkge1xuICAgICAgcmVzdWx0Ll9ycGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gICAgaWYgKEFDTFtlbnRyeV0ud3JpdGUpIHtcbiAgICAgIHJlc3VsdC5fd3Blcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5jb25zdCBzcGVjaWFsUXVlcnlLZXlzID0gWyckYW5kJywgJyRvcicsICckbm9yJywgJ19ycGVybScsICdfd3Blcm0nXTtcbmNvbnN0IHNwZWNpYWxNYXN0ZXJRdWVyeUtleXMgPSBbXG4gIC4uLnNwZWNpYWxRdWVyeUtleXMsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ190b21ic3RvbmUnLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IHZhbGlkYXRlUXVlcnkgPSAoXG4gIHF1ZXJ5OiBhbnksXG4gIGlzTWFzdGVyOiBib29sZWFuLFxuICBpc01haW50ZW5hbmNlOiBib29sZWFuLFxuICB1cGRhdGU6IGJvb2xlYW5cbik6IHZvaWQgPT4ge1xuICBpZiAoaXNNYWludGVuYW5jZSkge1xuICAgIGlzTWFzdGVyID0gdHJ1ZTtcbiAgfVxuICBpZiAocXVlcnkuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdDYW5ub3QgcXVlcnkgb24gQUNMLicpO1xuICB9XG5cbiAgaWYgKHF1ZXJ5LiRvcikge1xuICAgIGlmIChxdWVyeS4kb3IgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJG9yLmZvckVhY2godmFsdWUgPT4gdmFsaWRhdGVRdWVyeSh2YWx1ZSwgaXNNYXN0ZXIsIGlzTWFpbnRlbmFuY2UsIHVwZGF0ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkb3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kYW5kKSB7XG4gICAgaWYgKHF1ZXJ5LiRhbmQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJGFuZC5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCB1cGRhdGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJGFuZCBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRub3IpIHtcbiAgICBpZiAocXVlcnkuJG5vciBpbnN0YW5jZW9mIEFycmF5ICYmIHF1ZXJ5LiRub3IubGVuZ3RoID4gMCkge1xuICAgICAgcXVlcnkuJG5vci5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCB1cGRhdGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAnQmFkICRub3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IG9mIGF0IGxlYXN0IDEgdmFsdWUuJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmIChxdWVyeSAmJiBxdWVyeVtrZXldICYmIHF1ZXJ5W2tleV0uJHJlZ2V4KSB7XG4gICAgICBpZiAodHlwZW9mIHF1ZXJ5W2tleV0uJG9wdGlvbnMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmICghcXVlcnlba2V5XS4kb3B0aW9ucy5tYXRjaCgvXltpbXhzXSskLykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgYEJhZCAkb3B0aW9ucyB2YWx1ZSBmb3IgcXVlcnk6ICR7cXVlcnlba2V5XS4kb3B0aW9uc31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoXG4gICAgICAha2V5Lm1hdGNoKC9eW2EtekEtWl1bYS16QS1aMC05X1xcLl0qJC8pICYmXG4gICAgICAoKCFzcGVjaWFsUXVlcnlLZXlzLmluY2x1ZGVzKGtleSkgJiYgIWlzTWFzdGVyICYmICF1cGRhdGUpIHx8XG4gICAgICAgICh1cGRhdGUgJiYgaXNNYXN0ZXIgJiYgIXNwZWNpYWxNYXN0ZXJRdWVyeUtleXMuaW5jbHVkZXMoa2V5KSkpXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQga2V5IG5hbWU6ICR7a2V5fWApO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vLyBGaWx0ZXJzIG91dCBhbnkgZGF0YSB0aGF0IHNob3VsZG4ndCBiZSBvbiB0aGlzIFJFU1QtZm9ybWF0dGVkIG9iamVjdC5cbmNvbnN0IGZpbHRlclNlbnNpdGl2ZURhdGEgPSAoXG4gIGlzTWFzdGVyOiBib29sZWFuLFxuICBpc01haW50ZW5hbmNlOiBib29sZWFuLFxuICBhY2xHcm91cDogYW55W10sXG4gIGF1dGg6IGFueSxcbiAgb3BlcmF0aW9uOiBhbnksXG4gIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyIHwgYW55LFxuICBjbGFzc05hbWU6IHN0cmluZyxcbiAgcHJvdGVjdGVkRmllbGRzOiBudWxsIHwgQXJyYXk8YW55PixcbiAgb2JqZWN0OiBhbnlcbikgPT4ge1xuICBsZXQgdXNlcklkID0gbnVsbDtcbiAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG5cbiAgLy8gcmVwbGFjZSBwcm90ZWN0ZWRGaWVsZHMgd2hlbiB1c2luZyBwb2ludGVyLXBlcm1pc3Npb25zXG4gIGNvbnN0IHBlcm1zID1cbiAgICBzY2hlbWEgJiYgc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyA/IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSA6IHt9O1xuICBpZiAocGVybXMpIHtcbiAgICBjb25zdCBpc1JlYWRPcGVyYXRpb24gPSBbJ2dldCcsICdmaW5kJ10uaW5kZXhPZihvcGVyYXRpb24pID4gLTE7XG5cbiAgICBpZiAoaXNSZWFkT3BlcmF0aW9uICYmIHBlcm1zLnByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gZXh0cmFjdCBwcm90ZWN0ZWRGaWVsZHMgYWRkZWQgd2l0aCB0aGUgcG9pbnRlci1wZXJtaXNzaW9uIHByZWZpeFxuICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0gPSBPYmplY3Qua2V5cyhwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpXG4gICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICByZXR1cm4geyBrZXk6IGtleS5zdWJzdHJpbmcoMTApLCB2YWx1ZTogcGVybXMucHJvdGVjdGVkRmllbGRzW2tleV0gfTtcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG5ld1Byb3RlY3RlZEZpZWxkczogQXJyYXk8c3RyaW5nPltdID0gW107XG4gICAgICBsZXQgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSBmYWxzZTtcblxuICAgICAgLy8gY2hlY2sgaWYgdGhlIG9iamVjdCBncmFudHMgdGhlIGN1cnJlbnQgdXNlciBhY2Nlc3MgYmFzZWQgb24gdGhlIGV4dHJhY3RlZCBmaWVsZHNcbiAgICAgIHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtLmZvckVhY2gocG9pbnRlclBlcm0gPT4ge1xuICAgICAgICBsZXQgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgcmVhZFVzZXJGaWVsZFZhbHVlID0gb2JqZWN0W3BvaW50ZXJQZXJtLmtleV07XG4gICAgICAgIGlmIChyZWFkVXNlckZpZWxkVmFsdWUpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyZWFkVXNlckZpZWxkVmFsdWUpKSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IHJlYWRVc2VyRmllbGRWYWx1ZS5zb21lKFxuICAgICAgICAgICAgICB1c2VyID0+IHVzZXIub2JqZWN0SWQgJiYgdXNlci5vYmplY3RJZCA9PT0gdXNlcklkXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9XG4gICAgICAgICAgICAgIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCAmJiByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgPT09IHVzZXJJZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocG9pbnRlclBlcm1JbmNsdWRlc1VzZXIpIHtcbiAgICAgICAgICBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IHRydWU7XG4gICAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocG9pbnRlclBlcm0udmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gaWYgYXQgbGVhc3Qgb25lIHBvaW50ZXItcGVybWlzc2lvbiBhZmZlY3RlZCB0aGUgY3VycmVudCB1c2VyXG4gICAgICAvLyBpbnRlcnNlY3QgdnMgcHJvdGVjdGVkRmllbGRzIGZyb20gcHJldmlvdXMgc3RhZ2UgKEBzZWUgYWRkUHJvdGVjdGVkRmllbGRzKVxuICAgICAgLy8gU2V0cyB0aGVvcnkgKGludGVyc2VjdGlvbnMpOiBBIHggKEIgeCBDKSA9PSAoQSB4IEIpIHggQ1xuICAgICAgaWYgKG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwcm90ZWN0ZWRGaWVsZHMpO1xuICAgICAgfVxuICAgICAgLy8gaW50ZXJzZWN0IGFsbCBzZXRzIG9mIHByb3RlY3RlZEZpZWxkc1xuICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLmZvckVhY2goZmllbGRzID0+IHtcbiAgICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICAgIC8vIGlmIHRoZXJlJ3JlIG5vIHByb3RjdGVkRmllbGRzIGJ5IG90aGVyIGNyaXRlcmlhICggaWQgLyByb2xlIC8gYXV0aClcbiAgICAgICAgICAvLyB0aGVuIHdlIG11c3QgaW50ZXJzZWN0IGVhY2ggc2V0IChwZXIgdXNlckZpZWxkKVxuICAgICAgICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBmaWVsZHM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHByb3RlY3RlZEZpZWxkcy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaXNVc2VyQ2xhc3MgPSBjbGFzc05hbWUgPT09ICdfVXNlcic7XG4gIGlmIChpc1VzZXJDbGFzcykge1xuICAgIG9iamVjdC5wYXNzd29yZCA9IG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIGRlbGV0ZSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBkZWxldGUgb2JqZWN0LnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIGlmIChpc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8qIHNwZWNpYWwgdHJlYXQgZm9yIHRoZSB1c2VyIGNsYXNzOiBkb24ndCBmaWx0ZXIgcHJvdGVjdGVkRmllbGRzIGlmIGN1cnJlbnRseSBsb2dnZWRpbiB1c2VyIGlzXG4gIHRoZSByZXRyaWV2ZWQgdXNlciAqL1xuICBpZiAoIShpc1VzZXJDbGFzcyAmJiB1c2VySWQgJiYgb2JqZWN0Lm9iamVjdElkID09PSB1c2VySWQpKSB7XG4gICAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG5cbiAgICAvLyBmaWVsZHMgbm90IHJlcXVlc3RlZCBieSBjbGllbnQgKGV4Y2x1ZGVkKSxcbiAgICAvLyBidXQgd2VyZSBuZWVkZWQgdG8gYXBwbHkgcHJvdGVjdGVkRmllbGRzXG4gICAgcGVybXM/LnByb3RlY3RlZEZpZWxkcz8udGVtcG9yYXJ5S2V5cz8uZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuICB9XG5cbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKGtleS5jaGFyQXQoMCkgPT09ICdfJykge1xuICAgICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgIH1cbiAgfVxuXG4gIGlmICghaXNVc2VyQ2xhc3MgfHwgaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgaWYgKGFjbEdyb3VwLmluZGV4T2Yob2JqZWN0Lm9iamVjdElkKSA+IC0xKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuLy8gUnVucyBhbiB1cGRhdGUgb24gdGhlIGRhdGFiYXNlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGFuIG9iamVjdCB3aXRoIHRoZSBuZXcgdmFsdWVzIGZvciBmaWVsZFxuLy8gbW9kaWZpY2F0aW9ucyB0aGF0IGRvbid0IGtub3cgdGhlaXIgcmVzdWx0cyBhaGVhZCBvZiB0aW1lLCBsaWtlXG4vLyAnaW5jcmVtZW50Jy5cbi8vIE9wdGlvbnM6XG4vLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbi8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbi8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG5jb25zdCBzcGVjaWFsS2V5c0ZvclVwZGF0ZSA9IFtcbiAgJ19oYXNoZWRfcGFzc3dvcmQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxVcGRhdGVLZXkgPSBrZXkgPT4ge1xuICByZXR1cm4gc3BlY2lhbEtleXNGb3JVcGRhdGUuaW5kZXhPZihrZXkpID49IDA7XG59O1xuXG5mdW5jdGlvbiBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSB7XG4gIHJldHVybiBgX0pvaW46JHtrZXl9OiR7Y2xhc3NOYW1lfWA7XG59XG5cbmNvbnN0IGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUgPSBvYmplY3QgPT4ge1xuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0W2tleV0gJiYgb2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgc3dpdGNoIChvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XS5hbW91bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLmFtb3VudDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnU2V0T25JbnNlcnQnOlxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY29uc3QgbWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2UgPSAob2JqZWN0LCBjbGFzc05hbWUsIG9wdGlvbnMpID0+IHtcbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiBvcHRpb25zLmZvcmNlRW1haWxBbmRVc2VybmFtZVRvTG93ZXJDYXNlKSB7XG4gICAgY29uc3QgdG9Mb3dlckNhc2VGaWVsZHMgPSBbJ2VtYWlsJywgJ3VzZXJuYW1lJ107XG4gICAgdG9Mb3dlckNhc2VGaWVsZHMuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PT0gJ3N0cmluZycpIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0udG9Mb3dlckNhc2UoKTtcbiAgICB9KTtcbiAgfVxufTtcblxuY2xhc3MgRGF0YWJhc2VDb250cm9sbGVyIHtcbiAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG4gIHNjaGVtYVByb21pc2U6ID9Qcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj47XG4gIF90cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueTtcbiAgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zO1xuICBpZGVtcG90ZW5jeU9wdGlvbnM6IGFueTtcblxuICBjb25zdHJ1Y3RvcihhZGFwdGVyOiBTdG9yYWdlQWRhcHRlciwgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdGhpcy5hZGFwdGVyID0gYWRhcHRlcjtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHRoaXMuaWRlbXBvdGVuY3lPcHRpb25zID0gdGhpcy5vcHRpb25zLmlkZW1wb3RlbmN5T3B0aW9ucyB8fCB7fTtcbiAgICAvLyBQcmV2ZW50IG11dGFibGUgdGhpcy5zY2hlbWEsIG90aGVyd2lzZSBvbmUgcmVxdWVzdCBjb3VsZCB1c2VcbiAgICAvLyBtdWx0aXBsZSBzY2hlbWFzLCBzbyBpbnN0ZWFkIHVzZSBsb2FkU2NoZW1hIHRvIGdldCBhIHNjaGVtYS5cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICB9XG5cbiAgY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY2xhc3NFeGlzdHMoY2xhc3NOYW1lKTtcbiAgfVxuXG4gIHB1cmdlQ29sbGVjdGlvbihjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUpKVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShjbGFzc05hbWUsIHNjaGVtYSwge30pKTtcbiAgfVxuXG4gIHZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCAnaW52YWxpZCBjbGFzc05hbWU6ICcgKyBjbGFzc05hbWUpXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBzY2hlbWFDb250cm9sbGVyLlxuICBsb2FkU2NoZW1hKFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hUHJvbWlzZSAhPSBudWxsKSB7XG4gICAgICByZXR1cm4gdGhpcy5zY2hlbWFQcm9taXNlO1xuICAgIH1cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBTY2hlbWFDb250cm9sbGVyLmxvYWQodGhpcy5hZGFwdGVyLCBvcHRpb25zKTtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UudGhlbihcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2UsXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgbG9hZFNjaGVtYUlmTmVlZGVkKFxuICAgIHNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyID8gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYUNvbnRyb2xsZXIpIDogdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSBjbGFzc25hbWUgdGhhdCBpcyByZWxhdGVkIHRvIHRoZSBnaXZlblxuICAvLyBjbGFzc25hbWUgdGhyb3VnaCB0aGUga2V5LlxuICAvLyBUT0RPOiBtYWtlIHRoaXMgbm90IGluIHRoZSBEYXRhYmFzZUNvbnRyb2xsZXIgaW50ZXJmYWNlXG4gIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZyk6IFByb21pc2U8P3N0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PiB7XG4gICAgICB2YXIgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKHQgIT0gbnVsbCAmJiB0eXBlb2YgdCAhPT0gJ3N0cmluZycgJiYgdC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiB0LnRhcmdldENsYXNzO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGNsYXNzTmFtZTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFVzZXMgdGhlIHNjaGVtYSB0byB2YWxpZGF0ZSB0aGUgb2JqZWN0IChSRVNUIEFQSSBmb3JtYXQpLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hLlxuICAvLyBUaGlzIGRvZXMgbm90IHVwZGF0ZSB0aGlzLnNjaGVtYSwgYmVjYXVzZSBpbiBhIHNpdHVhdGlvbiBsaWtlIGFcbiAgLy8gYmF0Y2ggcmVxdWVzdCwgdGhhdCBjb3VsZCBjb25mdXNlIG90aGVyIHVzZXJzIG9mIHRoZSBzY2hlbWEuXG4gIHZhbGlkYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zLFxuICAgIG1haW50ZW5hbmNlOiBib29sZWFuXG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGxldCBzY2hlbWE7XG4gICAgY29uc3QgYWNsID0gcnVuT3B0aW9ucy5hY2w7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXA6IHN0cmluZ1tdID0gYWNsIHx8IFtdO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4ocyA9PiB7XG4gICAgICAgIHNjaGVtYSA9IHM7XG4gICAgICAgIGlmIChpc01hc3Rlcikge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5jYW5BZGRGaWVsZChzY2hlbWEsIGNsYXNzTmFtZSwgb2JqZWN0LCBhY2xHcm91cCwgcnVuT3B0aW9ucyk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSwgbWFpbnRlbmFuY2UpO1xuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB7IGFjbCwgbWFueSwgdXBzZXJ0LCBhZGRzRmllbGQgfTogRnVsbFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHNraXBTYW5pdGl6YXRpb246IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIHRyeSB7XG4gICAgICBVdGlscy5jaGVja1Byb2hpYml0ZWRLZXl3b3Jkcyh0aGlzLm9wdGlvbnMsIHVwZGF0ZSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgZXJyb3IpKTtcbiAgICB9XG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IHF1ZXJ5O1xuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0gdXBkYXRlO1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICB1cGRhdGUgPSBkZWVwY29weSh1cGRhdGUpO1xuICAgIHZhciByZWxhdGlvblVwZGF0ZXMgPSBbXTtcbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ3VwZGF0ZScpXG4gICAgICApXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLCB1cGRhdGUpO1xuICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgJ3VwZGF0ZScsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKGFkZHNGaWVsZCkge1xuICAgICAgICAgICAgICBxdWVyeSA9IHtcbiAgICAgICAgICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICdhZGRGaWVsZCcsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBmYWxzZSwgdHJ1ZSk7XG4gICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICAhU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkgJiZcbiAgICAgICAgICAgICAgICAgICFpc1NwZWNpYWxVcGRhdGVLZXkocm9vdEZpZWxkTmFtZSlcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIGZvciAoY29uc3QgdXBkYXRlT3BlcmF0aW9uIGluIHVwZGF0ZSkge1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dICYmXG4gICAgICAgICAgICAgICAgICB0eXBlb2YgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSkuc29tZShcbiAgICAgICAgICAgICAgICAgICAgaW5uZXJLZXkgPT4gaW5uZXJLZXkuaW5jbHVkZXMoJyQnKSB8fCBpbm5lcktleS5pbmNsdWRlcygnLicpXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICAgICAgICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB1cGRhdGUgPSB0cmFuc2Zvcm1PYmplY3RBQ0wodXBkYXRlKTtcbiAgICAgICAgICAgICAgbWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2UodXBkYXRlLCBjbGFzc05hbWUsIHRoaXMub3B0aW9ucyk7XG4gICAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwge30pLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0IHx8ICFyZXN1bHQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAobWFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cHNlcnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCxcbiAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmIChza2lwU2FuaXRpemF0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsVXBkYXRlLCByZXN1bHQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvbGxlY3QgYWxsIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIGxpc3Qgb2YgYWxsIHJlbGF0aW9uIHVwZGF0ZXMgdG8gcGVyZm9ybVxuICAvLyBUaGlzIG11dGF0ZXMgdXBkYXRlLlxuICBjb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogP3N0cmluZywgdXBkYXRlOiBhbnkpIHtcbiAgICB2YXIgb3BzID0gW107XG4gICAgdmFyIGRlbGV0ZU1lID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG5cbiAgICB2YXIgcHJvY2VzcyA9IChvcCwga2V5KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdCYXRjaCcpIHtcbiAgICAgICAgZm9yICh2YXIgeCBvZiBvcC5vcHMpIHtcbiAgICAgICAgICBwcm9jZXNzKHgsIGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gdXBkYXRlKSB7XG4gICAgICBwcm9jZXNzKHVwZGF0ZVtrZXldLCBrZXkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBkZWxldGVNZSkge1xuICAgICAgZGVsZXRlIHVwZGF0ZVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gb3BzO1xuICB9XG5cbiAgLy8gUHJvY2Vzc2VzIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbCB1cGRhdGVzIGhhdmUgYmVlbiBwZXJmb3JtZWRcbiAgaGFuZGxlUmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogc3RyaW5nLCB1cGRhdGU6IGFueSwgb3BzOiBhbnkpIHtcbiAgICB2YXIgcGVuZGluZyA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuICAgIG9wcy5mb3JFYWNoKCh7IGtleSwgb3AgfSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5hZGRSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaCh0aGlzLnJlbW92ZVJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwZW5kaW5nKTtcbiAgfVxuXG4gIC8vIEFkZHMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBhZGQgd2FzIHN1Y2Nlc3NmdWwuXG4gIGFkZFJlbGF0aW9uKGtleTogc3RyaW5nLCBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsIGZyb21JZDogc3RyaW5nLCB0b0lkOiBzdHJpbmcpIHtcbiAgICBjb25zdCBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICBkb2MsXG4gICAgICBkb2MsXG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmVzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgcmVtb3ZlIHdhc1xuICAvLyBzdWNjZXNzZnVsLlxuICByZW1vdmVSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgdmFyIGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICBkb2MsXG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCBjYXJlIGlmIHRoZXkgdHJ5IHRvIGRlbGV0ZSBhIG5vbi1leGlzdGVudCByZWxhdGlvbi5cbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBvYmplY3RzIG1hdGNoZXMgdGhpcyBxdWVyeSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgd2FzXG4gIC8vIGRlbGV0ZWQuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuICAvLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4gIC8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG4gIGRlc3Ryb3koXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2RlbGV0ZScpXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAnZGVsZXRlJyxcbiAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZGVsZXRlIGJ5IHF1ZXJ5XG4gICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICB9XG4gICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBmYWxzZSwgZmFsc2UpO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHBhcnNlRm9ybWF0U2NoZW1hID0+XG4gICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gV2hlbiBkZWxldGluZyBzZXNzaW9ucyB3aGlsZSBjaGFuZ2luZyBwYXNzd29yZHMsIGRvbid0IHRocm93IGFuIGVycm9yIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbnkgc2Vzc2lvbnMuXG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gSW5zZXJ0cyBhbiBvYmplY3QgaW50byB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHNhdmVkLlxuICBjcmVhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0cnkge1xuICAgICAgVXRpbHMuY2hlY2tQcm9oaWJpdGVkS2V5d29yZHModGhpcy5vcHRpb25zLCBvYmplY3QpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGVycm9yKSk7XG4gICAgfVxuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICBjb25zdCBvcmlnaW5hbE9iamVjdCA9IG9iamVjdDtcbiAgICBvYmplY3QgPSB0cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcbiAgICBtYXliZVRyYW5zZm9ybVVzZXJuYW1lQW5kRW1haWxUb0xvd2VyQ2FzZShvYmplY3QsIGNsYXNzTmFtZSwgdGhpcy5vcHRpb25zKTtcbiAgICBvYmplY3QuY3JlYXRlZEF0ID0geyBpc286IG9iamVjdC5jcmVhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG4gICAgb2JqZWN0LnVwZGF0ZWRBdCA9IHsgaXNvOiBvYmplY3QudXBkYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuXG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIGNvbnN0IHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWUsIG51bGwsIG9iamVjdCk7XG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2NyZWF0ZScpXG4gICAgICAgIClcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSkpXG4gICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgICAgICAgICAgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZShvYmplY3QpO1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBTY2hlbWFDb250cm9sbGVyLmNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoc2NoZW1hKSxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbE9iamVjdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBvYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzXG4gICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdCwgcmVzdWx0Lm9wc1swXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY2FuQWRkRmllbGQoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjbGFzc1NjaGVtYSA9IHNjaGVtYS5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgaWYgKCFjbGFzc1NjaGVtYSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xuICAgIGNvbnN0IHNjaGVtYUZpZWxkcyA9IE9iamVjdC5rZXlzKGNsYXNzU2NoZW1hLmZpZWxkcyk7XG4gICAgY29uc3QgbmV3S2V5cyA9IGZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgdW5zZXRcbiAgICAgIGlmIChvYmplY3RbZmllbGRdICYmIG9iamVjdFtmaWVsZF0uX19vcCAmJiBvYmplY3RbZmllbGRdLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzY2hlbWFGaWVsZHMuaW5kZXhPZihnZXRSb290RmllbGROYW1lKGZpZWxkKSkgPCAwO1xuICAgIH0pO1xuICAgIGlmIChuZXdLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIGFkZHMgYSBtYXJrZXIgdGhhdCBuZXcgZmllbGQgaXMgYmVpbmcgYWRkaW5nIGR1cmluZyB1cGRhdGVcbiAgICAgIHJ1bk9wdGlvbnMuYWRkc0ZpZWxkID0gdHJ1ZTtcblxuICAgICAgY29uc3QgYWN0aW9uID0gcnVuT3B0aW9ucy5hY3Rpb247XG4gICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnYWRkRmllbGQnLCBhY3Rpb24pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXb24ndCBkZWxldGUgY29sbGVjdGlvbnMgaW4gdGhlIHN5c3RlbSBuYW1lc3BhY2VcbiAgLyoqXG4gICAqIERlbGV0ZSBhbGwgY2xhc3NlcyBhbmQgY2xlYXJzIHRoZSBzY2hlbWEgY2FjaGVcbiAgICpcbiAgICogQHBhcmFtIHtib29sZWFufSBmYXN0IHNldCB0byB0cnVlIGlmIGl0J3Mgb2sgdG8ganVzdCBkZWxldGUgcm93cyBhbmQgbm90IGluZGV4ZXNcbiAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59IHdoZW4gdGhlIGRlbGV0aW9ucyBjb21wbGV0ZXNcbiAgICovXG4gIGRlbGV0ZUV2ZXJ5dGhpbmcoZmFzdDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVBbGxDbGFzc2VzKGZhc3QpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiByZWxhdGVkIGlkcyBnaXZlbiBhbiBvd25pbmcgaWQuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICByZWxhdGVkSWRzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nLFxuICAgIG93bmluZ0lkOiBzdHJpbmcsXG4gICAgcXVlcnlPcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxBcnJheTxzdHJpbmc+PiB7XG4gICAgY29uc3QgeyBza2lwLCBsaW1pdCwgc29ydCB9ID0gcXVlcnlPcHRpb25zO1xuICAgIGNvbnN0IGZpbmRPcHRpb25zID0ge307XG4gICAgaWYgKHNvcnQgJiYgc29ydC5jcmVhdGVkQXQgJiYgdGhpcy5hZGFwdGVyLmNhblNvcnRPbkpvaW5UYWJsZXMpIHtcbiAgICAgIGZpbmRPcHRpb25zLnNvcnQgPSB7IF9pZDogc29ydC5jcmVhdGVkQXQgfTtcbiAgICAgIGZpbmRPcHRpb25zLmxpbWl0ID0gbGltaXQ7XG4gICAgICBmaW5kT3B0aW9ucy5za2lwID0gc2tpcDtcbiAgICAgIHF1ZXJ5T3B0aW9ucy5za2lwID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksIHJlbGF0aW9uU2NoZW1hLCB7IG93bmluZ0lkIH0sIGZpbmRPcHRpb25zKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LnJlbGF0ZWRJZCkpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiBvd25pbmcgaWRzIGdpdmVuIHNvbWUgcmVsYXRlZCBpZHMuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICBvd25pbmdJZHMoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nLCByZWxhdGVkSWRzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChcbiAgICAgICAgam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICB7IHJlbGF0ZWRJZDogeyAkaW46IHJlbGF0ZWRJZHMgfSB9LFxuICAgICAgICB7IGtleXM6IFsnb3duaW5nSWQnXSB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQub3duaW5nSWQpKTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkaW4gb24gcmVsYXRpb24gZmllbGRzLCBvclxuICAvLyBlcXVhbC10by1wb2ludGVyIGNvbnN0cmFpbnRzIG9uIHJlbGF0aW9uIGZpZWxkcy5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IGFueSwgc2NoZW1hOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIFNlYXJjaCBmb3IgYW4gaW4tcmVsYXRpb24gb3IgZXF1YWwtdG8tcmVsYXRpb25cbiAgICAvLyBNYWtlIGl0IHNlcXVlbnRpYWwgZm9yIG5vdywgbm90IHN1cmUgb2YgcGFyYWxsZWl6YXRpb24gc2lkZSBlZmZlY3RzXG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICBjb25zdCBvcnMgPSBxdWVyeVsnJG9yJ107XG4gICAgICBwcm9taXNlcy5wdXNoKFxuICAgICAgICAuLi5vcnMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJG9yJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5WyckYW5kJ10pIHtcbiAgICAgIGNvbnN0IGFuZHMgPSBxdWVyeVsnJGFuZCddO1xuICAgICAgcHJvbWlzZXMucHVzaChcbiAgICAgICAgLi4uYW5kcy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHF1ZXJ5WyckYW5kJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBvdGhlcktleXMgPSBPYmplY3Qua2V5cyhxdWVyeSkubWFwKGtleSA9PiB7XG4gICAgICBpZiAoa2V5ID09PSAnJGFuZCcgfHwga2V5ID09PSAnJG9yJykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAoIXQgfHwgdC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfVxuICAgICAgbGV0IHF1ZXJpZXM6ID8oYW55W10pID0gbnVsbDtcbiAgICAgIGlmIChcbiAgICAgICAgcXVlcnlba2V5XSAmJlxuICAgICAgICAocXVlcnlba2V5XVsnJGluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmUnXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV0uX190eXBlID09ICdQb2ludGVyJylcbiAgICAgICkge1xuICAgICAgICAvLyBCdWlsZCB0aGUgbGlzdCBvZiBxdWVyaWVzXG4gICAgICAgIHF1ZXJpZXMgPSBPYmplY3Qua2V5cyhxdWVyeVtrZXldKS5tYXAoY29uc3RyYWludEtleSA9PiB7XG4gICAgICAgICAgbGV0IHJlbGF0ZWRJZHM7XG4gICAgICAgICAgbGV0IGlzTmVnYXRpb24gPSBmYWxzZTtcbiAgICAgICAgICBpZiAoY29uc3RyYWludEtleSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRpbicpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuaW4nKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckbmluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmUnKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XVsnJG5lJ10ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uLFxuICAgICAgICAgICAgcmVsYXRlZElkcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJpZXMgPSBbeyBpc05lZ2F0aW9uOiBmYWxzZSwgcmVsYXRlZElkczogW10gfV07XG4gICAgICB9XG5cbiAgICAgIC8vIHJlbW92ZSB0aGUgY3VycmVudCBxdWVyeUtleSBhcyB3ZSBkb24sdCBuZWVkIGl0IGFueW1vcmVcbiAgICAgIGRlbGV0ZSBxdWVyeVtrZXldO1xuICAgICAgLy8gZXhlY3V0ZSBlYWNoIHF1ZXJ5IGluZGVwZW5kZW50bHkgdG8gYnVpbGQgdGhlIGxpc3Qgb2ZcbiAgICAgIC8vICRpbiAvICRuaW5cbiAgICAgIGNvbnN0IHByb21pc2VzID0gcXVlcmllcy5tYXAocSA9PiB7XG4gICAgICAgIGlmICghcSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5vd25pbmdJZHMoY2xhc3NOYW1lLCBrZXksIHEucmVsYXRlZElkcykudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGlmIChxLmlzTmVnYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoWy4uLnByb21pc2VzLCAuLi5vdGhlcktleXNdKS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRyZWxhdGVkVG9cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBxdWVyeU9wdGlvbnM6IGFueSk6ID9Qcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5Wyckb3InXS5tYXAoYVF1ZXJ5ID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBhUXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJGFuZCddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIHZhciByZWxhdGVkVG8gPSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgIGlmIChyZWxhdGVkVG8pIHtcbiAgICAgIHJldHVybiB0aGlzLnJlbGF0ZWRJZHMoXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICByZWxhdGVkVG8ua2V5LFxuICAgICAgICByZWxhdGVkVG8ub2JqZWN0Lm9iamVjdElkLFxuICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgIClcbiAgICAgICAgLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBkZWxldGUgcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7fSk7XG4gICAgfVxuICB9XG5cbiAgYWRkSW5PYmplY3RJZHNJZHMoaWRzOiA/QXJyYXk8c3RyaW5nPiA9IG51bGwsIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tU3RyaW5nOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnID8gW3F1ZXJ5Lm9iamVjdElkXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUVxOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGVxJ10gPyBbcXVlcnkub2JqZWN0SWRbJyRlcSddXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUluOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGluJ10gPyBxdWVyeS5vYmplY3RJZFsnJGluJ10gOiBudWxsO1xuXG4gICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgY29uc3QgYWxsSWRzOiBBcnJheTxBcnJheTxzdHJpbmc+PiA9IFtpZHNGcm9tU3RyaW5nLCBpZHNGcm9tRXEsIGlkc0Zyb21JbiwgaWRzXS5maWx0ZXIoXG4gICAgICBsaXN0ID0+IGxpc3QgIT09IG51bGxcbiAgICApO1xuICAgIGNvbnN0IHRvdGFsTGVuZ3RoID0gYWxsSWRzLnJlZHVjZSgobWVtbywgbGlzdCkgPT4gbWVtbyArIGxpc3QubGVuZ3RoLCAwKTtcblxuICAgIGxldCBpZHNJbnRlcnNlY3Rpb24gPSBbXTtcbiAgICBpZiAodG90YWxMZW5ndGggPiAxMjUpIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdC5iaWcoYWxsSWRzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0KGFsbElkcyk7XG4gICAgfVxuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG4gICAgcXVlcnkub2JqZWN0SWRbJyRpbiddID0gaWRzSW50ZXJzZWN0aW9uO1xuXG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzOiBzdHJpbmdbXSA9IFtdLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbU5pbiA9IHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPyBxdWVyeS5vYmplY3RJZFsnJG5pbiddIDogW107XG4gICAgbGV0IGFsbElkcyA9IFsuLi5pZHNGcm9tTmluLCAuLi5pZHNdLmZpbHRlcihsaXN0ID0+IGxpc3QgIT09IG51bGwpO1xuXG4gICAgLy8gbWFrZSBhIHNldCBhbmQgc3ByZWFkIHRvIHJlbW92ZSBkdXBsaWNhdGVzXG4gICAgYWxsSWRzID0gWy4uLm5ldyBTZXQoYWxsSWRzKV07XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA9IGFsbElkcztcbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBSdW5zIGEgcXVlcnkgb24gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGEgbGlzdCBvZiBpdGVtcy5cbiAgLy8gT3B0aW9uczpcbiAgLy8gICBza2lwICAgIG51bWJlciBvZiByZXN1bHRzIHRvIHNraXAuXG4gIC8vICAgbGltaXQgICBsaW1pdCB0byB0aGlzIG51bWJlciBvZiByZXN1bHRzLlxuICAvLyAgIHNvcnQgICAgYW4gb2JqZWN0IHdoZXJlIGtleXMgYXJlIHRoZSBmaWVsZHMgdG8gc29ydCBieS5cbiAgLy8gICAgICAgICAgIHRoZSB2YWx1ZSBpcyArMSBmb3IgYXNjZW5kaW5nLCAtMSBmb3IgZGVzY2VuZGluZy5cbiAgLy8gICBjb3VudCAgIHJ1biBhIGNvdW50IGluc3RlYWQgb2YgcmV0dXJuaW5nIHJlc3VsdHMuXG4gIC8vICAgYWNsICAgICByZXN0cmljdCB0aGlzIG9wZXJhdGlvbiB3aXRoIGFuIEFDTCBmb3IgdGhlIHByb3ZpZGVkIGFycmF5XG4gIC8vICAgICAgICAgICBvZiB1c2VyIG9iamVjdElkcyBhbmQgcm9sZXMuIGFjbDogbnVsbCBtZWFucyBubyB1c2VyLlxuICAvLyAgICAgICAgICAgd2hlbiB0aGlzIGZpZWxkIGlzIG5vdCBwcmVzZW50LCBkb24ndCBkbyBhbnl0aGluZyByZWdhcmRpbmcgQUNMcy5cbiAgLy8gIGNhc2VJbnNlbnNpdGl2ZSBtYWtlIHN0cmluZyBjb21wYXJpc29ucyBjYXNlIGluc2Vuc2l0aXZlXG4gIC8vIFRPRE86IG1ha2UgdXNlcklkcyBub3QgbmVlZGVkIGhlcmUuIFRoZSBkYiBhZGFwdGVyIHNob3VsZG4ndCBrbm93XG4gIC8vIGFueXRoaW5nIGFib3V0IHVzZXJzLCBpZGVhbGx5LiBUaGVuLCBpbXByb3ZlIHRoZSBmb3JtYXQgb2YgdGhlIEFDTFxuICAvLyBhcmcgdG8gd29yayBsaWtlIHRoZSBvdGhlcnMuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBhY2wsXG4gICAgICBzb3J0ID0ge30sXG4gICAgICBjb3VudCxcbiAgICAgIGtleXMsXG4gICAgICBvcCxcbiAgICAgIGRpc3RpbmN0LFxuICAgICAgcGlwZWxpbmUsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgIGhpbnQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUgPSBmYWxzZSxcbiAgICAgIGV4cGxhaW4sXG4gICAgfTogYW55ID0ge30sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01haW50ZW5hbmNlID0gYXV0aC5pc01haW50ZW5hbmNlO1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQgfHwgaXNNYWludGVuYW5jZTtcbiAgICBjb25zdCBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBvcCA9XG4gICAgICBvcCB8fCAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09ICdzdHJpbmcnICYmIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT09IDEgPyAnZ2V0JyA6ICdmaW5kJyk7XG4gICAgLy8gQ291bnQgb3BlcmF0aW9uIGlmIGNvdW50aW5nXG4gICAgb3AgPSBjb3VudCA9PT0gdHJ1ZSA/ICdjb3VudCcgOiBvcDtcblxuICAgIGxldCBjbGFzc0V4aXN0cyA9IHRydWU7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIC8vQWxsb3cgdm9sYXRpbGUgY2xhc3NlcyBpZiBxdWVyeWluZyB3aXRoIE1hc3RlciAoZm9yIF9QdXNoU3RhdHVzKVxuICAgICAgLy9UT0RPOiBNb3ZlIHZvbGF0aWxlIGNsYXNzZXMgY29uY2VwdCBpbnRvIG1vbmdvIGFkYXB0ZXIsIHBvc3RncmVzIGFkYXB0ZXIgc2hvdWxkbid0IGNhcmVcbiAgICAgIC8vdGhhdCBhcGkucGFyc2UuY29tIGJyZWFrcyB3aGVuIF9QdXNoU3RhdHVzIGV4aXN0cyBpbiBtb25nby5cbiAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCBpc01hc3RlcilcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAvLyBCZWhhdmlvciBmb3Igbm9uLWV4aXN0ZW50IGNsYXNzZXMgaXMga2luZGEgd2VpcmQgb24gUGFyc2UuY29tLiBQcm9iYWJseSBkb2Vzbid0IG1hdHRlciB0b28gbXVjaC5cbiAgICAgICAgICAvLyBGb3Igbm93LCBwcmV0ZW5kIHRoZSBjbGFzcyBleGlzdHMgYnV0IGhhcyBubyBvYmplY3RzLFxuICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjbGFzc0V4aXN0cyA9IGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAvLyBQYXJzZS5jb20gdHJlYXRzIHF1ZXJpZXMgb24gX2NyZWF0ZWRfYXQgYW5kIF91cGRhdGVkX2F0IGFzIGlmIHRoZXkgd2VyZSBxdWVyaWVzIG9uIGNyZWF0ZWRBdCBhbmQgdXBkYXRlZEF0LFxuICAgICAgICAgIC8vIHNvIGR1cGxpY2F0ZSB0aGF0IGJlaGF2aW9yIGhlcmUuIElmIGJvdGggYXJlIHNwZWNpZmllZCwgdGhlIGNvcnJlY3QgYmVoYXZpb3IgdG8gbWF0Y2ggUGFyc2UuY29tIGlzIHRvXG4gICAgICAgICAgLy8gdXNlIHRoZSBvbmUgdGhhdCBhcHBlYXJzIGZpcnN0IGluIHRoZSBzb3J0IGxpc3QuXG4gICAgICAgICAgaWYgKHNvcnQuX2NyZWF0ZWRfYXQpIHtcbiAgICAgICAgICAgIHNvcnQuY3JlYXRlZEF0ID0gc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc29ydC5fdXBkYXRlZF9hdCkge1xuICAgICAgICAgICAgc29ydC51cGRhdGVkQXQgPSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgICAgZGVsZXRlIHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHF1ZXJ5T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICBsaW1pdCxcbiAgICAgICAgICAgIHNvcnQsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgY2FzZUluc2Vuc2l0aXZlOiB0aGlzLm9wdGlvbnMuZGlzYWJsZUNhc2VJbnNlbnNpdGl2aXR5ID8gZmFsc2UgOiBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgICAgICBleHBsYWluLFxuICAgICAgICAgIH07XG4gICAgICAgICAgT2JqZWN0LmtleXMoc29ydCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBDYW5ub3Qgc29ydCBieSAke2ZpZWxkTmFtZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfS5gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lLnNwbGl0KCcuJylbMF1dICYmIGZpZWxkTmFtZSAhPT0gJ3Njb3JlJykge1xuICAgICAgICAgICAgICBkZWxldGUgc29ydFtmaWVsZE5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgb3ApXG4gICAgICAgICAgKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWFDb250cm9sbGVyKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHByb3RlY3RlZEZpZWxkcztcbiAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvKiBEb24ndCB1c2UgcHJvamVjdGlvbnMgdG8gb3B0aW1pemUgdGhlIHByb3RlY3RlZEZpZWxkcyBzaW5jZSB0aGUgcHJvdGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICBiYXNlZCBvbiBwb2ludGVyLXBlcm1pc3Npb25zIGFyZSBkZXRlcm1pbmVkIGFmdGVyIHF1ZXJ5aW5nLiBUaGUgZmlsdGVyaW5nIGNhblxuICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlIHRoZSBwcm90ZWN0ZWQgZmllbGRzLiAqL1xuICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHRoaXMuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAnZ2V0Jykge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBpZiAob3AgPT09ICd1cGRhdGUnIHx8IG9wID09PSAnZGVsZXRlJykge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFJlYWRBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgaXNNYXN0ZXIsIGlzTWFpbnRlbmFuY2UsIGZhbHNlKTtcbiAgICAgICAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY291bnQoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgaGludFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZGlzdGluY3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGlzdGluY3QoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBkaXN0aW5jdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBpcGVsaW5lKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFnZ3JlZ2F0ZShcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHBpcGVsaW5lLFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgICAgICAgZXhwbGFpblxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXhwbGFpbikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgICAgICAgICAgICAgLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpXG4gICAgICAgICAgICAgICAgICAudGhlbihvYmplY3RzID0+XG4gICAgICAgICAgICAgICAgICAgIG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0ID0gdW50cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYWludGVuYW5jZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZGVsZXRlU2NoZW1hKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWFDb250cm9sbGVyID0gcztcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5hZGFwdGVyLmNvdW50KGNsYXNzTmFtZSwgeyBmaWVsZHM6IHt9IH0sIG51bGwsICcnLCBmYWxzZSkpXG4gICAgICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICAgICAgaWYgKGNvdW50ID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgMjU1LFxuICAgICAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gaXMgbm90IGVtcHR5LCBjb250YWlucyAke2NvdW50fSBvYmplY3RzLCBjYW5ub3QgZHJvcCBzY2hlbWEuYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhjbGFzc05hbWUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4od2FzUGFyc2VDb2xsZWN0aW9uID0+IHtcbiAgICAgICAgICAgIGlmICh3YXNQYXJzZUNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICAgICAgICAgIGZpZWxkTmFtZSA9PiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLm1hcChuYW1lID0+XG4gICAgICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3Moam9pblRhYmxlTmFtZShjbGFzc05hbWUsIG5hbWUpKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBTY2hlbWFDYWNoZS5kZWwoY2xhc3NOYW1lKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlci5yZWxvYWREYXRhKCk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBUaGlzIGhlbHBzIHRvIGNyZWF0ZSBpbnRlcm1lZGlhdGUgb2JqZWN0cyBmb3Igc2ltcGxlciBjb21wYXJpc29uIG9mXG4gIC8vIGtleSB2YWx1ZSBwYWlycyB1c2VkIGluIHF1ZXJ5IG9iamVjdHMuIEVhY2gga2V5IHZhbHVlIHBhaXIgd2lsbCByZXByZXNlbnRlZFxuICAvLyBpbiBhIHNpbWlsYXIgd2F5IHRvIGpzb25cbiAgb2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxdWVyeTogYW55KTogQXJyYXk8c3RyaW5nPiB7XG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHF1ZXJ5KS5tYXAoYSA9PiBhLm1hcChzID0+IEpTT04uc3RyaW5naWZ5KHMpKS5qb2luKCc6JykpO1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgT1Igb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZU9yT3BlcmF0aW9uKHF1ZXJ5OiB7ICRvcjogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRvcikge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJG9yLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgbG9uZ2VyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJG9yLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kb3IubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRvclswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRvcjtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgQU5EIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VBbmRPcGVyYXRpb24ocXVlcnk6IHsgJGFuZDogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRhbmQpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRhbmQubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBzaG9ydGVyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJGFuZC5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kYW5kLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kYW5kWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJGFuZDtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gQ29uc3RyYWludHMgcXVlcnkgdXNpbmcgQ0xQJ3MgcG9pbnRlciBwZXJtaXNzaW9ucyAoUFApIGlmIGFueS5cbiAgLy8gMS4gRXRyYWN0IHRoZSB1c2VyIGlkIGZyb20gY2FsbGVyJ3MgQUNMZ3JvdXA7XG4gIC8vIDIuIEV4Y3RyYWN0IGEgbGlzdCBvZiBmaWVsZCBuYW1lcyB0aGF0IGFyZSBQUCBmb3IgdGFyZ2V0IGNvbGxlY3Rpb24gYW5kIG9wZXJhdGlvbjtcbiAgLy8gMy4gQ29uc3RyYWludCB0aGUgb3JpZ2luYWwgcXVlcnkgc28gdGhhdCBlYWNoIFBQIGZpZWxkIG11c3RcbiAgLy8gcG9pbnQgdG8gY2FsbGVyJ3MgaWQgKG9yIGNvbnRhaW4gaXQgaW4gY2FzZSBvZiBQUCBmaWVsZCBiZWluZyBhbiBhcnJheSlcbiAgYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW11cbiAgKTogYW55IHtcbiAgICAvLyBDaGVjayBpZiBjbGFzcyBoYXMgcHVibGljIHBlcm1pc3Npb24gZm9yIG9wZXJhdGlvblxuICAgIC8vIElmIHRoZSBCYXNlQ0xQIHBhc3MsIGxldCBnbyB0aHJvdWdoXG4gICAgaWYgKHNjaGVtYS50ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcblxuICAgIGNvbnN0IHVzZXJBQ0wgPSBhY2xHcm91cC5maWx0ZXIoYWNsID0+IHtcbiAgICAgIHJldHVybiBhY2wuaW5kZXhPZigncm9sZTonKSAhPSAwICYmIGFjbCAhPSAnKic7XG4gICAgfSk7XG5cbiAgICBjb25zdCBncm91cEtleSA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICBjb25zdCBwZXJtRmllbGRzID0gW107XG5cbiAgICBpZiAocGVybXNbb3BlcmF0aW9uXSAmJiBwZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpIHtcbiAgICAgIHBlcm1GaWVsZHMucHVzaCguLi5wZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpO1xuICAgIH1cblxuICAgIGlmIChwZXJtc1tncm91cEtleV0pIHtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICAgIGlmICghcGVybUZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwZXJtRmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICBpZiAocGVybUZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgICAvLyBObyB1c2VyIHNldCByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAvLyBJZiB0aGUgbGVuZ3RoIGlzID4gMSwgdGhhdCBtZWFucyB3ZSBkaWRuJ3QgZGUtZHVwZSB1c2VycyBjb3JyZWN0bHlcbiAgICAgIGlmICh1c2VyQUNMLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXJJZCA9IHVzZXJBQ0xbMF07XG4gICAgICBjb25zdCB1c2VyUG9pbnRlciA9IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHF1ZXJpZXMgPSBwZXJtRmllbGRzLm1hcChrZXkgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZERlc2NyaXB0b3IgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgICAgY29uc3QgZmllbGRUeXBlID1cbiAgICAgICAgICBmaWVsZERlc2NyaXB0b3IgJiZcbiAgICAgICAgICB0eXBlb2YgZmllbGREZXNjcmlwdG9yID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZERlc2NyaXB0b3IsICd0eXBlJylcbiAgICAgICAgICAgID8gZmllbGREZXNjcmlwdG9yLnR5cGVcbiAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBsZXQgcXVlcnlDbGF1c2U7XG5cbiAgICAgICAgaWYgKGZpZWxkVHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3Igc2luZ2xlIHBvaW50ZXIgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3IgdXNlcnMtYXJyYXkgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHsgJGFsbDogW3VzZXJQb2ludGVyXSB9IH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnT2JqZWN0Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIG9iamVjdCBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogdXNlclBvaW50ZXIgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUaGlzIG1lYW5zIHRoYXQgdGhlcmUgaXMgYSBDTFAgZmllbGQgb2YgYW4gdW5leHBlY3RlZCB0eXBlLiBUaGlzIGNvbmRpdGlvbiBzaG91bGQgbm90IGhhcHBlbiwgd2hpY2ggaXNcbiAgICAgICAgICAvLyB3aHkgaXMgYmVpbmcgdHJlYXRlZCBhcyBhbiBlcnJvci5cbiAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgIGBBbiB1bmV4cGVjdGVkIGNvbmRpdGlvbiBvY2N1cnJlZCB3aGVuIHJlc29sdmluZyBwb2ludGVyIHBlcm1pc3Npb25zOiAke2NsYXNzTmFtZX0gJHtrZXl9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgY29uc3RyYWludCBvbiB0aGUga2V5LCB1c2UgdGhlICRhbmRcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChxdWVyeSwga2V5KSkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUFuZE9wZXJhdGlvbih7ICRhbmQ6IFtxdWVyeUNsYXVzZSwgcXVlcnldIH0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGFkZCB0aGUgY29uc3RhaW50XG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgcXVlcnlDbGF1c2UpO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBxdWVyaWVzLmxlbmd0aCA9PT0gMSA/IHF1ZXJpZXNbMF0gOiB0aGlzLnJlZHVjZU9yT3BlcmF0aW9uKHsgJG9yOiBxdWVyaWVzIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICB9XG5cbiAgYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyIHwgYW55LFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnkgPSB7fSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICBxdWVyeU9wdGlvbnM6IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fVxuICApOiBudWxsIHwgc3RyaW5nW10ge1xuICAgIGNvbnN0IHBlcm1zID1cbiAgICAgIHNjaGVtYSAmJiBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zXG4gICAgICAgID8gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpXG4gICAgICAgIDogc2NoZW1hO1xuICAgIGlmICghcGVybXMpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gcGVybXMucHJvdGVjdGVkRmllbGRzO1xuICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSByZXR1cm4gbnVsbDtcblxuICAgIGlmIChhY2xHcm91cC5pbmRleE9mKHF1ZXJ5Lm9iamVjdElkKSA+IC0xKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIGZvciBxdWVyaWVzIHdoZXJlIFwia2V5c1wiIGFyZSBzZXQgYW5kIGRvIG5vdCBpbmNsdWRlIGFsbCAndXNlckZpZWxkJzp7ZmllbGR9LFxuICAgIC8vIHdlIGhhdmUgdG8gdHJhbnNwYXJlbnRseSBpbmNsdWRlIGl0LCBhbmQgdGhlbiByZW1vdmUgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnRcbiAgICAvLyBCZWNhdXNlIGlmIHN1Y2gga2V5IG5vdCBwcm9qZWN0ZWQgdGhlIHBlcm1pc3Npb24gd29uJ3QgYmUgZW5mb3JjZWQgcHJvcGVybHlcbiAgICAvLyBQUyB0aGlzIGlzIGNhbGxlZCB3aGVuICdleGNsdWRlS2V5cycgYWxyZWFkeSByZWR1Y2VkIHRvICdrZXlzJ1xuICAgIGNvbnN0IHByZXNlcnZlS2V5cyA9IHF1ZXJ5T3B0aW9ucy5rZXlzO1xuXG4gICAgLy8gdGhlc2UgYXJlIGtleXMgdGhhdCBuZWVkIHRvIGJlIGluY2x1ZGVkIG9ubHlcbiAgICAvLyB0byBiZSBhYmxlIHRvIGFwcGx5IHByb3RlY3RlZEZpZWxkcyBieSBwb2ludGVyXG4gICAgLy8gYW5kIHRoZW4gdW5zZXQgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnQgKGxhdGVyIGluICBmaWx0ZXJTZW5zaXRpdmVGaWVsZHMpXG4gICAgY29uc3Qgc2VydmVyT25seUtleXMgPSBbXTtcblxuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWQgPSBhdXRoLnVzZXI7XG5cbiAgICAvLyBtYXAgdG8gYWxsb3cgY2hlY2sgd2l0aG91dCBhcnJheSBzZWFyY2hcbiAgICBjb25zdCByb2xlcyA9IChhdXRoLnVzZXJSb2xlcyB8fCBbXSkucmVkdWNlKChhY2MsIHIpID0+IHtcbiAgICAgIGFjY1tyXSA9IHByb3RlY3RlZEZpZWxkc1tyXTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuXG4gICAgLy8gYXJyYXkgb2Ygc2V0cyBvZiBwcm90ZWN0ZWQgZmllbGRzLiBzZXBhcmF0ZSBpdGVtIGZvciBlYWNoIGFwcGxpY2FibGUgY3JpdGVyaWFcbiAgICBjb25zdCBwcm90ZWN0ZWRLZXlzU2V0cyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBza2lwIHVzZXJGaWVsZHNcbiAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKSB7XG4gICAgICAgIGlmIChwcmVzZXJ2ZUtleXMpIHtcbiAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBrZXkuc3Vic3RyaW5nKDEwKTtcbiAgICAgICAgICBpZiAoIXByZXNlcnZlS2V5cy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICAgICAgICAvLyAxLiBwdXQgaXQgdGhlcmUgdGVtcG9yYXJpbHlcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucy5rZXlzICYmIHF1ZXJ5T3B0aW9ucy5rZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIC8vIDIuIHByZXNlcnZlIGl0IGRlbGV0ZSBsYXRlclxuICAgICAgICAgICAgc2VydmVyT25seUtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gYWRkIHB1YmxpYyB0aWVyXG4gICAgICBpZiAoa2V5ID09PSAnKicpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgICBpZiAoa2V5ID09PSAnYXV0aGVudGljYXRlZCcpIHtcbiAgICAgICAgICAvLyBmb3IgbG9nZ2VkIGluIHVzZXJzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocm9sZXNba2V5XSAmJiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSkge1xuICAgICAgICAgIC8vIGFkZCBhcHBsaWNhYmxlIHJvbGVzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChyb2xlc1trZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGNoZWNrIGlmIHRoZXJlJ3MgYSBydWxlIGZvciBjdXJyZW50IHVzZXIncyBpZFxuICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICBjb25zdCB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG4gICAgICBpZiAocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gcHJlc2VydmUgZmllbGRzIHRvIGJlIHJlbW92ZWQgYmVmb3JlIHNlbmRpbmcgcmVzcG9uc2UgdG8gY2xpZW50XG4gICAgaWYgKHNlcnZlck9ubHlLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzID0gc2VydmVyT25seUtleXM7XG4gICAgfVxuXG4gICAgbGV0IHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzU2V0cy5yZWR1Y2UoKGFjYywgbmV4dCkgPT4ge1xuICAgICAgaWYgKG5leHQpIHtcbiAgICAgICAgYWNjLnB1c2goLi4ubmV4dCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIFtdKTtcblxuICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICBwcm90ZWN0ZWRLZXlzU2V0cy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvdGVjdGVkS2V5cztcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKS50aGVuKHRyYW5zYWN0aW9uYWxTZXNzaW9uID0+IHtcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gdHJhbnNhY3Rpb25hbFNlc3Npb247XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBjb21taXQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGFib3J0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICAvLyBUT0RPOiBjcmVhdGUgaW5kZXhlcyBvbiBmaXJzdCBjcmVhdGlvbiBvZiBhIF9Vc2VyIG9iamVjdC4gT3RoZXJ3aXNlIGl0J3MgaW1wb3NzaWJsZSB0b1xuICAvLyBoYXZlIGEgUGFyc2UgYXBwIHdpdGhvdXQgaXQgaGF2aW5nIGEgX1VzZXIgY29sbGVjdGlvbi5cbiAgYXN5bmMgcGVyZm9ybUluaXRpYWxpemF0aW9uKCkge1xuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIGNvbnN0IHJlcXVpcmVkVXNlckZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Vc2VyLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkUm9sZUZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Sb2xlLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgICB9LFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1VzZXInKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX0lkZW1wb3RlbmN5JykpO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXJuYW1lczogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBpZiAoIXRoaXMub3B0aW9ucy5kaXNhYmxlQ2FzZUluc2Vuc2l0aXZpdHkpIHtcbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10sICdjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lJywgdHJ1ZSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIHVzZXJuYW1lIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuXG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddLCAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsIHRydWUpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSBlbWFpbCBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlciBlbWFpbCBhZGRyZXNzZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Sb2xlJywgcmVxdWlyZWRSb2xlRmllbGRzLCBbJ25hbWUnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3Igcm9sZSBuYW1lOiAnLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgLmVuc3VyZVVuaXF1ZW5lc3MoJ19JZGVtcG90ZW5jeScsIHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMsIFsncmVxSWQnXSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIGlkZW1wb3RlbmN5IHJlcXVlc3QgSUQ6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcblxuICAgIGNvbnN0IGlzTW9uZ29BZGFwdGVyID0gdGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgTW9uZ29TdG9yYWdlQWRhcHRlcjtcbiAgICBjb25zdCBpc1Bvc3RncmVzQWRhcHRlciA9IHRoaXMuYWRhcHRlciBpbnN0YW5jZW9mIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXI7XG4gICAgaWYgKGlzTW9uZ29BZGFwdGVyIHx8IGlzUG9zdGdyZXNBZGFwdGVyKSB7XG4gICAgICBsZXQgb3B0aW9ucyA9IHt9O1xuICAgICAgaWYgKGlzTW9uZ29BZGFwdGVyKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgICAgdHRsOiAwLFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChpc1Bvc3RncmVzQWRhcHRlcikge1xuICAgICAgICBvcHRpb25zID0gdGhpcy5pZGVtcG90ZW5jeU9wdGlvbnM7XG4gICAgICAgIG9wdGlvbnMuc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA9IHRydWU7XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgLmVuc3VyZUluZGV4KCdfSWRlbXBvdGVuY3knLCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzLCBbJ2V4cGlyZSddLCAndHRsJywgZmFsc2UsIG9wdGlvbnMpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgVFRMIGluZGV4IGZvciBpZGVtcG90ZW5jeSBleHBpcmUgZGF0ZTogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLnVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk7XG4gIH1cblxuICBfZXhwYW5kUmVzdWx0T25LZXlQYXRoKG9iamVjdDogYW55LCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IGFueSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPCAwKSB7XG4gICAgICBvYmplY3Rba2V5XSA9IHZhbHVlW2tleV07XG4gICAgICByZXR1cm4gb2JqZWN0O1xuICAgIH1cbiAgICBjb25zdCBwYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgY29uc3QgZmlyc3RLZXkgPSBwYXRoWzBdO1xuICAgIGNvbnN0IG5leHRQYXRoID0gcGF0aC5zbGljZSgxKS5qb2luKCcuJyk7XG5cbiAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgaWYgKHRoaXMub3B0aW9ucyAmJiB0aGlzLm9wdGlvbnMucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgICAgZm9yIChjb25zdCBrZXl3b3JkIG9mIHRoaXMub3B0aW9ucy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICAgIGNvbnN0IG1hdGNoID0gVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZShcbiAgICAgICAgICB7IFtmaXJzdEtleV06IHRydWUsIFtuZXh0UGF0aF06IHRydWUgfSxcbiAgICAgICAgICBrZXl3b3JkLmtleSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICBgUHJvaGliaXRlZCBrZXl3b3JkIGluIHJlcXVlc3QgZGF0YTogJHtKU09OLnN0cmluZ2lmeShrZXl3b3JkKX0uYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBvYmplY3RbZmlyc3RLZXldID0gdGhpcy5fZXhwYW5kUmVzdWx0T25LZXlQYXRoKFxuICAgICAgb2JqZWN0W2ZpcnN0S2V5XSB8fCB7fSxcbiAgICAgIG5leHRQYXRoLFxuICAgICAgdmFsdWVbZmlyc3RLZXldXG4gICAgKTtcbiAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIF9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0OiBhbnksIHJlc3VsdDogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IHt9O1xuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICB9XG4gICAgT2JqZWN0LmtleXMob3JpZ2luYWxPYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGNvbnN0IGtleVVwZGF0ZSA9IG9yaWdpbmFsT2JqZWN0W2tleV07XG4gICAgICAvLyBkZXRlcm1pbmUgaWYgdGhhdCB3YXMgYW4gb3BcbiAgICAgIGlmIChcbiAgICAgICAga2V5VXBkYXRlICYmXG4gICAgICAgIHR5cGVvZiBrZXlVcGRhdGUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIGtleVVwZGF0ZS5fX29wICYmXG4gICAgICAgIFsnQWRkJywgJ0FkZFVuaXF1ZScsICdSZW1vdmUnLCAnSW5jcmVtZW50JywgJ1NldE9uSW5zZXJ0J10uaW5kZXhPZihrZXlVcGRhdGUuX19vcCkgPiAtMVxuICAgICAgKSB7XG4gICAgICAgIC8vIG9ubHkgdmFsaWQgb3BzIHRoYXQgcHJvZHVjZSBhbiBhY3Rpb25hYmxlIHJlc3VsdFxuICAgICAgICAvLyB0aGUgb3AgbWF5IGhhdmUgaGFwcGVuZWQgb24gYSBrZXlwYXRoXG4gICAgICAgIHRoaXMuX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChyZXNwb25zZSwga2V5LCByZXN1bHQpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICB9XG5cbiAgc3RhdGljIF92YWxpZGF0ZVF1ZXJ5OiAoYW55LCBib29sZWFuLCBib29sZWFuLCBib29sZWFuKSA9PiB2b2lkO1xuICBzdGF0aWMgZmlsdGVyU2Vuc2l0aXZlRGF0YTogKGJvb2xlYW4sIGJvb2xlYW4sIGFueVtdLCBhbnksIGFueSwgYW55LCBzdHJpbmcsIGFueVtdLCBhbnkpID0+IHZvaWQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRGF0YWJhc2VDb250cm9sbGVyO1xuLy8gRXhwb3NlIHZhbGlkYXRlUXVlcnkgZm9yIHRlc3RzXG5tb2R1bGUuZXhwb3J0cy5fdmFsaWRhdGVRdWVyeSA9IHZhbGlkYXRlUXVlcnk7XG5tb2R1bGUuZXhwb3J0cy5maWx0ZXJTZW5zaXRpdmVEYXRhID0gZmlsdGVyU2Vuc2l0aXZlRGF0YTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFLQSxJQUFBQSxLQUFBLEdBQUFDLE9BQUE7QUFFQSxJQUFBQyxPQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFFQSxJQUFBRyxVQUFBLEdBQUFELHNCQUFBLENBQUFGLE9BQUE7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