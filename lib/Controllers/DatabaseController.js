"use strict";

var _node = require("parse/node");

var _lodash = _interopRequireDefault(require("lodash"));

var _intersect = _interopRequireDefault(require("intersect"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var _logger = _interopRequireDefault(require("../logger"));

var SchemaController = _interopRequireWildcard(require("./SchemaController"));

var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");

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
  constructor(adapter, schemaCache) {
    this.adapter = adapter;
    this.schemaCache = schemaCache; // We don't want a mutable this.schema, because then you could have
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

    this.schemaPromise = SchemaController.load(this.adapter, this.schemaCache, options);
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

            if (!SchemaController.fieldNameIsValid(rootFieldName) && !isSpecialUpdateKey(rootFieldName)) {
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
    return Promise.all([this.adapter.deleteAllClasses(fast), this.schemaCache.clear()]);
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
    }, {}).then(results => results.map(result => result.owningId));
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

          if (!SchemaController.fieldNameIsValid(rootFieldName)) {
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
    return this.loadSchema({
      clearCache: true
    }).then(schemaController => schemaController.getOneSchema(className, true)).catch(error => {
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
            return;
          });
        } else {
          return Promise.resolve();
        }
      });
    });
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
      const ors = permFields.flatMap(key => {
        // constraint for single pointer setup
        const q = {
          [key]: userPointer
        }; // constraint for users-array setup

        const qa = {
          [key]: {
            $all: [userPointer]
          }
        }; // if we already have a constraint on the key, use the $and

        if (Object.prototype.hasOwnProperty.call(query, key)) {
          return [{
            $and: [q, query]
          }, {
            $and: [qa, query]
          }];
        } // otherwise just add the constaint


        return [Object.assign({}, query, q), Object.assign({}, query, qa)];
      });
      return {
        $or: ors
      };
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


  performInitialization() {
    const requiredUserFields = {
      fields: _objectSpread({}, SchemaController.defaultColumns._Default, {}, SchemaController.defaultColumns._User)
    };
    const requiredRoleFields = {
      fields: _objectSpread({}, SchemaController.defaultColumns._Default, {}, SchemaController.defaultColumns._Role)
    };
    const userClassPromise = this.loadSchema().then(schema => schema.enforceClassExists('_User'));
    const roleClassPromise = this.loadSchema().then(schema => schema.enforceClassExists('_Role'));
    const usernameUniqueness = userClassPromise.then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['username'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for usernames: ', error);

      throw error;
    });
    const usernameCaseInsensitiveIndex = userClassPromise.then(() => this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true)).catch(error => {
      _logger.default.warn('Unable to create case insensitive username index: ', error);

      throw error;
    });
    const emailUniqueness = userClassPromise.then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['email'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);

      throw error;
    });
    const emailCaseInsensitiveIndex = userClassPromise.then(() => this.adapter.ensureIndex('_User', requiredUserFields, ['email'], 'case_insensitive_email', true)).catch(error => {
      _logger.default.warn('Unable to create case insensitive email index: ', error);

      throw error;
    });
    const roleUniqueness = roleClassPromise.then(() => this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for role name: ', error);

      throw error;
    });
    const indexPromise = this.adapter.updateSchemaWithIndexes(); // Create tables for volatile classes

    const adapterInit = this.adapter.performInitialization({
      VolatileClassesSchemas: SchemaController.VolatileClassesSchemas
    });
    return Promise.all([usernameUniqueness, usernameCaseInsensitiveIndex, emailUniqueness, emailCaseInsensitiveIndex, roleUniqueness, adapterInit, indexPromise]);
  }

}

module.exports = DatabaseController; // Expose validateQuery for tests

