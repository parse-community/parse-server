"use strict";

// An object that encapsulates everything we need to run a 'find'
// operation, encoded in the REST API format.

var SchemaController = require('./Controllers/SchemaController');
var Parse = require('parse/node').Parse;
const triggers = require('./triggers');
const {
  continueWhile
} = require('parse/lib/node/promiseUtils');
const AlwaysSelectedKeys = ['objectId', 'createdAt', 'updatedAt', 'ACL'];
// restOptions can include:
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
  this.includeAll = false;

  // The format for this.include is not the same as the format for the
  // include option - it's the paths we should include, in order,
  // stored as arrays, taking into account that we need to include foo
  // before including foo.bar. Also it should dedupe.
  // For example, passing an arg of include=foo.bar,foo.baz could lead to
  // this.include = [['foo'], ['foo', 'baz'], ['foo', 'bar']]
  this.include = [];
  let keysForInclude = '';

  // If we have keys, we probably want to force some includes (n-1 level)
  // See issue: https://github.com/parse-community/parse-server/issues/3185
  if (Object.prototype.hasOwnProperty.call(restOptions, 'keys')) {
    keysForInclude = restOptions.keys;
  }

  // If we have keys, we probably want to force some includes (n-1 level)
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
    }).join(',');

    // Concat the possibly present include string with the one from the keys
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
          }
          // Load the existing includes (from keys)
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
}

// A convenient method to perform all the steps of processing a query
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
  } = this;
  // if the limit is set, use it
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
};

// Uses the Auth object to get the list of roles, adds the user id
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
};

// Changes the className if redirectClassNameForKey is set.
// Returns a promise.
RestQuery.prototype.redirectClassNameForKey = function () {
  if (!this.redirectKey) {
    return Promise.resolve();
  }

  // We need to change the class name based on the schema
  return this.config.database.redirectClassNameForKey(this.className, this.redirectKey).then(newClassName => {
    this.className = newClassName;
    this.redirectClassName = newClassName;
  });
};

// Validates this operation against the allowClientClassCreation config.
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
}

// Replaces a $inQuery clause by running the subquery, if there is an
// $inQuery clause.
// The $inQuery clause turns into an $in with values that are just
// pointers to the objects returned in the subquery.
RestQuery.prototype.replaceInQuery = function () {
  var inQueryObject = findObjectWithKey(this.restWhere, '$inQuery');
  if (!inQueryObject) {
    return;
  }

  // The inQuery value must have precisely two keys - where and className
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
    transformInQuery(inQueryObject, subquery.className, response.results);
    // Recurse to repeat
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
}

// Replaces a $notInQuery clause by running the subquery, if there is an
// $notInQuery clause.
// The $notInQuery clause turns into a $nin with values that are just
// pointers to the objects returned in the subquery.
RestQuery.prototype.replaceNotInQuery = function () {
  var notInQueryObject = findObjectWithKey(this.restWhere, '$notInQuery');
  if (!notInQueryObject) {
    return;
  }

  // The notInQuery value must have precisely two keys - where and className
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
    transformNotInQuery(notInQueryObject, subquery.className, response.results);
    // Recurse to repeat
    return this.replaceNotInQuery();
  });
};

// Used to get the deepest object from json using dot notation.
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
};

// Replaces a $select clause by running the subquery, if there is a
// $select clause.
// The $select clause turns into an $in with values selected out of
// the subquery.
// Returns a possible-promise.
RestQuery.prototype.replaceSelect = function () {
  var selectObject = findObjectWithKey(this.restWhere, '$select');
  if (!selectObject) {
    return;
  }

  // The select value must have precisely two keys - query and key
  var selectValue = selectObject['$select'];
  // iOS SDK don't send where if not set, let it pass
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
    transformSelect(selectObject, selectValue.key, response.results);
    // Keep replacing $select clauses
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
};

// Replaces a $dontSelect clause by running the subquery, if there is a
// $dontSelect clause.
// The $dontSelect clause turns into an $nin with values selected out of
// the subquery.
// Returns a possible-promise.
RestQuery.prototype.replaceDontSelect = function () {
  var dontSelectObject = findObjectWithKey(this.restWhere, '$dontSelect');
  if (!dontSelectObject) {
    return;
  }

  // The dontSelect value must have precisely two keys - query and key
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
    transformDontSelect(dontSelectObject, dontSelectValue.key, response.results);
    // Keep replacing $dontSelect clauses
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
};

// Returns a promise for whether it was successful.
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
};

// Returns a promise for whether it was successful.
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
};

// Augments this.response with all pointers on an object
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
    }
    // Add fields to include, keys, remove dups
    this.include = [...new Set([...this.include, ...includeFields])];
    // if this.keys not set, then all keys are already included
    if (this.keys) {
      this.keys = [...new Set([...this.keys, ...keyFields])];
    }
  });
};

// Updates property `this.keys` to contain all keys but the ones unselected.
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
};

// Augments this.response with data at the paths provided in this.include.
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
};

//Returns a promise of a processed set of results
RestQuery.prototype.runAfterFindTrigger = function () {
  if (!this.response) {
    return;
  }
  if (!this.runAfterFind) {
    return;
  }
  // Avoid doing any setup for triggers if there is no 'afterFind' trigger for this class.
  const hasAfterFindHook = triggers.triggerExists(this.className, triggers.Types.afterFind, this.config.applicationId);
  if (!hasAfterFindHook) {
    return Promise.resolve();
  }
  // Skip Aggregate and Distinct Queries
  if (this.findOptions.pipeline || this.findOptions.distinct) {
    return Promise.resolve();
  }
  const json = Object.assign({}, this.restOptions);
  json.where = this.restWhere;
  const parseQuery = new Parse.Query(this.className);
  parseQuery.withJSON(json);
  // Run afterFind trigger and set the new results
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
};

// Adds included values to the response.
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
    const className = pointer.className;
    // only include the good pointers
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
  });

  // Get the objects for all these object ids
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
}

// Object may be a list of REST-format object to find pointers in, or
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
}

// Object may be a list of REST-format objects to replace pointers
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
}

