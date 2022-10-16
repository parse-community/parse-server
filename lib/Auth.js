"use strict";

var _util = require("util");

var _triggers = require("./triggers");

var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));

var _logger = require("./logger");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
    };

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
  };

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
    };

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

Auth.prototype.clearRoleCache = function (sessionToken) {
  if (!this.cacheController) {
    return false;
  }

  this.cacheController.role.del(this.user.id);
  this.cacheController.user.del(sessionToken);
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
    };

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
  return query.length > 0 ? config.database.find('_User', {
    $or: query
  }, {
    limit: 2
  }) : Promise.resolve([]);
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
  const hasProvidedASoloProvider = savedUserProviders.some(provider => provider && provider.adapter && provider.adapter.policy === 'solo' && authData[provider.name]); // Solo providers can be considered as safe, so we do not have to check if the user needs
  // to provide an additional provider to login. An auth adapter with "solo" (like webauthn) means
  // no "additional" auth needs to be provided to login (like OTP, MFA)

  if (hasProvidedASoloProvider) {
    return;
  }

  const additionProvidersNotFound = [];
  const hasProvidedAtLeastOneAdditionalProvider = savedUserProviders.some(provider => {
    if (provider && provider.adapter && provider.adapter.policy === 'additional') {
      if (authData[provider.name]) {
        return true;
      } else {
        // Push missing provider for error message
        additionProvidersNotFound.push(provider.name);
      }
    }
  });

  if (hasProvidedAtLeastOneAdditionalProvider || !additionProvidersNotFound.length) {
    return;
  }

  throw new Parse.Error(Parse.Error.OTHER_CAUSE, `Missing additional authData ${additionProvidersNotFound.join(',')}`);
}; // Validate each authData step-by-step and return the provider responses


