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
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
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
  }

  // When the operation is complete, this.response may have several
  // fields.
  // response: the actual data to be returned
  // status: the http status code. if not present, treated like a 200
  // location: the location header. if not present, no location header
  this.response = null;

  // Processing this operation may mutate our data, so we operate on a
  // copy
  this.query = deepcopy(query);
  this.data = deepcopy(data);
  // We never change originalData, so we do not need a deep copy
  this.originalData = originalData;

  // The timestamp we'll use for this whole operation
  this.updatedAt = Parse._encode(new Date()).iso;

  // Shared SchemaController to be reused to reduce the number of loadSchema() calls per request
  // Once set the schemaData should be immutable
  this.validSchemaController = null;
  this.pendingOps = {};
}

// A convenient method to perform all the steps of processing the
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
};

// Uses the Auth object to get the list of roles, adds the user id
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
};

// Validates this operation against the allowClientClassCreation config.
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
};

// Validates this operation against the schema.
RestWrite.prototype.validateSchema = function () {
  return this.config.database.validateObject(this.className, this.data, this.query, this.runOptions);
};

// Runs any beforeSave triggers against this operation.
// Any change leads to our data being mutated.
RestWrite.prototype.runBeforeSaveTrigger = function () {
  if (this.response) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'beforeSave' trigger for this class.
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
    }
    // In the case that there is no permission for the operation, it throws an error
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
      this.data = response.object;
      // We should delete the objectId for an update write
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
  }

  // Cloud code gets a bit of extra data for its objects
  const extraData = {
    className: this.className
  };

  // Expand file objects
  this.config.filesController.expandFilesInObject(this.config, userData);
  const user = triggers.inflate(extraData, userData);

  // no need to return a response
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
      };

      // Add default fields
      this.data.updatedAt = this.updatedAt;
      if (!this.query) {
        this.data.createdAt = this.updatedAt;

        // Only assign new objectId if we are creating new object
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
};

// Transforms auth data for a user object.
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
    }
    // Regular users that have been locked out.
    return object.ACL && Object.keys(object.ACL).length > 0;
  });
};
RestWrite.prototype.getUserId = function () {
  if (this.query && this.query.objectId && this.className === '_User') {
    return this.query.objectId;
  } else if (this.auth && this.auth.user && this.auth.user.id) {
    return this.auth.user.id;
  }
};

// Developers are allowed to change authData via before save trigger
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
  }
  // use data.objectId in case of login time and found user during handle validateAuthData
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
  }

  // No user found with provided authData we need to validate
  if (!results.length) {
    const {
      authData: validatedAuthData,
      authDataResponse
    } = await Auth.handleAuthDataValidation(authData, this);
    this.authDataResponse = authDataResponse;
    // Replace current authData by the new validated one
    this.data.authData = validatedAuthData;
    return;
  }

  // User found with provided authData
  if (results.length === 1) {
    const userId = this.getUserId();
    const userResult = results[0];
    // Prevent duplicate authData id
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
      delete results[0].password;

      // need to set the objectId first otherwise location has trailing undefined
      this.data.objectId = userResult.objectId;
      if (!this.query || !this.query.objectId) {
        this.response = {
          response: userResult,
          location: this.location()
        };
        // Run beforeLogin hook before storing any updates
        // to authData on the db; changes to userResult
        // will be ignored.
        await this.runBeforeLoginTrigger(deepcopy(userResult));

        // If we are in login operation via authData
        // we need to be sure that the user has provided
        // required authData
        Auth.checkIfUserHasProvidedConfiguredProvidersForLogin(authData, userResult.authData, this.config);
      }

      // Prevent validating if no mutated data detected on update
      if (!hasMutatedAuthData && isCurrentUserLoggedOrMaster) {
        return;
      }

      // Force to validate all provided authData on login
      // on update only validate mutated ones
      if (hasMutatedAuthData || !this.config.allowExpiredAuthDataToken) {
        const res = await Auth.handleAuthDataValidation(isLogin ? authData : mutatedAuthData, this, userResult);
        this.data.authData = res.authData;
        this.authDataResponse = res.authDataResponse;
      }

      // IF we are in login we'll skip the database operation / beforeSave / afterSave etc...
      // we need to set it up there.
      // We are supposed to have a response only on LOGIN with authData, so we skip those
      // If we're not logging in, but just updating the current user, we can safely skip that part
      if (this.response) {
        // Assign the new authData in the response
        Object.keys(mutatedAuthData).forEach(provider => {
          this.response.response.authData[provider] = mutatedAuthData[provider];
        });

        // Run the DB update directly, as 'master' only if authData contains some keys
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
};

// The non-third-party parts of User transformation
RestWrite.prototype.transformUser = function () {
  var promise = Promise.resolve();
  if (this.className !== '_User') {
    return promise;
  }
  if (!this.auth.isMaster && 'emailVerified' in this.data) {
    const error = `Clients aren't allowed to manually update email verification.`;
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  }

  // Do not cleanup session if objectId is not set
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
      this.storage['clearSessions'] = true;
      // Generate a new session only if the user requested
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
  }
  // Validate basic email address format
  if (!this.data.email.match(/^.+@.+$/)) {
    return Promise.reject(new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.'));
  }
  // Case insensitive match, see note above function.
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
  const containsUsernameError = 'Password cannot contain your username.';

  // check whether the password meets the password strength requirements
  if (this.config.passwordPolicy.patternValidator && !this.config.passwordPolicy.patternValidator(this.data.password) || this.config.passwordPolicy.validatorCallback && !this.config.passwordPolicy.validatorCallback(this.data.password)) {
    return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, policyError));
  }

  // check whether password contain username
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
      const newPassword = this.data.password;
      // compare the new password hash with all old password hashes
      const promises = oldPasswords.map(function (hash) {
        return passwordCrypto.compare(newPassword, hash).then(result => {
          if (result)
            // reject if there is a match
            return Promise.reject('REPEAT_PASSWORD');
          return Promise.resolve();
        });
      });
      // wait for all comparisons to complete
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      }).catch(err => {
        if (err === 'REPEAT_PASSWORD')
          // a match was found
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
  }
  // Don't generate session for updating user (this.query is set) unless authData exists
  if (this.query && !this.data.authData) {
    return;
  }
  // Don't generate new sessionToken if linking via sessionToken
  if (this.auth.user && this.data.authData) {
    return;
  }
  if (!this.storage.authProvider &&
  // signup call, with
  this.config.preventLoginWithUnverifiedEmail &&
  // no login without verification
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
};

// Delete email reset tokens if user is changing password or email.
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
  }
  // Destroy the sessions in 'Background'
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
};

// Handles any followup logic
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
    delete this.storage['sendVerificationEmail'];
    // Fire and forget!
    this.config.userController.sendVerificationEmail(this.data);
    return this.handleFollowup.bind(this);
  }
};

// Handles the _Session class specialness.
// Does nothing if this isn't an _Session object.
RestWrite.prototype.handleSession = function () {
  if (this.response || this.className !== '_Session') {
    return;
  }
  if (!this.auth.user && !this.auth.isMaster) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
  }

  // TODO: Verify proper error to throw
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
};

// Handles the _Installation class specialness.
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
  }

  // If the device token is 64 characters long, we assume it is for iOS
  // and lowercase it.
  if (this.data.deviceToken && this.data.deviceToken.length == 64) {
    this.data.deviceToken = this.data.deviceToken.toLowerCase();
  }

  // We lowercase the installationId if present
  if (this.data.installationId) {
    this.data.installationId = this.data.installationId.toLowerCase();
  }
  let installationId = this.data.installationId;

  // If data.installationId is not set and we're not master, we can lookup in auth
  if (!installationId && !this.auth.isMaster) {
    installationId = this.auth.installationId;
  }
  if (installationId) {
    installationId = installationId.toLowerCase();
  }

  // Updating _Installation but not updating anything critical
  if (this.query && !this.data.deviceToken && !installationId && !this.data.deviceType) {
    return;
  }
  var promise = Promise.resolve();
  var idMatch; // Will be a match on either objectId or installationId
  var objectIdMatch;
  var installationIdMatch;
  var deviceTokenMatches = [];

  // Instead of issuing 3 reads, let's do it with one OR.
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
    });

    // Sanity checks when running a query
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
    }
    // need to specify deviceType only if it's new
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
          }
          // rethrow the error
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
          }
          // rethrow the error
          throw err;
        });
      } else {
        if (this.data.deviceToken && idMatch.deviceToken != this.data.deviceToken) {
          // We're setting the device token on an existing installation, so
          // we should try cleaning out old installations that match this
          // device token.
          const delQuery = {
            deviceToken: this.data.deviceToken
          };
          // We have a unique install Id, use that to preserve
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
            }
            // rethrow the error
            throw err;
          });
        }
        // In non-merge scenarios, just return the installation match id
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
    }
    // TODO: Validate ops (add/remove on channels, $inc on badge, etc.)
  });

  return promise;
};

// If we short-circuited the object response - then we need to make sure we expand all the files,
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
  }

  // TODO: Add better detection for ACL, ensuring a user can't be locked from
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
    }
    // update password timestamp if user password is being changed
    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
      this.data._password_changed_at = Parse._encode(new Date());
    }
    // Ignore createdAt when update
    delete this.data.createdAt;
    let defer = Promise.resolve();
    // if password history is enabled then save the current password to history
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
        }
        //n-1 passwords go into history including last password
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
      var ACL = this.data.ACL;
      // default public r/w ACL
      if (!ACL) {
        ACL = {};
        if (!this.config.enforcePrivateUsers) {
          ACL['*'] = {
            read: true,
            write: false
          };
        }
      }
      // make sure the user is not locked down
      ACL[this.data.objectId] = {
        read: true,
        write: true
      };
      this.data.ACL = ACL;
      // password timestamp to be used when password expiry policy is enforced
      if (this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
        this.data._password_changed_at = Parse._encode(new Date());
      }
    }

    // Run a create
    return this.config.database.create(this.className, this.data, this.runOptions, false, this.validSchemaController).catch(error => {
      if (this.className !== '_User' || error.code !== Parse.Error.DUPLICATE_VALUE) {
        throw error;
      }

      // Quick check, if we were able to infer the duplicated field name
      if (error && error.userInfo && error.userInfo.duplicated_field === 'username') {
        throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
      }
      if (error && error.userInfo && error.userInfo.duplicated_field === 'email') {
        throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
      }

      // If this was a failed user creation due to username or email already taken, we need to
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
};

// Returns nothing - doesn't wait for the trigger.
RestWrite.prototype.runAfterSaveTrigger = function () {
  if (!this.response || !this.response.response) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'afterSave' trigger for this class.
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
  });

  // Run afterSave trigger
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
};

// A helper to figure out what location this operation happens at.
RestWrite.prototype.location = function () {
  var middle = this.className === '_User' ? '/users/' : '/classes/' + this.className + '/';
  const mount = this.config.mount || this.config.serverURL;
  return mount + middle + this.data.objectId;
};

// A helper to get the object id for this operation.
// Because it could be either on the query or on the data
RestWrite.prototype.objectId = function () {
  return this.data.objectId || this.query.objectId;
};

// Returns a copy of the data and delete bad keys (_auth_data, _hashed_password...)
RestWrite.prototype.sanitizedData = function () {
  const data = Object.keys(this.data).reduce((data, key) => {
    // Regexp comes from Parse.Object.prototype.validate
    if (!/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
      delete data[key];
    }
    return data;
  }, deepcopy(this.data));
  return Parse._decode(undefined, data);
};

