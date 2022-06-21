"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _RestQuery = _interopRequireDefault(require("./RestQuery"));

var _lodash = _interopRequireDefault(require("lodash"));

var _logger = _interopRequireDefault(require("./logger"));

var _SchemaController = require("./Controllers/SchemaController");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".
var SchemaController = require('./Controllers/SchemaController');

var deepcopy = require('deepcopy');

const Auth = require('./Auth');

const Utils = require('./Utils');

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
  }

  if (this.config.requestKeywordDenylist) {
    // Scan request data for denied keywords
    for (const keyword of this.config.requestKeywordDenylist) {
      const match = Utils.objectContainsKeyValue(data, keyword.key, keyword.value);

      if (match) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Prohibited keyword in request data: ${JSON.stringify(keyword)}.`);
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
  this.pendingOps = {};
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
  }

  const {
    originalObject,
    updatedObject
  } = this.buildParseObjects();
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(updatedObject._getStateIdentifier());
  this.pendingOps = _objectSpread({}, pending);
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
  if (this.className !== '_User' || !this.data.authData) {
    return;
  }

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

    this.storage.authProvider = Object.keys(authData).join(',');
    const {
      hasMutatedAuthData,
      mutatedAuthData
    } = Auth.hasMutatedAuthData(authData, userResult.authData);
    const isCurrentUserLoggedOrMaster = this.auth && this.auth.user && this.auth.user.id === userResult.objectId || this.auth.isMaster;
    const isLogin = !userId;

    if (isLogin || isCurrentUserLoggedOrMaster) {
      // no user making the call
      // OR the user making the call is the right one
      // Login with auth data
      delete results[0].password; // need to set the objectId first otherwise location has trailing undefined

      this.data.objectId = userResult.objectId;

      if (!this.query || !this.query.objectId) {
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
      } // Prevent validating if no mutated data detected on update


      if (!hasMutatedAuthData && isCurrentUserLoggedOrMaster) {
        return;
      } // Force to validate all provided authData on login
      // on update only validate mutated ones


      if (hasMutatedAuthData || !this.config.allowExpiredAuthDataToken) {
        const res = await Auth.handleAuthDataValidation(isLogin ? authData : mutatedAuthData, this, userResult);
        this.data.authData = res.authData;
        this.authDataResponse = res.authDataResponse;
      } // IF we are in login we'll skip the database operation / beforeSave / afterSave etc...
      // we need to set it up there.
      // We are supposed to have a response only on LOGIN with authData, so we skip those
      // If we're not logging in, but just updating the current user, we can safely skip that part


      if (this.response) {
        // Assign the new authData in the response
        Object.keys(mutatedAuthData).forEach(provider => {
          this.response.response.authData[provider] = mutatedAuthData[provider];
        }); // Run the DB update directly, as 'master' only if authData contains some keys
        // authData could not contains keys after validation if the authAdapter
        // uses the `doNotSave` option. Just update the authData part
        // Then we're good for the user, early exit of sorts

        if (Object.keys(this.data.authData).length) {
          await this.config.database.update(this.className, {
            objectId: this.data.objectId
          }, {
            authData: this.data.authData
          }, {});
        }
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

  if (!this.storage.authProvider && // signup call, with
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

  if (this.storage.authProvider == null && this.data.authData) {
    this.storage.authProvider = Object.keys(this.data.authData).join(',');
  }

  const {
    sessionData,
    createSession
  } = RestWrite.createSession(this.config, {
    userId: this.objectId(),
    createdWith: {
      action: this.storage.authProvider ? 'login' : 'signup',
      authProvider: this.storage.authProvider || 'password'
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

    if (this.config.liveQueryController) {
      this.config.liveQueryController.clearCachedRoles(this.auth.user);
    }
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

        if (!this.config.enforcePrivateUsers) {
          ACL['*'] = {
            read: true,
            write: false
          };
        }
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

  const {
    originalObject,
    updatedObject
  } = this.buildParseObjects();

  updatedObject._handleSaveResponse(this.response.response, this.response.status || 200);

  this.config.database.loadSchema().then(schemaController => {
    // Notifiy LiveQueryServer if possible
    const perms = schemaController.getClassLevelPermissions(updatedObject.className);
    this.config.liveQueryController.onAfterSave(updatedObject.className, updatedObject, originalObject, perms);
  }); // Run afterSave trigger

  return triggers.maybeRunTrigger(triggers.Types.afterSave, this.auth, updatedObject, originalObject, this.config, this.context).then(result => {
    const jsonReturned = result && !result._toFullJSON;

    if (jsonReturned) {
      this.pendingOps = {};
      this.response.response = result;
    } else {
      this.response.response = this._updateResponseWithData((result || updatedObject).toJSON(), this.data);
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


RestWrite.prototype.buildParseObjects = function () {
  var _this$query;

  const extraData = {
    className: this.className,
    objectId: (_this$query = this.query) === null || _this$query === void 0 ? void 0 : _this$query.objectId
  };
  let originalObject;

  if (this.query && this.query.objectId) {
    originalObject = triggers.inflate(extraData, this.originalData);
  }

  const className = Parse.Object.fromJSON(extraData);
  const readOnlyAttributes = className.constructor.readOnlyAttributes ? className.constructor.readOnlyAttributes() : [];

  if (!this.originalData) {
    for (const attribute of readOnlyAttributes) {
      extraData[attribute] = this.data[attribute];
    }
  }

  const updatedObject = triggers.inflate(extraData, this.originalData);
  Object.keys(this.data).reduce(function (data, key) {
    if (key.indexOf('.') > 0) {
      if (typeof data[key].__op === 'string') {
        if (!readOnlyAttributes.includes(key)) {
          updatedObject.set(key, data[key]);
        }
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
  const sanitized = this.sanitizedData();

  for (const attribute of readOnlyAttributes) {
    delete sanitized[attribute];
  }

  updatedObject.set(sanitized);
  return {
    updatedObject,
    originalObject
  };
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
  const {
    updatedObject
  } = this.buildParseObjects();
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(updatedObject._getStateIdentifier());

  for (const key in this.pendingOps) {
    if (!pending[key]) {
      data[key] = this.originalData ? this.originalData[key] : {
        __op: 'Delete'
      };
      this.storage.fieldsChangedByTrigger.push(key);
    }
  }

  const skipKeys = ['objectId', 'createdAt', 'updatedAt', ...(_SchemaController.requiredColumns.read[this.className] || [])];

  for (const key in response) {
    if (skipKeys.includes(key)) {
      continue;
    }

    const value = response[key];

    if (value == null || value.__type && value.__type === 'Pointer' || data[key] === value) {
      delete response[key];
    }
  }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJkZWVwY29weSIsIkF1dGgiLCJVdGlscyIsImNyeXB0b1V0aWxzIiwicGFzc3dvcmRDcnlwdG8iLCJQYXJzZSIsInRyaWdnZXJzIiwiQ2xpZW50U0RLIiwiUmVzdFdyaXRlIiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsInF1ZXJ5IiwiZGF0YSIsIm9yaWdpbmFsRGF0YSIsImNsaWVudFNESyIsImNvbnRleHQiLCJhY3Rpb24iLCJpc1JlYWRPbmx5IiwiRXJyb3IiLCJPUEVSQVRJT05fRk9SQklEREVOIiwic3RvcmFnZSIsInJ1bk9wdGlvbnMiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwib2JqZWN0SWQiLCJNSVNTSU5HX09CSkVDVF9JRCIsIklOVkFMSURfS0VZX05BTUUiLCJpZCIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJrZXl3b3JkIiwibWF0Y2giLCJvYmplY3RDb250YWluc0tleVZhbHVlIiwia2V5IiwidmFsdWUiLCJKU09OIiwic3RyaW5naWZ5IiwicmVzcG9uc2UiLCJ1cGRhdGVkQXQiLCJfZW5jb2RlIiwiRGF0ZSIsImlzbyIsInZhbGlkU2NoZW1hQ29udHJvbGxlciIsInBlbmRpbmdPcHMiLCJleGVjdXRlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJoYW5kbGVJbnN0YWxsYXRpb24iLCJoYW5kbGVTZXNzaW9uIiwidmFsaWRhdGVBdXRoRGF0YSIsInJ1bkJlZm9yZVNhdmVUcmlnZ2VyIiwiZW5zdXJlVW5pcXVlQXV0aERhdGFJZCIsImRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkIiwidmFsaWRhdGVTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwic2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCIsInRyYW5zZm9ybVVzZXIiLCJleHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cyIsImRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMiLCJydW5EYXRhYmFzZU9wZXJhdGlvbiIsImNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkIiwiaGFuZGxlRm9sbG93dXAiLCJydW5BZnRlclNhdmVUcmlnZ2VyIiwiY2xlYW5Vc2VyQXV0aERhdGEiLCJhdXRoRGF0YVJlc3BvbnNlIiwiaXNNYXN0ZXIiLCJhY2wiLCJ1c2VyIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJjb25jYXQiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJzeXN0ZW1DbGFzc2VzIiwiaW5kZXhPZiIsImRhdGFiYXNlIiwibG9hZFNjaGVtYSIsImhhc0NsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJ0cmlnZ2VyRXhpc3RzIiwiVHlwZXMiLCJiZWZvcmVTYXZlIiwiYXBwbGljYXRpb25JZCIsIm9yaWdpbmFsT2JqZWN0IiwidXBkYXRlZE9iamVjdCIsImJ1aWxkUGFyc2VPYmplY3RzIiwic3RhdGVDb250cm9sbGVyIiwiQ29yZU1hbmFnZXIiLCJnZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIiLCJwZW5kaW5nIiwiZ2V0UGVuZGluZ09wcyIsIl9nZXRTdGF0ZUlkZW50aWZpZXIiLCJkYXRhYmFzZVByb21pc2UiLCJ1cGRhdGUiLCJjcmVhdGUiLCJyZXN1bHQiLCJsZW5ndGgiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwibWF5YmVSdW5UcmlnZ2VyIiwib2JqZWN0IiwiZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciIsIl8iLCJyZWR1Y2UiLCJpc0VxdWFsIiwicHVzaCIsInJ1bkJlZm9yZUxvZ2luVHJpZ2dlciIsInVzZXJEYXRhIiwiYmVmb3JlTG9naW4iLCJleHRyYURhdGEiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiaW5mbGF0ZSIsImdldEFsbENsYXNzZXMiLCJhbGxDbGFzc2VzIiwic2NoZW1hIiwiZmluZCIsIm9uZUNsYXNzIiwic2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkIiwiZmllbGROYW1lIiwic2V0RGVmYXVsdCIsInVuZGVmaW5lZCIsIl9fb3AiLCJmaWVsZHMiLCJkZWZhdWx0VmFsdWUiLCJyZXF1aXJlZCIsIlZBTElEQVRJT05fRVJST1IiLCJjcmVhdGVkQXQiLCJuZXdPYmplY3RJZCIsIm9iamVjdElkU2l6ZSIsImtleXMiLCJmb3JFYWNoIiwiYXV0aERhdGEiLCJoYXNVc2VybmFtZUFuZFBhc3N3b3JkIiwidXNlcm5hbWUiLCJwYXNzd29yZCIsImlzRW1wdHkiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIlVOU1VQUE9SVEVEX1NFUlZJQ0UiLCJwcm92aWRlcnMiLCJjYW5IYW5kbGVBdXRoRGF0YSIsInNvbWUiLCJwcm92aWRlciIsInByb3ZpZGVyQXV0aERhdGEiLCJoYXNUb2tlbiIsImdldFVzZXJJZCIsImhhbmRsZUF1dGhEYXRhIiwiZmlsdGVyZWRPYmplY3RzQnlBQ0wiLCJvYmplY3RzIiwiZmlsdGVyIiwiQUNMIiwiaGFzQXV0aERhdGFJZCIsInIiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJyZXN1bHRzIiwiQUNDT1VOVF9BTFJFQURZX0xJTktFRCIsInVzZXJJZCIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsInZhbGlkYXRlZEF1dGhEYXRhIiwidXNlclJlc3VsdCIsImF1dGhQcm92aWRlciIsImpvaW4iLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJtdXRhdGVkQXV0aERhdGEiLCJpc0N1cnJlbnRVc2VyTG9nZ2VkT3JNYXN0ZXIiLCJpc0xvZ2luIiwibG9jYXRpb24iLCJjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luIiwiYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiIsInJlcyIsInByb21pc2UiLCJlcnJvciIsIlJlc3RRdWVyeSIsIm1hc3RlciIsIl9fdHlwZSIsInNlc3Npb24iLCJjYWNoZUNvbnRyb2xsZXIiLCJkZWwiLCJzZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVQYXNzd29yZFBvbGljeSIsImhhc2giLCJoYXNoZWRQYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfdmFsaWRhdGVVc2VyTmFtZSIsIl92YWxpZGF0ZUVtYWlsIiwicmFuZG9tU3RyaW5nIiwicmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUiLCIkbmUiLCJsaW1pdCIsImNhc2VJbnNlbnNpdGl2ZSIsIlVTRVJOQU1FX1RBS0VOIiwiZW1haWwiLCJyZWplY3QiLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJFTUFJTF9UQUtFTiIsInVzZXJDb250cm9sbGVyIiwic2V0RW1haWxWZXJpZnlUb2tlbiIsInBhc3N3b3JkUG9saWN5IiwiX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMiLCJfdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkiLCJwb2xpY3lFcnJvciIsInZhbGlkYXRpb25FcnJvciIsImNvbnRhaW5zVXNlcm5hbWVFcnJvciIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsIm9sZFBhc3N3b3JkcyIsIl9wYXNzd29yZF9oaXN0b3J5IiwidGFrZSIsIm5ld1Bhc3N3b3JkIiwicHJvbWlzZXMiLCJtYXAiLCJjb21wYXJlIiwiYWxsIiwiY2F0Y2giLCJlcnIiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwidmVyaWZ5VXNlckVtYWlscyIsImNyZWF0ZVNlc3Npb25Ub2tlbiIsImluc3RhbGxhdGlvbklkIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiY3JlYXRlZFdpdGgiLCJhZGRpdGlvbmFsU2Vzc2lvbkRhdGEiLCJ0b2tlbiIsIm5ld1Rva2VuIiwiZXhwaXJlc0F0IiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYXNzaWduIiwiYWRkT3BzIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiZGVzdHJveSIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJzZXNzaW9uUXVlcnkiLCJiaW5kIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwic3RhdHVzIiwiZGV2aWNlVG9rZW4iLCJ0b0xvd2VyQ2FzZSIsImRldmljZVR5cGUiLCJpZE1hdGNoIiwib2JqZWN0SWRNYXRjaCIsImluc3RhbGxhdGlvbklkTWF0Y2giLCJkZXZpY2VUb2tlbk1hdGNoZXMiLCJvclF1ZXJpZXMiLCIkb3IiLCJkZWxRdWVyeSIsImFwcElkZW50aWZpZXIiLCJjb2RlIiwib2JqSWQiLCJyb2xlIiwiY2xlYXIiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiY2xlYXJDYWNoZWRSb2xlcyIsImlzVW5hdXRoZW50aWNhdGVkIiwiU0VTU0lPTl9NSVNTSU5HIiwiZG93bmxvYWQiLCJkb3dubG9hZE5hbWUiLCJuYW1lIiwiSU5WQUxJRF9BQ0wiLCJyZWFkIiwid3JpdGUiLCJtYXhQYXNzd29yZEFnZSIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiZGVmZXIiLCJNYXRoIiwibWF4Iiwic2hpZnQiLCJfdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJoYXNBZnRlclNhdmVIb29rIiwiYWZ0ZXJTYXZlIiwiaGFzTGl2ZVF1ZXJ5IiwiX2hhbmRsZVNhdmVSZXNwb25zZSIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwib25BZnRlclNhdmUiLCJqc29uUmV0dXJuZWQiLCJfdG9GdWxsSlNPTiIsInRvSlNPTiIsImxvZ2dlciIsIndhcm4iLCJtaWRkbGUiLCJtb3VudCIsInNlcnZlclVSTCIsInNhbml0aXplZERhdGEiLCJ0ZXN0IiwiX2RlY29kZSIsImZyb21KU09OIiwicmVhZE9ubHlBdHRyaWJ1dGVzIiwiY29uc3RydWN0b3IiLCJhdHRyaWJ1dGUiLCJpbmNsdWRlcyIsInNldCIsInNwbGl0dGVkS2V5Iiwic3BsaXQiLCJwYXJlbnRQcm9wIiwicGFyZW50VmFsIiwiZ2V0Iiwic2FuaXRpemVkIiwic2tpcEtleXMiLCJyZXF1aXJlZENvbHVtbnMiLCJjbGllbnRTdXBwb3J0c0RlbGV0ZSIsInN1cHBvcnRzRm9yd2FyZERlbGV0ZSIsImRhdGFWYWx1ZSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFjQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7OztBQWpCQTtBQUNBO0FBQ0E7QUFFQSxJQUFJQSxnQkFBZ0IsR0FBR0MsT0FBTyxDQUFDLGdDQUFELENBQTlCOztBQUNBLElBQUlDLFFBQVEsR0FBR0QsT0FBTyxDQUFDLFVBQUQsQ0FBdEI7O0FBRUEsTUFBTUUsSUFBSSxHQUFHRixPQUFPLENBQUMsUUFBRCxDQUFwQjs7QUFDQSxNQUFNRyxLQUFLLEdBQUdILE9BQU8sQ0FBQyxTQUFELENBQXJCOztBQUNBLElBQUlJLFdBQVcsR0FBR0osT0FBTyxDQUFDLGVBQUQsQ0FBekI7O0FBQ0EsSUFBSUssY0FBYyxHQUFHTCxPQUFPLENBQUMsWUFBRCxDQUE1Qjs7QUFDQSxJQUFJTSxLQUFLLEdBQUdOLE9BQU8sQ0FBQyxZQUFELENBQW5COztBQUNBLElBQUlPLFFBQVEsR0FBR1AsT0FBTyxDQUFDLFlBQUQsQ0FBdEI7O0FBQ0EsSUFBSVEsU0FBUyxHQUFHUixPQUFPLENBQUMsYUFBRCxDQUF2Qjs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTUyxTQUFULENBQW1CQyxNQUFuQixFQUEyQkMsSUFBM0IsRUFBaUNDLFNBQWpDLEVBQTRDQyxLQUE1QyxFQUFtREMsSUFBbkQsRUFBeURDLFlBQXpELEVBQXVFQyxTQUF2RSxFQUFrRkMsT0FBbEYsRUFBMkZDLE1BQTNG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RCxLQUxzRCxDQU92RDs7O0FBQ0EsUUFBSXBSLFFBQVEsQ0FBQ21GLFNBQUQsQ0FBUixJQUF1Qm5GLFFBQVEsQ0FBQ21GLFNBQUQsQ0FBUixDQUFvQkcsSUFBL0MsRUFBcUQ7QUFDbkQsYUFBT3RGLFFBQVEsQ0FBQ21GLFNBQUQsQ0FBZjs7QUFDQSxVQUFJK0wsb0JBQW9CLElBQUlFLFNBQVMsQ0FBQzlMLElBQVYsSUFBa0IsUUFBOUMsRUFBd0Q7QUFDdER0RixRQUFBQSxRQUFRLENBQUNtRixTQUFELENBQVIsR0FBc0JpTSxTQUF0QjtBQUNEO0FBQ0Y7QUFDRixHQWREO0FBZUEsU0FBT3BSLFFBQVA7QUFDRCxDQTdDRDs7ZUErQ2VoQyxTOztBQUNmcVQsTUFBTSxDQUFDQyxPQUFQLEdBQWlCdFQsU0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIFJlc3RXcml0ZSBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhbiBvcGVyYXRpb25cbi8vIHRoYXQgd3JpdGVzIHRvIHRoZSBkYXRhYmFzZS5cbi8vIFRoaXMgY291bGQgYmUgZWl0aGVyIGEgXCJjcmVhdGVcIiBvciBhbiBcInVwZGF0ZVwiLlxuXG52YXIgU2NoZW1hQ29udHJvbGxlciA9IHJlcXVpcmUoJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcicpO1xudmFyIGRlZXBjb3B5ID0gcmVxdWlyZSgnZGVlcGNvcHknKTtcblxuY29uc3QgQXV0aCA9IHJlcXVpcmUoJy4vQXV0aCcpO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuL1V0aWxzJyk7XG52YXIgY3J5cHRvVXRpbHMgPSByZXF1aXJlKCcuL2NyeXB0b1V0aWxzJyk7XG52YXIgcGFzc3dvcmRDcnlwdG8gPSByZXF1aXJlKCcuL3Bhc3N3b3JkJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG52YXIgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG52YXIgQ2xpZW50U0RLID0gcmVxdWlyZSgnLi9DbGllbnRTREsnKTtcbmltcG9ydCBSZXN0UXVlcnkgZnJvbSAnLi9SZXN0UXVlcnknO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IHsgcmVxdWlyZWRDb2x1bW5zIH0gZnJvbSAnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJztcblxuLy8gcXVlcnkgYW5kIGRhdGEgYXJlIGJvdGggcHJvdmlkZWQgaW4gUkVTVCBBUEkgZm9ybWF0LiBTbyBkYXRhXG4vLyB0eXBlcyBhcmUgZW5jb2RlZCBieSBwbGFpbiBvbGQgb2JqZWN0cy5cbi8vIElmIHF1ZXJ5IGlzIG51bGwsIHRoaXMgaXMgYSBcImNyZWF0ZVwiIGFuZCB0aGUgZGF0YSBpbiBkYXRhIHNob3VsZCBiZVxuLy8gY3JlYXRlZC5cbi8vIE90aGVyd2lzZSB0aGlzIGlzIGFuIFwidXBkYXRlXCIgLSB0aGUgb2JqZWN0IG1hdGNoaW5nIHRoZSBxdWVyeVxuLy8gc2hvdWxkIGdldCB1cGRhdGVkIHdpdGggZGF0YS5cbi8vIFJlc3RXcml0ZSB3aWxsIGhhbmRsZSBvYmplY3RJZCwgY3JlYXRlZEF0LCBhbmQgdXBkYXRlZEF0IGZvclxuLy8gZXZlcnl0aGluZy4gSXQgYWxzbyBrbm93cyB0byB1c2UgdHJpZ2dlcnMgYW5kIHNwZWNpYWwgbW9kaWZpY2F0aW9uc1xuLy8gZm9yIHRoZSBfVXNlciBjbGFzcy5cbmZ1bmN0aW9uIFJlc3RXcml0ZShjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgcXVlcnksIGRhdGEsIG9yaWdpbmFsRGF0YSwgY2xpZW50U0RLLCBjb250ZXh0LCBhY3Rpb24pIHtcbiAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAnQ2Fubm90IHBlcmZvcm0gYSB3cml0ZSBvcGVyYXRpb24gd2hlbiB1c2luZyByZWFkT25seU1hc3RlcktleSdcbiAgICApO1xuICB9XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmF1dGggPSBhdXRoO1xuICB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgdGhpcy5jbGllbnRTREsgPSBjbGllbnRTREs7XG4gIHRoaXMuc3RvcmFnZSA9IHt9O1xuICB0aGlzLnJ1bk9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0gY29udGV4dCB8fCB7fTtcblxuICBpZiAoYWN0aW9uKSB7XG4gICAgdGhpcy5ydW5PcHRpb25zLmFjdGlvbiA9IGFjdGlvbjtcbiAgfVxuXG4gIGlmICghcXVlcnkpIHtcbiAgICBpZiAodGhpcy5jb25maWcuYWxsb3dDdXN0b21PYmplY3RJZCkge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChkYXRhLCAnb2JqZWN0SWQnKSAmJiAhZGF0YS5vYmplY3RJZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuTUlTU0lOR19PQkpFQ1RfSUQsXG4gICAgICAgICAgJ29iamVjdElkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsIG9yIHVuZGVmaW5lZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdvYmplY3RJZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgICBpZiAoZGF0YS5pZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ2lkIGlzIGFuIGludmFsaWQgZmllbGQgbmFtZS4nKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAodGhpcy5jb25maWcucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICBmb3IgKGNvbnN0IGtleXdvcmQgb2YgdGhpcy5jb25maWcucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgY29uc3QgbWF0Y2ggPSBVdGlscy5vYmplY3RDb250YWluc0tleVZhbHVlKGRhdGEsIGtleXdvcmQua2V5LCBrZXl3b3JkLnZhbHVlKTtcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICBgUHJvaGliaXRlZCBrZXl3b3JkIGluIHJlcXVlc3QgZGF0YTogJHtKU09OLnN0cmluZ2lmeShrZXl3b3JkKX0uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFdoZW4gdGhlIG9wZXJhdGlvbiBpcyBjb21wbGV0ZSwgdGhpcy5yZXNwb25zZSBtYXkgaGF2ZSBzZXZlcmFsXG4gIC8vIGZpZWxkcy5cbiAgLy8gcmVzcG9uc2U6IHRoZSBhY3R1YWwgZGF0YSB0byBiZSByZXR1cm5lZFxuICAvLyBzdGF0dXM6IHRoZSBodHRwIHN0YXR1cyBjb2RlLiBpZiBub3QgcHJlc2VudCwgdHJlYXRlZCBsaWtlIGEgMjAwXG4gIC8vIGxvY2F0aW9uOiB0aGUgbG9jYXRpb24gaGVhZGVyLiBpZiBub3QgcHJlc2VudCwgbm8gbG9jYXRpb24gaGVhZGVyXG4gIHRoaXMucmVzcG9uc2UgPSBudWxsO1xuXG4gIC8vIFByb2Nlc3NpbmcgdGhpcyBvcGVyYXRpb24gbWF5IG11dGF0ZSBvdXIgZGF0YSwgc28gd2Ugb3BlcmF0ZSBvbiBhXG4gIC8vIGNvcHlcbiAgdGhpcy5xdWVyeSA9IGRlZXBjb3B5KHF1ZXJ5KTtcbiAgdGhpcy5kYXRhID0gZGVlcGNvcHkoZGF0YSk7XG4gIC8vIFdlIG5ldmVyIGNoYW5nZSBvcmlnaW5hbERhdGEsIHNvIHdlIGRvIG5vdCBuZWVkIGEgZGVlcCBjb3B5XG4gIHRoaXMub3JpZ2luYWxEYXRhID0gb3JpZ2luYWxEYXRhO1xuXG4gIC8vIFRoZSB0aW1lc3RhbXAgd2UnbGwgdXNlIGZvciB0aGlzIHdob2xlIG9wZXJhdGlvblxuICB0aGlzLnVwZGF0ZWRBdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSkuaXNvO1xuXG4gIC8vIFNoYXJlZCBTY2hlbWFDb250cm9sbGVyIHRvIGJlIHJldXNlZCB0byByZWR1Y2UgdGhlIG51bWJlciBvZiBsb2FkU2NoZW1hKCkgY2FsbHMgcGVyIHJlcXVlc3RcbiAgLy8gT25jZSBzZXQgdGhlIHNjaGVtYURhdGEgc2hvdWxkIGJlIGltbXV0YWJsZVxuICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IG51bGw7XG4gIHRoaXMucGVuZGluZ09wcyA9IHt9O1xufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIHRoZVxuLy8gd3JpdGUsIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEge3Jlc3BvbnNlLCBzdGF0dXMsIGxvY2F0aW9ufSBvYmplY3QuXG4vLyBzdGF0dXMgYW5kIGxvY2F0aW9uIGFyZSBvcHRpb25hbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5zdGFsbGF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVTZXNzaW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5CZWZvcmVTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZW5zdXJlVW5pcXVlQXV0aERhdGFJZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hKCk7XG4gICAgfSlcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB0aGlzLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybVVzZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5EYXRhYmFzZU9wZXJhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlclNhdmVUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jbGVhblVzZXJBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gQXBwZW5kIHRoZSBhdXRoRGF0YVJlc3BvbnNlIGlmIGV4aXN0c1xuICAgICAgaWYgKHRoaXMuYXV0aERhdGFSZXNwb25zZSkge1xuICAgICAgICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVJlc3BvbnNlID0gdGhpcy5hdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5yZXNwb25zZTtcbiAgICB9KTtcbn07XG5cbi8vIFVzZXMgdGhlIEF1dGggb2JqZWN0IHRvIGdldCB0aGUgbGlzdCBvZiByb2xlcywgYWRkcyB0aGUgdXNlciBpZFxuUmVzdFdyaXRlLnByb3RvdHlwZS5nZXRVc2VyQW5kUm9sZUFDTCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIHRoaXMucnVuT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5ydW5PcHRpb25zLmFjbCA9IHRoaXMucnVuT3B0aW9ucy5hY2wuY29uY2F0KHJvbGVzLCBbdGhpcy5hdXRoLnVzZXIuaWRdKTtcbiAgICAgIHJldHVybjtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gY29uZmlnLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChcbiAgICB0aGlzLmNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT09IGZhbHNlICYmXG4gICAgIXRoaXMuYXV0aC5pc01hc3RlciAmJlxuICAgIFNjaGVtYUNvbnRyb2xsZXIuc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKHRoaXMuY2xhc3NOYW1lKSA9PT0gLTFcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuaGFzQ2xhc3ModGhpcy5jbGFzc05hbWUpKVxuICAgICAgLnRoZW4oaGFzQ2xhc3MgPT4ge1xuICAgICAgICBpZiAoaGFzQ2xhc3MgIT09IHRydWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgJ1RoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBhY2Nlc3MgJyArICdub24tZXhpc3RlbnQgY2xhc3M6ICcgKyB0aGlzLmNsYXNzTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIHNjaGVtYS5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVTY2hlbWEgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS52YWxpZGF0ZU9iamVjdChcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0aGlzLmRhdGEsXG4gICAgdGhpcy5xdWVyeSxcbiAgICB0aGlzLnJ1bk9wdGlvbnNcbiAgKTtcbn07XG5cbi8vIFJ1bnMgYW55IGJlZm9yZVNhdmUgdHJpZ2dlcnMgYWdhaW5zdCB0aGlzIG9wZXJhdGlvbi5cbi8vIEFueSBjaGFuZ2UgbGVhZHMgdG8gb3VyIGRhdGEgYmVpbmcgbXV0YXRlZC5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKHRoaXMuY2xhc3NOYW1lLCB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLCB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG5cbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKHVwZGF0ZWRPYmplY3QuX2dldFN0YXRlSWRlbnRpZmllcigpKTtcbiAgdGhpcy5wZW5kaW5nT3BzID0geyAuLi5wZW5kaW5nIH07XG5cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gQmVmb3JlIGNhbGxpbmcgdGhlIHRyaWdnZXIsIHZhbGlkYXRlIHRoZSBwZXJtaXNzaW9ucyBmb3IgdGhlIHNhdmUgb3BlcmF0aW9uXG4gICAgICBsZXQgZGF0YWJhc2VQcm9taXNlID0gbnVsbDtcbiAgICAgIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIGZvciB1cGRhdGluZ1xuICAgICAgICBkYXRhYmFzZVByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIHRydWUsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIGNyZWF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLmNyZWF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIEluIHRoZSBjYXNlIHRoYXQgdGhlcmUgaXMgbm8gcGVybWlzc2lvbiBmb3IgdGhlIG9wZXJhdGlvbiwgaXQgdGhyb3dzIGFuIGVycm9yXG4gICAgICByZXR1cm4gZGF0YWJhc2VQcm9taXNlLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0Lmxlbmd0aCA8PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgICAgIHRoaXMuYXV0aCxcbiAgICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgICB0aGlzLmNvbnRleHRcbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gXy5yZWR1Y2UoXG4gICAgICAgICAgcmVzcG9uc2Uub2JqZWN0LFxuICAgICAgICAgIChyZXN1bHQsIHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgICAgIGlmICghXy5pc0VxdWFsKHRoaXMuZGF0YVtrZXldLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBbXVxuICAgICAgICApO1xuICAgICAgICB0aGlzLmRhdGEgPSByZXNwb25zZS5vYmplY3Q7XG4gICAgICAgIC8vIFdlIHNob3VsZCBkZWxldGUgdGhlIG9iamVjdElkIGZvciBhbiB1cGRhdGUgd3JpdGVcbiAgICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlTG9naW5UcmlnZ2VyID0gYXN5bmMgZnVuY3Rpb24gKHVzZXJEYXRhKSB7XG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZUxvZ2luJyB0cmlnZ2VyXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyh0aGlzLmNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWQpXG4gICkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIENsb3VkIGNvZGUgZ2V0cyBhIGJpdCBvZiBleHRyYSBkYXRhIGZvciBpdHMgb2JqZWN0c1xuICBjb25zdCBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUgfTtcblxuICAvLyBFeHBhbmQgZmlsZSBvYmplY3RzXG4gIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCB1c2VyRGF0YSk7XG5cbiAgY29uc3QgdXNlciA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB1c2VyRGF0YSk7XG5cbiAgLy8gbm8gbmVlZCB0byByZXR1cm4gYSByZXNwb25zZVxuICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgdGhpcy5hdXRoLFxuICAgIHVzZXIsXG4gICAgbnVsbCxcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmNvbnRleHRcbiAgKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuc2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuZGF0YSkge1xuICAgIHJldHVybiB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlci5nZXRBbGxDbGFzc2VzKCkudGhlbihhbGxDbGFzc2VzID0+IHtcbiAgICAgIGNvbnN0IHNjaGVtYSA9IGFsbENsYXNzZXMuZmluZChvbmVDbGFzcyA9PiBvbmVDbGFzcy5jbGFzc05hbWUgPT09IHRoaXMuY2xhc3NOYW1lKTtcbiAgICAgIGNvbnN0IHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCA9IChmaWVsZE5hbWUsIHNldERlZmF1bHQpID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gbnVsbCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnJyB8fFxuICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzZXREZWZhdWx0ICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IG51bGwgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAgICAgKHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiYgdGhpcy5kYXRhW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlO1xuICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciB8fCBbXTtcbiAgICAgICAgICAgIGlmICh0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5pbmRleE9mKGZpZWxkTmFtZSkgPCAwKSB7XG4gICAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0ucmVxdWlyZWQgPT09IHRydWUpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBgJHtmaWVsZE5hbWV9IGlzIHJlcXVpcmVkYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICAvLyBBZGQgZGVmYXVsdCBmaWVsZHNcbiAgICAgIHRoaXMuZGF0YS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG5cbiAgICAgICAgLy8gT25seSBhc3NpZ24gbmV3IG9iamVjdElkIGlmIHdlIGFyZSBjcmVhdGluZyBuZXcgb2JqZWN0XG4gICAgICAgIGlmICghdGhpcy5kYXRhLm9iamVjdElkKSB7XG4gICAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkID0gY3J5cHRvVXRpbHMubmV3T2JqZWN0SWQodGhpcy5jb25maWcub2JqZWN0SWRTaXplKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkKGZpZWxkTmFtZSwgdHJ1ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoc2NoZW1hKSB7XG4gICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGF0YSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuLy8gVHJhbnNmb3JtcyBhdXRoIGRhdGEgZm9yIGEgdXNlciBvYmplY3QuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhIHVzZXIgb2JqZWN0LlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZUF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBhdXRoRGF0YSA9IHRoaXMuZGF0YS5hdXRoRGF0YTtcbiAgY29uc3QgaGFzVXNlcm5hbWVBbmRQYXNzd29yZCA9XG4gICAgdHlwZW9mIHRoaXMuZGF0YS51c2VybmFtZSA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIHRoaXMuZGF0YS5wYXNzd29yZCA9PT0gJ3N0cmluZyc7XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICFhdXRoRGF0YSkge1xuICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLnVzZXJuYW1lICE9PSAnc3RyaW5nJyB8fCBfLmlzRW1wdHkodGhpcy5kYXRhLnVzZXJuYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICdiYWQgb3IgbWlzc2luZyB1c2VybmFtZScpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHRoaXMuZGF0YS5wYXNzd29yZCAhPT0gJ3N0cmluZycgfHwgXy5pc0VtcHR5KHRoaXMuZGF0YS5wYXNzd29yZCkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG4gIH1cblxuICBpZiAoXG4gICAgKGF1dGhEYXRhICYmICFPYmplY3Qua2V5cyhhdXRoRGF0YSkubGVuZ3RoKSB8fFxuICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKVxuICApIHtcbiAgICAvLyBOb3RoaW5nIHRvIHZhbGlkYXRlIGhlcmVcbiAgICByZXR1cm47XG4gIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuZGF0YSwgJ2F1dGhEYXRhJykgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIC8vIEhhbmRsZSBzYXZpbmcgYXV0aERhdGEgdG8gbnVsbFxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICk7XG4gIH1cblxuICB2YXIgcHJvdmlkZXJzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpO1xuICBpZiAocHJvdmlkZXJzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBjYW5IYW5kbGVBdXRoRGF0YSA9IHByb3ZpZGVycy5zb21lKHByb3ZpZGVyID0+IHtcbiAgICAgIHZhciBwcm92aWRlckF1dGhEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgdmFyIGhhc1Rva2VuID0gcHJvdmlkZXJBdXRoRGF0YSAmJiBwcm92aWRlckF1dGhEYXRhLmlkO1xuICAgICAgcmV0dXJuIGhhc1Rva2VuIHx8IHByb3ZpZGVyQXV0aERhdGEgPT09IG51bGw7XG4gICAgfSk7XG4gICAgaWYgKGNhbkhhbmRsZUF1dGhEYXRhIHx8IGhhc1VzZXJuYW1lQW5kUGFzc3dvcmQgfHwgdGhpcy5hdXRoLmlzTWFzdGVyIHx8IHRoaXMuZ2V0VXNlcklkKCkpIHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhKGF1dGhEYXRhKTtcbiAgICB9XG4gIH1cbiAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZmlsdGVyZWRPYmplY3RzQnlBQ0wgPSBmdW5jdGlvbiAob2JqZWN0cykge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIG9iamVjdHM7XG4gIH1cbiAgcmV0dXJuIG9iamVjdHMuZmlsdGVyKG9iamVjdCA9PiB7XG4gICAgaWYgKCFvYmplY3QuQUNMKSB7XG4gICAgICByZXR1cm4gdHJ1ZTsgLy8gbGVnYWN5IHVzZXJzIHRoYXQgaGF2ZSBubyBBQ0wgZmllbGQgb24gdGhlbVxuICAgIH1cbiAgICAvLyBSZWd1bGFyIHVzZXJzIHRoYXQgaGF2ZSBiZWVuIGxvY2tlZCBvdXQuXG4gICAgcmV0dXJuIG9iamVjdC5BQ0wgJiYgT2JqZWN0LmtleXMob2JqZWN0LkFDTCkubGVuZ3RoID4gMDtcbiAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmdldFVzZXJJZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHJldHVybiB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICB9IGVsc2UgaWYgKHRoaXMuYXV0aCAmJiB0aGlzLmF1dGgudXNlciAmJiB0aGlzLmF1dGgudXNlci5pZCkge1xuICAgIHJldHVybiB0aGlzLmF1dGgudXNlci5pZDtcbiAgfVxufTtcblxuLy8gRGV2ZWxvcGVycyBhcmUgYWxsb3dlZCB0byBjaGFuZ2UgYXV0aERhdGEgdmlhIGJlZm9yZSBzYXZlIHRyaWdnZXJcbi8vIHdlIG5lZWQgYWZ0ZXIgYmVmb3JlIHNhdmUgdG8gZW5zdXJlIHRoYXQgdGhlIGRldmVsb3BlclxuLy8gaXMgbm90IGN1cnJlbnRseSBkdXBsaWNhdGluZyBhdXRoIGRhdGEgSURcblJlc3RXcml0ZS5wcm90b3R5cGUuZW5zdXJlVW5pcXVlQXV0aERhdGFJZCA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8ICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBoYXNBdXRoRGF0YUlkID0gT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5zb21lKFxuICAgIGtleSA9PiB0aGlzLmRhdGEuYXV0aERhdGFba2V5XSAmJiB0aGlzLmRhdGEuYXV0aERhdGFba2V5XS5pZFxuICApO1xuXG4gIGlmICghaGFzQXV0aERhdGFJZCkgcmV0dXJuO1xuXG4gIGNvbnN0IHIgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YSh0aGlzLmNvbmZpZywgdGhpcy5kYXRhLmF1dGhEYXRhKTtcbiAgY29uc3QgcmVzdWx0cyA9IHRoaXMuZmlsdGVyZWRPYmplY3RzQnlBQ0wocik7XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxuICAvLyB1c2UgZGF0YS5vYmplY3RJZCBpbiBjYXNlIG9mIGxvZ2luIHRpbWUgYW5kIGZvdW5kIHVzZXIgZHVyaW5nIGhhbmRsZSB2YWxpZGF0ZUF1dGhEYXRhXG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMuZ2V0VXNlcklkKCkgfHwgdGhpcy5kYXRhLm9iamVjdElkO1xuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEgJiYgdXNlcklkICE9PSByZXN1bHRzWzBdLm9iamVjdElkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlQXV0aERhdGEgPSBhc3luYyBmdW5jdGlvbiAoYXV0aERhdGEpIHtcbiAgY29uc3QgciA9IGF3YWl0IEF1dGguZmluZFVzZXJzV2l0aEF1dGhEYXRhKHRoaXMuY29uZmlnLCBhdXRoRGF0YSk7XG4gIGNvbnN0IHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuXG4gIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAvLyBUbyBhdm9pZCBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9zZWN1cml0eS9hZHZpc29yaWVzL0dIU0EtOHczai1nOTgzLThqaDVcbiAgICAvLyBMZXQncyBydW4gc29tZSB2YWxpZGF0aW9uIGJlZm9yZSB0aHJvd2luZ1xuICAgIGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKGF1dGhEYXRhLCB0aGlzLCByZXN1bHRzWzBdKTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxuXG4gIC8vIE5vIHVzZXIgZm91bmQgd2l0aCBwcm92aWRlZCBhdXRoRGF0YSB3ZSBuZWVkIHRvIHZhbGlkYXRlXG4gIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICBjb25zdCB7IGF1dGhEYXRhOiB2YWxpZGF0ZWRBdXRoRGF0YSwgYXV0aERhdGFSZXNwb25zZSB9ID0gYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHRoaXNcbiAgICApO1xuICAgIHRoaXMuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgLy8gUmVwbGFjZSBjdXJyZW50IGF1dGhEYXRhIGJ5IHRoZSBuZXcgdmFsaWRhdGVkIG9uZVxuICAgIHRoaXMuZGF0YS5hdXRoRGF0YSA9IHZhbGlkYXRlZEF1dGhEYXRhO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFVzZXIgZm91bmQgd2l0aCBwcm92aWRlZCBhdXRoRGF0YVxuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEpIHtcbiAgICBjb25zdCB1c2VySWQgPSB0aGlzLmdldFVzZXJJZCgpO1xuICAgIGNvbnN0IHVzZXJSZXN1bHQgPSByZXN1bHRzWzBdO1xuICAgIC8vIFByZXZlbnQgZHVwbGljYXRlIGF1dGhEYXRhIGlkXG4gICAgaWYgKHVzZXJJZCAmJiB1c2VySWQgIT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICAgIH1cblxuICAgIHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuam9pbignLCcpO1xuXG4gICAgY29uc3QgeyBoYXNNdXRhdGVkQXV0aERhdGEsIG11dGF0ZWRBdXRoRGF0YSB9ID0gQXV0aC5oYXNNdXRhdGVkQXV0aERhdGEoXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHVzZXJSZXN1bHQuYXV0aERhdGFcbiAgICApO1xuXG4gICAgY29uc3QgaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyID1cbiAgICAgICh0aGlzLmF1dGggJiYgdGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5hdXRoLnVzZXIuaWQgPT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHx8XG4gICAgICB0aGlzLmF1dGguaXNNYXN0ZXI7XG5cbiAgICBjb25zdCBpc0xvZ2luID0gIXVzZXJJZDtcblxuICAgIGlmIChpc0xvZ2luIHx8IGlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3Rlcikge1xuICAgICAgLy8gbm8gdXNlciBtYWtpbmcgdGhlIGNhbGxcbiAgICAgIC8vIE9SIHRoZSB1c2VyIG1ha2luZyB0aGUgY2FsbCBpcyB0aGUgcmlnaHQgb25lXG4gICAgICAvLyBMb2dpbiB3aXRoIGF1dGggZGF0YVxuICAgICAgZGVsZXRlIHJlc3VsdHNbMF0ucGFzc3dvcmQ7XG5cbiAgICAgIC8vIG5lZWQgdG8gc2V0IHRoZSBvYmplY3RJZCBmaXJzdCBvdGhlcndpc2UgbG9jYXRpb24gaGFzIHRyYWlsaW5nIHVuZGVmaW5lZFxuICAgICAgdGhpcy5kYXRhLm9iamVjdElkID0gdXNlclJlc3VsdC5vYmplY3RJZDtcblxuICAgICAgaWYgKCF0aGlzLnF1ZXJ5IHx8ICF0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgcmVzcG9uc2U6IHVzZXJSZXN1bHQsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gUnVuIGJlZm9yZUxvZ2luIGhvb2sgYmVmb3JlIHN0b3JpbmcgYW55IHVwZGF0ZXNcbiAgICAgICAgLy8gdG8gYXV0aERhdGEgb24gdGhlIGRiOyBjaGFuZ2VzIHRvIHVzZXJSZXN1bHRcbiAgICAgICAgLy8gd2lsbCBiZSBpZ25vcmVkLlxuICAgICAgICBhd2FpdCB0aGlzLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlcihkZWVwY29weSh1c2VyUmVzdWx0KSk7XG5cbiAgICAgICAgLy8gSWYgd2UgYXJlIGluIGxvZ2luIG9wZXJhdGlvbiB2aWEgYXV0aERhdGFcbiAgICAgICAgLy8gd2UgbmVlZCB0byBiZSBzdXJlIHRoYXQgdGhlIHVzZXIgaGFzIHByb3ZpZGVkXG4gICAgICAgIC8vIHJlcXVpcmVkIGF1dGhEYXRhXG4gICAgICAgIEF1dGguY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbihcbiAgICAgICAgICBhdXRoRGF0YSxcbiAgICAgICAgICB1c2VyUmVzdWx0LmF1dGhEYXRhLFxuICAgICAgICAgIHRoaXMuY29uZmlnXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIC8vIFByZXZlbnQgdmFsaWRhdGluZyBpZiBubyBtdXRhdGVkIGRhdGEgZGV0ZWN0ZWQgb24gdXBkYXRlXG4gICAgICBpZiAoIWhhc011dGF0ZWRBdXRoRGF0YSAmJiBpc0N1cnJlbnRVc2VyTG9nZ2VkT3JNYXN0ZXIpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBGb3JjZSB0byB2YWxpZGF0ZSBhbGwgcHJvdmlkZWQgYXV0aERhdGEgb24gbG9naW5cbiAgICAgIC8vIG9uIHVwZGF0ZSBvbmx5IHZhbGlkYXRlIG11dGF0ZWQgb25lc1xuICAgICAgaWYgKGhhc011dGF0ZWRBdXRoRGF0YSB8fCAhdGhpcy5jb25maWcuYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbikge1xuICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgICAgICBpc0xvZ2luID8gYXV0aERhdGEgOiBtdXRhdGVkQXV0aERhdGEsXG4gICAgICAgICAgdGhpcyxcbiAgICAgICAgICB1c2VyUmVzdWx0XG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGF0YS5hdXRoRGF0YSA9IHJlcy5hdXRoRGF0YTtcbiAgICAgICAgdGhpcy5hdXRoRGF0YVJlc3BvbnNlID0gcmVzLmF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIElGIHdlIGFyZSBpbiBsb2dpbiB3ZSdsbCBza2lwIHRoZSBkYXRhYmFzZSBvcGVyYXRpb24gLyBiZWZvcmVTYXZlIC8gYWZ0ZXJTYXZlIGV0Yy4uLlxuICAgICAgLy8gd2UgbmVlZCB0byBzZXQgaXQgdXAgdGhlcmUuXG4gICAgICAvLyBXZSBhcmUgc3VwcG9zZWQgdG8gaGF2ZSBhIHJlc3BvbnNlIG9ubHkgb24gTE9HSU4gd2l0aCBhdXRoRGF0YSwgc28gd2Ugc2tpcCB0aG9zZVxuICAgICAgLy8gSWYgd2UncmUgbm90IGxvZ2dpbmcgaW4sIGJ1dCBqdXN0IHVwZGF0aW5nIHRoZSBjdXJyZW50IHVzZXIsIHdlIGNhbiBzYWZlbHkgc2tpcCB0aGF0IHBhcnRcbiAgICAgIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgICAgIC8vIEFzc2lnbiB0aGUgbmV3IGF1dGhEYXRhIGluIHRoZSByZXNwb25zZVxuICAgICAgICBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UuYXV0aERhdGFbcHJvdmlkZXJdID0gbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gUnVuIHRoZSBEQiB1cGRhdGUgZGlyZWN0bHksIGFzICdtYXN0ZXInIG9ubHkgaWYgYXV0aERhdGEgY29udGFpbnMgc29tZSBrZXlzXG4gICAgICAgIC8vIGF1dGhEYXRhIGNvdWxkIG5vdCBjb250YWlucyBrZXlzIGFmdGVyIHZhbGlkYXRpb24gaWYgdGhlIGF1dGhBZGFwdGVyXG4gICAgICAgIC8vIHVzZXMgdGhlIGBkb05vdFNhdmVgIG9wdGlvbi4gSnVzdCB1cGRhdGUgdGhlIGF1dGhEYXRhIHBhcnRcbiAgICAgICAgLy8gVGhlbiB3ZSdyZSBnb29kIGZvciB0aGUgdXNlciwgZWFybHkgZXhpdCBvZiBzb3J0c1xuICAgICAgICBpZiAoT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGgpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMuZGF0YS5vYmplY3RJZCB9LFxuICAgICAgICAgICAgeyBhdXRoRGF0YTogdGhpcy5kYXRhLmF1dGhEYXRhIH0sXG4gICAgICAgICAgICB7fVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFRoZSBub24tdGhpcmQtcGFydHkgcGFydHMgb2YgVXNlciB0cmFuc2Zvcm1hdGlvblxuUmVzdFdyaXRlLnByb3RvdHlwZS50cmFuc2Zvcm1Vc2VyID0gZnVuY3Rpb24gKCkge1xuICB2YXIgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyICYmICdlbWFpbFZlcmlmaWVkJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBlcnJvciA9IGBDbGllbnRzIGFyZW4ndCBhbGxvd2VkIHRvIG1hbnVhbGx5IHVwZGF0ZSBlbWFpbCB2ZXJpZmljYXRpb24uYDtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTiwgZXJyb3IpO1xuICB9XG5cbiAgLy8gRG8gbm90IGNsZWFudXAgc2Vzc2lvbiBpZiBvYmplY3RJZCBpcyBub3Qgc2V0XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMub2JqZWN0SWQoKSkge1xuICAgIC8vIElmIHdlJ3JlIHVwZGF0aW5nIGEgX1VzZXIgb2JqZWN0LCB3ZSBuZWVkIHRvIGNsZWFyIG91dCB0aGUgY2FjaGUgZm9yIHRoYXQgdXNlci4gRmluZCBhbGwgdGhlaXJcbiAgICAvLyBzZXNzaW9uIHRva2VucywgYW5kIHJlbW92ZSB0aGVtIGZyb20gdGhlIGNhY2hlLlxuICAgIHByb21pc2UgPSBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksICdfU2Vzc2lvbicsIHtcbiAgICAgIHVzZXI6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgIH0sXG4gICAgfSlcbiAgICAgIC5leGVjdXRlKClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLnJlc3VsdHMuZm9yRWFjaChzZXNzaW9uID0+XG4gICAgICAgICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb24uc2Vzc2lvblRva2VuKVxuICAgICAgICApO1xuICAgICAgfSk7XG4gIH1cblxuICByZXR1cm4gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIFRyYW5zZm9ybSB0aGUgcGFzc3dvcmRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBpZ25vcmUgb25seSBpZiB1bmRlZmluZWQuIHNob3VsZCBwcm9jZWVkIGlmIGVtcHR5ICgnJylcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5xdWVyeSkge1xuICAgICAgICB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXSA9IHRydWU7XG4gICAgICAgIC8vIEdlbmVyYXRlIGEgbmV3IHNlc3Npb24gb25seSBpZiB0aGUgdXNlciByZXF1ZXN0ZWRcbiAgICAgICAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgICAgICB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uaGFzaCh0aGlzLmRhdGEucGFzc3dvcmQpLnRoZW4oaGFzaGVkUGFzc3dvcmQgPT4ge1xuICAgICAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkID0gaGFzaGVkUGFzc3dvcmQ7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5wYXNzd29yZDtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVVzZXJOYW1lKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVFbWFpbCgpO1xuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVVc2VyTmFtZSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gQ2hlY2sgZm9yIHVzZXJuYW1lIHVuaXF1ZW5lc3NcbiAgaWYgKCF0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgIHRoaXMuZGF0YS51c2VybmFtZSA9IGNyeXB0b1V0aWxzLnJhbmRvbVN0cmluZygyNSk7XG4gICAgICB0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8qXG4gICAgVXNlcm5hbWVzIHNob3VsZCBiZSB1bmlxdWUgd2hlbiBjb21wYXJlZCBjYXNlIGluc2Vuc2l0aXZlbHlcblxuICAgIFVzZXJzIHNob3VsZCBiZSBhYmxlIHRvIG1ha2UgY2FzZSBzZW5zaXRpdmUgdXNlcm5hbWVzIGFuZFxuICAgIGxvZ2luIHVzaW5nIHRoZSBjYXNlIHRoZXkgZW50ZXJlZC4gIEkuZS4gJ1Nub29weScgc2hvdWxkIHByZWNsdWRlXG4gICAgJ3Nub29weScgYXMgYSB2YWxpZCB1c2VybmFtZS5cbiAgKi9cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHtcbiAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxLCBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIHt9LFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfSk7XG59O1xuXG4vKlxuICBBcyB3aXRoIHVzZXJuYW1lcywgUGFyc2Ugc2hvdWxkIG5vdCBhbGxvdyBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgb2YgZW1haWwuXG4gIHVubGlrZSB3aXRoIHVzZXJuYW1lcyAod2hpY2ggY2FuIGhhdmUgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb25zIGluIHRoZSBjYXNlIG9mXG4gIGF1dGggYWRhcHRlcnMpLCBlbWFpbHMgc2hvdWxkIG5ldmVyIGhhdmUgYSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbi5cblxuICBUaGlzIGJlaGF2aW9yIGNhbiBiZSBlbmZvcmNlZCB0aHJvdWdoIGEgcHJvcGVybHkgY29uZmlndXJlZCBpbmRleCBzZWU6XG4gIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvY29yZS9pbmRleC1jYXNlLWluc2Vuc2l0aXZlLyNjcmVhdGUtYS1jYXNlLWluc2Vuc2l0aXZlLWluZGV4XG4gIHdoaWNoIGNvdWxkIGJlIGltcGxlbWVudGVkIGluc3RlYWQgb2YgdGhpcyBjb2RlIGJhc2VkIHZhbGlkYXRpb24uXG5cbiAgR2l2ZW4gdGhhdCB0aGlzIGxvb2t1cCBzaG91bGQgYmUgYSByZWxhdGl2ZWx5IGxvdyB1c2UgY2FzZSBhbmQgdGhhdCB0aGUgY2FzZSBzZW5zaXRpdmVcbiAgdW5pcXVlIGluZGV4IHdpbGwgYmUgdXNlZCBieSB0aGUgZGIgZm9yIHRoZSBxdWVyeSwgdGhpcyBpcyBhbiBhZGVxdWF0ZSBzb2x1dGlvbi5cbiovXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZUVtYWlsID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZGF0YS5lbWFpbCB8fCB0aGlzLmRhdGEuZW1haWwuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gVmFsaWRhdGUgYmFzaWMgZW1haWwgYWRkcmVzcyBmb3JtYXRcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwubWF0Y2goL14uK0AuKyQvKSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsICdFbWFpbCBhZGRyZXNzIGZvcm1hdCBpcyBpbnZhbGlkLicpXG4gICAgKTtcbiAgfVxuICAvLyBDYXNlIGluc2Vuc2l0aXZlIG1hdGNoLCBzZWUgbm90ZSBhYm92ZSBmdW5jdGlvbi5cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHtcbiAgICAgICAgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCxcbiAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxLCBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIHt9LFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgIXRoaXMuZGF0YS5hdXRoRGF0YSB8fFxuICAgICAgICAhT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggfHxcbiAgICAgICAgKE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoID09PSAxICYmXG4gICAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKVswXSA9PT0gJ2Fub255bW91cycpXG4gICAgICApIHtcbiAgICAgICAgLy8gV2UgdXBkYXRlZCB0aGUgZW1haWwsIHNlbmQgYSBuZXcgdmFsaWRhdGlvblxuICAgICAgICB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2V0RW1haWxWZXJpZnlUb2tlbih0aGlzLmRhdGEpO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSkgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cygpLnRoZW4oKCkgPT4ge1xuICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSgpO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGNoZWNrIGlmIHRoZSBwYXNzd29yZCBjb25mb3JtcyB0byB0aGUgZGVmaW5lZCBwYXNzd29yZCBwb2xpY3kgaWYgY29uZmlndXJlZFxuICAvLyBJZiB3ZSBzcGVjaWZpZWQgYSBjdXN0b20gZXJyb3IgaW4gb3VyIGNvbmZpZ3VyYXRpb24gdXNlIGl0LlxuICAvLyBFeGFtcGxlOiBcIlBhc3N3b3JkcyBtdXN0IGluY2x1ZGUgYSBDYXBpdGFsIExldHRlciwgTG93ZXJjYXNlIExldHRlciwgYW5kIGEgbnVtYmVyLlwiXG4gIC8vXG4gIC8vIFRoaXMgaXMgZXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGdlbmVyaWMgXCJwYXNzd29yZCByZXNldFwiIHBhZ2UsXG4gIC8vIGFzIGl0IGFsbG93cyB0aGUgcHJvZ3JhbW1lciB0byBjb21tdW5pY2F0ZSBzcGVjaWZpYyByZXF1aXJlbWVudHMgaW5zdGVhZCBvZjpcbiAgLy8gYS4gbWFraW5nIHRoZSB1c2VyIGd1ZXNzIHdoYXRzIHdyb25nXG4gIC8vIGIuIG1ha2luZyBhIGN1c3RvbSBwYXNzd29yZCByZXNldCBwYWdlIHRoYXQgc2hvd3MgdGhlIHJlcXVpcmVtZW50c1xuICBjb25zdCBwb2xpY3lFcnJvciA9IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgID8gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgOiAnUGFzc3dvcmQgZG9lcyBub3QgbWVldCB0aGUgUGFzc3dvcmQgUG9saWN5IHJlcXVpcmVtZW50cy4nO1xuICBjb25zdCBjb250YWluc1VzZXJuYW1lRXJyb3IgPSAnUGFzc3dvcmQgY2Fubm90IGNvbnRhaW4geW91ciB1c2VybmFtZS4nO1xuXG4gIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIG1lZXRzIHRoZSBwYXNzd29yZCBzdHJlbmd0aCByZXF1aXJlbWVudHNcbiAgaWYgKFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvcih0aGlzLmRhdGEucGFzc3dvcmQpKSB8fFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrKHRoaXMuZGF0YS5wYXNzd29yZCkpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgcG9saWN5RXJyb3IpKTtcbiAgfVxuXG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgY29udGFpbiB1c2VybmFtZVxuICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lID09PSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgICAgLy8gdXNlcm5hbWUgaXMgbm90IHBhc3NlZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZih0aGlzLmRhdGEudXNlcm5hbWUpID49IDApXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHJldHJpZXZlIHRoZSBVc2VyIG9iamVjdCB1c2luZyBvYmplY3RJZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YocmVzdWx0c1swXS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKVxuICAgICAgICAgICk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBpcyByZXBlYXRpbmcgZnJvbSBzcGVjaWZpZWQgaGlzdG9yeVxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgaWYgKHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnkpXG4gICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDFcbiAgICAgICAgICApO1xuICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgY29uc3QgbmV3UGFzc3dvcmQgPSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIC8vIGNvbXBhcmUgdGhlIG5ldyBwYXNzd29yZCBoYXNoIHdpdGggYWxsIG9sZCBwYXNzd29yZCBoYXNoZXNcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBvbGRQYXNzd29yZHMubWFwKGZ1bmN0aW9uIChoYXNoKSB7XG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUobmV3UGFzc3dvcmQsIGhhc2gpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpXG4gICAgICAgICAgICAgIC8vIHJlamVjdCBpZiB0aGVyZSBpcyBhIG1hdGNoXG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCgnUkVQRUFUX1BBU1NXT1JEJyk7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB3YWl0IGZvciBhbGwgY29tcGFyaXNvbnMgdG8gY29tcGxldGVcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyciA9PT0gJ1JFUEVBVF9QQVNTV09SRCcpXG4gICAgICAgICAgICAgIC8vIGEgbWF0Y2ggd2FzIGZvdW5kXG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICAgICAgYE5ldyBwYXNzd29yZCBzaG91bGQgbm90IGJlIHRoZSBzYW1lIGFzIGxhc3QgJHt0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3Rvcnl9IHBhc3N3b3Jkcy5gXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERvbid0IGdlbmVyYXRlIHNlc3Npb24gZm9yIHVwZGF0aW5nIHVzZXIgKHRoaXMucXVlcnkgaXMgc2V0KSB1bmxlc3MgYXV0aERhdGEgZXhpc3RzXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgbmV3IHNlc3Npb25Ub2tlbiBpZiBsaW5raW5nIHZpYSBzZXNzaW9uVG9rZW5cbiAgaWYgKHRoaXMuYXV0aC51c2VyICYmIHRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoXG4gICAgIXRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgJiYgLy8gc2lnbnVwIGNhbGwsIHdpdGhcbiAgICB0aGlzLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsICYmIC8vIG5vIGxvZ2luIHdpdGhvdXQgdmVyaWZpY2F0aW9uXG4gICAgdGhpcy5jb25maWcudmVyaWZ5VXNlckVtYWlsc1xuICApIHtcbiAgICAvLyB2ZXJpZmljYXRpb24gaXMgb25cbiAgICByZXR1cm47IC8vIGRvIG5vdCBjcmVhdGUgdGhlIHNlc3Npb24gdG9rZW4gaW4gdGhhdCBjYXNlIVxuICB9XG4gIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jcmVhdGVTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIC8vIGNsb3VkIGluc3RhbGxhdGlvbklkIGZyb20gQ2xvdWQgQ29kZSxcbiAgLy8gbmV2ZXIgY3JlYXRlIHNlc3Npb24gdG9rZW5zIGZyb20gdGhlcmUuXG4gIGlmICh0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQgJiYgdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkID09PSAnY2xvdWQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPT0gbnVsbCAmJiB0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID0gT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5qb2luKCcsJyk7XG4gIH1cblxuICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgIHVzZXJJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICBhY3Rpb246IHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPyAnbG9naW4nIDogJ3NpZ251cCcsXG4gICAgICBhdXRoUHJvdmlkZXI6IHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgfHwgJ3Bhc3N3b3JkJyxcbiAgICB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQsXG4gIH0pO1xuXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIHJldHVybiBjcmVhdGVTZXNzaW9uKCk7XG59O1xuXG5SZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbiA9IGZ1bmN0aW9uIChcbiAgY29uZmlnLFxuICB7IHVzZXJJZCwgY3JlYXRlZFdpdGgsIGluc3RhbGxhdGlvbklkLCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgfVxuKSB7XG4gIGNvbnN0IHRva2VuID0gJ3I6JyArIGNyeXB0b1V0aWxzLm5ld1Rva2VuKCk7XG4gIGNvbnN0IGV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKTtcbiAgY29uc3Qgc2Vzc2lvbkRhdGEgPSB7XG4gICAgc2Vzc2lvblRva2VuOiB0b2tlbixcbiAgICB1c2VyOiB7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgIG9iamVjdElkOiB1c2VySWQsXG4gICAgfSxcbiAgICBjcmVhdGVkV2l0aCxcbiAgICBleHBpcmVzQXQ6IFBhcnNlLl9lbmNvZGUoZXhwaXJlc0F0KSxcbiAgfTtcblxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBzZXNzaW9uRGF0YS5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgT2JqZWN0LmFzc2lnbihzZXNzaW9uRGF0YSwgYWRkaXRpb25hbFNlc3Npb25EYXRhKTtcblxuICByZXR1cm4ge1xuICAgIHNlc3Npb25EYXRhLFxuICAgIGNyZWF0ZVNlc3Npb246ICgpID0+XG4gICAgICBuZXcgUmVzdFdyaXRlKGNvbmZpZywgQXV0aC5tYXN0ZXIoY29uZmlnKSwgJ19TZXNzaW9uJywgbnVsbCwgc2Vzc2lvbkRhdGEpLmV4ZWN1dGUoKSxcbiAgfTtcbn07XG5cbi8vIERlbGV0ZSBlbWFpbCByZXNldCB0b2tlbnMgaWYgdXNlciBpcyBjaGFuZ2luZyBwYXNzd29yZCBvciBlbWFpbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCB0aGlzLnF1ZXJ5ID09PSBudWxsKSB7XG4gICAgLy8gbnVsbCBxdWVyeSBtZWFucyBjcmVhdGVcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoJ3Bhc3N3b3JkJyBpbiB0aGlzLmRhdGEgfHwgJ2VtYWlsJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBhZGRPcHMgPSB7XG4gICAgICBfcGVyaXNoYWJsZV90b2tlbjogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgICAgX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgIH07XG4gICAgdGhpcy5kYXRhID0gT2JqZWN0LmFzc2lnbih0aGlzLmRhdGEsIGFkZE9wcyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gT25seSBmb3IgX1Nlc3Npb24sIGFuZCBhdCBjcmVhdGlvbiB0aW1lXG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPSAnX1Nlc3Npb24nIHx8IHRoaXMucXVlcnkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRGVzdHJveSB0aGUgc2Vzc2lvbnMgaW4gJ0JhY2tncm91bmQnXG4gIGNvbnN0IHsgdXNlciwgaW5zdGFsbGF0aW9uSWQsIHNlc3Npb25Ub2tlbiB9ID0gdGhpcy5kYXRhO1xuICBpZiAoIXVzZXIgfHwgIWluc3RhbGxhdGlvbklkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghdXNlci5vYmplY3RJZCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KFxuICAgICdfU2Vzc2lvbicsXG4gICAge1xuICAgICAgdXNlcixcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgc2Vzc2lvblRva2VuOiB7ICRuZTogc2Vzc2lvblRva2VuIH0sXG4gICAgfSxcbiAgICB7fSxcbiAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICApO1xufTtcblxuLy8gSGFuZGxlcyBhbnkgZm9sbG93dXAgbG9naWNcblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlRm9sbG93dXAgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gJiYgdGhpcy5jb25maWcucmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCkge1xuICAgIHZhciBzZXNzaW9uUXVlcnkgPSB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH07XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddO1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmRlc3Ryb3koJ19TZXNzaW9uJywgc2Vzc2lvblF1ZXJ5KVxuICAgICAgLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddO1xuICAgIC8vIEZpcmUgYW5kIGZvcmdldCFcbiAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodGhpcy5kYXRhKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfU2Vzc2lvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIF9TZXNzaW9uIG9iamVjdC5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlU2Vzc2lvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgfHwgdGhpcy5jbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXRoaXMuYXV0aC51c2VyICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnU2Vzc2lvbiB0b2tlbiByZXF1aXJlZC4nKTtcbiAgfVxuXG4gIC8vIFRPRE86IFZlcmlmeSBwcm9wZXIgZXJyb3IgdG8gdGhyb3dcbiAgaWYgKHRoaXMuZGF0YS5BQ0wpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ0Nhbm5vdCBzZXQgJyArICdBQ0wgb24gYSBTZXNzaW9uLicpO1xuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICBpZiAodGhpcy5kYXRhLnVzZXIgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiB0aGlzLmRhdGEudXNlci5vYmplY3RJZCAhPSB0aGlzLmF1dGgudXNlci5pZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5kYXRhKSB7XG4gICAgICBpZiAoa2V5ID09PSAnb2JqZWN0SWQnIHx8IGtleSA9PT0gJ3VzZXInKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhW2tleV0gPSB0aGlzLmRhdGFba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZScsXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNyZWF0ZVNlc3Npb24oKS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKCFyZXN1bHRzLnJlc3BvbnNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdFcnJvciBjcmVhdGluZyBzZXNzaW9uLicpO1xuICAgICAgfVxuICAgICAgc2Vzc2lvbkRhdGFbJ29iamVjdElkJ10gPSByZXN1bHRzLnJlc3BvbnNlWydvYmplY3RJZCddO1xuICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgIGxvY2F0aW9uOiByZXN1bHRzLmxvY2F0aW9uLFxuICAgICAgICByZXNwb25zZTogc2Vzc2lvbkRhdGEsXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfSW5zdGFsbGF0aW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gaW5zdGFsbGF0aW9uIG9iamVjdC5cbi8vIElmIGFuIGluc3RhbGxhdGlvbiBpcyBmb3VuZCwgdGhpcyBjYW4gbXV0YXRlIHRoaXMucXVlcnkgYW5kIHR1cm4gYSBjcmVhdGVcbi8vIGludG8gYW4gdXBkYXRlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVJbnN0YWxsYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX0luc3RhbGxhdGlvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoXG4gICAgIXRoaXMucXVlcnkgJiZcbiAgICAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICF0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWRcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgMTM1LFxuICAgICAgJ2F0IGxlYXN0IG9uZSBJRCBmaWVsZCAoZGV2aWNlVG9rZW4sIGluc3RhbGxhdGlvbklkKSAnICsgJ211c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJ1xuICAgICk7XG4gIH1cblxuICAvLyBJZiB0aGUgZGV2aWNlIHRva2VuIGlzIDY0IGNoYXJhY3RlcnMgbG9uZywgd2UgYXNzdW1lIGl0IGlzIGZvciBpT1NcbiAgLy8gYW5kIGxvd2VyY2FzZSBpdC5cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4ubGVuZ3RoID09IDY0KSB7XG4gICAgdGhpcy5kYXRhLmRldmljZVRva2VuID0gdGhpcy5kYXRhLmRldmljZVRva2VuLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBXZSBsb3dlcmNhc2UgdGhlIGluc3RhbGxhdGlvbklkIGlmIHByZXNlbnRcbiAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgbGV0IGluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkO1xuXG4gIC8vIElmIGRhdGEuaW5zdGFsbGF0aW9uSWQgaXMgbm90IHNldCBhbmQgd2UncmUgbm90IG1hc3Rlciwgd2UgY2FuIGxvb2t1cCBpbiBhdXRoXG4gIGlmICghaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGluc3RhbGxhdGlvbklkID0gdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gVXBkYXRpbmcgX0luc3RhbGxhdGlvbiBidXQgbm90IHVwZGF0aW5nIGFueXRoaW5nIGNyaXRpY2FsXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgdmFyIGlkTWF0Y2g7IC8vIFdpbGwgYmUgYSBtYXRjaCBvbiBlaXRoZXIgb2JqZWN0SWQgb3IgaW5zdGFsbGF0aW9uSWRcbiAgdmFyIG9iamVjdElkTWF0Y2g7XG4gIHZhciBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICB2YXIgZGV2aWNlVG9rZW5NYXRjaGVzID0gW107XG5cbiAgLy8gSW5zdGVhZCBvZiBpc3N1aW5nIDMgcmVhZHMsIGxldCdzIGRvIGl0IHdpdGggb25lIE9SLlxuICBjb25zdCBvclF1ZXJpZXMgPSBbXTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIG9iamVjdElkOiB0aGlzLnF1ZXJ5Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcbiAgfVxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goeyBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuIH0pO1xuICB9XG5cbiAgaWYgKG9yUXVlcmllcy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByb21pc2UgPSBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfSW5zdGFsbGF0aW9uJyxcbiAgICAgICAge1xuICAgICAgICAgICRvcjogb3JRdWVyaWVzLFxuICAgICAgICB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgcmVzdWx0Lm9iamVjdElkID09IHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBvYmplY3RJZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuaW5zdGFsbGF0aW9uSWQgPT0gaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuZGV2aWNlVG9rZW4gPT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNhbml0eSBjaGVja3Mgd2hlbiBydW5uaW5nIGEgcXVlcnlcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKCFvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kIGZvciB1cGRhdGUuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgIT09IG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2luc3RhbGxhdGlvbklkIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgIW9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2RldmljZVRva2VuIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUeXBlXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUeXBlIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiBvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBvYmplY3RJZE1hdGNoO1xuICAgICAgfVxuXG4gICAgICBpZiAoaW5zdGFsbGF0aW9uSWQgJiYgaW5zdGFsbGF0aW9uSWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIG5lZWQgdG8gc3BlY2lmeSBkZXZpY2VUeXBlIG9ubHkgaWYgaXQncyBuZXdcbiAgICAgIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUgJiYgIWlkTWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNSwgJ2RldmljZVR5cGUgbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICghaWRNYXRjaCkge1xuICAgICAgICBpZiAoIWRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmXG4gICAgICAgICAgKCFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10gfHwgIWluc3RhbGxhdGlvbklkKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBTaW5nbGUgbWF0Y2ggb24gZGV2aWNlIHRva2VuIGJ1dCBub25lIG9uIGluc3RhbGxhdGlvbklkLCBhbmQgZWl0aGVyXG4gICAgICAgICAgLy8gdGhlIHBhc3NlZCBvYmplY3Qgb3IgdGhlIG1hdGNoIGlzIG1pc3NpbmcgYW4gaW5zdGFsbGF0aW9uSWQsIHNvIHdlXG4gICAgICAgICAgLy8gY2FuIGp1c3QgcmV0dXJuIHRoZSBtYXRjaC5cbiAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzIsXG4gICAgICAgICAgICAnTXVzdCBzcGVjaWZ5IGluc3RhbGxhdGlvbklkIHdoZW4gZGV2aWNlVG9rZW4gJyArXG4gICAgICAgICAgICAgICdtYXRjaGVzIG11bHRpcGxlIEluc3RhbGxhdGlvbiBvYmplY3RzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTXVsdGlwbGUgZGV2aWNlIHRva2VuIG1hdGNoZXMgYW5kIHdlIHNwZWNpZmllZCBhbiBpbnN0YWxsYXRpb24gSUQsXG4gICAgICAgICAgLy8gb3IgYSBzaW5nbGUgbWF0Y2ggd2hlcmUgYm90aCB0aGUgcGFzc2VkIGFuZCBtYXRjaGluZyBvYmplY3RzIGhhdmVcbiAgICAgICAgICAvLyBhbiBpbnN0YWxsYXRpb24gSUQuIFRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaFxuICAgICAgICAgIC8vIHRoZSBkZXZpY2VUb2tlbiwgYW5kIHJldHVybiBuaWwgdG8gc2lnbmFsIHRoYXQgYSBuZXcgb2JqZWN0IHNob3VsZFxuICAgICAgICAgIC8vIGJlIGNyZWF0ZWQuXG4gICAgICAgICAgdmFyIGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiB7XG4gICAgICAgICAgICAgICRuZTogaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJiAhZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydpbnN0YWxsYXRpb25JZCddKSB7XG4gICAgICAgICAgLy8gRXhhY3RseSBvbmUgZGV2aWNlIHRva2VuIG1hdGNoIGFuZCBpdCBkb2Vzbid0IGhhdmUgYW4gaW5zdGFsbGF0aW9uXG4gICAgICAgICAgLy8gSUQuIFRoaXMgaXMgdGhlIG9uZSBjYXNlIHdoZXJlIHdlIHdhbnQgdG8gbWVyZ2Ugd2l0aCB0aGUgZXhpc3RpbmdcbiAgICAgICAgICAvLyBvYmplY3QuXG4gICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7IG9iamVjdElkOiBpZE1hdGNoLm9iamVjdElkIH07XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgICAuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgaWRNYXRjaC5kZXZpY2VUb2tlbiAhPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIHNldHRpbmcgdGhlIGRldmljZSB0b2tlbiBvbiBhbiBleGlzdGluZyBpbnN0YWxsYXRpb24sIHNvXG4gICAgICAgICAgICAvLyB3ZSBzaG91bGQgdHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoIHRoaXNcbiAgICAgICAgICAgIC8vIGRldmljZSB0b2tlbi5cbiAgICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIC8vIFdlIGhhdmUgYSB1bmlxdWUgaW5zdGFsbCBJZCwgdXNlIHRoYXQgdG8gcHJlc2VydmVcbiAgICAgICAgICAgIC8vIHRoZSBpbnRlcmVzdGluZyBpbnN0YWxsYXRpb25cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2luc3RhbGxhdGlvbklkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkID09IHRoaXMuZGF0YS5vYmplY3RJZFxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIHdlIHBhc3NlZCBhbiBvYmplY3RJZCwgcHJlc2VydmUgdGhhdCBpbnN0YWxhdGlvblxuICAgICAgICAgICAgICBkZWxRdWVyeVsnb2JqZWN0SWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IGlkTWF0Y2gub2JqZWN0SWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBXaGF0IHRvIGRvIGhlcmU/IGNhbid0IHJlYWxseSBjbGVhbiB1cCBldmVyeXRoaW5nLi4uXG4gICAgICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEluIG5vbi1tZXJnZSBzY2VuYXJpb3MsIGp1c3QgcmV0dXJuIHRoZSBpbnN0YWxsYXRpb24gbWF0Y2ggaWRcbiAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4ob2JqSWQgPT4ge1xuICAgICAgaWYgKG9iaklkKSB7XG4gICAgICAgIHRoaXMucXVlcnkgPSB7IG9iamVjdElkOiBvYmpJZCB9O1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcbiAgICAgIH1cbiAgICAgIC8vIFRPRE86IFZhbGlkYXRlIG9wcyAoYWRkL3JlbW92ZSBvbiBjaGFubmVscywgJGluYyBvbiBiYWRnZSwgZXRjLilcbiAgICB9KTtcbiAgcmV0dXJuIHByb21pc2U7XG59O1xuXG4vLyBJZiB3ZSBzaG9ydC1jaXJjdWl0ZWQgdGhlIG9iamVjdCByZXNwb25zZSAtIHRoZW4gd2UgbmVlZCB0byBtYWtlIHN1cmUgd2UgZXhwYW5kIGFsbCB0aGUgZmlsZXMsXG4vLyBzaW5jZSB0aGlzIG1pZ2h0IG5vdCBoYXZlIGEgcXVlcnksIG1lYW5pbmcgaXQgd29uJ3QgcmV0dXJuIHRoZSBmdWxsIHJlc3VsdCBiYWNrLlxuLy8gVE9ETzogKG5sdXRzZW5rbykgVGhpcyBzaG91bGQgZGllIHdoZW4gd2UgbW92ZSB0byBwZXItY2xhc3MgYmFzZWQgY29udHJvbGxlcnMgb24gX1Nlc3Npb24vX1VzZXJcblJlc3RXcml0ZS5wcm90b3R5cGUuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENoZWNrIHdoZXRoZXIgd2UgaGF2ZSBhIHNob3J0LWNpcmN1aXRlZCByZXNwb25zZSAtIG9ubHkgdGhlbiBydW4gZXhwYW5zaW9uLlxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkRhdGFiYXNlT3BlcmF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Sb2xlJykge1xuICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci5yb2xlLmNsZWFyKCk7XG4gICAgaWYgKHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIpIHtcbiAgICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuY2xlYXJDYWNoZWRSb2xlcyh0aGlzLmF1dGgudXNlcik7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmIHRoaXMucXVlcnkgJiYgdGhpcy5hdXRoLmlzVW5hdXRoZW50aWNhdGVkKCkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5TRVNTSU9OX01JU1NJTkcsXG4gICAgICBgQ2Fubm90IG1vZGlmeSB1c2VyICR7dGhpcy5xdWVyeS5vYmplY3RJZH0uYFxuICAgICk7XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUHJvZHVjdCcgJiYgdGhpcy5kYXRhLmRvd25sb2FkKSB7XG4gICAgdGhpcy5kYXRhLmRvd25sb2FkTmFtZSA9IHRoaXMuZGF0YS5kb3dubG9hZC5uYW1lO1xuICB9XG5cbiAgLy8gVE9ETzogQWRkIGJldHRlciBkZXRlY3Rpb24gZm9yIEFDTCwgZW5zdXJpbmcgYSB1c2VyIGNhbid0IGJlIGxvY2tlZCBmcm9tXG4gIC8vICAgICAgIHRoZWlyIG93biB1c2VyIHJlY29yZC5cbiAgaWYgKHRoaXMuZGF0YS5BQ0wgJiYgdGhpcy5kYXRhLkFDTFsnKnVucmVzb2x2ZWQnXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0FDTCwgJ0ludmFsaWQgQUNMLicpO1xuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAvLyBGb3JjZSB0aGUgdXNlciB0byBub3QgbG9ja291dFxuICAgIC8vIE1hdGNoZWQgd2l0aCBwYXJzZS5jb21cbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiYgdGhpcy5kYXRhLkFDTCAmJiB0aGlzLmF1dGguaXNNYXN0ZXIgIT09IHRydWUpIHtcbiAgICAgIHRoaXMuZGF0YS5BQ0xbdGhpcy5xdWVyeS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgfVxuICAgIC8vIHVwZGF0ZSBwYXNzd29yZCB0aW1lc3RhbXAgaWYgdXNlciBwYXNzd29yZCBpcyBiZWluZyBjaGFuZ2VkXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgfVxuICAgIC8vIElnbm9yZSBjcmVhdGVkQXQgd2hlbiB1cGRhdGVcbiAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgIGxldCBkZWZlciA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIC8vIGlmIHBhc3N3b3JkIGhpc3RvcnkgaXMgZW5hYmxlZCB0aGVuIHNhdmUgdGhlIGN1cnJlbnQgcGFzc3dvcmQgdG8gaGlzdG9yeVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICkge1xuICAgICAgZGVmZXIgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfVxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vbi0xIHBhc3N3b3JkcyBnbyBpbnRvIGhpc3RvcnkgaW5jbHVkaW5nIGxhc3QgcGFzc3dvcmRcbiAgICAgICAgICB3aGlsZSAoXG4gICAgICAgICAgICBvbGRQYXNzd29yZHMubGVuZ3RoID4gTWF0aC5tYXgoMCwgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IC0gMilcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3Jkcy5zaGlmdCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2hpc3RvcnkgPSBvbGRQYXNzd29yZHM7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBkZWZlci50aGVuKCgpID0+IHtcbiAgICAgIC8vIFJ1biBhbiB1cGRhdGVcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAudXBkYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICByZXNwb25zZS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgICB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKHJlc3BvbnNlLCB0aGlzLmRhdGEpO1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3BvbnNlIH07XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIC8vIFNldCB0aGUgZGVmYXVsdCBBQ0wgYW5kIHBhc3N3b3JkIHRpbWVzdGFtcCBmb3IgdGhlIG5ldyBfVXNlclxuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgdmFyIEFDTCA9IHRoaXMuZGF0YS5BQ0w7XG4gICAgICAvLyBkZWZhdWx0IHB1YmxpYyByL3cgQUNMXG4gICAgICBpZiAoIUFDTCkge1xuICAgICAgICBBQ0wgPSB7fTtcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5lbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgICAgICAgQUNMWycqJ10gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBtYWtlIHN1cmUgdGhlIHVzZXIgaXMgbm90IGxvY2tlZCBkb3duXG4gICAgICBBQ0xbdGhpcy5kYXRhLm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICAgIHRoaXMuZGF0YS5BQ0wgPSBBQ0w7XG4gICAgICAvLyBwYXNzd29yZCB0aW1lc3RhbXAgdG8gYmUgdXNlZCB3aGVuIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3kgaXMgZW5mb3JjZWRcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJ1biBhIGNyZWF0ZVxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmNyZWF0ZSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5kYXRhLCB0aGlzLnJ1bk9wdGlvbnMsIGZhbHNlLCB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlcilcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCBlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFF1aWNrIGNoZWNrLCBpZiB3ZSB3ZXJlIGFibGUgdG8gaW5mZXIgdGhlIGR1cGxpY2F0ZWQgZmllbGQgbmFtZVxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ3VzZXJuYW1lJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ2VtYWlsJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoaXMgd2FzIGEgZmFpbGVkIHVzZXIgY3JlYXRpb24gZHVlIHRvIHVzZXJuYW1lIG9yIGVtYWlsIGFscmVhZHkgdGFrZW4sIHdlIG5lZWQgdG9cbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciBpdCB3YXMgdXNlcm5hbWUgb3IgZW1haWwgYW5kIHJldHVybiB0aGUgYXBwcm9wcmlhdGUgZXJyb3IuXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICAgICAgLy8gVE9ETzogU2VlIGlmIHdlIGNhbiBsYXRlciBkbyB0aGlzIHdpdGhvdXQgYWRkaXRpb25hbCBxdWVyaWVzIGJ5IHVzaW5nIG5hbWVkIGluZGV4ZXMuXG4gICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgIC5maW5kKFxuICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0gfSxcbiAgICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5vYmplY3RJZCA9IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgcmVzcG9uc2UuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgICAgICBpZiAodGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSkge1xuICAgICAgICAgIHJlc3BvbnNlLnVzZXJuYW1lID0gdGhpcy5kYXRhLnVzZXJuYW1lO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIG5vdGhpbmcgLSBkb2Vzbid0IHdhaXQgZm9yIHRoZSB0cmlnZ2VyLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5BZnRlclNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UgfHwgIXRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlclNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyU2F2ZUhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGNvbnN0IGhhc0xpdmVRdWVyeSA9IHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuaGFzTGl2ZVF1ZXJ5KHRoaXMuY2xhc3NOYW1lKTtcbiAgaWYgKCFoYXNBZnRlclNhdmVIb29rICYmICFoYXNMaXZlUXVlcnkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIHVwZGF0ZWRPYmplY3QuX2hhbmRsZVNhdmVSZXNwb25zZSh0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLCB0aGlzLnJlc3BvbnNlLnN0YXR1cyB8fCAyMDApO1xuXG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgIC8vIE5vdGlmaXkgTGl2ZVF1ZXJ5U2VydmVyIGlmIHBvc3NpYmxlXG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyh1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSk7XG4gICAgdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5vbkFmdGVyU2F2ZShcbiAgICAgIHVwZGF0ZWRPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgcGVybXNcbiAgICApO1xuICB9KTtcblxuICAvLyBSdW4gYWZ0ZXJTYXZlIHRyaWdnZXJcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICBjb25zdCBqc29uUmV0dXJuZWQgPSByZXN1bHQgJiYgIXJlc3VsdC5fdG9GdWxsSlNPTjtcbiAgICAgIGlmIChqc29uUmV0dXJuZWQpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nT3BzID0ge307XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSByZXN1bHQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlID0gdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShcbiAgICAgICAgICAocmVzdWx0IHx8IHVwZGF0ZWRPYmplY3QpLnRvSlNPTigpLFxuICAgICAgICAgIHRoaXMuZGF0YVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pXG4gICAgLmNhdGNoKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIGxvZ2dlci53YXJuKCdhZnRlclNhdmUgY2F1Z2h0IGFuIGVycm9yJywgZXJyKTtcbiAgICB9KTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGZpZ3VyZSBvdXQgd2hhdCBsb2NhdGlvbiB0aGlzIG9wZXJhdGlvbiBoYXBwZW5zIGF0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5sb2NhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG1pZGRsZSA9IHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInID8gJy91c2Vycy8nIDogJy9jbGFzc2VzLycgKyB0aGlzLmNsYXNzTmFtZSArICcvJztcbiAgY29uc3QgbW91bnQgPSB0aGlzLmNvbmZpZy5tb3VudCB8fCB0aGlzLmNvbmZpZy5zZXJ2ZXJVUkw7XG4gIHJldHVybiBtb3VudCArIG1pZGRsZSArIHRoaXMuZGF0YS5vYmplY3RJZDtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCB0aGUgb2JqZWN0IGlkIGZvciB0aGlzIG9wZXJhdGlvbi5cbi8vIEJlY2F1c2UgaXQgY291bGQgYmUgZWl0aGVyIG9uIHRoZSBxdWVyeSBvciBvbiB0aGUgZGF0YVxuUmVzdFdyaXRlLnByb3RvdHlwZS5vYmplY3RJZCA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuZGF0YS5vYmplY3RJZCB8fCB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xufTtcblxuLy8gUmV0dXJucyBhIGNvcHkgb2YgdGhlIGRhdGEgYW5kIGRlbGV0ZSBiYWQga2V5cyAoX2F1dGhfZGF0YSwgX2hhc2hlZF9wYXNzd29yZC4uLilcblJlc3RXcml0ZS5wcm90b3R5cGUuc2FuaXRpemVkRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZGF0YSA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKChkYXRhLCBrZXkpID0+IHtcbiAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgaWYgKCEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuICByZXR1cm4gUGFyc2UuX2RlY29kZSh1bmRlZmluZWQsIGRhdGEpO1xufTtcblxuLy8gUmV0dXJucyBhbiB1cGRhdGVkIGNvcHkgb2YgdGhlIG9iamVjdFxuUmVzdFdyaXRlLnByb3RvdHlwZS5idWlsZFBhcnNlT2JqZWN0cyA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lLCBvYmplY3RJZDogdGhpcy5xdWVyeT8ub2JqZWN0SWQgfTtcbiAgbGV0IG9yaWdpbmFsT2JqZWN0O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgY29uc3QgY2xhc3NOYW1lID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKGV4dHJhRGF0YSk7XG4gIGNvbnN0IHJlYWRPbmx5QXR0cmlidXRlcyA9IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXNcbiAgICA/IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXMoKVxuICAgIDogW107XG4gIGlmICghdGhpcy5vcmlnaW5hbERhdGEpIHtcbiAgICBmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiByZWFkT25seUF0dHJpYnV0ZXMpIHtcbiAgICAgIGV4dHJhRGF0YVthdHRyaWJ1dGVdID0gdGhpcy5kYXRhW2F0dHJpYnV0ZV07XG4gICAgfVxuICB9XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZShmdW5jdGlvbiAoZGF0YSwga2V5KSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGFba2V5XS5fX29wID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXJlYWRPbmx5QXR0cmlidXRlcy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQoa2V5LCBkYXRhW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBzdWJkb2N1bWVudCBrZXkgd2l0aCBkb3Qgbm90YXRpb24geyAneC55JzogdiB9ID0+IHsgJ3gnOiB7ICd5JyA6IHYgfSB9KVxuICAgICAgICBjb25zdCBzcGxpdHRlZEtleSA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBwYXJlbnRQcm9wID0gc3BsaXR0ZWRLZXlbMF07XG4gICAgICAgIGxldCBwYXJlbnRWYWwgPSB1cGRhdGVkT2JqZWN0LmdldChwYXJlbnRQcm9wKTtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXJlbnRWYWwgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGFyZW50VmFsID0ge307XG4gICAgICAgIH1cbiAgICAgICAgcGFyZW50VmFsW3NwbGl0dGVkS2V5WzFdXSA9IGRhdGFba2V5XTtcbiAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQocGFyZW50UHJvcCwgcGFyZW50VmFsKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcblxuICBjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLnNhbml0aXplZERhdGEoKTtcbiAgZm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgcmVhZE9ubHlBdHRyaWJ1dGVzKSB7XG4gICAgZGVsZXRlIHNhbml0aXplZFthdHRyaWJ1dGVdO1xuICB9XG4gIHVwZGF0ZWRPYmplY3Quc2V0KHNhbml0aXplZCk7XG4gIHJldHVybiB7IHVwZGF0ZWRPYmplY3QsIG9yaWdpbmFsT2JqZWN0IH07XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNsZWFuVXNlckF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3QgdXNlciA9IHRoaXMucmVzcG9uc2UucmVzcG9uc2U7XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSA9IGZ1bmN0aW9uIChyZXNwb25zZSwgZGF0YSkge1xuICBjb25zdCB7IHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKHVwZGF0ZWRPYmplY3QuX2dldFN0YXRlSWRlbnRpZmllcigpKTtcbiAgZm9yIChjb25zdCBrZXkgaW4gdGhpcy5wZW5kaW5nT3BzKSB7XG4gICAgaWYgKCFwZW5kaW5nW2tleV0pIHtcbiAgICAgIGRhdGFba2V5XSA9IHRoaXMub3JpZ2luYWxEYXRhID8gdGhpcy5vcmlnaW5hbERhdGFba2V5XSA6IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goa2V5KTtcbiAgICB9XG4gIH1cbiAgY29uc3Qgc2tpcEtleXMgPSBbXG4gICAgJ29iamVjdElkJyxcbiAgICAnY3JlYXRlZEF0JyxcbiAgICAndXBkYXRlZEF0JyxcbiAgICAuLi4ocmVxdWlyZWRDb2x1bW5zLnJlYWRbdGhpcy5jbGFzc05hbWVdIHx8IFtdKSxcbiAgXTtcbiAgZm9yIChjb25zdCBrZXkgaW4gcmVzcG9uc2UpIHtcbiAgICBpZiAoc2tpcEtleXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHZhbHVlID0gcmVzcG9uc2Vba2V5XTtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCB8fCAodmFsdWUuX190eXBlICYmIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB8fCBkYXRhW2tleV0gPT09IHZhbHVlKSB7XG4gICAgICBkZWxldGUgcmVzcG9uc2Vba2V5XTtcbiAgICB9XG4gIH1cbiAgaWYgKF8uaXNFbXB0eSh0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlcikpIHtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cbiAgY29uc3QgY2xpZW50U3VwcG9ydHNEZWxldGUgPSBDbGllbnRTREsuc3VwcG9ydHNGb3J3YXJkRGVsZXRlKHRoaXMuY2xpZW50U0RLKTtcbiAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGNvbnN0IGRhdGFWYWx1ZSA9IGRhdGFbZmllbGROYW1lXTtcblxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3BvbnNlLCBmaWVsZE5hbWUpKSB7XG4gICAgICByZXNwb25zZVtmaWVsZE5hbWVdID0gZGF0YVZhbHVlO1xuICAgIH1cblxuICAgIC8vIFN0cmlwcyBvcGVyYXRpb25zIGZyb20gcmVzcG9uc2VzXG4gICAgaWYgKHJlc3BvbnNlW2ZpZWxkTmFtZV0gJiYgcmVzcG9uc2VbZmllbGROYW1lXS5fX29wKSB7XG4gICAgICBkZWxldGUgcmVzcG9uc2VbZmllbGROYW1lXTtcbiAgICAgIGlmIChjbGllbnRTdXBwb3J0c0RlbGV0ZSAmJiBkYXRhVmFsdWUuX19vcCA9PSAnRGVsZXRlJykge1xuICAgICAgICByZXNwb25zZVtmaWVsZE5hbWVdID0gZGF0YVZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIHJldHVybiByZXNwb25zZTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFJlc3RXcml0ZTtcbm1vZHVsZS5leHBvcnRzID0gUmVzdFdyaXRlO1xuIl19