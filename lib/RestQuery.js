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
    return this.handleAuthAdapters();
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
RestQuery.prototype.handleAuthAdapters = async function () {
  if (this.className !== '_User' || this.findOptions.explain) {
    return;
  }
  await Promise.all(this.response.results.map(result => this.config.authDataManager.runAfterFind({
    config: this.config,
    auth: this.auth
  }, result.authData)));
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsIlBhcnNlIiwidHJpZ2dlcnMiLCJjb250aW51ZVdoaWxlIiwiQWx3YXlzU2VsZWN0ZWRLZXlzIiwiUmVzdFF1ZXJ5IiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsInJlc3RXaGVyZSIsInJlc3RPcHRpb25zIiwiY2xpZW50U0RLIiwicnVuQWZ0ZXJGaW5kIiwiY29udGV4dCIsInJlc3BvbnNlIiwiZmluZE9wdGlvbnMiLCJpc01hc3RlciIsInVzZXIiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIiRhbmQiLCJfX3R5cGUiLCJvYmplY3RJZCIsImlkIiwiZG9Db3VudCIsImluY2x1ZGVBbGwiLCJpbmNsdWRlIiwia2V5c0ZvckluY2x1ZGUiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJrZXlzIiwiZXhjbHVkZUtleXMiLCJsZW5ndGgiLCJzcGxpdCIsImZpbHRlciIsImtleSIsIm1hcCIsInNsaWNlIiwibGFzdEluZGV4T2YiLCJqb2luIiwib3B0aW9uIiwiY29uY2F0IiwiQXJyYXkiLCJmcm9tIiwiU2V0IiwiZXhjbHVkZSIsImsiLCJpbmRleE9mIiwiZmllbGRzIiwib3JkZXIiLCJzb3J0IiwicmVkdWNlIiwic29ydE1hcCIsImZpZWxkIiwidHJpbSIsInNjb3JlIiwiJG1ldGEiLCJwYXRocyIsImluY2x1ZGVzIiwicGF0aFNldCIsIm1lbW8iLCJwYXRoIiwiaW5kZXgiLCJwYXJ0cyIsInMiLCJhIiwiYiIsInJlZGlyZWN0S2V5IiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJyZWRpcmVjdENsYXNzTmFtZSIsIklOVkFMSURfSlNPTiIsImV4ZWN1dGUiLCJleGVjdXRlT3B0aW9ucyIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImJ1aWxkUmVzdFdoZXJlIiwiZGVueVByb3RlY3RlZEZpZWxkcyIsImhhbmRsZUluY2x1ZGVBbGwiLCJoYW5kbGVFeGNsdWRlS2V5cyIsInJ1bkZpbmQiLCJydW5Db3VudCIsImhhbmRsZUluY2x1ZGUiLCJydW5BZnRlckZpbmRUcmlnZ2VyIiwiaGFuZGxlQXV0aEFkYXB0ZXJzIiwiZWFjaCIsImNhbGxiYWNrIiwibGltaXQiLCJmaW5pc2hlZCIsInF1ZXJ5IiwicmVzdWx0cyIsImZvckVhY2giLCJhc3NpZ24iLCIkZ3QiLCJnZXRVc2VyQW5kUm9sZUFDTCIsInZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiIsInJlcGxhY2VTZWxlY3QiLCJyZXBsYWNlRG9udFNlbGVjdCIsInJlcGxhY2VJblF1ZXJ5IiwicmVwbGFjZU5vdEluUXVlcnkiLCJyZXBsYWNlRXF1YWxpdHkiLCJhY2wiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsImRhdGFiYXNlIiwibmV3Q2xhc3NOYW1lIiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImxvYWRTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwiaGFzQ2xhc3MiLCJPUEVSQVRJT05fRk9SQklEREVOIiwidHJhbnNmb3JtSW5RdWVyeSIsImluUXVlcnlPYmplY3QiLCJ2YWx1ZXMiLCJyZXN1bHQiLCJwdXNoIiwiaXNBcnJheSIsImZpbmRPYmplY3RXaXRoS2V5IiwiaW5RdWVyeVZhbHVlIiwid2hlcmUiLCJJTlZBTElEX1FVRVJZIiwiYWRkaXRpb25hbE9wdGlvbnMiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwicmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeSIsInRyYW5zZm9ybU5vdEluUXVlcnkiLCJub3RJblF1ZXJ5T2JqZWN0Iiwibm90SW5RdWVyeVZhbHVlIiwiZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkiLCJqc29uIiwiaWR4Iiwic3JjIiwic3BsaWNlIiwidHJhbnNmb3JtU2VsZWN0Iiwic2VsZWN0T2JqZWN0Iiwib2JqZWN0cyIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImZpbmQiLCJleHBsYWluIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsInIiLCJjb3VudCIsInNraXAiLCJjIiwicHJvdGVjdGVkRmllbGRzIiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiZ2V0T25lU2NoZW1hIiwic2NoZW1hIiwiaW5jbHVkZUZpZWxkcyIsImtleUZpZWxkcyIsInR5cGUiLCJwYXRoUmVzcG9uc2UiLCJpbmNsdWRlUGF0aCIsIm5ld1Jlc3BvbnNlIiwiaGFzQWZ0ZXJGaW5kSG9vayIsInRyaWdnZXJFeGlzdHMiLCJUeXBlcyIsImFmdGVyRmluZCIsImFwcGxpY2F0aW9uSWQiLCJwaXBlbGluZSIsImRpc3RpbmN0IiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJhbGwiLCJhdXRoRGF0YU1hbmFnZXIiLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwiaSIsInNpemUiLCJleGNsdWRlS2V5U2V0IiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwicXVlcnlQcm9taXNlcyIsIm9iamVjdElkcyIsIiRpbiIsInJlc3BvbnNlcyIsInJlcGxhY2UiLCJpbmNsdWRlUmVzcG9uc2UiLCJvYmoiLCJzZXNzaW9uVG9rZW4iLCJyZXNwIiwicmVwbGFjZVBvaW50ZXJzIiwiYW5zd2VyIiwieCIsInN1Ym9iamVjdCIsIm5ld3N1YiIsInJvb3QiLCJpdGVtIiwic3Via2V5IiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0UXVlcnkuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQW4gb2JqZWN0IHRoYXQgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYSAnZmluZCdcbi8vIG9wZXJhdGlvbiwgZW5jb2RlZCBpbiB0aGUgUkVTVCBBUEkgZm9ybWF0LlxuXG52YXIgU2NoZW1hQ29udHJvbGxlciA9IHJlcXVpcmUoJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcicpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuY29uc3QgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG5jb25zdCB7IGNvbnRpbnVlV2hpbGUgfSA9IHJlcXVpcmUoJ3BhcnNlL2xpYi9ub2RlL3Byb21pc2VVdGlscycpO1xuY29uc3QgQWx3YXlzU2VsZWN0ZWRLZXlzID0gWydvYmplY3RJZCcsICdjcmVhdGVkQXQnLCAndXBkYXRlZEF0JywgJ0FDTCddO1xuLy8gcmVzdE9wdGlvbnMgY2FuIGluY2x1ZGU6XG4vLyAgIHNraXBcbi8vICAgbGltaXRcbi8vICAgb3JkZXJcbi8vICAgY291bnRcbi8vICAgaW5jbHVkZVxuLy8gICBrZXlzXG4vLyAgIGV4Y2x1ZGVLZXlzXG4vLyAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5XG4vLyAgIHJlYWRQcmVmZXJlbmNlXG4vLyAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZVxuLy8gICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlXG5mdW5jdGlvbiBSZXN0UXVlcnkoXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgY2xhc3NOYW1lLFxuICByZXN0V2hlcmUgPSB7fSxcbiAgcmVzdE9wdGlvbnMgPSB7fSxcbiAgY2xpZW50U0RLLFxuICBydW5BZnRlckZpbmQgPSB0cnVlLFxuICBjb250ZXh0XG4pIHtcbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuYXV0aCA9IGF1dGg7XG4gIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB0aGlzLnJlc3RXaGVyZSA9IHJlc3RXaGVyZTtcbiAgdGhpcy5yZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zO1xuICB0aGlzLmNsaWVudFNESyA9IGNsaWVudFNESztcbiAgdGhpcy5ydW5BZnRlckZpbmQgPSBydW5BZnRlckZpbmQ7XG4gIHRoaXMucmVzcG9uc2UgPSBudWxsO1xuICB0aGlzLmZpbmRPcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IGNvbnRleHQgfHwge307XG4gIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09ICdfU2Vzc2lvbicpIHtcbiAgICAgIGlmICghdGhpcy5hdXRoLnVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgICAgfVxuICAgICAgdGhpcy5yZXN0V2hlcmUgPSB7XG4gICAgICAgICRhbmQ6IFtcbiAgICAgICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgdGhpcy5kb0NvdW50ID0gZmFsc2U7XG4gIHRoaXMuaW5jbHVkZUFsbCA9IGZhbHNlO1xuXG4gIC8vIFRoZSBmb3JtYXQgZm9yIHRoaXMuaW5jbHVkZSBpcyBub3QgdGhlIHNhbWUgYXMgdGhlIGZvcm1hdCBmb3IgdGhlXG4gIC8vIGluY2x1ZGUgb3B0aW9uIC0gaXQncyB0aGUgcGF0aHMgd2Ugc2hvdWxkIGluY2x1ZGUsIGluIG9yZGVyLFxuICAvLyBzdG9yZWQgYXMgYXJyYXlzLCB0YWtpbmcgaW50byBhY2NvdW50IHRoYXQgd2UgbmVlZCB0byBpbmNsdWRlIGZvb1xuICAvLyBiZWZvcmUgaW5jbHVkaW5nIGZvby5iYXIuIEFsc28gaXQgc2hvdWxkIGRlZHVwZS5cbiAgLy8gRm9yIGV4YW1wbGUsIHBhc3NpbmcgYW4gYXJnIG9mIGluY2x1ZGU9Zm9vLmJhcixmb28uYmF6IGNvdWxkIGxlYWQgdG9cbiAgLy8gdGhpcy5pbmNsdWRlID0gW1snZm9vJ10sIFsnZm9vJywgJ2JheiddLCBbJ2ZvbycsICdiYXInXV1cbiAgdGhpcy5pbmNsdWRlID0gW107XG4gIGxldCBrZXlzRm9ySW5jbHVkZSA9ICcnO1xuXG4gIC8vIElmIHdlIGhhdmUga2V5cywgd2UgcHJvYmFibHkgd2FudCB0byBmb3JjZSBzb21lIGluY2x1ZGVzIChuLTEgbGV2ZWwpXG4gIC8vIFNlZSBpc3N1ZTogaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzMxODVcbiAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN0T3B0aW9ucywgJ2tleXMnKSkge1xuICAgIGtleXNGb3JJbmNsdWRlID0gcmVzdE9wdGlvbnMua2V5cztcbiAgfVxuXG4gIC8vIElmIHdlIGhhdmUga2V5cywgd2UgcHJvYmFibHkgd2FudCB0byBmb3JjZSBzb21lIGluY2x1ZGVzIChuLTEgbGV2ZWwpXG4gIC8vIGluIG9yZGVyIHRvIGV4Y2x1ZGUgc3BlY2lmaWMga2V5cy5cbiAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN0T3B0aW9ucywgJ2V4Y2x1ZGVLZXlzJykpIHtcbiAgICBrZXlzRm9ySW5jbHVkZSArPSAnLCcgKyByZXN0T3B0aW9ucy5leGNsdWRlS2V5cztcbiAgfVxuXG4gIGlmIChrZXlzRm9ySW5jbHVkZS5sZW5ndGggPiAwKSB7XG4gICAga2V5c0ZvckluY2x1ZGUgPSBrZXlzRm9ySW5jbHVkZVxuICAgICAgLnNwbGl0KCcsJylcbiAgICAgIC5maWx0ZXIoa2V5ID0+IHtcbiAgICAgICAgLy8gQXQgbGVhc3QgMiBjb21wb25lbnRzXG4gICAgICAgIHJldHVybiBrZXkuc3BsaXQoJy4nKS5sZW5ndGggPiAxO1xuICAgICAgfSlcbiAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgLy8gU2xpY2UgdGhlIGxhc3QgY29tcG9uZW50IChhLmIuYyAtPiBhLmIpXG4gICAgICAgIC8vIE90aGVyd2lzZSB3ZSdsbCBpbmNsdWRlIG9uZSBsZXZlbCB0b28gbXVjaC5cbiAgICAgICAgcmV0dXJuIGtleS5zbGljZSgwLCBrZXkubGFzdEluZGV4T2YoJy4nKSk7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywnKTtcblxuICAgIC8vIENvbmNhdCB0aGUgcG9zc2libHkgcHJlc2VudCBpbmNsdWRlIHN0cmluZyB3aXRoIHRoZSBvbmUgZnJvbSB0aGUga2V5c1xuICAgIC8vIERlZHVwIC8gc29ydGluZyBpcyBoYW5kbGUgaW4gJ2luY2x1ZGUnIGNhc2UuXG4gICAgaWYgKGtleXNGb3JJbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICAgIGlmICghcmVzdE9wdGlvbnMuaW5jbHVkZSB8fCByZXN0T3B0aW9ucy5pbmNsdWRlLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgKz0gJywnICsga2V5c0ZvckluY2x1ZGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZm9yICh2YXIgb3B0aW9uIGluIHJlc3RPcHRpb25zKSB7XG4gICAgc3dpdGNoIChvcHRpb24pIHtcbiAgICAgIGNhc2UgJ2tleXMnOiB7XG4gICAgICAgIGNvbnN0IGtleXMgPSByZXN0T3B0aW9ucy5rZXlzXG4gICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAuZmlsdGVyKGtleSA9PiBrZXkubGVuZ3RoID4gMClcbiAgICAgICAgICAuY29uY2F0KEFsd2F5c1NlbGVjdGVkS2V5cyk7XG4gICAgICAgIHRoaXMua2V5cyA9IEFycmF5LmZyb20obmV3IFNldChrZXlzKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnZXhjbHVkZUtleXMnOiB7XG4gICAgICAgIGNvbnN0IGV4Y2x1ZGUgPSByZXN0T3B0aW9ucy5leGNsdWRlS2V5c1xuICAgICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgICAgLmZpbHRlcihrID0+IEFsd2F5c1NlbGVjdGVkS2V5cy5pbmRleE9mKGspIDwgMCk7XG4gICAgICAgIHRoaXMuZXhjbHVkZUtleXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoZXhjbHVkZSkpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ2NvdW50JzpcbiAgICAgICAgdGhpcy5kb0NvdW50ID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlQWxsJzpcbiAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdleHBsYWluJzpcbiAgICAgIGNhc2UgJ2hpbnQnOlxuICAgICAgY2FzZSAnZGlzdGluY3QnOlxuICAgICAgY2FzZSAncGlwZWxpbmUnOlxuICAgICAgY2FzZSAnc2tpcCc6XG4gICAgICBjYXNlICdsaW1pdCc6XG4gICAgICBjYXNlICdyZWFkUHJlZmVyZW5jZSc6XG4gICAgICAgIHRoaXMuZmluZE9wdGlvbnNbb3B0aW9uXSA9IHJlc3RPcHRpb25zW29wdGlvbl07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnb3JkZXInOlxuICAgICAgICB2YXIgZmllbGRzID0gcmVzdE9wdGlvbnMub3JkZXIuc3BsaXQoJywnKTtcbiAgICAgICAgdGhpcy5maW5kT3B0aW9ucy5zb3J0ID0gZmllbGRzLnJlZHVjZSgoc29ydE1hcCwgZmllbGQpID0+IHtcbiAgICAgICAgICBmaWVsZCA9IGZpZWxkLnRyaW0oKTtcbiAgICAgICAgICBpZiAoZmllbGQgPT09ICckc2NvcmUnIHx8IGZpZWxkID09PSAnLSRzY29yZScpIHtcbiAgICAgICAgICAgIHNvcnRNYXAuc2NvcmUgPSB7ICRtZXRhOiAndGV4dFNjb3JlJyB9O1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmllbGRbMF0gPT0gJy0nKSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkLnNsaWNlKDEpXSA9IC0xO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkXSA9IDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBzb3J0TWFwO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZSc6IHtcbiAgICAgICAgY29uc3QgcGF0aHMgPSByZXN0T3B0aW9ucy5pbmNsdWRlLnNwbGl0KCcsJyk7XG4gICAgICAgIGlmIChwYXRocy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICAvLyBMb2FkIHRoZSBleGlzdGluZyBpbmNsdWRlcyAoZnJvbSBrZXlzKVxuICAgICAgICBjb25zdCBwYXRoU2V0ID0gcGF0aHMucmVkdWNlKChtZW1vLCBwYXRoKSA9PiB7XG4gICAgICAgICAgLy8gU3BsaXQgZWFjaCBwYXRocyBvbiAuIChhLmIuYyAtPiBbYSxiLGNdKVxuICAgICAgICAgIC8vIHJlZHVjZSB0byBjcmVhdGUgYWxsIHBhdGhzXG4gICAgICAgICAgLy8gKFthLGIsY10gLT4ge2E6IHRydWUsICdhLmInOiB0cnVlLCAnYS5iLmMnOiB0cnVlfSlcbiAgICAgICAgICByZXR1cm4gcGF0aC5zcGxpdCgnLicpLnJlZHVjZSgobWVtbywgcGF0aCwgaW5kZXgsIHBhcnRzKSA9PiB7XG4gICAgICAgICAgICBtZW1vW3BhcnRzLnNsaWNlKDAsIGluZGV4ICsgMSkuam9pbignLicpXSA9IHRydWU7XG4gICAgICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgICAgICB9LCBtZW1vKTtcbiAgICAgICAgfSwge30pO1xuXG4gICAgICAgIHRoaXMuaW5jbHVkZSA9IE9iamVjdC5rZXlzKHBhdGhTZXQpXG4gICAgICAgICAgLm1hcChzID0+IHtcbiAgICAgICAgICAgIHJldHVybiBzLnNwbGl0KCcuJyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGg7IC8vIFNvcnQgYnkgbnVtYmVyIG9mIGNvbXBvbmVudHNcbiAgICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdyZWRpcmVjdENsYXNzTmFtZUZvcktleSc6XG4gICAgICAgIHRoaXMucmVkaXJlY3RLZXkgPSByZXN0T3B0aW9ucy5yZWRpcmVjdENsYXNzTmFtZUZvcktleTtcbiAgICAgICAgdGhpcy5yZWRpcmVjdENsYXNzTmFtZSA9IG51bGw7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZVJlYWRQcmVmZXJlbmNlJzpcbiAgICAgIGNhc2UgJ3N1YnF1ZXJ5UmVhZFByZWZlcmVuY2UnOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgb3B0aW9uOiAnICsgb3B0aW9uKTtcbiAgICB9XG4gIH1cbn1cblxuLy8gQSBjb252ZW5pZW50IG1ldGhvZCB0byBwZXJmb3JtIGFsbCB0aGUgc3RlcHMgb2YgcHJvY2Vzc2luZyBhIHF1ZXJ5XG4vLyBpbiBvcmRlci5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgcmVzcG9uc2UgLSBhbiBvYmplY3Qgd2l0aCBvcHRpb25hbCBrZXlzXG4vLyAncmVzdWx0cycgYW5kICdjb3VudCcuXG4vLyBUT0RPOiBjb25zb2xpZGF0ZSB0aGUgcmVwbGFjZVggZnVuY3Rpb25zXG5SZXN0UXVlcnkucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoZXhlY3V0ZU9wdGlvbnMpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuYnVpbGRSZXN0V2hlcmUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbnlQcm90ZWN0ZWRGaWVsZHMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGVBbGwoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUV4Y2x1ZGVLZXlzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5GaW5kKGV4ZWN1dGVPcHRpb25zKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkNvdW50KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlckZpbmRUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVBdXRoQWRhcHRlcnMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlc3BvbnNlO1xuICAgIH0pO1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5lYWNoID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHJlc3RXaGVyZSwgcmVzdE9wdGlvbnMsIGNsaWVudFNESyB9ID0gdGhpcztcbiAgLy8gaWYgdGhlIGxpbWl0IGlzIHNldCwgdXNlIGl0XG4gIHJlc3RPcHRpb25zLmxpbWl0ID0gcmVzdE9wdGlvbnMubGltaXQgfHwgMTAwO1xuICByZXN0T3B0aW9ucy5vcmRlciA9ICdvYmplY3RJZCc7XG4gIGxldCBmaW5pc2hlZCA9IGZhbHNlO1xuXG4gIHJldHVybiBjb250aW51ZVdoaWxlKFxuICAgICgpID0+IHtcbiAgICAgIHJldHVybiAhZmluaXNoZWQ7XG4gICAgfSxcbiAgICBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgICBjbGllbnRTREssXG4gICAgICAgIHRoaXMucnVuQWZ0ZXJGaW5kLFxuICAgICAgICB0aGlzLmNvbnRleHRcbiAgICAgICk7XG4gICAgICBjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKTtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChjYWxsYmFjayk7XG4gICAgICBmaW5pc2hlZCA9IHJlc3VsdHMubGVuZ3RoIDwgcmVzdE9wdGlvbnMubGltaXQ7XG4gICAgICBpZiAoIWZpbmlzaGVkKSB7XG4gICAgICAgIHJlc3RXaGVyZS5vYmplY3RJZCA9IE9iamVjdC5hc3NpZ24oe30sIHJlc3RXaGVyZS5vYmplY3RJZCwge1xuICAgICAgICAgICRndDogcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdLm9iamVjdElkLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICk7XG59O1xuXG5SZXN0UXVlcnkucHJvdG90eXBlLmJ1aWxkUmVzdFdoZXJlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRVc2VyQW5kUm9sZUFDTCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZVNlbGVjdCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlTm90SW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZUVxdWFsaXR5KCk7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcblJlc3RRdWVyeS5wcm90b3R5cGUuZ2V0VXNlckFuZFJvbGVBQ0wgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLmZpbmRPcHRpb25zLmFjbCA9IFsnKiddO1xuXG4gIGlmICh0aGlzLmF1dGgudXNlcikge1xuICAgIHJldHVybiB0aGlzLmF1dGguZ2V0VXNlclJvbGVzKCkudGhlbihyb2xlcyA9PiB7XG4gICAgICB0aGlzLmZpbmRPcHRpb25zLmFjbCA9IHRoaXMuZmluZE9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW3RoaXMuYXV0aC51c2VyLmlkXSk7XG4gICAgICByZXR1cm47XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBDaGFuZ2VzIHRoZSBjbGFzc05hbWUgaWYgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXkgaXMgc2V0LlxuLy8gUmV0dXJucyBhIHByb21pc2UuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVkaXJlY3RLZXkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXZSBuZWVkIHRvIGNoYW5nZSB0aGUgY2xhc3MgbmFtZSBiYXNlZCBvbiB0aGUgc2NoZW1hXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5yZWRpcmVjdENsYXNzTmFtZUZvcktleSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5yZWRpcmVjdEtleSlcbiAgICAudGhlbihuZXdDbGFzc05hbWUgPT4ge1xuICAgICAgdGhpcy5jbGFzc05hbWUgPSBuZXdDbGFzc05hbWU7XG4gICAgICB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lID0gbmV3Q2xhc3NOYW1lO1xuICAgIH0pO1xufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5SZXN0UXVlcnkucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKFxuICAgIHRoaXMuY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgU2NoZW1hQ29udHJvbGxlci5zeXN0ZW1DbGFzc2VzLmluZGV4T2YodGhpcy5jbGFzc05hbWUpID09PSAtMVxuICApIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5oYXNDbGFzcyh0aGlzLmNsYXNzTmFtZSkpXG4gICAgICAudGhlbihoYXNDbGFzcyA9PiB7XG4gICAgICAgIGlmIChoYXNDbGFzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAnVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2VzcyAnICsgJ25vbi1leGlzdGVudCBjbGFzczogJyArIHRoaXMuY2xhc3NOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIGNsYXNzTmFtZSwgcmVzdWx0cykge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgdmFsdWVzLnB1c2goe1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgIG9iamVjdElkOiByZXN1bHQub2JqZWN0SWQsXG4gICAgfSk7XG4gIH1cbiAgZGVsZXRlIGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmIChBcnJheS5pc0FycmF5KGluUXVlcnlPYmplY3RbJyRpbiddKSkge1xuICAgIGluUXVlcnlPYmplY3RbJyRpbiddID0gaW5RdWVyeU9iamVjdFsnJGluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgaW5RdWVyeU9iamVjdFsnJGluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkaW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkaW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJGluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZUluUXVlcnkgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBpblF1ZXJ5T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckaW5RdWVyeScpO1xuICBpZiAoIWluUXVlcnlPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgaW5RdWVyeSB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gd2hlcmUgYW5kIGNsYXNzTmFtZVxuICB2YXIgaW5RdWVyeVZhbHVlID0gaW5RdWVyeU9iamVjdFsnJGluUXVlcnknXTtcbiAgaWYgKCFpblF1ZXJ5VmFsdWUud2hlcmUgfHwgIWluUXVlcnlWYWx1ZS5jbGFzc05hbWUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRpblF1ZXJ5Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogaW5RdWVyeVZhbHVlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lLFxuICAgIGluUXVlcnlWYWx1ZS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybUluUXVlcnkoaW5RdWVyeU9iamVjdCwgc3VicXVlcnkuY2xhc3NOYW1lLCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBSZWN1cnNlIHRvIHJlcGVhdFxuICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gIH0pO1xufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtTm90SW5RdWVyeShub3RJblF1ZXJ5T2JqZWN0LCBjbGFzc05hbWUsIHJlc3VsdHMpIHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgIHZhbHVlcy5wdXNoKHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogcmVzdWx0Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGRlbGV0ZSBub3RJblF1ZXJ5T2JqZWN0Wyckbm90SW5RdWVyeSddO1xuICBpZiAoQXJyYXkuaXNBcnJheShub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10pKSB7XG4gICAgbm90SW5RdWVyeU9iamVjdFsnJG5pbiddID0gbm90SW5RdWVyeU9iamVjdFsnJG5pbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IHZhbHVlcztcbiAgfVxufVxuXG4vLyBSZXBsYWNlcyBhICRub3RJblF1ZXJ5IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYW5cbi8vICRub3RJblF1ZXJ5IGNsYXVzZS5cbi8vIFRoZSAkbm90SW5RdWVyeSBjbGF1c2UgdHVybnMgaW50byBhICRuaW4gd2l0aCB2YWx1ZXMgdGhhdCBhcmUganVzdFxuLy8gcG9pbnRlcnMgdG8gdGhlIG9iamVjdHMgcmV0dXJuZWQgaW4gdGhlIHN1YnF1ZXJ5LlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlTm90SW5RdWVyeSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG5vdEluUXVlcnlPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRub3RJblF1ZXJ5Jyk7XG4gIGlmICghbm90SW5RdWVyeU9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBub3RJblF1ZXJ5IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSB3aGVyZSBhbmQgY2xhc3NOYW1lXG4gIHZhciBub3RJblF1ZXJ5VmFsdWUgPSBub3RJblF1ZXJ5T2JqZWN0Wyckbm90SW5RdWVyeSddO1xuICBpZiAoIW5vdEluUXVlcnlWYWx1ZS53aGVyZSB8fCAhbm90SW5RdWVyeVZhbHVlLmNsYXNzTmFtZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJG5vdEluUXVlcnknKTtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBub3RJblF1ZXJ5VmFsdWUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHZhciBzdWJxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIG5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUsXG4gICAgbm90SW5RdWVyeVZhbHVlLndoZXJlLFxuICAgIGFkZGl0aW9uYWxPcHRpb25zXG4gICk7XG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtTm90SW5RdWVyeShub3RJblF1ZXJ5T2JqZWN0LCBzdWJxdWVyeS5jbGFzc05hbWUsIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIFJlY3Vyc2UgdG8gcmVwZWF0XG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZU5vdEluUXVlcnkoKTtcbiAgfSk7XG59O1xuXG4vLyBVc2VkIHRvIGdldCB0aGUgZGVlcGVzdCBvYmplY3QgZnJvbSBqc29uIHVzaW5nIGRvdCBub3RhdGlvbi5cbmNvbnN0IGdldERlZXBlc3RPYmplY3RGcm9tS2V5ID0gKGpzb24sIGtleSwgaWR4LCBzcmMpID0+IHtcbiAgaWYgKGtleSBpbiBqc29uKSB7XG4gICAgcmV0dXJuIGpzb25ba2V5XTtcbiAgfVxuICBzcmMuc3BsaWNlKDEpOyAvLyBFeGl0IEVhcmx5XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1TZWxlY3QgPSAoc2VsZWN0T2JqZWN0LCBrZXksIG9iamVjdHMpID0+IHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2Ygb2JqZWN0cykge1xuICAgIHZhbHVlcy5wdXNoKGtleS5zcGxpdCgnLicpLnJlZHVjZShnZXREZWVwZXN0T2JqZWN0RnJvbUtleSwgcmVzdWx0KSk7XG4gIH1cbiAgZGVsZXRlIHNlbGVjdE9iamVjdFsnJHNlbGVjdCddO1xuICBpZiAoQXJyYXkuaXNBcnJheShzZWxlY3RPYmplY3RbJyRpbiddKSkge1xuICAgIHNlbGVjdE9iamVjdFsnJGluJ10gPSBzZWxlY3RPYmplY3RbJyRpbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIHNlbGVjdE9iamVjdFsnJGluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJHNlbGVjdCBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFcbi8vICRzZWxlY3QgY2xhdXNlLlxuLy8gVGhlICRzZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHNlbGVjdGVkIG91dCBvZlxuLy8gdGhlIHN1YnF1ZXJ5LlxuLy8gUmV0dXJucyBhIHBvc3NpYmxlLXByb21pc2UuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VTZWxlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRzZWxlY3QnKTtcbiAgaWYgKCFzZWxlY3RPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgc2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBzZWxlY3RWYWx1ZSA9IHNlbGVjdE9iamVjdFsnJHNlbGVjdCddO1xuICAvLyBpT1MgU0RLIGRvbid0IHNlbmQgd2hlcmUgaWYgbm90IHNldCwgbGV0IGl0IHBhc3NcbiAgaWYgKFxuICAgICFzZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFzZWxlY3RWYWx1ZS5rZXkgfHxcbiAgICB0eXBlb2Ygc2VsZWN0VmFsdWUucXVlcnkgIT09ICdvYmplY3QnIHx8XG4gICAgIXNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKHNlbGVjdFZhbHVlKS5sZW5ndGggIT09IDJcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkc2VsZWN0Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogc2VsZWN0VmFsdWUucXVlcnkucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHZhciBzdWJxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIHNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSxcbiAgICBzZWxlY3RWYWx1ZS5xdWVyeS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybVNlbGVjdChzZWxlY3RPYmplY3QsIHNlbGVjdFZhbHVlLmtleSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gS2VlcCByZXBsYWNpbmcgJHNlbGVjdCBjbGF1c2VzXG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZVNlbGVjdCgpO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvbnRTZWxlY3QgPSAoZG9udFNlbGVjdE9iamVjdCwga2V5LCBvYmplY3RzKSA9PiB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIG9iamVjdHMpIHtcbiAgICB2YWx1ZXMucHVzaChrZXkuc3BsaXQoJy4nKS5yZWR1Y2UoZ2V0RGVlcGVzdE9iamVjdEZyb21LZXksIHJlc3VsdCkpO1xuICB9XG4gIGRlbGV0ZSBkb250U2VsZWN0T2JqZWN0WyckZG9udFNlbGVjdCddO1xuICBpZiAoQXJyYXkuaXNBcnJheShkb250U2VsZWN0T2JqZWN0WyckbmluJ10pKSB7XG4gICAgZG9udFNlbGVjdE9iamVjdFsnJG5pbiddID0gZG9udFNlbGVjdE9iamVjdFsnJG5pbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSA9IHZhbHVlcztcbiAgfVxufTtcblxuLy8gUmVwbGFjZXMgYSAkZG9udFNlbGVjdCBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFcbi8vICRkb250U2VsZWN0IGNsYXVzZS5cbi8vIFRoZSAkZG9udFNlbGVjdCBjbGF1c2UgdHVybnMgaW50byBhbiAkbmluIHdpdGggdmFsdWVzIHNlbGVjdGVkIG91dCBvZlxuLy8gdGhlIHN1YnF1ZXJ5LlxuLy8gUmV0dXJucyBhIHBvc3NpYmxlLXByb21pc2UuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VEb250U2VsZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgZG9udFNlbGVjdE9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGRvbnRTZWxlY3QnKTtcbiAgaWYgKCFkb250U2VsZWN0T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGRvbnRTZWxlY3QgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHF1ZXJ5IGFuZCBrZXlcbiAgdmFyIGRvbnRTZWxlY3RWYWx1ZSA9IGRvbnRTZWxlY3RPYmplY3RbJyRkb250U2VsZWN0J107XG4gIGlmIChcbiAgICAhZG9udFNlbGVjdFZhbHVlLnF1ZXJ5IHx8XG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5rZXkgfHxcbiAgICB0eXBlb2YgZG9udFNlbGVjdFZhbHVlLnF1ZXJ5ICE9PSAnb2JqZWN0JyB8fFxuICAgICFkb250U2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lIHx8XG4gICAgT2JqZWN0LmtleXMoZG9udFNlbGVjdFZhbHVlKS5sZW5ndGggIT09IDJcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkZG9udFNlbGVjdCcpO1xuICB9XG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBkb250U2VsZWN0VmFsdWUucXVlcnkucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHZhciBzdWJxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUsXG4gICAgZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LndoZXJlLFxuICAgIGFkZGl0aW9uYWxPcHRpb25zXG4gICk7XG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtRG9udFNlbGVjdChkb250U2VsZWN0T2JqZWN0LCBkb250U2VsZWN0VmFsdWUua2V5LCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBLZWVwIHJlcGxhY2luZyAkZG9udFNlbGVjdCBjbGF1c2VzXG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5SZXN0UXVlcnkucHJvdG90eXBlLmNsZWFuUmVzdWx0QXV0aERhdGEgPSBmdW5jdGlvbiAocmVzdWx0KSB7XG4gIGRlbGV0ZSByZXN1bHQucGFzc3dvcmQ7XG4gIGlmIChyZXN1bHQuYXV0aERhdGEpIHtcbiAgICBPYmplY3Qua2V5cyhyZXN1bHQuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgaWYgKHJlc3VsdC5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIHJlc3VsdC5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoT2JqZWN0LmtleXMocmVzdWx0LmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgZGVsZXRlIHJlc3VsdC5hdXRoRGF0YTtcbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHJlcGxhY2VFcXVhbGl0eUNvbnN0cmFpbnQgPSBjb25zdHJhaW50ID0+IHtcbiAgaWYgKHR5cGVvZiBjb25zdHJhaW50ICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBjb25zdHJhaW50O1xuICB9XG4gIGNvbnN0IGVxdWFsVG9PYmplY3QgPSB7fTtcbiAgbGV0IGhhc0RpcmVjdENvbnN0cmFpbnQgPSBmYWxzZTtcbiAgbGV0IGhhc09wZXJhdG9yQ29uc3RyYWludCA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IGtleSBpbiBjb25zdHJhaW50KSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCckJykgIT09IDApIHtcbiAgICAgIGhhc0RpcmVjdENvbnN0cmFpbnQgPSB0cnVlO1xuICAgICAgZXF1YWxUb09iamVjdFtrZXldID0gY29uc3RyYWludFtrZXldO1xuICAgIH0gZWxzZSB7XG4gICAgICBoYXNPcGVyYXRvckNvbnN0cmFpbnQgPSB0cnVlO1xuICAgIH1cbiAgfVxuICBpZiAoaGFzRGlyZWN0Q29uc3RyYWludCAmJiBoYXNPcGVyYXRvckNvbnN0cmFpbnQpIHtcbiAgICBjb25zdHJhaW50WyckZXEnXSA9IGVxdWFsVG9PYmplY3Q7XG4gICAgT2JqZWN0LmtleXMoZXF1YWxUb09iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgZGVsZXRlIGNvbnN0cmFpbnRba2V5XTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gY29uc3RyYWludDtcbn07XG5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZUVxdWFsaXR5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIHRoaXMucmVzdFdoZXJlICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLnJlc3RXaGVyZSkge1xuICAgIHRoaXMucmVzdFdoZXJlW2tleV0gPSByZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50KHRoaXMucmVzdFdoZXJlW2tleV0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hldGhlciBpdCB3YXMgc3VjY2Vzc2Z1bC5cbi8vIFBvcHVsYXRlcyB0aGlzLnJlc3BvbnNlIHdpdGggYW4gb2JqZWN0IHRoYXQgb25seSBoYXMgJ3Jlc3VsdHMnLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5GaW5kID0gZnVuY3Rpb24gKG9wdGlvbnMgPSB7fSkge1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5saW1pdCA9PT0gMCkge1xuICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3VsdHM6IFtdIH07XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIGNvbnN0IGZpbmRPcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5maW5kT3B0aW9ucyk7XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICBmaW5kT3B0aW9ucy5rZXlzID0gdGhpcy5rZXlzLm1hcChrZXkgPT4ge1xuICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpWzBdO1xuICAgIH0pO1xuICB9XG4gIGlmIChvcHRpb25zLm9wKSB7XG4gICAgZmluZE9wdGlvbnMub3AgPSBvcHRpb25zLm9wO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgZmluZE9wdGlvbnMsIHRoaXMuYXV0aClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiAhZmluZE9wdGlvbnMuZXhwbGFpbikge1xuICAgICAgICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgICAgICAgIHRoaXMuY2xlYW5SZXN1bHRBdXRoRGF0YShyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCByZXN1bHRzKTtcblxuICAgICAgaWYgKHRoaXMucmVkaXJlY3RDbGFzc05hbWUpIHtcbiAgICAgICAgZm9yICh2YXIgciBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgci5jbGFzc05hbWUgPSB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLnJlc3BvbnNlID0geyByZXN1bHRzOiByZXN1bHRzIH07XG4gICAgfSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hldGhlciBpdCB3YXMgc3VjY2Vzc2Z1bC5cbi8vIFBvcHVsYXRlcyB0aGlzLnJlc3BvbnNlLmNvdW50IHdpdGggdGhlIGNvdW50XG5SZXN0UXVlcnkucHJvdG90eXBlLnJ1bkNvdW50ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZG9Db3VudCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmZpbmRPcHRpb25zLmNvdW50ID0gdHJ1ZTtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMuc2tpcDtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMubGltaXQ7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgdGhpcy5maW5kT3B0aW9ucykudGhlbihjID0+IHtcbiAgICB0aGlzLnJlc3BvbnNlLmNvdW50ID0gYztcbiAgfSk7XG59O1xuXG5SZXN0UXVlcnkucHJvdG90eXBlLmRlbnlQcm90ZWN0ZWRGaWVsZHMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc2NoZW1hQ29udHJvbGxlciA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKTtcbiAgY29uc3QgcHJvdGVjdGVkRmllbGRzID1cbiAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgIHRoaXMuZmluZE9wdGlvbnMuYWNsLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdGhpcy5maW5kT3B0aW9uc1xuICAgICkgfHwgW107XG4gIGZvciAoY29uc3Qga2V5IG9mIHByb3RlY3RlZEZpZWxkcykge1xuICAgIGlmICh0aGlzLnJlc3RXaGVyZVtrZXldKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gcXVlcnkgJHtrZXl9IG9uIGNsYXNzICR7dGhpcy5jbGFzc05hbWV9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbGwgcG9pbnRlcnMgb24gYW4gb2JqZWN0XG5SZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGVBbGwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5pbmNsdWRlQWxsKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5sb2FkU2NoZW1hKClcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgY29uc3QgaW5jbHVkZUZpZWxkcyA9IFtdO1xuICAgICAgY29uc3Qga2V5RmllbGRzID0gW107XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykgfHxcbiAgICAgICAgICAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnQXJyYXknKVxuICAgICAgICApIHtcbiAgICAgICAgICBpbmNsdWRlRmllbGRzLnB1c2goW2ZpZWxkXSk7XG4gICAgICAgICAga2V5RmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBBZGQgZmllbGRzIHRvIGluY2x1ZGUsIGtleXMsIHJlbW92ZSBkdXBzXG4gICAgICB0aGlzLmluY2x1ZGUgPSBbLi4ubmV3IFNldChbLi4udGhpcy5pbmNsdWRlLCAuLi5pbmNsdWRlRmllbGRzXSldO1xuICAgICAgLy8gaWYgdGhpcy5rZXlzIG5vdCBzZXQsIHRoZW4gYWxsIGtleXMgYXJlIGFscmVhZHkgaW5jbHVkZWRcbiAgICAgIGlmICh0aGlzLmtleXMpIHtcbiAgICAgICAgdGhpcy5rZXlzID0gWy4uLm5ldyBTZXQoWy4uLnRoaXMua2V5cywgLi4ua2V5RmllbGRzXSldO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gVXBkYXRlcyBwcm9wZXJ0eSBgdGhpcy5rZXlzYCB0byBjb250YWluIGFsbCBrZXlzIGJ1dCB0aGUgb25lcyB1bnNlbGVjdGVkLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVFeGNsdWRlS2V5cyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmV4Y2x1ZGVLZXlzKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICB0aGlzLmtleXMgPSB0aGlzLmtleXMuZmlsdGVyKGsgPT4gIXRoaXMuZXhjbHVkZUtleXMuaW5jbHVkZXMoaykpO1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpO1xuICAgICAgdGhpcy5rZXlzID0gZmllbGRzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICB9KTtcbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBkYXRhIGF0IHRoZSBwYXRocyBwcm92aWRlZCBpbiB0aGlzLmluY2x1ZGUuXG5SZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGUgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcGF0aFJlc3BvbnNlID0gaW5jbHVkZVBhdGgoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIHRoaXMucmVzcG9uc2UsXG4gICAgdGhpcy5pbmNsdWRlWzBdLFxuICAgIHRoaXMucmVzdE9wdGlvbnNcbiAgKTtcbiAgaWYgKHBhdGhSZXNwb25zZS50aGVuKSB7XG4gICAgcmV0dXJuIHBhdGhSZXNwb25zZS50aGVuKG5ld1Jlc3BvbnNlID0+IHtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSBuZXdSZXNwb25zZTtcbiAgICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KTtcbiAgfSBlbHNlIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gIH1cblxuICByZXR1cm4gcGF0aFJlc3BvbnNlO1xufTtcblxuLy9SZXR1cm5zIGEgcHJvbWlzZSBvZiBhIHByb2Nlc3NlZCBzZXQgb2YgcmVzdWx0c1xuUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5BZnRlckZpbmRUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF0aGlzLnJ1bkFmdGVyRmluZCkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlckZpbmQnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyRmluZEhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGlmICghaGFzQWZ0ZXJGaW5kSG9vaykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBTa2lwIEFnZ3JlZ2F0ZSBhbmQgRGlzdGluY3QgUXVlcmllc1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5waXBlbGluZSB8fCB0aGlzLmZpbmRPcHRpb25zLmRpc3RpbmN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMucmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gdGhpcy5yZXN0V2hlcmU7XG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuICAvLyBSdW4gYWZ0ZXJGaW5kIHRyaWdnZXIgYW5kIHNldCB0aGUgbmV3IHJlc3VsdHNcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzLFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICBwYXJzZVF1ZXJ5LFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gRW5zdXJlIHdlIHByb3Blcmx5IHNldCB0aGUgY2xhc3NOYW1lIGJhY2tcbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICAgICAgb2JqZWN0ID0gb2JqZWN0LnRvSlNPTigpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3QuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHM7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUF1dGhBZGFwdGVycyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8IHRoaXMuZmluZE9wdGlvbnMuZXhwbGFpbikge1xuICAgIHJldHVybjtcbiAgfVxuICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMubWFwKHJlc3VsdCA9PlxuICAgICAgdGhpcy5jb25maWcuYXV0aERhdGFNYW5hZ2VyLnJ1bkFmdGVyRmluZChcbiAgICAgICAgeyBjb25maWc6IHRoaXMuY29uZmlnLCBhdXRoOiB0aGlzLmF1dGggfSxcbiAgICAgICAgcmVzdWx0LmF1dGhEYXRhXG4gICAgICApXG4gICAgKVxuICApO1xufTtcblxuLy8gQWRkcyBpbmNsdWRlZCB2YWx1ZXMgdG8gdGhlIHJlc3BvbnNlLlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGQgbmFtZXMuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gYXVnbWVudGVkIHJlc3BvbnNlLlxuZnVuY3Rpb24gaW5jbHVkZVBhdGgoY29uZmlnLCBhdXRoLCByZXNwb25zZSwgcGF0aCwgcmVzdE9wdGlvbnMgPSB7fSkge1xuICB2YXIgcG9pbnRlcnMgPSBmaW5kUG9pbnRlcnMocmVzcG9uc2UucmVzdWx0cywgcGF0aCk7XG4gIGlmIChwb2ludGVycy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuICBjb25zdCBwb2ludGVyc0hhc2ggPSB7fTtcbiAgZm9yICh2YXIgcG9pbnRlciBvZiBwb2ludGVycykge1xuICAgIGlmICghcG9pbnRlcikge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHBvaW50ZXIuY2xhc3NOYW1lO1xuICAgIC8vIG9ubHkgaW5jbHVkZSB0aGUgZ29vZCBwb2ludGVyc1xuICAgIGlmIChjbGFzc05hbWUpIHtcbiAgICAgIHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdID0gcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0gfHwgbmV3IFNldCgpO1xuICAgICAgcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0uYWRkKHBvaW50ZXIub2JqZWN0SWQpO1xuICAgIH1cbiAgfVxuICBjb25zdCBpbmNsdWRlUmVzdE9wdGlvbnMgPSB7fTtcbiAgaWYgKHJlc3RPcHRpb25zLmtleXMpIHtcbiAgICBjb25zdCBrZXlzID0gbmV3IFNldChyZXN0T3B0aW9ucy5rZXlzLnNwbGl0KCcsJykpO1xuICAgIGNvbnN0IGtleVNldCA9IEFycmF5LmZyb20oa2V5cykucmVkdWNlKChzZXQsIGtleSkgPT4ge1xuICAgICAgY29uc3Qga2V5UGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChpOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocGF0aFtpXSAhPSBrZXlQYXRoW2ldKSB7XG4gICAgICAgICAgcmV0dXJuIHNldDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGkgPCBrZXlQYXRoLmxlbmd0aCkge1xuICAgICAgICBzZXQuYWRkKGtleVBhdGhbaV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNldDtcbiAgICB9LCBuZXcgU2V0KCkpO1xuICAgIGlmIChrZXlTZXQuc2l6ZSA+IDApIHtcbiAgICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5rZXlzID0gQXJyYXkuZnJvbShrZXlTZXQpLmpvaW4oJywnKTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVzdE9wdGlvbnMuZXhjbHVkZUtleXMpIHtcbiAgICBjb25zdCBleGNsdWRlS2V5cyA9IG5ldyBTZXQocmVzdE9wdGlvbnMuZXhjbHVkZUtleXMuc3BsaXQoJywnKSk7XG4gICAgY29uc3QgZXhjbHVkZUtleVNldCA9IEFycmF5LmZyb20oZXhjbHVkZUtleXMpLnJlZHVjZSgoc2V0LCBrZXkpID0+IHtcbiAgICAgIGNvbnN0IGtleVBhdGggPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgIGxldCBpID0gMDtcbiAgICAgIGZvciAoaTsgaSA8IHBhdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHBhdGhbaV0gIT0ga2V5UGF0aFtpXSkge1xuICAgICAgICAgIHJldHVybiBzZXQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChpID09IGtleVBhdGgubGVuZ3RoIC0gMSkge1xuICAgICAgICBzZXQuYWRkKGtleVBhdGhbaV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNldDtcbiAgICB9LCBuZXcgU2V0KCkpO1xuICAgIGlmIChleGNsdWRlS2V5U2V0LnNpemUgPiAwKSB7XG4gICAgICBpbmNsdWRlUmVzdE9wdGlvbnMuZXhjbHVkZUtleXMgPSBBcnJheS5mcm9tKGV4Y2x1ZGVLZXlTZXQpLmpvaW4oJywnKTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAocmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIGNvbnN0IHF1ZXJ5UHJvbWlzZXMgPSBPYmplY3Qua2V5cyhwb2ludGVyc0hhc2gpLm1hcChjbGFzc05hbWUgPT4ge1xuICAgIGNvbnN0IG9iamVjdElkcyA9IEFycmF5LmZyb20ocG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0pO1xuICAgIGxldCB3aGVyZTtcbiAgICBpZiAob2JqZWN0SWRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiBvYmplY3RJZHNbMF0gfTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiB7ICRpbjogb2JqZWN0SWRzIH0gfTtcbiAgICB9XG4gICAgdmFyIHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgd2hlcmUsIGluY2x1ZGVSZXN0T3B0aW9ucyk7XG4gICAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoeyBvcDogJ2dldCcgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHRzKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gR2V0IHRoZSBvYmplY3RzIGZvciBhbGwgdGhlc2Ugb2JqZWN0IGlkc1xuICByZXR1cm4gUHJvbWlzZS5hbGwocXVlcnlQcm9taXNlcykudGhlbihyZXNwb25zZXMgPT4ge1xuICAgIHZhciByZXBsYWNlID0gcmVzcG9uc2VzLnJlZHVjZSgocmVwbGFjZSwgaW5jbHVkZVJlc3BvbnNlKSA9PiB7XG4gICAgICBmb3IgKHZhciBvYmogb2YgaW5jbHVkZVJlc3BvbnNlLnJlc3VsdHMpIHtcbiAgICAgICAgb2JqLl9fdHlwZSA9ICdPYmplY3QnO1xuICAgICAgICBvYmouY2xhc3NOYW1lID0gaW5jbHVkZVJlc3BvbnNlLmNsYXNzTmFtZTtcblxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSA9PSAnX1VzZXInICYmICFhdXRoLmlzTWFzdGVyKSB7XG4gICAgICAgICAgZGVsZXRlIG9iai5zZXNzaW9uVG9rZW47XG4gICAgICAgICAgZGVsZXRlIG9iai5hdXRoRGF0YTtcbiAgICAgICAgfVxuICAgICAgICByZXBsYWNlW29iai5vYmplY3RJZF0gPSBvYmo7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVwbGFjZTtcbiAgICB9LCB7fSk7XG5cbiAgICB2YXIgcmVzcCA9IHtcbiAgICAgIHJlc3VsdHM6IHJlcGxhY2VQb2ludGVycyhyZXNwb25zZS5yZXN1bHRzLCBwYXRoLCByZXBsYWNlKSxcbiAgICB9O1xuICAgIGlmIChyZXNwb25zZS5jb3VudCkge1xuICAgICAgcmVzcC5jb3VudCA9IHJlc3BvbnNlLmNvdW50O1xuICAgIH1cbiAgICByZXR1cm4gcmVzcDtcbiAgfSk7XG59XG5cbi8vIE9iamVjdCBtYXkgYmUgYSBsaXN0IG9mIFJFU1QtZm9ybWF0IG9iamVjdCB0byBmaW5kIHBvaW50ZXJzIGluLCBvclxuLy8gaXQgbWF5IGJlIGEgc2luZ2xlIG9iamVjdC5cbi8vIElmIHRoZSBwYXRoIHlpZWxkcyB0aGluZ3MgdGhhdCBhcmVuJ3QgcG9pbnRlcnMsIHRoaXMgdGhyb3dzIGFuIGVycm9yLlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGRzIHRvIHNlYXJjaCBpbnRvLlxuLy8gUmV0dXJucyBhIGxpc3Qgb2YgcG9pbnRlcnMgaW4gUkVTVCBmb3JtYXQuXG5mdW5jdGlvbiBmaW5kUG9pbnRlcnMob2JqZWN0LCBwYXRoKSB7XG4gIGlmIChvYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhciBhbnN3ZXIgPSBbXTtcbiAgICBmb3IgKHZhciB4IG9mIG9iamVjdCkge1xuICAgICAgYW5zd2VyID0gYW5zd2VyLmNvbmNhdChmaW5kUG9pbnRlcnMoeCwgcGF0aCkpO1xuICAgIH1cbiAgICByZXR1cm4gYW5zd2VyO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8ICFvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT0gMCkge1xuICAgIGlmIChvYmplY3QgPT09IG51bGwgfHwgb2JqZWN0Ll9fdHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICAgIHJldHVybiBbb2JqZWN0XTtcbiAgICB9XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgcmV0dXJuIGZpbmRQb2ludGVycyhzdWJvYmplY3QsIHBhdGguc2xpY2UoMSkpO1xufVxuXG4vLyBPYmplY3QgbWF5IGJlIGEgbGlzdCBvZiBSRVNULWZvcm1hdCBvYmplY3RzIHRvIHJlcGxhY2UgcG9pbnRlcnNcbi8vIGluLCBvciBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGRzIHRvIHNlYXJjaCBpbnRvLlxuLy8gcmVwbGFjZSBpcyBhIG1hcCBmcm9tIG9iamVjdCBpZCAtPiBvYmplY3QuXG4vLyBSZXR1cm5zIHNvbWV0aGluZyBhbmFsb2dvdXMgdG8gb2JqZWN0LCBidXQgd2l0aCB0aGUgYXBwcm9wcmlhdGVcbi8vIHBvaW50ZXJzIGluZmxhdGVkLlxuZnVuY3Rpb24gcmVwbGFjZVBvaW50ZXJzKG9iamVjdCwgcGF0aCwgcmVwbGFjZSkge1xuICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gb2JqZWN0XG4gICAgICAubWFwKG9iaiA9PiByZXBsYWNlUG9pbnRlcnMob2JqLCBwYXRoLCByZXBsYWNlKSlcbiAgICAgIC5maWx0ZXIob2JqID0+IHR5cGVvZiBvYmogIT09ICd1bmRlZmluZWQnKTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChvYmplY3QgJiYgb2JqZWN0Ll9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gcmVwbGFjZVtvYmplY3Qub2JqZWN0SWRdO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIHZhciBuZXdzdWIgPSByZXBsYWNlUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpLCByZXBsYWNlKTtcbiAgdmFyIGFuc3dlciA9IHt9O1xuICBmb3IgKHZhciBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKGtleSA9PSBwYXRoWzBdKSB7XG4gICAgICBhbnN3ZXJba2V5XSA9IG5ld3N1YjtcbiAgICB9IGVsc2Uge1xuICAgICAgYW5zd2VyW2tleV0gPSBvYmplY3Rba2V5XTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFuc3dlcjtcbn1cblxuLy8gRmluZHMgYSBzdWJvYmplY3QgdGhhdCBoYXMgdGhlIGdpdmVuIGtleSwgaWYgdGhlcmUgaXMgb25lLlxuLy8gUmV0dXJucyB1bmRlZmluZWQgb3RoZXJ3aXNlLlxuZnVuY3Rpb24gZmluZE9iamVjdFdpdGhLZXkocm9vdCwga2V5KSB7XG4gIGlmICh0eXBlb2Ygcm9vdCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHJvb3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIGZvciAodmFyIGl0ZW0gb2Ygcm9vdCkge1xuICAgICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkoaXRlbSwga2V5KTtcbiAgICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKHJvb3QgJiYgcm9vdFtrZXldKSB7XG4gICAgcmV0dXJuIHJvb3Q7XG4gIH1cbiAgZm9yICh2YXIgc3Via2V5IGluIHJvb3QpIHtcbiAgICBjb25zdCBhbnN3ZXIgPSBmaW5kT2JqZWN0V2l0aEtleShyb290W3N1YmtleV0sIGtleSk7XG4gICAgaWYgKGFuc3dlcikge1xuICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSZXN0UXVlcnk7XG4iXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTs7QUFFQSxJQUFJQSxnQkFBZ0IsR0FBR0MsT0FBTyxDQUFDLGdDQUFnQyxDQUFDO0FBQ2hFLElBQUlDLEtBQUssR0FBR0QsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDQyxLQUFLO0FBQ3ZDLE1BQU1DLFFBQVEsR0FBR0YsT0FBTyxDQUFDLFlBQVksQ0FBQztBQUN0QyxNQUFNO0VBQUVHO0FBQWMsQ0FBQyxHQUFHSCxPQUFPLENB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