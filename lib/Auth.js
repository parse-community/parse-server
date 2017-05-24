'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var Parse = require('parse/node').Parse;
var RestQuery = require('./RestQuery');

// An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.
function Auth() {
  var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
      config = _ref.config,
      _ref$isMaster = _ref.isMaster,
      isMaster = _ref$isMaster === undefined ? false : _ref$isMaster,
      user = _ref.user,
      installationId = _ref.installationId;

  this.config = config;
  this.installationId = installationId;
  this.isMaster = isMaster;
  this.user = user;

  // Assuming a users roles won't change during a single request, we'll
  // only load them once.
  this.userRoles = [];
  this.fetchedRoles = false;
  this.rolePromise = null;
}

// Whether this auth could possibly modify the given user id.
// It still could be forbidden via ACLs even if this returns true.
Auth.prototype.couldUpdateUserId = function (userId) {
  if (this.isMaster) {
    return true;
  }
  if (this.user && this.user.id === userId) {
    return true;
  }
  return false;
};

// A helper to get a master-level Auth object
function master(config) {
  return new Auth({ config: config, isMaster: true });
}

// A helper to get a nobody-level Auth object
function nobody(config) {
  return new Auth({ config: config, isMaster: false });
}

// Returns a promise that resolves to an Auth object
var getAuthForSessionToken = function getAuthForSessionToken() {
  var _ref2 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
      config = _ref2.config,
      sessionToken = _ref2.sessionToken,
      installationId = _ref2.installationId;

  return config.cacheController.user.get(sessionToken).then(function (userJSON) {
    if (userJSON) {
      var cachedUser = Parse.Object.fromJSON(userJSON);
      return Promise.resolve(new Auth({ config: config, isMaster: false, installationId: installationId, user: cachedUser }));
    }

    var restOptions = {
      limit: 1,
      include: 'user'
    };

    var query = new RestQuery(config, master(config), '_Session', { sessionToken: sessionToken }, restOptions);
    return query.execute().then(function (response) {
      var results = response.results;
      if (results.length !== 1 || !results[0]['user']) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid session token');
      }

      var now = new Date(),
          expiresAt = results[0].expiresAt ? new Date(results[0].expiresAt.iso) : undefined;
      if (expiresAt < now) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token is expired.');
      }
      var obj = results[0]['user'];
      delete obj.password;
      obj['className'] = '_User';
      obj['sessionToken'] = sessionToken;
      config.cacheController.user.put(sessionToken, obj);
      var userObject = Parse.Object.fromJSON(obj);
      return new Auth({ config: config, isMaster: false, installationId: installationId, user: userObject });
    });
  });
};

var getAuthForLegacySessionToken = function getAuthForLegacySessionToken() {
  var _ref3 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
      config = _ref3.config,
      sessionToken = _ref3.sessionToken,
      installationId = _ref3.installationId;

  var restOptions = {
    limit: 1
  };
  var query = new RestQuery(config, master(config), '_User', { sessionToken: sessionToken }, restOptions);
  return query.execute().then(function (response) {
    var results = response.results;
    if (results.length !== 1) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid legacy session token');
    }
    var obj = results[0];
    obj.className = '_User';
    var userObject = Parse.Object.fromJSON(obj);
    return new Auth({ config: config, isMaster: false, installationId: installationId, user: userObject });
  });
};

// Returns a promise that resolves to an array of role names
Auth.prototype.getUserRoles = function () {
  if (this.isMaster || !this.user) {
    return Promise.resolve([]);
  }
  if (this.fetchedRoles) {
    return Promise.resolve(this.userRoles);
  }
  if (this.rolePromise) {
    return this.rolePromise;
  }
  this.rolePromise = this._loadRoles();
  return this.rolePromise;
};

// Iterates through the role tree and compiles a users roles
Auth.prototype._loadRoles = function () {
  var _this = this;

  var cacheAdapter = this.config.cacheController;
  return cacheAdapter.role.get(this.user.id).then(function (cachedRoles) {
    if (cachedRoles != null) {
      _this.fetchedRoles = true;
      _this.userRoles = cachedRoles;
      return Promise.resolve(cachedRoles);
    }

    var restWhere = {
      'users': {
        __type: 'Pointer',
        className: '_User',
        objectId: _this.user.id
      }
    };
    // First get the role ids this user is directly a member of
    var query = new RestQuery(_this.config, master(_this.config), '_Role', restWhere, {});
    return query.execute().then(function (response) {
      var results = response.results;
      if (!results.length) {
        _this.userRoles = [];
        _this.fetchedRoles = true;
        _this.rolePromise = null;

        cacheAdapter.role.put(_this.user.id, _this.userRoles);
        return Promise.resolve(_this.userRoles);
      }
      var rolesMap = results.reduce(function (m, r) {
        m.names.push(r.name);
        m.ids.push(r.objectId);
        return m;
      }, { ids: [], names: [] });

      // run the recursive finding
      return _this._getAllRolesNamesForRoleIds(rolesMap.ids, rolesMap.names).then(function (roleNames) {
        _this.userRoles = roleNames.map(function (r) {
          return 'role:' + r;
        });
        _this.fetchedRoles = true;
        _this.rolePromise = null;

        cacheAdapter.role.put(_this.user.id, _this.userRoles);
        return Promise.resolve(_this.userRoles);
      });
    });
  });
};

// Given a list of roleIds, find all the parent roles, returns a promise with all names
Auth.prototype._getAllRolesNamesForRoleIds = function (roleIDs) {
  var _this2 = this;

  var names = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
  var queriedRoles = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

  var ins = roleIDs.filter(function (roleID) {
    return queriedRoles[roleID] !== true;
  }).map(function (roleID) {
    // mark as queried
    queriedRoles[roleID] = true;
    return {
      __type: 'Pointer',
      className: '_Role',
      objectId: roleID
    };
  });

  // all roles are accounted for, return the names
  if (ins.length == 0) {
    return Promise.resolve([].concat(_toConsumableArray(new Set(names))));
  }
  // Build an OR query across all parentRoles
  var restWhere = void 0;
  if (ins.length == 1) {
    restWhere = { 'roles': ins[0] };
  } else {
    restWhere = { 'roles': { '$in': ins } };
  }
  var query = new RestQuery(this.config, master(this.config), '_Role', restWhere, {});
  return query.execute().then(function (response) {
    var results = response.results;
    // Nothing found
    if (!results.length) {
      return Promise.resolve(names);
    }
    // Map the results with all Ids and names
    var resultMap = results.reduce(function (memo, role) {
      memo.names.push(role.name);
      memo.ids.push(role.objectId);
      return memo;
    }, { ids: [], names: [] });
    // store the new found names
    names = names.concat(resultMap.names);
    // find the next ones, circular roles will be cut
    return _this2._getAllRolesNamesForRoleIds(resultMap.ids, names, queriedRoles);
  }).then(function (names) {
    return Promise.resolve([].concat(_toConsumableArray(new Set(names))));
  });
};

module.exports = {
  Auth: Auth,
  master: master,
  nobody: nobody,
  getAuthForSessionToken: getAuthForSessionToken,
  getAuthForLegacySessionToken: getAuthForLegacySessionToken
};