const Parse = require('parse/node').Parse;
const url = require('url');
const path = require('path');
// These methods handle batch requests.
const batchPath = '/batch';

// Mounts a batch-handler onto a PromiseRouter.
function mountOnto(router) {
  router.route('POST', batchPath, (req) => {
    return handleBatch(router, req);
  });
}

function parseURL(URL) {
  if (typeof URL === 'string') {
    return url.parse(URL)
  }
  return undefined;
}

function mBatchRoutingPath(originalUrl, serverURL, publicServerURL) {
    serverURL = serverURL ? parseURL(serverURL) : undefined;
    publicServerURL = publicServerURL ? parseURL(publicServerURL): undefined;

    let apiPrefixLength = originalUrl.length - batchPath.length;
    let apiPrefix = originalUrl.slice(0, apiPrefixLength);

    let makeRoutablePath = function(requestPath) {
      // The routablePath is the path minus the api prefix
      if (requestPath.slice(0, apiPrefixLength) != apiPrefix) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'cannot route batch path ' + path);
      }
      return path.join('/', requestPath.slice(apiPrefixLength));
    }

    if (serverURL && publicServerURL 
        && (serverURL.path != publicServerURL.path)) {
      let localPath = serverURL.path;
      let publicPath = publicServerURL.path;
      // Override the api prefix
      apiPrefix = localPath;
      apiPrefixLength = localPath.length;
      return function(requestPath) {
        // Build the new path by removing the public path
        // and joining with the local path
        let newPath = path.join('/', localPath, '/' , requestPath.slice(publicPath.length));
        // Use the method for local routing
        return makeRoutablePath(newPath);
      }
    }

    return makeRoutablePath;
}

// Returns a promise for a {response} object.
// TODO: pass along auth correctly
function handleBatch(router, req) {
  if (!Array.isArray(req.body.requests)) {
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

  const makeRoutablePath = mBatchRoutingPath(req.originalUrl, req.config.serverURL, req.config.publicServerURL);

  const promises = req.body.requests.map((restRequest) => {
    const routablePath = makeRoutablePath(restRequest.path);
    // Construct a request that we can send to a handler
    const request = {
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
  mountOnto,
  mBatchRoutingPath
};