module.exports._validateQuery = validateQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwibmFtZXMiOlsiYWRkV3JpdGVBQ0wiLCJxdWVyeSIsImFjbCIsIm5ld1F1ZXJ5IiwiXyIsImNsb25lRGVlcCIsIl93cGVybSIsIiRpbiIsImFkZFJlYWRBQ0wiLCJfcnBlcm0iLCJ0cmFuc2Zvcm1PYmplY3RBQ0wiLCJBQ0wiLCJyZXN1bHQiLCJlbnRyeSIsInJlYWQiLCJwdXNoIiwid3JpdGUiLCJzcGVjaWFsUXVlcnlrZXlzIiwiaXNTcGVjaWFsUXVlcnlLZXkiLCJrZXkiLCJpbmRleE9mIiwidmFsaWRhdGVRdWVyeSIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiJG9yIiwiQXJyYXkiLCJmb3JFYWNoIiwiJGFuZCIsIiRub3IiLCJsZW5ndGgiLCJPYmplY3QiLCJrZXlzIiwiJHJlZ2V4IiwiJG9wdGlvbnMiLCJtYXRjaCIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiaXNNYXN0ZXIiLCJhY2xHcm91cCIsImF1dGgiLCJvcGVyYXRpb24iLCJzY2hlbWEiLCJjbGFzc05hbWUiLCJwcm90ZWN0ZWRGaWVsZHMiLCJvYmplY3QiLCJ1c2VySWQiLCJ1c2VyIiwiaWQiLCJwZXJtcyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlzUmVhZE9wZXJhdGlvbiIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtIiwiZmlsdGVyIiwic3RhcnRzV2l0aCIsIm1hcCIsInN1YnN0cmluZyIsInZhbHVlIiwibmV3UHJvdGVjdGVkRmllbGRzIiwib3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMiLCJwb2ludGVyUGVybSIsInBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyIiwicmVhZFVzZXJGaWVsZFZhbHVlIiwiaXNBcnJheSIsInNvbWUiLCJvYmplY3RJZCIsImZpZWxkcyIsInYiLCJpbmNsdWRlcyIsImlzVXNlckNsYXNzIiwiayIsInRlbXBvcmFyeUtleXMiLCJwYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJzZXNzaW9uVG9rZW4iLCJfZW1haWxfdmVyaWZ5X3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3RvbWJzdG9uZSIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIl9wYXNzd29yZF9oaXN0b3J5IiwiYXV0aERhdGEiLCJzcGVjaWFsS2V5c0ZvclVwZGF0ZSIsImlzU3BlY2lhbFVwZGF0ZUtleSIsImV4cGFuZFJlc3VsdE9uS2V5UGF0aCIsInBhdGgiLCJzcGxpdCIsImZpcnN0S2V5IiwibmV4dFBhdGgiLCJzbGljZSIsImpvaW4iLCJzYW5pdGl6ZURhdGFiYXNlUmVzdWx0Iiwib3JpZ2luYWxPYmplY3QiLCJyZXNwb25zZSIsIlByb21pc2UiLCJyZXNvbHZlIiwia2V5VXBkYXRlIiwiX19vcCIsImpvaW5UYWJsZU5hbWUiLCJmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlIiwiYW1vdW50IiwiSU5WQUxJRF9KU09OIiwib2JqZWN0cyIsIkNPTU1BTkRfVU5BVkFJTEFCTEUiLCJ0cmFuc2Zvcm1BdXRoRGF0YSIsInByb3ZpZGVyIiwicHJvdmlkZXJEYXRhIiwiZmllbGROYW1lIiwidHlwZSIsInVudHJhbnNmb3JtT2JqZWN0QUNMIiwib3V0cHV0IiwiZ2V0Um9vdEZpZWxkTmFtZSIsInJlbGF0aW9uU2NoZW1hIiwicmVsYXRlZElkIiwib3duaW5nSWQiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFkYXB0ZXIiLCJzY2hlbWFDYWNoZSIsInNjaGVtYVByb21pc2UiLCJfdHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2xsZWN0aW9uRXhpc3RzIiwiY2xhc3NFeGlzdHMiLCJwdXJnZUNvbGxlY3Rpb24iLCJsb2FkU2NoZW1hIiwidGhlbiIsInNjaGVtYUNvbnRyb2xsZXIiLCJnZXRPbmVTY2hlbWEiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsInZhbGlkYXRlQ2xhc3NOYW1lIiwiU2NoZW1hQ29udHJvbGxlciIsImNsYXNzTmFtZUlzVmFsaWQiLCJyZWplY3QiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJvcHRpb25zIiwiY2xlYXJDYWNoZSIsImxvYWQiLCJsb2FkU2NoZW1hSWZOZWVkZWQiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInQiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsInVuZGVmaW5lZCIsInMiLCJjYW5BZGRGaWVsZCIsInVwZGF0ZSIsIm1hbnkiLCJ1cHNlcnQiLCJhZGRzRmllbGQiLCJza2lwU2FuaXRpemF0aW9uIiwidmFsaWRhdGVPbmx5IiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwib3JpZ2luYWxRdWVyeSIsIm9yaWdpbmFsVXBkYXRlIiwicmVsYXRpb25VcGRhdGVzIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiY29sbGVjdFJlbGF0aW9uVXBkYXRlcyIsImFkZFBvaW50ZXJQZXJtaXNzaW9ucyIsImNhdGNoIiwiZXJyb3IiLCJyb290RmllbGROYW1lIiwiZmllbGROYW1lSXNWYWxpZCIsInVwZGF0ZU9wZXJhdGlvbiIsImlubmVyS2V5IiwiSU5WQUxJRF9ORVNURURfS0VZIiwiZmluZCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwc2VydE9uZU9iamVjdCIsImZpbmRPbmVBbmRVcGRhdGUiLCJoYW5kbGVSZWxhdGlvblVwZGF0ZXMiLCJvcHMiLCJkZWxldGVNZSIsInByb2Nlc3MiLCJvcCIsIngiLCJwZW5kaW5nIiwiYWRkUmVsYXRpb24iLCJyZW1vdmVSZWxhdGlvbiIsImFsbCIsImZyb21DbGFzc05hbWUiLCJmcm9tSWQiLCJ0b0lkIiwiZG9jIiwiY29kZSIsImRlc3Ryb3kiLCJwYXJzZUZvcm1hdFNjaGVtYSIsImNyZWF0ZSIsImNyZWF0ZWRBdCIsImlzbyIsIl9fdHlwZSIsInVwZGF0ZWRBdCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImNyZWF0ZU9iamVjdCIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJjbGFzc1NjaGVtYSIsInNjaGVtYURhdGEiLCJzY2hlbWFGaWVsZHMiLCJuZXdLZXlzIiwiZmllbGQiLCJhY3Rpb24iLCJkZWxldGVFdmVyeXRoaW5nIiwiZmFzdCIsImRlbGV0ZUFsbENsYXNzZXMiLCJjbGVhciIsInJlbGF0ZWRJZHMiLCJxdWVyeU9wdGlvbnMiLCJza2lwIiwibGltaXQiLCJzb3J0IiwiZmluZE9wdGlvbnMiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwiX2lkIiwicmVzdWx0cyIsIm93bmluZ0lkcyIsInJlZHVjZUluUmVsYXRpb24iLCJvcnMiLCJhUXVlcnkiLCJpbmRleCIsInByb21pc2VzIiwicXVlcmllcyIsImNvbnN0cmFpbnRLZXkiLCJpc05lZ2F0aW9uIiwiciIsInEiLCJpZHMiLCJhZGROb3RJbk9iamVjdElkc0lkcyIsImFkZEluT2JqZWN0SWRzSWRzIiwicmVkdWNlUmVsYXRpb25LZXlzIiwicmVsYXRlZFRvIiwiaWRzRnJvbVN0cmluZyIsImlkc0Zyb21FcSIsImlkc0Zyb21JbiIsImFsbElkcyIsImxpc3QiLCJ0b3RhbExlbmd0aCIsInJlZHVjZSIsIm1lbW8iLCJpZHNJbnRlcnNlY3Rpb24iLCJpbnRlcnNlY3QiLCJiaWciLCIkZXEiLCJpZHNGcm9tTmluIiwiU2V0IiwiJG5pbiIsImNvdW50IiwiZGlzdGluY3QiLCJwaXBlbGluZSIsInJlYWRQcmVmZXJlbmNlIiwiaGludCIsImNhc2VJbnNlbnNpdGl2ZSIsImV4cGxhaW4iLCJfY3JlYXRlZF9hdCIsIl91cGRhdGVkX2F0IiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiYWdncmVnYXRlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZGVsZXRlU2NoZW1hIiwiZGVsZXRlQ2xhc3MiLCJ3YXNQYXJzZUNvbGxlY3Rpb24iLCJyZWxhdGlvbkZpZWxkTmFtZXMiLCJuYW1lIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwidXNlckFDTCIsImdyb3VwS2V5IiwicGVybUZpZWxkcyIsInBvaW50ZXJGaWVsZHMiLCJ1c2VyUG9pbnRlciIsImZsYXRNYXAiLCJxYSIsIiRhbGwiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJhc3NpZ24iLCJwcmVzZXJ2ZUtleXMiLCJzZXJ2ZXJPbmx5S2V5cyIsImF1dGhlbnRpY2F0ZWQiLCJyb2xlcyIsInVzZXJSb2xlcyIsImFjYyIsInByb3RlY3RlZEtleXNTZXRzIiwicHJvdGVjdGVkS2V5cyIsIm5leHQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwicmVxdWlyZWRVc2VyRmllbGRzIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsIl9Vc2VyIiwicmVxdWlyZWRSb2xlRmllbGRzIiwiX1JvbGUiLCJ1c2VyQ2xhc3NQcm9taXNlIiwicm9sZUNsYXNzUHJvbWlzZSIsInVzZXJuYW1lVW5pcXVlbmVzcyIsImVuc3VyZVVuaXF1ZW5lc3MiLCJsb2dnZXIiLCJ3YXJuIiwidXNlcm5hbWVDYXNlSW5zZW5zaXRpdmVJbmRleCIsImVuc3VyZUluZGV4IiwiZW1haWxVbmlxdWVuZXNzIiwiZW1haWxDYXNlSW5zZW5zaXRpdmVJbmRleCIsInJvbGVVbmlxdWVuZXNzIiwiaW5kZXhQcm9taXNlIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJhZGFwdGVySW5pdCIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJtb2R1bGUiLCJleHBvcnRzIiwiX3ZhbGlkYXRlUXVlcnkiXSwibWFwcGluZ3MiOiI7O0FBS0E7O0FBRUE7O0FB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QVBvQixDQUF2QjtBQVNBLFVBQU1tSixZQUFZLEdBQUcsS0FBSy9MLE9BQUwsQ0FBYWdNLHVCQUFiLEVBQXJCLENBcEZzQixDQXNGdEI7O0FBQ0EsVUFBTUMsV0FBVyxHQUFHLEtBQUtqTSxPQUFMLENBQWE2SyxxQkFBYixDQUFtQztBQUNyRHFCLE1BQUFBLHNCQUFzQixFQUFFckwsZ0JBQWdCLENBQUNxTDtBQURZLEtBQW5DLENBQXBCO0FBR0EsV0FBT3pOLE9BQU8sQ0FBQ3VGLEdBQVIsQ0FBWSxDQUNqQnNILGtCQURpQixFQUVqQkksNEJBRmlCLEVBR2pCRSxlQUhpQixFQUlqQkMseUJBSmlCLEVBS2pCQyxjQUxpQixFQU1qQkcsV0FOaUIsRUFPakJGLFlBUGlCLENBQVosQ0FBUDtBQVNEOztBQTEzQ3NCOztBQSszQ3pCSSxNQUFNLENBQUNDLE9BQVAsR0FBaUJ0TSxrQkFBakIsQyxDQUNBOztBQUNBcU0sTUFBTSxDQUFDQyxPQUFQLENBQWVDLGNBQWYsR0FBZ0N4UyxhQUFoQyIsInNvdXJjZXNDb250ZW50IjpbIu+7vy8vIEBmbG93XG4vLyBBIGRhdGFiYXNlIGFkYXB0ZXIgdGhhdCB3b3JrcyB3aXRoIGRhdGEgZXhwb3J0ZWQgZnJvbSB0aGUgaG9zdGVkXG4vLyBQYXJzZSBkYXRhYmFzZS5cblxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgaW50ZXJzZWN0IGZyb20gJ2ludGVyc2VjdCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgKiBhcyBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4vU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHR5cGUge1xuICBRdWVyeU9wdGlvbnMsXG4gIEZ1bGxRdWVyeU9wdGlvbnMsXG59IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuXG5mdW5jdGlvbiBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3dwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll93cGVybSA9IHsgJGluOiBbbnVsbCwgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbmZ1bmN0aW9uIGFkZFJlYWRBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ19ycGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fcnBlcm0gPSB7ICRpbjogW251bGwsICcqJywgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbi8vIFRyYW5zZm9ybXMgYSBSRVNUIEFQSSBmb3JtYXR0ZWQgQUNMIG9iamVjdCB0byBvdXIgdHdvLWZpZWxkIG1vbmdvIGZvcm1hdC5cbmNvbnN0IHRyYW5zZm9ybU9iamVjdEFDTCA9ICh7IEFDTCwgLi4ucmVzdWx0IH0pID0+IHtcbiAgaWYgKCFBQ0wpIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcmVzdWx0Ll93cGVybSA9IFtdO1xuICByZXN1bHQuX3JwZXJtID0gW107XG5cbiAgZm9yIChjb25zdCBlbnRyeSBpbiBBQ0wpIHtcbiAgICBpZiAoQUNMW2VudHJ5XS5yZWFkKSB7XG4gICAgICByZXN1bHQuX3JwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgICBpZiAoQUNMW2VudHJ5XS53cml0ZSkge1xuICAgICAgcmVzdWx0Ll93cGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmNvbnN0IHNwZWNpYWxRdWVyeWtleXMgPSBbXG4gICckYW5kJyxcbiAgJyRvcicsXG4gICckbm9yJyxcbiAgJ19ycGVybScsXG4gICdfd3Blcm0nLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuXTtcblxuY29uc3QgaXNTcGVjaWFsUXVlcnlLZXkgPSBrZXkgPT4ge1xuICByZXR1cm4gc3BlY2lhbFF1ZXJ5a2V5cy5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmNvbnN0IHZhbGlkYXRlUXVlcnkgPSAocXVlcnk6IGFueSk6IHZvaWQgPT4ge1xuICBpZiAocXVlcnkuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdDYW5ub3QgcXVlcnkgb24gQUNMLicpO1xuICB9XG5cbiAgaWYgKHF1ZXJ5LiRvcikge1xuICAgIGlmIChxdWVyeS4kb3IgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJG9yLmZvckVhY2godmFsaWRhdGVRdWVyeSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkb3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRhbmQpIHtcbiAgICBpZiAocXVlcnkuJGFuZCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBxdWVyeS4kYW5kLmZvckVhY2godmFsaWRhdGVRdWVyeSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkYW5kIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kbm9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRub3IgaW5zdGFuY2VvZiBBcnJheSAmJiBxdWVyeS4kbm9yLmxlbmd0aCA+IDApIHtcbiAgICAgIHF1ZXJ5LiRub3IuZm9yRWFjaCh2YWxpZGF0ZVF1ZXJ5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAnQmFkICRub3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IG9mIGF0IGxlYXN0IDEgdmFsdWUuJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmIChxdWVyeSAmJiBxdWVyeVtrZXldICYmIHF1ZXJ5W2tleV0uJHJlZ2V4KSB7XG4gICAgICBpZiAodHlwZW9mIHF1ZXJ5W2tleV0uJG9wdGlvbnMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmICghcXVlcnlba2V5XS4kb3B0aW9ucy5tYXRjaCgvXltpbXhzXSskLykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgYEJhZCAkb3B0aW9ucyB2YWx1ZSBmb3IgcXVlcnk6ICR7cXVlcnlba2V5XS4kb3B0aW9uc31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIWlzU3BlY2lhbFF1ZXJ5S2V5KGtleSkgJiYgIWtleS5tYXRjaCgvXlthLXpBLVpdW2EtekEtWjAtOV9cXC5dKiQvKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICBgSW52YWxpZCBrZXkgbmFtZTogJHtrZXl9YFxuICAgICAgKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLy8gRmlsdGVycyBvdXQgYW55IGRhdGEgdGhhdCBzaG91bGRuJ3QgYmUgb24gdGhpcyBSRVNULWZvcm1hdHRlZCBvYmplY3QuXG5jb25zdCBmaWx0ZXJTZW5zaXRpdmVEYXRhID0gKFxuICBpc01hc3RlcjogYm9vbGVhbixcbiAgYWNsR3JvdXA6IGFueVtdLFxuICBhdXRoOiBhbnksXG4gIG9wZXJhdGlvbjogYW55LFxuICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gIHByb3RlY3RlZEZpZWxkczogbnVsbCB8IEFycmF5PGFueT4sXG4gIG9iamVjdDogYW55XG4pID0+IHtcbiAgbGV0IHVzZXJJZCA9IG51bGw7XG4gIGlmIChhdXRoICYmIGF1dGgudXNlcikgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuXG4gIC8vIHJlcGxhY2UgcHJvdGVjdGVkRmllbGRzIHdoZW4gdXNpbmcgcG9pbnRlci1wZXJtaXNzaW9uc1xuICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcbiAgaWYgKHBlcm1zKSB7XG4gICAgY29uc3QgaXNSZWFkT3BlcmF0aW9uID0gWydnZXQnLCAnZmluZCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xO1xuXG4gICAgaWYgKGlzUmVhZE9wZXJhdGlvbiAmJiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIGV4dHJhY3QgcHJvdGVjdGVkRmllbGRzIGFkZGVkIHdpdGggdGhlIHBvaW50ZXItcGVybWlzc2lvbiBwcmVmaXhcbiAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtID0gT2JqZWN0LmtleXMocGVybXMucHJvdGVjdGVkRmllbGRzKVxuICAgICAgICAuZmlsdGVyKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBrZXkuc3Vic3RyaW5nKDEwKSwgdmFsdWU6IHBlcm1zLnByb3RlY3RlZEZpZWxkc1trZXldIH07XG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBuZXdQcm90ZWN0ZWRGaWVsZHM6IEFycmF5PHN0cmluZz5bXSA9IFtdO1xuICAgICAgbGV0IG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gZmFsc2U7XG5cbiAgICAgIC8vIGNoZWNrIGlmIHRoZSBvYmplY3QgZ3JhbnRzIHRoZSBjdXJyZW50IHVzZXIgYWNjZXNzIGJhc2VkIG9uIHRoZSBleHRyYWN0ZWQgZmllbGRzXG4gICAgICBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybS5mb3JFYWNoKHBvaW50ZXJQZXJtID0+IHtcbiAgICAgICAgbGV0IHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IHJlYWRVc2VyRmllbGRWYWx1ZSA9IG9iamVjdFtwb2ludGVyUGVybS5rZXldO1xuICAgICAgICBpZiAocmVhZFVzZXJGaWVsZFZhbHVlKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVhZFVzZXJGaWVsZFZhbHVlKSkge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSByZWFkVXNlckZpZWxkVmFsdWUuc29tZShcbiAgICAgICAgICAgICAgdXNlciA9PiB1c2VyLm9iamVjdElkICYmIHVzZXIub2JqZWN0SWQgPT09IHVzZXJJZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPVxuICAgICAgICAgICAgICByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkID09PSB1c2VySWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyKSB7XG4gICAgICAgICAgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSB0cnVlO1xuICAgICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHBvaW50ZXJQZXJtLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIGlmIGF0IGxlYXN0IG9uZSBwb2ludGVyLXBlcm1pc3Npb24gYWZmZWN0ZWQgdGhlIGN1cnJlbnQgdXNlclxuICAgICAgLy8gaW50ZXJzZWN0IHZzIHByb3RlY3RlZEZpZWxkcyBmcm9tIHByZXZpb3VzIHN0YWdlIChAc2VlIGFkZFByb3RlY3RlZEZpZWxkcylcbiAgICAgIC8vIFNldHMgdGhlb3J5IChpbnRlcnNlY3Rpb25zKTogQSB4IChCIHggQykgPT0gKEEgeCBCKSB4IENcbiAgICAgIGlmIChvdmVycmlkZVByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocHJvdGVjdGVkRmllbGRzKTtcbiAgICAgIH1cbiAgICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgICAvLyBpZiB0aGVyZSdyZSBubyBwcm90Y3RlZEZpZWxkcyBieSBvdGhlciBjcml0ZXJpYSAoIGlkIC8gcm9sZSAvIGF1dGgpXG4gICAgICAgICAgLy8gdGhlbiB3ZSBtdXN0IGludGVyc2VjdCBlYWNoIHNldCAocGVyIHVzZXJGaWVsZClcbiAgICAgICAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gZmllbGRzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHMuZmlsdGVyKHYgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlzVXNlckNsYXNzID0gY2xhc3NOYW1lID09PSAnX1VzZXInO1xuXG4gIC8qIHNwZWNpYWwgdHJlYXQgZm9yIHRoZSB1c2VyIGNsYXNzOiBkb24ndCBmaWx0ZXIgcHJvdGVjdGVkRmllbGRzIGlmIGN1cnJlbnRseSBsb2dnZWRpbiB1c2VyIGlzXG4gIHRoZSByZXRyaWV2ZWQgdXNlciAqL1xuICBpZiAoIShpc1VzZXJDbGFzcyAmJiB1c2VySWQgJiYgb2JqZWN0Lm9iamVjdElkID09PSB1c2VySWQpKSB7XG4gICAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG5cbiAgICAvLyBmaWVsZHMgbm90IHJlcXVlc3RlZCBieSBjbGllbnQgKGV4Y2x1ZGVkKSxcbiAgICAvL2J1dCB3ZXJlIG5lZWRlZCB0byBhcHBseSBwcm90ZWN0dGVkRmllbGRzXG4gICAgcGVybXMucHJvdGVjdGVkRmllbGRzICYmXG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyAmJlxuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuICB9XG5cbiAgaWYgKCFpc1VzZXJDbGFzcykge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBvYmplY3QucGFzc3dvcmQgPSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcbiAgZGVsZXRlIG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuXG4gIGRlbGV0ZSBvYmplY3Quc2Vzc2lvblRva2VuO1xuXG4gIGlmIChpc01hc3Rlcikge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZGVsZXRlIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuO1xuICBkZWxldGUgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuO1xuICBkZWxldGUgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX3RvbWJzdG9uZTtcbiAgZGVsZXRlIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX2ZhaWxlZF9sb2dpbl9jb3VudDtcbiAgZGVsZXRlIG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQ7XG4gIGRlbGV0ZSBvYmplY3QuX3Bhc3N3b3JkX2hpc3Rvcnk7XG5cbiAgaWYgKGFjbEdyb3VwLmluZGV4T2Yob2JqZWN0Lm9iamVjdElkKSA+IC0xKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuaW1wb3J0IHR5cGUgeyBMb2FkU2NoZW1hT3B0aW9ucyB9IGZyb20gJy4vdHlwZXMnO1xuXG4vLyBSdW5zIGFuIHVwZGF0ZSBvbiB0aGUgZGF0YWJhc2UuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gb2JqZWN0IHdpdGggdGhlIG5ldyB2YWx1ZXMgZm9yIGZpZWxkXG4vLyBtb2RpZmljYXRpb25zIHRoYXQgZG9uJ3Qga25vdyB0aGVpciByZXN1bHRzIGFoZWFkIG9mIHRpbWUsIGxpa2Vcbi8vICdpbmNyZW1lbnQnLlxuLy8gT3B0aW9uczpcbi8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbmNvbnN0IHNwZWNpYWxLZXlzRm9yVXBkYXRlID0gW1xuICAnX2hhc2hlZF9wYXNzd29yZCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFVwZGF0ZUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsS2V5c0ZvclVwZGF0ZS5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmZ1bmN0aW9uIGV4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3QsIGtleSwgdmFsdWUpIHtcbiAgaWYgKGtleS5pbmRleE9mKCcuJykgPCAwKSB7XG4gICAgb2JqZWN0W2tleV0gPSB2YWx1ZVtrZXldO1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgY29uc3QgcGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICBjb25zdCBmaXJzdEtleSA9IHBhdGhbMF07XG4gIGNvbnN0IG5leHRQYXRoID0gcGF0aC5zbGljZSgxKS5qb2luKCcuJyk7XG4gIG9iamVjdFtmaXJzdEtleV0gPSBleHBhbmRSZXN1bHRPbktleVBhdGgoXG4gICAgb2JqZWN0W2ZpcnN0S2V5XSB8fCB7fSxcbiAgICBuZXh0UGF0aCxcbiAgICB2YWx1ZVtmaXJzdEtleV1cbiAgKTtcbiAgZGVsZXRlIG9iamVjdFtrZXldO1xuICByZXR1cm4gb2JqZWN0O1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQpOiBQcm9taXNlPGFueT4ge1xuICBjb25zdCByZXNwb25zZSA9IHt9O1xuICBpZiAoIXJlc3VsdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICB9XG4gIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgY29uc3Qga2V5VXBkYXRlID0gb3JpZ2luYWxPYmplY3Rba2V5XTtcbiAgICAvLyBkZXRlcm1pbmUgaWYgdGhhdCB3YXMgYW4gb3BcbiAgICBpZiAoXG4gICAgICBrZXlVcGRhdGUgJiZcbiAgICAgIHR5cGVvZiBrZXlVcGRhdGUgPT09ICdvYmplY3QnICYmXG4gICAgICBrZXlVcGRhdGUuX19vcCAmJlxuICAgICAgWydBZGQnLCAnQWRkVW5pcXVlJywgJ1JlbW92ZScsICdJbmNyZW1lbnQnXS5pbmRleE9mKGtleVVwZGF0ZS5fX29wKSA+IC0xXG4gICAgKSB7XG4gICAgICAvLyBvbmx5IHZhbGlkIG9wcyB0aGF0IHByb2R1Y2UgYW4gYWN0aW9uYWJsZSByZXN1bHRcbiAgICAgIC8vIHRoZSBvcCBtYXkgaGF2ZSBoYXBwZW5kIG9uIGEga2V5cGF0aFxuICAgICAgZXhwYW5kUmVzdWx0T25LZXlQYXRoKHJlc3BvbnNlLCBrZXksIHJlc3VsdCk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG59XG5cbmZ1bmN0aW9uIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIGBfSm9pbjoke2tleX06JHtjbGFzc05hbWV9YDtcbn1cblxuY29uc3QgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSA9IG9iamVjdCA9PiB7XG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICBzd2l0Y2ggKG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldLmFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5J1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY2xhc3MgRGF0YWJhc2VDb250cm9sbGVyIHtcbiAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG4gIHNjaGVtYVByb21pc2U6ID9Qcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj47XG4gIF90cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueTtcblxuICBjb25zdHJ1Y3RvcihhZGFwdGVyOiBTdG9yYWdlQWRhcHRlciwgc2NoZW1hQ2FjaGU6IGFueSkge1xuICAgIHRoaXMuYWRhcHRlciA9IGFkYXB0ZXI7XG4gICAgdGhpcy5zY2hlbWFDYWNoZSA9IHNjaGVtYUNhY2hlO1xuICAgIC8vIFdlIGRvbid0IHdhbnQgYSBtdXRhYmxlIHRoaXMuc2NoZW1hLCBiZWNhdXNlIHRoZW4geW91IGNvdWxkIGhhdmVcbiAgICAvLyBvbmUgcmVxdWVzdCB0aGF0IHVzZXMgZGlmZmVyZW50IHNjaGVtYXMgZm9yIGRpZmZlcmVudCBwYXJ0cyBvZlxuICAgIC8vIGl0LiBJbnN0ZWFkLCB1c2UgbG9hZFNjaGVtYSB0byBnZXQgYSBzY2hlbWEuXG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gIH1cblxuICBjb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICB9XG5cbiAgcHVyZ2VDb2xsZWN0aW9uKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihzY2hlbWEgPT4gdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCB7fSkpO1xuICB9XG5cbiAgdmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgJ2ludmFsaWQgY2xhc3NOYW1lOiAnICsgY2xhc3NOYW1lXG4gICAgICAgIClcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHNjaGVtYUNvbnRyb2xsZXIuXG4gIGxvYWRTY2hlbWEoXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFQcm9taXNlICE9IG51bGwpIHtcbiAgICAgIHJldHVybiB0aGlzLnNjaGVtYVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IFNjaGVtYUNvbnRyb2xsZXIubG9hZChcbiAgICAgIHRoaXMuYWRhcHRlcixcbiAgICAgIHRoaXMuc2NoZW1hQ2FjaGUsXG4gICAgICBvcHRpb25zXG4gICAgKTtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UudGhlbihcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2UsXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgbG9hZFNjaGVtYUlmTmVlZGVkKFxuICAgIHNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICA/IFByb21pc2UucmVzb2x2ZShzY2hlbWFDb250cm9sbGVyKVxuICAgICAgOiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIGNsYXNzbmFtZSB0aGF0IGlzIHJlbGF0ZWQgdG8gdGhlIGdpdmVuXG4gIC8vIGNsYXNzbmFtZSB0aHJvdWdoIHRoZSBrZXkuXG4gIC8vIFRPRE86IG1ha2UgdGhpcyBub3QgaW4gdGhlIERhdGFiYXNlQ29udHJvbGxlciBpbnRlcmZhY2VcbiAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nKTogUHJvbWlzZTw/c3RyaW5nPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIHZhciB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAodCAhPSBudWxsICYmIHR5cGVvZiB0ICE9PSAnc3RyaW5nJyAmJiB0LnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHQudGFyZ2V0Q2xhc3M7XG4gICAgICB9XG4gICAgICByZXR1cm4gY2xhc3NOYW1lO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVXNlcyB0aGUgc2NoZW1hIHRvIHZhbGlkYXRlIHRoZSBvYmplY3QgKFJFU1QgQVBJIGZvcm1hdCkuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEuXG4gIC8vIFRoaXMgZG9lcyBub3QgdXBkYXRlIHRoaXMuc2NoZW1hLCBiZWNhdXNlIGluIGEgc2l0dWF0aW9uIGxpa2UgYVxuICAvLyBiYXRjaCByZXF1ZXN0LCB0aGF0IGNvdWxkIGNvbmZ1c2Ugb3RoZXIgdXNlcnMgb2YgdGhlIHNjaGVtYS5cbiAgdmFsaWRhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgcXVlcnk6IGFueSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgbGV0IHNjaGVtYTtcbiAgICBjb25zdCBhY2wgPSBydW5PcHRpb25zLmFjbDtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cDogc3RyaW5nW10gPSBhY2wgfHwgW107XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hID0gcztcbiAgICAgICAgaWYgKGlzTWFzdGVyKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmNhbkFkZEZpZWxkKFxuICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgIHJ1bk9wdGlvbnNcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgdXBkYXRlOiBhbnksXG4gICAgeyBhY2wsIG1hbnksIHVwc2VydCwgYWRkc0ZpZWxkIH06IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICBza2lwU2FuaXRpemF0aW9uOiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gcXVlcnk7XG4gICAgY29uc3Qgb3JpZ2luYWxVcGRhdGUgPSB1cGRhdGU7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIHVwZGF0ZSA9IGRlZXBjb3B5KHVwZGF0ZSk7XG4gICAgdmFyIHJlbGF0aW9uVXBkYXRlcyA9IFtdO1xuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oXG4gICAgICBzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICd1cGRhdGUnKVxuICAgICAgICApXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHVwZGF0ZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAndXBkYXRlJyxcbiAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgIGlmIChhZGRzRmllbGQpIHtcbiAgICAgICAgICAgICAgICBxdWVyeSA9IHtcbiAgICAgICAgICAgICAgICAgICRhbmQ6IFtcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICdhZGRGaWVsZCcsXG4gICAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5KTtcbiAgICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKVxuICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICAgICFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSkgJiZcbiAgICAgICAgICAgICAgICAgICAgIWlzU3BlY2lhbFVwZGF0ZUtleShyb290RmllbGROYW1lKVxuICAgICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdXBkYXRlT3BlcmF0aW9uIGluIHVwZGF0ZSkge1xuICAgICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSAmJlxuICAgICAgICAgICAgICAgICAgICB0eXBlb2YgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dKS5zb21lKFxuICAgICAgICAgICAgICAgICAgICAgIGlubmVyS2V5ID0+XG4gICAgICAgICAgICAgICAgICAgICAgICBpbm5lcktleS5pbmNsdWRlcygnJCcpIHx8IGlubmVyS2V5LmluY2x1ZGVzKCcuJylcbiAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHVwZGF0ZSA9IHRyYW5zZm9ybU9iamVjdEFDTCh1cGRhdGUpO1xuICAgICAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgICAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAgICAgICAgICAgLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB7fSlcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCAhcmVzdWx0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgICAgICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobWFueSkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodXBzZXJ0KSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmRPbmVBbmRVcGRhdGUoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAoc2tpcFNhbml0aXphdGlvbikge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbFVwZGF0ZSwgcmVzdWx0KTtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgLy8gQ29sbGVjdCBhbGwgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgbGlzdCBvZiBhbGwgcmVsYXRpb24gdXBkYXRlcyB0byBwZXJmb3JtXG4gIC8vIFRoaXMgbXV0YXRlcyB1cGRhdGUuXG4gIGNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdElkOiA/c3RyaW5nLCB1cGRhdGU6IGFueSkge1xuICAgIHZhciBvcHMgPSBbXTtcbiAgICB2YXIgZGVsZXRlTWUgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcblxuICAgIHZhciBwcm9jZXNzID0gKG9wLCBrZXkpID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0JhdGNoJykge1xuICAgICAgICBmb3IgKHZhciB4IG9mIG9wLm9wcykge1xuICAgICAgICAgIHByb2Nlc3MoeCwga2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IGtleSBpbiB1cGRhdGUpIHtcbiAgICAgIHByb2Nlc3ModXBkYXRlW2tleV0sIGtleSk7XG4gICAgfVxuICAgIGZvciAoY29uc3Qga2V5IG9mIGRlbGV0ZU1lKSB7XG4gICAgICBkZWxldGUgdXBkYXRlW2tleV07XG4gICAgfVxuICAgIHJldHVybiBvcHM7XG4gIH1cblxuICAvLyBQcm9jZXNzZXMgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gYWxsIHVwZGF0ZXMgaGF2ZSBiZWVuIHBlcmZvcm1lZFxuICBoYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0SWQ6IHN0cmluZyxcbiAgICB1cGRhdGU6IGFueSxcbiAgICBvcHM6IGFueVxuICApIHtcbiAgICB2YXIgcGVuZGluZyA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuICAgIG9wcy5mb3JFYWNoKCh7IGtleSwgb3AgfSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2goXG4gICAgICAgICAgICB0aGlzLmFkZFJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKFxuICAgICAgICAgICAgdGhpcy5yZW1vdmVSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZClcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocGVuZGluZyk7XG4gIH1cblxuICAvLyBBZGRzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgYWRkIHdhcyBzdWNjZXNzZnVsLlxuICBhZGRSZWxhdGlvbihcbiAgICBrZXk6IHN0cmluZyxcbiAgICBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZnJvbUlkOiBzdHJpbmcsXG4gICAgdG9JZDogc3RyaW5nXG4gICkge1xuICAgIGNvbnN0IGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgIGRvYyxcbiAgICAgIGRvYyxcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSByZW1vdmUgd2FzXG4gIC8vIHN1Y2Nlc3NmdWwuXG4gIHJlbW92ZVJlbGF0aW9uKFxuICAgIGtleTogc3RyaW5nLFxuICAgIGZyb21DbGFzc05hbWU6IHN0cmluZyxcbiAgICBmcm9tSWQ6IHN0cmluZyxcbiAgICB0b0lkOiBzdHJpbmdcbiAgKSB7XG4gICAgdmFyIGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICBkb2MsXG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCBjYXJlIGlmIHRoZXkgdHJ5IHRvIGRlbGV0ZSBhIG5vbi1leGlzdGVudCByZWxhdGlvbi5cbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBvYmplY3RzIG1hdGNoZXMgdGhpcyBxdWVyeSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgd2FzXG4gIC8vIGRlbGV0ZWQuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuICAvLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4gIC8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG4gIGRlc3Ryb3koXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKFxuICAgICAgc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnZGVsZXRlJylcbiAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICdkZWxldGUnLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gZGVsZXRlIGJ5IHF1ZXJ5XG4gICAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHBhcnNlRm9ybWF0U2NoZW1hID0+XG4gICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gV2hlbiBkZWxldGluZyBzZXNzaW9ucyB3aGlsZSBjaGFuZ2luZyBwYXNzd29yZHMsIGRvbid0IHRocm93IGFuIGVycm9yIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbnkgc2Vzc2lvbnMuXG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicgJiZcbiAgICAgICAgICAgICAgICBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICAvLyBJbnNlcnRzIGFuIG9iamVjdCBpbnRvIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgc2F2ZWQuXG4gIGNyZWF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICBjb25zdCBvcmlnaW5hbE9iamVjdCA9IG9iamVjdDtcbiAgICBvYmplY3QgPSB0cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcblxuICAgIG9iamVjdC5jcmVhdGVkQXQgPSB7IGlzbzogb2JqZWN0LmNyZWF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcbiAgICBvYmplY3QudXBkYXRlZEF0ID0geyBpc286IG9iamVjdC51cGRhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG5cbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgY29uc3QgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgbnVsbCxcbiAgICAgIG9iamVjdFxuICAgICk7XG5cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWUpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnY3JlYXRlJylcbiAgICAgICAgKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSkpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKSlcbiAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgICAgICBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlKG9iamVjdCk7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIFNjaGVtYUNvbnRyb2xsZXIuY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShzY2hlbWEpLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsT2JqZWN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBzYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQub3BzWzBdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICBjYW5BZGRGaWVsZChcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNsYXNzU2NoZW1hID0gc2NoZW1hLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNsYXNzU2NoZW1hKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gICAgY29uc3Qgc2NoZW1hRmllbGRzID0gT2JqZWN0LmtleXMoY2xhc3NTY2hlbWEuZmllbGRzKTtcbiAgICBjb25zdCBuZXdLZXlzID0gZmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICAvLyBTa2lwIGZpZWxkcyB0aGF0IGFyZSB1bnNldFxuICAgICAgaWYgKFxuICAgICAgICBvYmplY3RbZmllbGRdICYmXG4gICAgICAgIG9iamVjdFtmaWVsZF0uX19vcCAmJlxuICAgICAgICBvYmplY3RbZmllbGRdLl9fb3AgPT09ICdEZWxldGUnXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNjaGVtYUZpZWxkcy5pbmRleE9mKGZpZWxkKSA8IDA7XG4gICAgfSk7XG4gICAgaWYgKG5ld0tleXMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYWRkcyBhIG1hcmtlciB0aGF0IG5ldyBmaWVsZCBpcyBiZWluZyBhZGRpbmcgZHVyaW5nIHVwZGF0ZVxuICAgICAgcnVuT3B0aW9ucy5hZGRzRmllbGQgPSB0cnVlO1xuXG4gICAgICBjb25zdCBhY3Rpb24gPSBydW5PcHRpb25zLmFjdGlvbjtcbiAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdhZGRGaWVsZCcsIGFjdGlvbik7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdvbid0IGRlbGV0ZSBjb2xsZWN0aW9ucyBpbiB0aGUgc3lzdGVtIG5hbWVzcGFjZVxuICAvKipcbiAgICogRGVsZXRlIGFsbCBjbGFzc2VzIGFuZCBjbGVhcnMgdGhlIHNjaGVtYSBjYWNoZVxuICAgKlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IGZhc3Qgc2V0IHRvIHRydWUgaWYgaXQncyBvayB0byBqdXN0IGRlbGV0ZSByb3dzIGFuZCBub3QgaW5kZXhlc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gd2hlbiB0aGUgZGVsZXRpb25zIGNvbXBsZXRlc1xuICAgKi9cbiAgZGVsZXRlRXZlcnl0aGluZyhmYXN0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPGFueT4ge1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKFtcbiAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVBbGxDbGFzc2VzKGZhc3QpLFxuICAgICAgdGhpcy5zY2hlbWFDYWNoZS5jbGVhcigpLFxuICAgIF0pO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiByZWxhdGVkIGlkcyBnaXZlbiBhbiBvd25pbmcgaWQuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICByZWxhdGVkSWRzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nLFxuICAgIG93bmluZ0lkOiBzdHJpbmcsXG4gICAgcXVlcnlPcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxBcnJheTxzdHJpbmc+PiB7XG4gICAgY29uc3QgeyBza2lwLCBsaW1pdCwgc29ydCB9ID0gcXVlcnlPcHRpb25zO1xuICAgIGNvbnN0IGZpbmRPcHRpb25zID0ge307XG4gICAgaWYgKHNvcnQgJiYgc29ydC5jcmVhdGVkQXQgJiYgdGhpcy5hZGFwdGVyLmNhblNvcnRPbkpvaW5UYWJsZXMpIHtcbiAgICAgIGZpbmRPcHRpb25zLnNvcnQgPSB7IF9pZDogc29ydC5jcmVhdGVkQXQgfTtcbiAgICAgIGZpbmRPcHRpb25zLmxpbWl0ID0gbGltaXQ7XG4gICAgICBmaW5kT3B0aW9ucy5za2lwID0gc2tpcDtcbiAgICAgIHF1ZXJ5T3B0aW9ucy5za2lwID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoXG4gICAgICAgIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgeyBvd25pbmdJZCB9LFxuICAgICAgICBmaW5kT3B0aW9uc1xuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LnJlbGF0ZWRJZCkpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiBvd25pbmcgaWRzIGdpdmVuIHNvbWUgcmVsYXRlZCBpZHMuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICBvd25pbmdJZHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgcmVsYXRlZElkczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKFxuICAgICAgICBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIHsgcmVsYXRlZElkOiB7ICRpbjogcmVsYXRlZElkcyB9IH0sXG4gICAgICAgIHt9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQub3duaW5nSWQpKTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkaW4gb24gcmVsYXRpb24gZmllbGRzLCBvclxuICAvLyBlcXVhbC10by1wb2ludGVyIGNvbnN0cmFpbnRzIG9uIHJlbGF0aW9uIGZpZWxkcy5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IGFueSwgc2NoZW1hOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIFNlYXJjaCBmb3IgYW4gaW4tcmVsYXRpb24gb3IgZXF1YWwtdG8tcmVsYXRpb25cbiAgICAvLyBNYWtlIGl0IHNlcXVlbnRpYWwgZm9yIG5vdywgbm90IHN1cmUgb2YgcGFyYWxsZWl6YXRpb24gc2lkZSBlZmZlY3RzXG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgY29uc3Qgb3JzID0gcXVlcnlbJyRvciddO1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBvcnMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKFxuICAgICAgICAgICAgYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgICAgcXVlcnlbJyRvciddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9KVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBwcm9taXNlcyA9IE9iamVjdC5rZXlzKHF1ZXJ5KS5tYXAoa2V5ID0+IHtcbiAgICAgIGNvbnN0IHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICghdCB8fCB0LnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgICB9XG4gICAgICBsZXQgcXVlcmllczogPyhhbnlbXSkgPSBudWxsO1xuICAgICAgaWYgKFxuICAgICAgICBxdWVyeVtrZXldICYmXG4gICAgICAgIChxdWVyeVtrZXldWyckaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuZSddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5pbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XS5fX3R5cGUgPT0gJ1BvaW50ZXInKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEJ1aWxkIHRoZSBsaXN0IG9mIHF1ZXJpZXNcbiAgICAgICAgcXVlcmllcyA9IE9iamVjdC5rZXlzKHF1ZXJ5W2tleV0pLm1hcChjb25zdHJhaW50S2V5ID0+IHtcbiAgICAgICAgICBsZXQgcmVsYXRlZElkcztcbiAgICAgICAgICBsZXQgaXNOZWdhdGlvbiA9IGZhbHNlO1xuICAgICAgICAgIGlmIChjb25zdHJhaW50S2V5ID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV0ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJGluJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IHF1ZXJ5W2tleV1bJyRpbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5pbicpIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24gPSB0cnVlO1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IHF1ZXJ5W2tleV1bJyRuaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuZScpIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24gPSB0cnVlO1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldWyckbmUnXS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24sXG4gICAgICAgICAgICByZWxhdGVkSWRzLFxuICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcmllcyA9IFt7IGlzTmVnYXRpb246IGZhbHNlLCByZWxhdGVkSWRzOiBbXSB9XTtcbiAgICAgIH1cblxuICAgICAgLy8gcmVtb3ZlIHRoZSBjdXJyZW50IHF1ZXJ5S2V5IGFzIHdlIGRvbix0IG5lZWQgaXQgYW55bW9yZVxuICAgICAgZGVsZXRlIHF1ZXJ5W2tleV07XG4gICAgICAvLyBleGVjdXRlIGVhY2ggcXVlcnkgaW5kZXBlbmRlbnRseSB0byBidWlsZCB0aGUgbGlzdCBvZlxuICAgICAgLy8gJGluIC8gJG5pblxuICAgICAgY29uc3QgcHJvbWlzZXMgPSBxdWVyaWVzLm1hcChxID0+IHtcbiAgICAgICAgaWYgKCFxKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLm93bmluZ0lkcyhjbGFzc05hbWUsIGtleSwgcS5yZWxhdGVkSWRzKS50aGVuKGlkcyA9PiB7XG4gICAgICAgICAgaWYgKHEuaXNOZWdhdGlvbikge1xuICAgICAgICAgICAgdGhpcy5hZGROb3RJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkcmVsYXRlZFRvXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZVJlbGF0aW9uS2V5cyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHF1ZXJ5T3B0aW9uczogYW55XG4gICk6ID9Qcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5Wyckb3InXS5tYXAoYVF1ZXJ5ID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBhUXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cblxuICAgIHZhciByZWxhdGVkVG8gPSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgIGlmIChyZWxhdGVkVG8pIHtcbiAgICAgIHJldHVybiB0aGlzLnJlbGF0ZWRJZHMoXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICByZWxhdGVkVG8ua2V5LFxuICAgICAgICByZWxhdGVkVG8ub2JqZWN0Lm9iamVjdElkLFxuICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgIClcbiAgICAgICAgLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBkZWxldGUgcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7fSk7XG4gICAgfVxuICB9XG5cbiAgYWRkSW5PYmplY3RJZHNJZHMoaWRzOiA/QXJyYXk8c3RyaW5nPiA9IG51bGwsIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tU3RyaW5nOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnID8gW3F1ZXJ5Lm9iamVjdElkXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUVxOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGVxJ10gPyBbcXVlcnkub2JqZWN0SWRbJyRlcSddXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUluOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGluJ10gPyBxdWVyeS5vYmplY3RJZFsnJGluJ10gOiBudWxsO1xuXG4gICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgY29uc3QgYWxsSWRzOiBBcnJheTxBcnJheTxzdHJpbmc+PiA9IFtcbiAgICAgIGlkc0Zyb21TdHJpbmcsXG4gICAgICBpZHNGcm9tRXEsXG4gICAgICBpZHNGcm9tSW4sXG4gICAgICBpZHMsXG4gICAgXS5maWx0ZXIobGlzdCA9PiBsaXN0ICE9PSBudWxsKTtcbiAgICBjb25zdCB0b3RhbExlbmd0aCA9IGFsbElkcy5yZWR1Y2UoKG1lbW8sIGxpc3QpID0+IG1lbW8gKyBsaXN0Lmxlbmd0aCwgMCk7XG5cbiAgICBsZXQgaWRzSW50ZXJzZWN0aW9uID0gW107XG4gICAgaWYgKHRvdGFsTGVuZ3RoID4gMTI1KSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QuYmlnKGFsbElkcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdChhbGxJZHMpO1xuICAgIH1cblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA9IGlkc0ludGVyc2VjdGlvbjtcblxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIGFkZE5vdEluT2JqZWN0SWRzSWRzKGlkczogc3RyaW5nW10gPSBbXSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21OaW4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gOiBbXTtcbiAgICBsZXQgYWxsSWRzID0gWy4uLmlkc0Zyb21OaW4sIC4uLmlkc10uZmlsdGVyKGxpc3QgPT4gbGlzdCAhPT0gbnVsbCk7XG5cbiAgICAvLyBtYWtlIGEgc2V0IGFuZCBzcHJlYWQgdG8gcmVtb3ZlIGR1cGxpY2F0ZXNcbiAgICBhbGxJZHMgPSBbLi4ubmV3IFNldChhbGxJZHMpXTtcblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBxdWVyeS5vYmplY3RJZFsnJG5pbiddID0gYWxsSWRzO1xuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIFJ1bnMgYSBxdWVyeSBvbiB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYSBsaXN0IG9mIGl0ZW1zLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIHNraXAgICAgbnVtYmVyIG9mIHJlc3VsdHMgdG8gc2tpcC5cbiAgLy8gICBsaW1pdCAgIGxpbWl0IHRvIHRoaXMgbnVtYmVyIG9mIHJlc3VsdHMuXG4gIC8vICAgc29ydCAgICBhbiBvYmplY3Qgd2hlcmUga2V5cyBhcmUgdGhlIGZpZWxkcyB0byBzb3J0IGJ5LlxuICAvLyAgICAgICAgICAgdGhlIHZhbHVlIGlzICsxIGZvciBhc2NlbmRpbmcsIC0xIGZvciBkZXNjZW5kaW5nLlxuICAvLyAgIGNvdW50ICAgcnVuIGEgY291bnQgaW5zdGVhZCBvZiByZXR1cm5pbmcgcmVzdWx0cy5cbiAgLy8gICBhY2wgICAgIHJlc3RyaWN0IHRoaXMgb3BlcmF0aW9uIHdpdGggYW4gQUNMIGZvciB0aGUgcHJvdmlkZWQgYXJyYXlcbiAgLy8gICAgICAgICAgIG9mIHVzZXIgb2JqZWN0SWRzIGFuZCByb2xlcy4gYWNsOiBudWxsIG1lYW5zIG5vIHVzZXIuXG4gIC8vICAgICAgICAgICB3aGVuIHRoaXMgZmllbGQgaXMgbm90IHByZXNlbnQsIGRvbid0IGRvIGFueXRoaW5nIHJlZ2FyZGluZyBBQ0xzLlxuICAvLyAgY2FzZUluc2Vuc2l0aXZlIG1ha2Ugc3RyaW5nIGNvbXBhcmlzb25zIGNhc2UgaW5zZW5zaXRpdmVcbiAgLy8gVE9ETzogbWFrZSB1c2VySWRzIG5vdCBuZWVkZWQgaGVyZS4gVGhlIGRiIGFkYXB0ZXIgc2hvdWxkbid0IGtub3dcbiAgLy8gYW55dGhpbmcgYWJvdXQgdXNlcnMsIGlkZWFsbHkuIFRoZW4sIGltcHJvdmUgdGhlIGZvcm1hdCBvZiB0aGUgQUNMXG4gIC8vIGFyZyB0byB3b3JrIGxpa2UgdGhlIG90aGVycy5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIGFjbCxcbiAgICAgIHNvcnQgPSB7fSxcbiAgICAgIGNvdW50LFxuICAgICAga2V5cyxcbiAgICAgIG9wLFxuICAgICAgZGlzdGluY3QsXG4gICAgICBwaXBlbGluZSxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSA9IGZhbHNlLFxuICAgICAgZXhwbGFpbixcbiAgICB9OiBhbnkgPSB7fSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgb3AgPVxuICAgICAgb3AgfHxcbiAgICAgICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT0gJ3N0cmluZycgJiYgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMVxuICAgICAgICA/ICdnZXQnXG4gICAgICAgIDogJ2ZpbmQnKTtcbiAgICAvLyBDb3VudCBvcGVyYXRpb24gaWYgY291bnRpbmdcbiAgICBvcCA9IGNvdW50ID09PSB0cnVlID8gJ2NvdW50JyA6IG9wO1xuXG4gICAgbGV0IGNsYXNzRXhpc3RzID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKFxuICAgICAgc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIC8vQWxsb3cgdm9sYXRpbGUgY2xhc3NlcyBpZiBxdWVyeWluZyB3aXRoIE1hc3RlciAoZm9yIF9QdXNoU3RhdHVzKVxuICAgICAgICAvL1RPRE86IE1vdmUgdm9sYXRpbGUgY2xhc3NlcyBjb25jZXB0IGludG8gbW9uZ28gYWRhcHRlciwgcG9zdGdyZXMgYWRhcHRlciBzaG91bGRuJ3QgY2FyZVxuICAgICAgICAvL3RoYXQgYXBpLnBhcnNlLmNvbSBicmVha3Mgd2hlbiBfUHVzaFN0YXR1cyBleGlzdHMgaW4gbW9uZ28uXG4gICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGlzTWFzdGVyKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBCZWhhdmlvciBmb3Igbm9uLWV4aXN0ZW50IGNsYXNzZXMgaXMga2luZGEgd2VpcmQgb24gUGFyc2UuY29tLiBQcm9iYWJseSBkb2Vzbid0IG1hdHRlciB0b28gbXVjaC5cbiAgICAgICAgICAgIC8vIEZvciBub3csIHByZXRlbmQgdGhlIGNsYXNzIGV4aXN0cyBidXQgaGFzIG5vIG9iamVjdHMsXG4gICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICBjbGFzc0V4aXN0cyA9IGZhbHNlO1xuICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICAvLyBQYXJzZS5jb20gdHJlYXRzIHF1ZXJpZXMgb24gX2NyZWF0ZWRfYXQgYW5kIF91cGRhdGVkX2F0IGFzIGlmIHRoZXkgd2VyZSBxdWVyaWVzIG9uIGNyZWF0ZWRBdCBhbmQgdXBkYXRlZEF0LFxuICAgICAgICAgICAgLy8gc28gZHVwbGljYXRlIHRoYXQgYmVoYXZpb3IgaGVyZS4gSWYgYm90aCBhcmUgc3BlY2lmaWVkLCB0aGUgY29ycmVjdCBiZWhhdmlvciB0byBtYXRjaCBQYXJzZS5jb20gaXMgdG9cbiAgICAgICAgICAgIC8vIHVzZSB0aGUgb25lIHRoYXQgYXBwZWFycyBmaXJzdCBpbiB0aGUgc29ydCBsaXN0LlxuICAgICAgICAgICAgaWYgKHNvcnQuX2NyZWF0ZWRfYXQpIHtcbiAgICAgICAgICAgICAgc29ydC5jcmVhdGVkQXQgPSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgICBkZWxldGUgc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzb3J0Ll91cGRhdGVkX2F0KSB7XG4gICAgICAgICAgICAgIHNvcnQudXBkYXRlZEF0ID0gc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgICAgZGVsZXRlIHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBxdWVyeU9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgICBzb3J0LFxuICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgICAgICBleHBsYWluLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIE9iamVjdC5rZXlzKHNvcnQpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgYENhbm5vdCBzb3J0IGJ5ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfS5gXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCBvcClcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgICAgICAgICB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgICAgICAgICB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hQ29udHJvbGxlcilcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IHByb3RlY3RlZEZpZWxkcztcbiAgICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAvKiBEb24ndCB1c2UgcHJvamVjdGlvbnMgdG8gb3B0aW1pemUgdGhlIHByb3RlY3RlZEZpZWxkcyBzaW5jZSB0aGUgcHJvdGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICBiYXNlZCBvbiBwb2ludGVyLXBlcm1pc3Npb25zIGFyZSBkZXRlcm1pbmVkIGFmdGVyIHF1ZXJ5aW5nLiBUaGUgZmlsdGVyaW5nIGNhblxuICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlIHRoZSBwcm90ZWN0ZWQgZmllbGRzLiAqL1xuICAgICAgICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gdGhpcy5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ2dldCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAgICAgICAgICAgJ09iamVjdCBub3QgZm91bmQuJ1xuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgICBpZiAob3AgPT09ICd1cGRhdGUnIHx8IG9wID09PSAnZGVsZXRlJykge1xuICAgICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFJlYWRBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSk7XG4gICAgICAgICAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb3VudChcbiAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgICBoaW50XG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChkaXN0aW5jdCkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRpc3RpbmN0KFxuICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgICAgZGlzdGluY3RcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBpcGVsaW5lKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWdncmVnYXRlKFxuICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgICAgcGlwZWxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgICAgICAgICBleHBsYWluXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmQoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAgICAgICAgICAgICAgIC5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKVxuICAgICAgICAgICAgICAgICAgICAudGhlbihvYmplY3RzID0+XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdCA9IHVudHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JcbiAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBkZWxldGVTY2hlbWEoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgICAgIHRoaXMuYWRhcHRlci5jb3VudChjbGFzc05hbWUsIHsgZmllbGRzOiB7fSB9LCBudWxsLCAnJywgZmFsc2UpXG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgICAgIGlmIChjb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIDI1NSxcbiAgICAgICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGlzIG5vdCBlbXB0eSwgY29udGFpbnMgJHtjb3VudH0gb2JqZWN0cywgY2Fubm90IGRyb3Agc2NoZW1hLmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoY2xhc3NOYW1lKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHdhc1BhcnNlQ29sbGVjdGlvbiA9PiB7XG4gICAgICAgICAgICBpZiAod2FzUGFyc2VDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZpbHRlcihcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgICAgIHJlbGF0aW9uRmllbGROYW1lcy5tYXAobmFtZSA9PlxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBuYW1lKSlcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQ29uc3RyYWludHMgcXVlcnkgdXNpbmcgQ0xQJ3MgcG9pbnRlciBwZXJtaXNzaW9ucyAoUFApIGlmIGFueS5cbiAgLy8gMS4gRXRyYWN0IHRoZSB1c2VyIGlkIGZyb20gY2FsbGVyJ3MgQUNMZ3JvdXA7XG4gIC8vIDIuIEV4Y3RyYWN0IGEgbGlzdCBvZiBmaWVsZCBuYW1lcyB0aGF0IGFyZSBQUCBmb3IgdGFyZ2V0IGNvbGxlY3Rpb24gYW5kIG9wZXJhdGlvbjtcbiAgLy8gMy4gQ29uc3RyYWludCB0aGUgb3JpZ2luYWwgcXVlcnkgc28gdGhhdCBlYWNoIFBQIGZpZWxkIG11c3RcbiAgLy8gcG9pbnQgdG8gY2FsbGVyJ3MgaWQgKG9yIGNvbnRhaW4gaXQgaW4gY2FzZSBvZiBQUCBmaWVsZCBiZWluZyBhbiBhcnJheSlcbiAgYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW11cbiAgKTogYW55IHtcbiAgICAvLyBDaGVjayBpZiBjbGFzcyBoYXMgcHVibGljIHBlcm1pc3Npb24gZm9yIG9wZXJhdGlvblxuICAgIC8vIElmIHRoZSBCYXNlQ0xQIHBhc3MsIGxldCBnbyB0aHJvdWdoXG4gICAgaWYgKHNjaGVtYS50ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcblxuICAgIGNvbnN0IHVzZXJBQ0wgPSBhY2xHcm91cC5maWx0ZXIoYWNsID0+IHtcbiAgICAgIHJldHVybiBhY2wuaW5kZXhPZigncm9sZTonKSAhPSAwICYmIGFjbCAhPSAnKic7XG4gICAgfSk7XG5cbiAgICBjb25zdCBncm91cEtleSA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTFcbiAgICAgICAgPyAncmVhZFVzZXJGaWVsZHMnXG4gICAgICAgIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICBjb25zdCBwZXJtRmllbGRzID0gW107XG5cbiAgICBpZiAocGVybXNbb3BlcmF0aW9uXSAmJiBwZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpIHtcbiAgICAgIHBlcm1GaWVsZHMucHVzaCguLi5wZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpO1xuICAgIH1cblxuICAgIGlmIChwZXJtc1tncm91cEtleV0pIHtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICAgIGlmICghcGVybUZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwZXJtRmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICBpZiAocGVybUZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgICAvLyBObyB1c2VyIHNldCByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAvLyBJZiB0aGUgbGVuZ3RoIGlzID4gMSwgdGhhdCBtZWFucyB3ZSBkaWRuJ3QgZGUtZHVwZSB1c2VycyBjb3JyZWN0bHlcbiAgICAgIGlmICh1c2VyQUNMLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXJJZCA9IHVzZXJBQ0xbMF07XG4gICAgICBjb25zdCB1c2VyUG9pbnRlciA9IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IG9ycyA9IHBlcm1GaWVsZHMuZmxhdE1hcChrZXkgPT4ge1xuICAgICAgICAvLyBjb25zdHJhaW50IGZvciBzaW5nbGUgcG9pbnRlciBzZXR1cFxuICAgICAgICBjb25zdCBxID0ge1xuICAgICAgICAgIFtrZXldOiB1c2VyUG9pbnRlcixcbiAgICAgICAgfTtcbiAgICAgICAgLy8gY29uc3RyYWludCBmb3IgdXNlcnMtYXJyYXkgc2V0dXBcbiAgICAgICAgY29uc3QgcWEgPSB7XG4gICAgICAgICAgW2tleV06IHsgJGFsbDogW3VzZXJQb2ludGVyXSB9LFxuICAgICAgICB9O1xuICAgICAgICAvLyBpZiB3ZSBhbHJlYWR5IGhhdmUgYSBjb25zdHJhaW50IG9uIHRoZSBrZXksIHVzZSB0aGUgJGFuZFxuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHF1ZXJ5LCBrZXkpKSB7XG4gICAgICAgICAgcmV0dXJuIFt7ICRhbmQ6IFtxLCBxdWVyeV0gfSwgeyAkYW5kOiBbcWEsIHF1ZXJ5XSB9XTtcbiAgICAgICAgfVxuICAgICAgICAvLyBvdGhlcndpc2UganVzdCBhZGQgdGhlIGNvbnN0YWludFxuICAgICAgICByZXR1cm4gW09iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCBxKSwgT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHFhKV07XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB7ICRvcjogb3JzIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gIH1cblxuICBhZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSA9IHt9LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdLFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIHF1ZXJ5T3B0aW9uczogRnVsbFF1ZXJ5T3B0aW9ucyA9IHt9XG4gICk6IG51bGwgfCBzdHJpbmdbXSB7XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gICAgaWYgKCFwZXJtcykgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHMgPSBwZXJtcy5wcm90ZWN0ZWRGaWVsZHM7XG4gICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHJldHVybiBudWxsO1xuXG4gICAgaWYgKGFjbEdyb3VwLmluZGV4T2YocXVlcnkub2JqZWN0SWQpID4gLTEpIHJldHVybiBudWxsO1xuXG4gICAgLy8gZm9yIHF1ZXJpZXMgd2hlcmUgXCJrZXlzXCIgYXJlIHNldCBhbmQgZG8gbm90IGluY2x1ZGUgYWxsICd1c2VyRmllbGQnOntmaWVsZH0sXG4gICAgLy8gd2UgaGF2ZSB0byB0cmFuc3BhcmVudGx5IGluY2x1ZGUgaXQsIGFuZCB0aGVuIHJlbW92ZSBiZWZvcmUgcmV0dXJuaW5nIHRvIGNsaWVudFxuICAgIC8vIEJlY2F1c2UgaWYgc3VjaCBrZXkgbm90IHByb2plY3RlZCB0aGUgcGVybWlzc2lvbiB3b24ndCBiZSBlbmZvcmNlZCBwcm9wZXJseVxuICAgIC8vIFBTIHRoaXMgaXMgY2FsbGVkIHdoZW4gJ2V4Y2x1ZGVLZXlzJyBhbHJlYWR5IHJlZHVjZWQgdG8gJ2tleXMnXG4gICAgY29uc3QgcHJlc2VydmVLZXlzID0gcXVlcnlPcHRpb25zLmtleXM7XG5cbiAgICAvLyB0aGVzZSBhcmUga2V5cyB0aGF0IG5lZWQgdG8gYmUgaW5jbHVkZWQgb25seVxuICAgIC8vIHRvIGJlIGFibGUgdG8gYXBwbHkgcHJvdGVjdGVkRmllbGRzIGJ5IHBvaW50ZXJcbiAgICAvLyBhbmQgdGhlbiB1bnNldCBiZWZvcmUgcmV0dXJuaW5nIHRvIGNsaWVudCAobGF0ZXIgaW4gIGZpbHRlclNlbnNpdGl2ZUZpZWxkcylcbiAgICBjb25zdCBzZXJ2ZXJPbmx5S2V5cyA9IFtdO1xuXG4gICAgY29uc3QgYXV0aGVudGljYXRlZCA9IGF1dGgudXNlcjtcblxuICAgIC8vIG1hcCB0byBhbGxvdyBjaGVjayB3aXRob3V0IGFycmF5IHNlYXJjaFxuICAgIGNvbnN0IHJvbGVzID0gKGF1dGgudXNlclJvbGVzIHx8IFtdKS5yZWR1Y2UoKGFjYywgcikgPT4ge1xuICAgICAgYWNjW3JdID0gcHJvdGVjdGVkRmllbGRzW3JdO1xuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCB7fSk7XG5cbiAgICAvLyBhcnJheSBvZiBzZXRzIG9mIHByb3RlY3RlZCBmaWVsZHMuIHNlcGFyYXRlIGl0ZW0gZm9yIGVhY2ggYXBwbGljYWJsZSBjcml0ZXJpYVxuICAgIGNvbnN0IHByb3RlY3RlZEtleXNTZXRzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGtleSBpbiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIHNraXAgdXNlckZpZWxkc1xuICAgICAgaWYgKGtleS5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpIHtcbiAgICAgICAgaWYgKHByZXNlcnZlS2V5cykge1xuICAgICAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGtleS5zdWJzdHJpbmcoMTApO1xuICAgICAgICAgIGlmICghcHJlc2VydmVLZXlzLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICAgIC8vIDEuIHB1dCBpdCB0aGVyZSB0ZW1wb3JhcmlseVxuICAgICAgICAgICAgcXVlcnlPcHRpb25zLmtleXMgJiYgcXVlcnlPcHRpb25zLmtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgLy8gMi4gcHJlc2VydmUgaXQgZGVsZXRlIGxhdGVyXG4gICAgICAgICAgICBzZXJ2ZXJPbmx5S2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBhZGQgcHVibGljIHRpZXJcbiAgICAgIGlmIChrZXkgPT09ICcqJykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHByb3RlY3RlZEZpZWxkc1trZXldKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICAgIGlmIChrZXkgPT09ICdhdXRoZW50aWNhdGVkJykge1xuICAgICAgICAgIC8vIGZvciBsb2dnZWQgaW4gdXNlcnNcbiAgICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHByb3RlY3RlZEZpZWxkc1trZXldKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyb2xlc1trZXldICYmIGtleS5zdGFydHNXaXRoKCdyb2xlOicpKSB7XG4gICAgICAgICAgLy8gYWRkIGFwcGxpY2FibGUgcm9sZXNcbiAgICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHJvbGVzW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gY2hlY2sgaWYgdGhlcmUncyBhIHJ1bGUgZm9yIGN1cnJlbnQgdXNlcidzIGlkXG4gICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9IGF1dGgudXNlci5pZDtcbiAgICAgIGlmIChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSkge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBwcmVzZXJ2ZSBmaWVsZHMgdG8gYmUgcmVtb3ZlZCBiZWZvcmUgc2VuZGluZyByZXNwb25zZSB0byBjbGllbnRcbiAgICBpZiAoc2VydmVyT25seUtleXMubGVuZ3RoID4gMCkge1xuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMgPSBzZXJ2ZXJPbmx5S2V5cztcbiAgICB9XG5cbiAgICBsZXQgcHJvdGVjdGVkS2V5cyA9IHByb3RlY3RlZEtleXNTZXRzLnJlZHVjZSgoYWNjLCBuZXh0KSA9PiB7XG4gICAgICBpZiAobmV4dCkge1xuICAgICAgICBhY2MucHVzaCguLi5uZXh0KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwgW10pO1xuXG4gICAgLy8gaW50ZXJzZWN0IGFsbCBzZXRzIG9mIHByb3RlY3RlZEZpZWxkc1xuICAgIHByb3RlY3RlZEtleXNTZXRzLmZvckVhY2goZmllbGRzID0+IHtcbiAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5cyA9IHByb3RlY3RlZEtleXMuZmlsdGVyKHYgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBwcm90ZWN0ZWRLZXlzO1xuICB9XG5cbiAgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKClcbiAgICAgIC50aGVuKHRyYW5zYWN0aW9uYWxTZXNzaW9uID0+IHtcbiAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSB0cmFuc2FjdGlvbmFsU2Vzc2lvbjtcbiAgICAgIH0pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gY29tbWl0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5jb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbilcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgICAgfSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGFib3J0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5hYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFRPRE86IGNyZWF0ZSBpbmRleGVzIG9uIGZpcnN0IGNyZWF0aW9uIG9mIGEgX1VzZXIgb2JqZWN0LiBPdGhlcndpc2UgaXQncyBpbXBvc3NpYmxlIHRvXG4gIC8vIGhhdmUgYSBQYXJzZSBhcHAgd2l0aG91dCBpdCBoYXZpbmcgYSBfVXNlciBjb2xsZWN0aW9uLlxuICBwZXJmb3JtSW5pdGlhbGl6YXRpb24oKSB7XG4gICAgY29uc3QgcmVxdWlyZWRVc2VyRmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX1VzZXIsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgcmVxdWlyZWRSb2xlRmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX1JvbGUsXG4gICAgICB9LFxuICAgIH07XG5cbiAgICBjb25zdCB1c2VyQ2xhc3NQcm9taXNlID0gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT5cbiAgICAgIHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Vc2VyJylcbiAgICApO1xuICAgIGNvbnN0IHJvbGVDbGFzc1Byb21pc2UgPSB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PlxuICAgICAgc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKVxuICAgICk7XG5cbiAgICBjb25zdCB1c2VybmFtZVVuaXF1ZW5lc3MgPSB1c2VyQ2xhc3NQcm9taXNlXG4gICAgICAudGhlbigoKSA9PlxuICAgICAgICB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXJuYW1lczogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgdXNlcm5hbWVDYXNlSW5zZW5zaXRpdmVJbmRleCA9IHVzZXJDbGFzc1Byb21pc2VcbiAgICAgIC50aGVuKCgpID0+XG4gICAgICAgIHRoaXMuYWRhcHRlci5lbnN1cmVJbmRleChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHJlcXVpcmVkVXNlckZpZWxkcyxcbiAgICAgICAgICBbJ3VzZXJuYW1lJ10sXG4gICAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSB1c2VybmFtZSBpbmRleDogJyxcbiAgICAgICAgICBlcnJvclxuICAgICAgICApO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgZW1haWxVbmlxdWVuZXNzID0gdXNlckNsYXNzUHJvbWlzZVxuICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICAnVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VyIGVtYWlsIGFkZHJlc3NlczogJyxcbiAgICAgICAgICBlcnJvclxuICAgICAgICApO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgZW1haWxDYXNlSW5zZW5zaXRpdmVJbmRleCA9IHVzZXJDbGFzc1Byb21pc2VcbiAgICAgIC50aGVuKCgpID0+XG4gICAgICAgIHRoaXMuYWRhcHRlci5lbnN1cmVJbmRleChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHJlcXVpcmVkVXNlckZpZWxkcyxcbiAgICAgICAgICBbJ2VtYWlsJ10sXG4gICAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfZW1haWwnLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSBlbWFpbCBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3Qgcm9sZVVuaXF1ZW5lc3MgPSByb2xlQ2xhc3NQcm9taXNlXG4gICAgICAudGhlbigoKSA9PlxuICAgICAgICB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1JvbGUnLCByZXF1aXJlZFJvbGVGaWVsZHMsIFsnbmFtZSddKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3Igcm9sZSBuYW1lOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCBpbmRleFByb21pc2UgPSB0aGlzLmFkYXB0ZXIudXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTtcblxuICAgIC8vIENyZWF0ZSB0YWJsZXMgZm9yIHZvbGF0aWxlIGNsYXNzZXNcbiAgICBjb25zdCBhZGFwdGVySW5pdCA9IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICB1c2VybmFtZVVuaXF1ZW5lc3MsXG4gICAgICB1c2VybmFtZUNhc2VJbnNlbnNpdGl2ZUluZGV4LFxuICAgICAgZW1haWxVbmlxdWVuZXNzLFxuICAgICAgZW1haWxDYXNlSW5zZW5zaXRpdmVJbmRleCxcbiAgICAgIHJvbGVVbmlxdWVuZXNzLFxuICAgICAgYWRhcHRlckluaXQsXG4gICAgICBpbmRleFByb21pc2UsXG4gICAgXSk7XG4gIH1cblxuICBzdGF0aWMgX3ZhbGlkYXRlUXVlcnk6IGFueSA9PiB2b2lkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERhdGFiYXNlQ29udHJvbGxlcjtcbi8vIEV4cG9zZSB2YWxpZGF0ZVF1ZXJ5IGZvciB0ZXN0c1xubW9kdWxlLmV4cG9ydHMuX3ZhbGlkYXRlUXVlcnkgPSB2YWxpZGF0ZVF1ZXJ5O1xuIl19