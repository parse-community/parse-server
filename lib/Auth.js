"use strict";

var _util = require("util");

var _triggers = require("./triggers");

var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

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

  return reducePromise( // apply sort to run the pipeline each time in the same order
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
      if (validationResult.response) acc.authDataResponse[provider] = validationResult.response; // Some auth providers after initialization will avoid to replace authData already stored

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9BdXRoLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsInJlZHVjZVByb21pc2UiLCJhcnIiLCJmbiIsImFjYyIsImluZGV4IiwibmV3QWNjIiwiUHJvbWlzZSIsInJlc29sdmUiLCJBdXRoIiwiY29uZmlnIiwiY2FjaGVDb250cm9sbGVyIiwidW5kZWZpbmVkIiwiaXNNYXN0ZXIiLCJpc1JlYWRPbmx5IiwidXNlciIsImluc3RhbGxhdGlvbklkIiwidXNlclJvbGVzIiwiZmV0Y2hlZFJvbGVzIiwicm9sZVByb21pc2UiLCJwcm90b3R5cGUiLCJpc1VuYXV0aGVudGljYXRlZCIsIm1hc3RlciIsInJlYWRPbmx5Iiwibm9ib2R5IiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsInNlc3Npb25Ub2tlbiIsInVzZXJKU09OIiwiZ2V0IiwiY2FjaGVkVXNlciIsIk9iamVjdCIsImZyb21KU09OIiwicmVzdWx0cyIsInJlc3RPcHRpb25zIiwibGltaXQiLCJpbmNsdWRlIiwiUmVzdFF1ZXJ5IiwicXVlcnkiLCJleGVjdXRlIiwiUXVlcnkiLCJTZXNzaW9uIiwiZXF1YWxUbyIsImZpbmQiLCJ1c2VNYXN0ZXJLZXkiLCJtYXAiLCJvYmoiLCJ0b0pTT04iLCJsZW5ndGgiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIm5vdyIsIkRhdGUiLCJleHBpcmVzQXQiLCJpc28iLCJwYXNzd29yZCIsInB1dCIsInVzZXJPYmplY3QiLCJnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuIiwidGhlbiIsInJlc3BvbnNlIiwiY2xhc3NOYW1lIiwiZ2V0VXNlclJvbGVzIiwiX2xvYWRSb2xlcyIsImdldFJvbGVzRm9yVXNlciIsInJlc3RXaGVyZSIsInVzZXJzIiwiX190eXBlIiwib2JqZWN0SWQiLCJpZCIsImVhY2giLCJyZXN1bHQiLCJwdXNoIiwiUm9sZSIsImNhY2hlZFJvbGVzIiwicm9sZSIsImNhY2hlUm9sZXMiLCJyb2xlc01hcCIsInJlZHVjZSIsIm0iLCJyIiwibmFtZXMiLCJuYW1lIiwiaWRzIiwicm9sZU5hbWVzIiwiX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzIiwiQXJyYXkiLCJjbGVhclJvbGVDYWNoZSIsImRlbCIsImdldFJvbGVzQnlJZHMiLCJpbnMiLCJjb250YWluZWRJbiIsInJvbGVzIiwiJGluIiwicm9sZUlEcyIsInF1ZXJpZWRSb2xlcyIsImZpbHRlciIsInJvbGVJRCIsIndhc1F1ZXJpZWQiLCJTZXQiLCJyZXN1bHRNYXAiLCJtZW1vIiwiY29uY2F0IiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwiYXV0aERhdGEiLCJwcm92aWRlcnMiLCJrZXlzIiwicHJvdmlkZXIiLCJxdWVyeUtleSIsInEiLCJkYXRhYmFzZSIsIiRvciIsImhhc011dGF0ZWRBdXRoRGF0YSIsInVzZXJBdXRoRGF0YSIsIm11dGF0ZWRBdXRoRGF0YSIsImZvckVhY2giLCJwcm92aWRlckRhdGEiLCJ1c2VyUHJvdmlkZXJBdXRoRGF0YSIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJzYXZlZFVzZXJQcm92aWRlcnMiLCJhZGFwdGVyIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIiLCJzb21lIiwicG9saWN5IiwiYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCIsImhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciIsIk9USEVSX0NBVVNFIiwiam9pbiIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsInJlcSIsImZvdW5kVXNlciIsIlVzZXIiLCJhdXRoIiwiZ2V0VXNlcklkIiwiZmV0Y2giLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFBhcnNlT2JqZWN0cyIsInJlcXVlc3RPYmplY3QiLCJzb3J0IiwidmFsaWRhdG9yIiwiYXV0aFByb3ZpZGVyIiwiZW5hYmxlZCIsIkRlcHJlY2F0b3IiLCJsb2dSdW50aW1lRGVwcmVjYXRpb24iLCJ1c2FnZSIsInNvbHV0aW9uIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInZhbGlkYXRpb25SZXN1bHQiLCJhdXRoRGF0YVJlc3BvbnNlIiwiZG9Ob3RTYXZlIiwic2F2ZSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFIQSxNQUFNQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxZQUFELENBQXJCOztBQUtBLE1BQU1DLGFBQWEsR0FBRyxPQUFPQyxHQUFQLEVBQVlDLEVBQVosRUFBZ0JDLEdBQWhCLEVBQXFCQyxLQUFLLEdBQUcsQ0FBN0IsS0FBbUM7QUFDdkQsTUFBSUgsR0FBRyxDQUFDRyxLQUFELENBQVAsRUFBZ0I7QUFDZCxVQUFNQyxNQUFNLEdBQUcsTUFBTUMsT0FBTyxDQUFDQyxPQUFSLENBQWdCTCxFQUFFLENBQUNDLEdBQUQsRUFBTUYsR0FBRyxDQUFDRyxLQUFELENBQVQsQ0FBbEIsQ0FBckI7QUFDQSxXQUFPSixhQUFhLENBQUNDLEdBQUQsRUFBTUMsRUFBTixFQUFVRyxNQUFWLEVBQWtCRCxLQUFLLEdBQUcsQ0FBMUIsQ0FBcEI7QUFDRDs7QUFDRCxTQUFPRCxHQUFQO0FBQ0QsQ0FORCxDLENBUUE7QUFDQTtBQUNBOzs7QUFDQSxTQUFTSyxJQUFULENBQWM7QUFDWkMsRUFBQUEsTUFEWTtBQUVaQyxFQUFBQSxlQUFlLEdBQUdDLFNBRk47QUFHWkMsRUFBQUEsUUFBUSxHQUFHLEtBSEM7QUFJWkMsRUFBQUEsVUFBVSxHQUFHLEtBSkQ7QUFLWkMsRUFBQUEsSUFMWTtBQU1aQyxFQUFBQTtBQU5ZLENBQWQsRUFPRztBQUNELE9BQUtOLE1BQUwsR0FBY0EsTUFBZDtBQUNBLE9BQUtDLGVBQUwsR0FBdUJBLGVBQWUsSUFBS0QsTUFBTSxJQUFJQSxNQUFNLENBQUNDLGVBQTVEO0FBQ0EsT0FBS0ssY0FBTCxHQUFzQkEsY0FBdEI7QUFDQSxPQUFLSCxRQUFMLEdBQWdC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ID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuaW1wb3J0IHsgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IGdldFJlcXVlc3RPYmplY3QgfSBmcm9tICcuL3RyaWdnZXJzJztcbmltcG9ydCBEZXByZWNhdG9yIGZyb20gJy4vRGVwcmVjYXRvci9EZXByZWNhdG9yJztcblxuY29uc3QgcmVkdWNlUHJvbWlzZSA9IGFzeW5jIChhcnIsIGZuLCBhY2MsIGluZGV4ID0gMCkgPT4ge1xuICBpZiAoYXJyW2luZGV4XSkge1xuICAgIGNvbnN0IG5ld0FjYyA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShmbihhY2MsIGFycltpbmRleF0pKTtcbiAgICByZXR1cm4gcmVkdWNlUHJvbWlzZShhcnIsIGZuLCBuZXdBY2MsIGluZGV4ICsgMSk7XG4gIH1cbiAgcmV0dXJuIGFjYztcbn07XG5cbi8vIEFuIEF1dGggb2JqZWN0IHRlbGxzIHlvdSB3aG8gaXMgcmVxdWVzdGluZyBzb21ldGhpbmcgYW5kIHdoZXRoZXJcbi8vIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuLy8gdXNlck9iamVjdCBpcyBhIFBhcnNlLlVzZXIgYW5kIGNhbiBiZSBudWxsIGlmIHRoZXJlJ3Mgbm8gdXNlci5cbmZ1bmN0aW9uIEF1dGgoe1xuICBjb25maWcsXG4gIGNhY2hlQ29udHJvbGxlciA9IHVuZGVmaW5lZCxcbiAgaXNNYXN0ZXIgPSBmYWxzZSxcbiAgaXNSZWFkT25seSA9IGZhbHNlLFxuICB1c2VyLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIHRoaXMuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgdGhpcy5pc01hc3RlciA9IGlzTWFzdGVyO1xuICB0aGlzLnVzZXIgPSB1c2VyO1xuICB0aGlzLmlzUmVhZE9ubHkgPSBpc1JlYWRPbmx5O1xuXG4gIC8vIEFzc3VtaW5nIGEgdXNlcnMgcm9sZXMgd29uJ3QgY2hhbmdlIGR1cmluZyBhIHNpbmdsZSByZXF1ZXN0LCB3ZSdsbFxuICAvLyBvbmx5IGxvYWQgdGhlbSBvbmNlLlxuICB0aGlzLnVzZXJSb2xlcyA9IFtdO1xuICB0aGlzLmZldGNoZWRSb2xlcyA9IGZhbHNlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbn1cblxuLy8gV2hldGhlciB0aGlzIGF1dGggY291bGQgcG9zc2libHkgbW9kaWZ5IHRoZSBnaXZlbiB1c2VyIGlkLlxuLy8gSXQgc3RpbGwgY291bGQgYmUgZm9yYmlkZGVuIHZpYSBBQ0xzIGV2ZW4gaWYgdGhpcyByZXR1cm5zIHRydWUuXG5BdXRoLnByb3RvdHlwZS5pc1VuYXV0aGVudGljYXRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHRoaXMudXNlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbWFzdGVyKGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYXN0ZXItbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIHJlYWRPbmx5KGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlLCBpc1JlYWRPbmx5OiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBub2JvZHktbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG5vYm9keShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogZmFsc2UgfSk7XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gQXV0aCBvYmplY3RcbmNvbnN0IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoe1xuICBjb25maWcsXG4gIGNhY2hlQ29udHJvbGxlcixcbiAgc2Vzc2lvblRva2VuLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjb25zdCB1c2VySlNPTiA9IGF3YWl0IGNhY2hlQ29udHJvbGxlci51c2VyLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmICh1c2VySlNPTikge1xuICAgICAgY29uc3QgY2FjaGVkVXNlciA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTih1c2VySlNPTik7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFxuICAgICAgICBuZXcgQXV0aCh7XG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICAgICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgdXNlcjogY2FjaGVkVXNlcixcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgbGV0IHJlc3VsdHM7XG4gIGlmIChjb25maWcpIHtcbiAgICBjb25zdCByZXN0T3B0aW9ucyA9IHtcbiAgICAgIGxpbWl0OiAxLFxuICAgICAgaW5jbHVkZTogJ3VzZXInLFxuICAgIH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBjb25zdCBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoY29uZmlnLCBtYXN0ZXIoY29uZmlnKSwgJ19TZXNzaW9uJywgeyBzZXNzaW9uVG9rZW4gfSwgcmVzdE9wdGlvbnMpO1xuICAgIHJlc3VsdHMgPSAoYXdhaXQgcXVlcnkuZXhlY3V0ZSgpKS5yZXN1bHRzO1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdHMgPSAoXG4gICAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuU2Vzc2lvbilcbiAgICAgICAgLmxpbWl0KDEpXG4gICAgICAgIC5pbmNsdWRlKCd1c2VyJylcbiAgICAgICAgLmVxdWFsVG8oJ3Nlc3Npb25Ub2tlbicsIHNlc3Npb25Ub2tlbilcbiAgICAgICAgLmZpbmQoeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSlcbiAgICApLm1hcChvYmogPT4gb2JqLnRvSlNPTigpKTtcbiAgfVxuXG4gIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSB8fCAhcmVzdWx0c1swXVsndXNlciddKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICB9XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCksXG4gICAgZXhwaXJlc0F0ID0gcmVzdWx0c1swXS5leHBpcmVzQXQgPyBuZXcgRGF0ZShyZXN1bHRzWzBdLmV4cGlyZXNBdC5pc28pIDogdW5kZWZpbmVkO1xuICBpZiAoZXhwaXJlc0F0IDwgbm93KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gaXMgZXhwaXJlZC4nKTtcbiAgfVxuICBjb25zdCBvYmogPSByZXN1bHRzWzBdWyd1c2VyJ107XG4gIGRlbGV0ZSBvYmoucGFzc3dvcmQ7XG4gIG9ialsnY2xhc3NOYW1lJ10gPSAnX1VzZXInO1xuICBvYmpbJ3Nlc3Npb25Ub2tlbiddID0gc2Vzc2lvblRva2VuO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY2FjaGVDb250cm9sbGVyLnVzZXIucHV0KHNlc3Npb25Ub2tlbiwgb2JqKTtcbiAgfVxuICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gIHJldHVybiBuZXcgQXV0aCh7XG4gICAgY29uZmlnLFxuICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgdXNlcjogdXNlck9iamVjdCxcbiAgfSk7XG59O1xuXG52YXIgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiA9IGZ1bmN0aW9uICh7IGNvbmZpZywgc2Vzc2lvblRva2VuLCBpbnN0YWxsYXRpb25JZCB9KSB7XG4gIHZhciByZXN0T3B0aW9ucyA9IHtcbiAgICBsaW1pdDogMSxcbiAgfTtcbiAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgdmFyIHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShjb25maWcsIG1hc3Rlcihjb25maWcpLCAnX1VzZXInLCB7IHNlc3Npb25Ub2tlbiB9LCByZXN0T3B0aW9ucyk7XG4gIHJldHVybiBxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdmFyIHJlc3VsdHMgPSByZXNwb25zZS5yZXN1bHRzO1xuICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ2ludmFsaWQgbGVnYWN5IHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgb2JqID0gcmVzdWx0c1swXTtcbiAgICBvYmouY2xhc3NOYW1lID0gJ19Vc2VyJztcbiAgICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gICAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICAgIGNvbmZpZyxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgdXNlcjogdXNlck9iamVjdCxcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIHJvbGUgbmFtZXNcbkF1dGgucHJvdG90eXBlLmdldFVzZXJSb2xlcyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNNYXN0ZXIgfHwgIXRoaXMudXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG4gIGlmICh0aGlzLmZldGNoZWRSb2xlcykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy51c2VyUm9sZXMpO1xuICB9XG4gIGlmICh0aGlzLnJvbGVQcm9taXNlKSB7XG4gICAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG4gIH1cbiAgdGhpcy5yb2xlUHJvbWlzZSA9IHRoaXMuX2xvYWRSb2xlcygpO1xuICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzRm9yVXNlciA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy9TdGFjayBhbGwgUGFyc2UuUm9sZVxuICBjb25zdCByZXN1bHRzID0gW107XG4gIGlmICh0aGlzLmNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHtcbiAgICAgIHVzZXJzOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLnVzZXIuaWQsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBhd2FpdCBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBtYXN0ZXIodGhpcy5jb25maWcpLCAnX1JvbGUnLCByZXN0V2hlcmUsIHt9KS5lYWNoKHJlc3VsdCA9PlxuICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdClcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmVxdWFsVG8oJ3VzZXJzJywgdGhpcy51c2VyKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEl0ZXJhdGVzIHRocm91Z2ggdGhlIHJvbGUgdHJlZSBhbmQgY29tcGlsZXMgYSB1c2VyJ3Mgcm9sZXNcbkF1dGgucHJvdG90eXBlLl9sb2FkUm9sZXMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IGNhY2hlZFJvbGVzID0gYXdhaXQgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5nZXQodGhpcy51c2VyLmlkKTtcbiAgICBpZiAoY2FjaGVkUm9sZXMgIT0gbnVsbCkge1xuICAgICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgICAgdGhpcy51c2VyUm9sZXMgPSBjYWNoZWRSb2xlcztcbiAgICAgIHJldHVybiBjYWNoZWRSb2xlcztcbiAgICB9XG4gIH1cblxuICAvLyBGaXJzdCBnZXQgdGhlIHJvbGUgaWRzIHRoaXMgdXNlciBpcyBkaXJlY3RseSBhIG1lbWJlciBvZlxuICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRSb2xlc0ZvclVzZXIoKTtcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIHRoaXMudXNlclJvbGVzID0gW107XG4gICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xuXG4gICAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gICAgcmV0dXJuIHRoaXMudXNlclJvbGVzO1xuICB9XG5cbiAgY29uc3Qgcm9sZXNNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAobSwgcikgPT4ge1xuICAgICAgbS5uYW1lcy5wdXNoKHIubmFtZSk7XG4gICAgICBtLmlkcy5wdXNoKHIub2JqZWN0SWQpO1xuICAgICAgcmV0dXJuIG07XG4gICAgfSxcbiAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICk7XG5cbiAgLy8gcnVuIHRoZSByZWN1cnNpdmUgZmluZGluZ1xuICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyb2xlc01hcC5pZHMsIHJvbGVzTWFwLm5hbWVzKTtcbiAgdGhpcy51c2VyUm9sZXMgPSByb2xlTmFtZXMubWFwKHIgPT4ge1xuICAgIHJldHVybiAncm9sZTonICsgcjtcbiAgfSk7XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG4gIHRoaXMuY2FjaGVSb2xlcygpO1xuICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jYWNoZVJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUucHV0KHRoaXMudXNlci5pZCwgQXJyYXkoLi4udGhpcy51c2VyUm9sZXMpKTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jbGVhclJvbGVDYWNoZSA9IGZ1bmN0aW9uIChzZXNzaW9uVG9rZW4pIHtcbiAgaWYgKCF0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmRlbCh0aGlzLnVzZXIuaWQpO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlci51c2VyLmRlbChzZXNzaW9uVG9rZW4pO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzQnlJZHMgPSBhc3luYyBmdW5jdGlvbiAoaW5zKSB7XG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgLy8gQnVpbGQgYW4gT1IgcXVlcnkgYWNyb3NzIGFsbCBwYXJlbnRSb2xlc1xuICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuY29udGFpbmVkSW4oXG4gICAgICAgICdyb2xlcycsXG4gICAgICAgIGlucy5tYXAoaWQgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvbGUgPSBuZXcgUGFyc2UuT2JqZWN0KFBhcnNlLlJvbGUpO1xuICAgICAgICAgIHJvbGUuaWQgPSBpZDtcbiAgICAgICAgICByZXR1cm4gcm9sZTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0LnRvSlNPTigpKSwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgcm9sZXMgPSBpbnMubWFwKGlkID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgIH07XG4gICAgfSk7XG4gICAgY29uc3QgcmVzdFdoZXJlID0geyByb2xlczogeyAkaW46IHJvbGVzIH0gfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGF3YWl0IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIG1hc3Rlcih0aGlzLmNvbmZpZyksICdfUm9sZScsIHJlc3RXaGVyZSwge30pLmVhY2gocmVzdWx0ID0+XG4gICAgICByZXN1bHRzLnB1c2gocmVzdWx0KVxuICAgICk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59O1xuXG4vLyBHaXZlbiBhIGxpc3Qgb2Ygcm9sZUlkcywgZmluZCBhbGwgdGhlIHBhcmVudCByb2xlcywgcmV0dXJucyBhIHByb21pc2Ugd2l0aCBhbGwgbmFtZXNcbkF1dGgucHJvdG90eXBlLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyA9IGZ1bmN0aW9uIChyb2xlSURzLCBuYW1lcyA9IFtdLCBxdWVyaWVkUm9sZXMgPSB7fSkge1xuICBjb25zdCBpbnMgPSByb2xlSURzLmZpbHRlcihyb2xlSUQgPT4ge1xuICAgIGNvbnN0IHdhc1F1ZXJpZWQgPSBxdWVyaWVkUm9sZXNbcm9sZUlEXSAhPT0gdHJ1ZTtcbiAgICBxdWVyaWVkUm9sZXNbcm9sZUlEXSA9IHRydWU7XG4gICAgcmV0dXJuIHdhc1F1ZXJpZWQ7XG4gIH0pO1xuXG4gIC8vIGFsbCByb2xlcyBhcmUgYWNjb3VudGVkIGZvciwgcmV0dXJuIHRoZSBuYW1lc1xuICBpZiAoaW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLmdldFJvbGVzQnlJZHMoaW5zKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gTm90aGluZyBmb3VuZFxuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5hbWVzKTtcbiAgICAgIH1cbiAgICAgIC8vIE1hcCB0aGUgcmVzdWx0cyB3aXRoIGFsbCBJZHMgYW5kIG5hbWVzXG4gICAgICBjb25zdCByZXN1bHRNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAgICAgKG1lbW8sIHJvbGUpID0+IHtcbiAgICAgICAgICBtZW1vLm5hbWVzLnB1c2gocm9sZS5uYW1lKTtcbiAgICAgICAgICBtZW1vLmlkcy5wdXNoKHJvbGUub2JqZWN0SWQpO1xuICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICB9LFxuICAgICAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICAgICApO1xuICAgICAgLy8gc3RvcmUgdGhlIG5ldyBmb3VuZCBuYW1lc1xuICAgICAgbmFtZXMgPSBuYW1lcy5jb25jYXQocmVzdWx0TWFwLm5hbWVzKTtcbiAgICAgIC8vIGZpbmQgdGhlIG5leHQgb25lcywgY2lyY3VsYXIgcm9sZXMgd2lsbCBiZSBjdXRcbiAgICAgIHJldHVybiB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyZXN1bHRNYXAuaWRzLCBuYW1lcywgcXVlcmllZFJvbGVzKTtcbiAgICB9KVxuICAgIC50aGVuKG5hbWVzID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoWy4uLm5ldyBTZXQobmFtZXMpXSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBmaW5kVXNlcnNXaXRoQXV0aERhdGEgPSAoY29uZmlnLCBhdXRoRGF0YSkgPT4ge1xuICBjb25zdCBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGNvbnN0IHF1ZXJ5ID0gcHJvdmlkZXJzXG4gICAgLnJlZHVjZSgobWVtbywgcHJvdmlkZXIpID0+IHtcbiAgICAgIGlmICghYXV0aERhdGFbcHJvdmlkZXJdIHx8IChhdXRoRGF0YSAmJiAhYXV0aERhdGFbcHJvdmlkZXJdLmlkKSkge1xuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHF1ZXJ5S2V5ID0gYGF1dGhEYXRhLiR7cHJvdmlkZXJ9LmlkYDtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0ge307XG4gICAgICBxdWVyeVtxdWVyeUtleV0gPSBhdXRoRGF0YVtwcm92aWRlcl0uaWQ7XG4gICAgICBtZW1vLnB1c2gocXVlcnkpO1xuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfSwgW10pXG4gICAgLmZpbHRlcihxID0+IHtcbiAgICAgIHJldHVybiB0eXBlb2YgcSAhPT0gJ3VuZGVmaW5lZCc7XG4gICAgfSk7XG5cbiAgcmV0dXJuIHF1ZXJ5Lmxlbmd0aCA+IDBcbiAgICA/IGNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgJG9yOiBxdWVyeSB9LCB7IGxpbWl0OiAyIH0pXG4gICAgOiBQcm9taXNlLnJlc29sdmUoW10pO1xufTtcblxuY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gKGF1dGhEYXRhLCB1c2VyQXV0aERhdGEpID0+IHtcbiAgaWYgKCF1c2VyQXV0aERhdGEpIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YTogdHJ1ZSwgbXV0YXRlZEF1dGhEYXRhOiBhdXRoRGF0YSB9O1xuICBjb25zdCBtdXRhdGVkQXV0aERhdGEgPSB7fTtcbiAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgIC8vIEFub255bW91cyBwcm92aWRlciBpcyBub3QgaGFuZGxlZCB0aGlzIHdheVxuICAgIGlmIChwcm92aWRlciA9PT0gJ2Fub255bW91cycpIHJldHVybjtcbiAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgY29uc3QgdXNlclByb3ZpZGVyQXV0aERhdGEgPSB1c2VyQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGlmICghaXNEZWVwU3RyaWN0RXF1YWwocHJvdmlkZXJEYXRhLCB1c2VyUHJvdmlkZXJBdXRoRGF0YSkpIHtcbiAgICAgIG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl0gPSBwcm92aWRlckRhdGE7XG4gICAgfVxuICB9KTtcbiAgY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5sZW5ndGggIT09IDA7XG4gIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YSwgbXV0YXRlZEF1dGhEYXRhIH07XG59O1xuXG5jb25zdCBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luID0gKFxuICBhdXRoRGF0YSA9IHt9LFxuICB1c2VyQXV0aERhdGEgPSB7fSxcbiAgY29uZmlnXG4pID0+IHtcbiAgY29uc3Qgc2F2ZWRVc2VyUHJvdmlkZXJzID0gT2JqZWN0LmtleXModXNlckF1dGhEYXRhKS5tYXAocHJvdmlkZXIgPT4gKHtcbiAgICBuYW1lOiBwcm92aWRlcixcbiAgICBhZGFwdGVyOiBjb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKS5hZGFwdGVyLFxuICB9KSk7XG5cbiAgY29uc3QgaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUoXG4gICAgcHJvdmlkZXIgPT5cbiAgICAgIHByb3ZpZGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIgJiYgcHJvdmlkZXIuYWRhcHRlci5wb2xpY3kgPT09ICdzb2xvJyAmJiBhdXRoRGF0YVtwcm92aWRlci5uYW1lXVxuICApO1xuXG4gIC8vIFNvbG8gcHJvdmlkZXJzIGNhbiBiZSBjb25zaWRlcmVkIGFzIHNhZmUsIHNvIHdlIGRvIG5vdCBoYXZlIHRvIGNoZWNrIGlmIHRoZSB1c2VyIG5lZWRzXG4gIC8vIHRvIHByb3ZpZGUgYW4gYWRkaXRpb25hbCBwcm92aWRlciB0byBsb2dpbi4gQW4gYXV0aCBhZGFwdGVyIHdpdGggXCJzb2xvXCIgKGxpa2Ugd2ViYXV0aG4pIG1lYW5zXG4gIC8vIG5vIFwiYWRkaXRpb25hbFwiIGF1dGggbmVlZHMgdG8gYmUgcHJvdmlkZWQgdG8gbG9naW4gKGxpa2UgT1RQLCBNRkEpXG4gIGlmIChoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kID0gW107XG4gIGNvbnN0IGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciA9IHNhdmVkVXNlclByb3ZpZGVycy5zb21lKHByb3ZpZGVyID0+IHtcbiAgICBpZiAocHJvdmlkZXIgJiYgcHJvdmlkZXIuYWRhcHRlciAmJiBwcm92aWRlci5hZGFwdGVyLnBvbGljeSA9PT0gJ2FkZGl0aW9uYWwnKSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXIubmFtZV0pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQdXNoIG1pc3NpbmcgcHJvdmlkZXIgZm9yIGVycm9yIG1lc3NhZ2VcbiAgICAgICAgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5wdXNoKHByb3ZpZGVyLm5hbWUpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIGlmIChoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgfHwgIWFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQubGVuZ3RoKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgIGBNaXNzaW5nIGFkZGl0aW9uYWwgYXV0aERhdGEgJHthZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLmpvaW4oJywnKX1gXG4gICk7XG59O1xuXG4vLyBWYWxpZGF0ZSBlYWNoIGF1dGhEYXRhIHN0ZXAtYnktc3RlcCBhbmQgcmV0dXJuIHRoZSBwcm92aWRlciByZXNwb25zZXNcbmNvbnN0IGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiA9IGFzeW5jIChhdXRoRGF0YSwgcmVxLCBmb3VuZFVzZXIpID0+IHtcbiAgbGV0IHVzZXI7XG4gIGlmIChmb3VuZFVzZXIpIHtcbiAgICB1c2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4uZm91bmRVc2VyIH0pO1xuICAgIC8vIEZpbmQgdXNlciBieSBzZXNzaW9uIGFuZCBjdXJyZW50IG9iamVjdElkOyBvbmx5IHBhc3MgdXNlciBpZiBpdCdzIHRoZSBjdXJyZW50IHVzZXIgb3IgbWFzdGVyIGtleSBpcyBwcm92aWRlZFxuICB9IGVsc2UgaWYgKFxuICAgIChyZXEuYXV0aCAmJlxuICAgICAgcmVxLmF1dGgudXNlciAmJlxuICAgICAgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgIHJlcS5nZXRVc2VySWQoKSA9PT0gcmVxLmF1dGgudXNlci5pZCkgfHxcbiAgICAocmVxLmF1dGggJiYgcmVxLmF1dGguaXNNYXN0ZXIgJiYgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiYgcmVxLmdldFVzZXJJZCgpKVxuICApIHtcbiAgICB1c2VyID0gbmV3IFBhcnNlLlVzZXIoKTtcbiAgICB1c2VyLmlkID0gcmVxLmF1dGguaXNNYXN0ZXIgPyByZXEuZ2V0VXNlcklkKCkgOiByZXEuYXV0aC51c2VyLmlkO1xuICAgIGF3YWl0IHVzZXIuZmV0Y2goeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSByZXEuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgY29uc3QgcmVxdWVzdE9iamVjdCA9IGdldFJlcXVlc3RPYmplY3QoXG4gICAgdW5kZWZpbmVkLFxuICAgIHJlcS5hdXRoLFxuICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgb3JpZ2luYWxPYmplY3QgfHwgdXNlcixcbiAgICByZXEuY29uZmlnXG4gICk7XG4gIC8vIFBlcmZvcm0gdmFsaWRhdGlvbiBhcyBzdGVwLWJ5LXN0ZXAgcGlwZWxpbmUgZm9yIGJldHRlciBlcnJvciBjb25zaXN0ZW5jeVxuICAvLyBhbmQgYWxzbyB0byBhdm9pZCB0byB0cmlnZ2VyIGEgcHJvdmlkZXIgKGxpa2UgT1RQIFNNUykgaWYgYW5vdGhlciBvbmUgZmFpbHNcbiAgcmV0dXJuIHJlZHVjZVByb21pc2UoXG4gICAgLy8gYXBwbHkgc29ydCB0byBydW4gdGhlIHBpcGVsaW5lIGVhY2ggdGltZSBpbiB0aGUgc2FtZSBvcmRlclxuICAgIE9iamVjdC5rZXlzKGF1dGhEYXRhKS5zb3J0KCksXG4gICAgYXN5bmMgKGFjYywgcHJvdmlkZXIpID0+IHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IG51bGw7XG4gICAgICAgIHJldHVybiBhY2M7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHZhbGlkYXRvciB9ID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgY29uc3QgYXV0aFByb3ZpZGVyID0gKHJlcS5jb25maWcuYXV0aCB8fCB7fSlbcHJvdmlkZXJdIHx8IHt9O1xuICAgICAgaWYgKGF1dGhQcm92aWRlci5lbmFibGVkID09IG51bGwpIHtcbiAgICAgICAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oe1xuICAgICAgICAgIHVzYWdlOiBgYXV0aC4ke3Byb3ZpZGVyfWAsXG4gICAgICAgICAgc29sdXRpb246IGBhdXRoLiR7cHJvdmlkZXJ9LmVuYWJsZWQ6IHRydWVgLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmICghdmFsaWRhdG9yIHx8IGF1dGhQcm92aWRlci5lbmFibGVkID09PSBmYWxzZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgY29uc3QgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRvcihhdXRoRGF0YVtwcm92aWRlcl0sIHJlcSwgdXNlciwgcmVxdWVzdE9iamVjdCk7XG4gICAgICBpZiAodmFsaWRhdGlvblJlc3VsdCkge1xuICAgICAgICBpZiAoIU9iamVjdC5rZXlzKHZhbGlkYXRpb25SZXN1bHQpLmxlbmd0aCkgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcblxuICAgICAgICBpZiAodmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZSkgYWNjLmF1dGhEYXRhUmVzcG9uc2VbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZTtcbiAgICAgICAgLy8gU29tZSBhdXRoIHByb3ZpZGVycyBhZnRlciBpbml0aWFsaXphdGlvbiB3aWxsIGF2b2lkIHRvIHJlcGxhY2UgYXV0aERhdGEgYWxyZWFkeSBzdG9yZWRcbiAgICAgICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0LmRvTm90U2F2ZSkge1xuICAgICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnNhdmUgfHwgYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBTdXBwb3J0IGN1cnJlbnQgYXV0aERhdGEgYmVoYXZpb3Igbm8gcmVzdWx0IHN0b3JlIHRoZSBuZXcgQXV0aERhdGFcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSxcbiAgICB7IGF1dGhEYXRhOiB7fSwgYXV0aERhdGFSZXNwb25zZToge30gfVxuICApO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIEF1dGgsXG4gIG1hc3RlcixcbiAgbm9ib2R5LFxuICByZWFkT25seSxcbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbixcbiAgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbixcbiAgZmluZFVzZXJzV2l0aEF1dGhEYXRhLFxuICBoYXNNdXRhdGVkQXV0aERhdGEsXG4gIGNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4sXG4gIHJlZHVjZVByb21pc2UsXG4gIGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbixcbn07XG4iXX0=