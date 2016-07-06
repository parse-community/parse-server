'use strict';

var _cache = require('./cache');

var _cache2 = _interopRequireDefault(_cache);

var _middlewares = require('./middlewares');

var middlewares = _interopRequireWildcard(_middlewares);

var _index = require('./index');

var _node = require('parse/node');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// testing-routes.js


var express = require('express'),
    cryptoUtils = require('./cryptoUtils');

var router = express.Router();

// creates a unique app in the cache, with a collection prefix
function createApp(req, res) {
  var appId = cryptoUtils.randomHexString(32);

  (0, _index.ParseServer)({
    databaseURI: 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase',
    appId: appId,
    masterKey: 'master',
    serverURL: _node.Parse.serverURL,
    collectionPrefix: appId
  });
  var keys = {
    'application_id': appId,
    'client_key': 'unused',
    'windows_key': 'unused',
    'javascript_key': 'unused',
    'webhook_key': 'unused',
    'rest_api_key': 'unused',
    'master_key': 'master'
  };
  res.status(200).send(keys);
}

// deletes all collections that belong to the app
function clearApp(req, res) {
  if (!req.auth.isMaster) {
    return res.status(401).send({ "error": "unauthorized" });
  }
  return req.config.database.deleteEverything().then(function () {
    res.status(200).send({});
  });
}

// deletes all collections and drops the app from cache
function dropApp(req, res) {
  if (!req.auth.isMaster) {
    return res.status(401).send({ "error": "unauthorized" });
  }
  return req.config.database.deleteEverything().then(function () {
    _cache2.default.del(req.config.applicationId);
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