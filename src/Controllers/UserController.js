
var DatabaseAdapter = require('../DatabaseAdapter');

export class UserController {
  
  constructor(appId) {
    this.appId = appId;
  }
  
  verifyEmail(username, token) {
    var database = DatabaseAdapter.getDatabaseConnection(this.appId);
    return new Promise((resolve, reject) => {
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
}

export default UserController;
