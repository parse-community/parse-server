import path from 'path';
import express from 'express';
import { ParseServer } from '../index';
import definitions from './cli-definitions';
import program from './utils/commander';
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

let options = {};
if (program.args.length > 0 ) {
  let jsonPath = program.args[0];
  jsonPath = path.resolve(jsonPath);
  options = require(jsonPath);
  console.log(`Configuation loaded from ${jsonPath}`)
} 

options = Object.keys(definitions).reduce(function (options, key) {
  if (program[key]) {
    options[key] = program[key];
  }
  return options;
}, options);

if (!options.serverURL) {
  options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
}

if (!options.appId || !options.masterKey || !options.serverURL) {
  program.outputHelp();
  console.error("");
  console.error(colors.red("ERROR: appId, masterKey and serverURL are required"));
  console.error("");
  process.exit(1);
}

const app = express();
const server = new ParseServer(options);
app.use(options.mountPath, server.app);

app.listen(options.port, function() {
  
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
