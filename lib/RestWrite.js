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
function RestWrite(config, auth, className, query, data, originalData, clientSDK, context, action) {
  if (auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Cannot perform a write operation when using readOnlyMasterKey');
  }

  this.config = config;
  this.auth = auth;
  this.className = className;
  this.clientSDK = clientSDK;
  this.storage = {};
  this.runOptions = {};
  this.context = context || {};

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
    return this.ensureUniqueAuthDataId();
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
    // Append the authDataResponse if exists
    if (this.authDataResponse) {
      if (this.response && this.response.response) {
        this.response.response.authDataResponse = this.authDataResponse;
      }
    }

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
      databasePromise = this.config.database.update(this.className, this.query, this.data, this.runOptions, true, true);
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
  }; // Expand file objects

  this.config.filesController.expandFilesInObject(this.config, userData);
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

  const authData = this.data.authData;
  const hasUsernameAndPassword = typeof this.data.username === 'string' && typeof this.data.password === 'string';

  if (!this.query && !authData) {
    if (typeof this.data.username !== 'string' || _lodash.default.isEmpty(this.data.username)) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'bad or missing username');
    }

    if (typeof this.data.password !== 'string' || _lodash.default.isEmpty(this.data.password)) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required');
    }
  }

  if (authData && !Object.keys(authData).length || !Object.prototype.hasOwnProperty.call(this.data, 'authData')) {
    // Nothing to validate here
    return;
  } else if (Object.prototype.hasOwnProperty.call(this.data, 'authData') && !this.data.authData) {
    // Handle saving authData to null
    throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
  }

  var providers = Object.keys(authData);

  if (providers.length > 0) {
    const canHandleAuthData = providers.some(provider => {
      var providerAuthData = authData[provider];
      var hasToken = providerAuthData && providerAuthData.id;
      return hasToken || providerAuthData === null;
    });

    if (canHandleAuthData || hasUsernameAndPassword || this.auth.isMaster || this.getUserId()) {
      return this.handleAuthData(authData);
    }
  }

  throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
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

RestWrite.prototype.getUserId = function () {
  if (this.query && this.query.objectId && this.className === '_User') {
    return this.query.objectId;
  } else if (this.auth && this.auth.user && this.auth.user.id) {
    return this.auth.user.id;
  }
}; // Developers are allowed to change authData via before save trigger
// we need after before save to ensure that the developer
// is not currently duplicating auth data ID


RestWrite.prototype.ensureUniqueAuthDataId = async function () {
  if (this.className !== '_User') return;
  if (!this.data.authData) return;
  const hasAuthDataId = Object.keys(this.data.authData).some(key => this.data.authData[key] && this.data.authData[key].id);
  if (!hasAuthDataId) return;
  const r = await Auth.findUsersWithAuthData(this.config, this.data.authData);
  const results = this.filteredObjectsByACL(r);

  if (results.length > 1) {
    throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
  } // use data.objectId in case of login time and found user during handle validateAuthData


  const userId = this.getUserId() || this.data.objectId;

  if (results.length === 1 && userId !== results[0].objectId) {
    throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
  }
};