const handleAuthDataValidation = async (authData, req, foundUser) => {
  let user;

  if (foundUser) {
    user = Parse.User.fromJSON(_objectSpread({
      className: '_User'
    }, foundUser)); // Find user by session and current objectId; only pass user if it's the current user or master key is provided
  } else if (req.auth && req.auth.user && typeof req.getUserId === 'function' && req.getUserId() === req.auth.user.id || req.auth && req.auth.isMaster && typeof req.getUserId === 'function' && req.getUserId()) {
    user = new Parse.User();
    user.id = req.auth.isMaster ? req.getUserId() : req.auth.user.id;
    await user.fetch({
      useMasterKey: true
    });
  }

  const {
    originalObject,
    updatedObject
  } = req.buildParseObjects();
  const requestObject = (0, _triggers.getRequestObject)(undefined, req.auth, updatedObject, originalObject || user, req.config); // Perform validation as step-by-step pipeline for better error consistency
  // and also to avoid to trigger a provider (like OTP SMS) if another one fails

  const acc = {
    authData: {},
    authDataResponse: {}
  };

  for (const provider of Object.keys(authData).sort()) {
    let method = '';

    try {
      if (authData[provider] === null) {
        acc.authData[provider] = null;
        return acc;
      }

      const {
        validator
      } = req.config.authDataManager.getValidatorForProvider(provider);
      const authProvider = (req.config.auth || {})[provider] || {};

      if (authProvider.enabled == null) {
        _Deprecator.default.logRuntimeDeprecation({
          usage: `auth.${provider}`,
          solution: `auth.${provider}.enabled: true`
        });
      }

      if (!validator || authProvider.enabled === false) {
        throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
      }

      let validationResult = await validator(authData[provider], req, user, requestObject);
      method = validationResult && validationResult.method;
      requestObject.triggerName = method;

      if (validationResult && validationResult.validator) {
        validationResult = await validationResult.validator();
      }

      if (!validationResult) {
        acc.authData[provider] = authData[provider];
        continue;
      }

      if (!Object.keys(validationResult).length) {
        acc.authData[provider] = authData[provider];
      }

      if (validationResult.response) {
        acc.authDataResponse[provider] = validationResult.response;
      } // Some auth providers after initialization will avoid to replace authData already stored


      if (!validationResult.doNotSave) {
        acc.authData[provider] = validationResult.save || authData[provider];
      }
    } catch (err) {
      const e = (0, _triggers.resolveError)(err, {
        code: Parse.Error.SCRIPT_FAILED,
        message: 'Auth failed. Unknown error.'
      });
      const userString = req.auth && req.auth.user ? req.auth.user.id : req.data.objectId || undefined;

      _logger.logger.error(`Failed running auth step ${method} for ${provider} for user ${userString} with Error: ` + JSON.stringify(e), {
        authenticationStep: method,
        error: e,
        user: userString,
        provider
      });

      throw e;
    }
  }

  return acc;
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
  handleAuthDataValidation
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9BdXRoLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsIkF1dGgiLCJjb25maWciLCJjYWNoZUNvbnRyb2xsZXIiLCJ1bmRlZmluZWQiLCJpc01hc3RlciIsImlzUmVhZE9ubHkiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VyUm9sZXMiLCJmZXRjaGVkUm9sZXMiLCJyb2xlUHJvbWlzZSIsInByb3RvdHlwZSIsImlzVW5hdXRoZW50aWNhdGVkIiwibWFzdGVyIiwicmVhZE9ubHkiLCJub2JvZHkiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwic2Vzc2lvblRva2VuIiwidXNlckpTT04iLCJnZXQiLCJjYWNoZWRVc2VyIiwiT2JqZWN0IiwiZnJvbUpTT04iLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlc3VsdHMiLCJyZXN0T3B0aW9ucyIsImxpbWl0IiwiaW5jbHVkZSIsIlJlc3RRdWVyeSIsInF1ZXJ5IiwiZXhlY3V0ZSIsIlF1ZXJ5IiwiU2Vzc2lvbiIsImVxdWFsVG8iLCJmaW5kIiwidXNlTWFzdGVyS2V5IiwibWFwIiwib2JqIiwidG9KU09OIiwibGVuZ3RoIiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJub3ciLCJEYXRlIiwiZXhwaXJlc0F0IiwiaXNvIiwicGFzc3dvcmQiLCJwdXQiLCJ1c2VyT2JqZWN0IiwiZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiIsInRoZW4iLCJyZXNwb25zZSIsImNsYXNzTmFtZSIsImdldFVzZXJSb2xlcyIsIl9sb2FkUm9sZXMiLCJnZXRSb2xlc0ZvclVzZXIiLCJyZXN0V2hlcmUiLCJ1c2VycyIsIl9fdHlwZSIsIm9iamVjdElkIiwiaWQiLCJlYWNoIiwicmVzdWx0IiwicHVzaCIsIlJvbGUiLCJjYWNoZWRSb2xlcyIsInJvbGUiLCJjYWNoZVJvbGVzIiwicm9sZXNNYXAiLCJyZWR1Y2UiLCJtIiwiciIsIm5hbWVzIiwibmFtZSIsImlkcyIsInJvbGVOYW1lcyIsIl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyIsIkFycmF5IiwiY2xlYXJSb2xlQ2FjaGUiLCJkZWwiLCJnZXRSb2xlc0J5SWRzIiwiaW5zIiwiY29udGFpbmVkSW4iLCJyb2xlcyIsIiRpbiIsInJvbGVJRHMiLCJxdWVyaWVkUm9sZXMiLCJmaWx0ZXIiLCJyb2xlSUQiLCJ3YXNRdWVyaWVkIiwiU2V0IiwicmVzdWx0TWFwIiwibWVtbyIsImNvbmNhdCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsImF1dGhEYXRhIiwicHJvdmlkZXJzIiwia2V5cyIsInByb3ZpZGVyIiwicXVlcnlLZXkiLCJxIiwiZGF0YWJhc2UiLCIkb3IiLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJ1c2VyQXV0aERhdGEiLCJtdXRhdGVkQXV0aERhdGEiLCJmb3JFYWNoIiwicHJvdmlkZXJEYXRhIiwidXNlclByb3ZpZGVyQXV0aERhdGEiLCJjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luIiwic2F2ZWRVc2VyUHJvdmlkZXJzIiwiYWRhcHRlciIsImF1dGhEYXRhTWFuYWdlciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwiaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyIiwic29tZSIsInBvbGljeSIsImFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQiLCJoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIiLCJPVEhFUl9DQVVTRSIsImpvaW4iLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJyZXEiLCJmb3VuZFVzZXIiLCJVc2VyIiwiYXV0aCIsImdldFVzZXJJZCIsImZldGNoIiwib3JpZ2luYWxPYmplY3QiLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRQYXJzZU9iamVjdHMiLCJyZXF1ZXN0T2JqZWN0IiwiYWNjIiwiYXV0aERhdGFSZXNwb25zZSIsInNvcnQiLCJtZXRob2QiLCJ2YWxpZGF0b3IiLCJhdXRoUHJvdmlkZXIiLCJlbmFibGVkIiwiRGVwcmVjYXRvciIsImxvZ1J1bnRpbWVEZXByZWNhdGlvbiIsInVzYWdlIiwic29sdXRpb24iLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwidmFsaWRhdGlvblJlc3VsdCIsInRyaWdnZXJOYW1lIiwiZG9Ob3RTYXZlIiwic2F2ZSIsImVyciIsImUiLCJjb2RlIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VyU3RyaW5nIiwiZGF0YSIsImxvZ2dlciIsImVycm9yIiwiSlNPTiIsInN0cmluZ2lmeSIsImF1dGhlbnRpY2F0aW9uU3RlcCIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFKQSxNQUFNQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxZQUFELENBQXJCOztBQU1BO0FBQ0E7QUFDQTtBQUNBLFNBQVNDLElBQVQsQ0FBYztBQUNaQyxFQUFBQSxNQURZO0FBRVpDLEVBQUFBLGVBQWUsR0FBR0MsU0FGTjtBQUdaQyxFQUFBQSxRQUFRLEdBQUcsS0FIQztBQUlaQyxFQUFBQSxVQUFVLEdBQUcsS0FKRDtBQUtaQyxFQUFBQSxJQUxZO0FBTVpDLEVBQUFBO0FBTlksQ0FBZCxFQU9HO0FBQ0QsT0FBS04sTUFBTCxHQUFjQSxNQUFkO0FBQ0EsT0FBS0MsZUFBTCxHQUF1QkEsZUFBZSxJQUFLRCxNQUFNLElBQUlBLE1BQU0sQ0FBQ0MsZUFBNUQ7QUFDQSxPQUFLSyxjQUFMLEdBQXNCQSxjQUF0QjtBQUNBLE9BQUtILFFBQUwsR0FBZ0JBLFFBQWhCO0FBQ0EsT0FBS0UsSUFBTCxHQUFZQSxJQUFaO0FBQ0EsT0FBS0QsVUFBTCxHQUFrQkEsVUFBbEIsQ0FOQyxDQVFEO0FBQ0E7O0FBQ0EsT0FBS0csU0FBTCxHQUFpQixFQUFqQjtBQUNBLE9BQUtDLFlBQUwsR0FBb0IsS0FBcEI7QUFDQSxPQUFLQyxXQUFMLEdBQW1CLElBQW5CO0FBQ0QsQyxDQUVEO0FBQ0E7OztBQUNBVixJQUFJLENBQUNXLFNBQUwsQ0FBZUMsaUJBQWYsR0FBbUMsWUFBWTtBQUM3QyxNQUFJ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RyxDQUFDZ0MsSUFBSixDQUFTL0YsUUFBVCxJQUFxQnpELFNBRHRFOztBQUVBeUoscUJBQU9DLEtBQVAsQ0FDRyw0QkFBMkJyQixNQUFPLFFBQU9yQyxRQUFTLGFBQVl1RCxVQUFXLGVBQTFFLEdBQ0VJLElBQUksQ0FBQ0MsU0FBTCxDQUFlVCxDQUFmLENBRkosRUFHRTtBQUNFVSxRQUFBQSxrQkFBa0IsRUFBRXhCLE1BRHRCO0FBRUVxQixRQUFBQSxLQUFLLEVBQUVQLENBRlQ7QUFHRWhKLFFBQUFBLElBQUksRUFBRW9KLFVBSFI7QUFJRXZELFFBQUFBO0FBSkYsT0FIRjs7QUFVQSxZQUFNbUQsQ0FBTjtBQUNEO0FBQ0Y7O0FBQ0QsU0FBT2pCLEdBQVA7QUFDRCxDQTNGRDs7QUE2RkE0QixNQUFNLENBQUNDLE9BQVAsR0FBaUI7QUFDZmxLLEVBQUFBLElBRGU7QUFFZmEsRUFBQUEsTUFGZTtBQUdmRSxFQUFBQSxNQUhlO0FBSWZELEVBQUFBLFFBSmU7QUFLZkUsRUFBQUEsc0JBTGU7QUFNZmtDLEVBQUFBLDRCQU5lO0FBT2Y2QyxFQUFBQSxxQkFQZTtBQVFmUyxFQUFBQSxrQkFSZTtBQVNmTSxFQUFBQSxpREFUZTtBQVVmWSxFQUFBQTtBQVZlLENBQWpCIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgZ2V0UmVxdWVzdE9iamVjdCwgcmVzb2x2ZUVycm9yIH0gZnJvbSAnLi90cmlnZ2Vycyc7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5cbi8vIEFuIEF1dGggb2JqZWN0IHRlbGxzIHlvdSB3aG8gaXMgcmVxdWVzdGluZyBzb21ldGhpbmcgYW5kIHdoZXRoZXJcbi8vIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuLy8gdXNlck9iamVjdCBpcyBhIFBhcnNlLlVzZXIgYW5kIGNhbiBiZSBudWxsIGlmIHRoZXJlJ3Mgbm8gdXNlci5cbmZ1bmN0aW9uIEF1dGgoe1xuICBjb25maWcsXG4gIGNhY2hlQ29udHJvbGxlciA9IHVuZGVmaW5lZCxcbiAgaXNNYXN0ZXIgPSBmYWxzZSxcbiAgaXNSZWFkT25seSA9IGZhbHNlLFxuICB1c2VyLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIHRoaXMuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgdGhpcy5pc01hc3RlciA9IGlzTWFzdGVyO1xuICB0aGlzLnVzZXIgPSB1c2VyO1xuICB0aGlzLmlzUmVhZE9ubHkgPSBpc1JlYWRPbmx5O1xuXG4gIC8vIEFzc3VtaW5nIGEgdXNlcnMgcm9sZXMgd29uJ3QgY2hhbmdlIGR1cmluZyBhIHNpbmdsZSByZXF1ZXN0LCB3ZSdsbFxuICAvLyBvbmx5IGxvYWQgdGhlbSBvbmNlLlxuICB0aGlzLnVzZXJSb2xlcyA9IFtdO1xuICB0aGlzLmZldGNoZWRSb2xlcyA9IGZhbHNlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbn1cblxuLy8gV2hldGhlciB0aGlzIGF1dGggY291bGQgcG9zc2libHkgbW9kaWZ5IHRoZSBnaXZlbiB1c2VyIGlkLlxuLy8gSXQgc3RpbGwgY291bGQgYmUgZm9yYmlkZGVuIHZpYSBBQ0xzIGV2ZW4gaWYgdGhpcyByZXR1cm5zIHRydWUuXG5BdXRoLnByb3RvdHlwZS5pc1VuYXV0aGVudGljYXRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHRoaXMudXNlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbWFzdGVyKGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYXN0ZXItbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIHJlYWRPbmx5KGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlLCBpc1JlYWRPbmx5OiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBub2JvZHktbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG5vYm9keShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogZmFsc2UgfSk7XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gQXV0aCBvYmplY3RcbmNvbnN0IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoe1xuICBjb25maWcsXG4gIGNhY2hlQ29udHJvbGxlcixcbiAgc2Vzc2lvblRva2VuLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjb25zdCB1c2VySlNPTiA9IGF3YWl0IGNhY2hlQ29udHJvbGxlci51c2VyLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmICh1c2VySlNPTikge1xuICAgICAgY29uc3QgY2FjaGVkVXNlciA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTih1c2VySlNPTik7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFxuICAgICAgICBuZXcgQXV0aCh7XG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICAgICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgdXNlcjogY2FjaGVkVXNlcixcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgbGV0IHJlc3VsdHM7XG4gIGlmIChjb25maWcpIHtcbiAgICBjb25zdCByZXN0T3B0aW9ucyA9IHtcbiAgICAgIGxpbWl0OiAxLFxuICAgICAgaW5jbHVkZTogJ3VzZXInLFxuICAgIH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBjb25zdCBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoY29uZmlnLCBtYXN0ZXIoY29uZmlnKSwgJ19TZXNzaW9uJywgeyBzZXNzaW9uVG9rZW4gfSwgcmVzdE9wdGlvbnMpO1xuICAgIHJlc3VsdHMgPSAoYXdhaXQgcXVlcnkuZXhlY3V0ZSgpKS5yZXN1bHRzO1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdHMgPSAoXG4gICAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuU2Vzc2lvbilcbiAgICAgICAgLmxpbWl0KDEpXG4gICAgICAgIC5pbmNsdWRlKCd1c2VyJylcbiAgICAgICAgLmVxdWFsVG8oJ3Nlc3Npb25Ub2tlbicsIHNlc3Npb25Ub2tlbilcbiAgICAgICAgLmZpbmQoeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSlcbiAgICApLm1hcChvYmogPT4gb2JqLnRvSlNPTigpKTtcbiAgfVxuXG4gIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSB8fCAhcmVzdWx0c1swXVsndXNlciddKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICB9XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCksXG4gICAgZXhwaXJlc0F0ID0gcmVzdWx0c1swXS5leHBpcmVzQXQgPyBuZXcgRGF0ZShyZXN1bHRzWzBdLmV4cGlyZXNBdC5pc28pIDogdW5kZWZpbmVkO1xuICBpZiAoZXhwaXJlc0F0IDwgbm93KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gaXMgZXhwaXJlZC4nKTtcbiAgfVxuICBjb25zdCBvYmogPSByZXN1bHRzWzBdWyd1c2VyJ107XG4gIGRlbGV0ZSBvYmoucGFzc3dvcmQ7XG4gIG9ialsnY2xhc3NOYW1lJ10gPSAnX1VzZXInO1xuICBvYmpbJ3Nlc3Npb25Ub2tlbiddID0gc2Vzc2lvblRva2VuO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY2FjaGVDb250cm9sbGVyLnVzZXIucHV0KHNlc3Npb25Ub2tlbiwgb2JqKTtcbiAgfVxuICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gIHJldHVybiBuZXcgQXV0aCh7XG4gICAgY29uZmlnLFxuICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgdXNlcjogdXNlck9iamVjdCxcbiAgfSk7XG59O1xuXG52YXIgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiA9IGZ1bmN0aW9uICh7IGNvbmZpZywgc2Vzc2lvblRva2VuLCBpbnN0YWxsYXRpb25JZCB9KSB7XG4gIHZhciByZXN0T3B0aW9ucyA9IHtcbiAgICBsaW1pdDogMSxcbiAgfTtcbiAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgdmFyIHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShjb25maWcsIG1hc3Rlcihjb25maWcpLCAnX1VzZXInLCB7IHNlc3Npb25Ub2tlbiB9LCByZXN0T3B0aW9ucyk7XG4gIHJldHVybiBxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdmFyIHJlc3VsdHMgPSByZXNwb25zZS5yZXN1bHRzO1xuICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ2ludmFsaWQgbGVnYWN5IHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgb2JqID0gcmVzdWx0c1swXTtcbiAgICBvYmouY2xhc3NOYW1lID0gJ19Vc2VyJztcbiAgICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gICAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICAgIGNvbmZpZyxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgdXNlcjogdXNlck9iamVjdCxcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIHJvbGUgbmFtZXNcbkF1dGgucHJvdG90eXBlLmdldFVzZXJSb2xlcyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNNYXN0ZXIgfHwgIXRoaXMudXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG4gIGlmICh0aGlzLmZldGNoZWRSb2xlcykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy51c2VyUm9sZXMpO1xuICB9XG4gIGlmICh0aGlzLnJvbGVQcm9taXNlKSB7XG4gICAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG4gIH1cbiAgdGhpcy5yb2xlUHJvbWlzZSA9IHRoaXMuX2xvYWRSb2xlcygpO1xuICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzRm9yVXNlciA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy9TdGFjayBhbGwgUGFyc2UuUm9sZVxuICBjb25zdCByZXN1bHRzID0gW107XG4gIGlmICh0aGlzLmNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHtcbiAgICAgIHVzZXJzOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLnVzZXIuaWQsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBhd2FpdCBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBtYXN0ZXIodGhpcy5jb25maWcpLCAnX1JvbGUnLCByZXN0V2hlcmUsIHt9KS5lYWNoKHJlc3VsdCA9PlxuICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdClcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmVxdWFsVG8oJ3VzZXJzJywgdGhpcy51c2VyKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEl0ZXJhdGVzIHRocm91Z2ggdGhlIHJvbGUgdHJlZSBhbmQgY29tcGlsZXMgYSB1c2VyJ3Mgcm9sZXNcbkF1dGgucHJvdG90eXBlLl9sb2FkUm9sZXMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IGNhY2hlZFJvbGVzID0gYXdhaXQgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5nZXQodGhpcy51c2VyLmlkKTtcbiAgICBpZiAoY2FjaGVkUm9sZXMgIT0gbnVsbCkge1xuICAgICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgICAgdGhpcy51c2VyUm9sZXMgPSBjYWNoZWRSb2xlcztcbiAgICAgIHJldHVybiBjYWNoZWRSb2xlcztcbiAgICB9XG4gIH1cblxuICAvLyBGaXJzdCBnZXQgdGhlIHJvbGUgaWRzIHRoaXMgdXNlciBpcyBkaXJlY3RseSBhIG1lbWJlciBvZlxuICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRSb2xlc0ZvclVzZXIoKTtcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIHRoaXMudXNlclJvbGVzID0gW107XG4gICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xuXG4gICAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gICAgcmV0dXJuIHRoaXMudXNlclJvbGVzO1xuICB9XG5cbiAgY29uc3Qgcm9sZXNNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAobSwgcikgPT4ge1xuICAgICAgbS5uYW1lcy5wdXNoKHIubmFtZSk7XG4gICAgICBtLmlkcy5wdXNoKHIub2JqZWN0SWQpO1xuICAgICAgcmV0dXJuIG07XG4gICAgfSxcbiAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICk7XG5cbiAgLy8gcnVuIHRoZSByZWN1cnNpdmUgZmluZGluZ1xuICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyb2xlc01hcC5pZHMsIHJvbGVzTWFwLm5hbWVzKTtcbiAgdGhpcy51c2VyUm9sZXMgPSByb2xlTmFtZXMubWFwKHIgPT4ge1xuICAgIHJldHVybiAncm9sZTonICsgcjtcbiAgfSk7XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG4gIHRoaXMuY2FjaGVSb2xlcygpO1xuICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jYWNoZVJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUucHV0KHRoaXMudXNlci5pZCwgQXJyYXkoLi4udGhpcy51c2VyUm9sZXMpKTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jbGVhclJvbGVDYWNoZSA9IGZ1bmN0aW9uIChzZXNzaW9uVG9rZW4pIHtcbiAgaWYgKCF0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmRlbCh0aGlzLnVzZXIuaWQpO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlci51c2VyLmRlbChzZXNzaW9uVG9rZW4pO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzQnlJZHMgPSBhc3luYyBmdW5jdGlvbiAoaW5zKSB7XG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgLy8gQnVpbGQgYW4gT1IgcXVlcnkgYWNyb3NzIGFsbCBwYXJlbnRSb2xlc1xuICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuY29udGFpbmVkSW4oXG4gICAgICAgICdyb2xlcycsXG4gICAgICAgIGlucy5tYXAoaWQgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvbGUgPSBuZXcgUGFyc2UuT2JqZWN0KFBhcnNlLlJvbGUpO1xuICAgICAgICAgIHJvbGUuaWQgPSBpZDtcbiAgICAgICAgICByZXR1cm4gcm9sZTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0LnRvSlNPTigpKSwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgcm9sZXMgPSBpbnMubWFwKGlkID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgIH07XG4gICAgfSk7XG4gICAgY29uc3QgcmVzdFdoZXJlID0geyByb2xlczogeyAkaW46IHJvbGVzIH0gfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGF3YWl0IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIG1hc3Rlcih0aGlzLmNvbmZpZyksICdfUm9sZScsIHJlc3RXaGVyZSwge30pLmVhY2gocmVzdWx0ID0+XG4gICAgICByZXN1bHRzLnB1c2gocmVzdWx0KVxuICAgICk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59O1xuXG4vLyBHaXZlbiBhIGxpc3Qgb2Ygcm9sZUlkcywgZmluZCBhbGwgdGhlIHBhcmVudCByb2xlcywgcmV0dXJucyBhIHByb21pc2Ugd2l0aCBhbGwgbmFtZXNcbkF1dGgucHJvdG90eXBlLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyA9IGZ1bmN0aW9uIChyb2xlSURzLCBuYW1lcyA9IFtdLCBxdWVyaWVkUm9sZXMgPSB7fSkge1xuICBjb25zdCBpbnMgPSByb2xlSURzLmZpbHRlcihyb2xlSUQgPT4ge1xuICAgIGNvbnN0IHdhc1F1ZXJpZWQgPSBxdWVyaWVkUm9sZXNbcm9sZUlEXSAhPT0gdHJ1ZTtcbiAgICBxdWVyaWVkUm9sZXNbcm9sZUlEXSA9IHRydWU7XG4gICAgcmV0dXJuIHdhc1F1ZXJpZWQ7XG4gIH0pO1xuXG4gIC8vIGFsbCByb2xlcyBhcmUgYWNjb3VudGVkIGZvciwgcmV0dXJuIHRoZSBuYW1lc1xuICBpZiAoaW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLmdldFJvbGVzQnlJZHMoaW5zKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gTm90aGluZyBmb3VuZFxuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5hbWVzKTtcbiAgICAgIH1cbiAgICAgIC8vIE1hcCB0aGUgcmVzdWx0cyB3aXRoIGFsbCBJZHMgYW5kIG5hbWVzXG4gICAgICBjb25zdCByZXN1bHRNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAgICAgKG1lbW8sIHJvbGUpID0+IHtcbiAgICAgICAgICBtZW1vLm5hbWVzLnB1c2gocm9sZS5uYW1lKTtcbiAgICAgICAgICBtZW1vLmlkcy5wdXNoKHJvbGUub2JqZWN0SWQpO1xuICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICB9LFxuICAgICAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICAgICApO1xuICAgICAgLy8gc3RvcmUgdGhlIG5ldyBmb3VuZCBuYW1lc1xuICAgICAgbmFtZXMgPSBuYW1lcy5jb25jYXQocmVzdWx0TWFwLm5hbWVzKTtcbiAgICAgIC8vIGZpbmQgdGhlIG5leHQgb25lcywgY2lyY3VsYXIgcm9sZXMgd2lsbCBiZSBjdXRcbiAgICAgIHJldHVybiB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyZXN1bHRNYXAuaWRzLCBuYW1lcywgcXVlcmllZFJvbGVzKTtcbiAgICB9KVxuICAgIC50aGVuKG5hbWVzID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoWy4uLm5ldyBTZXQobmFtZXMpXSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBmaW5kVXNlcnNXaXRoQXV0aERhdGEgPSAoY29uZmlnLCBhdXRoRGF0YSkgPT4ge1xuICBjb25zdCBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGNvbnN0IHF1ZXJ5ID0gcHJvdmlkZXJzXG4gICAgLnJlZHVjZSgobWVtbywgcHJvdmlkZXIpID0+IHtcbiAgICAgIGlmICghYXV0aERhdGFbcHJvdmlkZXJdIHx8IChhdXRoRGF0YSAmJiAhYXV0aERhdGFbcHJvdmlkZXJdLmlkKSkge1xuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHF1ZXJ5S2V5ID0gYGF1dGhEYXRhLiR7cHJvdmlkZXJ9LmlkYDtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0ge307XG4gICAgICBxdWVyeVtxdWVyeUtleV0gPSBhdXRoRGF0YVtwcm92aWRlcl0uaWQ7XG4gICAgICBtZW1vLnB1c2gocXVlcnkpO1xuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfSwgW10pXG4gICAgLmZpbHRlcihxID0+IHtcbiAgICAgIHJldHVybiB0eXBlb2YgcSAhPT0gJ3VuZGVmaW5lZCc7XG4gICAgfSk7XG5cbiAgcmV0dXJuIHF1ZXJ5Lmxlbmd0aCA+IDBcbiAgICA/IGNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgJG9yOiBxdWVyeSB9LCB7IGxpbWl0OiAyIH0pXG4gICAgOiBQcm9taXNlLnJlc29sdmUoW10pO1xufTtcblxuY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gKGF1dGhEYXRhLCB1c2VyQXV0aERhdGEpID0+IHtcbiAgaWYgKCF1c2VyQXV0aERhdGEpIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YTogdHJ1ZSwgbXV0YXRlZEF1dGhEYXRhOiBhdXRoRGF0YSB9O1xuICBjb25zdCBtdXRhdGVkQXV0aERhdGEgPSB7fTtcbiAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgIC8vIEFub255bW91cyBwcm92aWRlciBpcyBub3QgaGFuZGxlZCB0aGlzIHdheVxuICAgIGlmIChwcm92aWRlciA9PT0gJ2Fub255bW91cycpIHJldHVybjtcbiAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgY29uc3QgdXNlclByb3ZpZGVyQXV0aERhdGEgPSB1c2VyQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGlmICghaXNEZWVwU3RyaWN0RXF1YWwocHJvdmlkZXJEYXRhLCB1c2VyUHJvdmlkZXJBdXRoRGF0YSkpIHtcbiAgICAgIG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl0gPSBwcm92aWRlckRhdGE7XG4gICAgfVxuICB9KTtcbiAgY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5sZW5ndGggIT09IDA7XG4gIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YSwgbXV0YXRlZEF1dGhEYXRhIH07XG59O1xuXG5jb25zdCBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luID0gKFxuICBhdXRoRGF0YSA9IHt9LFxuICB1c2VyQXV0aERhdGEgPSB7fSxcbiAgY29uZmlnXG4pID0+IHtcbiAgY29uc3Qgc2F2ZWRVc2VyUHJvdmlkZXJzID0gT2JqZWN0LmtleXModXNlckF1dGhEYXRhKS5tYXAocHJvdmlkZXIgPT4gKHtcbiAgICBuYW1lOiBwcm92aWRlcixcbiAgICBhZGFwdGVyOiBjb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKS5hZGFwdGVyLFxuICB9KSk7XG5cbiAgY29uc3QgaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUoXG4gICAgcHJvdmlkZXIgPT5cbiAgICAgIHByb3ZpZGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIgJiYgcHJvdmlkZXIuYWRhcHRlci5wb2xpY3kgPT09ICdzb2xvJyAmJiBhdXRoRGF0YVtwcm92aWRlci5uYW1lXVxuICApO1xuXG4gIC8vIFNvbG8gcHJvdmlkZXJzIGNhbiBiZSBjb25zaWRlcmVkIGFzIHNhZmUsIHNvIHdlIGRvIG5vdCBoYXZlIHRvIGNoZWNrIGlmIHRoZSB1c2VyIG5lZWRzXG4gIC8vIHRvIHByb3ZpZGUgYW4gYWRkaXRpb25hbCBwcm92aWRlciB0byBsb2dpbi4gQW4gYXV0aCBhZGFwdGVyIHdpdGggXCJzb2xvXCIgKGxpa2Ugd2ViYXV0aG4pIG1lYW5zXG4gIC8vIG5vIFwiYWRkaXRpb25hbFwiIGF1dGggbmVlZHMgdG8gYmUgcHJvdmlkZWQgdG8gbG9naW4gKGxpa2UgT1RQLCBNRkEpXG4gIGlmIChoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kID0gW107XG4gIGNvbnN0IGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciA9IHNhdmVkVXNlclByb3ZpZGVycy5zb21lKHByb3ZpZGVyID0+IHtcbiAgICBpZiAocHJvdmlkZXIgJiYgcHJvdmlkZXIuYWRhcHRlciAmJiBwcm92aWRlci5hZGFwdGVyLnBvbGljeSA9PT0gJ2FkZGl0aW9uYWwnKSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXIubmFtZV0pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQdXNoIG1pc3NpbmcgcHJvdmlkZXIgZm9yIGVycm9yIG1lc3NhZ2VcbiAgICAgICAgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5wdXNoKHByb3ZpZGVyLm5hbWUpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIGlmIChoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgfHwgIWFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQubGVuZ3RoKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgIGBNaXNzaW5nIGFkZGl0aW9uYWwgYXV0aERhdGEgJHthZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLmpvaW4oJywnKX1gXG4gICk7XG59O1xuXG4vLyBWYWxpZGF0ZSBlYWNoIGF1dGhEYXRhIHN0ZXAtYnktc3RlcCBhbmQgcmV0dXJuIHRoZSBwcm92aWRlciByZXNwb25zZXNcbmNvbnN0IGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiA9IGFzeW5jIChhdXRoRGF0YSwgcmVxLCBmb3VuZFVzZXIpID0+IHtcbiAgbGV0IHVzZXI7XG4gIGlmIChmb3VuZFVzZXIpIHtcbiAgICB1c2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4uZm91bmRVc2VyIH0pO1xuICAgIC8vIEZpbmQgdXNlciBieSBzZXNzaW9uIGFuZCBjdXJyZW50IG9iamVjdElkOyBvbmx5IHBhc3MgdXNlciBpZiBpdCdzIHRoZSBjdXJyZW50IHVzZXIgb3IgbWFzdGVyIGtleSBpcyBwcm92aWRlZFxuICB9IGVsc2UgaWYgKFxuICAgIChyZXEuYXV0aCAmJlxuICAgICAgcmVxLmF1dGgudXNlciAmJlxuICAgICAgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgIHJlcS5nZXRVc2VySWQoKSA9PT0gcmVxLmF1dGgudXNlci5pZCkgfHxcbiAgICAocmVxLmF1dGggJiYgcmVxLmF1dGguaXNNYXN0ZXIgJiYgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiYgcmVxLmdldFVzZXJJZCgpKVxuICApIHtcbiAgICB1c2VyID0gbmV3IFBhcnNlLlVzZXIoKTtcbiAgICB1c2VyLmlkID0gcmVxLmF1dGguaXNNYXN0ZXIgPyByZXEuZ2V0VXNlcklkKCkgOiByZXEuYXV0aC51c2VyLmlkO1xuICAgIGF3YWl0IHVzZXIuZmV0Y2goeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSByZXEuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgY29uc3QgcmVxdWVzdE9iamVjdCA9IGdldFJlcXVlc3RPYmplY3QoXG4gICAgdW5kZWZpbmVkLFxuICAgIHJlcS5hdXRoLFxuICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgb3JpZ2luYWxPYmplY3QgfHwgdXNlcixcbiAgICByZXEuY29uZmlnXG4gICk7XG4gIC8vIFBlcmZvcm0gdmFsaWRhdGlvbiBhcyBzdGVwLWJ5LXN0ZXAgcGlwZWxpbmUgZm9yIGJldHRlciBlcnJvciBjb25zaXN0ZW5jeVxuICAvLyBhbmQgYWxzbyB0byBhdm9pZCB0byB0cmlnZ2VyIGEgcHJvdmlkZXIgKGxpa2UgT1RQIFNNUykgaWYgYW5vdGhlciBvbmUgZmFpbHNcbiAgY29uc3QgYWNjID0geyBhdXRoRGF0YToge30sIGF1dGhEYXRhUmVzcG9uc2U6IHt9IH07XG4gIGZvciAoY29uc3QgcHJvdmlkZXIgb2YgT2JqZWN0LmtleXMoYXV0aERhdGEpLnNvcnQoKSkge1xuICAgIGxldCBtZXRob2QgPSAnJztcbiAgICB0cnkge1xuICAgICAgaWYgKGF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICBjb25zdCBhdXRoUHJvdmlkZXIgPSAocmVxLmNvbmZpZy5hdXRoIHx8IHt9KVtwcm92aWRlcl0gfHwge307XG4gICAgICBpZiAoYXV0aFByb3ZpZGVyLmVuYWJsZWQgPT0gbnVsbCkge1xuICAgICAgICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgICAgICAgdXNhZ2U6IGBhdXRoLiR7cHJvdmlkZXJ9YCxcbiAgICAgICAgICBzb2x1dGlvbjogYGF1dGguJHtwcm92aWRlcn0uZW5hYmxlZDogdHJ1ZWAsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgaWYgKCF2YWxpZGF0b3IgfHwgYXV0aFByb3ZpZGVyLmVuYWJsZWQgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBsZXQgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRvcihhdXRoRGF0YVtwcm92aWRlcl0sIHJlcSwgdXNlciwgcmVxdWVzdE9iamVjdCk7XG4gICAgICBtZXRob2QgPSB2YWxpZGF0aW9uUmVzdWx0ICYmIHZhbGlkYXRpb25SZXN1bHQubWV0aG9kO1xuICAgICAgcmVxdWVzdE9iamVjdC50cmlnZ2VyTmFtZSA9IG1ldGhvZDtcbiAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0ICYmIHZhbGlkYXRpb25SZXN1bHQudmFsaWRhdG9yKSB7XG4gICAgICAgIHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0aW9uUmVzdWx0LnZhbGlkYXRvcigpO1xuICAgICAgfVxuICAgICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0KSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKCFPYmplY3Qua2V5cyh2YWxpZGF0aW9uUmVzdWx0KS5sZW5ndGgpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cblxuICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQucmVzcG9uc2UpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhUmVzcG9uc2VbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZTtcbiAgICAgIH1cbiAgICAgIC8vIFNvbWUgYXV0aCBwcm92aWRlcnMgYWZ0ZXIgaW5pdGlhbGl6YXRpb24gd2lsbCBhdm9pZCB0byByZXBsYWNlIGF1dGhEYXRhIGFscmVhZHkgc3RvcmVkXG4gICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQuZG9Ob3RTYXZlKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnNhdmUgfHwgYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgbWVzc2FnZTogJ0F1dGggZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHVzZXJTdHJpbmcgPVxuICAgICAgICByZXEuYXV0aCAmJiByZXEuYXV0aC51c2VyID8gcmVxLmF1dGgudXNlci5pZCA6IHJlcS5kYXRhLm9iamVjdElkIHx8IHVuZGVmaW5lZDtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGF1dGggc3RlcCAke21ldGhvZH0gZm9yICR7cHJvdmlkZXJ9IGZvciB1c2VyICR7dXNlclN0cmluZ30gd2l0aCBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZSksXG4gICAgICAgIHtcbiAgICAgICAgICBhdXRoZW50aWNhdGlvblN0ZXA6IG1ldGhvZCxcbiAgICAgICAgICBlcnJvcjogZSxcbiAgICAgICAgICB1c2VyOiB1c2VyU3RyaW5nLFxuICAgICAgICAgIHByb3ZpZGVyLFxuICAgICAgICB9XG4gICAgICApO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFjYztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBBdXRoLFxuICBtYXN0ZXIsXG4gIG5vYm9keSxcbiAgcmVhZE9ubHksXG4gIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4sXG4gIGdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4sXG4gIGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSxcbiAgaGFzTXV0YXRlZEF1dGhEYXRhLFxuICBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luLFxuICBoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24sXG59O1xuIl19