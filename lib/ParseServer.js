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

var _DefinedSchemas = require("./DefinedSchemas");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
      beforeSchemasMigration,
      schemas
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
      if (beforeSchemasMigration) {
        await Promise.resolve(beforeSchemasMigration());
      }

      if (schemas) {
        await new _DefinedSchemas.DefinedSchemas(schemas, this.config).execute();
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
      }); // verify the server url after a 'mount' event is received

      /* istanbul ignore next */

      api.on('mount', function () {
        ParseServer.verifyServerUrl();
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

    const server = app.listen(options.port, options.host, callback);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci5qcyJdLCJuYW1lcyI6WyJiYXRjaCIsInJlcXVpcmUiLCJib2R5UGFyc2VyIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXJzZSIsInBhdGgiLCJmcyIsImFkZFBhcnNlQ2xvdWQiLCJQYXJzZVNlcnZlciIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsIkRlcHJlY2F0b3IiLCJzY2FuUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaW5qZWN0RGVmYXVsdHMiLCJhcHBJZCIsIm1hc3RlcktleSIsImNsb3VkIiwic2VjdXJpdHkiLCJqYXZhc2NyaXB0S2V5Iiwic2VydmVyVVJMIiwic2VydmVyU3RhcnRDb21wbGV0ZSIsImJlZm9yZVNjaGVtYXNNaWdyYXRpb24iLCJzY2hlbWFzIiwiaW5pdGlhbGl6ZSIsImFsbENvbnRyb2xsZXJzIiwiY29udHJvbGxlcnMiLCJnZXRDb250cm9sbGVycyIsImxvZ2dlckNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJob29rc0NvbnRyb2xsZXIiLCJjb25maWciLCJDb25maWciLCJwdXQiLCJPYmplY3QiLCJhc3NpZ24iLCJsb2dnaW5nIiwic2V0TG9nZ2VyIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwidGhlbiIsImxvYWQiLCJQcm9taXNlIiwicmVzb2x2ZSIsIkRlZmluZWRTY2hlbWFzIiwiZXhlY3V0ZSIsImNhdGNoIiwiZXJyb3IiLCJjb25zb2xlIiwicHJvY2VzcyIsImV4aXQiLCJjd2QiLCJlbmFibGVDaGVjayIsImVuYWJsZUNoZWNrTG9nIiwiQ2hlY2tSdW5uZXIiLCJydW4iLCJhcHAiLCJfYXBwIiwiaGFuZGxlU2h1dGRvd24iLCJwcm9taXNlcyIsImFkYXB0ZXIiLCJkYXRhYmFzZUFkYXB0ZXIiLCJwdXNoIiwiZmlsZUFkYXB0ZXIiLCJmaWxlc0NvbnRyb2xsZXIiLCJjYWNoZUFkYXB0ZXIiLCJjYWNoZUNvbnRyb2xsZXIiLCJsZW5ndGgiLCJhbGwiLCJzZXJ2ZXJDbG9zZUNvbXBsZXRlIiwibWF4VXBsb2FkU2l6ZSIsImRpcmVjdEFjY2VzcyIsInBhZ2VzIiwiYXBpIiwidXNlIiwiYWxsb3dDcm9zc0RvbWFpbiIsIkZpbGVzUm91dGVyIiwiZXhwcmVzc1JvdXRlciIsInJlcSIsInJlcyIsImpzb24iLCJzdGF0dXMiLCJ1cmxlbmNvZGVkIiwiZXh0ZW5kZWQiLCJlbmFibGVSb3V0ZXIiLCJQYWdlc1JvdXRlciIsIlB1YmxpY0FQSVJvdXRlciIsInR5cGUiLCJsaW1pdCIsImFsbG93TWV0aG9kT3ZlcnJpZGUiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJhcHBSb3V0ZXIiLCJwcm9taXNlUm91dGVyIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJlbnYiLCJURVNUSU5HIiwib24iLCJlcnIiLCJjb2RlIiwic3RkZXJyIiwid3JpdGUiLCJwb3J0IiwidmVyaWZ5U2VydmVyVXJsIiwiUEFSU0VfU0VSVkVSX0VOQUJMRV9FWFBFUklNRU5UQUxfRElSRUNUX0FDQ0VTUyIsIkNvcmVNYW5hZ2VyIiwic2V0UkVTVENvbnRyb2xsZXIiLCJyb3V0ZXJzIiwiQ2xhc3Nlc1JvdXRlciIsIlVzZXJzUm91dGVyIiwiU2Vzc2lvbnNSb3V0ZXIiLCJSb2xlc1JvdXRlciIsIkFuYWx5dGljc1JvdXRlciIsIkluc3RhbGxhdGlvbnNSb3V0ZXIiLCJGdW5jdGlvbnNSb3V0ZXIiLCJTY2hlbWFzUm91dGVyIiwiUHVzaFJvdXRlciIsIkxvZ3NSb3V0ZXIiLCJJQVBWYWxpZGF0aW9uUm91dGVyIiwiRmVhdHVyZXNSb3V0ZXIiLCJHbG9iYWxDb25maWdSb3V0ZXIiLCJHcmFwaFFMUm91dGVyIiwiUHVyZ2VSb3V0ZXIiLCJIb29rc1JvdXRlciIsIkNsb3VkQ29kZVJvdXRlciIsIkF1ZGllbmNlc1JvdXRlciIsIkFnZ3JlZ2F0ZVJvdXRlciIsIlNlY3VyaXR5Um91dGVyIiwicm91dGVzIiwicmVkdWNlIiwibWVtbyIsInJvdXRlciIsImNvbmNhdCIsIlByb21pc2VSb3V0ZXIiLCJtb3VudE9udG8iLCJzdGFydCIsImNhbGxiYWNrIiwibWlkZGxld2FyZSIsIm1vdW50UGF0aCIsIm1vdW50R3JhcGhRTCIsIm1vdW50UGxheWdyb3VuZCIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsInVuZGVmaW5lZCIsImdyYXBoUUxTY2hlbWEiLCJyZWFkRmlsZVN5bmMiLCJwYXJzZUdyYXBoUUxTZXJ2ZXIiLCJQYXJzZUdyYXBoUUxTZXJ2ZXIiLCJncmFwaFFMUGF0aCIsInBsYXlncm91bmRQYXRoIiwiYXBwbHlHcmFwaFFMIiwiYXBwbHlQbGF5Z3JvdW5kIiwic2VydmVyIiwibGlzdGVuIiwiaG9zdCIsInN0YXJ0TGl2ZVF1ZXJ5U2VydmVyIiwibGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyIsImxpdmVRdWVyeVNlcnZlciIsImNyZWF0ZUxpdmVRdWVyeVNlcnZlciIsImNvbmZpZ3VyZUxpc3RlbmVycyIsImV4cHJlc3NBcHAiLCJwYXJzZVNlcnZlciIsImh0dHBTZXJ2ZXIiLCJjcmVhdGVTZXJ2ZXIiLCJQYXJzZUxpdmVRdWVyeVNlcnZlciIsInJlcXVlc3QiLCJ1cmwiLCJyZXBsYWNlIiwicmVzcG9uc2UiLCJkYXRhIiwid2FybiIsIlBhcnNlQ2xvdWQiLCJDbG91ZCIsImdsb2JhbCIsImtleXMiLCJkZWZhdWx0cyIsImZvckVhY2giLCJrZXkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJyZWdleCIsIm1hdGNoIiwidXNlclNlbnNpdGl2ZUZpZWxkcyIsIkFycmF5IiwiZnJvbSIsIlNldCIsInByb3RlY3RlZEZpZWxkcyIsIl9Vc2VyIiwiYyIsImN1ciIsInIiLCJ1bnEiLCJtYXN0ZXJLZXlJcHMiLCJzb2NrZXRzIiwic29ja2V0Iiwic29ja2V0SWQiLCJyZW1vdGVBZGRyZXNzIiwicmVtb3RlUG9ydCIsImRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zIiwiZGVzdHJveSIsImUiLCJzdGRvdXQiLCJjbG9zZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQVdBOztBQUNBOztBQUNBOztBQUNBOztBQUNB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c0NvbnRlbnQiOlsiLy8gUGFyc2VTZXJ2ZXIgLSBvcGVuLXNvdXJjZSBjb21wYXRpYmxlIEFQSSBTZXJ2ZXIgZm9yIFBhcnNlIGFwcHNcblxudmFyIGJhdGNoID0gcmVxdWlyZSgnLi9iYXRjaCcpLFxuICBib2R5UGFyc2VyID0gcmVxdWlyZSgnYm9keS1wYXJzZXInKSxcbiAgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKSxcbiAgbWlkZGxld2FyZXMgPSByZXF1aXJlKCcuL21pZGRsZXdhcmVzJyksXG4gIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlLFxuICB7IHBhcnNlIH0gPSByZXF1aXJlKCdncmFwaHFsJyksXG4gIHBhdGggPSByZXF1aXJlKCdwYXRoJyksXG4gIGZzID0gcmVxdWlyZSgnZnMnKTtcblxuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zLCBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuL2RlZmF1bHRzJztcbmltcG9ydCAqIGFzIGxvZ2dpbmcgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0IHsgQW5hbHl0aWNzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FuYWx5dGljc1JvdXRlcic7XG5pbXBvcnQgeyBDbGFzc2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmVhdHVyZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmVhdHVyZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmlsZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmlsZXNSb3V0ZXInO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBHbG9iYWxDb25maWdSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR2xvYmFsQ29uZmlnUm91dGVyJztcbmltcG9ydCB7IEdyYXBoUUxSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR3JhcGhRTFJvdXRlcic7XG5pbXBvcnQgeyBIb29rc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Ib29rc1JvdXRlcic7XG5pbXBvcnQgeyBJQVBWYWxpZGF0aW9uUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0lBUFZhbGlkYXRpb25Sb3V0ZXInO1xuaW1wb3J0IHsgSW5zdGFsbGF0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9JbnN0YWxsYXRpb25zUm91dGVyJztcbmltcG9ydCB7IExvZ3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvTG9nc1JvdXRlcic7XG5pbXBvcnQgeyBQYXJzZUxpdmVRdWVyeVNlcnZlciB9IGZyb20gJy4vTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyJztcbmltcG9ydCB7IFBhZ2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1BhZ2VzUm91dGVyJztcbmltcG9ydCB7IFB1YmxpY0FQSVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdWJsaWNBUElSb3V0ZXInO1xuaW1wb3J0IHsgUHVzaFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXNoUm91dGVyJztcbmltcG9ydCB7IENsb3VkQ29kZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbG91ZENvZGVSb3V0ZXInO1xuaW1wb3J0IHsgUm9sZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUm9sZXNSb3V0ZXInO1xuaW1wb3J0IHsgU2NoZW1hc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IFNlc3Npb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1Nlc3Npb25zUm91dGVyJztcbmltcG9ydCB7IFVzZXJzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCB7IFB1cmdlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1cmdlUm91dGVyJztcbmltcG9ydCB7IEF1ZGllbmNlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BdWRpZW5jZXNSb3V0ZXInO1xuaW1wb3J0IHsgQWdncmVnYXRlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyIH0gZnJvbSAnLi9QYXJzZVNlcnZlclJFU1RDb250cm9sbGVyJztcbmltcG9ydCAqIGFzIGNvbnRyb2xsZXJzIGZyb20gJy4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMU2VydmVyIH0gZnJvbSAnLi9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlcic7XG5pbXBvcnQgeyBTZWN1cml0eVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9TZWN1cml0eVJvdXRlcic7XG5pbXBvcnQgQ2hlY2tSdW5uZXIgZnJvbSAnLi9TZWN1cml0eS9DaGVja1J1bm5lcic7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5pbXBvcnQgeyBEZWZpbmVkU2NoZW1hcyB9IGZyb20gJy4vRGVmaW5lZFNjaGVtYXMnO1xuXG4vLyBNdXRhdGUgdGhlIFBhcnNlIG9iamVjdCB0byBhZGQgdGhlIENsb3VkIENvZGUgaGFuZGxlcnNcbmFkZFBhcnNlQ2xvdWQoKTtcblxuLy8gUGFyc2VTZXJ2ZXIgd29ya3MgbGlrZSBhIGNvbnN0cnVjdG9yIG9mIGFuIGV4cHJlc3MgYXBwLlxuLy8gaHR0cHM6Ly9wYXJzZXBsYXRmb3JtLm9yZy9wYXJzZS1zZXJ2ZXIvYXBpL21hc3Rlci9QYXJzZVNlcnZlck9wdGlvbnMuaHRtbFxuY2xhc3MgUGFyc2VTZXJ2ZXIge1xuICAvKipcbiAgICogQGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRoZSBwYXJzZSBzZXJ2ZXIgaW5pdGlhbGl6YXRpb24gb3B0aW9uc1xuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgLy8gU2NhbiBmb3IgZGVwcmVjYXRlZCBQYXJzZSBTZXJ2ZXIgb3B0aW9uc1xuICAgIERlcHJlY2F0b3Iuc2NhblBhcnNlU2VydmVyT3B0aW9ucyhvcHRpb25zKTtcbiAgICAvLyBTZXQgb3B0aW9uIGRlZmF1bHRzXG4gICAgaW5qZWN0RGVmYXVsdHMob3B0aW9ucyk7XG4gICAgY29uc3Qge1xuICAgICAgYXBwSWQgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBhcHBJZCEnKSxcbiAgICAgIG1hc3RlcktleSA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbWFzdGVyS2V5IScpLFxuICAgICAgY2xvdWQsXG4gICAgICBzZWN1cml0eSxcbiAgICAgIGphdmFzY3JpcHRLZXksXG4gICAgICBzZXJ2ZXJVUkwgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIHNlcnZlclVSTCEnKSxcbiAgICAgIHNlcnZlclN0YXJ0Q29tcGxldGUsXG4gICAgICBiZWZvcmVTY2hlbWFzTWlncmF0aW9uLFxuICAgICAgc2NoZW1hcyxcbiAgICB9ID0gb3B0aW9ucztcbiAgICAvLyBJbml0aWFsaXplIHRoZSBub2RlIGNsaWVudCBTREsgYXV0b21hdGljYWxseVxuICAgIFBhcnNlLmluaXRpYWxpemUoYXBwSWQsIGphdmFzY3JpcHRLZXkgfHwgJ3VudXNlZCcsIG1hc3RlcktleSk7XG4gICAgUGFyc2Uuc2VydmVyVVJMID0gc2VydmVyVVJMO1xuXG4gICAgY29uc3QgYWxsQ29udHJvbGxlcnMgPSBjb250cm9sbGVycy5nZXRDb250cm9sbGVycyhvcHRpb25zKTtcblxuICAgIGNvbnN0IHsgbG9nZ2VyQ29udHJvbGxlciwgZGF0YWJhc2VDb250cm9sbGVyLCBob29rc0NvbnRyb2xsZXIgfSA9IGFsbENvbnRyb2xsZXJzO1xuICAgIHRoaXMuY29uZmlnID0gQ29uZmlnLnB1dChPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCBhbGxDb250cm9sbGVycykpO1xuXG4gICAgbG9nZ2luZy5zZXRMb2dnZXIobG9nZ2VyQ29udHJvbGxlcik7XG5cbiAgICAvLyBOb3RlOiBUZXN0cyB3aWxsIHN0YXJ0IHRvIGZhaWwgaWYgYW55IHZhbGlkYXRpb24gaGFwcGVucyBhZnRlciB0aGlzIGlzIGNhbGxlZC5cbiAgICBkYXRhYmFzZUNvbnRyb2xsZXJcbiAgICAgIC5wZXJmb3JtSW5pdGlhbGl6YXRpb24oKVxuICAgICAgLnRoZW4oKCkgPT4gaG9va3NDb250cm9sbGVyLmxvYWQoKSlcbiAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgaWYgKGJlZm9yZVNjaGVtYXNNaWdyYXRpb24pIHtcbiAgICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUoYmVmb3JlU2NoZW1hc01pZ3JhdGlvbigpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2NoZW1hcykge1xuICAgICAgICAgIGF3YWl0IG5ldyBEZWZpbmVkU2NoZW1hcyhzY2hlbWFzLCB0aGlzLmNvbmZpZykuZXhlY3V0ZSgpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzZXJ2ZXJTdGFydENvbXBsZXRlKSB7XG4gICAgICAgICAgc2VydmVyU3RhcnRDb21wbGV0ZSgpO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKHNlcnZlclN0YXJ0Q29tcGxldGUpIHtcbiAgICAgICAgICBzZXJ2ZXJTdGFydENvbXBsZXRlKGVycm9yKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgaWYgKGNsb3VkKSB7XG4gICAgICBhZGRQYXJzZUNsb3VkKCk7XG4gICAgICBpZiAodHlwZW9mIGNsb3VkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGNsb3VkKFBhcnNlKTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNsb3VkID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBjbG91ZCkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgXCJhcmd1bWVudCAnY2xvdWQnIG11c3QgZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgZnVuY3Rpb25cIjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc2VjdXJpdHkgJiYgc2VjdXJpdHkuZW5hYmxlQ2hlY2sgJiYgc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpIHtcbiAgICAgIG5ldyBDaGVja1J1bm5lcihvcHRpb25zLnNlY3VyaXR5KS5ydW4oKTtcbiAgICB9XG4gIH1cblxuICBnZXQgYXBwKCkge1xuICAgIGlmICghdGhpcy5fYXBwKSB7XG4gICAgICB0aGlzLl9hcHAgPSBQYXJzZVNlcnZlci5hcHAodGhpcy5jb25maWcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fYXBwO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcbiAgICBjb25zdCB7IGFkYXB0ZXI6IGRhdGFiYXNlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuZGF0YWJhc2VDb250cm9sbGVyO1xuICAgIGlmIChkYXRhYmFzZUFkYXB0ZXIgJiYgdHlwZW9mIGRhdGFiYXNlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGNvbnN0IHsgYWRhcHRlcjogZmlsZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlcjtcbiAgICBpZiAoZmlsZUFkYXB0ZXIgJiYgdHlwZW9mIGZpbGVBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGZpbGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGNhY2hlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyO1xuICAgIGlmIChjYWNoZUFkYXB0ZXIgJiYgdHlwZW9mIGNhY2hlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIHJldHVybiAocHJvbWlzZXMubGVuZ3RoID4gMCA/IFByb21pc2UuYWxsKHByb21pc2VzKSA6IFByb21pc2UucmVzb2x2ZSgpKS50aGVuKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5zZXJ2ZXJDbG9zZUNvbXBsZXRlKSB7XG4gICAgICAgIHRoaXMuY29uZmlnLnNlcnZlckNsb3NlQ29tcGxldGUoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3RhdGljXG4gICAqIENyZWF0ZSBhbiBleHByZXNzIGFwcCBmb3IgdGhlIHBhcnNlIHNlcnZlclxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBsZXQgeW91IHNwZWNpZnkgdGhlIG1heFVwbG9hZFNpemUgd2hlbiBjcmVhdGluZyB0aGUgZXhwcmVzcyBhcHAgICovXG4gIHN0YXRpYyBhcHAob3B0aW9ucykge1xuICAgIGNvbnN0IHsgbWF4VXBsb2FkU2l6ZSA9ICcyMG1iJywgYXBwSWQsIGRpcmVjdEFjY2VzcywgcGFnZXMgfSA9IG9wdGlvbnM7XG4gICAgLy8gVGhpcyBhcHAgc2VydmVzIHRoZSBQYXJzZSBBUEkgZGlyZWN0bHkuXG4gICAgLy8gSXQncyB0aGUgZXF1aXZhbGVudCBvZiBodHRwczovL2FwaS5wYXJzZS5jb20vMSBpbiB0aGUgaG9zdGVkIFBhcnNlIEFQSS5cbiAgICB2YXIgYXBpID0gZXhwcmVzcygpO1xuICAgIC8vYXBpLnVzZShcIi9hcHBzXCIsIGV4cHJlc3Muc3RhdGljKF9fZGlybmFtZSArIFwiL3B1YmxpY1wiKSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd0Nyb3NzRG9tYWluKGFwcElkKSk7XG4gICAgLy8gRmlsZSBoYW5kbGluZyBuZWVkcyB0byBiZSBiZWZvcmUgZGVmYXVsdCBtaWRkbGV3YXJlcyBhcmUgYXBwbGllZFxuICAgIGFwaS51c2UoXG4gICAgICAnLycsXG4gICAgICBuZXcgRmlsZXNSb3V0ZXIoKS5leHByZXNzUm91dGVyKHtcbiAgICAgICAgbWF4VXBsb2FkU2l6ZTogbWF4VXBsb2FkU2l6ZSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGFwaS51c2UoJy9oZWFsdGgnLCBmdW5jdGlvbiAocmVxLCByZXMpIHtcbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgc3RhdHVzOiAnb2snLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgYm9keVBhcnNlci51cmxlbmNvZGVkKHsgZXh0ZW5kZWQ6IGZhbHNlIH0pLFxuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyXG4gICAgICAgID8gbmV3IFBhZ2VzUm91dGVyKHBhZ2VzKS5leHByZXNzUm91dGVyKClcbiAgICAgICAgOiBuZXcgUHVibGljQVBJUm91dGVyKCkuZXhwcmVzc1JvdXRlcigpXG4gICAgKTtcblxuICAgIGFwaS51c2UoYm9keVBhcnNlci5qc29uKHsgdHlwZTogJyovKicsIGxpbWl0OiBtYXhVcGxvYWRTaXplIH0pKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93TWV0aG9kT3ZlcnJpZGUpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzKTtcblxuICAgIGNvbnN0IGFwcFJvdXRlciA9IFBhcnNlU2VydmVyLnByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KTtcbiAgICBhcGkudXNlKGFwcFJvdXRlci5leHByZXNzUm91dGVyKCkpO1xuXG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUVycm9ycyk7XG5cbiAgICAvLyBydW4gdGhlIGZvbGxvd2luZyB3aGVuIG5vdCB0ZXN0aW5nXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICAvL1RoaXMgY2F1c2VzIHRlc3RzIHRvIHNwZXcgc29tZSB1c2VsZXNzIHdhcm5pbmdzLCBzbyBkaXNhYmxlIGluIHRlc3RcbiAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgICBwcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG4gICAgICAgICAgLy8gdXNlci1mcmllbmRseSBtZXNzYWdlIGZvciB0aGlzIGNvbW1vbiBlcnJvclxuICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKGBVbmFibGUgdG8gbGlzdGVuIG9uIHBvcnQgJHtlcnIucG9ydH0uIFRoZSBwb3J0IGlzIGFscmVhZHkgaW4gdXNlLmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgLy8gdmVyaWZ5IHRoZSBzZXJ2ZXIgdXJsIGFmdGVyIGEgJ21vdW50JyBldmVudCBpcyByZWNlaXZlZFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIGFwaS5vbignbW91bnQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIFBhcnNlU2VydmVyLnZlcmlmeVNlcnZlclVybCgpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIGlmIChwcm9jZXNzLmVudi5QQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTID09PSAnMScgfHwgZGlyZWN0QWNjZXNzKSB7XG4gICAgICBQYXJzZS5Db3JlTWFuYWdlci5zZXRSRVNUQ29udHJvbGxlcihQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyKGFwcElkLCBhcHBSb3V0ZXIpKTtcbiAgICB9XG4gICAgcmV0dXJuIGFwaTtcbiAgfVxuXG4gIHN0YXRpYyBwcm9taXNlUm91dGVyKHsgYXBwSWQgfSkge1xuICAgIGNvbnN0IHJvdXRlcnMgPSBbXG4gICAgICBuZXcgQ2xhc3Nlc1JvdXRlcigpLFxuICAgICAgbmV3IFVzZXJzUm91dGVyKCksXG4gICAgICBuZXcgU2Vzc2lvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBSb2xlc1JvdXRlcigpLFxuICAgICAgbmV3IEFuYWx5dGljc1JvdXRlcigpLFxuICAgICAgbmV3IEluc3RhbGxhdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBGdW5jdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTY2hlbWFzUm91dGVyKCksXG4gICAgICBuZXcgUHVzaFJvdXRlcigpLFxuICAgICAgbmV3IExvZ3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJQVBWYWxpZGF0aW9uUm91dGVyKCksXG4gICAgICBuZXcgRmVhdHVyZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBHbG9iYWxDb25maWdSb3V0ZXIoKSxcbiAgICAgIG5ldyBHcmFwaFFMUm91dGVyKCksXG4gICAgICBuZXcgUHVyZ2VSb3V0ZXIoKSxcbiAgICAgIG5ldyBIb29rc1JvdXRlcigpLFxuICAgICAgbmV3IENsb3VkQ29kZVJvdXRlcigpLFxuICAgICAgbmV3IEF1ZGllbmNlc1JvdXRlcigpLFxuICAgICAgbmV3IEFnZ3JlZ2F0ZVJvdXRlcigpLFxuICAgICAgbmV3IFNlY3VyaXR5Um91dGVyKCksXG4gICAgXTtcblxuICAgIGNvbnN0IHJvdXRlcyA9IHJvdXRlcnMucmVkdWNlKChtZW1vLCByb3V0ZXIpID0+IHtcbiAgICAgIHJldHVybiBtZW1vLmNvbmNhdChyb3V0ZXIucm91dGVzKTtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBuZXcgUHJvbWlzZVJvdXRlcihyb3V0ZXMsIGFwcElkKTtcblxuICAgIGJhdGNoLm1vdW50T250byhhcHBSb3V0ZXIpO1xuICAgIHJldHVybiBhcHBSb3V0ZXI7XG4gIH1cblxuICAvKipcbiAgICogc3RhcnRzIHRoZSBwYXJzZSBzZXJ2ZXIncyBleHByZXNzIGFwcFxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB0byB1c2UgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIGhhcyBzdGFydGVkXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhcnQob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zLCBjYWxsYmFjazogPygpID0+IHZvaWQpIHtcbiAgICBjb25zdCBhcHAgPSBleHByZXNzKCk7XG4gICAgaWYgKG9wdGlvbnMubWlkZGxld2FyZSkge1xuICAgICAgbGV0IG1pZGRsZXdhcmU7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMubWlkZGxld2FyZSA9PSAnc3RyaW5nJykge1xuICAgICAgICBtaWRkbGV3YXJlID0gcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgb3B0aW9ucy5taWRkbGV3YXJlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtaWRkbGV3YXJlID0gb3B0aW9ucy5taWRkbGV3YXJlOyAvLyB1c2UgYXMtaXMgbGV0IGV4cHJlc3MgZmFpbFxuICAgICAgfVxuICAgICAgYXBwLnVzZShtaWRkbGV3YXJlKTtcbiAgICB9XG5cbiAgICBhcHAudXNlKG9wdGlvbnMubW91bnRQYXRoLCB0aGlzLmFwcCk7XG5cbiAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwgPT09IHRydWUgfHwgb3B0aW9ucy5tb3VudFBsYXlncm91bmQgPT09IHRydWUpIHtcbiAgICAgIGxldCBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSB1bmRlZmluZWQ7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gcGFyc2UoZnMucmVhZEZpbGVTeW5jKG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSwgJ3V0ZjgnKSk7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnb2JqZWN0JyB8fFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gb3B0aW9ucy5ncmFwaFFMU2NoZW1hO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwYXJzZUdyYXBoUUxTZXJ2ZXIgPSBuZXcgUGFyc2VHcmFwaFFMU2VydmVyKHRoaXMsIHtcbiAgICAgICAgZ3JhcGhRTFBhdGg6IG9wdGlvbnMuZ3JhcGhRTFBhdGgsXG4gICAgICAgIHBsYXlncm91bmRQYXRoOiBvcHRpb25zLnBsYXlncm91bmRQYXRoLFxuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICB9KTtcblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseUdyYXBoUUwoYXBwKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseVBsYXlncm91bmQoYXBwKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBzZXJ2ZXIgPSBhcHAubGlzdGVuKG9wdGlvbnMucG9ydCwgb3B0aW9ucy5ob3N0LCBjYWxsYmFjayk7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG5cbiAgICBpZiAob3B0aW9ucy5zdGFydExpdmVRdWVyeVNlcnZlciB8fCBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnMpIHtcbiAgICAgIHRoaXMubGl2ZVF1ZXJ5U2VydmVyID0gUGFyc2VTZXJ2ZXIuY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyKFxuICAgICAgICBzZXJ2ZXIsXG4gICAgICAgIG9wdGlvbnMubGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyxcbiAgICAgICAgb3B0aW9uc1xuICAgICAgKTtcbiAgICB9XG4gICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICBpZiAoIXByb2Nlc3MuZW52LlRFU1RJTkcpIHtcbiAgICAgIGNvbmZpZ3VyZUxpc3RlbmVycyh0aGlzKTtcbiAgICB9XG4gICAgdGhpcy5leHByZXNzQXBwID0gYXBwO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBuZXcgUGFyc2VTZXJ2ZXIgYW5kIHN0YXJ0cyBpdC5cbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdXNlZCB0byBzdGFydCB0aGUgc2VydmVyXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIGNhbGxlZCB3aGVuIHRoZSBzZXJ2ZXIgaGFzIHN0YXJ0ZWRcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGF0aWMgc3RhcnQob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zLCBjYWxsYmFjazogPygpID0+IHZvaWQpIHtcbiAgICBjb25zdCBwYXJzZVNlcnZlciA9IG5ldyBQYXJzZVNlcnZlcihvcHRpb25zKTtcbiAgICByZXR1cm4gcGFyc2VTZXJ2ZXIuc3RhcnQob3B0aW9ucywgY2FsbGJhY2spO1xuICB9XG5cbiAgLyoqXG4gICAqIEhlbHBlciBtZXRob2QgdG8gY3JlYXRlIGEgbGl2ZVF1ZXJ5IHNlcnZlclxuICAgKiBAc3RhdGljXG4gICAqIEBwYXJhbSB7U2VydmVyfSBodHRwU2VydmVyIGFuIG9wdGlvbmFsIGh0dHAgc2VydmVyIHRvIHBhc3NcbiAgICogQHBhcmFtIHtMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zfSBjb25maWcgb3B0aW9ucyBmb3IgdGhlIGxpdmVRdWVyeVNlcnZlclxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyBvcHRpb25zIGZvciB0aGUgUGFyc2VTZXJ2ZXJcbiAgICogQHJldHVybnMge1BhcnNlTGl2ZVF1ZXJ5U2VydmVyfSB0aGUgbGl2ZSBxdWVyeSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIoXG4gICAgaHR0cFNlcnZlcixcbiAgICBjb25maWc6IExpdmVRdWVyeVNlcnZlck9wdGlvbnMsXG4gICAgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zXG4gICkge1xuICAgIGlmICghaHR0cFNlcnZlciB8fCAoY29uZmlnICYmIGNvbmZpZy5wb3J0KSkge1xuICAgICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcbiAgICAgIGh0dHBTZXJ2ZXIgPSByZXF1aXJlKCdodHRwJykuY3JlYXRlU2VydmVyKGFwcCk7XG4gICAgICBodHRwU2VydmVyLmxpc3Rlbihjb25maWcucG9ydCk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIoaHR0cFNlcnZlciwgY29uZmlnLCBvcHRpb25zKTtcbiAgfVxuXG4gIHN0YXRpYyB2ZXJpZnlTZXJ2ZXJVcmwoY2FsbGJhY2spIHtcbiAgICAvLyBwZXJmb3JtIGEgaGVhbHRoIGNoZWNrIG9uIHRoZSBzZXJ2ZXJVUkwgdmFsdWVcbiAgICBpZiAoUGFyc2Uuc2VydmVyVVJMKSB7XG4gICAgICBjb25zdCByZXF1ZXN0ID0gcmVxdWlyZSgnLi9yZXF1ZXN0Jyk7XG4gICAgICByZXF1ZXN0KHsgdXJsOiBQYXJzZS5zZXJ2ZXJVUkwucmVwbGFjZSgvXFwvJC8sICcnKSArICcvaGVhbHRoJyB9KVxuICAgICAgICAuY2F0Y2gocmVzcG9uc2UgPT4gcmVzcG9uc2UpXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICBjb25zdCBqc29uID0gcmVzcG9uc2UuZGF0YSB8fCBudWxsO1xuICAgICAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDIwMCB8fCAhanNvbiB8fCAoanNvbiAmJiBqc29uLnN0YXR1cyAhPT0gJ29rJykpIHtcbiAgICAgICAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgYFxcbldBUk5JTkcsIFVuYWJsZSB0byBjb25uZWN0IHRvICcke1BhcnNlLnNlcnZlclVSTH0nLmAgK1xuICAgICAgICAgICAgICAgIGAgQ2xvdWQgY29kZSBhbmQgcHVzaCBub3RpZmljYXRpb25zIG1heSBiZSB1bmF2YWlsYWJsZSFcXG5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgY2FsbGJhY2soZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgY2FsbGJhY2sodHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkUGFyc2VDbG91ZCgpIHtcbiAgY29uc3QgUGFyc2VDbG91ZCA9IHJlcXVpcmUoJy4vY2xvdWQtY29kZS9QYXJzZS5DbG91ZCcpO1xuICBPYmplY3QuYXNzaWduKFBhcnNlLkNsb3VkLCBQYXJzZUNsb3VkKTtcbiAgZ2xvYmFsLlBhcnNlID0gUGFyc2U7XG59XG5cbmZ1bmN0aW9uIGluamVjdERlZmF1bHRzKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBPYmplY3Qua2V5cyhkZWZhdWx0cykuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsIGtleSkpIHtcbiAgICAgIG9wdGlvbnNba2V5XSA9IGRlZmF1bHRzW2tleV07XG4gICAgfVxuICB9KTtcblxuICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvcHRpb25zLCAnc2VydmVyVVJMJykpIHtcbiAgICBvcHRpb25zLnNlcnZlclVSTCA9IGBodHRwOi8vbG9jYWxob3N0OiR7b3B0aW9ucy5wb3J0fSR7b3B0aW9ucy5tb3VudFBhdGh9YDtcbiAgfVxuXG4gIC8vIFJlc2VydmVkIENoYXJhY3RlcnNcbiAgaWYgKG9wdGlvbnMuYXBwSWQpIHtcbiAgICBjb25zdCByZWdleCA9IC9bISMkJScoKSorJi86Oz0/QFtcXF17fV4sfDw+XS9nO1xuICAgIGlmIChvcHRpb25zLmFwcElkLm1hdGNoKHJlZ2V4KSkge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuV0FSTklORywgYXBwSWQgdGhhdCBjb250YWlucyBzcGVjaWFsIGNoYXJhY3RlcnMgY2FuIGNhdXNlIGlzc3VlcyB3aGlsZSB1c2luZyB3aXRoIHVybHMuXFxuYFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvLyBCYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuICBpZiAob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzKSB7XG4gICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICFwcm9jZXNzLmVudi5URVNUSU5HICYmXG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5ERVBSRUNBVEVEOiB1c2VyU2Vuc2l0aXZlRmllbGRzIGhhcyBiZWVuIHJlcGxhY2VkIGJ5IHByb3RlY3RlZEZpZWxkcyBhbGxvd2luZyB0aGUgYWJpbGl0eSB0byBwcm90ZWN0IGZpZWxkcyBpbiBhbGwgY2xhc3NlcyB3aXRoIENMUC4gXFxuYFxuICAgICAgKTtcbiAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cblxuICAgIGNvbnN0IHVzZXJTZW5zaXRpdmVGaWVsZHMgPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKGRlZmF1bHRzLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pLCAuLi4ob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKV0pXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyBpcyB1bnNldCxcbiAgICAvLyBpdCdsbCBiZSBhc3NpZ25lZCB0aGUgZGVmYXVsdCBhYm92ZS5cbiAgICAvLyBIZXJlLCBwcm90ZWN0IGFnYWluc3QgdGhlIGNhc2Ugd2hlcmUgcHJvdGVjdGVkRmllbGRzXG4gICAgLy8gaXMgc2V0LCBidXQgZG9lc24ndCBoYXZlIF9Vc2VyLlxuICAgIGlmICghKCdfVXNlcicgaW4gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyA9IE9iamVjdC5hc3NpZ24oeyBfVXNlcjogW10gfSwgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgIH1cblxuICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gfHwgW10pLCAuLi51c2VyU2Vuc2l0aXZlRmllbGRzXSlcbiAgICApO1xuICB9XG5cbiAgLy8gTWVyZ2UgcHJvdGVjdGVkRmllbGRzIG9wdGlvbnMgd2l0aCBkZWZhdWx0cy5cbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzKS5mb3JFYWNoKGMgPT4ge1xuICAgIGNvbnN0IGN1ciA9IG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIGlmICghY3VyKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXSA9IGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICB9IGVsc2Uge1xuICAgICAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdKS5mb3JFYWNoKHIgPT4ge1xuICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gfHwgW10pLFxuICAgICAgICAgIC4uLmRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXVtyXSxcbiAgICAgICAgXSk7XG4gICAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICBvcHRpb25zLm1hc3RlcktleUlwcyA9IEFycmF5LmZyb20oXG4gICAgbmV3IFNldChvcHRpb25zLm1hc3RlcktleUlwcy5jb25jYXQoZGVmYXVsdHMubWFzdGVyS2V5SXBzLCBvcHRpb25zLm1hc3RlcktleUlwcykpXG4gICk7XG59XG5cbi8vIFRob3NlIGNhbid0IGJlIHRlc3RlZCBhcyBpdCByZXF1aXJlcyBhIHN1YnByb2Nlc3Ncbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG5mdW5jdGlvbiBjb25maWd1cmVMaXN0ZW5lcnMocGFyc2VTZXJ2ZXIpIHtcbiAgY29uc3Qgc2VydmVyID0gcGFyc2VTZXJ2ZXIuc2VydmVyO1xuICBjb25zdCBzb2NrZXRzID0ge307XG4gIC8qIEN1cnJlbnRseSwgZXhwcmVzcyBkb2Vzbid0IHNodXQgZG93biBpbW1lZGlhdGVseSBhZnRlciByZWNlaXZpbmcgU0lHSU5UL1NJR1RFUk0gaWYgaXQgaGFzIGNsaWVudCBjb25uZWN0aW9ucyB0aGF0IGhhdmVuJ3QgdGltZWQgb3V0LiAoVGhpcyBpcyBhIGtub3duIGlzc3VlIHdpdGggbm9kZSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvMjY0MilcbiAgICBUaGlzIGZ1bmN0aW9uLCBhbG9uZyB3aXRoIGBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpYCwgaW50ZW5kIHRvIGZpeCB0aGlzIGJlaGF2aW9yIHN1Y2ggdGhhdCBwYXJzZSBzZXJ2ZXIgd2lsbCBjbG9zZSBhbGwgb3BlbiBjb25uZWN0aW9ucyBhbmQgaW5pdGlhdGUgdGhlIHNodXRkb3duIHByb2Nlc3MgYXMgc29vbiBhcyBpdCByZWNlaXZlcyBhIFNJR0lOVC9TSUdURVJNIHNpZ25hbC4gKi9cbiAgc2VydmVyLm9uKCdjb25uZWN0aW9uJywgc29ja2V0ID0+IHtcbiAgICBjb25zdCBzb2NrZXRJZCA9IHNvY2tldC5yZW1vdGVBZGRyZXNzICsgJzonICsgc29ja2V0LnJlbW90ZVBvcnQ7XG4gICAgc29ja2V0c1tzb2NrZXRJZF0gPSBzb2NrZXQ7XG4gICAgc29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIGRlbGV0ZSBzb2NrZXRzW3NvY2tldElkXTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgY29uc3QgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgZm9yIChjb25zdCBzb2NrZXRJZCBpbiBzb2NrZXRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzb2NrZXRzW3NvY2tldElkXS5kZXN0cm95KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8qICovXG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGhhbmRsZVNodXRkb3duID0gZnVuY3Rpb24gKCkge1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdUZXJtaW5hdGlvbiBzaWduYWwgcmVjZWl2ZWQuIFNodXR0aW5nIGRvd24uJyk7XG4gICAgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKTtcbiAgICBzZXJ2ZXIuY2xvc2UoKTtcbiAgICBwYXJzZVNlcnZlci5oYW5kbGVTaHV0ZG93bigpO1xuICB9O1xuICBwcm9jZXNzLm9uKCdTSUdURVJNJywgaGFuZGxlU2h1dGRvd24pO1xuICBwcm9jZXNzLm9uKCdTSUdJTlQnLCBoYW5kbGVTaHV0ZG93bik7XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuIl19