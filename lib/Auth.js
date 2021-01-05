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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9BdXRoLmpzIl0sIm5hbWVzIjpbImNyeXB0b1V0aWxzIiwicmVxdWlyZSIsIlBhcnNlIiwicmVkdWNlUHJvbWlzZSIsImFyciIsImZuIiwiYWNjIiwiaW5kZXgiLCJuZXdBY2MiLCJQcm9taXNlIiwicmVzb2x2ZSIsIkF1dGgiLCJjb25maWciLCJjYWNoZUNvbnRyb2xsZXIiLCJ1bmRlZmluZWQiLCJpc01hc3RlciIsImlzUmVhZE9ubHkiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VyUm9sZXMiLCJmZXRjaGVkUm9sZXMiLCJyb2xlUHJvbWlzZSIsInByb3RvdHlwZSIsImlzVW5hdXRoZW50aWNhdGVkIiwibWFzdGVyIiwicmVhZE9ubHkiLCJub2JvZHkiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwic2Vzc2lvblRva2VuIiwidXNlckpTT04iLCJnZXQiLCJjYWNoZWRVc2VyIiwiT2JqZWN0IiwiZnJvbUpTT04iLCJyZXN1bHRzIiwicmVzdE9wdGlvbnMiLCJsaW1pdCIsImluY2x1ZGUiLCJSZXN0UXVlcnkiLCJxdWVyeSIsImV4ZWN1dGUiLCJRdWVyeSIsIlNlc3Npb24iLCJlcXVhbFRvIiwiZmluZCIsInVzZU1hc3RlcktleSIsIm1hcCIsIm9iaiIsInRvSlNPTiIsImxlbmd0aCIsIkVycm9yIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwibm93IiwiRGF0ZSIsImV4cGlyZXNBdCIsImlzbyIsInBhc3N3b3JkIiwicHV0IiwidXNlck9iamVjdCIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJ0aGVuIiwicmVzcG9uc2UiLCJjbGFzc05hbWUiLCJnZXRVc2VyUm9sZXMiLCJfbG9hZFJvbGVzIiwiZ2V0Um9sZXNGb3JVc2VyIiwicmVzdFdoZXJlIiwidXNlcnMiLCJfX3R5cGUiLCJvYmplY3RJZCIsImlkIiwiZWFjaCIsInJlc3VsdCIsInB1c2giLCJSb2xlIiwiY2FjaGVkUm9sZXMiLCJyb2xlIiwiY2FjaGVSb2xlcyIsInJvbGVzTWFwIiwicmVkdWNlIiwibSIsInIiLCJuYW1lcyIsIm5hbWUiLCJpZHMiLCJyb2xlTmFtZXMiLCJfZ2V0QWxsUm9sZXNOYW1lc0ZvclJvbGVJZHMiLCJBcnJheSIsImdldFJvbGVzQnlJZHMiLCJpbnMiLCJjb250YWluZWRJbiIsInJvbGVzIiwiJGluIiwicm9sZUlEcyIsInF1ZXJpZWRSb2xlcyIsImZpbHRlciIsInJvbGVJRCIsIndhc1F1ZXJpZWQiLCJTZXQiLCJyZXN1bHRNYXAiLCJtZW1vIiwiY29uY2F0IiwiY3JlYXRlU2Vzc2lvbiIsInVzZXJJZCIsImNyZWF0ZWRXaXRoIiwiYWRkaXRpb25hbFNlc3Npb25EYXRhIiwidG9rZW4iLCJuZXdUb2tlbiIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsInNlc3Npb25EYXRhIiwicmVzdHJpY3RlZCIsIl9lbmNvZGUiLCJhc3NpZ24iLCJSZXN0V3JpdGUiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJhdXRoRGF0YSIsInByb3ZpZGVycyIsImtleXMiLCJwcm92aWRlciIsInF1ZXJ5S2V5IiwicSIsImZpbmRQcm9taXNlIiwiZGF0YWJhc2UiLCIkb3IiLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJ1c2VyQXV0aERhdGEiLCJtdXRhdGVkQXV0aERhdGEiLCJmb3JFYWNoIiwicHJvdmlkZXJEYXRhIiwidXNlclByb3ZpZGVyQXV0aERhdGEiLCJfIiwiaXNFcXVhbCIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJzYXZlZFVzZXJQcm92aWRlcnMiLCJoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIiLCJzb21lIiwiYXV0aCIsInBvbGljeSIsImFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQiLCJoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIiLCJPVEhFUl9DQVVTRSIsImpvaW4iLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJyZXEiLCJmb3VuZFVzZXIiLCJVc2VyIiwiZ2V0VXNlcklkIiwiZmV0Y2giLCJzb3J0IiwidmFsaWRhdG9yIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwidmFsaWRhdGlvblJlc3VsdCIsImF1dGhEYXRhUmVzcG9uc2UiLCJkb05vdFNhdmUiLCJzYXZlIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFFQTs7Ozs7Ozs7OztBQUZBLE1BQU1BLFdBQVcsR0FBR0MsT0FBTyxDQUFDLGVBQUQsQ0FBM0I7O0FBQ0EsTUFBTUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBRCxDQUFyQjs7QUFHQSxNQUFNRSxhQUFhLEdBQUcsT0FBT0MsR0FBUCxFQUFZQyxFQUFaLEVBQWdCQyxHQUFoQixFQUFxQkMsS0FBSyxHQUFHLENBQTdCLEtBQW1DO0FBQ3ZELE1BQUlILEdBQUcsQ0FBQ0csS0FBRCxDQUFQLEVBQWdCO0FBQ2QsVUFBTUMsTUFBTSxHQUFHLE1BQU1DLE9BQU8sQ0FBQ0MsT0FBUixDQUFnQkwsRUFBRSxDQUFDQyxHQUFELEVBQU1GLEdBQUcsQ0FBQ0csS0FBRCxDQUFULENBQWxCLENBQXJCO0FBQ0EsV0FBT0osYUFBYSxDQUFDQyxHQUFELEVBQU1DLEVBQU4sRUFBVUcsTUFBVixFQUFrQkQsS0FBSyxHQUFHLENBQTFCLENBQXBCO0FBQ0Q7O0FBQ0QsU0FBT0QsR0FBUDtBQUNELENBTkQsQyxDQVFBO0FBQ0E7QUFDQTs7O0FBQ0EsU0FBU0ssSUFBVCxDQUFjO0FBQ1pDLEVBQUFBLE1BRFk7QUFFWkMsRUFBQUEsZUFBZSxHQUFHQyxTQUZOO0FBR1pDLEVBQUFBLFFBQVEsR0FBRyxLQUhDO0FBSVpDLEVBQUFBLFVBQVUsR0FBRyxLQUpEO0FBS1pDLEVBQUFBLElBTFk7QUFNWkMsRUFBQUE7QUFOWSxDQUFkLEVBT0c7QUFDRCxPQUFLTixNQUFMLEdBQWNBLE1BQWQ7QUFDQSxPQUFLQyxlQUFMLEdBQXVCQSxlQUFlLElBQUtELE1BQU0sSUFBSUEsTUFBTSxDQUFD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ZkUsRUFBQUEsc0JBTGU7QUFNZmdDLEVBQUFBLDRCQU5lO0FBT2YyQyxFQUFBQSxhQVBlO0FBUWZZLEVBQUFBLHFCQVJlO0FBU2ZVLEVBQUFBLGtCQVRlO0FBVWZRLEVBQUFBLGlEQVZlO0FBV2ZqSSxFQUFBQSxhQVhlO0FBWWYySSxFQUFBQTtBQVplLENBQWpCIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgY3J5cHRvVXRpbHMgPSByZXF1aXJlKCcuL2NyeXB0b1V0aWxzJyk7XG5jb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5cbmNvbnN0IHJlZHVjZVByb21pc2UgPSBhc3luYyAoYXJyLCBmbiwgYWNjLCBpbmRleCA9IDApID0+IHtcbiAgaWYgKGFycltpbmRleF0pIHtcbiAgICBjb25zdCBuZXdBY2MgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUoZm4oYWNjLCBhcnJbaW5kZXhdKSk7XG4gICAgcmV0dXJuIHJlZHVjZVByb21pc2UoYXJyLCBmbiwgbmV3QWNjLCBpbmRleCArIDEpO1xuICB9XG4gIHJldHVybiBhY2M7XG59O1xuXG4vLyBBbiBBdXRoIG9iamVjdCB0ZWxscyB5b3Ugd2hvIGlzIHJlcXVlc3Rpbmcgc29tZXRoaW5nIGFuZCB3aGV0aGVyXG4vLyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbi8vIHVzZXJPYmplY3QgaXMgYSBQYXJzZS5Vc2VyIGFuZCBjYW4gYmUgbnVsbCBpZiB0aGVyZSdzIG5vIHVzZXIuXG5mdW5jdGlvbiBBdXRoKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIgPSB1bmRlZmluZWQsXG4gIGlzTWFzdGVyID0gZmFsc2UsXG4gIGlzUmVhZE9ubHkgPSBmYWxzZSxcbiAgdXNlcixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICB0aGlzLmluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQ7XG4gIHRoaXMuaXNNYXN0ZXIgPSBpc01hc3RlcjtcbiAgdGhpcy51c2VyID0gdXNlcjtcbiAgdGhpcy5pc1JlYWRPbmx5ID0gaXNSZWFkT25seTtcblxuICAvLyBBc3N1bWluZyBhIHVzZXJzIHJvbGVzIHdvbid0IGNoYW5nZSBkdXJpbmcgYSBzaW5nbGUgcmVxdWVzdCwgd2UnbGxcbiAgLy8gb25seSBsb2FkIHRoZW0gb25jZS5cbiAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSBmYWxzZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG59XG5cbi8vIFdoZXRoZXIgdGhpcyBhdXRoIGNvdWxkIHBvc3NpYmx5IG1vZGlmeSB0aGUgZ2l2ZW4gdXNlciBpZC5cbi8vIEl0IHN0aWxsIGNvdWxkIGJlIGZvcmJpZGRlbiB2aWEgQUNMcyBldmVuIGlmIHRoaXMgcmV0dXJucyB0cnVlLlxuQXV0aC5wcm90b3R5cGUuaXNVbmF1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh0aGlzLnVzZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYXN0ZXItbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG1hc3Rlcihjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiByZWFkT25seShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSwgaXNSZWFkT25seTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbm9ib2R5LWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBub2JvZHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IGZhbHNlIH0pO1xufVxuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIEF1dGggb2JqZWN0XG5jb25zdCBnZXRBdXRoRm9yU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIsXG4gIHNlc3Npb25Ub2tlbixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIGNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgdXNlckpTT04gPSBhd2FpdCBjYWNoZUNvbnRyb2xsZXIudXNlci5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAodXNlckpTT04pIHtcbiAgICAgIGNvbnN0IGNhY2hlZFVzZXIgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04odXNlckpTT04pO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgbmV3IEF1dGgoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgICAgIHVzZXI6IGNhY2hlZFVzZXIsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGxldCByZXN1bHRzO1xuICBpZiAoY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdE9wdGlvbnMgPSB7XG4gICAgICBsaW1pdDogMSxcbiAgICAgIGluY2x1ZGU6ICd1c2VyJyxcbiAgICB9O1xuICAgIC8vIEZvciBjeWNsaWMgZGVwXG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBjb25zdCBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoY29uZmlnLCBtYXN0ZXIoY29uZmlnKSwgJ19TZXNzaW9uJywgeyBzZXNzaW9uVG9rZW4gfSwgcmVzdE9wdGlvbnMpO1xuICAgIHJlc3VsdHMgPSAoYXdhaXQgcXVlcnkuZXhlY3V0ZSgpKS5yZXN1bHRzO1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdHMgPSAoXG4gICAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuU2Vzc2lvbilcbiAgICAgICAgLmxpbWl0KDEpXG4gICAgICAgIC5pbmNsdWRlKCd1c2VyJylcbiAgICAgICAgLmVxdWFsVG8oJ3Nlc3Npb25Ub2tlbicsIHNlc3Npb25Ub2tlbilcbiAgICAgICAgLmZpbmQoeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSlcbiAgICApLm1hcChvYmogPT4gb2JqLnRvSlNPTigpKTtcbiAgfVxuXG4gIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSB8fCAhcmVzdWx0c1swXVsndXNlciddKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICB9XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCksXG4gICAgZXhwaXJlc0F0ID0gcmVzdWx0c1swXS5leHBpcmVzQXQgPyBuZXcgRGF0ZShyZXN1bHRzWzBdLmV4cGlyZXNBdC5pc28pIDogdW5kZWZpbmVkO1xuICBpZiAoZXhwaXJlc0F0IDwgbm93KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gaXMgZXhwaXJlZC4nKTtcbiAgfVxuICBjb25zdCBvYmogPSByZXN1bHRzWzBdWyd1c2VyJ107XG4gIGRlbGV0ZSBvYmoucGFzc3dvcmQ7XG4gIG9ialsnY2xhc3NOYW1lJ10gPSAnX1VzZXInO1xuICBvYmpbJ3Nlc3Npb25Ub2tlbiddID0gc2Vzc2lvblRva2VuO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY2FjaGVDb250cm9sbGVyLnVzZXIucHV0KHNlc3Npb25Ub2tlbiwgb2JqKTtcbiAgfVxuICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gIHJldHVybiBuZXcgQXV0aCh7XG4gICAgY29uZmlnLFxuICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgdXNlcjogdXNlck9iamVjdCxcbiAgfSk7XG59O1xuXG52YXIgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiA9IGZ1bmN0aW9uICh7IGNvbmZpZywgc2Vzc2lvblRva2VuLCBpbnN0YWxsYXRpb25JZCB9KSB7XG4gIHZhciByZXN0T3B0aW9ucyA9IHtcbiAgICBsaW1pdDogMSxcbiAgfTtcbiAgLy8gRm9yIGN5Y2xpYyBkZXBcbiAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgdmFyIHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShjb25maWcsIG1hc3Rlcihjb25maWcpLCAnX1VzZXInLCB7IHNlc3Npb25Ub2tlbiB9LCByZXN0T3B0aW9ucyk7XG4gIHJldHVybiBxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdmFyIHJlc3VsdHMgPSByZXNwb25zZS5yZXN1bHRzO1xuICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ2ludmFsaWQgbGVnYWN5IHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgb2JqID0gcmVzdWx0c1swXTtcbiAgICBvYmouY2xhc3NOYW1lID0gJ19Vc2VyJztcbiAgICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gICAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICAgIGNvbmZpZyxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgdXNlcjogdXNlck9iamVjdCxcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIHJvbGUgbmFtZXNcbkF1dGgucHJvdG90eXBlLmdldFVzZXJSb2xlcyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNNYXN0ZXIgfHwgIXRoaXMudXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG4gIGlmICh0aGlzLmZldGNoZWRSb2xlcykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy51c2VyUm9sZXMpO1xuICB9XG4gIGlmICh0aGlzLnJvbGVQcm9taXNlKSB7XG4gICAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG4gIH1cbiAgdGhpcy5yb2xlUHJvbWlzZSA9IHRoaXMuX2xvYWRSb2xlcygpO1xuICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzRm9yVXNlciA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy9TdGFjayBhbGwgUGFyc2UuUm9sZVxuICBjb25zdCByZXN1bHRzID0gW107XG4gIGlmICh0aGlzLmNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHtcbiAgICAgIHVzZXJzOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLnVzZXIuaWQsXG4gICAgICB9LFxuICAgIH07XG4gICAgLy8gRm9yIGN5Y2xpYyBkZXBcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGF3YWl0IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIG1hc3Rlcih0aGlzLmNvbmZpZyksICdfUm9sZScsIHJlc3RXaGVyZSwge30pLmVhY2gocmVzdWx0ID0+XG4gICAgICByZXN1bHRzLnB1c2gocmVzdWx0KVxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuZXF1YWxUbygndXNlcnMnLCB0aGlzLnVzZXIpXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufTtcblxuLy8gSXRlcmF0ZXMgdGhyb3VnaCB0aGUgcm9sZSB0cmVlIGFuZCBjb21waWxlcyBhIHVzZXIncyByb2xlc1xuQXV0aC5wcm90b3R5cGUuX2xvYWRSb2xlcyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgY2FjaGVkUm9sZXMgPSBhd2FpdCB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmdldCh0aGlzLnVzZXIuaWQpO1xuICAgIGlmIChjYWNoZWRSb2xlcyAhPSBudWxsKSB7XG4gICAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgICB0aGlzLnVzZXJSb2xlcyA9IGNhY2hlZFJvbGVzO1xuICAgICAgcmV0dXJuIGNhY2hlZFJvbGVzO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpcnN0IGdldCB0aGUgcm9sZSBpZHMgdGhpcyB1c2VyIGlzIGRpcmVjdGx5IGEgbWVtYmVyIG9mXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmdldFJvbGVzRm9yVXNlcigpO1xuICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG5cbiAgICB0aGlzLmNhY2hlUm9sZXMoKTtcbiAgICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG4gIH1cblxuICBjb25zdCByb2xlc01hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgIChtLCByKSA9PiB7XG4gICAgICBtLm5hbWVzLnB1c2goci5uYW1lKTtcbiAgICAgIG0uaWRzLnB1c2goci5vYmplY3RJZCk7XG4gICAgICByZXR1cm4gbTtcbiAgICB9LFxuICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgKTtcblxuICAvLyBydW4gdGhlIHJlY3Vyc2l2ZSBmaW5kaW5nXG4gIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJvbGVzTWFwLmlkcywgcm9sZXNNYXAubmFtZXMpO1xuICB0aGlzLnVzZXJSb2xlcyA9IHJvbGVOYW1lcy5tYXAociA9PiB7XG4gICAgcmV0dXJuICdyb2xlOicgKyByO1xuICB9KTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbiAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnVzZXJSb2xlcztcbn07XG5cbkF1dGgucHJvdG90eXBlLmNhY2hlUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jYWNoZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5wdXQodGhpcy51c2VyLmlkLCBBcnJheSguLi50aGlzLnVzZXJSb2xlcykpO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzQnlJZHMgPSBhc3luYyBmdW5jdGlvbiAoaW5zKSB7XG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgLy8gQnVpbGQgYW4gT1IgcXVlcnkgYWNyb3NzIGFsbCBwYXJlbnRSb2xlc1xuICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuY29udGFpbmVkSW4oXG4gICAgICAgICdyb2xlcycsXG4gICAgICAgIGlucy5tYXAoaWQgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvbGUgPSBuZXcgUGFyc2UuT2JqZWN0KFBhcnNlLlJvbGUpO1xuICAgICAgICAgIHJvbGUuaWQgPSBpZDtcbiAgICAgICAgICByZXR1cm4gcm9sZTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0LnRvSlNPTigpKSwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgcm9sZXMgPSBpbnMubWFwKGlkID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgIH07XG4gICAgfSk7XG4gICAgY29uc3QgcmVzdFdoZXJlID0geyByb2xlczogeyAkaW46IHJvbGVzIH0gfTtcbiAgICAvLyBGb3IgY3ljbGljIGRlcFxuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgYXdhaXQgbmV3IFJlc3RRdWVyeSh0aGlzLmNvbmZpZywgbWFzdGVyKHRoaXMuY29uZmlnKSwgJ19Sb2xlJywgcmVzdFdoZXJlLCB7fSkuZWFjaChyZXN1bHQgPT5cbiAgICAgIHJlc3VsdHMucHVzaChyZXN1bHQpXG4gICAgKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEdpdmVuIGEgbGlzdCBvZiByb2xlSWRzLCBmaW5kIGFsbCB0aGUgcGFyZW50IHJvbGVzLCByZXR1cm5zIGEgcHJvbWlzZSB3aXRoIGFsbCBuYW1lc1xuQXV0aC5wcm90b3R5cGUuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzID0gZnVuY3Rpb24gKHJvbGVJRHMsIG5hbWVzID0gW10sIHF1ZXJpZWRSb2xlcyA9IHt9KSB7XG4gIGNvbnN0IGlucyA9IHJvbGVJRHMuZmlsdGVyKHJvbGVJRCA9PiB7XG4gICAgY29uc3Qgd2FzUXVlcmllZCA9IHF1ZXJpZWRSb2xlc1tyb2xlSURdICE9PSB0cnVlO1xuICAgIHF1ZXJpZWRSb2xlc1tyb2xlSURdID0gdHJ1ZTtcbiAgICByZXR1cm4gd2FzUXVlcmllZDtcbiAgfSk7XG5cbiAgLy8gYWxsIHJvbGVzIGFyZSBhY2NvdW50ZWQgZm9yLCByZXR1cm4gdGhlIG5hbWVzXG4gIGlmIChpbnMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFsuLi5uZXcgU2V0KG5hbWVzKV0pO1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuZ2V0Um9sZXNCeUlkcyhpbnMpXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAvLyBOb3RoaW5nIGZvdW5kXG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmFtZXMpO1xuICAgICAgfVxuICAgICAgLy8gTWFwIHRoZSByZXN1bHRzIHdpdGggYWxsIElkcyBhbmQgbmFtZXNcbiAgICAgIGNvbnN0IHJlc3VsdE1hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgICAgICAobWVtbywgcm9sZSkgPT4ge1xuICAgICAgICAgIG1lbW8ubmFtZXMucHVzaChyb2xlLm5hbWUpO1xuICAgICAgICAgIG1lbW8uaWRzLnB1c2gocm9sZS5vYmplY3RJZCk7XG4gICAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICAgIH0sXG4gICAgICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgICAgICk7XG4gICAgICAvLyBzdG9yZSB0aGUgbmV3IGZvdW5kIG5hbWVzXG4gICAgICBuYW1lcyA9IG5hbWVzLmNvbmNhdChyZXN1bHRNYXAubmFtZXMpO1xuICAgICAgLy8gZmluZCB0aGUgbmV4dCBvbmVzLCBjaXJjdWxhciByb2xlcyB3aWxsIGJlIGN1dFxuICAgICAgcmV0dXJuIHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJlc3VsdE1hcC5pZHMsIG5hbWVzLCBxdWVyaWVkUm9sZXMpO1xuICAgIH0pXG4gICAgLnRoZW4obmFtZXMgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IGNyZWF0ZVNlc3Npb24gPSBmdW5jdGlvbiAoXG4gIGNvbmZpZyxcbiAgeyB1c2VySWQsIGNyZWF0ZWRXaXRoLCBpbnN0YWxsYXRpb25JZCwgYWRkaXRpb25hbFNlc3Npb25EYXRhIH1cbikge1xuICBjb25zdCB0b2tlbiA9ICdyOicgKyBjcnlwdG9VdGlscy5uZXdUb2tlbigpO1xuICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gIGNvbnN0IHNlc3Npb25EYXRhID0ge1xuICAgIHNlc3Npb25Ub2tlbjogdG9rZW4sXG4gICAgdXNlcjoge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgIH0sXG4gICAgY3JlYXRlZFdpdGgsXG4gICAgcmVzdHJpY3RlZDogZmFsc2UsXG4gICAgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCksXG4gIH07XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgc2Vzc2lvbkRhdGEuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIE9iamVjdC5hc3NpZ24oc2Vzc2lvbkRhdGEsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSk7XG4gIC8vIFdlIG5lZWQgdG8gaW1wb3J0IFJlc3RXcml0ZSBhdCB0aGlzIHBvaW50IGZvciB0aGUgY3ljbGljIGRlcGVuZGVuY3kgaXQgaGFzIHRvIGl0XG4gIGNvbnN0IFJlc3RXcml0ZSA9IHJlcXVpcmUoJy4vUmVzdFdyaXRlJyk7XG5cbiAgcmV0dXJuIHtcbiAgICBzZXNzaW9uRGF0YSxcbiAgICBjcmVhdGVTZXNzaW9uOiAoKSA9PlxuICAgICAgbmV3IFJlc3RXcml0ZShjb25maWcsIG1hc3Rlcihjb25maWcpLCAnX1Nlc3Npb24nLCBudWxsLCBzZXNzaW9uRGF0YSkuZXhlY3V0ZSgpLFxuICB9O1xufTtcblxuY29uc3QgZmluZFVzZXJzV2l0aEF1dGhEYXRhID0gKGNvbmZpZywgYXV0aERhdGEpID0+IHtcbiAgY29uc3QgcHJvdmlkZXJzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpO1xuICBjb25zdCBxdWVyeSA9IHByb3ZpZGVyc1xuICAgIC5yZWR1Y2UoKG1lbW8sIHByb3ZpZGVyKSA9PiB7XG4gICAgICBpZiAoIWF1dGhEYXRhW3Byb3ZpZGVyXSB8fCAoYXV0aERhdGEgJiYgIWF1dGhEYXRhW3Byb3ZpZGVyXS5pZCkpIHtcbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9XG4gICAgICBjb25zdCBxdWVyeUtleSA9IGBhdXRoRGF0YS4ke3Byb3ZpZGVyfS5pZGA7XG4gICAgICBjb25zdCBxdWVyeSA9IHt9O1xuICAgICAgcXVlcnlbcXVlcnlLZXldID0gYXV0aERhdGFbcHJvdmlkZXJdLmlkO1xuICAgICAgbWVtby5wdXNoKHF1ZXJ5KTtcbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH0sIFtdKVxuICAgIC5maWx0ZXIocSA9PiB7XG4gICAgICByZXR1cm4gdHlwZW9mIHEgIT09ICd1bmRlZmluZWQnO1xuICAgIH0pO1xuXG4gIGxldCBmaW5kUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShbXSk7XG4gIGlmIChxdWVyeS5sZW5ndGggPiAwKSB7XG4gICAgZmluZFByb21pc2UgPSBjb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7ICRvcjogcXVlcnkgfSwge30pO1xuICB9XG5cbiAgcmV0dXJuIGZpbmRQcm9taXNlO1xufTtcblxuY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gKGF1dGhEYXRhLCB1c2VyQXV0aERhdGEpID0+IHtcbiAgaWYgKCF1c2VyQXV0aERhdGEpIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YTogdHJ1ZSwgbXV0YXRlZEF1dGhEYXRhOiBhdXRoRGF0YSB9O1xuICBjb25zdCBtdXRhdGVkQXV0aERhdGEgPSB7fTtcbiAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgIC8vIEFub255bW91cyBwcm92aWRlciBpcyBub3QgaGFuZGxlZCB0aGlzIHdheVxuICAgIGlmIChwcm92aWRlciA9PT0gJ2Fub255bW91cycpIHJldHVybjtcbiAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgY29uc3QgdXNlclByb3ZpZGVyQXV0aERhdGEgPSB1c2VyQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGlmICghXy5pc0VxdWFsKHByb3ZpZGVyRGF0YSwgdXNlclByb3ZpZGVyQXV0aERhdGEpKSB7XG4gICAgICBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdID0gcHJvdmlkZXJEYXRhO1xuICAgIH1cbiAgfSk7XG4gIGNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkubGVuZ3RoICE9PSAwO1xuICByZXR1cm4geyBoYXNNdXRhdGVkQXV0aERhdGEsIG11dGF0ZWRBdXRoRGF0YSB9O1xufTtcblxuY29uc3QgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiA9IChcbiAgYXV0aERhdGEgPSB7fSxcbiAgdXNlckF1dGhEYXRhID0ge30sXG4gIGNvbmZpZ1xuKSA9PiB7XG4gIGNvbnN0IHNhdmVkVXNlclByb3ZpZGVycyA9IE9iamVjdC5rZXlzKHVzZXJBdXRoRGF0YSk7XG5cbiAgY29uc3QgaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUoXG4gICAgcHJvdmlkZXIgPT5cbiAgICAgIGNvbmZpZy5hdXRoW3Byb3ZpZGVyXSAmJiBjb25maWcuYXV0aFtwcm92aWRlcl0ucG9saWN5ID09PSAnc29sbycgJiYgYXV0aERhdGFbcHJvdmlkZXJdXG4gICk7XG5cbiAgLy8gU29sbyBwcm92aWRlcnMgY2FuIGJlIGNvbnNpZGVyZWQgYXMgc2FmZVxuICAvLyBzbyB3ZSBkbyBub3QgaGF2ZSB0byBjaGVjayBpZiB0aGUgdXNlciBuZWVkXG4gIC8vIHRvIHByb3ZpZGUgYW4gYWRkaXRpb25hbCBwcm92aWRlciB0byBsb2dpblxuICBpZiAoaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyKSByZXR1cm47XG5cbiAgY29uc3QgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCA9IFtdO1xuICBjb25zdCBoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShwcm92aWRlciA9PiB7XG4gICAgaWYgKGNvbmZpZy5hdXRoW3Byb3ZpZGVyXSAmJiBjb25maWcuYXV0aFtwcm92aWRlcl0ucG9saWN5ID09PSAnYWRkaXRpb25hbCcpIHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlcl0pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQdXNoIG1pc3NpbmcgcHJvdmlkZXIgZm9yIHBsYXVzaWJsZSBlcnJvciByZXR1cm5cbiAgICAgICAgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5wdXNoKHByb3ZpZGVyKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICBpZiAoaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyIHx8ICFhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLmxlbmd0aCkgcmV0dXJuO1xuXG4gIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICBgTWlzc2luZyBhZGRpdGlvbmFsIGF1dGhEYXRhICR7YWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5qb2luKCcsJyl9YFxuICApO1xufTtcblxuLy8gVmFsaWRhdGUgZWFjaCBhdXRoRGF0YSBzdGVwIGJ5IHN0ZXAgYW5kIHJldHVybiB0aGUgcHJvdmlkZXIgcmVzcG9uc2VzXG5jb25zdCBoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24gPSBhc3luYyAoYXV0aERhdGEsIHJlcSwgZm91bmRVc2VyKSA9PiB7XG4gIGxldCB1c2VyO1xuICBpZiAoZm91bmRVc2VyKSB7XG4gICAgdXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLmZvdW5kVXNlciB9KTtcbiAgICAvLyBGaW5kIHRoZSB1c2VyIGJ5IHNlc3Npb24gYW5kIGN1cnJlbnQgb2JqZWN0IGlkXG4gICAgLy8gT25seSBwYXNzIHVzZXIgaWYgaXQncyB0aGUgY3VycmVudCBvbmUgb3IgbWFzdGVyIGtleSB3aXRoIHByb3ZpZGVkIHVzZXJcbiAgfSBlbHNlIGlmIChcbiAgICAocmVxLmF1dGggJiZcbiAgICAgIHJlcS5hdXRoLnVzZXIgJiZcbiAgICAgIHR5cGVvZiByZXEuZ2V0VXNlcklkID09PSAnZnVuY3Rpb24nICYmXG4gICAgICByZXEuZ2V0VXNlcklkKCkgPT09IHJlcS5hdXRoLnVzZXIuaWQpIHx8XG4gICAgKHJlcS5hdXRoICYmIHJlcS5hdXRoLmlzTWFzdGVyICYmIHR5cGVvZiByZXEuZ2V0VXNlcklkID09PSAnZnVuY3Rpb24nICYmIHJlcS5nZXRVc2VySWQoKSlcbiAgKSB7XG4gICAgdXNlciA9IG5ldyBQYXJzZS5Vc2VyKCk7XG4gICAgdXNlci5pZCA9IHJlcS5hdXRoLmlzTWFzdGVyID8gcmVxLmdldFVzZXJJZCgpIDogcmVxLmF1dGgudXNlci5pZDtcbiAgICBhd2FpdCB1c2VyLmZldGNoKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG5cbiAgLy8gUGVyZm9ybSB2YWxpZGF0aW9uIGFzIHN0ZXAgYnkgc3RlcCBwaXBlbGluZVxuICAvLyBmb3IgYmV0dGVyIGVycm9yIGNvbnNpc3RlbmN5IGFuZCBhbHNvIHRvIGF2b2lkIHRvIHRyaWdnZXIgYSBwcm92aWRlciAobGlrZSBPVFAgU01TKVxuICAvLyBpZiBhbm90aGVyIG9uZSBmYWlsXG4gIHJldHVybiByZWR1Y2VQcm9taXNlKFxuICAgIC8vIGFwcGx5IHNvcnQgdG8gcnVuIHRoZSBwaXBlbGluZSBlYWNoIHRpbWUgaW4gdGhlIHNhbWUgb3JkZXJcblxuICAgIE9iamVjdC5rZXlzKGF1dGhEYXRhKS5zb3J0KCksXG4gICAgYXN5bmMgKGFjYywgcHJvdmlkZXIpID0+IHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IG51bGw7XG4gICAgICAgIHJldHVybiBhY2M7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHZhbGlkYXRvciB9ID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgaWYgKCF2YWxpZGF0b3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0b3IoXG4gICAgICAgIGF1dGhEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgeyBjb25maWc6IHJlcS5jb25maWcsIGF1dGg6IHJlcS5hdXRoIH0sXG4gICAgICAgIHVzZXJcbiAgICAgICk7XG4gICAgICBpZiAodmFsaWRhdGlvblJlc3VsdCkge1xuICAgICAgICBpZiAoIU9iamVjdC5rZXlzKHZhbGlkYXRpb25SZXN1bHQpLmxlbmd0aCkgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcblxuICAgICAgICBpZiAodmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZSkgYWNjLmF1dGhEYXRhUmVzcG9uc2VbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZTtcbiAgICAgICAgLy8gU29tZSBhdXRoIHByb3ZpZGVycyBhZnRlciBpbml0aWFsaXphdGlvbiB3aWxsIGF2b2lkXG4gICAgICAgIC8vIHRvIHJlcGxhY2UgYXV0aERhdGEgYWxyZWFkeSBzdG9yZWRcbiAgICAgICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0LmRvTm90U2F2ZSkge1xuICAgICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnNhdmUgfHwgYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBTdXBwb3J0IGN1cnJlbnQgYXV0aERhdGEgYmVoYXZpb3JcbiAgICAgICAgLy8gbm8gcmVzdWx0IHN0b3JlIHRoZSBuZXcgQXV0aERhdGFcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSxcbiAgICB7IGF1dGhEYXRhOiB7fSwgYXV0aERhdGFSZXNwb25zZToge30gfVxuICApO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIEF1dGgsXG4gIG1hc3RlcixcbiAgbm9ib2R5LFxuICByZWFkT25seSxcbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbixcbiAgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbixcbiAgY3JlYXRlU2Vzc2lvbixcbiAgZmluZFVzZXJzV2l0aEF1dGhEYXRhLFxuICBoYXNNdXRhdGVkQXV0aERhdGEsXG4gIGNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4sXG4gIHJlZHVjZVByb21pc2UsXG4gIGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbixcbn07XG4iXX0=