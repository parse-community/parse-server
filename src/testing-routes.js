// testing-routes.js
import cache from './cache';
import * as middlewares from './middlewares';
import { ParseServer } from './index';
import { Parse } from 'parse/node';

var express = require('express'),
  cryptoUtils = require('./cryptoUtils');

var router = express.Router();

// creates a unique app in the cache, with a collection prefix
function createApp(req, res) {
  var appId = cryptoUtils.randomHexString(32);

  ParseServer({
    appId: appId,
    masterKey: 'master',
    serverURL: Parse.serverURL,
    collectionPrefix: appId
  });
  var keys = {
    'application_id': appId,
    'client_key'    : 'unused',
    'windows_key'   : 'unused',
    'javascript_key': 'unused',
    'webhook_key'   : 'unused',
    'rest_api_key'  : 'unused',
    'master_key'    : 'master'
  };
  res.status(200).send(keys);
}

// deletes all collections with the collectionPrefix of the app
function clearApp(req, res) {
  if (!req.auth.isMaster) {
    return res.status(401).send({ "error": "unauthorized" });
  }
  return req.config.database.deleteEverything().then(() => {
    res.status(200).send({});
  });
}

// deletes all collections and drops the app from cache
function dropApp(req, res) {
  if (!req.auth.isMaster) {
    return res.status(401).send({ "error": "unauthorized" });
  }
  return req.config.database.deleteEverything().then(() => {
    cache.apps.remove(req.config.applicationId);
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
  router: router
};
