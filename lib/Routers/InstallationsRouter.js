'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.InstallationsRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ClassesRouter2 = require('./ClassesRouter');

var _ClassesRouter3 = _interopRequireDefault(_ClassesRouter2);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } // InstallationsRouter.js

var InstallationsRouter = exports.InstallationsRouter = function (_ClassesRouter) {
  _inherits(InstallationsRouter, _ClassesRouter);

  function InstallationsRouter() {
    _classCallCheck(this, InstallationsRouter);

    return _possibleConstructorReturn(this, (InstallationsRouter.__proto__ || Object.getPrototypeOf(InstallationsRouter)).apply(this, arguments));
  }

  _createClass(InstallationsRouter, [{
    key: 'handleFind',
    value: function handleFind(req) {
      var body = Object.assign(req.body, _ClassesRouter3.default.JSONFromQuery(req.query));
      var options = {};

      if (body.skip) {
        options.skip = Number(body.skip);
      }
      if (body.limit || body.limit === 0) {
        options.limit = Number(body.limit);
      }
      if (body.order) {
        options.order = String(body.order);
      }
      if (body.count) {
        options.count = true;
      }
      if (body.include) {
        options.include = String(body.include);
      }

      return _rest2.default.find(req.config, req.auth, '_Installation', body.where, options, req.info.clientSDK).then(function (response) {
        return { response: response };
      });
    }
  }, {
    key: 'handleGet',
    value: function handleGet(req) {
      req.params.className = '_Installation';
      return _get(InstallationsRouter.prototype.__proto__ || Object.getPrototypeOf(InstallationsRouter.prototype), 'handleGet', this).call(this, req);
    }
  }, {
    key: 'handleCreate',
    value: function handleCreate(req) {
      req.params.className = '_Installation';
      return _get(InstallationsRouter.prototype.__proto__ || Object.getPrototypeOf(InstallationsRouter.prototype), 'handleCreate', this).call(this, req);
    }
  }, {
    key: 'handleUpdate',
    value: function handleUpdate(req) {
      req.params.className = '_Installation';
      return _get(InstallationsRouter.prototype.__proto__ || Object.getPrototypeOf(InstallationsRouter.prototype), 'handleUpdate', this).call(this, req);
    }
  }, {
    key: 'handleDelete',
    value: function handleDelete(req) {
      req.params.className = '_Installation';
      return _get(InstallationsRouter.prototype.__proto__ || Object.getPrototypeOf(InstallationsRouter.prototype), 'handleDelete', this).call(this, req);
    }
  }, {
    key: 'mountRoutes',
    value: function mountRoutes() {
      var _this2 = this;

      this.route('GET', '/installations', function (req) {
        return _this2.handleFind(req);
      });
      this.route('GET', '/installations/:objectId', function (req) {
        return _this2.handleGet(req);
      });
      this.route('POST', '/installations', function (req) {
        return _this2.handleCreate(req);
      });
      this.route('PUT', '/installations/:objectId', function (req) {
        return _this2.handleUpdate(req);
      });
      this.route('DELETE', '/installations/:objectId', function (req) {
        return _this2.handleDelete(req);
      });
    }
  }]);

  return InstallationsRouter;
}(_ClassesRouter3.default);

exports.default = InstallationsRouter;