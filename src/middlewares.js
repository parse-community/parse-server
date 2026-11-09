import AppCache from './cache';
import Utils from './Utils';
import Parse from 'parse/node';
import auth from './Auth';
import Config from './Config';
import defaultLogger from './logger';
import rest from './rest';
import MongoStorageAdapter from './Adapters/Storage/Mongo/MongoStorageAdapter';
import PostgresStorageAdapter from './Adapters/Storage/Postgres/PostgresStorageAdapter';
import rateLimit from 'express-rate-limit';
import { RateLimitOptions } from './Options/Definitions';
import { pathToRegexp } from 'path-to-regexp';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import { BlockList, isIPv4 } from 'net';
import { createHash } from 'crypto';
import { createSanitizedHttpError, createSanitizedError } from './Error';

export const DEFAULT_ALLOWED_HEADERS =
  'X-Parse-Master-Key, X-Parse-REST-API-Key, X-Parse-Javascript-Key, X-Parse-Application-Id, X-Parse-Client-Version, X-Parse-Session-Token, X-Requested-With, X-Parse-Revocable-Session, X-Parse-Request-Id, Content-Type, Pragma, Cache-Control';

const getMountForRequest = function (req) {
  const mountPathLength = req.originalUrl.length - req.url.length;
  const mountPath = req.originalUrl.slice(0, mountPathLength);
  return req.protocol + '://' + req.get('host') + mountPath;
};

const getBlockList = (ipRangeList, store) => {
  if (store.get('blockList')) { return store.get('blockList'); }
  const blockList = new BlockList();
  ipRangeList.forEach(fullIp => {
    if (fullIp === '::/0' || fullIp === '::' || fullIp === '::0') {
      store.set('allowAllIpv6', true);
      return;
    }
    if (fullIp === '0.0.0.0/0' || fullIp === '0.0.0.0') {
      store.set('allowAllIpv4', true);
      return;
    }
    const [ip, mask] = fullIp.split('/');
    if (!mask) {
      blockList.addAddress(ip, isIPv4(ip) ? 'ipv4' : 'ipv6');
    } else {
      blockList.addSubnet(ip, Number(mask), isIPv4(ip) ? 'ipv4' : 'ipv6');
    }
  });
  store.set('blockList', blockList);
  return blockList;
};

export const checkIp = (ip, ipRangeList, store) => {
  const incomingIpIsV4 = isIPv4(ip);
  const blockList = getBlockList(ipRangeList, store);

  if (store.get(ip)) { return true; }
  if (store.get('allowAllIpv4') && incomingIpIsV4) { return true; }
  if (store.get('allowAllIpv6') && !incomingIpIsV4) { return true; }
  const result = blockList.check(ip, incomingIpIsV4 ? 'ipv4' : 'ipv6');

  // If the ip is in the list, we store the result in the store
  // so we have a optimized path for the next request
  if (ipRangeList.includes(ip) && result) {
    store.set(ip, result);
  }
  return result;
};

