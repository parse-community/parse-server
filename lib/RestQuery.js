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
const {
  enforceRoleSecurity
} = require('./SharedRest');

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
/**
 * Use to perform a query on a class. It will run security checks and triggers.
 * @param options
 * @param options.method {RestQuery.Method} The type of query to perform
 * @param options.config {ParseServerConfiguration} The server configuration
 * @param options.auth {Auth} The auth object for the request
 * @param options.className {string} The name of the class to query
 * @param options.restWhere {object} The where object for the query
 * @param options.restOptions {object} The options object for the query
 * @param options.clientSDK {string} The client SDK that is performing the query
 * @param options.runAfterFind {boolean} Whether to run the afterFind trigger
 * @param options.runBeforeFind {boolean} Whether to run the beforeFind trigger
 * @param options.context {object} The context object for the query
 * @returns {Promise<_UnsafeRestQuery>} A promise that is resolved with the _UnsafeRestQuery object
 */
async function RestQuery({
  method,
  config,
  auth,
  className,
  restWhere = {},
  restOptions = {},
  clientSDK,
  runAfterFind = true,
  runBeforeFind = true,
  context
}) {
  if (![RestQuery.Method.find, RestQuery.Method.get].includes(method)) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'bad query type');
  }
  enforceRoleSecurity(method, className, auth);
  const result = runBeforeFind ? await triggers.maybeRunQueryTrigger(triggers.Types.beforeFind, className, restWhere, restOptions, config, auth, context, method === RestQuery.Method.get) : Promise.resolve({
    restWhere,
    restOptions
  });
  return new _UnsafeRestQuery(config, auth, className, result.restWhere || restWhere, result.restOptions || restOptions, clientSDK, runAfterFind, context);
}
RestQuery.Method = Object.freeze({
  get: 'get',
  find: 'find'
});

/**
 * _UnsafeRestQuery is meant for specific internal usage only. When you need to skip security checks or some triggers.
 * Don't use it if you don't know what you are doing.
 * @param config
 * @param auth
 * @param className
 * @param restWhere
 * @param restOptions
 * @param clientSDK
 * @param runAfterFind
 * @param context
 */
