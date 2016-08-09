import PromiseRouter from '../PromiseRouter';
import UserController from '../Controllers/UserController';
import Config from '../Config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import qs from 'querystring';

let public_html = path.resolve(__dirname, "../../public_html");
let views = path.resolve(__dirname, '../../views');

export class PublicAPIRouter extends PromiseRouter {

  verifyEmail(req) {
    let { token, username }= req.query;
    let appId = req.params.appId;
    let config = new Config(appId);

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    if (!token || !username) {
      return this.invalidLink(req);
    }

    let userController = config.userController;
    return userController.verifyEmail(username, token).then( () => {
      let params = qs.stringify({username});
      return Promise.resolve({
        status: 302,
        location: `${config.verifyEmailSuccessURL}?${params}`
      });
    }, ()=> {
      return this.invalidLink(req);
    })
  }

  changePassword(req) {
    return new Promise((resolve, reject) => {
      let config = new Config(req.query.id);
      if (!config.publicServerURL) {
        return resolve({
          status: 404,
          text: 'Not found.'
        });
      }
      // Should we keep the file in memory or leave like that?
      fs.readFile(path.resolve(views, "choose_password"), 'utf-8', (err, data) => {
        if (err) {
          return reject(err);
        }
        data = data.replace("PARSE_SERVER_URL", `'${config.publicServerURL}'`);
        resolve({
          text: data
        })
      });
    });
  }

  requestResetPassword(req) {

    let config = req.config;

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    let { username, token } = req.query;

    if (!username || !token) {
      return this.invalidLink(req);
    }

    return config.userController.checkResetTokenValidity(username, token).then( (user) => {
      let params = qs.stringify({token, id: config.applicationId, username, app: config.appName, });
      return Promise.resolve({
        status: 302,
        location: `${config.choosePasswordURL}?${params}`
      })
    }, () => {
      return this.invalidLink(req);
    })
  }

  resetPassword(req) {

    let config = req.config;

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    let {
      username,
      token,
      new_password
    } = req.body;

    if (!username || !token || !new_password) {
      return this.invalidLink(req);
    }

    return config.userController.updatePassword(username, token, new_password).then((result) => {
      return Promise.resolve({
        status: 302,
        location: config.passwordResetSuccessURL
      });
    }, (err) => {
      let params = qs.stringify({username: username, token: token, id: config.applicationId, error:err, app:config.appName})
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

  missingPublicServerURL() {
    return Promise.resolve({
      text:  'Not found.',
      status: 404
    });
  }

  setConfig(req) {
    req.config = new Config(req.params.appId);
    return Promise.resolve();
  }

  mountRoutes() {
    this.route('GET','/apps/:appId/verify_email',
      req => { this.setConfig(req) },
      req => { return this.verifyEmail(req); });

    this.route('GET','/apps/choose_password',
      req => { return this.changePassword(req); });

    this.route('POST','/apps/:appId/request_password_reset',
      req => { this.setConfig(req) },
      req => { return this.resetPassword(req); });

    this.route('GET','/apps/:appId/request_password_reset',
      req => { this.setConfig(req) },
      req => { return this.requestResetPassword(req); });
  }

  expressRouter() {
    let router = express.Router();
    router.use("/apps", express.static(public_html));
    router.use("/", super.expressRouter());
    return router;
  }
}

export default PublicAPIRouter;