// Checks that the request is authorized for this app and checks user
// auth too.
// The bodyparser should run before this middleware.
// Adds info to the request:
// req.config - the Config for this app
// req.auth - the Auth for this request
export async function handleParseHeaders(req, res, next) {
  var mount = getMountForRequest(req);

  let context = {};
  if (req.get('X-Parse-Cloud-Context') != null) {
    try {
      context = JSON.parse(req.get('X-Parse-Cloud-Context'));
      if (Object.prototype.toString.call(context) !== '[object Object]') {
        throw 'Context is not an object';
      }
    } catch {
      return malformedContext(req, res);
    }
  }
  var info = {
    appId: req.get('X-Parse-Application-Id'),
    sessionToken: req.get('X-Parse-Session-Token'),
    masterKey: req.get('X-Parse-Master-Key'),
    maintenanceKey: req.get('X-Parse-Maintenance-Key'),
    installationId: req.get('X-Parse-Installation-Id'),
    clientKey: req.get('X-Parse-Client-Key'),
    javascriptKey: req.get('X-Parse-Javascript-Key'),
    dotNetKey: req.get('X-Parse-Windows-Key'),
    restAPIKey: req.get('X-Parse-REST-API-Key'),
    context: context,
  };

  var basicAuth = httpAuth(req);

  if (basicAuth) {
    var basicAuthAppId = basicAuth.appId;
    if (AppCache.get(basicAuthAppId)) {
      info.appId = basicAuthAppId;
      info.masterKey = basicAuth.masterKey || info.masterKey;
      info.javascriptKey = basicAuth.javascriptKey || info.javascriptKey;
    }
  }

  if (req.body) {
    // Unity SDK sends a _noBody key which needs to be removed.
    // Unclear at this point if action needs to be taken.
    delete req.body._noBody;
  }

  var fileViaJSON = false;

  if (!info.appId || !AppCache.get(info.appId)) {
    // See if we can find the app id on the body.
    if (Buffer.isBuffer(req.body)) {
      // The only chance to find the app id is if this is a file
      // upload that actually is a JSON body. So try to parse it.
      // https://github.com/parse-community/parse-server/issues/6589
      // It is also possible that the client is trying to upload a file but forgot
      // to provide x-parse-app-id in header and parse a binary file will fail
      try {
        req.body = JSON.parse(req.body);
      } catch {
        return invalidRequest(req, res);
      }
      fileViaJSON = true;
    }

    if (req.body) {
      delete req.body._RevocableSession;
    }

    if (
      req.body &&
      req.body._ApplicationId &&
      AppCache.get(req.body._ApplicationId) &&
      (!info.masterKey || AppCache.get(req.body._ApplicationId).masterKey === info.masterKey)
    ) {
      info.appId = req.body._ApplicationId;
      info.javascriptKey = req.body._JavaScriptKey || '';
      delete req.body._ApplicationId;
      delete req.body._JavaScriptKey;
      // TODO: test that the REST API formats generated by the other
      // SDKs are handled ok
      delete req.body._ClientVersion;
      if (req.body._InstallationId) {
        if (typeof req.body._InstallationId !== 'string') {
          return invalidRequest(req, res);
        }
        info.installationId = req.body._InstallationId;
        delete req.body._InstallationId;
      }
      if (req.body._SessionToken) {
        if (typeof req.body._SessionToken !== 'string') {
          return invalidRequest(req, res);
        }
        info.sessionToken = req.body._SessionToken;
        delete req.body._SessionToken;
      }
      if (req.body._MasterKey) {
        if (typeof req.body._MasterKey !== 'string') {
          return invalidRequest(req, res);
        }
        info.masterKey = req.body._MasterKey;
        delete req.body._MasterKey;
      }
      if (req.body._context) {
        if (Utils.isObject(req.body._context)) {
          info.context = req.body._context;
        } else {
          try {
            info.context = JSON.parse(req.body._context);
            if (Object.prototype.toString.call(info.context) !== '[object Object]') {
              throw 'Context is not an object';
            }
          } catch {
            return malformedContext(req, res);
          }
        }
        delete req.body._context;
      } else if (req.body._context === null) {
        // null context is equivalent to no context
        delete req.body._context;
      }
      if (req.body._ContentType) {
        if (typeof req.body._ContentType !== 'string') {
          return invalidRequest(req, res);
        }
        req.headers['content-type'] = req.body._ContentType;
        delete req.body._ContentType;
      }
    } else {
      return invalidRequest(req, res);
    }
  }

  if (info.sessionToken && typeof info.sessionToken !== 'string') {
    return invalidRequest(req, res);
  }

  if (fileViaJSON && req.body) {
    if (req.body.base64 && typeof req.body.base64 !== 'string') {
      return invalidRequest(req, res);
    }
    req.fileData = req.body.fileData;
    // We need to repopulate req.body with a buffer
    var base64 = req.body.base64;
    req.body = Buffer.from(base64, 'base64');
  }

  const clientIp = getClientIp(req);
  const config = req.config || Config.get(info.appId, mount);
  if (config.state && config.state !== 'ok') {
    res.status(500);
    res.json({
      code: Parse.Error.INTERNAL_SERVER_ERROR,
      error: `Invalid server state: ${config.state}`,
    });
    return;
  }
  if (!req.config) {
    await config.loadKeys();
  }

  info.app = AppCache.get(info.appId);
  req.config = config;
  req.config.headers = req.headers || {};
  req.config.ip = clientIp;
  req.info = info;

  // Skip key detection if already resolved by handleParseAuth (header-based).
  // Only resolve here for body-based _MasterKey (info.masterKey may come from body).
  if (!req.auth || (!req.auth.isMaster && !req.auth.isMaintenance)) {
    const resolved = await resolveKeyAuth({
      config: req.config,
      keyValue: info.masterKey,
      maintenanceKeyValue: info.maintenanceKey,
      installationId: info.installationId,
      clientIp,
    });
    if (resolved) {
      req.auth = resolved;
    }
  }

  if (req.auth && (req.auth.isMaster || req.auth.isMaintenance)) {
    return handleRateLimit(req, res, next);
  }

  // Client keys are not required in parse-server, but if any have been configured in the server, validate them
  //  to preserve original behavior.
  const keys = ['clientKey', 'javascriptKey', 'dotNetKey', 'restAPIKey'];
  const oneKeyConfigured = keys.some(function (key) {
    return req.config[key] !== undefined;
  });
  const oneKeyMatches = keys.some(function (key) {
    return req.config[key] !== undefined && info[key] === req.config[key];
  });

  if (oneKeyConfigured && !oneKeyMatches) {
    return invalidRequest(req, res);
  }

  if (matchesExactRoute(req.path, '/login')) {
    delete info.sessionToken;
  }

  if (req.userFromJWT) {
    req.auth = new auth.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false,
      user: req.userFromJWT,
    });
    return handleRateLimit(req, res, next);
  }

  if (!info.sessionToken) {
    req.auth = new auth.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false,
    });
  }
  handleRateLimit(req, res, next);
}

