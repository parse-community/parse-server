import PromiseRouter from '../PromiseRouter';
import UserController from '../Controllers/UserController';
import Config from '../Config';
import express from 'express';
import path from 'path';

export class PublicAPIRouter extends PromiseRouter {
  
  verifyEmail(req) {
    var token = req.query.token;
    var username = req.query.username;
    var appId = req.params.appId;
    var config = new Config(appId);
    
    if (!token || !username) {
      return Promise.resolve({
        status: 302,
        location: config.invalidLinkURL
      });
    }

    let userController = new UserController(appId);
    return userController.verifyEmail(username, token, appId).then( () => {
      return Promise.resolve({
        status: 302,
        location: `${config.verifyEmailSuccessURL}?username=${username}`
      });
    }, ()=> {
      return Promise.resolve({
        status: 302,
        location: config.invalidLinkURL
      });
    })
  }
  
  mountRoutes() {
    this.route('GET','/apps/:appId/verify_email', req => { return this.verifyEmail(req); });
  }
  
  expressApp() {
    var router = express();
    router.use("/apps", express.static(path.resolve(__dirname, "../../public")));
    router.use(super.expressApp());
    return router;
  }
}

export default PublicAPIRouter;
