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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJiYXRjaCIsInJlcXVpcmUiLCJib2R5UGFyc2VyIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXJzZSIsInBhdGgiLCJmcyIsImFkZFBhcnNlQ2xvdWQiLCJQYXJzZVNlcnZlciIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsIkRlcHJlY2F0b3IiLCJzY2FuUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaW5qZWN0RGVmYXVsdHMiLCJhcHBJZCIsInJlcXVpcmVkUGFyYW1ldGVyIiwibWFzdGVyS2V5IiwiamF2YXNjcmlwdEtleSIsInNlcnZlclVSTCIsImluaXRpYWxpemUiLCJDb25maWciLCJ2YWxpZGF0ZU9wdGlvbnMiLCJhbGxDb250cm9sbGVycyIsImNvbnRyb2xsZXJzIiwiZ2V0Q29udHJvbGxlcnMiLCJzdGF0ZSIsImNvbmZpZyIsInB1dCIsIk9iamVjdCIsImFzc2lnbiIsIm1hc3RlcktleUlwc1N0b3JlIiwiTWFwIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsImxvZ2dpbmciLCJzZXRMb2dnZXIiLCJsb2dnZXJDb250cm9sbGVyIiwic3RhcnQiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJob29rc0NvbnRyb2xsZXIiLCJjbG91ZCIsInNlY3VyaXR5Iiwic2NoZW1hIiwiY2FjaGVBZGFwdGVyIiwibGl2ZVF1ZXJ5Q29udHJvbGxlciIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsImUiLCJjb2RlIiwiRXJyb3IiLCJEVVBMSUNBVEVfVkFMVUUiLCJsb2FkIiwic3RhcnR1cFByb21pc2VzIiwicHVzaCIsIkRlZmluZWRTY2hlbWFzIiwiZXhlY3V0ZSIsImNvbm5lY3QiLCJQcm9taXNlIiwiYWxsIiwicmVzb2x2ZSIsImpzb24iLCJwcm9jZXNzIiwiZW52IiwibnBtX3BhY2thZ2VfanNvbiIsIm5wbV9wYWNrYWdlX3R5cGUiLCJ0eXBlIiwiY3dkIiwic2V0VGltZW91dCIsImVuYWJsZUNoZWNrIiwiZW5hYmxlQ2hlY2tMb2ciLCJDaGVja1J1bm5lciIsInJ1biIsImVycm9yIiwiY29uc29sZSIsImFwcCIsIl9hcHAiLCJoYW5kbGVTaHV0ZG93biIsInByb21pc2VzIiwiYWRhcHRlciIsImRhdGFiYXNlQWRhcHRlciIsImZpbGVBZGFwdGVyIiwiZmlsZXNDb250cm9sbGVyIiwiY2FjaGVDb250cm9sbGVyIiwibGl2ZVF1ZXJ5U2VydmVyIiwic2VydmVyIiwiY2xvc2UiLCJzaHV0ZG93biIsImxlbmd0aCIsInRoZW4iLCJzZXJ2ZXJDbG9zZUNvbXBsZXRlIiwiYXBwbHlSZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUiLCJhcGkiLCJyZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUiLCJ1c2UiLCJtYXhVcGxvYWRTaXplIiwiZGlyZWN0QWNjZXNzIiwicGFnZXMiLCJyYXRlTGltaXQiLCJhbGxvd0Nyb3NzRG9tYWluIiwiRmlsZXNSb3V0ZXIiLCJleHByZXNzUm91dGVyIiwicmVxIiwicmVzIiwic3RhdHVzIiwic2V0IiwidXJsZW5jb2RlZCIsImV4dGVuZGVkIiwiZW5hYmxlUm91dGVyIiwiUGFnZXNSb3V0ZXIiLCJQdWJsaWNBUElSb3V0ZXIiLCJsaW1pdCIsImFsbG93TWV0aG9kT3ZlcnJpZGUiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJyb3V0ZXMiLCJBcnJheSIsImlzQXJyYXkiLCJyb3V0ZSIsImFkZFJhdGVMaW1pdCIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsImFwcFJvdXRlciIsInByb21pc2VSb3V0ZXIiLCJoYW5kbGVQYXJzZUVycm9ycyIsIlRFU1RJTkciLCJvbiIsImVyciIsInN0ZGVyciIsIndyaXRlIiwicG9ydCIsImV4aXQiLCJQQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTIiwiQ29yZU1hbmFnZXIiLCJzZXRSRVNUQ29udHJvbGxlciIsIlBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIiLCJyb3V0ZXJzIiwiQ2xhc3Nlc1JvdXRlciIsIlVzZXJzUm91dGVyIiwiU2Vzc2lvbnNSb3V0ZXIiLCJSb2xlc1JvdXRlciIsIkFuYWx5dGljc1JvdXRlciIsIkluc3RhbGxhdGlvbnNSb3V0ZXIiLCJGdW5jdGlvbnNSb3V0ZXIiLCJTY2hlbWFzUm91dGVyIiwiUHVzaFJvdXRlciIsIkxvZ3NSb3V0ZXIiLCJJQVBWYWxpZGF0aW9uUm91dGVyIiwiRmVhdHVyZXNSb3V0ZXIiLCJHbG9iYWxDb25maWdSb3V0ZXIiLCJHcmFwaFFMUm91dGVyIiwiUHVyZ2VSb3V0ZXIiLCJIb29rc1JvdXRlciIsIkNsb3VkQ29kZVJvdXRlciIsIkF1ZGllbmNlc1JvdXRlciIsIkFnZ3JlZ2F0ZVJvdXRlciIsIlNlY3VyaXR5Um91dGVyIiwicmVkdWNlIiwibWVtbyIsInJvdXRlciIsImNvbmNhdCIsIlByb21pc2VSb3V0ZXIiLCJtb3VudE9udG8iLCJzdGFydEFwcCIsIm1pZGRsZXdhcmUiLCJtb3VudFBhdGgiLCJtb3VudEdyYXBoUUwiLCJtb3VudFBsYXlncm91bmQiLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJ1bmRlZmluZWQiLCJncmFwaFFMU2NoZW1hIiwicmVhZEZpbGVTeW5jIiwicGFyc2VHcmFwaFFMU2VydmVyIiwiUGFyc2VHcmFwaFFMU2VydmVyIiwiZ3JhcGhRTFBhdGgiLCJwbGF5Z3JvdW5kUGF0aCIsImFwcGx5R3JhcGhRTCIsImFwcGx5UGxheWdyb3VuZCIsImxpc3RlbiIsImhvc3QiLCJzdGFydExpdmVRdWVyeVNlcnZlciIsImxpdmVRdWVyeVNlcnZlck9wdGlvbnMiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJ0cnVzdFByb3h5IiwiY29uZmlndXJlTGlzdGVuZXJzIiwiZXhwcmVzc0FwcCIsInBhcnNlU2VydmVyIiwiaHR0cFNlcnZlciIsImNyZWF0ZVNlcnZlciIsIlBhcnNlTGl2ZVF1ZXJ5U2VydmVyIiwidmVyaWZ5U2VydmVyVXJsIiwiaXNWYWxpZEh0dHBVcmwiLCJzdHJpbmciLCJ1cmwiLCJVUkwiLCJfIiwicHJvdG9jb2wiLCJyZXBsYWNlIiwid2FybiIsInJlcXVlc3QiLCJyZXNwb25zZSIsImNhdGNoIiwiZGF0YSIsInJldHJ5IiwiaGVhZGVycyIsIlBhcnNlQ2xvdWQiLCJkZWZpbmVQcm9wZXJ0eSIsImdldCIsImNvbmYiLCJhcHBsaWNhdGlvbklkIiwibmV3VmFsIiwiY29uZmlndXJhYmxlIiwiQ2xvdWQiLCJnbG9iYWwiLCJrZXlzIiwiZGVmYXVsdHMiLCJmb3JFYWNoIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwicmVnZXgiLCJtYXRjaCIsInVzZXJTZW5zaXRpdmVGaWVsZHMiLCJmcm9tIiwiU2V0IiwicHJvdGVjdGVkRmllbGRzIiwiX1VzZXIiLCJjIiwiY3VyIiwiciIsInVucSIsInNvY2tldHMiLCJzb2NrZXQiLCJzb2NrZXRJZCIsInJlbW90ZUFkZHJlc3MiLCJyZW1vdGVQb3J0IiwiZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMiLCJkZXN0cm95Iiwic3Rkb3V0Il0sInNvdXJjZXMiOlsiLi4vc3JjL1BhcnNlU2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIFBhcnNlU2VydmVyIC0gb3Blbi1zb3VyY2UgY29tcGF0aWJsZSBBUEkgU2VydmVyIGZvciBQYXJzZSBhcHBzXG5cbnZhciBiYXRjaCA9IHJlcXVpcmUoJy4vYmF0Y2gnKSxcbiAgYm9keVBhcnNlciA9IHJlcXVpcmUoJ2JvZHktcGFyc2VyJyksXG4gIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyksXG4gIG1pZGRsZXdhcmVzID0gcmVxdWlyZSgnLi9taWRkbGV3YXJlcycpLFxuICBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZSxcbiAgeyBwYXJzZSB9ID0gcmVxdWlyZSgnZ3JhcGhxbCcpLFxuICBwYXRoID0gcmVxdWlyZSgncGF0aCcpLFxuICBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucywgTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi9kZWZhdWx0cyc7XG5pbXBvcnQgKiBhcyBsb2dnaW5nIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi9Db25maWcnO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCB7IEFuYWx5dGljc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BbmFseXRpY3NSb3V0ZXInO1xuaW1wb3J0IHsgQ2xhc3Nlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbGFzc2VzUm91dGVyJztcbmltcG9ydCB7IEZlYXR1cmVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZlYXR1cmVzUm91dGVyJztcbmltcG9ydCB7IEZpbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZpbGVzUm91dGVyJztcbmltcG9ydCB7IEZ1bmN0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgR2xvYmFsQ29uZmlnUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dsb2JhbENvbmZpZ1JvdXRlcic7XG5pbXBvcnQgeyBHcmFwaFFMUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dyYXBoUUxSb3V0ZXInO1xuaW1wb3J0IHsgSG9va3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSG9va3NSb3V0ZXInO1xuaW1wb3J0IHsgSUFQVmFsaWRhdGlvblJvdXRlciB9IGZyb20gJy4vUm91dGVycy9JQVBWYWxpZGF0aW9uUm91dGVyJztcbmltcG9ydCB7IEluc3RhbGxhdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSW5zdGFsbGF0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBMb2dzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0xvZ3NSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfSBmcm9tICcuL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlcic7XG5pbXBvcnQgeyBQYWdlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9QYWdlc1JvdXRlcic7XG5pbXBvcnQgeyBQdWJsaWNBUElSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVibGljQVBJUm91dGVyJztcbmltcG9ydCB7IFB1c2hSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVzaFJvdXRlcic7XG5pbXBvcnQgeyBDbG91ZENvZGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xvdWRDb2RlUm91dGVyJztcbmltcG9ydCB7IFJvbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1JvbGVzUm91dGVyJztcbmltcG9ydCB7IFNjaGVtYXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBTZXNzaW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TZXNzaW9uc1JvdXRlcic7XG5pbXBvcnQgeyBVc2Vyc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgeyBQdXJnZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXJnZVJvdXRlcic7XG5pbXBvcnQgeyBBdWRpZW5jZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQXVkaWVuY2VzUm91dGVyJztcbmltcG9ydCB7IEFnZ3JlZ2F0ZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9BZ2dyZWdhdGVSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciB9IGZyb20gJy4vUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcic7XG5pbXBvcnQgKiBhcyBjb250cm9sbGVycyBmcm9tICcuL0NvbnRyb2xsZXJzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9IGZyb20gJy4vR3JhcGhRTC9QYXJzZUdyYXBoUUxTZXJ2ZXInO1xuaW1wb3J0IHsgU2VjdXJpdHlSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2VjdXJpdHlSb3V0ZXInO1xuaW1wb3J0IENoZWNrUnVubmVyIGZyb20gJy4vU2VjdXJpdHkvQ2hlY2tSdW5uZXInO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuaW1wb3J0IHsgRGVmaW5lZFNjaGVtYXMgfSBmcm9tICcuL1NjaGVtYU1pZ3JhdGlvbnMvRGVmaW5lZFNjaGVtYXMnO1xuXG4vLyBNdXRhdGUgdGhlIFBhcnNlIG9iamVjdCB0byBhZGQgdGhlIENsb3VkIENvZGUgaGFuZGxlcnNcbmFkZFBhcnNlQ2xvdWQoKTtcblxuLy8gUGFyc2VTZXJ2ZXIgd29ya3MgbGlrZSBhIGNvbnN0cnVjdG9yIG9mIGFuIGV4cHJlc3MgYXBwLlxuLy8gaHR0cHM6Ly9wYXJzZXBsYXRmb3JtLm9yZy9wYXJzZS1zZXJ2ZXIvYXBpL21hc3Rlci9QYXJzZVNlcnZlck9wdGlvbnMuaHRtbFxuY2xhc3MgUGFyc2VTZXJ2ZXIge1xuICAvKipcbiAgICogQGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRoZSBwYXJzZSBzZXJ2ZXIgaW5pdGlhbGl6YXRpb24gb3B0aW9uc1xuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgLy8gU2NhbiBmb3IgZGVwcmVjYXRlZCBQYXJzZSBTZXJ2ZXIgb3B0aW9uc1xuICAgIERlcHJlY2F0b3Iuc2NhblBhcnNlU2VydmVyT3B0aW9ucyhvcHRpb25zKTtcbiAgICAvLyBTZXQgb3B0aW9uIGRlZmF1bHRzXG4gICAgaW5qZWN0RGVmYXVsdHMob3B0aW9ucyk7XG4gICAgY29uc3Qge1xuICAgICAgYXBwSWQgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBhcHBJZCEnKSxcbiAgICAgIG1hc3RlcktleSA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbWFzdGVyS2V5IScpLFxuICAgICAgamF2YXNjcmlwdEtleSxcbiAgICAgIHNlcnZlclVSTCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgc2VydmVyVVJMIScpLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIC8vIEluaXRpYWxpemUgdGhlIG5vZGUgY2xpZW50IFNESyBhdXRvbWF0aWNhbGx5XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShhcHBJZCwgamF2YXNjcmlwdEtleSB8fCAndW51c2VkJywgbWFzdGVyS2V5KTtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG5cbiAgICBDb25maWcudmFsaWRhdGVPcHRpb25zKG9wdGlvbnMpO1xuICAgIGNvbnN0IGFsbENvbnRyb2xsZXJzID0gY29udHJvbGxlcnMuZ2V0Q29udHJvbGxlcnMob3B0aW9ucyk7XG4gICAgb3B0aW9ucy5zdGF0ZSA9ICdpbml0aWFsaXplZCc7XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcucHV0KE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIGFsbENvbnRyb2xsZXJzKSk7XG4gICAgdGhpcy5jb25maWcubWFzdGVyS2V5SXBzU3RvcmUgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5jb25maWcubWFpbnRlbmFuY2VLZXlJcHNTdG9yZSA9IG5ldyBNYXAoKTtcbiAgICBsb2dnaW5nLnNldExvZ2dlcihhbGxDb250cm9sbGVycy5sb2dnZXJDb250cm9sbGVyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydHMgUGFyc2UgU2VydmVyIGFzIGFuIGV4cHJlc3MgYXBwOyB0aGlzIHByb21pc2UgcmVzb2x2ZXMgd2hlbiBQYXJzZSBTZXJ2ZXIgaXMgcmVhZHkgdG8gYWNjZXB0IHJlcXVlc3RzLlxuICAgKi9cblxuICBhc3luYyBzdGFydCgpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuY29uZmlnLnN0YXRlID09PSAnb2snKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnc3RhcnRpbmcnO1xuICAgICAgQ29uZmlnLnB1dCh0aGlzLmNvbmZpZyk7XG4gICAgICBjb25zdCB7XG4gICAgICAgIGRhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgICAgaG9va3NDb250cm9sbGVyLFxuICAgICAgICBjbG91ZCxcbiAgICAgICAgc2VjdXJpdHksXG4gICAgICAgIHNjaGVtYSxcbiAgICAgICAgY2FjaGVBZGFwdGVyLFxuICAgICAgICBsaXZlUXVlcnlDb250cm9sbGVyLFxuICAgICAgfSA9IHRoaXMuY29uZmlnO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgZGF0YWJhc2VDb250cm9sbGVyLnBlcmZvcm1Jbml0aWFsaXphdGlvbigpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoZS5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBhd2FpdCBob29rc0NvbnRyb2xsZXIubG9hZCgpO1xuICAgICAgY29uc3Qgc3RhcnR1cFByb21pc2VzID0gW107XG4gICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgIHN0YXJ0dXBQcm9taXNlcy5wdXNoKG5ldyBEZWZpbmVkU2NoZW1hcyhzY2hlbWEsIHRoaXMuY29uZmlnKS5leGVjdXRlKCkpO1xuICAgICAgfVxuICAgICAgaWYgKGNhY2hlQWRhcHRlcj8uY29ubmVjdCAmJiB0eXBlb2YgY2FjaGVBZGFwdGVyLmNvbm5lY3QgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgc3RhcnR1cFByb21pc2VzLnB1c2goY2FjaGVBZGFwdGVyLmNvbm5lY3QoKSk7XG4gICAgICB9XG4gICAgICBzdGFydHVwUHJvbWlzZXMucHVzaChsaXZlUXVlcnlDb250cm9sbGVyLmNvbm5lY3QoKSk7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChzdGFydHVwUHJvbWlzZXMpO1xuICAgICAgaWYgKGNsb3VkKSB7XG4gICAgICAgIGFkZFBhcnNlQ2xvdWQoKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbG91ZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZShjbG91ZChQYXJzZSkpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjbG91ZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBsZXQganNvbjtcbiAgICAgICAgICBpZiAocHJvY2Vzcy5lbnYubnBtX3BhY2thZ2VfanNvbikge1xuICAgICAgICAgICAganNvbiA9IHJlcXVpcmUocHJvY2Vzcy5lbnYubnBtX3BhY2thZ2VfanNvbik7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChwcm9jZXNzLmVudi5ucG1fcGFja2FnZV90eXBlID09PSAnbW9kdWxlJyB8fCBqc29uPy50eXBlID09PSAnbW9kdWxlJykge1xuICAgICAgICAgICAgYXdhaXQgaW1wb3J0KHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBjbG91ZCkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBjbG91ZCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBcImFyZ3VtZW50ICdjbG91ZCcgbXVzdCBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgYSBmdW5jdGlvblwiO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuICAgICAgfVxuICAgICAgaWYgKHNlY3VyaXR5ICYmIHNlY3VyaXR5LmVuYWJsZUNoZWNrICYmIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nKSB7XG4gICAgICAgIG5ldyBDaGVja1J1bm5lcihzZWN1cml0eSkucnVuKCk7XG4gICAgICB9XG4gICAgICB0aGlzLmNvbmZpZy5zdGF0ZSA9ICdvayc7XG4gICAgICBDb25maWcucHV0KHRoaXMuY29uZmlnKTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIHRoaXMuY29uZmlnLnN0YXRlID0gJ2Vycm9yJztcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIGdldCBhcHAoKSB7XG4gICAgaWYgKCF0aGlzLl9hcHApIHtcbiAgICAgIHRoaXMuX2FwcCA9IFBhcnNlU2VydmVyLmFwcCh0aGlzLmNvbmZpZyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9hcHA7XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuICAgIGNvbnN0IHsgYWRhcHRlcjogZGF0YWJhc2VBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5kYXRhYmFzZUNvbnRyb2xsZXI7XG4gICAgaWYgKGRhdGFiYXNlQWRhcHRlciAmJiB0eXBlb2YgZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGRhdGFiYXNlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBmaWxlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGlmIChmaWxlQWRhcHRlciAmJiB0eXBlb2YgZmlsZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goZmlsZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGNvbnN0IHsgYWRhcHRlcjogY2FjaGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXI7XG4gICAgaWYgKGNhY2hlQWRhcHRlciAmJiB0eXBlb2YgY2FjaGVBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGNhY2hlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgaWYgKHRoaXMubGl2ZVF1ZXJ5U2VydmVyPy5zZXJ2ZXI/LmNsb3NlKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKG5ldyBQcm9taXNlKHJlc29sdmUgPT4gdGhpcy5saXZlUXVlcnlTZXJ2ZXIuc2VydmVyLmNsb3NlKHJlc29sdmUpKSk7XG4gICAgfVxuICAgIGlmICh0aGlzLmxpdmVRdWVyeVNlcnZlcikge1xuICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLmxpdmVRdWVyeVNlcnZlci5zaHV0ZG93bigpKTtcbiAgICB9XG4gICAgcmV0dXJuIChwcm9taXNlcy5sZW5ndGggPiAwID8gUHJvbWlzZS5hbGwocHJvbWlzZXMpIDogUHJvbWlzZS5yZXNvbHZlKCkpLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuY29uZmlnLnNlcnZlckNsb3NlQ29tcGxldGUpIHtcbiAgICAgICAgdGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSgpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdGF0aWNcbiAgICogQWxsb3cgZGV2ZWxvcGVycyB0byBjdXN0b21pemUgZWFjaCByZXF1ZXN0IHdpdGggaW52ZXJzaW9uIG9mIGNvbnRyb2wvZGVwZW5kZW5jeSBpbmplY3Rpb25cbiAgICovXG4gIHN0YXRpYyBhcHBseVJlcXVlc3RDb250ZXh0TWlkZGxld2FyZShhcGksIG9wdGlvbnMpIHtcbiAgICBpZiAob3B0aW9ucy5yZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUpIHtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5yZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdyZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gICAgICB9XG4gICAgICBhcGkudXNlKG9wdGlvbnMucmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKTtcbiAgICB9XG4gIH1cbiAgLyoqXG4gICAqIEBzdGF0aWNcbiAgICogQ3JlYXRlIGFuIGV4cHJlc3MgYXBwIGZvciB0aGUgcGFyc2Ugc2VydmVyXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIGxldCB5b3Ugc3BlY2lmeSB0aGUgbWF4VXBsb2FkU2l6ZSB3aGVuIGNyZWF0aW5nIHRoZSBleHByZXNzIGFwcCAgKi9cbiAgc3RhdGljIGFwcChvcHRpb25zKSB7XG4gICAgY29uc3QgeyBtYXhVcGxvYWRTaXplID0gJzIwbWInLCBhcHBJZCwgZGlyZWN0QWNjZXNzLCBwYWdlcywgcmF0ZUxpbWl0ID0gW10gfSA9IG9wdGlvbnM7XG4gICAgLy8gVGhpcyBhcHAgc2VydmVzIHRoZSBQYXJzZSBBUEkgZGlyZWN0bHkuXG4gICAgLy8gSXQncyB0aGUgZXF1aXZhbGVudCBvZiBodHRwczovL2FwaS5wYXJzZS5jb20vMSBpbiB0aGUgaG9zdGVkIFBhcnNlIEFQSS5cbiAgICB2YXIgYXBpID0gZXhwcmVzcygpO1xuICAgIC8vYXBpLnVzZShcIi9hcHBzXCIsIGV4cHJlc3Muc3RhdGljKF9fZGlybmFtZSArIFwiL3B1YmxpY1wiKSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd0Nyb3NzRG9tYWluKGFwcElkKSk7XG4gICAgLy8gRmlsZSBoYW5kbGluZyBuZWVkcyB0byBiZSBiZWZvcmUgZGVmYXVsdCBtaWRkbGV3YXJlcyBhcmUgYXBwbGllZFxuICAgIGFwaS51c2UoXG4gICAgICAnLycsXG4gICAgICBuZXcgRmlsZXNSb3V0ZXIoKS5leHByZXNzUm91dGVyKHtcbiAgICAgICAgbWF4VXBsb2FkU2l6ZTogbWF4VXBsb2FkU2l6ZSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGFwaS51c2UoJy9oZWFsdGgnLCBmdW5jdGlvbiAocmVxLCByZXMpIHtcbiAgICAgIHJlcy5zdGF0dXMob3B0aW9ucy5zdGF0ZSA9PT0gJ29rJyA/IDIwMCA6IDUwMyk7XG4gICAgICBpZiAob3B0aW9ucy5zdGF0ZSA9PT0gJ3N0YXJ0aW5nJykge1xuICAgICAgICByZXMuc2V0KCdSZXRyeS1BZnRlcicsIDEpO1xuICAgICAgfVxuICAgICAgcmVzLmpzb24oe1xuICAgICAgICBzdGF0dXM6IG9wdGlvbnMuc3RhdGUsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGFwaS51c2UoXG4gICAgICAnLycsXG4gICAgICBib2R5UGFyc2VyLnVybGVuY29kZWQoeyBleHRlbmRlZDogZmFsc2UgfSksXG4gICAgICBwYWdlcy5lbmFibGVSb3V0ZXJcbiAgICAgICAgPyBuZXcgUGFnZXNSb3V0ZXIocGFnZXMpLmV4cHJlc3NSb3V0ZXIoKVxuICAgICAgICA6IG5ldyBQdWJsaWNBUElSb3V0ZXIoKS5leHByZXNzUm91dGVyKClcbiAgICApO1xuXG4gICAgYXBpLnVzZShib2R5UGFyc2VyLmpzb24oeyB0eXBlOiAnKi8qJywgbGltaXQ6IG1heFVwbG9hZFNpemUgfSkpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dNZXRob2RPdmVycmlkZSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMpO1xuICAgIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkocmF0ZUxpbWl0KSA/IHJhdGVMaW1pdCA6IFtyYXRlTGltaXRdO1xuICAgIGZvciAoY29uc3Qgcm91dGUgb2Ygcm91dGVzKSB7XG4gICAgICBtaWRkbGV3YXJlcy5hZGRSYXRlTGltaXQocm91dGUsIG9wdGlvbnMpO1xuICAgIH1cbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlU2Vzc2lvbik7XG4gICAgdGhpcy5hcHBseVJlcXVlc3RDb250ZXh0TWlkZGxld2FyZShhcGksIG9wdGlvbnMpO1xuICAgIGNvbnN0IGFwcFJvdXRlciA9IFBhcnNlU2VydmVyLnByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KTtcbiAgICBhcGkudXNlKGFwcFJvdXRlci5leHByZXNzUm91dGVyKCkpO1xuXG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUVycm9ycyk7XG5cbiAgICAvLyBydW4gdGhlIGZvbGxvd2luZyB3aGVuIG5vdCB0ZXN0aW5nXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICAvL1RoaXMgY2F1c2VzIHRlc3RzIHRvIHNwZXcgc29tZSB1c2VsZXNzIHdhcm5pbmdzLCBzbyBkaXNhYmxlIGluIHRlc3RcbiAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgICBwcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG4gICAgICAgICAgLy8gdXNlci1mcmllbmRseSBtZXNzYWdlIGZvciB0aGlzIGNvbW1vbiBlcnJvclxuICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKGBVbmFibGUgdG8gbGlzdGVuIG9uIHBvcnQgJHtlcnIucG9ydH0uIFRoZSBwb3J0IGlzIGFscmVhZHkgaW4gdXNlLmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgLy8gdmVyaWZ5IHRoZSBzZXJ2ZXIgdXJsIGFmdGVyIGEgJ21vdW50JyBldmVudCBpcyByZWNlaXZlZFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIC8vIGFwaS5vbignbW91bnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAvLyAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAwKSk7XG4gICAgICAvLyAgIFBhcnNlU2VydmVyLnZlcmlmeVNlcnZlclVybCgpO1xuICAgICAgLy8gfSk7XG4gICAgfVxuICAgIGlmIChwcm9jZXNzLmVudi5QQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTID09PSAnMScgfHwgZGlyZWN0QWNjZXNzKSB7XG4gICAgICBQYXJzZS5Db3JlTWFuYWdlci5zZXRSRVNUQ29udHJvbGxlcihQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyKGFwcElkLCBhcHBSb3V0ZXIpKTtcbiAgICB9XG4gICAgcmV0dXJuIGFwaTtcbiAgfVxuXG4gIHN0YXRpYyBwcm9taXNlUm91dGVyKHsgYXBwSWQgfSkge1xuICAgIGNvbnN0IHJvdXRlcnMgPSBbXG4gICAgICBuZXcgQ2xhc3Nlc1JvdXRlcigpLFxuICAgICAgbmV3IFVzZXJzUm91dGVyKCksXG4gICAgICBuZXcgU2Vzc2lvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBSb2xlc1JvdXRlcigpLFxuICAgICAgbmV3IEFuYWx5dGljc1JvdXRlcigpLFxuICAgICAgbmV3IEluc3RhbGxhdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBGdW5jdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTY2hlbWFzUm91dGVyKCksXG4gICAgICBuZXcgUHVzaFJvdXRlcigpLFxuICAgICAgbmV3IExvZ3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJQVBWYWxpZGF0aW9uUm91dGVyKCksXG4gICAgICBuZXcgRmVhdHVyZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBHbG9iYWxDb25maWdSb3V0ZXIoKSxcbiAgICAgIG5ldyBHcmFwaFFMUm91dGVyKCksXG4gICAgICBuZXcgUHVyZ2VSb3V0ZXIoKSxcbiAgICAgIG5ldyBIb29rc1JvdXRlcigpLFxuICAgICAgbmV3IENsb3VkQ29kZVJvdXRlcigpLFxuICAgICAgbmV3IEF1ZGllbmNlc1JvdXRlcigpLFxuICAgICAgbmV3IEFnZ3JlZ2F0ZVJvdXRlcigpLFxuICAgICAgbmV3IFNlY3VyaXR5Um91dGVyKCksXG4gICAgXTtcblxuICAgIGNvbnN0IHJvdXRlcyA9IHJvdXRlcnMucmVkdWNlKChtZW1vLCByb3V0ZXIpID0+IHtcbiAgICAgIHJldHVybiBtZW1vLmNvbmNhdChyb3V0ZXIucm91dGVzKTtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBuZXcgUHJvbWlzZVJvdXRlcihyb3V0ZXMsIGFwcElkKTtcblxuICAgIGJhdGNoLm1vdW50T250byhhcHBSb3V0ZXIpO1xuICAgIHJldHVybiBhcHBSb3V0ZXI7XG4gIH1cblxuICAvKipcbiAgICogc3RhcnRzIHRoZSBwYXJzZSBzZXJ2ZXIncyBleHByZXNzIGFwcFxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB0byB1c2UgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG5cbiAgYXN5bmMgc3RhcnRBcHAob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuc3RhcnQoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBvbiBQYXJzZVNlcnZlci5zdGFydEFwcDogJywgZSk7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgICBjb25zdCBhcHAgPSBleHByZXNzKCk7XG4gICAgaWYgKG9wdGlvbnMubWlkZGxld2FyZSkge1xuICAgICAgbGV0IG1pZGRsZXdhcmU7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMubWlkZGxld2FyZSA9PSAnc3RyaW5nJykge1xuICAgICAgICBtaWRkbGV3YXJlID0gcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgb3B0aW9ucy5taWRkbGV3YXJlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtaWRkbGV3YXJlID0gb3B0aW9ucy5taWRkbGV3YXJlOyAvLyB1c2UgYXMtaXMgbGV0IGV4cHJlc3MgZmFpbFxuICAgICAgfVxuICAgICAgYXBwLnVzZShtaWRkbGV3YXJlKTtcbiAgICB9XG4gICAgYXBwLnVzZShvcHRpb25zLm1vdW50UGF0aCwgdGhpcy5hcHApO1xuXG4gICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMID09PSB0cnVlIHx8IG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kID09PSB0cnVlKSB7XG4gICAgICBsZXQgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gdW5kZWZpbmVkO1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcnNlKGZzLnJlYWRGaWxlU3luYyhvcHRpb25zLmdyYXBoUUxTY2hlbWEsICd1dGY4JykpO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ29iamVjdCcgfHxcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IG9wdGlvbnMuZ3JhcGhRTFNjaGVtYTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcGFyc2VHcmFwaFFMU2VydmVyID0gbmV3IFBhcnNlR3JhcGhRTFNlcnZlcih0aGlzLCB7XG4gICAgICAgIGdyYXBoUUxQYXRoOiBvcHRpb25zLmdyYXBoUUxQYXRoLFxuICAgICAgICBwbGF5Z3JvdW5kUGF0aDogb3B0aW9ucy5wbGF5Z3JvdW5kUGF0aCxcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlHcmFwaFFMKGFwcCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50UGxheWdyb3VuZCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlQbGF5Z3JvdW5kKGFwcCk7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNlcnZlciA9IGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgYXBwLmxpc3RlbihvcHRpb25zLnBvcnQsIG9wdGlvbnMuaG9zdCwgZnVuY3Rpb24gKCkge1xuICAgICAgICByZXNvbHZlKHRoaXMpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG5cbiAgICBpZiAob3B0aW9ucy5zdGFydExpdmVRdWVyeVNlcnZlciB8fCBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnMpIHtcbiAgICAgIHRoaXMubGl2ZVF1ZXJ5U2VydmVyID0gYXdhaXQgUGFyc2VTZXJ2ZXIuY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyKFxuICAgICAgICBzZXJ2ZXIsXG4gICAgICAgIG9wdGlvbnMubGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyxcbiAgICAgICAgb3B0aW9uc1xuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMudHJ1c3RQcm94eSkge1xuICAgICAgYXBwLnNldCgndHJ1c3QgcHJveHknLCBvcHRpb25zLnRydXN0UHJveHkpO1xuICAgIH1cbiAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgY29uZmlndXJlTGlzdGVuZXJzKHRoaXMpO1xuICAgIH1cbiAgICB0aGlzLmV4cHJlc3NBcHAgPSBhcHA7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIG5ldyBQYXJzZVNlcnZlciBhbmQgc3RhcnRzIGl0LlxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB1c2VkIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgc3RhcnRBcHAob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgY29uc3QgcGFyc2VTZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gICAgcmV0dXJuIHBhcnNlU2VydmVyLnN0YXJ0QXBwKG9wdGlvbnMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEhlbHBlciBtZXRob2QgdG8gY3JlYXRlIGEgbGl2ZVF1ZXJ5IHNlcnZlclxuICAgKiBAc3RhdGljXG4gICAqIEBwYXJhbSB7U2VydmVyfSBodHRwU2VydmVyIGFuIG9wdGlvbmFsIGh0dHAgc2VydmVyIHRvIHBhc3NcbiAgICogQHBhcmFtIHtMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zfSBjb25maWcgb3B0aW9ucyBmb3IgdGhlIGxpdmVRdWVyeVNlcnZlclxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyBvcHRpb25zIGZvciB0aGUgUGFyc2VTZXJ2ZXJcbiAgICogQHJldHVybnMge1Byb21pc2U8UGFyc2VMaXZlUXVlcnlTZXJ2ZXI+fSB0aGUgbGl2ZSBxdWVyeSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBhc3luYyBjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIoXG4gICAgaHR0cFNlcnZlcixcbiAgICBjb25maWc6IExpdmVRdWVyeVNlcnZlck9wdGlvbnMsXG4gICAgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zXG4gICkge1xuICAgIGlmICghaHR0cFNlcnZlciB8fCAoY29uZmlnICYmIGNvbmZpZy5wb3J0KSkge1xuICAgICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcbiAgICAgIGh0dHBTZXJ2ZXIgPSByZXF1aXJlKCdodHRwJykuY3JlYXRlU2VydmVyKGFwcCk7XG4gICAgICBodHRwU2VydmVyLmxpc3Rlbihjb25maWcucG9ydCk7XG4gICAgfVxuICAgIGNvbnN0IHNlcnZlciA9IG5ldyBQYXJzZUxpdmVRdWVyeVNlcnZlcihodHRwU2VydmVyLCBjb25maWcsIG9wdGlvbnMpO1xuICAgIGF3YWl0IHNlcnZlci5jb25uZWN0KCk7XG4gICAgcmV0dXJuIHNlcnZlcjtcbiAgfVxuXG4gIHN0YXRpYyBhc3luYyB2ZXJpZnlTZXJ2ZXJVcmwoKSB7XG4gICAgLy8gcGVyZm9ybSBhIGhlYWx0aCBjaGVjayBvbiB0aGUgc2VydmVyVVJMIHZhbHVlXG4gICAgaWYgKFBhcnNlLnNlcnZlclVSTCkge1xuICAgICAgY29uc3QgaXNWYWxpZEh0dHBVcmwgPSBzdHJpbmcgPT4ge1xuICAgICAgICBsZXQgdXJsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHVybCA9IG5ldyBVUkwoc3RyaW5nKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdXJsLnByb3RvY29sID09PSAnaHR0cDonIHx8IHVybC5wcm90b2NvbCA9PT0gJ2h0dHBzOic7XG4gICAgICB9O1xuICAgICAgY29uc3QgdXJsID0gYCR7UGFyc2Uuc2VydmVyVVJMLnJlcGxhY2UoL1xcLyQvLCAnJyl9L2hlYWx0aGA7XG4gICAgICBpZiAoIWlzVmFsaWRIdHRwVXJsKHVybCkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9JyBhcyB0aGUgVVJMIGlzIGludmFsaWQuYCArXG4gICAgICAgICAgICBgIENsb3VkIGNvZGUgYW5kIHB1c2ggbm90aWZpY2F0aW9ucyBtYXkgYmUgdW5hdmFpbGFibGUhXFxuYFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCByZXF1ZXN0ID0gcmVxdWlyZSgnLi9yZXF1ZXN0Jyk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QoeyB1cmwgfSkuY2F0Y2gocmVzcG9uc2UgPT4gcmVzcG9uc2UpO1xuICAgICAgY29uc3QganNvbiA9IHJlc3BvbnNlLmRhdGEgfHwgbnVsbDtcbiAgICAgIGNvbnN0IHJldHJ5ID0gcmVzcG9uc2UuaGVhZGVycz8uWydyZXRyeS1hZnRlciddO1xuICAgICAgaWYgKHJldHJ5KSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCByZXRyeSAqIDEwMDApKTtcbiAgICAgICAgcmV0dXJuIHRoaXMudmVyaWZ5U2VydmVyVXJsKCk7XG4gICAgICB9XG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSAyMDAgfHwganNvbj8uc3RhdHVzICE9PSAnb2snKSB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9Jy5gICtcbiAgICAgICAgICAgIGAgQ2xvdWQgY29kZSBhbmQgcHVzaCBub3RpZmljYXRpb25zIG1heSBiZSB1bmF2YWlsYWJsZSFcXG5gXG4gICAgICAgICk7XG4gICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkUGFyc2VDbG91ZCgpIHtcbiAgY29uc3QgUGFyc2VDbG91ZCA9IHJlcXVpcmUoJy4vY2xvdWQtY29kZS9QYXJzZS5DbG91ZCcpO1xuICBjb25zdCBQYXJzZVNlcnZlciA9IHJlcXVpcmUoJy4vY2xvdWQtY29kZS9QYXJzZS5TZXJ2ZXInKTtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFBhcnNlLCAnU2VydmVyJywge1xuICAgIGdldCgpIHtcbiAgICAgIGNvbnN0IGNvbmYgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgcmV0dXJuIHsgLi4uY29uZiwgLi4uUGFyc2VTZXJ2ZXIgfTtcbiAgICB9LFxuICAgIHNldChuZXdWYWwpIHtcbiAgICAgIG5ld1ZhbC5hcHBJZCA9IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gICAgICBDb25maWcucHV0KG5ld1ZhbCk7XG4gICAgfSxcbiAgICBjb25maWd1cmFibGU6IHRydWUsXG4gIH0pO1xuICBPYmplY3QuYXNzaWduKFBhcnNlLkNsb3VkLCBQYXJzZUNsb3VkKTtcbiAgZ2xvYmFsLlBhcnNlID0gUGFyc2U7XG59XG5cbmZ1bmN0aW9uIGluamVjdERlZmF1bHRzKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBPYmplY3Qua2V5cyhkZWZhdWx0cykuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsIGtleSkpIHtcbiAgICAgIG9wdGlvbnNba2V5XSA9IGRlZmF1bHRzW2tleV07XG4gICAgfVxuICB9KTtcblxuICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvcHRpb25zLCAnc2VydmVyVVJMJykpIHtcbiAgICBvcHRpb25zLnNlcnZlclVSTCA9IGBodHRwOi8vbG9jYWxob3N0OiR7b3B0aW9ucy5wb3J0fSR7b3B0aW9ucy5tb3VudFBhdGh9YDtcbiAgfVxuXG4gIC8vIFJlc2VydmVkIENoYXJhY3RlcnNcbiAgaWYgKG9wdGlvbnMuYXBwSWQpIHtcbiAgICBjb25zdCByZWdleCA9IC9bISMkJScoKSorJi86Oz0/QFtcXF17fV4sfDw+XS9nO1xuICAgIGlmIChvcHRpb25zLmFwcElkLm1hdGNoKHJlZ2V4KSkge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuV0FSTklORywgYXBwSWQgdGhhdCBjb250YWlucyBzcGVjaWFsIGNoYXJhY3RlcnMgY2FuIGNhdXNlIGlzc3VlcyB3aGlsZSB1c2luZyB3aXRoIHVybHMuXFxuYFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvLyBCYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuICBpZiAob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzKSB7XG4gICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICFwcm9jZXNzLmVudi5URVNUSU5HICYmXG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5ERVBSRUNBVEVEOiB1c2VyU2Vuc2l0aXZlRmllbGRzIGhhcyBiZWVuIHJlcGxhY2VkIGJ5IHByb3RlY3RlZEZpZWxkcyBhbGxvd2luZyB0aGUgYWJpbGl0eSB0byBwcm90ZWN0IGZpZWxkcyBpbiBhbGwgY2xhc3NlcyB3aXRoIENMUC4gXFxuYFxuICAgICAgKTtcbiAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cblxuICAgIGNvbnN0IHVzZXJTZW5zaXRpdmVGaWVsZHMgPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKGRlZmF1bHRzLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pLCAuLi4ob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKV0pXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyBpcyB1bnNldCxcbiAgICAvLyBpdCdsbCBiZSBhc3NpZ25lZCB0aGUgZGVmYXVsdCBhYm92ZS5cbiAgICAvLyBIZXJlLCBwcm90ZWN0IGFnYWluc3QgdGhlIGNhc2Ugd2hlcmUgcHJvdGVjdGVkRmllbGRzXG4gICAgLy8gaXMgc2V0LCBidXQgZG9lc24ndCBoYXZlIF9Vc2VyLlxuICAgIGlmICghKCdfVXNlcicgaW4gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyA9IE9iamVjdC5hc3NpZ24oeyBfVXNlcjogW10gfSwgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgIH1cblxuICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gfHwgW10pLCAuLi51c2VyU2Vuc2l0aXZlRmllbGRzXSlcbiAgICApO1xuICB9XG5cbiAgLy8gTWVyZ2UgcHJvdGVjdGVkRmllbGRzIG9wdGlvbnMgd2l0aCBkZWZhdWx0cy5cbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzKS5mb3JFYWNoKGMgPT4ge1xuICAgIGNvbnN0IGN1ciA9IG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIGlmICghY3VyKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXSA9IGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICB9IGVsc2Uge1xuICAgICAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdKS5mb3JFYWNoKHIgPT4ge1xuICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gfHwgW10pLFxuICAgICAgICAgIC4uLmRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXVtyXSxcbiAgICAgICAgXSk7XG4gICAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbn1cblxuLy8gVGhvc2UgY2FuJ3QgYmUgdGVzdGVkIGFzIGl0IHJlcXVpcmVzIGEgc3VicHJvY2Vzc1xuLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbmZ1bmN0aW9uIGNvbmZpZ3VyZUxpc3RlbmVycyhwYXJzZVNlcnZlcikge1xuICBjb25zdCBzZXJ2ZXIgPSBwYXJzZVNlcnZlci5zZXJ2ZXI7XG4gIGNvbnN0IHNvY2tldHMgPSB7fTtcbiAgLyogQ3VycmVudGx5LCBleHByZXNzIGRvZXNuJ3Qgc2h1dCBkb3duIGltbWVkaWF0ZWx5IGFmdGVyIHJlY2VpdmluZyBTSUdJTlQvU0lHVEVSTSBpZiBpdCBoYXMgY2xpZW50IGNvbm5lY3Rpb25zIHRoYXQgaGF2ZW4ndCB0aW1lZCBvdXQuIChUaGlzIGlzIGEga25vd24gaXNzdWUgd2l0aCBub2RlIC0gaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2lzc3Vlcy8yNjQyKVxuICAgIFRoaXMgZnVuY3Rpb24sIGFsb25nIHdpdGggYGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zKClgLCBpbnRlbmQgdG8gZml4IHRoaXMgYmVoYXZpb3Igc3VjaCB0aGF0IHBhcnNlIHNlcnZlciB3aWxsIGNsb3NlIGFsbCBvcGVuIGNvbm5lY3Rpb25zIGFuZCBpbml0aWF0ZSB0aGUgc2h1dGRvd24gcHJvY2VzcyBhcyBzb29uIGFzIGl0IHJlY2VpdmVzIGEgU0lHSU5UL1NJR1RFUk0gc2lnbmFsLiAqL1xuICBzZXJ2ZXIub24oJ2Nvbm5lY3Rpb24nLCBzb2NrZXQgPT4ge1xuICAgIGNvbnN0IHNvY2tldElkID0gc29ja2V0LnJlbW90ZUFkZHJlc3MgKyAnOicgKyBzb2NrZXQucmVtb3RlUG9ydDtcbiAgICBzb2NrZXRzW3NvY2tldElkXSA9IHNvY2tldDtcbiAgICBzb2NrZXQub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgZGVsZXRlIHNvY2tldHNbc29ja2V0SWRdO1xuICAgIH0pO1xuICB9KTtcblxuICBjb25zdCBkZXN0cm95QWxpdmVDb25uZWN0aW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgICBmb3IgKGNvbnN0IHNvY2tldElkIGluIHNvY2tldHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHNvY2tldHNbc29ja2V0SWRdLmRlc3Ryb3koKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLyogKi9cbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgY29uc3QgaGFuZGxlU2h1dGRvd24gPSBmdW5jdGlvbiAoKSB7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1Rlcm1pbmF0aW9uIHNpZ25hbCByZWNlaXZlZC4gU2h1dHRpbmcgZG93bi4nKTtcbiAgICBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpO1xuICAgIHNlcnZlci5jbG9zZSgpO1xuICAgIHBhcnNlU2VydmVyLmhhbmRsZVNodXRkb3duKCk7XG4gIH07XG4gIHByb2Nlc3Mub24oJ1NJR1RFUk0nLCBoYW5kbGVTaHV0ZG93bik7XG4gIHByb2Nlc3Mub24oJ1NJR0lOVCcsIGhhbmRsZVNodXRkb3duKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFyc2VTZXJ2ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQVdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFtRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBOUNuRTs7QUFFQSxJQUFJQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxTQUFTLENBQUM7RUFDNUJDLFVBQVUsR0FBR0QsT0FBTyxDQUFDLGFBQWEsQ0FBQztFQUNuQ0UsT0FBTyxHQUFHRixPQUFPLENBQUMsU0FBUyxDQUFDO0VBQzVCRyxXQUFXLEdBQUdILE9BQU8sQ0FBQyxlQUFlLENBQUM7RUFDdENJLEtBQUssR0FBR0osT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDSSxLQUFLO0VBQ25DO0lBQUVDO0VBQU0sQ0FBQyxHQUFHTCxPQUFPLENBQUMsU0FBUyxDQUFDO0VBQzlCTSxJQUFJLEdBQUdOLE9BQU8sQ0FBQyxNQUFNLENBQUM7RUFDdEJPLEVBQUUsR0FBR1AsT0FBTyxDQUFDLElBQUksQ0FBQztBQXVDcEI7QUFDQVEsYUFBYSxFQUFFOztBQUVmO0FBQ0E7QUFDQSxNQUFNQyxXQUFXLENBQUM7RUFDaEI7QUFDRjtBQUNBO0FBQ0E7RUFDRUMsV0FBVyxDQUFDQyxPQUEyQixFQUFFO0lBQ3ZDO0lBQ0FDLG1CQUFVLENBQUNDLHNCQUFzQixDQUFDRixPQUFPLENBQUM7SUFDMUM7SUFDQUcsY0FBYyxDQUFDSCxPQUFPLENBQUM7SUFDdkIsTUFBTTtNQUNKSSxLQUFLLEdBQUcsSUFBQUMsMEJBQWlCLEVBQUMsNEJBQTRCLENBQUM7TUFDdkRDLFNBQVMsR0FBRyxJQUFBRCwwQkFBaUIsRUFBQywrQkFBK0IsQ0FBQztNQUM5REUsYUFBYTtNQUNiQyxTQUFTLEdBQUcsSUFBQUgsMEJBQWlCLEVBQUMsK0JBQStCO0lBQy9ELENBQUMsR0FBR0wsT0FBTztJQUNYO0lBQ0FQLEtBQUssQ0FBQ2dCLFVBQVUsQ0FBQ0wsS0FBSyxFQUFFRyxhQUFhLElBQUksUUFBUSxFQUFFRCxTQUFTLENBQUM7SUFDN0RiLEtBQUssQ0FBQ2UsU0FBUyxHQUFHQSxTQUFTO0lBRTNCRSxlQUFNLENBQUNDLGVBQWUsQ0FBQ1gsT0FBTyxDQUFDO0lBQy9CLE1BQU1ZLGNBQWMsR0FBR0MsV0FBVyxDQUFDQyxjQUFjLENBQUNkLE9BQU8sQ0FBQztJQUMxREEsT0FBTyxDQUFDZSxLQUFLLEdBQUcsYUFBYTtJQUM3QixJQUFJLENBQUNDLE1BQU0sR0FBR04sZUFBTSxDQUFDTyxHQUFHLENBQUNDLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFbkIsT0FBTyxFQUFFWSxjQUFjLENBQUMsQ0FBQztJQUNwRSxJQUFJLENBQUNJLE1BQU0sQ0FBQ0ksaUJBQWlCLEdBQUcsSUFBSUMsR0FBRyxFQUFFO0lBQ3pDLElBQUksQ0FBQ0wsTUFBTSxDQUFDTSxzQkFBc0IsR0FBRyxJQUFJRCxHQUFHLEVBQUU7SUFDOUNFLE9BQU8sQ0FBQ0MsU0FBUyxDQUFDWixjQUFjLENBQUNhLGdCQUFnQixDQUFDO0VBQ3BEOztFQUVBO0FBQ0Y7QUFDQTs7RUFFRSxNQUFNQyxLQUFLLEdBQUc7SUFDWixJQUFJO01BQ0YsSUFBSSxJQUFJLENBQUNWLE1BQU0sQ0FBQ0QsS0FBSyxLQUFLLElBQUksRUFBRTtRQUM5QixPQUFPLElBQUk7TUFDYjtNQUNBLElBQUksQ0FBQ0MsTUFBTSxDQUFDRCxLQUFLLEdBQUcsVUFBVTtNQUM5QkwsZUFBTSxDQUFDTyxHQUFHLENBQUMsSUFBSSxDQUFDRCxNQUFNLENBQUM7TUFDdkIsTUFBTTtRQUNKVyxrQkFBa0I7UUFDbEJDLGVBQWU7UUFDZkMsS0FBSztRQUNMQyxRQUFRO1FBQ1JDLE1BQU07UUFDTkMsWUFBWTtRQUNaQztNQUNGLENBQUMsR0FBRyxJQUFJLENBQUNqQixNQUFNO01BQ2YsSUFBSTtRQUNGLE1BQU1XLGtCQUFrQixDQUFDTyxxQkFBcUIsRUFBRTtNQUNsRCxDQUFDLENBQUMsT0FBT0MsQ0FBQyxFQUFFO1FBQ1YsSUFBSUEsQ0FBQyxDQUFDQyxJQUFJLEtBQUszQyxLQUFLLENBQUM0QyxLQUFLLENBQUNDLGVBQWUsRUFBRTtVQUMxQyxNQUFNSCxDQUFDO1FBQ1Q7TUFDRjtNQUNBLE1BQU1QLGVBQWUsQ0FBQ1csSUFBSSxFQUFFO01BQzVCLE1BQU1DLGVBQWUsR0FBRyxFQUFFO01BQzFCLElBQUlULE1BQU0sRUFBRTtRQUNWUyxlQUFlLENBQUNDLElBQUksQ0FBQyxJQUFJQyw4QkFBYyxDQUFDWCxNQUFNLEVBQUUsSUFBSSxDQUFDZixNQUFNLENBQUMsQ0FBQzJCLE9BQU8sRUFBRSxDQUFDO01BQ3pFO01BQ0EsSUFBSVgsWUFBWSxhQUFaQSxZQUFZLGVBQVpBLFlBQVksQ0FBRVksT0FBTyxJQUFJLE9BQU9aLFlBQVksQ0FBQ1ksT0FBTyxLQUFLLFVBQVUsRUFBRTtRQUN2RUosZUFBZSxDQUFDQyxJQUFJLENBQUNULFlBQVksQ0FBQ1ksT0FBTyxFQUFFLENBQUM7TUFDOUM7TUFDQUosZUFBZSxDQUFDQyxJQUFJLENBQUNSLG1CQUFtQixDQUFDVyxPQUFPLEVBQUUsQ0FBQztNQUNuRCxNQUFNQyxPQUFPLENBQUNDLEdBQUcsQ0FBQ04sZUFBZSxDQUFDO01BQ2xDLElBQUlYLEtBQUssRUFBRTtRQUNUaEMsYUFBYSxFQUFFO1FBQ2YsSUFBSSxPQUFPZ0MsS0FBSyxLQUFLLFVBQVUsRUFBRTtVQUMvQixNQUFNZ0IsT0FBTyxDQUFDRSxPQUFPLENBQUNsQixLQUFLLENBQUNwQyxLQUFLLENBQUMsQ0FBQztRQUNyQyxDQUFDLE1BQU0sSUFBSSxPQUFPb0MsS0FBSyxLQUFLLFFBQVEsRUFBRTtVQUFBO1VBQ3BDLElBQUltQixJQUFJO1VBQ1IsSUFBSUMsT0FBTyxDQUFDQyxHQUFHLENBQUNDLGdCQUFnQixFQUFFO1lBQ2hDSCxJQUFJLEdBQUczRCxPQUFPLENBQUM0RCxPQUFPLENBQUNDLEdBQUcsQ0FBQ0MsZ0JBQWdCLENBQUM7VUFDOUM7VUFDQSxJQUFJRixPQUFPLENBQUNDLEdBQUcsQ0FBQ0UsZ0JBQWdCLEtBQUssUUFBUSxJQUFJLFVBQUFKLElBQUksMENBQUosTUFBTUssSUFBSSxNQUFLLFFBQVEsRUFBRTtZQUN4RSxNQUFNLE1BQU0sQ0FBQzFELElBQUksQ0FBQ29ELE9BQU8sQ0FBQ0UsT0FBTyxDQUFDSyxHQUFHLEVBQUUsRUFBRXpCLEtBQUssQ0FBQyxDQUFDO1VBQ2xELENBQUMsTUFBTTtZQUNMeEMsT0FBTyxDQUFDTSxJQUFJLENBQUNvRCxPQUFPLENBQUNFLE9BQU8sQ0FBQ0ssR0FBRyxFQUFFLEVBQUV6QixLQUFLLENBQUMsQ0FBQztVQUM3QztRQUNGLENBQUMsTUFBTTtVQUNMLE1BQU0sd0RBQXdEO1FBQ2hFO1FBQ0EsTUFBTSxJQUFJZ0IsT0FBTyxDQUFDRSxPQUFPLElBQUlRLFVBQVUsQ0FBQ1IsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO01BQ3ZEO01BQ0EsSUFBSWpCLFFBQVEsSUFBSUEsUUFBUSxDQUFDMEIsV0FBVyxJQUFJMUIsUUFBUSxDQUFDMkIsY0FBYyxFQUFFO1FBQy9ELElBQUlDLG9CQUFXLENBQUM1QixRQUFRLENBQUMsQ0FBQzZCLEdBQUcsRUFBRTtNQUNqQztNQUNBLElBQUksQ0FBQzNDLE1BQU0sQ0FBQ0QsS0FBSyxHQUFHLElBQUk7TUFDeEJMLGVBQU0sQ0FBQ08sR0FBRyxDQUFDLElBQUksQ0FBQ0QsTUFBTSxDQUFDO01BQ3ZCLE9BQU8sSUFBSTtJQUNiLENBQUMsQ0FBQyxPQUFPNEMsS0FBSyxFQUFFO01BQ2RDLE9BQU8sQ0FBQ0QsS0FBSyxDQUFDQSxLQUFLLENBQUM7TUFDcEIsSUFBSSxDQUFDNUMsTUFBTSxDQUFDRCxLQUFLLEdBQUcsT0FBTztNQUMzQixNQUFNNkMsS0FBSztJQUNiO0VBQ0Y7RUFFQSxJQUFJRSxHQUFHLEdBQUc7SUFDUixJQUFJLENBQUMsSUFBSSxDQUFDQyxJQUFJLEVBQUU7TUFDZCxJQUFJLENBQUNBLElBQUksR0FBR2pFLFdBQVcsQ0FBQ2dFLEdBQUcsQ0FBQyxJQUFJLENBQUM5QyxNQUFNLENBQUM7SUFDMUM7SUFDQSxPQUFPLElBQUksQ0FBQytDLElBQUk7RUFDbEI7RUFFQUMsY0FBYyxHQUFHO0lBQUE7SUFDZixNQUFNQyxRQUFRLEdBQUcsRUFBRTtJQUNuQixNQUFNO01BQUVDLE9BQU8sRUFBRUM7SUFBZ0IsQ0FBQyxHQUFHLElBQUksQ0FBQ25ELE1BQU0sQ0FBQ1csa0JBQWtCO0lBQ25FLElBQUl3QyxlQUFlLElBQUksT0FBT0EsZUFBZSxDQUFDSCxjQUFjLEtBQUssVUFBVSxFQUFFO01BQzNFQyxRQUFRLENBQUN4QixJQUFJLENBQUMwQixlQUFlLENBQUNILGNBQWMsRUFBRSxDQUFDO0lBQ2pEO0lBQ0EsTUFBTTtNQUFFRSxPQUFPLEVBQUVFO0lBQVksQ0FBQyxHQUFHLElBQUksQ0FBQ3BELE1BQU0sQ0FBQ3FELGVBQWU7SUFDNUQsSUFBSUQsV0FBVyxJQUFJLE9BQU9BLFdBQVcsQ0FBQ0osY0FBYyxLQUFLLFVBQVUsRUFBRTtNQUNuRUMsUUFBUSxDQUFDeEIsSUFBSSxDQUFDMkIsV0FBVyxDQUFDSixjQUFjLEVBQUUsQ0FBQztJQUM3QztJQUNBLE1BQU07TUFBRUUsT0FBTyxFQUFFbEM7SUFBYSxDQUFDLEdBQUcsSUFBSSxDQUFDaEIsTUFBTSxDQUFDc0QsZUFBZTtJQUM3RCxJQUFJdEMsWUFBWSxJQUFJLE9BQU9BLFlBQVksQ0FBQ2dDLGNBQWMsS0FBSyxVQUFVLEVBQUU7TUFDckVDLFFBQVEsQ0FBQ3hCLElBQUksQ0FBQ1QsWUFBWSxDQUFDZ0MsY0FBYyxFQUFFLENBQUM7SUFDOUM7SUFDQSw2QkFBSSxJQUFJLENBQUNPLGVBQWUsNEVBQXBCLHNCQUFzQkMsTUFBTSxtREFBNUIsdUJBQThCQyxLQUFLLEVBQUU7TUFDdkNSLFFBQVEsQ0FBQ3hCLElBQUksQ0FBQyxJQUFJSSxPQUFPLENBQUNFLE9BQU8sSUFBSSxJQUFJLENBQUN3QixlQUFlLENBQUNDLE1BQU0sQ0FBQ0MsS0FBSyxDQUFDMUIsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNuRjtJQUNBLElBQUksSUFBSSxDQUFDd0IsZUFBZSxFQUFFO01BQ3hCTixRQUFRLENBQUN4QixJQUFJLENBQUMsSUFBSSxDQUFDOEIsZUFBZSxDQUFDRyxRQUFRLEVBQUUsQ0FBQztJQUNoRDtJQUNBLE9BQU8sQ0FBQ1QsUUFBUSxDQUFDVSxNQUFNLEdBQUcsQ0FBQyxHQUFHOUIsT0FBTyxDQUFDQyxHQUFHLENBQUNtQixRQUFRLENBQUMsR0FBR3BCLE9BQU8sQ0FBQ0UsT0FBTyxFQUFFLEVBQUU2QixJQUFJLENBQUMsTUFBTTtNQUNsRixJQUFJLElBQUksQ0FBQzVELE1BQU0sQ0FBQzZELG1CQUFtQixFQUFFO1FBQ25DLElBQUksQ0FBQzdELE1BQU0sQ0FBQzZELG1CQUFtQixFQUFFO01BQ25DO0lBQ0YsQ0FBQyxDQUFDO0VBQ0o7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7RUFDRSxPQUFPQyw2QkFBNkIsQ0FBQ0MsR0FBRyxFQUFFL0UsT0FBTyxFQUFFO0lBQ2pELElBQUlBLE9BQU8sQ0FBQ2dGLHdCQUF3QixFQUFFO01BQ3BDLElBQUksT0FBT2hGLE9BQU8sQ0FBQ2dGLHdCQUF3QixLQUFLLFVBQVUsRUFBRTtRQUMxRCxNQUFNLElBQUkzQyxLQUFLLENBQUMsNkNBQTZDLENBQUM7TUFDaEU7TUFDQTBDLEdBQUcsQ0FBQ0UsR0FBRyxDQUFDakYsT0FBTyxDQUFDZ0Ysd0JBQXdCLENBQUM7SUFDM0M7RUFDRjtFQUNBO0FBQ0Y7QUFDQTtBQUNBO0VBQ0UsT0FBT2xCLEdBQUcsQ0FBQzlELE9BQU8sRUFBRTtJQUNsQixNQUFNO01BQUVrRixhQUFhLEdBQUcsTUFBTTtNQUFFOUUsS0FBSztNQUFFK0UsWUFBWTtNQUFFQyxLQUFLO01BQUVDLFNBQVMsR0FBRztJQUFHLENBQUMsR0FBR3JGLE9BQU87SUFDdEY7SUFDQTtJQUNBLElBQUkrRSxHQUFHLEdBQUd4RixPQUFPLEVBQUU7SUFDbkI7SUFDQXdGLEdBQUcsQ0FBQ0UsR0FBRyxDQUFDekYsV0FBVyxDQUFDOEYsZ0JBQWdCLENBQUNsRixLQUFLLENBQUMsQ0FBQztJQUM1QztJQUNBMkUsR0FBRyxDQUFDRSxHQUFHLENBQ0wsR0FBRyxFQUNILElBQUlNLHdCQUFXLEVBQUUsQ0FBQ0MsYUFBYSxDQUFDO01BQzlCTixhQUFhLEVBQUVBO0lBQ2pCLENBQUMsQ0FBQyxDQUNIO0lBRURILEdBQUcsQ0FBQ0UsR0FBRyxDQUFDLFNBQVMsRUFBRSxVQUFVUSxHQUFHLEVBQUVDLEdBQUcsRUFBRTtNQUNyQ0EsR0FBRyxDQUFDQyxNQUFNLENBQUMzRixPQUFPLENBQUNlLEtBQUssS0FBSyxJQUFJLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztNQUM5QyxJQUFJZixPQUFPLENBQUNlLEtBQUssS0FBSyxVQUFVLEVBQUU7UUFDaEMyRSxHQUFHLENBQUNFLEdBQUcsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDO01BQzNCO01BQ0FGLEdBQUcsQ0FBQzFDLElBQUksQ0FBQztRQUNQMkMsTUFBTSxFQUFFM0YsT0FBTyxDQUFDZTtNQUNsQixDQUFDLENBQUM7SUFDSixDQUFDLENBQUM7SUFFRmdFLEdBQUcsQ0FBQ0UsR0FBRyxDQUNMLEdBQUcsRUFDSDNGLFVBQVUsQ0FBQ3VHLFVBQVUsQ0FBQztNQUFFQyxRQUFRLEVBQUU7SUFBTSxDQUFDLENBQUMsRUFDMUNWLEtBQUssQ0FBQ1csWUFBWSxHQUNkLElBQUlDLHdCQUFXLENBQUNaLEtBQUssQ0FBQyxDQUFDSSxhQUFhLEVBQUUsR0FDdEMsSUFBSVMsZ0NBQWUsRUFBRSxDQUFDVCxhQUFhLEVBQUUsQ0FDMUM7SUFFRFQsR0FBRyxDQUFDRSxHQUFHLENBQUMzRixVQUFVLENBQUMwRCxJQUFJLENBQUM7TUFBRUssSUFBSSxFQUFFLEtBQUs7TUFBRTZDLEtBQUssRUFBRWhCO0lBQWMsQ0FBQyxDQUFDLENBQUM7SUFDL0RILEdBQUcsQ0FBQ0UsR0FBRyxDQUFDekYsV0FBVyxDQUFDMkcsbUJBQW1CLENBQUM7SUFDeENwQixHQUFHLENBQUNFLEdBQUcsQ0FBQ3pGLFdBQVcsQ0FBQzRHLGtCQUFrQixDQUFDO0lBQ3ZDLE1BQU1DLE1BQU0sR0FBR0MsS0FBSyxDQUFDQyxPQUFPLENBQUNsQixTQUFTLENBQUMsR0FBR0EsU0FBUyxHQUFHLENBQUNBLFNBQVMsQ0FBQztJQUNqRSxLQUFLLE1BQU1tQixLQUFLLElBQUlILE1BQU0sRUFBRTtNQUMxQjdHLFdBQVcsQ0FBQ2lILFlBQVksQ0FBQ0QsS0FBSyxFQUFFeEcsT0FBTyxDQUFDO0lBQzFDO0lBQ0ErRSxHQUFHLENBQUNFLEdBQUcsQ0FBQ3pGLFdBQVcsQ0FBQ2tILGtCQUFrQixDQUFDO0lBQ3ZDLElBQUksQ0FBQzVCLDZCQUE2QixDQUFDQyxHQUFHLEVBQUUvRSxPQUFPLENBQUM7SUFDaEQsTUFBTTJHLFNBQVMsR0FBRzdHLFdBQVcsQ0FBQzhHLGFBQWEsQ0FBQztNQUFFeEc7SUFBTSxDQUFDLENBQUM7SUFDdEQyRSxHQUFHLENBQUNFLEdBQUcsQ0FBQzBCLFNBQVMsQ0FBQ25CLGFBQWEsRUFBRSxDQUFDO0lBRWxDVCxHQUFHLENBQUNFLEdBQUcsQ0FBQ3pGLFdBQVcsQ0FBQ3FILGlCQUFpQixDQUFDOztJQUV0QztJQUNBLElBQUksQ0FBQzVELE9BQU8sQ0FBQ0MsR0FBRyxDQUFDNEQsT0FBTyxFQUFFO01BQ3hCO01BQ0E7TUFDQTdELE9BQU8sQ0FBQzhELEVBQUUsQ0FBQyxtQkFBbUIsRUFBRUMsR0FBRyxJQUFJO1FBQ3JDLElBQUlBLEdBQUcsQ0FBQzVFLElBQUksS0FBSyxZQUFZLEVBQUU7VUFDN0I7VUFDQWEsT0FBTyxDQUFDZ0UsTUFBTSxDQUFDQyxLQUFLLENBQUUsNEJBQTJCRixHQUFHLENBQUNHLElBQUssK0JBQThCLENBQUM7VUFDekZsRSxPQUFPLENBQUNtRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ2pCLENBQUMsTUFBTTtVQUNMLE1BQU1KLEdBQUc7UUFDWDtNQUNGLENBQUMsQ0FBQztNQUNGO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtJQUNGOztJQUNBLElBQUkvRCxPQUFPLENBQUNDLEdBQUcsQ0FBQ21FLDhDQUE4QyxLQUFLLEdBQUcsSUFBSWxDLFlBQVksRUFBRTtNQUN0RjFGLEtBQUssQ0FBQzZILFdBQVcsQ0FBQ0MsaUJBQWlCLENBQUMsSUFBQUMsb0RBQXlCLEVBQUNwSCxLQUFLLEVBQUV1RyxTQUFTLENBQUMsQ0FBQztJQUNsRjtJQUNBLE9BQU81QixHQUFHO0VBQ1o7RUFFQSxPQUFPNkIsYUFBYSxDQUFDO0lBQUV4RztFQUFNLENBQUMsRUFBRTtJQUM5QixNQUFNcUgsT0FBTyxHQUFHLENBQ2QsSUFBSUMsNEJBQWEsRUFBRSxFQUNuQixJQUFJQyx3QkFBVyxFQUFFLEVBQ2pCLElBQUlDLDhCQUFjLEVBQUUsRUFDcEIsSUFBSUMsd0JBQVcsRUFBRSxFQUNqQixJQUFJQyxnQ0FBZSxFQUFFLEVBQ3JCLElBQUlDLHdDQUFtQixFQUFFLEVBQ3pCLElBQUlDLGdDQUFlLEVBQUUsRUFDckIsSUFBSUMsNEJBQWEsRUFBRSxFQUNuQixJQUFJQyxzQkFBVSxFQUFFLEVBQ2hCLElBQUlDLHNCQUFVLEVBQUUsRUFDaEIsSUFBSUMsd0NBQW1CLEVBQUUsRUFDekIsSUFBSUMsOEJBQWMsRUFBRSxFQUNwQixJQUFJQyxzQ0FBa0IsRUFBRSxFQUN4QixJQUFJQyw0QkFBYSxFQUFFLEVBQ25CLElBQUlDLHdCQUFXLEVBQUUsRUFDakIsSUFBSUMsd0JBQVcsRUFBRSxFQUNqQixJQUFJQyxnQ0FBZSxFQUFFLEVBQ3JCLElBQUlDLGdDQUFlLEVBQUUsRUFDckIsSUFBSUMsZ0NBQWUsRUFBRSxFQUNyQixJQUFJQyw4QkFBYyxFQUFFLENBQ3JCO0lBRUQsTUFBTXhDLE1BQU0sR0FBR29CLE9BQU8sQ0FBQ3FCLE1BQU0sQ0FBQyxDQUFDQyxJQUFJLEVBQUVDLE1BQU0sS0FBSztNQUM5QyxPQUFPRCxJQUFJLENBQUNFLE1BQU0sQ0FBQ0QsTUFBTSxDQUFDM0MsTUFBTSxDQUFDO0lBQ25DLENBQUMsRUFBRSxFQUFFLENBQUM7SUFFTixNQUFNTSxTQUFTLEdBQUcsSUFBSXVDLHNCQUFhLENBQUM3QyxNQUFNLEVBQUVqRyxLQUFLLENBQUM7SUFFbERoQixLQUFLLENBQUMrSixTQUFTLENBQUN4QyxTQUFTLENBQUM7SUFDMUIsT0FBT0EsU0FBUztFQUNsQjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBOztFQUVFLE1BQU15QyxRQUFRLENBQUNwSixPQUEyQixFQUFFO0lBQzFDLElBQUk7TUFDRixNQUFNLElBQUksQ0FBQzBCLEtBQUssRUFBRTtJQUNwQixDQUFDLENBQUMsT0FBT1MsQ0FBQyxFQUFFO01BQ1YwQixPQUFPLENBQUNELEtBQUssQ0FBQyxpQ0FBaUMsRUFBRXpCLENBQUMsQ0FBQztNQUNuRCxNQUFNQSxDQUFDO0lBQ1Q7SUFDQSxNQUFNMkIsR0FBRyxHQUFHdkUsT0FBTyxFQUFFO0lBQ3JCLElBQUlTLE9BQU8sQ0FBQ3FKLFVBQVUsRUFBRTtNQUN0QixJQUFJQSxVQUFVO01BQ2QsSUFBSSxPQUFPckosT0FBTyxDQUFDcUosVUFBVSxJQUFJLFFBQVEsRUFBRTtRQUN6Q0EsVUFBVSxHQUFHaEssT0FBTyxDQUFDTSxJQUFJLENBQUNvRCxPQUFPLENBQUNFLE9BQU8sQ0FBQ0ssR0FBRyxFQUFFLEVBQUV0RCxPQUFPLENBQUNxSixVQUFVLENBQUMsQ0FBQztNQUN2RSxDQUFDLE1BQU07UUFDTEEsVUFBVSxHQUFHckosT0FBTyxDQUFDcUosVUFBVSxDQUFDLENBQUM7TUFDbkM7O01BQ0F2RixHQUFHLENBQUNtQixHQUFHLENBQUNvRSxVQUFVLENBQUM7SUFDckI7SUFDQXZGLEdBQUcsQ0FBQ21CLEdBQUcsQ0FBQ2pGLE9BQU8sQ0FBQ3NKLFNBQVMsRUFBRSxJQUFJLENBQUN4RixHQUFHLENBQUM7SUFFcEMsSUFBSTlELE9BQU8sQ0FBQ3VKLFlBQVksS0FBSyxJQUFJLElBQUl2SixPQUFPLENBQUN3SixlQUFlLEtBQUssSUFBSSxFQUFFO01BQ3JFLElBQUlDLHFCQUFxQixHQUFHQyxTQUFTO01BQ3JDLElBQUksT0FBTzFKLE9BQU8sQ0FBQzJKLGFBQWEsS0FBSyxRQUFRLEVBQUU7UUFDN0NGLHFCQUFxQixHQUFHL0osS0FBSyxDQUFDRSxFQUFFLENBQUNnSyxZQUFZLENBQUM1SixPQUFPLENBQUMySixhQUFhLEVBQUUsTUFBTSxDQUFDLENBQUM7TUFDL0UsQ0FBQyxNQUFNLElBQ0wsT0FBTzNKLE9BQU8sQ0FBQzJKLGFBQWEsS0FBSyxRQUFRLElBQ3pDLE9BQU8zSixPQUFPLENBQUMySixhQUFhLEtBQUssVUFBVSxFQUMzQztRQUNBRixxQkFBcUIsR0FBR3pKLE9BQU8sQ0FBQzJKLGFBQWE7TUFDL0M7TUFFQSxNQUFNRSxrQkFBa0IsR0FBRyxJQUFJQyxzQ0FBa0IsQ0FBQyxJQUFJLEVBQUU7UUFDdERDLFdBQVcsRUFBRS9KLE9BQU8sQ0FBQytKLFdBQVc7UUFDaENDLGNBQWMsRUFBRWhLLE9BQU8sQ0FBQ2dLLGNBQWM7UUFDdENQO01BQ0YsQ0FBQyxDQUFDO01BRUYsSUFBSXpKLE9BQU8sQ0FBQ3VKLFlBQVksRUFBRTtRQUN4Qk0sa0JBQWtCLENBQUNJLFlBQVksQ0FBQ25HLEdBQUcsQ0FBQztNQUN0QztNQUVBLElBQUk5RCxPQUFPLENBQUN3SixlQUFlLEVBQUU7UUFDM0JLLGtCQUFrQixDQUFDSyxlQUFlLENBQUNwRyxHQUFHLENBQUM7TUFDekM7SUFDRjtJQUNBLE1BQU1VLE1BQU0sR0FBRyxNQUFNLElBQUkzQixPQUFPLENBQUNFLE9BQU8sSUFBSTtNQUMxQ2UsR0FBRyxDQUFDcUcsTUFBTSxDQUFDbkssT0FBTyxDQUFDbUgsSUFBSSxFQUFFbkgsT0FBTyxDQUFDb0ssSUFBSSxFQUFFLFlBQVk7UUFDakRySCxPQUFPLENBQUMsSUFBSSxDQUFDO01BQ2YsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDeUIsTUFBTSxHQUFHQSxNQUFNO0lBRXBCLElBQUl4RSxPQUFPLENBQUNxSyxvQkFBb0IsSUFBSXJLLE9BQU8sQ0FBQ3NLLHNCQUFzQixFQUFFO01BQ2xFLElBQUksQ0FBQy9GLGVBQWUsR0FBRyxNQUFNekUsV0FBVyxDQUFDeUsscUJBQXFCLENBQzVEL0YsTUFBTSxFQUNOeEUsT0FBTyxDQUFDc0ssc0JBQXNCLEVBQzlCdEssT0FBTyxDQUNSO0lBQ0g7SUFDQSxJQUFJQSxPQUFPLENBQUN3SyxVQUFVLEVBQUU7TUFDdEIxRyxHQUFHLENBQUM4QixHQUFHLENBQUMsYUFBYSxFQUFFNUYsT0FBTyxDQUFDd0ssVUFBVSxDQUFDO0lBQzVDO0lBQ0E7SUFDQSxJQUFJLENBQUN2SCxPQUFPLENBQUNDLEdBQUcsQ0FBQzRELE9BQU8sRUFBRTtNQUN4QjJELGtCQUFrQixDQUFDLElBQUksQ0FBQztJQUMxQjtJQUNBLElBQUksQ0FBQ0MsVUFBVSxHQUFHNUcsR0FBRztJQUNyQixPQUFPLElBQUk7RUFDYjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0VBQ0UsYUFBYXNGLFFBQVEsQ0FBQ3BKLE9BQTJCLEVBQUU7SUFDakQsTUFBTTJLLFdBQVcsR0FBRyxJQUFJN0ssV0FBVyxDQUFDRSxPQUFPLENBQUM7SUFDNUMsT0FBTzJLLFdBQVcsQ0FBQ3ZCLFFBQVEsQ0FBQ3BKLE9BQU8sQ0FBQztFQUN0Qzs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0UsYUFBYXVLLHFCQUFxQixDQUNoQ0ssVUFBVSxFQUNWNUosTUFBOEIsRUFDOUJoQixPQUEyQixFQUMzQjtJQUNBLElBQUksQ0FBQzRLLFVBQVUsSUFBSzVKLE1BQU0sSUFBSUEsTUFBTSxDQUFDbUcsSUFBSyxFQUFFO01BQzFDLElBQUlyRCxHQUFHLEdBQUd2RSxPQUFPLEVBQUU7TUFDbkJxTCxVQUFVLEdBQUd2TCxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUN3TCxZQUFZLENBQUMvRyxHQUFHLENBQUM7TUFDOUM4RyxVQUFVLENBQUNULE1BQU0sQ0FBQ25KLE1BQU0sQ0FBQ21HLElBQUksQ0FBQztJQUNoQztJQUNBLE1BQU0zQyxNQUFNLEdBQUcsSUFBSXNHLDBDQUFvQixDQUFDRixVQUFVLEVBQUU1SixNQUFNLEVBQUVoQixPQUFPLENBQUM7SUFDcEUsTUFBTXdFLE1BQU0sQ0FBQzVCLE9BQU8sRUFBRTtJQUN0QixPQUFPNEIsTUFBTTtFQUNmO0VBRUEsYUFBYXVHLGVBQWUsR0FBRztJQUM3QjtJQUNBLElBQUl0TCxLQUFLLENBQUNlLFNBQVMsRUFBRTtNQUFBO01BQ25CLE1BQU13SyxjQUFjLEdBQUdDLE1BQU0sSUFBSTtRQUMvQixJQUFJQyxHQUFHO1FBQ1AsSUFBSTtVQUNGQSxHQUFHLEdBQUcsSUFBSUMsR0FBRyxDQUFDRixNQUFNLENBQUM7UUFDdkIsQ0FBQyxDQUFDLE9BQU9HLENBQUMsRUFBRTtVQUNWLE9BQU8sS0FBSztRQUNkO1FBQ0EsT0FBT0YsR0FBRyxDQUFDRyxRQUFRLEtBQUssT0FBTyxJQUFJSCxHQUFHLENBQUNHLFFBQVEsS0FBSyxRQUFRO01BQzlELENBQUM7TUFDRCxNQUFNSCxHQUFHLEdBQUksR0FBRXpMLEtBQUssQ0FBQ2UsU0FBUyxDQUFDOEssT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUUsU0FBUTtNQUMxRCxJQUFJLENBQUNOLGNBQWMsQ0FBQ0UsR0FBRyxDQUFDLEVBQUU7UUFDeEJySCxPQUFPLENBQUMwSCxJQUFJLENBQ1Qsb0NBQW1DOUwsS0FBSyxDQUFDZSxTQUFVLDBCQUF5QixHQUMxRSwwREFBeUQsQ0FDN0Q7UUFDRDtNQUNGO01BQ0EsTUFBTWdMLE9BQU8sR0FBR25NLE9BQU8sQ0FBQyxXQUFXLENBQUM7TUFDcEMsTUFBTW9NLFFBQVEsR0FBRyxNQUFNRCxPQUFPLENBQUM7UUFBRU47TUFBSSxDQUFDLENBQUMsQ0FBQ1EsS0FBSyxDQUFDRCxRQUFRLElBQUlBLFFBQVEsQ0FBQztNQUNuRSxNQUFNekksSUFBSSxHQUFHeUksUUFBUSxDQUFDRSxJQUFJLElBQUksSUFBSTtNQUNsQyxNQUFNQyxLQUFLLHdCQUFHSCxRQUFRLENBQUNJLE9BQU8sc0RBQWhCLGtCQUFtQixhQUFhLENBQUM7TUFDL0MsSUFBSUQsS0FBSyxFQUFFO1FBQ1QsTUFBTSxJQUFJL0ksT0FBTyxDQUFDRSxPQUFPLElBQUlRLFVBQVUsQ0FBQ1IsT0FBTyxFQUFFNkksS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDO1FBQy9ELE9BQU8sSUFBSSxDQUFDYixlQUFlLEVBQUU7TUFDL0I7TUFDQSxJQUFJVSxRQUFRLENBQUM5RixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUEzQyxJQUFJLGFBQUpBLElBQUksdUJBQUpBLElBQUksQ0FBRTJDLE1BQU0sTUFBSyxJQUFJLEVBQUU7UUFDcEQ7UUFDQTlCLE9BQU8sQ0FBQzBILElBQUksQ0FDVCxvQ0FBbUM5TCxLQUFLLENBQUNlLFNBQVUsSUFBRyxHQUNwRCwwREFBeUQsQ0FDN0Q7UUFDRDtRQUNBO01BQ0Y7TUFDQSxPQUFPLElBQUk7SUFDYjtFQUNGO0FBQ0Y7QUFFQSxTQUFTWCxhQUFhLEdBQUc7RUFDdkIsTUFBTWlNLFVBQVUsR0FBR3pNLE9BQU8sQ0FBQywwQkFBMEIsQ0FBQztFQUN0RCxNQUFNUyxXQUFXLEdBQUdULE9BQU8sQ0FBQywyQkFBMkIsQ0FBQztFQUN4RDZCLE1BQU0sQ0FBQzZLLGNBQWMsQ0FBQ3RNLEtBQUssRUFBRSxRQUFRLEVBQUU7SUFDckN1TSxHQUFHLEdBQUc7TUFDSixNQUFNQyxJQUFJLEdBQUd2TCxlQUFNLENBQUNzTCxHQUFHLENBQUN2TSxLQUFLLENBQUN5TSxhQUFhLENBQUM7TUFDNUMsdUNBQVlELElBQUksR0FBS25NLFdBQVc7SUFDbEMsQ0FBQztJQUNEOEYsR0FBRyxDQUFDdUcsTUFBTSxFQUFFO01BQ1ZBLE1BQU0sQ0FBQy9MLEtBQUssR0FBR1gsS0FBSyxDQUFDeU0sYUFBYTtNQUNsQ3hMLGVBQU0sQ0FBQ08sR0FBRyxDQUFDa0wsTUFBTSxDQUFDO0lBQ3BCLENBQUM7SUFDREMsWUFBWSxFQUFFO0VBQ2hCLENBQUMsQ0FBQztFQUNGbEwsTUFBTSxDQUFDQyxNQUFNLENBQUMxQixLQUFLLENBQUM0TSxLQUFLLEVBQUVQLFVBQVUsQ0FBQztFQUN0Q1EsTUFBTSxDQUFDN00sS0FBSyxHQUFHQSxLQUFLO0FBQ3RCO0FBRUEsU0FBU1UsY0FBYyxDQUFDSCxPQUEyQixFQUFFO0VBQ25Ea0IsTUFBTSxDQUFDcUwsSUFBSSxDQUFDQyxpQkFBUSxDQUFDLENBQUNDLE9BQU8sQ0FBQ0MsR0FBRyxJQUFJO0lBQ25DLElBQUksQ0FBQ3hMLE1BQU0sQ0FBQ3lMLFNBQVMsQ0FBQ0MsY0FBYyxDQUFDQyxJQUFJLENBQUM3TSxPQUFPLEVBQUUwTSxHQUFHLENBQUMsRUFBRTtNQUN2RDFNLE9BQU8sQ0FBQzBNLEdBQUcsQ0FBQyxHQUFHRixpQkFBUSxDQUFDRSxHQUFHLENBQUM7SUFDOUI7RUFDRixDQUFDLENBQUM7RUFFRixJQUFJLENBQUN4TCxNQUFNLENBQUN5TCxTQUFTLENBQUNDLGNBQWMsQ0FBQ0MsSUFBSSxDQUFDN00sT0FBTyxFQUFFLFdBQVcsQ0FBQyxFQUFFO0lBQy9EQSxPQUFPLENBQUNRLFNBQVMsR0FBSSxvQkFBbUJSLE9BQU8sQ0FBQ21ILElBQUssR0FBRW5ILE9BQU8sQ0FBQ3NKLFNBQVUsRUFBQztFQUM1RTs7RUFFQTtFQUNBLElBQUl0SixPQUFPLENBQUNJLEtBQUssRUFBRTtJQUNqQixNQUFNME0sS0FBSyxHQUFHLCtCQUErQjtJQUM3QyxJQUFJOU0sT0FBTyxDQUFDSSxLQUFLLENBQUMyTSxLQUFLLENBQUNELEtBQUssQ0FBQyxFQUFFO01BQzlCakosT0FBTyxDQUFDMEgsSUFBSSxDQUNULDZGQUE0RixDQUM5RjtJQUNIO0VBQ0Y7O0VBRUE7RUFDQSxJQUFJdkwsT0FBTyxDQUFDZ04sbUJBQW1CLEVBQUU7SUFDL0I7SUFDQSxDQUFDL0osT0FBTyxDQUFDQyxHQUFHLENBQUM0RCxPQUFPLElBQ2xCakQsT0FBTyxDQUFDMEgsSUFBSSxDQUNULDJJQUEwSSxDQUM1STtJQUNIOztJQUVBLE1BQU15QixtQkFBbUIsR0FBRzFHLEtBQUssQ0FBQzJHLElBQUksQ0FDcEMsSUFBSUMsR0FBRyxDQUFDLENBQUMsSUFBSVYsaUJBQVEsQ0FBQ1EsbUJBQW1CLElBQUksRUFBRSxDQUFDLEVBQUUsSUFBSWhOLE9BQU8sQ0FBQ2dOLG1CQUFtQixJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FDM0Y7O0lBRUQ7SUFDQTtJQUNBO0lBQ0E7SUFDQSxJQUFJLEVBQUUsT0FBTyxJQUFJaE4sT0FBTyxDQUFDbU4sZUFBZSxDQUFDLEVBQUU7TUFDekNuTixPQUFPLENBQUNtTixlQUFlLEdBQUdqTSxNQUFNLENBQUNDLE1BQU0sQ0FBQztRQUFFaU0sS0FBSyxFQUFFO01BQUcsQ0FBQyxFQUFFcE4sT0FBTyxDQUFDbU4sZUFBZSxDQUFDO0lBQ2pGO0lBRUFuTixPQUFPLENBQUNtTixlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUc3RyxLQUFLLENBQUMyRyxJQUFJLENBQ2hELElBQUlDLEdBQUcsQ0FBQyxDQUFDLElBQUlsTixPQUFPLENBQUNtTixlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsR0FBR0gsbUJBQW1CLENBQUMsQ0FBQyxDQUNwRjtFQUNIOztFQUVBO0VBQ0E5TCxNQUFNLENBQUNxTCxJQUFJLENBQUNDLGlCQUFRLENBQUNXLGVBQWUsQ0FBQyxDQUFDVixPQUFPLENBQUNZLENBQUMsSUFBSTtJQUNqRCxNQUFNQyxHQUFHLEdBQUd0TixPQUFPLENBQUNtTixlQUFlLENBQUNFLENBQUMsQ0FBQztJQUN0QyxJQUFJLENBQUNDLEdBQUcsRUFBRTtNQUNSdE4sT0FBTyxDQUFDbU4sZUFBZSxDQUFDRSxDQUFDLENBQUMsR0FBR2IsaUJBQVEsQ0FBQ1csZUFBZSxDQUFDRSxDQUFDLENBQUM7SUFDMUQsQ0FBQyxNQUFNO01BQ0xuTSxNQUFNLENBQUNxTCxJQUFJLENBQUNDLGlCQUFRLENBQUNXLGVBQWUsQ0FBQ0UsQ0FBQyxDQUFDLENBQUMsQ0FBQ1osT0FBTyxDQUFDYyxDQUFDLElBQUk7UUFDcEQsTUFBTUMsR0FBRyxHQUFHLElBQUlOLEdBQUcsQ0FBQyxDQUNsQixJQUFJbE4sT0FBTyxDQUFDbU4sZUFBZSxDQUFDRSxDQUFDLENBQUMsQ0FBQ0UsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLEVBQ3hDLEdBQUdmLGlCQUFRLENBQUNXLGVBQWUsQ0FBQ0UsQ0FBQyxDQUFDLENBQUNFLENBQUMsQ0FBQyxDQUNsQyxDQUFDO1FBQ0Z2TixPQUFPLENBQUNtTixlQUFlLENBQUNFLENBQUMsQ0FBQyxDQUFDRSxDQUFDLENBQUMsR0FBR2pILEtBQUssQ0FBQzJHLElBQUksQ0FBQ08sR0FBRyxDQUFDO01BQ2pELENBQUMsQ0FBQztJQUNKO0VBQ0YsQ0FBQyxDQUFDO0FBQ0o7O0FBRUE7QUFDQTtBQUNBLFNBQVMvQyxrQkFBa0IsQ0FBQ0UsV0FBVyxFQUFFO0VBQ3ZDLE1BQU1uRyxNQUFNLEdBQUdtRyxXQUFXLENBQUNuRyxNQUFNO0VBQ2pDLE1BQU1pSixPQUFPLEdBQUcsQ0FBQyxDQUFDO0VBQ2xCO0FBQ0Y7RUFDRWpKLE1BQU0sQ0FBQ3VDLEVBQUUsQ0FBQyxZQUFZLEVBQUUyRyxNQUFNLElBQUk7SUFDaEMsTUFBTUMsUUFBUSxHQUFHRCxNQUFNLENBQUNFLGFBQWEsR0FBRyxHQUFHLEdBQUdGLE1BQU0sQ0FBQ0csVUFBVTtJQUMvREosT0FBTyxDQUFDRSxRQUFRLENBQUMsR0FBR0QsTUFBTTtJQUMxQkEsTUFBTSxDQUFDM0csRUFBRSxDQUFDLE9BQU8sRUFBRSxNQUFNO01BQ3ZCLE9BQU8wRyxPQUFPLENBQUNFLFFBQVEsQ0FBQztJQUMxQixDQUFDLENBQUM7RUFDSixDQUFDLENBQUM7RUFFRixNQUFNRyx1QkFBdUIsR0FBRyxZQUFZO0lBQzFDLEtBQUssTUFBTUgsUUFBUSxJQUFJRixPQUFPLEVBQUU7TUFDOUIsSUFBSTtRQUNGQSxPQUFPLENBQUNFLFFBQVEsQ0FBQyxDQUFDSSxPQUFPLEVBQUU7TUFDN0IsQ0FBQyxDQUFDLE9BQU81TCxDQUFDLEVBQUU7UUFDVjtNQUFBO0lBRUo7RUFDRixDQUFDO0VBRUQsTUFBTTZCLGNBQWMsR0FBRyxZQUFZO0lBQ2pDZixPQUFPLENBQUMrSyxNQUFNLENBQUM5RyxLQUFLLENBQUMsNkNBQTZDLENBQUM7SUFDbkU0Ryx1QkFBdUIsRUFBRTtJQUN6QnRKLE1BQU0sQ0FBQ0MsS0FBSyxFQUFFO0lBQ2RrRyxXQUFXLENBQUMzRyxjQUFjLEVBQUU7RUFDOUIsQ0FBQztFQUNEZixPQUFPLENBQUM4RCxFQUFFLENBQUMsU0FBUyxFQUFFL0MsY0FBYyxDQUFDO0VBQ3JDZixPQUFPLENBQUM4RCxFQUFFLENBQUMsUUFBUSxFQUFFL0MsY0FBYyxDQUFDO0FBQ3RDO0FBQUMsZUFFY2xFLFdBQVc7QUFBQSJ9