// Various utilities for RestWrite & RestQuery

const SchemaController = require('./Controllers/SchemaController');
const Parse = require('parse/node').Parse;

export class RestUtils {
  // Validates this operation against the allowClientClassCreation config.
  static validateClientClassCreation(config, auth, className) {
    if (config.allowClientClassCreation === false && !auth.isMaster
      && SchemaController.systemClasses.indexOf(className) === -1) {
      return config.database.loadSchema()
        .then(schemaController => schemaController.hasClass(className))
        .then(hasClass => {
          if (hasClass !== true) {
            throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN,
              'This user is not allowed to access ' +
              'non-existent class: ' + className);
          }
        });
    } else {
      return Promise.resolve();
    }
  }

  // Cleans auth data from a user
  static cleanUserAuthData(user) {
    if (user.authData) {
      Object.keys(user.authData).forEach((provider) => {
        if (user.authData[provider] === null) {
          delete user.authData[provider];
        }
      });
      if (Object.keys(user.authData).length == 0) {
        delete user.authData;
      }
    }
    return user;
  }

}

export default RestUtils;
