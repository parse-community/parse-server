"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _express = _interopRequireDefault(require("express"));

var _logger = _interopRequireDefault(require("./logger"));

var _util = require("util");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// A router that is based on promises rather than req/res/next.
// This is intended to replace the use of express.Router to handle
// subsections of the API surface.
// This will make it easier to have methods like 'batch' that
// themselves use our routing information, without disturbing express
// components that external developers may be modifying.
const Layer = require('express/lib/router/layer');

function validateParameter(key, value) {
  if (key == 'className') {
    if (value.match(/_?[A-Za-z][A-Za-z_0-9]*/)) {
      return value;
    }
  } else if (key == 'objectId') {
    if (value.match(/[A-Za-z0-9]+/)) {
      return value;
    }
  } else {
    return value;
  }
}

class PromiseRouter {
  // Each entry should be an object with:
  // path: the path to route, in express format
  // method: the HTTP method that this route handles.
  //   Must be one of: POST, GET, PUT, DELETE
  // handler: a function that takes request, and returns a promise.
  //   Successful handlers should resolve to an object with fields:
  //     status: optional. the http status code. defaults to 200
  //     response: a json object with the content of the response
  //     location: optional. a location header
  constructor(routes = [], appId) {
    this.routes = routes;
    this.appId = appId;
    this.mountRoutes();
  } // Leave the opportunity to
  // subclasses to mount their routes by overriding


  mountRoutes() {} // Merge the routes into this one


  merge(router) {
    for (var route of router.routes) {
      this.routes.push(route);
    }
  }

  route(method, path, ...handlers) {
    switch (method) {
      case 'POST':
      case 'GET':
      case 'PUT':
      case 'DELETE':
        break;

      default:
        throw 'cannot route method: ' + method;
    }

    let handler = handlers[0];

    if (handlers.length > 1) {
      handler = function (req) {
        return handlers.reduce((promise, handler) => {
          return promise.then(() => {
            return handler(req);
          });
        }, Promise.resolve());
      };
    }

    this.routes.push({
      path: path,
      method: method,
      handler: handler,
      layer: new Layer(path, null, handler)
    });
  } // Returns an object with:
  //   handler: the handler that should deal with this request
  //   params: any :-params that got parsed from the path
  // Returns undefined if there is no match.


  match(method, path) {
    for (var route of this.routes) {
      if (route.method != method) {
        continue;
      }

      const layer = route.layer || new Layer(route.path, null, route.handler);
      const match = layer.match(path);

      if (match) {
        const params = layer.params;
        Object.keys(params).forEach(key => {
          params[key] = validateParameter(key, params[key]);
        });
        return {
          params: params,
          handler: route.handler
        };
      }
    }
  } // Mount the routes on this router onto an express app (or express router)


  mountOnto(expressApp) {
    this.routes.forEach(route => {
      const method = route.method.toLowerCase();
      const handler = makeExpressHandler(this.appId, route.handler);
      expressApp[method].call(expressApp, route.path, handler);
    });
    return expressApp;
  }

  expressRouter() {
    return this.mountOnto(_express.default.Router());
  }

  tryRouteRequest(method, path, request) {
    var match = this.match(method, path);

    if (!match) {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'cannot route ' + method + ' ' + path);
    }

    request.params = match.params;
    return new Promise((resolve, reject) => {
      match.handler(request).then(resolve, reject);
    });
  }

} // A helper function to make an express handler out of a a promise
// handler.
// Express handlers should never throw; if a promise handler throws we
// just treat it like it resolved to an error.


exports.default = PromiseRouter;

function makeExpressHandler(appId, promiseHandler) {
  return function (req, res, next) {
    try {
      const url = maskSensitiveUrl(req);
      const body = Object.assign({}, req.body);
      const method = req.method;
      const headers = req.headers;

      _logger.default.logRequest({
        method,
        url,
        headers,
        body
      });

      promiseHandler(req).then(result => {
        if (!result.response && !result.location && !result.text) {
          _logger.default.error('the handler did not include a "response" or a "location" field');

          throw 'control should not get here';
        }

        _logger.default.logResponse({
          method,
          url,
          result
        });

        var status = result.status || 200;
        res.status(status);

        if (result.headers) {
          Object.keys(result.headers).forEach(header => {
            res.set(header, result.headers[header]);
          });
        }

        if (result.text) {
          res.send(result.text);
          return;
        }

        if (result.location) {
          res.set('Location', result.location); // Override the default expressjs response
          // as it double encodes %encoded chars in URL

          if (!result.response) {
            res.send('Found. Redirecting to ' + result.location);
            return;
          }
        }

        res.json(result.response);
      }, error => {
        next(error);
      }).catch(e => {
        _logger.default.error(`Error generating response. ${(0, _util.inspect)(e)}`, {
          error: e
        });

        next(e);
      });
    } catch (e) {
      _logger.default.error(`Error handling request: ${(0, _util.inspect)(e)}`, {
        error: e
      });

      next(e);
    }
  };
}

