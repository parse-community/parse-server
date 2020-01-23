"use strict";

// An object that encapsulates everything we need to run a 'find'
// operation, encoded in the REST API format.
var SchemaController = require('./Controllers/SchemaController');

var Parse = require('parse/node').Parse;

const triggers = require('./triggers');

const {
  continueWhile
} = require('parse/lib/node/promiseUtils');

const AlwaysSelectedKeys = ['objectId', 'createdAt', 'updatedAt', 'ACL']; // restOptions can include:
//   skip
//   limit
//   order
//   count
//   include
//   keys
//   excludeKeys
//   redirectClassNameForKey
//   readPreference
//   includeReadPreference
//   subqueryReadPreference

function RestQuery(config, auth, className, restWhere = {}, restOptions = {}, clientSDK, runAfterFind = true) {
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.restWhere = restWhere;
  this.restOptions = restOptions;
  this.clientSDK = clientSDK;
  this.runAfterFind = runAfterFind;
  this.response = null;
  this.findOptions = {};

  if (!this.auth.isMaster) {
    if (this.className == '_Session') {
      if (!this.auth.user) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
      }

      this.restWhere = {
        $and: [this.restWhere, {
          user: {
            __type: 'Pointer',
            className: '_User',
            objectId: this.auth.user.id
          }
        }]
      };
    }
  }

  this.doCount = false;
  this.includeAll = false; // The format for this.include is not the same as the format for the
  // include option - it's the paths we should include, in order,
  // stored as arrays, taking into account that we need to include foo
  // before including foo.bar. Also it should dedupe.
  // For example, passing an arg of include=foo.bar,foo.baz could lead to
  // this.include = [['foo'], ['foo', 'baz'], ['foo', 'bar']]

  this.include = []; // If we have keys, we probably want to force some includes (n-1 level)
  // See issue: https://github.com/parse-community/parse-server/issues/3185

  if (Object.prototype.hasOwnProperty.call(restOptions, 'keys')) {
    const keysForInclude = restOptions.keys.split(',').filter(key => {
      // At least 2 components
      return key.split('.').length > 1;
    }).map(key => {
      // Slice the last component (a.b.c -> a.b)
      // Otherwise we'll include one level too much.
      return key.slice(0, key.lastIndexOf('.'));
    }).join(','); // Concat the possibly present include string with the one from the keys
    // Dedup / sorting is handle in 'include' case.

    if (keysForInclude.length > 0) {
      if (!restOptions.include || restOptions.include.length == 0) {
        restOptions.include = keysForInclude;
      } else {
        restOptions.include += ',' + keysForInclude;
      }
    }
  }

  for (var option in restOptions) {
    switch (option) {
      case 'keys':
        {
          const keys = restOptions.keys.split(',').concat(AlwaysSelectedKeys);
          this.keys = Array.from(new Set(keys));
          break;
        }

      case 'excludeKeys':
        {
          const exclude = restOptions.excludeKeys.split(',').filter(k => AlwaysSelectedKeys.indexOf(k) < 0);
          this.excludeKeys = Array.from(new Set(exclude));
          break;
        }

      case 'count':
        this.doCount = true;
        break;

      case 'includeAll':
        this.includeAll = true;
        break;

      case 'explain':
      case 'hint':
      case 'distinct':
      case 'pipeline':
      case 'skip':
      case 'limit':
      case 'readPreference':
        this.findOptions[option] = restOptions[option];
        break;

      case 'order':
        var fields = restOptions.order.split(',');
        this.findOptions.sort = fields.reduce((sortMap, field) => {
          field = field.trim();

          if (field === '$score') {
            sortMap.score = {
              $meta: 'textScore'
            };
          } else if (field[0] == '-') {
            sortMap[field.slice(1)] = -1;
          } else {
            sortMap[field] = 1;
          }

          return sortMap;
        }, {});
        break;

      case 'include':
        {
          const paths = restOptions.include.split(',');

          if (paths.includes('*')) {
            this.includeAll = true;
            break;
          } // Load the existing includes (from keys)


          const pathSet = paths.reduce((memo, path) => {
            // Split each paths on . (a.b.c -> [a,b,c])
            // reduce to create all paths
            // ([a,b,c] -> {a: true, 'a.b': true, 'a.b.c': true})
            return path.split('.').reduce((memo, path, index, parts) => {
              memo[parts.slice(0, index + 1).join('.')] = true;
              return memo;
            }, memo);
          }, {});
          this.include = Object.keys(pathSet).map(s => {
            return s.split('.');
          }).sort((a, b) => {
            return a.length - b.length; // Sort by number of components
          });
          break;
        }

      case 'redirectClassNameForKey':
        this.redirectKey = restOptions.redirectClassNameForKey;
        this.redirectClassName = null;
        break;

      case 'includeReadPreference':
      case 'subqueryReadPreference':
        break;

      default:
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad option: ' + option);
    }
  }
} // A convenient method to perform all the steps of processing a query
// in order.
// Returns a promise for the response - an object with optional keys
// 'results' and 'count'.
// TODO: consolidate the replaceX functions


RestQuery.prototype.execute = function (executeOptions) {
  return Promise.resolve().then(() => {
    return this.buildRestWhere();
  }).then(() => {
    return this.handleIncludeAll();
  }).then(() => {
    return this.handleExcludeKeys();
  }).then(() => {
    return this.runFind(executeOptions);
  }).then(() => {
    return this.runCount();
  }).then(() => {
    return this.handleInclude();
  }).then(() => {
    return this.runAfterFindTrigger();
  }).then(() => {
    return this.response;
  });
};

RestQuery.prototype.each = function (callback) {
  const {
    config,
    auth,
    className,
    restWhere,
    restOptions,
    clientSDK
  } = this; // if the limit is set, use it

  restOptions.limit = restOptions.limit || 100;
  restOptions.order = 'objectId';
  let finished = false;
  return continueWhile(() => {
    return !finished;
  }, async () => {
    const query = new RestQuery(config, auth, className, restWhere, restOptions, clientSDK);
    const {
      results
    } = await query.execute();
    results.forEach(callback);
    finished = results.length < restOptions.limit;

    if (!finished) {
      restWhere.objectId = Object.assign({}, restWhere.objectId, {
        $gt: results[results.length - 1].objectId
      });
    }
  });
};

RestQuery.prototype.buildRestWhere = function () {
  return Promise.resolve().then(() => {
    return this.getUserAndRoleACL();
  }).then(() => {
    return this.redirectClassNameForKey();
  }).then(() => {
    return this.validateClientClassCreation();
  }).then(() => {
    return this.replaceSelect();
  }).then(() => {
    return this.replaceDontSelect();
  }).then(() => {
    return this.replaceInQuery();
  }).then(() => {
    return this.replaceNotInQuery();
  }).then(() => {
    return this.replaceEquality();
  });
}; // Uses the Auth object to get the list of roles, adds the user id


RestQuery.prototype.getUserAndRoleACL = function () {
  if (this.auth.isMaster) {
    return Promise.resolve();
  }

  this.findOptions.acl = ['*'];

  if (this.auth.user) {
    return this.auth.getUserRoles().then(roles => {
      this.findOptions.acl = this.findOptions.acl.concat(roles, [this.auth.user.id]);
      return;
    });
  } else {
    return Promise.resolve();
  }
}; // Changes the className if redirectClassNameForKey is set.
// Returns a promise.


RestQuery.prototype.redirectClassNameForKey = function () {
  if (!this.redirectKey) {
    return Promise.resolve();
  } // We need to change the class name based on the schema


  return this.config.database.redirectClassNameForKey(this.className, this.redirectKey).then(newClassName => {
    this.className = newClassName;
    this.redirectClassName = newClassName;
  });
}; // Validates this operation against the allowClientClassCreation config.


RestQuery.prototype.validateClientClassCreation = function () {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(schemaController => schemaController.hasClass(this.className)).then(hasClass => {
      if (hasClass !== true) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + this.className);
      }
    });
  } else {
    return Promise.resolve();
  }
};

function transformInQuery(inQueryObject, className, results) {
  var values = [];

  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId
    });
  }

  delete inQueryObject['$inQuery'];

  if (Array.isArray(inQueryObject['$in'])) {
    inQueryObject['$in'] = inQueryObject['$in'].concat(values);
  } else {
    inQueryObject['$in'] = values;
  }
} // Replaces a $inQuery clause by running the subquery, if there is an
// $inQuery clause.
// The $inQuery clause turns into an $in with values that are just
// pointers to the objects returned in the subquery.


RestQuery.prototype.replaceInQuery = function () {
  var inQueryObject = findObjectWithKey(this.restWhere, '$inQuery');

  if (!inQueryObject) {
    return;
  } // The inQuery value must have precisely two keys - where and className


  var inQueryValue = inQueryObject['$inQuery'];

  if (!inQueryValue.where || !inQueryValue.className) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $inQuery');
  }

  const additionalOptions = {
    redirectClassNameForKey: inQueryValue.redirectClassNameForKey
  };

  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }

  var subquery = new RestQuery(this.config, this.auth, inQueryValue.className, inQueryValue.where, additionalOptions);
  return subquery.execute().then(response => {
    transformInQuery(inQueryObject, subquery.className, response.results); // Recurse to repeat

    return this.replaceInQuery();
  });
};

function transformNotInQuery(notInQueryObject, className, results) {
  var values = [];

  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId
    });
  }

  delete notInQueryObject['$notInQuery'];

  if (Array.isArray(notInQueryObject['$nin'])) {
    notInQueryObject['$nin'] = notInQueryObject['$nin'].concat(values);
  } else {
    notInQueryObject['$nin'] = values;
  }
} // Replaces a $notInQuery clause by running the subquery, if there is an
// $notInQuery clause.
// The $notInQuery clause turns into a $nin with values that are just
// pointers to the objects returned in the subquery.


