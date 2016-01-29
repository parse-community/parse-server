// A database adapter that works with data exported from the hosted
// Parse database.

var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var Parse = require('parse/node').Parse;

var Schema = require('./Schema');
var transform = require('./transform');

// options can contain:
//   collectionPrefix: the string to put in front of every collection name.
function ExportAdapter(mongoURI, options) {
  this.mongoURI = mongoURI;
  options = options || {};

  this.collectionPrefix = options.collectionPrefix;

  // We don't want a mutable this.schema, because then you could have
  // one request that uses different schemas for different parts of
  // it. Instead, use loadSchema to get a schema.
  this.schemaPromise = null;

  this.connect();
}

// Connects to the database. Returns a promise that resolves when the
// connection is successful.
// this.db will be populated with a Mongo "Db" object when the
// promise resolves successfully.
ExportAdapter.prototype.connect = function() {
  if (this.connectionPromise) {
    // There's already a connection in progress.
    return this.connectionPromise;
  }

  this.connectionPromise = Promise.resolve().then(() => {
    return MongoClient.connect(this.mongoURI);
  }).then((db) => {
    this.db = db;
  });
  return this.connectionPromise;
};

// Returns a promise for a Mongo collection.
// Generally just for internal use.
var joinRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
var otherRegex = /^[A-Za-z][A-Za-z0-9_]*$/;
ExportAdapter.prototype.collection = function(className) {
  if (className !== '_User' &&
      className !== '_Installation' &&
      className !== '_Session' &&
      className !== '_SCHEMA' &&
      className !== '_Role' &&
      !joinRegex.test(className) &&
      !otherRegex.test(className)) {
    throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME,
                          'invalid className: ' + className);
  }
  return this.connect().then(() => {
    return this.db.collection(this.collectionPrefix + className);
  });
};

function returnsTrue() {
  return true;
}

// Returns a promise for a schema object.
// If we are provided a acceptor, then we run it on the schema.
// If the schema isn't accepted, we reload it at most once.
ExportAdapter.prototype.loadSchema = function(acceptor) {
  acceptor = acceptor || returnsTrue;

  if (!this.schemaPromise) {
    this.schemaPromise = this.collection('_SCHEMA').then((coll) => {
      delete this.schemaPromise;
      return Schema.load(coll);
    });
    return this.schemaPromise;
  }

  return this.schemaPromise.then((schema) => {
    if (acceptor(schema)) {
      return schema;
    }
    this.schemaPromise = this.collection('_SCHEMA').then((coll) => {
      delete this.schemaPromise;
      return Schema.load(coll);
    });
    return this.schemaPromise;
  });
};

// Returns a promise for the classname that is related to the given
// classname through the key.
// TODO: make this not in the ExportAdapter interface
ExportAdapter.prototype.redirectClassNameForKey = function(className, key) {
  return this.loadSchema().then((schema) => {
    var t = schema.getExpectedType(className, key);
    var match = t.match(/^relation<(.*)>$/);
    if (match) {
      return match[1];
    } else {
      return className;
    }
  });
};

// Uses the schema to validate the object (REST API format).
// Returns a promise that resolves to the new schema.
// This does not update this.schema, because in a situation like a
// batch request, that could confuse other users of the schema.
ExportAdapter.prototype.validateObject = function(className, object) {
  return this.loadSchema().then((schema) => {
    return schema.validateObject(className, object);
  });
};

// Like transform.untransformObject but you need to provide a className.
// Filters out any data that shouldn't be on this REST-formatted object.
ExportAdapter.prototype.untransformObject = function(
  schema, isMaster, aclGroup, className, mongoObject) {
  var object = transform.untransformObject(schema, className, mongoObject);

  if (className !== '_User') {
    return object;
  }

  if (isMaster || (aclGroup.indexOf(object.objectId) > -1)) {
    return object;
  }

  delete object.authData;
  delete object.sessionToken;
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
ExportAdapter.prototype.update = function(className, query, update, options) {
  var acceptor = function(schema) {
    return schema.hasKeys(className, Object.keys(query));
  };
  var isMaster = !('acl' in options);
  var aclGroup = options.acl || [];
  var mongoUpdate, schema;
  return this.loadSchema(acceptor).then((s) => {
    schema = s;
    if (!isMaster) {
      return schema.validatePermission(className, aclGroup, 'update');
    }
    return Promise.resolve();
  }).then(() => {

    return this.handleRelationUpdates(className, query.objectId, update);
  }).then(() => {
    return this.collection(className);
  }).then((coll) => {
    var mongoWhere = transform.transformWhere(schema, className, query);
    if (options.acl) {
      var writePerms = [
        {_wperm: {'$exists': false}}
      ];
      for (var entry of options.acl) {
        writePerms.push({_wperm: {'$in': [entry]}});
      }
      mongoWhere = {'$and': [mongoWhere, {'$or': writePerms}]};
    }

    mongoUpdate = transform.transformUpdate(schema, className, update);

    return coll.findAndModify(mongoWhere, {}, mongoUpdate, {});
  }).then((result) => {
    if (!result.value) {
      return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND,
                                            'Object not found.'));
    }
    if (result.lastErrorObject.n != 1) {
      return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND,
                                            'Object not found.'));
    }

    var response = {};
    var inc = mongoUpdate['$inc'];
    if (inc) {
      for (var key in inc) {
        response[key] = (result.value[key] || 0) + inc[key];
      }
    }
    return response;
  });
};

