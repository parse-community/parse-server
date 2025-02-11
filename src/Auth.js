const Parse = require('parse/node');
import { isDeepStrictEqual } from 'util';
import { getRequestObject, resolveError } from './triggers';
import { logger } from './logger';
import RestQuery from './RestQuery';
import RestWrite from './RestWrite';

// Auth class defines authentication details for a request
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
  this.isReadOnly = isReadOnly;
  this.user = user;
  this.userRoles = [];
  this.fetchedRoles = false;
  this.rolePromise = null;
}

// Check if request is unauthenticated
Auth.prototype.isUnauthenticated = function () {
  return !(this.isMaster || this.isMaintenance || this.user);
};

// Helpers to get different auth levels
function master(config) {
  return new Auth({ config, isMaster: true });
}

function maintenance(config) {
  return new Auth({ config, isMaintenance: true });
}

function readOnly(config) {
  return new Auth({ config, isMaster: true, isReadOnly: true });
}

function nobody(config) {
  return new Auth({ config, isMaster: false });
}

// Check if session should be updated
function shouldUpdateSessionExpiry(config, session) {
  if (!session || !session.updatedAt) return false;
  const resetAfter = config.sessionLength / 2;
  const lastUpdated = new Date(session.updatedAt);
  const thresholdTime = new Date(Date.now() - resetAfter * 1000);
  return lastUpdated <= thresholdTime;
}

// Prevent memory leaks by managing throttled requests properly
const throttle = new Map();

const renewSessionIfNeeded = async ({ config, session, sessionToken }) => {
  if (!config?.extendSessionOnUse) return;

  if (throttle.has(sessionToken)) {
    clearTimeout(throttle.get(sessionToken));
  }

  throttle.set(sessionToken, setTimeout(async () => {
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
      if (!shouldUpdateSessionExpiry(config, session)) return;

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
        logger.error('Could not update session expiry:', e);
      }
    } finally {
      throttle.delete(sessionToken);
    }
  }, 500));
};

// Fetches Auth object for a session token
const getAuthForSessionToken = async function ({
  config,
  cacheController,
  sessionToken,
  installationId,
}) {
  if (!sessionToken) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token is required.');
  }

  cacheController = cacheController || (config && config.cacheController);
  if (cacheController) {
    const userJSON = await cacheController.user.get(sessionToken);
    if (userJSON) {
      const cachedUser = Parse.Object.fromJSON(userJSON);
      renewSessionIfNeeded({ config, sessionToken });
      return new Auth({ config, cacheController, isMaster: false, installationId, user: cachedUser });
    }
  }

  const restOptions = { limit: 1, include: 'user' };
  const query = await RestQuery({
    method: RestQuery.Method.get,
    config,
    runBeforeFind: false,
    auth: master(config),
    className: '_Session',
    restWhere: { sessionToken },
    restOptions,
  });

  const results = (await query.execute()).results;

  if (!results.length || !results[0]['user']) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
  }

  const session = results[0];
  if (new Date(session.expiresAt?.iso) < new Date()) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token is expired.');
  }

  const obj = session.user;
  delete obj.password;
  obj.className = '_User';
  obj.sessionToken = sessionToken;

  if (cacheController) {
    cacheController.user.put(sessionToken, obj);
  }

  renewSessionIfNeeded({ config, session, sessionToken });
  return new Auth({ config, cacheController, isMaster: false, installationId, user: Parse.Object.fromJSON(obj) });
};

// Fetches Auth object for a legacy session token
const getAuthForLegacySessionToken = async function ({ config, sessionToken, installationId }) {
  if (!sessionToken) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token is required.');
  }

  const restOptions = { limit: 1 };
  const query = await RestQuery({
    method: RestQuery.Method.get,
    config,
    runBeforeFind: false,
    auth: master(config),
    className: '_User',
    restWhere: { _session_token: sessionToken },
    restOptions,
  });

  const response = await query.execute();
  const results = response.results;

  if (!results.length) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid legacy session token');
  }

  const obj = results[0];
  obj.className = '_User';

  return new Auth({ config, isMaster: false, installationId, user: Parse.Object.fromJSON(obj) });
};

// Fetch user roles
Auth.prototype.getUserRoles = function () {
  if (this.isMaster || this.isMaintenance || !this.user) return Promise.resolve([]);

  if (this.fetchedRoles) return Promise.resolve(this.userRoles);
  if (this.rolePromise) return this.rolePromise;

  this.rolePromise = this._loadRoles();
  return this.rolePromise;
};

// Load user roles
Auth.prototype._loadRoles = async function () {
  if (!this.user) return [];

  const restWhere = {
    users: { __type: 'Pointer', className: '_User', objectId: this.user.id },
  };

  const query = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: master(this.config),
    className: '_Role',
    restWhere,
  });

  const response = await query.execute();
  this.userRoles = response.results.map(role => role.name);
  this.fetchedRoles = true;
  return this.userRoles;
};

// Exports
module.exports = {
  Auth,
  master,
  maintenance,
  nobody,
  readOnly,
  getAuthForSessionToken,
  getAuthForLegacySessionToken,
};
