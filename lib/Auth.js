"use strict";

var _util = require("util");

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const Parse = require('parse/node');

const reducePromise = async (arr, fn, acc, index = 0) => {
  if (arr[index]) {
    const newAcc = await Promise.resolve(fn(acc, arr[index]));
    return reducePromise(arr, fn, newAcc, index + 1);
  }

  return acc;
}; // An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.


function Auth({
  config,
  cacheController = undefined,
  isMaster = false,
  isReadOnly = false,
  user,
  installationId
}) {
  this.config = config;
  this.cacheController = cacheController || config && config.cacheController;
  this.installationId = installationId;
  this.isMaster = isMaster;
  this.user = user;
  this.isReadOnly = isReadOnly; // Assuming a users roles won't change during a single request, we'll
  // only load them once.

  this.userRoles = [];
  this.fetchedRoles = false;
  this.rolePromise = null;
} // Whether this auth could possibly modify the given user id.
// It still could be forbidden via ACLs even if this returns true.


Auth.prototype.isUnauthenticated = function () {
  if (this.isMaster) {
    return false;
  }

  if (this.user) {
    return false;
  }

  return true;
}; // A helper to get a master-level Auth object


function master(config) {
  return new Auth({
    config,
    isMaster: true
  });
} // A helper to get a master-level Auth object


function readOnly(config) {
  return new Auth({
    config,
    isMaster: true,
    isReadOnly: true
  });
} // A helper to get a nobody-level Auth object


function nobody(config) {
  return new Auth({
    config,
    isMaster: false
  });
} // Returns a promise that resolves to an Auth object


const getAuthForSessionToken = async function ({
  config,
  cacheController,
  sessionToken,
  installationId
}) {
  cacheController = cacheController || config && config.cacheController;

  if (cacheController) {
    const userJSON = await cacheController.user.get(sessionToken);

    if (userJSON) {
      const cachedUser = Parse.Object.fromJSON(userJSON);
      return Promise.resolve(new Auth({
        config,
        cacheController,
        isMaster: false,
        installationId,
        user: cachedUser
      }));
    }
  }

  let results;

  if (config) {
    const restOptions = {
      limit: 1,
      include: 'user'
    }; // For cyclic dep

    const RestQuery = require('./RestQuery');

    const query = new RestQuery(config, master(config), '_Session', {
      sessionToken
    }, restOptions);
    results = (await query.execute()).results;
  } else {
    results = (await new Parse.Query(Parse.Session).limit(1).include('user').equalTo('sessionToken', sessionToken).find({
      useMasterKey: true
    })).map(obj => obj.toJSON());
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
    user: userObject
  });
};

var getAuthForLegacySessionToken = function ({
  config,
  sessionToken,
  installationId
}) {
  var restOptions = {
    limit: 1
  }; // For cyclic dep

  const RestQuery = require('./RestQuery');

  var query = new RestQuery(config, master(config), '_User', {
    sessionToken
  }, restOptions);
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
      user: userObject
    });
  });
}; // Returns a promise that resolves to an array of role names


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
        objectId: this.user.id
      }
    }; // For cyclic dep

    const RestQuery = require('./RestQuery');

    await new RestQuery(this.config, master(this.config), '_Role', restWhere, {}).each(result => results.push(result));
  } else {
    await new Parse.Query(Parse.Role).equalTo('users', this.user).each(result => results.push(result.toJSON()), {
      useMasterKey: true
    });
  }

  return results;
}; // Iterates through the role tree and compiles a user's roles


Auth.prototype._loadRoles = async function () {
  if (this.cacheController) {
    const cachedRoles = await this.cacheController.role.get(this.user.id);

    if (cachedRoles != null) {
      this.fetchedRoles = true;
      this.userRoles = cachedRoles;
      return cachedRoles;
    }
  } // First get the role ids this user is directly a member of


  const results = await this.getRolesForUser();

  if (!results.length) {
    this.userRoles = [];
    this.fetchedRoles = true;
    this.rolePromise = null;
    this.cacheRoles();
    return this.userRoles;
  }

  const rolesMap = results.reduce((m, r) => {
    m.names.push(r.name);
    m.ids.push(r.objectId);
    return m;
  }, {
    ids: [],
    names: []
  }); // run the recursive finding

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
  const results = []; // Build an OR query across all parentRoles

  if (!this.config) {
    await new Parse.Query(Parse.Role).containedIn('roles', ins.map(id => {
      const role = new Parse.Object(Parse.Role);
      role.id = id;
      return role;
    })).each(result => results.push(result.toJSON()), {
      useMasterKey: true
    });
  } else {
    const roles = ins.map(id => {
      return {
        __type: 'Pointer',
        className: '_Role',
        objectId: id
      };
    });
    const restWhere = {
      roles: {
        $in: roles
      }
    }; // For cyclic dep

    const RestQuery = require('./RestQuery');

    await new RestQuery(this.config, master(this.config), '_Role', restWhere, {}).each(result => results.push(result));
  }

  return results;
}; // Given a list of roleIds, find all the parent roles, returns a promise with all names


