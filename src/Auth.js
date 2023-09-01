const Parse = require('parse/node');
import { isDeepStrictEqual } from 'util';
import { getRequestObject, resolveError } from './triggers';
import Deprecator from './Deprecator/Deprecator';
import { logger } from './logger';
import RestQuery from './RestQuery';
import RestWrite from './RestWrite';

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
  installationId,
}) {
  this.config = config;
  this.cacheController = cacheController || (config && config.cacheController);
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
  return new Auth({ config, isMaster: true });
}

// A helper to get a maintenance-level Auth object
function maintenance(config) {
  return new Auth({ config, isMaintenance: true });
}

// A helper to get a master-level Auth object
function readOnly(config) {
  return new Auth({ config, isMaster: true, isReadOnly: true });
}

// A helper to get a nobody-level Auth object
function nobody(config) {
  return new Auth({ config, isMaster: false });
}

const throttle = {};
const renewSessionIfNeeded = async ({ config, session, sessionToken }) => {
  if (!config?.extendSessionOnUse) {
    return;
  }
  clearTimeout(throttle[sessionToken]);
  throttle[sessionToken] = setTimeout(async () => {
    try {
      if (!session) {
        const query = await RestQuery({
          method: RestQuery.Method.get,
          config,
          auth: master(config),
          runBeforeFind: false,
          className: '_Session',
          restWhere: { sessionToken },
          restOptions: { limit: 1 },
        });
        const { results } = await query.execute();
        session = results[0];
      }
      const lastUpdated = new Date(session?.updatedAt);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastUpdated > yesterday || !session) {
        return;
      }
      const expiresAt = config.generateSessionExpiresAt();
      await new RestWrite(
        config,
        master(config),
        '_Session',
        { objectId: session.objectId },
        { expiresAt: Parse._encode(expiresAt) }
      ).execute();
    } catch (e) {
      if (e?.code !== Parse.Error.OBJECT_NOT_FOUND) {
        logger.error('Could not update session expiry: ', e);
      }
    }
  }, 500);
};

