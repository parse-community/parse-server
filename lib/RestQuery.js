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
    if (this.className === '_User' && findOptions.explain !== true) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0UXVlcnkuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJQYXJzZSIsInRyaWdnZXJzIiwiY29udGludWVXaGlsZSIsIkFsd2F5c1NlbGVjdGVkS2V5cyIsIlJlc3RRdWVyeSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImNsaWVudFNESyIsInJ1bkFmdGVyRmluZCIsImNvbnRleHQiLCJyZXNwb25zZSIsImZpbmRPcHRpb25zIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCIkYW5kIiwiX190eXBlIiwib2JqZWN0SWQiLCJpZCIsImRvQ291bnQiLCJpbmNsdWRlQWxsIiwiaW5jbHVkZSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImtleXNGb3JJbmNsdWRlIiwia2V5cyIsInNwbGl0IiwiZmlsdGVyIiwia2V5IiwibGVuZ3RoIiwibWFwIiwic2xpY2UiLCJsYXN0SW5kZXhPZiIsImpvaW4iLCJvcHRpb24iLCJjb25jYXQiLCJBcnJheSIsImZyb20iLCJTZXQiLCJleGNsdWRlIiwiZXhjbHVkZUtleXMiLCJrIiwiaW5kZXhPZiIsImZpZWxkcyIsIm9yZGVyIiwic29ydCIsInJlZHVjZSIsInNvcnRNYXAiLCJmaWVsZCIsInRyaW0iLCJzY29yZSIsIiRtZXRhIiwicGF0aHMiLCJpbmNsdWRlcyIsInBhdGhTZXQiLCJtZW1vIiwicGF0aCIsImluZGV4IiwicGFydHMiLCJzIiwiYSIsImIiLCJyZWRpcmVjdEtleSIsInJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IiwicmVkaXJlY3RDbGFzc05hbWUiLCJJTlZBTElEX0pTT04iLCJleGVjdXRlIiwiZXhlY3V0ZU9wdGlvbnMiLCJQcm9taXNlIiwicmVzb2x2ZSIsInRoZW4iLCJidWlsZFJlc3RXaGVyZSIsImhhbmRsZUluY2x1ZGVBbGwiLCJoYW5kbGVFeGNsdWRlS2V5cyIsInJ1bkZpbmQiLCJydW5Db3VudCIsImhhbmRsZUluY2x1ZGUiLCJydW5BZnRlckZpbmRUcmlnZ2VyIiwiZWFjaCIsImNhbGxiYWNrIiwibGltaXQiLCJmaW5pc2hlZCIsInF1ZXJ5IiwicmVzdWx0cyIsImZvckVhY2giLCJhc3NpZ24iLCIkZ3QiLCJnZXRVc2VyQW5kUm9sZUFDTCIsInZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiIsInJlcGxhY2VTZWxlY3QiLCJyZXBsYWNlRG9udFNlbGVjdCIsInJlcGxhY2VJblF1ZXJ5IiwicmVwbGFjZU5vdEluUXVlcnkiLCJyZXBsYWNlRXF1YWxpdHkiLCJhY2wiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsImRhdGFiYXNlIiwibmV3Q2xhc3NOYW1lIiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImxvYWRTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwiaGFzQ2xhc3MiLCJPUEVSQVRJT05fRk9SQklEREVOIiwidHJhbnNmb3JtSW5RdWVyeSIsImluUXVlcnlPYmplY3QiLCJ2YWx1ZXMiLCJyZXN1bHQiLCJwdXNoIiwiaXNBcnJheSIsImZpbmRPYmplY3RXaXRoS2V5IiwiaW5RdWVyeVZhbHVlIiwid2hlcmUiLCJJTlZBTElEX1FVRVJZIiwiYWRkaXRpb25hbE9wdGlvbnMiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwicmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeSIsInRyYW5zZm9ybU5vdEluUXVlcnkiLCJub3RJblF1ZXJ5T2JqZWN0Iiwibm90SW5RdWVyeVZhbHVlIiwiZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkiLCJqc29uIiwiaWR4Iiwic3JjIiwic3BsaWNlIiwidHJhbnNmb3JtU2VsZWN0Iiwic2VsZWN0T2JqZWN0Iiwib2JqZWN0cyIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImZpbmQiLCJleHBsYWluIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsInIiLCJjb3VudCIsInNraXAiLCJjIiwiZ2V0T25lU2NoZW1hIiwic2NoZW1hIiwiaW5jbHVkZUZpZWxkcyIsImtleUZpZWxkcyIsInR5cGUiLCJwYXRoUmVzcG9uc2UiLCJpbmNsdWRlUGF0aCIsIm5ld1Jlc3BvbnNlIiwiaGFzQWZ0ZXJGaW5kSG9vayIsInRyaWdnZXJFeGlzdHMiLCJUeXBlcyIsImFmdGVyRmluZCIsImFwcGxpY2F0aW9uSWQiLCJwaXBlbGluZSIsImRpc3RpbmN0IiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwiaSIsInNpemUiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJxdWVyeVByb21pc2VzIiwib2JqZWN0SWRzIiwiJGluIiwiYWxsIiwicmVzcG9uc2VzIiwicmVwbGFjZSIsImluY2x1ZGVSZXNwb25zZSIsIm9iaiIsInNlc3Npb25Ub2tlbiIsInJlc3AiLCJyZXBsYWNlUG9pbnRlcnMiLCJhbnN3ZXIiLCJ4Iiwic3Vib2JqZWN0IiwibmV3c3ViIiwicm9vdCIsIml0ZW0iLCJzdWJrZXkiLCJtb2R1bGUiLCJleHBvcnRzIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7QUFFQSxJQUFJ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QUFBLE1BQU0sQ0FBQ3pLLEdBQUQsQ0FBTixHQUFjZ0osTUFBTSxDQUFDaEosR0FBRCxDQUFwQjtBQUNEO0FBQ0Y7O0FBQ0QsU0FBT3lLLE1BQVA7QUFDRCxDLENBRUQ7QUFDQTs7O0FBQ0EsU0FBU3RGLGlCQUFULENBQTJCMEYsSUFBM0IsRUFBaUM3SyxHQUFqQyxFQUFzQztBQUNwQyxNQUFJLE9BQU82SyxJQUFQLEtBQWdCLFFBQXBCLEVBQThCO0FBQzVCO0FBQ0Q7O0FBQ0QsTUFBSUEsSUFBSSxZQUFZckssS0FBcEIsRUFBMkI7QUFDekIsU0FBSyxJQUFJc0ssSUFBVCxJQUFpQkQsSUFBakIsRUFBdUI7QUFDckIsWUFBTUosTUFBTSxHQUFHdEYsaUJBQWlCLENBQUMyRixJQUFELEVBQU85SyxHQUFQLENBQWhDOztBQUNBLFVBQUl5SyxNQUFKLEVBQVk7QUFDVixlQUFPQSxNQUFQO0FBQ0Q7QUFDRjtBQUNGOztBQUNELE1BQUlJLElBQUksSUFBSUEsSUFBSSxDQUFDN0ssR0FBRCxDQUFoQixFQUF1QjtBQUNyQixXQUFPNkssSUFBUDtBQUNEOztBQUNELE9BQUssSUFBSUUsTUFBVCxJQUFtQkYsSUFBbkIsRUFBeUI7QUFDdkIsVUFBTUosTUFBTSxHQUFHdEYsaUJBQWlCLENBQUMwRixJQUFJLENBQUNFLE1BQUQsQ0FBTCxFQUFlL0ssR0FBZixDQUFoQzs7QUFDQSxRQUFJeUssTUFBSixFQUFZO0FBQ1YsYUFBT0EsTUFBUDtBQUNEO0FBQ0Y7QUFDRjs7QUFFRE8sTUFBTSxDQUFDQyxPQUFQLEdBQWlCL00sU0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBbiBvYmplY3QgdGhhdCBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhICdmaW5kJ1xuLy8gb3BlcmF0aW9uLCBlbmNvZGVkIGluIHRoZSBSRVNUIEFQSSBmb3JtYXQuXG5cbnZhciBTY2hlbWFDb250cm9sbGVyID0gcmVxdWlyZSgnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5jb25zdCB0cmlnZ2VycyA9IHJlcXVpcmUoJy4vdHJpZ2dlcnMnKTtcbmNvbnN0IHsgY29udGludWVXaGlsZSB9ID0gcmVxdWlyZSgncGFyc2UvbGliL25vZGUvcHJvbWlzZVV0aWxzJyk7XG5jb25zdCBBbHdheXNTZWxlY3RlZEtleXMgPSBbJ29iamVjdElkJywgJ2NyZWF0ZWRBdCcsICd1cGRhdGVkQXQnLCAnQUNMJ107XG4vLyByZXN0T3B0aW9ucyBjYW4gaW5jbHVkZTpcbi8vICAgc2tpcFxuLy8gICBsaW1pdFxuLy8gICBvcmRlclxuLy8gICBjb3VudFxuLy8gICBpbmNsdWRlXG4vLyAgIGtleXNcbi8vICAgZXhjbHVkZUtleXNcbi8vICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXlcbi8vICAgcmVhZFByZWZlcmVuY2Vcbi8vICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlXG4vLyAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2VcbmZ1bmN0aW9uIFJlc3RRdWVyeShcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSA9IHt9LFxuICByZXN0T3B0aW9ucyA9IHt9LFxuICBjbGllbnRTREssXG4gIHJ1bkFmdGVyRmluZCA9IHRydWUsXG4gIGNvbnRleHRcbikge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMucmVzdFdoZXJlID0gcmVzdFdoZXJlO1xuICB0aGlzLnJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnM7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnJ1bkFmdGVyRmluZCA9IHJ1bkFmdGVyRmluZDtcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG4gIHRoaXMuZmluZE9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0gY29udGV4dCB8fCB7fTtcblxuICBpZiAoIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PSAnX1Nlc3Npb24nKSB7XG4gICAgICBpZiAoIXRoaXMuYXV0aC51c2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICAgIH1cbiAgICAgIHRoaXMucmVzdFdoZXJlID0ge1xuICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgdGhpcy5yZXN0V2hlcmUsXG4gICAgICAgICAge1xuICAgICAgICAgICAgdXNlcjoge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICAgICAgICBvYmplY3RJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHRoaXMuZG9Db3VudCA9IGZhbHNlO1xuICB0aGlzLmluY2x1ZGVBbGwgPSBmYWxzZTtcblxuICAvLyBUaGUgZm9ybWF0IGZvciB0aGlzLmluY2x1ZGUgaXMgbm90IHRoZSBzYW1lIGFzIHRoZSBmb3JtYXQgZm9yIHRoZVxuICAvLyBpbmNsdWRlIG9wdGlvbiAtIGl0J3MgdGhlIHBhdGhzIHdlIHNob3VsZCBpbmNsdWRlLCBpbiBvcmRlcixcbiAgLy8gc3RvcmVkIGFzIGFycmF5cywgdGFraW5nIGludG8gYWNjb3VudCB0aGF0IHdlIG5lZWQgdG8gaW5jbHVkZSBmb29cbiAgLy8gYmVmb3JlIGluY2x1ZGluZyBmb28uYmFyLiBBbHNvIGl0IHNob3VsZCBkZWR1cGUuXG4gIC8vIEZvciBleGFtcGxlLCBwYXNzaW5nIGFuIGFyZyBvZiBpbmNsdWRlPWZvby5iYXIsZm9vLmJheiBjb3VsZCBsZWFkIHRvXG4gIC8vIHRoaXMuaW5jbHVkZSA9IFtbJ2ZvbyddLCBbJ2ZvbycsICdiYXonXSwgWydmb28nLCAnYmFyJ11dXG4gIHRoaXMuaW5jbHVkZSA9IFtdO1xuXG4gIC8vIElmIHdlIGhhdmUga2V5cywgd2UgcHJvYmFibHkgd2FudCB0byBmb3JjZSBzb21lIGluY2x1ZGVzIChuLTEgbGV2ZWwpXG4gIC8vIFNlZSBpc3N1ZTogaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzMxODVcbiAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN0T3B0aW9ucywgJ2tleXMnKSkge1xuICAgIGNvbnN0IGtleXNGb3JJbmNsdWRlID0gcmVzdE9wdGlvbnMua2V5c1xuICAgICAgLnNwbGl0KCcsJylcbiAgICAgIC5maWx0ZXIoa2V5ID0+IHtcbiAgICAgICAgLy8gQXQgbGVhc3QgMiBjb21wb25lbnRzXG4gICAgICAgIHJldHVybiBrZXkuc3BsaXQoJy4nKS5sZW5ndGggPiAxO1xuICAgICAgfSlcbiAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgLy8gU2xpY2UgdGhlIGxhc3QgY29tcG9uZW50IChhLmIuYyAtPiBhLmIpXG4gICAgICAgIC8vIE90aGVyd2lzZSB3ZSdsbCBpbmNsdWRlIG9uZSBsZXZlbCB0b28gbXVjaC5cbiAgICAgICAgcmV0dXJuIGtleS5zbGljZSgwLCBrZXkubGFzdEluZGV4T2YoJy4nKSk7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywnKTtcblxuICAgIC8vIENvbmNhdCB0aGUgcG9zc2libHkgcHJlc2VudCBpbmNsdWRlIHN0cmluZyB3aXRoIHRoZSBvbmUgZnJvbSB0aGUga2V5c1xuICAgIC8vIERlZHVwIC8gc29ydGluZyBpcyBoYW5kbGUgaW4gJ2luY2x1ZGUnIGNhc2UuXG4gICAgaWYgKGtleXNGb3JJbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICAgIGlmICghcmVzdE9wdGlvbnMuaW5jbHVkZSB8fCByZXN0T3B0aW9ucy5pbmNsdWRlLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgKz0gJywnICsga2V5c0ZvckluY2x1ZGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZm9yICh2YXIgb3B0aW9uIGluIHJlc3RPcHRpb25zKSB7XG4gICAgc3dpdGNoIChvcHRpb24pIHtcbiAgICAgIGNhc2UgJ2tleXMnOiB7XG4gICAgICAgIGNvbnN0IGtleXMgPSByZXN0T3B0aW9ucy5rZXlzLnNwbGl0KCcsJykuY29uY2F0KEFsd2F5c1NlbGVjdGVkS2V5cyk7XG4gICAgICAgIHRoaXMua2V5cyA9IEFycmF5LmZyb20obmV3IFNldChrZXlzKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnZXhjbHVkZUtleXMnOiB7XG4gICAgICAgIGNvbnN0IGV4Y2x1ZGUgPSByZXN0T3B0aW9ucy5leGNsdWRlS2V5c1xuICAgICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgICAgLmZpbHRlcihrID0+IEFsd2F5c1NlbGVjdGVkS2V5cy5pbmRleE9mKGspIDwgMCk7XG4gICAgICAgIHRoaXMuZXhjbHVkZUtleXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoZXhjbHVkZSkpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ2NvdW50JzpcbiAgICAgICAgdGhpcy5kb0NvdW50ID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlQWxsJzpcbiAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdleHBsYWluJzpcbiAgICAgIGNhc2UgJ2hpbnQnOlxuICAgICAgY2FzZSAnZGlzdGluY3QnOlxuICAgICAgY2FzZSAncGlwZWxpbmUnOlxuICAgICAgY2FzZSAnc2tpcCc6XG4gICAgICBjYXNlICdsaW1pdCc6XG4gICAgICBjYXNlICdyZWFkUHJlZmVyZW5jZSc6XG4gICAgICAgIHRoaXMuZmluZE9wdGlvbnNbb3B0aW9uXSA9IHJlc3RPcHRpb25zW29wdGlvbl07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnb3JkZXInOlxuICAgICAgICB2YXIgZmllbGRzID0gcmVzdE9wdGlvbnMub3JkZXIuc3BsaXQoJywnKTtcbiAgICAgICAgdGhpcy5maW5kT3B0aW9ucy5zb3J0ID0gZmllbGRzLnJlZHVjZSgoc29ydE1hcCwgZmllbGQpID0+IHtcbiAgICAgICAgICBmaWVsZCA9IGZpZWxkLnRyaW0oKTtcbiAgICAgICAgICBpZiAoZmllbGQgPT09ICckc2NvcmUnKSB7XG4gICAgICAgICAgICBzb3J0TWFwLnNjb3JlID0geyAkbWV0YTogJ3RleHRTY29yZScgfTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGZpZWxkWzBdID09ICctJykge1xuICAgICAgICAgICAgc29ydE1hcFtmaWVsZC5zbGljZSgxKV0gPSAtMTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc29ydE1hcFtmaWVsZF0gPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gc29ydE1hcDtcbiAgICAgICAgfSwge30pO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGUnOiB7XG4gICAgICAgIGNvbnN0IHBhdGhzID0gcmVzdE9wdGlvbnMuaW5jbHVkZS5zcGxpdCgnLCcpO1xuICAgICAgICBpZiAocGF0aHMuaW5jbHVkZXMoJyonKSkge1xuICAgICAgICAgIHRoaXMuaW5jbHVkZUFsbCA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgLy8gTG9hZCB0aGUgZXhpc3RpbmcgaW5jbHVkZXMgKGZyb20ga2V5cylcbiAgICAgICAgY29uc3QgcGF0aFNldCA9IHBhdGhzLnJlZHVjZSgobWVtbywgcGF0aCkgPT4ge1xuICAgICAgICAgIC8vIFNwbGl0IGVhY2ggcGF0aHMgb24gLiAoYS5iLmMgLT4gW2EsYixjXSlcbiAgICAgICAgICAvLyByZWR1Y2UgdG8gY3JlYXRlIGFsbCBwYXRoc1xuICAgICAgICAgIC8vIChbYSxiLGNdIC0+IHthOiB0cnVlLCAnYS5iJzogdHJ1ZSwgJ2EuYi5jJzogdHJ1ZX0pXG4gICAgICAgICAgcmV0dXJuIHBhdGguc3BsaXQoJy4nKS5yZWR1Y2UoKG1lbW8sIHBhdGgsIGluZGV4LCBwYXJ0cykgPT4ge1xuICAgICAgICAgICAgbWVtb1twYXJ0cy5zbGljZSgwLCBpbmRleCArIDEpLmpvaW4oJy4nKV0gPSB0cnVlO1xuICAgICAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICAgICAgfSwgbWVtbyk7XG4gICAgICAgIH0sIHt9KTtcblxuICAgICAgICB0aGlzLmluY2x1ZGUgPSBPYmplY3Qua2V5cyhwYXRoU2V0KVxuICAgICAgICAgIC5tYXAocyA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcy5zcGxpdCgnLicpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBhLmxlbmd0aCAtIGIubGVuZ3RoOyAvLyBTb3J0IGJ5IG51bWJlciBvZiBjb21wb25lbnRzXG4gICAgICAgICAgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAncmVkaXJlY3RDbGFzc05hbWVGb3JLZXknOlxuICAgICAgICB0aGlzLnJlZGlyZWN0S2V5ID0gcmVzdE9wdGlvbnMucmVkaXJlY3RDbGFzc05hbWVGb3JLZXk7XG4gICAgICAgIHRoaXMucmVkaXJlY3RDbGFzc05hbWUgPSBudWxsO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGVSZWFkUHJlZmVyZW5jZSc6XG4gICAgICBjYXNlICdzdWJxdWVyeVJlYWRQcmVmZXJlbmNlJzpcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkIG9wdGlvbjogJyArIG9wdGlvbik7XG4gICAgfVxuICB9XG59XG5cbi8vIEEgY29udmVuaWVudCBtZXRob2QgdG8gcGVyZm9ybSBhbGwgdGhlIHN0ZXBzIG9mIHByb2Nlc3NpbmcgYSBxdWVyeVxuLy8gaW4gb3JkZXIuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHJlc3BvbnNlIC0gYW4gb2JqZWN0IHdpdGggb3B0aW9uYWwga2V5c1xuLy8gJ3Jlc3VsdHMnIGFuZCAnY291bnQnLlxuLy8gVE9ETzogY29uc29saWRhdGUgdGhlIHJlcGxhY2VYIGZ1bmN0aW9uc1xuUmVzdFF1ZXJ5LnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24gKGV4ZWN1dGVPcHRpb25zKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmJ1aWxkUmVzdFdoZXJlKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlQWxsKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVFeGNsdWRlS2V5cygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuRmluZChleGVjdXRlT3B0aW9ucyk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5Db3VudCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQWZ0ZXJGaW5kVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG5SZXN0UXVlcnkucHJvdG90eXBlLmVhY2ggPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgY29uc3QgeyBjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgcmVzdFdoZXJlLCByZXN0T3B0aW9ucywgY2xpZW50U0RLIH0gPSB0aGlzO1xuICAvLyBpZiB0aGUgbGltaXQgaXMgc2V0LCB1c2UgaXRcbiAgcmVzdE9wdGlvbnMubGltaXQgPSByZXN0T3B0aW9ucy5saW1pdCB8fCAxMDA7XG4gIHJlc3RPcHRpb25zLm9yZGVyID0gJ29iamVjdElkJztcbiAgbGV0IGZpbmlzaGVkID0gZmFsc2U7XG5cbiAgcmV0dXJuIGNvbnRpbnVlV2hpbGUoXG4gICAgKCkgPT4ge1xuICAgICAgcmV0dXJuICFmaW5pc2hlZDtcbiAgICB9LFxuICAgIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgIGNsaWVudFNESyxcbiAgICAgICAgdGhpcy5ydW5BZnRlckZpbmQsXG4gICAgICAgIHRoaXMuY29udGV4dFxuICAgICAgKTtcbiAgICAgIGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcXVlcnkuZXhlY3V0ZSgpO1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKGNhbGxiYWNrKTtcbiAgICAgIGZpbmlzaGVkID0gcmVzdWx0cy5sZW5ndGggPCByZXN0T3B0aW9ucy5saW1pdDtcbiAgICAgIGlmICghZmluaXNoZWQpIHtcbiAgICAgICAgcmVzdFdoZXJlLm9iamVjdElkID0gT2JqZWN0LmFzc2lnbih7fSwgcmVzdFdoZXJlLm9iamVjdElkLCB7XG4gICAgICAgICAgJGd0OiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV0ub2JqZWN0SWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbn07XG5cblJlc3RRdWVyeS5wcm90b3R5cGUuYnVpbGRSZXN0V2hlcmUgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmdldFVzZXJBbmRSb2xlQUNMKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZWRpcmVjdENsYXNzTmFtZUZvcktleSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlU2VsZWN0KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlRG9udFNlbGVjdCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZUluUXVlcnkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VOb3RJblF1ZXJ5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlRXF1YWxpdHkoKTtcbiAgICB9KTtcbn07XG5cbi8vIFVzZXMgdGhlIEF1dGggb2JqZWN0IHRvIGdldCB0aGUgbGlzdCBvZiByb2xlcywgYWRkcyB0aGUgdXNlciBpZFxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5nZXRVc2VyQW5kUm9sZUFDTCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIHRoaXMuZmluZE9wdGlvbnMuYWNsID0gWycqJ107XG5cbiAgaWYgKHRoaXMuYXV0aC51c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC5nZXRVc2VyUm9sZXMoKS50aGVuKHJvbGVzID0+IHtcbiAgICAgIHRoaXMuZmluZE9wdGlvbnMuYWNsID0gdGhpcy5maW5kT3B0aW9ucy5hY2wuY29uY2F0KHJvbGVzLCBbdGhpcy5hdXRoLnVzZXIuaWRdKTtcbiAgICAgIHJldHVybjtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIENoYW5nZXMgdGhlIGNsYXNzTmFtZSBpZiByZWRpcmVjdENsYXNzTmFtZUZvcktleSBpcyBzZXQuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5yZWRpcmVjdEtleSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdlIG5lZWQgdG8gY2hhbmdlIHRoZSBjbGFzcyBuYW1lIGJhc2VkIG9uIHRoZSBzY2hlbWFcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlZGlyZWN0S2V5KVxuICAgIC50aGVuKG5ld0NsYXNzTmFtZSA9PiB7XG4gICAgICB0aGlzLmNsYXNzTmFtZSA9IG5ld0NsYXNzTmFtZTtcbiAgICAgIHRoaXMucmVkaXJlY3RDbGFzc05hbWUgPSBuZXdDbGFzc05hbWU7XG4gICAgfSk7XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIGNvbmZpZy5cblJlc3RRdWVyeS5wcm90b3R5cGUudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICdUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzICcgKyAnbm9uLWV4aXN0ZW50IGNsYXNzOiAnICsgdGhpcy5jbGFzc05hbWVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybUluUXVlcnkoaW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgaW5RdWVyeU9iamVjdFsnJGluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoaW5RdWVyeU9iamVjdFsnJGluJ10pKSB7XG4gICAgaW5RdWVyeU9iamVjdFsnJGluJ10gPSBpblF1ZXJ5T2JqZWN0WyckaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBpblF1ZXJ5T2JqZWN0WyckaW4nXSA9IHZhbHVlcztcbiAgfVxufVxuXG4vLyBSZXBsYWNlcyBhICRpblF1ZXJ5IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYW5cbi8vICRpblF1ZXJ5IGNsYXVzZS5cbi8vIFRoZSAkaW5RdWVyeSBjbGF1c2UgdHVybnMgaW50byBhbiAkaW4gd2l0aCB2YWx1ZXMgdGhhdCBhcmUganVzdFxuLy8gcG9pbnRlcnMgdG8gdGhlIG9iamVjdHMgcmV0dXJuZWQgaW4gdGhlIHN1YnF1ZXJ5LlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlSW5RdWVyeSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGluUXVlcnlPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRpblF1ZXJ5Jyk7XG4gIGlmICghaW5RdWVyeU9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBpblF1ZXJ5IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSB3aGVyZSBhbmQgY2xhc3NOYW1lXG4gIHZhciBpblF1ZXJ5VmFsdWUgPSBpblF1ZXJ5T2JqZWN0WyckaW5RdWVyeSddO1xuICBpZiAoIWluUXVlcnlWYWx1ZS53aGVyZSB8fCAhaW5RdWVyeVZhbHVlLmNsYXNzTmFtZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJGluUXVlcnknKTtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBpblF1ZXJ5VmFsdWUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHZhciBzdWJxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIGluUXVlcnlWYWx1ZS5jbGFzc05hbWUsXG4gICAgaW5RdWVyeVZhbHVlLndoZXJlLFxuICAgIGFkZGl0aW9uYWxPcHRpb25zXG4gICk7XG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtSW5RdWVyeShpblF1ZXJ5T2JqZWN0LCBzdWJxdWVyeS5jbGFzc05hbWUsIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIFJlY3Vyc2UgdG8gcmVwZWF0XG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZUluUXVlcnkoKTtcbiAgfSk7XG59O1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1Ob3RJblF1ZXJ5KG5vdEluUXVlcnlPYmplY3QsIGNsYXNzTmFtZSwgcmVzdWx0cykge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgdmFsdWVzLnB1c2goe1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgIG9iamVjdElkOiByZXN1bHQub2JqZWN0SWQsXG4gICAgfSk7XG4gIH1cbiAgZGVsZXRlIG5vdEluUXVlcnlPYmplY3RbJyRub3RJblF1ZXJ5J107XG4gIGlmIChBcnJheS5pc0FycmF5KG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSkpIHtcbiAgICBub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10gPSBub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgbm90SW5RdWVyeU9iamVjdFsnJG5pbiddID0gdmFsdWVzO1xuICB9XG59XG5cbi8vIFJlcGxhY2VzIGEgJG5vdEluUXVlcnkgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhblxuLy8gJG5vdEluUXVlcnkgY2xhdXNlLlxuLy8gVGhlICRub3RJblF1ZXJ5IGNsYXVzZSB0dXJucyBpbnRvIGEgJG5pbiB3aXRoIHZhbHVlcyB0aGF0IGFyZSBqdXN0XG4vLyBwb2ludGVycyB0byB0aGUgb2JqZWN0cyByZXR1cm5lZCBpbiB0aGUgc3VicXVlcnkuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VOb3RJblF1ZXJ5ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgbm90SW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJG5vdEluUXVlcnknKTtcbiAgaWYgKCFub3RJblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIG5vdEluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIG5vdEluUXVlcnlWYWx1ZSA9IG5vdEluUXVlcnlPYmplY3RbJyRub3RJblF1ZXJ5J107XG4gIGlmICghbm90SW5RdWVyeVZhbHVlLndoZXJlIHx8ICFub3RJblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkbm90SW5RdWVyeScpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IG5vdEluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgdmFyIHN1YnF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmF1dGgsXG4gICAgbm90SW5RdWVyeVZhbHVlLmNsYXNzTmFtZSxcbiAgICBub3RJblF1ZXJ5VmFsdWUud2hlcmUsXG4gICAgYWRkaXRpb25hbE9wdGlvbnNcbiAgKTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1Ob3RJblF1ZXJ5KG5vdEluUXVlcnlPYmplY3QsIHN1YnF1ZXJ5LmNsYXNzTmFtZSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gUmVjdXJzZSB0byByZXBlYXRcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlTm90SW5RdWVyeSgpO1xuICB9KTtcbn07XG5cbi8vIFVzZWQgdG8gZ2V0IHRoZSBkZWVwZXN0IG9iamVjdCBmcm9tIGpzb24gdXNpbmcgZG90IG5vdGF0aW9uLlxuY29uc3QgZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkgPSAoanNvbiwga2V5LCBpZHgsIHNyYykgPT4ge1xuICBpZiAoa2V5IGluIGpzb24pIHtcbiAgICByZXR1cm4ganNvbltrZXldO1xuICB9XG4gIHNyYy5zcGxpY2UoMSk7IC8vIEV4aXQgRWFybHlcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVNlbGVjdCA9IChzZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgc2VsZWN0T2JqZWN0Wyckc2VsZWN0J107XG4gIGlmIChBcnJheS5pc0FycmF5KHNlbGVjdE9iamVjdFsnJGluJ10pKSB7XG4gICAgc2VsZWN0T2JqZWN0WyckaW4nXSA9IHNlbGVjdE9iamVjdFsnJGluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgc2VsZWN0T2JqZWN0WyckaW4nXSA9IHZhbHVlcztcbiAgfVxufTtcblxuLy8gUmVwbGFjZXMgYSAkc2VsZWN0IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYVxuLy8gJHNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJHNlbGVjdCBjbGF1c2UgdHVybnMgaW50byBhbiAkaW4gd2l0aCB2YWx1ZXMgc2VsZWN0ZWQgb3V0IG9mXG4vLyB0aGUgc3VicXVlcnkuXG4vLyBSZXR1cm5zIGEgcG9zc2libGUtcHJvbWlzZS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZVNlbGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGVjdE9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJHNlbGVjdCcpO1xuICBpZiAoIXNlbGVjdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBzZWxlY3QgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHF1ZXJ5IGFuZCBrZXlcbiAgdmFyIHNlbGVjdFZhbHVlID0gc2VsZWN0T2JqZWN0Wyckc2VsZWN0J107XG4gIC8vIGlPUyBTREsgZG9uJ3Qgc2VuZCB3aGVyZSBpZiBub3Qgc2V0LCBsZXQgaXQgcGFzc1xuICBpZiAoXG4gICAgIXNlbGVjdFZhbHVlLnF1ZXJ5IHx8XG4gICAgIXNlbGVjdFZhbHVlLmtleSB8fFxuICAgIHR5cGVvZiBzZWxlY3RWYWx1ZS5xdWVyeSAhPT0gJ29iamVjdCcgfHxcbiAgICAhc2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lIHx8XG4gICAgT2JqZWN0LmtleXMoc2VsZWN0VmFsdWUpLmxlbmd0aCAhPT0gMlxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRzZWxlY3QnKTtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBzZWxlY3RWYWx1ZS5xdWVyeS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgdmFyIHN1YnF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmF1dGgsXG4gICAgc2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIHNlbGVjdFZhbHVlLnF1ZXJ5LndoZXJlLFxuICAgIGFkZGl0aW9uYWxPcHRpb25zXG4gICk7XG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtU2VsZWN0KHNlbGVjdE9iamVjdCwgc2VsZWN0VmFsdWUua2V5LCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBLZWVwIHJlcGxhY2luZyAkc2VsZWN0IGNsYXVzZXNcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlU2VsZWN0KCk7XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG9udFNlbGVjdCA9IChkb250U2VsZWN0T2JqZWN0LCBrZXksIG9iamVjdHMpID0+IHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2Ygb2JqZWN0cykge1xuICAgIHZhbHVlcy5wdXNoKGtleS5zcGxpdCgnLicpLnJlZHVjZShnZXREZWVwZXN0T2JqZWN0RnJvbUtleSwgcmVzdWx0KSk7XG4gIH1cbiAgZGVsZXRlIGRvbnRTZWxlY3RPYmplY3RbJyRkb250U2VsZWN0J107XG4gIGlmIChBcnJheS5pc0FycmF5KGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSkpIHtcbiAgICBkb250U2VsZWN0T2JqZWN0WyckbmluJ10gPSBkb250U2VsZWN0T2JqZWN0WyckbmluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgZG9udFNlbGVjdE9iamVjdFsnJG5pbiddID0gdmFsdWVzO1xuICB9XG59O1xuXG4vLyBSZXBsYWNlcyBhICRkb250U2VsZWN0IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYVxuLy8gJGRvbnRTZWxlY3QgY2xhdXNlLlxuLy8gVGhlICRkb250U2VsZWN0IGNsYXVzZSB0dXJucyBpbnRvIGFuICRuaW4gd2l0aCB2YWx1ZXMgc2VsZWN0ZWQgb3V0IG9mXG4vLyB0aGUgc3VicXVlcnkuXG4vLyBSZXR1cm5zIGEgcG9zc2libGUtcHJvbWlzZS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZURvbnRTZWxlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBkb250U2VsZWN0T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckZG9udFNlbGVjdCcpO1xuICBpZiAoIWRvbnRTZWxlY3RPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgZG9udFNlbGVjdCB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gcXVlcnkgYW5kIGtleVxuICB2YXIgZG9udFNlbGVjdFZhbHVlID0gZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKFxuICAgICFkb250U2VsZWN0VmFsdWUucXVlcnkgfHxcbiAgICAhZG9udFNlbGVjdFZhbHVlLmtleSB8fFxuICAgIHR5cGVvZiBkb250U2VsZWN0VmFsdWUucXVlcnkgIT09ICdvYmplY3QnIHx8XG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUgfHxcbiAgICBPYmplY3Qua2V5cyhkb250U2VsZWN0VmFsdWUpLmxlbmd0aCAhPT0gMlxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRkb250U2VsZWN0Jyk7XG4gIH1cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgdmFyIHN1YnF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmF1dGgsXG4gICAgZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSxcbiAgICBkb250U2VsZWN0VmFsdWUucXVlcnkud2hlcmUsXG4gICAgYWRkaXRpb25hbE9wdGlvbnNcbiAgKTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1Eb250U2VsZWN0KGRvbnRTZWxlY3RPYmplY3QsIGRvbnRTZWxlY3RWYWx1ZS5rZXksIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIEtlZXAgcmVwbGFjaW5nICRkb250U2VsZWN0IGNsYXVzZXNcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlRG9udFNlbGVjdCgpO1xuICB9KTtcbn07XG5cbmNvbnN0IGNsZWFuUmVzdWx0QXV0aERhdGEgPSBmdW5jdGlvbiAocmVzdWx0KSB7XG4gIGRlbGV0ZSByZXN1bHQucGFzc3dvcmQ7XG4gIGlmIChyZXN1bHQuYXV0aERhdGEpIHtcbiAgICBPYmplY3Qua2V5cyhyZXN1bHQuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgaWYgKHJlc3VsdC5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIHJlc3VsdC5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoT2JqZWN0LmtleXMocmVzdWx0LmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgZGVsZXRlIHJlc3VsdC5hdXRoRGF0YTtcbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHJlcGxhY2VFcXVhbGl0eUNvbnN0cmFpbnQgPSBjb25zdHJhaW50ID0+IHtcbiAgaWYgKHR5cGVvZiBjb25zdHJhaW50ICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBjb25zdHJhaW50O1xuICB9XG4gIGNvbnN0IGVxdWFsVG9PYmplY3QgPSB7fTtcbiAgbGV0IGhhc0RpcmVjdENvbnN0cmFpbnQgPSBmYWxzZTtcbiAgbGV0IGhhc09wZXJhdG9yQ29uc3RyYWludCA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IGtleSBpbiBjb25zdHJhaW50KSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCckJykgIT09IDApIHtcbiAgICAgIGhhc0RpcmVjdENvbnN0cmFpbnQgPSB0cnVlO1xuICAgICAgZXF1YWxUb09iamVjdFtrZXldID0gY29uc3RyYWludFtrZXldO1xuICAgIH0gZWxzZSB7XG4gICAgICBoYXNPcGVyYXRvckNvbnN0cmFpbnQgPSB0cnVlO1xuICAgIH1cbiAgfVxuICBpZiAoaGFzRGlyZWN0Q29uc3RyYWludCAmJiBoYXNPcGVyYXRvckNvbnN0cmFpbnQpIHtcbiAgICBjb25zdHJhaW50WyckZXEnXSA9IGVxdWFsVG9PYmplY3Q7XG4gICAgT2JqZWN0LmtleXMoZXF1YWxUb09iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgZGVsZXRlIGNvbnN0cmFpbnRba2V5XTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gY29uc3RyYWludDtcbn07XG5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZUVxdWFsaXR5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIHRoaXMucmVzdFdoZXJlICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLnJlc3RXaGVyZSkge1xuICAgIHRoaXMucmVzdFdoZXJlW2tleV0gPSByZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50KHRoaXMucmVzdFdoZXJlW2tleV0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hldGhlciBpdCB3YXMgc3VjY2Vzc2Z1bC5cbi8vIFBvcHVsYXRlcyB0aGlzLnJlc3BvbnNlIHdpdGggYW4gb2JqZWN0IHRoYXQgb25seSBoYXMgJ3Jlc3VsdHMnLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5GaW5kID0gZnVuY3Rpb24gKG9wdGlvbnMgPSB7fSkge1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5saW1pdCA9PT0gMCkge1xuICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3VsdHM6IFtdIH07XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIGNvbnN0IGZpbmRPcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5maW5kT3B0aW9ucyk7XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICBmaW5kT3B0aW9ucy5rZXlzID0gdGhpcy5rZXlzLm1hcChrZXkgPT4ge1xuICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpWzBdO1xuICAgIH0pO1xuICB9XG4gIGlmIChvcHRpb25zLm9wKSB7XG4gICAgZmluZE9wdGlvbnMub3AgPSBvcHRpb25zLm9wO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgZmluZE9wdGlvbnMsIHRoaXMuYXV0aClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiBmaW5kT3B0aW9ucy5leHBsYWluICE9PSB0cnVlKSB7XG4gICAgICAgIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgY2xlYW5SZXN1bHRBdXRoRGF0YShyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCByZXN1bHRzKTtcblxuICAgICAgaWYgKHRoaXMucmVkaXJlY3RDbGFzc05hbWUpIHtcbiAgICAgICAgZm9yICh2YXIgciBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgci5jbGFzc05hbWUgPSB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLnJlc3BvbnNlID0geyByZXN1bHRzOiByZXN1bHRzIH07XG4gICAgfSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hldGhlciBpdCB3YXMgc3VjY2Vzc2Z1bC5cbi8vIFBvcHVsYXRlcyB0aGlzLnJlc3BvbnNlLmNvdW50IHdpdGggdGhlIGNvdW50XG5SZXN0UXVlcnkucHJvdG90eXBlLnJ1bkNvdW50ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZG9Db3VudCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmZpbmRPcHRpb25zLmNvdW50ID0gdHJ1ZTtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMuc2tpcDtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMubGltaXQ7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgdGhpcy5maW5kT3B0aW9ucykudGhlbihjID0+IHtcbiAgICB0aGlzLnJlc3BvbnNlLmNvdW50ID0gYztcbiAgfSk7XG59O1xuXG4vLyBBdWdtZW50cyB0aGlzLnJlc3BvbnNlIHdpdGggYWxsIHBvaW50ZXJzIG9uIGFuIG9iamVjdFxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlQWxsID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuaW5jbHVkZUFsbCkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGluY2x1ZGVGaWVsZHMgPSBbXTtcbiAgICAgIGNvbnN0IGtleUZpZWxkcyA9IFtdO1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzY2hlbWEuZmllbGRzKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHx8XG4gICAgICAgICAgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0FycmF5JylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaW5jbHVkZUZpZWxkcy5wdXNoKFtmaWVsZF0pO1xuICAgICAgICAgIGtleUZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gQWRkIGZpZWxkcyB0byBpbmNsdWRlLCBrZXlzLCByZW1vdmUgZHVwc1xuICAgICAgdGhpcy5pbmNsdWRlID0gWy4uLm5ldyBTZXQoWy4uLnRoaXMuaW5jbHVkZSwgLi4uaW5jbHVkZUZpZWxkc10pXTtcbiAgICAgIC8vIGlmIHRoaXMua2V5cyBub3Qgc2V0LCB0aGVuIGFsbCBrZXlzIGFyZSBhbHJlYWR5IGluY2x1ZGVkXG4gICAgICBpZiAodGhpcy5rZXlzKSB7XG4gICAgICAgIHRoaXMua2V5cyA9IFsuLi5uZXcgU2V0KFsuLi50aGlzLmtleXMsIC4uLmtleUZpZWxkc10pXTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cbi8vIFVwZGF0ZXMgcHJvcGVydHkgYHRoaXMua2V5c2AgdG8gY29udGFpbiBhbGwga2V5cyBidXQgdGhlIG9uZXMgdW5zZWxlY3RlZC5cblJlc3RRdWVyeS5wcm90b3R5cGUuaGFuZGxlRXhjbHVkZUtleXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5leGNsdWRlS2V5cykge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGhpcy5rZXlzKSB7XG4gICAgdGhpcy5rZXlzID0gdGhpcy5rZXlzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmxvYWRTY2hlbWEoKVxuICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEodGhpcy5jbGFzc05hbWUpKVxuICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKTtcbiAgICAgIHRoaXMua2V5cyA9IGZpZWxkcy5maWx0ZXIoayA9PiAhdGhpcy5leGNsdWRlS2V5cy5pbmNsdWRlcyhrKSk7XG4gICAgfSk7XG59O1xuXG4vLyBBdWdtZW50cyB0aGlzLnJlc3BvbnNlIHdpdGggZGF0YSBhdCB0aGUgcGF0aHMgcHJvdmlkZWQgaW4gdGhpcy5pbmNsdWRlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pbmNsdWRlLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHBhdGhSZXNwb25zZSA9IGluY2x1ZGVQYXRoKFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICB0aGlzLnJlc3BvbnNlLFxuICAgIHRoaXMuaW5jbHVkZVswXSxcbiAgICB0aGlzLnJlc3RPcHRpb25zXG4gICk7XG4gIGlmIChwYXRoUmVzcG9uc2UudGhlbikge1xuICAgIHJldHVybiBwYXRoUmVzcG9uc2UudGhlbihuZXdSZXNwb25zZSA9PiB7XG4gICAgICB0aGlzLnJlc3BvbnNlID0gbmV3UmVzcG9uc2U7XG4gICAgICB0aGlzLmluY2x1ZGUgPSB0aGlzLmluY2x1ZGUuc2xpY2UoMSk7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gICAgfSk7XG4gIH0gZWxzZSBpZiAodGhpcy5pbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICB0aGlzLmluY2x1ZGUgPSB0aGlzLmluY2x1ZGUuc2xpY2UoMSk7XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZSgpO1xuICB9XG5cbiAgcmV0dXJuIHBhdGhSZXNwb25zZTtcbn07XG5cbi8vUmV0dXJucyBhIHByb21pc2Ugb2YgYSBwcm9jZXNzZWQgc2V0IG9mIHJlc3VsdHNcblJlc3RRdWVyeS5wcm90b3R5cGUucnVuQWZ0ZXJGaW5kVHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghdGhpcy5ydW5BZnRlckZpbmQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYWZ0ZXJGaW5kJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBjb25zdCBoYXNBZnRlckZpbmRIb29rID0gdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyhcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckZpbmQsXG4gICAgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZFxuICApO1xuICBpZiAoIWhhc0FmdGVyRmluZEhvb2spIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gU2tpcCBBZ2dyZWdhdGUgYW5kIERpc3RpbmN0IFF1ZXJpZXNcbiAgaWYgKHRoaXMuZmluZE9wdGlvbnMucGlwZWxpbmUgfHwgdGhpcy5maW5kT3B0aW9ucy5kaXN0aW5jdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNvbnN0IGpzb24gPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLnJlc3RPcHRpb25zKTtcbiAganNvbi53aGVyZSA9IHRoaXMucmVzdFdoZXJlO1xuICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KHRoaXMuY2xhc3NOYW1lKTtcbiAgcGFyc2VRdWVyeS53aXRoSlNPTihqc29uKTtcbiAgLy8gUnVuIGFmdGVyRmluZCB0cmlnZ2VyIGFuZCBzZXQgdGhlIG5ldyByZXN1bHRzXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckZpbmQsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyxcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgcGFyc2VRdWVyeSxcbiAgICAgIHRoaXMuY29udGV4dFxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIC8vIEVuc3VyZSB3ZSBwcm9wZXJseSBzZXQgdGhlIGNsYXNzTmFtZSBiYWNrXG4gICAgICBpZiAodGhpcy5yZWRpcmVjdENsYXNzTmFtZSkge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMgPSByZXN1bHRzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIGlmIChvYmplY3QgaW5zdGFuY2VvZiBQYXJzZS5PYmplY3QpIHtcbiAgICAgICAgICAgIG9iamVjdCA9IG9iamVjdC50b0pTT04oKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0LmNsYXNzTmFtZSA9IHRoaXMucmVkaXJlY3RDbGFzc05hbWU7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMgPSByZXN1bHRzO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gQWRkcyBpbmNsdWRlZCB2YWx1ZXMgdG8gdGhlIHJlc3BvbnNlLlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGQgbmFtZXMuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gYXVnbWVudGVkIHJlc3BvbnNlLlxuZnVuY3Rpb24gaW5jbHVkZVBhdGgoY29uZmlnLCBhdXRoLCByZXNwb25zZSwgcGF0aCwgcmVzdE9wdGlvbnMgPSB7fSkge1xuICB2YXIgcG9pbnRlcnMgPSBmaW5kUG9pbnRlcnMocmVzcG9uc2UucmVzdWx0cywgcGF0aCk7XG4gIGlmIChwb2ludGVycy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuICBjb25zdCBwb2ludGVyc0hhc2ggPSB7fTtcbiAgZm9yICh2YXIgcG9pbnRlciBvZiBwb2ludGVycykge1xuICAgIGlmICghcG9pbnRlcikge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHBvaW50ZXIuY2xhc3NOYW1lO1xuICAgIC8vIG9ubHkgaW5jbHVkZSB0aGUgZ29vZCBwb2ludGVyc1xuICAgIGlmIChjbGFzc05hbWUpIHtcbiAgICAgIHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdID0gcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0gfHwgbmV3IFNldCgpO1xuICAgICAgcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0uYWRkKHBvaW50ZXIub2JqZWN0SWQpO1xuICAgIH1cbiAgfVxuICBjb25zdCBpbmNsdWRlUmVzdE9wdGlvbnMgPSB7fTtcbiAgaWYgKHJlc3RPcHRpb25zLmtleXMpIHtcbiAgICBjb25zdCBrZXlzID0gbmV3IFNldChyZXN0T3B0aW9ucy5rZXlzLnNwbGl0KCcsJykpO1xuICAgIGNvbnN0IGtleVNldCA9IEFycmF5LmZyb20oa2V5cykucmVkdWNlKChzZXQsIGtleSkgPT4ge1xuICAgICAgY29uc3Qga2V5UGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChpOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocGF0aFtpXSAhPSBrZXlQYXRoW2ldKSB7XG4gICAgICAgICAgcmV0dXJuIHNldDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGkgPCBrZXlQYXRoLmxlbmd0aCkge1xuICAgICAgICBzZXQuYWRkKGtleVBhdGhbaV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNldDtcbiAgICB9LCBuZXcgU2V0KCkpO1xuICAgIGlmIChrZXlTZXQuc2l6ZSA+IDApIHtcbiAgICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5rZXlzID0gQXJyYXkuZnJvbShrZXlTZXQpLmpvaW4oJywnKTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAocmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIGNvbnN0IHF1ZXJ5UHJvbWlzZXMgPSBPYmplY3Qua2V5cyhwb2ludGVyc0hhc2gpLm1hcChjbGFzc05hbWUgPT4ge1xuICAgIGNvbnN0IG9iamVjdElkcyA9IEFycmF5LmZyb20ocG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0pO1xuICAgIGxldCB3aGVyZTtcbiAgICBpZiAob2JqZWN0SWRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiBvYmplY3RJZHNbMF0gfTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiB7ICRpbjogb2JqZWN0SWRzIH0gfTtcbiAgICB9XG4gICAgdmFyIHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgd2hlcmUsIGluY2x1ZGVSZXN0T3B0aW9ucyk7XG4gICAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoeyBvcDogJ2dldCcgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHRzKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gR2V0IHRoZSBvYmplY3RzIGZvciBhbGwgdGhlc2Ugb2JqZWN0IGlkc1xuICByZXR1cm4gUHJvbWlzZS5hbGwocXVlcnlQcm9taXNlcykudGhlbihyZXNwb25zZXMgPT4ge1xuICAgIHZhciByZXBsYWNlID0gcmVzcG9uc2VzLnJlZHVjZSgocmVwbGFjZSwgaW5jbHVkZVJlc3BvbnNlKSA9PiB7XG4gICAgICBmb3IgKHZhciBvYmogb2YgaW5jbHVkZVJlc3BvbnNlLnJlc3VsdHMpIHtcbiAgICAgICAgb2JqLl9fdHlwZSA9ICdPYmplY3QnO1xuICAgICAgICBvYmouY2xhc3NOYW1lID0gaW5jbHVkZVJlc3BvbnNlLmNsYXNzTmFtZTtcblxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSA9PSAnX1VzZXInICYmICFhdXRoLmlzTWFzdGVyKSB7XG4gICAgICAgICAgZGVsZXRlIG9iai5zZXNzaW9uVG9rZW47XG4gICAgICAgICAgZGVsZXRlIG9iai5hdXRoRGF0YTtcbiAgICAgICAgfVxuICAgICAgICByZXBsYWNlW29iai5vYmplY3RJZF0gPSBvYmo7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVwbGFjZTtcbiAgICB9LCB7fSk7XG5cbiAgICB2YXIgcmVzcCA9IHtcbiAgICAgIHJlc3VsdHM6IHJlcGxhY2VQb2ludGVycyhyZXNwb25zZS5yZXN1bHRzLCBwYXRoLCByZXBsYWNlKSxcbiAgICB9O1xuICAgIGlmIChyZXNwb25zZS5jb3VudCkge1xuICAgICAgcmVzcC5jb3VudCA9IHJlc3BvbnNlLmNvdW50O1xuICAgIH1cbiAgICByZXR1cm4gcmVzcDtcbiAgfSk7XG59XG5cbi8vIE9iamVjdCBtYXkgYmUgYSBsaXN0IG9mIFJFU1QtZm9ybWF0IG9iamVjdCB0byBmaW5kIHBvaW50ZXJzIGluLCBvclxuLy8gaXQgbWF5IGJlIGEgc2luZ2xlIG9iamVjdC5cbi8vIElmIHRoZSBwYXRoIHlpZWxkcyB0aGluZ3MgdGhhdCBhcmVuJ3QgcG9pbnRlcnMsIHRoaXMgdGhyb3dzIGFuIGVycm9yLlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGRzIHRvIHNlYXJjaCBpbnRvLlxuLy8gUmV0dXJucyBhIGxpc3Qgb2YgcG9pbnRlcnMgaW4gUkVTVCBmb3JtYXQuXG5mdW5jdGlvbiBmaW5kUG9pbnRlcnMob2JqZWN0LCBwYXRoKSB7XG4gIGlmIChvYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhciBhbnN3ZXIgPSBbXTtcbiAgICBmb3IgKHZhciB4IG9mIG9iamVjdCkge1xuICAgICAgYW5zd2VyID0gYW5zd2VyLmNvbmNhdChmaW5kUG9pbnRlcnMoeCwgcGF0aCkpO1xuICAgIH1cbiAgICByZXR1cm4gYW5zd2VyO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8ICFvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT0gMCkge1xuICAgIGlmIChvYmplY3QgPT09IG51bGwgfHwgb2JqZWN0Ll9fdHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICAgIHJldHVybiBbb2JqZWN0XTtcbiAgICB9XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgcmV0dXJuIGZpbmRQb2ludGVycyhzdWJvYmplY3QsIHBhdGguc2xpY2UoMSkpO1xufVxuXG4vLyBPYmplY3QgbWF5IGJlIGEgbGlzdCBvZiBSRVNULWZvcm1hdCBvYmplY3RzIHRvIHJlcGxhY2UgcG9pbnRlcnNcbi8vIGluLCBvciBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGRzIHRvIHNlYXJjaCBpbnRvLlxuLy8gcmVwbGFjZSBpcyBhIG1hcCBmcm9tIG9iamVjdCBpZCAtPiBvYmplY3QuXG4vLyBSZXR1cm5zIHNvbWV0aGluZyBhbmFsb2dvdXMgdG8gb2JqZWN0LCBidXQgd2l0aCB0aGUgYXBwcm9wcmlhdGVcbi8vIHBvaW50ZXJzIGluZmxhdGVkLlxuZnVuY3Rpb24gcmVwbGFjZVBvaW50ZXJzKG9iamVjdCwgcGF0aCwgcmVwbGFjZSkge1xuICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gb2JqZWN0XG4gICAgICAubWFwKG9iaiA9PiByZXBsYWNlUG9pbnRlcnMob2JqLCBwYXRoLCByZXBsYWNlKSlcbiAgICAgIC5maWx0ZXIob2JqID0+IHR5cGVvZiBvYmogIT09ICd1bmRlZmluZWQnKTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChvYmplY3QgJiYgb2JqZWN0Ll9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gcmVwbGFjZVtvYmplY3Qub2JqZWN0SWRdO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIHZhciBuZXdzdWIgPSByZXBsYWNlUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpLCByZXBsYWNlKTtcbiAgdmFyIGFuc3dlciA9IHt9O1xuICBmb3IgKHZhciBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKGtleSA9PSBwYXRoWzBdKSB7XG4gICAgICBhbnN3ZXJba2V5XSA9IG5ld3N1YjtcbiAgICB9IGVsc2Uge1xuICAgICAgYW5zd2VyW2tleV0gPSBvYmplY3Rba2V5XTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFuc3dlcjtcbn1cblxuLy8gRmluZHMgYSBzdWJvYmplY3QgdGhhdCBoYXMgdGhlIGdpdmVuIGtleSwgaWYgdGhlcmUgaXMgb25lLlxuLy8gUmV0dXJucyB1bmRlZmluZWQgb3RoZXJ3aXNlLlxuZnVuY3Rpb24gZmluZE9iamVjdFdpdGhLZXkocm9vdCwga2V5KSB7XG4gIGlmICh0eXBlb2Ygcm9vdCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHJvb3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIGZvciAodmFyIGl0ZW0gb2Ygcm9vdCkge1xuICAgICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkoaXRlbSwga2V5KTtcbiAgICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKHJvb3QgJiYgcm9vdFtrZXldKSB7XG4gICAgcmV0dXJuIHJvb3Q7XG4gIH1cbiAgZm9yICh2YXIgc3Via2V5IGluIHJvb3QpIHtcbiAgICBjb25zdCBhbnN3ZXIgPSBmaW5kT2JqZWN0V2l0aEtleShyb290W3N1YmtleV0sIGtleSk7XG4gICAgaWYgKGFuc3dlcikge1xuICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSZXN0UXVlcnk7XG4iXX0=