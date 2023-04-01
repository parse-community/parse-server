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
};

// Filters out any data that shouldn't be on this REST-formatted object.
const filterSensitiveData = (isMaster, aclGroup, auth, operation, schema, className, protectedFields, object) => {
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

  /* special treat for the user class: don't filter protectedFields if currently loggedin user is
  the retrieved user */
  if (!(isUserClass && userId && object.objectId === userId)) {
    protectedFields && protectedFields.forEach(k => delete object[k]);

    // fields not requested by client (excluded),
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
    return Promise.all(promises).then(() => {
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
    const isMaster = acl === undefined;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJhZGRXcml0ZUFDTCIsInF1ZXJ5IiwiYWNsIiwibmV3UXVlcnkiLCJfIiwiY2xvbmVEZWVwIiwiX3dwZXJtIiwiJGluIiwiYWRkUmVhZEFDTCIsIl9ycGVybSIsInRyYW5zZm9ybU9iamVjdEFDTCIsIkFDTCIsInJlc3VsdCIsImVudHJ5IiwicmVhZCIsInB1c2giLCJ3cml0ZSIsInNwZWNpYWxRdWVyeUtleXMiLCJzcGVjaWFsTWFzdGVyUXVlcnlLZXlzIiwidmFsaWRhdGVRdWVyeSIsImlzTWFzdGVyIiwidXBkYXRlIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsImZvckVhY2giLCJ2YWx1ZSIsIiRhbmQiLCIkbm9yIiwibGVuZ3RoIiwiT2JqZWN0Iiwia2V5cyIsImtleSIsIiRyZWdleCIsIiRvcHRpb25zIiwibWF0Y2giLCJpbmNsdWRlcyIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiYWNsR3JvdXAiLCJhdXRoIiwib3BlcmF0aW9uIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwicHJvdGVjdGVkRmllbGRzIiwib2JqZWN0IiwidXNlcklkIiwidXNlciIsImlkIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1JlYWRPcGVyYXRpb24iLCJpbmRleE9mIiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0iLCJmaWx0ZXIiLCJzdGFydHNXaXRoIiwibWFwIiwic3Vic3RyaW5nIiwibmV3UHJvdGVjdGVkRmllbGRzIiwib3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMiLCJwb2ludGVyUGVybSIsInBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyIiwicmVhZFVzZXJGaWVsZFZhbHVlIiwiaXNBcnJheSIsInNvbWUiLCJvYmplY3RJZCIsImZpZWxkcyIsInYiLCJpc1VzZXJDbGFzcyIsImsiLCJ0ZW1wb3JhcnlLZXlzIiwicGFzc3dvcmQiLCJfaGFzaGVkX3Bhc3N3b3JkIiwic2Vzc2lvblRva2VuIiwiY2hhckF0IiwiYXV0aERhdGEiLCJzcGVjaWFsS2V5c0ZvclVwZGF0ZSIsImlzU3BlY2lhbFVwZGF0ZUtleSIsImpvaW5UYWJsZU5hbWUiLCJmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlIiwiX19vcCIsImFtb3VudCIsIklOVkFMSURfSlNPTiIsIm9iamVjdHMiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwidHJhbnNmb3JtQXV0aERhdGEiLCJwcm92aWRlciIsInByb3ZpZGVyRGF0YSIsImZpZWxkTmFtZSIsInR5cGUiLCJ1bnRyYW5zZm9ybU9iamVjdEFDTCIsIm91dHB1dCIsImdldFJvb3RGaWVsZE5hbWUiLCJzcGxpdCIsInJlbGF0aW9uU2NoZW1hIiwicmVsYXRlZElkIiwib3duaW5nSWQiLCJtYXliZVRyYW5zZm9ybVVzZXJuYW1lQW5kRW1haWxUb0xvd2VyQ2FzZSIsIm9wdGlvbnMiLCJmb3JjZUVtYWlsQW5kVXNlcm5hbWVUb0xvd2VyQ2FzZSIsInRvTG93ZXJDYXNlRmllbGRzIiwidG9Mb3dlckNhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFkYXB0ZXIiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJzY2hlbWFQcm9taXNlIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29sbGVjdGlvbkV4aXN0cyIsImNsYXNzRXhpc3RzIiwicHVyZ2VDb2xsZWN0aW9uIiwibG9hZFNjaGVtYSIsInRoZW4iLCJzY2hlbWFDb250cm9sbGVyIiwiZ2V0T25lU2NoZW1hIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ2YWxpZGF0ZUNsYXNzTmFtZSIsIlNjaGVtYUNvbnRyb2xsZXIiLCJjbGFzc05hbWVJc1ZhbGlkIiwiUHJvbWlzZSIsInJlamVjdCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsInJlc29sdmUiLCJjbGVhckNhY2hlIiwibG9hZCIsImxvYWRTY2hlbWFJZk5lZWRlZCIsInJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IiwidCIsImdldEV4cGVjdGVkVHlwZSIsInRhcmdldENsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJydW5PcHRpb25zIiwidW5kZWZpbmVkIiwicyIsImNhbkFkZEZpZWxkIiwibWFueSIsInVwc2VydCIsImFkZHNGaWVsZCIsInNraXBTYW5pdGl6YXRpb24iLCJ2YWxpZGF0ZU9ubHkiLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJvcmlnaW5hbFF1ZXJ5Iiwib3JpZ2luYWxVcGRhdGUiLCJkZWVwY29weSIsInJlbGF0aW9uVXBkYXRlcyIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNvbGxlY3RSZWxhdGlvblVwZGF0ZXMiLCJhZGRQb2ludGVyUGVybWlzc2lvbnMiLCJjYXRjaCIsImVycm9yIiwicm9vdEZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWQiLCJ1cGRhdGVPcGVyYXRpb24iLCJpbm5lcktleSIsIklOVkFMSURfTkVTVEVEX0tFWSIsImZpbmQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cHNlcnRPbmVPYmplY3QiLCJmaW5kT25lQW5kVXBkYXRlIiwiaGFuZGxlUmVsYXRpb25VcGRhdGVzIiwiX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQiLCJvcHMiLCJkZWxldGVNZSIsInByb2Nlc3MiLCJvcCIsIngiLCJwZW5kaW5nIiwiYWRkUmVsYXRpb24iLCJyZW1vdmVSZWxhdGlvbiIsImFsbCIsImZyb21DbGFzc05hbWUiLCJmcm9tSWQiLCJ0b0lkIiwiZG9jIiwiY29kZSIsImRlc3Ryb3kiLCJwYXJzZUZvcm1hdFNjaGVtYSIsImNyZWF0ZSIsIm9yaWdpbmFsT2JqZWN0IiwiY3JlYXRlZEF0IiwiaXNvIiwiX190eXBlIiwidXBkYXRlZEF0IiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiY3JlYXRlT2JqZWN0IiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsImNsYXNzU2NoZW1hIiwic2NoZW1hRGF0YSIsInNjaGVtYUZpZWxkcyIsIm5ld0tleXMiLCJmaWVsZCIsImFjdGlvbiIsImRlbGV0ZUV2ZXJ5dGhpbmciLCJmYXN0IiwiU2NoZW1hQ2FjaGUiLCJjbGVhciIsImRlbGV0ZUFsbENsYXNzZXMiLCJyZWxhdGVkSWRzIiwicXVlcnlPcHRpb25zIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImZpbmRPcHRpb25zIiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIl9pZCIsInJlc3VsdHMiLCJvd25pbmdJZHMiLCJyZWR1Y2VJblJlbGF0aW9uIiwib3JzIiwiYVF1ZXJ5IiwiaW5kZXgiLCJhbmRzIiwicHJvbWlzZXMiLCJxdWVyaWVzIiwiY29uc3RyYWludEtleSIsImlzTmVnYXRpb24iLCJyIiwicSIsImlkcyIsImFkZE5vdEluT2JqZWN0SWRzSWRzIiwiYWRkSW5PYmplY3RJZHNJZHMiLCJyZWR1Y2VSZWxhdGlvbktleXMiLCJyZWxhdGVkVG8iLCJpZHNGcm9tU3RyaW5nIiwiaWRzRnJvbUVxIiwiaWRzRnJvbUluIiwiYWxsSWRzIiwibGlzdCIsInRvdGFsTGVuZ3RoIiwicmVkdWNlIiwibWVtbyIsImlkc0ludGVyc2VjdGlvbiIsImludGVyc2VjdCIsImJpZyIsIiRlcSIsImlkc0Zyb21OaW4iLCJTZXQiLCIkbmluIiwiY291bnQiLCJkaXN0aW5jdCIsInBpcGVsaW5lIiwicmVhZFByZWZlcmVuY2UiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwiZXhwbGFpbiIsIl9jcmVhdGVkX2F0IiwiX3VwZGF0ZWRfYXQiLCJkaXNhYmxlQ2FzZUluc2Vuc2l0aXZpdHkiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJhZ2dyZWdhdGUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJkZWxldGVTY2hlbWEiLCJkZWxldGVDbGFzcyIsIndhc1BhcnNlQ29sbGVjdGlvbiIsInJlbGF0aW9uRmllbGROYW1lcyIsIm5hbWUiLCJkZWwiLCJyZWxvYWREYXRhIiwib2JqZWN0VG9FbnRyaWVzU3RyaW5ncyIsImVudHJpZXMiLCJhIiwiSlNPTiIsInN0cmluZ2lmeSIsImpvaW4iLCJyZWR1Y2VPck9wZXJhdGlvbiIsInJlcGVhdCIsImkiLCJqIiwic2hvcnRlciIsImxvbmdlciIsImZvdW5kRW50cmllcyIsImFjYyIsInNob3J0ZXJFbnRyaWVzIiwic3BsaWNlIiwicmVkdWNlQW5kT3BlcmF0aW9uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwidXNlckFDTCIsImdyb3VwS2V5IiwicGVybUZpZWxkcyIsInBvaW50ZXJGaWVsZHMiLCJ1c2VyUG9pbnRlciIsImZpZWxkRGVzY3JpcHRvciIsImZpZWxkVHlwZSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInF1ZXJ5Q2xhdXNlIiwiJGFsbCIsImFzc2lnbiIsInByZXNlcnZlS2V5cyIsInNlcnZlck9ubHlLZXlzIiwiYXV0aGVudGljYXRlZCIsInJvbGVzIiwidXNlclJvbGVzIiwicHJvdGVjdGVkS2V5c1NldHMiLCJwcm90ZWN0ZWRLZXlzIiwibmV4dCIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwicmVxdWlyZWRVc2VyRmllbGRzIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsIl9Vc2VyIiwicmVxdWlyZWRSb2xlRmllbGRzIiwiX1JvbGUiLCJyZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzIiwiX0lkZW1wb3RlbmN5IiwiZW5zdXJlVW5pcXVlbmVzcyIsImxvZ2dlciIsIndhcm4iLCJlbnN1cmVJbmRleCIsImlzTW9uZ29BZGFwdGVyIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsImlzUG9zdGdyZXNBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInR0bCIsInNldElkZW1wb3RlbmN5RnVuY3Rpb24iLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsIl9leHBhbmRSZXN1bHRPbktleVBhdGgiLCJwYXRoIiwiZmlyc3RLZXkiLCJuZXh0UGF0aCIsInNsaWNlIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJVdGlscyIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJyZXNwb25zZSIsImtleVVwZGF0ZSIsIm1vZHVsZSIsImV4cG9ydHMiLCJfdmFsaWRhdGVRdWVyeSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsi77u/Ly8gQGZsb3dcbi8vIEEgZGF0YWJhc2UgYWRhcHRlciB0aGF0IHdvcmtzIHdpdGggZGF0YSBleHBvcnRlZCBmcm9tIHRoZSBob3N0ZWRcbi8vIFBhcnNlIGRhdGFiYXNlLlxuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBpbnRlcnNlY3QgZnJvbSAnaW50ZXJzZWN0Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBVdGlscyBmcm9tICcuLi9VdGlscyc7XG5pbXBvcnQgKiBhcyBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4vU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IE1vbmdvU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHR5cGUgeyBMb2FkU2NoZW1hT3B0aW9ucyB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHR5cGUgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuLi9PcHRpb25zJztcbmltcG9ydCB0eXBlIHsgUXVlcnlPcHRpb25zLCBGdWxsUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5cbmZ1bmN0aW9uIGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfd3Blcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3dwZXJtID0geyAkaW46IFtudWxsLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuZnVuY3Rpb24gYWRkUmVhZEFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3JwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll9ycGVybSA9IHsgJGluOiBbbnVsbCwgJyonLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuLy8gVHJhbnNmb3JtcyBhIFJFU1QgQVBJIGZvcm1hdHRlZCBBQ0wgb2JqZWN0IHRvIG91ciB0d28tZmllbGQgbW9uZ28gZm9ybWF0LlxuY29uc3QgdHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgQUNMLCAuLi5yZXN1bHQgfSkgPT4ge1xuICBpZiAoIUFDTCkge1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICByZXN1bHQuX3dwZXJtID0gW107XG4gIHJlc3VsdC5fcnBlcm0gPSBbXTtcblxuICBmb3IgKGNvbnN0IGVudHJ5IGluIEFDTCkge1xuICAgIGlmIChBQ0xbZW50cnldLnJlYWQpIHtcbiAgICAgIHJlc3VsdC5fcnBlcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGlmIChBQ0xbZW50cnldLndyaXRlKSB7XG4gICAgICByZXN1bHQuX3dwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuY29uc3Qgc3BlY2lhbFF1ZXJ5S2V5cyA9IFsnJGFuZCcsICckb3InLCAnJG5vcicsICdfcnBlcm0nLCAnX3dwZXJtJ107XG5jb25zdCBzcGVjaWFsTWFzdGVyUXVlcnlLZXlzID0gW1xuICAuLi5zcGVjaWFsUXVlcnlLZXlzLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfdG9tYnN0b25lJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG5dO1xuXG5jb25zdCB2YWxpZGF0ZVF1ZXJ5ID0gKHF1ZXJ5OiBhbnksIGlzTWFzdGVyOiBib29sZWFuLCB1cGRhdGU6IGJvb2xlYW4pOiB2b2lkID0+IHtcbiAgaWYgKHF1ZXJ5LkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQ2Fubm90IHF1ZXJ5IG9uIEFDTC4nKTtcbiAgfVxuXG4gIGlmIChxdWVyeS4kb3IpIHtcbiAgICBpZiAocXVlcnkuJG9yIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCB1cGRhdGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJG9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJGFuZCkge1xuICAgIGlmIChxdWVyeS4kYW5kIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRhbmQuZm9yRWFjaCh2YWx1ZSA9PiB2YWxpZGF0ZVF1ZXJ5KHZhbHVlLCBpc01hc3RlciwgdXBkYXRlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQmFkICRhbmQgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kbm9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRub3IgaW5zdGFuY2VvZiBBcnJheSAmJiBxdWVyeS4kbm9yLmxlbmd0aCA+IDApIHtcbiAgICAgIHF1ZXJ5LiRub3IuZm9yRWFjaCh2YWx1ZSA9PiB2YWxpZGF0ZVF1ZXJ5KHZhbHVlLCBpc01hc3RlciwgdXBkYXRlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkbm9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSBvZiBhdCBsZWFzdCAxIHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAocXVlcnkgJiYgcXVlcnlba2V5XSAmJiBxdWVyeVtrZXldLiRyZWdleCkge1xuICAgICAgaWYgKHR5cGVvZiBxdWVyeVtrZXldLiRvcHRpb25zID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXF1ZXJ5W2tleV0uJG9wdGlvbnMubWF0Y2goL15baW14c10rJC8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgIGBCYWQgJG9wdGlvbnMgdmFsdWUgZm9yIHF1ZXJ5OiAke3F1ZXJ5W2tleV0uJG9wdGlvbnN9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKFxuICAgICAgIWtleS5tYXRjaCgvXlthLXpBLVpdW2EtekEtWjAtOV9cXC5dKiQvKSAmJlxuICAgICAgKCghc3BlY2lhbFF1ZXJ5S2V5cy5pbmNsdWRlcyhrZXkpICYmICFpc01hc3RlciAmJiAhdXBkYXRlKSB8fFxuICAgICAgICAodXBkYXRlICYmIGlzTWFzdGVyICYmICFzcGVjaWFsTWFzdGVyUXVlcnlLZXlzLmluY2x1ZGVzKGtleSkpKVxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBJbnZhbGlkIGtleSBuYW1lOiAke2tleX1gKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLy8gRmlsdGVycyBvdXQgYW55IGRhdGEgdGhhdCBzaG91bGRuJ3QgYmUgb24gdGhpcyBSRVNULWZvcm1hdHRlZCBvYmplY3QuXG5jb25zdCBmaWx0ZXJTZW5zaXRpdmVEYXRhID0gKFxuICBpc01hc3RlcjogYm9vbGVhbixcbiAgYWNsR3JvdXA6IGFueVtdLFxuICBhdXRoOiBhbnksXG4gIG9wZXJhdGlvbjogYW55LFxuICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlciB8IGFueSxcbiAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gIHByb3RlY3RlZEZpZWxkczogbnVsbCB8IEFycmF5PGFueT4sXG4gIG9iamVjdDogYW55XG4pID0+IHtcbiAgbGV0IHVzZXJJZCA9IG51bGw7XG4gIGlmIChhdXRoICYmIGF1dGgudXNlcikgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuXG4gIC8vIHJlcGxhY2UgcHJvdGVjdGVkRmllbGRzIHdoZW4gdXNpbmcgcG9pbnRlci1wZXJtaXNzaW9uc1xuICBjb25zdCBwZXJtcyA9XG4gICAgc2NoZW1hICYmIHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMgPyBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSkgOiB7fTtcbiAgaWYgKHBlcm1zKSB7XG4gICAgY29uc3QgaXNSZWFkT3BlcmF0aW9uID0gWydnZXQnLCAnZmluZCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xO1xuXG4gICAgaWYgKGlzUmVhZE9wZXJhdGlvbiAmJiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIGV4dHJhY3QgcHJvdGVjdGVkRmllbGRzIGFkZGVkIHdpdGggdGhlIHBvaW50ZXItcGVybWlzc2lvbiBwcmVmaXhcbiAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtID0gT2JqZWN0LmtleXMocGVybXMucHJvdGVjdGVkRmllbGRzKVxuICAgICAgICAuZmlsdGVyKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBrZXkuc3Vic3RyaW5nKDEwKSwgdmFsdWU6IHBlcm1zLnByb3RlY3RlZEZpZWxkc1trZXldIH07XG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBuZXdQcm90ZWN0ZWRGaWVsZHM6IEFycmF5PHN0cmluZz5bXSA9IFtdO1xuICAgICAgbGV0IG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gZmFsc2U7XG5cbiAgICAgIC8vIGNoZWNrIGlmIHRoZSBvYmplY3QgZ3JhbnRzIHRoZSBjdXJyZW50IHVzZXIgYWNjZXNzIGJhc2VkIG9uIHRoZSBleHRyYWN0ZWQgZmllbGRzXG4gICAgICBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybS5mb3JFYWNoKHBvaW50ZXJQZXJtID0+IHtcbiAgICAgICAgbGV0IHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IHJlYWRVc2VyRmllbGRWYWx1ZSA9IG9iamVjdFtwb2ludGVyUGVybS5rZXldO1xuICAgICAgICBpZiAocmVhZFVzZXJGaWVsZFZhbHVlKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVhZFVzZXJGaWVsZFZhbHVlKSkge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSByZWFkVXNlckZpZWxkVmFsdWUuc29tZShcbiAgICAgICAgICAgICAgdXNlciA9PiB1c2VyLm9iamVjdElkICYmIHVzZXIub2JqZWN0SWQgPT09IHVzZXJJZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPVxuICAgICAgICAgICAgICByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgJiYgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkID09PSB1c2VySWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyKSB7XG4gICAgICAgICAgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSB0cnVlO1xuICAgICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHBvaW50ZXJQZXJtLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIGlmIGF0IGxlYXN0IG9uZSBwb2ludGVyLXBlcm1pc3Npb24gYWZmZWN0ZWQgdGhlIGN1cnJlbnQgdXNlclxuICAgICAgLy8gaW50ZXJzZWN0IHZzIHByb3RlY3RlZEZpZWxkcyBmcm9tIHByZXZpb3VzIHN0YWdlIChAc2VlIGFkZFByb3RlY3RlZEZpZWxkcylcbiAgICAgIC8vIFNldHMgdGhlb3J5IChpbnRlcnNlY3Rpb25zKTogQSB4IChCIHggQykgPT0gKEEgeCBCKSB4IENcbiAgICAgIGlmIChvdmVycmlkZVByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocHJvdGVjdGVkRmllbGRzKTtcbiAgICAgIH1cbiAgICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgICAvLyBpZiB0aGVyZSdyZSBubyBwcm90Y3RlZEZpZWxkcyBieSBvdGhlciBjcml0ZXJpYSAoIGlkIC8gcm9sZSAvIGF1dGgpXG4gICAgICAgICAgLy8gdGhlbiB3ZSBtdXN0IGludGVyc2VjdCBlYWNoIHNldCAocGVyIHVzZXJGaWVsZClcbiAgICAgICAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gZmllbGRzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHMuZmlsdGVyKHYgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlzVXNlckNsYXNzID0gY2xhc3NOYW1lID09PSAnX1VzZXInO1xuXG4gIC8qIHNwZWNpYWwgdHJlYXQgZm9yIHRoZSB1c2VyIGNsYXNzOiBkb24ndCBmaWx0ZXIgcHJvdGVjdGVkRmllbGRzIGlmIGN1cnJlbnRseSBsb2dnZWRpbiB1c2VyIGlzXG4gIHRoZSByZXRyaWV2ZWQgdXNlciAqL1xuICBpZiAoIShpc1VzZXJDbGFzcyAmJiB1c2VySWQgJiYgb2JqZWN0Lm9iamVjdElkID09PSB1c2VySWQpKSB7XG4gICAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG5cbiAgICAvLyBmaWVsZHMgbm90IHJlcXVlc3RlZCBieSBjbGllbnQgKGV4Y2x1ZGVkKSxcbiAgICAvL2J1dCB3ZXJlIG5lZWRlZCB0byBhcHBseSBwcm90ZWN0dGVkRmllbGRzXG4gICAgcGVybXMucHJvdGVjdGVkRmllbGRzICYmXG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyAmJlxuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuICB9XG5cbiAgaWYgKGlzVXNlckNsYXNzKSB7XG4gICAgb2JqZWN0LnBhc3N3b3JkID0gb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gICAgZGVsZXRlIG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIGRlbGV0ZSBvYmplY3Quc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgaWYgKGlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAoa2V5LmNoYXJBdCgwKSA9PT0gJ18nKSB7XG4gICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgfVxuICB9XG5cbiAgaWYgKCFpc1VzZXJDbGFzcykge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBpZiAoYWNsR3JvdXAuaW5kZXhPZihvYmplY3Qub2JqZWN0SWQpID4gLTEpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG4vLyBSdW5zIGFuIHVwZGF0ZSBvbiB0aGUgZGF0YWJhc2UuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gb2JqZWN0IHdpdGggdGhlIG5ldyB2YWx1ZXMgZm9yIGZpZWxkXG4vLyBtb2RpZmljYXRpb25zIHRoYXQgZG9uJ3Qga25vdyB0aGVpciByZXN1bHRzIGFoZWFkIG9mIHRpbWUsIGxpa2Vcbi8vICdpbmNyZW1lbnQnLlxuLy8gT3B0aW9uczpcbi8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbmNvbnN0IHNwZWNpYWxLZXlzRm9yVXBkYXRlID0gW1xuICAnX2hhc2hlZF9wYXNzd29yZCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFVwZGF0ZUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsS2V5c0ZvclVwZGF0ZS5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmZ1bmN0aW9uIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIGBfSm9pbjoke2tleX06JHtjbGFzc05hbWV9YDtcbn1cblxuY29uc3QgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSA9IG9iamVjdCA9PiB7XG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICBzd2l0Y2ggKG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldLmFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY29uc3QgbWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2UgPSAob2JqZWN0LCBjbGFzc05hbWUsIG9wdGlvbnMpID0+IHtcbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiBvcHRpb25zLmZvcmNlRW1haWxBbmRVc2VybmFtZVRvTG93ZXJDYXNlKSB7XG4gICAgY29uc3QgdG9Mb3dlckNhc2VGaWVsZHMgPSBbJ2VtYWlsJywgJ3VzZXJuYW1lJ107XG4gICAgdG9Mb3dlckNhc2VGaWVsZHMuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PT0gJ3N0cmluZycpIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0udG9Mb3dlckNhc2UoKTtcbiAgICB9KTtcbiAgfVxufTtcblxuY2xhc3MgRGF0YWJhc2VDb250cm9sbGVyIHtcbiAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG4gIHNjaGVtYVByb21pc2U6ID9Qcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj47XG4gIF90cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueTtcbiAgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zO1xuICBpZGVtcG90ZW5jeU9wdGlvbnM6IGFueTtcblxuICBjb25zdHJ1Y3RvcihhZGFwdGVyOiBTdG9yYWdlQWRhcHRlciwgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdGhpcy5hZGFwdGVyID0gYWRhcHRlcjtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHRoaXMuaWRlbXBvdGVuY3lPcHRpb25zID0gdGhpcy5vcHRpb25zLmlkZW1wb3RlbmN5T3B0aW9ucyB8fCB7fTtcbiAgICAvLyBQcmV2ZW50IG11dGFibGUgdGhpcy5zY2hlbWEsIG90aGVyd2lzZSBvbmUgcmVxdWVzdCBjb3VsZCB1c2VcbiAgICAvLyBtdWx0aXBsZSBzY2hlbWFzLCBzbyBpbnN0ZWFkIHVzZSBsb2FkU2NoZW1hIHRvIGdldCBhIHNjaGVtYS5cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICB9XG5cbiAgY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY2xhc3NFeGlzdHMoY2xhc3NOYW1lKTtcbiAgfVxuXG4gIHB1cmdlQ29sbGVjdGlvbihjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUpKVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShjbGFzc05hbWUsIHNjaGVtYSwge30pKTtcbiAgfVxuXG4gIHZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCAnaW52YWxpZCBjbGFzc05hbWU6ICcgKyBjbGFzc05hbWUpXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBzY2hlbWFDb250cm9sbGVyLlxuICBsb2FkU2NoZW1hKFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hUHJvbWlzZSAhPSBudWxsKSB7XG4gICAgICByZXR1cm4gdGhpcy5zY2hlbWFQcm9taXNlO1xuICAgIH1cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBTY2hlbWFDb250cm9sbGVyLmxvYWQodGhpcy5hZGFwdGVyLCBvcHRpb25zKTtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UudGhlbihcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2UsXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgbG9hZFNjaGVtYUlmTmVlZGVkKFxuICAgIHNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyID8gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYUNvbnRyb2xsZXIpIDogdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSBjbGFzc25hbWUgdGhhdCBpcyByZWxhdGVkIHRvIHRoZSBnaXZlblxuICAvLyBjbGFzc25hbWUgdGhyb3VnaCB0aGUga2V5LlxuICAvLyBUT0RPOiBtYWtlIHRoaXMgbm90IGluIHRoZSBEYXRhYmFzZUNvbnRyb2xsZXIgaW50ZXJmYWNlXG4gIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZyk6IFByb21pc2U8P3N0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PiB7XG4gICAgICB2YXIgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKHQgIT0gbnVsbCAmJiB0eXBlb2YgdCAhPT0gJ3N0cmluZycgJiYgdC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiB0LnRhcmdldENsYXNzO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGNsYXNzTmFtZTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFVzZXMgdGhlIHNjaGVtYSB0byB2YWxpZGF0ZSB0aGUgb2JqZWN0IChSRVNUIEFQSSBmb3JtYXQpLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hLlxuICAvLyBUaGlzIGRvZXMgbm90IHVwZGF0ZSB0aGlzLnNjaGVtYSwgYmVjYXVzZSBpbiBhIHNpdHVhdGlvbiBsaWtlIGFcbiAgLy8gYmF0Y2ggcmVxdWVzdCwgdGhhdCBjb3VsZCBjb25mdXNlIG90aGVyIHVzZXJzIG9mIHRoZSBzY2hlbWEuXG4gIHZhbGlkYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGxldCBzY2hlbWE7XG4gICAgY29uc3QgYWNsID0gcnVuT3B0aW9ucy5hY2w7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXA6IHN0cmluZ1tdID0gYWNsIHx8IFtdO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4ocyA9PiB7XG4gICAgICAgIHNjaGVtYSA9IHM7XG4gICAgICAgIGlmIChpc01hc3Rlcikge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5jYW5BZGRGaWVsZChzY2hlbWEsIGNsYXNzTmFtZSwgb2JqZWN0LCBhY2xHcm91cCwgcnVuT3B0aW9ucyk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHsgYWNsLCBtYW55LCB1cHNlcnQsIGFkZHNGaWVsZCB9OiBGdWxsUXVlcnlPcHRpb25zID0ge30sXG4gICAgc2tpcFNhbml0aXphdGlvbjogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IHF1ZXJ5O1xuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0gdXBkYXRlO1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICB1cGRhdGUgPSBkZWVwY29weSh1cGRhdGUpO1xuICAgIHZhciByZWxhdGlvblVwZGF0ZXMgPSBbXTtcbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ3VwZGF0ZScpXG4gICAgICApXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLCB1cGRhdGUpO1xuICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgJ3VwZGF0ZScsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKGFkZHNGaWVsZCkge1xuICAgICAgICAgICAgICBxdWVyeSA9IHtcbiAgICAgICAgICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICdhZGRGaWVsZCcsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCB0cnVlKTtcbiAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAgIC8vIHdpbGwgbGlrZWx5IG5lZWQgcmV2aXNpdGluZy5cbiAgICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSwgY2xhc3NOYW1lKSAmJlxuICAgICAgICAgICAgICAgICAgIWlzU3BlY2lhbFVwZGF0ZUtleShyb290RmllbGROYW1lKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCB1cGRhdGVPcGVyYXRpb24gaW4gdXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gJiZcbiAgICAgICAgICAgICAgICAgIHR5cGVvZiB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dKS5zb21lKFxuICAgICAgICAgICAgICAgICAgICBpbm5lcktleSA9PiBpbm5lcktleS5pbmNsdWRlcygnJCcpIHx8IGlubmVyS2V5LmluY2x1ZGVzKCcuJylcbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgICAgICAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHVwZGF0ZSA9IHRyYW5zZm9ybU9iamVjdEFDTCh1cGRhdGUpO1xuICAgICAgICAgICAgICBtYXliZVRyYW5zZm9ybVVzZXJuYW1lQW5kRW1haWxUb0xvd2VyQ2FzZSh1cGRhdGUsIGNsYXNzTmFtZSwgdGhpcy5vcHRpb25zKTtcbiAgICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB7fSkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgIXJlc3VsdC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChtYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHVwc2VydCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kT25lQW5kVXBkYXRlKFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLFxuICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzXG4gICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgaWYgKHNraXBTYW5pdGl6YXRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxVcGRhdGUsIHJlc3VsdCk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ29sbGVjdCBhbGwgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgbGlzdCBvZiBhbGwgcmVsYXRpb24gdXBkYXRlcyB0byBwZXJmb3JtXG4gIC8vIFRoaXMgbXV0YXRlcyB1cGRhdGUuXG4gIGNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdElkOiA/c3RyaW5nLCB1cGRhdGU6IGFueSkge1xuICAgIHZhciBvcHMgPSBbXTtcbiAgICB2YXIgZGVsZXRlTWUgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcblxuICAgIHZhciBwcm9jZXNzID0gKG9wLCBrZXkpID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0JhdGNoJykge1xuICAgICAgICBmb3IgKHZhciB4IG9mIG9wLm9wcykge1xuICAgICAgICAgIHByb2Nlc3MoeCwga2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IGtleSBpbiB1cGRhdGUpIHtcbiAgICAgIHByb2Nlc3ModXBkYXRlW2tleV0sIGtleSk7XG4gICAgfVxuICAgIGZvciAoY29uc3Qga2V5IG9mIGRlbGV0ZU1lKSB7XG4gICAgICBkZWxldGUgdXBkYXRlW2tleV07XG4gICAgfVxuICAgIHJldHVybiBvcHM7XG4gIH1cblxuICAvLyBQcm9jZXNzZXMgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gYWxsIHVwZGF0ZXMgaGF2ZSBiZWVuIHBlcmZvcm1lZFxuICBoYW5kbGVSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdElkOiBzdHJpbmcsIHVwZGF0ZTogYW55LCBvcHM6IGFueSkge1xuICAgIHZhciBwZW5kaW5nID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG4gICAgb3BzLmZvckVhY2goKHsga2V5LCBvcCB9KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaCh0aGlzLmFkZFJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKHRoaXMucmVtb3ZlUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHBlbmRpbmcpO1xuICB9XG5cbiAgLy8gQWRkcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIGFkZCB3YXMgc3VjY2Vzc2Z1bC5cbiAgYWRkUmVsYXRpb24oa2V5OiBzdHJpbmcsIGZyb21DbGFzc05hbWU6IHN0cmluZywgZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZykge1xuICAgIGNvbnN0IGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgIGRvYyxcbiAgICAgIGRvYyxcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSByZW1vdmUgd2FzXG4gIC8vIHN1Y2Nlc3NmdWwuXG4gIHJlbW92ZVJlbGF0aW9uKGtleTogc3RyaW5nLCBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsIGZyb21JZDogc3RyaW5nLCB0b0lkOiBzdHJpbmcpIHtcbiAgICB2YXIgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIGRvYyxcbiAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFdlIGRvbid0IGNhcmUgaWYgdGhleSB0cnkgdG8gZGVsZXRlIGEgbm9uLWV4aXN0ZW50IHJlbGF0aW9uLlxuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZW1vdmVzIG9iamVjdHMgbWF0Y2hlcyB0aGlzIHF1ZXJ5IGZyb20gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCB3YXNcbiAgLy8gZGVsZXRlZC5cbiAgLy8gT3B0aW9uczpcbiAgLy8gICBhY2w6ICBhIGxpc3Qgb2Ygc3RyaW5ncy4gSWYgdGhlIG9iamVjdCB0byBiZSB1cGRhdGVkIGhhcyBhbiBBQ0wsXG4gIC8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbiAgLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbiAgZGVzdHJveShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnZGVsZXRlJylcbiAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICdkZWxldGUnLFxuICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBkZWxldGUgYnkgcXVlcnlcbiAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgaXNNYXN0ZXIsIGZhbHNlKTtcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSlcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihwYXJzZUZvcm1hdFNjaGVtYSA9PlxuICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIHBhcnNlRm9ybWF0U2NoZW1hLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIFdoZW4gZGVsZXRpbmcgc2Vzc2lvbnMgd2hpbGUgY2hhbmdpbmcgcGFzc3dvcmRzLCBkb24ndCB0aHJvdyBhbiBlcnJvciBpZiB0aGV5IGRvbid0IGhhdmUgYW55IHNlc3Npb25zLlxuICAgICAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEluc2VydHMgYW4gb2JqZWN0IGludG8gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCBzYXZlZC5cbiAgY3JlYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIGNvbnN0IG9yaWdpbmFsT2JqZWN0ID0gb2JqZWN0O1xuICAgIG9iamVjdCA9IHRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuICAgIG1heWJlVHJhbnNmb3JtVXNlcm5hbWVBbmRFbWFpbFRvTG93ZXJDYXNlKG9iamVjdCwgY2xhc3NOYW1lLCB0aGlzLm9wdGlvbnMpO1xuICAgIG9iamVjdC5jcmVhdGVkQXQgPSB7IGlzbzogb2JqZWN0LmNyZWF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcbiAgICBvYmplY3QudXBkYXRlZEF0ID0geyBpc286IG9iamVjdC51cGRhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG5cbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgY29uc3QgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZSwgbnVsbCwgb2JqZWN0KTtcbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWUpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnY3JlYXRlJylcbiAgICAgICAgKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSkpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKSlcbiAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgICAgICBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlKG9iamVjdCk7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIFNjaGVtYUNvbnRyb2xsZXIuY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShzY2hlbWEpLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsT2JqZWN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQub3BzWzBdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICBjYW5BZGRGaWVsZChcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNsYXNzU2NoZW1hID0gc2NoZW1hLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNsYXNzU2NoZW1hKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gICAgY29uc3Qgc2NoZW1hRmllbGRzID0gT2JqZWN0LmtleXMoY2xhc3NTY2hlbWEuZmllbGRzKTtcbiAgICBjb25zdCBuZXdLZXlzID0gZmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICAvLyBTa2lwIGZpZWxkcyB0aGF0IGFyZSB1bnNldFxuICAgICAgaWYgKG9iamVjdFtmaWVsZF0gJiYgb2JqZWN0W2ZpZWxkXS5fX29wICYmIG9iamVjdFtmaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNjaGVtYUZpZWxkcy5pbmRleE9mKGdldFJvb3RGaWVsZE5hbWUoZmllbGQpKSA8IDA7XG4gICAgfSk7XG4gICAgaWYgKG5ld0tleXMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYWRkcyBhIG1hcmtlciB0aGF0IG5ldyBmaWVsZCBpcyBiZWluZyBhZGRpbmcgZHVyaW5nIHVwZGF0ZVxuICAgICAgcnVuT3B0aW9ucy5hZGRzRmllbGQgPSB0cnVlO1xuXG4gICAgICBjb25zdCBhY3Rpb24gPSBydW5PcHRpb25zLmFjdGlvbjtcbiAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdhZGRGaWVsZCcsIGFjdGlvbik7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdvbid0IGRlbGV0ZSBjb2xsZWN0aW9ucyBpbiB0aGUgc3lzdGVtIG5hbWVzcGFjZVxuICAvKipcbiAgICogRGVsZXRlIGFsbCBjbGFzc2VzIGFuZCBjbGVhcnMgdGhlIHNjaGVtYSBjYWNoZVxuICAgKlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IGZhc3Qgc2V0IHRvIHRydWUgaWYgaXQncyBvayB0byBqdXN0IGRlbGV0ZSByb3dzIGFuZCBub3QgaW5kZXhlc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gd2hlbiB0aGUgZGVsZXRpb25zIGNvbXBsZXRlc1xuICAgKi9cbiAgZGVsZXRlRXZlcnl0aGluZyhmYXN0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPGFueT4ge1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUFsbENsYXNzZXMoZmFzdCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIHJlbGF0ZWQgaWRzIGdpdmVuIGFuIG93bmluZyBpZC5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIHJlbGF0ZWRJZHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgb3duaW5nSWQ6IHN0cmluZyxcbiAgICBxdWVyeU9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPEFycmF5PHN0cmluZz4+IHtcbiAgICBjb25zdCB7IHNraXAsIGxpbWl0LCBzb3J0IH0gPSBxdWVyeU9wdGlvbnM7XG4gICAgY29uc3QgZmluZE9wdGlvbnMgPSB7fTtcbiAgICBpZiAoc29ydCAmJiBzb3J0LmNyZWF0ZWRBdCAmJiB0aGlzLmFkYXB0ZXIuY2FuU29ydE9uSm9pblRhYmxlcykge1xuICAgICAgZmluZE9wdGlvbnMuc29ydCA9IHsgX2lkOiBzb3J0LmNyZWF0ZWRBdCB9O1xuICAgICAgZmluZE9wdGlvbnMubGltaXQgPSBsaW1pdDtcbiAgICAgIGZpbmRPcHRpb25zLnNraXAgPSBza2lwO1xuICAgICAgcXVlcnlPcHRpb25zLnNraXAgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSwgcmVsYXRpb25TY2hlbWEsIHsgb3duaW5nSWQgfSwgZmluZE9wdGlvbnMpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmVsYXRlZElkKSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIG93bmluZyBpZHMgZ2l2ZW4gc29tZSByZWxhdGVkIGlkcy5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIG93bmluZ0lkcyhjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcsIHJlbGF0ZWRJZHM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKFxuICAgICAgICBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIHsgcmVsYXRlZElkOiB7ICRpbjogcmVsYXRlZElkcyB9IH0sXG4gICAgICAgIHsga2V5czogWydvd25pbmdJZCddIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5vd25pbmdJZCkpO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRpbiBvbiByZWxhdGlvbiBmaWVsZHMsIG9yXG4gIC8vIGVxdWFsLXRvLXBvaW50ZXIgY29uc3RyYWludHMgb24gcmVsYXRpb24gZmllbGRzLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBzY2hlbWE6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gU2VhcmNoIGZvciBhbiBpbi1yZWxhdGlvbiBvciBlcXVhbC10by1yZWxhdGlvblxuICAgIC8vIE1ha2UgaXQgc2VxdWVudGlhbCBmb3Igbm93LCBub3Qgc3VyZSBvZiBwYXJhbGxlaXphdGlvbiBzaWRlIGVmZmVjdHNcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICBjb25zdCBvcnMgPSBxdWVyeVsnJG9yJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIG9ycy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHF1ZXJ5Wyckb3InXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgY29uc3QgYW5kcyA9IHF1ZXJ5WyckYW5kJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIGFuZHMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJGFuZCddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbWlzZXMgPSBPYmplY3Qua2V5cyhxdWVyeSkubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAoIXQgfHwgdC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfVxuICAgICAgbGV0IHF1ZXJpZXM6ID8oYW55W10pID0gbnVsbDtcbiAgICAgIGlmIChcbiAgICAgICAgcXVlcnlba2V5XSAmJlxuICAgICAgICAocXVlcnlba2V5XVsnJGluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmUnXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV0uX190eXBlID09ICdQb2ludGVyJylcbiAgICAgICkge1xuICAgICAgICAvLyBCdWlsZCB0aGUgbGlzdCBvZiBxdWVyaWVzXG4gICAgICAgIHF1ZXJpZXMgPSBPYmplY3Qua2V5cyhxdWVyeVtrZXldKS5tYXAoY29uc3RyYWludEtleSA9PiB7XG4gICAgICAgICAgbGV0IHJlbGF0ZWRJZHM7XG4gICAgICAgICAgbGV0IGlzTmVnYXRpb24gPSBmYWxzZTtcbiAgICAgICAgICBpZiAoY29uc3RyYWludEtleSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRpbicpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuaW4nKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckbmluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmUnKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XVsnJG5lJ10ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uLFxuICAgICAgICAgICAgcmVsYXRlZElkcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJpZXMgPSBbeyBpc05lZ2F0aW9uOiBmYWxzZSwgcmVsYXRlZElkczogW10gfV07XG4gICAgICB9XG5cbiAgICAgIC8vIHJlbW92ZSB0aGUgY3VycmVudCBxdWVyeUtleSBhcyB3ZSBkb24sdCBuZWVkIGl0IGFueW1vcmVcbiAgICAgIGRlbGV0ZSBxdWVyeVtrZXldO1xuICAgICAgLy8gZXhlY3V0ZSBlYWNoIHF1ZXJ5IGluZGVwZW5kZW50bHkgdG8gYnVpbGQgdGhlIGxpc3Qgb2ZcbiAgICAgIC8vICRpbiAvICRuaW5cbiAgICAgIGNvbnN0IHByb21pc2VzID0gcXVlcmllcy5tYXAocSA9PiB7XG4gICAgICAgIGlmICghcSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5vd25pbmdJZHMoY2xhc3NOYW1lLCBrZXksIHEucmVsYXRlZElkcykudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGlmIChxLmlzTmVnYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJHJlbGF0ZWRUb1xuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHF1ZXJ5T3B0aW9uczogYW55KTogP1Byb21pc2U8dm9pZD4ge1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRvciddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChxdWVyeVsnJGFuZCddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5WyckYW5kJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgYVF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgdmFyIHJlbGF0ZWRUbyA9IHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgaWYgKHJlbGF0ZWRUbykge1xuICAgICAgcmV0dXJuIHRoaXMucmVsYXRlZElkcyhcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHJlbGF0ZWRUby5rZXksXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3Qub2JqZWN0SWQsXG4gICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgKVxuICAgICAgICAudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICB9XG4gIH1cblxuICBhZGRJbk9iamVjdElkc0lkcyhpZHM6ID9BcnJheTxzdHJpbmc+ID0gbnVsbCwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21TdHJpbmc6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycgPyBbcXVlcnkub2JqZWN0SWRdIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tRXE6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckZXEnXSA/IFtxdWVyeS5vYmplY3RJZFsnJGVxJ11dIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tSW46ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA6IG51bGw7XG5cbiAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICBjb25zdCBhbGxJZHM6IEFycmF5PEFycmF5PHN0cmluZz4+ID0gW2lkc0Zyb21TdHJpbmcsIGlkc0Zyb21FcSwgaWRzRnJvbUluLCBpZHNdLmZpbHRlcihcbiAgICAgIGxpc3QgPT4gbGlzdCAhPT0gbnVsbFxuICAgICk7XG4gICAgY29uc3QgdG90YWxMZW5ndGggPSBhbGxJZHMucmVkdWNlKChtZW1vLCBsaXN0KSA9PiBtZW1vICsgbGlzdC5sZW5ndGgsIDApO1xuXG4gICAgbGV0IGlkc0ludGVyc2VjdGlvbiA9IFtdO1xuICAgIGlmICh0b3RhbExlbmd0aCA+IDEyNSkge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0LmJpZyhhbGxJZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QoYWxsSWRzKTtcbiAgICB9XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBxdWVyeS5vYmplY3RJZFsnJGluJ10gPSBpZHNJbnRlcnNlY3Rpb247XG5cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICBhZGROb3RJbk9iamVjdElkc0lkcyhpZHM6IHN0cmluZ1tdID0gW10sIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tTmluID0gcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gOiBbXTtcbiAgICBsZXQgYWxsSWRzID0gWy4uLmlkc0Zyb21OaW4sIC4uLmlkc10uZmlsdGVyKGxpc3QgPT4gbGlzdCAhPT0gbnVsbCk7XG5cbiAgICAvLyBtYWtlIGEgc2V0IGFuZCBzcHJlYWQgdG8gcmVtb3ZlIGR1cGxpY2F0ZXNcbiAgICBhbGxJZHMgPSBbLi4ubmV3IFNldChhbGxJZHMpXTtcblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBxdWVyeS5vYmplY3RJZFsnJG5pbiddID0gYWxsSWRzO1xuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIFJ1bnMgYSBxdWVyeSBvbiB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYSBsaXN0IG9mIGl0ZW1zLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIHNraXAgICAgbnVtYmVyIG9mIHJlc3VsdHMgdG8gc2tpcC5cbiAgLy8gICBsaW1pdCAgIGxpbWl0IHRvIHRoaXMgbnVtYmVyIG9mIHJlc3VsdHMuXG4gIC8vICAgc29ydCAgICBhbiBvYmplY3Qgd2hlcmUga2V5cyBhcmUgdGhlIGZpZWxkcyB0byBzb3J0IGJ5LlxuICAvLyAgICAgICAgICAgdGhlIHZhbHVlIGlzICsxIGZvciBhc2NlbmRpbmcsIC0xIGZvciBkZXNjZW5kaW5nLlxuICAvLyAgIGNvdW50ICAgcnVuIGEgY291bnQgaW5zdGVhZCBvZiByZXR1cm5pbmcgcmVzdWx0cy5cbiAgLy8gICBhY2wgICAgIHJlc3RyaWN0IHRoaXMgb3BlcmF0aW9uIHdpdGggYW4gQUNMIGZvciB0aGUgcHJvdmlkZWQgYXJyYXlcbiAgLy8gICAgICAgICAgIG9mIHVzZXIgb2JqZWN0SWRzIGFuZCByb2xlcy4gYWNsOiBudWxsIG1lYW5zIG5vIHVzZXIuXG4gIC8vICAgICAgICAgICB3aGVuIHRoaXMgZmllbGQgaXMgbm90IHByZXNlbnQsIGRvbid0IGRvIGFueXRoaW5nIHJlZ2FyZGluZyBBQ0xzLlxuICAvLyAgY2FzZUluc2Vuc2l0aXZlIG1ha2Ugc3RyaW5nIGNvbXBhcmlzb25zIGNhc2UgaW5zZW5zaXRpdmVcbiAgLy8gVE9ETzogbWFrZSB1c2VySWRzIG5vdCBuZWVkZWQgaGVyZS4gVGhlIGRiIGFkYXB0ZXIgc2hvdWxkbid0IGtub3dcbiAgLy8gYW55dGhpbmcgYWJvdXQgdXNlcnMsIGlkZWFsbHkuIFRoZW4sIGltcHJvdmUgdGhlIGZvcm1hdCBvZiB0aGUgQUNMXG4gIC8vIGFyZyB0byB3b3JrIGxpa2UgdGhlIG90aGVycy5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIGFjbCxcbiAgICAgIHNvcnQgPSB7fSxcbiAgICAgIGNvdW50LFxuICAgICAga2V5cyxcbiAgICAgIG9wLFxuICAgICAgZGlzdGluY3QsXG4gICAgICBwaXBlbGluZSxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSA9IGZhbHNlLFxuICAgICAgZXhwbGFpbixcbiAgICB9OiBhbnkgPSB7fSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgb3AgPVxuICAgICAgb3AgfHwgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PSAnc3RyaW5nJyAmJiBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAxID8gJ2dldCcgOiAnZmluZCcpO1xuICAgIC8vIENvdW50IG9wZXJhdGlvbiBpZiBjb3VudGluZ1xuICAgIG9wID0gY291bnQgPT09IHRydWUgPyAnY291bnQnIDogb3A7XG5cbiAgICBsZXQgY2xhc3NFeGlzdHMgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAvL0FsbG93IHZvbGF0aWxlIGNsYXNzZXMgaWYgcXVlcnlpbmcgd2l0aCBNYXN0ZXIgKGZvciBfUHVzaFN0YXR1cylcbiAgICAgIC8vVE9ETzogTW92ZSB2b2xhdGlsZSBjbGFzc2VzIGNvbmNlcHQgaW50byBtb25nbyBhZGFwdGVyLCBwb3N0Z3JlcyBhZGFwdGVyIHNob3VsZG4ndCBjYXJlXG4gICAgICAvL3RoYXQgYXBpLnBhcnNlLmNvbSBicmVha3Mgd2hlbiBfUHVzaFN0YXR1cyBleGlzdHMgaW4gbW9uZ28uXG4gICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgaXNNYXN0ZXIpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gQmVoYXZpb3IgZm9yIG5vbi1leGlzdGVudCBjbGFzc2VzIGlzIGtpbmRhIHdlaXJkIG9uIFBhcnNlLmNvbS4gUHJvYmFibHkgZG9lc24ndCBtYXR0ZXIgdG9vIG11Y2guXG4gICAgICAgICAgLy8gRm9yIG5vdywgcHJldGVuZCB0aGUgY2xhc3MgZXhpc3RzIGJ1dCBoYXMgbm8gb2JqZWN0cyxcbiAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xhc3NFeGlzdHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgLy8gUGFyc2UuY29tIHRyZWF0cyBxdWVyaWVzIG9uIF9jcmVhdGVkX2F0IGFuZCBfdXBkYXRlZF9hdCBhcyBpZiB0aGV5IHdlcmUgcXVlcmllcyBvbiBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdCxcbiAgICAgICAgICAvLyBzbyBkdXBsaWNhdGUgdGhhdCBiZWhhdmlvciBoZXJlLiBJZiBib3RoIGFyZSBzcGVjaWZpZWQsIHRoZSBjb3JyZWN0IGJlaGF2aW9yIHRvIG1hdGNoIFBhcnNlLmNvbSBpcyB0b1xuICAgICAgICAgIC8vIHVzZSB0aGUgb25lIHRoYXQgYXBwZWFycyBmaXJzdCBpbiB0aGUgc29ydCBsaXN0LlxuICAgICAgICAgIGlmIChzb3J0Ll9jcmVhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LmNyZWF0ZWRBdCA9IHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHNvcnQuX3VwZGF0ZWRfYXQpIHtcbiAgICAgICAgICAgIHNvcnQudXBkYXRlZEF0ID0gc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBxdWVyeU9wdGlvbnMgPSB7XG4gICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICBzb3J0LFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZTogdGhpcy5vcHRpb25zLmRpc2FibGVDYXNlSW5zZW5zaXRpdml0eSA/IGZhbHNlIDogY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICB9O1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNvcnQpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgQ2Fubm90IHNvcnQgYnkgJHtmaWVsZE5hbWV9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgb3ApXG4gICAgICAgICAgKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWFDb250cm9sbGVyKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHByb3RlY3RlZEZpZWxkcztcbiAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvKiBEb24ndCB1c2UgcHJvamVjdGlvbnMgdG8gb3B0aW1pemUgdGhlIHByb3RlY3RlZEZpZWxkcyBzaW5jZSB0aGUgcHJvdGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICBiYXNlZCBvbiBwb2ludGVyLXBlcm1pc3Npb25zIGFyZSBkZXRlcm1pbmVkIGFmdGVyIHF1ZXJ5aW5nLiBUaGUgZmlsdGVyaW5nIGNhblxuICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlIHRoZSBwcm90ZWN0ZWQgZmllbGRzLiAqL1xuICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHRoaXMuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAnZ2V0Jykge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBpZiAob3AgPT09ICd1cGRhdGUnIHx8IG9wID09PSAnZGVsZXRlJykge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFJlYWRBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgaXNNYXN0ZXIsIGZhbHNlKTtcbiAgICAgICAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY291bnQoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgaGludFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZGlzdGluY3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGlzdGluY3QoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBkaXN0aW5jdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBpcGVsaW5lKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFnZ3JlZ2F0ZShcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHBpcGVsaW5lLFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgICAgICAgZXhwbGFpblxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXhwbGFpbikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgICAgICAgICAgICAgLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpXG4gICAgICAgICAgICAgICAgICAudGhlbihvYmplY3RzID0+XG4gICAgICAgICAgICAgICAgICAgIG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0ID0gdW50cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0XG4gICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBkZWxldGVTY2hlbWEoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsZXQgc2NoZW1hQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLnRoZW4ocyA9PiB7XG4gICAgICAgIHNjaGVtYUNvbnRyb2xsZXIgPSBzO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKChzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZSlcbiAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLmFkYXB0ZXIuY291bnQoY2xhc3NOYW1lLCB7IGZpZWxkczoge30gfSwgbnVsbCwgJycsIGZhbHNlKSlcbiAgICAgICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgICAgICBpZiAoY291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAyNTUsXG4gICAgICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBpcyBub3QgZW1wdHksIGNvbnRhaW5zICR7Y291bnR9IG9iamVjdHMsIGNhbm5vdCBkcm9wIHNjaGVtYS5gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGNsYXNzTmFtZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbih3YXNQYXJzZUNvbGxlY3Rpb24gPT4ge1xuICAgICAgICAgICAgaWYgKHdhc1BhcnNlQ29sbGVjdGlvbikge1xuICAgICAgICAgICAgICBjb25zdCByZWxhdGlvbkZpZWxkTmFtZXMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5maWx0ZXIoXG4gICAgICAgICAgICAgICAgZmllbGROYW1lID0+IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgICAgICAgICByZWxhdGlvbkZpZWxkTmFtZXMubWFwKG5hbWUgPT5cbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwgbmFtZSkpXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIFNjaGVtYUNhY2hlLmRlbChjbGFzc05hbWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyLnJlbG9hZERhdGEoKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFRoaXMgaGVscHMgdG8gY3JlYXRlIGludGVybWVkaWF0ZSBvYmplY3RzIGZvciBzaW1wbGVyIGNvbXBhcmlzb24gb2ZcbiAgLy8ga2V5IHZhbHVlIHBhaXJzIHVzZWQgaW4gcXVlcnkgb2JqZWN0cy4gRWFjaCBrZXkgdmFsdWUgcGFpciB3aWxsIHJlcHJlc2VudGVkXG4gIC8vIGluIGEgc2ltaWxhciB3YXkgdG8ganNvblxuICBvYmplY3RUb0VudHJpZXNTdHJpbmdzKHF1ZXJ5OiBhbnkpOiBBcnJheTxzdHJpbmc+IHtcbiAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMocXVlcnkpLm1hcChhID0+IGEubWFwKHMgPT4gSlNPTi5zdHJpbmdpZnkocykpLmpvaW4oJzonKSk7XG4gIH1cblxuICAvLyBOYWl2ZSBsb2dpYyByZWR1Y2VyIGZvciBPUiBvcGVyYXRpb25zIG1lYW50IHRvIGJlIHVzZWQgb25seSBmb3IgcG9pbnRlciBwZXJtaXNzaW9ucy5cbiAgcmVkdWNlT3JPcGVyYXRpb24ocXVlcnk6IHsgJG9yOiBBcnJheTxhbnk+IH0pOiBhbnkge1xuICAgIGlmICghcXVlcnkuJG9yKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXMgPSBxdWVyeS4kb3IubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBsb25nZXIgcXVlcnkuXG4gICAgICAgICAgICBxdWVyeS4kb3Iuc3BsaWNlKGxvbmdlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcmVwZWF0ID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gd2hpbGUgKHJlcGVhdCk7XG4gICAgaWYgKHF1ZXJ5LiRvci5sZW5ndGggPT09IDEpIHtcbiAgICAgIHF1ZXJ5ID0geyAuLi5xdWVyeSwgLi4ucXVlcnkuJG9yWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJG9yO1xuICAgIH1cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBOYWl2ZSBsb2dpYyByZWR1Y2VyIGZvciBBTkQgb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZUFuZE9wZXJhdGlvbihxdWVyeTogeyAkYW5kOiBBcnJheTxhbnk+IH0pOiBhbnkge1xuICAgIGlmICghcXVlcnkuJGFuZCkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJGFuZC5tYXAocSA9PiB0aGlzLm9iamVjdFRvRW50cmllc1N0cmluZ3MocSkpO1xuICAgIGxldCByZXBlYXQgPSBmYWxzZTtcbiAgICBkbyB7XG4gICAgICByZXBlYXQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcmllcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcXVlcmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IFtzaG9ydGVyLCBsb25nZXJdID0gcXVlcmllc1tpXS5sZW5ndGggPiBxdWVyaWVzW2pdLmxlbmd0aCA/IFtqLCBpXSA6IFtpLCBqXTtcbiAgICAgICAgICBjb25zdCBmb3VuZEVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLnJlZHVjZShcbiAgICAgICAgICAgIChhY2MsIGVudHJ5KSA9PiBhY2MgKyAocXVlcmllc1tsb25nZXJdLmluY2x1ZGVzKGVudHJ5KSA/IDEgOiAwKSxcbiAgICAgICAgICAgIDBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNob3J0ZXJFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5sZW5ndGg7XG4gICAgICAgICAgaWYgKGZvdW5kRW50cmllcyA9PT0gc2hvcnRlckVudHJpZXMpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzaG9ydGVyIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGFpbmVkIGluIHRoZSBsb25nZXIgb25lLCB3ZSBjYW4gc3RyaWtlXG4gICAgICAgICAgICAvLyBvdXQgdGhlIHNob3J0ZXIgcXVlcnkuXG4gICAgICAgICAgICBxdWVyeS4kYW5kLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHF1ZXJpZXMuc3BsaWNlKHNob3J0ZXIsIDEpO1xuICAgICAgICAgICAgcmVwZWF0ID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gd2hpbGUgKHJlcGVhdCk7XG4gICAgaWYgKHF1ZXJ5LiRhbmQubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRhbmRbMF0gfTtcbiAgICAgIGRlbGV0ZSBxdWVyeS4kYW5kO1xuICAgIH1cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBDb25zdHJhaW50cyBxdWVyeSB1c2luZyBDTFAncyBwb2ludGVyIHBlcm1pc3Npb25zIChQUCkgaWYgYW55LlxuICAvLyAxLiBFdHJhY3QgdGhlIHVzZXIgaWQgZnJvbSBjYWxsZXIncyBBQ0xncm91cDtcbiAgLy8gMi4gRXhjdHJhY3QgYSBsaXN0IG9mIGZpZWxkIG5hbWVzIHRoYXQgYXJlIFBQIGZvciB0YXJnZXQgY29sbGVjdGlvbiBhbmQgb3BlcmF0aW9uO1xuICAvLyAzLiBDb25zdHJhaW50IHRoZSBvcmlnaW5hbCBxdWVyeSBzbyB0aGF0IGVhY2ggUFAgZmllbGQgbXVzdFxuICAvLyBwb2ludCB0byBjYWxsZXIncyBpZCAob3IgY29udGFpbiBpdCBpbiBjYXNlIG9mIFBQIGZpZWxkIGJlaW5nIGFuIGFycmF5KVxuICBhZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXVxuICApOiBhbnkge1xuICAgIC8vIENoZWNrIGlmIGNsYXNzIGhhcyBwdWJsaWMgcGVybWlzc2lvbiBmb3Igb3BlcmF0aW9uXG4gICAgLy8gSWYgdGhlIEJhc2VDTFAgcGFzcywgbGV0IGdvIHRocm91Z2hcbiAgICBpZiAoc2NoZW1hLnRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWUsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuXG4gICAgY29uc3QgdXNlckFDTCA9IGFjbEdyb3VwLmZpbHRlcihhY2wgPT4ge1xuICAgICAgcmV0dXJuIGFjbC5pbmRleE9mKCdyb2xlOicpICE9IDAgJiYgYWNsICE9ICcqJztcbiAgICB9KTtcblxuICAgIGNvbnN0IGdyb3VwS2V5ID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMSA/ICdyZWFkVXNlckZpZWxkcycgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIGNvbnN0IHBlcm1GaWVsZHMgPSBbXTtcblxuICAgIGlmIChwZXJtc1tvcGVyYXRpb25dICYmIHBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcykge1xuICAgICAgcGVybUZpZWxkcy5wdXNoKC4uLnBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcyk7XG4gICAgfVxuXG4gICAgaWYgKHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBwZXJtc1tncm91cEtleV0pIHtcbiAgICAgICAgaWYgKCFwZXJtRmllbGRzLmluY2x1ZGVzKGZpZWxkKSkge1xuICAgICAgICAgIHBlcm1GaWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgIGlmIChwZXJtRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICAgIC8vIE5vIHVzZXIgc2V0IHJldHVybiB1bmRlZmluZWRcbiAgICAgIC8vIElmIHRoZSBsZW5ndGggaXMgPiAxLCB0aGF0IG1lYW5zIHdlIGRpZG4ndCBkZS1kdXBlIHVzZXJzIGNvcnJlY3RseVxuICAgICAgaWYgKHVzZXJBQ0wubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdXNlcklkID0gdXNlckFDTFswXTtcbiAgICAgIGNvbnN0IHVzZXJQb2ludGVyID0ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcXVlcmllcyA9IHBlcm1GaWVsZHMubWFwKGtleSA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkRGVzY3JpcHRvciA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgICBjb25zdCBmaWVsZFR5cGUgPVxuICAgICAgICAgIGZpZWxkRGVzY3JpcHRvciAmJlxuICAgICAgICAgIHR5cGVvZiBmaWVsZERlc2NyaXB0b3IgPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkRGVzY3JpcHRvciwgJ3R5cGUnKVxuICAgICAgICAgICAgPyBmaWVsZERlc2NyaXB0b3IudHlwZVxuICAgICAgICAgICAgOiBudWxsO1xuXG4gICAgICAgIGxldCBxdWVyeUNsYXVzZTtcblxuICAgICAgICBpZiAoZmllbGRUeXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciBzaW5nbGUgcG9pbnRlciBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogdXNlclBvaW50ZXIgfTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciB1c2Vycy1hcnJheSBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogeyAkYWxsOiBbdXNlclBvaW50ZXJdIH0gfTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUgPT09ICdPYmplY3QnKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3Igb2JqZWN0IHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB1c2VyUG9pbnRlciB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFRoaXMgbWVhbnMgdGhhdCB0aGVyZSBpcyBhIENMUCBmaWVsZCBvZiBhbiB1bmV4cGVjdGVkIHR5cGUuIFRoaXMgY29uZGl0aW9uIHNob3VsZCBub3QgaGFwcGVuLCB3aGljaCBpc1xuICAgICAgICAgIC8vIHdoeSBpcyBiZWluZyB0cmVhdGVkIGFzIGFuIGVycm9yLlxuICAgICAgICAgIHRocm93IEVycm9yKFxuICAgICAgICAgICAgYEFuIHVuZXhwZWN0ZWQgY29uZGl0aW9uIG9jY3VycmVkIHdoZW4gcmVzb2x2aW5nIHBvaW50ZXIgcGVybWlzc2lvbnM6ICR7Y2xhc3NOYW1lfSAke2tleX1gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBpZiB3ZSBhbHJlYWR5IGhhdmUgYSBjb25zdHJhaW50IG9uIHRoZSBrZXksIHVzZSB0aGUgJGFuZFxuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHF1ZXJ5LCBrZXkpKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlQW5kT3BlcmF0aW9uKHsgJGFuZDogW3F1ZXJ5Q2xhdXNlLCBxdWVyeV0gfSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gb3RoZXJ3aXNlIGp1c3QgYWRkIHRoZSBjb25zdGFpbnRcbiAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCBxdWVyeUNsYXVzZSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHF1ZXJpZXMubGVuZ3RoID09PSAxID8gcXVlcmllc1swXSA6IHRoaXMucmVkdWNlT3JPcGVyYXRpb24oeyAkb3I6IHF1ZXJpZXMgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gIH1cblxuICBhZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIgfCBhbnksXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSA9IHt9LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdLFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIHF1ZXJ5T3B0aW9uczogRnVsbFF1ZXJ5T3B0aW9ucyA9IHt9XG4gICk6IG51bGwgfCBzdHJpbmdbXSB7XG4gICAgY29uc3QgcGVybXMgPVxuICAgICAgc2NoZW1hICYmIHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnNcbiAgICAgICAgPyBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSlcbiAgICAgICAgOiBzY2hlbWE7XG4gICAgaWYgKCFwZXJtcykgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHMgPSBwZXJtcy5wcm90ZWN0ZWRGaWVsZHM7XG4gICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHJldHVybiBudWxsO1xuXG4gICAgaWYgKGFjbEdyb3VwLmluZGV4T2YocXVlcnkub2JqZWN0SWQpID4gLTEpIHJldHVybiBudWxsO1xuXG4gICAgLy8gZm9yIHF1ZXJpZXMgd2hlcmUgXCJrZXlzXCIgYXJlIHNldCBhbmQgZG8gbm90IGluY2x1ZGUgYWxsICd1c2VyRmllbGQnOntmaWVsZH0sXG4gICAgLy8gd2UgaGF2ZSB0byB0cmFuc3BhcmVudGx5IGluY2x1ZGUgaXQsIGFuZCB0aGVuIHJlbW92ZSBiZWZvcmUgcmV0dXJuaW5nIHRvIGNsaWVudFxuICAgIC8vIEJlY2F1c2UgaWYgc3VjaCBrZXkgbm90IHByb2plY3RlZCB0aGUgcGVybWlzc2lvbiB3b24ndCBiZSBlbmZvcmNlZCBwcm9wZXJseVxuICAgIC8vIFBTIHRoaXMgaXMgY2FsbGVkIHdoZW4gJ2V4Y2x1ZGVLZXlzJyBhbHJlYWR5IHJlZHVjZWQgdG8gJ2tleXMnXG4gICAgY29uc3QgcHJlc2VydmVLZXlzID0gcXVlcnlPcHRpb25zLmtleXM7XG5cbiAgICAvLyB0aGVzZSBhcmUga2V5cyB0aGF0IG5lZWQgdG8gYmUgaW5jbHVkZWQgb25seVxuICAgIC8vIHRvIGJlIGFibGUgdG8gYXBwbHkgcHJvdGVjdGVkRmllbGRzIGJ5IHBvaW50ZXJcbiAgICAvLyBhbmQgdGhlbiB1bnNldCBiZWZvcmUgcmV0dXJuaW5nIHRvIGNsaWVudCAobGF0ZXIgaW4gIGZpbHRlclNlbnNpdGl2ZUZpZWxkcylcbiAgICBjb25zdCBzZXJ2ZXJPbmx5S2V5cyA9IFtdO1xuXG4gICAgY29uc3QgYXV0aGVudGljYXRlZCA9IGF1dGgudXNlcjtcblxuICAgIC8vIG1hcCB0byBhbGxvdyBjaGVjayB3aXRob3V0IGFycmF5IHNlYXJjaFxuICAgIGNvbnN0IHJvbGVzID0gKGF1dGgudXNlclJvbGVzIHx8IFtdKS5yZWR1Y2UoKGFjYywgcikgPT4ge1xuICAgICAgYWNjW3JdID0gcHJvdGVjdGVkRmllbGRzW3JdO1xuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCB7fSk7XG5cbiAgICAvLyBhcnJheSBvZiBzZXRzIG9mIHByb3RlY3RlZCBmaWVsZHMuIHNlcGFyYXRlIGl0ZW0gZm9yIGVhY2ggYXBwbGljYWJsZSBjcml0ZXJpYVxuICAgIGNvbnN0IHByb3RlY3RlZEtleXNTZXRzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGtleSBpbiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIHNraXAgdXNlckZpZWxkc1xuICAgICAgaWYgKGtleS5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpIHtcbiAgICAgICAgaWYgKHByZXNlcnZlS2V5cykge1xuICAgICAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGtleS5zdWJzdHJpbmcoMTApO1xuICAgICAgICAgIGlmICghcHJlc2VydmVLZXlzLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICAgIC8vIDEuIHB1dCBpdCB0aGVyZSB0ZW1wb3JhcmlseVxuICAgICAgICAgICAgcXVlcnlPcHRpb25zLmtleXMgJiYgcXVlcnlPcHRpb25zLmtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgLy8gMi4gcHJlc2VydmUgaXQgZGVsZXRlIGxhdGVyXG4gICAgICAgICAgICBzZXJ2ZXJPbmx5S2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBhZGQgcHVibGljIHRpZXJcbiAgICAgIGlmIChrZXkgPT09ICcqJykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHByb3RlY3RlZEZpZWxkc1trZXldKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICAgIGlmIChrZXkgPT09ICdhdXRoZW50aWNhdGVkJykge1xuICAgICAgICAgIC8vIGZvciBsb2dnZWQgaW4gdXNlcnNcbiAgICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHByb3RlY3RlZEZpZWxkc1trZXldKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyb2xlc1trZXldICYmIGtleS5zdGFydHNXaXRoKCdyb2xlOicpKSB7XG4gICAgICAgICAgLy8gYWRkIGFwcGxpY2FibGUgcm9sZXNcbiAgICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHJvbGVzW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gY2hlY2sgaWYgdGhlcmUncyBhIHJ1bGUgZm9yIGN1cnJlbnQgdXNlcidzIGlkXG4gICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9IGF1dGgudXNlci5pZDtcbiAgICAgIGlmIChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSkge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBwcmVzZXJ2ZSBmaWVsZHMgdG8gYmUgcmVtb3ZlZCBiZWZvcmUgc2VuZGluZyByZXNwb25zZSB0byBjbGllbnRcbiAgICBpZiAoc2VydmVyT25seUtleXMubGVuZ3RoID4gMCkge1xuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMgPSBzZXJ2ZXJPbmx5S2V5cztcbiAgICB9XG5cbiAgICBsZXQgcHJvdGVjdGVkS2V5cyA9IHByb3RlY3RlZEtleXNTZXRzLnJlZHVjZSgoYWNjLCBuZXh0KSA9PiB7XG4gICAgICBpZiAobmV4dCkge1xuICAgICAgICBhY2MucHVzaCguLi5uZXh0KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwgW10pO1xuXG4gICAgLy8gaW50ZXJzZWN0IGFsbCBzZXRzIG9mIHByb3RlY3RlZEZpZWxkc1xuICAgIHByb3RlY3RlZEtleXNTZXRzLmZvckVhY2goZmllbGRzID0+IHtcbiAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5cyA9IHByb3RlY3RlZEtleXMuZmlsdGVyKHYgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBwcm90ZWN0ZWRLZXlzO1xuICB9XG5cbiAgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpLnRoZW4odHJhbnNhY3Rpb25hbFNlc3Npb24gPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSB0cmFuc2FjdGlvbmFsU2Vzc2lvbjtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGNvbW1pdCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKS50aGVuKCgpID0+IHtcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgICB9KTtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gYWJvcnQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5hYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKS50aGVuKCgpID0+IHtcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFRPRE86IGNyZWF0ZSBpbmRleGVzIG9uIGZpcnN0IGNyZWF0aW9uIG9mIGEgX1VzZXIgb2JqZWN0LiBPdGhlcndpc2UgaXQncyBpbXBvc3NpYmxlIHRvXG4gIC8vIGhhdmUgYSBQYXJzZSBhcHAgd2l0aG91dCBpdCBoYXZpbmcgYSBfVXNlciBjb2xsZWN0aW9uLlxuICBhc3luYyBwZXJmb3JtSW5pdGlhbGl6YXRpb24oKSB7XG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLnBlcmZvcm1Jbml0aWFsaXphdGlvbih7XG4gICAgICBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzOiBTY2hlbWFDb250cm9sbGVyLlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMsXG4gICAgfSk7XG4gICAgY29uc3QgcmVxdWlyZWRVc2VyRmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX1VzZXIsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgcmVxdWlyZWRSb2xlRmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX1JvbGUsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9JZGVtcG90ZW5jeSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBhd2FpdCB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PiBzY2hlbWEuZW5mb3JjZUNsYXNzRXhpc3RzKCdfVXNlcicpKTtcbiAgICBhd2FpdCB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PiBzY2hlbWEuZW5mb3JjZUNsYXNzRXhpc3RzKCdfUm9sZScpKTtcbiAgICBhd2FpdCB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PiBzY2hlbWEuZW5mb3JjZUNsYXNzRXhpc3RzKCdfSWRlbXBvdGVuY3knKSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlcm5hbWVzOiAnLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcblxuICAgIGlmICghdGhpcy5vcHRpb25zLmRpc2FibGVDYXNlSW5zZW5zaXRpdml0eSkge1xuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLCB0cnVlKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgdXNlcm5hbWUgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG5cbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10sICdjYXNlX2luc2Vuc2l0aXZlX2VtYWlsJywgdHJ1ZSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIGVtYWlsIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VyIGVtYWlsIGFkZHJlc3NlczogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1JvbGUnLCByZXF1aXJlZFJvbGVGaWVsZHMsIFsnbmFtZSddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciByb2xlIG5hbWU6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlVW5pcXVlbmVzcygnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydyZXFJZCddKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgaWRlbXBvdGVuY3kgcmVxdWVzdCBJRDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgaXNNb25nb0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBNb25nb1N0b3JhZ2VBZGFwdGVyO1xuICAgIGNvbnN0IGlzUG9zdGdyZXNBZGFwdGVyID0gdGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiAgICBpZiAoaXNNb25nb0FkYXB0ZXIgfHwgaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgIGxldCBvcHRpb25zID0ge307XG4gICAgICBpZiAoaXNNb25nb0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICB0dGw6IDAsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKGlzUG9zdGdyZXNBZGFwdGVyKSB7XG4gICAgICAgIG9wdGlvbnMgPSB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucztcbiAgICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19JZGVtcG90ZW5jeScsIHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMsIFsnZXhwaXJlJ10sICd0dGwnLCBmYWxzZSwgb3B0aW9ucylcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBUVEwgaW5kZXggZm9yIGlkZW1wb3RlbmN5IGV4cGlyZSBkYXRlOiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIudXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTtcbiAgfVxuXG4gIF9leHBhbmRSZXN1bHRPbktleVBhdGgob2JqZWN0OiBhbnksIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogYW55IHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJy4nKSA8IDApIHtcbiAgICAgIG9iamVjdFtrZXldID0gdmFsdWVba2V5XTtcbiAgICAgIHJldHVybiBvYmplY3Q7XG4gICAgfVxuICAgIGNvbnN0IHBhdGggPSBrZXkuc3BsaXQoJy4nKTtcbiAgICBjb25zdCBmaXJzdEtleSA9IHBhdGhbMF07XG4gICAgY29uc3QgbmV4dFBhdGggPSBwYXRoLnNsaWNlKDEpLmpvaW4oJy4nKTtcblxuICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICBpZiAodGhpcy5vcHRpb25zICYmIHRoaXMub3B0aW9ucy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgICBmb3IgKGNvbnN0IGtleXdvcmQgb2YgdGhpcy5vcHRpb25zLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBVdGlscy5vYmplY3RDb250YWluc0tleVZhbHVlKHsgZmlyc3RLZXk6IHVuZGVmaW5lZCB9LCBrZXl3b3JkLmtleSwgdW5kZWZpbmVkKTtcbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgIGBQcm9oaWJpdGVkIGtleXdvcmQgaW4gcmVxdWVzdCBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGtleXdvcmQpfS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIG9iamVjdFtmaXJzdEtleV0gPSB0aGlzLl9leHBhbmRSZXN1bHRPbktleVBhdGgoXG4gICAgICBvYmplY3RbZmlyc3RLZXldIHx8IHt9LFxuICAgICAgbmV4dFBhdGgsXG4gICAgICB2YWx1ZVtmaXJzdEtleV1cbiAgICApO1xuICAgIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3Q6IGFueSwgcmVzdWx0OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0ge307XG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICAgIH1cbiAgICBPYmplY3Qua2V5cyhvcmlnaW5hbE9iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgY29uc3Qga2V5VXBkYXRlID0gb3JpZ2luYWxPYmplY3Rba2V5XTtcbiAgICAgIC8vIGRldGVybWluZSBpZiB0aGF0IHdhcyBhbiBvcFxuICAgICAgaWYgKFxuICAgICAgICBrZXlVcGRhdGUgJiZcbiAgICAgICAgdHlwZW9mIGtleVVwZGF0ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAga2V5VXBkYXRlLl9fb3AgJiZcbiAgICAgICAgWydBZGQnLCAnQWRkVW5pcXVlJywgJ1JlbW92ZScsICdJbmNyZW1lbnQnXS5pbmRleE9mKGtleVVwZGF0ZS5fX29wKSA+IC0xXG4gICAgICApIHtcbiAgICAgICAgLy8gb25seSB2YWxpZCBvcHMgdGhhdCBwcm9kdWNlIGFuIGFjdGlvbmFibGUgcmVzdWx0XG4gICAgICAgIC8vIHRoZSBvcCBtYXkgaGF2ZSBoYXBwZW5lZCBvbiBhIGtleXBhdGhcbiAgICAgICAgdGhpcy5fZXhwYW5kUmVzdWx0T25LZXlQYXRoKHJlc3BvbnNlLCBrZXksIHJlc3VsdCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gIH1cblxuICBzdGF0aWMgX3ZhbGlkYXRlUXVlcnk6IChhbnksIGJvb2xlYW4sIGJvb2xlYW4pID0+IHZvaWQ7XG4gIHN0YXRpYyBmaWx0ZXJTZW5zaXRpdmVEYXRhOiAoYm9vbGVhbiwgYW55W10sIGFueSwgYW55LCBhbnksIHN0cmluZywgYW55W10sIGFueSkgPT4gdm9pZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBEYXRhYmFzZUNvbnRyb2xsZXI7XG4vLyBFeHBvc2UgdmFsaWRhdGVRdWVyeSBmb3IgdGVzdHNcbm1vZHVsZS5leHBvcnRzLl92YWxpZGF0ZVF1ZXJ5ID0gdmFsaWRhdGVRdWVyeTtcbm1vZHVsZS5leHBvcnRzLmZpbHRlclNlbnNpdGl2ZURhdGEgPSBmaWx0ZXJTZW5zaXRpdmVEYXRhO1xuIl0sIm1hcHBpbmdzIjoiOztBQUtBO0FBRUE7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBd0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFLeEQsU0FBU0EsV0FBVyxDQUFDQyxLQUFLLEVBQUVDLEdBQUcsRUFBRTtFQUMvQixNQUFNQyxRQUFRLEdBQUdDLGVBQUMsQ0FBQ0MsU0FBUyxDQUFDSixLQUFLLENBQUM7RUFDbkM7RUFDQUUsUUFBUSxDQUFDRyxNQUFNLEdBQUc7SUFBRUMsR0FBRyxFQUFFLENBQUMsSUFBSSxFQUFFLEdBQUdMLEdBQUc7RUFBRSxD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