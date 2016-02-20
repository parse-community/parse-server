var program = require('commander');

var _definitions;
var _reverseDefinitions;

program.loadDefinitions = function(definitions, prefix = "") {
  _definitions = definitions;
  Object.keys(definitions).reduce(function(program, opt){
    if (typeof definitions[opt] == "object") {
      const additionalOptions = definitions[opt];
      if (additionalOptions.required === true) {
        return program.option(`--${opt} <${opt}>`, additionalOptions.help, additionalOptions.action);
      } else {
        return program.option(`--${opt} [${opt}]`, additionalOptions.help, additionalOptions.action);
      }
    }
    return program.option(`--${opt} [${opt}]`)
  }, program);
  
  _reverseDefinitions = Object.keys(definitions).reduce(function(object, key){
      let value = definitions[key];
      if (typeof value == "object") {
        value = value.env;
      }
      if (value) {
        object[value] = key;
      }
      return object;
   }, {});
   
   program.on('--help', function(){
    console.log('  Configure From Environment:');
    console.log('');
    Object.keys(_reverseDefinitions).forEach(function(key){
      console.log(`    $ ${key}='${_reverseDefinitions[key]}'`);
    });
    console.log('');
  });
}

var envParser = function(env = {}) {
  return Object.keys(_reverseDefinitions).reduce(function(options, key){
    if (env[key]) {
      const originalKey = _reverseDefinitions[key];
      let action = function(option) {return option;}
      if (typeof _definitions[originalKey] === "object") {
        action = _definitions[originalKey].action || action;
      }
      options[_reverseDefinitions[key]] = action(env[key]);
    }
    return options; 
  }, {});
}

program._parse = program.parse;

program.parse = function(args, env) {
  program._parse(args);
  // Parse the environment first
  var envOptions = envParser(env);
  // Load the env if not passed from command line
  Object.keys(envOptions).forEach(function(key){
   if (!program[key]) {
     program[key] = envOptions[key];
   } 
  });
}

module.exports =  program;
