// A database adapter that works with data exported from the hosted
// Parse database.

import intersect from 'intersect';
import _         from 'lodash';

var mongodb = require('mongodb');
var Parse = require('parse/node').Parse;

var SchemaController = require('../Controllers/SchemaController');
const deepcopy = require('deepcopy');

function addWriteACL(query, acl) {
  let newQuery = _.cloneDeep(query);
  //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and
  newQuery._wperm = { "$in" : [null, ...acl]};
  return newQuery;
}

function addReadACL(query, acl) {
  let newQuery = _.cloneDeep(query);
  //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and
  newQuery._rperm = { "$in" : [null, "*", ...acl]};
  return newQuery;
}

function DatabaseController(adapter, { skipValidation } = {}) {
  this.adapter = adapter;

  // We don't want a mutable this.schema, because then you could have
  // one request that uses different schemas for different parts of
  // it. Instead, use loadSchema to get a schema.
  this.schemaPromise = null;
  this.skipValidation = !!skipValidation;
  this.connect();

  Object.defineProperty(this, 'transform', {
     get: function() {
       return adapter.transform;
     }
  })
}

DatabaseController.prototype.WithoutValidation = function() {
  return new DatabaseController(this.adapter, {collectionPrefix: this.collectionPrefix, skipValidation: true});
}

// Connects to the database. Returns a promise that resolves when the
// connection is successful.
DatabaseController.prototype.connect = function() {
  return this.adapter.connect();
};

DatabaseController.prototype.schemaCollection = function() {
  return this.adapter.schemaCollection();
};

DatabaseController.prototype.collectionExists = function(className) {
  return this.adapter.collectionExists(className);
};

DatabaseController.prototype.validateClassName = function(className) {
  if (this.skipValidation) {
    return Promise.resolve();
  }
  if (!SchemaController.classNameIsValid(className)) {
    const error = new Parse.Error(Parse.Error.INVALID_CLASS_NAME, 'invalid className: ' + className);
    return Promise.reject(error);
  }
  return Promise.resolve();
};

// Returns a promise for a schema object.
// If we are provided a acceptor, then we run it on the schema.
// If the schema isn't accepted, we reload it at most once.
DatabaseController.prototype.loadSchema = function() {

  if (!this.schemaPromise) {
    this.schemaPromise = this.schemaCollection().then(collection => {
      delete this.schemaPromise;
      return SchemaController.load(collection, this.adapter);
    });
  }
  return this.schemaPromise;
};

