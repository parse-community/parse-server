'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SessionsRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ClassesRouter2 = require('./ClassesRouter');

var _ClassesRouter3 = _interopRequireDefault(_ClassesRouter2);

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _Auth = require('../Auth');

var _Auth2 = _interopRequireDefault(_Auth);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var SessionsRouter = exports.SessionsRouter = function (_ClassesRouter) {
  _inherits(SessionsRouter, _ClassesRouter);

  function SessionsRouter() {
    _classCallCheck(this, SessionsRouter);

    return _possibleConstructorReturn(this, Object.getPrototypeOf(SessionsRouter).apply(this, arguments));
  }

  _createClass(SessionsRouter, [{
    key: 'handleFind',
    value: function handleFind(req) {
      req.params.className = '_Session';
      return _get(Object.getPrototypeOf(SessionsRouter.prototype), 'handleFind', this).call(this, req);
    }
  }, {
    key: 'handleGet',
    value: function handleGet(req) {
      req.params.className = '_Session';
      return _get(Object.getPrototypeOf(SessionsRouter.prototype), 'handleGet', this).call(this, req);
    }
  }, {
    key: 'handleCreate',
    value: function handleCreate(req) {
      req.params.className = '_Session';
      return _get(Object.getPrototypeOf(SessionsRouter.prototype), 'handleCreate', this).call(this, req);
    }
  }, {
    key: 'handleUpdate',
    value: function handleUpdate(req) {
      req.params.className = '_Session';
      return _get(Object.getPrototypeOf(SessionsRouter.prototype), 'handleUpdate', this).call(this, req);
    }
  }, {
    key: 'handleDelete',
    value: function handleDelete(req) {
      req.params.className = '_Session';
      return _get(Object.getPrototypeOf(SessionsRouter.prototype), 'handleDelete', this).call(this, req);
    }
  }, {
    key: 'handleMe',
    value: function handleMe(req) {
      // TODO: Verify correct behavior
      if (!req.info || !req.info.sessionToken) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
      }
      return _rest2.default.find(req.config, _Auth2.default.master(req.config), '_Session', { sessionToken: req.info.sessionToken }, undefined, req.info.clientSDK).then(function (response) {
        if (!response.results || response.results.length == 0) {
          throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token not found.');
        }
        return {
          response: response.results[0]
        };
      });
    }
  }, {
    key: 'mountRoutes',
    value: function mountRoutes() {
      var _this2 = this;

      this.route('GET', '/sessions/me', function (req) {
        return _this2.handleMe(req);
      });
      this.route('GET', '/sessions', function (req) {
        return _this2.handleFind(req);
      });
      this.route('GET', '/sessions/:objectId', function (req) {
        return _this2.handleGet(req);
      });
      this.route('POST', '/sessions', function (req) {
        return _this2.handleCreate(req);
      });
      this.route('PUT', '/sessions/:objectId', function (req) {
        return _this2.handleUpdate(req);
      });
      this.route('DELETE', '/sessions/:objectId', function (req) {
        return _this2.handleDelete(req);
      });
    }
  }]);

  return SessionsRouter;
}(_ClassesRouter3.default);

exports.default = SessionsRouter;