RestQuery.prototype.replaceNotInQuery = function () {
  var notInQueryObject = findObjectWithKey(this.restWhere, '$notInQuery');

  if (!notInQueryObject) {
    return;
  } // The notInQuery value must have precisely two keys - where and className


  var notInQueryValue = notInQueryObject['$notInQuery'];

  if (!notInQueryValue.where || !notInQueryValue.className) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $notInQuery');
  }

  const additionalOptions = {
    redirectClassNameForKey: notInQueryValue.redirectClassNameForKey
  };

  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }

  var subquery = new RestQuery(this.config, this.auth, notInQueryValue.className, notInQueryValue.where, additionalOptions);
  return subquery.execute().then(response => {
    transformNotInQuery(notInQueryObject, subquery.className, response.results); // Recurse to repeat

    return this.replaceNotInQuery();
  });
}; // Used to get the deepest object from json using dot notation.


const getDeepestObjectFromKey = (json, key, idx, src) => {
  if (key in json) {
    return json[key];
  }

  src.splice(1); // Exit Early
};

const transformSelect = (selectObject, key, objects) => {
  var values = [];

  for (var result of objects) {
    values.push(key.split('.').reduce(getDeepestObjectFromKey, result));
  }

  delete selectObject['$select'];

  if (Array.isArray(selectObject['$in'])) {
    selectObject['$in'] = selectObject['$in'].concat(values);
  } else {
    selectObject['$in'] = values;
  }
}; // Replaces a $select clause by running the subquery, if there is a
// $select clause.
// The $select clause turns into an $in with values selected out of
// the subquery.
// Returns a possible-promise.


RestQuery.prototype.replaceSelect = function () {
  var selectObject = findObjectWithKey(this.restWhere, '$select');

  if (!selectObject) {
    return;
  } // The select value must have precisely two keys - query and key


  var selectValue = selectObject['$select']; // iOS SDK don't send where if not set, let it pass

  if (!selectValue.query || !selectValue.key || typeof selectValue.query !== 'object' || !selectValue.query.className || Object.keys(selectValue).length !== 2) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $select');
  }

  const additionalOptions = {
    redirectClassNameForKey: selectValue.query.redirectClassNameForKey
  };

  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }

  var subquery = new RestQuery(this.config, this.auth, selectValue.query.className, selectValue.query.where, additionalOptions);
  return subquery.execute().then(response => {
    transformSelect(selectObject, selectValue.key, response.results); // Keep replacing $select clauses

    return this.replaceSelect();
  });
};

const transformDontSelect = (dontSelectObject, key, objects) => {
  var values = [];

  for (var result of objects) {
    values.push(key.split('.').reduce(getDeepestObjectFromKey, result));
  }

  delete dontSelectObject['$dontSelect'];

  if (Array.isArray(dontSelectObject['$nin'])) {
    dontSelectObject['$nin'] = dontSelectObject['$nin'].concat(values);
  } else {
    dontSelectObject['$nin'] = values;
  }
}; // Replaces a $dontSelect clause by running the subquery, if there is a
// $dontSelect clause.
// The $dontSelect clause turns into an $nin with values selected out of
// the subquery.
// Returns a possible-promise.


RestQuery.prototype.replaceDontSelect = function () {
  var dontSelectObject = findObjectWithKey(this.restWhere, '$dontSelect');

  if (!dontSelectObject) {
    return;
  } // The dontSelect value must have precisely two keys - query and key


  var dontSelectValue = dontSelectObject['$dontSelect'];

  if (!dontSelectValue.query || !dontSelectValue.key || typeof dontSelectValue.query !== 'object' || !dontSelectValue.query.className || Object.keys(dontSelectValue).length !== 2) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $dontSelect');
  }

  const additionalOptions = {
    redirectClassNameForKey: dontSelectValue.query.redirectClassNameForKey
  };

  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }

  var subquery = new RestQuery(this.config, this.auth, dontSelectValue.query.className, dontSelectValue.query.where, additionalOptions);
  return subquery.execute().then(response => {
    transformDontSelect(dontSelectObject, dontSelectValue.key, response.results); // Keep replacing $dontSelect clauses

    return this.replaceDontSelect();
  });
};

const cleanResultAuthData = function (result) {
  delete result.password;

  if (result.authData) {
    Object.keys(result.authData).forEach(provider => {
      if (result.authData[provider] === null) {
        delete result.authData[provider];
      }
    });

    if (Object.keys(result.authData).length == 0) {
      delete result.authData;
    }
  }
};

const replaceEqualityConstraint = constraint => {
  if (typeof constraint !== 'object') {
    return constraint;
  }

  const equalToObject = {};
  let hasDirectConstraint = false;
  let hasOperatorConstraint = false;

  for (const key in constraint) {
    if (key.indexOf('$') !== 0) {
      hasDirectConstraint = true;
      equalToObject[key] = constraint[key];
    } else {
      hasOperatorConstraint = true;
    }
  }

  if (hasDirectConstraint && hasOperatorConstraint) {
    constraint['$eq'] = equalToObject;
    Object.keys(equalToObject).forEach(key => {
      delete constraint[key];
    });
  }

  return constraint;
};

RestQuery.prototype.replaceEquality = function () {
  if (typeof this.restWhere !== 'object') {
    return;
  }

  for (const key in this.restWhere) {
    this.restWhere[key] = replaceEqualityConstraint(this.restWhere[key]);
  }
}; // Returns a promise for whether it was successful.
// Populates this.response with an object that only has 'results'.


RestQuery.prototype.runFind = function (options = {}) {
  if (this.findOptions.limit === 0) {
    this.response = {
      results: []
    };
    return Promise.resolve();
  }

  const findOptions = Object.assign({}, this.findOptions);

  if (this.keys) {
    findOptions.keys = this.keys.map(key => {
      return key.split('.')[0];
    });
  }

  if (options.op) {
    findOptions.op = options.op;
  }

  return this.config.database.find(this.className, this.restWhere, findOptions, this.auth).then(results => {
    if (this.className === '_User') {
      for (var result of results) {
        cleanResultAuthData(result);
      }
    }

    this.config.filesController.expandFilesInObject(this.config, results);

    if (this.redirectClassName) {
      for (var r of results) {
        r.className = this.redirectClassName;
      }
    }

    this.response = {
      results: results
    };
  });
}; // Returns a promise for whether it was successful.
// Populates this.response.count with the count


RestQuery.prototype.runCount = function () {
  if (!this.doCount) {
    return;
  }

  this.findOptions.count = true;
  delete this.findOptions.skip;
  delete this.findOptions.limit;
  return this.config.database.find(this.className, this.restWhere, this.findOptions).then(c => {
    this.response.count = c;
  });
}; // Augments this.response with all pointers on an object


RestQuery.prototype.handleIncludeAll = function () {
  if (!this.includeAll) {
    return;
  }

  return this.config.database.loadSchema().then(schemaController => schemaController.getOneSchema(this.className)).then(schema => {
    const includeFields = [];
    const keyFields = [];

    for (const field in schema.fields) {
      if (schema.fields[field].type && schema.fields[field].type === 'Pointer') {
        includeFields.push([field]);
        keyFields.push(field);
      }
    } // Add fields to include, keys, remove dups


    this.include = [...new Set([...this.include, ...includeFields])]; // if this.keys not set, then all keys are already included

    if (this.keys) {
      this.keys = [...new Set([...this.keys, ...keyFields])];
    }
  });
}; // Updates property `this.keys` to contain all keys but the ones unselected.


RestQuery.prototype.handleExcludeKeys = function () {
  if (!this.excludeKeys) {
    return;
  }

  if (this.keys) {
    this.keys = this.keys.filter(k => !this.excludeKeys.includes(k));
    return;
  }

  return this.config.database.loadSchema().then(schemaController => schemaController.getOneSchema(this.className)).then(schema => {
    const fields = Object.keys(schema.fields);
    this.keys = fields.filter(k => !this.excludeKeys.includes(k));
  });
}; // Augments this.response with data at the paths provided in this.include.


RestQuery.prototype.handleInclude = function () {
  if (this.include.length == 0) {
    return;
  }

  var pathResponse = includePath(this.config, this.auth, this.response, this.include[0], this.restOptions);

  if (pathResponse.then) {
    return pathResponse.then(newResponse => {
      this.response = newResponse;
      this.include = this.include.slice(1);
      return this.handleInclude();
    });
  } else if (this.include.length > 0) {
    this.include = this.include.slice(1);
    return this.handleInclude();
  }

  return pathResponse;
}; //Returns a promise of a processed set of results


RestQuery.prototype.runAfterFindTrigger = function () {
  if (!this.response) {
    return;
  }

  if (!this.runAfterFind) {
    return;
  } // Avoid doing any setup for triggers if there is no 'afterFind' trigger for this class.


  const hasAfterFindHook = triggers.triggerExists(this.className, triggers.Types.afterFind, this.config.applicationId);

  if (!hasAfterFindHook) {
    return Promise.resolve();
  } // Skip Aggregate and Distinct Queries


  if (this.findOptions.pipeline || this.findOptions.distinct) {
    return Promise.resolve();
  } // Run afterFind trigger and set the new results


  return triggers.maybeRunAfterFindTrigger(triggers.Types.afterFind, this.auth, this.className, this.response.results, this.config).then(results => {
    // Ensure we properly set the className back
    if (this.redirectClassName) {
      this.response.results = results.map(object => {
        if (object instanceof Parse.Object) {
          object = object.toJSON();
        }

        object.className = this.redirectClassName;
        return object;
      });
    } else {
      this.response.results = results;
    }
  });
}; // Adds included values to the response.
// Path is a list of field names.
// Returns a promise for an augmented response.


