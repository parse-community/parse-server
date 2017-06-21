// A database adapter that works with data exported from the hosted
// Parse database.

import { Parse }              from 'parse/node';
import _                      from 'lodash';
import intersect              from 'intersect';
import deepcopy               from 'deepcopy';
import logger                 from '../logger';
import * as SchemaController  from './SchemaController';

function addWriteACL(query, acl) {
  const newQuery = _.cloneDeep(query);
  //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and
  newQuery._wperm = { "$in" : [null, ...acl]};
  return newQuery;
}

function addReadACL(query, acl) {
  const newQuery = _.cloneDeep(query);
  //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and
  newQuery._rperm = {"$in": [null, "*", ...acl]};
  return newQuery;
}

// Transforms a REST API formatted ACL object to our two-field mongo format.
const transformObjectACL = ({ ACL, ...result }) => {
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
}

const specialQuerykeys = ['$and', '$or', '_rperm', '_wperm', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count'];

const isSpecialQueryKey = key => {
  return specialQuerykeys.indexOf(key) >= 0;
}

const validateQuery = query => {
  if (query.ACL) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }

  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(validateQuery);

      /* In MongoDB, $or queries which are not alone at the top level of the
       * query can not make efficient use of indexes due to a long standing
       * bug known as SERVER-13732.
       *
       * This block restructures queries in which $or is not the sole top
       * level element by moving all other top-level predicates inside every
       * subdocument of the $or predicate, allowing MongoDB's query planner
       * to make full use of the most relevant indexes.
       *
       * EG:      {$or: [{a: 1}, {a: 2}], b: 2}
       * Becomes: {$or: [{a: 1, b: 2}, {a: 2, b: 2}]}
       *
       * The only exceptions are $near and $nearSphere operators, which are
       * constrained to only 1 operator per query. As a result, these ops
       * remain at the top level
       *
       * https://jira.mongodb.org/browse/SERVER-13732
       * https://github.com/parse-community/parse-server/issues/3767
       */
      Object.keys(query).forEach(key => {
        const noCollisions = !query.$or.some(subq => subq.hasOwnProperty(key))
        let hasNears = false
        if (query[key] != null && typeof query[key] == 'object') {
          hasNears = ('$near' in query[key] || '$nearSphere' in query[key])
        }
        if (key != '$or' && noCollisions && !hasNears) {
          query.$or.forEach(subquery => {
            subquery[key] = query[key];
          });
          delete query[key];
        }
      });
      query.$or.forEach(validateQuery);
    } else {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }

  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(validateQuery);
    } else {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }

  Object.keys(query).forEach(key => {
    if (query && query[key] && query[key].$regex) {
      if (typeof query[key].$options === 'string') {
        if (!query[key].$options.match(/^[imxs]+$/)) {
          throw new Parse.Error(Parse.Error.INVALID_QUERY, `Bad $options value for query: ${query[key].$options}`);
        }
      }
    }
    if (!isSpecialQueryKey(key) && !key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${key}`);
    }
  });
}

function DatabaseController(adapter, schemaCache) {
  this.adapter = adapter;
  this.schemaCache = schemaCache;
  // We don't want a mutable this.schema, because then you could have
  // one request that uses different schemas for different parts of
  // it. Instead, use loadSchema to get a schema.
  this.schemaPromise = null;
}

DatabaseController.prototype.collectionExists = function(className) {
  return this.adapter.classExists(className);
};

DatabaseController.prototype.purgeCollection = function(className) {
  return this.loadSchema()
    .then(schemaController => schemaController.getOneSchema(className))
    .then(schema => this.adapter.deleteObjectsByQuery(className, schema, {}));
};

DatabaseController.prototype.validateClassName = function(className) {
  if (!SchemaController.classNameIsValid(className)) {
    return Promise.reject(new Parse.Error(Parse.Error.INVALID_CLASS_NAME, 'invalid className: ' + className));
  }
  return Promise.resolve();
};

// Returns a promise for a schemaController.
DatabaseController.prototype.loadSchema = function(options = {clearCache: false}) {
  if (!this.schemaPromise) {
    this.schemaPromise = SchemaController.load(this.adapter, this.schemaCache, options);
    this.schemaPromise.then(() => delete this.schemaPromise,
      () => delete this.schemaPromise);
  }
  return this.schemaPromise;
};

// Returns a promise for the classname that is related to the given
// classname through the key.
// TODO: make this not in the DatabaseController interface
DatabaseController.prototype.redirectClassNameForKey = function(className, key) {
  return this.loadSchema().then((schema) => {
    var t = schema.getExpectedType(className, key);
    if (t && t.type == 'Relation') {
      return t.targetClass;
    } else {
      return className;
    }
  });
};

// Uses the schema to validate the object (REST API format).
// Returns a promise that resolves to the new schema.
// This does not update this.schema, because in a situation like a
// batch request, that could confuse other users of the schema.
DatabaseController.prototype.validateObject = function(className, object, query, { acl }) {
  let schema;
  const isMaster = acl === undefined;
  var aclGroup = acl || [];
  return this.loadSchema().then(s => {
    schema = s;
    if (isMaster) {
      return Promise.resolve();
    }
    return this.canAddField(schema, className, object, aclGroup);
  }).then(() => {
    return schema.validateObject(className, object, query);
  });
};

// Filters out any data that shouldn't be on this REST-formatted object.
const filterSensitiveData = (isMaster, aclGroup, className, object) => {
  if (className !== '_User') {
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

  if ((aclGroup.indexOf(object.objectId) > -1)) {
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
}

DatabaseController.prototype.update = function(className, query, update, {
  acl,
  many,
  upsert,
} = {}, skipSanitization = false) {
  const originalQuery = query;
  const originalUpdate = update;
  // Make a copy of the object, so we don't mutate the incoming data.
  update = deepcopy(update);
  var relationUpdates = [];
  var isMaster = acl === undefined;
  var aclGroup = acl || [];
  return this.loadSchema()
    .then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'update'))
        .then(() => {
          relationUpdates = this.collectRelationUpdates(className, originalQuery.objectId, update);
          if (!isMaster) {
            query = this.addPointerPermissions(schemaController, className, 'update', query, aclGroup);
          }
          if (!query) {
            return Promise.resolve();
          }
          if (acl) {
            query = addWriteACL(query, acl);
          }
          validateQuery(query);
          return schemaController.getOneSchema(className, true)
            .catch(error => {
              // If the schema doesn't exist, pretend it exists with no fields. This behaviour
              // will likely need revisiting.
              if (error === undefined) {
                return { fields: {} };
              }
              throw error;
            })
            .then(schema => {
              Object.keys(update).forEach(fieldName => {
                if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
                  throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
                }
                fieldName = fieldName.split('.')[0];
                if (!SchemaController.fieldNameIsValid(fieldName) && !isSpecialUpdateKey(fieldName)) {
                  throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
                }
              });
              for (const updateOperation in update) {
                if (Object.keys(updateOperation).some(innerKey => innerKey.includes('$') || innerKey.includes('.'))) {
                  throw new Parse.Error(Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
                }
              }
              update = transformObjectACL(update);
              transformAuthData(className, update, schema);
              if (many) {
                return this.adapter.updateObjectsByQuery(className, schema, query, update);
              } else if (upsert) {
                return this.adapter.upsertOneObject(className, schema, query, update);
              } else {
                return this.adapter.findOneAndUpdate(className, schema, query, update)
              }
            });
        })
        .then(result => {
          if (!result) {
            return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.'));
          }
          return this.handleRelationUpdates(className, originalQuery.objectId, update, relationUpdates).then(() => {
            return result;
          });
        }).then((result) => {
          if (skipSanitization) {
            return Promise.resolve(result);
          }
          return sanitizeDatabaseResult(originalUpdate, result);
        });
    });
};

function sanitizeDatabaseResult(originalObject, result) {
  const response = {};
  if (!result) {
    return Promise.resolve(response);
  }
  Object.keys(originalObject).forEach(key => {
    const keyUpdate = originalObject[key];
    // determine if that was an op
    if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op
      && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
      // only valid ops that produce an actionable result
      response[key] = result[key];
    }
  });
  return Promise.resolve(response);
}

// Collect all relation-updating operations from a REST-format update.
// Returns a list of all relation updates to perform
// This mutates update.
DatabaseController.prototype.collectRelationUpdates = function(className, objectId, update) {
  var ops = [];
  var deleteMe = [];
  objectId = update.objectId || objectId;

  var process = (op, key) => {
    if (!op) {
      return;
    }
    if (op.__op == 'AddRelation') {
      ops.push({key, op});
      deleteMe.push(key);
    }

    if (op.__op == 'RemoveRelation') {
      ops.push({key, op});
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
DatabaseController.prototype.handleRelationUpdates = function(className, objectId, update, ops) {
  var pending = [];
  objectId = update.objectId || objectId;
  ops.forEach(({key, op}) => {
    if (!op) {
      return;
    }
    if (op.__op == 'AddRelation') {
      for (const object of op.objects) {
        pending.push(this.addRelation(key, className,
          objectId,
          object.objectId));
      }
    }

    if (op.__op == 'RemoveRelation') {
      for (const object of op.objects) {
        pending.push(this.removeRelation(key, className,
          objectId,
          object.objectId));
      }
    }
  });

  return Promise.all(pending);
};

// Adds a relation.
// Returns a promise that resolves successfully iff the add was successful.
const relationSchema = { fields: { relatedId: { type: 'String' }, owningId: { type: 'String' } } };
DatabaseController.prototype.addRelation = function(key, fromClassName, fromId, toId) {
  const doc = {
    relatedId: toId,
    owningId : fromId
  };
  return this.adapter.upsertOneObject(`_Join:${key}:${fromClassName}`, relationSchema, doc, doc);
};

// Removes a relation.
// Returns a promise that resolves successfully iff the remove was
// successful.
DatabaseController.prototype.removeRelation = function(key, fromClassName, fromId, toId) {
  var doc = {
    relatedId: toId,
    owningId: fromId
  };
  return this.adapter.deleteObjectsByQuery(`_Join:${key}:${fromClassName}`, relationSchema, doc)
    .catch(error => {
    // We don't care if they try to delete a non-existent relation.
      if (error.code == Parse.Error.OBJECT_NOT_FOUND) {
        return;
      }
      throw error;
    });
};

// Removes objects matches this query from the database.
// Returns a promise that resolves successfully iff the object was
// deleted.
// Options:
//   acl:  a list of strings. If the object to be updated has an ACL,
//         one of the provided strings must provide the caller with
//         write permissions.
DatabaseController.prototype.destroy = function(className, query, { acl } = {}) {
  const isMaster = acl === undefined;
  const aclGroup = acl || [];

  return this.loadSchema()
    .then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'delete'))
        .then(() => {
          if (!isMaster) {
            query = this.addPointerPermissions(schemaController, className, 'delete', query, aclGroup);
            if (!query) {
              throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
            }
          }
          // delete by query
          if (acl) {
            query = addWriteACL(query, acl);
          }
          validateQuery(query);
          return schemaController.getOneSchema(className)
            .catch(error => {
              // If the schema doesn't exist, pretend it exists with no fields. This behaviour
              // will likely need revisiting.
              if (error === undefined) {
                return { fields: {} };
              }
              throw error;
            })
            .then(parseFormatSchema => this.adapter.deleteObjectsByQuery(className, parseFormatSchema, query))
            .catch(error => {
              // When deleting sessions while changing passwords, don't throw an error if they don't have any sessions.
              if (className === "_Session" && error.code === Parse.Error.OBJECT_NOT_FOUND) {
                return Promise.resolve({});
              }
              throw error;
            });
        });
    });
};

const flattenUpdateOperatorsForCreate = object => {
  for (const key in object) {
    if (object[key] && object[key].__op) {
      switch (object[key].__op) {
      case 'Increment':
        if (typeof object[key].amount !== 'number') {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to add must be an array');
        }
        object[key] = object[key].amount;
        break;
      case 'Add':
        if (!(object[key].objects instanceof Array)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to add must be an array');
        }
        object[key] = object[key].objects;
        break;
      case 'AddUnique':
        if (!(object[key].objects instanceof Array)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to add must be an array');
        }
        object[key] = object[key].objects;
        break;
      case 'Remove':
        if (!(object[key].objects instanceof Array)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to add must be an array');
        }
        object[key] = []
        break;
      case 'Delete':
        delete object[key];
        break;
      default:
        throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, `The ${object[key].__op} operator is not supported yet.`);
      }
    }
  }
}

const transformAuthData = (className, object, schema) => {
  if (object.authData && className === '_User') {
    Object.keys(object.authData).forEach(provider => {
      const providerData = object.authData[provider];
      const fieldName = `_auth_data_${provider}`;
      if (providerData == null) {
        object[fieldName] = {
          __op: 'Delete'
        }
      } else {
        object[fieldName] = providerData;
        schema.fields[fieldName] = { type: 'Object' }
      }
    });
    delete object.authData;
  }
}

// Inserts an object into the database.
// Returns a promise that resolves successfully iff the object saved.
DatabaseController.prototype.create = function(className, object, { acl } = {}) {
  // Make a copy of the object, so we don't mutate the incoming data.
  const originalObject = object;
  object = transformObjectACL(object);

  object.createdAt = { iso: object.createdAt, __type: 'Date' };
  object.updatedAt = { iso: object.updatedAt, __type: 'Date' };

  var isMaster = acl === undefined;
  var aclGroup = acl || [];
  const relationUpdates = this.collectRelationUpdates(className, null, object);
  return this.validateClassName(className)
    .then(() => this.loadSchema())
    .then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'create'))
        .then(() => schemaController.enforceClassExists(className))
        .then(() => schemaController.reloadData())
        .then(() => schemaController.getOneSchema(className, true))
        .then(schema => {
          transformAuthData(className, object, schema);
          flattenUpdateOperatorsForCreate(object);
          return this.adapter.createObject(className, SchemaController.convertSchemaToAdapterSchema(schema), object);
        })
        .then(result => {
          return this.handleRelationUpdates(className, null, object, relationUpdates).then(() => {
            return sanitizeDatabaseResult(originalObject, result.ops[0])
          });
        });
    })
};

DatabaseController.prototype.canAddField = function(schema, className, object, aclGroup) {
  const classSchema = schema.data[className];
  if (!classSchema) {
    return Promise.resolve();
  }
  const fields = Object.keys(object);
  const schemaFields = Object.keys(classSchema);
  const newKeys = fields.filter((field) => {
    return schemaFields.indexOf(field) < 0;
  })
  if (newKeys.length > 0) {
    return schema.validatePermission(className, aclGroup, 'addField');
  }
  return Promise.resolve();
}

// Won't delete collections in the system namespace
// Returns a promise.
DatabaseController.prototype.deleteEverything = function() {
  this.schemaPromise = null;
  return Promise.all([
    this.adapter.deleteAllClasses(),
    this.schemaCache.clear()
  ]);
};

// Returns a promise for a list of related ids given an owning id.
// className here is the owning className.
DatabaseController.prototype.relatedIds = function(className, key, owningId) {
  return this.adapter.find(joinTableName(className, key), relationSchema, { owningId }, {})
    .then(results => results.map(result => result.relatedId));
};

// Returns a promise for a list of owning ids given some related ids.
// className here is the owning className.
DatabaseController.prototype.owningIds = function(className, key, relatedIds) {
  return this.adapter.find(joinTableName(className, key), relationSchema, { relatedId: { '$in': relatedIds } }, {})
    .then(results => results.map(result => result.owningId));
};

// Modifies query so that it no longer has $in on relation fields, or
// equal-to-pointer constraints on relation fields.
// Returns a promise that resolves when query is mutated
DatabaseController.prototype.reduceInRelation = function(className, query, schema) {

  // Search for an in-relation or equal-to-relation
  // Make it sequential for now, not sure of paralleization side effects
  if (query['$or']) {
    const ors = query['$or'];
    return Promise.all(ors.map((aQuery, index) => {
      return this.reduceInRelation(className, aQuery, schema).then((aQuery) => {
        query['$or'][index] = aQuery;
      });
    })).then(() => {
      return Promise.resolve(query);
    });
  }

  const promises = Object.keys(query).map((key) => {
    const t = schema.getExpectedType(className, key);
    if (!t || t.type !== 'Relation') {
      return Promise.resolve(query);
    }
    let queries = null;
    if (query[key] && (query[key]['$in'] || query[key]['$ne'] || query[key]['$nin'] || query[key].__type == 'Pointer')) {
      // Build the list of queries
      queries = Object.keys(query[key]).map((constraintKey) => {
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
        }
      });
    } else {
      queries = [{isNegation: false, relatedIds: []}];
    }

    // remove the current queryKey as we don,t need it anymore
    delete query[key];
    // execute each query independnently to build the list of
    // $in / $nin
    const promises = queries.map((q) => {
      if (!q) {
        return Promise.resolve();
      }
      return this.owningIds(className, key, q.relatedIds).then((ids) => {
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
    })

  })

  return Promise.all(promises).then(() => {
    return Promise.resolve(query);
  })
};

// Modifies query so that it no longer has $relatedTo
// Returns a promise that resolves when query is mutated
DatabaseController.prototype.reduceRelationKeys = function(className, query) {

  if (query['$or']) {
    return Promise.all(query['$or'].map((aQuery) => {
      return this.reduceRelationKeys(className, aQuery);
    }));
  }

  var relatedTo = query['$relatedTo'];
  if (relatedTo) {
    return this.relatedIds(
      relatedTo.object.className,
      relatedTo.key,
      relatedTo.object.objectId)
      .then((ids) => {
        delete query['$relatedTo'];
        this.addInObjectIdsIds(ids, query);
        return this.reduceRelationKeys(className, query);
      });
  }
};

DatabaseController.prototype.addInObjectIdsIds = function(ids = null, query) {
  const idsFromString = typeof query.objectId === 'string' ? [query.objectId] : null;
  const idsFromEq = query.objectId && query.objectId['$eq'] ? [query.objectId['$eq']] : null;
  const idsFromIn = query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null;

  const allIds = [idsFromString, idsFromEq, idsFromIn, ids].filter(list => list !== null);
  const totalLength = allIds.reduce((memo, list) => memo + list.length, 0);

  let idsIntersection = [];
  if (totalLength > 125) {
    idsIntersection = intersect.big(allIds);
  } else {
    idsIntersection = intersect(allIds);
  }

  // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
  if (!('objectId' in query)) {
    query.objectId = {};
  } else if (typeof query.objectId === 'string') {
    query.objectId = {
      $eq: query.objectId
    };
  }
  query.objectId['$in'] = idsIntersection;

  return query;
}

DatabaseController.prototype.addNotInObjectIdsIds = function(ids = [], query) {
  const idsFromNin = query.objectId && query.objectId['$nin'] ? query.objectId['$nin'] : [];
  let allIds = [...idsFromNin,...ids].filter(list => list !== null);

  // make a set and spread to remove duplicates
  allIds = [...new Set(allIds)];

  // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
  if (!('objectId' in query)) {
    query.objectId = {};
  } else if (typeof query.objectId === 'string') {
    query.objectId = {
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
// TODO: make userIds not needed here. The db adapter shouldn't know
// anything about users, ideally. Then, improve the format of the ACL
// arg to work like the others.
DatabaseController.prototype.find = function(className, query, {
  skip,
  limit,
  acl,
  sort = {},
  count,
  keys,
  op,
  readPreference
} = {}) {
  const isMaster = acl === undefined;
  const aclGroup = acl || [];
  op = op || (typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find');
  // Count operation if counting
  op = (count === true ? 'count' : op);

  let classExists = true;
  return this.loadSchema()
    .then(schemaController => {
    //Allow volatile classes if querying with Master (for _PushStatus)
    //TODO: Move volatile classes concept into mongo adatper, postgres adapter shouldn't care
    //that api.parse.com breaks when _PushStatus exists in mongo.
      return schemaController.getOneSchema(className, isMaster)
        .catch(error => {
          // Behaviour for non-existent classes is kinda weird on Parse.com. Probably doesn't matter too much.
          // For now, pretend the class exists but has no objects,
          if (error === undefined) {
            classExists = false;
            return { fields: {} };
          }
          throw error;
        })
        .then(schema => {
          // Parse.com treats queries on _created_at and _updated_at as if they were queries on createdAt and updatedAt,
          // so duplicate that behaviour here. If both are specified, the corrent behaviour to match Parse.com is to
          // use the one that appears first in the sort list.
          if (sort._created_at) {
            sort.createdAt = sort._created_at;
            delete sort._created_at;
          }
          if (sort._updated_at) {
            sort.updatedAt = sort._updated_at;
            delete sort._updated_at;
          }
          Object.keys(sort).forEach(fieldName => {
            if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
              throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Cannot sort by ${fieldName}`);
            }
            if (!SchemaController.fieldNameIsValid(fieldName)) {
              throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
            }
          });
          return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, op))
            .then(() => this.reduceRelationKeys(className, query))
            .then(() => this.reduceInRelation(className, query, schemaController))
            .then(() => {
              if (!isMaster) {
                query = this.addPointerPermissions(schemaController, className, op, query, aclGroup);
              }
              if (!query) {
                if (op == 'get') {
                  throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
                } else {
                  return [];
                }
              }
              if (!isMaster) {
                query = addReadACL(query, aclGroup);
              }
              validateQuery(query);
              if (count) {
                if (!classExists) {
                  return 0;
                } else {
                  return this.adapter.count(className, schema, query, readPreference);
                }
              } else {
                if (!classExists) {
                  return [];
                } else {
                  return this.adapter.find(className, schema, query, { skip, limit, sort, keys, readPreference })
                    .then(objects => objects.map(object => {
                      object = untransformObjectACL(object);
                      return filterSensitiveData(isMaster, aclGroup, className, object)
                    })).catch((error) => {
                      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error);
                    });
                }
              }
            });
        });
    });
};

