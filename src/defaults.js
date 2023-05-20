import { nullParser } from './Options/parsers';
const ServerOptions = require('./Options/Definitions');
const { ParseServerOptions } = ServerOptions;
export let DefaultMongoURI = '';
export const getDefaults = () => {
  const logsFolder = (() => {
    let folder = './logs/';
    if (typeof process !== 'undefined' && process.env.TESTING === '1') {
      folder = './test_logs/';
    }
    if (process.env.PARSE_SERVER_LOGS_FOLDER) {
      folder = nullParser(process.env.PARSE_SERVER_LOGS_FOLDER);
    }
    return folder;
  })();

  const { verbose, level } = (() => {
    const verbose = process.env.VERBOSE ? true : false;
    return { verbose, level: verbose ? 'verbose' : undefined };
  })();

  const DefinitionDefaults = Object.keys(ParseServerOptions).reduce((memo, key) => {
    const def = ParseServerOptions[key];
    if (Object.prototype.hasOwnProperty.call(def, 'default')) {
      memo[key] = def.default;
    }
    const group = def.group;
    if (group && group !== 'SchemaOptions') {
      const options = ServerOptions[group] || {};
      for (const _key in options) {
        const val = options[_key];
        let env = process.env[val.env];
        if (val.default == null && env == null) {
          continue;
        }
        if (memo[key] == null) {
          memo[key] = {};
        }
        if (val.action && env) {
          env = val.action(env);
        }
        memo[key][_key] = env || val.default;
      }
    }
    return memo;
  }, {});

  const computedDefaults = {
    jsonLogs: process.env.JSON_LOGS || false,
    logsFolder,
    verbose,
    level,
  };
  DefaultMongoURI = DefinitionDefaults.databaseURI;
  return { ...DefinitionDefaults, ...computedDefaults };
};

export default getDefaults();