const handleRateLimit = async (req, res, next) => {
  const rateLimits = req.config.rateLimits || [];
  try {
    await Promise.all(
      rateLimits.map(async limit => {
        const pathExp = limit.path.regexp || limit.path;
        if (pathExp.test(req.path) || (req._graphQLPath && pathExp.test(req._graphQLPath))) {
          await limit.handler(req, res, err => {
            if (err) {
              if (err.code === Parse.Error.CONNECTION_FAILED) {
                throw err;
              }
              req.config.loggerController.error(
                'An unknown error occured when attempting to apply the rate limiter: ',
                err
              );
            }
          });
        }
      })
    );
  } catch (error) {
    res.status(429);
    res.json({ code: Parse.Error.CONNECTION_FAILED, error: error.message });
    return;
  }
  next();
};

export const handleParseSession = async (req, res, next) => {
  try {
    const info = req.info;
    if (req.auth || (matchesExactRoute(req.path, '/sessions/me') && req.method === 'GET')) {
      next();
      return;
    }
    let requestAuth = null;
    if (
      info.sessionToken &&
      matchesExactRoute(req.path, '/upgradeToRevocableSession') &&
      info.sessionToken.indexOf('r:') != 0
    ) {
      requestAuth = await auth.getAuthForLegacySessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken,
      });
    } else {
      requestAuth = await auth.getAuthForSessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken,
      });
    }
    req.auth = requestAuth;
    next();
  } catch (error) {
    if (error instanceof Parse.Error) {
      next(error);
      return;
    }
    // Log full error details internally, but don't expose to client
    req.config.loggerController.error('error getting auth for sessionToken', error);
    next(new Parse.Error(Parse.Error.UNKNOWN_ERROR, 'Unknown error'));
  }
};

function getClientIp(req) {
  return req.ip;
}

function httpAuth(req) {
  if (!(req.req || req).headers.authorization) { return; }

  var header = (req.req || req).headers.authorization;
  var appId, masterKey, javascriptKey;

  // parse header
  var authPrefix = 'basic ';

  var match = header.toLowerCase().indexOf(authPrefix);

  if (match == 0) {
    var encodedAuth = header.substring(authPrefix.length, header.length);
    var credentials = decodeBase64(encodedAuth).split(':');

    if (credentials.length == 2) {
      appId = credentials[0];
      var key = credentials[1];

      var jsKeyPrefix = 'javascript-key=';

      var matchKey = key.indexOf(jsKeyPrefix);
      if (matchKey == 0) {
        javascriptKey = key.substring(jsKeyPrefix.length, key.length);
      } else {
        masterKey = key;
      }
    }
  }

  return { appId: appId, masterKey: masterKey, javascriptKey: javascriptKey };
}

function decodeBase64(str) {
  return Buffer.from(str, 'base64').toString();
}

