#!/usr/bin/env node
const MongoStorageAdapter = require('../../lib/Adapters/Storage/Mongo/MongoStorageAdapter').default;
const { GridFSBucketAdapter } = require('../../lib/Adapters/Files/GridFSBucketAdapter');

const ParseServer = require('../../lib/index').ParseServer;

const databaseURI = 'mongodb://doesnotexist:27017/parseServerMongoAdapterTestDatabase';

(async () => {
  try {
    await ParseServer.startApp({
      appId: 'test',
      masterKey: 'test',
      databaseAdapter: new MongoStorageAdapter({
        uri: databaseURI,
        mongoOptions: {
          serverSelectionTimeoutMS: 2000,
        },
      }),
      filesAdapter: new GridFSBucketAdapter(databaseURI),
    });
  } catch (e) {
    process.exit(1);
  }
})();
