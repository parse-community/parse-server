// global_config.js

var Parse = require('parse/node').Parse,
    PromiseRouter = require('./PromiseRouter'),
    rest = require('./rest');

var router = new PromiseRouter();

// Returns a promise for a {response} object.
function handleUpdateGlobalConfig(req) {
  if (!req.auth.isMaster) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Config updates requires valid masterKey.');
  }

  return rest.update(req.config, req.auth,
                     '_GlobalConfig', 1, req.body)
  .then((response) => {
    return {response: response};
  });
}

// Returns a promise for a {response} object.
function handleGetGlobalConfig(req) {
  return rest.find(req.config, req.auth, '_GlobalConfig', 1)
  .then((response) => {
    if (!response.results || response.results.length == 0) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND,
                            'Object not found.');
    } else {
    	// only return 'params' attribute of response
      return {response: { params: response.results[0].params }};
    }
  });
}

router.route('GET','/config', handleGetGlobalConfig);
router.route('POST','/config', handleUpdateGlobalConfig);

module.exports = router;