export function allowCrossDomain(appId) {
  return (req, res, next) => {
    const config = Config.get(appId, getMountForRequest(req));
    let allowHeaders = DEFAULT_ALLOWED_HEADERS;
    if (config && config.allowHeaders) {
      allowHeaders += `, ${config.allowHeaders.join(', ')}`;
    }

    const baseOrigins =
      typeof config?.allowOrigin === 'string' ? [config.allowOrigin] : config?.allowOrigin ?? ['*'];
    const requestOrigin = req.headers.origin;
    const allowOrigins =
      requestOrigin && baseOrigins.includes(requestOrigin) ? requestOrigin : baseOrigins[0];
    res.header('Access-Control-Allow-Origin', allowOrigins);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', allowHeaders);
    res.header('Access-Control-Expose-Headers', 'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id');
    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
      res.sendStatus(200);
    } else {
      next();
    }
  };
}

export function allowMethodOverride(req, res, next) {
  if (req.method === 'POST' && req.body?._method) {
    if (typeof req.body._method === 'string') {
      req.originalMethod = req.method;
      req.method = req.body._method.toUpperCase();
    }
    delete req.body._method;
  }
  next();
}

async function resolveKeyAuth({ config, keyValue, maintenanceKeyValue, installationId, clientIp }) {
  if (maintenanceKeyValue && maintenanceKeyValue === config.maintenanceKey) {
    if (checkIp(clientIp, config.maintenanceKeyIps || [], config.maintenanceKeyIpsStore)) {
      return new auth.Auth({ config, installationId, isMaintenance: true });
    }
    const log = config.loggerController || defaultLogger;
    log.error(
      `Request using maintenance key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'maintenanceKeyIps'.`
    );
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized';
    throw error;
  }
  const masterKey = await config.loadMasterKey();
  if (keyValue === masterKey) {
    if (checkIp(clientIp, config.masterKeyIps || [], config.masterKeyIpsStore)) {
      return new auth.Auth({ config, installationId, isMaster: true });
    }
    const log = config.loggerController || defaultLogger;
    log.error(
      `Request using master key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'masterKeyIps'.`
    );
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized';
    throw error;
  }
  if (
    keyValue &&
    typeof config.readOnlyMasterKey !== 'undefined' &&
    config.readOnlyMasterKey &&
    keyValue === config.readOnlyMasterKey
  ) {
    if (checkIp(clientIp, config.readOnlyMasterKeyIps || [], config.readOnlyMasterKeyIpsStore)) {
      return new auth.Auth({ config, installationId, isMaster: true, isReadOnly: true });
    }
    const log = config.loggerController || defaultLogger;
    log.error(
      `Request using read-only master key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'readOnlyMasterKeyIps'.`
    );
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized';
    throw error;
  }
  return null;
}

export function handleParseAuth(appId) {
  return async (req, res, next) => {
    const mount = getMountForRequest(req);
    const config = Config.get(appId, mount);
    if (!config) {
      return next();
    }
    req.config = config;
    const clientIp = getClientIp(req);
    req.config.ip = clientIp;
    await config.loadKeys();
    const resolved = await resolveKeyAuth({
      config,
      keyValue: req.get('X-Parse-Master-Key') || null,
      maintenanceKeyValue: req.get('X-Parse-Maintenance-Key') || null,
      installationId: req.get('X-Parse-Installation-Id') || 'cloud',
      clientIp,
    });
    if (resolved) {
      req.auth = resolved;
    }
    return next();
  };
}

export function handleParseHealth(options) {
  return (req, res) => {
    res.status(options.state === 'ok' ? 200 : 503);
    if (options.state === 'starting') {
      res.set('Retry-After', 1);
    }
    res.json({
      status: options.state,
    });
  };
}

function normalizeRouteAllowListPath(path, mount) {
  let normalized = path;
  if (mount) {
    const mountPath = new URL(mount).pathname;
    if (normalized.startsWith(mountPath)) {
      normalized = normalized.substring(mountPath.length);
    }
  }
  if (normalized.startsWith('/')) {
    normalized = normalized.substring(1);
  }
  if (normalized.endsWith('/')) {
    normalized = normalized.substring(0, normalized.length - 1);
  }
  const queryIndex = normalized.indexOf('?');
  if (queryIndex !== -1) {
    normalized = normalized.substring(0, queryIndex);
  }
  return normalized;
}

// Cache of compiled exact-route matchers, keyed by route. Mirrors how `addRateLimit` compiles a
// route's `pathToRegexp` once and reuses it, avoiding recompilation on every request.
const exactRouteRegexpCache = Object.create(null);

