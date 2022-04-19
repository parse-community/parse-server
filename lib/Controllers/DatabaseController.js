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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwibmFtZXMiOlsiYWRkV3JpdGVBQ0wiLCJxdWVyeSIsImFjbCIsIm5ld1F1ZXJ5IiwiXyIsImNsb25lRGVlcCIsIl93cGVybSIsIiRpbiIsImFkZFJlYWRBQ0wiLCJfcnBlcm0iLCJ0cmFuc2Zvcm1PYmplY3RBQ0wiLCJBQ0wiLCJyZXN1bHQiLCJlbnRyeSIsInJlYWQiLCJwdXNoIiwid3JpdGUiLCJzcGVjaWFsUXVlcnlrZXlzIiwiaXNTcGVjaWFsUXVlcnlLZXkiLCJrZXkiLCJpbmRleE9mIiwidmFsaWRhdGVRdWVyeSIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiJG9yIiwiQXJyYXkiLCJmb3JFYWNoIiwiJGFuZCIsIiRub3IiLCJsZW5ndGgiLCJPYmplY3QiLCJrZXlzIiwiJHJlZ2V4IiwiJG9wdGlvbnMiLCJtYXRjaCIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiaXNNYXN0ZXIiLCJhY2xHcm91cCIsImF1dGgiLCJvcGVyYXRpb24iLCJzY2hlbWEiLCJjbGFzc05hbWUiLCJwcm90ZWN0ZWRGaWVsZHMiLCJvYmplY3QiLCJ1c2VySWQiLCJ1c2VyIiwiaWQiLCJwZXJtcyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlzUmVhZE9wZXJhdGlvbiIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtIiwiZmlsdGVyIiwic3RhcnRzV2l0aCIsIm1hcCIsInN1YnN0cmluZyIsInZhbHVlIiwibmV3UHJvdGVjdGVkRmllbGRzIiwib3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMiLCJwb2ludGVyUGVybSIsInBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyIiwicmVhZFVzZXJGaWVsZFZhbHVlIiwiaXNBcnJheSIsInNvbWUiLCJvYmplY3RJZCIsImZpZWxkcyIsInYiLCJpbmNsdWRlcyIsImlzVXNlckNsYXNzIiwiayIsInRlbXBvcmFyeUtleXMiLCJwYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJzZXNzaW9uVG9rZW4iLCJfZW1haWxfdmVyaWZ5X3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3RvbWJzdG9uZSIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIl9wYXNzd29yZF9oaXN0b3J5IiwiYXV0aERhdGEiLCJzcGVjaWFsS2V5c0ZvclVwZGF0ZSIsImlzU3BlY2lhbFVwZGF0ZUtleSIsImpvaW5UYWJsZU5hbWUiLCJmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlIiwiX19vcCIsImFtb3VudCIsIklOVkFMSURfSlNPTiIsIm9iamVjdHMiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwidHJhbnNmb3JtQXV0aERhdGEiLCJwcm92aWRlciIsInByb3ZpZGVyRGF0YSIsImZpZWxkTmFtZSIsInR5cGUiLCJ1bnRyYW5zZm9ybU9iamVjdEFDTCIsIm91dHB1dCIsImdldFJvb3RGaWVsZE5hbWUiLCJzcGxpdCIsInJlbGF0aW9uU2NoZW1hIiwicmVsYXRlZElkIiwib3duaW5nSWQiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFkYXB0ZXIiLCJvcHRpb25zIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwic2NoZW1hUHJvbWlzZSIsIl90cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbGxlY3Rpb25FeGlzdHMiLCJjbGFzc0V4aXN0cyIsInB1cmdlQ29sbGVjdGlvbiIsImxvYWRTY2hlbWEiLCJ0aGVuIiwic2NoZW1hQ29udHJvbGxlciIsImdldE9uZVNjaGVtYSIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwidmFsaWRhdGVDbGFzc05hbWUiLCJTY2hlbWFDb250cm9sbGVyIiwiY2xhc3NOYW1lSXNWYWxpZCIsIlByb21pc2UiLCJyZWplY3QiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJyZXNvbHZlIiwiY2xlYXJDYWNoZSIsImxvYWQiLCJsb2FkU2NoZW1hSWZOZWVkZWQiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInQiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsInVuZGVmaW5lZCIsInMiLCJjYW5BZGRGaWVsZCIsInVwZGF0ZSIsIm1hbnkiLCJ1cHNlcnQiLCJhZGRzRmllbGQiLCJza2lwU2FuaXRpemF0aW9uIiwidmFsaWRhdGVPbmx5IiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwib3JpZ2luYWxRdWVyeSIsIm9yaWdpbmFsVXBkYXRlIiwicmVsYXRpb25VcGRhdGVzIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiY29sbGVjdFJlbGF0aW9uVXBkYXRlcyIsImFkZFBvaW50ZXJQZXJtaXNzaW9ucyIsImNhdGNoIiwiZXJyb3IiLCJyb290RmllbGROYW1lIiwiZmllbGROYW1lSXNWYWxpZCIsInVwZGF0ZU9wZXJhdGlvbiIsImlubmVyS2V5IiwiSU5WQUxJRF9ORVNURURfS0VZIiwiZmluZCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwc2VydE9uZU9iamVjdCIsImZpbmRPbmVBbmRVcGRhdGUiLCJoYW5kbGVSZWxhdGlvblVwZGF0ZXMiLCJfc2FuaXRpemVEYXRhYmFzZVJlc3VsdCIsIm9wcyIsImRlbGV0ZU1lIiwicHJvY2VzcyIsIm9wIiwieCIsInBlbmRpbmciLCJhZGRSZWxhdGlvbiIsInJlbW92ZVJlbGF0aW9uIiwiYWxsIiwiZnJvbUNsYXNzTmFtZSIsImZyb21JZCIsInRvSWQiLCJkb2MiLCJjb2RlIiwiZGVzdHJveSIsInBhcnNlRm9ybWF0U2NoZW1hIiwiY3JlYXRlIiwib3JpZ2luYWxPYmplY3QiLCJjcmVhdGVkQXQiLCJpc28iLCJfX3R5cGUiLCJ1cGRhdGVkQXQiLCJlbmZvcmNlQ2xhc3NFeGlzdHMiLCJjcmVhdGVPYmplY3QiLCJjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hIiwiY2xhc3NTY2hlbWEiLCJzY2hlbWFEYXRhIiwic2NoZW1hRmllbGRzIiwibmV3S2V5cyIsImZpZWxkIiwiYWN0aW9uIiwiZGVsZXRlRXZlcnl0aGluZyIsImZhc3QiLCJTY2hlbWFDYWNoZSIsImNsZWFyIiwiZGVsZXRlQWxsQ2xhc3NlcyIsInJlbGF0ZWRJZHMiLCJxdWVyeU9wdGlvbnMiLCJza2lwIiwibGltaXQiLCJzb3J0IiwiZmluZE9wdGlvbnMiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwiX2lkIiwicmVzdWx0cyIsIm93bmluZ0lkcyIsInJlZHVjZUluUmVsYXRpb24iLCJvcnMiLCJhUXVlcnkiLCJpbmRleCIsImFuZHMiLCJwcm9taXNlcyIsInF1ZXJpZXMiLCJjb25zdHJhaW50S2V5IiwiaXNOZWdhdGlvbiIsInIiLCJxIiwiaWRzIiwiYWRkTm90SW5PYmplY3RJZHNJZHMiLCJhZGRJbk9iamVjdElkc0lkcyIsInJlZHVjZVJlbGF0aW9uS2V5cyIsInJlbGF0ZWRUbyIsImlkc0Zyb21TdHJpbmciLCJpZHNGcm9tRXEiLCJpZHNGcm9tSW4iLCJhbGxJZHMiLCJsaXN0IiwidG90YWxMZW5ndGgiLCJyZWR1Y2UiLCJtZW1vIiwiaWRzSW50ZXJzZWN0aW9uIiwiaW50ZXJzZWN0IiwiYmlnIiwiJGVxIiwiaWRzRnJvbU5pbiIsIlNldCIsIiRuaW4iLCJjb3VudCIsImRpc3RpbmN0IiwicGlwZWxpbmUiLCJyZWFkUHJlZmVyZW5jZSIsImhpbnQiLCJjYXNlSW5zZW5zaXRpdmUiLCJleHBsYWluIiwiX2NyZWF0ZWRfYXQiLCJfdXBkYXRlZF9hdCIsImFkZFByb3RlY3RlZEZpZWxkcyIsImFnZ3JlZ2F0ZSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImRlbGV0ZVNjaGVtYSIsImRlbGV0ZUNsYXNzIiwid2FzUGFyc2VDb2xsZWN0aW9uIiwicmVsYXRpb25GaWVsZE5hbWVzIiwibmFtZSIsImRlbCIsInJlbG9hZERhdGEiLCJvYmplY3RUb0VudHJpZXNTdHJpbmdzIiwiZW50cmllcyIsImEiLCJKU09OIiwic3RyaW5naWZ5Iiwiam9pbiIsInJlZHVjZU9yT3BlcmF0aW9uIiwicmVwZWF0IiwiaSIsImoiLCJzaG9ydGVyIiwibG9uZ2VyIiwiZm91bmRFbnRyaWVzIiwiYWNjIiwic2hvcnRlckVudHJpZXMiLCJzcGxpY2UiLCJyZWR1Y2VBbmRPcGVyYXRpb24iLCJ0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUiLCJ1c2VyQUNMIiwiZ3JvdXBLZXkiLCJwZXJtRmllbGRzIiwicG9pbnRlckZpZWxkcyIsInVzZXJQb2ludGVyIiwiZmllbGREZXNjcmlwdG9yIiwiZmllbGRUeXBlIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwicXVlcnlDbGF1c2UiLCIkYWxsIiwiYXNzaWduIiwicHJlc2VydmVLZXlzIiwic2VydmVyT25seUtleXMiLCJhdXRoZW50aWNhdGVkIiwicm9sZXMiLCJ1c2VyUm9sZXMiLCJwcm90ZWN0ZWRLZXlzU2V0cyIsInByb3RlY3RlZEtleXMiLCJuZXh0IiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJyZXF1aXJlZFVzZXJGaWVsZHMiLCJkZWZhdWx0Q29sdW1ucyIsIl9EZWZhdWx0IiwiX1VzZXIiLCJyZXF1aXJlZFJvbGVGaWVsZHMiLCJfUm9sZSIsInJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMiLCJfSWRlbXBvdGVuY3kiLCJlbnN1cmVVbmlxdWVuZXNzIiwibG9nZ2VyIiwid2FybiIsImVuc3VyZUluZGV4IiwiaXNNb25nb0FkYXB0ZXIiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiaXNQb3N0Z3Jlc0FkYXB0ZXIiLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwidHRsIiwic2V0SWRlbXBvdGVuY3lGdW5jdGlvbiIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwiX2V4cGFuZFJlc3VsdE9uS2V5UGF0aCIsInBhdGgiLCJmaXJzdEtleSIsIm5leHRQYXRoIiwic2xpY2UiLCJyZXF1ZXN0S2V5d29yZERlbnlsaXN0Iiwia2V5d29yZCIsIlV0aWxzIiwib2JqZWN0Q29udGFpbnNLZXlWYWx1ZSIsInJlc3BvbnNlIiwia2V5VXBkYXRlIiwibW9kdWxlIiwiZXhwb3J0cyIsIl92YWxpZGF0ZVF1ZXJ5Il0sIm1hcHBpbmdzIjoiOztBQUtBOztBQUVBOztBQUVBOztBQUVBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFLQSxTQUFTQSxXQUFULENBQXFCQyxLQUFyQixFQUE0QkMsR0FBNUIsRUFBaUM7QUFDL0IsUUFBTUMsUUFBUSxHQUFHQyxnQkFBRUMsU0FBRixDQUFZSixLQUFaLENBQWpCLENBRCtCLENBRS9COzs7QUFDQUUsRUFBQUEsUUFBUSxDQUFDRyxNQUFULEdBQWtCO0FBQUVDLElBQUFBLEdBQUcsRUFBRSxDQUFDLElBQUQsRUFBTyxHQUFHTCxHQUFWO0FBQVAsR0FBbEI7QUFDQSxTQUFPQyxRQUFQO0FBQ0Q7O0FBRUQsU0FBU0ssVUFBVCxDQUFvQlAsS0FBcEIsRUFBMkJDLEdBQTNCLEVBQWdDO0FBQzlCLFFBQU1DLFFBQVEsR0FBR0MsZ0JBQUVDLFNBQUYsQ0FBWUosS0FBWixDQUFqQixDQUQ4QixDQUU5Qjs7O0FBQ0FFLEVBQUFBLFFBQVEsQ0FBQ00sTUFBVCxHQUFrQjtBQUFFRixJQUFBQSxHQUFHLEVBQUUsQ0FBQyxJQUFELEVBQU8sR0FBUCxFQUFZLEdBQUdMLEdBQWY7QUFBUCxHQUFsQjtBQUNBLFNBQU9DLFFBQVA7QUFDRCxDLENBRUQ7OztBQUNBLE1BQU1PLGtCQUFrQixHQUFHLFFBQXdCO0FBQUEsTUFBdkI7QUFBRUMsSUFBQUE7QUFBRixHQUF1QjtBQUFBLE1BQWJDLE1BQWE7O0FBQ2pELE1BQUksQ0FBQ0QsR0FBTCxFQUFVO0FBQ1IsV0FBT0MsTUFBUDtBQUNEOztBQUVEQSxFQUFBQSxNQUFNLENBQUNOLE1BQVAsR0FBZ0IsRUFBaEI7QUFDQU0sRUFBQUEsTUFBTSxDQUFDSCxNQUFQLEdBQWdCLEVBQWhCOztBQUVBLE9BQUssTUFBTUksS0FBWCxJQUFvQkYsR0FBcEIsRUFBeUI7QUFDdkIsUUFBSUEsR0FBRyxDQUFDRSxLQUFELENBQUgsQ0FBV0MsSUFBZixFQUFxQjtBQUNuQkYsTUFBQUEsTUFBTSxDQUFDSCxNQUFQLENBQWNNLElBQWQsQ0FBbUJGLEtBQW5CO0FBQ0Q7O0FBQ0QsUUFBSUYsR0FBRyxDQUFDRSxLQUFELENBQUgsQ0FBV0csS0FBZixFQUFzQjtBQUNwQkosTUFBQUEsTUFBTSxDQUFDTixNQUFQLENBQWNTLElBQWQsQ0FBbUJGLEtBQW5CO0FBQ0Q7QUFDRjs7QUFDRCxTQUFPRCxNQUFQO0FBQ0QsQ0FqQkQ7O0FBbUJBLE1BQU1LLGdCQUFnQixHQUFHLENBQ3ZCLE1BRHVCLEVBRXZCLEtBRnVCLEVBR3ZCLE1BSHVCLEVBSXZCLFFBSnVCLEVBS3ZCLFFBTHVCLEVBTXZCLG1CQU51QixFQU92QixxQkFQdUIsRUFRdkIsZ0NBUnVCLEVBU3ZCLDZCQVR1QixFQVV2QixxQkFWdUIsQ0FBekI7O0FBYUEsTUFBTUMsaUJBQWlCLEdBQUdDLEdBQUcsSUFBSTtBQUMvQixTQUFPRixnQkFBZ0IsQ0FBQ0csT0FBakIsQ0FBeUJELEdBQXpCLEtBQWlDLENBQXhDO0FBQ0QsQ0FGRDs7QUFJQSxNQUFNRSxhQUFhLEdBQUlwQixLQUFELElBQXNCO0FBQzFDLE1BQUlBLEtBQUssQ0FBQ1UsR0FBVixFQUFlO0FBQ2IsVUFBTSxJQUFJVyxZQUFNQyxLQUFWLENBQWdCRCxZQUFNQyxLQUFOLENBQVlDLGFBQTVCLEVBQTJDLHNCQUEzQyxDQUFOO0FBQ0Q7O0FBRUQsTUFBSXZCLEtBQUssQ0FBQ3dCLEdBQVYsRUFBZTtBQUNiLFFBQUl4QixLQUFLLENBQUN3QixHQUFOLFlBQXFCQyxLQUF6QixFQUFnQztBQUM5QnpCLE1BQUFBLEtBQUssQ0FBQ3dCLEdBQU4sQ0FBVUUsT0FBVixDQUFrQk4sYUFBbEI7QUFDRCxLQUZELE1BRU87QUFDTCxZQUFNLElBQUlDLFlBQU1DLEtBQVYsQ0FBZ0JELFlBQU1DLEtBQU4sQ0FBWUMsYUFBNUIsRUFBMkMsc0NBQTNDLENBQU47QUFDRDtBQUNGOztBQUVELE1BQUl2QixLQUFLLENBQUMyQixJQUFWLEVBQWdCO0FBQ2QsUUFBSTNCLEtBQUssQ0FBQzJCLElBQU4sWUFBc0JGLEtBQTFCLEVBQWlDO0FBQy9CekIsTUFBQUEsS0FBSyxDQUFDMkIsSUFBTixDQUFXRCxPQUFYLENBQW1CTixhQUFuQjtBQUNELEtBRkQsTUFFTztBQUNMLFlBQU0sSUFBSUMsWUFBTUMsS0FBVixDQUFnQkQsWUFBTUMsS0FBTixDQUFZQyxhQUE1QixFQUEyQyx1Q0FBM0MsQ0FBTjtBQUNEO0FBQ0Y7O0FBRUQsTUFBSXZCLEtBQUssQ0FBQzRCLElBQVYsRUFBZ0I7QUFDZCxRQUFJNUIsS0FBSyxDQUFDNEIsSUFBTixZQUFzQkgsS0FBdEIsSUFBK0J6QixLQUFLLENBQUM0QixJQUFOLENBQVdDLE1BQVgsR0FBb0IsQ0FBdkQsRUFBMEQ7QUFDeEQ3QixNQUFBQSxLQUFLLENBQUM0QixJQUFOLENBQVdGLE9BQVgsQ0FBbUJOLGFBQW5CO0FBQ0QsS0FGRCxNQUVPO0FBQ0wsWUFBTSxJQUFJQyxZQUFNQyxLQUFWLENBQ0pELFlBQU1DLEtBQU4sQ0FBWUMsYUFEUixFQUVKLHFEQUZJLENBQU47QUFJRDtBQUNGOztBQUVETyxFQUFBQSxNQUFNLENBQUNDLElBQVAsQ0FBWS9CLEtBQVosRUFBbUIwQixPQUFuQixDQUEyQlIsR0FBRyxJQUFJO0FBQ2hDLFFBQUlsQixLQUFLLElBQUlBLEtBQUssQ0FBQ2tCLEdBQUQsQ0FBZCxJQUF1QmxCLEtBQUssQ0FBQ2tCLEdBQUQsQ0FBTCxDQUFXYyxNQUF0QyxFQUE4QztBQUM1QyxVQUFJLE9BQU9oQyxLQUFLLENBQUNrQixHQUFELENBQUwsQ0FBV2UsUUFBbEIsS0FBK0IsUUFBbkMsRUFBNkM7QUFDM0MsWUFBSSxDQUFDakMsS0FBSyxDQUFDa0IsR0FBRCxDQUFMLENBQVdlLFFBQVgsQ0FBb0JDLEtBQXBCLENBQTBCLFdBQTFCLENBQUwsRUFBNkM7QUFDM0MsZ0JBQU0sSUFBSWIsWUFBTUMsS0FBVixDQUNKRCxZQUFNQyxLQUFOLENBQVlDLGFBRFIsRUFFSCxpQ0FBZ0N2QixLQUFLLENBQUNrQixHQUFELENBQUwsQ0FBV2UsUUFBUyxFQUZqRCxDQUFOO0FBSUQ7QUFDRjtBQUNGOztBQUNELFFBQUksQ0FBQ2hCLGlCQUFpQixDQUFDQyxHQUFELENBQWxCLElBQTJCLENBQUNBLEdBQUcsQ0FBQ2dCLEtBQUosQ0FBVSwyQkFBVixDQUFoQyxFQUF3RTtBQUN0RSxZQUFNLElBQUliLFlBQU1DLEtBQVYsQ0FBZ0JELFlBQU1DLEtBQU4sQ0FBWWEsZ0JBQTVCLEVBQStDLHFCQUFvQmpCLEdBQUksRUFBdkUsQ0FBTjtBQUNEO0FBQ0YsR0FkRDtBQWVELENBL0NELEMsQ0FpREE7OztBQUNBLE1BQU1rQixtQkFBbUIsR0FBRyxDQUMxQkMsUUFEMEIsRUFFMUJDLFFBRjBCLEVBRzFCQyxJQUgwQixFQUkxQkMsU0FKMEIsRUFLMUJDLE1BTDBCLEVBTTFCQyxTQU4wQixFQU8xQkMsZUFQMEIsRUFRMUJDLE1BUjBCLEtBU3ZCO0FBQ0gsTUFBSUMsTUFBTSxHQUFHLElBQWI7QUFDQSxNQUFJTixJQUFJLElBQUlBLElBQUksQ0FBQ08sSUFBakIsRUFBdUJELE1BQU0sR0FBR04sSUFBSSxDQUFDTyxJQUFMLENBQVVDLEVBQW5CLENBRnBCLENBSUg7O0FBQ0EsUUFBTUMsS0FBSyxHQUFHUCxNQUFNLENBQUNRLHdCQUFQLENBQWdDUCxTQUFoQyxDQUFkOztBQUNBLE1BQUlNLEtBQUosRUFBVztBQUNULFVBQU1FLGVBQWUsR0FBRyxDQUFDLEtBQUQsRUFBUSxNQUFSLEVBQWdCL0IsT0FBaEIsQ0FBd0JxQixTQUF4QixJQUFxQyxDQUFDLENBQTlEOztBQUVBLFFBQUlVLGVBQWUsSUFBSUYsS0FBSyxDQUFDTCxlQUE3QixFQUE4QztBQUM1QztBQUNBLFlBQU1RLDBCQUEwQixHQUFHckIsTUFBTSxDQUFDQyxJQUFQLENBQVlpQixLQUFLLENBQUNMLGVBQWxCLEVBQ2hDUyxNQURnQyxDQUN6QmxDLEdBQUcsSUFBSUEsR0FBRyxDQUFDbUMsVUFBSixDQUFlLFlBQWYsQ0FEa0IsRUFFaENDLEdBRmdDLENBRTVCcEMsR0FBRyxJQUFJO0FBQ1YsZUFBTztBQUFFQSxVQUFBQSxHQUFHLEVBQUVBLEdBQUcsQ0FBQ3FDLFNBQUosQ0FBYyxFQUFkLENBQVA7QUFBMEJDLFVBQUFBLEtBQUssRUFBRVIsS0FBSyxDQUFDTCxlQUFOLENBQXNCekIsR0FBdEI7QUFBakMsU0FBUDtBQUNELE9BSmdDLENBQW5DO0FBTUEsWUFBTXVDLGtCQUFtQyxHQUFHLEVBQTVDO0FBQ0EsVUFBSUMsdUJBQXVCLEdBQUcsS0FBOUIsQ0FUNEMsQ0FXNUM7O0FBQ0FQLE1BQUFBLDBCQUEwQixDQUFDekIsT0FBM0IsQ0FBbUNpQyxXQUFXLElBQUk7QUFDaEQsWUFBSUMsdUJBQXVCLEdBQUcsS0FBOUI7QUFDQSxjQUFNQyxrQkFBa0IsR0FBR2pCLE1BQU0sQ0FBQ2UsV0FBVyxDQUFDekMsR0FBYixDQUFqQzs7QUFDQSxZQUFJMkMsa0JBQUosRUFBd0I7QUFDdEIsY0FBSXBDLEtBQUssQ0FBQ3FDLE9BQU4sQ0FBY0Qsa0JBQWQsQ0FBSixFQUF1QztBQUNyQ0QsWUFBQUEsdUJBQXVCLEdBQUdDLGtCQUFrQixDQUFDRSxJQUFuQixDQUN4QmpCLElBQUksSUFBSUEsSUFBSSxDQUFDa0IsUUFBTCxJQUFpQmxCLElBQUksQ0FBQ2tCLFFBQUwsS0FBa0JuQixNQURuQixDQUExQjtBQUdELFdBSkQsTUFJTztBQUNMZSxZQUFBQSx1QkFBdUIsR0FDckJDLGtCQUFrQixDQUFDRyxRQUFuQixJQUErQkgsa0JBQWtCLENBQUNHLFFBQW5CLEtBQWdDbkIsTUFEakU7QUFFRDtBQUNGOztBQUVELFlBQUllLHVCQUFKLEVBQTZCO0FBQzNCRixVQUFBQSx1QkFBdUIsR0FBRyxJQUExQjtBQUNBRCxVQUFBQSxrQkFBa0IsQ0FBQzNDLElBQW5CLENBQXdCNkMsV0FBVyxDQUFDSCxLQUFwQztBQUNEO0FBQ0YsT0FsQkQsRUFaNEMsQ0FnQzVDO0FBQ0E7QUFDQTs7QUFDQSxVQUFJRSx1QkFBdUIsSUFBSWYsZUFBL0IsRUFBZ0Q7QUFDOUNjLFFBQUFBLGtCQUFrQixDQUFDM0MsSUFBbkIsQ0FBd0I2QixlQUF4QjtBQUNELE9BckMyQyxDQXNDNUM7OztBQUNBYyxNQUFBQSxrQkFBa0IsQ0FBQy9CLE9BQW5CLENBQTJCdUMsTUFBTSxJQUFJO0FBQ25DLFlBQUlBLE1BQUosRUFBWTtBQUNWO0FBQ0E7QUFDQSxjQUFJLENBQUN0QixlQUFMLEVBQXNCO0FBQ3BCQSxZQUFBQSxlQUFlLEdBQUdzQixNQUFsQjtBQUNELFdBRkQsTUFFTztBQUNMdEIsWUFBQUEsZUFBZSxHQUFHQSxlQUFlLENBQUNTLE1BQWhCLENBQXVCYyxDQUFDLElBQUlELE1BQU0sQ0FBQ0UsUUFBUCxDQUFnQkQsQ0FBaEIsQ0FBNUIsQ0FBbEI7QUFDRDtBQUNGO0FBQ0YsT0FWRDtBQVdEO0FBQ0Y7O0FBRUQsUUFBTUUsV0FBVyxHQUFHMUIsU0FBUyxLQUFLLE9BQWxDO0FBRUE7QUFDRjs7QUFDRSxNQUFJLEVBQUUwQixXQUFXLElBQUl2QixNQUFmLElBQXlCRCxNQUFNLENBQUNvQixRQUFQLEtBQW9CbkIsTUFBL0MsQ0FBSixFQUE0RDtBQUMxREYsSUFBQUEsZUFBZSxJQUFJQSxlQUFlLENBQUNqQixPQUFoQixDQUF3QjJDLENBQUMsSUFBSSxPQUFPekIsTUFBTSxDQUFDeUIsQ0FBRCxDQUExQyxDQUFuQixDQUQwRCxDQUcxRDtBQUNBOztBQUNBckIsSUFBQUEsS0FBSyxDQUFDTCxlQUFOLElBQ0VLLEtBQUssQ0FBQ0wsZUFBTixDQUFzQjJCLGFBRHhCLElBRUV0QixLQUFLLENBQUNMLGVBQU4sQ0FBc0IyQixhQUF0QixDQUFvQzVDLE9BQXBDLENBQTRDMkMsQ0FBQyxJQUFJLE9BQU96QixNQUFNLENBQUN5QixDQUFELENBQTlELENBRkY7QUFHRDs7QUFFRCxNQUFJLENBQUNELFdBQUwsRUFBa0I7QUFDaEIsV0FBT3hCLE1BQVA7QUFDRDs7QUFFREEsRUFBQUEsTUFBTSxDQUFDMkIsUUFBUCxHQUFrQjNCLE1BQU0sQ0FBQzRCLGdCQUF6QjtBQUNBLFNBQU81QixNQUFNLENBQUM0QixnQkFBZDtBQUVBLFNBQU81QixNQUFNLENBQUM2QixZQUFkOztBQUVBLE1BQUlwQyxRQUFKLEVBQWM7QUFDWixXQUFPTyxNQUFQO0FBQ0Q7O0FBQ0QsU0FBT0EsTUFBTSxDQUFDOEIsbUJBQWQ7QUFDQSxTQUFPOUIsTUFBTSxDQUFDK0IsaUJBQWQ7QUFDQSxTQUFPL0IsTUFBTSxDQUFDZ0MsNEJBQWQ7QUFDQSxTQUFPaEMsTUFBTSxDQUFDaUMsVUFBZDtBQUNBLFNBQU9qQyxNQUFNLENBQUNrQyw4QkFBZDtBQUNBLFNBQU9sQyxNQUFNLENBQUNtQyxtQkFBZDtBQUNBLFNBQU9uQyxNQUFNLENBQUNvQywyQkFBZDtBQUNBLFNBQU9wQyxNQUFNLENBQUNxQyxvQkFBZDtBQUNBLFNBQU9yQyxNQUFNLENBQUNzQyxpQkFBZDs7QUFFQSxNQUFJNUMsUUFBUSxDQUFDbkIsT0FBVCxDQUFpQnlCLE1BQU0sQ0FBQ29CLFFBQXhCLElBQW9DLENBQUMsQ0FBekMsRUFBNEM7QUFDMUMsV0FBT3BCLE1BQVA7QUFDRDs7QUFDRCxTQUFPQSxNQUFNLENBQUN1QyxRQUFkO0FBQ0EsU0FBT3ZDLE1BQVA7QUFDRCxDQWhIRCxDLENBa0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNBLE1BQU13QyxvQkFBb0IsR0FBRyxDQUMzQixrQkFEMkIsRUFFM0IsbUJBRjJCLEVBRzNCLHFCQUgyQixFQUkzQixnQ0FKMkIsRUFLM0IsNkJBTDJCLEVBTTNCLHFCQU4yQixFQU8zQiw4QkFQMkIsRUFRM0Isc0JBUjJCLEVBUzNCLG1CQVQyQixDQUE3Qjs7QUFZQSxNQUFNQyxrQkFBa0IsR0FBR25FLEdBQUcsSUFBSTtBQUNoQyxTQUFPa0Usb0JBQW9CLENBQUNqRSxPQUFyQixDQUE2QkQsR0FBN0IsS0FBcUMsQ0FBNUM7QUFDRCxDQUZEOztBQUlBLFNBQVNvRSxhQUFULENBQXVCNUMsU0FBdkIsRUFBa0N4QixHQUFsQyxFQUF1QztBQUNyQyxTQUFRLFNBQVFBLEdBQUksSUFBR3dCLFNBQVUsRUFBakM7QUFDRDs7QUFFRCxNQUFNNkMsK0JBQStCLEdBQUczQyxNQUFNLElBQUk7QUFDaEQsT0FBSyxNQUFNMUIsR0FBWCxJQUFrQjBCLE1BQWxCLEVBQTBCO0FBQ3hCLFFBQUlBLE1BQU0sQ0FBQzFCLEdBQUQsQ0FBTixJQUFlMEIsTUFBTSxDQUFDMUIsR0FBRCxDQUFOLENBQVlzRSxJQUEvQixFQUFxQztBQUNuQyxjQUFRNUMsTUFBTSxDQUFDMUIsR0FBRCxDQUFOLENBQVlzRSxJQUFwQjtBQUNFLGFBQUssV0FBTDtBQUNFLGNBQUksT0FBTzVDLE1BQU0sQ0FBQzFCLEdBQUQsQ0FBTixDQUFZdUUsTUFBbkIsS0FBOEIsUUFBbEMsRUFBNEM7QUFDMUMsa0JBQU0sSUFBSXBFLFlBQU1DLEtBQVYsQ0FBZ0JELFlBQU1DLEtBQU4sQ0FBWW9FLFlBQTVCLEVBQTBDLGlDQUExQyxDQUFOO0FBQ0Q7O0FBQ0Q5QyxVQUFBQSxNQUFNLENBQUMxQixHQUFELENBQU4sR0FBYzBCLE1BQU0sQ0FBQzFCLEdBQUQsQ0FBTixDQUFZdUUsTUFBMUI7QUFDQTs7QUFDRixhQUFLLEtBQUw7QUFDRSxjQUFJLEVBQUU3QyxNQUFNLENBQUMxQixHQUFELENBQU4sQ0FBWXlFLE9BQVosWUFBK0JsRSxLQUFqQyxDQUFKLEVBQTZDO0FBQzNDLGtCQUFNLElBQUlKLFlBQU1DLEtBQVYsQ0FBZ0JELFlBQU1DLEtBQU4sQ0FBWW9FLFlBQTVCLEVBQTBDLGlDQUExQyxDQUFOO0FBQ0Q7O0FBQ0Q5QyxVQUFBQSxNQUFNLENBQUMxQixHQUFELENBQU4sR0FBYzBCLE1BQU0sQ0FBQzFCLEdBQUQsQ0FBTixDQUFZeUUsT0FBMUI7QUFDQTs7QUFDRixhQUFLLFdBQUw7QUFDRSxjQUFJLEVBQUUvQyxNQUFNLENBQUMxQixHQUFELENBQU4sQ0FBWXlFLE9BQVosWUFBK0JsRSxLQUFqQyxDQUFKLEVBQTZDO0FBQzNDLGtCQUFNLElBQUlKLFlBQU1DLEtBQVYsQ0FBZ0JELFlBQU1DLEtBQU4sQ0FBWW9FLFlBQTVCLEVBQTBDLGlDQUExQyxDQUFOO0FBQ0Q7O0FBQ0Q5QyxVQUFBQSxNQUFNLENBQUMxQixHQUFELENBQU4sR0FBYzBCLE1BQU0sQ0FBQzFCLEdBQUQsQ0FBTixDQUFZeUUsT0FBMUI7QUFDQTs7QUFDRixhQUFLLFFBQUw7QUFDRSxjQUFJLEVBQUUvQyxNQUFNLENBQUMxQixHQUFELENBQU4sQ0FBWXlFLE9BQVosWUFBK0JsRSxLQUFqQyxDQUFKLEVBQTZDO0FBQzNDLGtCQUFNLElBQUlKLFlBQU1DLEtBQVYsQ0FBZ0JELFlBQU1DLEtBQU4sQ0FBWW9FLFlBQTVCLEVBQTBDLGlDQUExQyxDQUFOO0FBQ0Q7O0FBQ0Q5QyxVQUFBQSxNQUFNLENBQUMxQixHQUFELENBQU4sR0FBYyxFQUFkO0FBQ0E7O0FBQ0YsYUFBSyxRQUFMO0FBQ0UsaUJBQU8wQixNQUFNLENBQUMxQixHQUFELENBQWI7QUFDQTs7QUFDRjtBQUNFLGdCQUFNLElBQUlHLFlBQU1DLEtBQVYsQ0FDSkQsWUFBTUMsS0FBTixDQUFZc0UsbUJBRFIsRUFFSCxPQUFNaEQsTUFBTSxDQUFDMUIsR0FBRCxDQUFOLENBQVlzRSxJQUFLLGlDQUZwQixDQUFOO0FBN0JKO0FBa0NEO0FBQ0Y7QUFDRixDQXZDRDs7QUF5Q0EsTUFBTUssaUJBQWlCLEdBQUcsQ0FBQ25ELFNBQUQsRUFBWUUsTUFBWixFQUFvQkgsTUFBcEIsS0FBK0I7QUFDdkQsTUFBSUcsTUFBTSxDQUFDdUMsUUFBUCxJQUFtQnpDLFNBQVMsS0FBSyxPQUFyQyxFQUE4QztBQUM1Q1osSUFBQUEsTUFBTSxDQUFDQyxJQUFQLENBQVlhLE1BQU0sQ0FBQ3VDLFFBQW5CLEVBQTZCekQsT0FBN0IsQ0FBcUNvRSxRQUFRLElBQUk7QUFDL0MsWUFBTUMsWUFBWSxHQUFHbkQsTUFBTSxDQUFDdUMsUUFBUCxDQUFnQlcsUUFBaEIsQ0FBckI7QUFDQSxZQUFNRSxTQUFTLEdBQUksY0FBYUYsUUFBUyxFQUF6Qzs7QUFDQSxVQUFJQyxZQUFZLElBQUksSUFBcEIsRUFBMEI7QUFDeEJuRCxRQUFBQSxNQUFNLENBQUNvRCxTQUFELENBQU4sR0FBb0I7QUFDbEJSLFVBQUFBLElBQUksRUFBRTtBQURZLFNBQXBCO0FBR0QsT0FKRCxNQUlPO0FBQ0w1QyxRQUFBQSxNQUFNLENBQUNvRCxTQUFELENBQU4sR0FBb0JELFlBQXBCO0FBQ0F0RCxRQUFBQSxNQUFNLENBQUN3QixNQUFQLENBQWMrQixTQUFkLElBQTJCO0FBQUVDLFVBQUFBLElBQUksRUFBRTtBQUFSLFNBQTNCO0FBQ0Q7QUFDRixLQVhEO0FBWUEsV0FBT3JELE1BQU0sQ0FBQ3VDLFFBQWQ7QUFDRDtBQUNGLENBaEJELEMsQ0FpQkE7OztBQUNBLE1BQU1lLG9CQUFvQixHQUFHLFNBQW1DO0FBQUEsTUFBbEM7QUFBRTFGLElBQUFBLE1BQUY7QUFBVUgsSUFBQUE7QUFBVixHQUFrQztBQUFBLE1BQWI4RixNQUFhOztBQUM5RCxNQUFJM0YsTUFBTSxJQUFJSCxNQUFkLEVBQXNCO0FBQ3BCOEYsSUFBQUEsTUFBTSxDQUFDekYsR0FBUCxHQUFhLEVBQWI7O0FBRUEsS0FBQ0YsTUFBTSxJQUFJLEVBQVgsRUFBZWtCLE9BQWYsQ0FBdUJkLEtBQUssSUFBSTtBQUM5QixVQUFJLENBQUN1RixNQUFNLENBQUN6RixHQUFQLENBQVdFLEtBQVgsQ0FBTCxFQUF3QjtBQUN0QnVGLFFBQUFBLE1BQU0sQ0FBQ3pGLEdBQVAsQ0FBV0UsS0FBWCxJQUFvQjtBQUFFQyxVQUFBQSxJQUFJLEVBQUU7QUFBUixTQUFwQjtBQUNELE9BRkQsTUFFTztBQUNMc0YsUUFBQUEsTUFBTSxDQUFDekYsR0FBUCxDQUFXRSxLQUFYLEVBQWtCLE1BQWxCLElBQTRCLElBQTVCO0FBQ0Q7QUFDRixLQU5EOztBQVFBLEtBQUNQLE1BQU0sSUFBSSxFQUFYLEVBQWVxQixPQUFmLENBQXVCZCxLQUFLLElBQUk7QUFDOUIsVUFBSSxDQUFDdUYsTUFBTSxDQUFDekYsR0FBUCxDQUFXRSxLQUFYLENBQUwsRUFBd0I7QUFDdEJ1RixRQUFBQSxNQUFNLENBQUN6RixHQUFQLENBQVdFLEtBQVgsSUFBb0I7QUFBRUcsVUFBQUEsS0FBSyxFQUFFO0FBQVQsU0FBcEI7QUFDRCxPQUZELE1BRU87QUFDTG9GLFFBQUFBLE1BQU0sQ0FBQ3pGLEdBQVAsQ0FBV0UsS0FBWCxFQUFrQixPQUFsQixJQUE2QixJQUE3QjtBQUNEO0FBQ0YsS0FORDtBQU9EOztBQUNELFNBQU91RixNQUFQO0FBQ0QsQ0FyQkQ7QUF1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQSxNQUFNQyxnQkFBZ0IsR0FBSUosU0FBRCxJQUErQjtBQUN0RCxTQUFPQSxTQUFTLENBQUNLLEtBQVYsQ0FBZ0IsR0FBaEIsRUFBcUIsQ0FBckIsQ0FBUDtBQUNELENBRkQ7O0FBSUEsTUFBTUMsY0FBYyxHQUFHO0FBQ3JCckMsRUFBQUEsTUFBTSxFQUFFO0FBQUVzQyxJQUFBQSxTQUFTLEVBQUU7QUFBRU4sTUFBQUEsSUFBSSxFQUFFO0FBQVIsS0FBYjtBQUFpQ08sSUFBQUEsUUFBUSxFQUFFO0FBQUVQLE1BQUFBLElBQUksRUFBRTtBQUFSO0FBQTNDO0FBRGEsQ0FBdkI7O0FBSUEsTUFBTVEsa0JBQU4sQ0FBeUI7QUFRdkJDLEVBQUFBLFdBQVcsQ0FBQ0MsT0FBRCxFQUEwQkMsT0FBMUIsRUFBdUQ7QUFDaEUsU0FBS0QsT0FBTCxHQUFlQSxPQUFmO0FBQ0EsU0FBS0MsT0FBTCxHQUFlQSxPQUFPLElBQUksRUFBMUI7QUFDQSxTQUFLQyxrQkFBTCxHQUEwQixLQUFLRCxPQUFMLENBQWFDLGtCQUFiLElBQW1DLEVBQTdELENBSGdFLENBSWhFO0FBQ0E7O0FBQ0EsU0FBS0MsYUFBTCxHQUFxQixJQUFyQjtBQUNBLFNBQUtDLHFCQUFMLEdBQTZCLElBQTdCO0FBQ0EsU0FBS0gsT0FBTCxHQUFlQSxPQUFmO0FBQ0Q7O0FBRURJLEVBQUFBLGdCQUFnQixDQUFDdEUsU0FBRCxFQUFzQztBQUNwRCxXQUFPLEtBQUtpRSxPQUFMLENBQWFNLFdBQWIsQ0FBeUJ2RSxTQUF6QixDQUFQO0FBQ0Q7O0FBRUR3RSxFQUFBQSxlQUFlLENBQUN4RSxTQUFELEVBQW1DO0FBQ2hELFdBQU8sS0FBS3lFLFVBQUwsR0FDSkMsSUFESSxDQUNDQyxnQkFBZ0IsSUFBSUEsZ0JBQWdCLENBQUNDLFlBQWpCLENBQThCNUUsU0FBOUIsQ0FEckIsRUFFSjBFLElBRkksQ0FFQzNFLE1BQU0sSUFBSSxLQUFLa0UsT0FBTCxDQUFhWSxvQkFBYixDQUFrQzdFLFNBQWxDLEVBQTZDRCxNQUE3QyxFQUFxRCxFQUFyRCxDQUZYLENBQVA7QUFHRDs7QUFFRCtFLEVBQUFBLGlCQUFpQixDQUFDOUUsU0FBRCxFQUFtQztBQUNsRCxRQUFJLENBQUMrRSxnQkFBZ0IsQ0FBQ0MsZ0JBQWpCLENBQWtDaEYsU0FBbEMsQ0FBTCxFQUFtRDtBQUNqRCxhQUFPaUYsT0FBTyxDQUFDQyxNQUFSLENBQ0wsSUFBSXZHLFlBQU1DLEtBQVYsQ0FBZ0JELFlBQU1DLEtBQU4sQ0FBWXVHLGtCQUE1QixFQUFnRCx3QkFBd0JuRixTQUF4RSxDQURLLENBQVA7QUFHRDs7QUFDRCxXQUFPaUYsT0FBTyxDQUFDRyxPQUFSLEVBQVA7QUFDRCxHQXBDc0IsQ0FzQ3ZCOzs7QUFDQVgsRUFBQUEsVUFBVSxDQUNSUCxPQUEwQixHQUFHO0FBQUVtQixJQUFBQSxVQUFVLEVBQUU7QUFBZCxHQURyQixFQUVvQztBQUM1QyxRQUFJLEtBQUtqQixhQUFMLElBQXNCLElBQTFCLEVBQWdDO0FBQzlCLGFBQU8sS0FBS0EsYUFBWjtBQUNEOztBQUNELFNBQUtBLGFBQUwsR0FBcUJXLGdCQUFnQixDQUFDTyxJQUFqQixDQUFzQixLQUFLckIsT0FBM0IsRUFBb0NDLE9BQXBDLENBQXJCO0FBQ0EsU0FBS0UsYUFBTCxDQUFtQk0sSUFBbkIsQ0FDRSxNQUFNLE9BQU8sS0FBS04sYUFEcEIsRUFFRSxNQUFNLE9BQU8sS0FBS0EsYUFGcEI7QUFJQSxXQUFPLEtBQUtLLFVBQUwsQ0FBZ0JQLE9BQWhCLENBQVA7QUFDRDs7QUFFRHFCLEVBQUFBLGtCQUFrQixDQUNoQlosZ0JBRGdCLEVBRWhCVCxPQUEwQixHQUFHO0FBQUVtQixJQUFBQSxVQUFVLEVBQUU7QUFBZCxHQUZiLEVBRzRCO0FBQzVDLFdBQU9WLGdCQUFnQixHQUFHTSxPQUFPLENBQUNHLE9BQVIsQ0FBZ0JULGdCQUFoQixDQUFILEdBQXVDLEtBQUtGLFVBQUwsQ0FBZ0JQLE9BQWhCLENBQTlEO0FBQ0QsR0ExRHNCLENBNER2QjtBQUNBO0FBQ0E7OztBQUNBc0IsRUFBQUEsdUJBQXVCLENBQUN4RixTQUFELEVBQW9CeEIsR0FBcEIsRUFBbUQ7QUFDeEUsV0FBTyxLQUFLaUcsVUFBTCxHQUFrQkMsSUFBbEIsQ0FBdUIzRSxNQUFNLElBQUk7QUFDdEMsVUFBSTBGLENBQUMsR0FBRzFGLE1BQU0sQ0FBQzJGLGVBQVAsQ0FBdUIxRixTQUF2QixFQUFrQ3hCLEdBQWxDLENBQVI7O0FBQ0EsVUFBSWlILENBQUMsSUFBSSxJQUFMLElBQWEsT0FBT0EsQ0FBUCxLQUFhLFFBQTFCLElBQXNDQSxDQUFDLENBQUNsQyxJQUFGLEtBQVcsVUFBckQsRUFBaUU7QUFDL0QsZUFBT2tDLENBQUMsQ0FBQ0UsV0FBVDtBQUNEOztBQUNELGFBQU8zRixTQUFQO0FBQ0QsS0FOTSxDQUFQO0FBT0QsR0F2RXNCLENBeUV2QjtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0E0RixFQUFBQSxjQUFjLENBQ1o1RixTQURZLEVBRVpFLE1BRlksRUFHWjVDLEtBSFksRUFJWnVJLFVBSlksRUFLTTtBQUNsQixRQUFJOUYsTUFBSjtBQUNBLFVBQU14QyxHQUFHLEdBQUdzSSxVQUFVLENBQUN0SSxHQUF2QjtBQUNBLFVBQU1vQyxRQUFRLEdBQUdwQyxHQUFHLEtBQUt1SSxTQUF6QjtBQUNBLFFBQUlsRyxRQUFrQixHQUFHckMsR0FBRyxJQUFJLEVBQWhDO0FBQ0EsV0FBTyxLQUFLa0gsVUFBTCxHQUNKQyxJQURJLENBQ0NxQixDQUFDLElBQUk7QUFDVGhHLE1BQUFBLE1BQU0sR0FBR2dHLENBQVQ7O0FBQ0EsVUFBSXBHLFFBQUosRUFBYztBQUNaLGVBQU9zRixPQUFPLENBQUNHLE9BQVIsRUFBUDtBQUNEOztBQUNELGFBQU8sS0FBS1ksV0FBTCxDQUFpQmpHLE1BQWpCLEVBQXlCQyxTQUF6QixFQUFvQ0UsTUFBcEMsRUFBNENOLFFBQTVDLEVBQXNEaUcsVUFBdEQsQ0FBUDtBQUNELEtBUEksRUFRSm5CLElBUkksQ0FRQyxNQUFNO0FBQ1YsYUFBTzNFLE1BQU0sQ0FBQzZGLGNBQVAsQ0FBc0I1RixTQUF0QixFQUFpQ0UsTUFBakMsRUFBeUM1QyxLQUF6QyxDQUFQO0FBQ0QsS0FWSSxDQUFQO0FBV0Q7O0FBRUQySSxFQUFBQSxNQUFNLENBQ0pqRyxTQURJLEVBRUoxQyxLQUZJLEVBR0oySSxNQUhJLEVBSUo7QUFBRTFJLElBQUFBLEdBQUY7QUFBTzJJLElBQUFBLElBQVA7QUFBYUMsSUFBQUEsTUFBYjtBQUFxQkMsSUFBQUE7QUFBckIsTUFBcUQsRUFKakQsRUFLSkMsZ0JBQXlCLEdBQUcsS0FMeEIsRUFNSkMsWUFBcUIsR0FBRyxLQU5wQixFQU9KQyxxQkFQSSxFQVFVO0FBQ2QsVUFBTUMsYUFBYSxHQUFHbEosS0FBdEI7QUFDQSxVQUFNbUosY0FBYyxHQUFHUixNQUF2QixDQUZjLENBR2Q7O0FBQ0FBLElBQUFBLE1BQU0sR0FBRyx1QkFBU0EsTUFBVCxDQUFUO0FBQ0EsUUFBSVMsZUFBZSxHQUFHLEVBQXRCO0FBQ0EsUUFBSS9HLFFBQVEsR0FBR3BDLEdBQUcsS0FBS3VJLFNBQXZCO0FBQ0EsUUFBSWxHLFFBQVEsR0FBR3JDLEdBQUcsSUFBSSxFQUF0QjtBQUVBLFdBQU8sS0FBS2dJLGtCQUFMLENBQXdCZ0IscUJBQXhCLEVBQStDN0IsSUFBL0MsQ0FBb0RDLGdCQUFnQixJQUFJO0FBQzdFLGFBQU8sQ0FBQ2hGLFFBQVEsR0FDWnNGLE9BQU8sQ0FBQ0csT0FBUixFQURZLEdBRVpULGdCQUFnQixDQUFDZ0Msa0JBQWpCLENBQW9DM0csU0FBcEMsRUFBK0NKLFFBQS9DLEVBQXlELFFBQXpELENBRkcsRUFJSjhFLElBSkksQ0FJQyxNQUFNO0FBQ1ZnQyxRQUFBQSxlQUFlLEdBQUcsS0FBS0Usc0JBQUwsQ0FBNEI1RyxTQUE1QixFQUF1Q3dHLGFBQWEsQ0FBQ2xGLFFBQXJELEVBQStEMkUsTUFBL0QsQ0FBbEI7O0FBQ0EsWUFBSSxDQUFDdEcsUUFBTCxFQUFlO0FBQ2JyQyxVQUFBQSxLQUFLLEdBQUcsS0FBS3VKLHFCQUFMLENBQ05sQyxnQkFETSxFQUVOM0UsU0FGTSxFQUdOLFFBSE0sRUFJTjFDLEtBSk0sRUFLTnNDLFFBTE0sQ0FBUjs7QUFRQSxjQUFJd0csU0FBSixFQUFlO0FBQ2I5SSxZQUFBQSxLQUFLLEdBQUc7QUFDTjJCLGNBQUFBLElBQUksRUFBRSxDQUNKM0IsS0FESSxFQUVKLEtBQUt1SixxQkFBTCxDQUNFbEMsZ0JBREYsRUFFRTNFLFNBRkYsRUFHRSxVQUhGLEVBSUUxQyxLQUpGLEVBS0VzQyxRQUxGLENBRkk7QUFEQSxhQUFSO0FBWUQ7QUFDRjs7QUFDRCxZQUFJLENBQUN0QyxLQUFMLEVBQVk7QUFDVixpQkFBTzJILE9BQU8sQ0FBQ0csT0FBUixFQUFQO0FBQ0Q7O0FBQ0QsWUFBSTdILEdBQUosRUFBUztBQUNQRCxVQUFBQSxLQUFLLEdBQUdELFdBQVcsQ0FBQ0MsS0FBRCxFQUFRQyxHQUFSLENBQW5CO0FBQ0Q7O0FBQ0RtQixRQUFBQSxhQUFhLENBQUNwQixLQUFELENBQWI7QUFDQSxlQUFPcUgsZ0JBQWdCLENBQ3BCQyxZQURJLENBQ1M1RSxTQURULEVBQ29CLElBRHBCLEVBRUo4RyxLQUZJLENBRUVDLEtBQUssSUFBSTtBQUNkO0FBQ0E7QUFDQSxjQUFJQSxLQUFLLEtBQUtqQixTQUFkLEVBQXlCO0FBQ3ZCLG1CQUFPO0FBQUV2RSxjQUFBQSxNQUFNLEVBQUU7QUFBVixhQUFQO0FBQ0Q7O0FBQ0QsZ0JBQU13RixLQUFOO0FBQ0QsU0FUSSxFQVVKckMsSUFWSSxDQVVDM0UsTUFBTSxJQUFJO0FBQ2RYLFVBQUFBLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZNEcsTUFBWixFQUFvQmpILE9BQXBCLENBQTRCc0UsU0FBUyxJQUFJO0FBQ3ZDLGdCQUFJQSxTQUFTLENBQUM5RCxLQUFWLENBQWdCLGlDQUFoQixDQUFKLEVBQXdEO0FBQ3RELG9CQUFNLElBQUliLFlBQU1DLEtBQVYsQ0FDSkQsWUFBTUMsS0FBTixDQUFZYSxnQkFEUixFQUVILGtDQUFpQzZELFNBQVUsRUFGeEMsQ0FBTjtBQUlEOztBQUNELGtCQUFNMEQsYUFBYSxHQUFHdEQsZ0JBQWdCLENBQUNKLFNBQUQsQ0FBdEM7O0FBQ0EsZ0JBQ0UsQ0FBQ3lCLGdCQUFnQixDQUFDa0MsZ0JBQWpCLENBQWtDRCxhQUFsQyxFQUFpRGhILFNBQWpELENBQUQsSUFDQSxDQUFDMkMsa0JBQWtCLENBQUNxRSxhQUFELENBRnJCLEVBR0U7QUFDQSxvQkFBTSxJQUFJckksWUFBTUMsS0FBVixDQUNKRCxZQUFNQyxLQUFOLENBQVlhLGdCQURSLEVBRUgsa0NBQWlDNkQsU0FBVSxFQUZ4QyxDQUFOO0FBSUQ7QUFDRixXQWpCRDs7QUFrQkEsZUFBSyxNQUFNNEQsZUFBWCxJQUE4QmpCLE1BQTlCLEVBQXNDO0FBQ3BDLGdCQUNFQSxNQUFNLENBQUNpQixlQUFELENBQU4sSUFDQSxPQUFPakIsTUFBTSxDQUFDaUIsZUFBRCxDQUFiLEtBQW1DLFFBRG5DLElBRUE5SCxNQUFNLENBQUNDLElBQVAsQ0FBWTRHLE1BQU0sQ0FBQ2lCLGVBQUQsQ0FBbEIsRUFBcUM3RixJQUFyQyxDQUNFOEYsUUFBUSxJQUFJQSxRQUFRLENBQUMxRixRQUFULENBQWtCLEdBQWxCLEtBQTBCMEYsUUFBUSxDQUFDMUYsUUFBVCxDQUFrQixHQUFsQixDQUR4QyxDQUhGLEVBTUU7QUFDQSxvQkFBTSxJQUFJOUMsWUFBTUMsS0FBVixDQUNKRCxZQUFNQyxLQUFOLENBQVl3SSxrQkFEUixFQUVKLDBEQUZJLENBQU47QUFJRDtBQUNGOztBQUNEbkIsVUFBQUEsTUFBTSxHQUFHbEksa0JBQWtCLENBQUNrSSxNQUFELENBQTNCO0FBQ0E5QyxVQUFBQSxpQkFBaUIsQ0FBQ25ELFNBQUQsRUFBWWlHLE1BQVosRUFBb0JsRyxNQUFwQixDQUFqQjs7QUFDQSxjQUFJdUcsWUFBSixFQUFrQjtBQUNoQixtQkFBTyxLQUFLckMsT0FBTCxDQUFhb0QsSUFBYixDQUFrQnJILFNBQWxCLEVBQTZCRCxNQUE3QixFQUFxQ3pDLEtBQXJDLEVBQTRDLEVBQTVDLEVBQWdEb0gsSUFBaEQsQ0FBcUR6RyxNQUFNLElBQUk7QUFDcEUsa0JBQUksQ0FBQ0EsTUFBRCxJQUFXLENBQUNBLE1BQU0sQ0FBQ2tCLE1BQXZCLEVBQStCO0FBQzdCLHNCQUFNLElBQUlSLFlBQU1DLEtBQVYsQ0FBZ0JELFlBQU1DLEtBQU4sQ0FBWTBJLGdCQUE1QixFQUE4QyxtQkFBOUMsQ0FBTjtBQUNEOztBQUNELHFCQUFPLEVBQVA7QUFDRCxhQUxNLENBQVA7QUFNRDs7QUFDRCxjQUFJcEIsSUFBSixFQUFVO0FBQ1IsbUJBQU8sS0FBS2pDLE9BQUwsQ0FBYXNELG9CQUFiLENBQ0x2SCxTQURLLEVBRUxELE1BRkssRUFHTHpDLEtBSEssRUFJTDJJLE1BSkssRUFLTCxLQUFLNUIscUJBTEEsQ0FBUDtBQU9ELFdBUkQsTUFRTyxJQUFJOEIsTUFBSixFQUFZO0FBQ2pCLG1CQUFPLEtBQUtsQyxPQUFMLENBQWF1RCxlQUFiLENBQ0x4SCxTQURLLEVBRUxELE1BRkssRUFHTHpDLEtBSEssRUFJTDJJLE1BSkssRUFLTCxLQUFLNUIscUJBTEEsQ0FBUDtBQU9ELFdBUk0sTUFRQTtBQUNMLG1CQUFPLEtBQUtKLE9BQUwsQ0FBYXdELGdCQUFiLENBQ0x6SCxTQURLLEVBRUxELE1BRkssRUFHTHpDLEtBSEssRUFJTDJJLE1BSkssRUFLTCxLQUFLNUIscUJBTEEsQ0FBUDtBQU9EO0FBQ0YsU0E5RUksQ0FBUDtBQStFRCxPQXBISSxFQXFISkssSUFySEksQ0FxSEV6RyxNQUFELElBQWlCO0FBQ3JCLFlBQUksQ0FBQ0EsTUFBTCxFQUFhO0FBQ1gsZ0JBQU0sSUFBSVUsWUFBTUMsS0FBVixDQUFnQkQsWUFBTUMsS0FBTixDQUFZMEksZ0JBQTVCLEVBQThDLG1CQUE5QyxDQUFOO0FBQ0Q7O0FBQ0QsWUFBSWhCLFlBQUosRUFBa0I7QUFDaEIsaUJBQU9ySSxNQUFQO0FBQ0Q7O0FBQ0QsZUFBTyxLQUFLeUoscUJBQUwsQ0FDTDFILFNBREssRUFFTHdHLGFBQWEsQ0FBQ2xGLFFBRlQsRUFHTDJFLE1BSEssRUFJTFMsZUFKSyxFQUtMaEMsSUFMSyxDQUtBLE1BQU07QUFDWCxpQkFBT3pHLE1BQVA7QUFDRCxTQVBNLENBQVA7QUFRRCxPQXBJSSxFQXFJSnlHLElBcklJLENBcUlDekcsTUFBTSxJQUFJO0FBQ2QsWUFBSW9JLGdCQUFKLEVBQXNCO0FBQ3BCLGlCQUFPcEIsT0FBTyxDQUFDRyxPQUFSLENBQWdCbkgsTUFBaEIsQ0FBUDtBQUNEOztBQUNELGVBQU8sS0FBSzBKLHVCQUFMLENBQTZCbEIsY0FBN0IsRUFBNkN4SSxNQUE3QyxDQUFQO0FBQ0QsT0ExSUksQ0FBUDtBQTJJRCxLQTVJTSxDQUFQO0FBNklELEdBbFFzQixDQW9RdkI7QUFDQTtBQUNBOzs7QUFDQTJJLEVBQUFBLHNCQUFzQixDQUFDNUcsU0FBRCxFQUFvQnNCLFFBQXBCLEVBQXVDMkUsTUFBdkMsRUFBb0Q7QUFDeEUsUUFBSTJCLEdBQUcsR0FBRyxFQUFWO0FBQ0EsUUFBSUMsUUFBUSxHQUFHLEVBQWY7QUFDQXZHLElBQUFBLFFBQVEsR0FBRzJFLE1BQU0sQ0FBQzNFLFFBQVAsSUFBbUJBLFFBQTlCOztBQUVBLFFBQUl3RyxPQUFPLEdBQUcsQ0FBQ0MsRUFBRCxFQUFLdkosR0FBTCxLQUFhO0FBQ3pCLFVBQUksQ0FBQ3VKLEVBQUwsRUFBUztBQUNQO0FBQ0Q7O0FBQ0QsVUFBSUEsRUFBRSxDQUFDakYsSUFBSCxJQUFXLGFBQWYsRUFBOEI7QUFDNUI4RSxRQUFBQSxHQUFHLENBQUN4SixJQUFKLENBQVM7QUFBRUksVUFBQUEsR0FBRjtBQUFPdUosVUFBQUE7QUFBUCxTQUFUO0FBQ0FGLFFBQUFBLFFBQVEsQ0FBQ3pKLElBQVQsQ0FBY0ksR0FBZDtBQUNEOztBQUVELFVBQUl1SixFQUFFLENBQUNqRixJQUFILElBQVcsZ0JBQWYsRUFBaUM7QUFDL0I4RSxRQUFBQSxHQUFHLENBQUN4SixJQUFKLENBQVM7QUFBRUksVUFBQUEsR0FBRjtBQUFPdUosVUFBQUE7QUFBUCxTQUFUO0FBQ0FGLFFBQUFBLFFBQVEsQ0FBQ3pKLElBQVQsQ0FBY0ksR0FBZDtBQUNEOztBQUVELFVBQUl1SixFQUFFLENBQUNqRixJQUFILElBQVcsT0FBZixFQUF3QjtBQUN0QixhQUFLLElBQUlrRixDQUFULElBQWNELEVBQUUsQ0FBQ0gsR0FBakIsRUFBc0I7QUFDcEJFLFVBQUFBLE9BQU8sQ0FBQ0UsQ0FBRCxFQUFJeEosR0FBSixDQUFQO0FBQ0Q7QUFDRjtBQUNGLEtBbkJEOztBQXFCQSxTQUFLLE1BQU1BLEdBQVgsSUFBa0J5SCxNQUFsQixFQUEwQjtBQUN4QjZCLE1BQUFBLE9BQU8sQ0FBQzdCLE1BQU0sQ0FBQ3pILEdBQUQsQ0FBUCxFQUFjQSxHQUFkLENBQVA7QUFDRDs7QUFDRCxTQUFLLE1BQU1BLEdBQVgsSUFBa0JxSixRQUFsQixFQUE0QjtBQUMxQixhQUFPNUIsTUFBTSxDQUFDekgsR0FBRCxDQUFiO0FBQ0Q7O0FBQ0QsV0FBT29KLEdBQVA7QUFDRCxHQXhTc0IsQ0EwU3ZCO0FBQ0E7OztBQUNBRixFQUFBQSxxQkFBcUIsQ0FBQzFILFNBQUQsRUFBb0JzQixRQUFwQixFQUFzQzJFLE1BQXRDLEVBQW1EMkIsR0FBbkQsRUFBNkQ7QUFDaEYsUUFBSUssT0FBTyxHQUFHLEVBQWQ7QUFDQTNHLElBQUFBLFFBQVEsR0FBRzJFLE1BQU0sQ0FBQzNFLFFBQVAsSUFBbUJBLFFBQTlCO0FBQ0FzRyxJQUFBQSxHQUFHLENBQUM1SSxPQUFKLENBQVksQ0FBQztBQUFFUixNQUFBQSxHQUFGO0FBQU91SixNQUFBQTtBQUFQLEtBQUQsS0FBaUI7QUFDM0IsVUFBSSxDQUFDQSxFQUFMLEVBQVM7QUFDUDtBQUNEOztBQUNELFVBQUlBLEVBQUUsQ0FBQ2pGLElBQUgsSUFBVyxhQUFmLEVBQThCO0FBQzVCLGFBQUssTUFBTTVDLE1BQVgsSUFBcUI2SCxFQUFFLENBQUM5RSxPQUF4QixFQUFpQztBQUMvQmdGLFVBQUFBLE9BQU8sQ0FBQzdKLElBQVIsQ0FBYSxLQUFLOEosV0FBTCxDQUFpQjFKLEdBQWpCLEVBQXNCd0IsU0FBdEIsRUFBaUNzQixRQUFqQyxFQUEyQ3BCLE1BQU0sQ0FBQ29CLFFBQWxELENBQWI7QUFDRDtBQUNGOztBQUVELFVBQUl5RyxFQUFFLENBQUNqRixJQUFILElBQVcsZ0JBQWYsRUFBaUM7QUFDL0IsYUFBSyxNQUFNNUMsTUFBWCxJQUFxQjZILEVBQUUsQ0FBQzlFLE9BQXhCLEVBQWlDO0FBQy9CZ0YsVUFBQUEsT0FBTyxDQUFDN0osSUFBUixDQUFhLEtBQUsrSixjQUFMLENBQW9CM0osR0FBcEIsRUFBeUJ3QixTQUF6QixFQUFvQ3NCLFFBQXBDLEVBQThDcEIsTUFBTSxDQUFDb0IsUUFBckQsQ0FBYjtBQUNEO0FBQ0Y7QUFDRixLQWZEO0FBaUJBLFdBQU8yRCxPQUFPLENBQUNtRCxHQUFSLENBQVlILE9BQVosQ0FBUDtBQUNELEdBalVzQixDQW1VdkI7QUFDQTs7O0FBQ0FDLEVBQUFBLFdBQVcsQ0FBQzFKLEdBQUQsRUFBYzZKLGFBQWQsRUFBcUNDLE1BQXJDLEVBQXFEQyxJQUFyRCxFQUFtRTtBQUM1RSxVQUFNQyxHQUFHLEdBQUc7QUFDVjNFLE1BQUFBLFNBQVMsRUFBRTBFLElBREQ7QUFFVnpFLE1BQUFBLFFBQVEsRUFBRXdFO0FBRkEsS0FBWjtBQUlBLFdBQU8sS0FBS3JFLE9BQUwsQ0FBYXVELGVBQWIsQ0FDSixTQUFRaEosR0FBSSxJQUFHNkosYUFBYyxFQUR6QixFQUVMekUsY0FGSyxFQUdMNEUsR0FISyxFQUlMQSxHQUpLLEVBS0wsS0FBS25FLHFCQUxBLENBQVA7QUFPRCxHQWpWc0IsQ0FtVnZCO0FBQ0E7QUFDQTs7O0FBQ0E4RCxFQUFBQSxjQUFjLENBQUMzSixHQUFELEVBQWM2SixhQUFkLEVBQXFDQyxNQUFyQyxFQUFxREMsSUFBckQsRUFBbUU7QUFDL0UsUUFBSUMsR0FBRyxHQUFHO0FBQ1IzRSxNQUFBQSxTQUFTLEVBQUUwRSxJQURIO0FBRVJ6RSxNQUFBQSxRQUFRLEVBQUV3RTtBQUZGLEtBQVY7QUFJQSxXQUFPLEtBQUtyRSxPQUFMLENBQ0pZLG9CQURJLENBRUYsU0FBUXJHLEdBQUksSUFBRzZKLGFBQWMsRUFGM0IsRUFHSHpFLGNBSEcsRUFJSDRFLEdBSkcsRUFLSCxLQUFLbkUscUJBTEYsRUFPSnlDLEtBUEksQ0FPRUMsS0FBSyxJQUFJO0FBQ2Q7QUFDQSxVQUFJQSxLQUFLLENBQUMwQixJQUFOLElBQWM5SixZQUFNQyxLQUFOLENBQVkwSSxnQkFBOUIsRUFBZ0Q7QUFDOUM7QUFDRDs7QUFDRCxZQUFNUCxLQUFOO0FBQ0QsS0FiSSxDQUFQO0FBY0QsR0F6V3NCLENBMld2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0EyQixFQUFBQSxPQUFPLENBQ0wxSSxTQURLLEVBRUwxQyxLQUZLLEVBR0w7QUFBRUMsSUFBQUE7QUFBRixNQUF3QixFQUhuQixFQUlMZ0oscUJBSkssRUFLUztBQUNkLFVBQU01RyxRQUFRLEdBQUdwQyxHQUFHLEtBQUt1SSxTQUF6QjtBQUNBLFVBQU1sRyxRQUFRLEdBQUdyQyxHQUFHLElBQUksRUFBeEI7QUFFQSxXQUFPLEtBQUtnSSxrQkFBTCxDQUF3QmdCLHFCQUF4QixFQUErQzdCLElBQS9DLENBQW9EQyxnQkFBZ0IsSUFBSTtBQUM3RSxhQUFPLENBQUNoRixRQUFRLEdBQ1pzRixPQUFPLENBQUNHLE9BQVIsRUFEWSxHQUVaVCxnQkFBZ0IsQ0FBQ2dDLGtCQUFqQixDQUFvQzNHLFNBQXBDLEVBQStDSixRQUEvQyxFQUF5RCxRQUF6RCxDQUZHLEVBR0w4RSxJQUhLLENBR0EsTUFBTTtBQUNYLFlBQUksQ0FBQy9FLFFBQUwsRUFBZTtBQUNickMsVUFBQUEsS0FBSyxHQUFHLEtBQUt1SixxQkFBTCxDQUNObEMsZ0JBRE0sRUFFTjNFLFNBRk0sRUFHTixRQUhNLEVBSU4xQyxLQUpNLEVBS05zQyxRQUxNLENBQVI7O0FBT0EsY0FBSSxDQUFDdEMsS0FBTCxFQUFZO0FBQ1Ysa0JBQU0sSUFBSXFCLFlBQU1DLEtBQVYsQ0FBZ0JELFlBQU1DLEtBQU4sQ0FBWTBJLGdCQUE1QixFQUE4QyxtQkFBOUMsQ0FBTjtBQUNEO0FBQ0YsU0FaVSxDQWFYOzs7QUFDQSxZQUFJL0osR0FBSixFQUFTO0FBQ1BELFVBQUFBLEtBQUssR0FBR0QsV0FBVyxDQUFDQyxLQUFELEVBQVFDLEdBQVIsQ0FBbkI7QUFDRDs7QUFDRG1CLFFBQUFBLGFBQWEsQ0FBQ3BCLEtBQUQsQ0FBYjtBQUNBLGVBQU9xSCxnQkFBZ0IsQ0FDcEJDLFlBREksQ0FDUzVFLFNBRFQsRUFFSjhHLEtBRkksQ0FFRUMsS0FBSyxJQUFJO0FBQ2Q7QUFDQTtBQUNBLGNBQUlBLEtBQUssS0FBS2pCLFNBQWQsRUFBeUI7QUFDdkIsbUJBQU87QUFBRXZFLGNBQUFBLE1BQU0sRUFBRTtBQUFWLGFBQVA7QUFDRDs7QUFDRCxnQkFBTXdGLEtBQU47QUFDRCxTQVRJLEVBVUpyQyxJQVZJLENBVUNpRSxpQkFBaUIsSUFDckIsS0FBSzFFLE9BQUwsQ0FBYVksb0JBQWIsQ0FDRTdFLFNBREYsRUFFRTJJLGlCQUZGLEVBR0VyTCxLQUhGLEVBSUUsS0FBSytHLHFCQUpQLENBWEcsRUFrQkp5QyxLQWxCSSxDQWtCRUMsS0FBSyxJQUFJO0FBQ2Q7QUFDQSxjQUFJL0csU0FBUyxLQUFLLFVBQWQsSUFBNEIrRyxLQUFLLENBQUMwQixJQUFOLEtBQWU5SixZQUFNQyxLQUFOLENBQVkwSSxnQkFBM0QsRUFBNkU7QUFDM0UsbUJBQU9yQyxPQUFPLENBQUNHLE9BQVIsQ0FBZ0IsRUFBaEIsQ0FBUDtBQUNEOztBQUNELGdCQUFNMkIsS0FBTjtBQUNELFNBeEJJLENBQVA7QUF5QkQsT0E5Q00sQ0FBUDtBQStDRCxLQWhETSxDQUFQO0FBaURELEdBNWFzQixDQThhdkI7QUFDQTs7O0FBQ0E2QixFQUFBQSxNQUFNLENBQ0o1SSxTQURJLEVBRUpFLE1BRkksRUFHSjtBQUFFM0MsSUFBQUE7QUFBRixNQUF3QixFQUhwQixFQUlKK0ksWUFBcUIsR0FBRyxLQUpwQixFQUtKQyxxQkFMSSxFQU1VO0FBQ2Q7QUFDQSxVQUFNc0MsY0FBYyxHQUFHM0ksTUFBdkI7QUFDQUEsSUFBQUEsTUFBTSxHQUFHbkMsa0JBQWtCLENBQUNtQyxNQUFELENBQTNCO0FBRUFBLElBQUFBLE1BQU0sQ0FBQzRJLFNBQVAsR0FBbUI7QUFBRUMsTUFBQUEsR0FBRyxFQUFFN0ksTUFBTSxDQUFDNEksU0FBZDtBQUF5QkUsTUFBQUEsTUFBTSxFQUFFO0FBQWpDLEtBQW5CO0FBQ0E5SSxJQUFBQSxNQUFNLENBQUMrSSxTQUFQLEdBQW1CO0FBQUVGLE1BQUFBLEdBQUcsRUFBRTdJLE1BQU0sQ0FBQytJLFNBQWQ7QUFBeUJELE1BQUFBLE1BQU0sRUFBRTtBQUFqQyxLQUFuQjtBQUVBLFFBQUlySixRQUFRLEdBQUdwQyxHQUFHLEtBQUt1SSxTQUF2QjtBQUNBLFFBQUlsRyxRQUFRLEdBQUdyQyxHQUFHLElBQUksRUFBdEI7QUFDQSxVQUFNbUosZUFBZSxHQUFHLEtBQUtFLHNCQUFMLENBQTRCNUcsU0FBNUIsRUFBdUMsSUFBdkMsRUFBNkNFLE1BQTdDLENBQXhCO0FBRUEsV0FBTyxLQUFLNEUsaUJBQUwsQ0FBdUI5RSxTQUF2QixFQUNKMEUsSUFESSxDQUNDLE1BQU0sS0FBS2Esa0JBQUwsQ0FBd0JnQixxQkFBeEIsQ0FEUCxFQUVKN0IsSUFGSSxDQUVDQyxnQkFBZ0IsSUFBSTtBQUN4QixhQUFPLENBQUNoRixRQUFRLEdBQ1pzRixPQUFPLENBQUNHLE9BQVIsRUFEWSxHQUVaVCxnQkFBZ0IsQ0FBQ2dDLGtCQUFqQixDQUFvQzNHLFNBQXBDLEVBQStDSixRQUEvQyxFQUF5RCxRQUF6RCxDQUZHLEVBSUo4RSxJQUpJLENBSUMsTUFBTUMsZ0JBQWdCLENBQUN1RSxrQkFBakIsQ0FBb0NsSixTQUFwQyxDQUpQLEVBS0owRSxJQUxJLENBS0MsTUFBTUMsZ0JBQWdCLENBQUNDLFlBQWpCLENBQThCNUUsU0FBOUIsRUFBeUMsSUFBekMsQ0FMUCxFQU1KMEUsSUFOSSxDQU1DM0UsTUFBTSxJQUFJO0FBQ2RvRCxRQUFBQSxpQkFBaUIsQ0FBQ25ELFNBQUQsRUFBWUUsTUFBWixFQUFvQkgsTUFBcEIsQ0FBakI7QUFDQThDLFFBQUFBLCtCQUErQixDQUFDM0MsTUFBRCxDQUEvQjs7QUFDQSxZQUFJb0csWUFBSixFQUFrQjtBQUNoQixpQkFBTyxFQUFQO0FBQ0Q7O0FBQ0QsZUFBTyxLQUFLckMsT0FBTCxDQUFha0YsWUFBYixDQUNMbkosU0FESyxFQUVMK0UsZ0JBQWdCLENBQUNxRSw0QkFBakIsQ0FBOENySixNQUE5QyxDQUZLLEVBR0xHLE1BSEssRUFJTCxLQUFLbUUscUJBSkEsQ0FBUDtBQU1ELE9BbEJJLEVBbUJKSyxJQW5CSSxDQW1CQ3pHLE1BQU0sSUFBSTtBQUNkLFlBQUlxSSxZQUFKLEVBQWtCO0FBQ2hCLGlCQUFPdUMsY0FBUDtBQUNEOztBQUNELGVBQU8sS0FBS25CLHFCQUFMLENBQ0wxSCxTQURLLEVBRUxFLE1BQU0sQ0FBQ29CLFFBRkYsRUFHTHBCLE1BSEssRUFJTHdHLGVBSkssRUFLTGhDLElBTEssQ0FLQSxNQUFNO0FBQ1gsaUJBQU8sS0FBS2lELHVCQUFMLENBQTZCa0IsY0FBN0IsRUFBNkM1SyxNQUFNLENBQUMySixHQUFQLENBQVcsQ0FBWCxDQUE3QyxDQUFQO0FBQ0QsU0FQTSxDQUFQO0FBUUQsT0EvQkksQ0FBUDtBQWdDRCxLQW5DSSxDQUFQO0FBb0NEOztBQUVENUIsRUFBQUEsV0FBVyxDQUNUakcsTUFEUyxFQUVUQyxTQUZTLEVBR1RFLE1BSFMsRUFJVE4sUUFKUyxFQUtUaUcsVUFMUyxFQU1NO0FBQ2YsVUFBTXdELFdBQVcsR0FBR3RKLE1BQU0sQ0FBQ3VKLFVBQVAsQ0FBa0J0SixTQUFsQixDQUFwQjs7QUFDQSxRQUFJLENBQUNxSixXQUFMLEVBQWtCO0FBQ2hCLGFBQU9wRSxPQUFPLENBQUNHLE9BQVIsRUFBUDtBQUNEOztBQUNELFVBQU03RCxNQUFNLEdBQUduQyxNQUFNLENBQUNDLElBQVAsQ0FBWWEsTUFBWixDQUFmO0FBQ0EsVUFBTXFKLFlBQVksR0FBR25LLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZZ0ssV0FBVyxDQUFDOUgsTUFBeEIsQ0FBckI7QUFDQSxVQUFNaUksT0FBTyxHQUFHakksTUFBTSxDQUFDYixNQUFQLENBQWMrSSxLQUFLLElBQUk7QUFDckM7QUFDQSxVQUFJdkosTUFBTSxDQUFDdUosS0FBRCxDQUFOLElBQWlCdkosTUFBTSxDQUFDdUosS0FBRCxDQUFOLENBQWMzRyxJQUEvQixJQUF1QzVDLE1BQU0sQ0FBQ3VKLEtBQUQsQ0FBTixDQUFjM0csSUFBZCxLQUF1QixRQUFsRSxFQUE0RTtBQUMxRSxlQUFPLEtBQVA7QUFDRDs7QUFDRCxhQUFPeUcsWUFBWSxDQUFDOUssT0FBYixDQUFxQmlGLGdCQUFnQixDQUFDK0YsS0FBRCxDQUFyQyxJQUFnRCxDQUF2RDtBQUNELEtBTmUsQ0FBaEI7O0FBT0EsUUFBSUQsT0FBTyxDQUFDckssTUFBUixHQUFpQixDQUFyQixFQUF3QjtBQUN0QjtBQUNBMEcsTUFBQUEsVUFBVSxDQUFDTyxTQUFYLEdBQXVCLElBQXZCO0FBRUEsWUFBTXNELE1BQU0sR0FBRzdELFVBQVUsQ0FBQzZELE1BQTFCO0FBQ0EsYUFBTzNKLE1BQU0sQ0FBQzRHLGtCQUFQLENBQTBCM0csU0FBMUIsRUFBcUNKLFFBQXJDLEVBQStDLFVBQS9DLEVBQTJEOEosTUFBM0QsQ0FBUDtBQUNEOztBQUNELFdBQU96RSxPQUFPLENBQUNHLE9BQVIsRUFBUDtBQUNELEdBcGdCc0IsQ0FzZ0J2Qjs7QUFDQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNFdUUsRUFBQUEsZ0JBQWdCLENBQUNDLElBQWEsR0FBRyxLQUFqQixFQUFzQztBQUNwRCxTQUFLeEYsYUFBTCxHQUFxQixJQUFyQjs7QUFDQXlGLHlCQUFZQyxLQUFaOztBQUNBLFdBQU8sS0FBSzdGLE9BQUwsQ0FBYThGLGdCQUFiLENBQThCSCxJQUE5QixDQUFQO0FBQ0QsR0FqaEJzQixDQW1oQnZCO0FBQ0E7OztBQUNBSSxFQUFBQSxVQUFVLENBQ1JoSyxTQURRLEVBRVJ4QixHQUZRLEVBR1JzRixRQUhRLEVBSVJtRyxZQUpRLEVBS2dCO0FBQ3hCLFVBQU07QUFBRUMsTUFBQUEsSUFBRjtBQUFRQyxNQUFBQSxLQUFSO0FBQWVDLE1BQUFBO0FBQWYsUUFBd0JILFlBQTlCO0FBQ0EsVUFBTUksV0FBVyxHQUFHLEVBQXBCOztBQUNBLFFBQUlELElBQUksSUFBSUEsSUFBSSxDQUFDdEIsU0FBYixJQUEwQixLQUFLN0UsT0FBTCxDQUFhcUcsbUJBQTNDLEVBQWdFO0FBQzlERCxNQUFBQSxXQUFXLENBQUNELElBQVosR0FBbUI7QUFBRUcsUUFBQUEsR0FBRyxFQUFFSCxJQUFJLENBQUN0QjtBQUFaLE9BQW5CO0FBQ0F1QixNQUFBQSxXQUFXLENBQUNGLEtBQVosR0FBb0JBLEtBQXBCO0FBQ0FFLE1BQUFBLFdBQVcsQ0FBQ0gsSUFBWixHQUFtQkEsSUFBbkI7QUFDQUQsTUFBQUEsWUFBWSxDQUFDQyxJQUFiLEdBQW9CLENBQXBCO0FBQ0Q7O0FBQ0QsV0FBTyxLQUFLakcsT0FBTCxDQUNKb0QsSUFESSxDQUNDekUsYUFBYSxDQUFDNUMsU0FBRCxFQUFZeEIsR0FBWixDQURkLEVBQ2dDb0YsY0FEaEMsRUFDZ0Q7QUFBRUUsTUFBQUE7QUFBRixLQURoRCxFQUM4RHVHLFdBRDlELEVBRUozRixJQUZJLENBRUM4RixPQUFPLElBQUlBLE9BQU8sQ0FBQzVKLEdBQVIsQ0FBWTNDLE1BQU0sSUFBSUEsTUFBTSxDQUFDNEYsU0FBN0IsQ0FGWixDQUFQO0FBR0QsR0F0aUJzQixDQXdpQnZCO0FBQ0E7OztBQUNBNEcsRUFBQUEsU0FBUyxDQUFDekssU0FBRCxFQUFvQnhCLEdBQXBCLEVBQWlDd0wsVUFBakMsRUFBMEU7QUFDakYsV0FBTyxLQUFLL0YsT0FBTCxDQUNKb0QsSUFESSxDQUVIekUsYUFBYSxDQUFDNUMsU0FBRCxFQUFZeEIsR0FBWixDQUZWLEVBR0hvRixjQUhHLEVBSUg7QUFBRUMsTUFBQUEsU0FBUyxFQUFFO0FBQUVqRyxRQUFBQSxHQUFHLEVBQUVvTTtBQUFQO0FBQWIsS0FKRyxFQUtIO0FBQUUzSyxNQUFBQSxJQUFJLEVBQUUsQ0FBQyxVQUFEO0FBQVIsS0FMRyxFQU9KcUYsSUFQSSxDQU9DOEYsT0FBTyxJQUFJQSxPQUFPLENBQUM1SixHQUFSLENBQVkzQyxNQUFNLElBQUlBLE1BQU0sQ0FBQzZGLFFBQTdCLENBUFosQ0FBUDtBQVFELEdBbmpCc0IsQ0FxakJ2QjtBQUNBO0FBQ0E7OztBQUNBNEcsRUFBQUEsZ0JBQWdCLENBQUMxSyxTQUFELEVBQW9CMUMsS0FBcEIsRUFBZ0N5QyxNQUFoQyxFQUEyRDtBQUN6RTtBQUNBO0FBQ0EsUUFBSXpDLEtBQUssQ0FBQyxLQUFELENBQVQsRUFBa0I7QUFDaEIsWUFBTXFOLEdBQUcsR0FBR3JOLEtBQUssQ0FBQyxLQUFELENBQWpCO0FBQ0EsYUFBTzJILE9BQU8sQ0FBQ21ELEdBQVIsQ0FDTHVDLEdBQUcsQ0FBQy9KLEdBQUosQ0FBUSxDQUFDZ0ssTUFBRCxFQUFTQyxLQUFULEtBQW1CO0FBQ3pCLGVBQU8sS0FBS0gsZ0JBQUwsQ0FBc0IxSyxTQUF0QixFQUFpQzRLLE1BQWpDLEVBQXlDN0ssTUFBekMsRUFBaUQyRSxJQUFqRCxDQUFzRGtHLE1BQU0sSUFBSTtBQUNyRXROLFVBQUFBLEtBQUssQ0FBQyxLQUFELENBQUwsQ0FBYXVOLEtBQWIsSUFBc0JELE1BQXRCO0FBQ0QsU0FGTSxDQUFQO0FBR0QsT0FKRCxDQURLLEVBTUxsRyxJQU5LLENBTUEsTUFBTTtBQUNYLGVBQU9PLE9BQU8sQ0FBQ0csT0FBUixDQUFnQjlILEtBQWhCLENBQVA7QUFDRCxPQVJNLENBQVA7QUFTRDs7QUFDRCxRQUFJQSxLQUFLLENBQUMsTUFBRCxDQUFULEVBQW1CO0FBQ2pCLFlBQU13TixJQUFJLEdBQUd4TixLQUFLLENBQUMsTUFBRCxDQUFsQjtBQUNBLGFBQU8ySCxPQUFPLENBQUNtRCxHQUFSLENBQ0wwQyxJQUFJLENBQUNsSyxHQUFMLENBQVMsQ0FBQ2dLLE1BQUQsRUFBU0MsS0FBVCxLQUFtQjtBQUMxQixlQUFPLEtBQUtILGdCQUFMLENBQXNCMUssU0FBdEIsRUFBaUM0SyxNQUFqQyxFQUF5QzdLLE1BQXpDLEVBQWlEMkUsSUFBakQsQ0FBc0RrRyxNQUFNLElBQUk7QUFDckV0TixVQUFBQSxLQUFLLENBQUMsTUFBRCxDQUFMLENBQWN1TixLQUFkLElBQXVCRCxNQUF2QjtBQUNELFNBRk0sQ0FBUDtBQUdELE9BSkQsQ0FESyxFQU1MbEcsSUFOSyxDQU1BLE1BQU07QUFDWCxlQUFPTyxPQUFPLENBQUNHLE9BQVIsQ0FBZ0I5SCxLQUFoQixDQUFQO0FBQ0QsT0FSTSxDQUFQO0FBU0Q7O0FBRUQsVUFBTXlOLFFBQVEsR0FBRzNMLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZL0IsS0FBWixFQUFtQnNELEdBQW5CLENBQXVCcEMsR0FBRyxJQUFJO0FBQzdDLFlBQU1pSCxDQUFDLEdBQUcxRixNQUFNLENBQUMyRixlQUFQLENBQXVCMUYsU0FBdkIsRUFBa0N4QixHQUFsQyxDQUFWOztBQUNBLFVBQUksQ0FBQ2lILENBQUQsSUFBTUEsQ0FBQyxDQUFDbEMsSUFBRixLQUFXLFVBQXJCLEVBQWlDO0FBQy9CLGVBQU8wQixPQUFPLENBQUNHLE9BQVIsQ0FBZ0I5SCxLQUFoQixDQUFQO0FBQ0Q7O0FBQ0QsVUFBSTBOLE9BQWlCLEdBQUcsSUFBeEI7O0FBQ0EsVUFDRTFOLEtBQUssQ0FBQ2tCLEdBQUQsQ0FBTCxLQUNDbEIsS0FBSyxDQUFDa0IsR0FBRCxDQUFMLENBQVcsS0FBWCxLQUNDbEIsS0FBSyxDQUFDa0IsR0FBRCxDQUFMLENBQVcsS0FBWCxDQURELElBRUNsQixLQUFLLENBQUNrQixHQUFELENBQUwsQ0FBVyxNQUFYLENBRkQsSUFHQ2xCLEtBQUssQ0FBQ2tCLEdBQUQsQ0FBTCxDQUFXd0ssTUFBWCxJQUFxQixTQUp2QixDQURGLEVBTUU7QUFDQTtBQUNBZ0MsUUFBQUEsT0FBTyxHQUFHNUwsTUFBTSxDQUFDQyxJQUFQLENBQVkvQixLQUFLLENBQUNrQixHQUFELENBQWpCLEVBQXdCb0MsR0FBeEIsQ0FBNEJxSyxhQUFhLElBQUk7QUFDckQsY0FBSWpCLFVBQUo7QUFDQSxjQUFJa0IsVUFBVSxHQUFHLEtBQWpCOztBQUNBLGNBQUlELGFBQWEsS0FBSyxVQUF0QixFQUFrQztBQUNoQ2pCLFlBQUFBLFVBQVUsR0FBRyxDQUFDMU0sS0FBSyxDQUFDa0IsR0FBRCxDQUFMLENBQVc4QyxRQUFaLENBQWI7QUFDRCxXQUZELE1BRU8sSUFBSTJKLGFBQWEsSUFBSSxLQUFyQixFQUE0QjtBQUNqQ2pCLFlBQUFBLFVBQVUsR0FBRzFNLEtBQUssQ0FBQ2tCLEdBQUQsQ0FBTCxDQUFXLEtBQVgsRUFBa0JvQyxHQUFsQixDQUFzQnVLLENBQUMsSUFBSUEsQ0FBQyxDQUFDN0osUUFBN0IsQ0FBYjtBQUNELFdBRk0sTUFFQSxJQUFJMkosYUFBYSxJQUFJLE1BQXJCLEVBQTZCO0FBQ2xDQyxZQUFBQSxVQUFVLEdBQUcsSUFBYjtBQUNBbEIsWUFBQUEsVUFBVSxHQUFHMU0sS0FBSyxDQUFDa0IsR0FBRCxDQUFMLENBQVcsTUFBWCxFQUFtQm9DLEdBQW5CLENBQXVCdUssQ0FBQyxJQUFJQSxDQUFDLENBQUM3SixRQUE5QixDQUFiO0FBQ0QsV0FITSxNQUdBLElBQUkySixhQUFhLElBQUksS0FBckIsRUFBNEI7QUFDakNDLFlBQUFBLFVBQVUsR0FBRyxJQUFiO0FBQ0FsQixZQUFBQSxVQUFVLEdBQUcsQ0FBQzFNLEtBQUssQ0FBQ2tCLEdBQUQsQ0FBTCxDQUFXLEtBQVgsRUFBa0I4QyxRQUFuQixDQUFiO0FBQ0QsV0FITSxNQUdBO0FBQ0w7QUFDRDs7QUFDRCxpQkFBTztBQUNMNEosWUFBQUEsVUFESztBQUVMbEIsWUFBQUE7QUFGSyxXQUFQO0FBSUQsU0FwQlMsQ0FBVjtBQXFCRCxPQTdCRCxNQTZCTztBQUNMZ0IsUUFBQUEsT0FBTyxHQUFHLENBQUM7QUFBRUUsVUFBQUEsVUFBVSxFQUFFLEtBQWQ7QUFBcUJsQixVQUFBQSxVQUFVLEVBQUU7QUFBakMsU0FBRCxDQUFWO0FBQ0QsT0FyQzRDLENBdUM3Qzs7O0FBQ0EsYUFBTzFNLEtBQUssQ0FBQ2tCLEdBQUQsQ0FBWixDQXhDNkMsQ0F5QzdDO0FBQ0E7O0FBQ0EsWUFBTXVNLFFBQVEsR0FBR0MsT0FBTyxDQUFDcEssR0FBUixDQUFZd0ssQ0FBQyxJQUFJO0FBQ2hDLFlBQUksQ0FBQ0EsQ0FBTCxFQUFRO0FBQ04saUJBQU9uRyxPQUFPLENBQUNHLE9BQVIsRUFBUDtBQUNEOztBQUNELGVBQU8sS0FBS3FGLFNBQUwsQ0FBZXpLLFNBQWYsRUFBMEJ4QixHQUExQixFQUErQjRNLENBQUMsQ0FBQ3BCLFVBQWpDLEVBQTZDdEYsSUFBN0MsQ0FBa0QyRyxHQUFHLElBQUk7QUFDOUQsY0FBSUQsQ0FBQyxDQUFDRixVQUFOLEVBQWtCO0FBQ2hCLGlCQUFLSSxvQkFBTCxDQUEwQkQsR0FBMUIsRUFBK0IvTixLQUEvQjtBQUNELFdBRkQsTUFFTztBQUNMLGlCQUFLaU8saUJBQUwsQ0FBdUJGLEdBQXZCLEVBQTRCL04sS0FBNUI7QUFDRDs7QUFDRCxpQkFBTzJILE9BQU8sQ0FBQ0csT0FBUixFQUFQO0FBQ0QsU0FQTSxDQUFQO0FBUUQsT0FaZ0IsQ0FBakI7QUFjQSxhQUFPSCxPQUFPLENBQUNtRCxHQUFSLENBQVkyQyxRQUFaLEVBQXNCckcsSUFBdEIsQ0FBMkIsTUFBTTtBQUN0QyxlQUFPTyxPQUFPLENBQUNHLE9BQVIsRUFBUDtBQUNELE9BRk0sQ0FBUDtBQUdELEtBNURnQixDQUFqQjtBQThEQSxXQUFPSCxPQUFPLENBQUNtRCxHQUFSLENBQVkyQyxRQUFaLEVBQXNCckcsSUFBdEIsQ0FBMkIsTUFBTTtBQUN0QyxhQUFPTyxPQUFPLENBQUNHLE9BQVIsQ0FBZ0I5SCxLQUFoQixDQUFQO0FBQ0QsS0FGTSxDQUFQO0FBR0QsR0FycEJzQixDQXVwQnZCO0FBQ0E7OztBQUNBa08sRUFBQUEsa0JBQWtCLENBQUN4TCxTQUFELEVBQW9CMUMsS0FBcEIsRUFBZ0MyTSxZQUFoQyxFQUFtRTtBQUNuRixRQUFJM00sS0FBSyxDQUFDLEtBQUQsQ0FBVCxFQUFrQjtBQUNoQixhQUFPMkgsT0FBTyxDQUFDbUQsR0FBUixDQUNMOUssS0FBSyxDQUFDLEtBQUQsQ0FBTCxDQUFhc0QsR0FBYixDQUFpQmdLLE1BQU0sSUFBSTtBQUN6QixlQUFPLEtBQUtZLGtCQUFMLENBQXdCeEwsU0FBeEIsRUFBbUM0SyxNQUFuQyxFQUEyQ1gsWUFBM0MsQ0FBUDtBQUNELE9BRkQsQ0FESyxDQUFQO0FBS0Q7O0FBQ0QsUUFBSTNNLEtBQUssQ0FBQyxNQUFELENBQVQsRUFBbUI7QUFDakIsYUFBTzJILE9BQU8sQ0FBQ21ELEdBQVIsQ0FDTDlLLEtBQUssQ0FBQyxNQUFELENBQUwsQ0FBY3NELEdBQWQsQ0FBa0JnSyxNQUFNLElBQUk7QUFDMUIsZUFBTyxLQUFLWSxrQkFBTCxDQUF3QnhMLFNBQXhCLEVBQW1DNEssTUFBbkMsRUFBMkNYLFlBQTNDLENBQVA7QUFDRCxPQUZELENBREssQ0FBUDtBQUtEOztBQUNELFFBQUl3QixTQUFTLEdBQUduTyxLQUFLLENBQUMsWUFBRCxDQUFyQjs7QUFDQSxRQUFJbU8sU0FBSixFQUFlO0FBQ2IsYUFBTyxLQUFLekIsVUFBTCxDQUNMeUIsU0FBUyxDQUFDdkwsTUFBVixDQUFpQkYsU0FEWixFQUVMeUwsU0FBUyxDQUFDak4sR0FGTCxFQUdMaU4sU0FBUyxDQUFDdkwsTUFBVixDQUFpQm9CLFFBSFosRUFJTDJJLFlBSkssRUFNSnZGLElBTkksQ0FNQzJHLEdBQUcsSUFBSTtBQUNYLGVBQU8vTixLQUFLLENBQUMsWUFBRCxDQUFaO0FBQ0EsYUFBS2lPLGlCQUFMLENBQXVCRixHQUF2QixFQUE0Qi9OLEtBQTVCO0FBQ0EsZUFBTyxLQUFLa08sa0JBQUwsQ0FBd0J4TCxTQUF4QixFQUFtQzFDLEtBQW5DLEVBQTBDMk0sWUFBMUMsQ0FBUDtBQUNELE9BVkksRUFXSnZGLElBWEksQ0FXQyxNQUFNLENBQUcsQ0FYVixDQUFQO0FBWUQ7QUFDRjs7QUFFRDZHLEVBQUFBLGlCQUFpQixDQUFDRixHQUFtQixHQUFHLElBQXZCLEVBQTZCL04sS0FBN0IsRUFBeUM7QUFDeEQsVUFBTW9PLGFBQTZCLEdBQ2pDLE9BQU9wTyxLQUFLLENBQUNnRSxRQUFiLEtBQTBCLFFBQTFCLEdBQXFDLENBQUNoRSxLQUFLLENBQUNnRSxRQUFQLENBQXJDLEdBQXdELElBRDFEO0FBRUEsVUFBTXFLLFNBQXlCLEdBQzdCck8sS0FBSyxDQUFDZ0UsUUFBTixJQUFrQmhFLEtBQUssQ0FBQ2dFLFFBQU4sQ0FBZSxLQUFmLENBQWxCLEdBQTBDLENBQUNoRSxLQUFLLENBQUNnRSxRQUFOLENBQWUsS0FBZixDQUFELENBQTFDLEdBQW9FLElBRHRFO0FBRUEsVUFBTXNLLFNBQXlCLEdBQzdCdE8sS0FBSyxDQUFDZ0UsUUFBTixJQUFrQmhFLEtBQUssQ0FBQ2dFLFFBQU4sQ0FBZSxLQUFmLENBQWxCLEdBQTBDaEUsS0FBSyxDQUFDZ0UsUUFBTixDQUFlLEtBQWYsQ0FBMUMsR0FBa0UsSUFEcEUsQ0FMd0QsQ0FReEQ7O0FBQ0EsVUFBTXVLLE1BQTRCLEdBQUcsQ0FBQ0gsYUFBRCxFQUFnQkMsU0FBaEIsRUFBMkJDLFNBQTNCLEVBQXNDUCxHQUF0QyxFQUEyQzNLLE1BQTNDLENBQ25Db0wsSUFBSSxJQUFJQSxJQUFJLEtBQUssSUFEa0IsQ0FBckM7QUFHQSxVQUFNQyxXQUFXLEdBQUdGLE1BQU0sQ0FBQ0csTUFBUCxDQUFjLENBQUNDLElBQUQsRUFBT0gsSUFBUCxLQUFnQkcsSUFBSSxHQUFHSCxJQUFJLENBQUMzTSxNQUExQyxFQUFrRCxDQUFsRCxDQUFwQjtBQUVBLFFBQUkrTSxlQUFlLEdBQUcsRUFBdEI7O0FBQ0EsUUFBSUgsV0FBVyxHQUFHLEdBQWxCLEVBQXVCO0FBQ3JCRyxNQUFBQSxlQUFlLEdBQUdDLG1CQUFVQyxHQUFWLENBQWNQLE1BQWQsQ0FBbEI7QUFDRCxLQUZELE1BRU87QUFDTEssTUFBQUEsZUFBZSxHQUFHLHdCQUFVTCxNQUFWLENBQWxCO0FBQ0QsS0FuQnVELENBcUJ4RDs7O0FBQ0EsUUFBSSxFQUFFLGNBQWN2TyxLQUFoQixDQUFKLEVBQTRCO0FBQzFCQSxNQUFBQSxLQUFLLENBQUNnRSxRQUFOLEdBQWlCO0FBQ2YxRCxRQUFBQSxHQUFHLEVBQUVrSTtBQURVLE9BQWpCO0FBR0QsS0FKRCxNQUlPLElBQUksT0FBT3hJLEtBQUssQ0FBQ2dFLFFBQWIsS0FBMEIsUUFBOUIsRUFBd0M7QUFDN0NoRSxNQUFBQSxLQUFLLENBQUNnRSxRQUFOLEdBQWlCO0FBQ2YxRCxRQUFBQSxHQUFHLEVBQUVrSSxTQURVO0FBRWZ1RyxRQUFBQSxHQUFHLEVBQUUvTyxLQUFLLENBQUNnRTtBQUZJLE9BQWpCO0FBSUQ7O0FBQ0RoRSxJQUFBQSxLQUFLLENBQUNnRSxRQUFOLENBQWUsS0FBZixJQUF3QjRLLGVBQXhCO0FBRUEsV0FBTzVPLEtBQVA7QUFDRDs7QUFFRGdPLEVBQUFBLG9CQUFvQixDQUFDRCxHQUFhLEdBQUcsRUFBakIsRUFBcUIvTixLQUFyQixFQUFpQztBQUNuRCxVQUFNZ1AsVUFBVSxHQUFHaFAsS0FBSyxDQUFDZ0UsUUFBTixJQUFrQmhFLEtBQUssQ0FBQ2dFLFFBQU4sQ0FBZSxNQUFmLENBQWxCLEdBQTJDaEUsS0FBSyxDQUFDZ0UsUUFBTixDQUFlLE1BQWYsQ0FBM0MsR0FBb0UsRUFBdkY7QUFDQSxRQUFJdUssTUFBTSxHQUFHLENBQUMsR0FBR1MsVUFBSixFQUFnQixHQUFHakIsR0FBbkIsRUFBd0IzSyxNQUF4QixDQUErQm9MLElBQUksSUFBSUEsSUFBSSxLQUFLLElBQWhELENBQWIsQ0FGbUQsQ0FJbkQ7O0FBQ0FELElBQUFBLE1BQU0sR0FBRyxDQUFDLEdBQUcsSUFBSVUsR0FBSixDQUFRVixNQUFSLENBQUosQ0FBVCxDQUxtRCxDQU9uRDs7QUFDQSxRQUFJLEVBQUUsY0FBY3ZPLEtBQWhCLENBQUosRUFBNEI7QUFDMUJBLE1BQUFBLEtBQUssQ0FBQ2dFLFFBQU4sR0FBaUI7QUFDZmtMLFFBQUFBLElBQUksRUFBRTFHO0FBRFMsT0FBakI7QUFHRCxLQUpELE1BSU8sSUFBSSxPQUFPeEksS0FBSyxDQUFDZ0UsUUFBYixLQUEwQixRQUE5QixFQUF3QztBQUM3Q2hFLE1BQUFBLEtBQUssQ0FBQ2dFLFFBQU4sR0FBaUI7QUFDZmtMLFFBQUFBLElBQUksRUFBRTFHLFNBRFM7QUFFZnVHLFFBQUFBLEdBQUcsRUFBRS9PLEtBQUssQ0FBQ2dFO0FBRkksT0FBakI7QUFJRDs7QUFFRGhFLElBQUFBLEtBQUssQ0FBQ2dFLFFBQU4sQ0FBZSxNQUFmLElBQXlCdUssTUFBekI7QUFDQSxXQUFPdk8sS0FBUDtBQUNELEdBbnZCc0IsQ0FxdkJ2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNBK0osRUFBQUEsSUFBSSxDQUNGckgsU0FERSxFQUVGMUMsS0FGRSxFQUdGO0FBQ0U0TSxJQUFBQSxJQURGO0FBRUVDLElBQUFBLEtBRkY7QUFHRTVNLElBQUFBLEdBSEY7QUFJRTZNLElBQUFBLElBQUksR0FBRyxFQUpUO0FBS0VxQyxJQUFBQSxLQUxGO0FBTUVwTixJQUFBQSxJQU5GO0FBT0UwSSxJQUFBQSxFQVBGO0FBUUUyRSxJQUFBQSxRQVJGO0FBU0VDLElBQUFBLFFBVEY7QUFVRUMsSUFBQUEsY0FWRjtBQVdFQyxJQUFBQSxJQVhGO0FBWUVDLElBQUFBLGVBQWUsR0FBRyxLQVpwQjtBQWFFQyxJQUFBQTtBQWJGLE1BY1MsRUFqQlAsRUFrQkZsTixJQUFTLEdBQUcsRUFsQlYsRUFtQkYwRyxxQkFuQkUsRUFvQlk7QUFDZCxVQUFNNUcsUUFBUSxHQUFHcEMsR0FBRyxLQUFLdUksU0FBekI7QUFDQSxVQUFNbEcsUUFBUSxHQUFHckMsR0FBRyxJQUFJLEVBQXhCO0FBQ0F3SyxJQUFBQSxFQUFFLEdBQ0FBLEVBQUUsS0FBSyxPQUFPekssS0FBSyxDQUFDZ0UsUUFBYixJQUF5QixRQUF6QixJQUFxQ2xDLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZL0IsS0FBWixFQUFtQjZCLE1BQW5CLEtBQThCLENBQW5FLEdBQXVFLEtBQXZFLEdBQStFLE1BQXBGLENBREosQ0FIYyxDQUtkOztBQUNBNEksSUFBQUEsRUFBRSxHQUFHMEUsS0FBSyxLQUFLLElBQVYsR0FBaUIsT0FBakIsR0FBMkIxRSxFQUFoQztBQUVBLFFBQUl4RCxXQUFXLEdBQUcsSUFBbEI7QUFDQSxXQUFPLEtBQUtnQixrQkFBTCxDQUF3QmdCLHFCQUF4QixFQUErQzdCLElBQS9DLENBQW9EQyxnQkFBZ0IsSUFBSTtBQUM3RTtBQUNBO0FBQ0E7QUFDQSxhQUFPQSxnQkFBZ0IsQ0FDcEJDLFlBREksQ0FDUzVFLFNBRFQsRUFDb0JMLFFBRHBCLEVBRUptSCxLQUZJLENBRUVDLEtBQUssSUFBSTtBQUNkO0FBQ0E7QUFDQSxZQUFJQSxLQUFLLEtBQUtqQixTQUFkLEVBQXlCO0FBQ3ZCdkIsVUFBQUEsV0FBVyxHQUFHLEtBQWQ7QUFDQSxpQkFBTztBQUFFaEQsWUFBQUEsTUFBTSxFQUFFO0FBQVYsV0FBUDtBQUNEOztBQUNELGNBQU13RixLQUFOO0FBQ0QsT0FWSSxFQVdKckMsSUFYSSxDQVdDM0UsTUFBTSxJQUFJO0FBQ2Q7QUFDQTtBQUNBO0FBQ0EsWUFBSXFLLElBQUksQ0FBQzRDLFdBQVQsRUFBc0I7QUFDcEI1QyxVQUFBQSxJQUFJLENBQUN0QixTQUFMLEdBQWlCc0IsSUFBSSxDQUFDNEMsV0FBdEI7QUFDQSxpQkFBTzVDLElBQUksQ0FBQzRDLFdBQVo7QUFDRDs7QUFDRCxZQUFJNUMsSUFBSSxDQUFDNkMsV0FBVCxFQUFzQjtBQUNwQjdDLFVBQUFBLElBQUksQ0FBQ25CLFNBQUwsR0FBaUJtQixJQUFJLENBQUM2QyxXQUF0QjtBQUNBLGlCQUFPN0MsSUFBSSxDQUFDNkMsV0FBWjtBQUNEOztBQUNELGNBQU1oRCxZQUFZLEdBQUc7QUFDbkJDLFVBQUFBLElBRG1CO0FBRW5CQyxVQUFBQSxLQUZtQjtBQUduQkMsVUFBQUEsSUFIbUI7QUFJbkIvSyxVQUFBQSxJQUptQjtBQUtuQnVOLFVBQUFBLGNBTG1CO0FBTW5CQyxVQUFBQSxJQU5tQjtBQU9uQkMsVUFBQUEsZUFQbUI7QUFRbkJDLFVBQUFBO0FBUm1CLFNBQXJCO0FBVUEzTixRQUFBQSxNQUFNLENBQUNDLElBQVAsQ0FBWStLLElBQVosRUFBa0JwTCxPQUFsQixDQUEwQnNFLFNBQVMsSUFBSTtBQUNyQyxjQUFJQSxTQUFTLENBQUM5RCxLQUFWLENBQWdCLGlDQUFoQixDQUFKLEVBQXdEO0FBQ3RELGtCQUFNLElBQUliLFlBQU1DLEtBQVYsQ0FBZ0JELFlBQU1DLEtBQU4sQ0FBWWEsZ0JBQTVCLEVBQStDLGtCQUFpQjZELFNBQVUsRUFBMUUsQ0FBTjtBQUNEOztBQUNELGdCQUFNMEQsYUFBYSxHQUFHdEQsZ0JBQWdCLENBQUNKLFNBQUQsQ0FBdEM7O0FBQ0EsY0FBSSxDQUFDeUIsZ0JBQWdCLENBQUNrQyxnQkFBakIsQ0FBa0NELGFBQWxDLEVBQWlEaEgsU0FBakQsQ0FBTCxFQUFrRTtBQUNoRSxrQkFBTSxJQUFJckIsWUFBTUMsS0FBVixDQUNKRCxZQUFNQyxLQUFOLENBQVlhLGdCQURSLEVBRUgsdUJBQXNCNkQsU0FBVSxHQUY3QixDQUFOO0FBSUQ7QUFDRixTQVhEO0FBWUEsZUFBTyxDQUFDM0QsUUFBUSxHQUNac0YsT0FBTyxDQUFDRyxPQUFSLEVBRFksR0FFWlQsZ0JBQWdCLENBQUNnQyxrQkFBakIsQ0FBb0MzRyxTQUFwQyxFQUErQ0osUUFBL0MsRUFBeURtSSxFQUF6RCxDQUZHLEVBSUpyRCxJQUpJLENBSUMsTUFBTSxLQUFLOEcsa0JBQUwsQ0FBd0J4TCxTQUF4QixFQUFtQzFDLEtBQW5DLEVBQTBDMk0sWUFBMUMsQ0FKUCxFQUtKdkYsSUFMSSxDQUtDLE1BQU0sS0FBS2dHLGdCQUFMLENBQXNCMUssU0FBdEIsRUFBaUMxQyxLQUFqQyxFQUF3Q3FILGdCQUF4QyxDQUxQLEVBTUpELElBTkksQ0FNQyxNQUFNO0FBQ1YsY0FBSXpFLGVBQUo7O0FBQ0EsY0FBSSxDQUFDTixRQUFMLEVBQWU7QUFDYnJDLFlBQUFBLEtBQUssR0FBRyxLQUFLdUoscUJBQUwsQ0FDTmxDLGdCQURNLEVBRU4zRSxTQUZNLEVBR04rSCxFQUhNLEVBSU56SyxLQUpNLEVBS05zQyxRQUxNLENBQVI7QUFPQTtBQUNoQjtBQUNBOztBQUNnQkssWUFBQUEsZUFBZSxHQUFHLEtBQUtpTixrQkFBTCxDQUNoQnZJLGdCQURnQixFQUVoQjNFLFNBRmdCLEVBR2hCMUMsS0FIZ0IsRUFJaEJzQyxRQUpnQixFQUtoQkMsSUFMZ0IsRUFNaEJvSyxZQU5nQixDQUFsQjtBQVFEOztBQUNELGNBQUksQ0FBQzNNLEtBQUwsRUFBWTtBQUNWLGdCQUFJeUssRUFBRSxLQUFLLEtBQVgsRUFBa0I7QUFDaEIsb0JBQU0sSUFBSXBKLFlBQU1DLEtBQVYsQ0FBZ0JELFlBQU1DLEtBQU4sQ0FBWTBJLGdCQUE1QixFQUE4QyxtQkFBOUMsQ0FBTjtBQUNELGFBRkQsTUFFTztBQUNMLHFCQUFPLEVBQVA7QUFDRDtBQUNGOztBQUNELGNBQUksQ0FBQzNILFFBQUwsRUFBZTtBQUNiLGdCQUFJb0ksRUFBRSxLQUFLLFFBQVAsSUFBbUJBLEVBQUUsS0FBSyxRQUE5QixFQUF3QztBQUN0Q3pLLGNBQUFBLEtBQUssR0FBR0QsV0FBVyxDQUFDQyxLQUFELEVBQVFzQyxRQUFSLENBQW5CO0FBQ0QsYUFGRCxNQUVPO0FBQ0x0QyxjQUFBQSxLQUFLLEdBQUdPLFVBQVUsQ0FBQ1AsS0FBRCxFQUFRc0MsUUFBUixDQUFsQjtBQUNEO0FBQ0Y7O0FBQ0RsQixVQUFBQSxhQUFhLENBQUNwQixLQUFELENBQWI7O0FBQ0EsY0FBSW1QLEtBQUosRUFBVztBQUNULGdCQUFJLENBQUNsSSxXQUFMLEVBQWtCO0FBQ2hCLHFCQUFPLENBQVA7QUFDRCxhQUZELE1BRU87QUFDTCxxQkFBTyxLQUFLTixPQUFMLENBQWF3SSxLQUFiLENBQ0x6TSxTQURLLEVBRUxELE1BRkssRUFHTHpDLEtBSEssRUFJTHNQLGNBSkssRUFLTDlHLFNBTEssRUFNTCtHLElBTkssQ0FBUDtBQVFEO0FBQ0YsV0FiRCxNQWFPLElBQUlILFFBQUosRUFBYztBQUNuQixnQkFBSSxDQUFDbkksV0FBTCxFQUFrQjtBQUNoQixxQkFBTyxFQUFQO0FBQ0QsYUFGRCxNQUVPO0FBQ0wscUJBQU8sS0FBS04sT0FBTCxDQUFheUksUUFBYixDQUFzQjFNLFNBQXRCLEVBQWlDRCxNQUFqQyxFQUF5Q3pDLEtBQXpDLEVBQWdEb1AsUUFBaEQsQ0FBUDtBQUNEO0FBQ0YsV0FOTSxNQU1BLElBQUlDLFFBQUosRUFBYztBQUNuQixnQkFBSSxDQUFDcEksV0FBTCxFQUFrQjtBQUNoQixxQkFBTyxFQUFQO0FBQ0QsYUFGRCxNQUVPO0FBQ0wscUJBQU8sS0FBS04sT0FBTCxDQUFha0osU0FBYixDQUNMbk4sU0FESyxFQUVMRCxNQUZLLEVBR0w0TSxRQUhLLEVBSUxDLGNBSkssRUFLTEMsSUFMSyxFQU1MRSxPQU5LLENBQVA7QUFRRDtBQUNGLFdBYk0sTUFhQSxJQUFJQSxPQUFKLEVBQWE7QUFDbEIsbUJBQU8sS0FBSzlJLE9BQUwsQ0FBYW9ELElBQWIsQ0FBa0JySCxTQUFsQixFQUE2QkQsTUFBN0IsRUFBcUN6QyxLQUFyQyxFQUE0QzJNLFlBQTVDLENBQVA7QUFDRCxXQUZNLE1BRUE7QUFDTCxtQkFBTyxLQUFLaEcsT0FBTCxDQUNKb0QsSUFESSxDQUNDckgsU0FERCxFQUNZRCxNQURaLEVBQ29CekMsS0FEcEIsRUFDMkIyTSxZQUQzQixFQUVKdkYsSUFGSSxDQUVDekIsT0FBTyxJQUNYQSxPQUFPLENBQUNyQyxHQUFSLENBQVlWLE1BQU0sSUFBSTtBQUNwQkEsY0FBQUEsTUFBTSxHQUFHc0Qsb0JBQW9CLENBQUN0RCxNQUFELENBQTdCO0FBQ0EscUJBQU9SLG1CQUFtQixDQUN4QkMsUUFEd0IsRUFFeEJDLFFBRndCLEVBR3hCQyxJQUh3QixFQUl4QmtJLEVBSndCLEVBS3hCcEQsZ0JBTHdCLEVBTXhCM0UsU0FOd0IsRUFPeEJDLGVBUHdCLEVBUXhCQyxNQVJ3QixDQUExQjtBQVVELGFBWkQsQ0FIRyxFQWlCSjRHLEtBakJJLENBaUJFQyxLQUFLLElBQUk7QUFDZCxvQkFBTSxJQUFJcEksWUFBTUMsS0FBVixDQUFnQkQsWUFBTUMsS0FBTixDQUFZd08scUJBQTVCLEVBQW1EckcsS0FBbkQsQ0FBTjtBQUNELGFBbkJJLENBQVA7QUFvQkQ7QUFDRixTQW5HSSxDQUFQO0FBb0dELE9BakpJLENBQVA7QUFrSkQsS0F0Sk0sQ0FBUDtBQXVKRDs7QUFFRHNHLEVBQUFBLFlBQVksQ0FBQ3JOLFNBQUQsRUFBbUM7QUFDN0MsUUFBSTJFLGdCQUFKO0FBQ0EsV0FBTyxLQUFLRixVQUFMLENBQWdCO0FBQUVZLE1BQUFBLFVBQVUsRUFBRTtBQUFkLEtBQWhCLEVBQ0pYLElBREksQ0FDQ3FCLENBQUMsSUFBSTtBQUNUcEIsTUFBQUEsZ0JBQWdCLEdBQUdvQixDQUFuQjtBQUNBLGFBQU9wQixnQkFBZ0IsQ0FBQ0MsWUFBakIsQ0FBOEI1RSxTQUE5QixFQUF5QyxJQUF6QyxDQUFQO0FBQ0QsS0FKSSxFQUtKOEcsS0FMSSxDQUtFQyxLQUFLLElBQUk7QUFDZCxVQUFJQSxLQUFLLEtBQUtqQixTQUFkLEVBQXlCO0FBQ3ZCLGVBQU87QUFBRXZFLFVBQUFBLE1BQU0sRUFBRTtBQUFWLFNBQVA7QUFDRCxPQUZELE1BRU87QUFDTCxjQUFNd0YsS0FBTjtBQUNEO0FBQ0YsS0FYSSxFQVlKckMsSUFaSSxDQVlFM0UsTUFBRCxJQUFpQjtBQUNyQixhQUFPLEtBQUt1RSxnQkFBTCxDQUFzQnRFLFNBQXRCLEVBQ0owRSxJQURJLENBQ0MsTUFBTSxLQUFLVCxPQUFMLENBQWF3SSxLQUFiLENBQW1Cek0sU0FBbkIsRUFBOEI7QUFBRXVCLFFBQUFBLE1BQU0sRUFBRTtBQUFWLE9BQTlCLEVBQThDLElBQTlDLEVBQW9ELEVBQXBELEVBQXdELEtBQXhELENBRFAsRUFFSm1ELElBRkksQ0FFQytILEtBQUssSUFBSTtBQUNiLFlBQUlBLEtBQUssR0FBRyxDQUFaLEVBQWU7QUFDYixnQkFBTSxJQUFJOU4sWUFBTUMsS0FBVixDQUNKLEdBREksRUFFSCxTQUFRb0IsU0FBVSwyQkFBMEJ5TSxLQUFNLCtCQUYvQyxDQUFOO0FBSUQ7O0FBQ0QsZUFBTyxLQUFLeEksT0FBTCxDQUFhcUosV0FBYixDQUF5QnROLFNBQXpCLENBQVA7QUFDRCxPQVZJLEVBV0owRSxJQVhJLENBV0M2SSxrQkFBa0IsSUFBSTtBQUMxQixZQUFJQSxrQkFBSixFQUF3QjtBQUN0QixnQkFBTUMsa0JBQWtCLEdBQUdwTyxNQUFNLENBQUNDLElBQVAsQ0FBWVUsTUFBTSxDQUFDd0IsTUFBbkIsRUFBMkJiLE1BQTNCLENBQ3pCNEMsU0FBUyxJQUFJdkQsTUFBTSxDQUFDd0IsTUFBUCxDQUFjK0IsU0FBZCxFQUF5QkMsSUFBekIsS0FBa0MsVUFEdEIsQ0FBM0I7QUFHQSxpQkFBTzBCLE9BQU8sQ0FBQ21ELEdBQVIsQ0FDTG9GLGtCQUFrQixDQUFDNU0sR0FBbkIsQ0FBdUI2TSxJQUFJLElBQ3pCLEtBQUt4SixPQUFMLENBQWFxSixXQUFiLENBQXlCMUssYUFBYSxDQUFDNUMsU0FBRCxFQUFZeU4sSUFBWixDQUF0QyxDQURGLENBREssRUFJTC9JLElBSkssQ0FJQSxNQUFNO0FBQ1htRixpQ0FBWTZELEdBQVosQ0FBZ0IxTixTQUFoQjs7QUFDQSxtQkFBTzJFLGdCQUFnQixDQUFDZ0osVUFBakIsRUFBUDtBQUNELFdBUE0sQ0FBUDtBQVFELFNBWkQsTUFZTztBQUNMLGlCQUFPMUksT0FBTyxDQUFDRyxPQUFSLEVBQVA7QUFDRDtBQUNGLE9BM0JJLENBQVA7QUE0QkQsS0F6Q0ksQ0FBUDtBQTBDRCxHQXQrQnNCLENBdytCdkI7QUFDQTtBQUNBOzs7QUFDQXdJLEVBQUFBLHNCQUFzQixDQUFDdFEsS0FBRCxFQUE0QjtBQUNoRCxXQUFPOEIsTUFBTSxDQUFDeU8sT0FBUCxDQUFldlEsS0FBZixFQUFzQnNELEdBQXRCLENBQTBCa04sQ0FBQyxJQUFJQSxDQUFDLENBQUNsTixHQUFGLENBQU1tRixDQUFDLElBQUlnSSxJQUFJLENBQUNDLFNBQUwsQ0FBZWpJLENBQWYsQ0FBWCxFQUE4QmtJLElBQTlCLENBQW1DLEdBQW5DLENBQS9CLENBQVA7QUFDRCxHQTcrQnNCLENBKytCdkI7OztBQUNBQyxFQUFBQSxpQkFBaUIsQ0FBQzVRLEtBQUQsRUFBa0M7QUFDakQsUUFBSSxDQUFDQSxLQUFLLENBQUN3QixHQUFYLEVBQWdCO0FBQ2QsYUFBT3hCLEtBQVA7QUFDRDs7QUFDRCxVQUFNME4sT0FBTyxHQUFHMU4sS0FBSyxDQUFDd0IsR0FBTixDQUFVOEIsR0FBVixDQUFjd0ssQ0FBQyxJQUFJLEtBQUt3QyxzQkFBTCxDQUE0QnhDLENBQTVCLENBQW5CLENBQWhCO0FBQ0EsUUFBSStDLE1BQU0sR0FBRyxLQUFiOztBQUNBLE9BQUc7QUFDREEsTUFBQUEsTUFBTSxHQUFHLEtBQVQ7O0FBQ0EsV0FBSyxJQUFJQyxDQUFDLEdBQUcsQ0FBYixFQUFnQkEsQ0FBQyxHQUFHcEQsT0FBTyxDQUFDN0wsTUFBUixHQUFpQixDQUFyQyxFQUF3Q2lQLENBQUMsRUFBekMsRUFBNkM7QUFDM0MsYUFBSyxJQUFJQyxDQUFDLEdBQUdELENBQUMsR0FBRyxDQUFqQixFQUFvQkMsQ0FBQyxHQUFHckQsT0FBTyxDQUFDN0wsTUFBaEMsRUFBd0NrUCxDQUFDLEVBQXpDLEVBQTZDO0FBQzNDLGdCQUFNLENBQUNDLE9BQUQsRUFBVUMsTUFBVixJQUFvQnZELE9BQU8sQ0FBQ29ELENBQUQsQ0FBUCxDQUFXalAsTUFBWCxHQUFvQjZMLE9BQU8sQ0FBQ3FELENBQUQsQ0FBUCxDQUFXbFAsTUFBL0IsR0FBd0MsQ0FBQ2tQLENBQUQsRUFBSUQsQ0FBSixDQUF4QyxHQUFpRCxDQUFDQSxDQUFELEVBQUlDLENBQUosQ0FBM0U7QUFDQSxnQkFBTUcsWUFBWSxHQUFHeEQsT0FBTyxDQUFDc0QsT0FBRCxDQUFQLENBQWlCdEMsTUFBakIsQ0FDbkIsQ0FBQ3lDLEdBQUQsRUFBTXZRLEtBQU4sS0FBZ0J1USxHQUFHLElBQUl6RCxPQUFPLENBQUN1RCxNQUFELENBQVAsQ0FBZ0I5TSxRQUFoQixDQUF5QnZELEtBQXpCLElBQWtDLENBQWxDLEdBQXNDLENBQTFDLENBREEsRUFFbkIsQ0FGbUIsQ0FBckI7QUFJQSxnQkFBTXdRLGNBQWMsR0FBRzFELE9BQU8sQ0FBQ3NELE9BQUQsQ0FBUCxDQUFpQm5QLE1BQXhDOztBQUNBLGNBQUlxUCxZQUFZLEtBQUtFLGNBQXJCLEVBQXFDO0FBQ25DO0FBQ0E7QUFDQXBSLFlBQUFBLEtBQUssQ0FBQ3dCLEdBQU4sQ0FBVTZQLE1BQVYsQ0FBaUJKLE1BQWpCLEVBQXlCLENBQXpCO0FBQ0F2RCxZQUFBQSxPQUFPLENBQUMyRCxNQUFSLENBQWVKLE1BQWYsRUFBdUIsQ0FBdkI7QUFDQUosWUFBQUEsTUFBTSxHQUFHLElBQVQ7QUFDQTtBQUNEO0FBQ0Y7QUFDRjtBQUNGLEtBcEJELFFBb0JTQSxNQXBCVDs7QUFxQkEsUUFBSTdRLEtBQUssQ0FBQ3dCLEdBQU4sQ0FBVUssTUFBVixLQUFxQixDQUF6QixFQUE0QjtBQUMxQjdCLE1BQUFBLEtBQUssbUNBQVFBLEtBQVIsR0FBa0JBLEtBQUssQ0FBQ3dCLEdBQU4sQ0FBVSxDQUFWLENBQWxCLENBQUw7QUFDQSxhQUFPeEIsS0FBSyxDQUFDd0IsR0FBYjtBQUNEOztBQUNELFdBQU94QixLQUFQO0FBQ0QsR0FoaENzQixDQWtoQ3ZCOzs7QUFDQXNSLEVBQUFBLGtCQUFrQixDQUFDdFIsS0FBRCxFQUFtQztBQUNuRCxRQUFJLENBQUNBLEtBQUssQ0FBQzJCLElBQVgsRUFBaUI7QUFDZixhQUFPM0IsS0FBUDtBQUNEOztBQUNELFVBQU0wTixPQUFPLEdBQUcxTixLQUFLLENBQUMyQixJQUFOLENBQVcyQixHQUFYLENBQWV3SyxDQUFDLElBQUksS0FBS3dDLHNCQUFMLENBQTRCeEMsQ0FBNUIsQ0FBcEIsQ0FBaEI7QUFDQSxRQUFJK0MsTUFBTSxHQUFHLEtBQWI7O0FBQ0EsT0FBRztBQUNEQSxNQUFBQSxNQUFNLEdBQUcsS0FBVDs7QUFDQSxXQUFLLElBQUlDLENBQUMsR0FBRyxDQUFiLEVBQWdCQSxDQUFDLEdBQUdwRCxPQUFPLENBQUM3TCxNQUFSLEdBQWlCLENBQXJDLEVBQXdDaVAsQ0FBQyxFQUF6QyxFQUE2QztBQUMzQyxhQUFLLElBQUlDLENBQUMsR0FBR0QsQ0FBQyxHQUFHLENBQWpCLEVBQW9CQyxDQUFDLEdBQUdyRCxPQUFPLENBQUM3TCxNQUFoQyxFQUF3Q2tQLENBQUMsRUFBekMsRUFBNkM7QUFDM0MsZ0JBQU0sQ0FBQ0MsT0FBRCxFQUFVQyxNQUFWLElBQW9CdkQsT0FBTyxDQUFDb0QsQ0FBRCxDQUFQLENBQVdqUCxNQUFYLEdBQW9CNkwsT0FBTyxDQUFDcUQsQ0FBRCxDQUFQLENBQVdsUCxNQUEvQixHQUF3QyxDQUFDa1AsQ0FBRCxFQUFJRCxDQUFKLENBQXhDLEdBQWlELENBQUNBLENBQUQsRUFBSUMsQ0FBSixDQUEzRTtBQUNBLGdCQUFNRyxZQUFZLEdBQUd4RCxPQUFPLENBQUNzRCxPQUFELENBQVAsQ0FBaUJ0QyxNQUFqQixDQUNuQixDQUFDeUMsR0FBRCxFQUFNdlEsS0FBTixLQUFnQnVRLEdBQUcsSUFBSXpELE9BQU8sQ0FBQ3VELE1BQUQsQ0FBUCxDQUFnQjlNLFFBQWhCLENBQXlCdkQsS0FBekIsSUFBa0MsQ0FBbEMsR0FBc0MsQ0FBMUMsQ0FEQSxFQUVuQixDQUZtQixDQUFyQjtBQUlBLGdCQUFNd1EsY0FBYyxHQUFHMUQsT0FBTyxDQUFDc0QsT0FBRCxDQUFQLENBQWlCblAsTUFBeEM7O0FBQ0EsY0FBSXFQLFlBQVksS0FBS0UsY0FBckIsRUFBcUM7QUFDbkM7QUFDQTtBQUNBcFIsWUFBQUEsS0FBSyxDQUFDMkIsSUFBTixDQUFXMFAsTUFBWCxDQUFrQkwsT0FBbEIsRUFBMkIsQ0FBM0I7QUFDQXRELFlBQUFBLE9BQU8sQ0FBQzJELE1BQVIsQ0FBZUwsT0FBZixFQUF3QixDQUF4QjtBQUNBSCxZQUFBQSxNQUFNLEdBQUcsSUFBVDtBQUNBO0FBQ0Q7QUFDRjtBQUNGO0FBQ0YsS0FwQkQsUUFvQlNBLE1BcEJUOztBQXFCQSxRQUFJN1EsS0FBSyxDQUFDMkIsSUFBTixDQUFXRSxNQUFYLEtBQXNCLENBQTFCLEVBQTZCO0FBQzNCN0IsTUFBQUEsS0FBSyxtQ0FBUUEsS0FBUixHQUFrQkEsS0FBSyxDQUFDMkIsSUFBTixDQUFXLENBQVgsQ0FBbEIsQ0FBTDtBQUNBLGFBQU8zQixLQUFLLENBQUMyQixJQUFiO0FBQ0Q7O0FBQ0QsV0FBTzNCLEtBQVA7QUFDRCxHQW5qQ3NCLENBcWpDdkI7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0F1SixFQUFBQSxxQkFBcUIsQ0FDbkI5RyxNQURtQixFQUVuQkMsU0FGbUIsRUFHbkJGLFNBSG1CLEVBSW5CeEMsS0FKbUIsRUFLbkJzQyxRQUFlLEdBQUcsRUFMQyxFQU1kO0FBQ0w7QUFDQTtBQUNBLFFBQUlHLE1BQU0sQ0FBQzhPLDJCQUFQLENBQW1DN08sU0FBbkMsRUFBOENKLFFBQTlDLEVBQXdERSxTQUF4RCxDQUFKLEVBQXdFO0FBQ3RFLGFBQU94QyxLQUFQO0FBQ0Q7O0FBQ0QsVUFBTWdELEtBQUssR0FBR1AsTUFBTSxDQUFDUSx3QkFBUCxDQUFnQ1AsU0FBaEMsQ0FBZDtBQUVBLFVBQU04TyxPQUFPLEdBQUdsUCxRQUFRLENBQUNjLE1BQVQsQ0FBZ0JuRCxHQUFHLElBQUk7QUFDckMsYUFBT0EsR0FBRyxDQUFDa0IsT0FBSixDQUFZLE9BQVosS0FBd0IsQ0FBeEIsSUFBNkJsQixHQUFHLElBQUksR0FBM0M7QUFDRCxLQUZlLENBQWhCO0FBSUEsVUFBTXdSLFFBQVEsR0FDWixDQUFDLEtBQUQsRUFBUSxNQUFSLEVBQWdCLE9BQWhCLEVBQXlCdFEsT0FBekIsQ0FBaUNxQixTQUFqQyxJQUE4QyxDQUFDLENBQS9DLEdBQW1ELGdCQUFuRCxHQUFzRSxpQkFEeEU7QUFHQSxVQUFNa1AsVUFBVSxHQUFHLEVBQW5COztBQUVBLFFBQUkxTyxLQUFLLENBQUNSLFNBQUQsQ0FBTCxJQUFvQlEsS0FBSyxDQUFDUixTQUFELENBQUwsQ0FBaUJtUCxhQUF6QyxFQUF3RDtBQUN0REQsTUFBQUEsVUFBVSxDQUFDNVEsSUFBWCxDQUFnQixHQUFHa0MsS0FBSyxDQUFDUixTQUFELENBQUwsQ0FBaUJtUCxhQUFwQztBQUNEOztBQUVELFFBQUkzTyxLQUFLLENBQUN5TyxRQUFELENBQVQsRUFBcUI7QUFDbkIsV0FBSyxNQUFNdEYsS0FBWCxJQUFvQm5KLEtBQUssQ0FBQ3lPLFFBQUQsQ0FBekIsRUFBcUM7QUFDbkMsWUFBSSxDQUFDQyxVQUFVLENBQUN2TixRQUFYLENBQW9CZ0ksS0FBcEIsQ0FBTCxFQUFpQztBQUMvQnVGLFVBQUFBLFVBQVUsQ0FBQzVRLElBQVgsQ0FBZ0JxTCxLQUFoQjtBQUNEO0FBQ0Y7QUFDRixLQTNCSSxDQTRCTDs7O0FBQ0EsUUFBSXVGLFVBQVUsQ0FBQzdQLE1BQVgsR0FBb0IsQ0FBeEIsRUFBMkI7QUFDekI7QUFDQTtBQUNBO0FBQ0EsVUFBSTJQLE9BQU8sQ0FBQzNQLE1BQVIsSUFBa0IsQ0FBdEIsRUFBeUI7QUFDdkI7QUFDRDs7QUFDRCxZQUFNZ0IsTUFBTSxHQUFHMk8sT0FBTyxDQUFDLENBQUQsQ0FBdEI7QUFDQSxZQUFNSSxXQUFXLEdBQUc7QUFDbEJsRyxRQUFBQSxNQUFNLEVBQUUsU0FEVTtBQUVsQmhKLFFBQUFBLFNBQVMsRUFBRSxPQUZPO0FBR2xCc0IsUUFBQUEsUUFBUSxFQUFFbkI7QUFIUSxPQUFwQjtBQU1BLFlBQU02SyxPQUFPLEdBQUdnRSxVQUFVLENBQUNwTyxHQUFYLENBQWVwQyxHQUFHLElBQUk7QUFDcEMsY0FBTTJRLGVBQWUsR0FBR3BQLE1BQU0sQ0FBQzJGLGVBQVAsQ0FBdUIxRixTQUF2QixFQUFrQ3hCLEdBQWxDLENBQXhCO0FBQ0EsY0FBTTRRLFNBQVMsR0FDYkQsZUFBZSxJQUNiLE9BQU9BLGVBQVAsS0FBMkIsUUFEN0IsSUFFRS9QLE1BQU0sQ0FBQ2lRLFNBQVAsQ0FBaUJDLGNBQWpCLENBQWdDQyxJQUFoQyxDQUFxQ0osZUFBckMsRUFBc0QsTUFBdEQsQ0FGRixHQUdJQSxlQUFlLENBQUM1TCxJQUhwQixHQUlJLElBTE47QUFPQSxZQUFJaU0sV0FBSjs7QUFFQSxZQUFJSixTQUFTLEtBQUssU0FBbEIsRUFBNkI7QUFDM0I7QUFDQUksVUFBQUEsV0FBVyxHQUFHO0FBQUUsYUFBQ2hSLEdBQUQsR0FBTzBRO0FBQVQsV0FBZDtBQUNELFNBSEQsTUFHTyxJQUFJRSxTQUFTLEtBQUssT0FBbEIsRUFBMkI7QUFDaEM7QUFDQUksVUFBQUEsV0FBVyxHQUFHO0FBQUUsYUFBQ2hSLEdBQUQsR0FBTztBQUFFaVIsY0FBQUEsSUFBSSxFQUFFLENBQUNQLFdBQUQ7QUFBUjtBQUFULFdBQWQ7QUFDRCxTQUhNLE1BR0EsSUFBSUUsU0FBUyxLQUFLLFFBQWxCLEVBQTRCO0FBQ2pDO0FBQ0FJLFVBQUFBLFdBQVcsR0FBRztBQUFFLGFBQUNoUixHQUFELEdBQU8wUTtBQUFULFdBQWQ7QUFDRCxTQUhNLE1BR0E7QUFDTDtBQUNBO0FBQ0EsZ0JBQU10USxLQUFLLENBQ1Isd0VBQXVFb0IsU0FBVSxJQUFHeEIsR0FBSSxFQURoRixDQUFYO0FBR0QsU0ExQm1DLENBMkJwQzs7O0FBQ0EsWUFBSVksTUFBTSxDQUFDaVEsU0FBUCxDQUFpQkMsY0FBakIsQ0FBZ0NDLElBQWhDLENBQXFDalMsS0FBckMsRUFBNENrQixHQUE1QyxDQUFKLEVBQXNEO0FBQ3BELGlCQUFPLEtBQUtvUSxrQkFBTCxDQUF3QjtBQUFFM1AsWUFBQUEsSUFBSSxFQUFFLENBQUN1USxXQUFELEVBQWNsUyxLQUFkO0FBQVIsV0FBeEIsQ0FBUDtBQUNELFNBOUJtQyxDQStCcEM7OztBQUNBLGVBQU84QixNQUFNLENBQUNzUSxNQUFQLENBQWMsRUFBZCxFQUFrQnBTLEtBQWxCLEVBQXlCa1MsV0FBekIsQ0FBUDtBQUNELE9BakNlLENBQWhCO0FBbUNBLGFBQU94RSxPQUFPLENBQUM3TCxNQUFSLEtBQW1CLENBQW5CLEdBQXVCNkwsT0FBTyxDQUFDLENBQUQsQ0FBOUIsR0FBb0MsS0FBS2tELGlCQUFMLENBQXVCO0FBQUVwUCxRQUFBQSxHQUFHLEVBQUVrTTtBQUFQLE9BQXZCLENBQTNDO0FBQ0QsS0FsREQsTUFrRE87QUFDTCxhQUFPMU4sS0FBUDtBQUNEO0FBQ0Y7O0FBRUQ0UCxFQUFBQSxrQkFBa0IsQ0FDaEJuTixNQURnQixFQUVoQkMsU0FGZ0IsRUFHaEIxQyxLQUFVLEdBQUcsRUFIRyxFQUloQnNDLFFBQWUsR0FBRyxFQUpGLEVBS2hCQyxJQUFTLEdBQUcsRUFMSSxFQU1oQm9LLFlBQThCLEdBQUcsRUFOakIsRUFPQztBQUNqQixVQUFNM0osS0FBSyxHQUFHUCxNQUFNLENBQUNRLHdCQUFQLENBQWdDUCxTQUFoQyxDQUFkO0FBQ0EsUUFBSSxDQUFDTSxLQUFMLEVBQVksT0FBTyxJQUFQO0FBRVosVUFBTUwsZUFBZSxHQUFHSyxLQUFLLENBQUNMLGVBQTlCO0FBQ0EsUUFBSSxDQUFDQSxlQUFMLEVBQXNCLE9BQU8sSUFBUDtBQUV0QixRQUFJTCxRQUFRLENBQUNuQixPQUFULENBQWlCbkIsS0FBSyxDQUFDZ0UsUUFBdkIsSUFBbUMsQ0FBQyxDQUF4QyxFQUEyQyxPQUFPLElBQVAsQ0FQMUIsQ0FTakI7QUFDQTtBQUNBO0FBQ0E7O0FBQ0EsVUFBTXFPLFlBQVksR0FBRzFGLFlBQVksQ0FBQzVLLElBQWxDLENBYmlCLENBZWpCO0FBQ0E7QUFDQTs7QUFDQSxVQUFNdVEsY0FBYyxHQUFHLEVBQXZCO0FBRUEsVUFBTUMsYUFBYSxHQUFHaFEsSUFBSSxDQUFDTyxJQUEzQixDQXBCaUIsQ0FzQmpCOztBQUNBLFVBQU0wUCxLQUFLLEdBQUcsQ0FBQ2pRLElBQUksQ0FBQ2tRLFNBQUwsSUFBa0IsRUFBbkIsRUFBdUIvRCxNQUF2QixDQUE4QixDQUFDeUMsR0FBRCxFQUFNdEQsQ0FBTixLQUFZO0FBQ3REc0QsTUFBQUEsR0FBRyxDQUFDdEQsQ0FBRCxDQUFILEdBQVNsTCxlQUFlLENBQUNrTCxDQUFELENBQXhCO0FBQ0EsYUFBT3NELEdBQVA7QUFDRCxLQUhhLEVBR1gsRUFIVyxDQUFkLENBdkJpQixDQTRCakI7O0FBQ0EsVUFBTXVCLGlCQUFpQixHQUFHLEVBQTFCOztBQUVBLFNBQUssTUFBTXhSLEdBQVgsSUFBa0J5QixlQUFsQixFQUFtQztBQUNqQztBQUNBLFVBQUl6QixHQUFHLENBQUNtQyxVQUFKLENBQWUsWUFBZixDQUFKLEVBQWtDO0FBQ2hDLFlBQUlnUCxZQUFKLEVBQWtCO0FBQ2hCLGdCQUFNck0sU0FBUyxHQUFHOUUsR0FBRyxDQUFDcUMsU0FBSixDQUFjLEVBQWQsQ0FBbEI7O0FBQ0EsY0FBSSxDQUFDOE8sWUFBWSxDQUFDbE8sUUFBYixDQUFzQjZCLFNBQXRCLENBQUwsRUFBdUM7QUFDckM7QUFDQTJHLFlBQUFBLFlBQVksQ0FBQzVLLElBQWIsSUFBcUI0SyxZQUFZLENBQUM1SyxJQUFiLENBQWtCakIsSUFBbEIsQ0FBdUJrRixTQUF2QixDQUFyQixDQUZxQyxDQUdyQzs7QUFDQXNNLFlBQUFBLGNBQWMsQ0FBQ3hSLElBQWYsQ0FBb0JrRixTQUFwQjtBQUNEO0FBQ0Y7O0FBQ0Q7QUFDRCxPQWJnQyxDQWVqQzs7O0FBQ0EsVUFBSTlFLEdBQUcsS0FBSyxHQUFaLEVBQWlCO0FBQ2Z3UixRQUFBQSxpQkFBaUIsQ0FBQzVSLElBQWxCLENBQXVCNkIsZUFBZSxDQUFDekIsR0FBRCxDQUF0QztBQUNBO0FBQ0Q7O0FBRUQsVUFBSXFSLGFBQUosRUFBbUI7QUFDakIsWUFBSXJSLEdBQUcsS0FBSyxlQUFaLEVBQTZCO0FBQzNCO0FBQ0F3UixVQUFBQSxpQkFBaUIsQ0FBQzVSLElBQWxCLENBQXVCNkIsZUFBZSxDQUFDekIsR0FBRCxDQUF0QztBQUNBO0FBQ0Q7O0FBRUQsWUFBSXNSLEtBQUssQ0FBQ3RSLEdBQUQsQ0FBTCxJQUFjQSxHQUFHLENBQUNtQyxVQUFKLENBQWUsT0FBZixDQUFsQixFQUEyQztBQUN6QztBQUNBcVAsVUFBQUEsaUJBQWlCLENBQUM1UixJQUFsQixDQUF1QjBSLEtBQUssQ0FBQ3RSLEdBQUQsQ0FBNUI7QUFDRDtBQUNGO0FBQ0YsS0FoRWdCLENBa0VqQjs7O0FBQ0EsUUFBSXFSLGFBQUosRUFBbUI7QUFDakIsWUFBTTFQLE1BQU0sR0FBR04sSUFBSSxDQUFDTyxJQUFMLENBQVVDLEVBQXpCOztBQUNBLFVBQUlDLEtBQUssQ0FBQ0wsZUFBTixDQUFzQkUsTUFBdEIsQ0FBSixFQUFtQztBQUNqQzZQLFFBQUFBLGlCQUFpQixDQUFDNVIsSUFBbEIsQ0FBdUJrQyxLQUFLLENBQUNMLGVBQU4sQ0FBc0JFLE1BQXRCLENBQXZCO0FBQ0Q7QUFDRixLQXhFZ0IsQ0EwRWpCOzs7QUFDQSxRQUFJeVAsY0FBYyxDQUFDelEsTUFBZixHQUF3QixDQUE1QixFQUErQjtBQUM3Qm1CLE1BQUFBLEtBQUssQ0FBQ0wsZUFBTixDQUFzQjJCLGFBQXRCLEdBQXNDZ08sY0FBdEM7QUFDRDs7QUFFRCxRQUFJSyxhQUFhLEdBQUdELGlCQUFpQixDQUFDaEUsTUFBbEIsQ0FBeUIsQ0FBQ3lDLEdBQUQsRUFBTXlCLElBQU4sS0FBZTtBQUMxRCxVQUFJQSxJQUFKLEVBQVU7QUFDUnpCLFFBQUFBLEdBQUcsQ0FBQ3JRLElBQUosQ0FBUyxHQUFHOFIsSUFBWjtBQUNEOztBQUNELGFBQU96QixHQUFQO0FBQ0QsS0FMbUIsRUFLakIsRUFMaUIsQ0FBcEIsQ0EvRWlCLENBc0ZqQjs7QUFDQXVCLElBQUFBLGlCQUFpQixDQUFDaFIsT0FBbEIsQ0FBMEJ1QyxNQUFNLElBQUk7QUFDbEMsVUFBSUEsTUFBSixFQUFZO0FBQ1YwTyxRQUFBQSxhQUFhLEdBQUdBLGFBQWEsQ0FBQ3ZQLE1BQWQsQ0FBcUJjLENBQUMsSUFBSUQsTUFBTSxDQUFDRSxRQUFQLENBQWdCRCxDQUFoQixDQUExQixDQUFoQjtBQUNEO0FBQ0YsS0FKRDtBQU1BLFdBQU95TyxhQUFQO0FBQ0Q7O0FBRURFLEVBQUFBLDBCQUEwQixHQUFHO0FBQzNCLFdBQU8sS0FBS2xNLE9BQUwsQ0FBYWtNLDBCQUFiLEdBQTBDekwsSUFBMUMsQ0FBK0MwTCxvQkFBb0IsSUFBSTtBQUM1RSxXQUFLL0wscUJBQUwsR0FBNkIrTCxvQkFBN0I7QUFDRCxLQUZNLENBQVA7QUFHRDs7QUFFREMsRUFBQUEsMEJBQTBCLEdBQUc7QUFDM0IsUUFBSSxDQUFDLEtBQUtoTSxxQkFBVixFQUFpQztBQUMvQixZQUFNLElBQUl6RixLQUFKLENBQVUsNkNBQVYsQ0FBTjtBQUNEOztBQUNELFdBQU8sS0FBS3FGLE9BQUwsQ0FBYW9NLDBCQUFiLENBQXdDLEtBQUtoTSxxQkFBN0MsRUFBb0VLLElBQXBFLENBQXlFLE1BQU07QUFDcEYsV0FBS0wscUJBQUwsR0FBNkIsSUFBN0I7QUFDRCxLQUZNLENBQVA7QUFHRDs7QUFFRGlNLEVBQUFBLHlCQUF5QixHQUFHO0FBQzFCLFFBQUksQ0FBQyxLQUFLak0scUJBQVYsRUFBaUM7QUFDL0IsWUFBTSxJQUFJekYsS0FBSixDQUFVLDRDQUFWLENBQU47QUFDRDs7QUFDRCxXQUFPLEtBQUtxRixPQUFMLENBQWFxTSx5QkFBYixDQUF1QyxLQUFLak0scUJBQTVDLEVBQW1FSyxJQUFuRSxDQUF3RSxNQUFNO0FBQ25GLFdBQUtMLHFCQUFMLEdBQTZCLElBQTdCO0FBQ0QsS0FGTSxDQUFQO0FBR0QsR0FqeENzQixDQW14Q3ZCO0FBQ0E7OztBQUMyQixRQUFyQmtNLHFCQUFxQixHQUFHO0FBQzVCLFVBQU0sS0FBS3RNLE9BQUwsQ0FBYXNNLHFCQUFiLENBQW1DO0FBQ3ZDQyxNQUFBQSxzQkFBc0IsRUFBRXpMLGdCQUFnQixDQUFDeUw7QUFERixLQUFuQyxDQUFOO0FBR0EsVUFBTUMsa0JBQWtCLEdBQUc7QUFDekJsUCxNQUFBQSxNQUFNLGtDQUNEd0QsZ0JBQWdCLENBQUMyTCxjQUFqQixDQUFnQ0MsUUFEL0IsR0FFRDVMLGdCQUFnQixDQUFDMkwsY0FBakIsQ0FBZ0NFLEtBRi9CO0FBRG1CLEtBQTNCO0FBTUEsVUFBTUMsa0JBQWtCLEdBQUc7QUFDekJ0UCxNQUFBQSxNQUFNLGtDQUNEd0QsZ0JBQWdCLENBQUMyTCxjQUFqQixDQUFnQ0MsUUFEL0IsR0FFRDVMLGdCQUFnQixDQUFDMkwsY0FBakIsQ0FBZ0NJLEtBRi9CO0FBRG1CLEtBQTNCO0FBTUEsVUFBTUMseUJBQXlCLEdBQUc7QUFDaEN4UCxNQUFBQSxNQUFNLGtDQUNEd0QsZ0JBQWdCLENBQUMyTCxjQUFqQixDQUFnQ0MsUUFEL0IsR0FFRDVMLGdCQUFnQixDQUFDMkwsY0FBakIsQ0FBZ0NNLFlBRi9CO0FBRDBCLEtBQWxDO0FBTUEsVUFBTSxLQUFLdk0sVUFBTCxHQUFrQkMsSUFBbEIsQ0FBdUIzRSxNQUFNLElBQUlBLE1BQU0sQ0FBQ21KLGtCQUFQLENBQTBCLE9BQTFCLENBQWpDLENBQU47QUFDQSxVQUFNLEtBQUt6RSxVQUFMLEdBQWtCQyxJQUFsQixDQUF1QjNFLE1BQU0sSUFBSUEsTUFBTSxDQUFDbUosa0JBQVAsQ0FBMEIsT0FBMUIsQ0FBakMsQ0FBTjtBQUNBLFVBQU0sS0FBS3pFLFVBQUwsR0FBa0JDLElBQWxCLENBQXVCM0UsTUFBTSxJQUFJQSxNQUFNLENBQUNtSixrQkFBUCxDQUEwQixjQUExQixDQUFqQyxDQUFOO0FBRUEsVUFBTSxLQUFLakYsT0FBTCxDQUFhZ04sZ0JBQWIsQ0FBOEIsT0FBOUIsRUFBdUNSLGtCQUF2QyxFQUEyRCxDQUFDLFVBQUQsQ0FBM0QsRUFBeUUzSixLQUF6RSxDQUErRUMsS0FBSyxJQUFJO0FBQzVGbUssc0JBQU9DLElBQVAsQ0FBWSw2Q0FBWixFQUEyRHBLLEtBQTNEOztBQUNBLFlBQU1BLEtBQU47QUFDRCxLQUhLLENBQU47QUFNQSxVQUFNLEtBQUs5QyxPQUFMLENBQWFnTixnQkFBYixDQUE4QixPQUE5QixFQUF1Q1Isa0JBQXZDLEVBQTJELENBQUMsT0FBRCxDQUEzRCxFQUFzRTNKLEtBQXRFLENBQTRFQyxLQUFLLElBQUk7QUFDekZtSyxzQkFBT0MsSUFBUCxDQUFZLHdEQUFaLEVBQXNFcEssS0FBdEU7O0FBQ0EsWUFBTUEsS0FBTjtBQUNELEtBSEssQ0FBTjtBQUtBLFVBQU0sS0FBSzlDLE9BQUwsQ0FDSG1OLFdBREcsQ0FDUyxPQURULEVBQ2tCWCxrQkFEbEIsRUFDc0MsQ0FBQyxPQUFELENBRHRDLEVBQ2lELHdCQURqRCxFQUMyRSxLQUQzRSxFQUVIM0osS0FGRyxDQUVHQyxLQUFLLElBQUk7QUFDZG1LLHNCQUFPQyxJQUFQLENBQVksaURBQVosRUFBK0RwSyxLQUEvRDs7QUFDQSxZQUFNQSxLQUFOO0FBQ0QsS0FMRyxDQUFOO0FBT0EsVUFBTSxLQUFLOUMsT0FBTCxDQUFhZ04sZ0JBQWIsQ0FBOEIsT0FBOUIsRUFBdUNKLGtCQUF2QyxFQUEyRCxDQUFDLE1BQUQsQ0FBM0QsRUFBcUUvSixLQUFyRSxDQUEyRUMsS0FBSyxJQUFJO0FBQ3hGbUssc0JBQU9DLElBQVAsQ0FBWSw2Q0FBWixFQUEyRHBLLEtBQTNEOztBQUNBLFlBQU1BLEtBQU47QUFDRCxLQUhLLENBQU47QUFLQSxVQUFNLEtBQUs5QyxPQUFMLENBQ0hnTixnQkFERyxDQUNjLGNBRGQsRUFDOEJGLHlCQUQ5QixFQUN5RCxDQUFDLE9BQUQsQ0FEekQsRUFFSGpLLEtBRkcsQ0FFR0MsS0FBSyxJQUFJO0FBQ2RtSyxzQkFBT0MsSUFBUCxDQUFZLDBEQUFaLEVBQXdFcEssS0FBeEU7O0FBQ0EsWUFBTUEsS0FBTjtBQUNELEtBTEcsQ0FBTjtBQU9BLFVBQU1zSyxjQUFjLEdBQUcsS0FBS3BOLE9BQUwsWUFBd0JxTiw0QkFBL0M7QUFDQSxVQUFNQyxpQkFBaUIsR0FBRyxLQUFLdE4sT0FBTCxZQUF3QnVOLCtCQUFsRDs7QUFDQSxRQUFJSCxjQUFjLElBQUlFLGlCQUF0QixFQUF5QztBQUN2QyxVQUFJck4sT0FBTyxHQUFHLEVBQWQ7O0FBQ0EsVUFBSW1OLGNBQUosRUFBb0I7QUFDbEJuTixRQUFBQSxPQUFPLEdBQUc7QUFDUnVOLFVBQUFBLEdBQUcsRUFBRTtBQURHLFNBQVY7QUFHRCxPQUpELE1BSU8sSUFBSUYsaUJBQUosRUFBdUI7QUFDNUJyTixRQUFBQSxPQUFPLEdBQUcsS0FBS0Msa0JBQWY7QUFDQUQsUUFBQUEsT0FBTyxDQUFDd04sc0JBQVIsR0FBaUMsSUFBakM7QUFDRDs7QUFDRCxZQUFNLEtBQUt6TixPQUFMLENBQ0htTixXQURHLENBQ1MsY0FEVCxFQUN5QkwseUJBRHpCLEVBQ29ELENBQUMsUUFBRCxDQURwRCxFQUNnRSxLQURoRSxFQUN1RSxLQUR2RSxFQUM4RTdNLE9BRDlFLEVBRUg0QyxLQUZHLENBRUdDLEtBQUssSUFBSTtBQUNkbUssd0JBQU9DLElBQVAsQ0FBWSwwREFBWixFQUF3RXBLLEtBQXhFOztBQUNBLGNBQU1BLEtBQU47QUFDRCxPQUxHLENBQU47QUFNRDs7QUFDRCxVQUFNLEtBQUs5QyxPQUFMLENBQWEwTix1QkFBYixFQUFOO0FBQ0Q7O0FBRURDLEVBQUFBLHNCQUFzQixDQUFDMVIsTUFBRCxFQUFjMUIsR0FBZCxFQUEyQnNDLEtBQTNCLEVBQTRDO0FBQ2hFLFFBQUl0QyxHQUFHLENBQUNDLE9BQUosQ0FBWSxHQUFaLElBQW1CLENBQXZCLEVBQTBCO0FBQ3hCeUIsTUFBQUEsTUFBTSxDQUFDMUIsR0FBRCxDQUFOLEdBQWNzQyxLQUFLLENBQUN0QyxHQUFELENBQW5CO0FBQ0EsYUFBTzBCLE1BQVA7QUFDRDs7QUFDRCxVQUFNMlIsSUFBSSxHQUFHclQsR0FBRyxDQUFDbUYsS0FBSixDQUFVLEdBQVYsQ0FBYjtBQUNBLFVBQU1tTyxRQUFRLEdBQUdELElBQUksQ0FBQyxDQUFELENBQXJCO0FBQ0EsVUFBTUUsUUFBUSxHQUFHRixJQUFJLENBQUNHLEtBQUwsQ0FBVyxDQUFYLEVBQWMvRCxJQUFkLENBQW1CLEdBQW5CLENBQWpCLENBUGdFLENBU2hFOztBQUNBLFFBQUksS0FBSy9KLE9BQUwsSUFBZ0IsS0FBS0EsT0FBTCxDQUFhK04sc0JBQWpDLEVBQXlEO0FBQ3ZEO0FBQ0EsV0FBSyxNQUFNQyxPQUFYLElBQXNCLEtBQUtoTyxPQUFMLENBQWErTixzQkFBbkMsRUFBMkQ7QUFDekQsY0FBTXpTLEtBQUssR0FBRzJTLGVBQU1DLHNCQUFOLENBQTZCO0FBQUVOLFVBQUFBLFFBQVEsRUFBRWhNO0FBQVosU0FBN0IsRUFBc0RvTSxPQUFPLENBQUMxVCxHQUE5RCxFQUFtRXNILFNBQW5FLENBQWQ7O0FBQ0EsWUFBSXRHLEtBQUosRUFBVztBQUNULGdCQUFNLElBQUliLFlBQU1DLEtBQVYsQ0FDSkQsWUFBTUMsS0FBTixDQUFZYSxnQkFEUixFQUVILHVDQUFzQ3NPLElBQUksQ0FBQ0MsU0FBTCxDQUFla0UsT0FBZixDQUF3QixHQUYzRCxDQUFOO0FBSUQ7QUFDRjtBQUNGOztBQUVEaFMsSUFBQUEsTUFBTSxDQUFDNFIsUUFBRCxDQUFOLEdBQW1CLEtBQUtGLHNCQUFMLENBQ2pCMVIsTUFBTSxDQUFDNFIsUUFBRCxDQUFOLElBQW9CLEVBREgsRUFFakJDLFFBRmlCLEVBR2pCalIsS0FBSyxDQUFDZ1IsUUFBRCxDQUhZLENBQW5CO0FBS0EsV0FBTzVSLE1BQU0sQ0FBQzFCLEdBQUQsQ0FBYjtBQUNBLFdBQU8wQixNQUFQO0FBQ0Q7O0FBRUR5SCxFQUFBQSx1QkFBdUIsQ0FBQ2tCLGNBQUQsRUFBc0I1SyxNQUF0QixFQUFpRDtBQUN0RSxVQUFNb1UsUUFBUSxHQUFHLEVBQWpCOztBQUNBLFFBQUksQ0FBQ3BVLE1BQUwsRUFBYTtBQUNYLGFBQU9nSCxPQUFPLENBQUNHLE9BQVIsQ0FBZ0JpTixRQUFoQixDQUFQO0FBQ0Q7O0FBQ0RqVCxJQUFBQSxNQUFNLENBQUNDLElBQVAsQ0FBWXdKLGNBQVosRUFBNEI3SixPQUE1QixDQUFvQ1IsR0FBRyxJQUFJO0FBQ3pDLFlBQU04VCxTQUFTLEdBQUd6SixjQUFjLENBQUNySyxHQUFELENBQWhDLENBRHlDLENBRXpDOztBQUNBLFVBQ0U4VCxTQUFTLElBQ1QsT0FBT0EsU0FBUCxLQUFxQixRQURyQixJQUVBQSxTQUFTLENBQUN4UCxJQUZWLElBR0EsQ0FBQyxLQUFELEVBQVEsV0FBUixFQUFxQixRQUFyQixFQUErQixXQUEvQixFQUE0Q3JFLE9BQTVDLENBQW9ENlQsU0FBUyxDQUFDeFAsSUFBOUQsSUFBc0UsQ0FBQyxDQUp6RSxFQUtFO0FBQ0E7QUFDQTtBQUNBLGFBQUs4TyxzQkFBTCxDQUE0QlMsUUFBNUIsRUFBc0M3VCxHQUF0QyxFQUEyQ1AsTUFBM0M7QUFDRDtBQUNGLEtBYkQ7QUFjQSxXQUFPZ0gsT0FBTyxDQUFDRyxPQUFSLENBQWdCaU4sUUFBaEIsQ0FBUDtBQUNEOztBQXY1Q3NCOztBQTQ1Q3pCRSxNQUFNLENBQUNDLE9BQVAsR0FBaUJ6TyxrQkFBakIsQyxDQUNBOztBQUNBd08sTUFBTSxDQUFDQyxPQUFQLENBQWVDLGNBQWYsR0FBZ0MvVCxhQUFoQyIsInNvdXJjZXNDb250ZW50IjpbIu+7vy8vIEBmbG93XG4vLyBBIGRhdGFiYXNlIGFkYXB0ZXIgdGhhdCB3b3JrcyB3aXRoIGRhdGEgZXhwb3J0ZWQgZnJvbSB0aGUgaG9zdGVkXG4vLyBQYXJzZSBkYXRhYmFzZS5cblxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgaW50ZXJzZWN0IGZyb20gJ2ludGVyc2VjdCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgVXRpbHMgZnJvbSAnLi4vVXRpbHMnO1xuaW1wb3J0ICogYXMgU2NoZW1hQ29udHJvbGxlciBmcm9tICcuL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBNb25nb1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFNjaGVtYUNhY2hlIGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL1NjaGVtYUNhY2hlJztcbmltcG9ydCB0eXBlIHsgTG9hZFNjaGVtYU9wdGlvbnMgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB0eXBlIHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi4vT3B0aW9ucyc7XG5pbXBvcnQgdHlwZSB7IFF1ZXJ5T3B0aW9ucywgRnVsbFF1ZXJ5T3B0aW9ucyB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuXG5mdW5jdGlvbiBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3dwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll93cGVybSA9IHsgJGluOiBbbnVsbCwgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbmZ1bmN0aW9uIGFkZFJlYWRBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ19ycGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fcnBlcm0gPSB7ICRpbjogW251bGwsICcqJywgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbi8vIFRyYW5zZm9ybXMgYSBSRVNUIEFQSSBmb3JtYXR0ZWQgQUNMIG9iamVjdCB0byBvdXIgdHdvLWZpZWxkIG1vbmdvIGZvcm1hdC5cbmNvbnN0IHRyYW5zZm9ybU9iamVjdEFDTCA9ICh7IEFDTCwgLi4ucmVzdWx0IH0pID0+IHtcbiAgaWYgKCFBQ0wpIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcmVzdWx0Ll93cGVybSA9IFtdO1xuICByZXN1bHQuX3JwZXJtID0gW107XG5cbiAgZm9yIChjb25zdCBlbnRyeSBpbiBBQ0wpIHtcbiAgICBpZiAoQUNMW2VudHJ5XS5yZWFkKSB7XG4gICAgICByZXN1bHQuX3JwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgICBpZiAoQUNMW2VudHJ5XS53cml0ZSkge1xuICAgICAgcmVzdWx0Ll93cGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmNvbnN0IHNwZWNpYWxRdWVyeWtleXMgPSBbXG4gICckYW5kJyxcbiAgJyRvcicsXG4gICckbm9yJyxcbiAgJ19ycGVybScsXG4gICdfd3Blcm0nLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuXTtcblxuY29uc3QgaXNTcGVjaWFsUXVlcnlLZXkgPSBrZXkgPT4ge1xuICByZXR1cm4gc3BlY2lhbFF1ZXJ5a2V5cy5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmNvbnN0IHZhbGlkYXRlUXVlcnkgPSAocXVlcnk6IGFueSk6IHZvaWQgPT4ge1xuICBpZiAocXVlcnkuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdDYW5ub3QgcXVlcnkgb24gQUNMLicpO1xuICB9XG5cbiAgaWYgKHF1ZXJ5LiRvcikge1xuICAgIGlmIChxdWVyeS4kb3IgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJG9yLmZvckVhY2godmFsaWRhdGVRdWVyeSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQmFkICRvciBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRhbmQpIHtcbiAgICBpZiAocXVlcnkuJGFuZCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBxdWVyeS4kYW5kLmZvckVhY2godmFsaWRhdGVRdWVyeSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQmFkICRhbmQgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kbm9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRub3IgaW5zdGFuY2VvZiBBcnJheSAmJiBxdWVyeS4kbm9yLmxlbmd0aCA+IDApIHtcbiAgICAgIHF1ZXJ5LiRub3IuZm9yRWFjaCh2YWxpZGF0ZVF1ZXJ5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAnQmFkICRub3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IG9mIGF0IGxlYXN0IDEgdmFsdWUuJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmIChxdWVyeSAmJiBxdWVyeVtrZXldICYmIHF1ZXJ5W2tleV0uJHJlZ2V4KSB7XG4gICAgICBpZiAodHlwZW9mIHF1ZXJ5W2tleV0uJG9wdGlvbnMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmICghcXVlcnlba2V5XS4kb3B0aW9ucy5tYXRjaCgvXltpbXhzXSskLykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgYEJhZCAkb3B0aW9ucyB2YWx1ZSBmb3IgcXVlcnk6ICR7cXVlcnlba2V5XS4kb3B0aW9uc31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIWlzU3BlY2lhbFF1ZXJ5S2V5KGtleSkgJiYgIWtleS5tYXRjaCgvXlthLXpBLVpdW2EtekEtWjAtOV9cXC5dKiQvKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBJbnZhbGlkIGtleSBuYW1lOiAke2tleX1gKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLy8gRmlsdGVycyBvdXQgYW55IGRhdGEgdGhhdCBzaG91bGRuJ3QgYmUgb24gdGhpcyBSRVNULWZvcm1hdHRlZCBvYmplY3QuXG5jb25zdCBmaWx0ZXJTZW5zaXRpdmVEYXRhID0gKFxuICBpc01hc3RlcjogYm9vbGVhbixcbiAgYWNsR3JvdXA6IGFueVtdLFxuICBhdXRoOiBhbnksXG4gIG9wZXJhdGlvbjogYW55LFxuICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gIHByb3RlY3RlZEZpZWxkczogbnVsbCB8IEFycmF5PGFueT4sXG4gIG9iamVjdDogYW55XG4pID0+IHtcbiAgbGV0IHVzZXJJZCA9IG51bGw7XG4gIGlmIChhdXRoICYmIGF1dGgudXNlcikgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuXG4gIC8vIHJlcGxhY2UgcHJvdGVjdGVkRmllbGRzIHdoZW4gdXNpbmcgcG9pbnRlci1wZXJtaXNzaW9uc1xuICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcbiAgaWYgKHBlcm1zKSB7XG4gICAgY29uc3QgaXNSZWFkT3BlcmF0aW9uID0gWydnZXQnLCAnZmluZCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xO1xuXG4gICAgaWYgKGlzUmVhZE9wZXJhdGlvbiAmJiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIGV4dHJhY3QgcHJvdGVjdGVkRmllbGRzIGFkZGVkIHdpdGggdGhlIHBvaW50ZXItcGVybWlzc2lvbiBwcmVmaXhcbiAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtID0gT2JqZWN0LmtleXMocGVybXMucHJvdGVjdGVkRmllbGRzKVxuICAgICAgICAuZmlsdGVyKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBrZXkuc3Vic3RyaW5nKDEwKSwgdmFsdWU6IHBlcm1zLnByb3RlY3RlZEZpZWxkc1trZXldIH07XG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBuZXdQcm90ZWN0ZWRGaWVsZHM6IEFycmF5PHN0cmluZz5bXSA9IFtdO1xuICAgICAgbGV0IG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gZmFsc2U7XG5cbiAgICAgIC8vIGNoZWNrIGlmIHRoZSBvYmplY3QgZ3JhbnRzIHRoZSBjdXJyZW50IHVzZXIgYWNjZXNzIGJhc2VkIG9uIHRoZSBleHRyYWN0ZWQgZmllbGRzXG4gICAgICBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybS5mb3JFYWNoKHBvaW50ZXJQZXJtID0+IHtcbiAgICAgICAgbGV0IHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IHJlYWRVc2VyRmllbGRWYWx1ZSA9IG9iamVjdFtwb2ludGVyUGVybS5rZXldO1xuICAgICAgICBpZiAocmVhZFVzZXJGaWVsZFZhbHVlKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVhZFVzZXJGaWVsZFZhbHVlKSkge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSByZWFkVXNlckZpZWxkVmFsdWUuc29tZShcbiAgICAgICAgICAgICAgdXNlciA9PiB1c2VyLm9iamVjdElkICYmIHVzZXIub2JqZWN0SWQgPT09IHVzZXJJZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPVxuICAgICAgICAgICAgICByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgJiYgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkID09PSB1c2VySWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyKSB7XG4gICAgICAgICAgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSB0cnVlO1xuICAgICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHBvaW50ZXJQZXJtLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIGlmIGF0IGxlYXN0IG9uZSBwb2ludGVyLXBlcm1pc3Npb24gYWZmZWN0ZWQgdGhlIGN1cnJlbnQgdXNlclxuICAgICAgLy8gaW50ZXJzZWN0IHZzIHByb3RlY3RlZEZpZWxkcyBmcm9tIHByZXZpb3VzIHN0YWdlIChAc2VlIGFkZFByb3RlY3RlZEZpZWxkcylcbiAgICAgIC8vIFNldHMgdGhlb3J5IChpbnRlcnNlY3Rpb25zKTogQSB4IChCIHggQykgPT0gKEEgeCBCKSB4IENcbiAgICAgIGlmIChvdmVycmlkZVByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocHJvdGVjdGVkRmllbGRzKTtcbiAgICAgIH1cbiAgICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgICAvLyBpZiB0aGVyZSdyZSBubyBwcm90Y3RlZEZpZWxkcyBieSBvdGhlciBjcml0ZXJpYSAoIGlkIC8gcm9sZSAvIGF1dGgpXG4gICAgICAgICAgLy8gdGhlbiB3ZSBtdXN0IGludGVyc2VjdCBlYWNoIHNldCAocGVyIHVzZXJGaWVsZClcbiAgICAgICAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gZmllbGRzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHMuZmlsdGVyKHYgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlzVXNlckNsYXNzID0gY2xhc3NOYW1lID09PSAnX1VzZXInO1xuXG4gIC8qIHNwZWNpYWwgdHJlYXQgZm9yIHRoZSB1c2VyIGNsYXNzOiBkb24ndCBmaWx0ZXIgcHJvdGVjdGVkRmllbGRzIGlmIGN1cnJlbnRseSBsb2dnZWRpbiB1c2VyIGlzXG4gIHRoZSByZXRyaWV2ZWQgdXNlciAqL1xuICBpZiAoIShpc1VzZXJDbGFzcyAmJiB1c2VySWQgJiYgb2JqZWN0Lm9iamVjdElkID09PSB1c2VySWQpKSB7XG4gICAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG5cbiAgICAvLyBmaWVsZHMgbm90IHJlcXVlc3RlZCBieSBjbGllbnQgKGV4Y2x1ZGVkKSxcbiAgICAvL2J1dCB3ZXJlIG5lZWRlZCB0byBhcHBseSBwcm90ZWN0dGVkRmllbGRzXG4gICAgcGVybXMucHJvdGVjdGVkRmllbGRzICYmXG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyAmJlxuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuICB9XG5cbiAgaWYgKCFpc1VzZXJDbGFzcykge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBvYmplY3QucGFzc3dvcmQgPSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcbiAgZGVsZXRlIG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuXG4gIGRlbGV0ZSBvYmplY3Quc2Vzc2lvblRva2VuO1xuXG4gIGlmIChpc01hc3Rlcikge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZGVsZXRlIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuO1xuICBkZWxldGUgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuO1xuICBkZWxldGUgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX3RvbWJzdG9uZTtcbiAgZGVsZXRlIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX2ZhaWxlZF9sb2dpbl9jb3VudDtcbiAgZGVsZXRlIG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX3Bhc3N3b3JkX2hpc3Rvcnk7XG5cbiAgaWYgKGFjbEdyb3VwLmluZGV4T2Yob2JqZWN0Lm9iamVjdElkKSA+IC0xKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuLy8gUnVucyBhbiB1cGRhdGUgb24gdGhlIGRhdGFiYXNlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGFuIG9iamVjdCB3aXRoIHRoZSBuZXcgdmFsdWVzIGZvciBmaWVsZFxuLy8gbW9kaWZpY2F0aW9ucyB0aGF0IGRvbid0IGtub3cgdGhlaXIgcmVzdWx0cyBhaGVhZCBvZiB0aW1lLCBsaWtlXG4vLyAnaW5jcmVtZW50Jy5cbi8vIE9wdGlvbnM6XG4vLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbi8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbi8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG5jb25zdCBzcGVjaWFsS2V5c0ZvclVwZGF0ZSA9IFtcbiAgJ19oYXNoZWRfcGFzc3dvcmQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxVcGRhdGVLZXkgPSBrZXkgPT4ge1xuICByZXR1cm4gc3BlY2lhbEtleXNGb3JVcGRhdGUuaW5kZXhPZihrZXkpID49IDA7XG59O1xuXG5mdW5jdGlvbiBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSB7XG4gIHJldHVybiBgX0pvaW46JHtrZXl9OiR7Y2xhc3NOYW1lfWA7XG59XG5cbmNvbnN0IGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUgPSBvYmplY3QgPT4ge1xuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0W2tleV0gJiYgb2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgc3dpdGNoIChvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XS5hbW91bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLmFtb3VudDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5vYmplY3RzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gW107XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICAgICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgICAgICBgVGhlICR7b2JqZWN0W2tleV0uX19vcH0gb3BlcmF0b3IgaXMgbm90IHN1cHBvcnRlZCB5ZXQuYFxuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BdXRoRGF0YSA9IChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSA9PiB7XG4gIGlmIChvYmplY3QuYXV0aERhdGEgJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgT2JqZWN0LmtleXMob2JqZWN0LmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IG9iamVjdC5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICBjb25zdCBmaWVsZE5hbWUgPSBgX2F1dGhfZGF0YV8ke3Byb3ZpZGVyfWA7XG4gICAgICBpZiAocHJvdmlkZXJEYXRhID09IG51bGwpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX19vcDogJ0RlbGV0ZScsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHByb3ZpZGVyRGF0YTtcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdID0geyB0eXBlOiAnT2JqZWN0JyB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIH1cbn07XG4vLyBUcmFuc2Zvcm1zIGEgRGF0YWJhc2UgZm9ybWF0IEFDTCB0byBhIFJFU1QgQVBJIGZvcm1hdCBBQ0xcbmNvbnN0IHVudHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgX3JwZXJtLCBfd3Blcm0sIC4uLm91dHB1dCB9KSA9PiB7XG4gIGlmIChfcnBlcm0gfHwgX3dwZXJtKSB7XG4gICAgb3V0cHV0LkFDTCA9IHt9O1xuXG4gICAgKF9ycGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyByZWFkOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XVsncmVhZCddID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIChfd3Blcm0gfHwgW10pLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKCFvdXRwdXQuQUNMW2VudHJ5XSkge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XSA9IHsgd3JpdGU6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWyd3cml0ZSddID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gb3V0cHV0O1xufTtcblxuLyoqXG4gKiBXaGVuIHF1ZXJ5aW5nLCB0aGUgZmllbGROYW1lIG1heSBiZSBjb21wb3VuZCwgZXh0cmFjdCB0aGUgcm9vdCBmaWVsZE5hbWVcbiAqICAgICBgdGVtcGVyYXR1cmUuY2Vsc2l1c2AgYmVjb21lcyBgdGVtcGVyYXR1cmVgXG4gKiBAcGFyYW0ge3N0cmluZ30gZmllbGROYW1lIHRoYXQgbWF5IGJlIGEgY29tcG91bmQgZmllbGQgbmFtZVxuICogQHJldHVybnMge3N0cmluZ30gdGhlIHJvb3QgbmFtZSBvZiB0aGUgZmllbGRcbiAqL1xuY29uc3QgZ2V0Um9vdEZpZWxkTmFtZSA9IChmaWVsZE5hbWU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbn07XG5cbmNvbnN0IHJlbGF0aW9uU2NoZW1hID0ge1xuICBmaWVsZHM6IHsgcmVsYXRlZElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sIG93bmluZ0lkOiB7IHR5cGU6ICdTdHJpbmcnIH0gfSxcbn07XG5cbmNsYXNzIERhdGFiYXNlQ29udHJvbGxlciB7XG4gIGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyO1xuICBzY2hlbWFDYWNoZTogYW55O1xuICBzY2hlbWFQcm9taXNlOiA/UHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+O1xuICBfdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnk7XG4gIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucztcbiAgaWRlbXBvdGVuY3lPcHRpb25zOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIHRoaXMuYWRhcHRlciA9IGFkYXB0ZXI7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucyA9IHRoaXMub3B0aW9ucy5pZGVtcG90ZW5jeU9wdGlvbnMgfHwge307XG4gICAgLy8gUHJldmVudCBtdXRhYmxlIHRoaXMuc2NoZW1hLCBvdGhlcndpc2Ugb25lIHJlcXVlc3QgY291bGQgdXNlXG4gICAgLy8gbXVsdGlwbGUgc2NoZW1hcywgc28gaW5zdGVhZCB1c2UgbG9hZFNjaGVtYSB0byBnZXQgYSBzY2hlbWEuXG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgfVxuXG4gIGNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gIH1cblxuICBwdXJnZUNvbGxlY3Rpb24oY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHt9KSk7XG4gIH1cblxuICB2YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5jbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgJ2ludmFsaWQgY2xhc3NOYW1lOiAnICsgY2xhc3NOYW1lKVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgc2NoZW1hQ29udHJvbGxlci5cbiAgbG9hZFNjaGVtYShcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYVByb21pc2UgIT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHRoaXMuc2NoZW1hUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gU2NoZW1hQ29udHJvbGxlci5sb2FkKHRoaXMuYWRhcHRlciwgb3B0aW9ucyk7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlLnRoZW4oXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlLFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZVxuICAgICk7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIGxvYWRTY2hlbWFJZk5lZWRlZChcbiAgICBzY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlciA/IFByb21pc2UucmVzb2x2ZShzY2hlbWFDb250cm9sbGVyKSA6IHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgY2xhc3NuYW1lIHRoYXQgaXMgcmVsYXRlZCB0byB0aGUgZ2l2ZW5cbiAgLy8gY2xhc3NuYW1lIHRocm91Z2ggdGhlIGtleS5cbiAgLy8gVE9ETzogbWFrZSB0aGlzIG5vdCBpbiB0aGUgRGF0YWJhc2VDb250cm9sbGVyIGludGVyZmFjZVxuICByZWRpcmVjdENsYXNzTmFtZUZvcktleShjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcpOiBQcm9taXNlPD9zdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4ge1xuICAgICAgdmFyIHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICh0ICE9IG51bGwgJiYgdHlwZW9mIHQgIT09ICdzdHJpbmcnICYmIHQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gdC50YXJnZXRDbGFzcztcbiAgICAgIH1cbiAgICAgIHJldHVybiBjbGFzc05hbWU7XG4gICAgfSk7XG4gIH1cblxuICAvLyBVc2VzIHRoZSBzY2hlbWEgdG8gdmFsaWRhdGUgdGhlIG9iamVjdCAoUkVTVCBBUEkgZm9ybWF0KS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYS5cbiAgLy8gVGhpcyBkb2VzIG5vdCB1cGRhdGUgdGhpcy5zY2hlbWEsIGJlY2F1c2UgaW4gYSBzaXR1YXRpb24gbGlrZSBhXG4gIC8vIGJhdGNoIHJlcXVlc3QsIHRoYXQgY291bGQgY29uZnVzZSBvdGhlciB1c2VycyBvZiB0aGUgc2NoZW1hLlxuICB2YWxpZGF0ZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBxdWVyeTogYW55LFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBsZXQgc2NoZW1hO1xuICAgIGNvbnN0IGFjbCA9IHJ1bk9wdGlvbnMuYWNsO1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwOiBzdHJpbmdbXSA9IGFjbCB8fCBbXTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWEgPSBzO1xuICAgICAgICBpZiAoaXNNYXN0ZXIpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FuQWRkRmllbGQoc2NoZW1hLCBjbGFzc05hbWUsIG9iamVjdCwgYWNsR3JvdXAsIHJ1bk9wdGlvbnMpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB7IGFjbCwgbWFueSwgdXBzZXJ0LCBhZGRzRmllbGQgfTogRnVsbFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHNraXBTYW5pdGl6YXRpb246IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBxdWVyeTtcbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHVwZGF0ZTtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgdXBkYXRlID0gZGVlcGNvcHkodXBkYXRlKTtcbiAgICB2YXIgcmVsYXRpb25VcGRhdGVzID0gW107XG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICd1cGRhdGUnKVxuICAgICAgKVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZSwgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCwgdXBkYXRlKTtcbiAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICd1cGRhdGUnLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmIChhZGRzRmllbGQpIHtcbiAgICAgICAgICAgICAgcXVlcnkgPSB7XG4gICAgICAgICAgICAgICAgJGFuZDogW1xuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAnYWRkRmllbGQnLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5KTtcbiAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAgIC8vIHdpbGwgbGlrZWx5IG5lZWQgcmV2aXNpdGluZy5cbiAgICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSwgY2xhc3NOYW1lKSAmJlxuICAgICAgICAgICAgICAgICAgIWlzU3BlY2lhbFVwZGF0ZUtleShyb290RmllbGROYW1lKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCB1cGRhdGVPcGVyYXRpb24gaW4gdXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gJiZcbiAgICAgICAgICAgICAgICAgIHR5cGVvZiB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dKS5zb21lKFxuICAgICAgICAgICAgICAgICAgICBpbm5lcktleSA9PiBpbm5lcktleS5pbmNsdWRlcygnJCcpIHx8IGlubmVyS2V5LmluY2x1ZGVzKCcuJylcbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgICAgICAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHVwZGF0ZSA9IHRyYW5zZm9ybU9iamVjdEFDTCh1cGRhdGUpO1xuICAgICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHt9KS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCAhcmVzdWx0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKG1hbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodXBzZXJ0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmRPbmVBbmRVcGRhdGUoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsXG4gICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoc2tpcFNhbml0aXphdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbFVwZGF0ZSwgcmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDb2xsZWN0IGFsbCByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBsaXN0IG9mIGFsbCByZWxhdGlvbiB1cGRhdGVzIHRvIHBlcmZvcm1cbiAgLy8gVGhpcyBtdXRhdGVzIHVwZGF0ZS5cbiAgY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6ID9zdHJpbmcsIHVwZGF0ZTogYW55KSB7XG4gICAgdmFyIG9wcyA9IFtdO1xuICAgIHZhciBkZWxldGVNZSA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuXG4gICAgdmFyIHByb2Nlc3MgPSAob3AsIGtleSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnQmF0Y2gnKSB7XG4gICAgICAgIGZvciAodmFyIHggb2Ygb3Aub3BzKSB7XG4gICAgICAgICAgcHJvY2Vzcyh4LCBrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHVwZGF0ZSkge1xuICAgICAgcHJvY2Vzcyh1cGRhdGVba2V5XSwga2V5KTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBrZXkgb2YgZGVsZXRlTWUpIHtcbiAgICAgIGRlbGV0ZSB1cGRhdGVba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIG9wcztcbiAgfVxuXG4gIC8vIFByb2Nlc3NlcyByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBhbGwgdXBkYXRlcyBoYXZlIGJlZW4gcGVyZm9ybWVkXG4gIGhhbmRsZVJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6IHN0cmluZywgdXBkYXRlOiBhbnksIG9wczogYW55KSB7XG4gICAgdmFyIHBlbmRpbmcgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcbiAgICBvcHMuZm9yRWFjaCgoeyBrZXksIG9wIH0pID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKHRoaXMuYWRkUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5yZW1vdmVSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocGVuZGluZyk7XG4gIH1cblxuICAvLyBBZGRzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgYWRkIHdhcyBzdWNjZXNzZnVsLlxuICBhZGRSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgZG9jLFxuICAgICAgZG9jLFxuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIHJlbW92ZSB3YXNcbiAgLy8gc3VjY2Vzc2Z1bC5cbiAgcmVtb3ZlUmVsYXRpb24oa2V5OiBzdHJpbmcsIGZyb21DbGFzc05hbWU6IHN0cmluZywgZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZykge1xuICAgIHZhciBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgZG9jLFxuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gV2UgZG9uJ3QgY2FyZSBpZiB0aGV5IHRyeSB0byBkZWxldGUgYSBub24tZXhpc3RlbnQgcmVsYXRpb24uXG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgb2JqZWN0cyBtYXRjaGVzIHRoaXMgcXVlcnkgZnJvbSB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHdhc1xuICAvLyBkZWxldGVkLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbiAgLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuICAvLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuICBkZXN0cm95KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdkZWxldGUnKVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgJ2RlbGV0ZScsXG4gICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGRlbGV0ZSBieSBxdWVyeVxuICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgfVxuICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5KTtcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSlcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihwYXJzZUZvcm1hdFNjaGVtYSA9PlxuICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIHBhcnNlRm9ybWF0U2NoZW1hLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIFdoZW4gZGVsZXRpbmcgc2Vzc2lvbnMgd2hpbGUgY2hhbmdpbmcgcGFzc3dvcmRzLCBkb24ndCB0aHJvdyBhbiBlcnJvciBpZiB0aGV5IGRvbid0IGhhdmUgYW55IHNlc3Npb25zLlxuICAgICAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEluc2VydHMgYW4gb2JqZWN0IGludG8gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCBzYXZlZC5cbiAgY3JlYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIGNvbnN0IG9yaWdpbmFsT2JqZWN0ID0gb2JqZWN0O1xuICAgIG9iamVjdCA9IHRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuXG4gICAgb2JqZWN0LmNyZWF0ZWRBdCA9IHsgaXNvOiBvYmplY3QuY3JlYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuICAgIG9iamVjdC51cGRhdGVkQXQgPSB7IGlzbzogb2JqZWN0LnVwZGF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcblxuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBjb25zdCByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBudWxsLCBvYmplY3QpO1xuXG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2NyZWF0ZScpXG4gICAgICAgIClcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSkpXG4gICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgICAgICAgICAgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZShvYmplY3QpO1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBTY2hlbWFDb250cm9sbGVyLmNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoc2NoZW1hKSxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbE9iamVjdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBvYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzXG4gICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdCwgcmVzdWx0Lm9wc1swXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY2FuQWRkRmllbGQoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjbGFzc1NjaGVtYSA9IHNjaGVtYS5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgaWYgKCFjbGFzc1NjaGVtYSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xuICAgIGNvbnN0IHNjaGVtYUZpZWxkcyA9IE9iamVjdC5rZXlzKGNsYXNzU2NoZW1hLmZpZWxkcyk7XG4gICAgY29uc3QgbmV3S2V5cyA9IGZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgdW5zZXRcbiAgICAgIGlmIChvYmplY3RbZmllbGRdICYmIG9iamVjdFtmaWVsZF0uX19vcCAmJiBvYmplY3RbZmllbGRdLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzY2hlbWFGaWVsZHMuaW5kZXhPZihnZXRSb290RmllbGROYW1lKGZpZWxkKSkgPCAwO1xuICAgIH0pO1xuICAgIGlmIChuZXdLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIGFkZHMgYSBtYXJrZXIgdGhhdCBuZXcgZmllbGQgaXMgYmVpbmcgYWRkaW5nIGR1cmluZyB1cGRhdGVcbiAgICAgIHJ1bk9wdGlvbnMuYWRkc0ZpZWxkID0gdHJ1ZTtcblxuICAgICAgY29uc3QgYWN0aW9uID0gcnVuT3B0aW9ucy5hY3Rpb247XG4gICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnYWRkRmllbGQnLCBhY3Rpb24pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXb24ndCBkZWxldGUgY29sbGVjdGlvbnMgaW4gdGhlIHN5c3RlbSBuYW1lc3BhY2VcbiAgLyoqXG4gICAqIERlbGV0ZSBhbGwgY2xhc3NlcyBhbmQgY2xlYXJzIHRoZSBzY2hlbWEgY2FjaGVcbiAgICpcbiAgICogQHBhcmFtIHtib29sZWFufSBmYXN0IHNldCB0byB0cnVlIGlmIGl0J3Mgb2sgdG8ganVzdCBkZWxldGUgcm93cyBhbmQgbm90IGluZGV4ZXNcbiAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59IHdoZW4gdGhlIGRlbGV0aW9ucyBjb21wbGV0ZXNcbiAgICovXG4gIGRlbGV0ZUV2ZXJ5dGhpbmcoZmFzdDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVBbGxDbGFzc2VzKGZhc3QpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiByZWxhdGVkIGlkcyBnaXZlbiBhbiBvd25pbmcgaWQuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICByZWxhdGVkSWRzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nLFxuICAgIG93bmluZ0lkOiBzdHJpbmcsXG4gICAgcXVlcnlPcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxBcnJheTxzdHJpbmc+PiB7XG4gICAgY29uc3QgeyBza2lwLCBsaW1pdCwgc29ydCB9ID0gcXVlcnlPcHRpb25zO1xuICAgIGNvbnN0IGZpbmRPcHRpb25zID0ge307XG4gICAgaWYgKHNvcnQgJiYgc29ydC5jcmVhdGVkQXQgJiYgdGhpcy5hZGFwdGVyLmNhblNvcnRPbkpvaW5UYWJsZXMpIHtcbiAgICAgIGZpbmRPcHRpb25zLnNvcnQgPSB7IF9pZDogc29ydC5jcmVhdGVkQXQgfTtcbiAgICAgIGZpbmRPcHRpb25zLmxpbWl0ID0gbGltaXQ7XG4gICAgICBmaW5kT3B0aW9ucy5za2lwID0gc2tpcDtcbiAgICAgIHF1ZXJ5T3B0aW9ucy5za2lwID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksIHJlbGF0aW9uU2NoZW1hLCB7IG93bmluZ0lkIH0sIGZpbmRPcHRpb25zKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LnJlbGF0ZWRJZCkpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiBvd25pbmcgaWRzIGdpdmVuIHNvbWUgcmVsYXRlZCBpZHMuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICBvd25pbmdJZHMoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nLCByZWxhdGVkSWRzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChcbiAgICAgICAgam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICB7IHJlbGF0ZWRJZDogeyAkaW46IHJlbGF0ZWRJZHMgfSB9LFxuICAgICAgICB7IGtleXM6IFsnb3duaW5nSWQnXSB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQub3duaW5nSWQpKTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkaW4gb24gcmVsYXRpb24gZmllbGRzLCBvclxuICAvLyBlcXVhbC10by1wb2ludGVyIGNvbnN0cmFpbnRzIG9uIHJlbGF0aW9uIGZpZWxkcy5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IGFueSwgc2NoZW1hOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIFNlYXJjaCBmb3IgYW4gaW4tcmVsYXRpb24gb3IgZXF1YWwtdG8tcmVsYXRpb25cbiAgICAvLyBNYWtlIGl0IHNlcXVlbnRpYWwgZm9yIG5vdywgbm90IHN1cmUgb2YgcGFyYWxsZWl6YXRpb24gc2lkZSBlZmZlY3RzXG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgY29uc3Qgb3JzID0gcXVlcnlbJyRvciddO1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBvcnMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJG9yJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5WyckYW5kJ10pIHtcbiAgICAgIGNvbnN0IGFuZHMgPSBxdWVyeVsnJGFuZCddO1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBhbmRzLm1hcCgoYVF1ZXJ5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBhUXVlcnksIHNjaGVtYSkudGhlbihhUXVlcnkgPT4ge1xuICAgICAgICAgICAgcXVlcnlbJyRhbmQnXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IHByb21pc2VzID0gT2JqZWN0LmtleXMocXVlcnkpLm1hcChrZXkgPT4ge1xuICAgICAgY29uc3QgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKCF0IHx8IHQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIGxldCBxdWVyaWVzOiA/KGFueVtdKSA9IG51bGw7XG4gICAgICBpZiAoXG4gICAgICAgIHF1ZXJ5W2tleV0gJiZcbiAgICAgICAgKHF1ZXJ5W2tleV1bJyRpbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5lJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldLl9fdHlwZSA9PSAnUG9pbnRlcicpXG4gICAgICApIHtcbiAgICAgICAgLy8gQnVpbGQgdGhlIGxpc3Qgb2YgcXVlcmllc1xuICAgICAgICBxdWVyaWVzID0gT2JqZWN0LmtleXMocXVlcnlba2V5XSkubWFwKGNvbnN0cmFpbnRLZXkgPT4ge1xuICAgICAgICAgIGxldCByZWxhdGVkSWRzO1xuICAgICAgICAgIGxldCBpc05lZ2F0aW9uID0gZmFsc2U7XG4gICAgICAgICAgaWYgKGNvbnN0cmFpbnRLZXkgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckaW4nKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJGluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmluJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJG5pbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5lJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV1bJyRuZSddLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaXNOZWdhdGlvbixcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyaWVzID0gW3sgaXNOZWdhdGlvbjogZmFsc2UsIHJlbGF0ZWRJZHM6IFtdIH1dO1xuICAgICAgfVxuXG4gICAgICAvLyByZW1vdmUgdGhlIGN1cnJlbnQgcXVlcnlLZXkgYXMgd2UgZG9uLHQgbmVlZCBpdCBhbnltb3JlXG4gICAgICBkZWxldGUgcXVlcnlba2V5XTtcbiAgICAgIC8vIGV4ZWN1dGUgZWFjaCBxdWVyeSBpbmRlcGVuZGVudGx5IHRvIGJ1aWxkIHRoZSBsaXN0IG9mXG4gICAgICAvLyAkaW4gLyAkbmluXG4gICAgICBjb25zdCBwcm9taXNlcyA9IHF1ZXJpZXMubWFwKHEgPT4ge1xuICAgICAgICBpZiAoIXEpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMub3duaW5nSWRzKGNsYXNzTmFtZSwga2V5LCBxLnJlbGF0ZWRJZHMpLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBpZiAocS5pc05lZ2F0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLmFkZE5vdEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRyZWxhdGVkVG9cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBxdWVyeU9wdGlvbnM6IGFueSk6ID9Qcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5Wyckb3InXS5tYXAoYVF1ZXJ5ID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBhUXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJGFuZCddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIHZhciByZWxhdGVkVG8gPSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgIGlmIChyZWxhdGVkVG8pIHtcbiAgICAgIHJldHVybiB0aGlzLnJlbGF0ZWRJZHMoXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICByZWxhdGVkVG8ua2V5LFxuICAgICAgICByZWxhdGVkVG8ub2JqZWN0Lm9iamVjdElkLFxuICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgIClcbiAgICAgICAgLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBkZWxldGUgcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7IH0pO1xuICAgIH1cbiAgfVxuXG4gIGFkZEluT2JqZWN0SWRzSWRzKGlkczogP0FycmF5PHN0cmluZz4gPSBudWxsLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbVN0cmluZzogP0FycmF5PHN0cmluZz4gPVxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJyA/IFtxdWVyeS5vYmplY3RJZF0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21FcTogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRlcSddID8gW3F1ZXJ5Lm9iamVjdElkWyckZXEnXV0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21JbjogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRpbiddID8gcXVlcnkub2JqZWN0SWRbJyRpbiddIDogbnVsbDtcblxuICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgIGNvbnN0IGFsbElkczogQXJyYXk8QXJyYXk8c3RyaW5nPj4gPSBbaWRzRnJvbVN0cmluZywgaWRzRnJvbUVxLCBpZHNGcm9tSW4sIGlkc10uZmlsdGVyKFxuICAgICAgbGlzdCA9PiBsaXN0ICE9PSBudWxsXG4gICAgKTtcbiAgICBjb25zdCB0b3RhbExlbmd0aCA9IGFsbElkcy5yZWR1Y2UoKG1lbW8sIGxpc3QpID0+IG1lbW8gKyBsaXN0Lmxlbmd0aCwgMCk7XG5cbiAgICBsZXQgaWRzSW50ZXJzZWN0aW9uID0gW107XG4gICAgaWYgKHRvdGFsTGVuZ3RoID4gMTI1KSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QuYmlnKGFsbElkcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdChhbGxJZHMpO1xuICAgIH1cblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA9IGlkc0ludGVyc2VjdGlvbjtcblxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIGFkZE5vdEluT2JqZWN0SWRzSWRzKGlkczogc3RyaW5nW10gPSBbXSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21OaW4gPSBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJG5pbiddID8gcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA6IFtdO1xuICAgIGxldCBhbGxJZHMgPSBbLi4uaWRzRnJvbU5pbiwgLi4uaWRzXS5maWx0ZXIobGlzdCA9PiBsaXN0ICE9PSBudWxsKTtcblxuICAgIC8vIG1ha2UgYSBzZXQgYW5kIHNwcmVhZCB0byByZW1vdmUgZHVwbGljYXRlc1xuICAgIGFsbElkcyA9IFsuLi5uZXcgU2V0KGFsbElkcyldO1xuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPSBhbGxJZHM7XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gUnVucyBhIHF1ZXJ5IG9uIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhIGxpc3Qgb2YgaXRlbXMuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgc2tpcCAgICBudW1iZXIgb2YgcmVzdWx0cyB0byBza2lwLlxuICAvLyAgIGxpbWl0ICAgbGltaXQgdG8gdGhpcyBudW1iZXIgb2YgcmVzdWx0cy5cbiAgLy8gICBzb3J0ICAgIGFuIG9iamVjdCB3aGVyZSBrZXlzIGFyZSB0aGUgZmllbGRzIHRvIHNvcnQgYnkuXG4gIC8vICAgICAgICAgICB0aGUgdmFsdWUgaXMgKzEgZm9yIGFzY2VuZGluZywgLTEgZm9yIGRlc2NlbmRpbmcuXG4gIC8vICAgY291bnQgICBydW4gYSBjb3VudCBpbnN0ZWFkIG9mIHJldHVybmluZyByZXN1bHRzLlxuICAvLyAgIGFjbCAgICAgcmVzdHJpY3QgdGhpcyBvcGVyYXRpb24gd2l0aCBhbiBBQ0wgZm9yIHRoZSBwcm92aWRlZCBhcnJheVxuICAvLyAgICAgICAgICAgb2YgdXNlciBvYmplY3RJZHMgYW5kIHJvbGVzLiBhY2w6IG51bGwgbWVhbnMgbm8gdXNlci5cbiAgLy8gICAgICAgICAgIHdoZW4gdGhpcyBmaWVsZCBpcyBub3QgcHJlc2VudCwgZG9uJ3QgZG8gYW55dGhpbmcgcmVnYXJkaW5nIEFDTHMuXG4gIC8vICBjYXNlSW5zZW5zaXRpdmUgbWFrZSBzdHJpbmcgY29tcGFyaXNvbnMgY2FzZSBpbnNlbnNpdGl2ZVxuICAvLyBUT0RPOiBtYWtlIHVzZXJJZHMgbm90IG5lZWRlZCBoZXJlLiBUaGUgZGIgYWRhcHRlciBzaG91bGRuJ3Qga25vd1xuICAvLyBhbnl0aGluZyBhYm91dCB1c2VycywgaWRlYWxseS4gVGhlbiwgaW1wcm92ZSB0aGUgZm9ybWF0IG9mIHRoZSBBQ0xcbiAgLy8gYXJnIHRvIHdvcmsgbGlrZSB0aGUgb3RoZXJzLlxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgYWNsLFxuICAgICAgc29ydCA9IHt9LFxuICAgICAgY291bnQsXG4gICAgICBrZXlzLFxuICAgICAgb3AsXG4gICAgICBkaXN0aW5jdCxcbiAgICAgIHBpcGVsaW5lLFxuICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICBoaW50LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlID0gZmFsc2UsXG4gICAgICBleHBsYWluLFxuICAgIH06IGFueSA9IHt9LFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBvcCA9XG4gICAgICBvcCB8fCAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09ICdzdHJpbmcnICYmIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT09IDEgPyAnZ2V0JyA6ICdmaW5kJyk7XG4gICAgLy8gQ291bnQgb3BlcmF0aW9uIGlmIGNvdW50aW5nXG4gICAgb3AgPSBjb3VudCA9PT0gdHJ1ZSA/ICdjb3VudCcgOiBvcDtcblxuICAgIGxldCBjbGFzc0V4aXN0cyA9IHRydWU7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIC8vQWxsb3cgdm9sYXRpbGUgY2xhc3NlcyBpZiBxdWVyeWluZyB3aXRoIE1hc3RlciAoZm9yIF9QdXNoU3RhdHVzKVxuICAgICAgLy9UT0RPOiBNb3ZlIHZvbGF0aWxlIGNsYXNzZXMgY29uY2VwdCBpbnRvIG1vbmdvIGFkYXB0ZXIsIHBvc3RncmVzIGFkYXB0ZXIgc2hvdWxkbid0IGNhcmVcbiAgICAgIC8vdGhhdCBhcGkucGFyc2UuY29tIGJyZWFrcyB3aGVuIF9QdXNoU3RhdHVzIGV4aXN0cyBpbiBtb25nby5cbiAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCBpc01hc3RlcilcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAvLyBCZWhhdmlvciBmb3Igbm9uLWV4aXN0ZW50IGNsYXNzZXMgaXMga2luZGEgd2VpcmQgb24gUGFyc2UuY29tLiBQcm9iYWJseSBkb2Vzbid0IG1hdHRlciB0b28gbXVjaC5cbiAgICAgICAgICAvLyBGb3Igbm93LCBwcmV0ZW5kIHRoZSBjbGFzcyBleGlzdHMgYnV0IGhhcyBubyBvYmplY3RzLFxuICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjbGFzc0V4aXN0cyA9IGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAvLyBQYXJzZS5jb20gdHJlYXRzIHF1ZXJpZXMgb24gX2NyZWF0ZWRfYXQgYW5kIF91cGRhdGVkX2F0IGFzIGlmIHRoZXkgd2VyZSBxdWVyaWVzIG9uIGNyZWF0ZWRBdCBhbmQgdXBkYXRlZEF0LFxuICAgICAgICAgIC8vIHNvIGR1cGxpY2F0ZSB0aGF0IGJlaGF2aW9yIGhlcmUuIElmIGJvdGggYXJlIHNwZWNpZmllZCwgdGhlIGNvcnJlY3QgYmVoYXZpb3IgdG8gbWF0Y2ggUGFyc2UuY29tIGlzIHRvXG4gICAgICAgICAgLy8gdXNlIHRoZSBvbmUgdGhhdCBhcHBlYXJzIGZpcnN0IGluIHRoZSBzb3J0IGxpc3QuXG4gICAgICAgICAgaWYgKHNvcnQuX2NyZWF0ZWRfYXQpIHtcbiAgICAgICAgICAgIHNvcnQuY3JlYXRlZEF0ID0gc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc29ydC5fdXBkYXRlZF9hdCkge1xuICAgICAgICAgICAgc29ydC51cGRhdGVkQXQgPSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgICAgZGVsZXRlIHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHF1ZXJ5T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICBsaW1pdCxcbiAgICAgICAgICAgIHNvcnQsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICB9O1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNvcnQpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgQ2Fubm90IHNvcnQgYnkgJHtmaWVsZE5hbWV9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgb3ApXG4gICAgICAgICAgKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWFDb250cm9sbGVyKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHByb3RlY3RlZEZpZWxkcztcbiAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvKiBEb24ndCB1c2UgcHJvamVjdGlvbnMgdG8gb3B0aW1pemUgdGhlIHByb3RlY3RlZEZpZWxkcyBzaW5jZSB0aGUgcHJvdGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICBiYXNlZCBvbiBwb2ludGVyLXBlcm1pc3Npb25zIGFyZSBkZXRlcm1pbmVkIGFmdGVyIHF1ZXJ5aW5nLiBUaGUgZmlsdGVyaW5nIGNhblxuICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlIHRoZSBwcm90ZWN0ZWQgZmllbGRzLiAqL1xuICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHRoaXMuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAnZ2V0Jykge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBpZiAob3AgPT09ICd1cGRhdGUnIHx8IG9wID09PSAnZGVsZXRlJykge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFJlYWRBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSk7XG4gICAgICAgICAgICAgIGlmIChjb3VudCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNvdW50KFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIGhpbnRcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGRpc3RpbmN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRpc3RpbmN0KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgZGlzdGluY3QpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChwaXBlbGluZSkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5hZ2dyZWdhdGUoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBwaXBlbGluZSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICAgICAgICAgIGV4cGxhaW5cbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAgICAgICAgIC5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKVxuICAgICAgICAgICAgICAgICAgLnRoZW4ob2JqZWN0cyA9PlxuICAgICAgICAgICAgICAgICAgICBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdCA9IHVudHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgICAgICAgICAgICBpc01hc3RlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZGVsZXRlU2NoZW1hKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWFDb250cm9sbGVyID0gcztcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5hZGFwdGVyLmNvdW50KGNsYXNzTmFtZSwgeyBmaWVsZHM6IHt9IH0sIG51bGwsICcnLCBmYWxzZSkpXG4gICAgICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICAgICAgaWYgKGNvdW50ID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgMjU1LFxuICAgICAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gaXMgbm90IGVtcHR5LCBjb250YWlucyAke2NvdW50fSBvYmplY3RzLCBjYW5ub3QgZHJvcCBzY2hlbWEuYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhjbGFzc05hbWUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4od2FzUGFyc2VDb2xsZWN0aW9uID0+IHtcbiAgICAgICAgICAgIGlmICh3YXNQYXJzZUNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICAgICAgICAgIGZpZWxkTmFtZSA9PiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLm1hcChuYW1lID0+XG4gICAgICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3Moam9pblRhYmxlTmFtZShjbGFzc05hbWUsIG5hbWUpKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBTY2hlbWFDYWNoZS5kZWwoY2xhc3NOYW1lKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlci5yZWxvYWREYXRhKCk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBUaGlzIGhlbHBzIHRvIGNyZWF0ZSBpbnRlcm1lZGlhdGUgb2JqZWN0cyBmb3Igc2ltcGxlciBjb21wYXJpc29uIG9mXG4gIC8vIGtleSB2YWx1ZSBwYWlycyB1c2VkIGluIHF1ZXJ5IG9iamVjdHMuIEVhY2gga2V5IHZhbHVlIHBhaXIgd2lsbCByZXByZXNlbnRlZFxuICAvLyBpbiBhIHNpbWlsYXIgd2F5IHRvIGpzb25cbiAgb2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxdWVyeTogYW55KTogQXJyYXk8c3RyaW5nPiB7XG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHF1ZXJ5KS5tYXAoYSA9PiBhLm1hcChzID0+IEpTT04uc3RyaW5naWZ5KHMpKS5qb2luKCc6JykpO1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgT1Igb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZU9yT3BlcmF0aW9uKHF1ZXJ5OiB7ICRvcjogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRvcikge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJG9yLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgbG9uZ2VyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJG9yLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kb3IubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRvclswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRvcjtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgQU5EIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VBbmRPcGVyYXRpb24ocXVlcnk6IHsgJGFuZDogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRhbmQpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRhbmQubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBzaG9ydGVyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJGFuZC5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kYW5kLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kYW5kWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJGFuZDtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gQ29uc3RyYWludHMgcXVlcnkgdXNpbmcgQ0xQJ3MgcG9pbnRlciBwZXJtaXNzaW9ucyAoUFApIGlmIGFueS5cbiAgLy8gMS4gRXRyYWN0IHRoZSB1c2VyIGlkIGZyb20gY2FsbGVyJ3MgQUNMZ3JvdXA7XG4gIC8vIDIuIEV4Y3RyYWN0IGEgbGlzdCBvZiBmaWVsZCBuYW1lcyB0aGF0IGFyZSBQUCBmb3IgdGFyZ2V0IGNvbGxlY3Rpb24gYW5kIG9wZXJhdGlvbjtcbiAgLy8gMy4gQ29uc3RyYWludCB0aGUgb3JpZ2luYWwgcXVlcnkgc28gdGhhdCBlYWNoIFBQIGZpZWxkIG11c3RcbiAgLy8gcG9pbnQgdG8gY2FsbGVyJ3MgaWQgKG9yIGNvbnRhaW4gaXQgaW4gY2FzZSBvZiBQUCBmaWVsZCBiZWluZyBhbiBhcnJheSlcbiAgYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW11cbiAgKTogYW55IHtcbiAgICAvLyBDaGVjayBpZiBjbGFzcyBoYXMgcHVibGljIHBlcm1pc3Npb24gZm9yIG9wZXJhdGlvblxuICAgIC8vIElmIHRoZSBCYXNlQ0xQIHBhc3MsIGxldCBnbyB0aHJvdWdoXG4gICAgaWYgKHNjaGVtYS50ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcblxuICAgIGNvbnN0IHVzZXJBQ0wgPSBhY2xHcm91cC5maWx0ZXIoYWNsID0+IHtcbiAgICAgIHJldHVybiBhY2wuaW5kZXhPZigncm9sZTonKSAhPSAwICYmIGFjbCAhPSAnKic7XG4gICAgfSk7XG5cbiAgICBjb25zdCBncm91cEtleSA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICBjb25zdCBwZXJtRmllbGRzID0gW107XG5cbiAgICBpZiAocGVybXNbb3BlcmF0aW9uXSAmJiBwZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpIHtcbiAgICAgIHBlcm1GaWVsZHMucHVzaCguLi5wZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpO1xuICAgIH1cblxuICAgIGlmIChwZXJtc1tncm91cEtleV0pIHtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICAgIGlmICghcGVybUZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwZXJtRmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICBpZiAocGVybUZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgICAvLyBObyB1c2VyIHNldCByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAvLyBJZiB0aGUgbGVuZ3RoIGlzID4gMSwgdGhhdCBtZWFucyB3ZSBkaWRuJ3QgZGUtZHVwZSB1c2VycyBjb3JyZWN0bHlcbiAgICAgIGlmICh1c2VyQUNMLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXJJZCA9IHVzZXJBQ0xbMF07XG4gICAgICBjb25zdCB1c2VyUG9pbnRlciA9IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHF1ZXJpZXMgPSBwZXJtRmllbGRzLm1hcChrZXkgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZERlc2NyaXB0b3IgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgICAgY29uc3QgZmllbGRUeXBlID1cbiAgICAgICAgICBmaWVsZERlc2NyaXB0b3IgJiZcbiAgICAgICAgICAgIHR5cGVvZiBmaWVsZERlc2NyaXB0b3IgPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGREZXNjcmlwdG9yLCAndHlwZScpXG4gICAgICAgICAgICA/IGZpZWxkRGVzY3JpcHRvci50eXBlXG4gICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgbGV0IHF1ZXJ5Q2xhdXNlO1xuXG4gICAgICAgIGlmIChmaWVsZFR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHNpbmdsZSBwb2ludGVyIHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB1c2VyUG9pbnRlciB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHVzZXJzLWFycmF5IHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB7ICRhbGw6IFt1c2VyUG9pbnRlcl0gfSB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ09iamVjdCcpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciBvYmplY3Qgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGhpcyBtZWFucyB0aGF0IHRoZXJlIGlzIGEgQ0xQIGZpZWxkIG9mIGFuIHVuZXhwZWN0ZWQgdHlwZS4gVGhpcyBjb25kaXRpb24gc2hvdWxkIG5vdCBoYXBwZW4sIHdoaWNoIGlzXG4gICAgICAgICAgLy8gd2h5IGlzIGJlaW5nIHRyZWF0ZWQgYXMgYW4gZXJyb3IuXG4gICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICBgQW4gdW5leHBlY3RlZCBjb25kaXRpb24gb2NjdXJyZWQgd2hlbiByZXNvbHZpbmcgcG9pbnRlciBwZXJtaXNzaW9uczogJHtjbGFzc05hbWV9ICR7a2V5fWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIGlmIHdlIGFscmVhZHkgaGF2ZSBhIGNvbnN0cmFpbnQgb24gdGhlIGtleSwgdXNlIHRoZSAkYW5kXG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocXVlcnksIGtleSkpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VBbmRPcGVyYXRpb24oeyAkYW5kOiBbcXVlcnlDbGF1c2UsIHF1ZXJ5XSB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBvdGhlcndpc2UganVzdCBhZGQgdGhlIGNvbnN0YWludFxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHF1ZXJ5Q2xhdXNlKTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gcXVlcmllcy5sZW5ndGggPT09IDEgPyBxdWVyaWVzWzBdIDogdGhpcy5yZWR1Y2VPck9wZXJhdGlvbih7ICRvcjogcXVlcmllcyB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55ID0ge30sXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW10sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgcXVlcnlPcHRpb25zOiBGdWxsUXVlcnlPcHRpb25zID0ge31cbiAgKTogbnVsbCB8IHN0cmluZ1tdIHtcbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXBlcm1zKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IHBlcm1zLnByb3RlY3RlZEZpZWxkcztcbiAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoYWNsR3JvdXAuaW5kZXhPZihxdWVyeS5vYmplY3RJZCkgPiAtMSkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBmb3IgcXVlcmllcyB3aGVyZSBcImtleXNcIiBhcmUgc2V0IGFuZCBkbyBub3QgaW5jbHVkZSBhbGwgJ3VzZXJGaWVsZCc6e2ZpZWxkfSxcbiAgICAvLyB3ZSBoYXZlIHRvIHRyYW5zcGFyZW50bHkgaW5jbHVkZSBpdCwgYW5kIHRoZW4gcmVtb3ZlIGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50XG4gICAgLy8gQmVjYXVzZSBpZiBzdWNoIGtleSBub3QgcHJvamVjdGVkIHRoZSBwZXJtaXNzaW9uIHdvbid0IGJlIGVuZm9yY2VkIHByb3Blcmx5XG4gICAgLy8gUFMgdGhpcyBpcyBjYWxsZWQgd2hlbiAnZXhjbHVkZUtleXMnIGFscmVhZHkgcmVkdWNlZCB0byAna2V5cydcbiAgICBjb25zdCBwcmVzZXJ2ZUtleXMgPSBxdWVyeU9wdGlvbnMua2V5cztcblxuICAgIC8vIHRoZXNlIGFyZSBrZXlzIHRoYXQgbmVlZCB0byBiZSBpbmNsdWRlZCBvbmx5XG4gICAgLy8gdG8gYmUgYWJsZSB0byBhcHBseSBwcm90ZWN0ZWRGaWVsZHMgYnkgcG9pbnRlclxuICAgIC8vIGFuZCB0aGVuIHVuc2V0IGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50IChsYXRlciBpbiAgZmlsdGVyU2Vuc2l0aXZlRmllbGRzKVxuICAgIGNvbnN0IHNlcnZlck9ubHlLZXlzID0gW107XG5cbiAgICBjb25zdCBhdXRoZW50aWNhdGVkID0gYXV0aC51c2VyO1xuXG4gICAgLy8gbWFwIHRvIGFsbG93IGNoZWNrIHdpdGhvdXQgYXJyYXkgc2VhcmNoXG4gICAgY29uc3Qgcm9sZXMgPSAoYXV0aC51c2VyUm9sZXMgfHwgW10pLnJlZHVjZSgoYWNjLCByKSA9PiB7XG4gICAgICBhY2Nbcl0gPSBwcm90ZWN0ZWRGaWVsZHNbcl07XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIGFycmF5IG9mIHNldHMgb2YgcHJvdGVjdGVkIGZpZWxkcy4gc2VwYXJhdGUgaXRlbSBmb3IgZWFjaCBhcHBsaWNhYmxlIGNyaXRlcmlhXG4gICAgY29uc3QgcHJvdGVjdGVkS2V5c1NldHMgPSBbXTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gc2tpcCB1c2VyRmllbGRzXG4gICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSkge1xuICAgICAgICBpZiAocHJlc2VydmVLZXlzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZygxMCk7XG4gICAgICAgICAgaWYgKCFwcmVzZXJ2ZUtleXMuaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgICAgICAgLy8gMS4gcHV0IGl0IHRoZXJlIHRlbXBvcmFyaWx5XG4gICAgICAgICAgICBxdWVyeU9wdGlvbnMua2V5cyAmJiBxdWVyeU9wdGlvbnMua2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAvLyAyLiBwcmVzZXJ2ZSBpdCBkZWxldGUgbGF0ZXJcbiAgICAgICAgICAgIHNlcnZlck9ubHlLZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIGFkZCBwdWJsaWMgdGllclxuICAgICAgaWYgKGtleSA9PT0gJyonKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG4gICAgICAgICAgLy8gZm9yIGxvZ2dlZCBpbiB1c2Vyc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJvbGVzW2tleV0gJiYga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpIHtcbiAgICAgICAgICAvLyBhZGQgYXBwbGljYWJsZSByb2xlc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocm9sZXNba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjaGVjayBpZiB0aGVyZSdzIGEgcnVsZSBmb3IgY3VycmVudCB1c2VyJ3MgaWRcbiAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgY29uc3QgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuICAgICAgaWYgKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHByZXNlcnZlIGZpZWxkcyB0byBiZSByZW1vdmVkIGJlZm9yZSBzZW5kaW5nIHJlc3BvbnNlIHRvIGNsaWVudFxuICAgIGlmIChzZXJ2ZXJPbmx5S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyA9IHNlcnZlck9ubHlLZXlzO1xuICAgIH1cblxuICAgIGxldCBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5c1NldHMucmVkdWNlKChhY2MsIG5leHQpID0+IHtcbiAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgIGFjYy5wdXNoKC4uLm5leHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCBbXSk7XG5cbiAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgcHJvdGVjdGVkS2V5c1NldHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5cy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHByb3RlY3RlZEtleXM7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkudGhlbih0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uO1xuICAgIH0pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gY29tbWl0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBhYm9ydCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVE9ETzogY3JlYXRlIGluZGV4ZXMgb24gZmlyc3QgY3JlYXRpb24gb2YgYSBfVXNlciBvYmplY3QuIE90aGVyd2lzZSBpdCdzIGltcG9zc2libGUgdG9cbiAgLy8gaGF2ZSBhIFBhcnNlIGFwcCB3aXRob3V0IGl0IGhhdmluZyBhIF9Vc2VyIGNvbGxlY3Rpb24uXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpIHtcbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKHtcbiAgICAgIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXM6IFNjaGVtYUNvbnRyb2xsZXIuVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgICB9KTtcbiAgICBjb25zdCByZXF1aXJlZFVzZXJGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fVXNlcixcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZFJvbGVGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fUm9sZSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0lkZW1wb3RlbmN5LFxuICAgICAgfSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Vc2VyJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Sb2xlJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19JZGVtcG90ZW5jeScpKTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VybmFtZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlciBlbWFpbCBhZGRyZXNzZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10sICdjYXNlX2luc2Vuc2l0aXZlX2VtYWlsJywgZmFsc2UpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIGVtYWlsIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1JvbGUnLCByZXF1aXJlZFJvbGVGaWVsZHMsIFsnbmFtZSddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciByb2xlIG5hbWU6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlVW5pcXVlbmVzcygnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydyZXFJZCddKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgaWRlbXBvdGVuY3kgcmVxdWVzdCBJRDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgaXNNb25nb0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBNb25nb1N0b3JhZ2VBZGFwdGVyO1xuICAgIGNvbnN0IGlzUG9zdGdyZXNBZGFwdGVyID0gdGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiAgICBpZiAoaXNNb25nb0FkYXB0ZXIgfHwgaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgIGxldCBvcHRpb25zID0ge307XG4gICAgICBpZiAoaXNNb25nb0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICB0dGw6IDAsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKGlzUG9zdGdyZXNBZGFwdGVyKSB7XG4gICAgICAgIG9wdGlvbnMgPSB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucztcbiAgICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19JZGVtcG90ZW5jeScsIHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMsIFsnZXhwaXJlJ10sICd0dGwnLCBmYWxzZSwgb3B0aW9ucylcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBUVEwgaW5kZXggZm9yIGlkZW1wb3RlbmN5IGV4cGlyZSBkYXRlOiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIudXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTtcbiAgfVxuXG4gIF9leHBhbmRSZXN1bHRPbktleVBhdGgob2JqZWN0OiBhbnksIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogYW55IHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJy4nKSA8IDApIHtcbiAgICAgIG9iamVjdFtrZXldID0gdmFsdWVba2V5XTtcbiAgICAgIHJldHVybiBvYmplY3Q7XG4gICAgfVxuICAgIGNvbnN0IHBhdGggPSBrZXkuc3BsaXQoJy4nKTtcbiAgICBjb25zdCBmaXJzdEtleSA9IHBhdGhbMF07XG4gICAgY29uc3QgbmV4dFBhdGggPSBwYXRoLnNsaWNlKDEpLmpvaW4oJy4nKTtcblxuICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICBpZiAodGhpcy5vcHRpb25zICYmIHRoaXMub3B0aW9ucy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgICBmb3IgKGNvbnN0IGtleXdvcmQgb2YgdGhpcy5vcHRpb25zLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBVdGlscy5vYmplY3RDb250YWluc0tleVZhbHVlKHsgZmlyc3RLZXk6IHVuZGVmaW5lZCB9LCBrZXl3b3JkLmtleSwgdW5kZWZpbmVkKTtcbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgIGBQcm9oaWJpdGVkIGtleXdvcmQgaW4gcmVxdWVzdCBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGtleXdvcmQpfS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIG9iamVjdFtmaXJzdEtleV0gPSB0aGlzLl9leHBhbmRSZXN1bHRPbktleVBhdGgoXG4gICAgICBvYmplY3RbZmlyc3RLZXldIHx8IHt9LFxuICAgICAgbmV4dFBhdGgsXG4gICAgICB2YWx1ZVtmaXJzdEtleV1cbiAgICApO1xuICAgIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3Q6IGFueSwgcmVzdWx0OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0ge307XG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICAgIH1cbiAgICBPYmplY3Qua2V5cyhvcmlnaW5hbE9iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgY29uc3Qga2V5VXBkYXRlID0gb3JpZ2luYWxPYmplY3Rba2V5XTtcbiAgICAgIC8vIGRldGVybWluZSBpZiB0aGF0IHdhcyBhbiBvcFxuICAgICAgaWYgKFxuICAgICAgICBrZXlVcGRhdGUgJiZcbiAgICAgICAgdHlwZW9mIGtleVVwZGF0ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAga2V5VXBkYXRlLl9fb3AgJiZcbiAgICAgICAgWydBZGQnLCAnQWRkVW5pcXVlJywgJ1JlbW92ZScsICdJbmNyZW1lbnQnXS5pbmRleE9mKGtleVVwZGF0ZS5fX29wKSA+IC0xXG4gICAgICApIHtcbiAgICAgICAgLy8gb25seSB2YWxpZCBvcHMgdGhhdCBwcm9kdWNlIGFuIGFjdGlvbmFibGUgcmVzdWx0XG4gICAgICAgIC8vIHRoZSBvcCBtYXkgaGF2ZSBoYXBwZW5lZCBvbiBhIGtleXBhdGhcbiAgICAgICAgdGhpcy5fZXhwYW5kUmVzdWx0T25LZXlQYXRoKHJlc3BvbnNlLCBrZXksIHJlc3VsdCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gIH1cblxuICBzdGF0aWMgX3ZhbGlkYXRlUXVlcnk6IGFueSA9PiB2b2lkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERhdGFiYXNlQ29udHJvbGxlcjtcbi8vIEV4cG9zZSB2YWxpZGF0ZVF1ZXJ5IGZvciB0ZXN0c1xubW9kdWxlLmV4cG9ydHMuX3ZhbGlkYXRlUXVlcnkgPSB2YWxpZGF0ZVF1ZXJ5O1xuIl19