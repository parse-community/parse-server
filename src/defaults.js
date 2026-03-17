import { extractSchemaDefaults } from './Options/schemaUtils';
import { ParseServerOptionsSchema } from './Options/schemas/ParseServerOptions';
import { DatabaseOptionsSchema } from './Options/schemas/DatabaseOptions';

const logsFolder = (() => {
  let folder = './logs/';
  if (typeof process !== 'undefined' && process.env.TESTING === '1') {
    folder = './test_logs/';
  }
  if (process.env.PARSE_SERVER_LOGS_FOLDER) {
    folder = process.env.PARSE_SERVER_LOGS_FOLDER === 'null' ? null : process.env.PARSE_SERVER_LOGS_FOLDER;
  }
  return folder;
})();

const { verbose, level } = (() => {
  const verbose = process.env.VERBOSE ? true : false;
  return { verbose, level: verbose ? 'verbose' : undefined };
})();

const DefinitionDefaults = extractSchemaDefaults(ParseServerOptionsSchema);

const computedDefaults = {
  jsonLogs: process.env.JSON_LOGS || false,
  logsFolder,
  verbose,
  level,
};

export default Object.assign({}, DefinitionDefaults, computedDefaults);
export const DefaultMongoURI = DefinitionDefaults.databaseURI;

export const DatabaseOptionDefaults = extractSchemaDefaults(DatabaseOptionsSchema);

// Parse Server-specific database options that should be filtered out
// before passing to MongoDB client
export const ParseServerDatabaseOptions = [
  'allowPublicExplain',
  'batchSize',
  'clientMetadata',
  'createIndexAuthDataUniqueness',
  'createIndexRoleName',
  'createIndexUserEmail',
  'createIndexUserEmailCaseInsensitive',
  'createIndexUserEmailVerifyToken',
  'createIndexUserPasswordResetToken',
  'createIndexUserUsername',
  'createIndexUserUsernameCaseInsensitive',
  'disableIndexFieldValidation',
  'enableSchemaHooks',
  'logClientEvents',
  'maxTimeMS',
  'schemaCacheTtl',
];
