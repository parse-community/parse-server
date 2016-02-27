import { randomString } from '../cryptoUtils';
import { inflate } from '../triggers';
import AdaptableController from './AdaptableController';
import MailAdapter from '../Adapters/Email/MailAdapter';

var DatabaseAdapter = require('../DatabaseAdapter');
var RestWrite = require('../RestWrite');
var hash = require('../password').hash;
var Auth = require('../Auth');

export class UserController extends AdaptableController {

  constructor(adapter, appId, options = {}) {
    super(adapter, appId, options);
  }

  validateAdapter(adapter) {
    // Allow no adapter
    if (!adapter && !this.shouldVerifyEmails) {
      return;
    }
    super.validateAdapter(adapter);
  }
  
  expectedAdapterType() {
    return MailAdapter;
  }
  
  get shouldVerifyEmails() {
    return this.options.verifyUserEmails;
  }
  
  setEmailVerifyToken(user) {
    if (this.shouldVerifyEmails) {
      user._email_verify_token = randomString(25);
      user.emailVerified = false;
    }
  }
  
  
  verifyEmail(username, token) {
    
    return new Promise((resolve, reject) => {
      
      // Trying to verify email when not enabled
      if (!this.shouldVerifyEmails) {
        reject();
        return;
      }
      
      var database = this.config.database;
     
      database.collection('_User').then(coll => {
        // Need direct database access because verification token is not a parse field
        return coll.findAndModify({
          username: username,
          _email_verify_token: token,
        }, null, {$set: {emailVerified: true}}, (err, doc) => {
          if (err || !doc.value) {
            reject(err);
          } else {
            resolve(doc.value);
          }
        });
      });
       
    });    
  }
  
  checkResetTokenValidity(username, token) {
    return new Promise((resolve, reject) => {
      return this.config.database.collection('_User').then(coll => {
        return coll.findOne({
          username: username,
          _perishable_token: token,
        }, (err, doc) => {
          if (err || !doc) {
            reject(err);
          } else {
            resolve(doc);
          }
        });
      });
    });
  }
  

  sendVerificationEmail(user) {
    if (!this.shouldVerifyEmails) {
      return;
    }
    
    const token = encodeURIComponent(user._email_verify_token);
    const username = encodeURIComponent(user.username);
   
    let link = `${this.config.verifyEmailURL}?token=${token}&username=${username}`;
    this.adapter.sendVerificationEmail({
      appName: this.config.appName,
      link: link,
      user: inflate('_User', user),
    });
  }
  
  setPasswordResetToken(email) {
    var database = this.config.database;
    var token = randomString(25);
    return new Promise((resolve, reject) => {
      return database.collection('_User').then(coll => {
        // Need direct database access because verification token is not a parse field
        return coll.findAndModify({
          email: email,
        }, null, {$set: {_perishable_token: token}}, (err, doc) => {
          if (err || !doc.value) {
            console.error(err);
            reject(err);
          } else {
            doc.value._perishable_token = token;
            resolve(doc.value);
          }
        });
      });
    });
  }

  sendPasswordResetEmail(email) {
    if (!this.adapter) {
      throw "Trying to send a reset password but no adapter is set";
      //  TODO: No adapter?
      return;
    }
    
    return this.setPasswordResetToken(email).then((user) => {

      const token = encodeURIComponent(user._perishable_token);
      const username = encodeURIComponent(user.username);    
      let link = `${this.config.requestResetPasswordURL}?token=${token}&username=${username}`
      this.adapter.sendPasswordResetEmail({
        appName: this.config.appName,
        link: link,
        user: inflate('_User', user),
      });
      return Promise.resolve(user);
    });
  }
  
  updatePassword(username, token, password, config) {
   return this.checkResetTokenValidity(username, token).then(() => {
     return updateUserPassword(username, token, password, this.config);
   });
  }
}

// Mark this private
function updateUserPassword(username, token, password, config) { 
    var write = new RestWrite(config, Auth.master(config), '_User', {
            username: username, 
            _perishable_token: token
          }, {password: password, _perishable_token: null }, undefined);
    return write.execute();
 }

export default UserController;
