"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _RestQuery = _interopRequireDefault(require("./RestQuery"));

var _lodash = _interopRequireDefault(require("lodash"));

var _logger = _interopRequireDefault(require("./logger"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".
var SchemaController = require('./Controllers/SchemaController');

var deepcopy = require('deepcopy');

const Auth = require('./Auth');

var cryptoUtils = require('./cryptoUtils');

var passwordCrypto = require('./password');

var Parse = require('parse/node');

var triggers = require('./triggers');

var ClientSDK = require('./ClientSDK');

// query and data are both provided in REST API format. So data
// types are encoded by plain old objects.
// If query is null, this is a "create" and the data in data should be
// created.
// Otherwise this is an "update" - the object matching the query
// should get updated with data.
// RestWrite will handle objectId, createdAt, and updatedAt for
// everything. It also knows to use triggers and special modifications
// for the _User class.
function RestWrite(config, auth, className, query, data, originalData, clientSDK, action) {
  if (auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Cannot perform a write operation when using readOnlyMasterKey');
  }

  this.config = config;
  this.auth = auth;
  this.className = className;
  this.clientSDK = clientSDK;
  this.storage = {};
  this.runOptions = {};
  this.context = {};

  if (action) {
    this.runOptions.action = action;
  }

  if (!query) {
    // Parse context
    if (data._context && data._context instanceof Object) {
      this.context = data._context;
      delete data._context;
    }

    if (this.config.allowCustomObjectId) {
      if (Object.prototype.hasOwnProperty.call(data, 'objectId') && !data.objectId) {
        throw new Parse.Error(Parse.Error.MISSING_OBJECT_ID, 'objectId must not be empty, null or undefined');
      }
    } else {
      if (data.objectId) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'objectId is an invalid field name.');
      }

      if (data.id) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'id is an invalid field name.');
      }
    }
  } // When the operation is complete, this.response may have several
  // fields.
  // response: the actual data to be returned
  // status: the http status code. if not present, treated like a 200
  // location: the location header. if not present, no location header


  this.response = null; // Processing this operation may mutate our data, so we operate on a
  // copy

  this.query = deepcopy(query);
  this.data = deepcopy(data); // We never change originalData, so we do not need a deep copy

  this.originalData = originalData; // The timestamp we'll use for this whole operation

  this.updatedAt = Parse._encode(new Date()).iso; // Shared SchemaController to be reused to reduce the number of loadSchema() calls per request
  // Once set the schemaData should be immutable

  this.validSchemaController = null;
} // A convenient method to perform all the steps of processing the
// write, in order.
// Returns a promise for a {response, status, location} object.
// status and location are optional.


RestWrite.prototype.execute = function () {
  return Promise.resolve().then(() => {
    return this.getUserAndRoleACL();
  }).then(() => {
    return this.validateClientClassCreation();
  }).then(() => {
    return this.handleInstallation();
  }).then(() => {
    return this.handleSession();
  }).then(() => {
    return this.validateAuthData();
  }).then(() => {
    return this.runBeforeSaveTrigger();
  }).then(() => {
    return this.deleteEmailResetTokenIfNeeded();
  }).then(() => {
    return this.validateSchema();
  }).then(schemaController => {
    this.validSchemaController = schemaController;
    return this.setRequiredFieldsIfNeeded();
  }).then(() => {
    return this.transformUser();
  }).then(() => {
    return this.expandFilesForExistingObjects();
  }).then(() => {
    return this.destroyDuplicatedSessions();
  }).then(() => {
    return this.runDatabaseOperation();
  }).then(() => {
    return this.createSessionTokenIfNeeded();
  }).then(() => {
    return this.handleFollowup();
  }).then(() => {
    return this.runAfterSaveTrigger();
  }).then(() => {
    return this.cleanUserAuthData();
  }).then(() => {
    return this.response;
  });
}; // Uses the Auth object to get the list of roles, adds the user id


RestWrite.prototype.getUserAndRoleACL = function () {
  if (this.auth.isMaster) {
    return Promise.resolve();
  }

  this.runOptions.acl = ['*'];

  if (this.auth.user) {
    return this.auth.getUserRoles().then(roles => {
      this.runOptions.acl = this.runOptions.acl.concat(roles, [this.auth.user.id]);
      return;
    });
  } else {
    return Promise.resolve();
  }
}; // Validates this operation against the allowClientClassCreation config.


RestWrite.prototype.validateClientClassCreation = function () {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(schemaController => schemaController.hasClass(this.className)).then(hasClass => {
      if (hasClass !== true) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + this.className);
      }
    });
  } else {
    return Promise.resolve();
  }
}; // Validates this operation against the schema.


RestWrite.prototype.validateSchema = function () {
  return this.config.database.validateObject(this.className, this.data, this.query, this.runOptions);
}; // Runs any beforeSave triggers against this operation.
// Any change leads to our data being mutated.


RestWrite.prototype.runBeforeSaveTrigger = function () {
  if (this.response) {
    return;
  } // Avoid doing any setup for triggers if there is no 'beforeSave' trigger for this class.


  if (!triggers.triggerExists(this.className, triggers.Types.beforeSave, this.config.applicationId)) {
    return Promise.resolve();
  } // Cloud code gets a bit of extra data for its objects


  var extraData = {
    className: this.className
  };

  if (this.query && this.query.objectId) {
    extraData.objectId = this.query.objectId;
  }

  let originalObject = null;
  const updatedObject = this.buildUpdatedObject(extraData);

  if (this.query && this.query.objectId) {
    // This is an update for existing object.
    originalObject = triggers.inflate(extraData, this.originalData);
  }

  return Promise.resolve().then(() => {
    // Before calling the trigger, validate the permissions for the save operation
    let databasePromise = null;

    if (this.query) {
      // Validate for updating
      databasePromise = this.config.database.update(this.className, this.query, this.data, this.runOptions, false, true);
    } else {
      // Validate for creating
      databasePromise = this.config.database.create(this.className, this.data, this.runOptions, true);
    } // In the case that there is no permission for the operation, it throws an error


    return databasePromise.then(result => {
      if (!result || result.length <= 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
    });
  }).then(() => {
    return triggers.maybeRunTrigger(triggers.Types.beforeSave, this.auth, updatedObject, originalObject, this.config, this.context);
  }).then(response => {
    if (response && response.object) {
      this.storage.fieldsChangedByTrigger = _lodash.default.reduce(response.object, (result, value, key) => {
        if (!_lodash.default.isEqual(this.data[key], value)) {
          result.push(key);
        }

        return result;
      }, []);
      this.data = response.object; // We should delete the objectId for an update write

      if (this.query && this.query.objectId) {
        delete this.data.objectId;
      }
    }
  });
};

RestWrite.prototype.runBeforeLoginTrigger = async function (userData) {
  // Avoid doing any setup for triggers if there is no 'beforeLogin' trigger
  if (!triggers.triggerExists(this.className, triggers.Types.beforeLogin, this.config.applicationId)) {
    return;
  } // Cloud code gets a bit of extra data for its objects


  const extraData = {
    className: this.className
  };
  const user = triggers.inflate(extraData, userData); // no need to return a response

  await triggers.maybeRunTrigger(triggers.Types.beforeLogin, this.auth, user, null, this.config, this.context);
};

RestWrite.prototype.setRequiredFieldsIfNeeded = function () {
  if (this.data) {
    return this.validSchemaController.getAllClasses().then(allClasses => {
      const schema = allClasses.find(oneClass => oneClass.className === this.className);

      const setRequiredFieldIfNeeded = (fieldName, setDefault) => {
        if (this.data[fieldName] === undefined || this.data[fieldName] === null || this.data[fieldName] === '' || typeof this.data[fieldName] === 'object' && this.data[fieldName].__op === 'Delete') {
          if (setDefault && schema.fields[fieldName] && schema.fields[fieldName].defaultValue !== null && schema.fields[fieldName].defaultValue !== undefined && (this.data[fieldName] === undefined || typeof this.data[fieldName] === 'object' && this.data[fieldName].__op === 'Delete')) {
            this.data[fieldName] = schema.fields[fieldName].defaultValue;
            this.storage.fieldsChangedByTrigger = this.storage.fieldsChangedByTrigger || [];

            if (this.storage.fieldsChangedByTrigger.indexOf(fieldName) < 0) {
              this.storage.fieldsChangedByTrigger.push(fieldName);
            }
          } else if (schema.fields[fieldName] && schema.fields[fieldName].required === true) {
            throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `${fieldName} is required`);
          }
        }
      }; // Add default fields


      this.data.updatedAt = this.updatedAt;

      if (!this.query) {
        this.data.createdAt = this.updatedAt; // Only assign new objectId if we are creating new object

        if (!this.data.objectId) {
          this.data.objectId = cryptoUtils.newObjectId(this.config.objectIdSize);
        }

        if (schema) {
          Object.keys(schema.fields).forEach(fieldName => {
            setRequiredFieldIfNeeded(fieldName, true);
          });
        }
      } else if (schema) {
        Object.keys(this.data).forEach(fieldName => {
          setRequiredFieldIfNeeded(fieldName, false);
        });
      }
    });
  }

  return Promise.resolve();
}; // Transforms auth data for a user object.
// Does nothing if this isn't a user object.
// Returns a promise for when we're done if it can't finish this tick.


RestWrite.prototype.validateAuthData = function () {
  if (this.className !== '_User') {
    return;
  }

  if (!this.query && !this.data.authData) {
    if (typeof this.data.username !== 'string' || _lodash.default.isEmpty(this.data.username)) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'bad or missing username');
    }

    if (typeof this.data.password !== 'string' || _lodash.default.isEmpty(this.data.password)) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required');
    }
  }

  if (this.data.authData && !Object.keys(this.data.authData).length || !Object.prototype.hasOwnProperty.call(this.data, 'authData')) {
    // Handle saving authData to {} or if authData doesn't exist
    return;
  } else if (Object.prototype.hasOwnProperty.call(this.data, 'authData') && !this.data.authData) {
    // Handle saving authData to null
    throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
  }

  var authData = this.data.authData;
  var providers = Object.keys(authData);

  if (providers.length > 0) {
    const canHandleAuthData = providers.reduce((canHandle, provider) => {
      var providerAuthData = authData[provider];
      var hasToken = providerAuthData && providerAuthData.id;
      return canHandle && (hasToken || providerAuthData == null);
    }, true);

    if (canHandleAuthData) {
      return this.handleAuthData(authData);
    }
  }

  throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
};

RestWrite.prototype.handleAuthDataValidation = function (authData) {
  const validations = Object.keys(authData).map(provider => {
    if (authData[provider] === null) {
      return Promise.resolve();
    }

    const validateAuthData = this.config.authDataManager.getValidatorForProvider(provider);

    if (!validateAuthData) {
      throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
    }

    return validateAuthData(authData[provider]);
  });
  return Promise.all(validations);
};

RestWrite.prototype.findUsersWithAuthData = function (authData) {
  const providers = Object.keys(authData);
  const query = providers.reduce((memo, provider) => {
    if (!authData[provider]) {
      return memo;
    }

    const queryKey = `authData.${provider}.id`;
    const query = {};
    query[queryKey] = authData[provider].id;
    memo.push(query);
    return memo;
  }, []).filter(q => {
    return typeof q !== 'undefined';
  });
  let findPromise = Promise.resolve([]);

  if (query.length > 0) {
    findPromise = this.config.database.find(this.className, {
      $or: query
    }, {});
  }

  return findPromise;
};

RestWrite.prototype.filteredObjectsByACL = function (objects) {
  if (this.auth.isMaster) {
    return objects;
  }

  return objects.filter(object => {
    if (!object.ACL) {
      return true; // legacy users that have no ACL field on them
    } // Regular users that have been locked out.


    return object.ACL && Object.keys(object.ACL).length > 0;
  });
};

RestWrite.prototype.handleAuthData = function (authData) {
  let results;
  return this.findUsersWithAuthData(authData).then(async r => {
    results = this.filteredObjectsByACL(r);

    if (results.length == 1) {
      this.storage['authProvider'] = Object.keys(authData).join(',');
      const userResult = results[0];
      const mutatedAuthData = {};
      Object.keys(authData).forEach(provider => {
        const providerData = authData[provider];
        const userAuthData = userResult.authData[provider];

        if (!_lodash.default.isEqual(providerData, userAuthData)) {
          mutatedAuthData[provider] = providerData;
        }
      });
      const hasMutatedAuthData = Object.keys(mutatedAuthData).length !== 0;
      let userId;

      if (this.query && this.query.objectId) {
        userId = this.query.objectId;
      } else if (this.auth && this.auth.user && this.auth.user.id) {
        userId = this.auth.user.id;
      }

      if (!userId || userId === userResult.objectId) {
        // no user making the call
        // OR the user making the call is the right one
        // Login with auth data
        delete results[0].password; // need to set the objectId first otherwise location has trailing undefined

        this.data.objectId = userResult.objectId;

        if (!this.query || !this.query.objectId) {
          // this a login call, no userId passed
          this.response = {
            response: userResult,
            location: this.location()
          }; // Run beforeLogin hook before storing any updates
          // to authData on the db; changes to userResult
          // will be ignored.

          await this.runBeforeLoginTrigger(deepcopy(userResult));
        } // If we didn't change the auth data, just keep going


        if (!hasMutatedAuthData) {
          return;
        } // We have authData that is updated on login
        // that can happen when token are refreshed,
        // We should update the token and let the user in
        // We should only check the mutated keys


        return this.handleAuthDataValidation(mutatedAuthData).then(async () => {
          // IF we have a response, we'll skip the database operation / beforeSave / afterSave etc...
          // we need to set it up there.
          // We are supposed to have a response only on LOGIN with authData, so we skip those
          // If we're not logging in, but just updating the current user, we can safely skip that part
          if (this.response) {
            // Assign the new authData in the response
            Object.keys(mutatedAuthData).forEach(provider => {
              this.response.response.authData[provider] = mutatedAuthData[provider];
            }); // Run the DB update directly, as 'master'
            // Just update the authData part
            // Then we're good for the user, early exit of sorts

            return this.config.database.update(this.className, {
              objectId: this.data.objectId
            }, {
              authData: mutatedAuthData
            }, {});
          }
        });
      } else if (userId) {
        // Trying to update auth data but users
        // are different
        if (userResult.objectId !== userId) {
          throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
        } // No auth data was mutated, just keep going


        if (!hasMutatedAuthData) {
          return;
        }
      }
    }

    return this.handleAuthDataValidation(authData).then(() => {
      if (results.length > 1) {
        // More than 1 user with the passed id's
        throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
      }
    });
  });
}; // The non-third-party parts of User transformation


RestWrite.prototype.transformUser = function () {
  var promise = Promise.resolve();

  if (this.className !== '_User') {
    return promise;
  }

  if (!this.auth.isMaster && 'emailVerified' in this.data) {
    const error = `Clients aren't allowed to manually update email verification.`;
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  } // Do not cleanup session if objectId is not set


  if (this.query && this.objectId()) {
    // If we're updating a _User object, we need to clear out the cache for that user. Find all their
    // session tokens, and remove them from the cache.
    promise = new _RestQuery.default(this.config, Auth.master(this.config), '_Session', {
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.objectId()
      }
    }).execute().then(results => {
      results.results.forEach(session => this.config.cacheController.user.del(session.sessionToken));
    });
  }

  return promise.then(() => {
    // Transform the password
    if (this.data.password === undefined) {
      // ignore only if undefined. should proceed if empty ('')
      return Promise.resolve();
    }

    if (this.query) {
      this.storage['clearSessions'] = true; // Generate a new session only if the user requested

      if (!this.auth.isMaster) {
        this.storage['generateNewSession'] = true;
      }
    }

    return this._validatePasswordPolicy().then(() => {
      return passwordCrypto.hash(this.data.password).then(hashedPassword => {
        this.data._hashed_password = hashedPassword;
        delete this.data.password;
      });
    });
  }).then(() => {
    return this._validateUserName();
  }).then(() => {
    return this._validateEmail();
  });
};