// Returns a promise that resolves to an Auth object
const getAuthForSessionToken = async function ({
  config,
  cacheController,
  sessionToken,
  installationId,
}) {
  cacheController = cacheController || (config && config.cacheController);
  if (cacheController) {
    const userJSON = await cacheController.user.get(sessionToken);
    if (userJSON) {
      const cachedUser = Parse.Object.fromJSON(userJSON);
      renewSessionIfNeeded({ config, sessionToken });
      return Promise.resolve(
        new Auth({
          config,
          cacheController,
          isMaster: false,
          installationId,
          user: cachedUser,
        })
      );
    }
  }

  let results;
  if (config) {
    const restOptions = {
      limit: 1,
      include: 'user',
    };
    const RestQuery = require('./RestQuery');
    const query = await RestQuery({
      method: RestQuery.Method.get,
      config,
      runBeforeFind: false,
      auth: master(config),
      className: '_Session',
      restWhere: { sessionToken },
      restOptions,
    });
    results = (await query.execute()).results;
  } else {
    results = (
      await new Parse.Query(Parse.Session)
        .limit(1)
        .include('user')
        .equalTo('sessionToken', sessionToken)
        .find({ useMasterKey: true })
    ).map(obj => obj.toJSON());
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
  renewSessionIfNeeded({ config, session, sessionToken });
  const userObject = Parse.Object.fromJSON(obj);
  return new Auth({
    config,
    cacheController,
    isMaster: false,
    installationId,
    user: userObject,
  });
};

var getAuthForLegacySessionToken = async function ({ config, sessionToken, installationId }) {
  var restOptions = {
    limit: 1,
  };
  const RestQuery = require('./RestQuery');
  var query = await RestQuery({
    method: RestQuery.Method.get,
    config,
    runBeforeFind: false,
    auth: master(config),
    className: '_User',
    restWhere: { _session_token: sessionToken },
    restOptions,
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
      user: userObject,
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
        objectId: this.user.id,
      },
    };
    const RestQuery = require('./RestQuery');
    const query = await RestQuery({
      method: RestQuery.Method.find,
      runBeforeFind: false,
      config: this.config,
      auth: master(this.config),
      className: '_Role',
      restWhere,
    });
    await query.each(result => results.push(result));
  } else {
    await new Parse.Query(Parse.Role)
      .equalTo('users', this.user)
      .each(result => results.push(result.toJSON()), { useMasterKey: true });
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

  const rolesMap = results.reduce(
    (m, r) => {
      m.names.push(r.name);
      m.ids.push(r.objectId);
      return m;
    },
    { ids: [], names: [] }
  );

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
    await new Parse.Query(Parse.Role)
      .containedIn(
        'roles',
        ins.map(id => {
          const role = new Parse.Object(Parse.Role);
          role.id = id;
          return role;
        })
      )
      .each(result => results.push(result.toJSON()), { useMasterKey: true });
  } else {
    const roles = ins.map(id => {
      return {
        __type: 'Pointer',
        className: '_Role',
        objectId: id,
      };
    });
    const restWhere = { roles: { $in: roles } };
    const RestQuery = require('./RestQuery');
    const query = await RestQuery({
      method: RestQuery.Method.find,
      config: this.config,
      runBeforeFind: false,
      auth: master(this.config),
      className: '_Role',
      restWhere,
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

  return this.getRolesByIds(ins)
    .then(results => {
      // Nothing found
      if (!results.length) {
        return Promise.resolve(names);
      }
      // Map the results with all Ids and names
      const resultMap = results.reduce(
        (memo, role) => {
          memo.names.push(role.name);
          memo.ids.push(role.objectId);
          return memo;
        },
        { ids: [], names: [] }
      );
      // store the new found names
      names = names.concat(resultMap.names);
      // find the next ones, circular roles will be cut
      return this._getAllRolesNamesForRoleIds(resultMap.ids, names, queriedRoles);
    })
    .then(names => {
      return Promise.resolve([...new Set(names)]);
    });
};

const findUsersWithAuthData = (config, authData) => {
  const providers = Object.keys(authData);
  const query = providers
    .reduce((memo, provider) => {
      if (!authData[provider] || (authData && !authData[provider].id)) {
        return memo;
      }
      const queryKey = `authData.${provider}.id`;
      const query = {};
      query[queryKey] = authData[provider].id;
      memo.push(query);
      return memo;
    }, [])
    .filter(q => {
      return typeof q !== 'undefined';
    });

  return query.length > 0
    ? config.database.find('_User', { $or: query }, { limit: 2 })
    : Promise.resolve([]);
};

const hasMutatedAuthData = (authData, userAuthData) => {
  if (!userAuthData) return { hasMutatedAuthData: true, mutatedAuthData: authData };
  const mutatedAuthData = {};
  Object.keys(authData).forEach(provider => {
    // Anonymous provider is not handled this way
    if (provider === 'anonymous') return;
    const providerData = authData[provider];
    const userProviderAuthData = userAuthData[provider];
    if (!isDeepStrictEqual(providerData, userProviderAuthData)) {
      mutatedAuthData[provider] = providerData;
    }
  });
  const hasMutatedAuthData = Object.keys(mutatedAuthData).length !== 0;
  return { hasMutatedAuthData, mutatedAuthData };
};

const checkIfUserHasProvidedConfiguredProvidersForLogin = (
  req = {},
  authData = {},
  userAuthData = {},
  config
) => {
  const savedUserProviders = Object.keys(userAuthData).map(provider => ({
    name: provider,
    adapter: config.authDataManager.getValidatorForProvider(provider).adapter,
  }));

  const hasProvidedASoloProvider = savedUserProviders.some(
    provider =>
      provider && provider.adapter && provider.adapter.policy === 'solo' && authData[provider.name]
  );

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
        master: req.auth.isMaster,
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

  throw new Parse.Error(
    Parse.Error.OTHER_CAUSE,
    `Missing additional authData ${additionProvidersNotFound.join(',')}`
  );
};

// Validate each authData step-by-step and return the provider responses
const handleAuthDataValidation = async (authData, req, foundUser) => {
  let user;
  if (foundUser) {
    user = Parse.User.fromJSON({ className: '_User', ...foundUser });
    // Find user by session and current objectId; only pass user if it's the current user or master key is provided
  } else if (
    (req.auth &&
      req.auth.user &&
      typeof req.getUserId === 'function' &&
      req.getUserId() === req.auth.user.id) ||
    (req.auth && req.auth.isMaster && typeof req.getUserId === 'function' && req.getUserId())
  ) {
    user = new Parse.User();
    user.id = req.auth.isMaster ? req.getUserId() : req.auth.user.id;
    await user.fetch({ useMasterKey: true });
  }

  const { updatedObject } = req.buildParseObjects();
  const requestObject = getRequestObject(undefined, req.auth, updatedObject, user, req.config);
  // Perform validation as step-by-step pipeline for better error consistency
  // and also to avoid to trigger a provider (like OTP SMS) if another one fails
  const acc = { authData: {}, authDataResponse: {} };
  const authKeys = Object.keys(authData).sort();
  for (const provider of authKeys) {
    let method = '';
    try {
      if (authData[provider] === null) {
        acc.authData[provider] = null;
        continue;
      }
      const { validator } = req.config.authDataManager.getValidatorForProvider(provider);
      const authProvider = (req.config.auth || {})[provider] || {};
      if (authProvider.enabled == null) {
        Deprecator.logRuntimeDeprecation({
          usage: `Using the authentication adapter "${provider}" without explicitly enabling it`,
          solution: `Enable the authentication adapter by setting the Parse Server option "auth.${provider}.enabled: true".`,
        });
      }
      if (!validator || authProvider.enabled === false) {
        throw new Parse.Error(
          Parse.Error.UNSUPPORTED_SERVICE,
          'This authentication method is unsupported.'
        );
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
      const e = resolveError(err, {
        code: Parse.Error.SCRIPT_FAILED,
        message: 'Auth failed. Unknown error.',
      });
      const userString =
        req.auth && req.auth.user ? req.auth.user.id : req.data.objectId || undefined;
      logger.error(
        `Failed running auth step ${method} for ${provider} for user ${userString} with Error: ` +
          JSON.stringify(e),
        {
          authenticationStep: method,
          error: e,
          user: userString,
          provider,
        }
      );
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
  handleAuthDataValidation,
};
