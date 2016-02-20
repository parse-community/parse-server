var path = require("path");
var express = require('express');
var ParseServer = require("../index").ParseServer;
var definitions = require('./cli-definitions');
var program = require('./utils/commander');

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
  console.log('    $ npm start -- --appId APP_ID --masterKey MASTER_KEY');
  console.log('    $ npm start -- --appId APP_ID --masterKey MASTER_KEY');
  console.log('');
  console.log('');
  console.log('  Usage:');
  console.log('');
  console.log('    $ parse-server path/to/config.json');
  console.log('    $ parse-server -- --appId APP_ID --masterKey MASTER_KEY');
  console.log('    $ parse-server -- --appId APP_ID --masterKey MASTER_KEY');
  console.log('');
});
  
program.parse(process.argv, process.env);

var options = {};

if (program.args.length > 0 ) {
  var jsonPath = program.args[0];
  jsonPath = path.resolve(jsonPath);
  options = require(jsonPath);
  console.log(`Configuation loaded from ${jsonPath}`)
}

var options = Object.keys(definitions).reduce(function (options, key) {
  if (program[key]) {
    options[key] = program[key];
  }
  return options;
}, options);

options.mountPath = options.mountPath || '/';

var app = express();
var api = new ParseServer(options);
app.use(options.mountPath, api);

var port = process.env.PORT || 1337;
app.listen(port, function() {
  
  for (let key in options) {
    var value = options[key];
    if (key == "masterKey") {
      value = "***REDACTED***";
    }
    console.log(`${key}: ${value}`);
  }
  console.log('');
  console.log('parse-server running on http://localhost:'+ port + options.mountPath);
});
