'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.HooksRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _node = require('parse/node');

var _PromiseRouter2 = require('../PromiseRouter');

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

var _middlewares = require('../middlewares');

var middleware = _interopRequireWildcard(_middlewares);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var HooksRouter = exports.HooksRouter = function (_PromiseRouter) {
  _inherits(HooksRouter, _PromiseRouter);

  function HooksRouter() {
    _classCallCheck(this, HooksRouter);

    return _possibleConstructorReturn(this, Object.getPrototypeOf(HooksRouter).apply(this, arguments));
  }

  _createClass(HooksRouter, [{
    key: 'createHook',
    value: function createHook(aHook, config) {
      return config.hooksController.createHook(aHook).then(function (hook) {
        return { response: hook };
      });
    }
  }, {
    key: 'updateHook',
    value: function updateHook(aHook, config) {
      return config.hooksController.updateHook(aHook).then(function (hook) {
        return { response: hook };
      });
    }
  }, {
    key: 'handlePost',
    value: function handlePost(req) {
      return this.createHook(req.body, req.config);
    }
  }, {
    key: 'handleGetFunctions',
    value: function handleGetFunctions(req) {
      var hooksController = req.config.hooksController;
      if (req.params.functionName) {
        return hooksController.getFunction(req.params.functionName).then(function (foundFunction) {
          if (!foundFunction) {
            throw new _node.Parse.Error(143, 'no function named: ' + req.params.functionName + ' is defined');
          }
          return Promise.resolve({ response: foundFunction });
        });
      }

      return hooksController.getFunctions().then(function (functions) {
        return { response: functions || [] };
      }, function (err) {
        throw err;
      });
    }
  }, {
    key: 'handleGetTriggers',
    value: function handleGetTriggers(req) {
      var hooksController = req.config.hooksController;
      if (req.params.className && req.params.triggerName) {

        return hooksController.getTrigger(req.params.className, req.params.triggerName).then(function (foundTrigger) {
          if (!foundTrigger) {
            throw new _node.Parse.Error(143, 'class ' + req.params.className + ' does not exist');
          }
          return Promise.resolve({ response: foundTrigger });
        });
      }

      return hooksController.getTriggers().then(function (triggers) {
        return { response: triggers || [] };
      });
    }
  }, {
    key: 'handleDelete',
    value: function handleDelete(req) {
      var hooksController = req.config.hooksController;
      if (req.params.functionName) {
        return hooksController.deleteFunction(req.params.functionName).then(function () {
          return { response: {} };
        });
      } else if (req.params.className && req.params.triggerName) {
        return hooksController.deleteTrigger(req.params.className, req.params.triggerName).then(function () {
          return { response: {} };
        });
      }
      return Promise.resolve({ response: {} });
    }
  }, {
    key: 'handleUpdate',
    value: function handleUpdate(req) {
      var hook;
      if (req.params.functionName && req.body.url) {
        hook = {};
        hook.functionName = req.params.functionName;
        hook.url = req.body.url;
      } else if (req.params.className && req.params.triggerName && req.body.url) {
        hook = {};
        hook.className = req.params.className;
        hook.triggerName = req.params.triggerName;
        hook.url = req.body.url;
      } else {
        throw new _node.Parse.Error(143, "invalid hook declaration");
      }
      return this.updateHook(hook, req.config);
    }
  }, {
    key: 'handlePut',
    value: function handlePut(req) {
      var body = req.body;
      if (body.__op == "Delete") {
        return this.handleDelete(req);
      } else {
        return this.handleUpdate(req);
      }
    }
  }, {
    key: 'mountRoutes',
    value: function mountRoutes() {
      this.route('GET', '/hooks/functions', middleware.promiseEnforceMasterKeyAccess, this.handleGetFunctions.bind(this));
      this.route('GET', '/hooks/triggers', middleware.promiseEnforceMasterKeyAccess, this.handleGetTriggers.bind(this));
      this.route('GET', '/hooks/functions/:functionName', middleware.promiseEnforceMasterKeyAccess, this.handleGetFunctions.bind(this));
      this.route('GET', '/hooks/triggers/:className/:triggerName', middleware.promiseEnforceMasterKeyAccess, this.handleGetTriggers.bind(this));
      this.route('POST', '/hooks/functions', middleware.promiseEnforceMasterKeyAccess, this.handlePost.bind(this));
      this.route('POST', '/hooks/triggers', middleware.promiseEnforceMasterKeyAccess, this.handlePost.bind(this));
      this.route('PUT', '/hooks/functions/:functionName', middleware.promiseEnforceMasterKeyAccess, this.handlePut.bind(this));
      this.route('PUT', '/hooks/triggers/:className/:triggerName', middleware.promiseEnforceMasterKeyAccess, this.handlePut.bind(this));
    }
  }]);

  return HooksRouter;
}(_PromiseRouter3.default);

exports.default = HooksRouter;