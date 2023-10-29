"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addRateLimit = exports.DEFAULT_ALLOWED_HEADERS = void 0;
exports.allowCrossDomain = allowCrossDomain;
exports.allowMethodOverride = allowMethodOverride;
exports.checkIp = void 0;
exports.enforceMasterKeyAccess = enforceMasterKeyAccess;
exports.handleParseErrors = handleParseErrors;
exports.handleParseHeaders = handleParseHeaders;
exports.handleParseSession = void 0;
exports.promiseEnforceMasterKeyAccess = promiseEnforceMasterKeyAccess;
exports.promiseEnsureIdempotency = promiseEnsureIdempotency;
var _cache = _interopRequireDefault(require("./cache"));
var _node = _interopRequireDefault(require("parse/node"));
var _Auth = _interopRequireDefault(require("./Auth"));
var _Config = _interopRequireDefault(require("./Config"));
var _ClientSDK = _interopRequireDefault(require("./ClientSDK"));
var _logger = _interopRequireDefault(require("./logger"));
var _rest = _interopRequireDefault(require("./rest"));
var _MongoStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Mongo/MongoStorageAdapter"));
var _PostgresStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Postgres/PostgresStorageAdapter"));
var _expressRateLimit = _interopRequireDefault(require("express-rate-limit"));
var _Definitions = require("./Options/Definitions");
var _pathToRegexp = require("path-to-regexp");
var _rateLimitRedis = _interopRequireDefault(require("rate-limit-redis"));
var _redis = require("redis");
var _net = require("net");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const DEFAULT_ALLOWED_HEADERS = 'X-Parse-Master-Key, X-Parse-REST-API-Key, X-Parse-Javascript-Key, X-Parse-Application-Id, X-Parse-Client-Version, X-Parse-Session-Token, X-Requested-With, X-Parse-Revocable-Session, X-Parse-Request-Id, Content-Type, Pragma, Cache-Control';
exports.DEFAULT_ALLOWED_HEADERS = DEFAULT_ALLOWED_HEADERS;
const getMountForRequest = function (req) {
  const mountPathLength = req.originalUrl.length - req.url.length;
  const mountPath = req.originalUrl.slice(0, mountPathLength);
  return req.protocol + '://' + req.get('host') + mountPath;
};
const getBlockList = (ipRangeList, store) => {
  if (store.get('blockList')) return store.get('blockList');
  const blockList = new _net.BlockList();
  ipRangeList.forEach(fullIp => {
    if (fullIp === '::/0' || fullIp === '::') {
      store.set('allowAllIpv6', true);
      return;
    }
    if (fullIp === '0.0.0.0') {
      store.set('allowAllIpv4', true);
      return;
    }
    const [ip, mask] = fullIp.split('/');
    if (!mask) {
      blockList.addAddress(ip, (0, _net.isIPv4)(ip) ? 'ipv4' : 'ipv6');
    } else {
      blockList.addSubnet(ip, Number(mask), (0, _net.isIPv4)(ip) ? 'ipv4' : 'ipv6');
    }
  });
  store.set('blockList', blockList);
  return blockList;
};
const checkIp = (ip, ipRangeList, store) => {
  const incomingIpIsV4 = (0, _net.isIPv4)(ip);
  const blockList = getBlockList(ipRangeList, store);
  if (store.get(ip)) return true;
  if (store.get('allowAllIpv4') && incomingIpIsV4) return true;
  if (store.get('allowAllIpv6') && !incomingIpIsV4) return true;
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
exports.checkIp = checkIp;
function handleParseHeaders(req, res, next) {
  var mount = getMountForRequest(req);
  let context = {};
  if (req.get('X-Parse-Cloud-Context') != null) {
    try {
      context = JSON.parse(req.get('X-Parse-Cloud-Context'));
      if (Object.prototype.toString.call(context) !== '[object Object]') {
        throw 'Context is not an object';
      }
    } catch (e) {
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
    clientVersion: req.get('X-Parse-Client-Version'),
    context: context
  };
  var basicAuth = httpAuth(req);
  if (basicAuth) {
    var basicAuthAppId = basicAuth.appId;
    if (_cache.default.get(basicAuthAppId)) {
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
  if (!info.appId || !_cache.default.get(info.appId)) {
    // See if we can find the app id on the body.
    if (req.body instanceof Buffer) {
      // The only chance to find the app id is if this is a file
      // upload that actually is a JSON body. So try to parse it.
      // https://github.com/parse-community/parse-server/issues/6589
      // It is also possible that the client is trying to upload a file but forgot
      // to provide x-parse-app-id in header and parse a binary file will fail
      try {
        req.body = JSON.parse(req.body);
      } catch (e) {
        return invalidRequest(req, res);
      }
      fileViaJSON = true;
    }
    if (req.body) {
      delete req.body._RevocableSession;
    }
    if (req.body && req.body._ApplicationId && _cache.default.get(req.body._ApplicationId) && (!info.masterKey || _cache.default.get(req.body._ApplicationId).masterKey === info.masterKey)) {
      info.appId = req.body._ApplicationId;
      info.javascriptKey = req.body._JavaScriptKey || '';
      delete req.body._ApplicationId;
      delete req.body._JavaScriptKey;
      // TODO: test that the REST API formats generated by the other
      // SDKs are handled ok
      if (req.body._ClientVersion) {
        info.clientVersion = req.body._ClientVersion;
        delete req.body._ClientVersion;
      }
      if (req.body._InstallationId) {
        info.installationId = req.body._InstallationId;
        delete req.body._InstallationId;
      }
      if (req.body._SessionToken) {
        info.sessionToken = req.body._SessionToken;
        delete req.body._SessionToken;
      }
      if (req.body._MasterKey) {
        info.masterKey = req.body._MasterKey;
        delete req.body._MasterKey;
      }
      if (req.body._context) {
        if (req.body._context instanceof Object) {
          info.context = req.body._context;
        } else {
          try {
            info.context = JSON.parse(req.body._context);
            if (Object.prototype.toString.call(info.context) !== '[object Object]') {
              throw 'Context is not an object';
            }
          } catch (e) {
            return malformedContext(req, res);
          }
        }
        delete req.body._context;
      }
      if (req.body._ContentType) {
        req.headers['content-type'] = req.body._ContentType;
        delete req.body._ContentType;
      }
    } else {
      return invalidRequest(req, res);
    }
  }
  if (info.sessionToken && typeof info.sessionToken !== 'string') {
    info.sessionToken = info.sessionToken.toString();
  }
  if (info.clientVersion) {
    info.clientSDK = _ClientSDK.default.fromString(info.clientVersion);
  }
  if (fileViaJSON) {
    req.fileData = req.body.fileData;
    // We need to repopulate req.body with a buffer
    var base64 = req.body.base64;
    req.body = Buffer.from(base64, 'base64');
  }
  const clientIp = getClientIp(req);
  const config = _Config.default.get(info.appId, mount);
  if (config.state && config.state !== 'ok') {
    res.status(500);
    res.json({
      code: _node.default.Error.INTERNAL_SERVER_ERROR,
      error: `Invalid server state: ${config.state}`
    });
    return;
  }
  info.app = _cache.default.get(info.appId);
  req.config = config;
  req.config.headers = req.headers || {};
  req.config.ip = clientIp;
  req.info = info;
  const isMaintenance = req.config.maintenanceKey && info.maintenanceKey === req.config.maintenanceKey;
  if (isMaintenance) {
    var _req$config;
    if (checkIp(clientIp, req.config.maintenanceKeyIps || [], req.config.maintenanceKeyIpsStore)) {
      req.auth = new _Auth.default.Auth({
        config: req.config,
        installationId: info.installationId,
        isMaintenance: true
      });
      next();
      return;
    }
    const log = ((_req$config = req.config) === null || _req$config === void 0 ? void 0 : _req$config.loggerController) || _logger.default;
    log.error(`Request using maintenance key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'maintenanceKeyIps'.`);
  }
  let isMaster = info.masterKey === req.config.masterKey;
  if (isMaster && !checkIp(clientIp, req.config.masterKeyIps || [], req.config.masterKeyIpsStore)) {
    var _req$config2;
    const log = ((_req$config2 = req.config) === null || _req$config2 === void 0 ? void 0 : _req$config2.loggerController) || _logger.default;
    log.error(`Request using master key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'masterKeyIps'.`);
    isMaster = false;
  }
  if (isMaster) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: true
    });
    return handleRateLimit(req, res, next);
  }
  var isReadOnlyMaster = info.masterKey === req.config.readOnlyMasterKey;
  if (typeof req.config.readOnlyMasterKey != 'undefined' && req.config.readOnlyMasterKey && isReadOnlyMaster) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: true,
      isReadOnly: true
    });
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
  if (req.url == '/login') {
    delete info.sessionToken;
  }
  if (req.userFromJWT) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false,
      user: req.userFromJWT
    });
    return handleRateLimit(req, res, next);
  }
  if (!info.sessionToken) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false
    });
  }
  handleRateLimit(req, res, next);
}
const handleRateLimit = async (req, res, next) => {
  const rateLimits = req.config.rateLimits || [];
  try {
    await Promise.all(rateLimits.map(async limit => {
      const pathExp = new RegExp(limit.path);
      if (pathExp.test(req.url)) {
        await limit.handler(req, res, err => {
          if (err) {
            if (err.code === _node.default.Error.CONNECTION_FAILED) {
              throw err;
            }
            req.config.loggerController.error('An unknown error occured when attempting to apply the rate limiter: ', err);
          }
        });
      }
    }));
  } catch (error) {
    res.status(429);
    res.json({
      code: _node.default.Error.CONNECTION_FAILED,
      error: error.message
    });
    return;
  }
  next();
};
const handleParseSession = async (req, res, next) => {
  try {
    const info = req.info;
    if (req.auth) {
      next();
      return;
    }
    let requestAuth = null;
    if (info.sessionToken && req.url === '/upgradeToRevocableSession' && info.sessionToken.indexOf('r:') != 0) {
      requestAuth = await _Auth.default.getAuthForLegacySessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken
      });
    } else {
      requestAuth = await _Auth.default.getAuthForSessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken
      });
    }
    req.auth = requestAuth;
    next();
  } catch (error) {
    if (error instanceof _node.default.Error) {
      next(error);
      return;
    }
    // TODO: Determine the correct error scenario.
    req.config.loggerController.error('error getting auth for sessionToken', error);
    throw new _node.default.Error(_node.default.Error.UNKNOWN_ERROR, error);
  }
};
exports.handleParseSession = handleParseSession;
function getClientIp(req) {
  return req.ip;
}
function httpAuth(req) {
  if (!(req.req || req).headers.authorization) return;
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
  return {
    appId: appId,
    masterKey: masterKey,
    javascriptKey: javascriptKey
  };
}
function decodeBase64(str) {
  return Buffer.from(str, 'base64').toString();
}
function allowCrossDomain(appId) {
  return (req, res, next) => {
    const config = _Config.default.get(appId, getMountForRequest(req));
    let allowHeaders = DEFAULT_ALLOWED_HEADERS;
    if (config && config.allowHeaders) {
      allowHeaders += `, ${config.allowHeaders.join(', ')}`;
    }
    const baseOrigins = typeof (config === null || config === void 0 ? void 0 : config.allowOrigin) === 'string' ? [config.allowOrigin] : (config === null || config === void 0 ? void 0 : config.allowOrigin) ?? ['*'];
    const requestOrigin = req.headers.origin;
    const allowOrigins = requestOrigin && baseOrigins.includes(requestOrigin) ? requestOrigin : baseOrigins[0];
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
function allowMethodOverride(req, res, next) {
  if (req.method === 'POST' && req.body._method) {
    req.originalMethod = req.method;
    req.method = req.body._method;
    delete req.body._method;
  }
  next();
}
function handleParseErrors(err, req, res, next) {
  const log = req.config && req.config.loggerController || _logger.default;
  if (err instanceof _node.default.Error) {
    if (req.config && req.config.enableExpressErrorHandler) {
      return next(err);
    }
    let httpStatus;
    // TODO: fill out this mapping
    switch (err.code) {
      case _node.default.Error.INTERNAL_SERVER_ERROR:
        httpStatus = 500;
        break;
      case _node.default.Error.OBJECT_NOT_FOUND:
        httpStatus = 404;
        break;
      default:
        httpStatus = 400;
    }
    res.status(httpStatus);
    res.json({
      code: err.code,
      error: err.message
    });
    log.error('Parse error: ', err);
  } else if (err.status && err.message) {
    res.status(err.status);
    res.json({
      error: err.message
    });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  } else {
    log.error('Uncaught internal server error.', err, err.stack);
    res.status(500);
    res.json({
      code: _node.default.Error.INTERNAL_SERVER_ERROR,
      message: 'Internal server error.'
    });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  }
}
function enforceMasterKeyAccess(req, res, next) {
  if (!req.auth.isMaster) {
    res.status(403);
    res.end('{"error":"unauthorized: master key is required"}');
    return;
  }
  next();
}
function promiseEnforceMasterKeyAccess(request) {
  if (!request.auth.isMaster) {
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized: master key is required';
    throw error;
  }
  return Promise.resolve();
}
const addRateLimit = (route, config, cloud) => {
  if (typeof config === 'string') {
    config = _Config.default.get(config);
  }
  for (const key in route) {
    if (!_Definitions.RateLimitOptions[key]) {
      throw `Invalid rate limit option "${key}"`;
    }
  }
  if (!config.rateLimits) {
    config.rateLimits = [];
  }
  const redisStore = {
    connectionPromise: Promise.resolve(),
    store: null,
    connected: false
  };
  if (route.redisUrl) {
    const client = (0, _redis.createClient)({
      url: route.redisUrl
    });
    redisStore.connectionPromise = async () => {
      if (redisStore.connected) {
        return;
      }
      try {
        await client.connect();
        redisStore.connected = true;
      } catch (e) {
        var _config;
        const log = ((_config = config) === null || _config === void 0 ? void 0 : _config.loggerController) || _logger.default;
        log.error(`Could not connect to redisURL in rate limit: ${e}`);
      }
    };
    redisStore.connectionPromise();
    redisStore.store = new _rateLimitRedis.default({
      sendCommand: async (...args) => {
        await redisStore.connectionPromise();
        return client.sendCommand(args);
      }
    });
  }
  let transformPath = route.requestPath.split('/*').join('/(.*)');
  if (transformPath === '*') {
    transformPath = '(.*)';
  }
  config.rateLimits.push({
    path: (0, _pathToRegexp.pathToRegexp)(transformPath),
    handler: (0, _expressRateLimit.default)({
      windowMs: route.requestTimeWindow,
      max: route.requestCount,
      message: route.errorResponseMessage || _Definitions.RateLimitOptions.errorResponseMessage.default,
      handler: (request, response, next, options) => {
        throw {
          code: _node.default.Error.CONNECTION_FAILED,
          message: options.message
        };
      },
      skip: request => {
        var _request$auth;
        if (request.ip === '127.0.0.1' && !route.includeInternalRequests) {
          return true;
        }
        if (route.includeMasterKey) {
          return false;
        }
        if (route.requestMethods) {
          if (Array.isArray(route.requestMethods)) {
            if (!route.requestMethods.includes(request.method)) {
              return true;
            }
          } else {
            const regExp = new RegExp(route.requestMethods);
            if (!regExp.test(request.method)) {
              return true;
            }
          }
        }
        return (_request$auth = request.auth) === null || _request$auth === void 0 ? void 0 : _request$auth.isMaster;
      },
      keyGenerator: async request => {
        if (route.zone === _node.default.Server.RateLimitZone.global) {
          return request.config.appId;
        }
        const token = request.info.sessionToken;
        if (route.zone === _node.default.Server.RateLimitZone.session && token) {
          return token;
        }
        if (route.zone === _node.default.Server.RateLimitZone.user && token) {
          var _request$auth2, _request$auth2$user;
          if (!request.auth) {
            await new Promise(resolve => handleParseSession(request, null, resolve));
          }
          if ((_request$auth2 = request.auth) !== null && _request$auth2 !== void 0 && (_request$auth2$user = _request$auth2.user) !== null && _request$auth2$user !== void 0 && _request$auth2$user.id && request.zone === 'user') {
            return request.auth.user.id;
          }
        }
        return request.config.ip;
      },
      store: redisStore.store
    }),
    cloud
  });
  _Config.default.put(config);
};

/**
 * Deduplicates a request to ensure idempotency. Duplicates are determined by the request ID
 * in the request header. If a request has no request ID, it is executed anyway.
 * @param {*} req The request to evaluate.
 * @returns Promise<{}>
 */
exports.addRateLimit = addRateLimit;
function promiseEnsureIdempotency(req) {
  // Enable feature only for MongoDB
  if (!(req.config.database.adapter instanceof _MongoStorageAdapter.default || req.config.database.adapter instanceof _PostgresStorageAdapter.default)) {
    return Promise.resolve();
  }
  // Get parameters
  const config = req.config;
  const requestId = ((req || {}).headers || {})['x-parse-request-id'];
  const {
    paths,
    ttl
  } = config.idempotencyOptions;
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
  return _rest.default.create(config, _Auth.default.master(config), '_Idempotency', {
    reqId: requestId,
    expire: _node.default._encode(expiryDate)
  }).catch(e => {
    if (e.code == _node.default.Error.DUPLICATE_VALUE) {
      throw new _node.default.Error(_node.default.Error.DUPLICATE_REQUEST, 'Duplicate request');
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
  res.json({
    code: _node.default.Error.INVALID_JSON,
    error: 'Invalid object for context.'
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX0F1dGgiLCJfQ29uZmlnIiwiX0NsaWVudFNESyIsIl9sb2dnZXIiLCJfcmVzdCIsIl9Nb25nb1N0b3JhZ2VBZGFwdGVyIiwiX1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJfZXhwcmVzc1JhdGVMaW1pdCIsIl9EZWZpbml0aW9ucyIsIl9wYXRoVG9SZWdleHAiLCJfcmF0ZUxpbWl0UmVkaXMiLCJfcmVkaXMiLCJfbmV0Iiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJERUZBVUxUX0FMTE9XRURfSEVBREVSUyIsImV4cG9ydHMiLCJnZXRNb3VudEZvclJlcXVlc3QiLCJyZXEiLCJtb3VudFBhdGhMZW5ndGgiLCJvcmlnaW5hbFVybCIsImxlbmd0aCIsInVybCIsIm1vdW50UGF0aCIsInNsaWNlIiwicHJvdG9jb2wiLCJnZXQiLCJnZXRCbG9ja0xpc3QiLCJpcFJhbmdlTGlzdCIsInN0b3JlIiwiYmxvY2tMaXN0IiwiQmxvY2tMaXN0IiwiZm9yRWFjaCIsImZ1bGxJcCIsInNldCIsImlwIiwibWFzayIsInNwbGl0IiwiYWRkQWRkcmVzcyIsImlzSVB2NCIsImFkZFN1Ym5ldCIsIk51bWJlciIsImNoZWNrSXAiLCJpbmNvbWluZ0lwSXNWNCIsInJlc3VsdCIsImNoZWNrIiwiaW5jbHVkZXMiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJyZXMiLCJuZXh0IiwibW91bnQiLCJjb250ZXh0IiwiSlNPTiIsInBhcnNlIiwiT2JqZWN0IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwiZSIsIm1hbGZvcm1lZENvbnRleHQiLCJpbmZvIiwiYXBwSWQiLCJzZXNzaW9uVG9rZW4iLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsImluc3RhbGxhdGlvbklkIiwiY2xpZW50S2V5IiwiamF2YXNjcmlwdEtleSIsImRvdE5ldEtleSIsInJlc3RBUElLZXkiLCJjbGllbnRWZXJzaW9uIiwiYmFzaWNBdXRoIiwiaHR0cEF1dGgiLCJiYXNpY0F1dGhBcHBJZCIsIkFwcENhY2hlIiwiYm9keSIsIl9ub0JvZHkiLCJmaWxlVmlhSlNPTiIsIkJ1ZmZlciIsImludmFsaWRSZXF1ZXN0IiwiX1Jldm9jYWJsZVNlc3Npb24iLCJfQXBwbGljYXRpb25JZCIsIl9KYXZhU2NyaXB0S2V5IiwiX0NsaWVudFZlcnNpb24iLCJfSW5zdGFsbGF0aW9uSWQiLCJfU2Vzc2lvblRva2VuIiwiX01hc3RlcktleSIsIl9jb250ZXh0IiwiX0NvbnRlbnRUeXBlIiwiaGVhZGVycyIsImNsaWVudFNESyIsIkNsaWVudFNESyIsImZyb21TdHJpbmciLCJmaWxlRGF0YSIsImJhc2U2NCIsImZyb20iLCJjbGllbnRJcCIsImdldENsaWVudElwIiwiY29uZmlnIiwiQ29uZmlnIiwic3RhdGUiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlcnJvciIsImFwcCIsImlzTWFpbnRlbmFuY2UiLCJfcmVxJGNvbmZpZyIsIm1haW50ZW5hbmNlS2V5SXBzIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsImF1dGgiLCJBdXRoIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImRlZmF1bHRMb2dnZXIiLCJpc01hc3RlciIsIm1hc3RlcktleUlwcyIsIm1hc3RlcktleUlwc1N0b3JlIiwiX3JlcSRjb25maWcyIiwiaGFuZGxlUmF0ZUxpbWl0IiwiaXNSZWFkT25seU1hc3RlciIsInJlYWRPbmx5TWFzdGVyS2V5IiwiaXNSZWFkT25seSIsImtleXMiLCJvbmVLZXlDb25maWd1cmVkIiwic29tZSIsImtleSIsInVuZGVmaW5lZCIsIm9uZUtleU1hdGNoZXMiLCJ1c2VyRnJvbUpXVCIsInVzZXIiLCJyYXRlTGltaXRzIiwiUHJvbWlzZSIsImFsbCIsIm1hcCIsImxpbWl0IiwicGF0aEV4cCIsIlJlZ0V4cCIsInBhdGgiLCJ0ZXN0IiwiaGFuZGxlciIsImVyciIsIkNPTk5FQ1RJT05fRkFJTEVEIiwibWVzc2FnZSIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsInJlcXVlc3RBdXRoIiwiaW5kZXhPZiIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiVU5LTk9XTl9FUlJPUiIsImF1dGhvcml6YXRpb24iLCJoZWFkZXIiLCJhdXRoUHJlZml4IiwibWF0Y2giLCJ0b0xvd2VyQ2FzZSIsImVuY29kZWRBdXRoIiwic3Vic3RyaW5nIiwiY3JlZGVudGlhbHMiLCJkZWNvZGVCYXNlNjQiLCJqc0tleVByZWZpeCIsIm1hdGNoS2V5Iiwic3RyIiwiYWxsb3dDcm9zc0RvbWFpbiIsImFsbG93SGVhZGVycyIsImpvaW4iLCJiYXNlT3JpZ2lucyIsImFsbG93T3JpZ2luIiwicmVxdWVzdE9yaWdpbiIsIm9yaWdpbiIsImFsbG93T3JpZ2lucyIsIm1ldGhvZCIsInNlbmRTdGF0dXMiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiX21ldGhvZCIsIm9yaWdpbmFsTWV0aG9kIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJlbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyIiwiaHR0cFN0YXR1cyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwcm9jZXNzIiwiZW52IiwiVEVTVElORyIsInN0YWNrIiwiZW5mb3JjZU1hc3RlcktleUFjY2VzcyIsImVuZCIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwicmVxdWVzdCIsInJlc29sdmUiLCJhZGRSYXRlTGltaXQiLCJyb3V0ZSIsImNsb3VkIiwiUmF0ZUxpbWl0T3B0aW9ucyIsInJlZGlzU3RvcmUiLCJjb25uZWN0aW9uUHJvbWlzZSIsImNvbm5lY3RlZCIsInJlZGlzVXJsIiwiY2xpZW50IiwiY3JlYXRlQ2xpZW50IiwiY29ubmVjdCIsIl9jb25maWciLCJSZWRpc1N0b3JlIiwic2VuZENvbW1hbmQiLCJhcmdzIiwidHJhbnNmb3JtUGF0aCIsInJlcXVlc3RQYXRoIiwicHVzaCIsInBhdGhUb1JlZ2V4cCIsInJhdGVMaW1pdCIsIndpbmRvd01zIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJtYXgiLCJyZXF1ZXN0Q291bnQiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsInJlc3BvbnNlIiwib3B0aW9ucyIsInNraXAiLCJfcmVxdWVzdCRhdXRoIiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJpbmNsdWRlTWFzdGVyS2V5IiwicmVxdWVzdE1ldGhvZHMiLCJBcnJheSIsImlzQXJyYXkiLCJyZWdFeHAiLCJrZXlHZW5lcmF0b3IiLCJ6b25lIiwiU2VydmVyIiwiUmF0ZUxpbWl0Wm9uZSIsImdsb2JhbCIsInRva2VuIiwic2Vzc2lvbiIsIl9yZXF1ZXN0JGF1dGgyIiwiX3JlcXVlc3QkYXV0aDIkdXNlciIsImlkIiwicHV0IiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiZGF0YWJhc2UiLCJhZGFwdGVyIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsIlBvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJyZXF1ZXN0SWQiLCJwYXRocyIsInR0bCIsImlkZW1wb3RlbmN5T3B0aW9ucyIsInJlcVBhdGgiLCJyZXBsYWNlIiwicmVnZXgiLCJjaGFyQXQiLCJleHBpcnlEYXRlIiwiRGF0ZSIsInNldFNlY29uZHMiLCJnZXRTZWNvbmRzIiwicmVzdCIsImNyZWF0ZSIsIm1hc3RlciIsInJlcUlkIiwiZXhwaXJlIiwiX2VuY29kZSIsImNhdGNoIiwiRFVQTElDQVRFX1ZBTFVFIiwiRFVQTElDQVRFX1JFUVVFU1QiLCJJTlZBTElEX0pTT04iXSwic291cmNlcyI6WyIuLi9zcmMvbWlkZGxld2FyZXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IGF1dGggZnJvbSAnLi9BdXRoJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi9Db25maWcnO1xuaW1wb3J0IENsaWVudFNESyBmcm9tICcuL0NsaWVudFNESyc7XG5pbXBvcnQgZGVmYXVsdExvZ2dlciBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuL3Jlc3QnO1xuaW1wb3J0IE1vbmdvU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHJhdGVMaW1pdCBmcm9tICdleHByZXNzLXJhdGUtbGltaXQnO1xuaW1wb3J0IHsgUmF0ZUxpbWl0T3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucy9EZWZpbml0aW9ucyc7XG5pbXBvcnQgeyBwYXRoVG9SZWdleHAgfSBmcm9tICdwYXRoLXRvLXJlZ2V4cCc7XG5pbXBvcnQgUmVkaXNTdG9yZSBmcm9tICdyYXRlLWxpbWl0LXJlZGlzJztcbmltcG9ydCB7IGNyZWF0ZUNsaWVudCB9IGZyb20gJ3JlZGlzJztcbmltcG9ydCB7IEJsb2NrTGlzdCwgaXNJUHY0IH0gZnJvbSAnbmV0JztcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfQUxMT1dFRF9IRUFERVJTID1cbiAgJ1gtUGFyc2UtTWFzdGVyLUtleSwgWC1QYXJzZS1SRVNULUFQSS1LZXksIFgtUGFyc2UtSmF2YXNjcmlwdC1LZXksIFgtUGFyc2UtQXBwbGljYXRpb24tSWQsIFgtUGFyc2UtQ2xpZW50LVZlcnNpb24sIFgtUGFyc2UtU2Vzc2lvbi1Ub2tlbiwgWC1SZXF1ZXN0ZWQtV2l0aCwgWC1QYXJzZS1SZXZvY2FibGUtU2Vzc2lvbiwgWC1QYXJzZS1SZXF1ZXN0LUlkLCBDb250ZW50LVR5cGUsIFByYWdtYSwgQ2FjaGUtQ29udHJvbCc7XG5cbmNvbnN0IGdldE1vdW50Rm9yUmVxdWVzdCA9IGZ1bmN0aW9uIChyZXEpIHtcbiAgY29uc3QgbW91bnRQYXRoTGVuZ3RoID0gcmVxLm9yaWdpbmFsVXJsLmxlbmd0aCAtIHJlcS51cmwubGVuZ3RoO1xuICBjb25zdCBtb3VudFBhdGggPSByZXEub3JpZ2luYWxVcmwuc2xpY2UoMCwgbW91bnRQYXRoTGVuZ3RoKTtcbiAgcmV0dXJuIHJlcS5wcm90b2NvbCArICc6Ly8nICsgcmVxLmdldCgnaG9zdCcpICsgbW91bnRQYXRoO1xufTtcblxuY29uc3QgZ2V0QmxvY2tMaXN0ID0gKGlwUmFuZ2VMaXN0LCBzdG9yZSkgPT4ge1xuICBpZiAoc3RvcmUuZ2V0KCdibG9ja0xpc3QnKSkgcmV0dXJuIHN0b3JlLmdldCgnYmxvY2tMaXN0Jyk7XG4gIGNvbnN0IGJsb2NrTGlzdCA9IG5ldyBCbG9ja0xpc3QoKTtcbiAgaXBSYW5nZUxpc3QuZm9yRWFjaChmdWxsSXAgPT4ge1xuICAgIGlmIChmdWxsSXAgPT09ICc6Oi8wJyB8fCBmdWxsSXAgPT09ICc6OicpIHtcbiAgICAgIHN0b3JlLnNldCgnYWxsb3dBbGxJcHY2JywgdHJ1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChmdWxsSXAgPT09ICcwLjAuMC4wJykge1xuICAgICAgc3RvcmUuc2V0KCdhbGxvd0FsbElwdjQnLCB0cnVlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgW2lwLCBtYXNrXSA9IGZ1bGxJcC5zcGxpdCgnLycpO1xuICAgIGlmICghbWFzaykge1xuICAgICAgYmxvY2tMaXN0LmFkZEFkZHJlc3MoaXAsIGlzSVB2NChpcCkgPyAnaXB2NCcgOiAnaXB2NicpO1xuICAgIH0gZWxzZSB7XG4gICAgICBibG9ja0xpc3QuYWRkU3VibmV0KGlwLCBOdW1iZXIobWFzayksIGlzSVB2NChpcCkgPyAnaXB2NCcgOiAnaXB2NicpO1xuICAgIH1cbiAgfSk7XG4gIHN0b3JlLnNldCgnYmxvY2tMaXN0JywgYmxvY2tMaXN0KTtcbiAgcmV0dXJuIGJsb2NrTGlzdDtcbn07XG5cbmV4cG9ydCBjb25zdCBjaGVja0lwID0gKGlwLCBpcFJhbmdlTGlzdCwgc3RvcmUpID0+IHtcbiAgY29uc3QgaW5jb21pbmdJcElzVjQgPSBpc0lQdjQoaXApO1xuICBjb25zdCBibG9ja0xpc3QgPSBnZXRCbG9ja0xpc3QoaXBSYW5nZUxpc3QsIHN0b3JlKTtcblxuICBpZiAoc3RvcmUuZ2V0KGlwKSkgcmV0dXJuIHRydWU7XG4gIGlmIChzdG9yZS5nZXQoJ2FsbG93QWxsSXB2NCcpICYmIGluY29taW5nSXBJc1Y0KSByZXR1cm4gdHJ1ZTtcbiAgaWYgKHN0b3JlLmdldCgnYWxsb3dBbGxJcHY2JykgJiYgIWluY29taW5nSXBJc1Y0KSByZXR1cm4gdHJ1ZTtcbiAgY29uc3QgcmVzdWx0ID0gYmxvY2tMaXN0LmNoZWNrKGlwLCBpbmNvbWluZ0lwSXNWNCA/ICdpcHY0JyA6ICdpcHY2Jyk7XG5cbiAgLy8gSWYgdGhlIGlwIGlzIGluIHRoZSBsaXN0LCB3ZSBzdG9yZSB0aGUgcmVzdWx0IGluIHRoZSBzdG9yZVxuICAvLyBzbyB3ZSBoYXZlIGEgb3B0aW1pemVkIHBhdGggZm9yIHRoZSBuZXh0IHJlcXVlc3RcbiAgaWYgKGlwUmFuZ2VMaXN0LmluY2x1ZGVzKGlwKSAmJiByZXN1bHQpIHtcbiAgICBzdG9yZS5zZXQoaXAsIHJlc3VsdCk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8vIENoZWNrcyB0aGF0IHRoZSByZXF1ZXN0IGlzIGF1dGhvcml6ZWQgZm9yIHRoaXMgYXBwIGFuZCBjaGVja3MgdXNlclxuLy8gYXV0aCB0b28uXG4vLyBUaGUgYm9keXBhcnNlciBzaG91bGQgcnVuIGJlZm9yZSB0aGlzIG1pZGRsZXdhcmUuXG4vLyBBZGRzIGluZm8gdG8gdGhlIHJlcXVlc3Q6XG4vLyByZXEuY29uZmlnIC0gdGhlIENvbmZpZyBmb3IgdGhpcyBhcHBcbi8vIHJlcS5hdXRoIC0gdGhlIEF1dGggZm9yIHRoaXMgcmVxdWVzdFxuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZVBhcnNlSGVhZGVycyhyZXEsIHJlcywgbmV4dCkge1xuICB2YXIgbW91bnQgPSBnZXRNb3VudEZvclJlcXVlc3QocmVxKTtcblxuICBsZXQgY29udGV4dCA9IHt9O1xuICBpZiAocmVxLmdldCgnWC1QYXJzZS1DbG91ZC1Db250ZXh0JykgIT0gbnVsbCkge1xuICAgIHRyeSB7XG4gICAgICBjb250ZXh0ID0gSlNPTi5wYXJzZShyZXEuZ2V0KCdYLVBhcnNlLUNsb3VkLUNvbnRleHQnKSk7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGNvbnRleHQpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICB0aHJvdyAnQ29udGV4dCBpcyBub3QgYW4gb2JqZWN0JztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcyk7XG4gICAgfVxuICB9XG4gIHZhciBpbmZvID0ge1xuICAgIGFwcElkOiByZXEuZ2V0KCdYLVBhcnNlLUFwcGxpY2F0aW9uLUlkJyksXG4gICAgc2Vzc2lvblRva2VuOiByZXEuZ2V0KCdYLVBhcnNlLVNlc3Npb24tVG9rZW4nKSxcbiAgICBtYXN0ZXJLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtTWFzdGVyLUtleScpLFxuICAgIG1haW50ZW5hbmNlS2V5OiByZXEuZ2V0KCdYLVBhcnNlLU1haW50ZW5hbmNlLUtleScpLFxuICAgIGluc3RhbGxhdGlvbklkOiByZXEuZ2V0KCdYLVBhcnNlLUluc3RhbGxhdGlvbi1JZCcpLFxuICAgIGNsaWVudEtleTogcmVxLmdldCgnWC1QYXJzZS1DbGllbnQtS2V5JyksXG4gICAgamF2YXNjcmlwdEtleTogcmVxLmdldCgnWC1QYXJzZS1KYXZhc2NyaXB0LUtleScpLFxuICAgIGRvdE5ldEtleTogcmVxLmdldCgnWC1QYXJzZS1XaW5kb3dzLUtleScpLFxuICAgIHJlc3RBUElLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtUkVTVC1BUEktS2V5JyksXG4gICAgY2xpZW50VmVyc2lvbjogcmVxLmdldCgnWC1QYXJzZS1DbGllbnQtVmVyc2lvbicpLFxuICAgIGNvbnRleHQ6IGNvbnRleHQsXG4gIH07XG5cbiAgdmFyIGJhc2ljQXV0aCA9IGh0dHBBdXRoKHJlcSk7XG5cbiAgaWYgKGJhc2ljQXV0aCkge1xuICAgIHZhciBiYXNpY0F1dGhBcHBJZCA9IGJhc2ljQXV0aC5hcHBJZDtcbiAgICBpZiAoQXBwQ2FjaGUuZ2V0KGJhc2ljQXV0aEFwcElkKSkge1xuICAgICAgaW5mby5hcHBJZCA9IGJhc2ljQXV0aEFwcElkO1xuICAgICAgaW5mby5tYXN0ZXJLZXkgPSBiYXNpY0F1dGgubWFzdGVyS2V5IHx8IGluZm8ubWFzdGVyS2V5O1xuICAgICAgaW5mby5qYXZhc2NyaXB0S2V5ID0gYmFzaWNBdXRoLmphdmFzY3JpcHRLZXkgfHwgaW5mby5qYXZhc2NyaXB0S2V5O1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXEuYm9keSkge1xuICAgIC8vIFVuaXR5IFNESyBzZW5kcyBhIF9ub0JvZHkga2V5IHdoaWNoIG5lZWRzIHRvIGJlIHJlbW92ZWQuXG4gICAgLy8gVW5jbGVhciBhdCB0aGlzIHBvaW50IGlmIGFjdGlvbiBuZWVkcyB0byBiZSB0YWtlbi5cbiAgICBkZWxldGUgcmVxLmJvZHkuX25vQm9keTtcbiAgfVxuXG4gIHZhciBmaWxlVmlhSlNPTiA9IGZhbHNlO1xuXG4gIGlmICghaW5mby5hcHBJZCB8fCAhQXBwQ2FjaGUuZ2V0KGluZm8uYXBwSWQpKSB7XG4gICAgLy8gU2VlIGlmIHdlIGNhbiBmaW5kIHRoZSBhcHAgaWQgb24gdGhlIGJvZHkuXG4gICAgaWYgKHJlcS5ib2R5IGluc3RhbmNlb2YgQnVmZmVyKSB7XG4gICAgICAvLyBUaGUgb25seSBjaGFuY2UgdG8gZmluZCB0aGUgYXBwIGlkIGlzIGlmIHRoaXMgaXMgYSBmaWxlXG4gICAgICAvLyB1cGxvYWQgdGhhdCBhY3R1YWxseSBpcyBhIEpTT04gYm9keS4gU28gdHJ5IHRvIHBhcnNlIGl0LlxuICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzY1ODlcbiAgICAgIC8vIEl0IGlzIGFsc28gcG9zc2libGUgdGhhdCB0aGUgY2xpZW50IGlzIHRyeWluZyB0byB1cGxvYWQgYSBmaWxlIGJ1dCBmb3Jnb3RcbiAgICAgIC8vIHRvIHByb3ZpZGUgeC1wYXJzZS1hcHAtaWQgaW4gaGVhZGVyIGFuZCBwYXJzZSBhIGJpbmFyeSBmaWxlIHdpbGwgZmFpbFxuICAgICAgdHJ5IHtcbiAgICAgICAgcmVxLmJvZHkgPSBKU09OLnBhcnNlKHJlcS5ib2R5KTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgICAgIH1cbiAgICAgIGZpbGVWaWFKU09OID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAocmVxLmJvZHkpIHtcbiAgICAgIGRlbGV0ZSByZXEuYm9keS5fUmV2b2NhYmxlU2Vzc2lvbjtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICByZXEuYm9keSAmJlxuICAgICAgcmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQgJiZcbiAgICAgIEFwcENhY2hlLmdldChyZXEuYm9keS5fQXBwbGljYXRpb25JZCkgJiZcbiAgICAgICghaW5mby5tYXN0ZXJLZXkgfHwgQXBwQ2FjaGUuZ2V0KHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkKS5tYXN0ZXJLZXkgPT09IGluZm8ubWFzdGVyS2V5KVxuICAgICkge1xuICAgICAgaW5mby5hcHBJZCA9IHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkO1xuICAgICAgaW5mby5qYXZhc2NyaXB0S2V5ID0gcmVxLmJvZHkuX0phdmFTY3JpcHRLZXkgfHwgJyc7XG4gICAgICBkZWxldGUgcmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQ7XG4gICAgICBkZWxldGUgcmVxLmJvZHkuX0phdmFTY3JpcHRLZXk7XG4gICAgICAvLyBUT0RPOiB0ZXN0IHRoYXQgdGhlIFJFU1QgQVBJIGZvcm1hdHMgZ2VuZXJhdGVkIGJ5IHRoZSBvdGhlclxuICAgICAgLy8gU0RLcyBhcmUgaGFuZGxlZCBva1xuICAgICAgaWYgKHJlcS5ib2R5Ll9DbGllbnRWZXJzaW9uKSB7XG4gICAgICAgIGluZm8uY2xpZW50VmVyc2lvbiA9IHJlcS5ib2R5Ll9DbGllbnRWZXJzaW9uO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0NsaWVudFZlcnNpb247XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX0luc3RhbGxhdGlvbklkKSB7XG4gICAgICAgIGluZm8uaW5zdGFsbGF0aW9uSWQgPSByZXEuYm9keS5fSW5zdGFsbGF0aW9uSWQ7XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fSW5zdGFsbGF0aW9uSWQ7XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX1Nlc3Npb25Ub2tlbikge1xuICAgICAgICBpbmZvLnNlc3Npb25Ub2tlbiA9IHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW47XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fU2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9NYXN0ZXJLZXkpIHtcbiAgICAgICAgaW5mby5tYXN0ZXJLZXkgPSByZXEuYm9keS5fTWFzdGVyS2V5O1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX01hc3RlcktleTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fY29udGV4dCkge1xuICAgICAgICBpZiAocmVxLmJvZHkuX2NvbnRleHQgaW5zdGFuY2VvZiBPYmplY3QpIHtcbiAgICAgICAgICBpbmZvLmNvbnRleHQgPSByZXEuYm9keS5fY29udGV4dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgaW5mby5jb250ZXh0ID0gSlNPTi5wYXJzZShyZXEuYm9keS5fY29udGV4dCk7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGluZm8uY29udGV4dCkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICAgICAgICAgIHRocm93ICdDb250ZXh0IGlzIG5vdCBhbiBvYmplY3QnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBtYWxmb3JtZWRDb250ZXh0KHJlcSwgcmVzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9jb250ZXh0O1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9Db250ZW50VHlwZSkge1xuICAgICAgICByZXEuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSByZXEuYm9keS5fQ29udGVudFR5cGU7XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fQ29udGVudFR5cGU7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKGluZm8uc2Vzc2lvblRva2VuICYmIHR5cGVvZiBpbmZvLnNlc3Npb25Ub2tlbiAhPT0gJ3N0cmluZycpIHtcbiAgICBpbmZvLnNlc3Npb25Ub2tlbiA9IGluZm8uc2Vzc2lvblRva2VuLnRvU3RyaW5nKCk7XG4gIH1cblxuICBpZiAoaW5mby5jbGllbnRWZXJzaW9uKSB7XG4gICAgaW5mby5jbGllbnRTREsgPSBDbGllbnRTREsuZnJvbVN0cmluZyhpbmZvLmNsaWVudFZlcnNpb24pO1xuICB9XG5cbiAgaWYgKGZpbGVWaWFKU09OKSB7XG4gICAgcmVxLmZpbGVEYXRhID0gcmVxLmJvZHkuZmlsZURhdGE7XG4gICAgLy8gV2UgbmVlZCB0byByZXBvcHVsYXRlIHJlcS5ib2R5IHdpdGggYSBidWZmZXJcbiAgICB2YXIgYmFzZTY0ID0gcmVxLmJvZHkuYmFzZTY0O1xuICAgIHJlcS5ib2R5ID0gQnVmZmVyLmZyb20oYmFzZTY0LCAnYmFzZTY0Jyk7XG4gIH1cblxuICBjb25zdCBjbGllbnRJcCA9IGdldENsaWVudElwKHJlcSk7XG4gIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoaW5mby5hcHBJZCwgbW91bnQpO1xuICBpZiAoY29uZmlnLnN0YXRlICYmIGNvbmZpZy5zdGF0ZSAhPT0gJ29rJykge1xuICAgIHJlcy5zdGF0dXMoNTAwKTtcbiAgICByZXMuanNvbih7XG4gICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICBlcnJvcjogYEludmFsaWQgc2VydmVyIHN0YXRlOiAke2NvbmZpZy5zdGF0ZX1gLFxuICAgIH0pO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGluZm8uYXBwID0gQXBwQ2FjaGUuZ2V0KGluZm8uYXBwSWQpO1xuICByZXEuY29uZmlnID0gY29uZmlnO1xuICByZXEuY29uZmlnLmhlYWRlcnMgPSByZXEuaGVhZGVycyB8fCB7fTtcbiAgcmVxLmNvbmZpZy5pcCA9IGNsaWVudElwO1xuICByZXEuaW5mbyA9IGluZm87XG5cbiAgY29uc3QgaXNNYWludGVuYW5jZSA9XG4gICAgcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleSAmJiBpbmZvLm1haW50ZW5hbmNlS2V5ID09PSByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5O1xuICBpZiAoaXNNYWludGVuYW5jZSkge1xuICAgIGlmIChjaGVja0lwKGNsaWVudElwLCByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5SXBzIHx8IFtdLCByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5SXBzU3RvcmUpKSB7XG4gICAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBpc01haW50ZW5hbmNlOiB0cnVlLFxuICAgICAgfSk7XG4gICAgICBuZXh0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGxvZyA9IHJlcS5jb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICBsb2cuZXJyb3IoXG4gICAgICBgUmVxdWVzdCB1c2luZyBtYWludGVuYW5jZSBrZXkgcmVqZWN0ZWQgYXMgdGhlIHJlcXVlc3QgSVAgYWRkcmVzcyAnJHtjbGllbnRJcH0nIGlzIG5vdCBzZXQgaW4gUGFyc2UgU2VydmVyIG9wdGlvbiAnbWFpbnRlbmFuY2VLZXlJcHMnLmBcbiAgICApO1xuICB9XG5cbiAgbGV0IGlzTWFzdGVyID0gaW5mby5tYXN0ZXJLZXkgPT09IHJlcS5jb25maWcubWFzdGVyS2V5O1xuXG4gIGlmIChpc01hc3RlciAmJiAhY2hlY2tJcChjbGllbnRJcCwgcmVxLmNvbmZpZy5tYXN0ZXJLZXlJcHMgfHwgW10sIHJlcS5jb25maWcubWFzdGVyS2V5SXBzU3RvcmUpKSB7XG4gICAgY29uc3QgbG9nID0gcmVxLmNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgIGxvZy5lcnJvcihcbiAgICAgIGBSZXF1ZXN0IHVzaW5nIG1hc3RlciBrZXkgcmVqZWN0ZWQgYXMgdGhlIHJlcXVlc3QgSVAgYWRkcmVzcyAnJHtjbGllbnRJcH0nIGlzIG5vdCBzZXQgaW4gUGFyc2UgU2VydmVyIG9wdGlvbiAnbWFzdGVyS2V5SXBzJy5gXG4gICAgKTtcbiAgICBpc01hc3RlciA9IGZhbHNlO1xuICB9XG5cbiAgaWYgKGlzTWFzdGVyKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IHRydWUsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICB2YXIgaXNSZWFkT25seU1hc3RlciA9IGluZm8ubWFzdGVyS2V5ID09PSByZXEuY29uZmlnLnJlYWRPbmx5TWFzdGVyS2V5O1xuICBpZiAoXG4gICAgdHlwZW9mIHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXkgIT0gJ3VuZGVmaW5lZCcgJiZcbiAgICByZXEuY29uZmlnLnJlYWRPbmx5TWFzdGVyS2V5ICYmXG4gICAgaXNSZWFkT25seU1hc3RlclxuICApIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogdHJ1ZSxcbiAgICAgIGlzUmVhZE9ubHk6IHRydWUsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICAvLyBDbGllbnQga2V5cyBhcmUgbm90IHJlcXVpcmVkIGluIHBhcnNlLXNlcnZlciwgYnV0IGlmIGFueSBoYXZlIGJlZW4gY29uZmlndXJlZCBpbiB0aGUgc2VydmVyLCB2YWxpZGF0ZSB0aGVtXG4gIC8vICB0byBwcmVzZXJ2ZSBvcmlnaW5hbCBiZWhhdmlvci5cbiAgY29uc3Qga2V5cyA9IFsnY2xpZW50S2V5JywgJ2phdmFzY3JpcHRLZXknLCAnZG90TmV0S2V5JywgJ3Jlc3RBUElLZXknXTtcbiAgY29uc3Qgb25lS2V5Q29uZmlndXJlZCA9IGtleXMuc29tZShmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHJlcS5jb25maWdba2V5XSAhPT0gdW5kZWZpbmVkO1xuICB9KTtcbiAgY29uc3Qgb25lS2V5TWF0Y2hlcyA9IGtleXMuc29tZShmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHJlcS5jb25maWdba2V5XSAhPT0gdW5kZWZpbmVkICYmIGluZm9ba2V5XSA9PT0gcmVxLmNvbmZpZ1trZXldO1xuICB9KTtcblxuICBpZiAob25lS2V5Q29uZmlndXJlZCAmJiAhb25lS2V5TWF0Y2hlcykge1xuICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gIH1cblxuICBpZiAocmVxLnVybCA9PSAnL2xvZ2luJykge1xuICAgIGRlbGV0ZSBpbmZvLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIGlmIChyZXEudXNlckZyb21KV1QpIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICB1c2VyOiByZXEudXNlckZyb21KV1QsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICBpZiAoIWluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgIH0pO1xuICB9XG4gIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG59XG5cbmNvbnN0IGhhbmRsZVJhdGVMaW1pdCA9IGFzeW5jIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICBjb25zdCByYXRlTGltaXRzID0gcmVxLmNvbmZpZy5yYXRlTGltaXRzIHx8IFtdO1xuICB0cnkge1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgcmF0ZUxpbWl0cy5tYXAoYXN5bmMgbGltaXQgPT4ge1xuICAgICAgICBjb25zdCBwYXRoRXhwID0gbmV3IFJlZ0V4cChsaW1pdC5wYXRoKTtcbiAgICAgICAgaWYgKHBhdGhFeHAudGVzdChyZXEudXJsKSkge1xuICAgICAgICAgIGF3YWl0IGxpbWl0LmhhbmRsZXIocmVxLCByZXMsIGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLmVycm9yKFxuICAgICAgICAgICAgICAgICdBbiB1bmtub3duIGVycm9yIG9jY3VyZWQgd2hlbiBhdHRlbXB0aW5nIHRvIGFwcGx5IHRoZSByYXRlIGxpbWl0ZXI6ICcsXG4gICAgICAgICAgICAgICAgZXJyXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXMuc3RhdHVzKDQyOSk7XG4gICAgcmVzLmpzb24oeyBjb2RlOiBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIG5leHQoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVQYXJzZVNlc3Npb24gPSBhc3luYyAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBpbmZvID0gcmVxLmluZm87XG4gICAgaWYgKHJlcS5hdXRoKSB7XG4gICAgICBuZXh0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxldCByZXF1ZXN0QXV0aCA9IG51bGw7XG4gICAgaWYgKFxuICAgICAgaW5mby5zZXNzaW9uVG9rZW4gJiZcbiAgICAgIHJlcS51cmwgPT09ICcvdXBncmFkZVRvUmV2b2NhYmxlU2Vzc2lvbicgJiZcbiAgICAgIGluZm8uc2Vzc2lvblRva2VuLmluZGV4T2YoJ3I6JykgIT0gMFxuICAgICkge1xuICAgICAgcmVxdWVzdEF1dGggPSBhd2FpdCBhdXRoLmdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4oe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlcXVlc3RBdXRoID0gYXdhaXQgYXV0aC5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHtcbiAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBpbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXEuYXV0aCA9IHJlcXVlc3RBdXRoO1xuICAgIG5leHQoKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vIFRPRE86IERldGVybWluZSB0aGUgY29ycmVjdCBlcnJvciBzY2VuYXJpby5cbiAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoJ2Vycm9yIGdldHRpbmcgYXV0aCBmb3Igc2Vzc2lvblRva2VuJywgZXJyb3IpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VTktOT1dOX0VSUk9SLCBlcnJvcik7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGdldENsaWVudElwKHJlcSkge1xuICByZXR1cm4gcmVxLmlwO1xufVxuXG5mdW5jdGlvbiBodHRwQXV0aChyZXEpIHtcbiAgaWYgKCEocmVxLnJlcSB8fCByZXEpLmhlYWRlcnMuYXV0aG9yaXphdGlvbikgcmV0dXJuO1xuXG4gIHZhciBoZWFkZXIgPSAocmVxLnJlcSB8fCByZXEpLmhlYWRlcnMuYXV0aG9yaXphdGlvbjtcbiAgdmFyIGFwcElkLCBtYXN0ZXJLZXksIGphdmFzY3JpcHRLZXk7XG5cbiAgLy8gcGFyc2UgaGVhZGVyXG4gIHZhciBhdXRoUHJlZml4ID0gJ2Jhc2ljICc7XG5cbiAgdmFyIG1hdGNoID0gaGVhZGVyLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihhdXRoUHJlZml4KTtcblxuICBpZiAobWF0Y2ggPT0gMCkge1xuICAgIHZhciBlbmNvZGVkQXV0aCA9IGhlYWRlci5zdWJzdHJpbmcoYXV0aFByZWZpeC5sZW5ndGgsIGhlYWRlci5sZW5ndGgpO1xuICAgIHZhciBjcmVkZW50aWFscyA9IGRlY29kZUJhc2U2NChlbmNvZGVkQXV0aCkuc3BsaXQoJzonKTtcblxuICAgIGlmIChjcmVkZW50aWFscy5sZW5ndGggPT0gMikge1xuICAgICAgYXBwSWQgPSBjcmVkZW50aWFsc1swXTtcbiAgICAgIHZhciBrZXkgPSBjcmVkZW50aWFsc1sxXTtcblxuICAgICAgdmFyIGpzS2V5UHJlZml4ID0gJ2phdmFzY3JpcHQta2V5PSc7XG5cbiAgICAgIHZhciBtYXRjaEtleSA9IGtleS5pbmRleE9mKGpzS2V5UHJlZml4KTtcbiAgICAgIGlmIChtYXRjaEtleSA9PSAwKSB7XG4gICAgICAgIGphdmFzY3JpcHRLZXkgPSBrZXkuc3Vic3RyaW5nKGpzS2V5UHJlZml4Lmxlbmd0aCwga2V5Lmxlbmd0aCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtYXN0ZXJLZXkgPSBrZXk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgYXBwSWQ6IGFwcElkLCBtYXN0ZXJLZXk6IG1hc3RlcktleSwgamF2YXNjcmlwdEtleTogamF2YXNjcmlwdEtleSB9O1xufVxuXG5mdW5jdGlvbiBkZWNvZGVCYXNlNjQoc3RyKSB7XG4gIHJldHVybiBCdWZmZXIuZnJvbShzdHIsICdiYXNlNjQnKS50b1N0cmluZygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWxsb3dDcm9zc0RvbWFpbihhcHBJZCkge1xuICByZXR1cm4gKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChhcHBJZCwgZ2V0TW91bnRGb3JSZXF1ZXN0KHJlcSkpO1xuICAgIGxldCBhbGxvd0hlYWRlcnMgPSBERUZBVUxUX0FMTE9XRURfSEVBREVSUztcbiAgICBpZiAoY29uZmlnICYmIGNvbmZpZy5hbGxvd0hlYWRlcnMpIHtcbiAgICAgIGFsbG93SGVhZGVycyArPSBgLCAke2NvbmZpZy5hbGxvd0hlYWRlcnMuam9pbignLCAnKX1gO1xuICAgIH1cblxuICAgIGNvbnN0IGJhc2VPcmlnaW5zID1cbiAgICAgIHR5cGVvZiBjb25maWc/LmFsbG93T3JpZ2luID09PSAnc3RyaW5nJyA/IFtjb25maWcuYWxsb3dPcmlnaW5dIDogY29uZmlnPy5hbGxvd09yaWdpbiA/PyBbJyonXTtcbiAgICBjb25zdCByZXF1ZXN0T3JpZ2luID0gcmVxLmhlYWRlcnMub3JpZ2luO1xuICAgIGNvbnN0IGFsbG93T3JpZ2lucyA9XG4gICAgICByZXF1ZXN0T3JpZ2luICYmIGJhc2VPcmlnaW5zLmluY2x1ZGVzKHJlcXVlc3RPcmlnaW4pID8gcmVxdWVzdE9yaWdpbiA6IGJhc2VPcmlnaW5zWzBdO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbicsIGFsbG93T3JpZ2lucyk7XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcycsICdHRVQsUFVULFBPU1QsREVMRVRFLE9QVElPTlMnKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJywgYWxsb3dIZWFkZXJzKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1FeHBvc2UtSGVhZGVycycsICdYLVBhcnNlLUpvYi1TdGF0dXMtSWQsIFgtUGFyc2UtUHVzaC1TdGF0dXMtSWQnKTtcbiAgICAvLyBpbnRlcmNlcHQgT1BUSU9OUyBtZXRob2RcbiAgICBpZiAoJ09QVElPTlMnID09IHJlcS5tZXRob2QpIHtcbiAgICAgIHJlcy5zZW5kU3RhdHVzKDIwMCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHQoKTtcbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbGxvd01ldGhvZE92ZXJyaWRlKHJlcSwgcmVzLCBuZXh0KSB7XG4gIGlmIChyZXEubWV0aG9kID09PSAnUE9TVCcgJiYgcmVxLmJvZHkuX21ldGhvZCkge1xuICAgIHJlcS5vcmlnaW5hbE1ldGhvZCA9IHJlcS5tZXRob2Q7XG4gICAgcmVxLm1ldGhvZCA9IHJlcS5ib2R5Ll9tZXRob2Q7XG4gICAgZGVsZXRlIHJlcS5ib2R5Ll9tZXRob2Q7XG4gIH1cbiAgbmV4dCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlUGFyc2VFcnJvcnMoZXJyLCByZXEsIHJlcywgbmV4dCkge1xuICBjb25zdCBsb2cgPSAocmVxLmNvbmZpZyAmJiByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIpIHx8IGRlZmF1bHRMb2dnZXI7XG4gIGlmIChlcnIgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgIGlmIChyZXEuY29uZmlnICYmIHJlcS5jb25maWcuZW5hYmxlRXhwcmVzc0Vycm9ySGFuZGxlcikge1xuICAgICAgcmV0dXJuIG5leHQoZXJyKTtcbiAgICB9XG4gICAgbGV0IGh0dHBTdGF0dXM7XG4gICAgLy8gVE9ETzogZmlsbCBvdXQgdGhpcyBtYXBwaW5nXG4gICAgc3dpdGNoIChlcnIuY29kZSkge1xuICAgICAgY2FzZSBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1I6XG4gICAgICAgIGh0dHBTdGF0dXMgPSA1MDA7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EOlxuICAgICAgICBodHRwU3RhdHVzID0gNDA0O1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGh0dHBTdGF0dXMgPSA0MDA7XG4gICAgfVxuICAgIHJlcy5zdGF0dXMoaHR0cFN0YXR1cyk7XG4gICAgcmVzLmpzb24oeyBjb2RlOiBlcnIuY29kZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgIGxvZy5lcnJvcignUGFyc2UgZXJyb3I6ICcsIGVycik7XG4gIH0gZWxzZSBpZiAoZXJyLnN0YXR1cyAmJiBlcnIubWVzc2FnZSkge1xuICAgIHJlcy5zdGF0dXMoZXJyLnN0YXR1cyk7XG4gICAgcmVzLmpzb24oeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgaWYgKCEocHJvY2VzcyAmJiBwcm9jZXNzLmVudi5URVNUSU5HKSkge1xuICAgICAgbmV4dChlcnIpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBsb2cuZXJyb3IoJ1VuY2F1Z2h0IGludGVybmFsIHNlcnZlciBlcnJvci4nLCBlcnIsIGVyci5zdGFjayk7XG4gICAgcmVzLnN0YXR1cyg1MDApO1xuICAgIHJlcy5qc29uKHtcbiAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgIG1lc3NhZ2U6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJyxcbiAgICB9KTtcbiAgICBpZiAoIShwcm9jZXNzICYmIHByb2Nlc3MuZW52LlRFU1RJTkcpKSB7XG4gICAgICBuZXh0KGVycik7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKHJlcSwgcmVzLCBuZXh0KSB7XG4gIGlmICghcmVxLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXMuc3RhdHVzKDQwMyk7XG4gICAgcmVzLmVuZCgne1wiZXJyb3JcIjpcInVuYXV0aG9yaXplZDogbWFzdGVyIGtleSBpcyByZXF1aXJlZFwifScpO1xuICAgIHJldHVybjtcbiAgfVxuICBuZXh0KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyhyZXF1ZXN0KSB7XG4gIGlmICghcmVxdWVzdC5hdXRoLmlzTWFzdGVyKSB7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoKTtcbiAgICBlcnJvci5zdGF0dXMgPSA0MDM7XG4gICAgZXJyb3IubWVzc2FnZSA9ICd1bmF1dGhvcml6ZWQ6IG1hc3RlciBrZXkgaXMgcmVxdWlyZWQnO1xuICAgIHRocm93IGVycm9yO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn1cblxuZXhwb3J0IGNvbnN0IGFkZFJhdGVMaW1pdCA9IChyb3V0ZSwgY29uZmlnLCBjbG91ZCkgPT4ge1xuICBpZiAodHlwZW9mIGNvbmZpZyA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25maWcgPSBDb25maWcuZ2V0KGNvbmZpZyk7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gcm91dGUpIHtcbiAgICBpZiAoIVJhdGVMaW1pdE9wdGlvbnNba2V5XSkge1xuICAgICAgdGhyb3cgYEludmFsaWQgcmF0ZSBsaW1pdCBvcHRpb24gXCIke2tleX1cImA7XG4gICAgfVxuICB9XG4gIGlmICghY29uZmlnLnJhdGVMaW1pdHMpIHtcbiAgICBjb25maWcucmF0ZUxpbWl0cyA9IFtdO1xuICB9XG4gIGNvbnN0IHJlZGlzU3RvcmUgPSB7XG4gICAgY29ubmVjdGlvblByb21pc2U6IFByb21pc2UucmVzb2x2ZSgpLFxuICAgIHN0b3JlOiBudWxsLFxuICAgIGNvbm5lY3RlZDogZmFsc2UsXG4gIH07XG4gIGlmIChyb3V0ZS5yZWRpc1VybCkge1xuICAgIGNvbnN0IGNsaWVudCA9IGNyZWF0ZUNsaWVudCh7XG4gICAgICB1cmw6IHJvdXRlLnJlZGlzVXJsLFxuICAgIH0pO1xuICAgIHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UgPSBhc3luYyAoKSA9PiB7XG4gICAgICBpZiAocmVkaXNTdG9yZS5jb25uZWN0ZWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2xpZW50LmNvbm5lY3QoKTtcbiAgICAgICAgcmVkaXNTdG9yZS5jb25uZWN0ZWQgPSB0cnVlO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zdCBsb2cgPSBjb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICAgICAgbG9nLmVycm9yKGBDb3VsZCBub3QgY29ubmVjdCB0byByZWRpc1VSTCBpbiByYXRlIGxpbWl0OiAke2V9YCk7XG4gICAgICB9XG4gICAgfTtcbiAgICByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgcmVkaXNTdG9yZS5zdG9yZSA9IG5ldyBSZWRpc1N0b3JlKHtcbiAgICAgIHNlbmRDb21tYW5kOiBhc3luYyAoLi4uYXJncykgPT4ge1xuICAgICAgICBhd2FpdCByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2VuZENvbW1hbmQoYXJncyk7XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG4gIGxldCB0cmFuc2Zvcm1QYXRoID0gcm91dGUucmVxdWVzdFBhdGguc3BsaXQoJy8qJykuam9pbignLyguKiknKTtcbiAgaWYgKHRyYW5zZm9ybVBhdGggPT09ICcqJykge1xuICAgIHRyYW5zZm9ybVBhdGggPSAnKC4qKSc7XG4gIH1cbiAgY29uZmlnLnJhdGVMaW1pdHMucHVzaCh7XG4gICAgcGF0aDogcGF0aFRvUmVnZXhwKHRyYW5zZm9ybVBhdGgpLFxuICAgIGhhbmRsZXI6IHJhdGVMaW1pdCh7XG4gICAgICB3aW5kb3dNczogcm91dGUucmVxdWVzdFRpbWVXaW5kb3csXG4gICAgICBtYXg6IHJvdXRlLnJlcXVlc3RDb3VudCxcbiAgICAgIG1lc3NhZ2U6IHJvdXRlLmVycm9yUmVzcG9uc2VNZXNzYWdlIHx8IFJhdGVMaW1pdE9wdGlvbnMuZXJyb3JSZXNwb25zZU1lc3NhZ2UuZGVmYXVsdCxcbiAgICAgIGhhbmRsZXI6IChyZXF1ZXN0LCByZXNwb25zZSwgbmV4dCwgb3B0aW9ucykgPT4ge1xuICAgICAgICB0aHJvdyB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogb3B0aW9ucy5tZXNzYWdlLFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIHNraXA6IHJlcXVlc3QgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5pcCA9PT0gJzEyNy4wLjAuMScgJiYgIXJvdXRlLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLmluY2x1ZGVNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLnJlcXVlc3RNZXRob2RzKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocm91dGUucmVxdWVzdE1ldGhvZHMpKSB7XG4gICAgICAgICAgICBpZiAoIXJvdXRlLnJlcXVlc3RNZXRob2RzLmluY2x1ZGVzKHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgcmVnRXhwID0gbmV3IFJlZ0V4cChyb3V0ZS5yZXF1ZXN0TWV0aG9kcyk7XG4gICAgICAgICAgICBpZiAoIXJlZ0V4cC50ZXN0KHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuYXV0aD8uaXNNYXN0ZXI7XG4gICAgICB9LFxuICAgICAga2V5R2VuZXJhdG9yOiBhc3luYyByZXF1ZXN0ID0+IHtcbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLmdsb2JhbCkge1xuICAgICAgICAgIHJldHVybiByZXF1ZXN0LmNvbmZpZy5hcHBJZDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0b2tlbiA9IHJlcXVlc3QuaW5mby5zZXNzaW9uVG9rZW47XG4gICAgICAgIGlmIChyb3V0ZS56b25lID09PSBQYXJzZS5TZXJ2ZXIuUmF0ZUxpbWl0Wm9uZS5zZXNzaW9uICYmIHRva2VuKSB7XG4gICAgICAgICAgcmV0dXJuIHRva2VuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyb3V0ZS56b25lID09PSBQYXJzZS5TZXJ2ZXIuUmF0ZUxpbWl0Wm9uZS51c2VyICYmIHRva2VuKSB7XG4gICAgICAgICAgaWYgKCFyZXF1ZXN0LmF1dGgpIHtcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gaGFuZGxlUGFyc2VTZXNzaW9uKHJlcXVlc3QsIG51bGwsIHJlc29sdmUpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHJlcXVlc3QuYXV0aD8udXNlcj8uaWQgJiYgcmVxdWVzdC56b25lID09PSAndXNlcicpIHtcbiAgICAgICAgICAgIHJldHVybiByZXF1ZXN0LmF1dGgudXNlci5pZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuY29uZmlnLmlwO1xuICAgICAgfSxcbiAgICAgIHN0b3JlOiByZWRpc1N0b3JlLnN0b3JlLFxuICAgIH0pLFxuICAgIGNsb3VkLFxuICB9KTtcbiAgQ29uZmlnLnB1dChjb25maWcpO1xufTtcblxuLyoqXG4gKiBEZWR1cGxpY2F0ZXMgYSByZXF1ZXN0IHRvIGVuc3VyZSBpZGVtcG90ZW5jeS4gRHVwbGljYXRlcyBhcmUgZGV0ZXJtaW5lZCBieSB0aGUgcmVxdWVzdCBJRFxuICogaW4gdGhlIHJlcXVlc3QgaGVhZGVyLiBJZiBhIHJlcXVlc3QgaGFzIG5vIHJlcXVlc3QgSUQsIGl0IGlzIGV4ZWN1dGVkIGFueXdheS5cbiAqIEBwYXJhbSB7Kn0gcmVxIFRoZSByZXF1ZXN0IHRvIGV2YWx1YXRlLlxuICogQHJldHVybnMgUHJvbWlzZTx7fT5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeShyZXEpIHtcbiAgLy8gRW5hYmxlIGZlYXR1cmUgb25seSBmb3IgTW9uZ29EQlxuICBpZiAoXG4gICAgIShcbiAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXIgfHxcbiAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UuYWRhcHRlciBpbnN0YW5jZW9mIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXJcbiAgICApXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBHZXQgcGFyYW1ldGVyc1xuICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICBjb25zdCByZXF1ZXN0SWQgPSAoKHJlcSB8fCB7fSkuaGVhZGVycyB8fCB7fSlbJ3gtcGFyc2UtcmVxdWVzdC1pZCddO1xuICBjb25zdCB7IHBhdGhzLCB0dGwgfSA9IGNvbmZpZy5pZGVtcG90ZW5jeU9wdGlvbnM7XG4gIGlmICghcmVxdWVzdElkIHx8ICFjb25maWcuaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFJlcXVlc3QgcGF0aCBtYXkgY29udGFpbiB0cmFpbGluZyBzbGFzaGVzLCBkZXBlbmRpbmcgb24gdGhlIG9yaWdpbmFsIHJlcXVlc3QsIHNvIHJlbW92ZVxuICAvLyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIHRvIG1ha2UgaXQgZWFzaWVyIHRvIHNwZWNpZnkgcGF0aHMgaW4gdGhlIGNvbmZpZ3VyYXRpb25cbiAgY29uc3QgcmVxUGF0aCA9IHJlcS5wYXRoLnJlcGxhY2UoL15cXC98XFwvJC8sICcnKTtcbiAgLy8gRGV0ZXJtaW5lIHdoZXRoZXIgaWRlbXBvdGVuY3kgaXMgZW5hYmxlZCBmb3IgY3VycmVudCByZXF1ZXN0IHBhdGhcbiAgbGV0IG1hdGNoID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcGF0aCBvZiBwYXRocykge1xuICAgIC8vIEFzc3VtZSBvbmUgd2FudHMgYSBwYXRoIHRvIGFsd2F5cyBtYXRjaCBmcm9tIHRoZSBiZWdpbm5pbmcgdG8gcHJldmVudCBhbnkgbWlzdGFrZXNcbiAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocGF0aC5jaGFyQXQoMCkgPT09ICdeJyA/IHBhdGggOiAnXicgKyBwYXRoKTtcbiAgICBpZiAocmVxUGF0aC5tYXRjaChyZWdleCkpIHtcbiAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZiAoIW1hdGNoKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFRyeSB0byBzdG9yZSByZXF1ZXN0XG4gIGNvbnN0IGV4cGlyeURhdGUgPSBuZXcgRGF0ZShuZXcgRGF0ZSgpLnNldFNlY29uZHMobmV3IERhdGUoKS5nZXRTZWNvbmRzKCkgKyB0dGwpKTtcbiAgcmV0dXJuIHJlc3RcbiAgICAuY3JlYXRlKGNvbmZpZywgYXV0aC5tYXN0ZXIoY29uZmlnKSwgJ19JZGVtcG90ZW5jeScsIHtcbiAgICAgIHJlcUlkOiByZXF1ZXN0SWQsXG4gICAgICBleHBpcmU6IFBhcnNlLl9lbmNvZGUoZXhwaXJ5RGF0ZSksXG4gICAgfSlcbiAgICAuY2F0Y2goZSA9PiB7XG4gICAgICBpZiAoZS5jb2RlID09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRFVQTElDQVRFX1JFUVVFU1QsICdEdXBsaWNhdGUgcmVxdWVzdCcpO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpIHtcbiAgcmVzLnN0YXR1cyg0MDMpO1xuICByZXMuZW5kKCd7XCJlcnJvclwiOlwidW5hdXRob3JpemVkXCJ9Jyk7XG59XG5cbmZ1bmN0aW9uIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpIHtcbiAgcmVzLnN0YXR1cyg0MDApO1xuICByZXMuanNvbih7IGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgZXJyb3I6ICdJbnZhbGlkIG9iamVjdCBmb3IgY29udGV4dC4nIH0pO1xufVxuIl0sIm1hcHBpbmdz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