// testing-routes.js
const AppCache = require('../lib/cache').default;
const middlewares = require('../lib/middlewares');
const { ParseServer } = require('../lib/index');
const { Parse } = require('parse/node');

const express = require('express'),
  cryptoUtils = require('../lib/cryptoUtils');

const router = express.Router();

// creates a unique app in the cache, with a collection prefix
function createApp(req, res) {
  const appId = cryptoUtils.randomHexString(32);

  ParseServer({
    databaseURI: 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase',
    appId: appId,
    masterKey: 'master',
    serverURL: Parse.serverURL,
    collectionPrefix: appId,
  });
  const keys = {
    application_id: appId,
    client_key: 'unused',
    windows_key: 'unused',
    javascript_key: 'unused',
    webhook_key: 'unused',
    rest_api_key: 'unused',
    master_key: 'master',
  };
  res.status(200).send(keys);
}

// deletes all collections that belong to the app
function clearApp(req, res) {
  if (!req.auth.isMaster) {
    return res.status(401).send({ error: 'unauthorized' });
  }
  return req.config.database.deleteEverything().then(() => {
    res.status(200).send({});
  });
}

// deletes all collections and drops the app from cache
function dropApp(req, res) {
  if (!req.auth.isMaster) {
    return res.status(401).send({ error: 'unauthorized' });
  }
  return req.config.database.deleteEverything().then(() => {
    AppCache.del(req.config.applicationId);
    res.status(200).send({});
  });
}

// Lets just return a success response and see what happens.
function notImplementedYet(req, res) {
  res.status(200).send({});
}

router.post('/rest_clear_app', middlewares.handleParseHeaders, clearApp);
router.post('/rest_block', middlewares.handleParseHeaders, notImplementedYet);
router.post('/rest_mock_v8_client', middlewares.handleParseHeaders, notImplementedYet);
router.post('/rest_unmock_v8_client', middlewares.handleParseHeaders, notImplementedYet);
router.post('/rest_verify_analytics', middlewares.handleParseHeaders, notImplementedYet);
router.post('/rest_create_app', createApp);
router.post('/rest_drop_app', middlewares.handleParseHeaders, dropApp);
router.post('/rest_configure_app', middlewares.handleParseHeaders, notImplementedYet);

module.exports = {
  router: router,
};
