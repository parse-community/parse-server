import { randomString } from '../cryptoUtils';
import { inflate } from '../triggers';
import AdaptableController from './AdaptableController';
import MailAdapter from '../Adapters/Email/MailAdapter';

var DatabaseAdapter = require('../DatabaseAdapter');
var RestWrite = require('../RestWrite');
var RestQuery = require('../RestQuery');
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
    return this.config.database.adaptiveCollection('_User')
      .then(collection => {
          return collection.find({
            username: username,
            _perishable_token: token
          }, { limit: 1 });
        })
      .then(results => {
        if (results.length != 1) {
          return Promise.reject();
        }
        return results[0];
      });
  }
  
  getUserIfNeeded(user) {
    if (user.username && user.email) {
      return Promise.resolve(user);
    }
    var where = {};
    if (user.username) {
      where.username = user.username;
    }
    if (user.email) {
      where.email = user.email;
    }
    
    var query = new RestQuery(this.config, Auth.master(this.config), '_User', where);
    return query.execute().then(function(result){
      if (result.results.length != 1) {
        return Promise.reject();
      }
      return result.results[0];
    })
  }
  

  sendVerificationEmail(user) {
    if (!this.shouldVerifyEmails) {
      return;
    }
    // We may need to fetch the user in case of update email
    this.getUserIfNeeded(user).then((user) => {
      const token = encodeURIComponent(user._email_verify_token);
      const username = encodeURIComponent(user.username);
      let link = `${this.config.verifyEmailURL}?token=${token}&username=${username}`;
      let options = {
        appName: this.config.appName,
        link: link,
        user: inflate('_User', user),
      };
      if (this.adapter.sendVerificationEmail) {
        this.adapter.sendVerificationEmail(options);
      } else {
        this.adapter.sendMail(this.defaultVerificationEmail(options));
      }
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

      let options = {
        appName: this.config.appName,
        link: link,
        user: inflate('_User', user),
      };
      
      if (this.adapter.sendPasswordResetEmail) {
        this.adapter.sendPasswordResetEmail(options);
      } else {
        this.adapter.sendMail(this.defaultResetPasswordEmail(options));
      }

      return Promise.resolve(user);
    });
  }
  
  updatePassword(username, token, password, config) {
   return this.checkResetTokenValidity(username, token).then(() => {
     return updateUserPassword(username, token, password, this.config);
   });
  }
  
  defaultVerificationEmail({link, user, appName, }) {
    let text = "Hi,\n\n" +
	      "You are being asked to confirm the e-mail address " + user.email + " with " + appName + "\n\n" +
	      "" +
	      "Click here to confirm it:\n" + link;
    let to = user.get("email");
    let subject = 'Please verify your e-mail for ' + appName;
    return { text, to, subject };
  }
  
  defaultResetPasswordEmail({link, user, appName, }) {
    let text = "Hi,\n\n" + 
        "You requested to reset your password for " + appName + ".\n\n" +
        "" +
        "Click here to reset it:\n" + link;
    let to = user.get("email");
    let subject =  'Password Reset for ' + appName;
    return { text, to, subject };
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