function _UnsafeRestQuery(config, auth, className, restWhere = {}, restOptions = {}, clientSDK, runAfterFind = true, context) {
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
_UnsafeRestQuery.prototype.execute = function (executeOptions) {
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
_UnsafeRestQuery.prototype.each = function (callback) {
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
    // Safe here to use _UnsafeRestQuery because the security was already
    // checked during "await RestQuery()"
    const query = new _UnsafeRestQuery(config, auth, className, restWhere, restOptions, clientSDK, this.runAfterFind, this.context);
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
_UnsafeRestQuery.prototype.buildRestWhere = function () {
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
_UnsafeRestQuery.prototype.getUserAndRoleACL = function () {
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
_UnsafeRestQuery.prototype.redirectClassNameForKey = function () {
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
_UnsafeRestQuery.prototype.validateClientClassCreation = function () {
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
_UnsafeRestQuery.prototype.replaceInQuery = async function () {
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
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: inQueryValue.className,
    restWhere: inQueryValue.where,
    restOptions: additionalOptions,
    context: this.context
  });
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
_UnsafeRestQuery.prototype.replaceNotInQuery = async function () {
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
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: notInQueryValue.className,
    restWhere: notInQueryValue.where,
    restOptions: additionalOptions,
    context: this.context
  });
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
_UnsafeRestQuery.prototype.replaceSelect = async function () {
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
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: selectValue.query.className,
    restWhere: selectValue.query.where,
    restOptions: additionalOptions,
    context: this.context
  });
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
_UnsafeRestQuery.prototype.replaceDontSelect = async function () {
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
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: dontSelectValue.query.className,
    restWhere: dontSelectValue.query.where,
    restOptions: additionalOptions,
    context: this.context
  });
  return subquery.execute().then(response => {
    transformDontSelect(dontSelectObject, dontSelectValue.key, response.results);
    // Keep replacing $dontSelect clauses
    return this.replaceDontSelect();
  });
};
_UnsafeRestQuery.prototype.cleanResultAuthData = function (result) {
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
_UnsafeRestQuery.prototype.replaceEquality = function () {
  if (typeof this.restWhere !== 'object') {
    return;
  }
  for (const key in this.restWhere) {
    this.restWhere[key] = replaceEqualityConstraint(this.restWhere[key]);
  }
};

// Returns a promise for whether it was successful.
// Populates this.response with an object that only has 'results'.
_UnsafeRestQuery.prototype.runFind = function (options = {}) {
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
_UnsafeRestQuery.prototype.runCount = function () {
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
_UnsafeRestQuery.prototype.denyProtectedFields = async function () {
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
_UnsafeRestQuery.prototype.handleIncludeAll = function () {
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
_UnsafeRestQuery.prototype.handleExcludeKeys = function () {
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
_UnsafeRestQuery.prototype.handleInclude = function () {
  if (this.include.length == 0) {
    return;
  }
  var pathResponse = includePath(this.config, this.auth, this.response, this.include[0], this.context, this.restOptions);
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
_UnsafeRestQuery.prototype.runAfterFindTrigger = function () {
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
_UnsafeRestQuery.prototype.handleAuthAdapters = async function () {
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
function includePath(config, auth, response, path, context, restOptions = {}) {
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
  const queryPromises = Object.keys(pointersHash).map(async className => {
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
    const query = await RestQuery({
      method: objectIds.length === 1 ? RestQuery.Method.get : RestQuery.Method.find,
      config,
      auth,
      className,
      restWhere: where,
      restOptions: includeRestOptions,
      context: context
    });
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
    return object.map(x => findPointers(x, path)).flat();
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
// For tests
module.exports._UnsafeRestQuery = _UnsafeRestQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsIlBhcnNlIiwidHJpZ2dlcnMiLCJjb250aW51ZVdoaWxlIiwiQWx3YXlzU2VsZWN0ZWRLZXlzIiwiZW5mb3JjZVJvbGVTZWN1cml0eSIsIlJlc3RRdWVyeSIsIm1ldGhvZCIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImNsaWVudFNESyIsInJ1bkFmdGVyRmluZCIsInJ1bkJlZm9yZUZpbmQiLCJjb250ZXh0IiwiTWV0aG9kIiwiZmluZCIsImdldCIsImluY2x1ZGVzIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwicmVzdWx0IiwibWF5YmVSdW5RdWVyeVRyaWdnZXIiLCJUeXBlcyIsImJlZm9yZUZpbmQiLCJQcm9taXNlIiwicmVzb2x2ZSIsIl9VbnNhZmVSZXN0UXVlcnkiLCJPYmplY3QiLCJmcmVlemUiLCJyZXNwb25zZSIsImZpbmRPcHRpb25zIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiJGFuZCIsIl9fdHlwZSIsIm9iamVjdElkIiwiaWQiLCJkb0NvdW50IiwiaW5jbHVkZUFsbCIsImluY2x1ZGUiLCJrZXlzRm9ySW5jbHVkZSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImtleXMiLCJleGNsdWRlS2V5cyIsImxlbmd0aCIsInNwbGl0IiwiZmlsdGVyIiwia2V5IiwibWFwIiwic2xpY2UiLCJsYXN0SW5kZXhPZiIsImpvaW4iLCJvcHRpb24iLCJjb25jYXQiLCJBcnJheSIsImZyb20iLCJTZXQiLCJleGNsdWRlIiwiayIsImluZGV4T2YiLCJmaWVsZHMiLCJvcmRlciIsInNvcnQiLCJyZWR1Y2UiLCJzb3J0TWFwIiwiZmllbGQiLCJ0cmltIiwic2NvcmUiLCIkbWV0YSIsInBhdGhzIiwicGF0aFNldCIsIm1lbW8iLCJwYXRoIiwiaW5kZXgiLCJwYXJ0cyIsInMiLCJhIiwiYiIsInJlZGlyZWN0S2V5IiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJyZWRpcmVjdENsYXNzTmFtZSIsIklOVkFMSURfSlNPTiIsImV4ZWN1dGUiLCJleGVjdXRlT3B0aW9ucyIsInRoZW4iLCJidWlsZFJlc3RXaGVyZSIsImRlbnlQcm90ZWN0ZWRGaWVsZHMiLCJoYW5kbGVJbmNsdWRlQWxsIiwiaGFuZGxlRXhjbHVkZUtleXMiLCJydW5GaW5kIiwicnVuQ291bnQiLCJoYW5kbGVJbmNsdWRlIiwicnVuQWZ0ZXJGaW5kVHJpZ2dlciIsImhhbmRsZUF1dGhBZGFwdGVycyIsImVhY2giLCJjYWxsYmFjayIsImxpbWl0IiwiZmluaXNoZWQiLCJxdWVyeSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiYXNzaWduIiwiJGd0IiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJyZXBsYWNlU2VsZWN0IiwicmVwbGFjZURvbnRTZWxlY3QiLCJyZXBsYWNlSW5RdWVyeSIsInJlcGxhY2VOb3RJblF1ZXJ5IiwicmVwbGFjZUVxdWFsaXR5IiwiYWNsIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJkYXRhYmFzZSIsIm5ld0NsYXNzTmFtZSIsImFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsInN5c3RlbUNsYXNzZXMiLCJsb2FkU2NoZW1hIiwic2NoZW1hQ29udHJvbGxlciIsImhhc0NsYXNzIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInRyYW5zZm9ybUluUXVlcnkiLCJpblF1ZXJ5T2JqZWN0IiwidmFsdWVzIiwicHVzaCIsImlzQXJyYXkiLCJmaW5kT2JqZWN0V2l0aEtleSIsImluUXVlcnlWYWx1ZSIsIndoZXJlIiwiYWRkaXRpb25hbE9wdGlvbnMiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwicmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeSIsInRyYW5zZm9ybU5vdEluUXVlcnkiLCJub3RJblF1ZXJ5T2JqZWN0Iiwibm90SW5RdWVyeVZhbHVlIiwiZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkiLCJqc29uIiwiaWR4Iiwic3JjIiwic3BsaWNlIiwidHJhbnNmb3JtU2VsZWN0Iiwic2VsZWN0T2JqZWN0Iiwib2JqZWN0cyIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImV4cGxhaW4iLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiciIsImNvdW50Iiwic2tpcCIsImMiLCJwcm90ZWN0ZWRGaWVsZHMiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJnZXRPbmVTY2hlbWEiLCJzY2hlbWEiLCJpbmNsdWRlRmllbGRzIiwia2V5RmllbGRzIiwidHlwZSIsInBhdGhSZXNwb25zZSIsImluY2x1ZGVQYXRoIiwibmV3UmVzcG9uc2UiLCJoYXNBZnRlckZpbmRIb29rIiwidHJpZ2dlckV4aXN0cyIsImFmdGVyRmluZCIsImFwcGxpY2F0aW9uSWQiLCJwaXBlbGluZSIsImRpc3RpbmN0IiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJhbGwiLCJhdXRoRGF0YU1hbmFnZXIiLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwiaSIsInNpemUiLCJleGNsdWRlS2V5U2V0IiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwicXVlcnlQcm9taXNlcyIsIm9iamVjdElkcyIsIiRpbiIsInJlc3BvbnNlcyIsInJlcGxhY2UiLCJpbmNsdWRlUmVzcG9uc2UiLCJvYmoiLCJzZXNzaW9uVG9rZW4iLCJyZXNwIiwicmVwbGFjZVBvaW50ZXJzIiwieCIsImZsYXQiLCJzdWJvYmplY3QiLCJuZXdzdWIiLCJhbnN3ZXIiLCJyb290IiwiaXRlbSIsInN1YmtleSIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi9zcmMvUmVzdFF1ZXJ5LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEFuIG9iamVjdCB0aGF0IGVuY2Fwc3VsYXRlcyBldmVyeXRoaW5nIHdlIG5lZWQgdG8gcnVuIGEgJ2ZpbmQnXG4vLyBvcGVyYXRpb24sIGVuY29kZWQgaW4gdGhlIFJFU1QgQVBJIGZvcm1hdC5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmNvbnN0IHRyaWdnZXJzID0gcmVxdWlyZSgnLi90cmlnZ2VycycpO1xuY29uc3QgeyBjb250aW51ZVdoaWxlIH0gPSByZXF1aXJlKCdwYXJzZS9saWIvbm9kZS9wcm9taXNlVXRpbHMnKTtcbmNvbnN0IEFsd2F5c1NlbGVjdGVkS2V5cyA9IFsnb2JqZWN0SWQnLCAnY3JlYXRlZEF0JywgJ3VwZGF0ZWRBdCcsICdBQ0wnXTtcbmNvbnN0IHsgZW5mb3JjZVJvbGVTZWN1cml0eSB9ID0gcmVxdWlyZSgnLi9TaGFyZWRSZXN0Jyk7XG5cbi8vIHJlc3RPcHRpb25zIGNhbiBpbmNsdWRlOlxuLy8gICBza2lwXG4vLyAgIGxpbWl0XG4vLyAgIG9yZGVyXG4vLyAgIGNvdW50XG4vLyAgIGluY2x1ZGVcbi8vICAga2V5c1xuLy8gICBleGNsdWRlS2V5c1xuLy8gICByZWRpcmVjdENsYXNzTmFtZUZvcktleVxuLy8gICByZWFkUHJlZmVyZW5jZVxuLy8gICBpbmNsdWRlUmVhZFByZWZlcmVuY2Vcbi8vICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZVxuLyoqXG4gKiBVc2UgdG8gcGVyZm9ybSBhIHF1ZXJ5IG9uIGEgY2xhc3MuIEl0IHdpbGwgcnVuIHNlY3VyaXR5IGNoZWNrcyBhbmQgdHJpZ2dlcnMuXG4gKiBAcGFyYW0gb3B0aW9uc1xuICogQHBhcmFtIG9wdGlvbnMubWV0aG9kIHtSZXN0UXVlcnkuTWV0aG9kfSBUaGUgdHlwZSBvZiBxdWVyeSB0byBwZXJmb3JtXG4gKiBAcGFyYW0gb3B0aW9ucy5jb25maWcge1BhcnNlU2VydmVyQ29uZmlndXJhdGlvbn0gVGhlIHNlcnZlciBjb25maWd1cmF0aW9uXG4gKiBAcGFyYW0gb3B0aW9ucy5hdXRoIHtBdXRofSBUaGUgYXV0aCBvYmplY3QgZm9yIHRoZSByZXF1ZXN0XG4gKiBAcGFyYW0gb3B0aW9ucy5jbGFzc05hbWUge3N0cmluZ30gVGhlIG5hbWUgb2YgdGhlIGNsYXNzIHRvIHF1ZXJ5XG4gKiBAcGFyYW0gb3B0aW9ucy5yZXN0V2hlcmUge29iamVjdH0gVGhlIHdoZXJlIG9iamVjdCBmb3IgdGhlIHF1ZXJ5XG4gKiBAcGFyYW0gb3B0aW9ucy5yZXN0T3B0aW9ucyB7b2JqZWN0fSBUaGUgb3B0aW9ucyBvYmplY3QgZm9yIHRoZSBxdWVyeVxuICogQHBhcmFtIG9wdGlvbnMuY2xpZW50U0RLIHtzdHJpbmd9IFRoZSBjbGllbnQgU0RLIHRoYXQgaXMgcGVyZm9ybWluZyB0aGUgcXVlcnlcbiAqIEBwYXJhbSBvcHRpb25zLnJ1bkFmdGVyRmluZCB7Ym9vbGVhbn0gV2hldGhlciB0byBydW4gdGhlIGFmdGVyRmluZCB0cmlnZ2VyXG4gKiBAcGFyYW0gb3B0aW9ucy5ydW5CZWZvcmVGaW5kIHtib29sZWFufSBXaGV0aGVyIHRvIHJ1biB0aGUgYmVmb3JlRmluZCB0cmlnZ2VyXG4gKiBAcGFyYW0gb3B0aW9ucy5jb250ZXh0IHtvYmplY3R9IFRoZSBjb250ZXh0IG9iamVjdCBmb3IgdGhlIHF1ZXJ5XG4gKiBAcmV0dXJucyB7UHJvbWlzZTxfVW5zYWZlUmVzdFF1ZXJ5Pn0gQSBwcm9taXNlIHRoYXQgaXMgcmVzb2x2ZWQgd2l0aCB0aGUgX1Vuc2FmZVJlc3RRdWVyeSBvYmplY3RcbiAqL1xuYXN5bmMgZnVuY3Rpb24gUmVzdFF1ZXJ5KHtcbiAgbWV0aG9kLFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgcmVzdFdoZXJlID0ge30sXG4gIHJlc3RPcHRpb25zID0ge30sXG4gIGNsaWVudFNESyxcbiAgcnVuQWZ0ZXJGaW5kID0gdHJ1ZSxcbiAgcnVuQmVmb3JlRmluZCA9IHRydWUsXG4gIGNvbnRleHQsXG59KSB7XG4gIGlmICghW1Jlc3RRdWVyeS5NZXRob2QuZmluZCwgUmVzdFF1ZXJ5Lk1ldGhvZC5nZXRdLmluY2x1ZGVzKG1ldGhvZCkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2JhZCBxdWVyeSB0eXBlJyk7XG4gIH1cbiAgZW5mb3JjZVJvbGVTZWN1cml0eShtZXRob2QsIGNsYXNzTmFtZSwgYXV0aCk7XG4gIGNvbnN0IHJlc3VsdCA9IHJ1bkJlZm9yZUZpbmRcbiAgICA/IGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuUXVlcnlUcmlnZ2VyKFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRmluZCxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHJlc3RXaGVyZSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgY29uZmlnLFxuICAgICAgYXV0aCxcbiAgICAgIGNvbnRleHQsXG4gICAgICBtZXRob2QgPT09IFJlc3RRdWVyeS5NZXRob2QuZ2V0XG4gICAgKVxuICAgIDogUHJvbWlzZS5yZXNvbHZlKHsgcmVzdFdoZXJlLCByZXN0T3B0aW9ucyB9KTtcblxuICByZXR1cm4gbmV3IF9VbnNhZmVSZXN0UXVlcnkoXG4gICAgY29uZmlnLFxuICAgIGF1dGgsXG4gICAgY2xhc3NOYW1lLFxuICAgIHJlc3VsdC5yZXN0V2hlcmUgfHwgcmVzdFdoZXJlLFxuICAgIHJlc3VsdC5yZXN0T3B0aW9ucyB8fCByZXN0T3B0aW9ucyxcbiAgICBjbGllbnRTREssXG4gICAgcnVuQWZ0ZXJGaW5kLFxuICAgIGNvbnRleHRcbiAgKTtcbn1cblxuUmVzdFF1ZXJ5Lk1ldGhvZCA9IE9iamVjdC5mcmVlemUoe1xuICBnZXQ6ICdnZXQnLFxuICBmaW5kOiAnZmluZCcsXG59KTtcblxuLyoqXG4gKiBfVW5zYWZlUmVzdFF1ZXJ5IGlzIG1lYW50IGZvciBzcGVjaWZpYyBpbnRlcm5hbCB1c2FnZSBvbmx5LiBXaGVuIHlvdSBuZWVkIHRvIHNraXAgc2VjdXJpdHkgY2hlY2tzIG9yIHNvbWUgdHJpZ2dlcnMuXG4gKiBEb24ndCB1c2UgaXQgaWYgeW91IGRvbid0IGtub3cgd2hhdCB5b3UgYXJlIGRvaW5nLlxuICogQHBhcmFtIGNvbmZpZ1xuICogQHBhcmFtIGF1dGhcbiAqIEBwYXJhbSBjbGFzc05hbWVcbiAqIEBwYXJhbSByZXN0V2hlcmVcbiAqIEBwYXJhbSByZXN0T3B0aW9uc1xuICogQHBhcmFtIGNsaWVudFNES1xuICogQHBhcmFtIHJ1bkFmdGVyRmluZFxuICogQHBhcmFtIGNvbnRleHRcbiAqL1xuZnVuY3Rpb24gX1Vuc2FmZVJlc3RRdWVyeShcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSA9IHt9LFxuICByZXN0T3B0aW9ucyA9IHt9LFxuICBjbGllbnRTREssXG4gIHJ1bkFmdGVyRmluZCA9IHRydWUsXG4gIGNvbnRleHRcbikge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMucmVzdFdoZXJlID0gcmVzdFdoZXJlO1xuICB0aGlzLnJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnM7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnJ1bkFmdGVyRmluZCA9IHJ1bkFmdGVyRmluZDtcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG4gIHRoaXMuZmluZE9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0gY29udGV4dCB8fCB7fTtcbiAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT0gJ19TZXNzaW9uJykge1xuICAgICAgaWYgKCF0aGlzLmF1dGgudXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgICB9XG4gICAgICB0aGlzLnJlc3RXaGVyZSA9IHtcbiAgICAgICAgJGFuZDogW1xuICAgICAgICAgIHRoaXMucmVzdFdoZXJlLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVzZXI6IHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICB0aGlzLmRvQ291bnQgPSBmYWxzZTtcbiAgdGhpcy5pbmNsdWRlQWxsID0gZmFsc2U7XG5cbiAgLy8gVGhlIGZvcm1hdCBmb3IgdGhpcy5pbmNsdWRlIGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgZm9ybWF0IGZvciB0aGVcbiAgLy8gaW5jbHVkZSBvcHRpb24gLSBpdCdzIHRoZSBwYXRocyB3ZSBzaG91bGQgaW5jbHVkZSwgaW4gb3JkZXIsXG4gIC8vIHN0b3JlZCBhcyBhcnJheXMsIHRha2luZyBpbnRvIGFjY291bnQgdGhhdCB3ZSBuZWVkIHRvIGluY2x1ZGUgZm9vXG4gIC8vIGJlZm9yZSBpbmNsdWRpbmcgZm9vLmJhci4gQWxzbyBpdCBzaG91bGQgZGVkdXBlLlxuICAvLyBGb3IgZXhhbXBsZSwgcGFzc2luZyBhbiBhcmcgb2YgaW5jbHVkZT1mb28uYmFyLGZvby5iYXogY291bGQgbGVhZCB0b1xuICAvLyB0aGlzLmluY2x1ZGUgPSBbWydmb28nXSwgWydmb28nLCAnYmF6J10sIFsnZm9vJywgJ2JhciddXVxuICB0aGlzLmluY2x1ZGUgPSBbXTtcbiAgbGV0IGtleXNGb3JJbmNsdWRlID0gJyc7XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gU2VlIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvMzE4NVxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAna2V5cycpKSB7XG4gICAga2V5c0ZvckluY2x1ZGUgPSByZXN0T3B0aW9ucy5rZXlzO1xuICB9XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gaW4gb3JkZXIgdG8gZXhjbHVkZSBzcGVjaWZpYyBrZXlzLlxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAnZXhjbHVkZUtleXMnKSkge1xuICAgIGtleXNGb3JJbmNsdWRlICs9ICcsJyArIHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzO1xuICB9XG5cbiAgaWYgKGtleXNGb3JJbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICBrZXlzRm9ySW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlXG4gICAgICAuc3BsaXQoJywnKVxuICAgICAgLmZpbHRlcihrZXkgPT4ge1xuICAgICAgICAvLyBBdCBsZWFzdCAyIGNvbXBvbmVudHNcbiAgICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpLmxlbmd0aCA+IDE7XG4gICAgICB9KVxuICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAvLyBTbGljZSB0aGUgbGFzdCBjb21wb25lbnQgKGEuYi5jIC0+IGEuYilcbiAgICAgICAgLy8gT3RoZXJ3aXNlIHdlJ2xsIGluY2x1ZGUgb25lIGxldmVsIHRvbyBtdWNoLlxuICAgICAgICByZXR1cm4ga2V5LnNsaWNlKDAsIGtleS5sYXN0SW5kZXhPZignLicpKTtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCcpO1xuXG4gICAgLy8gQ29uY2F0IHRoZSBwb3NzaWJseSBwcmVzZW50IGluY2x1ZGUgc3RyaW5nIHdpdGggdGhlIG9uZSBmcm9tIHRoZSBrZXlzXG4gICAgLy8gRGVkdXAgLyBzb3J0aW5nIGlzIGhhbmRsZSBpbiAnaW5jbHVkZScgY2FzZS5cbiAgICBpZiAoa2V5c0ZvckluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKCFyZXN0T3B0aW9ucy5pbmNsdWRlIHx8IHJlc3RPcHRpb25zLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSArPSAnLCcgKyBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmb3IgKHZhciBvcHRpb24gaW4gcmVzdE9wdGlvbnMpIHtcbiAgICBzd2l0Y2ggKG9wdGlvbikge1xuICAgICAgY2FzZSAna2V5cyc6IHtcbiAgICAgICAgY29uc3Qga2V5cyA9IHJlc3RPcHRpb25zLmtleXNcbiAgICAgICAgICAuc3BsaXQoJywnKVxuICAgICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5sZW5ndGggPiAwKVxuICAgICAgICAgIC5jb25jYXQoQWx3YXlzU2VsZWN0ZWRLZXlzKTtcbiAgICAgICAgdGhpcy5rZXlzID0gQXJyYXkuZnJvbShuZXcgU2V0KGtleXMpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdleGNsdWRlS2V5cyc6IHtcbiAgICAgICAgY29uc3QgZXhjbHVkZSA9IHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzXG4gICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAuZmlsdGVyKGsgPT4gQWx3YXlzU2VsZWN0ZWRLZXlzLmluZGV4T2YoaykgPCAwKTtcbiAgICAgICAgdGhpcy5leGNsdWRlS2V5cyA9IEFycmF5LmZyb20obmV3IFNldChleGNsdWRlKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICB0aGlzLmRvQ291bnQgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGVBbGwnOlxuICAgICAgICB0aGlzLmluY2x1ZGVBbGwgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2V4cGxhaW4nOlxuICAgICAgY2FzZSAnaGludCc6XG4gICAgICBjYXNlICdkaXN0aW5jdCc6XG4gICAgICBjYXNlICdwaXBlbGluZSc6XG4gICAgICBjYXNlICdza2lwJzpcbiAgICAgIGNhc2UgJ2xpbWl0JzpcbiAgICAgIGNhc2UgJ3JlYWRQcmVmZXJlbmNlJzpcbiAgICAgICAgdGhpcy5maW5kT3B0aW9uc1tvcHRpb25dID0gcmVzdE9wdGlvbnNbb3B0aW9uXTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdvcmRlcic6XG4gICAgICAgIHZhciBmaWVsZHMgPSByZXN0T3B0aW9ucy5vcmRlci5zcGxpdCgnLCcpO1xuICAgICAgICB0aGlzLmZpbmRPcHRpb25zLnNvcnQgPSBmaWVsZHMucmVkdWNlKChzb3J0TWFwLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGZpZWxkID0gZmllbGQudHJpbSgpO1xuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJyRzY29yZScgfHwgZmllbGQgPT09ICctJHNjb3JlJykge1xuICAgICAgICAgICAgc29ydE1hcC5zY29yZSA9IHsgJG1ldGE6ICd0ZXh0U2NvcmUnIH07XG4gICAgICAgICAgfSBlbHNlIGlmIChmaWVsZFswXSA9PSAnLScpIHtcbiAgICAgICAgICAgIHNvcnRNYXBbZmllbGQuc2xpY2UoMSldID0gLTE7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNvcnRNYXBbZmllbGRdID0gMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHNvcnRNYXA7XG4gICAgICAgIH0sIHt9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlJzoge1xuICAgICAgICBjb25zdCBwYXRocyA9IHJlc3RPcHRpb25zLmluY2x1ZGUuc3BsaXQoJywnKTtcbiAgICAgICAgaWYgKHBhdGhzLmluY2x1ZGVzKCcqJykpIHtcbiAgICAgICAgICB0aGlzLmluY2x1ZGVBbGwgPSB0cnVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIC8vIExvYWQgdGhlIGV4aXN0aW5nIGluY2x1ZGVzIChmcm9tIGtleXMpXG4gICAgICAgIGNvbnN0IHBhdGhTZXQgPSBwYXRocy5yZWR1Y2UoKG1lbW8sIHBhdGgpID0+IHtcbiAgICAgICAgICAvLyBTcGxpdCBlYWNoIHBhdGhzIG9uIC4gKGEuYi5jIC0+IFthLGIsY10pXG4gICAgICAgICAgLy8gcmVkdWNlIHRvIGNyZWF0ZSBhbGwgcGF0aHNcbiAgICAgICAgICAvLyAoW2EsYixjXSAtPiB7YTogdHJ1ZSwgJ2EuYic6IHRydWUsICdhLmIuYyc6IHRydWV9KVxuICAgICAgICAgIHJldHVybiBwYXRoLnNwbGl0KCcuJykucmVkdWNlKChtZW1vLCBwYXRoLCBpbmRleCwgcGFydHMpID0+IHtcbiAgICAgICAgICAgIG1lbW9bcGFydHMuc2xpY2UoMCwgaW5kZXggKyAxKS5qb2luKCcuJyldID0gdHJ1ZTtcbiAgICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICAgIH0sIG1lbW8pO1xuICAgICAgICB9LCB7fSk7XG5cbiAgICAgICAgdGhpcy5pbmNsdWRlID0gT2JqZWN0LmtleXMocGF0aFNldClcbiAgICAgICAgICAubWFwKHMgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHMuc3BsaXQoJy4nKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gYS5sZW5ndGggLSBiLmxlbmd0aDsgLy8gU29ydCBieSBudW1iZXIgb2YgY29tcG9uZW50c1xuICAgICAgICAgIH0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ3JlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5JzpcbiAgICAgICAgdGhpcy5yZWRpcmVjdEtleSA9IHJlc3RPcHRpb25zLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5O1xuICAgICAgICB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lID0gbnVsbDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlUmVhZFByZWZlcmVuY2UnOlxuICAgICAgY2FzZSAnc3VicXVlcnlSZWFkUHJlZmVyZW5jZSc6XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCBvcHRpb246ICcgKyBvcHRpb24pO1xuICAgIH1cbiAgfVxufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIGEgcXVlcnlcbi8vIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXNwb25zZSAtIGFuIG9iamVjdCB3aXRoIG9wdGlvbmFsIGtleXNcbi8vICdyZXN1bHRzJyBhbmQgJ2NvdW50Jy5cbi8vIFRPRE86IGNvbnNvbGlkYXRlIHRoZSByZXBsYWNlWCBmdW5jdGlvbnNcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoZXhlY3V0ZU9wdGlvbnMpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuYnVpbGRSZXN0V2hlcmUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbnlQcm90ZWN0ZWRGaWVsZHMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGVBbGwoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUV4Y2x1ZGVLZXlzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5GaW5kKGV4ZWN1dGVPcHRpb25zKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkNvdW50KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlckZpbmRUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVBdXRoQWRhcHRlcnMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlc3BvbnNlO1xuICAgIH0pO1xufTtcblxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuZWFjaCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICBjb25zdCB7IGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCByZXN0V2hlcmUsIHJlc3RPcHRpb25zLCBjbGllbnRTREsgfSA9IHRoaXM7XG4gIC8vIGlmIHRoZSBsaW1pdCBpcyBzZXQsIHVzZSBpdFxuICByZXN0T3B0aW9ucy5saW1pdCA9IHJlc3RPcHRpb25zLmxpbWl0IHx8IDEwMDtcbiAgcmVzdE9wdGlvbnMub3JkZXIgPSAnb2JqZWN0SWQnO1xuICBsZXQgZmluaXNoZWQgPSBmYWxzZTtcblxuICByZXR1cm4gY29udGludWVXaGlsZShcbiAgICAoKSA9PiB7XG4gICAgICByZXR1cm4gIWZpbmlzaGVkO1xuICAgIH0sXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gU2FmZSBoZXJlIHRvIHVzZSBfVW5zYWZlUmVzdFF1ZXJ5IGJlY2F1c2UgdGhlIHNlY3VyaXR5IHdhcyBhbHJlYWR5XG4gICAgICAvLyBjaGVja2VkIGR1cmluZyBcImF3YWl0IFJlc3RRdWVyeSgpXCJcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gbmV3IF9VbnNhZmVSZXN0UXVlcnkoXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgICBjbGllbnRTREssXG4gICAgICAgIHRoaXMucnVuQWZ0ZXJGaW5kLFxuICAgICAgICB0aGlzLmNvbnRleHRcbiAgICAgICk7XG4gICAgICBjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKTtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChjYWxsYmFjayk7XG4gICAgICBmaW5pc2hlZCA9IHJlc3VsdHMubGVuZ3RoIDwgcmVzdE9wdGlvbnMubGltaXQ7XG4gICAgICBpZiAoIWZpbmlzaGVkKSB7XG4gICAgICAgIHJlc3RXaGVyZS5vYmplY3RJZCA9IE9iamVjdC5hc3NpZ24oe30sIHJlc3RXaGVyZS5vYmplY3RJZCwge1xuICAgICAgICAgICRndDogcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdLm9iamVjdElkLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5idWlsZFJlc3RXaGVyZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VEb250U2VsZWN0KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZU5vdEluUXVlcnkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VFcXVhbGl0eSgpO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5nZXRVc2VyQW5kUm9sZUFDTCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIHRoaXMuZmluZE9wdGlvbnMuYWNsID0gWycqJ107XG5cbiAgaWYgKHRoaXMuYXV0aC51c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC5nZXRVc2VyUm9sZXMoKS50aGVuKHJvbGVzID0+IHtcbiAgICAgIHRoaXMuZmluZE9wdGlvbnMuYWNsID0gdGhpcy5maW5kT3B0aW9ucy5hY2wuY29uY2F0KHJvbGVzLCBbdGhpcy5hdXRoLnVzZXIuaWRdKTtcbiAgICAgIHJldHVybjtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIENoYW5nZXMgdGhlIGNsYXNzTmFtZSBpZiByZWRpcmVjdENsYXNzTmFtZUZvcktleSBpcyBzZXQuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVkaXJlY3RLZXkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXZSBuZWVkIHRvIGNoYW5nZSB0aGUgY2xhc3MgbmFtZSBiYXNlZCBvbiB0aGUgc2NoZW1hXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5yZWRpcmVjdENsYXNzTmFtZUZvcktleSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5yZWRpcmVjdEtleSlcbiAgICAudGhlbihuZXdDbGFzc05hbWUgPT4ge1xuICAgICAgdGhpcy5jbGFzc05hbWUgPSBuZXdDbGFzc05hbWU7XG4gICAgICB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lID0gbmV3Q2xhc3NOYW1lO1xuICAgIH0pO1xufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChcbiAgICB0aGlzLmNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT09IGZhbHNlICYmXG4gICAgIXRoaXMuYXV0aC5pc01hc3RlciAmJlxuICAgIFNjaGVtYUNvbnRyb2xsZXIuc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKHRoaXMuY2xhc3NOYW1lKSA9PT0gLTFcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuaGFzQ2xhc3ModGhpcy5jbGFzc05hbWUpKVxuICAgICAgLnRoZW4oaGFzQ2xhc3MgPT4ge1xuICAgICAgICBpZiAoaGFzQ2xhc3MgIT09IHRydWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgJ1RoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBhY2Nlc3MgJyArICdub24tZXhpc3RlbnQgY2xhc3M6ICcgKyB0aGlzLmNsYXNzTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtSW5RdWVyeShpblF1ZXJ5T2JqZWN0LCBjbGFzc05hbWUsIHJlc3VsdHMpIHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgIHZhbHVlcy5wdXNoKHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogcmVzdWx0Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGRlbGV0ZSBpblF1ZXJ5T2JqZWN0WyckaW5RdWVyeSddO1xuICBpZiAoQXJyYXkuaXNBcnJheShpblF1ZXJ5T2JqZWN0WyckaW4nXSkpIHtcbiAgICBpblF1ZXJ5T2JqZWN0WyckaW4nXSA9IGluUXVlcnlPYmplY3RbJyRpbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIGluUXVlcnlPYmplY3RbJyRpbiddID0gdmFsdWVzO1xuICB9XG59XG5cbi8vIFJlcGxhY2VzIGEgJGluUXVlcnkgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhblxuLy8gJGluUXVlcnkgY2xhdXNlLlxuLy8gVGhlICRpblF1ZXJ5IGNsYXVzZSB0dXJucyBpbnRvIGFuICRpbiB3aXRoIHZhbHVlcyB0aGF0IGFyZSBqdXN0XG4vLyBwb2ludGVycyB0byB0aGUgb2JqZWN0cyByZXR1cm5lZCBpbiB0aGUgc3VicXVlcnkuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlSW5RdWVyeSA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgdmFyIGluUXVlcnlPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRpblF1ZXJ5Jyk7XG4gIGlmICghaW5RdWVyeU9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBpblF1ZXJ5IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSB3aGVyZSBhbmQgY2xhc3NOYW1lXG4gIHZhciBpblF1ZXJ5VmFsdWUgPSBpblF1ZXJ5T2JqZWN0WyckaW5RdWVyeSddO1xuICBpZiAoIWluUXVlcnlWYWx1ZS53aGVyZSB8fCAhaW5RdWVyeVZhbHVlLmNsYXNzTmFtZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJGluUXVlcnknKTtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBpblF1ZXJ5VmFsdWUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIGNvbnN0IHN1YnF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgIGF1dGg6IHRoaXMuYXV0aCxcbiAgICBjbGFzc05hbWU6IGluUXVlcnlWYWx1ZS5jbGFzc05hbWUsXG4gICAgcmVzdFdoZXJlOiBpblF1ZXJ5VmFsdWUud2hlcmUsXG4gICAgcmVzdE9wdGlvbnM6IGFkZGl0aW9uYWxPcHRpb25zLFxuICAgIGNvbnRleHQ6IHRoaXMuY29udGV4dCxcbiAgfSk7XG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtSW5RdWVyeShpblF1ZXJ5T2JqZWN0LCBzdWJxdWVyeS5jbGFzc05hbWUsIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIFJlY3Vyc2UgdG8gcmVwZWF0XG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZUluUXVlcnkoKTtcbiAgfSk7XG59O1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1Ob3RJblF1ZXJ5KG5vdEluUXVlcnlPYmplY3QsIGNsYXNzTmFtZSwgcmVzdWx0cykge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgdmFsdWVzLnB1c2goe1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgIG9iamVjdElkOiByZXN1bHQub2JqZWN0SWQsXG4gICAgfSk7XG4gIH1cbiAgZGVsZXRlIG5vdEluUXVlcnlPYmplY3RbJyRub3RJblF1ZXJ5J107XG4gIGlmIChBcnJheS5pc0FycmF5KG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSkpIHtcbiAgICBub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10gPSBub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgbm90SW5RdWVyeU9iamVjdFsnJG5pbiddID0gdmFsdWVzO1xuICB9XG59XG5cbi8vIFJlcGxhY2VzIGEgJG5vdEluUXVlcnkgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhblxuLy8gJG5vdEluUXVlcnkgY2xhdXNlLlxuLy8gVGhlICRub3RJblF1ZXJ5IGNsYXVzZSB0dXJucyBpbnRvIGEgJG5pbiB3aXRoIHZhbHVlcyB0aGF0IGFyZSBqdXN0XG4vLyBwb2ludGVycyB0byB0aGUgb2JqZWN0cyByZXR1cm5lZCBpbiB0aGUgc3VicXVlcnkuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlTm90SW5RdWVyeSA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgdmFyIG5vdEluUXVlcnlPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRub3RJblF1ZXJ5Jyk7XG4gIGlmICghbm90SW5RdWVyeU9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBub3RJblF1ZXJ5IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSB3aGVyZSBhbmQgY2xhc3NOYW1lXG4gIHZhciBub3RJblF1ZXJ5VmFsdWUgPSBub3RJblF1ZXJ5T2JqZWN0Wyckbm90SW5RdWVyeSddO1xuICBpZiAoIW5vdEluUXVlcnlWYWx1ZS53aGVyZSB8fCAhbm90SW5RdWVyeVZhbHVlLmNsYXNzTmFtZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJG5vdEluUXVlcnknKTtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBub3RJblF1ZXJ5VmFsdWUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIGNvbnN0IHN1YnF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgIGF1dGg6IHRoaXMuYXV0aCxcbiAgICBjbGFzc05hbWU6IG5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUsXG4gICAgcmVzdFdoZXJlOiBub3RJblF1ZXJ5VmFsdWUud2hlcmUsXG4gICAgcmVzdE9wdGlvbnM6IGFkZGl0aW9uYWxPcHRpb25zLFxuICAgIGNvbnRleHQ6IHRoaXMuY29udGV4dCxcbiAgfSk7XG5cbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1Ob3RJblF1ZXJ5KG5vdEluUXVlcnlPYmplY3QsIHN1YnF1ZXJ5LmNsYXNzTmFtZSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gUmVjdXJzZSB0byByZXBlYXRcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlTm90SW5RdWVyeSgpO1xuICB9KTtcbn07XG5cbi8vIFVzZWQgdG8gZ2V0IHRoZSBkZWVwZXN0IG9iamVjdCBmcm9tIGpzb24gdXNpbmcgZG90IG5vdGF0aW9uLlxuY29uc3QgZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkgPSAoanNvbiwga2V5LCBpZHgsIHNyYykgPT4ge1xuICBpZiAoa2V5IGluIGpzb24pIHtcbiAgICByZXR1cm4ganNvbltrZXldO1xuICB9XG4gIHNyYy5zcGxpY2UoMSk7IC8vIEV4aXQgRWFybHlcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVNlbGVjdCA9IChzZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgc2VsZWN0T2JqZWN0Wyckc2VsZWN0J107XG4gIGlmIChBcnJheS5pc0FycmF5KHNlbGVjdE9iamVjdFsnJGluJ10pKSB7XG4gICAgc2VsZWN0T2JqZWN0WyckaW4nXSA9IHNlbGVjdE9iamVjdFsnJGluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgc2VsZWN0T2JqZWN0WyckaW4nXSA9IHZhbHVlcztcbiAgfVxufTtcblxuLy8gUmVwbGFjZXMgYSAkc2VsZWN0IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYVxuLy8gJHNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJHNlbGVjdCBjbGF1c2UgdHVybnMgaW50byBhbiAkaW4gd2l0aCB2YWx1ZXMgc2VsZWN0ZWQgb3V0IG9mXG4vLyB0aGUgc3VicXVlcnkuXG4vLyBSZXR1cm5zIGEgcG9zc2libGUtcHJvbWlzZS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VTZWxlY3QgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRzZWxlY3QnKTtcbiAgaWYgKCFzZWxlY3RPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgc2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBzZWxlY3RWYWx1ZSA9IHNlbGVjdE9iamVjdFsnJHNlbGVjdCddO1xuICAvLyBpT1MgU0RLIGRvbid0IHNlbmQgd2hlcmUgaWYgbm90IHNldCwgbGV0IGl0IHBhc3NcbiAgaWYgKFxuICAgICFzZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFzZWxlY3RWYWx1ZS5rZXkgfHxcbiAgICB0eXBlb2Ygc2VsZWN0VmFsdWUucXVlcnkgIT09ICdvYmplY3QnIHx8XG4gICAgIXNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKHNlbGVjdFZhbHVlKS5sZW5ndGggIT09IDJcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkc2VsZWN0Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogc2VsZWN0VmFsdWUucXVlcnkucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIGNvbnN0IHN1YnF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgIGF1dGg6IHRoaXMuYXV0aCxcbiAgICBjbGFzc05hbWU6IHNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSxcbiAgICByZXN0V2hlcmU6IHNlbGVjdFZhbHVlLnF1ZXJ5LndoZXJlLFxuICAgIHJlc3RPcHRpb25zOiBhZGRpdGlvbmFsT3B0aW9ucyxcbiAgICBjb250ZXh0OiB0aGlzLmNvbnRleHQsXG4gIH0pO1xuXG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtU2VsZWN0KHNlbGVjdE9iamVjdCwgc2VsZWN0VmFsdWUua2V5LCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBLZWVwIHJlcGxhY2luZyAkc2VsZWN0IGNsYXVzZXNcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlU2VsZWN0KCk7XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG9udFNlbGVjdCA9IChkb250U2VsZWN0T2JqZWN0LCBrZXksIG9iamVjdHMpID0+IHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2Ygb2JqZWN0cykge1xuICAgIHZhbHVlcy5wdXNoKGtleS5zcGxpdCgnLicpLnJlZHVjZShnZXREZWVwZXN0T2JqZWN0RnJvbUtleSwgcmVzdWx0KSk7XG4gIH1cbiAgZGVsZXRlIGRvbnRTZWxlY3RPYmplY3RbJyRkb250U2VsZWN0J107XG4gIGlmIChBcnJheS5pc0FycmF5KGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSkpIHtcbiAgICBkb250U2VsZWN0T2JqZWN0WyckbmluJ10gPSBkb250U2VsZWN0T2JqZWN0WyckbmluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgZG9udFNlbGVjdE9iamVjdFsnJG5pbiddID0gdmFsdWVzO1xuICB9XG59O1xuXG4vLyBSZXBsYWNlcyBhICRkb250U2VsZWN0IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYVxuLy8gJGRvbnRTZWxlY3QgY2xhdXNlLlxuLy8gVGhlICRkb250U2VsZWN0IGNsYXVzZSB0dXJucyBpbnRvIGFuICRuaW4gd2l0aCB2YWx1ZXMgc2VsZWN0ZWQgb3V0IG9mXG4vLyB0aGUgc3VicXVlcnkuXG4vLyBSZXR1cm5zIGEgcG9zc2libGUtcHJvbWlzZS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VEb250U2VsZWN0ID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICB2YXIgZG9udFNlbGVjdE9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGRvbnRTZWxlY3QnKTtcbiAgaWYgKCFkb250U2VsZWN0T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGRvbnRTZWxlY3QgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHF1ZXJ5IGFuZCBrZXlcbiAgdmFyIGRvbnRTZWxlY3RWYWx1ZSA9IGRvbnRTZWxlY3RPYmplY3RbJyRkb250U2VsZWN0J107XG4gIGlmIChcbiAgICAhZG9udFNlbGVjdFZhbHVlLnF1ZXJ5IHx8XG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5rZXkgfHxcbiAgICB0eXBlb2YgZG9udFNlbGVjdFZhbHVlLnF1ZXJ5ICE9PSAnb2JqZWN0JyB8fFxuICAgICFkb250U2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lIHx8XG4gICAgT2JqZWN0LmtleXMoZG9udFNlbGVjdFZhbHVlKS5sZW5ndGggIT09IDJcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkZG9udFNlbGVjdCcpO1xuICB9XG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBkb250U2VsZWN0VmFsdWUucXVlcnkucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIGNvbnN0IHN1YnF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgIGF1dGg6IHRoaXMuYXV0aCxcbiAgICBjbGFzc05hbWU6IGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUsXG4gICAgcmVzdFdoZXJlOiBkb250U2VsZWN0VmFsdWUucXVlcnkud2hlcmUsXG4gICAgcmVzdE9wdGlvbnM6IGFkZGl0aW9uYWxPcHRpb25zLFxuICAgIGNvbnRleHQ6IHRoaXMuY29udGV4dCxcbiAgfSk7XG5cbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1Eb250U2VsZWN0KGRvbnRTZWxlY3RPYmplY3QsIGRvbnRTZWxlY3RWYWx1ZS5rZXksIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIEtlZXAgcmVwbGFjaW5nICRkb250U2VsZWN0IGNsYXVzZXNcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlRG9udFNlbGVjdCgpO1xuICB9KTtcbn07XG5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmNsZWFuUmVzdWx0QXV0aERhdGEgPSBmdW5jdGlvbiAocmVzdWx0KSB7XG4gIGRlbGV0ZSByZXN1bHQucGFzc3dvcmQ7XG4gIGlmIChyZXN1bHQuYXV0aERhdGEpIHtcbiAgICBPYmplY3Qua2V5cyhyZXN1bHQuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgaWYgKHJlc3VsdC5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIHJlc3VsdC5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoT2JqZWN0LmtleXMocmVzdWx0LmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgZGVsZXRlIHJlc3VsdC5hdXRoRGF0YTtcbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHJlcGxhY2VFcXVhbGl0eUNvbnN0cmFpbnQgPSBjb25zdHJhaW50ID0+IHtcbiAgaWYgKHR5cGVvZiBjb25zdHJhaW50ICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBjb25zdHJhaW50O1xuICB9XG4gIGNvbnN0IGVxdWFsVG9PYmplY3QgPSB7fTtcbiAgbGV0IGhhc0RpcmVjdENvbnN0cmFpbnQgPSBmYWxzZTtcbiAgbGV0IGhhc09wZXJhdG9yQ29uc3RyYWludCA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IGtleSBpbiBjb25zdHJhaW50KSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCckJykgIT09IDApIHtcbiAgICAgIGhhc0RpcmVjdENvbnN0cmFpbnQgPSB0cnVlO1xuICAgICAgZXF1YWxUb09iamVjdFtrZXldID0gY29uc3RyYWludFtrZXldO1xuICAgIH0gZWxzZSB7XG4gICAgICBoYXNPcGVyYXRvckNvbnN0cmFpbnQgPSB0cnVlO1xuICAgIH1cbiAgfVxuICBpZiAoaGFzRGlyZWN0Q29uc3RyYWludCAmJiBoYXNPcGVyYXRvckNvbnN0cmFpbnQpIHtcbiAgICBjb25zdHJhaW50WyckZXEnXSA9IGVxdWFsVG9PYmplY3Q7XG4gICAgT2JqZWN0LmtleXMoZXF1YWxUb09iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgZGVsZXRlIGNvbnN0cmFpbnRba2V5XTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gY29uc3RyYWludDtcbn07XG5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VFcXVhbGl0eSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHR5cGVvZiB0aGlzLnJlc3RXaGVyZSAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gdGhpcy5yZXN0V2hlcmUpIHtcbiAgICB0aGlzLnJlc3RXaGVyZVtrZXldID0gcmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCh0aGlzLnJlc3RXaGVyZVtrZXldKTtcbiAgfVxufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZXRoZXIgaXQgd2FzIHN1Y2Nlc3NmdWwuXG4vLyBQb3B1bGF0ZXMgdGhpcy5yZXNwb25zZSB3aXRoIGFuIG9iamVjdCB0aGF0IG9ubHkgaGFzICdyZXN1bHRzJy5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJ1bkZpbmQgPSBmdW5jdGlvbiAob3B0aW9ucyA9IHt9KSB7XG4gIGlmICh0aGlzLmZpbmRPcHRpb25zLmxpbWl0ID09PSAwKSB7XG4gICAgdGhpcy5yZXNwb25zZSA9IHsgcmVzdWx0czogW10gfTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgY29uc3QgZmluZE9wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmZpbmRPcHRpb25zKTtcbiAgaWYgKHRoaXMua2V5cykge1xuICAgIGZpbmRPcHRpb25zLmtleXMgPSB0aGlzLmtleXMubWFwKGtleSA9PiB7XG4gICAgICByZXR1cm4ga2V5LnNwbGl0KCcuJylbMF07XG4gICAgfSk7XG4gIH1cbiAgaWYgKG9wdGlvbnMub3ApIHtcbiAgICBmaW5kT3B0aW9ucy5vcCA9IG9wdGlvbnMub3A7XG4gIH1cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQodGhpcy5jbGFzc05hbWUsIHRoaXMucmVzdFdoZXJlLCBmaW5kT3B0aW9ucywgdGhpcy5hdXRoKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmICFmaW5kT3B0aW9ucy5leHBsYWluKSB7XG4gICAgICAgIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgdGhpcy5jbGVhblJlc3VsdEF1dGhEYXRhKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHJlc3VsdHMpO1xuXG4gICAgICBpZiAodGhpcy5yZWRpcmVjdENsYXNzTmFtZSkge1xuICAgICAgICBmb3IgKHZhciByIG9mIHJlc3VsdHMpIHtcbiAgICAgICAgICByLmNsYXNzTmFtZSA9IHRoaXMucmVkaXJlY3RDbGFzc05hbWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3VsdHM6IHJlc3VsdHMgfTtcbiAgICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGV0aGVyIGl0IHdhcyBzdWNjZXNzZnVsLlxuLy8gUG9wdWxhdGVzIHRoaXMucmVzcG9uc2UuY291bnQgd2l0aCB0aGUgY291bnRcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJ1bkNvdW50ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZG9Db3VudCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmZpbmRPcHRpb25zLmNvdW50ID0gdHJ1ZTtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMuc2tpcDtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMubGltaXQ7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgdGhpcy5maW5kT3B0aW9ucykudGhlbihjID0+IHtcbiAgICB0aGlzLnJlc3BvbnNlLmNvdW50ID0gYztcbiAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5kZW55UHJvdGVjdGVkRmllbGRzID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHNjaGVtYUNvbnRyb2xsZXIgPSBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCk7XG4gIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9XG4gICAgdGhpcy5jb25maWcuZGF0YWJhc2UuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdGhpcy5yZXN0V2hlcmUsXG4gICAgICB0aGlzLmZpbmRPcHRpb25zLmFjbCxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHRoaXMuZmluZE9wdGlvbnNcbiAgICApIHx8IFtdO1xuICBmb3IgKGNvbnN0IGtleSBvZiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICBpZiAodGhpcy5yZXN0V2hlcmVba2V5XSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIHF1ZXJ5ICR7a2V5fSBvbiBjbGFzcyAke3RoaXMuY2xhc3NOYW1lfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG59O1xuXG4vLyBBdWdtZW50cyB0aGlzLnJlc3BvbnNlIHdpdGggYWxsIHBvaW50ZXJzIG9uIGFuIG9iamVjdFxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuaGFuZGxlSW5jbHVkZUFsbCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmluY2x1ZGVBbGwpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmxvYWRTY2hlbWEoKVxuICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEodGhpcy5jbGFzc05hbWUpKVxuICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICBjb25zdCBpbmNsdWRlRmllbGRzID0gW107XG4gICAgICBjb25zdCBrZXlGaWVsZHMgPSBbXTtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc2NoZW1hLmZpZWxkcykge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB8fFxuICAgICAgICAgIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdBcnJheScpXG4gICAgICAgICkge1xuICAgICAgICAgIGluY2x1ZGVGaWVsZHMucHVzaChbZmllbGRdKTtcbiAgICAgICAgICBrZXlGaWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIEFkZCBmaWVsZHMgdG8gaW5jbHVkZSwga2V5cywgcmVtb3ZlIGR1cHNcbiAgICAgIHRoaXMuaW5jbHVkZSA9IFsuLi5uZXcgU2V0KFsuLi50aGlzLmluY2x1ZGUsIC4uLmluY2x1ZGVGaWVsZHNdKV07XG4gICAgICAvLyBpZiB0aGlzLmtleXMgbm90IHNldCwgdGhlbiBhbGwga2V5cyBhcmUgYWxyZWFkeSBpbmNsdWRlZFxuICAgICAgaWYgKHRoaXMua2V5cykge1xuICAgICAgICB0aGlzLmtleXMgPSBbLi4ubmV3IFNldChbLi4udGhpcy5rZXlzLCAuLi5rZXlGaWVsZHNdKV07XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG4vLyBVcGRhdGVzIHByb3BlcnR5IGB0aGlzLmtleXNgIHRvIGNvbnRhaW4gYWxsIGtleXMgYnV0IHRoZSBvbmVzIHVuc2VsZWN0ZWQuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVFeGNsdWRlS2V5cyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmV4Y2x1ZGVLZXlzKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICB0aGlzLmtleXMgPSB0aGlzLmtleXMuZmlsdGVyKGsgPT4gIXRoaXMuZXhjbHVkZUtleXMuaW5jbHVkZXMoaykpO1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpO1xuICAgICAgdGhpcy5rZXlzID0gZmllbGRzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICB9KTtcbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBkYXRhIGF0IHRoZSBwYXRocyBwcm92aWRlZCBpbiB0aGlzLmluY2x1ZGUuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pbmNsdWRlLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHBhdGhSZXNwb25zZSA9IGluY2x1ZGVQYXRoKFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICB0aGlzLnJlc3BvbnNlLFxuICAgIHRoaXMuaW5jbHVkZVswXSxcbiAgICB0aGlzLmNvbnRleHQsXG4gICAgdGhpcy5yZXN0T3B0aW9uc1xuICApO1xuICBpZiAocGF0aFJlc3BvbnNlLnRoZW4pIHtcbiAgICByZXR1cm4gcGF0aFJlc3BvbnNlLnRoZW4obmV3UmVzcG9uc2UgPT4ge1xuICAgICAgdGhpcy5yZXNwb25zZSA9IG5ld1Jlc3BvbnNlO1xuICAgICAgdGhpcy5pbmNsdWRlID0gdGhpcy5pbmNsdWRlLnNsaWNlKDEpO1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZSgpO1xuICAgIH0pO1xuICB9IGVsc2UgaWYgKHRoaXMuaW5jbHVkZS5sZW5ndGggPiAwKSB7XG4gICAgdGhpcy5pbmNsdWRlID0gdGhpcy5pbmNsdWRlLnNsaWNlKDEpO1xuICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgfVxuXG4gIHJldHVybiBwYXRoUmVzcG9uc2U7XG59O1xuXG4vL1JldHVybnMgYSBwcm9taXNlIG9mIGEgcHJvY2Vzc2VkIHNldCBvZiByZXN1bHRzXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5BZnRlckZpbmRUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF0aGlzLnJ1bkFmdGVyRmluZCkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlckZpbmQnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyRmluZEhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGlmICghaGFzQWZ0ZXJGaW5kSG9vaykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBTa2lwIEFnZ3JlZ2F0ZSBhbmQgRGlzdGluY3QgUXVlcmllc1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5waXBlbGluZSB8fCB0aGlzLmZpbmRPcHRpb25zLmRpc3RpbmN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMucmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gdGhpcy5yZXN0V2hlcmU7XG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuICAvLyBSdW4gYWZ0ZXJGaW5kIHRyaWdnZXIgYW5kIHNldCB0aGUgbmV3IHJlc3VsdHNcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzLFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICBwYXJzZVF1ZXJ5LFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gRW5zdXJlIHdlIHByb3Blcmx5IHNldCB0aGUgY2xhc3NOYW1lIGJhY2tcbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICAgICAgb2JqZWN0ID0gb2JqZWN0LnRvSlNPTigpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3QuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHM7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVBdXRoQWRhcHRlcnMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCB0aGlzLmZpbmRPcHRpb25zLmV4cGxhaW4pIHtcbiAgICByZXR1cm47XG4gIH1cbiAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzLm1hcChyZXN1bHQgPT5cbiAgICAgIHRoaXMuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5ydW5BZnRlckZpbmQoXG4gICAgICAgIHsgY29uZmlnOiB0aGlzLmNvbmZpZywgYXV0aDogdGhpcy5hdXRoIH0sXG4gICAgICAgIHJlc3VsdC5hdXRoRGF0YVxuICAgICAgKVxuICAgIClcbiAgKTtcbn07XG5cbi8vIEFkZHMgaW5jbHVkZWQgdmFsdWVzIHRvIHRoZSByZXNwb25zZS5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkIG5hbWVzLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGFuIGF1Z21lbnRlZCByZXNwb25zZS5cbmZ1bmN0aW9uIGluY2x1ZGVQYXRoKGNvbmZpZywgYXV0aCwgcmVzcG9uc2UsIHBhdGgsIGNvbnRleHQsIHJlc3RPcHRpb25zID0ge30pIHtcbiAgdmFyIHBvaW50ZXJzID0gZmluZFBvaW50ZXJzKHJlc3BvbnNlLnJlc3VsdHMsIHBhdGgpO1xuICBpZiAocG9pbnRlcnMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cbiAgY29uc3QgcG9pbnRlcnNIYXNoID0ge307XG4gIGZvciAodmFyIHBvaW50ZXIgb2YgcG9pbnRlcnMpIHtcbiAgICBpZiAoIXBvaW50ZXIpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc05hbWUgPSBwb2ludGVyLmNsYXNzTmFtZTtcbiAgICAvLyBvbmx5IGluY2x1ZGUgdGhlIGdvb2QgcG9pbnRlcnNcbiAgICBpZiAoY2xhc3NOYW1lKSB7XG4gICAgICBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSA9IHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdIHx8IG5ldyBTZXQoKTtcbiAgICAgIHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdLmFkZChwb2ludGVyLm9iamVjdElkKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgaW5jbHVkZVJlc3RPcHRpb25zID0ge307XG4gIGlmIChyZXN0T3B0aW9ucy5rZXlzKSB7XG4gICAgY29uc3Qga2V5cyA9IG5ldyBTZXQocmVzdE9wdGlvbnMua2V5cy5zcGxpdCgnLCcpKTtcbiAgICBjb25zdCBrZXlTZXQgPSBBcnJheS5mcm9tKGtleXMpLnJlZHVjZSgoc2V0LCBrZXkpID0+IHtcbiAgICAgIGNvbnN0IGtleVBhdGggPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgIGxldCBpID0gMDtcbiAgICAgIGZvciAoaTsgaSA8IHBhdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHBhdGhbaV0gIT0ga2V5UGF0aFtpXSkge1xuICAgICAgICAgIHJldHVybiBzZXQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChpIDwga2V5UGF0aC5sZW5ndGgpIHtcbiAgICAgICAgc2V0LmFkZChrZXlQYXRoW2ldKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzZXQ7XG4gICAgfSwgbmV3IFNldCgpKTtcbiAgICBpZiAoa2V5U2V0LnNpemUgPiAwKSB7XG4gICAgICBpbmNsdWRlUmVzdE9wdGlvbnMua2V5cyA9IEFycmF5LmZyb20oa2V5U2V0KS5qb2luKCcsJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzKSB7XG4gICAgY29uc3QgZXhjbHVkZUtleXMgPSBuZXcgU2V0KHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzLnNwbGl0KCcsJykpO1xuICAgIGNvbnN0IGV4Y2x1ZGVLZXlTZXQgPSBBcnJheS5mcm9tKGV4Y2x1ZGVLZXlzKS5yZWR1Y2UoKHNldCwga2V5KSA9PiB7XG4gICAgICBjb25zdCBrZXlQYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICBsZXQgaSA9IDA7XG4gICAgICBmb3IgKGk7IGkgPCBwYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChwYXRoW2ldICE9IGtleVBhdGhbaV0pIHtcbiAgICAgICAgICByZXR1cm4gc2V0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaSA9PSBrZXlQYXRoLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgc2V0LmFkZChrZXlQYXRoW2ldKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzZXQ7XG4gICAgfSwgbmV3IFNldCgpKTtcbiAgICBpZiAoZXhjbHVkZUtleVNldC5zaXplID4gMCkge1xuICAgICAgaW5jbHVkZVJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzID0gQXJyYXkuZnJvbShleGNsdWRlS2V5U2V0KS5qb2luKCcsJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSkge1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBjb25zdCBxdWVyeVByb21pc2VzID0gT2JqZWN0LmtleXMocG9pbnRlcnNIYXNoKS5tYXAoYXN5bmMgY2xhc3NOYW1lID0+IHtcbiAgICBjb25zdCBvYmplY3RJZHMgPSBBcnJheS5mcm9tKHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdKTtcbiAgICBsZXQgd2hlcmU7XG4gICAgaWYgKG9iamVjdElkcy5sZW5ndGggPT09IDEpIHtcbiAgICAgIHdoZXJlID0geyBvYmplY3RJZDogb2JqZWN0SWRzWzBdIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHdoZXJlID0geyBvYmplY3RJZDogeyAkaW46IG9iamVjdElkcyB9IH07XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogb2JqZWN0SWRzLmxlbmd0aCA9PT0gMSA/IFJlc3RRdWVyeS5NZXRob2QuZ2V0IDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgICAgY29uZmlnLFxuICAgICAgYXV0aCxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHJlc3RXaGVyZTogd2hlcmUsXG4gICAgICByZXN0T3B0aW9uczogaW5jbHVkZVJlc3RPcHRpb25zLFxuICAgICAgY29udGV4dDogY29udGV4dCxcbiAgICB9KTtcbiAgICByZXR1cm4gcXVlcnkuZXhlY3V0ZSh7IG9wOiAnZ2V0JyB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdHMpO1xuICAgIH0pO1xuICB9KTtcblxuICAvLyBHZXQgdGhlIG9iamVjdHMgZm9yIGFsbCB0aGVzZSBvYmplY3QgaWRzXG4gIHJldHVybiBQcm9taXNlLmFsbChxdWVyeVByb21pc2VzKS50aGVuKHJlc3BvbnNlcyA9PiB7XG4gICAgdmFyIHJlcGxhY2UgPSByZXNwb25zZXMucmVkdWNlKChyZXBsYWNlLCBpbmNsdWRlUmVzcG9uc2UpID0+IHtcbiAgICAgIGZvciAodmFyIG9iaiBvZiBpbmNsdWRlUmVzcG9uc2UucmVzdWx0cykge1xuICAgICAgICBvYmouX190eXBlID0gJ09iamVjdCc7XG4gICAgICAgIG9iai5jbGFzc05hbWUgPSBpbmNsdWRlUmVzcG9uc2UuY2xhc3NOYW1lO1xuXG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lID09ICdfVXNlcicgJiYgIWF1dGguaXNNYXN0ZXIpIHtcbiAgICAgICAgICBkZWxldGUgb2JqLnNlc3Npb25Ub2tlbjtcbiAgICAgICAgICBkZWxldGUgb2JqLmF1dGhEYXRhO1xuICAgICAgICB9XG4gICAgICAgIHJlcGxhY2Vbb2JqLm9iamVjdElkXSA9IG9iajtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXBsYWNlO1xuICAgIH0sIHt9KTtcblxuICAgIHZhciByZXNwID0ge1xuICAgICAgcmVzdWx0czogcmVwbGFjZVBvaW50ZXJzKHJlc3BvbnNlLnJlc3VsdHMsIHBhdGgsIHJlcGxhY2UpLFxuICAgIH07XG4gICAgaWYgKHJlc3BvbnNlLmNvdW50KSB7XG4gICAgICByZXNwLmNvdW50ID0gcmVzcG9uc2UuY291bnQ7XG4gICAgfVxuICAgIHJldHVybiByZXNwO1xuICB9KTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0IHRvIGZpbmQgcG9pbnRlcnMgaW4sIG9yXG4vLyBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gSWYgdGhlIHBhdGggeWllbGRzIHRoaW5ncyB0aGF0IGFyZW4ndCBwb2ludGVycywgdGhpcyB0aHJvd3MgYW4gZXJyb3IuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZHMgdG8gc2VhcmNoIGludG8uXG4vLyBSZXR1cm5zIGEgbGlzdCBvZiBwb2ludGVycyBpbiBSRVNUIGZvcm1hdC5cbmZ1bmN0aW9uIGZpbmRQb2ludGVycyhvYmplY3QsIHBhdGgpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIG9iamVjdC5tYXAoeCA9PiBmaW5kUG9pbnRlcnMoeCwgcGF0aCkpLmZsYXQoKTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgaWYgKHBhdGgubGVuZ3RoID09IDApIHtcbiAgICBpZiAob2JqZWN0ID09PSBudWxsIHx8IG9iamVjdC5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gW29iamVjdF07XG4gICAgfVxuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG4gIHJldHVybiBmaW5kUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpKTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0cyB0byByZXBsYWNlIHBvaW50ZXJzXG4vLyBpbiwgb3IgaXQgbWF5IGJlIGEgc2luZ2xlIG9iamVjdC5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkcyB0byBzZWFyY2ggaW50by5cbi8vIHJlcGxhY2UgaXMgYSBtYXAgZnJvbSBvYmplY3QgaWQgLT4gb2JqZWN0LlxuLy8gUmV0dXJucyBzb21ldGhpbmcgYW5hbG9nb3VzIHRvIG9iamVjdCwgYnV0IHdpdGggdGhlIGFwcHJvcHJpYXRlXG4vLyBwb2ludGVycyBpbmZsYXRlZC5cbmZ1bmN0aW9uIHJlcGxhY2VQb2ludGVycyhvYmplY3QsIHBhdGgsIHJlcGxhY2UpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIG9iamVjdFxuICAgICAgLm1hcChvYmogPT4gcmVwbGFjZVBvaW50ZXJzKG9iaiwgcGF0aCwgcmVwbGFjZSkpXG4gICAgICAuZmlsdGVyKG9iaiA9PiB0eXBlb2Ygb2JqICE9PSAndW5kZWZpbmVkJyk7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgIW9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHtcbiAgICBpZiAob2JqZWN0ICYmIG9iamVjdC5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgcmV0dXJuIHJlcGxhY2Vbb2JqZWN0Lm9iamVjdElkXTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICB2YXIgbmV3c3ViID0gcmVwbGFjZVBvaW50ZXJzKHN1Ym9iamVjdCwgcGF0aC5zbGljZSgxKSwgcmVwbGFjZSk7XG4gIHZhciBhbnN3ZXIgPSB7fTtcbiAgZm9yICh2YXIga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChrZXkgPT0gcGF0aFswXSkge1xuICAgICAgYW5zd2VyW2tleV0gPSBuZXdzdWI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFuc3dlcltrZXldID0gb2JqZWN0W2tleV07XG4gICAgfVxuICB9XG4gIHJldHVybiBhbnN3ZXI7XG59XG5cbi8vIEZpbmRzIGEgc3Vib2JqZWN0IHRoYXQgaGFzIHRoZSBnaXZlbiBrZXksIGlmIHRoZXJlIGlzIG9uZS5cbi8vIFJldHVybnMgdW5kZWZpbmVkIG90aGVyd2lzZS5cbmZ1bmN0aW9uIGZpbmRPYmplY3RXaXRoS2V5KHJvb3QsIGtleSkge1xuICBpZiAodHlwZW9mIHJvb3QgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChyb290IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICBmb3IgKHZhciBpdGVtIG9mIHJvb3QpIHtcbiAgICAgIGNvbnN0IGFuc3dlciA9IGZpbmRPYmplY3RXaXRoS2V5KGl0ZW0sIGtleSk7XG4gICAgICBpZiAoYW5zd2VyKSB7XG4gICAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChyb290ICYmIHJvb3Rba2V5XSkge1xuICAgIHJldHVybiByb290O1xuICB9XG4gIGZvciAodmFyIHN1YmtleSBpbiByb290KSB7XG4gICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkocm9vdFtzdWJrZXldLCBrZXkpO1xuICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmVzdFF1ZXJ5O1xuLy8gRm9yIHRlc3RzXG5tb2R1bGUuZXhwb3J0cy5fVW5zYWZlUmVzdFF1ZXJ5ID0gX1Vuc2FmZVJlc3RRdWVyeTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBOztBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQWdDLENBQUM7QUFDaEUsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUNDLEtBQUs7QUFDdkMsTUFBTUMsUUFBUSxHQUFHRixPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ3RDLE1BQU07RUFBRUc7QUFBYyxDQUFDLEdBQUdILE9BQU8sQ0FBQyw2QkFBNkIsQ0FBQztBQUNoRSxNQUFNSSxrQkFBa0IsR0FBRyxDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQztBQUN4RSxNQUFNO0VBQUVDO0FBQW9CLENBQUMsR0FBR0wsT0FBTyxD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