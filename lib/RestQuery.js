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
    restOptions: additionalOptions
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
    restOptions: additionalOptions
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
    restOptions: additionalOptions
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
    restOptions: additionalOptions
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
      restOptions: includeRestOptions
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
// For tests
module.exports._UnsafeRestQuery = _UnsafeRestQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsIlBhcnNlIiwidHJpZ2dlcnMiLCJjb250aW51ZVdoaWxlIiwiQWx3YXlzU2VsZWN0ZWRLZXlzIiwiZW5mb3JjZVJvbGVTZWN1cml0eSIsIlJlc3RRdWVyeSIsIm1ldGhvZCIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImNsaWVudFNESyIsInJ1bkFmdGVyRmluZCIsInJ1bkJlZm9yZUZpbmQiLCJjb250ZXh0IiwiTWV0aG9kIiwiZmluZCIsImdldCIsImluY2x1ZGVzIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwicmVzdWx0IiwibWF5YmVSdW5RdWVyeVRyaWdnZXIiLCJUeXBlcyIsImJlZm9yZUZpbmQiLCJQcm9taXNlIiwicmVzb2x2ZSIsIl9VbnNhZmVSZXN0UXVlcnkiLCJPYmplY3QiLCJmcmVlemUiLCJyZXNwb25zZSIsImZpbmRPcHRpb25zIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiJGFuZCIsIl9fdHlwZSIsIm9iamVjdElkIiwiaWQiLCJkb0NvdW50IiwiaW5jbHVkZUFsbCIsImluY2x1ZGUiLCJrZXlzRm9ySW5jbHVkZSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImtleXMiLCJleGNsdWRlS2V5cyIsImxlbmd0aCIsInNwbGl0IiwiZmlsdGVyIiwia2V5IiwibWFwIiwic2xpY2UiLCJsYXN0SW5kZXhPZiIsImpvaW4iLCJvcHRpb24iLCJjb25jYXQiLCJBcnJheSIsImZyb20iLCJTZXQiLCJleGNsdWRlIiwiayIsImluZGV4T2YiLCJmaWVsZHMiLCJvcmRlciIsInNvcnQiLCJyZWR1Y2UiLCJzb3J0TWFwIiwiZmllbGQiLCJ0cmltIiwic2NvcmUiLCIkbWV0YSIsInBhdGhzIiwicGF0aFNldCIsIm1lbW8iLCJwYXRoIiwiaW5kZXgiLCJwYXJ0cyIsInMiLCJhIiwiYiIsInJlZGlyZWN0S2V5IiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJyZWRpcmVjdENsYXNzTmFtZSIsIklOVkFMSURfSlNPTiIsImV4ZWN1dGUiLCJleGVjdXRlT3B0aW9ucyIsInRoZW4iLCJidWlsZFJlc3RXaGVyZSIsImRlbnlQcm90ZWN0ZWRGaWVsZHMiLCJoYW5kbGVJbmNsdWRlQWxsIiwiaGFuZGxlRXhjbHVkZUtleXMiLCJydW5GaW5kIiwicnVuQ291bnQiLCJoYW5kbGVJbmNsdWRlIiwicnVuQWZ0ZXJGaW5kVHJpZ2dlciIsImhhbmRsZUF1dGhBZGFwdGVycyIsImVhY2giLCJjYWxsYmFjayIsImxpbWl0IiwiZmluaXNoZWQiLCJxdWVyeSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiYXNzaWduIiwiJGd0IiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJyZXBsYWNlU2VsZWN0IiwicmVwbGFjZURvbnRTZWxlY3QiLCJyZXBsYWNlSW5RdWVyeSIsInJlcGxhY2VOb3RJblF1ZXJ5IiwicmVwbGFjZUVxdWFsaXR5IiwiYWNsIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJkYXRhYmFzZSIsIm5ld0NsYXNzTmFtZSIsImFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsInN5c3RlbUNsYXNzZXMiLCJsb2FkU2NoZW1hIiwic2NoZW1hQ29udHJvbGxlciIsImhhc0NsYXNzIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInRyYW5zZm9ybUluUXVlcnkiLCJpblF1ZXJ5T2JqZWN0IiwidmFsdWVzIiwicHVzaCIsImlzQXJyYXkiLCJmaW5kT2JqZWN0V2l0aEtleSIsImluUXVlcnlWYWx1ZSIsIndoZXJlIiwiYWRkaXRpb25hbE9wdGlvbnMiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwicmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeSIsInRyYW5zZm9ybU5vdEluUXVlcnkiLCJub3RJblF1ZXJ5T2JqZWN0Iiwibm90SW5RdWVyeVZhbHVlIiwiZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkiLCJqc29uIiwiaWR4Iiwic3JjIiwic3BsaWNlIiwidHJhbnNmb3JtU2VsZWN0Iiwic2VsZWN0T2JqZWN0Iiwib2JqZWN0cyIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImV4cGxhaW4iLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiciIsImNvdW50Iiwic2tpcCIsImMiLCJwcm90ZWN0ZWRGaWVsZHMiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJnZXRPbmVTY2hlbWEiLCJzY2hlbWEiLCJpbmNsdWRlRmllbGRzIiwia2V5RmllbGRzIiwidHlwZSIsInBhdGhSZXNwb25zZSIsImluY2x1ZGVQYXRoIiwibmV3UmVzcG9uc2UiLCJoYXNBZnRlckZpbmRIb29rIiwidHJpZ2dlckV4aXN0cyIsImFmdGVyRmluZCIsImFwcGxpY2F0aW9uSWQiLCJwaXBlbGluZSIsImRpc3RpbmN0IiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJhbGwiLCJhdXRoRGF0YU1hbmFnZXIiLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwiaSIsInNpemUiLCJleGNsdWRlS2V5U2V0IiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwicXVlcnlQcm9taXNlcyIsIm9iamVjdElkcyIsIiRpbiIsInJlc3BvbnNlcyIsInJlcGxhY2UiLCJpbmNsdWRlUmVzcG9uc2UiLCJvYmoiLCJzZXNzaW9uVG9rZW4iLCJyZXNwIiwicmVwbGFjZVBvaW50ZXJzIiwiYW5zd2VyIiwieCIsInN1Ym9iamVjdCIsIm5ld3N1YiIsInJvb3QiLCJpdGVtIiwic3Via2V5IiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0UXVlcnkuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQW4gb2JqZWN0IHRoYXQgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYSAnZmluZCdcbi8vIG9wZXJhdGlvbiwgZW5jb2RlZCBpbiB0aGUgUkVTVCBBUEkgZm9ybWF0LlxuXG52YXIgU2NoZW1hQ29udHJvbGxlciA9IHJlcXVpcmUoJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcicpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuY29uc3QgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG5jb25zdCB7IGNvbnRpbnVlV2hpbGUgfSA9IHJlcXVpcmUoJ3BhcnNlL2xpYi9ub2RlL3Byb21pc2VVdGlscycpO1xuY29uc3QgQWx3YXlzU2VsZWN0ZWRLZXlzID0gWydvYmplY3RJZCcsICdjcmVhdGVkQXQnLCAndXBkYXRlZEF0JywgJ0FDTCddO1xuY29uc3QgeyBlbmZvcmNlUm9sZVNlY3VyaXR5IH0gPSByZXF1aXJlKCcuL1NoYXJlZFJlc3QnKTtcblxuLy8gcmVzdE9wdGlvbnMgY2FuIGluY2x1ZGU6XG4vLyAgIHNraXBcbi8vICAgbGltaXRcbi8vICAgb3JkZXJcbi8vICAgY291bnRcbi8vICAgaW5jbHVkZVxuLy8gICBrZXlzXG4vLyAgIGV4Y2x1ZGVLZXlzXG4vLyAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5XG4vLyAgIHJlYWRQcmVmZXJlbmNlXG4vLyAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZVxuLy8gICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlXG4vKipcbiAqIFVzZSB0byBwZXJmb3JtIGEgcXVlcnkgb24gYSBjbGFzcy4gSXQgd2lsbCBydW4gc2VjdXJpdHkgY2hlY2tzIGFuZCB0cmlnZ2Vycy5cbiAqIEBwYXJhbSBvcHRpb25zXG4gKiBAcGFyYW0gb3B0aW9ucy5tZXRob2Qge1Jlc3RRdWVyeS5NZXRob2R9IFRoZSB0eXBlIG9mIHF1ZXJ5IHRvIHBlcmZvcm1cbiAqIEBwYXJhbSBvcHRpb25zLmNvbmZpZyB7UGFyc2VTZXJ2ZXJDb25maWd1cmF0aW9ufSBUaGUgc2VydmVyIGNvbmZpZ3VyYXRpb25cbiAqIEBwYXJhbSBvcHRpb25zLmF1dGgge0F1dGh9IFRoZSBhdXRoIG9iamVjdCBmb3IgdGhlIHJlcXVlc3RcbiAqIEBwYXJhbSBvcHRpb25zLmNsYXNzTmFtZSB7c3RyaW5nfSBUaGUgbmFtZSBvZiB0aGUgY2xhc3MgdG8gcXVlcnlcbiAqIEBwYXJhbSBvcHRpb25zLnJlc3RXaGVyZSB7b2JqZWN0fSBUaGUgd2hlcmUgb2JqZWN0IGZvciB0aGUgcXVlcnlcbiAqIEBwYXJhbSBvcHRpb25zLnJlc3RPcHRpb25zIHtvYmplY3R9IFRoZSBvcHRpb25zIG9iamVjdCBmb3IgdGhlIHF1ZXJ5XG4gKiBAcGFyYW0gb3B0aW9ucy5jbGllbnRTREsge3N0cmluZ30gVGhlIGNsaWVudCBTREsgdGhhdCBpcyBwZXJmb3JtaW5nIHRoZSBxdWVyeVxuICogQHBhcmFtIG9wdGlvbnMucnVuQWZ0ZXJGaW5kIHtib29sZWFufSBXaGV0aGVyIHRvIHJ1biB0aGUgYWZ0ZXJGaW5kIHRyaWdnZXJcbiAqIEBwYXJhbSBvcHRpb25zLnJ1bkJlZm9yZUZpbmQge2Jvb2xlYW59IFdoZXRoZXIgdG8gcnVuIHRoZSBiZWZvcmVGaW5kIHRyaWdnZXJcbiAqIEBwYXJhbSBvcHRpb25zLmNvbnRleHQge29iamVjdH0gVGhlIGNvbnRleHQgb2JqZWN0IGZvciB0aGUgcXVlcnlcbiAqIEByZXR1cm5zIHtQcm9taXNlPF9VbnNhZmVSZXN0UXVlcnk+fSBBIHByb21pc2UgdGhhdCBpcyByZXNvbHZlZCB3aXRoIHRoZSBfVW5zYWZlUmVzdFF1ZXJ5IG9iamVjdFxuICovXG5hc3luYyBmdW5jdGlvbiBSZXN0UXVlcnkoe1xuICBtZXRob2QsXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgY2xhc3NOYW1lLFxuICByZXN0V2hlcmUgPSB7fSxcbiAgcmVzdE9wdGlvbnMgPSB7fSxcbiAgY2xpZW50U0RLLFxuICBydW5BZnRlckZpbmQgPSB0cnVlLFxuICBydW5CZWZvcmVGaW5kID0gdHJ1ZSxcbiAgY29udGV4dCxcbn0pIHtcbiAgaWYgKCFbUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLCBSZXN0UXVlcnkuTWV0aG9kLmdldF0uaW5jbHVkZXMobWV0aG9kKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnYmFkIHF1ZXJ5IHR5cGUnKTtcbiAgfVxuICBlbmZvcmNlUm9sZVNlY3VyaXR5KG1ldGhvZCwgY2xhc3NOYW1lLCBhdXRoKTtcbiAgY29uc3QgcmVzdWx0ID0gcnVuQmVmb3JlRmluZFxuICAgID8gYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5RdWVyeVRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVGaW5kLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgcmVzdFdoZXJlLFxuICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICBjb25maWcsXG4gICAgICBhdXRoLFxuICAgICAgY29udGV4dCxcbiAgICAgIG1ldGhvZCA9PT0gUmVzdFF1ZXJ5Lk1ldGhvZC5nZXRcbiAgICApXG4gICAgOiBQcm9taXNlLnJlc29sdmUoeyByZXN0V2hlcmUsIHJlc3RPcHRpb25zIH0pO1xuXG4gIHJldHVybiBuZXcgX1Vuc2FmZVJlc3RRdWVyeShcbiAgICBjb25maWcsXG4gICAgYXV0aCxcbiAgICBjbGFzc05hbWUsXG4gICAgcmVzdWx0LnJlc3RXaGVyZSB8fCByZXN0V2hlcmUsXG4gICAgcmVzdWx0LnJlc3RPcHRpb25zIHx8IHJlc3RPcHRpb25zLFxuICAgIGNsaWVudFNESyxcbiAgICBydW5BZnRlckZpbmQsXG4gICAgY29udGV4dFxuICApO1xufVxuXG5SZXN0UXVlcnkuTWV0aG9kID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGdldDogJ2dldCcsXG4gIGZpbmQ6ICdmaW5kJyxcbn0pO1xuXG4vKipcbiAqIF9VbnNhZmVSZXN0UXVlcnkgaXMgbWVhbnQgZm9yIHNwZWNpZmljIGludGVybmFsIHVzYWdlIG9ubHkuIFdoZW4geW91IG5lZWQgdG8gc2tpcCBzZWN1cml0eSBjaGVja3Mgb3Igc29tZSB0cmlnZ2Vycy5cbiAqIERvbid0IHVzZSBpdCBpZiB5b3UgZG9uJ3Qga25vdyB3aGF0IHlvdSBhcmUgZG9pbmcuXG4gKiBAcGFyYW0gY29uZmlnXG4gKiBAcGFyYW0gYXV0aFxuICogQHBhcmFtIGNsYXNzTmFtZVxuICogQHBhcmFtIHJlc3RXaGVyZVxuICogQHBhcmFtIHJlc3RPcHRpb25zXG4gKiBAcGFyYW0gY2xpZW50U0RLXG4gKiBAcGFyYW0gcnVuQWZ0ZXJGaW5kXG4gKiBAcGFyYW0gY29udGV4dFxuICovXG5mdW5jdGlvbiBfVW5zYWZlUmVzdFF1ZXJ5KFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgcmVzdFdoZXJlID0ge30sXG4gIHJlc3RPcHRpb25zID0ge30sXG4gIGNsaWVudFNESyxcbiAgcnVuQWZ0ZXJGaW5kID0gdHJ1ZSxcbiAgY29udGV4dFxuKSB7XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmF1dGggPSBhdXRoO1xuICB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgdGhpcy5yZXN0V2hlcmUgPSByZXN0V2hlcmU7XG4gIHRoaXMucmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucztcbiAgdGhpcy5jbGllbnRTREsgPSBjbGllbnRTREs7XG4gIHRoaXMucnVuQWZ0ZXJGaW5kID0gcnVuQWZ0ZXJGaW5kO1xuICB0aGlzLnJlc3BvbnNlID0gbnVsbDtcbiAgdGhpcy5maW5kT3B0aW9ucyA9IHt9O1xuICB0aGlzLmNvbnRleHQgPSBjb250ZXh0IHx8IHt9O1xuICBpZiAoIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PSAnX1Nlc3Npb24nKSB7XG4gICAgICBpZiAoIXRoaXMuYXV0aC51c2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICAgIH1cbiAgICAgIHRoaXMucmVzdFdoZXJlID0ge1xuICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgdGhpcy5yZXN0V2hlcmUsXG4gICAgICAgICAge1xuICAgICAgICAgICAgdXNlcjoge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICAgICAgICBvYmplY3RJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHRoaXMuZG9Db3VudCA9IGZhbHNlO1xuICB0aGlzLmluY2x1ZGVBbGwgPSBmYWxzZTtcblxuICAvLyBUaGUgZm9ybWF0IGZvciB0aGlzLmluY2x1ZGUgaXMgbm90IHRoZSBzYW1lIGFzIHRoZSBmb3JtYXQgZm9yIHRoZVxuICAvLyBpbmNsdWRlIG9wdGlvbiAtIGl0J3MgdGhlIHBhdGhzIHdlIHNob3VsZCBpbmNsdWRlLCBpbiBvcmRlcixcbiAgLy8gc3RvcmVkIGFzIGFycmF5cywgdGFraW5nIGludG8gYWNjb3VudCB0aGF0IHdlIG5lZWQgdG8gaW5jbHVkZSBmb29cbiAgLy8gYmVmb3JlIGluY2x1ZGluZyBmb28uYmFyLiBBbHNvIGl0IHNob3VsZCBkZWR1cGUuXG4gIC8vIEZvciBleGFtcGxlLCBwYXNzaW5nIGFuIGFyZyBvZiBpbmNsdWRlPWZvby5iYXIsZm9vLmJheiBjb3VsZCBsZWFkIHRvXG4gIC8vIHRoaXMuaW5jbHVkZSA9IFtbJ2ZvbyddLCBbJ2ZvbycsICdiYXonXSwgWydmb28nLCAnYmFyJ11dXG4gIHRoaXMuaW5jbHVkZSA9IFtdO1xuICBsZXQga2V5c0ZvckluY2x1ZGUgPSAnJztcblxuICAvLyBJZiB3ZSBoYXZlIGtleXMsIHdlIHByb2JhYmx5IHdhbnQgdG8gZm9yY2Ugc29tZSBpbmNsdWRlcyAobi0xIGxldmVsKVxuICAvLyBTZWUgaXNzdWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy8zMTg1XG4gIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdE9wdGlvbnMsICdrZXlzJykpIHtcbiAgICBrZXlzRm9ySW5jbHVkZSA9IHJlc3RPcHRpb25zLmtleXM7XG4gIH1cblxuICAvLyBJZiB3ZSBoYXZlIGtleXMsIHdlIHByb2JhYmx5IHdhbnQgdG8gZm9yY2Ugc29tZSBpbmNsdWRlcyAobi0xIGxldmVsKVxuICAvLyBpbiBvcmRlciB0byBleGNsdWRlIHNwZWNpZmljIGtleXMuXG4gIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdE9wdGlvbnMsICdleGNsdWRlS2V5cycpKSB7XG4gICAga2V5c0ZvckluY2x1ZGUgKz0gJywnICsgcmVzdE9wdGlvbnMuZXhjbHVkZUtleXM7XG4gIH1cblxuICBpZiAoa2V5c0ZvckluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgIGtleXNGb3JJbmNsdWRlID0ga2V5c0ZvckluY2x1ZGVcbiAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAuZmlsdGVyKGtleSA9PiB7XG4gICAgICAgIC8vIEF0IGxlYXN0IDIgY29tcG9uZW50c1xuICAgICAgICByZXR1cm4ga2V5LnNwbGl0KCcuJykubGVuZ3RoID4gMTtcbiAgICAgIH0pXG4gICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgIC8vIFNsaWNlIHRoZSBsYXN0IGNvbXBvbmVudCAoYS5iLmMgLT4gYS5iKVxuICAgICAgICAvLyBPdGhlcndpc2Ugd2UnbGwgaW5jbHVkZSBvbmUgbGV2ZWwgdG9vIG11Y2guXG4gICAgICAgIHJldHVybiBrZXkuc2xpY2UoMCwga2V5Lmxhc3RJbmRleE9mKCcuJykpO1xuICAgICAgfSlcbiAgICAgIC5qb2luKCcsJyk7XG5cbiAgICAvLyBDb25jYXQgdGhlIHBvc3NpYmx5IHByZXNlbnQgaW5jbHVkZSBzdHJpbmcgd2l0aCB0aGUgb25lIGZyb20gdGhlIGtleXNcbiAgICAvLyBEZWR1cCAvIHNvcnRpbmcgaXMgaGFuZGxlIGluICdpbmNsdWRlJyBjYXNlLlxuICAgIGlmIChrZXlzRm9ySW5jbHVkZS5sZW5ndGggPiAwKSB7XG4gICAgICBpZiAoIXJlc3RPcHRpb25zLmluY2x1ZGUgfHwgcmVzdE9wdGlvbnMuaW5jbHVkZS5sZW5ndGggPT0gMCkge1xuICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlID0ga2V5c0ZvckluY2x1ZGU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlICs9ICcsJyArIGtleXNGb3JJbmNsdWRlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZvciAodmFyIG9wdGlvbiBpbiByZXN0T3B0aW9ucykge1xuICAgIHN3aXRjaCAob3B0aW9uKSB7XG4gICAgICBjYXNlICdrZXlzJzoge1xuICAgICAgICBjb25zdCBrZXlzID0gcmVzdE9wdGlvbnMua2V5c1xuICAgICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgICAgLmZpbHRlcihrZXkgPT4ga2V5Lmxlbmd0aCA+IDApXG4gICAgICAgICAgLmNvbmNhdChBbHdheXNTZWxlY3RlZEtleXMpO1xuICAgICAgICB0aGlzLmtleXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoa2V5cykpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ2V4Y2x1ZGVLZXlzJzoge1xuICAgICAgICBjb25zdCBleGNsdWRlID0gcmVzdE9wdGlvbnMuZXhjbHVkZUtleXNcbiAgICAgICAgICAuc3BsaXQoJywnKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiBBbHdheXNTZWxlY3RlZEtleXMuaW5kZXhPZihrKSA8IDApO1xuICAgICAgICB0aGlzLmV4Y2x1ZGVLZXlzID0gQXJyYXkuZnJvbShuZXcgU2V0KGV4Y2x1ZGUpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdjb3VudCc6XG4gICAgICAgIHRoaXMuZG9Db3VudCA9IHRydWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZUFsbCc6XG4gICAgICAgIHRoaXMuaW5jbHVkZUFsbCA9IHRydWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnZXhwbGFpbic6XG4gICAgICBjYXNlICdoaW50JzpcbiAgICAgIGNhc2UgJ2Rpc3RpbmN0JzpcbiAgICAgIGNhc2UgJ3BpcGVsaW5lJzpcbiAgICAgIGNhc2UgJ3NraXAnOlxuICAgICAgY2FzZSAnbGltaXQnOlxuICAgICAgY2FzZSAncmVhZFByZWZlcmVuY2UnOlxuICAgICAgICB0aGlzLmZpbmRPcHRpb25zW29wdGlvbl0gPSByZXN0T3B0aW9uc1tvcHRpb25dO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ29yZGVyJzpcbiAgICAgICAgdmFyIGZpZWxkcyA9IHJlc3RPcHRpb25zLm9yZGVyLnNwbGl0KCcsJyk7XG4gICAgICAgIHRoaXMuZmluZE9wdGlvbnMuc29ydCA9IGZpZWxkcy5yZWR1Y2UoKHNvcnRNYXAsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgZmllbGQgPSBmaWVsZC50cmltKCk7XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnJHNjb3JlJyB8fCBmaWVsZCA9PT0gJy0kc2NvcmUnKSB7XG4gICAgICAgICAgICBzb3J0TWFwLnNjb3JlID0geyAkbWV0YTogJ3RleHRTY29yZScgfTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGZpZWxkWzBdID09ICctJykge1xuICAgICAgICAgICAgc29ydE1hcFtmaWVsZC5zbGljZSgxKV0gPSAtMTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc29ydE1hcFtmaWVsZF0gPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gc29ydE1hcDtcbiAgICAgICAgfSwge30pO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGUnOiB7XG4gICAgICAgIGNvbnN0IHBhdGhzID0gcmVzdE9wdGlvbnMuaW5jbHVkZS5zcGxpdCgnLCcpO1xuICAgICAgICBpZiAocGF0aHMuaW5jbHVkZXMoJyonKSkge1xuICAgICAgICAgIHRoaXMuaW5jbHVkZUFsbCA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgLy8gTG9hZCB0aGUgZXhpc3RpbmcgaW5jbHVkZXMgKGZyb20ga2V5cylcbiAgICAgICAgY29uc3QgcGF0aFNldCA9IHBhdGhzLnJlZHVjZSgobWVtbywgcGF0aCkgPT4ge1xuICAgICAgICAgIC8vIFNwbGl0IGVhY2ggcGF0aHMgb24gLiAoYS5iLmMgLT4gW2EsYixjXSlcbiAgICAgICAgICAvLyByZWR1Y2UgdG8gY3JlYXRlIGFsbCBwYXRoc1xuICAgICAgICAgIC8vIChbYSxiLGNdIC0+IHthOiB0cnVlLCAnYS5iJzogdHJ1ZSwgJ2EuYi5jJzogdHJ1ZX0pXG4gICAgICAgICAgcmV0dXJuIHBhdGguc3BsaXQoJy4nKS5yZWR1Y2UoKG1lbW8sIHBhdGgsIGluZGV4LCBwYXJ0cykgPT4ge1xuICAgICAgICAgICAgbWVtb1twYXJ0cy5zbGljZSgwLCBpbmRleCArIDEpLmpvaW4oJy4nKV0gPSB0cnVlO1xuICAgICAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICAgICAgfSwgbWVtbyk7XG4gICAgICAgIH0sIHt9KTtcblxuICAgICAgICB0aGlzLmluY2x1ZGUgPSBPYmplY3Qua2V5cyhwYXRoU2V0KVxuICAgICAgICAgIC5tYXAocyA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcy5zcGxpdCgnLicpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBhLmxlbmd0aCAtIGIubGVuZ3RoOyAvLyBTb3J0IGJ5IG51bWJlciBvZiBjb21wb25lbnRzXG4gICAgICAgICAgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAncmVkaXJlY3RDbGFzc05hbWVGb3JLZXknOlxuICAgICAgICB0aGlzLnJlZGlyZWN0S2V5ID0gcmVzdE9wdGlvbnMucmVkaXJlY3RDbGFzc05hbWVGb3JLZXk7XG4gICAgICAgIHRoaXMucmVkaXJlY3RDbGFzc05hbWUgPSBudWxsO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGVSZWFkUHJlZmVyZW5jZSc6XG4gICAgICBjYXNlICdzdWJxdWVyeVJlYWRQcmVmZXJlbmNlJzpcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkIG9wdGlvbjogJyArIG9wdGlvbik7XG4gICAgfVxuICB9XG59XG5cbi8vIEEgY29udmVuaWVudCBtZXRob2QgdG8gcGVyZm9ybSBhbGwgdGhlIHN0ZXBzIG9mIHByb2Nlc3NpbmcgYSBxdWVyeVxuLy8gaW4gb3JkZXIuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHJlc3BvbnNlIC0gYW4gb2JqZWN0IHdpdGggb3B0aW9uYWwga2V5c1xuLy8gJ3Jlc3VsdHMnIGFuZCAnY291bnQnLlxuLy8gVE9ETzogY29uc29saWRhdGUgdGhlIHJlcGxhY2VYIGZ1bmN0aW9uc1xuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uIChleGVjdXRlT3B0aW9ucykge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5idWlsZFJlc3RXaGVyZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVueVByb3RlY3RlZEZpZWxkcygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZUFsbCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRXhjbHVkZUtleXMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkZpbmQoZXhlY3V0ZU9wdGlvbnMpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQ291bnQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkFmdGVyRmluZFRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhBZGFwdGVycygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5lYWNoID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHJlc3RXaGVyZSwgcmVzdE9wdGlvbnMsIGNsaWVudFNESyB9ID0gdGhpcztcbiAgLy8gaWYgdGhlIGxpbWl0IGlzIHNldCwgdXNlIGl0XG4gIHJlc3RPcHRpb25zLmxpbWl0ID0gcmVzdE9wdGlvbnMubGltaXQgfHwgMTAwO1xuICByZXN0T3B0aW9ucy5vcmRlciA9ICdvYmplY3RJZCc7XG4gIGxldCBmaW5pc2hlZCA9IGZhbHNlO1xuXG4gIHJldHVybiBjb250aW51ZVdoaWxlKFxuICAgICgpID0+IHtcbiAgICAgIHJldHVybiAhZmluaXNoZWQ7XG4gICAgfSxcbiAgICBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBTYWZlIGhlcmUgdG8gdXNlIF9VbnNhZmVSZXN0UXVlcnkgYmVjYXVzZSB0aGUgc2VjdXJpdHkgd2FzIGFscmVhZHlcbiAgICAgIC8vIGNoZWNrZWQgZHVyaW5nIFwiYXdhaXQgUmVzdFF1ZXJ5KClcIlxuICAgICAgY29uc3QgcXVlcnkgPSBuZXcgX1Vuc2FmZVJlc3RRdWVyeShcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgIGNsaWVudFNESyxcbiAgICAgICAgdGhpcy5ydW5BZnRlckZpbmQsXG4gICAgICAgIHRoaXMuY29udGV4dFxuICAgICAgKTtcbiAgICAgIGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcXVlcnkuZXhlY3V0ZSgpO1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKGNhbGxiYWNrKTtcbiAgICAgIGZpbmlzaGVkID0gcmVzdWx0cy5sZW5ndGggPCByZXN0T3B0aW9ucy5saW1pdDtcbiAgICAgIGlmICghZmluaXNoZWQpIHtcbiAgICAgICAgcmVzdFdoZXJlLm9iamVjdElkID0gT2JqZWN0LmFzc2lnbih7fSwgcmVzdFdoZXJlLm9iamVjdElkLCB7XG4gICAgICAgICAgJGd0OiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV0ub2JqZWN0SWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbn07XG5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmJ1aWxkUmVzdFdoZXJlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRVc2VyQW5kUm9sZUFDTCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZVNlbGVjdCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlTm90SW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZUVxdWFsaXR5KCk7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSB0aGlzLmZpbmRPcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gQ2hhbmdlcyB0aGUgY2xhc3NOYW1lIGlmIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IGlzIHNldC5cbi8vIFJldHVybnMgYSBwcm9taXNlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5yZWRpcmVjdEtleSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdlIG5lZWQgdG8gY2hhbmdlIHRoZSBjbGFzcyBuYW1lIGJhc2VkIG9uIHRoZSBzY2hlbWFcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlZGlyZWN0S2V5KVxuICAgIC50aGVuKG5ld0NsYXNzTmFtZSA9PiB7XG4gICAgICB0aGlzLmNsYXNzTmFtZSA9IG5ld0NsYXNzTmFtZTtcbiAgICAgIHRoaXMucmVkaXJlY3RDbGFzc05hbWUgPSBuZXdDbGFzc05hbWU7XG4gICAgfSk7XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIGNvbmZpZy5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKFxuICAgIHRoaXMuY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgU2NoZW1hQ29udHJvbGxlci5zeXN0ZW1DbGFzc2VzLmluZGV4T2YodGhpcy5jbGFzc05hbWUpID09PSAtMVxuICApIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5oYXNDbGFzcyh0aGlzLmNsYXNzTmFtZSkpXG4gICAgICAudGhlbihoYXNDbGFzcyA9PiB7XG4gICAgICAgIGlmIChoYXNDbGFzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAnVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2VzcyAnICsgJ25vbi1leGlzdGVudCBjbGFzczogJyArIHRoaXMuY2xhc3NOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIGNsYXNzTmFtZSwgcmVzdWx0cykge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgdmFsdWVzLnB1c2goe1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgIG9iamVjdElkOiByZXN1bHQub2JqZWN0SWQsXG4gICAgfSk7XG4gIH1cbiAgZGVsZXRlIGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmIChBcnJheS5pc0FycmF5KGluUXVlcnlPYmplY3RbJyRpbiddKSkge1xuICAgIGluUXVlcnlPYmplY3RbJyRpbiddID0gaW5RdWVyeU9iamVjdFsnJGluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgaW5RdWVyeU9iamVjdFsnJGluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkaW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkaW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJGluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VJblF1ZXJ5ID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICB2YXIgaW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGluUXVlcnknKTtcbiAgaWYgKCFpblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIGluUXVlcnlWYWx1ZSA9IGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmICghaW5RdWVyeVZhbHVlLndoZXJlIHx8ICFpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkaW5RdWVyeScpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3Qgc3VicXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgYXV0aDogdGhpcy5hdXRoLFxuICAgIGNsYXNzTmFtZTogaW5RdWVyeVZhbHVlLmNsYXNzTmFtZSxcbiAgICByZXN0V2hlcmU6IGluUXVlcnlWYWx1ZS53aGVyZSxcbiAgICByZXN0T3B0aW9uczogYWRkaXRpb25hbE9wdGlvbnMsXG4gIH0pO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybUluUXVlcnkoaW5RdWVyeU9iamVjdCwgc3VicXVlcnkuY2xhc3NOYW1lLCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBSZWN1cnNlIHRvIHJlcGVhdFxuICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gIH0pO1xufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtTm90SW5RdWVyeShub3RJblF1ZXJ5T2JqZWN0LCBjbGFzc05hbWUsIHJlc3VsdHMpIHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgIHZhbHVlcy5wdXNoKHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogcmVzdWx0Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGRlbGV0ZSBub3RJblF1ZXJ5T2JqZWN0Wyckbm90SW5RdWVyeSddO1xuICBpZiAoQXJyYXkuaXNBcnJheShub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10pKSB7XG4gICAgbm90SW5RdWVyeU9iamVjdFsnJG5pbiddID0gbm90SW5RdWVyeU9iamVjdFsnJG5pbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IHZhbHVlcztcbiAgfVxufVxuXG4vLyBSZXBsYWNlcyBhICRub3RJblF1ZXJ5IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYW5cbi8vICRub3RJblF1ZXJ5IGNsYXVzZS5cbi8vIFRoZSAkbm90SW5RdWVyeSBjbGF1c2UgdHVybnMgaW50byBhICRuaW4gd2l0aCB2YWx1ZXMgdGhhdCBhcmUganVzdFxuLy8gcG9pbnRlcnMgdG8gdGhlIG9iamVjdHMgcmV0dXJuZWQgaW4gdGhlIHN1YnF1ZXJ5LlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZU5vdEluUXVlcnkgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBub3RJblF1ZXJ5T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckbm90SW5RdWVyeScpO1xuICBpZiAoIW5vdEluUXVlcnlPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgbm90SW5RdWVyeSB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gd2hlcmUgYW5kIGNsYXNzTmFtZVxuICB2YXIgbm90SW5RdWVyeVZhbHVlID0gbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKCFub3RJblF1ZXJ5VmFsdWUud2hlcmUgfHwgIW5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRub3RJblF1ZXJ5Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogbm90SW5RdWVyeVZhbHVlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBjb25zdCBzdWJxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICBhdXRoOiB0aGlzLmF1dGgsXG4gICAgY2xhc3NOYW1lOiBub3RJblF1ZXJ5VmFsdWUuY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZTogbm90SW5RdWVyeVZhbHVlLndoZXJlLFxuICAgIHJlc3RPcHRpb25zOiBhZGRpdGlvbmFsT3B0aW9ucyxcbiAgfSk7XG5cbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1Ob3RJblF1ZXJ5KG5vdEluUXVlcnlPYmplY3QsIHN1YnF1ZXJ5LmNsYXNzTmFtZSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gUmVjdXJzZSB0byByZXBlYXRcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlTm90SW5RdWVyeSgpO1xuICB9KTtcbn07XG5cbi8vIFVzZWQgdG8gZ2V0IHRoZSBkZWVwZXN0IG9iamVjdCBmcm9tIGpzb24gdXNpbmcgZG90IG5vdGF0aW9uLlxuY29uc3QgZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkgPSAoanNvbiwga2V5LCBpZHgsIHNyYykgPT4ge1xuICBpZiAoa2V5IGluIGpzb24pIHtcbiAgICByZXR1cm4ganNvbltrZXldO1xuICB9XG4gIHNyYy5zcGxpY2UoMSk7IC8vIEV4aXQgRWFybHlcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVNlbGVjdCA9IChzZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgc2VsZWN0T2JqZWN0Wyckc2VsZWN0J107XG4gIGlmIChBcnJheS5pc0FycmF5KHNlbGVjdE9iamVjdFsnJGluJ10pKSB7XG4gICAgc2VsZWN0T2JqZWN0WyckaW4nXSA9IHNlbGVjdE9iamVjdFsnJGluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgc2VsZWN0T2JqZWN0WyckaW4nXSA9IHZhbHVlcztcbiAgfVxufTtcblxuLy8gUmVwbGFjZXMgYSAkc2VsZWN0IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYVxuLy8gJHNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJHNlbGVjdCBjbGF1c2UgdHVybnMgaW50byBhbiAkaW4gd2l0aCB2YWx1ZXMgc2VsZWN0ZWQgb3V0IG9mXG4vLyB0aGUgc3VicXVlcnkuXG4vLyBSZXR1cm5zIGEgcG9zc2libGUtcHJvbWlzZS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VTZWxlY3QgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRzZWxlY3QnKTtcbiAgaWYgKCFzZWxlY3RPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgc2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBzZWxlY3RWYWx1ZSA9IHNlbGVjdE9iamVjdFsnJHNlbGVjdCddO1xuICAvLyBpT1MgU0RLIGRvbid0IHNlbmQgd2hlcmUgaWYgbm90IHNldCwgbGV0IGl0IHBhc3NcbiAgaWYgKFxuICAgICFzZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFzZWxlY3RWYWx1ZS5rZXkgfHxcbiAgICB0eXBlb2Ygc2VsZWN0VmFsdWUucXVlcnkgIT09ICdvYmplY3QnIHx8XG4gICAgIXNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKHNlbGVjdFZhbHVlKS5sZW5ndGggIT09IDJcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkc2VsZWN0Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogc2VsZWN0VmFsdWUucXVlcnkucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIGNvbnN0IHN1YnF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgIGF1dGg6IHRoaXMuYXV0aCxcbiAgICBjbGFzc05hbWU6IHNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSxcbiAgICByZXN0V2hlcmU6IHNlbGVjdFZhbHVlLnF1ZXJ5LndoZXJlLFxuICAgIHJlc3RPcHRpb25zOiBhZGRpdGlvbmFsT3B0aW9ucyxcbiAgfSk7XG5cbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1TZWxlY3Qoc2VsZWN0T2JqZWN0LCBzZWxlY3RWYWx1ZS5rZXksIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIEtlZXAgcmVwbGFjaW5nICRzZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb250U2VsZWN0ID0gKGRvbnRTZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoZG9udFNlbGVjdE9iamVjdFsnJG5pbiddKSkge1xuICAgIGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSA9IGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBkb250U2VsZWN0T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJGRvbnRTZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkZG9udFNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJGRvbnRTZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJG5pbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZURvbnRTZWxlY3QgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBkb250U2VsZWN0T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckZG9udFNlbGVjdCcpO1xuICBpZiAoIWRvbnRTZWxlY3RPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgZG9udFNlbGVjdCB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gcXVlcnkgYW5kIGtleVxuICB2YXIgZG9udFNlbGVjdFZhbHVlID0gZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKFxuICAgICFkb250U2VsZWN0VmFsdWUucXVlcnkgfHxcbiAgICAhZG9udFNlbGVjdFZhbHVlLmtleSB8fFxuICAgIHR5cGVvZiBkb250U2VsZWN0VmFsdWUucXVlcnkgIT09ICdvYmplY3QnIHx8XG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUgfHxcbiAgICBPYmplY3Qua2V5cyhkb250U2VsZWN0VmFsdWUpLmxlbmd0aCAhPT0gMlxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRkb250U2VsZWN0Jyk7XG4gIH1cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3Qgc3VicXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgYXV0aDogdGhpcy5hdXRoLFxuICAgIGNsYXNzTmFtZTogZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSxcbiAgICByZXN0V2hlcmU6IGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS53aGVyZSxcbiAgICByZXN0T3B0aW9uczogYWRkaXRpb25hbE9wdGlvbnMsXG4gIH0pO1xuXG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtRG9udFNlbGVjdChkb250U2VsZWN0T2JqZWN0LCBkb250U2VsZWN0VmFsdWUua2V5LCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBLZWVwIHJlcGxhY2luZyAkZG9udFNlbGVjdCBjbGF1c2VzXG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5jbGVhblJlc3VsdEF1dGhEYXRhID0gZnVuY3Rpb24gKHJlc3VsdCkge1xuICBkZWxldGUgcmVzdWx0LnBhc3N3b3JkO1xuICBpZiAocmVzdWx0LmF1dGhEYXRhKSB7XG4gICAgT2JqZWN0LmtleXMocmVzdWx0LmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgIGlmIChyZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKE9iamVjdC5rZXlzKHJlc3VsdC5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGE7XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCByZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50ID0gY29uc3RyYWludCA9PiB7XG4gIGlmICh0eXBlb2YgY29uc3RyYWludCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gY29uc3RyYWludDtcbiAgfVxuICBjb25zdCBlcXVhbFRvT2JqZWN0ID0ge307XG4gIGxldCBoYXNEaXJlY3RDb25zdHJhaW50ID0gZmFsc2U7XG4gIGxldCBoYXNPcGVyYXRvckNvbnN0cmFpbnQgPSBmYWxzZTtcbiAgZm9yIChjb25zdCBrZXkgaW4gY29uc3RyYWludCkge1xuICAgIGlmIChrZXkuaW5kZXhPZignJCcpICE9PSAwKSB7XG4gICAgICBoYXNEaXJlY3RDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICAgIGVxdWFsVG9PYmplY3Rba2V5XSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICB9IGVsc2Uge1xuICAgICAgaGFzT3BlcmF0b3JDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgaWYgKGhhc0RpcmVjdENvbnN0cmFpbnQgJiYgaGFzT3BlcmF0b3JDb25zdHJhaW50KSB7XG4gICAgY29uc3RyYWludFsnJGVxJ10gPSBlcXVhbFRvT2JqZWN0O1xuICAgIE9iamVjdC5rZXlzKGVxdWFsVG9PYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50W2tleV07XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGNvbnN0cmFpbnQ7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlRXF1YWxpdHkgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgdGhpcy5yZXN0V2hlcmUgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHRoaXMucmVzdFdoZXJlKSB7XG4gICAgdGhpcy5yZXN0V2hlcmVba2V5XSA9IHJlcGxhY2VFcXVhbGl0eUNvbnN0cmFpbnQodGhpcy5yZXN0V2hlcmVba2V5XSk7XG4gIH1cbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGV0aGVyIGl0IHdhcyBzdWNjZXNzZnVsLlxuLy8gUG9wdWxhdGVzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbiBvYmplY3QgdGhhdCBvbmx5IGhhcyAncmVzdWx0cycuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5GaW5kID0gZnVuY3Rpb24gKG9wdGlvbnMgPSB7fSkge1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5saW1pdCA9PT0gMCkge1xuICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3VsdHM6IFtdIH07XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIGNvbnN0IGZpbmRPcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5maW5kT3B0aW9ucyk7XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICBmaW5kT3B0aW9ucy5rZXlzID0gdGhpcy5rZXlzLm1hcChrZXkgPT4ge1xuICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpWzBdO1xuICAgIH0pO1xuICB9XG4gIGlmIChvcHRpb25zLm9wKSB7XG4gICAgZmluZE9wdGlvbnMub3AgPSBvcHRpb25zLm9wO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgZmluZE9wdGlvbnMsIHRoaXMuYXV0aClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiAhZmluZE9wdGlvbnMuZXhwbGFpbikge1xuICAgICAgICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgICAgICAgIHRoaXMuY2xlYW5SZXN1bHRBdXRoRGF0YShyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCByZXN1bHRzKTtcblxuICAgICAgaWYgKHRoaXMucmVkaXJlY3RDbGFzc05hbWUpIHtcbiAgICAgICAgZm9yICh2YXIgciBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgci5jbGFzc05hbWUgPSB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLnJlc3BvbnNlID0geyByZXN1bHRzOiByZXN1bHRzIH07XG4gICAgfSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hldGhlciBpdCB3YXMgc3VjY2Vzc2Z1bC5cbi8vIFBvcHVsYXRlcyB0aGlzLnJlc3BvbnNlLmNvdW50IHdpdGggdGhlIGNvdW50XG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5Db3VudCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmRvQ291bnQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5maW5kT3B0aW9ucy5jb3VudCA9IHRydWU7XG4gIGRlbGV0ZSB0aGlzLmZpbmRPcHRpb25zLnNraXA7XG4gIGRlbGV0ZSB0aGlzLmZpbmRPcHRpb25zLmxpbWl0O1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZCh0aGlzLmNsYXNzTmFtZSwgdGhpcy5yZXN0V2hlcmUsIHRoaXMuZmluZE9wdGlvbnMpLnRoZW4oYyA9PiB7XG4gICAgdGhpcy5yZXNwb25zZS5jb3VudCA9IGM7XG4gIH0pO1xufTtcblxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuZGVueVByb3RlY3RlZEZpZWxkcyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBzY2hlbWFDb250cm9sbGVyID0gYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSgpO1xuICBjb25zdCBwcm90ZWN0ZWRGaWVsZHMgPVxuICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHRoaXMucmVzdFdoZXJlLFxuICAgICAgdGhpcy5maW5kT3B0aW9ucy5hY2wsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB0aGlzLmZpbmRPcHRpb25zXG4gICAgKSB8fCBbXTtcbiAgZm9yIChjb25zdCBrZXkgb2YgcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgaWYgKHRoaXMucmVzdFdoZXJlW2tleV0pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFRoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBxdWVyeSAke2tleX0gb24gY2xhc3MgJHt0aGlzLmNsYXNzTmFtZX1gXG4gICAgICApO1xuICAgIH1cbiAgfVxufTtcblxuLy8gQXVnbWVudHMgdGhpcy5yZXNwb25zZSB3aXRoIGFsbCBwb2ludGVycyBvbiBhbiBvYmplY3Rcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGVBbGwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5pbmNsdWRlQWxsKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5sb2FkU2NoZW1hKClcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgY29uc3QgaW5jbHVkZUZpZWxkcyA9IFtdO1xuICAgICAgY29uc3Qga2V5RmllbGRzID0gW107XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykgfHxcbiAgICAgICAgICAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnQXJyYXknKVxuICAgICAgICApIHtcbiAgICAgICAgICBpbmNsdWRlRmllbGRzLnB1c2goW2ZpZWxkXSk7XG4gICAgICAgICAga2V5RmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBBZGQgZmllbGRzIHRvIGluY2x1ZGUsIGtleXMsIHJlbW92ZSBkdXBzXG4gICAgICB0aGlzLmluY2x1ZGUgPSBbLi4ubmV3IFNldChbLi4udGhpcy5pbmNsdWRlLCAuLi5pbmNsdWRlRmllbGRzXSldO1xuICAgICAgLy8gaWYgdGhpcy5rZXlzIG5vdCBzZXQsIHRoZW4gYWxsIGtleXMgYXJlIGFscmVhZHkgaW5jbHVkZWRcbiAgICAgIGlmICh0aGlzLmtleXMpIHtcbiAgICAgICAgdGhpcy5rZXlzID0gWy4uLm5ldyBTZXQoWy4uLnRoaXMua2V5cywgLi4ua2V5RmllbGRzXSldO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gVXBkYXRlcyBwcm9wZXJ0eSBgdGhpcy5rZXlzYCB0byBjb250YWluIGFsbCBrZXlzIGJ1dCB0aGUgb25lcyB1bnNlbGVjdGVkLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuaGFuZGxlRXhjbHVkZUtleXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5leGNsdWRlS2V5cykge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGhpcy5rZXlzKSB7XG4gICAgdGhpcy5rZXlzID0gdGhpcy5rZXlzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmxvYWRTY2hlbWEoKVxuICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEodGhpcy5jbGFzc05hbWUpKVxuICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKTtcbiAgICAgIHRoaXMua2V5cyA9IGZpZWxkcy5maWx0ZXIoayA9PiAhdGhpcy5leGNsdWRlS2V5cy5pbmNsdWRlcyhrKSk7XG4gICAgfSk7XG59O1xuXG4vLyBBdWdtZW50cyB0aGlzLnJlc3BvbnNlIHdpdGggZGF0YSBhdCB0aGUgcGF0aHMgcHJvdmlkZWQgaW4gdGhpcy5pbmNsdWRlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuaGFuZGxlSW5jbHVkZSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaW5jbHVkZS5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBwYXRoUmVzcG9uc2UgPSBpbmNsdWRlUGF0aChcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmF1dGgsXG4gICAgdGhpcy5yZXNwb25zZSxcbiAgICB0aGlzLmluY2x1ZGVbMF0sXG4gICAgdGhpcy5yZXN0T3B0aW9uc1xuICApO1xuICBpZiAocGF0aFJlc3BvbnNlLnRoZW4pIHtcbiAgICByZXR1cm4gcGF0aFJlc3BvbnNlLnRoZW4obmV3UmVzcG9uc2UgPT4ge1xuICAgICAgdGhpcy5yZXNwb25zZSA9IG5ld1Jlc3BvbnNlO1xuICAgICAgdGhpcy5pbmNsdWRlID0gdGhpcy5pbmNsdWRlLnNsaWNlKDEpO1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZSgpO1xuICAgIH0pO1xuICB9IGVsc2UgaWYgKHRoaXMuaW5jbHVkZS5sZW5ndGggPiAwKSB7XG4gICAgdGhpcy5pbmNsdWRlID0gdGhpcy5pbmNsdWRlLnNsaWNlKDEpO1xuICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgfVxuXG4gIHJldHVybiBwYXRoUmVzcG9uc2U7XG59O1xuXG4vL1JldHVybnMgYSBwcm9taXNlIG9mIGEgcHJvY2Vzc2VkIHNldCBvZiByZXN1bHRzXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5BZnRlckZpbmRUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF0aGlzLnJ1bkFmdGVyRmluZCkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlckZpbmQnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyRmluZEhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGlmICghaGFzQWZ0ZXJGaW5kSG9vaykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBTa2lwIEFnZ3JlZ2F0ZSBhbmQgRGlzdGluY3QgUXVlcmllc1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5waXBlbGluZSB8fCB0aGlzLmZpbmRPcHRpb25zLmRpc3RpbmN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMucmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gdGhpcy5yZXN0V2hlcmU7XG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuICAvLyBSdW4gYWZ0ZXJGaW5kIHRyaWdnZXIgYW5kIHNldCB0aGUgbmV3IHJlc3VsdHNcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzLFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICBwYXJzZVF1ZXJ5LFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gRW5zdXJlIHdlIHByb3Blcmx5IHNldCB0aGUgY2xhc3NOYW1lIGJhY2tcbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICAgICAgb2JqZWN0ID0gb2JqZWN0LnRvSlNPTigpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3QuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHM7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVBdXRoQWRhcHRlcnMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCB0aGlzLmZpbmRPcHRpb25zLmV4cGxhaW4pIHtcbiAgICByZXR1cm47XG4gIH1cbiAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzLm1hcChyZXN1bHQgPT5cbiAgICAgIHRoaXMuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5ydW5BZnRlckZpbmQoXG4gICAgICAgIHsgY29uZmlnOiB0aGlzLmNvbmZpZywgYXV0aDogdGhpcy5hdXRoIH0sXG4gICAgICAgIHJlc3VsdC5hdXRoRGF0YVxuICAgICAgKVxuICAgIClcbiAgKTtcbn07XG5cbi8vIEFkZHMgaW5jbHVkZWQgdmFsdWVzIHRvIHRoZSByZXNwb25zZS5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkIG5hbWVzLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGFuIGF1Z21lbnRlZCByZXNwb25zZS5cbmZ1bmN0aW9uIGluY2x1ZGVQYXRoKGNvbmZpZywgYXV0aCwgcmVzcG9uc2UsIHBhdGgsIHJlc3RPcHRpb25zID0ge30pIHtcbiAgdmFyIHBvaW50ZXJzID0gZmluZFBvaW50ZXJzKHJlc3BvbnNlLnJlc3VsdHMsIHBhdGgpO1xuICBpZiAocG9pbnRlcnMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cbiAgY29uc3QgcG9pbnRlcnNIYXNoID0ge307XG4gIGZvciAodmFyIHBvaW50ZXIgb2YgcG9pbnRlcnMpIHtcbiAgICBpZiAoIXBvaW50ZXIpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc05hbWUgPSBwb2ludGVyLmNsYXNzTmFtZTtcbiAgICAvLyBvbmx5IGluY2x1ZGUgdGhlIGdvb2QgcG9pbnRlcnNcbiAgICBpZiAoY2xhc3NOYW1lKSB7XG4gICAgICBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSA9IHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdIHx8IG5ldyBTZXQoKTtcbiAgICAgIHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdLmFkZChwb2ludGVyLm9iamVjdElkKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgaW5jbHVkZVJlc3RPcHRpb25zID0ge307XG4gIGlmIChyZXN0T3B0aW9ucy5rZXlzKSB7XG4gICAgY29uc3Qga2V5cyA9IG5ldyBTZXQocmVzdE9wdGlvbnMua2V5cy5zcGxpdCgnLCcpKTtcbiAgICBjb25zdCBrZXlTZXQgPSBBcnJheS5mcm9tKGtleXMpLnJlZHVjZSgoc2V0LCBrZXkpID0+IHtcbiAgICAgIGNvbnN0IGtleVBhdGggPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgIGxldCBpID0gMDtcbiAgICAgIGZvciAoaTsgaSA8IHBhdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHBhdGhbaV0gIT0ga2V5UGF0aFtpXSkge1xuICAgICAgICAgIHJldHVybiBzZXQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChpIDwga2V5UGF0aC5sZW5ndGgpIHtcbiAgICAgICAgc2V0LmFkZChrZXlQYXRoW2ldKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzZXQ7XG4gICAgfSwgbmV3IFNldCgpKTtcbiAgICBpZiAoa2V5U2V0LnNpemUgPiAwKSB7XG4gICAgICBpbmNsdWRlUmVzdE9wdGlvbnMua2V5cyA9IEFycmF5LmZyb20oa2V5U2V0KS5qb2luKCcsJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzKSB7XG4gICAgY29uc3QgZXhjbHVkZUtleXMgPSBuZXcgU2V0KHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzLnNwbGl0KCcsJykpO1xuICAgIGNvbnN0IGV4Y2x1ZGVLZXlTZXQgPSBBcnJheS5mcm9tKGV4Y2x1ZGVLZXlzKS5yZWR1Y2UoKHNldCwga2V5KSA9PiB7XG4gICAgICBjb25zdCBrZXlQYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICBsZXQgaSA9IDA7XG4gICAgICBmb3IgKGk7IGkgPCBwYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChwYXRoW2ldICE9IGtleVBhdGhbaV0pIHtcbiAgICAgICAgICByZXR1cm4gc2V0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaSA9PSBrZXlQYXRoLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgc2V0LmFkZChrZXlQYXRoW2ldKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzZXQ7XG4gICAgfSwgbmV3IFNldCgpKTtcbiAgICBpZiAoZXhjbHVkZUtleVNldC5zaXplID4gMCkge1xuICAgICAgaW5jbHVkZVJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzID0gQXJyYXkuZnJvbShleGNsdWRlS2V5U2V0KS5qb2luKCcsJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSkge1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBjb25zdCBxdWVyeVByb21pc2VzID0gT2JqZWN0LmtleXMocG9pbnRlcnNIYXNoKS5tYXAoYXN5bmMgY2xhc3NOYW1lID0+IHtcbiAgICBjb25zdCBvYmplY3RJZHMgPSBBcnJheS5mcm9tKHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdKTtcbiAgICBsZXQgd2hlcmU7XG4gICAgaWYgKG9iamVjdElkcy5sZW5ndGggPT09IDEpIHtcbiAgICAgIHdoZXJlID0geyBvYmplY3RJZDogb2JqZWN0SWRzWzBdIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHdoZXJlID0geyBvYmplY3RJZDogeyAkaW46IG9iamVjdElkcyB9IH07XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogb2JqZWN0SWRzLmxlbmd0aCA9PT0gMSA/IFJlc3RRdWVyeS5NZXRob2QuZ2V0IDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgICAgY29uZmlnLFxuICAgICAgYXV0aCxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHJlc3RXaGVyZTogd2hlcmUsXG4gICAgICByZXN0T3B0aW9uczogaW5jbHVkZVJlc3RPcHRpb25zLFxuICAgIH0pO1xuICAgIHJldHVybiBxdWVyeS5leGVjdXRlKHsgb3A6ICdnZXQnIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICByZXN1bHRzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0cyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIEdldCB0aGUgb2JqZWN0cyBmb3IgYWxsIHRoZXNlIG9iamVjdCBpZHNcbiAgcmV0dXJuIFByb21pc2UuYWxsKHF1ZXJ5UHJvbWlzZXMpLnRoZW4ocmVzcG9uc2VzID0+IHtcbiAgICB2YXIgcmVwbGFjZSA9IHJlc3BvbnNlcy5yZWR1Y2UoKHJlcGxhY2UsIGluY2x1ZGVSZXNwb25zZSkgPT4ge1xuICAgICAgZm9yICh2YXIgb2JqIG9mIGluY2x1ZGVSZXNwb25zZS5yZXN1bHRzKSB7XG4gICAgICAgIG9iai5fX3R5cGUgPSAnT2JqZWN0JztcbiAgICAgICAgb2JqLmNsYXNzTmFtZSA9IGluY2x1ZGVSZXNwb25zZS5jbGFzc05hbWU7XG5cbiAgICAgICAgaWYgKG9iai5jbGFzc05hbWUgPT0gJ19Vc2VyJyAmJiAhYXV0aC5pc01hc3Rlcikge1xuICAgICAgICAgIGRlbGV0ZSBvYmouc2Vzc2lvblRva2VuO1xuICAgICAgICAgIGRlbGV0ZSBvYmouYXV0aERhdGE7XG4gICAgICAgIH1cbiAgICAgICAgcmVwbGFjZVtvYmoub2JqZWN0SWRdID0gb2JqO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcGxhY2U7XG4gICAgfSwge30pO1xuXG4gICAgdmFyIHJlc3AgPSB7XG4gICAgICByZXN1bHRzOiByZXBsYWNlUG9pbnRlcnMocmVzcG9uc2UucmVzdWx0cywgcGF0aCwgcmVwbGFjZSksXG4gICAgfTtcbiAgICBpZiAocmVzcG9uc2UuY291bnQpIHtcbiAgICAgIHJlc3AuY291bnQgPSByZXNwb25zZS5jb3VudDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3A7XG4gIH0pO1xufVxuXG4vLyBPYmplY3QgbWF5IGJlIGEgbGlzdCBvZiBSRVNULWZvcm1hdCBvYmplY3QgdG8gZmluZCBwb2ludGVycyBpbiwgb3Jcbi8vIGl0IG1heSBiZSBhIHNpbmdsZSBvYmplY3QuXG4vLyBJZiB0aGUgcGF0aCB5aWVsZHMgdGhpbmdzIHRoYXQgYXJlbid0IHBvaW50ZXJzLCB0aGlzIHRocm93cyBhbiBlcnJvci5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkcyB0byBzZWFyY2ggaW50by5cbi8vIFJldHVybnMgYSBsaXN0IG9mIHBvaW50ZXJzIGluIFJFU1QgZm9ybWF0LlxuZnVuY3Rpb24gZmluZFBvaW50ZXJzKG9iamVjdCwgcGF0aCkge1xuICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICB2YXIgYW5zd2VyID0gW107XG4gICAgZm9yICh2YXIgeCBvZiBvYmplY3QpIHtcbiAgICAgIGFuc3dlciA9IGFuc3dlci5jb25jYXQoZmluZFBvaW50ZXJzKHgsIHBhdGgpKTtcbiAgICB9XG4gICAgcmV0dXJuIGFuc3dlcjtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgaWYgKHBhdGgubGVuZ3RoID09IDApIHtcbiAgICBpZiAob2JqZWN0ID09PSBudWxsIHx8IG9iamVjdC5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gW29iamVjdF07XG4gICAgfVxuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG4gIHJldHVybiBmaW5kUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpKTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0cyB0byByZXBsYWNlIHBvaW50ZXJzXG4vLyBpbiwgb3IgaXQgbWF5IGJlIGEgc2luZ2xlIG9iamVjdC5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkcyB0byBzZWFyY2ggaW50by5cbi8vIHJlcGxhY2UgaXMgYSBtYXAgZnJvbSBvYmplY3QgaWQgLT4gb2JqZWN0LlxuLy8gUmV0dXJucyBzb21ldGhpbmcgYW5hbG9nb3VzIHRvIG9iamVjdCwgYnV0IHdpdGggdGhlIGFwcHJvcHJpYXRlXG4vLyBwb2ludGVycyBpbmZsYXRlZC5cbmZ1bmN0aW9uIHJlcGxhY2VQb2ludGVycyhvYmplY3QsIHBhdGgsIHJlcGxhY2UpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIG9iamVjdFxuICAgICAgLm1hcChvYmogPT4gcmVwbGFjZVBvaW50ZXJzKG9iaiwgcGF0aCwgcmVwbGFjZSkpXG4gICAgICAuZmlsdGVyKG9iaiA9PiB0eXBlb2Ygb2JqICE9PSAndW5kZWZpbmVkJyk7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgIW9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHtcbiAgICBpZiAob2JqZWN0ICYmIG9iamVjdC5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgcmV0dXJuIHJlcGxhY2Vbb2JqZWN0Lm9iamVjdElkXTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICB2YXIgbmV3c3ViID0gcmVwbGFjZVBvaW50ZXJzKHN1Ym9iamVjdCwgcGF0aC5zbGljZSgxKSwgcmVwbGFjZSk7XG4gIHZhciBhbnN3ZXIgPSB7fTtcbiAgZm9yICh2YXIga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChrZXkgPT0gcGF0aFswXSkge1xuICAgICAgYW5zd2VyW2tleV0gPSBuZXdzdWI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFuc3dlcltrZXldID0gb2JqZWN0W2tleV07XG4gICAgfVxuICB9XG4gIHJldHVybiBhbnN3ZXI7XG59XG5cbi8vIEZpbmRzIGEgc3Vib2JqZWN0IHRoYXQgaGFzIHRoZSBnaXZlbiBrZXksIGlmIHRoZXJlIGlzIG9uZS5cbi8vIFJldHVybnMgdW5kZWZpbmVkIG90aGVyd2lzZS5cbmZ1bmN0aW9uIGZpbmRPYmplY3RXaXRoS2V5KHJvb3QsIGtleSkge1xuICBpZiAodHlwZW9mIHJvb3QgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChyb290IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICBmb3IgKHZhciBpdGVtIG9mIHJvb3QpIHtcbiAgICAgIGNvbnN0IGFuc3dlciA9IGZpbmRPYmplY3RXaXRoS2V5KGl0ZW0sIGtleSk7XG4gICAgICBpZiAoYW5zd2VyKSB7XG4gICAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChyb290ICYmIHJvb3Rba2V5XSkge1xuICAgIHJldHVybiByb290O1xuICB9XG4gIGZvciAodmFyIHN1YmtleSBpbiByb290KSB7XG4gICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkocm9vdFtzdWJrZXldLCBrZXkpO1xuICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmVzdFF1ZXJ5O1xuLy8gRm9yIHRlc3RzXG5tb2R1bGUuZXhwb3J0cy5fVW5zYWZlUmVzdFF1ZXJ5ID0gX1Vuc2FmZVJlc3RRdWVyeTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBOztBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQWdDLENBQUM7QUFDaEUsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUNDLEtBQUs7QUFDdkMsTUFBTUMsUUFBUSxHQUFHRixPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ3RDLE1BQU07RUFBRUc7QUFBYyxDQUFDLEdBQUdILE9BQU8sQ0FBQyw2QkFBNkIsQ0FBQztBQUNoRSxNQUFNSSxrQkFBa0IsR0FBRyxDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQztBQUN4RSxNQUFNO0VBQUVDO0FBQW9CLENBQUMsR0FBR0wsT0FBTyxDQUFDLGNBQWMsQ0FBQzs7QUFFdkQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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