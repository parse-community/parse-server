var Parse = require('parse/node').Parse;

// These methods handle batch requests.
var batchPath = '/batch';

// Mounts a batch-handler onto a PromiseRouter.
function mountOnto(router) {
  router.route('POST', batchPath, (req) => {
    return handleBatch(router, req);
  });
}

// Returns a promise for a {response} object.
// TODO: pass along auth correctly
function handleBatch(router, req) {
  if (!req.body.requests instanceof Array) {
    throw new Parse.Error(Parse.Error.INVALID_JSON,
                          'requests must be an array');
  }

  // The batch paths are all from the root of our domain.
  // That means they include the API prefix, that the API is mounted
  // to. However, our promise router does not route the api prefix. So
  // we need to figure out the API prefix, so that we can strip it
  // from all the subrequests.
  if (!req.originalUrl.endsWith(batchPath)) {
    throw 'internal routing problem - expected url to end with batch';
  }
  var apiPrefixLength = req.originalUrl.length - batchPath.length;
  var apiPrefix = req.originalUrl.slice(0, apiPrefixLength);

  const promises = req.body.requests.map((restRequest) => {
    // The routablePath is the path minus the api prefix
    if (restRequest.path.slice(0, apiPrefixLength) != apiPrefix) {
      throw new Parse.Error(
        Parse.Error.INVALID_JSON,
        'cannot route batch path ' + restRequest.path);
    }
    var routablePath = restRequest.path.slice(apiPrefixLength);
    // Construct a request that we can send to a handler
    var request = {
      body: restRequest.body,
      config: req.config,
      auth: req.auth,
      info: req.info
    };

    return router.tryRouteRequest(restRequest.method, routablePath, request).then((response) => {
      return {success: response.response};
    }, (error) => {
      return {error: {code: error.code, error: error.message}};
    });
  });

  return Promise.all(promises).then((results) => {
    return {response: results};
  });
}

module.exports = {
  mountOnto: mountOnto
};