RestWrite.prototype._validateUserName = function () {
  // Check for username uniqueness
  if (!this.data.username) {
    if (!this.query) {
      this.data.username = cryptoUtils.randomString(25);
      this.responseShouldHaveUsername = true;
    }

    return Promise.resolve();
  }
  /*
    Usernames should be unique when compared case insensitively
     Users should be able to make case sensitive usernames and
    login using the case they entered.  I.e. 'Snoopy' should preclude
    'snoopy' as a valid username.
  */


  return this.config.database.find(this.className, {
    username: this.data.username,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1,
    caseInsensitive: true
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
    }

    return;
  });
};
/*
  As with usernames, Parse should not allow case insensitive collisions of email.
  unlike with usernames (which can have case insensitive collisions in the case of
  auth adapters), emails should never have a case insensitive collision.

  This behavior can be enforced through a properly configured index see:
  https://docs.mongodb.com/manual/core/index-case-insensitive/#create-a-case-insensitive-index
  which could be implemented instead of this code based validation.

  Given that this lookup should be a relatively low use case and that the case sensitive
  unique index will be used by the db for the query, this is an adequate solution.
*/


RestWrite.prototype._validateEmail = function () {
  if (!this.data.email || this.data.email.__op === 'Delete') {
    return Promise.resolve();
  } // Validate basic email address format


  if (!this.data.email.match(/^.+@.+$/)) {
    return Promise.reject(new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.'));
  } // Case insensitive match, see note above function.


  return this.config.database.find(this.className, {
    email: this.data.email,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1,
    caseInsensitive: true
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
    }

    if (!this.data.authData || !Object.keys(this.data.authData).length || Object.keys(this.data.authData).length === 1 && Object.keys(this.data.authData)[0] === 'anonymous') {
      // We updated the email, send a new validation
      this.storage['sendVerificationEmail'] = true;
      this.config.userController.setEmailVerifyToken(this.data);
    }
  });
};

RestWrite.prototype._validatePasswordPolicy = function () {
  if (!this.config.passwordPolicy) return Promise.resolve();
  return this._validatePasswordRequirements().then(() => {
    return this._validatePasswordHistory();
  });
};

RestWrite.prototype._validatePasswordRequirements = function () {
  // check if the password conforms to the defined password policy if configured
  // If we specified a custom error in our configuration use it.
  // Example: "Passwords must include a Capital Letter, Lowercase Letter, and a number."
  //
  // This is especially useful on the generic "password reset" page,
  // as it allows the programmer to communicate specific requirements instead of:
  // a. making the user guess whats wrong
  // b. making a custom password reset page that shows the requirements
  const policyError = this.config.passwordPolicy.validationError ? this.config.passwordPolicy.validationError : 'Password does not meet the Password Policy requirements.';
  const containsUsernameError = 'Password cannot contain your username.'; // check whether the password meets the password strength requirements

  if (this.config.passwordPolicy.patternValidator && !this.config.passwordPolicy.patternValidator(this.data.password) || this.config.passwordPolicy.validatorCallback && !this.config.passwordPolicy.validatorCallback(this.data.password)) {
    return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, policyError));
  } // check whether password contain username


  if (this.config.passwordPolicy.doNotAllowUsername === true) {
    if (this.data.username) {
      // username is not passed during password reset
      if (this.data.password.indexOf(this.data.username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
    } else {
      // retrieve the User object using objectId during password reset
      return this.config.database.find('_User', {
        objectId: this.objectId()
      }).then(results => {
        if (results.length != 1) {
          throw undefined;
        }

        if (this.data.password.indexOf(results[0].username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
        return Promise.resolve();
      });
    }
  }

  return Promise.resolve();
};

RestWrite.prototype._validatePasswordHistory = function () {
  // check whether password is repeating from specified history
  if (this.query && this.config.passwordPolicy.maxPasswordHistory) {
    return this.config.database.find('_User', {
      objectId: this.objectId()
    }, {
      keys: ['_password_history', '_hashed_password']
    }).then(results => {
      if (results.length != 1) {
        throw undefined;
      }

      const user = results[0];
      let oldPasswords = [];
      if (user._password_history) oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory - 1);
      oldPasswords.push(user.password);
      const newPassword = this.data.password; // compare the new password hash with all old password hashes

      const promises = oldPasswords.map(function (hash) {
        return passwordCrypto.compare(newPassword, hash).then(result => {
          if (result) // reject if there is a match
            return Promise.reject('REPEAT_PASSWORD');
          return Promise.resolve();
        });
      }); // wait for all comparisons to complete

      return Promise.all(promises).then(() => {
        return Promise.resolve();
      }).catch(err => {
        if (err === 'REPEAT_PASSWORD') // a match was found
          return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, `New password should not be the same as last ${this.config.passwordPolicy.maxPasswordHistory} passwords.`));
        throw err;
      });
    });
  }

  return Promise.resolve();
};

RestWrite.prototype.createSessionTokenIfNeeded = function () {
  if (this.className !== '_User') {
    return;
  } // Don't generate session for updating user (this.query is set) unless authData exists


  if (this.query && !this.data.authData) {
    return;
  } // Don't generate new sessionToken if linking via sessionToken


  if (this.auth.user && this.data.authData) {
    return;
  }

  if (!this.storage['authProvider'] && // signup call, with
  this.config.preventLoginWithUnverifiedEmail && // no login without verification
  this.config.verifyUserEmails) {
    // verification is on
    return; // do not create the session token in that case!
  }

  return this.createSessionToken();
};

RestWrite.prototype.createSessionToken = async function () {
  // cloud installationId from Cloud Code,
  // never create session tokens from there.
  if (this.auth.installationId && this.auth.installationId === 'cloud') {
    return;
  }

  const {
    sessionData,
    createSession
  } = Auth.createSession(this.config, {
    userId: this.objectId(),
    createdWith: {
      action: this.storage['authProvider'] ? 'login' : 'signup',
      authProvider: this.storage['authProvider'] || 'password'
    },
    installationId: this.auth.installationId
  });

  if (this.response && this.response.response) {
    this.response.response.sessionToken = sessionData.sessionToken;
  }

  return createSession();
}; // Delete email reset tokens if user is changing password or email.


RestWrite.prototype.deleteEmailResetTokenIfNeeded = function () {
  if (this.className !== '_User' || this.query === null) {
    // null query means create
    return;
  }

  if ('password' in this.data || 'email' in this.data) {
    const addOps = {
      _perishable_token: {
        __op: 'Delete'
      },
      _perishable_token_expires_at: {
        __op: 'Delete'
      }
    };
    this.data = Object.assign(this.data, addOps);
  }
};

RestWrite.prototype.destroyDuplicatedSessions = function () {
  // Only for _Session, and at creation time
  if (this.className != '_Session' || this.query) {
    return;
  } // Destroy the sessions in 'Background'


  const {
    user,
    installationId,
    sessionToken
  } = this.data;

  if (!user || !installationId) {
    return;
  }

  if (!user.objectId) {
    return;
  }

  this.config.database.destroy('_Session', {
    user,
    installationId,
    sessionToken: {
      $ne: sessionToken
    }
  }, {}, this.validSchemaController);
}; // Handles any followup logic


RestWrite.prototype.handleFollowup = function () {
  if (this.storage && this.storage['clearSessions'] && this.config.revokeSessionOnPasswordReset) {
    var sessionQuery = {
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.objectId()
      }
    };
    delete this.storage['clearSessions'];
    return this.config.database.destroy('_Session', sessionQuery).then(this.handleFollowup.bind(this));
  }

  if (this.storage && this.storage['generateNewSession']) {
    delete this.storage['generateNewSession'];
    return this.createSessionToken().then(this.handleFollowup.bind(this));
  }

  if (this.storage && this.storage['sendVerificationEmail']) {
    delete this.storage['sendVerificationEmail']; // Fire and forget!

    this.config.userController.sendVerificationEmail(this.data);
    return this.handleFollowup.bind(this);
  }
}; // Handles the _Session class specialness.
// Does nothing if this isn't an _Session object.


RestWrite.prototype.handleSession = function () {
  if (this.response || this.className !== '_Session') {
    return;
  }

  if (!this.auth.user && !this.auth.isMaster) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
  } // TODO: Verify proper error to throw


  if (this.data.ACL) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'Cannot set ' + 'ACL on a Session.');
  }

  if (this.query) {
    if (this.data.user && !this.auth.isMaster && this.data.user.objectId != this.auth.user.id) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if (this.data.installationId) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if (this.data.sessionToken) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    }
  }

  if (!this.query && !this.auth.isMaster) {
    const additionalSessionData = {};

    for (var key in this.data) {
      if (key === 'objectId' || key === 'user') {
        continue;
      }

      additionalSessionData[key] = this.data[key];
    }

    const {
      sessionData,
      createSession
    } = Auth.createSession(this.config, {
      userId: this.auth.user.id,
      createdWith: {
        action: 'create'
      },
      additionalSessionData
    });
    return createSession().then(results => {
      if (!results.response) {
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Error creating session.');
      }

      sessionData['objectId'] = results.response['objectId'];
      this.response = {
        status: 201,
        location: results.location,
        response: sessionData
      };
    });
  }
}; // Handles the _Installation class specialness.
// Does nothing if this isn't an installation object.
// If an installation is found, this can mutate this.query and turn a create
// into an update.
// Returns a promise for when we're done if it can't finish this tick.


RestWrite.prototype.handleInstallation = function () {
  if (this.response || this.className !== '_Installation') {
    return;
  }

  if (!this.query && !this.data.deviceToken && !this.data.installationId && !this.auth.installationId) {
    throw new Parse.Error(135, 'at least one ID field (deviceToken, installationId) ' + 'must be specified in this operation');
  } // If the device token is 64 characters long, we assume it is for iOS
  // and lowercase it.


  if (this.data.deviceToken && this.data.deviceToken.length == 64) {
    this.data.deviceToken = this.data.deviceToken.toLowerCase();
  } // We lowercase the installationId if present


  if (this.data.installationId) {
    this.data.installationId = this.data.installationId.toLowerCase();
  }

  let installationId = this.data.installationId; // If data.installationId is not set and we're not master, we can lookup in auth

  if (!installationId && !this.auth.isMaster) {
    installationId = this.auth.installationId;
  }

  if (installationId) {
    installationId = installationId.toLowerCase();
  } // Updating _Installation but not updating anything critical


  if (this.query && !this.data.deviceToken && !installationId && !this.data.deviceType) {
    return;
  }

  var promise = Promise.resolve();
  var idMatch; // Will be a match on either objectId or installationId

  var objectIdMatch;
  var installationIdMatch;
  var deviceTokenMatches = []; // Instead of issuing 3 reads, let's do it with one OR.

  const orQueries = [];

  if (this.query && this.query.objectId) {
    orQueries.push({
      objectId: this.query.objectId
    });
  }

  if (installationId) {
    orQueries.push({
      installationId: installationId
    });
  }

  if (this.data.deviceToken) {
    orQueries.push({
      deviceToken: this.data.deviceToken
    });
  }

  if (orQueries.length == 0) {
    return;
  }

  promise = promise.then(() => {
    return this.config.database.find('_Installation', {
      $or: orQueries
    }, {});
  }).then(results => {
    results.forEach(result => {
      if (this.query && this.query.objectId && result.objectId == this.query.objectId) {
        objectIdMatch = result;
      }

      if (result.installationId == installationId) {
        installationIdMatch = result;
      }

      if (result.deviceToken == this.data.deviceToken) {
        deviceTokenMatches.push(result);
      }
    }); // Sanity checks when running a query

    if (this.query && this.query.objectId) {
      if (!objectIdMatch) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found for update.');
      }

      if (this.data.installationId && objectIdMatch.installationId && this.data.installationId !== objectIdMatch.installationId) {
        throw new Parse.Error(136, 'installationId may not be changed in this ' + 'operation');
      }

      if (this.data.deviceToken && objectIdMatch.deviceToken && this.data.deviceToken !== objectIdMatch.deviceToken && !this.data.installationId && !objectIdMatch.installationId) {
        throw new Parse.Error(136, 'deviceToken may not be changed in this ' + 'operation');
      }

      if (this.data.deviceType && this.data.deviceType && this.data.deviceType !== objectIdMatch.deviceType) {
        throw new Parse.Error(136, 'deviceType may not be changed in this ' + 'operation');
      }
    }

    if (this.query && this.query.objectId && objectIdMatch) {
      idMatch = objectIdMatch;
    }

    if (installationId && installationIdMatch) {
      idMatch = installationIdMatch;
    } // need to specify deviceType only if it's new


    if (!this.query && !this.data.deviceType && !idMatch) {
      throw new Parse.Error(135, 'deviceType must be specified in this operation');
    }
  }).then(() => {
    if (!idMatch) {
      if (!deviceTokenMatches.length) {
        return;
      } else if (deviceTokenMatches.length == 1 && (!deviceTokenMatches[0]['installationId'] || !installationId)) {
        // Single match on device token but none on installationId, and either
        // the passed object or the match is missing an installationId, so we
        // can just return the match.
        return deviceTokenMatches[0]['objectId'];
      } else if (!this.data.installationId) {
        throw new Parse.Error(132, 'Must specify installationId when deviceToken ' + 'matches multiple Installation objects');
      } else {
        // Multiple device token matches and we specified an installation ID,
        // or a single match where both the passed and matching objects have
        // an installation ID. Try cleaning out old installations that match
        // the deviceToken, and return nil to signal that a new object should
        // be created.
        var delQuery = {
          deviceToken: this.data.deviceToken,
          installationId: {
            $ne: installationId
          }
        };

        if (this.data.appIdentifier) {
          delQuery['appIdentifier'] = this.data.appIdentifier;
        }

        this.config.database.destroy('_Installation', delQuery).catch(err => {
          if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
            // no deletions were made. Can be ignored.
            return;
          } // rethrow the error


          throw err;
        });
        return;
      }
    } else {
      if (deviceTokenMatches.length == 1 && !deviceTokenMatches[0]['installationId']) {
        // Exactly one device token match and it doesn't have an installation
        // ID. This is the one case where we want to merge with the existing
        // object.
        const delQuery = {
          objectId: idMatch.objectId
        };
        return this.config.database.destroy('_Installation', delQuery).then(() => {
          return deviceTokenMatches[0]['objectId'];
        }).catch(err => {
          if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
            // no deletions were made. Can be ignored
            return;
          } // rethrow the error


          throw err;
        });
      } else {
        if (this.data.deviceToken && idMatch.deviceToken != this.data.deviceToken) {
          // We're setting the device token on an existing installation, so
          // we should try cleaning out old installations that match this
          // device token.
          const delQuery = {
            deviceToken: this.data.deviceToken
          }; // We have a unique install Id, use that to preserve
          // the interesting installation

          if (this.data.installationId) {
            delQuery['installationId'] = {
              $ne: this.data.installationId
            };
          } else if (idMatch.objectId && this.data.objectId && idMatch.objectId == this.data.objectId) {
            // we passed an objectId, preserve that instalation
            delQuery['objectId'] = {
              $ne: idMatch.objectId
            };
          } else {
            // What to do here? can't really clean up everything...
            return idMatch.objectId;
          }

          if (this.data.appIdentifier) {
            delQuery['appIdentifier'] = this.data.appIdentifier;
          }

          this.config.database.destroy('_Installation', delQuery).catch(err => {
            if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
              // no deletions were made. Can be ignored.
              return;
            } // rethrow the error


            throw err;
          });
        } // In non-merge scenarios, just return the installation match id


        return idMatch.objectId;
      }
    }
  }).then(objId => {
    if (objId) {
      this.query = {
        objectId: objId
      };
      delete this.data.objectId;
      delete this.data.createdAt;
    } // TODO: Validate ops (add/remove on channels, $inc on badge, etc.)

  });
  return promise;
}; // If we short-circuted the object response - then we need to make sure we expand all the files,
// since this might not have a query, meaning it won't return the full result back.
// TODO: (nlutsenko) This should die when we move to per-class based controllers on _Session/_User