// Transforms a Database format ACL to a REST API format ACL
const untransformObjectACL = ({_rperm, _wperm, ...output}) => {
  if (_rperm || _wperm) {
    output.ACL = {};

    (_rperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = { read: true };
      } else {
        output.ACL[entry]['read'] = true;
      }
    });

    (_wperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = { write: true };
      } else {
        output.ACL[entry]['write'] = true;
      }
    });
  }
  return output;
}

DatabaseController.prototype.deleteSchema = function(className) {
  return this.loadSchema(true)
    .then(schemaController => schemaController.getOneSchema(className, true))
    .catch(error => {
      if (error === undefined) {
        return { fields: {} };
      } else {
        throw error;
      }
    })
    .then(schema => {
      return this.collectionExists(className)
        .then(() => this.adapter.count(className, { fields: {} }))
        .then(count => {
          if (count > 0) {
            throw new Parse.Error(255, `Class ${className} is not empty, contains ${count} objects, cannot drop schema.`);
          }
          return this.adapter.deleteClass(className);
        })
        .then(wasParseCollection => {
          if (wasParseCollection) {
            const relationFieldNames = Object.keys(schema.fields).filter(fieldName => schema.fields[fieldName].type === 'Relation');
            return Promise.all(relationFieldNames.map(name => this.adapter.deleteClass(joinTableName(className, name))));
          } else {
            return Promise.resolve();
          }
        });
    })
}

