// global_config.js

var Parse = require('parse/node').Parse,
    PromiseRouter = require('./PromiseRouter');

var router = new PromiseRouter();

function updateGlobalConfig(req) {
  if (!req.auth.isMaster) {
    return Promise.resolve({
      status: 401,
      response: {error: 'unauthorized'},
    });
  }

  return req.config.database.rawCollection('_GlobalConfig')
    .then(coll => coll.findOneAndUpdate({ _id: 1 }, { $set: req.body }, { returnOriginal: false }))
    .then(response => {
      return { response: { params: response.value.params } }
    })
    .catch(() => ({
      status: 404,
      response: {
        code: Parse.Error.INVALID_KEY_NAME,
        error: 'config cannot be updated',
      }
    }));
}

function getGlobalConfig(req) {
  return req.config.database.rawCollection('_GlobalConfig')
    .then(coll => coll.findOne({'_id': 1}))
    .then(globalConfig => ({response: { params: globalConfig.params }}))
    .catch(() => ({
      status: 404,
      response: {
        code: Parse.Error.INVALID_KEY_NAME,
        error: 'config does not exist',
      }
    }));
}

router.route('GET', '/config', getGlobalConfig);
router.route('POST', '/config', updateGlobalConfig);

module.exports = router;
