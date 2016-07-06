'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); // A router that is based on promises rather than req/res/next.
// This is intended to replace the use of express.Router to handle
// subsections of the API surface.
// This will make it easier to have methods like 'batch' that
// themselves use our routing information, without disturbing express
// components that external developers may be modifying.

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

var _logger = require('./logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

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
    var routes = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];

    _classCallCheck(this, PromiseRouter);

    this.routes = routes;
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
        var length = handlers.length;
        handler = function handler(req) {
          return handlers.reduce(function (promise, handler) {
            return promise.then(function (result) {
              return handler(req);
            });
          }, Promise.resolve());
        };
      }

      this.routes.push({
        path: path,
        method: method,
        handler: handler
      });
    }
  }, {
    key: 'match',


    // Returns an object with:
    //   handler: the handler that should deal with this request
    //   params: any :-params that got parsed from the path
    // Returns undefined if there is no match.
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
          // NOTE: we can only route the specific wildcards :className and
          // :objectId, and in that order.
          // This is pretty hacky but I don't want to rebuild the entire
          // express route matcher. Maybe there's a way to reuse its logic.
          var pattern = '^' + route.path + '$';

          pattern = pattern.replace(':className', '(_?[A-Za-z][A-Za-z_0-9]*)');
          pattern = pattern.replace(':objectId', '([A-Za-z0-9]+)');
          var re = new RegExp(pattern);
          var m = path.match(re);
          if (!m) {
            continue;
          }
          var params = {};
          if (m[1]) {
            params.className = m[1];
          }
          if (m[2]) {
            params.objectId = m[2];
          }

          return { params: params, handler: route.handler };
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
  }, {
    key: 'mountOnto',


    // Mount the routes on this router onto an express app (or express router)
    value: function mountOnto(expressApp) {
      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = this.routes[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var route = _step3.value;

          switch (route.method) {
            case 'POST':
              expressApp.post(route.path, makeExpressHandler(route.handler));
              break;
            case 'GET':
              expressApp.get(route.path, makeExpressHandler(route.handler));
              break;
            case 'PUT':
              expressApp.put(route.path, makeExpressHandler(route.handler));
              break;
            case 'DELETE':
              expressApp.delete(route.path, makeExpressHandler(route.handler));
              break;
            default:
              throw 'unexpected code branch';
          }
        }
      } catch (err) {
        _didIteratorError3 = true;
        _iteratorError3 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion3 && _iterator3.return) {
            _iterator3.return();
          }
        } finally {
          if (_didIteratorError3) {
            throw _iteratorError3;
          }
        }
      }
    }
  }, {
    key: 'expressApp',
    value: function expressApp() {
      var expressApp = (0, _express2.default)();
      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = this.routes[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var route = _step4.value;

          switch (route.method) {
            case 'POST':
              expressApp.post(route.path, makeExpressHandler(route.handler));
              break;
            case 'GET':
              expressApp.get(route.path, makeExpressHandler(route.handler));
              break;
            case 'PUT':
              expressApp.put(route.path, makeExpressHandler(route.handler));
              break;
            case 'DELETE':
              expressApp.delete(route.path, makeExpressHandler(route.handler));
              break;
            default:
              throw 'unexpected code branch';
          }
        }
      } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion4 && _iterator4.return) {
            _iterator4.return();
          }
        } finally {
          if (_didIteratorError4) {
            throw _iteratorError4;
          }
        }
      }

      return expressApp;
    }
  }]);

  return PromiseRouter;
}();

// A helper function to make an express handler out of a a promise
// handler.
// Express handlers should never throw; if a promise handler throws we
// just treat it like it resolved to an error.


exports.default = PromiseRouter;
function makeExpressHandler(promiseHandler) {
  return function (req, res, next) {
    try {
      _logger2.default.verbose(req.method, maskSensitiveUrl(req), req.headers, JSON.stringify(maskSensitiveBody(req), null, 2));
      promiseHandler(req).then(function (result) {
        if (!result.response && !result.location && !result.text) {
          _logger2.default.error('the handler did not include a "response" or a "location" field');
          throw 'control should not get here';
        }
        _logger2.default.verbose(JSON.stringify(result, null, 2));

        var status = result.status || 200;
        res.status(status);

        if (result.text) {
          return res.send(result.text);
        }

        if (result.location) {
          res.set('Location', result.location);
          // Override the default expressjs response
          // as it double encodes %encoded chars in URL
          if (!result.response) {
            return res.send('Found. Redirecting to ' + result.location);
          }
        }
        if (result.headers) {
          Object.keys(result.headers).forEach(function (header) {
            res.set(header, result.headers[header]);
          });
        }
        res.json(result.response);
      }, function (e) {
        _logger2.default.verbose('error:', e);
        next(e);
      });
    } catch (e) {
      _logger2.default.verbose('exception:', e);
      next(e);
    }
  };
}

function maskSensitiveBody(req) {
  var maskBody = Object.assign({}, req.body);
  var shouldMaskBody = req.method === 'POST' && req.originalUrl.endsWith('/users') && !req.originalUrl.includes('classes') || req.method === 'PUT' && /users\/\w+$/.test(req.originalUrl) && !req.originalUrl.includes('classes') || req.originalUrl.includes('classes/_User');
  if (shouldMaskBody) {
    var _iteratorNormalCompletion5 = true;
    var _didIteratorError5 = false;
    var _iteratorError5 = undefined;

    try {
      for (var _iterator5 = Object.keys(maskBody)[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
        var key = _step5.value;

        if (key == 'password') {
          maskBody[key] = '********';
          break;
        }
      }
    } catch (err) {
      _didIteratorError5 = true;
      _iteratorError5 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion5 && _iterator5.return) {
          _iterator5.return();
        }
      } finally {
        if (_didIteratorError5) {
          throw _iteratorError5;
        }
      }
    }
  }
  return maskBody;
}

function maskSensitiveUrl(req) {
  var maskUrl = req.originalUrl.toString();
  var shouldMaskUrl = req.method === 'GET' && req.originalUrl.includes('/login') && !req.originalUrl.includes('classes');
  if (shouldMaskUrl) {
    var password = _url2.default.parse(req.originalUrl, true).query.password;
    if (password) {
      maskUrl = maskUrl.replace('password=' + password, 'password=********');
    }
  }
  return maskUrl;
}