const Config = require('./Config');
const Auth = require('./Auth');
const RESTController = require('parse/lib/node/RESTController');
const URL = require('url');
const Parse = require('parse/node');

function getSessionToken(options) {
  if (options && typeof options.sessionToken === 'string') {
    return Parse.Promise.as(options.sessionToken);
  }
  return Parse.Promise.as(null);
}

function getAuth(options = {}, config) {
  const installationId = options.installationId || 'cloud';
  if (options.useMasterKey) {
    return Parse.Promise.as(new Auth.Auth({config, isMaster: true, installationId }));
  }
  return getSessionToken(options).then((sessionToken) => {
    if (sessionToken) {
      options.sessionToken = sessionToken;
      return Auth.getAuthForSessionToken({
        config,
        sessionToken: sessionToken,
        installationId
      });
    } else {
      return Parse.Promise.as(new Auth.Auth({ config, installationId }));
    }
  })
}

function ParseServerRESTController(applicationId, router) {
  function handleRequest(method, path, data = {}, options = {}) {
    // Store the arguments, for later use if internal fails
    const args = arguments;

    const config = new Config(applicationId);
    const serverURL = URL.parse(config.serverURL);
    if (path.indexOf(serverURL.path) === 0) {
      path = path.slice(serverURL.path.length, path.length);
    }

    if (path[0] !== "/") {
      path = "/" + path;
    }

    if (path === '/batch') {
      const promises = data.requests.map((request) => {
        return handleRequest(request.method, request.path, request.body, options).then((response) => {
          return Parse.Promise.as({success: response});
        }, (error) => {
          return Parse.Promise.as({error: {code: error.code, error: error.message}});
        });
      });
      return Parse.Promise.all(promises);
    }

    let query;
    if (method === 'GET') {
      query = data;
    }

    return new Parse.Promise((resolve, reject) => {
      getAuth(options, config).then((auth) => {
        const request = {
          body: data,
          config,
          auth,
          info: {
            applicationId: applicationId,
            sessionToken: options.sessionToken
          },
          query
        };
        return Promise.resolve().then(() => {
          return router.tryRouteRequest(method, path, request);
        }).then((response) => {
          resolve(response.response, response.status, response);
        }, (err) => {
          if (err instanceof Parse.Error &&
              err.code == Parse.Error.INVALID_JSON &&
              err.message == `cannot route ${method} ${path}`) {
            RESTController.request.apply(null, args).then(resolve, reject);
          } else {
            reject(err);
          }
        });
      }, reject);
    });
  }

  return  {
    request: handleRequest,
    ajax: RESTController.ajax
  };
}

export default ParseServerRESTController;
export { ParseServerRESTController };