DatabaseController.prototype.addPointerPermissions = function(schema, className, operation, query, aclGroup = []) {
  // Check if class has public permission for operation
  // If the BaseCLP pass, let go through
  if (schema.testBaseCLP(className, aclGroup, operation)) {
    return query;
  }
  const perms = schema.perms[className];
  const field = ['get', 'find'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';
  const userACL = aclGroup.filter((acl) => {
    return acl.indexOf('role:') != 0 && acl != '*';
  });
  // the ACL should have exactly 1 user
  if (perms && perms[field] && perms[field].length > 0) {
    // No user set return undefined
    // If the length is > 1, that means we didn't dedup users correctly
    if (userACL.length != 1) {
      return;
    }
    const userId = userACL[0];
    const userPointer =  {
      "__type": "Pointer",
      "className": "_User",
      "objectId": userId
    };

    const permFields = perms[field];
    const ors = permFields.map((key) => {
      const q = {
        [key]: userPointer
      };
      return {'$and': [q, query]};
    });
    if (ors.length > 1) {
      return {'$or': ors};
    }
    return ors[0];
  } else {
    return query;
  }
}

// TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
// have a Parse app without it having a _User collection.
DatabaseController.prototype.performInitialization = function() {
  const requiredUserFields = { fields: { ...SchemaController.defaultColumns._Default, ...SchemaController.defaultColumns._User } };
  const requiredRoleFields = { fields: { ...SchemaController.defaultColumns._Default, ...SchemaController.defaultColumns._Role } };

  const userClassPromise = this.loadSchema()
    .then(schema => schema.enforceClassExists('_User'))
  const roleClassPromise = this.loadSchema()
    .then(schema => schema.enforceClassExists('_Role'))

  const usernameUniqueness = userClassPromise
    .then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['username']))
    .catch(error => {
      logger.warn('Unable to ensure uniqueness for usernames: ', error);
      throw error;
    });

  const emailUniqueness = userClassPromise
    .then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['email']))
    .catch(error => {
      logger.warn('Unable to ensure uniqueness for user email addresses: ', error);
      throw error;
    });

  const roleUniqueness = roleClassPromise
    .then(() => this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name']))
    .catch(error => {
      logger.warn('Unable to ensure uniqueness for role name: ', error);
      throw error;
    });

  // Create tables for volatile classes
  const adapterInit = this.adapter.performInitialization({ VolatileClassesSchemas: SchemaController.VolatileClassesSchemas });
  return Promise.all([usernameUniqueness, emailUniqueness, roleUniqueness, adapterInit]);
}

function joinTableName(className, key) {
  return `_Join:${key}:${className}`;
}

// Expose validateQuery for tests
DatabaseController._validateQuery = validateQuery;
module.exports = DatabaseController;
