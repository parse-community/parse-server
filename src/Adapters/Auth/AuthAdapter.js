/*eslint no-unused-vars: "off"*/

var https = require('https');

export class AuthAdapter {

  /*
  @param appIds: the specified app ids in the configuration
  @param authData: the client provided authData
  @returns a promise that resolves if the applicationId is valid
   */
  validateAppId(appIds, authData) {
    return Promise.resolve({});
  }

  /*
  @param authData: the client provided authData
  @param options: additional options
   */
  validateAuthData(authData, options) {
    return Promise.resolve({});
  }

  /**
   * A promisey wrapper for all auth requests
   *
   * @param {string} name           Name of auth to use in rejection message
   * @param {Object|string} config  Config/String to pass to https.get
   * @param {Object|null} postData  Optional data to post with
   * @returns {Promise}
   */
  static request(name, config, postData) {
    return new Promise(function(resolve, reject) {
      const req = https.get(config, function(res) {
        let data = '';
        res.on('data', function(chunk) {
          data += chunk;
        });
        res.on('end', function() {
          try {
            data = JSON.parse(data);
          } catch(e) {
            return reject(e);
          }
          resolve(data);
        });
      }).on('error', function() {
        reject('Failed to validate this access token with ' + name + '.');
      });
      if(postData) {
        req.on('error', function() {
          reject('Failed to validate this access token with ' + name + '.');
        });
        req.write(postData);
        req.end();
      }
    });
  }
}

export default AuthAdapter;
