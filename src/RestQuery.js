// An object that encapsulates everything we need to run a 'find'
// operation, encoded in the REST API format.

var SchemaController = require('./Controllers/SchemaController');
var Parse = require('parse/node').Parse;

import { default as FilesController } from './Controllers/FilesController';

// restOptions can include:
//   skip
//   limit
//   order
//   count
//   include
//   keys
//   redirectClassNameForKey
function RestQuery(config, auth, className, restWhere = {}, restOptions = {}, clientSDK) {

  this.config = config;
  this.auth = auth;
  this.className = className;
  this.restWhere = restWhere;
  this.restOptions = restOptions;
  this.clientSDK = clientSDK;
  this.response = null;
  this.findOptions = {};
  if (!this.auth.isMaster) {
    this.findOptions.acl = this.auth.user ? [this.auth.user.id] : null;
    if (this.className == '_Session') {
      if (!this.findOptions.acl) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN,
                              'This session token is invalid.');
      }
      this.restWhere = {
        '$and': [this.restWhere, {
           'user': {
              __type: 'Pointer',
              className: '_User',
              objectId: this.auth.user.id
           }
        }]
      };
    }
  }

  this.doCount = false;

  // The format for this.include is not the same as the format for the
  // include option - it's the paths we should include, in order,
  // stored as arrays, taking into account that we need to include foo
  // before including foo.bar. Also it should dedupe.
  // For example, passing an arg of include=foo.bar,foo.baz could lead to
  // this.include = [['foo'], ['foo', 'baz'], ['foo', 'bar']]
  this.include = [];

  for (var option in restOptions) {
    switch(option) {
    case 'keys':
      this.keys = new Set(restOptions.keys.split(','));
        // Add the default
      this.keys.add('objectId');
      this.keys.add('createdAt');
      this.keys.add('updatedAt');
      break;
    case 'count':
      this.doCount = true;
      break;
    case 'skip':
    case 'limit':
      this.findOptions[option] = restOptions[option];
      break;
    case 'order':
      var fields = restOptions.order.split(',');
      var sortMap = {};
      for (var field of fields) {
        if (field[0] == '-') {
          sortMap[field.slice(1)] = -1;
        } else {
          sortMap[field] = 1;
        }
      }
      this.findOptions.sort = sortMap;
      break;
    case 'include':
      var paths = restOptions.include.split(',');
      var pathSet = {};
      for (var path of paths) {
        // Add all prefixes with a .-split to pathSet
        var parts = path.split('.');
        for (var len = 1; len <= parts.length; len++) {
          pathSet[parts.slice(0, len).join('.')] = true;
        }
      }
      this.include = Object.keys(pathSet).sort((a, b) => {
        return a.length - b.length;
      }).map((s) => {
        return s.split('.');
      });
      break;
    case 'redirectClassNameForKey':
      this.redirectKey = restOptions.redirectClassNameForKey;
      this.redirectClassName = null;
      break;
    default:
      throw new Parse.Error(Parse.Error.INVALID_JSON,
                            'bad option: ' + option);
    }
  }
}

// A convenient method to perform all the steps of processing a query
// in order.
// Returns a promise for the response - an object with optional keys
// 'results' and 'count'.
// TODO: consolidate the replaceX functions
RestQuery.prototype.execute = function(executeOptions) {
  return Promise.resolve().then(() => {
    return this.buildRestWhere();
  }).then(() => {
    return this.runFind(executeOptions);
  }).then(() => {
    return this.runCount();
  }).then(() => {
    return this.handleInclude();
  }).then(() => {
    return this.response;
  });
};

RestQuery.prototype.buildRestWhere = function() {
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
  });
}

// Uses the Auth object to get the list of roles, adds the user id
RestQuery.prototype.getUserAndRoleACL = function() {
  if (this.auth.isMaster || !this.auth.user) {
    return Promise.resolve();
  }
  return this.auth.getUserRoles().then((roles) => {
    // Concat with the roles to prevent duplications on multiple calls
    const aclSet = new Set([].concat(this.findOptions.acl, roles));
    this.findOptions.acl = Array.from(aclSet);
    return Promise.resolve();
  });
};

// Changes the className if redirectClassNameForKey is set.
// Returns a promise.
RestQuery.prototype.redirectClassNameForKey = function() {
  if (!this.redirectKey) {
    return Promise.resolve();
  }

  // We need to change the class name based on the schema
  return this.config.database.redirectClassNameForKey(
    this.className, this.redirectKey).then((newClassName) => {
      this.className = newClassName;
      this.redirectClassName = newClassName;
    });
};

