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

const util = require('util');

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
  if (this.response || this.runOptions.many) {
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

    if (!this.auth.isMaster) {
      this.query = {
        $and: [this.query, {
          user: {
            __type: 'Pointer',
            className: '_User',
            objectId: this.auth.user.id
          }
        }]
      };
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
  if (!this.response || !this.response.response || this.runOptions.many) {
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

  const skipKeys = [...(_SchemaController.requiredColumns.read[this.className] || [])];

  if (!this.query) {
    skipKeys.push('objectId', 'createdAt');
  } else {
    skipKeys.push('updatedAt');
    delete response.objectId;
  }

  for (const key in response) {
    if (skipKeys.includes(key)) {
      continue;
    }

    const value = response[key];

    if (value == null || value.__type && value.__type === 'Pointer' || util.isDeepStrictEqual(data[key], value) || util.isDeepStrictEqual((this.originalData || {})[key], value)) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJkZWVwY29weSIsIkF1dGgiLCJVdGlscyIsImNyeXB0b1V0aWxzIiwicGFzc3dvcmRDcnlwdG8iLCJQYXJzZSIsInRyaWdnZXJzIiwiQ2xpZW50U0RLIiwidXRpbCIsIlJlc3RXcml0ZSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJxdWVyeSIsImRhdGEiLCJvcmlnaW5hbERhdGEiLCJjbGllbnRTREsiLCJjb250ZXh0IiwiYWN0aW9uIiwiaXNSZWFkT25seSIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInN0b3JhZ2UiLCJydW5PcHRpb25zIiwiYWxsb3dDdXN0b21PYmplY3RJZCIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm9iamVjdElkIiwiTUlTU0lOR19PQkpFQ1RfSUQiLCJJTlZBTElEX0tFWV9OQU1FIiwiaWQiLCJyZXF1ZXN0S2V5d29yZERlbnlsaXN0Iiwia2V5d29yZCIsIm1hdGNoIiwib2JqZWN0Q29udGFpbnNLZXlWYWx1ZSIsImtleSIsInZhbHVlIiwiSlNPTiIsInN0cmluZ2lmeSIsInJlc3BvbnNlIiwidXBkYXRlZEF0IiwiX2VuY29kZSIsIkRhdGUiLCJpc28iLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJwZW5kaW5nT3BzIiwiZXhlY3V0ZSIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImdldFVzZXJBbmRSb2xlQUNMIiwidmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uIiwiaGFuZGxlSW5zdGFsbGF0aW9uIiwiaGFuZGxlU2Vzc2lvbiIsInZhbGlkYXRlQXV0aERhdGEiLCJydW5CZWZvcmVTYXZlVHJpZ2dlciIsImVuc3VyZVVuaXF1ZUF1dGhEYXRhSWQiLCJkZWxldGVFbWFpbFJlc2V0VG9rZW5JZk5lZWRlZCIsInZhbGlkYXRlU2NoZW1hIiwic2NoZW1hQ29udHJvbGxlciIsInNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQiLCJ0cmFuc2Zvcm1Vc2VyIiwiZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMiLCJkZXN0cm95RHVwbGljYXRlZFNlc3Npb25zIiwicnVuRGF0YWJhc2VPcGVyYXRpb24iLCJjcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCIsImhhbmRsZUZvbGxvd3VwIiwicnVuQWZ0ZXJTYXZlVHJpZ2dlciIsImNsZWFuVXNlckF1dGhEYXRhIiwiYXV0aERhdGFSZXNwb25zZSIsImlzTWFzdGVyIiwiYWNsIiwidXNlciIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwiY29uY2F0IiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImluZGV4T2YiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJoYXNDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwibWFueSIsInRyaWdnZXJFeGlzdHMiLCJUeXBlcyIsImJlZm9yZVNhdmUiLCJhcHBsaWNhdGlvbklkIiwib3JpZ2luYWxPYmplY3QiLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRQYXJzZU9iamVjdHMiLCJzdGF0ZUNvbnRyb2xsZXIiLCJDb3JlTWFuYWdlciIsImdldE9iamVjdFN0YXRlQ29udHJvbGxlciIsInBlbmRpbmciLCJnZXRQZW5kaW5nT3BzIiwiX2dldFN0YXRlSWRlbnRpZmllciIsImRhdGFiYXNlUHJvbWlzZSIsInVwZGF0ZSIsImNyZWF0ZSIsInJlc3VsdCIsImxlbmd0aCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJtYXliZVJ1blRyaWdnZXIiLCJvYmplY3QiLCJmaWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIiwiXyIsInJlZHVjZSIsImlzRXF1YWwiLCJwdXNoIiwicnVuQmVmb3JlTG9naW5UcmlnZ2VyIiwidXNlckRhdGEiLCJiZWZvcmVMb2dpbiIsImV4dHJhRGF0YSIsImZpbGVzQ29udHJvbGxlciIsImV4cGFuZEZpbGVzSW5PYmplY3QiLCJpbmZsYXRlIiwiZ2V0QWxsQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJzY2hlbWEiLCJmaW5kIiwib25lQ2xhc3MiLCJzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQiLCJmaWVsZE5hbWUiLCJzZXREZWZhdWx0IiwidW5kZWZpbmVkIiwiX19vcCIsImZpZWxkcyIsImRlZmF1bHRWYWx1ZSIsInJlcXVpcmVkIiwiVkFMSURBVElPTl9FUlJPUiIsImNyZWF0ZWRBdCIsIm5ld09iamVjdElkIiwib2JqZWN0SWRTaXplIiwia2V5cyIsImZvckVhY2giLCJhdXRoRGF0YSIsImhhc1VzZXJuYW1lQW5kUGFzc3dvcmQiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiaXNFbXB0eSIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInByb3ZpZGVycyIsImNhbkhhbmRsZUF1dGhEYXRhIiwic29tZSIsInByb3ZpZGVyIiwicHJvdmlkZXJBdXRoRGF0YSIsImhhc1Rva2VuIiwiZ2V0VXNlcklkIiwiaGFuZGxlQXV0aERhdGEiLCJmaWx0ZXJlZE9iamVjdHNCeUFDTCIsIm9iamVjdHMiLCJmaWx0ZXIiLCJBQ0wiLCJoYXNBdXRoRGF0YUlkIiwiciIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsInJlc3VsdHMiLCJBQ0NPVU5UX0FMUkVBRFlfTElOS0VEIiwidXNlcklkIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwidmFsaWRhdGVkQXV0aERhdGEiLCJ1c2VyUmVzdWx0IiwiYXV0aFByb3ZpZGVyIiwiam9pbiIsImhhc011dGF0ZWRBdXRoRGF0YSIsIm11dGF0ZWRBdXRoRGF0YSIsImlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3RlciIsImlzTG9naW4iLCJsb2NhdGlvbiIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIiwicmVzIiwicHJvbWlzZSIsImVycm9yIiwiUmVzdFF1ZXJ5IiwibWFzdGVyIiwiX190eXBlIiwic2Vzc2lvbiIsImNhY2hlQ29udHJvbGxlciIsImRlbCIsInNlc3Npb25Ub2tlbiIsIl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwiaGFzaCIsImhhc2hlZFBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsIl92YWxpZGF0ZVVzZXJOYW1lIiwiX3ZhbGlkYXRlRW1haWwiLCJyYW5kb21TdHJpbmciLCJyZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSIsIiRuZSIsImxpbWl0IiwiY2FzZUluc2Vuc2l0aXZlIiwiVVNFUk5BTUVfVEFLRU4iLCJlbWFpbCIsInJlamVjdCIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsIkVNQUlMX1RBS0VOIiwidXNlckNvbnRyb2xsZXIiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwicGFzc3dvcmRQb2xpY3kiLCJfdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cyIsIl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSIsInBvbGljeUVycm9yIiwidmFsaWRhdGlvbkVycm9yIiwiY29udGFpbnNVc2VybmFtZUVycm9yIiwicGF0dGVyblZhbGlkYXRvciIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5Iiwib2xkUGFzc3dvcmRzIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJ0YWtlIiwibmV3UGFzc3dvcmQiLCJwcm9taXNlcyIsIm1hcCIsImNvbXBhcmUiLCJhbGwiLCJjYXRjaCIsImVyciIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJ2ZXJpZnlVc2VyRW1haWxzIiwiY3JlYXRlU2Vzc2lvblRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJjcmVhdGVkV2l0aCIsImFkZGl0aW9uYWxTZXNzaW9uRGF0YSIsInRva2VuIiwibmV3VG9rZW4iLCJleHBpcmVzQXQiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJhc3NpZ24iLCJhZGRPcHMiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJkZXN0cm95IiwicmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCIsInNlc3Npb25RdWVyeSIsImJpbmQiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCIkYW5kIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwic3RhdHVzIiwiZGV2aWNlVG9rZW4iLCJ0b0xvd2VyQ2FzZSIsImRldmljZVR5cGUiLCJpZE1hdGNoIiwib2JqZWN0SWRNYXRjaCIsImluc3RhbGxhdGlvbklkTWF0Y2giLCJkZXZpY2VUb2tlbk1hdGNoZXMiLCJvclF1ZXJpZXMiLCIkb3IiLCJkZWxRdWVyeSIsImFwcElkZW50aWZpZXIiLCJjb2RlIiwib2JqSWQiLCJyb2xlIiwiY2xlYXIiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiY2xlYXJDYWNoZWRSb2xlcyIsImlzVW5hdXRoZW50aWNhdGVkIiwiU0VTU0lPTl9NSVNTSU5HIiwiZG93bmxvYWQiLCJkb3dubG9hZE5hbWUiLCJuYW1lIiwiSU5WQUxJRF9BQ0wiLCJyZWFkIiwid3JpdGUiLCJtYXhQYXNzd29yZEFnZSIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiZGVmZXIiLCJNYXRoIiwibWF4Iiwic2hpZnQiLCJfdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJoYXNBZnRlclNhdmVIb29rIiwiYWZ0ZXJTYXZlIiwiaGFzTGl2ZVF1ZXJ5IiwiX2hhbmRsZVNhdmVSZXNwb25zZSIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwib25BZnRlclNhdmUiLCJqc29uUmV0dXJuZWQiLCJfdG9GdWxsSlNPTiIsInRvSlNPTiIsImxvZ2dlciIsIndhcm4iLCJtaWRkbGUiLCJtb3VudCIsInNlcnZlclVSTCIsInNhbml0aXplZERhdGEiLCJ0ZXN0IiwiX2RlY29kZSIsImZyb21KU09OIiwicmVhZE9ubHlBdHRyaWJ1dGVzIiwiY29uc3RydWN0b3IiLCJhdHRyaWJ1dGUiLCJpbmNsdWRlcyIsInNldCIsInNwbGl0dGVkS2V5Iiwic3BsaXQiLCJwYXJlbnRQcm9wIiwicGFyZW50VmFsIiwiZ2V0Iiwic2FuaXRpemVkIiwic2tpcEtleXMiLCJyZXF1aXJlZENvbHVtbnMiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImNsaWVudFN1cHBvcnRzRGVsZXRlIiwic3VwcG9ydHNGb3J3YXJkRGVsZXRlIiwiZGF0YVZhbHVlIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQWVBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7O0FBbEJBO0FBQ0E7QUFDQTtBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQUQsQ0FBOUI7O0FBQ0EsSUFBSUMsUUFBUSxHQUFHRCxPQUFPLENBQUMsVUFBRCxDQUF0Qjs7QUFFQSxNQUFNRSxJQUFJLEdBQUdGLE9BQU8sQ0FBQyxRQUFELENBQXBCOztBQUNBLE1BQU1HLEtBQUssR0FBR0gsT0FBTyxDQUFDLFNBQUQsQ0FBckI7O0FBQ0EsSUFBSUksV0FBVyxHQUFHSixPQUFPLENBQUMsZUFBRCxDQUF6Qjs7QUFDQSxJQUFJSyxjQUFjLEdBQUdMLE9BQU8sQ0FBQyxZQUFELENBQTVCOztBQUNBLElBQUlNLEtBQUssR0FBR04sT0FBTyxDQUFDLFlBQUQsQ0FBbkI7O0FBQ0EsSUFBSU8sUUFBUSxHQUFHUCxPQUFPLENBQUMsWUFBRCxDQUF0Qjs7QUFDQSxJQUFJUSxTQUFTLEdBQUdSLE9BQU8sQ0FBQyxhQUFELENBQXZCOztBQUNBLE1BQU1TLElBQUksR0FBR1QsT0FBTyxDQUFDLE1BQUQsQ0FBcEI7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBU1UsU0FBVCxDQUFtQkMsTUFBbkIsRUFBMkJDLElBQTNCLEVBQWlD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UUFBQUEsUUFBUSxDQUFDb0YsU0FBRCxDQUFSLEdBQXNCbU0sU0FBdEI7QUFDRDtBQUNGO0FBQ0YsR0FkRDtBQWVBLFNBQU92UixRQUFQO0FBQ0QsQ0FuREQ7O2VBcURlaEMsUzs7QUFDZndULE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQnpULFNBQWpCIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQSBSZXN0V3JpdGUgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYW4gb3BlcmF0aW9uXG4vLyB0aGF0IHdyaXRlcyB0byB0aGUgZGF0YWJhc2UuXG4vLyBUaGlzIGNvdWxkIGJlIGVpdGhlciBhIFwiY3JlYXRlXCIgb3IgYW4gXCJ1cGRhdGVcIi5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcbnZhciBkZWVwY29weSA9IHJlcXVpcmUoJ2RlZXBjb3B5Jyk7XG5cbmNvbnN0IEF1dGggPSByZXF1aXJlKCcuL0F1dGgnKTtcbmNvbnN0IFV0aWxzID0gcmVxdWlyZSgnLi9VdGlscycpO1xudmFyIGNyeXB0b1V0aWxzID0gcmVxdWlyZSgnLi9jcnlwdG9VdGlscycpO1xudmFyIHBhc3N3b3JkQ3J5cHRvID0gcmVxdWlyZSgnLi9wYXNzd29yZCcpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xudmFyIHRyaWdnZXJzID0gcmVxdWlyZSgnLi90cmlnZ2VycycpO1xudmFyIENsaWVudFNESyA9IHJlcXVpcmUoJy4vQ2xpZW50U0RLJyk7XG5jb25zdCB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuaW1wb3J0IFJlc3RRdWVyeSBmcm9tICcuL1Jlc3RRdWVyeSc7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyByZXF1aXJlZENvbHVtbnMgfSBmcm9tICcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuXG4vLyBxdWVyeSBhbmQgZGF0YSBhcmUgYm90aCBwcm92aWRlZCBpbiBSRVNUIEFQSSBmb3JtYXQuIFNvIGRhdGFcbi8vIHR5cGVzIGFyZSBlbmNvZGVkIGJ5IHBsYWluIG9sZCBvYmplY3RzLlxuLy8gSWYgcXVlcnkgaXMgbnVsbCwgdGhpcyBpcyBhIFwiY3JlYXRlXCIgYW5kIHRoZSBkYXRhIGluIGRhdGEgc2hvdWxkIGJlXG4vLyBjcmVhdGVkLlxuLy8gT3RoZXJ3aXNlIHRoaXMgaXMgYW4gXCJ1cGRhdGVcIiAtIHRoZSBvYmplY3QgbWF0Y2hpbmcgdGhlIHF1ZXJ5XG4vLyBzaG91bGQgZ2V0IHVwZGF0ZWQgd2l0aCBkYXRhLlxuLy8gUmVzdFdyaXRlIHdpbGwgaGFuZGxlIG9iamVjdElkLCBjcmVhdGVkQXQsIGFuZCB1cGRhdGVkQXQgZm9yXG4vLyBldmVyeXRoaW5nLiBJdCBhbHNvIGtub3dzIHRvIHVzZSB0cmlnZ2VycyBhbmQgc3BlY2lhbCBtb2RpZmljYXRpb25zXG4vLyBmb3IgdGhlIF9Vc2VyIGNsYXNzLlxuZnVuY3Rpb24gUmVzdFdyaXRlKGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCBxdWVyeSwgZGF0YSwgb3JpZ2luYWxEYXRhLCBjbGllbnRTREssIGNvbnRleHQsIGFjdGlvbikge1xuICBpZiAoYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICdDYW5ub3QgcGVyZm9ybSBhIHdyaXRlIG9wZXJhdGlvbiB3aGVuIHVzaW5nIHJlYWRPbmx5TWFzdGVyS2V5J1xuICAgICk7XG4gIH1cbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuYXV0aCA9IGF1dGg7XG4gIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB0aGlzLmNsaWVudFNESyA9IGNsaWVudFNESztcbiAgdGhpcy5zdG9yYWdlID0ge307XG4gIHRoaXMucnVuT3B0aW9ucyA9IHt9O1xuICB0aGlzLmNvbnRleHQgPSBjb250ZXh0IHx8IHt9O1xuXG4gIGlmIChhY3Rpb24pIHtcbiAgICB0aGlzLnJ1bk9wdGlvbnMuYWN0aW9uID0gYWN0aW9uO1xuICB9XG5cbiAgaWYgKCFxdWVyeSkge1xuICAgIGlmICh0aGlzLmNvbmZpZy5hbGxvd0N1c3RvbU9iamVjdElkKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGRhdGEsICdvYmplY3RJZCcpICYmICFkYXRhLm9iamVjdElkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5NSVNTSU5HX09CSkVDVF9JRCxcbiAgICAgICAgICAnb2JqZWN0SWQgbXVzdCBub3QgYmUgZW1wdHksIG51bGwgb3IgdW5kZWZpbmVkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZGF0YS5vYmplY3RJZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ29iamVjdElkIGlzIGFuIGludmFsaWQgZmllbGQgbmFtZS4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChkYXRhLmlkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnaWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLicpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLmNvbmZpZy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgIGZvciAoY29uc3Qga2V5d29yZCBvZiB0aGlzLmNvbmZpZy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICBjb25zdCBtYXRjaCA9IFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUoZGF0YSwga2V5d29yZC5rZXksIGtleXdvcmQudmFsdWUpO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgIGBQcm9oaWJpdGVkIGtleXdvcmQgaW4gcmVxdWVzdCBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGtleXdvcmQpfS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gV2hlbiB0aGUgb3BlcmF0aW9uIGlzIGNvbXBsZXRlLCB0aGlzLnJlc3BvbnNlIG1heSBoYXZlIHNldmVyYWxcbiAgLy8gZmllbGRzLlxuICAvLyByZXNwb25zZTogdGhlIGFjdHVhbCBkYXRhIHRvIGJlIHJldHVybmVkXG4gIC8vIHN0YXR1czogdGhlIGh0dHAgc3RhdHVzIGNvZGUuIGlmIG5vdCBwcmVzZW50LCB0cmVhdGVkIGxpa2UgYSAyMDBcbiAgLy8gbG9jYXRpb246IHRoZSBsb2NhdGlvbiBoZWFkZXIuIGlmIG5vdCBwcmVzZW50LCBubyBsb2NhdGlvbiBoZWFkZXJcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG5cbiAgLy8gUHJvY2Vzc2luZyB0aGlzIG9wZXJhdGlvbiBtYXkgbXV0YXRlIG91ciBkYXRhLCBzbyB3ZSBvcGVyYXRlIG9uIGFcbiAgLy8gY29weVxuICB0aGlzLnF1ZXJ5ID0gZGVlcGNvcHkocXVlcnkpO1xuICB0aGlzLmRhdGEgPSBkZWVwY29weShkYXRhKTtcbiAgLy8gV2UgbmV2ZXIgY2hhbmdlIG9yaWdpbmFsRGF0YSwgc28gd2UgZG8gbm90IG5lZWQgYSBkZWVwIGNvcHlcbiAgdGhpcy5vcmlnaW5hbERhdGEgPSBvcmlnaW5hbERhdGE7XG5cbiAgLy8gVGhlIHRpbWVzdGFtcCB3ZSdsbCB1c2UgZm9yIHRoaXMgd2hvbGUgb3BlcmF0aW9uXG4gIHRoaXMudXBkYXRlZEF0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKS5pc287XG5cbiAgLy8gU2hhcmVkIFNjaGVtYUNvbnRyb2xsZXIgdG8gYmUgcmV1c2VkIHRvIHJlZHVjZSB0aGUgbnVtYmVyIG9mIGxvYWRTY2hlbWEoKSBjYWxscyBwZXIgcmVxdWVzdFxuICAvLyBPbmNlIHNldCB0aGUgc2NoZW1hRGF0YSBzaG91bGQgYmUgaW1tdXRhYmxlXG4gIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyID0gbnVsbDtcbiAgdGhpcy5wZW5kaW5nT3BzID0ge307XG59XG5cbi8vIEEgY29udmVuaWVudCBtZXRob2QgdG8gcGVyZm9ybSBhbGwgdGhlIHN0ZXBzIG9mIHByb2Nlc3NpbmcgdGhlXG4vLyB3cml0ZSwgaW4gb3JkZXIuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSB7cmVzcG9uc2UsIHN0YXR1cywgbG9jYXRpb259IG9iamVjdC5cbi8vIHN0YXR1cyBhbmQgbG9jYXRpb24gYXJlIG9wdGlvbmFsLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRVc2VyQW5kUm9sZUFDTCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbnN0YWxsYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVNlc3Npb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkJlZm9yZVNhdmVUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5lbnN1cmVVbmlxdWVBdXRoRGF0YUlkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5kZWxldGVFbWFpbFJlc2V0VG9rZW5JZk5lZWRlZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVTY2hlbWEoKTtcbiAgICB9KVxuICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIgPSBzY2hlbWFDb250cm9sbGVyO1xuICAgICAgcmV0dXJuIHRoaXMuc2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudHJhbnNmb3JtVXNlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkRhdGFiYXNlT3BlcmF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRm9sbG93dXAoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkFmdGVyU2F2ZVRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNsZWFuVXNlckF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBBcHBlbmQgdGhlIGF1dGhEYXRhUmVzcG9uc2UgaWYgZXhpc3RzXG4gICAgICBpZiAodGhpcy5hdXRoRGF0YVJlc3BvbnNlKSB7XG4gICAgICAgIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLmF1dGhEYXRhUmVzcG9uc2UgPSB0aGlzLmF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLnJlc3BvbnNlO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5SZXN0V3JpdGUucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5ydW5PcHRpb25zLmFjbCA9IFsnKiddO1xuXG4gIGlmICh0aGlzLmF1dGgudXNlcikge1xuICAgIHJldHVybiB0aGlzLmF1dGguZ2V0VXNlclJvbGVzKCkudGhlbihyb2xlcyA9PiB7XG4gICAgICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gdGhpcy5ydW5PcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKFxuICAgIHRoaXMuY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgU2NoZW1hQ29udHJvbGxlci5zeXN0ZW1DbGFzc2VzLmluZGV4T2YodGhpcy5jbGFzc05hbWUpID09PSAtMVxuICApIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5oYXNDbGFzcyh0aGlzLmNsYXNzTmFtZSkpXG4gICAgICAudGhlbihoYXNDbGFzcyA9PiB7XG4gICAgICAgIGlmIChoYXNDbGFzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAnVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2VzcyAnICsgJ25vbi1leGlzdGVudCBjbGFzczogJyArIHRoaXMuY2xhc3NOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgc2NoZW1hLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZVNjaGVtYSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnZhbGlkYXRlT2JqZWN0KFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRoaXMuZGF0YSxcbiAgICB0aGlzLnF1ZXJ5LFxuICAgIHRoaXMucnVuT3B0aW9uc1xuICApO1xufTtcblxuLy8gUnVucyBhbnkgYmVmb3JlU2F2ZSB0cmlnZ2VycyBhZ2FpbnN0IHRoaXMgb3BlcmF0aW9uLlxuLy8gQW55IGNoYW5nZSBsZWFkcyB0byBvdXIgZGF0YSBiZWluZyBtdXRhdGVkLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5CZWZvcmVTYXZlVHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgfHwgdGhpcy5ydW5PcHRpb25zLm1hbnkpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdiZWZvcmVTYXZlJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBpZiAoXG4gICAgIXRyaWdnZXJzLnRyaWdnZXJFeGlzdHModGhpcy5jbGFzc05hbWUsIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWQpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcblxuICBjb25zdCBzdGF0ZUNvbnRyb2xsZXIgPSBQYXJzZS5Db3JlTWFuYWdlci5nZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIoKTtcbiAgY29uc3QgW3BlbmRpbmddID0gc3RhdGVDb250cm9sbGVyLmdldFBlbmRpbmdPcHModXBkYXRlZE9iamVjdC5fZ2V0U3RhdGVJZGVudGlmaWVyKCkpO1xuICB0aGlzLnBlbmRpbmdPcHMgPSB7IC4uLnBlbmRpbmcgfTtcblxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBCZWZvcmUgY2FsbGluZyB0aGUgdHJpZ2dlciwgdmFsaWRhdGUgdGhlIHBlcm1pc3Npb25zIGZvciB0aGUgc2F2ZSBvcGVyYXRpb25cbiAgICAgIGxldCBkYXRhYmFzZVByb21pc2UgPSBudWxsO1xuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIHVwZGF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgY3JlYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UuY3JlYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSW4gdGhlIGNhc2UgdGhhdCB0aGVyZSBpcyBubyBwZXJtaXNzaW9uIGZvciB0aGUgb3BlcmF0aW9uLCBpdCB0aHJvd3MgYW4gZXJyb3JcbiAgICAgIHJldHVybiBkYXRhYmFzZVByb21pc2UudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQubGVuZ3RoIDw9IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgICAgdGhpcy5hdXRoLFxuICAgICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgICAgdGhpcy5jb25maWcsXG4gICAgICAgIHRoaXMuY29udGV4dFxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSBfLnJlZHVjZShcbiAgICAgICAgICByZXNwb25zZS5vYmplY3QsXG4gICAgICAgICAgKHJlc3VsdCwgdmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYgKCFfLmlzRXF1YWwodGhpcy5kYXRhW2tleV0sIHZhbHVlKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9LFxuICAgICAgICAgIFtdXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGF0YSA9IHJlc3BvbnNlLm9iamVjdDtcbiAgICAgICAgLy8gV2Ugc2hvdWxkIGRlbGV0ZSB0aGUgb2JqZWN0SWQgZm9yIGFuIHVwZGF0ZSB3cml0ZVxuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5CZWZvcmVMb2dpblRyaWdnZXIgPSBhc3luYyBmdW5jdGlvbiAodXNlckRhdGEpIHtcbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlTG9naW4nIHRyaWdnZXJcbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKHRoaXMuY2xhc3NOYW1lLCB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbiwgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZClcbiAgKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQ2xvdWQgY29kZSBnZXRzIGEgYml0IG9mIGV4dHJhIGRhdGEgZm9yIGl0cyBvYmplY3RzXG4gIGNvbnN0IGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSB9O1xuXG4gIC8vIEV4cGFuZCBmaWxlIG9iamVjdHNcbiAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHVzZXJEYXRhKTtcblxuICBjb25zdCB1c2VyID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHVzZXJEYXRhKTtcblxuICAvLyBubyBuZWVkIHRvIHJldHVybiBhIHJlc3BvbnNlXG4gIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbixcbiAgICB0aGlzLmF1dGgsXG4gICAgdXNlcixcbiAgICBudWxsLFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuY29udGV4dFxuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5kYXRhKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKS50aGVuKGFsbENsYXNzZXMgPT4ge1xuICAgICAgY29uc3Qgc2NoZW1hID0gYWxsQ2xhc3Nlcy5maW5kKG9uZUNsYXNzID0+IG9uZUNsYXNzLmNsYXNzTmFtZSA9PT0gdGhpcy5jbGFzc05hbWUpO1xuICAgICAgY29uc3Qgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkID0gKGZpZWxkTmFtZSwgc2V0RGVmYXVsdCkgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSBudWxsIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICcnIHx8XG4gICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiYgdGhpcy5kYXRhW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHNldERlZmF1bHQgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZSAhPT0gbnVsbCAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICAgICAodGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgICAgICAodHlwZW9mIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnb2JqZWN0JyAmJiB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWU7XG4gICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9IHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIHx8IFtdO1xuICAgICAgICAgICAgaWYgKHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5yZXF1aXJlZCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGAke2ZpZWxkTmFtZX0gaXMgcmVxdWlyZWRgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIC8vIEFkZCBkZWZhdWx0IGZpZWxkc1xuICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcblxuICAgICAgICAvLyBPbmx5IGFzc2lnbiBuZXcgb2JqZWN0SWQgaWYgd2UgYXJlIGNyZWF0aW5nIG5ldyBvYmplY3RcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSBjcnlwdG9VdGlscy5uZXdPYmplY3RJZCh0aGlzLmNvbmZpZy5vYmplY3RJZFNpemUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCB0cnVlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChzY2hlbWEpIHtcbiAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkKGZpZWxkTmFtZSwgZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG4vLyBUcmFuc2Zvcm1zIGF1dGggZGF0YSBmb3IgYSB1c2VyIG9iamVjdC5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGEgdXNlciBvYmplY3QuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hlbiB3ZSdyZSBkb25lIGlmIGl0IGNhbid0IGZpbmlzaCB0aGlzIHRpY2suXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGF1dGhEYXRhID0gdGhpcy5kYXRhLmF1dGhEYXRhO1xuICBjb25zdCBoYXNVc2VybmFtZUFuZFBhc3N3b3JkID1cbiAgICB0eXBlb2YgdGhpcy5kYXRhLnVzZXJuYW1lID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkID09PSAnc3RyaW5nJztcblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIWF1dGhEYXRhKSB7XG4gICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEudXNlcm5hbWUgIT09ICdzdHJpbmcnIHx8IF8uaXNFbXB0eSh0aGlzLmRhdGEudXNlcm5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ2JhZCBvciBtaXNzaW5nIHVzZXJuYW1lJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fCBfLmlzRW1wdHkodGhpcy5kYXRhLnBhc3N3b3JkKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChcbiAgICAoYXV0aERhdGEgJiYgIU9iamVjdC5rZXlzKGF1dGhEYXRhKS5sZW5ndGgpIHx8XG4gICAgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLmRhdGEsICdhdXRoRGF0YScpXG4gICkge1xuICAgIC8vIE5vdGhpbmcgdG8gdmFsaWRhdGUgaGVyZVxuICAgIHJldHVybjtcbiAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgLy8gSGFuZGxlIHNhdmluZyBhdXRoRGF0YSB0byBudWxsXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgKTtcbiAgfVxuXG4gIHZhciBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGlmIChwcm92aWRlcnMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNhbkhhbmRsZUF1dGhEYXRhID0gcHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgICAgdmFyIHByb3ZpZGVyQXV0aERhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB2YXIgaGFzVG9rZW4gPSBwcm92aWRlckF1dGhEYXRhICYmIHByb3ZpZGVyQXV0aERhdGEuaWQ7XG4gICAgICByZXR1cm4gaGFzVG9rZW4gfHwgcHJvdmlkZXJBdXRoRGF0YSA9PT0gbnVsbDtcbiAgICB9KTtcbiAgICBpZiAoY2FuSGFuZGxlQXV0aERhdGEgfHwgaGFzVXNlcm5hbWVBbmRQYXNzd29yZCB8fCB0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5nZXRVc2VySWQoKSkge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGEoYXV0aERhdGEpO1xuICAgIH1cbiAgfVxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maWx0ZXJlZE9iamVjdHNCeUFDTCA9IGZ1bmN0aW9uIChvYmplY3RzKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0cztcbiAgfVxuICByZXR1cm4gb2JqZWN0cy5maWx0ZXIob2JqZWN0ID0+IHtcbiAgICBpZiAoIW9iamVjdC5BQ0wpIHtcbiAgICAgIHJldHVybiB0cnVlOyAvLyBsZWdhY3kgdXNlcnMgdGhhdCBoYXZlIG5vIEFDTCBmaWVsZCBvbiB0aGVtXG4gICAgfVxuICAgIC8vIFJlZ3VsYXIgdXNlcnMgdGhhdCBoYXZlIGJlZW4gbG9ja2VkIG91dC5cbiAgICByZXR1cm4gb2JqZWN0LkFDTCAmJiBPYmplY3Qua2V5cyhvYmplY3QuQUNMKS5sZW5ndGggPiAwO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlcklkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuIHRoaXMucXVlcnkub2JqZWN0SWQ7XG4gIH0gZWxzZSBpZiAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC51c2VyLmlkO1xuICB9XG59O1xuXG4vLyBEZXZlbG9wZXJzIGFyZSBhbGxvd2VkIHRvIGNoYW5nZSBhdXRoRGF0YSB2aWEgYmVmb3JlIHNhdmUgdHJpZ2dlclxuLy8gd2UgbmVlZCBhZnRlciBiZWZvcmUgc2F2ZSB0byBlbnN1cmUgdGhhdCB0aGUgZGV2ZWxvcGVyXG4vLyBpcyBub3QgY3VycmVudGx5IGR1cGxpY2F0aW5nIGF1dGggZGF0YSBJRFxuUmVzdFdyaXRlLnByb3RvdHlwZS5lbnN1cmVVbmlxdWVBdXRoRGF0YUlkID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGhhc0F1dGhEYXRhSWQgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLnNvbWUoXG4gICAga2V5ID0+IHRoaXMuZGF0YS5hdXRoRGF0YVtrZXldICYmIHRoaXMuZGF0YS5hdXRoRGF0YVtrZXldLmlkXG4gICk7XG5cbiAgaWYgKCFoYXNBdXRoRGF0YUlkKSByZXR1cm47XG5cbiAgY29uc3QgciA9IGF3YWl0IEF1dGguZmluZFVzZXJzV2l0aEF1dGhEYXRhKHRoaXMuY29uZmlnLCB0aGlzLmRhdGEuYXV0aERhdGEpO1xuICBjb25zdCByZXN1bHRzID0gdGhpcy5maWx0ZXJlZE9iamVjdHNCeUFDTChyKTtcbiAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICB9XG4gIC8vIHVzZSBkYXRhLm9iamVjdElkIGluIGNhc2Ugb2YgbG9naW4gdGltZSBhbmQgZm91bmQgdXNlciBkdXJpbmcgaGFuZGxlIHZhbGlkYXRlQXV0aERhdGFcbiAgY29uc3QgdXNlcklkID0gdGhpcy5nZXRVc2VySWQoKSB8fCB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMSAmJiB1c2VySWQgIT09IHJlc3VsdHNbMF0ub2JqZWN0SWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVBdXRoRGF0YSA9IGFzeW5jIGZ1bmN0aW9uIChhdXRoRGF0YSkge1xuICBjb25zdCByID0gYXdhaXQgQXV0aC5maW5kVXNlcnNXaXRoQXV0aERhdGEodGhpcy5jb25maWcsIGF1dGhEYXRhKTtcbiAgY29uc3QgcmVzdWx0cyA9IHRoaXMuZmlsdGVyZWRPYmplY3RzQnlBQ0wocik7XG5cbiAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgIC8vIFRvIGF2b2lkIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL3NlY3VyaXR5L2Fkdmlzb3JpZXMvR0hTQS04dzNqLWc5ODMtOGpoNVxuICAgIC8vIExldCdzIHJ1biBzb21lIHZhbGlkYXRpb24gYmVmb3JlIHRocm93aW5nXG4gICAgYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oYXV0aERhdGEsIHRoaXMsIHJlc3VsdHNbMF0pO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICB9XG5cbiAgLy8gTm8gdXNlciBmb3VuZCB3aXRoIHByb3ZpZGVkIGF1dGhEYXRhIHdlIG5lZWQgdG8gdmFsaWRhdGVcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIGNvbnN0IHsgYXV0aERhdGE6IHZhbGlkYXRlZEF1dGhEYXRhLCBhdXRoRGF0YVJlc3BvbnNlIH0gPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgIGF1dGhEYXRhLFxuICAgICAgdGhpc1xuICAgICk7XG4gICAgdGhpcy5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICAvLyBSZXBsYWNlIGN1cnJlbnQgYXV0aERhdGEgYnkgdGhlIG5ldyB2YWxpZGF0ZWQgb25lXG4gICAgdGhpcy5kYXRhLmF1dGhEYXRhID0gdmFsaWRhdGVkQXV0aERhdGE7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVXNlciBmb3VuZCB3aXRoIHByb3ZpZGVkIGF1dGhEYXRhXG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IHVzZXJJZCA9IHRoaXMuZ2V0VXNlcklkKCk7XG4gICAgY29uc3QgdXNlclJlc3VsdCA9IHJlc3VsdHNbMF07XG4gICAgLy8gUHJldmVudCBkdXBsaWNhdGUgYXV0aERhdGEgaWRcbiAgICBpZiAodXNlcklkICYmIHVzZXJJZCAhPT0gdXNlclJlc3VsdC5vYmplY3RJZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gICAgfVxuXG4gICAgdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5qb2luKCcsJyk7XG5cbiAgICBjb25zdCB7IGhhc011dGF0ZWRBdXRoRGF0YSwgbXV0YXRlZEF1dGhEYXRhIH0gPSBBdXRoLmhhc011dGF0ZWRBdXRoRGF0YShcbiAgICAgIGF1dGhEYXRhLFxuICAgICAgdXNlclJlc3VsdC5hdXRoRGF0YVxuICAgICk7XG5cbiAgICBjb25zdCBpc0N1cnJlbnRVc2VyTG9nZ2VkT3JNYXN0ZXIgPVxuICAgICAgKHRoaXMuYXV0aCAmJiB0aGlzLmF1dGgudXNlciAmJiB0aGlzLmF1dGgudXNlci5pZCA9PT0gdXNlclJlc3VsdC5vYmplY3RJZCkgfHxcbiAgICAgIHRoaXMuYXV0aC5pc01hc3RlcjtcblxuICAgIGNvbnN0IGlzTG9naW4gPSAhdXNlcklkO1xuXG4gICAgaWYgKGlzTG9naW4gfHwgaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyKSB7XG4gICAgICAvLyBubyB1c2VyIG1ha2luZyB0aGUgY2FsbFxuICAgICAgLy8gT1IgdGhlIHVzZXIgbWFraW5nIHRoZSBjYWxsIGlzIHRoZSByaWdodCBvbmVcbiAgICAgIC8vIExvZ2luIHdpdGggYXV0aCBkYXRhXG4gICAgICBkZWxldGUgcmVzdWx0c1swXS5wYXNzd29yZDtcblxuICAgICAgLy8gbmVlZCB0byBzZXQgdGhlIG9iamVjdElkIGZpcnN0IG90aGVyd2lzZSBsb2NhdGlvbiBoYXMgdHJhaWxpbmcgdW5kZWZpbmVkXG4gICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSB1c2VyUmVzdWx0Lm9iamVjdElkO1xuXG4gICAgICBpZiAoIXRoaXMucXVlcnkgfHwgIXRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgICByZXNwb25zZTogdXNlclJlc3VsdCxcbiAgICAgICAgICBsb2NhdGlvbjogdGhpcy5sb2NhdGlvbigpLFxuICAgICAgICB9O1xuICAgICAgICAvLyBSdW4gYmVmb3JlTG9naW4gaG9vayBiZWZvcmUgc3RvcmluZyBhbnkgdXBkYXRlc1xuICAgICAgICAvLyB0byBhdXRoRGF0YSBvbiB0aGUgZGI7IGNoYW5nZXMgdG8gdXNlclJlc3VsdFxuICAgICAgICAvLyB3aWxsIGJlIGlnbm9yZWQuXG4gICAgICAgIGF3YWl0IHRoaXMucnVuQmVmb3JlTG9naW5UcmlnZ2VyKGRlZXBjb3B5KHVzZXJSZXN1bHQpKTtcblxuICAgICAgICAvLyBJZiB3ZSBhcmUgaW4gbG9naW4gb3BlcmF0aW9uIHZpYSBhdXRoRGF0YVxuICAgICAgICAvLyB3ZSBuZWVkIHRvIGJlIHN1cmUgdGhhdCB0aGUgdXNlciBoYXMgcHJvdmlkZWRcbiAgICAgICAgLy8gcmVxdWlyZWQgYXV0aERhdGFcbiAgICAgICAgQXV0aC5jaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luKFxuICAgICAgICAgIGF1dGhEYXRhLFxuICAgICAgICAgIHVzZXJSZXN1bHQuYXV0aERhdGEsXG4gICAgICAgICAgdGhpcy5jb25maWdcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgLy8gUHJldmVudCB2YWxpZGF0aW5nIGlmIG5vIG11dGF0ZWQgZGF0YSBkZXRlY3RlZCBvbiB1cGRhdGVcbiAgICAgIGlmICghaGFzTXV0YXRlZEF1dGhEYXRhICYmIGlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3Rlcikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIEZvcmNlIHRvIHZhbGlkYXRlIGFsbCBwcm92aWRlZCBhdXRoRGF0YSBvbiBsb2dpblxuICAgICAgLy8gb24gdXBkYXRlIG9ubHkgdmFsaWRhdGUgbXV0YXRlZCBvbmVzXG4gICAgICBpZiAoaGFzTXV0YXRlZEF1dGhEYXRhIHx8ICF0aGlzLmNvbmZpZy5hbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKFxuICAgICAgICAgIGlzTG9naW4gPyBhdXRoRGF0YSA6IG11dGF0ZWRBdXRoRGF0YSxcbiAgICAgICAgICB0aGlzLFxuICAgICAgICAgIHVzZXJSZXN1bHRcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kYXRhLmF1dGhEYXRhID0gcmVzLmF1dGhEYXRhO1xuICAgICAgICB0aGlzLmF1dGhEYXRhUmVzcG9uc2UgPSByZXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgIH1cblxuICAgICAgLy8gSUYgd2UgYXJlIGluIGxvZ2luIHdlJ2xsIHNraXAgdGhlIGRhdGFiYXNlIG9wZXJhdGlvbiAvIGJlZm9yZVNhdmUgLyBhZnRlclNhdmUgZXRjLi4uXG4gICAgICAvLyB3ZSBuZWVkIHRvIHNldCBpdCB1cCB0aGVyZS5cbiAgICAgIC8vIFdlIGFyZSBzdXBwb3NlZCB0byBoYXZlIGEgcmVzcG9uc2Ugb25seSBvbiBMT0dJTiB3aXRoIGF1dGhEYXRhLCBzbyB3ZSBza2lwIHRob3NlXG4gICAgICAvLyBJZiB3ZSdyZSBub3QgbG9nZ2luZyBpbiwgYnV0IGp1c3QgdXBkYXRpbmcgdGhlIGN1cnJlbnQgdXNlciwgd2UgY2FuIHNhZmVseSBza2lwIHRoYXQgcGFydFxuICAgICAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICAgICAgLy8gQXNzaWduIHRoZSBuZXcgYXV0aERhdGEgaW4gdGhlIHJlc3BvbnNlXG4gICAgICAgIE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVtwcm92aWRlcl0gPSBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBSdW4gdGhlIERCIHVwZGF0ZSBkaXJlY3RseSwgYXMgJ21hc3Rlcicgb25seSBpZiBhdXRoRGF0YSBjb250YWlucyBzb21lIGtleXNcbiAgICAgICAgLy8gYXV0aERhdGEgY291bGQgbm90IGNvbnRhaW5zIGtleXMgYWZ0ZXIgdmFsaWRhdGlvbiBpZiB0aGUgYXV0aEFkYXB0ZXJcbiAgICAgICAgLy8gdXNlcyB0aGUgYGRvTm90U2F2ZWAgb3B0aW9uLiBKdXN0IHVwZGF0ZSB0aGUgYXV0aERhdGEgcGFydFxuICAgICAgICAvLyBUaGVuIHdlJ3JlIGdvb2QgZm9yIHRoZSB1c2VyLCBlYXJseSBleGl0IG9mIHNvcnRzXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5kYXRhLm9iamVjdElkIH0sXG4gICAgICAgICAgICB7IGF1dGhEYXRhOiB0aGlzLmRhdGEuYXV0aERhdGEgfSxcbiAgICAgICAgICAgIHt9XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gVGhlIG5vbi10aGlyZC1wYXJ0eSBwYXJ0cyBvZiBVc2VyIHRyYW5zZm9ybWF0aW9uXG5SZXN0V3JpdGUucHJvdG90eXBlLnRyYW5zZm9ybVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgJ2VtYWlsVmVyaWZpZWQnIGluIHRoaXMuZGF0YSkge1xuICAgIGNvbnN0IGVycm9yID0gYENsaWVudHMgYXJlbid0IGFsbG93ZWQgdG8gbWFudWFsbHkgdXBkYXRlIGVtYWlsIHZlcmlmaWNhdGlvbi5gO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCBlcnJvcik7XG4gIH1cblxuICAvLyBEbyBub3QgY2xlYW51cCBzZXNzaW9uIGlmIG9iamVjdElkIGlzIG5vdCBzZXRcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5vYmplY3RJZCgpKSB7XG4gICAgLy8gSWYgd2UncmUgdXBkYXRpbmcgYSBfVXNlciBvYmplY3QsIHdlIG5lZWQgdG8gY2xlYXIgb3V0IHRoZSBjYWNoZSBmb3IgdGhhdCB1c2VyLiBGaW5kIGFsbCB0aGVpclxuICAgIC8vIHNlc3Npb24gdG9rZW5zLCBhbmQgcmVtb3ZlIHRoZW0gZnJvbSB0aGUgY2FjaGUuXG4gICAgcHJvbWlzZSA9IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSwgJ19TZXNzaW9uJywge1xuICAgICAgdXNlcjoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgICAgfSxcbiAgICB9KVxuICAgICAgLmV4ZWN1dGUoKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIHJlc3VsdHMucmVzdWx0cy5mb3JFYWNoKHNlc3Npb24gPT5cbiAgICAgICAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIudXNlci5kZWwoc2Vzc2lvbi5zZXNzaW9uVG9rZW4pXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gVHJhbnNmb3JtIHRoZSBwYXNzd29yZFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIC8vIGlnbm9yZSBvbmx5IGlmIHVuZGVmaW5lZC4gc2hvdWxkIHByb2NlZWQgaWYgZW1wdHkgKCcnKVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddID0gdHJ1ZTtcbiAgICAgICAgLy8gR2VuZXJhdGUgYSBuZXcgc2Vzc2lvbiBvbmx5IGlmIHRoZSB1c2VyIHJlcXVlc3RlZFxuICAgICAgICBpZiAoIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgICAgICAgIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5KCkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5oYXNoKHRoaXMuZGF0YS5wYXNzd29yZCkudGhlbihoYXNoZWRQYXNzd29yZCA9PiB7XG4gICAgICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgPSBoYXNoZWRQYXNzd29yZDtcbiAgICAgICAgICBkZWxldGUgdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlVXNlck5hbWUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZUVtYWlsKCk7XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVVzZXJOYW1lID0gZnVuY3Rpb24gKCkge1xuICAvLyBDaGVjayBmb3IgdXNlcm5hbWUgdW5pcXVlbmVzc1xuICBpZiAoIXRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgdGhpcy5kYXRhLnVzZXJuYW1lID0gY3J5cHRvVXRpbHMucmFuZG9tU3RyaW5nKDI1KTtcbiAgICAgIHRoaXMucmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLypcbiAgICBVc2VybmFtZXMgc2hvdWxkIGJlIHVuaXF1ZSB3aGVuIGNvbXBhcmVkIGNhc2UgaW5zZW5zaXRpdmVseVxuXG4gICAgVXNlcnMgc2hvdWxkIGJlIGFibGUgdG8gbWFrZSBjYXNlIHNlbnNpdGl2ZSB1c2VybmFtZXMgYW5kXG4gICAgbG9naW4gdXNpbmcgdGhlIGNhc2UgdGhleSBlbnRlcmVkLiAgSS5lLiAnU25vb3B5JyBzaG91bGQgcHJlY2x1ZGVcbiAgICAnc25vb3B5JyBhcyBhIHZhbGlkIHVzZXJuYW1lLlxuICAqL1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICB1c2VybmFtZTogdGhpcy5kYXRhLnVzZXJuYW1lLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9KTtcbn07XG5cbi8qXG4gIEFzIHdpdGggdXNlcm5hbWVzLCBQYXJzZSBzaG91bGQgbm90IGFsbG93IGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9ucyBvZiBlbWFpbC5cbiAgdW5saWtlIHdpdGggdXNlcm5hbWVzICh3aGljaCBjYW4gaGF2ZSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgaW4gdGhlIGNhc2Ugb2ZcbiAgYXV0aCBhZGFwdGVycyksIGVtYWlscyBzaG91bGQgbmV2ZXIgaGF2ZSBhIGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9uLlxuXG4gIFRoaXMgYmVoYXZpb3IgY2FuIGJlIGVuZm9yY2VkIHRocm91Z2ggYSBwcm9wZXJseSBjb25maWd1cmVkIGluZGV4IHNlZTpcbiAgaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL2luZGV4LWNhc2UtaW5zZW5zaXRpdmUvI2NyZWF0ZS1hLWNhc2UtaW5zZW5zaXRpdmUtaW5kZXhcbiAgd2hpY2ggY291bGQgYmUgaW1wbGVtZW50ZWQgaW5zdGVhZCBvZiB0aGlzIGNvZGUgYmFzZWQgdmFsaWRhdGlvbi5cblxuICBHaXZlbiB0aGF0IHRoaXMgbG9va3VwIHNob3VsZCBiZSBhIHJlbGF0aXZlbHkgbG93IHVzZSBjYXNlIGFuZCB0aGF0IHRoZSBjYXNlIHNlbnNpdGl2ZVxuICB1bmlxdWUgaW5kZXggd2lsbCBiZSB1c2VkIGJ5IHRoZSBkYiBmb3IgdGhlIHF1ZXJ5LCB0aGlzIGlzIGFuIGFkZXF1YXRlIHNvbHV0aW9uLlxuKi9cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlRW1haWwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsIHx8IHRoaXMuZGF0YS5lbWFpbC5fX29wID09PSAnRGVsZXRlJykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBWYWxpZGF0ZSBiYXNpYyBlbWFpbCBhZGRyZXNzIGZvcm1hdFxuICBpZiAoIXRoaXMuZGF0YS5lbWFpbC5tYXRjaCgvXi4rQC4rJC8pKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUywgJ0VtYWlsIGFkZHJlc3MgZm9ybWF0IGlzIGludmFsaWQuJylcbiAgICApO1xuICB9XG4gIC8vIENhc2UgaW5zZW5zaXRpdmUgbWF0Y2gsIHNlZSBub3RlIGFib3ZlIGZ1bmN0aW9uLlxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICAhdGhpcy5kYXRhLmF1dGhEYXRhIHx8XG4gICAgICAgICFPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCB8fFxuICAgICAgICAoT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggPT09IDEgJiZcbiAgICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpWzBdID09PSAnYW5vbnltb3VzJylcbiAgICAgICkge1xuICAgICAgICAvLyBXZSB1cGRhdGVkIHRoZSBlbWFpbCwgc2VuZCBhIG5ldyB2YWxpZGF0aW9uXG4gICAgICAgIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10gPSB0cnVlO1xuICAgICAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZXRFbWFpbFZlcmlmeVRva2VuKHRoaXMuZGF0YSk7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5KSByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzKCkudGhlbigoKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5KCk7XG4gIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gY2hlY2sgaWYgdGhlIHBhc3N3b3JkIGNvbmZvcm1zIHRvIHRoZSBkZWZpbmVkIHBhc3N3b3JkIHBvbGljeSBpZiBjb25maWd1cmVkXG4gIC8vIElmIHdlIHNwZWNpZmllZCBhIGN1c3RvbSBlcnJvciBpbiBvdXIgY29uZmlndXJhdGlvbiB1c2UgaXQuXG4gIC8vIEV4YW1wbGU6IFwiUGFzc3dvcmRzIG11c3QgaW5jbHVkZSBhIENhcGl0YWwgTGV0dGVyLCBMb3dlcmNhc2UgTGV0dGVyLCBhbmQgYSBudW1iZXIuXCJcbiAgLy9cbiAgLy8gVGhpcyBpcyBlc3BlY2lhbGx5IHVzZWZ1bCBvbiB0aGUgZ2VuZXJpYyBcInBhc3N3b3JkIHJlc2V0XCIgcGFnZSxcbiAgLy8gYXMgaXQgYWxsb3dzIHRoZSBwcm9ncmFtbWVyIHRvIGNvbW11bmljYXRlIHNwZWNpZmljIHJlcXVpcmVtZW50cyBpbnN0ZWFkIG9mOlxuICAvLyBhLiBtYWtpbmcgdGhlIHVzZXIgZ3Vlc3Mgd2hhdHMgd3JvbmdcbiAgLy8gYi4gbWFraW5nIGEgY3VzdG9tIHBhc3N3b3JkIHJlc2V0IHBhZ2UgdGhhdCBzaG93cyB0aGUgcmVxdWlyZW1lbnRzXG4gIGNvbnN0IHBvbGljeUVycm9yID0gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgPyB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0aW9uRXJyb3JcbiAgICA6ICdQYXNzd29yZCBkb2VzIG5vdCBtZWV0IHRoZSBQYXNzd29yZCBQb2xpY3kgcmVxdWlyZW1lbnRzLic7XG4gIGNvbnN0IGNvbnRhaW5zVXNlcm5hbWVFcnJvciA9ICdQYXNzd29yZCBjYW5ub3QgY29udGFpbiB5b3VyIHVzZXJuYW1lLic7XG5cbiAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgbWVldHMgdGhlIHBhc3N3b3JkIHN0cmVuZ3RoIHJlcXVpcmVtZW50c1xuICBpZiAoXG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IgJiZcbiAgICAgICF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yKHRoaXMuZGF0YS5wYXNzd29yZCkpIHx8XG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sodGhpcy5kYXRhLnBhc3N3b3JkKSlcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBwb2xpY3lFcnJvcikpO1xuICB9XG5cbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBjb250YWluIHVzZXJuYW1lXG4gIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgPT09IHRydWUpIHtcbiAgICBpZiAodGhpcy5kYXRhLnVzZXJuYW1lKSB7XG4gICAgICAvLyB1c2VybmFtZSBpcyBub3QgcGFzc2VkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHRoaXMuZGF0YS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBjb250YWluc1VzZXJuYW1lRXJyb3IpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcmV0cmlldmUgdGhlIFVzZXIgb2JqZWN0IHVzaW5nIG9iamVjdElkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZihyZXN1bHRzWzBdLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBjb250YWluc1VzZXJuYW1lRXJyb3IpXG4gICAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5ID0gZnVuY3Rpb24gKCkge1xuICAvLyBjaGVjayB3aGV0aGVyIHBhc3N3b3JkIGlzIHJlcGVhdGluZyBmcm9tIHNwZWNpZmllZCBoaXN0b3J5XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmZpbmQoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICB7IGtleXM6IFsnX3Bhc3N3b3JkX2hpc3RvcnknLCAnX2hhc2hlZF9wYXNzd29yZCddIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgbGV0IG9sZFBhc3N3b3JkcyA9IFtdO1xuICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSlcbiAgICAgICAgICBvbGRQYXNzd29yZHMgPSBfLnRha2UoXG4gICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IC0gMVxuICAgICAgICAgICk7XG4gICAgICAgIG9sZFBhc3N3b3Jkcy5wdXNoKHVzZXIucGFzc3dvcmQpO1xuICAgICAgICBjb25zdCBuZXdQYXNzd29yZCA9IHRoaXMuZGF0YS5wYXNzd29yZDtcbiAgICAgICAgLy8gY29tcGFyZSB0aGUgbmV3IHBhc3N3b3JkIGhhc2ggd2l0aCBhbGwgb2xkIHBhc3N3b3JkIGhhc2hlc1xuICAgICAgICBjb25zdCBwcm9taXNlcyA9IG9sZFBhc3N3b3Jkcy5tYXAoZnVuY3Rpb24gKGhhc2gpIHtcbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShuZXdQYXNzd29yZCwgaGFzaCkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdClcbiAgICAgICAgICAgICAgLy8gcmVqZWN0IGlmIHRoZXJlIGlzIGEgbWF0Y2hcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KCdSRVBFQVRfUEFTU1dPUkQnKTtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIHdhaXQgZm9yIGFsbCBjb21wYXJpc29ucyB0byBjb21wbGV0ZVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyID09PSAnUkVQRUFUX1BBU1NXT1JEJylcbiAgICAgICAgICAgICAgLy8gYSBtYXRjaCB3YXMgZm91bmRcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgICAgICAgICBgTmV3IHBhc3N3b3JkIHNob3VsZCBub3QgYmUgdGhlIHNhbWUgYXMgbGFzdCAke3RoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeX0gcGFzc3dvcmRzLmBcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgc2Vzc2lvbiBmb3IgdXBkYXRpbmcgdXNlciAodGhpcy5xdWVyeSBpcyBzZXQpIHVubGVzcyBhdXRoRGF0YSBleGlzdHNcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBuZXcgc2Vzc2lvblRva2VuIGlmIGxpbmtpbmcgdmlhIHNlc3Npb25Ub2tlblxuICBpZiAodGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChcbiAgICAhdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciAmJiAvLyBzaWdudXAgY2FsbCwgd2l0aFxuICAgIHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiYgLy8gbm8gbG9naW4gd2l0aG91dCB2ZXJpZmljYXRpb25cbiAgICB0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzXG4gICkge1xuICAgIC8vIHZlcmlmaWNhdGlvbiBpcyBvblxuICAgIHJldHVybjsgLy8gZG8gbm90IGNyZWF0ZSB0aGUgc2Vzc2lvbiB0b2tlbiBpbiB0aGF0IGNhc2UhXG4gIH1cbiAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy8gY2xvdWQgaW5zdGFsbGF0aW9uSWQgZnJvbSBDbG91ZCBDb2RlLFxuICAvLyBuZXZlciBjcmVhdGUgc2Vzc2lvbiB0b2tlbnMgZnJvbSB0aGVyZS5cbiAgaWYgKHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCAmJiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQgPT09ICdjbG91ZCcpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciA9PSBudWxsICYmIHRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmpvaW4oJywnKTtcbiAgfVxuXG4gIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHRoaXMuY29uZmlnLCB7XG4gICAgdXNlcklkOiB0aGlzLm9iamVjdElkKCksXG4gICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgIGFjdGlvbjogdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciA/ICdsb2dpbicgOiAnc2lnbnVwJyxcbiAgICAgIGF1dGhQcm92aWRlcjogdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciB8fCAncGFzc3dvcmQnLFxuICAgIH0sXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCxcbiAgfSk7XG5cbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2Uuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgcmV0dXJuIGNyZWF0ZVNlc3Npb24oKTtcbn07XG5cblJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uID0gZnVuY3Rpb24gKFxuICBjb25maWcsXG4gIHsgdXNlcklkLCBjcmVhdGVkV2l0aCwgaW5zdGFsbGF0aW9uSWQsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSB9XG4pIHtcbiAgY29uc3QgdG9rZW4gPSAncjonICsgY3J5cHRvVXRpbHMubmV3VG9rZW4oKTtcbiAgY29uc3QgZXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCgpO1xuICBjb25zdCBzZXNzaW9uRGF0YSA9IHtcbiAgICBzZXNzaW9uVG9rZW46IHRva2VuLFxuICAgIHVzZXI6IHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICB9LFxuICAgIGNyZWF0ZWRXaXRoLFxuICAgIGV4cGlyZXNBdDogUGFyc2UuX2VuY29kZShleHBpcmVzQXQpLFxuICB9O1xuXG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIHNlc3Npb25EYXRhLmluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQ7XG4gIH1cblxuICBPYmplY3QuYXNzaWduKHNlc3Npb25EYXRhLCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEpO1xuXG4gIHJldHVybiB7XG4gICAgc2Vzc2lvbkRhdGEsXG4gICAgY3JlYXRlU2Vzc2lvbjogKCkgPT5cbiAgICAgIG5ldyBSZXN0V3JpdGUoY29uZmlnLCBBdXRoLm1hc3Rlcihjb25maWcpLCAnX1Nlc3Npb24nLCBudWxsLCBzZXNzaW9uRGF0YSkuZXhlY3V0ZSgpLFxuICB9O1xufTtcblxuLy8gRGVsZXRlIGVtYWlsIHJlc2V0IHRva2VucyBpZiB1c2VyIGlzIGNoYW5naW5nIHBhc3N3b3JkIG9yIGVtYWlsLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5kZWxldGVFbWFpbFJlc2V0VG9rZW5JZk5lZWRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8IHRoaXMucXVlcnkgPT09IG51bGwpIHtcbiAgICAvLyBudWxsIHF1ZXJ5IG1lYW5zIGNyZWF0ZVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICgncGFzc3dvcmQnIGluIHRoaXMuZGF0YSB8fCAnZW1haWwnIGluIHRoaXMuZGF0YSkge1xuICAgIGNvbnN0IGFkZE9wcyA9IHtcbiAgICAgIF9wZXJpc2hhYmxlX3Rva2VuOiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgICBfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0OiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgfTtcbiAgICB0aGlzLmRhdGEgPSBPYmplY3QuYXNzaWduKHRoaXMuZGF0YSwgYWRkT3BzKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zID0gZnVuY3Rpb24gKCkge1xuICAvLyBPbmx5IGZvciBfU2Vzc2lvbiwgYW5kIGF0IGNyZWF0aW9uIHRpbWVcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9ICdfU2Vzc2lvbicgfHwgdGhpcy5xdWVyeSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEZXN0cm95IHRoZSBzZXNzaW9ucyBpbiAnQmFja2dyb3VuZCdcbiAgY29uc3QgeyB1c2VyLCBpbnN0YWxsYXRpb25JZCwgc2Vzc2lvblRva2VuIH0gPSB0aGlzLmRhdGE7XG4gIGlmICghdXNlciB8fCAhaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF1c2VyLm9iamVjdElkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koXG4gICAgJ19TZXNzaW9uJyxcbiAgICB7XG4gICAgICB1c2VyLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICBzZXNzaW9uVG9rZW46IHsgJG5lOiBzZXNzaW9uVG9rZW4gfSxcbiAgICB9LFxuICAgIHt9LFxuICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICk7XG59O1xuXG4vLyBIYW5kbGVzIGFueSBmb2xsb3d1cCBsb2dpY1xuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVGb2xsb3d1cCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXSAmJiB0aGlzLmNvbmZpZy5yZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0KSB7XG4gICAgdmFyIHNlc3Npb25RdWVyeSA9IHtcbiAgICAgIHVzZXI6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ107XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZGVzdHJveSgnX1Nlc3Npb24nLCBzZXNzaW9uUXVlcnkpXG4gICAgICAudGhlbih0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcykpO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddKSB7XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ107XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCkudGhlbih0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcykpO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddKSB7XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ107XG4gICAgLy8gRmlyZSBhbmQgZm9yZ2V0IVxuICAgIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCh0aGlzLmRhdGEpO1xuICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcyk7XG4gIH1cbn07XG5cbi8vIEhhbmRsZXMgdGhlIF9TZXNzaW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gX1Nlc3Npb24gb2JqZWN0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVTZXNzaW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLmNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLnVzZXIgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdTZXNzaW9uIHRva2VuIHJlcXVpcmVkLicpO1xuICB9XG5cbiAgLy8gVE9ETzogVmVyaWZ5IHByb3BlciBlcnJvciB0byB0aHJvd1xuICBpZiAodGhpcy5kYXRhLkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnQ2Fubm90IHNldCAnICsgJ0FDTCBvbiBhIFNlc3Npb24uJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmIHRoaXMuZGF0YS51c2VyLm9iamVjdElkICE9IHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9XG4gICAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgIHRoaXMucXVlcnkgPSB7XG4gICAgICAgICRhbmQ6IFtcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVzZXI6IHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGNvbnN0IGFkZGl0aW9uYWxTZXNzaW9uRGF0YSA9IHt9O1xuICAgIGZvciAodmFyIGtleSBpbiB0aGlzLmRhdGEpIHtcbiAgICAgIGlmIChrZXkgPT09ICdvYmplY3RJZCcgfHwga2V5ID09PSAndXNlcicpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBhZGRpdGlvbmFsU2Vzc2lvbkRhdGFba2V5XSA9IHRoaXMuZGF0YVtrZXldO1xuICAgIH1cblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHRoaXMuY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnY3JlYXRlJyxcbiAgICAgIH0sXG4gICAgICBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEsXG4gICAgfSk7XG5cbiAgICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAoIXJlc3VsdHMucmVzcG9uc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgJ0Vycm9yIGNyZWF0aW5nIHNlc3Npb24uJyk7XG4gICAgICB9XG4gICAgICBzZXNzaW9uRGF0YVsnb2JqZWN0SWQnXSA9IHJlc3VsdHMucmVzcG9uc2VbJ29iamVjdElkJ107XG4gICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICBzdGF0dXM6IDIwMSxcbiAgICAgICAgbG9jYXRpb246IHJlc3VsdHMubG9jYXRpb24sXG4gICAgICAgIHJlc3BvbnNlOiBzZXNzaW9uRGF0YSxcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cbn07XG5cbi8vIEhhbmRsZXMgdGhlIF9JbnN0YWxsYXRpb24gY2xhc3Mgc3BlY2lhbG5lc3MuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhbiBpbnN0YWxsYXRpb24gb2JqZWN0LlxuLy8gSWYgYW4gaW5zdGFsbGF0aW9uIGlzIGZvdW5kLCB0aGlzIGNhbiBtdXRhdGUgdGhpcy5xdWVyeSBhbmQgdHVybiBhIGNyZWF0ZVxuLy8gaW50byBhbiB1cGRhdGUuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hlbiB3ZSdyZSBkb25lIGlmIGl0IGNhbid0IGZpbmlzaCB0aGlzIHRpY2suXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUluc3RhbGxhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgfHwgdGhpcy5jbGFzc05hbWUgIT09ICdfSW5zdGFsbGF0aW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChcbiAgICAhdGhpcy5xdWVyeSAmJlxuICAgICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiZcbiAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgIXRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZFxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAxMzUsXG4gICAgICAnYXQgbGVhc3Qgb25lIElEIGZpZWxkIChkZXZpY2VUb2tlbiwgaW5zdGFsbGF0aW9uSWQpICcgKyAnbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nXG4gICAgKTtcbiAgfVxuXG4gIC8vIElmIHRoZSBkZXZpY2UgdG9rZW4gaXMgNjQgY2hhcmFjdGVycyBsb25nLCB3ZSBhc3N1bWUgaXQgaXMgZm9yIGlPU1xuICAvLyBhbmQgbG93ZXJjYXNlIGl0LlxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuICYmIHRoaXMuZGF0YS5kZXZpY2VUb2tlbi5sZW5ndGggPT0gNjQpIHtcbiAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4udG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIC8vIFdlIGxvd2VyY2FzZSB0aGUgaW5zdGFsbGF0aW9uSWQgaWYgcHJlc2VudFxuICBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICBsZXQgaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQ7XG5cbiAgLy8gSWYgZGF0YS5pbnN0YWxsYXRpb25JZCBpcyBub3Qgc2V0IGFuZCB3ZSdyZSBub3QgbWFzdGVyLCB3ZSBjYW4gbG9va3VwIGluIGF1dGhcbiAgaWYgKCFpbnN0YWxsYXRpb25JZCAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cblxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBpbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBVcGRhdGluZyBfSW5zdGFsbGF0aW9uIGJ1dCBub3QgdXBkYXRpbmcgYW55dGhpbmcgY3JpdGljYWxcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiAhaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuZGF0YS5kZXZpY2VUeXBlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcblxuICB2YXIgaWRNYXRjaDsgLy8gV2lsbCBiZSBhIG1hdGNoIG9uIGVpdGhlciBvYmplY3RJZCBvciBpbnN0YWxsYXRpb25JZFxuICB2YXIgb2JqZWN0SWRNYXRjaDtcbiAgdmFyIGluc3RhbGxhdGlvbklkTWF0Y2g7XG4gIHZhciBkZXZpY2VUb2tlbk1hdGNoZXMgPSBbXTtcblxuICAvLyBJbnN0ZWFkIG9mIGlzc3VpbmcgMyByZWFkcywgbGV0J3MgZG8gaXQgd2l0aCBvbmUgT1IuXG4gIGNvbnN0IG9yUXVlcmllcyA9IFtdO1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goe1xuICAgICAgb2JqZWN0SWQ6IHRoaXMucXVlcnkub2JqZWN0SWQsXG4gICAgfSk7XG4gIH1cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goe1xuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuICB9XG4gIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7IGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gfSk7XG4gIH1cblxuICBpZiAob3JRdWVyaWVzLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcHJvbWlzZSA9IHByb21pc2VcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgJ19JbnN0YWxsYXRpb24nLFxuICAgICAgICB7XG4gICAgICAgICAgJG9yOiBvclF1ZXJpZXMsXG4gICAgICAgIH0sXG4gICAgICAgIHt9XG4gICAgICApO1xuICAgIH0pXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiByZXN1bHQub2JqZWN0SWQgPT0gdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIG9iamVjdElkTWF0Y2ggPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc3VsdC5pbnN0YWxsYXRpb25JZCA9PSBpbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgIGluc3RhbGxhdGlvbklkTWF0Y2ggPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc3VsdC5kZXZpY2VUb2tlbiA9PSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICAgICAgICBkZXZpY2VUb2tlbk1hdGNoZXMucHVzaChyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gU2FuaXR5IGNoZWNrcyB3aGVuIHJ1bm5pbmcgYSBxdWVyeVxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICBpZiAoIW9iamVjdElkTWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQgZm9yIHVwZGF0ZS4nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAhPT0gb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZFxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCAnaW5zdGFsbGF0aW9uSWQgbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgICAgICAgb2JqZWN0SWRNYXRjaC5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgICF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICAhb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZFxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCAnZGV2aWNlVG9rZW4gbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICE9PSBvYmplY3RJZE1hdGNoLmRldmljZVR5cGVcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2RldmljZVR5cGUgbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIG9iamVjdElkTWF0Y2gpIHtcbiAgICAgICAgaWRNYXRjaCA9IG9iamVjdElkTWF0Y2g7XG4gICAgICB9XG5cbiAgICAgIGlmIChpbnN0YWxsYXRpb25JZCAmJiBpbnN0YWxsYXRpb25JZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gbmVlZCB0byBzcGVjaWZ5IGRldmljZVR5cGUgb25seSBpZiBpdCdzIG5ld1xuICAgICAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJiAhaWRNYXRjaCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM1LCAnZGV2aWNlVHlwZSBtdXN0IGJlIHNwZWNpZmllZCBpbiB0aGlzIG9wZXJhdGlvbicpO1xuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKCFpZE1hdGNoKSB7XG4gICAgICAgIGlmICghZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoID09IDEgJiZcbiAgICAgICAgICAoIWRldmljZVRva2VuTWF0Y2hlc1swXVsnaW5zdGFsbGF0aW9uSWQnXSB8fCAhaW5zdGFsbGF0aW9uSWQpXG4gICAgICAgICkge1xuICAgICAgICAgIC8vIFNpbmdsZSBtYXRjaCBvbiBkZXZpY2UgdG9rZW4gYnV0IG5vbmUgb24gaW5zdGFsbGF0aW9uSWQsIGFuZCBlaXRoZXJcbiAgICAgICAgICAvLyB0aGUgcGFzc2VkIG9iamVjdCBvciB0aGUgbWF0Y2ggaXMgbWlzc2luZyBhbiBpbnN0YWxsYXRpb25JZCwgc28gd2VcbiAgICAgICAgICAvLyBjYW4ganVzdCByZXR1cm4gdGhlIG1hdGNoLlxuICAgICAgICAgIHJldHVybiBkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ29iamVjdElkJ107XG4gICAgICAgIH0gZWxzZSBpZiAoIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIDEzMixcbiAgICAgICAgICAgICdNdXN0IHNwZWNpZnkgaW5zdGFsbGF0aW9uSWQgd2hlbiBkZXZpY2VUb2tlbiAnICtcbiAgICAgICAgICAgICAgJ21hdGNoZXMgbXVsdGlwbGUgSW5zdGFsbGF0aW9uIG9iamVjdHMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBNdWx0aXBsZSBkZXZpY2UgdG9rZW4gbWF0Y2hlcyBhbmQgd2Ugc3BlY2lmaWVkIGFuIGluc3RhbGxhdGlvbiBJRCxcbiAgICAgICAgICAvLyBvciBhIHNpbmdsZSBtYXRjaCB3aGVyZSBib3RoIHRoZSBwYXNzZWQgYW5kIG1hdGNoaW5nIG9iamVjdHMgaGF2ZVxuICAgICAgICAgIC8vIGFuIGluc3RhbGxhdGlvbiBJRC4gVHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoXG4gICAgICAgICAgLy8gdGhlIGRldmljZVRva2VuLCBhbmQgcmV0dXJuIG5pbCB0byBzaWduYWwgdGhhdCBhIG5ldyBvYmplY3Qgc2hvdWxkXG4gICAgICAgICAgLy8gYmUgY3JlYXRlZC5cbiAgICAgICAgICB2YXIgZGVsUXVlcnkgPSB7XG4gICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHtcbiAgICAgICAgICAgICAgJG5lOiBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhLmFwcElkZW50aWZpZXIpIHtcbiAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWQuXG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmICFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10pIHtcbiAgICAgICAgICAvLyBFeGFjdGx5IG9uZSBkZXZpY2UgdG9rZW4gbWF0Y2ggYW5kIGl0IGRvZXNuJ3QgaGF2ZSBhbiBpbnN0YWxsYXRpb25cbiAgICAgICAgICAvLyBJRC4gVGhpcyBpcyB0aGUgb25lIGNhc2Ugd2hlcmUgd2Ugd2FudCB0byBtZXJnZSB3aXRoIHRoZSBleGlzdGluZ1xuICAgICAgICAgIC8vIG9iamVjdC5cbiAgICAgICAgICBjb25zdCBkZWxRdWVyeSA9IHsgb2JqZWN0SWQ6IGlkTWF0Y2gub2JqZWN0SWQgfTtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgICAgIC5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ29iamVjdElkJ107XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWRcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiBpZE1hdGNoLmRldmljZVRva2VuICE9IHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgICAgICAgICAgLy8gV2UncmUgc2V0dGluZyB0aGUgZGV2aWNlIHRva2VuIG9uIGFuIGV4aXN0aW5nIGluc3RhbGxhdGlvbiwgc29cbiAgICAgICAgICAgIC8vIHdlIHNob3VsZCB0cnkgY2xlYW5pbmcgb3V0IG9sZCBpbnN0YWxsYXRpb25zIHRoYXQgbWF0Y2ggdGhpc1xuICAgICAgICAgICAgLy8gZGV2aWNlIHRva2VuLlxuICAgICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7XG4gICAgICAgICAgICAgIGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgLy8gV2UgaGF2ZSBhIHVuaXF1ZSBpbnN0YWxsIElkLCB1c2UgdGhhdCB0byBwcmVzZXJ2ZVxuICAgICAgICAgICAgLy8gdGhlIGludGVyZXN0aW5nIGluc3RhbGxhdGlvblxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgICAgICBkZWxRdWVyeVsnaW5zdGFsbGF0aW9uSWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICAgIGlkTWF0Y2gub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIGlkTWF0Y2gub2JqZWN0SWQgPT0gdGhpcy5kYXRhLm9iamVjdElkXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgLy8gd2UgcGFzc2VkIGFuIG9iamVjdElkLCBwcmVzZXJ2ZSB0aGF0IGluc3RhbGF0aW9uXG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydvYmplY3RJZCddID0ge1xuICAgICAgICAgICAgICAgICRuZTogaWRNYXRjaC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIFdoYXQgdG8gZG8gaGVyZT8gY2FuJ3QgcmVhbGx5IGNsZWFuIHVwIGV2ZXJ5dGhpbmcuLi5cbiAgICAgICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhLmFwcElkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2FwcElkZW50aWZpZXInXSA9IHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gSW4gbm9uLW1lcmdlIHNjZW5hcmlvcywganVzdCByZXR1cm4gdGhlIGluc3RhbGxhdGlvbiBtYXRjaCBpZFxuICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICAudGhlbihvYmpJZCA9PiB7XG4gICAgICBpZiAob2JqSWQpIHtcbiAgICAgICAgdGhpcy5xdWVyeSA9IHsgb2JqZWN0SWQ6IG9iaklkIH07XG4gICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuICAgICAgfVxuICAgICAgLy8gVE9ETzogVmFsaWRhdGUgb3BzIChhZGQvcmVtb3ZlIG9uIGNoYW5uZWxzLCAkaW5jIG9uIGJhZGdlLCBldGMuKVxuICAgIH0pO1xuICByZXR1cm4gcHJvbWlzZTtcbn07XG5cbi8vIElmIHdlIHNob3J0LWNpcmN1aXRlZCB0aGUgb2JqZWN0IHJlc3BvbnNlIC0gdGhlbiB3ZSBuZWVkIHRvIG1ha2Ugc3VyZSB3ZSBleHBhbmQgYWxsIHRoZSBmaWxlcyxcbi8vIHNpbmNlIHRoaXMgbWlnaHQgbm90IGhhdmUgYSBxdWVyeSwgbWVhbmluZyBpdCB3b24ndCByZXR1cm4gdGhlIGZ1bGwgcmVzdWx0IGJhY2suXG4vLyBUT0RPOiAobmx1dHNlbmtvKSBUaGlzIHNob3VsZCBkaWUgd2hlbiB3ZSBtb3ZlIHRvIHBlci1jbGFzcyBiYXNlZCBjb250cm9sbGVycyBvbiBfU2Vzc2lvbi9fVXNlclxuUmVzdFdyaXRlLnByb3RvdHlwZS5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gQ2hlY2sgd2hldGhlciB3ZSBoYXZlIGEgc2hvcnQtY2lyY3VpdGVkIHJlc3BvbnNlIC0gb25seSB0aGVuIHJ1biBleHBhbnNpb24uXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgdGhpcy5yZXNwb25zZS5yZXNwb25zZSk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuRGF0YWJhc2VPcGVyYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1JvbGUnKSB7XG4gICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnJvbGUuY2xlYXIoKTtcbiAgICBpZiAodGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlcikge1xuICAgICAgdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5jbGVhckNhY2hlZFJvbGVzKHRoaXMuYXV0aC51c2VyKTtcbiAgICB9XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiYgdGhpcy5xdWVyeSAmJiB0aGlzLmF1dGguaXNVbmF1dGhlbnRpY2F0ZWQoKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlNFU1NJT05fTUlTU0lORyxcbiAgICAgIGBDYW5ub3QgbW9kaWZ5IHVzZXIgJHt0aGlzLnF1ZXJ5Lm9iamVjdElkfS5gXG4gICAgKTtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Qcm9kdWN0JyAmJiB0aGlzLmRhdGEuZG93bmxvYWQpIHtcbiAgICB0aGlzLmRhdGEuZG93bmxvYWROYW1lID0gdGhpcy5kYXRhLmRvd25sb2FkLm5hbWU7XG4gIH1cblxuICAvLyBUT0RPOiBBZGQgYmV0dGVyIGRldGVjdGlvbiBmb3IgQUNMLCBlbnN1cmluZyBhIHVzZXIgY2FuJ3QgYmUgbG9ja2VkIGZyb21cbiAgLy8gICAgICAgdGhlaXIgb3duIHVzZXIgcmVjb3JkLlxuICBpZiAodGhpcy5kYXRhLkFDTCAmJiB0aGlzLmRhdGEuQUNMWycqdW5yZXNvbHZlZCddKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQUNMLCAnSW52YWxpZCBBQ0wuJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIC8vIEZvcmNlIHRoZSB1c2VyIHRvIG5vdCBsb2Nrb3V0XG4gICAgLy8gTWF0Y2hlZCB3aXRoIHBhcnNlLmNvbVxuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiB0aGlzLmRhdGEuQUNMICYmIHRoaXMuYXV0aC5pc01hc3RlciAhPT0gdHJ1ZSkge1xuICAgICAgdGhpcy5kYXRhLkFDTFt0aGlzLnF1ZXJ5Lm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICB9XG4gICAgLy8gdXBkYXRlIHBhc3N3b3JkIHRpbWVzdGFtcCBpZiB1c2VyIHBhc3N3b3JkIGlzIGJlaW5nIGNoYW5nZWRcbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICkge1xuICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKTtcbiAgICB9XG4gICAgLy8gSWdub3JlIGNyZWF0ZWRBdCB3aGVuIHVwZGF0ZVxuICAgIGRlbGV0ZSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuXG4gICAgbGV0IGRlZmVyID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgLy8gaWYgcGFzc3dvcmQgaGlzdG9yeSBpcyBlbmFibGVkIHRoZW4gc2F2ZSB0aGUgY3VycmVudCBwYXNzd29yZCB0byBoaXN0b3J5XG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5XG4gICAgKSB7XG4gICAgICBkZWZlciA9IHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9XG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgbGV0IG9sZFBhc3N3b3JkcyA9IFtdO1xuICAgICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMgPSBfLnRha2UoXG4gICAgICAgICAgICAgIHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnksXG4gICAgICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy9uLTEgcGFzc3dvcmRzIGdvIGludG8gaGlzdG9yeSBpbmNsdWRpbmcgbGFzdCBwYXNzd29yZFxuICAgICAgICAgIHdoaWxlIChcbiAgICAgICAgICAgIG9sZFBhc3N3b3Jkcy5sZW5ndGggPiBNYXRoLm1heCgwLCB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgLSAyKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzLnNoaWZ0KCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9sZFBhc3N3b3Jkcy5wdXNoKHVzZXIucGFzc3dvcmQpO1xuICAgICAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfaGlzdG9yeSA9IG9sZFBhc3N3b3JkcztcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlZmVyLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gUnVuIGFuIHVwZGF0ZVxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC51cGRhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgIHJlc3BvbnNlLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZSA9IHsgcmVzcG9uc2UgfTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gU2V0IHRoZSBkZWZhdWx0IEFDTCBhbmQgcGFzc3dvcmQgdGltZXN0YW1wIGZvciB0aGUgbmV3IF9Vc2VyXG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICB2YXIgQUNMID0gdGhpcy5kYXRhLkFDTDtcbiAgICAgIC8vIGRlZmF1bHQgcHVibGljIHIvdyBBQ0xcbiAgICAgIGlmICghQUNMKSB7XG4gICAgICAgIEFDTCA9IHt9O1xuICAgICAgICBpZiAoIXRoaXMuY29uZmlnLmVuZm9yY2VQcml2YXRlVXNlcnMpIHtcbiAgICAgICAgICBBQ0xbJyonXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IGZhbHNlIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIG1ha2Ugc3VyZSB0aGUgdXNlciBpcyBub3QgbG9ja2VkIGRvd25cbiAgICAgIEFDTFt0aGlzLmRhdGEub2JqZWN0SWRdID0geyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9O1xuICAgICAgdGhpcy5kYXRhLkFDTCA9IEFDTDtcbiAgICAgIC8vIHBhc3N3b3JkIHRpbWVzdGFtcCB0byBiZSB1c2VkIHdoZW4gcGFzc3dvcmQgZXhwaXJ5IHBvbGljeSBpcyBlbmZvcmNlZFxuICAgICAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlKSB7XG4gICAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUnVuIGEgY3JlYXRlXG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuY3JlYXRlKHRoaXMuY2xhc3NOYW1lLCB0aGlzLmRhdGEsIHRoaXMucnVuT3B0aW9ucywgZmFsc2UsIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8IGVycm9yLmNvZGUgIT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUXVpY2sgY2hlY2ssIGlmIHdlIHdlcmUgYWJsZSB0byBpbmZlciB0aGUgZHVwbGljYXRlZCBmaWVsZCBuYW1lXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci51c2VySW5mbyAmJiBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAndXNlcm5hbWUnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci51c2VySW5mbyAmJiBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAnZW1haWwnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhpcyB3YXMgYSBmYWlsZWQgdXNlciBjcmVhdGlvbiBkdWUgdG8gdXNlcm5hbWUgb3IgZW1haWwgYWxyZWFkeSB0YWtlbiwgd2UgbmVlZCB0b1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIGl0IHdhcyB1c2VybmFtZSBvciBlbWFpbCBhbmQgcmV0dXJuIHRoZSBhcHByb3ByaWF0ZSBlcnJvci5cbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gdGhlIG9yaWdpbmFsIG1ldGhvZFxuICAgICAgICAvLyBUT0RPOiBTZWUgaWYgd2UgY2FuIGxhdGVyIGRvIHRoaXMgd2l0aG91dCBhZGRpdGlvbmFsIHF1ZXJpZXMgYnkgdXNpbmcgbmFtZWQgaW5kZXhlcy5cbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgLmZpbmQoXG4gICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICApXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICAgIHsgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCwgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSB9LFxuICAgICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIHJlc3BvbnNlLm9iamVjdElkID0gdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICByZXNwb25zZS5jcmVhdGVkQXQgPSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuXG4gICAgICAgIGlmICh0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lKSB7XG4gICAgICAgICAgcmVzcG9uc2UudXNlcm5hbWUgPSB0aGlzLmRhdGEudXNlcm5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgICBzdGF0dXM6IDIwMSxcbiAgICAgICAgICByZXNwb25zZSxcbiAgICAgICAgICBsb2NhdGlvbjogdGhpcy5sb2NhdGlvbigpLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gIH1cbn07XG5cbi8vIFJldHVybnMgbm90aGluZyAtIGRvZXNuJ3Qgd2FpdCBmb3IgdGhlIHRyaWdnZXIuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkFmdGVyU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5yZXNwb25zZSB8fCAhdGhpcy5yZXNwb25zZS5yZXNwb25zZSB8fCB0aGlzLnJ1bk9wdGlvbnMubWFueSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2FmdGVyU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgY29uc3QgaGFzQWZ0ZXJTYXZlSG9vayA9IHRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgKTtcbiAgY29uc3QgaGFzTGl2ZVF1ZXJ5ID0gdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5oYXNMaXZlUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBpZiAoIWhhc0FmdGVyU2F2ZUhvb2sgJiYgIWhhc0xpdmVRdWVyeSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgdXBkYXRlZE9iamVjdC5faGFuZGxlU2F2ZVJlc3BvbnNlKHRoaXMucmVzcG9uc2UucmVzcG9uc2UsIHRoaXMucmVzcG9uc2Uuc3RhdHVzIHx8IDIwMCk7XG5cbiAgdGhpcy5jb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgLy8gTm90aWZpeSBMaXZlUXVlcnlTZXJ2ZXIgaWYgcG9zc2libGVcbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYUNvbnRyb2xsZXIuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKHVwZGF0ZWRPYmplY3QuY2xhc3NOYW1lKTtcbiAgICB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLm9uQWZ0ZXJTYXZlKFxuICAgICAgdXBkYXRlZE9iamVjdC5jbGFzc05hbWUsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICBwZXJtc1xuICAgICk7XG4gIH0pO1xuXG4gIC8vIFJ1biBhZnRlclNhdmUgdHJpZ2dlclxuICByZXR1cm4gdHJpZ2dlcnNcbiAgICAubWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICB0aGlzLmNvbnRleHRcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgIGNvbnN0IGpzb25SZXR1cm5lZCA9IHJlc3VsdCAmJiAhcmVzdWx0Ll90b0Z1bGxKU09OO1xuICAgICAgaWYgKGpzb25SZXR1cm5lZCkge1xuICAgICAgICB0aGlzLnBlbmRpbmdPcHMgPSB7fTtcbiAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZSA9IHJlc3VsdDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKFxuICAgICAgICAgIChyZXN1bHQgfHwgdXBkYXRlZE9iamVjdCkudG9KU09OKCksXG4gICAgICAgICAgdGhpcy5kYXRhXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSlcbiAgICAuY2F0Y2goZnVuY3Rpb24gKGVycikge1xuICAgICAgbG9nZ2VyLndhcm4oJ2FmdGVyU2F2ZSBjYXVnaHQgYW4gZXJyb3InLCBlcnIpO1xuICAgIH0pO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZmlndXJlIG91dCB3aGF0IGxvY2F0aW9uIHRoaXMgb3BlcmF0aW9uIGhhcHBlbnMgYXQuXG5SZXN0V3JpdGUucHJvdG90eXBlLmxvY2F0aW9uID0gZnVuY3Rpb24gKCkge1xuICB2YXIgbWlkZGxlID0gdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgPyAnL3VzZXJzLycgOiAnL2NsYXNzZXMvJyArIHRoaXMuY2xhc3NOYW1lICsgJy8nO1xuICBjb25zdCBtb3VudCA9IHRoaXMuY29uZmlnLm1vdW50IHx8IHRoaXMuY29uZmlnLnNlcnZlclVSTDtcbiAgcmV0dXJuIG1vdW50ICsgbWlkZGxlICsgdGhpcy5kYXRhLm9iamVjdElkO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IHRoZSBvYmplY3QgaWQgZm9yIHRoaXMgb3BlcmF0aW9uLlxuLy8gQmVjYXVzZSBpdCBjb3VsZCBiZSBlaXRoZXIgb24gdGhlIHF1ZXJ5IG9yIG9uIHRoZSBkYXRhXG5SZXN0V3JpdGUucHJvdG90eXBlLm9iamVjdElkID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5kYXRhLm9iamVjdElkIHx8IHRoaXMucXVlcnkub2JqZWN0SWQ7XG59O1xuXG4vLyBSZXR1cm5zIGEgY29weSBvZiB0aGUgZGF0YSBhbmQgZGVsZXRlIGJhZCBrZXlzIChfYXV0aF9kYXRhLCBfaGFzaGVkX3Bhc3N3b3JkLi4uKVxuUmVzdFdyaXRlLnByb3RvdHlwZS5zYW5pdGl6ZWREYXRhID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBkYXRhID0gT2JqZWN0LmtleXModGhpcy5kYXRhKS5yZWR1Y2UoKGRhdGEsIGtleSkgPT4ge1xuICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICBpZiAoIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICBkZWxldGUgZGF0YVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfSwgZGVlcGNvcHkodGhpcy5kYXRhKSk7XG4gIHJldHVybiBQYXJzZS5fZGVjb2RlKHVuZGVmaW5lZCwgZGF0YSk7XG59O1xuXG4vLyBSZXR1cm5zIGFuIHVwZGF0ZWQgY29weSBvZiB0aGUgb2JqZWN0XG5SZXN0V3JpdGUucHJvdG90eXBlLmJ1aWxkUGFyc2VPYmplY3RzID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUsIG9iamVjdElkOiB0aGlzLnF1ZXJ5Py5vYmplY3RJZCB9O1xuICBsZXQgb3JpZ2luYWxPYmplY3Q7XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvcmlnaW5hbE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIH1cblxuICBjb25zdCBjbGFzc05hbWUgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04oZXh0cmFEYXRhKTtcbiAgY29uc3QgcmVhZE9ubHlBdHRyaWJ1dGVzID0gY2xhc3NOYW1lLmNvbnN0cnVjdG9yLnJlYWRPbmx5QXR0cmlidXRlc1xuICAgID8gY2xhc3NOYW1lLmNvbnN0cnVjdG9yLnJlYWRPbmx5QXR0cmlidXRlcygpXG4gICAgOiBbXTtcbiAgaWYgKCF0aGlzLm9yaWdpbmFsRGF0YSkge1xuICAgIGZvciAoY29uc3QgYXR0cmlidXRlIG9mIHJlYWRPbmx5QXR0cmlidXRlcykge1xuICAgICAgZXh0cmFEYXRhW2F0dHJpYnV0ZV0gPSB0aGlzLmRhdGFbYXR0cmlidXRlXTtcbiAgICB9XG4gIH1cbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKGZ1bmN0aW9uIChkYXRhLCBrZXkpIHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIGlmICh0eXBlb2YgZGF0YVtrZXldLl9fb3AgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmICghcmVhZE9ubHlBdHRyaWJ1dGVzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgICAgICB1cGRhdGVkT2JqZWN0LnNldChrZXksIGRhdGFba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIHN1YmRvY3VtZW50IGtleSB3aXRoIGRvdCBub3RhdGlvbiB7ICd4LnknOiB2IH0gPT4geyAneCc6IHsgJ3knIDogdiB9IH0pXG4gICAgICAgIGNvbnN0IHNwbGl0dGVkS2V5ID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IHBhcmVudFByb3AgPSBzcGxpdHRlZEtleVswXTtcbiAgICAgICAgbGV0IHBhcmVudFZhbCA9IHVwZGF0ZWRPYmplY3QuZ2V0KHBhcmVudFByb3ApO1xuICAgICAgICBpZiAodHlwZW9mIHBhcmVudFZhbCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICBwYXJlbnRWYWwgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBwYXJlbnRWYWxbc3BsaXR0ZWRLZXlbMV1dID0gZGF0YVtrZXldO1xuICAgICAgICB1cGRhdGVkT2JqZWN0LnNldChwYXJlbnRQcm9wLCBwYXJlbnRWYWwpO1xuICAgICAgfVxuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuXG4gIGNvbnN0IHNhbml0aXplZCA9IHRoaXMuc2FuaXRpemVkRGF0YSgpO1xuICBmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiByZWFkT25seUF0dHJpYnV0ZXMpIHtcbiAgICBkZWxldGUgc2FuaXRpemVkW2F0dHJpYnV0ZV07XG4gIH1cbiAgdXBkYXRlZE9iamVjdC5zZXQoc2FuaXRpemVkKTtcbiAgcmV0dXJuIHsgdXBkYXRlZE9iamVjdCwgb3JpZ2luYWxPYmplY3QgfTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY2xlYW5Vc2VyQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgJiYgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjb25zdCB1c2VyID0gdGhpcy5yZXNwb25zZS5yZXNwb25zZTtcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhID0gZnVuY3Rpb24gKHJlc3BvbnNlLCBkYXRhKSB7XG4gIGNvbnN0IHsgdXBkYXRlZE9iamVjdCB9ID0gdGhpcy5idWlsZFBhcnNlT2JqZWN0cygpO1xuICBjb25zdCBzdGF0ZUNvbnRyb2xsZXIgPSBQYXJzZS5Db3JlTWFuYWdlci5nZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIoKTtcbiAgY29uc3QgW3BlbmRpbmddID0gc3RhdGVDb250cm9sbGVyLmdldFBlbmRpbmdPcHModXBkYXRlZE9iamVjdC5fZ2V0U3RhdGVJZGVudGlmaWVyKCkpO1xuICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLnBlbmRpbmdPcHMpIHtcbiAgICBpZiAoIXBlbmRpbmdba2V5XSkge1xuICAgICAgZGF0YVtrZXldID0gdGhpcy5vcmlnaW5hbERhdGEgPyB0aGlzLm9yaWdpbmFsRGF0YVtrZXldIDogeyBfX29wOiAnRGVsZXRlJyB9O1xuICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIucHVzaChrZXkpO1xuICAgIH1cbiAgfVxuICBjb25zdCBza2lwS2V5cyA9IFsuLi4ocmVxdWlyZWRDb2x1bW5zLnJlYWRbdGhpcy5jbGFzc05hbWVdIHx8IFtdKV07XG4gIGlmICghdGhpcy5xdWVyeSkge1xuICAgIHNraXBLZXlzLnB1c2goJ29iamVjdElkJywgJ2NyZWF0ZWRBdCcpO1xuICB9IGVsc2Uge1xuICAgIHNraXBLZXlzLnB1c2goJ3VwZGF0ZWRBdCcpO1xuICAgIGRlbGV0ZSByZXNwb25zZS5vYmplY3RJZDtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiByZXNwb25zZSkge1xuICAgIGlmIChza2lwS2V5cy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgdmFsdWUgPSByZXNwb25zZVtrZXldO1xuICAgIGlmIChcbiAgICAgIHZhbHVlID09IG51bGwgfHxcbiAgICAgICh2YWx1ZS5fX3R5cGUgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHx8XG4gICAgICB1dGlsLmlzRGVlcFN0cmljdEVxdWFsKGRhdGFba2V5XSwgdmFsdWUpIHx8XG4gICAgICB1dGlsLmlzRGVlcFN0cmljdEVxdWFsKCh0aGlzLm9yaWdpbmFsRGF0YSB8fCB7fSlba2V5XSwgdmFsdWUpXG4gICAgKSB7XG4gICAgICBkZWxldGUgcmVzcG9uc2Vba2V5XTtcbiAgICB9XG4gIH1cbiAgaWYgKF8uaXNFbXB0eSh0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlcikpIHtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cbiAgY29uc3QgY2xpZW50U3VwcG9ydHNEZWxldGUgPSBDbGllbnRTREsuc3VwcG9ydHNGb3J3YXJkRGVsZXRlKHRoaXMuY2xpZW50U0RLKTtcbiAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGNvbnN0IGRhdGFWYWx1ZSA9IGRhdGFbZmllbGROYW1lXTtcblxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3BvbnNlLCBmaWVsZE5hbWUpKSB7XG4gICAgICByZXNwb25zZVtmaWVsZE5hbWVdID0gZGF0YVZhbHVlO1xuICAgIH1cblxuICAgIC8vIFN0cmlwcyBvcGVyYXRpb25zIGZyb20gcmVzcG9uc2VzXG4gICAgaWYgKHJlc3BvbnNlW2ZpZWxkTmFtZV0gJiYgcmVzcG9uc2VbZmllbGROYW1lXS5fX29wKSB7XG4gICAgICBkZWxldGUgcmVzcG9uc2VbZmllbGROYW1lXTtcbiAgICAgIGlmIChjbGllbnRTdXBwb3J0c0RlbGV0ZSAmJiBkYXRhVmFsdWUuX19vcCA9PSAnRGVsZXRlJykge1xuICAgICAgICByZXNwb25zZVtmaWVsZE5hbWVdID0gZGF0YVZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIHJldHVybiByZXNwb25zZTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFJlc3RXcml0ZTtcbm1vZHVsZS5leHBvcnRzID0gUmVzdFdyaXRlO1xuIl19