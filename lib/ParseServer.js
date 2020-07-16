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
    injectDefaults(options);
    const {
      appId = (0, _requiredParameter.default)('You must provide an appId!'),
      masterKey = (0, _requiredParameter.default)('You must provide a masterKey!'),
      cloud,
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!'),
      serverStartComplete
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
    logging.setLogger(loggerController);
    const dbInitPromise = databaseController.performInitialization();
    const hooksLoadPromise = hooksController.load(); // Note: Tests will start to fail if any validation happens after this is called.

    Promise.all([dbInitPromise, hooksLoadPromise]).then(() => {
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


  static app({
    maxUploadSize = '20mb',
    appId,
    directAccess
  }) {
    // This app serves the Parse API directly.
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
    }), new _PublicAPIRouter.PublicAPIRouter().expressRouter());
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
    const routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter(), new _FeaturesRouter.FeaturesRouter(), new _GlobalConfigRouter.GlobalConfigRouter(), new _GraphQLRouter.GraphQLRouter(), new _PurgeRouter.PurgeRouter(), new _HooksRouter.HooksRouter(), new _CloudCodeRouter.CloudCodeRouter(), new _AudiencesRouter.AudiencesRouter(), new _AggregateRouter.AggregateRouter()];
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
      this.liveQueryServer = ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions);
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
   * @param {LiveQueryServerOptions} config options fot he liveQueryServer
   * @returns {ParseLiveQueryServer} the live query server instance
   */


  static createLiveQueryServer(httpServer, config) {
    if (!httpServer || config && config.port) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }

    return new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci5qcyJdLCJuYW1lcyI6WyJiYXRjaCIsInJlcXVpcmUiLCJib2R5UGFyc2VyIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXJzZSIsInBhdGgiLCJmcyIsImFkZFBhcnNlQ2xvdWQiLCJQYXJzZVNlcnZlciIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsImluamVjdERlZmF1bHRzIiwiYXBwSWQiLCJtYXN0ZXJLZXkiLCJjbG91ZCIsImphdmFzY3JpcHRLZXkiLCJzZXJ2ZXJVUkwiLCJzZXJ2ZXJTdGFydENvbXBsZXRlIiwiaW5pdGlhbGl6ZSIsImFsbENvbnRyb2xsZXJzIiwiY29udHJvbGxlcnMiLCJnZXRDb250cm9sbGVycyIsImxvZ2dlckNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJob29rc0NvbnRyb2xsZXIiLCJjb25maWciLCJDb25maWciLCJwdXQiLCJPYmplY3QiLCJhc3NpZ24iLCJsb2dnaW5nIiwic2V0TG9nZ2VyIiwiZGJJbml0UHJvbWlzZSIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsImhvb2tzTG9hZFByb21pc2UiLCJsb2FkIiwiUHJvbWlzZSIsImFsbCIsInRoZW4iLCJjYXRjaCIsImVycm9yIiwiY29uc29sZSIsInByb2Nlc3MiLCJleGl0IiwicmVzb2x2ZSIsImN3ZCIsImFwcCIsIl9hcHAiLCJoYW5kbGVTaHV0ZG93biIsInByb21pc2VzIiwiYWRhcHRlciIsImRhdGFiYXNlQWRhcHRlciIsInB1c2giLCJmaWxlQWRhcHRlciIsImZpbGVzQ29udHJvbGxlciIsImNhY2hlQWRhcHRlciIsImNhY2hlQ29udHJvbGxlciIsImxlbmd0aCIsInNlcnZlckNsb3NlQ29tcGxldGUiLCJtYXhVcGxvYWRTaXplIiwiZGlyZWN0QWNjZXNzIiwiYXBpIiwidXNlIiwiYWxsb3dDcm9zc0RvbWFpbiIsIkZpbGVzUm91dGVyIiwiZXhwcmVzc1JvdXRlciIsInJlcSIsInJlcyIsImpzb24iLCJzdGF0dXMiLCJ1cmxlbmNvZGVkIiwiZXh0ZW5kZWQiLCJQdWJsaWNBUElSb3V0ZXIiLCJ0eXBlIiwibGltaXQiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwiYXBwUm91dGVyIiwicHJvbWlzZVJvdXRlciIsImhhbmRsZVBhcnNlRXJyb3JzIiwiZW52IiwiVEVTVElORyIsIm9uIiwiZXJyIiwiY29kZSIsInN0ZGVyciIsIndyaXRlIiwicG9ydCIsInZlcmlmeVNlcnZlclVybCIsIlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MiLCJDb3JlTWFuYWdlciIsInNldFJFU1RDb250cm9sbGVyIiwicm91dGVycyIsIkNsYXNzZXNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsIlNlc3Npb25zUm91dGVyIiwiUm9sZXNSb3V0ZXIiLCJBbmFseXRpY3NSb3V0ZXIiLCJJbnN0YWxsYXRpb25zUm91dGVyIiwiRnVuY3Rpb25zUm91dGVyIiwiU2NoZW1hc1JvdXRlciIsIlB1c2hSb3V0ZXIiLCJMb2dzUm91dGVyIiwiSUFQVmFsaWRhdGlvblJvdXRlciIsIkZlYXR1cmVzUm91dGVyIiwiR2xvYmFsQ29uZmlnUm91dGVyIiwiR3JhcGhRTFJvdXRlciIsIlB1cmdlUm91dGVyIiwiSG9va3NSb3V0ZXIiLCJDbG91ZENvZGVSb3V0ZXIiLCJBdWRpZW5jZXNSb3V0ZXIiLCJBZ2dyZWdhdGVSb3V0ZXIiLCJyb3V0ZXMiLCJyZWR1Y2UiLCJtZW1vIiwicm91dGVyIiwiY29uY2F0IiwiUHJvbWlzZVJvdXRlciIsIm1vdW50T250byIsInN0YXJ0IiwiY2FsbGJhY2siLCJtaWRkbGV3YXJlIiwibW91bnRQYXRoIiwibW91bnRHcmFwaFFMIiwibW91bnRQbGF5Z3JvdW5kIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWZzIiwidW5kZWZpbmVkIiwiZ3JhcGhRTFNjaGVtYSIsInJlYWRGaWxlU3luYyIsInBhcnNlR3JhcGhRTFNlcnZlciIsIlBhcnNlR3JhcGhRTFNlcnZlciIsImdyYXBoUUxQYXRoIiwicGxheWdyb3VuZFBhdGgiLCJhcHBseUdyYXBoUUwiLCJhcHBseVBsYXlncm91bmQiLCJzZXJ2ZXIiLCJsaXN0ZW4iLCJob3N0Iiwic3RhcnRMaXZlUXVlcnlTZXJ2ZXIiLCJsaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIiwibGl2ZVF1ZXJ5U2VydmVyIiwiY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyIiwiY29uZmlndXJlTGlzdGVuZXJzIiwiZXhwcmVzc0FwcCIsInBhcnNlU2VydmVyIiwiaHR0cFNlcnZlciIsImNyZWF0ZVNlcnZlciIsIlBhcnNlTGl2ZVF1ZXJ5U2VydmVyIiwicmVxdWVzdCIsInVybCIsInJlcGxhY2UiLCJyZXNwb25zZSIsImRhdGEiLCJ3YXJuIiwiUGFyc2VDbG91ZCIsIkNsb3VkIiwiZ2xvYmFsIiwia2V5cyIsImRlZmF1bHRzIiwiZm9yRWFjaCIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInJlZ2V4IiwibWF0Y2giLCJ1c2VyU2Vuc2l0aXZlRmllbGRzIiwiQXJyYXkiLCJmcm9tIiwiU2V0IiwicHJvdGVjdGVkRmllbGRzIiwiX1VzZXIiLCJjIiwiY3VyIiwiciIsInVucSIsIm1hc3RlcktleUlwcyIsInNvY2tldHMiLCJzb2NrZXQiLCJzb2NrZXRJZCIsInJlbW90ZUFkZHJlc3MiLCJyZW1vdGVQb3J0IiwiZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMiLCJkZXN0cm95IiwiZSIsInN0ZG91dCIsImNsb3NlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBV0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBekNBO0FBRUEsSUFBSUEs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QXJCO0FBQ0Q7O2VBRWN4QyxXIiwic291cmNlc0NvbnRlbnQiOlsiLy8gUGFyc2VTZXJ2ZXIgLSBvcGVuLXNvdXJjZSBjb21wYXRpYmxlIEFQSSBTZXJ2ZXIgZm9yIFBhcnNlIGFwcHNcblxudmFyIGJhdGNoID0gcmVxdWlyZSgnLi9iYXRjaCcpLFxuICBib2R5UGFyc2VyID0gcmVxdWlyZSgnYm9keS1wYXJzZXInKSxcbiAgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKSxcbiAgbWlkZGxld2FyZXMgPSByZXF1aXJlKCcuL21pZGRsZXdhcmVzJyksXG4gIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlLFxuICB7IHBhcnNlIH0gPSByZXF1aXJlKCdncmFwaHFsJyksXG4gIHBhdGggPSByZXF1aXJlKCdwYXRoJyksXG4gIGZzID0gcmVxdWlyZSgnZnMnKTtcblxuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zLCBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuL2RlZmF1bHRzJztcbmltcG9ydCAqIGFzIGxvZ2dpbmcgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0IHsgQW5hbHl0aWNzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FuYWx5dGljc1JvdXRlcic7XG5pbXBvcnQgeyBDbGFzc2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmVhdHVyZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmVhdHVyZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmlsZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmlsZXNSb3V0ZXInO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBHbG9iYWxDb25maWdSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR2xvYmFsQ29uZmlnUm91dGVyJztcbmltcG9ydCB7IEdyYXBoUUxSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR3JhcGhRTFJvdXRlcic7XG5pbXBvcnQgeyBIb29rc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Ib29rc1JvdXRlcic7XG5pbXBvcnQgeyBJQVBWYWxpZGF0aW9uUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0lBUFZhbGlkYXRpb25Sb3V0ZXInO1xuaW1wb3J0IHsgSW5zdGFsbGF0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9JbnN0YWxsYXRpb25zUm91dGVyJztcbmltcG9ydCB7IExvZ3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvTG9nc1JvdXRlcic7XG5pbXBvcnQgeyBQYXJzZUxpdmVRdWVyeVNlcnZlciB9IGZyb20gJy4vTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyJztcbmltcG9ydCB7IFB1YmxpY0FQSVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdWJsaWNBUElSb3V0ZXInO1xuaW1wb3J0IHsgUHVzaFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXNoUm91dGVyJztcbmltcG9ydCB7IENsb3VkQ29kZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbG91ZENvZGVSb3V0ZXInO1xuaW1wb3J0IHsgUm9sZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUm9sZXNSb3V0ZXInO1xuaW1wb3J0IHsgU2NoZW1hc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IFNlc3Npb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1Nlc3Npb25zUm91dGVyJztcbmltcG9ydCB7IFVzZXJzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCB7IFB1cmdlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1cmdlUm91dGVyJztcbmltcG9ydCB7IEF1ZGllbmNlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BdWRpZW5jZXNSb3V0ZXInO1xuaW1wb3J0IHsgQWdncmVnYXRlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyIH0gZnJvbSAnLi9QYXJzZVNlcnZlclJFU1RDb250cm9sbGVyJztcbmltcG9ydCAqIGFzIGNvbnRyb2xsZXJzIGZyb20gJy4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMU2VydmVyIH0gZnJvbSAnLi9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlcic7XG5cbi8vIE11dGF0ZSB0aGUgUGFyc2Ugb2JqZWN0IHRvIGFkZCB0aGUgQ2xvdWQgQ29kZSBoYW5kbGVyc1xuYWRkUGFyc2VDbG91ZCgpO1xuXG4vLyBQYXJzZVNlcnZlciB3b3JrcyBsaWtlIGEgY29uc3RydWN0b3Igb2YgYW4gZXhwcmVzcyBhcHAuXG4vLyBodHRwczovL3BhcnNlcGxhdGZvcm0ub3JnL3BhcnNlLXNlcnZlci9hcGkvbWFzdGVyL1BhcnNlU2VydmVyT3B0aW9ucy5odG1sXG5jbGFzcyBQYXJzZVNlcnZlciB7XG4gIC8qKlxuICAgKiBAY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdGhlIHBhcnNlIHNlcnZlciBpbml0aWFsaXphdGlvbiBvcHRpb25zXG4gICAqL1xuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICBpbmplY3REZWZhdWx0cyhvcHRpb25zKTtcbiAgICBjb25zdCB7XG4gICAgICBhcHBJZCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGFuIGFwcElkIScpLFxuICAgICAgbWFzdGVyS2V5ID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBtYXN0ZXJLZXkhJyksXG4gICAgICBjbG91ZCxcbiAgICAgIGphdmFzY3JpcHRLZXksXG4gICAgICBzZXJ2ZXJVUkwgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIHNlcnZlclVSTCEnKSxcbiAgICAgIHNlcnZlclN0YXJ0Q29tcGxldGUsXG4gICAgfSA9IG9wdGlvbnM7XG4gICAgLy8gSW5pdGlhbGl6ZSB0aGUgbm9kZSBjbGllbnQgU0RLIGF1dG9tYXRpY2FsbHlcbiAgICBQYXJzZS5pbml0aWFsaXplKGFwcElkLCBqYXZhc2NyaXB0S2V5IHx8ICd1bnVzZWQnLCBtYXN0ZXJLZXkpO1xuICAgIFBhcnNlLnNlcnZlclVSTCA9IHNlcnZlclVSTDtcblxuICAgIGNvbnN0IGFsbENvbnRyb2xsZXJzID0gY29udHJvbGxlcnMuZ2V0Q29udHJvbGxlcnMob3B0aW9ucyk7XG5cbiAgICBjb25zdCB7XG4gICAgICBsb2dnZXJDb250cm9sbGVyLFxuICAgICAgZGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgaG9va3NDb250cm9sbGVyLFxuICAgIH0gPSBhbGxDb250cm9sbGVycztcbiAgICB0aGlzLmNvbmZpZyA9IENvbmZpZy5wdXQoT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywgYWxsQ29udHJvbGxlcnMpKTtcblxuICAgIGxvZ2dpbmcuc2V0TG9nZ2VyKGxvZ2dlckNvbnRyb2xsZXIpO1xuICAgIGNvbnN0IGRiSW5pdFByb21pc2UgPSBkYXRhYmFzZUNvbnRyb2xsZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKCk7XG4gICAgY29uc3QgaG9va3NMb2FkUHJvbWlzZSA9IGhvb2tzQ29udHJvbGxlci5sb2FkKCk7XG5cbiAgICAvLyBOb3RlOiBUZXN0cyB3aWxsIHN0YXJ0IHRvIGZhaWwgaWYgYW55IHZhbGlkYXRpb24gaGFwcGVucyBhZnRlciB0aGlzIGlzIGNhbGxlZC5cbiAgICBQcm9taXNlLmFsbChbZGJJbml0UHJvbWlzZSwgaG9va3NMb2FkUHJvbWlzZV0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGlmIChzZXJ2ZXJTdGFydENvbXBsZXRlKSB7XG4gICAgICAgICAgc2VydmVyU3RhcnRDb21wbGV0ZSgpO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICBpZiAoc2VydmVyU3RhcnRDb21wbGV0ZSkge1xuICAgICAgICAgIHNlcnZlclN0YXJ0Q29tcGxldGUoZXJyb3IpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICBpZiAoY2xvdWQpIHtcbiAgICAgIGFkZFBhcnNlQ2xvdWQoKTtcbiAgICAgIGlmICh0eXBlb2YgY2xvdWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY2xvdWQoUGFyc2UpO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2xvdWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcXVpcmUocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGNsb3VkKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBcImFyZ3VtZW50ICdjbG91ZCcgbXVzdCBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgYSBmdW5jdGlvblwiO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBhcHAoKSB7XG4gICAgaWYgKCF0aGlzLl9hcHApIHtcbiAgICAgIHRoaXMuX2FwcCA9IFBhcnNlU2VydmVyLmFwcCh0aGlzLmNvbmZpZyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9hcHA7XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuICAgIGNvbnN0IHsgYWRhcHRlcjogZGF0YWJhc2VBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5kYXRhYmFzZUNvbnRyb2xsZXI7XG4gICAgaWYgKFxuICAgICAgZGF0YWJhc2VBZGFwdGVyICYmXG4gICAgICB0eXBlb2YgZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nXG4gICAgKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGRhdGFiYXNlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBmaWxlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGlmIChmaWxlQWRhcHRlciAmJiB0eXBlb2YgZmlsZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goZmlsZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGNvbnN0IHsgYWRhcHRlcjogY2FjaGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXI7XG4gICAgaWYgKGNhY2hlQWRhcHRlciAmJiB0eXBlb2YgY2FjaGVBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGNhY2hlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgcmV0dXJuIChwcm9taXNlcy5sZW5ndGggPiAwXG4gICAgICA/IFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgOiBQcm9taXNlLnJlc29sdmUoKVxuICAgICkudGhlbigoKSA9PiB7XG4gICAgICBpZiAodGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSkge1xuICAgICAgICB0aGlzLmNvbmZpZy5zZXJ2ZXJDbG9zZUNvbXBsZXRlKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBDcmVhdGUgYW4gZXhwcmVzcyBhcHAgZm9yIHRoZSBwYXJzZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgbGV0IHlvdSBzcGVjaWZ5IHRoZSBtYXhVcGxvYWRTaXplIHdoZW4gY3JlYXRpbmcgdGhlIGV4cHJlc3MgYXBwICAqL1xuICBzdGF0aWMgYXBwKHsgbWF4VXBsb2FkU2l6ZSA9ICcyMG1iJywgYXBwSWQsIGRpcmVjdEFjY2VzcyB9KSB7XG4gICAgLy8gVGhpcyBhcHAgc2VydmVzIHRoZSBQYXJzZSBBUEkgZGlyZWN0bHkuXG4gICAgLy8gSXQncyB0aGUgZXF1aXZhbGVudCBvZiBodHRwczovL2FwaS5wYXJzZS5jb20vMSBpbiB0aGUgaG9zdGVkIFBhcnNlIEFQSS5cbiAgICB2YXIgYXBpID0gZXhwcmVzcygpO1xuICAgIC8vYXBpLnVzZShcIi9hcHBzXCIsIGV4cHJlc3Muc3RhdGljKF9fZGlybmFtZSArIFwiL3B1YmxpY1wiKSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd0Nyb3NzRG9tYWluKGFwcElkKSk7XG4gICAgLy8gRmlsZSBoYW5kbGluZyBuZWVkcyB0byBiZSBiZWZvcmUgZGVmYXVsdCBtaWRkbGV3YXJlcyBhcmUgYXBwbGllZFxuICAgIGFwaS51c2UoXG4gICAgICAnLycsXG4gICAgICBuZXcgRmlsZXNSb3V0ZXIoKS5leHByZXNzUm91dGVyKHtcbiAgICAgICAgbWF4VXBsb2FkU2l6ZTogbWF4VXBsb2FkU2l6ZSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGFwaS51c2UoJy9oZWFsdGgnLCBmdW5jdGlvbiAocmVxLCByZXMpIHtcbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgc3RhdHVzOiAnb2snLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgYm9keVBhcnNlci51cmxlbmNvZGVkKHsgZXh0ZW5kZWQ6IGZhbHNlIH0pLFxuICAgICAgbmV3IFB1YmxpY0FQSVJvdXRlcigpLmV4cHJlc3NSb3V0ZXIoKVxuICAgICk7XG5cbiAgICBhcGkudXNlKGJvZHlQYXJzZXIuanNvbih7IHR5cGU6ICcqLyonLCBsaW1pdDogbWF4VXBsb2FkU2l6ZSB9KSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd01ldGhvZE92ZXJyaWRlKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyk7XG5cbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBQYXJzZVNlcnZlci5wcm9taXNlUm91dGVyKHsgYXBwSWQgfSk7XG4gICAgYXBpLnVzZShhcHBSb3V0ZXIuZXhwcmVzc1JvdXRlcigpKTtcblxuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VFcnJvcnMpO1xuXG4gICAgLy8gcnVuIHRoZSBmb2xsb3dpbmcgd2hlbiBub3QgdGVzdGluZ1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgLy9UaGlzIGNhdXNlcyB0ZXN0cyB0byBzcGV3IHNvbWUgdXNlbGVzcyB3YXJuaW5ncywgc28gZGlzYWJsZSBpbiB0ZXN0XG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgcHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCAoZXJyKSA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG4gICAgICAgICAgLy8gdXNlci1mcmllbmRseSBtZXNzYWdlIGZvciB0aGlzIGNvbW1vbiBlcnJvclxuICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKFxuICAgICAgICAgICAgYFVuYWJsZSB0byBsaXN0ZW4gb24gcG9ydCAke2Vyci5wb3J0fS4gVGhlIHBvcnQgaXMgYWxyZWFkeSBpbiB1c2UuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICAvLyB2ZXJpZnkgdGhlIHNlcnZlciB1cmwgYWZ0ZXIgYSAnbW91bnQnIGV2ZW50IGlzIHJlY2VpdmVkXG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgYXBpLm9uKCdtb3VudCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgUGFyc2VTZXJ2ZXIudmVyaWZ5U2VydmVyVXJsKCk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKFxuICAgICAgcHJvY2Vzcy5lbnYuUEFSU0VfU0VSVkVSX0VOQUJMRV9FWFBFUklNRU5UQUxfRElSRUNUX0FDQ0VTUyA9PT0gJzEnIHx8XG4gICAgICBkaXJlY3RBY2Nlc3NcbiAgICApIHtcbiAgICAgIFBhcnNlLkNvcmVNYW5hZ2VyLnNldFJFU1RDb250cm9sbGVyKFxuICAgICAgICBQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyKGFwcElkLCBhcHBSb3V0ZXIpXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gYXBpO1xuICB9XG5cbiAgc3RhdGljIHByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KSB7XG4gICAgY29uc3Qgcm91dGVycyA9IFtcbiAgICAgIG5ldyBDbGFzc2VzUm91dGVyKCksXG4gICAgICBuZXcgVXNlcnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTZXNzaW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFJvbGVzUm91dGVyKCksXG4gICAgICBuZXcgQW5hbHl0aWNzUm91dGVyKCksXG4gICAgICBuZXcgSW5zdGFsbGF0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IEZ1bmN0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFNjaGVtYXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXNoUm91dGVyKCksXG4gICAgICBuZXcgTG9nc1JvdXRlcigpLFxuICAgICAgbmV3IElBUFZhbGlkYXRpb25Sb3V0ZXIoKSxcbiAgICAgIG5ldyBGZWF0dXJlc1JvdXRlcigpLFxuICAgICAgbmV3IEdsb2JhbENvbmZpZ1JvdXRlcigpLFxuICAgICAgbmV3IEdyYXBoUUxSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXJnZVJvdXRlcigpLFxuICAgICAgbmV3IEhvb2tzUm91dGVyKCksXG4gICAgICBuZXcgQ2xvdWRDb2RlUm91dGVyKCksXG4gICAgICBuZXcgQXVkaWVuY2VzUm91dGVyKCksXG4gICAgICBuZXcgQWdncmVnYXRlUm91dGVyKCksXG4gICAgXTtcblxuICAgIGNvbnN0IHJvdXRlcyA9IHJvdXRlcnMucmVkdWNlKChtZW1vLCByb3V0ZXIpID0+IHtcbiAgICAgIHJldHVybiBtZW1vLmNvbmNhdChyb3V0ZXIucm91dGVzKTtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBuZXcgUHJvbWlzZVJvdXRlcihyb3V0ZXMsIGFwcElkKTtcblxuICAgIGJhdGNoLm1vdW50T250byhhcHBSb3V0ZXIpO1xuICAgIHJldHVybiBhcHBSb3V0ZXI7XG4gIH1cblxuICAvKipcbiAgICogc3RhcnRzIHRoZSBwYXJzZSBzZXJ2ZXIncyBleHByZXNzIGFwcFxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB0byB1c2UgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIGhhcyBzdGFydGVkXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhcnQob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zLCBjYWxsYmFjazogPygpID0+IHZvaWQpIHtcbiAgICBjb25zdCBhcHAgPSBleHByZXNzKCk7XG4gICAgaWYgKG9wdGlvbnMubWlkZGxld2FyZSkge1xuICAgICAgbGV0IG1pZGRsZXdhcmU7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMubWlkZGxld2FyZSA9PSAnc3RyaW5nJykge1xuICAgICAgICBtaWRkbGV3YXJlID0gcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgb3B0aW9ucy5taWRkbGV3YXJlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtaWRkbGV3YXJlID0gb3B0aW9ucy5taWRkbGV3YXJlOyAvLyB1c2UgYXMtaXMgbGV0IGV4cHJlc3MgZmFpbFxuICAgICAgfVxuICAgICAgYXBwLnVzZShtaWRkbGV3YXJlKTtcbiAgICB9XG5cbiAgICBhcHAudXNlKG9wdGlvbnMubW91bnRQYXRoLCB0aGlzLmFwcCk7XG5cbiAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwgPT09IHRydWUgfHwgb3B0aW9ucy5tb3VudFBsYXlncm91bmQgPT09IHRydWUpIHtcbiAgICAgIGxldCBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSB1bmRlZmluZWQ7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gcGFyc2UoXG4gICAgICAgICAgZnMucmVhZEZpbGVTeW5jKG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSwgJ3V0ZjgnKVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnb2JqZWN0JyB8fCB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IG9wdGlvbnMuZ3JhcGhRTFNjaGVtYTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcGFyc2VHcmFwaFFMU2VydmVyID0gbmV3IFBhcnNlR3JhcGhRTFNlcnZlcih0aGlzLCB7XG4gICAgICAgIGdyYXBoUUxQYXRoOiBvcHRpb25zLmdyYXBoUUxQYXRoLFxuICAgICAgICBwbGF5Z3JvdW5kUGF0aDogb3B0aW9ucy5wbGF5Z3JvdW5kUGF0aCxcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlHcmFwaFFMKGFwcCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50UGxheWdyb3VuZCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlQbGF5Z3JvdW5kKGFwcCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgc2VydmVyID0gYXBwLmxpc3RlbihvcHRpb25zLnBvcnQsIG9wdGlvbnMuaG9zdCwgY2FsbGJhY2spO1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuXG4gICAgaWYgKG9wdGlvbnMuc3RhcnRMaXZlUXVlcnlTZXJ2ZXIgfHwgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zKSB7XG4gICAgICB0aGlzLmxpdmVRdWVyeVNlcnZlciA9IFBhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICAgICAgc2VydmVyLFxuICAgICAgICBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnNcbiAgICAgICk7XG4gICAgfVxuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICBjb25maWd1cmVMaXN0ZW5lcnModGhpcyk7XG4gICAgfVxuICAgIHRoaXMuZXhwcmVzc0FwcCA9IGFwcDtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFBhcnNlU2VydmVyIGFuZCBzdGFydHMgaXQuXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHVzZWQgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIGhhcyBzdGFydGVkXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIHN0YXJ0KG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucywgY2FsbGJhY2s6ID8oKSA9PiB2b2lkKSB7XG4gICAgY29uc3QgcGFyc2VTZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gICAgcmV0dXJuIHBhcnNlU2VydmVyLnN0YXJ0KG9wdGlvbnMsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIZWxwZXIgbWV0aG9kIHRvIGNyZWF0ZSBhIGxpdmVRdWVyeSBzZXJ2ZXJcbiAgICogQHN0YXRpY1xuICAgKiBAcGFyYW0ge1NlcnZlcn0gaHR0cFNlcnZlciBhbiBvcHRpb25hbCBodHRwIHNlcnZlciB0byBwYXNzXG4gICAqIEBwYXJhbSB7TGl2ZVF1ZXJ5U2VydmVyT3B0aW9uc30gY29uZmlnIG9wdGlvbnMgZm90IGhlIGxpdmVRdWVyeVNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VMaXZlUXVlcnlTZXJ2ZXJ9IHRoZSBsaXZlIHF1ZXJ5IHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIGNyZWF0ZUxpdmVRdWVyeVNlcnZlcihodHRwU2VydmVyLCBjb25maWc6IExpdmVRdWVyeVNlcnZlck9wdGlvbnMpIHtcbiAgICBpZiAoIWh0dHBTZXJ2ZXIgfHwgKGNvbmZpZyAmJiBjb25maWcucG9ydCkpIHtcbiAgICAgIHZhciBhcHAgPSBleHByZXNzKCk7XG4gICAgICBodHRwU2VydmVyID0gcmVxdWlyZSgnaHR0cCcpLmNyZWF0ZVNlcnZlcihhcHApO1xuICAgICAgaHR0cFNlcnZlci5saXN0ZW4oY29uZmlnLnBvcnQpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyKGh0dHBTZXJ2ZXIsIGNvbmZpZyk7XG4gIH1cblxuICBzdGF0aWMgdmVyaWZ5U2VydmVyVXJsKGNhbGxiYWNrKSB7XG4gICAgLy8gcGVyZm9ybSBhIGhlYWx0aCBjaGVjayBvbiB0aGUgc2VydmVyVVJMIHZhbHVlXG4gICAgaWYgKFBhcnNlLnNlcnZlclVSTCkge1xuICAgICAgY29uc3QgcmVxdWVzdCA9IHJlcXVpcmUoJy4vcmVxdWVzdCcpO1xuICAgICAgcmVxdWVzdCh7IHVybDogUGFyc2Uuc2VydmVyVVJMLnJlcGxhY2UoL1xcLyQvLCAnJykgKyAnL2hlYWx0aCcgfSlcbiAgICAgICAgLmNhdGNoKChyZXNwb25zZSkgPT4gcmVzcG9uc2UpXG4gICAgICAgIC50aGVuKChyZXNwb25zZSkgPT4ge1xuICAgICAgICAgIGNvbnN0IGpzb24gPSByZXNwb25zZS5kYXRhIHx8IG51bGw7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgcmVzcG9uc2Uuc3RhdHVzICE9PSAyMDAgfHxcbiAgICAgICAgICAgICFqc29uIHx8XG4gICAgICAgICAgICAoanNvbiAmJiBqc29uLnN0YXR1cyAhPT0gJ29rJylcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgYFxcbldBUk5JTkcsIFVuYWJsZSB0byBjb25uZWN0IHRvICcke1BhcnNlLnNlcnZlclVSTH0nLmAgK1xuICAgICAgICAgICAgICAgIGAgQ2xvdWQgY29kZSBhbmQgcHVzaCBub3RpZmljYXRpb25zIG1heSBiZSB1bmF2YWlsYWJsZSFcXG5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgY2FsbGJhY2soZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgY2FsbGJhY2sodHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkUGFyc2VDbG91ZCgpIHtcbiAgY29uc3QgUGFyc2VDbG91ZCA9IHJlcXVpcmUoJy4vY2xvdWQtY29kZS9QYXJzZS5DbG91ZCcpO1xuICBPYmplY3QuYXNzaWduKFBhcnNlLkNsb3VkLCBQYXJzZUNsb3VkKTtcbiAgZ2xvYmFsLlBhcnNlID0gUGFyc2U7XG59XG5cbmZ1bmN0aW9uIGluamVjdERlZmF1bHRzKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBPYmplY3Qua2V5cyhkZWZhdWx0cykuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywga2V5KSkge1xuICAgICAgb3B0aW9uc1trZXldID0gZGVmYXVsdHNba2V5XTtcbiAgICB9XG4gIH0pO1xuXG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsICdzZXJ2ZXJVUkwnKSkge1xuICAgIG9wdGlvbnMuc2VydmVyVVJMID0gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtvcHRpb25zLnBvcnR9JHtvcHRpb25zLm1vdW50UGF0aH1gO1xuICB9XG5cbiAgLy8gUmVzZXJ2ZWQgQ2hhcmFjdGVyc1xuICBpZiAob3B0aW9ucy5hcHBJZCkge1xuICAgIGNvbnN0IHJlZ2V4ID0gL1shIyQlJygpKismLzo7PT9AW1xcXXt9Xix8PD5dL2c7XG4gICAgaWYgKG9wdGlvbnMuYXBwSWQubWF0Y2gocmVnZXgpKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5XQVJOSU5HLCBhcHBJZCB0aGF0IGNvbnRhaW5zIHNwZWNpYWwgY2hhcmFjdGVycyBjYW4gY2F1c2UgaXNzdWVzIHdoaWxlIHVzaW5nIHdpdGggdXJscy5cXG5gXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGlmIChvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMpIHtcbiAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgIXByb2Nlc3MuZW52LlRFU1RJTkcgJiZcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbkRFUFJFQ0FURUQ6IHVzZXJTZW5zaXRpdmVGaWVsZHMgaGFzIGJlZW4gcmVwbGFjZWQgYnkgcHJvdGVjdGVkRmllbGRzIGFsbG93aW5nIHRoZSBhYmlsaXR5IHRvIHByb3RlY3QgZmllbGRzIGluIGFsbCBjbGFzc2VzIHdpdGggQ0xQLiBcXG5gXG4gICAgICApO1xuICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuXG4gICAgY29uc3QgdXNlclNlbnNpdGl2ZUZpZWxkcyA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFtcbiAgICAgICAgLi4uKGRlZmF1bHRzLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pLFxuICAgICAgICAuLi4ob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKSxcbiAgICAgIF0pXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyBpcyB1bnNldCxcbiAgICAvLyBpdCdsbCBiZSBhc3NpZ25lZCB0aGUgZGVmYXVsdCBhYm92ZS5cbiAgICAvLyBIZXJlLCBwcm90ZWN0IGFnYWluc3QgdGhlIGNhc2Ugd2hlcmUgcHJvdGVjdGVkRmllbGRzXG4gICAgLy8gaXMgc2V0LCBidXQgZG9lc24ndCBoYXZlIF9Vc2VyLlxuICAgIGlmICghKCdfVXNlcicgaW4gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyA9IE9iamVjdC5hc3NpZ24oXG4gICAgICAgIHsgX1VzZXI6IFtdIH0sXG4gICAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzXG4gICAgICApO1xuICAgIH1cblxuICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbXG4gICAgICAgIC4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddIHx8IFtdKSxcbiAgICAgICAgLi4udXNlclNlbnNpdGl2ZUZpZWxkcyxcbiAgICAgIF0pXG4gICAgKTtcbiAgfVxuXG4gIC8vIE1lcmdlIHByb3RlY3RlZEZpZWxkcyBvcHRpb25zIHdpdGggZGVmYXVsdHMuXG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkcykuZm9yRWFjaCgoYykgPT4ge1xuICAgIGNvbnN0IGN1ciA9IG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIGlmICghY3VyKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXSA9IGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICB9IGVsc2Uge1xuICAgICAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdKS5mb3JFYWNoKChyKSA9PiB7XG4gICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgIC4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSB8fCBbXSksXG4gICAgICAgICAgLi4uZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdW3JdLFxuICAgICAgICBdKTtcbiAgICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gPSBBcnJheS5mcm9tKHVucSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIG9wdGlvbnMubWFzdGVyS2V5SXBzID0gQXJyYXkuZnJvbShcbiAgICBuZXcgU2V0KFxuICAgICAgb3B0aW9ucy5tYXN0ZXJLZXlJcHMuY29uY2F0KGRlZmF1bHRzLm1hc3RlcktleUlwcywgb3B0aW9ucy5tYXN0ZXJLZXlJcHMpXG4gICAgKVxuICApO1xufVxuXG4vLyBUaG9zZSBjYW4ndCBiZSB0ZXN0ZWQgYXMgaXQgcmVxdWlyZXMgYSBzdWJwcm9jZXNzXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuZnVuY3Rpb24gY29uZmlndXJlTGlzdGVuZXJzKHBhcnNlU2VydmVyKSB7XG4gIGNvbnN0IHNlcnZlciA9IHBhcnNlU2VydmVyLnNlcnZlcjtcbiAgY29uc3Qgc29ja2V0cyA9IHt9O1xuICAvKiBDdXJyZW50bHksIGV4cHJlc3MgZG9lc24ndCBzaHV0IGRvd24gaW1tZWRpYXRlbHkgYWZ0ZXIgcmVjZWl2aW5nIFNJR0lOVC9TSUdURVJNIGlmIGl0IGhhcyBjbGllbnQgY29ubmVjdGlvbnMgdGhhdCBoYXZlbid0IHRpbWVkIG91dC4gKFRoaXMgaXMgYSBrbm93biBpc3N1ZSB3aXRoIG5vZGUgLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvaXNzdWVzLzI2NDIpXG4gICAgVGhpcyBmdW5jdGlvbiwgYWxvbmcgd2l0aCBgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKWAsIGludGVuZCB0byBmaXggdGhpcyBiZWhhdmlvciBzdWNoIHRoYXQgcGFyc2Ugc2VydmVyIHdpbGwgY2xvc2UgYWxsIG9wZW4gY29ubmVjdGlvbnMgYW5kIGluaXRpYXRlIHRoZSBzaHV0ZG93biBwcm9jZXNzIGFzIHNvb24gYXMgaXQgcmVjZWl2ZXMgYSBTSUdJTlQvU0lHVEVSTSBzaWduYWwuICovXG4gIHNlcnZlci5vbignY29ubmVjdGlvbicsIChzb2NrZXQpID0+IHtcbiAgICBjb25zdCBzb2NrZXRJZCA9IHNvY2tldC5yZW1vdGVBZGRyZXNzICsgJzonICsgc29ja2V0LnJlbW90ZVBvcnQ7XG4gICAgc29ja2V0c1tzb2NrZXRJZF0gPSBzb2NrZXQ7XG4gICAgc29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIGRlbGV0ZSBzb2NrZXRzW3NvY2tldElkXTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgY29uc3QgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgZm9yIChjb25zdCBzb2NrZXRJZCBpbiBzb2NrZXRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzb2NrZXRzW3NvY2tldElkXS5kZXN0cm95KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8qICovXG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGhhbmRsZVNodXRkb3duID0gZnVuY3Rpb24gKCkge1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdUZXJtaW5hdGlvbiBzaWduYWwgcmVjZWl2ZWQuIFNodXR0aW5nIGRvd24uJyk7XG4gICAgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKTtcbiAgICBzZXJ2ZXIuY2xvc2UoKTtcbiAgICBwYXJzZVNlcnZlci5oYW5kbGVTaHV0ZG93bigpO1xuICB9O1xuICBwcm9jZXNzLm9uKCdTSUdURVJNJywgaGFuZGxlU2h1dGRvd24pO1xuICBwcm9jZXNzLm9uKCdTSUdJTlQnLCBoYW5kbGVTaHV0ZG93bik7XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuIl19