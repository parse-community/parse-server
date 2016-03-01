import { Command } from 'commander';

let _definitions;
let _reverseDefinitions;
let _defaults;

Command.prototype.loadDefinitions = function(definitions) {
  _definitions = definitions;
  
  Object.keys(definitions).reduce((program, opt) => {
    if (typeof definitions[opt] == "object") {
      const additionalOptions = definitions[opt];
      if (additionalOptions.required === true) {
        return program.option(`--${opt} <${opt}>`, additionalOptions.help, additionalOptions.action);
      } else {
        return program.option(`--${opt} [${opt}]`, additionalOptions.help, additionalOptions.action);
      }
    }
    return program.option(`--${opt} [${opt}]`);
  }, this);
  
  _defaults = Object.keys(definitions).reduce((defs, opt) => {
    if(_definitions[opt].default) {
      defs[opt] = _definitions[opt].default;
    }
    return defs;
  }, {});
  
  _reverseDefinitions = Object.keys(definitions).reduce((object, key) => {
      let value = definitions[key];
      if (typeof value == "object") {
        value = value.env;
      }
      if (value) {
        object[value] = key;
      }
      return object;
   }, {});
   
   /* istanbul ignore next */
   this.on('--help', function(){
    console.log('  Configure From Environment:');
    console.log('');
    Object.keys(_reverseDefinitions).forEach((key) => {
      console.log(`    $ ${key}='${_reverseDefinitions[key]}'`);
    });
    console.log('');
  });
}

function parseEnvironment(env = {}) {
  return Object.keys(_reverseDefinitions).reduce((options, key) => {
    if (env[key]) {
      const originalKey = _reverseDefinitions[key];
      let action = (option) => (option);
      if (typeof _definitions[originalKey] === "object") {
        action = _definitions[originalKey].action || action;
      }
      options[_reverseDefinitions[key]] = action(env[key]);
    }
    return options; 
  }, {});
}

Command.prototype.setValuesIfNeeded = function(options) {
  Object.keys(options).forEach((key) => {
   if (!this[key]) {
     this[key] = options[key];
   } 
  });
} 

Command.prototype._parse = Command.prototype.parse;

Command.prototype.parse = function(args, env) {
  this._parse(args);
  // Parse the environment first
  const envOptions = parseEnvironment(env);
  
  // Load the env if not passed from command line
  this.setValuesIfNeeded(envOptions);
  this.setValuesIfNeeded(_defaults);
}

export default new Command();