RestWrite.prototype.handleAuthData = async function (authData) {
  const r = await Auth.findUsersWithAuthData(this.config, authData);
  const results = this.filteredObjectsByACL(r);

  if (results.length > 1) {
    // To avoid https://github.com/parse-community/parse-server/security/advisories/GHSA-8w3j-g983-8jh5
    // Let's run some validation before throwing
    await Auth.handleAuthDataValidation(authData, this, results[0]);
    throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
  } // No user found with provided authData we need to validate


  if (!results.length) {
    const {
      authData: validatedAuthData,
      authDataResponse
    } = await Auth.handleAuthDataValidation(authData, this);
    this.authDataResponse = authDataResponse; // Replace current authData by the new validated one

    this.data.authData = validatedAuthData;
    return;
  } // User found with provided authData


  if (results.length === 1) {
    const userId = this.getUserId();
    const userResult = results[0]; // Prevent duplicate authData id

    if (userId && userId !== userResult.objectId) {
      throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
    }

    this.storage['authProvider'] = Object.keys(authData).join(',');
    const {
      hasMutatedAuthData,
      mutatedAuthData
    } = Auth.hasMutatedAuthData(authData, userResult.authData);
    const isCurrentUserLoggedOrMaster = this.auth && this.auth.user && this.auth.user.id === userResult.objectId || this.auth.isMaster; // Prevent validating if no mutated data detected

    if (!hasMutatedAuthData && isCurrentUserLoggedOrMaster) {
      return;
    }

    const isLogin = !userId;

    if (isLogin || hasMutatedAuthData) {
      // no user making the call
      // OR the user making the call is the right one
      // Login with auth data
      delete results[0].password; // need to set the objectId first otherwise location has trailing undefined

      this.data.objectId = userResult.objectId;

      if (isLogin) {
        this.response = {
          response: userResult,
          location: this.location()
        }; // Run beforeLogin hook before storing any updates
        // to authData on the db; changes to userResult
        // will be ignored.

        await this.runBeforeLoginTrigger(deepcopy(userResult)); // If we are in login operation via authData
        // we need to be sure that the user has provided
        // required authData

        Auth.checkIfUserHasProvidedConfiguredProvidersForLogin(authData, userResult.authData, this.config);
      } // Force to validate all provided authData on login
      // on update only validate mutated ones


      const res = await Auth.handleAuthDataValidation(isLogin ? authData : mutatedAuthData, this, userResult);
      this.data.authData = res.authData;
      this.authDataResponse = res.authDataResponse; // IF we are in login we'll skip the database operation / beforeSave / afterSave etc...
      // we need to set it up there.
      // We are supposed to have a response only on LOGIN with authData, so we skip those
      // If we're not logging in, but just updating the current user, we can safely skip that part

      if (isLogin && hasMutatedAuthData && Object.keys(this.data.authData).length) {
        // Assign the new authData in the response
        Object.keys(mutatedAuthData).forEach(provider => {
          this.response.response.authData[provider] = mutatedAuthData[provider];
        }); // Run the DB update directly, as 'master'
        // Just update the authData part
        // Then we're good for the user, early exit of sorts

        await this.config.database.update(this.className, {
          objectId: this.data.objectId
        }, {
          authData: this.data.authData
        }, {});
      }
    }
  }
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
  } = RestWrite.createSession(this.config, {
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
};

RestWrite.createSession = function (config, {
  userId,
  createdWith,
  installationId,
  additionalSessionData
}) {
  const token = 'r:' + cryptoUtils.newToken();
  const expiresAt = config.generateSessionExpiresAt();
  const sessionData = {
    sessionToken: token,
    user: {
      __type: 'Pointer',
      className: '_User',
      objectId: userId
    },
    createdWith,
    restricted: false,
    expiresAt: Parse._encode(expiresAt)
  };

  if (installationId) {
    sessionData.installationId = installationId;
  }

  Object.assign(sessionData, additionalSessionData);
  return {
    sessionData,
    createSession: () => new RestWrite(config, Auth.master(config), '_Session', null, sessionData).execute()
  };
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
    } = RestWrite.createSession(this.config, {
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
}; // If we short-circuited the object response - then we need to make sure we expand all the files,
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
  const mount = this.config.mount || this.config.serverURL;
  return mount + middle + this.data.objectId;
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
      if (typeof data[key].__op === 'string') {
        updatedObject.set(key, data[key]);
      } else {
        // subdocument key with dot notation { 'x.y': v } => { 'x': { 'y' : v } })
        const splittedKey = key.split('.');
        const parentProp = splittedKey[0];
        let parentVal = updatedObject.get(parentProp);

        if (typeof parentVal !== 'object') {
          parentVal = {};
        }

        parentVal[splittedKey[1]] = data[key];
        updatedObject.set(parentProp, parentVal);
      }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJkZWVwY29weSIsIkF1dGgiLCJjcnlwdG9VdGlscyIsInBhc3N3b3JkQ3J5cHRvIiwiUGFyc2UiLCJ0cmlnZ2VycyIsIkNsaWVudFNESyIsIlJlc3RXcml0ZSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJxdWVyeSIsImRhdGEiLCJvcmlnaW5hbERhdGEiLCJjbGllbnRTREsiLCJjb250ZXh0IiwiYWN0aW9uIiwiaXNSZWFkT25seSIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInN0b3JhZ2UiLCJydW5PcHRpb25zIiwiYWxsb3dDdXN0b21PYmplY3RJZCIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm9iamVjdElkIiwiTUlTU0lOR19PQkpFQ1RfSUQiLCJJTlZBTElEX0tFWV9OQU1FIiwiaWQiLCJyZXNwb25zZSIsInVwZGF0ZWRBdCIsIl9lbmNvZGUiLCJEYXRlIiwiaXNvIiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwiZXhlY3V0ZSIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImdldFVzZXJBbmRSb2xlQUNMIiwidmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uIiwiaGFuZGxlSW5zdGFsbGF0aW9uIiwiaGFuZGxlU2Vzc2lvbiIsInZhbGlkYXRlQXV0aERhdGEiLCJydW5CZWZvcmVTYXZlVHJpZ2dlciIsImVuc3VyZVVuaXF1ZUF1dGhEYXRhSWQiLCJkZWxldGVFbWFpbFJlc2V0VG9rZW5JZk5lZWRlZCIsInZhbGlkYXRlU2NoZW1hIiwic2NoZW1hQ29udHJvbGxlciIsInNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQiLCJ0cmFuc2Zvcm1Vc2VyIiwiZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMiLCJkZXN0cm95RHVwbGljYXRlZFNlc3Npb25zIiwicnVuRGF0YWJhc2VPcGVyYXRpb24iLCJjcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCIsImhhbmRsZUZvbGxvd3VwIiwicnVuQWZ0ZXJTYXZlVHJpZ2dlciIsImNsZWFuVXNlckF1dGhEYXRhIiwiYXV0aERhdGFSZXNwb25zZSIsImlzTWFzdGVyIiwiYWNsIiwidXNlciIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwiY29uY2F0IiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImluZGV4T2YiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJoYXNDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYmVmb3JlU2F2ZSIsImFwcGxpY2F0aW9uSWQiLCJleHRyYURhdGEiLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFVwZGF0ZWRPYmplY3QiLCJpbmZsYXRlIiwiZGF0YWJhc2VQcm9taXNlIiwidXBkYXRlIiwiY3JlYXRlIiwicmVzdWx0IiwibGVuZ3RoIiwiT0JKRUNUX05PVF9GT1VORCIsIm1heWJlUnVuVHJpZ2dlciIsIm9iamVjdCIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJfIiwicmVkdWNlIiwidmFsdWUiLCJrZXkiLCJpc0VxdWFsIiwicHVzaCIsInJ1bkJlZm9yZUxvZ2luVHJpZ2dlciIsInVzZXJEYXRhIiwiYmVmb3JlTG9naW4iLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiZ2V0QWxsQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJzY2hlbWEiLCJmaW5kIiwib25lQ2xhc3MiLCJzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQiLCJmaWVsZE5hbWUiLCJzZXREZWZhdWx0IiwidW5kZWZpbmVkIiwiX19vcCIsImZpZWxkcyIsImRlZmF1bHRWYWx1ZSIsInJlcXVpcmVkIiwiVkFMSURBVElPTl9FUlJPUiIsImNyZWF0ZWRBdCIsIm5ld09iamVjdElkIiwib2JqZWN0SWRTaXplIiwia2V5cyIsImZvckVhY2giLCJhdXRoRGF0YSIsImhhc1VzZXJuYW1lQW5kUGFzc3dvcmQiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiaXNFbXB0eSIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInByb3ZpZGVycyIsImNhbkhhbmRsZUF1dGhEYXRhIiwic29tZSIsInByb3ZpZGVyIiwicHJvdmlkZXJBdXRoRGF0YSIsImhhc1Rva2VuIiwiZ2V0VXNlcklkIiwiaGFuZGxlQXV0aERhdGEiLCJmaWx0ZXJlZE9iamVjdHNCeUFDTCIsIm9iamVjdHMiLCJmaWx0ZXIiLCJBQ0wiLCJoYXNBdXRoRGF0YUlkIiwiciIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsInJlc3VsdHMiLCJBQ0NPVU5UX0FMUkVBRFlfTElOS0VEIiwidXNlcklkIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwidmFsaWRhdGVkQXV0aERhdGEiLCJ1c2VyUmVzdWx0Iiwiam9pbiIsImhhc011dGF0ZWRBdXRoRGF0YSIsIm11dGF0ZWRBdXRoRGF0YSIsImlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3RlciIsImlzTG9naW4iLCJsb2NhdGlvbiIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJyZXMiLCJwcm9taXNlIiwiZXJyb3IiLCJSZXN0UXVlcnkiLCJtYXN0ZXIiLCJfX3R5cGUiLCJzZXNzaW9uIiwiY2FjaGVDb250cm9sbGVyIiwiZGVsIiwic2Vzc2lvblRva2VuIiwiX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3kiLCJoYXNoIiwiaGFzaGVkUGFzc3dvcmQiLCJfaGFzaGVkX3Bhc3N3b3JkIiwiX3ZhbGlkYXRlVXNlck5hbWUiLCJfdmFsaWRhdGVFbWFpbCIsInJhbmRvbVN0cmluZyIsInJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lIiwiJG5lIiwibGltaXQiLCJjYXNlSW5zZW5zaXRpdmUiLCJVU0VSTkFNRV9UQUtFTiIsImVtYWlsIiwibWF0Y2giLCJyZWplY3QiLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJFTUFJTF9UQUtFTiIsInVzZXJDb250cm9sbGVyIiwic2V0RW1haWxWZXJpZnlUb2tlbiIsInBhc3N3b3JkUG9saWN5IiwiX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMiLCJfdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkiLCJwb2xpY3lFcnJvciIsInZhbGlkYXRpb25FcnJvciIsImNvbnRhaW5zVXNlcm5hbWVFcnJvciIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsIm9sZFBhc3N3b3JkcyIsIl9wYXNzd29yZF9oaXN0b3J5IiwidGFrZSIsIm5ld1Bhc3N3b3JkIiwicHJvbWlzZXMiLCJtYXAiLCJjb21wYXJlIiwiYWxsIiwiY2F0Y2giLCJlcnIiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwidmVyaWZ5VXNlckVtYWlscyIsImNyZWF0ZVNlc3Npb25Ub2tlbiIsImluc3RhbGxhdGlvbklkIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiY3JlYXRlZFdpdGgiLCJhdXRoUHJvdmlkZXIiLCJhZGRpdGlvbmFsU2Vzc2lvbkRhdGEiLCJ0b2tlbiIsIm5ld1Rva2VuIiwiZXhwaXJlc0F0IiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwicmVzdHJpY3RlZCIsImFzc2lnbiIsImFkZE9wcyIsIl9wZXJpc2hhYmxlX3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCIsImRlc3Ryb3kiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0Iiwic2Vzc2lvblF1ZXJ5IiwiYmluZCIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInN0YXR1cyIsImRldmljZVRva2VuIiwidG9Mb3dlckNhc2UiLCJkZXZpY2VUeXBlIiwiaWRNYXRjaCIsIm9iamVjdElkTWF0Y2giLCJpbnN0YWxsYXRpb25JZE1hdGNoIiwiZGV2aWNlVG9rZW5NYXRjaGVzIiwib3JRdWVyaWVzIiwiJG9yIiwiZGVsUXVlcnkiLCJhcHBJZGVudGlmaWVyIiwiY29kZSIsIm9iaklkIiwicm9sZSIsImNsZWFyIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJTRVNTSU9OX01JU1NJTkciLCJkb3dubG9hZCIsImRvd25sb2FkTmFtZSIsIm5hbWUiLCJJTlZBTElEX0FDTCIsInJlYWQiLCJ3cml0ZSIsIm1heFBhc3N3b3JkQWdlIiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJkZWZlciIsIk1hdGgiLCJtYXgiLCJzaGlmdCIsIl91cGRhdGVSZXNwb25zZVdpdGhEYXRhIiwiRFVQTElDQVRFX1ZBTFVFIiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiaGFzQWZ0ZXJTYXZlSG9vayIsImFmdGVyU2F2ZSIsImhhc0xpdmVRdWVyeSIsImxpdmVRdWVyeUNvbnRyb2xsZXIiLCJfaGFuZGxlU2F2ZVJlc3BvbnNlIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJvbkFmdGVyU2F2ZSIsImxvZ2dlciIsIndhcm4iLCJtaWRkbGUiLCJtb3VudCIsInNlcnZlclVSTCIsInNhbml0aXplZERhdGEiLCJ0ZXN0IiwiX2RlY29kZSIsInNldCIsInNwbGl0dGVkS2V5Iiwic3BsaXQiLCJwYXJlbnRQcm9wIiwicGFyZW50VmFsIiwiZ2V0IiwiY2xpZW50U3VwcG9ydHNEZWxldGUiLCJzdXBwb3J0c0ZvcndhcmREZWxldGUiLCJkYXRhVmFsdWUiLCJtb2R1bGUiLCJleHBvcnRzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBYUE7O0FBQ0E7O0FBQ0E7Ozs7QUFmQTtBQUNBO0FBQ0E7QUFFQSxJQUFJQSxnQkFBZ0IsR0FBR0MsT0FBTyxDQUFDLGdDQUFELENBQTlCOztBQUNBLElBQUlDLFFBQVEsR0FBR0QsT0FBTyxDQUFDLFVBQUQsQ0FBdEI7O0FBRUEsTUFB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bkQsYUFBT2pGLFFBQVEsQ0FBQzhFLFNBQUQsQ0FBZjs7QUFDQSxVQUFJbUwsb0JBQW9CLElBQUlFLFNBQVMsQ0FBQ2xMLElBQVYsSUFBa0IsUUFBOUMsRUFBd0Q7QUFDdERqRixRQUFBQSxRQUFRLENBQUM4RSxTQUFELENBQVIsR0FBc0JxTCxTQUF0QjtBQUNEO0FBQ0Y7QUFDRixHQWREO0FBZUEsU0FBT25RLFFBQVA7QUFDRCxDQXJCRDs7ZUF1QmV4QixTOztBQUNmNFIsTUFBTSxDQUFDQyxPQUFQLEdBQWlCN1IsU0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIFJlc3RXcml0ZSBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhbiBvcGVyYXRpb25cbi8vIHRoYXQgd3JpdGVzIHRvIHRoZSBkYXRhYmFzZS5cbi8vIFRoaXMgY291bGQgYmUgZWl0aGVyIGEgXCJjcmVhdGVcIiBvciBhbiBcInVwZGF0ZVwiLlxuXG52YXIgU2NoZW1hQ29udHJvbGxlciA9IHJlcXVpcmUoJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcicpO1xudmFyIGRlZXBjb3B5ID0gcmVxdWlyZSgnZGVlcGNvcHknKTtcblxuY29uc3QgQXV0aCA9IHJlcXVpcmUoJy4vQXV0aCcpO1xudmFyIGNyeXB0b1V0aWxzID0gcmVxdWlyZSgnLi9jcnlwdG9VdGlscycpO1xudmFyIHBhc3N3b3JkQ3J5cHRvID0gcmVxdWlyZSgnLi9wYXNzd29yZCcpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xudmFyIHRyaWdnZXJzID0gcmVxdWlyZSgnLi90cmlnZ2VycycpO1xudmFyIENsaWVudFNESyA9IHJlcXVpcmUoJy4vQ2xpZW50U0RLJyk7XG5pbXBvcnQgUmVzdFF1ZXJ5IGZyb20gJy4vUmVzdFF1ZXJ5JztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcblxuLy8gcXVlcnkgYW5kIGRhdGEgYXJlIGJvdGggcHJvdmlkZWQgaW4gUkVTVCBBUEkgZm9ybWF0LiBTbyBkYXRhXG4vLyB0eXBlcyBhcmUgZW5jb2RlZCBieSBwbGFpbiBvbGQgb2JqZWN0cy5cbi8vIElmIHF1ZXJ5IGlzIG51bGwsIHRoaXMgaXMgYSBcImNyZWF0ZVwiIGFuZCB0aGUgZGF0YSBpbiBkYXRhIHNob3VsZCBiZVxuLy8gY3JlYXRlZC5cbi8vIE90aGVyd2lzZSB0aGlzIGlzIGFuIFwidXBkYXRlXCIgLSB0aGUgb2JqZWN0IG1hdGNoaW5nIHRoZSBxdWVyeVxuLy8gc2hvdWxkIGdldCB1cGRhdGVkIHdpdGggZGF0YS5cbi8vIFJlc3RXcml0ZSB3aWxsIGhhbmRsZSBvYmplY3RJZCwgY3JlYXRlZEF0LCBhbmQgdXBkYXRlZEF0IGZvclxuLy8gZXZlcnl0aGluZy4gSXQgYWxzbyBrbm93cyB0byB1c2UgdHJpZ2dlcnMgYW5kIHNwZWNpYWwgbW9kaWZpY2F0aW9uc1xuLy8gZm9yIHRoZSBfVXNlciBjbGFzcy5cbmZ1bmN0aW9uIFJlc3RXcml0ZShjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgcXVlcnksIGRhdGEsIG9yaWdpbmFsRGF0YSwgY2xpZW50U0RLLCBjb250ZXh0LCBhY3Rpb24pIHtcbiAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAnQ2Fubm90IHBlcmZvcm0gYSB3cml0ZSBvcGVyYXRpb24gd2hlbiB1c2luZyByZWFkT25seU1hc3RlcktleSdcbiAgICApO1xuICB9XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmF1dGggPSBhdXRoO1xuICB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgdGhpcy5jbGllbnRTREsgPSBjbGllbnRTREs7XG4gIHRoaXMuc3RvcmFnZSA9IHt9O1xuICB0aGlzLnJ1bk9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0gY29udGV4dCB8fCB7fTtcblxuICBpZiAoYWN0aW9uKSB7XG4gICAgdGhpcy5ydW5PcHRpb25zLmFjdGlvbiA9IGFjdGlvbjtcbiAgfVxuXG4gIGlmICghcXVlcnkpIHtcbiAgICBpZiAodGhpcy5jb25maWcuYWxsb3dDdXN0b21PYmplY3RJZCkge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChkYXRhLCAnb2JqZWN0SWQnKSAmJiAhZGF0YS5vYmplY3RJZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuTUlTU0lOR19PQkpFQ1RfSUQsXG4gICAgICAgICAgJ29iamVjdElkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsIG9yIHVuZGVmaW5lZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdvYmplY3RJZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgICBpZiAoZGF0YS5pZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ2lkIGlzIGFuIGludmFsaWQgZmllbGQgbmFtZS4nKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBXaGVuIHRoZSBvcGVyYXRpb24gaXMgY29tcGxldGUsIHRoaXMucmVzcG9uc2UgbWF5IGhhdmUgc2V2ZXJhbFxuICAvLyBmaWVsZHMuXG4gIC8vIHJlc3BvbnNlOiB0aGUgYWN0dWFsIGRhdGEgdG8gYmUgcmV0dXJuZWRcbiAgLy8gc3RhdHVzOiB0aGUgaHR0cCBzdGF0dXMgY29kZS4gaWYgbm90IHByZXNlbnQsIHRyZWF0ZWQgbGlrZSBhIDIwMFxuICAvLyBsb2NhdGlvbjogdGhlIGxvY2F0aW9uIGhlYWRlci4gaWYgbm90IHByZXNlbnQsIG5vIGxvY2F0aW9uIGhlYWRlclxuICB0aGlzLnJlc3BvbnNlID0gbnVsbDtcblxuICAvLyBQcm9jZXNzaW5nIHRoaXMgb3BlcmF0aW9uIG1heSBtdXRhdGUgb3VyIGRhdGEsIHNvIHdlIG9wZXJhdGUgb24gYVxuICAvLyBjb3B5XG4gIHRoaXMucXVlcnkgPSBkZWVwY29weShxdWVyeSk7XG4gIHRoaXMuZGF0YSA9IGRlZXBjb3B5KGRhdGEpO1xuICAvLyBXZSBuZXZlciBjaGFuZ2Ugb3JpZ2luYWxEYXRhLCBzbyB3ZSBkbyBub3QgbmVlZCBhIGRlZXAgY29weVxuICB0aGlzLm9yaWdpbmFsRGF0YSA9IG9yaWdpbmFsRGF0YTtcblxuICAvLyBUaGUgdGltZXN0YW1wIHdlJ2xsIHVzZSBmb3IgdGhpcyB3aG9sZSBvcGVyYXRpb25cbiAgdGhpcy51cGRhdGVkQXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpLmlzbztcblxuICAvLyBTaGFyZWQgU2NoZW1hQ29udHJvbGxlciB0byBiZSByZXVzZWQgdG8gcmVkdWNlIHRoZSBudW1iZXIgb2YgbG9hZFNjaGVtYSgpIGNhbGxzIHBlciByZXF1ZXN0XG4gIC8vIE9uY2Ugc2V0IHRoZSBzY2hlbWFEYXRhIHNob3VsZCBiZSBpbW11dGFibGVcbiAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIgPSBudWxsO1xufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIHRoZVxuLy8gd3JpdGUsIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEge3Jlc3BvbnNlLCBzdGF0dXMsIGxvY2F0aW9ufSBvYmplY3QuXG4vLyBzdGF0dXMgYW5kIGxvY2F0aW9uIGFyZSBvcHRpb25hbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5zdGFsbGF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVTZXNzaW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5CZWZvcmVTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZW5zdXJlVW5pcXVlQXV0aERhdGFJZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hKCk7XG4gICAgfSlcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB0aGlzLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybVVzZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5EYXRhYmFzZU9wZXJhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlclNhdmVUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jbGVhblVzZXJBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gQXBwZW5kIHRoZSBhdXRoRGF0YVJlc3BvbnNlIGlmIGV4aXN0c1xuICAgICAgaWYgKHRoaXMuYXV0aERhdGFSZXNwb25zZSkge1xuICAgICAgICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVJlc3BvbnNlID0gdGhpcy5hdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5yZXNwb25zZTtcbiAgICB9KTtcbn07XG5cbi8vIFVzZXMgdGhlIEF1dGggb2JqZWN0IHRvIGdldCB0aGUgbGlzdCBvZiByb2xlcywgYWRkcyB0aGUgdXNlciBpZFxuUmVzdFdyaXRlLnByb3RvdHlwZS5nZXRVc2VyQW5kUm9sZUFDTCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIHRoaXMucnVuT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5ydW5PcHRpb25zLmFjbCA9IHRoaXMucnVuT3B0aW9ucy5hY2wuY29uY2F0KHJvbGVzLCBbdGhpcy5hdXRoLnVzZXIuaWRdKTtcbiAgICAgIHJldHVybjtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gY29uZmlnLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChcbiAgICB0aGlzLmNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT09IGZhbHNlICYmXG4gICAgIXRoaXMuYXV0aC5pc01hc3RlciAmJlxuICAgIFNjaGVtYUNvbnRyb2xsZXIuc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKHRoaXMuY2xhc3NOYW1lKSA9PT0gLTFcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuaGFzQ2xhc3ModGhpcy5jbGFzc05hbWUpKVxuICAgICAgLnRoZW4oaGFzQ2xhc3MgPT4ge1xuICAgICAgICBpZiAoaGFzQ2xhc3MgIT09IHRydWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgJ1RoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBhY2Nlc3MgJyArICdub24tZXhpc3RlbnQgY2xhc3M6ICcgKyB0aGlzLmNsYXNzTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIHNjaGVtYS5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVTY2hlbWEgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS52YWxpZGF0ZU9iamVjdChcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0aGlzLmRhdGEsXG4gICAgdGhpcy5xdWVyeSxcbiAgICB0aGlzLnJ1bk9wdGlvbnNcbiAgKTtcbn07XG5cbi8vIFJ1bnMgYW55IGJlZm9yZVNhdmUgdHJpZ2dlcnMgYWdhaW5zdCB0aGlzIG9wZXJhdGlvbi5cbi8vIEFueSBjaGFuZ2UgbGVhZHMgdG8gb3VyIGRhdGEgYmVpbmcgbXV0YXRlZC5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKHRoaXMuY2xhc3NOYW1lLCB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLCB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBDbG91ZCBjb2RlIGdldHMgYSBiaXQgb2YgZXh0cmEgZGF0YSBmb3IgaXRzIG9iamVjdHNcbiAgdmFyIGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSB9O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgZXh0cmFEYXRhLm9iamVjdElkID0gdGhpcy5xdWVyeS5vYmplY3RJZDtcbiAgfVxuXG4gIGxldCBvcmlnaW5hbE9iamVjdCA9IG51bGw7XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0aGlzLmJ1aWxkVXBkYXRlZE9iamVjdChleHRyYURhdGEpO1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgLy8gVGhpcyBpcyBhbiB1cGRhdGUgZm9yIGV4aXN0aW5nIG9iamVjdC5cbiAgICBvcmlnaW5hbE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIH1cblxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBCZWZvcmUgY2FsbGluZyB0aGUgdHJpZ2dlciwgdmFsaWRhdGUgdGhlIHBlcm1pc3Npb25zIGZvciB0aGUgc2F2ZSBvcGVyYXRpb25cbiAgICAgIGxldCBkYXRhYmFzZVByb21pc2UgPSBudWxsO1xuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIHVwZGF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgY3JlYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UuY3JlYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSW4gdGhlIGNhc2UgdGhhdCB0aGVyZSBpcyBubyBwZXJtaXNzaW9uIGZvciB0aGUgb3BlcmF0aW9uLCBpdCB0aHJvd3MgYW4gZXJyb3JcbiAgICAgIHJldHVybiBkYXRhYmFzZVByb21pc2UudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQubGVuZ3RoIDw9IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgICAgdGhpcy5hdXRoLFxuICAgICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgICAgdGhpcy5jb25maWcsXG4gICAgICAgIHRoaXMuY29udGV4dFxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSBfLnJlZHVjZShcbiAgICAgICAgICByZXNwb25zZS5vYmplY3QsXG4gICAgICAgICAgKHJlc3VsdCwgdmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYgKCFfLmlzRXF1YWwodGhpcy5kYXRhW2tleV0sIHZhbHVlKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9LFxuICAgICAgICAgIFtdXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGF0YSA9IHJlc3BvbnNlLm9iamVjdDtcbiAgICAgICAgLy8gV2Ugc2hvdWxkIGRlbGV0ZSB0aGUgb2JqZWN0SWQgZm9yIGFuIHVwZGF0ZSB3cml0ZVxuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5CZWZvcmVMb2dpblRyaWdnZXIgPSBhc3luYyBmdW5jdGlvbiAodXNlckRhdGEpIHtcbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlTG9naW4nIHRyaWdnZXJcbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKHRoaXMuY2xhc3NOYW1lLCB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbiwgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZClcbiAgKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQ2xvdWQgY29kZSBnZXRzIGEgYml0IG9mIGV4dHJhIGRhdGEgZm9yIGl0cyBvYmplY3RzXG4gIGNvbnN0IGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSB9O1xuXG4gIC8vIEV4cGFuZCBmaWxlIG9iamVjdHNcbiAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHVzZXJEYXRhKTtcblxuICBjb25zdCB1c2VyID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHVzZXJEYXRhKTtcblxuICAvLyBubyBuZWVkIHRvIHJldHVybiBhIHJlc3BvbnNlXG4gIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbixcbiAgICB0aGlzLmF1dGgsXG4gICAgdXNlcixcbiAgICBudWxsLFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuY29udGV4dFxuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5kYXRhKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKS50aGVuKGFsbENsYXNzZXMgPT4ge1xuICAgICAgY29uc3Qgc2NoZW1hID0gYWxsQ2xhc3Nlcy5maW5kKG9uZUNsYXNzID0+IG9uZUNsYXNzLmNsYXNzTmFtZSA9PT0gdGhpcy5jbGFzc05hbWUpO1xuICAgICAgY29uc3Qgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkID0gKGZpZWxkTmFtZSwgc2V0RGVmYXVsdCkgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSBudWxsIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICcnIHx8XG4gICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiYgdGhpcy5kYXRhW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHNldERlZmF1bHQgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZSAhPT0gbnVsbCAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICAgICAodGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgICAgICAodHlwZW9mIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnb2JqZWN0JyAmJiB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWU7XG4gICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9IHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIHx8IFtdO1xuICAgICAgICAgICAgaWYgKHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5yZXF1aXJlZCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGAke2ZpZWxkTmFtZX0gaXMgcmVxdWlyZWRgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIC8vIEFkZCBkZWZhdWx0IGZpZWxkc1xuICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcblxuICAgICAgICAvLyBPbmx5IGFzc2lnbiBuZXcgb2JqZWN0SWQgaWYgd2UgYXJlIGNyZWF0aW5nIG5ldyBvYmplY3RcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSBjcnlwdG9VdGlscy5uZXdPYmplY3RJZCh0aGlzLmNvbmZpZy5vYmplY3RJZFNpemUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCB0cnVlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChzY2hlbWEpIHtcbiAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkKGZpZWxkTmFtZSwgZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG4vLyBUcmFuc2Zvcm1zIGF1dGggZGF0YSBmb3IgYSB1c2VyIG9iamVjdC5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGEgdXNlciBvYmplY3QuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hlbiB3ZSdyZSBkb25lIGlmIGl0IGNhbid0IGZpbmlzaCB0aGlzIHRpY2suXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGF1dGhEYXRhID0gdGhpcy5kYXRhLmF1dGhEYXRhO1xuICBjb25zdCBoYXNVc2VybmFtZUFuZFBhc3N3b3JkID1cbiAgICB0eXBlb2YgdGhpcy5kYXRhLnVzZXJuYW1lID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkID09PSAnc3RyaW5nJztcblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIWF1dGhEYXRhKSB7XG4gICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEudXNlcm5hbWUgIT09ICdzdHJpbmcnIHx8IF8uaXNFbXB0eSh0aGlzLmRhdGEudXNlcm5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ2JhZCBvciBtaXNzaW5nIHVzZXJuYW1lJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fCBfLmlzRW1wdHkodGhpcy5kYXRhLnBhc3N3b3JkKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChcbiAgICAoYXV0aERhdGEgJiYgIU9iamVjdC5rZXlzKGF1dGhEYXRhKS5sZW5ndGgpIHx8XG4gICAgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLmRhdGEsICdhdXRoRGF0YScpXG4gICkge1xuICAgIC8vIE5vdGhpbmcgdG8gdmFsaWRhdGUgaGVyZVxuICAgIHJldHVybjtcbiAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgLy8gSGFuZGxlIHNhdmluZyBhdXRoRGF0YSB0byBudWxsXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgKTtcbiAgfVxuXG4gIHZhciBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGlmIChwcm92aWRlcnMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNhbkhhbmRsZUF1dGhEYXRhID0gcHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgICAgdmFyIHByb3ZpZGVyQXV0aERhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB2YXIgaGFzVG9rZW4gPSBwcm92aWRlckF1dGhEYXRhICYmIHByb3ZpZGVyQXV0aERhdGEuaWQ7XG4gICAgICByZXR1cm4gaGFzVG9rZW4gfHwgcHJvdmlkZXJBdXRoRGF0YSA9PT0gbnVsbDtcbiAgICB9KTtcbiAgICBpZiAoY2FuSGFuZGxlQXV0aERhdGEgfHwgaGFzVXNlcm5hbWVBbmRQYXNzd29yZCB8fCB0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5nZXRVc2VySWQoKSkge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGEoYXV0aERhdGEpO1xuICAgIH1cbiAgfVxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maWx0ZXJlZE9iamVjdHNCeUFDTCA9IGZ1bmN0aW9uIChvYmplY3RzKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0cztcbiAgfVxuICByZXR1cm4gb2JqZWN0cy5maWx0ZXIob2JqZWN0ID0+IHtcbiAgICBpZiAoIW9iamVjdC5BQ0wpIHtcbiAgICAgIHJldHVybiB0cnVlOyAvLyBsZWdhY3kgdXNlcnMgdGhhdCBoYXZlIG5vIEFDTCBmaWVsZCBvbiB0aGVtXG4gICAgfVxuICAgIC8vIFJlZ3VsYXIgdXNlcnMgdGhhdCBoYXZlIGJlZW4gbG9ja2VkIG91dC5cbiAgICByZXR1cm4gb2JqZWN0LkFDTCAmJiBPYmplY3Qua2V5cyhvYmplY3QuQUNMKS5sZW5ndGggPiAwO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlcklkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuIHRoaXMucXVlcnkub2JqZWN0SWQ7XG4gIH0gZWxzZSBpZiAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC51c2VyLmlkO1xuICB9XG59O1xuXG4vLyBEZXZlbG9wZXJzIGFyZSBhbGxvd2VkIHRvIGNoYW5nZSBhdXRoRGF0YSB2aWEgYmVmb3JlIHNhdmUgdHJpZ2dlclxuLy8gd2UgbmVlZCBhZnRlciBiZWZvcmUgc2F2ZSB0byBlbnN1cmUgdGhhdCB0aGUgZGV2ZWxvcGVyXG4vLyBpcyBub3QgY3VycmVudGx5IGR1cGxpY2F0aW5nIGF1dGggZGF0YSBJRFxuUmVzdFdyaXRlLnByb3RvdHlwZS5lbnN1cmVVbmlxdWVBdXRoRGF0YUlkID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHJldHVybjtcbiAgaWYgKCF0aGlzLmRhdGEuYXV0aERhdGEpIHJldHVybjtcblxuICBjb25zdCBoYXNBdXRoRGF0YUlkID0gT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5zb21lKFxuICAgIGtleSA9PiB0aGlzLmRhdGEuYXV0aERhdGFba2V5XSAmJiB0aGlzLmRhdGEuYXV0aERhdGFba2V5XS5pZFxuICApO1xuXG4gIGlmICghaGFzQXV0aERhdGFJZCkgcmV0dXJuO1xuXG4gIGNvbnN0IHIgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YSh0aGlzLmNvbmZpZywgdGhpcy5kYXRhLmF1dGhEYXRhKTtcbiAgY29uc3QgcmVzdWx0cyA9IHRoaXMuZmlsdGVyZWRPYmplY3RzQnlBQ0wocik7XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxuICAvLyB1c2UgZGF0YS5vYmplY3RJZCBpbiBjYXNlIG9mIGxvZ2luIHRpbWUgYW5kIGZvdW5kIHVzZXIgZHVyaW5nIGhhbmRsZSB2YWxpZGF0ZUF1dGhEYXRhXG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMuZ2V0VXNlcklkKCkgfHwgdGhpcy5kYXRhLm9iamVjdElkO1xuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEgJiYgdXNlcklkICE9PSByZXN1bHRzWzBdLm9iamVjdElkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlQXV0aERhdGEgPSBhc3luYyBmdW5jdGlvbiAoYXV0aERhdGEpIHtcbiAgY29uc3QgciA9IGF3YWl0IEF1dGguZmluZFVzZXJzV2l0aEF1dGhEYXRhKHRoaXMuY29uZmlnLCBhdXRoRGF0YSk7XG4gIGNvbnN0IHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuXG4gIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAvLyBUbyBhdm9pZCBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9zZWN1cml0eS9hZHZpc29yaWVzL0dIU0EtOHczai1nOTgzLThqaDVcbiAgICAvLyBMZXQncyBydW4gc29tZSB2YWxpZGF0aW9uIGJlZm9yZSB0aHJvd2luZ1xuICAgIGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKGF1dGhEYXRhLCB0aGlzLCByZXN1bHRzWzBdKTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxuXG4gIC8vIE5vIHVzZXIgZm91bmQgd2l0aCBwcm92aWRlZCBhdXRoRGF0YSB3ZSBuZWVkIHRvIHZhbGlkYXRlXG4gIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICBjb25zdCB7IGF1dGhEYXRhOiB2YWxpZGF0ZWRBdXRoRGF0YSwgYXV0aERhdGFSZXNwb25zZSB9ID0gYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHRoaXNcbiAgICApO1xuICAgIHRoaXMuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgLy8gUmVwbGFjZSBjdXJyZW50IGF1dGhEYXRhIGJ5IHRoZSBuZXcgdmFsaWRhdGVkIG9uZVxuICAgIHRoaXMuZGF0YS5hdXRoRGF0YSA9IHZhbGlkYXRlZEF1dGhEYXRhO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFVzZXIgZm91bmQgd2l0aCBwcm92aWRlZCBhdXRoRGF0YVxuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEpIHtcbiAgICBjb25zdCB1c2VySWQgPSB0aGlzLmdldFVzZXJJZCgpO1xuICAgIGNvbnN0IHVzZXJSZXN1bHQgPSByZXN1bHRzWzBdO1xuICAgIC8vIFByZXZlbnQgZHVwbGljYXRlIGF1dGhEYXRhIGlkXG4gICAgaWYgKHVzZXJJZCAmJiB1c2VySWQgIT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICAgIH1cblxuICAgIHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuam9pbignLCcpO1xuXG4gICAgY29uc3QgeyBoYXNNdXRhdGVkQXV0aERhdGEsIG11dGF0ZWRBdXRoRGF0YSB9ID0gQXV0aC5oYXNNdXRhdGVkQXV0aERhdGEoXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHVzZXJSZXN1bHQuYXV0aERhdGFcbiAgICApO1xuXG4gICAgY29uc3QgaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyID1cbiAgICAgICh0aGlzLmF1dGggJiYgdGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5hdXRoLnVzZXIuaWQgPT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHx8XG4gICAgICB0aGlzLmF1dGguaXNNYXN0ZXI7XG5cbiAgICAvLyBQcmV2ZW50IHZhbGlkYXRpbmcgaWYgbm8gbXV0YXRlZCBkYXRhIGRldGVjdGVkXG4gICAgaWYgKCFoYXNNdXRhdGVkQXV0aERhdGEgJiYgaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaXNMb2dpbiA9ICF1c2VySWQ7XG5cbiAgICBpZiAoaXNMb2dpbiB8fCBoYXNNdXRhdGVkQXV0aERhdGEpIHtcbiAgICAgIC8vIG5vIHVzZXIgbWFraW5nIHRoZSBjYWxsXG4gICAgICAvLyBPUiB0aGUgdXNlciBtYWtpbmcgdGhlIGNhbGwgaXMgdGhlIHJpZ2h0IG9uZVxuICAgICAgLy8gTG9naW4gd2l0aCBhdXRoIGRhdGFcbiAgICAgIGRlbGV0ZSByZXN1bHRzWzBdLnBhc3N3b3JkO1xuXG4gICAgICAvLyBuZWVkIHRvIHNldCB0aGUgb2JqZWN0SWQgZmlyc3Qgb3RoZXJ3aXNlIGxvY2F0aW9uIGhhcyB0cmFpbGluZyB1bmRlZmluZWRcbiAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IHVzZXJSZXN1bHQub2JqZWN0SWQ7XG5cbiAgICAgIGlmIChpc0xvZ2luKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgcmVzcG9uc2U6IHVzZXJSZXN1bHQsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gUnVuIGJlZm9yZUxvZ2luIGhvb2sgYmVmb3JlIHN0b3JpbmcgYW55IHVwZGF0ZXNcbiAgICAgICAgLy8gdG8gYXV0aERhdGEgb24gdGhlIGRiOyBjaGFuZ2VzIHRvIHVzZXJSZXN1bHRcbiAgICAgICAgLy8gd2lsbCBiZSBpZ25vcmVkLlxuICAgICAgICBhd2FpdCB0aGlzLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlcihkZWVwY29weSh1c2VyUmVzdWx0KSk7XG5cbiAgICAgICAgLy8gSWYgd2UgYXJlIGluIGxvZ2luIG9wZXJhdGlvbiB2aWEgYXV0aERhdGFcbiAgICAgICAgLy8gd2UgbmVlZCB0byBiZSBzdXJlIHRoYXQgdGhlIHVzZXIgaGFzIHByb3ZpZGVkXG4gICAgICAgIC8vIHJlcXVpcmVkIGF1dGhEYXRhXG4gICAgICAgIEF1dGguY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbihcbiAgICAgICAgICBhdXRoRGF0YSxcbiAgICAgICAgICB1c2VyUmVzdWx0LmF1dGhEYXRhLFxuICAgICAgICAgIHRoaXMuY29uZmlnXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIC8vIEZvcmNlIHRvIHZhbGlkYXRlIGFsbCBwcm92aWRlZCBhdXRoRGF0YSBvbiBsb2dpblxuICAgICAgLy8gb24gdXBkYXRlIG9ubHkgdmFsaWRhdGUgbXV0YXRlZCBvbmVzXG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgICAgaXNMb2dpbiA/IGF1dGhEYXRhIDogbXV0YXRlZEF1dGhEYXRhLFxuICAgICAgICB0aGlzLFxuICAgICAgICB1c2VyUmVzdWx0XG4gICAgICApO1xuICAgICAgdGhpcy5kYXRhLmF1dGhEYXRhID0gcmVzLmF1dGhEYXRhO1xuICAgICAgdGhpcy5hdXRoRGF0YVJlc3BvbnNlID0gcmVzLmF1dGhEYXRhUmVzcG9uc2U7XG5cbiAgICAgIC8vIElGIHdlIGFyZSBpbiBsb2dpbiB3ZSdsbCBza2lwIHRoZSBkYXRhYmFzZSBvcGVyYXRpb24gLyBiZWZvcmVTYXZlIC8gYWZ0ZXJTYXZlIGV0Yy4uLlxuICAgICAgLy8gd2UgbmVlZCB0byBzZXQgaXQgdXAgdGhlcmUuXG4gICAgICAvLyBXZSBhcmUgc3VwcG9zZWQgdG8gaGF2ZSBhIHJlc3BvbnNlIG9ubHkgb24gTE9HSU4gd2l0aCBhdXRoRGF0YSwgc28gd2Ugc2tpcCB0aG9zZVxuICAgICAgLy8gSWYgd2UncmUgbm90IGxvZ2dpbmcgaW4sIGJ1dCBqdXN0IHVwZGF0aW5nIHRoZSBjdXJyZW50IHVzZXIsIHdlIGNhbiBzYWZlbHkgc2tpcCB0aGF0IHBhcnRcbiAgICAgIGlmIChpc0xvZ2luICYmIGhhc011dGF0ZWRBdXRoRGF0YSAmJiBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgICAvLyBBc3NpZ24gdGhlIG5ldyBhdXRoRGF0YSBpbiB0aGUgcmVzcG9uc2VcbiAgICAgICAgT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFJ1biB0aGUgREIgdXBkYXRlIGRpcmVjdGx5LCBhcyAnbWFzdGVyJ1xuICAgICAgICAvLyBKdXN0IHVwZGF0ZSB0aGUgYXV0aERhdGEgcGFydFxuICAgICAgICAvLyBUaGVuIHdlJ3JlIGdvb2QgZm9yIHRoZSB1c2VyLCBlYXJseSBleGl0IG9mIHNvcnRzXG4gICAgICAgIGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB7IG9iamVjdElkOiB0aGlzLmRhdGEub2JqZWN0SWQgfSxcbiAgICAgICAgICB7IGF1dGhEYXRhOiB0aGlzLmRhdGEuYXV0aERhdGEgfSxcbiAgICAgICAgICB7fVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gVGhlIG5vbi10aGlyZC1wYXJ0eSBwYXJ0cyBvZiBVc2VyIHRyYW5zZm9ybWF0aW9uXG5SZXN0V3JpdGUucHJvdG90eXBlLnRyYW5zZm9ybVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgJ2VtYWlsVmVyaWZpZWQnIGluIHRoaXMuZGF0YSkge1xuICAgIGNvbnN0IGVycm9yID0gYENsaWVudHMgYXJlbid0IGFsbG93ZWQgdG8gbWFudWFsbHkgdXBkYXRlIGVtYWlsIHZlcmlmaWNhdGlvbi5gO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCBlcnJvcik7XG4gIH1cblxuICAvLyBEbyBub3QgY2xlYW51cCBzZXNzaW9uIGlmIG9iamVjdElkIGlzIG5vdCBzZXRcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5vYmplY3RJZCgpKSB7XG4gICAgLy8gSWYgd2UncmUgdXBkYXRpbmcgYSBfVXNlciBvYmplY3QsIHdlIG5lZWQgdG8gY2xlYXIgb3V0IHRoZSBjYWNoZSBmb3IgdGhhdCB1c2VyLiBGaW5kIGFsbCB0aGVpclxuICAgIC8vIHNlc3Npb24gdG9rZW5zLCBhbmQgcmVtb3ZlIHRoZW0gZnJvbSB0aGUgY2FjaGUuXG4gICAgcHJvbWlzZSA9IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSwgJ19TZXNzaW9uJywge1xuICAgICAgdXNlcjoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgICAgfSxcbiAgICB9KVxuICAgICAgLmV4ZWN1dGUoKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIHJlc3VsdHMucmVzdWx0cy5mb3JFYWNoKHNlc3Npb24gPT5cbiAgICAgICAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIudXNlci5kZWwoc2Vzc2lvbi5zZXNzaW9uVG9rZW4pXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gVHJhbnNmb3JtIHRoZSBwYXNzd29yZFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIC8vIGlnbm9yZSBvbmx5IGlmIHVuZGVmaW5lZC4gc2hvdWxkIHByb2NlZWQgaWYgZW1wdHkgKCcnKVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddID0gdHJ1ZTtcbiAgICAgICAgLy8gR2VuZXJhdGUgYSBuZXcgc2Vzc2lvbiBvbmx5IGlmIHRoZSB1c2VyIHJlcXVlc3RlZFxuICAgICAgICBpZiAoIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgICAgICAgIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5KCkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5oYXNoKHRoaXMuZGF0YS5wYXNzd29yZCkudGhlbihoYXNoZWRQYXNzd29yZCA9PiB7XG4gICAgICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgPSBoYXNoZWRQYXNzd29yZDtcbiAgICAgICAgICBkZWxldGUgdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlVXNlck5hbWUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZUVtYWlsKCk7XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVVzZXJOYW1lID0gZnVuY3Rpb24gKCkge1xuICAvLyBDaGVjayBmb3IgdXNlcm5hbWUgdW5pcXVlbmVzc1xuICBpZiAoIXRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgdGhpcy5kYXRhLnVzZXJuYW1lID0gY3J5cHRvVXRpbHMucmFuZG9tU3RyaW5nKDI1KTtcbiAgICAgIHRoaXMucmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLypcbiAgICBVc2VybmFtZXMgc2hvdWxkIGJlIHVuaXF1ZSB3aGVuIGNvbXBhcmVkIGNhc2UgaW5zZW5zaXRpdmVseVxuXG4gICAgVXNlcnMgc2hvdWxkIGJlIGFibGUgdG8gbWFrZSBjYXNlIHNlbnNpdGl2ZSB1c2VybmFtZXMgYW5kXG4gICAgbG9naW4gdXNpbmcgdGhlIGNhc2UgdGhleSBlbnRlcmVkLiAgSS5lLiAnU25vb3B5JyBzaG91bGQgcHJlY2x1ZGVcbiAgICAnc25vb3B5JyBhcyBhIHZhbGlkIHVzZXJuYW1lLlxuICAqL1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICB1c2VybmFtZTogdGhpcy5kYXRhLnVzZXJuYW1lLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9KTtcbn07XG5cbi8qXG4gIEFzIHdpdGggdXNlcm5hbWVzLCBQYXJzZSBzaG91bGQgbm90IGFsbG93IGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9ucyBvZiBlbWFpbC5cbiAgdW5saWtlIHdpdGggdXNlcm5hbWVzICh3aGljaCBjYW4gaGF2ZSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgaW4gdGhlIGNhc2Ugb2ZcbiAgYXV0aCBhZGFwdGVycyksIGVtYWlscyBzaG91bGQgbmV2ZXIgaGF2ZSBhIGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9uLlxuXG4gIFRoaXMgYmVoYXZpb3IgY2FuIGJlIGVuZm9yY2VkIHRocm91Z2ggYSBwcm9wZXJseSBjb25maWd1cmVkIGluZGV4IHNlZTpcbiAgaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL2luZGV4LWNhc2UtaW5zZW5zaXRpdmUvI2NyZWF0ZS1hLWNhc2UtaW5zZW5zaXRpdmUtaW5kZXhcbiAgd2hpY2ggY291bGQgYmUgaW1wbGVtZW50ZWQgaW5zdGVhZCBvZiB0aGlzIGNvZGUgYmFzZWQgdmFsaWRhdGlvbi5cblxuICBHaXZlbiB0aGF0IHRoaXMgbG9va3VwIHNob3VsZCBiZSBhIHJlbGF0aXZlbHkgbG93IHVzZSBjYXNlIGFuZCB0aGF0IHRoZSBjYXNlIHNlbnNpdGl2ZVxuICB1bmlxdWUgaW5kZXggd2lsbCBiZSB1c2VkIGJ5IHRoZSBkYiBmb3IgdGhlIHF1ZXJ5LCB0aGlzIGlzIGFuIGFkZXF1YXRlIHNvbHV0aW9uLlxuKi9cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlRW1haWwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsIHx8IHRoaXMuZGF0YS5lbWFpbC5fX29wID09PSAnRGVsZXRlJykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBWYWxpZGF0ZSBiYXNpYyBlbWFpbCBhZGRyZXNzIGZvcm1hdFxuICBpZiAoIXRoaXMuZGF0YS5lbWFpbC5tYXRjaCgvXi4rQC4rJC8pKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUywgJ0VtYWlsIGFkZHJlc3MgZm9ybWF0IGlzIGludmFsaWQuJylcbiAgICApO1xuICB9XG4gIC8vIENhc2UgaW5zZW5zaXRpdmUgbWF0Y2gsIHNlZSBub3RlIGFib3ZlIGZ1bmN0aW9uLlxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICAhdGhpcy5kYXRhLmF1dGhEYXRhIHx8XG4gICAgICAgICFPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCB8fFxuICAgICAgICAoT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggPT09IDEgJiZcbiAgICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpWzBdID09PSAnYW5vbnltb3VzJylcbiAgICAgICkge1xuICAgICAgICAvLyBXZSB1cGRhdGVkIHRoZSBlbWFpbCwgc2VuZCBhIG5ldyB2YWxpZGF0aW9uXG4gICAgICAgIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10gPSB0cnVlO1xuICAgICAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZXRFbWFpbFZlcmlmeVRva2VuKHRoaXMuZGF0YSk7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5KSByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzKCkudGhlbigoKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5KCk7XG4gIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gY2hlY2sgaWYgdGhlIHBhc3N3b3JkIGNvbmZvcm1zIHRvIHRoZSBkZWZpbmVkIHBhc3N3b3JkIHBvbGljeSBpZiBjb25maWd1cmVkXG4gIC8vIElmIHdlIHNwZWNpZmllZCBhIGN1c3RvbSBlcnJvciBpbiBvdXIgY29uZmlndXJhdGlvbiB1c2UgaXQuXG4gIC8vIEV4YW1wbGU6IFwiUGFzc3dvcmRzIG11c3QgaW5jbHVkZSBhIENhcGl0YWwgTGV0dGVyLCBMb3dlcmNhc2UgTGV0dGVyLCBhbmQgYSBudW1iZXIuXCJcbiAgLy9cbiAgLy8gVGhpcyBpcyBlc3BlY2lhbGx5IHVzZWZ1bCBvbiB0aGUgZ2VuZXJpYyBcInBhc3N3b3JkIHJlc2V0XCIgcGFnZSxcbiAgLy8gYXMgaXQgYWxsb3dzIHRoZSBwcm9ncmFtbWVyIHRvIGNvbW11bmljYXRlIHNwZWNpZmljIHJlcXVpcmVtZW50cyBpbnN0ZWFkIG9mOlxuICAvLyBhLiBtYWtpbmcgdGhlIHVzZXIgZ3Vlc3Mgd2hhdHMgd3JvbmdcbiAgLy8gYi4gbWFraW5nIGEgY3VzdG9tIHBhc3N3b3JkIHJlc2V0IHBhZ2UgdGhhdCBzaG93cyB0aGUgcmVxdWlyZW1lbnRzXG4gIGNvbnN0IHBvbGljeUVycm9yID0gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgPyB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0aW9uRXJyb3JcbiAgICA6ICdQYXNzd29yZCBkb2VzIG5vdCBtZWV0IHRoZSBQYXNzd29yZCBQb2xpY3kgcmVxdWlyZW1lbnRzLic7XG4gIGNvbnN0IGNvbnRhaW5zVXNlcm5hbWVFcnJvciA9ICdQYXNzd29yZCBjYW5ub3QgY29udGFpbiB5b3VyIHVzZXJuYW1lLic7XG5cbiAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgbWVldHMgdGhlIHBhc3N3b3JkIHN0cmVuZ3RoIHJlcXVpcmVtZW50c1xuICBpZiAoXG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IgJiZcbiAgICAgICF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yKHRoaXMuZGF0YS5wYXNzd29yZCkpIHx8XG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sodGhpcy5kYXRhLnBhc3N3b3JkKSlcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBwb2xpY3lFcnJvcikpO1xuICB9XG5cbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBjb250YWluIHVzZXJuYW1lXG4gIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgPT09IHRydWUpIHtcbiAgICBpZiAodGhpcy5kYXRhLnVzZXJuYW1lKSB7XG4gICAgICAvLyB1c2VybmFtZSBpcyBub3QgcGFzc2VkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHRoaXMuZGF0YS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBjb250YWluc1VzZXJuYW1lRXJyb3IpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcmV0cmlldmUgdGhlIFVzZXIgb2JqZWN0IHVzaW5nIG9iamVjdElkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZihyZXN1bHRzWzBdLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBjb250YWluc1VzZXJuYW1lRXJyb3IpXG4gICAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5ID0gZnVuY3Rpb24gKCkge1xuICAvLyBjaGVjayB3aGV0aGVyIHBhc3N3b3JkIGlzIHJlcGVhdGluZyBmcm9tIHNwZWNpZmllZCBoaXN0b3J5XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmZpbmQoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICB7IGtleXM6IFsnX3Bhc3N3b3JkX2hpc3RvcnknLCAnX2hhc2hlZF9wYXNzd29yZCddIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgbGV0IG9sZFBhc3N3b3JkcyA9IFtdO1xuICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSlcbiAgICAgICAgICBvbGRQYXNzd29yZHMgPSBfLnRha2UoXG4gICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IC0gMVxuICAgICAgICAgICk7XG4gICAgICAgIG9sZFBhc3N3b3Jkcy5wdXNoKHVzZXIucGFzc3dvcmQpO1xuICAgICAgICBjb25zdCBuZXdQYXNzd29yZCA9IHRoaXMuZGF0YS5wYXNzd29yZDtcbiAgICAgICAgLy8gY29tcGFyZSB0aGUgbmV3IHBhc3N3b3JkIGhhc2ggd2l0aCBhbGwgb2xkIHBhc3N3b3JkIGhhc2hlc1xuICAgICAgICBjb25zdCBwcm9taXNlcyA9IG9sZFBhc3N3b3Jkcy5tYXAoZnVuY3Rpb24gKGhhc2gpIHtcbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShuZXdQYXNzd29yZCwgaGFzaCkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdClcbiAgICAgICAgICAgICAgLy8gcmVqZWN0IGlmIHRoZXJlIGlzIGEgbWF0Y2hcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KCdSRVBFQVRfUEFTU1dPUkQnKTtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIHdhaXQgZm9yIGFsbCBjb21wYXJpc29ucyB0byBjb21wbGV0ZVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyID09PSAnUkVQRUFUX1BBU1NXT1JEJylcbiAgICAgICAgICAgICAgLy8gYSBtYXRjaCB3YXMgZm91bmRcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgICAgICAgICBgTmV3IHBhc3N3b3JkIHNob3VsZCBub3QgYmUgdGhlIHNhbWUgYXMgbGFzdCAke3RoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeX0gcGFzc3dvcmRzLmBcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgc2Vzc2lvbiBmb3IgdXBkYXRpbmcgdXNlciAodGhpcy5xdWVyeSBpcyBzZXQpIHVubGVzcyBhdXRoRGF0YSBleGlzdHNcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBuZXcgc2Vzc2lvblRva2VuIGlmIGxpbmtpbmcgdmlhIHNlc3Npb25Ub2tlblxuICBpZiAodGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChcbiAgICAhdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSAmJiAvLyBzaWdudXAgY2FsbCwgd2l0aFxuICAgIHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiYgLy8gbm8gbG9naW4gd2l0aG91dCB2ZXJpZmljYXRpb25cbiAgICB0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzXG4gICkge1xuICAgIC8vIHZlcmlmaWNhdGlvbiBpcyBvblxuICAgIHJldHVybjsgLy8gZG8gbm90IGNyZWF0ZSB0aGUgc2Vzc2lvbiB0b2tlbiBpbiB0aGF0IGNhc2UhXG4gIH1cbiAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy8gY2xvdWQgaW5zdGFsbGF0aW9uSWQgZnJvbSBDbG91ZCBDb2RlLFxuICAvLyBuZXZlciBjcmVhdGUgc2Vzc2lvbiB0b2tlbnMgZnJvbSB0aGVyZS5cbiAgaWYgKHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCAmJiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQgPT09ICdjbG91ZCcpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgIHVzZXJJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICBhY3Rpb246IHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPyAnbG9naW4nIDogJ3NpZ251cCcsXG4gICAgICBhdXRoUHJvdmlkZXI6IHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gfHwgJ3Bhc3N3b3JkJyxcbiAgICB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQsXG4gIH0pO1xuXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIHJldHVybiBjcmVhdGVTZXNzaW9uKCk7XG59O1xuXG5SZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbiA9IGZ1bmN0aW9uIChcbiAgY29uZmlnLFxuICB7IHVzZXJJZCwgY3JlYXRlZFdpdGgsIGluc3RhbGxhdGlvbklkLCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgfVxuKSB7XG4gIGNvbnN0IHRva2VuID0gJ3I6JyArIGNyeXB0b1V0aWxzLm5ld1Rva2VuKCk7XG4gIGNvbnN0IGV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKTtcbiAgY29uc3Qgc2Vzc2lvbkRhdGEgPSB7XG4gICAgc2Vzc2lvblRva2VuOiB0b2tlbixcbiAgICB1c2VyOiB7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgIG9iamVjdElkOiB1c2VySWQsXG4gICAgfSxcbiAgICBjcmVhdGVkV2l0aCxcbiAgICByZXN0cmljdGVkOiBmYWxzZSxcbiAgICBleHBpcmVzQXQ6IFBhcnNlLl9lbmNvZGUoZXhwaXJlc0F0KSxcbiAgfTtcblxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBzZXNzaW9uRGF0YS5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgT2JqZWN0LmFzc2lnbihzZXNzaW9uRGF0YSwgYWRkaXRpb25hbFNlc3Npb25EYXRhKTtcblxuICByZXR1cm4ge1xuICAgIHNlc3Npb25EYXRhLFxuICAgIGNyZWF0ZVNlc3Npb246ICgpID0+XG4gICAgICBuZXcgUmVzdFdyaXRlKGNvbmZpZywgQXV0aC5tYXN0ZXIoY29uZmlnKSwgJ19TZXNzaW9uJywgbnVsbCwgc2Vzc2lvbkRhdGEpLmV4ZWN1dGUoKSxcbiAgfTtcbn07XG5cbi8vIERlbGV0ZSBlbWFpbCByZXNldCB0b2tlbnMgaWYgdXNlciBpcyBjaGFuZ2luZyBwYXNzd29yZCBvciBlbWFpbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCB0aGlzLnF1ZXJ5ID09PSBudWxsKSB7XG4gICAgLy8gbnVsbCBxdWVyeSBtZWFucyBjcmVhdGVcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoJ3Bhc3N3b3JkJyBpbiB0aGlzLmRhdGEgfHwgJ2VtYWlsJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBhZGRPcHMgPSB7XG4gICAgICBfcGVyaXNoYWJsZV90b2tlbjogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgICAgX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgIH07XG4gICAgdGhpcy5kYXRhID0gT2JqZWN0LmFzc2lnbih0aGlzLmRhdGEsIGFkZE9wcyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gT25seSBmb3IgX1Nlc3Npb24sIGFuZCBhdCBjcmVhdGlvbiB0aW1lXG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPSAnX1Nlc3Npb24nIHx8IHRoaXMucXVlcnkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRGVzdHJveSB0aGUgc2Vzc2lvbnMgaW4gJ0JhY2tncm91bmQnXG4gIGNvbnN0IHsgdXNlciwgaW5zdGFsbGF0aW9uSWQsIHNlc3Npb25Ub2tlbiB9ID0gdGhpcy5kYXRhO1xuICBpZiAoIXVzZXIgfHwgIWluc3RhbGxhdGlvbklkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghdXNlci5vYmplY3RJZCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KFxuICAgICdfU2Vzc2lvbicsXG4gICAge1xuICAgICAgdXNlcixcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgc2Vzc2lvblRva2VuOiB7ICRuZTogc2Vzc2lvblRva2VuIH0sXG4gICAgfSxcbiAgICB7fSxcbiAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICApO1xufTtcblxuLy8gSGFuZGxlcyBhbnkgZm9sbG93dXAgbG9naWNcblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlRm9sbG93dXAgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gJiYgdGhpcy5jb25maWcucmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCkge1xuICAgIHZhciBzZXNzaW9uUXVlcnkgPSB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH07XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddO1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmRlc3Ryb3koJ19TZXNzaW9uJywgc2Vzc2lvblF1ZXJ5KVxuICAgICAgLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddO1xuICAgIC8vIEZpcmUgYW5kIGZvcmdldCFcbiAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodGhpcy5kYXRhKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfU2Vzc2lvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIF9TZXNzaW9uIG9iamVjdC5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlU2Vzc2lvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgfHwgdGhpcy5jbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXRoaXMuYXV0aC51c2VyICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnU2Vzc2lvbiB0b2tlbiByZXF1aXJlZC4nKTtcbiAgfVxuXG4gIC8vIFRPRE86IFZlcmlmeSBwcm9wZXIgZXJyb3IgdG8gdGhyb3dcbiAgaWYgKHRoaXMuZGF0YS5BQ0wpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ0Nhbm5vdCBzZXQgJyArICdBQ0wgb24gYSBTZXNzaW9uLicpO1xuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICBpZiAodGhpcy5kYXRhLnVzZXIgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiB0aGlzLmRhdGEudXNlci5vYmplY3RJZCAhPSB0aGlzLmF1dGgudXNlci5pZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5kYXRhKSB7XG4gICAgICBpZiAoa2V5ID09PSAnb2JqZWN0SWQnIHx8IGtleSA9PT0gJ3VzZXInKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhW2tleV0gPSB0aGlzLmRhdGFba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZScsXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNyZWF0ZVNlc3Npb24oKS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKCFyZXN1bHRzLnJlc3BvbnNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdFcnJvciBjcmVhdGluZyBzZXNzaW9uLicpO1xuICAgICAgfVxuICAgICAgc2Vzc2lvbkRhdGFbJ29iamVjdElkJ10gPSByZXN1bHRzLnJlc3BvbnNlWydvYmplY3RJZCddO1xuICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgIGxvY2F0aW9uOiByZXN1bHRzLmxvY2F0aW9uLFxuICAgICAgICByZXNwb25zZTogc2Vzc2lvbkRhdGEsXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfSW5zdGFsbGF0aW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gaW5zdGFsbGF0aW9uIG9iamVjdC5cbi8vIElmIGFuIGluc3RhbGxhdGlvbiBpcyBmb3VuZCwgdGhpcyBjYW4gbXV0YXRlIHRoaXMucXVlcnkgYW5kIHR1cm4gYSBjcmVhdGVcbi8vIGludG8gYW4gdXBkYXRlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVJbnN0YWxsYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX0luc3RhbGxhdGlvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoXG4gICAgIXRoaXMucXVlcnkgJiZcbiAgICAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICF0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWRcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgMTM1LFxuICAgICAgJ2F0IGxlYXN0IG9uZSBJRCBmaWVsZCAoZGV2aWNlVG9rZW4sIGluc3RhbGxhdGlvbklkKSAnICsgJ211c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJ1xuICAgICk7XG4gIH1cblxuICAvLyBJZiB0aGUgZGV2aWNlIHRva2VuIGlzIDY0IGNoYXJhY3RlcnMgbG9uZywgd2UgYXNzdW1lIGl0IGlzIGZvciBpT1NcbiAgLy8gYW5kIGxvd2VyY2FzZSBpdC5cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4ubGVuZ3RoID09IDY0KSB7XG4gICAgdGhpcy5kYXRhLmRldmljZVRva2VuID0gdGhpcy5kYXRhLmRldmljZVRva2VuLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBXZSBsb3dlcmNhc2UgdGhlIGluc3RhbGxhdGlvbklkIGlmIHByZXNlbnRcbiAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgbGV0IGluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkO1xuXG4gIC8vIElmIGRhdGEuaW5zdGFsbGF0aW9uSWQgaXMgbm90IHNldCBhbmQgd2UncmUgbm90IG1hc3Rlciwgd2UgY2FuIGxvb2t1cCBpbiBhdXRoXG4gIGlmICghaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGluc3RhbGxhdGlvbklkID0gdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gVXBkYXRpbmcgX0luc3RhbGxhdGlvbiBidXQgbm90IHVwZGF0aW5nIGFueXRoaW5nIGNyaXRpY2FsXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgdmFyIGlkTWF0Y2g7IC8vIFdpbGwgYmUgYSBtYXRjaCBvbiBlaXRoZXIgb2JqZWN0SWQgb3IgaW5zdGFsbGF0aW9uSWRcbiAgdmFyIG9iamVjdElkTWF0Y2g7XG4gIHZhciBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICB2YXIgZGV2aWNlVG9rZW5NYXRjaGVzID0gW107XG5cbiAgLy8gSW5zdGVhZCBvZiBpc3N1aW5nIDMgcmVhZHMsIGxldCdzIGRvIGl0IHdpdGggb25lIE9SLlxuICBjb25zdCBvclF1ZXJpZXMgPSBbXTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIG9iamVjdElkOiB0aGlzLnF1ZXJ5Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcbiAgfVxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goeyBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuIH0pO1xuICB9XG5cbiAgaWYgKG9yUXVlcmllcy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByb21pc2UgPSBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfSW5zdGFsbGF0aW9uJyxcbiAgICAgICAge1xuICAgICAgICAgICRvcjogb3JRdWVyaWVzLFxuICAgICAgICB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgcmVzdWx0Lm9iamVjdElkID09IHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBvYmplY3RJZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuaW5zdGFsbGF0aW9uSWQgPT0gaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuZGV2aWNlVG9rZW4gPT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNhbml0eSBjaGVja3Mgd2hlbiBydW5uaW5nIGEgcXVlcnlcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKCFvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kIGZvciB1cGRhdGUuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgIT09IG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2luc3RhbGxhdGlvbklkIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgIW9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2RldmljZVRva2VuIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUeXBlXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUeXBlIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiBvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBvYmplY3RJZE1hdGNoO1xuICAgICAgfVxuXG4gICAgICBpZiAoaW5zdGFsbGF0aW9uSWQgJiYgaW5zdGFsbGF0aW9uSWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIG5lZWQgdG8gc3BlY2lmeSBkZXZpY2VUeXBlIG9ubHkgaWYgaXQncyBuZXdcbiAgICAgIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUgJiYgIWlkTWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNSwgJ2RldmljZVR5cGUgbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICghaWRNYXRjaCkge1xuICAgICAgICBpZiAoIWRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmXG4gICAgICAgICAgKCFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10gfHwgIWluc3RhbGxhdGlvbklkKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBTaW5nbGUgbWF0Y2ggb24gZGV2aWNlIHRva2VuIGJ1dCBub25lIG9uIGluc3RhbGxhdGlvbklkLCBhbmQgZWl0aGVyXG4gICAgICAgICAgLy8gdGhlIHBhc3NlZCBvYmplY3Qgb3IgdGhlIG1hdGNoIGlzIG1pc3NpbmcgYW4gaW5zdGFsbGF0aW9uSWQsIHNvIHdlXG4gICAgICAgICAgLy8gY2FuIGp1c3QgcmV0dXJuIHRoZSBtYXRjaC5cbiAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzIsXG4gICAgICAgICAgICAnTXVzdCBzcGVjaWZ5IGluc3RhbGxhdGlvbklkIHdoZW4gZGV2aWNlVG9rZW4gJyArXG4gICAgICAgICAgICAgICdtYXRjaGVzIG11bHRpcGxlIEluc3RhbGxhdGlvbiBvYmplY3RzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTXVsdGlwbGUgZGV2aWNlIHRva2VuIG1hdGNoZXMgYW5kIHdlIHNwZWNpZmllZCBhbiBpbnN0YWxsYXRpb24gSUQsXG4gICAgICAgICAgLy8gb3IgYSBzaW5nbGUgbWF0Y2ggd2hlcmUgYm90aCB0aGUgcGFzc2VkIGFuZCBtYXRjaGluZyBvYmplY3RzIGhhdmVcbiAgICAgICAgICAvLyBhbiBpbnN0YWxsYXRpb24gSUQuIFRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaFxuICAgICAgICAgIC8vIHRoZSBkZXZpY2VUb2tlbiwgYW5kIHJldHVybiBuaWwgdG8gc2lnbmFsIHRoYXQgYSBuZXcgb2JqZWN0IHNob3VsZFxuICAgICAgICAgIC8vIGJlIGNyZWF0ZWQuXG4gICAgICAgICAgdmFyIGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiB7XG4gICAgICAgICAgICAgICRuZTogaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJiAhZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydpbnN0YWxsYXRpb25JZCddKSB7XG4gICAgICAgICAgLy8gRXhhY3RseSBvbmUgZGV2aWNlIHRva2VuIG1hdGNoIGFuZCBpdCBkb2Vzbid0IGhhdmUgYW4gaW5zdGFsbGF0aW9uXG4gICAgICAgICAgLy8gSUQuIFRoaXMgaXMgdGhlIG9uZSBjYXNlIHdoZXJlIHdlIHdhbnQgdG8gbWVyZ2Ugd2l0aCB0aGUgZXhpc3RpbmdcbiAgICAgICAgICAvLyBvYmplY3QuXG4gICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7IG9iamVjdElkOiBpZE1hdGNoLm9iamVjdElkIH07XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgICAuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgaWRNYXRjaC5kZXZpY2VUb2tlbiAhPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIHNldHRpbmcgdGhlIGRldmljZSB0b2tlbiBvbiBhbiBleGlzdGluZyBpbnN0YWxsYXRpb24sIHNvXG4gICAgICAgICAgICAvLyB3ZSBzaG91bGQgdHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoIHRoaXNcbiAgICAgICAgICAgIC8vIGRldmljZSB0b2tlbi5cbiAgICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIC8vIFdlIGhhdmUgYSB1bmlxdWUgaW5zdGFsbCBJZCwgdXNlIHRoYXQgdG8gcHJlc2VydmVcbiAgICAgICAgICAgIC8vIHRoZSBpbnRlcmVzdGluZyBpbnN0YWxsYXRpb25cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2luc3RhbGxhdGlvbklkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkID09IHRoaXMuZGF0YS5vYmplY3RJZFxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIHdlIHBhc3NlZCBhbiBvYmplY3RJZCwgcHJlc2VydmUgdGhhdCBpbnN0YWxhdGlvblxuICAgICAgICAgICAgICBkZWxRdWVyeVsnb2JqZWN0SWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IGlkTWF0Y2gub2JqZWN0SWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBXaGF0IHRvIGRvIGhlcmU/IGNhbid0IHJlYWxseSBjbGVhbiB1cCBldmVyeXRoaW5nLi4uXG4gICAgICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEluIG5vbi1tZXJnZSBzY2VuYXJpb3MsIGp1c3QgcmV0dXJuIHRoZSBpbnN0YWxsYXRpb24gbWF0Y2ggaWRcbiAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4ob2JqSWQgPT4ge1xuICAgICAgaWYgKG9iaklkKSB7XG4gICAgICAgIHRoaXMucXVlcnkgPSB7IG9iamVjdElkOiBvYmpJZCB9O1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcbiAgICAgIH1cbiAgICAgIC8vIFRPRE86IFZhbGlkYXRlIG9wcyAoYWRkL3JlbW92ZSBvbiBjaGFubmVscywgJGluYyBvbiBiYWRnZSwgZXRjLilcbiAgICB9KTtcbiAgcmV0dXJuIHByb21pc2U7XG59O1xuXG4vLyBJZiB3ZSBzaG9ydC1jaXJjdWl0ZWQgdGhlIG9iamVjdCByZXNwb25zZSAtIHRoZW4gd2UgbmVlZCB0byBtYWtlIHN1cmUgd2UgZXhwYW5kIGFsbCB0aGUgZmlsZXMsXG4vLyBzaW5jZSB0aGlzIG1pZ2h0IG5vdCBoYXZlIGEgcXVlcnksIG1lYW5pbmcgaXQgd29uJ3QgcmV0dXJuIHRoZSBmdWxsIHJlc3VsdCBiYWNrLlxuLy8gVE9ETzogKG5sdXRzZW5rbykgVGhpcyBzaG91bGQgZGllIHdoZW4gd2UgbW92ZSB0byBwZXItY2xhc3MgYmFzZWQgY29udHJvbGxlcnMgb24gX1Nlc3Npb24vX1VzZXJcblJlc3RXcml0ZS5wcm90b3R5cGUuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENoZWNrIHdoZXRoZXIgd2UgaGF2ZSBhIHNob3J0LWNpcmN1aXRlZCByZXNwb25zZSAtIG9ubHkgdGhlbiBydW4gZXhwYW5zaW9uLlxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkRhdGFiYXNlT3BlcmF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Sb2xlJykge1xuICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci5yb2xlLmNsZWFyKCk7XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiYgdGhpcy5xdWVyeSAmJiB0aGlzLmF1dGguaXNVbmF1dGhlbnRpY2F0ZWQoKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlNFU1NJT05fTUlTU0lORyxcbiAgICAgIGBDYW5ub3QgbW9kaWZ5IHVzZXIgJHt0aGlzLnF1ZXJ5Lm9iamVjdElkfS5gXG4gICAgKTtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Qcm9kdWN0JyAmJiB0aGlzLmRhdGEuZG93bmxvYWQpIHtcbiAgICB0aGlzLmRhdGEuZG93bmxvYWROYW1lID0gdGhpcy5kYXRhLmRvd25sb2FkLm5hbWU7XG4gIH1cblxuICAvLyBUT0RPOiBBZGQgYmV0dGVyIGRldGVjdGlvbiBmb3IgQUNMLCBlbnN1cmluZyBhIHVzZXIgY2FuJ3QgYmUgbG9ja2VkIGZyb21cbiAgLy8gICAgICAgdGhlaXIgb3duIHVzZXIgcmVjb3JkLlxuICBpZiAodGhpcy5kYXRhLkFDTCAmJiB0aGlzLmRhdGEuQUNMWycqdW5yZXNvbHZlZCddKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQUNMLCAnSW52YWxpZCBBQ0wuJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIC8vIEZvcmNlIHRoZSB1c2VyIHRvIG5vdCBsb2Nrb3V0XG4gICAgLy8gTWF0Y2hlZCB3aXRoIHBhcnNlLmNvbVxuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiB0aGlzLmRhdGEuQUNMICYmIHRoaXMuYXV0aC5pc01hc3RlciAhPT0gdHJ1ZSkge1xuICAgICAgdGhpcy5kYXRhLkFDTFt0aGlzLnF1ZXJ5Lm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICB9XG4gICAgLy8gdXBkYXRlIHBhc3N3b3JkIHRpbWVzdGFtcCBpZiB1c2VyIHBhc3N3b3JkIGlzIGJlaW5nIGNoYW5nZWRcbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICkge1xuICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKTtcbiAgICB9XG4gICAgLy8gSWdub3JlIGNyZWF0ZWRBdCB3aGVuIHVwZGF0ZVxuICAgIGRlbGV0ZSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuXG4gICAgbGV0IGRlZmVyID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgLy8gaWYgcGFzc3dvcmQgaGlzdG9yeSBpcyBlbmFibGVkIHRoZW4gc2F2ZSB0aGUgY3VycmVudCBwYXNzd29yZCB0byBoaXN0b3J5XG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5XG4gICAgKSB7XG4gICAgICBkZWZlciA9IHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9XG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgbGV0IG9sZFBhc3N3b3JkcyA9IFtdO1xuICAgICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMgPSBfLnRha2UoXG4gICAgICAgICAgICAgIHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnksXG4gICAgICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy9uLTEgcGFzc3dvcmRzIGdvIGludG8gaGlzdG9yeSBpbmNsdWRpbmcgbGFzdCBwYXNzd29yZFxuICAgICAgICAgIHdoaWxlIChcbiAgICAgICAgICAgIG9sZFBhc3N3b3Jkcy5sZW5ndGggPiBNYXRoLm1heCgwLCB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgLSAyKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzLnNoaWZ0KCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9sZFBhc3N3b3Jkcy5wdXNoKHVzZXIucGFzc3dvcmQpO1xuICAgICAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfaGlzdG9yeSA9IG9sZFBhc3N3b3JkcztcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlZmVyLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gUnVuIGFuIHVwZGF0ZVxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC51cGRhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgIHJlc3BvbnNlLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZSA9IHsgcmVzcG9uc2UgfTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gU2V0IHRoZSBkZWZhdWx0IEFDTCBhbmQgcGFzc3dvcmQgdGltZXN0YW1wIGZvciB0aGUgbmV3IF9Vc2VyXG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICB2YXIgQUNMID0gdGhpcy5kYXRhLkFDTDtcbiAgICAgIC8vIGRlZmF1bHQgcHVibGljIHIvdyBBQ0xcbiAgICAgIGlmICghQUNMKSB7XG4gICAgICAgIEFDTCA9IHt9O1xuICAgICAgICBBQ0xbJyonXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IGZhbHNlIH07XG4gICAgICB9XG4gICAgICAvLyBtYWtlIHN1cmUgdGhlIHVzZXIgaXMgbm90IGxvY2tlZCBkb3duXG4gICAgICBBQ0xbdGhpcy5kYXRhLm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICAgIHRoaXMuZGF0YS5BQ0wgPSBBQ0w7XG4gICAgICAvLyBwYXNzd29yZCB0aW1lc3RhbXAgdG8gYmUgdXNlZCB3aGVuIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3kgaXMgZW5mb3JjZWRcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJ1biBhIGNyZWF0ZVxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmNyZWF0ZSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5kYXRhLCB0aGlzLnJ1bk9wdGlvbnMsIGZhbHNlLCB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlcilcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCBlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFF1aWNrIGNoZWNrLCBpZiB3ZSB3ZXJlIGFibGUgdG8gaW5mZXIgdGhlIGR1cGxpY2F0ZWQgZmllbGQgbmFtZVxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ3VzZXJuYW1lJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ2VtYWlsJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoaXMgd2FzIGEgZmFpbGVkIHVzZXIgY3JlYXRpb24gZHVlIHRvIHVzZXJuYW1lIG9yIGVtYWlsIGFscmVhZHkgdGFrZW4sIHdlIG5lZWQgdG9cbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciBpdCB3YXMgdXNlcm5hbWUgb3IgZW1haWwgYW5kIHJldHVybiB0aGUgYXBwcm9wcmlhdGUgZXJyb3IuXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICAgICAgLy8gVE9ETzogU2VlIGlmIHdlIGNhbiBsYXRlciBkbyB0aGlzIHdpdGhvdXQgYWRkaXRpb25hbCBxdWVyaWVzIGJ5IHVzaW5nIG5hbWVkIGluZGV4ZXMuXG4gICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgIC5maW5kKFxuICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0gfSxcbiAgICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5vYmplY3RJZCA9IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgcmVzcG9uc2UuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgICAgICBpZiAodGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSkge1xuICAgICAgICAgIHJlc3BvbnNlLnVzZXJuYW1lID0gdGhpcy5kYXRhLnVzZXJuYW1lO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIG5vdGhpbmcgLSBkb2Vzbid0IHdhaXQgZm9yIHRoZSB0cmlnZ2VyLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5BZnRlclNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UgfHwgIXRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlclNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyU2F2ZUhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGNvbnN0IGhhc0xpdmVRdWVyeSA9IHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuaGFzTGl2ZVF1ZXJ5KHRoaXMuY2xhc3NOYW1lKTtcbiAgaWYgKCFoYXNBZnRlclNhdmVIb29rICYmICFoYXNMaXZlUXVlcnkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB2YXIgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBleHRyYURhdGEub2JqZWN0SWQgPSB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIG9yaWdpbmFsIG9iamVjdCwgd2Ugb25seSBkbyB0aGlzIGZvciBhIHVwZGF0ZSB3cml0ZS5cbiAgbGV0IG9yaWdpbmFsT2JqZWN0O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIGluZmxhdGVkIG9iamVjdCwgZGlmZmVyZW50IGZyb20gYmVmb3JlU2F2ZSwgb3JpZ2luYWxEYXRhIGlzIG5vdCBlbXB0eVxuICAvLyBzaW5jZSBkZXZlbG9wZXJzIGNhbiBjaGFuZ2UgZGF0YSBpbiB0aGUgYmVmb3JlU2F2ZS5cbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRoaXMuYnVpbGRVcGRhdGVkT2JqZWN0KGV4dHJhRGF0YSk7XG4gIHVwZGF0ZWRPYmplY3QuX2hhbmRsZVNhdmVSZXNwb25zZSh0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLCB0aGlzLnJlc3BvbnNlLnN0YXR1cyB8fCAyMDApO1xuXG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgIC8vIE5vdGlmaXkgTGl2ZVF1ZXJ5U2VydmVyIGlmIHBvc3NpYmxlXG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyh1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSk7XG4gICAgdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5vbkFmdGVyU2F2ZShcbiAgICAgIHVwZGF0ZWRPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgcGVybXNcbiAgICApO1xuICB9KTtcblxuICAvLyBSdW4gYWZ0ZXJTYXZlIHRyaWdnZXJcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSByZXN1bHQ7XG4gICAgICB9XG4gICAgfSlcbiAgICAuY2F0Y2goZnVuY3Rpb24gKGVycikge1xuICAgICAgbG9nZ2VyLndhcm4oJ2FmdGVyU2F2ZSBjYXVnaHQgYW4gZXJyb3InLCBlcnIpO1xuICAgIH0pO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZmlndXJlIG91dCB3aGF0IGxvY2F0aW9uIHRoaXMgb3BlcmF0aW9uIGhhcHBlbnMgYXQuXG5SZXN0V3JpdGUucHJvdG90eXBlLmxvY2F0aW9uID0gZnVuY3Rpb24gKCkge1xuICB2YXIgbWlkZGxlID0gdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgPyAnL3VzZXJzLycgOiAnL2NsYXNzZXMvJyArIHRoaXMuY2xhc3NOYW1lICsgJy8nO1xuICBjb25zdCBtb3VudCA9IHRoaXMuY29uZmlnLm1vdW50IHx8IHRoaXMuY29uZmlnLnNlcnZlclVSTDtcbiAgcmV0dXJuIG1vdW50ICsgbWlkZGxlICsgdGhpcy5kYXRhLm9iamVjdElkO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IHRoZSBvYmplY3QgaWQgZm9yIHRoaXMgb3BlcmF0aW9uLlxuLy8gQmVjYXVzZSBpdCBjb3VsZCBiZSBlaXRoZXIgb24gdGhlIHF1ZXJ5IG9yIG9uIHRoZSBkYXRhXG5SZXN0V3JpdGUucHJvdG90eXBlLm9iamVjdElkID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5kYXRhLm9iamVjdElkIHx8IHRoaXMucXVlcnkub2JqZWN0SWQ7XG59O1xuXG4vLyBSZXR1cm5zIGEgY29weSBvZiB0aGUgZGF0YSBhbmQgZGVsZXRlIGJhZCBrZXlzIChfYXV0aF9kYXRhLCBfaGFzaGVkX3Bhc3N3b3JkLi4uKVxuUmVzdFdyaXRlLnByb3RvdHlwZS5zYW5pdGl6ZWREYXRhID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBkYXRhID0gT2JqZWN0LmtleXModGhpcy5kYXRhKS5yZWR1Y2UoKGRhdGEsIGtleSkgPT4ge1xuICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICBpZiAoIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICBkZWxldGUgZGF0YVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfSwgZGVlcGNvcHkodGhpcy5kYXRhKSk7XG4gIHJldHVybiBQYXJzZS5fZGVjb2RlKHVuZGVmaW5lZCwgZGF0YSk7XG59O1xuXG4vLyBSZXR1cm5zIGFuIHVwZGF0ZWQgY29weSBvZiB0aGUgb2JqZWN0XG5SZXN0V3JpdGUucHJvdG90eXBlLmJ1aWxkVXBkYXRlZE9iamVjdCA9IGZ1bmN0aW9uIChleHRyYURhdGEpIHtcbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKGZ1bmN0aW9uIChkYXRhLCBrZXkpIHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIGlmICh0eXBlb2YgZGF0YVtrZXldLl9fb3AgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHVwZGF0ZWRPYmplY3Quc2V0KGtleSwgZGF0YVtrZXldKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIHN1YmRvY3VtZW50IGtleSB3aXRoIGRvdCBub3RhdGlvbiB7ICd4LnknOiB2IH0gPT4geyAneCc6IHsgJ3knIDogdiB9IH0pXG4gICAgICAgIGNvbnN0IHNwbGl0dGVkS2V5ID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IHBhcmVudFByb3AgPSBzcGxpdHRlZEtleVswXTtcbiAgICAgICAgbGV0IHBhcmVudFZhbCA9IHVwZGF0ZWRPYmplY3QuZ2V0KHBhcmVudFByb3ApO1xuICAgICAgICBpZiAodHlwZW9mIHBhcmVudFZhbCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICBwYXJlbnRWYWwgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBwYXJlbnRWYWxbc3BsaXR0ZWRLZXlbMV1dID0gZGF0YVtrZXldO1xuICAgICAgICB1cGRhdGVkT2JqZWN0LnNldChwYXJlbnRQcm9wLCBwYXJlbnRWYWwpO1xuICAgICAgfVxuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuXG4gIHVwZGF0ZWRPYmplY3Quc2V0KHRoaXMuc2FuaXRpemVkRGF0YSgpKTtcbiAgcmV0dXJuIHVwZGF0ZWRPYmplY3Q7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNsZWFuVXNlckF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3QgdXNlciA9IHRoaXMucmVzcG9uc2UucmVzcG9uc2U7XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSA9IGZ1bmN0aW9uIChyZXNwb25zZSwgZGF0YSkge1xuICBpZiAoXy5pc0VtcHR5KHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyKSkge1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuICBjb25zdCBjbGllbnRTdXBwb3J0c0RlbGV0ZSA9IENsaWVudFNESy5zdXBwb3J0c0ZvcndhcmREZWxldGUodGhpcy5jbGllbnRTREspO1xuICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgY29uc3QgZGF0YVZhbHVlID0gZGF0YVtmaWVsZE5hbWVdO1xuXG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzcG9uc2UsIGZpZWxkTmFtZSkpIHtcbiAgICAgIHJlc3BvbnNlW2ZpZWxkTmFtZV0gPSBkYXRhVmFsdWU7XG4gICAgfVxuXG4gICAgLy8gU3RyaXBzIG9wZXJhdGlvbnMgZnJvbSByZXNwb25zZXNcbiAgICBpZiAocmVzcG9uc2VbZmllbGROYW1lXSAmJiByZXNwb25zZVtmaWVsZE5hbWVdLl9fb3ApIHtcbiAgICAgIGRlbGV0ZSByZXNwb25zZVtmaWVsZE5hbWVdO1xuICAgICAgaWYgKGNsaWVudFN1cHBvcnRzRGVsZXRlICYmIGRhdGFWYWx1ZS5fX29wID09ICdEZWxldGUnKSB7XG4gICAgICAgIHJlc3BvbnNlW2ZpZWxkTmFtZV0gPSBkYXRhVmFsdWU7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgUmVzdFdyaXRlO1xubW9kdWxlLmV4cG9ydHMgPSBSZXN0V3JpdGU7XG4iXX0=