"use strict";

var _util = require("util");
var _triggers = require("./triggers");
var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));
var _logger = require("./logger");
var _RestQuery = _interopRequireDefault(require("./RestQuery"));
var _RestWrite = _interopRequireDefault(require("./RestWrite"));
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
const throttle = {};
const renewSessionIfNeeded = async ({
  config,
  session,
  sessionToken
}) => {
  if (!(config !== null && config !== void 0 && config.extendSessionOnUse)) {
    return;
  }
  clearTimeout(throttle[sessionToken]);
  throttle[sessionToken] = setTimeout(async () => {
    try {
      var _session;
      if (!session) {
        const {
          results
        } = await new _RestQuery.default(config, master(config), '_Session', {
          sessionToken
        }, {
          limit: 1
        }).execute();
        session = results[0];
      }
      const lastUpdated = new Date((_session = session) === null || _session === void 0 ? void 0 : _session.updatedAt);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastUpdated > yesterday || !session) {
        return;
      }
      const expiresAt = config.generateSessionExpiresAt();
      await new _RestWrite.default(config, master(config), '_Session', {
        objectId: session.objectId
      }, {
        expiresAt: Parse._encode(expiresAt)
      }).execute();
    } catch (e) {
      if ((e === null || e === void 0 ? void 0 : e.code) !== Parse.Error.OBJECT_NOT_FOUND) {
        _logger.logger.error('Could not update session expiry: ', e);
      }
    }
  }, 500);
};

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
      renewSessionIfNeeded({
        config,
        sessionToken
      });
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
  const session = results[0];
  const now = new Date(),
    expiresAt = session.expiresAt ? new Date(session.expiresAt.iso) : undefined;
  if (expiresAt < now) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token is expired.');
  }
  const obj = session.user;
  delete obj.password;
  obj['className'] = '_User';
  obj['sessionToken'] = sessionToken;
  if (cacheController) {
    cacheController.user.put(sessionToken, obj);
  }
  renewSessionIfNeeded({
    config,
    session,
    sessionToken
  });
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
const checkIfUserHasProvidedConfiguredProvidersForLogin = (req = {}, authData = {}, userAuthData = {}, config) => {
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
    let policy = provider.adapter.policy;
    if (typeof policy === 'function') {
      const requestObject = {
        ip: req.config.ip,
        user: req.auth.user,
        master: req.auth.isMaster
      };
      policy = policy.call(provider.adapter, requestObject, userAuthData[provider.name]);
    }
    if (policy === 'additional') {
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
    updatedObject
  } = req.buildParseObjects();
  const requestObject = (0, _triggers.getRequestObject)(undefined, req.auth, updatedObject, user, req.config);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJBdXRoIiwiY29uZmlnIiwiY2FjaGVDb250cm9sbGVyIiwidW5kZWZpbmVkIiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwiaXNSZWFkT25seSIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsInVzZXJSb2xlcyIsImZldGNoZWRSb2xlcyIsInJvbGVQcm9taXNlIiwicHJvdG90eXBlIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJtYXN0ZXIiLCJtYWludGVuYW5jZSIsInJlYWRPbmx5Iiwibm9ib2R5IiwidGhyb3R0bGUiLCJyZW5ld1Nlc3Npb25JZk5lZWRlZCIsInNlc3Npb24iLCJzZXNzaW9uVG9rZW4iLCJleHRlbmRTZXNzaW9uT25Vc2UiLCJjbGVhclRpbWVvdXQiLCJzZXRUaW1lb3V0IiwicmVzdWx0cyIsIlJlc3RRdWVyeSIsImxpbWl0IiwiZXhlY3V0ZSIsImxhc3RVcGRhdGVkIiwiRGF0ZSIsInVwZGF0ZWRBdCIsInllc3RlcmRheSIsInNldERhdGUiLCJnZXREYXRlIiwiZXhwaXJlc0F0IiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiUmVzdFdyaXRlIiwib2JqZWN0SWQiLCJfZW5jb2RlIiwiZSIsImNvZGUiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJsb2dnZXIiLCJlcnJvciIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJ1c2VySlNPTiIsImdldCIsImNhY2hlZFVzZXIiLCJPYmplY3QiLCJmcm9tSlNPTiIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVzdE9wdGlvbnMiLCJpbmNsdWRlIiwicXVlcnkiLCJRdWVyeSIsIlNlc3Npb24iLCJlcXVhbFRvIiwiZmluZCIsInVzZU1hc3RlcktleSIsIm1hcCIsIm9iaiIsInRvSlNPTiIsImxlbmd0aCIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIm5vdyIsImlzbyIsInBhc3N3b3JkIiwicHV0IiwidXNlck9iamVjdCIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJ0aGVuIiwicmVzcG9uc2UiLCJjbGFzc05hbWUiLCJnZXRVc2VyUm9sZXMiLCJfbG9hZFJvbGVzIiwiZ2V0Um9sZXNGb3JVc2VyIiwicmVzdFdoZXJlIiwidXNlcnMiLCJfX3R5cGUiLCJpZCIsImVhY2giLCJyZXN1bHQiLCJwdXNoIiwiUm9sZSIsImNhY2hlZFJvbGVzIiwicm9sZSIsImNhY2hlUm9sZXMiLCJyb2xlc01hcCIsInJlZHVjZSIsIm0iLCJyIiwibmFtZXMiLCJuYW1lIiwiaWRzIiwicm9sZU5hbWVzIiwiX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzIiwiQXJyYXkiLCJjbGVhclJvbGVDYWNoZSIsImRlbCIsImdldFJvbGVzQnlJZHMiLCJpbnMiLCJjb250YWluZWRJbiIsInJvbGVzIiwiJGluIiwicm9sZUlEcyIsInF1ZXJpZWRSb2xlcyIsImZpbHRlciIsInJvbGVJRCIsIndhc1F1ZXJpZWQiLCJTZXQiLCJyZXN1bHRNYXAiLCJtZW1vIiwiY29uY2F0IiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwiYXV0aERhdGEiLCJwcm92aWRlcnMiLCJrZXlzIiwicHJvdmlkZXIiLCJxdWVyeUtleSIsInEiLCJkYXRhYmFzZSIsIiRvciIsImhhc011dGF0ZWRBdXRoRGF0YSIsInVzZXJBdXRoRGF0YSIsIm11dGF0ZWRBdXRoRGF0YSIsImZvckVhY2giLCJwcm92aWRlckRhdGEiLCJ1c2VyUHJvdmlkZXJBdXRoRGF0YSIsImlzRGVlcFN0cmljdEVxdWFsIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsInJlcSIsInNhdmVkVXNlclByb3ZpZGVycyIsImFkYXB0ZXIiLCJhdXRoRGF0YU1hbmFnZXIiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsImhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlciIsInNvbWUiLCJwb2xpY3kiLCJhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kIiwiaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyIiwicmVxdWVzdE9iamVjdCIsImlwIiwiYXV0aCIsImNhbGwiLCJPVEhFUl9DQVVTRSIsImpvaW4iLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJmb3VuZFVzZXIiLCJVc2VyIiwiZ2V0VXNlcklkIiwiZmV0Y2giLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRQYXJzZU9iamVjdHMiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiYWNjIiwiYXV0aERhdGFSZXNwb25zZSIsImF1dGhLZXlzIiwic29ydCIsIm1ldGhvZCIsInZhbGlkYXRvciIsImF1dGhQcm92aWRlciIsImVuYWJsZWQiLCJEZXByZWNhdG9yIiwibG9nUnVudGltZURlcHJlY2F0aW9uIiwidXNhZ2UiLCJzb2x1dGlvbiIsIlVOU1VQUE9SVEVEX1NFUlZJQ0UiLCJ2YWxpZGF0aW9uUmVzdWx0IiwidHJpZ2dlck5hbWUiLCJkb05vdFNhdmUiLCJzYXZlIiwiZXJyIiwicmVzb2x2ZUVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VyU3RyaW5nIiwiZGF0YSIsIkpTT04iLCJzdHJpbmdpZnkiLCJhdXRoZW50aWNhdGlvblN0ZXAiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL0F1dGguanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgZ2V0UmVxdWVzdE9iamVjdCwgcmVzb2x2ZUVycm9yIH0gZnJvbSAnLi90cmlnZ2Vycyc7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgUmVzdFF1ZXJ5IGZyb20gJy4vUmVzdFF1ZXJ5JztcbmltcG9ydCBSZXN0V3JpdGUgZnJvbSAnLi9SZXN0V3JpdGUnO1xuXG4vLyBBbiBBdXRoIG9iamVjdCB0ZWxscyB5b3Ugd2hvIGlzIHJlcXVlc3Rpbmcgc29tZXRoaW5nIGFuZCB3aGV0aGVyXG4vLyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbi8vIHVzZXJPYmplY3QgaXMgYSBQYXJzZS5Vc2VyIGFuZCBjYW4gYmUgbnVsbCBpZiB0aGVyZSdzIG5vIHVzZXIuXG5mdW5jdGlvbiBBdXRoKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIgPSB1bmRlZmluZWQsXG4gIGlzTWFzdGVyID0gZmFsc2UsXG4gIGlzTWFpbnRlbmFuY2UgPSBmYWxzZSxcbiAgaXNSZWFkT25seSA9IGZhbHNlLFxuICB1c2VyLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIHRoaXMuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgdGhpcy5pc01hc3RlciA9IGlzTWFzdGVyO1xuICB0aGlzLmlzTWFpbnRlbmFuY2UgPSBpc01haW50ZW5hbmNlO1xuICB0aGlzLnVzZXIgPSB1c2VyO1xuICB0aGlzLmlzUmVhZE9ubHkgPSBpc1JlYWRPbmx5O1xuXG4gIC8vIEFzc3VtaW5nIGEgdXNlcnMgcm9sZXMgd29uJ3QgY2hhbmdlIGR1cmluZyBhIHNpbmdsZSByZXF1ZXN0LCB3ZSdsbFxuICAvLyBvbmx5IGxvYWQgdGhlbSBvbmNlLlxuICB0aGlzLnVzZXJSb2xlcyA9IFtdO1xuICB0aGlzLmZldGNoZWRSb2xlcyA9IGZhbHNlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbn1cblxuLy8gV2hldGhlciB0aGlzIGF1dGggY291bGQgcG9zc2libHkgbW9kaWZ5IHRoZSBnaXZlbiB1c2VyIGlkLlxuLy8gSXQgc3RpbGwgY291bGQgYmUgZm9yYmlkZGVuIHZpYSBBQ0xzIGV2ZW4gaWYgdGhpcyByZXR1cm5zIHRydWUuXG5BdXRoLnByb3RvdHlwZS5pc1VuYXV0aGVudGljYXRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHRoaXMuaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBtYXN0ZXIoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1haW50ZW5hbmNlLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBtYWludGVuYW5jZShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01haW50ZW5hbmNlOiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYXN0ZXItbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIHJlYWRPbmx5KGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlLCBpc1JlYWRPbmx5OiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBub2JvZHktbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG5vYm9keShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogZmFsc2UgfSk7XG59XG5cbmNvbnN0IHRocm90dGxlID0ge307XG5jb25zdCByZW5ld1Nlc3Npb25JZk5lZWRlZCA9IGFzeW5jICh7IGNvbmZpZywgc2Vzc2lvbiwgc2Vzc2lvblRva2VuIH0pID0+IHtcbiAgaWYgKCFjb25maWc/LmV4dGVuZFNlc3Npb25PblVzZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjbGVhclRpbWVvdXQodGhyb3R0bGVbc2Vzc2lvblRva2VuXSk7XG4gIHRocm90dGxlW3Nlc3Npb25Ub2tlbl0gPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICAgIGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgbmV3IFJlc3RRdWVyeShcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgbWFzdGVyKGNvbmZpZyksXG4gICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICAgIHsgbGltaXQ6IDEgfVxuICAgICAgICApLmV4ZWN1dGUoKTtcbiAgICAgICAgc2Vzc2lvbiA9IHJlc3VsdHNbMF07XG4gICAgICB9XG4gICAgICBjb25zdCBsYXN0VXBkYXRlZCA9IG5ldyBEYXRlKHNlc3Npb24/LnVwZGF0ZWRBdCk7XG4gICAgICBjb25zdCB5ZXN0ZXJkYXkgPSBuZXcgRGF0ZSgpO1xuICAgICAgeWVzdGVyZGF5LnNldERhdGUoeWVzdGVyZGF5LmdldERhdGUoKSAtIDEpO1xuICAgICAgaWYgKGxhc3RVcGRhdGVkID4geWVzdGVyZGF5IHx8ICFzZXNzaW9uKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKTtcbiAgICAgIGF3YWl0IG5ldyBSZXN0V3JpdGUoXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgbWFzdGVyKGNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHNlc3Npb24ub2JqZWN0SWQgfSxcbiAgICAgICAgeyBleHBpcmVzQXQ6IFBhcnNlLl9lbmNvZGUoZXhwaXJlc0F0KSB9XG4gICAgICApLmV4ZWN1dGUoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZT8uY29kZSAhPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0NvdWxkIG5vdCB1cGRhdGUgc2Vzc2lvbiBleHBpcnk6ICcsIGUpO1xuICAgICAgfVxuICAgIH1cbiAgfSwgNTAwKTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gQXV0aCBvYmplY3RcbmNvbnN0IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoe1xuICBjb25maWcsXG4gIGNhY2hlQ29udHJvbGxlcixcbiAgc2Vzc2lvblRva2VuLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjb25zdCB1c2VySlNPTiA9IGF3YWl0IGNhY2hlQ29udHJvbGxlci51c2VyLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmICh1c2VySlNPTikge1xuICAgICAgY29uc3QgY2FjaGVkVXNlciA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTih1c2VySlNPTik7XG4gICAgICByZW5ld1Nlc3Npb25JZk5lZWRlZCh7IGNvbmZpZywgc2Vzc2lvblRva2VuIH0pO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgbmV3IEF1dGgoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgICAgIHVzZXI6IGNhY2hlZFVzZXIsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGxldCByZXN1bHRzO1xuICBpZiAoY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdE9wdGlvbnMgPSB7XG4gICAgICBsaW1pdDogMSxcbiAgICAgIGluY2x1ZGU6ICd1c2VyJyxcbiAgICB9O1xuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgY29uc3QgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KGNvbmZpZywgbWFzdGVyKGNvbmZpZyksICdfU2Vzc2lvbicsIHsgc2Vzc2lvblRva2VuIH0sIHJlc3RPcHRpb25zKTtcbiAgICByZXN1bHRzID0gKGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKSkucmVzdWx0cztcbiAgfSBlbHNlIHtcbiAgICByZXN1bHRzID0gKFxuICAgICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlNlc3Npb24pXG4gICAgICAgIC5saW1pdCgxKVxuICAgICAgICAuaW5jbHVkZSgndXNlcicpXG4gICAgICAgIC5lcXVhbFRvKCdzZXNzaW9uVG9rZW4nLCBzZXNzaW9uVG9rZW4pXG4gICAgICAgIC5maW5kKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pXG4gICAgKS5tYXAob2JqID0+IG9iai50b0pTT04oKSk7XG4gIH1cblxuICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEgfHwgIXJlc3VsdHNbMF1bJ3VzZXInXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgfVxuICBjb25zdCBzZXNzaW9uID0gcmVzdWx0c1swXTtcbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKSxcbiAgICBleHBpcmVzQXQgPSBzZXNzaW9uLmV4cGlyZXNBdCA/IG5ldyBEYXRlKHNlc3Npb24uZXhwaXJlc0F0LmlzbykgOiB1bmRlZmluZWQ7XG4gIGlmIChleHBpcmVzQXQgPCBub3cpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnU2Vzc2lvbiB0b2tlbiBpcyBleHBpcmVkLicpO1xuICB9XG4gIGNvbnN0IG9iaiA9IHNlc3Npb24udXNlcjtcbiAgZGVsZXRlIG9iai5wYXNzd29yZDtcbiAgb2JqWydjbGFzc05hbWUnXSA9ICdfVXNlcic7XG4gIG9ialsnc2Vzc2lvblRva2VuJ10gPSBzZXNzaW9uVG9rZW47XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjYWNoZUNvbnRyb2xsZXIudXNlci5wdXQoc2Vzc2lvblRva2VuLCBvYmopO1xuICB9XG4gIHJlbmV3U2Vzc2lvbklmTmVlZGVkKHsgY29uZmlnLCBzZXNzaW9uLCBzZXNzaW9uVG9rZW4gfSk7XG4gIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICBjb25maWcsXG4gICAgY2FjaGVDb250cm9sbGVyLFxuICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICBpbnN0YWxsYXRpb25JZCxcbiAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICB9KTtcbn07XG5cbnZhciBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuID0gZnVuY3Rpb24gKHsgY29uZmlnLCBzZXNzaW9uVG9rZW4sIGluc3RhbGxhdGlvbklkIH0pIHtcbiAgdmFyIHJlc3RPcHRpb25zID0ge1xuICAgIGxpbWl0OiAxLFxuICB9O1xuICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICB2YXIgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KGNvbmZpZywgbWFzdGVyKGNvbmZpZyksICdfVXNlcicsIHsgc2Vzc2lvblRva2VuIH0sIHJlc3RPcHRpb25zKTtcbiAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB2YXIgcmVzdWx0cyA9IHJlc3BvbnNlLnJlc3VsdHM7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnaW52YWxpZCBsZWdhY3kgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBvYmogPSByZXN1bHRzWzBdO1xuICAgIG9iai5jbGFzc05hbWUgPSAnX1VzZXInO1xuICAgIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgICByZXR1cm4gbmV3IEF1dGgoe1xuICAgICAgY29uZmlnLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2Ygcm9sZSBuYW1lc1xuQXV0aC5wcm90b3R5cGUuZ2V0VXNlclJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3RlciB8fCB0aGlzLmlzTWFpbnRlbmFuY2UgfHwgIXRoaXMudXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG4gIGlmICh0aGlzLmZldGNoZWRSb2xlcykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy51c2VyUm9sZXMpO1xuICB9XG4gIGlmICh0aGlzLnJvbGVQcm9taXNlKSB7XG4gICAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG4gIH1cbiAgdGhpcy5yb2xlUHJvbWlzZSA9IHRoaXMuX2xvYWRSb2xlcygpO1xuICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzRm9yVXNlciA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy9TdGFjayBhbGwgUGFyc2UuUm9sZVxuICBjb25zdCByZXN1bHRzID0gW107XG4gIGlmICh0aGlzLmNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHtcbiAgICAgIHVzZXJzOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLnVzZXIuaWQsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBhd2FpdCBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBtYXN0ZXIodGhpcy5jb25maWcpLCAnX1JvbGUnLCByZXN0V2hlcmUsIHt9KS5lYWNoKHJlc3VsdCA9PlxuICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdClcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmVxdWFsVG8oJ3VzZXJzJywgdGhpcy51c2VyKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEl0ZXJhdGVzIHRocm91Z2ggdGhlIHJvbGUgdHJlZSBhbmQgY29tcGlsZXMgYSB1c2VyJ3Mgcm9sZXNcbkF1dGgucHJvdG90eXBlLl9sb2FkUm9sZXMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IGNhY2hlZFJvbGVzID0gYXdhaXQgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5nZXQodGhpcy51c2VyLmlkKTtcbiAgICBpZiAoY2FjaGVkUm9sZXMgIT0gbnVsbCkge1xuICAgICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgICAgdGhpcy51c2VyUm9sZXMgPSBjYWNoZWRSb2xlcztcbiAgICAgIHJldHVybiBjYWNoZWRSb2xlcztcbiAgICB9XG4gIH1cblxuICAvLyBGaXJzdCBnZXQgdGhlIHJvbGUgaWRzIHRoaXMgdXNlciBpcyBkaXJlY3RseSBhIG1lbWJlciBvZlxuICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRSb2xlc0ZvclVzZXIoKTtcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIHRoaXMudXNlclJvbGVzID0gW107XG4gICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xuXG4gICAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gICAgcmV0dXJuIHRoaXMudXNlclJvbGVzO1xuICB9XG5cbiAgY29uc3Qgcm9sZXNNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAobSwgcikgPT4ge1xuICAgICAgbS5uYW1lcy5wdXNoKHIubmFtZSk7XG4gICAgICBtLmlkcy5wdXNoKHIub2JqZWN0SWQpO1xuICAgICAgcmV0dXJuIG07XG4gICAgfSxcbiAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICk7XG5cbiAgLy8gcnVuIHRoZSByZWN1cnNpdmUgZmluZGluZ1xuICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyb2xlc01hcC5pZHMsIHJvbGVzTWFwLm5hbWVzKTtcbiAgdGhpcy51c2VyUm9sZXMgPSByb2xlTmFtZXMubWFwKHIgPT4ge1xuICAgIHJldHVybiAncm9sZTonICsgcjtcbiAgfSk7XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG4gIHRoaXMuY2FjaGVSb2xlcygpO1xuICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jYWNoZVJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUucHV0KHRoaXMudXNlci5pZCwgQXJyYXkoLi4udGhpcy51c2VyUm9sZXMpKTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jbGVhclJvbGVDYWNoZSA9IGZ1bmN0aW9uIChzZXNzaW9uVG9rZW4pIHtcbiAgaWYgKCF0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmRlbCh0aGlzLnVzZXIuaWQpO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlci51c2VyLmRlbChzZXNzaW9uVG9rZW4pO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzQnlJZHMgPSBhc3luYyBmdW5jdGlvbiAoaW5zKSB7XG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgLy8gQnVpbGQgYW4gT1IgcXVlcnkgYWNyb3NzIGFsbCBwYXJlbnRSb2xlc1xuICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuY29udGFpbmVkSW4oXG4gICAgICAgICdyb2xlcycsXG4gICAgICAgIGlucy5tYXAoaWQgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvbGUgPSBuZXcgUGFyc2UuT2JqZWN0KFBhcnNlLlJvbGUpO1xuICAgICAgICAgIHJvbGUuaWQgPSBpZDtcbiAgICAgICAgICByZXR1cm4gcm9sZTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0LnRvSlNPTigpKSwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgcm9sZXMgPSBpbnMubWFwKGlkID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgIH07XG4gICAgfSk7XG4gICAgY29uc3QgcmVzdFdoZXJlID0geyByb2xlczogeyAkaW46IHJvbGVzIH0gfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGF3YWl0IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIG1hc3Rlcih0aGlzLmNvbmZpZyksICdfUm9sZScsIHJlc3RXaGVyZSwge30pLmVhY2gocmVzdWx0ID0+XG4gICAgICByZXN1bHRzLnB1c2gocmVzdWx0KVxuICAgICk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59O1xuXG4vLyBHaXZlbiBhIGxpc3Qgb2Ygcm9sZUlkcywgZmluZCBhbGwgdGhlIHBhcmVudCByb2xlcywgcmV0dXJucyBhIHByb21pc2Ugd2l0aCBhbGwgbmFtZXNcbkF1dGgucHJvdG90eXBlLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyA9IGZ1bmN0aW9uIChyb2xlSURzLCBuYW1lcyA9IFtdLCBxdWVyaWVkUm9sZXMgPSB7fSkge1xuICBjb25zdCBpbnMgPSByb2xlSURzLmZpbHRlcihyb2xlSUQgPT4ge1xuICAgIGNvbnN0IHdhc1F1ZXJpZWQgPSBxdWVyaWVkUm9sZXNbcm9sZUlEXSAhPT0gdHJ1ZTtcbiAgICBxdWVyaWVkUm9sZXNbcm9sZUlEXSA9IHRydWU7XG4gICAgcmV0dXJuIHdhc1F1ZXJpZWQ7XG4gIH0pO1xuXG4gIC8vIGFsbCByb2xlcyBhcmUgYWNjb3VudGVkIGZvciwgcmV0dXJuIHRoZSBuYW1lc1xuICBpZiAoaW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLmdldFJvbGVzQnlJZHMoaW5zKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gTm90aGluZyBmb3VuZFxuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5hbWVzKTtcbiAgICAgIH1cbiAgICAgIC8vIE1hcCB0aGUgcmVzdWx0cyB3aXRoIGFsbCBJZHMgYW5kIG5hbWVzXG4gICAgICBjb25zdCByZXN1bHRNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAgICAgKG1lbW8sIHJvbGUpID0+IHtcbiAgICAgICAgICBtZW1vLm5hbWVzLnB1c2gocm9sZS5uYW1lKTtcbiAgICAgICAgICBtZW1vLmlkcy5wdXNoKHJvbGUub2JqZWN0SWQpO1xuICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICB9LFxuICAgICAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICAgICApO1xuICAgICAgLy8gc3RvcmUgdGhlIG5ldyBmb3VuZCBuYW1lc1xuICAgICAgbmFtZXMgPSBuYW1lcy5jb25jYXQocmVzdWx0TWFwLm5hbWVzKTtcbiAgICAgIC8vIGZpbmQgdGhlIG5leHQgb25lcywgY2lyY3VsYXIgcm9sZXMgd2lsbCBiZSBjdXRcbiAgICAgIHJldHVybiB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyZXN1bHRNYXAuaWRzLCBuYW1lcywgcXVlcmllZFJvbGVzKTtcbiAgICB9KVxuICAgIC50aGVuKG5hbWVzID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoWy4uLm5ldyBTZXQobmFtZXMpXSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBmaW5kVXNlcnNXaXRoQXV0aERhdGEgPSAoY29uZmlnLCBhdXRoRGF0YSkgPT4ge1xuICBjb25zdCBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGNvbnN0IHF1ZXJ5ID0gcHJvdmlkZXJzXG4gICAgLnJlZHVjZSgobWVtbywgcHJvdmlkZXIpID0+IHtcbiAgICAgIGlmICghYXV0aERhdGFbcHJvdmlkZXJdIHx8IChhdXRoRGF0YSAmJiAhYXV0aERhdGFbcHJvdmlkZXJdLmlkKSkge1xuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHF1ZXJ5S2V5ID0gYGF1dGhEYXRhLiR7cHJvdmlkZXJ9LmlkYDtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0ge307XG4gICAgICBxdWVyeVtxdWVyeUtleV0gPSBhdXRoRGF0YVtwcm92aWRlcl0uaWQ7XG4gICAgICBtZW1vLnB1c2gocXVlcnkpO1xuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfSwgW10pXG4gICAgLmZpbHRlcihxID0+IHtcbiAgICAgIHJldHVybiB0eXBlb2YgcSAhPT0gJ3VuZGVmaW5lZCc7XG4gICAgfSk7XG5cbiAgcmV0dXJuIHF1ZXJ5Lmxlbmd0aCA+IDBcbiAgICA/IGNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgJG9yOiBxdWVyeSB9LCB7IGxpbWl0OiAyIH0pXG4gICAgOiBQcm9taXNlLnJlc29sdmUoW10pO1xufTtcblxuY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gKGF1dGhEYXRhLCB1c2VyQXV0aERhdGEpID0+IHtcbiAgaWYgKCF1c2VyQXV0aERhdGEpIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YTogdHJ1ZSwgbXV0YXRlZEF1dGhEYXRhOiBhdXRoRGF0YSB9O1xuICBjb25zdCBtdXRhdGVkQXV0aERhdGEgPSB7fTtcbiAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgIC8vIEFub255bW91cyBwcm92aWRlciBpcyBub3QgaGFuZGxlZCB0aGlzIHdheVxuICAgIGlmIChwcm92aWRlciA9PT0gJ2Fub255bW91cycpIHJldHVybjtcbiAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgY29uc3QgdXNlclByb3ZpZGVyQXV0aERhdGEgPSB1c2VyQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGlmICghaXNEZWVwU3RyaWN0RXF1YWwocHJvdmlkZXJEYXRhLCB1c2VyUHJvdmlkZXJBdXRoRGF0YSkpIHtcbiAgICAgIG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl0gPSBwcm92aWRlckRhdGE7XG4gICAgfVxuICB9KTtcbiAgY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5sZW5ndGggIT09IDA7XG4gIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YSwgbXV0YXRlZEF1dGhEYXRhIH07XG59O1xuXG5jb25zdCBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luID0gKFxuICByZXEgPSB7fSxcbiAgYXV0aERhdGEgPSB7fSxcbiAgdXNlckF1dGhEYXRhID0ge30sXG4gIGNvbmZpZ1xuKSA9PiB7XG4gIGNvbnN0IHNhdmVkVXNlclByb3ZpZGVycyA9IE9iamVjdC5rZXlzKHVzZXJBdXRoRGF0YSkubWFwKHByb3ZpZGVyID0+ICh7XG4gICAgbmFtZTogcHJvdmlkZXIsXG4gICAgYWRhcHRlcjogY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcikuYWRhcHRlcixcbiAgfSkpO1xuXG4gIGNvbnN0IGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlciA9IHNhdmVkVXNlclByb3ZpZGVycy5zb21lKFxuICAgIHByb3ZpZGVyID0+XG4gICAgICBwcm92aWRlciAmJiBwcm92aWRlci5hZGFwdGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIucG9saWN5ID09PSAnc29sbycgJiYgYXV0aERhdGFbcHJvdmlkZXIubmFtZV1cbiAgKTtcblxuICAvLyBTb2xvIHByb3ZpZGVycyBjYW4gYmUgY29uc2lkZXJlZCBhcyBzYWZlLCBzbyB3ZSBkbyBub3QgaGF2ZSB0byBjaGVjayBpZiB0aGUgdXNlciBuZWVkc1xuICAvLyB0byBwcm92aWRlIGFuIGFkZGl0aW9uYWwgcHJvdmlkZXIgdG8gbG9naW4uIEFuIGF1dGggYWRhcHRlciB3aXRoIFwic29sb1wiIChsaWtlIHdlYmF1dGhuKSBtZWFuc1xuICAvLyBubyBcImFkZGl0aW9uYWxcIiBhdXRoIG5lZWRzIHRvIGJlIHByb3ZpZGVkIHRvIGxvZ2luIChsaWtlIE9UUCwgTUZBKVxuICBpZiAoaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCA9IFtdO1xuICBjb25zdCBoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShwcm92aWRlciA9PiB7XG4gICAgbGV0IHBvbGljeSA9IHByb3ZpZGVyLmFkYXB0ZXIucG9saWN5O1xuICAgIGlmICh0eXBlb2YgcG9saWN5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb25zdCByZXF1ZXN0T2JqZWN0ID0ge1xuICAgICAgICBpcDogcmVxLmNvbmZpZy5pcCxcbiAgICAgICAgdXNlcjogcmVxLmF1dGgudXNlcixcbiAgICAgICAgbWFzdGVyOiByZXEuYXV0aC5pc01hc3RlcixcbiAgICAgIH07XG4gICAgICBwb2xpY3kgPSBwb2xpY3kuY2FsbChwcm92aWRlci5hZGFwdGVyLCByZXF1ZXN0T2JqZWN0LCB1c2VyQXV0aERhdGFbcHJvdmlkZXIubmFtZV0pO1xuICAgIH1cbiAgICBpZiAocG9saWN5ID09PSAnYWRkaXRpb25hbCcpIHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlci5uYW1lXSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFB1c2ggbWlzc2luZyBwcm92aWRlciBmb3IgZXJyb3IgbWVzc2FnZVxuICAgICAgICBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLnB1c2gocHJvdmlkZXIubmFtZSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgaWYgKGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciB8fCAhYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5sZW5ndGgpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgYE1pc3NpbmcgYWRkaXRpb25hbCBhdXRoRGF0YSAke2FkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQuam9pbignLCcpfWBcbiAgKTtcbn07XG5cbi8vIFZhbGlkYXRlIGVhY2ggYXV0aERhdGEgc3RlcC1ieS1zdGVwIGFuZCByZXR1cm4gdGhlIHByb3ZpZGVyIHJlc3BvbnNlc1xuY29uc3QgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uID0gYXN5bmMgKGF1dGhEYXRhLCByZXEsIGZvdW5kVXNlcikgPT4ge1xuICBsZXQgdXNlcjtcbiAgaWYgKGZvdW5kVXNlcikge1xuICAgIHVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5mb3VuZFVzZXIgfSk7XG4gICAgLy8gRmluZCB1c2VyIGJ5IHNlc3Npb24gYW5kIGN1cnJlbnQgb2JqZWN0SWQ7IG9ubHkgcGFzcyB1c2VyIGlmIGl0J3MgdGhlIGN1cnJlbnQgdXNlciBvciBtYXN0ZXIga2V5IGlzIHByb3ZpZGVkXG4gIH0gZWxzZSBpZiAoXG4gICAgKHJlcS5hdXRoICYmXG4gICAgICByZXEuYXV0aC51c2VyICYmXG4gICAgICB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgcmVxLmdldFVzZXJJZCgpID09PSByZXEuYXV0aC51c2VyLmlkKSB8fFxuICAgIChyZXEuYXV0aCAmJiByZXEuYXV0aC5pc01hc3RlciAmJiB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJiByZXEuZ2V0VXNlcklkKCkpXG4gICkge1xuICAgIHVzZXIgPSBuZXcgUGFyc2UuVXNlcigpO1xuICAgIHVzZXIuaWQgPSByZXEuYXV0aC5pc01hc3RlciA/IHJlcS5nZXRVc2VySWQoKSA6IHJlcS5hdXRoLnVzZXIuaWQ7XG4gICAgYXdhaXQgdXNlci5mZXRjaCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGNvbnN0IHsgdXBkYXRlZE9iamVjdCB9ID0gcmVxLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIGNvbnN0IHJlcXVlc3RPYmplY3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHVuZGVmaW5lZCwgcmVxLmF1dGgsIHVwZGF0ZWRPYmplY3QsIHVzZXIsIHJlcS5jb25maWcpO1xuICAvLyBQZXJmb3JtIHZhbGlkYXRpb24gYXMgc3RlcC1ieS1zdGVwIHBpcGVsaW5lIGZvciBiZXR0ZXIgZXJyb3IgY29uc2lzdGVuY3lcbiAgLy8gYW5kIGFsc28gdG8gYXZvaWQgdG8gdHJpZ2dlciBhIHByb3ZpZGVyIChsaWtlIE9UUCBTTVMpIGlmIGFub3RoZXIgb25lIGZhaWxzXG4gIGNvbnN0IGFjYyA9IHsgYXV0aERhdGE6IHt9LCBhdXRoRGF0YVJlc3BvbnNlOiB7fSB9O1xuICBjb25zdCBhdXRoS2V5cyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5zb3J0KCk7XG4gIGZvciAoY29uc3QgcHJvdmlkZXIgb2YgYXV0aEtleXMpIHtcbiAgICBsZXQgbWV0aG9kID0gJyc7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IG51bGw7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgeyB2YWxpZGF0b3IgfSA9IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKTtcbiAgICAgIGNvbnN0IGF1dGhQcm92aWRlciA9IChyZXEuY29uZmlnLmF1dGggfHwge30pW3Byb3ZpZGVyXSB8fCB7fTtcbiAgICAgIGlmIChhdXRoUHJvdmlkZXIuZW5hYmxlZCA9PSBudWxsKSB7XG4gICAgICAgIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICAgICAgICB1c2FnZTogYFVzaW5nIHRoZSBhdXRoZW50aWNhdGlvbiBhZGFwdGVyIFwiJHtwcm92aWRlcn1cIiB3aXRob3V0IGV4cGxpY2l0bHkgZW5hYmxpbmcgaXRgLFxuICAgICAgICAgIHNvbHV0aW9uOiBgRW5hYmxlIHRoZSBhdXRoZW50aWNhdGlvbiBhZGFwdGVyIGJ5IHNldHRpbmcgdGhlIFBhcnNlIFNlcnZlciBvcHRpb24gXCJhdXRoLiR7cHJvdmlkZXJ9LmVuYWJsZWQ6IHRydWVcIi5gLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmICghdmFsaWRhdG9yIHx8IGF1dGhQcm92aWRlci5lbmFibGVkID09PSBmYWxzZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgbGV0IHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0b3IoYXV0aERhdGFbcHJvdmlkZXJdLCByZXEsIHVzZXIsIHJlcXVlc3RPYmplY3QpO1xuICAgICAgbWV0aG9kID0gdmFsaWRhdGlvblJlc3VsdCAmJiB2YWxpZGF0aW9uUmVzdWx0Lm1ldGhvZDtcbiAgICAgIHJlcXVlc3RPYmplY3QudHJpZ2dlck5hbWUgPSBtZXRob2Q7XG4gICAgICBpZiAodmFsaWRhdGlvblJlc3VsdCAmJiB2YWxpZGF0aW9uUmVzdWx0LnZhbGlkYXRvcikge1xuICAgICAgICB2YWxpZGF0aW9uUmVzdWx0ID0gYXdhaXQgdmFsaWRhdGlvblJlc3VsdC52YWxpZGF0b3IoKTtcbiAgICAgIH1cbiAgICAgIGlmICghdmFsaWRhdGlvblJlc3VsdCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICghT2JqZWN0LmtleXModmFsaWRhdGlvblJlc3VsdCkubGVuZ3RoKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZSkge1xuICAgICAgICBhY2MuYXV0aERhdGFSZXNwb25zZVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlO1xuICAgICAgfVxuICAgICAgLy8gU29tZSBhdXRoIHByb3ZpZGVycyBhZnRlciBpbml0aWFsaXphdGlvbiB3aWxsIGF2b2lkIHRvIHJlcGxhY2UgYXV0aERhdGEgYWxyZWFkeSBzdG9yZWRcbiAgICAgIGlmICghdmFsaWRhdGlvblJlc3VsdC5kb05vdFNhdmUpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IHZhbGlkYXRpb25SZXN1bHQuc2F2ZSB8fCBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVyciwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICBtZXNzYWdlOiAnQXV0aCBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgdXNlclN0cmluZyA9XG4gICAgICAgIHJlcS5hdXRoICYmIHJlcS5hdXRoLnVzZXIgPyByZXEuYXV0aC51c2VyLmlkIDogcmVxLmRhdGEub2JqZWN0SWQgfHwgdW5kZWZpbmVkO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYXV0aCBzdGVwICR7bWV0aG9kfSBmb3IgJHtwcm92aWRlcn0gZm9yIHVzZXIgJHt1c2VyU3RyaW5nfSB3aXRoIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlKSxcbiAgICAgICAge1xuICAgICAgICAgIGF1dGhlbnRpY2F0aW9uU3RlcDogbWV0aG9kLFxuICAgICAgICAgIGVycm9yOiBlLFxuICAgICAgICAgIHVzZXI6IHVzZXJTdHJpbmcsXG4gICAgICAgICAgcHJvdmlkZXIsXG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYWNjO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIEF1dGgsXG4gIG1hc3RlcixcbiAgbWFpbnRlbmFuY2UsXG4gIG5vYm9keSxcbiAgcmVhZE9ubHksXG4gIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4sXG4gIGdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4sXG4gIGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSxcbiAgaGFzTXV0YXRlZEF1dGhEYXRhLFxuICBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luLFxuICBoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24sXG59O1xuIl0sIm1hcHBpbmdzIjoiOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFvQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFOcEMsTUFBTUEsS0FBSyxHQUFHQyxPQUFPLENBQUMsWUFBWSxDQUFDO0FBUW5DO0FBQ0E7QUFDQTtBQUNBLFNBQVNDLElBQUksQ0FBQztFQUNaQyxNQUFNO0VBQ05DLGVBQWUsR0FBR0MsU0FBUztFQUMzQkMsUUFBUSxHQUFHLEtBQUs7RUFDaEJDLGFBQWEsR0FBRyxLQUFLO0VBQ3JCQyxVQUFVLEdBQUcsS0FBSztFQUNsQkMsSUFBSTtFQUNKQztBQUNGLENBQUMsRUFBRTtFQUNELElBQUksQ0FBQ1AsTUFBTSxHQUFHQSxNQUFNO0VBQ3BCLElBQUksQ0FBQ0MsZUFBZSxHQUFHQSxlQUFlLElBQUtELE1BQU0sSUFBSUEsTUFBTSxDQUFDQyxlQUFnQjtFQUM1RSxJQUFJLENBQUNNLGNBQWMsR0FBR0EsY0FBYztFQUNwQyxJQUFJLENBQUNKLFFBQVEsR0FBR0EsUUFBUTtFQUN4QixJQUFJLENBQUNDLGFBQWEsR0FBR0EsYUFBYTtFQUNsQyxJQUFJLENBQUNFLElBQUksR0FBR0EsSUFBSTtFQUNoQixJQUFJLENBQUNELFVBQVUsR0FBR0EsVUFBVTs7RUFFNUI7RUFDQTtFQUNBLElB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