/**
 * Returns true if `path` resolves to the given exact static `route`, using the same
 * `path-to-regexp` matching that the Express router and the rate limiter use (case-insensitive
 * and trailing-slash-tolerant by default). Path-literal checks — such as detecting `/login` to
 * drop the inbound session token — must use this so they stay consistent with how the router
 * actually dispatches the request, instead of re-deriving the matching rules by hand.
 * @param {string} path The request path (e.g. `req.path` or a batch sub-request routable path).
 * @param {string} route The exact static route to match (e.g. `/login`).
 * @returns {boolean}
 */
export function matchesExactRoute(path, route) {
  if (typeof path !== 'string') {
    return false;
  }
  if (!exactRouteRegexpCache[route]) {
    exactRouteRegexpCache[route] = pathToRegexp(route).regexp;
  }
  return exactRouteRegexpCache[route].test(path);
}

export function isRouteAllowed(path, config, auth) {
  if (!config || config.routeAllowList === undefined || config.routeAllowList === null) {
    return true;
  }
  if (auth && (auth.isMaster || auth.isMaintenance)) {
    return true;
  }
  const normalized = normalizeRouteAllowListPath(path, config.mount);
  const regexes = config._routeAllowListRegex || [];
  for (const regex of regexes) {
    if (regex.test(normalized)) {
      return true;
    }
  }
  return false;
}

export function enforceRouteAllowList(req, res, next) {
  if (isRouteAllowed(req.originalUrl, req.config, req.auth)) {
    return next();
  }
  const path = normalizeRouteAllowListPath(req.originalUrl, req.config?.mount);
  throw createSanitizedError(
    Parse.Error.OPERATION_FORBIDDEN,
    `Route not allowed by routeAllowList: ${req.method} ${path}`,
    req.config
  );
}

export function handleParseErrors(err, req, res, next) {
  const log = (req.config && req.config.loggerController) || defaultLogger;
  if (err instanceof Parse.Error) {
    if (req.config && req.config.enableExpressErrorHandler) {
      return next(err);
    }
    const signupUsernameTakenLevel =
      req.config?.logLevels?.signupUsernameTaken || 'info';
    let httpStatus;
    // TODO: fill out this mapping
    switch (err.code) {
      case Parse.Error.INTERNAL_SERVER_ERROR:
        httpStatus = 500;
        break;
      case Parse.Error.OBJECT_NOT_FOUND:
        httpStatus = 404;
        break;
      default:
        httpStatus = 400;
    }
    res.status(httpStatus);
    res.json({ code: err.code, error: err.message });
    if (err.code === Parse.Error.USERNAME_TAKEN) {
      if (signupUsernameTakenLevel !== 'silent') {
        const loggerMethod =
          typeof log[signupUsernameTakenLevel] === 'function'
            ? log[signupUsernameTakenLevel].bind(log)
            : log.error.bind(log);
        loggerMethod('Parse error: ', err);
      }
    } else {
      log.error('Parse error: ', err);
    }
  } else if (err.status && err.message) {
    res.status(err.status);
    res.json({ error: err.message });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  } else {
    log.error('Uncaught internal server error.', err, err.stack);
    res.status(500);
    res.json({
      code: Parse.Error.INTERNAL_SERVER_ERROR,
      message: 'Internal server error.',
    });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  }
}

export function enforceMasterKeyAccess(req, res, next) {
  if (!req.auth.isMaster) {
    const error = createSanitizedHttpError(403, 'unauthorized: master key is required', req.config);
    res.status(error.status);
    res.end(`{"error":"${error.message}"}`);
    return;
  }
  next();
}

export function promiseEnforceMasterKeyAccess(request) {
  if (!request.auth.isMaster) {
    throw createSanitizedHttpError(403, 'unauthorized: master key is required', request.config);
  }
  return Promise.resolve();
}

/**
 * Determines whether a request is an internal request, i.e. one that originates from the same host
 * without passing through a proxy, such as a Cloud Code request that is routed via HTTP when the
 * Parse Server option `directAccess` is `false`. Only the raw socket peer address is consulted,
 * never `request.ip`: under a permissive `trustProxy` setting Express resolves `request.ip` from
 * the client-supplied `X-Forwarded-For` header, so a remote client could otherwise pose as an
 * internal request. A request that carries an `X-Forwarded-For` header, even an empty one, has been
 * forwarded by a proxy or crafted by a client and is therefore never internal, even if it arrives
 * over a loopback socket.
 * @param {Object} request The request to evaluate.
 * @returns {Boolean} Whether the request is internal.
 */
