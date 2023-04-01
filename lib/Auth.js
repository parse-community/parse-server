"use strict";

var _util = require("util");
var _triggers = require("./triggers");
var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const Parse = require('parse/node');
const reducePromise = async (arr, fn, acc, index = 0) => {
  if (arr[index]) {
    const newAcc = await Promise.resolve(fn(acc, arr[index]));
    return reducePromise(arr, fn, newAcc, index + 1);
  }
  return acc;
};

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
  return new Auth({
    config,
    isMaster: true
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
  return reducePromise(
  // apply sort to run the pipeline each time in the same order
  Object.keys(authData).sort(), async (acc, provider) => {
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
    const validationResult = await validator(authData[provider], req, user, requestObject);
    if (validationResult) {
      if (!Object.keys(validationResult).length) acc.authData[provider] = authData[provider];
      if (validationResult.response) acc.authDataResponse[provider] = validationResult.response;
      // Some auth providers after initialization will avoid to replace authData already stored
      if (!validationResult.doNotSave) {
        acc.authData[provider] = validationResult.save || authData[provider];
      }
    } else {
      // Support current authData behavior no result store the new AuthData
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdXRpbCIsInJlcXVpcmUiLCJfdHJpZ2dlcnMiLCJfRGVwcmVjYXRvciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIm93bktleXMiLCJvYmplY3QiLCJlbnVtZXJhYmxlT25seSIsImtleXMiLCJPYmplY3QiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJzeW1ib2xzIiwiZmlsdGVyIiwic3ltIiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJ0YXJnZXQiLCJpIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwic291cmNlIiwiZm9yRWFjaCIsImtleSIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiZGVmaW5lUHJvcGVydHkiLCJ2YWx1ZSIsIl90b1Byb3BlcnR5S2V5IiwiY29uZmlndXJhYmxlIiwid3JpdGFibGUiLCJhcmciLCJfdG9QcmltaXRpdmUiLCJTdHJpbmciLCJpbnB1dCIsImhpbnQiLCJwcmltIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJ1bmRlZmluZWQiLCJyZXMiLCJjYWxsIiwiVHlwZUVycm9yIiwiTnVtYmVyIiwiUGFyc2UiLCJyZWR1Y2VQcm9taXNlIiwiYXJyIiwiZm4iLCJhY2MiLCJpbmRleCIsIm5ld0FjYyIsIlByb21pc2UiLCJyZXNvbHZlIiwiQXV0aCIsImNvbmZpZyIsImNhY2hlQ29udHJvbGxlciIsImlzTWFzdGVyIiwiaXNSZWFkT25seSIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsInVzZXJSb2xlcyIsImZldGNoZWRSb2xlcyIsInJvbGVQcm9taXNlIiwicHJvdG90eXBlIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJtYXN0ZXIiLCJyZWFkT25seSIsIm5vYm9keSIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJzZXNzaW9uVG9rZW4iLCJ1c2VySlNPTiIsImdldCIsImNhY2hlZFVzZXIiLCJmcm9tSlNPTiIsInJlc3VsdHMiLCJyZXN0T3B0aW9ucyIsImxpbWl0IiwiaW5jbHVkZSIsIlJlc3RRdWVyeSIsInF1ZXJ5IiwiZXhlY3V0ZSIsIlF1ZXJ5IiwiU2Vzc2lvbiIsImVxdWFsVG8iLCJmaW5kIiwidXNlTWFzdGVyS2V5IiwibWFwIiwidG9KU09OIiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJub3ciLCJEYXRlIiwiZXhwaXJlc0F0IiwiaXNvIiwicGFzc3dvcmQiLCJwdXQiLCJ1c2VyT2JqZWN0IiwiZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiIsInRoZW4iLCJyZXNwb25zZSIsImNsYXNzTmFtZSIsImdldFVzZXJSb2xlcyIsIl9sb2FkUm9sZXMiLCJnZXRSb2xlc0ZvclVzZXIiLCJyZXN0V2hlcmUiLCJ1c2VycyIsIl9fdHlwZSIsIm9iamVjdElkIiwiaWQiLCJlYWNoIiwicmVzdWx0IiwiUm9sZSIsImNhY2hlZFJvbGVzIiwicm9sZSIsImNhY2hlUm9sZXMiLCJyb2xlc01hcCIsInJlZHVjZSIsIm0iLCJyIiwibmFtZXMiLCJuYW1lIiwiaWRzIiwicm9sZU5hbWVzIiwiX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzIiwiQXJyYXkiLCJjbGVhclJvbGVDYWNoZSIsImRlbCIsImdldFJvbGVzQnlJZHMiLCJpbnMiLCJjb250YWluZWRJbiIsInJvbGVzIiwiJGluIiwicm9sZUlEcyIsInF1ZXJpZWRSb2xlcyIsInJvbGVJRCIsIndhc1F1ZXJpZWQiLCJTZXQiLCJyZXN1bHRNYXAiLCJtZW1vIiwiY29uY2F0IiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwiYXV0aERhdGEiLCJwcm92aWRlcnMiLCJwcm92aWRlciIsInF1ZXJ5S2V5IiwicSIsImRhdGFiYXNlIiwiJG9yIiwiaGFzTXV0YXRlZEF1dGhEYXRhIiwidXNlckF1dGhEYXRhIiwibXV0YXRlZEF1dGhEYXRhIiwicHJvdmlkZXJEYXRhIiwidXNlclByb3ZpZGVyQXV0aERhdGEiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJzYXZlZFVzZXJQcm92aWRlcnMiLCJhZGFwdGVyIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIiLCJzb21lIiwicG9saWN5IiwiYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCIsImhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciIsIk9USEVSX0NBVVNFIiwiam9pbiIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsInJlcSIsImZvdW5kVXNlciIsIlVzZXIiLCJhdXRoIiwiZ2V0VXNlcklkIiwiZmV0Y2giLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFBhcnNlT2JqZWN0cyIsInJlcXVlc3RPYmplY3QiLCJnZXRSZXF1ZXN0T2JqZWN0Iiwic29ydCIsInZhbGlkYXRvciIsImF1dGhQcm92aWRlciIsImVuYWJsZWQiLCJEZXByZWNhdG9yIiwibG9nUnVudGltZURlcHJlY2F0aW9uIiwidXNhZ2UiLCJzb2x1dGlvbiIsIlVOU1VQUE9SVEVEX1NFUlZJQ0UiLCJ2YWxpZGF0aW9uUmVzdWx0IiwiYXV0aERhdGFSZXNwb25zZSIsImRvTm90U2F2ZSIsInNhdmUiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL0F1dGguanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgZ2V0UmVxdWVzdE9iamVjdCB9IGZyb20gJy4vdHJpZ2dlcnMnO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuXG5jb25zdCByZWR1Y2VQcm9taXNlID0gYXN5bmMgKGFyciwgZm4sIGFjYywgaW5kZXggPSAwKSA9PiB7XG4gIGlmIChhcnJbaW5kZXhdKSB7XG4gICAgY29uc3QgbmV3QWNjID0gYXdhaXQgUHJvbWlzZS5yZXNvbHZlKGZuKGFjYywgYXJyW2luZGV4XSkpO1xuICAgIHJldHVybiByZWR1Y2VQcm9taXNlKGFyciwgZm4sIG5ld0FjYywgaW5kZXggKyAxKTtcbiAgfVxuICByZXR1cm4gYWNjO1xufTtcblxuLy8gQW4gQXV0aCBvYmplY3QgdGVsbHMgeW91IHdobyBpcyByZXF1ZXN0aW5nIHNvbWV0aGluZyBhbmQgd2hldGhlclxuLy8gdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4vLyB1c2VyT2JqZWN0IGlzIGEgUGFyc2UuVXNlciBhbmQgY2FuIGJlIG51bGwgaWYgdGhlcmUncyBubyB1c2VyLlxuZnVuY3Rpb24gQXV0aCh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyID0gdW5kZWZpbmVkLFxuICBpc01hc3RlciA9IGZhbHNlLFxuICBpc1JlYWRPbmx5ID0gZmFsc2UsXG4gIHVzZXIsXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgdGhpcy5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB0aGlzLmlzTWFzdGVyID0gaXNNYXN0ZXI7XG4gIHRoaXMudXNlciA9IHVzZXI7XG4gIHRoaXMuaXNSZWFkT25seSA9IGlzUmVhZE9ubHk7XG5cbiAgLy8gQXNzdW1pbmcgYSB1c2VycyByb2xlcyB3b24ndCBjaGFuZ2UgZHVyaW5nIGEgc2luZ2xlIHJlcXVlc3QsIHdlJ2xsXG4gIC8vIG9ubHkgbG9hZCB0aGVtIG9uY2UuXG4gIHRoaXMudXNlclJvbGVzID0gW107XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gZmFsc2U7XG4gIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xufVxuXG4vLyBXaGV0aGVyIHRoaXMgYXV0aCBjb3VsZCBwb3NzaWJseSBtb2RpZnkgdGhlIGdpdmVuIHVzZXIgaWQuXG4vLyBJdCBzdGlsbCBjb3VsZCBiZSBmb3JiaWRkZW4gdmlhIEFDTHMgZXZlbiBpZiB0aGlzIHJldHVybnMgdHJ1ZS5cbkF1dGgucHJvdG90eXBlLmlzVW5hdXRoZW50aWNhdGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3Rlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBtYXN0ZXIoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gcmVhZE9ubHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUsIGlzUmVhZE9ubHk6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG5vYm9keS1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbm9ib2R5KGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiBmYWxzZSB9KTtcbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBBdXRoIG9iamVjdFxuY29uc3QgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyLFxuICBzZXNzaW9uVG9rZW4sXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICBjYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IHVzZXJKU09OID0gYXdhaXQgY2FjaGVDb250cm9sbGVyLnVzZXIuZ2V0KHNlc3Npb25Ub2tlbik7XG4gICAgaWYgKHVzZXJKU09OKSB7XG4gICAgICBjb25zdCBjYWNoZWRVc2VyID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHVzZXJKU09OKTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoXG4gICAgICAgIG5ldyBBdXRoKHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgY2FjaGVDb250cm9sbGVyLFxuICAgICAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICB1c2VyOiBjYWNoZWRVc2VyLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBsZXQgcmVzdWx0cztcbiAgaWYgKGNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RPcHRpb25zID0ge1xuICAgICAgbGltaXQ6IDEsXG4gICAgICBpbmNsdWRlOiAndXNlcicsXG4gICAgfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShjb25maWcsIG1hc3Rlcihjb25maWcpLCAnX1Nlc3Npb24nLCB7IHNlc3Npb25Ub2tlbiB9LCByZXN0T3B0aW9ucyk7XG4gICAgcmVzdWx0cyA9IChhd2FpdCBxdWVyeS5leGVjdXRlKCkpLnJlc3VsdHM7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0cyA9IChcbiAgICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5TZXNzaW9uKVxuICAgICAgICAubGltaXQoMSlcbiAgICAgICAgLmluY2x1ZGUoJ3VzZXInKVxuICAgICAgICAuZXF1YWxUbygnc2Vzc2lvblRva2VuJywgc2Vzc2lvblRva2VuKVxuICAgICAgICAuZmluZCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KVxuICAgICkubWFwKG9iaiA9PiBvYmoudG9KU09OKCkpO1xuICB9XG5cbiAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxIHx8ICFyZXN1bHRzWzBdWyd1c2VyJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gIH1cbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKSxcbiAgICBleHBpcmVzQXQgPSByZXN1bHRzWzBdLmV4cGlyZXNBdCA/IG5ldyBEYXRlKHJlc3VsdHNbMF0uZXhwaXJlc0F0LmlzbykgOiB1bmRlZmluZWQ7XG4gIGlmIChleHBpcmVzQXQgPCBub3cpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnU2Vzc2lvbiB0b2tlbiBpcyBleHBpcmVkLicpO1xuICB9XG4gIGNvbnN0IG9iaiA9IHJlc3VsdHNbMF1bJ3VzZXInXTtcbiAgZGVsZXRlIG9iai5wYXNzd29yZDtcbiAgb2JqWydjbGFzc05hbWUnXSA9ICdfVXNlcic7XG4gIG9ialsnc2Vzc2lvblRva2VuJ10gPSBzZXNzaW9uVG9rZW47XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjYWNoZUNvbnRyb2xsZXIudXNlci5wdXQoc2Vzc2lvblRva2VuLCBvYmopO1xuICB9XG4gIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICBjb25maWcsXG4gICAgY2FjaGVDb250cm9sbGVyLFxuICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICBpbnN0YWxsYXRpb25JZCxcbiAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICB9KTtcbn07XG5cbnZhciBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuID0gZnVuY3Rpb24gKHsgY29uZmlnLCBzZXNzaW9uVG9rZW4sIGluc3RhbGxhdGlvbklkIH0pIHtcbiAgdmFyIHJlc3RPcHRpb25zID0ge1xuICAgIGxpbWl0OiAxLFxuICB9O1xuICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICB2YXIgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KGNvbmZpZywgbWFzdGVyKGNvbmZpZyksICdfVXNlcicsIHsgc2Vzc2lvblRva2VuIH0sIHJlc3RPcHRpb25zKTtcbiAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB2YXIgcmVzdWx0cyA9IHJlc3BvbnNlLnJlc3VsdHM7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnaW52YWxpZCBsZWdhY3kgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBvYmogPSByZXN1bHRzWzBdO1xuICAgIG9iai5jbGFzc05hbWUgPSAnX1VzZXInO1xuICAgIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgICByZXR1cm4gbmV3IEF1dGgoe1xuICAgICAgY29uZmlnLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2Ygcm9sZSBuYW1lc1xuQXV0aC5wcm90b3R5cGUuZ2V0VXNlclJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3RlciB8fCAhdGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG4gIH1cbiAgaWYgKHRoaXMuZmV0Y2hlZFJvbGVzKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLnVzZXJSb2xlcyk7XG4gIH1cbiAgaWYgKHRoaXMucm9sZVByb21pc2UpIHtcbiAgICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbiAgfVxuICB0aGlzLnJvbGVQcm9taXNlID0gdGhpcy5fbG9hZFJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnJvbGVQcm9taXNlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuZ2V0Um9sZXNGb3JVc2VyID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvL1N0YWNrIGFsbCBQYXJzZS5Sb2xlXG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgaWYgKHRoaXMuY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdFdoZXJlID0ge1xuICAgICAgdXNlcnM6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMudXNlci5pZCxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGF3YWl0IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIG1hc3Rlcih0aGlzLmNvbmZpZyksICdfUm9sZScsIHJlc3RXaGVyZSwge30pLmVhY2gocmVzdWx0ID0+XG4gICAgICByZXN1bHRzLnB1c2gocmVzdWx0KVxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuZXF1YWxUbygndXNlcnMnLCB0aGlzLnVzZXIpXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufTtcblxuLy8gSXRlcmF0ZXMgdGhyb3VnaCB0aGUgcm9sZSB0cmVlIGFuZCBjb21waWxlcyBhIHVzZXIncyByb2xlc1xuQXV0aC5wcm90b3R5cGUuX2xvYWRSb2xlcyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgY2FjaGVkUm9sZXMgPSBhd2FpdCB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmdldCh0aGlzLnVzZXIuaWQpO1xuICAgIGlmIChjYWNoZWRSb2xlcyAhPSBudWxsKSB7XG4gICAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgICB0aGlzLnVzZXJSb2xlcyA9IGNhY2hlZFJvbGVzO1xuICAgICAgcmV0dXJuIGNhY2hlZFJvbGVzO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpcnN0IGdldCB0aGUgcm9sZSBpZHMgdGhpcyB1c2VyIGlzIGRpcmVjdGx5IGEgbWVtYmVyIG9mXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmdldFJvbGVzRm9yVXNlcigpO1xuICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG5cbiAgICB0aGlzLmNhY2hlUm9sZXMoKTtcbiAgICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG4gIH1cblxuICBjb25zdCByb2xlc01hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgIChtLCByKSA9PiB7XG4gICAgICBtLm5hbWVzLnB1c2goci5uYW1lKTtcbiAgICAgIG0uaWRzLnB1c2goci5vYmplY3RJZCk7XG4gICAgICByZXR1cm4gbTtcbiAgICB9LFxuICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgKTtcblxuICAvLyBydW4gdGhlIHJlY3Vyc2l2ZSBmaW5kaW5nXG4gIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJvbGVzTWFwLmlkcywgcm9sZXNNYXAubmFtZXMpO1xuICB0aGlzLnVzZXJSb2xlcyA9IHJvbGVOYW1lcy5tYXAociA9PiB7XG4gICAgcmV0dXJuICdyb2xlOicgKyByO1xuICB9KTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbiAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnVzZXJSb2xlcztcbn07XG5cbkF1dGgucHJvdG90eXBlLmNhY2hlUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jYWNoZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5wdXQodGhpcy51c2VyLmlkLCBBcnJheSguLi50aGlzLnVzZXJSb2xlcykpO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmNsZWFyUm9sZUNhY2hlID0gZnVuY3Rpb24gKHNlc3Npb25Ub2tlbikge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUuZGVsKHRoaXMudXNlci5pZCk7XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb25Ub2tlbik7XG4gIHJldHVybiB0cnVlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuZ2V0Um9sZXNCeUlkcyA9IGFzeW5jIGZ1bmN0aW9uIChpbnMpIHtcbiAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICAvLyBCdWlsZCBhbiBPUiBxdWVyeSBhY3Jvc3MgYWxsIHBhcmVudFJvbGVzXG4gIGlmICghdGhpcy5jb25maWcpIHtcbiAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSlcbiAgICAgIC5jb250YWluZWRJbihcbiAgICAgICAgJ3JvbGVzJyxcbiAgICAgICAgaW5zLm1hcChpZCA9PiB7XG4gICAgICAgICAgY29uc3Qgcm9sZSA9IG5ldyBQYXJzZS5PYmplY3QoUGFyc2UuUm9sZSk7XG4gICAgICAgICAgcm9sZS5pZCA9IGlkO1xuICAgICAgICAgIHJldHVybiByb2xlO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCByb2xlcyA9IGlucy5tYXAoaWQgPT4ge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Sb2xlJyxcbiAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgfTtcbiAgICB9KTtcbiAgICBjb25zdCByZXN0V2hlcmUgPSB7IHJvbGVzOiB7ICRpbjogcm9sZXMgfSB9O1xuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgYXdhaXQgbmV3IFJlc3RRdWVyeSh0aGlzLmNvbmZpZywgbWFzdGVyKHRoaXMuY29uZmlnKSwgJ19Sb2xlJywgcmVzdFdoZXJlLCB7fSkuZWFjaChyZXN1bHQgPT5cbiAgICAgIHJlc3VsdHMucHVzaChyZXN1bHQpXG4gICAgKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEdpdmVuIGEgbGlzdCBvZiByb2xlSWRzLCBmaW5kIGFsbCB0aGUgcGFyZW50IHJvbGVzLCByZXR1cm5zIGEgcHJvbWlzZSB3aXRoIGFsbCBuYW1lc1xuQXV0aC5wcm90b3R5cGUuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzID0gZnVuY3Rpb24gKHJvbGVJRHMsIG5hbWVzID0gW10sIHF1ZXJpZWRSb2xlcyA9IHt9KSB7XG4gIGNvbnN0IGlucyA9IHJvbGVJRHMuZmlsdGVyKHJvbGVJRCA9PiB7XG4gICAgY29uc3Qgd2FzUXVlcmllZCA9IHF1ZXJpZWRSb2xlc1tyb2xlSURdICE9PSB0cnVlO1xuICAgIHF1ZXJpZWRSb2xlc1tyb2xlSURdID0gdHJ1ZTtcbiAgICByZXR1cm4gd2FzUXVlcmllZDtcbiAgfSk7XG5cbiAgLy8gYWxsIHJvbGVzIGFyZSBhY2NvdW50ZWQgZm9yLCByZXR1cm4gdGhlIG5hbWVzXG4gIGlmIChpbnMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFsuLi5uZXcgU2V0KG5hbWVzKV0pO1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuZ2V0Um9sZXNCeUlkcyhpbnMpXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAvLyBOb3RoaW5nIGZvdW5kXG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmFtZXMpO1xuICAgICAgfVxuICAgICAgLy8gTWFwIHRoZSByZXN1bHRzIHdpdGggYWxsIElkcyBhbmQgbmFtZXNcbiAgICAgIGNvbnN0IHJlc3VsdE1hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgICAgICAobWVtbywgcm9sZSkgPT4ge1xuICAgICAgICAgIG1lbW8ubmFtZXMucHVzaChyb2xlLm5hbWUpO1xuICAgICAgICAgIG1lbW8uaWRzLnB1c2gocm9sZS5vYmplY3RJZCk7XG4gICAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICAgIH0sXG4gICAgICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgICAgICk7XG4gICAgICAvLyBzdG9yZSB0aGUgbmV3IGZvdW5kIG5hbWVzXG4gICAgICBuYW1lcyA9IG5hbWVzLmNvbmNhdChyZXN1bHRNYXAubmFtZXMpO1xuICAgICAgLy8gZmluZCB0aGUgbmV4dCBvbmVzLCBjaXJjdWxhciByb2xlcyB3aWxsIGJlIGN1dFxuICAgICAgcmV0dXJuIHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJlc3VsdE1hcC5pZHMsIG5hbWVzLCBxdWVyaWVkUm9sZXMpO1xuICAgIH0pXG4gICAgLnRoZW4obmFtZXMgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSA9IChjb25maWcsIGF1dGhEYXRhKSA9PiB7XG4gIGNvbnN0IHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgY29uc3QgcXVlcnkgPSBwcm92aWRlcnNcbiAgICAucmVkdWNlKChtZW1vLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKCFhdXRoRGF0YVtwcm92aWRlcl0gfHwgKGF1dGhEYXRhICYmICFhdXRoRGF0YVtwcm92aWRlcl0uaWQpKSB7XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfVxuICAgICAgY29uc3QgcXVlcnlLZXkgPSBgYXV0aERhdGEuJHtwcm92aWRlcn0uaWRgO1xuICAgICAgY29uc3QgcXVlcnkgPSB7fTtcbiAgICAgIHF1ZXJ5W3F1ZXJ5S2V5XSA9IGF1dGhEYXRhW3Byb3ZpZGVyXS5pZDtcbiAgICAgIG1lbW8ucHVzaChxdWVyeSk7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9LCBbXSlcbiAgICAuZmlsdGVyKHEgPT4ge1xuICAgICAgcmV0dXJuIHR5cGVvZiBxICE9PSAndW5kZWZpbmVkJztcbiAgICB9KTtcblxuICByZXR1cm4gcXVlcnkubGVuZ3RoID4gMFxuICAgID8gY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyAkb3I6IHF1ZXJ5IH0sIHsgbGltaXQ6IDIgfSlcbiAgICA6IFByb21pc2UucmVzb2x2ZShbXSk7XG59O1xuXG5jb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSAoYXV0aERhdGEsIHVzZXJBdXRoRGF0YSkgPT4ge1xuICBpZiAoIXVzZXJBdXRoRGF0YSkgcmV0dXJuIHsgaGFzTXV0YXRlZEF1dGhEYXRhOiB0cnVlLCBtdXRhdGVkQXV0aERhdGE6IGF1dGhEYXRhIH07XG4gIGNvbnN0IG11dGF0ZWRBdXRoRGF0YSA9IHt9O1xuICBPYmplY3Qua2V5cyhhdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgLy8gQW5vbnltb3VzIHByb3ZpZGVyIGlzIG5vdCBoYW5kbGVkIHRoaXMgd2F5XG4gICAgaWYgKHByb3ZpZGVyID09PSAnYW5vbnltb3VzJykgcmV0dXJuO1xuICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICBjb25zdCB1c2VyUHJvdmlkZXJBdXRoRGF0YSA9IHVzZXJBdXRoRGF0YVtwcm92aWRlcl07XG4gICAgaWYgKCFpc0RlZXBTdHJpY3RFcXVhbChwcm92aWRlckRhdGEsIHVzZXJQcm92aWRlckF1dGhEYXRhKSkge1xuICAgICAgbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXSA9IHByb3ZpZGVyRGF0YTtcbiAgICB9XG4gIH0pO1xuICBjb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmxlbmd0aCAhPT0gMDtcbiAgcmV0dXJuIHsgaGFzTXV0YXRlZEF1dGhEYXRhLCBtdXRhdGVkQXV0aERhdGEgfTtcbn07XG5cbmNvbnN0IGNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4gPSAoXG4gIGF1dGhEYXRhID0ge30sXG4gIHVzZXJBdXRoRGF0YSA9IHt9LFxuICBjb25maWdcbikgPT4ge1xuICBjb25zdCBzYXZlZFVzZXJQcm92aWRlcnMgPSBPYmplY3Qua2V5cyh1c2VyQXV0aERhdGEpLm1hcChwcm92aWRlciA9PiAoe1xuICAgIG5hbWU6IHByb3ZpZGVyLFxuICAgIGFkYXB0ZXI6IGNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpLmFkYXB0ZXIsXG4gIH0pKTtcblxuICBjb25zdCBoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShcbiAgICBwcm92aWRlciA9PlxuICAgICAgcHJvdmlkZXIgJiYgcHJvdmlkZXIuYWRhcHRlciAmJiBwcm92aWRlci5hZGFwdGVyLnBvbGljeSA9PT0gJ3NvbG8nICYmIGF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdXG4gICk7XG5cbiAgLy8gU29sbyBwcm92aWRlcnMgY2FuIGJlIGNvbnNpZGVyZWQgYXMgc2FmZSwgc28gd2UgZG8gbm90IGhhdmUgdG8gY2hlY2sgaWYgdGhlIHVzZXIgbmVlZHNcbiAgLy8gdG8gcHJvdmlkZSBhbiBhZGRpdGlvbmFsIHByb3ZpZGVyIHRvIGxvZ2luLiBBbiBhdXRoIGFkYXB0ZXIgd2l0aCBcInNvbG9cIiAobGlrZSB3ZWJhdXRobikgbWVhbnNcbiAgLy8gbm8gXCJhZGRpdGlvbmFsXCIgYXV0aCBuZWVkcyB0byBiZSBwcm92aWRlZCB0byBsb2dpbiAobGlrZSBPVFAsIE1GQSlcbiAgaWYgKGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlcikge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQgPSBbXTtcbiAgY29uc3QgaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgIGlmIChwcm92aWRlciAmJiBwcm92aWRlci5hZGFwdGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIucG9saWN5ID09PSAnYWRkaXRpb25hbCcpIHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlci5uYW1lXSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFB1c2ggbWlzc2luZyBwcm92aWRlciBmb3IgZXJyb3IgbWVzc2FnZVxuICAgICAgICBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLnB1c2gocHJvdmlkZXIubmFtZSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgaWYgKGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciB8fCAhYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5sZW5ndGgpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgYE1pc3NpbmcgYWRkaXRpb25hbCBhdXRoRGF0YSAke2FkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQuam9pbignLCcpfWBcbiAgKTtcbn07XG5cbi8vIFZhbGlkYXRlIGVhY2ggYXV0aERhdGEgc3RlcC1ieS1zdGVwIGFuZCByZXR1cm4gdGhlIHByb3ZpZGVyIHJlc3BvbnNlc1xuY29uc3QgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uID0gYXN5bmMgKGF1dGhEYXRhLCByZXEsIGZvdW5kVXNlcikgPT4ge1xuICBsZXQgdXNlcjtcbiAgaWYgKGZvdW5kVXNlcikge1xuICAgIHVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5mb3VuZFVzZXIgfSk7XG4gICAgLy8gRmluZCB1c2VyIGJ5IHNlc3Npb24gYW5kIGN1cnJlbnQgb2JqZWN0SWQ7IG9ubHkgcGFzcyB1c2VyIGlmIGl0J3MgdGhlIGN1cnJlbnQgdXNlciBvciBtYXN0ZXIga2V5IGlzIHByb3ZpZGVkXG4gIH0gZWxzZSBpZiAoXG4gICAgKHJlcS5hdXRoICYmXG4gICAgICByZXEuYXV0aC51c2VyICYmXG4gICAgICB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgcmVxLmdldFVzZXJJZCgpID09PSByZXEuYXV0aC51c2VyLmlkKSB8fFxuICAgIChyZXEuYXV0aCAmJiByZXEuYXV0aC5pc01hc3RlciAmJiB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJiByZXEuZ2V0VXNlcklkKCkpXG4gICkge1xuICAgIHVzZXIgPSBuZXcgUGFyc2UuVXNlcigpO1xuICAgIHVzZXIuaWQgPSByZXEuYXV0aC5pc01hc3RlciA/IHJlcS5nZXRVc2VySWQoKSA6IHJlcS5hdXRoLnVzZXIuaWQ7XG4gICAgYXdhaXQgdXNlci5mZXRjaCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHJlcS5idWlsZFBhcnNlT2JqZWN0cygpO1xuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdE9iamVjdChcbiAgICB1bmRlZmluZWQsXG4gICAgcmVxLmF1dGgsXG4gICAgdXBkYXRlZE9iamVjdCxcbiAgICBvcmlnaW5hbE9iamVjdCB8fCB1c2VyLFxuICAgIHJlcS5jb25maWdcbiAgKTtcbiAgLy8gUGVyZm9ybSB2YWxpZGF0aW9uIGFzIHN0ZXAtYnktc3RlcCBwaXBlbGluZSBmb3IgYmV0dGVyIGVycm9yIGNvbnNpc3RlbmN5XG4gIC8vIGFuZCBhbHNvIHRvIGF2b2lkIHRvIHRyaWdnZXIgYSBwcm92aWRlciAobGlrZSBPVFAgU01TKSBpZiBhbm90aGVyIG9uZSBmYWlsc1xuICByZXR1cm4gcmVkdWNlUHJvbWlzZShcbiAgICAvLyBhcHBseSBzb3J0IHRvIHJ1biB0aGUgcGlwZWxpbmUgZWFjaCB0aW1lIGluIHRoZSBzYW1lIG9yZGVyXG4gICAgT2JqZWN0LmtleXMoYXV0aERhdGEpLnNvcnQoKSxcbiAgICBhc3luYyAoYWNjLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKGF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICBjb25zdCBhdXRoUHJvdmlkZXIgPSAocmVxLmNvbmZpZy5hdXRoIHx8IHt9KVtwcm92aWRlcl0gfHwge307XG4gICAgICBpZiAoYXV0aFByb3ZpZGVyLmVuYWJsZWQgPT0gbnVsbCkge1xuICAgICAgICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgICAgICAgdXNhZ2U6IGBhdXRoLiR7cHJvdmlkZXJ9YCxcbiAgICAgICAgICBzb2x1dGlvbjogYGF1dGguJHtwcm92aWRlcn0uZW5hYmxlZDogdHJ1ZWAsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgaWYgKCF2YWxpZGF0b3IgfHwgYXV0aFByb3ZpZGVyLmVuYWJsZWQgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBjb25zdCB2YWxpZGF0aW9uUmVzdWx0ID0gYXdhaXQgdmFsaWRhdG9yKGF1dGhEYXRhW3Byb3ZpZGVyXSwgcmVxLCB1c2VyLCByZXF1ZXN0T2JqZWN0KTtcbiAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0KSB7XG4gICAgICAgIGlmICghT2JqZWN0LmtleXModmFsaWRhdGlvblJlc3VsdCkubGVuZ3RoKSBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuXG4gICAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlKSBhY2MuYXV0aERhdGFSZXNwb25zZVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlO1xuICAgICAgICAvLyBTb21lIGF1dGggcHJvdmlkZXJzIGFmdGVyIGluaXRpYWxpemF0aW9uIHdpbGwgYXZvaWQgdG8gcmVwbGFjZSBhdXRoRGF0YSBhbHJlYWR5IHN0b3JlZFxuICAgICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQuZG9Ob3RTYXZlKSB7XG4gICAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IHZhbGlkYXRpb25SZXN1bHQuc2F2ZSB8fCBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFN1cHBvcnQgY3VycmVudCBhdXRoRGF0YSBiZWhhdmlvciBubyByZXN1bHQgc3RvcmUgdGhlIG5ldyBBdXRoRGF0YVxuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LFxuICAgIHsgYXV0aERhdGE6IHt9LCBhdXRoRGF0YVJlc3BvbnNlOiB7fSB9XG4gICk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgQXV0aCxcbiAgbWFzdGVyLFxuICBub2JvZHksXG4gIHJlYWRPbmx5LFxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLFxuICBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuLFxuICBmaW5kVXNlcnNXaXRoQXV0aERhdGEsXG4gIGhhc011dGF0ZWRBdXRoRGF0YSxcbiAgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbixcbiAgcmVkdWNlUHJvbWlzZSxcbiAgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFDQSxJQUFBQSxLQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxTQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxXQUFBLEdBQUFDLHNCQUFBLENBQUFILE9BQUE7QUFBaUQsU0FBQUcsdUJBQUFDLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFBQSxTQUFBRyxRQUFBQyxNQUFBLEVBQUFDLGNBQUEsUUFBQUMsSUFBQSxHQUFBQyxNQUFBLENBQUFELElBQUEsQ0FBQUYsTUFBQSxPQUFBRyxNQUFBLENBQUFDLHFCQUFBLFFBQUFDLE9BQUEsR0FBQUYsTUFBQSxDQUFBQyxxQkFB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