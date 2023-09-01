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
        const query = await (0, _RestQuery.default)({
          method: _RestQuery.default.Method.get,
          config,
          auth: master(config),
          runBeforeFind: false,
          className: '_Session',
          restWhere: {
            sessionToken
          },
          restOptions: {
            limit: 1
          }
        });
        const {
          results
        } = await query.execute();
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
    const query = await RestQuery({
      method: RestQuery.Method.get,
      config,
      runBeforeFind: false,
      auth: master(config),
      className: '_Session',
      restWhere: {
        sessionToken
      },
      restOptions
    });
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
var getAuthForLegacySessionToken = async function ({
  config,
  sessionToken,
  installationId
}) {
  var restOptions = {
    limit: 1
  };
  const RestQuery = require('./RestQuery');
  var query = await RestQuery({
    method: RestQuery.Method.get,
    config,
    runBeforeFind: false,
    auth: master(config),
    className: '_User',
    restWhere: {
      _session_token: sessionToken
    },
    restOptions
  });
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
    const query = await RestQuery({
      method: RestQuery.Method.find,
      runBeforeFind: false,
      config: this.config,
      auth: master(this.config),
      className: '_Role',
      restWhere
    });
    await query.each(result => results.push(result));
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
    const query = await RestQuery({
      method: RestQuery.Method.find,
      config: this.config,
      runBeforeFind: false,
      auth: master(this.config),
      className: '_Role',
      restWhere
    });
    await query.each(result => results.push(result));
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJBdXRoIiwiY29uZmlnIiwiY2FjaGVDb250cm9sbGVyIiwidW5kZWZpbmVkIiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwiaXNSZWFkT25seSIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsInVzZXJSb2xlcyIsImZldGNoZWRSb2xlcyIsInJvbGVQcm9taXNlIiwicHJvdG90eXBlIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJtYXN0ZXIiLCJtYWludGVuYW5jZSIsInJlYWRPbmx5Iiwibm9ib2R5IiwidGhyb3R0bGUiLCJyZW5ld1Nlc3Npb25JZk5lZWRlZCIsInNlc3Npb24iLCJzZXNzaW9uVG9rZW4iLCJleHRlbmRTZXNzaW9uT25Vc2UiLCJjbGVhclRpbWVvdXQiLCJzZXRUaW1lb3V0IiwicXVlcnkiLCJSZXN0UXVlcnkiLCJtZXRob2QiLCJNZXRob2QiLCJnZXQiLCJhdXRoIiwicnVuQmVmb3JlRmluZCIsImNsYXNzTmFtZSIsInJlc3RXaGVyZSIsInJlc3RPcHRpb25zIiwibGltaXQiLCJyZXN1bHRzIiwiZXhlY3V0ZSIsImxhc3RVcGRhdGVkIiwiRGF0ZSIsInVwZGF0ZWRBdCIsInllc3RlcmRheSIsInNldERhdGUiLCJnZXREYXRlIiwiZXhwaXJlc0F0IiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiUmVzdFdyaXRlIiwib2JqZWN0SWQiLCJfZW5jb2RlIiwiZSIsImNvZGUiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJsb2dnZXIiLCJlcnJvciIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJ1c2VySlNPTiIsImNhY2hlZFVzZXIiLCJPYmplY3QiLCJmcm9tSlNPTiIsIlByb21pc2UiLCJyZXNvbHZlIiwiaW5jbHVkZSIsIlF1ZXJ5IiwiU2Vzc2lvbiIsImVxdWFsVG8iLCJmaW5kIiwidXNlTWFzdGVyS2V5IiwibWFwIiwib2JqIiwidG9KU09OIiwibGVuZ3RoIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwibm93IiwiaXNvIiwicGFzc3dvcmQiLCJwdXQiLCJ1c2VyT2JqZWN0IiwiZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiIsIl9zZXNzaW9uX3Rva2VuIiwidGhlbiIsInJlc3BvbnNlIiwiZ2V0VXNlclJvbGVzIiwiX2xvYWRSb2xlcyIsImdldFJvbGVzRm9yVXNlciIsInVzZXJzIiwiX190eXBlIiwiaWQiLCJlYWNoIiwicmVzdWx0IiwicHVzaCIsIlJvbGUiLCJjYWNoZWRSb2xlcyIsInJvbGUiLCJjYWNoZVJvbGVzIiwicm9sZXNNYXAiLCJyZWR1Y2UiLCJtIiwiciIsIm5hbWVzIiwibmFtZSIsImlkcyIsInJvbGVOYW1lcyIsIl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyIsIkFycmF5IiwiY2xlYXJSb2xlQ2FjaGUiLCJkZWwiLCJnZXRSb2xlc0J5SWRzIiwiaW5zIiwiY29udGFpbmVkSW4iLCJyb2xlcyIsIiRpbiIsInJvbGVJRHMiLCJxdWVyaWVkUm9sZXMiLCJmaWx0ZXIiLCJyb2xlSUQiLCJ3YXNRdWVyaWVkIiwiU2V0IiwicmVzdWx0TWFwIiwibWVtbyIsImNvbmNhdCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsImF1dGhEYXRhIiwicHJvdmlkZXJzIiwia2V5cyIsInByb3ZpZGVyIiwicXVlcnlLZXkiLCJxIiwiZGF0YWJhc2UiLCIkb3IiLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJ1c2VyQXV0aERhdGEiLCJtdXRhdGVkQXV0aERhdGEiLCJmb3JFYWNoIiwicHJvdmlkZXJEYXRhIiwidXNlclByb3ZpZGVyQXV0aERhdGEiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJyZXEiLCJzYXZlZFVzZXJQcm92aWRlcnMiLCJhZGFwdGVyIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIiLCJzb21lIiwicG9saWN5IiwiYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCIsImhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciIsInJlcXVlc3RPYmplY3QiLCJpcCIsImNhbGwiLCJPVEhFUl9DQVVTRSIsImpvaW4iLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJmb3VuZFVzZXIiLCJVc2VyIiwiZ2V0VXNlcklkIiwiZmV0Y2giLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRQYXJzZU9iamVjdHMiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiYWNjIiwiYXV0aERhdGFSZXNwb25zZSIsImF1dGhLZXlzIiwic29ydCIsInZhbGlkYXRvciIsImF1dGhQcm92aWRlciIsImVuYWJsZWQiLCJEZXByZWNhdG9yIiwibG9nUnVudGltZURlcHJlY2F0aW9uIiwidXNhZ2UiLCJzb2x1dGlvbiIsIlVOU1VQUE9SVEVEX1NFUlZJQ0UiLCJ2YWxpZGF0aW9uUmVzdWx0IiwidHJpZ2dlck5hbWUiLCJkb05vdFNhdmUiLCJzYXZlIiwiZXJyIiwicmVzb2x2ZUVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VyU3RyaW5nIiwiZGF0YSIsIkpTT04iLCJzdHJpbmdpZnkiLCJhdXRoZW50aWNhdGlvblN0ZXAiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL0F1dGguanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgZ2V0UmVxdWVzdE9iamVjdCwgcmVzb2x2ZUVycm9yIH0gZnJvbSAnLi90cmlnZ2Vycyc7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgUmVzdFF1ZXJ5IGZyb20gJy4vUmVzdFF1ZXJ5JztcbmltcG9ydCBSZXN0V3JpdGUgZnJvbSAnLi9SZXN0V3JpdGUnO1xuXG4vLyBBbiBBdXRoIG9iamVjdCB0ZWxscyB5b3Ugd2hvIGlzIHJlcXVlc3Rpbmcgc29tZXRoaW5nIGFuZCB3aGV0aGVyXG4vLyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbi8vIHVzZXJPYmplY3QgaXMgYSBQYXJzZS5Vc2VyIGFuZCBjYW4gYmUgbnVsbCBpZiB0aGVyZSdzIG5vIHVzZXIuXG5mdW5jdGlvbiBBdXRoKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIgPSB1bmRlZmluZWQsXG4gIGlzTWFzdGVyID0gZmFsc2UsXG4gIGlzTWFpbnRlbmFuY2UgPSBmYWxzZSxcbiAgaXNSZWFkT25seSA9IGZhbHNlLFxuICB1c2VyLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIHRoaXMuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgdGhpcy5pc01hc3RlciA9IGlzTWFzdGVyO1xuICB0aGlzLmlzTWFpbnRlbmFuY2UgPSBpc01haW50ZW5hbmNlO1xuICB0aGlzLnVzZXIgPSB1c2VyO1xuICB0aGlzLmlzUmVhZE9ubHkgPSBpc1JlYWRPbmx5O1xuXG4gIC8vIEFzc3VtaW5nIGEgdXNlcnMgcm9sZXMgd29uJ3QgY2hhbmdlIGR1cmluZyBhIHNpbmdsZSByZXF1ZXN0LCB3ZSdsbFxuICAvLyBvbmx5IGxvYWQgdGhlbSBvbmNlLlxuICB0aGlzLnVzZXJSb2xlcyA9IFtdO1xuICB0aGlzLmZldGNoZWRSb2xlcyA9IGZhbHNlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbn1cblxuLy8gV2hldGhlciB0aGlzIGF1dGggY291bGQgcG9zc2libHkgbW9kaWZ5IHRoZSBnaXZlbiB1c2VyIGlkLlxuLy8gSXQgc3RpbGwgY291bGQgYmUgZm9yYmlkZGVuIHZpYSBBQ0xzIGV2ZW4gaWYgdGhpcyByZXR1cm5zIHRydWUuXG5BdXRoLnByb3RvdHlwZS5pc1VuYXV0aGVudGljYXRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHRoaXMuaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBtYXN0ZXIoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1haW50ZW5hbmNlLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBtYWludGVuYW5jZShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01haW50ZW5hbmNlOiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYXN0ZXItbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIHJlYWRPbmx5KGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlLCBpc1JlYWRPbmx5OiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBub2JvZHktbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG5vYm9keShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogZmFsc2UgfSk7XG59XG5cbmNvbnN0IHRocm90dGxlID0ge307XG5jb25zdCByZW5ld1Nlc3Npb25JZk5lZWRlZCA9IGFzeW5jICh7IGNvbmZpZywgc2Vzc2lvbiwgc2Vzc2lvblRva2VuIH0pID0+IHtcbiAgaWYgKCFjb25maWc/LmV4dGVuZFNlc3Npb25PblVzZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjbGVhclRpbWVvdXQodGhyb3R0bGVbc2Vzc2lvblRva2VuXSk7XG4gIHRocm90dGxlW3Nlc3Npb25Ub2tlbl0gPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZ2V0LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoOiBtYXN0ZXIoY29uZmlnKSxcbiAgICAgICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgICAgICBjbGFzc05hbWU6ICdfU2Vzc2lvbicsXG4gICAgICAgICAgcmVzdFdoZXJlOiB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICAgIHJlc3RPcHRpb25zOiB7IGxpbWl0OiAxIH0sXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKTtcbiAgICAgICAgc2Vzc2lvbiA9IHJlc3VsdHNbMF07XG4gICAgICB9XG4gICAgICBjb25zdCBsYXN0VXBkYXRlZCA9IG5ldyBEYXRlKHNlc3Npb24/LnVwZGF0ZWRBdCk7XG4gICAgICBjb25zdCB5ZXN0ZXJkYXkgPSBuZXcgRGF0ZSgpO1xuICAgICAgeWVzdGVyZGF5LnNldERhdGUoeWVzdGVyZGF5LmdldERhdGUoKSAtIDEpO1xuICAgICAgaWYgKGxhc3RVcGRhdGVkID4geWVzdGVyZGF5IHx8ICFzZXNzaW9uKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKTtcbiAgICAgIGF3YWl0IG5ldyBSZXN0V3JpdGUoXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgbWFzdGVyKGNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHNlc3Npb24ub2JqZWN0SWQgfSxcbiAgICAgICAgeyBleHBpcmVzQXQ6IFBhcnNlLl9lbmNvZGUoZXhwaXJlc0F0KSB9XG4gICAgICApLmV4ZWN1dGUoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZT8uY29kZSAhPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0NvdWxkIG5vdCB1cGRhdGUgc2Vzc2lvbiBleHBpcnk6ICcsIGUpO1xuICAgICAgfVxuICAgIH1cbiAgfSwgNTAwKTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gQXV0aCBvYmplY3RcbmNvbnN0IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoe1xuICBjb25maWcsXG4gIGNhY2hlQ29udHJvbGxlcixcbiAgc2Vzc2lvblRva2VuLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjb25zdCB1c2VySlNPTiA9IGF3YWl0IGNhY2hlQ29udHJvbGxlci51c2VyLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmICh1c2VySlNPTikge1xuICAgICAgY29uc3QgY2FjaGVkVXNlciA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTih1c2VySlNPTik7XG4gICAgICByZW5ld1Nlc3Npb25JZk5lZWRlZCh7IGNvbmZpZywgc2Vzc2lvblRva2VuIH0pO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgbmV3IEF1dGgoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgICAgIHVzZXI6IGNhY2hlZFVzZXIsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGxldCByZXN1bHRzO1xuICBpZiAoY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdE9wdGlvbnMgPSB7XG4gICAgICBsaW1pdDogMSxcbiAgICAgIGluY2x1ZGU6ICd1c2VyJyxcbiAgICB9O1xuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgYXV0aDogbWFzdGVyKGNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfU2Vzc2lvbicsXG4gICAgICByZXN0V2hlcmU6IHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICByZXN0T3B0aW9ucyxcbiAgICB9KTtcbiAgICByZXN1bHRzID0gKGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKSkucmVzdWx0cztcbiAgfSBlbHNlIHtcbiAgICByZXN1bHRzID0gKFxuICAgICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlNlc3Npb24pXG4gICAgICAgIC5saW1pdCgxKVxuICAgICAgICAuaW5jbHVkZSgndXNlcicpXG4gICAgICAgIC5lcXVhbFRvKCdzZXNzaW9uVG9rZW4nLCBzZXNzaW9uVG9rZW4pXG4gICAgICAgIC5maW5kKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pXG4gICAgKS5tYXAob2JqID0+IG9iai50b0pTT04oKSk7XG4gIH1cblxuICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEgfHwgIXJlc3VsdHNbMF1bJ3VzZXInXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgfVxuICBjb25zdCBzZXNzaW9uID0gcmVzdWx0c1swXTtcbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKSxcbiAgICBleHBpcmVzQXQgPSBzZXNzaW9uLmV4cGlyZXNBdCA/IG5ldyBEYXRlKHNlc3Npb24uZXhwaXJlc0F0LmlzbykgOiB1bmRlZmluZWQ7XG4gIGlmIChleHBpcmVzQXQgPCBub3cpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnU2Vzc2lvbiB0b2tlbiBpcyBleHBpcmVkLicpO1xuICB9XG4gIGNvbnN0IG9iaiA9IHNlc3Npb24udXNlcjtcbiAgZGVsZXRlIG9iai5wYXNzd29yZDtcbiAgb2JqWydjbGFzc05hbWUnXSA9ICdfVXNlcic7XG4gIG9ialsnc2Vzc2lvblRva2VuJ10gPSBzZXNzaW9uVG9rZW47XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjYWNoZUNvbnRyb2xsZXIudXNlci5wdXQoc2Vzc2lvblRva2VuLCBvYmopO1xuICB9XG4gIHJlbmV3U2Vzc2lvbklmTmVlZGVkKHsgY29uZmlnLCBzZXNzaW9uLCBzZXNzaW9uVG9rZW4gfSk7XG4gIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICBjb25maWcsXG4gICAgY2FjaGVDb250cm9sbGVyLFxuICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICBpbnN0YWxsYXRpb25JZCxcbiAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICB9KTtcbn07XG5cbnZhciBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKHsgY29uZmlnLCBzZXNzaW9uVG9rZW4sIGluc3RhbGxhdGlvbklkIH0pIHtcbiAgdmFyIHJlc3RPcHRpb25zID0ge1xuICAgIGxpbWl0OiAxLFxuICB9O1xuICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICB2YXIgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgY29uZmlnLFxuICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgIGF1dGg6IG1hc3Rlcihjb25maWcpLFxuICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICByZXN0V2hlcmU6IHsgX3Nlc3Npb25fdG9rZW46IHNlc3Npb25Ub2tlbiB9LFxuICAgIHJlc3RPcHRpb25zLFxuICB9KTtcbiAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB2YXIgcmVzdWx0cyA9IHJlc3BvbnNlLnJlc3VsdHM7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnaW52YWxpZCBsZWdhY3kgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBvYmogPSByZXN1bHRzWzBdO1xuICAgIG9iai5jbGFzc05hbWUgPSAnX1VzZXInO1xuICAgIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgICByZXR1cm4gbmV3IEF1dGgoe1xuICAgICAgY29uZmlnLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2Ygcm9sZSBuYW1lc1xuQXV0aC5wcm90b3R5cGUuZ2V0VXNlclJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3RlciB8fCB0aGlzLmlzTWFpbnRlbmFuY2UgfHwgIXRoaXMudXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG4gIGlmICh0aGlzLmZldGNoZWRSb2xlcykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy51c2VyUm9sZXMpO1xuICB9XG4gIGlmICh0aGlzLnJvbGVQcm9taXNlKSB7XG4gICAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG4gIH1cbiAgdGhpcy5yb2xlUHJvbWlzZSA9IHRoaXMuX2xvYWRSb2xlcygpO1xuICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzRm9yVXNlciA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy9TdGFjayBhbGwgUGFyc2UuUm9sZVxuICBjb25zdCByZXN1bHRzID0gW107XG4gIGlmICh0aGlzLmNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHtcbiAgICAgIHVzZXJzOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLnVzZXIuaWQsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIGF1dGg6IG1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICByZXN0V2hlcmUsXG4gICAgfSk7XG4gICAgYXdhaXQgcXVlcnkuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdCkpO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmVxdWFsVG8oJ3VzZXJzJywgdGhpcy51c2VyKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEl0ZXJhdGVzIHRocm91Z2ggdGhlIHJvbGUgdHJlZSBhbmQgY29tcGlsZXMgYSB1c2VyJ3Mgcm9sZXNcbkF1dGgucHJvdG90eXBlLl9sb2FkUm9sZXMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IGNhY2hlZFJvbGVzID0gYXdhaXQgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5nZXQodGhpcy51c2VyLmlkKTtcbiAgICBpZiAoY2FjaGVkUm9sZXMgIT0gbnVsbCkge1xuICAgICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgICAgdGhpcy51c2VyUm9sZXMgPSBjYWNoZWRSb2xlcztcbiAgICAgIHJldHVybiBjYWNoZWRSb2xlcztcbiAgICB9XG4gIH1cblxuICAvLyBGaXJzdCBnZXQgdGhlIHJvbGUgaWRzIHRoaXMgdXNlciBpcyBkaXJlY3RseSBhIG1lbWJlciBvZlxuICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRSb2xlc0ZvclVzZXIoKTtcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIHRoaXMudXNlclJvbGVzID0gW107XG4gICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xuXG4gICAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gICAgcmV0dXJuIHRoaXMudXNlclJvbGVzO1xuICB9XG5cbiAgY29uc3Qgcm9sZXNNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAobSwgcikgPT4ge1xuICAgICAgbS5uYW1lcy5wdXNoKHIubmFtZSk7XG4gICAgICBtLmlkcy5wdXNoKHIub2JqZWN0SWQpO1xuICAgICAgcmV0dXJuIG07XG4gICAgfSxcbiAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICk7XG5cbiAgLy8gcnVuIHRoZSByZWN1cnNpdmUgZmluZGluZ1xuICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyb2xlc01hcC5pZHMsIHJvbGVzTWFwLm5hbWVzKTtcbiAgdGhpcy51c2VyUm9sZXMgPSByb2xlTmFtZXMubWFwKHIgPT4ge1xuICAgIHJldHVybiAncm9sZTonICsgcjtcbiAgfSk7XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG4gIHRoaXMuY2FjaGVSb2xlcygpO1xuICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jYWNoZVJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUucHV0KHRoaXMudXNlci5pZCwgQXJyYXkoLi4udGhpcy51c2VyUm9sZXMpKTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jbGVhclJvbGVDYWNoZSA9IGZ1bmN0aW9uIChzZXNzaW9uVG9rZW4pIHtcbiAgaWYgKCF0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmRlbCh0aGlzLnVzZXIuaWQpO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlci51c2VyLmRlbChzZXNzaW9uVG9rZW4pO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzQnlJZHMgPSBhc3luYyBmdW5jdGlvbiAoaW5zKSB7XG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgLy8gQnVpbGQgYW4gT1IgcXVlcnkgYWNyb3NzIGFsbCBwYXJlbnRSb2xlc1xuICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuY29udGFpbmVkSW4oXG4gICAgICAgICdyb2xlcycsXG4gICAgICAgIGlucy5tYXAoaWQgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvbGUgPSBuZXcgUGFyc2UuT2JqZWN0KFBhcnNlLlJvbGUpO1xuICAgICAgICAgIHJvbGUuaWQgPSBpZDtcbiAgICAgICAgICByZXR1cm4gcm9sZTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0LnRvSlNPTigpKSwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgcm9sZXMgPSBpbnMubWFwKGlkID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgIH07XG4gICAgfSk7XG4gICAgY29uc3QgcmVzdFdoZXJlID0geyByb2xlczogeyAkaW46IHJvbGVzIH0gfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgYXV0aDogbWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19Sb2xlJyxcbiAgICAgIHJlc3RXaGVyZSxcbiAgICB9KTtcbiAgICBhd2FpdCBxdWVyeS5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0KSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59O1xuXG4vLyBHaXZlbiBhIGxpc3Qgb2Ygcm9sZUlkcywgZmluZCBhbGwgdGhlIHBhcmVudCByb2xlcywgcmV0dXJucyBhIHByb21pc2Ugd2l0aCBhbGwgbmFtZXNcbkF1dGgucHJvdG90eXBlLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyA9IGZ1bmN0aW9uIChyb2xlSURzLCBuYW1lcyA9IFtdLCBxdWVyaWVkUm9sZXMgPSB7fSkge1xuICBjb25zdCBpbnMgPSByb2xlSURzLmZpbHRlcihyb2xlSUQgPT4ge1xuICAgIGNvbnN0IHdhc1F1ZXJpZWQgPSBxdWVyaWVkUm9sZXNbcm9sZUlEXSAhPT0gdHJ1ZTtcbiAgICBxdWVyaWVkUm9sZXNbcm9sZUlEXSA9IHRydWU7XG4gICAgcmV0dXJuIHdhc1F1ZXJpZWQ7XG4gIH0pO1xuXG4gIC8vIGFsbCByb2xlcyBhcmUgYWNjb3VudGVkIGZvciwgcmV0dXJuIHRoZSBuYW1lc1xuICBpZiAoaW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLmdldFJvbGVzQnlJZHMoaW5zKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gTm90aGluZyBmb3VuZFxuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5hbWVzKTtcbiAgICAgIH1cbiAgICAgIC8vIE1hcCB0aGUgcmVzdWx0cyB3aXRoIGFsbCBJZHMgYW5kIG5hbWVzXG4gICAgICBjb25zdCByZXN1bHRNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAgICAgKG1lbW8sIHJvbGUpID0+IHtcbiAgICAgICAgICBtZW1vLm5hbWVzLnB1c2gocm9sZS5uYW1lKTtcbiAgICAgICAgICBtZW1vLmlkcy5wdXNoKHJvbGUub2JqZWN0SWQpO1xuICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICB9LFxuICAgICAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICAgICApO1xuICAgICAgLy8gc3RvcmUgdGhlIG5ldyBmb3VuZCBuYW1lc1xuICAgICAgbmFtZXMgPSBuYW1lcy5jb25jYXQocmVzdWx0TWFwLm5hbWVzKTtcbiAgICAgIC8vIGZpbmQgdGhlIG5leHQgb25lcywgY2lyY3VsYXIgcm9sZXMgd2lsbCBiZSBjdXRcbiAgICAgIHJldHVybiB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyZXN1bHRNYXAuaWRzLCBuYW1lcywgcXVlcmllZFJvbGVzKTtcbiAgICB9KVxuICAgIC50aGVuKG5hbWVzID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoWy4uLm5ldyBTZXQobmFtZXMpXSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBmaW5kVXNlcnNXaXRoQXV0aERhdGEgPSAoY29uZmlnLCBhdXRoRGF0YSkgPT4ge1xuICBjb25zdCBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGNvbnN0IHF1ZXJ5ID0gcHJvdmlkZXJzXG4gICAgLnJlZHVjZSgobWVtbywgcHJvdmlkZXIpID0+IHtcbiAgICAgIGlmICghYXV0aERhdGFbcHJvdmlkZXJdIHx8IChhdXRoRGF0YSAmJiAhYXV0aERhdGFbcHJvdmlkZXJdLmlkKSkge1xuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHF1ZXJ5S2V5ID0gYGF1dGhEYXRhLiR7cHJvdmlkZXJ9LmlkYDtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0ge307XG4gICAgICBxdWVyeVtxdWVyeUtleV0gPSBhdXRoRGF0YVtwcm92aWRlcl0uaWQ7XG4gICAgICBtZW1vLnB1c2gocXVlcnkpO1xuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfSwgW10pXG4gICAgLmZpbHRlcihxID0+IHtcbiAgICAgIHJldHVybiB0eXBlb2YgcSAhPT0gJ3VuZGVmaW5lZCc7XG4gICAgfSk7XG5cbiAgcmV0dXJuIHF1ZXJ5Lmxlbmd0aCA+IDBcbiAgICA/IGNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgJG9yOiBxdWVyeSB9LCB7IGxpbWl0OiAyIH0pXG4gICAgOiBQcm9taXNlLnJlc29sdmUoW10pO1xufTtcblxuY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gKGF1dGhEYXRhLCB1c2VyQXV0aERhdGEpID0+IHtcbiAgaWYgKCF1c2VyQXV0aERhdGEpIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YTogdHJ1ZSwgbXV0YXRlZEF1dGhEYXRhOiBhdXRoRGF0YSB9O1xuICBjb25zdCBtdXRhdGVkQXV0aERhdGEgPSB7fTtcbiAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgIC8vIEFub255bW91cyBwcm92aWRlciBpcyBub3QgaGFuZGxlZCB0aGlzIHdheVxuICAgIGlmIChwcm92aWRlciA9PT0gJ2Fub255bW91cycpIHJldHVybjtcbiAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgY29uc3QgdXNlclByb3ZpZGVyQXV0aERhdGEgPSB1c2VyQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGlmICghaXNEZWVwU3RyaWN0RXF1YWwocHJvdmlkZXJEYXRhLCB1c2VyUHJvdmlkZXJBdXRoRGF0YSkpIHtcbiAgICAgIG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl0gPSBwcm92aWRlckRhdGE7XG4gICAgfVxuICB9KTtcbiAgY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5sZW5ndGggIT09IDA7XG4gIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YSwgbXV0YXRlZEF1dGhEYXRhIH07XG59O1xuXG5jb25zdCBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luID0gKFxuICByZXEgPSB7fSxcbiAgYXV0aERhdGEgPSB7fSxcbiAgdXNlckF1dGhEYXRhID0ge30sXG4gIGNvbmZpZ1xuKSA9PiB7XG4gIGNvbnN0IHNhdmVkVXNlclByb3ZpZGVycyA9IE9iamVjdC5rZXlzKHVzZXJBdXRoRGF0YSkubWFwKHByb3ZpZGVyID0+ICh7XG4gICAgbmFtZTogcHJvdmlkZXIsXG4gICAgYWRhcHRlcjogY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcikuYWRhcHRlcixcbiAgfSkpO1xuXG4gIGNvbnN0IGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlciA9IHNhdmVkVXNlclByb3ZpZGVycy5zb21lKFxuICAgIHByb3ZpZGVyID0+XG4gICAgICBwcm92aWRlciAmJiBwcm92aWRlci5hZGFwdGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIucG9saWN5ID09PSAnc29sbycgJiYgYXV0aERhdGFbcHJvdmlkZXIubmFtZV1cbiAgKTtcblxuICAvLyBTb2xvIHByb3ZpZGVycyBjYW4gYmUgY29uc2lkZXJlZCBhcyBzYWZlLCBzbyB3ZSBkbyBub3QgaGF2ZSB0byBjaGVjayBpZiB0aGUgdXNlciBuZWVkc1xuICAvLyB0byBwcm92aWRlIGFuIGFkZGl0aW9uYWwgcHJvdmlkZXIgdG8gbG9naW4uIEFuIGF1dGggYWRhcHRlciB3aXRoIFwic29sb1wiIChsaWtlIHdlYmF1dGhuKSBtZWFuc1xuICAvLyBubyBcImFkZGl0aW9uYWxcIiBhdXRoIG5lZWRzIHRvIGJlIHByb3ZpZGVkIHRvIGxvZ2luIChsaWtlIE9UUCwgTUZBKVxuICBpZiAoaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCA9IFtdO1xuICBjb25zdCBoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShwcm92aWRlciA9PiB7XG4gICAgbGV0IHBvbGljeSA9IHByb3ZpZGVyLmFkYXB0ZXIucG9saWN5O1xuICAgIGlmICh0eXBlb2YgcG9saWN5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb25zdCByZXF1ZXN0T2JqZWN0ID0ge1xuICAgICAgICBpcDogcmVxLmNvbmZpZy5pcCxcbiAgICAgICAgdXNlcjogcmVxLmF1dGgudXNlcixcbiAgICAgICAgbWFzdGVyOiByZXEuYXV0aC5pc01hc3RlcixcbiAgICAgIH07XG4gICAgICBwb2xpY3kgPSBwb2xpY3kuY2FsbChwcm92aWRlci5hZGFwdGVyLCByZXF1ZXN0T2JqZWN0LCB1c2VyQXV0aERhdGFbcHJvdmlkZXIubmFtZV0pO1xuICAgIH1cbiAgICBpZiAocG9saWN5ID09PSAnYWRkaXRpb25hbCcpIHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlci5uYW1lXSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFB1c2ggbWlzc2luZyBwcm92aWRlciBmb3IgZXJyb3IgbWVzc2FnZVxuICAgICAgICBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLnB1c2gocHJvdmlkZXIubmFtZSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgaWYgKGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciB8fCAhYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5sZW5ndGgpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgYE1pc3NpbmcgYWRkaXRpb25hbCBhdXRoRGF0YSAke2FkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQuam9pbignLCcpfWBcbiAgKTtcbn07XG5cbi8vIFZhbGlkYXRlIGVhY2ggYXV0aERhdGEgc3RlcC1ieS1zdGVwIGFuZCByZXR1cm4gdGhlIHByb3ZpZGVyIHJlc3BvbnNlc1xuY29uc3QgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uID0gYXN5bmMgKGF1dGhEYXRhLCByZXEsIGZvdW5kVXNlcikgPT4ge1xuICBsZXQgdXNlcjtcbiAgaWYgKGZvdW5kVXNlcikge1xuICAgIHVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5mb3VuZFVzZXIgfSk7XG4gICAgLy8gRmluZCB1c2VyIGJ5IHNlc3Npb24gYW5kIGN1cnJlbnQgb2JqZWN0SWQ7IG9ubHkgcGFzcyB1c2VyIGlmIGl0J3MgdGhlIGN1cnJlbnQgdXNlciBvciBtYXN0ZXIga2V5IGlzIHByb3ZpZGVkXG4gIH0gZWxzZSBpZiAoXG4gICAgKHJlcS5hdXRoICYmXG4gICAgICByZXEuYXV0aC51c2VyICYmXG4gICAgICB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgcmVxLmdldFVzZXJJZCgpID09PSByZXEuYXV0aC51c2VyLmlkKSB8fFxuICAgIChyZXEuYXV0aCAmJiByZXEuYXV0aC5pc01hc3RlciAmJiB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJiByZXEuZ2V0VXNlcklkKCkpXG4gICkge1xuICAgIHVzZXIgPSBuZXcgUGFyc2UuVXNlcigpO1xuICAgIHVzZXIuaWQgPSByZXEuYXV0aC5pc01hc3RlciA/IHJlcS5nZXRVc2VySWQoKSA6IHJlcS5hdXRoLnVzZXIuaWQ7XG4gICAgYXdhaXQgdXNlci5mZXRjaCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGNvbnN0IHsgdXBkYXRlZE9iamVjdCB9ID0gcmVxLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIGNvbnN0IHJlcXVlc3RPYmplY3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHVuZGVmaW5lZCwgcmVxLmF1dGgsIHVwZGF0ZWRPYmplY3QsIHVzZXIsIHJlcS5jb25maWcpO1xuICAvLyBQZXJmb3JtIHZhbGlkYXRpb24gYXMgc3RlcC1ieS1zdGVwIHBpcGVsaW5lIGZvciBiZXR0ZXIgZXJyb3IgY29uc2lzdGVuY3lcbiAgLy8gYW5kIGFsc28gdG8gYXZvaWQgdG8gdHJpZ2dlciBhIHByb3ZpZGVyIChsaWtlIE9UUCBTTVMpIGlmIGFub3RoZXIgb25lIGZhaWxzXG4gIGNvbnN0IGFjYyA9IHsgYXV0aERhdGE6IHt9LCBhdXRoRGF0YVJlc3BvbnNlOiB7fSB9O1xuICBjb25zdCBhdXRoS2V5cyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5zb3J0KCk7XG4gIGZvciAoY29uc3QgcHJvdmlkZXIgb2YgYXV0aEtleXMpIHtcbiAgICBsZXQgbWV0aG9kID0gJyc7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IG51bGw7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgeyB2YWxpZGF0b3IgfSA9IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKTtcbiAgICAgIGNvbnN0IGF1dGhQcm92aWRlciA9IChyZXEuY29uZmlnLmF1dGggfHwge30pW3Byb3ZpZGVyXSB8fCB7fTtcbiAgICAgIGlmIChhdXRoUHJvdmlkZXIuZW5hYmxlZCA9PSBudWxsKSB7XG4gICAgICAgIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICAgICAgICB1c2FnZTogYFVzaW5nIHRoZSBhdXRoZW50aWNhdGlvbiBhZGFwdGVyIFwiJHtwcm92aWRlcn1cIiB3aXRob3V0IGV4cGxpY2l0bHkgZW5hYmxpbmcgaXRgLFxuICAgICAgICAgIHNvbHV0aW9uOiBgRW5hYmxlIHRoZSBhdXRoZW50aWNhdGlvbiBhZGFwdGVyIGJ5IHNldHRpbmcgdGhlIFBhcnNlIFNlcnZlciBvcHRpb24gXCJhdXRoLiR7cHJvdmlkZXJ9LmVuYWJsZWQ6IHRydWVcIi5gLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmICghdmFsaWRhdG9yIHx8IGF1dGhQcm92aWRlci5lbmFibGVkID09PSBmYWxzZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgbGV0IHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0b3IoYXV0aERhdGFbcHJvdmlkZXJdLCByZXEsIHVzZXIsIHJlcXVlc3RPYmplY3QpO1xuICAgICAgbWV0aG9kID0gdmFsaWRhdGlvblJlc3VsdCAmJiB2YWxpZGF0aW9uUmVzdWx0Lm1ldGhvZDtcbiAgICAgIHJlcXVlc3RPYmplY3QudHJpZ2dlck5hbWUgPSBtZXRob2Q7XG4gICAgICBpZiAodmFsaWRhdGlvblJlc3VsdCAmJiB2YWxpZGF0aW9uUmVzdWx0LnZhbGlkYXRvcikge1xuICAgICAgICB2YWxpZGF0aW9uUmVzdWx0ID0gYXdhaXQgdmFsaWRhdGlvblJlc3VsdC52YWxpZGF0b3IoKTtcbiAgICAgIH1cbiAgICAgIGlmICghdmFsaWRhdGlvblJlc3VsdCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICghT2JqZWN0LmtleXModmFsaWRhdGlvblJlc3VsdCkubGVuZ3RoKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZSkge1xuICAgICAgICBhY2MuYXV0aERhdGFSZXNwb25zZVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlO1xuICAgICAgfVxuICAgICAgLy8gU29tZSBhdXRoIHByb3ZpZGVycyBhZnRlciBpbml0aWFsaXphdGlvbiB3aWxsIGF2b2lkIHRvIHJlcGxhY2UgYXV0aERhdGEgYWxyZWFkeSBzdG9yZWRcbiAgICAgIGlmICghdmFsaWRhdGlvblJlc3VsdC5kb05vdFNhdmUpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IHZhbGlkYXRpb25SZXN1bHQuc2F2ZSB8fCBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVyciwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICBtZXNzYWdlOiAnQXV0aCBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgdXNlclN0cmluZyA9XG4gICAgICAgIHJlcS5hdXRoICYmIHJlcS5hdXRoLnVzZXIgPyByZXEuYXV0aC51c2VyLmlkIDogcmVxLmRhdGEub2JqZWN0SWQgfHwgdW5kZWZpbmVkO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYXV0aCBzdGVwICR7bWV0aG9kfSBmb3IgJHtwcm92aWRlcn0gZm9yIHVzZXIgJHt1c2VyU3RyaW5nfSB3aXRoIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlKSxcbiAgICAgICAge1xuICAgICAgICAgIGF1dGhlbnRpY2F0aW9uU3RlcDogbWV0aG9kLFxuICAgICAgICAgIGVycm9yOiBlLFxuICAgICAgICAgIHVzZXI6IHVzZXJTdHJpbmcsXG4gICAgICAgICAgcHJvdmlkZXIsXG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYWNjO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIEF1dGgsXG4gIG1hc3RlcixcbiAgbWFpbnRlbmFuY2UsXG4gIG5vYm9keSxcbiAgcmVhZE9ubHksXG4gIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4sXG4gIGdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4sXG4gIGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSxcbiAgaGFzTXV0YXRlZEF1dGhEYXRhLFxuICBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luLFxuICBoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24sXG59O1xuIl0sIm1hcHBpbmdzIjoiOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFvQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFOcEMsTUFBTUEsS0FBSyxHQUFHQyxPQUFPLENBQUMsWUFBWSxDQUFDO0FBUW5DO0FBQ0E7QUFDQTtBQUNBLFNBQVNDLElBQUksQ0FBQztFQUNaQyxNQUFNO0VBQ05DLGVBQWUsR0FBR0MsU0FBUztFQUMzQkMsUUFBUSxHQUFHLEtBQUs7RUFDaEJDLGFBQWEsR0FBRyxLQUFLO0VBQ3JCQyxVQUFVLEdBQUcsS0FBSztFQUNsQkMsSUFBSTtFQUNKQztBQUNGLENBQUMsRUFBRTtFQUNELElBQUksQ0FBQ1AsTUFBTSxHQUFHQSxNQUFNO0VBQ3BCLElBQUksQ0FBQ0MsZUFBZSxHQUFHQSxlQUFlLElBQUtELE1BQU0sSUFBSUEsTUFBTSxDQUFDQyxlQUFnQjtFQUM1RSxJQUFJLENBQUNNLGNBQWMsR0FBR0EsY0FBYztFQUNwQyxJQUFJLENBQUNKLFFBQVEsR0FBR0EsUUFBUTtFQUN4QixJQUFJLENBQUNDLGFBQWEsR0FBR0EsYUFBYTtFQUNsQyxJQUFJLENBQUNFLElBQUksR0FBR0EsSUFBSTtFQUNoQixJQUFJLENBQUNELFVBQVUsR0FBR0EsVUFBVTs7RUFFNUI7RUFDQTtFQUNBLElBQUksQ0FBQ0csU0FBUyxHQUFHLEVBQUU7RUFDbkIsSUFBSSxDQUFDQyxZQUFZLEdBQUcsS0FBSztFQUN6QixJQUFJLENBQUNDLFdBQVcsR0FBRyxJQUFJO0FBQ3pCOztBQUVBO0FBQ0E7QUFDQVgsSUFBSSxDQUFDWSxTQUFTLENBQUNDLGlCQUFp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