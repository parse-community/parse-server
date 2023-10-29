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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDb25maWciLCJyZXF1aXJlIiwiQXV0aCIsIlJFU1RDb250cm9sbGVyIiwiUGFyc2UiLCJnZXRTZXNzaW9uVG9rZW4iLCJvcHRpb25zIiwic2Vzc2lvblRva2VuIiwiUHJvbWlzZSIsInJlc29sdmUiLCJnZXRBdXRoIiwiY29uZmlnIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VNYXN0ZXJLZXkiLCJpc01hc3RlciIsInRoZW4iLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciIsImFwcGxpY2F0aW9uSWQiLCJyb3V0ZXIiLCJoYW5kbGVSZXF1ZXN0IiwibWV0aG9kIiwicGF0aCIsImRhdGEiLCJhcmdzIiwiYXJndW1lbnRzIiwiZ2V0Iiwic2VydmVyVVJMIiwiVVJMIiwiaW5kZXhPZiIsInBhdGhuYW1lIiwic2xpY2UiLCJsZW5ndGgiLCJiYXRjaCIsInRyYW5zYWN0aW9uUmV0cmllcyIsImluaXRpYWxQcm9taXNlIiwidHJhbnNhY3Rpb24iLCJkYXRhYmFzZSIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicHJvbWlzZXMiLCJyZXF1ZXN0cyIsIm1hcCIsInJlcXVlc3QiLCJib2R5IiwicmVzcG9uc2UiLCJyZXR1cm5TdGF0dXMiLCJzdGF0dXMiLCJfc3RhdHVzIiwic3VjY2VzcyIsImVycm9yIiwiY29kZSIsIm1lc3NhZ2UiLCJhbGwiLCJyZXN1bHQiLCJmaW5kIiwicmVzdWx0SXRlbSIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJyZWplY3QiLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNhdGNoIiwiZXJyb3JJdGVtIiwicXVlcnkiLCJhdXRoIiwiaW5mbyIsImNvbnRleHQiLCJ0cnlSb3V0ZVJlcXVlc3QiLCJyZXNwIiwiX29iamVjdFNwcmVhZCIsImVyciIsIkVycm9yIiwiSU5WQUxJRF9KU09OIiwiYXBwbHkiLCJhamF4IiwiaGFuZGxlRXJyb3IiLCJfZGVmYXVsdCIsImV4cG9ydHMiLCJkZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vc3JjL1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgQ29uZmlnID0gcmVxdWlyZSgnLi9Db25maWcnKTtcbmNvbnN0IEF1dGggPSByZXF1aXJlKCcuL0F1dGgnKTtcbmNvbnN0IFJFU1RDb250cm9sbGVyID0gcmVxdWlyZSgncGFyc2UvbGliL25vZGUvUkVTVENvbnRyb2xsZXInKTtcbmNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuXG5mdW5jdGlvbiBnZXRTZXNzaW9uVG9rZW4ob3B0aW9ucykge1xuICBpZiAob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucy5zZXNzaW9uVG9rZW4gPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShvcHRpb25zLnNlc3Npb25Ub2tlbik7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcbn1cblxuZnVuY3Rpb24gZ2V0QXV0aChvcHRpb25zID0ge30sIGNvbmZpZykge1xuICBjb25zdCBpbnN0YWxsYXRpb25JZCA9IG9wdGlvbnMuaW5zdGFsbGF0aW9uSWQgfHwgJ2Nsb3VkJztcbiAgaWYgKG9wdGlvbnMudXNlTWFzdGVyS2V5KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShuZXcgQXV0aC5BdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSwgaW5zdGFsbGF0aW9uSWQgfSkpO1xuICB9XG4gIHJldHVybiBnZXRTZXNzaW9uVG9rZW4ob3B0aW9ucykudGhlbihzZXNzaW9uVG9rZW4gPT4ge1xuICAgIGlmIChzZXNzaW9uVG9rZW4pIHtcbiAgICAgIG9wdGlvbnMuc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuICAgICAgcmV0dXJuIEF1dGguZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBzZXNzaW9uVG9rZW4sXG4gICAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmV3IEF1dGguQXV0aCh7IGNvbmZpZywgaW5zdGFsbGF0aW9uSWQgfSkpO1xuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIoYXBwbGljYXRpb25JZCwgcm91dGVyKSB7XG4gIGZ1bmN0aW9uIGhhbmRsZVJlcXVlc3QobWV0aG9kLCBwYXRoLCBkYXRhID0ge30sIG9wdGlvbnMgPSB7fSwgY29uZmlnKSB7XG4gICAgLy8gU3RvcmUgdGhlIGFyZ3VtZW50cywgZm9yIGxhdGVyIHVzZSBpZiBpbnRlcm5hbCBmYWlsc1xuICAgIGNvbnN0IGFyZ3MgPSBhcmd1bWVudHM7XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgY29uZmlnID0gQ29uZmlnLmdldChhcHBsaWNhdGlvbklkKTtcbiAgICB9XG4gICAgY29uc3Qgc2VydmVyVVJMID0gbmV3IFVSTChjb25maWcuc2VydmVyVVJMKTtcbiAgICBpZiAocGF0aC5pbmRleE9mKHNlcnZlclVSTC5wYXRobmFtZSkgPT09IDApIHtcbiAgICAgIHBhdGggPSBwYXRoLnNsaWNlKHNlcnZlclVSTC5wYXRobmFtZS5sZW5ndGgsIHBhdGgubGVuZ3RoKTtcbiAgICB9XG5cbiAgICBpZiAocGF0aFswXSAhPT0gJy8nKSB7XG4gICAgICBwYXRoID0gJy8nICsgcGF0aDtcbiAgICB9XG5cbiAgICBpZiAocGF0aCA9PT0gJy9iYXRjaCcpIHtcbiAgICAgIGNvbnN0IGJhdGNoID0gdHJhbnNhY3Rpb25SZXRyaWVzID0+IHtcbiAgICAgICAgbGV0IGluaXRpYWxQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIGlmIChkYXRhLnRyYW5zYWN0aW9uID09PSB0cnVlKSB7XG4gICAgICAgICAgaW5pdGlhbFByb21pc2UgPSBjb25maWcuZGF0YWJhc2UuY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaW5pdGlhbFByb21pc2UudGhlbigoKSA9PiB7XG4gICAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBkYXRhLnJlcXVlc3RzLm1hcChyZXF1ZXN0ID0+IHtcbiAgICAgICAgICAgIHJldHVybiBoYW5kbGVSZXF1ZXN0KHJlcXVlc3QubWV0aG9kLCByZXF1ZXN0LnBhdGgsIHJlcXVlc3QuYm9keSwgb3B0aW9ucywgY29uZmlnKS50aGVuKFxuICAgICAgICAgICAgICByZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMucmV0dXJuU3RhdHVzKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBzdGF0dXMgPSByZXNwb25zZS5fc3RhdHVzO1xuICAgICAgICAgICAgICAgICAgZGVsZXRlIHJlc3BvbnNlLl9zdGF0dXM7XG4gICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiByZXNwb25zZSwgX3N0YXR1czogc3RhdHVzIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHJlc3BvbnNlIH07XG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIGVycm9yID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgZXJyb3I6IHsgY29kZTogZXJyb3IuY29kZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICAgIGlmIChkYXRhLnRyYW5zYWN0aW9uID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5maW5kKHJlc3VsdEl0ZW0gPT4gdHlwZW9mIHJlc3VsdEl0ZW0uZXJyb3IgPT09ICdvYmplY3QnKSkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbmZpZy5kYXRhYmFzZS5hYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBjb25maWcuZGF0YWJhc2UuY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24oKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIGVycm9yICYmXG4gICAgICAgICAgICAgICAgZXJyb3IuZmluZChcbiAgICAgICAgICAgICAgICAgIGVycm9ySXRlbSA9PiB0eXBlb2YgZXJyb3JJdGVtLmVycm9yID09PSAnb2JqZWN0JyAmJiBlcnJvckl0ZW0uZXJyb3IuY29kZSA9PT0gMjUxXG4gICAgICAgICAgICAgICAgKSAmJlxuICAgICAgICAgICAgICAgIHRyYW5zYWN0aW9uUmV0cmllcyA+IDBcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGJhdGNoKHRyYW5zYWN0aW9uUmV0cmllcyAtIDEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICAgIHJldHVybiBiYXRjaCg1KTtcbiAgICB9XG5cbiAgICBsZXQgcXVlcnk7XG4gICAgaWYgKG1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICAgIHF1ZXJ5ID0gZGF0YTtcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgZ2V0QXV0aChvcHRpb25zLCBjb25maWcpLnRoZW4oYXV0aCA9PiB7XG4gICAgICAgIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgICAgICAgYm9keTogZGF0YSxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvOiB7XG4gICAgICAgICAgICBhcHBsaWNhdGlvbklkOiBhcHBsaWNhdGlvbklkLFxuICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBvcHRpb25zLnNlc3Npb25Ub2tlbixcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBvcHRpb25zLmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgY29udGV4dDogb3B0aW9ucy5jb250ZXh0IHx8IHt9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgcXVlcnksXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiByb3V0ZXIudHJ5Um91dGVSZXF1ZXN0KG1ldGhvZCwgcGF0aCwgcmVxdWVzdCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihcbiAgICAgICAgICAgIHJlc3AgPT4ge1xuICAgICAgICAgICAgICBjb25zdCB7IHJlc3BvbnNlLCBzdGF0dXMgfSA9IHJlc3A7XG4gICAgICAgICAgICAgIGlmIChvcHRpb25zLnJldHVyblN0YXR1cykge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyAuLi5yZXNwb25zZSwgX3N0YXR1czogc3RhdHVzIH0pO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIGVyciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yICYmXG4gICAgICAgICAgICAgICAgZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OICYmXG4gICAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPT0gYGNhbm5vdCByb3V0ZSAke21ldGhvZH0gJHtwYXRofWBcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgUkVTVENvbnRyb2xsZXIucmVxdWVzdC5hcHBseShudWxsLCBhcmdzKS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgfSwgcmVqZWN0KTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgcmVxdWVzdDogaGFuZGxlUmVxdWVzdCxcbiAgICBhamF4OiBSRVNUQ29udHJvbGxlci5hamF4LFxuICAgIGhhbmRsZUVycm9yOiBSRVNUQ29udHJvbGxlci5oYW5kbGVFcnJvcixcbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcjtcbmV4cG9ydCB7IFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUEsTUFBTUEsTUFBTSxHQUFHQyxPQUFPLENBQUMsVUFBVSxDQUFDO0FBQ2xDLE1BQU1DLElBQUksR0FBR0QsT0FBTyxDQUFDLFFBQVEsQ0FBQztBQUM5QixNQUFNRSxjQUFjLEdBQUdGLE9BQU8sQ0FBQywrQkFBK0IsQ0FBQztB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