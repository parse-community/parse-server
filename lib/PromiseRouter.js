'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); // A router that is based on promises rather than req/res/next.
// This is intended to replace the use of express.Router to handle
// subsections of the API surface.
// This will make it easier to have methods like 'batch' that
// themselves use our routing information, without disturbing express
// components that external developers may be modifying.

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _logger = require('./logger');

var _logger2 = _interopRequireDefault(_logger);

var _util = require('util');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Layer = require('express/lib/router/layer');

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

var PromiseRouter = function () {
  // Each entry should be an object with:
  // path: the path to route, in express format
  // method: the HTTP method that this route handles.
  //   Must be one of: POST, GET, PUT, DELETE
  // handler: a function that takes request, and returns a promise.
  //   Successful handlers should resolve to an object with fields:
  //     status: optional. the http status code. defaults to 200
  //     response: a json object with the content of the response
  //     location: optional. a location header
  function PromiseRouter() {
    var routes = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
    var appId = arguments[1];

    _classCallCheck(this, PromiseRouter);

    this.routes = routes;
    this.appId = appId;
    this.mountRoutes();
  }

  // Leave the opportunity to
  // subclasses to mount their routes by overriding


  _createClass(PromiseRouter, [{
    key: 'mountRoutes',
    value: function mountRoutes() {}

    // Merge the routes into this one

  }, {
    key: 'merge',
    value: function merge(router) {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = router.routes[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var route = _step.value;

          this.routes.push(route);
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }
  }, {
    key: 'route',
    value: function route(method, path) {
      for (var _len = arguments.length, handlers = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
        handlers[_key - 2] = arguments[_key];
      }

      switch (method) {
        case 'POST':
        case 'GET':
        case 'PUT':
        case 'DELETE':
          break;
        default:
          throw 'cannot route method: ' + method;
      }

      var handler = handlers[0];

      if (handlers.length > 1) {
        handler = function handler(req) {
          return handlers.reduce(function (promise, handler) {
            return promise.then(function () {
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
    }

    // Returns an object with:
    //   handler: the handler that should deal with this request
    //   params: any :-params that got parsed from the path
    // Returns undefined if there is no match.

  }, {
    key: 'match',
    value: function match(method, path) {
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = this.routes[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var route = _step2.value;

          if (route.method != method) {
            continue;
          }
          var layer = route.layer || new Layer(route.path, null, route.handler);
          var match = layer.match(path);
          if (match) {
            var _ret = function () {
              var params = layer.params;
              Object.keys(params).forEach(function (key) {
                params[key] = validateParameter(key, params[key]);
              });
              return {
                v: { params: params, handler: route.handler }
              };
            }();

            if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
          }
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }
    }

    // Mount the routes on this router onto an express app (or express router)

  }, {
    key: 'mountOnto',
    value: function mountOnto(expressApp) {
      var _this = this;

      this.routes.forEach(function (route) {
        var method = route.method.toLowerCase();
        var handler = makeExpressHandler(_this.appId, route.handler);
        expressApp[method].call(expressApp, route.path, handler);
      });
      return expressApp;
    }
  }, {
    key: 'expressRouter',
    value: function expressRouter() {
      return this.mountOnto(_express2.default.Router());
    }
  }, {
    key: 'tryRouteRequest',
    value: function tryRouteRequest(method, path, request) {
      var match = this.match(method, path);
      if (!match) {
        throw new _node2.default.Error(_node2.default.Error.INVALID_JSON, 'cannot route ' + method + ' ' + path);
      }
      request.params = match.params;
      return new Promise(function (resolve, reject) {
        match.handler(request).then(resolve, reject);
      });
    }
  }]);

  return PromiseRouter;
}();

// A helper function to make an express handler out of a a promise
// handler.
// Express handlers should never throw; if a promise handler throws we
// just treat it like it resolved to an error.


exports.default = PromiseRouter;
function makeExpressHandler(appId, promiseHandler) {
  return function (req, res, next) {
    try {
      var url = maskSensitiveUrl(req);
      var body = Object.assign({}, req.body);
      var stringifiedBody = JSON.stringify(body, null, 2);
      _logger2.default.verbose('REQUEST for [' + req.method + '] ' + url + ': ' + stringifiedBody, {
        method: req.method,
        url: url,
        headers: req.headers,
        body: body
      });
      promiseHandler(req).then(function (result) {
        if (!result.response && !result.location && !result.text) {
          _logger2.default.error('the handler did not include a "response" or a "location" field');
          throw 'control should not get here';
        }

        var stringifiedResponse = JSON.stringify(result, null, 2);
        _logger2.default.verbose('RESPONSE from [' + req.method + '] ' + url + ': ' + stringifiedResponse, { result: result });

        var status = result.status || 200;
        res.status(status);

        if (result.text) {
          res.send(result.text);
          return;
        }

        if (result.location) {
          res.set('Location', result.location);
          // Override the default expressjs response
          // as it double encodes %encoded chars in URL
          if (!result.response) {
            res.send('Found. Redirecting to ' + result.location);
            return;
          }
        }
        if (result.headers) {
          Object.keys(result.headers).forEach(function (header) {
            res.set(header, result.headers[header]);
          });
        }
        res.json(result.response);
      }, function (e) {
        _logger2.default.error('Error generating response. ' + (0, _util.inspect)(e), { error: e });
        next(e);
      });
    } catch (e) {
      _logger2.default.error('Error handling request: ' + (0, _util.inspect)(e), { error: e });
      next(e);
    }
  };
}

function maskSensitiveUrl(req) {
  var maskUrl = req.originalUrl.toString();
  var shouldMaskUrl = req.method === 'GET' && req.originalUrl.includes('/login') && !req.originalUrl.includes('classes');
  if (shouldMaskUrl) {
    maskUrl = _logger2.default.maskSensitiveUrl(maskUrl);
  }
  return maskUrl;
}