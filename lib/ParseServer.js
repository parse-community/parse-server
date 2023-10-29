"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _Options = require("./Options");
var _defaults = _interopRequireDefault(require("./defaults"));
var logging = _interopRequireWildcard(require("./logger"));
var _Config = _interopRequireDefault(require("./Config"));
var _PromiseRouter = _interopRequireDefault(require("./PromiseRouter"));
var _requiredParameter = _interopRequireDefault(require("./requiredParameter"));
var _AnalyticsRouter = require("./Routers/AnalyticsRouter");
var _ClassesRouter = require("./Routers/ClassesRouter");
var _FeaturesRouter = require("./Routers/FeaturesRouter");
var _FilesRouter = require("./Routers/FilesRouter");
var _FunctionsRouter = require("./Routers/FunctionsRouter");
var _GlobalConfigRouter = require("./Routers/GlobalConfigRouter");
var _GraphQLRouter = require("./Routers/GraphQLRouter");
var _HooksRouter = require("./Routers/HooksRouter");
var _IAPValidationRouter = require("./Routers/IAPValidationRouter");
var _InstallationsRouter = require("./Routers/InstallationsRouter");
var _LogsRouter = require("./Routers/LogsRouter");
var _ParseLiveQueryServer = require("./LiveQuery/ParseLiveQueryServer");
var _PagesRouter = require("./Routers/PagesRouter");
var _PublicAPIRouter = require("./Routers/PublicAPIRouter");
var _PushRouter = require("./Routers/PushRouter");
var _CloudCodeRouter = require("./Routers/CloudCodeRouter");
var _RolesRouter = require("./Routers/RolesRouter");
var _SchemasRouter = require("./Routers/SchemasRouter");
var _SessionsRouter = require("./Routers/SessionsRouter");
var _UsersRouter = require("./Routers/UsersRouter");
var _PurgeRouter = require("./Routers/PurgeRouter");
var _AudiencesRouter = require("./Routers/AudiencesRouter");
var _AggregateRouter = require("./Routers/AggregateRouter");
var _ParseServerRESTController = require("./ParseServerRESTController");
var controllers = _interopRequireWildcard(require("./Controllers"));
var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");
var _SecurityRouter = require("./Routers/SecurityRouter");
var _CheckRunner = _interopRequireDefault(require("./Security/CheckRunner"));
var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));
var _DefinedSchemas = require("./SchemaMigrations/DefinedSchemas");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
  bodyParser = require('body-parser'),
  express = require('express'),
  middlewares = require('./middlewares'),
  Parse = require('parse/node').Parse,
  {
    parse
  } = require('graphql'),
  path = require('path'),
  fs = require('fs');
// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

