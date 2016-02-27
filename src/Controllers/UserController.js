import { randomString } from '../cryptoUtils';
import { inflate } from '../triggers';
import AdaptableController from './AdaptableController';
import MailAdapter from '../Adapters/Email/MailAdapter';

var DatabaseAdapter = require('../DatabaseAdapter');

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
            reject();
          } else {
            resolve();
          }
        });
      });
       
    });    
  }
  
  checkResetTokenValidity(username, token) {
    var database = this.config.database;
    return new Promise((resolve, reject) => {
      database.collection('_User').then(coll => {
        // Need direct database access because verification token is not a parse field
        return coll.findOne({
          username: username,
          _email_reset_token: token,
        }, (err, doc) => {
          if (err || !doc.value) {
            reject();
          } else {
            resolve();
          }
        });
      });
    });
  }
  
  setPasswordResetToken(email) {
    var database = this.config.database;
    var token = randomString(25);
    return new Promise((resolve, reject) => {
      database.collection('_User').then(coll => {
        // Need direct database access because verification token is not a parse field
        return coll.findAndModify({
          email: email,
        }, null, {$set: {_email_reset_token: token}}, (err, doc) => {
          if (err || !doc.value) {
            reject();
          } else {
            console.log(doc);
            resolve(token);
          }
        });
      });
    });
  }
  
  sendVerificationEmail(user, config = this.config) {
    if (!this.shouldVerifyEmails) {
      return;
    }
    
    const token = encodeURIComponent(user._email_verify_token);
    const username = encodeURIComponent(user.username);
   
    let link = `${config.verifyEmailURL}?token=${token}&username=${username}`;
    this.adapter.sendVerificationEmail({
      appName: config.appName,
      link: link,
      user: inflate('_User', user),
    });
  }
  
  sendPasswordResetEmail(user, config = this.config) {
    if (!this.adapter) {
      return;
    }
    
    const token = encodeURIComponent(user._email_reset_token);
    const username = encodeURIComponent(user.username);
    
    let link = `${config.requestPasswordResetURL}?token=${token}&username=${username}`
    this.adapter.sendPasswordResetEmail({
      appName: config.appName,
      link: link,
      user: inflate('_User', user),
    });
  }

  sendMail(options) {
    this.adapter.sendMail(options);
  }
}

export default UserController;
