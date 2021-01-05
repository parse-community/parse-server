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
  const savedUserProviders = Object.keys(userAuthData);
  const hasProvidedASoloProvider = savedUserProviders.some(provider => config.auth[provider] && config.auth[provider].policy === 'solo' && authData[provider]); // Solo providers can be considered as safe
  // so we do not have to check if the user need
  // to provide an additional provider to login

  if (hasProvidedASoloProvider) return;
  const additionProvidersNotFound = [];
  const hasProvidedAtLeastOneAdditionalProvider = savedUserProviders.some(provider => {
    if (config.auth[provider] && config.auth[provider].policy === 'additional') {
      if (authData[provider]) {
        return true;
      } else {
        // Push missing provider for plausible error return
        additionProvidersNotFound.push(provider);
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
    // Only pass user if it's the current one or master key
  } else if (req.auth && req.auth.user && typeof req.getUserId === 'function' && req.getUserId() === req.auth.user.id || req.auth && req.auth.isMaster) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9BdXRoLmpzIl0sIm5hbWVzIjpbImNyeXB0b1V0aWxzIiwicmVxdWlyZSIsIlBhcnNlIiwicmVkdWNlUHJvbWlzZSIsImFyciIsImZuIiwiYWNjIiwiaW5kZXgiLCJuZXdBY2MiLCJQcm9taXNlIiwicmVzb2x2ZSIsIkF1dGgiLCJjb25maWciLCJjYWNoZUNvbnRyb2xsZXIiLCJ1bmRlZmluZWQiLCJpc01hc3RlciIsImlzUmVhZE9ubHkiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VyUm9sZXMiLCJmZXRjaGVkUm9sZXMiLCJyb2xlUHJvbWlzZSIsInByb3RvdHlwZSIsImlzVW5hdXRoZW50aWNhdGVkIiwibWFzdGVyIiwicmVhZE9ubHkiLCJub2JvZHkiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwic2Vzc2lvblRva2VuIiwidXNlckpTT04iLCJnZXQiLCJjYWNoZWRVc2VyIiwiT2JqZWN0IiwiZnJvbUpTT04iLCJyZXN1bHRzIiwicmVzdE9wdGlvbnMiLCJsaW1pdCIsImluY2x1ZGUiLCJSZXN0UXVlcnkiLCJxdWVyeSIsImV4ZWN1dGUiLCJRdWVyeSIsIlNlc3Npb24iLCJlcXVhbFRvIiwiZmluZCIsInVzZU1hc3RlcktleSIsIm1hcCIsIm9iaiIsInRvSlNPTiIsImxlbmd0aCIsIkVycm9yIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwibm93IiwiRGF0ZSIsImV4cGlyZXNBdCIsImlzbyIsInBhc3N3b3JkIiwicHV0IiwidXNlck9iamVjdCIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJ0aGVuIiwicmVzcG9uc2UiLCJjbGFzc05hbWUiLCJnZXRVc2VyUm9sZXMiLCJfbG9hZFJvbGVzIiwiZ2V0Um9sZXNGb3JVc2VyIiwicmVzdFdoZXJlIiwidXNlcnMiLCJfX3R5cGUiLCJvYmplY3RJZCIsImlkIiwiZWFjaCIsInJlc3VsdCIsInB1c2giLCJSb2xlIiwiY2FjaGVkUm9sZXMiLCJyb2xlIiwiY2FjaGVSb2xlcyIsInJvbGVzTWFwIiwicmVkdWNlIiwibSIsInIiLCJuYW1lcyIsIm5hbWUiLCJpZHMiLCJyb2xlTmFtZXMiLCJfZ2V0QWxsUm9sZXNOYW1lc0ZvclJvbGVJZHMiLCJBcnJheSIsImdldFJvbGVzQnlJZHMiLCJpbnMiLCJjb250YWluZWRJbiIsInJvbGVzIiwiJGluIiwicm9sZUlEcyIsInF1ZXJpZWRSb2xlcyIsImZpbHRlciIsInJvbGVJRCIsIndhc1F1ZXJpZWQiLCJTZXQiLCJyZXN1bHRNYXAiLCJtZW1vIiwiY29uY2F0IiwiY3JlYXRlU2Vzc2lvbiIsInVzZXJJZCIsImNyZWF0ZWRXaXRoIiwiYWRkaXRpb25hbFNlc3Npb25EYXRhIiwidG9rZW4iLCJuZXdUb2tlbiIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsInNlc3Npb25EYXRhIiwicmVzdHJpY3RlZCIsIl9lbmNvZGUiLCJhc3NpZ24iLCJSZXN0V3JpdGUiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJhdXRoRGF0YSIsInByb3ZpZGVycyIsImtleXMiLCJwcm92aWRlciIsInF1ZXJ5S2V5IiwicSIsImZpbmRQcm9taXNlIiwiZGF0YWJhc2UiLCIkb3IiLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJ1c2VyQXV0aERhdGEiLCJtdXRhdGVkQXV0aERhdGEiLCJmb3JFYWNoIiwicHJvdmlkZXJEYXRhIiwidXNlclByb3ZpZGVyQXV0aERhdGEiLCJfIiwiaXNFcXVhbCIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJzYXZlZFVzZXJQcm92aWRlcnMiLCJoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIiLCJzb21lIiwiYXV0aCIsInBvbGljeSIsImFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQiLCJoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIiLCJPVEhFUl9DQVVTRSIsImpvaW4iLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJyZXEiLCJmb3VuZFVzZXIiLCJVc2VyIiwiZ2V0VXNlcklkIiwiZmV0Y2giLCJzb3J0IiwidmFsaWRhdG9yIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwidmFsaWRhdGlvblJlc3VsdCIsImF1dGhEYXRhUmVzcG9uc2UiLCJkb05vdFNhdmUiLCJzYXZlIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFFQTs7Ozs7Ozs7OztBQUZBLE1BQU1BLFdBQVcsR0FBR0MsT0FBTyxDQUFDLGVBQUQsQ0FBM0I7O0FBQ0EsTUFBTUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBRCxDQUFyQjs7QUFHQSxNQUFNRSxhQUFhLEdBQUcsT0FBT0MsR0FBUCxFQUFZQyxFQUFaLEVBQWdCQyxHQUFoQixFQUFxQkMsS0FBSyxHQUFHLENBQTdCLEtBQW1DO0FBQ3ZELE1BQUlILEdBQUcsQ0FBQ0csS0FBRCxDQUFQLEVBQWdCO0FBQ2QsVUFBTUMsTUFBTSxHQUFHLE1BQU1DLE9BQU8sQ0FBQ0MsT0FBUixDQUFnQkwsRUFBRSxDQUFDQyxHQUFELEVBQU1GLEdBQUcsQ0FBQ0csS0FBRCxDQUFULENBQWxCLENBQXJCO0FBQ0EsV0FBT0osYUFBYSxDQUFDQyxHQUFELEVBQU1DLEVBQU4sRUFBVUcsTUFBVixFQUFrQkQsS0FBSyxHQUFHLENBQTFCLENBQXBCO0FBQ0Q7O0FBQ0QsU0FBT0QsR0FBUDtBQUNELENBTkQsQyxDQVFBO0FBQ0E7QUFDQTs7O0FBQ0EsU0FBU0ssSUFBVCxDQUFjO0FBQ1pDLEVBQUFBLE1BRFk7QUFFWkMsRUFBQUEsZUFBZSxHQUFHQyxTQUZOO0FBR1pDLEVBQUFBLFFBQVEsR0FBRyxLQUhDO0FBSVpDLEVBQUFBLFVBQVUsR0FBRyxLQUpEO0FBS1pDLEVBQUFBLElBTFk7QUFNWkMsRUFBQUE7QUFOWSxDQUFkLEVBT0c7QUFDRCxPQUFLTixNQUFMLEdBQWNBLE1BQWQ7QUFDQSxPQUFLQyxlQUFMLEdBQXVCQSxlQUFlLElBQUtELE1BQU0sSUFBSUEsTUFBTSxDQUFD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QVNmVSxFQUFBQSxrQkFUZTtBQVVmUSxFQUFBQSxpREFWZTtBQVdmakksRUFBQUEsYUFYZTtBQVlmMkksRUFBQUE7QUFaZSxDQUFqQiIsInNvdXJjZXNDb250ZW50IjpbImNvbnN0IGNyeXB0b1V0aWxzID0gcmVxdWlyZSgnLi9jcnlwdG9VdGlscycpO1xuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuXG5jb25zdCByZWR1Y2VQcm9taXNlID0gYXN5bmMgKGFyciwgZm4sIGFjYywgaW5kZXggPSAwKSA9PiB7XG4gIGlmIChhcnJbaW5kZXhdKSB7XG4gICAgY29uc3QgbmV3QWNjID0gYXdhaXQgUHJvbWlzZS5yZXNvbHZlKGZuKGFjYywgYXJyW2luZGV4XSkpO1xuICAgIHJldHVybiByZWR1Y2VQcm9taXNlKGFyciwgZm4sIG5ld0FjYywgaW5kZXggKyAxKTtcbiAgfVxuICByZXR1cm4gYWNjO1xufTtcblxuLy8gQW4gQXV0aCBvYmplY3QgdGVsbHMgeW91IHdobyBpcyByZXF1ZXN0aW5nIHNvbWV0aGluZyBhbmQgd2hldGhlclxuLy8gdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4vLyB1c2VyT2JqZWN0IGlzIGEgUGFyc2UuVXNlciBhbmQgY2FuIGJlIG51bGwgaWYgdGhlcmUncyBubyB1c2VyLlxuZnVuY3Rpb24gQXV0aCh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyID0gdW5kZWZpbmVkLFxuICBpc01hc3RlciA9IGZhbHNlLFxuICBpc1JlYWRPbmx5ID0gZmFsc2UsXG4gIHVzZXIsXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgdGhpcy5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB0aGlzLmlzTWFzdGVyID0gaXNNYXN0ZXI7XG4gIHRoaXMudXNlciA9IHVzZXI7XG4gIHRoaXMuaXNSZWFkT25seSA9IGlzUmVhZE9ubHk7XG5cbiAgLy8gQXNzdW1pbmcgYSB1c2VycyByb2xlcyB3b24ndCBjaGFuZ2UgZHVyaW5nIGEgc2luZ2xlIHJlcXVlc3QsIHdlJ2xsXG4gIC8vIG9ubHkgbG9hZCB0aGVtIG9uY2UuXG4gIHRoaXMudXNlclJvbGVzID0gW107XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gZmFsc2U7XG4gIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xufVxuXG4vLyBXaGV0aGVyIHRoaXMgYXV0aCBjb3VsZCBwb3NzaWJseSBtb2RpZnkgdGhlIGdpdmVuIHVzZXIgaWQuXG4vLyBJdCBzdGlsbCBjb3VsZCBiZSBmb3JiaWRkZW4gdmlhIEFDTHMgZXZlbiBpZiB0aGlzIHJldHVybnMgdHJ1ZS5cbkF1dGgucHJvdG90eXBlLmlzVW5hdXRoZW50aWNhdGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3Rlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBtYXN0ZXIoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gcmVhZE9ubHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUsIGlzUmVhZE9ubHk6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG5vYm9keS1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbm9ib2R5KGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiBmYWxzZSB9KTtcbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBBdXRoIG9iamVjdFxuY29uc3QgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyLFxuICBzZXNzaW9uVG9rZW4sXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICBjYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IHVzZXJKU09OID0gYXdhaXQgY2FjaGVDb250cm9sbGVyLnVzZXIuZ2V0KHNlc3Npb25Ub2tlbik7XG4gICAgaWYgKHVzZXJKU09OKSB7XG4gICAgICBjb25zdCBjYWNoZWRVc2VyID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHVzZXJKU09OKTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoXG4gICAgICAgIG5ldyBBdXRoKHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgY2FjaGVDb250cm9sbGVyLFxuICAgICAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICB1c2VyOiBjYWNoZWRVc2VyLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBsZXQgcmVzdWx0cztcbiAgaWYgKGNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RPcHRpb25zID0ge1xuICAgICAgbGltaXQ6IDEsXG4gICAgICBpbmNsdWRlOiAndXNlcicsXG4gICAgfTtcbiAgICAvLyBGb3IgY3ljbGljIGRlcFxuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgY29uc3QgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KGNvbmZpZywgbWFzdGVyKGNvbmZpZyksICdfU2Vzc2lvbicsIHsgc2Vzc2lvblRva2VuIH0sIHJlc3RPcHRpb25zKTtcbiAgICByZXN1bHRzID0gKGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKSkucmVzdWx0cztcbiAgfSBlbHNlIHtcbiAgICByZXN1bHRzID0gKFxuICAgICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlNlc3Npb24pXG4gICAgICAgIC5saW1pdCgxKVxuICAgICAgICAuaW5jbHVkZSgndXNlcicpXG4gICAgICAgIC5lcXVhbFRvKCdzZXNzaW9uVG9rZW4nLCBzZXNzaW9uVG9rZW4pXG4gICAgICAgIC5maW5kKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pXG4gICAgKS5tYXAob2JqID0+IG9iai50b0pTT04oKSk7XG4gIH1cblxuICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEgfHwgIXJlc3VsdHNbMF1bJ3VzZXInXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgfVxuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLFxuICAgIGV4cGlyZXNBdCA9IHJlc3VsdHNbMF0uZXhwaXJlc0F0ID8gbmV3IERhdGUocmVzdWx0c1swXS5leHBpcmVzQXQuaXNvKSA6IHVuZGVmaW5lZDtcbiAgaWYgKGV4cGlyZXNBdCA8IG5vdykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdTZXNzaW9uIHRva2VuIGlzIGV4cGlyZWQuJyk7XG4gIH1cbiAgY29uc3Qgb2JqID0gcmVzdWx0c1swXVsndXNlciddO1xuICBkZWxldGUgb2JqLnBhc3N3b3JkO1xuICBvYmpbJ2NsYXNzTmFtZSddID0gJ19Vc2VyJztcbiAgb2JqWydzZXNzaW9uVG9rZW4nXSA9IHNlc3Npb25Ub2tlbjtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNhY2hlQ29udHJvbGxlci51c2VyLnB1dChzZXNzaW9uVG9rZW4sIG9iaik7XG4gIH1cbiAgY29uc3QgdXNlck9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmopO1xuICByZXR1cm4gbmV3IEF1dGgoe1xuICAgIGNvbmZpZyxcbiAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgIGluc3RhbGxhdGlvbklkLFxuICAgIHVzZXI6IHVzZXJPYmplY3QsXG4gIH0pO1xufTtcblxudmFyIGdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4gPSBmdW5jdGlvbiAoeyBjb25maWcsIHNlc3Npb25Ub2tlbiwgaW5zdGFsbGF0aW9uSWQgfSkge1xuICB2YXIgcmVzdE9wdGlvbnMgPSB7XG4gICAgbGltaXQ6IDEsXG4gIH07XG4gIC8vIEZvciBjeWNsaWMgZGVwXG4gIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gIHZhciBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoY29uZmlnLCBtYXN0ZXIoY29uZmlnKSwgJ19Vc2VyJywgeyBzZXNzaW9uVG9rZW4gfSwgcmVzdE9wdGlvbnMpO1xuICByZXR1cm4gcXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHZhciByZXN1bHRzID0gcmVzcG9uc2UucmVzdWx0cztcbiAgICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdpbnZhbGlkIGxlZ2FjeSBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IG9iaiA9IHJlc3VsdHNbMF07XG4gICAgb2JqLmNsYXNzTmFtZSA9ICdfVXNlcic7XG4gICAgY29uc3QgdXNlck9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmopO1xuICAgIHJldHVybiBuZXcgQXV0aCh7XG4gICAgICBjb25maWcsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHVzZXI6IHVzZXJPYmplY3QsXG4gICAgfSk7XG4gIH0pO1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiByb2xlIG5hbWVzXG5BdXRoLnByb3RvdHlwZS5nZXRVc2VyUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyIHx8ICF0aGlzLnVzZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcbiAgfVxuICBpZiAodGhpcy5mZXRjaGVkUm9sZXMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMudXNlclJvbGVzKTtcbiAgfVxuICBpZiAodGhpcy5yb2xlUHJvbWlzZSkge1xuICAgIHJldHVybiB0aGlzLnJvbGVQcm9taXNlO1xuICB9XG4gIHRoaXMucm9sZVByb21pc2UgPSB0aGlzLl9sb2FkUm9sZXMoKTtcbiAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5nZXRSb2xlc0ZvclVzZXIgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIC8vU3RhY2sgYWxsIFBhcnNlLlJvbGVcbiAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICBpZiAodGhpcy5jb25maWcpIHtcbiAgICBjb25zdCByZXN0V2hlcmUgPSB7XG4gICAgICB1c2Vyczoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy51c2VyLmlkLFxuICAgICAgfSxcbiAgICB9O1xuICAgIC8vIEZvciBjeWNsaWMgZGVwXG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBhd2FpdCBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBtYXN0ZXIodGhpcy5jb25maWcpLCAnX1JvbGUnLCByZXN0V2hlcmUsIHt9KS5lYWNoKHJlc3VsdCA9PlxuICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdClcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmVxdWFsVG8oJ3VzZXJzJywgdGhpcy51c2VyKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEl0ZXJhdGVzIHRocm91Z2ggdGhlIHJvbGUgdHJlZSBhbmQgY29tcGlsZXMgYSB1c2VyJ3Mgcm9sZXNcbkF1dGgucHJvdG90eXBlLl9sb2FkUm9sZXMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IGNhY2hlZFJvbGVzID0gYXdhaXQgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5nZXQodGhpcy51c2VyLmlkKTtcbiAgICBpZiAoY2FjaGVkUm9sZXMgIT0gbnVsbCkge1xuICAgICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgICAgdGhpcy51c2VyUm9sZXMgPSBjYWNoZWRSb2xlcztcbiAgICAgIHJldHVybiBjYWNoZWRSb2xlcztcbiAgICB9XG4gIH1cblxuICAvLyBGaXJzdCBnZXQgdGhlIHJvbGUgaWRzIHRoaXMgdXNlciBpcyBkaXJlY3RseSBhIG1lbWJlciBvZlxuICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRSb2xlc0ZvclVzZXIoKTtcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIHRoaXMudXNlclJvbGVzID0gW107XG4gICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xuXG4gICAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gICAgcmV0dXJuIHRoaXMudXNlclJvbGVzO1xuICB9XG5cbiAgY29uc3Qgcm9sZXNNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAobSwgcikgPT4ge1xuICAgICAgbS5uYW1lcy5wdXNoKHIubmFtZSk7XG4gICAgICBtLmlkcy5wdXNoKHIub2JqZWN0SWQpO1xuICAgICAgcmV0dXJuIG07XG4gICAgfSxcbiAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICk7XG5cbiAgLy8gcnVuIHRoZSByZWN1cnNpdmUgZmluZGluZ1xuICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyb2xlc01hcC5pZHMsIHJvbGVzTWFwLm5hbWVzKTtcbiAgdGhpcy51c2VyUm9sZXMgPSByb2xlTmFtZXMubWFwKHIgPT4ge1xuICAgIHJldHVybiAncm9sZTonICsgcjtcbiAgfSk7XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG4gIHRoaXMuY2FjaGVSb2xlcygpO1xuICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jYWNoZVJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUucHV0KHRoaXMudXNlci5pZCwgQXJyYXkoLi4udGhpcy51c2VyUm9sZXMpKTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5nZXRSb2xlc0J5SWRzID0gYXN5bmMgZnVuY3Rpb24gKGlucykge1xuICBjb25zdCByZXN1bHRzID0gW107XG4gIC8vIEJ1aWxkIGFuIE9SIHF1ZXJ5IGFjcm9zcyBhbGwgcGFyZW50Um9sZXNcbiAgaWYgKCF0aGlzLmNvbmZpZykge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmNvbnRhaW5lZEluKFxuICAgICAgICAncm9sZXMnLFxuICAgICAgICBpbnMubWFwKGlkID0+IHtcbiAgICAgICAgICBjb25zdCByb2xlID0gbmV3IFBhcnNlLk9iamVjdChQYXJzZS5Sb2xlKTtcbiAgICAgICAgICByb2xlLmlkID0gaWQ7XG4gICAgICAgICAgcmV0dXJuIHJvbGU7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHJvbGVzID0gaW5zLm1hcChpZCA9PiB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1JvbGUnLFxuICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICB9O1xuICAgIH0pO1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHsgcm9sZXM6IHsgJGluOiByb2xlcyB9IH07XG4gICAgLy8gRm9yIGN5Y2xpYyBkZXBcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGF3YWl0IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIG1hc3Rlcih0aGlzLmNvbmZpZyksICdfUm9sZScsIHJlc3RXaGVyZSwge30pLmVhY2gocmVzdWx0ID0+XG4gICAgICByZXN1bHRzLnB1c2gocmVzdWx0KVxuICAgICk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59O1xuXG4vLyBHaXZlbiBhIGxpc3Qgb2Ygcm9sZUlkcywgZmluZCBhbGwgdGhlIHBhcmVudCByb2xlcywgcmV0dXJucyBhIHByb21pc2Ugd2l0aCBhbGwgbmFtZXNcbkF1dGgucHJvdG90eXBlLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyA9IGZ1bmN0aW9uIChyb2xlSURzLCBuYW1lcyA9IFtdLCBxdWVyaWVkUm9sZXMgPSB7fSkge1xuICBjb25zdCBpbnMgPSByb2xlSURzLmZpbHRlcihyb2xlSUQgPT4ge1xuICAgIGNvbnN0IHdhc1F1ZXJpZWQgPSBxdWVyaWVkUm9sZXNbcm9sZUlEXSAhPT0gdHJ1ZTtcbiAgICBxdWVyaWVkUm9sZXNbcm9sZUlEXSA9IHRydWU7XG4gICAgcmV0dXJuIHdhc1F1ZXJpZWQ7XG4gIH0pO1xuXG4gIC8vIGFsbCByb2xlcyBhcmUgYWNjb3VudGVkIGZvciwgcmV0dXJuIHRoZSBuYW1lc1xuICBpZiAoaW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLmdldFJvbGVzQnlJZHMoaW5zKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gTm90aGluZyBmb3VuZFxuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5hbWVzKTtcbiAgICAgIH1cbiAgICAgIC8vIE1hcCB0aGUgcmVzdWx0cyB3aXRoIGFsbCBJZHMgYW5kIG5hbWVzXG4gICAgICBjb25zdCByZXN1bHRNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAgICAgKG1lbW8sIHJvbGUpID0+IHtcbiAgICAgICAgICBtZW1vLm5hbWVzLnB1c2gocm9sZS5uYW1lKTtcbiAgICAgICAgICBtZW1vLmlkcy5wdXNoKHJvbGUub2JqZWN0SWQpO1xuICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICB9LFxuICAgICAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICAgICApO1xuICAgICAgLy8gc3RvcmUgdGhlIG5ldyBmb3VuZCBuYW1lc1xuICAgICAgbmFtZXMgPSBuYW1lcy5jb25jYXQocmVzdWx0TWFwLm5hbWVzKTtcbiAgICAgIC8vIGZpbmQgdGhlIG5leHQgb25lcywgY2lyY3VsYXIgcm9sZXMgd2lsbCBiZSBjdXRcbiAgICAgIHJldHVybiB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyZXN1bHRNYXAuaWRzLCBuYW1lcywgcXVlcmllZFJvbGVzKTtcbiAgICB9KVxuICAgIC50aGVuKG5hbWVzID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoWy4uLm5ldyBTZXQobmFtZXMpXSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBjcmVhdGVTZXNzaW9uID0gZnVuY3Rpb24gKFxuICBjb25maWcsXG4gIHsgdXNlcklkLCBjcmVhdGVkV2l0aCwgaW5zdGFsbGF0aW9uSWQsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSB9XG4pIHtcbiAgY29uc3QgdG9rZW4gPSAncjonICsgY3J5cHRvVXRpbHMubmV3VG9rZW4oKTtcbiAgY29uc3QgZXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCgpO1xuICBjb25zdCBzZXNzaW9uRGF0YSA9IHtcbiAgICBzZXNzaW9uVG9rZW46IHRva2VuLFxuICAgIHVzZXI6IHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICB9LFxuICAgIGNyZWF0ZWRXaXRoLFxuICAgIHJlc3RyaWN0ZWQ6IGZhbHNlLFxuICAgIGV4cGlyZXNBdDogUGFyc2UuX2VuY29kZShleHBpcmVzQXQpLFxuICB9O1xuXG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIHNlc3Npb25EYXRhLmluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQ7XG4gIH1cblxuICBPYmplY3QuYXNzaWduKHNlc3Npb25EYXRhLCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEpO1xuICAvLyBXZSBuZWVkIHRvIGltcG9ydCBSZXN0V3JpdGUgYXQgdGhpcyBwb2ludCBmb3IgdGhlIGN5Y2xpYyBkZXBlbmRlbmN5IGl0IGhhcyB0byBpdFxuICBjb25zdCBSZXN0V3JpdGUgPSByZXF1aXJlKCcuL1Jlc3RXcml0ZScpO1xuXG4gIHJldHVybiB7XG4gICAgc2Vzc2lvbkRhdGEsXG4gICAgY3JlYXRlU2Vzc2lvbjogKCkgPT5cbiAgICAgIG5ldyBSZXN0V3JpdGUoY29uZmlnLCBtYXN0ZXIoY29uZmlnKSwgJ19TZXNzaW9uJywgbnVsbCwgc2Vzc2lvbkRhdGEpLmV4ZWN1dGUoKSxcbiAgfTtcbn07XG5cbmNvbnN0IGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSA9IChjb25maWcsIGF1dGhEYXRhKSA9PiB7XG4gIGNvbnN0IHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgY29uc3QgcXVlcnkgPSBwcm92aWRlcnNcbiAgICAucmVkdWNlKChtZW1vLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKCFhdXRoRGF0YVtwcm92aWRlcl0gfHwgKGF1dGhEYXRhICYmICFhdXRoRGF0YVtwcm92aWRlcl0uaWQpKSB7XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfVxuICAgICAgY29uc3QgcXVlcnlLZXkgPSBgYXV0aERhdGEuJHtwcm92aWRlcn0uaWRgO1xuICAgICAgY29uc3QgcXVlcnkgPSB7fTtcbiAgICAgIHF1ZXJ5W3F1ZXJ5S2V5XSA9IGF1dGhEYXRhW3Byb3ZpZGVyXS5pZDtcbiAgICAgIG1lbW8ucHVzaChxdWVyeSk7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9LCBbXSlcbiAgICAuZmlsdGVyKHEgPT4ge1xuICAgICAgcmV0dXJuIHR5cGVvZiBxICE9PSAndW5kZWZpbmVkJztcbiAgICB9KTtcblxuICBsZXQgZmluZFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoW10pO1xuICBpZiAocXVlcnkubGVuZ3RoID4gMCkge1xuICAgIGZpbmRQcm9taXNlID0gY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyAkb3I6IHF1ZXJ5IH0sIHt9KTtcbiAgfVxuXG4gIHJldHVybiBmaW5kUHJvbWlzZTtcbn07XG5cbmNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IChhdXRoRGF0YSwgdXNlckF1dGhEYXRhKSA9PiB7XG4gIGlmICghdXNlckF1dGhEYXRhKSByZXR1cm4geyBoYXNNdXRhdGVkQXV0aERhdGE6IHRydWUsIG11dGF0ZWRBdXRoRGF0YTogYXV0aERhdGEgfTtcbiAgY29uc3QgbXV0YXRlZEF1dGhEYXRhID0ge307XG4gIE9iamVjdC5rZXlzKGF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAvLyBBbm9ueW1vdXMgcHJvdmlkZXIgaXMgbm90IGhhbmRsZWQgdGhpcyB3YXlcbiAgICBpZiAocHJvdmlkZXIgPT09ICdhbm9ueW1vdXMnKSByZXR1cm47XG4gICAgY29uc3QgcHJvdmlkZXJEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGNvbnN0IHVzZXJQcm92aWRlckF1dGhEYXRhID0gdXNlckF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICBpZiAoIV8uaXNFcXVhbChwcm92aWRlckRhdGEsIHVzZXJQcm92aWRlckF1dGhEYXRhKSkge1xuICAgICAgbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXSA9IHByb3ZpZGVyRGF0YTtcbiAgICB9XG4gIH0pO1xuICBjb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmxlbmd0aCAhPT0gMDtcbiAgcmV0dXJuIHsgaGFzTXV0YXRlZEF1dGhEYXRhLCBtdXRhdGVkQXV0aERhdGEgfTtcbn07XG5cbmNvbnN0IGNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4gPSAoXG4gIGF1dGhEYXRhID0ge30sXG4gIHVzZXJBdXRoRGF0YSA9IHt9LFxuICBjb25maWdcbikgPT4ge1xuICBjb25zdCBzYXZlZFVzZXJQcm92aWRlcnMgPSBPYmplY3Qua2V5cyh1c2VyQXV0aERhdGEpO1xuXG4gIGNvbnN0IGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlciA9IHNhdmVkVXNlclByb3ZpZGVycy5zb21lKFxuICAgIHByb3ZpZGVyID0+XG4gICAgICBjb25maWcuYXV0aFtwcm92aWRlcl0gJiYgY29uZmlnLmF1dGhbcHJvdmlkZXJdLnBvbGljeSA9PT0gJ3NvbG8nICYmIGF1dGhEYXRhW3Byb3ZpZGVyXVxuICApO1xuXG4gIC8vIFNvbG8gcHJvdmlkZXJzIGNhbiBiZSBjb25zaWRlcmVkIGFzIHNhZmVcbiAgLy8gc28gd2UgZG8gbm90IGhhdmUgdG8gY2hlY2sgaWYgdGhlIHVzZXIgbmVlZFxuICAvLyB0byBwcm92aWRlIGFuIGFkZGl0aW9uYWwgcHJvdmlkZXIgdG8gbG9naW5cbiAgaWYgKGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlcikgcmV0dXJuO1xuXG4gIGNvbnN0IGFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQgPSBbXTtcbiAgY29uc3QgaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgIGlmIChjb25maWcuYXV0aFtwcm92aWRlcl0gJiYgY29uZmlnLmF1dGhbcHJvdmlkZXJdLnBvbGljeSA9PT0gJ2FkZGl0aW9uYWwnKSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXJdKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUHVzaCBtaXNzaW5nIHByb3ZpZGVyIGZvciBwbGF1c2libGUgZXJyb3IgcmV0dXJuXG4gICAgICAgIGFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQucHVzaChwcm92aWRlcik7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgaWYgKGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciB8fCAhYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5sZW5ndGgpIHJldHVybjtcblxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgYE1pc3NpbmcgYWRkaXRpb25hbCBhdXRoRGF0YSAke2FkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQuam9pbignLCcpfWBcbiAgKTtcbn07XG5cbi8vIFZhbGlkYXRlIGVhY2ggYXV0aERhdGEgc3RlcCBieSBzdGVwIGFuZCByZXR1cm4gdGhlIHByb3ZpZGVyIHJlc3BvbnNlc1xuY29uc3QgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uID0gYXN5bmMgKGF1dGhEYXRhLCByZXEsIGZvdW5kVXNlcikgPT4ge1xuICBsZXQgdXNlcjtcbiAgaWYgKGZvdW5kVXNlcikge1xuICAgIHVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5mb3VuZFVzZXIgfSk7XG4gICAgLy8gRmluZCB0aGUgdXNlciBieSBzZXNzaW9uIGFuZCBjdXJyZW50IG9iamVjdCBpZFxuICAgIC8vIE9ubHkgcGFzcyB1c2VyIGlmIGl0J3MgdGhlIGN1cnJlbnQgb25lIG9yIG1hc3RlciBrZXlcbiAgfSBlbHNlIGlmIChcbiAgICAocmVxLmF1dGggJiZcbiAgICAgIHJlcS5hdXRoLnVzZXIgJiZcbiAgICAgIHR5cGVvZiByZXEuZ2V0VXNlcklkID09PSAnZnVuY3Rpb24nICYmXG4gICAgICByZXEuZ2V0VXNlcklkKCkgPT09IHJlcS5hdXRoLnVzZXIuaWQpIHx8XG4gICAgKHJlcS5hdXRoICYmIHJlcS5hdXRoLmlzTWFzdGVyKVxuICApIHtcbiAgICB1c2VyID0gbmV3IFBhcnNlLlVzZXIoKTtcbiAgICB1c2VyLmlkID0gcmVxLmF1dGguaXNNYXN0ZXIgPyByZXEuZ2V0VXNlcklkKCkgOiByZXEuYXV0aC51c2VyLmlkO1xuICAgIGF3YWl0IHVzZXIuZmV0Y2goeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cblxuICAvLyBQZXJmb3JtIHZhbGlkYXRpb24gYXMgc3RlcCBieSBzdGVwIHBpcGVsaW5lXG4gIC8vIGZvciBiZXR0ZXIgZXJyb3IgY29uc2lzdGVuY3kgYW5kIGFsc28gdG8gYXZvaWQgdG8gdHJpZ2dlciBhIHByb3ZpZGVyIChsaWtlIE9UUCBTTVMpXG4gIC8vIGlmIGFub3RoZXIgb25lIGZhaWxcbiAgcmV0dXJuIHJlZHVjZVByb21pc2UoXG4gICAgLy8gYXBwbHkgc29ydCB0byBydW4gdGhlIHBpcGVsaW5lIGVhY2ggdGltZSBpbiB0aGUgc2FtZSBvcmRlclxuXG4gICAgT2JqZWN0LmtleXMoYXV0aERhdGEpLnNvcnQoKSxcbiAgICBhc3luYyAoYWNjLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKGF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICBpZiAoIXZhbGlkYXRvcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgY29uc3QgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRvcihcbiAgICAgICAgYXV0aERhdGFbcHJvdmlkZXJdLFxuICAgICAgICB7IGNvbmZpZzogcmVxLmNvbmZpZywgYXV0aDogcmVxLmF1dGggfSxcbiAgICAgICAgdXNlclxuICAgICAgKTtcbiAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0KSB7XG4gICAgICAgIGlmICghT2JqZWN0LmtleXModmFsaWRhdGlvblJlc3VsdCkubGVuZ3RoKSBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuXG4gICAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlKSBhY2MuYXV0aERhdGFSZXNwb25zZVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlO1xuICAgICAgICAvLyBTb21lIGF1dGggcHJvdmlkZXJzIGFmdGVyIGluaXRpYWxpemF0aW9uIHdpbGwgYXZvaWRcbiAgICAgICAgLy8gdG8gcmVwbGFjZSBhdXRoRGF0YSBhbHJlYWR5IHN0b3JlZFxuICAgICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQuZG9Ob3RTYXZlKSB7XG4gICAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IHZhbGlkYXRpb25SZXN1bHQuc2F2ZSB8fCBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFN1cHBvcnQgY3VycmVudCBhdXRoRGF0YSBiZWhhdmlvclxuICAgICAgICAvLyBubyByZXN1bHQgc3RvcmUgdGhlIG5ldyBBdXRoRGF0YVxuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LFxuICAgIHsgYXV0aERhdGE6IHt9LCBhdXRoRGF0YVJlc3BvbnNlOiB7fSB9XG4gICk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgQXV0aCxcbiAgbWFzdGVyLFxuICBub2JvZHksXG4gIHJlYWRPbmx5LFxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLFxuICBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuLFxuICBjcmVhdGVTZXNzaW9uLFxuICBmaW5kVXNlcnNXaXRoQXV0aERhdGEsXG4gIGhhc011dGF0ZWRBdXRoRGF0YSxcbiAgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbixcbiAgcmVkdWNlUHJvbWlzZSxcbiAgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uLFxufTtcbiJdfQ==