// ParseServer works like a constructor of an express app.
// https://parseplatform.org/parse-server/api/master/ParseServerOptions.html
class ParseServer {
  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options) {
    // Scan for deprecated Parse Server options
    _Deprecator.default.scanParseServerOptions(options);
    // Set option defaults
    injectDefaults(options);
    const {
      appId = (0, _requiredParameter.default)('You must provide an appId!'),
      masterKey = (0, _requiredParameter.default)('You must provide a masterKey!'),
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!')
    } = options;
    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    _Config.default.validateOptions(options);
    const allControllers = controllers.getControllers(options);
    options.state = 'initialized';
    this.config = _Config.default.put(Object.assign({}, options, allControllers));
    this.config.masterKeyIpsStore = new Map();
    this.config.maintenanceKeyIpsStore = new Map();
    logging.setLogger(allControllers.loggerController);
  }

  /**
   * Starts Parse Server as an express app; this promise resolves when Parse Server is ready to accept requests.
   */

  async start() {
    try {
      if (this.config.state === 'ok') {
        return this;
      }
      this.config.state = 'starting';
      _Config.default.put(this.config);
      const {
        databaseController,
        hooksController,
        cloud,
        security,
        schema,
        cacheAdapter,
        liveQueryController
      } = this.config;
      try {
        await databaseController.performInitialization();
      } catch (e) {
        if (e.code !== Parse.Error.DUPLICATE_VALUE) {
          throw e;
        }
      }
      await hooksController.load();
      const startupPromises = [];
      if (schema) {
        startupPromises.push(new _DefinedSchemas.DefinedSchemas(schema, this.config).execute());
      }
      if (cacheAdapter !== null && cacheAdapter !== void 0 && cacheAdapter.connect && typeof cacheAdapter.connect === 'function') {
        startupPromises.push(cacheAdapter.connect());
      }
      startupPromises.push(liveQueryController.connect());
      await Promise.all(startupPromises);
      if (cloud) {
        addParseCloud();
        if (typeof cloud === 'function') {
          await Promise.resolve(cloud(Parse));
        } else if (typeof cloud === 'string') {
          var _json;
          let json;
          if (process.env.npm_package_json) {
            json = require(process.env.npm_package_json);
          }
          if (process.env.npm_package_type === 'module' || ((_json = json) === null || _json === void 0 ? void 0 : _json.type) === 'module') {
            await import(path.resolve(process.cwd(), cloud));
          } else {
            require(path.resolve(process.cwd(), cloud));
          }
        } else {
          throw "argument 'cloud' must either be a string or a function";
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      if (security && security.enableCheck && security.enableCheckLog) {
        new _CheckRunner.default(security).run();
      }
      this.config.state = 'ok';
      _Config.default.put(this.config);
      return this;
    } catch (error) {
      console.error(error);
      this.config.state = 'error';
      throw error;
    }
  }
  get app() {
    if (!this._app) {
      this._app = ParseServer.app(this.config);
    }
    return this._app;
  }
  handleShutdown() {
    var _this$liveQueryServer, _this$liveQueryServer2;
    const promises = [];
    const {
      adapter: databaseAdapter
    } = this.config.databaseController;
    if (databaseAdapter && typeof databaseAdapter.handleShutdown === 'function') {
      promises.push(databaseAdapter.handleShutdown());
    }
    const {
      adapter: fileAdapter
    } = this.config.filesController;
    if (fileAdapter && typeof fileAdapter.handleShutdown === 'function') {
      promises.push(fileAdapter.handleShutdown());
    }
    const {
      adapter: cacheAdapter
    } = this.config.cacheController;
    if (cacheAdapter && typeof cacheAdapter.handleShutdown === 'function') {
      promises.push(cacheAdapter.handleShutdown());
    }
    if ((_this$liveQueryServer = this.liveQueryServer) !== null && _this$liveQueryServer !== void 0 && (_this$liveQueryServer2 = _this$liveQueryServer.server) !== null && _this$liveQueryServer2 !== void 0 && _this$liveQueryServer2.close) {
      promises.push(new Promise(resolve => this.liveQueryServer.server.close(resolve)));
    }
    if (this.liveQueryServer) {
      promises.push(this.liveQueryServer.shutdown());
    }
    return (promises.length > 0 ? Promise.all(promises) : Promise.resolve()).then(() => {
      if (this.config.serverCloseComplete) {
        this.config.serverCloseComplete();
      }
    });
  }

  /**
   * @static
   * Allow developers to customize each request with inversion of control/dependency injection
   */
  static applyRequestContextMiddleware(api, options) {
    if (options.requestContextMiddleware) {
      if (typeof options.requestContextMiddleware !== 'function') {
        throw new Error('requestContextMiddleware must be a function');
      }
      api.use(options.requestContextMiddleware);
    }
  }
  /**
   * @static
   * Create an express app for the parse server
   * @param {Object} options let you specify the maxUploadSize when creating the express app  */
  static app(options) {
    const {
      maxUploadSize = '20mb',
      appId,
      directAccess,
      pages,
      rateLimit = []
    } = options;
    // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
    var api = express();
    //api.use("/apps", express.static(__dirname + "/public"));
    api.use(middlewares.allowCrossDomain(appId));
    // File handling needs to be before default middlewares are applied
    api.use('/', new _FilesRouter.FilesRouter().expressRouter({
      maxUploadSize: maxUploadSize
    }));
    api.use('/health', function (req, res) {
      res.status(options.state === 'ok' ? 200 : 503);
      if (options.state === 'starting') {
        res.set('Retry-After', 1);
      }
      res.json({
        status: options.state
      });
    });
    api.use('/', bodyParser.urlencoded({
      extended: false
    }), pages.enableRouter ? new _PagesRouter.PagesRouter(pages).expressRouter() : new _PublicAPIRouter.PublicAPIRouter().expressRouter());
    api.use(bodyParser.json({
      type: '*/*',
      limit: maxUploadSize
    }));
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);
    const routes = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const route of routes) {
      middlewares.addRateLimit(route, options);
    }
    api.use(middlewares.handleParseSession);
    this.applyRequestContextMiddleware(api, options);
    const appRouter = ParseServer.promiseRouter({
      appId
    });
    api.use(appRouter.expressRouter());
    api.use(middlewares.handleParseErrors);

    // run the following when not testing
    if (!process.env.TESTING) {
      //This causes tests to spew some useless warnings, so disable in test
      /* istanbul ignore next */
      process.on('uncaughtException', err => {
        if (err.code === 'EADDRINUSE') {
          // user-friendly message for this common error
          process.stderr.write(`Unable to listen on port ${err.port}. The port is already in use.`);
          process.exit(0);
        } else {
          throw err;
        }
      });
      // verify the server url after a 'mount' event is received
      /* istanbul ignore next */
      // api.on('mount', async function () {
      //   await new Promise(resolve => setTimeout(resolve, 1000));
      //   ParseServer.verifyServerUrl();
      // });
    }

    if (process.env.PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS === '1' || directAccess) {
      Parse.CoreManager.setRESTController((0, _ParseServerRESTController.ParseServerRESTController)(appId, appRouter));
    }
    return api;
  }
  static promiseRouter({
    appId
  }) {
    const routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter(), new _FeaturesRouter.FeaturesRouter(), new _GlobalConfigRouter.GlobalConfigRouter(), new _GraphQLRouter.GraphQLRouter(), new _PurgeRouter.PurgeRouter(), new _HooksRouter.HooksRouter(), new _CloudCodeRouter.CloudCodeRouter(), new _AudiencesRouter.AudiencesRouter(), new _AggregateRouter.AggregateRouter(), new _SecurityRouter.SecurityRouter()];
    const routes = routers.reduce((memo, router) => {
      return memo.concat(router.routes);
    }, []);
    const appRouter = new _PromiseRouter.default(routes, appId);
    batch.mountOnto(appRouter);
    return appRouter;
  }

  /**
   * starts the parse server's express app
   * @param {ParseServerOptions} options to use to start the server
   * @returns {ParseServer} the parse server instance
   */

  async startApp(options) {
    try {
      await this.start();
    } catch (e) {
      console.error('Error on ParseServer.startApp: ', e);
      throw e;
    }
    const app = express();
    if (options.middleware) {
      let middleware;
      if (typeof options.middleware == 'string') {
        middleware = require(path.resolve(process.cwd(), options.middleware));
      } else {
        middleware = options.middleware; // use as-is let express fail
      }

      app.use(middleware);
    }
    app.use(options.mountPath, this.app);
    if (options.mountGraphQL === true || options.mountPlayground === true) {
      let graphQLCustomTypeDefs = undefined;
      if (typeof options.graphQLSchema === 'string') {
        graphQLCustomTypeDefs = parse(fs.readFileSync(options.graphQLSchema, 'utf8'));
      } else if (typeof options.graphQLSchema === 'object' || typeof options.graphQLSchema === 'function') {
        graphQLCustomTypeDefs = options.graphQLSchema;
      }
      const parseGraphQLServer = new _ParseGraphQLServer.ParseGraphQLServer(this, {
        graphQLPath: options.graphQLPath,
        playgroundPath: options.playgroundPath,
        graphQLCustomTypeDefs
      });
      if (options.mountGraphQL) {
        parseGraphQLServer.applyGraphQL(app);
      }
      if (options.mountPlayground) {
        parseGraphQLServer.applyPlayground(app);
      }
    }
    const server = await new Promise(resolve => {
      app.listen(options.port, options.host, function () {
        resolve(this);
      });
    });
    this.server = server;
    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = await ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions, options);
    }
    if (options.trustProxy) {
      app.set('trust proxy', options.trustProxy);
    }
    /* istanbul ignore next */
    if (!process.env.TESTING) {
      configureListeners(this);
    }
    this.expressApp = app;
    return this;
  }

  /**
   * Creates a new ParseServer and starts it.
   * @param {ParseServerOptions} options used to start the server
   * @returns {ParseServer} the parse server instance
   */
  static async startApp(options) {
    const parseServer = new ParseServer(options);
    return parseServer.startApp(options);
  }

  /**
   * Helper method to create a liveQuery server
   * @static
   * @param {Server} httpServer an optional http server to pass
   * @param {LiveQueryServerOptions} config options for the liveQueryServer
   * @param {ParseServerOptions} options options for the ParseServer
   * @returns {Promise<ParseLiveQueryServer>} the live query server instance
   */
  static async createLiveQueryServer(httpServer, config, options) {
    if (!httpServer || config && config.port) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }
    const server = new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config, options);
    await server.connect();
    return server;
  }
  static async verifyServerUrl() {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
      var _response$headers;
      const isValidHttpUrl = string => {
        let url;
        try {
          url = new URL(string);
        } catch (_) {
          return false;
        }
        return url.protocol === 'http:' || url.protocol === 'https:';
      };
      const url = `${Parse.serverURL.replace(/\/$/, '')}/health`;
      if (!isValidHttpUrl(url)) {
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}' as the URL is invalid.` + ` Cloud code and push notifications may be unavailable!\n`);
        return;
      }
      const request = require('./request');
      const response = await request({
        url
      }).catch(response => response);
      const json = response.data || null;
      const retry = (_response$headers = response.headers) === null || _response$headers === void 0 ? void 0 : _response$headers['retry-after'];
      if (retry) {
        await new Promise(resolve => setTimeout(resolve, retry * 1000));
        return this.verifyServerUrl();
      }
      if (response.status !== 200 || (json === null || json === void 0 ? void 0 : json.status) !== 'ok') {
        /* eslint-disable no-console */
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}'.` + ` Cloud code and push notifications may be unavailable!\n`);
        /* eslint-enable no-console */
        return;
      }
      return true;
    }
  }
}
function addParseCloud() {
  const ParseCloud = require('./cloud-code/Parse.Cloud');
  const ParseServer = require('./cloud-code/Parse.Server');
  Object.defineProperty(Parse, 'Server', {
    get() {
      const conf = _Config.default.get(Parse.applicationId);
      return _objectSpread(_objectSpread({}, conf), ParseServer);
    },
    set(newVal) {
      newVal.appId = Parse.applicationId;
      _Config.default.put(newVal);
    },
    configurable: true
  });
  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}
function injectDefaults(options) {
  Object.keys(_defaults.default).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(options, key)) {
      options[key] = _defaults.default[key];
    }
  });
  if (!Object.prototype.hasOwnProperty.call(options, 'serverURL')) {
    options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
  }

  // Reserved Characters
  if (options.appId) {
    const regex = /[!#$%'()*+&/:;=?@[\]{}^,|<>]/g;
    if (options.appId.match(regex)) {
      console.warn(`\nWARNING, appId that contains special characters can cause issues while using with urls.\n`);
    }
  }

  // Backwards compatibility
  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING && console.warn(`\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`);
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(new Set([...(_defaults.default.userSensitiveFields || []), ...(options.userSensitiveFields || [])]));

    // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.
    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({
        _User: []
      }, options.protectedFields);
    }
    options.protectedFields['_User']['*'] = Array.from(new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields]));
  }

  // Merge protectedFields options with defaults.
  Object.keys(_defaults.default.protectedFields).forEach(c => {
    const cur = options.protectedFields[c];
    if (!cur) {
      options.protectedFields[c] = _defaults.default.protectedFields[c];
    } else {
      Object.keys(_defaults.default.protectedFields[c]).forEach(r => {
        const unq = new Set([...(options.protectedFields[c][r] || []), ..._defaults.default.protectedFields[c][r]]);
        options.protectedFields[c][r] = Array.from(unq);
      });
    }
  });
}

