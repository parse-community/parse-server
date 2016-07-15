import path from 'path';
import express from 'express';
import { ParseServer } from '../index';
import definitions from './cli-definitions';
import program from './utils/commander';
import { mergeWithOptions } from './utils/commander';
import colors from 'colors';

program.loadDefinitions(definitions);

program
  .usage('[options] <path/to/configuration.json>');

program.on('--help', function(){
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
});

program.parse(process.argv, process.env);

let options = program.getOptions();

if (!options.serverURL) {
  options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
}

if (!options.appId || !options.masterKey || !options.serverURL) {
  program.outputHelp();
  console.error("");
  console.error(colors.red("ERROR: appId and masterKey are required"));
  console.error("");
  process.exit(1);
}

// create S3Adapter object if FILES_ADAPTER is S3
if ('parse-server-s3-adapter' == process.env.PARSE_SERVER_FILES_ADAPTER) {
  options.filesAdapter = new _index.S3Adapter({
        accessKey: process.env.S3_ACCESS_KEY || '',
        secretKey: process.env.S3_SECRET_KEY || '',
        bucket: process.env.S3_BUCKET || '',
        region: process.env.S3_REGION || ''
  });
}

const app = express();
const api = new ParseServer(options);
app.use(options.mountPath, api);

var server = app.listen(options.port, process.env.HOST || '0.0.0.0', function() {

  for (let key in options) {
    let value = options[key];
    if (key == "masterKey") {
      value = "***REDACTED***";
    }
    console.log(`${key}: ${value}`);
  }
  console.log('');
  console.log('parse-server running on '+options.serverURL);
});

var handleShutdown = function() {
  console.log('Termination signal received. Shutting down.');
  server.close(function () {
    process.exit(0);
  });
};
process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);
