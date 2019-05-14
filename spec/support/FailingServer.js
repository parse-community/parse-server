#!/usr/bin/env node

const ParseServer = require('../../lib/index').ParseServer;

ParseServer.start({
  appId: 'test',
  masterKey: 'test',
  databaseURI:
    'mongodb://doesnotexist:27017/parseServerMongoAdapterTestDatabase',
});