// Those can't be tested as it requires a subprocess
/* istanbul ignore next */
function configureListeners(parseServer) {
  const server = parseServer.server;
  const sockets = {};
  /* Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM if it has client connections that haven't timed out. (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
    This function, along with `destroyAliveConnections()`, intend to fix this behavior such that parse server will close all open connections and initiate the shutdown process as soon as it receives a SIGINT/SIGTERM signal. */
  server.on('connection', socket => {
    const socketId = socket.remoteAddress + ':' + socket.remotePort;
    sockets[socketId] = socket;
    socket.on('close', () => {
      delete sockets[socketId];
    });
  });
  const destroyAliveConnections = function () {
    for (const socketId in sockets) {
      try {
        sockets[socketId].destroy();
      } catch (e) {
        /* */
      }
    }
  };
  const handleShutdown = function () {
    process.stdout.write('Termination signal received. Shutting down.');
    destroyAliveConnections();
    server.close();
    parseServer.handleShutdown();
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}
var _default = ParseServer;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfT3B0aW9ucyIsInJlcXVpcmUiLCJfZGVmYXVsdHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwibG9nZ2luZyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0NvbmZpZyIsIl9Qcm9taXNlUm91dGVyIiwiX3JlcXVpcmVkUGFyYW1ldGVyIiwiX0FuYWx5dGljc1JvdXRlciIsIl9DbGFzc2VzUm91dGVyIiwiX0ZlYXR1cmVzUm91dGVyIiwiX0ZpbGVzUm91dGVyIiwiX0Z1bmN0aW9uc1JvdXRlciIsIl9HbG9iYWxDb25maWdSb3V0ZXIiLCJfR3JhcGhRTFJvdXRlciIsIl9Ib29rc1JvdXRlciIsIl9JQVBWYWxpZGF0aW9uUm91dGVyIiwiX0luc3RhbGxhdGlvbnNSb3V0ZXIiLCJfTG9nc1JvdXRlciIsIl9QYXJzZUxpdmVRdWVyeVNlcnZlciIsIl9QYWdlc1JvdXRlciIsIl9QdWJsaWNBUElSb3V0ZXIiLCJfUHVzaFJvdXRlciIsIl9DbG91ZENvZGVSb3V0ZXIiLCJfUm9sZXNSb3V0ZXIiLCJfU2NoZW1hc1JvdXRlciIsIl9TZXNzaW9uc1JvdXRlciIsIl9Vc2Vyc1JvdXRlciIsIl9QdXJnZVJvdXRlciIsIl9BdWRpZW5jZXNSb3V0ZXIiLCJfQWdncmVnYXRlUm91dGVyIiwiX1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIiLCJjb250cm9sbGVycyIsIl9QYXJzZUdyYXBoUUxTZXJ2ZXIiLCJfU2VjdXJpdHlSb3V0ZXIiLCJfQ2hlY2tSdW5uZXIiLCJfRGVwcmVjYXRvciIsIl9EZWZpbmVkU2NoZW1hcyIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsIm5vZGVJbnRlcm9wIiwiV2Vha01hcCIsImNhY2hlQmFiZWxJbnRlcm9wIiwiY2FjaGVOb2RlSW50ZXJvcCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiY2FjaGUiLCJoYXMiLCJnZXQiLCJuZXdPYmoiLCJoYXNQcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImRlc2MiLCJzZXQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsIlR5cGVFcnJvciIsIk51bWJlciIsImJhdGNoIiwiYm9keVBhcnNlciIsImV4cHJlc3MiLCJtaWRkbGV3YXJlcyIsIlBhcnNlIiwicGFyc2UiLCJwYXRoIiwiZnMiLCJhZGRQYXJzZUNsb3VkIiwiUGFyc2VTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsIm9wdGlvbnMiLCJEZXByZWNhdG9yIiwic2NhblBhcnNlU2VydmVyT3B0aW9ucyIsImluamVjdERlZmF1bHRzIiwiYXBwSWQiLCJyZXF1aXJlZFBhcmFtZXRlciIsIm1hc3RlcktleSIsImphdmFzY3JpcHRLZXkiLCJzZXJ2ZXJVUkwiLCJpbml0aWFsaXplIiwiQ29uZmlnIiwidmFsaWRhdGVPcHRpb25zIiwiYWxsQ29udHJvbGxlcnMiLCJnZXRDb250cm9sbGVycyIsInN0YXRlIiwiY29uZmlnIiwicHV0IiwiYXNzaWduIiwibWFzdGVyS2V5SXBzU3RvcmUiLCJNYXAiLCJtYWludGVuYW5jZUtleUlwc1N0b3JlIiwic2V0TG9nZ2VyIiwibG9nZ2VyQ29udHJvbGxlciIsInN0YXJ0IiwiZGF0YWJhc2VDb250cm9sbGVyIiwiaG9va3NDb250cm9sbGVyIiwiY2xvdWQiLCJzZWN1cml0eSIsInNjaGVtYSIsImNhY2hlQWRhcHRlciIsImxpdmVRdWVyeUNvbnRyb2xsZXIiLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJlIiwiY29kZSIsIkVycm9yIiwiRFVQTElDQVRFX1ZBTFVFIiwibG9hZCIsInN0YXJ0dXBQcm9taXNlcyIsIkRlZmluZWRTY2hlbWFzIiwiZXhlY3V0ZSIsImNvbm5lY3QiLCJQcm9taXNlIiwiYWxsIiwicmVzb2x2ZSIsIl9qc29uIiwianNvbiIsInByb2Nlc3MiLCJlbnYiLCJucG1fcGFja2FnZV9qc29uIiwibnBtX3BhY2thZ2VfdHlwZSIsInR5cGUiLCJjd2QiLCJzZXRUaW1lb3V0IiwiZW5hYmxlQ2hlY2siLCJlbmFibGVDaGVja0xvZyIsIkNoZWNrUnVubmVyIiwicnVuIiwiZXJyb3IiLCJjb25zb2xlIiwiYXBwIiwiX2FwcCIsImhhbmRsZVNodXRkb3duIiwiX3RoaXMkbGl2ZVF1ZXJ5U2VydmVyIiwiX3RoaXMkbGl2ZVF1ZXJ5U2VydmVyMiIsInByb21pc2VzIiwiYWRhcHRlciIsImRhdGFiYXNlQWRhcHRlciIsImZpbGVBZGFwdGVyIiwiZmlsZXNDb250cm9sbGVyIiwiY2FjaGVDb250cm9sbGVyIiwibGl2ZVF1ZXJ5U2VydmVyIiwic2VydmVyIiwiY2xvc2UiLCJzaHV0ZG93biIsInRoZW4iLCJzZXJ2ZXJDbG9zZUNvbXBsZXRlIiwiYXBwbHlSZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUiLCJhcGkiLCJyZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUiLCJ1c2UiLCJtYXhVcGxvYWRTaXplIiwiZGlyZWN0QWNjZXNzIiwicGFnZXMiLCJyYXRlTGltaXQiLCJhbGxvd0Nyb3NzRG9tYWluIiwiRmlsZXNSb3V0ZXIiLCJleHByZXNzUm91dGVyIiwicmVxIiwic3RhdHVzIiwidXJsZW5jb2RlZCIsImV4dGVuZGVkIiwiZW5hYmxlUm91dGVyIiwiUGFnZXNSb3V0ZXIiLCJQdWJsaWNBUElSb3V0ZXIiLCJsaW1pdCIsImFsbG93TWV0aG9kT3ZlcnJpZGUiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJyb3V0ZXMiLCJBcnJheSIsImlzQXJyYXkiLCJyb3V0ZSIsImFkZFJhdGVMaW1pdCIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsImFwcFJvdXRlciIsInByb21pc2VSb3V0ZXIiLCJoYW5kbGVQYXJzZUVycm9ycyIsIlRFU1RJTkciLCJvbiIsImVyciIsInN0ZGVyciIsIndyaXRlIiwicG9ydCIsImV4aXQiLCJQQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTIiwiQ29yZU1hbmFnZXIiLCJzZXRSRVNUQ29udHJvbGxlciIsIlBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIiLCJyb3V0ZXJzIiwiQ2xhc3Nlc1JvdXRlciIsIlVzZXJzUm91dGVyIiwiU2Vzc2lvbnNSb3V0ZXIiLCJSb2xlc1JvdXRlciIsIkFuYWx5dGljc1JvdXRlciIsIkluc3RhbGxhdGlvbnNSb3V0ZXIiLCJGdW5jdGlvbnNSb3V0ZXIiLCJTY2hlbWFzUm91dGVyIiwiUHVzaFJvdXRlciIsIkxvZ3NSb3V0ZXIiLCJJQVBWYWxpZGF0aW9uUm91dGVyIiwiRmVhdHVyZXNSb3V0ZXIiLCJHbG9iYWxDb25maWdSb3V0ZXIiLCJHcmFwaFFMUm91dGVyIiwiUHVyZ2VSb3V0ZXIiLCJIb29rc1JvdXRlciIsIkNsb3VkQ29kZVJvdXRlciIsIkF1ZGllbmNlc1JvdXRlciIsIkFnZ3JlZ2F0ZVJvdXRlciIsIlNlY3VyaXR5Um91dGVyIiwicmVkdWNlIiwibWVtbyIsInJvdXRlciIsImNvbmNhdCIsIlByb21pc2VSb3V0ZXIiLCJtb3VudE9udG8iLCJzdGFydEFwcCIsIm1pZGRsZXdhcmUiLCJtb3VudFBhdGgiLCJtb3VudEdyYXBoUUwiLCJtb3VudFBsYXlncm91bmQiLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJncmFwaFFMU2NoZW1hIiwicmVhZEZpbGVTeW5jIiwicGFyc2VHcmFwaFFMU2VydmVyIiwiUGFyc2VHcmFwaFFMU2VydmVyIiwiZ3JhcGhRTFBhdGgiLCJwbGF5Z3JvdW5kUGF0aCIsImFwcGx5R3JhcGhRTCIsImFwcGx5UGxheWdyb3VuZCIsImxpc3RlbiIsImhvc3QiLCJzdGFydExpdmVRdWVyeVNlcnZlciIsImxpdmVRdWVyeVNlcnZlck9wdGlvbnMiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJ0cnVzdFByb3h5IiwiY29uZmlndXJlTGlzdGVuZXJzIiwiZXhwcmVzc0FwcCIsInBhcnNlU2VydmVyIiwiaHR0cFNlcnZlciIsImNyZWF0ZVNlcnZlciIsIlBhcnNlTGl2ZVF1ZXJ5U2VydmVyIiwidmVyaWZ5U2VydmVyVXJsIiwiX3Jlc3BvbnNlJGhlYWRlcnMiLCJpc1ZhbGlkSHR0cFVybCIsInN0cmluZyIsInVybCIsIlVSTCIsIl8iLCJwcm90b2NvbCIsInJlcGxhY2UiLCJ3YXJuIiwicmVxdWVzdCIsInJlc3BvbnNlIiwiY2F0Y2giLCJkYXRhIiwicmV0cnkiLCJoZWFkZXJzIiwiUGFyc2VDbG91ZCIsImNvbmYiLCJhcHBsaWNhdGlvbklkIiwibmV3VmFsIiwiQ2xvdWQiLCJnbG9iYWwiLCJkZWZhdWx0cyIsInJlZ2V4IiwibWF0Y2giLCJ1c2VyU2Vuc2l0aXZlRmllbGRzIiwiZnJvbSIsIlNldCIsInByb3RlY3RlZEZpZWxkcyIsIl9Vc2VyIiwiYyIsImN1ciIsInIiLCJ1bnEiLCJzb2NrZXRzIiwic29ja2V0Iiwic29ja2V0SWQiLCJyZW1vdGVBZGRyZXNzIiwicmVtb3RlUG9ydCIsImRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zIiwiZGVzdHJveSIsInN0ZG91dCIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBQYXJzZVNlcnZlciAtIG9wZW4tc291cmNlIGNvbXBhdGlibGUgQVBJIFNlcnZlciBmb3IgUGFyc2UgYXBwc1xuXG52YXIgYmF0Y2ggPSByZXF1aXJlKCcuL2JhdGNoJyksXG4gIGJvZHlQYXJzZXIgPSByZXF1aXJlKCdib2R5LXBhcnNlcicpLFxuICBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpLFxuICBtaWRkbGV3YXJlcyA9IHJlcXVpcmUoJy4vbWlkZGxld2FyZXMnKSxcbiAgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2UsXG4gIHsgcGFyc2UgfSA9IHJlcXVpcmUoJ2dyYXBocWwnKSxcbiAgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKSxcbiAgZnMgPSByZXF1aXJlKCdmcycpO1xuXG5pbXBvcnQgeyBQYXJzZVNlcnZlck9wdGlvbnMsIExpdmVRdWVyeVNlcnZlck9wdGlvbnMgfSBmcm9tICcuL09wdGlvbnMnO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4vZGVmYXVsdHMnO1xuaW1wb3J0ICogYXMgbG9nZ2luZyBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4vQ29uZmlnJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgeyBBbmFseXRpY3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQW5hbHl0aWNzUm91dGVyJztcbmltcG9ydCB7IENsYXNzZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgeyBGZWF0dXJlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GZWF0dXJlc1JvdXRlcic7XG5pbXBvcnQgeyBGaWxlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GaWxlc1JvdXRlcic7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRnVuY3Rpb25zUm91dGVyJztcbmltcG9ydCB7IEdsb2JhbENvbmZpZ1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9HbG9iYWxDb25maWdSb3V0ZXInO1xuaW1wb3J0IHsgR3JhcGhRTFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9HcmFwaFFMUm91dGVyJztcbmltcG9ydCB7IEhvb2tzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0hvb2tzUm91dGVyJztcbmltcG9ydCB7IElBUFZhbGlkYXRpb25Sb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSUFQVmFsaWRhdGlvblJvdXRlcic7XG5pbXBvcnQgeyBJbnN0YWxsYXRpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0luc3RhbGxhdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgTG9nc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Mb2dzUm91dGVyJztcbmltcG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH0gZnJvbSAnLi9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXInO1xuaW1wb3J0IHsgUGFnZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUGFnZXNSb3V0ZXInO1xuaW1wb3J0IHsgUHVibGljQVBJUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1YmxpY0FQSVJvdXRlcic7XG5pbXBvcnQgeyBQdXNoUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1c2hSb3V0ZXInO1xuaW1wb3J0IHsgQ2xvdWRDb2RlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0Nsb3VkQ29kZVJvdXRlcic7XG5pbXBvcnQgeyBSb2xlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Sb2xlc1JvdXRlcic7XG5pbXBvcnQgeyBTY2hlbWFzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1NjaGVtYXNSb3V0ZXInO1xuaW1wb3J0IHsgU2Vzc2lvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2Vzc2lvbnNSb3V0ZXInO1xuaW1wb3J0IHsgVXNlcnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0IHsgUHVyZ2VSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVyZ2VSb3V0ZXInO1xuaW1wb3J0IHsgQXVkaWVuY2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0F1ZGllbmNlc1JvdXRlcic7XG5pbXBvcnQgeyBBZ2dyZWdhdGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQWdncmVnYXRlUm91dGVyJztcbmltcG9ydCB7IFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIgfSBmcm9tICcuL1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXInO1xuaW1wb3J0ICogYXMgY29udHJvbGxlcnMgZnJvbSAnLi9Db250cm9sbGVycyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxTZXJ2ZXIgfSBmcm9tICcuL0dyYXBoUUwvUGFyc2VHcmFwaFFMU2VydmVyJztcbmltcG9ydCB7IFNlY3VyaXR5Um91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1NlY3VyaXR5Um91dGVyJztcbmltcG9ydCBDaGVja1J1bm5lciBmcm9tICcuL1NlY3VyaXR5L0NoZWNrUnVubmVyJztcbmltcG9ydCBEZXByZWNhdG9yIGZyb20gJy4vRGVwcmVjYXRvci9EZXByZWNhdG9yJztcbmltcG9ydCB7IERlZmluZWRTY2hlbWFzIH0gZnJvbSAnLi9TY2hlbWFNaWdyYXRpb25zL0RlZmluZWRTY2hlbWFzJztcblxuLy8gTXV0YXRlIHRoZSBQYXJzZSBvYmplY3QgdG8gYWRkIHRoZSBDbG91ZCBDb2RlIGhhbmRsZXJzXG5hZGRQYXJzZUNsb3VkKCk7XG5cbi8vIFBhcnNlU2VydmVyIHdvcmtzIGxpa2UgYSBjb25zdHJ1Y3RvciBvZiBhbiBleHByZXNzIGFwcC5cbi8vIGh0dHBzOi8vcGFyc2VwbGF0Zm9ybS5vcmcvcGFyc2Utc2VydmVyL2FwaS9tYXN0ZXIvUGFyc2VTZXJ2ZXJPcHRpb25zLmh0bWxcbmNsYXNzIFBhcnNlU2VydmVyIHtcbiAgLyoqXG4gICAqIEBjb25zdHJ1Y3RvclxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB0aGUgcGFyc2Ugc2VydmVyIGluaXRpYWxpemF0aW9uIG9wdGlvbnNcbiAgICovXG4gIGNvbnN0cnVjdG9yKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIC8vIFNjYW4gZm9yIGRlcHJlY2F0ZWQgUGFyc2UgU2VydmVyIG9wdGlvbnNcbiAgICBEZXByZWNhdG9yLnNjYW5QYXJzZVNlcnZlck9wdGlvbnMob3B0aW9ucyk7XG4gICAgLy8gU2V0IG9wdGlvbiBkZWZhdWx0c1xuICAgIGluamVjdERlZmF1bHRzKG9wdGlvbnMpO1xuICAgIGNvbnN0IHtcbiAgICAgIGFwcElkID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYW4gYXBwSWQhJyksXG4gICAgICBtYXN0ZXJLZXkgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIG1hc3RlcktleSEnKSxcbiAgICAgIGphdmFzY3JpcHRLZXksXG4gICAgICBzZXJ2ZXJVUkwgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIHNlcnZlclVSTCEnKSxcbiAgICB9ID0gb3B0aW9ucztcbiAgICAvLyBJbml0aWFsaXplIHRoZSBub2RlIGNsaWVudCBTREsgYXV0b21hdGljYWxseVxuICAgIFBhcnNlLmluaXRpYWxpemUoYXBwSWQsIGphdmFzY3JpcHRLZXkgfHwgJ3VudXNlZCcsIG1hc3RlcktleSk7XG4gICAgUGFyc2Uuc2VydmVyVVJMID0gc2VydmVyVVJMO1xuXG4gICAgQ29uZmlnLnZhbGlkYXRlT3B0aW9ucyhvcHRpb25zKTtcbiAgICBjb25zdCBhbGxDb250cm9sbGVycyA9IGNvbnRyb2xsZXJzLmdldENvbnRyb2xsZXJzKG9wdGlvbnMpO1xuICAgIG9wdGlvbnMuc3RhdGUgPSAnaW5pdGlhbGl6ZWQnO1xuICAgIHRoaXMuY29uZmlnID0gQ29uZmlnLnB1dChPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCBhbGxDb250cm9sbGVycykpO1xuICAgIHRoaXMuY29uZmlnLm1hc3RlcktleUlwc1N0b3JlID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuY29uZmlnLm1haW50ZW5hbmNlS2V5SXBzU3RvcmUgPSBuZXcgTWFwKCk7XG4gICAgbG9nZ2luZy5zZXRMb2dnZXIoYWxsQ29udHJvbGxlcnMubG9nZ2VyQ29udHJvbGxlcik7XG4gIH1cblxuICAvKipcbiAgICogU3RhcnRzIFBhcnNlIFNlcnZlciBhcyBhbiBleHByZXNzIGFwcDsgdGhpcyBwcm9taXNlIHJlc29sdmVzIHdoZW4gUGFyc2UgU2VydmVyIGlzIHJlYWR5IHRvIGFjY2VwdCByZXF1ZXN0cy5cbiAgICovXG5cbiAgYXN5bmMgc3RhcnQoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5zdGF0ZSA9PT0gJ29rJykge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cbiAgICAgIHRoaXMuY29uZmlnLnN0YXRlID0gJ3N0YXJ0aW5nJztcbiAgICAgIENvbmZpZy5wdXQodGhpcy5jb25maWcpO1xuICAgICAgY29uc3Qge1xuICAgICAgICBkYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgICAgIGhvb2tzQ29udHJvbGxlcixcbiAgICAgICAgY2xvdWQsXG4gICAgICAgIHNlY3VyaXR5LFxuICAgICAgICBzY2hlbWEsXG4gICAgICAgIGNhY2hlQWRhcHRlcixcbiAgICAgICAgbGl2ZVF1ZXJ5Q29udHJvbGxlcixcbiAgICAgIH0gPSB0aGlzLmNvbmZpZztcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGRhdGFiYXNlQ29udHJvbGxlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKGUuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYXdhaXQgaG9va3NDb250cm9sbGVyLmxvYWQoKTtcbiAgICAgIGNvbnN0IHN0YXJ0dXBQcm9taXNlcyA9IFtdO1xuICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICBzdGFydHVwUHJvbWlzZXMucHVzaChuZXcgRGVmaW5lZFNjaGVtYXMoc2NoZW1hLCB0aGlzLmNvbmZpZykuZXhlY3V0ZSgpKTtcbiAgICAgIH1cbiAgICAgIGlmIChjYWNoZUFkYXB0ZXI/LmNvbm5lY3QgJiYgdHlwZW9mIGNhY2hlQWRhcHRlci5jb25uZWN0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHN0YXJ0dXBQcm9taXNlcy5wdXNoKGNhY2hlQWRhcHRlci5jb25uZWN0KCkpO1xuICAgICAgfVxuICAgICAgc3RhcnR1cFByb21pc2VzLnB1c2gobGl2ZVF1ZXJ5Q29udHJvbGxlci5jb25uZWN0KCkpO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoc3RhcnR1cFByb21pc2VzKTtcbiAgICAgIGlmIChjbG91ZCkge1xuICAgICAgICBhZGRQYXJzZUNsb3VkKCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xvdWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUoY2xvdWQoUGFyc2UpKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2xvdWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgbGV0IGpzb247XG4gICAgICAgICAgaWYgKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX2pzb24pIHtcbiAgICAgICAgICAgIGpzb24gPSByZXF1aXJlKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX2pzb24pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocHJvY2Vzcy5lbnYubnBtX3BhY2thZ2VfdHlwZSA9PT0gJ21vZHVsZScgfHwganNvbj8udHlwZSA9PT0gJ21vZHVsZScpIHtcbiAgICAgICAgICAgIGF3YWl0IGltcG9ydChwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgY2xvdWQpKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgY2xvdWQpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgXCJhcmd1bWVudCAnY2xvdWQnIG11c3QgZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgZnVuY3Rpb25cIjtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWN1cml0eSAmJiBzZWN1cml0eS5lbmFibGVDaGVjayAmJiBzZWN1cml0eS5lbmFibGVDaGVja0xvZykge1xuICAgICAgICBuZXcgQ2hlY2tSdW5uZXIoc2VjdXJpdHkpLnJ1bigpO1xuICAgICAgfVxuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnb2snO1xuICAgICAgQ29uZmlnLnB1dCh0aGlzLmNvbmZpZyk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICB0aGlzLmNvbmZpZy5zdGF0ZSA9ICdlcnJvcic7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBnZXQgYXBwKCkge1xuICAgIGlmICghdGhpcy5fYXBwKSB7XG4gICAgICB0aGlzLl9hcHAgPSBQYXJzZVNlcnZlci5hcHAodGhpcy5jb25maWcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fYXBwO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcbiAgICBjb25zdCB7IGFkYXB0ZXI6IGRhdGFiYXNlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuZGF0YWJhc2VDb250cm9sbGVyO1xuICAgIGlmIChkYXRhYmFzZUFkYXB0ZXIgJiYgdHlwZW9mIGRhdGFiYXNlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGNvbnN0IHsgYWRhcHRlcjogZmlsZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlcjtcbiAgICBpZiAoZmlsZUFkYXB0ZXIgJiYgdHlwZW9mIGZpbGVBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGZpbGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGNhY2hlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyO1xuICAgIGlmIChjYWNoZUFkYXB0ZXIgJiYgdHlwZW9mIGNhY2hlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGlmICh0aGlzLmxpdmVRdWVyeVNlcnZlcj8uc2VydmVyPy5jbG9zZSkge1xuICAgICAgcHJvbWlzZXMucHVzaChuZXcgUHJvbWlzZShyZXNvbHZlID0+IHRoaXMubGl2ZVF1ZXJ5U2VydmVyLnNlcnZlci5jbG9zZShyZXNvbHZlKSkpO1xuICAgIH1cbiAgICBpZiAodGhpcy5saXZlUXVlcnlTZXJ2ZXIpIHtcbiAgICAgIHByb21pc2VzLnB1c2godGhpcy5saXZlUXVlcnlTZXJ2ZXIuc2h1dGRvd24oKSk7XG4gICAgfVxuICAgIHJldHVybiAocHJvbWlzZXMubGVuZ3RoID4gMCA/IFByb21pc2UuYWxsKHByb21pc2VzKSA6IFByb21pc2UucmVzb2x2ZSgpKS50aGVuKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5zZXJ2ZXJDbG9zZUNvbXBsZXRlKSB7XG4gICAgICAgIHRoaXMuY29uZmlnLnNlcnZlckNsb3NlQ29tcGxldGUoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3RhdGljXG4gICAqIEFsbG93IGRldmVsb3BlcnMgdG8gY3VzdG9taXplIGVhY2ggcmVxdWVzdCB3aXRoIGludmVyc2lvbiBvZiBjb250cm9sL2RlcGVuZGVuY3kgaW5qZWN0aW9uXG4gICAqL1xuICBzdGF0aWMgYXBwbHlSZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUoYXBpLCBvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMucmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKSB7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMucmVxdWVzdENvbnRleHRNaWRkbGV3YXJlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigncmVxdWVzdENvbnRleHRNaWRkbGV3YXJlIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICAgICAgfVxuICAgICAgYXBpLnVzZShvcHRpb25zLnJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSk7XG4gICAgfVxuICB9XG4gIC8qKlxuICAgKiBAc3RhdGljXG4gICAqIENyZWF0ZSBhbiBleHByZXNzIGFwcCBmb3IgdGhlIHBhcnNlIHNlcnZlclxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBsZXQgeW91IHNwZWNpZnkgdGhlIG1heFVwbG9hZFNpemUgd2hlbiBjcmVhdGluZyB0aGUgZXhwcmVzcyBhcHAgICovXG4gIHN0YXRpYyBhcHAob3B0aW9ucykge1xuICAgIGNvbnN0IHsgbWF4VXBsb2FkU2l6ZSA9ICcyMG1iJywgYXBwSWQsIGRpcmVjdEFjY2VzcywgcGFnZXMsIHJhdGVMaW1pdCA9IFtdIH0gPSBvcHRpb25zO1xuICAgIC8vIFRoaXMgYXBwIHNlcnZlcyB0aGUgUGFyc2UgQVBJIGRpcmVjdGx5LlxuICAgIC8vIEl0J3MgdGhlIGVxdWl2YWxlbnQgb2YgaHR0cHM6Ly9hcGkucGFyc2UuY29tLzEgaW4gdGhlIGhvc3RlZCBQYXJzZSBBUEkuXG4gICAgdmFyIGFwaSA9IGV4cHJlc3MoKTtcbiAgICAvL2FwaS51c2UoXCIvYXBwc1wiLCBleHByZXNzLnN0YXRpYyhfX2Rpcm5hbWUgKyBcIi9wdWJsaWNcIikpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dDcm9zc0RvbWFpbihhcHBJZCkpO1xuICAgIC8vIEZpbGUgaGFuZGxpbmcgbmVlZHMgdG8gYmUgYmVmb3JlIGRlZmF1bHQgbWlkZGxld2FyZXMgYXJlIGFwcGxpZWRcbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgbmV3IEZpbGVzUm91dGVyKCkuZXhwcmVzc1JvdXRlcih7XG4gICAgICAgIG1heFVwbG9hZFNpemU6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhcGkudXNlKCcvaGVhbHRoJywgZnVuY3Rpb24gKHJlcSwgcmVzKSB7XG4gICAgICByZXMuc3RhdHVzKG9wdGlvbnMuc3RhdGUgPT09ICdvaycgPyAyMDAgOiA1MDMpO1xuICAgICAgaWYgKG9wdGlvbnMuc3RhdGUgPT09ICdzdGFydGluZycpIHtcbiAgICAgICAgcmVzLnNldCgnUmV0cnktQWZ0ZXInLCAxKTtcbiAgICAgIH1cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgc3RhdHVzOiBvcHRpb25zLnN0YXRlLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgYm9keVBhcnNlci51cmxlbmNvZGVkKHsgZXh0ZW5kZWQ6IGZhbHNlIH0pLFxuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyXG4gICAgICAgID8gbmV3IFBhZ2VzUm91dGVyKHBhZ2VzKS5leHByZXNzUm91dGVyKClcbiAgICAgICAgOiBuZXcgUHVibGljQVBJUm91dGVyKCkuZXhwcmVzc1JvdXRlcigpXG4gICAgKTtcblxuICAgIGFwaS51c2UoYm9keVBhcnNlci5qc29uKHsgdHlwZTogJyovKicsIGxpbWl0OiBtYXhVcGxvYWRTaXplIH0pKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93TWV0aG9kT3ZlcnJpZGUpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzKTtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHJhdGVMaW1pdCkgPyByYXRlTGltaXQgOiBbcmF0ZUxpbWl0XTtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHJvdXRlcykge1xuICAgICAgbWlkZGxld2FyZXMuYWRkUmF0ZUxpbWl0KHJvdXRlLCBvcHRpb25zKTtcbiAgICB9XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZVNlc3Npb24pO1xuICAgIHRoaXMuYXBwbHlSZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUoYXBpLCBvcHRpb25zKTtcbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBQYXJzZVNlcnZlci5wcm9taXNlUm91dGVyKHsgYXBwSWQgfSk7XG4gICAgYXBpLnVzZShhcHBSb3V0ZXIuZXhwcmVzc1JvdXRlcigpKTtcblxuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VFcnJvcnMpO1xuXG4gICAgLy8gcnVuIHRoZSBmb2xsb3dpbmcgd2hlbiBub3QgdGVzdGluZ1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgLy9UaGlzIGNhdXNlcyB0ZXN0cyB0byBzcGV3IHNvbWUgdXNlbGVzcyB3YXJuaW5ncywgc28gZGlzYWJsZSBpbiB0ZXN0XG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgcHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09ICdFQUREUklOVVNFJykge1xuICAgICAgICAgIC8vIHVzZXItZnJpZW5kbHkgbWVzc2FnZSBmb3IgdGhpcyBjb21tb24gZXJyb3JcbiAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZShgVW5hYmxlIHRvIGxpc3RlbiBvbiBwb3J0ICR7ZXJyLnBvcnR9LiBUaGUgcG9ydCBpcyBhbHJlYWR5IGluIHVzZS5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIC8vIHZlcmlmeSB0aGUgc2VydmVyIHVybCBhZnRlciBhICdtb3VudCcgZXZlbnQgaXMgcmVjZWl2ZWRcbiAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgICAvLyBhcGkub24oJ21vdW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgLy8gICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwMCkpO1xuICAgICAgLy8gICBQYXJzZVNlcnZlci52ZXJpZnlTZXJ2ZXJVcmwoKTtcbiAgICAgIC8vIH0pO1xuICAgIH1cbiAgICBpZiAocHJvY2Vzcy5lbnYuUEFSU0VfU0VSVkVSX0VOQUJMRV9FWFBFUklNRU5UQUxfRElSRUNUX0FDQ0VTUyA9PT0gJzEnIHx8IGRpcmVjdEFjY2Vzcykge1xuICAgICAgUGFyc2UuQ29yZU1hbmFnZXIuc2V0UkVTVENvbnRyb2xsZXIoUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcihhcHBJZCwgYXBwUm91dGVyKSk7XG4gICAgfVxuICAgIHJldHVybiBhcGk7XG4gIH1cblxuICBzdGF0aWMgcHJvbWlzZVJvdXRlcih7IGFwcElkIH0pIHtcbiAgICBjb25zdCByb3V0ZXJzID0gW1xuICAgICAgbmV3IENsYXNzZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBVc2Vyc1JvdXRlcigpLFxuICAgICAgbmV3IFNlc3Npb25zUm91dGVyKCksXG4gICAgICBuZXcgUm9sZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBbmFseXRpY3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJbnN0YWxsYXRpb25zUm91dGVyKCksXG4gICAgICBuZXcgRnVuY3Rpb25zUm91dGVyKCksXG4gICAgICBuZXcgU2NoZW1hc1JvdXRlcigpLFxuICAgICAgbmV3IFB1c2hSb3V0ZXIoKSxcbiAgICAgIG5ldyBMb2dzUm91dGVyKCksXG4gICAgICBuZXcgSUFQVmFsaWRhdGlvblJvdXRlcigpLFxuICAgICAgbmV3IEZlYXR1cmVzUm91dGVyKCksXG4gICAgICBuZXcgR2xvYmFsQ29uZmlnUm91dGVyKCksXG4gICAgICBuZXcgR3JhcGhRTFJvdXRlcigpLFxuICAgICAgbmV3IFB1cmdlUm91dGVyKCksXG4gICAgICBuZXcgSG9va3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBDbG91ZENvZGVSb3V0ZXIoKSxcbiAgICAgIG5ldyBBdWRpZW5jZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBZ2dyZWdhdGVSb3V0ZXIoKSxcbiAgICAgIG5ldyBTZWN1cml0eVJvdXRlcigpLFxuICAgIF07XG5cbiAgICBjb25zdCByb3V0ZXMgPSByb3V0ZXJzLnJlZHVjZSgobWVtbywgcm91dGVyKSA9PiB7XG4gICAgICByZXR1cm4gbWVtby5jb25jYXQocm91dGVyLnJvdXRlcyk7XG4gICAgfSwgW10pO1xuXG4gICAgY29uc3QgYXBwUm91dGVyID0gbmV3IFByb21pc2VSb3V0ZXIocm91dGVzLCBhcHBJZCk7XG5cbiAgICBiYXRjaC5tb3VudE9udG8oYXBwUm91dGVyKTtcbiAgICByZXR1cm4gYXBwUm91dGVyO1xuICB9XG5cbiAgLyoqXG4gICAqIHN0YXJ0cyB0aGUgcGFyc2Ugc2VydmVyJ3MgZXhwcmVzcyBhcHBcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdG8gdXNlIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuXG4gIGFzeW5jIHN0YXJ0QXBwKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLnN0YXJ0KCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igb24gUGFyc2VTZXJ2ZXIuc3RhcnRBcHA6ICcsIGUpO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gICAgY29uc3QgYXBwID0gZXhwcmVzcygpO1xuICAgIGlmIChvcHRpb25zLm1pZGRsZXdhcmUpIHtcbiAgICAgIGxldCBtaWRkbGV3YXJlO1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLm1pZGRsZXdhcmUgPT0gJ3N0cmluZycpIHtcbiAgICAgICAgbWlkZGxld2FyZSA9IHJlcXVpcmUocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIG9wdGlvbnMubWlkZGxld2FyZSkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWlkZGxld2FyZSA9IG9wdGlvbnMubWlkZGxld2FyZTsgLy8gdXNlIGFzLWlzIGxldCBleHByZXNzIGZhaWxcbiAgICAgIH1cbiAgICAgIGFwcC51c2UobWlkZGxld2FyZSk7XG4gICAgfVxuICAgIGFwcC51c2Uob3B0aW9ucy5tb3VudFBhdGgsIHRoaXMuYXBwKTtcblxuICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCA9PT0gdHJ1ZSB8fCBvcHRpb25zLm1vdW50UGxheWdyb3VuZCA9PT0gdHJ1ZSkge1xuICAgICAgbGV0IGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHVuZGVmaW5lZDtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnc3RyaW5nJykge1xuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSBwYXJzZShmcy5yZWFkRmlsZVN5bmMob3B0aW9ucy5ncmFwaFFMU2NoZW1hLCAndXRmOCcpKTtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdvYmplY3QnIHx8XG4gICAgICAgIHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSBvcHRpb25zLmdyYXBoUUxTY2hlbWE7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHBhcnNlR3JhcGhRTFNlcnZlciA9IG5ldyBQYXJzZUdyYXBoUUxTZXJ2ZXIodGhpcywge1xuICAgICAgICBncmFwaFFMUGF0aDogb3B0aW9ucy5ncmFwaFFMUGF0aCxcbiAgICAgICAgcGxheWdyb3VuZFBhdGg6IG9wdGlvbnMucGxheWdyb3VuZFBhdGgsXG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2VydmVyLmFwcGx5R3JhcGhRTChhcHApO1xuICAgICAgfVxuXG4gICAgICBpZiAob3B0aW9ucy5tb3VudFBsYXlncm91bmQpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2VydmVyLmFwcGx5UGxheWdyb3VuZChhcHApO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzZXJ2ZXIgPSBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIGFwcC5saXN0ZW4ob3B0aW9ucy5wb3J0LCBvcHRpb25zLmhvc3QsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmVzb2x2ZSh0aGlzKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuXG4gICAgaWYgKG9wdGlvbnMuc3RhcnRMaXZlUXVlcnlTZXJ2ZXIgfHwgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zKSB7XG4gICAgICB0aGlzLmxpdmVRdWVyeVNlcnZlciA9IGF3YWl0IFBhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICAgICAgc2VydmVyLFxuICAgICAgICBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnMsXG4gICAgICAgIG9wdGlvbnNcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChvcHRpb25zLnRydXN0UHJveHkpIHtcbiAgICAgIGFwcC5zZXQoJ3RydXN0IHByb3h5Jywgb3B0aW9ucy50cnVzdFByb3h5KTtcbiAgICB9XG4gICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICBpZiAoIXByb2Nlc3MuZW52LlRFU1RJTkcpIHtcbiAgICAgIGNvbmZpZ3VyZUxpc3RlbmVycyh0aGlzKTtcbiAgICB9XG4gICAgdGhpcy5leHByZXNzQXBwID0gYXBwO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBuZXcgUGFyc2VTZXJ2ZXIgYW5kIHN0YXJ0cyBpdC5cbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdXNlZCB0byBzdGFydCB0aGUgc2VydmVyXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIGFzeW5jIHN0YXJ0QXBwKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIGNvbnN0IHBhcnNlU2VydmVyID0gbmV3IFBhcnNlU2VydmVyKG9wdGlvbnMpO1xuICAgIHJldHVybiBwYXJzZVNlcnZlci5zdGFydEFwcChvcHRpb25zKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIZWxwZXIgbWV0aG9kIHRvIGNyZWF0ZSBhIGxpdmVRdWVyeSBzZXJ2ZXJcbiAgICogQHN0YXRpY1xuICAgKiBAcGFyYW0ge1NlcnZlcn0gaHR0cFNlcnZlciBhbiBvcHRpb25hbCBodHRwIHNlcnZlciB0byBwYXNzXG4gICAqIEBwYXJhbSB7TGl2ZVF1ZXJ5U2VydmVyT3B0aW9uc30gY29uZmlnIG9wdGlvbnMgZm9yIHRoZSBsaXZlUXVlcnlTZXJ2ZXJcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgb3B0aW9ucyBmb3IgdGhlIFBhcnNlU2VydmVyXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFBhcnNlTGl2ZVF1ZXJ5U2VydmVyPn0gdGhlIGxpdmUgcXVlcnkgc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyKFxuICAgIGh0dHBTZXJ2ZXIsXG4gICAgY29uZmlnOiBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zLFxuICAgIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9uc1xuICApIHtcbiAgICBpZiAoIWh0dHBTZXJ2ZXIgfHwgKGNvbmZpZyAmJiBjb25maWcucG9ydCkpIHtcbiAgICAgIHZhciBhcHAgPSBleHByZXNzKCk7XG4gICAgICBodHRwU2VydmVyID0gcmVxdWlyZSgnaHR0cCcpLmNyZWF0ZVNlcnZlcihhcHApO1xuICAgICAgaHR0cFNlcnZlci5saXN0ZW4oY29uZmlnLnBvcnQpO1xuICAgIH1cbiAgICBjb25zdCBzZXJ2ZXIgPSBuZXcgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIoaHR0cFNlcnZlciwgY29uZmlnLCBvcHRpb25zKTtcbiAgICBhd2FpdCBzZXJ2ZXIuY29ubmVjdCgpO1xuICAgIHJldHVybiBzZXJ2ZXI7XG4gIH1cblxuICBzdGF0aWMgYXN5bmMgdmVyaWZ5U2VydmVyVXJsKCkge1xuICAgIC8vIHBlcmZvcm0gYSBoZWFsdGggY2hlY2sgb24gdGhlIHNlcnZlclVSTCB2YWx1ZVxuICAgIGlmIChQYXJzZS5zZXJ2ZXJVUkwpIHtcbiAgICAgIGNvbnN0IGlzVmFsaWRIdHRwVXJsID0gc3RyaW5nID0+IHtcbiAgICAgICAgbGV0IHVybDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICB1cmwgPSBuZXcgVVJMKHN0cmluZyk7XG4gICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVybC5wcm90b2NvbCA9PT0gJ2h0dHA6JyB8fCB1cmwucHJvdG9jb2wgPT09ICdodHRwczonO1xuICAgICAgfTtcbiAgICAgIGNvbnN0IHVybCA9IGAke1BhcnNlLnNlcnZlclVSTC5yZXBsYWNlKC9cXC8kLywgJycpfS9oZWFsdGhgO1xuICAgICAgaWYgKCFpc1ZhbGlkSHR0cFVybCh1cmwpKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICBgXFxuV0FSTklORywgVW5hYmxlIHRvIGNvbm5lY3QgdG8gJyR7UGFyc2Uuc2VydmVyVVJMfScgYXMgdGhlIFVSTCBpcyBpbnZhbGlkLmAgK1xuICAgICAgICAgICAgYCBDbG91ZCBjb2RlIGFuZCBwdXNoIG5vdGlmaWNhdGlvbnMgbWF5IGJlIHVuYXZhaWxhYmxlIVxcbmBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVxdWVzdCA9IHJlcXVpcmUoJy4vcmVxdWVzdCcpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0KHsgdXJsIH0pLmNhdGNoKHJlc3BvbnNlID0+IHJlc3BvbnNlKTtcbiAgICAgIGNvbnN0IGpzb24gPSByZXNwb25zZS5kYXRhIHx8IG51bGw7XG4gICAgICBjb25zdCByZXRyeSA9IHJlc3BvbnNlLmhlYWRlcnM/LlsncmV0cnktYWZ0ZXInXTtcbiAgICAgIGlmIChyZXRyeSkge1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgcmV0cnkgKiAxMDAwKSk7XG4gICAgICAgIHJldHVybiB0aGlzLnZlcmlmeVNlcnZlclVybCgpO1xuICAgICAgfVxuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwIHx8IGpzb24/LnN0YXR1cyAhPT0gJ29rJykge1xuICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICBgXFxuV0FSTklORywgVW5hYmxlIHRvIGNvbm5lY3QgdG8gJyR7UGFyc2Uuc2VydmVyVVJMfScuYCArXG4gICAgICAgICAgICBgIENsb3VkIGNvZGUgYW5kIHB1c2ggbm90aWZpY2F0aW9ucyBtYXkgYmUgdW5hdmFpbGFibGUhXFxuYFxuICAgICAgICApO1xuICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZFBhcnNlQ2xvdWQoKSB7XG4gIGNvbnN0IFBhcnNlQ2xvdWQgPSByZXF1aXJlKCcuL2Nsb3VkLWNvZGUvUGFyc2UuQ2xvdWQnKTtcbiAgY29uc3QgUGFyc2VTZXJ2ZXIgPSByZXF1aXJlKCcuL2Nsb3VkLWNvZGUvUGFyc2UuU2VydmVyJyk7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShQYXJzZSwgJ1NlcnZlcicsIHtcbiAgICBnZXQoKSB7XG4gICAgICBjb25zdCBjb25mID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgIHJldHVybiB7IC4uLmNvbmYsIC4uLlBhcnNlU2VydmVyIH07XG4gICAgfSxcbiAgICBzZXQobmV3VmFsKSB7XG4gICAgICBuZXdWYWwuYXBwSWQgPSBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICAgICAgQ29uZmlnLnB1dChuZXdWYWwpO1xuICAgIH0sXG4gICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICB9KTtcbiAgT2JqZWN0LmFzc2lnbihQYXJzZS5DbG91ZCwgUGFyc2VDbG91ZCk7XG4gIGdsb2JhbC5QYXJzZSA9IFBhcnNlO1xufVxuXG5mdW5jdGlvbiBpbmplY3REZWZhdWx0cyhvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvcHRpb25zLCBrZXkpKSB7XG4gICAgICBvcHRpb25zW2tleV0gPSBkZWZhdWx0c1trZXldO1xuICAgIH1cbiAgfSk7XG5cbiAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywgJ3NlcnZlclVSTCcpKSB7XG4gICAgb3B0aW9ucy5zZXJ2ZXJVUkwgPSBgaHR0cDovL2xvY2FsaG9zdDoke29wdGlvbnMucG9ydH0ke29wdGlvbnMubW91bnRQYXRofWA7XG4gIH1cblxuICAvLyBSZXNlcnZlZCBDaGFyYWN0ZXJzXG4gIGlmIChvcHRpb25zLmFwcElkKSB7XG4gICAgY29uc3QgcmVnZXggPSAvWyEjJCUnKCkqKyYvOjs9P0BbXFxde31eLHw8Pl0vZztcbiAgICBpZiAob3B0aW9ucy5hcHBJZC5tYXRjaChyZWdleCkpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbldBUk5JTkcsIGFwcElkIHRoYXQgY29udGFpbnMgc3BlY2lhbCBjaGFyYWN0ZXJzIGNhbiBjYXVzZSBpc3N1ZXMgd2hpbGUgdXNpbmcgd2l0aCB1cmxzLlxcbmBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gQmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbiAgaWYgKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcykge1xuICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAhcHJvY2Vzcy5lbnYuVEVTVElORyAmJlxuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuREVQUkVDQVRFRDogdXNlclNlbnNpdGl2ZUZpZWxkcyBoYXMgYmVlbiByZXBsYWNlZCBieSBwcm90ZWN0ZWRGaWVsZHMgYWxsb3dpbmcgdGhlIGFiaWxpdHkgdG8gcHJvdGVjdCBmaWVsZHMgaW4gYWxsIGNsYXNzZXMgd2l0aCBDTFAuIFxcbmBcbiAgICAgICk7XG4gICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG5cbiAgICBjb25zdCB1c2VyU2Vuc2l0aXZlRmllbGRzID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoWy4uLihkZWZhdWx0cy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKSwgLi4uKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcyB8fCBbXSldKVxuICAgICk7XG5cbiAgICAvLyBJZiB0aGUgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgaXMgdW5zZXQsXG4gICAgLy8gaXQnbGwgYmUgYXNzaWduZWQgdGhlIGRlZmF1bHQgYWJvdmUuXG4gICAgLy8gSGVyZSwgcHJvdGVjdCBhZ2FpbnN0IHRoZSBjYXNlIHdoZXJlIHByb3RlY3RlZEZpZWxkc1xuICAgIC8vIGlzIHNldCwgYnV0IGRvZXNuJ3QgaGF2ZSBfVXNlci5cbiAgICBpZiAoISgnX1VzZXInIGluIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgPSBPYmplY3QuYXNzaWduKHsgX1VzZXI6IFtdIH0sIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzKTtcbiAgICB9XG5cbiAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoWy4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddIHx8IFtdKSwgLi4udXNlclNlbnNpdGl2ZUZpZWxkc10pXG4gICAgKTtcbiAgfVxuXG4gIC8vIE1lcmdlIHByb3RlY3RlZEZpZWxkcyBvcHRpb25zIHdpdGggZGVmYXVsdHMuXG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkcykuZm9yRWFjaChjID0+IHtcbiAgICBjb25zdCBjdXIgPSBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICBpZiAoIWN1cikge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY10gPSBkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgfSBlbHNlIHtcbiAgICAgIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXSkuZm9yRWFjaChyID0+IHtcbiAgICAgICAgY29uc3QgdW5xID0gbmV3IFNldChbXG4gICAgICAgICAgLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdIHx8IFtdKSxcbiAgICAgICAgICAuLi5kZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0sXG4gICAgICAgIF0pO1xuICAgICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSA9IEFycmF5LmZyb20odW5xKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG59XG5cbi8vIFRob3NlIGNhbid0IGJlIHRlc3RlZCBhcyBpdCByZXF1aXJlcyBhIHN1YnByb2Nlc3Ncbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG5mdW5jdGlvbiBjb25maWd1cmVMaXN0ZW5lcnMocGFyc2VTZXJ2ZXIpIHtcbiAgY29uc3Qgc2VydmVyID0gcGFyc2VTZXJ2ZXIuc2VydmVyO1xuICBjb25zdCBzb2NrZXRzID0ge307XG4gIC8qIEN1cnJlbnRseSwgZXhwcmVzcyBkb2Vzbid0IHNodXQgZG93biBpbW1lZGlhdGVseSBhZnRlciByZWNlaXZpbmcgU0lHSU5UL1NJR1RFUk0gaWYgaXQgaGFzIGNsaWVudCBjb25uZWN0aW9ucyB0aGF0IGhhdmVuJ3QgdGltZWQgb3V0LiAoVGhpcyBpcyBhIGtub3duIGlzc3VlIHdpdGggbm9kZSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvMjY0MilcbiAgICBUaGlzIGZ1bmN0aW9uLCBhbG9uZyB3aXRoIGBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpYCwgaW50ZW5kIHRvIGZpeCB0aGlzIGJlaGF2aW9yIHN1Y2ggdGhhdCBwYXJzZSBzZXJ2ZXIgd2lsbCBjbG9zZSBhbGwgb3BlbiBjb25uZWN0aW9ucyBhbmQgaW5pdGlhdGUgdGhlIHNodXRkb3duIHByb2Nlc3MgYXMgc29vbiBhcyBpdCByZWNlaXZlcyBhIFNJR0lOVC9TSUdURVJNIHNpZ25hbC4gKi9cbiAgc2VydmVyLm9uKCdjb25uZWN0aW9uJywgc29ja2V0ID0+IHtcbiAgICBjb25zdCBzb2NrZXRJZCA9IHNvY2tldC5yZW1vdGVBZGRyZXNzICsgJzonICsgc29ja2V0LnJlbW90ZVBvcnQ7XG4gICAgc29ja2V0c1tzb2NrZXRJZF0gPSBzb2NrZXQ7XG4gICAgc29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIGRlbGV0ZSBzb2NrZXRzW3NvY2tldElkXTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgY29uc3QgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgZm9yIChjb25zdCBzb2NrZXRJZCBpbiBzb2NrZXRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzb2NrZXRzW3NvY2tldElkXS5kZXN0cm95KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8qICovXG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGhhbmRsZVNodXRkb3duID0gZnVuY3Rpb24gKCkge1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdUZXJtaW5hdGlvbiBzaWduYWwgcmVjZWl2ZWQuIFNodXR0aW5nIGRvd24uJyk7XG4gICAgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKTtcbiAgICBzZXJ2ZXIuY2xvc2UoKTtcbiAgICBwYXJzZVNlcnZlci5oYW5kbGVTaHV0ZG93bigpO1xuICB9O1xuICBwcm9jZXNzLm9uKCdTSUdURVJNJywgaGFuZGxlU2h1dGRvd24pO1xuICBwcm9jZXNzLm9uKCdTSUdJTlQnLCBoYW5kbGVTaHV0ZG93bik7XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFXQSxJQUFBQSxRQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxTQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxPQUFBLEdBQUFDLHVCQUFBLENBQUFKLE9BQUE7QUFDQSxJQUFBSyxPQUFBLEdBQUFILHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBTSxjQUFBLEdBQUFKLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBTyxrQkFBQSxHQUFBTCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQVEsZ0JBQUEsR0FBQVIsT0FBQTtBQUNBLElBQUFTLGNBQUEsR0FBQVQsT0FBQTtBQUNBLElBQUFVLGVBQUEsR0FBQVYsT0FBQTtBQUNBLElBQUFXLFlBQUEsR0FBQVgsT0FBQTtBQUNBLElBQUFZLGdCQUFB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