RestWrite.prototype.expandFilesForExistingObjects = function () {
  // Check whether we have a short-circuited response - only then run expansion.
  if (this.response && this.response.response) {
    this.config.filesController.expandFilesInObject(this.config, this.response.response);
  }
};

RestWrite.prototype.runDatabaseOperation = function () {
  if (this.response) {
    return;
  }

  if (this.className === '_Role') {
    this.config.cacheController.role.clear();
  }

  if (this.className === '_User' && this.query && this.auth.isUnauthenticated()) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, `Cannot modify user ${this.query.objectId}.`);
  }

  if (this.className === '_Product' && this.data.download) {
    this.data.downloadName = this.data.download.name;
  } // TODO: Add better detection for ACL, ensuring a user can't be locked from
  //       their own user record.


  if (this.data.ACL && this.data.ACL['*unresolved']) {
    throw new Parse.Error(Parse.Error.INVALID_ACL, 'Invalid ACL.');
  }

  if (this.query) {
    // Force the user to not lockout
    // Matched with parse.com
    if (this.className === '_User' && this.data.ACL && this.auth.isMaster !== true) {
      this.data.ACL[this.query.objectId] = {
        read: true,
        write: true
      };
    } // update password timestamp if user password is being changed


    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
      this.data._password_changed_at = Parse._encode(new Date());
    } // Ignore createdAt when update


    delete this.data.createdAt;
    let defer = Promise.resolve(); // if password history is enabled then save the current password to history

    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordHistory) {
      defer = this.config.database.find('_User', {
        objectId: this.objectId()
      }, {
        keys: ['_password_history', '_hashed_password']
      }).then(results => {
        if (results.length != 1) {
          throw undefined;
        }

        const user = results[0];
        let oldPasswords = [];

        if (user._password_history) {
          oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory);
        } //n-1 passwords go into history including last password


        while (oldPasswords.length > Math.max(0, this.config.passwordPolicy.maxPasswordHistory - 2)) {
          oldPasswords.shift();
        }

        oldPasswords.push(user.password);
        this.data._password_history = oldPasswords;
      });
    }

    return defer.then(() => {
      // Run an update
      return this.config.database.update(this.className, this.query, this.data, this.runOptions, false, false, this.validSchemaController).then(response => {
        response.updatedAt = this.updatedAt;

        this._updateResponseWithData(response, this.data);

        this.response = {
          response
        };
      });
    });
  } else {
    // Set the default ACL and password timestamp for the new _User
    if (this.className === '_User') {
      var ACL = this.data.ACL; // default public r/w ACL

      if (!ACL) {
        ACL = {};
        ACL['*'] = {
          read: true,
          write: false
        };
      } // make sure the user is not locked down


      ACL[this.data.objectId] = {
        read: true,
        write: true
      };
      this.data.ACL = ACL; // password timestamp to be used when password expiry policy is enforced

      if (this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
        this.data._password_changed_at = Parse._encode(new Date());
      }
    } // Run a create


    return this.config.database.create(this.className, this.data, this.runOptions, false, this.validSchemaController).catch(error => {
      if (this.className !== '_User' || error.code !== Parse.Error.DUPLICATE_VALUE) {
        throw error;
      } // Quick check, if we were able to infer the duplicated field name


      if (error && error.userInfo && error.userInfo.duplicated_field === 'username') {
        throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
      }

      if (error && error.userInfo && error.userInfo.duplicated_field === 'email') {
        throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
      } // If this was a failed user creation due to username or email already taken, we need to
      // check whether it was username or email and return the appropriate error.
      // Fallback to the original method
      // TODO: See if we can later do this without additional queries by using named indexes.


      return this.config.database.find(this.className, {
        username: this.data.username,
        objectId: {
          $ne: this.objectId()
        }
      }, {
        limit: 1
      }).then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
        }

        return this.config.database.find(this.className, {
          email: this.data.email,
          objectId: {
            $ne: this.objectId()
          }
        }, {
          limit: 1
        });
      }).then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
        }

        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      });
    }).then(response => {
      response.objectId = this.data.objectId;
      response.createdAt = this.data.createdAt;

      if (this.responseShouldHaveUsername) {
        response.username = this.data.username;
      }

      this._updateResponseWithData(response, this.data);

      this.response = {
        status: 201,
        response,
        location: this.location()
      };
    });
  }
}; // Returns nothing - doesn't wait for the trigger.


RestWrite.prototype.runAfterSaveTrigger = function () {
  if (!this.response || !this.response.response) {
    return;
  } // Avoid doing any setup for triggers if there is no 'afterSave' trigger for this class.


  const hasAfterSaveHook = triggers.triggerExists(this.className, triggers.Types.afterSave, this.config.applicationId);
  const hasLiveQuery = this.config.liveQueryController.hasLiveQuery(this.className);

  if (!hasAfterSaveHook && !hasLiveQuery) {
    return Promise.resolve();
  }

  var extraData = {
    className: this.className
  };

  if (this.query && this.query.objectId) {
    extraData.objectId = this.query.objectId;
  } // Build the original object, we only do this for a update write.


  let originalObject;

  if (this.query && this.query.objectId) {
    originalObject = triggers.inflate(extraData, this.originalData);
  } // Build the inflated object, different from beforeSave, originalData is not empty
  // since developers can change data in the beforeSave.


  const updatedObject = this.buildUpdatedObject(extraData);

  updatedObject._handleSaveResponse(this.response.response, this.response.status || 200);

  this.config.database.loadSchema().then(schemaController => {
    // Notifiy LiveQueryServer if possible
    const perms = schemaController.getClassLevelPermissions(updatedObject.className);
    this.config.liveQueryController.onAfterSave(updatedObject.className, updatedObject, originalObject, perms);
  }); // Run afterSave trigger

  return triggers.maybeRunTrigger(triggers.Types.afterSave, this.auth, updatedObject, originalObject, this.config, this.context).then(result => {
    if (result && typeof result === 'object') {
      this.response.response = result;
    }
  }).catch(function (err) {
    _logger.default.warn('afterSave caught an error', err);
  });
}; // A helper to figure out what location this operation happens at.


RestWrite.prototype.location = function () {
  var middle = this.className === '_User' ? '/users/' : '/classes/' + this.className + '/';
  return this.config.mount + middle + this.data.objectId;
}; // A helper to get the object id for this operation.
// Because it could be either on the query or on the data


RestWrite.prototype.objectId = function () {
  return this.data.objectId || this.query.objectId;
}; // Returns a copy of the data and delete bad keys (_auth_data, _hashed_password...)


RestWrite.prototype.sanitizedData = function () {
  const data = Object.keys(this.data).reduce((data, key) => {
    // Regexp comes from Parse.Object.prototype.validate
    if (!/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
      delete data[key];
    }

    return data;
  }, deepcopy(this.data));
  return Parse._decode(undefined, data);
}; // Returns an updated copy of the object


RestWrite.prototype.buildUpdatedObject = function (extraData) {
  const updatedObject = triggers.inflate(extraData, this.originalData);
  Object.keys(this.data).reduce(function (data, key) {
    if (key.indexOf('.') > 0) {
      // subdocument key with dot notation ('x.y':v => 'x':{'y':v})
      const splittedKey = key.split('.');
      const parentProp = splittedKey[0];
      let parentVal = updatedObject.get(parentProp);

      if (typeof parentVal !== 'object') {
        parentVal = {};
      }

      parentVal[splittedKey[1]] = data[key];
      updatedObject.set(parentProp, parentVal);
      delete data[key];
    }

    return data;
  }, deepcopy(this.data));
  updatedObject.set(this.sanitizedData());
  return updatedObject;
};

RestWrite.prototype.cleanUserAuthData = function () {
  if (this.response && this.response.response && this.className === '_User') {
    const user = this.response.response;

    if (user.authData) {
      Object.keys(user.authData).forEach(provider => {
        if (user.authData[provider] === null) {
          delete user.authData[provider];
        }
      });

      if (Object.keys(user.authData).length == 0) {
        delete user.authData;
      }
    }
  }
};

RestWrite.prototype._updateResponseWithData = function (response, data) {
  if (_lodash.default.isEmpty(this.storage.fieldsChangedByTrigger)) {
    return response;
  }

  const clientSupportsDelete = ClientSDK.supportsForwardDelete(this.clientSDK);
  this.storage.fieldsChangedByTrigger.forEach(fieldName => {
    const dataValue = data[fieldName];

    if (!Object.prototype.hasOwnProperty.call(response, fieldName)) {
      response[fieldName] = dataValue;
    } // Strips operations from responses


    if (response[fieldName] && response[fieldName].__op) {
      delete response[fieldName];

      if (clientSupportsDelete && dataValue.__op == 'Delete') {
        response[fieldName] = dataValue;
      }
    }
  });
  return response;
};

