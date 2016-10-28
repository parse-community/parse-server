'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ClassesRouter = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _PromiseRouter2 = require('../PromiseRouter');

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var ALLOWED_GET_QUERY_KEYS = ['keys', 'include'];

var ClassesRouter = exports.ClassesRouter = function (_PromiseRouter) {
  _inherits(ClassesRouter, _PromiseRouter);

  function ClassesRouter() {
    _classCallCheck(this, ClassesRouter);

    return _possibleConstructorReturn(this, (ClassesRouter.__proto__ || Object.getPrototypeOf(ClassesRouter)).apply(this, arguments));
  }

  _createClass(ClassesRouter, [{
    key: 'handleFind',
    value: function handleFind(req) {
      var body = Object.assign(req.body, ClassesRouter.JSONFromQuery(req.query));
      var options = {};
      var allowConstraints = ['skip', 'limit', 'order', 'count', 'keys', 'include', 'redirectClassNameForKey', 'where'];

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = Object.keys(body)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var key = _step.value;

          if (allowConstraints.indexOf(key) === -1) {
            throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Invalid parameter for query: ' + key);
          }
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

      if (body.skip) {
        options.skip = Number(body.skip);
      }
      if (body.limit || body.limit === 0) {
        options.limit = Number(body.limit);
      } else {
        options.limit = Number(100);
      }
      if (body.order) {
        options.order = String(body.order);
      }
      if (body.count) {
        options.count = true;
      }
      if (typeof body.keys == 'string') {
        options.keys = body.keys;
      }
      if (body.include) {
        options.include = String(body.include);
      }
      if (body.redirectClassNameForKey) {
        options.redirectClassNameForKey = String(body.redirectClassNameForKey);
      }
      if (typeof body.where === 'string') {
        body.where = JSON.parse(body.where);
      }
      return _rest2.default.find(req.config, req.auth, req.params.className, body.where, options, req.info.clientSDK).then(function (response) {
        if (response && response.results) {
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = response.results[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              var result = _step2.value;

              if (result.sessionToken) {
                result.sessionToken = req.info.sessionToken || result.sessionToken;
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
        return { response: response };
      });
    }

    // Returns a promise for a {response} object.

  }, {
    key: 'handleGet',
    value: function handleGet(req) {
      var body = Object.assign(req.body, ClassesRouter.JSONFromQuery(req.query));
      var options = {};

      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = Object.keys(body)[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var key = _step3.value;

          if (ALLOWED_GET_QUERY_KEYS.indexOf(key) === -1) {
            throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Improper encode of parameter');
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

      if (typeof body.keys == 'string') {
        options.keys = body.keys;
      }
      if (body.include) {
        options.include = String(body.include);
      }

      return _rest2.default.get(req.config, req.auth, req.params.className, req.params.objectId, options, req.info.clientSDK).then(function (response) {
        if (!response.results || response.results.length == 0) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }

        if (req.params.className === "_User") {

          delete response.results[0].sessionToken;

          var user = response.results[0];

          if (req.auth.user && user.objectId == req.auth.user.id) {
            // Force the session token
            response.results[0].sessionToken = req.info.sessionToken;
          }
        }
        return { response: response.results[0] };
      });
    }
  }, {
    key: 'handleCreate',
    value: function handleCreate(req) {
      return _rest2.default.create(req.config, req.auth, req.params.className, req.body, req.info.clientSDK);
    }
  }, {
    key: 'handleUpdate',
    value: function handleUpdate(req) {
      return _rest2.default.update(req.config, req.auth, req.params.className, req.params.objectId, req.body, req.info.clientSDK);
    }
  }, {
    key: 'handleDelete',
    value: function handleDelete(req) {
      return _rest2.default.del(req.config, req.auth, req.params.className, req.params.objectId, req.info.clientSDK).then(function () {
        return { response: {} };
      });
    }
  }, {
    key: 'mountRoutes',
    value: function mountRoutes() {
      var _this2 = this;

      this.route('GET', '/classes/:className', function (req) {
        return _this2.handleFind(req);
      });
      this.route('GET', '/classes/:className/:objectId', function (req) {
        return _this2.handleGet(req);
      });
      this.route('POST', '/classes/:className', function (req) {
        return _this2.handleCreate(req);
      });
      this.route('PUT', '/classes/:className/:objectId', function (req) {
        return _this2.handleUpdate(req);
      });
      this.route('DELETE', '/classes/:className/:objectId', function (req) {
        return _this2.handleDelete(req);
      });
    }
  }], [{
    key: 'JSONFromQuery',
    value: function JSONFromQuery(query) {
      var json = {};
      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = _lodash2.default.entries(query)[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var _step4$value = _slicedToArray(_step4.value, 2);

          var key = _step4$value[0];
          var value = _step4$value[1];

          try {
            json[key] = JSON.parse(value);
          } catch (e) {
            json[key] = value;
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

      return json;
    }
  }]);

  return ClassesRouter;
}(_PromiseRouter3.default);

exports.default = ClassesRouter;