// Returns an updated copy of the object
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
    }

    // Strips operations from responses
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsImRlZXBjb3B5IiwiQXV0aCIsIlV0aWxzIiwiY3J5cHRvVXRpbHMiLCJwYXNzd29yZENyeXB0byIsIlBhcnNlIiwidHJpZ2dlcnMiLCJDbGllbnRTREsiLCJSZXN0V3JpdGUiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwicXVlcnkiLCJkYXRhIiwib3JpZ2luYWxEYXRhIiwiY2xpZW50U0RLIiwiY29udGV4dCIsImFjdGlvbiIsImlzUmVhZE9ubHkiLCJFcnJvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJzdG9yYWdlIiwicnVuT3B0aW9ucyIsImFsbG93Q3VzdG9tT2JqZWN0SWQiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJvYmplY3RJZCIsIk1JU1NJTkdfT0JKRUNUX0lEIiwiSU5WQUxJRF9LRVlfTkFNRSIsImlkIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJtYXRjaCIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJrZXkiLCJ2YWx1ZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXNwb25zZSIsInVwZGF0ZWRBdCIsIl9lbmNvZGUiLCJEYXRlIiwiaXNvIiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwicGVuZGluZ09wcyIsImV4ZWN1dGUiLCJQcm9taXNlIiwicmVzb2x2ZSIsInRoZW4iLCJnZXRVc2VyQW5kUm9sZUFDTCIsInZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiIsImhhbmRsZUluc3RhbGxhdGlvbiIsImhhbmRsZVNlc3Npb24iLCJ2YWxpZGF0ZUF1dGhEYXRhIiwicnVuQmVmb3JlU2F2ZVRyaWdnZXIiLCJlbnN1cmVVbmlxdWVBdXRoRGF0YUlkIiwiZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQiLCJ2YWxpZGF0ZVNjaGVtYSIsInNjaGVtYUNvbnRyb2xsZXIiLCJzZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkIiwidHJhbnNmb3JtVXNlciIsImV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzIiwiZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyIsInJ1bkRhdGFiYXNlT3BlcmF0aW9uIiwiY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQiLCJoYW5kbGVGb2xsb3d1cCIsInJ1bkFmdGVyU2F2ZVRyaWdnZXIiLCJjbGVhblVzZXJBdXRoRGF0YSIsImF1dGhEYXRhUmVzcG9uc2UiLCJpc01hc3RlciIsImFjbCIsInVzZXIiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsImNvbmNhdCIsImFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsInN5c3RlbUNsYXNzZXMiLCJpbmRleE9mIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiaGFzQ2xhc3MiLCJ2YWxpZGF0ZU9iamVjdCIsInRyaWdnZXJFeGlzdHMiLCJUeXBlcyIsImJlZm9yZVNhdmUiLCJhcHBsaWNhdGlvbklkIiwib3JpZ2luYWxPYmplY3QiLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRQYXJzZU9iamVjdHMiLCJzdGF0ZUNvbnRyb2xsZXIiLCJDb3JlTWFuYWdlciIsImdldE9iamVjdFN0YXRlQ29udHJvbGxlciIsInBlbmRpbmciLCJnZXRQZW5kaW5nT3BzIiwiX2dldFN0YXRlSWRlbnRpZmllciIsImRhdGFiYXNlUHJvbWlzZSIsInVwZGF0ZSIsImNyZWF0ZSIsInJlc3VsdCIsImxlbmd0aCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJtYXliZVJ1blRyaWdnZXIiLCJvYmplY3QiLCJmaWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIiwiXyIsInJlZHVjZSIsImlzRXF1YWwiLCJwdXNoIiwicnVuQmVmb3JlTG9naW5UcmlnZ2VyIiwidXNlckRhdGEiLCJiZWZvcmVMb2dpbiIsImV4dHJhRGF0YSIsImZpbGVzQ29udHJvbGxlciIsImV4cGFuZEZpbGVzSW5PYmplY3QiLCJpbmZsYXRlIiwiZ2V0QWxsQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJzY2hlbWEiLCJmaW5kIiwib25lQ2xhc3MiLCJzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQiLCJmaWVsZE5hbWUiLCJzZXREZWZhdWx0IiwidW5kZWZpbmVkIiwiX19vcCIsImZpZWxkcyIsImRlZmF1bHRWYWx1ZSIsInJlcXVpcmVkIiwiVkFMSURBVElPTl9FUlJPUiIsImNyZWF0ZWRBdCIsIm5ld09iamVjdElkIiwib2JqZWN0SWRTaXplIiwia2V5cyIsImZvckVhY2giLCJhdXRoRGF0YSIsImhhc1VzZXJuYW1lQW5kUGFzc3dvcmQiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiaXNFbXB0eSIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInByb3ZpZGVycyIsImNhbkhhbmRsZUF1dGhEYXRhIiwic29tZSIsInByb3ZpZGVyIiwicHJvdmlkZXJBdXRoRGF0YSIsImhhc1Rva2VuIiwiZ2V0VXNlcklkIiwiaGFuZGxlQXV0aERhdGEiLCJmaWx0ZXJlZE9iamVjdHNCeUFDTCIsIm9iamVjdHMiLCJmaWx0ZXIiLCJBQ0wiLCJoYXNBdXRoRGF0YUlkIiwiciIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsInJlc3VsdHMiLCJBQ0NPVU5UX0FMUkVBRFlfTElOS0VEIiwidXNlcklkIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwidmFsaWRhdGVkQXV0aERhdGEiLCJ1c2VyUmVzdWx0IiwiYXV0aFByb3ZpZGVyIiwiam9pbiIsImhhc011dGF0ZWRBdXRoRGF0YSIsIm11dGF0ZWRBdXRoRGF0YSIsImlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3RlciIsImlzTG9naW4iLCJsb2NhdGlvbiIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIiwicmVzIiwicHJvbWlzZSIsImVycm9yIiwiUmVzdFF1ZXJ5IiwibWFzdGVyIiwiX190eXBlIiwic2Vzc2lvbiIsImNhY2hlQ29udHJvbGxlciIsImRlbCIsInNlc3Npb25Ub2tlbiIsIl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwiaGFzaCIsImhhc2hlZFBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsIl92YWxpZGF0ZVVzZXJOYW1lIiwiX3ZhbGlkYXRlRW1haWwiLCJyYW5kb21TdHJpbmciLCJyZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSIsIiRuZSIsImxpbWl0IiwiY2FzZUluc2Vuc2l0aXZlIiwiVVNFUk5BTUVfVEFLRU4iLCJlbWFpbCIsInJlamVjdCIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsIkVNQUlMX1RBS0VOIiwidXNlckNvbnRyb2xsZXIiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwicGFzc3dvcmRQb2xpY3kiLCJfdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cyIsIl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSIsInBvbGljeUVycm9yIiwidmFsaWRhdGlvbkVycm9yIiwiY29udGFpbnNVc2VybmFtZUVycm9yIiwicGF0dGVyblZhbGlkYXRvciIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5Iiwib2xkUGFzc3dvcmRzIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJ0YWtlIiwibmV3UGFzc3dvcmQiLCJwcm9taXNlcyIsIm1hcCIsImNvbXBhcmUiLCJhbGwiLCJjYXRjaCIsImVyciIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJ2ZXJpZnlVc2VyRW1haWxzIiwiY3JlYXRlU2Vzc2lvblRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJjcmVhdGVkV2l0aCIsImFkZGl0aW9uYWxTZXNzaW9uRGF0YSIsInRva2VuIiwibmV3VG9rZW4iLCJleHBpcmVzQXQiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJhc3NpZ24iLCJhZGRPcHMiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJkZXN0cm95IiwicmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCIsInNlc3Npb25RdWVyeSIsImJpbmQiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJzdGF0dXMiLCJkZXZpY2VUb2tlbiIsInRvTG93ZXJDYXNlIiwiZGV2aWNlVHlwZSIsImlkTWF0Y2giLCJvYmplY3RJZE1hdGNoIiwiaW5zdGFsbGF0aW9uSWRNYXRjaCIsImRldmljZVRva2VuTWF0Y2hlcyIsIm9yUXVlcmllcyIsIiRvciIsImRlbFF1ZXJ5IiwiYXBwSWRlbnRpZmllciIsImNvZGUiLCJvYmpJZCIsInJvbGUiLCJjbGVhciIsImxpdmVRdWVyeUNvbnRyb2xsZXIiLCJjbGVhckNhY2hlZFJvbGVzIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJTRVNTSU9OX01JU1NJTkciLCJkb3dubG9hZCIsImRvd25sb2FkTmFtZSIsIm5hbWUiLCJJTlZBTElEX0FDTCIsInJlYWQiLCJ3cml0ZSIsIm1heFBhc3N3b3JkQWdlIiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJkZWZlciIsIk1hdGgiLCJtYXgiLCJzaGlmdCIsIl91cGRhdGVSZXNwb25zZVdpdGhEYXRhIiwiZW5mb3JjZVByaXZhdGVVc2VycyIsIkRVUExJQ0FURV9WQUxVRSIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImhhc0FmdGVyU2F2ZUhvb2siLCJhZnRlclNhdmUiLCJoYXNMaXZlUXVlcnkiLCJfaGFuZGxlU2F2ZVJlc3BvbnNlIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJvbkFmdGVyU2F2ZSIsImpzb25SZXR1cm5lZCIsIl90b0Z1bGxKU09OIiwidG9KU09OIiwibG9nZ2VyIiwid2FybiIsIm1pZGRsZSIsIm1vdW50Iiwic2VydmVyVVJMIiwic2FuaXRpemVkRGF0YSIsInRlc3QiLCJfZGVjb2RlIiwiZnJvbUpTT04iLCJyZWFkT25seUF0dHJpYnV0ZXMiLCJjb25zdHJ1Y3RvciIsImF0dHJpYnV0ZSIsImluY2x1ZGVzIiwic2V0Iiwic3BsaXR0ZWRLZXkiLCJzcGxpdCIsInBhcmVudFByb3AiLCJwYXJlbnRWYWwiLCJnZXQiLCJzYW5pdGl6ZWQiLCJza2lwS2V5cyIsInJlcXVpcmVkQ29sdW1ucyIsImNsaWVudFN1cHBvcnRzRGVsZXRlIiwic3VwcG9ydHNGb3J3YXJkRGVsZXRlIiwiZGF0YVZhbHVlIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQSBSZXN0V3JpdGUgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYW4gb3BlcmF0aW9uXG4vLyB0aGF0IHdyaXRlcyB0byB0aGUgZGF0YWJhc2UuXG4vLyBUaGlzIGNvdWxkIGJlIGVpdGhlciBhIFwiY3JlYXRlXCIgb3IgYW4gXCJ1cGRhdGVcIi5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcbnZhciBkZWVwY29weSA9IHJlcXVpcmUoJ2RlZXBjb3B5Jyk7XG5cbmNvbnN0IEF1dGggPSByZXF1aXJlKCcuL0F1dGgnKTtcbmNvbnN0IFV0aWxzID0gcmVxdWlyZSgnLi9VdGlscycpO1xudmFyIGNyeXB0b1V0aWxzID0gcmVxdWlyZSgnLi9jcnlwdG9VdGlscycpO1xudmFyIHBhc3N3b3JkQ3J5cHRvID0gcmVxdWlyZSgnLi9wYXNzd29yZCcpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xudmFyIHRyaWdnZXJzID0gcmVxdWlyZSgnLi90cmlnZ2VycycpO1xudmFyIENsaWVudFNESyA9IHJlcXVpcmUoJy4vQ2xpZW50U0RLJyk7XG5pbXBvcnQgUmVzdFF1ZXJ5IGZyb20gJy4vUmVzdFF1ZXJ5JztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCB7IHJlcXVpcmVkQ29sdW1ucyB9IGZyb20gJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5cbi8vIHF1ZXJ5IGFuZCBkYXRhIGFyZSBib3RoIHByb3ZpZGVkIGluIFJFU1QgQVBJIGZvcm1hdC4gU28gZGF0YVxuLy8gdHlwZXMgYXJlIGVuY29kZWQgYnkgcGxhaW4gb2xkIG9iamVjdHMuXG4vLyBJZiBxdWVyeSBpcyBudWxsLCB0aGlzIGlzIGEgXCJjcmVhdGVcIiBhbmQgdGhlIGRhdGEgaW4gZGF0YSBzaG91bGQgYmVcbi8vIGNyZWF0ZWQuXG4vLyBPdGhlcndpc2UgdGhpcyBpcyBhbiBcInVwZGF0ZVwiIC0gdGhlIG9iamVjdCBtYXRjaGluZyB0aGUgcXVlcnlcbi8vIHNob3VsZCBnZXQgdXBkYXRlZCB3aXRoIGRhdGEuXG4vLyBSZXN0V3JpdGUgd2lsbCBoYW5kbGUgb2JqZWN0SWQsIGNyZWF0ZWRBdCwgYW5kIHVwZGF0ZWRBdCBmb3Jcbi8vIGV2ZXJ5dGhpbmcuIEl0IGFsc28ga25vd3MgdG8gdXNlIHRyaWdnZXJzIGFuZCBzcGVjaWFsIG1vZGlmaWNhdGlvbnNcbi8vIGZvciB0aGUgX1VzZXIgY2xhc3MuXG5mdW5jdGlvbiBSZXN0V3JpdGUoY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHF1ZXJ5LCBkYXRhLCBvcmlnaW5hbERhdGEsIGNsaWVudFNESywgY29udGV4dCwgYWN0aW9uKSB7XG4gIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgJ0Nhbm5vdCBwZXJmb3JtIGEgd3JpdGUgb3BlcmF0aW9uIHdoZW4gdXNpbmcgcmVhZE9ubHlNYXN0ZXJLZXknXG4gICAgKTtcbiAgfVxuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnN0b3JhZ2UgPSB7fTtcbiAgdGhpcy5ydW5PcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IGNvbnRleHQgfHwge307XG5cbiAgaWYgKGFjdGlvbikge1xuICAgIHRoaXMucnVuT3B0aW9ucy5hY3Rpb24gPSBhY3Rpb247XG4gIH1cblxuICBpZiAoIXF1ZXJ5KSB7XG4gICAgaWYgKHRoaXMuY29uZmlnLmFsbG93Q3VzdG9tT2JqZWN0SWQpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZGF0YSwgJ29iamVjdElkJykgJiYgIWRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk1JU1NJTkdfT0JKRUNUX0lELFxuICAgICAgICAgICdvYmplY3RJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCBvciB1bmRlZmluZWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChkYXRhLm9iamVjdElkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnb2JqZWN0SWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLicpO1xuICAgICAgfVxuICAgICAgaWYgKGRhdGEuaWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdpZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuY29uZmlnLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgZm9yIChjb25zdCBrZXl3b3JkIG9mIHRoaXMuY29uZmlnLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZShkYXRhLCBrZXl3b3JkLmtleSwga2V5d29yZC52YWx1ZSk7XG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBXaGVuIHRoZSBvcGVyYXRpb24gaXMgY29tcGxldGUsIHRoaXMucmVzcG9uc2UgbWF5IGhhdmUgc2V2ZXJhbFxuICAvLyBmaWVsZHMuXG4gIC8vIHJlc3BvbnNlOiB0aGUgYWN0dWFsIGRhdGEgdG8gYmUgcmV0dXJuZWRcbiAgLy8gc3RhdHVzOiB0aGUgaHR0cCBzdGF0dXMgY29kZS4gaWYgbm90IHByZXNlbnQsIHRyZWF0ZWQgbGlrZSBhIDIwMFxuICAvLyBsb2NhdGlvbjogdGhlIGxvY2F0aW9uIGhlYWRlci4gaWYgbm90IHByZXNlbnQsIG5vIGxvY2F0aW9uIGhlYWRlclxuICB0aGlzLnJlc3BvbnNlID0gbnVsbDtcblxuICAvLyBQcm9jZXNzaW5nIHRoaXMgb3BlcmF0aW9uIG1heSBtdXRhdGUgb3VyIGRhdGEsIHNvIHdlIG9wZXJhdGUgb24gYVxuICAvLyBjb3B5XG4gIHRoaXMucXVlcnkgPSBkZWVwY29weShxdWVyeSk7XG4gIHRoaXMuZGF0YSA9IGRlZXBjb3B5KGRhdGEpO1xuICAvLyBXZSBuZXZlciBjaGFuZ2Ugb3JpZ2luYWxEYXRhLCBzbyB3ZSBkbyBub3QgbmVlZCBhIGRlZXAgY29weVxuICB0aGlzLm9yaWdpbmFsRGF0YSA9IG9yaWdpbmFsRGF0YTtcblxuICAvLyBUaGUgdGltZXN0YW1wIHdlJ2xsIHVzZSBmb3IgdGhpcyB3aG9sZSBvcGVyYXRpb25cbiAgdGhpcy51cGRhdGVkQXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpLmlzbztcblxuICAvLyBTaGFyZWQgU2NoZW1hQ29udHJvbGxlciB0byBiZSByZXVzZWQgdG8gcmVkdWNlIHRoZSBudW1iZXIgb2YgbG9hZFNjaGVtYSgpIGNhbGxzIHBlciByZXF1ZXN0XG4gIC8vIE9uY2Ugc2V0IHRoZSBzY2hlbWFEYXRhIHNob3VsZCBiZSBpbW11dGFibGVcbiAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIgPSBudWxsO1xuICB0aGlzLnBlbmRpbmdPcHMgPSB7fTtcbn1cblxuLy8gQSBjb252ZW5pZW50IG1ldGhvZCB0byBwZXJmb3JtIGFsbCB0aGUgc3RlcHMgb2YgcHJvY2Vzc2luZyB0aGVcbi8vIHdyaXRlLCBpbiBvcmRlci5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHtyZXNwb25zZSwgc3RhdHVzLCBsb2NhdGlvbn0gb2JqZWN0LlxuLy8gc3RhdHVzIGFuZCBsb2NhdGlvbiBhcmUgb3B0aW9uYWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmdldFVzZXJBbmRSb2xlQUNMKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluc3RhbGxhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlU2Vzc2lvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQmVmb3JlU2F2ZVRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmVuc3VyZVVuaXF1ZUF1dGhEYXRhSWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYSgpO1xuICAgIH0pXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgICByZXR1cm4gdGhpcy5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Vc2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuRGF0YWJhc2VPcGVyYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQWZ0ZXJTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY2xlYW5Vc2VyQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIEFwcGVuZCB0aGUgYXV0aERhdGFSZXNwb25zZSBpZiBleGlzdHNcbiAgICAgIGlmICh0aGlzLmF1dGhEYXRhUmVzcG9uc2UpIHtcbiAgICAgICAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UuYXV0aERhdGFSZXNwb25zZSA9IHRoaXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlckFuZFJvbGVBQ0wgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gWycqJ107XG5cbiAgaWYgKHRoaXMuYXV0aC51c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC5nZXRVc2VyUm9sZXMoKS50aGVuKHJvbGVzID0+IHtcbiAgICAgIHRoaXMucnVuT3B0aW9ucy5hY2wgPSB0aGlzLnJ1bk9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW3RoaXMuYXV0aC51c2VyLmlkXSk7XG4gICAgICByZXR1cm47XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIGNvbmZpZy5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICdUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzICcgKyAnbm9uLWV4aXN0ZW50IGNsYXNzOiAnICsgdGhpcy5jbGFzc05hbWVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBzY2hlbWEuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlU2NoZW1hID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudmFsaWRhdGVPYmplY3QoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdGhpcy5kYXRhLFxuICAgIHRoaXMucXVlcnksXG4gICAgdGhpcy5ydW5PcHRpb25zXG4gICk7XG59O1xuXG4vLyBSdW5zIGFueSBiZWZvcmVTYXZlIHRyaWdnZXJzIGFnYWluc3QgdGhpcyBvcGVyYXRpb24uXG4vLyBBbnkgY2hhbmdlIGxlYWRzIHRvIG91ciBkYXRhIGJlaW5nIG11dGF0ZWQuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZVNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZVNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyh0aGlzLmNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSwgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZClcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QgeyBvcmlnaW5hbE9iamVjdCwgdXBkYXRlZE9iamVjdCB9ID0gdGhpcy5idWlsZFBhcnNlT2JqZWN0cygpO1xuXG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyh1cGRhdGVkT2JqZWN0Ll9nZXRTdGF0ZUlkZW50aWZpZXIoKSk7XG4gIHRoaXMucGVuZGluZ09wcyA9IHsgLi4ucGVuZGluZyB9O1xuXG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIEJlZm9yZSBjYWxsaW5nIHRoZSB0cmlnZ2VyLCB2YWxpZGF0ZSB0aGUgcGVybWlzc2lvbnMgZm9yIHRoZSBzYXZlIG9wZXJhdGlvblxuICAgICAgbGV0IGRhdGFiYXNlUHJvbWlzZSA9IG51bGw7XG4gICAgICBpZiAodGhpcy5xdWVyeSkge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgdXBkYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICB0cnVlLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIGZvciBjcmVhdGluZ1xuICAgICAgICBkYXRhYmFzZVByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS5jcmVhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBJbiB0aGUgY2FzZSB0aGF0IHRoZXJlIGlzIG5vIHBlcm1pc3Npb24gZm9yIHRoZSBvcGVyYXRpb24sIGl0IHRocm93cyBhbiBlcnJvclxuICAgICAgcmV0dXJuIGRhdGFiYXNlUHJvbWlzZS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5sZW5ndGggPD0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLFxuICAgICAgICB0aGlzLmF1dGgsXG4gICAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgICB0aGlzLmNvbmZpZyxcbiAgICAgICAgdGhpcy5jb250ZXh0XG4gICAgICApO1xuICAgIH0pXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9iamVjdCkge1xuICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9IF8ucmVkdWNlKFxuICAgICAgICAgIHJlc3BvbnNlLm9iamVjdCxcbiAgICAgICAgICAocmVzdWx0LCB2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgICAgICBpZiAoIV8uaXNFcXVhbCh0aGlzLmRhdGFba2V5XSwgdmFsdWUpKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0sXG4gICAgICAgICAgW11cbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kYXRhID0gcmVzcG9uc2Uub2JqZWN0O1xuICAgICAgICAvLyBXZSBzaG91bGQgZGVsZXRlIHRoZSBvYmplY3RJZCBmb3IgYW4gdXBkYXRlIHdyaXRlXG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlciA9IGFzeW5jIGZ1bmN0aW9uICh1c2VyRGF0YSkge1xuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdiZWZvcmVMb2dpbicgdHJpZ2dlclxuICBpZiAoXG4gICAgIXRyaWdnZXJzLnRyaWdnZXJFeGlzdHModGhpcy5jbGFzc05hbWUsIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLCB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkKVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBDbG91ZCBjb2RlIGdldHMgYSBiaXQgb2YgZXh0cmEgZGF0YSBmb3IgaXRzIG9iamVjdHNcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG5cbiAgLy8gRXhwYW5kIGZpbGUgb2JqZWN0c1xuICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgdXNlckRhdGEpO1xuXG4gIGNvbnN0IHVzZXIgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdXNlckRhdGEpO1xuXG4gIC8vIG5vIG5lZWQgdG8gcmV0dXJuIGEgcmVzcG9uc2VcbiAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLFxuICAgIHRoaXMuYXV0aCxcbiAgICB1c2VyLFxuICAgIG51bGwsXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5jb250ZXh0XG4gICk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmRhdGEpIHtcbiAgICByZXR1cm4gdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsQ2xhc3NlcyA9PiB7XG4gICAgICBjb25zdCBzY2hlbWEgPSBhbGxDbGFzc2VzLmZpbmQob25lQ2xhc3MgPT4gb25lQ2xhc3MuY2xhc3NOYW1lID09PSB0aGlzLmNsYXNzTmFtZSk7XG4gICAgICBjb25zdCBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQgPSAoZmllbGROYW1lLCBzZXREZWZhdWx0KSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IG51bGwgfHxcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJycgfHxcbiAgICAgICAgICAodHlwZW9mIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnb2JqZWN0JyAmJiB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgc2V0RGVmYXVsdCAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSBudWxsICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgICAgICh0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZTtcbiAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgfHwgW107XG4gICAgICAgICAgICBpZiAodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuaW5kZXhPZihmaWVsZE5hbWUpIDwgMCkge1xuICAgICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnJlcXVpcmVkID09PSB0cnVlKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgYCR7ZmllbGROYW1lfSBpcyByZXF1aXJlZGApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgLy8gQWRkIGRlZmF1bHQgZmllbGRzXG4gICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgICAgdGhpcy5kYXRhLmNyZWF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuXG4gICAgICAgIC8vIE9ubHkgYXNzaWduIG5ldyBvYmplY3RJZCBpZiB3ZSBhcmUgY3JlYXRpbmcgbmV3IG9iamVjdFxuICAgICAgICBpZiAoIXRoaXMuZGF0YS5vYmplY3RJZCkge1xuICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IGNyeXB0b1V0aWxzLm5ld09iamVjdElkKHRoaXMuY29uZmlnLm9iamVjdElkU2l6ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIHRydWUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHNjaGVtYSkge1xuICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCBmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cbi8vIFRyYW5zZm9ybXMgYXV0aCBkYXRhIGZvciBhIHVzZXIgb2JqZWN0LlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYSB1c2VyIG9iamVjdC5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVBdXRoRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgYXV0aERhdGEgPSB0aGlzLmRhdGEuYXV0aERhdGE7XG4gIGNvbnN0IGhhc1VzZXJuYW1lQW5kUGFzc3dvcmQgPVxuICAgIHR5cGVvZiB0aGlzLmRhdGEudXNlcm5hbWUgPT09ICdzdHJpbmcnICYmIHR5cGVvZiB0aGlzLmRhdGEucGFzc3dvcmQgPT09ICdzdHJpbmcnO1xuXG4gIGlmICghdGhpcy5xdWVyeSAmJiAhYXV0aERhdGEpIHtcbiAgICBpZiAodHlwZW9mIHRoaXMuZGF0YS51c2VybmFtZSAhPT0gJ3N0cmluZycgfHwgXy5pc0VtcHR5KHRoaXMuZGF0YS51c2VybmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAnYmFkIG9yIG1pc3NpbmcgdXNlcm5hbWUnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEucGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8IF8uaXNFbXB0eSh0aGlzLmRhdGEucGFzc3dvcmQpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKFxuICAgIChhdXRoRGF0YSAmJiAhT2JqZWN0LmtleXMoYXV0aERhdGEpLmxlbmd0aCkgfHxcbiAgICAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuZGF0YSwgJ2F1dGhEYXRhJylcbiAgKSB7XG4gICAgLy8gTm90aGluZyB0byB2YWxpZGF0ZSBoZXJlXG4gICAgcmV0dXJuO1xuICB9IGVsc2UgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLmRhdGEsICdhdXRoRGF0YScpICYmICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICAvLyBIYW5kbGUgc2F2aW5nIGF1dGhEYXRhIHRvIG51bGxcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICApO1xuICB9XG5cbiAgdmFyIHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgaWYgKHByb3ZpZGVycy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgY2FuSGFuZGxlQXV0aERhdGEgPSBwcm92aWRlcnMuc29tZShwcm92aWRlciA9PiB7XG4gICAgICB2YXIgcHJvdmlkZXJBdXRoRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIHZhciBoYXNUb2tlbiA9IHByb3ZpZGVyQXV0aERhdGEgJiYgcHJvdmlkZXJBdXRoRGF0YS5pZDtcbiAgICAgIHJldHVybiBoYXNUb2tlbiB8fCBwcm92aWRlckF1dGhEYXRhID09PSBudWxsO1xuICAgIH0pO1xuICAgIGlmIChjYW5IYW5kbGVBdXRoRGF0YSB8fCBoYXNVc2VybmFtZUFuZFBhc3N3b3JkIHx8IHRoaXMuYXV0aC5pc01hc3RlciB8fCB0aGlzLmdldFVzZXJJZCgpKSB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVBdXRoRGF0YShhdXRoRGF0YSk7XG4gICAgfVxuICB9XG4gIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmZpbHRlcmVkT2JqZWN0c0J5QUNMID0gZnVuY3Rpb24gKG9iamVjdHMpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHJldHVybiBvYmplY3RzO1xuICB9XG4gIHJldHVybiBvYmplY3RzLmZpbHRlcihvYmplY3QgPT4ge1xuICAgIGlmICghb2JqZWN0LkFDTCkge1xuICAgICAgcmV0dXJuIHRydWU7IC8vIGxlZ2FjeSB1c2VycyB0aGF0IGhhdmUgbm8gQUNMIGZpZWxkIG9uIHRoZW1cbiAgICB9XG4gICAgLy8gUmVndWxhciB1c2VycyB0aGF0IGhhdmUgYmVlbiBsb2NrZWQgb3V0LlxuICAgIHJldHVybiBvYmplY3QuQUNMICYmIE9iamVjdC5rZXlzKG9iamVjdC5BQ0wpLmxlbmd0aCA+IDA7XG4gIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5nZXRVc2VySWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICByZXR1cm4gdGhpcy5xdWVyeS5vYmplY3RJZDtcbiAgfSBlbHNlIGlmICh0aGlzLmF1dGggJiYgdGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5hdXRoLnVzZXIuaWQpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLnVzZXIuaWQ7XG4gIH1cbn07XG5cbi8vIERldmVsb3BlcnMgYXJlIGFsbG93ZWQgdG8gY2hhbmdlIGF1dGhEYXRhIHZpYSBiZWZvcmUgc2F2ZSB0cmlnZ2VyXG4vLyB3ZSBuZWVkIGFmdGVyIGJlZm9yZSBzYXZlIHRvIGVuc3VyZSB0aGF0IHRoZSBkZXZlbG9wZXJcbi8vIGlzIG5vdCBjdXJyZW50bHkgZHVwbGljYXRpbmcgYXV0aCBkYXRhIElEXG5SZXN0V3JpdGUucHJvdG90eXBlLmVuc3VyZVVuaXF1ZUF1dGhEYXRhSWQgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgaGFzQXV0aERhdGFJZCA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkuc29tZShcbiAgICBrZXkgPT4gdGhpcy5kYXRhLmF1dGhEYXRhW2tleV0gJiYgdGhpcy5kYXRhLmF1dGhEYXRhW2tleV0uaWRcbiAgKTtcblxuICBpZiAoIWhhc0F1dGhEYXRhSWQpIHJldHVybjtcblxuICBjb25zdCByID0gYXdhaXQgQXV0aC5maW5kVXNlcnNXaXRoQXV0aERhdGEodGhpcy5jb25maWcsIHRoaXMuZGF0YS5hdXRoRGF0YSk7XG4gIGNvbnN0IHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gIH1cbiAgLy8gdXNlIGRhdGEub2JqZWN0SWQgaW4gY2FzZSBvZiBsb2dpbiB0aW1lIGFuZCBmb3VuZCB1c2VyIGR1cmluZyBoYW5kbGUgdmFsaWRhdGVBdXRoRGF0YVxuICBjb25zdCB1c2VySWQgPSB0aGlzLmdldFVzZXJJZCgpIHx8IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAxICYmIHVzZXJJZCAhPT0gcmVzdWx0c1swXS5vYmplY3RJZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUF1dGhEYXRhID0gYXN5bmMgZnVuY3Rpb24gKGF1dGhEYXRhKSB7XG4gIGNvbnN0IHIgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YSh0aGlzLmNvbmZpZywgYXV0aERhdGEpO1xuICBjb25zdCByZXN1bHRzID0gdGhpcy5maWx0ZXJlZE9iamVjdHNCeUFDTChyKTtcblxuICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgLy8gVG8gYXZvaWQgaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvc2VjdXJpdHkvYWR2aXNvcmllcy9HSFNBLTh3M2otZzk4My04amg1XG4gICAgLy8gTGV0J3MgcnVuIHNvbWUgdmFsaWRhdGlvbiBiZWZvcmUgdGhyb3dpbmdcbiAgICBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihhdXRoRGF0YSwgdGhpcywgcmVzdWx0c1swXSk7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gIH1cblxuICAvLyBObyB1c2VyIGZvdW5kIHdpdGggcHJvdmlkZWQgYXV0aERhdGEgd2UgbmVlZCB0byB2YWxpZGF0ZVxuICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgY29uc3QgeyBhdXRoRGF0YTogdmFsaWRhdGVkQXV0aERhdGEsIGF1dGhEYXRhUmVzcG9uc2UgfSA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKFxuICAgICAgYXV0aERhdGEsXG4gICAgICB0aGlzXG4gICAgKTtcbiAgICB0aGlzLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIC8vIFJlcGxhY2UgY3VycmVudCBhdXRoRGF0YSBieSB0aGUgbmV3IHZhbGlkYXRlZCBvbmVcbiAgICB0aGlzLmRhdGEuYXV0aERhdGEgPSB2YWxpZGF0ZWRBdXRoRGF0YTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBVc2VyIGZvdW5kIHdpdGggcHJvdmlkZWQgYXV0aERhdGFcbiAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAxKSB7XG4gICAgY29uc3QgdXNlcklkID0gdGhpcy5nZXRVc2VySWQoKTtcbiAgICBjb25zdCB1c2VyUmVzdWx0ID0gcmVzdWx0c1swXTtcbiAgICAvLyBQcmV2ZW50IGR1cGxpY2F0ZSBhdXRoRGF0YSBpZFxuICAgIGlmICh1c2VySWQgJiYgdXNlcklkICE9PSB1c2VyUmVzdWx0Lm9iamVjdElkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgICB9XG5cbiAgICB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLmpvaW4oJywnKTtcblxuICAgIGNvbnN0IHsgaGFzTXV0YXRlZEF1dGhEYXRhLCBtdXRhdGVkQXV0aERhdGEgfSA9IEF1dGguaGFzTXV0YXRlZEF1dGhEYXRhKFxuICAgICAgYXV0aERhdGEsXG4gICAgICB1c2VyUmVzdWx0LmF1dGhEYXRhXG4gICAgKTtcblxuICAgIGNvbnN0IGlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3RlciA9XG4gICAgICAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkID09PSB1c2VyUmVzdWx0Lm9iamVjdElkKSB8fFxuICAgICAgdGhpcy5hdXRoLmlzTWFzdGVyO1xuXG4gICAgY29uc3QgaXNMb2dpbiA9ICF1c2VySWQ7XG5cbiAgICBpZiAoaXNMb2dpbiB8fCBpc0N1cnJlbnRVc2VyTG9nZ2VkT3JNYXN0ZXIpIHtcbiAgICAgIC8vIG5vIHVzZXIgbWFraW5nIHRoZSBjYWxsXG4gICAgICAvLyBPUiB0aGUgdXNlciBtYWtpbmcgdGhlIGNhbGwgaXMgdGhlIHJpZ2h0IG9uZVxuICAgICAgLy8gTG9naW4gd2l0aCBhdXRoIGRhdGFcbiAgICAgIGRlbGV0ZSByZXN1bHRzWzBdLnBhc3N3b3JkO1xuXG4gICAgICAvLyBuZWVkIHRvIHNldCB0aGUgb2JqZWN0SWQgZmlyc3Qgb3RoZXJ3aXNlIGxvY2F0aW9uIGhhcyB0cmFpbGluZyB1bmRlZmluZWRcbiAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IHVzZXJSZXN1bHQub2JqZWN0SWQ7XG5cbiAgICAgIGlmICghdGhpcy5xdWVyeSB8fCAhdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICAgIHJlc3BvbnNlOiB1c2VyUmVzdWx0LFxuICAgICAgICAgIGxvY2F0aW9uOiB0aGlzLmxvY2F0aW9uKCksXG4gICAgICAgIH07XG4gICAgICAgIC8vIFJ1biBiZWZvcmVMb2dpbiBob29rIGJlZm9yZSBzdG9yaW5nIGFueSB1cGRhdGVzXG4gICAgICAgIC8vIHRvIGF1dGhEYXRhIG9uIHRoZSBkYjsgY2hhbmdlcyB0byB1c2VyUmVzdWx0XG4gICAgICAgIC8vIHdpbGwgYmUgaWdub3JlZC5cbiAgICAgICAgYXdhaXQgdGhpcy5ydW5CZWZvcmVMb2dpblRyaWdnZXIoZGVlcGNvcHkodXNlclJlc3VsdCkpO1xuXG4gICAgICAgIC8vIElmIHdlIGFyZSBpbiBsb2dpbiBvcGVyYXRpb24gdmlhIGF1dGhEYXRhXG4gICAgICAgIC8vIHdlIG5lZWQgdG8gYmUgc3VyZSB0aGF0IHRoZSB1c2VyIGhhcyBwcm92aWRlZFxuICAgICAgICAvLyByZXF1aXJlZCBhdXRoRGF0YVxuICAgICAgICBBdXRoLmNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4oXG4gICAgICAgICAgYXV0aERhdGEsXG4gICAgICAgICAgdXNlclJlc3VsdC5hdXRoRGF0YSxcbiAgICAgICAgICB0aGlzLmNvbmZpZ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICAvLyBQcmV2ZW50IHZhbGlkYXRpbmcgaWYgbm8gbXV0YXRlZCBkYXRhIGRldGVjdGVkIG9uIHVwZGF0ZVxuICAgICAgaWYgKCFoYXNNdXRhdGVkQXV0aERhdGEgJiYgaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gRm9yY2UgdG8gdmFsaWRhdGUgYWxsIHByb3ZpZGVkIGF1dGhEYXRhIG9uIGxvZ2luXG4gICAgICAvLyBvbiB1cGRhdGUgb25seSB2YWxpZGF0ZSBtdXRhdGVkIG9uZXNcbiAgICAgIGlmIChoYXNNdXRhdGVkQXV0aERhdGEgfHwgIXRoaXMuY29uZmlnLmFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4pIHtcbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oXG4gICAgICAgICAgaXNMb2dpbiA/IGF1dGhEYXRhIDogbXV0YXRlZEF1dGhEYXRhLFxuICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgdXNlclJlc3VsdFxuICAgICAgICApO1xuICAgICAgICB0aGlzLmRhdGEuYXV0aERhdGEgPSByZXMuYXV0aERhdGE7XG4gICAgICAgIHRoaXMuYXV0aERhdGFSZXNwb25zZSA9IHJlcy5hdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgfVxuXG4gICAgICAvLyBJRiB3ZSBhcmUgaW4gbG9naW4gd2UnbGwgc2tpcCB0aGUgZGF0YWJhc2Ugb3BlcmF0aW9uIC8gYmVmb3JlU2F2ZSAvIGFmdGVyU2F2ZSBldGMuLi5cbiAgICAgIC8vIHdlIG5lZWQgdG8gc2V0IGl0IHVwIHRoZXJlLlxuICAgICAgLy8gV2UgYXJlIHN1cHBvc2VkIHRvIGhhdmUgYSByZXNwb25zZSBvbmx5IG9uIExPR0lOIHdpdGggYXV0aERhdGEsIHNvIHdlIHNraXAgdGhvc2VcbiAgICAgIC8vIElmIHdlJ3JlIG5vdCBsb2dnaW5nIGluLCBidXQganVzdCB1cGRhdGluZyB0aGUgY3VycmVudCB1c2VyLCB3ZSBjYW4gc2FmZWx5IHNraXAgdGhhdCBwYXJ0XG4gICAgICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgICAgICAvLyBBc3NpZ24gdGhlIG5ldyBhdXRoRGF0YSBpbiB0aGUgcmVzcG9uc2VcbiAgICAgICAgT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFJ1biB0aGUgREIgdXBkYXRlIGRpcmVjdGx5LCBhcyAnbWFzdGVyJyBvbmx5IGlmIGF1dGhEYXRhIGNvbnRhaW5zIHNvbWUga2V5c1xuICAgICAgICAvLyBhdXRoRGF0YSBjb3VsZCBub3QgY29udGFpbnMga2V5cyBhZnRlciB2YWxpZGF0aW9uIGlmIHRoZSBhdXRoQWRhcHRlclxuICAgICAgICAvLyB1c2VzIHRoZSBgZG9Ob3RTYXZlYCBvcHRpb24uIEp1c3QgdXBkYXRlIHRoZSBhdXRoRGF0YSBwYXJ0XG4gICAgICAgIC8vIFRoZW4gd2UncmUgZ29vZCBmb3IgdGhlIHVzZXIsIGVhcmx5IGV4aXQgb2Ygc29ydHNcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB7IG9iamVjdElkOiB0aGlzLmRhdGEub2JqZWN0SWQgfSxcbiAgICAgICAgICAgIHsgYXV0aERhdGE6IHRoaXMuZGF0YS5hdXRoRGF0YSB9LFxuICAgICAgICAgICAge31cbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG4vLyBUaGUgbm9uLXRoaXJkLXBhcnR5IHBhcnRzIG9mIFVzZXIgdHJhbnNmb3JtYXRpb25cblJlc3RXcml0ZS5wcm90b3R5cGUudHJhbnNmb3JtVXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICBpZiAoIXRoaXMuYXV0aC5pc01hc3RlciAmJiAnZW1haWxWZXJpZmllZCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgZXJyb3IgPSBgQ2xpZW50cyBhcmVuJ3QgYWxsb3dlZCB0byBtYW51YWxseSB1cGRhdGUgZW1haWwgdmVyaWZpY2F0aW9uLmA7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sIGVycm9yKTtcbiAgfVxuXG4gIC8vIERvIG5vdCBjbGVhbnVwIHNlc3Npb24gaWYgb2JqZWN0SWQgaXMgbm90IHNldFxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLm9iamVjdElkKCkpIHtcbiAgICAvLyBJZiB3ZSdyZSB1cGRhdGluZyBhIF9Vc2VyIG9iamVjdCwgd2UgbmVlZCB0byBjbGVhciBvdXQgdGhlIGNhY2hlIGZvciB0aGF0IHVzZXIuIEZpbmQgYWxsIHRoZWlyXG4gICAgLy8gc2Vzc2lvbiB0b2tlbnMsIGFuZCByZW1vdmUgdGhlbSBmcm9tIHRoZSBjYWNoZS5cbiAgICBwcm9taXNlID0gbmV3IFJlc3RRdWVyeSh0aGlzLmNvbmZpZywgQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLCAnX1Nlc3Npb24nLCB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH0pXG4gICAgICAuZXhlY3V0ZSgpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgcmVzdWx0cy5yZXN1bHRzLmZvckVhY2goc2Vzc2lvbiA9PlxuICAgICAgICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci51c2VyLmRlbChzZXNzaW9uLnNlc3Npb25Ub2tlbilcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHByb21pc2VcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBUcmFuc2Zvcm0gdGhlIHBhc3N3b3JkXG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gaWdub3JlIG9ubHkgaWYgdW5kZWZpbmVkLiBzaG91bGQgcHJvY2VlZCBpZiBlbXB0eSAoJycpXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gPSB0cnVlO1xuICAgICAgICAvLyBHZW5lcmF0ZSBhIG5ldyBzZXNzaW9uIG9ubHkgaWYgdGhlIHVzZXIgcmVxdWVzdGVkXG4gICAgICAgIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICAgICAgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3koKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmhhc2godGhpcy5kYXRhLnBhc3N3b3JkKS50aGVuKGhhc2hlZFBhc3N3b3JkID0+IHtcbiAgICAgICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCA9IGhhc2hlZFBhc3N3b3JkO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVVc2VyTmFtZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlRW1haWwoKTtcbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlVXNlck5hbWUgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENoZWNrIGZvciB1c2VybmFtZSB1bmlxdWVuZXNzXG4gIGlmICghdGhpcy5kYXRhLnVzZXJuYW1lKSB7XG4gICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICB0aGlzLmRhdGEudXNlcm5hbWUgPSBjcnlwdG9VdGlscy5yYW5kb21TdHJpbmcoMjUpO1xuICAgICAgdGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvKlxuICAgIFVzZXJuYW1lcyBzaG91bGQgYmUgdW5pcXVlIHdoZW4gY29tcGFyZWQgY2FzZSBpbnNlbnNpdGl2ZWx5XG5cbiAgICBVc2VycyBzaG91bGQgYmUgYWJsZSB0byBtYWtlIGNhc2Ugc2Vuc2l0aXZlIHVzZXJuYW1lcyBhbmRcbiAgICBsb2dpbiB1c2luZyB0aGUgY2FzZSB0aGV5IGVudGVyZWQuICBJLmUuICdTbm9vcHknIHNob3VsZCBwcmVjbHVkZVxuICAgICdzbm9vcHknIGFzIGEgdmFsaWQgdXNlcm5hbWUuXG4gICovXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB7XG4gICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICB9LFxuICAgICAgeyBsaW1pdDogMSwgY2FzZUluc2Vuc2l0aXZlOiB0cnVlIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH0pO1xufTtcblxuLypcbiAgQXMgd2l0aCB1c2VybmFtZXMsIFBhcnNlIHNob3VsZCBub3QgYWxsb3cgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb25zIG9mIGVtYWlsLlxuICB1bmxpa2Ugd2l0aCB1c2VybmFtZXMgKHdoaWNoIGNhbiBoYXZlIGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9ucyBpbiB0aGUgY2FzZSBvZlxuICBhdXRoIGFkYXB0ZXJzKSwgZW1haWxzIHNob3VsZCBuZXZlciBoYXZlIGEgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb24uXG5cbiAgVGhpcyBiZWhhdmlvciBjYW4gYmUgZW5mb3JjZWQgdGhyb3VnaCBhIHByb3Blcmx5IGNvbmZpZ3VyZWQgaW5kZXggc2VlOlxuICBodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL2NvcmUvaW5kZXgtY2FzZS1pbnNlbnNpdGl2ZS8jY3JlYXRlLWEtY2FzZS1pbnNlbnNpdGl2ZS1pbmRleFxuICB3aGljaCBjb3VsZCBiZSBpbXBsZW1lbnRlZCBpbnN0ZWFkIG9mIHRoaXMgY29kZSBiYXNlZCB2YWxpZGF0aW9uLlxuXG4gIEdpdmVuIHRoYXQgdGhpcyBsb29rdXAgc2hvdWxkIGJlIGEgcmVsYXRpdmVseSBsb3cgdXNlIGNhc2UgYW5kIHRoYXQgdGhlIGNhc2Ugc2Vuc2l0aXZlXG4gIHVuaXF1ZSBpbmRleCB3aWxsIGJlIHVzZWQgYnkgdGhlIGRiIGZvciB0aGUgcXVlcnksIHRoaXMgaXMgYW4gYWRlcXVhdGUgc29sdXRpb24uXG4qL1xuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVFbWFpbCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwgfHwgdGhpcy5kYXRhLmVtYWlsLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFZhbGlkYXRlIGJhc2ljIGVtYWlsIGFkZHJlc3MgZm9ybWF0XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsLm1hdGNoKC9eLitALiskLykpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLCAnRW1haWwgYWRkcmVzcyBmb3JtYXQgaXMgaW52YWxpZC4nKVxuICAgICk7XG4gIH1cbiAgLy8gQ2FzZSBpbnNlbnNpdGl2ZSBtYXRjaCwgc2VlIG5vdGUgYWJvdmUgZnVuY3Rpb24uXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB7XG4gICAgICAgIGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsXG4gICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICB9LFxuICAgICAgeyBsaW1pdDogMSwgY2FzZUluc2Vuc2l0aXZlOiB0cnVlIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgICF0aGlzLmRhdGEuYXV0aERhdGEgfHxcbiAgICAgICAgIU9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoIHx8XG4gICAgICAgIChPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCA9PT0gMSAmJlxuICAgICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSlbMF0gPT09ICdhbm9ueW1vdXMnKVxuICAgICAgKSB7XG4gICAgICAgIC8vIFdlIHVwZGF0ZWQgdGhlIGVtYWlsLCBzZW5kIGEgbmV3IHZhbGlkYXRpb25cbiAgICAgICAgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSA9IHRydWU7XG4gICAgICAgIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNldEVtYWlsVmVyaWZ5VG9rZW4odGhpcy5kYXRhKTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3kgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kpIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMoKS50aGVuKCgpID0+IHtcbiAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkoKTtcbiAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzID0gZnVuY3Rpb24gKCkge1xuICAvLyBjaGVjayBpZiB0aGUgcGFzc3dvcmQgY29uZm9ybXMgdG8gdGhlIGRlZmluZWQgcGFzc3dvcmQgcG9saWN5IGlmIGNvbmZpZ3VyZWRcbiAgLy8gSWYgd2Ugc3BlY2lmaWVkIGEgY3VzdG9tIGVycm9yIGluIG91ciBjb25maWd1cmF0aW9uIHVzZSBpdC5cbiAgLy8gRXhhbXBsZTogXCJQYXNzd29yZHMgbXVzdCBpbmNsdWRlIGEgQ2FwaXRhbCBMZXR0ZXIsIExvd2VyY2FzZSBMZXR0ZXIsIGFuZCBhIG51bWJlci5cIlxuICAvL1xuICAvLyBUaGlzIGlzIGVzcGVjaWFsbHkgdXNlZnVsIG9uIHRoZSBnZW5lcmljIFwicGFzc3dvcmQgcmVzZXRcIiBwYWdlLFxuICAvLyBhcyBpdCBhbGxvd3MgdGhlIHByb2dyYW1tZXIgdG8gY29tbXVuaWNhdGUgc3BlY2lmaWMgcmVxdWlyZW1lbnRzIGluc3RlYWQgb2Y6XG4gIC8vIGEuIG1ha2luZyB0aGUgdXNlciBndWVzcyB3aGF0cyB3cm9uZ1xuICAvLyBiLiBtYWtpbmcgYSBjdXN0b20gcGFzc3dvcmQgcmVzZXQgcGFnZSB0aGF0IHNob3dzIHRoZSByZXF1aXJlbWVudHNcbiAgY29uc3QgcG9saWN5RXJyb3IgPSB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0aW9uRXJyb3JcbiAgICA/IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgIDogJ1Bhc3N3b3JkIGRvZXMgbm90IG1lZXQgdGhlIFBhc3N3b3JkIFBvbGljeSByZXF1aXJlbWVudHMuJztcbiAgY29uc3QgY29udGFpbnNVc2VybmFtZUVycm9yID0gJ1Bhc3N3b3JkIGNhbm5vdCBjb250YWluIHlvdXIgdXNlcm5hbWUuJztcblxuICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBtZWV0cyB0aGUgcGFzc3dvcmQgc3RyZW5ndGggcmVxdWlyZW1lbnRzXG4gIGlmIChcbiAgICAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvciAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IodGhpcy5kYXRhLnBhc3N3b3JkKSkgfHxcbiAgICAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgJiZcbiAgICAgICF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayh0aGlzLmRhdGEucGFzc3dvcmQpKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIHBvbGljeUVycm9yKSk7XG4gIH1cblxuICAvLyBjaGVjayB3aGV0aGVyIHBhc3N3b3JkIGNvbnRhaW4gdXNlcm5hbWVcbiAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSA9PT0gdHJ1ZSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICAgIC8vIHVzZXJuYW1lIGlzIG5vdCBwYXNzZWQgZHVyaW5nIHBhc3N3b3JkIHJlc2V0XG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YodGhpcy5kYXRhLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGNvbnRhaW5zVXNlcm5hbWVFcnJvcikpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyByZXRyaWV2ZSB0aGUgVXNlciBvYmplY3QgdXNpbmcgb2JqZWN0SWQgZHVyaW5nIHBhc3N3b3JkIHJlc2V0XG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHJlc3VsdHNbMF0udXNlcm5hbWUpID49IDApXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGNvbnRhaW5zVXNlcm5hbWVFcnJvcilcbiAgICAgICAgICApO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgaXMgcmVwZWF0aW5nIGZyb20gc3BlY2lmaWVkIGhpc3RvcnlcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KVxuICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgIHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnksXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgLSAxXG4gICAgICAgICAgKTtcbiAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgIGNvbnN0IG5ld1Bhc3N3b3JkID0gdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICAvLyBjb21wYXJlIHRoZSBuZXcgcGFzc3dvcmQgaGFzaCB3aXRoIGFsbCBvbGQgcGFzc3dvcmQgaGFzaGVzXG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gb2xkUGFzc3dvcmRzLm1hcChmdW5jdGlvbiAoaGFzaCkge1xuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKG5ld1Bhc3N3b3JkLCBoYXNoKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0KVxuICAgICAgICAgICAgICAvLyByZWplY3QgaWYgdGhlcmUgaXMgYSBtYXRjaFxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoJ1JFUEVBVF9QQVNTV09SRCcpO1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gd2FpdCBmb3IgYWxsIGNvbXBhcmlzb25zIHRvIGNvbXBsZXRlXG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIgPT09ICdSRVBFQVRfUEFTU1dPUkQnKVxuICAgICAgICAgICAgICAvLyBhIG1hdGNoIHdhcyBmb3VuZFxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICAgICAgICAgIGBOZXcgcGFzc3dvcmQgc2hvdWxkIG5vdCBiZSB0aGUgc2FtZSBhcyBsYXN0ICR7dGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5fSBwYXNzd29yZHMuYFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBzZXNzaW9uIGZvciB1cGRhdGluZyB1c2VyICh0aGlzLnF1ZXJ5IGlzIHNldCkgdW5sZXNzIGF1dGhEYXRhIGV4aXN0c1xuICBpZiAodGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERvbid0IGdlbmVyYXRlIG5ldyBzZXNzaW9uVG9rZW4gaWYgbGlua2luZyB2aWEgc2Vzc2lvblRva2VuXG4gIGlmICh0aGlzLmF1dGgudXNlciAmJiB0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKFxuICAgICF0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyICYmIC8vIHNpZ251cCBjYWxsLCB3aXRoXG4gICAgdGhpcy5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCAmJiAvLyBubyBsb2dpbiB3aXRob3V0IHZlcmlmaWNhdGlvblxuICAgIHRoaXMuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHNcbiAgKSB7XG4gICAgLy8gdmVyaWZpY2F0aW9uIGlzIG9uXG4gICAgcmV0dXJuOyAvLyBkbyBub3QgY3JlYXRlIHRoZSBzZXNzaW9uIHRva2VuIGluIHRoYXQgY2FzZSFcbiAgfVxuICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY3JlYXRlU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvLyBjbG91ZCBpbnN0YWxsYXRpb25JZCBmcm9tIENsb3VkIENvZGUsXG4gIC8vIG5ldmVyIGNyZWF0ZSBzZXNzaW9uIHRva2VucyBmcm9tIHRoZXJlLlxuICBpZiAodGhpcy5hdXRoLmluc3RhbGxhdGlvbklkICYmIHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCA9PT0gJ2Nsb3VkJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID09IG51bGwgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkuam9pbignLCcpO1xuICB9XG5cbiAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICB1c2VySWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgYWN0aW9uOiB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID8gJ2xvZ2luJyA6ICdzaWdudXAnLFxuICAgICAgYXV0aFByb3ZpZGVyOiB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyIHx8ICdwYXNzd29yZCcsXG4gICAgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkLFxuICB9KTtcblxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG4gIH1cblxuICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpO1xufTtcblxuUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24gPSBmdW5jdGlvbiAoXG4gIGNvbmZpZyxcbiAgeyB1c2VySWQsIGNyZWF0ZWRXaXRoLCBpbnN0YWxsYXRpb25JZCwgYWRkaXRpb25hbFNlc3Npb25EYXRhIH1cbikge1xuICBjb25zdCB0b2tlbiA9ICdyOicgKyBjcnlwdG9VdGlscy5uZXdUb2tlbigpO1xuICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gIGNvbnN0IHNlc3Npb25EYXRhID0ge1xuICAgIHNlc3Npb25Ub2tlbjogdG9rZW4sXG4gICAgdXNlcjoge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgIH0sXG4gICAgY3JlYXRlZFdpdGgsXG4gICAgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCksXG4gIH07XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgc2Vzc2lvbkRhdGEuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIE9iamVjdC5hc3NpZ24oc2Vzc2lvbkRhdGEsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSk7XG5cbiAgcmV0dXJuIHtcbiAgICBzZXNzaW9uRGF0YSxcbiAgICBjcmVhdGVTZXNzaW9uOiAoKSA9PlxuICAgICAgbmV3IFJlc3RXcml0ZShjb25maWcsIEF1dGgubWFzdGVyKGNvbmZpZyksICdfU2Vzc2lvbicsIG51bGwsIHNlc3Npb25EYXRhKS5leGVjdXRlKCksXG4gIH07XG59O1xuXG4vLyBEZWxldGUgZW1haWwgcmVzZXQgdG9rZW5zIGlmIHVzZXIgaXMgY2hhbmdpbmcgcGFzc3dvcmQgb3IgZW1haWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgdGhpcy5xdWVyeSA9PT0gbnVsbCkge1xuICAgIC8vIG51bGwgcXVlcnkgbWVhbnMgY3JlYXRlXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCdwYXNzd29yZCcgaW4gdGhpcy5kYXRhIHx8ICdlbWFpbCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgYWRkT3BzID0ge1xuICAgICAgX3BlcmlzaGFibGVfdG9rZW46IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICAgIF9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ6IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICB9O1xuICAgIHRoaXMuZGF0YSA9IE9iamVjdC5hc3NpZ24odGhpcy5kYXRhLCBhZGRPcHMpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIE9ubHkgZm9yIF9TZXNzaW9uLCBhbmQgYXQgY3JlYXRpb24gdGltZVxuICBpZiAodGhpcy5jbGFzc05hbWUgIT0gJ19TZXNzaW9uJyB8fCB0aGlzLnF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERlc3Ryb3kgdGhlIHNlc3Npb25zIGluICdCYWNrZ3JvdW5kJ1xuICBjb25zdCB7IHVzZXIsIGluc3RhbGxhdGlvbklkLCBzZXNzaW9uVG9rZW4gfSA9IHRoaXMuZGF0YTtcbiAgaWYgKCF1c2VyIHx8ICFpbnN0YWxsYXRpb25JZCkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIXVzZXIub2JqZWN0SWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveShcbiAgICAnX1Nlc3Npb24nLFxuICAgIHtcbiAgICAgIHVzZXIsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHNlc3Npb25Ub2tlbjogeyAkbmU6IHNlc3Npb25Ub2tlbiB9LFxuICAgIH0sXG4gICAge30sXG4gICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgKTtcbn07XG5cbi8vIEhhbmRsZXMgYW55IGZvbGxvd3VwIGxvZ2ljXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUZvbGxvd3VwID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddICYmIHRoaXMuY29uZmlnLnJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQpIHtcbiAgICB2YXIgc2Vzc2lvblF1ZXJ5ID0ge1xuICAgICAgdXNlcjoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXTtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5kZXN0cm95KCdfU2Vzc2lvbicsIHNlc3Npb25RdWVyeSlcbiAgICAgIC50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKS50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXTtcbiAgICAvLyBGaXJlIGFuZCBmb3JnZXQhXG4gICAgdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHRoaXMuZGF0YSk7XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX1Nlc3Npb24gY2xhc3Mgc3BlY2lhbG5lc3MuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhbiBfU2Vzc2lvbiBvYmplY3QuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZVNlc3Npb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX1Nlc3Npb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGgudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gcmVxdWlyZWQuJyk7XG4gIH1cblxuICAvLyBUT0RPOiBWZXJpZnkgcHJvcGVyIGVycm9yIHRvIHRocm93XG4gIGlmICh0aGlzLmRhdGEuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdDYW5ub3Qgc2V0ICcgKyAnQUNMIG9uIGEgU2Vzc2lvbi4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgaWYgKHRoaXMuZGF0YS51c2VyICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgdGhpcy5kYXRhLnVzZXIub2JqZWN0SWQgIT0gdGhpcy5hdXRoLnVzZXIuaWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLnNlc3Npb25Ub2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH1cbiAgfVxuXG4gIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgY29uc3QgYWRkaXRpb25hbFNlc3Npb25EYXRhID0ge307XG4gICAgZm9yICh2YXIga2V5IGluIHRoaXMuZGF0YSkge1xuICAgICAgaWYgKGtleSA9PT0gJ29iamVjdElkJyB8fCBrZXkgPT09ICd1c2VyJykge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGFkZGl0aW9uYWxTZXNzaW9uRGF0YVtrZXldID0gdGhpcy5kYXRhW2tleV07XG4gICAgfVxuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdjcmVhdGUnLFxuICAgICAgfSxcbiAgICAgIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSxcbiAgICB9KTtcblxuICAgIHJldHVybiBjcmVhdGVTZXNzaW9uKCkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5yZXNwb25zZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCAnRXJyb3IgY3JlYXRpbmcgc2Vzc2lvbi4nKTtcbiAgICAgIH1cbiAgICAgIHNlc3Npb25EYXRhWydvYmplY3RJZCddID0gcmVzdWx0cy5yZXNwb25zZVsnb2JqZWN0SWQnXTtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgIHN0YXR1czogMjAxLFxuICAgICAgICBsb2NhdGlvbjogcmVzdWx0cy5sb2NhdGlvbixcbiAgICAgICAgcmVzcG9uc2U6IHNlc3Npb25EYXRhLFxuICAgICAgfTtcbiAgICB9KTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX0luc3RhbGxhdGlvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIGluc3RhbGxhdGlvbiBvYmplY3QuXG4vLyBJZiBhbiBpbnN0YWxsYXRpb24gaXMgZm91bmQsIHRoaXMgY2FuIG11dGF0ZSB0aGlzLnF1ZXJ5IGFuZCB0dXJuIGEgY3JlYXRlXG4vLyBpbnRvIGFuIHVwZGF0ZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlSW5zdGFsbGF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLmNsYXNzTmFtZSAhPT0gJ19JbnN0YWxsYXRpb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKFxuICAgICF0aGlzLnF1ZXJ5ICYmXG4gICAgIXRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAhdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIDEzNSxcbiAgICAgICdhdCBsZWFzdCBvbmUgSUQgZmllbGQgKGRldmljZVRva2VuLCBpbnN0YWxsYXRpb25JZCkgJyArICdtdXN0IGJlIHNwZWNpZmllZCBpbiB0aGlzIG9wZXJhdGlvbidcbiAgICApO1xuICB9XG5cbiAgLy8gSWYgdGhlIGRldmljZSB0b2tlbiBpcyA2NCBjaGFyYWN0ZXJzIGxvbmcsIHdlIGFzc3VtZSBpdCBpcyBmb3IgaU9TXG4gIC8vIGFuZCBsb3dlcmNhc2UgaXQuXG4gIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgdGhpcy5kYXRhLmRldmljZVRva2VuLmxlbmd0aCA9PSA2NCkge1xuICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiA9IHRoaXMuZGF0YS5kZXZpY2VUb2tlbi50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gV2UgbG93ZXJjYXNlIHRoZSBpbnN0YWxsYXRpb25JZCBpZiBwcmVzZW50XG4gIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIGxldCBpbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZDtcblxuICAvLyBJZiBkYXRhLmluc3RhbGxhdGlvbklkIGlzIG5vdCBzZXQgYW5kIHdlJ3JlIG5vdCBtYXN0ZXIsIHdlIGNhbiBsb29rdXAgaW4gYXV0aFxuICBpZiAoIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBpbnN0YWxsYXRpb25JZCA9IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIGluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIC8vIFVwZGF0aW5nIF9JbnN0YWxsYXRpb24gYnV0IG5vdCB1cGRhdGluZyBhbnl0aGluZyBjcml0aWNhbFxuICBpZiAodGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmICFpbnN0YWxsYXRpb25JZCAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gIHZhciBpZE1hdGNoOyAvLyBXaWxsIGJlIGEgbWF0Y2ggb24gZWl0aGVyIG9iamVjdElkIG9yIGluc3RhbGxhdGlvbklkXG4gIHZhciBvYmplY3RJZE1hdGNoO1xuICB2YXIgaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgdmFyIGRldmljZVRva2VuTWF0Y2hlcyA9IFtdO1xuXG4gIC8vIEluc3RlYWQgb2YgaXNzdWluZyAzIHJlYWRzLCBsZXQncyBkbyBpdCB3aXRoIG9uZSBPUi5cbiAgY29uc3Qgb3JRdWVyaWVzID0gW107XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBvYmplY3RJZDogdGhpcy5xdWVyeS5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG4gIH1cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgIG9yUXVlcmllcy5wdXNoKHsgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbiB9KTtcbiAgfVxuXG4gIGlmIChvclF1ZXJpZXMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcm9taXNlID0gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgICAnX0luc3RhbGxhdGlvbicsXG4gICAgICAgIHtcbiAgICAgICAgICAkb3I6IG9yUXVlcmllcyxcbiAgICAgICAgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIHJlc3VsdC5vYmplY3RJZCA9PSB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgb2JqZWN0SWRNYXRjaCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVzdWx0Lmluc3RhbGxhdGlvbklkID09IGluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgaW5zdGFsbGF0aW9uSWRNYXRjaCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVzdWx0LmRldmljZVRva2VuID09IHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgICAgICAgIGRldmljZVRva2VuTWF0Y2hlcy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBTYW5pdHkgY2hlY2tzIHdoZW4gcnVubmluZyBhIHF1ZXJ5XG4gICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIGlmICghb2JqZWN0SWRNYXRjaCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZCBmb3IgdXBkYXRlLicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICBvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICE9PSBvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdpbnN0YWxsYXRpb25JZCBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICBvYmplY3RJZE1hdGNoLmRldmljZVRva2VuICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVRva2VuICE9PSBvYmplY3RJZE1hdGNoLmRldmljZVRva2VuICYmXG4gICAgICAgICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgICFvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUb2tlbiBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVHlwZVxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCAnZGV2aWNlVHlwZSBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgb2JqZWN0SWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gb2JqZWN0SWRNYXRjaDtcbiAgICAgIH1cblxuICAgICAgaWYgKGluc3RhbGxhdGlvbklkICYmIGluc3RhbGxhdGlvbklkTWF0Y2gpIHtcbiAgICAgICAgaWRNYXRjaCA9IGluc3RhbGxhdGlvbklkTWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBuZWVkIHRvIHNwZWNpZnkgZGV2aWNlVHlwZSBvbmx5IGlmIGl0J3MgbmV3XG4gICAgICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5kZXZpY2VUeXBlICYmICFpZE1hdGNoKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzUsICdkZXZpY2VUeXBlIG11c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJyk7XG4gICAgICB9XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICBpZiAoIWlkTWF0Y2gpIHtcbiAgICAgICAgaWYgKCFkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJlxuICAgICAgICAgICghZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydpbnN0YWxsYXRpb25JZCddIHx8ICFpbnN0YWxsYXRpb25JZClcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gU2luZ2xlIG1hdGNoIG9uIGRldmljZSB0b2tlbiBidXQgbm9uZSBvbiBpbnN0YWxsYXRpb25JZCwgYW5kIGVpdGhlclxuICAgICAgICAgIC8vIHRoZSBwYXNzZWQgb2JqZWN0IG9yIHRoZSBtYXRjaCBpcyBtaXNzaW5nIGFuIGluc3RhbGxhdGlvbklkLCBzbyB3ZVxuICAgICAgICAgIC8vIGNhbiBqdXN0IHJldHVybiB0aGUgbWF0Y2guXG4gICAgICAgICAgcmV0dXJuIGRldmljZVRva2VuTWF0Y2hlc1swXVsnb2JqZWN0SWQnXTtcbiAgICAgICAgfSBlbHNlIGlmICghdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgMTMyLFxuICAgICAgICAgICAgJ011c3Qgc3BlY2lmeSBpbnN0YWxsYXRpb25JZCB3aGVuIGRldmljZVRva2VuICcgK1xuICAgICAgICAgICAgICAnbWF0Y2hlcyBtdWx0aXBsZSBJbnN0YWxsYXRpb24gb2JqZWN0cydcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE11bHRpcGxlIGRldmljZSB0b2tlbiBtYXRjaGVzIGFuZCB3ZSBzcGVjaWZpZWQgYW4gaW5zdGFsbGF0aW9uIElELFxuICAgICAgICAgIC8vIG9yIGEgc2luZ2xlIG1hdGNoIHdoZXJlIGJvdGggdGhlIHBhc3NlZCBhbmQgbWF0Y2hpbmcgb2JqZWN0cyBoYXZlXG4gICAgICAgICAgLy8gYW4gaW5zdGFsbGF0aW9uIElELiBUcnkgY2xlYW5pbmcgb3V0IG9sZCBpbnN0YWxsYXRpb25zIHRoYXQgbWF0Y2hcbiAgICAgICAgICAvLyB0aGUgZGV2aWNlVG9rZW4sIGFuZCByZXR1cm4gbmlsIHRvIHNpZ25hbCB0aGF0IGEgbmV3IG9iamVjdCBzaG91bGRcbiAgICAgICAgICAvLyBiZSBjcmVhdGVkLlxuICAgICAgICAgIHZhciBkZWxRdWVyeSA9IHtcbiAgICAgICAgICAgIGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4sXG4gICAgICAgICAgICBpbnN0YWxsYXRpb25JZDoge1xuICAgICAgICAgICAgICAkbmU6IGluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEuYXBwSWRlbnRpZmllcikge1xuICAgICAgICAgICAgZGVsUXVlcnlbJ2FwcElkZW50aWZpZXInXSA9IHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoID09IDEgJiYgIWRldmljZVRva2VuTWF0Y2hlc1swXVsnaW5zdGFsbGF0aW9uSWQnXSkge1xuICAgICAgICAgIC8vIEV4YWN0bHkgb25lIGRldmljZSB0b2tlbiBtYXRjaCBhbmQgaXQgZG9lc24ndCBoYXZlIGFuIGluc3RhbGxhdGlvblxuICAgICAgICAgIC8vIElELiBUaGlzIGlzIHRoZSBvbmUgY2FzZSB3aGVyZSB3ZSB3YW50IHRvIG1lcmdlIHdpdGggdGhlIGV4aXN0aW5nXG4gICAgICAgICAgLy8gb2JqZWN0LlxuICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0geyBvYmplY3RJZDogaWRNYXRjaC5vYmplY3RJZCB9O1xuICAgICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgICAgLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGRldmljZVRva2VuTWF0Y2hlc1swXVsnb2JqZWN0SWQnXTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZFxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuICYmIGlkTWF0Y2guZGV2aWNlVG9rZW4gIT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgICAvLyBXZSdyZSBzZXR0aW5nIHRoZSBkZXZpY2UgdG9rZW4gb24gYW4gZXhpc3RpbmcgaW5zdGFsbGF0aW9uLCBzb1xuICAgICAgICAgICAgLy8gd2Ugc2hvdWxkIHRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaCB0aGlzXG4gICAgICAgICAgICAvLyBkZXZpY2UgdG9rZW4uXG4gICAgICAgICAgICBjb25zdCBkZWxRdWVyeSA9IHtcbiAgICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAvLyBXZSBoYXZlIGEgdW5pcXVlIGluc3RhbGwgSWQsIHVzZSB0aGF0IHRvIHByZXNlcnZlXG4gICAgICAgICAgICAvLyB0aGUgaW50ZXJlc3RpbmcgaW5zdGFsbGF0aW9uXG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydpbnN0YWxsYXRpb25JZCddID0ge1xuICAgICAgICAgICAgICAgICRuZTogdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICAgaWRNYXRjaC5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgaWRNYXRjaC5vYmplY3RJZCA9PSB0aGlzLmRhdGEub2JqZWN0SWRcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAvLyB3ZSBwYXNzZWQgYW4gb2JqZWN0SWQsIHByZXNlcnZlIHRoYXQgaW5zdGFsYXRpb25cbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ29iamVjdElkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiBpZE1hdGNoLm9iamVjdElkLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gV2hhdCB0byBkbyBoZXJlPyBjYW4ndCByZWFsbHkgY2xlYW4gdXAgZXZlcnl0aGluZy4uLlxuICAgICAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuYXBwSWRlbnRpZmllcikge1xuICAgICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWQuXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJbiBub24tbWVyZ2Ugc2NlbmFyaW9zLCBqdXN0IHJldHVybiB0aGUgaW5zdGFsbGF0aW9uIG1hdGNoIGlkXG4gICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKG9iaklkID0+IHtcbiAgICAgIGlmIChvYmpJZCkge1xuICAgICAgICB0aGlzLnF1ZXJ5ID0geyBvYmplY3RJZDogb2JqSWQgfTtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG4gICAgICB9XG4gICAgICAvLyBUT0RPOiBWYWxpZGF0ZSBvcHMgKGFkZC9yZW1vdmUgb24gY2hhbm5lbHMsICRpbmMgb24gYmFkZ2UsIGV0Yy4pXG4gICAgfSk7XG4gIHJldHVybiBwcm9taXNlO1xufTtcblxuLy8gSWYgd2Ugc2hvcnQtY2lyY3VpdGVkIHRoZSBvYmplY3QgcmVzcG9uc2UgLSB0aGVuIHdlIG5lZWQgdG8gbWFrZSBzdXJlIHdlIGV4cGFuZCBhbGwgdGhlIGZpbGVzLFxuLy8gc2luY2UgdGhpcyBtaWdodCBub3QgaGF2ZSBhIHF1ZXJ5LCBtZWFuaW5nIGl0IHdvbid0IHJldHVybiB0aGUgZnVsbCByZXN1bHQgYmFjay5cbi8vIFRPRE86IChubHV0c2Vua28pIFRoaXMgc2hvdWxkIGRpZSB3aGVuIHdlIG1vdmUgdG8gcGVyLWNsYXNzIGJhc2VkIGNvbnRyb2xsZXJzIG9uIF9TZXNzaW9uL19Vc2VyXG5SZXN0V3JpdGUucHJvdG90eXBlLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzID0gZnVuY3Rpb24gKCkge1xuICAvLyBDaGVjayB3aGV0aGVyIHdlIGhhdmUgYSBzaG9ydC1jaXJjdWl0ZWQgcmVzcG9uc2UgLSBvbmx5IHRoZW4gcnVuIGV4cGFuc2lvbi5cbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5EYXRhYmFzZU9wZXJhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUm9sZScpIHtcbiAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIucm9sZS5jbGVhcigpO1xuICAgIGlmICh0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyKSB7XG4gICAgICB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLmNsZWFyQ2FjaGVkUm9sZXModGhpcy5hdXRoLnVzZXIpO1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiB0aGlzLnF1ZXJ5ICYmIHRoaXMuYXV0aC5pc1VuYXV0aGVudGljYXRlZCgpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuU0VTU0lPTl9NSVNTSU5HLFxuICAgICAgYENhbm5vdCBtb2RpZnkgdXNlciAke3RoaXMucXVlcnkub2JqZWN0SWR9LmBcbiAgICApO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1Byb2R1Y3QnICYmIHRoaXMuZGF0YS5kb3dubG9hZCkge1xuICAgIHRoaXMuZGF0YS5kb3dubG9hZE5hbWUgPSB0aGlzLmRhdGEuZG93bmxvYWQubmFtZTtcbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBiZXR0ZXIgZGV0ZWN0aW9uIGZvciBBQ0wsIGVuc3VyaW5nIGEgdXNlciBjYW4ndCBiZSBsb2NrZWQgZnJvbVxuICAvLyAgICAgICB0aGVpciBvd24gdXNlciByZWNvcmQuXG4gIGlmICh0aGlzLmRhdGEuQUNMICYmIHRoaXMuZGF0YS5BQ0xbJyp1bnJlc29sdmVkJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9BQ0wsICdJbnZhbGlkIEFDTC4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgLy8gRm9yY2UgdGhlIHVzZXIgdG8gbm90IGxvY2tvdXRcbiAgICAvLyBNYXRjaGVkIHdpdGggcGFyc2UuY29tXG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmIHRoaXMuZGF0YS5BQ0wgJiYgdGhpcy5hdXRoLmlzTWFzdGVyICE9PSB0cnVlKSB7XG4gICAgICB0aGlzLmRhdGEuQUNMW3RoaXMucXVlcnkub2JqZWN0SWRdID0geyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9O1xuICAgIH1cbiAgICAvLyB1cGRhdGUgcGFzc3dvcmQgdGltZXN0YW1wIGlmIHVzZXIgcGFzc3dvcmQgaXMgYmVpbmcgY2hhbmdlZFxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgKSB7XG4gICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgIH1cbiAgICAvLyBJZ25vcmUgY3JlYXRlZEF0IHdoZW4gdXBkYXRlXG4gICAgZGVsZXRlIHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG5cbiAgICBsZXQgZGVmZXIgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAvLyBpZiBwYXNzd29yZCBoaXN0b3J5IGlzIGVuYWJsZWQgdGhlbiBzYXZlIHRoZSBjdXJyZW50IHBhc3N3b3JkIHRvIGhpc3RvcnlcbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICApIHtcbiAgICAgIGRlZmVyID0gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLmZpbmQoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgICB7IGtleXM6IFsnX3Bhc3N3b3JkX2hpc3RvcnknLCAnX2hhc2hlZF9wYXNzd29yZCddIH1cbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgICAgaWYgKHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnkpIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvL24tMSBwYXNzd29yZHMgZ28gaW50byBoaXN0b3J5IGluY2x1ZGluZyBsYXN0IHBhc3N3b3JkXG4gICAgICAgICAgd2hpbGUgKFxuICAgICAgICAgICAgb2xkUGFzc3dvcmRzLmxlbmd0aCA+IE1hdGgubWF4KDAsIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDIpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMuc2hpZnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9oaXN0b3J5ID0gb2xkUGFzc3dvcmRzO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVmZXIudGhlbigoKSA9PiB7XG4gICAgICAvLyBSdW4gYW4gdXBkYXRlXG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgcmVzcG9uc2UudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlID0geyByZXNwb25zZSB9O1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBTZXQgdGhlIGRlZmF1bHQgQUNMIGFuZCBwYXNzd29yZCB0aW1lc3RhbXAgZm9yIHRoZSBuZXcgX1VzZXJcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIHZhciBBQ0wgPSB0aGlzLmRhdGEuQUNMO1xuICAgICAgLy8gZGVmYXVsdCBwdWJsaWMgci93IEFDTFxuICAgICAgaWYgKCFBQ0wpIHtcbiAgICAgICAgQUNMID0ge307XG4gICAgICAgIGlmICghdGhpcy5jb25maWcuZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgICAgICAgIEFDTFsnKiddID0geyByZWFkOiB0cnVlLCB3cml0ZTogZmFsc2UgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gbWFrZSBzdXJlIHRoZSB1c2VyIGlzIG5vdCBsb2NrZWQgZG93blxuICAgICAgQUNMW3RoaXMuZGF0YS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgICB0aGlzLmRhdGEuQUNMID0gQUNMO1xuICAgICAgLy8gcGFzc3dvcmQgdGltZXN0YW1wIHRvIGJlIHVzZWQgd2hlbiBwYXNzd29yZCBleHBpcnkgcG9saWN5IGlzIGVuZm9yY2VkXG4gICAgICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSdW4gYSBjcmVhdGVcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5jcmVhdGUodGhpcy5jbGFzc05hbWUsIHRoaXMuZGF0YSwgdGhpcy5ydW5PcHRpb25zLCBmYWxzZSwgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBRdWljayBjaGVjaywgaWYgd2Ugd2VyZSBhYmxlIHRvIGluZmVyIHRoZSBkdXBsaWNhdGVkIGZpZWxkIG5hbWVcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLnVzZXJJbmZvICYmIGVycm9yLnVzZXJJbmZvLmR1cGxpY2F0ZWRfZmllbGQgPT09ICd1c2VybmFtZScpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLnVzZXJJbmZvICYmIGVycm9yLnVzZXJJbmZvLmR1cGxpY2F0ZWRfZmllbGQgPT09ICdlbWFpbCcpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB0aGlzIHdhcyBhIGZhaWxlZCB1c2VyIGNyZWF0aW9uIGR1ZSB0byB1c2VybmFtZSBvciBlbWFpbCBhbHJlYWR5IHRha2VuLCB3ZSBuZWVkIHRvXG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgaXQgd2FzIHVzZXJuYW1lIG9yIGVtYWlsIGFuZCByZXR1cm4gdGhlIGFwcHJvcHJpYXRlIGVycm9yLlxuICAgICAgICAvLyBGYWxsYmFjayB0byB0aGUgb3JpZ2luYWwgbWV0aG9kXG4gICAgICAgIC8vIFRPRE86IFNlZSBpZiB3ZSBjYW4gbGF0ZXIgZG8gdGhpcyB3aXRob3V0IGFkZGl0aW9uYWwgcXVlcmllcyBieSB1c2luZyBuYW1lZCBpbmRleGVzLlxuICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgICAuZmluZChcbiAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICB1c2VybmFtZTogdGhpcy5kYXRhLnVzZXJuYW1lLFxuICAgICAgICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgbGltaXQ6IDEgfVxuICAgICAgICAgIClcbiAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgeyBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLCBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9IH0sXG4gICAgICAgICAgICAgIHsgbGltaXQ6IDEgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgcmVzcG9uc2Uub2JqZWN0SWQgPSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIHJlc3BvbnNlLmNyZWF0ZWRBdCA9IHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG5cbiAgICAgICAgaWYgKHRoaXMucmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUpIHtcbiAgICAgICAgICByZXNwb25zZS51c2VybmFtZSA9IHRoaXMuZGF0YS51c2VybmFtZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKHJlc3BvbnNlLCB0aGlzLmRhdGEpO1xuICAgICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICAgIHN0YXR1czogMjAxLFxuICAgICAgICAgIHJlc3BvbnNlLFxuICAgICAgICAgIGxvY2F0aW9uOiB0aGlzLmxvY2F0aW9uKCksXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgfVxufTtcblxuLy8gUmV0dXJucyBub3RoaW5nIC0gZG9lc24ndCB3YWl0IGZvciB0aGUgdHJpZ2dlci5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQWZ0ZXJTYXZlVHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnJlc3BvbnNlIHx8ICF0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYWZ0ZXJTYXZlJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBjb25zdCBoYXNBZnRlclNhdmVIb29rID0gdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyhcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZFxuICApO1xuICBjb25zdCBoYXNMaXZlUXVlcnkgPSB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLmhhc0xpdmVRdWVyeSh0aGlzLmNsYXNzTmFtZSk7XG4gIGlmICghaGFzQWZ0ZXJTYXZlSG9vayAmJiAhaGFzTGl2ZVF1ZXJ5KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QgeyBvcmlnaW5hbE9iamVjdCwgdXBkYXRlZE9iamVjdCB9ID0gdGhpcy5idWlsZFBhcnNlT2JqZWN0cygpO1xuICB1cGRhdGVkT2JqZWN0Ll9oYW5kbGVTYXZlUmVzcG9uc2UodGhpcy5yZXNwb25zZS5yZXNwb25zZSwgdGhpcy5yZXNwb25zZS5zdGF0dXMgfHwgMjAwKTtcblxuICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAvLyBOb3RpZml5IExpdmVRdWVyeVNlcnZlciBpZiBwb3NzaWJsZVxuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hQ29udHJvbGxlci5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnModXBkYXRlZE9iamVjdC5jbGFzc05hbWUpO1xuICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIub25BZnRlclNhdmUoXG4gICAgICB1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgIHBlcm1zXG4gICAgKTtcbiAgfSk7XG5cbiAgLy8gUnVuIGFmdGVyU2F2ZSB0cmlnZ2VyXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1blRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIHRoaXMuY29udGV4dFxuICAgIClcbiAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgY29uc3QganNvblJldHVybmVkID0gcmVzdWx0ICYmICFyZXN1bHQuX3RvRnVsbEpTT047XG4gICAgICBpZiAoanNvblJldHVybmVkKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ09wcyA9IHt9O1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlID0gcmVzdWx0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZSA9IHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEoXG4gICAgICAgICAgKHJlc3VsdCB8fCB1cGRhdGVkT2JqZWN0KS50b0pTT04oKSxcbiAgICAgICAgICB0aGlzLmRhdGFcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC5jYXRjaChmdW5jdGlvbiAoZXJyKSB7XG4gICAgICBsb2dnZXIud2FybignYWZ0ZXJTYXZlIGNhdWdodCBhbiBlcnJvcicsIGVycik7XG4gICAgfSk7XG59O1xuXG4vLyBBIGhlbHBlciB0byBmaWd1cmUgb3V0IHdoYXQgbG9jYXRpb24gdGhpcyBvcGVyYXRpb24gaGFwcGVucyBhdC5cblJlc3RXcml0ZS5wcm90b3R5cGUubG9jYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBtaWRkbGUgPSB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyA/ICcvdXNlcnMvJyA6ICcvY2xhc3Nlcy8nICsgdGhpcy5jbGFzc05hbWUgKyAnLyc7XG4gIGNvbnN0IG1vdW50ID0gdGhpcy5jb25maWcubW91bnQgfHwgdGhpcy5jb25maWcuc2VydmVyVVJMO1xuICByZXR1cm4gbW91bnQgKyBtaWRkbGUgKyB0aGlzLmRhdGEub2JqZWN0SWQ7XG59O1xuXG4vLyBBIGhlbHBlciB0byBnZXQgdGhlIG9iamVjdCBpZCBmb3IgdGhpcyBvcGVyYXRpb24uXG4vLyBCZWNhdXNlIGl0IGNvdWxkIGJlIGVpdGhlciBvbiB0aGUgcXVlcnkgb3Igb24gdGhlIGRhdGFcblJlc3RXcml0ZS5wcm90b3R5cGUub2JqZWN0SWQgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLmRhdGEub2JqZWN0SWQgfHwgdGhpcy5xdWVyeS5vYmplY3RJZDtcbn07XG5cbi8vIFJldHVybnMgYSBjb3B5IG9mIHRoZSBkYXRhIGFuZCBkZWxldGUgYmFkIGtleXMgKF9hdXRoX2RhdGEsIF9oYXNoZWRfcGFzc3dvcmQuLi4pXG5SZXN0V3JpdGUucHJvdG90eXBlLnNhbml0aXplZERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IGRhdGEgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZSgoZGF0YSwga2V5KSA9PiB7XG4gICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgIGlmICghL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcbiAgcmV0dXJuIFBhcnNlLl9kZWNvZGUodW5kZWZpbmVkLCBkYXRhKTtcbn07XG5cbi8vIFJldHVybnMgYW4gdXBkYXRlZCBjb3B5IG9mIHRoZSBvYmplY3RcblJlc3RXcml0ZS5wcm90b3R5cGUuYnVpbGRQYXJzZU9iamVjdHMgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSwgb2JqZWN0SWQ6IHRoaXMucXVlcnk/Lm9iamVjdElkIH07XG4gIGxldCBvcmlnaW5hbE9iamVjdDtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yaWdpbmFsT2JqZWN0ID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHRoaXMub3JpZ2luYWxEYXRhKTtcbiAgfVxuXG4gIGNvbnN0IGNsYXNzTmFtZSA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihleHRyYURhdGEpO1xuICBjb25zdCByZWFkT25seUF0dHJpYnV0ZXMgPSBjbGFzc05hbWUuY29uc3RydWN0b3IucmVhZE9ubHlBdHRyaWJ1dGVzXG4gICAgPyBjbGFzc05hbWUuY29uc3RydWN0b3IucmVhZE9ubHlBdHRyaWJ1dGVzKClcbiAgICA6IFtdO1xuICBpZiAoIXRoaXMub3JpZ2luYWxEYXRhKSB7XG4gICAgZm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgcmVhZE9ubHlBdHRyaWJ1dGVzKSB7XG4gICAgICBleHRyYURhdGFbYXR0cmlidXRlXSA9IHRoaXMuZGF0YVthdHRyaWJ1dGVdO1xuICAgIH1cbiAgfVxuICBjb25zdCB1cGRhdGVkT2JqZWN0ID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHRoaXMub3JpZ2luYWxEYXRhKTtcbiAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5yZWR1Y2UoZnVuY3Rpb24gKGRhdGEsIGtleSkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgaWYgKHR5cGVvZiBkYXRhW2tleV0uX19vcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaWYgKCFyZWFkT25seUF0dHJpYnV0ZXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICAgIHVwZGF0ZWRPYmplY3Quc2V0KGtleSwgZGF0YVtrZXldKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gc3ViZG9jdW1lbnQga2V5IHdpdGggZG90IG5vdGF0aW9uIHsgJ3gueSc6IHYgfSA9PiB7ICd4JzogeyAneScgOiB2IH0gfSlcbiAgICAgICAgY29uc3Qgc3BsaXR0ZWRLZXkgPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgcGFyZW50UHJvcCA9IHNwbGl0dGVkS2V5WzBdO1xuICAgICAgICBsZXQgcGFyZW50VmFsID0gdXBkYXRlZE9iamVjdC5nZXQocGFyZW50UHJvcCk7XG4gICAgICAgIGlmICh0eXBlb2YgcGFyZW50VmFsICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhcmVudFZhbCA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIHBhcmVudFZhbFtzcGxpdHRlZEtleVsxXV0gPSBkYXRhW2tleV07XG4gICAgICAgIHVwZGF0ZWRPYmplY3Quc2V0KHBhcmVudFByb3AsIHBhcmVudFZhbCk7XG4gICAgICB9XG4gICAgICBkZWxldGUgZGF0YVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfSwgZGVlcGNvcHkodGhpcy5kYXRhKSk7XG5cbiAgY29uc3Qgc2FuaXRpemVkID0gdGhpcy5zYW5pdGl6ZWREYXRhKCk7XG4gIGZvciAoY29uc3QgYXR0cmlidXRlIG9mIHJlYWRPbmx5QXR0cmlidXRlcykge1xuICAgIGRlbGV0ZSBzYW5pdGl6ZWRbYXR0cmlidXRlXTtcbiAgfVxuICB1cGRhdGVkT2JqZWN0LnNldChzYW5pdGl6ZWQpO1xuICByZXR1cm4geyB1cGRhdGVkT2JqZWN0LCBvcmlnaW5hbE9iamVjdCB9O1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jbGVhblVzZXJBdXRoRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSAmJiB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNvbnN0IHVzZXIgPSB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlO1xuICAgIGlmICh1c2VyLmF1dGhEYXRhKSB7XG4gICAgICBPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgaWYgKHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEgPSBmdW5jdGlvbiAocmVzcG9uc2UsIGRhdGEpIHtcbiAgY29uc3QgeyB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyh1cGRhdGVkT2JqZWN0Ll9nZXRTdGF0ZUlkZW50aWZpZXIoKSk7XG4gIGZvciAoY29uc3Qga2V5IGluIHRoaXMucGVuZGluZ09wcykge1xuICAgIGlmICghcGVuZGluZ1trZXldKSB7XG4gICAgICBkYXRhW2tleV0gPSB0aGlzLm9yaWdpbmFsRGF0YSA/IHRoaXMub3JpZ2luYWxEYXRhW2tleV0gOiB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IHNraXBLZXlzID0gW1xuICAgICdvYmplY3RJZCcsXG4gICAgJ2NyZWF0ZWRBdCcsXG4gICAgJ3VwZGF0ZWRBdCcsXG4gICAgLi4uKHJlcXVpcmVkQ29sdW1ucy5yZWFkW3RoaXMuY2xhc3NOYW1lXSB8fCBbXSksXG4gIF07XG4gIGZvciAoY29uc3Qga2V5IGluIHJlc3BvbnNlKSB7XG4gICAgaWYgKHNraXBLZXlzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCB2YWx1ZSA9IHJlc3BvbnNlW2tleV07XG4gICAgaWYgKHZhbHVlID09IG51bGwgfHwgKHZhbHVlLl9fdHlwZSAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykgfHwgZGF0YVtrZXldID09PSB2YWx1ZSkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2tleV07XG4gICAgfVxuICB9XG4gIGlmIChfLmlzRW1wdHkodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIpKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IGNsaWVudFN1cHBvcnRzRGVsZXRlID0gQ2xpZW50U0RLLnN1cHBvcnRzRm9yd2FyZERlbGV0ZSh0aGlzLmNsaWVudFNESyk7XG4gIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBjb25zdCBkYXRhVmFsdWUgPSBkYXRhW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgZmllbGROYW1lKSkge1xuICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICB9XG5cbiAgICAvLyBTdHJpcHMgb3BlcmF0aW9ucyBmcm9tIHJlc3BvbnNlc1xuICAgIGlmIChyZXNwb25zZVtmaWVsZE5hbWVdICYmIHJlc3BvbnNlW2ZpZWxkTmFtZV0uX19vcCkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoY2xpZW50U3VwcG9ydHNEZWxldGUgJiYgZGF0YVZhbHVlLl9fb3AgPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBSZXN0V3JpdGU7XG5tb2R1bGUuZXhwb3J0cyA9IFJlc3RXcml0ZTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBY0E7QUFDQTtBQUNBO0FBQ0E7QUFBaUU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBakJqRTtBQUNBO0FBQ0E7O0FBRUEsSUFBSUEsZ0JBQWdCLEdBQUdDLE9BQU8sQ0FBQyxnQ0FBZ0MsQ0FBQztBQUNoRSxJQUFJQyxRQUFRLEdBQUdELE9BQU8sQ0FBQyxVQUFVLENBQUM7QUFFbEMsTUFB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