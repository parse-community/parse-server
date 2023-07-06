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
  this.pendingOps = {
    operations: null,
    identifier: null
  };
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
    return this.checkRestrictedFields();
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
    if (this.storage.rejectSignup && this.config.preventSignupWithUnverifiedEmail) {
      throw new Parse.Error(Parse.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
    }
    return this.response;
  });
};

// Uses the Auth object to get the list of roles, adds the user id
RestWrite.prototype.getUserAndRoleACL = function () {
  if (this.auth.isMaster || this.auth.isMaintenance) {
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
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && !this.auth.isMaintenance && SchemaController.systemClasses.indexOf(this.className) === -1) {
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
  return this.config.database.validateObject(this.className, this.data, this.query, this.runOptions, this.auth.isMaintenance);
};

// Runs any beforeSave triggers against this operation.
// Any change leads to our data being mutated.
RestWrite.prototype.runBeforeSaveTrigger = function () {
  if (this.response || this.runOptions.many) {
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
  const identifier = updatedObject._getStateIdentifier();
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(identifier);
  this.pendingOps = {
    operations: _objectSpread({}, pending),
    identifier
  };
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
    try {
      Utils.checkProhibitedKeywords(this.config, this.data);
    } catch (error) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, error);
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
  if (this.auth.isMaster || this.auth.isMaintenance) {
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
        Auth.checkIfUserHasProvidedConfiguredProvidersForLogin({
          config: this.config,
          auth: this.auth
        }, authData, userResult.authData, this.config);
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
RestWrite.prototype.checkRestrictedFields = async function () {
  if (this.className !== '_User') {
    return;
  }
  if (!this.auth.isMaintenance && !this.auth.isMaster && 'emailVerified' in this.data) {
    const error = `Clients aren't allowed to manually update email verification.`;
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  }
};

// The non-third-party parts of User transformation
RestWrite.prototype.transformUser = function () {
  var promise = Promise.resolve();
  if (this.className !== '_User') {
    return promise;
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
      if (!this.auth.isMaster && !this.auth.isMaintenance) {
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
      const {
        originalObject,
        updatedObject
      } = this.buildParseObjects();
      const request = {
        original: originalObject,
        object: updatedObject,
        master: this.auth.isMaster,
        ip: this.config.ip
      };
      return this.config.userController.setEmailVerifyToken(this.data, request, this.storage);
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
    }, Auth.maintenance(this.config)).then(results => {
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
RestWrite.prototype.createSessionTokenIfNeeded = async function () {
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
  this.config.preventLoginWithUnverifiedEmail === true &&
  // no login without verification
  this.config.verifyUserEmails) {
    // verification is on
    this.storage.rejectSignup = true;
    return;
  }
  if (!this.storage.authProvider && this.config.verifyUserEmails) {
    let shouldPreventUnverifedLogin = this.config.preventLoginWithUnverifiedEmail;
    if (typeof this.config.preventLoginWithUnverifiedEmail === 'function') {
      const {
        originalObject,
        updatedObject
      } = this.buildParseObjects();
      const request = {
        original: originalObject,
        object: updatedObject,
        master: this.auth.isMaster,
        ip: this.config.ip
      };
      shouldPreventUnverifedLogin = await Promise.resolve(this.config.preventLoginWithUnverifiedEmail(request));
    }
    if (shouldPreventUnverifedLogin === true) {
      return;
    }
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
    this.config.userController.sendVerificationEmail(this.data, {
      auth: this.auth
    });
    return this.handleFollowup.bind(this);
  }
};

// Handles the _Session class specialness.
// Does nothing if this isn't an _Session object.
RestWrite.prototype.handleSession = function () {
  if (this.response || this.className !== '_Session') {
    return;
  }
  if (!this.auth.user && !this.auth.isMaster && !this.auth.isMaintenance) {
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
  if (!this.query && !this.auth.isMaster && !this.auth.isMaintenance) {
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
  if (!installationId && !this.auth.isMaster && !this.auth.isMaintenance) {
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
    if (this.className === '_User' && this.data.ACL && this.auth.isMaster !== true && this.auth.isMaintenance !== true) {
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
      }, Auth.maintenance(this.config)).then(results => {
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
  if (!this.response || !this.response.response || this.runOptions.many) {
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
  if (hasLiveQuery) {
    this.config.database.loadSchema().then(schemaController => {
      // Notify LiveQueryServer if possible
      const perms = schemaController.getClassLevelPermissions(updatedObject.className);
      this.config.liveQueryController.onAfterSave(updatedObject.className, updatedObject, originalObject, perms);
    });
  }
  if (!hasAfterSaveHook) {
    return Promise.resolve();
  }
  // Run afterSave trigger
  return triggers.maybeRunTrigger(triggers.Types.afterSave, this.auth, updatedObject, originalObject, this.config, this.context).then(result => {
    const jsonReturned = result && !result._toFullJSON;
    if (jsonReturned) {
      this.pendingOps.operations = {};
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
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(this.pendingOps.identifier);
  for (const key in this.pendingOps.operations) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsImRlZXBjb3B5IiwiQXV0aCIsIlV0aWxzIiwiY3J5cHRvVXRpbHMiLCJwYXNzd29yZENyeXB0byIsIlBhcnNlIiwidHJpZ2dlcnMiLCJDbGllbnRTREsiLCJ1dGlsIiwiUmVzdFdyaXRlIiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsInF1ZXJ5IiwiZGF0YSIsIm9yaWdpbmFsRGF0YSIsImNsaWVudFNESyIsImNvbnRleHQiLCJhY3Rpb24iLCJpc1JlYWRPbmx5IiwiRXJyb3IiLCJPUEVSQVRJT05fRk9SQklEREVOIiwic3RvcmFnZSIsInJ1bk9wdGlvbnMiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwib2JqZWN0SWQiLCJNSVNTSU5HX09CSkVDVF9JRCIsIklOVkFMSURfS0VZX05BTUUiLCJpZCIsInJlc3BvbnNlIiwidXBkYXRlZEF0IiwiX2VuY29kZSIsIkRhdGUiLCJpc28iLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJwZW5kaW5nT3BzIiwib3BlcmF0aW9ucyIsImlkZW50aWZpZXIiLCJleGVjdXRlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJoYW5kbGVJbnN0YWxsYXRpb24iLCJoYW5kbGVTZXNzaW9uIiwidmFsaWRhdGVBdXRoRGF0YSIsImNoZWNrUmVzdHJpY3RlZEZpZWxkcyIsInJ1bkJlZm9yZVNhdmVUcmlnZ2VyIiwiZW5zdXJlVW5pcXVlQXV0aERhdGFJZCIsImRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkIiwidmFsaWRhdGVTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwic2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCIsInRyYW5zZm9ybVVzZXIiLCJleHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cyIsImRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMiLCJydW5EYXRhYmFzZU9wZXJhdGlvbiIsImNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkIiwiaGFuZGxlRm9sbG93dXAiLCJydW5BZnRlclNhdmVUcmlnZ2VyIiwiY2xlYW5Vc2VyQXV0aERhdGEiLCJhdXRoRGF0YVJlc3BvbnNlIiwicmVqZWN0U2lnbnVwIiwicHJldmVudFNpZ251cFdpdGhVbnZlcmlmaWVkRW1haWwiLCJFTUFJTF9OT1RfRk9VTkQiLCJpc01hc3RlciIsImlzTWFpbnRlbmFuY2UiLCJhY2wiLCJ1c2VyIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJjb25jYXQiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJzeXN0ZW1DbGFzc2VzIiwiaW5kZXhPZiIsImRhdGFiYXNlIiwibG9hZFNjaGVtYSIsImhhc0NsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJtYW55IiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYmVmb3JlU2F2ZSIsImFwcGxpY2F0aW9uSWQiLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFBhcnNlT2JqZWN0cyIsIl9nZXRTdGF0ZUlkZW50aWZpZXIiLCJzdGF0ZUNvbnRyb2xsZXIiLCJDb3JlTWFuYWdlciIsImdldE9iamVjdFN0YXRlQ29udHJvbGxlciIsInBlbmRpbmciLCJnZXRQZW5kaW5nT3BzIiwiZGF0YWJhc2VQcm9taXNlIiwidXBkYXRlIiwiY3JlYXRlIiwicmVzdWx0IiwibGVuZ3RoIiwiT0JKRUNUX05PVF9GT1VORCIsIm1heWJlUnVuVHJpZ2dlciIsIm9iamVjdCIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJfIiwicmVkdWNlIiwidmFsdWUiLCJrZXkiLCJpc0VxdWFsIiwicHVzaCIsImNoZWNrUHJvaGliaXRlZEtleXdvcmRzIiwiZXJyb3IiLCJydW5CZWZvcmVMb2dpblRyaWdnZXIiLCJ1c2VyRGF0YSIsImJlZm9yZUxvZ2luIiwiZXh0cmFEYXRhIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsImluZmxhdGUiLCJnZXRBbGxDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsInNjaGVtYSIsImZpbmQiLCJvbmVDbGFzcyIsInNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCIsImZpZWxkTmFtZSIsInNldERlZmF1bHQiLCJ1bmRlZmluZWQiLCJfX29wIiwiZmllbGRzIiwiZGVmYXVsdFZhbHVlIiwicmVxdWlyZWQiLCJWQUxJREFUSU9OX0VSUk9SIiwiY3JlYXRlZEF0IiwibmV3T2JqZWN0SWQiLCJvYmplY3RJZFNpemUiLCJrZXlzIiwiZm9yRWFjaCIsImF1dGhEYXRhIiwiaGFzVXNlcm5hbWVBbmRQYXNzd29yZCIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJpc0VtcHR5IiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwicHJvdmlkZXJzIiwiY2FuSGFuZGxlQXV0aERhdGEiLCJzb21lIiwicHJvdmlkZXIiLCJwcm92aWRlckF1dGhEYXRhIiwiaGFzVG9rZW4iLCJnZXRVc2VySWQiLCJoYW5kbGVBdXRoRGF0YSIsImZpbHRlcmVkT2JqZWN0c0J5QUNMIiwib2JqZWN0cyIsImZpbHRlciIsIkFDTCIsImhhc0F1dGhEYXRhSWQiLCJyIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwicmVzdWx0cyIsIkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQiLCJ1c2VySWQiLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJ2YWxpZGF0ZWRBdXRoRGF0YSIsInVzZXJSZXN1bHQiLCJhdXRoUHJvdmlkZXIiLCJqb2luIiwiaGFzTXV0YXRlZEF1dGhEYXRhIiwibXV0YXRlZEF1dGhEYXRhIiwiaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyIiwiaXNMb2dpbiIsImxvY2F0aW9uIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsImFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4iLCJyZXMiLCJwcm9taXNlIiwiUmVzdFF1ZXJ5IiwibWFzdGVyIiwiX190eXBlIiwic2Vzc2lvbiIsImNhY2hlQ29udHJvbGxlciIsImRlbCIsInNlc3Npb25Ub2tlbiIsIl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwiaGFzaCIsImhhc2hlZFBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsIl92YWxpZGF0ZVVzZXJOYW1lIiwiX3ZhbGlkYXRlRW1haWwiLCJyYW5kb21TdHJpbmciLCJyZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSIsIiRuZSIsImxpbWl0IiwiY2FzZUluc2Vuc2l0aXZlIiwiVVNFUk5BTUVfVEFLRU4iLCJlbWFpbCIsIm1hdGNoIiwicmVqZWN0IiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwiRU1BSUxfVEFLRU4iLCJyZXF1ZXN0Iiwib3JpZ2luYWwiLCJpcCIsInVzZXJDb250cm9sbGVyIiwic2V0RW1haWxWZXJpZnlUb2tlbiIsInBhc3N3b3JkUG9saWN5IiwiX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMiLCJfdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkiLCJwb2xpY3lFcnJvciIsInZhbGlkYXRpb25FcnJvciIsImNvbnRhaW5zVXNlcm5hbWVFcnJvciIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsIm1haW50ZW5hbmNlIiwib2xkUGFzc3dvcmRzIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJ0YWtlIiwibmV3UGFzc3dvcmQiLCJwcm9taXNlcyIsIm1hcCIsImNvbXBhcmUiLCJhbGwiLCJjYXRjaCIsImVyciIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJ2ZXJpZnlVc2VyRW1haWxzIiwic2hvdWxkUHJldmVudFVudmVyaWZlZExvZ2luIiwiY3JlYXRlU2Vzc2lvblRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJjcmVhdGVkV2l0aCIsImFkZGl0aW9uYWxTZXNzaW9uRGF0YSIsInRva2VuIiwibmV3VG9rZW4iLCJleHBpcmVzQXQiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJhc3NpZ24iLCJhZGRPcHMiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJkZXN0cm95IiwicmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCIsInNlc3Npb25RdWVyeSIsImJpbmQiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCIkYW5kIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwic3RhdHVzIiwiZGV2aWNlVG9rZW4iLCJ0b0xvd2VyQ2FzZSIsImRldmljZVR5cGUiLCJpZE1hdGNoIiwib2JqZWN0SWRNYXRjaCIsImluc3RhbGxhdGlvbklkTWF0Y2giLCJkZXZpY2VUb2tlbk1hdGNoZXMiLCJvclF1ZXJpZXMiLCIkb3IiLCJkZWxRdWVyeSIsImFwcElkZW50aWZpZXIiLCJjb2RlIiwib2JqSWQiLCJyb2xlIiwiY2xlYXIiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiY2xlYXJDYWNoZWRSb2xlcyIsImlzVW5hdXRoZW50aWNhdGVkIiwiU0VTU0lPTl9NSVNTSU5HIiwiZG93bmxvYWQiLCJkb3dubG9hZE5hbWUiLCJuYW1lIiwiSU5WQUxJRF9BQ0wiLCJyZWFkIiwid3JpdGUiLCJtYXhQYXNzd29yZEFnZSIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiZGVmZXIiLCJNYXRoIiwibWF4Iiwic2hpZnQiLCJfdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJoYXNBZnRlclNhdmVIb29rIiwiYWZ0ZXJTYXZlIiwiaGFzTGl2ZVF1ZXJ5IiwiX2hhbmRsZVNhdmVSZXNwb25zZSIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwib25BZnRlclNhdmUiLCJqc29uUmV0dXJuZWQiLCJfdG9GdWxsSlNPTiIsInRvSlNPTiIsImxvZ2dlciIsIndhcm4iLCJtaWRkbGUiLCJtb3VudCIsInNlcnZlclVSTCIsInNhbml0aXplZERhdGEiLCJ0ZXN0IiwiX2RlY29kZSIsImZyb21KU09OIiwicmVhZE9ubHlBdHRyaWJ1dGVzIiwiY29uc3RydWN0b3IiLCJhdHRyaWJ1dGUiLCJpbmNsdWRlcyIsInNldCIsInNwbGl0dGVkS2V5Iiwic3BsaXQiLCJwYXJlbnRQcm9wIiwicGFyZW50VmFsIiwiZ2V0Iiwic2FuaXRpemVkIiwic2tpcEtleXMiLCJyZXF1aXJlZENvbHVtbnMiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImNsaWVudFN1cHBvcnRzRGVsZXRlIiwic3VwcG9ydHNGb3J3YXJkRGVsZXRlIiwiZGF0YVZhbHVlIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQSBSZXN0V3JpdGUgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYW4gb3BlcmF0aW9uXG4vLyB0aGF0IHdyaXRlcyB0byB0aGUgZGF0YWJhc2UuXG4vLyBUaGlzIGNvdWxkIGJlIGVpdGhlciBhIFwiY3JlYXRlXCIgb3IgYW4gXCJ1cGRhdGVcIi5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcbnZhciBkZWVwY29weSA9IHJlcXVpcmUoJ2RlZXBjb3B5Jyk7XG5cbmNvbnN0IEF1dGggPSByZXF1aXJlKCcuL0F1dGgnKTtcbmNvbnN0IFV0aWxzID0gcmVxdWlyZSgnLi9VdGlscycpO1xudmFyIGNyeXB0b1V0aWxzID0gcmVxdWlyZSgnLi9jcnlwdG9VdGlscycpO1xudmFyIHBhc3N3b3JkQ3J5cHRvID0gcmVxdWlyZSgnLi9wYXNzd29yZCcpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xudmFyIHRyaWdnZXJzID0gcmVxdWlyZSgnLi90cmlnZ2VycycpO1xudmFyIENsaWVudFNESyA9IHJlcXVpcmUoJy4vQ2xpZW50U0RLJyk7XG5jb25zdCB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuaW1wb3J0IFJlc3RRdWVyeSBmcm9tICcuL1Jlc3RRdWVyeSc7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyByZXF1aXJlZENvbHVtbnMgfSBmcm9tICcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuXG4vLyBxdWVyeSBhbmQgZGF0YSBhcmUgYm90aCBwcm92aWRlZCBpbiBSRVNUIEFQSSBmb3JtYXQuIFNvIGRhdGFcbi8vIHR5cGVzIGFyZSBlbmNvZGVkIGJ5IHBsYWluIG9sZCBvYmplY3RzLlxuLy8gSWYgcXVlcnkgaXMgbnVsbCwgdGhpcyBpcyBhIFwiY3JlYXRlXCIgYW5kIHRoZSBkYXRhIGluIGRhdGEgc2hvdWxkIGJlXG4vLyBjcmVhdGVkLlxuLy8gT3RoZXJ3aXNlIHRoaXMgaXMgYW4gXCJ1cGRhdGVcIiAtIHRoZSBvYmplY3QgbWF0Y2hpbmcgdGhlIHF1ZXJ5XG4vLyBzaG91bGQgZ2V0IHVwZGF0ZWQgd2l0aCBkYXRhLlxuLy8gUmVzdFdyaXRlIHdpbGwgaGFuZGxlIG9iamVjdElkLCBjcmVhdGVkQXQsIGFuZCB1cGRhdGVkQXQgZm9yXG4vLyBldmVyeXRoaW5nLiBJdCBhbHNvIGtub3dzIHRvIHVzZSB0cmlnZ2VycyBhbmQgc3BlY2lhbCBtb2RpZmljYXRpb25zXG4vLyBmb3IgdGhlIF9Vc2VyIGNsYXNzLlxuZnVuY3Rpb24gUmVzdFdyaXRlKGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCBxdWVyeSwgZGF0YSwgb3JpZ2luYWxEYXRhLCBjbGllbnRTREssIGNvbnRleHQsIGFjdGlvbikge1xuICBpZiAoYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICdDYW5ub3QgcGVyZm9ybSBhIHdyaXRlIG9wZXJhdGlvbiB3aGVuIHVzaW5nIHJlYWRPbmx5TWFzdGVyS2V5J1xuICAgICk7XG4gIH1cbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuYXV0aCA9IGF1dGg7XG4gIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB0aGlzLmNsaWVudFNESyA9IGNsaWVudFNESztcbiAgdGhpcy5zdG9yYWdlID0ge307XG4gIHRoaXMucnVuT3B0aW9ucyA9IHt9O1xuICB0aGlzLmNvbnRleHQgPSBjb250ZXh0IHx8IHt9O1xuXG4gIGlmIChhY3Rpb24pIHtcbiAgICB0aGlzLnJ1bk9wdGlvbnMuYWN0aW9uID0gYWN0aW9uO1xuICB9XG5cbiAgaWYgKCFxdWVyeSkge1xuICAgIGlmICh0aGlzLmNvbmZpZy5hbGxvd0N1c3RvbU9iamVjdElkKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGRhdGEsICdvYmplY3RJZCcpICYmICFkYXRhLm9iamVjdElkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5NSVNTSU5HX09CSkVDVF9JRCxcbiAgICAgICAgICAnb2JqZWN0SWQgbXVzdCBub3QgYmUgZW1wdHksIG51bGwgb3IgdW5kZWZpbmVkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZGF0YS5vYmplY3RJZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ29iamVjdElkIGlzIGFuIGludmFsaWQgZmllbGQgbmFtZS4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChkYXRhLmlkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnaWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLicpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFdoZW4gdGhlIG9wZXJhdGlvbiBpcyBjb21wbGV0ZSwgdGhpcy5yZXNwb25zZSBtYXkgaGF2ZSBzZXZlcmFsXG4gIC8vIGZpZWxkcy5cbiAgLy8gcmVzcG9uc2U6IHRoZSBhY3R1YWwgZGF0YSB0byBiZSByZXR1cm5lZFxuICAvLyBzdGF0dXM6IHRoZSBodHRwIHN0YXR1cyBjb2RlLiBpZiBub3QgcHJlc2VudCwgdHJlYXRlZCBsaWtlIGEgMjAwXG4gIC8vIGxvY2F0aW9uOiB0aGUgbG9jYXRpb24gaGVhZGVyLiBpZiBub3QgcHJlc2VudCwgbm8gbG9jYXRpb24gaGVhZGVyXG4gIHRoaXMucmVzcG9uc2UgPSBudWxsO1xuXG4gIC8vIFByb2Nlc3NpbmcgdGhpcyBvcGVyYXRpb24gbWF5IG11dGF0ZSBvdXIgZGF0YSwgc28gd2Ugb3BlcmF0ZSBvbiBhXG4gIC8vIGNvcHlcbiAgdGhpcy5xdWVyeSA9IGRlZXBjb3B5KHF1ZXJ5KTtcbiAgdGhpcy5kYXRhID0gZGVlcGNvcHkoZGF0YSk7XG4gIC8vIFdlIG5ldmVyIGNoYW5nZSBvcmlnaW5hbERhdGEsIHNvIHdlIGRvIG5vdCBuZWVkIGEgZGVlcCBjb3B5XG4gIHRoaXMub3JpZ2luYWxEYXRhID0gb3JpZ2luYWxEYXRhO1xuXG4gIC8vIFRoZSB0aW1lc3RhbXAgd2UnbGwgdXNlIGZvciB0aGlzIHdob2xlIG9wZXJhdGlvblxuICB0aGlzLnVwZGF0ZWRBdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSkuaXNvO1xuXG4gIC8vIFNoYXJlZCBTY2hlbWFDb250cm9sbGVyIHRvIGJlIHJldXNlZCB0byByZWR1Y2UgdGhlIG51bWJlciBvZiBsb2FkU2NoZW1hKCkgY2FsbHMgcGVyIHJlcXVlc3RcbiAgLy8gT25jZSBzZXQgdGhlIHNjaGVtYURhdGEgc2hvdWxkIGJlIGltbXV0YWJsZVxuICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IG51bGw7XG4gIHRoaXMucGVuZGluZ09wcyA9IHtcbiAgICBvcGVyYXRpb25zOiBudWxsLFxuICAgIGlkZW50aWZpZXI6IG51bGwsXG4gIH07XG59XG5cbi8vIEEgY29udmVuaWVudCBtZXRob2QgdG8gcGVyZm9ybSBhbGwgdGhlIHN0ZXBzIG9mIHByb2Nlc3NpbmcgdGhlXG4vLyB3cml0ZSwgaW4gb3JkZXIuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSB7cmVzcG9uc2UsIHN0YXR1cywgbG9jYXRpb259IG9iamVjdC5cbi8vIHN0YXR1cyBhbmQgbG9jYXRpb24gYXJlIG9wdGlvbmFsLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRVc2VyQW5kUm9sZUFDTCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbnN0YWxsYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVNlc3Npb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNoZWNrUmVzdHJpY3RlZEZpZWxkcygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQmVmb3JlU2F2ZVRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmVuc3VyZVVuaXF1ZUF1dGhEYXRhSWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYSgpO1xuICAgIH0pXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgICByZXR1cm4gdGhpcy5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Vc2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuRGF0YWJhc2VPcGVyYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQWZ0ZXJTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY2xlYW5Vc2VyQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIEFwcGVuZCB0aGUgYXV0aERhdGFSZXNwb25zZSBpZiBleGlzdHNcbiAgICAgIGlmICh0aGlzLmF1dGhEYXRhUmVzcG9uc2UpIHtcbiAgICAgICAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UuYXV0aERhdGFSZXNwb25zZSA9IHRoaXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHRoaXMuc3RvcmFnZS5yZWplY3RTaWdudXAgJiYgdGhpcy5jb25maWcucHJldmVudFNpZ251cFdpdGhVbnZlcmlmaWVkRW1haWwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLicpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlckFuZFJvbGVBQ0wgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gWycqJ107XG5cbiAgaWYgKHRoaXMuYXV0aC51c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC5nZXRVc2VyUm9sZXMoKS50aGVuKHJvbGVzID0+IHtcbiAgICAgIHRoaXMucnVuT3B0aW9ucy5hY2wgPSB0aGlzLnJ1bk9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW3RoaXMuYXV0aC51c2VyLmlkXSk7XG4gICAgICByZXR1cm47XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIGNvbmZpZy5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICdUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzICcgKyAnbm9uLWV4aXN0ZW50IGNsYXNzOiAnICsgdGhpcy5jbGFzc05hbWVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBzY2hlbWEuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlU2NoZW1hID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudmFsaWRhdGVPYmplY3QoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdGhpcy5kYXRhLFxuICAgIHRoaXMucXVlcnksXG4gICAgdGhpcy5ydW5PcHRpb25zLFxuICAgIHRoaXMuYXV0aC5pc01haW50ZW5hbmNlXG4gICk7XG59O1xuXG4vLyBSdW5zIGFueSBiZWZvcmVTYXZlIHRyaWdnZXJzIGFnYWluc3QgdGhpcyBvcGVyYXRpb24uXG4vLyBBbnkgY2hhbmdlIGxlYWRzIHRvIG91ciBkYXRhIGJlaW5nIG11dGF0ZWQuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZVNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLnJ1bk9wdGlvbnMubWFueSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZVNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyh0aGlzLmNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSwgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZClcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QgeyBvcmlnaW5hbE9iamVjdCwgdXBkYXRlZE9iamVjdCB9ID0gdGhpcy5idWlsZFBhcnNlT2JqZWN0cygpO1xuICBjb25zdCBpZGVudGlmaWVyID0gdXBkYXRlZE9iamVjdC5fZ2V0U3RhdGVJZGVudGlmaWVyKCk7XG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyhpZGVudGlmaWVyKTtcbiAgdGhpcy5wZW5kaW5nT3BzID0ge1xuICAgIG9wZXJhdGlvbnM6IHsgLi4ucGVuZGluZyB9LFxuICAgIGlkZW50aWZpZXIsXG4gIH07XG5cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gQmVmb3JlIGNhbGxpbmcgdGhlIHRyaWdnZXIsIHZhbGlkYXRlIHRoZSBwZXJtaXNzaW9ucyBmb3IgdGhlIHNhdmUgb3BlcmF0aW9uXG4gICAgICBsZXQgZGF0YWJhc2VQcm9taXNlID0gbnVsbDtcbiAgICAgIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIGZvciB1cGRhdGluZ1xuICAgICAgICBkYXRhYmFzZVByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIHRydWUsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIGNyZWF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLmNyZWF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIEluIHRoZSBjYXNlIHRoYXQgdGhlcmUgaXMgbm8gcGVybWlzc2lvbiBmb3IgdGhlIG9wZXJhdGlvbiwgaXQgdGhyb3dzIGFuIGVycm9yXG4gICAgICByZXR1cm4gZGF0YWJhc2VQcm9taXNlLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0Lmxlbmd0aCA8PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgICAgIHRoaXMuYXV0aCxcbiAgICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgICB0aGlzLmNvbnRleHRcbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gXy5yZWR1Y2UoXG4gICAgICAgICAgcmVzcG9uc2Uub2JqZWN0LFxuICAgICAgICAgIChyZXN1bHQsIHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgICAgIGlmICghXy5pc0VxdWFsKHRoaXMuZGF0YVtrZXldLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBbXVxuICAgICAgICApO1xuICAgICAgICB0aGlzLmRhdGEgPSByZXNwb25zZS5vYmplY3Q7XG4gICAgICAgIC8vIFdlIHNob3VsZCBkZWxldGUgdGhlIG9iamVjdElkIGZvciBhbiB1cGRhdGUgd3JpdGVcbiAgICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRyeSB7XG4gICAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKHRoaXMuY29uZmlnLCB0aGlzLmRhdGEpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlTG9naW5UcmlnZ2VyID0gYXN5bmMgZnVuY3Rpb24gKHVzZXJEYXRhKSB7XG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZUxvZ2luJyB0cmlnZ2VyXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyh0aGlzLmNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWQpXG4gICkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIENsb3VkIGNvZGUgZ2V0cyBhIGJpdCBvZiBleHRyYSBkYXRhIGZvciBpdHMgb2JqZWN0c1xuICBjb25zdCBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUgfTtcblxuICAvLyBFeHBhbmQgZmlsZSBvYmplY3RzXG4gIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCB1c2VyRGF0YSk7XG5cbiAgY29uc3QgdXNlciA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB1c2VyRGF0YSk7XG5cbiAgLy8gbm8gbmVlZCB0byByZXR1cm4gYSByZXNwb25zZVxuICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgdGhpcy5hdXRoLFxuICAgIHVzZXIsXG4gICAgbnVsbCxcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmNvbnRleHRcbiAgKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuc2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuZGF0YSkge1xuICAgIHJldHVybiB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlci5nZXRBbGxDbGFzc2VzKCkudGhlbihhbGxDbGFzc2VzID0+IHtcbiAgICAgIGNvbnN0IHNjaGVtYSA9IGFsbENsYXNzZXMuZmluZChvbmVDbGFzcyA9PiBvbmVDbGFzcy5jbGFzc05hbWUgPT09IHRoaXMuY2xhc3NOYW1lKTtcbiAgICAgIGNvbnN0IHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCA9IChmaWVsZE5hbWUsIHNldERlZmF1bHQpID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gbnVsbCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnJyB8fFxuICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzZXREZWZhdWx0ICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IG51bGwgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAgICAgKHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiYgdGhpcy5kYXRhW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlO1xuICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciB8fCBbXTtcbiAgICAgICAgICAgIGlmICh0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5pbmRleE9mKGZpZWxkTmFtZSkgPCAwKSB7XG4gICAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0ucmVxdWlyZWQgPT09IHRydWUpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBgJHtmaWVsZE5hbWV9IGlzIHJlcXVpcmVkYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICAvLyBBZGQgZGVmYXVsdCBmaWVsZHNcbiAgICAgIHRoaXMuZGF0YS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG5cbiAgICAgICAgLy8gT25seSBhc3NpZ24gbmV3IG9iamVjdElkIGlmIHdlIGFyZSBjcmVhdGluZyBuZXcgb2JqZWN0XG4gICAgICAgIGlmICghdGhpcy5kYXRhLm9iamVjdElkKSB7XG4gICAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkID0gY3J5cHRvVXRpbHMubmV3T2JqZWN0SWQodGhpcy5jb25maWcub2JqZWN0SWRTaXplKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkKGZpZWxkTmFtZSwgdHJ1ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoc2NoZW1hKSB7XG4gICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGF0YSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuLy8gVHJhbnNmb3JtcyBhdXRoIGRhdGEgZm9yIGEgdXNlciBvYmplY3QuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhIHVzZXIgb2JqZWN0LlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZUF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBhdXRoRGF0YSA9IHRoaXMuZGF0YS5hdXRoRGF0YTtcbiAgY29uc3QgaGFzVXNlcm5hbWVBbmRQYXNzd29yZCA9XG4gICAgdHlwZW9mIHRoaXMuZGF0YS51c2VybmFtZSA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIHRoaXMuZGF0YS5wYXNzd29yZCA9PT0gJ3N0cmluZyc7XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICFhdXRoRGF0YSkge1xuICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLnVzZXJuYW1lICE9PSAnc3RyaW5nJyB8fCBfLmlzRW1wdHkodGhpcy5kYXRhLnVzZXJuYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICdiYWQgb3IgbWlzc2luZyB1c2VybmFtZScpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHRoaXMuZGF0YS5wYXNzd29yZCAhPT0gJ3N0cmluZycgfHwgXy5pc0VtcHR5KHRoaXMuZGF0YS5wYXNzd29yZCkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG4gIH1cblxuICBpZiAoXG4gICAgKGF1dGhEYXRhICYmICFPYmplY3Qua2V5cyhhdXRoRGF0YSkubGVuZ3RoKSB8fFxuICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKVxuICApIHtcbiAgICAvLyBOb3RoaW5nIHRvIHZhbGlkYXRlIGhlcmVcbiAgICByZXR1cm47XG4gIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuZGF0YSwgJ2F1dGhEYXRhJykgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIC8vIEhhbmRsZSBzYXZpbmcgYXV0aERhdGEgdG8gbnVsbFxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICk7XG4gIH1cblxuICB2YXIgcHJvdmlkZXJzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpO1xuICBpZiAocHJvdmlkZXJzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBjYW5IYW5kbGVBdXRoRGF0YSA9IHByb3ZpZGVycy5zb21lKHByb3ZpZGVyID0+IHtcbiAgICAgIHZhciBwcm92aWRlckF1dGhEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgdmFyIGhhc1Rva2VuID0gcHJvdmlkZXJBdXRoRGF0YSAmJiBwcm92aWRlckF1dGhEYXRhLmlkO1xuICAgICAgcmV0dXJuIGhhc1Rva2VuIHx8IHByb3ZpZGVyQXV0aERhdGEgPT09IG51bGw7XG4gICAgfSk7XG4gICAgaWYgKGNhbkhhbmRsZUF1dGhEYXRhIHx8IGhhc1VzZXJuYW1lQW5kUGFzc3dvcmQgfHwgdGhpcy5hdXRoLmlzTWFzdGVyIHx8IHRoaXMuZ2V0VXNlcklkKCkpIHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhKGF1dGhEYXRhKTtcbiAgICB9XG4gIH1cbiAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZmlsdGVyZWRPYmplY3RzQnlBQ0wgPSBmdW5jdGlvbiAob2JqZWN0cykge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyIHx8IHRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuIG9iamVjdHM7XG4gIH1cbiAgcmV0dXJuIG9iamVjdHMuZmlsdGVyKG9iamVjdCA9PiB7XG4gICAgaWYgKCFvYmplY3QuQUNMKSB7XG4gICAgICByZXR1cm4gdHJ1ZTsgLy8gbGVnYWN5IHVzZXJzIHRoYXQgaGF2ZSBubyBBQ0wgZmllbGQgb24gdGhlbVxuICAgIH1cbiAgICAvLyBSZWd1bGFyIHVzZXJzIHRoYXQgaGF2ZSBiZWVuIGxvY2tlZCBvdXQuXG4gICAgcmV0dXJuIG9iamVjdC5BQ0wgJiYgT2JqZWN0LmtleXMob2JqZWN0LkFDTCkubGVuZ3RoID4gMDtcbiAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmdldFVzZXJJZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHJldHVybiB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICB9IGVsc2UgaWYgKHRoaXMuYXV0aCAmJiB0aGlzLmF1dGgudXNlciAmJiB0aGlzLmF1dGgudXNlci5pZCkge1xuICAgIHJldHVybiB0aGlzLmF1dGgudXNlci5pZDtcbiAgfVxufTtcblxuLy8gRGV2ZWxvcGVycyBhcmUgYWxsb3dlZCB0byBjaGFuZ2UgYXV0aERhdGEgdmlhIGJlZm9yZSBzYXZlIHRyaWdnZXJcbi8vIHdlIG5lZWQgYWZ0ZXIgYmVmb3JlIHNhdmUgdG8gZW5zdXJlIHRoYXQgdGhlIGRldmVsb3BlclxuLy8gaXMgbm90IGN1cnJlbnRseSBkdXBsaWNhdGluZyBhdXRoIGRhdGEgSURcblJlc3RXcml0ZS5wcm90b3R5cGUuZW5zdXJlVW5pcXVlQXV0aERhdGFJZCA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8ICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBoYXNBdXRoRGF0YUlkID0gT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5zb21lKFxuICAgIGtleSA9PiB0aGlzLmRhdGEuYXV0aERhdGFba2V5XSAmJiB0aGlzLmRhdGEuYXV0aERhdGFba2V5XS5pZFxuICApO1xuXG4gIGlmICghaGFzQXV0aERhdGFJZCkgcmV0dXJuO1xuXG4gIGNvbnN0IHIgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YSh0aGlzLmNvbmZpZywgdGhpcy5kYXRhLmF1dGhEYXRhKTtcbiAgY29uc3QgcmVzdWx0cyA9IHRoaXMuZmlsdGVyZWRPYmplY3RzQnlBQ0wocik7XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxuICAvLyB1c2UgZGF0YS5vYmplY3RJZCBpbiBjYXNlIG9mIGxvZ2luIHRpbWUgYW5kIGZvdW5kIHVzZXIgZHVyaW5nIGhhbmRsZSB2YWxpZGF0ZUF1dGhEYXRhXG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMuZ2V0VXNlcklkKCkgfHwgdGhpcy5kYXRhLm9iamVjdElkO1xuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEgJiYgdXNlcklkICE9PSByZXN1bHRzWzBdLm9iamVjdElkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlQXV0aERhdGEgPSBhc3luYyBmdW5jdGlvbiAoYXV0aERhdGEpIHtcbiAgY29uc3QgciA9IGF3YWl0IEF1dGguZmluZFVzZXJzV2l0aEF1dGhEYXRhKHRoaXMuY29uZmlnLCBhdXRoRGF0YSk7XG4gIGNvbnN0IHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuXG4gIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAvLyBUbyBhdm9pZCBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9zZWN1cml0eS9hZHZpc29yaWVzL0dIU0EtOHczai1nOTgzLThqaDVcbiAgICAvLyBMZXQncyBydW4gc29tZSB2YWxpZGF0aW9uIGJlZm9yZSB0aHJvd2luZ1xuICAgIGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKGF1dGhEYXRhLCB0aGlzLCByZXN1bHRzWzBdKTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxuXG4gIC8vIE5vIHVzZXIgZm91bmQgd2l0aCBwcm92aWRlZCBhdXRoRGF0YSB3ZSBuZWVkIHRvIHZhbGlkYXRlXG4gIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICBjb25zdCB7IGF1dGhEYXRhOiB2YWxpZGF0ZWRBdXRoRGF0YSwgYXV0aERhdGFSZXNwb25zZSB9ID0gYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHRoaXNcbiAgICApO1xuICAgIHRoaXMuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgLy8gUmVwbGFjZSBjdXJyZW50IGF1dGhEYXRhIGJ5IHRoZSBuZXcgdmFsaWRhdGVkIG9uZVxuICAgIHRoaXMuZGF0YS5hdXRoRGF0YSA9IHZhbGlkYXRlZEF1dGhEYXRhO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFVzZXIgZm91bmQgd2l0aCBwcm92aWRlZCBhdXRoRGF0YVxuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEpIHtcbiAgICBjb25zdCB1c2VySWQgPSB0aGlzLmdldFVzZXJJZCgpO1xuICAgIGNvbnN0IHVzZXJSZXN1bHQgPSByZXN1bHRzWzBdO1xuICAgIC8vIFByZXZlbnQgZHVwbGljYXRlIGF1dGhEYXRhIGlkXG4gICAgaWYgKHVzZXJJZCAmJiB1c2VySWQgIT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICAgIH1cblxuICAgIHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuam9pbignLCcpO1xuXG4gICAgY29uc3QgeyBoYXNNdXRhdGVkQXV0aERhdGEsIG11dGF0ZWRBdXRoRGF0YSB9ID0gQXV0aC5oYXNNdXRhdGVkQXV0aERhdGEoXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHVzZXJSZXN1bHQuYXV0aERhdGFcbiAgICApO1xuXG4gICAgY29uc3QgaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyID1cbiAgICAgICh0aGlzLmF1dGggJiYgdGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5hdXRoLnVzZXIuaWQgPT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHx8XG4gICAgICB0aGlzLmF1dGguaXNNYXN0ZXI7XG5cbiAgICBjb25zdCBpc0xvZ2luID0gIXVzZXJJZDtcblxuICAgIGlmIChpc0xvZ2luIHx8IGlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3Rlcikge1xuICAgICAgLy8gbm8gdXNlciBtYWtpbmcgdGhlIGNhbGxcbiAgICAgIC8vIE9SIHRoZSB1c2VyIG1ha2luZyB0aGUgY2FsbCBpcyB0aGUgcmlnaHQgb25lXG4gICAgICAvLyBMb2dpbiB3aXRoIGF1dGggZGF0YVxuICAgICAgZGVsZXRlIHJlc3VsdHNbMF0ucGFzc3dvcmQ7XG5cbiAgICAgIC8vIG5lZWQgdG8gc2V0IHRoZSBvYmplY3RJZCBmaXJzdCBvdGhlcndpc2UgbG9jYXRpb24gaGFzIHRyYWlsaW5nIHVuZGVmaW5lZFxuICAgICAgdGhpcy5kYXRhLm9iamVjdElkID0gdXNlclJlc3VsdC5vYmplY3RJZDtcblxuICAgICAgaWYgKCF0aGlzLnF1ZXJ5IHx8ICF0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgcmVzcG9uc2U6IHVzZXJSZXN1bHQsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gUnVuIGJlZm9yZUxvZ2luIGhvb2sgYmVmb3JlIHN0b3JpbmcgYW55IHVwZGF0ZXNcbiAgICAgICAgLy8gdG8gYXV0aERhdGEgb24gdGhlIGRiOyBjaGFuZ2VzIHRvIHVzZXJSZXN1bHRcbiAgICAgICAgLy8gd2lsbCBiZSBpZ25vcmVkLlxuICAgICAgICBhd2FpdCB0aGlzLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlcihkZWVwY29weSh1c2VyUmVzdWx0KSk7XG5cbiAgICAgICAgLy8gSWYgd2UgYXJlIGluIGxvZ2luIG9wZXJhdGlvbiB2aWEgYXV0aERhdGFcbiAgICAgICAgLy8gd2UgbmVlZCB0byBiZSBzdXJlIHRoYXQgdGhlIHVzZXIgaGFzIHByb3ZpZGVkXG4gICAgICAgIC8vIHJlcXVpcmVkIGF1dGhEYXRhXG4gICAgICAgIEF1dGguY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbihcbiAgICAgICAgICB7IGNvbmZpZzogdGhpcy5jb25maWcsIGF1dGg6IHRoaXMuYXV0aCB9LFxuICAgICAgICAgIGF1dGhEYXRhLFxuICAgICAgICAgIHVzZXJSZXN1bHQuYXV0aERhdGEsXG4gICAgICAgICAgdGhpcy5jb25maWdcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgLy8gUHJldmVudCB2YWxpZGF0aW5nIGlmIG5vIG11dGF0ZWQgZGF0YSBkZXRlY3RlZCBvbiB1cGRhdGVcbiAgICAgIGlmICghaGFzTXV0YXRlZEF1dGhEYXRhICYmIGlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3Rlcikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIEZvcmNlIHRvIHZhbGlkYXRlIGFsbCBwcm92aWRlZCBhdXRoRGF0YSBvbiBsb2dpblxuICAgICAgLy8gb24gdXBkYXRlIG9ubHkgdmFsaWRhdGUgbXV0YXRlZCBvbmVzXG4gICAgICBpZiAoaGFzTXV0YXRlZEF1dGhEYXRhIHx8ICF0aGlzLmNvbmZpZy5hbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKFxuICAgICAgICAgIGlzTG9naW4gPyBhdXRoRGF0YSA6IG11dGF0ZWRBdXRoRGF0YSxcbiAgICAgICAgICB0aGlzLFxuICAgICAgICAgIHVzZXJSZXN1bHRcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kYXRhLmF1dGhEYXRhID0gcmVzLmF1dGhEYXRhO1xuICAgICAgICB0aGlzLmF1dGhEYXRhUmVzcG9uc2UgPSByZXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgIH1cblxuICAgICAgLy8gSUYgd2UgYXJlIGluIGxvZ2luIHdlJ2xsIHNraXAgdGhlIGRhdGFiYXNlIG9wZXJhdGlvbiAvIGJlZm9yZVNhdmUgLyBhZnRlclNhdmUgZXRjLi4uXG4gICAgICAvLyB3ZSBuZWVkIHRvIHNldCBpdCB1cCB0aGVyZS5cbiAgICAgIC8vIFdlIGFyZSBzdXBwb3NlZCB0byBoYXZlIGEgcmVzcG9uc2Ugb25seSBvbiBMT0dJTiB3aXRoIGF1dGhEYXRhLCBzbyB3ZSBza2lwIHRob3NlXG4gICAgICAvLyBJZiB3ZSdyZSBub3QgbG9nZ2luZyBpbiwgYnV0IGp1c3QgdXBkYXRpbmcgdGhlIGN1cnJlbnQgdXNlciwgd2UgY2FuIHNhZmVseSBza2lwIHRoYXQgcGFydFxuICAgICAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICAgICAgLy8gQXNzaWduIHRoZSBuZXcgYXV0aERhdGEgaW4gdGhlIHJlc3BvbnNlXG4gICAgICAgIE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVtwcm92aWRlcl0gPSBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBSdW4gdGhlIERCIHVwZGF0ZSBkaXJlY3RseSwgYXMgJ21hc3Rlcicgb25seSBpZiBhdXRoRGF0YSBjb250YWlucyBzb21lIGtleXNcbiAgICAgICAgLy8gYXV0aERhdGEgY291bGQgbm90IGNvbnRhaW5zIGtleXMgYWZ0ZXIgdmFsaWRhdGlvbiBpZiB0aGUgYXV0aEFkYXB0ZXJcbiAgICAgICAgLy8gdXNlcyB0aGUgYGRvTm90U2F2ZWAgb3B0aW9uLiBKdXN0IHVwZGF0ZSB0aGUgYXV0aERhdGEgcGFydFxuICAgICAgICAvLyBUaGVuIHdlJ3JlIGdvb2QgZm9yIHRoZSB1c2VyLCBlYXJseSBleGl0IG9mIHNvcnRzXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5kYXRhLm9iamVjdElkIH0sXG4gICAgICAgICAgICB7IGF1dGhEYXRhOiB0aGlzLmRhdGEuYXV0aERhdGEgfSxcbiAgICAgICAgICAgIHt9XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jaGVja1Jlc3RyaWN0ZWRGaWVsZHMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiAnZW1haWxWZXJpZmllZCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgZXJyb3IgPSBgQ2xpZW50cyBhcmVuJ3QgYWxsb3dlZCB0byBtYW51YWxseSB1cGRhdGUgZW1haWwgdmVyaWZpY2F0aW9uLmA7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sIGVycm9yKTtcbiAgfVxufTtcblxuLy8gVGhlIG5vbi10aGlyZC1wYXJ0eSBwYXJ0cyBvZiBVc2VyIHRyYW5zZm9ybWF0aW9uXG5SZXN0V3JpdGUucHJvdG90eXBlLnRyYW5zZm9ybVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gRG8gbm90IGNsZWFudXAgc2Vzc2lvbiBpZiBvYmplY3RJZCBpcyBub3Qgc2V0XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMub2JqZWN0SWQoKSkge1xuICAgIC8vIElmIHdlJ3JlIHVwZGF0aW5nIGEgX1VzZXIgb2JqZWN0LCB3ZSBuZWVkIHRvIGNsZWFyIG91dCB0aGUgY2FjaGUgZm9yIHRoYXQgdXNlci4gRmluZCBhbGwgdGhlaXJcbiAgICAvLyBzZXNzaW9uIHRva2VucywgYW5kIHJlbW92ZSB0aGVtIGZyb20gdGhlIGNhY2hlLlxuICAgIHByb21pc2UgPSBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksICdfU2Vzc2lvbicsIHtcbiAgICAgIHVzZXI6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgIH0sXG4gICAgfSlcbiAgICAgIC5leGVjdXRlKClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLnJlc3VsdHMuZm9yRWFjaChzZXNzaW9uID0+XG4gICAgICAgICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb24uc2Vzc2lvblRva2VuKVxuICAgICAgICApO1xuICAgICAgfSk7XG4gIH1cblxuICByZXR1cm4gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIFRyYW5zZm9ybSB0aGUgcGFzc3dvcmRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBpZ25vcmUgb25seSBpZiB1bmRlZmluZWQuIHNob3VsZCBwcm9jZWVkIGlmIGVtcHR5ICgnJylcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5xdWVyeSkge1xuICAgICAgICB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXSA9IHRydWU7XG4gICAgICAgIC8vIEdlbmVyYXRlIGEgbmV3IHNlc3Npb24gb25seSBpZiB0aGUgdXNlciByZXF1ZXN0ZWRcbiAgICAgICAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgICAgICAgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3koKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmhhc2godGhpcy5kYXRhLnBhc3N3b3JkKS50aGVuKGhhc2hlZFBhc3N3b3JkID0+IHtcbiAgICAgICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCA9IGhhc2hlZFBhc3N3b3JkO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVVc2VyTmFtZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlRW1haWwoKTtcbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlVXNlck5hbWUgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENoZWNrIGZvciB1c2VybmFtZSB1bmlxdWVuZXNzXG4gIGlmICghdGhpcy5kYXRhLnVzZXJuYW1lKSB7XG4gICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICB0aGlzLmRhdGEudXNlcm5hbWUgPSBjcnlwdG9VdGlscy5yYW5kb21TdHJpbmcoMjUpO1xuICAgICAgdGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvKlxuICAgIFVzZXJuYW1lcyBzaG91bGQgYmUgdW5pcXVlIHdoZW4gY29tcGFyZWQgY2FzZSBpbnNlbnNpdGl2ZWx5XG5cbiAgICBVc2VycyBzaG91bGQgYmUgYWJsZSB0byBtYWtlIGNhc2Ugc2Vuc2l0aXZlIHVzZXJuYW1lcyBhbmRcbiAgICBsb2dpbiB1c2luZyB0aGUgY2FzZSB0aGV5IGVudGVyZWQuICBJLmUuICdTbm9vcHknIHNob3VsZCBwcmVjbHVkZVxuICAgICdzbm9vcHknIGFzIGEgdmFsaWQgdXNlcm5hbWUuXG4gICovXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB7XG4gICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICB9LFxuICAgICAgeyBsaW1pdDogMSwgY2FzZUluc2Vuc2l0aXZlOiB0cnVlIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH0pO1xufTtcblxuLypcbiAgQXMgd2l0aCB1c2VybmFtZXMsIFBhcnNlIHNob3VsZCBub3QgYWxsb3cgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb25zIG9mIGVtYWlsLlxuICB1bmxpa2Ugd2l0aCB1c2VybmFtZXMgKHdoaWNoIGNhbiBoYXZlIGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9ucyBpbiB0aGUgY2FzZSBvZlxuICBhdXRoIGFkYXB0ZXJzKSwgZW1haWxzIHNob3VsZCBuZXZlciBoYXZlIGEgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb24uXG5cbiAgVGhpcyBiZWhhdmlvciBjYW4gYmUgZW5mb3JjZWQgdGhyb3VnaCBhIHByb3Blcmx5IGNvbmZpZ3VyZWQgaW5kZXggc2VlOlxuICBodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL2NvcmUvaW5kZXgtY2FzZS1pbnNlbnNpdGl2ZS8jY3JlYXRlLWEtY2FzZS1pbnNlbnNpdGl2ZS1pbmRleFxuICB3aGljaCBjb3VsZCBiZSBpbXBsZW1lbnRlZCBpbnN0ZWFkIG9mIHRoaXMgY29kZSBiYXNlZCB2YWxpZGF0aW9uLlxuXG4gIEdpdmVuIHRoYXQgdGhpcyBsb29rdXAgc2hvdWxkIGJlIGEgcmVsYXRpdmVseSBsb3cgdXNlIGNhc2UgYW5kIHRoYXQgdGhlIGNhc2Ugc2Vuc2l0aXZlXG4gIHVuaXF1ZSBpbmRleCB3aWxsIGJlIHVzZWQgYnkgdGhlIGRiIGZvciB0aGUgcXVlcnksIHRoaXMgaXMgYW4gYWRlcXVhdGUgc29sdXRpb24uXG4qL1xuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVFbWFpbCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwgfHwgdGhpcy5kYXRhLmVtYWlsLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFZhbGlkYXRlIGJhc2ljIGVtYWlsIGFkZHJlc3MgZm9ybWF0XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsLm1hdGNoKC9eLitALiskLykpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLCAnRW1haWwgYWRkcmVzcyBmb3JtYXQgaXMgaW52YWxpZC4nKVxuICAgICk7XG4gIH1cbiAgLy8gQ2FzZSBpbnNlbnNpdGl2ZSBtYXRjaCwgc2VlIG5vdGUgYWJvdmUgZnVuY3Rpb24uXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB7XG4gICAgICAgIGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsXG4gICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICB9LFxuICAgICAgeyBsaW1pdDogMSwgY2FzZUluc2Vuc2l0aXZlOiB0cnVlIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgICF0aGlzLmRhdGEuYXV0aERhdGEgfHxcbiAgICAgICAgIU9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoIHx8XG4gICAgICAgIChPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCA9PT0gMSAmJlxuICAgICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSlbMF0gPT09ICdhbm9ueW1vdXMnKVxuICAgICAgKSB7XG4gICAgICAgIC8vIFdlIHVwZGF0ZWQgdGhlIGVtYWlsLCBzZW5kIGEgbmV3IHZhbGlkYXRpb25cbiAgICAgICAgY29uc3QgeyBvcmlnaW5hbE9iamVjdCwgdXBkYXRlZE9iamVjdCB9ID0gdGhpcy5idWlsZFBhcnNlT2JqZWN0cygpO1xuICAgICAgICBjb25zdCByZXF1ZXN0ID0ge1xuICAgICAgICAgIG9yaWdpbmFsOiBvcmlnaW5hbE9iamVjdCxcbiAgICAgICAgICBvYmplY3Q6IHVwZGF0ZWRPYmplY3QsXG4gICAgICAgICAgbWFzdGVyOiB0aGlzLmF1dGguaXNNYXN0ZXIsXG4gICAgICAgICAgaXA6IHRoaXMuY29uZmlnLmlwLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2V0RW1haWxWZXJpZnlUb2tlbih0aGlzLmRhdGEsIHJlcXVlc3QsIHRoaXMuc3RvcmFnZSk7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5KSByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzKCkudGhlbigoKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5KCk7XG4gIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gY2hlY2sgaWYgdGhlIHBhc3N3b3JkIGNvbmZvcm1zIHRvIHRoZSBkZWZpbmVkIHBhc3N3b3JkIHBvbGljeSBpZiBjb25maWd1cmVkXG4gIC8vIElmIHdlIHNwZWNpZmllZCBhIGN1c3RvbSBlcnJvciBpbiBvdXIgY29uZmlndXJhdGlvbiB1c2UgaXQuXG4gIC8vIEV4YW1wbGU6IFwiUGFzc3dvcmRzIG11c3QgaW5jbHVkZSBhIENhcGl0YWwgTGV0dGVyLCBMb3dlcmNhc2UgTGV0dGVyLCBhbmQgYSBudW1iZXIuXCJcbiAgLy9cbiAgLy8gVGhpcyBpcyBlc3BlY2lhbGx5IHVzZWZ1bCBvbiB0aGUgZ2VuZXJpYyBcInBhc3N3b3JkIHJlc2V0XCIgcGFnZSxcbiAgLy8gYXMgaXQgYWxsb3dzIHRoZSBwcm9ncmFtbWVyIHRvIGNvbW11bmljYXRlIHNwZWNpZmljIHJlcXVpcmVtZW50cyBpbnN0ZWFkIG9mOlxuICAvLyBhLiBtYWtpbmcgdGhlIHVzZXIgZ3Vlc3Mgd2hhdHMgd3JvbmdcbiAgLy8gYi4gbWFraW5nIGEgY3VzdG9tIHBhc3N3b3JkIHJlc2V0IHBhZ2UgdGhhdCBzaG93cyB0aGUgcmVxdWlyZW1lbnRzXG4gIGNvbnN0IHBvbGljeUVycm9yID0gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgPyB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0aW9uRXJyb3JcbiAgICA6ICdQYXNzd29yZCBkb2VzIG5vdCBtZWV0IHRoZSBQYXNzd29yZCBQb2xpY3kgcmVxdWlyZW1lbnRzLic7XG4gIGNvbnN0IGNvbnRhaW5zVXNlcm5hbWVFcnJvciA9ICdQYXNzd29yZCBjYW5ub3QgY29udGFpbiB5b3VyIHVzZXJuYW1lLic7XG5cbiAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgbWVldHMgdGhlIHBhc3N3b3JkIHN0cmVuZ3RoIHJlcXVpcmVtZW50c1xuICBpZiAoXG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IgJiZcbiAgICAgICF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yKHRoaXMuZGF0YS5wYXNzd29yZCkpIHx8XG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sodGhpcy5kYXRhLnBhc3N3b3JkKSlcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBwb2xpY3lFcnJvcikpO1xuICB9XG5cbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBjb250YWluIHVzZXJuYW1lXG4gIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgPT09IHRydWUpIHtcbiAgICBpZiAodGhpcy5kYXRhLnVzZXJuYW1lKSB7XG4gICAgICAvLyB1c2VybmFtZSBpcyBub3QgcGFzc2VkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHRoaXMuZGF0YS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBjb250YWluc1VzZXJuYW1lRXJyb3IpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcmV0cmlldmUgdGhlIFVzZXIgb2JqZWN0IHVzaW5nIG9iamVjdElkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZihyZXN1bHRzWzBdLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBjb250YWluc1VzZXJuYW1lRXJyb3IpXG4gICAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5ID0gZnVuY3Rpb24gKCkge1xuICAvLyBjaGVjayB3aGV0aGVyIHBhc3N3b3JkIGlzIHJlcGVhdGluZyBmcm9tIHNwZWNpZmllZCBoaXN0b3J5XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmZpbmQoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICB7IGtleXM6IFsnX3Bhc3N3b3JkX2hpc3RvcnknLCAnX2hhc2hlZF9wYXNzd29yZCddIH0sXG4gICAgICAgIEF1dGgubWFpbnRlbmFuY2UodGhpcy5jb25maWcpXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgaWYgKHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnkpXG4gICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDFcbiAgICAgICAgICApO1xuICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgY29uc3QgbmV3UGFzc3dvcmQgPSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIC8vIGNvbXBhcmUgdGhlIG5ldyBwYXNzd29yZCBoYXNoIHdpdGggYWxsIG9sZCBwYXNzd29yZCBoYXNoZXNcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBvbGRQYXNzd29yZHMubWFwKGZ1bmN0aW9uIChoYXNoKSB7XG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUobmV3UGFzc3dvcmQsIGhhc2gpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpXG4gICAgICAgICAgICAgIC8vIHJlamVjdCBpZiB0aGVyZSBpcyBhIG1hdGNoXG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCgnUkVQRUFUX1BBU1NXT1JEJyk7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB3YWl0IGZvciBhbGwgY29tcGFyaXNvbnMgdG8gY29tcGxldGVcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyciA9PT0gJ1JFUEVBVF9QQVNTV09SRCcpXG4gICAgICAgICAgICAgIC8vIGEgbWF0Y2ggd2FzIGZvdW5kXG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICAgICAgYE5ldyBwYXNzd29yZCBzaG91bGQgbm90IGJlIHRoZSBzYW1lIGFzIGxhc3QgJHt0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3Rvcnl9IHBhc3N3b3Jkcy5gXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERvbid0IGdlbmVyYXRlIHNlc3Npb24gZm9yIHVwZGF0aW5nIHVzZXIgKHRoaXMucXVlcnkgaXMgc2V0KSB1bmxlc3MgYXV0aERhdGEgZXhpc3RzXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgbmV3IHNlc3Npb25Ub2tlbiBpZiBsaW5raW5nIHZpYSBzZXNzaW9uVG9rZW5cbiAgaWYgKHRoaXMuYXV0aC51c2VyICYmIHRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoXG4gICAgIXRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgJiYgLy8gc2lnbnVwIGNhbGwsIHdpdGhcbiAgICB0aGlzLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsID09PSB0cnVlICYmIC8vIG5vIGxvZ2luIHdpdGhvdXQgdmVyaWZpY2F0aW9uXG4gICAgdGhpcy5jb25maWcudmVyaWZ5VXNlckVtYWlsc1xuICApIHtcbiAgICAvLyB2ZXJpZmljYXRpb24gaXMgb25cbiAgICB0aGlzLnN0b3JhZ2UucmVqZWN0U2lnbnVwID0gdHJ1ZTtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyICYmIHRoaXMuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMpIHtcbiAgICBsZXQgc2hvdWxkUHJldmVudFVudmVyaWZlZExvZ2luID0gdGhpcy5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbDtcbiAgICBpZiAodHlwZW9mIHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgICAgIG9yaWdpbmFsOiBvcmlnaW5hbE9iamVjdCxcbiAgICAgICAgb2JqZWN0OiB1cGRhdGVkT2JqZWN0LFxuICAgICAgICBtYXN0ZXI6IHRoaXMuYXV0aC5pc01hc3RlcixcbiAgICAgICAgaXA6IHRoaXMuY29uZmlnLmlwLFxuICAgICAgfTtcbiAgICAgIHNob3VsZFByZXZlbnRVbnZlcmlmZWRMb2dpbiA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgdGhpcy5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbChyZXF1ZXN0KVxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHNob3VsZFByZXZlbnRVbnZlcmlmZWRMb2dpbiA9PT0gdHJ1ZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY3JlYXRlU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvLyBjbG91ZCBpbnN0YWxsYXRpb25JZCBmcm9tIENsb3VkIENvZGUsXG4gIC8vIG5ldmVyIGNyZWF0ZSBzZXNzaW9uIHRva2VucyBmcm9tIHRoZXJlLlxuICBpZiAodGhpcy5hdXRoLmluc3RhbGxhdGlvbklkICYmIHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCA9PT0gJ2Nsb3VkJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID09IG51bGwgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkuam9pbignLCcpO1xuICB9XG5cbiAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICB1c2VySWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgYWN0aW9uOiB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID8gJ2xvZ2luJyA6ICdzaWdudXAnLFxuICAgICAgYXV0aFByb3ZpZGVyOiB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyIHx8ICdwYXNzd29yZCcsXG4gICAgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkLFxuICB9KTtcblxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG4gIH1cblxuICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpO1xufTtcblxuUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24gPSBmdW5jdGlvbiAoXG4gIGNvbmZpZyxcbiAgeyB1c2VySWQsIGNyZWF0ZWRXaXRoLCBpbnN0YWxsYXRpb25JZCwgYWRkaXRpb25hbFNlc3Npb25EYXRhIH1cbikge1xuICBjb25zdCB0b2tlbiA9ICdyOicgKyBjcnlwdG9VdGlscy5uZXdUb2tlbigpO1xuICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gIGNvbnN0IHNlc3Npb25EYXRhID0ge1xuICAgIHNlc3Npb25Ub2tlbjogdG9rZW4sXG4gICAgdXNlcjoge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgIH0sXG4gICAgY3JlYXRlZFdpdGgsXG4gICAgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCksXG4gIH07XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgc2Vzc2lvbkRhdGEuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIE9iamVjdC5hc3NpZ24oc2Vzc2lvbkRhdGEsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSk7XG5cbiAgcmV0dXJuIHtcbiAgICBzZXNzaW9uRGF0YSxcbiAgICBjcmVhdGVTZXNzaW9uOiAoKSA9PlxuICAgICAgbmV3IFJlc3RXcml0ZShjb25maWcsIEF1dGgubWFzdGVyKGNvbmZpZyksICdfU2Vzc2lvbicsIG51bGwsIHNlc3Npb25EYXRhKS5leGVjdXRlKCksXG4gIH07XG59O1xuXG4vLyBEZWxldGUgZW1haWwgcmVzZXQgdG9rZW5zIGlmIHVzZXIgaXMgY2hhbmdpbmcgcGFzc3dvcmQgb3IgZW1haWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgdGhpcy5xdWVyeSA9PT0gbnVsbCkge1xuICAgIC8vIG51bGwgcXVlcnkgbWVhbnMgY3JlYXRlXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCdwYXNzd29yZCcgaW4gdGhpcy5kYXRhIHx8ICdlbWFpbCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgYWRkT3BzID0ge1xuICAgICAgX3BlcmlzaGFibGVfdG9rZW46IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICAgIF9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ6IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICB9O1xuICAgIHRoaXMuZGF0YSA9IE9iamVjdC5hc3NpZ24odGhpcy5kYXRhLCBhZGRPcHMpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIE9ubHkgZm9yIF9TZXNzaW9uLCBhbmQgYXQgY3JlYXRpb24gdGltZVxuICBpZiAodGhpcy5jbGFzc05hbWUgIT0gJ19TZXNzaW9uJyB8fCB0aGlzLnF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERlc3Ryb3kgdGhlIHNlc3Npb25zIGluICdCYWNrZ3JvdW5kJ1xuICBjb25zdCB7IHVzZXIsIGluc3RhbGxhdGlvbklkLCBzZXNzaW9uVG9rZW4gfSA9IHRoaXMuZGF0YTtcbiAgaWYgKCF1c2VyIHx8ICFpbnN0YWxsYXRpb25JZCkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIXVzZXIub2JqZWN0SWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveShcbiAgICAnX1Nlc3Npb24nLFxuICAgIHtcbiAgICAgIHVzZXIsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHNlc3Npb25Ub2tlbjogeyAkbmU6IHNlc3Npb25Ub2tlbiB9LFxuICAgIH0sXG4gICAge30sXG4gICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgKTtcbn07XG5cbi8vIEhhbmRsZXMgYW55IGZvbGxvd3VwIGxvZ2ljXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUZvbGxvd3VwID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddICYmIHRoaXMuY29uZmlnLnJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQpIHtcbiAgICB2YXIgc2Vzc2lvblF1ZXJ5ID0ge1xuICAgICAgdXNlcjoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXTtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5kZXN0cm95KCdfU2Vzc2lvbicsIHNlc3Npb25RdWVyeSlcbiAgICAgIC50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKS50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXTtcbiAgICAvLyBGaXJlIGFuZCBmb3JnZXQhXG4gICAgdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHRoaXMuZGF0YSwgeyBhdXRoOiB0aGlzLmF1dGggfSk7XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX1Nlc3Npb24gY2xhc3Mgc3BlY2lhbG5lc3MuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhbiBfU2Vzc2lvbiBvYmplY3QuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZVNlc3Npb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX1Nlc3Npb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGgudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdTZXNzaW9uIHRva2VuIHJlcXVpcmVkLicpO1xuICB9XG5cbiAgLy8gVE9ETzogVmVyaWZ5IHByb3BlciBlcnJvciB0byB0aHJvd1xuICBpZiAodGhpcy5kYXRhLkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnQ2Fubm90IHNldCAnICsgJ0FDTCBvbiBhIFNlc3Npb24uJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmIHRoaXMuZGF0YS51c2VyLm9iamVjdElkICE9IHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9XG4gICAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgIHRoaXMucXVlcnkgPSB7XG4gICAgICAgICRhbmQ6IFtcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVzZXI6IHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICBjb25zdCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5kYXRhKSB7XG4gICAgICBpZiAoa2V5ID09PSAnb2JqZWN0SWQnIHx8IGtleSA9PT0gJ3VzZXInKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhW2tleV0gPSB0aGlzLmRhdGFba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZScsXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNyZWF0ZVNlc3Npb24oKS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKCFyZXN1bHRzLnJlc3BvbnNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdFcnJvciBjcmVhdGluZyBzZXNzaW9uLicpO1xuICAgICAgfVxuICAgICAgc2Vzc2lvbkRhdGFbJ29iamVjdElkJ10gPSByZXN1bHRzLnJlc3BvbnNlWydvYmplY3RJZCddO1xuICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgIGxvY2F0aW9uOiByZXN1bHRzLmxvY2F0aW9uLFxuICAgICAgICByZXNwb25zZTogc2Vzc2lvbkRhdGEsXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfSW5zdGFsbGF0aW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gaW5zdGFsbGF0aW9uIG9iamVjdC5cbi8vIElmIGFuIGluc3RhbGxhdGlvbiBpcyBmb3VuZCwgdGhpcyBjYW4gbXV0YXRlIHRoaXMucXVlcnkgYW5kIHR1cm4gYSBjcmVhdGVcbi8vIGludG8gYW4gdXBkYXRlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVJbnN0YWxsYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX0luc3RhbGxhdGlvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoXG4gICAgIXRoaXMucXVlcnkgJiZcbiAgICAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICF0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWRcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgMTM1LFxuICAgICAgJ2F0IGxlYXN0IG9uZSBJRCBmaWVsZCAoZGV2aWNlVG9rZW4sIGluc3RhbGxhdGlvbklkKSAnICsgJ211c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJ1xuICAgICk7XG4gIH1cblxuICAvLyBJZiB0aGUgZGV2aWNlIHRva2VuIGlzIDY0IGNoYXJhY3RlcnMgbG9uZywgd2UgYXNzdW1lIGl0IGlzIGZvciBpT1NcbiAgLy8gYW5kIGxvd2VyY2FzZSBpdC5cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4ubGVuZ3RoID09IDY0KSB7XG4gICAgdGhpcy5kYXRhLmRldmljZVRva2VuID0gdGhpcy5kYXRhLmRldmljZVRva2VuLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBXZSBsb3dlcmNhc2UgdGhlIGluc3RhbGxhdGlvbklkIGlmIHByZXNlbnRcbiAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgbGV0IGluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkO1xuXG4gIC8vIElmIGRhdGEuaW5zdGFsbGF0aW9uSWQgaXMgbm90IHNldCBhbmQgd2UncmUgbm90IG1hc3Rlciwgd2UgY2FuIGxvb2t1cCBpbiBhdXRoXG4gIGlmICghaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICBpbnN0YWxsYXRpb25JZCA9IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIGluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIC8vIFVwZGF0aW5nIF9JbnN0YWxsYXRpb24gYnV0IG5vdCB1cGRhdGluZyBhbnl0aGluZyBjcml0aWNhbFxuICBpZiAodGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmICFpbnN0YWxsYXRpb25JZCAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gIHZhciBpZE1hdGNoOyAvLyBXaWxsIGJlIGEgbWF0Y2ggb24gZWl0aGVyIG9iamVjdElkIG9yIGluc3RhbGxhdGlvbklkXG4gIHZhciBvYmplY3RJZE1hdGNoO1xuICB2YXIgaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgdmFyIGRldmljZVRva2VuTWF0Y2hlcyA9IFtdO1xuXG4gIC8vIEluc3RlYWQgb2YgaXNzdWluZyAzIHJlYWRzLCBsZXQncyBkbyBpdCB3aXRoIG9uZSBPUi5cbiAgY29uc3Qgb3JRdWVyaWVzID0gW107XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBvYmplY3RJZDogdGhpcy5xdWVyeS5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG4gIH1cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgIG9yUXVlcmllcy5wdXNoKHsgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbiB9KTtcbiAgfVxuXG4gIGlmIChvclF1ZXJpZXMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcm9taXNlID0gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgICAnX0luc3RhbGxhdGlvbicsXG4gICAgICAgIHtcbiAgICAgICAgICAkb3I6IG9yUXVlcmllcyxcbiAgICAgICAgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIHJlc3VsdC5vYmplY3RJZCA9PSB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgb2JqZWN0SWRNYXRjaCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVzdWx0Lmluc3RhbGxhdGlvbklkID09IGluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgaW5zdGFsbGF0aW9uSWRNYXRjaCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVzdWx0LmRldmljZVRva2VuID09IHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgICAgICAgIGRldmljZVRva2VuTWF0Y2hlcy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBTYW5pdHkgY2hlY2tzIHdoZW4gcnVubmluZyBhIHF1ZXJ5XG4gICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIGlmICghb2JqZWN0SWRNYXRjaCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZCBmb3IgdXBkYXRlLicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICBvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICE9PSBvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdpbnN0YWxsYXRpb25JZCBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICBvYmplY3RJZE1hdGNoLmRldmljZVRva2VuICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVRva2VuICE9PSBvYmplY3RJZE1hdGNoLmRldmljZVRva2VuICYmXG4gICAgICAgICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgICFvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUb2tlbiBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVHlwZVxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCAnZGV2aWNlVHlwZSBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgb2JqZWN0SWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gb2JqZWN0SWRNYXRjaDtcbiAgICAgIH1cblxuICAgICAgaWYgKGluc3RhbGxhdGlvbklkICYmIGluc3RhbGxhdGlvbklkTWF0Y2gpIHtcbiAgICAgICAgaWRNYXRjaCA9IGluc3RhbGxhdGlvbklkTWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBuZWVkIHRvIHNwZWNpZnkgZGV2aWNlVHlwZSBvbmx5IGlmIGl0J3MgbmV3XG4gICAgICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5kZXZpY2VUeXBlICYmICFpZE1hdGNoKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzUsICdkZXZpY2VUeXBlIG11c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJyk7XG4gICAgICB9XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICBpZiAoIWlkTWF0Y2gpIHtcbiAgICAgICAgaWYgKCFkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJlxuICAgICAgICAgICghZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydpbnN0YWxsYXRpb25JZCddIHx8ICFpbnN0YWxsYXRpb25JZClcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gU2luZ2xlIG1hdGNoIG9uIGRldmljZSB0b2tlbiBidXQgbm9uZSBvbiBpbnN0YWxsYXRpb25JZCwgYW5kIGVpdGhlclxuICAgICAgICAgIC8vIHRoZSBwYXNzZWQgb2JqZWN0IG9yIHRoZSBtYXRjaCBpcyBtaXNzaW5nIGFuIGluc3RhbGxhdGlvbklkLCBzbyB3ZVxuICAgICAgICAgIC8vIGNhbiBqdXN0IHJldHVybiB0aGUgbWF0Y2guXG4gICAgICAgICAgcmV0dXJuIGRldmljZVRva2VuTWF0Y2hlc1swXVsnb2JqZWN0SWQnXTtcbiAgICAgICAgfSBlbHNlIGlmICghdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgMTMyLFxuICAgICAgICAgICAgJ011c3Qgc3BlY2lmeSBpbnN0YWxsYXRpb25JZCB3aGVuIGRldmljZVRva2VuICcgK1xuICAgICAgICAgICAgICAnbWF0Y2hlcyBtdWx0aXBsZSBJbnN0YWxsYXRpb24gb2JqZWN0cydcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE11bHRpcGxlIGRldmljZSB0b2tlbiBtYXRjaGVzIGFuZCB3ZSBzcGVjaWZpZWQgYW4gaW5zdGFsbGF0aW9uIElELFxuICAgICAgICAgIC8vIG9yIGEgc2luZ2xlIG1hdGNoIHdoZXJlIGJvdGggdGhlIHBhc3NlZCBhbmQgbWF0Y2hpbmcgb2JqZWN0cyBoYXZlXG4gICAgICAgICAgLy8gYW4gaW5zdGFsbGF0aW9uIElELiBUcnkgY2xlYW5pbmcgb3V0IG9sZCBpbnN0YWxsYXRpb25zIHRoYXQgbWF0Y2hcbiAgICAgICAgICAvLyB0aGUgZGV2aWNlVG9rZW4sIGFuZCByZXR1cm4gbmlsIHRvIHNpZ25hbCB0aGF0IGEgbmV3IG9iamVjdCBzaG91bGRcbiAgICAgICAgICAvLyBiZSBjcmVhdGVkLlxuICAgICAgICAgIHZhciBkZWxRdWVyeSA9IHtcbiAgICAgICAgICAgIGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4sXG4gICAgICAgICAgICBpbnN0YWxsYXRpb25JZDoge1xuICAgICAgICAgICAgICAkbmU6IGluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEuYXBwSWRlbnRpZmllcikge1xuICAgICAgICAgICAgZGVsUXVlcnlbJ2FwcElkZW50aWZpZXInXSA9IHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoID09IDEgJiYgIWRldmljZVRva2VuTWF0Y2hlc1swXVsnaW5zdGFsbGF0aW9uSWQnXSkge1xuICAgICAgICAgIC8vIEV4YWN0bHkgb25lIGRldmljZSB0b2tlbiBtYXRjaCBhbmQgaXQgZG9lc24ndCBoYXZlIGFuIGluc3RhbGxhdGlvblxuICAgICAgICAgIC8vIElELiBUaGlzIGlzIHRoZSBvbmUgY2FzZSB3aGVyZSB3ZSB3YW50IHRvIG1lcmdlIHdpdGggdGhlIGV4aXN0aW5nXG4gICAgICAgICAgLy8gb2JqZWN0LlxuICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0geyBvYmplY3RJZDogaWRNYXRjaC5vYmplY3RJZCB9O1xuICAgICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgICAgLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGRldmljZVRva2VuTWF0Y2hlc1swXVsnb2JqZWN0SWQnXTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZFxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuICYmIGlkTWF0Y2guZGV2aWNlVG9rZW4gIT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgICAvLyBXZSdyZSBzZXR0aW5nIHRoZSBkZXZpY2UgdG9rZW4gb24gYW4gZXhpc3RpbmcgaW5zdGFsbGF0aW9uLCBzb1xuICAgICAgICAgICAgLy8gd2Ugc2hvdWxkIHRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaCB0aGlzXG4gICAgICAgICAgICAvLyBkZXZpY2UgdG9rZW4uXG4gICAgICAgICAgICBjb25zdCBkZWxRdWVyeSA9IHtcbiAgICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAvLyBXZSBoYXZlIGEgdW5pcXVlIGluc3RhbGwgSWQsIHVzZSB0aGF0IHRvIHByZXNlcnZlXG4gICAgICAgICAgICAvLyB0aGUgaW50ZXJlc3RpbmcgaW5zdGFsbGF0aW9uXG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydpbnN0YWxsYXRpb25JZCddID0ge1xuICAgICAgICAgICAgICAgICRuZTogdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICAgaWRNYXRjaC5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgaWRNYXRjaC5vYmplY3RJZCA9PSB0aGlzLmRhdGEub2JqZWN0SWRcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAvLyB3ZSBwYXNzZWQgYW4gb2JqZWN0SWQsIHByZXNlcnZlIHRoYXQgaW5zdGFsYXRpb25cbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ29iamVjdElkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiBpZE1hdGNoLm9iamVjdElkLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gV2hhdCB0byBkbyBoZXJlPyBjYW4ndCByZWFsbHkgY2xlYW4gdXAgZXZlcnl0aGluZy4uLlxuICAgICAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuYXBwSWRlbnRpZmllcikge1xuICAgICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWQuXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJbiBub24tbWVyZ2Ugc2NlbmFyaW9zLCBqdXN0IHJldHVybiB0aGUgaW5zdGFsbGF0aW9uIG1hdGNoIGlkXG4gICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKG9iaklkID0+IHtcbiAgICAgIGlmIChvYmpJZCkge1xuICAgICAgICB0aGlzLnF1ZXJ5ID0geyBvYmplY3RJZDogb2JqSWQgfTtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG4gICAgICB9XG4gICAgICAvLyBUT0RPOiBWYWxpZGF0ZSBvcHMgKGFkZC9yZW1vdmUgb24gY2hhbm5lbHMsICRpbmMgb24gYmFkZ2UsIGV0Yy4pXG4gICAgfSk7XG4gIHJldHVybiBwcm9taXNlO1xufTtcblxuLy8gSWYgd2Ugc2hvcnQtY2lyY3VpdGVkIHRoZSBvYmplY3QgcmVzcG9uc2UgLSB0aGVuIHdlIG5lZWQgdG8gbWFrZSBzdXJlIHdlIGV4cGFuZCBhbGwgdGhlIGZpbGVzLFxuLy8gc2luY2UgdGhpcyBtaWdodCBub3QgaGF2ZSBhIHF1ZXJ5LCBtZWFuaW5nIGl0IHdvbid0IHJldHVybiB0aGUgZnVsbCByZXN1bHQgYmFjay5cbi8vIFRPRE86IChubHV0c2Vua28pIFRoaXMgc2hvdWxkIGRpZSB3aGVuIHdlIG1vdmUgdG8gcGVyLWNsYXNzIGJhc2VkIGNvbnRyb2xsZXJzIG9uIF9TZXNzaW9uL19Vc2VyXG5SZXN0V3JpdGUucHJvdG90eXBlLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzID0gZnVuY3Rpb24gKCkge1xuICAvLyBDaGVjayB3aGV0aGVyIHdlIGhhdmUgYSBzaG9ydC1jaXJjdWl0ZWQgcmVzcG9uc2UgLSBvbmx5IHRoZW4gcnVuIGV4cGFuc2lvbi5cbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5EYXRhYmFzZU9wZXJhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUm9sZScpIHtcbiAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIucm9sZS5jbGVhcigpO1xuICAgIGlmICh0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyKSB7XG4gICAgICB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLmNsZWFyQ2FjaGVkUm9sZXModGhpcy5hdXRoLnVzZXIpO1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiB0aGlzLnF1ZXJ5ICYmIHRoaXMuYXV0aC5pc1VuYXV0aGVudGljYXRlZCgpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuU0VTU0lPTl9NSVNTSU5HLFxuICAgICAgYENhbm5vdCBtb2RpZnkgdXNlciAke3RoaXMucXVlcnkub2JqZWN0SWR9LmBcbiAgICApO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1Byb2R1Y3QnICYmIHRoaXMuZGF0YS5kb3dubG9hZCkge1xuICAgIHRoaXMuZGF0YS5kb3dubG9hZE5hbWUgPSB0aGlzLmRhdGEuZG93bmxvYWQubmFtZTtcbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBiZXR0ZXIgZGV0ZWN0aW9uIGZvciBBQ0wsIGVuc3VyaW5nIGEgdXNlciBjYW4ndCBiZSBsb2NrZWQgZnJvbVxuICAvLyAgICAgICB0aGVpciBvd24gdXNlciByZWNvcmQuXG4gIGlmICh0aGlzLmRhdGEuQUNMICYmIHRoaXMuZGF0YS5BQ0xbJyp1bnJlc29sdmVkJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9BQ0wsICdJbnZhbGlkIEFDTC4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgLy8gRm9yY2UgdGhlIHVzZXIgdG8gbm90IGxvY2tvdXRcbiAgICAvLyBNYXRjaGVkIHdpdGggcGFyc2UuY29tXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5BQ0wgJiZcbiAgICAgIHRoaXMuYXV0aC5pc01hc3RlciAhPT0gdHJ1ZSAmJlxuICAgICAgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgIT09IHRydWVcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5BQ0xbdGhpcy5xdWVyeS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgfVxuICAgIC8vIHVwZGF0ZSBwYXNzd29yZCB0aW1lc3RhbXAgaWYgdXNlciBwYXNzd29yZCBpcyBiZWluZyBjaGFuZ2VkXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgfVxuICAgIC8vIElnbm9yZSBjcmVhdGVkQXQgd2hlbiB1cGRhdGVcbiAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgIGxldCBkZWZlciA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIC8vIGlmIHBhc3N3b3JkIGhpc3RvcnkgaXMgZW5hYmxlZCB0aGVuIHNhdmUgdGhlIGN1cnJlbnQgcGFzc3dvcmQgdG8gaGlzdG9yeVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICkge1xuICAgICAgZGVmZXIgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfSxcbiAgICAgICAgICBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKVxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vbi0xIHBhc3N3b3JkcyBnbyBpbnRvIGhpc3RvcnkgaW5jbHVkaW5nIGxhc3QgcGFzc3dvcmRcbiAgICAgICAgICB3aGlsZSAoXG4gICAgICAgICAgICBvbGRQYXNzd29yZHMubGVuZ3RoID4gTWF0aC5tYXgoMCwgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IC0gMilcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3Jkcy5zaGlmdCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2hpc3RvcnkgPSBvbGRQYXNzd29yZHM7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBkZWZlci50aGVuKCgpID0+IHtcbiAgICAgIC8vIFJ1biBhbiB1cGRhdGVcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAudXBkYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICByZXNwb25zZS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgICB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKHJlc3BvbnNlLCB0aGlzLmRhdGEpO1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3BvbnNlIH07XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIC8vIFNldCB0aGUgZGVmYXVsdCBBQ0wgYW5kIHBhc3N3b3JkIHRpbWVzdGFtcCBmb3IgdGhlIG5ldyBfVXNlclxuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgdmFyIEFDTCA9IHRoaXMuZGF0YS5BQ0w7XG4gICAgICAvLyBkZWZhdWx0IHB1YmxpYyByL3cgQUNMXG4gICAgICBpZiAoIUFDTCkge1xuICAgICAgICBBQ0wgPSB7fTtcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5lbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgICAgICAgQUNMWycqJ10gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBtYWtlIHN1cmUgdGhlIHVzZXIgaXMgbm90IGxvY2tlZCBkb3duXG4gICAgICBBQ0xbdGhpcy5kYXRhLm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICAgIHRoaXMuZGF0YS5BQ0wgPSBBQ0w7XG4gICAgICAvLyBwYXNzd29yZCB0aW1lc3RhbXAgdG8gYmUgdXNlZCB3aGVuIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3kgaXMgZW5mb3JjZWRcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJ1biBhIGNyZWF0ZVxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmNyZWF0ZSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5kYXRhLCB0aGlzLnJ1bk9wdGlvbnMsIGZhbHNlLCB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlcilcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCBlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFF1aWNrIGNoZWNrLCBpZiB3ZSB3ZXJlIGFibGUgdG8gaW5mZXIgdGhlIGR1cGxpY2F0ZWQgZmllbGQgbmFtZVxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ3VzZXJuYW1lJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ2VtYWlsJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoaXMgd2FzIGEgZmFpbGVkIHVzZXIgY3JlYXRpb24gZHVlIHRvIHVzZXJuYW1lIG9yIGVtYWlsIGFscmVhZHkgdGFrZW4sIHdlIG5lZWQgdG9cbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciBpdCB3YXMgdXNlcm5hbWUgb3IgZW1haWwgYW5kIHJldHVybiB0aGUgYXBwcm9wcmlhdGUgZXJyb3IuXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICAgICAgLy8gVE9ETzogU2VlIGlmIHdlIGNhbiBsYXRlciBkbyB0aGlzIHdpdGhvdXQgYWRkaXRpb25hbCBxdWVyaWVzIGJ5IHVzaW5nIG5hbWVkIGluZGV4ZXMuXG4gICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgIC5maW5kKFxuICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0gfSxcbiAgICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5vYmplY3RJZCA9IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgcmVzcG9uc2UuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgICAgICBpZiAodGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSkge1xuICAgICAgICAgIHJlc3BvbnNlLnVzZXJuYW1lID0gdGhpcy5kYXRhLnVzZXJuYW1lO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIG5vdGhpbmcgLSBkb2Vzbid0IHdhaXQgZm9yIHRoZSB0cmlnZ2VyLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5BZnRlclNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UgfHwgIXRoaXMucmVzcG9uc2UucmVzcG9uc2UgfHwgdGhpcy5ydW5PcHRpb25zLm1hbnkpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlclNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyU2F2ZUhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGNvbnN0IGhhc0xpdmVRdWVyeSA9IHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuaGFzTGl2ZVF1ZXJ5KHRoaXMuY2xhc3NOYW1lKTtcbiAgaWYgKCFoYXNBZnRlclNhdmVIb29rICYmICFoYXNMaXZlUXVlcnkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIHVwZGF0ZWRPYmplY3QuX2hhbmRsZVNhdmVSZXNwb25zZSh0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLCB0aGlzLnJlc3BvbnNlLnN0YXR1cyB8fCAyMDApO1xuXG4gIGlmIChoYXNMaXZlUXVlcnkpIHtcbiAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIC8vIE5vdGlmeSBMaXZlUXVlcnlTZXJ2ZXIgaWYgcG9zc2libGVcbiAgICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hQ29udHJvbGxlci5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnModXBkYXRlZE9iamVjdC5jbGFzc05hbWUpO1xuICAgICAgdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5vbkFmdGVyU2F2ZShcbiAgICAgICAgdXBkYXRlZE9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgICBwZXJtc1xuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuICBpZiAoIWhhc0FmdGVyU2F2ZUhvb2spIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gUnVuIGFmdGVyU2F2ZSB0cmlnZ2VyXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1blRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIHRoaXMuY29udGV4dFxuICAgIClcbiAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgY29uc3QganNvblJldHVybmVkID0gcmVzdWx0ICYmICFyZXN1bHQuX3RvRnVsbEpTT047XG4gICAgICBpZiAoanNvblJldHVybmVkKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ09wcy5vcGVyYXRpb25zID0ge307XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSByZXN1bHQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlID0gdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShcbiAgICAgICAgICAocmVzdWx0IHx8IHVwZGF0ZWRPYmplY3QpLnRvSlNPTigpLFxuICAgICAgICAgIHRoaXMuZGF0YVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pXG4gICAgLmNhdGNoKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIGxvZ2dlci53YXJuKCdhZnRlclNhdmUgY2F1Z2h0IGFuIGVycm9yJywgZXJyKTtcbiAgICB9KTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGZpZ3VyZSBvdXQgd2hhdCBsb2NhdGlvbiB0aGlzIG9wZXJhdGlvbiBoYXBwZW5zIGF0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5sb2NhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG1pZGRsZSA9IHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInID8gJy91c2Vycy8nIDogJy9jbGFzc2VzLycgKyB0aGlzLmNsYXNzTmFtZSArICcvJztcbiAgY29uc3QgbW91bnQgPSB0aGlzLmNvbmZpZy5tb3VudCB8fCB0aGlzLmNvbmZpZy5zZXJ2ZXJVUkw7XG4gIHJldHVybiBtb3VudCArIG1pZGRsZSArIHRoaXMuZGF0YS5vYmplY3RJZDtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCB0aGUgb2JqZWN0IGlkIGZvciB0aGlzIG9wZXJhdGlvbi5cbi8vIEJlY2F1c2UgaXQgY291bGQgYmUgZWl0aGVyIG9uIHRoZSBxdWVyeSBvciBvbiB0aGUgZGF0YVxuUmVzdFdyaXRlLnByb3RvdHlwZS5vYmplY3RJZCA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuZGF0YS5vYmplY3RJZCB8fCB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xufTtcblxuLy8gUmV0dXJucyBhIGNvcHkgb2YgdGhlIGRhdGEgYW5kIGRlbGV0ZSBiYWQga2V5cyAoX2F1dGhfZGF0YSwgX2hhc2hlZF9wYXNzd29yZC4uLilcblJlc3RXcml0ZS5wcm90b3R5cGUuc2FuaXRpemVkRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZGF0YSA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKChkYXRhLCBrZXkpID0+IHtcbiAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgaWYgKCEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuICByZXR1cm4gUGFyc2UuX2RlY29kZSh1bmRlZmluZWQsIGRhdGEpO1xufTtcblxuLy8gUmV0dXJucyBhbiB1cGRhdGVkIGNvcHkgb2YgdGhlIG9iamVjdFxuUmVzdFdyaXRlLnByb3RvdHlwZS5idWlsZFBhcnNlT2JqZWN0cyA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lLCBvYmplY3RJZDogdGhpcy5xdWVyeT8ub2JqZWN0SWQgfTtcbiAgbGV0IG9yaWdpbmFsT2JqZWN0O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgY29uc3QgY2xhc3NOYW1lID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKGV4dHJhRGF0YSk7XG4gIGNvbnN0IHJlYWRPbmx5QXR0cmlidXRlcyA9IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXNcbiAgICA/IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXMoKVxuICAgIDogW107XG4gIGlmICghdGhpcy5vcmlnaW5hbERhdGEpIHtcbiAgICBmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiByZWFkT25seUF0dHJpYnV0ZXMpIHtcbiAgICAgIGV4dHJhRGF0YVthdHRyaWJ1dGVdID0gdGhpcy5kYXRhW2F0dHJpYnV0ZV07XG4gICAgfVxuICB9XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZShmdW5jdGlvbiAoZGF0YSwga2V5KSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGFba2V5XS5fX29wID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXJlYWRPbmx5QXR0cmlidXRlcy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQoa2V5LCBkYXRhW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBzdWJkb2N1bWVudCBrZXkgd2l0aCBkb3Qgbm90YXRpb24geyAneC55JzogdiB9ID0+IHsgJ3gnOiB7ICd5JyA6IHYgfSB9KVxuICAgICAgICBjb25zdCBzcGxpdHRlZEtleSA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBwYXJlbnRQcm9wID0gc3BsaXR0ZWRLZXlbMF07XG4gICAgICAgIGxldCBwYXJlbnRWYWwgPSB1cGRhdGVkT2JqZWN0LmdldChwYXJlbnRQcm9wKTtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXJlbnRWYWwgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGFyZW50VmFsID0ge307XG4gICAgICAgIH1cbiAgICAgICAgcGFyZW50VmFsW3NwbGl0dGVkS2V5WzFdXSA9IGRhdGFba2V5XTtcbiAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQocGFyZW50UHJvcCwgcGFyZW50VmFsKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcblxuICBjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLnNhbml0aXplZERhdGEoKTtcbiAgZm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgcmVhZE9ubHlBdHRyaWJ1dGVzKSB7XG4gICAgZGVsZXRlIHNhbml0aXplZFthdHRyaWJ1dGVdO1xuICB9XG4gIHVwZGF0ZWRPYmplY3Quc2V0KHNhbml0aXplZCk7XG4gIHJldHVybiB7IHVwZGF0ZWRPYmplY3QsIG9yaWdpbmFsT2JqZWN0IH07XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNsZWFuVXNlckF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3QgdXNlciA9IHRoaXMucmVzcG9uc2UucmVzcG9uc2U7XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSA9IGZ1bmN0aW9uIChyZXNwb25zZSwgZGF0YSkge1xuICBjb25zdCBzdGF0ZUNvbnRyb2xsZXIgPSBQYXJzZS5Db3JlTWFuYWdlci5nZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIoKTtcbiAgY29uc3QgW3BlbmRpbmddID0gc3RhdGVDb250cm9sbGVyLmdldFBlbmRpbmdPcHModGhpcy5wZW5kaW5nT3BzLmlkZW50aWZpZXIpO1xuICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLnBlbmRpbmdPcHMub3BlcmF0aW9ucykge1xuICAgIGlmICghcGVuZGluZ1trZXldKSB7XG4gICAgICBkYXRhW2tleV0gPSB0aGlzLm9yaWdpbmFsRGF0YSA/IHRoaXMub3JpZ2luYWxEYXRhW2tleV0gOiB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IHNraXBLZXlzID0gWy4uLihyZXF1aXJlZENvbHVtbnMucmVhZFt0aGlzLmNsYXNzTmFtZV0gfHwgW10pXTtcbiAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgc2tpcEtleXMucHVzaCgnb2JqZWN0SWQnLCAnY3JlYXRlZEF0Jyk7XG4gIH0gZWxzZSB7XG4gICAgc2tpcEtleXMucHVzaCgndXBkYXRlZEF0Jyk7XG4gICAgZGVsZXRlIHJlc3BvbnNlLm9iamVjdElkO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHJlc3BvbnNlKSB7XG4gICAgaWYgKHNraXBLZXlzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCB2YWx1ZSA9IHJlc3BvbnNlW2tleV07XG4gICAgaWYgKFxuICAgICAgdmFsdWUgPT0gbnVsbCB8fFxuICAgICAgKHZhbHVlLl9fdHlwZSAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykgfHxcbiAgICAgIHV0aWwuaXNEZWVwU3RyaWN0RXF1YWwoZGF0YVtrZXldLCB2YWx1ZSkgfHxcbiAgICAgIHV0aWwuaXNEZWVwU3RyaWN0RXF1YWwoKHRoaXMub3JpZ2luYWxEYXRhIHx8IHt9KVtrZXldLCB2YWx1ZSlcbiAgICApIHtcbiAgICAgIGRlbGV0ZSByZXNwb25zZVtrZXldO1xuICAgIH1cbiAgfVxuICBpZiAoXy5pc0VtcHR5KHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyKSkge1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuICBjb25zdCBjbGllbnRTdXBwb3J0c0RlbGV0ZSA9IENsaWVudFNESy5zdXBwb3J0c0ZvcndhcmREZWxldGUodGhpcy5jbGllbnRTREspO1xuICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgY29uc3QgZGF0YVZhbHVlID0gZGF0YVtmaWVsZE5hbWVdO1xuXG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzcG9uc2UsIGZpZWxkTmFtZSkpIHtcbiAgICAgIHJlc3BvbnNlW2ZpZWxkTmFtZV0gPSBkYXRhVmFsdWU7XG4gICAgfVxuXG4gICAgLy8gU3RyaXBzIG9wZXJhdGlvbnMgZnJvbSByZXNwb25zZXNcbiAgICBpZiAocmVzcG9uc2VbZmllbGROYW1lXSAmJiByZXNwb25zZVtmaWVsZE5hbWVdLl9fb3ApIHtcbiAgICAgIGRlbGV0ZSByZXNwb25zZVtmaWVsZE5hbWVdO1xuICAgICAgaWYgKGNsaWVudFN1cHBvcnRzRGVsZXRlICYmIGRhdGFWYWx1ZS5fX29wID09ICdEZWxldGUnKSB7XG4gICAgICAgIHJlc3BvbnNlW2ZpZWxkTmFtZV0gPSBkYXRhVmFsdWU7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgUmVzdFdyaXRlO1xubW9kdWxlLmV4cG9ydHMgPSBSZXN0V3JpdGU7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQWVBO0FBQ0E7QUFDQTtBQUNBO0FBQWlFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQWxCakU7QUFDQTtBQUNBOztBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQWdDLENBQUM7QUFDaEUsSUFBSUMsUUFBUSxHQUFHRCxPQUFPLENBQUMsVUFBVSxDQUFDO0FBRWxDLE1BQU1FLElBQUksR0FBR0YsT0FBTyxDQUFDLFFBQVEsQ0FBQztBQUM5QixNQUFNRyxLQUFLLEdBQUdILE9BQU8sQ0FBQyxTQUFTLENBQUM7QUFDaEMsSUFBSUksV0FBVyxHQUFHSixPQUFPLENBQUMsZUFBZSxDQUFDO0FBQzFDLElBQUlLLGNBQWMsR0FBR0wsT0FBTyxDQUFDLFlBQVksQ0FBQztBQUMxQyxJQUFJTSxLQUFLLEdBQUdOLE9BQU8sQ0FBQyxZQUFZLENB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