Auth.prototype._getAllRolesNamesForRoleIds = function (roleIDs, names = [], queriedRoles = {}) {
  const ins = roleIDs.filter(roleID => {
    const wasQueried = queriedRoles[roleID] !== true;
    queriedRoles[roleID] = true;
    return wasQueried;
  }); // all roles are accounted for, return the names

  if (ins.length == 0) {
    return Promise.resolve([...new Set(names)]);
  }

  return this.getRolesByIds(ins).then(results => {
    // Nothing found
    if (!results.length) {
      return Promise.resolve(names);
    } // Map the results with all Ids and names


    const resultMap = results.reduce((memo, role) => {
      memo.names.push(role.name);
      memo.ids.push(role.objectId);
      return memo;
    }, {
      ids: [],
      names: []
    }); // store the new found names

    names = names.concat(resultMap.names); // find the next ones, circular roles will be cut

    return this._getAllRolesNamesForRoleIds(resultMap.ids, names, queriedRoles);
  }).then(names => {
    return Promise.resolve([...new Set(names)]);
  });
};

const findUsersWithAuthData = (config, authData) => {
  const providers = Object.keys(authData);
  const query = providers.reduce((memo, provider) => {
    if (!authData[provider] || authData && !authData[provider].id) {
      return memo;
    }

    const queryKey = `authData.${provider}.id`;
    const query = {};
    query[queryKey] = authData[provider].id;
    memo.push(query);
    return memo;
  }, []).filter(q => {
    return typeof q !== 'undefined';
  });
  let findPromise = Promise.resolve([]);

  if (query.length > 0) {
    findPromise = config.database.find('_User', {
      $or: query
    }, {
      limit: 2
    });
  }

  return findPromise;
};

const hasMutatedAuthData = (authData, userAuthData) => {
  if (!userAuthData) return {
    hasMutatedAuthData: true,
    mutatedAuthData: authData
  };
  const mutatedAuthData = {};
  Object.keys(authData).forEach(provider => {
    // Anonymous provider is not handled this way
    if (provider === 'anonymous') return;
    const providerData = authData[provider];
    const userProviderAuthData = userAuthData[provider];

    if (!(0, _util.isDeepStrictEqual)(providerData, userProviderAuthData)) {
      mutatedAuthData[provider] = providerData;
    }
  });
  const hasMutatedAuthData = Object.keys(mutatedAuthData).length !== 0;
  return {
    hasMutatedAuthData,
    mutatedAuthData
  };
};

const checkIfUserHasProvidedConfiguredProvidersForLogin = (authData = {}, userAuthData = {}, config) => {
  const savedUserProviders = Object.keys(userAuthData).map(provider => ({
    name: provider,
    adapter: config.authDataManager.getValidatorForProvider(provider).adapter
  }));
  const hasProvidedASoloProvider = savedUserProviders.some(provider => provider && provider.adapter && provider.adapter.policy === 'solo' && authData[provider.name]); // Solo providers can be considered as safe
  // so we do not have to check if the user need
  // to provide an additional provider to login

  if (hasProvidedASoloProvider) return;
  const additionProvidersNotFound = [];
  const hasProvidedAtLeastOneAdditionalProvider = savedUserProviders.some(provider => {
    if (provider && provider.adapter && provider.adapter.policy === 'additional') {
      if (authData[provider.name]) {
        return true;
      } else {
        // Push missing provider for plausible error return
        additionProvidersNotFound.push(provider.name);
      }
    }
  });
  if (hasProvidedAtLeastOneAdditionalProvider || !additionProvidersNotFound.length) return;
  throw new Parse.Error(Parse.Error.OTHER_CAUSE, `Missing additional authData ${additionProvidersNotFound.join(',')}`);
}; // Validate each authData step by step and return the provider responses


const handleAuthDataValidation = async (authData, req, foundUser) => {
  let user;

  if (foundUser) {
    user = Parse.User.fromJSON(_objectSpread({
      className: '_User'
    }, foundUser)); // Find the user by session and current object id
    // Only pass user if it's the current one or master key with provided user
  } else if (req.auth && req.auth.user && typeof req.getUserId === 'function' && req.getUserId() === req.auth.user.id || req.auth && req.auth.isMaster && typeof req.getUserId === 'function' && req.getUserId()) {
    user = new Parse.User();
    user.id = req.auth.isMaster ? req.getUserId() : req.auth.user.id;
    await user.fetch({
      useMasterKey: true
    });
  } // Perform validation as step by step pipeline
  // for better error consistency and also to avoid to trigger a provider (like OTP SMS)
  // if another one fail


  return reducePromise( // apply sort to run the pipeline each time in the same order
  Object.keys(authData).sort(), async (acc, provider) => {
    if (authData[provider] === null) {
      acc.authData[provider] = null;
      return acc;
    }

    const {
      validator
    } = req.config.authDataManager.getValidatorForProvider(provider);

    if (!validator) {
      throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
    }

    const validationResult = await validator(authData[provider], {
      config: req.config,
      auth: req.auth
    }, user);

    if (validationResult) {
      if (!Object.keys(validationResult).length) acc.authData[provider] = authData[provider];
      if (validationResult.response) acc.authDataResponse[provider] = validationResult.response; // Some auth providers after initialization will avoid
      // to replace authData already stored

      if (!validationResult.doNotSave) {
        acc.authData[provider] = validationResult.save || authData[provider];
      }
    } else {
      // Support current authData behavior
      // no result store the new AuthData
      acc.authData[provider] = authData[provider];
    }

    return acc;
  }, {
    authData: {},
    authDataResponse: {}
  });
};

