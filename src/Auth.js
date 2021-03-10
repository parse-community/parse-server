const cryptoUtils = require('./cryptoUtils');
const RestQuery = require('./RestQuery');
const Parse = require('parse/node');

// An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.
function Auth({
  config,
  cacheController = undefined,
  isMaster = false,
  isReadOnly = false,
  user,
  installationId,
}) {
  this.config = config;
  this.cacheController = cacheController || (config && config.cacheController);
  this.installationId = installationId;
  this.isMaster = isMaster;
  this.user = user;
  this.isReadOnly = isReadOnly;

  // Assuming a users roles won't change during a single request, we'll
  // only load them once.
  this.userRoles = [];
  this.fetchedRoles = false;
  this.rolePromise = null;
}

// Whether this auth could possibly modify the given user id.
// It still could be forbidden via ACLs even if this returns true.
Auth.prototype.isUnauthenticated = function () {
  if (this.isMaster) {
    return false;
  }
  if (this.user) {
    return false;
  }
  return true;
};

// A helper to get a master-level Auth object
function master(config) {
  return new Auth({ config, isMaster: true });
}

// A helper to get a master-level Auth object
function readOnly(config) {
  return new Auth({ config, isMaster: true, isReadOnly: true });
}

// A helper to get a nobody-level Auth object
function nobody(config) {
  return new Auth({ config, isMaster: false });
}

// Returns a promise that resolves to an Auth object
const getAuthForSessionToken = async function ({
  config,
  cacheController,
  sessionToken,
  installationId,
}) {
  cacheController = cacheController || (config && config.cacheController);
  if (cacheController) {
    const userJSON = await cacheController.user.get(sessionToken);
    if (userJSON) {
      const cachedUser = Parse.Object.fromJSON(userJSON);
      return Promise.resolve(
        new Auth({
          config,
          cacheController,
          isMaster: false,
          installationId,
          user: cachedUser,
        })
      );
    }
  }

  let results;
  if (config) {
    const restOptions = {
      limit: 1,
      include: 'user',
    };

    const query = new RestQuery(config, master(config), '_Session', { sessionToken }, restOptions);
    results = (await query.execute()).results;
  } else {
    results = (
      await new Parse.Query(Parse.Session)
        .limit(1)
        .include('user')
        .equalTo('sessionToken', sessionToken)
        .find({ useMasterKey: true })
    ).map(obj => obj.toJSON());
  }

  if (results.length !== 1 || !results[0]['user']) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
  }
  const now = new Date(),
    expiresAt = results[0].expiresAt ? new Date(results[0].expiresAt.iso) : undefined;
  if (expiresAt < now) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token is expired.');
  }
  const obj = results[0]['user'];
  delete obj.password;
  obj['className'] = '_User';
  obj['sessionToken'] = sessionToken;
  if (cacheController) {
    cacheController.user.put(sessionToken, obj);
  }
  const userObject = Parse.Object.fromJSON(obj);
  return new Auth({
    config,
    cacheController,
    isMaster: false,
    installationId,
    user: userObject,
  });
};

