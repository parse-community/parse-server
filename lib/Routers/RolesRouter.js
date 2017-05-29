'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RolesRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ClassesRouter2 = require('./ClassesRouter');

var _ClassesRouter3 = _interopRequireDefault(_ClassesRouter2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var RolesRouter = exports.RolesRouter = function (_ClassesRouter) {
  _inherits(RolesRouter, _ClassesRouter);

  function RolesRouter() {
    _classCallCheck(this, RolesRouter);

    return _possibleConstructorReturn(this, (RolesRouter.__proto__ || Object.getPrototypeOf(RolesRouter)).apply(this, arguments));
  }

  _createClass(RolesRouter, [{
    key: 'handleFind',
    value: function handleFind(req) {
      req.params.className = '_Role';
      return _get(RolesRouter.prototype.__proto__ || Object.getPrototypeOf(RolesRouter.prototype), 'handleFind', this).call(this, req);
    }
  }, {
    key: 'handleGet',
    value: function handleGet(req) {
      req.params.className = '_Role';
      return _get(RolesRouter.prototype.__proto__ || Object.getPrototypeOf(RolesRouter.prototype), 'handleGet', this).call(this, req);
    }
  }, {
    key: 'handleCreate',
    value: function handleCreate(req) {
      req.params.className = '_Role';
      return _get(RolesRouter.prototype.__proto__ || Object.getPrototypeOf(RolesRouter.prototype), 'handleCreate', this).call(this, req);
    }
  }, {
    key: 'handleUpdate',
    value: function handleUpdate(req) {
      req.params.className = '_Role';
      return _get(RolesRouter.prototype.__proto__ || Object.getPrototypeOf(RolesRouter.prototype), 'handleUpdate', this).call(this, req);
    }
  }, {
    key: 'handleDelete',
    value: function handleDelete(req) {
      req.params.className = '_Role';
      return _get(RolesRouter.prototype.__proto__ || Object.getPrototypeOf(RolesRouter.prototype), 'handleDelete', this).call(this, req);
    }
  }, {
    key: 'mountRoutes',
    value: function mountRoutes() {
      var _this2 = this;

      this.route('GET', '/roles', function (req) {
        return _this2.handleFind(req);
      });
      this.route('GET', '/roles/:objectId', function (req) {
        return _this2.handleGet(req);
      });
      this.route('POST', '/roles', function (req) {
        return _this2.handleCreate(req);
      });
      this.route('PUT', '/roles/:objectId', function (req) {
        return _this2.handleUpdate(req);
      });
      this.route('DELETE', '/roles/:objectId', function (req) {
        return _this2.handleDelete(req);
      });
    }
  }]);

  return RolesRouter;
}(_ClassesRouter3.default);

exports.default = RolesRouter;