const isInternalRequest = request =>
  request.socket?.remoteAddress === '127.0.0.1' &&
  request.headers?.['x-forwarded-for'] === undefined;

/**
 * Returns a deterministic scope identifier for a rate limit rule, derived from
 * the rule identity: request path, request methods, zone, time window,
 * request count and request eligibility (whether internal requests and
 * master-key requests are counted). Two rules that differ in any of these get
 * different scopes, so they never share a rate limit counter; identical rules
 * get the same scope, so a limit still aggregates across server instances that
 * share a Redis store. The identifier is a compact hash because the request
 * path is a path-to-regexp pattern and must not be used verbatim as a key
 * segment. A `requestMethods` value given as a RegExp is encoded by its
 * source and flags, because a RegExp serializes to `{}` with `JSON.stringify`
 * and two rules that differ only by `/GET/` versus `/POST/` would otherwise
 * share a scope.
 * @param {object} route The rate limit rule as passed to `addRateLimit`.
 * @returns {string} A 12-character hex scope for the rule.
 */
export const getRateLimitRuleScope = route => {
  const encodeRequestMethod = method =>
    Utils.isRegExp(method) ? `/${method.source}/${method.flags}` : method;
  const requestMethods = Array.isArray(route.requestMethods)
    ? [...route.requestMethods].map(encodeRequestMethod).sort()
    : encodeRequestMethod(route.requestMethods);
  const identity = {
    requestPath: route.requestPath,
    requestMethods,
    zone: route.zone || RateLimitOptions.zone.default,
    requestTimeWindow: route.requestTimeWindow,
    requestCount: route.requestCount,
    includeInternalRequests: Boolean(route.includeInternalRequests),
    includeMasterKey: Boolean(route.includeMasterKey),
  };
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 12);
};

export const addRateLimit = (route, config, cloud) => {
  if (typeof config === 'string') {
    config = Config.get(config);
  }
  for (const key in route) {
    if (!RateLimitOptions[key]) {
      throw `Invalid rate limit option "${key}"`;
    }
  }
  if (!config.rateLimits) {
    config.rateLimits = [];
  }
  // Each rate limit rule gets its own key scope, derived deterministically from
  // the rule identity (route, methods, zone, window and count). Without this,
  // all rules sharing a store would count against the same key -- which for
  // Redis means the same `rl:<identity>` key and TTL -- and a request to one
  // route would consume the quota of an unrelated route. The scope is applied
  // in two places on purpose: the key generator isolates the counters for
  // every store implementation (including the default in-memory store), while
  // the Redis store prefix additionally namespaces the keys in Redis itself,
  // so that keys of different rules can be distinguished when inspecting Redis.
  const ruleScope = getRateLimitRuleScope(route);
  const redisStore = {
    connectionPromise: Promise.resolve(),
    store: null,
  };
  if (route.redisUrl) {
    const log = config?.loggerController || defaultLogger;
    const client = createClient({
      url: route.redisUrl,
    });
    client.on('error', err => { log.error('Middlewares addRateLimit Redis client error', { error: err }) });
    client.on('connect', () => { });
    client.on('reconnecting', () => { });
    client.on('ready', () => { });
    redisStore.connectionPromise = async () => {
      if (client.isOpen) {
        return;
      }
      try {
        await client.connect();
      } catch (e) {
        log.error(`Could not connect to redisURL in rate limit: ${e}`);
      }
    };
    redisStore.connectionPromise();
    redisStore.store = new RedisStore({
      sendCommand: async (...args) => {
        await redisStore.connectionPromise();
        return client.sendCommand(args);
      },
      // Scope the Redis key namespace to this rule; without a prefix every
      // rule shares the default `rl:` prefix and thus the same keys.
      prefix: `rl:${ruleScope}:`,
    });
  }
  config.rateLimits.push({
    path: pathToRegexp(route.requestPath),
    requestCount: route.requestCount,
    requestMethods: route.requestMethods,
    includeMasterKey: route.includeMasterKey,
    includeInternalRequests: route.includeInternalRequests,
    errorResponseMessage: route.errorResponseMessage || RateLimitOptions.errorResponseMessage.default,
    handler: rateLimit({
      windowMs: route.requestTimeWindow,
      max: route.requestCount,
      message: route.errorResponseMessage || RateLimitOptions.errorResponseMessage.default,
      handler: (request, response, next, options) => {
        throw {
          code: Parse.Error.CONNECTION_FAILED,
          message: options.message,
        };
      },
      skip: request => {
        if (!route.includeInternalRequests && isInternalRequest(request)) {
          return true;
        }
        if (route.includeMasterKey) {
          return false;
        }
        if (route.requestMethods) {
          const methodsToCheck = new Set([request.method]);
          if (request._batchOriginalMethod) {
            methodsToCheck.add(request._batchOriginalMethod);
          }
          if (Array.isArray(route.requestMethods)) {
            if (!route.requestMethods.some(m => methodsToCheck.has(m))) {
              return true;
            }
          } else {
            const regExp = new RegExp(route.requestMethods);
            if (![...methodsToCheck].some(m => regExp.test(m))) {
              return true;
            }
          }
        }
        return request.auth?.isMaster;
      },
      keyGenerator: async request => {
        // The returned key is scoped to this rule (see `ruleScope` above), so
        // that different rules never share a counter, even when they use the
        // same store. The identity part is unchanged: app ID, session token,
        // user ID or IP address, depending on the configured zone.
        let identity;
        if (route.zone === Parse.Server.RateLimitZone.global) {
          identity = request.config.appId;
        } else {
          const token = request.info.sessionToken;
          if (route.zone === Parse.Server.RateLimitZone.session && token) {
            identity = token;
          } else if (route.zone === Parse.Server.RateLimitZone.user && token) {
            if (!request.auth) {
              await new Promise(resolve => handleParseSession(request, null, resolve));
            }
            identity = request.auth?.user?.id || request.config.ip;
          } else {
            identity = request.config.ip;
          }
        }
        return `${ruleScope}:${identity}`;
      },
      store: redisStore.store,
    }),
    cloud,
  });
  Config.put(config);
};

