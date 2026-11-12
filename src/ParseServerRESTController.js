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

// Mirrors JSON.stringify so directAccess sees what HTTP mode sees: toJSON(key)
// runs once per value, undefined/function/symbol values are dropped from objects
// and become null in arrays, as do NaN/Infinity and sparse-array holes.
// Copy-on-write: returns `value` itself when nothing changes, so the common case
// allocates no new tree (a JSON round-trip here regressed the GC benchmark).
// toJSON() output is always copied, as it may carry non-enumerable own
// properties or getters that JSON serialization would drop or read only once.
function stripUndefined(value, key = '') {
  let fromToJSON = false;
  if (value && typeof value.toJSON === 'function') {
    value = value.toJSON(key);
    fromToJSON = true;
  }
  switch (typeof value) {
    case 'function':
    case 'symbol':
      return undefined;
    case 'number':
      return Number.isFinite(value) ? value : null;
    case 'object':
      if (value !== null) {
        break;
      }
    // falls through
    default:
      return value;
  }
  if (Array.isArray(value)) {
    let copy = fromToJSON ? [] : undefined;
    for (let i = 0; i < value.length; i++) {
      const raw = value[i];
      const item = stripUndefined(raw, String(i)) ?? null;
      if (!copy && item !== raw) {
        copy = value.slice(0, i);
      }
      if (copy) {
        copy.push(item);
      }
    }
    return copy || value;
  }
  const keys = Object.keys(value);
  let entries = fromToJSON ? [] : undefined;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const raw = value[k];
    const item = stripUndefined(raw, k);
    if (!entries && (item === undefined || item !== raw)) {
      entries = keys.slice(0, i).map(prev => [prev, value[prev]]);
    }
    if (entries && item !== undefined) {
      entries.push([k, item]);
    }
  }
  // Object.fromEntries keeps a `__proto__` key as an own key, so
  // requestKeywordDenylist still rejects it instead of it becoming the prototype.
  return entries ? Object.fromEntries(entries) : value;
}

function ParseServerRESTController(applicationId, router) {
  function handleRequest(method, path, data = {}, options = {}, config) {
    // Store the arguments, for later use if internal fails
    const args = arguments;

    if (!config) {
      config = Config.get(applicationId);
    }
    const serverURL = new URL(config.serverURL);
    if (path.indexOf(serverURL.pathname) === 0) {
      path = path.slice(serverURL.pathname.length, path.length);
    }

    if (path[0] !== '/') {
      path = '/' + path;
    }

    if (path === '/batch') {
      const batch = transactionRetries => {
        let initialPromise = Promise.resolve();
        if (data.transaction === true) {
          initialPromise = config.database.createTransactionalSession();
        }
        return initialPromise.then(() => {
          const promises = data.requests.map(request => {
            return handleRequest(request.method, request.path, request.body, options, config).then(
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
          });
          return Promise.all(promises)
            .then(result => {
              if (data.transaction === true) {
                if (result.find(resultItem => typeof resultItem.error === 'object')) {
                  return config.database.abortTransactionalSession().then(() => {
                    return Promise.reject(result);
                  });
                } else {
                  return config.database.commitTransactionalSession().then(() => {
                    return result;
                  });
                }
              } else {
                return result;
              }
            })
            .catch(error => {
              if (
                error &&
                error.find(
                  errorItem => typeof errorItem.error === 'object' && errorItem.error.code === 251
                ) &&
                transactionRetries > 0
              ) {
                return batch(transactionRetries - 1);
              }
              throw error;
            });
        });
      };
      return batch(5);
    }

    let query;
    if (method === 'GET') {
      query = data;
    }

    return new Promise((resolve, reject) => {
      let requestContext;
      try {
        requestContext = structuredClone(options.context || {});
      } catch (error) {
        reject(
          new Parse.Error(
            Parse.Error.INVALID_VALUE,
            `Context contains non-cloneable values: ${error.message}`
          )
        );
        return;
      }
      getAuth(options, config)
        .then(auth => {
          // Normalize once: for GET, body and query are the same input.
          const body = stripUndefined(data);
          const request = {
            body,
            config,
            auth,
            info: {
              applicationId: applicationId,
              sessionToken: options.sessionToken,
              installationId: options.installationId,
              context: requestContext,
            },
            query: query ? body : query,
          };
          return Promise.resolve()
            .then(() => {
              return router.tryRouteRequest(method, path, request);
            })
            .then(
              resp => {
                const { response, status, headers = {} } = resp;
                const strippedResponse = stripUndefined(response);
                if (options.returnStatus) {
                  resolve({ ...strippedResponse, _status: status, _headers: headers });
                } else {
                  resolve(strippedResponse);
                }
              },
              err => {
                if (
                  err instanceof Parse.Error &&
                  err.code == Parse.Error.INVALID_JSON &&
                  err.message == `cannot route ${method} ${path}`
                ) {
                  RESTController.request.apply(null, args).then(resolve, reject);
                } else {
                  reject(err);
                }
              }
            );
          // Forward throws from stripUndefined (e.g. a throwing toJSON or a circular value) instead of leaving the request pending.
        })
        .catch(reject);
    });
  }

  return {
    request: handleRequest,
    ajax: RESTController.ajax,
    handleError: RESTController.handleError,
  };
}

export default ParseServerRESTController;
export { ParseServerRESTController };
