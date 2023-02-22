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
addParseCloud(); // ParseServer works like a constructor of an express app.
// https://parseplatform.org/parse-server/api/master/ParseServerOptions.html

class ParseServer {
  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options) {
    // Scan for deprecated Parse Server options
    _Deprecator.default.scanParseServerOptions(options); // Set option defaults


    injectDefaults(options);
    const {
      appId = (0, _requiredParameter.default)('You must provide an appId!'),
      masterKey = (0, _requiredParameter.default)('You must provide a masterKey!'),
      cloud,
      security,
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!'),
      serverStartComplete,
      schema
    } = options; // Initialize the node client SDK automatically

    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    const allControllers = controllers.getControllers(options);
    const {
      loggerController,
      databaseController,
      hooksController
    } = allControllers;
    this.config = _Config.default.put(Object.assign({}, options, allControllers));
    logging.setLogger(loggerController); // Note: Tests will start to fail if any validation happens after this is called.

    databaseController.performInitialization().then(() => hooksController.load()).then(async () => {
      if (schema) {
        await new _DefinedSchemas.DefinedSchemas(schema, this.config).execute();
      }

      if (serverStartComplete) {
        serverStartComplete();
      }
    }).catch(error => {
      if (serverStartComplete) {
        serverStartComplete(error);
      } else {
        console.error(error);
        process.exit(1);
      }
    });

    if (cloud) {
      addParseCloud();

      if (typeof cloud === 'function') {
        cloud(Parse);
      } else if (typeof cloud === 'string') {
        require(path.resolve(process.cwd(), cloud));
      } else {
        throw "argument 'cloud' must either be a string or a function";
      }
    }

    if (security && security.enableCheck && security.enableCheckLog) {
      new _CheckRunner.default(options.security).run();
    }
  }

  get app() {
    if (!this._app) {
      this._app = ParseServer.app(this.config);
    }

    return this._app;
  }

  handleShutdown() {
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

    return (promises.length > 0 ? Promise.all(promises) : Promise.resolve()).then(() => {
      if (this.config.serverCloseComplete) {
        this.config.serverCloseComplete();
      }
    });
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
      pages
    } = options; // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.

    var api = express(); //api.use("/apps", express.static(__dirname + "/public"));

    api.use(middlewares.allowCrossDomain(appId)); // File handling needs to be before default middlewares are applied

    api.use('/', new _FilesRouter.FilesRouter().expressRouter({
      maxUploadSize: maxUploadSize
    }));
    api.use('/health', function (req, res) {
      res.json({
        status: 'ok'
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

    if (options.requestContextMiddleware) {
      let requestContextMiddleware;

      if (typeof options.requestContextMiddleware == 'string') {
        requestContextMiddleware = require(path.resolve(process.cwd(), options.requestContextMiddleware));
      } else {
        requestContextMiddleware = options.requestContextMiddleware; // use as-is let express fail
      }

      api.use(requestContextMiddleware);
    }

    const appRouter = ParseServer.promiseRouter({
      appId
    });
    api.use(appRouter.expressRouter());
    api.use(middlewares.handleParseErrors); // run the following when not testing

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
   * @param {Function} callback called when the server has started
   * @returns {ParseServer} the parse server instance
   */


  start(options, callback) {
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

    const server = app.listen(options.port, options.host, (...args) => {
      ParseServer.verifyServerUrl();
      if (callback) callback(...args);
    });
    this.server = server;

    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions, options);
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
   * @param {Function} callback called when the server has started
   * @returns {ParseServer} the parse server instance
   */


  static start(options, callback) {
    const parseServer = new ParseServer(options);
    return parseServer.start(options, callback);
  }
  /**
   * Helper method to create a liveQuery server
   * @static
   * @param {Server} httpServer an optional http server to pass
   * @param {LiveQueryServerOptions} config options for the liveQueryServer
   * @param {ParseServerOptions} options options for the ParseServer
   * @returns {ParseLiveQueryServer} the live query server instance
   */


  static createLiveQueryServer(httpServer, config, options) {
    if (!httpServer || config && config.port) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }

    return new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config, options);
  }

  static verifyServerUrl(callback) {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
      const request = require('./request');

      request({
        url: Parse.serverURL.replace(/\/$/, '') + '/health'
      }).catch(response => response).then(response => {
        const json = response.data || null;

        if (response.status !== 200 || !json || json && json.status !== 'ok') {
          /* eslint-disable no-console */
          console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}'.` + ` Cloud code and push notifications may be unavailable!\n`);
          /* eslint-enable no-console */

          if (callback) {
            callback(false);
          }
        } else {
          if (callback) {
            callback(true);
          }
        }
      });
    }
  }

}

