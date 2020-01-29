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
  } // We need to a find to check for duplicate username in case they are missing the unique index on usernames
  // TODO: Check if there is a unique index, and if so, skip this query.


  return this.config.database.find(this.className, {
    username: this.data.username,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
    }

    return;
  });
};

RestWrite.prototype._validateEmail = function () {
  if (!this.data.email || this.data.email.__op === 'Delete') {
    return Promise.resolve();
  } // Validate basic email address format


  if (!this.data.email.match(/^.+@.+$/)) {
    return Promise.reject(new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.'));
  } // Same problem for email as above for username


  return this.config.database.find(this.className, {
    email: this.data.email,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJkZWVwY29weSIsIkF1dGgiLCJjcnlwdG9VdGlscyIsInBhc3N3b3JkQ3J5cHRvIiwiUGFyc2UiLCJ0cmlnZ2VycyIsIkNsaWVudFNESyIsIlJlc3RXcml0ZSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJxdWVyeSIsImRhdGEiLCJvcmlnaW5hbERhdGEiLCJjbGllbnRTREsiLCJhY3Rpb24iLCJpc1JlYWRPbmx5IiwiRXJyb3IiLCJPUEVSQVRJT05fRk9SQklEREVOIiwic3RvcmFnZSIsInJ1bk9wdGlvbnMiLCJjb250ZXh0IiwiYWxsb3dDdXN0b21PYmplY3RJZCIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm9iamVjdElkIiwiTUlTU0lOR19PQkpFQ1RfSUQiLCJJTlZBTElEX0tFWV9OQU1FIiwiaWQiLCJyZXNwb25zZSIsInVwZGF0ZWRBdCIsIl9lbmNvZGUiLCJEYXRlIiwiaXNvIiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwiZXhlY3V0ZSIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImdldFVzZXJBbmRSb2xlQUNMIiwidmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uIiwiaGFuZGxlSW5zdGFsbGF0aW9uIiwiaGFuZGxlU2Vzc2lvbiIsInZhbGlkYXRlQXV0aERhdGEiLCJydW5CZWZvcmVTYXZlVHJpZ2dlciIsImRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkIiwidmFsaWRhdGVTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwic2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCIsInRyYW5zZm9ybVVzZXIiLCJleHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cyIsImRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMiLCJydW5EYXRhYmFzZU9wZXJhdGlvbiIsImNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkIiwiaGFuZGxlRm9sbG93dXAiLCJydW5BZnRlclNhdmVUcmlnZ2VyIiwiY2xlYW5Vc2VyQXV0aERhdGEiLCJpc01hc3RlciIsImFjbCIsInVzZXIiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsImNvbmNhdCIsImFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsInN5c3RlbUNsYXNzZXMiLCJpbmRleE9mIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiaGFzQ2xhc3MiLCJ2YWxpZGF0ZU9iamVjdCIsInRyaWdnZXJFeGlzdHMiLCJUeXBlcyIsImJlZm9yZVNhdmUiLCJhcHBsaWNhdGlvbklkIiwiZXh0cmFEYXRhIiwib3JpZ2luYWxPYmplY3QiLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRVcGRhdGVkT2JqZWN0IiwiaW5mbGF0ZSIsImRhdGFiYXNlUHJvbWlzZSIsInVwZGF0ZSIsImNyZWF0ZSIsInJlc3VsdCIsImxlbmd0aCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJtYXliZVJ1blRyaWdnZXIiLCJvYmplY3QiLCJmaWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIiwiXyIsInJlZHVjZSIsInZhbHVlIiwia2V5IiwiaXNFcXVhbCIsInB1c2giLCJydW5CZWZvcmVMb2dpblRyaWdnZXIiLCJ1c2VyRGF0YSIsImJlZm9yZUxvZ2luIiwiZ2V0QWxsQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJzY2hlbWEiLCJmaW5kIiwib25lQ2xhc3MiLCJzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQiLCJmaWVsZE5hbWUiLCJzZXREZWZhdWx0IiwidW5kZWZpbmVkIiwiX19vcCIsImZpZWxkcyIsImRlZmF1bHRWYWx1ZSIsInJlcXVpcmVkIiwiVkFMSURBVElPTl9FUlJPUiIsImNyZWF0ZWRBdCIsIm5ld09iamVjdElkIiwib2JqZWN0SWRTaXplIiwia2V5cyIsImZvckVhY2giLCJhdXRoRGF0YSIsInVzZXJuYW1lIiwiaXNFbXB0eSIsIlVTRVJOQU1FX01JU1NJTkciLCJwYXNzd29yZCIsIlBBU1NXT1JEX01JU1NJTkciLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwicHJvdmlkZXJzIiwiY2FuSGFuZGxlQXV0aERhdGEiLCJjYW5IYW5kbGUiLCJwcm92aWRlciIsInByb3ZpZGVyQXV0aERhdGEiLCJoYXNUb2tlbiIsImhhbmRsZUF1dGhEYXRhIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwidmFsaWRhdGlvbnMiLCJtYXAiLCJhdXRoRGF0YU1hbmFnZXIiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsImFsbCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsIm1lbW8iLCJxdWVyeUtleSIsImZpbHRlciIsInEiLCJmaW5kUHJvbWlzZSIsIiRvciIsImZpbHRlcmVkT2JqZWN0c0J5QUNMIiwib2JqZWN0cyIsIkFDTCIsInJlc3VsdHMiLCJyIiwiam9pbiIsInVzZXJSZXN1bHQiLCJtdXRhdGVkQXV0aERhdGEiLCJwcm92aWRlckRhdGEiLCJ1c2VyQXV0aERhdGEiLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJ1c2VySWQiLCJsb2NhdGlvbiIsIkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQiLCJwcm9taXNlIiwiZXJyb3IiLCJSZXN0UXVlcnkiLCJtYXN0ZXIiLCJfX3R5cGUiLCJzZXNzaW9uIiwiY2FjaGVDb250cm9sbGVyIiwiZGVsIiwic2Vzc2lvblRva2VuIiwiX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3kiLCJoYXNoIiwiaGFzaGVkUGFzc3dvcmQiLCJfaGFzaGVkX3Bhc3N3b3JkIiwiX3ZhbGlkYXRlVXNlck5hbWUiLCJfdmFsaWRhdGVFbWFpbCIsInJhbmRvbVN0cmluZyIsInJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lIiwiJG5lIiwibGltaXQiLCJVU0VSTkFNRV9UQUtFTiIsImVtYWlsIiwibWF0Y2giLCJyZWplY3QiLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJFTUFJTF9UQUtFTiIsInVzZXJDb250cm9sbGVyIiwic2V0RW1haWxWZXJpZnlUb2tlbiIsInBhc3N3b3JkUG9saWN5IiwiX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMiLCJfdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkiLCJwb2xpY3lFcnJvciIsInZhbGlkYXRpb25FcnJvciIsImNvbnRhaW5zVXNlcm5hbWVFcnJvciIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsIm9sZFBhc3N3b3JkcyIsIl9wYXNzd29yZF9oaXN0b3J5IiwidGFrZSIsIm5ld1Bhc3N3b3JkIiwicHJvbWlzZXMiLCJjb21wYXJlIiwiY2F0Y2giLCJlcnIiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwidmVyaWZ5VXNlckVtYWlscyIsImNyZWF0ZVNlc3Npb25Ub2tlbiIsImluc3RhbGxhdGlvbklkIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiY3JlYXRlZFdpdGgiLCJhdXRoUHJvdmlkZXIiLCJhZGRPcHMiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJhc3NpZ24iLCJkZXN0cm95IiwicmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCIsInNlc3Npb25RdWVyeSIsImJpbmQiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJhZGRpdGlvbmFsU2Vzc2lvbkRhdGEiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJzdGF0dXMiLCJkZXZpY2VUb2tlbiIsInRvTG93ZXJDYXNlIiwiZGV2aWNlVHlwZSIsImlkTWF0Y2giLCJvYmplY3RJZE1hdGNoIiwiaW5zdGFsbGF0aW9uSWRNYXRjaCIsImRldmljZVRva2VuTWF0Y2hlcyIsIm9yUXVlcmllcyIsImRlbFF1ZXJ5IiwiYXBwSWRlbnRpZmllciIsImNvZGUiLCJvYmpJZCIsImZpbGVzQ29udHJvbGxlciIsImV4cGFuZEZpbGVzSW5PYmplY3QiLCJyb2xlIiwiY2xlYXIiLCJpc1VuYXV0aGVudGljYXRlZCIsIlNFU1NJT05fTUlTU0lORyIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwibmFtZSIsIklOVkFMSURfQUNMIiwicmVhZCIsIndyaXRlIiwibWF4UGFzc3dvcmRBZ2UiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsImRlZmVyIiwiTWF0aCIsIm1heCIsInNoaWZ0IiwiX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJoYXNBZnRlclNhdmVIb29rIiwiYWZ0ZXJTYXZlIiwiaGFzTGl2ZVF1ZXJ5IiwibGl2ZVF1ZXJ5Q29udHJvbGxlciIsIl9oYW5kbGVTYXZlUmVzcG9uc2UiLCJwZXJtcyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIm9uQWZ0ZXJTYXZlIiwibG9nZ2VyIiwid2FybiIsIm1pZGRsZSIsIm1vdW50Iiwic2FuaXRpemVkRGF0YSIsInRlc3QiLCJfZGVjb2RlIiwic3BsaXR0ZWRLZXkiLCJzcGxpdCIsInBhcmVudFByb3AiLCJwYXJlbnRWYWwiLCJnZXQiLCJzZXQiLCJjbGllbnRTdXBwb3J0c0RlbGV0ZSIsInN1cHBvcnRzRm9yd2FyZERlbGV0ZSIsImRhdGFWYWx1ZSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFhQTs7QUFDQTs7QUFDQTs7OztBQWZBO0FBQ0E7QUFDQTtBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQUQsQ0FBOUI7O0FBQ0EsSUFBSUMsUUFBUSxHQUFHRCxPQUFPLENBQUMsVUFBRCxDQUF0Qjs7QUFFQSxNQUFNRSxJQUFJLEdBQUdGLE9BQU8sQ0FBQyxRQUFELENBQXBCOztBQUNBLElBQUlHLFdBQVcsR0FBR0gsT0FBTyxDQUFDLGVBQUQsQ0FBekI7O0FBQ0EsSUFBSUksY0FBYyxHQUFHSixPQUFPLENBQUMsWUFBRCxDQUE1Qjs7QUFDQSxJQUFJSyxLQUFLLEdBQUdMLE9BQU8sQ0FBQyxZQUFELENBQW5COztBQUNBLElBQUlNLFFBQVEsR0FB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bnQiOlsiLy8gQSBSZXN0V3JpdGUgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYW4gb3BlcmF0aW9uXG4vLyB0aGF0IHdyaXRlcyB0byB0aGUgZGF0YWJhc2UuXG4vLyBUaGlzIGNvdWxkIGJlIGVpdGhlciBhIFwiY3JlYXRlXCIgb3IgYW4gXCJ1cGRhdGVcIi5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcbnZhciBkZWVwY29weSA9IHJlcXVpcmUoJ2RlZXBjb3B5Jyk7XG5cbmNvbnN0IEF1dGggPSByZXF1aXJlKCcuL0F1dGgnKTtcbnZhciBjcnlwdG9VdGlscyA9IHJlcXVpcmUoJy4vY3J5cHRvVXRpbHMnKTtcbnZhciBwYXNzd29yZENyeXB0byA9IHJlcXVpcmUoJy4vcGFzc3dvcmQnKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbnZhciB0cmlnZ2VycyA9IHJlcXVpcmUoJy4vdHJpZ2dlcnMnKTtcbnZhciBDbGllbnRTREsgPSByZXF1aXJlKCcuL0NsaWVudFNESycpO1xuaW1wb3J0IFJlc3RRdWVyeSBmcm9tICcuL1Jlc3RRdWVyeSc7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuL2xvZ2dlcic7XG5cbi8vIHF1ZXJ5IGFuZCBkYXRhIGFyZSBib3RoIHByb3ZpZGVkIGluIFJFU1QgQVBJIGZvcm1hdC4gU28gZGF0YVxuLy8gdHlwZXMgYXJlIGVuY29kZWQgYnkgcGxhaW4gb2xkIG9iamVjdHMuXG4vLyBJZiBxdWVyeSBpcyBudWxsLCB0aGlzIGlzIGEgXCJjcmVhdGVcIiBhbmQgdGhlIGRhdGEgaW4gZGF0YSBzaG91bGQgYmVcbi8vIGNyZWF0ZWQuXG4vLyBPdGhlcndpc2UgdGhpcyBpcyBhbiBcInVwZGF0ZVwiIC0gdGhlIG9iamVjdCBtYXRjaGluZyB0aGUgcXVlcnlcbi8vIHNob3VsZCBnZXQgdXBkYXRlZCB3aXRoIGRhdGEuXG4vLyBSZXN0V3JpdGUgd2lsbCBoYW5kbGUgb2JqZWN0SWQsIGNyZWF0ZWRBdCwgYW5kIHVwZGF0ZWRBdCBmb3Jcbi8vIGV2ZXJ5dGhpbmcuIEl0IGFsc28ga25vd3MgdG8gdXNlIHRyaWdnZXJzIGFuZCBzcGVjaWFsIG1vZGlmaWNhdGlvbnNcbi8vIGZvciB0aGUgX1VzZXIgY2xhc3MuXG5mdW5jdGlvbiBSZXN0V3JpdGUoXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgY2xhc3NOYW1lLFxuICBxdWVyeSxcbiAgZGF0YSxcbiAgb3JpZ2luYWxEYXRhLFxuICBjbGllbnRTREssXG4gIGFjdGlvblxuKSB7XG4gIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgJ0Nhbm5vdCBwZXJmb3JtIGEgd3JpdGUgb3BlcmF0aW9uIHdoZW4gdXNpbmcgcmVhZE9ubHlNYXN0ZXJLZXknXG4gICAgKTtcbiAgfVxuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnN0b3JhZ2UgPSB7fTtcbiAgdGhpcy5ydW5PcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IHt9O1xuXG4gIGlmIChhY3Rpb24pIHtcbiAgICB0aGlzLnJ1bk9wdGlvbnMuYWN0aW9uID0gYWN0aW9uO1xuICB9XG5cbiAgaWYgKCFxdWVyeSkge1xuICAgIGlmICh0aGlzLmNvbmZpZy5hbGxvd0N1c3RvbU9iamVjdElkKSB7XG4gICAgICBpZiAoXG4gICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChkYXRhLCAnb2JqZWN0SWQnKSAmJlxuICAgICAgICAhZGF0YS5vYmplY3RJZFxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5NSVNTSU5HX09CSkVDVF9JRCxcbiAgICAgICAgICAnb2JqZWN0SWQgbXVzdCBub3QgYmUgZW1wdHksIG51bGwgb3IgdW5kZWZpbmVkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZGF0YS5vYmplY3RJZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAnb2JqZWN0SWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChkYXRhLmlkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICdpZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFdoZW4gdGhlIG9wZXJhdGlvbiBpcyBjb21wbGV0ZSwgdGhpcy5yZXNwb25zZSBtYXkgaGF2ZSBzZXZlcmFsXG4gIC8vIGZpZWxkcy5cbiAgLy8gcmVzcG9uc2U6IHRoZSBhY3R1YWwgZGF0YSB0byBiZSByZXR1cm5lZFxuICAvLyBzdGF0dXM6IHRoZSBodHRwIHN0YXR1cyBjb2RlLiBpZiBub3QgcHJlc2VudCwgdHJlYXRlZCBsaWtlIGEgMjAwXG4gIC8vIGxvY2F0aW9uOiB0aGUgbG9jYXRpb24gaGVhZGVyLiBpZiBub3QgcHJlc2VudCwgbm8gbG9jYXRpb24gaGVhZGVyXG4gIHRoaXMucmVzcG9uc2UgPSBudWxsO1xuXG4gIC8vIFByb2Nlc3NpbmcgdGhpcyBvcGVyYXRpb24gbWF5IG11dGF0ZSBvdXIgZGF0YSwgc28gd2Ugb3BlcmF0ZSBvbiBhXG4gIC8vIGNvcHlcbiAgdGhpcy5xdWVyeSA9IGRlZXBjb3B5KHF1ZXJ5KTtcbiAgdGhpcy5kYXRhID0gZGVlcGNvcHkoZGF0YSk7XG4gIC8vIFdlIG5ldmVyIGNoYW5nZSBvcmlnaW5hbERhdGEsIHNvIHdlIGRvIG5vdCBuZWVkIGEgZGVlcCBjb3B5XG4gIHRoaXMub3JpZ2luYWxEYXRhID0gb3JpZ2luYWxEYXRhO1xuXG4gIC8vIFRoZSB0aW1lc3RhbXAgd2UnbGwgdXNlIGZvciB0aGlzIHdob2xlIG9wZXJhdGlvblxuICB0aGlzLnVwZGF0ZWRBdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSkuaXNvO1xuXG4gIC8vIFNoYXJlZCBTY2hlbWFDb250cm9sbGVyIHRvIGJlIHJldXNlZCB0byByZWR1Y2UgdGhlIG51bWJlciBvZiBsb2FkU2NoZW1hKCkgY2FsbHMgcGVyIHJlcXVlc3RcbiAgLy8gT25jZSBzZXQgdGhlIHNjaGVtYURhdGEgc2hvdWxkIGJlIGltbXV0YWJsZVxuICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IG51bGw7XG59XG5cbi8vIEEgY29udmVuaWVudCBtZXRob2QgdG8gcGVyZm9ybSBhbGwgdGhlIHN0ZXBzIG9mIHByb2Nlc3NpbmcgdGhlXG4vLyB3cml0ZSwgaW4gb3JkZXIuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSB7cmVzcG9uc2UsIHN0YXR1cywgbG9jYXRpb259IG9iamVjdC5cbi8vIHN0YXR1cyBhbmQgbG9jYXRpb24gYXJlIG9wdGlvbmFsLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmdldFVzZXJBbmRSb2xlQUNMKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluc3RhbGxhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlU2Vzc2lvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQmVmb3JlU2F2ZVRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYSgpO1xuICAgIH0pXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgICByZXR1cm4gdGhpcy5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Vc2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuRGF0YWJhc2VPcGVyYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQWZ0ZXJTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY2xlYW5Vc2VyQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlc3BvbnNlO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5SZXN0V3JpdGUucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gWycqJ107XG5cbiAgaWYgKHRoaXMuYXV0aC51c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC5nZXRVc2VyUm9sZXMoKS50aGVuKHJvbGVzID0+IHtcbiAgICAgIHRoaXMucnVuT3B0aW9ucy5hY2wgPSB0aGlzLnJ1bk9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW1xuICAgICAgICB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICdUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzICcgK1xuICAgICAgICAgICAgICAnbm9uLWV4aXN0ZW50IGNsYXNzOiAnICtcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBzY2hlbWEuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlU2NoZW1hID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS52YWxpZGF0ZU9iamVjdChcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0aGlzLmRhdGEsXG4gICAgdGhpcy5xdWVyeSxcbiAgICB0aGlzLnJ1bk9wdGlvbnNcbiAgKTtcbn07XG5cbi8vIFJ1bnMgYW55IGJlZm9yZVNhdmUgdHJpZ2dlcnMgYWdhaW5zdCB0aGlzIG9wZXJhdGlvbi5cbi8vIEFueSBjaGFuZ2UgbGVhZHMgdG8gb3VyIGRhdGEgYmVpbmcgbXV0YXRlZC5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdiZWZvcmVTYXZlJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBpZiAoXG4gICAgIXRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICAgKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBDbG91ZCBjb2RlIGdldHMgYSBiaXQgb2YgZXh0cmEgZGF0YSBmb3IgaXRzIG9iamVjdHNcbiAgdmFyIGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSB9O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgZXh0cmFEYXRhLm9iamVjdElkID0gdGhpcy5xdWVyeS5vYmplY3RJZDtcbiAgfVxuXG4gIGxldCBvcmlnaW5hbE9iamVjdCA9IG51bGw7XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0aGlzLmJ1aWxkVXBkYXRlZE9iamVjdChleHRyYURhdGEpO1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgLy8gVGhpcyBpcyBhbiB1cGRhdGUgZm9yIGV4aXN0aW5nIG9iamVjdC5cbiAgICBvcmlnaW5hbE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIH1cblxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBCZWZvcmUgY2FsbGluZyB0aGUgdHJpZ2dlciwgdmFsaWRhdGUgdGhlIHBlcm1pc3Npb25zIGZvciB0aGUgc2F2ZSBvcGVyYXRpb25cbiAgICAgIGxldCBkYXRhYmFzZVByb21pc2UgPSBudWxsO1xuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIHVwZGF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIGNyZWF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLmNyZWF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIEluIHRoZSBjYXNlIHRoYXQgdGhlcmUgaXMgbm8gcGVybWlzc2lvbiBmb3IgdGhlIG9wZXJhdGlvbiwgaXQgdGhyb3dzIGFuIGVycm9yXG4gICAgICByZXR1cm4gZGF0YWJhc2VQcm9taXNlLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0Lmxlbmd0aCA8PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgICAgIHRoaXMuYXV0aCxcbiAgICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgICB0aGlzLmNvbnRleHRcbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gXy5yZWR1Y2UoXG4gICAgICAgICAgcmVzcG9uc2Uub2JqZWN0LFxuICAgICAgICAgIChyZXN1bHQsIHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgICAgIGlmICghXy5pc0VxdWFsKHRoaXMuZGF0YVtrZXldLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBbXVxuICAgICAgICApO1xuICAgICAgICB0aGlzLmRhdGEgPSByZXNwb25zZS5vYmplY3Q7XG4gICAgICAgIC8vIFdlIHNob3VsZCBkZWxldGUgdGhlIG9iamVjdElkIGZvciBhbiB1cGRhdGUgd3JpdGVcbiAgICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlTG9naW5UcmlnZ2VyID0gYXN5bmMgZnVuY3Rpb24odXNlckRhdGEpIHtcbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlTG9naW4nIHRyaWdnZXJcbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbixcbiAgICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgICApXG4gICkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIENsb3VkIGNvZGUgZ2V0cyBhIGJpdCBvZiBleHRyYSBkYXRhIGZvciBpdHMgb2JqZWN0c1xuICBjb25zdCBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUgfTtcbiAgY29uc3QgdXNlciA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB1c2VyRGF0YSk7XG5cbiAgLy8gbm8gbmVlZCB0byByZXR1cm4gYSByZXNwb25zZVxuICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgdGhpcy5hdXRoLFxuICAgIHVzZXIsXG4gICAgbnVsbCxcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmNvbnRleHRcbiAgKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuc2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5kYXRhKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKS50aGVuKGFsbENsYXNzZXMgPT4ge1xuICAgICAgY29uc3Qgc2NoZW1hID0gYWxsQ2xhc3Nlcy5maW5kKFxuICAgICAgICBvbmVDbGFzcyA9PiBvbmVDbGFzcy5jbGFzc05hbWUgPT09IHRoaXMuY2xhc3NOYW1lXG4gICAgICApO1xuICAgICAgY29uc3Qgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkID0gKGZpZWxkTmFtZSwgc2V0RGVmYXVsdCkgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSBudWxsIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICcnIHx8XG4gICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzZXREZWZhdWx0ICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IG51bGwgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAgICAgKHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWU7XG4gICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9XG4gICAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIHx8IFtdO1xuICAgICAgICAgICAgaWYgKHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5yZXF1aXJlZCA9PT0gdHJ1ZVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICBgJHtmaWVsZE5hbWV9IGlzIHJlcXVpcmVkYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIC8vIEFkZCBkZWZhdWx0IGZpZWxkc1xuICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcblxuICAgICAgICAvLyBPbmx5IGFzc2lnbiBuZXcgb2JqZWN0SWQgaWYgd2UgYXJlIGNyZWF0aW5nIG5ldyBvYmplY3RcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSBjcnlwdG9VdGlscy5uZXdPYmplY3RJZChcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLm9iamVjdElkU2l6ZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIHRydWUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHNjaGVtYSkge1xuICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCBmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cbi8vIFRyYW5zZm9ybXMgYXV0aCBkYXRhIGZvciBhIHVzZXIgb2JqZWN0LlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYSB1c2VyIG9iamVjdC5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVBdXRoRGF0YSA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIGlmIChcbiAgICAgIHR5cGVvZiB0aGlzLmRhdGEudXNlcm5hbWUgIT09ICdzdHJpbmcnIHx8XG4gICAgICBfLmlzRW1wdHkodGhpcy5kYXRhLnVzZXJuYW1lKVxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLFxuICAgICAgICAnYmFkIG9yIG1pc3NpbmcgdXNlcm5hbWUnXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICB0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fFxuICAgICAgXy5pc0VtcHR5KHRoaXMuZGF0YS5wYXNzd29yZClcbiAgICApIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORyxcbiAgICAgICAgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBpZiAoXG4gICAgKHRoaXMuZGF0YS5hdXRoRGF0YSAmJiAhT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGgpIHx8XG4gICAgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLmRhdGEsICdhdXRoRGF0YScpXG4gICkge1xuICAgIC8vIEhhbmRsZSBzYXZpbmcgYXV0aERhdGEgdG8ge30gb3IgaWYgYXV0aERhdGEgZG9lc24ndCBleGlzdFxuICAgIHJldHVybjtcbiAgfSBlbHNlIGlmIChcbiAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKSAmJlxuICAgICF0aGlzLmRhdGEuYXV0aERhdGFcbiAgKSB7XG4gICAgLy8gSGFuZGxlIHNhdmluZyBhdXRoRGF0YSB0byBudWxsXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgKTtcbiAgfVxuXG4gIHZhciBhdXRoRGF0YSA9IHRoaXMuZGF0YS5hdXRoRGF0YTtcbiAgdmFyIHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgaWYgKHByb3ZpZGVycy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgY2FuSGFuZGxlQXV0aERhdGEgPSBwcm92aWRlcnMucmVkdWNlKChjYW5IYW5kbGUsIHByb3ZpZGVyKSA9PiB7XG4gICAgICB2YXIgcHJvdmlkZXJBdXRoRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIHZhciBoYXNUb2tlbiA9IHByb3ZpZGVyQXV0aERhdGEgJiYgcHJvdmlkZXJBdXRoRGF0YS5pZDtcbiAgICAgIHJldHVybiBjYW5IYW5kbGUgJiYgKGhhc1Rva2VuIHx8IHByb3ZpZGVyQXV0aERhdGEgPT0gbnVsbCk7XG4gICAgfSwgdHJ1ZSk7XG4gICAgaWYgKGNhbkhhbmRsZUF1dGhEYXRhKSB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVBdXRoRGF0YShhdXRoRGF0YSk7XG4gICAgfVxuICB9XG4gIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiA9IGZ1bmN0aW9uKGF1dGhEYXRhKSB7XG4gIGNvbnN0IHZhbGlkYXRpb25zID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLm1hcChwcm92aWRlciA9PiB7XG4gICAgaWYgKGF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCB2YWxpZGF0ZUF1dGhEYXRhID0gdGhpcy5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKFxuICAgICAgcHJvdmlkZXJcbiAgICApO1xuICAgIGlmICghdmFsaWRhdGVBdXRoRGF0YSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbGlkYXRlQXV0aERhdGEoYXV0aERhdGFbcHJvdmlkZXJdKTtcbiAgfSk7XG4gIHJldHVybiBQcm9taXNlLmFsbCh2YWxpZGF0aW9ucyk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YSA9IGZ1bmN0aW9uKGF1dGhEYXRhKSB7XG4gIGNvbnN0IHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgY29uc3QgcXVlcnkgPSBwcm92aWRlcnNcbiAgICAucmVkdWNlKChtZW1vLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKCFhdXRoRGF0YVtwcm92aWRlcl0pIHtcbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9XG4gICAgICBjb25zdCBxdWVyeUtleSA9IGBhdXRoRGF0YS4ke3Byb3ZpZGVyfS5pZGA7XG4gICAgICBjb25zdCBxdWVyeSA9IHt9O1xuICAgICAgcXVlcnlbcXVlcnlLZXldID0gYXV0aERhdGFbcHJvdmlkZXJdLmlkO1xuICAgICAgbWVtby5wdXNoKHF1ZXJ5KTtcbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH0sIFtdKVxuICAgIC5maWx0ZXIocSA9PiB7XG4gICAgICByZXR1cm4gdHlwZW9mIHEgIT09ICd1bmRlZmluZWQnO1xuICAgIH0pO1xuXG4gIGxldCBmaW5kUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShbXSk7XG4gIGlmIChxdWVyeS5sZW5ndGggPiAwKSB7XG4gICAgZmluZFByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB7ICRvcjogcXVlcnkgfSwge30pO1xuICB9XG5cbiAgcmV0dXJuIGZpbmRQcm9taXNlO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maWx0ZXJlZE9iamVjdHNCeUFDTCA9IGZ1bmN0aW9uKG9iamVjdHMpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHJldHVybiBvYmplY3RzO1xuICB9XG4gIHJldHVybiBvYmplY3RzLmZpbHRlcihvYmplY3QgPT4ge1xuICAgIGlmICghb2JqZWN0LkFDTCkge1xuICAgICAgcmV0dXJuIHRydWU7IC8vIGxlZ2FjeSB1c2VycyB0aGF0IGhhdmUgbm8gQUNMIGZpZWxkIG9uIHRoZW1cbiAgICB9XG4gICAgLy8gUmVndWxhciB1c2VycyB0aGF0IGhhdmUgYmVlbiBsb2NrZWQgb3V0LlxuICAgIHJldHVybiBvYmplY3QuQUNMICYmIE9iamVjdC5rZXlzKG9iamVjdC5BQ0wpLmxlbmd0aCA+IDA7XG4gIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVBdXRoRGF0YSA9IGZ1bmN0aW9uKGF1dGhEYXRhKSB7XG4gIGxldCByZXN1bHRzO1xuICByZXR1cm4gdGhpcy5maW5kVXNlcnNXaXRoQXV0aERhdGEoYXV0aERhdGEpLnRoZW4oYXN5bmMgciA9PiB7XG4gICAgcmVzdWx0cyA9IHRoaXMuZmlsdGVyZWRPYmplY3RzQnlBQ0wocik7XG5cbiAgICBpZiAocmVzdWx0cy5sZW5ndGggPT0gMSkge1xuICAgICAgdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5qb2luKCcsJyk7XG5cbiAgICAgIGNvbnN0IHVzZXJSZXN1bHQgPSByZXN1bHRzWzBdO1xuICAgICAgY29uc3QgbXV0YXRlZEF1dGhEYXRhID0ge307XG4gICAgICBPYmplY3Qua2V5cyhhdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgY29uc3QgdXNlckF1dGhEYXRhID0gdXNlclJlc3VsdC5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGlmICghXy5pc0VxdWFsKHByb3ZpZGVyRGF0YSwgdXNlckF1dGhEYXRhKSkge1xuICAgICAgICAgIG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl0gPSBwcm92aWRlckRhdGE7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5sZW5ndGggIT09IDA7XG4gICAgICBsZXQgdXNlcklkO1xuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICB1c2VySWQgPSB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICAgICAgfSBlbHNlIGlmICh0aGlzLmF1dGggJiYgdGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5hdXRoLnVzZXIuaWQpIHtcbiAgICAgICAgdXNlcklkID0gdGhpcy5hdXRoLnVzZXIuaWQ7XG4gICAgICB9XG4gICAgICBpZiAoIXVzZXJJZCB8fCB1c2VySWQgPT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHtcbiAgICAgICAgLy8gbm8gdXNlciBtYWtpbmcgdGhlIGNhbGxcbiAgICAgICAgLy8gT1IgdGhlIHVzZXIgbWFraW5nIHRoZSBjYWxsIGlzIHRoZSByaWdodCBvbmVcbiAgICAgICAgLy8gTG9naW4gd2l0aCBhdXRoIGRhdGFcbiAgICAgICAgZGVsZXRlIHJlc3VsdHNbMF0ucGFzc3dvcmQ7XG5cbiAgICAgICAgLy8gbmVlZCB0byBzZXQgdGhlIG9iamVjdElkIGZpcnN0IG90aGVyd2lzZSBsb2NhdGlvbiBoYXMgdHJhaWxpbmcgdW5kZWZpbmVkXG4gICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IHVzZXJSZXN1bHQub2JqZWN0SWQ7XG5cbiAgICAgICAgaWYgKCF0aGlzLnF1ZXJ5IHx8ICF0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgLy8gdGhpcyBhIGxvZ2luIGNhbGwsIG5vIHVzZXJJZCBwYXNzZWRcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICAgICAgcmVzcG9uc2U6IHVzZXJSZXN1bHQsXG4gICAgICAgICAgICBsb2NhdGlvbjogdGhpcy5sb2NhdGlvbigpLFxuICAgICAgICAgIH07XG4gICAgICAgICAgLy8gUnVuIGJlZm9yZUxvZ2luIGhvb2sgYmVmb3JlIHN0b3JpbmcgYW55IHVwZGF0ZXNcbiAgICAgICAgICAvLyB0byBhdXRoRGF0YSBvbiB0aGUgZGI7IGNoYW5nZXMgdG8gdXNlclJlc3VsdFxuICAgICAgICAgIC8vIHdpbGwgYmUgaWdub3JlZC5cbiAgICAgICAgICBhd2FpdCB0aGlzLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlcihkZWVwY29weSh1c2VyUmVzdWx0KSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3ZSBkaWRuJ3QgY2hhbmdlIHRoZSBhdXRoIGRhdGEsIGp1c3Qga2VlcCBnb2luZ1xuICAgICAgICBpZiAoIWhhc011dGF0ZWRBdXRoRGF0YSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBXZSBoYXZlIGF1dGhEYXRhIHRoYXQgaXMgdXBkYXRlZCBvbiBsb2dpblxuICAgICAgICAvLyB0aGF0IGNhbiBoYXBwZW4gd2hlbiB0b2tlbiBhcmUgcmVmcmVzaGVkLFxuICAgICAgICAvLyBXZSBzaG91bGQgdXBkYXRlIHRoZSB0b2tlbiBhbmQgbGV0IHRoZSB1c2VyIGluXG4gICAgICAgIC8vIFdlIHNob3VsZCBvbmx5IGNoZWNrIHRoZSBtdXRhdGVkIGtleXNcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKG11dGF0ZWRBdXRoRGF0YSkudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgLy8gSUYgd2UgaGF2ZSBhIHJlc3BvbnNlLCB3ZSdsbCBza2lwIHRoZSBkYXRhYmFzZSBvcGVyYXRpb24gLyBiZWZvcmVTYXZlIC8gYWZ0ZXJTYXZlIGV0Yy4uLlxuICAgICAgICAgIC8vIHdlIG5lZWQgdG8gc2V0IGl0IHVwIHRoZXJlLlxuICAgICAgICAgIC8vIFdlIGFyZSBzdXBwb3NlZCB0byBoYXZlIGEgcmVzcG9uc2Ugb25seSBvbiBMT0dJTiB3aXRoIGF1dGhEYXRhLCBzbyB3ZSBza2lwIHRob3NlXG4gICAgICAgICAgLy8gSWYgd2UncmUgbm90IGxvZ2dpbmcgaW4sIGJ1dCBqdXN0IHVwZGF0aW5nIHRoZSBjdXJyZW50IHVzZXIsIHdlIGNhbiBzYWZlbHkgc2tpcCB0aGF0IHBhcnRcbiAgICAgICAgICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgICAgICAgICAgLy8gQXNzaWduIHRoZSBuZXcgYXV0aERhdGEgaW4gdGhlIHJlc3BvbnNlXG4gICAgICAgICAgICBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLmF1dGhEYXRhW3Byb3ZpZGVyXSA9XG4gICAgICAgICAgICAgICAgbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBSdW4gdGhlIERCIHVwZGF0ZSBkaXJlY3RseSwgYXMgJ21hc3RlcidcbiAgICAgICAgICAgIC8vIEp1c3QgdXBkYXRlIHRoZSBhdXRoRGF0YSBwYXJ0XG4gICAgICAgICAgICAvLyBUaGVuIHdlJ3JlIGdvb2QgZm9yIHRoZSB1c2VyLCBlYXJseSBleGl0IG9mIHNvcnRzXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5kYXRhLm9iamVjdElkIH0sXG4gICAgICAgICAgICAgIHsgYXV0aERhdGE6IG11dGF0ZWRBdXRoRGF0YSB9LFxuICAgICAgICAgICAgICB7fVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIGlmICh1c2VySWQpIHtcbiAgICAgICAgLy8gVHJ5aW5nIHRvIHVwZGF0ZSBhdXRoIGRhdGEgYnV0IHVzZXJzXG4gICAgICAgIC8vIGFyZSBkaWZmZXJlbnRcbiAgICAgICAgaWYgKHVzZXJSZXN1bHQub2JqZWN0SWQgIT09IHVzZXJJZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsXG4gICAgICAgICAgICAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCdcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIE5vIGF1dGggZGF0YSB3YXMgbXV0YXRlZCwganVzdCBrZWVwIGdvaW5nXG4gICAgICAgIGlmICghaGFzTXV0YXRlZEF1dGhEYXRhKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihhdXRoRGF0YSkudGhlbigoKSA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIC8vIE1vcmUgdGhhbiAxIHVzZXIgd2l0aCB0aGUgcGFzc2VkIGlkJ3NcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsXG4gICAgICAgICAgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLy8gVGhlIG5vbi10aGlyZC1wYXJ0eSBwYXJ0cyBvZiBVc2VyIHRyYW5zZm9ybWF0aW9uXG5SZXN0V3JpdGUucHJvdG90eXBlLnRyYW5zZm9ybVVzZXIgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcblxuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyICYmICdlbWFpbFZlcmlmaWVkJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBlcnJvciA9IGBDbGllbnRzIGFyZW4ndCBhbGxvd2VkIHRvIG1hbnVhbGx5IHVwZGF0ZSBlbWFpbCB2ZXJpZmljYXRpb24uYDtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTiwgZXJyb3IpO1xuICB9XG5cbiAgLy8gRG8gbm90IGNsZWFudXAgc2Vzc2lvbiBpZiBvYmplY3RJZCBpcyBub3Qgc2V0XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMub2JqZWN0SWQoKSkge1xuICAgIC8vIElmIHdlJ3JlIHVwZGF0aW5nIGEgX1VzZXIgb2JqZWN0LCB3ZSBuZWVkIHRvIGNsZWFyIG91dCB0aGUgY2FjaGUgZm9yIHRoYXQgdXNlci4gRmluZCBhbGwgdGhlaXJcbiAgICAvLyBzZXNzaW9uIHRva2VucywgYW5kIHJlbW92ZSB0aGVtIGZyb20gdGhlIGNhY2hlLlxuICAgIHByb21pc2UgPSBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksICdfU2Vzc2lvbicsIHtcbiAgICAgIHVzZXI6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgIH0sXG4gICAgfSlcbiAgICAgIC5leGVjdXRlKClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLnJlc3VsdHMuZm9yRWFjaChzZXNzaW9uID0+XG4gICAgICAgICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb24uc2Vzc2lvblRva2VuKVxuICAgICAgICApO1xuICAgICAgfSk7XG4gIH1cblxuICByZXR1cm4gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIFRyYW5zZm9ybSB0aGUgcGFzc3dvcmRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBpZ25vcmUgb25seSBpZiB1bmRlZmluZWQuIHNob3VsZCBwcm9jZWVkIGlmIGVtcHR5ICgnJylcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5xdWVyeSkge1xuICAgICAgICB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXSA9IHRydWU7XG4gICAgICAgIC8vIEdlbmVyYXRlIGEgbmV3IHNlc3Npb24gb25seSBpZiB0aGUgdXNlciByZXF1ZXN0ZWRcbiAgICAgICAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgICAgICB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uaGFzaCh0aGlzLmRhdGEucGFzc3dvcmQpLnRoZW4oaGFzaGVkUGFzc3dvcmQgPT4ge1xuICAgICAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkID0gaGFzaGVkUGFzc3dvcmQ7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5wYXNzd29yZDtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVVzZXJOYW1lKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVFbWFpbCgpO1xuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVVc2VyTmFtZSA9IGZ1bmN0aW9uKCkge1xuICAvLyBDaGVjayBmb3IgdXNlcm5hbWUgdW5pcXVlbmVzc1xuICBpZiAoIXRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgdGhpcy5kYXRhLnVzZXJuYW1lID0gY3J5cHRvVXRpbHMucmFuZG9tU3RyaW5nKDI1KTtcbiAgICAgIHRoaXMucmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gV2UgbmVlZCB0byBhIGZpbmQgdG8gY2hlY2sgZm9yIGR1cGxpY2F0ZSB1c2VybmFtZSBpbiBjYXNlIHRoZXkgYXJlIG1pc3NpbmcgdGhlIHVuaXF1ZSBpbmRleCBvbiB1c2VybmFtZXNcbiAgLy8gVE9ETzogQ2hlY2sgaWYgdGhlcmUgaXMgYSB1bmlxdWUgaW5kZXgsIGFuZCBpZiBzbywgc2tpcCB0aGlzIHF1ZXJ5LlxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgeyB1c2VybmFtZTogdGhpcy5kYXRhLnVzZXJuYW1lLCBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9IH0sXG4gICAgICB7IGxpbWl0OiAxIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVFbWFpbCA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIXRoaXMuZGF0YS5lbWFpbCB8fCB0aGlzLmRhdGEuZW1haWwuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gVmFsaWRhdGUgYmFzaWMgZW1haWwgYWRkcmVzcyBmb3JtYXRcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwubWF0Y2goL14uK0AuKyQvKSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAnRW1haWwgYWRkcmVzcyBmb3JtYXQgaXMgaW52YWxpZC4nXG4gICAgICApXG4gICAgKTtcbiAgfVxuICAvLyBTYW1lIHByb2JsZW0gZm9yIGVtYWlsIGFzIGFib3ZlIGZvciB1c2VybmFtZVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgeyBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLCBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9IH0sXG4gICAgICB7IGxpbWl0OiAxIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgICF0aGlzLmRhdGEuYXV0aERhdGEgfHxcbiAgICAgICAgIU9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoIHx8XG4gICAgICAgIChPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCA9PT0gMSAmJlxuICAgICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSlbMF0gPT09ICdhbm9ueW1vdXMnKVxuICAgICAgKSB7XG4gICAgICAgIC8vIFdlIHVwZGF0ZWQgdGhlIGVtYWlsLCBzZW5kIGEgbmV3IHZhbGlkYXRpb25cbiAgICAgICAgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSA9IHRydWU7XG4gICAgICAgIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNldEVtYWlsVmVyaWZ5VG9rZW4odGhpcy5kYXRhKTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3kgPSBmdW5jdGlvbigpIHtcbiAgaWYgKCF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSkgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cygpLnRoZW4oKCkgPT4ge1xuICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSgpO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMgPSBmdW5jdGlvbigpIHtcbiAgLy8gY2hlY2sgaWYgdGhlIHBhc3N3b3JkIGNvbmZvcm1zIHRvIHRoZSBkZWZpbmVkIHBhc3N3b3JkIHBvbGljeSBpZiBjb25maWd1cmVkXG4gIC8vIElmIHdlIHNwZWNpZmllZCBhIGN1c3RvbSBlcnJvciBpbiBvdXIgY29uZmlndXJhdGlvbiB1c2UgaXQuXG4gIC8vIEV4YW1wbGU6IFwiUGFzc3dvcmRzIG11c3QgaW5jbHVkZSBhIENhcGl0YWwgTGV0dGVyLCBMb3dlcmNhc2UgTGV0dGVyLCBhbmQgYSBudW1iZXIuXCJcbiAgLy9cbiAgLy8gVGhpcyBpcyBlc3BlY2lhbGx5IHVzZWZ1bCBvbiB0aGUgZ2VuZXJpYyBcInBhc3N3b3JkIHJlc2V0XCIgcGFnZSxcbiAgLy8gYXMgaXQgYWxsb3dzIHRoZSBwcm9ncmFtbWVyIHRvIGNvbW11bmljYXRlIHNwZWNpZmljIHJlcXVpcmVtZW50cyBpbnN0ZWFkIG9mOlxuICAvLyBhLiBtYWtpbmcgdGhlIHVzZXIgZ3Vlc3Mgd2hhdHMgd3JvbmdcbiAgLy8gYi4gbWFraW5nIGEgY3VzdG9tIHBhc3N3b3JkIHJlc2V0IHBhZ2UgdGhhdCBzaG93cyB0aGUgcmVxdWlyZW1lbnRzXG4gIGNvbnN0IHBvbGljeUVycm9yID0gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgPyB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0aW9uRXJyb3JcbiAgICA6ICdQYXNzd29yZCBkb2VzIG5vdCBtZWV0IHRoZSBQYXNzd29yZCBQb2xpY3kgcmVxdWlyZW1lbnRzLic7XG4gIGNvbnN0IGNvbnRhaW5zVXNlcm5hbWVFcnJvciA9ICdQYXNzd29yZCBjYW5ub3QgY29udGFpbiB5b3VyIHVzZXJuYW1lLic7XG5cbiAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgbWVldHMgdGhlIHBhc3N3b3JkIHN0cmVuZ3RoIHJlcXVpcmVtZW50c1xuICBpZiAoXG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IgJiZcbiAgICAgICF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yKHRoaXMuZGF0YS5wYXNzd29yZCkpIHx8XG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sodGhpcy5kYXRhLnBhc3N3b3JkKSlcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIHBvbGljeUVycm9yKVxuICAgICk7XG4gIH1cblxuICAvLyBjaGVjayB3aGV0aGVyIHBhc3N3b3JkIGNvbnRhaW4gdXNlcm5hbWVcbiAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSA9PT0gdHJ1ZSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICAgIC8vIHVzZXJuYW1lIGlzIG5vdCBwYXNzZWQgZHVyaW5nIHBhc3N3b3JkIHJlc2V0XG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YodGhpcy5kYXRhLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGNvbnRhaW5zVXNlcm5hbWVFcnJvcilcbiAgICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcmV0cmlldmUgdGhlIFVzZXIgb2JqZWN0IHVzaW5nIG9iamVjdElkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKCdfVXNlcicsIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9KVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YocmVzdWx0c1swXS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgICAgICAgY29udGFpbnNVc2VybmFtZUVycm9yXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkgPSBmdW5jdGlvbigpIHtcbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBpcyByZXBlYXRpbmcgZnJvbSBzcGVjaWZpZWQgaGlzdG9yeVxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgaWYgKHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnkpXG4gICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDFcbiAgICAgICAgICApO1xuICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgY29uc3QgbmV3UGFzc3dvcmQgPSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIC8vIGNvbXBhcmUgdGhlIG5ldyBwYXNzd29yZCBoYXNoIHdpdGggYWxsIG9sZCBwYXNzd29yZCBoYXNoZXNcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBvbGRQYXNzd29yZHMubWFwKGZ1bmN0aW9uKGhhc2gpIHtcbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShuZXdQYXNzd29yZCwgaGFzaCkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdClcbiAgICAgICAgICAgICAgLy8gcmVqZWN0IGlmIHRoZXJlIGlzIGEgbWF0Y2hcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KCdSRVBFQVRfUEFTU1dPUkQnKTtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIHdhaXQgZm9yIGFsbCBjb21wYXJpc29ucyB0byBjb21wbGV0ZVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyID09PSAnUkVQRUFUX1BBU1NXT1JEJylcbiAgICAgICAgICAgICAgLy8gYSBtYXRjaCB3YXMgZm91bmRcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgICAgICAgICBgTmV3IHBhc3N3b3JkIHNob3VsZCBub3QgYmUgdGhlIHNhbWUgYXMgbGFzdCAke3RoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeX0gcGFzc3dvcmRzLmBcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBzZXNzaW9uIGZvciB1cGRhdGluZyB1c2VyICh0aGlzLnF1ZXJ5IGlzIHNldCkgdW5sZXNzIGF1dGhEYXRhIGV4aXN0c1xuICBpZiAodGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERvbid0IGdlbmVyYXRlIG5ldyBzZXNzaW9uVG9rZW4gaWYgbGlua2luZyB2aWEgc2Vzc2lvblRva2VuXG4gIGlmICh0aGlzLmF1dGgudXNlciAmJiB0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKFxuICAgICF0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddICYmIC8vIHNpZ251cCBjYWxsLCB3aXRoXG4gICAgdGhpcy5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCAmJiAvLyBubyBsb2dpbiB3aXRob3V0IHZlcmlmaWNhdGlvblxuICAgIHRoaXMuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHNcbiAgKSB7XG4gICAgLy8gdmVyaWZpY2F0aW9uIGlzIG9uXG4gICAgcmV0dXJuOyAvLyBkbyBub3QgY3JlYXRlIHRoZSBzZXNzaW9uIHRva2VuIGluIHRoYXQgY2FzZSFcbiAgfVxuICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY3JlYXRlU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24oKSB7XG4gIC8vIGNsb3VkIGluc3RhbGxhdGlvbklkIGZyb20gQ2xvdWQgQ29kZSxcbiAgLy8gbmV2ZXIgY3JlYXRlIHNlc3Npb24gdG9rZW5zIGZyb20gdGhlcmUuXG4gIGlmICh0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQgJiYgdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkID09PSAnY2xvdWQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gQXV0aC5jcmVhdGVTZXNzaW9uKHRoaXMuY29uZmlnLCB7XG4gICAgdXNlcklkOiB0aGlzLm9iamVjdElkKCksXG4gICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgIGFjdGlvbjogdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSA/ICdsb2dpbicgOiAnc2lnbnVwJyxcbiAgICAgIGF1dGhQcm92aWRlcjogdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSB8fCAncGFzc3dvcmQnLFxuICAgIH0sXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCxcbiAgfSk7XG5cbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2Uuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgcmV0dXJuIGNyZWF0ZVNlc3Npb24oKTtcbn07XG5cbi8vIERlbGV0ZSBlbWFpbCByZXNldCB0b2tlbnMgaWYgdXNlciBpcyBjaGFuZ2luZyBwYXNzd29yZCBvciBlbWFpbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQgPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8IHRoaXMucXVlcnkgPT09IG51bGwpIHtcbiAgICAvLyBudWxsIHF1ZXJ5IG1lYW5zIGNyZWF0ZVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICgncGFzc3dvcmQnIGluIHRoaXMuZGF0YSB8fCAnZW1haWwnIGluIHRoaXMuZGF0YSkge1xuICAgIGNvbnN0IGFkZE9wcyA9IHtcbiAgICAgIF9wZXJpc2hhYmxlX3Rva2VuOiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgICBfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0OiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgfTtcbiAgICB0aGlzLmRhdGEgPSBPYmplY3QuYXNzaWduKHRoaXMuZGF0YSwgYWRkT3BzKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zID0gZnVuY3Rpb24oKSB7XG4gIC8vIE9ubHkgZm9yIF9TZXNzaW9uLCBhbmQgYXQgY3JlYXRpb24gdGltZVxuICBpZiAodGhpcy5jbGFzc05hbWUgIT0gJ19TZXNzaW9uJyB8fCB0aGlzLnF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERlc3Ryb3kgdGhlIHNlc3Npb25zIGluICdCYWNrZ3JvdW5kJ1xuICBjb25zdCB7IHVzZXIsIGluc3RhbGxhdGlvbklkLCBzZXNzaW9uVG9rZW4gfSA9IHRoaXMuZGF0YTtcbiAgaWYgKCF1c2VyIHx8ICFpbnN0YWxsYXRpb25JZCkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIXVzZXIub2JqZWN0SWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveShcbiAgICAnX1Nlc3Npb24nLFxuICAgIHtcbiAgICAgIHVzZXIsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHNlc3Npb25Ub2tlbjogeyAkbmU6IHNlc3Npb25Ub2tlbiB9LFxuICAgIH0sXG4gICAge30sXG4gICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgKTtcbn07XG5cbi8vIEhhbmRsZXMgYW55IGZvbGxvd3VwIGxvZ2ljXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUZvbGxvd3VwID0gZnVuY3Rpb24oKSB7XG4gIGlmIChcbiAgICB0aGlzLnN0b3JhZ2UgJiZcbiAgICB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXSAmJlxuICAgIHRoaXMuY29uZmlnLnJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXRcbiAgKSB7XG4gICAgdmFyIHNlc3Npb25RdWVyeSA9IHtcbiAgICAgIHVzZXI6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ107XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZGVzdHJveSgnX1Nlc3Npb24nLCBzZXNzaW9uUXVlcnkpXG4gICAgICAudGhlbih0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcykpO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddKSB7XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ107XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCkudGhlbih0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcykpO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddKSB7XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ107XG4gICAgLy8gRmlyZSBhbmQgZm9yZ2V0IVxuICAgIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCh0aGlzLmRhdGEpO1xuICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcyk7XG4gIH1cbn07XG5cbi8vIEhhbmRsZXMgdGhlIF9TZXNzaW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gX1Nlc3Npb24gb2JqZWN0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVTZXNzaW9uID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX1Nlc3Npb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGgudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLFxuICAgICAgJ1Nlc3Npb24gdG9rZW4gcmVxdWlyZWQuJ1xuICAgICk7XG4gIH1cblxuICAvLyBUT0RPOiBWZXJpZnkgcHJvcGVyIGVycm9yIHRvIHRocm93XG4gIGlmICh0aGlzLmRhdGEuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICdDYW5ub3Qgc2V0ICcgKyAnQUNMIG9uIGEgU2Vzc2lvbi4nXG4gICAgKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgaWYgKFxuICAgICAgdGhpcy5kYXRhLnVzZXIgJiZcbiAgICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICAgIHRoaXMuZGF0YS51c2VyLm9iamVjdElkICE9IHRoaXMuYXV0aC51c2VyLmlkXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9XG4gIH1cblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGNvbnN0IGFkZGl0aW9uYWxTZXNzaW9uRGF0YSA9IHt9O1xuICAgIGZvciAodmFyIGtleSBpbiB0aGlzLmRhdGEpIHtcbiAgICAgIGlmIChrZXkgPT09ICdvYmplY3RJZCcgfHwga2V5ID09PSAndXNlcicpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBhZGRpdGlvbmFsU2Vzc2lvbkRhdGFba2V5XSA9IHRoaXMuZGF0YVtrZXldO1xuICAgIH1cblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IEF1dGguY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZScsXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNyZWF0ZVNlc3Npb24oKS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKCFyZXN1bHRzLnJlc3BvbnNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICAgJ0Vycm9yIGNyZWF0aW5nIHNlc3Npb24uJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgc2Vzc2lvbkRhdGFbJ29iamVjdElkJ10gPSByZXN1bHRzLnJlc3BvbnNlWydvYmplY3RJZCddO1xuICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgIGxvY2F0aW9uOiByZXN1bHRzLmxvY2F0aW9uLFxuICAgICAgICByZXNwb25zZTogc2Vzc2lvbkRhdGEsXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfSW5zdGFsbGF0aW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gaW5zdGFsbGF0aW9uIG9iamVjdC5cbi8vIElmIGFuIGluc3RhbGxhdGlvbiBpcyBmb3VuZCwgdGhpcyBjYW4gbXV0YXRlIHRoaXMucXVlcnkgYW5kIHR1cm4gYSBjcmVhdGVcbi8vIGludG8gYW4gdXBkYXRlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVJbnN0YWxsYXRpb24gPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgfHwgdGhpcy5jbGFzc05hbWUgIT09ICdfSW5zdGFsbGF0aW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChcbiAgICAhdGhpcy5xdWVyeSAmJlxuICAgICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiZcbiAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgIXRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZFxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAxMzUsXG4gICAgICAnYXQgbGVhc3Qgb25lIElEIGZpZWxkIChkZXZpY2VUb2tlbiwgaW5zdGFsbGF0aW9uSWQpICcgK1xuICAgICAgICAnbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nXG4gICAgKTtcbiAgfVxuXG4gIC8vIElmIHRoZSBkZXZpY2UgdG9rZW4gaXMgNjQgY2hhcmFjdGVycyBsb25nLCB3ZSBhc3N1bWUgaXQgaXMgZm9yIGlPU1xuICAvLyBhbmQgbG93ZXJjYXNlIGl0LlxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuICYmIHRoaXMuZGF0YS5kZXZpY2VUb2tlbi5sZW5ndGggPT0gNjQpIHtcbiAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4udG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIC8vIFdlIGxvd2VyY2FzZSB0aGUgaW5zdGFsbGF0aW9uSWQgaWYgcHJlc2VudFxuICBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICBsZXQgaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQ7XG5cbiAgLy8gSWYgZGF0YS5pbnN0YWxsYXRpb25JZCBpcyBub3Qgc2V0IGFuZCB3ZSdyZSBub3QgbWFzdGVyLCB3ZSBjYW4gbG9va3VwIGluIGF1dGhcbiAgaWYgKCFpbnN0YWxsYXRpb25JZCAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cblxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBpbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBVcGRhdGluZyBfSW5zdGFsbGF0aW9uIGJ1dCBub3QgdXBkYXRpbmcgYW55dGhpbmcgY3JpdGljYWxcbiAgaWYgKFxuICAgIHRoaXMucXVlcnkgJiZcbiAgICAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgIWluc3RhbGxhdGlvbklkICYmXG4gICAgIXRoaXMuZGF0YS5kZXZpY2VUeXBlXG4gICkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgdmFyIGlkTWF0Y2g7IC8vIFdpbGwgYmUgYSBtYXRjaCBvbiBlaXRoZXIgb2JqZWN0SWQgb3IgaW5zdGFsbGF0aW9uSWRcbiAgdmFyIG9iamVjdElkTWF0Y2g7XG4gIHZhciBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICB2YXIgZGV2aWNlVG9rZW5NYXRjaGVzID0gW107XG5cbiAgLy8gSW5zdGVhZCBvZiBpc3N1aW5nIDMgcmVhZHMsIGxldCdzIGRvIGl0IHdpdGggb25lIE9SLlxuICBjb25zdCBvclF1ZXJpZXMgPSBbXTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIG9iamVjdElkOiB0aGlzLnF1ZXJ5Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcbiAgfVxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goeyBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuIH0pO1xuICB9XG5cbiAgaWYgKG9yUXVlcmllcy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByb21pc2UgPSBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfSW5zdGFsbGF0aW9uJyxcbiAgICAgICAge1xuICAgICAgICAgICRvcjogb3JRdWVyaWVzLFxuICAgICAgICB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLnF1ZXJ5ICYmXG4gICAgICAgICAgdGhpcy5xdWVyeS5vYmplY3RJZCAmJlxuICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9PSB0aGlzLnF1ZXJ5Lm9iamVjdElkXG4gICAgICAgICkge1xuICAgICAgICAgIG9iamVjdElkTWF0Y2ggPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc3VsdC5pbnN0YWxsYXRpb25JZCA9PSBpbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgIGluc3RhbGxhdGlvbklkTWF0Y2ggPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc3VsdC5kZXZpY2VUb2tlbiA9PSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICAgICAgICBkZXZpY2VUb2tlbk1hdGNoZXMucHVzaChyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gU2FuaXR5IGNoZWNrcyB3aGVuIHJ1bm5pbmcgYSBxdWVyeVxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICBpZiAoIW9iamVjdElkTWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgJ09iamVjdCBub3QgZm91bmQgZm9yIHVwZGF0ZS4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAhPT0gb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZFxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzYsXG4gICAgICAgICAgICAnaW5zdGFsbGF0aW9uSWQgbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgICAgICAgb2JqZWN0SWRNYXRjaC5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgICF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICAhb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZFxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzYsXG4gICAgICAgICAgICAnZGV2aWNlVG9rZW4gbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICE9PSBvYmplY3RJZE1hdGNoLmRldmljZVR5cGVcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgMTM2LFxuICAgICAgICAgICAgJ2RldmljZVR5cGUgbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIG9iamVjdElkTWF0Y2gpIHtcbiAgICAgICAgaWRNYXRjaCA9IG9iamVjdElkTWF0Y2g7XG4gICAgICB9XG5cbiAgICAgIGlmIChpbnN0YWxsYXRpb25JZCAmJiBpbnN0YWxsYXRpb25JZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gbmVlZCB0byBzcGVjaWZ5IGRldmljZVR5cGUgb25seSBpZiBpdCdzIG5ld1xuICAgICAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJiAhaWRNYXRjaCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgMTM1LFxuICAgICAgICAgICdkZXZpY2VUeXBlIG11c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKCFpZE1hdGNoKSB7XG4gICAgICAgIGlmICghZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoID09IDEgJiZcbiAgICAgICAgICAoIWRldmljZVRva2VuTWF0Y2hlc1swXVsnaW5zdGFsbGF0aW9uSWQnXSB8fCAhaW5zdGFsbGF0aW9uSWQpXG4gICAgICAgICkge1xuICAgICAgICAgIC8vIFNpbmdsZSBtYXRjaCBvbiBkZXZpY2UgdG9rZW4gYnV0IG5vbmUgb24gaW5zdGFsbGF0aW9uSWQsIGFuZCBlaXRoZXJcbiAgICAgICAgICAvLyB0aGUgcGFzc2VkIG9iamVjdCBvciB0aGUgbWF0Y2ggaXMgbWlzc2luZyBhbiBpbnN0YWxsYXRpb25JZCwgc28gd2VcbiAgICAgICAgICAvLyBjYW4ganVzdCByZXR1cm4gdGhlIG1hdGNoLlxuICAgICAgICAgIHJldHVybiBkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ29iamVjdElkJ107XG4gICAgICAgIH0gZWxzZSBpZiAoIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIDEzMixcbiAgICAgICAgICAgICdNdXN0IHNwZWNpZnkgaW5zdGFsbGF0aW9uSWQgd2hlbiBkZXZpY2VUb2tlbiAnICtcbiAgICAgICAgICAgICAgJ21hdGNoZXMgbXVsdGlwbGUgSW5zdGFsbGF0aW9uIG9iamVjdHMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBNdWx0aXBsZSBkZXZpY2UgdG9rZW4gbWF0Y2hlcyBhbmQgd2Ugc3BlY2lmaWVkIGFuIGluc3RhbGxhdGlvbiBJRCxcbiAgICAgICAgICAvLyBvciBhIHNpbmdsZSBtYXRjaCB3aGVyZSBib3RoIHRoZSBwYXNzZWQgYW5kIG1hdGNoaW5nIG9iamVjdHMgaGF2ZVxuICAgICAgICAgIC8vIGFuIGluc3RhbGxhdGlvbiBJRC4gVHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoXG4gICAgICAgICAgLy8gdGhlIGRldmljZVRva2VuLCBhbmQgcmV0dXJuIG5pbCB0byBzaWduYWwgdGhhdCBhIG5ldyBvYmplY3Qgc2hvdWxkXG4gICAgICAgICAgLy8gYmUgY3JlYXRlZC5cbiAgICAgICAgICB2YXIgZGVsUXVlcnkgPSB7XG4gICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHtcbiAgICAgICAgICAgICAgJG5lOiBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhLmFwcElkZW50aWZpZXIpIHtcbiAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWQuXG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmXG4gICAgICAgICAgIWRldmljZVRva2VuTWF0Y2hlc1swXVsnaW5zdGFsbGF0aW9uSWQnXVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBFeGFjdGx5IG9uZSBkZXZpY2UgdG9rZW4gbWF0Y2ggYW5kIGl0IGRvZXNuJ3QgaGF2ZSBhbiBpbnN0YWxsYXRpb25cbiAgICAgICAgICAvLyBJRC4gVGhpcyBpcyB0aGUgb25lIGNhc2Ugd2hlcmUgd2Ugd2FudCB0byBtZXJnZSB3aXRoIHRoZSBleGlzdGluZ1xuICAgICAgICAgIC8vIG9iamVjdC5cbiAgICAgICAgICBjb25zdCBkZWxRdWVyeSA9IHsgb2JqZWN0SWQ6IGlkTWF0Y2gub2JqZWN0SWQgfTtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgICAgIC5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ29iamVjdElkJ107XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWRcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgICAgICAgICBpZE1hdGNoLmRldmljZVRva2VuICE9IHRoaXMuZGF0YS5kZXZpY2VUb2tlblxuICAgICAgICAgICkge1xuICAgICAgICAgICAgLy8gV2UncmUgc2V0dGluZyB0aGUgZGV2aWNlIHRva2VuIG9uIGFuIGV4aXN0aW5nIGluc3RhbGxhdGlvbiwgc29cbiAgICAgICAgICAgIC8vIHdlIHNob3VsZCB0cnkgY2xlYW5pbmcgb3V0IG9sZCBpbnN0YWxsYXRpb25zIHRoYXQgbWF0Y2ggdGhpc1xuICAgICAgICAgICAgLy8gZGV2aWNlIHRva2VuLlxuICAgICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7XG4gICAgICAgICAgICAgIGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgLy8gV2UgaGF2ZSBhIHVuaXF1ZSBpbnN0YWxsIElkLCB1c2UgdGhhdCB0byBwcmVzZXJ2ZVxuICAgICAgICAgICAgLy8gdGhlIGludGVyZXN0aW5nIGluc3RhbGxhdGlvblxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgICAgICBkZWxRdWVyeVsnaW5zdGFsbGF0aW9uSWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICAgIGlkTWF0Y2gub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIGlkTWF0Y2gub2JqZWN0SWQgPT0gdGhpcy5kYXRhLm9iamVjdElkXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgLy8gd2UgcGFzc2VkIGFuIG9iamVjdElkLCBwcmVzZXJ2ZSB0aGF0IGluc3RhbGF0aW9uXG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydvYmplY3RJZCddID0ge1xuICAgICAgICAgICAgICAgICRuZTogaWRNYXRjaC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIFdoYXQgdG8gZG8gaGVyZT8gY2FuJ3QgcmVhbGx5IGNsZWFuIHVwIGV2ZXJ5dGhpbmcuLi5cbiAgICAgICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhLmFwcElkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2FwcElkZW50aWZpZXInXSA9IHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgICAgICAgLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSlcbiAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEluIG5vbi1tZXJnZSBzY2VuYXJpb3MsIGp1c3QgcmV0dXJuIHRoZSBpbnN0YWxsYXRpb24gbWF0Y2ggaWRcbiAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4ob2JqSWQgPT4ge1xuICAgICAgaWYgKG9iaklkKSB7XG4gICAgICAgIHRoaXMucXVlcnkgPSB7IG9iamVjdElkOiBvYmpJZCB9O1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcbiAgICAgIH1cbiAgICAgIC8vIFRPRE86IFZhbGlkYXRlIG9wcyAoYWRkL3JlbW92ZSBvbiBjaGFubmVscywgJGluYyBvbiBiYWRnZSwgZXRjLilcbiAgICB9KTtcbiAgcmV0dXJuIHByb21pc2U7XG59O1xuXG4vLyBJZiB3ZSBzaG9ydC1jaXJjdXRlZCB0aGUgb2JqZWN0IHJlc3BvbnNlIC0gdGhlbiB3ZSBuZWVkIHRvIG1ha2Ugc3VyZSB3ZSBleHBhbmQgYWxsIHRoZSBmaWxlcyxcbi8vIHNpbmNlIHRoaXMgbWlnaHQgbm90IGhhdmUgYSBxdWVyeSwgbWVhbmluZyBpdCB3b24ndCByZXR1cm4gdGhlIGZ1bGwgcmVzdWx0IGJhY2suXG4vLyBUT0RPOiAobmx1dHNlbmtvKSBUaGlzIHNob3VsZCBkaWUgd2hlbiB3ZSBtb3ZlIHRvIHBlci1jbGFzcyBiYXNlZCBjb250cm9sbGVycyBvbiBfU2Vzc2lvbi9fVXNlclxuUmVzdFdyaXRlLnByb3RvdHlwZS5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cyA9IGZ1bmN0aW9uKCkge1xuICAvLyBDaGVjayB3aGV0aGVyIHdlIGhhdmUgYSBzaG9ydC1jaXJjdWl0ZWQgcmVzcG9uc2UgLSBvbmx5IHRoZW4gcnVuIGV4cGFuc2lvbi5cbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlXG4gICAgKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5EYXRhYmFzZU9wZXJhdGlvbiA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Sb2xlJykge1xuICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci5yb2xlLmNsZWFyKCk7XG4gIH1cblxuICBpZiAoXG4gICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICB0aGlzLnF1ZXJ5ICYmXG4gICAgdGhpcy5hdXRoLmlzVW5hdXRoZW50aWNhdGVkKClcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuU0VTU0lPTl9NSVNTSU5HLFxuICAgICAgYENhbm5vdCBtb2RpZnkgdXNlciAke3RoaXMucXVlcnkub2JqZWN0SWR9LmBcbiAgICApO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1Byb2R1Y3QnICYmIHRoaXMuZGF0YS5kb3dubG9hZCkge1xuICAgIHRoaXMuZGF0YS5kb3dubG9hZE5hbWUgPSB0aGlzLmRhdGEuZG93bmxvYWQubmFtZTtcbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBiZXR0ZXIgZGV0ZWN0aW9uIGZvciBBQ0wsIGVuc3VyaW5nIGEgdXNlciBjYW4ndCBiZSBsb2NrZWQgZnJvbVxuICAvLyAgICAgICB0aGVpciBvd24gdXNlciByZWNvcmQuXG4gIGlmICh0aGlzLmRhdGEuQUNMICYmIHRoaXMuZGF0YS5BQ0xbJyp1bnJlc29sdmVkJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9BQ0wsICdJbnZhbGlkIEFDTC4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgLy8gRm9yY2UgdGhlIHVzZXIgdG8gbm90IGxvY2tvdXRcbiAgICAvLyBNYXRjaGVkIHdpdGggcGFyc2UuY29tXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5BQ0wgJiZcbiAgICAgIHRoaXMuYXV0aC5pc01hc3RlciAhPT0gdHJ1ZVxuICAgICkge1xuICAgICAgdGhpcy5kYXRhLkFDTFt0aGlzLnF1ZXJ5Lm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICB9XG4gICAgLy8gdXBkYXRlIHBhc3N3b3JkIHRpbWVzdGFtcCBpZiB1c2VyIHBhc3N3b3JkIGlzIGJlaW5nIGNoYW5nZWRcbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICkge1xuICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKTtcbiAgICB9XG4gICAgLy8gSWdub3JlIGNyZWF0ZWRBdCB3aGVuIHVwZGF0ZVxuICAgIGRlbGV0ZSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuXG4gICAgbGV0IGRlZmVyID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgLy8gaWYgcGFzc3dvcmQgaGlzdG9yeSBpcyBlbmFibGVkIHRoZW4gc2F2ZSB0aGUgY3VycmVudCBwYXNzd29yZCB0byBoaXN0b3J5XG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5XG4gICAgKSB7XG4gICAgICBkZWZlciA9IHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9XG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgbGV0IG9sZFBhc3N3b3JkcyA9IFtdO1xuICAgICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMgPSBfLnRha2UoXG4gICAgICAgICAgICAgIHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnksXG4gICAgICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy9uLTEgcGFzc3dvcmRzIGdvIGludG8gaGlzdG9yeSBpbmNsdWRpbmcgbGFzdCBwYXNzd29yZFxuICAgICAgICAgIHdoaWxlIChcbiAgICAgICAgICAgIG9sZFBhc3N3b3Jkcy5sZW5ndGggPlxuICAgICAgICAgICAgTWF0aC5tYXgoMCwgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IC0gMilcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3Jkcy5zaGlmdCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2hpc3RvcnkgPSBvbGRQYXNzd29yZHM7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBkZWZlci50aGVuKCgpID0+IHtcbiAgICAgIC8vIFJ1biBhbiB1cGRhdGVcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAudXBkYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICByZXNwb25zZS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgICB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKHJlc3BvbnNlLCB0aGlzLmRhdGEpO1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3BvbnNlIH07XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIC8vIFNldCB0aGUgZGVmYXVsdCBBQ0wgYW5kIHBhc3N3b3JkIHRpbWVzdGFtcCBmb3IgdGhlIG5ldyBfVXNlclxuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgdmFyIEFDTCA9IHRoaXMuZGF0YS5BQ0w7XG4gICAgICAvLyBkZWZhdWx0IHB1YmxpYyByL3cgQUNMXG4gICAgICBpZiAoIUFDTCkge1xuICAgICAgICBBQ0wgPSB7fTtcbiAgICAgICAgQUNMWycqJ10gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiBmYWxzZSB9O1xuICAgICAgfVxuICAgICAgLy8gbWFrZSBzdXJlIHRoZSB1c2VyIGlzIG5vdCBsb2NrZWQgZG93blxuICAgICAgQUNMW3RoaXMuZGF0YS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgICB0aGlzLmRhdGEuQUNMID0gQUNMO1xuICAgICAgLy8gcGFzc3dvcmQgdGltZXN0YW1wIHRvIGJlIHVzZWQgd2hlbiBwYXNzd29yZCBleHBpcnkgcG9saWN5IGlzIGVuZm9yY2VkXG4gICAgICBpZiAoXG4gICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgICApIHtcbiAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSdW4gYSBjcmVhdGVcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5jcmVhdGUoXG4gICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgZmFsc2UsXG4gICAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHxcbiAgICAgICAgICBlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUVcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBRdWljayBjaGVjaywgaWYgd2Ugd2VyZSBhYmxlIHRvIGluZmVyIHRoZSBkdXBsaWNhdGVkIGZpZWxkIG5hbWVcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGVycm9yICYmXG4gICAgICAgICAgZXJyb3IudXNlckluZm8gJiZcbiAgICAgICAgICBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAndXNlcm5hbWUnXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgZXJyb3IgJiZcbiAgICAgICAgICBlcnJvci51c2VySW5mbyAmJlxuICAgICAgICAgIGVycm9yLnVzZXJJbmZvLmR1cGxpY2F0ZWRfZmllbGQgPT09ICdlbWFpbCdcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhpcyB3YXMgYSBmYWlsZWQgdXNlciBjcmVhdGlvbiBkdWUgdG8gdXNlcm5hbWUgb3IgZW1haWwgYWxyZWFkeSB0YWtlbiwgd2UgbmVlZCB0b1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIGl0IHdhcyB1c2VybmFtZSBvciBlbWFpbCBhbmQgcmV0dXJuIHRoZSBhcHByb3ByaWF0ZSBlcnJvci5cbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gdGhlIG9yaWdpbmFsIG1ldGhvZFxuICAgICAgICAvLyBUT0RPOiBTZWUgaWYgd2UgY2FuIGxhdGVyIGRvIHRoaXMgd2l0aG91dCBhZGRpdGlvbmFsIHF1ZXJpZXMgYnkgdXNpbmcgbmFtZWQgaW5kZXhlcy5cbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgLmZpbmQoXG4gICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICApXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICAgIHsgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCwgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSB9LFxuICAgICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIHJlc3BvbnNlLm9iamVjdElkID0gdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICByZXNwb25zZS5jcmVhdGVkQXQgPSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuXG4gICAgICAgIGlmICh0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lKSB7XG4gICAgICAgICAgcmVzcG9uc2UudXNlcm5hbWUgPSB0aGlzLmRhdGEudXNlcm5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgICBzdGF0dXM6IDIwMSxcbiAgICAgICAgICByZXNwb25zZSxcbiAgICAgICAgICBsb2NhdGlvbjogdGhpcy5sb2NhdGlvbigpLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gIH1cbn07XG5cbi8vIFJldHVybnMgbm90aGluZyAtIGRvZXNuJ3Qgd2FpdCBmb3IgdGhlIHRyaWdnZXIuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkFmdGVyU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbigpIHtcbiAgaWYgKCF0aGlzLnJlc3BvbnNlIHx8ICF0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYWZ0ZXJTYXZlJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBjb25zdCBoYXNBZnRlclNhdmVIb29rID0gdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyhcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZFxuICApO1xuICBjb25zdCBoYXNMaXZlUXVlcnkgPSB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLmhhc0xpdmVRdWVyeShcbiAgICB0aGlzLmNsYXNzTmFtZVxuICApO1xuICBpZiAoIWhhc0FmdGVyU2F2ZUhvb2sgJiYgIWhhc0xpdmVRdWVyeSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIHZhciBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUgfTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIGV4dHJhRGF0YS5vYmplY3RJZCA9IHRoaXMucXVlcnkub2JqZWN0SWQ7XG4gIH1cblxuICAvLyBCdWlsZCB0aGUgb3JpZ2luYWwgb2JqZWN0LCB3ZSBvbmx5IGRvIHRoaXMgZm9yIGEgdXBkYXRlIHdyaXRlLlxuICBsZXQgb3JpZ2luYWxPYmplY3Q7XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvcmlnaW5hbE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIH1cblxuICAvLyBCdWlsZCB0aGUgaW5mbGF0ZWQgb2JqZWN0LCBkaWZmZXJlbnQgZnJvbSBiZWZvcmVTYXZlLCBvcmlnaW5hbERhdGEgaXMgbm90IGVtcHR5XG4gIC8vIHNpbmNlIGRldmVsb3BlcnMgY2FuIGNoYW5nZSBkYXRhIGluIHRoZSBiZWZvcmVTYXZlLlxuICBjb25zdCB1cGRhdGVkT2JqZWN0ID0gdGhpcy5idWlsZFVwZGF0ZWRPYmplY3QoZXh0cmFEYXRhKTtcbiAgdXBkYXRlZE9iamVjdC5faGFuZGxlU2F2ZVJlc3BvbnNlKFxuICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UsXG4gICAgdGhpcy5yZXNwb25zZS5zdGF0dXMgfHwgMjAwXG4gICk7XG5cbiAgdGhpcy5jb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgLy8gTm90aWZpeSBMaXZlUXVlcnlTZXJ2ZXIgaWYgcG9zc2libGVcbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYUNvbnRyb2xsZXIuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKFxuICAgICAgdXBkYXRlZE9iamVjdC5jbGFzc05hbWVcbiAgICApO1xuICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIub25BZnRlclNhdmUoXG4gICAgICB1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgIHBlcm1zXG4gICAgKTtcbiAgfSk7XG5cbiAgLy8gUnVuIGFmdGVyU2F2ZSB0cmlnZ2VyXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1blRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIHRoaXMuY29udGV4dFxuICAgIClcbiAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0Jykge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlID0gcmVzdWx0O1xuICAgICAgfVxuICAgIH0pXG4gICAgLmNhdGNoKGZ1bmN0aW9uKGVycikge1xuICAgICAgbG9nZ2VyLndhcm4oJ2FmdGVyU2F2ZSBjYXVnaHQgYW4gZXJyb3InLCBlcnIpO1xuICAgIH0pO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZmlndXJlIG91dCB3aGF0IGxvY2F0aW9uIHRoaXMgb3BlcmF0aW9uIGhhcHBlbnMgYXQuXG5SZXN0V3JpdGUucHJvdG90eXBlLmxvY2F0aW9uID0gZnVuY3Rpb24oKSB7XG4gIHZhciBtaWRkbGUgPVxuICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInID8gJy91c2Vycy8nIDogJy9jbGFzc2VzLycgKyB0aGlzLmNsYXNzTmFtZSArICcvJztcbiAgcmV0dXJuIHRoaXMuY29uZmlnLm1vdW50ICsgbWlkZGxlICsgdGhpcy5kYXRhLm9iamVjdElkO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IHRoZSBvYmplY3QgaWQgZm9yIHRoaXMgb3BlcmF0aW9uLlxuLy8gQmVjYXVzZSBpdCBjb3VsZCBiZSBlaXRoZXIgb24gdGhlIHF1ZXJ5IG9yIG9uIHRoZSBkYXRhXG5SZXN0V3JpdGUucHJvdG90eXBlLm9iamVjdElkID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmRhdGEub2JqZWN0SWQgfHwgdGhpcy5xdWVyeS5vYmplY3RJZDtcbn07XG5cbi8vIFJldHVybnMgYSBjb3B5IG9mIHRoZSBkYXRhIGFuZCBkZWxldGUgYmFkIGtleXMgKF9hdXRoX2RhdGEsIF9oYXNoZWRfcGFzc3dvcmQuLi4pXG5SZXN0V3JpdGUucHJvdG90eXBlLnNhbml0aXplZERhdGEgPSBmdW5jdGlvbigpIHtcbiAgY29uc3QgZGF0YSA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKChkYXRhLCBrZXkpID0+IHtcbiAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgaWYgKCEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuICByZXR1cm4gUGFyc2UuX2RlY29kZSh1bmRlZmluZWQsIGRhdGEpO1xufTtcblxuLy8gUmV0dXJucyBhbiB1cGRhdGVkIGNvcHkgb2YgdGhlIG9iamVjdFxuUmVzdFdyaXRlLnByb3RvdHlwZS5idWlsZFVwZGF0ZWRPYmplY3QgPSBmdW5jdGlvbihleHRyYURhdGEpIHtcbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKGZ1bmN0aW9uKGRhdGEsIGtleSkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgLy8gc3ViZG9jdW1lbnQga2V5IHdpdGggZG90IG5vdGF0aW9uICgneC55Jzp2ID0+ICd4Jzp7J3knOnZ9KVxuICAgICAgY29uc3Qgc3BsaXR0ZWRLZXkgPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IHBhcmVudFByb3AgPSBzcGxpdHRlZEtleVswXTtcbiAgICAgIGxldCBwYXJlbnRWYWwgPSB1cGRhdGVkT2JqZWN0LmdldChwYXJlbnRQcm9wKTtcbiAgICAgIGlmICh0eXBlb2YgcGFyZW50VmFsICE9PSAnb2JqZWN0Jykge1xuICAgICAgICBwYXJlbnRWYWwgPSB7fTtcbiAgICAgIH1cbiAgICAgIHBhcmVudFZhbFtzcGxpdHRlZEtleVsxXV0gPSBkYXRhW2tleV07XG4gICAgICB1cGRhdGVkT2JqZWN0LnNldChwYXJlbnRQcm9wLCBwYXJlbnRWYWwpO1xuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuXG4gIHVwZGF0ZWRPYmplY3Quc2V0KHRoaXMuc2FuaXRpemVkRGF0YSgpKTtcbiAgcmV0dXJuIHVwZGF0ZWRPYmplY3Q7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNsZWFuVXNlckF1dGhEYXRhID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgJiYgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjb25zdCB1c2VyID0gdGhpcy5yZXNwb25zZS5yZXNwb25zZTtcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhID0gZnVuY3Rpb24ocmVzcG9uc2UsIGRhdGEpIHtcbiAgaWYgKF8uaXNFbXB0eSh0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlcikpIHtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cbiAgY29uc3QgY2xpZW50U3VwcG9ydHNEZWxldGUgPSBDbGllbnRTREsuc3VwcG9ydHNGb3J3YXJkRGVsZXRlKHRoaXMuY2xpZW50U0RLKTtcbiAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGNvbnN0IGRhdGFWYWx1ZSA9IGRhdGFbZmllbGROYW1lXTtcblxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3BvbnNlLCBmaWVsZE5hbWUpKSB7XG4gICAgICByZXNwb25zZVtmaWVsZE5hbWVdID0gZGF0YVZhbHVlO1xuICAgIH1cblxuICAgIC8vIFN0cmlwcyBvcGVyYXRpb25zIGZyb20gcmVzcG9uc2VzXG4gICAgaWYgKHJlc3BvbnNlW2ZpZWxkTmFtZV0gJiYgcmVzcG9uc2VbZmllbGROYW1lXS5fX29wKSB7XG4gICAgICBkZWxldGUgcmVzcG9uc2VbZmllbGROYW1lXTtcbiAgICAgIGlmIChjbGllbnRTdXBwb3J0c0RlbGV0ZSAmJiBkYXRhVmFsdWUuX19vcCA9PSAnRGVsZXRlJykge1xuICAgICAgICByZXNwb25zZVtmaWVsZE5hbWVdID0gZGF0YVZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIHJldHVybiByZXNwb25zZTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFJlc3RXcml0ZTtcbm1vZHVsZS5leHBvcnRzID0gUmVzdFdyaXRlO1xuIl19