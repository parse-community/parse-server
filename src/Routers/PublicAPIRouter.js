import PromiseRouter from '../PromiseRouter';
import Config from '../Config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import qs from 'querystring';
import { Parse } from 'parse/node';
import Deprecator from '../Deprecator/Deprecator';

const public_html = path.resolve(__dirname, '../../public_html');
const views = path.resolve(__dirname, '../../views');

export class PublicAPIRouter extends PromiseRouter {
  constructor() {
    super();
    Deprecator.logRuntimeDeprecation({
      usage: 'PublicAPIRouter',
      solution: 'pages.enableRouter'
    });
  }
  verifyEmail(req) {
    const { token: rawToken } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    const appId = req.params.appId;
    const config = Config.get(appId);

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    if (!token) {
      return this.invalidLink(req);
    }

    const userController = config.userController;
    return userController.verifyEmail(token).then(
      () => {
        return Promise.resolve({
          status: 302,
          location: `${config.verifyEmailSuccessURL}`,
        });
      },
      () => {
        return this.invalidVerificationLink(req, token);
      }
    );
  }

  resendVerificationEmail(req) {
    const username = req.body?.username;
    const appId = req.params.appId;
    const config = Config.get(appId);

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    const token = req.body.token;

    if (!username && !token) {
      return this.invalidLink(req);
    }

    const userController = config.userController;

    return userController.resendVerificationEmail(username, req, token).then(
      () => {
        return Promise.resolve({
          status: 302,
          location: `${config.linkSendSuccessURL}`,
        });
      },
      () => {
        return Promise.resolve({
          status: 302,
          location: `${config.linkSendFailURL}`,
        });
      }
    );
  }

  changePassword(req) {
    return new Promise((resolve, reject) => {
      const config = Config.get(req.query.id);

      if (!config) {
        this.invalidRequest();
      }

      if (!config.publicServerURL) {
        return resolve({
          status: 404,
          text: 'Not found.',
        });
      }
      // Should we keep the file in memory or leave like that?
      fs.readFile(path.resolve(views, 'choose_password'), 'utf-8', (err, data) => {
        if (err) {
          return reject(err);
        }
        data = data.replace('PARSE_SERVER_URL', `'${config.publicServerURL}'`);
        resolve({
          text: data,
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

    const { token: rawToken } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if (!token) {
      return this.invalidLink(req);
    }

    return config.userController.checkResetTokenValidity(token).then(
      () => {
        const params = qs.stringify({
          token,
          id: config.applicationId,
          app: config.appName,
        });
        return Promise.resolve({
          status: 302,
          location: `${config.choosePasswordURL}?${params}`,
        });
      },
      () => {
        return this.invalidLink(req);
      }
    );
  }

  resetPassword(req) {
    const config = req.config;

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    const { new_password, token: rawToken } = req.body || {};
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if ((!token || !new_password) && req.xhr === false) {
      return this.invalidLink(req);
    }

    if (!token) {
      throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'Missing token');
    }

    if (!new_password) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'Missing password');
    }

    return config.userController
      .updatePassword(token, new_password)
      .then(
        () => {
          return Promise.resolve({
            success: true,
          });
        },
        err => {
          return Promise.resolve({
            success: false,
            err,
          });
        }
      )
      .then(result => {
        const queryString = {
          token: token,
          id: config.applicationId,
          error: result.err,
          app: config.appName,
        };

        if (result?.err === 'The password reset link has expired') {
          delete queryString.token;
          queryString.token = token;
        }
        const params = qs.stringify(queryString);

        if (req.xhr) {
          if (result.success) {
            return Promise.resolve({
              status: 200,
              response: 'Password successfully reset',
            });
          }
          if (result.err) {
            throw new Parse.Error(Parse.Error.OTHER_CAUSE, `${result.err}`);
          }
        }

        const location = result.success
          ? `${config.passwordResetSuccessURL}`
          : `${config.choosePasswordURL}?${params}`;

        return Promise.resolve({
          status: 302,
          location,
        });
      });
  }

  invalidLink(req) {
    return Promise.resolve({
      status: 302,
      location: req.config.invalidLinkURL,
    });
  }

  invalidVerificationLink(req, token) {
    const config = req.config;
    if (req.params.appId) {
      const params = qs.stringify({
        appId: req.params.appId,
        token,
      });
      return Promise.resolve({
        status: 302,
        location: `${config.invalidVerificationLinkURL}?${params}`,
      });
    } else {
      return this.invalidLink(req);
    }
  }

  missingPublicServerURL() {
    return Promise.resolve({
      text: 'Not found.',
      status: 404,
    });
  }

  invalidRequest() {
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized';
    throw error;
  }

  setConfig(req) {
    req.config = Config.get(req.params.appId);
    return Promise.resolve();
  }

  mountRoutes() {
    this.route(
      'GET',
      '/apps/:appId/verify_email',
      req => {
        this.setConfig(req);
      },
      req => {
        return this.verifyEmail(req);
      }
    );

    this.route(
      'POST',
      '/apps/:appId/resend_verification_email',
      req => {
        this.setConfig(req);
      },
      req => {
        return this.resendVerificationEmail(req);
      }
    );

    this.route('GET', '/apps/choose_password', req => {
      return this.changePassword(req);
    });

    this.route(
      'POST',
      '/apps/:appId/request_password_reset',
      req => {
        this.setConfig(req);
      },
      req => {
        return this.resetPassword(req);
      }
    );

    this.route(
      'GET',
      '/apps/:appId/request_password_reset',
      req => {
        this.setConfig(req);
      },
      req => {
        return this.requestResetPassword(req);
      }
    );
  }

  expressRouter() {
    const router = express.Router();
    router.use('/apps', express.static(public_html));
    router.use('/', super.expressRouter());
    return router;
  }
}

export default PublicAPIRouter;
