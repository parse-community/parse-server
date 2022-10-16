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

  this.include = [];
  let keysForInclude = ''; // If we have keys, we probably want to force some includes (n-1 level)
  // See issue: https://github.com/parse-community/parse-server/issues/3185

  if (Object.prototype.hasOwnProperty.call(restOptions, 'keys')) {
    keysForInclude = restOptions.keys;
  } // If we have keys, we probably want to force some includes (n-1 level)
  // in order to exclude specific keys.


  if (Object.prototype.hasOwnProperty.call(restOptions, 'excludeKeys')) {
    keysForInclude += ',' + restOptions.excludeKeys;
  }

  if (keysForInclude.length > 0) {
    keysForInclude = keysForInclude.split(',').filter(key => {
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

          if (field === '$score' || field === '-$score') {
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
    return this.denyProtectedFields();
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
    if (this.className === '_User' && !findOptions.explain) {
      for (var result of results) {
        this.cleanResultAuthData(result);
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
};

RestQuery.prototype.denyProtectedFields = async function () {
  if (this.auth.isMaster) {
    return;
  }

  const schemaController = await this.config.database.loadSchema();
  const protectedFields = this.config.database.addProtectedFields(schemaController, this.className, this.restWhere, this.findOptions.acl, this.auth, this.findOptions) || [];

  for (const key of protectedFields) {
    if (this.restWhere[key]) {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `This user is not allowed to query ${key} on class ${this.className}`);
    }
  }
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

  if (restOptions.excludeKeys) {
    const excludeKeys = new Set(restOptions.excludeKeys.split(','));
    const excludeKeySet = Array.from(excludeKeys).reduce((set, key) => {
      const keyPath = key.split('.');
      let i = 0;

      for (i; i < path.length; i++) {
        if (path[i] != keyPath[i]) {
          return set;
        }
      }

      if (i == keyPath.length - 1) {
        set.add(keyPath[i]);
      }

      return set;
    }, new Set());

    if (excludeKeySet.size > 0) {
      includeRestOptions.excludeKeys = Array.from(excludeKeySet).join(',');
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0UXVlcnkuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJQYXJzZSIsInRyaWdnZXJzIiwiY29udGludWVXaGlsZSIsIkFsd2F5c1NlbGVjdGVkS2V5cyIsIlJlc3RRdWVyeSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImNsaWVudFNESyIsInJ1bkFmdGVyRmluZCIsImNvbnRleHQiLCJyZXNwb25zZSIsImZpbmRPcHRpb25zIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCIkYW5kIiwiX190eXBlIiwib2JqZWN0SWQiLCJpZCIsImRvQ291bnQiLCJpbmNsdWRlQWxsIiwiaW5jbHVkZSIsImtleXNGb3JJbmNsdWRlIiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwia2V5cyIsImV4Y2x1ZGVLZXlzIiwibGVuZ3RoIiwic3BsaXQiLCJmaWx0ZXIiLCJrZXkiLCJtYXAiLCJzbGljZSIsImxhc3RJbmRleE9mIiwiam9pbiIsIm9wdGlvbiIsImNvbmNhdCIsIkFycmF5IiwiZnJvbSIsIlNldCIsImV4Y2x1ZGUiLCJrIiwiaW5kZXhPZiIsImZpZWxkcyIsIm9yZGVyIiwic29ydCIsInJlZHVjZSIsInNvcnRNYXAiLCJmaWVsZCIsInRyaW0iLCJzY29yZSIsIiRtZXRhIiwicGF0aHMiLCJpbmNsdWRlcyIsInBhdGhTZXQiLCJtZW1vIiwicGF0aCIsImluZGV4IiwicGFydHMiLCJzIiwiYSIsImIiLCJyZWRpcmVjdEtleSIsInJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IiwicmVkaXJlY3RDbGFzc05hbWUiLCJJTlZBTElEX0pTT04iLCJleGVjdXRlIiwiZXhlY3V0ZU9wdGlvbnMiLCJQcm9taXNlIiwicmVzb2x2ZSIsInRoZW4iLCJidWlsZFJlc3RXaGVyZSIsImRlbnlQcm90ZWN0ZWRGaWVsZHMiLCJoYW5kbGVJbmNsdWRlQWxsIiwiaGFuZGxlRXhjbHVkZUtleXMiLCJydW5GaW5kIiwicnVuQ291bnQiLCJoYW5kbGVJbmNsdWRlIiwicnVuQWZ0ZXJGaW5kVHJpZ2dlciIsImVhY2giLCJjYWxsYmFjayIsImxpbWl0IiwiZmluaXNoZWQiLCJxdWVyeSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiYXNzaWduIiwiJGd0IiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJyZXBsYWNlU2VsZWN0IiwicmVwbGFjZURvbnRTZWxlY3QiLCJyZXBsYWNlSW5RdWVyeSIsInJlcGxhY2VOb3RJblF1ZXJ5IiwicmVwbGFjZUVxdWFsaXR5IiwiYWNsIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJkYXRhYmFzZSIsIm5ld0NsYXNzTmFtZSIsImFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsInN5c3RlbUNsYXNzZXMiLCJsb2FkU2NoZW1hIiwic2NoZW1hQ29udHJvbGxlciIsImhhc0NsYXNzIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInRyYW5zZm9ybUluUXVlcnkiLCJpblF1ZXJ5T2JqZWN0IiwidmFsdWVzIiwicmVzdWx0IiwicHVzaCIsImlzQXJyYXkiLCJmaW5kT2JqZWN0V2l0aEtleSIsImluUXVlcnlWYWx1ZSIsIndoZXJlIiwiSU5WQUxJRF9RVUVSWSIsImFkZGl0aW9uYWxPcHRpb25zIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsInJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnkiLCJ0cmFuc2Zvcm1Ob3RJblF1ZXJ5Iiwibm90SW5RdWVyeU9iamVjdCIsIm5vdEluUXVlcnlWYWx1ZSIsImdldERlZXBlc3RPYmplY3RGcm9tS2V5IiwianNvbiIsImlkeCIsInNyYyIsInNwbGljZSIsInRyYW5zZm9ybVNlbGVjdCIsInNlbGVjdE9iamVjdCIsIm9iamVjdHMiLCJzZWxlY3RWYWx1ZSIsInRyYW5zZm9ybURvbnRTZWxlY3QiLCJkb250U2VsZWN0T2JqZWN0IiwiZG9udFNlbGVjdFZhbHVlIiwiY2xlYW5SZXN1bHRBdXRoRGF0YSIsInBhc3N3b3JkIiwiYXV0aERhdGEiLCJwcm92aWRlciIsInJlcGxhY2VFcXVhbGl0eUNvbnN0cmFpbnQiLCJjb25zdHJhaW50IiwiZXF1YWxUb09iamVjdCIsImhhc0RpcmVjdENvbnN0cmFpbnQiLCJoYXNPcGVyYXRvckNvbnN0cmFpbnQiLCJvcHRpb25zIiwib3AiLCJmaW5kIiwiZXhwbGFpbiIsImZpbGVzQ29udHJvbGxlciIsImV4cGFuZEZpbGVzSW5PYmplY3QiLCJyIiwiY291bnQiLCJza2lwIiwiYyIsInByb3RlY3RlZEZpZWxkcyIsImFkZFByb3RlY3RlZEZpZWxkcyIsImdldE9uZVNjaGVtYSIsInNjaGVtYSIsImluY2x1ZGVGaWVsZHMiLCJrZXlGaWVsZHMiLCJ0eXBlIiwicGF0aFJlc3BvbnNlIiwiaW5jbHVkZVBhdGgiLCJuZXdSZXNwb25zZSIsImhhc0FmdGVyRmluZEhvb2siLCJ0cmlnZ2VyRXhpc3RzIiwiVHlwZXMiLCJhZnRlckZpbmQiLCJhcHBsaWNhdGlvbklkIiwicGlwZWxpbmUiLCJkaXN0aW5jdCIsInBhcnNlUXVlcnkiLCJRdWVyeSIsIndpdGhKU09OIiwibWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyIiwib2JqZWN0IiwidG9KU09OIiwicG9pbnRlcnMiLCJmaW5kUG9pbnRlcnMiLCJwb2ludGVyc0hhc2giLCJwb2ludGVyIiwiYWRkIiwiaW5jbHVkZVJlc3RPcHRpb25zIiwia2V5U2V0Iiwic2V0Iiwia2V5UGF0aCIsImkiLCJzaXplIiwiZXhjbHVkZUtleVNldCIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInF1ZXJ5UHJvbWlzZXMiLCJvYmplY3RJZHMiLCIkaW4iLCJhbGwiLCJyZXNwb25zZXMiLCJyZXBsYWNlIiwiaW5jbHVkZVJlc3BvbnNlIiwib2JqIiwic2Vzc2lvblRva2VuIiwicmVzcCIsInJlcGxhY2VQb2ludGVycyIsImFuc3dlciIsIngiLCJzdWJvYmplY3QiLCJuZXdzdWIiLCJyb290IiwiaXRlbSIsInN1YmtleSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQUQsQ0FBOUI7O0FBQ0EsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBRCxDQUFQLENBQXNCQyxLQUFsQzs7QUFDQSxNQUFNQyxRQUFRLEdBQUdGLE9BQU8sQ0FBQyxZQUFELENBQXhCOztBQUNBLE1BQU07QUFBRUcsRUFBQUE7QUFBRixJQUFvQkgsT0FBTyxDQUFDLDZCQUFELENBQWpDOztBQUNBLE1BQU1JLGtCQUFrQixHQUFHLENBQUMsVUFBRCxFQUFhLFdBQWIsRUFBMEIsV0FBMUIsRUFBdUMsS0FBdkMsQ0FBM0IsQyxDQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFDQSxTQUFTQyxTQUFULENBQ0VDLE1BREYsRUFFRUMsSUFGRixFQUdFQyxTQUhGLEVBSUVDLFNBQVMsR0FBRyxFQUpkLEVBS0VDLFdBQVcsR0FBRyxFQUxoQixFQU1FQyxTQU5GLEVBT0VDLFlBQVksR0FBRyxJQVBqQixFQVFFQyxPQVJGLEVBU0U7QUFDQSxPQUFLUCxNQUFMLEdBQWNBLE1BQWQ7QUFDQSxPQUFLQyxJQUFMLEdBQVlBLElBQVo7QUFDQSxPQUFLQyxTQUFMLEdBQWlCQSxTQUFqQjtBQUNBLE9BQUtDLFNBQUwsR0FBaUJBLFNBQWpCO0FBQ0EsT0FBS0MsV0FBTCxHQUFtQkEsV0FBbkI7QUFDQSxPQUFLQyxTQUFMLEdBQWlCQSxTQUFqQjtBQUNBLE9BQUtDLFlBQUwsR0FBb0JBLFlBQXBCO0FBQ0EsT0FBS0UsUUFBTCxHQUFnQixJQUFoQjtBQUNBLE9BQUtDLFdBQUwsR0FBbUIsRUFBbkI7QUFDQSxPQUFLRixPQUFMLEdBQWVBLE9BQU8sSUFBSSxFQUExQjs7QUFDQSxNQUFJLENBQUMsS0FBS04sSUFBTCxDQUFVUyxRQUFmLEVBQXlCO0FBQ3ZCLFFBQUksS0FBS1IsU0FBTCxJQUFrQixVQUF0QixFQUFrQztBQUNoQyxVQUFJLENBQUMsS0FBS0QsSUFBTCxDQUFVVSxJQUFmLEVBQXFCO0FBQ25CLGNBQU0sSUFBSWhCLEtBQUssQ0FBQ2lCLEtBQVYsQ0FBZ0JqQixLQUFLLENBQUNpQixLQUFOLENBQVlDLHFCQUE1QixFQUFtRCx1QkFBbkQsQ0FBTjtBQUNEOztBQUNELFdBQUtWLFNBQUwsR0FBaUI7QUFDZlcsUUFBQUEsSUFBSSxFQUFFLENBQ0osS0FBS1gsU0FERCxFQUVKO0FBQ0VRLFVBQUFBLElBQUksRUFBRTtBQUNKSSxZQUFBQSxNQUFNLEVBQUUsU0FESjtBQUVKYixZQUFBQSxTQUFTLEVBQUUsT0FGUDtBQUdKYyxZQUFBQSxRQUFRLEVBQUUsS0FBS2YsSUFBTCxDQUFVVSxJQUFWLENBQWVNO0FBSHJCO0FBRFIsU0FGSTtBQURTLE9BQWpCO0FBWUQ7QUFDRjs7QUFFRCxPQUFLQyxPQUFMLEdBQWUsS0FBZjtBQUNBLE9BQUtDLFVBQUwsR0FBa0IsS0FBbEIsQ0FoQ0EsQ0FrQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUNBLE9BQUtDLE9BQUwsR0FBZSxFQUFmO0FBQ0EsTUFBSUMsY0FBYyxHQUFHLEVBQXJCLENBekNBLENBMkNBO0FBQ0E7O0FBQ0EsTUFBSUMsTUFBTSxDQUFDQyxTQUFQLENBQWlCQyxjQUFqQixDQUFnQ0MsSUFBaEMsQ0FBcUNyQixXQUFyQyxFQUFrRCxNQUFsRCxDQUFKLEVBQStEO0FBQzdEaUIsSUFBQUEsY0FBYyxHQUFHakIsV0FBVyxDQUFDc0IsSUFBN0I7QUFDRCxHQS9DRCxDQWlEQTtBQUNBOzs7QUFDQSxNQUFJSixNQUFNLENBQUNDLFNBQVAsQ0FBaUJDLGNBQWpCLENBQWdDQyxJQUFoQyxDQUFxQ3JCLFdBQXJDLEVBQWtELGFBQWxELENBQUosRUFBc0U7QUFDcEVpQixJQUFBQSxjQUFjLElBQUksTUFBTWpCLFdBQVcsQ0FBQ3VCLFdBQXBDO0FBQ0Q7O0FBRUQsTUFBSU4sY0FBYyxDQUFDTyxNQUFmLEdBQXdCLENBQTVCLEVBQStCO0FBQzdCUCxJQUFBQSxjQUFjLEdBQUdBLGNBQWMsQ0FDNUJRLEtBRGMsQ0FDUixHQURRLEVBRWRDLE1BRmMsQ0FFUEMsR0FBRyxJQUFJO0FBQ2I7QUFDQSxhQUFPQSxHQUFHLENBQUNGLEtBQUosQ0FBVSxHQUFWLEVBQWVELE1BQWYsR0FBd0IsQ0FBL0I7QUFDRCxLQUxjLEVBTWRJLEdBTmMsQ0FNVkQsR0FBRyxJQUFJO0FBQ1Y7QUFDQTtBQUNBLGFBQU9BLEdBQUcsQ0FBQ0UsS0FBSixDQUFVLENBQVYsRUFBYUYsR0FBRyxDQUFDRyxXQUFKLENBQWdCLEdBQWhCLENBQWIsQ0FBUDtBQUNELEtBVmMsRUFXZEMsSUFYYyxDQVdULEdBWFMsQ0FBakIsQ0FENkIsQ0FjN0I7QUFDQTs7QUFDQSxRQUFJZCxjQUFjLENBQUNPLE1BQWYsR0FBd0IsQ0FBNUIsRUFBK0I7QUFDN0IsVUFBSSxDQUFDeEIsV0FBVyxDQUFDZ0IsT0FBYixJQUF3QmhCLFdBQVcsQ0FBQ2dCLE9BQVosQ0FBb0JRLE1BQXBCLElBQThCLENBQTFELEVBQTZEO0FBQzNEeEIsUUFBQUEsV0FBVyxDQUFDZ0IsT0FBWixHQUFzQkMsY0FBdEI7QUFDRCxPQUZELE1BRU87QUFDTGpCLFFBQUFBLFdBQVcsQ0FBQ2dCLE9BQVosSUFBdUIsTUFBTUMsY0FBN0I7QUFDRDtBQUNGO0FBQ0Y7O0FBRUQsT0FBSyxJQUFJZSxNQUFULElBQW1CaEMsV0FBbkIsRUFBZ0M7QUFDOUIsWUFBUWdDLE1BQVI7QUFDRSxXQUFLLE1BQUw7QUFBYTtBQUNYLGdCQUFNVixJQUFJLEdBQUd0QixXQUFXLENBQUNzQixJQUFaLENBQ1ZHLEtBRFUsQ0FDSixHQURJLEVBRVZDLE1BRlUsQ0FFSEMsR0FBRyxJQUFJQSxHQUFHLENBQUNILE1BQUosR0FBYSxDQUZqQixFQUdWUyxNQUhVLENBR0h2QyxrQkFIRyxDQUFiO0FBSUEsZUFBSzRCLElBQUwsR0FBWVksS0FBSyxDQUFDQyxJQUFOLENBQVcsSUFBSUMsR0FBSixDQUFRZCxJQUFSLENBQVgsQ0FBWjtBQUNBO0FBQ0Q7O0FBQ0QsV0FBSyxhQUFMO0FBQW9CO0FBQ2xCLGdCQUFNZSxPQUFPLEdBQUdyQyxXQUFXLENBQUN1QixXQUFaLENBQ2JFLEtBRGEsQ0FDUCxHQURPLEVBRWJDLE1BRmEsQ0FFTlksQ0FBQyxJQUFJNUMsa0JBQWtCLENBQUM2QyxPQUFuQixDQUEyQkQsQ0FBM0IsSUFBZ0MsQ0FGL0IsQ0FBaEI7QUFHQSxlQUFLZixXQUFMLEdBQW1CVyxLQUFLLENBQUNDLElBQU4sQ0FBVyxJQUFJQyxHQUFKLENBQVFDLE9BQVIsQ0FBWCxDQUFuQjtBQUNBO0FBQ0Q7O0FBQ0QsV0FBSyxPQUFMO0FBQ0UsYUFBS3ZCLE9BQUwsR0FBZSxJQUFmO0FBQ0E7O0FBQ0YsV0FBSyxZQUFMO0FBQ0UsYUFBS0MsVUFBTCxHQUFrQixJQUFsQjtBQUNBOztBQUNGLFdBQUssU0FBTDtBQUNBLFdBQUssTUFBTDtBQUNBLFdBQUssVUFBTDtBQUNBLFdBQUssVUFBTDtBQUNBLFdBQUssTUFBTDtBQUNBLFdBQUssT0FBTDtBQUNBLFdBQUssZ0JBQUw7QUFDRSxhQUFLVixXQUFMLENBQWlCMkIsTUFBakIsSUFBMkJoQyxXQUFXLENBQUNnQyxNQUFELENBQXRDO0FBQ0E7O0FBQ0YsV0FBSyxPQUFMO0FBQ0UsWUFBSVEsTUFBTSxHQUFHeEMsV0FBVyxDQUFDeUMsS0FBWixDQUFrQmhCLEtBQWxCLENBQXdCLEdBQXhCLENBQWI7QUFDQSxhQUFLcEIsV0FBTCxDQUFpQnFDLElBQWpCLEdBQXdCRixNQUFNLENBQUNHLE1BQVAsQ0FBYyxDQUFDQyxPQUFELEVBQVVDLEtBQVYsS0FBb0I7QUFDeERBLFVBQUFBLEtBQUssR0FBR0EsS0FBSyxDQUFDQyxJQUFOLEVBQVI7O0FBQ0EsY0FBSUQsS0FBSyxLQUFLLFFBQVYsSUFBc0JBLEtBQUssS0FBSyxTQUFwQyxFQUErQztBQUM3Q0QsWUFBQUEsT0FBTyxDQUFDRyxLQUFSLEdBQWdCO0FBQUVDLGNBQUFBLEtBQUssRUFBRTtBQUFULGFBQWhCO0FBQ0QsV0FGRCxNQUVPLElBQUlILEtBQUssQ0FBQyxDQUFELENBQUwsSUFBWSxHQUFoQixFQUFxQjtBQUMxQkQsWUFBQUEsT0FBTyxDQUFDQyxLQUFLLENBQUNoQixLQUFOLENBQVksQ0FBWixDQUFELENBQVAsR0FBMEIsQ0FBQyxDQUEzQjtBQUNELFdBRk0sTUFFQTtBQUNMZSxZQUFBQSxPQUFPLENBQUNDLEtBQUQsQ0FBUCxHQUFpQixDQUFqQjtBQUNEOztBQUNELGlCQUFPRCxPQUFQO0FBQ0QsU0FWdUIsRUFVckIsRUFWcUIsQ0FBeEI7QUFXQTs7QUFDRixXQUFLLFNBQUw7QUFBZ0I7QUFDZCxnQkFBTUssS0FBSyxHQUFHakQsV0FBVyxDQUFDZ0IsT0FBWixDQUFvQlMsS0FBcEIsQ0FBMEIsR0FBMUIsQ0FBZDs7QUFDQSxjQUFJd0IsS0FBSyxDQUFDQyxRQUFOLENBQWUsR0FBZixDQUFKLEVBQXlCO0FBQ3ZCLGlCQUFLbkMsVUFBTCxHQUFrQixJQUFsQjtBQUNBO0FBQ0QsV0FMYSxDQU1kOzs7QUFDQSxnQkFBTW9DLE9BQU8sR0FBR0YsS0FBSyxDQUFDTixNQUFOLENBQWEsQ0FBQ1MsSUFBRCxFQUFPQyxJQUFQLEtBQWdCO0FBQzNDO0FBQ0E7QUFDQTtBQUNBLG1CQUFPQSxJQUFJLENBQUM1QixLQUFMLENBQVcsR0FBWCxFQUFnQmtCLE1BQWhCLENBQXVCLENBQUNTLElBQUQsRUFBT0MsSUFBUCxFQUFhQyxLQUFiLEVBQW9CQyxLQUFwQixLQUE4QjtBQUMxREgsY0FBQUEsSUFBSSxDQUFDRyxLQUFLLENBQUMxQixLQUFOLENBQVksQ0FBWixFQUFleUIsS0FBSyxHQUFHLENBQXZCLEVBQTBCdkIsSUFBMUIsQ0FBK0IsR0FBL0IsQ0FBRCxDQUFKLEdBQTRDLElBQTVDO0FBQ0EscUJBQU9xQixJQUFQO0FBQ0QsYUFITSxFQUdKQSxJQUhJLENBQVA7QUFJRCxXQVJlLEVBUWIsRUFSYSxDQUFoQjtBQVVBLGVBQUtwQyxPQUFMLEdBQWVFLE1BQU0sQ0FBQ0ksSUFBUCxDQUFZNkIsT0FBWixFQUNadkIsR0FEWSxDQUNSNEIsQ0FBQyxJQUFJO0FBQ1IsbUJBQU9BLENBQUMsQ0FBQy9CLEtBQUYsQ0FBUSxHQUFSLENBQVA7QUFDRCxXQUhZLEVBSVppQixJQUpZLENBSVAsQ0FBQ2UsQ0FBRCxFQUFJQyxDQUFKLEtBQVU7QUFDZCxtQkFBT0QsQ0FBQyxDQUFDakMsTUFBRixHQUFXa0MsQ0FBQyxDQUFDbEMsTUFBcEIsQ0FEYyxDQUNjO0FBQzdCLFdBTlksQ0FBZjtBQU9BO0FBQ0Q7O0FBQ0QsV0FBSyx5QkFBTDtBQUNFLGFBQUttQyxXQUFMLEdBQW1CM0QsV0FBVyxDQUFDNEQsdUJBQS9CO0FBQ0EsYUFBS0MsaUJBQUwsR0FBeUIsSUFBekI7QUFDQTs7QUFDRixXQUFLLHVCQUFMO0FBQ0EsV0FBSyx3QkFBTDtBQUNFOztBQUNGO0FBQ0UsY0FBTSxJQUFJdEUsS0FBSyxDQUFDaUIsS0FBVixDQUFnQmpCLEtBQUssQ0FBQ2lCLEtBQU4sQ0FBWXNELFlBQTVCLEVBQTBDLGlCQUFpQjlCLE1BQTNELENBQU47QUEvRUo7QUFpRkQ7QUFDRixDLENBRUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0FyQyxTQUFTLENBQUN3QixTQUFWLENBQW9CNEMsT0FBcEIsR0FBOEIsVUFBVUMsY0FBVixFQUEwQjtBQUN0RCxTQUFPQyxPQUFPLENBQUNDLE9BQVIsR0FDSkMsSUFESSxDQUNDLE1BQU07QUFDVixXQUFPLEtBQUtDLGNBQUwsRUFBUDtBQUNELEdBSEksRUFJSkQsSUFKSSxDQUlDLE1BQU07QUFDVixXQUFPLEtBQUtFLG1CQUFMLEVBQVA7QUFDRCxHQU5JLEVBT0pGLElBUEksQ0FPQyxNQUFNO0FBQ1YsV0FBTyxLQUFLRyxnQkFBTCxFQUFQO0FBQ0QsR0FUSSxFQVVKSCxJQVZJLENBVUMsTUFBTTtBQUNWLFdBQU8sS0FBS0ksaUJBQUwsRUFBUDtBQUNELEdBWkksRUFhSkosSUFiSSxDQWFDLE1BQU07QUFDVixXQUFPLEtBQUtLLE9BQUwsQ0FBYVIsY0FBYixDQUFQO0FBQ0QsR0FmSSxFQWdCSkcsSUFoQkksQ0FnQkMsTUFBTTtBQUNWLFdBQU8sS0FBS00sUUFBTCxFQUFQO0FBQ0QsR0FsQkksRUFtQkpOLElBbkJJLENBbUJDLE1BQU07QUFDVixXQUFPLEtBQUtPLGFBQUwsRUFBUDtBQUNELEdBckJJLEVBc0JKUCxJQXRCSSxDQXNCQyxNQUFNO0FBQ1YsV0FBTyxLQUFLUSxtQkFBTCxFQUFQO0FBQ0QsR0F4QkksRUF5QkpSLElBekJJLENBeUJDLE1BQU07QUFDVixXQUFPLEtBQUsvRCxRQUFaO0FBQ0QsR0EzQkksQ0FBUDtBQTRCRCxDQTdCRDs7QUErQkFULFNBQVMsQ0FBQ3dCLFNBQVYsQ0FBb0J5RCxJQUFwQixHQUEyQixVQUFVQyxRQUFWLEVBQW9CO0FBQzdDLFFBQU07QUFBRWpGLElBQUFBLE1BQUY7QUFBVUMsSUFBQUEsSUFBVjtBQUFnQkMsSUFBQUEsU0FBaEI7QUFBMkJDLElBQUFBLFNBQTNCO0FBQXNDQyxJQUFBQSxXQUF0QztBQUFtREMsSUFBQUE7QUFBbkQsTUFBaUUsSUFBdkUsQ0FENkMsQ0FFN0M7O0FBQ0FELEVBQUFBLFdBQVcsQ0FBQzhFLEtBQVosR0FBb0I5RSxXQUFXLENBQUM4RSxLQUFaLElBQXFCLEdBQXpDO0FBQ0E5RSxFQUFBQSxXQUFXLENBQUN5QyxLQUFaLEdBQW9CLFVBQXBCO0FBQ0EsTUFBSXNDLFFBQVEsR0FBRyxLQUFmO0FBRUEsU0FBT3RGLGFBQWEsQ0FDbEIsTUFBTTtBQUNKLFdBQU8sQ0FBQ3NGLFFBQVI7QUFDRCxHQUhpQixFQUlsQixZQUFZO0FBQ1YsVUFBTUMsS0FBSyxHQUFHLElBQUlyRixTQUFKLENBQ1pDLE1BRFksRUFFWkMsSUFGWSxFQUdaQyxTQUhZLEVBSVpDLFNBSlksRUFLWkMsV0FMWSxFQU1aQyxTQU5ZLEVBT1osS0FBS0MsWUFQTyxFQVFaLEtBQUtDLE9BUk8sQ0FBZDtBQVVBLFVBQU07QUFBRThFLE1BQUFBO0FBQUYsUUFBYyxNQUFNRCxLQUFLLENBQUNqQixPQUFOLEVBQTFCO0FBQ0FrQixJQUFBQSxPQUFPLENBQUNDLE9BQVIsQ0FBZ0JMLFFBQWhCO0FBQ0FFLElBQUFBLFFBQVEsR0FBR0UsT0FBTyxDQUFDekQsTUFBUixHQUFpQnhCLFdBQVcsQ0FBQzhFLEtBQXhDOztBQUNBLFFBQUksQ0FBQ0MsUUFBTCxFQUFlO0FBQ2JoRixNQUFBQSxTQUFTLENBQUNhLFFBQVYsR0FBcUJNLE1BQU0sQ0FBQ2lFLE1BQVAsQ0FBYyxFQUFkLEVBQWtCcEYsU0FBUyxDQUFDYSxRQUE1QixFQUFzQztBQUN6RHdFLFFBQUFBLEdBQUcsRUFBRUgsT0FBTyxDQUFDQSxPQUFPLENBQUN6RCxNQUFSLEdBQWlCLENBQWxCLENBQVAsQ0FBNEJaO0FBRHdCLE9BQXRDLENBQXJCO0FBR0Q7QUFDRixHQXZCaUIsQ0FBcEI7QUF5QkQsQ0FoQ0Q7O0FBa0NBakIsU0FBUyxDQUFDd0IsU0FBVixDQUFvQmlELGNBQXBCLEdBQXFDLFlBQVk7QUFDL0MsU0FBT0gsT0FBTyxDQUFDQyxPQUFSLEdBQ0pDLElBREksQ0FDQyxNQUFNO0FBQ1YsV0FBTyxLQUFLa0IsaUJBQUwsRUFBUDtBQUNELEdBSEksRUFJSmxCLElBSkksQ0FJQyxNQUFNO0FBQ1YsV0FBTyxLQUFLUCx1QkFBTCxFQUFQO0FBQ0QsR0FOSSxFQU9KTyxJQVBJLENBT0MsTUFBTTtBQUNWLFdBQU8sS0FBS21CLDJCQUFMLEVBQVA7QUFDRCxHQVRJLEVBVUpuQixJQVZJLENBVUMsTUFBTTtBQUNWLFdBQU8sS0FBS29CLGFBQUwsRUFBUDtBQUNELEdBWkksRUFhSnBCLElBYkksQ0FhQyxNQUFNO0FBQ1YsV0FBTyxLQUFLcUIsaUJBQUwsRUFBUDtBQUNELEdBZkksRUFnQkpyQixJQWhCSSxDQWdCQyxNQUFNO0FBQ1YsV0FBTyxLQUFLc0IsY0FBTCxFQUFQO0FBQ0QsR0FsQkksRUFtQkp0QixJQW5CSSxDQW1CQyxNQUFNO0FBQ1YsV0FBTyxLQUFLdUIsaUJBQUwsRUFBUDtBQUNELEdBckJJLEVBc0JKdkIsSUF0QkksQ0FzQkMsTUFBTTtBQUNWLFdBQU8sS0FBS3dCLGVBQUwsRUFBUDtBQUNELEdBeEJJLENBQVA7QUF5QkQsQ0ExQkQsQyxDQTRCQTs7O0FBQ0FoRyxTQUFTLENBQUN3QixTQUFWLENBQW9Ca0UsaUJBQXBCLEdBQXdDLFlBQVk7QUFDbEQsTUFBSSxLQUFLeEYsSUFBTCxDQUFVUyxRQUFkLEVBQXdCO0FBQ3RCLFdBQU8yRCxPQUFPLENBQUNDLE9BQVIsRUFBUDtBQUNEOztBQUVELE9BQUs3RCxXQUFMLENBQWlCdUYsR0FBakIsR0FBdUIsQ0FBQyxHQUFELENBQXZCOztBQUVBLE1BQUksS0FBSy9GLElBQUwsQ0FBVVUsSUFBZCxFQUFvQjtBQUNsQixXQUFPLEtBQUtWLElBQUwsQ0FBVWdHLFlBQVYsR0FBeUIxQixJQUF6QixDQUE4QjJCLEtBQUssSUFBSTtBQUM1QyxXQUFLekYsV0FBTCxDQUFpQnVGLEdBQWpCLEdBQXVCLEtBQUt2RixXQUFMLENBQWlCdUYsR0FBakIsQ0FBcUIzRCxNQUFyQixDQUE0QjZELEtBQTVCLEVBQW1DLENBQUMsS0FBS2pHLElBQUwsQ0FBVVUsSUFBVixDQUFlTSxFQUFoQixDQUFuQyxDQUF2QjtBQUNBO0FBQ0QsS0FITSxDQUFQO0FBSUQsR0FMRCxNQUtPO0FBQ0wsV0FBT29ELE9BQU8sQ0FBQ0MsT0FBUixFQUFQO0FBQ0Q7QUFDRixDQWZELEMsQ0FpQkE7QUFDQTs7O0FBQ0F2RSxTQUFTLENBQUN3QixTQUFWLENBQW9CeUMsdUJBQXBCLEdBQThDLFlBQVk7QUFDeEQsTUFBSSxDQUFDLEtBQUtELFdBQVYsRUFBdUI7QUFDckIsV0FBT00sT0FBTyxDQUFDQyxPQUFSLEVBQVA7QUFDRCxHQUh1RCxDQUt4RDs7O0FBQ0EsU0FBTyxLQUFLdEUsTUFBTCxDQUFZbUcsUUFBWixDQUNKbkMsdUJBREksQ0FDb0IsS0FBSzlELFNBRHpCLEVBQ29DLEtBQUs2RCxXQUR6QyxFQUVKUSxJQUZJLENBRUM2QixZQUFZLElBQUk7QUFDcEIsU0FBS2xHLFNBQUwsR0FBaUJrRyxZQUFqQjtBQUNBLFNBQUtuQyxpQkFBTCxHQUF5Qm1DLFlBQXpCO0FBQ0QsR0FMSSxDQUFQO0FBTUQsQ0FaRCxDLENBY0E7OztBQUNBckcsU0FBUyxDQUFDd0IsU0FBVixDQUFvQm1FLDJCQUFwQixHQUFrRCxZQUFZO0FBQzVELE1BQ0UsS0FBSzFGLE1BQUwsQ0FBWXFHLHdCQUFaLEtBQXlDLEtBQXpDLElBQ0EsQ0FBQyxLQUFLcEcsSUFBTCxDQUFVUyxRQURYLElBRUFqQixnQkFBZ0IsQ0FBQzZHLGFBQWpCLENBQStCM0QsT0FBL0IsQ0FBdUMsS0FBS3pDLFNBQTVDLE1BQTJELENBQUMsQ0FIOUQsRUFJRTtBQUNBLFdBQU8sS0FBS0YsTUFBTCxDQUFZbUcsUUFBWixDQUNKSSxVQURJLEdBRUpoQyxJQUZJLENBRUNpQyxnQkFBZ0IsSUFBSUEsZ0JBQWdCLENBQUNDLFFBQWpCLENBQTBCLEtBQUt2RyxTQUEvQixDQUZyQixFQUdKcUUsSUFISSxDQUdDa0MsUUFBUSxJQUFJO0FBQ2hCLFVBQUlBLFFBQVEsS0FBSyxJQUFqQixFQUF1QjtBQUNyQixjQUFNLElBQUk5RyxLQUFLLENBQUNpQixLQUFWLENBQ0pqQixLQUFLLENBQUNpQixLQUFOLENBQVk4RixtQkFEUixFQUVKLHdDQUF3QyxzQkFBeEMsR0FBaUUsS0FBS3hHLFNBRmxFLENBQU47QUFJRDtBQUNGLEtBVkksQ0FBUDtBQVdELEdBaEJELE1BZ0JPO0FBQ0wsV0FBT21FLE9BQU8sQ0FBQ0MsT0FBUixFQUFQO0FBQ0Q7QUFDRixDQXBCRDs7QUFzQkEsU0FBU3FDLGdCQUFULENBQTBCQyxhQUExQixFQUF5QzFHLFNBQXpDLEVBQW9EbUYsT0FBcEQsRUFBNkQ7QUFDM0QsTUFBSXdCLE1BQU0sR0FBRyxFQUFiOztBQUNBLE9BQUssSUFBSUMsTUFBVCxJQUFtQnpCLE9BQW5CLEVBQTRCO0FBQzFCd0IsSUFBQUEsTUFBTSxDQUFDRSxJQUFQLENBQVk7QUFDVmhHLE1BQUFBLE1BQU0sRUFBRSxTQURFO0FBRVZiLE1BQUFBLFNBQVMsRUFBRUEsU0FGRDtBQUdWYyxNQUFBQSxRQUFRLEVBQUU4RixNQUFNLENBQUM5RjtBQUhQLEtBQVo7QUFLRDs7QUFDRCxTQUFPNEYsYUFBYSxDQUFDLFVBQUQsQ0FBcEI7O0FBQ0EsTUFBSXRFLEtBQUssQ0FBQzBFLE9BQU4sQ0FBY0osYUFBYSxDQUFDLEtBQUQsQ0FBM0IsQ0FBSixFQUF5QztBQUN2Q0EsSUFBQUEsYUFBYSxDQUFDLEtBQUQsQ0FBYixHQUF1QkEsYUFBYSxDQUFDLEtBQUQsQ0FBYixDQUFxQnZFLE1BQXJCLENBQTRCd0UsTUFBNUIsQ0FBdkI7QUFDRCxHQUZELE1BRU87QUFDTEQsSUFBQUEsYUFBYSxDQUFDLEtBQUQsQ0FBYixHQUF1QkMsTUFBdkI7QUFDRDtBQUNGLEMsQ0FFRDtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0E5RyxTQUFTLENBQUN3QixTQUFWLENBQW9Cc0UsY0FBcEIsR0FBcUMsWUFBWTtBQUMvQyxNQUFJZSxhQUFhLEdBQUdLLGlCQUFpQixDQUFDLEtBQUs5RyxTQUFOLEVBQWlCLFVBQWpCLENBQXJDOztBQUNBLE1BQUksQ0FBQ3lHLGFBQUwsRUFBb0I7QUFDbEI7QUFDRCxHQUo4QyxDQU0vQzs7O0FBQ0EsTUFBSU0sWUFBWSxHQUFHTixhQUFhLENBQUMsVUFBRCxDQUFoQzs7QUFDQSxNQUFJLENBQUNNLFlBQVksQ0FBQ0MsS0FBZCxJQUF1QixDQUFDRCxZQUFZLENBQUNoSCxTQUF6QyxFQUFvRDtBQUNsRCxVQUFNLElBQUlQLEtBQUssQ0FBQ2lCLEtBQVYsQ0FBZ0JqQixLQUFLLENBQUNpQixLQUFOLENBQVl3RyxhQUE1QixFQUEyQyw0QkFBM0MsQ0FBTjtBQUNEOztBQUVELFFBQU1DLGlCQUFpQixHQUFHO0FBQ3hCckQsSUFBQUEsdUJBQXVCLEVBQUVrRCxZQUFZLENBQUNsRDtBQURkLEdBQTFCOztBQUlBLE1BQUksS0FBSzVELFdBQUwsQ0FBaUJrSCxzQkFBckIsRUFBNkM7QUFDM0NELElBQUFBLGlCQUFpQixDQUFDRSxjQUFsQixHQUFtQyxLQUFLbkgsV0FBTCxDQUFpQmtILHNCQUFwRDtBQUNBRCxJQUFBQSxpQkFBaUIsQ0FBQ0Msc0JBQWxCLEdBQTJDLEtBQUtsSCxXQUFMLENBQWlCa0gsc0JBQTVEO0FBQ0QsR0FIRCxNQUdPLElBQUksS0FBS2xILFdBQUwsQ0FBaUJtSCxjQUFyQixFQUFxQztBQUMxQ0YsSUFBQUEsaUJBQWlCLENBQUNFLGNBQWxCLEdBQW1DLEtBQUtuSCxXQUFMLENBQWlCbUgsY0FBcEQ7QUFDRDs7QUFFRCxNQUFJQyxRQUFRLEdBQUcsSUFBSXpILFNBQUosQ0FDYixLQUFLQyxNQURRLEVBRWIsS0FBS0MsSUFGUSxFQUdiaUgsWUFBWSxDQUFDaEgsU0FIQSxFQUliZ0gsWUFBWSxDQUFDQyxLQUpBLEVBS2JFLGlCQUxhLENBQWY7QUFPQSxTQUFPRyxRQUFRLENBQUNyRCxPQUFULEdBQW1CSSxJQUFuQixDQUF3Qi9ELFFBQVEsSUFBSTtBQUN6Q21HLElBQUFBLGdCQUFnQixDQUFDQyxhQUFELEVBQWdCWSxRQUFRLENBQUN0SCxTQUF6QixFQUFvQ00sUUFBUSxDQUFDNkUsT0FBN0MsQ0FBaEIsQ0FEeUMsQ0FFekM7O0FBQ0EsV0FBTyxLQUFLUSxjQUFMLEVBQVA7QUFDRCxHQUpNLENBQVA7QUFLRCxDQW5DRDs7QUFxQ0EsU0FBUzRCLG1CQUFULENBQTZCQyxnQkFBN0IsRUFBK0N4SCxTQUEvQyxFQUEwRG1GLE9BQTFELEVBQW1FO0FBQ2pFLE1BQUl3QixNQUFNLEdBQUcsRUFBYjs7QUFDQSxPQUFLLElBQUlDLE1BQVQsSUFBbUJ6QixPQUFuQixFQUE0QjtBQUMxQndCLElBQUFBLE1BQU0sQ0FBQ0UsSUFBUCxDQUFZO0FBQ1ZoRyxNQUFBQSxNQUFNLEVBQUUsU0FERTtBQUVWYixNQUFBQSxTQUFTLEVBQUVBLFNBRkQ7QUFHVmMsTUFBQUEsUUFBUSxFQUFFOEYsTUFBTSxDQUFDOUY7QUFIUCxLQUFaO0FBS0Q7O0FBQ0QsU0FBTzBHLGdCQUFnQixDQUFDLGFBQUQsQ0FBdkI7O0FBQ0EsTUFBSXBGLEtBQUssQ0FBQzBFLE9BQU4sQ0FBY1UsZ0JBQWdCLENBQUMsTUFBRCxDQUE5QixDQUFKLEVBQTZDO0FBQzNDQSxJQUFBQSxnQkFBZ0IsQ0FBQyxNQUFELENBQWhCLEdBQTJCQSxnQkFBZ0IsQ0FBQyxNQUFELENBQWhCLENBQXlCckYsTUFBekIsQ0FBZ0N3RSxNQUFoQyxDQUEzQjtBQUNELEdBRkQsTUFFTztBQUNMYSxJQUFBQSxnQkFBZ0IsQ0FBQyxNQUFELENBQWhCLEdBQTJCYixNQUEzQjtBQUNEO0FBQ0YsQyxDQUVEO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQTlHLFNBQVMsQ0FBQ3dCLFNBQVYsQ0FBb0J1RSxpQkFBcEIsR0FBd0MsWUFBWTtBQUNsRCxNQUFJNEIsZ0JBQWdCLEdBQUdULGlCQUFpQixDQUFDLEtBQUs5RyxTQUFOLEVBQWlCLGFBQWpCLENBQXhDOztBQUNBLE1BQUksQ0FBQ3VILGdCQUFMLEVBQXVCO0FBQ3JCO0FBQ0QsR0FKaUQsQ0FNbEQ7OztBQUNBLE1BQUlDLGVBQWUsR0FBR0QsZ0JBQWdCLENBQUMsYUFBRCxDQUF0Qzs7QUFDQSxNQUFJLENBQUNDLGVBQWUsQ0FBQ1IsS0FBakIsSUFBMEIsQ0FBQ1EsZUFBZSxDQUFDekgsU0FBL0MsRUFBMEQ7QUFDeEQsVUFBTSxJQUFJUCxLQUFLLENBQUNpQixLQUFWLENBQWdCakIsS0FBSyxDQUFDaUIsS0FBTixDQUFZd0csYUFBNUIsRUFBMkMsK0JBQTNDLENBQU47QUFDRDs7QUFFRCxRQUFNQyxpQkFBaUIsR0FBRztBQUN4QnJELElBQUFBLHVCQUF1QixFQUFFMkQsZUFBZSxDQUFDM0Q7QUFEakIsR0FBMUI7O0FBSUEsTUFBSSxLQUFLNUQsV0FBTCxDQUFpQmtILHNCQUFyQixFQUE2QztBQUMzQ0QsSUFBQUEsaUJBQWlCLENBQUNFLGNBQWxCLEdBQW1DLEtBQUtuSCxXQUFMLENBQWlCa0gsc0JBQXBEO0FBQ0FELElBQUFBLGlCQUFpQixDQUFDQyxzQkFBbEIsR0FBMkMsS0FBS2xILFdBQUwsQ0FBaUJrSCxzQkFBNUQ7QUFDRCxHQUhELE1BR08sSUFBSSxLQUFLbEgsV0FBTCxDQUFpQm1ILGNBQXJCLEVBQXFDO0FBQzFDRixJQUFBQSxpQkFBaUIsQ0FBQ0UsY0FBbEIsR0FBbUMsS0FBS25ILFdBQUwsQ0FBaUJtSCxjQUFwRDtBQUNEOztBQUVELE1BQUlDLFFBQVEsR0FBRyxJQUFJekgsU0FBSixDQUNiLEtBQUtDLE1BRFEsRUFFYixLQUFLQyxJQUZRLEVBR2IwSCxlQUFlLENBQUN6SCxTQUhILEVBSWJ5SCxlQUFlLENBQUNSLEtBSkgsRUFLYkUsaUJBTGEsQ0FBZjtBQU9BLFNBQU9HLFFBQVEsQ0FBQ3JELE9BQVQsR0FBbUJJLElBQW5CLENBQXdCL0QsUUFBUSxJQUFJO0FBQ3pDaUgsSUFBQUEsbUJBQW1CLENBQUNDLGdCQUFELEVBQW1CRixRQUFRLENBQUN0SCxTQUE1QixFQUF1Q00sUUFBUSxDQUFDNkUsT0FBaEQsQ0FBbkIsQ0FEeUMsQ0FFekM7O0FBQ0EsV0FBTyxLQUFLUyxpQkFBTCxFQUFQO0FBQ0QsR0FKTSxDQUFQO0FBS0QsQ0FuQ0QsQyxDQXFDQTs7O0FBQ0EsTUFBTThCLHVCQUF1QixHQUFHLENBQUNDLElBQUQsRUFBTzlGLEdBQVAsRUFBWStGLEdBQVosRUFBaUJDLEdBQWpCLEtBQXlCO0FBQ3ZELE1BQUloRyxHQUFHLElBQUk4RixJQUFYLEVBQWlCO0FBQ2YsV0FBT0EsSUFBSSxDQUFDOUYsR0FBRCxDQUFYO0FBQ0Q7O0FBQ0RnRyxFQUFBQSxHQUFHLENBQUNDLE1BQUosQ0FBVyxDQUFYLEVBSnVELENBSXhDO0FBQ2hCLENBTEQ7O0FBT0EsTUFBTUMsZUFBZSxHQUFHLENBQUNDLFlBQUQsRUFBZW5HLEdBQWYsRUFBb0JvRyxPQUFwQixLQUFnQztBQUN0RCxNQUFJdEIsTUFBTSxHQUFHLEVBQWI7O0FBQ0EsT0FBSyxJQUFJQyxNQUFULElBQW1CcUIsT0FBbkIsRUFBNEI7QUFDMUJ0QixJQUFBQSxNQUFNLENBQUNFLElBQVAsQ0FBWWhGLEdBQUcsQ0FBQ0YsS0FBSixDQUFVLEdBQVYsRUFBZWtCLE1BQWYsQ0FBc0I2RSx1QkFBdEIsRUFBK0NkLE1BQS9DLENBQVo7QUFDRDs7QUFDRCxTQUFPb0IsWUFBWSxDQUFDLFNBQUQsQ0FBbkI7O0FBQ0EsTUFBSTVGLEtBQUssQ0FBQzBFLE9BQU4sQ0FBY2tCLFlBQVksQ0FBQyxLQUFELENBQTFCLENBQUosRUFBd0M7QUFDdENBLElBQUFBLFlBQVksQ0FBQyxLQUFELENBQVosR0FBc0JBLFlBQVksQ0FBQyxLQUFELENBQVosQ0FBb0I3RixNQUFwQixDQUEyQndFLE1BQTNCLENBQXRCO0FBQ0QsR0FGRCxNQUVPO0FBQ0xxQixJQUFBQSxZQUFZLENBQUMsS0FBRCxDQUFaLEdBQXNCckIsTUFBdEI7QUFDRDtBQUNGLENBWEQsQyxDQWFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNBOUcsU0FBUyxDQUFDd0IsU0FBVixDQUFvQm9FLGFBQXBCLEdBQW9DLFlBQVk7QUFDOUMsTUFBSXVDLFlBQVksR0FBR2pCLGlCQUFpQixDQUFDLEtBQUs5RyxTQUFOLEVBQWlCLFNBQWpCLENBQXBDOztBQUNBLE1BQUksQ0FBQytILFlBQUwsRUFBbUI7QUFDakI7QUFDRCxHQUo2QyxDQU05Qzs7O0FBQ0EsTUFBSUUsV0FBVyxHQUFHRixZQUFZLENBQUMsU0FBRCxDQUE5QixDQVA4QyxDQVE5Qzs7QUFDQSxNQUNFLENBQUNFLFdBQVcsQ0FBQ2hELEtBQWIsSUFDQSxDQUFDZ0QsV0FBVyxDQUFDckcsR0FEYixJQUVBLE9BQU9xRyxXQUFXLENBQUNoRCxLQUFuQixLQUE2QixRQUY3QixJQUdBLENBQUNnRCxXQUFXLENBQUNoRCxLQUFaLENBQWtCbEYsU0FIbkIsSUFJQW9CLE1BQU0sQ0FBQ0ksSUFBUCxDQUFZMEcsV0FBWixFQUF5QnhHLE1BQXpCLEtBQW9DLENBTHRDLEVBTUU7QUFDQSxVQUFNLElBQUlqQyxLQUFLLENBQUNpQixLQUFWLENBQWdCakIsS0FBSyxDQUFDaUIsS0FBTixDQUFZd0csYUFBNUIsRUFBMkMsMkJBQTNDLENBQU47QUFDRDs7QUFFRCxRQUFNQyxpQkFBaUIsR0FBRztBQUN4QnJELElBQUFBLHVCQUF1QixFQUFFb0UsV0FBVyxDQUFDaEQsS0FBWixDQUFrQnBCO0FBRG5CLEdBQTFCOztBQUlBLE1BQUksS0FBSzVELFdBQUwsQ0FBaUJrSCxzQkFBckIsRUFBNkM7QUFDM0NELElBQUFBLGlCQUFpQixDQUFDRSxjQUFsQixHQUFtQyxLQUFLbkgsV0FBTCxDQUFpQmtILHNCQUFwRDtBQUNBRCxJQUFBQSxpQkFBaUIsQ0FBQ0Msc0JBQWxCLEdBQTJDLEtBQUtsSCxXQUFMLENBQWlCa0gsc0JBQTVEO0FBQ0QsR0FIRCxNQUdPLElBQUksS0FBS2xILFdBQUwsQ0FBaUJtSCxjQUFyQixFQUFxQztBQUMxQ0YsSUFBQUEsaUJBQWlCLENBQUNFLGNBQWxCLEdBQW1DLEtBQUtuSCxXQUFMLENBQWlCbUgsY0FBcEQ7QUFDRDs7QUFFRCxNQUFJQyxRQUFRLEdBQUcsSUFBSXpILFNBQUosQ0FDYixLQUFLQyxNQURRLEVBRWIsS0FBS0MsSUFGUSxFQUdibUksV0FBVyxDQUFDaEQsS0FBWixDQUFrQmxGLFNBSEwsRUFJYmtJLFdBQVcsQ0FBQ2hELEtBQVosQ0FBa0IrQixLQUpMLEVBS2JFLGlCQUxhLENBQWY7QUFPQSxTQUFPRyxRQUFRLENBQUNyRCxPQUFULEdBQW1CSSxJQUFuQixDQUF3Qi9ELFFBQVEsSUFBSTtBQUN6Q3lILElBQUFBLGVBQWUsQ0FBQ0MsWUFBRCxFQUFlRSxXQUFXLENBQUNyRyxHQUEzQixFQUFnQ3ZCLFFBQVEsQ0FBQzZFLE9BQXpDLENBQWYsQ0FEeUMsQ0FFekM7O0FBQ0EsV0FBTyxLQUFLTSxhQUFMLEVBQVA7QUFDRCxHQUpNLENBQVA7QUFLRCxDQTFDRDs7QUE0Q0EsTUFBTTBDLG1CQUFtQixHQUFHLENBQUNDLGdCQUFELEVBQW1CdkcsR0FBbkIsRUFBd0JvRyxPQUF4QixLQUFvQztBQUM5RCxNQUFJdEIsTUFBTSxHQUFHLEVBQWI7O0FBQ0EsT0FBSyxJQUFJQyxNQUFULElBQW1CcUIsT0FBbkIsRUFBNEI7QUFDMUJ0QixJQUFBQSxNQUFNLENBQUNFLElBQVAsQ0FBWWhGLEdBQUcsQ0FBQ0YsS0FBSixDQUFVLEdBQVYsRUFBZWtCLE1BQWYsQ0FBc0I2RSx1QkFBdEIsRUFBK0NkLE1BQS9DLENBQVo7QUFDRDs7QUFDRCxTQUFPd0IsZ0JBQWdCLENBQUMsYUFBRCxDQUF2Qjs7QUFDQSxNQUFJaEcsS0FBSyxDQUFDMEUsT0FBTixDQUFjc0IsZ0JBQWdCLENBQUMsTUFBRCxDQUE5QixDQUFKLEVBQTZDO0FBQzNDQSxJQUFBQSxnQkFBZ0IsQ0FBQyxNQUFELENBQWhCLEdBQTJCQSxnQkFBZ0IsQ0FBQyxNQUFELENBQWhCLENBQXlCakcsTUFBekIsQ0FBZ0N3RSxNQUFoQyxDQUEzQjtBQUNELEdBRkQsTUFFTztBQUNMeUIsSUFBQUEsZ0JBQWdCLENBQUMsTUFBRCxDQUFoQixHQUEyQnpCLE1BQTNCO0FBQ0Q7QUFDRixDQVhELEMsQ0FhQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQTlHLFNBQVMsQ0FBQ3dCLFNBQVYsQ0FBb0JxRSxpQkFBcEIsR0FBd0MsWUFBWTtBQUNsRCxNQUFJMEMsZ0JBQWdCLEdBQUdyQixpQkFBaUIsQ0FBQyxLQUFLOUcsU0FBTixFQUFpQixhQUFqQixDQUF4Qzs7QUFDQSxNQUFJLENBQUNtSSxnQkFBTCxFQUF1QjtBQUNyQjtBQUNELEdBSmlELENBTWxEOzs7QUFDQSxNQUFJQyxlQUFlLEdBQUdELGdCQUFnQixDQUFDLGFBQUQsQ0FBdEM7O0FBQ0EsTUFDRSxDQUFDQyxlQUFlLENBQUNuRCxLQUFqQixJQUNBLENBQUNtRCxlQUFlLENBQUN4RyxHQURqQixJQUVBLE9BQU93RyxlQUFlLENBQUNuRCxLQUF2QixLQUFpQyxRQUZqQyxJQUdBLENBQUNtRCxlQUFlLENBQUNuRCxLQUFoQixDQUFzQmxGLFNBSHZCLElBSUFvQixNQUFNLENBQUNJLElBQVAsQ0FBWTZHLGVBQVosRUFBNkIzRyxNQUE3QixLQUF3QyxDQUwxQyxFQU1FO0FBQ0EsVUFBTSxJQUFJakMsS0FBSyxDQUFDaUIsS0FBVixDQUFnQmpCLEtBQUssQ0FBQ2lCLEtBQU4sQ0FBWXdHLGFBQTVCLEVBQTJDLCtCQUEzQyxDQUFOO0FBQ0Q7O0FBQ0QsUUFBTUMsaUJBQWlCLEdBQUc7QUFDeEJyRCxJQUFBQSx1QkFBdUIsRUFBRXVFLGVBQWUsQ0FBQ25ELEtBQWhCLENBQXNCcEI7QUFEdkIsR0FBMUI7O0FBSUEsTUFBSSxLQUFLNUQsV0FBTCxDQUFpQmtILHNCQUFyQixFQUE2QztBQUMzQ0QsSUFBQUEsaUJBQWlCLENBQUNFLGNBQWxCLEdBQW1DLEtBQUtuSCxXQUFMLENBQWlCa0gsc0JBQXBEO0FBQ0FELElBQUFBLGlCQUFpQixDQUFDQyxzQkFBbEIsR0FBMkMsS0FBS2xILFdBQUwsQ0FBaUJrSCxzQkFBNUQ7QUFDRCxHQUhELE1BR08sSUFBSSxLQUFLbEgsV0FBTCxDQUFpQm1ILGNBQXJCLEVBQXFDO0FBQzFDRixJQUFBQSxpQkFBaUIsQ0FBQ0UsY0FBbEIsR0FBbUMsS0FBS25ILFdBQUwsQ0FBaUJtSCxjQUFwRDtBQUNEOztBQUVELE1BQUlDLFFBQVEsR0FBRyxJQUFJekgsU0FBSixDQUNiLEtBQUtDLE1BRFEsRUFFYixLQUFLQyxJQUZRLEVBR2JzSSxlQUFlLENBQUNuRCxLQUFoQixDQUFzQmxGLFNBSFQsRUFJYnFJLGVBQWUsQ0FBQ25ELEtBQWhCLENBQXNCK0IsS0FKVCxFQUtiRSxpQkFMYSxDQUFmO0FBT0EsU0FBT0csUUFBUSxDQUFDckQsT0FBVCxHQUFtQkksSUFBbkIsQ0FBd0IvRCxRQUFRLElBQUk7QUFDekM2SCxJQUFBQSxtQkFBbUIsQ0FBQ0MsZ0JBQUQsRUFBbUJDLGVBQWUsQ0FBQ3hHLEdBQW5DLEVBQXdDdkIsUUFBUSxDQUFDNkUsT0FBakQsQ0FBbkIsQ0FEeUMsQ0FFekM7O0FBQ0EsV0FBTyxLQUFLTyxpQkFBTCxFQUFQO0FBQ0QsR0FKTSxDQUFQO0FBS0QsQ0F4Q0Q7O0FBMENBN0YsU0FBUyxDQUFDd0IsU0FBVixDQUFvQmlILG1CQUFwQixHQUEwQyxVQUFVMUIsTUFBVixFQUFrQjtBQUMxRCxTQUFPQSxNQUFNLENBQUMyQixRQUFkOztBQUNBLE1BQUkzQixNQUFNLENBQUM0QixRQUFYLEVBQXFCO0FBQ25CcEgsSUFBQUEsTUFBTSxDQUFDSSxJQUFQLENBQVlvRixNQUFNLENBQUM0QixRQUFuQixFQUE2QnBELE9BQTdCLENBQXFDcUQsUUFBUSxJQUFJO0FBQy9DLFVBQUk3QixNQUFNLENBQUM0QixRQUFQLENBQWdCQyxRQUFoQixNQUE4QixJQUFsQyxFQUF3QztBQUN0QyxlQUFPN0IsTUFBTSxDQUFDNEIsUUFBUCxDQUFnQkMsUUFBaEIsQ0FBUDtBQUNEO0FBQ0YsS0FKRDs7QUFNQSxRQUFJckgsTUFBTSxDQUFDSSxJQUFQLENBQVlvRixNQUFNLENBQUM0QixRQUFuQixFQUE2QjlHLE1BQTdCLElBQXVDLENBQTNDLEVBQThDO0FBQzVDLGFBQU9rRixNQUFNLENBQUM0QixRQUFkO0FBQ0Q7QUFDRjtBQUNGLENBYkQ7O0FBZUEsTUFBTUUseUJBQXlCLEdBQUdDLFVBQVUsSUFBSTtBQUM5QyxNQUFJLE9BQU9BLFVBQVAsS0FBc0IsUUFBMUIsRUFBb0M7QUFDbEMsV0FBT0EsVUFBUDtBQUNEOztBQUNELFFBQU1DLGFBQWEsR0FBRyxFQUF0QjtBQUNBLE1BQUlDLG1CQUFtQixHQUFHLEtBQTFCO0FBQ0EsTUFBSUMscUJBQXFCLEdBQUcsS0FBNUI7O0FBQ0EsT0FBSyxNQUFNakgsR0FBWCxJQUFrQjhHLFVBQWxCLEVBQThCO0FBQzVCLFFBQUk5RyxHQUFHLENBQUNZLE9BQUosQ0FBWSxHQUFaLE1BQXFCLENBQXpCLEVBQTRCO0FBQzFCb0csTUFBQUEsbUJBQW1CLEdBQUcsSUFBdEI7QUFDQUQsTUFBQUEsYUFBYSxDQUFDL0csR0FBRCxDQUFiLEdBQXFCOEcsVUFBVSxDQUFDOUcsR0FBRCxDQUEvQjtBQUNELEtBSEQsTUFHTztBQUNMaUgsTUFBQUEscUJBQXFCLEdBQUcsSUFBeEI7QUFDRDtBQUNGOztBQUNELE1BQUlELG1CQUFtQixJQUFJQyxxQkFBM0IsRUFBa0Q7QUFDaERILElBQUFBLFVBQVUsQ0FBQyxLQUFELENBQVYsR0FBb0JDLGFBQXBCO0FBQ0F4SCxJQUFBQSxNQUFNLENBQUNJLElBQVAsQ0FBWW9ILGFBQVosRUFBMkJ4RCxPQUEzQixDQUFtQ3ZELEdBQUcsSUFBSTtBQUN4QyxhQUFPOEcsVUFBVSxDQUFDOUcsR0FBRCxDQUFqQjtBQUNELEtBRkQ7QUFHRDs7QUFDRCxTQUFPOEcsVUFBUDtBQUNELENBdEJEOztBQXdCQTlJLFNBQVMsQ0FBQ3dCLFNBQVYsQ0FBb0J3RSxlQUFwQixHQUFzQyxZQUFZO0FBQ2hELE1BQUksT0FBTyxLQUFLNUYsU0FBWixLQUEwQixRQUE5QixFQUF3QztBQUN0QztBQUNEOztBQUNELE9BQUssTUFBTTRCLEdBQVgsSUFBa0IsS0FBSzVCLFNBQXZCLEVBQWtDO0FBQ2hDLFNBQUtBLFNBQUwsQ0FBZTRCLEdBQWYsSUFBc0I2Ryx5QkFBeUIsQ0FBQyxLQUFLekksU0FBTCxDQUFlNEIsR0FBZixDQUFELENBQS9DO0FBQ0Q7QUFDRixDQVBELEMsQ0FTQTtBQUNBOzs7QUFDQWhDLFNBQVMsQ0FBQ3dCLFNBQVYsQ0FBb0JxRCxPQUFwQixHQUE4QixVQUFVcUUsT0FBTyxHQUFHLEVBQXBCLEVBQXdCO0FBQ3BELE1BQUksS0FBS3hJLFdBQUwsQ0FBaUJ5RSxLQUFqQixLQUEyQixDQUEvQixFQUFrQztBQUNoQyxTQUFLMUUsUUFBTCxHQUFnQjtBQUFFNkUsTUFBQUEsT0FBTyxFQUFFO0FBQVgsS0FBaEI7QUFDQSxXQUFPaEIsT0FBTyxDQUFDQyxPQUFSLEVBQVA7QUFDRDs7QUFDRCxRQUFNN0QsV0FBVyxHQUFHYSxNQUFNLENBQUNpRSxNQUFQLENBQWMsRUFBZCxFQUFrQixLQUFLOUUsV0FBdkIsQ0FBcEI7O0FBQ0EsTUFBSSxLQUFLaUIsSUFBVCxFQUFlO0FBQ2JqQixJQUFBQSxXQUFXLENBQUNpQixJQUFaLEdBQW1CLEtBQUtBLElBQUwsQ0FBVU0sR0FBVixDQUFjRCxHQUFHLElBQUk7QUFDdEMsYUFBT0EsR0FBRyxDQUFDRixLQUFKLENBQVUsR0FBVixFQUFlLENBQWYsQ0FBUDtBQUNELEtBRmtCLENBQW5CO0FBR0Q7O0FBQ0QsTUFBSW9ILE9BQU8sQ0FBQ0MsRUFBWixFQUFnQjtBQUNkekksSUFBQUEsV0FBVyxDQUFDeUksRUFBWixHQUFpQkQsT0FBTyxDQUFDQyxFQUF6QjtBQUNEOztBQUNELFNBQU8sS0FBS2xKLE1BQUwsQ0FBWW1HLFFBQVosQ0FDSmdELElBREksQ0FDQyxLQUFLakosU0FETixFQUNpQixLQUFLQyxTQUR0QixFQUNpQ00sV0FEakMsRUFDOEMsS0FBS1IsSUFEbkQsRUFFSnNFLElBRkksQ0FFQ2MsT0FBTyxJQUFJO0FBQ2YsUUFBSSxLQUFLbkYsU0FBTCxLQUFtQixPQUFuQixJQUE4QixDQUFDTyxXQUFXLENBQUMySSxPQUEvQyxFQUF3RDtBQUN0RCxXQUFLLElBQUl0QyxNQUFULElBQW1CekIsT0FBbkIsRUFBNEI7QUFDMUIsYUFBS21ELG1CQUFMLENBQXlCMUIsTUFBekI7QUFDRDtBQUNGOztBQUVELFNBQUs5RyxNQUFMLENBQVlxSixlQUFaLENBQTRCQyxtQkFBNUIsQ0FBZ0QsS0FBS3RKLE1BQXJELEVBQTZEcUYsT0FBN0Q7O0FBRUEsUUFBSSxLQUFLcEIsaUJBQVQsRUFBNEI7QUFDMUIsV0FBSyxJQUFJc0YsQ0FBVCxJQUFjbEUsT0FBZCxFQUF1QjtBQUNyQmtFLFFBQUFBLENBQUMsQ0FBQ3JKLFNBQUYsR0FBYyxLQUFLK0QsaUJBQW5CO0FBQ0Q7QUFDRjs7QUFDRCxTQUFLekQsUUFBTCxHQUFnQjtBQUFFNkUsTUFBQUEsT0FBTyxFQUFFQTtBQUFYLEtBQWhCO0FBQ0QsR0FqQkksQ0FBUDtBQWtCRCxDQWhDRCxDLENBa0NBO0FBQ0E7OztBQUNBdEYsU0FBUyxDQUFDd0IsU0FBVixDQUFvQnNELFFBQXBCLEdBQStCLFlBQVk7QUFDekMsTUFBSSxDQUFDLEtBQUszRCxPQUFWLEVBQW1CO0FBQ2pCO0FBQ0Q7O0FBQ0QsT0FBS1QsV0FBTCxDQUFpQitJLEtBQWpCLEdBQXlCLElBQXpCO0FBQ0EsU0FBTyxLQUFLL0ksV0FBTCxDQUFpQmdKLElBQXhCO0FBQ0EsU0FBTyxLQUFLaEosV0FBTCxDQUFpQnlFLEtBQXhCO0FBQ0EsU0FBTyxLQUFLbEYsTUFBTCxDQUFZbUcsUUFBWixDQUFxQmdELElBQXJCLENBQTBCLEtBQUtqSixTQUEvQixFQUEwQyxLQUFLQyxTQUEvQyxFQUEwRCxLQUFLTSxXQUEvRCxFQUE0RThELElBQTVFLENBQWlGbUYsQ0FBQyxJQUFJO0FBQzNGLFNBQUtsSixRQUFMLENBQWNnSixLQUFkLEdBQXNCRSxDQUF0QjtBQUNELEdBRk0sQ0FBUDtBQUdELENBVkQ7O0FBWUEzSixTQUFTLENBQUN3QixTQUFWLENBQW9Ca0QsbUJBQXBCLEdBQTBDLGtCQUFrQjtBQUMxRCxNQUFJLEtBQUt4RSxJQUFMLENBQVVTLFFBQWQsRUFBd0I7QUFDdEI7QUFDRDs7QUFDRCxRQUFNOEYsZ0JBQWdCLEdBQUcsTUFBTSxLQUFLeEcsTUFBTCxDQUFZbUcsUUFBWixDQUFxQkksVUFBckIsRUFBL0I7QUFDQSxRQUFNb0QsZUFBZSxHQUNuQixLQUFLM0osTUFBTCxDQUFZbUcsUUFBWixDQUFxQnlELGtCQUFyQixDQUNFcEQsZ0JBREYsRUFFRSxLQUFLdEcsU0FGUCxFQUdFLEtBQUtDLFNBSFAsRUFJRSxLQUFLTSxXQUFMLENBQWlCdUYsR0FKbkIsRUFLRSxLQUFLL0YsSUFMUCxFQU1FLEtBQUtRLFdBTlAsS0FPSyxFQVJQOztBQVNBLE9BQUssTUFBTXNCLEdBQVgsSUFBa0I0SCxlQUFsQixFQUFtQztBQUNqQyxRQUFJLEtBQUt4SixTQUFMLENBQWU0QixHQUFmLENBQUosRUFBeUI7QUFDdkIsWUFBTSxJQUFJcEMsS0FBSyxDQUFDaUIsS0FBVixDQUNKakIsS0FBSyxDQUFDaUIsS0FBTixDQUFZOEYsbUJBRFIsRUFFSCxxQ0FBb0MzRSxHQUFJLGFBQVksS0FBSzdCLFNBQVUsRUFGaEUsQ0FBTjtBQUlEO0FBQ0Y7QUFDRixDQXRCRCxDLENBd0JBOzs7QUFDQUgsU0FBUyxDQUFDd0IsU0FBVixDQUFvQm1ELGdCQUFwQixHQUF1QyxZQUFZO0FBQ2pELE1BQUksQ0FBQyxLQUFLdkQsVUFBVixFQUFzQjtBQUNwQjtBQUNEOztBQUNELFNBQU8sS0FBS25CLE1BQUwsQ0FBWW1HLFFBQVosQ0FDSkksVUFESSxHQUVKaEMsSUFGSSxDQUVDaUMsZ0JBQWdCLElBQUlBLGdCQUFnQixDQUFDcUQsWUFBakIsQ0FBOEIsS0FBSzNKLFNBQW5DLENBRnJCLEVBR0pxRSxJQUhJLENBR0N1RixNQUFNLElBQUk7QUFDZCxVQUFNQyxhQUFhLEdBQUcsRUFBdEI7QUFDQSxVQUFNQyxTQUFTLEdBQUcsRUFBbEI7O0FBQ0EsU0FBSyxNQUFNL0csS0FBWCxJQUFvQjZHLE1BQU0sQ0FBQ2xILE1BQTNCLEVBQW1DO0FBQ2pDLFVBQ0drSCxNQUFNLENBQUNsSCxNQUFQLENBQWNLLEtBQWQsRUFBcUJnSCxJQUFyQixJQUE2QkgsTUFBTSxDQUFDbEgsTUFBUCxDQUFjSyxLQUFkLEVBQXFCZ0gsSUFBckIsS0FBOEIsU0FBNUQsSUFDQ0gsTUFBTSxDQUFDbEgsTUFBUCxDQUFjSyxLQUFkLEVBQXFCZ0gsSUFBckIsSUFBNkJILE1BQU0sQ0FBQ2xILE1BQVAsQ0FBY0ssS0FBZCxFQUFxQmdILElBQXJCLEtBQThCLE9BRjlELEVBR0U7QUFDQUYsUUFBQUEsYUFBYSxDQUFDaEQsSUFBZCxDQUFtQixDQUFDOUQsS0FBRCxDQUFuQjtBQUNBK0csUUFBQUEsU0FBUyxDQUFDakQsSUFBVixDQUFlOUQsS0FBZjtBQUNEO0FBQ0YsS0FYYSxDQVlkOzs7QUFDQSxTQUFLN0IsT0FBTCxHQUFlLENBQUMsR0FBRyxJQUFJb0IsR0FBSixDQUFRLENBQUMsR0FBRyxLQUFLcEIsT0FBVCxFQUFrQixHQUFHMkksYUFBckIsQ0FBUixDQUFKLENBQWYsQ0FiYyxDQWNkOztBQUNBLFFBQUksS0FBS3JJLElBQVQsRUFBZTtBQUNiLFdBQUtBLElBQUwsR0FBWSxDQUFDLEdBQUcsSUFBSWMsR0FBSixDQUFRLENBQUMsR0FBRyxLQUFLZCxJQUFULEVBQWUsR0FBR3NJLFNBQWxCLENBQVIsQ0FBSixDQUFaO0FBQ0Q7QUFDRixHQXJCSSxDQUFQO0FBc0JELENBMUJELEMsQ0E0QkE7OztBQUNBakssU0FBUyxDQUFDd0IsU0FBVixDQUFvQm9ELGlCQUFwQixHQUF3QyxZQUFZO0FBQ2xELE1BQUksQ0FBQyxLQUFLaEQsV0FBVixFQUF1QjtBQUNyQjtBQUNEOztBQUNELE1BQUksS0FBS0QsSUFBVCxFQUFlO0FBQ2IsU0FBS0EsSUFBTCxHQUFZLEtBQUtBLElBQUwsQ0FBVUksTUFBVixDQUFpQlksQ0FBQyxJQUFJLENBQUMsS0FBS2YsV0FBTCxDQUFpQjJCLFFBQWpCLENBQTBCWixDQUExQixDQUF2QixDQUFaO0FBQ0E7QUFDRDs7QUFDRCxTQUFPLEtBQUsxQyxNQUFMLENBQVltRyxRQUFaLENBQ0pJLFVBREksR0FFSmhDLElBRkksQ0FFQ2lDLGdCQUFnQixJQUFJQSxnQkFBZ0IsQ0FBQ3FELFlBQWpCLENBQThCLEtBQUszSixTQUFuQyxDQUZyQixFQUdKcUUsSUFISSxDQUdDdUYsTUFBTSxJQUFJO0FBQ2QsVUFBTWxILE1BQU0sR0FBR3RCLE1BQU0sQ0FBQ0ksSUFBUCxDQUFZb0ksTUFBTSxDQUFDbEgsTUFBbkIsQ0FBZjtBQUNBLFNBQUtsQixJQUFMLEdBQVlrQixNQUFNLENBQUNkLE1BQVAsQ0FBY1ksQ0FBQyxJQUFJLENBQUMsS0FBS2YsV0FBTCxDQUFpQjJCLFFBQWpCLENBQTBCWixDQUExQixDQUFwQixDQUFaO0FBQ0QsR0FOSSxDQUFQO0FBT0QsQ0FmRCxDLENBaUJBOzs7QUFDQTNDLFNBQVMsQ0FBQ3dCLFNBQVYsQ0FBb0J1RCxhQUFwQixHQUFvQyxZQUFZO0FBQzlDLE1BQUksS0FBSzFELE9BQUwsQ0FBYVEsTUFBYixJQUF1QixDQUEzQixFQUE4QjtBQUM1QjtBQUNEOztBQUVELE1BQUlzSSxZQUFZLEdBQUdDLFdBQVcsQ0FDNUIsS0FBS25LLE1BRHVCLEVBRTVCLEtBQUtDLElBRnVCLEVBRzVCLEtBQUtPLFFBSHVCLEVBSTVCLEtBQUtZLE9BQUwsQ0FBYSxDQUFiLENBSjRCLEVBSzVCLEtBQUtoQixXQUx1QixDQUE5Qjs7QUFPQSxNQUFJOEosWUFBWSxDQUFDM0YsSUFBakIsRUFBdUI7QUFDckIsV0FBTzJGLFlBQVksQ0FBQzNGLElBQWIsQ0FBa0I2RixXQUFXLElBQUk7QUFDdEMsV0FBSzVKLFFBQUwsR0FBZ0I0SixXQUFoQjtBQUNBLFdBQUtoSixPQUFMLEdBQWUsS0FBS0EsT0FBTCxDQUFhYSxLQUFiLENBQW1CLENBQW5CLENBQWY7QUFDQSxhQUFPLEtBQUs2QyxhQUFMLEVBQVA7QUFDRCxLQUpNLENBQVA7QUFLRCxHQU5ELE1BTU8sSUFBSSxLQUFLMUQsT0FBTCxDQUFhUSxNQUFiLEdBQXNCLENBQTFCLEVBQTZCO0FBQ2xDLFNBQUtSLE9BQUwsR0FBZSxLQUFLQSxPQUFMLENBQWFhLEtBQWIsQ0FBbUIsQ0FBbkIsQ0FBZjtBQUNBLFdBQU8sS0FBSzZDLGFBQUwsRUFBUDtBQUNEOztBQUVELFNBQU9vRixZQUFQO0FBQ0QsQ0F4QkQsQyxDQTBCQTs7O0FBQ0FuSyxTQUFTLENBQUN3QixTQUFWLENBQW9Cd0QsbUJBQXBCLEdBQTBDLFlBQVk7QUFDcEQsTUFBSSxDQUFDLEtBQUt2RSxRQUFWLEVBQW9CO0FBQ2xCO0FBQ0Q7O0FBQ0QsTUFBSSxDQUFDLEtBQUtGLFlBQVYsRUFBd0I7QUFDdEI7QUFDRCxHQU5tRCxDQU9wRDs7O0FBQ0EsUUFBTStKLGdCQUFnQixHQUFHekssUUFBUSxDQUFDMEssYUFBVCxDQUN2QixLQUFLcEssU0FEa0IsRUFFdkJOLFFBQVEsQ0FBQzJLLEtBQVQsQ0FBZUMsU0FGUSxFQUd2QixLQUFLeEssTUFBTCxDQUFZeUssYUFIVyxDQUF6Qjs7QUFLQSxNQUFJLENBQUNKLGdCQUFMLEVBQXVCO0FBQ3JCLFdBQU9oRyxPQUFPLENBQUNDLE9BQVIsRUFBUDtBQUNELEdBZm1ELENBZ0JwRDs7O0FBQ0EsTUFBSSxLQUFLN0QsV0FBTCxDQUFpQmlLLFFBQWpCLElBQTZCLEtBQUtqSyxXQUFMLENBQWlCa0ssUUFBbEQsRUFBNEQ7QUFDMUQsV0FBT3RHLE9BQU8sQ0FBQ0MsT0FBUixFQUFQO0FBQ0Q7O0FBRUQsUUFBTXVELElBQUksR0FBR3ZHLE1BQU0sQ0FBQ2lFLE1BQVAsQ0FBYyxFQUFkLEVBQWtCLEtBQUtuRixXQUF2QixDQUFiO0FBQ0F5SCxFQUFBQSxJQUFJLENBQUNWLEtBQUwsR0FBYSxLQUFLaEgsU0FBbEI7QUFDQSxRQUFNeUssVUFBVSxHQUFHLElBQUlqTCxLQUFLLENBQUNrTCxLQUFWLENBQWdCLEtBQUszSyxTQUFyQixDQUFuQjtBQUNBMEssRUFBQUEsVUFBVSxDQUFDRSxRQUFYLENBQW9CakQsSUFBcEIsRUF4Qm9ELENBeUJwRDs7QUFDQSxTQUFPakksUUFBUSxDQUNabUwsd0JBREksQ0FFSG5MLFFBQVEsQ0FBQzJLLEtBQVQsQ0FBZUMsU0FGWixFQUdILEtBQUt2SyxJQUhGLEVBSUgsS0FBS0MsU0FKRixFQUtILEtBQUtNLFFBQUwsQ0FBYzZFLE9BTFgsRUFNSCxLQUFLckYsTUFORixFQU9INEssVUFQRyxFQVFILEtBQUtySyxPQVJGLEVBVUpnRSxJQVZJLENBVUNjLE9BQU8sSUFBSTtBQUNmO0FBQ0EsUUFBSSxLQUFLcEIsaUJBQVQsRUFBNEI7QUFDMUIsV0FBS3pELFFBQUwsQ0FBYzZFLE9BQWQsR0FBd0JBLE9BQU8sQ0FBQ3JELEdBQVIsQ0FBWWdKLE1BQU0sSUFBSTtBQUM1QyxZQUFJQSxNQUFNLFlBQVlyTCxLQUFLLENBQUMyQixNQUE1QixFQUFvQztBQUNsQzBKLFVBQUFBLE1BQU0sR0FBR0EsTUFBTSxDQUFDQyxNQUFQLEVBQVQ7QUFDRDs7QUFDREQsUUFBQUEsTUFBTSxDQUFDOUssU0FBUCxHQUFtQixLQUFLK0QsaUJBQXhCO0FBQ0EsZUFBTytHLE1BQVA7QUFDRCxPQU51QixDQUF4QjtBQU9ELEtBUkQsTUFRTztBQUNMLFdBQUt4SyxRQUFMLENBQWM2RSxPQUFkLEdBQXdCQSxPQUF4QjtBQUNEO0FBQ0YsR0F2QkksQ0FBUDtBQXdCRCxDQWxERCxDLENBb0RBO0FBQ0E7QUFDQTs7O0FBQ0EsU0FBUzhFLFdBQVQsQ0FBcUJuSyxNQUFyQixFQUE2QkMsSUFBN0IsRUFBbUNPLFFBQW5DLEVBQTZDaUQsSUFBN0MsRUFBbURyRCxXQUFXLEdBQUcsRUFBakUsRUFBcUU7QUFDbkUsTUFBSThLLFFBQVEsR0FBR0MsWUFBWSxDQUFDM0ssUUFBUSxDQUFDNkUsT0FBVixFQUFtQjVCLElBQW5CLENBQTNCOztBQUNBLE1BQUl5SCxRQUFRLENBQUN0SixNQUFULElBQW1CLENBQXZCLEVBQTBCO0FBQ3hCLFdBQU9wQixRQUFQO0FBQ0Q7O0FBQ0QsUUFBTTRLLFlBQVksR0FBRyxFQUFyQjs7QUFDQSxPQUFLLElBQUlDLE9BQVQsSUFBb0JILFFBQXBCLEVBQThCO0FBQzVCLFFBQUksQ0FBQ0csT0FBTCxFQUFjO0FBQ1o7QUFDRDs7QUFDRCxVQUFNbkwsU0FBUyxHQUFHbUwsT0FBTyxDQUFDbkwsU0FBMUIsQ0FKNEIsQ0FLNUI7O0FBQ0EsUUFBSUEsU0FBSixFQUFlO0FBQ2JrTCxNQUFBQSxZQUFZLENBQUNsTCxTQUFELENBQVosR0FBMEJrTCxZQUFZLENBQUNsTCxTQUFELENBQVosSUFBMkIsSUFBSXNDLEdBQUosRUFBckQ7QUFDQTRJLE1BQUFBLFlBQVksQ0FBQ2xMLFNBQUQsQ0FBWixDQUF3Qm9MLEdBQXhCLENBQTRCRCxPQUFPLENBQUNySyxRQUFwQztBQUNEO0FBQ0Y7O0FBQ0QsUUFBTXVLLGtCQUFrQixHQUFHLEVBQTNCOztBQUNBLE1BQUluTCxXQUFXLENBQUNzQixJQUFoQixFQUFzQjtBQUNwQixVQUFNQSxJQUFJLEdBQUcsSUFBSWMsR0FBSixDQUFRcEMsV0FBVyxDQUFDc0IsSUFBWixDQUFpQkcsS0FBakIsQ0FBdUIsR0FBdkIsQ0FBUixDQUFiO0FBQ0EsVUFBTTJKLE1BQU0sR0FBR2xKLEtBQUssQ0FBQ0MsSUFBTixDQUFXYixJQUFYLEVBQWlCcUIsTUFBakIsQ0FBd0IsQ0FBQzBJLEdBQUQsRUFBTTFKLEdBQU4sS0FBYztBQUNuRCxZQUFNMkosT0FBTyxHQUFHM0osR0FBRyxDQUFDRixLQUFKLENBQVUsR0FBVixDQUFoQjtBQUNBLFVBQUk4SixDQUFDLEdBQUcsQ0FBUjs7QUFDQSxXQUFLQSxDQUFMLEVBQVFBLENBQUMsR0FBR2xJLElBQUksQ0FBQzdCLE1BQWpCLEVBQXlCK0osQ0FBQyxFQUExQixFQUE4QjtBQUM1QixZQUFJbEksSUFBSSxDQUFDa0ksQ0FBRCxDQUFKLElBQVdELE9BQU8sQ0FBQ0MsQ0FBRCxDQUF0QixFQUEyQjtBQUN6QixpQkFBT0YsR0FBUDtBQUNEO0FBQ0Y7O0FBQ0QsVUFBSUUsQ0FBQyxHQUFHRCxPQUFPLENBQUM5SixNQUFoQixFQUF3QjtBQUN0QjZKLFFBQUFBLEdBQUcsQ0FBQ0gsR0FBSixDQUFRSSxPQUFPLENBQUNDLENBQUQsQ0FBZjtBQUNEOztBQUNELGFBQU9GLEdBQVA7QUFDRCxLQVpjLEVBWVosSUFBSWpKLEdBQUosRUFaWSxDQUFmOztBQWFBLFFBQUlnSixNQUFNLENBQUNJLElBQVAsR0FBYyxDQUFsQixFQUFxQjtBQUNuQkwsTUFBQUEsa0JBQWtCLENBQUM3SixJQUFuQixHQUEwQlksS0FBSyxDQUFDQyxJQUFOLENBQVdpSixNQUFYLEVBQW1CckosSUFBbkIsQ0FBd0IsR0FBeEIsQ0FBMUI7QUFDRDtBQUNGOztBQUVELE1BQUkvQixXQUFXLENBQUN1QixXQUFoQixFQUE2QjtBQUMzQixVQUFNQSxXQUFXLEdBQUcsSUFBSWEsR0FBSixDQUFRcEMsV0FBVyxDQUFDdUIsV0FBWixDQUF3QkUsS0FBeEIsQ0FBOEIsR0FBOUIsQ0FBUixDQUFwQjtBQUNBLFVBQU1nSyxhQUFhLEdBQUd2SixLQUFLLENBQUNDLElBQU4sQ0FBV1osV0FBWCxFQUF3Qm9CLE1BQXhCLENBQStCLENBQUMwSSxHQUFELEVBQU0xSixHQUFOLEtBQWM7QUFDakUsWUFBTTJKLE9BQU8sR0FBRzNKLEdBQUcsQ0FBQ0YsS0FBSixDQUFVLEdBQVYsQ0FBaEI7QUFDQSxVQUFJOEosQ0FBQyxHQUFHLENBQVI7O0FBQ0EsV0FBS0EsQ0FBTCxFQUFRQSxDQUFDLEdBQUdsSSxJQUFJLENBQUM3QixNQUFqQixFQUF5QitKLENBQUMsRUFBMUIsRUFBOEI7QUFDNUIsWUFBSWxJLElBQUksQ0FBQ2tJLENBQUQsQ0FBSixJQUFXRCxPQUFPLENBQUNDLENBQUQsQ0FBdEIsRUFBMkI7QUFDekIsaUJBQU9GLEdBQVA7QUFDRDtBQUNGOztBQUNELFVBQUlFLENBQUMsSUFBSUQsT0FBTyxDQUFDOUosTUFBUixHQUFpQixDQUExQixFQUE2QjtBQUMzQjZKLFFBQUFBLEdBQUcsQ0FBQ0gsR0FBSixDQUFRSSxPQUFPLENBQUNDLENBQUQsQ0FBZjtBQUNEOztBQUNELGFBQU9GLEdBQVA7QUFDRCxLQVpxQixFQVluQixJQUFJakosR0FBSixFQVptQixDQUF0Qjs7QUFhQSxRQUFJcUosYUFBYSxDQUFDRCxJQUFkLEdBQXFCLENBQXpCLEVBQTRCO0FBQzFCTCxNQUFBQSxrQkFBa0IsQ0FBQzVKLFdBQW5CLEdBQWlDVyxLQUFLLENBQUNDLElBQU4sQ0FBV3NKLGFBQVgsRUFBMEIxSixJQUExQixDQUErQixHQUEvQixDQUFqQztBQUNEO0FBQ0Y7O0FBRUQsTUFBSS9CLFdBQVcsQ0FBQzBMLHFCQUFoQixFQUF1QztBQUNyQ1AsSUFBQUEsa0JBQWtCLENBQUNoRSxjQUFuQixHQUFvQ25ILFdBQVcsQ0FBQzBMLHFCQUFoRDtBQUNBUCxJQUFBQSxrQkFBa0IsQ0FBQ08scUJBQW5CLEdBQTJDMUwsV0FBVyxDQUFDMEwscUJBQXZEO0FBQ0QsR0FIRCxNQUdPLElBQUkxTCxXQUFXLENBQUNtSCxjQUFoQixFQUFnQztBQUNyQ2dFLElBQUFBLGtCQUFrQixDQUFDaEUsY0FBbkIsR0FBb0NuSCxXQUFXLENBQUNtSCxjQUFoRDtBQUNEOztBQUVELFFBQU13RSxhQUFhLEdBQUd6SyxNQUFNLENBQUNJLElBQVAsQ0FBWTBKLFlBQVosRUFBMEJwSixHQUExQixDQUE4QjlCLFNBQVMsSUFBSTtBQUMvRCxVQUFNOEwsU0FBUyxHQUFHMUosS0FBSyxDQUFDQyxJQUFOLENBQVc2SSxZQUFZLENBQUNsTCxTQUFELENBQXZCLENBQWxCO0FBQ0EsUUFBSWlILEtBQUo7O0FBQ0EsUUFBSTZFLFNBQVMsQ0FBQ3BLLE1BQVYsS0FBcUIsQ0FBekIsRUFBNEI7QUFDMUJ1RixNQUFBQSxLQUFLLEdBQUc7QUFBRW5HLFFBQUFBLFFBQVEsRUFBRWdMLFNBQVMsQ0FBQyxDQUFEO0FBQXJCLE9BQVI7QUFDRCxLQUZELE1BRU87QUFDTDdFLE1BQUFBLEtBQUssR0FBRztBQUFFbkcsUUFBQUEsUUFBUSxFQUFFO0FBQUVpTCxVQUFBQSxHQUFHLEVBQUVEO0FBQVA7QUFBWixPQUFSO0FBQ0Q7O0FBQ0QsUUFBSTVHLEtBQUssR0FBRyxJQUFJckYsU0FBSixDQUFjQyxNQUFkLEVBQXNCQyxJQUF0QixFQUE0QkMsU0FBNUIsRUFBdUNpSCxLQUF2QyxFQUE4Q29FLGtCQUE5QyxDQUFaO0FBQ0EsV0FBT25HLEtBQUssQ0FBQ2pCLE9BQU4sQ0FBYztBQUFFK0UsTUFBQUEsRUFBRSxFQUFFO0FBQU4sS0FBZCxFQUE2QjNFLElBQTdCLENBQWtDYyxPQUFPLElBQUk7QUFDbERBLE1BQUFBLE9BQU8sQ0FBQ25GLFNBQVIsR0FBb0JBLFNBQXBCO0FBQ0EsYUFBT21FLE9BQU8sQ0FBQ0MsT0FBUixDQUFnQmUsT0FBaEIsQ0FBUDtBQUNELEtBSE0sQ0FBUDtBQUlELEdBYnFCLENBQXRCLENBakVtRSxDQWdGbkU7O0FBQ0EsU0FBT2hCLE9BQU8sQ0FBQzZILEdBQVIsQ0FBWUgsYUFBWixFQUEyQnhILElBQTNCLENBQWdDNEgsU0FBUyxJQUFJO0FBQ2xELFFBQUlDLE9BQU8sR0FBR0QsU0FBUyxDQUFDcEosTUFBVixDQUFpQixDQUFDcUosT0FBRCxFQUFVQyxlQUFWLEtBQThCO0FBQzNELFdBQUssSUFBSUMsR0FBVCxJQUFnQkQsZUFBZSxDQUFDaEgsT0FBaEMsRUFBeUM7QUFDdkNpSCxRQUFBQSxHQUFHLENBQUN2TCxNQUFKLEdBQWEsUUFBYjtBQUNBdUwsUUFBQUEsR0FBRyxDQUFDcE0sU0FBSixHQUFnQm1NLGVBQWUsQ0FBQ25NLFNBQWhDOztBQUVBLFlBQUlvTSxHQUFHLENBQUNwTSxTQUFKLElBQWlCLE9BQWpCLElBQTRCLENBQUNELElBQUksQ0FBQ1MsUUFBdEMsRUFBZ0Q7QUFDOUMsaUJBQU80TCxHQUFHLENBQUNDLFlBQVg7QUFDQSxpQkFBT0QsR0FBRyxDQUFDNUQsUUFBWDtBQUNEOztBQUNEMEQsUUFBQUEsT0FBTyxDQUFDRSxHQUFHLENBQUN0TCxRQUFMLENBQVAsR0FBd0JzTCxHQUF4QjtBQUNEOztBQUNELGFBQU9GLE9BQVA7QUFDRCxLQVphLEVBWVgsRUFaVyxDQUFkO0FBY0EsUUFBSUksSUFBSSxHQUFHO0FBQ1RuSCxNQUFBQSxPQUFPLEVBQUVvSCxlQUFlLENBQUNqTSxRQUFRLENBQUM2RSxPQUFWLEVBQW1CNUIsSUFBbkIsRUFBeUIySSxPQUF6QjtBQURmLEtBQVg7O0FBR0EsUUFBSTVMLFFBQVEsQ0FBQ2dKLEtBQWIsRUFBb0I7QUFDbEJnRCxNQUFBQSxJQUFJLENBQUNoRCxLQUFMLEdBQWFoSixRQUFRLENBQUNnSixLQUF0QjtBQUNEOztBQUNELFdBQU9nRCxJQUFQO0FBQ0QsR0F0Qk0sQ0FBUDtBQXVCRCxDLENBRUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0EsU0FBU3JCLFlBQVQsQ0FBc0JILE1BQXRCLEVBQThCdkgsSUFBOUIsRUFBb0M7QUFDbEMsTUFBSXVILE1BQU0sWUFBWTFJLEtBQXRCLEVBQTZCO0FBQzNCLFFBQUlvSyxNQUFNLEdBQUcsRUFBYjs7QUFDQSxTQUFLLElBQUlDLENBQVQsSUFBYzNCLE1BQWQsRUFBc0I7QUFDcEIwQixNQUFBQSxNQUFNLEdBQUdBLE1BQU0sQ0FBQ3JLLE1BQVAsQ0FBYzhJLFlBQVksQ0FBQ3dCLENBQUQsRUFBSWxKLElBQUosQ0FBMUIsQ0FBVDtBQUNEOztBQUNELFdBQU9pSixNQUFQO0FBQ0Q7O0FBRUQsTUFBSSxPQUFPMUIsTUFBUCxLQUFrQixRQUFsQixJQUE4QixDQUFDQSxNQUFuQyxFQUEyQztBQUN6QyxXQUFPLEVBQVA7QUFDRDs7QUFFRCxNQUFJdkgsSUFBSSxDQUFDN0IsTUFBTCxJQUFlLENBQW5CLEVBQXNCO0FBQ3BCLFFBQUlvSixNQUFNLEtBQUssSUFBWCxJQUFtQkEsTUFBTSxDQUFDakssTUFBUCxJQUFpQixTQUF4QyxFQUFtRDtBQUNqRCxhQUFPLENBQUNpSyxNQUFELENBQVA7QUFDRDs7QUFDRCxXQUFPLEVBQVA7QUFDRDs7QUFFRCxNQUFJNEIsU0FBUyxHQUFHNUIsTUFBTSxDQUFDdkgsSUFBSSxDQUFDLENBQUQsQ0FBTCxDQUF0Qjs7QUFDQSxNQUFJLENBQUNtSixTQUFMLEVBQWdCO0FBQ2QsV0FBTyxFQUFQO0FBQ0Q7O0FBQ0QsU0FBT3pCLFlBQVksQ0FBQ3lCLFNBQUQsRUFBWW5KLElBQUksQ0FBQ3hCLEtBQUwsQ0FBVyxDQUFYLENBQVosQ0FBbkI7QUFDRCxDLENBRUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQSxTQUFTd0ssZUFBVCxDQUF5QnpCLE1BQXpCLEVBQWlDdkgsSUFBakMsRUFBdUMySSxPQUF2QyxFQUFnRDtBQUM5QyxNQUFJcEIsTUFBTSxZQUFZMUksS0FBdEIsRUFBNkI7QUFDM0IsV0FBTzBJLE1BQU0sQ0FDVmhKLEdBREksQ0FDQXNLLEdBQUcsSUFBSUcsZUFBZSxDQUFDSCxHQUFELEVBQU03SSxJQUFOLEVBQVkySSxPQUFaLENBRHRCLEVBRUp0SyxNQUZJLENBRUd3SyxHQUFHLElBQUksT0FBT0EsR0FBUCxLQUFlLFdBRnpCLENBQVA7QUFHRDs7QUFFRCxNQUFJLE9BQU90QixNQUFQLEtBQWtCLFFBQWxCLElBQThCLENBQUNBLE1BQW5DLEVBQTJDO0FBQ3pDLFdBQU9BLE1BQVA7QUFDRDs7QUFFRCxNQUFJdkgsSUFBSSxDQUFDN0IsTUFBTCxLQUFnQixDQUFwQixFQUF1QjtBQUNyQixRQUFJb0osTUFBTSxJQUFJQSxNQUFNLENBQUNqSyxNQUFQLEtBQWtCLFNBQWhDLEVBQTJDO0FBQ3pDLGFBQU9xTCxPQUFPLENBQUNwQixNQUFNLENBQUNoSyxRQUFSLENBQWQ7QUFDRDs7QUFDRCxXQUFPZ0ssTUFBUDtBQUNEOztBQUVELE1BQUk0QixTQUFTLEdBQUc1QixNQUFNLENBQUN2SCxJQUFJLENBQUMsQ0FBRCxDQUFMLENBQXRCOztBQUNBLE1BQUksQ0FBQ21KLFNBQUwsRUFBZ0I7QUFDZCxXQUFPNUIsTUFBUDtBQUNEOztBQUNELE1BQUk2QixNQUFNLEdBQUdKLGVBQWUsQ0FBQ0csU0FBRCxFQUFZbkosSUFBSSxDQUFDeEIsS0FBTCxDQUFXLENBQVgsQ0FBWixFQUEyQm1LLE9BQTNCLENBQTVCO0FBQ0EsTUFBSU0sTUFBTSxHQUFHLEVBQWI7O0FBQ0EsT0FBSyxJQUFJM0ssR0FBVCxJQUFnQmlKLE1BQWhCLEVBQXdCO0FBQ3RCLFFBQUlqSixHQUFHLElBQUkwQixJQUFJLENBQUMsQ0FBRCxDQUFmLEVBQW9CO0FBQ2xCaUosTUFBQUEsTUFBTSxDQUFDM0ssR0FBRCxDQUFOLEdBQWM4SyxNQUFkO0FBQ0QsS0FGRCxNQUVPO0FBQ0xILE1BQUFBLE1BQU0sQ0FBQzNLLEdBQUQsQ0FBTixHQUFjaUosTUFBTSxDQUFDakosR0FBRCxDQUFwQjtBQUNEO0FBQ0Y7O0FBQ0QsU0FBTzJLLE1BQVA7QUFDRCxDLENBRUQ7QUFDQTs7O0FBQ0EsU0FBU3pGLGlCQUFULENBQTJCNkYsSUFBM0IsRUFBaUMvSyxHQUFqQyxFQUFzQztBQUNwQyxNQUFJLE9BQU8rSyxJQUFQLEtBQWdCLFFBQXBCLEVBQThCO0FBQzVCO0FBQ0Q7O0FBQ0QsTUFBSUEsSUFBSSxZQUFZeEssS0FBcEIsRUFBMkI7QUFDekIsU0FBSyxJQUFJeUssSUFBVCxJQUFpQkQsSUFBakIsRUFBdUI7QUFDckIsWUFBTUosTUFBTSxHQUFHekYsaUJBQWlCLENBQUM4RixJQUFELEVBQU9oTCxHQUFQLENBQWhDOztBQUNBLFVBQUkySyxNQUFKLEVBQVk7QUFDVixlQUFPQSxNQUFQO0FBQ0Q7QUFDRjtBQUNGOztBQUNELE1BQUlJLElBQUksSUFBSUEsSUFBSSxDQUFDL0ssR0FBRCxDQUFoQixFQUF1QjtBQUNyQixXQUFPK0ssSUFBUDtBQUNEOztBQUNELE9BQUssSUFBSUUsTUFBVCxJQUFtQkYsSUFBbkIsRUFBeUI7QUFDdkIsVUFBTUosTUFBTSxHQUFHekYsaUJBQWlCLENBQUM2RixJQUFJLENBQUNFLE1BQUQsQ0FBTCxFQUFlakwsR0FBZixDQUFoQzs7QUFDQSxRQUFJMkssTUFBSixFQUFZO0FBQ1YsYUFBT0EsTUFBUDtBQUNEO0FBQ0Y7QUFDRjs7QUFFRE8sTUFBTSxDQUFDQyxPQUFQLEdBQWlCbk4sU0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBbiBvYmplY3QgdGhhdCBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhICdmaW5kJ1xuLy8gb3BlcmF0aW9uLCBlbmNvZGVkIGluIHRoZSBSRVNUIEFQSSBmb3JtYXQuXG5cbnZhciBTY2hlbWFDb250cm9sbGVyID0gcmVxdWlyZSgnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5jb25zdCB0cmlnZ2VycyA9IHJlcXVpcmUoJy4vdHJpZ2dlcnMnKTtcbmNvbnN0IHsgY29udGludWVXaGlsZSB9ID0gcmVxdWlyZSgncGFyc2UvbGliL25vZGUvcHJvbWlzZVV0aWxzJyk7XG5jb25zdCBBbHdheXNTZWxlY3RlZEtleXMgPSBbJ29iamVjdElkJywgJ2NyZWF0ZWRBdCcsICd1cGRhdGVkQXQnLCAnQUNMJ107XG4vLyByZXN0T3B0aW9ucyBjYW4gaW5jbHVkZTpcbi8vICAgc2tpcFxuLy8gICBsaW1pdFxuLy8gICBvcmRlclxuLy8gICBjb3VudFxuLy8gICBpbmNsdWRlXG4vLyAgIGtleXNcbi8vICAgZXhjbHVkZUtleXNcbi8vICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXlcbi8vICAgcmVhZFByZWZlcmVuY2Vcbi8vICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlXG4vLyAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2VcbmZ1bmN0aW9uIFJlc3RRdWVyeShcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSA9IHt9LFxuICByZXN0T3B0aW9ucyA9IHt9LFxuICBjbGllbnRTREssXG4gIHJ1bkFmdGVyRmluZCA9IHRydWUsXG4gIGNvbnRleHRcbikge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMucmVzdFdoZXJlID0gcmVzdFdoZXJlO1xuICB0aGlzLnJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnM7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnJ1bkFmdGVyRmluZCA9IHJ1bkFmdGVyRmluZDtcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG4gIHRoaXMuZmluZE9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0gY29udGV4dCB8fCB7fTtcbiAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT0gJ19TZXNzaW9uJykge1xuICAgICAgaWYgKCF0aGlzLmF1dGgudXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgICB9XG4gICAgICB0aGlzLnJlc3RXaGVyZSA9IHtcbiAgICAgICAgJGFuZDogW1xuICAgICAgICAgIHRoaXMucmVzdFdoZXJlLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVzZXI6IHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICB0aGlzLmRvQ291bnQgPSBmYWxzZTtcbiAgdGhpcy5pbmNsdWRlQWxsID0gZmFsc2U7XG5cbiAgLy8gVGhlIGZvcm1hdCBmb3IgdGhpcy5pbmNsdWRlIGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgZm9ybWF0IGZvciB0aGVcbiAgLy8gaW5jbHVkZSBvcHRpb24gLSBpdCdzIHRoZSBwYXRocyB3ZSBzaG91bGQgaW5jbHVkZSwgaW4gb3JkZXIsXG4gIC8vIHN0b3JlZCBhcyBhcnJheXMsIHRha2luZyBpbnRvIGFjY291bnQgdGhhdCB3ZSBuZWVkIHRvIGluY2x1ZGUgZm9vXG4gIC8vIGJlZm9yZSBpbmNsdWRpbmcgZm9vLmJhci4gQWxzbyBpdCBzaG91bGQgZGVkdXBlLlxuICAvLyBGb3IgZXhhbXBsZSwgcGFzc2luZyBhbiBhcmcgb2YgaW5jbHVkZT1mb28uYmFyLGZvby5iYXogY291bGQgbGVhZCB0b1xuICAvLyB0aGlzLmluY2x1ZGUgPSBbWydmb28nXSwgWydmb28nLCAnYmF6J10sIFsnZm9vJywgJ2JhciddXVxuICB0aGlzLmluY2x1ZGUgPSBbXTtcbiAgbGV0IGtleXNGb3JJbmNsdWRlID0gJyc7XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gU2VlIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvMzE4NVxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAna2V5cycpKSB7XG4gICAga2V5c0ZvckluY2x1ZGUgPSByZXN0T3B0aW9ucy5rZXlzO1xuICB9XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gaW4gb3JkZXIgdG8gZXhjbHVkZSBzcGVjaWZpYyBrZXlzLlxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAnZXhjbHVkZUtleXMnKSkge1xuICAgIGtleXNGb3JJbmNsdWRlICs9ICcsJyArIHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzO1xuICB9XG5cbiAgaWYgKGtleXNGb3JJbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICBrZXlzRm9ySW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlXG4gICAgICAuc3BsaXQoJywnKVxuICAgICAgLmZpbHRlcihrZXkgPT4ge1xuICAgICAgICAvLyBBdCBsZWFzdCAyIGNvbXBvbmVudHNcbiAgICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpLmxlbmd0aCA+IDE7XG4gICAgICB9KVxuICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAvLyBTbGljZSB0aGUgbGFzdCBjb21wb25lbnQgKGEuYi5jIC0+IGEuYilcbiAgICAgICAgLy8gT3RoZXJ3aXNlIHdlJ2xsIGluY2x1ZGUgb25lIGxldmVsIHRvbyBtdWNoLlxuICAgICAgICByZXR1cm4ga2V5LnNsaWNlKDAsIGtleS5sYXN0SW5kZXhPZignLicpKTtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCcpO1xuXG4gICAgLy8gQ29uY2F0IHRoZSBwb3NzaWJseSBwcmVzZW50IGluY2x1ZGUgc3RyaW5nIHdpdGggdGhlIG9uZSBmcm9tIHRoZSBrZXlzXG4gICAgLy8gRGVkdXAgLyBzb3J0aW5nIGlzIGhhbmRsZSBpbiAnaW5jbHVkZScgY2FzZS5cbiAgICBpZiAoa2V5c0ZvckluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKCFyZXN0T3B0aW9ucy5pbmNsdWRlIHx8IHJlc3RPcHRpb25zLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSArPSAnLCcgKyBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmb3IgKHZhciBvcHRpb24gaW4gcmVzdE9wdGlvbnMpIHtcbiAgICBzd2l0Y2ggKG9wdGlvbikge1xuICAgICAgY2FzZSAna2V5cyc6IHtcbiAgICAgICAgY29uc3Qga2V5cyA9IHJlc3RPcHRpb25zLmtleXNcbiAgICAgICAgICAuc3BsaXQoJywnKVxuICAgICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5sZW5ndGggPiAwKVxuICAgICAgICAgIC5jb25jYXQoQWx3YXlzU2VsZWN0ZWRLZXlzKTtcbiAgICAgICAgdGhpcy5rZXlzID0gQXJyYXkuZnJvbShuZXcgU2V0KGtleXMpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdleGNsdWRlS2V5cyc6IHtcbiAgICAgICAgY29uc3QgZXhjbHVkZSA9IHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzXG4gICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAuZmlsdGVyKGsgPT4gQWx3YXlzU2VsZWN0ZWRLZXlzLmluZGV4T2YoaykgPCAwKTtcbiAgICAgICAgdGhpcy5leGNsdWRlS2V5cyA9IEFycmF5LmZyb20obmV3IFNldChleGNsdWRlKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICB0aGlzLmRvQ291bnQgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGVBbGwnOlxuICAgICAgICB0aGlzLmluY2x1ZGVBbGwgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2V4cGxhaW4nOlxuICAgICAgY2FzZSAnaGludCc6XG4gICAgICBjYXNlICdkaXN0aW5jdCc6XG4gICAgICBjYXNlICdwaXBlbGluZSc6XG4gICAgICBjYXNlICdza2lwJzpcbiAgICAgIGNhc2UgJ2xpbWl0JzpcbiAgICAgIGNhc2UgJ3JlYWRQcmVmZXJlbmNlJzpcbiAgICAgICAgdGhpcy5maW5kT3B0aW9uc1tvcHRpb25dID0gcmVzdE9wdGlvbnNbb3B0aW9uXTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdvcmRlcic6XG4gICAgICAgIHZhciBmaWVsZHMgPSByZXN0T3B0aW9ucy5vcmRlci5zcGxpdCgnLCcpO1xuICAgICAgICB0aGlzLmZpbmRPcHRpb25zLnNvcnQgPSBmaWVsZHMucmVkdWNlKChzb3J0TWFwLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGZpZWxkID0gZmllbGQudHJpbSgpO1xuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJyRzY29yZScgfHwgZmllbGQgPT09ICctJHNjb3JlJykge1xuICAgICAgICAgICAgc29ydE1hcC5zY29yZSA9IHsgJG1ldGE6ICd0ZXh0U2NvcmUnIH07XG4gICAgICAgICAgfSBlbHNlIGlmIChmaWVsZFswXSA9PSAnLScpIHtcbiAgICAgICAgICAgIHNvcnRNYXBbZmllbGQuc2xpY2UoMSldID0gLTE7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNvcnRNYXBbZmllbGRdID0gMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHNvcnRNYXA7XG4gICAgICAgIH0sIHt9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlJzoge1xuICAgICAgICBjb25zdCBwYXRocyA9IHJlc3RPcHRpb25zLmluY2x1ZGUuc3BsaXQoJywnKTtcbiAgICAgICAgaWYgKHBhdGhzLmluY2x1ZGVzKCcqJykpIHtcbiAgICAgICAgICB0aGlzLmluY2x1ZGVBbGwgPSB0cnVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIC8vIExvYWQgdGhlIGV4aXN0aW5nIGluY2x1ZGVzIChmcm9tIGtleXMpXG4gICAgICAgIGNvbnN0IHBhdGhTZXQgPSBwYXRocy5yZWR1Y2UoKG1lbW8sIHBhdGgpID0+IHtcbiAgICAgICAgICAvLyBTcGxpdCBlYWNoIHBhdGhzIG9uIC4gKGEuYi5jIC0+IFthLGIsY10pXG4gICAgICAgICAgLy8gcmVkdWNlIHRvIGNyZWF0ZSBhbGwgcGF0aHNcbiAgICAgICAgICAvLyAoW2EsYixjXSAtPiB7YTogdHJ1ZSwgJ2EuYic6IHRydWUsICdhLmIuYyc6IHRydWV9KVxuICAgICAgICAgIHJldHVybiBwYXRoLnNwbGl0KCcuJykucmVkdWNlKChtZW1vLCBwYXRoLCBpbmRleCwgcGFydHMpID0+IHtcbiAgICAgICAgICAgIG1lbW9bcGFydHMuc2xpY2UoMCwgaW5kZXggKyAxKS5qb2luKCcuJyldID0gdHJ1ZTtcbiAgICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICAgIH0sIG1lbW8pO1xuICAgICAgICB9LCB7fSk7XG5cbiAgICAgICAgdGhpcy5pbmNsdWRlID0gT2JqZWN0LmtleXMocGF0aFNldClcbiAgICAgICAgICAubWFwKHMgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHMuc3BsaXQoJy4nKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gYS5sZW5ndGggLSBiLmxlbmd0aDsgLy8gU29ydCBieSBudW1iZXIgb2YgY29tcG9uZW50c1xuICAgICAgICAgIH0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ3JlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5JzpcbiAgICAgICAgdGhpcy5yZWRpcmVjdEtleSA9IHJlc3RPcHRpb25zLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5O1xuICAgICAgICB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lID0gbnVsbDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlUmVhZFByZWZlcmVuY2UnOlxuICAgICAgY2FzZSAnc3VicXVlcnlSZWFkUHJlZmVyZW5jZSc6XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCBvcHRpb246ICcgKyBvcHRpb24pO1xuICAgIH1cbiAgfVxufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIGEgcXVlcnlcbi8vIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXNwb25zZSAtIGFuIG9iamVjdCB3aXRoIG9wdGlvbmFsIGtleXNcbi8vICdyZXN1bHRzJyBhbmQgJ2NvdW50Jy5cbi8vIFRPRE86IGNvbnNvbGlkYXRlIHRoZSByZXBsYWNlWCBmdW5jdGlvbnNcblJlc3RRdWVyeS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uIChleGVjdXRlT3B0aW9ucykge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5idWlsZFJlc3RXaGVyZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVueVByb3RlY3RlZEZpZWxkcygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZUFsbCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRXhjbHVkZUtleXMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkZpbmQoZXhlY3V0ZU9wdGlvbnMpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQ291bnQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkFmdGVyRmluZFRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlc3BvbnNlO1xuICAgIH0pO1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5lYWNoID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHJlc3RXaGVyZSwgcmVzdE9wdGlvbnMsIGNsaWVudFNESyB9ID0gdGhpcztcbiAgLy8gaWYgdGhlIGxpbWl0IGlzIHNldCwgdXNlIGl0XG4gIHJlc3RPcHRpb25zLmxpbWl0ID0gcmVzdE9wdGlvbnMubGltaXQgfHwgMTAwO1xuICByZXN0T3B0aW9ucy5vcmRlciA9ICdvYmplY3RJZCc7XG4gIGxldCBmaW5pc2hlZCA9IGZhbHNlO1xuXG4gIHJldHVybiBjb250aW51ZVdoaWxlKFxuICAgICgpID0+IHtcbiAgICAgIHJldHVybiAhZmluaXNoZWQ7XG4gICAgfSxcbiAgICBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgICBjbGllbnRTREssXG4gICAgICAgIHRoaXMucnVuQWZ0ZXJGaW5kLFxuICAgICAgICB0aGlzLmNvbnRleHRcbiAgICAgICk7XG4gICAgICBjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKTtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChjYWxsYmFjayk7XG4gICAgICBmaW5pc2hlZCA9IHJlc3VsdHMubGVuZ3RoIDwgcmVzdE9wdGlvbnMubGltaXQ7XG4gICAgICBpZiAoIWZpbmlzaGVkKSB7XG4gICAgICAgIHJlc3RXaGVyZS5vYmplY3RJZCA9IE9iamVjdC5hc3NpZ24oe30sIHJlc3RXaGVyZS5vYmplY3RJZCwge1xuICAgICAgICAgICRndDogcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdLm9iamVjdElkLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICk7XG59O1xuXG5SZXN0UXVlcnkucHJvdG90eXBlLmJ1aWxkUmVzdFdoZXJlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRVc2VyQW5kUm9sZUFDTCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZVNlbGVjdCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlTm90SW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZUVxdWFsaXR5KCk7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcblJlc3RRdWVyeS5wcm90b3R5cGUuZ2V0VXNlckFuZFJvbGVBQ0wgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLmZpbmRPcHRpb25zLmFjbCA9IFsnKiddO1xuXG4gIGlmICh0aGlzLmF1dGgudXNlcikge1xuICAgIHJldHVybiB0aGlzLmF1dGguZ2V0VXNlclJvbGVzKCkudGhlbihyb2xlcyA9PiB7XG4gICAgICB0aGlzLmZpbmRPcHRpb25zLmFjbCA9IHRoaXMuZmluZE9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW3RoaXMuYXV0aC51c2VyLmlkXSk7XG4gICAgICByZXR1cm47XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBDaGFuZ2VzIHRoZSBjbGFzc05hbWUgaWYgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXkgaXMgc2V0LlxuLy8gUmV0dXJucyBhIHByb21pc2UuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVkaXJlY3RLZXkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXZSBuZWVkIHRvIGNoYW5nZSB0aGUgY2xhc3MgbmFtZSBiYXNlZCBvbiB0aGUgc2NoZW1hXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5yZWRpcmVjdENsYXNzTmFtZUZvcktleSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5yZWRpcmVjdEtleSlcbiAgICAudGhlbihuZXdDbGFzc05hbWUgPT4ge1xuICAgICAgdGhpcy5jbGFzc05hbWUgPSBuZXdDbGFzc05hbWU7XG4gICAgICB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lID0gbmV3Q2xhc3NOYW1lO1xuICAgIH0pO1xufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5SZXN0UXVlcnkucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKFxuICAgIHRoaXMuY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgU2NoZW1hQ29udHJvbGxlci5zeXN0ZW1DbGFzc2VzLmluZGV4T2YodGhpcy5jbGFzc05hbWUpID09PSAtMVxuICApIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5oYXNDbGFzcyh0aGlzLmNsYXNzTmFtZSkpXG4gICAgICAudGhlbihoYXNDbGFzcyA9PiB7XG4gICAgICAgIGlmIChoYXNDbGFzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAnVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2VzcyAnICsgJ25vbi1leGlzdGVudCBjbGFzczogJyArIHRoaXMuY2xhc3NOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIGNsYXNzTmFtZSwgcmVzdWx0cykge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgdmFsdWVzLnB1c2goe1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgIG9iamVjdElkOiByZXN1bHQub2JqZWN0SWQsXG4gICAgfSk7XG4gIH1cbiAgZGVsZXRlIGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmIChBcnJheS5pc0FycmF5KGluUXVlcnlPYmplY3RbJyRpbiddKSkge1xuICAgIGluUXVlcnlPYmplY3RbJyRpbiddID0gaW5RdWVyeU9iamVjdFsnJGluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgaW5RdWVyeU9iamVjdFsnJGluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkaW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkaW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJGluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZUluUXVlcnkgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBpblF1ZXJ5T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckaW5RdWVyeScpO1xuICBpZiAoIWluUXVlcnlPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgaW5RdWVyeSB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gd2hlcmUgYW5kIGNsYXNzTmFtZVxuICB2YXIgaW5RdWVyeVZhbHVlID0gaW5RdWVyeU9iamVjdFsnJGluUXVlcnknXTtcbiAgaWYgKCFpblF1ZXJ5VmFsdWUud2hlcmUgfHwgIWluUXVlcnlWYWx1ZS5jbGFzc05hbWUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRpblF1ZXJ5Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogaW5RdWVyeVZhbHVlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lLFxuICAgIGluUXVlcnlWYWx1ZS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybUluUXVlcnkoaW5RdWVyeU9iamVjdCwgc3VicXVlcnkuY2xhc3NOYW1lLCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBSZWN1cnNlIHRvIHJlcGVhdFxuICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gIH0pO1xufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtTm90SW5RdWVyeShub3RJblF1ZXJ5T2JqZWN0LCBjbGFzc05hbWUsIHJlc3VsdHMpIHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgIHZhbHVlcy5wdXNoKHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogcmVzdWx0Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGRlbGV0ZSBub3RJblF1ZXJ5T2JqZWN0Wyckbm90SW5RdWVyeSddO1xuICBpZiAoQXJyYXkuaXNBcnJheShub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10pKSB7XG4gICAgbm90SW5RdWVyeU9iamVjdFsnJG5pbiddID0gbm90SW5RdWVyeU9iamVjdFsnJG5pbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IHZhbHVlcztcbiAgfVxufVxuXG4vLyBSZXBsYWNlcyBhICRub3RJblF1ZXJ5IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYW5cbi8vICRub3RJblF1ZXJ5IGNsYXVzZS5cbi8vIFRoZSAkbm90SW5RdWVyeSBjbGF1c2UgdHVybnMgaW50byBhICRuaW4gd2l0aCB2YWx1ZXMgdGhhdCBhcmUganVzdFxuLy8gcG9pbnRlcnMgdG8gdGhlIG9iamVjdHMgcmV0dXJuZWQgaW4gdGhlIHN1YnF1ZXJ5LlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlTm90SW5RdWVyeSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG5vdEluUXVlcnlPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRub3RJblF1ZXJ5Jyk7XG4gIGlmICghbm90SW5RdWVyeU9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBub3RJblF1ZXJ5IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSB3aGVyZSBhbmQgY2xhc3NOYW1lXG4gIHZhciBub3RJblF1ZXJ5VmFsdWUgPSBub3RJblF1ZXJ5T2JqZWN0Wyckbm90SW5RdWVyeSddO1xuICBpZiAoIW5vdEluUXVlcnlWYWx1ZS53aGVyZSB8fCAhbm90SW5RdWVyeVZhbHVlLmNsYXNzTmFtZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJG5vdEluUXVlcnknKTtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBub3RJblF1ZXJ5VmFsdWUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHZhciBzdWJxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIG5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUsXG4gICAgbm90SW5RdWVyeVZhbHVlLndoZXJlLFxuICAgIGFkZGl0aW9uYWxPcHRpb25zXG4gICk7XG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtTm90SW5RdWVyeShub3RJblF1ZXJ5T2JqZWN0LCBzdWJxdWVyeS5jbGFzc05hbWUsIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIFJlY3Vyc2UgdG8gcmVwZWF0XG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZU5vdEluUXVlcnkoKTtcbiAgfSk7XG59O1xuXG4vLyBVc2VkIHRvIGdldCB0aGUgZGVlcGVzdCBvYmplY3QgZnJvbSBqc29uIHVzaW5nIGRvdCBub3RhdGlvbi5cbmNvbnN0IGdldERlZXBlc3RPYmplY3RGcm9tS2V5ID0gKGpzb24sIGtleSwgaWR4LCBzcmMpID0+IHtcbiAgaWYgKGtleSBpbiBqc29uKSB7XG4gICAgcmV0dXJuIGpzb25ba2V5XTtcbiAgfVxuICBzcmMuc3BsaWNlKDEpOyAvLyBFeGl0IEVhcmx5XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1TZWxlY3QgPSAoc2VsZWN0T2JqZWN0LCBrZXksIG9iamVjdHMpID0+IHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2Ygb2JqZWN0cykge1xuICAgIHZhbHVlcy5wdXNoKGtleS5zcGxpdCgnLicpLnJlZHVjZShnZXREZWVwZXN0T2JqZWN0RnJvbUtleSwgcmVzdWx0KSk7XG4gIH1cbiAgZGVsZXRlIHNlbGVjdE9iamVjdFsnJHNlbGVjdCddO1xuICBpZiAoQXJyYXkuaXNBcnJheShzZWxlY3RPYmplY3RbJyRpbiddKSkge1xuICAgIHNlbGVjdE9iamVjdFsnJGluJ10gPSBzZWxlY3RPYmplY3RbJyRpbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIHNlbGVjdE9iamVjdFsnJGluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJHNlbGVjdCBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFcbi8vICRzZWxlY3QgY2xhdXNlLlxuLy8gVGhlICRzZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHNlbGVjdGVkIG91dCBvZlxuLy8gdGhlIHN1YnF1ZXJ5LlxuLy8gUmV0dXJucyBhIHBvc3NpYmxlLXByb21pc2UuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VTZWxlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRzZWxlY3QnKTtcbiAgaWYgKCFzZWxlY3RPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgc2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBzZWxlY3RWYWx1ZSA9IHNlbGVjdE9iamVjdFsnJHNlbGVjdCddO1xuICAvLyBpT1MgU0RLIGRvbid0IHNlbmQgd2hlcmUgaWYgbm90IHNldCwgbGV0IGl0IHBhc3NcbiAgaWYgKFxuICAgICFzZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFzZWxlY3RWYWx1ZS5rZXkgfHxcbiAgICB0eXBlb2Ygc2VsZWN0VmFsdWUucXVlcnkgIT09ICdvYmplY3QnIHx8XG4gICAgIXNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKHNlbGVjdFZhbHVlKS5sZW5ndGggIT09IDJcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkc2VsZWN0Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogc2VsZWN0VmFsdWUucXVlcnkucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHZhciBzdWJxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIHNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSxcbiAgICBzZWxlY3RWYWx1ZS5xdWVyeS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybVNlbGVjdChzZWxlY3RPYmplY3QsIHNlbGVjdFZhbHVlLmtleSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gS2VlcCByZXBsYWNpbmcgJHNlbGVjdCBjbGF1c2VzXG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZVNlbGVjdCgpO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvbnRTZWxlY3QgPSAoZG9udFNlbGVjdE9iamVjdCwga2V5LCBvYmplY3RzKSA9PiB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIG9iamVjdHMpIHtcbiAgICB2YWx1ZXMucHVzaChrZXkuc3BsaXQoJy4nKS5yZWR1Y2UoZ2V0RGVlcGVzdE9iamVjdEZyb21LZXksIHJlc3VsdCkpO1xuICB9XG4gIGRlbGV0ZSBkb250U2VsZWN0T2JqZWN0WyckZG9udFNlbGVjdCddO1xuICBpZiAoQXJyYXkuaXNBcnJheShkb250U2VsZWN0T2JqZWN0WyckbmluJ10pKSB7XG4gICAgZG9udFNlbGVjdE9iamVjdFsnJG5pbiddID0gZG9udFNlbGVjdE9iamVjdFsnJG5pbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSA9IHZhbHVlcztcbiAgfVxufTtcblxuLy8gUmVwbGFjZXMgYSAkZG9udFNlbGVjdCBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFcbi8vICRkb250U2VsZWN0IGNsYXVzZS5cbi8vIFRoZSAkZG9udFNlbGVjdCBjbGF1c2UgdHVybnMgaW50byBhbiAkbmluIHdpdGggdmFsdWVzIHNlbGVjdGVkIG91dCBvZlxuLy8gdGhlIHN1YnF1ZXJ5LlxuLy8gUmV0dXJucyBhIHBvc3NpYmxlLXByb21pc2UuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VEb250U2VsZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgZG9udFNlbGVjdE9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGRvbnRTZWxlY3QnKTtcbiAgaWYgKCFkb250U2VsZWN0T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGRvbnRTZWxlY3QgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHF1ZXJ5IGFuZCBrZXlcbiAgdmFyIGRvbnRTZWxlY3RWYWx1ZSA9IGRvbnRTZWxlY3RPYmplY3RbJyRkb250U2VsZWN0J107XG4gIGlmIChcbiAgICAhZG9udFNlbGVjdFZhbHVlLnF1ZXJ5IHx8XG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5rZXkgfHxcbiAgICB0eXBlb2YgZG9udFNlbGVjdFZhbHVlLnF1ZXJ5ICE9PSAnb2JqZWN0JyB8fFxuICAgICFkb250U2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lIHx8XG4gICAgT2JqZWN0LmtleXMoZG9udFNlbGVjdFZhbHVlKS5sZW5ndGggIT09IDJcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkZG9udFNlbGVjdCcpO1xuICB9XG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBkb250U2VsZWN0VmFsdWUucXVlcnkucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHZhciBzdWJxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUsXG4gICAgZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LndoZXJlLFxuICAgIGFkZGl0aW9uYWxPcHRpb25zXG4gICk7XG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtRG9udFNlbGVjdChkb250U2VsZWN0T2JqZWN0LCBkb250U2VsZWN0VmFsdWUua2V5LCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBLZWVwIHJlcGxhY2luZyAkZG9udFNlbGVjdCBjbGF1c2VzXG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5SZXN0UXVlcnkucHJvdG90eXBlLmNsZWFuUmVzdWx0QXV0aERhdGEgPSBmdW5jdGlvbiAocmVzdWx0KSB7XG4gIGRlbGV0ZSByZXN1bHQucGFzc3dvcmQ7XG4gIGlmIChyZXN1bHQuYXV0aERhdGEpIHtcbiAgICBPYmplY3Qua2V5cyhyZXN1bHQuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgaWYgKHJlc3VsdC5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIHJlc3VsdC5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoT2JqZWN0LmtleXMocmVzdWx0LmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgZGVsZXRlIHJlc3VsdC5hdXRoRGF0YTtcbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHJlcGxhY2VFcXVhbGl0eUNvbnN0cmFpbnQgPSBjb25zdHJhaW50ID0+IHtcbiAgaWYgKHR5cGVvZiBjb25zdHJhaW50ICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBjb25zdHJhaW50O1xuICB9XG4gIGNvbnN0IGVxdWFsVG9PYmplY3QgPSB7fTtcbiAgbGV0IGhhc0RpcmVjdENvbnN0cmFpbnQgPSBmYWxzZTtcbiAgbGV0IGhhc09wZXJhdG9yQ29uc3RyYWludCA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IGtleSBpbiBjb25zdHJhaW50KSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCckJykgIT09IDApIHtcbiAgICAgIGhhc0RpcmVjdENvbnN0cmFpbnQgPSB0cnVlO1xuICAgICAgZXF1YWxUb09iamVjdFtrZXldID0gY29uc3RyYWludFtrZXldO1xuICAgIH0gZWxzZSB7XG4gICAgICBoYXNPcGVyYXRvckNvbnN0cmFpbnQgPSB0cnVlO1xuICAgIH1cbiAgfVxuICBpZiAoaGFzRGlyZWN0Q29uc3RyYWludCAmJiBoYXNPcGVyYXRvckNvbnN0cmFpbnQpIHtcbiAgICBjb25zdHJhaW50WyckZXEnXSA9IGVxdWFsVG9PYmplY3Q7XG4gICAgT2JqZWN0LmtleXMoZXF1YWxUb09iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgZGVsZXRlIGNvbnN0cmFpbnRba2V5XTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gY29uc3RyYWludDtcbn07XG5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZUVxdWFsaXR5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIHRoaXMucmVzdFdoZXJlICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLnJlc3RXaGVyZSkge1xuICAgIHRoaXMucmVzdFdoZXJlW2tleV0gPSByZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50KHRoaXMucmVzdFdoZXJlW2tleV0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hldGhlciBpdCB3YXMgc3VjY2Vzc2Z1bC5cbi8vIFBvcHVsYXRlcyB0aGlzLnJlc3BvbnNlIHdpdGggYW4gb2JqZWN0IHRoYXQgb25seSBoYXMgJ3Jlc3VsdHMnLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5GaW5kID0gZnVuY3Rpb24gKG9wdGlvbnMgPSB7fSkge1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5saW1pdCA9PT0gMCkge1xuICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3VsdHM6IFtdIH07XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIGNvbnN0IGZpbmRPcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5maW5kT3B0aW9ucyk7XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICBmaW5kT3B0aW9ucy5rZXlzID0gdGhpcy5rZXlzLm1hcChrZXkgPT4ge1xuICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpWzBdO1xuICAgIH0pO1xuICB9XG4gIGlmIChvcHRpb25zLm9wKSB7XG4gICAgZmluZE9wdGlvbnMub3AgPSBvcHRpb25zLm9wO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgZmluZE9wdGlvbnMsIHRoaXMuYXV0aClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiAhZmluZE9wdGlvbnMuZXhwbGFpbikge1xuICAgICAgICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgICAgICAgIHRoaXMuY2xlYW5SZXN1bHRBdXRoRGF0YShyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCByZXN1bHRzKTtcblxuICAgICAgaWYgKHRoaXMucmVkaXJlY3RDbGFzc05hbWUpIHtcbiAgICAgICAgZm9yICh2YXIgciBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgci5jbGFzc05hbWUgPSB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLnJlc3BvbnNlID0geyByZXN1bHRzOiByZXN1bHRzIH07XG4gICAgfSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hldGhlciBpdCB3YXMgc3VjY2Vzc2Z1bC5cbi8vIFBvcHVsYXRlcyB0aGlzLnJlc3BvbnNlLmNvdW50IHdpdGggdGhlIGNvdW50XG5SZXN0UXVlcnkucHJvdG90eXBlLnJ1bkNvdW50ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZG9Db3VudCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmZpbmRPcHRpb25zLmNvdW50ID0gdHJ1ZTtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMuc2tpcDtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMubGltaXQ7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgdGhpcy5maW5kT3B0aW9ucykudGhlbihjID0+IHtcbiAgICB0aGlzLnJlc3BvbnNlLmNvdW50ID0gYztcbiAgfSk7XG59O1xuXG5SZXN0UXVlcnkucHJvdG90eXBlLmRlbnlQcm90ZWN0ZWRGaWVsZHMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc2NoZW1hQ29udHJvbGxlciA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKTtcbiAgY29uc3QgcHJvdGVjdGVkRmllbGRzID1cbiAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgIHRoaXMuZmluZE9wdGlvbnMuYWNsLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdGhpcy5maW5kT3B0aW9uc1xuICAgICkgfHwgW107XG4gIGZvciAoY29uc3Qga2V5IG9mIHByb3RlY3RlZEZpZWxkcykge1xuICAgIGlmICh0aGlzLnJlc3RXaGVyZVtrZXldKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gcXVlcnkgJHtrZXl9IG9uIGNsYXNzICR7dGhpcy5jbGFzc05hbWV9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbGwgcG9pbnRlcnMgb24gYW4gb2JqZWN0XG5SZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGVBbGwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5pbmNsdWRlQWxsKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5sb2FkU2NoZW1hKClcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgY29uc3QgaW5jbHVkZUZpZWxkcyA9IFtdO1xuICAgICAgY29uc3Qga2V5RmllbGRzID0gW107XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykgfHxcbiAgICAgICAgICAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnQXJyYXknKVxuICAgICAgICApIHtcbiAgICAgICAgICBpbmNsdWRlRmllbGRzLnB1c2goW2ZpZWxkXSk7XG4gICAgICAgICAga2V5RmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBBZGQgZmllbGRzIHRvIGluY2x1ZGUsIGtleXMsIHJlbW92ZSBkdXBzXG4gICAgICB0aGlzLmluY2x1ZGUgPSBbLi4ubmV3IFNldChbLi4udGhpcy5pbmNsdWRlLCAuLi5pbmNsdWRlRmllbGRzXSldO1xuICAgICAgLy8gaWYgdGhpcy5rZXlzIG5vdCBzZXQsIHRoZW4gYWxsIGtleXMgYXJlIGFscmVhZHkgaW5jbHVkZWRcbiAgICAgIGlmICh0aGlzLmtleXMpIHtcbiAgICAgICAgdGhpcy5rZXlzID0gWy4uLm5ldyBTZXQoWy4uLnRoaXMua2V5cywgLi4ua2V5RmllbGRzXSldO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gVXBkYXRlcyBwcm9wZXJ0eSBgdGhpcy5rZXlzYCB0byBjb250YWluIGFsbCBrZXlzIGJ1dCB0aGUgb25lcyB1bnNlbGVjdGVkLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVFeGNsdWRlS2V5cyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmV4Y2x1ZGVLZXlzKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICB0aGlzLmtleXMgPSB0aGlzLmtleXMuZmlsdGVyKGsgPT4gIXRoaXMuZXhjbHVkZUtleXMuaW5jbHVkZXMoaykpO1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpO1xuICAgICAgdGhpcy5rZXlzID0gZmllbGRzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICB9KTtcbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBkYXRhIGF0IHRoZSBwYXRocyBwcm92aWRlZCBpbiB0aGlzLmluY2x1ZGUuXG5SZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGUgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcGF0aFJlc3BvbnNlID0gaW5jbHVkZVBhdGgoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIHRoaXMucmVzcG9uc2UsXG4gICAgdGhpcy5pbmNsdWRlWzBdLFxuICAgIHRoaXMucmVzdE9wdGlvbnNcbiAgKTtcbiAgaWYgKHBhdGhSZXNwb25zZS50aGVuKSB7XG4gICAgcmV0dXJuIHBhdGhSZXNwb25zZS50aGVuKG5ld1Jlc3BvbnNlID0+IHtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSBuZXdSZXNwb25zZTtcbiAgICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KTtcbiAgfSBlbHNlIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gIH1cblxuICByZXR1cm4gcGF0aFJlc3BvbnNlO1xufTtcblxuLy9SZXR1cm5zIGEgcHJvbWlzZSBvZiBhIHByb2Nlc3NlZCBzZXQgb2YgcmVzdWx0c1xuUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5BZnRlckZpbmRUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF0aGlzLnJ1bkFmdGVyRmluZCkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlckZpbmQnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyRmluZEhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGlmICghaGFzQWZ0ZXJGaW5kSG9vaykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBTa2lwIEFnZ3JlZ2F0ZSBhbmQgRGlzdGluY3QgUXVlcmllc1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5waXBlbGluZSB8fCB0aGlzLmZpbmRPcHRpb25zLmRpc3RpbmN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMucmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gdGhpcy5yZXN0V2hlcmU7XG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuICAvLyBSdW4gYWZ0ZXJGaW5kIHRyaWdnZXIgYW5kIHNldCB0aGUgbmV3IHJlc3VsdHNcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzLFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICBwYXJzZVF1ZXJ5LFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gRW5zdXJlIHdlIHByb3Blcmx5IHNldCB0aGUgY2xhc3NOYW1lIGJhY2tcbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICAgICAgb2JqZWN0ID0gb2JqZWN0LnRvSlNPTigpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3QuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHM7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG4vLyBBZGRzIGluY2x1ZGVkIHZhbHVlcyB0byB0aGUgcmVzcG9uc2UuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZCBuYW1lcy5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBhdWdtZW50ZWQgcmVzcG9uc2UuXG5mdW5jdGlvbiBpbmNsdWRlUGF0aChjb25maWcsIGF1dGgsIHJlc3BvbnNlLCBwYXRoLCByZXN0T3B0aW9ucyA9IHt9KSB7XG4gIHZhciBwb2ludGVycyA9IGZpbmRQb2ludGVycyhyZXNwb25zZS5yZXN1bHRzLCBwYXRoKTtcbiAgaWYgKHBvaW50ZXJzLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IHBvaW50ZXJzSGFzaCA9IHt9O1xuICBmb3IgKHZhciBwb2ludGVyIG9mIHBvaW50ZXJzKSB7XG4gICAgaWYgKCFwb2ludGVyKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcG9pbnRlci5jbGFzc05hbWU7XG4gICAgLy8gb25seSBpbmNsdWRlIHRoZSBnb29kIHBvaW50ZXJzXG4gICAgaWYgKGNsYXNzTmFtZSkge1xuICAgICAgcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0gPSBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSB8fCBuZXcgU2V0KCk7XG4gICAgICBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXS5hZGQocG9pbnRlci5vYmplY3RJZCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGluY2x1ZGVSZXN0T3B0aW9ucyA9IHt9O1xuICBpZiAocmVzdE9wdGlvbnMua2V5cykge1xuICAgIGNvbnN0IGtleXMgPSBuZXcgU2V0KHJlc3RPcHRpb25zLmtleXMuc3BsaXQoJywnKSk7XG4gICAgY29uc3Qga2V5U2V0ID0gQXJyYXkuZnJvbShrZXlzKS5yZWR1Y2UoKHNldCwga2V5KSA9PiB7XG4gICAgICBjb25zdCBrZXlQYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICBsZXQgaSA9IDA7XG4gICAgICBmb3IgKGk7IGkgPCBwYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChwYXRoW2ldICE9IGtleVBhdGhbaV0pIHtcbiAgICAgICAgICByZXR1cm4gc2V0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaSA8IGtleVBhdGgubGVuZ3RoKSB7XG4gICAgICAgIHNldC5hZGQoa2V5UGF0aFtpXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2V0O1xuICAgIH0sIG5ldyBTZXQoKSk7XG4gICAgaWYgKGtleVNldC5zaXplID4gMCkge1xuICAgICAgaW5jbHVkZVJlc3RPcHRpb25zLmtleXMgPSBBcnJheS5mcm9tKGtleVNldCkuam9pbignLCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXN0T3B0aW9ucy5leGNsdWRlS2V5cykge1xuICAgIGNvbnN0IGV4Y2x1ZGVLZXlzID0gbmV3IFNldChyZXN0T3B0aW9ucy5leGNsdWRlS2V5cy5zcGxpdCgnLCcpKTtcbiAgICBjb25zdCBleGNsdWRlS2V5U2V0ID0gQXJyYXkuZnJvbShleGNsdWRlS2V5cykucmVkdWNlKChzZXQsIGtleSkgPT4ge1xuICAgICAgY29uc3Qga2V5UGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChpOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocGF0aFtpXSAhPSBrZXlQYXRoW2ldKSB7XG4gICAgICAgICAgcmV0dXJuIHNldDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGkgPT0ga2V5UGF0aC5sZW5ndGggLSAxKSB7XG4gICAgICAgIHNldC5hZGQoa2V5UGF0aFtpXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2V0O1xuICAgIH0sIG5ldyBTZXQoKSk7XG4gICAgaWYgKGV4Y2x1ZGVLZXlTZXQuc2l6ZSA+IDApIHtcbiAgICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5leGNsdWRlS2V5cyA9IEFycmF5LmZyb20oZXhjbHVkZUtleVNldCkuam9pbignLCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmIChyZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3QgcXVlcnlQcm9taXNlcyA9IE9iamVjdC5rZXlzKHBvaW50ZXJzSGFzaCkubWFwKGNsYXNzTmFtZSA9PiB7XG4gICAgY29uc3Qgb2JqZWN0SWRzID0gQXJyYXkuZnJvbShwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSk7XG4gICAgbGV0IHdoZXJlO1xuICAgIGlmIChvYmplY3RJZHMubGVuZ3RoID09PSAxKSB7XG4gICAgICB3aGVyZSA9IHsgb2JqZWN0SWQ6IG9iamVjdElkc1swXSB9O1xuICAgIH0gZWxzZSB7XG4gICAgICB3aGVyZSA9IHsgb2JqZWN0SWQ6IHsgJGluOiBvYmplY3RJZHMgfSB9O1xuICAgIH1cbiAgICB2YXIgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCB3aGVyZSwgaW5jbHVkZVJlc3RPcHRpb25zKTtcbiAgICByZXR1cm4gcXVlcnkuZXhlY3V0ZSh7IG9wOiAnZ2V0JyB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdHMpO1xuICAgIH0pO1xuICB9KTtcblxuICAvLyBHZXQgdGhlIG9iamVjdHMgZm9yIGFsbCB0aGVzZSBvYmplY3QgaWRzXG4gIHJldHVybiBQcm9taXNlLmFsbChxdWVyeVByb21pc2VzKS50aGVuKHJlc3BvbnNlcyA9PiB7XG4gICAgdmFyIHJlcGxhY2UgPSByZXNwb25zZXMucmVkdWNlKChyZXBsYWNlLCBpbmNsdWRlUmVzcG9uc2UpID0+IHtcbiAgICAgIGZvciAodmFyIG9iaiBvZiBpbmNsdWRlUmVzcG9uc2UucmVzdWx0cykge1xuICAgICAgICBvYmouX190eXBlID0gJ09iamVjdCc7XG4gICAgICAgIG9iai5jbGFzc05hbWUgPSBpbmNsdWRlUmVzcG9uc2UuY2xhc3NOYW1lO1xuXG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lID09ICdfVXNlcicgJiYgIWF1dGguaXNNYXN0ZXIpIHtcbiAgICAgICAgICBkZWxldGUgb2JqLnNlc3Npb25Ub2tlbjtcbiAgICAgICAgICBkZWxldGUgb2JqLmF1dGhEYXRhO1xuICAgICAgICB9XG4gICAgICAgIHJlcGxhY2Vbb2JqLm9iamVjdElkXSA9IG9iajtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXBsYWNlO1xuICAgIH0sIHt9KTtcblxuICAgIHZhciByZXNwID0ge1xuICAgICAgcmVzdWx0czogcmVwbGFjZVBvaW50ZXJzKHJlc3BvbnNlLnJlc3VsdHMsIHBhdGgsIHJlcGxhY2UpLFxuICAgIH07XG4gICAgaWYgKHJlc3BvbnNlLmNvdW50KSB7XG4gICAgICByZXNwLmNvdW50ID0gcmVzcG9uc2UuY291bnQ7XG4gICAgfVxuICAgIHJldHVybiByZXNwO1xuICB9KTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0IHRvIGZpbmQgcG9pbnRlcnMgaW4sIG9yXG4vLyBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gSWYgdGhlIHBhdGggeWllbGRzIHRoaW5ncyB0aGF0IGFyZW4ndCBwb2ludGVycywgdGhpcyB0aHJvd3MgYW4gZXJyb3IuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZHMgdG8gc2VhcmNoIGludG8uXG4vLyBSZXR1cm5zIGEgbGlzdCBvZiBwb2ludGVycyBpbiBSRVNUIGZvcm1hdC5cbmZ1bmN0aW9uIGZpbmRQb2ludGVycyhvYmplY3QsIHBhdGgpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgdmFyIGFuc3dlciA9IFtdO1xuICAgIGZvciAodmFyIHggb2Ygb2JqZWN0KSB7XG4gICAgICBhbnN3ZXIgPSBhbnN3ZXIuY29uY2F0KGZpbmRQb2ludGVycyh4LCBwYXRoKSk7XG4gICAgfVxuICAgIHJldHVybiBhbnN3ZXI7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgIW9iamVjdCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIGlmIChwYXRoLmxlbmd0aCA9PSAwKSB7XG4gICAgaWYgKG9iamVjdCA9PT0gbnVsbCB8fCBvYmplY3QuX190eXBlID09ICdQb2ludGVyJykge1xuICAgICAgcmV0dXJuIFtvYmplY3RdO1xuICAgIH1cbiAgICByZXR1cm4gW107XG4gIH1cblxuICB2YXIgc3Vib2JqZWN0ID0gb2JqZWN0W3BhdGhbMF1dO1xuICBpZiAoIXN1Ym9iamVjdCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICByZXR1cm4gZmluZFBvaW50ZXJzKHN1Ym9iamVjdCwgcGF0aC5zbGljZSgxKSk7XG59XG5cbi8vIE9iamVjdCBtYXkgYmUgYSBsaXN0IG9mIFJFU1QtZm9ybWF0IG9iamVjdHMgdG8gcmVwbGFjZSBwb2ludGVyc1xuLy8gaW4sIG9yIGl0IG1heSBiZSBhIHNpbmdsZSBvYmplY3QuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZHMgdG8gc2VhcmNoIGludG8uXG4vLyByZXBsYWNlIGlzIGEgbWFwIGZyb20gb2JqZWN0IGlkIC0+IG9iamVjdC5cbi8vIFJldHVybnMgc29tZXRoaW5nIGFuYWxvZ291cyB0byBvYmplY3QsIGJ1dCB3aXRoIHRoZSBhcHByb3ByaWF0ZVxuLy8gcG9pbnRlcnMgaW5mbGF0ZWQuXG5mdW5jdGlvbiByZXBsYWNlUG9pbnRlcnMob2JqZWN0LCBwYXRoLCByZXBsYWNlKSB7XG4gIGlmIChvYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiBvYmplY3RcbiAgICAgIC5tYXAob2JqID0+IHJlcGxhY2VQb2ludGVycyhvYmosIHBhdGgsIHJlcGxhY2UpKVxuICAgICAgLmZpbHRlcihvYmogPT4gdHlwZW9mIG9iaiAhPT0gJ3VuZGVmaW5lZCcpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8ICFvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgaWYgKHBhdGgubGVuZ3RoID09PSAwKSB7XG4gICAgaWYgKG9iamVjdCAmJiBvYmplY3QuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIHJldHVybiByZXBsYWNlW29iamVjdC5vYmplY3RJZF07XG4gICAgfVxuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICB2YXIgc3Vib2JqZWN0ID0gb2JqZWN0W3BhdGhbMF1dO1xuICBpZiAoIXN1Ym9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgdmFyIG5ld3N1YiA9IHJlcGxhY2VQb2ludGVycyhzdWJvYmplY3QsIHBhdGguc2xpY2UoMSksIHJlcGxhY2UpO1xuICB2YXIgYW5zd2VyID0ge307XG4gIGZvciAodmFyIGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAoa2V5ID09IHBhdGhbMF0pIHtcbiAgICAgIGFuc3dlcltrZXldID0gbmV3c3ViO1xuICAgIH0gZWxzZSB7XG4gICAgICBhbnN3ZXJba2V5XSA9IG9iamVjdFtrZXldO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYW5zd2VyO1xufVxuXG4vLyBGaW5kcyBhIHN1Ym9iamVjdCB0aGF0IGhhcyB0aGUgZ2l2ZW4ga2V5LCBpZiB0aGVyZSBpcyBvbmUuXG4vLyBSZXR1cm5zIHVuZGVmaW5lZCBvdGhlcndpc2UuXG5mdW5jdGlvbiBmaW5kT2JqZWN0V2l0aEtleShyb290LCBrZXkpIHtcbiAgaWYgKHR5cGVvZiByb290ICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAocm9vdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgZm9yICh2YXIgaXRlbSBvZiByb290KSB7XG4gICAgICBjb25zdCBhbnN3ZXIgPSBmaW5kT2JqZWN0V2l0aEtleShpdGVtLCBrZXkpO1xuICAgICAgaWYgKGFuc3dlcikge1xuICAgICAgICByZXR1cm4gYW5zd2VyO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAocm9vdCAmJiByb290W2tleV0pIHtcbiAgICByZXR1cm4gcm9vdDtcbiAgfVxuICBmb3IgKHZhciBzdWJrZXkgaW4gcm9vdCkge1xuICAgIGNvbnN0IGFuc3dlciA9IGZpbmRPYmplY3RXaXRoS2V5KHJvb3Rbc3Via2V5XSwga2V5KTtcbiAgICBpZiAoYW5zd2VyKSB7XG4gICAgICByZXR1cm4gYW5zd2VyO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFJlc3RRdWVyeTtcbiJdfQ==