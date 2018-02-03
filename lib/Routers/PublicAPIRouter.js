'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PublicAPIRouter = undefined;

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

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

const public_html = _path2.default.resolve(__dirname, "../../public_html");
const views = _path2.default.resolve(__dirname, '../../views');

class PublicAPIRouter extends _PromiseRouter2.default {

  verifyEmail(req) {
    const { token, username } = req.query;
    const appId = req.params.appId;
    const config = _Config2.default.get(appId);

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    if (!token || !username) {
      return this.invalidLink(req);
    }

    const userController = config.userController;
    return userController.verifyEmail(username, token).then(() => {
      const params = _querystring2.default.stringify({ username });
      return Promise.resolve({
        status: 302,
        location: `${config.verifyEmailSuccessURL}?${params}`
      });
    }, () => {
      return this.invalidVerificationLink(req);
    });
  }

  resendVerificationEmail(req) {
    const username = req.body.username;
    const appId = req.params.appId;
    const config = _Config2.default.get(appId);

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    if (!username) {
      return this.invalidLink(req);
    }

    const userController = config.userController;

    return userController.resendVerificationEmail(username).then(() => {
      return Promise.resolve({
        status: 302,
        location: `${config.linkSendSuccessURL}`
      });
    }, () => {
      return Promise.resolve({
        status: 302,
        location: `${config.linkSendFailURL}`
      });
    });
  }

  changePassword(req) {
    return new Promise((resolve, reject) => {
      const config = _Config2.default.get(req.query.id);

      if (!config) {
        this.invalidRequest();
      }

      if (!config.publicServerURL) {
        return resolve({
          status: 404,
          text: 'Not found.'
        });
      }
      // Should we keep the file in memory or leave like that?
      _fs2.default.readFile(_path2.default.resolve(views, "choose_password"), 'utf-8', (err, data) => {
        if (err) {
          return reject(err);
        }
        data = data.replace("PARSE_SERVER_URL", `'${config.publicServerURL}'`);
        resolve({
          text: data
        });
      });
    });
  }

  requestResetPassword(req) {

    const config = req.config;

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    const { username, token } = req.query;

    if (!username || !token) {
      return this.invalidLink(req);
    }

    return config.userController.checkResetTokenValidity(username, token).then(() => {
      const params = _querystring2.default.stringify({ token, id: config.applicationId, username, app: config.appName });
      return Promise.resolve({
        status: 302,
        location: `${config.choosePasswordURL}?${params}`
      });
    }, () => {
      return this.invalidLink(req);
    });
  }

  resetPassword(req) {

    const config = req.config;

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    const {
      username,
      token,
      new_password
    } = req.body;

    if (!username || !token || !new_password) {
      return this.invalidLink(req);
    }

    return config.userController.updatePassword(username, token, new_password).then(() => {
      const params = _querystring2.default.stringify({ username: username });
      return Promise.resolve({
        status: 302,
        location: `${config.passwordResetSuccessURL}?${params}`
      });
    }, err => {
      const params = _querystring2.default.stringify({ username: username, token: token, id: config.applicationId, error: err, app: config.appName });
      return Promise.resolve({
        status: 302,
        location: `${config.choosePasswordURL}?${params}`
      });
    });
  }

  invalidLink(req) {
    return Promise.resolve({
      status: 302,
      location: req.config.invalidLinkURL
    });
  }

  invalidVerificationLink(req) {
    const config = req.config;
    if (req.query.username && req.params.appId) {
      const params = _querystring2.default.stringify({ username: req.query.username, appId: req.params.appId });
      return Promise.resolve({
        status: 302,
        location: `${config.invalidVerificationLinkURL}?${params}`
      });
    } else {
      return this.invalidLink(req);
    }
  }

  missingPublicServerURL() {
    return Promise.resolve({
      text: 'Not found.',
      status: 404
    });
  }

  invalidRequest() {
    const error = new Error();
    error.status = 403;
    error.message = "unauthorized";
    throw error;
  }

  setConfig(req) {
    req.config = _Config2.default.get(req.params.appId);
    return Promise.resolve();
  }

  mountRoutes() {
    this.route('GET', '/apps/:appId/verify_email', req => {
      this.setConfig(req);
    }, req => {
      return this.verifyEmail(req);
    });

    this.route('POST', '/apps/:appId/resend_verification_email', req => {
      this.setConfig(req);
    }, req => {
      return this.resendVerificationEmail(req);
    });

    this.route('GET', '/apps/choose_password', req => {
      return this.changePassword(req);
    });

    this.route('POST', '/apps/:appId/request_password_reset', req => {
      this.setConfig(req);
    }, req => {
      return this.resetPassword(req);
    });

    this.route('GET', '/apps/:appId/request_password_reset', req => {
      this.setConfig(req);
    }, req => {
      return this.requestResetPassword(req);
    });
  }

  expressRouter() {
    const router = _express2.default.Router();
    router.use("/apps", _express2.default.static(public_html));
    router.use("/", super.expressRouter());
    return router;
  }
}

exports.PublicAPIRouter = PublicAPIRouter;
exports.default = PublicAPIRouter;