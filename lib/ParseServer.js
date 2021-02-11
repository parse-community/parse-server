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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci5qcyJdLCJuYW1lcyI6WyJiYXRjaCIsInJlcXVpcmUiLCJib2R5UGFyc2VyIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXJzZSIsInBhdGgiLCJmcyIsImFkZFBhcnNlQ2xvdWQiLCJQYXJzZVNlcnZlciIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsImluamVjdERlZmF1bHRzIiwiYXBwSWQiLCJtYXN0ZXJLZXkiLCJjbG91ZCIsImphdmFzY3JpcHRLZXkiLCJzZXJ2ZXJVUkwiLCJzZXJ2ZXJTdGFydENvbXBsZXRlIiwiaW5pdGlhbGl6ZSIsImFsbENvbnRyb2xsZXJzIiwiY29udHJvbGxlcnMiLCJnZXRDb250cm9sbGVycyIsImxvZ2dlckNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJob29rc0NvbnRyb2xsZXIiLCJjb25maWciLCJDb25maWciLCJwdXQiLCJPYmplY3QiLCJhc3NpZ24iLCJsb2dnaW5nIiwic2V0TG9nZ2VyIiwiZGJJbml0UHJvbWlzZSIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsImhvb2tzTG9hZFByb21pc2UiLCJsb2FkIiwiUHJvbWlzZSIsImFsbCIsInRoZW4iLCJjYXRjaCIsImVycm9yIiwiY29uc29sZSIsInByb2Nlc3MiLCJleGl0IiwicmVzb2x2ZSIsImN3ZCIsImFwcCIsIl9hcHAiLCJoYW5kbGVTaHV0ZG93biIsInByb21pc2VzIiwiYWRhcHRlciIsImRhdGFiYXNlQWRhcHRlciIsInB1c2giLCJmaWxlQWRhcHRlciIsImZpbGVzQ29udHJvbGxlciIsImNhY2hlQWRhcHRlciIsImNhY2hlQ29udHJvbGxlciIsImxlbmd0aCIsInNlcnZlckNsb3NlQ29tcGxldGUiLCJtYXhVcGxvYWRTaXplIiwiZGlyZWN0QWNjZXNzIiwicGFnZXMiLCJhcGkiLCJ1c2UiLCJhbGxvd0Nyb3NzRG9tYWluIiwiRmlsZXNSb3V0ZXIiLCJleHByZXNzUm91dGVyIiwicmVxIiwicmVzIiwianNvbiIsInN0YXR1cyIsInVybGVuY29kZWQiLCJleHRlbmRlZCIsImVuYWJsZVJvdXRlciIsIlBhZ2VzUm91dGVyIiwiUHVibGljQVBJUm91dGVyIiwidHlwZSIsImxpbWl0IiwiYWxsb3dNZXRob2RPdmVycmlkZSIsImhhbmRsZVBhcnNlSGVhZGVycyIsImFwcFJvdXRlciIsInByb21pc2VSb3V0ZXIiLCJoYW5kbGVQYXJzZUVycm9ycyIsImVudiIsIlRFU1RJTkciLCJvbiIsImVyciIsImNvZGUiLCJzdGRlcnIiLCJ3cml0ZSIsInBvcnQiLCJ2ZXJpZnlTZXJ2ZXJVcmwiLCJQQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTIiwiQ29yZU1hbmFnZXIiLCJzZXRSRVNUQ29udHJvbGxlciIsInJvdXRlcnMiLCJDbGFzc2VzUm91dGVyIiwiVXNlcnNSb3V0ZXIiLCJTZXNzaW9uc1JvdXRlciIsIlJvbGVzUm91dGVyIiwiQW5hbHl0aWNzUm91dGVyIiwiSW5zdGFsbGF0aW9uc1JvdXRlciIsIkZ1bmN0aW9uc1JvdXRlciIsIlNjaGVtYXNSb3V0ZXIiLCJQdXNoUm91dGVyIiwiTG9nc1JvdXRlciIsIklBUFZhbGlkYXRpb25Sb3V0ZXIiLCJGZWF0dXJlc1JvdXRlciIsIkdsb2JhbENvbmZpZ1JvdXRlciIsIkdyYXBoUUxSb3V0ZXIiLCJQdXJnZVJvdXRlciIsIkhvb2tzUm91dGVyIiwiQ2xvdWRDb2RlUm91dGVyIiwiQXVkaWVuY2VzUm91dGVyIiwiQWdncmVnYXRlUm91dGVyIiwicm91dGVzIiwicmVkdWNlIiwibWVtbyIsInJvdXRlciIsImNvbmNhdCIsIlByb21pc2VSb3V0ZXIiLCJtb3VudE9udG8iLCJzdGFydCIsImNhbGxiYWNrIiwibWlkZGxld2FyZSIsIm1vdW50UGF0aCIsIm1vdW50R3JhcGhRTCIsIm1vdW50UGxheWdyb3VuZCIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsInVuZGVmaW5lZCIsImdyYXBoUUxTY2hlbWEiLCJyZWFkRmlsZVN5bmMiLCJwYXJzZUdyYXBoUUxTZXJ2ZXIiLCJQYXJzZUdyYXBoUUxTZXJ2ZXIiLCJncmFwaFFMUGF0aCIsInBsYXlncm91bmRQYXRoIiwiYXBwbHlHcmFwaFFMIiwiYXBwbHlQbGF5Z3JvdW5kIiwic2VydmVyIiwibGlzdGVuIiwiaG9zdCIsInN0YXJ0TGl2ZVF1ZXJ5U2VydmVyIiwibGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyIsImxpdmVRdWVyeVNlcnZlciIsImNyZWF0ZUxpdmVRdWVyeVNlcnZlciIsImNvbmZpZ3VyZUxpc3RlbmVycyIsImV4cHJlc3NBcHAiLCJwYXJzZVNlcnZlciIsImh0dHBTZXJ2ZXIiLCJjcmVhdGVTZXJ2ZXIiLCJQYXJzZUxpdmVRdWVyeVNlcnZlciIsInJlcXVlc3QiLCJ1cmwiLCJyZXBsYWNlIiwicmVzcG9uc2UiLCJkYXRhIiwid2FybiIsIlBhcnNlQ2xvdWQiLCJDbG91ZCIsImdsb2JhbCIsImtleXMiLCJkZWZhdWx0cyIsImZvckVhY2giLCJrZXkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJyZWdleCIsIm1hdGNoIiwidXNlclNlbnNpdGl2ZUZpZWxkcyIsIkFycmF5IiwiZnJvbSIsIlNldCIsInByb3RlY3RlZEZpZWxkcyIsIl9Vc2VyIiwiYyIsImN1ciIsInIiLCJ1bnEiLCJtYXN0ZXJLZXlJcHMiLCJzb2NrZXRzIiwic29ja2V0Iiwic29ja2V0SWQiLCJyZW1vdGVBZGRyZXNzIiwicmVtb3RlUG9ydCIsImRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zIiwiZGVzdHJveSIsImUiLCJzdGRvdXQiLCJjbG9zZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQVdBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQTFDQTtBQUVBLElBQUlBLEtBQUssR0FBR0MsT0FBTyxDQUFDLFNBQUQsQ0FBbkI7QUFBQSxJQUNFQyxVQUFVLEdBQUdELE9BQU8sQ0FBQyxhQUFELENBRHRCO0FBQUEsSUFFRUUsT0FBTyxHQUFHRixPQUFPLENBQUMsU0FBRCxDQUZuQjtBQUFBLElBR0VHLFdBQVcsR0FBR0gsT0FBTyxDQUFDLGVBQUQsQ0FIdkI7QUFBQSxJQUlFSSxLQUFLLEdBQUdKLE9BQU8sQ0FBQyxZQUFELENBQVAsQ0FBc0JJLEtBSmhDO0FBQUEsSUFLRTtBQUFFQyxFQUFBQTtBQUFGLElBQVlMLE9BQU8sQ0FBQyxTQUFELENBTHJCO0FBQUEsSUFNRU0sSUFBSSxHQUFHTixPQUFPLENBQUMsTUFBRCxDQU5oQjtBQUFBLElBT0VPLEVBQUUsR0FBR1AsT0FBTyxDQUFDLElBQUQsQ0FQZDs7QUEwQ0E7QUFDQVEsYUFBYSxHLENBRWI7QUFDQTs7QUFDQSxNQUFNQyxXQUFOLENBQWtCO0FBQ2hCO0FBQ0Y7QUFDQTtBQUNBO0FBQ0VDLEVBQUFBLFdBQVcsQ0FBQ0MsT0FBRCxFQUE4QjtBQUN2Q0MsSUFBQUEsY0FBYyxDQUFDRCxPQUFELENBQWQ7QUFDQSxVQUFNO0FBQ0pFLE1BQUFBLEtBQUssR0FBRyxnQ0FBa0IsNEJBQWxCLENBREo7QUFFSkMsTUFBQUEsU0FBUyxHQUFHLGdDQUFrQiwrQkFBbEIsQ0FGUjtBQUdKQyxNQUFBQSxLQUhJO0FBSUpDLE1BQUFBLGFBSkk7QUFLSkMsTUFBQUEsU0FBUyxHQUFHLGdDQUFrQiwrQkFBbEIsQ0FMUjtBQU1KQyxNQUFBQTtBQU5JLFFBT0ZQLE9BUEosQ0FGdUMsQ0FVdkM7O0FBQ0FQLElBQUFBLEtBQUssQ0FBQ2UsVUFBTixDQUFpQk4sS0FBakIsRUFBd0JHLGFBQWEsSUFBSSxRQUF6QyxFQUFtREYsU0FBbkQ7QUFDQVYsSUFBQUEsS0FBSyxDQUFDYSxTQUFOLEdBQWtCQSxTQUFsQjtBQUVBLFVBQU1HLGNBQWMsR0FBR0MsV0FBVyxDQUFDQyxjQUFaLENBQTJCWCxPQUEzQixDQUF2QjtBQUVBLFVBQU07QUFBRVksTUFBQUEsZ0JBQUY7QUFBb0JDLE1BQUFBLGtCQUFwQjtBQUF3Q0MsTUFBQUE7QUFBeEMsUUFBNERMLGNBQWxFO0FBQ0EsU0FBS00sTUFBTCxHQUFjQyxnQkFBT0MsR0FBUCxDQUFXQyxNQUFNLENBQUNDLE1BQVAsQ0FBYyxFQUFkLEVBQWtCbkIsT0FBbEIsRUFBMkJTLGNBQTNCLENBQVgsQ0FBZDtBQUVBVyxJQUFBQSxPQUFPLENBQUNDLFNBQVIsQ0FBa0JULGdCQUFsQjtBQUNBLFVBQU1VLGFBQWEsR0FBR1Qsa0JBQWtCLENBQUNVLHFCQUFuQixFQUF0QjtBQUNBLFVBQU1DLGdCQUFnQixHQUFHVixlQUFlLENBQUNXLElBQWhCLEVBQXpCLENBckJ1QyxDQXVCdkM7O0FBQ0FDLElBQUFBLE9BQU8sQ0FBQ0MsR0FBUixDQUFZLENBQUNMLGFBQUQsRUFBZ0JFLGdCQUFoQixDQUFaLEVBQ0dJLElBREgsQ0FDUSxNQUFNO0FBQ1YsVUFBSXJCLG1CQUFKLEVBQXlCO0FBQ3ZCQSxRQUFBQSxtQkFBbUI7QUFDcEI7QUFDRixLQUxILEVBTUdzQixLQU5ILENBTVNDLEtBQUssSUFBSTtBQUNkLFVBQUl2QixtQkFBSixFQUF5QjtBQUN2QkEsUUFBQUEsbUJBQW1CLENBQUN1QixLQUFELENBQW5CO0FBQ0QsT0FGRCxNQUVPO0FBQ0xDLFFBQUFBLE9BQU8sQ0FBQ0QsS0FBUixDQUFjQSxLQUFkO0FBQ0FFLFFBQUFBLE9BQU8sQ0FBQ0MsSUFBUixDQUFhLENBQWI7QUFDRDtBQUNGLEtBYkg7O0FBZUEsUUFBSTdCLEtBQUosRUFBVztBQUNUUCxNQUFBQSxhQUFhOztBQUNiLFVBQUksT0FBT08sS0FBUCxLQUFpQixVQUFyQixFQUFpQztBQUMvQkEsUUFBQUEsS0FBSyxDQUFDWCxLQUFELENBQUw7QUFDRCxPQUZELE1BRU8sSUFBSSxPQUFPVyxLQUFQLEtBQWlCLFFBQXJCLEVBQStCO0FBQ3BDZixRQUFBQSxPQUFPLENBQUNNLElBQUksQ0FBQ3VDLE9BQUwsQ0FBYUYsT0FBTyxDQUFDRyxHQUFSLEVBQWIsRUFBNEIvQixLQUE1QixDQUFELENBQVA7QUFDRCxPQUZNLE1BRUE7QUFDTCxjQUFNLHdEQUFOO0FBQ0Q7QUFDRjtBQUNGOztBQUVELE1BQUlnQyxHQUFKLEdBQVU7QUFDUixRQUFJLENBQUMsS0FBS0MsSUFBVixFQUFnQjtBQUNkLFdBQUtBLElBQUwsR0FBWXZDLFdBQVcsQ0FBQ3NDLEdBQVosQ0FBZ0IsS0FBS3JCLE1BQXJCLENBQVo7QUFDRDs7QUFDRCxXQUFPLEtBQUtzQixJQUFaO0FBQ0Q7O0FBRURDLEVBQUFBLGNBQWMsR0FBRztBQUNmLFVBQU1DLFFBQVEsR0FBRyxFQUFqQjtBQUNBLFVBQU07QUFBRUMsTUFBQUEsT0FBTyxFQUFFQztBQUFYLFFBQStCLEtBQUsxQixNQUFMLENBQVlGLGtCQUFqRDs7QUFDQSxRQUFJNEIsZUFBZSxJQUFJLE9BQU9BLGVBQWUsQ0FBQ0gsY0FBdkIsS0FBMEMsVUFBakUsRUFBNkU7QUFDM0VDLE1BQUFBLFFBQVEsQ0FBQ0csSUFBVCxDQUFjRCxlQUFlLENBQUNILGNBQWhCLEVBQWQ7QUFDRDs7QUFDRCxVQUFNO0FBQUVFLE1BQUFBLE9BQU8sRUFBRUc7QUFBWCxRQUEyQixLQUFLNUIsTUFBTCxDQUFZNkIsZUFBN0M7O0FBQ0EsUUFBSUQsV0FBVyxJQUFJLE9BQU9BLFdBQVcsQ0FBQ0wsY0FBbkIsS0FBc0MsVUFBekQsRUFBcUU7QUFDbkVDLE1BQUFBLFFBQVEsQ0FBQ0csSUFBVCxDQUFjQyxXQUFXLENBQUNMLGNBQVosRUFBZDtBQUNEOztBQUNELFVBQU07QUFBRUUsTUFBQUEsT0FBTyxFQUFFSztBQUFYLFFBQTRCLEtBQUs5QixNQUFMLENBQVkrQixlQUE5Qzs7QUFDQSxRQUFJRCxZQUFZLElBQUksT0FBT0EsWUFBWSxDQUFDUCxjQUFwQixLQUF1QyxVQUEzRCxFQUF1RTtBQUNyRUMsTUFBQUEsUUFBUSxDQUFDRyxJQUFULENBQWNHLFlBQVksQ0FBQ1AsY0FBYixFQUFkO0FBQ0Q7O0FBQ0QsV0FBTyxDQUFDQyxRQUFRLENBQUNRLE1BQVQsR0FBa0IsQ0FBbEIsR0FBc0JyQixPQUFPLENBQUNDLEdBQVIsQ0FBWVksUUFBWixDQUF0QixHQUE4Q2IsT0FBTyxDQUFDUSxPQUFSLEVBQS9DLEVBQWtFTixJQUFsRSxDQUF1RSxNQUFNO0FBQ2xGLFVBQUksS0FBS2IsTUFBTCxDQUFZaUMsbUJBQWhCLEVBQXFDO0FBQ25DLGFBQUtqQyxNQUFMLENBQVlpQyxtQkFBWjtBQUNEO0FBQ0YsS0FKTSxDQUFQO0FBS0Q7QUFFRDtBQUNGO0FBQ0E7QUFDQTs7O0FBQ0UsU0FBT1osR0FBUCxDQUFXcEMsT0FBWCxFQUFvQjtBQUNsQixVQUFNO0FBQUVpRCxNQUFBQSxhQUFhLEdBQUcsTUFBbEI7QUFBMEIvQyxNQUFBQSxLQUExQjtBQUFpQ2dELE1BQUFBLFlBQWpDO0FBQStDQyxNQUFBQTtBQUEvQyxRQUF5RG5ELE9BQS9ELENBRGtCLENBRWxCO0FBQ0E7O0FBQ0EsUUFBSW9ELEdBQUcsR0FBRzdELE9BQU8sRUFBakIsQ0FKa0IsQ0FLbEI7O0FBQ0E2RCxJQUFBQSxHQUFHLENBQUNDLEdBQUosQ0FBUTdELFdBQVcsQ0FBQzhELGdCQUFaLENBQTZCcEQsS0FBN0IsQ0FBUixFQU5rQixDQU9sQjs7QUFDQWtELElBQUFBLEdBQUcsQ0FBQ0MsR0FBSixDQUNFLEdBREYsRUFFRSxJQUFJRSx3QkFBSixHQUFrQkMsYUFBbEIsQ0FBZ0M7QUFDOUJQLE1BQUFBLGFBQWEsRUFBRUE7QUFEZSxLQUFoQyxDQUZGO0FBT0FHLElBQUFBLEdBQUcsQ0FBQ0MsR0FBSixDQUFRLFNBQVIsRUFBbUIsVUFBVUksR0FBVixFQUFlQyxHQUFmLEVBQW9CO0FBQ3JDQSxNQUFBQSxHQUFHLENBQUNDLElBQUosQ0FBUztBQUNQQyxRQUFBQSxNQUFNLEVBQUU7QUFERCxPQUFUO0FBR0QsS0FKRDtBQU1BUixJQUFBQSxHQUFHLENBQUNDLEdBQUosQ0FDRSxHQURGLEVBRUUvRCxVQUFVLENBQUN1RSxVQUFYLENBQXNCO0FBQUVDLE1BQUFBLFFBQVEsRUFBRTtBQUFaLEtBQXRCLENBRkYsRUFHRVgsS0FBSyxDQUFDWSxZQUFOLEdBQ0ksSUFBSUMsd0JBQUosQ0FBZ0JiLEtBQWhCLEVBQXVCSyxhQUF2QixFQURKLEdBRUksSUFBSVMsZ0NBQUosR0FBc0JULGFBQXRCLEVBTE47QUFRQUosSUFBQUEsR0FBRyxDQUFDQyxHQUFKLENBQVEvRCxVQUFVLENBQUNxRSxJQUFYLENBQWdCO0FBQUVPLE1BQUFBLElBQUksRUFBRSxLQUFSO0FBQWVDLE1BQUFBLEtBQUssRUFBRWxCO0FBQXRCLEtBQWhCLENBQVI7QUFDQUcsSUFBQUEsR0FBRyxDQUFDQyxHQUFKLENBQVE3RCxXQUFXLENBQUM0RSxtQkFBcEI7QUFDQWhCLElBQUFBLEdBQUcsQ0FBQ0MsR0FBSixDQUFRN0QsV0FBVyxDQUFDNkUsa0JBQXBCO0FBRUEsVUFBTUMsU0FBUyxHQUFHeEUsV0FBVyxDQUFDeUUsYUFBWixDQUEwQjtBQUFFckUsTUFBQUE7QUFBRixLQUExQixDQUFsQjtBQUNBa0QsSUFBQUEsR0FBRyxDQUFDQyxHQUFKLENBQVFpQixTQUFTLENBQUNkLGFBQVYsRUFBUjtBQUVBSixJQUFBQSxHQUFHLENBQUNDLEdBQUosQ0FBUTdELFdBQVcsQ0FBQ2dGLGlCQUFwQixFQXBDa0IsQ0FzQ2xCOztBQUNBLFFBQUksQ0FBQ3hDLE9BQU8sQ0FBQ3lDLEdBQVIsQ0FBWUMsT0FBakIsRUFBMEI7QUFDeEI7O0FBQ0E7QUFDQTFDLE1BQUFBLE9BQU8sQ0FBQzJDLEVBQVIsQ0FBVyxtQkFBWCxFQUFnQ0MsR0FBRyxJQUFJO0FBQ3JDLFlBQUlBLEdBQUcsQ0FBQ0MsSUFBSixLQUFhLFlBQWpCLEVBQStCO0FBQzdCO0FBQ0E3QyxVQUFBQSxPQUFPLENBQUM4QyxNQUFSLENBQWVDLEtBQWYsQ0FBc0IsNEJBQTJCSCxHQUFHLENBQUNJLElBQUssK0JBQTFEO0FBQ0FoRCxVQUFBQSxPQUFPLENBQUNDLElBQVIsQ0FBYSxDQUFiO0FBQ0QsU0FKRCxNQUlPO0FBQ0wsZ0JBQU0yQyxHQUFOO0FBQ0Q7QUFDRixPQVJELEVBSHdCLENBWXhCOztBQUNBOztBQUNBeEIsTUFBQUEsR0FBRyxDQUFDdUIsRUFBSixDQUFPLE9BQVAsRUFBZ0IsWUFBWTtBQUMxQjdFLFFBQUFBLFdBQVcsQ0FBQ21GLGVBQVo7QUFDRCxPQUZEO0FBR0Q7O0FBQ0QsUUFBSWpELE9BQU8sQ0FBQ3lDLEdBQVIsQ0FBWVMsOENBQVosS0FBK0QsR0FBL0QsSUFBc0VoQyxZQUExRSxFQUF3RjtBQUN0RnpELE1BQUFBLEtBQUssQ0FBQzBGLFdBQU4sQ0FBa0JDLGlCQUFsQixDQUFvQywwREFBMEJsRixLQUExQixFQUFpQ29FLFNBQWpDLENBQXBDO0FBQ0Q7O0FBQ0QsV0FBT2xCLEdBQVA7QUFDRDs7QUFFRCxTQUFPbUIsYUFBUCxDQUFxQjtBQUFFckUsSUFBQUE7QUFBRixHQUFyQixFQUFnQztBQUM5QixVQUFNbUYsT0FBTyxHQUFHLENBQ2QsSUFBSUMsNEJBQUosRUFEYyxFQUVkLElBQUlDLHdCQUFKLEVBRmMsRUFHZCxJQUFJQyw4QkFBSixFQUhjLEVBSWQsSUFBSUMsd0JBQUosRUFKYyxFQUtkLElBQUlDLGdDQUFKLEVBTGMsRUFNZCxJQUFJQyx3Q0FBSixFQU5jLEVBT2QsSUFBSUMsZ0NBQUosRUFQYyxFQVFkLElBQUlDLDRCQUFKLEVBUmMsRUFTZCxJQUFJQyxzQkFBSixFQVRjLEVBVWQsSUFBSUMsc0JBQUosRUFWYyxFQVdkLElBQUlDLHdDQUFKLEVBWGMsRUFZZCxJQUFJQyw4QkFBSixFQVpjLEVBYWQsSUFBSUMsc0NBQUosRUFiYyxFQWNkLElBQUlDLDRCQUFKLEVBZGMsRUFlZCxJQUFJQyx3QkFBSixFQWZjLEVBZ0JkLElBQUlDLHdCQUFKLEVBaEJjLEVBaUJkLElBQUlDLGdDQUFKLEVBakJjLEVBa0JkLElBQUlDLGdDQUFKLEVBbEJjLEVBbUJkLElBQUlDLGdDQUFKLEVBbkJjLENBQWhCO0FBc0JBLFVBQU1DLE1BQU0sR0FBR3BCLE9BQU8sQ0FBQ3FCLE1BQVIsQ0FBZSxDQUFDQyxJQUFELEVBQU9DLE1BQVAsS0FBa0I7QUFDOUMsYUFBT0QsSUFBSSxDQUFDRSxNQUFMLENBQVlELE1BQU0sQ0FBQ0gsTUFBbkIsQ0FBUDtBQUNELEtBRmMsRUFFWixFQUZZLENBQWY7QUFJQSxVQUFNbkMsU0FBUyxHQUFHLElBQUl3QyxzQkFBSixDQUFrQkwsTUFBbEIsRUFBMEJ2RyxLQUExQixDQUFsQjtBQUVBZCxJQUFBQSxLQUFLLENBQUMySCxTQUFOLENBQWdCekMsU0FBaEI7QUFDQSxXQUFPQSxTQUFQO0FBQ0Q7QUFFRDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNFMEMsRUFBQUEsS0FBSyxDQUFDaEgsT0FBRCxFQUE4QmlILFFBQTlCLEVBQXFEO0FBQ3hELFVBQU03RSxHQUFHLEdBQUc3QyxPQUFPLEVBQW5COztBQUNBLFFBQUlTLE9BQU8sQ0FBQ2tILFVBQVosRUFBd0I7QUFDdEIsVUFBSUEsVUFBSjs7QUFDQSxVQUFJLE9BQU9sSCxPQUFPLENBQUNrSCxVQUFmLElBQTZCLFFBQWpDLEVBQTJDO0FBQ3pDQSxRQUFBQSxVQUFVLEdBQUc3SCxPQUFPLENBQUNNLElBQUksQ0FBQ3VDLE9BQUwsQ0FBYUYsT0FBTyxDQUFDRyxHQUFSLEVBQWIsRUFBNEJuQyxPQUFPLENBQUNrSCxVQUFwQyxDQUFELENBQXBCO0FBQ0QsT0FGRCxNQUVPO0FBQ0xBLFFBQUFBLFVBQVUsR0FBR2xILE9BQU8sQ0FBQ2tILFVBQXJCLENBREssQ0FDNEI7QUFDbEM7O0FBQ0Q5RSxNQUFBQSxHQUFHLENBQUNpQixHQUFKLENBQVE2RCxVQUFSO0FBQ0Q7O0FBRUQ5RSxJQUFBQSxHQUFHLENBQUNpQixHQUFKLENBQVFyRCxPQUFPLENBQUNtSCxTQUFoQixFQUEyQixLQUFLL0UsR0FBaEM7O0FBRUEsUUFBSXBDLE9BQU8sQ0FBQ29ILFlBQVIsS0FBeUIsSUFBekIsSUFBaUNwSCxPQUFPLENBQUNxSCxlQUFSLEtBQTRCLElBQWpFLEVBQXVFO0FBQ3JFLFVBQUlDLHFCQUFxQixHQUFHQyxTQUE1Qjs7QUFDQSxVQUFJLE9BQU92SCxPQUFPLENBQUN3SCxhQUFmLEtBQWlDLFFBQXJDLEVBQStDO0FBQzdDRixRQUFBQSxxQkFBcUIsR0FBRzVILEtBQUssQ0FBQ0UsRUFBRSxDQUFDNkgsWUFBSCxDQUFnQnpILE9BQU8sQ0FBQ3dILGFBQXhCLEVBQXVDLE1BQXZDLENBQUQsQ0FBN0I7QUFDRCxPQUZELE1BRU8sSUFDTCxPQUFPeEgsT0FBTyxDQUFDd0gsYUFBZixLQUFpQyxRQUFqQyxJQUNBLE9BQU94SCxPQUFPLENBQUN3SCxhQUFmLEtBQWlDLFVBRjVCLEVBR0w7QUFDQUYsUUFBQUEscUJBQXFCLEdBQUd0SCxPQUFPLENBQUN3SCxhQUFoQztBQUNEOztBQUVELFlBQU1FLGtCQUFrQixHQUFHLElBQUlDLHNDQUFKLENBQXVCLElBQXZCLEVBQTZCO0FBQ3REQyxRQUFBQSxXQUFXLEVBQUU1SCxPQUFPLENBQUM0SCxXQURpQztBQUV0REMsUUFBQUEsY0FBYyxFQUFFN0gsT0FBTyxDQUFDNkgsY0FGOEI7QUFHdERQLFFBQUFBO0FBSHNELE9BQTdCLENBQTNCOztBQU1BLFVBQUl0SCxPQUFPLENBQUNvSCxZQUFaLEVBQTBCO0FBQ3hCTSxRQUFBQSxrQkFBa0IsQ0FBQ0ksWUFBbkIsQ0FBZ0MxRixHQUFoQztBQUNEOztBQUVELFVBQUlwQyxPQUFPLENBQUNxSCxlQUFaLEVBQTZCO0FBQzNCSyxRQUFBQSxrQkFBa0IsQ0FBQ0ssZUFBbkIsQ0FBbUMzRixHQUFuQztBQUNEO0FBQ0Y7O0FBRUQsVUFBTTRGLE1BQU0sR0FBRzVGLEdBQUcsQ0FBQzZGLE1BQUosQ0FBV2pJLE9BQU8sQ0FBQ2dGLElBQW5CLEVBQXlCaEYsT0FBTyxDQUFDa0ksSUFBakMsRUFBdUNqQixRQUF2QyxDQUFmO0FBQ0EsU0FBS2UsTUFBTCxHQUFjQSxNQUFkOztBQUVBLFFBQUloSSxPQUFPLENBQUNtSSxvQkFBUixJQUFnQ25JLE9BQU8sQ0FBQ29JLHNCQUE1QyxFQUFvRTtBQUNsRSxXQUFLQyxlQUFMLEdBQXVCdkksV0FBVyxDQUFDd0kscUJBQVosQ0FDckJOLE1BRHFCLEVBRXJCaEksT0FBTyxDQUFDb0ksc0JBRmEsRUFHckJwSSxPQUhxQixDQUF2QjtBQUtEO0FBQ0Q7OztBQUNBLFFBQUksQ0FBQ2dDLE9BQU8sQ0FBQ3lDLEdBQVIsQ0FBWUMsT0FBakIsRUFBMEI7QUFDeEI2RCxNQUFBQSxrQkFBa0IsQ0FBQyxJQUFELENBQWxCO0FBQ0Q7O0FBQ0QsU0FBS0MsVUFBTCxHQUFrQnBHLEdBQWxCO0FBQ0EsV0FBTyxJQUFQO0FBQ0Q7QUFFRDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNFLFNBQU80RSxLQUFQLENBQWFoSCxPQUFiLEVBQTBDaUgsUUFBMUMsRUFBaUU7QUFDL0QsVUFBTXdCLFdBQVcsR0FBRyxJQUFJM0ksV0FBSixDQUFnQkUsT0FBaEIsQ0FBcEI7QUFDQSxXQUFPeUksV0FBVyxDQUFDekIsS0FBWixDQUFrQmhILE9BQWxCLEVBQTJCaUgsUUFBM0IsQ0FBUDtBQUNEO0FBRUQ7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0UsU0FBT3FCLHFCQUFQLENBQ0VJLFVBREYsRUFFRTNILE1BRkYsRUFHRWYsT0FIRixFQUlFO0FBQ0EsUUFBSSxDQUFDMEksVUFBRCxJQUFnQjNILE1BQU0sSUFBSUEsTUFBTSxDQUFDaUUsSUFBckMsRUFBNEM7QUFDMUMsVUFBSTVDLEdBQUcsR0FBRzdDLE9BQU8sRUFBakI7QUFDQW1KLE1BQUFBLFVBQVUsR0FBR3JKLE9BQU8sQ0FBQyxNQUFELENBQVAsQ0FBZ0JzSixZQUFoQixDQUE2QnZHLEdBQTdCLENBQWI7QUFDQXNHLE1BQUFBLFVBQVUsQ0FBQ1QsTUFBWCxDQUFrQmxILE1BQU0sQ0FBQ2lFLElBQXpCO0FBQ0Q7O0FBQ0QsV0FBTyxJQUFJNEQsMENBQUosQ0FBeUJGLFVBQXpCLEVBQXFDM0gsTUFBckMsRUFBNkNmLE9BQTdDLENBQVA7QUFDRDs7QUFFRCxTQUFPaUYsZUFBUCxDQUF1QmdDLFFBQXZCLEVBQWlDO0FBQy9CO0FBQ0EsUUFBSXhILEtBQUssQ0FBQ2EsU0FBVixFQUFxQjtBQUNuQixZQUFNdUksT0FBTyxHQUFHeEosT0FBTyxDQUFDLFdBQUQsQ0FBdkI7O0FBQ0F3SixNQUFBQSxPQUFPLENBQUM7QUFBRUMsUUFBQUEsR0FBRyxFQUFFckosS0FBSyxDQUFDYSxTQUFOLENBQWdCeUksT0FBaEIsQ0FBd0IsS0FBeEIsRUFBK0IsRUFBL0IsSUFBcUM7QUFBNUMsT0FBRCxDQUFQLENBQ0dsSCxLQURILENBQ1NtSCxRQUFRLElBQUlBLFFBRHJCLEVBRUdwSCxJQUZILENBRVFvSCxRQUFRLElBQUk7QUFDaEIsY0FBTXJGLElBQUksR0FBR3FGLFFBQVEsQ0FBQ0MsSUFBVCxJQUFpQixJQUE5Qjs7QUFDQSxZQUFJRCxRQUFRLENBQUNwRixNQUFULEtBQW9CLEdBQXBCLElBQTJCLENBQUNELElBQTVCLElBQXFDQSxJQUFJLElBQUlBLElBQUksQ0FBQ0MsTUFBTCxLQUFnQixJQUFqRSxFQUF3RTtBQUN0RTtBQUNBN0IsVUFBQUEsT0FBTyxDQUFDbUgsSUFBUixDQUNHLG9DQUFtQ3pKLEtBQUssQ0FBQ2EsU0FBVSxJQUFwRCxHQUNHLDBEQUZMO0FBSUE7O0FBQ0EsY0FBSTJHLFFBQUosRUFBYztBQUNaQSxZQUFBQSxRQUFRLENBQUMsS0FBRCxDQUFSO0FBQ0Q7QUFDRixTQVZELE1BVU87QUFDTCxjQUFJQSxRQUFKLEVBQWM7QUFDWkEsWUFBQUEsUUFBUSxDQUFDLElBQUQsQ0FBUjtBQUNEO0FBQ0Y7QUFDRixPQW5CSDtBQW9CRDtBQUNGOztBQWpUZTs7QUFvVGxCLFNBQVNwSCxhQUFULEdBQXlCO0FBQ3ZCLFFBQU1zSixVQUFVLEdBQUc5SixPQUFPLENBQUMsMEJBQUQsQ0FBMUI7O0FBQ0E2QixFQUFBQSxNQUFNLENBQUNDLE1BQVAsQ0FBYzFCLEtBQUssQ0FBQzJKLEtBQXBCLEVBQTJCRCxVQUEzQjtBQUNBRSxFQUFBQSxNQUFNLENBQUM1SixLQUFQLEdBQWVBLEtBQWY7QUFDRDs7QUFFRCxTQUFTUSxjQUFULENBQXdCRCxPQUF4QixFQUFxRDtBQUNuRGtCLEVBQUFBLE1BQU0sQ0FBQ29JLElBQVAsQ0FBWUMsaUJBQVosRUFBc0JDLE9BQXRCLENBQThCQyxHQUFHLElBQUk7QUFDbkMsUUFBSSxDQUFDdkksTUFBTSxDQUFDd0ksU0FBUCxDQUFpQkMsY0FBakIsQ0FBZ0NDLElBQWhDLENBQXFDNUosT0FBckMsRUFBOEN5SixHQUE5QyxDQUFMLEVBQXlEO0FBQ3ZEekosTUFBQUEsT0FBTyxDQUFDeUosR0FBRCxDQUFQLEdBQWVGLGtCQUFTRSxHQUFULENBQWY7QUFDRDtBQUNGLEdBSkQ7O0FBTUEsTUFBSSxDQUFDdkksTUFBTSxDQUFDd0ksU0FBUCxDQUFpQkMsY0FBakIsQ0FBZ0NDLElBQWhDLENBQXFDNUosT0FBckMsRUFBOEMsV0FBOUMsQ0FBTCxFQUFpRTtBQUMvREEsSUFBQUEsT0FBTyxDQUFDTSxTQUFSLEdBQXFCLG9CQUFtQk4sT0FBTyxDQUFDZ0YsSUFBSyxHQUFFaEYsT0FBTyxDQUFDbUgsU0FBVSxFQUF6RTtBQUNELEdBVGtELENBV25EOzs7QUFDQSxNQUFJbkgsT0FBTyxDQUFDRSxLQUFaLEVBQW1CO0FBQ2pCLFVBQU0ySixLQUFLLEdBQUcsK0JBQWQ7O0FBQ0EsUUFBSTdKLE9BQU8sQ0FBQ0UsS0FBUixDQUFjNEosS0FBZCxDQUFvQkQsS0FBcEIsQ0FBSixFQUFnQztBQUM5QjlILE1BQUFBLE9BQU8sQ0FBQ21ILElBQVIsQ0FDRyw2RkFESDtBQUdEO0FBQ0YsR0FuQmtELENBcUJuRDs7O0FBQ0EsTUFBSWxKLE9BQU8sQ0FBQytKLG1CQUFaLEVBQWlDO0FBQy9CO0FBQ0EsS0FBQy9ILE9BQU8sQ0FBQ3lDLEdBQVIsQ0FBWUMsT0FBYixJQUNFM0MsT0FBTyxDQUFDbUgsSUFBUixDQUNHLDJJQURILENBREY7QUFJQTs7QUFFQSxVQUFNYSxtQkFBbUIsR0FBR0MsS0FBSyxDQUFDQyxJQUFOLENBQzFCLElBQUlDLEdBQUosQ0FBUSxDQUFDLElBQUlYLGtCQUFTUSxtQkFBVCxJQUFnQyxFQUFwQyxDQUFELEVBQTBDLElBQUkvSixPQUFPLENBQUMrSixtQkFBUixJQUErQixFQUFuQyxDQUExQyxDQUFSLENBRDBCLENBQTVCLENBUitCLENBWS9CO0FBQ0E7QUFDQTtBQUNBOztBQUNBLFFBQUksRUFBRSxXQUFXL0osT0FBTyxDQUFDbUssZUFBckIsQ0FBSixFQUEyQztBQUN6Q25LLE1BQUFBLE9BQU8sQ0FBQ21LLGVBQVIsR0FBMEJqSixNQUFNLENBQUNDLE1BQVAsQ0FBYztBQUFFaUosUUFBQUEsS0FBSyxFQUFFO0FBQVQsT0FBZCxFQUE2QnBLLE9BQU8sQ0FBQ21LLGVBQXJDLENBQTFCO0FBQ0Q7O0FBRURuSyxJQUFBQSxPQUFPLENBQUNtSyxlQUFSLENBQXdCLE9BQXhCLEVBQWlDLEdBQWpDLElBQXdDSCxLQUFLLENBQUNDLElBQU4sQ0FDdEMsSUFBSUMsR0FBSixDQUFRLENBQUMsSUFBSWxLLE9BQU8sQ0FBQ21LLGVBQVIsQ0FBd0IsT0FBeEIsRUFBaUMsR0FBakMsS0FBeUMsRUFBN0MsQ0FBRCxFQUFtRCxHQUFHSixtQkFBdEQsQ0FBUixDQURzQyxDQUF4QztBQUdELEdBN0NrRCxDQStDbkQ7OztBQUNBN0ksRUFBQUEsTUFBTSxDQUFDb0ksSUFBUCxDQUFZQyxrQkFBU1ksZUFBckIsRUFBc0NYLE9BQXRDLENBQThDYSxDQUFDLElBQUk7QUFDakQsVUFBTUMsR0FBRyxHQUFHdEssT0FBTyxDQUFDbUssZUFBUixDQUF3QkUsQ0FBeEIsQ0FBWjs7QUFDQSxRQUFJLENBQUNDLEdBQUwsRUFBVTtBQUNSdEssTUFBQUEsT0FBTyxDQUFDbUssZUFBUixDQUF3QkUsQ0FBeEIsSUFBNkJkLGtCQUFTWSxlQUFULENBQXlCRSxDQUF6QixDQUE3QjtBQUNELEtBRkQsTUFFTztBQUNMbkosTUFBQUEsTUFBTSxDQUFDb0ksSUFBUCxDQUFZQyxrQkFBU1ksZUFBVCxDQUF5QkUsQ0FBekIsQ0FBWixFQUF5Q2IsT0FBekMsQ0FBaURlLENBQUMsSUFBSTtBQUNwRCxjQUFNQyxHQUFHLEdBQUcsSUFBSU4sR0FBSixDQUFRLENBQ2xCLElBQUlsSyxPQUFPLENBQUNtSyxlQUFSLENBQXdCRSxDQUF4QixFQUEyQkUsQ0FBM0IsS0FBaUMsRUFBckMsQ0FEa0IsRUFFbEIsR0FBR2hCLGtCQUFTWSxlQUFULENBQXlCRSxDQUF6QixFQUE0QkUsQ0FBNUIsQ0FGZSxDQUFSLENBQVo7QUFJQXZLLFFBQUFBLE9BQU8sQ0FBQ21LLGVBQVIsQ0FBd0JFLENBQXhCLEVBQTJCRSxDQUEzQixJQUFnQ1AsS0FBSyxDQUFDQyxJQUFOLENBQVdPLEdBQVgsQ0FBaEM7QUFDRCxPQU5EO0FBT0Q7QUFDRixHQWJEO0FBZUF4SyxFQUFBQSxPQUFPLENBQUN5SyxZQUFSLEdBQXVCVCxLQUFLLENBQUNDLElBQU4sQ0FDckIsSUFBSUMsR0FBSixDQUFRbEssT0FBTyxDQUFDeUssWUFBUixDQUFxQjVELE1BQXJCLENBQTRCMEMsa0JBQVNrQixZQUFyQyxFQUFtRHpLLE9BQU8sQ0FBQ3lLLFlBQTNELENBQVIsQ0FEcUIsQ0FBdkI7QUFHRCxDLENBRUQ7O0FBQ0E7OztBQUNBLFNBQVNsQyxrQkFBVCxDQUE0QkUsV0FBNUIsRUFBeUM7QUFDdkMsUUFBTVQsTUFBTSxHQUFHUyxXQUFXLENBQUNULE1BQTNCO0FBQ0EsUUFBTTBDLE9BQU8sR0FBRyxFQUFoQjtBQUNBO0FBQ0Y7O0FBQ0UxQyxFQUFBQSxNQUFNLENBQUNyRCxFQUFQLENBQVUsWUFBVixFQUF3QmdHLE1BQU0sSUFBSTtBQUNoQyxVQUFNQyxRQUFRLEdBQUdELE1BQU0sQ0FBQ0UsYUFBUCxHQUF1QixHQUF2QixHQUE2QkYsTUFBTSxDQUFDRyxVQUFyRDtBQUNBSixJQUFBQSxPQUFPLENBQUNFLFFBQUQsQ0FBUCxHQUFvQkQsTUFBcEI7QUFDQUEsSUFBQUEsTUFBTSxDQUFDaEcsRUFBUCxDQUFVLE9BQVYsRUFBbUIsTUFBTTtBQUN2QixhQUFPK0YsT0FBTyxDQUFDRSxRQUFELENBQWQ7QUFDRCxLQUZEO0FBR0QsR0FORDs7QUFRQSxRQUFNRyx1QkFBdUIsR0FBRyxZQUFZO0FBQzFDLFNBQUssTUFBTUgsUUFBWCxJQUF1QkYsT0FBdkIsRUFBZ0M7QUFDOUIsVUFBSTtBQUNGQSxRQUFBQSxPQUFPLENBQUNFLFFBQUQsQ0FBUCxDQUFrQkksT0FBbEI7QUFDRCxPQUZELENBRUUsT0FBT0MsQ0FBUCxFQUFVO0FBQ1Y7QUFDRDtBQUNGO0FBQ0YsR0FSRDs7QUFVQSxRQUFNM0ksY0FBYyxHQUFHLFlBQVk7QUFDakNOLElBQUFBLE9BQU8sQ0FBQ2tKLE1BQVIsQ0FBZW5HLEtBQWYsQ0FBcUIsNkNBQXJCO0FBQ0FnRyxJQUFBQSx1QkFBdUI7QUFDdkIvQyxJQUFBQSxNQUFNLENBQUNtRCxLQUFQO0FBQ0ExQyxJQUFBQSxXQUFXLENBQUNuRyxjQUFaO0FBQ0QsR0FMRDs7QUFNQU4sRUFBQUEsT0FBTyxDQUFDMkMsRUFBUixDQUFXLFNBQVgsRUFBc0JyQyxjQUF0QjtBQUNBTixFQUFBQSxPQUFPLENBQUMyQyxFQUFSLENBQVcsUUFBWCxFQUFxQnJDLGNBQXJCO0FBQ0Q7O2VBRWN4QyxXIiwic291cmNlc0NvbnRlbnQiOlsiLy8gUGFyc2VTZXJ2ZXIgLSBvcGVuLXNvdXJjZSBjb21wYXRpYmxlIEFQSSBTZXJ2ZXIgZm9yIFBhcnNlIGFwcHNcblxudmFyIGJhdGNoID0gcmVxdWlyZSgnLi9iYXRjaCcpLFxuICBib2R5UGFyc2VyID0gcmVxdWlyZSgnYm9keS1wYXJzZXInKSxcbiAgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKSxcbiAgbWlkZGxld2FyZXMgPSByZXF1aXJlKCcuL21pZGRsZXdhcmVzJyksXG4gIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlLFxuICB7IHBhcnNlIH0gPSByZXF1aXJlKCdncmFwaHFsJyksXG4gIHBhdGggPSByZXF1aXJlKCdwYXRoJyksXG4gIGZzID0gcmVxdWlyZSgnZnMnKTtcblxuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zLCBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuL2RlZmF1bHRzJztcbmltcG9ydCAqIGFzIGxvZ2dpbmcgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0IHsgQW5hbHl0aWNzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FuYWx5dGljc1JvdXRlcic7XG5pbXBvcnQgeyBDbGFzc2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmVhdHVyZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmVhdHVyZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmlsZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmlsZXNSb3V0ZXInO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBHbG9iYWxDb25maWdSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR2xvYmFsQ29uZmlnUm91dGVyJztcbmltcG9ydCB7IEdyYXBoUUxSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR3JhcGhRTFJvdXRlcic7XG5pbXBvcnQgeyBIb29rc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Ib29rc1JvdXRlcic7XG5pbXBvcnQgeyBJQVBWYWxpZGF0aW9uUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0lBUFZhbGlkYXRpb25Sb3V0ZXInO1xuaW1wb3J0IHsgSW5zdGFsbGF0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9JbnN0YWxsYXRpb25zUm91dGVyJztcbmltcG9ydCB7IExvZ3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvTG9nc1JvdXRlcic7XG5pbXBvcnQgeyBQYXJzZUxpdmVRdWVyeVNlcnZlciB9IGZyb20gJy4vTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyJztcbmltcG9ydCB7IFBhZ2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1BhZ2VzUm91dGVyJztcbmltcG9ydCB7IFB1YmxpY0FQSVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdWJsaWNBUElSb3V0ZXInO1xuaW1wb3J0IHsgUHVzaFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXNoUm91dGVyJztcbmltcG9ydCB7IENsb3VkQ29kZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbG91ZENvZGVSb3V0ZXInO1xuaW1wb3J0IHsgUm9sZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUm9sZXNSb3V0ZXInO1xuaW1wb3J0IHsgU2NoZW1hc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IFNlc3Npb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1Nlc3Npb25zUm91dGVyJztcbmltcG9ydCB7IFVzZXJzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCB7IFB1cmdlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1cmdlUm91dGVyJztcbmltcG9ydCB7IEF1ZGllbmNlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BdWRpZW5jZXNSb3V0ZXInO1xuaW1wb3J0IHsgQWdncmVnYXRlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyIH0gZnJvbSAnLi9QYXJzZVNlcnZlclJFU1RDb250cm9sbGVyJztcbmltcG9ydCAqIGFzIGNvbnRyb2xsZXJzIGZyb20gJy4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMU2VydmVyIH0gZnJvbSAnLi9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlcic7XG5cbi8vIE11dGF0ZSB0aGUgUGFyc2Ugb2JqZWN0IHRvIGFkZCB0aGUgQ2xvdWQgQ29kZSBoYW5kbGVyc1xuYWRkUGFyc2VDbG91ZCgpO1xuXG4vLyBQYXJzZVNlcnZlciB3b3JrcyBsaWtlIGEgY29uc3RydWN0b3Igb2YgYW4gZXhwcmVzcyBhcHAuXG4vLyBodHRwczovL3BhcnNlcGxhdGZvcm0ub3JnL3BhcnNlLXNlcnZlci9hcGkvbWFzdGVyL1BhcnNlU2VydmVyT3B0aW9ucy5odG1sXG5jbGFzcyBQYXJzZVNlcnZlciB7XG4gIC8qKlxuICAgKiBAY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdGhlIHBhcnNlIHNlcnZlciBpbml0aWFsaXphdGlvbiBvcHRpb25zXG4gICAqL1xuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICBpbmplY3REZWZhdWx0cyhvcHRpb25zKTtcbiAgICBjb25zdCB7XG4gICAgICBhcHBJZCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGFuIGFwcElkIScpLFxuICAgICAgbWFzdGVyS2V5ID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBtYXN0ZXJLZXkhJyksXG4gICAgICBjbG91ZCxcbiAgICAgIGphdmFzY3JpcHRLZXksXG4gICAgICBzZXJ2ZXJVUkwgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIHNlcnZlclVSTCEnKSxcbiAgICAgIHNlcnZlclN0YXJ0Q29tcGxldGUsXG4gICAgfSA9IG9wdGlvbnM7XG4gICAgLy8gSW5pdGlhbGl6ZSB0aGUgbm9kZSBjbGllbnQgU0RLIGF1dG9tYXRpY2FsbHlcbiAgICBQYXJzZS5pbml0aWFsaXplKGFwcElkLCBqYXZhc2NyaXB0S2V5IHx8ICd1bnVzZWQnLCBtYXN0ZXJLZXkpO1xuICAgIFBhcnNlLnNlcnZlclVSTCA9IHNlcnZlclVSTDtcblxuICAgIGNvbnN0IGFsbENvbnRyb2xsZXJzID0gY29udHJvbGxlcnMuZ2V0Q29udHJvbGxlcnMob3B0aW9ucyk7XG5cbiAgICBjb25zdCB7IGxvZ2dlckNvbnRyb2xsZXIsIGRhdGFiYXNlQ29udHJvbGxlciwgaG9va3NDb250cm9sbGVyIH0gPSBhbGxDb250cm9sbGVycztcbiAgICB0aGlzLmNvbmZpZyA9IENvbmZpZy5wdXQoT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywgYWxsQ29udHJvbGxlcnMpKTtcblxuICAgIGxvZ2dpbmcuc2V0TG9nZ2VyKGxvZ2dlckNvbnRyb2xsZXIpO1xuICAgIGNvbnN0IGRiSW5pdFByb21pc2UgPSBkYXRhYmFzZUNvbnRyb2xsZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKCk7XG4gICAgY29uc3QgaG9va3NMb2FkUHJvbWlzZSA9IGhvb2tzQ29udHJvbGxlci5sb2FkKCk7XG5cbiAgICAvLyBOb3RlOiBUZXN0cyB3aWxsIHN0YXJ0IHRvIGZhaWwgaWYgYW55IHZhbGlkYXRpb24gaGFwcGVucyBhZnRlciB0aGlzIGlzIGNhbGxlZC5cbiAgICBQcm9taXNlLmFsbChbZGJJbml0UHJvbWlzZSwgaG9va3NMb2FkUHJvbWlzZV0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGlmIChzZXJ2ZXJTdGFydENvbXBsZXRlKSB7XG4gICAgICAgICAgc2VydmVyU3RhcnRDb21wbGV0ZSgpO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKHNlcnZlclN0YXJ0Q29tcGxldGUpIHtcbiAgICAgICAgICBzZXJ2ZXJTdGFydENvbXBsZXRlKGVycm9yKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgaWYgKGNsb3VkKSB7XG4gICAgICBhZGRQYXJzZUNsb3VkKCk7XG4gICAgICBpZiAodHlwZW9mIGNsb3VkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGNsb3VkKFBhcnNlKTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNsb3VkID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBjbG91ZCkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgXCJhcmd1bWVudCAnY2xvdWQnIG11c3QgZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgZnVuY3Rpb25cIjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgYXBwKCkge1xuICAgIGlmICghdGhpcy5fYXBwKSB7XG4gICAgICB0aGlzLl9hcHAgPSBQYXJzZVNlcnZlci5hcHAodGhpcy5jb25maWcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fYXBwO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcbiAgICBjb25zdCB7IGFkYXB0ZXI6IGRhdGFiYXNlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuZGF0YWJhc2VDb250cm9sbGVyO1xuICAgIGlmIChkYXRhYmFzZUFkYXB0ZXIgJiYgdHlwZW9mIGRhdGFiYXNlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGNvbnN0IHsgYWRhcHRlcjogZmlsZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlcjtcbiAgICBpZiAoZmlsZUFkYXB0ZXIgJiYgdHlwZW9mIGZpbGVBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGZpbGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGNhY2hlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyO1xuICAgIGlmIChjYWNoZUFkYXB0ZXIgJiYgdHlwZW9mIGNhY2hlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIHJldHVybiAocHJvbWlzZXMubGVuZ3RoID4gMCA/IFByb21pc2UuYWxsKHByb21pc2VzKSA6IFByb21pc2UucmVzb2x2ZSgpKS50aGVuKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5zZXJ2ZXJDbG9zZUNvbXBsZXRlKSB7XG4gICAgICAgIHRoaXMuY29uZmlnLnNlcnZlckNsb3NlQ29tcGxldGUoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3RhdGljXG4gICAqIENyZWF0ZSBhbiBleHByZXNzIGFwcCBmb3IgdGhlIHBhcnNlIHNlcnZlclxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBsZXQgeW91IHNwZWNpZnkgdGhlIG1heFVwbG9hZFNpemUgd2hlbiBjcmVhdGluZyB0aGUgZXhwcmVzcyBhcHAgICovXG4gIHN0YXRpYyBhcHAob3B0aW9ucykge1xuICAgIGNvbnN0IHsgbWF4VXBsb2FkU2l6ZSA9ICcyMG1iJywgYXBwSWQsIGRpcmVjdEFjY2VzcywgcGFnZXMgfSA9IG9wdGlvbnM7XG4gICAgLy8gVGhpcyBhcHAgc2VydmVzIHRoZSBQYXJzZSBBUEkgZGlyZWN0bHkuXG4gICAgLy8gSXQncyB0aGUgZXF1aXZhbGVudCBvZiBodHRwczovL2FwaS5wYXJzZS5jb20vMSBpbiB0aGUgaG9zdGVkIFBhcnNlIEFQSS5cbiAgICB2YXIgYXBpID0gZXhwcmVzcygpO1xuICAgIC8vYXBpLnVzZShcIi9hcHBzXCIsIGV4cHJlc3Muc3RhdGljKF9fZGlybmFtZSArIFwiL3B1YmxpY1wiKSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd0Nyb3NzRG9tYWluKGFwcElkKSk7XG4gICAgLy8gRmlsZSBoYW5kbGluZyBuZWVkcyB0byBiZSBiZWZvcmUgZGVmYXVsdCBtaWRkbGV3YXJlcyBhcmUgYXBwbGllZFxuICAgIGFwaS51c2UoXG4gICAgICAnLycsXG4gICAgICBuZXcgRmlsZXNSb3V0ZXIoKS5leHByZXNzUm91dGVyKHtcbiAgICAgICAgbWF4VXBsb2FkU2l6ZTogbWF4VXBsb2FkU2l6ZSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGFwaS51c2UoJy9oZWFsdGgnLCBmdW5jdGlvbiAocmVxLCByZXMpIHtcbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgc3RhdHVzOiAnb2snLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgYm9keVBhcnNlci51cmxlbmNvZGVkKHsgZXh0ZW5kZWQ6IGZhbHNlIH0pLFxuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyXG4gICAgICAgID8gbmV3IFBhZ2VzUm91dGVyKHBhZ2VzKS5leHByZXNzUm91dGVyKClcbiAgICAgICAgOiBuZXcgUHVibGljQVBJUm91dGVyKCkuZXhwcmVzc1JvdXRlcigpXG4gICAgKTtcblxuICAgIGFwaS51c2UoYm9keVBhcnNlci5qc29uKHsgdHlwZTogJyovKicsIGxpbWl0OiBtYXhVcGxvYWRTaXplIH0pKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93TWV0aG9kT3ZlcnJpZGUpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzKTtcblxuICAgIGNvbnN0IGFwcFJvdXRlciA9IFBhcnNlU2VydmVyLnByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KTtcbiAgICBhcGkudXNlKGFwcFJvdXRlci5leHByZXNzUm91dGVyKCkpO1xuXG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUVycm9ycyk7XG5cbiAgICAvLyBydW4gdGhlIGZvbGxvd2luZyB3aGVuIG5vdCB0ZXN0aW5nXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICAvL1RoaXMgY2F1c2VzIHRlc3RzIHRvIHNwZXcgc29tZSB1c2VsZXNzIHdhcm5pbmdzLCBzbyBkaXNhYmxlIGluIHRlc3RcbiAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgICBwcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG4gICAgICAgICAgLy8gdXNlci1mcmllbmRseSBtZXNzYWdlIGZvciB0aGlzIGNvbW1vbiBlcnJvclxuICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKGBVbmFibGUgdG8gbGlzdGVuIG9uIHBvcnQgJHtlcnIucG9ydH0uIFRoZSBwb3J0IGlzIGFscmVhZHkgaW4gdXNlLmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgLy8gdmVyaWZ5IHRoZSBzZXJ2ZXIgdXJsIGFmdGVyIGEgJ21vdW50JyBldmVudCBpcyByZWNlaXZlZFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIGFwaS5vbignbW91bnQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIFBhcnNlU2VydmVyLnZlcmlmeVNlcnZlclVybCgpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIGlmIChwcm9jZXNzLmVudi5QQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTID09PSAnMScgfHwgZGlyZWN0QWNjZXNzKSB7XG4gICAgICBQYXJzZS5Db3JlTWFuYWdlci5zZXRSRVNUQ29udHJvbGxlcihQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyKGFwcElkLCBhcHBSb3V0ZXIpKTtcbiAgICB9XG4gICAgcmV0dXJuIGFwaTtcbiAgfVxuXG4gIHN0YXRpYyBwcm9taXNlUm91dGVyKHsgYXBwSWQgfSkge1xuICAgIGNvbnN0IHJvdXRlcnMgPSBbXG4gICAgICBuZXcgQ2xhc3Nlc1JvdXRlcigpLFxuICAgICAgbmV3IFVzZXJzUm91dGVyKCksXG4gICAgICBuZXcgU2Vzc2lvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBSb2xlc1JvdXRlcigpLFxuICAgICAgbmV3IEFuYWx5dGljc1JvdXRlcigpLFxuICAgICAgbmV3IEluc3RhbGxhdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBGdW5jdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTY2hlbWFzUm91dGVyKCksXG4gICAgICBuZXcgUHVzaFJvdXRlcigpLFxuICAgICAgbmV3IExvZ3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJQVBWYWxpZGF0aW9uUm91dGVyKCksXG4gICAgICBuZXcgRmVhdHVyZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBHbG9iYWxDb25maWdSb3V0ZXIoKSxcbiAgICAgIG5ldyBHcmFwaFFMUm91dGVyKCksXG4gICAgICBuZXcgUHVyZ2VSb3V0ZXIoKSxcbiAgICAgIG5ldyBIb29rc1JvdXRlcigpLFxuICAgICAgbmV3IENsb3VkQ29kZVJvdXRlcigpLFxuICAgICAgbmV3IEF1ZGllbmNlc1JvdXRlcigpLFxuICAgICAgbmV3IEFnZ3JlZ2F0ZVJvdXRlcigpLFxuICAgIF07XG5cbiAgICBjb25zdCByb3V0ZXMgPSByb3V0ZXJzLnJlZHVjZSgobWVtbywgcm91dGVyKSA9PiB7XG4gICAgICByZXR1cm4gbWVtby5jb25jYXQocm91dGVyLnJvdXRlcyk7XG4gICAgfSwgW10pO1xuXG4gICAgY29uc3QgYXBwUm91dGVyID0gbmV3IFByb21pc2VSb3V0ZXIocm91dGVzLCBhcHBJZCk7XG5cbiAgICBiYXRjaC5tb3VudE9udG8oYXBwUm91dGVyKTtcbiAgICByZXR1cm4gYXBwUm91dGVyO1xuICB9XG5cbiAgLyoqXG4gICAqIHN0YXJ0cyB0aGUgcGFyc2Ugc2VydmVyJ3MgZXhwcmVzcyBhcHBcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdG8gdXNlIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgY2FsbGVkIHdoZW4gdGhlIHNlcnZlciBoYXMgc3RhcnRlZFxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXJ0KG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucywgY2FsbGJhY2s6ID8oKSA9PiB2b2lkKSB7XG4gICAgY29uc3QgYXBwID0gZXhwcmVzcygpO1xuICAgIGlmIChvcHRpb25zLm1pZGRsZXdhcmUpIHtcbiAgICAgIGxldCBtaWRkbGV3YXJlO1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLm1pZGRsZXdhcmUgPT0gJ3N0cmluZycpIHtcbiAgICAgICAgbWlkZGxld2FyZSA9IHJlcXVpcmUocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIG9wdGlvbnMubWlkZGxld2FyZSkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWlkZGxld2FyZSA9IG9wdGlvbnMubWlkZGxld2FyZTsgLy8gdXNlIGFzLWlzIGxldCBleHByZXNzIGZhaWxcbiAgICAgIH1cbiAgICAgIGFwcC51c2UobWlkZGxld2FyZSk7XG4gICAgfVxuXG4gICAgYXBwLnVzZShvcHRpb25zLm1vdW50UGF0aCwgdGhpcy5hcHApO1xuXG4gICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMID09PSB0cnVlIHx8IG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kID09PSB0cnVlKSB7XG4gICAgICBsZXQgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gdW5kZWZpbmVkO1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcnNlKGZzLnJlYWRGaWxlU3luYyhvcHRpb25zLmdyYXBoUUxTY2hlbWEsICd1dGY4JykpO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ29iamVjdCcgfHxcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IG9wdGlvbnMuZ3JhcGhRTFNjaGVtYTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcGFyc2VHcmFwaFFMU2VydmVyID0gbmV3IFBhcnNlR3JhcGhRTFNlcnZlcih0aGlzLCB7XG4gICAgICAgIGdyYXBoUUxQYXRoOiBvcHRpb25zLmdyYXBoUUxQYXRoLFxuICAgICAgICBwbGF5Z3JvdW5kUGF0aDogb3B0aW9ucy5wbGF5Z3JvdW5kUGF0aCxcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlHcmFwaFFMKGFwcCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50UGxheWdyb3VuZCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlQbGF5Z3JvdW5kKGFwcCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgc2VydmVyID0gYXBwLmxpc3RlbihvcHRpb25zLnBvcnQsIG9wdGlvbnMuaG9zdCwgY2FsbGJhY2spO1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuXG4gICAgaWYgKG9wdGlvbnMuc3RhcnRMaXZlUXVlcnlTZXJ2ZXIgfHwgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zKSB7XG4gICAgICB0aGlzLmxpdmVRdWVyeVNlcnZlciA9IFBhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICAgICAgc2VydmVyLFxuICAgICAgICBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnMsXG4gICAgICAgIG9wdGlvbnNcbiAgICAgICk7XG4gICAgfVxuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICBjb25maWd1cmVMaXN0ZW5lcnModGhpcyk7XG4gICAgfVxuICAgIHRoaXMuZXhwcmVzc0FwcCA9IGFwcDtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFBhcnNlU2VydmVyIGFuZCBzdGFydHMgaXQuXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHVzZWQgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIGhhcyBzdGFydGVkXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIHN0YXJ0KG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucywgY2FsbGJhY2s6ID8oKSA9PiB2b2lkKSB7XG4gICAgY29uc3QgcGFyc2VTZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gICAgcmV0dXJuIHBhcnNlU2VydmVyLnN0YXJ0KG9wdGlvbnMsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIZWxwZXIgbWV0aG9kIHRvIGNyZWF0ZSBhIGxpdmVRdWVyeSBzZXJ2ZXJcbiAgICogQHN0YXRpY1xuICAgKiBAcGFyYW0ge1NlcnZlcn0gaHR0cFNlcnZlciBhbiBvcHRpb25hbCBodHRwIHNlcnZlciB0byBwYXNzXG4gICAqIEBwYXJhbSB7TGl2ZVF1ZXJ5U2VydmVyT3B0aW9uc30gY29uZmlnIG9wdGlvbnMgZm9yIHRoZSBsaXZlUXVlcnlTZXJ2ZXJcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgb3B0aW9ucyBmb3IgdGhlIFBhcnNlU2VydmVyXG4gICAqIEByZXR1cm5zIHtQYXJzZUxpdmVRdWVyeVNlcnZlcn0gdGhlIGxpdmUgcXVlcnkgc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGF0aWMgY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyKFxuICAgIGh0dHBTZXJ2ZXIsXG4gICAgY29uZmlnOiBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zLFxuICAgIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9uc1xuICApIHtcbiAgICBpZiAoIWh0dHBTZXJ2ZXIgfHwgKGNvbmZpZyAmJiBjb25maWcucG9ydCkpIHtcbiAgICAgIHZhciBhcHAgPSBleHByZXNzKCk7XG4gICAgICBodHRwU2VydmVyID0gcmVxdWlyZSgnaHR0cCcpLmNyZWF0ZVNlcnZlcihhcHApO1xuICAgICAgaHR0cFNlcnZlci5saXN0ZW4oY29uZmlnLnBvcnQpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyKGh0dHBTZXJ2ZXIsIGNvbmZpZywgb3B0aW9ucyk7XG4gIH1cblxuICBzdGF0aWMgdmVyaWZ5U2VydmVyVXJsKGNhbGxiYWNrKSB7XG4gICAgLy8gcGVyZm9ybSBhIGhlYWx0aCBjaGVjayBvbiB0aGUgc2VydmVyVVJMIHZhbHVlXG4gICAgaWYgKFBhcnNlLnNlcnZlclVSTCkge1xuICAgICAgY29uc3QgcmVxdWVzdCA9IHJlcXVpcmUoJy4vcmVxdWVzdCcpO1xuICAgICAgcmVxdWVzdCh7IHVybDogUGFyc2Uuc2VydmVyVVJMLnJlcGxhY2UoL1xcLyQvLCAnJykgKyAnL2hlYWx0aCcgfSlcbiAgICAgICAgLmNhdGNoKHJlc3BvbnNlID0+IHJlc3BvbnNlKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgY29uc3QganNvbiA9IHJlc3BvbnNlLmRhdGEgfHwgbnVsbDtcbiAgICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSAyMDAgfHwgIWpzb24gfHwgKGpzb24gJiYganNvbi5zdGF0dXMgIT09ICdvaycpKSB7XG4gICAgICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9Jy5gICtcbiAgICAgICAgICAgICAgICBgIENsb3VkIGNvZGUgYW5kIHB1c2ggbm90aWZpY2F0aW9ucyBtYXkgYmUgdW5hdmFpbGFibGUhXFxuYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgIGNhbGxiYWNrKGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgIGNhbGxiYWNrKHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZFBhcnNlQ2xvdWQoKSB7XG4gIGNvbnN0IFBhcnNlQ2xvdWQgPSByZXF1aXJlKCcuL2Nsb3VkLWNvZGUvUGFyc2UuQ2xvdWQnKTtcbiAgT2JqZWN0LmFzc2lnbihQYXJzZS5DbG91ZCwgUGFyc2VDbG91ZCk7XG4gIGdsb2JhbC5QYXJzZSA9IFBhcnNlO1xufVxuXG5mdW5jdGlvbiBpbmplY3REZWZhdWx0cyhvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvcHRpb25zLCBrZXkpKSB7XG4gICAgICBvcHRpb25zW2tleV0gPSBkZWZhdWx0c1trZXldO1xuICAgIH1cbiAgfSk7XG5cbiAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywgJ3NlcnZlclVSTCcpKSB7XG4gICAgb3B0aW9ucy5zZXJ2ZXJVUkwgPSBgaHR0cDovL2xvY2FsaG9zdDoke29wdGlvbnMucG9ydH0ke29wdGlvbnMubW91bnRQYXRofWA7XG4gIH1cblxuICAvLyBSZXNlcnZlZCBDaGFyYWN0ZXJzXG4gIGlmIChvcHRpb25zLmFwcElkKSB7XG4gICAgY29uc3QgcmVnZXggPSAvWyEjJCUnKCkqKyYvOjs9P0BbXFxde31eLHw8Pl0vZztcbiAgICBpZiAob3B0aW9ucy5hcHBJZC5tYXRjaChyZWdleCkpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbldBUk5JTkcsIGFwcElkIHRoYXQgY29udGFpbnMgc3BlY2lhbCBjaGFyYWN0ZXJzIGNhbiBjYXVzZSBpc3N1ZXMgd2hpbGUgdXNpbmcgd2l0aCB1cmxzLlxcbmBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gQmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbiAgaWYgKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcykge1xuICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAhcHJvY2Vzcy5lbnYuVEVTVElORyAmJlxuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuREVQUkVDQVRFRDogdXNlclNlbnNpdGl2ZUZpZWxkcyBoYXMgYmVlbiByZXBsYWNlZCBieSBwcm90ZWN0ZWRGaWVsZHMgYWxsb3dpbmcgdGhlIGFiaWxpdHkgdG8gcHJvdGVjdCBmaWVsZHMgaW4gYWxsIGNsYXNzZXMgd2l0aCBDTFAuIFxcbmBcbiAgICAgICk7XG4gICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG5cbiAgICBjb25zdCB1c2VyU2Vuc2l0aXZlRmllbGRzID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoWy4uLihkZWZhdWx0cy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKSwgLi4uKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcyB8fCBbXSldKVxuICAgICk7XG5cbiAgICAvLyBJZiB0aGUgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgaXMgdW5zZXQsXG4gICAgLy8gaXQnbGwgYmUgYXNzaWduZWQgdGhlIGRlZmF1bHQgYWJvdmUuXG4gICAgLy8gSGVyZSwgcHJvdGVjdCBhZ2FpbnN0IHRoZSBjYXNlIHdoZXJlIHByb3RlY3RlZEZpZWxkc1xuICAgIC8vIGlzIHNldCwgYnV0IGRvZXNuJ3QgaGF2ZSBfVXNlci5cbiAgICBpZiAoISgnX1VzZXInIGluIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgPSBPYmplY3QuYXNzaWduKHsgX1VzZXI6IFtdIH0sIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzKTtcbiAgICB9XG5cbiAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoWy4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddIHx8IFtdKSwgLi4udXNlclNlbnNpdGl2ZUZpZWxkc10pXG4gICAgKTtcbiAgfVxuXG4gIC8vIE1lcmdlIHByb3RlY3RlZEZpZWxkcyBvcHRpb25zIHdpdGggZGVmYXVsdHMuXG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkcykuZm9yRWFjaChjID0+IHtcbiAgICBjb25zdCBjdXIgPSBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICBpZiAoIWN1cikge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY10gPSBkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgfSBlbHNlIHtcbiAgICAgIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXSkuZm9yRWFjaChyID0+IHtcbiAgICAgICAgY29uc3QgdW5xID0gbmV3IFNldChbXG4gICAgICAgICAgLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdIHx8IFtdKSxcbiAgICAgICAgICAuLi5kZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0sXG4gICAgICAgIF0pO1xuICAgICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSA9IEFycmF5LmZyb20odW5xKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgb3B0aW9ucy5tYXN0ZXJLZXlJcHMgPSBBcnJheS5mcm9tKFxuICAgIG5ldyBTZXQob3B0aW9ucy5tYXN0ZXJLZXlJcHMuY29uY2F0KGRlZmF1bHRzLm1hc3RlcktleUlwcywgb3B0aW9ucy5tYXN0ZXJLZXlJcHMpKVxuICApO1xufVxuXG4vLyBUaG9zZSBjYW4ndCBiZSB0ZXN0ZWQgYXMgaXQgcmVxdWlyZXMgYSBzdWJwcm9jZXNzXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuZnVuY3Rpb24gY29uZmlndXJlTGlzdGVuZXJzKHBhcnNlU2VydmVyKSB7XG4gIGNvbnN0IHNlcnZlciA9IHBhcnNlU2VydmVyLnNlcnZlcjtcbiAgY29uc3Qgc29ja2V0cyA9IHt9O1xuICAvKiBDdXJyZW50bHksIGV4cHJlc3MgZG9lc24ndCBzaHV0IGRvd24gaW1tZWRpYXRlbHkgYWZ0ZXIgcmVjZWl2aW5nIFNJR0lOVC9TSUdURVJNIGlmIGl0IGhhcyBjbGllbnQgY29ubmVjdGlvbnMgdGhhdCBoYXZlbid0IHRpbWVkIG91dC4gKFRoaXMgaXMgYSBrbm93biBpc3N1ZSB3aXRoIG5vZGUgLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvaXNzdWVzLzI2NDIpXG4gICAgVGhpcyBmdW5jdGlvbiwgYWxvbmcgd2l0aCBgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKWAsIGludGVuZCB0byBmaXggdGhpcyBiZWhhdmlvciBzdWNoIHRoYXQgcGFyc2Ugc2VydmVyIHdpbGwgY2xvc2UgYWxsIG9wZW4gY29ubmVjdGlvbnMgYW5kIGluaXRpYXRlIHRoZSBzaHV0ZG93biBwcm9jZXNzIGFzIHNvb24gYXMgaXQgcmVjZWl2ZXMgYSBTSUdJTlQvU0lHVEVSTSBzaWduYWwuICovXG4gIHNlcnZlci5vbignY29ubmVjdGlvbicsIHNvY2tldCA9PiB7XG4gICAgY29uc3Qgc29ja2V0SWQgPSBzb2NrZXQucmVtb3RlQWRkcmVzcyArICc6JyArIHNvY2tldC5yZW1vdGVQb3J0O1xuICAgIHNvY2tldHNbc29ja2V0SWRdID0gc29ja2V0O1xuICAgIHNvY2tldC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICBkZWxldGUgc29ja2V0c1tzb2NrZXRJZF07XG4gICAgfSk7XG4gIH0pO1xuXG4gIGNvbnN0IGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zID0gZnVuY3Rpb24gKCkge1xuICAgIGZvciAoY29uc3Qgc29ja2V0SWQgaW4gc29ja2V0cykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgc29ja2V0c1tzb2NrZXRJZF0uZGVzdHJveSgpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvKiAqL1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBjb25zdCBoYW5kbGVTaHV0ZG93biA9IGZ1bmN0aW9uICgpIHtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnVGVybWluYXRpb24gc2lnbmFsIHJlY2VpdmVkLiBTaHV0dGluZyBkb3duLicpO1xuICAgIGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zKCk7XG4gICAgc2VydmVyLmNsb3NlKCk7XG4gICAgcGFyc2VTZXJ2ZXIuaGFuZGxlU2h1dGRvd24oKTtcbiAgfTtcbiAgcHJvY2Vzcy5vbignU0lHVEVSTScsIGhhbmRsZVNodXRkb3duKTtcbiAgcHJvY2Vzcy5vbignU0lHSU5UJywgaGFuZGxlU2h1dGRvd24pO1xufVxuXG5leHBvcnQgZGVmYXVsdCBQYXJzZVNlcnZlcjtcbiJdfQ==