module.exports = {
  Auth,
  master,
  nobody,
  readOnly,
  getAuthForSessionToken,
  getAuthForLegacySessionToken,
  findUsersWithAuthData,
  hasMutatedAuthData,
  checkIfUserHasProvidedConfiguredProvidersForLogin,
  reducePromise,
  handleAuthDataValidation
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9BdXRoLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsInJlZHVjZVByb21pc2UiLCJhcnIiLCJmbiIsImFjYyIsImluZGV4IiwibmV3QWNjIiwiUHJvbWlzZSIsInJlc29sdmUiLCJBdXRoIiwiY29uZmlnIiwiY2FjaGVDb250cm9sbGVyIiwidW5kZWZpbmVkIiwiaXNNYXN0ZXIiLCJpc1JlYWRPbmx5IiwidXNlciIsImluc3RhbGxhdGlvbklkIiwidXNlclJvbGVzIiwiZmV0Y2hlZFJvbGVzIiwicm9sZVByb21pc2UiLCJwcm90b3R5cGUiLCJpc1VuYXV0aGVudGljYXRlZCIsIm1hc3RlciIsInJlYWRPbmx5Iiwibm9ib2R5IiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsInNlc3Npb25Ub2tlbiIsInVzZXJKU09OIiwiZ2V0IiwiY2FjaGVkVXNlciIsIk9iamVjdCIsImZyb21KU09OIiwicmVzdWx0cyIsInJlc3RPcHRpb25zIiwibGltaXQiLCJpbmNsdWRlIiwiUmVzdFF1ZXJ5IiwicXVlcnkiLCJleGVjdXRlIiwiUXVlcnkiLCJTZXNzaW9uIiwiZXF1YWxUbyIsImZpbmQiLCJ1c2VNYXN0ZXJLZXkiLCJtYXAiLCJvYmoiLCJ0b0pTT04iLCJsZW5ndGgiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIm5vdyIsIkRhdGUiLCJleHBpcmVzQXQiLCJpc28iLCJwYXNzd29yZCIsInB1dCIsInVzZXJPYmplY3QiLCJnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuIiwidGhlbiIsInJlc3BvbnNlIiwiY2xhc3NOYW1lIiwiZ2V0VXNlclJvbGVzIiwiX2xvYWRSb2xlcyIsImdldFJvbGVzRm9yVXNlciIsInJlc3RXaGVyZSIsInVzZXJzIiwiX190eXBlIiwib2JqZWN0SWQiLCJpZCIsImVhY2giLCJyZXN1bHQiLCJwdXNoIiwiUm9sZSIsImNhY2hlZFJvbGVzIiwicm9sZSIsImNhY2hlUm9sZXMiLCJyb2xlc01hcCIsInJlZHVjZSIsIm0iLCJyIiwibmFtZXMiLCJuYW1lIiwiaWRzIiwicm9sZU5hbWVzIiwiX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzIiwiQXJyYXkiLCJnZXRSb2xlc0J5SWRzIiwiaW5zIiwiY29udGFpbmVkSW4iLCJyb2xlcyIsIiRpbiIsInJvbGVJRHMiLCJxdWVyaWVkUm9sZXMiLCJmaWx0ZXIiLCJyb2xlSUQiLCJ3YXNRdWVyaWVkIiwiU2V0IiwicmVzdWx0TWFwIiwibWVtbyIsImNvbmNhdCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsImF1dGhEYXRhIiwicHJvdmlkZXJzIiwia2V5cyIsInByb3ZpZGVyIiwicXVlcnlLZXkiLCJxIiwiZmluZFByb21pc2UiLCJkYXRhYmFzZSIsIiRvciIsImhhc011dGF0ZWRBdXRoRGF0YSIsInVzZXJBdXRoRGF0YSIsIm11dGF0ZWRBdXRoRGF0YSIsImZvckVhY2giLCJwcm92aWRlckRhdGEiLCJ1c2VyUHJvdmlkZXJBdXRoRGF0YSIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJzYXZlZFVzZXJQcm92aWRlcnMiLCJhZGFwdGVyIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIiLCJzb21lIiwicG9saWN5IiwiYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCIsImhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciIsIk9USEVSX0NBVVNFIiwiam9pbiIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsInJlcSIsImZvdW5kVXNlciIsIlVzZXIiLCJhdXRoIiwiZ2V0VXNlcklkIiwiZmV0Y2giLCJzb3J0IiwidmFsaWRhdG9yIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInZhbGlkYXRpb25SZXN1bHQiLCJhdXRoRGF0YVJlc3BvbnNlIiwiZG9Ob3RTYXZlIiwic2F2ZSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFw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TmU7QUFPZjJDLEVBQUFBLHFCQVBlO0FBUWZVLEVBQUFBLGtCQVJlO0FBU2ZNLEVBQUFBLGlEQVRlO0FBVWZuSCxFQUFBQSxhQVZlO0FBV2YrSCxFQUFBQTtBQVhlLENBQWpCIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuXG5jb25zdCByZWR1Y2VQcm9taXNlID0gYXN5bmMgKGFyciwgZm4sIGFjYywgaW5kZXggPSAwKSA9PiB7XG4gIGlmIChhcnJbaW5kZXhdKSB7XG4gICAgY29uc3QgbmV3QWNjID0gYXdhaXQgUHJvbWlzZS5yZXNvbHZlKGZuKGFjYywgYXJyW2luZGV4XSkpO1xuICAgIHJldHVybiByZWR1Y2VQcm9taXNlKGFyciwgZm4sIG5ld0FjYywgaW5kZXggKyAxKTtcbiAgfVxuICByZXR1cm4gYWNjO1xufTtcblxuLy8gQW4gQXV0aCBvYmplY3QgdGVsbHMgeW91IHdobyBpcyByZXF1ZXN0aW5nIHNvbWV0aGluZyBhbmQgd2hldGhlclxuLy8gdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4vLyB1c2VyT2JqZWN0IGlzIGEgUGFyc2UuVXNlciBhbmQgY2FuIGJlIG51bGwgaWYgdGhlcmUncyBubyB1c2VyLlxuZnVuY3Rpb24gQXV0aCh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyID0gdW5kZWZpbmVkLFxuICBpc01hc3RlciA9IGZhbHNlLFxuICBpc1JlYWRPbmx5ID0gZmFsc2UsXG4gIHVzZXIsXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgdGhpcy5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB0aGlzLmlzTWFzdGVyID0gaXNNYXN0ZXI7XG4gIHRoaXMudXNlciA9IHVzZXI7XG4gIHRoaXMuaXNSZWFkT25seSA9IGlzUmVhZE9ubHk7XG5cbiAgLy8gQXNzdW1pbmcgYSB1c2VycyByb2xlcyB3b24ndCBjaGFuZ2UgZHVyaW5nIGEgc2luZ2xlIHJlcXVlc3QsIHdlJ2xsXG4gIC8vIG9ubHkgbG9hZCB0aGVtIG9uY2UuXG4gIHRoaXMudXNlclJvbGVzID0gW107XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gZmFsc2U7XG4gIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xufVxuXG4vLyBXaGV0aGVyIHRoaXMgYXV0aCBjb3VsZCBwb3NzaWJseSBtb2RpZnkgdGhlIGdpdmVuIHVzZXIgaWQuXG4vLyBJdCBzdGlsbCBjb3VsZCBiZSBmb3JiaWRkZW4gdmlhIEFDTHMgZXZlbiBpZiB0aGlzIHJldHVybnMgdHJ1ZS5cbkF1dGgucHJvdG90eXBlLmlzVW5hdXRoZW50aWNhdGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3Rlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBtYXN0ZXIoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gcmVhZE9ubHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUsIGlzUmVhZE9ubHk6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG5vYm9keS1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbm9ib2R5KGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiBmYWxzZSB9KTtcbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBBdXRoIG9iamVjdFxuY29uc3QgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyLFxuICBzZXNzaW9uVG9rZW4sXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICBjYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IHVzZXJKU09OID0gYXdhaXQgY2FjaGVDb250cm9sbGVyLnVzZXIuZ2V0KHNlc3Npb25Ub2tlbik7XG4gICAgaWYgKHVzZXJKU09OKSB7XG4gICAgICBjb25zdCBjYWNoZWRVc2VyID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHVzZXJKU09OKTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoXG4gICAgICAgIG5ldyBBdXRoKHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgY2FjaGVDb250cm9sbGVyLFxuICAgICAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICB1c2VyOiBjYWNoZWRVc2VyLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBsZXQgcmVzdWx0cztcbiAgaWYgKGNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RPcHRpb25zID0ge1xuICAgICAgbGltaXQ6IDEsXG4gICAgICBpbmNsdWRlOiAndXNlcicsXG4gICAgfTtcbiAgICAvLyBGb3IgY3ljbGljIGRlcFxuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgY29uc3QgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KGNvbmZpZywgbWFzdGVyKGNvbmZpZyksICdfU2Vzc2lvbicsIHsgc2Vzc2lvblRva2VuIH0sIHJlc3RPcHRpb25zKTtcbiAgICByZXN1bHRzID0gKGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKSkucmVzdWx0cztcbiAgfSBlbHNlIHtcbiAgICByZXN1bHRzID0gKFxuICAgICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlNlc3Npb24pXG4gICAgICAgIC5saW1pdCgxKVxuICAgICAgICAuaW5jbHVkZSgndXNlcicpXG4gICAgICAgIC5lcXVhbFRvKCdzZXNzaW9uVG9rZW4nLCBzZXNzaW9uVG9rZW4pXG4gICAgICAgIC5maW5kKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pXG4gICAgKS5tYXAob2JqID0+IG9iai50b0pTT04oKSk7XG4gIH1cblxuICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEgfHwgIXJlc3VsdHNbMF1bJ3VzZXInXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgfVxuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLFxuICAgIGV4cGlyZXNBdCA9IHJlc3VsdHNbMF0uZXhwaXJlc0F0ID8gbmV3IERhdGUocmVzdWx0c1swXS5leHBpcmVzQXQuaXNvKSA6IHVuZGVmaW5lZDtcbiAgaWYgKGV4cGlyZXNBdCA8IG5vdykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdTZXNzaW9uIHRva2VuIGlzIGV4cGlyZWQuJyk7XG4gIH1cbiAgY29uc3Qgb2JqID0gcmVzdWx0c1swXVsndXNlciddO1xuICBkZWxldGUgb2JqLnBhc3N3b3JkO1xuICBvYmpbJ2NsYXNzTmFtZSddID0gJ19Vc2VyJztcbiAgb2JqWydzZXNzaW9uVG9rZW4nXSA9IHNlc3Npb25Ub2tlbjtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNhY2hlQ29udHJvbGxlci51c2VyLnB1dChzZXNzaW9uVG9rZW4sIG9iaik7XG4gIH1cbiAgY29uc3QgdXNlck9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmopO1xuICByZXR1cm4gbmV3IEF1dGgoe1xuICAgIGNvbmZpZyxcbiAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgIGluc3RhbGxhdGlvbklkLFxuICAgIHVzZXI6IHVzZXJPYmplY3QsXG4gIH0pO1xufTtcblxudmFyIGdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4gPSBmdW5jdGlvbiAoeyBjb25maWcsIHNlc3Npb25Ub2tlbiwgaW5zdGFsbGF0aW9uSWQgfSkge1xuICB2YXIgcmVzdE9wdGlvbnMgPSB7XG4gICAgbGltaXQ6IDEsXG4gIH07XG4gIC8vIEZvciBjeWNsaWMgZGVwXG4gIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gIHZhciBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoY29uZmlnLCBtYXN0ZXIoY29uZmlnKSwgJ19Vc2VyJywgeyBzZXNzaW9uVG9rZW4gfSwgcmVzdE9wdGlvbnMpO1xuICByZXR1cm4gcXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHZhciByZXN1bHRzID0gcmVzcG9uc2UucmVzdWx0cztcbiAgICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdpbnZhbGlkIGxlZ2FjeSBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IG9iaiA9IHJlc3VsdHNbMF07XG4gICAgb2JqLmNsYXNzTmFtZSA9ICdfVXNlcic7XG4gICAgY29uc3QgdXNlck9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmopO1xuICAgIHJldHVybiBuZXcgQXV0aCh7XG4gICAgICBjb25maWcsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHVzZXI6IHVzZXJPYmplY3QsXG4gICAgfSk7XG4gIH0pO1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiByb2xlIG5hbWVzXG5BdXRoLnByb3RvdHlwZS5nZXRVc2VyUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyIHx8ICF0aGlzLnVzZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcbiAgfVxuICBpZiAodGhpcy5mZXRjaGVkUm9sZXMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMudXNlclJvbGVzKTtcbiAgfVxuICBpZiAodGhpcy5yb2xlUHJvbWlzZSkge1xuICAgIHJldHVybiB0aGlzLnJvbGVQcm9taXNlO1xuICB9XG4gIHRoaXMucm9sZVByb21pc2UgPSB0aGlzLl9sb2FkUm9sZXMoKTtcbiAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5nZXRSb2xlc0ZvclVzZXIgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIC8vU3RhY2sgYWxsIFBhcnNlLlJvbGVcbiAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICBpZiAodGhpcy5jb25maWcpIHtcbiAgICBjb25zdCByZXN0V2hlcmUgPSB7XG4gICAgICB1c2Vyczoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy51c2VyLmlkLFxuICAgICAgfSxcbiAgICB9O1xuICAgIC8vIEZvciBjeWNsaWMgZGVwXG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBhd2FpdCBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBtYXN0ZXIodGhpcy5jb25maWcpLCAnX1JvbGUnLCByZXN0V2hlcmUsIHt9KS5lYWNoKHJlc3VsdCA9PlxuICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdClcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmVxdWFsVG8oJ3VzZXJzJywgdGhpcy51c2VyKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEl0ZXJhdGVzIHRocm91Z2ggdGhlIHJvbGUgdHJlZSBhbmQgY29tcGlsZXMgYSB1c2VyJ3Mgcm9sZXNcbkF1dGgucHJvdG90eXBlLl9sb2FkUm9sZXMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IGNhY2hlZFJvbGVzID0gYXdhaXQgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5nZXQodGhpcy51c2VyLmlkKTtcbiAgICBpZiAoY2FjaGVkUm9sZXMgIT0gbnVsbCkge1xuICAgICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgICAgdGhpcy51c2VyUm9sZXMgPSBjYWNoZWRSb2xlcztcbiAgICAgIHJldHVybiBjYWNoZWRSb2xlcztcbiAgICB9XG4gIH1cblxuICAvLyBGaXJzdCBnZXQgdGhlIHJvbGUgaWRzIHRoaXMgdXNlciBpcyBkaXJlY3RseSBhIG1lbWJlciBvZlxuICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRSb2xlc0ZvclVzZXIoKTtcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIHRoaXMudXNlclJvbGVzID0gW107XG4gICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xuXG4gICAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gICAgcmV0dXJuIHRoaXMudXNlclJvbGVzO1xuICB9XG5cbiAgY29uc3Qgcm9sZXNNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAobSwgcikgPT4ge1xuICAgICAgbS5uYW1lcy5wdXNoKHIubmFtZSk7XG4gICAgICBtLmlkcy5wdXNoKHIub2JqZWN0SWQpO1xuICAgICAgcmV0dXJuIG07XG4gICAgfSxcbiAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICk7XG5cbiAgLy8gcnVuIHRoZSByZWN1cnNpdmUgZmluZGluZ1xuICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyb2xlc01hcC5pZHMsIHJvbGVzTWFwLm5hbWVzKTtcbiAgdGhpcy51c2VyUm9sZXMgPSByb2xlTmFtZXMubWFwKHIgPT4ge1xuICAgIHJldHVybiAncm9sZTonICsgcjtcbiAgfSk7XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG4gIHRoaXMuY2FjaGVSb2xlcygpO1xuICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jYWNoZVJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUucHV0KHRoaXMudXNlci5pZCwgQXJyYXkoLi4udGhpcy51c2VyUm9sZXMpKTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5nZXRSb2xlc0J5SWRzID0gYXN5bmMgZnVuY3Rpb24gKGlucykge1xuICBjb25zdCByZXN1bHRzID0gW107XG4gIC8vIEJ1aWxkIGFuIE9SIHF1ZXJ5IGFjcm9zcyBhbGwgcGFyZW50Um9sZXNcbiAgaWYgKCF0aGlzLmNvbmZpZykge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmNvbnRhaW5lZEluKFxuICAgICAgICAncm9sZXMnLFxuICAgICAgICBpbnMubWFwKGlkID0+IHtcbiAgICAgICAgICBjb25zdCByb2xlID0gbmV3IFBhcnNlLk9iamVjdChQYXJzZS5Sb2xlKTtcbiAgICAgICAgICByb2xlLmlkID0gaWQ7XG4gICAgICAgICAgcmV0dXJuIHJvbGU7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHJvbGVzID0gaW5zLm1hcChpZCA9PiB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1JvbGUnLFxuICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICB9O1xuICAgIH0pO1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHsgcm9sZXM6IHsgJGluOiByb2xlcyB9IH07XG4gICAgLy8gRm9yIGN5Y2xpYyBkZXBcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGF3YWl0IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIG1hc3Rlcih0aGlzLmNvbmZpZyksICdfUm9sZScsIHJlc3RXaGVyZSwge30pLmVhY2gocmVzdWx0ID0+XG4gICAgICByZXN1bHRzLnB1c2gocmVzdWx0KVxuICAgICk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59O1xuXG4vLyBHaXZlbiBhIGxpc3Qgb2Ygcm9sZUlkcywgZmluZCBhbGwgdGhlIHBhcmVudCByb2xlcywgcmV0dXJucyBhIHByb21pc2Ugd2l0aCBhbGwgbmFtZXNcbkF1dGgucHJvdG90eXBlLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyA9IGZ1bmN0aW9uIChyb2xlSURzLCBuYW1lcyA9IFtdLCBxdWVyaWVkUm9sZXMgPSB7fSkge1xuICBjb25zdCBpbnMgPSByb2xlSURzLmZpbHRlcihyb2xlSUQgPT4ge1xuICAgIGNvbnN0IHdhc1F1ZXJpZWQgPSBxdWVyaWVkUm9sZXNbcm9sZUlEXSAhPT0gdHJ1ZTtcbiAgICBxdWVyaWVkUm9sZXNbcm9sZUlEXSA9IHRydWU7XG4gICAgcmV0dXJuIHdhc1F1ZXJpZWQ7XG4gIH0pO1xuXG4gIC8vIGFsbCByb2xlcyBhcmUgYWNjb3VudGVkIGZvciwgcmV0dXJuIHRoZSBuYW1lc1xuICBpZiAoaW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLmdldFJvbGVzQnlJZHMoaW5zKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gTm90aGluZyBmb3VuZFxuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5hbWVzKTtcbiAgICAgIH1cbiAgICAgIC8vIE1hcCB0aGUgcmVzdWx0cyB3aXRoIGFsbCBJZHMgYW5kIG5hbWVzXG4gICAgICBjb25zdCByZXN1bHRNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAgICAgKG1lbW8sIHJvbGUpID0+IHtcbiAgICAgICAgICBtZW1vLm5hbWVzLnB1c2gocm9sZS5uYW1lKTtcbiAgICAgICAgICBtZW1vLmlkcy5wdXNoKHJvbGUub2JqZWN0SWQpO1xuICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICB9LFxuICAgICAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICAgICApO1xuICAgICAgLy8gc3RvcmUgdGhlIG5ldyBmb3VuZCBuYW1lc1xuICAgICAgbmFtZXMgPSBuYW1lcy5jb25jYXQocmVzdWx0TWFwLm5hbWVzKTtcbiAgICAgIC8vIGZpbmQgdGhlIG5leHQgb25lcywgY2lyY3VsYXIgcm9sZXMgd2lsbCBiZSBjdXRcbiAgICAgIHJldHVybiB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyZXN1bHRNYXAuaWRzLCBuYW1lcywgcXVlcmllZFJvbGVzKTtcbiAgICB9KVxuICAgIC50aGVuKG5hbWVzID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoWy4uLm5ldyBTZXQobmFtZXMpXSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBmaW5kVXNlcnNXaXRoQXV0aERhdGEgPSAoY29uZmlnLCBhdXRoRGF0YSkgPT4ge1xuICBjb25zdCBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGNvbnN0IHF1ZXJ5ID0gcHJvdmlkZXJzXG4gICAgLnJlZHVjZSgobWVtbywgcHJvdmlkZXIpID0+IHtcbiAgICAgIGlmICghYXV0aERhdGFbcHJvdmlkZXJdIHx8IChhdXRoRGF0YSAmJiAhYXV0aERhdGFbcHJvdmlkZXJdLmlkKSkge1xuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHF1ZXJ5S2V5ID0gYGF1dGhEYXRhLiR7cHJvdmlkZXJ9LmlkYDtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0ge307XG4gICAgICBxdWVyeVtxdWVyeUtleV0gPSBhdXRoRGF0YVtwcm92aWRlcl0uaWQ7XG4gICAgICBtZW1vLnB1c2gocXVlcnkpO1xuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfSwgW10pXG4gICAgLmZpbHRlcihxID0+IHtcbiAgICAgIHJldHVybiB0eXBlb2YgcSAhPT0gJ3VuZGVmaW5lZCc7XG4gICAgfSk7XG5cbiAgbGV0IGZpbmRQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKFtdKTtcbiAgaWYgKHF1ZXJ5Lmxlbmd0aCA+IDApIHtcbiAgICBmaW5kUHJvbWlzZSA9IGNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgJG9yOiBxdWVyeSB9LCB7IGxpbWl0OiAyIH0pO1xuICB9XG5cbiAgcmV0dXJuIGZpbmRQcm9taXNlO1xufTtcblxuY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gKGF1dGhEYXRhLCB1c2VyQXV0aERhdGEpID0+IHtcbiAgaWYgKCF1c2VyQXV0aERhdGEpIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YTogdHJ1ZSwgbXV0YXRlZEF1dGhEYXRhOiBhdXRoRGF0YSB9O1xuICBjb25zdCBtdXRhdGVkQXV0aERhdGEgPSB7fTtcbiAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgIC8vIEFub255bW91cyBwcm92aWRlciBpcyBub3QgaGFuZGxlZCB0aGlzIHdheVxuICAgIGlmIChwcm92aWRlciA9PT0gJ2Fub255bW91cycpIHJldHVybjtcbiAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgY29uc3QgdXNlclByb3ZpZGVyQXV0aERhdGEgPSB1c2VyQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGlmICghaXNEZWVwU3RyaWN0RXF1YWwocHJvdmlkZXJEYXRhLCB1c2VyUHJvdmlkZXJBdXRoRGF0YSkpIHtcbiAgICAgIG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl0gPSBwcm92aWRlckRhdGE7XG4gICAgfVxuICB9KTtcbiAgY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5sZW5ndGggIT09IDA7XG4gIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YSwgbXV0YXRlZEF1dGhEYXRhIH07XG59O1xuXG5jb25zdCBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luID0gKFxuICBhdXRoRGF0YSA9IHt9LFxuICB1c2VyQXV0aERhdGEgPSB7fSxcbiAgY29uZmlnXG4pID0+IHtcbiAgY29uc3Qgc2F2ZWRVc2VyUHJvdmlkZXJzID0gT2JqZWN0LmtleXModXNlckF1dGhEYXRhKS5tYXAocHJvdmlkZXIgPT4gKHtcbiAgICBuYW1lOiBwcm92aWRlcixcbiAgICBhZGFwdGVyOiBjb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKS5hZGFwdGVyLFxuICB9KSk7XG5cbiAgY29uc3QgaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUoXG4gICAgcHJvdmlkZXIgPT5cbiAgICAgIHByb3ZpZGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIgJiYgcHJvdmlkZXIuYWRhcHRlci5wb2xpY3kgPT09ICdzb2xvJyAmJiBhdXRoRGF0YVtwcm92aWRlci5uYW1lXVxuICApO1xuXG4gIC8vIFNvbG8gcHJvdmlkZXJzIGNhbiBiZSBjb25zaWRlcmVkIGFzIHNhZmVcbiAgLy8gc28gd2UgZG8gbm90IGhhdmUgdG8gY2hlY2sgaWYgdGhlIHVzZXIgbmVlZFxuICAvLyB0byBwcm92aWRlIGFuIGFkZGl0aW9uYWwgcHJvdmlkZXIgdG8gbG9naW5cbiAgaWYgKGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlcikgcmV0dXJuO1xuXG4gIGNvbnN0IGFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQgPSBbXTtcbiAgY29uc3QgaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgIGlmIChwcm92aWRlciAmJiBwcm92aWRlci5hZGFwdGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIucG9saWN5ID09PSAnYWRkaXRpb25hbCcpIHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlci5uYW1lXSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFB1c2ggbWlzc2luZyBwcm92aWRlciBmb3IgcGxhdXNpYmxlIGVycm9yIHJldHVyblxuICAgICAgICBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLnB1c2gocHJvdmlkZXIubmFtZSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgaWYgKGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciB8fCAhYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5sZW5ndGgpIHJldHVybjtcblxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgYE1pc3NpbmcgYWRkaXRpb25hbCBhdXRoRGF0YSAke2FkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQuam9pbignLCcpfWBcbiAgKTtcbn07XG5cbi8vIFZhbGlkYXRlIGVhY2ggYXV0aERhdGEgc3RlcCBieSBzdGVwIGFuZCByZXR1cm4gdGhlIHByb3ZpZGVyIHJlc3BvbnNlc1xuY29uc3QgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uID0gYXN5bmMgKGF1dGhEYXRhLCByZXEsIGZvdW5kVXNlcikgPT4ge1xuICBsZXQgdXNlcjtcbiAgaWYgKGZvdW5kVXNlcikge1xuICAgIHVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5mb3VuZFVzZXIgfSk7XG4gICAgLy8gRmluZCB0aGUgdXNlciBieSBzZXNzaW9uIGFuZCBjdXJyZW50IG9iamVjdCBpZFxuICAgIC8vIE9ubHkgcGFzcyB1c2VyIGlmIGl0J3MgdGhlIGN1cnJlbnQgb25lIG9yIG1hc3RlciBrZXkgd2l0aCBwcm92aWRlZCB1c2VyXG4gIH0gZWxzZSBpZiAoXG4gICAgKHJlcS5hdXRoICYmXG4gICAgICByZXEuYXV0aC51c2VyICYmXG4gICAgICB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgcmVxLmdldFVzZXJJZCgpID09PSByZXEuYXV0aC51c2VyLmlkKSB8fFxuICAgIChyZXEuYXV0aCAmJiByZXEuYXV0aC5pc01hc3RlciAmJiB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJiByZXEuZ2V0VXNlcklkKCkpXG4gICkge1xuICAgIHVzZXIgPSBuZXcgUGFyc2UuVXNlcigpO1xuICAgIHVzZXIuaWQgPSByZXEuYXV0aC5pc01hc3RlciA/IHJlcS5nZXRVc2VySWQoKSA6IHJlcS5hdXRoLnVzZXIuaWQ7XG4gICAgYXdhaXQgdXNlci5mZXRjaCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuXG4gIC8vIFBlcmZvcm0gdmFsaWRhdGlvbiBhcyBzdGVwIGJ5IHN0ZXAgcGlwZWxpbmVcbiAgLy8gZm9yIGJldHRlciBlcnJvciBjb25zaXN0ZW5jeSBhbmQgYWxzbyB0byBhdm9pZCB0byB0cmlnZ2VyIGEgcHJvdmlkZXIgKGxpa2UgT1RQIFNNUylcbiAgLy8gaWYgYW5vdGhlciBvbmUgZmFpbFxuICByZXR1cm4gcmVkdWNlUHJvbWlzZShcbiAgICAvLyBhcHBseSBzb3J0IHRvIHJ1biB0aGUgcGlwZWxpbmUgZWFjaCB0aW1lIGluIHRoZSBzYW1lIG9yZGVyXG5cbiAgICBPYmplY3Qua2V5cyhhdXRoRGF0YSkuc29ydCgpLFxuICAgIGFzeW5jIChhY2MsIHByb3ZpZGVyKSA9PiB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBudWxsO1xuICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgfVxuICAgICAgY29uc3QgeyB2YWxpZGF0b3IgfSA9IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKTtcbiAgICAgIGlmICghdmFsaWRhdG9yKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBjb25zdCB2YWxpZGF0aW9uUmVzdWx0ID0gYXdhaXQgdmFsaWRhdG9yKFxuICAgICAgICBhdXRoRGF0YVtwcm92aWRlcl0sXG4gICAgICAgIHsgY29uZmlnOiByZXEuY29uZmlnLCBhdXRoOiByZXEuYXV0aCB9LFxuICAgICAgICB1c2VyXG4gICAgICApO1xuICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQpIHtcbiAgICAgICAgaWYgKCFPYmplY3Qua2V5cyh2YWxpZGF0aW9uUmVzdWx0KS5sZW5ndGgpIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBhdXRoRGF0YVtwcm92aWRlcl07XG5cbiAgICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQucmVzcG9uc2UpIGFjYy5hdXRoRGF0YVJlc3BvbnNlW3Byb3ZpZGVyXSA9IHZhbGlkYXRpb25SZXN1bHQucmVzcG9uc2U7XG4gICAgICAgIC8vIFNvbWUgYXV0aCBwcm92aWRlcnMgYWZ0ZXIgaW5pdGlhbGl6YXRpb24gd2lsbCBhdm9pZFxuICAgICAgICAvLyB0byByZXBsYWNlIGF1dGhEYXRhIGFscmVhZHkgc3RvcmVkXG4gICAgICAgIGlmICghdmFsaWRhdGlvblJlc3VsdC5kb05vdFNhdmUpIHtcbiAgICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5zYXZlIHx8IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gU3VwcG9ydCBjdXJyZW50IGF1dGhEYXRhIGJlaGF2aW9yXG4gICAgICAgIC8vIG5vIHJlc3VsdCBzdG9yZSB0aGUgbmV3IEF1dGhEYXRhXG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sXG4gICAgeyBhdXRoRGF0YToge30sIGF1dGhEYXRhUmVzcG9uc2U6IHt9IH1cbiAgKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBBdXRoLFxuICBtYXN0ZXIsXG4gIG5vYm9keSxcbiAgcmVhZE9ubHksXG4gIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4sXG4gIGdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4sXG4gIGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSxcbiAgaGFzTXV0YXRlZEF1dGhEYXRhLFxuICBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luLFxuICByZWR1Y2VQcm9taXNlLFxuICBoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24sXG59O1xuIl19