// Validates this operation against the allowClientClassCreation config.
RestQuery.prototype.validateClientClassCreation = function() {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster
      && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema()
      .then(schemaController => schemaController.hasClass(this.className))
      .then(hasClass => {
        if (hasClass !== true) {
          throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN,
                                'This user is not allowed to access ' +
                                'non-existent class: ' + this.className);
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
RestQuery.prototype.replaceInQuery = function() {
  var inQueryObject = findObjectWithKey(this.restWhere, '$inQuery');
  if (!inQueryObject) {
    return;
  }

  // The inQuery value must have precisely two keys - where and className
  var inQueryValue = inQueryObject['$inQuery'];
  if (!inQueryValue.where || !inQueryValue.className) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY,
                          'improper usage of $inQuery');
  }

  let additionalOptions = {
    redirectClassNameForKey: inQueryValue.redirectClassNameForKey
  };

  var subquery = new RestQuery(
    this.config, this.auth, inQueryValue.className,
    inQueryValue.where, additionalOptions);
  return subquery.execute().then((response) => {
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
RestQuery.prototype.replaceNotInQuery = function() {
  var notInQueryObject = findObjectWithKey(this.restWhere, '$notInQuery');
  if (!notInQueryObject) {
    return;
  }

  // The notInQuery value must have precisely two keys - where and className
  var notInQueryValue = notInQueryObject['$notInQuery'];
  if (!notInQueryValue.where || !notInQueryValue.className) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY,
                          'improper usage of $notInQuery');
  }

  let additionalOptions = {
    redirectClassNameForKey: notInQueryValue.redirectClassNameForKey
  };

  var subquery = new RestQuery(
    this.config, this.auth, notInQueryValue.className,
    notInQueryValue.where, additionalOptions);
  return subquery.execute().then((response) => {
    transformNotInQuery(notInQueryObject, subquery.className, response.results);
    // Recurse to repeat
    return this.replaceNotInQuery();
  });
};

const transformSelect = (selectObject, key ,objects) => {
  var values = [];
  for (var result of objects) {
    values.push(result[key]);
  }
  delete selectObject['$select'];
  if (Array.isArray(selectObject['$in'])) {
    selectObject['$in'] = selectObject['$in'].concat(values);
  } else {
    selectObject['$in'] = values;
  }
}

// Replaces a $select clause by running the subquery, if there is a
// $select clause.
// The $select clause turns into an $in with values selected out of
// the subquery.
// Returns a possible-promise.
RestQuery.prototype.replaceSelect = function() {
  var selectObject = findObjectWithKey(this.restWhere, '$select');
  if (!selectObject) {
    return;
  }

  // The select value must have precisely two keys - query and key
  var selectValue = selectObject['$select'];
  // iOS SDK don't send where if not set, let it pass
  if (!selectValue.query ||
      !selectValue.key ||
      typeof selectValue.query !== 'object' ||
      !selectValue.query.className ||
      Object.keys(selectValue).length !== 2) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY,
                          'improper usage of $select');
  }

  let additionalOptions = {
    redirectClassNameForKey: selectValue.query.redirectClassNameForKey
  };

  var subquery = new RestQuery(
    this.config, this.auth, selectValue.query.className,
    selectValue.query.where, additionalOptions);
  return subquery.execute().then((response) => {
    transformSelect(selectObject, selectValue.key, response.results);
    // Keep replacing $select clauses
    return this.replaceSelect();
  })
};

const transformDontSelect = (dontSelectObject, key, objects) => {
  var values = [];
  for (var result of objects) {
    values.push(result[key]);
  }
  delete dontSelectObject['$dontSelect'];
  if (Array.isArray(dontSelectObject['$nin'])) {
    dontSelectObject['$nin'] = dontSelectObject['$nin'].concat(values);
  } else {
    dontSelectObject['$nin'] = values;
  }
}

// Replaces a $dontSelect clause by running the subquery, if there is a
// $dontSelect clause.
// The $dontSelect clause turns into an $nin with values selected out of
// the subquery.
// Returns a possible-promise.
RestQuery.prototype.replaceDontSelect = function() {
  var dontSelectObject = findObjectWithKey(this.restWhere, '$dontSelect');
  if (!dontSelectObject) {
    return;
  }

  // The dontSelect value must have precisely two keys - query and key
  var dontSelectValue = dontSelectObject['$dontSelect'];
  if (!dontSelectValue.query ||
      !dontSelectValue.key ||
      typeof dontSelectValue.query !== 'object' ||
      !dontSelectValue.query.className ||
      Object.keys(dontSelectValue).length !== 2) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY,
                          'improper usage of $dontSelect');
  }
  let additionalOptions = {
    redirectClassNameForKey: dontSelectValue.query.redirectClassNameForKey
  };

  var subquery = new RestQuery(
    this.config, this.auth, dontSelectValue.query.className,
    dontSelectValue.query.where, additionalOptions);
  return subquery.execute().then((response) => {
    transformDontSelect(dontSelectObject, dontSelectValue.key, response.results);
    // Keep replacing $dontSelect clauses
    return this.replaceDontSelect();
  })
};

