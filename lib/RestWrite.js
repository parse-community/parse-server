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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJkZWVwY29weSIsIkF1dGgiLCJjcnlwdG9VdGlscyIsInBhc3N3b3JkQ3J5cHRvIiwiUGFyc2UiLCJ0cmlnZ2VycyIsIkNsaWVudFNESyIsIlJlc3RXcml0ZSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJxdWVyeSIsImRhdGEiLCJvcmlnaW5hbERhdGEiLCJjbGllbnRTREsiLCJjb250ZXh0IiwiYWN0aW9uIiwiaXNSZWFkT25seSIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInN0b3JhZ2UiLCJydW5PcHRpb25zIiwiYWxsb3dDdXN0b21PYmplY3RJZCIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm9iamVjdElkIiwiTUlTU0lOR19PQkpFQ1RfSUQiLCJJTlZBTElEX0tFWV9OQU1FIiwiaWQiLCJyZXNwb25zZSIsInVwZGF0ZWRBdCIsIl9lbmNvZGUiLCJEYXRlIiwiaXNvIiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwiZXhlY3V0ZSIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImdldFVzZXJBbmRSb2xlQUNMIiwidmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uIiwiaGFuZGxlSW5zdGFsbGF0aW9uIiwiaGFuZGxlU2Vzc2lvbiIsInZhbGlkYXRlQXV0aERhdGEiLCJydW5CZWZvcmVTYXZlVHJpZ2dlciIsImVuc3VyZVVuaXF1ZUF1dGhEYXRhSWQiLCJkZWxldGVFbWFpbFJlc2V0VG9rZW5JZk5lZWRlZCIsInZhbGlkYXRlU2NoZW1hIiwic2NoZW1hQ29udHJvbGxlciIsInNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQiLCJ0cmFuc2Zvcm1Vc2VyIiwiZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMiLCJkZXN0cm95RHVwbGljYXRlZFNlc3Npb25zIiwicnVuRGF0YWJhc2VPcGVyYXRpb24iLCJjcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCIsImhhbmRsZUZvbGxvd3VwIiwicnVuQWZ0ZXJTYXZlVHJpZ2dlciIsImNsZWFuVXNlckF1dGhEYXRhIiwiYXV0aERhdGFSZXNwb25zZSIsImlzTWFzdGVyIiwiYWNsIiwidXNlciIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwiY29uY2F0IiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImluZGV4T2YiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJoYXNDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYmVmb3JlU2F2ZSIsImFwcGxpY2F0aW9uSWQiLCJleHRyYURhdGEiLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFVwZGF0ZWRPYmplY3QiLCJpbmZsYXRlIiwiZGF0YWJhc2VQcm9taXNlIiwidXBkYXRlIiwiY3JlYXRlIiwicmVzdWx0IiwibGVuZ3RoIiwiT0JKRUNUX05PVF9GT1VORCIsIm1heWJlUnVuVHJpZ2dlciIsIm9iamVjdCIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJfIiwicmVkdWNlIiwidmFsdWUiLCJrZXkiLCJpc0VxdWFsIiwicHVzaCIsInJ1bkJlZm9yZUxvZ2luVHJpZ2dlciIsInVzZXJEYXRhIiwiYmVmb3JlTG9naW4iLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiZ2V0QWxsQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJzY2hlbWEiLCJmaW5kIiwib25lQ2xhc3MiLCJzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQiLCJmaWVsZE5hbWUiLCJzZXREZWZhdWx0IiwidW5kZWZpbmVkIiwiX19vcCIsImZpZWxkcyIsImRlZmF1bHRWYWx1ZSIsInJlcXVpcmVkIiwiVkFMSURBVElPTl9FUlJPUiIsImNyZWF0ZWRBdCIsIm5ld09iamVjdElkIiwib2JqZWN0SWRTaXplIiwia2V5cyIsImZvckVhY2giLCJhdXRoRGF0YSIsImhhc1VzZXJuYW1lQW5kUGFzc3dvcmQiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiaXNFbXB0eSIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInByb3ZpZGVycyIsImNhbkhhbmRsZUF1dGhEYXRhIiwic29tZSIsInByb3ZpZGVyIiwicHJvdmlkZXJBdXRoRGF0YSIsImhhc1Rva2VuIiwiZ2V0VXNlcklkIiwiaGFuZGxlQXV0aERhdGEiLCJmaWx0ZXJlZE9iamVjdHNCeUFDTCIsIm9iamVjdHMiLCJmaWx0ZXIiLCJBQ0wiLCJoYXNBdXRoRGF0YUlkIiwiciIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsInJlc3VsdHMiLCJBQ0NPVU5UX0FMUkVBRFlfTElOS0VEIiwidXNlcklkIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwidmFsaWRhdGVkQXV0aERhdGEiLCJ1c2VyUmVzdWx0Iiwiam9pbiIsImhhc011dGF0ZWRBdXRoRGF0YSIsIm11dGF0ZWRBdXRoRGF0YSIsImlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3RlciIsImlzTG9naW4iLCJsb2NhdGlvbiIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJyZXMiLCJwcm9taXNlIiwiZXJyb3IiLCJSZXN0UXVlcnkiLCJtYXN0ZXIiLCJfX3R5cGUiLCJzZXNzaW9uIiwiY2FjaGVDb250cm9sbGVyIiwiZGVsIiwic2Vzc2lvblRva2VuIiwiX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3kiLCJoYXNoIiwiaGFzaGVkUGFzc3dvcmQiLCJfaGFzaGVkX3Bhc3N3b3JkIiwiX3ZhbGlkYXRlVXNlck5hbWUiLCJfdmFsaWRhdGVFbWFpbCIsInJhbmRvbVN0cmluZyIsInJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lIiwiJG5lIiwibGltaXQiLCJjYXNlSW5zZW5zaXRpdmUiLCJVU0VSTkFNRV9UQUtFTiIsImVtYWlsIiwibWF0Y2giLCJyZWplY3QiLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJFTUFJTF9UQUtFTiIsInVzZXJDb250cm9sbGVyIiwic2V0RW1haWxWZXJpZnlUb2tlbiIsInBhc3N3b3JkUG9saWN5IiwiX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMiLCJfdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkiLCJwb2xpY3lFcnJvciIsInZhbGlkYXRpb25FcnJvciIsImNvbnRhaW5zVXNlcm5hbWVFcnJvciIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsIm9sZFBhc3N3b3JkcyIsIl9wYXNzd29yZF9oaXN0b3J5IiwidGFrZSIsIm5ld1Bhc3N3b3JkIiwicHJvbWlzZXMiLCJtYXAiLCJjb21wYXJlIiwiYWxsIiwiY2F0Y2giLCJlcnIiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwidmVyaWZ5VXNlckVtYWlscyIsImNyZWF0ZVNlc3Npb25Ub2tlbiIsImluc3RhbGxhdGlvbklkIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiY3JlYXRlZFdpdGgiLCJhdXRoUHJvdmlkZXIiLCJhZGRPcHMiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJhc3NpZ24iLCJkZXN0cm95IiwicmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCIsInNlc3Npb25RdWVyeSIsImJpbmQiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJhZGRpdGlvbmFsU2Vzc2lvbkRhdGEiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJzdGF0dXMiLCJkZXZpY2VUb2tlbiIsInRvTG93ZXJDYXNlIiwiZGV2aWNlVHlwZSIsImlkTWF0Y2giLCJvYmplY3RJZE1hdGNoIiwiaW5zdGFsbGF0aW9uSWRNYXRjaCIsImRldmljZVRva2VuTWF0Y2hlcyIsIm9yUXVlcmllcyIsIiRvciIsImRlbFF1ZXJ5IiwiYXBwSWRlbnRpZmllciIsImNvZGUiLCJvYmpJZCIsInJvbGUiLCJjbGVhciIsImlzVW5hdXRoZW50aWNhdGVkIiwiU0VTU0lPTl9NSVNTSU5HIiwiZG93bmxvYWQiLCJkb3dubG9hZE5hbWUiLCJuYW1lIiwiSU5WQUxJRF9BQ0wiLCJyZWFkIiwid3JpdGUiLCJtYXhQYXNzd29yZEFnZSIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiZGVmZXIiLCJNYXRoIiwibWF4Iiwic2hpZnQiLCJfdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSIsIkRVUExJQ0FURV9WQUxVRSIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImhhc0FmdGVyU2F2ZUhvb2siLCJhZnRlclNhdmUiLCJoYXNMaXZlUXVlcnkiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiX2hhbmRsZVNhdmVSZXNwb25zZSIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwib25BZnRlclNhdmUiLCJsb2dnZXIiLCJ3YXJuIiwibWlkZGxlIiwibW91bnQiLCJzZXJ2ZXJVUkwiLCJzYW5pdGl6ZWREYXRhIiwidGVzdCIsIl9kZWNvZGUiLCJzZXQiLCJzcGxpdHRlZEtleSIsInNwbGl0IiwicGFyZW50UHJvcCIsInBhcmVudFZhbCIsImdldCIsImNsaWVudFN1cHBvcnRzRGVsZXRlIiwic3VwcG9ydHNGb3J3YXJkRGVsZXRlIiwiZGF0YVZhbHVlIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQWFBOztBQUNBOztBQUNBOzs7O0FBZkE7QUFDQTtBQUNBO0FBRUEsSUFBSUEsZ0JBQWdCLEdBQUdDLE9BQU8sQ0FBQyxnQ0FBRCxDQUE5Qjs7QUFDQSxJQUFJQyxRQUFRLEdBQUdELE9BQU8sQ0FBQyxVQUFELENBQXRCOztBQUVBLE1BQU1FLElBQUksR0FBR0YsT0FBTyxDQUFDLFFBQUQsQ0FBcEI7O0FBQ0EsSUFBSUcsV0FBVyxHQUFHSCxPQUFPLENBQUMsZUFB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T2pGLFFBQVEsQ0FBQzhFLFNBQUQsQ0FBZjs7QUFDQSxVQUFJOEssb0JBQW9CLElBQUlFLFNBQVMsQ0FBQzdLLElBQVYsSUFBa0IsUUFBOUMsRUFBd0Q7QUFDdERqRixRQUFBQSxRQUFRLENBQUM4RSxTQUFELENBQVIsR0FBc0JnTCxTQUF0QjtBQUNEO0FBQ0Y7QUFDRixHQWREO0FBZUEsU0FBTzlQLFFBQVA7QUFDRCxDQXJCRDs7ZUF1QmV4QixTOztBQUNmdVIsTUFBTSxDQUFDQyxPQUFQLEdBQWlCeFIsU0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIFJlc3RXcml0ZSBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhbiBvcGVyYXRpb25cbi8vIHRoYXQgd3JpdGVzIHRvIHRoZSBkYXRhYmFzZS5cbi8vIFRoaXMgY291bGQgYmUgZWl0aGVyIGEgXCJjcmVhdGVcIiBvciBhbiBcInVwZGF0ZVwiLlxuXG52YXIgU2NoZW1hQ29udHJvbGxlciA9IHJlcXVpcmUoJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcicpO1xudmFyIGRlZXBjb3B5ID0gcmVxdWlyZSgnZGVlcGNvcHknKTtcblxuY29uc3QgQXV0aCA9IHJlcXVpcmUoJy4vQXV0aCcpO1xudmFyIGNyeXB0b1V0aWxzID0gcmVxdWlyZSgnLi9jcnlwdG9VdGlscycpO1xudmFyIHBhc3N3b3JkQ3J5cHRvID0gcmVxdWlyZSgnLi9wYXNzd29yZCcpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xudmFyIHRyaWdnZXJzID0gcmVxdWlyZSgnLi90cmlnZ2VycycpO1xudmFyIENsaWVudFNESyA9IHJlcXVpcmUoJy4vQ2xpZW50U0RLJyk7XG5pbXBvcnQgUmVzdFF1ZXJ5IGZyb20gJy4vUmVzdFF1ZXJ5JztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcblxuLy8gcXVlcnkgYW5kIGRhdGEgYXJlIGJvdGggcHJvdmlkZWQgaW4gUkVTVCBBUEkgZm9ybWF0LiBTbyBkYXRhXG4vLyB0eXBlcyBhcmUgZW5jb2RlZCBieSBwbGFpbiBvbGQgb2JqZWN0cy5cbi8vIElmIHF1ZXJ5IGlzIG51bGwsIHRoaXMgaXMgYSBcImNyZWF0ZVwiIGFuZCB0aGUgZGF0YSBpbiBkYXRhIHNob3VsZCBiZVxuLy8gY3JlYXRlZC5cbi8vIE90aGVyd2lzZSB0aGlzIGlzIGFuIFwidXBkYXRlXCIgLSB0aGUgb2JqZWN0IG1hdGNoaW5nIHRoZSBxdWVyeVxuLy8gc2hvdWxkIGdldCB1cGRhdGVkIHdpdGggZGF0YS5cbi8vIFJlc3RXcml0ZSB3aWxsIGhhbmRsZSBvYmplY3RJZCwgY3JlYXRlZEF0LCBhbmQgdXBkYXRlZEF0IGZvclxuLy8gZXZlcnl0aGluZy4gSXQgYWxzbyBrbm93cyB0byB1c2UgdHJpZ2dlcnMgYW5kIHNwZWNpYWwgbW9kaWZpY2F0aW9uc1xuLy8gZm9yIHRoZSBfVXNlciBjbGFzcy5cbmZ1bmN0aW9uIFJlc3RXcml0ZShjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgcXVlcnksIGRhdGEsIG9yaWdpbmFsRGF0YSwgY2xpZW50U0RLLCBjb250ZXh0LCBhY3Rpb24pIHtcbiAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAnQ2Fubm90IHBlcmZvcm0gYSB3cml0ZSBvcGVyYXRpb24gd2hlbiB1c2luZyByZWFkT25seU1hc3RlcktleSdcbiAgICApO1xuICB9XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmF1dGggPSBhdXRoO1xuICB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgdGhpcy5jbGllbnRTREsgPSBjbGllbnRTREs7XG4gIHRoaXMuc3RvcmFnZSA9IHt9O1xuICB0aGlzLnJ1bk9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0gY29udGV4dCB8fCB7fTtcblxuICBpZiAoYWN0aW9uKSB7XG4gICAgdGhpcy5ydW5PcHRpb25zLmFjdGlvbiA9IGFjdGlvbjtcbiAgfVxuXG4gIGlmICghcXVlcnkpIHtcbiAgICBpZiAodGhpcy5jb25maWcuYWxsb3dDdXN0b21PYmplY3RJZCkge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChkYXRhLCAnb2JqZWN0SWQnKSAmJiAhZGF0YS5vYmplY3RJZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuTUlTU0lOR19PQkpFQ1RfSUQsXG4gICAgICAgICAgJ29iamVjdElkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsIG9yIHVuZGVmaW5lZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdvYmplY3RJZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgICBpZiAoZGF0YS5pZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ2lkIGlzIGFuIGludmFsaWQgZmllbGQgbmFtZS4nKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBXaGVuIHRoZSBvcGVyYXRpb24gaXMgY29tcGxldGUsIHRoaXMucmVzcG9uc2UgbWF5IGhhdmUgc2V2ZXJhbFxuICAvLyBmaWVsZHMuXG4gIC8vIHJlc3BvbnNlOiB0aGUgYWN0dWFsIGRhdGEgdG8gYmUgcmV0dXJuZWRcbiAgLy8gc3RhdHVzOiB0aGUgaHR0cCBzdGF0dXMgY29kZS4gaWYgbm90IHByZXNlbnQsIHRyZWF0ZWQgbGlrZSBhIDIwMFxuICAvLyBsb2NhdGlvbjogdGhlIGxvY2F0aW9uIGhlYWRlci4gaWYgbm90IHByZXNlbnQsIG5vIGxvY2F0aW9uIGhlYWRlclxuICB0aGlzLnJlc3BvbnNlID0gbnVsbDtcblxuICAvLyBQcm9jZXNzaW5nIHRoaXMgb3BlcmF0aW9uIG1heSBtdXRhdGUgb3VyIGRhdGEsIHNvIHdlIG9wZXJhdGUgb24gYVxuICAvLyBjb3B5XG4gIHRoaXMucXVlcnkgPSBkZWVwY29weShxdWVyeSk7XG4gIHRoaXMuZGF0YSA9IGRlZXBjb3B5KGRhdGEpO1xuICAvLyBXZSBuZXZlciBjaGFuZ2Ugb3JpZ2luYWxEYXRhLCBzbyB3ZSBkbyBub3QgbmVlZCBhIGRlZXAgY29weVxuICB0aGlzLm9yaWdpbmFsRGF0YSA9IG9yaWdpbmFsRGF0YTtcblxuICAvLyBUaGUgdGltZXN0YW1wIHdlJ2xsIHVzZSBmb3IgdGhpcyB3aG9sZSBvcGVyYXRpb25cbiAgdGhpcy51cGRhdGVkQXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpLmlzbztcblxuICAvLyBTaGFyZWQgU2NoZW1hQ29udHJvbGxlciB0byBiZSByZXVzZWQgdG8gcmVkdWNlIHRoZSBudW1iZXIgb2YgbG9hZFNjaGVtYSgpIGNhbGxzIHBlciByZXF1ZXN0XG4gIC8vIE9uY2Ugc2V0IHRoZSBzY2hlbWFEYXRhIHNob3VsZCBiZSBpbW11dGFibGVcbiAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIgPSBudWxsO1xufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIHRoZVxuLy8gd3JpdGUsIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEge3Jlc3BvbnNlLCBzdGF0dXMsIGxvY2F0aW9ufSBvYmplY3QuXG4vLyBzdGF0dXMgYW5kIGxvY2F0aW9uIGFyZSBvcHRpb25hbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5zdGFsbGF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVTZXNzaW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5CZWZvcmVTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZW5zdXJlVW5pcXVlQXV0aERhdGFJZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hKCk7XG4gICAgfSlcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB0aGlzLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybVVzZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5EYXRhYmFzZU9wZXJhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlclNhdmVUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jbGVhblVzZXJBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gQXBwZW5kIHRoZSBhdXRoRGF0YVJlc3BvbnNlIGlmIGV4aXN0c1xuICAgICAgaWYgKHRoaXMuYXV0aERhdGFSZXNwb25zZSkge1xuICAgICAgICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVJlc3BvbnNlID0gdGhpcy5hdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5yZXNwb25zZTtcbiAgICB9KTtcbn07XG5cbi8vIFVzZXMgdGhlIEF1dGggb2JqZWN0IHRvIGdldCB0aGUgbGlzdCBvZiByb2xlcywgYWRkcyB0aGUgdXNlciBpZFxuUmVzdFdyaXRlLnByb3RvdHlwZS5nZXRVc2VyQW5kUm9sZUFDTCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIHRoaXMucnVuT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5ydW5PcHRpb25zLmFjbCA9IHRoaXMucnVuT3B0aW9ucy5hY2wuY29uY2F0KHJvbGVzLCBbdGhpcy5hdXRoLnVzZXIuaWRdKTtcbiAgICAgIHJldHVybjtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gY29uZmlnLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChcbiAgICB0aGlzLmNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT09IGZhbHNlICYmXG4gICAgIXRoaXMuYXV0aC5pc01hc3RlciAmJlxuICAgIFNjaGVtYUNvbnRyb2xsZXIuc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKHRoaXMuY2xhc3NOYW1lKSA9PT0gLTFcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuaGFzQ2xhc3ModGhpcy5jbGFzc05hbWUpKVxuICAgICAgLnRoZW4oaGFzQ2xhc3MgPT4ge1xuICAgICAgICBpZiAoaGFzQ2xhc3MgIT09IHRydWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgJ1RoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBhY2Nlc3MgJyArICdub24tZXhpc3RlbnQgY2xhc3M6ICcgKyB0aGlzLmNsYXNzTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIHNjaGVtYS5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVTY2hlbWEgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS52YWxpZGF0ZU9iamVjdChcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0aGlzLmRhdGEsXG4gICAgdGhpcy5xdWVyeSxcbiAgICB0aGlzLnJ1bk9wdGlvbnNcbiAgKTtcbn07XG5cbi8vIFJ1bnMgYW55IGJlZm9yZVNhdmUgdHJpZ2dlcnMgYWdhaW5zdCB0aGlzIG9wZXJhdGlvbi5cbi8vIEFueSBjaGFuZ2UgbGVhZHMgdG8gb3VyIGRhdGEgYmVpbmcgbXV0YXRlZC5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKHRoaXMuY2xhc3NOYW1lLCB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLCB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBDbG91ZCBjb2RlIGdldHMgYSBiaXQgb2YgZXh0cmEgZGF0YSBmb3IgaXRzIG9iamVjdHNcbiAgdmFyIGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSB9O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgZXh0cmFEYXRhLm9iamVjdElkID0gdGhpcy5xdWVyeS5vYmplY3RJZDtcbiAgfVxuXG4gIGxldCBvcmlnaW5hbE9iamVjdCA9IG51bGw7XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0aGlzLmJ1aWxkVXBkYXRlZE9iamVjdChleHRyYURhdGEpO1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgLy8gVGhpcyBpcyBhbiB1cGRhdGUgZm9yIGV4aXN0aW5nIG9iamVjdC5cbiAgICBvcmlnaW5hbE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIH1cblxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBCZWZvcmUgY2FsbGluZyB0aGUgdHJpZ2dlciwgdmFsaWRhdGUgdGhlIHBlcm1pc3Npb25zIGZvciB0aGUgc2F2ZSBvcGVyYXRpb25cbiAgICAgIGxldCBkYXRhYmFzZVByb21pc2UgPSBudWxsO1xuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIHVwZGF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgY3JlYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UuY3JlYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSW4gdGhlIGNhc2UgdGhhdCB0aGVyZSBpcyBubyBwZXJtaXNzaW9uIGZvciB0aGUgb3BlcmF0aW9uLCBpdCB0aHJvd3MgYW4gZXJyb3JcbiAgICAgIHJldHVybiBkYXRhYmFzZVByb21pc2UudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQubGVuZ3RoIDw9IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgICAgdGhpcy5hdXRoLFxuICAgICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgICAgdGhpcy5jb25maWcsXG4gICAgICAgIHRoaXMuY29udGV4dFxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSBfLnJlZHVjZShcbiAgICAgICAgICByZXNwb25zZS5vYmplY3QsXG4gICAgICAgICAgKHJlc3VsdCwgdmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYgKCFfLmlzRXF1YWwodGhpcy5kYXRhW2tleV0sIHZhbHVlKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9LFxuICAgICAgICAgIFtdXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGF0YSA9IHJlc3BvbnNlLm9iamVjdDtcbiAgICAgICAgLy8gV2Ugc2hvdWxkIGRlbGV0ZSB0aGUgb2JqZWN0SWQgZm9yIGFuIHVwZGF0ZSB3cml0ZVxuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5CZWZvcmVMb2dpblRyaWdnZXIgPSBhc3luYyBmdW5jdGlvbiAodXNlckRhdGEpIHtcbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlTG9naW4nIHRyaWdnZXJcbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKHRoaXMuY2xhc3NOYW1lLCB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbiwgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZClcbiAgKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQ2xvdWQgY29kZSBnZXRzIGEgYml0IG9mIGV4dHJhIGRhdGEgZm9yIGl0cyBvYmplY3RzXG4gIGNvbnN0IGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSB9O1xuXG4gIC8vIEV4cGFuZCBmaWxlIG9iamVjdHNcbiAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHVzZXJEYXRhKTtcblxuICBjb25zdCB1c2VyID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHVzZXJEYXRhKTtcblxuICAvLyBubyBuZWVkIHRvIHJldHVybiBhIHJlc3BvbnNlXG4gIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbixcbiAgICB0aGlzLmF1dGgsXG4gICAgdXNlcixcbiAgICBudWxsLFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuY29udGV4dFxuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5kYXRhKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKS50aGVuKGFsbENsYXNzZXMgPT4ge1xuICAgICAgY29uc3Qgc2NoZW1hID0gYWxsQ2xhc3Nlcy5maW5kKG9uZUNsYXNzID0+IG9uZUNsYXNzLmNsYXNzTmFtZSA9PT0gdGhpcy5jbGFzc05hbWUpO1xuICAgICAgY29uc3Qgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkID0gKGZpZWxkTmFtZSwgc2V0RGVmYXVsdCkgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSBudWxsIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICcnIHx8XG4gICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiYgdGhpcy5kYXRhW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHNldERlZmF1bHQgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZSAhPT0gbnVsbCAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICAgICAodGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgICAgICAodHlwZW9mIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnb2JqZWN0JyAmJiB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWU7XG4gICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9IHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIHx8IFtdO1xuICAgICAgICAgICAgaWYgKHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5yZXF1aXJlZCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGAke2ZpZWxkTmFtZX0gaXMgcmVxdWlyZWRgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIC8vIEFkZCBkZWZhdWx0IGZpZWxkc1xuICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcblxuICAgICAgICAvLyBPbmx5IGFzc2lnbiBuZXcgb2JqZWN0SWQgaWYgd2UgYXJlIGNyZWF0aW5nIG5ldyBvYmplY3RcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSBjcnlwdG9VdGlscy5uZXdPYmplY3RJZCh0aGlzLmNvbmZpZy5vYmplY3RJZFNpemUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCB0cnVlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChzY2hlbWEpIHtcbiAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkKGZpZWxkTmFtZSwgZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG4vLyBUcmFuc2Zvcm1zIGF1dGggZGF0YSBmb3IgYSB1c2VyIG9iamVjdC5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGEgdXNlciBvYmplY3QuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hlbiB3ZSdyZSBkb25lIGlmIGl0IGNhbid0IGZpbmlzaCB0aGlzIHRpY2suXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGF1dGhEYXRhID0gdGhpcy5kYXRhLmF1dGhEYXRhO1xuICBjb25zdCBoYXNVc2VybmFtZUFuZFBhc3N3b3JkID1cbiAgICB0eXBlb2YgdGhpcy5kYXRhLnVzZXJuYW1lID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkID09PSAnc3RyaW5nJztcblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIWF1dGhEYXRhKSB7XG4gICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEudXNlcm5hbWUgIT09ICdzdHJpbmcnIHx8IF8uaXNFbXB0eSh0aGlzLmRhdGEudXNlcm5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ2JhZCBvciBtaXNzaW5nIHVzZXJuYW1lJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fCBfLmlzRW1wdHkodGhpcy5kYXRhLnBhc3N3b3JkKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChcbiAgICAoYXV0aERhdGEgJiYgIU9iamVjdC5rZXlzKGF1dGhEYXRhKS5sZW5ndGgpIHx8XG4gICAgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLmRhdGEsICdhdXRoRGF0YScpXG4gICkge1xuICAgIC8vIE5vdGhpbmcgdG8gdmFsaWRhdGUgaGVyZVxuICAgIHJldHVybjtcbiAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgLy8gSGFuZGxlIHNhdmluZyBhdXRoRGF0YSB0byBudWxsXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgKTtcbiAgfVxuXG4gIHZhciBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGlmIChwcm92aWRlcnMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNhbkhhbmRsZUF1dGhEYXRhID0gcHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgICAgdmFyIHByb3ZpZGVyQXV0aERhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB2YXIgaGFzVG9rZW4gPSBwcm92aWRlckF1dGhEYXRhICYmIHByb3ZpZGVyQXV0aERhdGEuaWQ7XG4gICAgICByZXR1cm4gaGFzVG9rZW4gfHwgcHJvdmlkZXJBdXRoRGF0YSA9PT0gbnVsbDtcbiAgICB9KTtcbiAgICBpZiAoY2FuSGFuZGxlQXV0aERhdGEgfHwgaGFzVXNlcm5hbWVBbmRQYXNzd29yZCB8fCB0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5nZXRVc2VySWQoKSkge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGEoYXV0aERhdGEpO1xuICAgIH1cbiAgfVxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maWx0ZXJlZE9iamVjdHNCeUFDTCA9IGZ1bmN0aW9uIChvYmplY3RzKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0cztcbiAgfVxuICByZXR1cm4gb2JqZWN0cy5maWx0ZXIob2JqZWN0ID0+IHtcbiAgICBpZiAoIW9iamVjdC5BQ0wpIHtcbiAgICAgIHJldHVybiB0cnVlOyAvLyBsZWdhY3kgdXNlcnMgdGhhdCBoYXZlIG5vIEFDTCBmaWVsZCBvbiB0aGVtXG4gICAgfVxuICAgIC8vIFJlZ3VsYXIgdXNlcnMgdGhhdCBoYXZlIGJlZW4gbG9ja2VkIG91dC5cbiAgICByZXR1cm4gb2JqZWN0LkFDTCAmJiBPYmplY3Qua2V5cyhvYmplY3QuQUNMKS5sZW5ndGggPiAwO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlcklkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuIHRoaXMucXVlcnkub2JqZWN0SWQ7XG4gIH0gZWxzZSBpZiAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC51c2VyLmlkO1xuICB9XG59O1xuXG4vLyBEZXZlbG9wZXJzIGFyZSBhbGxvd2VkIHRvIGNoYW5nZSBhdXRoRGF0YSB2aWEgYmVmb3JlIHNhdmUgdHJpZ2dlclxuLy8gd2UgbmVlZCBhZnRlciBiZWZvcmUgc2F2ZSB0byBlbnN1cmUgdGhhdCB0aGUgZGV2ZWxvcGVyXG4vLyBpcyBub3QgY3VycmVudGx5IGR1cGxpY2F0aW5nIGF1dGggZGF0YSBJRFxuUmVzdFdyaXRlLnByb3RvdHlwZS5lbnN1cmVVbmlxdWVBdXRoRGF0YUlkID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHJldHVybjtcbiAgaWYgKCF0aGlzLmRhdGEuYXV0aERhdGEpIHJldHVybjtcblxuICBjb25zdCBoYXNBdXRoRGF0YUlkID0gT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5zb21lKFxuICAgIGtleSA9PiB0aGlzLmRhdGEuYXV0aERhdGFba2V5XSAmJiB0aGlzLmRhdGEuYXV0aERhdGFba2V5XS5pZFxuICApO1xuXG4gIGlmICghaGFzQXV0aERhdGFJZCkgcmV0dXJuO1xuXG4gIGNvbnN0IHIgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YSh0aGlzLmNvbmZpZywgdGhpcy5kYXRhLmF1dGhEYXRhKTtcbiAgY29uc3QgcmVzdWx0cyA9IHRoaXMuZmlsdGVyZWRPYmplY3RzQnlBQ0wocik7XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxuICAvLyB1c2UgZGF0YS5vYmplY3RJZCBpbiBjYXNlIG9mIGxvZ2luIHRpbWUgYW5kIGZvdW5kIHVzZXIgZHVyaW5nIGhhbmRsZSB2YWxpZGF0ZUF1dGhEYXRhXG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMuZ2V0VXNlcklkKCkgfHwgdGhpcy5kYXRhLm9iamVjdElkO1xuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEgJiYgdXNlcklkICE9PSByZXN1bHRzWzBdLm9iamVjdElkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlQXV0aERhdGEgPSBhc3luYyBmdW5jdGlvbiAoYXV0aERhdGEpIHtcbiAgY29uc3QgciA9IGF3YWl0IEF1dGguZmluZFVzZXJzV2l0aEF1dGhEYXRhKHRoaXMuY29uZmlnLCBhdXRoRGF0YSk7XG4gIGNvbnN0IHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuXG4gIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAvLyBUbyBhdm9pZCBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9zZWN1cml0eS9hZHZpc29yaWVzL0dIU0EtOHczai1nOTgzLThqaDVcbiAgICAvLyBMZXQncyBydW4gc29tZSB2YWxpZGF0aW9uIGJlZm9yZSB0aHJvd2luZ1xuICAgIGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKGF1dGhEYXRhLCB0aGlzLCByZXN1bHRzWzBdKTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxuXG4gIC8vIE5vIHVzZXIgZm91bmQgd2l0aCBwcm92aWRlZCBhdXRoRGF0YSB3ZSBuZWVkIHRvIHZhbGlkYXRlXG4gIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICBjb25zdCB7IGF1dGhEYXRhOiB2YWxpZGF0ZWRBdXRoRGF0YSwgYXV0aERhdGFSZXNwb25zZSB9ID0gYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHRoaXNcbiAgICApO1xuICAgIHRoaXMuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgLy8gUmVwbGFjZSBjdXJyZW50IGF1dGhEYXRhIGJ5IHRoZSBuZXcgdmFsaWRhdGVkIG9uZVxuICAgIHRoaXMuZGF0YS5hdXRoRGF0YSA9IHZhbGlkYXRlZEF1dGhEYXRhO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFVzZXIgZm91bmQgd2l0aCBwcm92aWRlZCBhdXRoRGF0YVxuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEpIHtcbiAgICBjb25zdCB1c2VySWQgPSB0aGlzLmdldFVzZXJJZCgpO1xuICAgIGNvbnN0IHVzZXJSZXN1bHQgPSByZXN1bHRzWzBdO1xuICAgIC8vIFByZXZlbnQgZHVwbGljYXRlIGF1dGhEYXRhIGlkXG4gICAgaWYgKHVzZXJJZCAmJiB1c2VySWQgIT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICAgIH1cblxuICAgIHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuam9pbignLCcpO1xuXG4gICAgY29uc3QgeyBoYXNNdXRhdGVkQXV0aERhdGEsIG11dGF0ZWRBdXRoRGF0YSB9ID0gQXV0aC5oYXNNdXRhdGVkQXV0aERhdGEoXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHVzZXJSZXN1bHQuYXV0aERhdGFcbiAgICApO1xuXG4gICAgY29uc3QgaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyID1cbiAgICAgICh0aGlzLmF1dGggJiYgdGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5hdXRoLnVzZXIuaWQgPT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHx8XG4gICAgICB0aGlzLmF1dGguaXNNYXN0ZXI7XG5cbiAgICAvLyBQcmV2ZW50IHZhbGlkYXRpbmcgaWYgbm8gbXV0YXRlZCBkYXRhIGRldGVjdGVkXG4gICAgaWYgKCFoYXNNdXRhdGVkQXV0aERhdGEgJiYgaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaXNMb2dpbiA9ICF1c2VySWQ7XG5cbiAgICBpZiAoaXNMb2dpbiB8fCBoYXNNdXRhdGVkQXV0aERhdGEpIHtcbiAgICAgIC8vIG5vIHVzZXIgbWFraW5nIHRoZSBjYWxsXG4gICAgICAvLyBPUiB0aGUgdXNlciBtYWtpbmcgdGhlIGNhbGwgaXMgdGhlIHJpZ2h0IG9uZVxuICAgICAgLy8gTG9naW4gd2l0aCBhdXRoIGRhdGFcbiAgICAgIGRlbGV0ZSByZXN1bHRzWzBdLnBhc3N3b3JkO1xuXG4gICAgICAvLyBuZWVkIHRvIHNldCB0aGUgb2JqZWN0SWQgZmlyc3Qgb3RoZXJ3aXNlIGxvY2F0aW9uIGhhcyB0cmFpbGluZyB1bmRlZmluZWRcbiAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IHVzZXJSZXN1bHQub2JqZWN0SWQ7XG5cbiAgICAgIGlmIChpc0xvZ2luKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgcmVzcG9uc2U6IHVzZXJSZXN1bHQsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gUnVuIGJlZm9yZUxvZ2luIGhvb2sgYmVmb3JlIHN0b3JpbmcgYW55IHVwZGF0ZXNcbiAgICAgICAgLy8gdG8gYXV0aERhdGEgb24gdGhlIGRiOyBjaGFuZ2VzIHRvIHVzZXJSZXN1bHRcbiAgICAgICAgLy8gd2lsbCBiZSBpZ25vcmVkLlxuICAgICAgICBhd2FpdCB0aGlzLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlcihkZWVwY29weSh1c2VyUmVzdWx0KSk7XG5cbiAgICAgICAgLy8gSWYgd2UgYXJlIGluIGxvZ2luIG9wZXJhdGlvbiB2aWEgYXV0aERhdGFcbiAgICAgICAgLy8gd2UgbmVlZCB0byBiZSBzdXJlIHRoYXQgdGhlIHVzZXIgaGFzIHByb3ZpZGVkXG4gICAgICAgIC8vIHJlcXVpcmVkIGF1dGhEYXRhXG4gICAgICAgIEF1dGguY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbihcbiAgICAgICAgICBhdXRoRGF0YSxcbiAgICAgICAgICB1c2VyUmVzdWx0LmF1dGhEYXRhLFxuICAgICAgICAgIHRoaXMuY29uZmlnXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIC8vIEZvcmNlIHRvIHZhbGlkYXRlIGFsbCBwcm92aWRlZCBhdXRoRGF0YSBvbiBsb2dpblxuICAgICAgLy8gb24gdXBkYXRlIG9ubHkgdmFsaWRhdGUgbXV0YXRlZCBvbmVzXG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgICAgaXNMb2dpbiA/IGF1dGhEYXRhIDogbXV0YXRlZEF1dGhEYXRhLFxuICAgICAgICB0aGlzLFxuICAgICAgICB1c2VyUmVzdWx0XG4gICAgICApO1xuICAgICAgdGhpcy5kYXRhLmF1dGhEYXRhID0gcmVzLmF1dGhEYXRhO1xuICAgICAgdGhpcy5hdXRoRGF0YVJlc3BvbnNlID0gcmVzLmF1dGhEYXRhUmVzcG9uc2U7XG5cbiAgICAgIC8vIElGIHdlIGFyZSBpbiBsb2dpbiB3ZSdsbCBza2lwIHRoZSBkYXRhYmFzZSBvcGVyYXRpb24gLyBiZWZvcmVTYXZlIC8gYWZ0ZXJTYXZlIGV0Yy4uLlxuICAgICAgLy8gd2UgbmVlZCB0byBzZXQgaXQgdXAgdGhlcmUuXG4gICAgICAvLyBXZSBhcmUgc3VwcG9zZWQgdG8gaGF2ZSBhIHJlc3BvbnNlIG9ubHkgb24gTE9HSU4gd2l0aCBhdXRoRGF0YSwgc28gd2Ugc2tpcCB0aG9zZVxuICAgICAgLy8gSWYgd2UncmUgbm90IGxvZ2dpbmcgaW4sIGJ1dCBqdXN0IHVwZGF0aW5nIHRoZSBjdXJyZW50IHVzZXIsIHdlIGNhbiBzYWZlbHkgc2tpcCB0aGF0IHBhcnRcbiAgICAgIGlmIChpc0xvZ2luICYmIGhhc011dGF0ZWRBdXRoRGF0YSAmJiBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgICAvLyBBc3NpZ24gdGhlIG5ldyBhdXRoRGF0YSBpbiB0aGUgcmVzcG9uc2VcbiAgICAgICAgT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFJ1biB0aGUgREIgdXBkYXRlIGRpcmVjdGx5LCBhcyAnbWFzdGVyJ1xuICAgICAgICAvLyBKdXN0IHVwZGF0ZSB0aGUgYXV0aERhdGEgcGFydFxuICAgICAgICAvLyBUaGVuIHdlJ3JlIGdvb2QgZm9yIHRoZSB1c2VyLCBlYXJseSBleGl0IG9mIHNvcnRzXG4gICAgICAgIGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB7IG9iamVjdElkOiB0aGlzLmRhdGEub2JqZWN0SWQgfSxcbiAgICAgICAgICB7IGF1dGhEYXRhOiB0aGlzLmRhdGEuYXV0aERhdGEgfSxcbiAgICAgICAgICB7fVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gVGhlIG5vbi10aGlyZC1wYXJ0eSBwYXJ0cyBvZiBVc2VyIHRyYW5zZm9ybWF0aW9uXG5SZXN0V3JpdGUucHJvdG90eXBlLnRyYW5zZm9ybVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgJ2VtYWlsVmVyaWZpZWQnIGluIHRoaXMuZGF0YSkge1xuICAgIGNvbnN0IGVycm9yID0gYENsaWVudHMgYXJlbid0IGFsbG93ZWQgdG8gbWFudWFsbHkgdXBkYXRlIGVtYWlsIHZlcmlmaWNhdGlvbi5gO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCBlcnJvcik7XG4gIH1cblxuICAvLyBEbyBub3QgY2xlYW51cCBzZXNzaW9uIGlmIG9iamVjdElkIGlzIG5vdCBzZXRcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5vYmplY3RJZCgpKSB7XG4gICAgLy8gSWYgd2UncmUgdXBkYXRpbmcgYSBfVXNlciBvYmplY3QsIHdlIG5lZWQgdG8gY2xlYXIgb3V0IHRoZSBjYWNoZSBmb3IgdGhhdCB1c2VyLiBGaW5kIGFsbCB0aGVpclxuICAgIC8vIHNlc3Npb24gdG9rZW5zLCBhbmQgcmVtb3ZlIHRoZW0gZnJvbSB0aGUgY2FjaGUuXG4gICAgcHJvbWlzZSA9IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSwgJ19TZXNzaW9uJywge1xuICAgICAgdXNlcjoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgICAgfSxcbiAgICB9KVxuICAgICAgLmV4ZWN1dGUoKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIHJlc3VsdHMucmVzdWx0cy5mb3JFYWNoKHNlc3Npb24gPT5cbiAgICAgICAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIudXNlci5kZWwoc2Vzc2lvbi5zZXNzaW9uVG9rZW4pXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gVHJhbnNmb3JtIHRoZSBwYXNzd29yZFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIC8vIGlnbm9yZSBvbmx5IGlmIHVuZGVmaW5lZC4gc2hvdWxkIHByb2NlZWQgaWYgZW1wdHkgKCcnKVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddID0gdHJ1ZTtcbiAgICAgICAgLy8gR2VuZXJhdGUgYSBuZXcgc2Vzc2lvbiBvbmx5IGlmIHRoZSB1c2VyIHJlcXVlc3RlZFxuICAgICAgICBpZiAoIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgICAgICAgIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5KCkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5oYXNoKHRoaXMuZGF0YS5wYXNzd29yZCkudGhlbihoYXNoZWRQYXNzd29yZCA9PiB7XG4gICAgICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgPSBoYXNoZWRQYXNzd29yZDtcbiAgICAgICAgICBkZWxldGUgdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlVXNlck5hbWUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZUVtYWlsKCk7XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVVzZXJOYW1lID0gZnVuY3Rpb24gKCkge1xuICAvLyBDaGVjayBmb3IgdXNlcm5hbWUgdW5pcXVlbmVzc1xuICBpZiAoIXRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgdGhpcy5kYXRhLnVzZXJuYW1lID0gY3J5cHRvVXRpbHMucmFuZG9tU3RyaW5nKDI1KTtcbiAgICAgIHRoaXMucmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLypcbiAgICBVc2VybmFtZXMgc2hvdWxkIGJlIHVuaXF1ZSB3aGVuIGNvbXBhcmVkIGNhc2UgaW5zZW5zaXRpdmVseVxuXG4gICAgVXNlcnMgc2hvdWxkIGJlIGFibGUgdG8gbWFrZSBjYXNlIHNlbnNpdGl2ZSB1c2VybmFtZXMgYW5kXG4gICAgbG9naW4gdXNpbmcgdGhlIGNhc2UgdGhleSBlbnRlcmVkLiAgSS5lLiAnU25vb3B5JyBzaG91bGQgcHJlY2x1ZGVcbiAgICAnc25vb3B5JyBhcyBhIHZhbGlkIHVzZXJuYW1lLlxuICAqL1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICB1c2VybmFtZTogdGhpcy5kYXRhLnVzZXJuYW1lLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9KTtcbn07XG5cbi8qXG4gIEFzIHdpdGggdXNlcm5hbWVzLCBQYXJzZSBzaG91bGQgbm90IGFsbG93IGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9ucyBvZiBlbWFpbC5cbiAgdW5saWtlIHdpdGggdXNlcm5hbWVzICh3aGljaCBjYW4gaGF2ZSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgaW4gdGhlIGNhc2Ugb2ZcbiAgYXV0aCBhZGFwdGVycyksIGVtYWlscyBzaG91bGQgbmV2ZXIgaGF2ZSBhIGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9uLlxuXG4gIFRoaXMgYmVoYXZpb3IgY2FuIGJlIGVuZm9yY2VkIHRocm91Z2ggYSBwcm9wZXJseSBjb25maWd1cmVkIGluZGV4IHNlZTpcbiAgaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL2luZGV4LWNhc2UtaW5zZW5zaXRpdmUvI2NyZWF0ZS1hLWNhc2UtaW5zZW5zaXRpdmUtaW5kZXhcbiAgd2hpY2ggY291bGQgYmUgaW1wbGVtZW50ZWQgaW5zdGVhZCBvZiB0aGlzIGNvZGUgYmFzZWQgdmFsaWRhdGlvbi5cblxuICBHaXZlbiB0aGF0IHRoaXMgbG9va3VwIHNob3VsZCBiZSBhIHJlbGF0aXZlbHkgbG93IHVzZSBjYXNlIGFuZCB0aGF0IHRoZSBjYXNlIHNlbnNpdGl2ZVxuICB1bmlxdWUgaW5kZXggd2lsbCBiZSB1c2VkIGJ5IHRoZSBkYiBmb3IgdGhlIHF1ZXJ5LCB0aGlzIGlzIGFuIGFkZXF1YXRlIHNvbHV0aW9uLlxuKi9cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlRW1haWwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsIHx8IHRoaXMuZGF0YS5lbWFpbC5fX29wID09PSAnRGVsZXRlJykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBWYWxpZGF0ZSBiYXNpYyBlbWFpbCBhZGRyZXNzIGZvcm1hdFxuICBpZiAoIXRoaXMuZGF0YS5lbWFpbC5tYXRjaCgvXi4rQC4rJC8pKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUywgJ0VtYWlsIGFkZHJlc3MgZm9ybWF0IGlzIGludmFsaWQuJylcbiAgICApO1xuICB9XG4gIC8vIENhc2UgaW5zZW5zaXRpdmUgbWF0Y2gsIHNlZSBub3RlIGFib3ZlIGZ1bmN0aW9uLlxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICAhdGhpcy5kYXRhLmF1dGhEYXRhIHx8XG4gICAgICAgICFPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCB8fFxuICAgICAgICAoT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggPT09IDEgJiZcbiAgICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpWzBdID09PSAnYW5vbnltb3VzJylcbiAgICAgICkge1xuICAgICAgICAvLyBXZSB1cGRhdGVkIHRoZSBlbWFpbCwgc2VuZCBhIG5ldyB2YWxpZGF0aW9uXG4gICAgICAgIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10gPSB0cnVlO1xuICAgICAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZXRFbWFpbFZlcmlmeVRva2VuKHRoaXMuZGF0YSk7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5KSByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzKCkudGhlbigoKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5KCk7XG4gIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gY2hlY2sgaWYgdGhlIHBhc3N3b3JkIGNvbmZvcm1zIHRvIHRoZSBkZWZpbmVkIHBhc3N3b3JkIHBvbGljeSBpZiBjb25maWd1cmVkXG4gIC8vIElmIHdlIHNwZWNpZmllZCBhIGN1c3RvbSBlcnJvciBpbiBvdXIgY29uZmlndXJhdGlvbiB1c2UgaXQuXG4gIC8vIEV4YW1wbGU6IFwiUGFzc3dvcmRzIG11c3QgaW5jbHVkZSBhIENhcGl0YWwgTGV0dGVyLCBMb3dlcmNhc2UgTGV0dGVyLCBhbmQgYSBudW1iZXIuXCJcbiAgLy9cbiAgLy8gVGhpcyBpcyBlc3BlY2lhbGx5IHVzZWZ1bCBvbiB0aGUgZ2VuZXJpYyBcInBhc3N3b3JkIHJlc2V0XCIgcGFnZSxcbiAgLy8gYXMgaXQgYWxsb3dzIHRoZSBwcm9ncmFtbWVyIHRvIGNvbW11bmljYXRlIHNwZWNpZmljIHJlcXVpcmVtZW50cyBpbnN0ZWFkIG9mOlxuICAvLyBhLiBtYWtpbmcgdGhlIHVzZXIgZ3Vlc3Mgd2hhdHMgd3JvbmdcbiAgLy8gYi4gbWFraW5nIGEgY3VzdG9tIHBhc3N3b3JkIHJlc2V0IHBhZ2UgdGhhdCBzaG93cyB0aGUgcmVxdWlyZW1lbnRzXG4gIGNvbnN0IHBvbGljeUVycm9yID0gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgPyB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0aW9uRXJyb3JcbiAgICA6ICdQYXNzd29yZCBkb2VzIG5vdCBtZWV0IHRoZSBQYXNzd29yZCBQb2xpY3kgcmVxdWlyZW1lbnRzLic7XG4gIGNvbnN0IGNvbnRhaW5zVXNlcm5hbWVFcnJvciA9ICdQYXNzd29yZCBjYW5ub3QgY29udGFpbiB5b3VyIHVzZXJuYW1lLic7XG5cbiAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgbWVldHMgdGhlIHBhc3N3b3JkIHN0cmVuZ3RoIHJlcXVpcmVtZW50c1xuICBpZiAoXG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IgJiZcbiAgICAgICF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yKHRoaXMuZGF0YS5wYXNzd29yZCkpIHx8XG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sodGhpcy5kYXRhLnBhc3N3b3JkKSlcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBwb2xpY3lFcnJvcikpO1xuICB9XG5cbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBjb250YWluIHVzZXJuYW1lXG4gIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgPT09IHRydWUpIHtcbiAgICBpZiAodGhpcy5kYXRhLnVzZXJuYW1lKSB7XG4gICAgICAvLyB1c2VybmFtZSBpcyBub3QgcGFzc2VkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHRoaXMuZGF0YS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBjb250YWluc1VzZXJuYW1lRXJyb3IpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcmV0cmlldmUgdGhlIFVzZXIgb2JqZWN0IHVzaW5nIG9iamVjdElkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZihyZXN1bHRzWzBdLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBjb250YWluc1VzZXJuYW1lRXJyb3IpXG4gICAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5ID0gZnVuY3Rpb24gKCkge1xuICAvLyBjaGVjayB3aGV0aGVyIHBhc3N3b3JkIGlzIHJlcGVhdGluZyBmcm9tIHNwZWNpZmllZCBoaXN0b3J5XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmZpbmQoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICB7IGtleXM6IFsnX3Bhc3N3b3JkX2hpc3RvcnknLCAnX2hhc2hlZF9wYXNzd29yZCddIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgbGV0IG9sZFBhc3N3b3JkcyA9IFtdO1xuICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSlcbiAgICAgICAgICBvbGRQYXNzd29yZHMgPSBfLnRha2UoXG4gICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IC0gMVxuICAgICAgICAgICk7XG4gICAgICAgIG9sZFBhc3N3b3Jkcy5wdXNoKHVzZXIucGFzc3dvcmQpO1xuICAgICAgICBjb25zdCBuZXdQYXNzd29yZCA9IHRoaXMuZGF0YS5wYXNzd29yZDtcbiAgICAgICAgLy8gY29tcGFyZSB0aGUgbmV3IHBhc3N3b3JkIGhhc2ggd2l0aCBhbGwgb2xkIHBhc3N3b3JkIGhhc2hlc1xuICAgICAgICBjb25zdCBwcm9taXNlcyA9IG9sZFBhc3N3b3Jkcy5tYXAoZnVuY3Rpb24gKGhhc2gpIHtcbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShuZXdQYXNzd29yZCwgaGFzaCkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdClcbiAgICAgICAgICAgICAgLy8gcmVqZWN0IGlmIHRoZXJlIGlzIGEgbWF0Y2hcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KCdSRVBFQVRfUEFTU1dPUkQnKTtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIHdhaXQgZm9yIGFsbCBjb21wYXJpc29ucyB0byBjb21wbGV0ZVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyID09PSAnUkVQRUFUX1BBU1NXT1JEJylcbiAgICAgICAgICAgICAgLy8gYSBtYXRjaCB3YXMgZm91bmRcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgICAgICAgICBgTmV3IHBhc3N3b3JkIHNob3VsZCBub3QgYmUgdGhlIHNhbWUgYXMgbGFzdCAke3RoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeX0gcGFzc3dvcmRzLmBcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgc2Vzc2lvbiBmb3IgdXBkYXRpbmcgdXNlciAodGhpcy5xdWVyeSBpcyBzZXQpIHVubGVzcyBhdXRoRGF0YSBleGlzdHNcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBuZXcgc2Vzc2lvblRva2VuIGlmIGxpbmtpbmcgdmlhIHNlc3Npb25Ub2tlblxuICBpZiAodGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChcbiAgICAhdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSAmJiAvLyBzaWdudXAgY2FsbCwgd2l0aFxuICAgIHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiYgLy8gbm8gbG9naW4gd2l0aG91dCB2ZXJpZmljYXRpb25cbiAgICB0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzXG4gICkge1xuICAgIC8vIHZlcmlmaWNhdGlvbiBpcyBvblxuICAgIHJldHVybjsgLy8gZG8gbm90IGNyZWF0ZSB0aGUgc2Vzc2lvbiB0b2tlbiBpbiB0aGF0IGNhc2UhXG4gIH1cbiAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy8gY2xvdWQgaW5zdGFsbGF0aW9uSWQgZnJvbSBDbG91ZCBDb2RlLFxuICAvLyBuZXZlciBjcmVhdGUgc2Vzc2lvbiB0b2tlbnMgZnJvbSB0aGVyZS5cbiAgaWYgKHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCAmJiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQgPT09ICdjbG91ZCcpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBBdXRoLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICB1c2VySWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgYWN0aW9uOiB0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddID8gJ2xvZ2luJyA6ICdzaWdudXAnLFxuICAgICAgYXV0aFByb3ZpZGVyOiB0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddIHx8ICdwYXNzd29yZCcsXG4gICAgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkLFxuICB9KTtcblxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG4gIH1cblxuICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpO1xufTtcblxuLy8gRGVsZXRlIGVtYWlsIHJlc2V0IHRva2VucyBpZiB1c2VyIGlzIGNoYW5naW5nIHBhc3N3b3JkIG9yIGVtYWlsLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5kZWxldGVFbWFpbFJlc2V0VG9rZW5JZk5lZWRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8IHRoaXMucXVlcnkgPT09IG51bGwpIHtcbiAgICAvLyBudWxsIHF1ZXJ5IG1lYW5zIGNyZWF0ZVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICgncGFzc3dvcmQnIGluIHRoaXMuZGF0YSB8fCAnZW1haWwnIGluIHRoaXMuZGF0YSkge1xuICAgIGNvbnN0IGFkZE9wcyA9IHtcbiAgICAgIF9wZXJpc2hhYmxlX3Rva2VuOiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgICBfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0OiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgfTtcbiAgICB0aGlzLmRhdGEgPSBPYmplY3QuYXNzaWduKHRoaXMuZGF0YSwgYWRkT3BzKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zID0gZnVuY3Rpb24gKCkge1xuICAvLyBPbmx5IGZvciBfU2Vzc2lvbiwgYW5kIGF0IGNyZWF0aW9uIHRpbWVcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9ICdfU2Vzc2lvbicgfHwgdGhpcy5xdWVyeSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEZXN0cm95IHRoZSBzZXNzaW9ucyBpbiAnQmFja2dyb3VuZCdcbiAgY29uc3QgeyB1c2VyLCBpbnN0YWxsYXRpb25JZCwgc2Vzc2lvblRva2VuIH0gPSB0aGlzLmRhdGE7XG4gIGlmICghdXNlciB8fCAhaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF1c2VyLm9iamVjdElkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koXG4gICAgJ19TZXNzaW9uJyxcbiAgICB7XG4gICAgICB1c2VyLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICBzZXNzaW9uVG9rZW46IHsgJG5lOiBzZXNzaW9uVG9rZW4gfSxcbiAgICB9LFxuICAgIHt9LFxuICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICk7XG59O1xuXG4vLyBIYW5kbGVzIGFueSBmb2xsb3d1cCBsb2dpY1xuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVGb2xsb3d1cCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXSAmJiB0aGlzLmNvbmZpZy5yZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0KSB7XG4gICAgdmFyIHNlc3Npb25RdWVyeSA9IHtcbiAgICAgIHVzZXI6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ107XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZGVzdHJveSgnX1Nlc3Npb24nLCBzZXNzaW9uUXVlcnkpXG4gICAgICAudGhlbih0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcykpO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddKSB7XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ107XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCkudGhlbih0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcykpO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddKSB7XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ107XG4gICAgLy8gRmlyZSBhbmQgZm9yZ2V0IVxuICAgIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCh0aGlzLmRhdGEpO1xuICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcyk7XG4gIH1cbn07XG5cbi8vIEhhbmRsZXMgdGhlIF9TZXNzaW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gX1Nlc3Npb24gb2JqZWN0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVTZXNzaW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLmNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLnVzZXIgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdTZXNzaW9uIHRva2VuIHJlcXVpcmVkLicpO1xuICB9XG5cbiAgLy8gVE9ETzogVmVyaWZ5IHByb3BlciBlcnJvciB0byB0aHJvd1xuICBpZiAodGhpcy5kYXRhLkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnQ2Fubm90IHNldCAnICsgJ0FDTCBvbiBhIFNlc3Npb24uJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmIHRoaXMuZGF0YS51c2VyLm9iamVjdElkICE9IHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9XG4gIH1cblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGNvbnN0IGFkZGl0aW9uYWxTZXNzaW9uRGF0YSA9IHt9O1xuICAgIGZvciAodmFyIGtleSBpbiB0aGlzLmRhdGEpIHtcbiAgICAgIGlmIChrZXkgPT09ICdvYmplY3RJZCcgfHwga2V5ID09PSAndXNlcicpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBhZGRpdGlvbmFsU2Vzc2lvbkRhdGFba2V5XSA9IHRoaXMuZGF0YVtrZXldO1xuICAgIH1cblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IEF1dGguY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZScsXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNyZWF0ZVNlc3Npb24oKS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKCFyZXN1bHRzLnJlc3BvbnNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdFcnJvciBjcmVhdGluZyBzZXNzaW9uLicpO1xuICAgICAgfVxuICAgICAgc2Vzc2lvbkRhdGFbJ29iamVjdElkJ10gPSByZXN1bHRzLnJlc3BvbnNlWydvYmplY3RJZCddO1xuICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgIGxvY2F0aW9uOiByZXN1bHRzLmxvY2F0aW9uLFxuICAgICAgICByZXNwb25zZTogc2Vzc2lvbkRhdGEsXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfSW5zdGFsbGF0aW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gaW5zdGFsbGF0aW9uIG9iamVjdC5cbi8vIElmIGFuIGluc3RhbGxhdGlvbiBpcyBmb3VuZCwgdGhpcyBjYW4gbXV0YXRlIHRoaXMucXVlcnkgYW5kIHR1cm4gYSBjcmVhdGVcbi8vIGludG8gYW4gdXBkYXRlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVJbnN0YWxsYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX0luc3RhbGxhdGlvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoXG4gICAgIXRoaXMucXVlcnkgJiZcbiAgICAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICF0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWRcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgMTM1LFxuICAgICAgJ2F0IGxlYXN0IG9uZSBJRCBmaWVsZCAoZGV2aWNlVG9rZW4sIGluc3RhbGxhdGlvbklkKSAnICsgJ211c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJ1xuICAgICk7XG4gIH1cblxuICAvLyBJZiB0aGUgZGV2aWNlIHRva2VuIGlzIDY0IGNoYXJhY3RlcnMgbG9uZywgd2UgYXNzdW1lIGl0IGlzIGZvciBpT1NcbiAgLy8gYW5kIGxvd2VyY2FzZSBpdC5cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4ubGVuZ3RoID09IDY0KSB7XG4gICAgdGhpcy5kYXRhLmRldmljZVRva2VuID0gdGhpcy5kYXRhLmRldmljZVRva2VuLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBXZSBsb3dlcmNhc2UgdGhlIGluc3RhbGxhdGlvbklkIGlmIHByZXNlbnRcbiAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgbGV0IGluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkO1xuXG4gIC8vIElmIGRhdGEuaW5zdGFsbGF0aW9uSWQgaXMgbm90IHNldCBhbmQgd2UncmUgbm90IG1hc3Rlciwgd2UgY2FuIGxvb2t1cCBpbiBhdXRoXG4gIGlmICghaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGluc3RhbGxhdGlvbklkID0gdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gVXBkYXRpbmcgX0luc3RhbGxhdGlvbiBidXQgbm90IHVwZGF0aW5nIGFueXRoaW5nIGNyaXRpY2FsXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgdmFyIGlkTWF0Y2g7IC8vIFdpbGwgYmUgYSBtYXRjaCBvbiBlaXRoZXIgb2JqZWN0SWQgb3IgaW5zdGFsbGF0aW9uSWRcbiAgdmFyIG9iamVjdElkTWF0Y2g7XG4gIHZhciBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICB2YXIgZGV2aWNlVG9rZW5NYXRjaGVzID0gW107XG5cbiAgLy8gSW5zdGVhZCBvZiBpc3N1aW5nIDMgcmVhZHMsIGxldCdzIGRvIGl0IHdpdGggb25lIE9SLlxuICBjb25zdCBvclF1ZXJpZXMgPSBbXTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIG9iamVjdElkOiB0aGlzLnF1ZXJ5Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcbiAgfVxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goeyBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuIH0pO1xuICB9XG5cbiAgaWYgKG9yUXVlcmllcy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByb21pc2UgPSBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfSW5zdGFsbGF0aW9uJyxcbiAgICAgICAge1xuICAgICAgICAgICRvcjogb3JRdWVyaWVzLFxuICAgICAgICB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgcmVzdWx0Lm9iamVjdElkID09IHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBvYmplY3RJZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuaW5zdGFsbGF0aW9uSWQgPT0gaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuZGV2aWNlVG9rZW4gPT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNhbml0eSBjaGVja3Mgd2hlbiBydW5uaW5nIGEgcXVlcnlcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKCFvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kIGZvciB1cGRhdGUuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgIT09IG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2luc3RhbGxhdGlvbklkIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgIW9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2RldmljZVRva2VuIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUeXBlXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUeXBlIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiBvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBvYmplY3RJZE1hdGNoO1xuICAgICAgfVxuXG4gICAgICBpZiAoaW5zdGFsbGF0aW9uSWQgJiYgaW5zdGFsbGF0aW9uSWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIG5lZWQgdG8gc3BlY2lmeSBkZXZpY2VUeXBlIG9ubHkgaWYgaXQncyBuZXdcbiAgICAgIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUgJiYgIWlkTWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNSwgJ2RldmljZVR5cGUgbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICghaWRNYXRjaCkge1xuICAgICAgICBpZiAoIWRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmXG4gICAgICAgICAgKCFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10gfHwgIWluc3RhbGxhdGlvbklkKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBTaW5nbGUgbWF0Y2ggb24gZGV2aWNlIHRva2VuIGJ1dCBub25lIG9uIGluc3RhbGxhdGlvbklkLCBhbmQgZWl0aGVyXG4gICAgICAgICAgLy8gdGhlIHBhc3NlZCBvYmplY3Qgb3IgdGhlIG1hdGNoIGlzIG1pc3NpbmcgYW4gaW5zdGFsbGF0aW9uSWQsIHNvIHdlXG4gICAgICAgICAgLy8gY2FuIGp1c3QgcmV0dXJuIHRoZSBtYXRjaC5cbiAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzIsXG4gICAgICAgICAgICAnTXVzdCBzcGVjaWZ5IGluc3RhbGxhdGlvbklkIHdoZW4gZGV2aWNlVG9rZW4gJyArXG4gICAgICAgICAgICAgICdtYXRjaGVzIG11bHRpcGxlIEluc3RhbGxhdGlvbiBvYmplY3RzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTXVsdGlwbGUgZGV2aWNlIHRva2VuIG1hdGNoZXMgYW5kIHdlIHNwZWNpZmllZCBhbiBpbnN0YWxsYXRpb24gSUQsXG4gICAgICAgICAgLy8gb3IgYSBzaW5nbGUgbWF0Y2ggd2hlcmUgYm90aCB0aGUgcGFzc2VkIGFuZCBtYXRjaGluZyBvYmplY3RzIGhhdmVcbiAgICAgICAgICAvLyBhbiBpbnN0YWxsYXRpb24gSUQuIFRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaFxuICAgICAgICAgIC8vIHRoZSBkZXZpY2VUb2tlbiwgYW5kIHJldHVybiBuaWwgdG8gc2lnbmFsIHRoYXQgYSBuZXcgb2JqZWN0IHNob3VsZFxuICAgICAgICAgIC8vIGJlIGNyZWF0ZWQuXG4gICAgICAgICAgdmFyIGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiB7XG4gICAgICAgICAgICAgICRuZTogaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJiAhZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydpbnN0YWxsYXRpb25JZCddKSB7XG4gICAgICAgICAgLy8gRXhhY3RseSBvbmUgZGV2aWNlIHRva2VuIG1hdGNoIGFuZCBpdCBkb2Vzbid0IGhhdmUgYW4gaW5zdGFsbGF0aW9uXG4gICAgICAgICAgLy8gSUQuIFRoaXMgaXMgdGhlIG9uZSBjYXNlIHdoZXJlIHdlIHdhbnQgdG8gbWVyZ2Ugd2l0aCB0aGUgZXhpc3RpbmdcbiAgICAgICAgICAvLyBvYmplY3QuXG4gICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7IG9iamVjdElkOiBpZE1hdGNoLm9iamVjdElkIH07XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgICAuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgaWRNYXRjaC5kZXZpY2VUb2tlbiAhPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIHNldHRpbmcgdGhlIGRldmljZSB0b2tlbiBvbiBhbiBleGlzdGluZyBpbnN0YWxsYXRpb24sIHNvXG4gICAgICAgICAgICAvLyB3ZSBzaG91bGQgdHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoIHRoaXNcbiAgICAgICAgICAgIC8vIGRldmljZSB0b2tlbi5cbiAgICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIC8vIFdlIGhhdmUgYSB1bmlxdWUgaW5zdGFsbCBJZCwgdXNlIHRoYXQgdG8gcHJlc2VydmVcbiAgICAgICAgICAgIC8vIHRoZSBpbnRlcmVzdGluZyBpbnN0YWxsYXRpb25cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2luc3RhbGxhdGlvbklkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkID09IHRoaXMuZGF0YS5vYmplY3RJZFxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIHdlIHBhc3NlZCBhbiBvYmplY3RJZCwgcHJlc2VydmUgdGhhdCBpbnN0YWxhdGlvblxuICAgICAgICAgICAgICBkZWxRdWVyeVsnb2JqZWN0SWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IGlkTWF0Y2gub2JqZWN0SWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBXaGF0IHRvIGRvIGhlcmU/IGNhbid0IHJlYWxseSBjbGVhbiB1cCBldmVyeXRoaW5nLi4uXG4gICAgICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEluIG5vbi1tZXJnZSBzY2VuYXJpb3MsIGp1c3QgcmV0dXJuIHRoZSBpbnN0YWxsYXRpb24gbWF0Y2ggaWRcbiAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4ob2JqSWQgPT4ge1xuICAgICAgaWYgKG9iaklkKSB7XG4gICAgICAgIHRoaXMucXVlcnkgPSB7IG9iamVjdElkOiBvYmpJZCB9O1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcbiAgICAgIH1cbiAgICAgIC8vIFRPRE86IFZhbGlkYXRlIG9wcyAoYWRkL3JlbW92ZSBvbiBjaGFubmVscywgJGluYyBvbiBiYWRnZSwgZXRjLilcbiAgICB9KTtcbiAgcmV0dXJuIHByb21pc2U7XG59O1xuXG4vLyBJZiB3ZSBzaG9ydC1jaXJjdXRlZCB0aGUgb2JqZWN0IHJlc3BvbnNlIC0gdGhlbiB3ZSBuZWVkIHRvIG1ha2Ugc3VyZSB3ZSBleHBhbmQgYWxsIHRoZSBmaWxlcyxcbi8vIHNpbmNlIHRoaXMgbWlnaHQgbm90IGhhdmUgYSBxdWVyeSwgbWVhbmluZyBpdCB3b24ndCByZXR1cm4gdGhlIGZ1bGwgcmVzdWx0IGJhY2suXG4vLyBUT0RPOiAobmx1dHNlbmtvKSBUaGlzIHNob3VsZCBkaWUgd2hlbiB3ZSBtb3ZlIHRvIHBlci1jbGFzcyBiYXNlZCBjb250cm9sbGVycyBvbiBfU2Vzc2lvbi9fVXNlclxuUmVzdFdyaXRlLnByb3RvdHlwZS5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gQ2hlY2sgd2hldGhlciB3ZSBoYXZlIGEgc2hvcnQtY2lyY3VpdGVkIHJlc3BvbnNlIC0gb25seSB0aGVuIHJ1biBleHBhbnNpb24uXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgdGhpcy5yZXNwb25zZS5yZXNwb25zZSk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuRGF0YWJhc2VPcGVyYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1JvbGUnKSB7XG4gICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnJvbGUuY2xlYXIoKTtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiB0aGlzLnF1ZXJ5ICYmIHRoaXMuYXV0aC5pc1VuYXV0aGVudGljYXRlZCgpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuU0VTU0lPTl9NSVNTSU5HLFxuICAgICAgYENhbm5vdCBtb2RpZnkgdXNlciAke3RoaXMucXVlcnkub2JqZWN0SWR9LmBcbiAgICApO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1Byb2R1Y3QnICYmIHRoaXMuZGF0YS5kb3dubG9hZCkge1xuICAgIHRoaXMuZGF0YS5kb3dubG9hZE5hbWUgPSB0aGlzLmRhdGEuZG93bmxvYWQubmFtZTtcbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBiZXR0ZXIgZGV0ZWN0aW9uIGZvciBBQ0wsIGVuc3VyaW5nIGEgdXNlciBjYW4ndCBiZSBsb2NrZWQgZnJvbVxuICAvLyAgICAgICB0aGVpciBvd24gdXNlciByZWNvcmQuXG4gIGlmICh0aGlzLmRhdGEuQUNMICYmIHRoaXMuZGF0YS5BQ0xbJyp1bnJlc29sdmVkJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9BQ0wsICdJbnZhbGlkIEFDTC4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgLy8gRm9yY2UgdGhlIHVzZXIgdG8gbm90IGxvY2tvdXRcbiAgICAvLyBNYXRjaGVkIHdpdGggcGFyc2UuY29tXG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmIHRoaXMuZGF0YS5BQ0wgJiYgdGhpcy5hdXRoLmlzTWFzdGVyICE9PSB0cnVlKSB7XG4gICAgICB0aGlzLmRhdGEuQUNMW3RoaXMucXVlcnkub2JqZWN0SWRdID0geyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9O1xuICAgIH1cbiAgICAvLyB1cGRhdGUgcGFzc3dvcmQgdGltZXN0YW1wIGlmIHVzZXIgcGFzc3dvcmQgaXMgYmVpbmcgY2hhbmdlZFxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgKSB7XG4gICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgIH1cbiAgICAvLyBJZ25vcmUgY3JlYXRlZEF0IHdoZW4gdXBkYXRlXG4gICAgZGVsZXRlIHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG5cbiAgICBsZXQgZGVmZXIgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAvLyBpZiBwYXNzd29yZCBoaXN0b3J5IGlzIGVuYWJsZWQgdGhlbiBzYXZlIHRoZSBjdXJyZW50IHBhc3N3b3JkIHRvIGhpc3RvcnlcbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICApIHtcbiAgICAgIGRlZmVyID0gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLmZpbmQoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgICB7IGtleXM6IFsnX3Bhc3N3b3JkX2hpc3RvcnknLCAnX2hhc2hlZF9wYXNzd29yZCddIH1cbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgICAgaWYgKHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnkpIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvL24tMSBwYXNzd29yZHMgZ28gaW50byBoaXN0b3J5IGluY2x1ZGluZyBsYXN0IHBhc3N3b3JkXG4gICAgICAgICAgd2hpbGUgKFxuICAgICAgICAgICAgb2xkUGFzc3dvcmRzLmxlbmd0aCA+IE1hdGgubWF4KDAsIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDIpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMuc2hpZnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9oaXN0b3J5ID0gb2xkUGFzc3dvcmRzO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVmZXIudGhlbigoKSA9PiB7XG4gICAgICAvLyBSdW4gYW4gdXBkYXRlXG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgcmVzcG9uc2UudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlID0geyByZXNwb25zZSB9O1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBTZXQgdGhlIGRlZmF1bHQgQUNMIGFuZCBwYXNzd29yZCB0aW1lc3RhbXAgZm9yIHRoZSBuZXcgX1VzZXJcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIHZhciBBQ0wgPSB0aGlzLmRhdGEuQUNMO1xuICAgICAgLy8gZGVmYXVsdCBwdWJsaWMgci93IEFDTFxuICAgICAgaWYgKCFBQ0wpIHtcbiAgICAgICAgQUNMID0ge307XG4gICAgICAgIEFDTFsnKiddID0geyByZWFkOiB0cnVlLCB3cml0ZTogZmFsc2UgfTtcbiAgICAgIH1cbiAgICAgIC8vIG1ha2Ugc3VyZSB0aGUgdXNlciBpcyBub3QgbG9ja2VkIGRvd25cbiAgICAgIEFDTFt0aGlzLmRhdGEub2JqZWN0SWRdID0geyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9O1xuICAgICAgdGhpcy5kYXRhLkFDTCA9IEFDTDtcbiAgICAgIC8vIHBhc3N3b3JkIHRpbWVzdGFtcCB0byBiZSB1c2VkIHdoZW4gcGFzc3dvcmQgZXhwaXJ5IHBvbGljeSBpcyBlbmZvcmNlZFxuICAgICAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlKSB7XG4gICAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUnVuIGEgY3JlYXRlXG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuY3JlYXRlKHRoaXMuY2xhc3NOYW1lLCB0aGlzLmRhdGEsIHRoaXMucnVuT3B0aW9ucywgZmFsc2UsIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8IGVycm9yLmNvZGUgIT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUXVpY2sgY2hlY2ssIGlmIHdlIHdlcmUgYWJsZSB0byBpbmZlciB0aGUgZHVwbGljYXRlZCBmaWVsZCBuYW1lXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci51c2VySW5mbyAmJiBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAndXNlcm5hbWUnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci51c2VySW5mbyAmJiBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAnZW1haWwnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhpcyB3YXMgYSBmYWlsZWQgdXNlciBjcmVhdGlvbiBkdWUgdG8gdXNlcm5hbWUgb3IgZW1haWwgYWxyZWFkeSB0YWtlbiwgd2UgbmVlZCB0b1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIGl0IHdhcyB1c2VybmFtZSBvciBlbWFpbCBhbmQgcmV0dXJuIHRoZSBhcHByb3ByaWF0ZSBlcnJvci5cbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gdGhlIG9yaWdpbmFsIG1ldGhvZFxuICAgICAgICAvLyBUT0RPOiBTZWUgaWYgd2UgY2FuIGxhdGVyIGRvIHRoaXMgd2l0aG91dCBhZGRpdGlvbmFsIHF1ZXJpZXMgYnkgdXNpbmcgbmFtZWQgaW5kZXhlcy5cbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgLmZpbmQoXG4gICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICApXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICAgIHsgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCwgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSB9LFxuICAgICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIHJlc3BvbnNlLm9iamVjdElkID0gdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICByZXNwb25zZS5jcmVhdGVkQXQgPSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuXG4gICAgICAgIGlmICh0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lKSB7XG4gICAgICAgICAgcmVzcG9uc2UudXNlcm5hbWUgPSB0aGlzLmRhdGEudXNlcm5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgICBzdGF0dXM6IDIwMSxcbiAgICAgICAgICByZXNwb25zZSxcbiAgICAgICAgICBsb2NhdGlvbjogdGhpcy5sb2NhdGlvbigpLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gIH1cbn07XG5cbi8vIFJldHVybnMgbm90aGluZyAtIGRvZXNuJ3Qgd2FpdCBmb3IgdGhlIHRyaWdnZXIuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkFmdGVyU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5yZXNwb25zZSB8fCAhdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2FmdGVyU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgY29uc3QgaGFzQWZ0ZXJTYXZlSG9vayA9IHRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgKTtcbiAgY29uc3QgaGFzTGl2ZVF1ZXJ5ID0gdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5oYXNMaXZlUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBpZiAoIWhhc0FmdGVyU2F2ZUhvb2sgJiYgIWhhc0xpdmVRdWVyeSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIHZhciBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUgfTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIGV4dHJhRGF0YS5vYmplY3RJZCA9IHRoaXMucXVlcnkub2JqZWN0SWQ7XG4gIH1cblxuICAvLyBCdWlsZCB0aGUgb3JpZ2luYWwgb2JqZWN0LCB3ZSBvbmx5IGRvIHRoaXMgZm9yIGEgdXBkYXRlIHdyaXRlLlxuICBsZXQgb3JpZ2luYWxPYmplY3Q7XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvcmlnaW5hbE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIH1cblxuICAvLyBCdWlsZCB0aGUgaW5mbGF0ZWQgb2JqZWN0LCBkaWZmZXJlbnQgZnJvbSBiZWZvcmVTYXZlLCBvcmlnaW5hbERhdGEgaXMgbm90IGVtcHR5XG4gIC8vIHNpbmNlIGRldmVsb3BlcnMgY2FuIGNoYW5nZSBkYXRhIGluIHRoZSBiZWZvcmVTYXZlLlxuICBjb25zdCB1cGRhdGVkT2JqZWN0ID0gdGhpcy5idWlsZFVwZGF0ZWRPYmplY3QoZXh0cmFEYXRhKTtcbiAgdXBkYXRlZE9iamVjdC5faGFuZGxlU2F2ZVJlc3BvbnNlKHRoaXMucmVzcG9uc2UucmVzcG9uc2UsIHRoaXMucmVzcG9uc2Uuc3RhdHVzIHx8IDIwMCk7XG5cbiAgdGhpcy5jb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgLy8gTm90aWZpeSBMaXZlUXVlcnlTZXJ2ZXIgaWYgcG9zc2libGVcbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYUNvbnRyb2xsZXIuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKHVwZGF0ZWRPYmplY3QuY2xhc3NOYW1lKTtcbiAgICB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLm9uQWZ0ZXJTYXZlKFxuICAgICAgdXBkYXRlZE9iamVjdC5jbGFzc05hbWUsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICBwZXJtc1xuICAgICk7XG4gIH0pO1xuXG4gIC8vIFJ1biBhZnRlclNhdmUgdHJpZ2dlclxuICByZXR1cm4gdHJpZ2dlcnNcbiAgICAubWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICB0aGlzLmNvbnRleHRcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgIGlmIChyZXN1bHQgJiYgdHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZSA9IHJlc3VsdDtcbiAgICAgIH1cbiAgICB9KVxuICAgIC5jYXRjaChmdW5jdGlvbiAoZXJyKSB7XG4gICAgICBsb2dnZXIud2FybignYWZ0ZXJTYXZlIGNhdWdodCBhbiBlcnJvcicsIGVycik7XG4gICAgfSk7XG59O1xuXG4vLyBBIGhlbHBlciB0byBmaWd1cmUgb3V0IHdoYXQgbG9jYXRpb24gdGhpcyBvcGVyYXRpb24gaGFwcGVucyBhdC5cblJlc3RXcml0ZS5wcm90b3R5cGUubG9jYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBtaWRkbGUgPSB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyA/ICcvdXNlcnMvJyA6ICcvY2xhc3Nlcy8nICsgdGhpcy5jbGFzc05hbWUgKyAnLyc7XG4gIGNvbnN0IG1vdW50ID0gdGhpcy5jb25maWcubW91bnQgfHwgdGhpcy5jb25maWcuc2VydmVyVVJMO1xuICByZXR1cm4gbW91bnQgKyBtaWRkbGUgKyB0aGlzLmRhdGEub2JqZWN0SWQ7XG59O1xuXG4vLyBBIGhlbHBlciB0byBnZXQgdGhlIG9iamVjdCBpZCBmb3IgdGhpcyBvcGVyYXRpb24uXG4vLyBCZWNhdXNlIGl0IGNvdWxkIGJlIGVpdGhlciBvbiB0aGUgcXVlcnkgb3Igb24gdGhlIGRhdGFcblJlc3RXcml0ZS5wcm90b3R5cGUub2JqZWN0SWQgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLmRhdGEub2JqZWN0SWQgfHwgdGhpcy5xdWVyeS5vYmplY3RJZDtcbn07XG5cbi8vIFJldHVybnMgYSBjb3B5IG9mIHRoZSBkYXRhIGFuZCBkZWxldGUgYmFkIGtleXMgKF9hdXRoX2RhdGEsIF9oYXNoZWRfcGFzc3dvcmQuLi4pXG5SZXN0V3JpdGUucHJvdG90eXBlLnNhbml0aXplZERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IGRhdGEgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZSgoZGF0YSwga2V5KSA9PiB7XG4gICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgIGlmICghL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcbiAgcmV0dXJuIFBhcnNlLl9kZWNvZGUodW5kZWZpbmVkLCBkYXRhKTtcbn07XG5cbi8vIFJldHVybnMgYW4gdXBkYXRlZCBjb3B5IG9mIHRoZSBvYmplY3RcblJlc3RXcml0ZS5wcm90b3R5cGUuYnVpbGRVcGRhdGVkT2JqZWN0ID0gZnVuY3Rpb24gKGV4dHJhRGF0YSkge1xuICBjb25zdCB1cGRhdGVkT2JqZWN0ID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHRoaXMub3JpZ2luYWxEYXRhKTtcbiAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5yZWR1Y2UoZnVuY3Rpb24gKGRhdGEsIGtleSkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgaWYgKHR5cGVvZiBkYXRhW2tleV0uX19vcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQoa2V5LCBkYXRhW2tleV0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gc3ViZG9jdW1lbnQga2V5IHdpdGggZG90IG5vdGF0aW9uIHsgJ3gueSc6IHYgfSA9PiB7ICd4JzogeyAneScgOiB2IH0gfSlcbiAgICAgICAgY29uc3Qgc3BsaXR0ZWRLZXkgPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgcGFyZW50UHJvcCA9IHNwbGl0dGVkS2V5WzBdO1xuICAgICAgICBsZXQgcGFyZW50VmFsID0gdXBkYXRlZE9iamVjdC5nZXQocGFyZW50UHJvcCk7XG4gICAgICAgIGlmICh0eXBlb2YgcGFyZW50VmFsICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhcmVudFZhbCA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIHBhcmVudFZhbFtzcGxpdHRlZEtleVsxXV0gPSBkYXRhW2tleV07XG4gICAgICAgIHVwZGF0ZWRPYmplY3Quc2V0KHBhcmVudFByb3AsIHBhcmVudFZhbCk7XG4gICAgICB9XG4gICAgICBkZWxldGUgZGF0YVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfSwgZGVlcGNvcHkodGhpcy5kYXRhKSk7XG5cbiAgdXBkYXRlZE9iamVjdC5zZXQodGhpcy5zYW5pdGl6ZWREYXRhKCkpO1xuICByZXR1cm4gdXBkYXRlZE9iamVjdDtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY2xlYW5Vc2VyQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgJiYgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjb25zdCB1c2VyID0gdGhpcy5yZXNwb25zZS5yZXNwb25zZTtcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhID0gZnVuY3Rpb24gKHJlc3BvbnNlLCBkYXRhKSB7XG4gIGlmIChfLmlzRW1wdHkodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIpKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IGNsaWVudFN1cHBvcnRzRGVsZXRlID0gQ2xpZW50U0RLLnN1cHBvcnRzRm9yd2FyZERlbGV0ZSh0aGlzLmNsaWVudFNESyk7XG4gIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBjb25zdCBkYXRhVmFsdWUgPSBkYXRhW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgZmllbGROYW1lKSkge1xuICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICB9XG5cbiAgICAvLyBTdHJpcHMgb3BlcmF0aW9ucyBmcm9tIHJlc3BvbnNlc1xuICAgIGlmIChyZXNwb25zZVtmaWVsZE5hbWVdICYmIHJlc3BvbnNlW2ZpZWxkTmFtZV0uX19vcCkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoY2xpZW50U3VwcG9ydHNEZWxldGUgJiYgZGF0YVZhbHVlLl9fb3AgPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBSZXN0V3JpdGU7XG5tb2R1bGUuZXhwb3J0cyA9IFJlc3RXcml0ZTtcbiJdfQ==