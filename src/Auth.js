var deepcopy = require('deepcopy');
var Parse = require('parse/node').Parse;
var RestQuery = require('./RestQuery');
var CacheProvider = require('./classes/CacheProvider');

// An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.
function Auth(config, isMaster, userObject) {
  this.config = config;
  this.isMaster = isMaster;
  this.user = userObject;

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
  return new Auth(config, true, null);
}

// A helper to get a nobody-level Auth object
function nobody(config) {
  return new Auth(config, false, null);
}

// Returns a promise that resolves to an Auth object
var getAuthForSessionToken = function(config, sessionToken) {
  var cache = CacheProvider.getAdapter();

  var cachedUser = cache.get(sessionToken);
  if (cachedUser) {
    return Promise.resolve(new Auth(config, false, cachedUser));
  }
  var restOptions = {
    limit: 1,
    include: 'user'
  };
  var restWhere = {
    _session_token: sessionToken
  };
  var query = new RestQuery(config, master(config), '_Session',
                            restWhere, restOptions);
  return query.execute().then((response) => {
    var results = response.results;
    if (results.length !== 1 || !results[0]['user']) {
      return nobody(config);
    }
    var obj = results[0]['user'];
    delete obj.password;
    obj['className'] = '_User';
    obj['sessionToken'] = sessionToken;
    var userObject = Parse.Object.fromJSON(obj);
    cache.put(sessionToken, userObject);
    return new Auth(config, false, userObject);
  });
};

// Returns a promise that resolves to an array of role names
Auth.prototype.getUserRoles = function() {
  if (this.isMaster || !this.user) {
    return Promise.resolve([]);
  }
  if (this.fetchedRoles) {
    return Promise.resolve(this.userRoles);
  }
  if (this.rolePromise) {
    return rolePromise;
  }
  this.rolePromise = this._loadRoles();
  return this.rolePromise;
};

// Iterates through the role tree and compiles a users roles
Auth.prototype._loadRoles = function() {
  var restWhere = {
    'users': {
      __type: 'Pointer',
      className: '_User',
      objectId: this.user.id
    }
  };
  // First get the role ids this user is directly a member of
  var query = new RestQuery(this.config, master(this.config), '_Role',
                            restWhere, {});
  return query.execute().then((response) => {
    var results = response.results;
    if (!results.length) {
      this.userRoles = [];
      this.fetchedRoles = true;
      this.rolePromise = null;
      return Promise.resolve(this.userRoles);
    }

    var roleIDs = results.map(r => r.objectId);
    var promises = [Promise.resolve(roleIDs)];
    for (var role of roleIDs) {
      promises.push(this._getAllRoleNamesForId(role));
    }
    return Promise.all(promises).then((results) => {
      var allIDs = [];
      for (var x of results) {
        Array.prototype.push.apply(allIDs, x);
      }
      var restWhere = {
        objectId: {
          '$in': allIDs
        }
      };
      var query = new RestQuery(this.config, master(this.config),
                                '_Role', restWhere, {});
      return query.execute();
    }).then((response) => {
      var results = response.results;
      this.userRoles = results.map((r) => {
        return 'role:' + r.name;
      });
      this.fetchedRoles = true;
      this.rolePromise = null;
      return Promise.resolve(this.userRoles);
    });
  });
};

// Given a role object id, get any other roles it is part of
// TODO: Make recursive to support role nesting beyond 1 level deep
Auth.prototype._getAllRoleNamesForId = function(roleID) {
  var rolePointer = {
    __type: 'Pointer',
    className: '_Role',
    objectId: roleID
  };
  var restWhere = {
    '$relatedTo': {
      key: 'roles',
      object: rolePointer
    }
  };
  var query = new RestQuery(this.config, master(this.config), '_Role',
                            restWhere, {});
  return query.execute().then((response) => {
    var results = response.results;
    if (!results.length) {
      return Promise.resolve([]);
    }
    var roleIDs = results.map(r => r.objectId);
    return Promise.resolve(roleIDs);
  });
};

module.exports = {
  Auth: Auth,
  master: master,
  nobody: nobody,
  getAuthForSessionToken: getAuthForSessionToken
};
