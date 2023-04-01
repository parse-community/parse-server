"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseServerRESTController = ParseServerRESTController;
exports.default = void 0;
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const Config = require('./Config');
const Auth = require('./Auth');
const RESTController = require('parse/lib/node/RESTController');
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
    return Promise.resolve(new Auth.Auth({
      config,
      isMaster: true,
      installationId
    }));
  }
  return getSessionToken(options).then(sessionToken => {
    if (sessionToken) {
      options.sessionToken = sessionToken;
      return Auth.getAuthForSessionToken({
        config,
        sessionToken: sessionToken,
        installationId
      });
    } else {
      return Promise.resolve(new Auth.Auth({
        config,
        installationId
      }));
    }
  });
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
            return handleRequest(request.method, request.path, request.body, options, config).then(response => {
              if (options.returnStatus) {
                const status = response._status;
                delete response._status;
                return {
                  success: response,
                  _status: status
                };
              }
              return {
                success: response
              };
            }, error => {
              return {
                error: {
                  code: error.code,
                  error: error.message
                }
              };
            });
          });
          return Promise.all(promises).then(result => {
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
          }).catch(error => {
            if (error && error.find(errorItem => typeof errorItem.error === 'object' && errorItem.error.code === 251) && transactionRetries > 0) {
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
      getAuth(options, config).then(auth => {
        const request = {
          body: data,
          config,
          auth,
          info: {
            applicationId: applicationId,
            sessionToken: options.sessionToken,
            installationId: options.installationId,
            context: options.context || {}
          },
          query
        };
        return Promise.resolve().then(() => {
          return router.tryRouteRequest(method, path, request);
        }).then(resp => {
          const {
            response,
            status
          } = resp;
          if (options.returnStatus) {
            resolve(_objectSpread(_objectSpread({}, response), {}, {
              _status: status
            }));
          } else {
            resolve(response);
          }
        }, err => {
          if (err instanceof Parse.Error && err.code == Parse.Error.INVALID_JSON && err.message == `cannot route ${method} ${path}`) {
            RESTController.request.apply(null, args).then(resolve, reject);
          } else {
            reject(err);
          }
        });
      }, reject);
    });
  }
  return {
    request: handleRequest,
    ajax: RESTController.ajax,
    handleError: RESTController.handleError
  };
}
var _default = ParseServerRESTController;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDb25maWciLCJyZXF1aXJlIiwiQXV0aCIsIlJFU1RDb250cm9sbGVyIiwiUGFyc2UiLCJnZXRTZXNzaW9uVG9rZW4iLCJvcHRpb25zIiwic2Vzc2lvblRva2VuIiwiUHJvbWlzZSIsInJlc29sdmUiLCJnZXRBdXRoIiwiY29uZmlnIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VNYXN0ZXJLZXkiLCJpc01hc3RlciIsInRoZW4iLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciIsImFwcGxpY2F0aW9uSWQiLCJyb3V0ZXIiLCJoYW5kbGVSZXF1ZXN0IiwibWV0aG9kIiwicGF0aCIsImRhdGEiLCJhcmdzIiwiYXJndW1lbnRzIiwiZ2V0Iiwic2VydmVyVVJMIiwiVVJMIiwiaW5kZXhPZiIsInBhdGhuYW1lIiwic2xpY2UiLCJsZW5ndGgiLCJiYXRjaCIsInRyYW5zYWN0aW9uUmV0cmllcyIsImluaXRpYWxQcm9taXNlIiwidHJhbnNhY3Rpb24iLCJkYXRhYmFzZSIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicHJvbWlzZXMiLCJyZXF1ZXN0cyIsIm1hcCIsInJlcXVlc3QiLCJib2R5IiwicmVzcG9uc2UiLCJyZXR1cm5TdGF0dXMiLCJzdGF0dXMiLCJfc3RhdHVzIiwic3VjY2VzcyIsImVycm9yIiwiY29kZSIsIm1lc3NhZ2UiLCJhbGwiLCJyZXN1bHQiLCJmaW5kIiwicmVzdWx0SXRlbSIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJyZWplY3QiLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNhdGNoIiwiZXJyb3JJdGVtIiwicXVlcnkiLCJhdXRoIiwiaW5mbyIsImNvbnRleHQiLCJ0cnlSb3V0ZVJlcXVlc3QiLCJyZXNwIiwiZXJyIiwiRXJyb3IiLCJJTlZBTElEX0pTT04iLCJhcHBseSIsImFqYXgiLCJoYW5kbGVFcnJvciJdLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlclJFU1RDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IENvbmZpZyA9IHJlcXVpcmUoJy4vQ29uZmlnJyk7XG5jb25zdCBBdXRoID0gcmVxdWlyZSgnLi9BdXRoJyk7XG5jb25zdCBSRVNUQ29udHJvbGxlciA9IHJlcXVpcmUoJ3BhcnNlL2xpYi9ub2RlL1JFU1RDb250cm9sbGVyJyk7XG5jb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcblxuZnVuY3Rpb24gZ2V0U2Vzc2lvblRva2VuKG9wdGlvbnMpIHtcbiAgaWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMuc2Vzc2lvblRva2VuID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUob3B0aW9ucy5zZXNzaW9uVG9rZW4pO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG59XG5cbmZ1bmN0aW9uIGdldEF1dGgob3B0aW9ucyA9IHt9LCBjb25maWcpIHtcbiAgY29uc3QgaW5zdGFsbGF0aW9uSWQgPSBvcHRpb25zLmluc3RhbGxhdGlvbklkIHx8ICdjbG91ZCc7XG4gIGlmIChvcHRpb25zLnVzZU1hc3RlcktleSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmV3IEF1dGguQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUsIGluc3RhbGxhdGlvbklkIH0pKTtcbiAgfVxuICByZXR1cm4gZ2V0U2Vzc2lvblRva2VuKG9wdGlvbnMpLnRoZW4oc2Vzc2lvblRva2VuID0+IHtcbiAgICBpZiAoc2Vzc2lvblRva2VuKSB7XG4gICAgICBvcHRpb25zLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcbiAgICAgIHJldHVybiBBdXRoLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgICBjb25maWcsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogc2Vzc2lvblRva2VuLFxuICAgICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5ldyBBdXRoLkF1dGgoeyBjb25maWcsIGluc3RhbGxhdGlvbklkIH0pKTtcbiAgICB9XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyKGFwcGxpY2F0aW9uSWQsIHJvdXRlcikge1xuICBmdW5jdGlvbiBoYW5kbGVSZXF1ZXN0KG1ldGhvZCwgcGF0aCwgZGF0YSA9IHt9LCBvcHRpb25zID0ge30sIGNvbmZpZykge1xuICAgIC8vIFN0b3JlIHRoZSBhcmd1bWVudHMsIGZvciBsYXRlciB1c2UgaWYgaW50ZXJuYWwgZmFpbHNcbiAgICBjb25zdCBhcmdzID0gYXJndW1lbnRzO1xuXG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIGNvbmZpZyA9IENvbmZpZy5nZXQoYXBwbGljYXRpb25JZCk7XG4gICAgfVxuICAgIGNvbnN0IHNlcnZlclVSTCA9IG5ldyBVUkwoY29uZmlnLnNlcnZlclVSTCk7XG4gICAgaWYgKHBhdGguaW5kZXhPZihzZXJ2ZXJVUkwucGF0aG5hbWUpID09PSAwKSB7XG4gICAgICBwYXRoID0gcGF0aC5zbGljZShzZXJ2ZXJVUkwucGF0aG5hbWUubGVuZ3RoLCBwYXRoLmxlbmd0aCk7XG4gICAgfVxuXG4gICAgaWYgKHBhdGhbMF0gIT09ICcvJykge1xuICAgICAgcGF0aCA9ICcvJyArIHBhdGg7XG4gICAgfVxuXG4gICAgaWYgKHBhdGggPT09ICcvYmF0Y2gnKSB7XG4gICAgICBjb25zdCBiYXRjaCA9IHRyYW5zYWN0aW9uUmV0cmllcyA9PiB7XG4gICAgICAgIGxldCBpbml0aWFsUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICBpZiAoZGF0YS50cmFuc2FjdGlvbiA9PT0gdHJ1ZSkge1xuICAgICAgICAgIGluaXRpYWxQcm9taXNlID0gY29uZmlnLmRhdGFiYXNlLmNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGluaXRpYWxQcm9taXNlLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHByb21pc2VzID0gZGF0YS5yZXF1ZXN0cy5tYXAocmVxdWVzdCA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaGFuZGxlUmVxdWVzdChyZXF1ZXN0Lm1ldGhvZCwgcmVxdWVzdC5wYXRoLCByZXF1ZXN0LmJvZHksIG9wdGlvbnMsIGNvbmZpZykudGhlbihcbiAgICAgICAgICAgICAgcmVzcG9uc2UgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnJldHVyblN0YXR1cykge1xuICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gcmVzcG9uc2UuX3N0YXR1cztcbiAgICAgICAgICAgICAgICAgIGRlbGV0ZSByZXNwb25zZS5fc3RhdHVzO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogcmVzcG9uc2UsIF9zdGF0dXM6IHN0YXR1cyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiByZXNwb25zZSB9O1xuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgIGVycm9yOiB7IGNvZGU6IGVycm9yLmNvZGUsIGVycm9yOiBlcnJvci5tZXNzYWdlIH0sXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gICAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgICBpZiAoZGF0YS50cmFuc2FjdGlvbiA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuZmluZChyZXN1bHRJdGVtID0+IHR5cGVvZiByZXN1bHRJdGVtLmVycm9yID09PSAnb2JqZWN0JykpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBjb25maWcuZGF0YWJhc2UuYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gY29uZmlnLmRhdGFiYXNlLmNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBlcnJvciAmJlxuICAgICAgICAgICAgICAgIGVycm9yLmZpbmQoXG4gICAgICAgICAgICAgICAgICBlcnJvckl0ZW0gPT4gdHlwZW9mIGVycm9ySXRlbS5lcnJvciA9PT0gJ29iamVjdCcgJiYgZXJyb3JJdGVtLmVycm9yLmNvZGUgPT09IDI1MVxuICAgICAgICAgICAgICAgICkgJiZcbiAgICAgICAgICAgICAgICB0cmFuc2FjdGlvblJldHJpZXMgPiAwXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJldHVybiBiYXRjaCh0cmFuc2FjdGlvblJldHJpZXMgLSAxKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH07XG4gICAgICByZXR1cm4gYmF0Y2goNSk7XG4gICAgfVxuXG4gICAgbGV0IHF1ZXJ5O1xuICAgIGlmIChtZXRob2QgPT09ICdHRVQnKSB7XG4gICAgICBxdWVyeSA9IGRhdGE7XG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGdldEF1dGgob3B0aW9ucywgY29uZmlnKS50aGVuKGF1dGggPT4ge1xuICAgICAgICBjb25zdCByZXF1ZXN0ID0ge1xuICAgICAgICAgIGJvZHk6IGRhdGEsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbzoge1xuICAgICAgICAgICAgYXBwbGljYXRpb25JZDogYXBwbGljYXRpb25JZCxcbiAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogb3B0aW9ucy5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogb3B0aW9ucy5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgIGNvbnRleHQ6IG9wdGlvbnMuY29udGV4dCB8fCB7fSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcm91dGVyLnRyeVJvdXRlUmVxdWVzdChtZXRob2QsIHBhdGgsIHJlcXVlc3QpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oXG4gICAgICAgICAgICByZXNwID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgeyByZXNwb25zZSwgc3RhdHVzIH0gPSByZXNwO1xuICAgICAgICAgICAgICBpZiAob3B0aW9ucy5yZXR1cm5TdGF0dXMpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgLi4ucmVzcG9uc2UsIF9zdGF0dXM6IHN0YXR1cyB9KTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBlcnIgaW5zdGFuY2VvZiBQYXJzZS5FcnJvciAmJlxuICAgICAgICAgICAgICAgIGVyci5jb2RlID09IFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiAmJlxuICAgICAgICAgICAgICAgIGVyci5tZXNzYWdlID09IGBjYW5ub3Qgcm91dGUgJHttZXRob2R9ICR7cGF0aH1gXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIFJFU1RDb250cm9sbGVyLnJlcXVlc3QuYXBwbHkobnVsbCwgYXJncykudGhlbihyZXNvbHZlLCByZWplY3QpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgIH0sIHJlamVjdCk7XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHJlcXVlc3Q6IGhhbmRsZVJlcXVlc3QsXG4gICAgYWpheDogUkVTVENvbnRyb2xsZXIuYWpheCxcbiAgICBoYW5kbGVFcnJvcjogUkVTVENvbnRyb2xsZXIuaGFuZGxlRXJyb3IsXG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXI7XG5leHBvcnQgeyBQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLE1BQU1BLE1BQU0sR0FBR0MsT0FBTyxDQUFDLFVBQVUsQ0FBQztBQUNsQyxNQUFNQyxJQUFJLEdBQUdELE9BQU8sQ0FBQyxRQUFRLENBQUM7QUFDOUIsTUFBTUUsY0FBYyxHQUFHRixPQUFPLENBQUMsK0JBQStCLENBQUM7QUFDL0QsTUFBTUcsS0FBSyxHQUFHSCxPQUFPLENBQUMsWUFBWSxDQUFDO0FBRW5D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