// Returns a promise for the classname that is related to the given
// classname through the key.
// TODO: make this not in the DatabaseController interface
DatabaseController.prototype.redirectClassNameForKey = function(className, key) {
  return this.loadSchema().then((schema) => {
    var t = schema.getExpectedType(className, key);
    if (t.type == 'Relation') {
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
  let isMaster = acl === undefined;
  var aclGroup = acl || [];
  return this.loadSchema().then(s => {
    schema = s;
    if (isMaster) {
      return Promise.resolve();
    }
    return this.canAddField(schema, className, object, aclGroup);
  }).then(() => {
    return schema.validateObject(className, object, query);
  });
};

// Like transform.untransformObject but you need to provide a className.
// Filters out any data that shouldn't be on this REST-formatted object.
DatabaseController.prototype.untransformObject = function(
  schema, isMaster, aclGroup, className, mongoObject) {
  var object = this.transform.untransformObject(schema, className, mongoObject);

  if (className !== '_User') {
    return object;
  }

  delete object.sessionToken;

  if (isMaster || (aclGroup.indexOf(object.objectId) > -1)) {
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
DatabaseController.prototype.update = function(className, query, update, {
  acl,
  many,
  upsert,
} = {}) {

  const originalUpdate = update;
  // Make a copy of the object, so we don't mutate the incoming data.
  update = deepcopy(update);

  var isMaster = acl === undefined;
  var aclGroup = acl || [];
  var mongoUpdate;
  return this.loadSchema()
  .then(schemaController => {
    return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'update'))
    .then(() => this.handleRelationUpdates(className, query.objectId, update))
    .then(() => this.adapter.adaptiveCollection(className))
    .then(collection => {
      if (!isMaster) {
        query = this.addPointerPermissions(schemaController, className, 'update', query, aclGroup);
      }
      if (!query) {
        return Promise.resolve();
      }
      if (acl) {
        query = addWriteACL(query, acl);
      }
      return schemaController.getOneSchema(className)
      .catch(error => {
        // If the schema doesn't exist, pretend it exists with no fields. This behaviour
        // will likely need revisiting.
        if (error === undefined) {
          return { fields: {} };
        }
        throw error;
      })
      .then(parseFormatSchema => {
        var mongoWhere = this.transform.transformWhere(className, query, {validate: !this.skipValidation}, parseFormatSchema);
        mongoUpdate = this.transform.transformUpdate(
          schemaController,
          className,
          update,
          {validate: !this.skipValidation}
        );
        if (many) {
          return collection.updateMany(mongoWhere, mongoUpdate);
        } else if (upsert) {
          return collection.upsertOne(mongoWhere, mongoUpdate);
        } else {
          return collection.findOneAndUpdate(mongoWhere, mongoUpdate);
        }
      });
    })
    .then(result => {
      if (!result) {
        return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.'));
      }
      if (this.skipValidation) {
        return Promise.resolve(result);
      }
      return sanitizeDatabaseResult(originalUpdate, result);
    });
  });
};

function sanitizeDatabaseResult(originalObject, result) {
  let response = {};
  if (!result) {
    return Promise.resolve(response);
  }
  Object.keys(originalObject).forEach(key => {
    let keyUpdate = originalObject[key];
    // determine if that was an op
    if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op
      && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
      // only valid ops that produce an actionable result
      response[key] = result[key];
    }
  });
  return Promise.resolve(response);
}

// Processes relation-updating operations from a REST-format update.
// Returns a promise that resolves successfully when these are
// processed.
// This mutates update.
DatabaseController.prototype.handleRelationUpdates = function(className, objectId, update) {
  var pending = [];
  var deleteMe = [];
  objectId = update.objectId || objectId;

  var process = (op, key) => {
    if (!op) {
      return;
    }
    if (op.__op == 'AddRelation') {
      for (var object of op.objects) {
        pending.push(this.addRelation(key, className,
                                      objectId,
                                      object.objectId));
      }
      deleteMe.push(key);
    }

    if (op.__op == 'RemoveRelation') {
      for (var object of op.objects) {
        pending.push(this.removeRelation(key, className,
                                         objectId,
                                         object.objectId));
      }
      deleteMe.push(key);
    }

    if (op.__op == 'Batch') {
      for (var x of op.ops) {
        process(x, key);
      }
    }
  };

  for (var key in update) {
    process(update[key], key);
  }
  for (var key of deleteMe) {
    delete update[key];
  }
  return Promise.all(pending);
};

// Adds a relation.
// Returns a promise that resolves successfully iff the add was successful.
DatabaseController.prototype.addRelation = function(key, fromClassName, fromId, toId) {
  let doc = {
    relatedId: toId,
    owningId : fromId
  };
  let className = `_Join:${key}:${fromClassName}`;
  return this.adapter.adaptiveCollection(className).then((coll) => {
    return coll.upsertOne(doc, doc);
  });
};

// Removes a relation.
// Returns a promise that resolves successfully iff the remove was
// successful.
DatabaseController.prototype.removeRelation = function(key, fromClassName, fromId, toId) {
  var doc = {
    relatedId: toId,
    owningId: fromId
  };
  let className = `_Join:${key}:${fromClassName}`;
  return this.adapter.adaptiveCollection(className).then(coll => {
    return coll.deleteOne(doc);
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
      return schemaController.getOneSchema(className)
      .catch(error => {
        // If the schema doesn't exist, pretend it exists with no fields. This behaviour
        // will likely need revisiting.
        if (error === undefined) {
          return { fields: {} };
        }
        throw error;
      })
      .then(parseFormatSchema => this.adapter.deleteObjectsByQuery(className, query, !this.skipValidation, parseFormatSchema))
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

// Inserts an object into the database.
// Returns a promise that resolves successfully iff the object saved.
DatabaseController.prototype.create = function(className, object, { acl } = {}) {
  // Make a copy of the object, so we don't mutate the incoming data.
  let originalObject = object;
  object = deepcopy(object);

  var isMaster = acl === undefined;
  var aclGroup = acl || [];

  return this.validateClassName(className)
  .then(() => this.loadSchema())
  .then(schemaController => {
    return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'create'))
    .then(() => this.handleRelationUpdates(className, null, object))
    .then(() => schemaController.enforceClassExists(className))
    .then(() => schemaController.getOneSchema(className, true))
    .then(schema => this.adapter.createObject(className, object, schemaController, schema))
    .then(result => sanitizeDatabaseResult(originalObject, result.ops[0]));
  })
};

DatabaseController.prototype.canAddField = function(schema, className, object, aclGroup) {
  let classSchema = schema.data[className];
  if (!classSchema) {
    return Promise.resolve();
  }
  let fields = Object.keys(object);
  let schemaFields = Object.keys(classSchema);
  let newKeys = fields.filter((field) => {
    return schemaFields.indexOf(field) < 0;
  })
  if (newKeys.length > 0) {
    return schema.validatePermission(className, aclGroup, 'addField');
  }
  return Promise.resolve();
}

// Runs a mongo query on the database.
// This should only be used for testing - use 'find' for normal code
// to avoid Mongo-format dependencies.
// Returns a promise that resolves to a list of items.
DatabaseController.prototype.mongoFind = function(className, query, options = {}) {
  return this.adapter.adaptiveCollection(className)
    .then(collection => collection.find(query, options));
};

// Deletes everything in the database matching the current collectionPrefix
// Won't delete collections in the system namespace
// Returns a promise.
DatabaseController.prototype.deleteEverything = function() {
  this.schemaPromise = null;
  return this.adapter.deleteAllSchemas();
};

// Finds the keys in a query. Returns a Set. REST format only
function keysForQuery(query) {
  var sublist = query['$and'] || query['$or'];
  if (sublist) {
    let answer = sublist.reduce((memo, subquery) => {
      return memo.concat(keysForQuery(subquery));
    }, []);

    return new Set(answer);
  }

  return new Set(Object.keys(query));
}

// Returns a promise for a list of related ids given an owning id.
// className here is the owning className.
DatabaseController.prototype.relatedIds = function(className, key, owningId) {
  return this.adapter.adaptiveCollection(joinTableName(className, key))
    .then(coll => coll.find({owningId : owningId}))
    .then(results => results.map(r => r.relatedId));
};

// Returns a promise for a list of owning ids given some related ids.
// className here is the owning className.
DatabaseController.prototype.owningIds = function(className, key, relatedIds) {
  return this.adapter.adaptiveCollection(joinTableName(className, key))
    .then(coll => coll.find({ relatedId: { '$in': relatedIds } }))
    .then(results => results.map(r => r.owningId));
};

// Modifies query so that it no longer has $in on relation fields, or
// equal-to-pointer constraints on relation fields.
// Returns a promise that resolves when query is mutated
DatabaseController.prototype.reduceInRelation = function(className, query, schema) {

  // Search for an in-relation or equal-to-relation
  // Make it sequential for now, not sure of paralleization side effects
  if (query['$or']) {
    let ors = query['$or'];
    return Promise.all(ors.map((aQuery, index) => {
      return this.reduceInRelation(className, aQuery, schema).then((aQuery) => {
        query['$or'][index] = aQuery;
      })
    }));
  }

  let promises = Object.keys(query).map((key) => {
    if (query[key] && (query[key]['$in'] || query[key]['$ne'] || query[key]['$nin'] || query[key].__type == 'Pointer')) {
      let t = schema.getExpectedType(className, key);
      if (!t || t.type !== 'Relation') {
        return Promise.resolve(query);
      }
      let relatedClassName = t.targetClass;
      // Build the list of queries
      let queries = Object.keys(query[key]).map((constraintKey) => {
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

      // remove the current queryKey as we don,t need it anymore
      delete query[key];
      // execute each query independnently to build the list of
      // $in / $nin
      let promises = queries.map((q) => {
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

    }
    return Promise.resolve();
  })

  return Promise.all(promises).then(() => {
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
      relatedTo.object.objectId).then((ids) => {
        delete query['$relatedTo'];
        this.addInObjectIdsIds(ids, query);
        return this.reduceRelationKeys(className, query);
      });
  }
};

DatabaseController.prototype.addInObjectIdsIds = function(ids = null, query) {
  let idsFromString = typeof query.objectId === 'string' ? [query.objectId] : null;
  let idsFromEq = query.objectId && query.objectId['$eq'] ? [query.objectId['$eq']] : null;
  let idsFromIn = query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null;

  let allIds = [idsFromString, idsFromEq, idsFromIn, ids].filter(list => list !== null);
  let totalLength = allIds.reduce((memo, list) => memo + list.length, 0);

  let idsIntersection = [];
  if (totalLength > 125) {
    idsIntersection = intersect.big(allIds);
  } else {
    idsIntersection = intersect(allIds);
  }

  // Need to make sure we don't clobber existing $lt or other constraints on objectId.
  // Clobbering $eq, $in and shorthand $eq (query.objectId === 'string') constraints
  // is expected though.
  if (!('objectId' in query) || typeof query.objectId === 'string') {
    query.objectId = {};
  }
  query.objectId['$in'] = idsIntersection;

  return query;
}

DatabaseController.prototype.addNotInObjectIdsIds = function(ids = null, query) {
  let idsFromNin = query.objectId && query.objectId['$nin'] ? query.objectId['$nin'] : null;
  let allIds = [idsFromNin, ids].filter(list => list !== null);
  let totalLength = allIds.reduce((memo, list) => memo + list.length, 0);

  let idsIntersection = [];
  if (totalLength > 125) {
    idsIntersection = intersect.big(allIds);
  } else {
    idsIntersection = intersect(allIds);
  }

  // Need to make sure we don't clobber existing $lt or other constraints on objectId.
  // Clobbering $eq, $in and shorthand $eq (query.objectId === 'string') constraints
  // is expected though.
  if (!('objectId' in query) || typeof query.objectId === 'string') {
    query.objectId = {};
  }
  query.objectId['$nin'] = idsIntersection;

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
  sort,
  count,
} = {}) {
  let mongoOptions = {};
  if (skip) {
    mongoOptions.skip = skip;
  }
  if (limit) {
    mongoOptions.limit = limit;
  }
  let isMaster = acl === undefined;
  let aclGroup = acl || [];
  let op = typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find';
  return this.loadSchema()
  .then(schemaController => {
    if (sort) {
      mongoOptions.sort = {};
      for (let key in sort) {
        let mongoKey = this.transform.transformKeyValue(schemaController, className, key, null, {validate: true}).key;
        mongoOptions.sort[mongoKey] = sort[key];
      }
    }
    return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, op))
    .then(() => this.reduceRelationKeys(className, query))
    .then(() => this.reduceInRelation(className, query, schemaController))
    .then(() => this.adapter.adaptiveCollection(className))
    .then(collection => {
      if (!isMaster) {
        query = this.addPointerPermissions(schemaController, className, op, query, aclGroup);
      }
      if (!query) {
        if (op == 'get') {
          return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND,
            'Object not found.'));
        } else {
          return Promise.resolve([]);
        }
      }
      if (!isMaster) {
        query = addReadACL(query, aclGroup);
      }
      return schemaController.getOneSchema(className)
      .catch(error => {
        // If the schema doesn't exist, pretend it exists with no fields. This behaviour
        // will likely need revisiting.
        if (error === undefined) {
          return { fields: {} };
        }
        throw error;
      })
      .then(parseFormatSchema => {
        let mongoWhere = this.transform.transformWhere(className, query, {}, parseFormatSchema);
        if (count) {
          delete mongoOptions.limit;
          return collection.count(mongoWhere, mongoOptions);
        } else {
          return collection.find(mongoWhere, mongoOptions)
          .then((mongoResults) => {
            return mongoResults.map((r) => {
              return this.untransformObject(schemaController, isMaster, aclGroup, className, r);
            });
          });
        }
      });
    });
  });
};

DatabaseController.prototype.deleteSchema = function(className) {
  return this.collectionExists(className)
  .then(exist => {
    if (!exist) {
      return Promise.resolve();
    }
    return this.adapter.adaptiveCollection(className)
    .then(collection => collection.count())
    .then(count => {
      if (count > 0) {
        throw new Parse.Error(255, `Class ${className} is not empty, contains ${count} objects, cannot drop schema.`);
      }
      return this.adapter.deleteOneSchema(className);
    })
  });
}

DatabaseController.prototype.addPointerPermissions = function(schema, className, operation, query, aclGroup = []) {
  let perms = schema.perms[className];
  let field = ['get', 'find'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';
  let userACL = aclGroup.filter((acl) => {
     return acl.indexOf('role:') != 0 && acl != '*';
  });
  // the ACL should have exactly 1 user
  if (perms && perms[field] && perms[field].length > 0) {
    // No user set return undefined
    if (userACL.length != 1) {
      return;
    }
    let userId = userACL[0];
    let userPointer =  {
          "__type": "Pointer",
          "className": "_User",
          "objectId": userId
        };

    let constraints = {};
    let permFields = perms[field];
    let ors = permFields.map((key) => {
      let q = {
        [key]: userPointer
      };
      return {'$and': [q, query]};
    });
    if (ors.length > 1) {
      return {'$or': ors};
    }
    return ors[0];
  } else {
    return query;
  }
}

function joinTableName(className, key) {
  return `_Join:${key}:${className}`;
}

module.exports = DatabaseController;