var getAuthForLegacySessionToken = function ({ config, sessionToken, installationId }) {
  var restOptions = {
    limit: 1,
  };
  var query = new RestQuery(config, master(config), '_User', { sessionToken }, restOptions);
  return query.execute().then(response => {
    var results = response.results;
    if (results.length !== 1) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid legacy session token');
    }
    const obj = results[0];
    obj.className = '_User';
    const userObject = Parse.Object.fromJSON(obj);
    return new Auth({
      config,
      isMaster: false,
      installationId,
      user: userObject,
    });
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

Auth.prototype.getRolesForUser = async function () {
  //Stack all Parse.Role
  const results = [];
  if (this.config) {
    const restWhere = {
      users: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.user.id,
      },
    };
    await new RestQuery(this.config, master(this.config), '_Role', restWhere, {}).each(result =>
      results.push(result)
    );
  } else {
    await new Parse.Query(Parse.Role)
      .equalTo('users', this.user)
      .each(result => results.push(result.toJSON()), { useMasterKey: true });
  }
  return results;
};

// Iterates through the role tree and compiles a user's roles
Auth.prototype._loadRoles = async function () {
  if (this.cacheController) {
    const cachedRoles = await this.cacheController.role.get(this.user.id);
    if (cachedRoles != null) {
      this.fetchedRoles = true;
      this.userRoles = cachedRoles;
      return cachedRoles;
    }
  }

  // First get the role ids this user is directly a member of
  const results = await this.getRolesForUser();
  if (!results.length) {
    this.userRoles = [];
    this.fetchedRoles = true;
    this.rolePromise = null;

    this.cacheRoles();
    return this.userRoles;
  }

  const rolesMap = results.reduce(
    (m, r) => {
      m.names.push(r.name);
      m.ids.push(r.objectId);
      return m;
    },
    { ids: [], names: [] }
  );

  // run the recursive finding
  const roleNames = await this._getAllRolesNamesForRoleIds(rolesMap.ids, rolesMap.names);
  this.userRoles = roleNames.map(r => {
    return 'role:' + r;
  });
  this.fetchedRoles = true;
  this.rolePromise = null;
  this.cacheRoles();
  return this.userRoles;
};

Auth.prototype.cacheRoles = function () {
  if (!this.cacheController) {
    return false;
  }
  this.cacheController.role.put(this.user.id, Array(...this.userRoles));
  return true;
};

Auth.prototype.getRolesByIds = async function (ins) {
  const results = [];
  // Build an OR query across all parentRoles
  if (!this.config) {
    await new Parse.Query(Parse.Role)
      .containedIn(
        'roles',
        ins.map(id => {
          const role = new Parse.Object(Parse.Role);
          role.id = id;
          return role;
        })
      )
      .each(result => results.push(result.toJSON()), { useMasterKey: true });
  } else {
    const roles = ins.map(id => {
      return {
        __type: 'Pointer',
        className: '_Role',
        objectId: id,
      };
    });
    const restWhere = { roles: { $in: roles } };
    await new RestQuery(this.config, master(this.config), '_Role', restWhere, {}).each(result =>
      results.push(result)
    );
  }
  return results;
};

// Given a list of roleIds, find all the parent roles, returns a promise with all names
Auth.prototype._getAllRolesNamesForRoleIds = function (roleIDs, names = [], queriedRoles = {}) {
  const ins = roleIDs.filter(roleID => {
    const wasQueried = queriedRoles[roleID] !== true;
    queriedRoles[roleID] = true;
    return wasQueried;
  });

  // all roles are accounted for, return the names
  if (ins.length == 0) {
    return Promise.resolve([...new Set(names)]);
  }

  return this.getRolesByIds(ins)
    .then(results => {
      // Nothing found
      if (!results.length) {
        return Promise.resolve(names);
      }
      // Map the results with all Ids and names
      const resultMap = results.reduce(
        (memo, role) => {
          memo.names.push(role.name);
          memo.ids.push(role.objectId);
          return memo;
        },
        { ids: [], names: [] }
      );
      // store the new found names
      names = names.concat(resultMap.names);
      // find the next ones, circular roles will be cut
      return this._getAllRolesNamesForRoleIds(resultMap.ids, names, queriedRoles);
    })
    .then(names => {
      return Promise.resolve([...new Set(names)]);
    });
};

const createSession = function (
  config,
  { userId, createdWith, installationId, additionalSessionData }
) {
  const token = 'r:' + cryptoUtils.newToken();
  const expiresAt = config.generateSessionExpiresAt();
  const sessionData = {
    sessionToken: token,
    user: {
      __type: 'Pointer',
      className: '_User',
      objectId: userId,
    },
    createdWith,
    restricted: false,
    expiresAt: Parse._encode(expiresAt),
  };

  if (installationId) {
    sessionData.installationId = installationId;
  }

  Object.assign(sessionData, additionalSessionData);
  // We need to import RestWrite at this point for the cyclic dependency it has to it
  const RestWrite = require('./RestWrite');

  return {
    sessionData,
    createSession: () =>
      new RestWrite(config, master(config), '_Session', null, sessionData).execute(),
  };
};

module.exports = {
  Auth,
  master,
  nobody,
  readOnly,
  getAuthForSessionToken,
  getAuthForLegacySessionToken,
  createSession,
};