// Returns a promise for whether it was successful.
// Populates this.response with an object that only has 'results'.
RestQuery.prototype.runFind = function(options = {}) {
  if (this.findOptions.limit === 0) {
    this.response = {results: []};
    return Promise.resolve();
  }
  let findOptions = Object.assign({}, this.findOptions);
  if (this.keys) {
    findOptions.keys = Array.from(this.keys).map((key) => {
      return key.split('.')[0];
    });
  }
  if (options.op) {
      findOptions.op = options.op;
  }
  return this.config.database.find(
    this.className, this.restWhere, findOptions).then((results) => {
    if (this.className === '_User') {
      for (var result of results) {
        delete result.password;

        if (result.authData) {
          Object.keys(result.authData).forEach((provider) => {
            if (result.authData[provider] === null) {
              delete result.authData[provider];
            }
          });
          if (Object.keys(result.authData).length == 0) {
            delete result.authData;
          }
        }
      }
    }

    this.config.filesController.expandFilesInObject(this.config, results);

    if (this.redirectClassName) {
      for (var r of results) {
        r.className = this.redirectClassName;
      }
    }
    this.response = {results: results};
  });
};

// Returns a promise for whether it was successful.
// Populates this.response.count with the count
RestQuery.prototype.runCount = function() {
  if (!this.doCount) {
    return;
  }
  this.findOptions.count = true;
  delete this.findOptions.skip;
  delete this.findOptions.limit;
  return this.config.database.find(
    this.className, this.restWhere, this.findOptions).then((c) => {
      this.response.count = c;
    });
};

// Augments this.response with data at the paths provided in this.include.
RestQuery.prototype.handleInclude = function() {
  if (this.include.length == 0) {
    return;
  }

  var pathResponse = includePath(this.config, this.auth,
                                 this.response, this.include[0], this.restOptions);
  if (pathResponse.then) {
    return pathResponse.then((newResponse) => {
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

// Adds included values to the response.
// Path is a list of field names.
// Returns a promise for an augmented response.
function includePath(config, auth, response, path, restOptions = {}) {
  var pointers = findPointers(response.results, path);
  if (pointers.length == 0) {
    return response;
  }
  let pointersHash = {};
  for (var pointer of pointers) {
    if (!pointer) {
      continue;
    }
    let className = pointer.className;
    // only include the good pointers
    if (className) {
      pointersHash[className] = pointersHash[className] || new Set();
      pointersHash[className].add(pointer.objectId);
    }
  }

  let includeRestOptions = {};
  if (restOptions.keys) {
    let keys = new Set(restOptions.keys.split(','));
    let keySet = Array.from(keys).reduce((set, key) => {
      let keyPath = key.split('.');
      let i=0;
      for (i; i<path.length; i++) {
        if (path[i] != keyPath[i]) {
          return set;
        }
      }
      set.add(keyPath[i]);
      return set;
    }, new Set());
    includeRestOptions.keys = Array.from(keySet).join(',');
  }

  let queryPromises = Object.keys(pointersHash).map((className) => {
    let where = {'objectId': {'$in': Array.from(pointersHash[className])}};
    var query = new RestQuery(config, auth, className, where, includeRestOptions);
    return query.execute({op: 'get'}).then((results) => {
      results.className = className;
      return Promise.resolve(results);
    })
  })

  // Get the objects for all these object ids
  return Promise.all(queryPromises).then((responses) => {
    var replace = responses.reduce((replace, includeResponse) => {
      for (var obj of includeResponse.results) {
        obj.__type = 'Object';
        obj.className = includeResponse.className;

        if (obj.className == "_User" && !auth.isMaster) {
          delete obj.sessionToken;
          delete obj.authData;
        }
        replace[obj.objectId] = obj;
      }
      return replace;
    }, {})

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
    return object.map((obj) => replacePointers(obj, path, replace))
             .filter((obj) => typeof obj !== 'undefined');
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
      var answer = findObjectWithKey(item, key);
      if (answer) {
        return answer;
      }
    }
  }
  if (root && root[key]) {
    return root;
  }
  for (var subkey in root) {
    var answer = findObjectWithKey(root[subkey], key);
    if (answer) {
      return answer;
    }
  }
}

module.exports = RestQuery;