// Finds a subobject that has the given key, if there is one.
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsIlBhcnNlIiwidHJpZ2dlcnMiLCJjb250aW51ZVdoaWxlIiwiQWx3YXlzU2VsZWN0ZWRLZXlzIiwiUmVzdFF1ZXJ5IiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsInJlc3RXaGVyZSIsInJlc3RPcHRpb25zIiwiY2xpZW50U0RLIiwicnVuQWZ0ZXJGaW5kIiwiY29udGV4dCIsInJlc3BvbnNlIiwiZmluZE9wdGlvbnMiLCJpc01hc3RlciIsInVzZXIiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIiRhbmQiLCJfX3R5cGUiLCJvYmplY3RJZCIsImlkIiwiZG9Db3VudCIsImluY2x1ZGVBbGwiLCJpbmNsdWRlIiwia2V5c0ZvckluY2x1ZGUiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJrZXlzIiwiZXhjbHVkZUtleXMiLCJsZW5ndGgiLCJzcGxpdCIsImZpbHRlciIsImtleSIsIm1hcCIsInNsaWNlIiwibGFzdEluZGV4T2YiLCJqb2luIiwib3B0aW9uIiwiY29uY2F0IiwiQXJyYXkiLCJmcm9tIiwiU2V0IiwiZXhjbHVkZSIsImsiLCJpbmRleE9mIiwiZmllbGRzIiwib3JkZXIiLCJzb3J0IiwicmVkdWNlIiwic29ydE1hcCIsImZpZWxkIiwidHJpbSIsInNjb3JlIiwiJG1ldGEiLCJwYXRocyIsImluY2x1ZGVzIiwicGF0aFNldCIsIm1lbW8iLCJwYXRoIiwiaW5kZXgiLCJwYXJ0cyIsInMiLCJhIiwiYiIsInJlZGlyZWN0S2V5IiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJyZWRpcmVjdENsYXNzTmFtZSIsIklOVkFMSURfSlNPTiIsImV4ZWN1dGUiLCJleGVjdXRlT3B0aW9ucyIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImJ1aWxkUmVzdFdoZXJlIiwiZGVueVByb3RlY3RlZEZpZWxkcyIsImhhbmRsZUluY2x1ZGVBbGwiLCJoYW5kbGVFeGNsdWRlS2V5cyIsInJ1bkZpbmQiLCJydW5Db3VudCIsImhhbmRsZUluY2x1ZGUiLCJydW5BZnRlckZpbmRUcmlnZ2VyIiwiZWFjaCIsImNhbGxiYWNrIiwibGltaXQiLCJmaW5pc2hlZCIsInF1ZXJ5IiwicmVzdWx0cyIsImZvckVhY2giLCJhc3NpZ24iLCIkZ3QiLCJnZXRVc2VyQW5kUm9sZUFDTCIsInZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiIsInJlcGxhY2VTZWxlY3QiLCJyZXBsYWNlRG9udFNlbGVjdCIsInJlcGxhY2VJblF1ZXJ5IiwicmVwbGFjZU5vdEluUXVlcnkiLCJyZXBsYWNlRXF1YWxpdHkiLCJhY2wiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsImRhdGFiYXNlIiwibmV3Q2xhc3NOYW1lIiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImxvYWRTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwiaGFzQ2xhc3MiLCJPUEVSQVRJT05fRk9SQklEREVOIiwidHJhbnNmb3JtSW5RdWVyeSIsImluUXVlcnlPYmplY3QiLCJ2YWx1ZXMiLCJyZXN1bHQiLCJwdXNoIiwiaXNBcnJheSIsImZpbmRPYmplY3RXaXRoS2V5IiwiaW5RdWVyeVZhbHVlIiwid2hlcmUiLCJJTlZBTElEX1FVRVJZIiwiYWRkaXRpb25hbE9wdGlvbnMiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwicmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeSIsInRyYW5zZm9ybU5vdEluUXVlcnkiLCJub3RJblF1ZXJ5T2JqZWN0Iiwibm90SW5RdWVyeVZhbHVlIiwiZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkiLCJqc29uIiwiaWR4Iiwic3JjIiwic3BsaWNlIiwidHJhbnNmb3JtU2VsZWN0Iiwic2VsZWN0T2JqZWN0Iiwib2JqZWN0cyIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImZpbmQiLCJleHBsYWluIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsInIiLCJjb3VudCIsInNraXAiLCJjIiwicHJvdGVjdGVkRmllbGRzIiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiZ2V0T25lU2NoZW1hIiwic2NoZW1hIiwiaW5jbHVkZUZpZWxkcyIsImtleUZpZWxkcyIsInR5cGUiLCJwYXRoUmVzcG9uc2UiLCJpbmNsdWRlUGF0aCIsIm5ld1Jlc3BvbnNlIiwiaGFzQWZ0ZXJGaW5kSG9vayIsInRyaWdnZXJFeGlzdHMiLCJUeXBlcyIsImFmdGVyRmluZCIsImFwcGxpY2F0aW9uSWQiLCJwaXBlbGluZSIsImRpc3RpbmN0IiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwiaSIsInNpemUiLCJleGNsdWRlS2V5U2V0IiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwicXVlcnlQcm9taXNlcyIsIm9iamVjdElkcyIsIiRpbiIsImFsbCIsInJlc3BvbnNlcyIsInJlcGxhY2UiLCJpbmNsdWRlUmVzcG9uc2UiLCJvYmoiLCJzZXNzaW9uVG9rZW4iLCJyZXNwIiwicmVwbGFjZVBvaW50ZXJzIiwiYW5zd2VyIiwieCIsInN1Ym9iamVjdCIsIm5ld3N1YiIsInJvb3QiLCJpdGVtIiwic3Via2V5IiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0UXVlcnkuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQW4gb2JqZWN0IHRoYXQgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYSAnZmluZCdcbi8vIG9wZXJhdGlvbiwgZW5jb2RlZCBpbiB0aGUgUkVTVCBBUEkgZm9ybWF0LlxuXG52YXIgU2NoZW1hQ29udHJvbGxlciA9IHJlcXVpcmUoJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcicpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuY29uc3QgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG5jb25zdCB7IGNvbnRpbnVlV2hpbGUgfSA9IHJlcXVpcmUoJ3BhcnNlL2xpYi9ub2RlL3Byb21pc2VVdGlscycpO1xuY29uc3QgQWx3YXlzU2VsZWN0ZWRLZXlzID0gWydvYmplY3RJZCcsICdjcmVhdGVkQXQnLCAndXBkYXRlZEF0JywgJ0FDTCddO1xuLy8gcmVzdE9wdGlvbnMgY2FuIGluY2x1ZGU6XG4vLyAgIHNraXBcbi8vICAgbGltaXRcbi8vICAgb3JkZXJcbi8vICAgY291bnRcbi8vICAgaW5jbHVkZVxuLy8gICBrZXlzXG4vLyAgIGV4Y2x1ZGVLZXlzXG4vLyAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5XG4vLyAgIHJlYWRQcmVmZXJlbmNlXG4vLyAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZVxuLy8gICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlXG5mdW5jdGlvbiBSZXN0UXVlcnkoXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgY2xhc3NOYW1lLFxuICByZXN0V2hlcmUgPSB7fSxcbiAgcmVzdE9wdGlvbnMgPSB7fSxcbiAgY2xpZW50U0RLLFxuICBydW5BZnRlckZpbmQgPSB0cnVlLFxuICBjb250ZXh0XG4pIHtcbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuYXV0aCA9IGF1dGg7XG4gIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB0aGlzLnJlc3RXaGVyZSA9IHJlc3RXaGVyZTtcbiAgdGhpcy5yZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zO1xuICB0aGlzLmNsaWVudFNESyA9IGNsaWVudFNESztcbiAgdGhpcy5ydW5BZnRlckZpbmQgPSBydW5BZnRlckZpbmQ7XG4gIHRoaXMucmVzcG9uc2UgPSBudWxsO1xuICB0aGlzLmZpbmRPcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IGNvbnRleHQgfHwge307XG4gIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09ICdfU2Vzc2lvbicpIHtcbiAgICAgIGlmICghdGhpcy5hdXRoLnVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgICAgfVxuICAgICAgdGhpcy5yZXN0V2hlcmUgPSB7XG4gICAgICAgICRhbmQ6IFtcbiAgICAgICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgdGhpcy5kb0NvdW50ID0gZmFsc2U7XG4gIHRoaXMuaW5jbHVkZUFsbCA9IGZhbHNlO1xuXG4gIC8vIFRoZSBmb3JtYXQgZm9yIHRoaXMuaW5jbHVkZSBpcyBub3QgdGhlIHNhbWUgYXMgdGhlIGZvcm1hdCBmb3IgdGhlXG4gIC8vIGluY2x1ZGUgb3B0aW9uIC0gaXQncyB0aGUgcGF0aHMgd2Ugc2hvdWxkIGluY2x1ZGUsIGluIG9yZGVyLFxuICAvLyBzdG9yZWQgYXMgYXJyYXlzLCB0YWtpbmcgaW50byBhY2NvdW50IHRoYXQgd2UgbmVlZCB0byBpbmNsdWRlIGZvb1xuICAvLyBiZWZvcmUgaW5jbHVkaW5nIGZvby5iYXIuIEFsc28gaXQgc2hvdWxkIGRlZHVwZS5cbiAgLy8gRm9yIGV4YW1wbGUsIHBhc3NpbmcgYW4gYXJnIG9mIGluY2x1ZGU9Zm9vLmJhcixmb28uYmF6IGNvdWxkIGxlYWQgdG9cbiAgLy8gdGhpcy5pbmNsdWRlID0gW1snZm9vJ10sIFsnZm9vJywgJ2JheiddLCBbJ2ZvbycsICdiYXInXV1cbiAgdGhpcy5pbmNsdWRlID0gW107XG4gIGxldCBrZXlzRm9ySW5jbHVkZSA9ICcnO1xuXG4gIC8vIElmIHdlIGhhdmUga2V5cywgd2UgcHJvYmFibHkgd2FudCB0byBmb3JjZSBzb21lIGluY2x1ZGVzIChuLTEgbGV2ZWwpXG4gIC8vIFNlZSBpc3N1ZTogaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzMxODVcbiAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN0T3B0aW9ucywgJ2tleXMnKSkge1xuICAgIGtleXNGb3JJbmNsdWRlID0gcmVzdE9wdGlvbnMua2V5cztcbiAgfVxuXG4gIC8vIElmIHdlIGhhdmUga2V5cywgd2UgcHJvYmFibHkgd2FudCB0byBmb3JjZSBzb21lIGluY2x1ZGVzIChuLTEgbGV2ZWwpXG4gIC8vIGluIG9yZGVyIHRvIGV4Y2x1ZGUgc3BlY2lmaWMga2V5cy5cbiAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN0T3B0aW9ucywgJ2V4Y2x1ZGVLZXlzJykpIHtcbiAgICBrZXlzRm9ySW5jbHVkZSArPSAnLCcgKyByZXN0T3B0aW9ucy5leGNsdWRlS2V5cztcbiAgfVxuXG4gIGlmIChrZXlzRm9ySW5jbHVkZS5sZW5ndGggPiAwKSB7XG4gICAga2V5c0ZvckluY2x1ZGUgPSBrZXlzRm9ySW5jbHVkZVxuICAgICAgLnNwbGl0KCcsJylcbiAgICAgIC5maWx0ZXIoa2V5ID0+IHtcbiAgICAgICAgLy8gQXQgbGVhc3QgMiBjb21wb25lbnRzXG4gICAgICAgIHJldHVybiBrZXkuc3BsaXQoJy4nKS5sZW5ndGggPiAxO1xuICAgICAgfSlcbiAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgLy8gU2xpY2UgdGhlIGxhc3QgY29tcG9uZW50IChhLmIuYyAtPiBhLmIpXG4gICAgICAgIC8vIE90aGVyd2lzZSB3ZSdsbCBpbmNsdWRlIG9uZSBsZXZlbCB0b28gbXVjaC5cbiAgICAgICAgcmV0dXJuIGtleS5zbGljZSgwLCBrZXkubGFzdEluZGV4T2YoJy4nKSk7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywnKTtcblxuICAgIC8vIENvbmNhdCB0aGUgcG9zc2libHkgcHJlc2VudCBpbmNsdWRlIHN0cmluZyB3aXRoIHRoZSBvbmUgZnJvbSB0aGUga2V5c1xuICAgIC8vIERlZHVwIC8gc29ydGluZyBpcyBoYW5kbGUgaW4gJ2luY2x1ZGUnIGNhc2UuXG4gICAgaWYgKGtleXNGb3JJbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICAgIGlmICghcmVzdE9wdGlvbnMuaW5jbHVkZSB8fCByZXN0T3B0aW9ucy5pbmNsdWRlLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgKz0gJywnICsga2V5c0ZvckluY2x1ZGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZm9yICh2YXIgb3B0aW9uIGluIHJlc3RPcHRpb25zKSB7XG4gICAgc3dpdGNoIChvcHRpb24pIHtcbiAgICAgIGNhc2UgJ2tleXMnOiB7XG4gICAgICAgIGNvbnN0IGtleXMgPSByZXN0T3B0aW9ucy5rZXlzXG4gICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAuZmlsdGVyKGtleSA9PiBrZXkubGVuZ3RoID4gMClcbiAgICAgICAgICAuY29uY2F0KEFsd2F5c1NlbGVjdGVkS2V5cyk7XG4gICAgICAgIHRoaXMua2V5cyA9IEFycmF5LmZyb20obmV3IFNldChrZXlzKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnZXhjbHVkZUtleXMnOiB7XG4gICAgICAgIGNvbnN0IGV4Y2x1ZGUgPSByZXN0T3B0aW9ucy5leGNsdWRlS2V5c1xuICAgICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgICAgLmZpbHRlcihrID0+IEFsd2F5c1NlbGVjdGVkS2V5cy5pbmRleE9mKGspIDwgMCk7XG4gICAgICAgIHRoaXMuZXhjbHVkZUtleXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoZXhjbHVkZSkpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ2NvdW50JzpcbiAgICAgICAgdGhpcy5kb0NvdW50ID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlQWxsJzpcbiAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdleHBsYWluJzpcbiAgICAgIGNhc2UgJ2hpbnQnOlxuICAgICAgY2FzZSAnZGlzdGluY3QnOlxuICAgICAgY2FzZSAncGlwZWxpbmUnOlxuICAgICAgY2FzZSAnc2tpcCc6XG4gICAgICBjYXNlICdsaW1pdCc6XG4gICAgICBjYXNlICdyZWFkUHJlZmVyZW5jZSc6XG4gICAgICAgIHRoaXMuZmluZE9wdGlvbnNbb3B0aW9uXSA9IHJlc3RPcHRpb25zW29wdGlvbl07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnb3JkZXInOlxuICAgICAgICB2YXIgZmllbGRzID0gcmVzdE9wdGlvbnMub3JkZXIuc3BsaXQoJywnKTtcbiAgICAgICAgdGhpcy5maW5kT3B0aW9ucy5zb3J0ID0gZmllbGRzLnJlZHVjZSgoc29ydE1hcCwgZmllbGQpID0+IHtcbiAgICAgICAgICBmaWVsZCA9IGZpZWxkLnRyaW0oKTtcbiAgICAgICAgICBpZiAoZmllbGQgPT09ICckc2NvcmUnIHx8IGZpZWxkID09PSAnLSRzY29yZScpIHtcbiAgICAgICAgICAgIHNvcnRNYXAuc2NvcmUgPSB7ICRtZXRhOiAndGV4dFNjb3JlJyB9O1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmllbGRbMF0gPT0gJy0nKSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkLnNsaWNlKDEpXSA9IC0xO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkXSA9IDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBzb3J0TWFwO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZSc6IHtcbiAgICAgICAgY29uc3QgcGF0aHMgPSByZXN0T3B0aW9ucy5pbmNsdWRlLnNwbGl0KCcsJyk7XG4gICAgICAgIGlmIChwYXRocy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICAvLyBMb2FkIHRoZSBleGlzdGluZyBpbmNsdWRlcyAoZnJvbSBrZXlzKVxuICAgICAgICBjb25zdCBwYXRoU2V0ID0gcGF0aHMucmVkdWNlKChtZW1vLCBwYXRoKSA9PiB7XG4gICAgICAgICAgLy8gU3BsaXQgZWFjaCBwYXRocyBvbiAuIChhLmIuYyAtPiBbYSxiLGNdKVxuICAgICAgICAgIC8vIHJlZHVjZSB0byBjcmVhdGUgYWxsIHBhdGhzXG4gICAgICAgICAgLy8gKFthLGIsY10gLT4ge2E6IHRydWUsICdhLmInOiB0cnVlLCAnYS5iLmMnOiB0cnVlfSlcbiAgICAgICAgICByZXR1cm4gcGF0aC5zcGxpdCgnLicpLnJlZHVjZSgobWVtbywgcGF0aCwgaW5kZXgsIHBhcnRzKSA9PiB7XG4gICAgICAgICAgICBtZW1vW3BhcnRzLnNsaWNlKDAsIGluZGV4ICsgMSkuam9pbignLicpXSA9IHRydWU7XG4gICAgICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgICAgICB9LCBtZW1vKTtcbiAgICAgICAgfSwge30pO1xuXG4gICAgICAgIHRoaXMuaW5jbHVkZSA9IE9iamVjdC5rZXlzKHBhdGhTZXQpXG4gICAgICAgICAgLm1hcChzID0+IHtcbiAgICAgICAgICAgIHJldHVybiBzLnNwbGl0KCcuJyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGg7IC8vIFNvcnQgYnkgbnVtYmVyIG9mIGNvbXBvbmVudHNcbiAgICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdyZWRpcmVjdENsYXNzTmFtZUZvcktleSc6XG4gICAgICAgIHRoaXMucmVkaXJlY3RLZXkgPSByZXN0T3B0aW9ucy5yZWRpcmVjdENsYXNzTmFtZUZvcktleTtcbiAgICAgICAgdGhpcy5yZWRpcmVjdENsYXNzTmFtZSA9IG51bGw7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZVJlYWRQcmVmZXJlbmNlJzpcbiAgICAgIGNhc2UgJ3N1YnF1ZXJ5UmVhZFByZWZlcmVuY2UnOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgb3B0aW9uOiAnICsgb3B0aW9uKTtcbiAgICB9XG4gIH1cbn1cblxuLy8gQSBjb252ZW5pZW50IG1ldGhvZCB0byBwZXJmb3JtIGFsbCB0aGUgc3RlcHMgb2YgcHJvY2Vzc2luZyBhIHF1ZXJ5XG4vLyBpbiBvcmRlci5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgcmVzcG9uc2UgLSBhbiBvYmplY3Qgd2l0aCBvcHRpb25hbCBrZXlzXG4vLyAncmVzdWx0cycgYW5kICdjb3VudCcuXG4vLyBUT0RPOiBjb25zb2xpZGF0ZSB0aGUgcmVwbGFjZVggZnVuY3Rpb25zXG5SZXN0UXVlcnkucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoZXhlY3V0ZU9wdGlvbnMpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuYnVpbGRSZXN0V2hlcmUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbnlQcm90ZWN0ZWRGaWVsZHMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGVBbGwoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUV4Y2x1ZGVLZXlzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5GaW5kKGV4ZWN1dGVPcHRpb25zKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkNvdW50KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlckZpbmRUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXNwb25zZTtcbiAgICB9KTtcbn07XG5cblJlc3RRdWVyeS5wcm90b3R5cGUuZWFjaCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICBjb25zdCB7IGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCByZXN0V2hlcmUsIHJlc3RPcHRpb25zLCBjbGllbnRTREsgfSA9IHRoaXM7XG4gIC8vIGlmIHRoZSBsaW1pdCBpcyBzZXQsIHVzZSBpdFxuICByZXN0T3B0aW9ucy5saW1pdCA9IHJlc3RPcHRpb25zLmxpbWl0IHx8IDEwMDtcbiAgcmVzdE9wdGlvbnMub3JkZXIgPSAnb2JqZWN0SWQnO1xuICBsZXQgZmluaXNoZWQgPSBmYWxzZTtcblxuICByZXR1cm4gY29udGludWVXaGlsZShcbiAgICAoKSA9PiB7XG4gICAgICByZXR1cm4gIWZpbmlzaGVkO1xuICAgIH0sXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgICAgICBjb25maWcsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgcmVzdFdoZXJlLFxuICAgICAgICByZXN0T3B0aW9ucyxcbiAgICAgICAgY2xpZW50U0RLLFxuICAgICAgICB0aGlzLnJ1bkFmdGVyRmluZCxcbiAgICAgICAgdGhpcy5jb250ZXh0XG4gICAgICApO1xuICAgICAgY29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBxdWVyeS5leGVjdXRlKCk7XG4gICAgICByZXN1bHRzLmZvckVhY2goY2FsbGJhY2spO1xuICAgICAgZmluaXNoZWQgPSByZXN1bHRzLmxlbmd0aCA8IHJlc3RPcHRpb25zLmxpbWl0O1xuICAgICAgaWYgKCFmaW5pc2hlZCkge1xuICAgICAgICByZXN0V2hlcmUub2JqZWN0SWQgPSBPYmplY3QuYXNzaWduKHt9LCByZXN0V2hlcmUub2JqZWN0SWQsIHtcbiAgICAgICAgICAkZ3Q6IHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXS5vYmplY3RJZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICApO1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5idWlsZFJlc3RXaGVyZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VEb250U2VsZWN0KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZU5vdEluUXVlcnkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VFcXVhbGl0eSgpO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5SZXN0UXVlcnkucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSB0aGlzLmZpbmRPcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gQ2hhbmdlcyB0aGUgY2xhc3NOYW1lIGlmIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IGlzIHNldC5cbi8vIFJldHVybnMgYSBwcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnJlZGlyZWN0S2V5KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV2UgbmVlZCB0byBjaGFuZ2UgdGhlIGNsYXNzIG5hbWUgYmFzZWQgb24gdGhlIHNjaGVtYVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkodGhpcy5jbGFzc05hbWUsIHRoaXMucmVkaXJlY3RLZXkpXG4gICAgLnRoZW4obmV3Q2xhc3NOYW1lID0+IHtcbiAgICAgIHRoaXMuY2xhc3NOYW1lID0gbmV3Q2xhc3NOYW1lO1xuICAgICAgdGhpcy5yZWRpcmVjdENsYXNzTmFtZSA9IG5ld0NsYXNzTmFtZTtcbiAgICB9KTtcbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gY29uZmlnLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChcbiAgICB0aGlzLmNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT09IGZhbHNlICYmXG4gICAgIXRoaXMuYXV0aC5pc01hc3RlciAmJlxuICAgIFNjaGVtYUNvbnRyb2xsZXIuc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKHRoaXMuY2xhc3NOYW1lKSA9PT0gLTFcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuaGFzQ2xhc3ModGhpcy5jbGFzc05hbWUpKVxuICAgICAgLnRoZW4oaGFzQ2xhc3MgPT4ge1xuICAgICAgICBpZiAoaGFzQ2xhc3MgIT09IHRydWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgJ1RoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBhY2Nlc3MgJyArICdub24tZXhpc3RlbnQgY2xhc3M6ICcgKyB0aGlzLmNsYXNzTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtSW5RdWVyeShpblF1ZXJ5T2JqZWN0LCBjbGFzc05hbWUsIHJlc3VsdHMpIHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgIHZhbHVlcy5wdXNoKHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogcmVzdWx0Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGRlbGV0ZSBpblF1ZXJ5T2JqZWN0WyckaW5RdWVyeSddO1xuICBpZiAoQXJyYXkuaXNBcnJheShpblF1ZXJ5T2JqZWN0WyckaW4nXSkpIHtcbiAgICBpblF1ZXJ5T2JqZWN0WyckaW4nXSA9IGluUXVlcnlPYmplY3RbJyRpbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIGluUXVlcnlPYmplY3RbJyRpbiddID0gdmFsdWVzO1xuICB9XG59XG5cbi8vIFJlcGxhY2VzIGEgJGluUXVlcnkgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhblxuLy8gJGluUXVlcnkgY2xhdXNlLlxuLy8gVGhlICRpblF1ZXJ5IGNsYXVzZSB0dXJucyBpbnRvIGFuICRpbiB3aXRoIHZhbHVlcyB0aGF0IGFyZSBqdXN0XG4vLyBwb2ludGVycyB0byB0aGUgb2JqZWN0cyByZXR1cm5lZCBpbiB0aGUgc3VicXVlcnkuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VJblF1ZXJ5ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgaW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGluUXVlcnknKTtcbiAgaWYgKCFpblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIGluUXVlcnlWYWx1ZSA9IGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmICghaW5RdWVyeVZhbHVlLndoZXJlIHx8ICFpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkaW5RdWVyeScpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgdmFyIHN1YnF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmF1dGgsXG4gICAgaW5RdWVyeVZhbHVlLmNsYXNzTmFtZSxcbiAgICBpblF1ZXJ5VmFsdWUud2hlcmUsXG4gICAgYWRkaXRpb25hbE9wdGlvbnNcbiAgKTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIHN1YnF1ZXJ5LmNsYXNzTmFtZSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gUmVjdXJzZSB0byByZXBlYXRcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICB9KTtcbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkobm90SW5RdWVyeU9iamVjdFsnJG5pbiddKSkge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkbm90SW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkbm90SW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJG5vdEluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYSAkbmluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZU5vdEluUXVlcnkgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBub3RJblF1ZXJ5T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckbm90SW5RdWVyeScpO1xuICBpZiAoIW5vdEluUXVlcnlPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgbm90SW5RdWVyeSB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gd2hlcmUgYW5kIGNsYXNzTmFtZVxuICB2YXIgbm90SW5RdWVyeVZhbHVlID0gbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKCFub3RJblF1ZXJ5VmFsdWUud2hlcmUgfHwgIW5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRub3RJblF1ZXJ5Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogbm90SW5RdWVyeVZhbHVlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBub3RJblF1ZXJ5VmFsdWUuY2xhc3NOYW1lLFxuICAgIG5vdEluUXVlcnlWYWx1ZS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgc3VicXVlcnkuY2xhc3NOYW1lLCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBSZWN1cnNlIHRvIHJlcGVhdFxuICAgIHJldHVybiB0aGlzLnJlcGxhY2VOb3RJblF1ZXJ5KCk7XG4gIH0pO1xufTtcblxuLy8gVXNlZCB0byBnZXQgdGhlIGRlZXBlc3Qgb2JqZWN0IGZyb20ganNvbiB1c2luZyBkb3Qgbm90YXRpb24uXG5jb25zdCBnZXREZWVwZXN0T2JqZWN0RnJvbUtleSA9IChqc29uLCBrZXksIGlkeCwgc3JjKSA9PiB7XG4gIGlmIChrZXkgaW4ganNvbikge1xuICAgIHJldHVybiBqc29uW2tleV07XG4gIH1cbiAgc3JjLnNwbGljZSgxKTsgLy8gRXhpdCBFYXJseVxufTtcblxuY29uc3QgdHJhbnNmb3JtU2VsZWN0ID0gKHNlbGVjdE9iamVjdCwga2V5LCBvYmplY3RzKSA9PiB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIG9iamVjdHMpIHtcbiAgICB2YWx1ZXMucHVzaChrZXkuc3BsaXQoJy4nKS5yZWR1Y2UoZ2V0RGVlcGVzdE9iamVjdEZyb21LZXksIHJlc3VsdCkpO1xuICB9XG4gIGRlbGV0ZSBzZWxlY3RPYmplY3RbJyRzZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoc2VsZWN0T2JqZWN0WyckaW4nXSkpIHtcbiAgICBzZWxlY3RPYmplY3RbJyRpbiddID0gc2VsZWN0T2JqZWN0WyckaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RPYmplY3RbJyRpbiddID0gdmFsdWVzO1xuICB9XG59O1xuXG4vLyBSZXBsYWNlcyBhICRzZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkc2VsZWN0IGNsYXVzZS5cbi8vIFRoZSAkc2VsZWN0IGNsYXVzZSB0dXJucyBpbnRvIGFuICRpbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlU2VsZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZWN0T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckc2VsZWN0Jyk7XG4gIGlmICghc2VsZWN0T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIHNlbGVjdCB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gcXVlcnkgYW5kIGtleVxuICB2YXIgc2VsZWN0VmFsdWUgPSBzZWxlY3RPYmplY3RbJyRzZWxlY3QnXTtcbiAgLy8gaU9TIFNESyBkb24ndCBzZW5kIHdoZXJlIGlmIG5vdCBzZXQsIGxldCBpdCBwYXNzXG4gIGlmIChcbiAgICAhc2VsZWN0VmFsdWUucXVlcnkgfHxcbiAgICAhc2VsZWN0VmFsdWUua2V5IHx8XG4gICAgdHlwZW9mIHNlbGVjdFZhbHVlLnF1ZXJ5ICE9PSAnb2JqZWN0JyB8fFxuICAgICFzZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUgfHxcbiAgICBPYmplY3Qua2V5cyhzZWxlY3RWYWx1ZSkubGVuZ3RoICE9PSAyXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJHNlbGVjdCcpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IHNlbGVjdFZhbHVlLnF1ZXJ5LnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBzZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUsXG4gICAgc2VsZWN0VmFsdWUucXVlcnkud2hlcmUsXG4gICAgYWRkaXRpb25hbE9wdGlvbnNcbiAgKTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1TZWxlY3Qoc2VsZWN0T2JqZWN0LCBzZWxlY3RWYWx1ZS5rZXksIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIEtlZXAgcmVwbGFjaW5nICRzZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb250U2VsZWN0ID0gKGRvbnRTZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoZG9udFNlbGVjdE9iamVjdFsnJG5pbiddKSkge1xuICAgIGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSA9IGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBkb250U2VsZWN0T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJGRvbnRTZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkZG9udFNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJGRvbnRTZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJG5pbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlRG9udFNlbGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGRvbnRTZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRkb250U2VsZWN0Jyk7XG4gIGlmICghZG9udFNlbGVjdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBkb250U2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBkb250U2VsZWN0VmFsdWUgPSBkb250U2VsZWN0T2JqZWN0WyckZG9udFNlbGVjdCddO1xuICBpZiAoXG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFkb250U2VsZWN0VmFsdWUua2V5IHx8XG4gICAgdHlwZW9mIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeSAhPT0gJ29iamVjdCcgfHxcbiAgICAhZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKGRvbnRTZWxlY3RWYWx1ZSkubGVuZ3RoICE9PSAyXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJGRvbnRTZWxlY3QnKTtcbiAgfVxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBkb250U2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybURvbnRTZWxlY3QoZG9udFNlbGVjdE9iamVjdCwgZG9udFNlbGVjdFZhbHVlLmtleSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gS2VlcCByZXBsYWNpbmcgJGRvbnRTZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VEb250U2VsZWN0KCk7XG4gIH0pO1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5jbGVhblJlc3VsdEF1dGhEYXRhID0gZnVuY3Rpb24gKHJlc3VsdCkge1xuICBkZWxldGUgcmVzdWx0LnBhc3N3b3JkO1xuICBpZiAocmVzdWx0LmF1dGhEYXRhKSB7XG4gICAgT2JqZWN0LmtleXMocmVzdWx0LmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgIGlmIChyZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKE9iamVjdC5rZXlzKHJlc3VsdC5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGE7XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCByZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50ID0gY29uc3RyYWludCA9PiB7XG4gIGlmICh0eXBlb2YgY29uc3RyYWludCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gY29uc3RyYWludDtcbiAgfVxuICBjb25zdCBlcXVhbFRvT2JqZWN0ID0ge307XG4gIGxldCBoYXNEaXJlY3RDb25zdHJhaW50ID0gZmFsc2U7XG4gIGxldCBoYXNPcGVyYXRvckNvbnN0cmFpbnQgPSBmYWxzZTtcbiAgZm9yIChjb25zdCBrZXkgaW4gY29uc3RyYWludCkge1xuICAgIGlmIChrZXkuaW5kZXhPZignJCcpICE9PSAwKSB7XG4gICAgICBoYXNEaXJlY3RDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICAgIGVxdWFsVG9PYmplY3Rba2V5XSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICB9IGVsc2Uge1xuICAgICAgaGFzT3BlcmF0b3JDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgaWYgKGhhc0RpcmVjdENvbnN0cmFpbnQgJiYgaGFzT3BlcmF0b3JDb25zdHJhaW50KSB7XG4gICAgY29uc3RyYWludFsnJGVxJ10gPSBlcXVhbFRvT2JqZWN0O1xuICAgIE9iamVjdC5rZXlzKGVxdWFsVG9PYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50W2tleV07XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGNvbnN0cmFpbnQ7XG59O1xuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VFcXVhbGl0eSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHR5cGVvZiB0aGlzLnJlc3RXaGVyZSAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gdGhpcy5yZXN0V2hlcmUpIHtcbiAgICB0aGlzLnJlc3RXaGVyZVtrZXldID0gcmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCh0aGlzLnJlc3RXaGVyZVtrZXldKTtcbiAgfVxufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZXRoZXIgaXQgd2FzIHN1Y2Nlc3NmdWwuXG4vLyBQb3B1bGF0ZXMgdGhpcy5yZXNwb25zZSB3aXRoIGFuIG9iamVjdCB0aGF0IG9ubHkgaGFzICdyZXN1bHRzJy5cblJlc3RRdWVyeS5wcm90b3R5cGUucnVuRmluZCA9IGZ1bmN0aW9uIChvcHRpb25zID0ge30pIHtcbiAgaWYgKHRoaXMuZmluZE9wdGlvbnMubGltaXQgPT09IDApIHtcbiAgICB0aGlzLnJlc3BvbnNlID0geyByZXN1bHRzOiBbXSB9O1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICBjb25zdCBmaW5kT3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuZmluZE9wdGlvbnMpO1xuICBpZiAodGhpcy5rZXlzKSB7XG4gICAgZmluZE9wdGlvbnMua2V5cyA9IHRoaXMua2V5cy5tYXAoa2V5ID0+IHtcbiAgICAgIHJldHVybiBrZXkuc3BsaXQoJy4nKVswXTtcbiAgICB9KTtcbiAgfVxuICBpZiAob3B0aW9ucy5vcCkge1xuICAgIGZpbmRPcHRpb25zLm9wID0gb3B0aW9ucy5vcDtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZCh0aGlzLmNsYXNzTmFtZSwgdGhpcy5yZXN0V2hlcmUsIGZpbmRPcHRpb25zLCB0aGlzLmF1dGgpXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiYgIWZpbmRPcHRpb25zLmV4cGxhaW4pIHtcbiAgICAgICAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICAgICAgICB0aGlzLmNsZWFuUmVzdWx0QXV0aERhdGEocmVzdWx0LCB0aGlzLmF1dGgsIHRoaXMuY29uZmlnKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgcmVzdWx0cyk7XG5cbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIGZvciAodmFyIHIgb2YgcmVzdWx0cykge1xuICAgICAgICAgIHIuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5yZXNwb25zZSA9IHsgcmVzdWx0czogcmVzdWx0cyB9O1xuICAgIH0pO1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZXRoZXIgaXQgd2FzIHN1Y2Nlc3NmdWwuXG4vLyBQb3B1bGF0ZXMgdGhpcy5yZXNwb25zZS5jb3VudCB3aXRoIHRoZSBjb3VudFxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5Db3VudCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmRvQ291bnQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5maW5kT3B0aW9ucy5jb3VudCA9IHRydWU7XG4gIGRlbGV0ZSB0aGlzLmZpbmRPcHRpb25zLnNraXA7XG4gIGRlbGV0ZSB0aGlzLmZpbmRPcHRpb25zLmxpbWl0O1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZCh0aGlzLmNsYXNzTmFtZSwgdGhpcy5yZXN0V2hlcmUsIHRoaXMuZmluZE9wdGlvbnMpLnRoZW4oYyA9PiB7XG4gICAgdGhpcy5yZXNwb25zZS5jb3VudCA9IGM7XG4gIH0pO1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5kZW55UHJvdGVjdGVkRmllbGRzID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHNjaGVtYUNvbnRyb2xsZXIgPSBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCk7XG4gIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9XG4gICAgdGhpcy5jb25maWcuZGF0YWJhc2UuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdGhpcy5yZXN0V2hlcmUsXG4gICAgICB0aGlzLmZpbmRPcHRpb25zLmFjbCxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHRoaXMuZmluZE9wdGlvbnNcbiAgICApIHx8IFtdO1xuICBmb3IgKGNvbnN0IGtleSBvZiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICBpZiAodGhpcy5yZXN0V2hlcmVba2V5XSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIHF1ZXJ5ICR7a2V5fSBvbiBjbGFzcyAke3RoaXMuY2xhc3NOYW1lfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG59O1xuXG4vLyBBdWdtZW50cyB0aGlzLnJlc3BvbnNlIHdpdGggYWxsIHBvaW50ZXJzIG9uIGFuIG9iamVjdFxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlQWxsID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuaW5jbHVkZUFsbCkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGluY2x1ZGVGaWVsZHMgPSBbXTtcbiAgICAgIGNvbnN0IGtleUZpZWxkcyA9IFtdO1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzY2hlbWEuZmllbGRzKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHx8XG4gICAgICAgICAgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0FycmF5JylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaW5jbHVkZUZpZWxkcy5wdXNoKFtmaWVsZF0pO1xuICAgICAgICAgIGtleUZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gQWRkIGZpZWxkcyB0byBpbmNsdWRlLCBrZXlzLCByZW1vdmUgZHVwc1xuICAgICAgdGhpcy5pbmNsdWRlID0gWy4uLm5ldyBTZXQoWy4uLnRoaXMuaW5jbHVkZSwgLi4uaW5jbHVkZUZpZWxkc10pXTtcbiAgICAgIC8vIGlmIHRoaXMua2V5cyBub3Qgc2V0LCB0aGVuIGFsbCBrZXlzIGFyZSBhbHJlYWR5IGluY2x1ZGVkXG4gICAgICBpZiAodGhpcy5rZXlzKSB7XG4gICAgICAgIHRoaXMua2V5cyA9IFsuLi5uZXcgU2V0KFsuLi50aGlzLmtleXMsIC4uLmtleUZpZWxkc10pXTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cbi8vIFVwZGF0ZXMgcHJvcGVydHkgYHRoaXMua2V5c2AgdG8gY29udGFpbiBhbGwga2V5cyBidXQgdGhlIG9uZXMgdW5zZWxlY3RlZC5cblJlc3RRdWVyeS5wcm90b3R5cGUuaGFuZGxlRXhjbHVkZUtleXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5leGNsdWRlS2V5cykge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGhpcy5rZXlzKSB7XG4gICAgdGhpcy5rZXlzID0gdGhpcy5rZXlzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmxvYWRTY2hlbWEoKVxuICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEodGhpcy5jbGFzc05hbWUpKVxuICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKTtcbiAgICAgIHRoaXMua2V5cyA9IGZpZWxkcy5maWx0ZXIoayA9PiAhdGhpcy5leGNsdWRlS2V5cy5pbmNsdWRlcyhrKSk7XG4gICAgfSk7XG59O1xuXG4vLyBBdWdtZW50cyB0aGlzLnJlc3BvbnNlIHdpdGggZGF0YSBhdCB0aGUgcGF0aHMgcHJvdmlkZWQgaW4gdGhpcy5pbmNsdWRlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pbmNsdWRlLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHBhdGhSZXNwb25zZSA9IGluY2x1ZGVQYXRoKFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICB0aGlzLnJlc3BvbnNlLFxuICAgIHRoaXMuaW5jbHVkZVswXSxcbiAgICB0aGlzLnJlc3RPcHRpb25zXG4gICk7XG4gIGlmIChwYXRoUmVzcG9uc2UudGhlbikge1xuICAgIHJldHVybiBwYXRoUmVzcG9uc2UudGhlbihuZXdSZXNwb25zZSA9PiB7XG4gICAgICB0aGlzLnJlc3BvbnNlID0gbmV3UmVzcG9uc2U7XG4gICAgICB0aGlzLmluY2x1ZGUgPSB0aGlzLmluY2x1ZGUuc2xpY2UoMSk7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gICAgfSk7XG4gIH0gZWxzZSBpZiAodGhpcy5pbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICB0aGlzLmluY2x1ZGUgPSB0aGlzLmluY2x1ZGUuc2xpY2UoMSk7XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZSgpO1xuICB9XG5cbiAgcmV0dXJuIHBhdGhSZXNwb25zZTtcbn07XG5cbi8vUmV0dXJucyBhIHByb21pc2Ugb2YgYSBwcm9jZXNzZWQgc2V0IG9mIHJlc3VsdHNcblJlc3RRdWVyeS5wcm90b3R5cGUucnVuQWZ0ZXJGaW5kVHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghdGhpcy5ydW5BZnRlckZpbmQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYWZ0ZXJGaW5kJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBjb25zdCBoYXNBZnRlckZpbmRIb29rID0gdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyhcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckZpbmQsXG4gICAgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZFxuICApO1xuICBpZiAoIWhhc0FmdGVyRmluZEhvb2spIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gU2tpcCBBZ2dyZWdhdGUgYW5kIERpc3RpbmN0IFF1ZXJpZXNcbiAgaWYgKHRoaXMuZmluZE9wdGlvbnMucGlwZWxpbmUgfHwgdGhpcy5maW5kT3B0aW9ucy5kaXN0aW5jdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNvbnN0IGpzb24gPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLnJlc3RPcHRpb25zKTtcbiAganNvbi53aGVyZSA9IHRoaXMucmVzdFdoZXJlO1xuICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KHRoaXMuY2xhc3NOYW1lKTtcbiAgcGFyc2VRdWVyeS53aXRoSlNPTihqc29uKTtcbiAgLy8gUnVuIGFmdGVyRmluZCB0cmlnZ2VyIGFuZCBzZXQgdGhlIG5ldyByZXN1bHRzXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckZpbmQsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyxcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgcGFyc2VRdWVyeSxcbiAgICAgIHRoaXMuY29udGV4dFxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIC8vIEVuc3VyZSB3ZSBwcm9wZXJseSBzZXQgdGhlIGNsYXNzTmFtZSBiYWNrXG4gICAgICBpZiAodGhpcy5yZWRpcmVjdENsYXNzTmFtZSkge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMgPSByZXN1bHRzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIGlmIChvYmplY3QgaW5zdGFuY2VvZiBQYXJzZS5PYmplY3QpIHtcbiAgICAgICAgICAgIG9iamVjdCA9IG9iamVjdC50b0pTT04oKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0LmNsYXNzTmFtZSA9IHRoaXMucmVkaXJlY3RDbGFzc05hbWU7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMgPSByZXN1bHRzO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gQWRkcyBpbmNsdWRlZCB2YWx1ZXMgdG8gdGhlIHJlc3BvbnNlLlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGQgbmFtZXMuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gYXVnbWVudGVkIHJlc3BvbnNlLlxuZnVuY3Rpb24gaW5jbHVkZVBhdGgoY29uZmlnLCBhdXRoLCByZXNwb25zZSwgcGF0aCwgcmVzdE9wdGlvbnMgPSB7fSkge1xuICB2YXIgcG9pbnRlcnMgPSBmaW5kUG9pbnRlcnMocmVzcG9uc2UucmVzdWx0cywgcGF0aCk7XG4gIGlmIChwb2ludGVycy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuICBjb25zdCBwb2ludGVyc0hhc2ggPSB7fTtcbiAgZm9yICh2YXIgcG9pbnRlciBvZiBwb2ludGVycykge1xuICAgIGlmICghcG9pbnRlcikge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHBvaW50ZXIuY2xhc3NOYW1lO1xuICAgIC8vIG9ubHkgaW5jbHVkZSB0aGUgZ29vZCBwb2ludGVyc1xuICAgIGlmIChjbGFzc05hbWUpIHtcbiAgICAgIHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdID0gcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0gfHwgbmV3IFNldCgpO1xuICAgICAgcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0uYWRkKHBvaW50ZXIub2JqZWN0SWQpO1xuICAgIH1cbiAgfVxuICBjb25zdCBpbmNsdWRlUmVzdE9wdGlvbnMgPSB7fTtcbiAgaWYgKHJlc3RPcHRpb25zLmtleXMpIHtcbiAgICBjb25zdCBrZXlzID0gbmV3IFNldChyZXN0T3B0aW9ucy5rZXlzLnNwbGl0KCcsJykpO1xuICAgIGNvbnN0IGtleVNldCA9IEFycmF5LmZyb20oa2V5cykucmVkdWNlKChzZXQsIGtleSkgPT4ge1xuICAgICAgY29uc3Qga2V5UGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChpOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocGF0aFtpXSAhPSBrZXlQYXRoW2ldKSB7XG4gICAgICAgICAgcmV0dXJuIHNldDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGkgPCBrZXlQYXRoLmxlbmd0aCkge1xuICAgICAgICBzZXQuYWRkKGtleVBhdGhbaV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNldDtcbiAgICB9LCBuZXcgU2V0KCkpO1xuICAgIGlmIChrZXlTZXQuc2l6ZSA+IDApIHtcbiAgICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5rZXlzID0gQXJyYXkuZnJvbShrZXlTZXQpLmpvaW4oJywnKTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVzdE9wdGlvbnMuZXhjbHVkZUtleXMpIHtcbiAgICBjb25zdCBleGNsdWRlS2V5cyA9IG5ldyBTZXQocmVzdE9wdGlvbnMuZXhjbHVkZUtleXMuc3BsaXQoJywnKSk7XG4gICAgY29uc3QgZXhjbHVkZUtleVNldCA9IEFycmF5LmZyb20oZXhjbHVkZUtleXMpLnJlZHVjZSgoc2V0LCBrZXkpID0+IHtcbiAgICAgIGNvbnN0IGtleVBhdGggPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgIGxldCBpID0gMDtcbiAgICAgIGZvciAoaTsgaSA8IHBhdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHBhdGhbaV0gIT0ga2V5UGF0aFtpXSkge1xuICAgICAgICAgIHJldHVybiBzZXQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChpID09IGtleVBhdGgubGVuZ3RoIC0gMSkge1xuICAgICAgICBzZXQuYWRkKGtleVBhdGhbaV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNldDtcbiAgICB9LCBuZXcgU2V0KCkpO1xuICAgIGlmIChleGNsdWRlS2V5U2V0LnNpemUgPiAwKSB7XG4gICAgICBpbmNsdWRlUmVzdE9wdGlvbnMuZXhjbHVkZUtleXMgPSBBcnJheS5mcm9tKGV4Y2x1ZGVLZXlTZXQpLmpvaW4oJywnKTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAocmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIGNvbnN0IHF1ZXJ5UHJvbWlzZXMgPSBPYmplY3Qua2V5cyhwb2ludGVyc0hhc2gpLm1hcChjbGFzc05hbWUgPT4ge1xuICAgIGNvbnN0IG9iamVjdElkcyA9IEFycmF5LmZyb20ocG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0pO1xuICAgIGxldCB3aGVyZTtcbiAgICBpZiAob2JqZWN0SWRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiBvYmplY3RJZHNbMF0gfTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiB7ICRpbjogb2JqZWN0SWRzIH0gfTtcbiAgICB9XG4gICAgdmFyIHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgd2hlcmUsIGluY2x1ZGVSZXN0T3B0aW9ucyk7XG4gICAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoeyBvcDogJ2dldCcgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHRzKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gR2V0IHRoZSBvYmplY3RzIGZvciBhbGwgdGhlc2Ugb2JqZWN0IGlkc1xuICByZXR1cm4gUHJvbWlzZS5hbGwocXVlcnlQcm9taXNlcykudGhlbihyZXNwb25zZXMgPT4ge1xuICAgIHZhciByZXBsYWNlID0gcmVzcG9uc2VzLnJlZHVjZSgocmVwbGFjZSwgaW5jbHVkZVJlc3BvbnNlKSA9PiB7XG4gICAgICBmb3IgKHZhciBvYmogb2YgaW5jbHVkZVJlc3BvbnNlLnJlc3VsdHMpIHtcbiAgICAgICAgb2JqLl9fdHlwZSA9ICdPYmplY3QnO1xuICAgICAgICBvYmouY2xhc3NOYW1lID0gaW5jbHVkZVJlc3BvbnNlLmNsYXNzTmFtZTtcblxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSA9PSAnX1VzZXInICYmICFhdXRoLmlzTWFzdGVyKSB7XG4gICAgICAgICAgZGVsZXRlIG9iai5zZXNzaW9uVG9rZW47XG4gICAgICAgICAgZGVsZXRlIG9iai5hdXRoRGF0YTtcbiAgICAgICAgfVxuICAgICAgICByZXBsYWNlW29iai5vYmplY3RJZF0gPSBvYmo7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVwbGFjZTtcbiAgICB9LCB7fSk7XG5cbiAgICB2YXIgcmVzcCA9IHtcbiAgICAgIHJlc3VsdHM6IHJlcGxhY2VQb2ludGVycyhyZXNwb25zZS5yZXN1bHRzLCBwYXRoLCByZXBsYWNlKSxcbiAgICB9O1xuICAgIGlmIChyZXNwb25zZS5jb3VudCkge1xuICAgICAgcmVzcC5jb3VudCA9IHJlc3BvbnNlLmNvdW50O1xuICAgIH1cbiAgICByZXR1cm4gcmVzcDtcbiAgfSk7XG59XG5cbi8vIE9iamVjdCBtYXkgYmUgYSBsaXN0IG9mIFJFU1QtZm9ybWF0IG9iamVjdCB0byBmaW5kIHBvaW50ZXJzIGluLCBvclxuLy8gaXQgbWF5IGJlIGEgc2luZ2xlIG9iamVjdC5cbi8vIElmIHRoZSBwYXRoIHlpZWxkcyB0aGluZ3MgdGhhdCBhcmVuJ3QgcG9pbnRlcnMsIHRoaXMgdGhyb3dzIGFuIGVycm9yLlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGRzIHRvIHNlYXJjaCBpbnRvLlxuLy8gUmV0dXJucyBhIGxpc3Qgb2YgcG9pbnRlcnMgaW4gUkVTVCBmb3JtYXQuXG5mdW5jdGlvbiBmaW5kUG9pbnRlcnMob2JqZWN0LCBwYXRoKSB7XG4gIGlmIChvYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhciBhbnN3ZXIgPSBbXTtcbiAgICBmb3IgKHZhciB4IG9mIG9iamVjdCkge1xuICAgICAgYW5zd2VyID0gYW5zd2VyLmNvbmNhdChmaW5kUG9pbnRlcnMoeCwgcGF0aCkpO1xuICAgIH1cbiAgICByZXR1cm4gYW5zd2VyO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8ICFvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT0gMCkge1xuICAgIGlmIChvYmplY3QgPT09IG51bGwgfHwgb2JqZWN0Ll9fdHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICAgIHJldHVybiBbb2JqZWN0XTtcbiAgICB9XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgcmV0dXJuIGZpbmRQb2ludGVycyhzdWJvYmplY3QsIHBhdGguc2xpY2UoMSkpO1xufVxuXG4vLyBPYmplY3QgbWF5IGJlIGEgbGlzdCBvZiBSRVNULWZvcm1hdCBvYmplY3RzIHRvIHJlcGxhY2UgcG9pbnRlcnNcbi8vIGluLCBvciBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGRzIHRvIHNlYXJjaCBpbnRvLlxuLy8gcmVwbGFjZSBpcyBhIG1hcCBmcm9tIG9iamVjdCBpZCAtPiBvYmplY3QuXG4vLyBSZXR1cm5zIHNvbWV0aGluZyBhbmFsb2dvdXMgdG8gb2JqZWN0LCBidXQgd2l0aCB0aGUgYXBwcm9wcmlhdGVcbi8vIHBvaW50ZXJzIGluZmxhdGVkLlxuZnVuY3Rpb24gcmVwbGFjZVBvaW50ZXJzKG9iamVjdCwgcGF0aCwgcmVwbGFjZSkge1xuICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gb2JqZWN0XG4gICAgICAubWFwKG9iaiA9PiByZXBsYWNlUG9pbnRlcnMob2JqLCBwYXRoLCByZXBsYWNlKSlcbiAgICAgIC5maWx0ZXIob2JqID0+IHR5cGVvZiBvYmogIT09ICd1bmRlZmluZWQnKTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChvYmplY3QgJiYgb2JqZWN0Ll9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gcmVwbGFjZVtvYmplY3Qub2JqZWN0SWRdO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIHZhciBuZXdzdWIgPSByZXBsYWNlUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpLCByZXBsYWNlKTtcbiAgdmFyIGFuc3dlciA9IHt9O1xuICBmb3IgKHZhciBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKGtleSA9PSBwYXRoWzBdKSB7XG4gICAgICBhbnN3ZXJba2V5XSA9IG5ld3N1YjtcbiAgICB9IGVsc2Uge1xuICAgICAgYW5zd2VyW2tleV0gPSBvYmplY3Rba2V5XTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFuc3dlcjtcbn1cblxuLy8gRmluZHMgYSBzdWJvYmplY3QgdGhhdCBoYXMgdGhlIGdpdmVuIGtleSwgaWYgdGhlcmUgaXMgb25lLlxuLy8gUmV0dXJucyB1bmRlZmluZWQgb3RoZXJ3aXNlLlxuZnVuY3Rpb24gZmluZE9iamVjdFdpdGhLZXkocm9vdCwga2V5KSB7XG4gIGlmICh0eXBlb2Ygcm9vdCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHJvb3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIGZvciAodmFyIGl0ZW0gb2Ygcm9vdCkge1xuICAgICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkoaXRlbSwga2V5KTtcbiAgICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKHJvb3QgJiYgcm9vdFtrZXldKSB7XG4gICAgcmV0dXJuIHJvb3Q7XG4gIH1cbiAgZm9yICh2YXIgc3Via2V5IGluIHJvb3QpIHtcbiAgICBjb25zdCBhbnN3ZXIgPSBmaW5kT2JqZWN0V2l0aEtleShyb290W3N1YmtleV0sIGtleSk7XG4gICAgaWYgKGFuc3dlcikge1xuICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSZXN0UXVlcnk7XG4iXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTs7QUFFQSxJQUFJQSxnQkFBZ0IsR0FBR0MsT0FBTyxDQUFDLGdDQUFnQyxDQUFDO0FBQ2hFLElBQUlDLEtBQUssR0FBR0QsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDQyxLQUFLO0FBQ3ZDLE1BQU1DLFFBQVEsR0FBR0YsT0FBTyxDQUFDLFlBQVksQ0FBQztBQUN0QyxNQUFNO0VBQUVHO0FBQWMsQ0FBQyxHQUFHSCxPQUFPLENBQUMsNkJBQTZCLENBQUM7QUFDaEUsTUFBTUksa0JBQWtCLEdBQUcsQ0FBQyxVQUFVLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxLQUFLLENBQUM7QUFDeEU7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBU0MsU0FBU0EsQ0FDaEJDLE1BQU0sRUFDTkMsSUFBSSxFQUNKQyxTQUFTLEVBQ1RDLFNBQVMsR0FBRyxDQUFDLENBQUMsRUFDZEMsV0FBVyxHQUFHLENBQUMsQ0FBQyxFQUNoQkMsU0FBUyxFQUNUQyxZQUFZLEdBQUcsSUFBSSxFQUNuQkMsT0FBTyxFQUNQO0VBQ0EsSUFBSSxDQUFDUCxNQUFNLEdBQUdBLE1BQU07RUFDcEIsSUFBSSxDQUFDQyxJQUFJLEdBQUdBLElBQUk7RUFDaEIsSUFBSSxDQUFDQyxTQUFTLEdBQUdBLFNBQVM7RUFDMUIsSUFBSSxDQUFDQyxTQUFTLEdBQUdBLFNBQVM7RUFDMUIsSUFBSSxDQUFD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