/**
 * Deduplicates a request to ensure idempotency. Duplicates are determined by the request ID
 * in the request header. If a request has no request ID, it is executed anyway.
 * @param {*} req The request to evaluate.
 * @returns Promise<{}>
 */
export function promiseEnsureIdempotency(req) {
  // Enable feature only for MongoDB
  if (
    !(
      req.config.database.adapter instanceof MongoStorageAdapter ||
      req.config.database.adapter instanceof PostgresStorageAdapter
    )
  ) {
    return Promise.resolve();
  }
  // Get parameters
  const config = req.config;
  const requestId = ((req || {}).headers || {})['x-parse-request-id'];
  const { paths, ttl } = config.idempotencyOptions;
  if (!requestId || !config.idempotencyOptions) {
    return Promise.resolve();
  }
  // Request path may contain trailing slashes, depending on the original request, so remove
  // leading and trailing slashes to make it easier to specify paths in the configuration
  const reqPath = req.path.replace(/^\/|\/$/, '');
  // Determine whether idempotency is enabled for current request path
  let match = false;
  for (const path of paths) {
    // Assume one wants a path to always match from the beginning to prevent any mistakes
    const regex = new RegExp(path.charAt(0) === '^' ? path : '^' + path);
    if (reqPath.match(regex)) {
      match = true;
      break;
    }
  }
  if (!match) {
    return Promise.resolve();
  }
  // Try to store request
  const expiryDate = new Date(new Date().setSeconds(new Date().getSeconds() + ttl));
  return rest
    .create(config, auth.master(config), '_Idempotency', {
      reqId: requestId,
      expire: Parse._encode(expiryDate),
    })
    .catch(e => {
      if (e.code == Parse.Error.DUPLICATE_VALUE) {
        throw new Parse.Error(Parse.Error.DUPLICATE_REQUEST, 'Duplicate request');
      }
      throw e;
    });
}

function invalidRequest(req, res) {
  res.status(403);
  res.end('{"error":"unauthorized"}');
}

function malformedContext(req, res) {
  res.status(400);
  res.json({ code: Parse.Error.INVALID_JSON, error: 'Invalid object for context.' });
}

/**
 * Express 4 allowed a double forward slash between a route and router. Although
 * this should be considered an anti-pattern, we need to support it for backwards
 * compatibility.
 *
 * Technically valid URL with double foroward slash:
 * http://localhost:1337/parse//functions/testFunction
 */
export function allowDoubleForwardSlash(req, res, next) {
  req.url = req.url.startsWith('//') ? req.url.substring(1) : req.url;
  next();
}
