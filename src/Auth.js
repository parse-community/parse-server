var Parse = require('parse/node').Parse;
var RestQuery = require('./RestQuery');

// An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.
function Auth({ config, isMaster = false, user, installationId } = {}) {
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
Auth.prototype.couldUpdateUserId = function(userId) {
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
  return new Auth({ config, isMaster: true });
}

// A helper to get a nobody-level Auth object
function nobody(config) {
  return new Auth({ config, isMaster: false });
}


// Returns a promise that resolves to an Auth object
var getAuthForSessionToken = function({ config, sessionToken, installationId } = {}) {
  return config.cacheController.user.get(sessionToken).then((userJSON) => {
    if (userJSON) {
      const cachedUser = Parse.Object.fromJSON(userJSON);
      return Promise.resolve(new Auth({config, isMaster: false, installationId, user: cachedUser}));
    }

    var restOptions = {
      limit: 1,
      include: 'user'
    };

    var query = new RestQuery(config, master(config), '_Session', {sessionToken}, restOptions);
    return query.execute().then((response) => {
      var results = response.results;
      if (results.length !== 1 || !results[0]['user']) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid session token');
      }

      var now = new Date(),
        expiresAt = results[0].expiresAt ? new Date(results[0].expiresAt.iso) : undefined;
      if (expiresAt < now) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN,
          'Session token is expired.');
      }
      var obj = results[0]['user'];
      delete obj.password;
      obj['className'] = '_User';
      obj['sessionToken'] = sessionToken;
      config.cacheController.user.put(sessionToken, obj);
      const userObject = Parse.Object.fromJSON(obj);
      return new Auth({config, isMaster: false, installationId, user: userObject});
    });
  });
};

var getAuthForLegacySessionToken = function({config, sessionToken, installationId } = {}) {
  var restOptions = {
    limit: 1
  };
  var query = new RestQuery(config, master(config), '_User', { sessionToken: sessionToken}, restOptions);
  return query.execute().then((response) => {
    var results = response.results;
    if (results.length !== 1) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid legacy session token');
    }
    const obj = results[0];
    obj.className = '_User';
    const userObject = Parse.Object.fromJSON(obj);
    return new Auth({config, isMaster: false, installationId, user: userObject});
  });
}

// Returns a promise that resolves to an array of role names
Auth.prototype.getUserRoles = function() {
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
Auth.prototype._loadRoles = function() {
  var cacheAdapter = this.config.cacheController;
  return cacheAdapter.role.get(this.user.id).then((cachedRoles) => {
    if (cachedRoles != null) {
      this.fetchedRoles = true;
      this.userRoles = cachedRoles;
      return Promise.resolve(cachedRoles);
    }

    var restWhere = {
      'users': {
        __type: 'Pointer',
        className: '_User',
        objectId: this.user.id
      }
    };
    // First get the role ids this user is directly a member of
    var query = new RestQuery(this.config, master(this.config), '_Role', restWhere, {});
    return query.execute().then((response) => {
      var results = response.results;
      if (!results.length) {
        this.userRoles = [];
        this.fetchedRoles = true;
        this.rolePromise = null;

        cacheAdapter.role.put(this.user.id, this.userRoles);
        return Promise.resolve(this.userRoles);
      }
      var rolesMap = results.reduce((m, r) => {
        m.names.push(r.name);
        m.ids.push(r.objectId);
        return m;
      }, {ids: [], names: []});

      // run the recursive finding
      return this._getAllRolesNamesForRoleIds(rolesMap.ids, rolesMap.names)
        .then((roleNames) => {
          this.userRoles = roleNames.map((r) => {
            return 'role:' + r;
          });
          this.fetchedRoles = true;
          this.rolePromise = null;

          cacheAdapter.role.put(this.user.id, this.userRoles);
          return Promise.resolve(this.userRoles);
        });
    });
  });
};

// Given a list of roleIds, find all the parent roles, returns a promise with all names
Auth.prototype._getAllRolesNamesForRoleIds = function(roleIDs, names = [], queriedRoles = {}) {
  const ins = roleIDs.filter((roleID) => {
    return queriedRoles[roleID] !== true;
  }).map((roleID) => {
    // mark as queried
    queriedRoles[roleID] = true;
    return {
      __type: 'Pointer',
      className: '_Role',
      objectId: roleID
    }
  });

  // all roles are accounted for, return the names
  if (ins.length == 0) {
    return Promise.resolve([...new Set(names)]);
  }
  // Build an OR query across all parentRoles
  let restWhere;
  if (ins.length == 1) {
    restWhere = { 'roles': ins[0] };
  } else {
    restWhere = { 'roles': { '$in': ins }}
  }
  const query = new RestQuery(this.config, master(this.config), '_Role', restWhere, {});
  return query.execute().then((response) => {
    var results = response.results;
    // Nothing found
    if (!results.length) {
      return Promise.resolve(names);
    }
    // Map the results with all Ids and names
    const resultMap = results.reduce((memo, role) => {
      memo.names.push(role.name);
      memo.ids.push(role.objectId);
      return memo;
    }, {ids: [], names: []});
    // store the new found names
    names = names.concat(resultMap.names);
    // find the next ones, circular roles will be cut
    return this._getAllRolesNamesForRoleIds(resultMap.ids, names, queriedRoles)
  }).then((names) => {
    return Promise.resolve([...new Set(names)])
  })
}

module.exports = {
  Auth: Auth,
  master: master,
  nobody: nobody,
  getAuthForSessionToken,
  getAuthForLegacySessionToken
};
