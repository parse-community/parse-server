// An object that encapsulates everything we need to run a 'find'
// operation, encoded in the REST API format.

var Schema = require('./Schema');
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
function RestQuery(config, auth, className, restWhere = {}, restOptions = {}) {

  this.config = config;
  this.auth = auth;
  this.className = className;
  this.restWhere = restWhere;
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
RestQuery.prototype.execute = function() {
  return Promise.resolve().then(() => {
    return this.buildRestWhere();
  }).then(() => {
    return this.runFind();
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
    roles.push(this.auth.user.id);
    this.findOptions.acl = roles;
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
  let sysClass = Schema.systemClasses;
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster
      && sysClass.indexOf(this.className) === -1) {
    return this.config.database.collectionExists(this.className).then((hasClass) => {
      if (hasClass === true) {
        return Promise.resolve();
      }

      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN,
                            'This user is not allowed to access ' +
                            'non-existent class: ' + this.className);
    });
  } else {
    return Promise.resolve();
  }
};

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
    var values = [];
    for (var result of response.results) {
      values.push({
        __type: 'Pointer',
        className: subquery.className,
        objectId: result.objectId
      });
    }
    delete inQueryObject['$inQuery'];
    if (Array.isArray(inQueryObject['$in'])) {
      inQueryObject['$in'] = inQueryObject['$in'].concat(values);
    } else {
      inQueryObject['$in'] = values;
    }
    // Recurse to repeat
    return this.replaceInQuery();
  });
};

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
    var values = [];
    for (var result of response.results) {
      values.push({
        __type: 'Pointer',
        className: subquery.className,
        objectId: result.objectId
      });
    }
    delete notInQueryObject['$notInQuery'];
    if (Array.isArray(notInQueryObject['$nin'])) {
      notInQueryObject['$nin'] = notInQueryObject['$nin'].concat(values);
    } else {
      notInQueryObject['$nin'] = values;
    }

    // Recurse to repeat
    return this.replaceNotInQuery();
  });
};

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
    var values = [];
    for (var result of response.results) {
      values.push(result[selectValue.key]);
    }
    delete selectObject['$select'];
    if (Array.isArray(selectObject['$in'])) {
      selectObject['$in'] = selectObject['$in'].concat(values);
    } else {
      selectObject['$in'] = values;
    }

    // Keep replacing $select clauses
    return this.replaceSelect();
  })
};

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
    var values = [];
    for (var result of response.results) {
      values.push(result[dontSelectValue.key]);
    }
    delete dontSelectObject['$dontSelect'];
    if (Array.isArray(dontSelectObject['$nin'])) {
      dontSelectObject['$nin'] = dontSelectObject['$nin'].concat(values);
    } else {
      dontSelectObject['$nin'] = values;
    }

    // Keep replacing $dontSelect clauses
    return this.replaceDontSelect();
  })
};

// Returns a promise for whether it was successful.
// Populates this.response with an object that only has 'results'.
RestQuery.prototype.runFind = function() {
  return this.config.database.find(
    this.className, this.restWhere, this.findOptions).then((results) => {
    if (this.className == '_User') {
      for (var result of results) {
        delete result.password;
      }
    }

    this.config.filesController.expandFilesInObject(this.config, results);

    if (this.keys) {
      var keySet = this.keys;
      results = results.map((object) => {
        var newObject = {};
        for (var key in object) {
          if (keySet.has(key)) {
            newObject[key] = object[key];
          }
        }
        return newObject;
      });
    }

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
                                 this.response, this.include[0]);
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
function includePath(config, auth, response, path) {
  var pointers = findPointers(response.results, path);
  if (pointers.length == 0) {
    return response;
  }
  var className = null;
  var objectIds = {};
  for (var pointer of pointers) {
    if (className === null) {
      className = pointer.className;
    } else {
      if (className != pointer.className) {
        throw new Parse.Error(Parse.Error.INVALID_JSON,
                              'inconsistent type data for include');
      }
    }
    objectIds[pointer.objectId] = true;
  }
  if (!className) {
    throw new Parse.Error(Parse.Error.INVALID_JSON,
                          'bad pointers');
  }

  // Get the objects for all these object ids
  var where = {'objectId': {'$in': Object.keys(objectIds)}};
  var query = new RestQuery(config, auth, className, where);
  return query.execute().then((includeResponse) => {
    var replace = {};
    for (var obj of includeResponse.results) {
      obj.__type = 'Object';
      obj.className = className;

      if(className == "_User"){
        delete obj.sessionToken;
      }

      replace[obj.objectId] = obj;
    }
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

  if (typeof object !== 'object') {
    throw new Parse.Error(Parse.Error.INVALID_QUERY,
                          'can only include pointer fields');
  }

  if (path.length == 0) {
    if (object.__type == 'Pointer') {
      return [object];
    }
    throw new Parse.Error(Parse.Error.INVALID_QUERY,
                          'can only include pointer fields');
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
    return object.map((obj) => replacePointers(obj, path, replace));
  }

  if (typeof object !== 'object') {
    return object;
  }

  if (path.length == 0) {
    if (object.__type == 'Pointer') {
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
