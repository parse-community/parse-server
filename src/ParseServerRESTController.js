const Config = require('./Config');
const Auth = require('./Auth');
import RESTController from 'parse/lib/node/RESTController';
const Parse = require('parse/node');

function getSessionToken(options) {
  if (options && typeof options.sessionToken === 'string') {
    return Promise.resolve(options.sessionToken);
  }
  return Promise.resolve(null);
}

function getAuth(options = {}, config) {
  const installationId = options.installationId || 'cloud';
  if (options.useMasterKey) {
    return Promise.resolve(new Auth.Auth({ config, isMaster: true, installationId }));
  }
  return getSessionToken(options).then(sessionToken => {
    if (sessionToken) {
      options.sessionToken = sessionToken;
      return Auth.getAuthForSessionToken({
        config,
        sessionToken: sessionToken,
        installationId,
      });
    } else {
      return Promise.resolve(new Auth.Auth({ config, installationId }));
    }
  });
}

/**
 * Apply requestContextMiddleware on a synthetic request so directAccess ops
 * get the same per-request DI as Express HTTP requests.
 *
 * Synthetic request contract (minimal supported fields only):
 * - `req.config` — Parse Server config (DI target)
 * - `req.headers` — empty object `{}` (no HTTP headers on this path)
 *
 * Express-only request properties and methods such as `req.get()`,
 * `req.header()`, `req.ip`, and `req.body` are unavailable. Middleware must
 * use only the supported fields above; this path intentionally does not add
 * partial Express compatibility.
 */
async function applyRequestContextMiddleware(config) {
  if (typeof config.requestContextMiddleware !== 'function') {
    return;
  }

  // Minimal synthetic req — see contract in JSDoc above.
  const req = { config, headers: {} };

  // Bridge callback-style Express middleware (`next(err)`) and Promise-returning
  // middleware into a single awaitable settlement.
  await new Promise((resolve, reject) => {
    let settled = false;
    const done = err => {
      if (settled) {
        return;
      }
      settled = true;
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    let result;
    try {
      result = config.requestContextMiddleware(req, {}, done);
    } catch (err) {
      done(err);
      return;
    }

    if (result != null && typeof result.then === 'function') {
      result.then(() => done(), done);
    }
  });
}

function ParseServerRESTController(applicationId, router) {
  async function handleRequest(method, path, data = {}, options = {}, config) {
    // Store the arguments, for later use if internal fails
    const args = arguments;
    const configWasProvided = !!config;

    if (!configWasProvided) {
      config = Config.get(applicationId);
      // Fresh config from AppCache has no Express middleware mutations;
      // re-apply requestContextMiddleware for DI parity with HTTP.
      await applyRequestContextMiddleware(config);
    }

    const serverURL = new URL(config.serverURL);
    if (path.indexOf(serverURL.pathname) === 0) {
      path = path.slice(serverURL.pathname.length, path.length);
    }

    if (path[0] !== '/') {
      path = '/' + path;
    }

    if (path === '/batch') {
      const batch = async transactionRetries => {
        if (data.transaction === true) {
          await config.database.createTransactionalSession();
        }
        const result = await Promise.all(
          data.requests.map(request => {
            return handleRequest(
              request.method,
              request.path,
              request.body,
              options,
              config
            ).then(
              response => {
                if (options.returnStatus) {
                  const status = response._status;
                  const headers = response._headers;
                  delete response._status;
                  delete response._headers;
                  return { success: response, _status: status, _headers: headers };
                }
                return { success: response };
              },
              error => {
                return {
                  error: { code: error.code, error: error.message },
                };
              }
            );
          })
        );
        try {
          if (data.transaction === true) {
            if (result.find(resultItem => typeof resultItem.error === 'object')) {
              await config.database.abortTransactionalSession();
              throw result;
            }
            await config.database.commitTransactionalSession();
          }
          return result;
        } catch (error) {
          if (
            error &&
            error.find &&
            error.find(
              errorItem => typeof errorItem.error === 'object' && errorItem.error.code === 251
            ) &&
            transactionRetries > 0
          ) {
            return batch(transactionRetries - 1);
          }
          throw error;
        }
      };
      return batch(5);
    }

    let query;
    if (method === 'GET') {
      query = data;
    }

    let requestContext;
    try {
      requestContext = structuredClone(options.context || {});
    } catch (error) {
      throw new Parse.Error(
        Parse.Error.INVALID_VALUE,
        `Context contains non-cloneable values: ${error.message}`
      );
    }

    const auth = await getAuth(options, config);
    const request = {
      body: data,
      config,
      auth,
      info: {
        applicationId: applicationId,
        sessionToken: options.sessionToken,
        installationId: options.installationId,
        context: requestContext,
      },
      query,
    };

    try {
      const { response, status, headers = {} } = await router.tryRouteRequest(
        method,
        path,
        request
      );
      if (options.returnStatus) {
        return { ...response, _status: status, _headers: headers };
      }
      return response;
    } catch (err) {
      if (
        err instanceof Parse.Error &&
        err.code == Parse.Error.INVALID_JSON &&
        err.message == `cannot route ${method} ${path}`
      ) {
        return RESTController.request.apply(null, args);
      }
      throw err;
    }
  }

  return {
    request: handleRequest,
    ajax: RESTController.ajax,
    handleError: RESTController.handleError,
  };
}

export default ParseServerRESTController;
export { ParseServerRESTController };
