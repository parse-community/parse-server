'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PublicAPIRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _PromiseRouter2 = require('../PromiseRouter');

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

var _Config = require('../Config');

var _Config2 = _interopRequireDefault(_Config);

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _querystring = require('querystring');

var _querystring2 = _interopRequireDefault(_querystring);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var public_html = _path2.default.resolve(__dirname, "../../public_html");
var views = _path2.default.resolve(__dirname, '../../views');

var PublicAPIRouter = exports.PublicAPIRouter = function (_PromiseRouter) {
  _inherits(PublicAPIRouter, _PromiseRouter);

  function PublicAPIRouter() {
    _classCallCheck(this, PublicAPIRouter);

    return _possibleConstructorReturn(this, (PublicAPIRouter.__proto__ || Object.getPrototypeOf(PublicAPIRouter)).apply(this, arguments));
  }

  _createClass(PublicAPIRouter, [{
    key: 'verifyEmail',
    value: function verifyEmail(req) {
      var _this2 = this;

      var _req$query = req.query,
          token = _req$query.token,
          username = _req$query.username;

      var appId = req.params.appId;
      var config = new _Config2.default(appId);

      if (!config.publicServerURL) {
        return this.missingPublicServerURL();
      }

      if (!token || !username) {
        return this.invalidLink(req);
      }

      var userController = config.userController;
      return userController.verifyEmail(username, token).then(function () {
        var params = _querystring2.default.stringify({ username: username });
        return Promise.resolve({
          status: 302,
          location: config.verifyEmailSuccessURL + '?' + params
        });
      }, function () {
        return _this2.invalidVerificationLink(req);
      });
    }
  }, {
    key: 'resendVerificationEmail',
    value: function resendVerificationEmail(req) {
      var username = req.body.username;
      var appId = req.params.appId;
      var config = new _Config2.default(appId);

      if (!config.publicServerURL) {
        return this.missingPublicServerURL();
      }

      if (!username) {
        return this.invalidLink(req);
      }

      var userController = config.userController;

      return userController.resendVerificationEmail(username).then(function () {
        return Promise.resolve({
          status: 302,
          location: '' + config.linkSendSuccessURL
        });
      }, function () {
        return Promise.resolve({
          status: 302,
          location: '' + config.linkSendFailURL
        });
      });
    }
  }, {
    key: 'changePassword',
    value: function changePassword(req) {
      return new Promise(function (resolve, reject) {
        var config = new _Config2.default(req.query.id);
        if (!config.publicServerURL) {
          return resolve({
            status: 404,
            text: 'Not found.'
          });
        }
        // Should we keep the file in memory or leave like that?
        _fs2.default.readFile(_path2.default.resolve(views, "choose_password"), 'utf-8', function (err, data) {
          if (err) {
            return reject(err);
          }
          data = data.replace("PARSE_SERVER_URL", '\'' + config.publicServerURL + '\'');
          resolve({
            text: data
          });
        });
      });
    }
  }, {
    key: 'requestResetPassword',
    value: function requestResetPassword(req) {
      var _this3 = this;

      var config = req.config;

      if (!config.publicServerURL) {
        return this.missingPublicServerURL();
      }

      var _req$query2 = req.query,
          username = _req$query2.username,
          token = _req$query2.token;


      if (!username || !token) {
        return this.invalidLink(req);
      }

      return config.userController.checkResetTokenValidity(username, token).then(function () {
        var params = _querystring2.default.stringify({ token: token, id: config.applicationId, username: username, app: config.appName });
        return Promise.resolve({
          status: 302,
          location: config.choosePasswordURL + '?' + params
        });
      }, function () {
        return _this3.invalidLink(req);
      });
    }
  }, {
    key: 'resetPassword',
    value: function resetPassword(req) {

      var config = req.config;

      if (!config.publicServerURL) {
        return this.missingPublicServerURL();
      }

      var _req$body = req.body,
          username = _req$body.username,
          token = _req$body.token,
          new_password = _req$body.new_password;


      if (!username || !token || !new_password) {
        return this.invalidLink(req);
      }

      return config.userController.updatePassword(username, token, new_password).then(function () {
        var params = _querystring2.default.stringify({ username: username });
        return Promise.resolve({
          status: 302,
          location: config.passwordResetSuccessURL + '?' + params
        });
      }, function (err) {
        var params = _querystring2.default.stringify({ username: username, token: token, id: config.applicationId, error: err, app: config.appName });
        return Promise.resolve({
          status: 302,
          location: config.choosePasswordURL + '?' + params
        });
      });
    }
  }, {
    key: 'invalidLink',
    value: function invalidLink(req) {
      return Promise.resolve({
        status: 302,
        location: req.config.invalidLinkURL
      });
    }
  }, {
    key: 'invalidVerificationLink',
    value: function invalidVerificationLink(req) {
      var config = req.config;
      if (req.query.username && req.params.appId) {
        var params = _querystring2.default.stringify({ username: req.query.username, appId: req.params.appId });
        return Promise.resolve({
          status: 302,
          location: config.invalidVerificationLinkURL + '?' + params
        });
      } else {
        return this.invalidLink(req);
      }
    }
  }, {
    key: 'missingPublicServerURL',
    value: function missingPublicServerURL() {
      return Promise.resolve({
        text: 'Not found.',
        status: 404
      });
    }
  }, {
    key: 'setConfig',
    value: function setConfig(req) {
      req.config = new _Config2.default(req.params.appId);
      return Promise.resolve();
    }
  }, {
    key: 'mountRoutes',
    value: function mountRoutes() {
      var _this4 = this;

      this.route('GET', '/apps/:appId/verify_email', function (req) {
        _this4.setConfig(req);
      }, function (req) {
        return _this4.verifyEmail(req);
      });

      this.route('POST', '/apps/:appId/resend_verification_email', function (req) {
        _this4.setConfig(req);
      }, function (req) {
        return _this4.resendVerificationEmail(req);
      });

      this.route('GET', '/apps/choose_password', function (req) {
        return _this4.changePassword(req);
      });

      this.route('POST', '/apps/:appId/request_password_reset', function (req) {
        _this4.setConfig(req);
      }, function (req) {
        return _this4.resetPassword(req);
      });

      this.route('GET', '/apps/:appId/request_password_reset', function (req) {
        _this4.setConfig(req);
      }, function (req) {
        return _this4.requestResetPassword(req);
      });
    }
  }, {
    key: 'expressRouter',
    value: function expressRouter() {
      var router = _express2.default.Router();
      router.use("/apps", _express2.default.static(public_html));
      router.use("/", _get(PublicAPIRouter.prototype.__proto__ || Object.getPrototypeOf(PublicAPIRouter.prototype), 'expressRouter', this).call(this));
      return router;
    }
  }]);

  return PublicAPIRouter;
}(_PromiseRouter3.default);

exports.default = PublicAPIRouter;