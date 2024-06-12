// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
  bodyParser = require('body-parser'),
  express = require('express'),
  middlewares = require('./middlewares'),
  Parse = require('parse/node').Parse,
  { parse } = require('graphql'),
  path = require('path'),
  fs = require('fs');

import { LiveQueryServerOptions, ParseServerOptions } from './Options';
import defaults from './defaults';
import * as logging from './logger';
import Config from './Config';
import requiredParameter from './requiredParameter';
import { ParseLiveQueryServer } from './LiveQuery/ParseLiveQueryServer';
import * as controllers from './Controllers';
import { ParseGraphQLServer } from './GraphQL/ParseGraphQLServer';
import CheckRunner from './Security/CheckRunner';
import Deprecator from './Deprecator/Deprecator';
import { DefinedSchemas } from './SchemaMigrations/DefinedSchemas';
import OptionsDefinitions from './Options/Definitions';
import { api as apiApp, promiseRouter } from './api';
import { app } from './app';

// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

// ParseServer works like a constructor of an express api.
// https://parseplatform.org/parse-server/api/master/ParseServerOptions.html
class ParseServer {

  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options: ParseServerOptions) {
    // Scan for deprecated Parse Server options
    Deprecator.scanParseServerOptions(options);

    const interfaces = JSON.parse(JSON.stringify(OptionsDefinitions));

    function getValidObject(root) {
      const result = {};
      for (const key in root) {
        if (Object.prototype.hasOwnProperty.call(root[key], 'type')) {
          if (root[key].type.endsWith('[]')) {
            result[key] = [getValidObject(interfaces[root[key].type.slice(0, -2)])];
          } else {
            result[key] = getValidObject(interfaces[root[key].type]);
          }
        } else {
          result[key] = '';
        }
      }
      return result;
    }

    const optionsBlueprint = getValidObject(interfaces['ParseServerOptions']);

    function validateKeyNames(original, ref, name = '') {
      let result = [];
      const prefix = name + (name !== '' ? '.' : '');
      for (const key in original) {
        if (!Object.prototype.hasOwnProperty.call(ref, key)) {
          result.push(prefix + key);
        } else {
          if (ref[key] === '') continue;
          let res = [];
          if (Array.isArray(original[key]) && Array.isArray(ref[key])) {
            const type = ref[key][0];
            original[key].forEach((item, idx) => {
              if (typeof item === 'object' && item !== null) {
                res = res.concat(validateKeyNames(item, type, prefix + key + `[${idx}]`));
              }
            });
          } else if (typeof original[key] === 'object' && typeof ref[key] === 'object') {
            res = validateKeyNames(original[key], ref[key], prefix + key);
          }
          result = result.concat(res);
        }
      }
      return result;
    }

    const diff = validateKeyNames(options, optionsBlueprint);
    if (diff.length > 0) {
      const logger = logging.logger;
      logger.error(`Invalid Option Keys Found: ${diff.join(', ')}`);
    }

    // Set option defaults
    injectDefaults(options);
    const {
      appId = requiredParameter('You must provide an appId!'),
      masterKey = requiredParameter('You must provide a masterKey!'),
      javascriptKey,
      serverURL = requiredParameter('You must provide a serverURL!'),
    } = options;
    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    Config.validateOptions(options);
    const allControllers = controllers.getControllers(options);

    options.state = 'initialized';
    this.config = Config.put(Object.assign({}, options, allControllers));
    this.config.masterKeyIpsStore = new Map();
    this.config.maintenanceKeyIpsStore = new Map();
    logging.setLogger(allControllers.loggerController);
  }

  /**
   * Starts Parse Server as an express api; this promise resolves when Parse Server is ready to accept requests.
   */

  async start() {
    try {
      if (this.config.state === 'ok') {
        return this;
      }
      this.config.state = 'starting';
      Config.put(this.config);
      const {
        databaseController,
        hooksController,
        cacheController,
        cloud,
        security,
        schema,
        liveQueryController,
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
        startupPromises.push(new DefinedSchemas(schema, this.config).execute());
      }
      if (
        cacheController.adapter?.connect &&
        typeof cacheController.adapter.connect === 'function'
      ) {
        startupPromises.push(cacheController.adapter.connect());
      }
      startupPromises.push(liveQueryController.connect());
      await Promise.all(startupPromises);
      if (cloud) {
        addParseCloud();
        if (typeof cloud === 'function') {
          await Promise.resolve(cloud(Parse));
        } else if (typeof cloud === 'string') {
          let json;
          if (process.env.npm_package_json) {
            json = require(process.env.npm_package_json);
          }
          if (process.env.npm_package_type === 'module' || json?.type === 'module') {
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
        new CheckRunner(security).run();
      }
      this.config.state = 'ok';
      Config.put(this.config);
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
    const promises = [];
    const { adapter: databaseAdapter } = this.config.databaseController;
    if (databaseAdapter && typeof databaseAdapter.handleShutdown === 'function') {
      promises.push(databaseAdapter.handleShutdown());
    }
    const { adapter: fileAdapter } = this.config.filesController;
    if (fileAdapter && typeof fileAdapter.handleShutdown === 'function') {
      promises.push(fileAdapter.handleShutdown());
    }
    const { adapter: cacheAdapter } = this.config.cacheController;
    if (cacheAdapter && typeof cacheAdapter.handleShutdown === 'function') {
      promises.push(cacheAdapter.handleShutdown());
    }
    if (this.liveQueryServer?.server?.close) {
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
   * Create an express api for the parse server
   * @param {Object} options let you specify the maxUploadSize when creating the express api  */
  static app(options) {
    return apiApp;
  }

  static promiseRouter(opts) {
    promiseRouter(opts)
  }

  /**
   * starts the parse server's express api
   * @param {ParseServerOptions} options to use to start the server
   * @returns {ParseServer} the parse server instance
   */

  async startApp(options: ParseServerOptions) {
    try {
      await this.start();
    } catch (e) {
      console.error('Error on ParseServer.startApp: ', e);
      throw e;
    }
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
      } else if (
        typeof options.graphQLSchema === 'object' ||
        typeof options.graphQLSchema === 'function'
      ) {
        graphQLCustomTypeDefs = options.graphQLSchema;
      }

      const parseGraphQLServer = new ParseGraphQLServer(this, {
        graphQLPath: options.graphQLPath,
        playgroundPath: options.playgroundPath,
        graphQLCustomTypeDefs,
      });

      if (options.mountGraphQL) {
        parseGraphQLServer.applyGraphQL(app);
      }

      if (options.mountPlayground) {
        parseGraphQLServer.applyPlayground(app);
      }
    }
    const server = app;
    this.server = server;

    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = await ParseServer.createLiveQueryServer(
        server,
        options.liveQueryServerOptions,
        options
      );
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
  static async startApp(options: ParseServerOptions) {
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
  static async createLiveQueryServer(
    httpServer,
    config: LiveQueryServerOptions,
    options: ParseServerOptions
  ) {
    if (!httpServer || (config && config.port)) {
      var app = express();
      httpServer = require('http').createServer(app);
      // httpServer.listen(config.port);
    }
    const server = new ParseLiveQueryServer(httpServer, config, options);
    await server.connect();
    return server;
  }

  static async verifyServerUrl() {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
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
        console.warn(
          `\nWARNING, Unable to connect to '${Parse.serverURL}' as the URL is invalid.` +
            ` Cloud code and push notifications may be unavailable!\n`
        );
        return;
      }
      const request = require('./request');
      const response = await request({ url }).catch(response => response);
      const json = response.data || null;
      const retry = response.headers?.['retry-after'];
      if (retry) {
        await new Promise(resolve => setTimeout(resolve, retry * 1000));
        return this.verifyServerUrl();
      }
      if (response.status !== 200 || json?.status !== 'ok') {
        /* eslint-disable no-console */
        console.warn(
          `\nWARNING, Unable to connect to '${Parse.serverURL}'.` +
            ` Cloud code and push notifications may be unavailable!\n`
        );
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
      const conf = Config.get(Parse.applicationId);
      return { ...conf, ...ParseServer };
    },
    set(newVal) {
      newVal.appId = Parse.applicationId;
      Config.put(newVal);
    },
    configurable: true,
  });
  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}

function injectDefaults(options: ParseServerOptions) {
  Object.keys(defaults).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(options, key)) {
      options[key] = defaults[key];
    }
  });

  if (!Object.prototype.hasOwnProperty.call(options, 'serverURL')) {
    options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
  }

  // Reserved Characters
  if (options.appId) {
    const regex = /[!#$%'()*+&/:;=?@[\]{}^,|<>]/g;
    if (options.appId.match(regex)) {
      console.warn(
        `\nWARNING, appId that contains special characters can cause issues while using with urls.\n`
      );
    }
  }

  // Backwards compatibility
  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING &&
      console.warn(
        `\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`
      );
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(
      new Set([...(defaults.userSensitiveFields || []), ...(options.userSensitiveFields || [])])
    );

    // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.
    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({ _User: [] }, options.protectedFields);
    }

    options.protectedFields['_User']['*'] = Array.from(
      new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields])
    );
  }

  // Merge protectedFields options with defaults.
  Object.keys(defaults.protectedFields).forEach(c => {
    const cur = options.protectedFields[c];
    if (!cur) {
      options.protectedFields[c] = defaults.protectedFields[c];
    } else {
      Object.keys(defaults.protectedFields[c]).forEach(r => {
        const unq = new Set([
          ...(options.protectedFields[c][r] || []),
          ...defaults.protectedFields[c][r],
        ]);
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

export default ParseServer;