var _default = RestWrite;
exports.default = _default;
module.exports = RestWrite;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJkZWVwY29weSIsIkF1dGgiLCJjcnlwdG9VdGlscyIsInBhc3N3b3JkQ3J5cHRvIiwiUGFyc2UiLCJ0cmlnZ2VycyIsIkNsaWVudFNESyIsIlJlc3RXcml0ZSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJxdWVyeSIsImRhdGEiLCJvcmlnaW5hbERhdGEiLCJjbGllbnRTREsiLCJhY3Rpb24iLCJpc1JlYWRPbmx5IiwiRXJyb3IiLCJPUEVSQVRJT05fRk9SQklEREVOIiwic3RvcmFnZSIsInJ1bk9wdGlvbnMiLCJjb250ZXh0IiwiX2NvbnRleHQiLCJPYmplY3QiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwib2JqZWN0SWQiLCJNSVNTSU5HX09CSkVDVF9JRCIsIklOVkFMSURfS0VZX05BTUUiLCJpZCIsInJlc3BvbnNlIiwidXBkYXRlZEF0IiwiX2VuY29kZSIsIkRhdGUiLCJpc28iLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJleGVjdXRlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJoYW5kbGVJbnN0YWxsYXRpb24iLCJoYW5kbGVTZXNzaW9uIiwidmFsaWRhdGVBdXRoRGF0YSIsInJ1bkJlZm9yZVNhdmVUcmlnZ2VyIiwiZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQiLCJ2YWxpZGF0ZVNjaGVtYSIsInNjaGVtYUNvbnRyb2xsZXIiLCJzZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkIiwidHJhbnNmb3JtVXNlciIsImV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzIiwiZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyIsInJ1bkRhdGFiYXNlT3BlcmF0aW9uIiwiY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQiLCJoYW5kbGVGb2xsb3d1cCIsInJ1bkFmdGVyU2F2ZVRyaWdnZXIiLCJjbGVhblVzZXJBdXRoRGF0YSIsImlzTWFzdGVyIiwiYWNsIiwidXNlciIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwiY29uY2F0IiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImluZGV4T2YiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJoYXNDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYmVmb3JlU2F2ZSIsImFwcGxpY2F0aW9uSWQiLCJleHRyYURhdGEiLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFVwZGF0ZWRPYmplY3QiLCJpbmZsYXRlIiwiZGF0YWJhc2VQcm9taXNlIiwidXBkYXRlIiwiY3JlYXRlIiwicmVzdWx0IiwibGVuZ3RoIiwiT0JKRUNUX05PVF9GT1VORCIsIm1heWJlUnVuVHJpZ2dlciIsIm9iamVjdCIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJfIiwicmVkdWNlIiwidmFsdWUiLCJrZXkiLCJpc0VxdWFsIiwicHVzaCIsInJ1bkJlZm9yZUxvZ2luVHJpZ2dlciIsInVzZXJEYXRhIiwiYmVmb3JlTG9naW4iLCJnZXRBbGxDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsInNjaGVtYSIsImZpbmQiLCJvbmVDbGFzcyIsInNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCIsImZpZWxkTmFtZSIsInNldERlZmF1bHQiLCJ1bmRlZmluZWQiLCJfX29wIiwiZmllbGRzIiwiZGVmYXVsdFZhbHVlIiwicmVxdWlyZWQiLCJWQUxJREFUSU9OX0VSUk9SIiwiY3JlYXRlZEF0IiwibmV3T2JqZWN0SWQiLCJvYmplY3RJZFNpemUiLCJrZXlzIiwiZm9yRWFjaCIsImF1dGhEYXRhIiwidXNlcm5hbWUiLCJpc0VtcHR5IiwiVVNFUk5BTUVfTUlTU0lORyIsInBhc3N3b3JkIiwiUEFTU1dPUkRfTUlTU0lORyIsIlVOU1VQUE9SVEVEX1NFUlZJQ0UiLCJwcm92aWRlcnMiLCJjYW5IYW5kbGVBdXRoRGF0YSIsImNhbkhhbmRsZSIsInByb3ZpZGVyIiwicHJvdmlkZXJBdXRoRGF0YSIsImhhc1Rva2VuIiwiaGFuZGxlQXV0aERhdGEiLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJ2YWxpZGF0aW9ucyIsIm1hcCIsImF1dGhEYXRhTWFuYWdlciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwiYWxsIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwibWVtbyIsInF1ZXJ5S2V5IiwiZmlsdGVyIiwicSIsImZpbmRQcm9taXNlIiwiJG9yIiwiZmlsdGVyZWRPYmplY3RzQnlBQ0wiLCJvYmplY3RzIiwiQUNMIiwicmVzdWx0cyIsInIiLCJqb2luIiwidXNlclJlc3VsdCIsIm11dGF0ZWRBdXRoRGF0YSIsInByb3ZpZGVyRGF0YSIsInVzZXJBdXRoRGF0YSIsImhhc011dGF0ZWRBdXRoRGF0YSIsInVzZXJJZCIsImxvY2F0aW9uIiwiQUNDT1VOVF9BTFJFQURZX0xJTktFRCIsInByb21pc2UiLCJlcnJvciIsIlJlc3RRdWVyeSIsIm1hc3RlciIsIl9fdHlwZSIsInNlc3Npb24iLCJjYWNoZUNvbnRyb2xsZXIiLCJkZWwiLCJzZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVQYXNzd29yZFBvbGljeSIsImhhc2giLCJoYXNoZWRQYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfdmFsaWRhdGVVc2VyTmFtZSIsIl92YWxpZGF0ZUVtYWlsIiwicmFuZG9tU3RyaW5nIiwicmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUiLCIkbmUiLCJsaW1pdCIsImNhc2VJbnNlbnNpdGl2ZSIsIlVTRVJOQU1FX1RBS0VOIiwiZW1haWwiLCJtYXRjaCIsInJlamVjdCIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsIkVNQUlMX1RBS0VOIiwidXNlckNvbnRyb2xsZXIiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwicGFzc3dvcmRQb2xpY3kiLCJfdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cyIsIl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSIsInBvbGljeUVycm9yIiwidmFsaWRhdGlvbkVycm9yIiwiY29udGFpbnNVc2VybmFtZUVycm9yIiwicGF0dGVyblZhbGlkYXRvciIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5Iiwib2xkUGFzc3dvcmRzIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJ0YWtlIiwibmV3UGFzc3dvcmQiLCJwcm9taXNlcyIsImNvbXBhcmUiLCJjYXRjaCIsImVyciIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJ2ZXJpZnlVc2VyRW1haWxzIiwiY3JlYXRlU2Vzc2lvblRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJjcmVhdGVkV2l0aCIsImF1dGhQcm92aWRlciIsImFkZE9wcyIsIl9wZXJpc2hhYmxlX3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCIsImFzc2lnbiIsImRlc3Ryb3kiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0Iiwic2Vzc2lvblF1ZXJ5IiwiYmluZCIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsImFkZGl0aW9uYWxTZXNzaW9uRGF0YSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInN0YXR1cyIsImRldmljZVRva2VuIiwidG9Mb3dlckNhc2UiLCJkZXZpY2VUeXBlIiwiaWRNYXRjaCIsIm9iamVjdElkTWF0Y2giLCJpbnN0YWxsYXRpb25JZE1hdGNoIiwiZGV2aWNlVG9rZW5NYXRjaGVzIiwib3JRdWVyaWVzIiwiZGVsUXVlcnkiLCJhcHBJZGVudGlmaWVyIiwiY29kZSIsIm9iaklkIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsInJvbGUiLCJjbGVhciIsImlzVW5hdXRoZW50aWNhdGVkIiwiU0VTU0lPTl9NSVNTSU5HIiwiZG93bmxvYWQiLCJkb3dubG9hZE5hbWUiLCJuYW1lIiwiSU5WQUxJRF9BQ0wiLCJyZWFkIiwid3JpdGUiLCJtYXhQYXNzd29yZEFnZSIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiZGVmZXIiLCJNYXRoIiwibWF4Iiwic2hpZnQiLCJfdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSIsIkRVUExJQ0FURV9WQUxVRSIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImhhc0FmdGVyU2F2ZUhvb2siLCJhZnRlclNhdmUiLCJoYXNMaXZlUXVlcnkiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiX2hhbmRsZVNhdmVSZXNwb25zZSIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwib25BZnRlclNhdmUiLCJsb2dnZXIiLCJ3YXJuIiwibWlkZGxlIiwibW91bnQiLCJzYW5pdGl6ZWREYXRhIiwidGVzdCIsIl9kZWNvZGUiLCJzcGxpdHRlZEtleSIsInNwbGl0IiwicGFyZW50UHJvcCIsInBhcmVudFZhbCIsImdldCIsInNldCIsImNsaWVudFN1cHBvcnRzRGVsZXRlIiwic3VwcG9ydHNGb3J3YXJkRGVsZXRlIiwiZGF0YVZhbHVlIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQWFBOztBQUNBOztBQUNBOzs7O0FBZkE7QUFDQTtBQUNBO0FBRUEsSUFBSUEsZ0JBQWdCLEdBQUdDLE9BQU8sQ0FBQyxnQ0FBRCxDQUE5Qjs7QUFDQSxJQUFJQyxRQUFRLEdBQUdELE9BQU8sQ0FBQyxVQUFELENBQXRCOztBQUVBLE1BQU1FLElBQUksR0FBR0YsT0FBTyxDQUFDLFFBQUQsQ0FBcEI7O0FBQ0EsSUFBSUcsV0FBVyxHQUFHSCxPQUFPLENBQUMsZUFBRCxDQUF6Qjs7QUFDQSxJQUFJSSxjQUFjLEdBQUdKLE9BQU8sQ0FBQyxZQUFELENBQTVCOztBQUNBLElBQUlLLEtBQUssR0FBR0wsT0FBTyxDQUFDLFlB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QUFxRDtBQUNuRCxhQUFPN0UsUUFBUSxDQUFDMEUsU0FBRCxDQUFmOztBQUNBLFVBQUlnTCxvQkFBb0IsSUFBSUUsU0FBUyxDQUFDL0ssSUFBVixJQUFrQixRQUE5QyxFQUF3RDtBQUN0RDdFLFFBQUFBLFFBQVEsQ0FBQzBFLFNBQUQsQ0FBUixHQUFzQmtMLFNBQXRCO0FBQ0Q7QUFDRjtBQUNGLEdBZEQ7QUFlQSxTQUFPNVAsUUFBUDtBQUNELENBckJEOztlQXVCZXpCLFM7O0FBQ2ZzUixNQUFNLENBQUNDLE9BQVAsR0FBaUJ2UixTQUFqQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEEgUmVzdFdyaXRlIGVuY2Fwc3VsYXRlcyBldmVyeXRoaW5nIHdlIG5lZWQgdG8gcnVuIGFuIG9wZXJhdGlvblxuLy8gdGhhdCB3cml0ZXMgdG8gdGhlIGRhdGFiYXNlLlxuLy8gVGhpcyBjb3VsZCBiZSBlaXRoZXIgYSBcImNyZWF0ZVwiIG9yIGFuIFwidXBkYXRlXCIuXG5cbnZhciBTY2hlbWFDb250cm9sbGVyID0gcmVxdWlyZSgnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJyk7XG52YXIgZGVlcGNvcHkgPSByZXF1aXJlKCdkZWVwY29weScpO1xuXG5jb25zdCBBdXRoID0gcmVxdWlyZSgnLi9BdXRoJyk7XG52YXIgY3J5cHRvVXRpbHMgPSByZXF1aXJlKCcuL2NyeXB0b1V0aWxzJyk7XG52YXIgcGFzc3dvcmRDcnlwdG8gPSByZXF1aXJlKCcuL3Bhc3N3b3JkJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG52YXIgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG52YXIgQ2xpZW50U0RLID0gcmVxdWlyZSgnLi9DbGllbnRTREsnKTtcbmltcG9ydCBSZXN0UXVlcnkgZnJvbSAnLi9SZXN0UXVlcnknO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi9sb2dnZXInO1xuXG4vLyBxdWVyeSBhbmQgZGF0YSBhcmUgYm90aCBwcm92aWRlZCBpbiBSRVNUIEFQSSBmb3JtYXQuIFNvIGRhdGFcbi8vIHR5cGVzIGFyZSBlbmNvZGVkIGJ5IHBsYWluIG9sZCBvYmplY3RzLlxuLy8gSWYgcXVlcnkgaXMgbnVsbCwgdGhpcyBpcyBhIFwiY3JlYXRlXCIgYW5kIHRoZSBkYXRhIGluIGRhdGEgc2hvdWxkIGJlXG4vLyBjcmVhdGVkLlxuLy8gT3RoZXJ3aXNlIHRoaXMgaXMgYW4gXCJ1cGRhdGVcIiAtIHRoZSBvYmplY3QgbWF0Y2hpbmcgdGhlIHF1ZXJ5XG4vLyBzaG91bGQgZ2V0IHVwZGF0ZWQgd2l0aCBkYXRhLlxuLy8gUmVzdFdyaXRlIHdpbGwgaGFuZGxlIG9iamVjdElkLCBjcmVhdGVkQXQsIGFuZCB1cGRhdGVkQXQgZm9yXG4vLyBldmVyeXRoaW5nLiBJdCBhbHNvIGtub3dzIHRvIHVzZSB0cmlnZ2VycyBhbmQgc3BlY2lhbCBtb2RpZmljYXRpb25zXG4vLyBmb3IgdGhlIF9Vc2VyIGNsYXNzLlxuZnVuY3Rpb24gUmVzdFdyaXRlKFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgcXVlcnksXG4gIGRhdGEsXG4gIG9yaWdpbmFsRGF0YSxcbiAgY2xpZW50U0RLLFxuICBhY3Rpb25cbikge1xuICBpZiAoYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICdDYW5ub3QgcGVyZm9ybSBhIHdyaXRlIG9wZXJhdGlvbiB3aGVuIHVzaW5nIHJlYWRPbmx5TWFzdGVyS2V5J1xuICAgICk7XG4gIH1cbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuYXV0aCA9IGF1dGg7XG4gIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB0aGlzLmNsaWVudFNESyA9IGNsaWVudFNESztcbiAgdGhpcy5zdG9yYWdlID0ge307XG4gIHRoaXMucnVuT3B0aW9ucyA9IHt9O1xuICB0aGlzLmNvbnRleHQgPSB7fTtcblxuICBpZiAoYWN0aW9uKSB7XG4gICAgdGhpcy5ydW5PcHRpb25zLmFjdGlvbiA9IGFjdGlvbjtcbiAgfVxuXG4gIGlmICghcXVlcnkpIHtcbiAgICAvLyBQYXJzZSBjb250ZXh0XG4gICAgaWYgKGRhdGEuX2NvbnRleHQgJiYgZGF0YS5fY29udGV4dCBpbnN0YW5jZW9mIE9iamVjdCkge1xuICAgICAgdGhpcy5jb250ZXh0ID0gZGF0YS5fY29udGV4dDtcbiAgICAgIGRlbGV0ZSBkYXRhLl9jb250ZXh0O1xuICAgIH1cbiAgICBpZiAodGhpcy5jb25maWcuYWxsb3dDdXN0b21PYmplY3RJZCkge1xuICAgICAgaWYgKFxuICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZGF0YSwgJ29iamVjdElkJykgJiZcbiAgICAgICAgIWRhdGEub2JqZWN0SWRcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuTUlTU0lOR19PQkpFQ1RfSUQsXG4gICAgICAgICAgJ29iamVjdElkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsIG9yIHVuZGVmaW5lZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgJ29iamVjdElkIGlzIGFuIGludmFsaWQgZmllbGQgbmFtZS4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZGF0YS5pZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAnaWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBXaGVuIHRoZSBvcGVyYXRpb24gaXMgY29tcGxldGUsIHRoaXMucmVzcG9uc2UgbWF5IGhhdmUgc2V2ZXJhbFxuICAvLyBmaWVsZHMuXG4gIC8vIHJlc3BvbnNlOiB0aGUgYWN0dWFsIGRhdGEgdG8gYmUgcmV0dXJuZWRcbiAgLy8gc3RhdHVzOiB0aGUgaHR0cCBzdGF0dXMgY29kZS4gaWYgbm90IHByZXNlbnQsIHRyZWF0ZWQgbGlrZSBhIDIwMFxuICAvLyBsb2NhdGlvbjogdGhlIGxvY2F0aW9uIGhlYWRlci4gaWYgbm90IHByZXNlbnQsIG5vIGxvY2F0aW9uIGhlYWRlclxuICB0aGlzLnJlc3BvbnNlID0gbnVsbDtcblxuICAvLyBQcm9jZXNzaW5nIHRoaXMgb3BlcmF0aW9uIG1heSBtdXRhdGUgb3VyIGRhdGEsIHNvIHdlIG9wZXJhdGUgb24gYVxuICAvLyBjb3B5XG4gIHRoaXMucXVlcnkgPSBkZWVwY29weShxdWVyeSk7XG4gIHRoaXMuZGF0YSA9IGRlZXBjb3B5KGRhdGEpO1xuICAvLyBXZSBuZXZlciBjaGFuZ2Ugb3JpZ2luYWxEYXRhLCBzbyB3ZSBkbyBub3QgbmVlZCBhIGRlZXAgY29weVxuICB0aGlzLm9yaWdpbmFsRGF0YSA9IG9yaWdpbmFsRGF0YTtcblxuICAvLyBUaGUgdGltZXN0YW1wIHdlJ2xsIHVzZSBmb3IgdGhpcyB3aG9sZSBvcGVyYXRpb25cbiAgdGhpcy51cGRhdGVkQXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpLmlzbztcblxuICAvLyBTaGFyZWQgU2NoZW1hQ29udHJvbGxlciB0byBiZSByZXVzZWQgdG8gcmVkdWNlIHRoZSBudW1iZXIgb2YgbG9hZFNjaGVtYSgpIGNhbGxzIHBlciByZXF1ZXN0XG4gIC8vIE9uY2Ugc2V0IHRoZSBzY2hlbWFEYXRhIHNob3VsZCBiZSBpbW11dGFibGVcbiAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIgPSBudWxsO1xufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIHRoZVxuLy8gd3JpdGUsIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEge3Jlc3BvbnNlLCBzdGF0dXMsIGxvY2F0aW9ufSBvYmplY3QuXG4vLyBzdGF0dXMgYW5kIGxvY2F0aW9uIGFyZSBvcHRpb25hbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRVc2VyQW5kUm9sZUFDTCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbnN0YWxsYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVNlc3Npb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkJlZm9yZVNhdmVUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5kZWxldGVFbWFpbFJlc2V0VG9rZW5JZk5lZWRlZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVTY2hlbWEoKTtcbiAgICB9KVxuICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIgPSBzY2hlbWFDb250cm9sbGVyO1xuICAgICAgcmV0dXJuIHRoaXMuc2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudHJhbnNmb3JtVXNlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkRhdGFiYXNlT3BlcmF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRm9sbG93dXAoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkFmdGVyU2F2ZVRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNsZWFuVXNlckF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXNwb25zZTtcbiAgICB9KTtcbn07XG5cbi8vIFVzZXMgdGhlIEF1dGggb2JqZWN0IHRvIGdldCB0aGUgbGlzdCBvZiByb2xlcywgYWRkcyB0aGUgdXNlciBpZFxuUmVzdFdyaXRlLnByb3RvdHlwZS5nZXRVc2VyQW5kUm9sZUFDTCA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5ydW5PcHRpb25zLmFjbCA9IFsnKiddO1xuXG4gIGlmICh0aGlzLmF1dGgudXNlcikge1xuICAgIHJldHVybiB0aGlzLmF1dGguZ2V0VXNlclJvbGVzKCkudGhlbihyb2xlcyA9PiB7XG4gICAgICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gdGhpcy5ydW5PcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFtcbiAgICAgICAgdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICBdKTtcbiAgICAgIHJldHVybjtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gY29uZmlnLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24gPSBmdW5jdGlvbigpIHtcbiAgaWYgKFxuICAgIHRoaXMuY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgU2NoZW1hQ29udHJvbGxlci5zeXN0ZW1DbGFzc2VzLmluZGV4T2YodGhpcy5jbGFzc05hbWUpID09PSAtMVxuICApIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5oYXNDbGFzcyh0aGlzLmNsYXNzTmFtZSkpXG4gICAgICAudGhlbihoYXNDbGFzcyA9PiB7XG4gICAgICAgIGlmIChoYXNDbGFzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAnVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2VzcyAnICtcbiAgICAgICAgICAgICAgJ25vbi1leGlzdGVudCBjbGFzczogJyArXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgc2NoZW1hLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZVNjaGVtYSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudmFsaWRhdGVPYmplY3QoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdGhpcy5kYXRhLFxuICAgIHRoaXMucXVlcnksXG4gICAgdGhpcy5ydW5PcHRpb25zXG4gICk7XG59O1xuXG4vLyBSdW5zIGFueSBiZWZvcmVTYXZlIHRyaWdnZXJzIGFnYWluc3QgdGhpcyBvcGVyYXRpb24uXG4vLyBBbnkgY2hhbmdlIGxlYWRzIHRvIG91ciBkYXRhIGJlaW5nIG11dGF0ZWQuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZVNhdmVUcmlnZ2VyID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLFxuICAgICAgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZFxuICAgIClcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gQ2xvdWQgY29kZSBnZXRzIGEgYml0IG9mIGV4dHJhIGRhdGEgZm9yIGl0cyBvYmplY3RzXG4gIHZhciBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUgfTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIGV4dHJhRGF0YS5vYmplY3RJZCA9IHRoaXMucXVlcnkub2JqZWN0SWQ7XG4gIH1cblxuICBsZXQgb3JpZ2luYWxPYmplY3QgPSBudWxsO1xuICBjb25zdCB1cGRhdGVkT2JqZWN0ID0gdGhpcy5idWlsZFVwZGF0ZWRPYmplY3QoZXh0cmFEYXRhKTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIC8vIFRoaXMgaXMgYW4gdXBkYXRlIGZvciBleGlzdGluZyBvYmplY3QuXG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gQmVmb3JlIGNhbGxpbmcgdGhlIHRyaWdnZXIsIHZhbGlkYXRlIHRoZSBwZXJtaXNzaW9ucyBmb3IgdGhlIHNhdmUgb3BlcmF0aW9uXG4gICAgICBsZXQgZGF0YWJhc2VQcm9taXNlID0gbnVsbDtcbiAgICAgIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIGZvciB1cGRhdGluZ1xuICAgICAgICBkYXRhYmFzZVByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIGZvciBjcmVhdGluZ1xuICAgICAgICBkYXRhYmFzZVByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS5jcmVhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBJbiB0aGUgY2FzZSB0aGF0IHRoZXJlIGlzIG5vIHBlcm1pc3Npb24gZm9yIHRoZSBvcGVyYXRpb24sIGl0IHRocm93cyBhbiBlcnJvclxuICAgICAgcmV0dXJuIGRhdGFiYXNlUHJvbWlzZS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5sZW5ndGggPD0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLFxuICAgICAgICB0aGlzLmF1dGgsXG4gICAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgICB0aGlzLmNvbmZpZyxcbiAgICAgICAgdGhpcy5jb250ZXh0XG4gICAgICApO1xuICAgIH0pXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9iamVjdCkge1xuICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9IF8ucmVkdWNlKFxuICAgICAgICAgIHJlc3BvbnNlLm9iamVjdCxcbiAgICAgICAgICAocmVzdWx0LCB2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgICAgICBpZiAoIV8uaXNFcXVhbCh0aGlzLmRhdGFba2V5XSwgdmFsdWUpKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0sXG4gICAgICAgICAgW11cbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kYXRhID0gcmVzcG9uc2Uub2JqZWN0O1xuICAgICAgICAvLyBXZSBzaG91bGQgZGVsZXRlIHRoZSBvYmplY3RJZCBmb3IgYW4gdXBkYXRlIHdyaXRlXG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlciA9IGFzeW5jIGZ1bmN0aW9uKHVzZXJEYXRhKSB7XG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZUxvZ2luJyB0cmlnZ2VyXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyhcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICAgKVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBDbG91ZCBjb2RlIGdldHMgYSBiaXQgb2YgZXh0cmEgZGF0YSBmb3IgaXRzIG9iamVjdHNcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG4gIGNvbnN0IHVzZXIgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdXNlckRhdGEpO1xuXG4gIC8vIG5vIG5lZWQgdG8gcmV0dXJuIGEgcmVzcG9uc2VcbiAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLFxuICAgIHRoaXMuYXV0aCxcbiAgICB1c2VyLFxuICAgIG51bGwsXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5jb250ZXh0XG4gICk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQgPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMuZGF0YSkge1xuICAgIHJldHVybiB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlci5nZXRBbGxDbGFzc2VzKCkudGhlbihhbGxDbGFzc2VzID0+IHtcbiAgICAgIGNvbnN0IHNjaGVtYSA9IGFsbENsYXNzZXMuZmluZChcbiAgICAgICAgb25lQ2xhc3MgPT4gb25lQ2xhc3MuY2xhc3NOYW1lID09PSB0aGlzLmNsYXNzTmFtZVxuICAgICAgKTtcbiAgICAgIGNvbnN0IHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCA9IChmaWVsZE5hbWUsIHNldERlZmF1bHQpID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gbnVsbCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnJyB8fFxuICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgc2V0RGVmYXVsdCAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSBudWxsICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgICAgICh0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlO1xuICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPVxuICAgICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciB8fCBbXTtcbiAgICAgICAgICAgIGlmICh0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5pbmRleE9mKGZpZWxkTmFtZSkgPCAwKSB7XG4gICAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0ucmVxdWlyZWQgPT09IHRydWVcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICAgICAgYCR7ZmllbGROYW1lfSBpcyByZXF1aXJlZGBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICAvLyBBZGQgZGVmYXVsdCBmaWVsZHNcbiAgICAgIHRoaXMuZGF0YS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG5cbiAgICAgICAgLy8gT25seSBhc3NpZ24gbmV3IG9iamVjdElkIGlmIHdlIGFyZSBjcmVhdGluZyBuZXcgb2JqZWN0XG4gICAgICAgIGlmICghdGhpcy5kYXRhLm9iamVjdElkKSB7XG4gICAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkID0gY3J5cHRvVXRpbHMubmV3T2JqZWN0SWQoXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5vYmplY3RJZFNpemVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCB0cnVlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChzY2hlbWEpIHtcbiAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkKGZpZWxkTmFtZSwgZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG4vLyBUcmFuc2Zvcm1zIGF1dGggZGF0YSBmb3IgYSB1c2VyIG9iamVjdC5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGEgdXNlciBvYmplY3QuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hlbiB3ZSdyZSBkb25lIGlmIGl0IGNhbid0IGZpbmlzaCB0aGlzIHRpY2suXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQXV0aERhdGEgPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICBpZiAoXG4gICAgICB0eXBlb2YgdGhpcy5kYXRhLnVzZXJuYW1lICE9PSAnc3RyaW5nJyB8fFxuICAgICAgXy5pc0VtcHR5KHRoaXMuZGF0YS51c2VybmFtZSlcbiAgICApIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORyxcbiAgICAgICAgJ2JhZCBvciBtaXNzaW5nIHVzZXJuYW1lJ1xuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHRoaXMuZGF0YS5wYXNzd29yZCAhPT0gJ3N0cmluZycgfHxcbiAgICAgIF8uaXNFbXB0eSh0aGlzLmRhdGEucGFzc3dvcmQpXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsXG4gICAgICAgICdwYXNzd29yZCBpcyByZXF1aXJlZCdcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgaWYgKFxuICAgICh0aGlzLmRhdGEuYXV0aERhdGEgJiYgIU9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoKSB8fFxuICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKVxuICApIHtcbiAgICAvLyBIYW5kbGUgc2F2aW5nIGF1dGhEYXRhIHRvIHt9IG9yIGlmIGF1dGhEYXRhIGRvZXNuJ3QgZXhpc3RcbiAgICByZXR1cm47XG4gIH0gZWxzZSBpZiAoXG4gICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuZGF0YSwgJ2F1dGhEYXRhJykgJiZcbiAgICAhdGhpcy5kYXRhLmF1dGhEYXRhXG4gICkge1xuICAgIC8vIEhhbmRsZSBzYXZpbmcgYXV0aERhdGEgdG8gbnVsbFxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICk7XG4gIH1cblxuICB2YXIgYXV0aERhdGEgPSB0aGlzLmRhdGEuYXV0aERhdGE7XG4gIHZhciBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGlmIChwcm92aWRlcnMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNhbkhhbmRsZUF1dGhEYXRhID0gcHJvdmlkZXJzLnJlZHVjZSgoY2FuSGFuZGxlLCBwcm92aWRlcikgPT4ge1xuICAgICAgdmFyIHByb3ZpZGVyQXV0aERhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB2YXIgaGFzVG9rZW4gPSBwcm92aWRlckF1dGhEYXRhICYmIHByb3ZpZGVyQXV0aERhdGEuaWQ7XG4gICAgICByZXR1cm4gY2FuSGFuZGxlICYmIChoYXNUb2tlbiB8fCBwcm92aWRlckF1dGhEYXRhID09IG51bGwpO1xuICAgIH0sIHRydWUpO1xuICAgIGlmIChjYW5IYW5kbGVBdXRoRGF0YSkge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGEoYXV0aERhdGEpO1xuICAgIH1cbiAgfVxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24gPSBmdW5jdGlvbihhdXRoRGF0YSkge1xuICBjb25zdCB2YWxpZGF0aW9ucyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5tYXAocHJvdmlkZXIgPT4ge1xuICAgIGlmIChhdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgdmFsaWRhdGVBdXRoRGF0YSA9IHRoaXMuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihcbiAgICAgIHByb3ZpZGVyXG4gICAgKTtcbiAgICBpZiAoIXZhbGlkYXRlQXV0aERhdGEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB2YWxpZGF0ZUF1dGhEYXRhKGF1dGhEYXRhW3Byb3ZpZGVyXSk7XG4gIH0pO1xuICByZXR1cm4gUHJvbWlzZS5hbGwodmFsaWRhdGlvbnMpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maW5kVXNlcnNXaXRoQXV0aERhdGEgPSBmdW5jdGlvbihhdXRoRGF0YSkge1xuICBjb25zdCBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGNvbnN0IHF1ZXJ5ID0gcHJvdmlkZXJzXG4gICAgLnJlZHVjZSgobWVtbywgcHJvdmlkZXIpID0+IHtcbiAgICAgIGlmICghYXV0aERhdGFbcHJvdmlkZXJdKSB7XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfVxuICAgICAgY29uc3QgcXVlcnlLZXkgPSBgYXV0aERhdGEuJHtwcm92aWRlcn0uaWRgO1xuICAgICAgY29uc3QgcXVlcnkgPSB7fTtcbiAgICAgIHF1ZXJ5W3F1ZXJ5S2V5XSA9IGF1dGhEYXRhW3Byb3ZpZGVyXS5pZDtcbiAgICAgIG1lbW8ucHVzaChxdWVyeSk7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9LCBbXSlcbiAgICAuZmlsdGVyKHEgPT4ge1xuICAgICAgcmV0dXJuIHR5cGVvZiBxICE9PSAndW5kZWZpbmVkJztcbiAgICB9KTtcblxuICBsZXQgZmluZFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoW10pO1xuICBpZiAocXVlcnkubGVuZ3RoID4gMCkge1xuICAgIGZpbmRQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZCh0aGlzLmNsYXNzTmFtZSwgeyAkb3I6IHF1ZXJ5IH0sIHt9KTtcbiAgfVxuXG4gIHJldHVybiBmaW5kUHJvbWlzZTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZmlsdGVyZWRPYmplY3RzQnlBQ0wgPSBmdW5jdGlvbihvYmplY3RzKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0cztcbiAgfVxuICByZXR1cm4gb2JqZWN0cy5maWx0ZXIob2JqZWN0ID0+IHtcbiAgICBpZiAoIW9iamVjdC5BQ0wpIHtcbiAgICAgIHJldHVybiB0cnVlOyAvLyBsZWdhY3kgdXNlcnMgdGhhdCBoYXZlIG5vIEFDTCBmaWVsZCBvbiB0aGVtXG4gICAgfVxuICAgIC8vIFJlZ3VsYXIgdXNlcnMgdGhhdCBoYXZlIGJlZW4gbG9ja2VkIG91dC5cbiAgICByZXR1cm4gb2JqZWN0LkFDTCAmJiBPYmplY3Qua2V5cyhvYmplY3QuQUNMKS5sZW5ndGggPiAwO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlQXV0aERhdGEgPSBmdW5jdGlvbihhdXRoRGF0YSkge1xuICBsZXQgcmVzdWx0cztcbiAgcmV0dXJuIHRoaXMuZmluZFVzZXJzV2l0aEF1dGhEYXRhKGF1dGhEYXRhKS50aGVuKGFzeW5jIHIgPT4ge1xuICAgIHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuXG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoID09IDEpIHtcbiAgICAgIHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuam9pbignLCcpO1xuXG4gICAgICBjb25zdCB1c2VyUmVzdWx0ID0gcmVzdWx0c1swXTtcbiAgICAgIGNvbnN0IG11dGF0ZWRBdXRoRGF0YSA9IHt9O1xuICAgICAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGNvbnN0IHVzZXJBdXRoRGF0YSA9IHVzZXJSZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBpZiAoIV8uaXNFcXVhbChwcm92aWRlckRhdGEsIHVzZXJBdXRoRGF0YSkpIHtcbiAgICAgICAgICBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkubGVuZ3RoICE9PSAwO1xuICAgICAgbGV0IHVzZXJJZDtcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgdXNlcklkID0gdGhpcy5xdWVyeS5vYmplY3RJZDtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgICAgIHVzZXJJZCA9IHRoaXMuYXV0aC51c2VyLmlkO1xuICAgICAgfVxuICAgICAgaWYgKCF1c2VySWQgfHwgdXNlcklkID09PSB1c2VyUmVzdWx0Lm9iamVjdElkKSB7XG4gICAgICAgIC8vIG5vIHVzZXIgbWFraW5nIHRoZSBjYWxsXG4gICAgICAgIC8vIE9SIHRoZSB1c2VyIG1ha2luZyB0aGUgY2FsbCBpcyB0aGUgcmlnaHQgb25lXG4gICAgICAgIC8vIExvZ2luIHdpdGggYXV0aCBkYXRhXG4gICAgICAgIGRlbGV0ZSByZXN1bHRzWzBdLnBhc3N3b3JkO1xuXG4gICAgICAgIC8vIG5lZWQgdG8gc2V0IHRoZSBvYmplY3RJZCBmaXJzdCBvdGhlcndpc2UgbG9jYXRpb24gaGFzIHRyYWlsaW5nIHVuZGVmaW5lZFxuICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSB1c2VyUmVzdWx0Lm9iamVjdElkO1xuXG4gICAgICAgIGlmICghdGhpcy5xdWVyeSB8fCAhdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIC8vIHRoaXMgYSBsb2dpbiBjYWxsLCBubyB1c2VySWQgcGFzc2VkXG4gICAgICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB1c2VyUmVzdWx0LFxuICAgICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgICB9O1xuICAgICAgICAgIC8vIFJ1biBiZWZvcmVMb2dpbiBob29rIGJlZm9yZSBzdG9yaW5nIGFueSB1cGRhdGVzXG4gICAgICAgICAgLy8gdG8gYXV0aERhdGEgb24gdGhlIGRiOyBjaGFuZ2VzIHRvIHVzZXJSZXN1bHRcbiAgICAgICAgICAvLyB3aWxsIGJlIGlnbm9yZWQuXG4gICAgICAgICAgYXdhaXQgdGhpcy5ydW5CZWZvcmVMb2dpblRyaWdnZXIoZGVlcGNvcHkodXNlclJlc3VsdCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgd2UgZGlkbid0IGNoYW5nZSB0aGUgYXV0aCBkYXRhLCBqdXN0IGtlZXAgZ29pbmdcbiAgICAgICAgaWYgKCFoYXNNdXRhdGVkQXV0aERhdGEpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gV2UgaGF2ZSBhdXRoRGF0YSB0aGF0IGlzIHVwZGF0ZWQgb24gbG9naW5cbiAgICAgICAgLy8gdGhhdCBjYW4gaGFwcGVuIHdoZW4gdG9rZW4gYXJlIHJlZnJlc2hlZCxcbiAgICAgICAgLy8gV2Ugc2hvdWxkIHVwZGF0ZSB0aGUgdG9rZW4gYW5kIGxldCB0aGUgdXNlciBpblxuICAgICAgICAvLyBXZSBzaG91bGQgb25seSBjaGVjayB0aGUgbXV0YXRlZCBrZXlzXG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihtdXRhdGVkQXV0aERhdGEpLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIC8vIElGIHdlIGhhdmUgYSByZXNwb25zZSwgd2UnbGwgc2tpcCB0aGUgZGF0YWJhc2Ugb3BlcmF0aW9uIC8gYmVmb3JlU2F2ZSAvIGFmdGVyU2F2ZSBldGMuLi5cbiAgICAgICAgICAvLyB3ZSBuZWVkIHRvIHNldCBpdCB1cCB0aGVyZS5cbiAgICAgICAgICAvLyBXZSBhcmUgc3VwcG9zZWQgdG8gaGF2ZSBhIHJlc3BvbnNlIG9ubHkgb24gTE9HSU4gd2l0aCBhdXRoRGF0YSwgc28gd2Ugc2tpcCB0aG9zZVxuICAgICAgICAgIC8vIElmIHdlJ3JlIG5vdCBsb2dnaW5nIGluLCBidXQganVzdCB1cGRhdGluZyB0aGUgY3VycmVudCB1c2VyLCB3ZSBjYW4gc2FmZWx5IHNraXAgdGhhdCBwYXJ0XG4gICAgICAgICAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICAgICAgICAgIC8vIEFzc2lnbiB0aGUgbmV3IGF1dGhEYXRhIGluIHRoZSByZXNwb25zZVxuICAgICAgICAgICAgT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVtwcm92aWRlcl0gPVxuICAgICAgICAgICAgICAgIG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gUnVuIHRoZSBEQiB1cGRhdGUgZGlyZWN0bHksIGFzICdtYXN0ZXInXG4gICAgICAgICAgICAvLyBKdXN0IHVwZGF0ZSB0aGUgYXV0aERhdGEgcGFydFxuICAgICAgICAgICAgLy8gVGhlbiB3ZSdyZSBnb29kIGZvciB0aGUgdXNlciwgZWFybHkgZXhpdCBvZiBzb3J0c1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMuZGF0YS5vYmplY3RJZCB9LFxuICAgICAgICAgICAgICB7IGF1dGhEYXRhOiBtdXRhdGVkQXV0aERhdGEgfSxcbiAgICAgICAgICAgICAge31cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSBpZiAodXNlcklkKSB7XG4gICAgICAgIC8vIFRyeWluZyB0byB1cGRhdGUgYXV0aCBkYXRhIGJ1dCB1c2Vyc1xuICAgICAgICAvLyBhcmUgZGlmZmVyZW50XG4gICAgICAgIGlmICh1c2VyUmVzdWx0Lm9iamVjdElkICE9PSB1c2VySWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELFxuICAgICAgICAgICAgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBObyBhdXRoIGRhdGEgd2FzIG11dGF0ZWQsIGp1c3Qga2VlcCBnb2luZ1xuICAgICAgICBpZiAoIWhhc011dGF0ZWRBdXRoRGF0YSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oYXV0aERhdGEpLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAvLyBNb3JlIHRoYW4gMSB1c2VyIHdpdGggdGhlIHBhc3NlZCBpZCdzXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELFxuICAgICAgICAgICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIFRoZSBub24tdGhpcmQtcGFydHkgcGFydHMgb2YgVXNlciB0cmFuc2Zvcm1hdGlvblxuUmVzdFdyaXRlLnByb3RvdHlwZS50cmFuc2Zvcm1Vc2VyID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICBpZiAoIXRoaXMuYXV0aC5pc01hc3RlciAmJiAnZW1haWxWZXJpZmllZCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgZXJyb3IgPSBgQ2xpZW50cyBhcmVuJ3QgYWxsb3dlZCB0byBtYW51YWxseSB1cGRhdGUgZW1haWwgdmVyaWZpY2F0aW9uLmA7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sIGVycm9yKTtcbiAgfVxuXG4gIC8vIERvIG5vdCBjbGVhbnVwIHNlc3Npb24gaWYgb2JqZWN0SWQgaXMgbm90IHNldFxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLm9iamVjdElkKCkpIHtcbiAgICAvLyBJZiB3ZSdyZSB1cGRhdGluZyBhIF9Vc2VyIG9iamVjdCwgd2UgbmVlZCB0byBjbGVhciBvdXQgdGhlIGNhY2hlIGZvciB0aGF0IHVzZXIuIEZpbmQgYWxsIHRoZWlyXG4gICAgLy8gc2Vzc2lvbiB0b2tlbnMsIGFuZCByZW1vdmUgdGhlbSBmcm9tIHRoZSBjYWNoZS5cbiAgICBwcm9taXNlID0gbmV3IFJlc3RRdWVyeSh0aGlzLmNvbmZpZywgQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLCAnX1Nlc3Npb24nLCB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH0pXG4gICAgICAuZXhlY3V0ZSgpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgcmVzdWx0cy5yZXN1bHRzLmZvckVhY2goc2Vzc2lvbiA9PlxuICAgICAgICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci51c2VyLmRlbChzZXNzaW9uLnNlc3Npb25Ub2tlbilcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHByb21pc2VcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBUcmFuc2Zvcm0gdGhlIHBhc3N3b3JkXG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gaWdub3JlIG9ubHkgaWYgdW5kZWZpbmVkLiBzaG91bGQgcHJvY2VlZCBpZiBlbXB0eSAoJycpXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gPSB0cnVlO1xuICAgICAgICAvLyBHZW5lcmF0ZSBhIG5ldyBzZXNzaW9uIG9ubHkgaWYgdGhlIHVzZXIgcmVxdWVzdGVkXG4gICAgICAgIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICAgICAgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3koKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmhhc2godGhpcy5kYXRhLnBhc3N3b3JkKS50aGVuKGhhc2hlZFBhc3N3b3JkID0+IHtcbiAgICAgICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCA9IGhhc2hlZFBhc3N3b3JkO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVVc2VyTmFtZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlRW1haWwoKTtcbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlVXNlck5hbWUgPSBmdW5jdGlvbigpIHtcbiAgLy8gQ2hlY2sgZm9yIHVzZXJuYW1lIHVuaXF1ZW5lc3NcbiAgaWYgKCF0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgIHRoaXMuZGF0YS51c2VybmFtZSA9IGNyeXB0b1V0aWxzLnJhbmRvbVN0cmluZygyNSk7XG4gICAgICB0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8qXG4gICAgVXNlcm5hbWVzIHNob3VsZCBiZSB1bmlxdWUgd2hlbiBjb21wYXJlZCBjYXNlIGluc2Vuc2l0aXZlbHlcblxuICAgIFVzZXJzIHNob3VsZCBiZSBhYmxlIHRvIG1ha2UgY2FzZSBzZW5zaXRpdmUgdXNlcm5hbWVzIGFuZFxuICAgIGxvZ2luIHVzaW5nIHRoZSBjYXNlIHRoZXkgZW50ZXJlZC4gIEkuZS4gJ1Nub29weScgc2hvdWxkIHByZWNsdWRlXG4gICAgJ3Nub29weScgYXMgYSB2YWxpZCB1c2VybmFtZS5cbiAgKi9cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHtcbiAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxLCBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIHt9LFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfSk7XG59O1xuXG4vKlxuICBBcyB3aXRoIHVzZXJuYW1lcywgUGFyc2Ugc2hvdWxkIG5vdCBhbGxvdyBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgb2YgZW1haWwuXG4gIHVubGlrZSB3aXRoIHVzZXJuYW1lcyAod2hpY2ggY2FuIGhhdmUgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb25zIGluIHRoZSBjYXNlIG9mXG4gIGF1dGggYWRhcHRlcnMpLCBlbWFpbHMgc2hvdWxkIG5ldmVyIGhhdmUgYSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbi5cblxuICBUaGlzIGJlaGF2aW9yIGNhbiBiZSBlbmZvcmNlZCB0aHJvdWdoIGEgcHJvcGVybHkgY29uZmlndXJlZCBpbmRleCBzZWU6XG4gIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvY29yZS9pbmRleC1jYXNlLWluc2Vuc2l0aXZlLyNjcmVhdGUtYS1jYXNlLWluc2Vuc2l0aXZlLWluZGV4XG4gIHdoaWNoIGNvdWxkIGJlIGltcGxlbWVudGVkIGluc3RlYWQgb2YgdGhpcyBjb2RlIGJhc2VkIHZhbGlkYXRpb24uXG5cbiAgR2l2ZW4gdGhhdCB0aGlzIGxvb2t1cCBzaG91bGQgYmUgYSByZWxhdGl2ZWx5IGxvdyB1c2UgY2FzZSBhbmQgdGhhdCB0aGUgY2FzZSBzZW5zaXRpdmVcbiAgdW5pcXVlIGluZGV4IHdpbGwgYmUgdXNlZCBieSB0aGUgZGIgZm9yIHRoZSBxdWVyeSwgdGhpcyBpcyBhbiBhZGVxdWF0ZSBzb2x1dGlvbi5cbiovXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZUVtYWlsID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsIHx8IHRoaXMuZGF0YS5lbWFpbC5fX29wID09PSAnRGVsZXRlJykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBWYWxpZGF0ZSBiYXNpYyBlbWFpbCBhZGRyZXNzIGZvcm1hdFxuICBpZiAoIXRoaXMuZGF0YS5lbWFpbC5tYXRjaCgvXi4rQC4rJC8pKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICdFbWFpbCBhZGRyZXNzIGZvcm1hdCBpcyBpbnZhbGlkLidcbiAgICAgIClcbiAgICApO1xuICB9XG4gIC8vIENhc2UgaW5zZW5zaXRpdmUgbWF0Y2gsIHNlZSBub3RlIGFib3ZlIGZ1bmN0aW9uLlxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICAhdGhpcy5kYXRhLmF1dGhEYXRhIHx8XG4gICAgICAgICFPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCB8fFxuICAgICAgICAoT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggPT09IDEgJiZcbiAgICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpWzBdID09PSAnYW5vbnltb3VzJylcbiAgICAgICkge1xuICAgICAgICAvLyBXZSB1cGRhdGVkIHRoZSBlbWFpbCwgc2VuZCBhIG5ldyB2YWxpZGF0aW9uXG4gICAgICAgIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10gPSB0cnVlO1xuICAgICAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZXRFbWFpbFZlcmlmeVRva2VuKHRoaXMuZGF0YSk7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5ID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kpIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMoKS50aGVuKCgpID0+IHtcbiAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkoKTtcbiAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzID0gZnVuY3Rpb24oKSB7XG4gIC8vIGNoZWNrIGlmIHRoZSBwYXNzd29yZCBjb25mb3JtcyB0byB0aGUgZGVmaW5lZCBwYXNzd29yZCBwb2xpY3kgaWYgY29uZmlndXJlZFxuICAvLyBJZiB3ZSBzcGVjaWZpZWQgYSBjdXN0b20gZXJyb3IgaW4gb3VyIGNvbmZpZ3VyYXRpb24gdXNlIGl0LlxuICAvLyBFeGFtcGxlOiBcIlBhc3N3b3JkcyBtdXN0IGluY2x1ZGUgYSBDYXBpdGFsIExldHRlciwgTG93ZXJjYXNlIExldHRlciwgYW5kIGEgbnVtYmVyLlwiXG4gIC8vXG4gIC8vIFRoaXMgaXMgZXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGdlbmVyaWMgXCJwYXNzd29yZCByZXNldFwiIHBhZ2UsXG4gIC8vIGFzIGl0IGFsbG93cyB0aGUgcHJvZ3JhbW1lciB0byBjb21tdW5pY2F0ZSBzcGVjaWZpYyByZXF1aXJlbWVudHMgaW5zdGVhZCBvZjpcbiAgLy8gYS4gbWFraW5nIHRoZSB1c2VyIGd1ZXNzIHdoYXRzIHdyb25nXG4gIC8vIGIuIG1ha2luZyBhIGN1c3RvbSBwYXNzd29yZCByZXNldCBwYWdlIHRoYXQgc2hvd3MgdGhlIHJlcXVpcmVtZW50c1xuICBjb25zdCBwb2xpY3lFcnJvciA9IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgID8gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgOiAnUGFzc3dvcmQgZG9lcyBub3QgbWVldCB0aGUgUGFzc3dvcmQgUG9saWN5IHJlcXVpcmVtZW50cy4nO1xuICBjb25zdCBjb250YWluc1VzZXJuYW1lRXJyb3IgPSAnUGFzc3dvcmQgY2Fubm90IGNvbnRhaW4geW91ciB1c2VybmFtZS4nO1xuXG4gIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIG1lZXRzIHRoZSBwYXNzd29yZCBzdHJlbmd0aCByZXF1aXJlbWVudHNcbiAgaWYgKFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvcih0aGlzLmRhdGEucGFzc3dvcmQpKSB8fFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrKHRoaXMuZGF0YS5wYXNzd29yZCkpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBwb2xpY3lFcnJvcilcbiAgICApO1xuICB9XG5cbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBjb250YWluIHVzZXJuYW1lXG4gIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgPT09IHRydWUpIHtcbiAgICBpZiAodGhpcy5kYXRhLnVzZXJuYW1lKSB7XG4gICAgICAvLyB1c2VybmFtZSBpcyBub3QgcGFzc2VkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHRoaXMuZGF0YS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBjb250YWluc1VzZXJuYW1lRXJyb3IpXG4gICAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHJldHJpZXZlIHRoZSBVc2VyIG9iamVjdCB1c2luZyBvYmplY3RJZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSlcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHJlc3VsdHNbMF0udXNlcm5hbWUpID49IDApXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICAgIGNvbnRhaW5zVXNlcm5hbWVFcnJvclxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5ID0gZnVuY3Rpb24oKSB7XG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgaXMgcmVwZWF0aW5nIGZyb20gc3BlY2lmaWVkIGhpc3RvcnlcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KVxuICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgIHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnksXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgLSAxXG4gICAgICAgICAgKTtcbiAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgIGNvbnN0IG5ld1Bhc3N3b3JkID0gdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICAvLyBjb21wYXJlIHRoZSBuZXcgcGFzc3dvcmQgaGFzaCB3aXRoIGFsbCBvbGQgcGFzc3dvcmQgaGFzaGVzXG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gb2xkUGFzc3dvcmRzLm1hcChmdW5jdGlvbihoYXNoKSB7XG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUobmV3UGFzc3dvcmQsIGhhc2gpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpXG4gICAgICAgICAgICAgIC8vIHJlamVjdCBpZiB0aGVyZSBpcyBhIG1hdGNoXG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCgnUkVQRUFUX1BBU1NXT1JEJyk7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB3YWl0IGZvciBhbGwgY29tcGFyaXNvbnMgdG8gY29tcGxldGVcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyciA9PT0gJ1JFUEVBVF9QQVNTV09SRCcpXG4gICAgICAgICAgICAgIC8vIGEgbWF0Y2ggd2FzIGZvdW5kXG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICAgICAgYE5ldyBwYXNzd29yZCBzaG91bGQgbm90IGJlIHRoZSBzYW1lIGFzIGxhc3QgJHt0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3Rvcnl9IHBhc3N3b3Jkcy5gXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgc2Vzc2lvbiBmb3IgdXBkYXRpbmcgdXNlciAodGhpcy5xdWVyeSBpcyBzZXQpIHVubGVzcyBhdXRoRGF0YSBleGlzdHNcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBuZXcgc2Vzc2lvblRva2VuIGlmIGxpbmtpbmcgdmlhIHNlc3Npb25Ub2tlblxuICBpZiAodGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChcbiAgICAhdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSAmJiAvLyBzaWdudXAgY2FsbCwgd2l0aFxuICAgIHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiYgLy8gbm8gbG9naW4gd2l0aG91dCB2ZXJpZmljYXRpb25cbiAgICB0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzXG4gICkge1xuICAgIC8vIHZlcmlmaWNhdGlvbiBpcyBvblxuICAgIHJldHVybjsgLy8gZG8gbm90IGNyZWF0ZSB0aGUgc2Vzc2lvbiB0b2tlbiBpbiB0aGF0IGNhc2UhXG4gIH1cbiAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uKCkge1xuICAvLyBjbG91ZCBpbnN0YWxsYXRpb25JZCBmcm9tIENsb3VkIENvZGUsXG4gIC8vIG5ldmVyIGNyZWF0ZSBzZXNzaW9uIHRva2VucyBmcm9tIHRoZXJlLlxuICBpZiAodGhpcy5hdXRoLmluc3RhbGxhdGlvbklkICYmIHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCA9PT0gJ2Nsb3VkJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IEF1dGguY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgIHVzZXJJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICBhY3Rpb246IHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPyAnbG9naW4nIDogJ3NpZ251cCcsXG4gICAgICBhdXRoUHJvdmlkZXI6IHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gfHwgJ3Bhc3N3b3JkJyxcbiAgICB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQsXG4gIH0pO1xuXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIHJldHVybiBjcmVhdGVTZXNzaW9uKCk7XG59O1xuXG4vLyBEZWxldGUgZW1haWwgcmVzZXQgdG9rZW5zIGlmIHVzZXIgaXMgY2hhbmdpbmcgcGFzc3dvcmQgb3IgZW1haWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCB0aGlzLnF1ZXJ5ID09PSBudWxsKSB7XG4gICAgLy8gbnVsbCBxdWVyeSBtZWFucyBjcmVhdGVcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoJ3Bhc3N3b3JkJyBpbiB0aGlzLmRhdGEgfHwgJ2VtYWlsJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBhZGRPcHMgPSB7XG4gICAgICBfcGVyaXNoYWJsZV90b2tlbjogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgICAgX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgIH07XG4gICAgdGhpcy5kYXRhID0gT2JqZWN0LmFzc2lnbih0aGlzLmRhdGEsIGFkZE9wcyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyA9IGZ1bmN0aW9uKCkge1xuICAvLyBPbmx5IGZvciBfU2Vzc2lvbiwgYW5kIGF0IGNyZWF0aW9uIHRpbWVcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9ICdfU2Vzc2lvbicgfHwgdGhpcy5xdWVyeSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEZXN0cm95IHRoZSBzZXNzaW9ucyBpbiAnQmFja2dyb3VuZCdcbiAgY29uc3QgeyB1c2VyLCBpbnN0YWxsYXRpb25JZCwgc2Vzc2lvblRva2VuIH0gPSB0aGlzLmRhdGE7XG4gIGlmICghdXNlciB8fCAhaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF1c2VyLm9iamVjdElkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koXG4gICAgJ19TZXNzaW9uJyxcbiAgICB7XG4gICAgICB1c2VyLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICBzZXNzaW9uVG9rZW46IHsgJG5lOiBzZXNzaW9uVG9rZW4gfSxcbiAgICB9LFxuICAgIHt9LFxuICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICk7XG59O1xuXG4vLyBIYW5kbGVzIGFueSBmb2xsb3d1cCBsb2dpY1xuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVGb2xsb3d1cCA9IGZ1bmN0aW9uKCkge1xuICBpZiAoXG4gICAgdGhpcy5zdG9yYWdlICYmXG4gICAgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gJiZcbiAgICB0aGlzLmNvbmZpZy5yZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0XG4gICkge1xuICAgIHZhciBzZXNzaW9uUXVlcnkgPSB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH07XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddO1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmRlc3Ryb3koJ19TZXNzaW9uJywgc2Vzc2lvblF1ZXJ5KVxuICAgICAgLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddO1xuICAgIC8vIEZpcmUgYW5kIGZvcmdldCFcbiAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodGhpcy5kYXRhKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfU2Vzc2lvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIF9TZXNzaW9uIG9iamVjdC5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlU2Vzc2lvbiA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLmNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLnVzZXIgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTixcbiAgICAgICdTZXNzaW9uIHRva2VuIHJlcXVpcmVkLidcbiAgICApO1xuICB9XG5cbiAgLy8gVE9ETzogVmVyaWZ5IHByb3BlciBlcnJvciB0byB0aHJvd1xuICBpZiAodGhpcy5kYXRhLkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAnQ2Fubm90IHNldCAnICsgJ0FDTCBvbiBhIFNlc3Npb24uJ1xuICAgICk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIGlmIChcbiAgICAgIHRoaXMuZGF0YS51c2VyICYmXG4gICAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgICB0aGlzLmRhdGEudXNlci5vYmplY3RJZCAhPSB0aGlzLmF1dGgudXNlci5pZFxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5kYXRhKSB7XG4gICAgICBpZiAoa2V5ID09PSAnb2JqZWN0SWQnIHx8IGtleSA9PT0gJ3VzZXInKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhW2tleV0gPSB0aGlzLmRhdGFba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBBdXRoLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdjcmVhdGUnLFxuICAgICAgfSxcbiAgICAgIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSxcbiAgICB9KTtcblxuICAgIHJldHVybiBjcmVhdGVTZXNzaW9uKCkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5yZXNwb25zZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICdFcnJvciBjcmVhdGluZyBzZXNzaW9uLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHNlc3Npb25EYXRhWydvYmplY3RJZCddID0gcmVzdWx0cy5yZXNwb25zZVsnb2JqZWN0SWQnXTtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgIHN0YXR1czogMjAxLFxuICAgICAgICBsb2NhdGlvbjogcmVzdWx0cy5sb2NhdGlvbixcbiAgICAgICAgcmVzcG9uc2U6IHNlc3Npb25EYXRhLFxuICAgICAgfTtcbiAgICB9KTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX0luc3RhbGxhdGlvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIGluc3RhbGxhdGlvbiBvYmplY3QuXG4vLyBJZiBhbiBpbnN0YWxsYXRpb24gaXMgZm91bmQsIHRoaXMgY2FuIG11dGF0ZSB0aGlzLnF1ZXJ5IGFuZCB0dXJuIGEgY3JlYXRlXG4vLyBpbnRvIGFuIHVwZGF0ZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlSW5zdGFsbGF0aW9uID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX0luc3RhbGxhdGlvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoXG4gICAgIXRoaXMucXVlcnkgJiZcbiAgICAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICF0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWRcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgMTM1LFxuICAgICAgJ2F0IGxlYXN0IG9uZSBJRCBmaWVsZCAoZGV2aWNlVG9rZW4sIGluc3RhbGxhdGlvbklkKSAnICtcbiAgICAgICAgJ211c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJ1xuICAgICk7XG4gIH1cblxuICAvLyBJZiB0aGUgZGV2aWNlIHRva2VuIGlzIDY0IGNoYXJhY3RlcnMgbG9uZywgd2UgYXNzdW1lIGl0IGlzIGZvciBpT1NcbiAgLy8gYW5kIGxvd2VyY2FzZSBpdC5cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4ubGVuZ3RoID09IDY0KSB7XG4gICAgdGhpcy5kYXRhLmRldmljZVRva2VuID0gdGhpcy5kYXRhLmRldmljZVRva2VuLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBXZSBsb3dlcmNhc2UgdGhlIGluc3RhbGxhdGlvbklkIGlmIHByZXNlbnRcbiAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgbGV0IGluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkO1xuXG4gIC8vIElmIGRhdGEuaW5zdGFsbGF0aW9uSWQgaXMgbm90IHNldCBhbmQgd2UncmUgbm90IG1hc3Rlciwgd2UgY2FuIGxvb2t1cCBpbiBhdXRoXG4gIGlmICghaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGluc3RhbGxhdGlvbklkID0gdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gVXBkYXRpbmcgX0luc3RhbGxhdGlvbiBidXQgbm90IHVwZGF0aW5nIGFueXRoaW5nIGNyaXRpY2FsXG4gIGlmIChcbiAgICB0aGlzLnF1ZXJ5ICYmXG4gICAgIXRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICFpbnN0YWxsYXRpb25JZCAmJlxuICAgICF0aGlzLmRhdGEuZGV2aWNlVHlwZVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gIHZhciBpZE1hdGNoOyAvLyBXaWxsIGJlIGEgbWF0Y2ggb24gZWl0aGVyIG9iamVjdElkIG9yIGluc3RhbGxhdGlvbklkXG4gIHZhciBvYmplY3RJZE1hdGNoO1xuICB2YXIgaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgdmFyIGRldmljZVRva2VuTWF0Y2hlcyA9IFtdO1xuXG4gIC8vIEluc3RlYWQgb2YgaXNzdWluZyAzIHJlYWRzLCBsZXQncyBkbyBpdCB3aXRoIG9uZSBPUi5cbiAgY29uc3Qgb3JRdWVyaWVzID0gW107XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBvYmplY3RJZDogdGhpcy5xdWVyeS5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG4gIH1cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgIG9yUXVlcmllcy5wdXNoKHsgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbiB9KTtcbiAgfVxuXG4gIGlmIChvclF1ZXJpZXMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcm9taXNlID0gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgICAnX0luc3RhbGxhdGlvbicsXG4gICAgICAgIHtcbiAgICAgICAgICAkb3I6IG9yUXVlcmllcyxcbiAgICAgICAgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5xdWVyeSAmJlxuICAgICAgICAgIHRoaXMucXVlcnkub2JqZWN0SWQgJiZcbiAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPT0gdGhpcy5xdWVyeS5vYmplY3RJZFxuICAgICAgICApIHtcbiAgICAgICAgICBvYmplY3RJZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuaW5zdGFsbGF0aW9uSWQgPT0gaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuZGV2aWNlVG9rZW4gPT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNhbml0eSBjaGVja3Mgd2hlbiBydW5uaW5nIGEgcXVlcnlcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKCFvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kIGZvciB1cGRhdGUuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgIT09IG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgMTM2LFxuICAgICAgICAgICAgJ2luc3RhbGxhdGlvbklkIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgIW9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgMTM2LFxuICAgICAgICAgICAgJ2RldmljZVRva2VuIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUeXBlXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIDEzNixcbiAgICAgICAgICAgICdkZXZpY2VUeXBlIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiBvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBvYmplY3RJZE1hdGNoO1xuICAgICAgfVxuXG4gICAgICBpZiAoaW5zdGFsbGF0aW9uSWQgJiYgaW5zdGFsbGF0aW9uSWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIG5lZWQgdG8gc3BlY2lmeSBkZXZpY2VUeXBlIG9ubHkgaWYgaXQncyBuZXdcbiAgICAgIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUgJiYgIWlkTWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIDEzNSxcbiAgICAgICAgICAnZGV2aWNlVHlwZSBtdXN0IGJlIHNwZWNpZmllZCBpbiB0aGlzIG9wZXJhdGlvbidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICghaWRNYXRjaCkge1xuICAgICAgICBpZiAoIWRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmXG4gICAgICAgICAgKCFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10gfHwgIWluc3RhbGxhdGlvbklkKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBTaW5nbGUgbWF0Y2ggb24gZGV2aWNlIHRva2VuIGJ1dCBub25lIG9uIGluc3RhbGxhdGlvbklkLCBhbmQgZWl0aGVyXG4gICAgICAgICAgLy8gdGhlIHBhc3NlZCBvYmplY3Qgb3IgdGhlIG1hdGNoIGlzIG1pc3NpbmcgYW4gaW5zdGFsbGF0aW9uSWQsIHNvIHdlXG4gICAgICAgICAgLy8gY2FuIGp1c3QgcmV0dXJuIHRoZSBtYXRjaC5cbiAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzIsXG4gICAgICAgICAgICAnTXVzdCBzcGVjaWZ5IGluc3RhbGxhdGlvbklkIHdoZW4gZGV2aWNlVG9rZW4gJyArXG4gICAgICAgICAgICAgICdtYXRjaGVzIG11bHRpcGxlIEluc3RhbGxhdGlvbiBvYmplY3RzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTXVsdGlwbGUgZGV2aWNlIHRva2VuIG1hdGNoZXMgYW5kIHdlIHNwZWNpZmllZCBhbiBpbnN0YWxsYXRpb24gSUQsXG4gICAgICAgICAgLy8gb3IgYSBzaW5nbGUgbWF0Y2ggd2hlcmUgYm90aCB0aGUgcGFzc2VkIGFuZCBtYXRjaGluZyBvYmplY3RzIGhhdmVcbiAgICAgICAgICAvLyBhbiBpbnN0YWxsYXRpb24gSUQuIFRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaFxuICAgICAgICAgIC8vIHRoZSBkZXZpY2VUb2tlbiwgYW5kIHJldHVybiBuaWwgdG8gc2lnbmFsIHRoYXQgYSBuZXcgb2JqZWN0IHNob3VsZFxuICAgICAgICAgIC8vIGJlIGNyZWF0ZWQuXG4gICAgICAgICAgdmFyIGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiB7XG4gICAgICAgICAgICAgICRuZTogaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJlxuICAgICAgICAgICFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ11cbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gRXhhY3RseSBvbmUgZGV2aWNlIHRva2VuIG1hdGNoIGFuZCBpdCBkb2Vzbid0IGhhdmUgYW4gaW5zdGFsbGF0aW9uXG4gICAgICAgICAgLy8gSUQuIFRoaXMgaXMgdGhlIG9uZSBjYXNlIHdoZXJlIHdlIHdhbnQgdG8gbWVyZ2Ugd2l0aCB0aGUgZXhpc3RpbmdcbiAgICAgICAgICAvLyBvYmplY3QuXG4gICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7IG9iamVjdElkOiBpZE1hdGNoLm9iamVjdElkIH07XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgICAuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgICAgaWRNYXRjaC5kZXZpY2VUb2tlbiAhPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW5cbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIHNldHRpbmcgdGhlIGRldmljZSB0b2tlbiBvbiBhbiBleGlzdGluZyBpbnN0YWxsYXRpb24sIHNvXG4gICAgICAgICAgICAvLyB3ZSBzaG91bGQgdHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoIHRoaXNcbiAgICAgICAgICAgIC8vIGRldmljZSB0b2tlbi5cbiAgICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIC8vIFdlIGhhdmUgYSB1bmlxdWUgaW5zdGFsbCBJZCwgdXNlIHRoYXQgdG8gcHJlc2VydmVcbiAgICAgICAgICAgIC8vIHRoZSBpbnRlcmVzdGluZyBpbnN0YWxsYXRpb25cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2luc3RhbGxhdGlvbklkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkID09IHRoaXMuZGF0YS5vYmplY3RJZFxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIHdlIHBhc3NlZCBhbiBvYmplY3RJZCwgcHJlc2VydmUgdGhhdCBpbnN0YWxhdGlvblxuICAgICAgICAgICAgICBkZWxRdWVyeVsnb2JqZWN0SWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IGlkTWF0Y2gub2JqZWN0SWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBXaGF0IHRvIGRvIGhlcmU/IGNhbid0IHJlYWxseSBjbGVhbiB1cCBldmVyeXRoaW5nLi4uXG4gICAgICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgICAgIC5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpXG4gICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJbiBub24tbWVyZ2Ugc2NlbmFyaW9zLCBqdXN0IHJldHVybiB0aGUgaW5zdGFsbGF0aW9uIG1hdGNoIGlkXG4gICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKG9iaklkID0+IHtcbiAgICAgIGlmIChvYmpJZCkge1xuICAgICAgICB0aGlzLnF1ZXJ5ID0geyBvYmplY3RJZDogb2JqSWQgfTtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG4gICAgICB9XG4gICAgICAvLyBUT0RPOiBWYWxpZGF0ZSBvcHMgKGFkZC9yZW1vdmUgb24gY2hhbm5lbHMsICRpbmMgb24gYmFkZ2UsIGV0Yy4pXG4gICAgfSk7XG4gIHJldHVybiBwcm9taXNlO1xufTtcblxuLy8gSWYgd2Ugc2hvcnQtY2lyY3V0ZWQgdGhlIG9iamVjdCByZXNwb25zZSAtIHRoZW4gd2UgbmVlZCB0byBtYWtlIHN1cmUgd2UgZXhwYW5kIGFsbCB0aGUgZmlsZXMsXG4vLyBzaW5jZSB0aGlzIG1pZ2h0IG5vdCBoYXZlIGEgcXVlcnksIG1lYW5pbmcgaXQgd29uJ3QgcmV0dXJuIHRoZSBmdWxsIHJlc3VsdCBiYWNrLlxuLy8gVE9ETzogKG5sdXRzZW5rbykgVGhpcyBzaG91bGQgZGllIHdoZW4gd2UgbW92ZSB0byBwZXItY2xhc3MgYmFzZWQgY29udHJvbGxlcnMgb24gX1Nlc3Npb24vX1VzZXJcblJlc3RXcml0ZS5wcm90b3R5cGUuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMgPSBmdW5jdGlvbigpIHtcbiAgLy8gQ2hlY2sgd2hldGhlciB3ZSBoYXZlIGEgc2hvcnQtY2lyY3VpdGVkIHJlc3BvbnNlIC0gb25seSB0aGVuIHJ1biBleHBhbnNpb24uXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdChcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZVxuICAgICk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuRGF0YWJhc2VPcGVyYXRpb24gPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUm9sZScpIHtcbiAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIucm9sZS5jbGVhcigpO1xuICB9XG5cbiAgaWYgKFxuICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgdGhpcy5xdWVyeSAmJlxuICAgIHRoaXMuYXV0aC5pc1VuYXV0aGVudGljYXRlZCgpXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlNFU1NJT05fTUlTU0lORyxcbiAgICAgIGBDYW5ub3QgbW9kaWZ5IHVzZXIgJHt0aGlzLnF1ZXJ5Lm9iamVjdElkfS5gXG4gICAgKTtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Qcm9kdWN0JyAmJiB0aGlzLmRhdGEuZG93bmxvYWQpIHtcbiAgICB0aGlzLmRhdGEuZG93bmxvYWROYW1lID0gdGhpcy5kYXRhLmRvd25sb2FkLm5hbWU7XG4gIH1cblxuICAvLyBUT0RPOiBBZGQgYmV0dGVyIGRldGVjdGlvbiBmb3IgQUNMLCBlbnN1cmluZyBhIHVzZXIgY2FuJ3QgYmUgbG9ja2VkIGZyb21cbiAgLy8gICAgICAgdGhlaXIgb3duIHVzZXIgcmVjb3JkLlxuICBpZiAodGhpcy5kYXRhLkFDTCAmJiB0aGlzLmRhdGEuQUNMWycqdW5yZXNvbHZlZCddKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQUNMLCAnSW52YWxpZCBBQ0wuJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIC8vIEZvcmNlIHRoZSB1c2VyIHRvIG5vdCBsb2Nrb3V0XG4gICAgLy8gTWF0Y2hlZCB3aXRoIHBhcnNlLmNvbVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuQUNMICYmXG4gICAgICB0aGlzLmF1dGguaXNNYXN0ZXIgIT09IHRydWVcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5BQ0xbdGhpcy5xdWVyeS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgfVxuICAgIC8vIHVwZGF0ZSBwYXNzd29yZCB0aW1lc3RhbXAgaWYgdXNlciBwYXNzd29yZCBpcyBiZWluZyBjaGFuZ2VkXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgfVxuICAgIC8vIElnbm9yZSBjcmVhdGVkQXQgd2hlbiB1cGRhdGVcbiAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgIGxldCBkZWZlciA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIC8vIGlmIHBhc3N3b3JkIGhpc3RvcnkgaXMgZW5hYmxlZCB0aGVuIHNhdmUgdGhlIGN1cnJlbnQgcGFzc3dvcmQgdG8gaGlzdG9yeVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICkge1xuICAgICAgZGVmZXIgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfVxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vbi0xIHBhc3N3b3JkcyBnbyBpbnRvIGhpc3RvcnkgaW5jbHVkaW5nIGxhc3QgcGFzc3dvcmRcbiAgICAgICAgICB3aGlsZSAoXG4gICAgICAgICAgICBvbGRQYXNzd29yZHMubGVuZ3RoID5cbiAgICAgICAgICAgIE1hdGgubWF4KDAsIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDIpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMuc2hpZnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9oaXN0b3J5ID0gb2xkUGFzc3dvcmRzO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVmZXIudGhlbigoKSA9PiB7XG4gICAgICAvLyBSdW4gYW4gdXBkYXRlXG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgcmVzcG9uc2UudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlID0geyByZXNwb25zZSB9O1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBTZXQgdGhlIGRlZmF1bHQgQUNMIGFuZCBwYXNzd29yZCB0aW1lc3RhbXAgZm9yIHRoZSBuZXcgX1VzZXJcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIHZhciBBQ0wgPSB0aGlzLmRhdGEuQUNMO1xuICAgICAgLy8gZGVmYXVsdCBwdWJsaWMgci93IEFDTFxuICAgICAgaWYgKCFBQ0wpIHtcbiAgICAgICAgQUNMID0ge307XG4gICAgICAgIEFDTFsnKiddID0geyByZWFkOiB0cnVlLCB3cml0ZTogZmFsc2UgfTtcbiAgICAgIH1cbiAgICAgIC8vIG1ha2Ugc3VyZSB0aGUgdXNlciBpcyBub3QgbG9ja2VkIGRvd25cbiAgICAgIEFDTFt0aGlzLmRhdGEub2JqZWN0SWRdID0geyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9O1xuICAgICAgdGhpcy5kYXRhLkFDTCA9IEFDTDtcbiAgICAgIC8vIHBhc3N3b3JkIHRpbWVzdGFtcCB0byBiZSB1c2VkIHdoZW4gcGFzc3dvcmQgZXhwaXJ5IHBvbGljeSBpcyBlbmZvcmNlZFxuICAgICAgaWYgKFxuICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICAgKSB7XG4gICAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUnVuIGEgY3JlYXRlXG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuY3JlYXRlKFxuICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgIGZhbHNlLFxuICAgICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8XG4gICAgICAgICAgZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUXVpY2sgY2hlY2ssIGlmIHdlIHdlcmUgYWJsZSB0byBpbmZlciB0aGUgZHVwbGljYXRlZCBmaWVsZCBuYW1lXG4gICAgICAgIGlmIChcbiAgICAgICAgICBlcnJvciAmJlxuICAgICAgICAgIGVycm9yLnVzZXJJbmZvICYmXG4gICAgICAgICAgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ3VzZXJuYW1lJ1xuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgIGVycm9yICYmXG4gICAgICAgICAgZXJyb3IudXNlckluZm8gJiZcbiAgICAgICAgICBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAnZW1haWwnXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoaXMgd2FzIGEgZmFpbGVkIHVzZXIgY3JlYXRpb24gZHVlIHRvIHVzZXJuYW1lIG9yIGVtYWlsIGFscmVhZHkgdGFrZW4sIHdlIG5lZWQgdG9cbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciBpdCB3YXMgdXNlcm5hbWUgb3IgZW1haWwgYW5kIHJldHVybiB0aGUgYXBwcm9wcmlhdGUgZXJyb3IuXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICAgICAgLy8gVE9ETzogU2VlIGlmIHdlIGNhbiBsYXRlciBkbyB0aGlzIHdpdGhvdXQgYWRkaXRpb25hbCBxdWVyaWVzIGJ5IHVzaW5nIG5hbWVkIGluZGV4ZXMuXG4gICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgIC5maW5kKFxuICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0gfSxcbiAgICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5vYmplY3RJZCA9IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgcmVzcG9uc2UuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgICAgICBpZiAodGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSkge1xuICAgICAgICAgIHJlc3BvbnNlLnVzZXJuYW1lID0gdGhpcy5kYXRhLnVzZXJuYW1lO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIG5vdGhpbmcgLSBkb2Vzbid0IHdhaXQgZm9yIHRoZSB0cmlnZ2VyLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5BZnRlclNhdmVUcmlnZ2VyID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5yZXNwb25zZSB8fCAhdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2FmdGVyU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgY29uc3QgaGFzQWZ0ZXJTYXZlSG9vayA9IHRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgKTtcbiAgY29uc3QgaGFzTGl2ZVF1ZXJ5ID0gdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5oYXNMaXZlUXVlcnkoXG4gICAgdGhpcy5jbGFzc05hbWVcbiAgKTtcbiAgaWYgKCFoYXNBZnRlclNhdmVIb29rICYmICFoYXNMaXZlUXVlcnkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB2YXIgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBleHRyYURhdGEub2JqZWN0SWQgPSB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIG9yaWdpbmFsIG9iamVjdCwgd2Ugb25seSBkbyB0aGlzIGZvciBhIHVwZGF0ZSB3cml0ZS5cbiAgbGV0IG9yaWdpbmFsT2JqZWN0O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIGluZmxhdGVkIG9iamVjdCwgZGlmZmVyZW50IGZyb20gYmVmb3JlU2F2ZSwgb3JpZ2luYWxEYXRhIGlzIG5vdCBlbXB0eVxuICAvLyBzaW5jZSBkZXZlbG9wZXJzIGNhbiBjaGFuZ2UgZGF0YSBpbiB0aGUgYmVmb3JlU2F2ZS5cbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRoaXMuYnVpbGRVcGRhdGVkT2JqZWN0KGV4dHJhRGF0YSk7XG4gIHVwZGF0ZWRPYmplY3QuX2hhbmRsZVNhdmVSZXNwb25zZShcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLFxuICAgIHRoaXMucmVzcG9uc2Uuc3RhdHVzIHx8IDIwMFxuICApO1xuXG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgIC8vIE5vdGlmaXkgTGl2ZVF1ZXJ5U2VydmVyIGlmIHBvc3NpYmxlXG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhcbiAgICAgIHVwZGF0ZWRPYmplY3QuY2xhc3NOYW1lXG4gICAgKTtcbiAgICB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLm9uQWZ0ZXJTYXZlKFxuICAgICAgdXBkYXRlZE9iamVjdC5jbGFzc05hbWUsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICBwZXJtc1xuICAgICk7XG4gIH0pO1xuXG4gIC8vIFJ1biBhZnRlclNhdmUgdHJpZ2dlclxuICByZXR1cm4gdHJpZ2dlcnNcbiAgICAubWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICB0aGlzLmNvbnRleHRcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgIGlmIChyZXN1bHQgJiYgdHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZSA9IHJlc3VsdDtcbiAgICAgIH1cbiAgICB9KVxuICAgIC5jYXRjaChmdW5jdGlvbihlcnIpIHtcbiAgICAgIGxvZ2dlci53YXJuKCdhZnRlclNhdmUgY2F1Z2h0IGFuIGVycm9yJywgZXJyKTtcbiAgICB9KTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGZpZ3VyZSBvdXQgd2hhdCBsb2NhdGlvbiB0aGlzIG9wZXJhdGlvbiBoYXBwZW5zIGF0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5sb2NhdGlvbiA9IGZ1bmN0aW9uKCkge1xuICB2YXIgbWlkZGxlID1cbiAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyA/ICcvdXNlcnMvJyA6ICcvY2xhc3Nlcy8nICsgdGhpcy5jbGFzc05hbWUgKyAnLyc7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5tb3VudCArIG1pZGRsZSArIHRoaXMuZGF0YS5vYmplY3RJZDtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCB0aGUgb2JqZWN0IGlkIGZvciB0aGlzIG9wZXJhdGlvbi5cbi8vIEJlY2F1c2UgaXQgY291bGQgYmUgZWl0aGVyIG9uIHRoZSBxdWVyeSBvciBvbiB0aGUgZGF0YVxuUmVzdFdyaXRlLnByb3RvdHlwZS5vYmplY3RJZCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5kYXRhLm9iamVjdElkIHx8IHRoaXMucXVlcnkub2JqZWN0SWQ7XG59O1xuXG4vLyBSZXR1cm5zIGEgY29weSBvZiB0aGUgZGF0YSBhbmQgZGVsZXRlIGJhZCBrZXlzIChfYXV0aF9kYXRhLCBfaGFzaGVkX3Bhc3N3b3JkLi4uKVxuUmVzdFdyaXRlLnByb3RvdHlwZS5zYW5pdGl6ZWREYXRhID0gZnVuY3Rpb24oKSB7XG4gIGNvbnN0IGRhdGEgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZSgoZGF0YSwga2V5KSA9PiB7XG4gICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgIGlmICghL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcbiAgcmV0dXJuIFBhcnNlLl9kZWNvZGUodW5kZWZpbmVkLCBkYXRhKTtcbn07XG5cbi8vIFJldHVybnMgYW4gdXBkYXRlZCBjb3B5IG9mIHRoZSBvYmplY3RcblJlc3RXcml0ZS5wcm90b3R5cGUuYnVpbGRVcGRhdGVkT2JqZWN0ID0gZnVuY3Rpb24oZXh0cmFEYXRhKSB7XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZShmdW5jdGlvbihkYXRhLCBrZXkpIHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIC8vIHN1YmRvY3VtZW50IGtleSB3aXRoIGRvdCBub3RhdGlvbiAoJ3gueSc6diA9PiAneCc6eyd5Jzp2fSlcbiAgICAgIGNvbnN0IHNwbGl0dGVkS2V5ID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBwYXJlbnRQcm9wID0gc3BsaXR0ZWRLZXlbMF07XG4gICAgICBsZXQgcGFyZW50VmFsID0gdXBkYXRlZE9iamVjdC5nZXQocGFyZW50UHJvcCk7XG4gICAgICBpZiAodHlwZW9mIHBhcmVudFZhbCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgcGFyZW50VmFsID0ge307XG4gICAgICB9XG4gICAgICBwYXJlbnRWYWxbc3BsaXR0ZWRLZXlbMV1dID0gZGF0YVtrZXldO1xuICAgICAgdXBkYXRlZE9iamVjdC5zZXQocGFyZW50UHJvcCwgcGFyZW50VmFsKTtcbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcblxuICB1cGRhdGVkT2JqZWN0LnNldCh0aGlzLnNhbml0aXplZERhdGEoKSk7XG4gIHJldHVybiB1cGRhdGVkT2JqZWN0O1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jbGVhblVzZXJBdXRoRGF0YSA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3QgdXNlciA9IHRoaXMucmVzcG9uc2UucmVzcG9uc2U7XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSA9IGZ1bmN0aW9uKHJlc3BvbnNlLCBkYXRhKSB7XG4gIGlmIChfLmlzRW1wdHkodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIpKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IGNsaWVudFN1cHBvcnRzRGVsZXRlID0gQ2xpZW50U0RLLnN1cHBvcnRzRm9yd2FyZERlbGV0ZSh0aGlzLmNsaWVudFNESyk7XG4gIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBjb25zdCBkYXRhVmFsdWUgPSBkYXRhW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgZmllbGROYW1lKSkge1xuICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICB9XG5cbiAgICAvLyBTdHJpcHMgb3BlcmF0aW9ucyBmcm9tIHJlc3BvbnNlc1xuICAgIGlmIChyZXNwb25zZVtmaWVsZE5hbWVdICYmIHJlc3BvbnNlW2ZpZWxkTmFtZV0uX19vcCkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoY2xpZW50U3VwcG9ydHNEZWxldGUgJiYgZGF0YVZhbHVlLl9fb3AgPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBSZXN0V3JpdGU7XG5tb2R1bGUuZXhwb3J0cyA9IFJlc3RXcml0ZTtcbiJdfQ==