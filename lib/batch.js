'use strict';

var Parse = require('parse/node').Parse;
var url = require('url');
var path = require('path');
// These methods handle batch requests.
var batchPath = '/batch';

// Mounts a batch-handler onto a PromiseRouter.
function mountOnto(router) {
  router.route('POST', batchPath, function (req) {
    return handleBatch(router, req);
  });
}

function parseURL(URL) {
  if (typeof URL === 'string') {
    return url.parse(URL);
  }
  return undefined;
}

function makeBatchRoutingPathFunction(originalUrl, serverURL, publicServerURL) {
  serverURL = serverURL ? parseURL(serverURL) : undefined;
  publicServerURL = publicServerURL ? parseURL(publicServerURL) : undefined;

  var apiPrefixLength = originalUrl.length - batchPath.length;
  var apiPrefix = originalUrl.slice(0, apiPrefixLength);

  var makeRoutablePath = function makeRoutablePath(requestPath) {
    // The routablePath is the path minus the api prefix
    if (requestPath.slice(0, apiPrefix.length) != apiPrefix) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'cannot route batch path ' + requestPath);
    }
    return path.posix.join('/', requestPath.slice(apiPrefix.length));
  };

  if (serverURL && publicServerURL && serverURL.path != publicServerURL.path) {
    var localPath = serverURL.path;
    var publicPath = publicServerURL.path;
    // Override the api prefix
    apiPrefix = localPath;
    return function (requestPath) {
      // Build the new path by removing the public path
      // and joining with the local path
      var newPath = path.posix.join('/', localPath, '/', requestPath.slice(publicPath.length));
      // Use the method for local routing
      return makeRoutablePath(newPath);
    };
  }

  return makeRoutablePath;
}

// Returns a promise for a {response} object.
// TODO: pass along auth correctly
function handleBatch(router, req) {
  if (!Array.isArray(req.body.requests)) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'requests must be an array');
  }

  // The batch paths are all from the root of our domain.
  // That means they include the API prefix, that the API is mounted
  // to. However, our promise router does not route the api prefix. So
  // we need to figure out the API prefix, so that we can strip it
  // from all the subrequests.
  if (!req.originalUrl.endsWith(batchPath)) {
    throw 'internal routing problem - expected url to end with batch';
  }

  var makeRoutablePath = makeBatchRoutingPathFunction(req.originalUrl, req.config.serverURL, req.config.publicServerURL);

  var promises = req.body.requests.map(function (restRequest) {
    var routablePath = makeRoutablePath(restRequest.path);
    // Construct a request that we can send to a handler
    var request = {
      body: restRequest.body,
      config: req.config,
      auth: req.auth,
      info: req.info
    };

    return router.tryRouteRequest(restRequest.method, routablePath, request).then(function (response) {
      return { success: response.response };
    }, function (error) {
      return { error: { code: error.code, error: error.message } };
    });
  });

  return Promise.all(promises).then(function (results) {
    return { response: results };
  });
}

module.exports = {
  mountOnto: mountOnto,
  makeBatchRoutingPathFunction: makeBatchRoutingPathFunction
};