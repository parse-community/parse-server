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
      } else if (typeof options.graphQLSchema === 'object') {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci5qcyJdLCJuYW1lcyI6WyJiYXRjaCIsInJlcXVpcmUiLCJib2R5UGFyc2VyIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXJzZSIsInBhdGgiLCJmcyIsImFkZFBhcnNlQ2xvdWQiLCJQYXJzZVNlcnZlciIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsImluamVjdERlZmF1bHRzIiwiYXBwSWQiLCJtYXN0ZXJLZXkiLCJjbG91ZCIsImphdmFzY3JpcHRLZXkiLCJzZXJ2ZXJVUkwiLCJzZXJ2ZXJTdGFydENvbXBsZXRlIiwiaW5pdGlhbGl6ZSIsImFsbENvbnRyb2xsZXJzIiwiY29udHJvbGxlcnMiLCJnZXRDb250cm9sbGVycyIsImxvZ2dlckNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJob29rc0NvbnRyb2xsZXIiLCJjb25maWciLCJDb25maWciLCJwdXQiLCJPYmplY3QiLCJhc3NpZ24iLCJsb2dnaW5nIiwic2V0TG9nZ2VyIiwiZGJJbml0UHJvbWlzZSIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsImhvb2tzTG9hZFByb21pc2UiLCJsb2FkIiwiUHJvbWlzZSIsImFsbCIsInRoZW4iLCJjYXRjaCIsImVycm9yIiwiY29uc29sZSIsInByb2Nlc3MiLCJleGl0IiwicmVzb2x2ZSIsImN3ZCIsImFwcCIsIl9hcHAiLCJoYW5kbGVTaHV0ZG93biIsInByb21pc2VzIiwiYWRhcHRlciIsImRhdGFiYXNlQWRhcHRlciIsInB1c2giLCJmaWxlQWRhcHRlciIsImZpbGVzQ29udHJvbGxlciIsImxlbmd0aCIsInNlcnZlckNsb3NlQ29tcGxldGUiLCJtYXhVcGxvYWRTaXplIiwiZGlyZWN0QWNjZXNzIiwiYXBpIiwidXNlIiwiYWxsb3dDcm9zc0RvbWFpbiIsIkZpbGVzUm91dGVyIiwiZXhwcmVzc1JvdXRlciIsInJlcSIsInJlcyIsImpzb24iLCJzdGF0dXMiLCJ1cmxlbmNvZGVkIiwiZXh0ZW5kZWQiLCJQdWJsaWNBUElSb3V0ZXIiLCJ0eXBlIiwibGltaXQiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwiYXBwUm91dGVyIiwicHJvbWlzZVJvdXRlciIsImhhbmRsZVBhcnNlRXJyb3JzIiwiZW52IiwiVEVTVElORyIsIm9uIiwiZXJyIiwiY29kZSIsInN0ZGVyciIsIndyaXRlIiwicG9ydCIsInZlcmlmeVNlcnZlclVybCIsIlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MiLCJDb3JlTWFuYWdlciIsInNldFJFU1RDb250cm9sbGVyIiwicm91dGVycyIsIkNsYXNzZXNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsIlNlc3Npb25zUm91dGVyIiwiUm9sZXNSb3V0ZXIiLCJBbmFseXRpY3NSb3V0ZXIiLCJJbnN0YWxsYXRpb25zUm91dGVyIiwiRnVuY3Rpb25zUm91dGVyIiwiU2NoZW1hc1JvdXRlciIsIlB1c2hSb3V0ZXIiLCJMb2dzUm91dGVyIiwiSUFQVmFsaWRhdGlvblJvdXRlciIsIkZlYXR1cmVzUm91dGVyIiwiR2xvYmFsQ29uZmlnUm91dGVyIiwiR3JhcGhRTFJvdXRlciIsIlB1cmdlUm91dGVyIiwiSG9va3NSb3V0ZXIiLCJDbG91ZENvZGVSb3V0ZXIiLCJBdWRpZW5jZXNSb3V0ZXIiLCJBZ2dyZWdhdGVSb3V0ZXIiLCJyb3V0ZXMiLCJyZWR1Y2UiLCJtZW1vIiwicm91dGVyIiwiY29uY2F0IiwiUHJvbWlzZVJvdXRlciIsIm1vdW50T250byIsInN0YXJ0IiwiY2FsbGJhY2siLCJtaWRkbGV3YXJlIiwibW91bnRQYXRoIiwibW91bnRHcmFwaFFMIiwibW91bnRQbGF5Z3JvdW5kIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWZzIiwidW5kZWZpbmVkIiwiZ3JhcGhRTFNjaGVtYSIsInJlYWRGaWxlU3luYyIsInBhcnNlR3JhcGhRTFNlcnZlciIsIlBhcnNlR3JhcGhRTFNlcnZlciIsImdyYXBoUUxQYXRoIiwicGxheWdyb3VuZFBhdGgiLCJhcHBseUdyYXBoUUwiLCJhcHBseVBsYXlncm91bmQiLCJzZXJ2ZXIiLCJsaXN0ZW4iLCJob3N0Iiwic3RhcnRMaXZlUXVlcnlTZXJ2ZXIiLCJsaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIiwibGl2ZVF1ZXJ5U2VydmVyIiwiY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyIiwiY29uZmlndXJlTGlzdGVuZXJzIiwiZXhwcmVzc0FwcCIsInBhcnNlU2VydmVyIiwiaHR0cFNlcnZlciIsImNyZWF0ZVNlcnZlciIsIlBhcnNlTGl2ZVF1ZXJ5U2VydmVyIiwicmVxdWVzdCIsInVybCIsInJlcGxhY2UiLCJyZXNwb25zZSIsImRhdGEiLCJ3YXJuIiwiUGFyc2VDbG91ZCIsIkNsb3VkIiwiZ2xvYmFsIiwia2V5cyIsImRlZmF1bHRzIiwiZm9yRWFjaCIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInJlZ2V4IiwibWF0Y2giLCJ1c2VyU2Vuc2l0aXZlRmllbGRzIiwiQXJyYXkiLCJmcm9tIiwiU2V0IiwicHJvdGVjdGVkRmllbGRzIiwiX1VzZXIiLCJjIiwiY3VyIiwiciIsInVucSIsIm1hc3RlcktleUlwcyIsInNvY2tldHMiLCJzb2NrZXQiLCJzb2NrZXRJZCIsInJlbW90ZUFkZHJlc3MiLCJyZW1vdGVQb3J0IiwiZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMiLCJkZXN0cm95IiwiZSIsInN0ZG91dCIsImNsb3NlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBV0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBekNBO0FBRUEsSUFBSUEsS0FBSyxHQUFHQyxPQUFPLENBQUMsU0FBRCxDQUFuQjtB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LE1BQU0sQ0FBQ0csVUFBckQ7QUFDQUosSUFBQUEsT0FBTyxDQUFDRSxRQUFELENBQVAsR0FBb0JELE1BQXBCO0FBQ0FBLElBQUFBLE1BQU0sQ0FBQ2hHLEVBQVAsQ0FBVSxPQUFWLEVBQW1CLE1BQU07QUFDdkIsYUFBTytGLE9BQU8sQ0FBQ0UsUUFBRCxDQUFkO0FBQ0QsS0FGRDtBQUdELEdBTkQ7O0FBUUEsUUFBTUcsdUJBQXVCLEdBQUcsWUFBVztBQUN6QyxTQUFLLE1BQU1ILFFBQVgsSUFBdUJGLE9BQXZCLEVBQWdDO0FBQzlCLFVBQUk7QUFDRkEsUUFBQUEsT0FBTyxDQUFDRSxRQUFELENBQVAsQ0FBa0JJLE9BQWxCO0FBQ0QsT0FGRCxDQUVFLE9BQU9DLENBQVAsRUFBVTtBQUNWO0FBQ0Q7QUFDRjtBQUNGLEdBUkQ7O0FBVUEsUUFBTXRJLGNBQWMsR0FBRyxZQUFXO0FBQ2hDTixJQUFBQSxPQUFPLENBQUM2SSxNQUFSLENBQWVuRyxLQUFmLENBQXFCLDZDQUFyQjtBQUNBZ0csSUFBQUEsdUJBQXVCO0FBQ3ZCL0MsSUFBQUEsTUFBTSxDQUFDbUQsS0FBUDtBQUNBMUMsSUFBQUEsV0FBVyxDQUFDOUYsY0FBWjtBQUNELEdBTEQ7O0FBTUFOLEVBQUFBLE9BQU8sQ0FBQ3NDLEVBQVIsQ0FBVyxTQUFYLEVBQXNCaEMsY0FBdEI7QUFDQU4sRUFBQUEsT0FBTyxDQUFDc0MsRUFBUixDQUFXLFFBQVgsRUFBcUJoQyxjQUFyQjtBQUNEOztlQUVjeEMsVyIsInNvdXJjZXNDb250ZW50IjpbIi8vIFBhcnNlU2VydmVyIC0gb3Blbi1zb3VyY2UgY29tcGF0aWJsZSBBUEkgU2VydmVyIGZvciBQYXJzZSBhcHBzXG5cbnZhciBiYXRjaCA9IHJlcXVpcmUoJy4vYmF0Y2gnKSxcbiAgYm9keVBhcnNlciA9IHJlcXVpcmUoJ2JvZHktcGFyc2VyJyksXG4gIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyksXG4gIG1pZGRsZXdhcmVzID0gcmVxdWlyZSgnLi9taWRkbGV3YXJlcycpLFxuICBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZSxcbiAgeyBwYXJzZSB9ID0gcmVxdWlyZSgnZ3JhcGhxbCcpLFxuICBwYXRoID0gcmVxdWlyZSgncGF0aCcpLFxuICBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucywgTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi9kZWZhdWx0cyc7XG5pbXBvcnQgKiBhcyBsb2dnaW5nIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi9Db25maWcnO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCB7IEFuYWx5dGljc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BbmFseXRpY3NSb3V0ZXInO1xuaW1wb3J0IHsgQ2xhc3Nlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbGFzc2VzUm91dGVyJztcbmltcG9ydCB7IEZlYXR1cmVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZlYXR1cmVzUm91dGVyJztcbmltcG9ydCB7IEZpbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZpbGVzUm91dGVyJztcbmltcG9ydCB7IEZ1bmN0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgR2xvYmFsQ29uZmlnUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dsb2JhbENvbmZpZ1JvdXRlcic7XG5pbXBvcnQgeyBHcmFwaFFMUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dyYXBoUUxSb3V0ZXInO1xuaW1wb3J0IHsgSG9va3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSG9va3NSb3V0ZXInO1xuaW1wb3J0IHsgSUFQVmFsaWRhdGlvblJvdXRlciB9IGZyb20gJy4vUm91dGVycy9JQVBWYWxpZGF0aW9uUm91dGVyJztcbmltcG9ydCB7IEluc3RhbGxhdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSW5zdGFsbGF0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBMb2dzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0xvZ3NSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfSBmcm9tICcuL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlcic7XG5pbXBvcnQgeyBQdWJsaWNBUElSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVibGljQVBJUm91dGVyJztcbmltcG9ydCB7IFB1c2hSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVzaFJvdXRlcic7XG5pbXBvcnQgeyBDbG91ZENvZGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xvdWRDb2RlUm91dGVyJztcbmltcG9ydCB7IFJvbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1JvbGVzUm91dGVyJztcbmltcG9ydCB7IFNjaGVtYXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBTZXNzaW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TZXNzaW9uc1JvdXRlcic7XG5pbXBvcnQgeyBVc2Vyc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgeyBQdXJnZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXJnZVJvdXRlcic7XG5pbXBvcnQgeyBBdWRpZW5jZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQXVkaWVuY2VzUm91dGVyJztcbmltcG9ydCB7IEFnZ3JlZ2F0ZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9BZ2dyZWdhdGVSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciB9IGZyb20gJy4vUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcic7XG5pbXBvcnQgKiBhcyBjb250cm9sbGVycyBmcm9tICcuL0NvbnRyb2xsZXJzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9IGZyb20gJy4vR3JhcGhRTC9QYXJzZUdyYXBoUUxTZXJ2ZXInO1xuXG4vLyBNdXRhdGUgdGhlIFBhcnNlIG9iamVjdCB0byBhZGQgdGhlIENsb3VkIENvZGUgaGFuZGxlcnNcbmFkZFBhcnNlQ2xvdWQoKTtcblxuLy8gUGFyc2VTZXJ2ZXIgd29ya3MgbGlrZSBhIGNvbnN0cnVjdG9yIG9mIGFuIGV4cHJlc3MgYXBwLlxuLy8gaHR0cHM6Ly9wYXJzZXBsYXRmb3JtLm9yZy9wYXJzZS1zZXJ2ZXIvYXBpL21hc3Rlci9QYXJzZVNlcnZlck9wdGlvbnMuaHRtbFxuY2xhc3MgUGFyc2VTZXJ2ZXIge1xuICAvKipcbiAgICogQGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRoZSBwYXJzZSBzZXJ2ZXIgaW5pdGlhbGl6YXRpb24gb3B0aW9uc1xuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgaW5qZWN0RGVmYXVsdHMob3B0aW9ucyk7XG4gICAgY29uc3Qge1xuICAgICAgYXBwSWQgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBhcHBJZCEnKSxcbiAgICAgIG1hc3RlcktleSA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbWFzdGVyS2V5IScpLFxuICAgICAgY2xvdWQsXG4gICAgICBqYXZhc2NyaXB0S2V5LFxuICAgICAgc2VydmVyVVJMID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBzZXJ2ZXJVUkwhJyksXG4gICAgICBzZXJ2ZXJTdGFydENvbXBsZXRlLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIC8vIEluaXRpYWxpemUgdGhlIG5vZGUgY2xpZW50IFNESyBhdXRvbWF0aWNhbGx5XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShhcHBJZCwgamF2YXNjcmlwdEtleSB8fCAndW51c2VkJywgbWFzdGVyS2V5KTtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG5cbiAgICBjb25zdCBhbGxDb250cm9sbGVycyA9IGNvbnRyb2xsZXJzLmdldENvbnRyb2xsZXJzKG9wdGlvbnMpO1xuXG4gICAgY29uc3Qge1xuICAgICAgbG9nZ2VyQ29udHJvbGxlcixcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIGhvb2tzQ29udHJvbGxlcixcbiAgICB9ID0gYWxsQ29udHJvbGxlcnM7XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcucHV0KE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIGFsbENvbnRyb2xsZXJzKSk7XG5cbiAgICBsb2dnaW5nLnNldExvZ2dlcihsb2dnZXJDb250cm9sbGVyKTtcbiAgICBjb25zdCBkYkluaXRQcm9taXNlID0gZGF0YWJhc2VDb250cm9sbGVyLnBlcmZvcm1Jbml0aWFsaXphdGlvbigpO1xuICAgIGNvbnN0IGhvb2tzTG9hZFByb21pc2UgPSBob29rc0NvbnRyb2xsZXIubG9hZCgpO1xuXG4gICAgLy8gTm90ZTogVGVzdHMgd2lsbCBzdGFydCB0byBmYWlsIGlmIGFueSB2YWxpZGF0aW9uIGhhcHBlbnMgYWZ0ZXIgdGhpcyBpcyBjYWxsZWQuXG4gICAgUHJvbWlzZS5hbGwoW2RiSW5pdFByb21pc2UsIGhvb2tzTG9hZFByb21pc2VdKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoc2VydmVyU3RhcnRDb21wbGV0ZSkge1xuICAgICAgICAgIHNlcnZlclN0YXJ0Q29tcGxldGUoKTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChzZXJ2ZXJTdGFydENvbXBsZXRlKSB7XG4gICAgICAgICAgc2VydmVyU3RhcnRDb21wbGV0ZShlcnJvcik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgIGlmIChjbG91ZCkge1xuICAgICAgYWRkUGFyc2VDbG91ZCgpO1xuICAgICAgaWYgKHR5cGVvZiBjbG91ZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjbG91ZChQYXJzZSk7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjbG91ZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgY2xvdWQpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IFwiYXJndW1lbnQgJ2Nsb3VkJyBtdXN0IGVpdGhlciBiZSBhIHN0cmluZyBvciBhIGZ1bmN0aW9uXCI7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IGFwcCgpIHtcbiAgICBpZiAoIXRoaXMuX2FwcCkge1xuICAgICAgdGhpcy5fYXBwID0gUGFyc2VTZXJ2ZXIuYXBwKHRoaXMuY29uZmlnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2FwcDtcbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG4gICAgY29uc3QgeyBhZGFwdGVyOiBkYXRhYmFzZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlQ29udHJvbGxlcjtcbiAgICBpZiAoXG4gICAgICBkYXRhYmFzZUFkYXB0ZXIgJiZcbiAgICAgIHR5cGVvZiBkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbidcbiAgICApIHtcbiAgICAgIHByb21pc2VzLnB1c2goZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGZpbGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG4gICAgaWYgKGZpbGVBZGFwdGVyICYmIHR5cGVvZiBmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgcmV0dXJuIChwcm9taXNlcy5sZW5ndGggPiAwXG4gICAgICA/IFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgOiBQcm9taXNlLnJlc29sdmUoKVxuICAgICkudGhlbigoKSA9PiB7XG4gICAgICBpZiAodGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSkge1xuICAgICAgICB0aGlzLmNvbmZpZy5zZXJ2ZXJDbG9zZUNvbXBsZXRlKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBDcmVhdGUgYW4gZXhwcmVzcyBhcHAgZm9yIHRoZSBwYXJzZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgbGV0IHlvdSBzcGVjaWZ5IHRoZSBtYXhVcGxvYWRTaXplIHdoZW4gY3JlYXRpbmcgdGhlIGV4cHJlc3MgYXBwICAqL1xuICBzdGF0aWMgYXBwKHsgbWF4VXBsb2FkU2l6ZSA9ICcyMG1iJywgYXBwSWQsIGRpcmVjdEFjY2VzcyB9KSB7XG4gICAgLy8gVGhpcyBhcHAgc2VydmVzIHRoZSBQYXJzZSBBUEkgZGlyZWN0bHkuXG4gICAgLy8gSXQncyB0aGUgZXF1aXZhbGVudCBvZiBodHRwczovL2FwaS5wYXJzZS5jb20vMSBpbiB0aGUgaG9zdGVkIFBhcnNlIEFQSS5cbiAgICB2YXIgYXBpID0gZXhwcmVzcygpO1xuICAgIC8vYXBpLnVzZShcIi9hcHBzXCIsIGV4cHJlc3Muc3RhdGljKF9fZGlybmFtZSArIFwiL3B1YmxpY1wiKSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd0Nyb3NzRG9tYWluKGFwcElkKSk7XG4gICAgLy8gRmlsZSBoYW5kbGluZyBuZWVkcyB0byBiZSBiZWZvcmUgZGVmYXVsdCBtaWRkbGV3YXJlcyBhcmUgYXBwbGllZFxuICAgIGFwaS51c2UoXG4gICAgICAnLycsXG4gICAgICBuZXcgRmlsZXNSb3V0ZXIoKS5leHByZXNzUm91dGVyKHtcbiAgICAgICAgbWF4VXBsb2FkU2l6ZTogbWF4VXBsb2FkU2l6ZSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGFwaS51c2UoJy9oZWFsdGgnLCBmdW5jdGlvbihyZXEsIHJlcykge1xuICAgICAgcmVzLmpzb24oe1xuICAgICAgICBzdGF0dXM6ICdvaycsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGFwaS51c2UoXG4gICAgICAnLycsXG4gICAgICBib2R5UGFyc2VyLnVybGVuY29kZWQoeyBleHRlbmRlZDogZmFsc2UgfSksXG4gICAgICBuZXcgUHVibGljQVBJUm91dGVyKCkuZXhwcmVzc1JvdXRlcigpXG4gICAgKTtcblxuICAgIGFwaS51c2UoYm9keVBhcnNlci5qc29uKHsgdHlwZTogJyovKicsIGxpbWl0OiBtYXhVcGxvYWRTaXplIH0pKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93TWV0aG9kT3ZlcnJpZGUpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzKTtcblxuICAgIGNvbnN0IGFwcFJvdXRlciA9IFBhcnNlU2VydmVyLnByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KTtcbiAgICBhcGkudXNlKGFwcFJvdXRlci5leHByZXNzUm91dGVyKCkpO1xuXG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUVycm9ycyk7XG5cbiAgICAvLyBydW4gdGhlIGZvbGxvd2luZyB3aGVuIG5vdCB0ZXN0aW5nXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICAvL1RoaXMgY2F1c2VzIHRlc3RzIHRvIHNwZXcgc29tZSB1c2VsZXNzIHdhcm5pbmdzLCBzbyBkaXNhYmxlIGluIHRlc3RcbiAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgICBwcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG4gICAgICAgICAgLy8gdXNlci1mcmllbmRseSBtZXNzYWdlIGZvciB0aGlzIGNvbW1vbiBlcnJvclxuICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKFxuICAgICAgICAgICAgYFVuYWJsZSB0byBsaXN0ZW4gb24gcG9ydCAke2Vyci5wb3J0fS4gVGhlIHBvcnQgaXMgYWxyZWFkeSBpbiB1c2UuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICAvLyB2ZXJpZnkgdGhlIHNlcnZlciB1cmwgYWZ0ZXIgYSAnbW91bnQnIGV2ZW50IGlzIHJlY2VpdmVkXG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgYXBpLm9uKCdtb3VudCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICBQYXJzZVNlcnZlci52ZXJpZnlTZXJ2ZXJVcmwoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICBwcm9jZXNzLmVudi5QQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTID09PSAnMScgfHxcbiAgICAgIGRpcmVjdEFjY2Vzc1xuICAgICkge1xuICAgICAgUGFyc2UuQ29yZU1hbmFnZXIuc2V0UkVTVENvbnRyb2xsZXIoXG4gICAgICAgIFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIoYXBwSWQsIGFwcFJvdXRlcilcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBhcGk7XG4gIH1cblxuICBzdGF0aWMgcHJvbWlzZVJvdXRlcih7IGFwcElkIH0pIHtcbiAgICBjb25zdCByb3V0ZXJzID0gW1xuICAgICAgbmV3IENsYXNzZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBVc2Vyc1JvdXRlcigpLFxuICAgICAgbmV3IFNlc3Npb25zUm91dGVyKCksXG4gICAgICBuZXcgUm9sZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBbmFseXRpY3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJbnN0YWxsYXRpb25zUm91dGVyKCksXG4gICAgICBuZXcgRnVuY3Rpb25zUm91dGVyKCksXG4gICAgICBuZXcgU2NoZW1hc1JvdXRlcigpLFxuICAgICAgbmV3IFB1c2hSb3V0ZXIoKSxcbiAgICAgIG5ldyBMb2dzUm91dGVyKCksXG4gICAgICBuZXcgSUFQVmFsaWRhdGlvblJvdXRlcigpLFxuICAgICAgbmV3IEZlYXR1cmVzUm91dGVyKCksXG4gICAgICBuZXcgR2xvYmFsQ29uZmlnUm91dGVyKCksXG4gICAgICBuZXcgR3JhcGhRTFJvdXRlcigpLFxuICAgICAgbmV3IFB1cmdlUm91dGVyKCksXG4gICAgICBuZXcgSG9va3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBDbG91ZENvZGVSb3V0ZXIoKSxcbiAgICAgIG5ldyBBdWRpZW5jZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBZ2dyZWdhdGVSb3V0ZXIoKSxcbiAgICBdO1xuXG4gICAgY29uc3Qgcm91dGVzID0gcm91dGVycy5yZWR1Y2UoKG1lbW8sIHJvdXRlcikgPT4ge1xuICAgICAgcmV0dXJuIG1lbW8uY29uY2F0KHJvdXRlci5yb3V0ZXMpO1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IGFwcFJvdXRlciA9IG5ldyBQcm9taXNlUm91dGVyKHJvdXRlcywgYXBwSWQpO1xuXG4gICAgYmF0Y2gubW91bnRPbnRvKGFwcFJvdXRlcik7XG4gICAgcmV0dXJuIGFwcFJvdXRlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBzdGFydHMgdGhlIHBhcnNlIHNlcnZlcidzIGV4cHJlc3MgYXBwXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRvIHVzZSB0byBzdGFydCB0aGUgc2VydmVyXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIGNhbGxlZCB3aGVuIHRoZSBzZXJ2ZXIgaGFzIHN0YXJ0ZWRcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGFydChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMsIGNhbGxiYWNrOiA/KCkgPT4gdm9pZCkge1xuICAgIGNvbnN0IGFwcCA9IGV4cHJlc3MoKTtcbiAgICBpZiAob3B0aW9ucy5taWRkbGV3YXJlKSB7XG4gICAgICBsZXQgbWlkZGxld2FyZTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5taWRkbGV3YXJlID09ICdzdHJpbmcnKSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBvcHRpb25zLm1pZGRsZXdhcmUpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSBvcHRpb25zLm1pZGRsZXdhcmU7IC8vIHVzZSBhcy1pcyBsZXQgZXhwcmVzcyBmYWlsXG4gICAgICB9XG4gICAgICBhcHAudXNlKG1pZGRsZXdhcmUpO1xuICAgIH1cblxuICAgIGFwcC51c2Uob3B0aW9ucy5tb3VudFBhdGgsIHRoaXMuYXBwKTtcblxuICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCA9PT0gdHJ1ZSB8fCBvcHRpb25zLm1vdW50UGxheWdyb3VuZCA9PT0gdHJ1ZSkge1xuICAgICAgbGV0IGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHVuZGVmaW5lZDtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnc3RyaW5nJykge1xuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSBwYXJzZShcbiAgICAgICAgICBmcy5yZWFkRmlsZVN5bmMob3B0aW9ucy5ncmFwaFFMU2NoZW1hLCAndXRmOCcpXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IG9wdGlvbnMuZ3JhcGhRTFNjaGVtYTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcGFyc2VHcmFwaFFMU2VydmVyID0gbmV3IFBhcnNlR3JhcGhRTFNlcnZlcih0aGlzLCB7XG4gICAgICAgIGdyYXBoUUxQYXRoOiBvcHRpb25zLmdyYXBoUUxQYXRoLFxuICAgICAgICBwbGF5Z3JvdW5kUGF0aDogb3B0aW9ucy5wbGF5Z3JvdW5kUGF0aCxcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlHcmFwaFFMKGFwcCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50UGxheWdyb3VuZCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlQbGF5Z3JvdW5kKGFwcCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgc2VydmVyID0gYXBwLmxpc3RlbihvcHRpb25zLnBvcnQsIG9wdGlvbnMuaG9zdCwgY2FsbGJhY2spO1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuXG4gICAgaWYgKG9wdGlvbnMuc3RhcnRMaXZlUXVlcnlTZXJ2ZXIgfHwgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zKSB7XG4gICAgICB0aGlzLmxpdmVRdWVyeVNlcnZlciA9IFBhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICAgICAgc2VydmVyLFxuICAgICAgICBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnNcbiAgICAgICk7XG4gICAgfVxuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICBjb25maWd1cmVMaXN0ZW5lcnModGhpcyk7XG4gICAgfVxuICAgIHRoaXMuZXhwcmVzc0FwcCA9IGFwcDtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFBhcnNlU2VydmVyIGFuZCBzdGFydHMgaXQuXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHVzZWQgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIGhhcyBzdGFydGVkXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIHN0YXJ0KG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucywgY2FsbGJhY2s6ID8oKSA9PiB2b2lkKSB7XG4gICAgY29uc3QgcGFyc2VTZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gICAgcmV0dXJuIHBhcnNlU2VydmVyLnN0YXJ0KG9wdGlvbnMsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIZWxwZXIgbWV0aG9kIHRvIGNyZWF0ZSBhIGxpdmVRdWVyeSBzZXJ2ZXJcbiAgICogQHN0YXRpY1xuICAgKiBAcGFyYW0ge1NlcnZlcn0gaHR0cFNlcnZlciBhbiBvcHRpb25hbCBodHRwIHNlcnZlciB0byBwYXNzXG4gICAqIEBwYXJhbSB7TGl2ZVF1ZXJ5U2VydmVyT3B0aW9uc30gY29uZmlnIG9wdGlvbnMgZm90IGhlIGxpdmVRdWVyeVNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VMaXZlUXVlcnlTZXJ2ZXJ9IHRoZSBsaXZlIHF1ZXJ5IHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIGNyZWF0ZUxpdmVRdWVyeVNlcnZlcihodHRwU2VydmVyLCBjb25maWc6IExpdmVRdWVyeVNlcnZlck9wdGlvbnMpIHtcbiAgICBpZiAoIWh0dHBTZXJ2ZXIgfHwgKGNvbmZpZyAmJiBjb25maWcucG9ydCkpIHtcbiAgICAgIHZhciBhcHAgPSBleHByZXNzKCk7XG4gICAgICBodHRwU2VydmVyID0gcmVxdWlyZSgnaHR0cCcpLmNyZWF0ZVNlcnZlcihhcHApO1xuICAgICAgaHR0cFNlcnZlci5saXN0ZW4oY29uZmlnLnBvcnQpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyKGh0dHBTZXJ2ZXIsIGNvbmZpZyk7XG4gIH1cblxuICBzdGF0aWMgdmVyaWZ5U2VydmVyVXJsKGNhbGxiYWNrKSB7XG4gICAgLy8gcGVyZm9ybSBhIGhlYWx0aCBjaGVjayBvbiB0aGUgc2VydmVyVVJMIHZhbHVlXG4gICAgaWYgKFBhcnNlLnNlcnZlclVSTCkge1xuICAgICAgY29uc3QgcmVxdWVzdCA9IHJlcXVpcmUoJy4vcmVxdWVzdCcpO1xuICAgICAgcmVxdWVzdCh7IHVybDogUGFyc2Uuc2VydmVyVVJMLnJlcGxhY2UoL1xcLyQvLCAnJykgKyAnL2hlYWx0aCcgfSlcbiAgICAgICAgLmNhdGNoKHJlc3BvbnNlID0+IHJlc3BvbnNlKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgY29uc3QganNvbiA9IHJlc3BvbnNlLmRhdGEgfHwgbnVsbDtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICByZXNwb25zZS5zdGF0dXMgIT09IDIwMCB8fFxuICAgICAgICAgICAgIWpzb24gfHxcbiAgICAgICAgICAgIChqc29uICYmIGpzb24uc3RhdHVzICE9PSAnb2snKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICBgXFxuV0FSTklORywgVW5hYmxlIHRvIGNvbm5lY3QgdG8gJyR7UGFyc2Uuc2VydmVyVVJMfScuYCArXG4gICAgICAgICAgICAgICAgYCBDbG91ZCBjb2RlIGFuZCBwdXNoIG5vdGlmaWNhdGlvbnMgbWF5IGJlIHVuYXZhaWxhYmxlIVxcbmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICBjYWxsYmFjayhmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICBjYWxsYmFjayh0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRQYXJzZUNsb3VkKCkge1xuICBjb25zdCBQYXJzZUNsb3VkID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkJyk7XG4gIE9iamVjdC5hc3NpZ24oUGFyc2UuQ2xvdWQsIFBhcnNlQ2xvdWQpO1xuICBnbG9iYWwuUGFyc2UgPSBQYXJzZTtcbn1cblxuZnVuY3Rpb24gaW5qZWN0RGVmYXVsdHMob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywga2V5KSkge1xuICAgICAgb3B0aW9uc1trZXldID0gZGVmYXVsdHNba2V5XTtcbiAgICB9XG4gIH0pO1xuXG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsICdzZXJ2ZXJVUkwnKSkge1xuICAgIG9wdGlvbnMuc2VydmVyVVJMID0gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtvcHRpb25zLnBvcnR9JHtvcHRpb25zLm1vdW50UGF0aH1gO1xuICB9XG5cbiAgLy8gUmVzZXJ2ZWQgQ2hhcmFjdGVyc1xuICBpZiAob3B0aW9ucy5hcHBJZCkge1xuICAgIGNvbnN0IHJlZ2V4ID0gL1shIyQlJygpKismLzo7PT9AW1xcXXt9Xix8PD5dL2c7XG4gICAgaWYgKG9wdGlvbnMuYXBwSWQubWF0Y2gocmVnZXgpKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5XQVJOSU5HLCBhcHBJZCB0aGF0IGNvbnRhaW5zIHNwZWNpYWwgY2hhcmFjdGVycyBjYW4gY2F1c2UgaXNzdWVzIHdoaWxlIHVzaW5nIHdpdGggdXJscy5cXG5gXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGlmIChvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMpIHtcbiAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgIXByb2Nlc3MuZW52LlRFU1RJTkcgJiZcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbkRFUFJFQ0FURUQ6IHVzZXJTZW5zaXRpdmVGaWVsZHMgaGFzIGJlZW4gcmVwbGFjZWQgYnkgcHJvdGVjdGVkRmllbGRzIGFsbG93aW5nIHRoZSBhYmlsaXR5IHRvIHByb3RlY3QgZmllbGRzIGluIGFsbCBjbGFzc2VzIHdpdGggQ0xQLiBcXG5gXG4gICAgICApO1xuICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuXG4gICAgY29uc3QgdXNlclNlbnNpdGl2ZUZpZWxkcyA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFtcbiAgICAgICAgLi4uKGRlZmF1bHRzLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pLFxuICAgICAgICAuLi4ob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKSxcbiAgICAgIF0pXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyBpcyB1bnNldCxcbiAgICAvLyBpdCdsbCBiZSBhc3NpZ25lZCB0aGUgZGVmYXVsdCBhYm92ZS5cbiAgICAvLyBIZXJlLCBwcm90ZWN0IGFnYWluc3QgdGhlIGNhc2Ugd2hlcmUgcHJvdGVjdGVkRmllbGRzXG4gICAgLy8gaXMgc2V0LCBidXQgZG9lc24ndCBoYXZlIF9Vc2VyLlxuICAgIGlmICghKCdfVXNlcicgaW4gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyA9IE9iamVjdC5hc3NpZ24oXG4gICAgICAgIHsgX1VzZXI6IFtdIH0sXG4gICAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzXG4gICAgICApO1xuICAgIH1cblxuICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbXG4gICAgICAgIC4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddIHx8IFtdKSxcbiAgICAgICAgLi4udXNlclNlbnNpdGl2ZUZpZWxkcyxcbiAgICAgIF0pXG4gICAgKTtcbiAgfVxuXG4gIC8vIE1lcmdlIHByb3RlY3RlZEZpZWxkcyBvcHRpb25zIHdpdGggZGVmYXVsdHMuXG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkcykuZm9yRWFjaChjID0+IHtcbiAgICBjb25zdCBjdXIgPSBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICBpZiAoIWN1cikge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY10gPSBkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgfSBlbHNlIHtcbiAgICAgIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXSkuZm9yRWFjaChyID0+IHtcbiAgICAgICAgY29uc3QgdW5xID0gbmV3IFNldChbXG4gICAgICAgICAgLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdIHx8IFtdKSxcbiAgICAgICAgICAuLi5kZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0sXG4gICAgICAgIF0pO1xuICAgICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSA9IEFycmF5LmZyb20odW5xKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgb3B0aW9ucy5tYXN0ZXJLZXlJcHMgPSBBcnJheS5mcm9tKFxuICAgIG5ldyBTZXQoXG4gICAgICBvcHRpb25zLm1hc3RlcktleUlwcy5jb25jYXQoZGVmYXVsdHMubWFzdGVyS2V5SXBzLCBvcHRpb25zLm1hc3RlcktleUlwcylcbiAgICApXG4gICk7XG59XG5cbi8vIFRob3NlIGNhbid0IGJlIHRlc3RlZCBhcyBpdCByZXF1aXJlcyBhIHN1YnByb2Nlc3Ncbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG5mdW5jdGlvbiBjb25maWd1cmVMaXN0ZW5lcnMocGFyc2VTZXJ2ZXIpIHtcbiAgY29uc3Qgc2VydmVyID0gcGFyc2VTZXJ2ZXIuc2VydmVyO1xuICBjb25zdCBzb2NrZXRzID0ge307XG4gIC8qIEN1cnJlbnRseSwgZXhwcmVzcyBkb2Vzbid0IHNodXQgZG93biBpbW1lZGlhdGVseSBhZnRlciByZWNlaXZpbmcgU0lHSU5UL1NJR1RFUk0gaWYgaXQgaGFzIGNsaWVudCBjb25uZWN0aW9ucyB0aGF0IGhhdmVuJ3QgdGltZWQgb3V0LiAoVGhpcyBpcyBhIGtub3duIGlzc3VlIHdpdGggbm9kZSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvMjY0MilcbiAgICBUaGlzIGZ1bmN0aW9uLCBhbG9uZyB3aXRoIGBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpYCwgaW50ZW5kIHRvIGZpeCB0aGlzIGJlaGF2aW9yIHN1Y2ggdGhhdCBwYXJzZSBzZXJ2ZXIgd2lsbCBjbG9zZSBhbGwgb3BlbiBjb25uZWN0aW9ucyBhbmQgaW5pdGlhdGUgdGhlIHNodXRkb3duIHByb2Nlc3MgYXMgc29vbiBhcyBpdCByZWNlaXZlcyBhIFNJR0lOVC9TSUdURVJNIHNpZ25hbC4gKi9cbiAgc2VydmVyLm9uKCdjb25uZWN0aW9uJywgc29ja2V0ID0+IHtcbiAgICBjb25zdCBzb2NrZXRJZCA9IHNvY2tldC5yZW1vdGVBZGRyZXNzICsgJzonICsgc29ja2V0LnJlbW90ZVBvcnQ7XG4gICAgc29ja2V0c1tzb2NrZXRJZF0gPSBzb2NrZXQ7XG4gICAgc29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIGRlbGV0ZSBzb2NrZXRzW3NvY2tldElkXTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgY29uc3QgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMgPSBmdW5jdGlvbigpIHtcbiAgICBmb3IgKGNvbnN0IHNvY2tldElkIGluIHNvY2tldHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHNvY2tldHNbc29ja2V0SWRdLmRlc3Ryb3koKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLyogKi9cbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgY29uc3QgaGFuZGxlU2h1dGRvd24gPSBmdW5jdGlvbigpIHtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnVGVybWluYXRpb24gc2lnbmFsIHJlY2VpdmVkLiBTaHV0dGluZyBkb3duLicpO1xuICAgIGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zKCk7XG4gICAgc2VydmVyLmNsb3NlKCk7XG4gICAgcGFyc2VTZXJ2ZXIuaGFuZGxlU2h1dGRvd24oKTtcbiAgfTtcbiAgcHJvY2Vzcy5vbignU0lHVEVSTScsIGhhbmRsZVNodXRkb3duKTtcbiAgcHJvY2Vzcy5vbignU0lHSU5UJywgaGFuZGxlU2h1dGRvd24pO1xufVxuXG5leHBvcnQgZGVmYXVsdCBQYXJzZVNlcnZlcjtcbiJdfQ==