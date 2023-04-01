"use strict";

var _util = require("util");
var _triggers = require("./triggers");
var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));
var _logger = require("./logger");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const Parse = require('parse/node');
// An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.
function Auth({
  config,
  cacheController = undefined,
  isMaster = false,
  isMaintenance = false,
  isReadOnly = false,
  user,
  installationId
}) {
  this.config = config;
  this.cacheController = cacheController || config && config.cacheController;
  this.installationId = installationId;
  this.isMaster = isMaster;
  this.isMaintenance = isMaintenance;
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
  if (this.isMaintenance) {
    return false;
  }
  if (this.user) {
    return false;
  }
  return true;
};

// A helper to get a master-level Auth object
function master(config) {
  return new Auth({
    config,
    isMaster: true
  });
}

// A helper to get a maintenance-level Auth object
function maintenance(config) {
  return new Auth({
    config,
    isMaintenance: true
  });
}

// A helper to get a master-level Auth object
function readOnly(config) {
  return new Auth({
    config,
    isMaster: true,
    isReadOnly: true
  });
}

// A helper to get a nobody-level Auth object
function nobody(config) {
  return new Auth({
    config,
    isMaster: false
  });
}

// Returns a promise that resolves to an Auth object
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
};

// Returns a promise that resolves to an array of role names
Auth.prototype.getUserRoles = function () {
  if (this.isMaster || this.isMaintenance || !this.user) {
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
  const rolesMap = results.reduce((m, r) => {
    m.names.push(r.name);
    m.ids.push(r.objectId);
    return m;
  }, {
    ids: [],
    names: []
  });

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
Auth.prototype.clearRoleCache = function (sessionToken) {
  if (!this.cacheController) {
    return false;
  }
  this.cacheController.role.del(this.user.id);
  this.cacheController.user.del(sessionToken);
  return true;
};
Auth.prototype.getRolesByIds = async function (ins) {
  const results = [];
  // Build an OR query across all parentRoles
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
  return this.getRolesByIds(ins).then(results => {
    // Nothing found
    if (!results.length) {
      return Promise.resolve(names);
    }
    // Map the results with all Ids and names
    const resultMap = results.reduce((memo, role) => {
      memo.names.push(role.name);
      memo.ids.push(role.objectId);
      return memo;
    }, {
      ids: [],
      names: []
    });
    // store the new found names
    names = names.concat(resultMap.names);
    // find the next ones, circular roles will be cut
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
  const hasProvidedASoloProvider = savedUserProviders.some(provider => provider && provider.adapter && provider.adapter.policy === 'solo' && authData[provider.name]);

  // Solo providers can be considered as safe, so we do not have to check if the user needs
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
};

// Validate each authData step-by-step and return the provider responses
const handleAuthDataValidation = async (authData, req, foundUser) => {
  let user;
  if (foundUser) {
    user = Parse.User.fromJSON(_objectSpread({
      className: '_User'
    }, foundUser));
    // Find user by session and current objectId; only pass user if it's the current user or master key is provided
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
  const requestObject = (0, _triggers.getRequestObject)(undefined, req.auth, updatedObject, originalObject || user, req.config);
  // Perform validation as step-by-step pipeline for better error consistency
  // and also to avoid to trigger a provider (like OTP SMS) if another one fails
  const acc = {
    authData: {},
    authDataResponse: {}
  };
  const authKeys = Object.keys(authData).sort();
  for (const provider of authKeys) {
    let method = '';
    try {
      if (authData[provider] === null) {
        acc.authData[provider] = null;
        continue;
      }
      const {
        validator
      } = req.config.authDataManager.getValidatorForProvider(provider);
      const authProvider = (req.config.auth || {})[provider] || {};
      if (authProvider.enabled == null) {
        _Deprecator.default.logRuntimeDeprecation({
          usage: `Using the authentication adapter "${provider}" without explicitly enabling it`,
          solution: `Enable the authentication adapter by setting the Parse Server option "auth.${provider}.enabled: true".`
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
        continue;
      }
      if (validationResult.response) {
        acc.authDataResponse[provider] = validationResult.response;
      }
      // Some auth providers after initialization will avoid to replace authData already stored
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
  maintenance,
  nobody,
  readOnly,
  getAuthForSessionToken,
  getAuthForLegacySessionToken,
  findUsersWithAuthData,
  hasMutatedAuthData,
  checkIfUserHasProvidedConfiguredProvidersForLogin,
  handleAuthDataValidation
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJBdXRoIiwiY29uZmlnIiwiY2FjaGVDb250cm9sbGVyIiwidW5kZWZpbmVkIiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwiaXNSZWFkT25seSIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsInVzZXJSb2xlcyIsImZldGNoZWRSb2xlcyIsInJvbGVQcm9taXNlIiwicHJvdG90eXBlIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJtYXN0ZXIiLCJtYWludGVuYW5jZSIsInJlYWRPbmx5Iiwibm9ib2R5IiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsInNlc3Npb25Ub2tlbiIsInVzZXJKU09OIiwiZ2V0IiwiY2FjaGVkVXNlciIsIk9iamVjdCIsImZyb21KU09OIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZXN1bHRzIiwicmVzdE9wdGlvbnMiLCJsaW1pdCIsImluY2x1ZGUiLCJSZXN0UXVlcnkiLCJxdWVyeSIsImV4ZWN1dGUiLCJRdWVyeSIsIlNlc3Npb24iLCJlcXVhbFRvIiwiZmluZCIsInVzZU1hc3RlcktleSIsIm1hcCIsIm9iaiIsInRvSlNPTiIsImxlbmd0aCIsIkVycm9yIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwibm93IiwiRGF0ZSIsImV4cGlyZXNBdCIsImlzbyIsInBhc3N3b3JkIiwicHV0IiwidXNlck9iamVjdCIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJ0aGVuIiwicmVzcG9uc2UiLCJjbGFzc05hbWUiLCJnZXRVc2VyUm9sZXMiLCJfbG9hZFJvbGVzIiwiZ2V0Um9sZXNGb3JVc2VyIiwicmVzdFdoZXJlIiwidXNlcnMiLCJfX3R5cGUiLCJvYmplY3RJZCIsImlkIiwiZWFjaCIsInJlc3VsdCIsInB1c2giLCJSb2xlIiwiY2FjaGVkUm9sZXMiLCJyb2xlIiwiY2FjaGVSb2xlcyIsInJvbGVzTWFwIiwicmVkdWNlIiwibSIsInIiLCJuYW1lcyIsIm5hbWUiLCJpZHMiLCJyb2xlTmFtZXMiLCJfZ2V0QWxsUm9sZXNOYW1lc0ZvclJvbGVJZHMiLCJBcnJheSIsImNsZWFyUm9sZUNhY2hlIiwiZGVsIiwiZ2V0Um9sZXNCeUlkcyIsImlucyIsImNvbnRhaW5lZEluIiwicm9sZXMiLCIkaW4iLCJyb2xlSURzIiwicXVlcmllZFJvbGVzIiwiZmlsdGVyIiwicm9sZUlEIiwid2FzUXVlcmllZCIsIlNldCIsInJlc3VsdE1hcCIsIm1lbW8iLCJjb25jYXQiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJhdXRoRGF0YSIsInByb3ZpZGVycyIsImtleXMiLCJwcm92aWRlciIsInF1ZXJ5S2V5IiwicSIsImRhdGFiYXNlIiwiJG9yIiwiaGFzTXV0YXRlZEF1dGhEYXRhIiwidXNlckF1dGhEYXRhIiwibXV0YXRlZEF1dGhEYXRhIiwiZm9yRWFjaCIsInByb3ZpZGVyRGF0YSIsInVzZXJQcm92aWRlckF1dGhEYXRhIiwiaXNEZWVwU3RyaWN0RXF1YWwiLCJjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luIiwic2F2ZWRVc2VyUHJvdmlkZXJzIiwiYWRhcHRlciIsImF1dGhEYXRhTWFuYWdlciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwiaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyIiwic29tZSIsInBvbGljeSIsImFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQiLCJoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIiLCJPVEhFUl9DQVVTRSIsImpvaW4iLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJyZXEiLCJmb3VuZFVzZXIiLCJVc2VyIiwiYXV0aCIsImdldFVzZXJJZCIsImZldGNoIiwib3JpZ2luYWxPYmplY3QiLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRQYXJzZU9iamVjdHMiLCJyZXF1ZXN0T2JqZWN0IiwiZ2V0UmVxdWVzdE9iamVjdCIsImFjYyIsImF1dGhEYXRhUmVzcG9uc2UiLCJhdXRoS2V5cyIsInNvcnQiLCJtZXRob2QiLCJ2YWxpZGF0b3IiLCJhdXRoUHJvdmlkZXIiLCJlbmFibGVkIiwiRGVwcmVjYXRvciIsImxvZ1J1bnRpbWVEZXByZWNhdGlvbiIsInVzYWdlIiwic29sdXRpb24iLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwidmFsaWRhdGlvblJlc3VsdCIsInRyaWdnZXJOYW1lIiwiZG9Ob3RTYXZlIiwic2F2ZSIsImVyciIsImUiLCJyZXNvbHZlRXJyb3IiLCJjb2RlIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VyU3RyaW5nIiwiZGF0YSIsImxvZ2dlciIsImVycm9yIiwiSlNPTiIsInN0cmluZ2lmeSIsImF1dGhlbnRpY2F0aW9uU3RlcCIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi9zcmMvQXV0aC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbmltcG9ydCB7IGlzRGVlcFN0cmljdEVxdWFsIH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyBnZXRSZXF1ZXN0T2JqZWN0LCByZXNvbHZlRXJyb3IgfSBmcm9tICcuL3RyaWdnZXJzJztcbmltcG9ydCBEZXByZWNhdG9yIGZyb20gJy4vRGVwcmVjYXRvci9EZXByZWNhdG9yJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4vbG9nZ2VyJztcblxuLy8gQW4gQXV0aCBvYmplY3QgdGVsbHMgeW91IHdobyBpcyByZXF1ZXN0aW5nIHNvbWV0aGluZyBhbmQgd2hldGhlclxuLy8gdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4vLyB1c2VyT2JqZWN0IGlzIGEgUGFyc2UuVXNlciBhbmQgY2FuIGJlIG51bGwgaWYgdGhlcmUncyBubyB1c2VyLlxuZnVuY3Rpb24gQXV0aCh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyID0gdW5kZWZpbmVkLFxuICBpc01hc3RlciA9IGZhbHNlLFxuICBpc01haW50ZW5hbmNlID0gZmFsc2UsXG4gIGlzUmVhZE9ubHkgPSBmYWxzZSxcbiAgdXNlcixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICB0aGlzLmluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQ7XG4gIHRoaXMuaXNNYXN0ZXIgPSBpc01hc3RlcjtcbiAgdGhpcy5pc01haW50ZW5hbmNlID0gaXNNYWludGVuYW5jZTtcbiAgdGhpcy51c2VyID0gdXNlcjtcbiAgdGhpcy5pc1JlYWRPbmx5ID0gaXNSZWFkT25seTtcblxuICAvLyBBc3N1bWluZyBhIHVzZXJzIHJvbGVzIHdvbid0IGNoYW5nZSBkdXJpbmcgYSBzaW5nbGUgcmVxdWVzdCwgd2UnbGxcbiAgLy8gb25seSBsb2FkIHRoZW0gb25jZS5cbiAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSBmYWxzZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG59XG5cbi8vIFdoZXRoZXIgdGhpcyBhdXRoIGNvdWxkIHBvc3NpYmx5IG1vZGlmeSB0aGUgZ2l2ZW4gdXNlciBpZC5cbi8vIEl0IHN0aWxsIGNvdWxkIGJlIGZvcmJpZGRlbiB2aWEgQUNMcyBldmVuIGlmIHRoaXMgcmV0dXJucyB0cnVlLlxuQXV0aC5wcm90b3R5cGUuaXNVbmF1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh0aGlzLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHRoaXMudXNlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbWFzdGVyKGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYWludGVuYW5jZS1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbWFpbnRlbmFuY2UoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYWludGVuYW5jZTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiByZWFkT25seShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSwgaXNSZWFkT25seTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbm9ib2R5LWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBub2JvZHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IGZhbHNlIH0pO1xufVxuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIEF1dGggb2JqZWN0XG5jb25zdCBnZXRBdXRoRm9yU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIsXG4gIHNlc3Npb25Ub2tlbixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIGNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgdXNlckpTT04gPSBhd2FpdCBjYWNoZUNvbnRyb2xsZXIudXNlci5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAodXNlckpTT04pIHtcbiAgICAgIGNvbnN0IGNhY2hlZFVzZXIgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04odXNlckpTT04pO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgbmV3IEF1dGgoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgICAgIHVzZXI6IGNhY2hlZFVzZXIsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGxldCByZXN1bHRzO1xuICBpZiAoY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdE9wdGlvbnMgPSB7XG4gICAgICBsaW1pdDogMSxcbiAgICAgIGluY2x1ZGU6ICd1c2VyJyxcbiAgICB9O1xuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgY29uc3QgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KGNvbmZpZywgbWFzdGVyKGNvbmZpZyksICdfU2Vzc2lvbicsIHsgc2Vzc2lvblRva2VuIH0sIHJlc3RPcHRpb25zKTtcbiAgICByZXN1bHRzID0gKGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKSkucmVzdWx0cztcbiAgfSBlbHNlIHtcbiAgICByZXN1bHRzID0gKFxuICAgICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlNlc3Npb24pXG4gICAgICAgIC5saW1pdCgxKVxuICAgICAgICAuaW5jbHVkZSgndXNlcicpXG4gICAgICAgIC5lcXVhbFRvKCdzZXNzaW9uVG9rZW4nLCBzZXNzaW9uVG9rZW4pXG4gICAgICAgIC5maW5kKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pXG4gICAgKS5tYXAob2JqID0+IG9iai50b0pTT04oKSk7XG4gIH1cblxuICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEgfHwgIXJlc3VsdHNbMF1bJ3VzZXInXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgfVxuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLFxuICAgIGV4cGlyZXNBdCA9IHJlc3VsdHNbMF0uZXhwaXJlc0F0ID8gbmV3IERhdGUocmVzdWx0c1swXS5leHBpcmVzQXQuaXNvKSA6IHVuZGVmaW5lZDtcbiAgaWYgKGV4cGlyZXNBdCA8IG5vdykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdTZXNzaW9uIHRva2VuIGlzIGV4cGlyZWQuJyk7XG4gIH1cbiAgY29uc3Qgb2JqID0gcmVzdWx0c1swXVsndXNlciddO1xuICBkZWxldGUgb2JqLnBhc3N3b3JkO1xuICBvYmpbJ2NsYXNzTmFtZSddID0gJ19Vc2VyJztcbiAgb2JqWydzZXNzaW9uVG9rZW4nXSA9IHNlc3Npb25Ub2tlbjtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNhY2hlQ29udHJvbGxlci51c2VyLnB1dChzZXNzaW9uVG9rZW4sIG9iaik7XG4gIH1cbiAgY29uc3QgdXNlck9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmopO1xuICByZXR1cm4gbmV3IEF1dGgoe1xuICAgIGNvbmZpZyxcbiAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgIGluc3RhbGxhdGlvbklkLFxuICAgIHVzZXI6IHVzZXJPYmplY3QsXG4gIH0pO1xufTtcblxudmFyIGdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4gPSBmdW5jdGlvbiAoeyBjb25maWcsIHNlc3Npb25Ub2tlbiwgaW5zdGFsbGF0aW9uSWQgfSkge1xuICB2YXIgcmVzdE9wdGlvbnMgPSB7XG4gICAgbGltaXQ6IDEsXG4gIH07XG4gIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gIHZhciBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoY29uZmlnLCBtYXN0ZXIoY29uZmlnKSwgJ19Vc2VyJywgeyBzZXNzaW9uVG9rZW4gfSwgcmVzdE9wdGlvbnMpO1xuICByZXR1cm4gcXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHZhciByZXN1bHRzID0gcmVzcG9uc2UucmVzdWx0cztcbiAgICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdpbnZhbGlkIGxlZ2FjeSBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IG9iaiA9IHJlc3VsdHNbMF07XG4gICAgb2JqLmNsYXNzTmFtZSA9ICdfVXNlcic7XG4gICAgY29uc3QgdXNlck9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmopO1xuICAgIHJldHVybiBuZXcgQXV0aCh7XG4gICAgICBjb25maWcsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHVzZXI6IHVzZXJPYmplY3QsXG4gICAgfSk7XG4gIH0pO1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiByb2xlIG5hbWVzXG5BdXRoLnByb3RvdHlwZS5nZXRVc2VyUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyIHx8IHRoaXMuaXNNYWludGVuYW5jZSB8fCAhdGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG4gIH1cbiAgaWYgKHRoaXMuZmV0Y2hlZFJvbGVzKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLnVzZXJSb2xlcyk7XG4gIH1cbiAgaWYgKHRoaXMucm9sZVByb21pc2UpIHtcbiAgICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbiAgfVxuICB0aGlzLnJvbGVQcm9taXNlID0gdGhpcy5fbG9hZFJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnJvbGVQcm9taXNlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuZ2V0Um9sZXNGb3JVc2VyID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvL1N0YWNrIGFsbCBQYXJzZS5Sb2xlXG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgaWYgKHRoaXMuY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdFdoZXJlID0ge1xuICAgICAgdXNlcnM6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMudXNlci5pZCxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGF3YWl0IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIG1hc3Rlcih0aGlzLmNvbmZpZyksICdfUm9sZScsIHJlc3RXaGVyZSwge30pLmVhY2gocmVzdWx0ID0+XG4gICAgICByZXN1bHRzLnB1c2gocmVzdWx0KVxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuZXF1YWxUbygndXNlcnMnLCB0aGlzLnVzZXIpXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufTtcblxuLy8gSXRlcmF0ZXMgdGhyb3VnaCB0aGUgcm9sZSB0cmVlIGFuZCBjb21waWxlcyBhIHVzZXIncyByb2xlc1xuQXV0aC5wcm90b3R5cGUuX2xvYWRSb2xlcyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgY2FjaGVkUm9sZXMgPSBhd2FpdCB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmdldCh0aGlzLnVzZXIuaWQpO1xuICAgIGlmIChjYWNoZWRSb2xlcyAhPSBudWxsKSB7XG4gICAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgICB0aGlzLnVzZXJSb2xlcyA9IGNhY2hlZFJvbGVzO1xuICAgICAgcmV0dXJuIGNhY2hlZFJvbGVzO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpcnN0IGdldCB0aGUgcm9sZSBpZHMgdGhpcyB1c2VyIGlzIGRpcmVjdGx5IGEgbWVtYmVyIG9mXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmdldFJvbGVzRm9yVXNlcigpO1xuICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG5cbiAgICB0aGlzLmNhY2hlUm9sZXMoKTtcbiAgICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG4gIH1cblxuICBjb25zdCByb2xlc01hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgIChtLCByKSA9PiB7XG4gICAgICBtLm5hbWVzLnB1c2goci5uYW1lKTtcbiAgICAgIG0uaWRzLnB1c2goci5vYmplY3RJZCk7XG4gICAgICByZXR1cm4gbTtcbiAgICB9LFxuICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgKTtcblxuICAvLyBydW4gdGhlIHJlY3Vyc2l2ZSBmaW5kaW5nXG4gIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJvbGVzTWFwLmlkcywgcm9sZXNNYXAubmFtZXMpO1xuICB0aGlzLnVzZXJSb2xlcyA9IHJvbGVOYW1lcy5tYXAociA9PiB7XG4gICAgcmV0dXJuICdyb2xlOicgKyByO1xuICB9KTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbiAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnVzZXJSb2xlcztcbn07XG5cbkF1dGgucHJvdG90eXBlLmNhY2hlUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jYWNoZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5wdXQodGhpcy51c2VyLmlkLCBBcnJheSguLi50aGlzLnVzZXJSb2xlcykpO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmNsZWFyUm9sZUNhY2hlID0gZnVuY3Rpb24gKHNlc3Npb25Ub2tlbikge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUuZGVsKHRoaXMudXNlci5pZCk7XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb25Ub2tlbik7XG4gIHJldHVybiB0cnVlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuZ2V0Um9sZXNCeUlkcyA9IGFzeW5jIGZ1bmN0aW9uIChpbnMpIHtcbiAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICAvLyBCdWlsZCBhbiBPUiBxdWVyeSBhY3Jvc3MgYWxsIHBhcmVudFJvbGVzXG4gIGlmICghdGhpcy5jb25maWcpIHtcbiAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSlcbiAgICAgIC5jb250YWluZWRJbihcbiAgICAgICAgJ3JvbGVzJyxcbiAgICAgICAgaW5zLm1hcChpZCA9PiB7XG4gICAgICAgICAgY29uc3Qgcm9sZSA9IG5ldyBQYXJzZS5PYmplY3QoUGFyc2UuUm9sZSk7XG4gICAgICAgICAgcm9sZS5pZCA9IGlkO1xuICAgICAgICAgIHJldHVybiByb2xlO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCByb2xlcyA9IGlucy5tYXAoaWQgPT4ge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Sb2xlJyxcbiAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgfTtcbiAgICB9KTtcbiAgICBjb25zdCByZXN0V2hlcmUgPSB7IHJvbGVzOiB7ICRpbjogcm9sZXMgfSB9O1xuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgYXdhaXQgbmV3IFJlc3RRdWVyeSh0aGlzLmNvbmZpZywgbWFzdGVyKHRoaXMuY29uZmlnKSwgJ19Sb2xlJywgcmVzdFdoZXJlLCB7fSkuZWFjaChyZXN1bHQgPT5cbiAgICAgIHJlc3VsdHMucHVzaChyZXN1bHQpXG4gICAgKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEdpdmVuIGEgbGlzdCBvZiByb2xlSWRzLCBmaW5kIGFsbCB0aGUgcGFyZW50IHJvbGVzLCByZXR1cm5zIGEgcHJvbWlzZSB3aXRoIGFsbCBuYW1lc1xuQXV0aC5wcm90b3R5cGUuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzID0gZnVuY3Rpb24gKHJvbGVJRHMsIG5hbWVzID0gW10sIHF1ZXJpZWRSb2xlcyA9IHt9KSB7XG4gIGNvbnN0IGlucyA9IHJvbGVJRHMuZmlsdGVyKHJvbGVJRCA9PiB7XG4gICAgY29uc3Qgd2FzUXVlcmllZCA9IHF1ZXJpZWRSb2xlc1tyb2xlSURdICE9PSB0cnVlO1xuICAgIHF1ZXJpZWRSb2xlc1tyb2xlSURdID0gdHJ1ZTtcbiAgICByZXR1cm4gd2FzUXVlcmllZDtcbiAgfSk7XG5cbiAgLy8gYWxsIHJvbGVzIGFyZSBhY2NvdW50ZWQgZm9yLCByZXR1cm4gdGhlIG5hbWVzXG4gIGlmIChpbnMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFsuLi5uZXcgU2V0KG5hbWVzKV0pO1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuZ2V0Um9sZXNCeUlkcyhpbnMpXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAvLyBOb3RoaW5nIGZvdW5kXG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmFtZXMpO1xuICAgICAgfVxuICAgICAgLy8gTWFwIHRoZSByZXN1bHRzIHdpdGggYWxsIElkcyBhbmQgbmFtZXNcbiAgICAgIGNvbnN0IHJlc3VsdE1hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgICAgICAobWVtbywgcm9sZSkgPT4ge1xuICAgICAgICAgIG1lbW8ubmFtZXMucHVzaChyb2xlLm5hbWUpO1xuICAgICAgICAgIG1lbW8uaWRzLnB1c2gocm9sZS5vYmplY3RJZCk7XG4gICAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICAgIH0sXG4gICAgICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgICAgICk7XG4gICAgICAvLyBzdG9yZSB0aGUgbmV3IGZvdW5kIG5hbWVzXG4gICAgICBuYW1lcyA9IG5hbWVzLmNvbmNhdChyZXN1bHRNYXAubmFtZXMpO1xuICAgICAgLy8gZmluZCB0aGUgbmV4dCBvbmVzLCBjaXJjdWxhciByb2xlcyB3aWxsIGJlIGN1dFxuICAgICAgcmV0dXJuIHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJlc3VsdE1hcC5pZHMsIG5hbWVzLCBxdWVyaWVkUm9sZXMpO1xuICAgIH0pXG4gICAgLnRoZW4obmFtZXMgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSA9IChjb25maWcsIGF1dGhEYXRhKSA9PiB7XG4gIGNvbnN0IHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgY29uc3QgcXVlcnkgPSBwcm92aWRlcnNcbiAgICAucmVkdWNlKChtZW1vLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKCFhdXRoRGF0YVtwcm92aWRlcl0gfHwgKGF1dGhEYXRhICYmICFhdXRoRGF0YVtwcm92aWRlcl0uaWQpKSB7XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfVxuICAgICAgY29uc3QgcXVlcnlLZXkgPSBgYXV0aERhdGEuJHtwcm92aWRlcn0uaWRgO1xuICAgICAgY29uc3QgcXVlcnkgPSB7fTtcbiAgICAgIHF1ZXJ5W3F1ZXJ5S2V5XSA9IGF1dGhEYXRhW3Byb3ZpZGVyXS5pZDtcbiAgICAgIG1lbW8ucHVzaChxdWVyeSk7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9LCBbXSlcbiAgICAuZmlsdGVyKHEgPT4ge1xuICAgICAgcmV0dXJuIHR5cGVvZiBxICE9PSAndW5kZWZpbmVkJztcbiAgICB9KTtcblxuICByZXR1cm4gcXVlcnkubGVuZ3RoID4gMFxuICAgID8gY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyAkb3I6IHF1ZXJ5IH0sIHsgbGltaXQ6IDIgfSlcbiAgICA6IFByb21pc2UucmVzb2x2ZShbXSk7XG59O1xuXG5jb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSAoYXV0aERhdGEsIHVzZXJBdXRoRGF0YSkgPT4ge1xuICBpZiAoIXVzZXJBdXRoRGF0YSkgcmV0dXJuIHsgaGFzTXV0YXRlZEF1dGhEYXRhOiB0cnVlLCBtdXRhdGVkQXV0aERhdGE6IGF1dGhEYXRhIH07XG4gIGNvbnN0IG11dGF0ZWRBdXRoRGF0YSA9IHt9O1xuICBPYmplY3Qua2V5cyhhdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgLy8gQW5vbnltb3VzIHByb3ZpZGVyIGlzIG5vdCBoYW5kbGVkIHRoaXMgd2F5XG4gICAgaWYgKHByb3ZpZGVyID09PSAnYW5vbnltb3VzJykgcmV0dXJuO1xuICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICBjb25zdCB1c2VyUHJvdmlkZXJBdXRoRGF0YSA9IHVzZXJBdXRoRGF0YVtwcm92aWRlcl07XG4gICAgaWYgKCFpc0RlZXBTdHJpY3RFcXVhbChwcm92aWRlckRhdGEsIHVzZXJQcm92aWRlckF1dGhEYXRhKSkge1xuICAgICAgbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXSA9IHByb3ZpZGVyRGF0YTtcbiAgICB9XG4gIH0pO1xuICBjb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmxlbmd0aCAhPT0gMDtcbiAgcmV0dXJuIHsgaGFzTXV0YXRlZEF1dGhEYXRhLCBtdXRhdGVkQXV0aERhdGEgfTtcbn07XG5cbmNvbnN0IGNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4gPSAoXG4gIGF1dGhEYXRhID0ge30sXG4gIHVzZXJBdXRoRGF0YSA9IHt9LFxuICBjb25maWdcbikgPT4ge1xuICBjb25zdCBzYXZlZFVzZXJQcm92aWRlcnMgPSBPYmplY3Qua2V5cyh1c2VyQXV0aERhdGEpLm1hcChwcm92aWRlciA9PiAoe1xuICAgIG5hbWU6IHByb3ZpZGVyLFxuICAgIGFkYXB0ZXI6IGNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpLmFkYXB0ZXIsXG4gIH0pKTtcblxuICBjb25zdCBoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShcbiAgICBwcm92aWRlciA9PlxuICAgICAgcHJvdmlkZXIgJiYgcHJvdmlkZXIuYWRhcHRlciAmJiBwcm92aWRlci5hZGFwdGVyLnBvbGljeSA9PT0gJ3NvbG8nICYmIGF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdXG4gICk7XG5cbiAgLy8gU29sbyBwcm92aWRlcnMgY2FuIGJlIGNvbnNpZGVyZWQgYXMgc2FmZSwgc28gd2UgZG8gbm90IGhhdmUgdG8gY2hlY2sgaWYgdGhlIHVzZXIgbmVlZHNcbiAgLy8gdG8gcHJvdmlkZSBhbiBhZGRpdGlvbmFsIHByb3ZpZGVyIHRvIGxvZ2luLiBBbiBhdXRoIGFkYXB0ZXIgd2l0aCBcInNvbG9cIiAobGlrZSB3ZWJhdXRobikgbWVhbnNcbiAgLy8gbm8gXCJhZGRpdGlvbmFsXCIgYXV0aCBuZWVkcyB0byBiZSBwcm92aWRlZCB0byBsb2dpbiAobGlrZSBPVFAsIE1GQSlcbiAgaWYgKGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlcikge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQgPSBbXTtcbiAgY29uc3QgaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgIGlmIChwcm92aWRlciAmJiBwcm92aWRlci5hZGFwdGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIucG9saWN5ID09PSAnYWRkaXRpb25hbCcpIHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlci5uYW1lXSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFB1c2ggbWlzc2luZyBwcm92aWRlciBmb3IgZXJyb3IgbWVzc2FnZVxuICAgICAgICBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLnB1c2gocHJvdmlkZXIubmFtZSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgaWYgKGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciB8fCAhYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5sZW5ndGgpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgYE1pc3NpbmcgYWRkaXRpb25hbCBhdXRoRGF0YSAke2FkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQuam9pbignLCcpfWBcbiAgKTtcbn07XG5cbi8vIFZhbGlkYXRlIGVhY2ggYXV0aERhdGEgc3RlcC1ieS1zdGVwIGFuZCByZXR1cm4gdGhlIHByb3ZpZGVyIHJlc3BvbnNlc1xuY29uc3QgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uID0gYXN5bmMgKGF1dGhEYXRhLCByZXEsIGZvdW5kVXNlcikgPT4ge1xuICBsZXQgdXNlcjtcbiAgaWYgKGZvdW5kVXNlcikge1xuICAgIHVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5mb3VuZFVzZXIgfSk7XG4gICAgLy8gRmluZCB1c2VyIGJ5IHNlc3Npb24gYW5kIGN1cnJlbnQgb2JqZWN0SWQ7IG9ubHkgcGFzcyB1c2VyIGlmIGl0J3MgdGhlIGN1cnJlbnQgdXNlciBvciBtYXN0ZXIga2V5IGlzIHByb3ZpZGVkXG4gIH0gZWxzZSBpZiAoXG4gICAgKHJlcS5hdXRoICYmXG4gICAgICByZXEuYXV0aC51c2VyICYmXG4gICAgICB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgcmVxLmdldFVzZXJJZCgpID09PSByZXEuYXV0aC51c2VyLmlkKSB8fFxuICAgIChyZXEuYXV0aCAmJiByZXEuYXV0aC5pc01hc3RlciAmJiB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJiByZXEuZ2V0VXNlcklkKCkpXG4gICkge1xuICAgIHVzZXIgPSBuZXcgUGFyc2UuVXNlcigpO1xuICAgIHVzZXIuaWQgPSByZXEuYXV0aC5pc01hc3RlciA/IHJlcS5nZXRVc2VySWQoKSA6IHJlcS5hdXRoLnVzZXIuaWQ7XG4gICAgYXdhaXQgdXNlci5mZXRjaCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHJlcS5idWlsZFBhcnNlT2JqZWN0cygpO1xuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdE9iamVjdChcbiAgICB1bmRlZmluZWQsXG4gICAgcmVxLmF1dGgsXG4gICAgdXBkYXRlZE9iamVjdCxcbiAgICBvcmlnaW5hbE9iamVjdCB8fCB1c2VyLFxuICAgIHJlcS5jb25maWdcbiAgKTtcbiAgLy8gUGVyZm9ybSB2YWxpZGF0aW9uIGFzIHN0ZXAtYnktc3RlcCBwaXBlbGluZSBmb3IgYmV0dGVyIGVycm9yIGNvbnNpc3RlbmN5XG4gIC8vIGFuZCBhbHNvIHRvIGF2b2lkIHRvIHRyaWdnZXIgYSBwcm92aWRlciAobGlrZSBPVFAgU01TKSBpZiBhbm90aGVyIG9uZSBmYWlsc1xuICBjb25zdCBhY2MgPSB7IGF1dGhEYXRhOiB7fSwgYXV0aERhdGFSZXNwb25zZToge30gfTtcbiAgY29uc3QgYXV0aEtleXMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuc29ydCgpO1xuICBmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGF1dGhLZXlzKSB7XG4gICAgbGV0IG1ldGhvZCA9ICcnO1xuICAgIHRyeSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBudWxsO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICBjb25zdCBhdXRoUHJvdmlkZXIgPSAocmVxLmNvbmZpZy5hdXRoIHx8IHt9KVtwcm92aWRlcl0gfHwge307XG4gICAgICBpZiAoYXV0aFByb3ZpZGVyLmVuYWJsZWQgPT0gbnVsbCkge1xuICAgICAgICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgICAgICAgdXNhZ2U6IGBVc2luZyB0aGUgYXV0aGVudGljYXRpb24gYWRhcHRlciBcIiR7cHJvdmlkZXJ9XCIgd2l0aG91dCBleHBsaWNpdGx5IGVuYWJsaW5nIGl0YCxcbiAgICAgICAgICBzb2x1dGlvbjogYEVuYWJsZSB0aGUgYXV0aGVudGljYXRpb24gYWRhcHRlciBieSBzZXR0aW5nIHRoZSBQYXJzZSBTZXJ2ZXIgb3B0aW9uIFwiYXV0aC4ke3Byb3ZpZGVyfS5lbmFibGVkOiB0cnVlXCIuYCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAoIXZhbGlkYXRvciB8fCBhdXRoUHJvdmlkZXIuZW5hYmxlZCA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGxldCB2YWxpZGF0aW9uUmVzdWx0ID0gYXdhaXQgdmFsaWRhdG9yKGF1dGhEYXRhW3Byb3ZpZGVyXSwgcmVxLCB1c2VyLCByZXF1ZXN0T2JqZWN0KTtcbiAgICAgIG1ldGhvZCA9IHZhbGlkYXRpb25SZXN1bHQgJiYgdmFsaWRhdGlvblJlc3VsdC5tZXRob2Q7XG4gICAgICByZXF1ZXN0T2JqZWN0LnRyaWdnZXJOYW1lID0gbWV0aG9kO1xuICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQgJiYgdmFsaWRhdGlvblJlc3VsdC52YWxpZGF0b3IpIHtcbiAgICAgICAgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRpb25SZXN1bHQudmFsaWRhdG9yKCk7XG4gICAgICB9XG4gICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoIU9iamVjdC5rZXlzKHZhbGlkYXRpb25SZXN1bHQpLmxlbmd0aCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQucmVzcG9uc2UpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhUmVzcG9uc2VbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZTtcbiAgICAgIH1cbiAgICAgIC8vIFNvbWUgYXV0aCBwcm92aWRlcnMgYWZ0ZXIgaW5pdGlhbGl6YXRpb24gd2lsbCBhdm9pZCB0byByZXBsYWNlIGF1dGhEYXRhIGFscmVhZHkgc3RvcmVkXG4gICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQuZG9Ob3RTYXZlKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnNhdmUgfHwgYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgbWVzc2FnZTogJ0F1dGggZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHVzZXJTdHJpbmcgPVxuICAgICAgICByZXEuYXV0aCAmJiByZXEuYXV0aC51c2VyID8gcmVxLmF1dGgudXNlci5pZCA6IHJlcS5kYXRhLm9iamVjdElkIHx8IHVuZGVmaW5lZDtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGF1dGggc3RlcCAke21ldGhvZH0gZm9yICR7cHJvdmlkZXJ9IGZvciB1c2VyICR7dXNlclN0cmluZ30gd2l0aCBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZSksXG4gICAgICAgIHtcbiAgICAgICAgICBhdXRoZW50aWNhdGlvblN0ZXA6IG1ldGhvZCxcbiAgICAgICAgICBlcnJvcjogZSxcbiAgICAgICAgICB1c2VyOiB1c2VyU3RyaW5nLFxuICAgICAgICAgIHByb3ZpZGVyLFxuICAgICAgICB9XG4gICAgICApO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFjYztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBBdXRoLFxuICBtYXN0ZXIsXG4gIG1haW50ZW5hbmNlLFxuICBub2JvZHksXG4gIHJlYWRPbmx5LFxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLFxuICBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuLFxuICBmaW5kVXNlcnNXaXRoQXV0aERhdGEsXG4gIGhhc011dGF0ZWRBdXRoRGF0YSxcbiAgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbixcbiAgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFrQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFKbEMsTUFBTUEsS0FBSyxHQUFHQyxPQUFPLENBQUMsWUFBWSxDQUFDO0FBTW5DO0FBQ0E7QUFDQTtBQUNBLFNBQVNDLElBQUksQ0FBQztFQUNaQyxNQUFNO0VBQ05DLGVBQWUsR0FBR0MsU0FBUztFQUMzQkMsUUFBUSxHQUFHLEtBQUs7RUFDaEJDLGFBQWEsR0FBRyxLQUFLO0VBQ3JCQyxVQUFVLEdBQUcsS0FBSztFQUNsQkMsSUFBSTtFQUNKQztBQUNGLENBQUMsRUFBRTtFQUNELElBQUksQ0FBQ1AsTUFBTSxHQUFHQSxNQUFNO0VBQ3BCLElBQUksQ0FBQ0MsZUFBZSxHQUFHQSxlQUFlLElBQUtELE1BQU0sSUFBSUEsTUFBTSxDQUFDQyxlQUFnQjtFQUM1RSxJQUFJLENBQUNNLGNBQWMsR0FBR0EsY0FBYztFQUNwQyxJQUFJLENBQUNKLFFBQVEsR0FBR0EsUUFBUTtFQUN4QixJQUFJLENBQUNDLGFBQWEsR0FBR0EsYUFBYTtFQUNsQyxJQUFJLENBQUNFLElBQUksR0FBR0EsSUFBSTtFQUNoQixJQUFJLENBQUNELFVBQVUsR0FBR0EsVUFBVTs7RUFFNUI7RUFDQTtFQUNBLElBQUksQ0FBQ0csU0FBUyxHQUFHLEVBQUU7RUFDbkIsSUFBSSxDQUFDQyxZQUFZLEdBQUcsS0FBSztFQUN6QixJQUFJLENBQUNDLFdBQVcsR0FBRyxJQUFJO0FBQ3pCOztBQUVBO0FBQ0E7QUFDQVgsSUFBSSxDQUFDWSxTQUFTLENBQUNDLGlCQUFpQixHQUFHLFlBQVk7RUFDN0MsSUFBSSxJQUFJLENBQUNULFFBQVEsRUFBRTtJQUNqQixPQUFPLEtBQUs7RUFDZDtFQUNBLElBQUksSUFBSSxDQUFDQyxhQUFhLEVBQUU7SUFDdEIsT0FBTyxLQUFLO0VBQ2Q7RUFDQSxJQUFJLElBQUksQ0FBQ0UsSUFBSSxFQUFFO0lBQ2IsT0FBTyxLQUFLO0VBQ2Q7RUFDQSxPQUFPLElBQUk7QUFDYixDQUFDOztBQUVEO0FBQ0EsU0FBU08sTUFBTSxDQUFDYixNQUFNLEVBQUU7RUFDdEIsT0FBTyxJQUFJRCxJQUFJLENBQUM7SUFBRUMsTUFBTTtJQUFFRyxRQUFRLEVBQUU7RUFBSyxDQUFDLENBQUM7QUFDN0M7O0FBRUE7QUFDQSxTQUFTVyxXQUFXLENBQUNkLE1BQU0sRUFBRTtFQUMzQixPQUFPLElBQUlELElBQUksQ0FBQztJQUFFQyxNQUFNO0lBQUVJLGFBQWEsRUFBRTtFQUFLLENBQUMsQ0FBQztBQUNsRDs7QUFFQTtBQUNBLFNBQVNXLFFBQVEsQ0FBQ2YsTUFBTSxFQUFFO0VBQ3hCLE9BQU8sSUFBSUQsSUFBSSxDQUFDO0lBQUVDLE1BQU07SUFBRUcsUUFBUSxFQUFFLElBQUk7SUFBRUUsVUFBVSxFQUFFO0VBQUssQ0FBQyxDQUFDO0FBQy9EOztBQUVBO0FBQ0EsU0FBU1csTUFBTSxDQUFDaEIsTUFBTSxFQUFFO0VBQ3RCLE9BQU8sSUFBSUQsSUFBSSxDQUFDO0lBQUVDLE1BQU07SUFBRUcsUUFBUSxFQUFFO0VBQU0sQ0FBQyxDQUFDO0FBQzlDOztBQUVBO0FBQ0EsTUFBTWMsc0JBQXNCLEdBQUcsZ0JBQWdCO0VBQzdDakIsTUFBTTtFQUNOQyxlQUFlO0VBQ2ZpQixZQUFZO0VBQ1pYO0FBQ0YsQ0FBQyxFQUFFO0VBQ0ROLGVBQWUsR0FBR0EsZUFBZSxJQUFLRCxNQUFNLElBQUlBLE1BQU0sQ0FBQ0MsZUFBZ0I7RUFDdkUsSUFBSUEsZUFBZSxFQUFFO0lBQ25CLE1BQU1rQixRQUFRLEdBQUcsTUFBTWxCLGVBQWUsQ0FBQ0ssSUFBSSxDQUFDYyxHQUFHLENBQUNGLFlBQVksQ0FBQztJQUM3RCxJQUFJQyxRQUFRLEVBQUU7TUFDWixNQUFNRSxVQUFVLEdBQUd4QixLQUFLLENBQUN5QixNQUFNLENBQUNDLFFBQVEsQ0FBQ0osUUFBUSxDQUFDO01BQ2xELE9BQU9LLE9BQU8sQ0FBQ0MsT0FBTyxDQUNwQixJQUFJMUIsSUFBSSxDQUFDO1FBQ1BDLE1BQU07UUFDTkMsZUFBZTtRQUNmRSxRQUFRLEVBQUUsS0FBSztRQUNmSSxjQUFjO1FBQ2RELElBQUksRUFBRWU7TUFDUixDQUFDLENBQUMsQ0FDSDtJQUNIO0VBQ0Y7RUFFQSxJQUFJSyxPQUFPO0VBQ1gsSUFBSTFCLE1BQU0sRUFBRTtJQUNWLE1BQU0yQixXQUFXLEdBQUc7TUFDbEJDLEtBQUssRUFBRSxDQUFDO01BQ1JDLE9BQU8sRUFBRTtJQUNYLENBQUM7SUFDRCxNQUFNQyxTQUFTLEdBQUdoQyxPQUFPLENBQUMsYUFBYSxDQUFDO0lBQ3hDLE1BQU1pQyxLQUFLLEdBQUcsSUFBSUQsU0FBUyxDQUFDOUIsTUFBTSxFQUFFYSxNQUFNLENBQUNiLE1BQU0sQ0FBQyxFQUFFLFVBQVUsRUFBRTtNQUFFa0I7SUFBYSxDQUFDLEVBQUVTLFdBQVcsQ0FBQztJQUM5RkQsT0FBTyxHQUFHLENBQUMsTUFBTUssS0FBSyxDQUFDQyxPQUFPLEVBQUUsRUFBRU4sT0FBTztFQUMzQyxDQUFDLE1BQU07SUFDTEEsT0FBTyxHQUFHLENBQ1IsTUFBTSxJQUFJN0IsS0FBSyxDQUFDb0MsS0FBSyxDQUFDcEMsS0FBSyxDQUFDcUMsT0FBTyxDQUFDLENBQ2pDTixLQUFLLENBQUMsQ0FBQyxDQUFDLENBQ1JDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FDZk0sT0FBTyxDQUFDLGNBQWMsRUFBRWpCLFlBQVksQ0FBQyxDQUNyQ2tCLElBQUksQ0FBQztNQUFFQyxZQUFZLEVBQUU7SUFBSyxDQUFDLENBQUMsRUFDL0JDLEdBQUcsQ0FBQ0MsR0FBRyxJQUFJQSxHQUFHLENBQUNDLE1BQU0sRUFBRSxDQUFDO0VBQzVCO0VBRUEsSUFBSWQsT0FBTyxDQUFDZSxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUNmLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRTtJQUMvQyxNQUFNLElBQUk3QixLQUFLLENBQUM2QyxLQUFLLENBQUM3QyxLQUFLLENBQUM2QyxLQUFLLENBQUNDLHFCQUFxQixFQUFFLHVCQUF1QixDQUFDO0VBQ25GO0VBQ0EsTUFBTUMsR0FBRyxHQUFHLElBQUlDLElBQUksRUFBRTtJQUNwQkMsU0FBUyxHQUFHcEIsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDb0IsU0FBUyxHQUFHLElBQUlELElBQUksQ0FBQ25CLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQ29CLFNBQVMsQ0FBQ0MsR0FBRyxDQUFDLEdBQUc3QyxTQUFTO0VBQ25GLElBQUk0QyxTQUFTLEdBQUdGLEdBQUcsRUFBRTtJQUNuQixNQUFNLElBQUkvQyxLQUFLLENBQUM2QyxLQUFLLENBQUM3QyxLQUFLLENBQUM2QyxLQUFLLENBQUNDLHFCQUFxQixFQUFFLDJCQUEyQixDQUFDO0VBQ3ZGO0VBQ0EsTUFBTUosR0FBRyxHQUFHYixPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0VBQzlCLE9BQU9hLEdBQUcsQ0FBQ1MsUUFBUTtFQUNuQlQsR0FBRyxDQUFDLFdBQVcsQ0FBQyxHQUFHLE9BQU87RUFDMUJBLEdBQUcsQ0FBQyxjQUFjLENBQUMsR0FBR3JCLFlBQVk7RUFDbEMsSUFBSWpCLGVBQWUsRUFBRTtJQUNuQkEsZUFBZSxDQUFDSyxJQUFJLENBQUMyQyxHQUFHLENBQUMvQixZQUFZLEVBQUVxQixHQUFHLENBQUM7RUFDN0M7RUFDQSxNQUFNVyxVQUFVLEdBQUdyRCxLQUFLLENBQUN5QixNQUFNLENBQUNDLFFBQVEsQ0FBQ2dCLEdBQUcsQ0FBQztFQUM3QyxPQUFPLElBQUl4QyxJQUFJLENBQUM7SUFDZEMsTUFBTTtJQUNOQyxlQUFlO0lBQ2ZFLFFBQVEsRUFBRSxLQUFLO0lBQ2ZJLGNBQWM7SUFDZEQsSUFBSSxFQUFFNEM7RUFDUixDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsSUFBSUMsNEJBQTRCLEdBQUcsVUFBVTtFQUFFbkQsTUFBTTtFQUFFa0IsWUFBWTtFQUFFWDtBQUFlLENBQUMsRUFBRTtFQUNyRixJQUFJb0IsV0FBVyxHQUFHO0lBQ2hCQyxLQUFLLEVBQUU7RUFDVCxDQUFDO0VBQ0QsTUFBTUUsU0FBUyxHQUFHaEMsT0FBTyxDQUFDLGFBQWEsQ0FBQztFQUN4QyxJQUFJaUMsS0FBSyxHQUFHLElBQUlELFNBQVMsQ0FBQzlCLE1BQU0sRUFBRWEsTUFBTSxDQUFDYixNQUFNLENBQUMsRUFBRSxPQUFPLEVBQUU7SUFBRWtCO0VBQWEsQ0FBQyxFQUFFUyxXQUFXLENBQUM7RUFDekYsT0FBT0ksS0FBSyxDQUFDQyxPQUFPLEVBQUUsQ0FBQ29CLElBQUksQ0FBQ0MsUUFBUSxJQUFJO0lBQ3RDLElBQUkzQixPQUFPLEdBQUcyQixRQUFRLENBQUMzQixPQUFPO0lBQzlCLElBQUlBLE9BQU8sQ0FBQ2UsTUFBTSxLQUFLLENBQUMsRUFBRTtNQUN4QixNQUFNLElBQUk1QyxLQUFLLENBQUM2QyxLQUFLLENBQUM3QyxLQUFLLENBQUM2QyxLQUFLLENBQUNDLHFCQUFxQixFQUFFLDhCQUE4QixDQUFDO0lBQzFGO0lBQ0EsTUFBTUosR0FBRyxHQUFHYixPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ3RCYSxHQUFHLENBQUNlLFNBQVMsR0FBRyxPQUFPO0lBQ3ZCLE1BQU1KLFVBQVUsR0FBR3JELEtBQUssQ0FBQ3lCLE1BQU0sQ0FBQ0MsUUFBUSxDQUFDZ0IsR0FBRyxDQUFDO0lBQzdDLE9BQU8sSUFBSXhDLElBQUksQ0FBQztNQUNkQyxNQUFNO01BQ05HLFFBQVEsRUFBRSxLQUFLO01BQ2ZJLGNBQWM7TUFDZEQsSUFBSSxFQUFFNEM7SUFDUixDQUFDLENBQUM7RUFDSixDQUFDLENBQUM7QUFDSixDQUFDOztBQUVEO0FBQ0FuRCxJQUFJLENBQUNZLFNBQVMsQ0FBQzRDLFlBQVksR0FBRyxZQUFZO0VBQ3hDLElBQUksSUFBSSxDQUFDcEQsUUFBUSxJQUFJLElBQUksQ0FBQ0MsYUFBYSxJQUFJLENBQUMsSUFBSSxDQUFDRSxJQUFJLEVBQUU7SUFDckQsT0FBT2tCLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLEVBQUUsQ0FBQztFQUM1QjtFQUNBLElBQUksSUFBSSxDQUFDaEIsWUFBWSxFQUFFO0lBQ3JCLE9BQU9lLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLElBQUksQ0FBQ2pCLFNBQVMsQ0FBQztFQUN4QztFQUNBLElBQUksSUFBSSxDQUFDRSxXQUFXLEVBQUU7SUFDcEIsT0FBTyxJQUFJLENBQUNBLFdBQVc7RUFDekI7RUFDQSxJQUFJLENBQUNBLFdBQVcsR0FBRyxJQUFJLENBQUM4QyxVQUFVLEVBQUU7RUFDcEMsT0FBTyxJQUFJLENBQUM5QyxXQUFXO0FBQ3pCLENBQUM7QUFFRFgsSUFBSSxDQUFDWSxTQUFTLENBQUM4QyxlQUFlLEdBQUcsa0JBQWtCO0VBQ2pEO0VBQ0EsTUFBTS9CLE9BQU8sR0FBRyxFQUFFO0VBQ2xCLElBQUksSUFBSSxDQUFDMUIsTUFBTSxFQUFFO0lBQ2YsTUFBTTBELFNBQVMsR0FBRztNQUNoQkMsS0FBSyxFQUFFO1FBQ0xDLE1BQU0sRUFBRSxTQUFTO1FBQ2pCTixTQUFTLEVBQUUsT0FBTztRQUNsQk8sUUFBUSxFQUFFLElBQUksQ0FBQ3ZELElBQUksQ0FBQ3dEO01BQ3RCO0lBQ0YsQ0FBQztJQUNELE1BQU1oQyxTQUFTLEdBQUdoQyxPQUFPLENBQUMsYUFBYSxDQUFDO0lBQ3hDLE1BQU0sSUFBSWdDLFNBQVMsQ0FBQyxJQUFJLENBQUM5QixNQUFNLEVBQUVhLE1BQU0sQ0FBQyxJQUFJLENBQUNiLE1BQU0sQ0FBQyxFQUFFLE9BQU8sRUFBRTBELFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDSyxJQUFJLENBQUNDLE1BQU0sSUFDdkZ0QyxPQUFPLENBQUN1QyxJQUFJLENBQUNELE1BQU0sQ0FBQyxDQUNyQjtFQUNILENBQUMsTUFBTTtJQUNMLE1BQU0sSUFBSW5FLEtBQUssQ0FBQ29DLEtBQUssQ0FBQ3BDLEtBQUssQ0FBQ3FFLElBQUksQ0FBQyxDQUM5Qi9CLE9BQU8sQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDN0IsSUFBSSxDQUFDLENBQzNCeUQsSUFBSSxDQUFDQyxNQUFNLElBQUl0QyxPQUFPLENBQUN1QyxJQUFJLENBQUNELE1BQU0sQ0FBQ3hCLE1BQU0sRUFBRSxDQUFDLEVBQUU7TUFBRUgsWUFBWSxFQUFFO0lBQUssQ0FBQyxDQUFDO0VBQzFFO0VBQ0EsT0FBT1gsT0FBTztBQUNoQixDQUFDOztBQUVEO0FBQ0EzQixJQUFJLENBQUNZLFNBQVMsQ0FBQzZDLFVBQVUsR0FBRyxrQkFBa0I7RUFDNUMsSUFBSSxJQUFJLENBQUN2RCxlQUFlLEVBQUU7SUFDeEIsTUFBTWtFLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQ2xFLGVBQWUsQ0FBQ21FLElBQUksQ0FBQ2hELEdBQUcsQ0FBQyxJQUFJLENBQUNkLElBQUksQ0FBQ3dELEVBQUUsQ0FBQztJQUNyRSxJQUFJSyxXQUFXLElBQUksSUFBSSxFQUFFO01BQ3ZCLElBQUksQ0FBQzFELFlBQVksR0FBRyxJQUFJO01BQ3hCLElBQUksQ0FBQ0QsU0FBUyxHQUFHMkQsV0FBVztNQUM1QixPQUFPQSxXQUFXO0lBQ3BCO0VBQ0Y7O0VBRUE7RUFDQSxNQUFNekMsT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDK0IsZUFBZSxFQUFFO0VBQzVDLElBQUksQ0FBQy9CLE9BQU8sQ0FBQ2UsTUFBTSxFQUFFO0lBQ25CLElBQUksQ0FBQ2pDLFNBQVMsR0FBRyxFQUFFO0lBQ25CLElBQUksQ0FBQ0MsWUFBWSxHQUFHLElBQUk7SUFDeEIsSUFBSSxDQUFDQyxXQUFXLEdBQUcsSUFBSTtJQUV2QixJQUFJLENBQUMyRCxVQUFVLEVBQUU7SUFDakIsT0FBTyxJQUFJLENBQUM3RCxTQUFTO0VBQ3ZCO0VBRUEsTUFBTThELFFBQVEsR0FBRzVDLE9BQU8sQ0FBQzZDLE1BQU0sQ0FDN0IsQ0FBQ0MsQ0FBQyxFQUFFQyxDQUFDLEtBQUs7SUFDUkQsQ0FBQyxDQUFDRSxLQUFLLENBQUNULElBQUksQ0FBQ1EsQ0FBQyxDQUFDRSxJQUFJLENBQUM7SUFDcEJILENBQUMsQ0FBQ0ksR0FBRyxDQUFDWCxJQUFJLENBQUNRLENBQUMsQ0FBQ1osUUFBUSxDQUFDO0lBQ3RCLE9BQU9XLENBQUM7RUFDVixDQUFDLEVBQ0Q7SUFBRUksR0FBRyxFQUFFLEVBQUU7SUFBRUYsS0FBSyxFQUFFO0VBQUcsQ0FBQyxDQUN2Qjs7RUFFRDtFQUNBLE1BQU1HLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQ0MsMkJBQTJCLENBQUNSLFFBQVEsQ0FBQ00sR0FBRyxFQUFFTixRQUFRLENBQUNJLEtBQUssQ0FBQztFQUN0RixJQUFJLENBQUNsRSxTQUFTLEdBQUdxRSxTQUFTLENBQUN2QyxHQUFHLENBQUNtQyxDQUFDLElBQUk7SUFDbEMsT0FBTyxPQUFPLEdBQUdBLENBQUM7RUFDcEIsQ0FBQyxDQUFDO0VBQ0YsSUFBSSxDQUFDaEUsWUFBWSxHQUFHLElBQUk7RUFDeEIsSUFBSSxDQUFDQyxXQUFXLEdBQUcsSUFBSTtFQUN2QixJQUFJLENBQUMyRCxVQUFVLEVBQUU7RUFDakIsT0FBTyxJQUFJLENBQUM3RCxTQUFTO0FBQ3ZCLENBQUM7QUFFRFQsSUFBSSxDQUFDWSxTQUFTLENBQUMwRCxVQUFVLEdBQUcsWUFBWTtFQUN0QyxJQUFJLENBQUMsSUFBSSxDQUFDcEUsZUFBZSxFQUFFO0lBQ3pCLE9BQU8sS0FBSztFQUNkO0VBQ0EsSUFBSSxDQUFDQSxlQUFlLENBQUNtRSxJQUFJLENBQUNuQixHQUFHLENBQUMsSUFBSSxDQUFDM0MsSUFBSSxDQUFDd0QsRUFBRSxFQUFFaUIsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDdkUsU0FBUyxDQUFDLENBQUM7RUFDckUsT0FBTyxJQUFJO0FBQ2IsQ0FBQztBQUVEVCxJQUFJLENBQUNZLFNBQVMsQ0FBQ3FFLGNBQWMsR0FBRyxVQUFVOUQsWUFBWSxFQUFFO0VBQ3RELElBQUksQ0FBQyxJQUFJLENBQUNqQixlQUFlLEVBQUU7SUFDekIsT0FBTyxLQUFLO0VBQ2Q7RUFDQSxJQUFJLENBQUNBLGVBQWUsQ0FBQ21FLElBQUksQ0FBQ2EsR0FBRyxDQUFDLElBQUksQ0FBQzNFLElBQUksQ0FBQ3dELEVBQUUsQ0FBQztFQUMzQyxJQUFJLENBQUM3RCxlQUFlLENBQUNLLElBQUksQ0FBQzJFLEdBQUcsQ0FBQy9ELFlBQVksQ0FBQztFQUMzQyxPQUFPLElBQUk7QUFDYixDQUFDO0FBRURuQixJQUFJLENBQUNZLFNBQVMsQ0FBQ3VFLGFBQWEsR0FBRyxnQkFBZ0JDLEdBQUcsRUFBRTtFQUNsRCxNQUFNekQsT0FBTyxHQUFHLEVBQUU7RUFDbEI7RUFDQSxJQUFJLENBQUMsSUFBSSxDQUFDMUIsTUFBTSxFQUFFO0lBQ2hCLE1BQU0sSUFBSUgsS0FBSyxDQUFDb0MsS0FBSyxDQUFDcEMsS0FBSyxDQUFDcUUsSUFBSSxDQUFDLENBQzlCa0IsV0FBVyxDQUNWLE9BQU8sRUFDUEQsR0FBRyxDQUFDN0MsR0FBRyxDQUFDd0IsRUFBRSxJQUFJO01BQ1osTUFBTU0sSUFBSSxHQUFHLElBQUl2RSxLQUFLLENBQUN5QixNQUFNLENBQUN6QixLQUFLLENBQUNxRSxJQUFJLENBQUM7TUFDekNFLElBQUksQ0FBQ04sRUFBRSxHQUFHQSxFQUFFO01BQ1osT0FBT00sSUFBSTtJQUNiLENBQUMsQ0FBQyxDQUNILENBQ0FMLElBQUksQ0FBQ0MsTUFBTSxJQUFJdEMsT0FBTyxDQUFDdUMsSUFBSSxDQUFDRCxNQUFNLENBQUN4QixNQUFNLEVBQUUsQ0FBQyxFQUFFO01BQUVILFlBQVksRUFBRTtJQUFLLENBQUMsQ0FBQztFQUMxRSxDQUFDLE1BQU07SUFDTCxNQUFNZ0QsS0FBSyxHQUFHRixHQUFHLENBQUM3QyxHQUFHLENBQUN3QixFQUFFLElBQUk7TUFDMUIsT0FBTztRQUNMRixNQUFNLEVBQUUsU0FBUztRQUNqQk4sU0FBUyxFQUFFLE9BQU87UUFDbEJPLFFBQVEsRUFBRUM7TUFDWixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBQ0YsTUFBTUosU0FBUyxHQUFHO01BQUUyQixLQUFLLEVBQUU7UUFBRUMsR0FBRyxFQUFFRDtNQUFNO0lBQUUsQ0FBQztJQUMzQyxNQUFNdkQsU0FBUyxHQUFHaEMsT0FBTyxDQUFDLGFBQWEsQ0FBQztJQUN4QyxNQUFNLElBQUlnQyxTQUFTLENBQUMsSUFBSSxDQUFDOUIsTUFBTSxFQUFFYSxNQUFNLENBQUMsSUFBSSxDQUFDYixNQUFNLENBQUMsRUFBRSxPQUFPLEVBQUUwRCxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQ0ssSUFBSSxDQUFDQyxNQUFNLElBQ3ZGdEMsT0FBTyxDQUFDdUMsSUFBSSxDQUFDRCxNQUFNLENBQUMsQ0FDckI7RUFDSDtFQUNBLE9BQU90QyxPQUFPO0FBQ2hCLENBQUM7O0FBRUQ7QUFDQTNCLElBQUksQ0FBQ1ksU0FBUyxDQUFDbUUsMkJBQTJCLEdBQUcsVUFBVVMsT0FBTyxFQUFFYixLQUFLLEdBQUcsRUFBRSxFQUFFYyxZQUFZLEdBQUcsQ0FBQyxDQUFDLEVBQUU7RUFDN0YsTUFBTUwsR0FBRyxHQUFHSSxPQUFPLENBQUNFLE1BQU0sQ0FBQ0MsTUFBTSxJQUFJO0lBQ25DLE1BQU1DLFVBQVUsR0FBR0gsWUFBWSxDQUFDRSxNQUFNLENBQUMsS0FBSyxJQUFJO0lBQ2hERixZQUFZLENBQUNFLE1BQU0sQ0FBQyxHQUFHLElBQUk7SUFDM0IsT0FBT0MsVUFBVTtFQUNuQixDQUFDLENBQUM7O0VBRUY7RUFDQSxJQUFJUixHQUFHLENBQUMxQyxNQUFNLElBQUksQ0FBQyxFQUFFO0lBQ25CLE9BQU9qQixPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsSUFBSW1FLEdBQUcsQ0FBQ2xCLEtBQUssQ0FBQyxDQUFDLENBQUM7RUFDN0M7RUFFQSxPQUFPLElBQUksQ0FBQ1EsYUFBYSxDQUFDQyxHQUFHLENBQUMsQ0FDM0IvQixJQUFJLENBQUMxQixPQUFPLElBQUk7SUFDZjtJQUNBLElBQUksQ0FBQ0EsT0FBTyxDQUFDZSxNQUFNLEVBQUU7TUFDbkIsT0FBT2pCLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDaUQsS0FBSyxDQUFDO0lBQy9CO0lBQ0E7SUFDQSxNQUFNbUIsU0FBUyxHQUFHbkUsT0FBTyxDQUFDNkMsTUFBTSxDQUM5QixDQUFDdUIsSUFBSSxFQUFFMUIsSUFBSSxLQUFLO01BQ2QwQixJQUFJLENBQUNwQixLQUFLLENBQUNULElBQUksQ0FBQ0csSUFBSSxDQUFDTyxJQUFJLENBQUM7TUFDMUJtQixJQUFJLENBQUNsQixHQUFHLENBQUNYLElBQUksQ0FBQ0csSUFBSSxDQUFDUCxRQUFRLENBQUM7TUFDNUIsT0FBT2lDLElBQUk7SUFDYixDQUFDLEVBQ0Q7TUFBRWxCLEdBQUcsRUFBRSxFQUFFO01BQUVGLEtBQUssRUFBRTtJQUFHLENBQUMsQ0FDdkI7SUFDRDtJQUNBQSxLQUFLLEdBQUdBLEtBQUssQ0FBQ3FCLE1BQU0sQ0FBQ0YsU0FBUyxDQUFDbkIsS0FBSyxDQUFDO0lBQ3JDO0lBQ0EsT0FBTyxJQUFJLENBQUNJLDJCQUEyQixDQUFDZSxTQUFTLENBQUNqQixHQUFHLEVBQUVGLEtBQUssRUFBRWMsWUFBWSxDQUFDO0VBQzdFLENBQUMsQ0FBQyxDQUNEcEMsSUFBSSxDQUFDc0IsS0FBSyxJQUFJO0lBQ2IsT0FBT2xELE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsR0FBRyxJQUFJbUUsR0FBRyxDQUFDbEIsS0FBSyxDQUFDLENBQUMsQ0FBQztFQUM3QyxDQUFDLENBQUM7QUFDTixDQUFDO0FBRUQsTUFBTXNCLHFCQUFxQixHQUFHLENBQUNoRyxNQUFNLEVBQUVpRyxRQUFRLEtBQUs7RUFDbEQsTUFBTUMsU0FBUyxHQUFHNUUsTUFBTSxDQUFDNkUsSUFBSSxDQUFDRixRQUFRLENBQUM7RUFDdkMsTUFBTWxFLEtBQUssR0FBR21FLFNBQVMsQ0FDcEIzQixNQUFNLENBQUMsQ0FBQ3VCLElBQUksRUFBRU0sUUFBUSxLQUFLO0lBQzFCLElBQUksQ0FBQ0gsUUFBUSxDQUFDRyxRQUFRLENBQUMsSUFBS0gsUUFBUSxJQUFJLENBQUNBLFFBQVEsQ0FBQ0csUUFBUSxDQUFDLENBQUN0QyxFQUFHLEVBQUU7TUFDL0QsT0FBT2dDLElBQUk7SUFDYjtJQUNBLE1BQU1PLFFBQVEsR0FBSSxZQUFXRCxRQUFTLEtBQUk7SUFDMUMsTUFBTXJFLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDaEJBLEtBQUssQ0FBQ3NFLFFBQVEsQ0FBQyxHQUFHSixRQUFRLENBQUNHLFFBQVEsQ0FBQyxDQUFDdEMsRUFBRTtJQUN2Q2dDLElBQUksQ0FBQzdCLElBQUksQ0FBQ2xDLEtBQUssQ0FBQztJQUNoQixPQUFPK0QsSUFBSTtFQUNiLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FDTEwsTUFBTSxDQUFDYSxDQUFDLElBQUk7SUFDWCxPQUFPLE9BQU9BLENBQUMsS0FBSyxXQUFXO0VBQ2pDLENBQUMsQ0FBQztFQUVKLE9BQU92RSxLQUFLLENBQUNVLE1BQU0sR0FBRyxDQUFDLEdBQ25CekMsTUFBTSxDQUFDdUcsUUFBUSxDQUFDbkUsSUFBSSxDQUFDLE9BQU8sRUFBRTtJQUFFb0UsR0FBRyxFQUFFekU7RUFBTSxDQUFDLEVBQUU7SUFBRUgsS0FBSyxFQUFFO0VBQUUsQ0FBQyxDQUFDLEdBQzNESixPQUFPLENBQUNDLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFDekIsQ0FBQztBQUVELE1BQU1nRixrQkFBa0IsR0FBRyxDQUFDUixRQUFRLEVBQUVTLFlBQVksS0FBSztFQUNyRCxJQUFJLENBQUNBLFlBQVksRUFBRSxPQUFPO0lBQUVELGtCQUFrQixFQUFFLElBQUk7SUFBRUUsZUFBZSxFQUFFVjtFQUFTLENBQUM7RUFDakYsTUFBTVUsZUFBZSxHQUFHLENBQUMsQ0FBQztFQUMxQnJGLE1BQU0sQ0FBQzZFLElBQUksQ0FBQ0YsUUFBUSxDQUFDLENBQUNXLE9BQU8sQ0FBQ1IsUUFBUSxJQUFJO0lBQ3hDO0lBQ0EsSUFBSUEsUUFBUSxLQUFLLFdBQVcsRUFBRTtJQUM5QixNQUFNUyxZQUFZLEdBQUdaLFFBQVEsQ0FBQ0csUUFBUSxDQUFDO0lBQ3ZDLE1BQU1VLG9CQUFvQixHQUFHSixZQUFZLENBQUNOLFFBQVEsQ0FBQztJQUNuRCxJQUFJLENBQUMsSUFBQVcsdUJBQWlCLEVBQUNGLFlBQVksRUFBRUMsb0JBQW9CLENBQUMsRUFBRTtNQUMxREgsZUFBZSxDQUFDUCxRQUFRLENBQUMsR0FBR1MsWUFBWTtJQUMxQztFQUNGLENBQUMsQ0FBQztFQUNGLE1BQU1KLGtCQUFrQixHQUFHbkYsTUFBTSxDQUFDNkUsSUFBSSxDQUFDUSxlQUFlLENBQUMsQ0FBQ2xFLE1BQU0sS0FBSyxDQUFDO0VBQ3BFLE9BQU87SUFBRWdFLGtCQUFrQjtJQUFFRTtFQUFnQixDQUFDO0FBQ2hELENBQUM7QUFFRCxNQUFNSyxpREFBaUQsR0FBRyxDQUN4RGYsUUFBUSxHQUFHLENBQUMsQ0FBQyxFQUNiUyxZQUFZLEdBQUcsQ0FBQyxDQUFDLEVBQ2pCMUcsTUFBTSxLQUNIO0VBQ0gsTUFBTWlILGtCQUFrQixHQUFHM0YsTUFBTSxDQUFDNkUsSUFBSSxDQUFDTyxZQUFZLENBQUMsQ0FBQ3BFLEdBQUcsQ0FBQzhELFFBQVEsS0FBSztJQUNwRXpCLElBQUksRUFBRXlCLFFBQVE7SUFDZGMsT0FBTyxFQUFFbEgsTUFBTSxDQUFDbUgsZUFBZSxDQUFDQyx1QkFBdUIsQ0FBQ2hCLFFBQVEsQ0FBQyxDQUFDYztFQUNwRSxDQUFDLENBQUMsQ0FBQztFQUVILE1BQU1HLHdCQUF3QixHQUFHSixrQkFBa0IsQ0FBQ0ssSUFBSSxDQUN0RGxCLFFBQVEsSUFDTkEsUUFBUSxJQUFJQSxRQUFRLENBQUNjLE9BQU8sSUFBSWQsUUFBUSxDQUFDYyxPQUFPLENBQUNLLE1BQU0sS0FBSyxNQUFNLElBQUl0QixRQUFRLENBQUNHLFFBQVEsQ0FBQ3pCLElBQUksQ0FBQyxDQUNoRzs7RUFFRDtFQUNBO0VBQ0E7RUFDQSxJQUFJMEMsd0JBQXdCLEVBQUU7SUFDNUI7RUFDRjtFQUVBLE1BQU1HLHlCQUF5QixHQUFHLEVBQUU7RUFDcEMsTUFBTUMsdUNBQXVDLEdBQUdSLGtCQUFrQixDQUFDSyxJQUFJLENBQUNsQixRQUFRLElBQUk7SUFDbEYsSUFBSUEsUUFBUSxJQUFJQSxRQUFRLENBQUNjLE9BQU8sSUFBSWQsUUFBUSxDQUFDYyxPQUFPLENBQUNLLE1BQU0sS0FBSyxZQUFZLEVBQUU7TUFDNUUsSUFBSXRCLFFBQVEsQ0FBQ0csUUFBUSxDQUFDekIsSUFBSSxDQUFDLEVBQUU7UUFDM0IsT0FBTyxJQUFJO01BQ2IsQ0FBQyxNQUFNO1FBQ0w7UUFDQTZDLHlCQUF5QixDQUFDdkQsSUFBSSxDQUFDbUMsUUFBUSxDQUFDekIsSUFBSSxDQUFDO01BQy9DO0lBQ0Y7RUFDRixDQUFDLENBQUM7RUFDRixJQUFJOEMsdUNBQXVDLElBQUksQ0FBQ0QseUJBQXlCLENBQUMvRSxNQUFNLEVBQUU7SUFDaEY7RUFDRjtFQUVBLE1BQU0sSUFBSTVDLEtBQUssQ0FBQzZDLEtBQUssQ0FDbkI3QyxLQUFLLENBQUM2QyxLQUFLLENBQUNnRixXQUFXLEVBQ3RCLCtCQUE4QkYseUJBQXlCLENBQUNHLElBQUksQ0FBQyxHQUFHLENBQUUsRUFBQyxDQUNyRTtBQUNILENBQUM7O0FBRUQ7QUFDQSxNQUFNQyx3QkFBd0IsR0FBRyxPQUFPM0IsUUFBUSxFQUFFNEIsR0FBRyxFQUFFQyxTQUFTLEtBQUs7RUFDbkUsSUFBSXhILElBQUk7RUFDUixJQUFJd0gsU0FBUyxFQUFFO0lBQ2J4SCxJQUFJLEdBQUdULEtBQUssQ0FBQ2tJLElBQUksQ0FBQ3hHLFFBQVE7TUFBRytCLFNBQVMsRUFBRTtJQUFPLEdBQUt3RSxTQUFTLEVBQUc7SUFDaEU7RUFDRixDQUFDLE1BQU0sSUFDSkQsR0FBRyxDQUFDRyxJQUFJLElBQ1BILEdBQUcsQ0FBQ0csSUFBSSxDQUFDMUgsSUFBSSxJQUNiLE9BQU91SCxHQUFHLENBQUNJLFNBQVMsS0FBSyxVQUFVLElBQ25DSixHQUFHLENBQUNJLFNBQVMsRUFBRSxLQUFLSixHQUFHLENBQUNHLElBQUksQ0FBQzFILElBQUksQ0FBQ3dELEVBQUUsSUFDckMrRCxHQUFHLENBQUNHLElBQUksSUFBSUgsR0FBRyxDQUFDRyxJQUFJLENBQUM3SCxRQUFRLElBQUksT0FBTzBILEdBQUcsQ0FBQ0ksU0FBUyxLQUFLLFVBQVUsSUFBSUosR0FBRyxDQUFDSSxTQUFTLEVBQUcsRUFDekY7SUFDQTNILElBQUksR0FBRyxJQUFJVCxLQUFLLENBQUNrSSxJQUFJLEVBQUU7SUFDdkJ6SCxJQUFJLENBQUN3RCxFQUFFLEdBQUcrRCxHQUFHLENBQUNHLElBQUksQ0FBQzdILFFBQVEsR0FBRzBILEdBQUcsQ0FBQ0ksU0FBUyxFQUFFLEdBQUdKLEdBQUcsQ0FBQ0csSUFBSSxDQUFDMUgsSUFBSSxDQUFDd0QsRUFBRTtJQUNoRSxNQUFNeEQsSUFBSSxDQUFDNEgsS0FBSyxDQUFDO01BQUU3RixZQUFZLEVBQUU7SUFBSyxDQUFDLENBQUM7RUFDMUM7RUFFQSxNQUFNO0lBQUU4RixjQUFjO0lBQUVDO0VBQWMsQ0FBQyxHQUFHUCxHQUFHLENBQUNRLGlCQUFpQixFQUFFO0VBQ2pFLE1BQU1DLGFBQWEsR0FBRyxJQUFBQywwQkFBZ0IsRUFDcENySSxTQUFTLEVBQ1QySCxHQUFHLENBQUNHLElBQUksRUFDUkksYUFBYSxFQUNiRCxjQUFjLElBQUk3SCxJQUFJLEVBQ3RCdUgsR0FBRyxDQUFDN0gsTUFBTSxDQUNYO0VBQ0Q7RUFDQTtFQUNBLE1BQU13SSxHQUFHLEdBQUc7SUFBRXZDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFBRXdDLGdCQUFnQixFQUFFLENBQUM7RUFBRSxDQUFDO0VBQ2xELE1BQU1DLFFBQVEsR0FBR3BILE1BQU0sQ0FBQzZFLElBQUksQ0FBQ0YsUUFBUSxDQUFDLENBQUMwQyxJQUFJLEVBQUU7RUFDN0MsS0FBSyxNQUFNdkMsUUFBUSxJQUFJc0MsUUFBUSxFQUFFO0lBQy9CLElBQUlFLE1BQU0sR0FBRyxFQUFFO0lBQ2YsSUFBSTtNQUNGLElBQUkzQyxRQUFRLENBQUNHLFFBQVEsQ0FBQyxLQUFLLElBQUksRUFBRTtRQUMvQm9DLEdBQUcsQ0FBQ3ZDLFFBQVEsQ0FBQ0csUUFBUSxDQUFDLEdBQUcsSUFBSTtRQUM3QjtNQUNGO01BQ0EsTUFBTTtRQUFFeUM7TUFBVSxDQUFDLEdBQUdoQixHQUFHLENBQUM3SCxNQUFNLENBQUNtSCxlQUFlLENBQUNDLHVCQUF1QixDQUFDaEIsUUFBUSxDQUFDO01BQ2xGLE1BQU0wQyxZQUFZLEdBQUcsQ0FBQ2pCLEdBQUcsQ0FBQzdILE1BQU0sQ0FBQ2dJLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRTVCLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztNQUM1RCxJQUFJMEMsWUFBWSxDQUFDQyxPQUFPLElBQUksSUFBSSxFQUFFO1FBQ2hDQyxtQkFBVSxDQUFDQyxxQkFBcUIsQ0FBQztVQUMvQkMsS0FBSyxFQUFHLHFDQUFvQzlDLFFBQVMsa0NBQWlDO1VBQ3RGK0MsUUFBUSxFQUFHLDhFQUE2RS9DLFFBQVM7UUFDbkcsQ0FBQyxDQUFDO01BQ0o7TUFDQSxJQUFJLENBQUN5QyxTQUFTLElBQUlDLFlBQVksQ0FBQ0MsT0FBTyxLQUFLLEtBQUssRUFBRTtRQUNoRCxNQUFNLElBQUlsSixLQUFLLENBQUM2QyxLQUFLLENBQ25CN0MsS0FBSyxDQUFDNkMsS0FBSyxDQUFDMEcsbUJBQW1CLEVBQy9CLDRDQUE0QyxDQUM3QztNQUNIO01BQ0EsSUFBSUMsZ0JBQWdCLEdBQUcsTUFBTVIsU0FBUyxDQUFDNUMsUUFBUSxDQUFDRyxRQUFRLENBQUMsRUFBRXlCLEdBQUcsRUFBRXZILElBQUksRUFBRWdJLGFBQWEsQ0FBQztNQUNwRk0sTUFBTSxHQUFHUyxnQkFBZ0IsSUFBSUEsZ0JBQWdCLENBQUNULE1BQU07TUFDcEROLGFBQWEsQ0FBQ2dCLFdBQVcsR0FBR1YsTUFBTTtNQUNsQyxJQUFJUyxnQkFBZ0IsSUFBSUEsZ0JBQWdCLENBQUNSLFNBQVMsRUFBRTtRQUNsRFEsZ0JBQWdCLEdBQUcsTUFBTUEsZ0JBQWdCLENBQUNSLFNBQVMsRUFBRTtNQUN2RDtNQUNBLElBQUksQ0FBQ1EsZ0JBQWdCLEVBQUU7UUFDckJiLEdBQUcsQ0FBQ3ZDLFFBQVEsQ0FBQ0csUUFBUSxDQUFDLEdBQUdILFFBQVEsQ0FBQ0csUUFBUSxDQUFDO1FBQzNDO01BQ0Y7TUFDQSxJQUFJLENBQUM5RSxNQUFNLENBQUM2RSxJQUFJLENBQUNrRCxnQkFBZ0IsQ0FBQyxDQUFDNUcsTUFBTSxFQUFFO1FBQ3pDK0YsR0FBRyxDQUFDdkMsUUFBUSxDQUFDRyxRQUFRLENBQUMsR0FBR0gsUUFBUSxDQUFDRyxRQUFRLENBQUM7UUFDM0M7TUFDRjtNQUVBLElBQUlpRCxnQkFBZ0IsQ0FBQ2hHLFFBQVEsRUFBRTtRQUM3Qm1GLEdBQUcsQ0FBQ0MsZ0JBQWdCLENBQUNyQyxRQUFRLENBQUMsR0FBR2lELGdCQUFnQixDQUFDaEcsUUFBUTtNQUM1RDtNQUNBO01BQ0EsSUFBSSxDQUFDZ0csZ0JBQWdCLENBQUNFLFNBQVMsRUFBRTtRQUMvQmYsR0FBRyxDQUFDdkMsUUFBUSxDQUFDRyxRQUFRLENBQUMsR0FBR2lELGdCQUFnQixDQUFDRyxJQUFJLElBQUl2RCxRQUFRLENBQUNHLFFBQVEsQ0FBQztNQUN0RTtJQUNGLENBQUMsQ0FBQyxPQUFPcUQsR0FBRyxFQUFFO01BQ1osTUFBTUMsQ0FBQyxHQUFHLElBQUFDLHNCQUFZLEVBQUNGLEdBQUcsRUFBRTtRQUMxQkcsSUFBSSxFQUFFL0osS0FBSyxDQUFDNkMsS0FBSyxDQUFDbUgsYUFBYTtRQUMvQkMsT0FBTyxFQUFFO01BQ1gsQ0FBQyxDQUFDO01BQ0YsTUFBTUMsVUFBVSxHQUNkbEMsR0FBRyxDQUFDRyxJQUFJLElBQUlILEdBQUcsQ0FBQ0csSUFBSSxDQUFDMUgsSUFBSSxHQUFHdUgsR0FBRyxDQUFDRyxJQUFJLENBQUMxSCxJQUFJLENBQUN3RCxFQUFFLEdBQUcrRCxHQUFHLENBQUNtQyxJQUFJLENBQUNuRyxRQUFRLElBQUkzRCxTQUFTO01BQy9FK0osY0FBTSxDQUFDQyxLQUFLLENBQ1QsNEJBQTJCdEIsTUFBTyxRQUFPeEMsUUFBUyxhQUFZMkQsVUFBVyxlQUFjLEdBQ3RGSSxJQUFJLENBQUNDLFNBQVMsQ0FBQ1YsQ0FBQyxDQUFDLEVBQ25CO1FBQ0VXLGtCQUFrQixFQUFFekIsTUFBTTtRQUMxQnNCLEtBQUssRUFBRVIsQ0FBQztRQUNScEosSUFBSSxFQUFFeUosVUFBVTtRQUNoQjNEO01BQ0YsQ0FBQyxDQUNGO01BQ0QsTUFBTXNELENBQUM7SUFDVDtFQUNGO0VBQ0EsT0FBT2xCLEdBQUc7QUFDWixDQUFDO0FBRUQ4QixNQUFNLENBQUNDLE9BQU8sR0FBRztFQUNmeEssSUFBSTtFQUNKYyxNQUFNO0VBQ05DLFdBQVc7RUFDWEUsTUFBTTtFQUNORCxRQUFRO0VBQ1JFLHNCQUFzQjtFQUN0QmtDLDRCQUE0QjtFQUM1QjZDLHFCQUFxQjtFQUNyQlMsa0JBQWtCO0VBQ2xCTyxpREFBaUQ7RUFDakRZO0FBQ0YsQ0FBQyJ9