function addParseCloud() {
  const ParseCloud = require('./cloud-code/Parse.Cloud');

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
  } // Reserved Characters


  if (options.appId) {
    const regex = /[!#$%'()*+&/:;=?@[\]{}^,|<>]/g;

    if (options.appId.match(regex)) {
      console.warn(`\nWARNING, appId that contains special characters can cause issues while using with urls.\n`);
    }
  } // Backwards compatibility


  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING && console.warn(`\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`);
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(new Set([...(_defaults.default.userSensitiveFields || []), ...(options.userSensitiveFields || [])])); // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.

    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({
        _User: []
      }, options.protectedFields);
    }

    options.protectedFields['_User']['*'] = Array.from(new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields]));
  } // Merge protectedFields options with defaults.


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
  options.masterKeyIps = Array.from(new Set(options.masterKeyIps.concat(_defaults.default.masterKeyIps, options.masterKeyIps)));
} // Those can't be tested as it requires a subprocess

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci5qcyJdLCJuYW1lcyI6WyJiYXRjaCIsInJlcXVpcmUiLCJib2R5UGFyc2VyIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXJzZSIsInBhdGgiLCJmcyIsImFkZFBhcnNlQ2xvdWQiLCJQYXJzZVNlcnZlciIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsIkRlcHJlY2F0b3IiLCJzY2FuUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaW5qZWN0RGVmYXVsdHMiLCJhcHBJZCIsIm1hc3RlcktleSIsImNsb3VkIiwic2VjdXJpdHkiLCJqYXZhc2NyaXB0S2V5Iiwic2VydmVyVVJMIiwic2VydmVyU3RhcnRDb21wbGV0ZSIsInNjaGVtYSIsImluaXRpYWxpemUiLCJhbGxDb250cm9sbGVycyIsImNvbnRyb2xsZXJzIiwiZ2V0Q29udHJvbGxlcnMiLCJsb2dnZXJDb250cm9sbGVyIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiaG9va3NDb250cm9sbGVyIiwiY29uZmlnIiwiQ29uZmlnIiwicHV0IiwiT2JqZWN0IiwiYXNzaWduIiwibG9nZ2luZyIsInNldExvZ2dlciIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsInRoZW4iLCJsb2FkIiwiRGVmaW5lZFNjaGVtYXMiLCJleGVjdXRlIiwiY2F0Y2giLCJlcnJvciIsImNvbnNvbGUiLCJwcm9jZXNzIiwiZXhpdCIsInJlc29sdmUiLCJjd2QiLCJlbmFibGVDaGVjayIsImVuYWJsZUNoZWNrTG9nIiwiQ2hlY2tSdW5uZXIiLCJydW4iLCJhcHAiLCJfYXBwIiwiaGFuZGxlU2h1dGRvd24iLCJwcm9taXNlcyIsImFkYXB0ZXIiLCJkYXRhYmFzZUFkYXB0ZXIiLCJwdXNoIiwiZmlsZUFkYXB0ZXIiLCJmaWxlc0NvbnRyb2xsZXIiLCJjYWNoZUFkYXB0ZXIiLCJjYWNoZUNvbnRyb2xsZXIiLCJsZW5ndGgiLCJQcm9taXNlIiwiYWxsIiwic2VydmVyQ2xvc2VDb21wbGV0ZSIsIm1heFVwbG9hZFNpemUiLCJkaXJlY3RBY2Nlc3MiLCJwYWdlcyIsImFwaSIsInVzZSIsImFsbG93Q3Jvc3NEb21haW4iLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJyZXEiLCJyZXMiLCJqc29uIiwic3RhdHVzIiwidXJsZW5jb2RlZCIsImV4dGVuZGVkIiwiZW5hYmxlUm91dGVyIiwiUGFnZXNSb3V0ZXIiLCJQdWJsaWNBUElSb3V0ZXIiLCJ0eXBlIiwibGltaXQiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwicmVxdWVzdENvbnRleHRNaWRkbGV3YXJlIiwiYXBwUm91dGVyIiwicHJvbWlzZVJvdXRlciIsImhhbmRsZVBhcnNlRXJyb3JzIiwiZW52IiwiVEVTVElORyIsIm9uIiwiZXJyIiwiY29kZSIsInN0ZGVyciIsIndyaXRlIiwicG9ydCIsIlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MiLCJDb3JlTWFuYWdlciIsInNldFJFU1RDb250cm9sbGVyIiwicm91dGVycyIsIkNsYXNzZXNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsIlNlc3Npb25zUm91dGVyIiwiUm9sZXNSb3V0ZXIiLCJBbmFseXRpY3NSb3V0ZXIiLCJJbnN0YWxsYXRpb25zUm91dGVyIiwiRnVuY3Rpb25zUm91dGVyIiwiU2NoZW1hc1JvdXRlciIsIlB1c2hSb3V0ZXIiLCJMb2dzUm91dGVyIiwiSUFQVmFsaWRhdGlvblJvdXRlciIsIkZlYXR1cmVzUm91dGVyIiwiR2xvYmFsQ29uZmlnUm91dGVyIiwiR3JhcGhRTFJvdXRlciIsIlB1cmdlUm91dGVyIiwiSG9va3NSb3V0ZXIiLCJDbG91ZENvZGVSb3V0ZXIiLCJBdWRpZW5jZXNSb3V0ZXIiLCJBZ2dyZWdhdGVSb3V0ZXIiLCJTZWN1cml0eVJvdXRlciIsInJvdXRlcyIsInJlZHVjZSIsIm1lbW8iLCJyb3V0ZXIiLCJjb25jYXQiLCJQcm9taXNlUm91dGVyIiwibW91bnRPbnRvIiwic3RhcnQiLCJjYWxsYmFjayIsIm1pZGRsZXdhcmUiLCJtb3VudFBhdGgiLCJtb3VudEdyYXBoUUwiLCJtb3VudFBsYXlncm91bmQiLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJ1bmRlZmluZWQiLCJncmFwaFFMU2NoZW1hIiwicmVhZEZpbGVTeW5jIiwicGFyc2VHcmFwaFFMU2VydmVyIiwiUGFyc2VHcmFwaFFMU2VydmVyIiwiZ3JhcGhRTFBhdGgiLCJwbGF5Z3JvdW5kUGF0aCIsImFwcGx5R3JhcGhRTCIsImFwcGx5UGxheWdyb3VuZCIsInNlcnZlciIsImxpc3RlbiIsImhvc3QiLCJhcmdzIiwidmVyaWZ5U2VydmVyVXJsIiwic3RhcnRMaXZlUXVlcnlTZXJ2ZXIiLCJsaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIiwibGl2ZVF1ZXJ5U2VydmVyIiwiY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyIiwiY29uZmlndXJlTGlzdGVuZXJzIiwiZXhwcmVzc0FwcCIsInBhcnNlU2VydmVyIiwiaHR0cFNlcnZlciIsImNyZWF0ZVNlcnZlciIsIlBhcnNlTGl2ZVF1ZXJ5U2VydmVyIiwicmVxdWVzdCIsInVybCIsInJlcGxhY2UiLCJyZXNwb25zZSIsImRhdGEiLCJ3YXJuIiwiUGFyc2VDbG91ZCIsIkNsb3VkIiwiZ2xvYmFsIiwia2V5cyIsImRlZmF1bHRzIiwiZm9yRWFjaCIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInJlZ2V4IiwibWF0Y2giLCJ1c2VyU2Vuc2l0aXZlRmllbGRzIiwiQXJyYXkiLCJmcm9tIiwiU2V0IiwicHJvdGVjdGVkRmllbGRzIiwiX1VzZXIiLCJjIiwiY3VyIiwiciIsInVucSIsIm1hc3RlcktleUlwcyIsInNvY2tldHMiLCJzb2NrZXQiLCJzb2NrZXRJZCIsInJlbW90ZUFkZHJlc3MiLCJyZW1vdGVQb3J0IiwiZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMiLCJkZXN0cm95IiwiZSIsInN0ZG91dCIsImNsb3NlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBV0E7O0FBQ0E7O0FBQ0E7O0FB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QUFDMkosTUFBUixDQUFlckcsS0FBZixDQUFxQiw2Q0FBckI7QUFDQWtHLElBQUFBLHVCQUF1QjtBQUN2QmpELElBQUFBLE1BQU0sQ0FBQ3FELEtBQVA7QUFDQTFDLElBQUFBLFdBQVcsQ0FBQ3hHLGNBQVo7QUFDRCxHQUxEOztBQU1BVixFQUFBQSxPQUFPLENBQUNrRCxFQUFSLENBQVcsU0FBWCxFQUFzQnhDLGNBQXRCO0FBQ0FWLEVBQUFBLE9BQU8sQ0FBQ2tELEVBQVIsQ0FBVyxRQUFYLEVBQXFCeEMsY0FBckI7QUFDRDs7ZUFFYzlDLFciLCJzb3VyY2VzQ29udGVudCI6WyIvLyBQYXJzZVNlcnZlciAtIG9wZW4tc291cmNlIGNvbXBhdGlibGUgQVBJIFNlcnZlciBmb3IgUGFyc2UgYXBwc1xuXG52YXIgYmF0Y2ggPSByZXF1aXJlKCcuL2JhdGNoJyksXG4gIGJvZHlQYXJzZXIgPSByZXF1aXJlKCdib2R5LXBhcnNlcicpLFxuICBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpLFxuICBtaWRkbGV3YXJlcyA9IHJlcXVpcmUoJy4vbWlkZGxld2FyZXMnKSxcbiAgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2UsXG4gIHsgcGFyc2UgfSA9IHJlcXVpcmUoJ2dyYXBocWwnKSxcbiAgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKSxcbiAgZnMgPSByZXF1aXJlKCdmcycpO1xuXG5pbXBvcnQgeyBQYXJzZVNlcnZlck9wdGlvbnMsIExpdmVRdWVyeVNlcnZlck9wdGlvbnMgfSBmcm9tICcuL09wdGlvbnMnO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4vZGVmYXVsdHMnO1xuaW1wb3J0ICogYXMgbG9nZ2luZyBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4vQ29uZmlnJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgeyBBbmFseXRpY3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQW5hbHl0aWNzUm91dGVyJztcbmltcG9ydCB7IENsYXNzZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgeyBGZWF0dXJlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GZWF0dXJlc1JvdXRlcic7XG5pbXBvcnQgeyBGaWxlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GaWxlc1JvdXRlcic7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRnVuY3Rpb25zUm91dGVyJztcbmltcG9ydCB7IEdsb2JhbENvbmZpZ1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9HbG9iYWxDb25maWdSb3V0ZXInO1xuaW1wb3J0IHsgR3JhcGhRTFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9HcmFwaFFMUm91dGVyJztcbmltcG9ydCB7IEhvb2tzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0hvb2tzUm91dGVyJztcbmltcG9ydCB7IElBUFZhbGlkYXRpb25Sb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSUFQVmFsaWRhdGlvblJvdXRlcic7XG5pbXBvcnQgeyBJbnN0YWxsYXRpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0luc3RhbGxhdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgTG9nc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Mb2dzUm91dGVyJztcbmltcG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH0gZnJvbSAnLi9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXInO1xuaW1wb3J0IHsgUGFnZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUGFnZXNSb3V0ZXInO1xuaW1wb3J0IHsgUHVibGljQVBJUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1YmxpY0FQSVJvdXRlcic7XG5pbXBvcnQgeyBQdXNoUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1c2hSb3V0ZXInO1xuaW1wb3J0IHsgQ2xvdWRDb2RlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0Nsb3VkQ29kZVJvdXRlcic7XG5pbXBvcnQgeyBSb2xlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Sb2xlc1JvdXRlcic7XG5pbXBvcnQgeyBTY2hlbWFzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1NjaGVtYXNSb3V0ZXInO1xuaW1wb3J0IHsgU2Vzc2lvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2Vzc2lvbnNSb3V0ZXInO1xuaW1wb3J0IHsgVXNlcnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0IHsgUHVyZ2VSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVyZ2VSb3V0ZXInO1xuaW1wb3J0IHsgQXVkaWVuY2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0F1ZGllbmNlc1JvdXRlcic7XG5pbXBvcnQgeyBBZ2dyZWdhdGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQWdncmVnYXRlUm91dGVyJztcbmltcG9ydCB7IFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIgfSBmcm9tICcuL1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXInO1xuaW1wb3J0ICogYXMgY29udHJvbGxlcnMgZnJvbSAnLi9Db250cm9sbGVycyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxTZXJ2ZXIgfSBmcm9tICcuL0dyYXBoUUwvUGFyc2VHcmFwaFFMU2VydmVyJztcbmltcG9ydCB7IFNlY3VyaXR5Um91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1NlY3VyaXR5Um91dGVyJztcbmltcG9ydCBDaGVja1J1bm5lciBmcm9tICcuL1NlY3VyaXR5L0NoZWNrUnVubmVyJztcbmltcG9ydCBEZXByZWNhdG9yIGZyb20gJy4vRGVwcmVjYXRvci9EZXByZWNhdG9yJztcbmltcG9ydCB7IERlZmluZWRTY2hlbWFzIH0gZnJvbSAnLi9TY2hlbWFNaWdyYXRpb25zL0RlZmluZWRTY2hlbWFzJztcblxuLy8gTXV0YXRlIHRoZSBQYXJzZSBvYmplY3QgdG8gYWRkIHRoZSBDbG91ZCBDb2RlIGhhbmRsZXJzXG5hZGRQYXJzZUNsb3VkKCk7XG5cbi8vIFBhcnNlU2VydmVyIHdvcmtzIGxpa2UgYSBjb25zdHJ1Y3RvciBvZiBhbiBleHByZXNzIGFwcC5cbi8vIGh0dHBzOi8vcGFyc2VwbGF0Zm9ybS5vcmcvcGFyc2Utc2VydmVyL2FwaS9tYXN0ZXIvUGFyc2VTZXJ2ZXJPcHRpb25zLmh0bWxcbmNsYXNzIFBhcnNlU2VydmVyIHtcbiAgLyoqXG4gICAqIEBjb25zdHJ1Y3RvclxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB0aGUgcGFyc2Ugc2VydmVyIGluaXRpYWxpemF0aW9uIG9wdGlvbnNcbiAgICovXG4gIGNvbnN0cnVjdG9yKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIC8vIFNjYW4gZm9yIGRlcHJlY2F0ZWQgUGFyc2UgU2VydmVyIG9wdGlvbnNcbiAgICBEZXByZWNhdG9yLnNjYW5QYXJzZVNlcnZlck9wdGlvbnMob3B0aW9ucyk7XG4gICAgLy8gU2V0IG9wdGlvbiBkZWZhdWx0c1xuICAgIGluamVjdERlZmF1bHRzKG9wdGlvbnMpO1xuICAgIGNvbnN0IHtcbiAgICAgIGFwcElkID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYW4gYXBwSWQhJyksXG4gICAgICBtYXN0ZXJLZXkgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIG1hc3RlcktleSEnKSxcbiAgICAgIGNsb3VkLFxuICAgICAgc2VjdXJpdHksXG4gICAgICBqYXZhc2NyaXB0S2V5LFxuICAgICAgc2VydmVyVVJMID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBzZXJ2ZXJVUkwhJyksXG4gICAgICBzZXJ2ZXJTdGFydENvbXBsZXRlLFxuICAgICAgc2NoZW1hLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIC8vIEluaXRpYWxpemUgdGhlIG5vZGUgY2xpZW50IFNESyBhdXRvbWF0aWNhbGx5XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShhcHBJZCwgamF2YXNjcmlwdEtleSB8fCAndW51c2VkJywgbWFzdGVyS2V5KTtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG5cbiAgICBjb25zdCBhbGxDb250cm9sbGVycyA9IGNvbnRyb2xsZXJzLmdldENvbnRyb2xsZXJzKG9wdGlvbnMpO1xuXG4gICAgY29uc3QgeyBsb2dnZXJDb250cm9sbGVyLCBkYXRhYmFzZUNvbnRyb2xsZXIsIGhvb2tzQ29udHJvbGxlciB9ID0gYWxsQ29udHJvbGxlcnM7XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcucHV0KE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIGFsbENvbnRyb2xsZXJzKSk7XG5cbiAgICBsb2dnaW5nLnNldExvZ2dlcihsb2dnZXJDb250cm9sbGVyKTtcblxuICAgIC8vIE5vdGU6IFRlc3RzIHdpbGwgc3RhcnQgdG8gZmFpbCBpZiBhbnkgdmFsaWRhdGlvbiBoYXBwZW5zIGFmdGVyIHRoaXMgaXMgY2FsbGVkLlxuICAgIGRhdGFiYXNlQ29udHJvbGxlclxuICAgICAgLnBlcmZvcm1Jbml0aWFsaXphdGlvbigpXG4gICAgICAudGhlbigoKSA9PiBob29rc0NvbnRyb2xsZXIubG9hZCgpKVxuICAgICAgLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgICAgYXdhaXQgbmV3IERlZmluZWRTY2hlbWFzKHNjaGVtYSwgdGhpcy5jb25maWcpLmV4ZWN1dGUoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2VydmVyU3RhcnRDb21wbGV0ZSkge1xuICAgICAgICAgIHNlcnZlclN0YXJ0Q29tcGxldGUoKTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChzZXJ2ZXJTdGFydENvbXBsZXRlKSB7XG4gICAgICAgICAgc2VydmVyU3RhcnRDb21wbGV0ZShlcnJvcik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgIGlmIChjbG91ZCkge1xuICAgICAgYWRkUGFyc2VDbG91ZCgpO1xuICAgICAgaWYgKHR5cGVvZiBjbG91ZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjbG91ZChQYXJzZSk7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjbG91ZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgY2xvdWQpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IFwiYXJndW1lbnQgJ2Nsb3VkJyBtdXN0IGVpdGhlciBiZSBhIHN0cmluZyBvciBhIGZ1bmN0aW9uXCI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHNlY3VyaXR5ICYmIHNlY3VyaXR5LmVuYWJsZUNoZWNrICYmIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nKSB7XG4gICAgICBuZXcgQ2hlY2tSdW5uZXIob3B0aW9ucy5zZWN1cml0eSkucnVuKCk7XG4gICAgfVxuICB9XG5cbiAgZ2V0IGFwcCgpIHtcbiAgICBpZiAoIXRoaXMuX2FwcCkge1xuICAgICAgdGhpcy5fYXBwID0gUGFyc2VTZXJ2ZXIuYXBwKHRoaXMuY29uZmlnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2FwcDtcbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG4gICAgY29uc3QgeyBhZGFwdGVyOiBkYXRhYmFzZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlQ29udHJvbGxlcjtcbiAgICBpZiAoZGF0YWJhc2VBZGFwdGVyICYmIHR5cGVvZiBkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGZpbGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG4gICAgaWYgKGZpbGVBZGFwdGVyICYmIHR5cGVvZiBmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBjYWNoZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlcjtcbiAgICBpZiAoY2FjaGVBZGFwdGVyICYmIHR5cGVvZiBjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goY2FjaGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICByZXR1cm4gKHByb21pc2VzLmxlbmd0aCA+IDAgPyBQcm9taXNlLmFsbChwcm9taXNlcykgOiBQcm9taXNlLnJlc29sdmUoKSkudGhlbigoKSA9PiB7XG4gICAgICBpZiAodGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSkge1xuICAgICAgICB0aGlzLmNvbmZpZy5zZXJ2ZXJDbG9zZUNvbXBsZXRlKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBDcmVhdGUgYW4gZXhwcmVzcyBhcHAgZm9yIHRoZSBwYXJzZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgbGV0IHlvdSBzcGVjaWZ5IHRoZSBtYXhVcGxvYWRTaXplIHdoZW4gY3JlYXRpbmcgdGhlIGV4cHJlc3MgYXBwICAqL1xuICBzdGF0aWMgYXBwKG9wdGlvbnMpIHtcbiAgICBjb25zdCB7IG1heFVwbG9hZFNpemUgPSAnMjBtYicsIGFwcElkLCBkaXJlY3RBY2Nlc3MsIHBhZ2VzIH0gPSBvcHRpb25zO1xuICAgIC8vIFRoaXMgYXBwIHNlcnZlcyB0aGUgUGFyc2UgQVBJIGRpcmVjdGx5LlxuICAgIC8vIEl0J3MgdGhlIGVxdWl2YWxlbnQgb2YgaHR0cHM6Ly9hcGkucGFyc2UuY29tLzEgaW4gdGhlIGhvc3RlZCBQYXJzZSBBUEkuXG4gICAgdmFyIGFwaSA9IGV4cHJlc3MoKTtcbiAgICAvL2FwaS51c2UoXCIvYXBwc1wiLCBleHByZXNzLnN0YXRpYyhfX2Rpcm5hbWUgKyBcIi9wdWJsaWNcIikpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dDcm9zc0RvbWFpbihhcHBJZCkpO1xuICAgIC8vIEZpbGUgaGFuZGxpbmcgbmVlZHMgdG8gYmUgYmVmb3JlIGRlZmF1bHQgbWlkZGxld2FyZXMgYXJlIGFwcGxpZWRcbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgbmV3IEZpbGVzUm91dGVyKCkuZXhwcmVzc1JvdXRlcih7XG4gICAgICAgIG1heFVwbG9hZFNpemU6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhcGkudXNlKCcvaGVhbHRoJywgZnVuY3Rpb24gKHJlcSwgcmVzKSB7XG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHN0YXR1czogJ29rJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIGJvZHlQYXJzZXIudXJsZW5jb2RlZCh7IGV4dGVuZGVkOiBmYWxzZSB9KSxcbiAgICAgIHBhZ2VzLmVuYWJsZVJvdXRlclxuICAgICAgICA/IG5ldyBQYWdlc1JvdXRlcihwYWdlcykuZXhwcmVzc1JvdXRlcigpXG4gICAgICAgIDogbmV3IFB1YmxpY0FQSVJvdXRlcigpLmV4cHJlc3NSb3V0ZXIoKVxuICAgICk7XG5cbiAgICBhcGkudXNlKGJvZHlQYXJzZXIuanNvbih7IHR5cGU6ICcqLyonLCBsaW1pdDogbWF4VXBsb2FkU2l6ZSB9KSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd01ldGhvZE92ZXJyaWRlKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyk7XG4gICAgaWYgKG9wdGlvbnMucmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKSB7XG4gICAgICBsZXQgcmVxdWVzdENvbnRleHRNaWRkbGV3YXJlO1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLnJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSA9PSAnc3RyaW5nJykge1xuICAgICAgICByZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUgPSByZXF1aXJlKHBhdGgucmVzb2x2ZShcbiAgICAgICAgICBwcm9jZXNzLmN3ZCgpLFxuICAgICAgICAgIG9wdGlvbnMucmVxdWVzdENvbnRleHRNaWRkbGV3YXJlXG4gICAgICAgICkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVxdWVzdENvbnRleHRNaWRkbGV3YXJlID0gb3B0aW9ucy5yZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmU7IC8vIHVzZSBhcy1pcyBsZXQgZXhwcmVzcyBmYWlsXG4gICAgICB9XG4gICAgICBhcGkudXNlKHJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSk7XG4gICAgfVxuXG4gICAgY29uc3QgYXBwUm91dGVyID0gUGFyc2VTZXJ2ZXIucHJvbWlzZVJvdXRlcih7IGFwcElkIH0pO1xuICAgIGFwaS51c2UoYXBwUm91dGVyLmV4cHJlc3NSb3V0ZXIoKSk7XG5cbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlRXJyb3JzKTtcblxuICAgIC8vIHJ1biB0aGUgZm9sbG93aW5nIHdoZW4gbm90IHRlc3RpbmdcbiAgICBpZiAoIXByb2Nlc3MuZW52LlRFU1RJTkcpIHtcbiAgICAgIC8vVGhpcyBjYXVzZXMgdGVzdHMgdG8gc3BldyBzb21lIHVzZWxlc3Mgd2FybmluZ3MsIHNvIGRpc2FibGUgaW4gdGVzdFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSAnRUFERFJJTlVTRScpIHtcbiAgICAgICAgICAvLyB1c2VyLWZyaWVuZGx5IG1lc3NhZ2UgZm9yIHRoaXMgY29tbW9uIGVycm9yXG4gICAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoYFVuYWJsZSB0byBsaXN0ZW4gb24gcG9ydCAke2Vyci5wb3J0fS4gVGhlIHBvcnQgaXMgYWxyZWFkeSBpbiB1c2UuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIGlmIChwcm9jZXNzLmVudi5QQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTID09PSAnMScgfHwgZGlyZWN0QWNjZXNzKSB7XG4gICAgICBQYXJzZS5Db3JlTWFuYWdlci5zZXRSRVNUQ29udHJvbGxlcihQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyKGFwcElkLCBhcHBSb3V0ZXIpKTtcbiAgICB9XG4gICAgcmV0dXJuIGFwaTtcbiAgfVxuXG4gIHN0YXRpYyBwcm9taXNlUm91dGVyKHsgYXBwSWQgfSkge1xuICAgIGNvbnN0IHJvdXRlcnMgPSBbXG4gICAgICBuZXcgQ2xhc3Nlc1JvdXRlcigpLFxuICAgICAgbmV3IFVzZXJzUm91dGVyKCksXG4gICAgICBuZXcgU2Vzc2lvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBSb2xlc1JvdXRlcigpLFxuICAgICAgbmV3IEFuYWx5dGljc1JvdXRlcigpLFxuICAgICAgbmV3IEluc3RhbGxhdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBGdW5jdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTY2hlbWFzUm91dGVyKCksXG4gICAgICBuZXcgUHVzaFJvdXRlcigpLFxuICAgICAgbmV3IExvZ3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJQVBWYWxpZGF0aW9uUm91dGVyKCksXG4gICAgICBuZXcgRmVhdHVyZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBHbG9iYWxDb25maWdSb3V0ZXIoKSxcbiAgICAgIG5ldyBHcmFwaFFMUm91dGVyKCksXG4gICAgICBuZXcgUHVyZ2VSb3V0ZXIoKSxcbiAgICAgIG5ldyBIb29rc1JvdXRlcigpLFxuICAgICAgbmV3IENsb3VkQ29kZVJvdXRlcigpLFxuICAgICAgbmV3IEF1ZGllbmNlc1JvdXRlcigpLFxuICAgICAgbmV3IEFnZ3JlZ2F0ZVJvdXRlcigpLFxuICAgICAgbmV3IFNlY3VyaXR5Um91dGVyKCksXG4gICAgXTtcblxuICAgIGNvbnN0IHJvdXRlcyA9IHJvdXRlcnMucmVkdWNlKChtZW1vLCByb3V0ZXIpID0+IHtcbiAgICAgIHJldHVybiBtZW1vLmNvbmNhdChyb3V0ZXIucm91dGVzKTtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBuZXcgUHJvbWlzZVJvdXRlcihyb3V0ZXMsIGFwcElkKTtcblxuICAgIGJhdGNoLm1vdW50T250byhhcHBSb3V0ZXIpO1xuICAgIHJldHVybiBhcHBSb3V0ZXI7XG4gIH1cblxuICAvKipcbiAgICogc3RhcnRzIHRoZSBwYXJzZSBzZXJ2ZXIncyBleHByZXNzIGFwcFxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB0byB1c2UgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIGhhcyBzdGFydGVkXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhcnQob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zLCBjYWxsYmFjazogPygpID0+IHZvaWQpIHtcbiAgICBjb25zdCBhcHAgPSBleHByZXNzKCk7XG4gICAgaWYgKG9wdGlvbnMubWlkZGxld2FyZSkge1xuICAgICAgbGV0IG1pZGRsZXdhcmU7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMubWlkZGxld2FyZSA9PSAnc3RyaW5nJykge1xuICAgICAgICBtaWRkbGV3YXJlID0gcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgb3B0aW9ucy5taWRkbGV3YXJlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtaWRkbGV3YXJlID0gb3B0aW9ucy5taWRkbGV3YXJlOyAvLyB1c2UgYXMtaXMgbGV0IGV4cHJlc3MgZmFpbFxuICAgICAgfVxuICAgICAgYXBwLnVzZShtaWRkbGV3YXJlKTtcbiAgICB9XG5cbiAgICBhcHAudXNlKG9wdGlvbnMubW91bnRQYXRoLCB0aGlzLmFwcCk7XG5cbiAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwgPT09IHRydWUgfHwgb3B0aW9ucy5tb3VudFBsYXlncm91bmQgPT09IHRydWUpIHtcbiAgICAgIGxldCBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSB1bmRlZmluZWQ7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gcGFyc2UoZnMucmVhZEZpbGVTeW5jKG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSwgJ3V0ZjgnKSk7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnb2JqZWN0JyB8fFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gb3B0aW9ucy5ncmFwaFFMU2NoZW1hO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwYXJzZUdyYXBoUUxTZXJ2ZXIgPSBuZXcgUGFyc2VHcmFwaFFMU2VydmVyKHRoaXMsIHtcbiAgICAgICAgZ3JhcGhRTFBhdGg6IG9wdGlvbnMuZ3JhcGhRTFBhdGgsXG4gICAgICAgIHBsYXlncm91bmRQYXRoOiBvcHRpb25zLnBsYXlncm91bmRQYXRoLFxuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICB9KTtcblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseUdyYXBoUUwoYXBwKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseVBsYXlncm91bmQoYXBwKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBzZXJ2ZXIgPSBhcHAubGlzdGVuKG9wdGlvbnMucG9ydCwgb3B0aW9ucy5ob3N0LCAoLi4uYXJncykgPT4ge1xuICAgICAgUGFyc2VTZXJ2ZXIudmVyaWZ5U2VydmVyVXJsKCk7XG4gICAgICBpZiAoY2FsbGJhY2spIGNhbGxiYWNrKC4uLmFyZ3MpO1xuICAgIH0pO1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuXG4gICAgaWYgKG9wdGlvbnMuc3RhcnRMaXZlUXVlcnlTZXJ2ZXIgfHwgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zKSB7XG4gICAgICB0aGlzLmxpdmVRdWVyeVNlcnZlciA9IFBhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICAgICAgc2VydmVyLFxuICAgICAgICBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnMsXG4gICAgICAgIG9wdGlvbnNcbiAgICAgICk7XG4gICAgfVxuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICBjb25maWd1cmVMaXN0ZW5lcnModGhpcyk7XG4gICAgfVxuICAgIHRoaXMuZXhwcmVzc0FwcCA9IGFwcDtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFBhcnNlU2VydmVyIGFuZCBzdGFydHMgaXQuXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHVzZWQgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIGhhcyBzdGFydGVkXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIHN0YXJ0KG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucywgY2FsbGJhY2s6ID8oKSA9PiB2b2lkKSB7XG4gICAgY29uc3QgcGFyc2VTZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gICAgcmV0dXJuIHBhcnNlU2VydmVyLnN0YXJ0KG9wdGlvbnMsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIZWxwZXIgbWV0aG9kIHRvIGNyZWF0ZSBhIGxpdmVRdWVyeSBzZXJ2ZXJcbiAgICogQHN0YXRpY1xuICAgKiBAcGFyYW0ge1NlcnZlcn0gaHR0cFNlcnZlciBhbiBvcHRpb25hbCBodHRwIHNlcnZlciB0byBwYXNzXG4gICAqIEBwYXJhbSB7TGl2ZVF1ZXJ5U2VydmVyT3B0aW9uc30gY29uZmlnIG9wdGlvbnMgZm9yIHRoZSBsaXZlUXVlcnlTZXJ2ZXJcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgb3B0aW9ucyBmb3IgdGhlIFBhcnNlU2VydmVyXG4gICAqIEByZXR1cm5zIHtQYXJzZUxpdmVRdWVyeVNlcnZlcn0gdGhlIGxpdmUgcXVlcnkgc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGF0aWMgY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyKFxuICAgIGh0dHBTZXJ2ZXIsXG4gICAgY29uZmlnOiBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zLFxuICAgIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9uc1xuICApIHtcbiAgICBpZiAoIWh0dHBTZXJ2ZXIgfHwgKGNvbmZpZyAmJiBjb25maWcucG9ydCkpIHtcbiAgICAgIHZhciBhcHAgPSBleHByZXNzKCk7XG4gICAgICBodHRwU2VydmVyID0gcmVxdWlyZSgnaHR0cCcpLmNyZWF0ZVNlcnZlcihhcHApO1xuICAgICAgaHR0cFNlcnZlci5saXN0ZW4oY29uZmlnLnBvcnQpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyKGh0dHBTZXJ2ZXIsIGNvbmZpZywgb3B0aW9ucyk7XG4gIH1cblxuICBzdGF0aWMgdmVyaWZ5U2VydmVyVXJsKGNhbGxiYWNrKSB7XG4gICAgLy8gcGVyZm9ybSBhIGhlYWx0aCBjaGVjayBvbiB0aGUgc2VydmVyVVJMIHZhbHVlXG4gICAgaWYgKFBhcnNlLnNlcnZlclVSTCkge1xuICAgICAgY29uc3QgcmVxdWVzdCA9IHJlcXVpcmUoJy4vcmVxdWVzdCcpO1xuICAgICAgcmVxdWVzdCh7IHVybDogUGFyc2Uuc2VydmVyVVJMLnJlcGxhY2UoL1xcLyQvLCAnJykgKyAnL2hlYWx0aCcgfSlcbiAgICAgICAgLmNhdGNoKHJlc3BvbnNlID0+IHJlc3BvbnNlKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgY29uc3QganNvbiA9IHJlc3BvbnNlLmRhdGEgfHwgbnVsbDtcbiAgICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSAyMDAgfHwgIWpzb24gfHwgKGpzb24gJiYganNvbi5zdGF0dXMgIT09ICdvaycpKSB7XG4gICAgICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9Jy5gICtcbiAgICAgICAgICAgICAgYCBDbG91ZCBjb2RlIGFuZCBwdXNoIG5vdGlmaWNhdGlvbnMgbWF5IGJlIHVuYXZhaWxhYmxlIVxcbmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICBjYWxsYmFjayhmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICBjYWxsYmFjayh0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRQYXJzZUNsb3VkKCkge1xuICBjb25zdCBQYXJzZUNsb3VkID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkJyk7XG4gIE9iamVjdC5hc3NpZ24oUGFyc2UuQ2xvdWQsIFBhcnNlQ2xvdWQpO1xuICBnbG9iYWwuUGFyc2UgPSBQYXJzZTtcbn1cblxuZnVuY3Rpb24gaW5qZWN0RGVmYXVsdHMob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywga2V5KSkge1xuICAgICAgb3B0aW9uc1trZXldID0gZGVmYXVsdHNba2V5XTtcbiAgICB9XG4gIH0pO1xuXG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsICdzZXJ2ZXJVUkwnKSkge1xuICAgIG9wdGlvbnMuc2VydmVyVVJMID0gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtvcHRpb25zLnBvcnR9JHtvcHRpb25zLm1vdW50UGF0aH1gO1xuICB9XG5cbiAgLy8gUmVzZXJ2ZWQgQ2hhcmFjdGVyc1xuICBpZiAob3B0aW9ucy5hcHBJZCkge1xuICAgIGNvbnN0IHJlZ2V4ID0gL1shIyQlJygpKismLzo7PT9AW1xcXXt9Xix8PD5dL2c7XG4gICAgaWYgKG9wdGlvbnMuYXBwSWQubWF0Y2gocmVnZXgpKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5XQVJOSU5HLCBhcHBJZCB0aGF0IGNvbnRhaW5zIHNwZWNpYWwgY2hhcmFjdGVycyBjYW4gY2F1c2UgaXNzdWVzIHdoaWxlIHVzaW5nIHdpdGggdXJscy5cXG5gXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGlmIChvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMpIHtcbiAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgIXByb2Nlc3MuZW52LlRFU1RJTkcgJiZcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbkRFUFJFQ0FURUQ6IHVzZXJTZW5zaXRpdmVGaWVsZHMgaGFzIGJlZW4gcmVwbGFjZWQgYnkgcHJvdGVjdGVkRmllbGRzIGFsbG93aW5nIHRoZSBhYmlsaXR5IHRvIHByb3RlY3QgZmllbGRzIGluIGFsbCBjbGFzc2VzIHdpdGggQ0xQLiBcXG5gXG4gICAgICApO1xuICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuXG4gICAgY29uc3QgdXNlclNlbnNpdGl2ZUZpZWxkcyA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFsuLi4oZGVmYXVsdHMudXNlclNlbnNpdGl2ZUZpZWxkcyB8fCBbXSksIC4uLihvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pXSlcbiAgICApO1xuXG4gICAgLy8gSWYgdGhlIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzIGlzIHVuc2V0LFxuICAgIC8vIGl0J2xsIGJlIGFzc2lnbmVkIHRoZSBkZWZhdWx0IGFib3ZlLlxuICAgIC8vIEhlcmUsIHByb3RlY3QgYWdhaW5zdCB0aGUgY2FzZSB3aGVyZSBwcm90ZWN0ZWRGaWVsZHNcbiAgICAvLyBpcyBzZXQsIGJ1dCBkb2Vzbid0IGhhdmUgX1VzZXIuXG4gICAgaWYgKCEoJ19Vc2VyJyBpbiBvcHRpb25zLnByb3RlY3RlZEZpZWxkcykpIHtcbiAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzID0gT2JqZWN0LmFzc2lnbih7IF9Vc2VyOiBbXSB9LCBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgfVxuXG4gICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbJ19Vc2VyJ11bJyonXSA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFsuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbJ19Vc2VyJ11bJyonXSB8fCBbXSksIC4uLnVzZXJTZW5zaXRpdmVGaWVsZHNdKVxuICAgICk7XG4gIH1cblxuICAvLyBNZXJnZSBwcm90ZWN0ZWRGaWVsZHMgb3B0aW9ucyB3aXRoIGRlZmF1bHRzLlxuICBPYmplY3Qua2V5cyhkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHMpLmZvckVhY2goYyA9PiB7XG4gICAgY29uc3QgY3VyID0gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgaWYgKCFjdXIpIHtcbiAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdID0gZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIH0gZWxzZSB7XG4gICAgICBPYmplY3Qua2V5cyhkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY10pLmZvckVhY2gociA9PiB7XG4gICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgIC4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSB8fCBbXSksXG4gICAgICAgICAgLi4uZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdW3JdLFxuICAgICAgICBdKTtcbiAgICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gPSBBcnJheS5mcm9tKHVucSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIG9wdGlvbnMubWFzdGVyS2V5SXBzID0gQXJyYXkuZnJvbShcbiAgICBuZXcgU2V0KG9wdGlvbnMubWFzdGVyS2V5SXBzLmNvbmNhdChkZWZhdWx0cy5tYXN0ZXJLZXlJcHMsIG9wdGlvbnMubWFzdGVyS2V5SXBzKSlcbiAgKTtcbn1cblxuLy8gVGhvc2UgY2FuJ3QgYmUgdGVzdGVkIGFzIGl0IHJlcXVpcmVzIGEgc3VicHJvY2Vzc1xuLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbmZ1bmN0aW9uIGNvbmZpZ3VyZUxpc3RlbmVycyhwYXJzZVNlcnZlcikge1xuICBjb25zdCBzZXJ2ZXIgPSBwYXJzZVNlcnZlci5zZXJ2ZXI7XG4gIGNvbnN0IHNvY2tldHMgPSB7fTtcbiAgLyogQ3VycmVudGx5LCBleHByZXNzIGRvZXNuJ3Qgc2h1dCBkb3duIGltbWVkaWF0ZWx5IGFmdGVyIHJlY2VpdmluZyBTSUdJTlQvU0lHVEVSTSBpZiBpdCBoYXMgY2xpZW50IGNvbm5lY3Rpb25zIHRoYXQgaGF2ZW4ndCB0aW1lZCBvdXQuIChUaGlzIGlzIGEga25vd24gaXNzdWUgd2l0aCBub2RlIC0gaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2lzc3Vlcy8yNjQyKVxuICAgIFRoaXMgZnVuY3Rpb24sIGFsb25nIHdpdGggYGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zKClgLCBpbnRlbmQgdG8gZml4IHRoaXMgYmVoYXZpb3Igc3VjaCB0aGF0IHBhcnNlIHNlcnZlciB3aWxsIGNsb3NlIGFsbCBvcGVuIGNvbm5lY3Rpb25zIGFuZCBpbml0aWF0ZSB0aGUgc2h1dGRvd24gcHJvY2VzcyBhcyBzb29uIGFzIGl0IHJlY2VpdmVzIGEgU0lHSU5UL1NJR1RFUk0gc2lnbmFsLiAqL1xuICBzZXJ2ZXIub24oJ2Nvbm5lY3Rpb24nLCBzb2NrZXQgPT4ge1xuICAgIGNvbnN0IHNvY2tldElkID0gc29ja2V0LnJlbW90ZUFkZHJlc3MgKyAnOicgKyBzb2NrZXQucmVtb3RlUG9ydDtcbiAgICBzb2NrZXRzW3NvY2tldElkXSA9IHNvY2tldDtcbiAgICBzb2NrZXQub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgZGVsZXRlIHNvY2tldHNbc29ja2V0SWRdO1xuICAgIH0pO1xuICB9KTtcblxuICBjb25zdCBkZXN0cm95QWxpdmVDb25uZWN0aW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgICBmb3IgKGNvbnN0IHNvY2tldElkIGluIHNvY2tldHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHNvY2tldHNbc29ja2V0SWRdLmRlc3Ryb3koKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLyogKi9cbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgY29uc3QgaGFuZGxlU2h1dGRvd24gPSBmdW5jdGlvbiAoKSB7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1Rlcm1pbmF0aW9uIHNpZ25hbCByZWNlaXZlZC4gU2h1dHRpbmcgZG93bi4nKTtcbiAgICBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpO1xuICAgIHNlcnZlci5jbG9zZSgpO1xuICAgIHBhcnNlU2VydmVyLmhhbmRsZVNodXRkb3duKCk7XG4gIH07XG4gIHByb2Nlc3Mub24oJ1NJR1RFUk0nLCBoYW5kbGVTaHV0ZG93bik7XG4gIHByb2Nlc3Mub24oJ1NJR0lOVCcsIGhhbmRsZVNodXRkb3duKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFyc2VTZXJ2ZXI7XG4iXX0=