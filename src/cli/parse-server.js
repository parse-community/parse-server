/* eslint-disable no-console */
import ParseServer from '../index';
import definitions from './definitions/parse-server';
import cluster from 'cluster';
import os from 'os';
import runner from './utils/runner';

const help = function(){
  console.log('  Get Started guide:');
  console.log('');
  console.log('    Please have a look at the get started guide!');
  console.log('    http://docs.parseplatform.org/parse-server/guide/');
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

runner({
  definitions,
  help,
  usage: '[options] <path/to/configuration.json>',
  start: function(program, options, logOptions) {
    if (!options.appId || !options.masterKey) {
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
        ParseServer.start(options, () => {
          console.log('[' + process.pid + '] parse-server running on ' + options.serverURL);
        });
      }
    } else {
      ParseServer.start(options, () => {
        logOptions();
        console.log('');
        console.log('[' + process.pid + '] parse-server running on ' + options.serverURL);
      });
    }
  }
});

/* eslint-enable no-console */