function includePath(config, auth, response, path, restOptions = {}) {
  var pointers = findPointers(response.results, path);

  if (pointers.length == 0) {
    return response;
  }

  const pointersHash = {};

  for (var pointer of pointers) {
    if (!pointer) {
      continue;
    }

    const className = pointer.className; // only include the good pointers

    if (className) {
      pointersHash[className] = pointersHash[className] || new Set();
      pointersHash[className].add(pointer.objectId);
    }
  }

  const includeRestOptions = {};

  if (restOptions.keys) {
    const keys = new Set(restOptions.keys.split(','));
    const keySet = Array.from(keys).reduce((set, key) => {
      const keyPath = key.split('.');
      let i = 0;

      for (i; i < path.length; i++) {
        if (path[i] != keyPath[i]) {
          return set;
        }
      }

      if (i < keyPath.length) {
        set.add(keyPath[i]);
      }

      return set;
    }, new Set());

    if (keySet.size > 0) {
      includeRestOptions.keys = Array.from(keySet).join(',');
    }
  }

  if (restOptions.includeReadPreference) {
    includeRestOptions.readPreference = restOptions.includeReadPreference;
    includeRestOptions.includeReadPreference = restOptions.includeReadPreference;
  } else if (restOptions.readPreference) {
    includeRestOptions.readPreference = restOptions.readPreference;
  }

  const queryPromises = Object.keys(pointersHash).map(className => {
    const objectIds = Array.from(pointersHash[className]);
    let where;

    if (objectIds.length === 1) {
      where = {
        objectId: objectIds[0]
      };
    } else {
      where = {
        objectId: {
          $in: objectIds
        }
      };
    }

    var query = new RestQuery(config, auth, className, where, includeRestOptions);
    return query.execute({
      op: 'get'
    }).then(results => {
      results.className = className;
      return Promise.resolve(results);
    });
  }); // Get the objects for all these object ids

  return Promise.all(queryPromises).then(responses => {
    var replace = responses.reduce((replace, includeResponse) => {
      for (var obj of includeResponse.results) {
        obj.__type = 'Object';
        obj.className = includeResponse.className;

        if (obj.className == '_User' && !auth.isMaster) {
          delete obj.sessionToken;
          delete obj.authData;
        }

        replace[obj.objectId] = obj;
      }

      return replace;
    }, {});
    var resp = {
      results: replacePointers(response.results, path, replace)
    };

    if (response.count) {
      resp.count = response.count;
    }

    return resp;
  });
} // Object may be a list of REST-format object to find pointers in, or
// it may be a single object.
// If the path yields things that aren't pointers, this throws an error.
// Path is a list of fields to search into.
// Returns a list of pointers in REST format.


function findPointers(object, path) {
  if (object instanceof Array) {
    var answer = [];

    for (var x of object) {
      answer = answer.concat(findPointers(x, path));
    }

    return answer;
  }

  if (typeof object !== 'object' || !object) {
    return [];
  }

  if (path.length == 0) {
    if (object === null || object.__type == 'Pointer') {
      return [object];
    }

    return [];
  }

  var subobject = object[path[0]];

  if (!subobject) {
    return [];
  }

  return findPointers(subobject, path.slice(1));
} // Object may be a list of REST-format objects to replace pointers
// in, or it may be a single object.
// Path is a list of fields to search into.
// replace is a map from object id -> object.
// Returns something analogous to object, but with the appropriate
// pointers inflated.


function replacePointers(object, path, replace) {
  if (object instanceof Array) {
    return object.map(obj => replacePointers(obj, path, replace)).filter(obj => typeof obj !== 'undefined');
  }

  if (typeof object !== 'object' || !object) {
    return object;
  }

  if (path.length === 0) {
    if (object && object.__type === 'Pointer') {
      return replace[object.objectId];
    }

    return object;
  }

  var subobject = object[path[0]];

  if (!subobject) {
    return object;
  }

  var newsub = replacePointers(subobject, path.slice(1), replace);
  var answer = {};

  for (var key in object) {
    if (key == path[0]) {
      answer[key] = newsub;
    } else {
      answer[key] = object[key];
    }
  }

  return answer;
} // Finds a subobject that has the given key, if there is one.
// Returns undefined otherwise.


function findObjectWithKey(root, key) {
  if (typeof root !== 'object') {
    return;
  }

  if (root instanceof Array) {
    for (var item of root) {
      const answer = findObjectWithKey(item, key);

      if (answer) {
        return answer;
      }
    }
  }

  if (root && root[key]) {
    return root;
  }

  for (var subkey in root) {
    const answer = findObjectWithKey(root[subkey], key);

    if (answer) {
      return answer;
    }
  }
}