// Processes relation-updating operations from a REST-format update.
// Returns a promise that resolves successfully when these are
// processed.
// This mutates update.
ExportAdapter.prototype.handleRelationUpdates = function(className,
                                                         objectId,
                                                         update) {
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
      for (x of op.ops) {
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
ExportAdapter.prototype.addRelation = function(key, fromClassName,
                                               fromId, toId) {
  var doc = {
    relatedId: toId,
    owningId: fromId
  };
  var className = '_Join:' + key + ':' + fromClassName;
  return this.collection(className).then((coll) => {
    return coll.update(doc, doc, {upsert: true});
  });
};

// Removes a relation.
// Returns a promise that resolves successfully iff the remove was
// successful.
ExportAdapter.prototype.removeRelation = function(key, fromClassName,
                                                  fromId, toId) {
  var doc = {
    relatedId: toId,
    owningId: fromId
  };
  var className = '_Join:' + key + ':' + fromClassName;
  return this.collection(className).then((coll) => {
    return coll.remove(doc);
  });
};

// Removes objects matches this query from the database.
// Returns a promise that resolves successfully iff the object was
// deleted.
// Options:
//   acl:  a list of strings. If the object to be updated has an ACL,
//         one of the provided strings must provide the caller with
//         write permissions.
ExportAdapter.prototype.destroy = function(className, query, options) {
  options = options || {};
  var isMaster = !('acl' in options);
  var aclGroup = options.acl || [];

  var schema;
  return this.loadSchema().then((s) => {
    schema = s;
    if (!isMaster) {
      return schema.validatePermission(className, aclGroup, 'delete');
    }
    return Promise.resolve();
  }).then(() => {

    return this.collection(className);
  }).then((coll) => {
    var mongoWhere = transform.transformWhere(schema, className, query);

    if (options.acl) {
      var writePerms = [
        {_wperm: {'$exists': false}}
      ];
      for (var entry of options.acl) {
        writePerms.push({_wperm: {'$in': [entry]}});
      }
      mongoWhere = {'$and': [mongoWhere, {'$or': writePerms}]};
    }

    return coll.remove(mongoWhere);
  }).then((resp) => {
    if (resp.result.n === 0) {
      return Promise.reject(
        new Parse.Error(Parse.Error.OBJECT_NOT_FOUND,
                        'Object not found.'));

    }
  }, (error) => {
    throw error;
  });
};

// Inserts an object into the database.
// Returns a promise that resolves successfully iff the object saved.
ExportAdapter.prototype.create = function(className, object, options) {
  var schema;
  var isMaster = !('acl' in options);
  var aclGroup = options.acl || [];

  return this.loadSchema().then((s) => {
    schema = s;
    if (!isMaster) {
      return schema.validatePermission(className, aclGroup, 'create');
    }
    return Promise.resolve();
  }).then(() => {

    return this.handleRelationUpdates(className, null, object);
  }).then(() => {
    return this.collection(className);
  }).then((coll) => {
    var mongoObject = transform.transformCreate(schema, className, object);
    return coll.insert([mongoObject]);
  });
};

// Runs a mongo query on the database.
// This should only be used for testing - use 'find' for normal code
// to avoid Mongo-format dependencies.
// Returns a promise that resolves to a list of items.
ExportAdapter.prototype.mongoFind = function(className, query, options) {
  options = options || {};
  return this.collection(className).then((coll) => {
    return coll.find(query, options).toArray();
  });
};

// Deletes everything in the database matching the current collectionPrefix
// Won't delete collections in the system namespace
// Returns a promise.
ExportAdapter.prototype.deleteEverything = function() {
  this.schemaPromise = null;

  return this.connect().then(() => {
    return this.db.collections();
  }).then((colls) => {
    var promises = [];
    for (var coll of colls) {
      if (!coll.namespace.match(/\.system\./) &&
          coll.collectionName.indexOf(this.collectionPrefix) === 0) {
        promises.push(coll.drop());
      }
    }
    return Promise.all(promises);
  });
};

// Finds the keys in a query. Returns a Set. REST format only
function keysForQuery(query) {
  var sublist = query['$and'] || query['$or'];
  if (sublist) {
    var answer = new Set();
    for (var subquery of sublist) {
      for (var key of keysForQuery(subquery)) {
        answer.add(key);
      }
    }
    return answer;
  }

  return new Set(Object.keys(query));
}

// Returns a promise for a list of related ids given an owning id.
// className here is the owning className.
ExportAdapter.prototype.relatedIds = function(className, key, owningId) {
  var joinTable = '_Join:' + key + ':' + className;
  return this.collection(joinTable).then((coll) => {
    return coll.find({owningId: owningId}).toArray();
  }).then((results) => {
    return results.map(r => r.relatedId);
  });
};

// Returns a promise for a list of owning ids given some related ids.
// className here is the owning className.
ExportAdapter.prototype.owningIds = function(className, key, relatedIds) {
  var joinTable = '_Join:' + key + ':' + className;
  return this.collection(joinTable).then((coll) => {
    return coll.find({relatedId: {'$in': relatedIds}}).toArray();
  }).then((results) => {
    return results.map(r => r.owningId);
  });
};

// Modifies query so that it no longer has $in on relation fields, or
// equal-to-pointer constraints on relation fields.
// Returns a promise that resolves when query is mutated
// TODO: this only handles one of these at a time - make it handle more
ExportAdapter.prototype.reduceInRelation = function(className, query, schema) {
  // Search for an in-relation or equal-to-relation
  for (var key in query) {
    if (query[key] &&
        (query[key]['$in'] || query[key].__type == 'Pointer')) {
      var t = schema.getExpectedType(className, key);
      var match = t ? t.match(/^relation<(.*)>$/) : false;
      if (!match) {
        continue;
      }
      var relatedClassName = match[1];
      var relatedIds;
      if (query[key]['$in']) {
        relatedIds = query[key]['$in'].map(r => r.objectId);
      } else {
        relatedIds = [query[key].objectId];
      }
      return this.owningIds(className, key, relatedIds).then((ids) => {
        delete query[key];
        query.objectId = {'$in': ids};
      });
    }
  }
  return Promise.resolve();
};

// Modifies query so that it no longer has $relatedTo
// Returns a promise that resolves when query is mutated
ExportAdapter.prototype.reduceRelationKeys = function(className, query) {
  var relatedTo = query['$relatedTo'];
  if (relatedTo) {
    return this.relatedIds(
      relatedTo.object.className,
      relatedTo.key,
      relatedTo.object.objectId).then((ids) => {
        delete query['$relatedTo'];
        query['objectId'] = {'$in': ids};
        return this.reduceRelationKeys(className, query);
      });
  }
};

// Does a find with "smart indexing".
// Currently this just means, if it needs a geoindex and there is
// none, then build the geoindex.
// This could be improved a lot but it's not clear if that's a good
// idea. Or even if this behavior is a good idea.
ExportAdapter.prototype.smartFind = function(coll, where, options) {
  return coll.find(where, options).toArray()
    .then((result) => {
      return result;
    }, (error) => {
      // Check for "no geoindex" error
      if (!error.message.match(/unable to find index for .geoNear/) ||
          error.code != 17007) {
        throw error;
      }

      // Figure out what key needs an index
      var key = error.message.match(/field=([A-Za-z_0-9]+) /)[1];
      if (!key) {
        throw error;
      }

      var index = {};
      index[key] = '2d';
      return coll.createIndex(index).then(() => {
        // Retry, but just once.
        return coll.find(where, options).toArray();
      });
    });
};

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
ExportAdapter.prototype.find = function(className, query, options) {
  options = options || {};
  var mongoOptions = {};
  if (options.skip) {
    mongoOptions.skip = options.skip;
  }
  if (options.limit) {
    mongoOptions.limit = options.limit;
  }

  var isMaster = !('acl' in options);
  var aclGroup = options.acl || [];
  var acceptor = function(schema) {
    return schema.hasKeys(className, keysForQuery(query));
  };
  var schema;
  return this.loadSchema(acceptor).then((s) => {
    schema = s;
    if (options.sort) {
      mongoOptions.sort = {};
      for (var key in options.sort) {
        var mongoKey = transform.transformKey(schema, className, key);
        mongoOptions.sort[mongoKey] = options.sort[key];
      }
    }

    if (!isMaster) {
      var op = 'find';
      var k = Object.keys(query);
      if (k.length == 1 && typeof query.objectId == 'string') {
        op = 'get';
      }
      return schema.validatePermission(className, aclGroup, op);
    }
    return Promise.resolve();
  }).then(() => {
    return this.reduceRelationKeys(className, query);
  }).then(() => {
    return this.reduceInRelation(className, query, schema);
  }).then(() => {
    return this.collection(className);
  }).then((coll) => {
    var mongoWhere = transform.transformWhere(schema, className, query);
    if (!isMaster) {
      var orParts = [
        {"_rperm" : { "$exists": false }},
        {"_rperm" : { "$in" : ["*"]}}
      ];
      for (var acl of aclGroup) {
        orParts.push({"_rperm" : { "$in" : [acl]}});
      }
      mongoWhere = {'$and': [mongoWhere, {'$or': orParts}]};
    }
    if (options.count) {
      return coll.count(mongoWhere, mongoOptions);
    } else {
      return this.smartFind(coll, mongoWhere, mongoOptions)
        .then((mongoResults) => {
          return mongoResults.map((r) => {
            return this.untransformObject(
              schema, isMaster, aclGroup, className, r);
          });
        });
    }
  });
};

module.exports = ExportAdapter;
