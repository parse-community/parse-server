import path from 'path';
import express from 'express';
import { ParseServer } from '../index';
import definitions from './definitions/parse-server';
import cluster from 'cluster';
import os from 'os';
import runner from './utils/runner';

const help = function(){
  console.log('  Get Started guide:');
  console.log('');
  console.log('    Please have a look at the get started guide!')
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
  const api = new ParseServer(options);
  app.use(options.mountPath, api);

  var server = app.listen(options.port, callback);
  if (options.startLiveQueryServer || options.liveQueryServerOptions) {
    ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions);
  }
  var handleShutdown = function() {
    console.log('Termination signal received. Shutting down.');
    server.close(function () {
      process.exit(0);
    });
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
        for(var i = 0; i < numCPUs; i++) {
          cluster.fork();
        }
        cluster.on('exit', (worker, code, signal) => {
          console.log(`worker ${worker.process.pid} died... Restarting`);
          cluster.fork();
        });
      } else {
        startServer(options, () => {
          console.log('['+process.pid+'] parse-server running on '+options.serverURL);
        });
      }
    } else {
      startServer(options, () => {
        logOptions();
        console.log('');
        console.log('['+process.pid+'] parse-server running on '+options.serverURL);
      });
    }
  }
})



