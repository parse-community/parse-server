import { nullParser } from './Options/parsers';
const logsFolder = (() => {
  let folder = './logs/';
  if (typeof process !== 'undefined' && process.env.TESTING === '1') {
    folder = './test_logs/'
  }
  if (process.env.PARSE_SERVER_LOGS_FOLDER) {
    folder = nullParser(process.env.PARSE_SERVER_LOGS_FOLDER);
  }
  return folder;
})();

const { verbose, level } = (() => {
  const verbose = process.env.VERBOSE ? true : false;
  return { verbose, level: verbose ? 'verbose' : undefined }
})();

export const DefaultMongoURI = 'mongodb://localhost:27017/parse';

export default {
  databaseURI: DefaultMongoURI,
  jsonLogs: process.env.JSON_LOGS || false,
  logsFolder,
  verbose,
  level,
  silent: false,
  enableAnonymousUsers: true,
  allowClientClassCreation: true,
  maxUploadSize: '20mb',
  verifyUserEmails: false,
  preventLoginWithUnverifiedEmail: false,
  sessionLength: 31536000,
  expireInactiveSessions: true,
  revokeSessionOnPasswordReset: true,
  scheduledPush: false,
  schemaCacheTTL: 5000, // in ms
  cacheTTL: 5000,
  cacheMaxSize: 10000,
  userSensitiveFields: ['email'],
  objectIdSize: 10,
  enableSingleSchemaCache: false,
  masterKeyIps: [],
  collectionPrefix: '',
  auth: {},
  customPages: {
    invalidLink: undefined,
    verifyEmailSuccess: undefined,
    choosePassword: undefined,
    passwordResetSuccess: undefined
  },
  port: 1337,
  host: '0.0.0.0',
  mountPath: '/parse',
};
