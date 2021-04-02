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

function RestQuery(config, auth, className, restWhere = {}, restOptions = {}, clientSDK, runAfterFind = true, context) {
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.restWhere = restWhere;
  this.restOptions = restOptions;
  this.clientSDK = clientSDK;
  this.runAfterFind = runAfterFind;
  this.response = null;
  this.findOptions = {};
  this.context = context || {};

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
          const keys = restOptions.keys.split(',').filter(key => key.length > 0).concat(AlwaysSelectedKeys);
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
    const query = new RestQuery(config, auth, className, restWhere, restOptions, clientSDK, this.runAfterFind, this.context);
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

RestQuery.prototype.cleanResultAuthData = function (result) {
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
    if (this.className === '_User' && findOptions.explain !== true) {
      for (var result of results) {
        this.cleanResultAuthData(result, this.auth, this.config);
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
      if (schema.fields[field].type && schema.fields[field].type === 'Pointer' || schema.fields[field].type && schema.fields[field].type === 'Array') {
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
  }

  const json = Object.assign({}, this.restOptions);
  json.where = this.restWhere;
  const parseQuery = new Parse.Query(this.className);
  parseQuery.withJSON(json); // Run afterFind trigger and set the new results

  return triggers.maybeRunAfterFindTrigger(triggers.Types.afterFind, this.auth, this.className, this.response.results, this.config, parseQuery, this.context).then(results => {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0UXVlcnkuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJQYXJzZSIsInRyaWdnZXJzIiwiY29udGludWVXaGlsZSIsIkFsd2F5c1NlbGVjdGVkS2V5cyIsIlJlc3RRdWVyeSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImNsaWVudFNESyIsInJ1bkFmdGVyRmluZCIsImNvbnRleHQiLCJyZXNwb25zZSIsImZpbmRPcHRpb25zIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCIkYW5kIiwiX190eXBlIiwib2JqZWN0SWQiLCJpZCIsImRvQ291bnQiLCJpbmNsdWRlQWxsIiwiaW5jbHVkZSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImtleXNGb3JJbmNsdWRlIiwia2V5cyIsInNwbGl0IiwiZmlsdGVyIiwia2V5IiwibGVuZ3RoIiwibWFwIiwic2xpY2UiLCJsYXN0SW5kZXhPZiIsImpvaW4iLCJvcHRpb24iLCJjb25jYXQiLCJBcnJheSIsImZyb20iLCJTZXQiLCJleGNsdWRlIiwiZXhjbHVkZUtleXMiLCJrIiwiaW5kZXhPZiIsImZpZWxkcyIsIm9yZGVyIiwic29ydCIsInJlZHVjZSIsInNvcnRNYXAiLCJmaWVsZCIsInRyaW0iLCJzY29yZSIsIiRtZXRhIiwicGF0aHMiLCJpbmNsdWRlcyIsInBhdGhTZXQiLCJtZW1vIiwicGF0aCIsImluZGV4IiwicGFydHMiLCJzIiwiYSIsImIiLCJyZWRpcmVjdEtleSIsInJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IiwicmVkaXJlY3RDbGFzc05hbWUiLCJJTlZBTElEX0pTT04iLCJleGVjdXRlIiwiZXhlY3V0ZU9wdGlvbnMiLCJQcm9taXNlIiwicmVzb2x2ZSIsInRoZW4iLCJidWlsZFJlc3RXaGVyZSIsImhhbmRsZUluY2x1ZGVBbGwiLCJoYW5kbGVFeGNsdWRlS2V5cyIsInJ1bkZpbmQiLCJydW5Db3VudCIsImhhbmRsZUluY2x1ZGUiLCJydW5BZnRlckZpbmRUcmlnZ2VyIiwiZWFjaCIsImNhbGxiYWNrIiwibGltaXQiLCJmaW5pc2hlZCIsInF1ZXJ5IiwicmVzdWx0cyIsImZvckVhY2giLCJhc3NpZ24iLCIkZ3QiLCJnZXRVc2VyQW5kUm9sZUFDTCIsInZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiIsInJlcGxhY2VTZWxlY3QiLCJyZXBsYWNlRG9udFNlbGVjdCIsInJlcGxhY2VJblF1ZXJ5IiwicmVwbGFjZU5vdEluUXVlcnkiLCJyZXBsYWNlRXF1YWxpdHkiLCJhY2wiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsImRhdGFiYXNlIiwibmV3Q2xhc3NOYW1lIiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImxvYWRTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwiaGFzQ2xhc3MiLCJPUEVSQVRJT05fRk9SQklEREVOIiwidHJhbnNmb3JtSW5RdWVyeSIsImluUXVlcnlPYmplY3QiLCJ2YWx1ZXMiLCJyZXN1bHQiLCJwdXNoIiwiaXNBcnJheSIsImZpbmRPYmplY3RXaXRoS2V5IiwiaW5RdWVyeVZhbHVlIiwid2hlcmUiLCJJTlZBTElEX1FVRVJZIiwiYWRkaXRpb25hbE9wdGlvbnMiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwicmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeSIsInRyYW5zZm9ybU5vdEluUXVlcnkiLCJub3RJblF1ZXJ5T2JqZWN0Iiwibm90SW5RdWVyeVZhbHVlIiwiZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkiLCJqc29uIiwiaWR4Iiwic3JjIiwic3BsaWNlIiwidHJhbnNmb3JtU2VsZWN0Iiwic2VsZWN0T2JqZWN0Iiwib2JqZWN0cyIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImZpbmQiLCJleHBsYWluIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsInIiLCJjb3VudCIsInNraXAiLCJjIiwiZ2V0T25lU2NoZW1hIiwic2NoZW1hIiwiaW5jbHVkZUZpZWxkcyIsImtleUZpZWxkcyIsInR5cGUiLCJwYXRoUmVzcG9uc2UiLCJpbmNsdWRlUGF0aCIsIm5ld1Jlc3BvbnNlIiwiaGFzQWZ0ZXJGaW5kSG9vayIsInRyaWdnZXJFeGlzdHMiLCJUeXBlcyIsImFmdGVyRmluZCIsImFwcGxpY2F0aW9uSWQiLCJwaXBlbGluZSIsImRpc3RpbmN0IiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwiaSIsInNpemUiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJxdWVyeVByb21pc2VzIiwib2JqZWN0SWRzIiwiJGluIiwiYWxsIiwicmVzcG9uc2VzIiwicmVwbGFjZSIsImluY2x1ZGVSZXNwb25zZSIsIm9iaiIsInNlc3Npb25Ub2tlbiIsInJlc3AiLCJyZXBsYWNlUG9pbnRlcnMiLCJhbnN3ZXIiLCJ4Iiwic3Vib2JqZWN0IiwibmV3c3ViIiwicm9vdCIsIml0ZW0iLCJzdWJrZXkiLCJtb2R1bGUiLCJleHBvcnRzIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7QUFFQSxJQUFJQSxnQkFBZ0IsR0FBR0MsT0FBTyxDQUFDLGdDQUFELENBQTlCOztBQUNBLElBQUlDLEtBQUssR0FBR0QsT0FBTyxDQUFDLFlBQUQsQ0FBUCxDQUFzQkMsS0FBbEM7O0FBQ0EsTUFBTUMsUUFBUSxHQUFHRixPQUFPLENBQUMsWUFBRCxDQUF4Qjs7QUFDQSxNQUFNO0FBQUVHLEVBQUFBO0FBQUYsSUFBb0JILE9BQU8sQ0FBQyw2QkFBRCxDQUFqQzs7QUFDQSxNQUFNSSxrQkFBa0IsR0FBRyxDQUFDLFVBQUQsRUFBYSxXQUFiLEVBQTBCLFdBQTFCLEVBQXVDLEtBQXZDLENBQTNCLEMsQ0FDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBQ0EsU0FBU0MsU0FBVCxDQUNFQyxNQURGLEVBRUVDLElBRkYsRUFHRUMsU0FIRixFQUlFQyxTQUFTLEdBQUcsRUFKZCxFQUtFQyxXQUFXLEdBQUcsRUFMaEIsRUFNRUMsU0FORixFQU9FQyxZQUFZLEdBQUcsSUFQakIsRUFRRUMsT0FSRixFQVNFO0FBQ0EsT0FBS1AsTUFBTCxHQUFjQSxNQUFkO0FBQ0EsT0FBS0MsSUFBTCxHQUFZQSxJQUFaO0FBQ0EsT0FBS0MsU0FBTCxHQUFpQkEsU0FBakI7QUFDQSxPQUFLQyxTQUFMLEdBQWlCQSxTQUFqQjtBQUNBLE9BQUtDLFdBQUwsR0FBbUJBLFdBQW5CO0FBQ0EsT0FBS0MsU0FBTCxHQUFpQkEsU0FBakI7QUFDQSxPQUFLQyxZQUFMLEdBQW9CQSxZQUFwQjtBQUNBLE9BQUtFLFFBQUwsR0FBZ0IsSUFBaEI7QUFDQSxPQUFLQyxXQUFMLEdBQW1CLEVBQW5CO0FBQ0EsT0FBS0YsT0FBTCxHQUFlQSxPQUFPLElBQUksRUFBMUI7O0FBRUEsTUFBSSxDQUFDLEtBQUtOLElBQUwsQ0FBVVMsUUFBZixFQUF5QjtBQUN2QixRQUFJLEtBQUtSLFNBQUwsSUFBa0IsVUFBdEIsRUFBa0M7QUFDaEMsVUFBSSxDQUFDLEtBQUtELElBQUwsQ0FBVVUsSUFBZixFQUFxQjtBQUNuQixjQUFNLElBQUloQixLQUFLLENBQUNpQixLQUFWLENBQWdCakIsS0FBSyxDQUFDaUIsS0FBTixDQUFZQyxxQkFBNUIsRUFBbUQsdUJBQW5ELENBQU47QUFDRDs7QUFDRCxXQUFLVixTQUFMLEdBQWlCO0FBQ2ZXLFFBQUFBLElBQUksRUFBRSxDQUNKLEtBQUtYLFNBREQsRUFFSjtBQUNFUSxVQUFBQSxJQUFJLEVBQUU7QUFDSkksWUFBQUEsTUFBTSxFQUFFLFNBREo7QUFFSmIsWUFBQUEsU0FBUyxFQUFFLE9BRlA7QUFHSmMsWUFBQUEsUUFBUSxFQUFFLEtBQUtmLElBQUwsQ0FBVVUsSUFBVixDQUFlTTtBQUhyQjtBQURSLFNBRkk7QUFEUyxPQUFqQjtBQVlEO0FBQ0Y7O0FBRUQsT0FBS0MsT0FBTCxHQUFlLEtBQWY7QUFDQSxPQUFLQyxVQUFMLEdBQWtCLEtBQWxCLENBakNBLENBbUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFDQSxPQUFLQyxPQUFMLEdBQWUsRUFBZixDQXpDQSxDQTJDQTtBQUNBOztBQUNBLE1BQUlDLE1BQU0sQ0FBQ0MsU0FBUCxDQUFpQkMsY0FBakIsQ0FBZ0NDLElBQWhDLENBQXFDcEIsV0FBckMsRUFBa0QsTUFBbEQsQ0FBSixFQUErRDtBQUM3RCxVQUFNcUIsY0FBYyxHQUFHckIsV0FBVyxDQUFDc0IsSUFBWixDQUNwQkMsS0FEb0IsQ0FDZCxHQURjLEVBRXBCQyxNQUZvQixDQUViQyxHQUFHLElBQUk7QUFDYjtBQUNBLGFBQU9BLEdBQUcsQ0FBQ0YsS0FBSixDQUFVLEdBQVYsRUFBZUcsTUFBZixHQUF3QixDQUEvQjtBQUNELEtBTG9CLEVBTXBCQyxHQU5vQixDQU1oQkYsR0FBRyxJQUFJO0FBQ1Y7QUFDQTtBQUNBLGFBQU9BLEdBQUcsQ0FBQ0csS0FBSixDQUFVLENBQVYsRUFBYUgsR0FBRyxDQUFDSSxXQUFKLENBQWdCLEdBQWhCLENBQWIsQ0FBUDtBQUNELEtBVm9CLEVBV3BCQyxJQVhvQixDQVdmLEdBWGUsQ0FBdkIsQ0FENkQsQ0FjN0Q7QUFDQTs7QUFDQSxRQUFJVCxjQUFjLENBQUNLLE1BQWYsR0FBd0IsQ0FBNUIsRUFBK0I7QUFDN0IsVUFBSSxDQUFDMUIsV0FBVyxDQUFDZ0IsT0FBYixJQUF3QmhCLFdBQVcsQ0FBQ2dCLE9BQVosQ0FBb0JVLE1BQXBCLElBQThCLENBQTFELEVBQTZEO0FBQzNEMUIsUUFBQUEsV0FBVyxDQUFDZ0IsT0FBWixHQUFzQkssY0FBdEI7QUFDRCxPQUZELE1BRU87QUFDTHJCLFFBQUFBLFdBQVcsQ0FBQ2dCLE9BQVosSUFBdUIsTUFBTUssY0FBN0I7QUFDRDtBQUNGO0FBQ0Y7O0FBRUQsT0FBSyxJQUFJVSxNQUFULElBQW1CL0IsV0FBbkIsRUFBZ0M7QUFDOUIsWUFBUStCLE1BQVI7QUFDRSxXQUFLLE1BQUw7QUFBYTtBQUNYLGdCQUFNVCxJQUFJLEdBQUd0QixXQUFXLENBQUNzQixJQUFaLENBQ1ZDLEtBRFUsQ0FDSixHQURJLEVBRVZDLE1BRlUsQ0FFSEMsR0FBRyxJQUFJQSxHQUFHLENBQUNDLE1BQUosR0FBYSxDQUZqQixFQUdWTSxNQUhVLENBR0h0QyxrQkFIRyxDQUFiO0FBSUEsZUFBSzRCLElBQUwsR0FBWVcsS0FBSyxDQUFDQyxJQUFOLENBQVcsSUFBSUMsR0FBSixDQUFRYixJQUFSLENBQVgsQ0FBWjtBQUNBO0FBQ0Q7O0FBQ0QsV0FBSyxhQUFMO0FBQW9CO0FBQ2xCLGdCQUFNYyxPQUFPLEdBQUdwQyxXQUFXLENBQUNxQyxXQUFaLENBQ2JkLEtBRGEsQ0FDUCxHQURPLEVBRWJDLE1BRmEsQ0FFTmMsQ0FBQyxJQUFJNUMsa0JBQWtCLENBQUM2QyxPQUFuQixDQUEyQkQsQ0FBM0IsSUFBZ0MsQ0FGL0IsQ0FBaEI7QUFHQSxlQUFLRCxXQUFMLEdBQW1CSixLQUFLLENBQUNDLElBQU4sQ0FBVyxJQUFJQyxHQUFKLENBQVFDLE9BQVIsQ0FBWCxDQUFuQjtBQUNBO0FBQ0Q7O0FBQ0QsV0FBSyxPQUFMO0FBQ0UsYUFBS3RCLE9BQUwsR0FBZSxJQUFmO0FBQ0E7O0FBQ0YsV0FBSyxZQUFMO0FBQ0UsYUFBS0MsVUFBTCxHQUFrQixJQUFsQjtBQUNBOztBQUNGLFdBQUssU0FBTDtBQUNBLFdBQUssTUFBTDtBQUNBLFdBQUssVUFBTDtBQUNBLFdBQUssVUFBTDtBQUNBLFdBQUssTUFBTDtBQUNBLFdBQUssT0FBTDtBQUNBLFdBQUssZ0JBQUw7QUFDRSxhQUFLVixXQUFMLENBQWlCMEIsTUFBakIsSUFBMkIvQixXQUFXLENBQUMrQixNQUFELENBQXRDO0FBQ0E7O0FBQ0YsV0FBSyxPQUFMO0FBQ0UsWUFBSVMsTUFBTSxHQUFHeEMsV0FBVyxDQUFDeUMsS0FBWixDQUFrQmxCLEtBQWxCLENBQXdCLEdBQXhCLENBQWI7QUFDQSxhQUFLbEIsV0FBTCxDQUFpQnFDLElBQWpCLEdBQXdCRixNQUFNLENBQUNHLE1BQVAsQ0FBYyxDQUFDQyxPQUFELEVBQVVDLEtBQVYsS0FBb0I7QUFDeERBLFVBQUFBLEtBQUssR0FBR0EsS0FBSyxDQUFDQyxJQUFOLEVBQVI7O0FBQ0EsY0FBSUQsS0FBSyxLQUFLLFFBQWQsRUFBd0I7QUFDdEJELFlBQUFBLE9BQU8sQ0FBQ0csS0FBUixHQUFnQjtBQUFFQyxjQUFBQSxLQUFLLEVBQUU7QUFBVCxhQUFoQjtBQUNELFdBRkQsTUFFTyxJQUFJSCxLQUFLLENBQUMsQ0FBRCxDQUFMLElBQVksR0FBaEIsRUFBcUI7QUFDMUJELFlBQUFBLE9BQU8sQ0FBQ0MsS0FBSyxDQUFDakIsS0FBTixDQUFZLENBQVosQ0FBRCxDQUFQLEdBQTBCLENBQUMsQ0FBM0I7QUFDRCxXQUZNLE1BRUE7QUFDTGdCLFlBQUFBLE9BQU8sQ0FBQ0MsS0FBRCxDQUFQLEdBQWlCLENBQWpCO0FBQ0Q7O0FBQ0QsaUJBQU9ELE9BQVA7QUFDRCxTQVZ1QixFQVVyQixFQVZxQixDQUF4QjtBQVdBOztBQUNGLFdBQUssU0FBTDtBQUFnQjtBQUNkLGdCQUFNSyxLQUFLLEdBQUdqRCxXQUFXLENBQUNnQixPQUFaLENBQW9CTyxLQUFwQixDQUEwQixHQUExQixDQUFkOztBQUNBLGNBQUkwQixLQUFLLENBQUNDLFFBQU4sQ0FBZSxHQUFmLENBQUosRUFBeUI7QUFDdkIsaUJBQUtuQyxVQUFMLEdBQWtCLElBQWxCO0FBQ0E7QUFDRCxXQUxhLENBTWQ7OztBQUNBLGdCQUFNb0MsT0FBTyxHQUFHRixLQUFLLENBQUNOLE1BQU4sQ0FBYSxDQUFDUyxJQUFELEVBQU9DLElBQVAsS0FBZ0I7QUFDM0M7QUFDQTtBQUNBO0FBQ0EsbUJBQU9BLElBQUksQ0FBQzlCLEtBQUwsQ0FBVyxHQUFYLEVBQWdCb0IsTUFBaEIsQ0FBdUIsQ0FBQ1MsSUFBRCxFQUFPQyxJQUFQLEVBQWFDLEtBQWIsRUFBb0JDLEtBQXBCLEtBQThCO0FBQzFESCxjQUFBQSxJQUFJLENBQUNHLEtBQUssQ0FBQzNCLEtBQU4sQ0FBWSxDQUFaLEVBQWUwQixLQUFLLEdBQUcsQ0FBdkIsRUFBMEJ4QixJQUExQixDQUErQixHQUEvQixDQUFELENBQUosR0FBNEMsSUFBNUM7QUFDQSxxQkFBT3NCLElBQVA7QUFDRCxhQUhNLEVBR0pBLElBSEksQ0FBUDtBQUlELFdBUmUsRUFRYixFQVJhLENBQWhCO0FBVUEsZUFBS3BDLE9BQUwsR0FBZUMsTUFBTSxDQUFDSyxJQUFQLENBQVk2QixPQUFaLEVBQ1p4QixHQURZLENBQ1I2QixDQUFDLElBQUk7QUFDUixtQkFBT0EsQ0FBQyxDQUFDakMsS0FBRixDQUFRLEdBQVIsQ0FBUDtBQUNELFdBSFksRUFJWm1CLElBSlksQ0FJUCxDQUFDZSxDQUFELEVBQUlDLENBQUosS0FBVTtBQUNkLG1CQUFPRCxDQUFDLENBQUMvQixNQUFGLEdBQVdnQyxDQUFDLENBQUNoQyxNQUFwQixDQURjLENBQ2M7QUFDN0IsV0FOWSxDQUFmO0FBT0E7QUFDRDs7QUFDRCxXQUFLLHlCQUFMO0FBQ0UsYUFBS2lDLFdBQUwsR0FBbUIzRCxXQUFXLENBQUM0RCx1QkFBL0I7QUFDQSxhQUFLQyxpQkFBTCxHQUF5QixJQUF6QjtBQUNBOztBQUNGLFdBQUssdUJBQUw7QUFDQSxXQUFLLHdCQUFMO0FBQ0U7O0FBQ0Y7QUFDRSxjQUFNLElBQUl0RSxLQUFLLENBQUNpQixLQUFWLENBQWdCakIsS0FBSyxDQUFDaUIsS0FBTixDQUFZc0QsWUFBNUIsRUFBMEMsaUJBQWlCL0IsTUFBM0QsQ0FBTjtBQS9FSjtBQWlGRDtBQUNGLEMsQ0FFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQXBDLFNBQVMsQ0FBQ3VCLFNBQVYsQ0FBb0I2QyxPQUFwQixHQUE4QixVQUFVQyxjQUFWLEVBQTBCO0FBQ3RELFNBQU9DLE9BQU8sQ0FBQ0MsT0FBUixHQUNKQyxJQURJLENBQ0MsTUFBTTtBQUNWLFdBQU8sS0FBS0MsY0FBTCxFQUFQO0FBQ0QsR0FISSxFQUlKRCxJQUpJLENBSUMsTUFBTTtBQUNWLFdBQU8sS0FBS0UsZ0JBQUwsRUFBUDtBQUNELEdBTkksRUFPSkYsSUFQSSxDQU9DLE1BQU07QUFDVixXQUFPLEtBQUtHLGlCQUFMLEVBQVA7QUFDRCxHQVRJLEVBVUpILElBVkksQ0FVQyxNQUFNO0FBQ1YsV0FBTyxLQUFLSSxPQUFMLENBQWFQLGNBQWIsQ0FBUDtBQUNELEdBWkksRUFhSkcsSUFiSSxDQWFDLE1BQU07QUFDVixXQUFPLEtBQUtLLFFBQUwsRUFBUDtBQUNELEdBZkksRUFnQkpMLElBaEJJLENBZ0JDLE1BQU07QUFDVixXQUFPLEtBQUtNLGFBQUwsRUFBUDtBQUNELEdBbEJJLEVBbUJKTixJQW5CSSxDQW1CQyxNQUFNO0FBQ1YsV0FBTyxLQUFLTyxtQkFBTCxFQUFQO0FBQ0QsR0FyQkksRUFzQkpQLElBdEJJLENBc0JDLE1BQU07QUFDVixXQUFPLEtBQUsvRCxRQUFaO0FBQ0QsR0F4QkksQ0FBUDtBQXlCRCxDQTFCRDs7QUE0QkFULFNBQVMsQ0FBQ3VCLFNBQVYsQ0FBb0J5RCxJQUFwQixHQUEyQixVQUFVQyxRQUFWLEVBQW9CO0FBQzdDLFFBQU07QUFBRWhGLElBQUFBLE1BQUY7QUFBVUMsSUFBQUEsSUFBVjtBQUFnQkMsSUFBQUEsU0FBaEI7QUFBMkJDLElBQUFBLFNBQTNCO0FBQXNDQyxJQUFBQSxXQUF0QztBQUFtREMsSUFBQUE7QUFBbkQsTUFBaUUsSUFBdkUsQ0FENkMsQ0FFN0M7O0FBQ0FELEVBQUFBLFdBQVcsQ0FBQzZFLEtBQVosR0FBb0I3RSxXQUFXLENBQUM2RSxLQUFaLElBQXFCLEdBQXpDO0FBQ0E3RSxFQUFBQSxXQUFXLENBQUN5QyxLQUFaLEdBQW9CLFVBQXBCO0FBQ0EsTUFBSXFDLFFBQVEsR0FBRyxLQUFmO0FBRUEsU0FBT3JGLGFBQWEsQ0FDbEIsTUFBTTtBQUNKLFdBQU8sQ0FBQ3FGLFFBQVI7QUFDRCxHQUhpQixFQUlsQixZQUFZO0FBQ1YsVUFBTUMsS0FBSyxHQUFHLElBQUlwRixTQUFKLENBQ1pDLE1BRFksRUFFWkMsSUFGWSxFQUdaQyxTQUhZLEVBSVpDLFNBSlksRUFLWkMsV0FMWSxFQU1aQyxTQU5ZLEVBT1osS0FBS0MsWUFQTyxFQVFaLEtBQUtDLE9BUk8sQ0FBZDtBQVVBLFVBQU07QUFBRTZFLE1BQUFBO0FBQUYsUUFBYyxNQUFNRCxLQUFLLENBQUNoQixPQUFOLEVBQTFCO0FBQ0FpQixJQUFBQSxPQUFPLENBQUNDLE9BQVIsQ0FBZ0JMLFFBQWhCO0FBQ0FFLElBQUFBLFFBQVEsR0FBR0UsT0FBTyxDQUFDdEQsTUFBUixHQUFpQjFCLFdBQVcsQ0FBQzZFLEtBQXhDOztBQUNBLFFBQUksQ0FBQ0MsUUFBTCxFQUFlO0FBQ2IvRSxNQUFBQSxTQUFTLENBQUNhLFFBQVYsR0FBcUJLLE1BQU0sQ0FBQ2lFLE1BQVAsQ0FBYyxFQUFkLEVBQWtCbkYsU0FBUyxDQUFDYSxRQUE1QixFQUFzQztBQUN6RHVFLFFBQUFBLEdBQUcsRUFBRUgsT0FBTyxDQUFDQSxPQUFPLENBQUN0RCxNQUFSLEdBQWlCLENBQWxCLENBQVAsQ0FBNEJkO0FBRHdCLE9BQXRDLENBQXJCO0FBR0Q7QUFDRixHQXZCaUIsQ0FBcEI7QUF5QkQsQ0FoQ0Q7O0FBa0NBakIsU0FBUyxDQUFDdUIsU0FBVixDQUFvQmtELGNBQXBCLEdBQXFDLFlBQVk7QUFDL0MsU0FBT0gsT0FBTyxDQUFDQyxPQUFSLEdBQ0pDLElBREksQ0FDQyxNQUFNO0FBQ1YsV0FBTyxLQUFLaUIsaUJBQUwsRUFBUDtBQUNELEdBSEksRUFJSmpCLElBSkksQ0FJQyxNQUFNO0FBQ1YsV0FBTyxLQUFLUCx1QkFBTCxFQUFQO0FBQ0QsR0FOSSxFQU9KTyxJQVBJLENBT0MsTUFBTTtBQUNWLFdBQU8sS0FBS2tCLDJCQUFMLEVBQVA7QUFDRCxHQVRJLEVBVUpsQixJQVZJLENBVUMsTUFBTTtBQUNWLFdBQU8sS0FBS21CLGFBQUwsRUFBUDtBQUNELEdBWkksRUFhSm5CLElBYkksQ0FhQyxNQUFNO0FBQ1YsV0FBTyxLQUFLb0IsaUJBQUwsRUFBUDtBQUNELEdBZkksRUFnQkpwQixJQWhCSSxDQWdCQyxNQUFNO0FBQ1YsV0FBTyxLQUFLcUIsY0FBTCxFQUFQO0FBQ0QsR0FsQkksRUFtQkpyQixJQW5CSSxDQW1CQyxNQUFNO0FBQ1YsV0FBTyxLQUFLc0IsaUJBQUwsRUFBUDtBQUNELEdBckJJLEVBc0JKdEIsSUF0QkksQ0FzQkMsTUFBTTtBQUNWLFdBQU8sS0FBS3VCLGVBQUwsRUFBUDtBQUNELEdBeEJJLENBQVA7QUF5QkQsQ0ExQkQsQyxDQTRCQTs7O0FBQ0EvRixTQUFTLENBQUN1QixTQUFWLENBQW9Ca0UsaUJBQXBCLEdBQXdDLFlBQVk7QUFDbEQsTUFBSSxLQUFLdkYsSUFBTCxDQUFVUyxRQUFkLEVBQXdCO0FBQ3RCLFdBQU8yRCxPQUFPLENBQUNDLE9BQVIsRUFBUDtBQUNEOztBQUVELE9BQUs3RCxXQUFMLENBQWlCc0YsR0FBakIsR0FBdUIsQ0FBQyxHQUFELENBQXZCOztBQUVBLE1BQUksS0FBSzlGLElBQUwsQ0FBVVUsSUFBZCxFQUFvQjtBQUNsQixXQUFPLEtBQUtWLElBQUwsQ0FBVStGLFlBQVYsR0FBeUJ6QixJQUF6QixDQUE4QjBCLEtBQUssSUFBSTtBQUM1QyxXQUFLeEYsV0FBTCxDQUFpQnNGLEdBQWpCLEdBQXVCLEtBQUt0RixXQUFMLENBQWlCc0YsR0FBakIsQ0FBcUIzRCxNQUFyQixDQUE0QjZELEtBQTVCLEVBQW1DLENBQUMsS0FBS2hHLElBQUwsQ0FBVVUsSUFBVixDQUFlTSxFQUFoQixDQUFuQyxDQUF2QjtBQUNBO0FBQ0QsS0FITSxDQUFQO0FBSUQsR0FMRCxNQUtPO0FBQ0wsV0FBT29ELE9BQU8sQ0FBQ0MsT0FBUixFQUFQO0FBQ0Q7QUFDRixDQWZELEMsQ0FpQkE7QUFDQTs7O0FBQ0F2RSxTQUFTLENBQUN1QixTQUFWLENBQW9CMEMsdUJBQXBCLEdBQThDLFlBQVk7QUFDeEQsTUFBSSxDQUFDLEtBQUtELFdBQVYsRUFBdUI7QUFDckIsV0FBT00sT0FBTyxDQUFDQyxPQUFSLEVBQVA7QUFDRCxHQUh1RCxDQUt4RDs7O0FBQ0EsU0FBTyxLQUFLdEUsTUFBTCxDQUFZa0csUUFBWixDQUNKbEMsdUJBREksQ0FDb0IsS0FBSzlELFNBRHpCLEVBQ29DLEtBQUs2RCxXQUR6QyxFQUVKUSxJQUZJLENBRUM0QixZQUFZLElBQUk7QUFDcEIsU0FBS2pHLFNBQUwsR0FBaUJpRyxZQUFqQjtBQUNBLFNBQUtsQyxpQkFBTCxHQUF5QmtDLFlBQXpCO0FBQ0QsR0FMSSxDQUFQO0FBTUQsQ0FaRCxDLENBY0E7OztBQUNBcEcsU0FBUyxDQUFDdUIsU0FBVixDQUFvQm1FLDJCQUFwQixHQUFrRCxZQUFZO0FBQzVELE1BQ0UsS0FBS3pGLE1BQUwsQ0FBWW9HLHdCQUFaLEtBQXlDLEtBQXpDLElBQ0EsQ0FBQyxLQUFLbkcsSUFBTCxDQUFVUyxRQURYLElBRUFqQixnQkFBZ0IsQ0FBQzRHLGFBQWpCLENBQStCMUQsT0FBL0IsQ0FBdUMsS0FBS3pDLFNBQTVDLE1BQTJELENBQUMsQ0FIOUQsRUFJRTtBQUNBLFdBQU8sS0FBS0YsTUFBTCxDQUFZa0csUUFBWixDQUNKSSxVQURJLEdBRUovQixJQUZJLENBRUNnQyxnQkFBZ0IsSUFBSUEsZ0JBQWdCLENBQUNDLFFBQWpCLENBQTBCLEtBQUt0RyxTQUEvQixDQUZyQixFQUdKcUUsSUFISSxDQUdDaUMsUUFBUSxJQUFJO0FBQ2hCLFVBQUlBLFFBQVEsS0FBSyxJQUFqQixFQUF1QjtBQUNyQixjQUFNLElBQUk3RyxLQUFLLENBQUNpQixLQUFWLENBQ0pqQixLQUFLLENBQUNpQixLQUFOLENBQVk2RixtQkFEUixFQUVKLHdDQUF3QyxzQkFBeEMsR0FBaUUsS0FBS3ZHLFNBRmxFLENBQU47QUFJRDtBQUNGLEtBVkksQ0FBUDtBQVdELEdBaEJELE1BZ0JPO0FBQ0wsV0FBT21FLE9BQU8sQ0FBQ0MsT0FBUixFQUFQO0FBQ0Q7QUFDRixDQXBCRDs7QUFzQkEsU0FBU29DLGdCQUFULENBQTBCQyxhQUExQixFQUF5Q3pHLFNBQXpDLEVBQW9Ea0YsT0FBcEQsRUFBNkQ7QUFDM0QsTUFBSXdCLE1BQU0sR0FBRyxFQUFiOztBQUNBLE9BQUssSUFBSUMsTUFBVCxJQUFtQnpCLE9BQW5CLEVBQTRCO0FBQzFCd0IsSUFBQUEsTUFBTSxDQUFDRSxJQUFQLENBQVk7QUFDVi9GLE1BQUFBLE1BQU0sRUFBRSxTQURFO0FBRVZiLE1BQUFBLFNBQVMsRUFBRUEsU0FGRDtBQUdWYyxNQUFBQSxRQUFRLEVBQUU2RixNQUFNLENBQUM3RjtBQUhQLEtBQVo7QUFLRDs7QUFDRCxTQUFPMkYsYUFBYSxDQUFDLFVBQUQsQ0FBcEI7O0FBQ0EsTUFBSXRFLEtBQUssQ0FBQzBFLE9BQU4sQ0FBY0osYUFBYSxDQUFDLEtBQUQsQ0FBM0IsQ0FBSixFQUF5QztBQUN2Q0EsSUFBQUEsYUFBYSxDQUFDLEtBQUQsQ0FBYixHQUF1QkEsYUFBYSxDQUFDLEtBQUQsQ0FBYixDQUFxQnZFLE1BQXJCLENBQTRCd0UsTUFBNUIsQ0FBdkI7QUFDRCxHQUZELE1BRU87QUFDTEQsSUFBQUEsYUFBYSxDQUFDLEtBQUQsQ0FBYixHQUF1QkMsTUFBdkI7QUFDRDtBQUNGLEMsQ0FFRDtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0E3RyxTQUFTLENBQUN1QixTQUFWLENBQW9Cc0UsY0FBcEIsR0FBcUMsWUFBWTtBQUMvQyxNQUFJZSxhQUFhLEdBQUdLLGlCQUFpQixDQUFDLEtBQUs3RyxTQUFOLEVBQWlCLFVBQWpCLENBQXJDOztBQUNBLE1BQUksQ0FBQ3dHLGFBQUwsRUFBb0I7QUFDbEI7QUFDRCxHQUo4QyxDQU0vQzs7O0FBQ0EsTUFBSU0sWUFBWSxHQUFHTixhQUFhLENBQUMsVUFBRCxDQUFoQzs7QUFDQSxNQUFJLENBQUNNLFlBQVksQ0FBQ0MsS0FBZCxJQUF1QixDQUFDRCxZQUFZLENBQUMvRyxTQUF6QyxFQUFvRDtBQUNsRCxVQUFNLElBQUlQLEtBQUssQ0FBQ2lCLEtBQVYsQ0FBZ0JqQixLQUFLLENBQUNpQixLQUFOLENBQVl1RyxhQUE1QixFQUEyQyw0QkFBM0MsQ0FBTjtBQUNEOztBQUVELFFBQU1DLGlCQUFpQixHQUFHO0FBQ3hCcEQsSUFBQUEsdUJBQXVCLEVBQUVpRCxZQUFZLENBQUNqRDtBQURkLEdBQTFCOztBQUlBLE1BQUksS0FBSzVELFdBQUwsQ0FBaUJpSCxzQkFBckIsRUFBNkM7QUFDM0NELElBQUFBLGlCQUFpQixDQUFDRSxjQUFsQixHQUFtQyxLQUFLbEgsV0FBTCxDQUFpQmlILHNCQUFwRDtBQUNBRCxJQUFBQSxpQkFBaUIsQ0FBQ0Msc0JBQWxCLEdBQTJDLEtBQUtqSCxXQUFMLENBQWlCaUgsc0JBQTVEO0FBQ0QsR0FIRCxNQUdPLElBQUksS0FBS2pILFdBQUwsQ0FBaUJrSCxjQUFyQixFQUFxQztBQUMxQ0YsSUFBQUEsaUJBQWlCLENBQUNFLGNBQWxCLEdBQW1DLEtBQUtsSCxXQUFMLENBQWlCa0gsY0FBcEQ7QUFDRDs7QUFFRCxNQUFJQyxRQUFRLEdBQUcsSUFBSXhILFNBQUosQ0FDYixLQUFLQyxNQURRLEVBRWIsS0FBS0MsSUFGUSxFQUdiZ0gsWUFBWSxDQUFDL0csU0FIQSxFQUliK0csWUFBWSxDQUFDQyxLQUpBLEVBS2JFLGlCQUxhLENBQWY7QUFPQSxTQUFPRyxRQUFRLENBQUNwRCxPQUFULEdBQW1CSSxJQUFuQixDQUF3Qi9ELFFBQVEsSUFBSTtBQUN6Q2tHLElBQUFBLGdCQUFnQixDQUFDQyxhQUFELEVBQWdCWSxRQUFRLENBQUNySCxTQUF6QixFQUFvQ00sUUFBUSxDQUFDNEUsT0FBN0MsQ0FBaEIsQ0FEeUMsQ0FFekM7O0FBQ0EsV0FBTyxLQUFLUSxjQUFMLEVBQVA7QUFDRCxHQUpNLENBQVA7QUFLRCxDQW5DRDs7QUFxQ0EsU0FBUzRCLG1CQUFULENBQTZCQyxnQkFBN0IsRUFBK0N2SCxTQUEvQyxFQUEwRGtGLE9BQTFELEVBQW1FO0FBQ2pFLE1BQUl3QixNQUFNLEdBQUcsRUFBYjs7QUFDQSxPQUFLLElBQUlDLE1BQVQsSUFBbUJ6QixPQUFuQixFQUE0QjtBQUMxQndCLElBQUFBLE1BQU0sQ0FBQ0UsSUFBUCxDQUFZO0FBQ1YvRixNQUFBQSxNQUFNLEVBQUUsU0FERTtBQUVWYixNQUFBQSxTQUFTLEVBQUVBLFNBRkQ7QUFHVmMsTUFBQUEsUUFBUSxFQUFFNkYsTUFBTSxDQUFDN0Y7QUFIUCxLQUFaO0FBS0Q7O0FBQ0QsU0FBT3lHLGdCQUFnQixDQUFDLGFBQUQsQ0FBdkI7O0FBQ0EsTUFBSXBGLEtBQUssQ0FBQzBFLE9BQU4sQ0FBY1UsZ0JBQWdCLENBQUMsTUFBRCxDQUE5QixDQUFKLEVBQTZDO0FBQzNDQSxJQUFBQSxnQkFBZ0IsQ0FBQyxNQUFELENBQWhCLEdBQTJCQSxnQkFBZ0IsQ0FBQyxNQUFELENBQWhCLENBQXlCckYsTUFBekIsQ0FBZ0N3RSxNQUFoQyxDQUEzQjtBQUNELEdBRkQsTUFFTztBQUNMYSxJQUFBQSxnQkFBZ0IsQ0FBQyxNQUFELENBQWhCLEdBQTJCYixNQUEzQjtBQUNEO0FBQ0YsQyxDQUVEO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQTdHLFNBQVMsQ0FBQ3VCLFNBQVYsQ0FBb0J1RSxpQkFBcEIsR0FBd0MsWUFBWTtBQUNsRCxNQUFJNEIsZ0JBQWdCLEdBQUdULGlCQUFpQixDQUFDLEtBQUs3RyxTQUFOLEVBQWlCLGFBQWpCLENBQXhDOztBQUNBLE1BQUksQ0FBQ3NILGdCQUFMLEVBQXVCO0FBQ3JCO0FBQ0QsR0FKaUQsQ0FNbEQ7OztBQUNBLE1BQUlDLGVBQWUsR0FBR0QsZ0JBQWdCLENBQUMsYUFBRCxDQUF0Qzs7QUFDQSxNQUFJLENBQUNDLGVBQWUsQ0FBQ1IsS0FBakIsSUFBMEIsQ0FBQ1EsZUFBZSxDQUFDeEgsU0FBL0MsRUFBMEQ7QUFDeEQsVUFBTSxJQUFJUCxLQUFLLENBQUNpQixLQUFWLENBQWdCakIsS0FBSyxDQUFDaUIsS0FBTixDQUFZdUcsYUFBNUIsRUFBMkMsK0JBQTNDLENBQU47QUFDRDs7QUFFRCxRQUFNQyxpQkFBaUIsR0FBRztBQUN4QnBELElBQUFBLHVCQUF1QixFQUFFMEQsZUFBZSxDQUFDMUQ7QUFEakIsR0FBMUI7O0FBSUEsTUFBSSxLQUFLNUQsV0FBTCxDQUFpQmlILHNCQUFyQixFQUE2QztBQUMzQ0QsSUFBQUEsaUJBQWlCLENBQUNFLGNBQWxCLEdBQW1DLEtBQUtsSCxXQUFMLENBQWlCaUgsc0JBQXBEO0FBQ0FELElBQUFBLGlCQUFpQixDQUFDQyxzQkFBbEIsR0FBMkMsS0FBS2pILFdBQUwsQ0FBaUJpSCxzQkFBNUQ7QUFDRCxHQUhELE1BR08sSUFBSSxLQUFLakgsV0FBTCxDQUFpQmtILGNBQXJCLEVBQXFDO0FBQzFDRixJQUFBQSxpQkFBaUIsQ0FBQ0UsY0FBbEIsR0FBbUMsS0FBS2xILFdBQUwsQ0FBaUJrSCxjQUFwRDtBQUNEOztBQUVELE1BQUlDLFFBQVEsR0FBRyxJQUFJeEgsU0FBSixDQUNiLEtBQUtDLE1BRFEsRUFFYixLQUFLQyxJQUZRLEVBR2J5SCxlQUFlLENBQUN4SCxTQUhILEVBSWJ3SCxlQUFlLENBQUNSLEtBSkgsRUFLYkUsaUJBTGEsQ0FBZjtBQU9BLFNBQU9HLFFBQVEsQ0FBQ3BELE9BQVQsR0FBbUJJLElBQW5CLENBQXdCL0QsUUFBUSxJQUFJO0FBQ3pDZ0gsSUFBQUEsbUJBQW1CLENBQUNDLGdCQUFELEVBQW1CRixRQUFRLENBQUNySCxTQUE1QixFQUF1Q00sUUFBUSxDQUFDNEUsT0FBaEQsQ0FBbkIsQ0FEeUMsQ0FFekM7O0FBQ0EsV0FBTyxLQUFLUyxpQkFBTCxFQUFQO0FBQ0QsR0FKTSxDQUFQO0FBS0QsQ0FuQ0QsQyxDQXFDQTs7O0FBQ0EsTUFBTThCLHVCQUF1QixHQUFHLENBQUNDLElBQUQsRUFBTy9GLEdBQVAsRUFBWWdHLEdBQVosRUFBaUJDLEdBQWpCLEtBQXlCO0FBQ3ZELE1BQUlqRyxHQUFHLElBQUkrRixJQUFYLEVBQWlCO0FBQ2YsV0FBT0EsSUFBSSxDQUFDL0YsR0FBRCxDQUFYO0FBQ0Q7O0FBQ0RpRyxFQUFBQSxHQUFHLENBQUNDLE1BQUosQ0FBVyxDQUFYLEVBSnVELENBSXhDO0FBQ2hCLENBTEQ7O0FBT0EsTUFBTUMsZUFBZSxHQUFHLENBQUNDLFlBQUQsRUFBZXBHLEdBQWYsRUFBb0JxRyxPQUFwQixLQUFnQztBQUN0RCxNQUFJdEIsTUFBTSxHQUFHLEVBQWI7O0FBQ0EsT0FBSyxJQUFJQyxNQUFULElBQW1CcUIsT0FBbkIsRUFBNEI7QUFDMUJ0QixJQUFBQSxNQUFNLENBQUNFLElBQVAsQ0FBWWpGLEdBQUcsQ0FBQ0YsS0FBSixDQUFVLEdBQVYsRUFBZW9CLE1BQWYsQ0FBc0I0RSx1QkFBdEIsRUFBK0NkLE1BQS9DLENBQVo7QUFDRDs7QUFDRCxTQUFPb0IsWUFBWSxDQUFDLFNBQUQsQ0FBbkI7O0FBQ0EsTUFBSTVGLEtBQUssQ0FBQzBFLE9BQU4sQ0FBY2tCLFlBQVksQ0FBQyxLQUFELENBQTFCLENBQUosRUFBd0M7QUFDdENBLElBQUFBLFlBQVksQ0FBQyxLQUFELENBQVosR0FBc0JBLFlBQVksQ0FBQyxLQUFELENBQVosQ0FBb0I3RixNQUFwQixDQUEyQndFLE1BQTNCLENBQXRCO0FBQ0QsR0FGRCxNQUVPO0FBQ0xxQixJQUFBQSxZQUFZLENBQUMsS0FBRCxDQUFaLEdBQXNCckIsTUFBdEI7QUFDRDtBQUNGLENBWEQsQyxDQWFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNBN0csU0FBUyxDQUFDdUIsU0FBVixDQUFvQm9FLGFBQXBCLEdBQW9DLFlBQVk7QUFDOUMsTUFBSXVDLFlBQVksR0FBR2pCLGlCQUFpQixDQUFDLEtBQUs3RyxTQUFOLEVBQWlCLFNBQWpCLENBQXBDOztBQUNBLE1BQUksQ0FBQzhILFlBQUwsRUFBbUI7QUFDakI7QUFDRCxHQUo2QyxDQU05Qzs7O0FBQ0EsTUFBSUUsV0FBVyxHQUFHRixZQUFZLENBQUMsU0FBRCxDQUE5QixDQVA4QyxDQVE5Qzs7QUFDQSxNQUNFLENBQUNFLFdBQVcsQ0FBQ2hELEtBQWIsSUFDQSxDQUFDZ0QsV0FBVyxDQUFDdEcsR0FEYixJQUVBLE9BQU9zRyxXQUFXLENBQUNoRCxLQUFuQixLQUE2QixRQUY3QixJQUdBLENBQUNnRCxXQUFXLENBQUNoRCxLQUFaLENBQWtCakYsU0FIbkIsSUFJQW1CLE1BQU0sQ0FBQ0ssSUFBUCxDQUFZeUcsV0FBWixFQUF5QnJHLE1BQXpCLEtBQW9DLENBTHRDLEVBTUU7QUFDQSxVQUFNLElBQUluQyxLQUFLLENBQUNpQixLQUFWLENBQWdCakIsS0FBSyxDQUFDaUIsS0FBTixDQUFZdUcsYUFBNUIsRUFBMkMsMkJBQTNDLENBQU47QUFDRDs7QUFFRCxRQUFNQyxpQkFBaUIsR0FBRztBQUN4QnBELElBQUFBLHVCQUF1QixFQUFFbUUsV0FBVyxDQUFDaEQsS0FBWixDQUFrQm5CO0FBRG5CLEdBQTFCOztBQUlBLE1BQUksS0FBSzVELFdBQUwsQ0FBaUJpSCxzQkFBckIsRUFBNkM7QUFDM0NELElBQUFBLGlCQUFpQixDQUFDRSxjQUFsQixHQUFtQyxLQUFLbEgsV0FBTCxDQUFpQmlILHNCQUFwRDtBQUNBRCxJQUFBQSxpQkFBaUIsQ0FBQ0Msc0JBQWxCLEdBQTJDLEtBQUtqSCxXQUFMLENBQWlCaUgsc0JBQTVEO0FBQ0QsR0FIRCxNQUdPLElBQUksS0FBS2pILFdBQUwsQ0FBaUJrSCxjQUFyQixFQUFxQztBQUMxQ0YsSUFBQUEsaUJBQWlCLENBQUNFLGNBQWxCLEdBQW1DLEtBQUtsSCxXQUFMLENBQWlCa0gsY0FBcEQ7QUFDRDs7QUFFRCxNQUFJQyxRQUFRLEdBQUcsSUFBSXhILFNBQUosQ0FDYixLQUFLQyxNQURRLEVBRWIsS0FBS0MsSUFGUSxFQUdia0ksV0FBVyxDQUFDaEQsS0FBWixDQUFrQmpGLFNBSEwsRUFJYmlJLFdBQVcsQ0FBQ2hELEtBQVosQ0FBa0IrQixLQUpMLEVBS2JFLGlCQUxhLENBQWY7QUFPQSxTQUFPRyxRQUFRLENBQUNwRCxPQUFULEdBQW1CSSxJQUFuQixDQUF3Qi9ELFFBQVEsSUFBSTtBQUN6Q3dILElBQUFBLGVBQWUsQ0FBQ0MsWUFBRCxFQUFlRSxXQUFXLENBQUN0RyxHQUEzQixFQUFnQ3JCLFFBQVEsQ0FBQzRFLE9BQXpDLENBQWYsQ0FEeUMsQ0FFekM7O0FBQ0EsV0FBTyxLQUFLTSxhQUFMLEVBQVA7QUFDRCxHQUpNLENBQVA7QUFLRCxDQTFDRDs7QUE0Q0EsTUFBTTBDLG1CQUFtQixHQUFHLENBQUNDLGdCQUFELEVBQW1CeEcsR0FBbkIsRUFBd0JxRyxPQUF4QixLQUFvQztBQUM5RCxNQUFJdEIsTUFBTSxHQUFHLEVBQWI7O0FBQ0EsT0FBSyxJQUFJQyxNQUFULElBQW1CcUIsT0FBbkIsRUFBNEI7QUFDMUJ0QixJQUFBQSxNQUFNLENBQUNFLElBQVAsQ0FBWWpGLEdBQUcsQ0FBQ0YsS0FBSixDQUFVLEdBQVYsRUFBZW9CLE1BQWYsQ0FBc0I0RSx1QkFBdEIsRUFBK0NkLE1BQS9DLENBQVo7QUFDRDs7QUFDRCxTQUFPd0IsZ0JBQWdCLENBQUMsYUFBRCxDQUF2Qjs7QUFDQSxNQUFJaEcsS0FBSyxDQUFDMEUsT0FBTixDQUFjc0IsZ0JBQWdCLENBQUMsTUFBRCxDQUE5QixDQUFKLEVBQTZDO0FBQzNDQSxJQUFBQSxnQkFBZ0IsQ0FBQyxNQUFELENBQWhCLEdBQTJCQSxnQkFBZ0IsQ0FBQyxNQUFELENBQWhCLENBQXlCakcsTUFBekIsQ0FBZ0N3RSxNQUFoQyxDQUEzQjtBQUNELEdBRkQsTUFFTztBQUNMeUIsSUFBQUEsZ0JBQWdCLENBQUMsTUFBRCxDQUFoQixHQUEyQnpCLE1BQTNCO0FBQ0Q7QUFDRixDQVhELEMsQ0FhQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQTdHLFNBQVMsQ0FBQ3VCLFNBQVYsQ0FBb0JxRSxpQkFBcEIsR0FBd0MsWUFBWTtBQUNsRCxNQUFJMEMsZ0JBQWdCLEdBQUdyQixpQkFBaUIsQ0FBQyxLQUFLN0csU0FBTixFQUFpQixhQUFqQixDQUF4Qzs7QUFDQSxNQUFJLENBQUNrSSxnQkFBTCxFQUF1QjtBQUNyQjtBQUNELEdBSmlELENBTWxEOzs7QUFDQSxNQUFJQyxlQUFlLEdBQUdELGdCQUFnQixDQUFDLGFBQUQsQ0FBdEM7O0FBQ0EsTUFDRSxDQUFDQyxlQUFlLENBQUNuRCxLQUFqQixJQUNBLENBQUNtRCxlQUFlLENBQUN6RyxHQURqQixJQUVBLE9BQU95RyxlQUFlLENBQUNuRCxLQUF2QixLQUFpQyxRQUZqQyxJQUdBLENBQUNtRCxlQUFlLENBQUNuRCxLQUFoQixDQUFzQmpGLFNBSHZCLElBSUFtQixNQUFNLENBQUNLLElBQVAsQ0FBWTRHLGVBQVosRUFBNkJ4RyxNQUE3QixLQUF3QyxDQUwxQyxFQU1FO0FBQ0EsVUFBTSxJQUFJbkMsS0FBSyxDQUFDaUIsS0FBVixDQUFnQmpCLEtBQUssQ0FBQ2lCLEtBQU4sQ0FBWXVHLGFBQTVCLEVBQTJDLCtCQUEzQyxDQUFOO0FBQ0Q7O0FBQ0QsUUFBTUMsaUJBQWlCLEdBQUc7QUFDeEJwRCxJQUFBQSx1QkFBdUIsRUFBRXNFLGVBQWUsQ0FBQ25ELEtBQWhCLENBQXNCbkI7QUFEdkIsR0FBMUI7O0FBSUEsTUFBSSxLQUFLNUQsV0FBTCxDQUFpQmlILHNCQUFyQixFQUE2QztBQUMzQ0QsSUFBQUEsaUJBQWlCLENBQUNFLGNBQWxCLEdBQW1DLEtBQUtsSCxXQUFMLENBQWlCaUgsc0JBQXBEO0FBQ0FELElBQUFBLGlCQUFpQixDQUFDQyxzQkFBbEIsR0FBMkMsS0FBS2pILFdBQUwsQ0FBaUJpSCxzQkFBNUQ7QUFDRCxHQUhELE1BR08sSUFBSSxLQUFLakgsV0FBTCxDQUFpQmtILGNBQXJCLEVBQXFDO0FBQzFDRixJQUFBQSxpQkFBaUIsQ0FBQ0UsY0FBbEIsR0FBbUMsS0FBS2xILFdBQUwsQ0FBaUJrSCxjQUFwRDtBQUNEOztBQUVELE1BQUlDLFFBQVEsR0FBRyxJQUFJeEgsU0FBSixDQUNiLEtBQUtDLE1BRFEsRUFFYixLQUFLQyxJQUZRLEVBR2JxSSxlQUFlLENBQUNuRCxLQUFoQixDQUFzQmpGLFNBSFQsRUFJYm9JLGVBQWUsQ0FBQ25ELEtBQWhCLENBQXNCK0IsS0FKVCxFQUtiRSxpQkFMYSxDQUFmO0FBT0EsU0FBT0csUUFBUSxDQUFDcEQsT0FBVCxHQUFtQkksSUFBbkIsQ0FBd0IvRCxRQUFRLElBQUk7QUFDekM0SCxJQUFBQSxtQkFBbUIsQ0FBQ0MsZ0JBQUQsRUFBbUJDLGVBQWUsQ0FBQ3pHLEdBQW5DLEVBQXdDckIsUUFBUSxDQUFDNEUsT0FBakQsQ0FBbkIsQ0FEeUMsQ0FFekM7O0FBQ0EsV0FBTyxLQUFLTyxpQkFBTCxFQUFQO0FBQ0QsR0FKTSxDQUFQO0FBS0QsQ0F4Q0Q7O0FBMENBNUYsU0FBUyxDQUFDdUIsU0FBVixDQUFvQmlILG1CQUFwQixHQUEwQyxVQUFVMUIsTUFBVixFQUFrQjtBQUMxRCxTQUFPQSxNQUFNLENBQUMyQixRQUFkOztBQUNBLE1BQUkzQixNQUFNLENBQUM0QixRQUFYLEVBQXFCO0FBQ25CcEgsSUFBQUEsTUFBTSxDQUFDSyxJQUFQLENBQVltRixNQUFNLENBQUM0QixRQUFuQixFQUE2QnBELE9BQTdCLENBQXFDcUQsUUFBUSxJQUFJO0FBQy9DLFVBQUk3QixNQUFNLENBQUM0QixRQUFQLENBQWdCQyxRQUFoQixNQUE4QixJQUFsQyxFQUF3QztBQUN0QyxlQUFPN0IsTUFBTSxDQUFDNEIsUUFBUCxDQUFnQkMsUUFBaEIsQ0FBUDtBQUNEO0FBQ0YsS0FKRDs7QUFNQSxRQUFJckgsTUFBTSxDQUFDSyxJQUFQLENBQVltRixNQUFNLENBQUM0QixRQUFuQixFQUE2QjNHLE1BQTdCLElBQXVDLENBQTNDLEVBQThDO0FBQzVDLGFBQU8rRSxNQUFNLENBQUM0QixRQUFkO0FBQ0Q7QUFDRjtBQUNGLENBYkQ7O0FBZUEsTUFBTUUseUJBQXlCLEdBQUdDLFVBQVUsSUFBSTtBQUM5QyxNQUFJLE9BQU9BLFVBQVAsS0FBc0IsUUFBMUIsRUFBb0M7QUFDbEMsV0FBT0EsVUFBUDtBQUNEOztBQUNELFFBQU1DLGFBQWEsR0FBRyxFQUF0QjtBQUNBLE1BQUlDLG1CQUFtQixHQUFHLEtBQTFCO0FBQ0EsTUFBSUMscUJBQXFCLEdBQUcsS0FBNUI7O0FBQ0EsT0FBSyxNQUFNbEgsR0FBWCxJQUFrQitHLFVBQWxCLEVBQThCO0FBQzVCLFFBQUkvRyxHQUFHLENBQUNjLE9BQUosQ0FBWSxHQUFaLE1BQXFCLENBQXpCLEVBQTRCO0FBQzFCbUcsTUFBQUEsbUJBQW1CLEdBQUcsSUFBdEI7QUFDQUQsTUFBQUEsYUFBYSxDQUFDaEgsR0FBRCxDQUFiLEdBQXFCK0csVUFBVSxDQUFDL0csR0FBRCxDQUEvQjtBQUNELEtBSEQsTUFHTztBQUNMa0gsTUFBQUEscUJBQXFCLEdBQUcsSUFBeEI7QUFDRDtBQUNGOztBQUNELE1BQUlELG1CQUFtQixJQUFJQyxxQkFBM0IsRUFBa0Q7QUFDaERILElBQUFBLFVBQVUsQ0FBQyxLQUFELENBQVYsR0FBb0JDLGFBQXBCO0FBQ0F4SCxJQUFBQSxNQUFNLENBQUNLLElBQVAsQ0FBWW1ILGFBQVosRUFBMkJ4RCxPQUEzQixDQUFtQ3hELEdBQUcsSUFBSTtBQUN4QyxhQUFPK0csVUFBVSxDQUFDL0csR0FBRCxDQUFqQjtBQUNELEtBRkQ7QUFHRDs7QUFDRCxTQUFPK0csVUFBUDtBQUNELENBdEJEOztBQXdCQTdJLFNBQVMsQ0FBQ3VCLFNBQVYsQ0FBb0J3RSxlQUFwQixHQUFzQyxZQUFZO0FBQ2hELE1BQUksT0FBTyxLQUFLM0YsU0FBWixLQUEwQixRQUE5QixFQUF3QztBQUN0QztBQUNEOztBQUNELE9BQUssTUFBTTBCLEdBQVgsSUFBa0IsS0FBSzFCLFNBQXZCLEVBQWtDO0FBQ2hDLFNBQUtBLFNBQUwsQ0FBZTBCLEdBQWYsSUFBc0I4Ryx5QkFBeUIsQ0FBQyxLQUFLeEksU0FBTCxDQUFlMEIsR0FBZixDQUFELENBQS9DO0FBQ0Q7QUFDRixDQVBELEMsQ0FTQTtBQUNBOzs7QUFDQTlCLFNBQVMsQ0FBQ3VCLFNBQVYsQ0FBb0JxRCxPQUFwQixHQUE4QixVQUFVcUUsT0FBTyxHQUFHLEVBQXBCLEVBQXdCO0FBQ3BELE1BQUksS0FBS3ZJLFdBQUwsQ0FBaUJ3RSxLQUFqQixLQUEyQixDQUEvQixFQUFrQztBQUNoQyxTQUFLekUsUUFBTCxHQUFnQjtBQUFFNEUsTUFBQUEsT0FBTyxFQUFFO0FBQVgsS0FBaEI7QUFDQSxXQUFPZixPQUFPLENBQUNDLE9BQVIsRUFBUDtBQUNEOztBQUNELFFBQU03RCxXQUFXLEdBQUdZLE1BQU0sQ0FBQ2lFLE1BQVAsQ0FBYyxFQUFkLEVBQWtCLEtBQUs3RSxXQUF2QixDQUFwQjs7QUFDQSxNQUFJLEtBQUtpQixJQUFULEVBQWU7QUFDYmpCLElBQUFBLFdBQVcsQ0FBQ2lCLElBQVosR0FBbUIsS0FBS0EsSUFBTCxDQUFVSyxHQUFWLENBQWNGLEdBQUcsSUFBSTtBQUN0QyxhQUFPQSxHQUFHLENBQUNGLEtBQUosQ0FBVSxHQUFWLEVBQWUsQ0FBZixDQUFQO0FBQ0QsS0FGa0IsQ0FBbkI7QUFHRDs7QUFDRCxNQUFJcUgsT0FBTyxDQUFDQyxFQUFaLEVBQWdCO0FBQ2R4SSxJQUFBQSxXQUFXLENBQUN3SSxFQUFaLEdBQWlCRCxPQUFPLENBQUNDLEVBQXpCO0FBQ0Q7O0FBQ0QsU0FBTyxLQUFLakosTUFBTCxDQUFZa0csUUFBWixDQUNKZ0QsSUFESSxDQUNDLEtBQUtoSixTQUROLEVBQ2lCLEtBQUtDLFNBRHRCLEVBQ2lDTSxXQURqQyxFQUM4QyxLQUFLUixJQURuRCxFQUVKc0UsSUFGSSxDQUVDYSxPQUFPLElBQUk7QUFDZixRQUFJLEtBQUtsRixTQUFMLEtBQW1CLE9BQW5CLElBQThCTyxXQUFXLENBQUMwSSxPQUFaLEtBQXdCLElBQTFELEVBQWdFO0FBQzlELFdBQUssSUFBSXRDLE1BQVQsSUFBbUJ6QixPQUFuQixFQUE0QjtBQUMxQixhQUFLbUQsbUJBQUwsQ0FBeUIxQixNQUF6QixFQUFpQyxLQUFLNUcsSUFBdEMsRUFBNEMsS0FBS0QsTUFBakQ7QUFDRDtBQUNGOztBQUVELFNBQUtBLE1BQUwsQ0FBWW9KLGVBQVosQ0FBNEJDLG1CQUE1QixDQUFnRCxLQUFLckosTUFBckQsRUFBNkRvRixPQUE3RDs7QUFFQSxRQUFJLEtBQUtuQixpQkFBVCxFQUE0QjtBQUMxQixXQUFLLElBQUlxRixDQUFULElBQWNsRSxPQUFkLEVBQXVCO0FBQ3JCa0UsUUFBQUEsQ0FBQyxDQUFDcEosU0FBRixHQUFjLEtBQUsrRCxpQkFBbkI7QUFDRDtBQUNGOztBQUNELFNBQUt6RCxRQUFMLEdBQWdCO0FBQUU0RSxNQUFBQSxPQUFPLEVBQUVBO0FBQVgsS0FBaEI7QUFDRCxHQWpCSSxDQUFQO0FBa0JELENBaENELEMsQ0FrQ0E7QUFDQTs7O0FBQ0FyRixTQUFTLENBQUN1QixTQUFWLENBQW9Cc0QsUUFBcEIsR0FBK0IsWUFBWTtBQUN6QyxNQUFJLENBQUMsS0FBSzFELE9BQVYsRUFBbUI7QUFDakI7QUFDRDs7QUFDRCxPQUFLVCxXQUFMLENBQWlCOEksS0FBakIsR0FBeUIsSUFBekI7QUFDQSxTQUFPLEtBQUs5SSxXQUFMLENBQWlCK0ksSUFBeEI7QUFDQSxTQUFPLEtBQUsvSSxXQUFMLENBQWlCd0UsS0FBeEI7QUFDQSxTQUFPLEtBQUtqRixNQUFMLENBQVlrRyxRQUFaLENBQXFCZ0QsSUFBckIsQ0FBMEIsS0FBS2hKLFNBQS9CLEVBQTBDLEtBQUtDLFNBQS9DLEVBQTBELEtBQUtNLFdBQS9ELEVBQTRFOEQsSUFBNUUsQ0FBaUZrRixDQUFDLElBQUk7QUFDM0YsU0FBS2pKLFFBQUwsQ0FBYytJLEtBQWQsR0FBc0JFLENBQXRCO0FBQ0QsR0FGTSxDQUFQO0FBR0QsQ0FWRCxDLENBWUE7OztBQUNBMUosU0FBUyxDQUFDdUIsU0FBVixDQUFvQm1ELGdCQUFwQixHQUF1QyxZQUFZO0FBQ2pELE1BQUksQ0FBQyxLQUFLdEQsVUFBVixFQUFzQjtBQUNwQjtBQUNEOztBQUNELFNBQU8sS0FBS25CLE1BQUwsQ0FBWWtHLFFBQVosQ0FDSkksVUFESSxHQUVKL0IsSUFGSSxDQUVDZ0MsZ0JBQWdCLElBQUlBLGdCQUFnQixDQUFDbUQsWUFBakIsQ0FBOEIsS0FBS3hKLFNBQW5DLENBRnJCLEVBR0pxRSxJQUhJLENBR0NvRixNQUFNLElBQUk7QUFDZCxVQUFNQyxhQUFhLEdBQUcsRUFBdEI7QUFDQSxVQUFNQyxTQUFTLEdBQUcsRUFBbEI7O0FBQ0EsU0FBSyxNQUFNNUcsS0FBWCxJQUFvQjBHLE1BQU0sQ0FBQy9HLE1BQTNCLEVBQW1DO0FBQ2pDLFVBQ0crRyxNQUFNLENBQUMvRyxNQUFQLENBQWNLLEtBQWQsRUFBcUI2RyxJQUFyQixJQUE2QkgsTUFBTSxDQUFDL0csTUFBUCxDQUFjSyxLQUFkLEVBQXFCNkcsSUFBckIsS0FBOEIsU0FBNUQsSUFDQ0gsTUFBTSxDQUFDL0csTUFBUCxDQUFjSyxLQUFkLEVBQXFCNkcsSUFBckIsSUFBNkJILE1BQU0sQ0FBQy9HLE1BQVAsQ0FBY0ssS0FBZCxFQUFxQjZHLElBQXJCLEtBQThCLE9BRjlELEVBR0U7QUFDQUYsUUFBQUEsYUFBYSxDQUFDOUMsSUFBZCxDQUFtQixDQUFDN0QsS0FBRCxDQUFuQjtBQUNBNEcsUUFBQUEsU0FBUyxDQUFDL0MsSUFBVixDQUFlN0QsS0FBZjtBQUNEO0FBQ0YsS0FYYSxDQVlkOzs7QUFDQSxTQUFLN0IsT0FBTCxHQUFlLENBQUMsR0FBRyxJQUFJbUIsR0FBSixDQUFRLENBQUMsR0FBRyxLQUFLbkIsT0FBVCxFQUFrQixHQUFHd0ksYUFBckIsQ0FBUixDQUFKLENBQWYsQ0FiYyxDQWNkOztBQUNBLFFBQUksS0FBS2xJLElBQVQsRUFBZTtBQUNiLFdBQUtBLElBQUwsR0FBWSxDQUFDLEdBQUcsSUFBSWEsR0FBSixDQUFRLENBQUMsR0FBRyxLQUFLYixJQUFULEVBQWUsR0FBR21JLFNBQWxCLENBQVIsQ0FBSixDQUFaO0FBQ0Q7QUFDRixHQXJCSSxDQUFQO0FBc0JELENBMUJELEMsQ0E0QkE7OztBQUNBOUosU0FBUyxDQUFDdUIsU0FBVixDQUFvQm9ELGlCQUFwQixHQUF3QyxZQUFZO0FBQ2xELE1BQUksQ0FBQyxLQUFLakMsV0FBVixFQUF1QjtBQUNyQjtBQUNEOztBQUNELE1BQUksS0FBS2YsSUFBVCxFQUFlO0FBQ2IsU0FBS0EsSUFBTCxHQUFZLEtBQUtBLElBQUwsQ0FBVUUsTUFBVixDQUFpQmMsQ0FBQyxJQUFJLENBQUMsS0FBS0QsV0FBTCxDQUFpQmEsUUFBakIsQ0FBMEJaLENBQTFCLENBQXZCLENBQVo7QUFDQTtBQUNEOztBQUNELFNBQU8sS0FBSzFDLE1BQUwsQ0FBWWtHLFFBQVosQ0FDSkksVUFESSxHQUVKL0IsSUFGSSxDQUVDZ0MsZ0JBQWdCLElBQUlBLGdCQUFnQixDQUFDbUQsWUFBakIsQ0FBOEIsS0FBS3hKLFNBQW5DLENBRnJCLEVBR0pxRSxJQUhJLENBR0NvRixNQUFNLElBQUk7QUFDZCxVQUFNL0csTUFBTSxHQUFHdkIsTUFBTSxDQUFDSyxJQUFQLENBQVlpSSxNQUFNLENBQUMvRyxNQUFuQixDQUFmO0FBQ0EsU0FBS2xCLElBQUwsR0FBWWtCLE1BQU0sQ0FBQ2hCLE1BQVAsQ0FBY2MsQ0FBQyxJQUFJLENBQUMsS0FBS0QsV0FBTCxDQUFpQmEsUUFBakIsQ0FBMEJaLENBQTFCLENBQXBCLENBQVo7QUFDRCxHQU5JLENBQVA7QUFPRCxDQWZELEMsQ0FpQkE7OztBQUNBM0MsU0FBUyxDQUFDdUIsU0FBVixDQUFvQnVELGFBQXBCLEdBQW9DLFlBQVk7QUFDOUMsTUFBSSxLQUFLekQsT0FBTCxDQUFhVSxNQUFiLElBQXVCLENBQTNCLEVBQThCO0FBQzVCO0FBQ0Q7O0FBRUQsTUFBSWlJLFlBQVksR0FBR0MsV0FBVyxDQUM1QixLQUFLaEssTUFEdUIsRUFFNUIsS0FBS0MsSUFGdUIsRUFHNUIsS0FBS08sUUFIdUIsRUFJNUIsS0FBS1ksT0FBTCxDQUFhLENBQWIsQ0FKNEIsRUFLNUIsS0FBS2hCLFdBTHVCLENBQTlCOztBQU9BLE1BQUkySixZQUFZLENBQUN4RixJQUFqQixFQUF1QjtBQUNyQixXQUFPd0YsWUFBWSxDQUFDeEYsSUFBYixDQUFrQjBGLFdBQVcsSUFBSTtBQUN0QyxXQUFLekosUUFBTCxHQUFnQnlKLFdBQWhCO0FBQ0EsV0FBSzdJLE9BQUwsR0FBZSxLQUFLQSxPQUFMLENBQWFZLEtBQWIsQ0FBbUIsQ0FBbkIsQ0FBZjtBQUNBLGFBQU8sS0FBSzZDLGFBQUwsRUFBUDtBQUNELEtBSk0sQ0FBUDtBQUtELEdBTkQsTUFNTyxJQUFJLEtBQUt6RCxPQUFMLENBQWFVLE1BQWIsR0FBc0IsQ0FBMUIsRUFBNkI7QUFDbEMsU0FBS1YsT0FBTCxHQUFlLEtBQUtBLE9BQUwsQ0FBYVksS0FBYixDQUFtQixDQUFuQixDQUFmO0FBQ0EsV0FBTyxLQUFLNkMsYUFBTCxFQUFQO0FBQ0Q7O0FBRUQsU0FBT2tGLFlBQVA7QUFDRCxDQXhCRCxDLENBMEJBOzs7QUFDQWhLLFNBQVMsQ0FBQ3VCLFNBQVYsQ0FBb0J3RCxtQkFBcEIsR0FBMEMsWUFBWTtBQUNwRCxNQUFJLENBQUMsS0FBS3RFLFFBQVYsRUFBb0I7QUFDbEI7QUFDRDs7QUFDRCxNQUFJLENBQUMsS0FBS0YsWUFBVixFQUF3QjtBQUN0QjtBQUNELEdBTm1ELENBT3BEOzs7QUFDQSxRQUFNNEosZ0JBQWdCLEdBQUd0SyxRQUFRLENBQUN1SyxhQUFULENBQ3ZCLEtBQUtqSyxTQURrQixFQUV2Qk4sUUFBUSxDQUFDd0ssS0FBVCxDQUFlQyxTQUZRLEVBR3ZCLEtBQUtySyxNQUFMLENBQVlzSyxhQUhXLENBQXpCOztBQUtBLE1BQUksQ0FBQ0osZ0JBQUwsRUFBdUI7QUFDckIsV0FBTzdGLE9BQU8sQ0FBQ0MsT0FBUixFQUFQO0FBQ0QsR0FmbUQsQ0FnQnBEOzs7QUFDQSxNQUFJLEtBQUs3RCxXQUFMLENBQWlCOEosUUFBakIsSUFBNkIsS0FBSzlKLFdBQUwsQ0FBaUIrSixRQUFsRCxFQUE0RDtBQUMxRCxXQUFPbkcsT0FBTyxDQUFDQyxPQUFSLEVBQVA7QUFDRDs7QUFFRCxRQUFNc0QsSUFBSSxHQUFHdkcsTUFBTSxDQUFDaUUsTUFBUCxDQUFjLEVBQWQsRUFBa0IsS0FBS2xGLFdBQXZCLENBQWI7QUFDQXdILEVBQUFBLElBQUksQ0FBQ1YsS0FBTCxHQUFhLEtBQUsvRyxTQUFsQjtBQUNBLFFBQU1zSyxVQUFVLEdBQUcsSUFBSTlLLEtBQUssQ0FBQytLLEtBQVYsQ0FBZ0IsS0FBS3hLLFNBQXJCLENBQW5CO0FBQ0F1SyxFQUFBQSxVQUFVLENBQUNFLFFBQVgsQ0FBb0IvQyxJQUFwQixFQXhCb0QsQ0F5QnBEOztBQUNBLFNBQU9oSSxRQUFRLENBQ1pnTCx3QkFESSxDQUVIaEwsUUFBUSxDQUFDd0ssS0FBVCxDQUFlQyxTQUZaLEVBR0gsS0FBS3BLLElBSEYsRUFJSCxLQUFLQyxTQUpGLEVBS0gsS0FBS00sUUFBTCxDQUFjNEUsT0FMWCxFQU1ILEtBQUtwRixNQU5GLEVBT0h5SyxVQVBHLEVBUUgsS0FBS2xLLE9BUkYsRUFVSmdFLElBVkksQ0FVQ2EsT0FBTyxJQUFJO0FBQ2Y7QUFDQSxRQUFJLEtBQUtuQixpQkFBVCxFQUE0QjtBQUMxQixXQUFLekQsUUFBTCxDQUFjNEUsT0FBZCxHQUF3QkEsT0FBTyxDQUFDckQsR0FBUixDQUFZOEksTUFBTSxJQUFJO0FBQzVDLFlBQUlBLE1BQU0sWUFBWWxMLEtBQUssQ0FBQzBCLE1BQTVCLEVBQW9DO0FBQ2xDd0osVUFBQUEsTUFBTSxHQUFHQSxNQUFNLENBQUNDLE1BQVAsRUFBVDtBQUNEOztBQUNERCxRQUFBQSxNQUFNLENBQUMzSyxTQUFQLEdBQW1CLEtBQUsrRCxpQkFBeEI7QUFDQSxlQUFPNEcsTUFBUDtBQUNELE9BTnVCLENBQXhCO0FBT0QsS0FSRCxNQVFPO0FBQ0wsV0FBS3JLLFFBQUwsQ0FBYzRFLE9BQWQsR0FBd0JBLE9BQXhCO0FBQ0Q7QUFDRixHQXZCSSxDQUFQO0FBd0JELENBbERELEMsQ0FvREE7QUFDQTtBQUNBOzs7QUFDQSxTQUFTNEUsV0FBVCxDQUFxQmhLLE1BQXJCLEVBQTZCQyxJQUE3QixFQUFtQ08sUUFBbkMsRUFBNkNpRCxJQUE3QyxFQUFtRHJELFdBQVcsR0FBRyxFQUFqRSxFQUFxRTtBQUNuRSxNQUFJMkssUUFBUSxHQUFHQyxZQUFZLENBQUN4SyxRQUFRLENBQUM0RSxPQUFWLEVBQW1CM0IsSUFBbkIsQ0FBM0I7O0FBQ0EsTUFBSXNILFFBQVEsQ0FBQ2pKLE1BQVQsSUFBbUIsQ0FBdkIsRUFBMEI7QUFDeEIsV0FBT3RCLFFBQVA7QUFDRDs7QUFDRCxRQUFNeUssWUFBWSxHQUFHLEVBQXJCOztBQUNBLE9BQUssSUFBSUMsT0FBVCxJQUFvQkgsUUFBcEIsRUFBOEI7QUFDNUIsUUFBSSxDQUFDRyxPQUFMLEVBQWM7QUFDWjtBQUNEOztBQUNELFVBQU1oTCxTQUFTLEdBQUdnTCxPQUFPLENBQUNoTCxTQUExQixDQUo0QixDQUs1Qjs7QUFDQSxRQUFJQSxTQUFKLEVBQWU7QUFDYitLLE1BQUFBLFlBQVksQ0FBQy9LLFNBQUQsQ0FBWixHQUEwQitLLFlBQVksQ0FBQy9LLFNBQUQsQ0FBWixJQUEyQixJQUFJcUMsR0FBSixFQUFyRDtBQUNBMEksTUFBQUEsWUFBWSxDQUFDL0ssU0FBRCxDQUFaLENBQXdCaUwsR0FBeEIsQ0FBNEJELE9BQU8sQ0FBQ2xLLFFBQXBDO0FBQ0Q7QUFDRjs7QUFDRCxRQUFNb0ssa0JBQWtCLEdBQUcsRUFBM0I7O0FBQ0EsTUFBSWhMLFdBQVcsQ0FBQ3NCLElBQWhCLEVBQXNCO0FBQ3BCLFVBQU1BLElBQUksR0FBRyxJQUFJYSxHQUFKLENBQVFuQyxXQUFXLENBQUNzQixJQUFaLENBQWlCQyxLQUFqQixDQUF1QixHQUF2QixDQUFSLENBQWI7QUFDQSxVQUFNMEosTUFBTSxHQUFHaEosS0FBSyxDQUFDQyxJQUFOLENBQVdaLElBQVgsRUFBaUJxQixNQUFqQixDQUF3QixDQUFDdUksR0FBRCxFQUFNekosR0FBTixLQUFjO0FBQ25ELFlBQU0wSixPQUFPLEdBQUcxSixHQUFHLENBQUNGLEtBQUosQ0FBVSxHQUFWLENBQWhCO0FBQ0EsVUFBSTZKLENBQUMsR0FBRyxDQUFSOztBQUNBLFdBQUtBLENBQUwsRUFBUUEsQ0FBQyxHQUFHL0gsSUFBSSxDQUFDM0IsTUFBakIsRUFBeUIwSixDQUFDLEVBQTFCLEVBQThCO0FBQzVCLFlBQUkvSCxJQUFJLENBQUMrSCxDQUFELENBQUosSUFBV0QsT0FBTyxDQUFDQyxDQUFELENBQXRCLEVBQTJCO0FBQ3pCLGlCQUFPRixHQUFQO0FBQ0Q7QUFDRjs7QUFDRCxVQUFJRSxDQUFDLEdBQUdELE9BQU8sQ0FBQ3pKLE1BQWhCLEVBQXdCO0FBQ3RCd0osUUFBQUEsR0FBRyxDQUFDSCxHQUFKLENBQVFJLE9BQU8sQ0FBQ0MsQ0FBRCxDQUFmO0FBQ0Q7O0FBQ0QsYUFBT0YsR0FBUDtBQUNELEtBWmMsRUFZWixJQUFJL0ksR0FBSixFQVpZLENBQWY7O0FBYUEsUUFBSThJLE1BQU0sQ0FBQ0ksSUFBUCxHQUFjLENBQWxCLEVBQXFCO0FBQ25CTCxNQUFBQSxrQkFBa0IsQ0FBQzFKLElBQW5CLEdBQTBCVyxLQUFLLENBQUNDLElBQU4sQ0FBVytJLE1BQVgsRUFBbUJuSixJQUFuQixDQUF3QixHQUF4QixDQUExQjtBQUNEO0FBQ0Y7O0FBRUQsTUFBSTlCLFdBQVcsQ0FBQ3NMLHFCQUFoQixFQUF1QztBQUNyQ04sSUFBQUEsa0JBQWtCLENBQUM5RCxjQUFuQixHQUFvQ2xILFdBQVcsQ0FBQ3NMLHFCQUFoRDtBQUNBTixJQUFBQSxrQkFBa0IsQ0FBQ00scUJBQW5CLEdBQTJDdEwsV0FBVyxDQUFDc0wscUJBQXZEO0FBQ0QsR0FIRCxNQUdPLElBQUl0TCxXQUFXLENBQUNrSCxjQUFoQixFQUFnQztBQUNyQzhELElBQUFBLGtCQUFrQixDQUFDOUQsY0FBbkIsR0FBb0NsSCxXQUFXLENBQUNrSCxjQUFoRDtBQUNEOztBQUVELFFBQU1xRSxhQUFhLEdBQUd0SyxNQUFNLENBQUNLLElBQVAsQ0FBWXVKLFlBQVosRUFBMEJsSixHQUExQixDQUE4QjdCLFNBQVMsSUFBSTtBQUMvRCxVQUFNMEwsU0FBUyxHQUFHdkosS0FBSyxDQUFDQyxJQUFOLENBQVcySSxZQUFZLENBQUMvSyxTQUFELENBQXZCLENBQWxCO0FBQ0EsUUFBSWdILEtBQUo7O0FBQ0EsUUFBSTBFLFNBQVMsQ0FBQzlKLE1BQVYsS0FBcUIsQ0FBekIsRUFBNEI7QUFDMUJvRixNQUFBQSxLQUFLLEdBQUc7QUFBRWxHLFFBQUFBLFFBQVEsRUFBRTRLLFNBQVMsQ0FBQyxDQUFEO0FBQXJCLE9BQVI7QUFDRCxLQUZELE1BRU87QUFDTDFFLE1BQUFBLEtBQUssR0FBRztBQUFFbEcsUUFBQUEsUUFBUSxFQUFFO0FBQUU2SyxVQUFBQSxHQUFHLEVBQUVEO0FBQVA7QUFBWixPQUFSO0FBQ0Q7O0FBQ0QsUUFBSXpHLEtBQUssR0FBRyxJQUFJcEYsU0FBSixDQUFjQyxNQUFkLEVBQXNCQyxJQUF0QixFQUE0QkMsU0FBNUIsRUFBdUNnSCxLQUF2QyxFQUE4Q2tFLGtCQUE5QyxDQUFaO0FBQ0EsV0FBT2pHLEtBQUssQ0FBQ2hCLE9BQU4sQ0FBYztBQUFFOEUsTUFBQUEsRUFBRSxFQUFFO0FBQU4sS0FBZCxFQUE2QjFFLElBQTdCLENBQWtDYSxPQUFPLElBQUk7QUFDbERBLE1BQUFBLE9BQU8sQ0FBQ2xGLFNBQVIsR0FBb0JBLFNBQXBCO0FBQ0EsYUFBT21FLE9BQU8sQ0FBQ0MsT0FBUixDQUFnQmMsT0FBaEIsQ0FBUDtBQUNELEtBSE0sQ0FBUDtBQUlELEdBYnFCLENBQXRCLENBN0NtRSxDQTREbkU7O0FBQ0EsU0FBT2YsT0FBTyxDQUFDeUgsR0FBUixDQUFZSCxhQUFaLEVBQTJCcEgsSUFBM0IsQ0FBZ0N3SCxTQUFTLElBQUk7QUFDbEQsUUFBSUMsT0FBTyxHQUFHRCxTQUFTLENBQUNoSixNQUFWLENBQWlCLENBQUNpSixPQUFELEVBQVVDLGVBQVYsS0FBOEI7QUFDM0QsV0FBSyxJQUFJQyxHQUFULElBQWdCRCxlQUFlLENBQUM3RyxPQUFoQyxFQUF5QztBQUN2QzhHLFFBQUFBLEdBQUcsQ0FBQ25MLE1BQUosR0FBYSxRQUFiO0FBQ0FtTCxRQUFBQSxHQUFHLENBQUNoTSxTQUFKLEdBQWdCK0wsZUFBZSxDQUFDL0wsU0FBaEM7O0FBRUEsWUFBSWdNLEdBQUcsQ0FBQ2hNLFNBQUosSUFBaUIsT0FBakIsSUFBNEIsQ0FBQ0QsSUFBSSxDQUFDUyxRQUF0QyxFQUFnRDtBQUM5QyxpQkFBT3dMLEdBQUcsQ0FBQ0MsWUFBWDtBQUNBLGlCQUFPRCxHQUFHLENBQUN6RCxRQUFYO0FBQ0Q7O0FBQ0R1RCxRQUFBQSxPQUFPLENBQUNFLEdBQUcsQ0FBQ2xMLFFBQUwsQ0FBUCxHQUF3QmtMLEdBQXhCO0FBQ0Q7O0FBQ0QsYUFBT0YsT0FBUDtBQUNELEtBWmEsRUFZWCxFQVpXLENBQWQ7QUFjQSxRQUFJSSxJQUFJLEdBQUc7QUFDVGhILE1BQUFBLE9BQU8sRUFBRWlILGVBQWUsQ0FBQzdMLFFBQVEsQ0FBQzRFLE9BQVYsRUFBbUIzQixJQUFuQixFQUF5QnVJLE9BQXpCO0FBRGYsS0FBWDs7QUFHQSxRQUFJeEwsUUFBUSxDQUFDK0ksS0FBYixFQUFvQjtBQUNsQjZDLE1BQUFBLElBQUksQ0FBQzdDLEtBQUwsR0FBYS9JLFFBQVEsQ0FBQytJLEtBQXRCO0FBQ0Q7O0FBQ0QsV0FBTzZDLElBQVA7QUFDRCxHQXRCTSxDQUFQO0FBdUJELEMsQ0FFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQSxTQUFTcEIsWUFBVCxDQUFzQkgsTUFBdEIsRUFBOEJwSCxJQUE5QixFQUFvQztBQUNsQyxNQUFJb0gsTUFBTSxZQUFZeEksS0FBdEIsRUFBNkI7QUFDM0IsUUFBSWlLLE1BQU0sR0FBRyxFQUFiOztBQUNBLFNBQUssSUFBSUMsQ0FBVCxJQUFjMUIsTUFBZCxFQUFzQjtBQUNwQnlCLE1BQUFBLE1BQU0sR0FBR0EsTUFBTSxDQUFDbEssTUFBUCxDQUFjNEksWUFBWSxDQUFDdUIsQ0FBRCxFQUFJOUksSUFBSixDQUExQixDQUFUO0FBQ0Q7O0FBQ0QsV0FBTzZJLE1BQVA7QUFDRDs7QUFFRCxNQUFJLE9BQU96QixNQUFQLEtBQWtCLFFBQWxCLElBQThCLENBQUNBLE1BQW5DLEVBQTJDO0FBQ3pDLFdBQU8sRUFBUDtBQUNEOztBQUVELE1BQUlwSCxJQUFJLENBQUMzQixNQUFMLElBQWUsQ0FBbkIsRUFBc0I7QUFDcEIsUUFBSStJLE1BQU0sS0FBSyxJQUFYLElBQW1CQSxNQUFNLENBQUM5SixNQUFQLElBQWlCLFNBQXhDLEVBQW1EO0FBQ2pELGFBQU8sQ0FBQzhKLE1BQUQsQ0FBUDtBQUNEOztBQUNELFdBQU8sRUFBUDtBQUNEOztBQUVELE1BQUkyQixTQUFTLEdBQUczQixNQUFNLENBQUNwSCxJQUFJLENBQUMsQ0FBRCxDQUFMLENBQXRCOztBQUNBLE1BQUksQ0FBQytJLFNBQUwsRUFBZ0I7QUFDZCxXQUFPLEVBQVA7QUFDRDs7QUFDRCxTQUFPeEIsWUFBWSxDQUFDd0IsU0FBRCxFQUFZL0ksSUFBSSxDQUFDekIsS0FBTCxDQUFXLENBQVgsQ0FBWixDQUFuQjtBQUNELEMsQ0FFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNBLFNBQVNxSyxlQUFULENBQXlCeEIsTUFBekIsRUFBaUNwSCxJQUFqQyxFQUF1Q3VJLE9BQXZDLEVBQWdEO0FBQzlDLE1BQUluQixNQUFNLFlBQVl4SSxLQUF0QixFQUE2QjtBQUMzQixXQUFPd0ksTUFBTSxDQUNWOUksR0FESSxDQUNBbUssR0FBRyxJQUFJRyxlQUFlLENBQUNILEdBQUQsRUFBTXpJLElBQU4sRUFBWXVJLE9BQVosQ0FEdEIsRUFFSnBLLE1BRkksQ0FFR3NLLEdBQUcsSUFBSSxPQUFPQSxHQUFQLEtBQWUsV0FGekIsQ0FBUDtBQUdEOztBQUVELE1BQUksT0FBT3JCLE1BQVAsS0FBa0IsUUFBbEIsSUFBOEIsQ0FBQ0EsTUFBbkMsRUFBMkM7QUFDekMsV0FBT0EsTUFBUDtBQUNEOztBQUVELE1BQUlwSCxJQUFJLENBQUMzQixNQUFMLEtBQWdCLENBQXBCLEVBQXVCO0FBQ3JCLFFBQUkrSSxNQUFNLElBQUlBLE1BQU0sQ0FBQzlKLE1BQVAsS0FBa0IsU0FBaEMsRUFBMkM7QUFDekMsYUFBT2lMLE9BQU8sQ0FBQ25CLE1BQU0sQ0FBQzdKLFFBQVIsQ0FBZDtBQUNEOztBQUNELFdBQU82SixNQUFQO0FBQ0Q7O0FBRUQsTUFBSTJCLFNBQVMsR0FBRzNCLE1BQU0sQ0FBQ3BILElBQUksQ0FBQyxDQUFELENBQUwsQ0FBdEI7O0FBQ0EsTUFBSSxDQUFDK0ksU0FBTCxFQUFnQjtBQUNkLFdBQU8zQixNQUFQO0FBQ0Q7O0FBQ0QsTUFBSTRCLE1BQU0sR0FBR0osZUFBZSxDQUFDRyxTQUFELEVBQVkvSSxJQUFJLENBQUN6QixLQUFMLENBQVcsQ0FBWCxDQUFaLEVBQTJCZ0ssT0FBM0IsQ0FBNUI7QUFDQSxNQUFJTSxNQUFNLEdBQUcsRUFBYjs7QUFDQSxPQUFLLElBQUl6SyxHQUFULElBQWdCZ0osTUFBaEIsRUFBd0I7QUFDdEIsUUFBSWhKLEdBQUcsSUFBSTRCLElBQUksQ0FBQyxDQUFELENBQWYsRUFBb0I7QUFDbEI2SSxNQUFBQSxNQUFNLENBQUN6SyxHQUFELENBQU4sR0FBYzRLLE1BQWQ7QUFDRCxLQUZELE1BRU87QUFDTEgsTUFBQUEsTUFBTSxDQUFDekssR0FBRCxDQUFOLEdBQWNnSixNQUFNLENBQUNoSixHQUFELENBQXBCO0FBQ0Q7QUFDRjs7QUFDRCxTQUFPeUssTUFBUDtBQUNELEMsQ0FFRDtBQUNBOzs7QUFDQSxTQUFTdEYsaUJBQVQsQ0FBMkIwRixJQUEzQixFQUFpQzdLLEdBQWpDLEVBQXNDO0FBQ3BDLE1BQUksT0FBTzZLLElBQVAsS0FBZ0IsUUFBcEIsRUFBOEI7QUFDNUI7QUFDRDs7QUFDRCxNQUFJQSxJQUFJLFlBQVlySyxLQUFwQixFQUEyQjtBQUN6QixTQUFLLElBQUlzSyxJQUFULElBQWlCRCxJQUFqQixFQUF1QjtBQUNyQixZQUFNSixNQUFNLEdBQUd0RixpQkFBaUIsQ0FBQzJGLElBQUQsRUFBTzlLLEdBQVAsQ0FBaEM7O0FBQ0EsVUFBSXlLLE1BQUosRUFBWTtBQUNWLGVBQU9BLE1BQVA7QUFDRDtBQUNGO0FBQ0Y7O0FBQ0QsTUFBSUksSUFBSSxJQUFJQSxJQUFJLENBQUM3SyxHQUFELENBQWhCLEVBQXVCO0FBQ3JCLFdBQU82SyxJQUFQO0FBQ0Q7O0FBQ0QsT0FBSyxJQUFJRSxNQUFULElBQW1CRixJQUFuQixFQUF5QjtBQUN2QixVQUFNSixNQUFNLEdBQUd0RixpQkFBaUIsQ0FBQzBGLElBQUksQ0FBQ0UsTUFBRCxDQUFMLEVBQWUvSyxHQUFmLENBQWhDOztBQUNBLFFBQUl5SyxNQUFKLEVBQVk7QUFDVixhQUFPQSxNQUFQO0FBQ0Q7QUFDRjtBQUNGOztBQUVETyxNQUFNLENBQUNDLE9BQVAsR0FBaUIvTSxTQUFqQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEFuIG9iamVjdCB0aGF0IGVuY2Fwc3VsYXRlcyBldmVyeXRoaW5nIHdlIG5lZWQgdG8gcnVuIGEgJ2ZpbmQnXG4vLyBvcGVyYXRpb24sIGVuY29kZWQgaW4gdGhlIFJFU1QgQVBJIGZvcm1hdC5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmNvbnN0IHRyaWdnZXJzID0gcmVxdWlyZSgnLi90cmlnZ2VycycpO1xuY29uc3QgeyBjb250aW51ZVdoaWxlIH0gPSByZXF1aXJlKCdwYXJzZS9saWIvbm9kZS9wcm9taXNlVXRpbHMnKTtcbmNvbnN0IEFsd2F5c1NlbGVjdGVkS2V5cyA9IFsnb2JqZWN0SWQnLCAnY3JlYXRlZEF0JywgJ3VwZGF0ZWRBdCcsICdBQ0wnXTtcbi8vIHJlc3RPcHRpb25zIGNhbiBpbmNsdWRlOlxuLy8gICBza2lwXG4vLyAgIGxpbWl0XG4vLyAgIG9yZGVyXG4vLyAgIGNvdW50XG4vLyAgIGluY2x1ZGVcbi8vICAga2V5c1xuLy8gICBleGNsdWRlS2V5c1xuLy8gICByZWRpcmVjdENsYXNzTmFtZUZvcktleVxuLy8gICByZWFkUHJlZmVyZW5jZVxuLy8gICBpbmNsdWRlUmVhZFByZWZlcmVuY2Vcbi8vICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZVxuZnVuY3Rpb24gUmVzdFF1ZXJ5KFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgcmVzdFdoZXJlID0ge30sXG4gIHJlc3RPcHRpb25zID0ge30sXG4gIGNsaWVudFNESyxcbiAgcnVuQWZ0ZXJGaW5kID0gdHJ1ZSxcbiAgY29udGV4dFxuKSB7XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmF1dGggPSBhdXRoO1xuICB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgdGhpcy5yZXN0V2hlcmUgPSByZXN0V2hlcmU7XG4gIHRoaXMucmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucztcbiAgdGhpcy5jbGllbnRTREsgPSBjbGllbnRTREs7XG4gIHRoaXMucnVuQWZ0ZXJGaW5kID0gcnVuQWZ0ZXJGaW5kO1xuICB0aGlzLnJlc3BvbnNlID0gbnVsbDtcbiAgdGhpcy5maW5kT3B0aW9ucyA9IHt9O1xuICB0aGlzLmNvbnRleHQgPSBjb250ZXh0IHx8IHt9O1xuXG4gIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09ICdfU2Vzc2lvbicpIHtcbiAgICAgIGlmICghdGhpcy5hdXRoLnVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgICAgfVxuICAgICAgdGhpcy5yZXN0V2hlcmUgPSB7XG4gICAgICAgICRhbmQ6IFtcbiAgICAgICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgdGhpcy5kb0NvdW50ID0gZmFsc2U7XG4gIHRoaXMuaW5jbHVkZUFsbCA9IGZhbHNlO1xuXG4gIC8vIFRoZSBmb3JtYXQgZm9yIHRoaXMuaW5jbHVkZSBpcyBub3QgdGhlIHNhbWUgYXMgdGhlIGZvcm1hdCBmb3IgdGhlXG4gIC8vIGluY2x1ZGUgb3B0aW9uIC0gaXQncyB0aGUgcGF0aHMgd2Ugc2hvdWxkIGluY2x1ZGUsIGluIG9yZGVyLFxuICAvLyBzdG9yZWQgYXMgYXJyYXlzLCB0YWtpbmcgaW50byBhY2NvdW50IHRoYXQgd2UgbmVlZCB0byBpbmNsdWRlIGZvb1xuICAvLyBiZWZvcmUgaW5jbHVkaW5nIGZvby5iYXIuIEFsc28gaXQgc2hvdWxkIGRlZHVwZS5cbiAgLy8gRm9yIGV4YW1wbGUsIHBhc3NpbmcgYW4gYXJnIG9mIGluY2x1ZGU9Zm9vLmJhcixmb28uYmF6IGNvdWxkIGxlYWQgdG9cbiAgLy8gdGhpcy5pbmNsdWRlID0gW1snZm9vJ10sIFsnZm9vJywgJ2JheiddLCBbJ2ZvbycsICdiYXInXV1cbiAgdGhpcy5pbmNsdWRlID0gW107XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gU2VlIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvMzE4NVxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAna2V5cycpKSB7XG4gICAgY29uc3Qga2V5c0ZvckluY2x1ZGUgPSByZXN0T3B0aW9ucy5rZXlzXG4gICAgICAuc3BsaXQoJywnKVxuICAgICAgLmZpbHRlcihrZXkgPT4ge1xuICAgICAgICAvLyBBdCBsZWFzdCAyIGNvbXBvbmVudHNcbiAgICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpLmxlbmd0aCA+IDE7XG4gICAgICB9KVxuICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAvLyBTbGljZSB0aGUgbGFzdCBjb21wb25lbnQgKGEuYi5jIC0+IGEuYilcbiAgICAgICAgLy8gT3RoZXJ3aXNlIHdlJ2xsIGluY2x1ZGUgb25lIGxldmVsIHRvbyBtdWNoLlxuICAgICAgICByZXR1cm4ga2V5LnNsaWNlKDAsIGtleS5sYXN0SW5kZXhPZignLicpKTtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCcpO1xuXG4gICAgLy8gQ29uY2F0IHRoZSBwb3NzaWJseSBwcmVzZW50IGluY2x1ZGUgc3RyaW5nIHdpdGggdGhlIG9uZSBmcm9tIHRoZSBrZXlzXG4gICAgLy8gRGVkdXAgLyBzb3J0aW5nIGlzIGhhbmRsZSBpbiAnaW5jbHVkZScgY2FzZS5cbiAgICBpZiAoa2V5c0ZvckluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKCFyZXN0T3B0aW9ucy5pbmNsdWRlIHx8IHJlc3RPcHRpb25zLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSArPSAnLCcgKyBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmb3IgKHZhciBvcHRpb24gaW4gcmVzdE9wdGlvbnMpIHtcbiAgICBzd2l0Y2ggKG9wdGlvbikge1xuICAgICAgY2FzZSAna2V5cyc6IHtcbiAgICAgICAgY29uc3Qga2V5cyA9IHJlc3RPcHRpb25zLmtleXNcbiAgICAgICAgICAuc3BsaXQoJywnKVxuICAgICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5sZW5ndGggPiAwKVxuICAgICAgICAgIC5jb25jYXQoQWx3YXlzU2VsZWN0ZWRLZXlzKTtcbiAgICAgICAgdGhpcy5rZXlzID0gQXJyYXkuZnJvbShuZXcgU2V0KGtleXMpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdleGNsdWRlS2V5cyc6IHtcbiAgICAgICAgY29uc3QgZXhjbHVkZSA9IHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzXG4gICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAuZmlsdGVyKGsgPT4gQWx3YXlzU2VsZWN0ZWRLZXlzLmluZGV4T2YoaykgPCAwKTtcbiAgICAgICAgdGhpcy5leGNsdWRlS2V5cyA9IEFycmF5LmZyb20obmV3IFNldChleGNsdWRlKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICB0aGlzLmRvQ291bnQgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGVBbGwnOlxuICAgICAgICB0aGlzLmluY2x1ZGVBbGwgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2V4cGxhaW4nOlxuICAgICAgY2FzZSAnaGludCc6XG4gICAgICBjYXNlICdkaXN0aW5jdCc6XG4gICAgICBjYXNlICdwaXBlbGluZSc6XG4gICAgICBjYXNlICdza2lwJzpcbiAgICAgIGNhc2UgJ2xpbWl0JzpcbiAgICAgIGNhc2UgJ3JlYWRQcmVmZXJlbmNlJzpcbiAgICAgICAgdGhpcy5maW5kT3B0aW9uc1tvcHRpb25dID0gcmVzdE9wdGlvbnNbb3B0aW9uXTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdvcmRlcic6XG4gICAgICAgIHZhciBmaWVsZHMgPSByZXN0T3B0aW9ucy5vcmRlci5zcGxpdCgnLCcpO1xuICAgICAgICB0aGlzLmZpbmRPcHRpb25zLnNvcnQgPSBmaWVsZHMucmVkdWNlKChzb3J0TWFwLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGZpZWxkID0gZmllbGQudHJpbSgpO1xuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJyRzY29yZScpIHtcbiAgICAgICAgICAgIHNvcnRNYXAuc2NvcmUgPSB7ICRtZXRhOiAndGV4dFNjb3JlJyB9O1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmllbGRbMF0gPT0gJy0nKSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkLnNsaWNlKDEpXSA9IC0xO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkXSA9IDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBzb3J0TWFwO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZSc6IHtcbiAgICAgICAgY29uc3QgcGF0aHMgPSByZXN0T3B0aW9ucy5pbmNsdWRlLnNwbGl0KCcsJyk7XG4gICAgICAgIGlmIChwYXRocy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICAvLyBMb2FkIHRoZSBleGlzdGluZyBpbmNsdWRlcyAoZnJvbSBrZXlzKVxuICAgICAgICBjb25zdCBwYXRoU2V0ID0gcGF0aHMucmVkdWNlKChtZW1vLCBwYXRoKSA9PiB7XG4gICAgICAgICAgLy8gU3BsaXQgZWFjaCBwYXRocyBvbiAuIChhLmIuYyAtPiBbYSxiLGNdKVxuICAgICAgICAgIC8vIHJlZHVjZSB0byBjcmVhdGUgYWxsIHBhdGhzXG4gICAgICAgICAgLy8gKFthLGIsY10gLT4ge2E6IHRydWUsICdhLmInOiB0cnVlLCAnYS5iLmMnOiB0cnVlfSlcbiAgICAgICAgICByZXR1cm4gcGF0aC5zcGxpdCgnLicpLnJlZHVjZSgobWVtbywgcGF0aCwgaW5kZXgsIHBhcnRzKSA9PiB7XG4gICAgICAgICAgICBtZW1vW3BhcnRzLnNsaWNlKDAsIGluZGV4ICsgMSkuam9pbignLicpXSA9IHRydWU7XG4gICAgICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgICAgICB9LCBtZW1vKTtcbiAgICAgICAgfSwge30pO1xuXG4gICAgICAgIHRoaXMuaW5jbHVkZSA9IE9iamVjdC5rZXlzKHBhdGhTZXQpXG4gICAgICAgICAgLm1hcChzID0+IHtcbiAgICAgICAgICAgIHJldHVybiBzLnNwbGl0KCcuJyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGg7IC8vIFNvcnQgYnkgbnVtYmVyIG9mIGNvbXBvbmVudHNcbiAgICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdyZWRpcmVjdENsYXNzTmFtZUZvcktleSc6XG4gICAgICAgIHRoaXMucmVkaXJlY3RLZXkgPSByZXN0T3B0aW9ucy5yZWRpcmVjdENsYXNzTmFtZUZvcktleTtcbiAgICAgICAgdGhpcy5yZWRpcmVjdENsYXNzTmFtZSA9IG51bGw7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZVJlYWRQcmVmZXJlbmNlJzpcbiAgICAgIGNhc2UgJ3N1YnF1ZXJ5UmVhZFByZWZlcmVuY2UnOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgb3B0aW9uOiAnICsgb3B0aW9uKTtcbiAgICB9XG4gIH1cbn1cblxuLy8gQSBjb252ZW5pZW50IG1ldGhvZCB0byBwZXJmb3JtIGFsbCB0aGUgc3RlcHMgb2YgcHJvY2Vzc2luZyBhIHF1ZXJ5XG4vLyBpbiBvcmRlci5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgcmVzcG9uc2UgLSBhbiBvYmplY3Qgd2l0aCBvcHRpb25hbCBrZXlzXG4vLyAncmVzdWx0cycgYW5kICdjb3VudCcuXG4vLyBUT0RPOiBjb25zb2xpZGF0ZSB0aGUgcmVwbGFjZVggZnVuY3Rpb25zXG5SZXN0UXVlcnkucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoZXhlY3V0ZU9wdGlvbnMpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuYnVpbGRSZXN0V2hlcmUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGVBbGwoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUV4Y2x1ZGVLZXlzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5GaW5kKGV4ZWN1dGVPcHRpb25zKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkNvdW50KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlckZpbmRUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXNwb25zZTtcbiAgICB9KTtcbn07XG5cblJlc3RRdWVyeS5wcm90b3R5cGUuZWFjaCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICBjb25zdCB7IGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCByZXN0V2hlcmUsIHJlc3RPcHRpb25zLCBjbGllbnRTREsgfSA9IHRoaXM7XG4gIC8vIGlmIHRoZSBsaW1pdCBpcyBzZXQsIHVzZSBpdFxuICByZXN0T3B0aW9ucy5saW1pdCA9IHJlc3RPcHRpb25zLmxpbWl0IHx8IDEwMDtcbiAgcmVzdE9wdGlvbnMub3JkZXIgPSAnb2JqZWN0SWQnO1xuICBsZXQgZmluaXNoZWQgPSBmYWxzZTtcblxuICByZXR1cm4gY29udGludWVXaGlsZShcbiAgICAoKSA9PiB7XG4gICAgICByZXR1cm4gIWZpbmlzaGVkO1xuICAgIH0sXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgICAgICBjb25maWcsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgcmVzdFdoZXJlLFxuICAgICAgICByZXN0T3B0aW9ucyxcbiAgICAgICAgY2xpZW50U0RLLFxuICAgICAgICB0aGlzLnJ1bkFmdGVyRmluZCxcbiAgICAgICAgdGhpcy5jb250ZXh0XG4gICAgICApO1xuICAgICAgY29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBxdWVyeS5leGVjdXRlKCk7XG4gICAgICByZXN1bHRzLmZvckVhY2goY2FsbGJhY2spO1xuICAgICAgZmluaXNoZWQgPSByZXN1bHRzLmxlbmd0aCA8IHJlc3RPcHRpb25zLmxpbWl0O1xuICAgICAgaWYgKCFmaW5pc2hlZCkge1xuICAgICAgICByZXN0V2hlcmUub2JqZWN0SWQgPSBPYmplY3QuYXNzaWduKHt9LCByZXN0V2hlcmUub2JqZWN0SWQsIHtcbiAgICAgICAgICAkZ3Q6IHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXS5vYmplY3RJZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICApO1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5idWlsZFJlc3RXaGVyZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VEb250U2VsZWN0KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZU5vdEluUXVlcnkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VFcXVhbGl0eSgpO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5SZXN0UXVlcnkucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSB0aGlzLmZpbmRPcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gQ2hhbmdlcyB0aGUgY2xhc3NOYW1lIGlmIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IGlzIHNldC5cbi8vIFJldHVybnMgYSBwcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnJlZGlyZWN0S2V5KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV2UgbmVlZCB0byBjaGFuZ2UgdGhlIGNsYXNzIG5hbWUgYmFzZWQgb24gdGhlIHNjaGVtYVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkodGhpcy5jbGFzc05hbWUsIHRoaXMucmVkaXJlY3RLZXkpXG4gICAgLnRoZW4obmV3Q2xhc3NOYW1lID0+IHtcbiAgICAgIHRoaXMuY2xhc3NOYW1lID0gbmV3Q2xhc3NOYW1lO1xuICAgICAgdGhpcy5yZWRpcmVjdENsYXNzTmFtZSA9IG5ld0NsYXNzTmFtZTtcbiAgICB9KTtcbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gY29uZmlnLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChcbiAgICB0aGlzLmNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT09IGZhbHNlICYmXG4gICAgIXRoaXMuYXV0aC5pc01hc3RlciAmJlxuICAgIFNjaGVtYUNvbnRyb2xsZXIuc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKHRoaXMuY2xhc3NOYW1lKSA9PT0gLTFcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuaGFzQ2xhc3ModGhpcy5jbGFzc05hbWUpKVxuICAgICAgLnRoZW4oaGFzQ2xhc3MgPT4ge1xuICAgICAgICBpZiAoaGFzQ2xhc3MgIT09IHRydWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgJ1RoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBhY2Nlc3MgJyArICdub24tZXhpc3RlbnQgY2xhc3M6ICcgKyB0aGlzLmNsYXNzTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtSW5RdWVyeShpblF1ZXJ5T2JqZWN0LCBjbGFzc05hbWUsIHJlc3VsdHMpIHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgIHZhbHVlcy5wdXNoKHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogcmVzdWx0Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGRlbGV0ZSBpblF1ZXJ5T2JqZWN0WyckaW5RdWVyeSddO1xuICBpZiAoQXJyYXkuaXNBcnJheShpblF1ZXJ5T2JqZWN0WyckaW4nXSkpIHtcbiAgICBpblF1ZXJ5T2JqZWN0WyckaW4nXSA9IGluUXVlcnlPYmplY3RbJyRpbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIGluUXVlcnlPYmplY3RbJyRpbiddID0gdmFsdWVzO1xuICB9XG59XG5cbi8vIFJlcGxhY2VzIGEgJGluUXVlcnkgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhblxuLy8gJGluUXVlcnkgY2xhdXNlLlxuLy8gVGhlICRpblF1ZXJ5IGNsYXVzZSB0dXJucyBpbnRvIGFuICRpbiB3aXRoIHZhbHVlcyB0aGF0IGFyZSBqdXN0XG4vLyBwb2ludGVycyB0byB0aGUgb2JqZWN0cyByZXR1cm5lZCBpbiB0aGUgc3VicXVlcnkuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VJblF1ZXJ5ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgaW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGluUXVlcnknKTtcbiAgaWYgKCFpblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIGluUXVlcnlWYWx1ZSA9IGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmICghaW5RdWVyeVZhbHVlLndoZXJlIHx8ICFpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkaW5RdWVyeScpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgdmFyIHN1YnF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmF1dGgsXG4gICAgaW5RdWVyeVZhbHVlLmNsYXNzTmFtZSxcbiAgICBpblF1ZXJ5VmFsdWUud2hlcmUsXG4gICAgYWRkaXRpb25hbE9wdGlvbnNcbiAgKTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIHN1YnF1ZXJ5LmNsYXNzTmFtZSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gUmVjdXJzZSB0byByZXBlYXRcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICB9KTtcbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkobm90SW5RdWVyeU9iamVjdFsnJG5pbiddKSkge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkbm90SW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkbm90SW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJG5vdEluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYSAkbmluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZU5vdEluUXVlcnkgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBub3RJblF1ZXJ5T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckbm90SW5RdWVyeScpO1xuICBpZiAoIW5vdEluUXVlcnlPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgbm90SW5RdWVyeSB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gd2hlcmUgYW5kIGNsYXNzTmFtZVxuICB2YXIgbm90SW5RdWVyeVZhbHVlID0gbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKCFub3RJblF1ZXJ5VmFsdWUud2hlcmUgfHwgIW5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRub3RJblF1ZXJ5Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogbm90SW5RdWVyeVZhbHVlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBub3RJblF1ZXJ5VmFsdWUuY2xhc3NOYW1lLFxuICAgIG5vdEluUXVlcnlWYWx1ZS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgc3VicXVlcnkuY2xhc3NOYW1lLCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBSZWN1cnNlIHRvIHJlcGVhdFxuICAgIHJldHVybiB0aGlzLnJlcGxhY2VOb3RJblF1ZXJ5KCk7XG4gIH0pO1xufTtcblxuLy8gVXNlZCB0byBnZXQgdGhlIGRlZXBlc3Qgb2JqZWN0IGZyb20ganNvbiB1c2luZyBkb3Qgbm90YXRpb24uXG5jb25zdCBnZXREZWVwZXN0T2JqZWN0RnJvbUtleSA9IChqc29uLCBrZXksIGlkeCwgc3JjKSA9PiB7XG4gIGlmIChrZXkgaW4ganNvbikge1xuICAgIHJldHVybiBqc29uW2tleV07XG4gIH1cbiAgc3JjLnNwbGljZSgxKTsgLy8gRXhpdCBFYXJseVxufTtcblxuY29uc3QgdHJhbnNmb3JtU2VsZWN0ID0gKHNlbGVjdE9iamVjdCwga2V5LCBvYmplY3RzKSA9PiB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIG9iamVjdHMpIHtcbiAgICB2YWx1ZXMucHVzaChrZXkuc3BsaXQoJy4nKS5yZWR1Y2UoZ2V0RGVlcGVzdE9iamVjdEZyb21LZXksIHJlc3VsdCkpO1xuICB9XG4gIGRlbGV0ZSBzZWxlY3RPYmplY3RbJyRzZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoc2VsZWN0T2JqZWN0WyckaW4nXSkpIHtcbiAgICBzZWxlY3RPYmplY3RbJyRpbiddID0gc2VsZWN0T2JqZWN0WyckaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RPYmplY3RbJyRpbiddID0gdmFsdWVzO1xuICB9XG59O1xuXG4vLyBSZXBsYWNlcyBhICRzZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkc2VsZWN0IGNsYXVzZS5cbi8vIFRoZSAkc2VsZWN0IGNsYXVzZSB0dXJucyBpbnRvIGFuICRpbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlU2VsZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZWN0T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckc2VsZWN0Jyk7XG4gIGlmICghc2VsZWN0T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIHNlbGVjdCB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gcXVlcnkgYW5kIGtleVxuICB2YXIgc2VsZWN0VmFsdWUgPSBzZWxlY3RPYmplY3RbJyRzZWxlY3QnXTtcbiAgLy8gaU9TIFNESyBkb24ndCBzZW5kIHdoZXJlIGlmIG5vdCBzZXQsIGxldCBpdCBwYXNzXG4gIGlmIChcbiAgICAhc2VsZWN0VmFsdWUucXVlcnkgfHxcbiAgICAhc2VsZWN0VmFsdWUua2V5IHx8XG4gICAgdHlwZW9mIHNlbGVjdFZhbHVlLnF1ZXJ5ICE9PSAnb2JqZWN0JyB8fFxuICAgICFzZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUgfHxcbiAgICBPYmplY3Qua2V5cyhzZWxlY3RWYWx1ZSkubGVuZ3RoICE9PSAyXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJHNlbGVjdCcpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IHNlbGVjdFZhbHVlLnF1ZXJ5LnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBzZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUsXG4gICAgc2VsZWN0VmFsdWUucXVlcnkud2hlcmUsXG4gICAgYWRkaXRpb25hbE9wdGlvbnNcbiAgKTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1TZWxlY3Qoc2VsZWN0T2JqZWN0LCBzZWxlY3RWYWx1ZS5rZXksIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIEtlZXAgcmVwbGFjaW5nICRzZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb250U2VsZWN0ID0gKGRvbnRTZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoZG9udFNlbGVjdE9iamVjdFsnJG5pbiddKSkge1xuICAgIGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSA9IGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBkb250U2VsZWN0T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJGRvbnRTZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkZG9udFNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJGRvbnRTZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJG5pbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlRG9udFNlbGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGRvbnRTZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRkb250U2VsZWN0Jyk7XG4gIGlmICghZG9udFNlbGVjdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBkb250U2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBkb250U2VsZWN0VmFsdWUgPSBkb250U2VsZWN0T2JqZWN0WyckZG9udFNlbGVjdCddO1xuICBpZiAoXG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFkb250U2VsZWN0VmFsdWUua2V5IHx8XG4gICAgdHlwZW9mIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeSAhPT0gJ29iamVjdCcgfHxcbiAgICAhZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKGRvbnRTZWxlY3RWYWx1ZSkubGVuZ3RoICE9PSAyXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJGRvbnRTZWxlY3QnKTtcbiAgfVxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBkb250U2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybURvbnRTZWxlY3QoZG9udFNlbGVjdE9iamVjdCwgZG9udFNlbGVjdFZhbHVlLmtleSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gS2VlcCByZXBsYWNpbmcgJGRvbnRTZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VEb250U2VsZWN0KCk7XG4gIH0pO1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5jbGVhblJlc3VsdEF1dGhEYXRhID0gZnVuY3Rpb24gKHJlc3VsdCkge1xuICBkZWxldGUgcmVzdWx0LnBhc3N3b3JkO1xuICBpZiAocmVzdWx0LmF1dGhEYXRhKSB7XG4gICAgT2JqZWN0LmtleXMocmVzdWx0LmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgIGlmIChyZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKE9iamVjdC5rZXlzKHJlc3VsdC5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGE7XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCByZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50ID0gY29uc3RyYWludCA9PiB7XG4gIGlmICh0eXBlb2YgY29uc3RyYWludCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gY29uc3RyYWludDtcbiAgfVxuICBjb25zdCBlcXVhbFRvT2JqZWN0ID0ge307XG4gIGxldCBoYXNEaXJlY3RDb25zdHJhaW50ID0gZmFsc2U7XG4gIGxldCBoYXNPcGVyYXRvckNvbnN0cmFpbnQgPSBmYWxzZTtcbiAgZm9yIChjb25zdCBrZXkgaW4gY29uc3RyYWludCkge1xuICAgIGlmIChrZXkuaW5kZXhPZignJCcpICE9PSAwKSB7XG4gICAgICBoYXNEaXJlY3RDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICAgIGVxdWFsVG9PYmplY3Rba2V5XSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICB9IGVsc2Uge1xuICAgICAgaGFzT3BlcmF0b3JDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgaWYgKGhhc0RpcmVjdENvbnN0cmFpbnQgJiYgaGFzT3BlcmF0b3JDb25zdHJhaW50KSB7XG4gICAgY29uc3RyYWludFsnJGVxJ10gPSBlcXVhbFRvT2JqZWN0O1xuICAgIE9iamVjdC5rZXlzKGVxdWFsVG9PYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50W2tleV07XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGNvbnN0cmFpbnQ7XG59O1xuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VFcXVhbGl0eSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHR5cGVvZiB0aGlzLnJlc3RXaGVyZSAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gdGhpcy5yZXN0V2hlcmUpIHtcbiAgICB0aGlzLnJlc3RXaGVyZVtrZXldID0gcmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCh0aGlzLnJlc3RXaGVyZVtrZXldKTtcbiAgfVxufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZXRoZXIgaXQgd2FzIHN1Y2Nlc3NmdWwuXG4vLyBQb3B1bGF0ZXMgdGhpcy5yZXNwb25zZSB3aXRoIGFuIG9iamVjdCB0aGF0IG9ubHkgaGFzICdyZXN1bHRzJy5cblJlc3RRdWVyeS5wcm90b3R5cGUucnVuRmluZCA9IGZ1bmN0aW9uIChvcHRpb25zID0ge30pIHtcbiAgaWYgKHRoaXMuZmluZE9wdGlvbnMubGltaXQgPT09IDApIHtcbiAgICB0aGlzLnJlc3BvbnNlID0geyByZXN1bHRzOiBbXSB9O1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICBjb25zdCBmaW5kT3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuZmluZE9wdGlvbnMpO1xuICBpZiAodGhpcy5rZXlzKSB7XG4gICAgZmluZE9wdGlvbnMua2V5cyA9IHRoaXMua2V5cy5tYXAoa2V5ID0+IHtcbiAgICAgIHJldHVybiBrZXkuc3BsaXQoJy4nKVswXTtcbiAgICB9KTtcbiAgfVxuICBpZiAob3B0aW9ucy5vcCkge1xuICAgIGZpbmRPcHRpb25zLm9wID0gb3B0aW9ucy5vcDtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZCh0aGlzLmNsYXNzTmFtZSwgdGhpcy5yZXN0V2hlcmUsIGZpbmRPcHRpb25zLCB0aGlzLmF1dGgpXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiYgZmluZE9wdGlvbnMuZXhwbGFpbiAhPT0gdHJ1ZSkge1xuICAgICAgICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgICAgICAgIHRoaXMuY2xlYW5SZXN1bHRBdXRoRGF0YShyZXN1bHQsIHRoaXMuYXV0aCwgdGhpcy5jb25maWcpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCByZXN1bHRzKTtcblxuICAgICAgaWYgKHRoaXMucmVkaXJlY3RDbGFzc05hbWUpIHtcbiAgICAgICAgZm9yICh2YXIgciBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgci5jbGFzc05hbWUgPSB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLnJlc3BvbnNlID0geyByZXN1bHRzOiByZXN1bHRzIH07XG4gICAgfSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hldGhlciBpdCB3YXMgc3VjY2Vzc2Z1bC5cbi8vIFBvcHVsYXRlcyB0aGlzLnJlc3BvbnNlLmNvdW50IHdpdGggdGhlIGNvdW50XG5SZXN0UXVlcnkucHJvdG90eXBlLnJ1bkNvdW50ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZG9Db3VudCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmZpbmRPcHRpb25zLmNvdW50ID0gdHJ1ZTtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMuc2tpcDtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMubGltaXQ7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgdGhpcy5maW5kT3B0aW9ucykudGhlbihjID0+IHtcbiAgICB0aGlzLnJlc3BvbnNlLmNvdW50ID0gYztcbiAgfSk7XG59O1xuXG4vLyBBdWdtZW50cyB0aGlzLnJlc3BvbnNlIHdpdGggYWxsIHBvaW50ZXJzIG9uIGFuIG9iamVjdFxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlQWxsID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuaW5jbHVkZUFsbCkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGluY2x1ZGVGaWVsZHMgPSBbXTtcbiAgICAgIGNvbnN0IGtleUZpZWxkcyA9IFtdO1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzY2hlbWEuZmllbGRzKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHx8XG4gICAgICAgICAgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0FycmF5JylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaW5jbHVkZUZpZWxkcy5wdXNoKFtmaWVsZF0pO1xuICAgICAgICAgIGtleUZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gQWRkIGZpZWxkcyB0byBpbmNsdWRlLCBrZXlzLCByZW1vdmUgZHVwc1xuICAgICAgdGhpcy5pbmNsdWRlID0gWy4uLm5ldyBTZXQoWy4uLnRoaXMuaW5jbHVkZSwgLi4uaW5jbHVkZUZpZWxkc10pXTtcbiAgICAgIC8vIGlmIHRoaXMua2V5cyBub3Qgc2V0LCB0aGVuIGFsbCBrZXlzIGFyZSBhbHJlYWR5IGluY2x1ZGVkXG4gICAgICBpZiAodGhpcy5rZXlzKSB7XG4gICAgICAgIHRoaXMua2V5cyA9IFsuLi5uZXcgU2V0KFsuLi50aGlzLmtleXMsIC4uLmtleUZpZWxkc10pXTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cbi8vIFVwZGF0ZXMgcHJvcGVydHkgYHRoaXMua2V5c2AgdG8gY29udGFpbiBhbGwga2V5cyBidXQgdGhlIG9uZXMgdW5zZWxlY3RlZC5cblJlc3RRdWVyeS5wcm90b3R5cGUuaGFuZGxlRXhjbHVkZUtleXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5leGNsdWRlS2V5cykge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGhpcy5rZXlzKSB7XG4gICAgdGhpcy5rZXlzID0gdGhpcy5rZXlzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmxvYWRTY2hlbWEoKVxuICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEodGhpcy5jbGFzc05hbWUpKVxuICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKTtcbiAgICAgIHRoaXMua2V5cyA9IGZpZWxkcy5maWx0ZXIoayA9PiAhdGhpcy5leGNsdWRlS2V5cy5pbmNsdWRlcyhrKSk7XG4gICAgfSk7XG59O1xuXG4vLyBBdWdtZW50cyB0aGlzLnJlc3BvbnNlIHdpdGggZGF0YSBhdCB0aGUgcGF0aHMgcHJvdmlkZWQgaW4gdGhpcy5pbmNsdWRlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pbmNsdWRlLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHBhdGhSZXNwb25zZSA9IGluY2x1ZGVQYXRoKFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICB0aGlzLnJlc3BvbnNlLFxuICAgIHRoaXMuaW5jbHVkZVswXSxcbiAgICB0aGlzLnJlc3RPcHRpb25zXG4gICk7XG4gIGlmIChwYXRoUmVzcG9uc2UudGhlbikge1xuICAgIHJldHVybiBwYXRoUmVzcG9uc2UudGhlbihuZXdSZXNwb25zZSA9PiB7XG4gICAgICB0aGlzLnJlc3BvbnNlID0gbmV3UmVzcG9uc2U7XG4gICAgICB0aGlzLmluY2x1ZGUgPSB0aGlzLmluY2x1ZGUuc2xpY2UoMSk7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gICAgfSk7XG4gIH0gZWxzZSBpZiAodGhpcy5pbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICB0aGlzLmluY2x1ZGUgPSB0aGlzLmluY2x1ZGUuc2xpY2UoMSk7XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZSgpO1xuICB9XG5cbiAgcmV0dXJuIHBhdGhSZXNwb25zZTtcbn07XG5cbi8vUmV0dXJucyBhIHByb21pc2Ugb2YgYSBwcm9jZXNzZWQgc2V0IG9mIHJlc3VsdHNcblJlc3RRdWVyeS5wcm90b3R5cGUucnVuQWZ0ZXJGaW5kVHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghdGhpcy5ydW5BZnRlckZpbmQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYWZ0ZXJGaW5kJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBjb25zdCBoYXNBZnRlckZpbmRIb29rID0gdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyhcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckZpbmQsXG4gICAgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZFxuICApO1xuICBpZiAoIWhhc0FmdGVyRmluZEhvb2spIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gU2tpcCBBZ2dyZWdhdGUgYW5kIERpc3RpbmN0IFF1ZXJpZXNcbiAgaWYgKHRoaXMuZmluZE9wdGlvbnMucGlwZWxpbmUgfHwgdGhpcy5maW5kT3B0aW9ucy5kaXN0aW5jdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNvbnN0IGpzb24gPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLnJlc3RPcHRpb25zKTtcbiAganNvbi53aGVyZSA9IHRoaXMucmVzdFdoZXJlO1xuICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KHRoaXMuY2xhc3NOYW1lKTtcbiAgcGFyc2VRdWVyeS53aXRoSlNPTihqc29uKTtcbiAgLy8gUnVuIGFmdGVyRmluZCB0cmlnZ2VyIGFuZCBzZXQgdGhlIG5ldyByZXN1bHRzXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckZpbmQsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyxcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgcGFyc2VRdWVyeSxcbiAgICAgIHRoaXMuY29udGV4dFxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIC8vIEVuc3VyZSB3ZSBwcm9wZXJseSBzZXQgdGhlIGNsYXNzTmFtZSBiYWNrXG4gICAgICBpZiAodGhpcy5yZWRpcmVjdENsYXNzTmFtZSkge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMgPSByZXN1bHRzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIGlmIChvYmplY3QgaW5zdGFuY2VvZiBQYXJzZS5PYmplY3QpIHtcbiAgICAgICAgICAgIG9iamVjdCA9IG9iamVjdC50b0pTT04oKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0LmNsYXNzTmFtZSA9IHRoaXMucmVkaXJlY3RDbGFzc05hbWU7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMgPSByZXN1bHRzO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gQWRkcyBpbmNsdWRlZCB2YWx1ZXMgdG8gdGhlIHJlc3BvbnNlLlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGQgbmFtZXMuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gYXVnbWVudGVkIHJlc3BvbnNlLlxuZnVuY3Rpb24gaW5jbHVkZVBhdGgoY29uZmlnLCBhdXRoLCByZXNwb25zZSwgcGF0aCwgcmVzdE9wdGlvbnMgPSB7fSkge1xuICB2YXIgcG9pbnRlcnMgPSBmaW5kUG9pbnRlcnMocmVzcG9uc2UucmVzdWx0cywgcGF0aCk7XG4gIGlmIChwb2ludGVycy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuICBjb25zdCBwb2ludGVyc0hhc2ggPSB7fTtcbiAgZm9yICh2YXIgcG9pbnRlciBvZiBwb2ludGVycykge1xuICAgIGlmICghcG9pbnRlcikge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHBvaW50ZXIuY2xhc3NOYW1lO1xuICAgIC8vIG9ubHkgaW5jbHVkZSB0aGUgZ29vZCBwb2ludGVyc1xuICAgIGlmIChjbGFzc05hbWUpIHtcbiAgICAgIHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdID0gcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0gfHwgbmV3IFNldCgpO1xuICAgICAgcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0uYWRkKHBvaW50ZXIub2JqZWN0SWQpO1xuICAgIH1cbiAgfVxuICBjb25zdCBpbmNsdWRlUmVzdE9wdGlvbnMgPSB7fTtcbiAgaWYgKHJlc3RPcHRpb25zLmtleXMpIHtcbiAgICBjb25zdCBrZXlzID0gbmV3IFNldChyZXN0T3B0aW9ucy5rZXlzLnNwbGl0KCcsJykpO1xuICAgIGNvbnN0IGtleVNldCA9IEFycmF5LmZyb20oa2V5cykucmVkdWNlKChzZXQsIGtleSkgPT4ge1xuICAgICAgY29uc3Qga2V5UGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChpOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocGF0aFtpXSAhPSBrZXlQYXRoW2ldKSB7XG4gICAgICAgICAgcmV0dXJuIHNldDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGkgPCBrZXlQYXRoLmxlbmd0aCkge1xuICAgICAgICBzZXQuYWRkKGtleVBhdGhbaV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNldDtcbiAgICB9LCBuZXcgU2V0KCkpO1xuICAgIGlmIChrZXlTZXQuc2l6ZSA+IDApIHtcbiAgICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5rZXlzID0gQXJyYXkuZnJvbShrZXlTZXQpLmpvaW4oJywnKTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAocmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIGNvbnN0IHF1ZXJ5UHJvbWlzZXMgPSBPYmplY3Qua2V5cyhwb2ludGVyc0hhc2gpLm1hcChjbGFzc05hbWUgPT4ge1xuICAgIGNvbnN0IG9iamVjdElkcyA9IEFycmF5LmZyb20ocG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0pO1xuICAgIGxldCB3aGVyZTtcbiAgICBpZiAob2JqZWN0SWRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiBvYmplY3RJZHNbMF0gfTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiB7ICRpbjogb2JqZWN0SWRzIH0gfTtcbiAgICB9XG4gICAgdmFyIHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgd2hlcmUsIGluY2x1ZGVSZXN0T3B0aW9ucyk7XG4gICAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoeyBvcDogJ2dldCcgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHRzKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gR2V0IHRoZSBvYmplY3RzIGZvciBhbGwgdGhlc2Ugb2JqZWN0IGlkc1xuICByZXR1cm4gUHJvbWlzZS5hbGwocXVlcnlQcm9taXNlcykudGhlbihyZXNwb25zZXMgPT4ge1xuICAgIHZhciByZXBsYWNlID0gcmVzcG9uc2VzLnJlZHVjZSgocmVwbGFjZSwgaW5jbHVkZVJlc3BvbnNlKSA9PiB7XG4gICAgICBmb3IgKHZhciBvYmogb2YgaW5jbHVkZVJlc3BvbnNlLnJlc3VsdHMpIHtcbiAgICAgICAgb2JqLl9fdHlwZSA9ICdPYmplY3QnO1xuICAgICAgICBvYmouY2xhc3NOYW1lID0gaW5jbHVkZVJlc3BvbnNlLmNsYXNzTmFtZTtcblxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSA9PSAnX1VzZXInICYmICFhdXRoLmlzTWFzdGVyKSB7XG4gICAgICAgICAgZGVsZXRlIG9iai5zZXNzaW9uVG9rZW47XG4gICAgICAgICAgZGVsZXRlIG9iai5hdXRoRGF0YTtcbiAgICAgICAgfVxuICAgICAgICByZXBsYWNlW29iai5vYmplY3RJZF0gPSBvYmo7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVwbGFjZTtcbiAgICB9LCB7fSk7XG5cbiAgICB2YXIgcmVzcCA9IHtcbiAgICAgIHJlc3VsdHM6IHJlcGxhY2VQb2ludGVycyhyZXNwb25zZS5yZXN1bHRzLCBwYXRoLCByZXBsYWNlKSxcbiAgICB9O1xuICAgIGlmIChyZXNwb25zZS5jb3VudCkge1xuICAgICAgcmVzcC5jb3VudCA9IHJlc3BvbnNlLmNvdW50O1xuICAgIH1cbiAgICByZXR1cm4gcmVzcDtcbiAgfSk7XG59XG5cbi8vIE9iamVjdCBtYXkgYmUgYSBsaXN0IG9mIFJFU1QtZm9ybWF0IG9iamVjdCB0byBmaW5kIHBvaW50ZXJzIGluLCBvclxuLy8gaXQgbWF5IGJlIGEgc2luZ2xlIG9iamVjdC5cbi8vIElmIHRoZSBwYXRoIHlpZWxkcyB0aGluZ3MgdGhhdCBhcmVuJ3QgcG9pbnRlcnMsIHRoaXMgdGhyb3dzIGFuIGVycm9yLlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGRzIHRvIHNlYXJjaCBpbnRvLlxuLy8gUmV0dXJucyBhIGxpc3Qgb2YgcG9pbnRlcnMgaW4gUkVTVCBmb3JtYXQuXG5mdW5jdGlvbiBmaW5kUG9pbnRlcnMob2JqZWN0LCBwYXRoKSB7XG4gIGlmIChvYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhciBhbnN3ZXIgPSBbXTtcbiAgICBmb3IgKHZhciB4IG9mIG9iamVjdCkge1xuICAgICAgYW5zd2VyID0gYW5zd2VyLmNvbmNhdChmaW5kUG9pbnRlcnMoeCwgcGF0aCkpO1xuICAgIH1cbiAgICByZXR1cm4gYW5zd2VyO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8ICFvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT0gMCkge1xuICAgIGlmIChvYmplY3QgPT09IG51bGwgfHwgb2JqZWN0Ll9fdHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICAgIHJldHVybiBbb2JqZWN0XTtcbiAgICB9XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgcmV0dXJuIGZpbmRQb2ludGVycyhzdWJvYmplY3QsIHBhdGguc2xpY2UoMSkpO1xufVxuXG4vLyBPYmplY3QgbWF5IGJlIGEgbGlzdCBvZiBSRVNULWZvcm1hdCBvYmplY3RzIHRvIHJlcGxhY2UgcG9pbnRlcnNcbi8vIGluLCBvciBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGRzIHRvIHNlYXJjaCBpbnRvLlxuLy8gcmVwbGFjZSBpcyBhIG1hcCBmcm9tIG9iamVjdCBpZCAtPiBvYmplY3QuXG4vLyBSZXR1cm5zIHNvbWV0aGluZyBhbmFsb2dvdXMgdG8gb2JqZWN0LCBidXQgd2l0aCB0aGUgYXBwcm9wcmlhdGVcbi8vIHBvaW50ZXJzIGluZmxhdGVkLlxuZnVuY3Rpb24gcmVwbGFjZVBvaW50ZXJzKG9iamVjdCwgcGF0aCwgcmVwbGFjZSkge1xuICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gb2JqZWN0XG4gICAgICAubWFwKG9iaiA9PiByZXBsYWNlUG9pbnRlcnMob2JqLCBwYXRoLCByZXBsYWNlKSlcbiAgICAgIC5maWx0ZXIob2JqID0+IHR5cGVvZiBvYmogIT09ICd1bmRlZmluZWQnKTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChvYmplY3QgJiYgb2JqZWN0Ll9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gcmVwbGFjZVtvYmplY3Qub2JqZWN0SWRdO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIHZhciBuZXdzdWIgPSByZXBsYWNlUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpLCByZXBsYWNlKTtcbiAgdmFyIGFuc3dlciA9IHt9O1xuICBmb3IgKHZhciBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKGtleSA9PSBwYXRoWzBdKSB7XG4gICAgICBhbnN3ZXJba2V5XSA9IG5ld3N1YjtcbiAgICB9IGVsc2Uge1xuICAgICAgYW5zd2VyW2tleV0gPSBvYmplY3Rba2V5XTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFuc3dlcjtcbn1cblxuLy8gRmluZHMgYSBzdWJvYmplY3QgdGhhdCBoYXMgdGhlIGdpdmVuIGtleSwgaWYgdGhlcmUgaXMgb25lLlxuLy8gUmV0dXJucyB1bmRlZmluZWQgb3RoZXJ3aXNlLlxuZnVuY3Rpb24gZmluZE9iamVjdFdpdGhLZXkocm9vdCwga2V5KSB7XG4gIGlmICh0eXBlb2Ygcm9vdCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHJvb3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIGZvciAodmFyIGl0ZW0gb2Ygcm9vdCkge1xuICAgICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkoaXRlbSwga2V5KTtcbiAgICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKHJvb3QgJiYgcm9vdFtrZXldKSB7XG4gICAgcmV0dXJuIHJvb3Q7XG4gIH1cbiAgZm9yICh2YXIgc3Via2V5IGluIHJvb3QpIHtcbiAgICBjb25zdCBhbnN3ZXIgPSBmaW5kT2JqZWN0V2l0aEtleShyb290W3N1YmtleV0sIGtleSk7XG4gICAgaWYgKGFuc3dlcikge1xuICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSZXN0UXVlcnk7XG4iXX0=