function maskSensitiveUrl(req) {
  let maskUrl = req.originalUrl.toString();
  const shouldMaskUrl = req.method === 'GET' && req.originalUrl.includes('/login') && !req.originalUrl.includes('classes');

  if (shouldMaskUrl) {
    maskUrl = _logger.default.maskSensitiveUrl(maskUrl);
  }

  return maskUrl;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9Qcm9taXNlUm91dGVyLmpzIl0sIm5hbWVzIjpbIkxheWVyIiwicmVxdWlyZSIsInZhbGlkYXRlUGFyYW1ldGVyIiwia2V5IiwidmFsdWUiLCJtYXRjaCIsIlByb21pc2VSb3V0ZXIiLCJjb25zdHJ1Y3RvciIsInJvdXRlcyIsImFwcElkIiwibW91bnRSb3V0ZXMiLCJtZXJnZSIsInJvdXRlciIsInJvdXRlIiwicHVzaCIsIm1ldGhvZCIsInBhdGgiLCJoYW5kbGVycyIsImhhbmRsZXIiLCJsZW5ndGgiLCJyZXEiLCJyZWR1Y2UiLCJwcm9taXNlIiwidGhlbiIsIlByb21pc2UiLCJyZXNvbHZlIiwibGF5ZXIiLCJwYXJhbXMiLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsIm1vdW50T250byIsImV4cHJlc3NBcHAiLCJ0b0xvd2VyQ2FzZSIsIm1ha2VFeHByZXNzSGFuZGxlciIsImNhbGwiLCJleHByZXNzUm91dGVyIiwiZXhwcmVzcyIsIlJvdXRlciIsInRyeVJvdXRlUmVxdWVzdCIsInJlcXVlc3QiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9KU09OIiwicmVqZWN0IiwicHJvbWlzZUhhbmRsZXIiLCJyZXMiLCJuZXh0IiwidXJsIiwibWFza1NlbnNpdGl2ZVVybCIsImJvZHkiLCJhc3NpZ24iLCJoZWFkZXJzIiwibG9nIiwibG9nUmVxdWVzdCIsInJlc3VsdCIsInJlc3BvbnNlIiwibG9jYXRpb24iLCJ0ZXh0IiwiZXJyb3IiLCJsb2dSZXNwb25zZSIsInN0YXR1cyIsImhlYWRlciIsInNldCIsInNlbmQiLCJqc29uIiwiY2F0Y2giLCJlIiwibWFza1VybCIsIm9yaWdpbmFsVXJsIiwidG9TdHJpbmciLCJzaG91bGRNYXNrVXJsIiwiaW5jbHVkZXMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFPQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQVZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU1BLE1BQU1BLEtBQUssR0FBR0MsT0FBTyxD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QWxDTCxFQW1DSUcsS0FBSyxJQUFJO0FBQ1BaLFFBQUFBLElBQUksQ0FBQ1ksS0FBRCxDQUFKO0FBQ0QsT0FyQ0wsRUF1Q0dPLEtBdkNILENBdUNTQyxDQUFDLElBQUk7QUFDVmQsd0JBQUlNLEtBQUosQ0FBVyw4QkFBNkIsbUJBQVFRLENBQVIsQ0FBVyxFQUFuRCxFQUFzRDtBQUFFUixVQUFBQSxLQUFLLEVBQUVRO0FBQVQsU0FBdEQ7O0FBQ0FwQixRQUFBQSxJQUFJLENBQUNvQixDQUFELENBQUo7QUFDRCxPQTFDSDtBQTJDRCxLQXRERCxDQXNERSxPQUFPQSxDQUFQLEVBQVU7QUFDVmQsc0JBQUlNLEtBQUosQ0FBVywyQkFBMEIsbUJBQVFRLENBQVIsQ0FBVyxFQUFoRCxFQUFtRDtBQUFFUixRQUFBQSxLQUFLLEVBQUVRO0FBQVQsT0FBbkQ7O0FBQ0FwQixNQUFBQSxJQUFJLENBQUNvQixDQUFELENBQUo7QUFDRDtBQUNGLEdBM0REO0FBNEREOztBQUVELFNBQVNsQixnQkFBVCxDQUEwQjdCLEdBQTFCLEVBQStCO0FBQzdCLE1BQUlnRCxPQUFPLEdBQUdoRCxHQUFHLENBQUNpRCxXQUFKLENBQWdCQyxRQUFoQixFQUFkO0FBQ0EsUUFBTUMsYUFBYSxHQUNqQm5ELEdBQUcsQ0FBQ0wsTUFBSixLQUFlLEtBQWYsSUFDQUssR0FBRyxDQUFDaUQsV0FBSixDQUFnQkcsUUFBaEIsQ0FBeUIsUUFBekIsQ0FEQSxJQUVBLENBQUNwRCxHQUFHLENBQUNpRCxXQUFKLENBQWdCRyxRQUFoQixDQUF5QixTQUF6QixDQUhIOztBQUlBLE1BQUlELGFBQUosRUFBbUI7QUFDakJILElBQUFBLE9BQU8sR0FBR2YsZ0JBQUlKLGdCQUFKLENBQXFCbUIsT0FBckIsQ0FBVjtBQUNEOztBQUNELFNBQU9BLE9BQVA7QUFDRCIsInNvdXJjZXNDb250ZW50IjpbIi8vIEEgcm91dGVyIHRoYXQgaXMgYmFzZWQgb24gcHJvbWlzZXMgcmF0aGVyIHRoYW4gcmVxL3Jlcy9uZXh0LlxuLy8gVGhpcyBpcyBpbnRlbmRlZCB0byByZXBsYWNlIHRoZSB1c2Ugb2YgZXhwcmVzcy5Sb3V0ZXIgdG8gaGFuZGxlXG4vLyBzdWJzZWN0aW9ucyBvZiB0aGUgQVBJIHN1cmZhY2UuXG4vLyBUaGlzIHdpbGwgbWFrZSBpdCBlYXNpZXIgdG8gaGF2ZSBtZXRob2RzIGxpa2UgJ2JhdGNoJyB0aGF0XG4vLyB0aGVtc2VsdmVzIHVzZSBvdXIgcm91dGluZyBpbmZvcm1hdGlvbiwgd2l0aG91dCBkaXN0dXJiaW5nIGV4cHJlc3Ncbi8vIGNvbXBvbmVudHMgdGhhdCBleHRlcm5hbCBkZXZlbG9wZXJzIG1heSBiZSBtb2RpZnlpbmcuXG5cbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBleHByZXNzIGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0IGxvZyBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyBpbnNwZWN0IH0gZnJvbSAndXRpbCc7XG5jb25zdCBMYXllciA9IHJlcXVpcmUoJ2V4cHJlc3MvbGliL3JvdXRlci9sYXllcicpO1xuXG5mdW5jdGlvbiB2YWxpZGF0ZVBhcmFtZXRlcihrZXksIHZhbHVlKSB7XG4gIGlmIChrZXkgPT0gJ2NsYXNzTmFtZScpIHtcbiAgICBpZiAodmFsdWUubWF0Y2goL18/W0EtWmEtel1bQS1aYS16XzAtOV0qLykpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoa2V5ID09ICdvYmplY3RJZCcpIHtcbiAgICBpZiAodmFsdWUubWF0Y2goL1tBLVphLXowLTldKy8pKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBQcm9taXNlUm91dGVyIHtcbiAgLy8gRWFjaCBlbnRyeSBzaG91bGQgYmUgYW4gb2JqZWN0IHdpdGg6XG4gIC8vIHBhdGg6IHRoZSBwYXRoIHRvIHJvdXRlLCBpbiBleHByZXNzIGZvcm1hdFxuICAvLyBtZXRob2Q6IHRoZSBIVFRQIG1ldGhvZCB0aGF0IHRoaXMgcm91dGUgaGFuZGxlcy5cbiAgLy8gICBNdXN0IGJlIG9uZSBvZjogUE9TVCwgR0VULCBQVVQsIERFTEVURVxuICAvLyBoYW5kbGVyOiBhIGZ1bmN0aW9uIHRoYXQgdGFrZXMgcmVxdWVzdCwgYW5kIHJldHVybnMgYSBwcm9taXNlLlxuICAvLyAgIFN1Y2Nlc3NmdWwgaGFuZGxlcnMgc2hvdWxkIHJlc29sdmUgdG8gYW4gb2JqZWN0IHdpdGggZmllbGRzOlxuICAvLyAgICAgc3RhdHVzOiBvcHRpb25hbC4gdGhlIGh0dHAgc3RhdHVzIGNvZGUuIGRlZmF1bHRzIHRvIDIwMFxuICAvLyAgICAgcmVzcG9uc2U6IGEganNvbiBvYmplY3Qgd2l0aCB0aGUgY29udGVudCBvZiB0aGUgcmVzcG9uc2VcbiAgLy8gICAgIGxvY2F0aW9uOiBvcHRpb25hbC4gYSBsb2NhdGlvbiBoZWFkZXJcbiAgY29uc3RydWN0b3Iocm91dGVzID0gW10sIGFwcElkKSB7XG4gICAgdGhpcy5yb3V0ZXMgPSByb3V0ZXM7XG4gICAgdGhpcy5hcHBJZCA9IGFwcElkO1xuICAgIHRoaXMubW91bnRSb3V0ZXMoKTtcbiAgfVxuXG4gIC8vIExlYXZlIHRoZSBvcHBvcnR1bml0eSB0b1xuICAvLyBzdWJjbGFzc2VzIHRvIG1vdW50IHRoZWlyIHJvdXRlcyBieSBvdmVycmlkaW5nXG4gIG1vdW50Um91dGVzKCkge31cblxuICAvLyBNZXJnZSB0aGUgcm91dGVzIGludG8gdGhpcyBvbmVcbiAgbWVyZ2Uocm91dGVyKSB7XG4gICAgZm9yICh2YXIgcm91dGUgb2Ygcm91dGVyLnJvdXRlcykge1xuICAgICAgdGhpcy5yb3V0ZXMucHVzaChyb3V0ZSk7XG4gICAgfVxuICB9XG5cbiAgcm91dGUobWV0aG9kLCBwYXRoLCAuLi5oYW5kbGVycykge1xuICAgIHN3aXRjaCAobWV0aG9kKSB7XG4gICAgICBjYXNlICdQT1NUJzpcbiAgICAgIGNhc2UgJ0dFVCc6XG4gICAgICBjYXNlICdQVVQnOlxuICAgICAgY2FzZSAnREVMRVRFJzpcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyAnY2Fubm90IHJvdXRlIG1ldGhvZDogJyArIG1ldGhvZDtcbiAgICB9XG5cbiAgICBsZXQgaGFuZGxlciA9IGhhbmRsZXJzWzBdO1xuXG4gICAgaWYgKGhhbmRsZXJzLmxlbmd0aCA+IDEpIHtcbiAgICAgIGhhbmRsZXIgPSBmdW5jdGlvbiAocmVxKSB7XG4gICAgICAgIHJldHVybiBoYW5kbGVycy5yZWR1Y2UoKHByb21pc2UsIGhhbmRsZXIpID0+IHtcbiAgICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBoYW5kbGVyKHJlcSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0sIFByb21pc2UucmVzb2x2ZSgpKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgdGhpcy5yb3V0ZXMucHVzaCh7XG4gICAgICBwYXRoOiBwYXRoLFxuICAgICAgbWV0aG9kOiBtZXRob2QsXG4gICAgICBoYW5kbGVyOiBoYW5kbGVyLFxuICAgICAgbGF5ZXI6IG5ldyBMYXllcihwYXRoLCBudWxsLCBoYW5kbGVyKSxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYW4gb2JqZWN0IHdpdGg6XG4gIC8vICAgaGFuZGxlcjogdGhlIGhhbmRsZXIgdGhhdCBzaG91bGQgZGVhbCB3aXRoIHRoaXMgcmVxdWVzdFxuICAvLyAgIHBhcmFtczogYW55IDotcGFyYW1zIHRoYXQgZ290IHBhcnNlZCBmcm9tIHRoZSBwYXRoXG4gIC8vIFJldHVybnMgdW5kZWZpbmVkIGlmIHRoZXJlIGlzIG5vIG1hdGNoLlxuICBtYXRjaChtZXRob2QsIHBhdGgpIHtcbiAgICBmb3IgKHZhciByb3V0ZSBvZiB0aGlzLnJvdXRlcykge1xuICAgICAgaWYgKHJvdXRlLm1ldGhvZCAhPSBtZXRob2QpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBsYXllciA9IHJvdXRlLmxheWVyIHx8IG5ldyBMYXllcihyb3V0ZS5wYXRoLCBudWxsLCByb3V0ZS5oYW5kbGVyKTtcbiAgICAgIGNvbnN0IG1hdGNoID0gbGF5ZXIubWF0Y2gocGF0aCk7XG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgY29uc3QgcGFyYW1zID0gbGF5ZXIucGFyYW1zO1xuICAgICAgICBPYmplY3Qua2V5cyhwYXJhbXMpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBwYXJhbXNba2V5XSA9IHZhbGlkYXRlUGFyYW1ldGVyKGtleSwgcGFyYW1zW2tleV0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHsgcGFyYW1zOiBwYXJhbXMsIGhhbmRsZXI6IHJvdXRlLmhhbmRsZXIgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBNb3VudCB0aGUgcm91dGVzIG9uIHRoaXMgcm91dGVyIG9udG8gYW4gZXhwcmVzcyBhcHAgKG9yIGV4cHJlc3Mgcm91dGVyKVxuICBtb3VudE9udG8oZXhwcmVzc0FwcCkge1xuICAgIHRoaXMucm91dGVzLmZvckVhY2gocm91dGUgPT4ge1xuICAgICAgY29uc3QgbWV0aG9kID0gcm91dGUubWV0aG9kLnRvTG93ZXJDYXNlKCk7XG4gICAgICBjb25zdCBoYW5kbGVyID0gbWFrZUV4cHJlc3NIYW5kbGVyKHRoaXMuYXBwSWQsIHJvdXRlLmhhbmRsZXIpO1xuICAgICAgZXhwcmVzc0FwcFttZXRob2RdLmNhbGwoZXhwcmVzc0FwcCwgcm91dGUucGF0aCwgaGFuZGxlcik7XG4gICAgfSk7XG4gICAgcmV0dXJuIGV4cHJlc3NBcHA7XG4gIH1cblxuICBleHByZXNzUm91dGVyKCkge1xuICAgIHJldHVybiB0aGlzLm1vdW50T250byhleHByZXNzLlJvdXRlcigpKTtcbiAgfVxuXG4gIHRyeVJvdXRlUmVxdWVzdChtZXRob2QsIHBhdGgsIHJlcXVlc3QpIHtcbiAgICB2YXIgbWF0Y2ggPSB0aGlzLm1hdGNoKG1ldGhvZCwgcGF0aCk7XG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2Nhbm5vdCByb3V0ZSAnICsgbWV0aG9kICsgJyAnICsgcGF0aCk7XG4gICAgfVxuICAgIHJlcXVlc3QucGFyYW1zID0gbWF0Y2gucGFyYW1zO1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBtYXRjaC5oYW5kbGVyKHJlcXVlc3QpLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcbiAgICB9KTtcbiAgfVxufVxuXG4vLyBBIGhlbHBlciBmdW5jdGlvbiB0byBtYWtlIGFuIGV4cHJlc3MgaGFuZGxlciBvdXQgb2YgYSBhIHByb21pc2Vcbi8vIGhhbmRsZXIuXG4vLyBFeHByZXNzIGhhbmRsZXJzIHNob3VsZCBuZXZlciB0aHJvdzsgaWYgYSBwcm9taXNlIGhhbmRsZXIgdGhyb3dzIHdlXG4vLyBqdXN0IHRyZWF0IGl0IGxpa2UgaXQgcmVzb2x2ZWQgdG8gYW4gZXJyb3IuXG5mdW5jdGlvbiBtYWtlRXhwcmVzc0hhbmRsZXIoYXBwSWQsIHByb21pc2VIYW5kbGVyKSB7XG4gIHJldHVybiBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbWFza1NlbnNpdGl2ZVVybChyZXEpO1xuICAgICAgY29uc3QgYm9keSA9IE9iamVjdC5hc3NpZ24oe30sIHJlcS5ib2R5KTtcbiAgICAgIGNvbnN0IG1ldGhvZCA9IHJlcS5tZXRob2Q7XG4gICAgICBjb25zdCBoZWFkZXJzID0gcmVxLmhlYWRlcnM7XG4gICAgICBsb2cubG9nUmVxdWVzdCh7XG4gICAgICAgIG1ldGhvZCxcbiAgICAgICAgdXJsLFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBib2R5LFxuICAgICAgfSk7XG4gICAgICBwcm9taXNlSGFuZGxlcihyZXEpXG4gICAgICAgIC50aGVuKFxuICAgICAgICAgIHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdC5yZXNwb25zZSAmJiAhcmVzdWx0LmxvY2F0aW9uICYmICFyZXN1bHQudGV4dCkge1xuICAgICAgICAgICAgICBsb2cuZXJyb3IoJ3RoZSBoYW5kbGVyIGRpZCBub3QgaW5jbHVkZSBhIFwicmVzcG9uc2VcIiBvciBhIFwibG9jYXRpb25cIiBmaWVsZCcpO1xuICAgICAgICAgICAgICB0aHJvdyAnY29udHJvbCBzaG91bGQgbm90IGdldCBoZXJlJztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbG9nLmxvZ1Jlc3BvbnNlKHsgbWV0aG9kLCB1cmwsIHJlc3VsdCB9KTtcblxuICAgICAgICAgICAgdmFyIHN0YXR1cyA9IHJlc3VsdC5zdGF0dXMgfHwgMjAwO1xuICAgICAgICAgICAgcmVzLnN0YXR1cyhzdGF0dXMpO1xuXG4gICAgICAgICAgICBpZiAocmVzdWx0LmhlYWRlcnMpIHtcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXMocmVzdWx0LmhlYWRlcnMpLmZvckVhY2goaGVhZGVyID0+IHtcbiAgICAgICAgICAgICAgICByZXMuc2V0KGhlYWRlciwgcmVzdWx0LmhlYWRlcnNbaGVhZGVyXSk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocmVzdWx0LnRleHQpIHtcbiAgICAgICAgICAgICAgcmVzLnNlbmQocmVzdWx0LnRleHQpO1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyZXN1bHQubG9jYXRpb24pIHtcbiAgICAgICAgICAgICAgcmVzLnNldCgnTG9jYXRpb24nLCByZXN1bHQubG9jYXRpb24pO1xuICAgICAgICAgICAgICAvLyBPdmVycmlkZSB0aGUgZGVmYXVsdCBleHByZXNzanMgcmVzcG9uc2VcbiAgICAgICAgICAgICAgLy8gYXMgaXQgZG91YmxlIGVuY29kZXMgJWVuY29kZWQgY2hhcnMgaW4gVVJMXG4gICAgICAgICAgICAgIGlmICghcmVzdWx0LnJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgcmVzLnNlbmQoJ0ZvdW5kLiBSZWRpcmVjdGluZyB0byAnICsgcmVzdWx0LmxvY2F0aW9uKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcy5qc29uKHJlc3VsdC5yZXNwb25zZSk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBlcnJvciA9PiB7XG4gICAgICAgICAgICBuZXh0KGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgIClcbiAgICAgICAgLmNhdGNoKGUgPT4ge1xuICAgICAgICAgIGxvZy5lcnJvcihgRXJyb3IgZ2VuZXJhdGluZyByZXNwb25zZS4gJHtpbnNwZWN0KGUpfWAsIHsgZXJyb3I6IGUgfSk7XG4gICAgICAgICAgbmV4dChlKTtcbiAgICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nLmVycm9yKGBFcnJvciBoYW5kbGluZyByZXF1ZXN0OiAke2luc3BlY3QoZSl9YCwgeyBlcnJvcjogZSB9KTtcbiAgICAgIG5leHQoZSk7XG4gICAgfVxuICB9O1xufVxuXG5mdW5jdGlvbiBtYXNrU2Vuc2l0aXZlVXJsKHJlcSkge1xuICBsZXQgbWFza1VybCA9IHJlcS5vcmlnaW5hbFVybC50b1N0cmluZygpO1xuICBjb25zdCBzaG91bGRNYXNrVXJsID1cbiAgICByZXEubWV0aG9kID09PSAnR0VUJyAmJlxuICAgIHJlcS5vcmlnaW5hbFVybC5pbmNsdWRlcygnL2xvZ2luJykgJiZcbiAgICAhcmVxLm9yaWdpbmFsVXJsLmluY2x1ZGVzKCdjbGFzc2VzJyk7XG4gIGlmIChzaG91bGRNYXNrVXJsKSB7XG4gICAgbWFza1VybCA9IGxvZy5tYXNrU2Vuc2l0aXZlVXJsKG1hc2tVcmwpO1xuICB9XG4gIHJldHVybiBtYXNrVXJsO1xufVxuIl19