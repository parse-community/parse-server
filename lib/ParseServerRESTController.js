'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var Config = require('./Config');
var Auth = require('./Auth');
var RESTController = require('parse/lib/node/RESTController');
var URL = require('url');
var Parse = require('parse/node');

function getSessionToken(options) {
  if (options && typeof options.sessionToken === 'string') {
    return Parse.Promise.as(options.sessionToken);
  }
  return Parse.Promise.as(null);
}

function getAuth(options, config) {
  if (options.useMasterKey) {
    return Parse.Promise.as(new Auth.Auth({ config: config, isMaster: true, installationId: 'cloud' }));
  }
  return getSessionToken(options).then(function (sessionToken) {
    if (sessionToken) {
      options.sessionToken = sessionToken;
      return Auth.getAuthForSessionToken({
        config: config,
        sessionToken: sessionToken,
        installationId: 'cloud'
      });
    } else {
      return Parse.Promise.as(new Auth.Auth({ config: config, installationId: 'cloud' }));
    }
  });
}

function ParseServerRESTController(applicationId, router) {
  function handleRequest(method, path) {
    var data = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    var options = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};

    // Store the arguments, for later use if internal fails
    var args = arguments;

    var config = new Config(applicationId);
    var serverURL = URL.parse(config.serverURL);
    if (path.indexOf(serverURL.path) === 0) {
      path = path.slice(serverURL.path.length, path.length);
    }

    if (path[0] !== "/") {
      path = "/" + path;
    }

    if (path === '/batch') {
      var promises = data.requests.map(function (request) {
        return handleRequest(request.method, request.path, request.body, options).then(function (response) {
          return Parse.Promise.as({ success: response });
        }, function (error) {
          return Parse.Promise.as({ error: { code: error.code, error: error.message } });
        });
      });
      return Parse.Promise.all(promises);
    }

    var query = void 0;
    if (method === 'GET') {
      query = data;
    }

    return new Parse.Promise(function (resolve, reject) {
      getAuth(options, config).then(function (auth) {
        var request = {
          body: data,
          config: config,
          auth: auth,
          info: {
            applicationId: applicationId,
            sessionToken: options.sessionToken
          },
          query: query
        };
        return Promise.resolve().then(function () {
          return router.tryRouteRequest(method, path, request);
        }).then(function (response) {
          resolve(response.response, response.status, response);
        }, function (err) {
          if (err instanceof Parse.Error && err.code == Parse.Error.INVALID_JSON && err.message == 'cannot route ' + method + ' ' + path) {
            RESTController.request.apply(null, args).then(resolve, reject);
          } else {
            reject(err);
          }
        });
      }, reject);
    });
  };

  return {
    request: handleRequest,
    ajax: RESTController.ajax
  };
};

exports.default = ParseServerRESTController;
exports.ParseServerRESTController = ParseServerRESTController;