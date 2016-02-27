import PromiseRouter from '../PromiseRouter';
import UserController from '../Controllers/UserController';
import Config from '../Config';
import express from 'express';
import path from 'path';
import fs from 'fs';

let public_html = path.resolve(__dirname, "../../public_html");
let views = path.resolve(__dirname, '../../views');

export class PublicAPIRouter extends PromiseRouter {
  
  verifyEmail(req) {
    var token = req.query.token;
    var username = req.query.username;
    var appId = req.params.appId;
    var config = new Config(appId);
    
    if (!token || !username) {
      return this.invalidLink(req);
    }

    let userController = config.userController;
    return userController.verifyEmail(username, token, appId).then( () => {
      return Promise.resolve({
        status: 302,
        location: `${config.verifyEmailSuccessURL}?username=${username}`
      });
    }, ()=> {
      return this.invalidLink(req);
    })
  }
  
  changePassword(req) {
    return new Promise((resolve, reject) => {
      var config = new Config(req.params.appId);
      // Should we keep the file in memory or leave like that?
      fs.readFile(path.resolve(views, "choose_password"), 'utf-8', (err, data) => {
        if (err) {
          return reject(err);
        }
        data = data.replace("PARSE_SERVER_URL", `'${config.serverURL}'`);
        resolve({
          text: data
        })
      });
    });
  }
  
  resetPassword(req) {
    var { username, token } = req.params;
    
    if (!username || !token) {
      return this.invalidLink(req);
    }
    
    let config = req.config;
    return config.userController.checkResetTokenValidity(username, token).then( () => {
      return Promise.resolve({
        status: 302,
        location: `${config.choosePasswordURL}?token=${token}&id=${config.applicationId}&username=${username}`
      })
    }, () => {
      return this.invalidLink(req);
    })
  }

  invalidLink(req) {
    return Promise.resolve({
        status: 302,
        location: req.config.invalidLinkURL
    });
  }
  
  setConfig(req) {
    req.config = new Config(req.params.appId);
    return Promise.resolve();
  }
  
  mountRoutes() {
    this.route('GET','/apps/:appId/verify_email', this.setConfig, req => { return this.verifyEmail(req); });
    this.route('GET','/apps/choose_password', req => { return this.changePassword(req); });
    this.route('GET','/apps/:appId/request_password_reset', this.setConfig, req => { return this.resetPassword(req); });
  }
  
  expressApp() {
    var router = express();
    router.use("/apps", express.static(public_html));
    router.use(super.expressApp());
    return router;
  }
}

export default PublicAPIRouter;
