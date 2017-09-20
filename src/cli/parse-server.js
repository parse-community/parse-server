/* eslint-disable no-console */
import express from 'express';
import ParseServer from '../index';
import definitions from './definitions/parse-server';
import cluster from 'cluster';
import os from 'os';
import runner from './utils/runner';
const path = require("path");

const help = function(){
  console.log('  Get Started guide:');
  console.log('');
  console.log('    Please have a look at the get started guide!');
  console.log('    https://github.com/ParsePlatform/parse-server/wiki/Parse-Server-Guide');
  console.log('');
  console.log('');
  console.log('  Usage with npm start');
  console.log('');
  console.log('    $ npm start -- path/to/config.json');
  console.log('    $ npm start -- --appId APP_ID --masterKey MASTER_KEY --serverURL serverURL');
  console.log('    $ npm start -- --appId APP_ID --masterKey MASTER_KEY --serverURL serverURL');
  console.log('');
  console.log('');
  console.log('  Usage:');
  console.log('');
  console.log('    $ parse-server path/to/config.json');
  console.log('    $ parse-server -- --appId APP_ID --masterKey MASTER_KEY --serverURL serverURL');
  console.log('    $ parse-server -- --appId APP_ID --masterKey MASTER_KEY --serverURL serverURL');
  console.log('');
};

function startServer(options, callback) {
  const app = express();
  if (options.middleware) {
    let middleware;
    if (typeof options.middleware == 'function') {
      middleware = options.middleware;
    } if (typeof options.middleware == 'string') {
      middleware = require(path.resolve(process.cwd(), options.middleware));
    } else {
      throw "middleware should be a string or a function";
    }
    app.use(middleware);
  }

  const parseServer = new ParseServer(options);
  const sockets = {};
  app.use(options.mountPath, parseServer.app);

  const server = app.listen(options.port, options.host, callback);
  server.on('connection', initializeConnections);

  if (options.startLiveQueryServer || options.liveQueryServerOptions) {
    let liveQueryServer = server;
    if (options.liveQueryPort) {
      liveQueryServer = express().listen(options.liveQueryPort, () => {
        console.log('ParseLiveQuery listening on ' + options.liveQueryPort);
      });
    }
    ParseServer.createLiveQueryServer(liveQueryServer, options.liveQueryServerOptions);
  }

  function initializeConnections(socket) {
    /* Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM if it has client connections that haven't timed out. (This is a known issue with node - https://github.com/nodejs/node/issues/2642)

      This function, along with `destroyAliveConnections()`, intend to fix this behavior such that parse server will close all open connections and initiate the shutdown process as soon as it receives a SIGINT/SIGTERM signal. */

    const socketId = socket.remoteAddress + ':' + socket.remotePort;
    sockets[socketId] = socket;

    socket.on('close', () => {
      delete sockets[socketId];
    });
  }

  function destroyAliveConnections() {
    for (const socketId in sockets) {
      try {
        sockets[socketId].destroy();
      } catch (e) { /* */ }
    }
  }

  const handleShutdown = function() {
    console.log('Termination signal received. Shutting down.');
    destroyAliveConnections();
    server.close();
    parseServer.handleShutdown();
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}


runner({
  definitions,
  help,
  usage: '[options] <path/to/configuration.json>',
  start: function(program, options, logOptions) {
    if (!options.serverURL) {
      options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
    }

    if (!options.appId || !options.masterKey || !options.serverURL) {
      program.outputHelp();
      console.error("");
      console.error('\u001b[31mERROR: appId and masterKey are required\u001b[0m');
      console.error("");
      process.exit(1);
    }

    if (options["liveQuery.classNames"]) {
      options.liveQuery = options.liveQuery || {};
      options.liveQuery.classNames = options["liveQuery.classNames"];
      delete options["liveQuery.classNames"];
    }
    if (options["liveQuery.redisURL"]) {
      options.liveQuery = options.liveQuery || {};
      options.liveQuery.redisURL = options["liveQuery.redisURL"];
      delete options["liveQuery.redisURL"];
    }

    if (options.cluster) {
      const numCPUs = typeof options.cluster === 'number' ? options.cluster : os.cpus().length;
      if (cluster.isMaster) {
        logOptions();
        for(let i = 0; i < numCPUs; i++) {
          cluster.fork();
        }
        cluster.on('exit', (worker, code) => {
          console.log(`worker ${worker.process.pid} died (${code})... Restarting`);
          cluster.fork();
        });
      } else {
        startServer(options, () => {
          console.log('[' + process.pid + '] parse-server running on ' + options.serverURL);
        });
      }
    } else {
      startServer(options, () => {
        logOptions();
        console.log('');
        console.log('[' + process.pid + '] parse-server running on ' + options.serverURL);
      });
    }
  }
});

/* eslint-enable no-console */