module.exports = RestQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0UXVlcnkuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJQYXJzZSIsInRyaWdnZXJzIiwiY29udGludWVXaGlsZSIsIkFsd2F5c1NlbGVjdGVkS2V5cyIsIlJlc3RRdWVyeSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImNsaWVudFNESyIsInJ1bkFmdGVyRmluZCIsInJlc3BvbnNlIiwiZmluZE9wdGlvbnMiLCJpc01hc3RlciIsInVzZXIiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIiRhbmQiLCJfX3R5cGUiLCJvYmplY3RJZCIsImlkIiwiZG9Db3VudCIsImluY2x1ZGVBbGwiLCJpbmNsdWRlIiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwia2V5c0ZvckluY2x1ZGUiLCJrZXlzIiwic3BsaXQiLCJmaWx0ZXIiLCJrZXkiLCJsZW5ndGgiLCJtYXAiLCJzbGljZSIsImxhc3RJbmRleE9mIiwiam9pbiIsIm9wdGlvbiIsImNvbmNhdCIsIkFycmF5IiwiZnJvbSIsIlNldCIsImV4Y2x1ZGUiLCJleGNsdWRlS2V5cyIsImsiLCJpbmRleE9mIiwiZmllbGRzIiwib3JkZXIiLCJzb3J0IiwicmVkdWNlIiwic29ydE1hcCIsImZpZWxkIiwidHJpbSIsInNjb3JlIiwiJG1ldGEiLCJwYXRocyIsImluY2x1ZGVzIiwicGF0aFNldCIsIm1lbW8iLCJwYXRoIiwiaW5kZXgiLCJwYXJ0cyIsInMiLCJhIiwiYiIsInJlZGlyZWN0S2V5IiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJyZWRpcmVjdENsYXNzTmFtZSIsIklOVkFMSURfSlNPTiIsImV4ZWN1dGUiLCJleGVjdXRlT3B0aW9ucyIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImJ1aWxkUmVzdFdoZXJlIiwiaGFuZGxlSW5jbHVkZUFsbCIsImhhbmRsZUV4Y2x1ZGVLZXlzIiwicnVuRmluZCIsInJ1bkNvdW50IiwiaGFuZGxlSW5jbHVkZSIsInJ1bkFmdGVyRmluZFRyaWdnZXIiLCJlYWNoIiwiY2FsbGJhY2siLCJsaW1pdCIsImZpbmlzaGVkIiwicXVlcnkiLCJyZXN1bHRzIiwiZm9yRWFjaCIsImFzc2lnbiIsIiRndCIsImdldFVzZXJBbmRSb2xlQUNMIiwidmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uIiwicmVwbGFjZVNlbGVjdCIsInJlcGxhY2VEb250U2VsZWN0IiwicmVwbGFjZUluUXVlcnkiLCJyZXBsYWNlTm90SW5RdWVyeSIsInJlcGxhY2VFcXVhbGl0eSIsImFjbCIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwiZGF0YWJhc2UiLCJuZXdDbGFzc05hbWUiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJzeXN0ZW1DbGFzc2VzIiwibG9hZFNjaGVtYSIsInNjaGVtYUNvbnRyb2xsZXIiLCJoYXNDbGFzcyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJ0cmFuc2Zvcm1JblF1ZXJ5IiwiaW5RdWVyeU9iamVjdCIsInZhbHVlcyIsInJlc3VsdCIsInB1c2giLCJpc0FycmF5IiwiZmluZE9iamVjdFdpdGhLZXkiLCJpblF1ZXJ5VmFsdWUiLCJ3aGVyZSIsIklOVkFMSURfUVVFUlkiLCJhZGRpdGlvbmFsT3B0aW9ucyIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJyZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5IiwidHJhbnNmb3JtTm90SW5RdWVyeSIsIm5vdEluUXVlcnlPYmplY3QiLCJub3RJblF1ZXJ5VmFsdWUiLCJnZXREZWVwZXN0T2JqZWN0RnJvbUtleSIsImpzb24iLCJpZHgiLCJzcmMiLCJzcGxpY2UiLCJ0cmFuc2Zvcm1TZWxlY3QiLCJzZWxlY3RPYmplY3QiLCJvYmplY3RzIiwic2VsZWN0VmFsdWUiLCJ0cmFuc2Zvcm1Eb250U2VsZWN0IiwiZG9udFNlbGVjdE9iamVjdCIsImRvbnRTZWxlY3RWYWx1ZSIsImNsZWFuUmVzdWx0QXV0aERhdGEiLCJwYXNzd29yZCIsImF1dGhEYXRhIiwicHJvdmlkZXIiLCJyZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50IiwiY29uc3RyYWludCIsImVxdWFsVG9PYmplY3QiLCJoYXNEaXJlY3RDb25zdHJhaW50IiwiaGFzT3BlcmF0b3JDb25zdHJhaW50Iiwib3B0aW9ucyIsIm9wIiwiZmluZCIsImZpbGVzQ29udHJvbGxlciIsImV4cGFuZEZpbGVzSW5PYmplY3QiLCJyIiwiY291bnQiLCJza2lwIiwiYyIsImdldE9uZVNjaGVtYSIsInNjaGVtYSIsImluY2x1ZGVGaWVsZHMiLCJrZXlGaWVsZHMiLCJ0eXBlIiwicGF0aFJlc3BvbnNlIiwiaW5jbHVkZVBhdGgiLCJuZXdSZXNwb25zZSIsImhhc0FmdGVyRmluZEhvb2siLCJ0cmlnZ2VyRXhpc3RzIiwiVHlwZXMiLCJhZnRlckZpbmQiLCJhcHBsaWNhdGlvbklkIiwicGlwZWxpbmUiLCJkaXN0aW5jdCIsIm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlciIsIm9iamVjdCIsInRvSlNPTiIsInBvaW50ZXJzIiwiZmluZFBvaW50ZXJzIiwicG9pbnRlcnNIYXNoIiwicG9pbnRlciIsImFkZCIsImluY2x1ZGVSZXN0T3B0aW9ucyIsImtleVNldCIsInNldCIsImtleVBhdGgiLCJpIiwic2l6ZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInF1ZXJ5UHJvbWlzZXMiLCJvYmplY3RJZHMiLCIkaW4iLCJhbGwiLCJyZXNwb25zZXMiLCJyZXBsYWNlIiwiaW5jbHVkZVJlc3BvbnNlIiwib2JqIiwic2Vzc2lvblRva2VuIiwicmVzcCIsInJlcGxhY2VQb2ludGVycyIsImFuc3dlciIsIngiLCJzdWJvYmplY3QiLCJuZXdzdWIiLCJyb290IiwiaXRlbSIsInN1YmtleSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQUQsQ0FBOUI7O0FBQ0EsSUFBSUMsS0FB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QUNBLFFBQUlxSyxNQUFKLEVBQVk7QUFDVixhQUFPQSxNQUFQO0FBQ0Q7QUFDRjtBQUNGOztBQUVETyxNQUFNLENBQUNDLE9BQVAsR0FBaUIxTSxTQUFqQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEFuIG9iamVjdCB0aGF0IGVuY2Fwc3VsYXRlcyBldmVyeXRoaW5nIHdlIG5lZWQgdG8gcnVuIGEgJ2ZpbmQnXG4vLyBvcGVyYXRpb24sIGVuY29kZWQgaW4gdGhlIFJFU1QgQVBJIGZvcm1hdC5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmNvbnN0IHRyaWdnZXJzID0gcmVxdWlyZSgnLi90cmlnZ2VycycpO1xuY29uc3QgeyBjb250aW51ZVdoaWxlIH0gPSByZXF1aXJlKCdwYXJzZS9saWIvbm9kZS9wcm9taXNlVXRpbHMnKTtcbmNvbnN0IEFsd2F5c1NlbGVjdGVkS2V5cyA9IFsnb2JqZWN0SWQnLCAnY3JlYXRlZEF0JywgJ3VwZGF0ZWRBdCcsICdBQ0wnXTtcbi8vIHJlc3RPcHRpb25zIGNhbiBpbmNsdWRlOlxuLy8gICBza2lwXG4vLyAgIGxpbWl0XG4vLyAgIG9yZGVyXG4vLyAgIGNvdW50XG4vLyAgIGluY2x1ZGVcbi8vICAga2V5c1xuLy8gICBleGNsdWRlS2V5c1xuLy8gICByZWRpcmVjdENsYXNzTmFtZUZvcktleVxuLy8gICByZWFkUHJlZmVyZW5jZVxuLy8gICBpbmNsdWRlUmVhZFByZWZlcmVuY2Vcbi8vICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZVxuZnVuY3Rpb24gUmVzdFF1ZXJ5KFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgcmVzdFdoZXJlID0ge30sXG4gIHJlc3RPcHRpb25zID0ge30sXG4gIGNsaWVudFNESyxcbiAgcnVuQWZ0ZXJGaW5kID0gdHJ1ZVxuKSB7XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmF1dGggPSBhdXRoO1xuICB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgdGhpcy5yZXN0V2hlcmUgPSByZXN0V2hlcmU7XG4gIHRoaXMucmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucztcbiAgdGhpcy5jbGllbnRTREsgPSBjbGllbnRTREs7XG4gIHRoaXMucnVuQWZ0ZXJGaW5kID0gcnVuQWZ0ZXJGaW5kO1xuICB0aGlzLnJlc3BvbnNlID0gbnVsbDtcbiAgdGhpcy5maW5kT3B0aW9ucyA9IHt9O1xuXG4gIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09ICdfU2Vzc2lvbicpIHtcbiAgICAgIGlmICghdGhpcy5hdXRoLnVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTixcbiAgICAgICAgICAnSW52YWxpZCBzZXNzaW9uIHRva2VuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgdGhpcy5yZXN0V2hlcmUgPSB7XG4gICAgICAgICRhbmQ6IFtcbiAgICAgICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgdGhpcy5kb0NvdW50ID0gZmFsc2U7XG4gIHRoaXMuaW5jbHVkZUFsbCA9IGZhbHNlO1xuXG4gIC8vIFRoZSBmb3JtYXQgZm9yIHRoaXMuaW5jbHVkZSBpcyBub3QgdGhlIHNhbWUgYXMgdGhlIGZvcm1hdCBmb3IgdGhlXG4gIC8vIGluY2x1ZGUgb3B0aW9uIC0gaXQncyB0aGUgcGF0aHMgd2Ugc2hvdWxkIGluY2x1ZGUsIGluIG9yZGVyLFxuICAvLyBzdG9yZWQgYXMgYXJyYXlzLCB0YWtpbmcgaW50byBhY2NvdW50IHRoYXQgd2UgbmVlZCB0byBpbmNsdWRlIGZvb1xuICAvLyBiZWZvcmUgaW5jbHVkaW5nIGZvby5iYXIuIEFsc28gaXQgc2hvdWxkIGRlZHVwZS5cbiAgLy8gRm9yIGV4YW1wbGUsIHBhc3NpbmcgYW4gYXJnIG9mIGluY2x1ZGU9Zm9vLmJhcixmb28uYmF6IGNvdWxkIGxlYWQgdG9cbiAgLy8gdGhpcy5pbmNsdWRlID0gW1snZm9vJ10sIFsnZm9vJywgJ2JheiddLCBbJ2ZvbycsICdiYXInXV1cbiAgdGhpcy5pbmNsdWRlID0gW107XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gU2VlIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvMzE4NVxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAna2V5cycpKSB7XG4gICAgY29uc3Qga2V5c0ZvckluY2x1ZGUgPSByZXN0T3B0aW9ucy5rZXlzXG4gICAgICAuc3BsaXQoJywnKVxuICAgICAgLmZpbHRlcihrZXkgPT4ge1xuICAgICAgICAvLyBBdCBsZWFzdCAyIGNvbXBvbmVudHNcbiAgICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpLmxlbmd0aCA+IDE7XG4gICAgICB9KVxuICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAvLyBTbGljZSB0aGUgbGFzdCBjb21wb25lbnQgKGEuYi5jIC0+IGEuYilcbiAgICAgICAgLy8gT3RoZXJ3aXNlIHdlJ2xsIGluY2x1ZGUgb25lIGxldmVsIHRvbyBtdWNoLlxuICAgICAgICByZXR1cm4ga2V5LnNsaWNlKDAsIGtleS5sYXN0SW5kZXhPZignLicpKTtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCcpO1xuXG4gICAgLy8gQ29uY2F0IHRoZSBwb3NzaWJseSBwcmVzZW50IGluY2x1ZGUgc3RyaW5nIHdpdGggdGhlIG9uZSBmcm9tIHRoZSBrZXlzXG4gICAgLy8gRGVkdXAgLyBzb3J0aW5nIGlzIGhhbmRsZSBpbiAnaW5jbHVkZScgY2FzZS5cbiAgICBpZiAoa2V5c0ZvckluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKCFyZXN0T3B0aW9ucy5pbmNsdWRlIHx8IHJlc3RPcHRpb25zLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSArPSAnLCcgKyBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmb3IgKHZhciBvcHRpb24gaW4gcmVzdE9wdGlvbnMpIHtcbiAgICBzd2l0Y2ggKG9wdGlvbikge1xuICAgICAgY2FzZSAna2V5cyc6IHtcbiAgICAgICAgY29uc3Qga2V5cyA9IHJlc3RPcHRpb25zLmtleXMuc3BsaXQoJywnKS5jb25jYXQoQWx3YXlzU2VsZWN0ZWRLZXlzKTtcbiAgICAgICAgdGhpcy5rZXlzID0gQXJyYXkuZnJvbShuZXcgU2V0KGtleXMpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdleGNsdWRlS2V5cyc6IHtcbiAgICAgICAgY29uc3QgZXhjbHVkZSA9IHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzXG4gICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAuZmlsdGVyKGsgPT4gQWx3YXlzU2VsZWN0ZWRLZXlzLmluZGV4T2YoaykgPCAwKTtcbiAgICAgICAgdGhpcy5leGNsdWRlS2V5cyA9IEFycmF5LmZyb20obmV3IFNldChleGNsdWRlKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICB0aGlzLmRvQ291bnQgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGVBbGwnOlxuICAgICAgICB0aGlzLmluY2x1ZGVBbGwgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2V4cGxhaW4nOlxuICAgICAgY2FzZSAnaGludCc6XG4gICAgICBjYXNlICdkaXN0aW5jdCc6XG4gICAgICBjYXNlICdwaXBlbGluZSc6XG4gICAgICBjYXNlICdza2lwJzpcbiAgICAgIGNhc2UgJ2xpbWl0JzpcbiAgICAgIGNhc2UgJ3JlYWRQcmVmZXJlbmNlJzpcbiAgICAgICAgdGhpcy5maW5kT3B0aW9uc1tvcHRpb25dID0gcmVzdE9wdGlvbnNbb3B0aW9uXTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdvcmRlcic6XG4gICAgICAgIHZhciBmaWVsZHMgPSByZXN0T3B0aW9ucy5vcmRlci5zcGxpdCgnLCcpO1xuICAgICAgICB0aGlzLmZpbmRPcHRpb25zLnNvcnQgPSBmaWVsZHMucmVkdWNlKChzb3J0TWFwLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGZpZWxkID0gZmllbGQudHJpbSgpO1xuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJyRzY29yZScpIHtcbiAgICAgICAgICAgIHNvcnRNYXAuc2NvcmUgPSB7ICRtZXRhOiAndGV4dFNjb3JlJyB9O1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmllbGRbMF0gPT0gJy0nKSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkLnNsaWNlKDEpXSA9IC0xO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkXSA9IDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBzb3J0TWFwO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZSc6IHtcbiAgICAgICAgY29uc3QgcGF0aHMgPSByZXN0T3B0aW9ucy5pbmNsdWRlLnNwbGl0KCcsJyk7XG4gICAgICAgIGlmIChwYXRocy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICAvLyBMb2FkIHRoZSBleGlzdGluZyBpbmNsdWRlcyAoZnJvbSBrZXlzKVxuICAgICAgICBjb25zdCBwYXRoU2V0ID0gcGF0aHMucmVkdWNlKChtZW1vLCBwYXRoKSA9PiB7XG4gICAgICAgICAgLy8gU3BsaXQgZWFjaCBwYXRocyBvbiAuIChhLmIuYyAtPiBbYSxiLGNdKVxuICAgICAgICAgIC8vIHJlZHVjZSB0byBjcmVhdGUgYWxsIHBhdGhzXG4gICAgICAgICAgLy8gKFthLGIsY10gLT4ge2E6IHRydWUsICdhLmInOiB0cnVlLCAnYS5iLmMnOiB0cnVlfSlcbiAgICAgICAgICByZXR1cm4gcGF0aC5zcGxpdCgnLicpLnJlZHVjZSgobWVtbywgcGF0aCwgaW5kZXgsIHBhcnRzKSA9PiB7XG4gICAgICAgICAgICBtZW1vW3BhcnRzLnNsaWNlKDAsIGluZGV4ICsgMSkuam9pbignLicpXSA9IHRydWU7XG4gICAgICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgICAgICB9LCBtZW1vKTtcbiAgICAgICAgfSwge30pO1xuXG4gICAgICAgIHRoaXMuaW5jbHVkZSA9IE9iamVjdC5rZXlzKHBhdGhTZXQpXG4gICAgICAgICAgLm1hcChzID0+IHtcbiAgICAgICAgICAgIHJldHVybiBzLnNwbGl0KCcuJyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGg7IC8vIFNvcnQgYnkgbnVtYmVyIG9mIGNvbXBvbmVudHNcbiAgICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdyZWRpcmVjdENsYXNzTmFtZUZvcktleSc6XG4gICAgICAgIHRoaXMucmVkaXJlY3RLZXkgPSByZXN0T3B0aW9ucy5yZWRpcmVjdENsYXNzTmFtZUZvcktleTtcbiAgICAgICAgdGhpcy5yZWRpcmVjdENsYXNzTmFtZSA9IG51bGw7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZVJlYWRQcmVmZXJlbmNlJzpcbiAgICAgIGNhc2UgJ3N1YnF1ZXJ5UmVhZFByZWZlcmVuY2UnOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCBvcHRpb246ICcgKyBvcHRpb25cbiAgICAgICAgKTtcbiAgICB9XG4gIH1cbn1cblxuLy8gQSBjb252ZW5pZW50IG1ldGhvZCB0byBwZXJmb3JtIGFsbCB0aGUgc3RlcHMgb2YgcHJvY2Vzc2luZyBhIHF1ZXJ5XG4vLyBpbiBvcmRlci5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgcmVzcG9uc2UgLSBhbiBvYmplY3Qgd2l0aCBvcHRpb25hbCBrZXlzXG4vLyAncmVzdWx0cycgYW5kICdjb3VudCcuXG4vLyBUT0RPOiBjb25zb2xpZGF0ZSB0aGUgcmVwbGFjZVggZnVuY3Rpb25zXG5SZXN0UXVlcnkucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihleGVjdXRlT3B0aW9ucykge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5idWlsZFJlc3RXaGVyZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZUFsbCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRXhjbHVkZUtleXMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkZpbmQoZXhlY3V0ZU9wdGlvbnMpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQ291bnQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkFmdGVyRmluZFRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlc3BvbnNlO1xuICAgIH0pO1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5lYWNoID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgY29uc3QgeyBjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgcmVzdFdoZXJlLCByZXN0T3B0aW9ucywgY2xpZW50U0RLIH0gPSB0aGlzO1xuICAvLyBpZiB0aGUgbGltaXQgaXMgc2V0LCB1c2UgaXRcbiAgcmVzdE9wdGlvbnMubGltaXQgPSByZXN0T3B0aW9ucy5saW1pdCB8fCAxMDA7XG4gIHJlc3RPcHRpb25zLm9yZGVyID0gJ29iamVjdElkJztcbiAgbGV0IGZpbmlzaGVkID0gZmFsc2U7XG5cbiAgcmV0dXJuIGNvbnRpbnVlV2hpbGUoXG4gICAgKCkgPT4ge1xuICAgICAgcmV0dXJuICFmaW5pc2hlZDtcbiAgICB9LFxuICAgIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgIGNsaWVudFNES1xuICAgICAgKTtcbiAgICAgIGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcXVlcnkuZXhlY3V0ZSgpO1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKGNhbGxiYWNrKTtcbiAgICAgIGZpbmlzaGVkID0gcmVzdWx0cy5sZW5ndGggPCByZXN0T3B0aW9ucy5saW1pdDtcbiAgICAgIGlmICghZmluaXNoZWQpIHtcbiAgICAgICAgcmVzdFdoZXJlLm9iamVjdElkID0gT2JqZWN0LmFzc2lnbih7fSwgcmVzdFdoZXJlLm9iamVjdElkLCB7XG4gICAgICAgICAgJGd0OiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV0ub2JqZWN0SWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbn07XG5cblJlc3RRdWVyeS5wcm90b3R5cGUuYnVpbGRSZXN0V2hlcmUgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VEb250U2VsZWN0KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZU5vdEluUXVlcnkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VFcXVhbGl0eSgpO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5SZXN0UXVlcnkucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLmZpbmRPcHRpb25zLmFjbCA9IFsnKiddO1xuXG4gIGlmICh0aGlzLmF1dGgudXNlcikge1xuICAgIHJldHVybiB0aGlzLmF1dGguZ2V0VXNlclJvbGVzKCkudGhlbihyb2xlcyA9PiB7XG4gICAgICB0aGlzLmZpbmRPcHRpb25zLmFjbCA9IHRoaXMuZmluZE9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW1xuICAgICAgICB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gQ2hhbmdlcyB0aGUgY2xhc3NOYW1lIGlmIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IGlzIHNldC5cbi8vIFJldHVybnMgYSBwcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIXRoaXMucmVkaXJlY3RLZXkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXZSBuZWVkIHRvIGNoYW5nZSB0aGUgY2xhc3MgbmFtZSBiYXNlZCBvbiB0aGUgc2NoZW1hXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5yZWRpcmVjdENsYXNzTmFtZUZvcktleSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5yZWRpcmVjdEtleSlcbiAgICAudGhlbihuZXdDbGFzc05hbWUgPT4ge1xuICAgICAgdGhpcy5jbGFzc05hbWUgPSBuZXdDbGFzc05hbWU7XG4gICAgICB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lID0gbmV3Q2xhc3NOYW1lO1xuICAgIH0pO1xufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5SZXN0UXVlcnkucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICdUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzICcgK1xuICAgICAgICAgICAgICAnbm9uLWV4aXN0ZW50IGNsYXNzOiAnICtcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybUluUXVlcnkoaW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgaW5RdWVyeU9iamVjdFsnJGluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoaW5RdWVyeU9iamVjdFsnJGluJ10pKSB7XG4gICAgaW5RdWVyeU9iamVjdFsnJGluJ10gPSBpblF1ZXJ5T2JqZWN0WyckaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBpblF1ZXJ5T2JqZWN0WyckaW4nXSA9IHZhbHVlcztcbiAgfVxufVxuXG4vLyBSZXBsYWNlcyBhICRpblF1ZXJ5IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYW5cbi8vICRpblF1ZXJ5IGNsYXVzZS5cbi8vIFRoZSAkaW5RdWVyeSBjbGF1c2UgdHVybnMgaW50byBhbiAkaW4gd2l0aCB2YWx1ZXMgdGhhdCBhcmUganVzdFxuLy8gcG9pbnRlcnMgdG8gdGhlIG9iamVjdHMgcmV0dXJuZWQgaW4gdGhlIHN1YnF1ZXJ5LlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlSW5RdWVyeSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgaW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGluUXVlcnknKTtcbiAgaWYgKCFpblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIGluUXVlcnlWYWx1ZSA9IGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmICghaW5RdWVyeVZhbHVlLndoZXJlIHx8ICFpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICdpbXByb3BlciB1c2FnZSBvZiAkaW5RdWVyeSdcbiAgICApO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgdmFyIHN1YnF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmF1dGgsXG4gICAgaW5RdWVyeVZhbHVlLmNsYXNzTmFtZSxcbiAgICBpblF1ZXJ5VmFsdWUud2hlcmUsXG4gICAgYWRkaXRpb25hbE9wdGlvbnNcbiAgKTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIHN1YnF1ZXJ5LmNsYXNzTmFtZSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gUmVjdXJzZSB0byByZXBlYXRcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICB9KTtcbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkobm90SW5RdWVyeU9iamVjdFsnJG5pbiddKSkge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkbm90SW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkbm90SW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJG5vdEluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYSAkbmluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZU5vdEluUXVlcnkgPSBmdW5jdGlvbigpIHtcbiAgdmFyIG5vdEluUXVlcnlPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRub3RJblF1ZXJ5Jyk7XG4gIGlmICghbm90SW5RdWVyeU9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBub3RJblF1ZXJ5IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSB3aGVyZSBhbmQgY2xhc3NOYW1lXG4gIHZhciBub3RJblF1ZXJ5VmFsdWUgPSBub3RJblF1ZXJ5T2JqZWN0Wyckbm90SW5RdWVyeSddO1xuICBpZiAoIW5vdEluUXVlcnlWYWx1ZS53aGVyZSB8fCAhbm90SW5RdWVyeVZhbHVlLmNsYXNzTmFtZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAnaW1wcm9wZXIgdXNhZ2Ugb2YgJG5vdEluUXVlcnknXG4gICAgKTtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBub3RJblF1ZXJ5VmFsdWUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHZhciBzdWJxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIG5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUsXG4gICAgbm90SW5RdWVyeVZhbHVlLndoZXJlLFxuICAgIGFkZGl0aW9uYWxPcHRpb25zXG4gICk7XG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtTm90SW5RdWVyeShub3RJblF1ZXJ5T2JqZWN0LCBzdWJxdWVyeS5jbGFzc05hbWUsIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIFJlY3Vyc2UgdG8gcmVwZWF0XG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZU5vdEluUXVlcnkoKTtcbiAgfSk7XG59O1xuXG4vLyBVc2VkIHRvIGdldCB0aGUgZGVlcGVzdCBvYmplY3QgZnJvbSBqc29uIHVzaW5nIGRvdCBub3RhdGlvbi5cbmNvbnN0IGdldERlZXBlc3RPYmplY3RGcm9tS2V5ID0gKGpzb24sIGtleSwgaWR4LCBzcmMpID0+IHtcbiAgaWYgKGtleSBpbiBqc29uKSB7XG4gICAgcmV0dXJuIGpzb25ba2V5XTtcbiAgfVxuICBzcmMuc3BsaWNlKDEpOyAvLyBFeGl0IEVhcmx5XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1TZWxlY3QgPSAoc2VsZWN0T2JqZWN0LCBrZXksIG9iamVjdHMpID0+IHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2Ygb2JqZWN0cykge1xuICAgIHZhbHVlcy5wdXNoKGtleS5zcGxpdCgnLicpLnJlZHVjZShnZXREZWVwZXN0T2JqZWN0RnJvbUtleSwgcmVzdWx0KSk7XG4gIH1cbiAgZGVsZXRlIHNlbGVjdE9iamVjdFsnJHNlbGVjdCddO1xuICBpZiAoQXJyYXkuaXNBcnJheShzZWxlY3RPYmplY3RbJyRpbiddKSkge1xuICAgIHNlbGVjdE9iamVjdFsnJGluJ10gPSBzZWxlY3RPYmplY3RbJyRpbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIHNlbGVjdE9iamVjdFsnJGluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJHNlbGVjdCBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFcbi8vICRzZWxlY3QgY2xhdXNlLlxuLy8gVGhlICRzZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHNlbGVjdGVkIG91dCBvZlxuLy8gdGhlIHN1YnF1ZXJ5LlxuLy8gUmV0dXJucyBhIHBvc3NpYmxlLXByb21pc2UuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VTZWxlY3QgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHNlbGVjdE9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJHNlbGVjdCcpO1xuICBpZiAoIXNlbGVjdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBzZWxlY3QgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHF1ZXJ5IGFuZCBrZXlcbiAgdmFyIHNlbGVjdFZhbHVlID0gc2VsZWN0T2JqZWN0Wyckc2VsZWN0J107XG4gIC8vIGlPUyBTREsgZG9uJ3Qgc2VuZCB3aGVyZSBpZiBub3Qgc2V0LCBsZXQgaXQgcGFzc1xuICBpZiAoXG4gICAgIXNlbGVjdFZhbHVlLnF1ZXJ5IHx8XG4gICAgIXNlbGVjdFZhbHVlLmtleSB8fFxuICAgIHR5cGVvZiBzZWxlY3RWYWx1ZS5xdWVyeSAhPT0gJ29iamVjdCcgfHxcbiAgICAhc2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lIHx8XG4gICAgT2JqZWN0LmtleXMoc2VsZWN0VmFsdWUpLmxlbmd0aCAhPT0gMlxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgJ2ltcHJvcGVyIHVzYWdlIG9mICRzZWxlY3QnXG4gICAgKTtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBzZWxlY3RWYWx1ZS5xdWVyeS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgdmFyIHN1YnF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmF1dGgsXG4gICAgc2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIHNlbGVjdFZhbHVlLnF1ZXJ5LndoZXJlLFxuICAgIGFkZGl0aW9uYWxPcHRpb25zXG4gICk7XG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtU2VsZWN0KHNlbGVjdE9iamVjdCwgc2VsZWN0VmFsdWUua2V5LCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBLZWVwIHJlcGxhY2luZyAkc2VsZWN0IGNsYXVzZXNcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlU2VsZWN0KCk7XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG9udFNlbGVjdCA9IChkb250U2VsZWN0T2JqZWN0LCBrZXksIG9iamVjdHMpID0+IHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2Ygb2JqZWN0cykge1xuICAgIHZhbHVlcy5wdXNoKGtleS5zcGxpdCgnLicpLnJlZHVjZShnZXREZWVwZXN0T2JqZWN0RnJvbUtleSwgcmVzdWx0KSk7XG4gIH1cbiAgZGVsZXRlIGRvbnRTZWxlY3RPYmplY3RbJyRkb250U2VsZWN0J107XG4gIGlmIChBcnJheS5pc0FycmF5KGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSkpIHtcbiAgICBkb250U2VsZWN0T2JqZWN0WyckbmluJ10gPSBkb250U2VsZWN0T2JqZWN0WyckbmluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgZG9udFNlbGVjdE9iamVjdFsnJG5pbiddID0gdmFsdWVzO1xuICB9XG59O1xuXG4vLyBSZXBsYWNlcyBhICRkb250U2VsZWN0IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYVxuLy8gJGRvbnRTZWxlY3QgY2xhdXNlLlxuLy8gVGhlICRkb250U2VsZWN0IGNsYXVzZSB0dXJucyBpbnRvIGFuICRuaW4gd2l0aCB2YWx1ZXMgc2VsZWN0ZWQgb3V0IG9mXG4vLyB0aGUgc3VicXVlcnkuXG4vLyBSZXR1cm5zIGEgcG9zc2libGUtcHJvbWlzZS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZURvbnRTZWxlY3QgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGRvbnRTZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRkb250U2VsZWN0Jyk7XG4gIGlmICghZG9udFNlbGVjdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBkb250U2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBkb250U2VsZWN0VmFsdWUgPSBkb250U2VsZWN0T2JqZWN0WyckZG9udFNlbGVjdCddO1xuICBpZiAoXG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFkb250U2VsZWN0VmFsdWUua2V5IHx8XG4gICAgdHlwZW9mIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeSAhPT0gJ29iamVjdCcgfHxcbiAgICAhZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKGRvbnRTZWxlY3RWYWx1ZSkubGVuZ3RoICE9PSAyXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAnaW1wcm9wZXIgdXNhZ2Ugb2YgJGRvbnRTZWxlY3QnXG4gICAgKTtcbiAgfVxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBkb250U2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybURvbnRTZWxlY3QoXG4gICAgICBkb250U2VsZWN0T2JqZWN0LFxuICAgICAgZG9udFNlbGVjdFZhbHVlLmtleSxcbiAgICAgIHJlc3BvbnNlLnJlc3VsdHNcbiAgICApO1xuICAgIC8vIEtlZXAgcmVwbGFjaW5nICRkb250U2VsZWN0IGNsYXVzZXNcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlRG9udFNlbGVjdCgpO1xuICB9KTtcbn07XG5cbmNvbnN0IGNsZWFuUmVzdWx0QXV0aERhdGEgPSBmdW5jdGlvbihyZXN1bHQpIHtcbiAgZGVsZXRlIHJlc3VsdC5wYXNzd29yZDtcbiAgaWYgKHJlc3VsdC5hdXRoRGF0YSkge1xuICAgIE9iamVjdC5rZXlzKHJlc3VsdC5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICBpZiAocmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgcmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChPYmplY3Qua2V5cyhyZXN1bHQuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICBkZWxldGUgcmVzdWx0LmF1dGhEYXRhO1xuICAgIH1cbiAgfVxufTtcblxuY29uc3QgcmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCA9IGNvbnN0cmFpbnQgPT4ge1xuICBpZiAodHlwZW9mIGNvbnN0cmFpbnQgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIGNvbnN0cmFpbnQ7XG4gIH1cbiAgY29uc3QgZXF1YWxUb09iamVjdCA9IHt9O1xuICBsZXQgaGFzRGlyZWN0Q29uc3RyYWludCA9IGZhbHNlO1xuICBsZXQgaGFzT3BlcmF0b3JDb25zdHJhaW50ID0gZmFsc2U7XG4gIGZvciAoY29uc3Qga2V5IGluIGNvbnN0cmFpbnQpIHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJyQnKSAhPT0gMCkge1xuICAgICAgaGFzRGlyZWN0Q29uc3RyYWludCA9IHRydWU7XG4gICAgICBlcXVhbFRvT2JqZWN0W2tleV0gPSBjb25zdHJhaW50W2tleV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGhhc09wZXJhdG9yQ29uc3RyYWludCA9IHRydWU7XG4gICAgfVxuICB9XG4gIGlmIChoYXNEaXJlY3RDb25zdHJhaW50ICYmIGhhc09wZXJhdG9yQ29uc3RyYWludCkge1xuICAgIGNvbnN0cmFpbnRbJyRlcSddID0gZXF1YWxUb09iamVjdDtcbiAgICBPYmplY3Qua2V5cyhlcXVhbFRvT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBkZWxldGUgY29uc3RyYWludFtrZXldO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiBjb25zdHJhaW50O1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlRXF1YWxpdHkgPSBmdW5jdGlvbigpIHtcbiAgaWYgKHR5cGVvZiB0aGlzLnJlc3RXaGVyZSAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gdGhpcy5yZXN0V2hlcmUpIHtcbiAgICB0aGlzLnJlc3RXaGVyZVtrZXldID0gcmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCh0aGlzLnJlc3RXaGVyZVtrZXldKTtcbiAgfVxufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZXRoZXIgaXQgd2FzIHN1Y2Nlc3NmdWwuXG4vLyBQb3B1bGF0ZXMgdGhpcy5yZXNwb25zZSB3aXRoIGFuIG9iamVjdCB0aGF0IG9ubHkgaGFzICdyZXN1bHRzJy5cblJlc3RRdWVyeS5wcm90b3R5cGUucnVuRmluZCA9IGZ1bmN0aW9uKG9wdGlvbnMgPSB7fSkge1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5saW1pdCA9PT0gMCkge1xuICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3VsdHM6IFtdIH07XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIGNvbnN0IGZpbmRPcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5maW5kT3B0aW9ucyk7XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICBmaW5kT3B0aW9ucy5rZXlzID0gdGhpcy5rZXlzLm1hcChrZXkgPT4ge1xuICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpWzBdO1xuICAgIH0pO1xuICB9XG4gIGlmIChvcHRpb25zLm9wKSB7XG4gICAgZmluZE9wdGlvbnMub3AgPSBvcHRpb25zLm9wO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgZmluZE9wdGlvbnMsIHRoaXMuYXV0aClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgICAgICAgIGNsZWFuUmVzdWx0QXV0aERhdGEocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgcmVzdWx0cyk7XG5cbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIGZvciAodmFyIHIgb2YgcmVzdWx0cykge1xuICAgICAgICAgIHIuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5yZXNwb25zZSA9IHsgcmVzdWx0czogcmVzdWx0cyB9O1xuICAgIH0pO1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZXRoZXIgaXQgd2FzIHN1Y2Nlc3NmdWwuXG4vLyBQb3B1bGF0ZXMgdGhpcy5yZXNwb25zZS5jb3VudCB3aXRoIHRoZSBjb3VudFxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5Db3VudCA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIXRoaXMuZG9Db3VudCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmZpbmRPcHRpb25zLmNvdW50ID0gdHJ1ZTtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMuc2tpcDtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMubGltaXQ7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgdGhpcy5maW5kT3B0aW9ucylcbiAgICAudGhlbihjID0+IHtcbiAgICAgIHRoaXMucmVzcG9uc2UuY291bnQgPSBjO1xuICAgIH0pO1xufTtcblxuLy8gQXVnbWVudHMgdGhpcy5yZXNwb25zZSB3aXRoIGFsbCBwb2ludGVycyBvbiBhbiBvYmplY3RcblJlc3RRdWVyeS5wcm90b3R5cGUuaGFuZGxlSW5jbHVkZUFsbCA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIXRoaXMuaW5jbHVkZUFsbCkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGluY2x1ZGVGaWVsZHMgPSBbXTtcbiAgICAgIGNvbnN0IGtleUZpZWxkcyA9IFtdO1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzY2hlbWEuZmllbGRzKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmXG4gICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInXG4gICAgICAgICkge1xuICAgICAgICAgIGluY2x1ZGVGaWVsZHMucHVzaChbZmllbGRdKTtcbiAgICAgICAgICBrZXlGaWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIEFkZCBmaWVsZHMgdG8gaW5jbHVkZSwga2V5cywgcmVtb3ZlIGR1cHNcbiAgICAgIHRoaXMuaW5jbHVkZSA9IFsuLi5uZXcgU2V0KFsuLi50aGlzLmluY2x1ZGUsIC4uLmluY2x1ZGVGaWVsZHNdKV07XG4gICAgICAvLyBpZiB0aGlzLmtleXMgbm90IHNldCwgdGhlbiBhbGwga2V5cyBhcmUgYWxyZWFkeSBpbmNsdWRlZFxuICAgICAgaWYgKHRoaXMua2V5cykge1xuICAgICAgICB0aGlzLmtleXMgPSBbLi4ubmV3IFNldChbLi4udGhpcy5rZXlzLCAuLi5rZXlGaWVsZHNdKV07XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG4vLyBVcGRhdGVzIHByb3BlcnR5IGB0aGlzLmtleXNgIHRvIGNvbnRhaW4gYWxsIGtleXMgYnV0IHRoZSBvbmVzIHVuc2VsZWN0ZWQuXG5SZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUV4Y2x1ZGVLZXlzID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5leGNsdWRlS2V5cykge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGhpcy5rZXlzKSB7XG4gICAgdGhpcy5rZXlzID0gdGhpcy5rZXlzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmxvYWRTY2hlbWEoKVxuICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEodGhpcy5jbGFzc05hbWUpKVxuICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKTtcbiAgICAgIHRoaXMua2V5cyA9IGZpZWxkcy5maWx0ZXIoayA9PiAhdGhpcy5leGNsdWRlS2V5cy5pbmNsdWRlcyhrKSk7XG4gICAgfSk7XG59O1xuXG4vLyBBdWdtZW50cyB0aGlzLnJlc3BvbnNlIHdpdGggZGF0YSBhdCB0aGUgcGF0aHMgcHJvdmlkZWQgaW4gdGhpcy5pbmNsdWRlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcGF0aFJlc3BvbnNlID0gaW5jbHVkZVBhdGgoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIHRoaXMucmVzcG9uc2UsXG4gICAgdGhpcy5pbmNsdWRlWzBdLFxuICAgIHRoaXMucmVzdE9wdGlvbnNcbiAgKTtcbiAgaWYgKHBhdGhSZXNwb25zZS50aGVuKSB7XG4gICAgcmV0dXJuIHBhdGhSZXNwb25zZS50aGVuKG5ld1Jlc3BvbnNlID0+IHtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSBuZXdSZXNwb25zZTtcbiAgICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KTtcbiAgfSBlbHNlIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gIH1cblxuICByZXR1cm4gcGF0aFJlc3BvbnNlO1xufTtcblxuLy9SZXR1cm5zIGEgcHJvbWlzZSBvZiBhIHByb2Nlc3NlZCBzZXQgb2YgcmVzdWx0c1xuUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5BZnRlckZpbmRUcmlnZ2VyID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIXRoaXMucnVuQWZ0ZXJGaW5kKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2FmdGVyRmluZCcgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgY29uc3QgaGFzQWZ0ZXJGaW5kSG9vayA9IHRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgKTtcbiAgaWYgKCFoYXNBZnRlckZpbmRIb29rKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFNraXAgQWdncmVnYXRlIGFuZCBEaXN0aW5jdCBRdWVyaWVzXG4gIGlmICh0aGlzLmZpbmRPcHRpb25zLnBpcGVsaW5lIHx8IHRoaXMuZmluZE9wdGlvbnMuZGlzdGluY3QpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gUnVuIGFmdGVyRmluZCB0cmlnZ2VyIGFuZCBzZXQgdGhlIG5ldyByZXN1bHRzXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckZpbmQsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyxcbiAgICAgIHRoaXMuY29uZmlnXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gRW5zdXJlIHdlIHByb3Blcmx5IHNldCB0aGUgY2xhc3NOYW1lIGJhY2tcbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICAgICAgb2JqZWN0ID0gb2JqZWN0LnRvSlNPTigpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3QuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHM7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG4vLyBBZGRzIGluY2x1ZGVkIHZhbHVlcyB0byB0aGUgcmVzcG9uc2UuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZCBuYW1lcy5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBhdWdtZW50ZWQgcmVzcG9uc2UuXG5mdW5jdGlvbiBpbmNsdWRlUGF0aChjb25maWcsIGF1dGgsIHJlc3BvbnNlLCBwYXRoLCByZXN0T3B0aW9ucyA9IHt9KSB7XG4gIHZhciBwb2ludGVycyA9IGZpbmRQb2ludGVycyhyZXNwb25zZS5yZXN1bHRzLCBwYXRoKTtcbiAgaWYgKHBvaW50ZXJzLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IHBvaW50ZXJzSGFzaCA9IHt9O1xuICBmb3IgKHZhciBwb2ludGVyIG9mIHBvaW50ZXJzKSB7XG4gICAgaWYgKCFwb2ludGVyKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcG9pbnRlci5jbGFzc05hbWU7XG4gICAgLy8gb25seSBpbmNsdWRlIHRoZSBnb29kIHBvaW50ZXJzXG4gICAgaWYgKGNsYXNzTmFtZSkge1xuICAgICAgcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0gPSBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSB8fCBuZXcgU2V0KCk7XG4gICAgICBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXS5hZGQocG9pbnRlci5vYmplY3RJZCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGluY2x1ZGVSZXN0T3B0aW9ucyA9IHt9O1xuICBpZiAocmVzdE9wdGlvbnMua2V5cykge1xuICAgIGNvbnN0IGtleXMgPSBuZXcgU2V0KHJlc3RPcHRpb25zLmtleXMuc3BsaXQoJywnKSk7XG4gICAgY29uc3Qga2V5U2V0ID0gQXJyYXkuZnJvbShrZXlzKS5yZWR1Y2UoKHNldCwga2V5KSA9PiB7XG4gICAgICBjb25zdCBrZXlQYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICBsZXQgaSA9IDA7XG4gICAgICBmb3IgKGk7IGkgPCBwYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChwYXRoW2ldICE9IGtleVBhdGhbaV0pIHtcbiAgICAgICAgICByZXR1cm4gc2V0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaSA8IGtleVBhdGgubGVuZ3RoKSB7XG4gICAgICAgIHNldC5hZGQoa2V5UGF0aFtpXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2V0O1xuICAgIH0sIG5ldyBTZXQoKSk7XG4gICAgaWYgKGtleVNldC5zaXplID4gMCkge1xuICAgICAgaW5jbHVkZVJlc3RPcHRpb25zLmtleXMgPSBBcnJheS5mcm9tKGtleVNldCkuam9pbignLCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9XG4gICAgICByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAocmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIGNvbnN0IHF1ZXJ5UHJvbWlzZXMgPSBPYmplY3Qua2V5cyhwb2ludGVyc0hhc2gpLm1hcChjbGFzc05hbWUgPT4ge1xuICAgIGNvbnN0IG9iamVjdElkcyA9IEFycmF5LmZyb20ocG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0pO1xuICAgIGxldCB3aGVyZTtcbiAgICBpZiAob2JqZWN0SWRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiBvYmplY3RJZHNbMF0gfTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiB7ICRpbjogb2JqZWN0SWRzIH0gfTtcbiAgICB9XG4gICAgdmFyIHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICAgIGNvbmZpZyxcbiAgICAgIGF1dGgsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICB3aGVyZSxcbiAgICAgIGluY2x1ZGVSZXN0T3B0aW9uc1xuICAgICk7XG4gICAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoeyBvcDogJ2dldCcgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHRzKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gR2V0IHRoZSBvYmplY3RzIGZvciBhbGwgdGhlc2Ugb2JqZWN0IGlkc1xuICByZXR1cm4gUHJvbWlzZS5hbGwocXVlcnlQcm9taXNlcykudGhlbihyZXNwb25zZXMgPT4ge1xuICAgIHZhciByZXBsYWNlID0gcmVzcG9uc2VzLnJlZHVjZSgocmVwbGFjZSwgaW5jbHVkZVJlc3BvbnNlKSA9PiB7XG4gICAgICBmb3IgKHZhciBvYmogb2YgaW5jbHVkZVJlc3BvbnNlLnJlc3VsdHMpIHtcbiAgICAgICAgb2JqLl9fdHlwZSA9ICdPYmplY3QnO1xuICAgICAgICBvYmouY2xhc3NOYW1lID0gaW5jbHVkZVJlc3BvbnNlLmNsYXNzTmFtZTtcblxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSA9PSAnX1VzZXInICYmICFhdXRoLmlzTWFzdGVyKSB7XG4gICAgICAgICAgZGVsZXRlIG9iai5zZXNzaW9uVG9rZW47XG4gICAgICAgICAgZGVsZXRlIG9iai5hdXRoRGF0YTtcbiAgICAgICAgfVxuICAgICAgICByZXBsYWNlW29iai5vYmplY3RJZF0gPSBvYmo7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVwbGFjZTtcbiAgICB9LCB7fSk7XG5cbiAgICB2YXIgcmVzcCA9IHtcbiAgICAgIHJlc3VsdHM6IHJlcGxhY2VQb2ludGVycyhyZXNwb25zZS5yZXN1bHRzLCBwYXRoLCByZXBsYWNlKSxcbiAgICB9O1xuICAgIGlmIChyZXNwb25zZS5jb3VudCkge1xuICAgICAgcmVzcC5jb3VudCA9IHJlc3BvbnNlLmNvdW50O1xuICAgIH1cbiAgICByZXR1cm4gcmVzcDtcbiAgfSk7XG59XG5cbi8vIE9iamVjdCBtYXkgYmUgYSBsaXN0IG9mIFJFU1QtZm9ybWF0IG9iamVjdCB0byBmaW5kIHBvaW50ZXJzIGluLCBvclxuLy8gaXQgbWF5IGJlIGEgc2luZ2xlIG9iamVjdC5cbi8vIElmIHRoZSBwYXRoIHlpZWxkcyB0aGluZ3MgdGhhdCBhcmVuJ3QgcG9pbnRlcnMsIHRoaXMgdGhyb3dzIGFuIGVycm9yLlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGRzIHRvIHNlYXJjaCBpbnRvLlxuLy8gUmV0dXJucyBhIGxpc3Qgb2YgcG9pbnRlcnMgaW4gUkVTVCBmb3JtYXQuXG5mdW5jdGlvbiBmaW5kUG9pbnRlcnMob2JqZWN0LCBwYXRoKSB7XG4gIGlmIChvYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhciBhbnN3ZXIgPSBbXTtcbiAgICBmb3IgKHZhciB4IG9mIG9iamVjdCkge1xuICAgICAgYW5zd2VyID0gYW5zd2VyLmNvbmNhdChmaW5kUG9pbnRlcnMoeCwgcGF0aCkpO1xuICAgIH1cbiAgICByZXR1cm4gYW5zd2VyO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8ICFvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT0gMCkge1xuICAgIGlmIChvYmplY3QgPT09IG51bGwgfHwgb2JqZWN0Ll9fdHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICAgIHJldHVybiBbb2JqZWN0XTtcbiAgICB9XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgcmV0dXJuIGZpbmRQb2ludGVycyhzdWJvYmplY3QsIHBhdGguc2xpY2UoMSkpO1xufVxuXG4vLyBPYmplY3QgbWF5IGJlIGEgbGlzdCBvZiBSRVNULWZvcm1hdCBvYmplY3RzIHRvIHJlcGxhY2UgcG9pbnRlcnNcbi8vIGluLCBvciBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGRzIHRvIHNlYXJjaCBpbnRvLlxuLy8gcmVwbGFjZSBpcyBhIG1hcCBmcm9tIG9iamVjdCBpZCAtPiBvYmplY3QuXG4vLyBSZXR1cm5zIHNvbWV0aGluZyBhbmFsb2dvdXMgdG8gb2JqZWN0LCBidXQgd2l0aCB0aGUgYXBwcm9wcmlhdGVcbi8vIHBvaW50ZXJzIGluZmxhdGVkLlxuZnVuY3Rpb24gcmVwbGFjZVBvaW50ZXJzKG9iamVjdCwgcGF0aCwgcmVwbGFjZSkge1xuICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gb2JqZWN0XG4gICAgICAubWFwKG9iaiA9PiByZXBsYWNlUG9pbnRlcnMob2JqLCBwYXRoLCByZXBsYWNlKSlcbiAgICAgIC5maWx0ZXIob2JqID0+IHR5cGVvZiBvYmogIT09ICd1bmRlZmluZWQnKTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChvYmplY3QgJiYgb2JqZWN0Ll9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gcmVwbGFjZVtvYmplY3Qub2JqZWN0SWRdO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIHZhciBuZXdzdWIgPSByZXBsYWNlUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpLCByZXBsYWNlKTtcbiAgdmFyIGFuc3dlciA9IHt9O1xuICBmb3IgKHZhciBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKGtleSA9PSBwYXRoWzBdKSB7XG4gICAgICBhbnN3ZXJba2V5XSA9IG5ld3N1YjtcbiAgICB9IGVsc2Uge1xuICAgICAgYW5zd2VyW2tleV0gPSBvYmplY3Rba2V5XTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFuc3dlcjtcbn1cblxuLy8gRmluZHMgYSBzdWJvYmplY3QgdGhhdCBoYXMgdGhlIGdpdmVuIGtleSwgaWYgdGhlcmUgaXMgb25lLlxuLy8gUmV0dXJucyB1bmRlZmluZWQgb3RoZXJ3aXNlLlxuZnVuY3Rpb24gZmluZE9iamVjdFdpdGhLZXkocm9vdCwga2V5KSB7XG4gIGlmICh0eXBlb2Ygcm9vdCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHJvb3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIGZvciAodmFyIGl0ZW0gb2Ygcm9vdCkge1xuICAgICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkoaXRlbSwga2V5KTtcbiAgICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKHJvb3QgJiYgcm9vdFtrZXldKSB7XG4gICAgcmV0dXJuIHJvb3Q7XG4gIH1cbiAgZm9yICh2YXIgc3Via2V5IGluIHJvb3QpIHtcbiAgICBjb25zdCBhbnN3ZXIgPSBmaW5kT2JqZWN0V2l0aEtleShyb290W3N1YmtleV0sIGtleSk7XG4gICAgaWYgKGFuc3dlcikge1xuICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSZXN0UXVlcnk7XG4iXX0=