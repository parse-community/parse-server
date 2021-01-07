"use strict";

var _lodash = _interopRequireDefault(require("lodash"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const cryptoUtils = require('./cryptoUtils');

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

const createSession = function (config, {
  userId,
  createdWith,
  installationId,
  additionalSessionData
}) {
  const token = 'r:' + cryptoUtils.newToken();
  const expiresAt = config.generateSessionExpiresAt();
  const sessionData = {
    sessionToken: token,
    user: {
      __type: 'Pointer',
      className: '_User',
      objectId: userId
    },
    createdWith,
    restricted: false,
    expiresAt: Parse._encode(expiresAt)
  };

  if (installationId) {
    sessionData.installationId = installationId;
  }

  Object.assign(sessionData, additionalSessionData); // We need to import RestWrite at this point for the cyclic dependency it has to it

  const RestWrite = require('./RestWrite');

  return {
    sessionData,
    createSession: () => new RestWrite(config, master(config), '_Session', null, sessionData).execute()
  };
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
    }, {});
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

    if (!_lodash.default.isEqual(providerData, userProviderAuthData)) {
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
  createSession,
  findUsersWithAuthData,
  hasMutatedAuthData,
  checkIfUserHasProvidedConfiguredProvidersForLogin,
  reducePromise,
  handleAuthDataValidation
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9BdXRoLmpzIl0sIm5hbWVzIjpbImNyeXB0b1V0aWxzIiwicmVxdWlyZSIsIlBhcnNlIiwicmVkdWNlUHJvbWlzZSIsImFyciIsImZuIiwiYWNjIiwiaW5kZXgiLCJuZXdBY2MiLCJQcm9taXNlIiwicmVzb2x2ZSIsIkF1dGgiLCJjb25maWciLCJjYWNoZUNvbnRyb2xsZXIiLCJ1bmRlZmluZWQiLCJpc01hc3RlciIsImlzUmVhZE9ubHkiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VyUm9sZXMiLCJmZXRjaGVkUm9sZXMiLCJyb2xlUHJvbWlzZSIsInByb3RvdHlwZSIsImlzVW5hdXRoZW50aWNhdGVkIiwibWFzdGVyIiwicmVhZE9ubHkiLCJub2JvZHkiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwic2Vzc2lvblRva2VuIiwidXNlckpTT04iLCJnZXQiLCJjYWNoZWRVc2VyIiwiT2JqZWN0IiwiZnJvbUpTT04iLCJyZXN1bHRzIiwicmVzdE9wdGlvbnMiLCJsaW1pdCIsImluY2x1ZGUiLCJSZXN0UXVlcnkiLCJxdWVyeSIsImV4ZWN1dGUiLCJRdWVyeSIsIlNlc3Npb24iLCJlcXVhbFRvIiwiZmluZCIsInVzZU1hc3RlcktleSIsIm1hcCIsIm9iaiIsInRvSlNPTiIsImxlbmd0aCIsIkVycm9yIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwibm93IiwiRGF0ZSIsImV4cGlyZXNBdCIsImlzbyIsInBhc3N3b3JkIiwicHV0IiwidXNlck9iamVjdCIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJ0aGVuIiwicmVzcG9uc2UiLCJjbGFzc05hbWUiLCJnZXRVc2VyUm9sZXMiLCJfbG9hZFJvbGVzIiwiZ2V0Um9sZXNGb3JVc2VyIiwicmVzdFdoZXJlIiwidXNlcnMiLCJfX3R5cGUiLCJvYmplY3RJZCIsImlkIiwiZWFjaCIsInJlc3VsdCIsInB1c2giLCJSb2xlIiwiY2FjaGVkUm9sZXMiLCJyb2xlIiwiY2FjaGVSb2xlcyIsInJvbGVzTWFwIiwicmVkdWNlIiwibSIsInIiLCJuYW1lcyIsIm5hbWUiLCJpZHMiLCJyb2xlTmFtZXMiLCJfZ2V0QWxsUm9sZXNOYW1lc0ZvclJvbGVJZHMiLCJBcnJheSIsImdldFJvbGVzQnlJZHMiLCJpbnMiLCJjb250YWluZWRJbiIsInJvbGVzIiwiJGluIiwicm9sZUlEcyIsInF1ZXJpZWRSb2xlcyIsImZpbHRlciIsInJvbGVJRCIsIndhc1F1ZXJpZWQiLCJTZXQiLCJyZXN1bHRNYXAiLCJtZW1vIiwiY29uY2F0IiwiY3JlYXRlU2Vzc2lvbiIsInVzZXJJZCIsImNyZWF0ZWRXaXRoIiwiYWRkaXRpb25hbFNlc3Npb25EYXRhIiwidG9rZW4iLCJuZXdUb2tlbiIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsInNlc3Npb25EYXRhIiwicmVzdHJpY3RlZCIsIl9lbmNvZGUiLCJhc3NpZ24iLCJSZXN0V3JpdGUiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJhdXRoRGF0YSIsInByb3ZpZGVycyIsImtleXMiLCJwcm92aWRlciIsInF1ZXJ5S2V5IiwicSIsImZpbmRQcm9taXNlIiwiZGF0YWJhc2UiLCIkb3IiLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJ1c2VyQXV0aERhdGEiLCJtdXRhdGVkQXV0aERhdGEiLCJmb3JFYWNoIiwicHJvdmlkZXJEYXRhIiwidXNlclByb3ZpZGVyQXV0aERhdGEiLCJfIiwiaXNFcXVhbCIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJzYXZlZFVzZXJQcm92aWRlcnMiLCJhZGFwdGVyIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIiLCJzb21lIiwicG9saWN5IiwiYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCIsImhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciIsIk9USEVSX0NBVVNFIiwiam9pbiIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsInJlcSIsImZvdW5kVXNlciIsIlVzZXIiLCJhdXRoIiwiZ2V0VXNlcklkIiwiZmV0Y2giLCJzb3J0IiwidmFsaWRhdG9yIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInZhbGlkYXRpb25SZXN1bHQiLCJhdXRoRGF0YVJlc3BvbnNlIiwiZG9Ob3RTYXZlIiwic2F2ZSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBRUE7Ozs7Ozs7Ozs7QUFGQSxNQUFNQSxXQUFXLEdBQUdDLE9BQU8sQ0FBQyxlQUFELENBQTNCOztBQUNBLE1BQU1DLEtBQUssR0FBR0QsT0FBTyxDQUFDLFlBQUQsQ0FBckI7O0FBR0EsTUFBTUUsYUFBYSxHQUFHLE9BQU9DLEdBQVAsRUFBWUMsRUFBWixFQUFnQkMsR0FBaEIsRUFBcUJDLEtBQUssR0FBRyxDQUE3QixLQUFtQztBQUN2RCxNQUFJSCxHQUFHLENBQUNHLEtBQUQsQ0FBUCxFQUFnQjtBQUNkLFVBQU1DLE1BQU0sR0FBRyxNQUFNQyxPQUFPLENBQUNDLE9BQVIsQ0FBZ0JMLEVBQUUsQ0FBQ0MsR0FBRCxFQUFNRixHQUFHLENBQUNHLEtBQUQsQ0FBVCxDQUFsQixDQUFyQjtBQUNBLFdBQU9KLGFBQWEsQ0FBQ0MsR0FBRCxFQUFNQyxFQUFOLEVBQVVHLE1BQVYsRUFBa0JELEtBQUssR0FBRyxDQUExQixDQUFwQjtBQUNEOztBQUNELFNBQU9ELEdBQVA7QUFDRCxDQU5ELEMsQ0FRQTtBQUNBO0FBQ0E7OztBQUNBLFNBQVNLLElBQVQsQ0FBYztBQUNaQyxFQUFBQSxNQURZO0FBRVpDLEVBQUFBLGVBQWUsR0FBR0MsU0FGTjtBQUdaQyxFQUFBQSxRQUFRLEdBQUcsS0FIQztBQUlaQyxFQUFBQSxVQUFVLEdBQUcsS0FKRDtBQUtaQyxFQUFBQSxJQUxZO0FBTVpDLEVBQUFBO0FBTlksQ0FBZCxFQU9HO0FBQ0QsT0FBS04sTUFBTCxHQUFjQSxNQUFkO0FBQ0EsT0FBS0MsZUFBTCxHQUF1QkEsZUFBZSxJQUFLRCxNQUFNLElBQUlB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QUEsUUFBUSxFQUFFLEVBQVo7QUFBZ0J3QyxJQUFBQSxnQkFBZ0IsRUFBRTtBQUFsQyxHQXJDa0IsQ0FBcEI7QUF1Q0QsQ0E1REQ7O0FBOERBRyxNQUFNLENBQUNDLE9BQVAsR0FBaUI7QUFDZnBKLEVBQUFBLElBRGU7QUFFZmEsRUFBQUEsTUFGZTtBQUdmRSxFQUFBQSxNQUhlO0FBSWZELEVBQUFBLFFBSmU7QUFLZkUsRUFBQUEsc0JBTGU7QUFNZmdDLEVBQUFBLDRCQU5lO0FBT2YyQyxFQUFBQSxhQVBlO0FBUWZZLEVBQUFBLHFCQVJlO0FBU2ZVLEVBQUFBLGtCQVRlO0FBVWZRLEVBQUFBLGlEQVZlO0FBV2ZqSSxFQUFBQSxhQVhlO0FBWWY2SSxFQUFBQTtBQVplLENBQWpCIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgY3J5cHRvVXRpbHMgPSByZXF1aXJlKCcuL2NyeXB0b1V0aWxzJyk7XG5jb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5cbmNvbnN0IHJlZHVjZVByb21pc2UgPSBhc3luYyAoYXJyLCBmbiwgYWNjLCBpbmRleCA9IDApID0+IHtcbiAgaWYgKGFycltpbmRleF0pIHtcbiAgICBjb25zdCBuZXdBY2MgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUoZm4oYWNjLCBhcnJbaW5kZXhdKSk7XG4gICAgcmV0dXJuIHJlZHVjZVByb21pc2UoYXJyLCBmbiwgbmV3QWNjLCBpbmRleCArIDEpO1xuICB9XG4gIHJldHVybiBhY2M7XG59O1xuXG4vLyBBbiBBdXRoIG9iamVjdCB0ZWxscyB5b3Ugd2hvIGlzIHJlcXVlc3Rpbmcgc29tZXRoaW5nIGFuZCB3aGV0aGVyXG4vLyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbi8vIHVzZXJPYmplY3QgaXMgYSBQYXJzZS5Vc2VyIGFuZCBjYW4gYmUgbnVsbCBpZiB0aGVyZSdzIG5vIHVzZXIuXG5mdW5jdGlvbiBBdXRoKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIgPSB1bmRlZmluZWQsXG4gIGlzTWFzdGVyID0gZmFsc2UsXG4gIGlzUmVhZE9ubHkgPSBmYWxzZSxcbiAgdXNlcixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICB0aGlzLmluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQ7XG4gIHRoaXMuaXNNYXN0ZXIgPSBpc01hc3RlcjtcbiAgdGhpcy51c2VyID0gdXNlcjtcbiAgdGhpcy5pc1JlYWRPbmx5ID0gaXNSZWFkT25seTtcblxuICAvLyBBc3N1bWluZyBhIHVzZXJzIHJvbGVzIHdvbid0IGNoYW5nZSBkdXJpbmcgYSBzaW5nbGUgcmVxdWVzdCwgd2UnbGxcbiAgLy8gb25seSBsb2FkIHRoZW0gb25jZS5cbiAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSBmYWxzZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG59XG5cbi8vIFdoZXRoZXIgdGhpcyBhdXRoIGNvdWxkIHBvc3NpYmx5IG1vZGlmeSB0aGUgZ2l2ZW4gdXNlciBpZC5cbi8vIEl0IHN0aWxsIGNvdWxkIGJlIGZvcmJpZGRlbiB2aWEgQUNMcyBldmVuIGlmIHRoaXMgcmV0dXJucyB0cnVlLlxuQXV0aC5wcm90b3R5cGUuaXNVbmF1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh0aGlzLnVzZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYXN0ZXItbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG1hc3Rlcihjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiByZWFkT25seShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSwgaXNSZWFkT25seTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbm9ib2R5LWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBub2JvZHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IGZhbHNlIH0pO1xufVxuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIEF1dGggb2JqZWN0XG5jb25zdCBnZXRBdXRoRm9yU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIsXG4gIHNlc3Npb25Ub2tlbixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIGNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgdXNlckpTT04gPSBhd2FpdCBjYWNoZUNvbnRyb2xsZXIudXNlci5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAodXNlckpTT04pIHtcbiAgICAgIGNvbnN0IGNhY2hlZFVzZXIgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04odXNlckpTT04pO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgbmV3IEF1dGgoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgICAgIHVzZXI6IGNhY2hlZFVzZXIsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGxldCByZXN1bHRzO1xuICBpZiAoY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdE9wdGlvbnMgPSB7XG4gICAgICBsaW1pdDogMSxcbiAgICAgIGluY2x1ZGU6ICd1c2VyJyxcbiAgICB9O1xuICAgIC8vIEZvciBjeWNsaWMgZGVwXG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBjb25zdCBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoY29uZmlnLCBtYXN0ZXIoY29uZmlnKSwgJ19TZXNzaW9uJywgeyBzZXNzaW9uVG9rZW4gfSwgcmVzdE9wdGlvbnMpO1xuICAgIHJlc3VsdHMgPSAoYXdhaXQgcXVlcnkuZXhlY3V0ZSgpKS5yZXN1bHRzO1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdHMgPSAoXG4gICAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuU2Vzc2lvbilcbiAgICAgICAgLmxpbWl0KDEpXG4gICAgICAgIC5pbmNsdWRlKCd1c2VyJylcbiAgICAgICAgLmVxdWFsVG8oJ3Nlc3Npb25Ub2tlbicsIHNlc3Npb25Ub2tlbilcbiAgICAgICAgLmZpbmQoeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSlcbiAgICApLm1hcChvYmogPT4gb2JqLnRvSlNPTigpKTtcbiAgfVxuXG4gIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSB8fCAhcmVzdWx0c1swXVsndXNlciddKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICB9XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCksXG4gICAgZXhwaXJlc0F0ID0gcmVzdWx0c1swXS5leHBpcmVzQXQgPyBuZXcgRGF0ZShyZXN1bHRzWzBdLmV4cGlyZXNBdC5pc28pIDogdW5kZWZpbmVkO1xuICBpZiAoZXhwaXJlc0F0IDwgbm93KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gaXMgZXhwaXJlZC4nKTtcbiAgfVxuICBjb25zdCBvYmogPSByZXN1bHRzWzBdWyd1c2VyJ107XG4gIGRlbGV0ZSBvYmoucGFzc3dvcmQ7XG4gIG9ialsnY2xhc3NOYW1lJ10gPSAnX1VzZXInO1xuICBvYmpbJ3Nlc3Npb25Ub2tlbiddID0gc2Vzc2lvblRva2VuO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY2FjaGVDb250cm9sbGVyLnVzZXIucHV0KHNlc3Npb25Ub2tlbiwgb2JqKTtcbiAgfVxuICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gIHJldHVybiBuZXcgQXV0aCh7XG4gICAgY29uZmlnLFxuICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgdXNlcjogdXNlck9iamVjdCxcbiAgfSk7XG59O1xuXG52YXIgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiA9IGZ1bmN0aW9uICh7IGNvbmZpZywgc2Vzc2lvblRva2VuLCBpbnN0YWxsYXRpb25JZCB9KSB7XG4gIHZhciByZXN0T3B0aW9ucyA9IHtcbiAgICBsaW1pdDogMSxcbiAgfTtcbiAgLy8gRm9yIGN5Y2xpYyBkZXBcbiAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgdmFyIHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShjb25maWcsIG1hc3Rlcihjb25maWcpLCAnX1VzZXInLCB7IHNlc3Npb25Ub2tlbiB9LCByZXN0T3B0aW9ucyk7XG4gIHJldHVybiBxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdmFyIHJlc3VsdHMgPSByZXNwb25zZS5yZXN1bHRzO1xuICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ2ludmFsaWQgbGVnYWN5IHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgb2JqID0gcmVzdWx0c1swXTtcbiAgICBvYmouY2xhc3NOYW1lID0gJ19Vc2VyJztcbiAgICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gICAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICAgIGNvbmZpZyxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgdXNlcjogdXNlck9iamVjdCxcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIHJvbGUgbmFtZXNcbkF1dGgucHJvdG90eXBlLmdldFVzZXJSb2xlcyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNNYXN0ZXIgfHwgIXRoaXMudXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG4gIGlmICh0aGlzLmZldGNoZWRSb2xlcykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy51c2VyUm9sZXMpO1xuICB9XG4gIGlmICh0aGlzLnJvbGVQcm9taXNlKSB7XG4gICAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG4gIH1cbiAgdGhpcy5yb2xlUHJvbWlzZSA9IHRoaXMuX2xvYWRSb2xlcygpO1xuICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzRm9yVXNlciA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy9TdGFjayBhbGwgUGFyc2UuUm9sZVxuICBjb25zdCByZXN1bHRzID0gW107XG4gIGlmICh0aGlzLmNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHtcbiAgICAgIHVzZXJzOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLnVzZXIuaWQsXG4gICAgICB9LFxuICAgIH07XG4gICAgLy8gRm9yIGN5Y2xpYyBkZXBcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGF3YWl0IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIG1hc3Rlcih0aGlzLmNvbmZpZyksICdfUm9sZScsIHJlc3RXaGVyZSwge30pLmVhY2gocmVzdWx0ID0+XG4gICAgICByZXN1bHRzLnB1c2gocmVzdWx0KVxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuZXF1YWxUbygndXNlcnMnLCB0aGlzLnVzZXIpXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufTtcblxuLy8gSXRlcmF0ZXMgdGhyb3VnaCB0aGUgcm9sZSB0cmVlIGFuZCBjb21waWxlcyBhIHVzZXIncyByb2xlc1xuQXV0aC5wcm90b3R5cGUuX2xvYWRSb2xlcyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgY2FjaGVkUm9sZXMgPSBhd2FpdCB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmdldCh0aGlzLnVzZXIuaWQpO1xuICAgIGlmIChjYWNoZWRSb2xlcyAhPSBudWxsKSB7XG4gICAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgICB0aGlzLnVzZXJSb2xlcyA9IGNhY2hlZFJvbGVzO1xuICAgICAgcmV0dXJuIGNhY2hlZFJvbGVzO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpcnN0IGdldCB0aGUgcm9sZSBpZHMgdGhpcyB1c2VyIGlzIGRpcmVjdGx5IGEgbWVtYmVyIG9mXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmdldFJvbGVzRm9yVXNlcigpO1xuICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG5cbiAgICB0aGlzLmNhY2hlUm9sZXMoKTtcbiAgICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG4gIH1cblxuICBjb25zdCByb2xlc01hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgIChtLCByKSA9PiB7XG4gICAgICBtLm5hbWVzLnB1c2goci5uYW1lKTtcbiAgICAgIG0uaWRzLnB1c2goci5vYmplY3RJZCk7XG4gICAgICByZXR1cm4gbTtcbiAgICB9LFxuICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgKTtcblxuICAvLyBydW4gdGhlIHJlY3Vyc2l2ZSBmaW5kaW5nXG4gIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJvbGVzTWFwLmlkcywgcm9sZXNNYXAubmFtZXMpO1xuICB0aGlzLnVzZXJSb2xlcyA9IHJvbGVOYW1lcy5tYXAociA9PiB7XG4gICAgcmV0dXJuICdyb2xlOicgKyByO1xuICB9KTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbiAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnVzZXJSb2xlcztcbn07XG5cbkF1dGgucHJvdG90eXBlLmNhY2hlUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jYWNoZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5wdXQodGhpcy51c2VyLmlkLCBBcnJheSguLi50aGlzLnVzZXJSb2xlcykpO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzQnlJZHMgPSBhc3luYyBmdW5jdGlvbiAoaW5zKSB7XG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgLy8gQnVpbGQgYW4gT1IgcXVlcnkgYWNyb3NzIGFsbCBwYXJlbnRSb2xlc1xuICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuY29udGFpbmVkSW4oXG4gICAgICAgICdyb2xlcycsXG4gICAgICAgIGlucy5tYXAoaWQgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvbGUgPSBuZXcgUGFyc2UuT2JqZWN0KFBhcnNlLlJvbGUpO1xuICAgICAgICAgIHJvbGUuaWQgPSBpZDtcbiAgICAgICAgICByZXR1cm4gcm9sZTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0LnRvSlNPTigpKSwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgcm9sZXMgPSBpbnMubWFwKGlkID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgIH07XG4gICAgfSk7XG4gICAgY29uc3QgcmVzdFdoZXJlID0geyByb2xlczogeyAkaW46IHJvbGVzIH0gfTtcbiAgICAvLyBGb3IgY3ljbGljIGRlcFxuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgYXdhaXQgbmV3IFJlc3RRdWVyeSh0aGlzLmNvbmZpZywgbWFzdGVyKHRoaXMuY29uZmlnKSwgJ19Sb2xlJywgcmVzdFdoZXJlLCB7fSkuZWFjaChyZXN1bHQgPT5cbiAgICAgIHJlc3VsdHMucHVzaChyZXN1bHQpXG4gICAgKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEdpdmVuIGEgbGlzdCBvZiByb2xlSWRzLCBmaW5kIGFsbCB0aGUgcGFyZW50IHJvbGVzLCByZXR1cm5zIGEgcHJvbWlzZSB3aXRoIGFsbCBuYW1lc1xuQXV0aC5wcm90b3R5cGUuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzID0gZnVuY3Rpb24gKHJvbGVJRHMsIG5hbWVzID0gW10sIHF1ZXJpZWRSb2xlcyA9IHt9KSB7XG4gIGNvbnN0IGlucyA9IHJvbGVJRHMuZmlsdGVyKHJvbGVJRCA9PiB7XG4gICAgY29uc3Qgd2FzUXVlcmllZCA9IHF1ZXJpZWRSb2xlc1tyb2xlSURdICE9PSB0cnVlO1xuICAgIHF1ZXJpZWRSb2xlc1tyb2xlSURdID0gdHJ1ZTtcbiAgICByZXR1cm4gd2FzUXVlcmllZDtcbiAgfSk7XG5cbiAgLy8gYWxsIHJvbGVzIGFyZSBhY2NvdW50ZWQgZm9yLCByZXR1cm4gdGhlIG5hbWVzXG4gIGlmIChpbnMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFsuLi5uZXcgU2V0KG5hbWVzKV0pO1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuZ2V0Um9sZXNCeUlkcyhpbnMpXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAvLyBOb3RoaW5nIGZvdW5kXG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmFtZXMpO1xuICAgICAgfVxuICAgICAgLy8gTWFwIHRoZSByZXN1bHRzIHdpdGggYWxsIElkcyBhbmQgbmFtZXNcbiAgICAgIGNvbnN0IHJlc3VsdE1hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgICAgICAobWVtbywgcm9sZSkgPT4ge1xuICAgICAgICAgIG1lbW8ubmFtZXMucHVzaChyb2xlLm5hbWUpO1xuICAgICAgICAgIG1lbW8uaWRzLnB1c2gocm9sZS5vYmplY3RJZCk7XG4gICAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICAgIH0sXG4gICAgICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgICAgICk7XG4gICAgICAvLyBzdG9yZSB0aGUgbmV3IGZvdW5kIG5hbWVzXG4gICAgICBuYW1lcyA9IG5hbWVzLmNvbmNhdChyZXN1bHRNYXAubmFtZXMpO1xuICAgICAgLy8gZmluZCB0aGUgbmV4dCBvbmVzLCBjaXJjdWxhciByb2xlcyB3aWxsIGJlIGN1dFxuICAgICAgcmV0dXJuIHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJlc3VsdE1hcC5pZHMsIG5hbWVzLCBxdWVyaWVkUm9sZXMpO1xuICAgIH0pXG4gICAgLnRoZW4obmFtZXMgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IGNyZWF0ZVNlc3Npb24gPSBmdW5jdGlvbiAoXG4gIGNvbmZpZyxcbiAgeyB1c2VySWQsIGNyZWF0ZWRXaXRoLCBpbnN0YWxsYXRpb25JZCwgYWRkaXRpb25hbFNlc3Npb25EYXRhIH1cbikge1xuICBjb25zdCB0b2tlbiA9ICdyOicgKyBjcnlwdG9VdGlscy5uZXdUb2tlbigpO1xuICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gIGNvbnN0IHNlc3Npb25EYXRhID0ge1xuICAgIHNlc3Npb25Ub2tlbjogdG9rZW4sXG4gICAgdXNlcjoge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgIH0sXG4gICAgY3JlYXRlZFdpdGgsXG4gICAgcmVzdHJpY3RlZDogZmFsc2UsXG4gICAgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCksXG4gIH07XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgc2Vzc2lvbkRhdGEuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIE9iamVjdC5hc3NpZ24oc2Vzc2lvbkRhdGEsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSk7XG4gIC8vIFdlIG5lZWQgdG8gaW1wb3J0IFJlc3RXcml0ZSBhdCB0aGlzIHBvaW50IGZvciB0aGUgY3ljbGljIGRlcGVuZGVuY3kgaXQgaGFzIHRvIGl0XG4gIGNvbnN0IFJlc3RXcml0ZSA9IHJlcXVpcmUoJy4vUmVzdFdyaXRlJyk7XG5cbiAgcmV0dXJuIHtcbiAgICBzZXNzaW9uRGF0YSxcbiAgICBjcmVhdGVTZXNzaW9uOiAoKSA9PlxuICAgICAgbmV3IFJlc3RXcml0ZShjb25maWcsIG1hc3Rlcihjb25maWcpLCAnX1Nlc3Npb24nLCBudWxsLCBzZXNzaW9uRGF0YSkuZXhlY3V0ZSgpLFxuICB9O1xufTtcblxuY29uc3QgZmluZFVzZXJzV2l0aEF1dGhEYXRhID0gKGNvbmZpZywgYXV0aERhdGEpID0+IHtcbiAgY29uc3QgcHJvdmlkZXJzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpO1xuICBjb25zdCBxdWVyeSA9IHByb3ZpZGVyc1xuICAgIC5yZWR1Y2UoKG1lbW8sIHByb3ZpZGVyKSA9PiB7XG4gICAgICBpZiAoIWF1dGhEYXRhW3Byb3ZpZGVyXSB8fCAoYXV0aERhdGEgJiYgIWF1dGhEYXRhW3Byb3ZpZGVyXS5pZCkpIHtcbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9XG4gICAgICBjb25zdCBxdWVyeUtleSA9IGBhdXRoRGF0YS4ke3Byb3ZpZGVyfS5pZGA7XG4gICAgICBjb25zdCBxdWVyeSA9IHt9O1xuICAgICAgcXVlcnlbcXVlcnlLZXldID0gYXV0aERhdGFbcHJvdmlkZXJdLmlkO1xuICAgICAgbWVtby5wdXNoKHF1ZXJ5KTtcbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH0sIFtdKVxuICAgIC5maWx0ZXIocSA9PiB7XG4gICAgICByZXR1cm4gdHlwZW9mIHEgIT09ICd1bmRlZmluZWQnO1xuICAgIH0pO1xuXG4gIGxldCBmaW5kUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShbXSk7XG4gIGlmIChxdWVyeS5sZW5ndGggPiAwKSB7XG4gICAgZmluZFByb21pc2UgPSBjb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7ICRvcjogcXVlcnkgfSwge30pO1xuICB9XG5cbiAgcmV0dXJuIGZpbmRQcm9taXNlO1xufTtcblxuY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gKGF1dGhEYXRhLCB1c2VyQXV0aERhdGEpID0+IHtcbiAgaWYgKCF1c2VyQXV0aERhdGEpIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YTogdHJ1ZSwgbXV0YXRlZEF1dGhEYXRhOiBhdXRoRGF0YSB9O1xuICBjb25zdCBtdXRhdGVkQXV0aERhdGEgPSB7fTtcbiAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgIC8vIEFub255bW91cyBwcm92aWRlciBpcyBub3QgaGFuZGxlZCB0aGlzIHdheVxuICAgIGlmIChwcm92aWRlciA9PT0gJ2Fub255bW91cycpIHJldHVybjtcbiAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgY29uc3QgdXNlclByb3ZpZGVyQXV0aERhdGEgPSB1c2VyQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGlmICghXy5pc0VxdWFsKHByb3ZpZGVyRGF0YSwgdXNlclByb3ZpZGVyQXV0aERhdGEpKSB7XG4gICAgICBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdID0gcHJvdmlkZXJEYXRhO1xuICAgIH1cbiAgfSk7XG4gIGNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkubGVuZ3RoICE9PSAwO1xuICByZXR1cm4geyBoYXNNdXRhdGVkQXV0aERhdGEsIG11dGF0ZWRBdXRoRGF0YSB9O1xufTtcblxuY29uc3QgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiA9IChcbiAgYXV0aERhdGEgPSB7fSxcbiAgdXNlckF1dGhEYXRhID0ge30sXG4gIGNvbmZpZ1xuKSA9PiB7XG4gIGNvbnN0IHNhdmVkVXNlclByb3ZpZGVycyA9IE9iamVjdC5rZXlzKHVzZXJBdXRoRGF0YSkubWFwKHByb3ZpZGVyID0+ICh7XG4gICAgbmFtZTogcHJvdmlkZXIsXG4gICAgYWRhcHRlcjogY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcikuYWRhcHRlcixcbiAgfSkpO1xuXG4gIGNvbnN0IGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlciA9IHNhdmVkVXNlclByb3ZpZGVycy5zb21lKFxuICAgIHByb3ZpZGVyID0+XG4gICAgICBwcm92aWRlciAmJiBwcm92aWRlci5hZGFwdGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIucG9saWN5ID09PSAnc29sbycgJiYgYXV0aERhdGFbcHJvdmlkZXIubmFtZV1cbiAgKTtcblxuICAvLyBTb2xvIHByb3ZpZGVycyBjYW4gYmUgY29uc2lkZXJlZCBhcyBzYWZlXG4gIC8vIHNvIHdlIGRvIG5vdCBoYXZlIHRvIGNoZWNrIGlmIHRoZSB1c2VyIG5lZWRcbiAgLy8gdG8gcHJvdmlkZSBhbiBhZGRpdGlvbmFsIHByb3ZpZGVyIHRvIGxvZ2luXG4gIGlmIChoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIpIHJldHVybjtcblxuICBjb25zdCBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kID0gW107XG4gIGNvbnN0IGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciA9IHNhdmVkVXNlclByb3ZpZGVycy5zb21lKHByb3ZpZGVyID0+IHtcbiAgICBpZiAocHJvdmlkZXIgJiYgcHJvdmlkZXIuYWRhcHRlciAmJiBwcm92aWRlci5hZGFwdGVyLnBvbGljeSA9PT0gJ2FkZGl0aW9uYWwnKSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXIubmFtZV0pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQdXNoIG1pc3NpbmcgcHJvdmlkZXIgZm9yIHBsYXVzaWJsZSBlcnJvciByZXR1cm5cbiAgICAgICAgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5wdXNoKHByb3ZpZGVyLm5hbWUpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIGlmIChoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgfHwgIWFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQubGVuZ3RoKSByZXR1cm47XG5cbiAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgIGBNaXNzaW5nIGFkZGl0aW9uYWwgYXV0aERhdGEgJHthZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLmpvaW4oJywnKX1gXG4gICk7XG59O1xuXG4vLyBWYWxpZGF0ZSBlYWNoIGF1dGhEYXRhIHN0ZXAgYnkgc3RlcCBhbmQgcmV0dXJuIHRoZSBwcm92aWRlciByZXNwb25zZXNcbmNvbnN0IGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiA9IGFzeW5jIChhdXRoRGF0YSwgcmVxLCBmb3VuZFVzZXIpID0+IHtcbiAgbGV0IHVzZXI7XG4gIGlmIChmb3VuZFVzZXIpIHtcbiAgICB1c2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4uZm91bmRVc2VyIH0pO1xuICAgIC8vIEZpbmQgdGhlIHVzZXIgYnkgc2Vzc2lvbiBhbmQgY3VycmVudCBvYmplY3QgaWRcbiAgICAvLyBPbmx5IHBhc3MgdXNlciBpZiBpdCdzIHRoZSBjdXJyZW50IG9uZSBvciBtYXN0ZXIga2V5IHdpdGggcHJvdmlkZWQgdXNlclxuICB9IGVsc2UgaWYgKFxuICAgIChyZXEuYXV0aCAmJlxuICAgICAgcmVxLmF1dGgudXNlciAmJlxuICAgICAgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgIHJlcS5nZXRVc2VySWQoKSA9PT0gcmVxLmF1dGgudXNlci5pZCkgfHxcbiAgICAocmVxLmF1dGggJiYgcmVxLmF1dGguaXNNYXN0ZXIgJiYgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiYgcmVxLmdldFVzZXJJZCgpKVxuICApIHtcbiAgICB1c2VyID0gbmV3IFBhcnNlLlVzZXIoKTtcbiAgICB1c2VyLmlkID0gcmVxLmF1dGguaXNNYXN0ZXIgPyByZXEuZ2V0VXNlcklkKCkgOiByZXEuYXV0aC51c2VyLmlkO1xuICAgIGF3YWl0IHVzZXIuZmV0Y2goeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cblxuICAvLyBQZXJmb3JtIHZhbGlkYXRpb24gYXMgc3RlcCBieSBzdGVwIHBpcGVsaW5lXG4gIC8vIGZvciBiZXR0ZXIgZXJyb3IgY29uc2lzdGVuY3kgYW5kIGFsc28gdG8gYXZvaWQgdG8gdHJpZ2dlciBhIHByb3ZpZGVyIChsaWtlIE9UUCBTTVMpXG4gIC8vIGlmIGFub3RoZXIgb25lIGZhaWxcbiAgcmV0dXJuIHJlZHVjZVByb21pc2UoXG4gICAgLy8gYXBwbHkgc29ydCB0byBydW4gdGhlIHBpcGVsaW5lIGVhY2ggdGltZSBpbiB0aGUgc2FtZSBvcmRlclxuXG4gICAgT2JqZWN0LmtleXMoYXV0aERhdGEpLnNvcnQoKSxcbiAgICBhc3luYyAoYWNjLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKGF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICBpZiAoIXZhbGlkYXRvcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgY29uc3QgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRvcihcbiAgICAgICAgYXV0aERhdGFbcHJvdmlkZXJdLFxuICAgICAgICB7IGNvbmZpZzogcmVxLmNvbmZpZywgYXV0aDogcmVxLmF1dGggfSxcbiAgICAgICAgdXNlclxuICAgICAgKTtcbiAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0KSB7XG4gICAgICAgIGlmICghT2JqZWN0LmtleXModmFsaWRhdGlvblJlc3VsdCkubGVuZ3RoKSBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuXG4gICAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlKSBhY2MuYXV0aERhdGFSZXNwb25zZVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlO1xuICAgICAgICAvLyBTb21lIGF1dGggcHJvdmlkZXJzIGFmdGVyIGluaXRpYWxpemF0aW9uIHdpbGwgYXZvaWRcbiAgICAgICAgLy8gdG8gcmVwbGFjZSBhdXRoRGF0YSBhbHJlYWR5IHN0b3JlZFxuICAgICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQuZG9Ob3RTYXZlKSB7XG4gICAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IHZhbGlkYXRpb25SZXN1bHQuc2F2ZSB8fCBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFN1cHBvcnQgY3VycmVudCBhdXRoRGF0YSBiZWhhdmlvclxuICAgICAgICAvLyBubyByZXN1bHQgc3RvcmUgdGhlIG5ldyBBdXRoRGF0YVxuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LFxuICAgIHsgYXV0aERhdGE6IHt9LCBhdXRoRGF0YVJlc3BvbnNlOiB7fSB9XG4gICk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgQXV0aCxcbiAgbWFzdGVyLFxuICBub2JvZHksXG4gIHJlYWRPbmx5LFxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLFxuICBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuLFxuICBjcmVhdGVTZXNzaW9uLFxuICBmaW5kVXNlcnNXaXRoQXV0aERhdGEsXG4gIGhhc011dGF0ZWRBdXRoRGF0YSxcbiAgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbixcbiAgcmVkdWNlUHJvbWlzZSxcbiAgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uLFxufTtcbiJdfQ==