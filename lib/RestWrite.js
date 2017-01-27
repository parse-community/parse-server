'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _RestQuery = require('./RestQuery');

var _RestQuery2 = _interopRequireDefault(_RestQuery);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".

var SchemaController = require('./Controllers/SchemaController');
var deepcopy = require('deepcopy');

var Auth = require('./Auth');
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
function RestWrite(config, auth, className, query, data, originalData, clientSDK, options) {
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.clientSDK = clientSDK;
  this.storage = {};
  this.runOptions = {};
  var allowObjectId = options && options.allowObjectId === true;
  if (!query && data.objectId && !allowObjectId) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'objectId is an invalid field name.');
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
}

// A convenient method to perform all the steps of processing the
// write, in order.
// Returns a promise for a {response, status, location} object.
// status and location are optional.
RestWrite.prototype.execute = function () {
  var _this = this;

  return Promise.resolve().then(function () {
    return _this.getUserAndRoleACL();
  }).then(function () {
    return _this.validateClientClassCreation();
  }).then(function () {
    return _this.handleInstallation();
  }).then(function () {
    return _this.handleSession();
  }).then(function () {
    return _this.validateAuthData();
  }).then(function () {
    return _this.runBeforeTrigger();
  }).then(function () {
    return _this.validateSchema();
  }).then(function () {
    return _this.setRequiredFieldsIfNeeded();
  }).then(function () {
    return _this.transformUser();
  }).then(function () {
    return _this.expandFilesForExistingObjects();
  }).then(function () {
    return _this.runDatabaseOperation();
  }).then(function () {
    return _this.createSessionTokenIfNeeded();
  }).then(function () {
    return _this.handleFollowup();
  }).then(function () {
    return _this.runAfterTrigger();
  }).then(function () {
    return _this.cleanUserAuthData();
  }).then(function () {
    return _this.response;
  });
};

// Uses the Auth object to get the list of roles, adds the user id
RestWrite.prototype.getUserAndRoleACL = function () {
  var _this2 = this;

  if (this.auth.isMaster) {
    return Promise.resolve();
  }

  this.runOptions.acl = ['*'];

  if (this.auth.user) {
    return this.auth.getUserRoles().then(function (roles) {
      roles.push(_this2.auth.user.id);
      _this2.runOptions.acl = _this2.runOptions.acl.concat(roles);
      return;
    });
  } else {
    return Promise.resolve();
  }
};

// Validates this operation against the allowClientClassCreation config.
RestWrite.prototype.validateClientClassCreation = function () {
  var _this3 = this;

  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(function (schemaController) {
      return schemaController.hasClass(_this3.className);
    }).then(function (hasClass) {
      if (hasClass !== true) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + _this3.className);
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
RestWrite.prototype.runBeforeTrigger = function () {
  var _this4 = this;

  if (this.response) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'beforeSave' trigger for this class.
  if (!triggers.triggerExists(this.className, triggers.Types.beforeSave, this.config.applicationId)) {
    return Promise.resolve();
  }

  // Cloud code gets a bit of extra data for its objects
  var extraData = { className: this.className };
  if (this.query && this.query.objectId) {
    extraData.objectId = this.query.objectId;
  }

  var originalObject = null;
  var updatedObject = triggers.inflate(extraData, this.originalData);
  if (this.query && this.query.objectId) {
    // This is an update for existing object.
    originalObject = triggers.inflate(extraData, this.originalData);
  }
  updatedObject.set(this.sanitizedData());

  return Promise.resolve().then(function () {
    return triggers.maybeRunTrigger(triggers.Types.beforeSave, _this4.auth, updatedObject, originalObject, _this4.config);
  }).then(function (response) {
    if (response && response.object) {
      _this4.storage.fieldsChangedByTrigger = _lodash2.default.reduce(response.object, function (result, value, key) {
        if (!_lodash2.default.isEqual(_this4.data[key], value)) {
          result.push(key);
        }
        return result;
      }, []);
      _this4.data = response.object;
      // We should delete the objectId for an update write
      if (_this4.query && _this4.query.objectId) {
        delete _this4.data.objectId;
      }
    }
  });
};

RestWrite.prototype.setRequiredFieldsIfNeeded = function () {
  if (this.data) {
    // Add default fields
    this.data.updatedAt = this.updatedAt;
    if (!this.query) {
      this.data.createdAt = this.updatedAt;

      // Only assign new objectId if we are creating new object
      if (!this.data.objectId) {
        this.data.objectId = cryptoUtils.newObjectId();
      }
    }
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

  if (!this.query && !this.data.authData) {
    if (typeof this.data.username !== 'string') {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'bad or missing username');
    }
    if (typeof this.data.password !== 'string') {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required');
    }
  }

  if (!this.data.authData || !Object.keys(this.data.authData).length) {
    return;
  }

  var authData = this.data.authData;
  var providers = Object.keys(authData);
  if (providers.length > 0) {
    var canHandleAuthData = providers.reduce(function (canHandle, provider) {
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
  var _this5 = this;

  var validations = Object.keys(authData).map(function (provider) {
    if (authData[provider] === null) {
      return Promise.resolve();
    }
    var validateAuthData = _this5.config.authDataManager.getValidatorForProvider(provider);
    if (!validateAuthData) {
      throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
    }
    return validateAuthData(authData[provider]);
  });
  return Promise.all(validations);
};

RestWrite.prototype.findUsersWithAuthData = function (authData) {
  var providers = Object.keys(authData);
  var query = providers.reduce(function (memo, provider) {
    if (!authData[provider]) {
      return memo;
    }
    var queryKey = 'authData.' + provider + '.id';
    var query = {};
    query[queryKey] = authData[provider].id;
    memo.push(query);
    return memo;
  }, []).filter(function (q) {
    return typeof q !== 'undefined';
  });

  var findPromise = Promise.resolve([]);
  if (query.length > 0) {
    findPromise = this.config.database.find(this.className, { '$or': query }, {});
  }

  return findPromise;
};

RestWrite.prototype.handleAuthData = function (authData) {
  var _this6 = this;

  var results = void 0;
  return this.handleAuthDataValidation(authData).then(function () {
    return _this6.findUsersWithAuthData(authData);
  }).then(function (r) {
    results = r;
    if (results.length > 1) {
      // More than 1 user with the passed id's
      throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
    }

    _this6.storage['authProvider'] = Object.keys(authData).join(',');

    if (results.length > 0) {
      if (!_this6.query) {
        var _ret = function () {
          // Login with auth data
          delete results[0].password;
          var userResult = results[0];

          // need to set the objectId first otherwise location has trailing undefined
          _this6.data.objectId = userResult.objectId;

          // Determine if authData was updated
          var mutatedAuthData = {};
          Object.keys(authData).forEach(function (provider) {
            var providerData = authData[provider];
            var userAuthData = userResult.authData[provider];
            if (!_lodash2.default.isEqual(providerData, userAuthData)) {
              mutatedAuthData[provider] = providerData;
            }
          });

          _this6.response = {
            response: userResult,
            location: _this6.location()
          };

          // We have authData that is updated on login
          // that can happen when token are refreshed,
          // We should update the token and let the user in
          if (Object.keys(mutatedAuthData).length > 0) {
            // Assign the new authData in the response
            Object.keys(mutatedAuthData).forEach(function (provider) {
              _this6.response.response.authData[provider] = mutatedAuthData[provider];
            });
            // Run the DB update directly, as 'master'
            // Just update the authData part
            return {
              v: _this6.config.database.update(_this6.className, { objectId: _this6.data.objectId }, { authData: mutatedAuthData }, {})
            };
          }
          return {
            v: void 0
          };
        }();

        if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
      } else if (_this6.query && _this6.query.objectId) {
        // Trying to update auth data but users
        // are different
        if (results[0].objectId !== _this6.query.objectId) {
          throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
        }
      }
    }
    return;
  });
};

// The non-third-party parts of User transformation
RestWrite.prototype.transformUser = function () {
  var _this7 = this;

  var promise = Promise.resolve();

  if (this.className !== '_User') {
    return promise;
  }

  if (this.query) {
    // If we're updating a _User object, we need to clear out the cache for that user. Find all their
    // session tokens, and remove them from the cache.
    promise = new _RestQuery2.default(this.config, Auth.master(this.config), '_Session', {
      user: {
        __type: "Pointer",
        className: "_User",
        objectId: this.objectId()
      }
    }).execute().then(function (results) {
      results.results.forEach(function (session) {
        return _this7.config.cacheController.user.del(session.sessionToken);
      });
    });
  }

  return promise.then(function () {
    // Transform the password
    if (!_this7.data.password) {
      return Promise.resolve();
    }

    if (_this7.query && !_this7.auth.isMaster) {
      _this7.storage['clearSessions'] = true;
      _this7.storage['generateNewSession'] = true;
    }

    return _this7._validatePasswordPolicy().then(function () {
      return passwordCrypto.hash(_this7.data.password).then(function (hashedPassword) {
        _this7.data._hashed_password = hashedPassword;
        delete _this7.data.password;
      });
    });
  }).then(function () {
    return _this7._validateUserName();
  }).then(function () {
    return _this7._validateEmail();
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
  // We need to a find to check for duplicate username in case they are missing the unique index on usernames
  // TODO: Check if there is a unique index, and if so, skip this query.
  return this.config.database.find(this.className, { username: this.data.username, objectId: { '$ne': this.objectId() } }, { limit: 1 }).then(function (results) {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
    }
    return;
  });
};

RestWrite.prototype._validateEmail = function () {
  var _this8 = this;

  if (!this.data.email || this.data.email.__op === 'Delete') {
    return Promise.resolve();
  }
  // Validate basic email address format
  if (!this.data.email.match(/^.+@.+$/)) {
    return Promise.reject(new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.'));
  }
  // Same problem for email as above for username
  return this.config.database.find(this.className, { email: this.data.email, objectId: { '$ne': this.objectId() } }, { limit: 1 }).then(function (results) {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
    }
    // We updated the email, send a new validation
    _this8.storage['sendVerificationEmail'] = true;
    _this8.config.userController.setEmailVerifyToken(_this8.data);
  });
};

RestWrite.prototype._validatePasswordPolicy = function () {
  var _this9 = this;

  if (!this.config.passwordPolicy) return Promise.resolve();
  return this._validatePasswordRequirements().then(function () {
    return _this9._validatePasswordHistory();
  });
};

RestWrite.prototype._validatePasswordRequirements = function () {
  var _this10 = this;

  // check if the password conforms to the defined password policy if configured
  var policyError = 'Password does not meet the Password Policy requirements.';

  // check whether the password meets the password strength requirements
  if (this.config.passwordPolicy.patternValidator && !this.config.passwordPolicy.patternValidator(this.data.password) || this.config.passwordPolicy.validatorCallback && !this.config.passwordPolicy.validatorCallback(this.data.password)) {
    return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, policyError));
  }

  // check whether password contain username
  if (this.config.passwordPolicy.doNotAllowUsername === true) {
    if (this.data.username) {
      // username is not passed during password reset
      if (this.data.password.indexOf(this.data.username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, policyError));
    } else {
      // retrieve the User object using objectId during password reset
      return this.config.database.find('_User', { objectId: this.objectId() }).then(function (results) {
        if (results.length != 1) {
          throw undefined;
        }
        if (_this10.data.password.indexOf(results[0].username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, policyError));
        return Promise.resolve();
      });
    }
  }
  return Promise.resolve();
};

RestWrite.prototype._validatePasswordHistory = function () {
  var _this11 = this;

  // check whether password is repeating from specified history
  if (this.query && this.config.passwordPolicy.maxPasswordHistory) {
    return this.config.database.find('_User', { objectId: this.objectId() }, { keys: ["_password_history", "_hashed_password"] }).then(function (results) {
      if (results.length != 1) {
        throw undefined;
      }
      var user = results[0];
      var oldPasswords = [];
      if (user._password_history) oldPasswords = _lodash2.default.take(user._password_history, _this11.config.passwordPolicy.maxPasswordHistory - 1);
      oldPasswords.push(user.password);
      var newPassword = _this11.data.password;
      // compare the new password hash with all old password hashes
      var promises = oldPasswords.map(function (hash) {
        return passwordCrypto.compare(newPassword, hash).then(function (result) {
          if (result) // reject if there is a match
            return Promise.reject("REPEAT_PASSWORD");
          return Promise.resolve();
        });
      });
      // wait for all comparisons to complete
      return Promise.all(promises).then(function () {
        return Promise.resolve();
      }).catch(function (err) {
        if (err === "REPEAT_PASSWORD") // a match was found
          return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, 'New password should not be the same as last ' + _this11.config.passwordPolicy.maxPasswordHistory + ' passwords.'));
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
  if (this.query) {
    return;
  }
  return this.createSessionToken();
};

RestWrite.prototype.createSessionToken = function () {
  // cloud installationId from Cloud Code,
  // never create session tokens from there.
  if (this.auth.installationId && this.auth.installationId === 'cloud') {
    return;
  }
  var token = 'r:' + cryptoUtils.newToken();

  var expiresAt = this.config.generateSessionExpiresAt();
  var sessionData = {
    sessionToken: token,
    user: {
      __type: 'Pointer',
      className: '_User',
      objectId: this.objectId()
    },
    createdWith: {
      'action': 'signup',
      'authProvider': this.storage['authProvider'] || 'password'
    },
    restricted: false,
    installationId: this.auth.installationId,
    expiresAt: Parse._encode(expiresAt)
  };
  if (this.response && this.response.response) {
    this.response.response.sessionToken = token;
  }
  var create = new RestWrite(this.config, Auth.master(this.config), '_Session', null, sessionData);
  return create.execute();
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
// Does nothing if this isn't an installation object.
RestWrite.prototype.handleSession = function () {
  var _this12 = this;

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

  if (!this.query && !this.auth.isMaster) {
    var token = 'r:' + cryptoUtils.newToken();
    var expiresAt = this.config.generateSessionExpiresAt();
    var sessionData = {
      sessionToken: token,
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.auth.user.id
      },
      createdWith: {
        'action': 'create'
      },
      restricted: true,
      expiresAt: Parse._encode(expiresAt)
    };
    for (var key in this.data) {
      if (key == 'objectId') {
        continue;
      }
      sessionData[key] = this.data[key];
    }
    var create = new RestWrite(this.config, Auth.master(this.config), '_Session', null, sessionData);
    return create.execute().then(function (results) {
      if (!results.response) {
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Error creating session.');
      }
      sessionData['objectId'] = results.response['objectId'];
      _this12.response = {
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
  var _this13 = this;

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

  var installationId = this.data.installationId;

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
  var orQueries = [];
  if (this.query && this.query.objectId) {
    orQueries.push({
      objectId: this.query.objectId
    });
  }
  if (installationId) {
    orQueries.push({
      'installationId': installationId
    });
  }
  if (this.data.deviceToken) {
    orQueries.push({ 'deviceToken': this.data.deviceToken });
  }

  if (orQueries.length == 0) {
    return;
  }

  promise = promise.then(function () {
    return _this13.config.database.find('_Installation', {
      '$or': orQueries
    }, {});
  }).then(function (results) {
    results.forEach(function (result) {
      if (_this13.query && _this13.query.objectId && result.objectId == _this13.query.objectId) {
        objectIdMatch = result;
      }
      if (result.installationId == installationId) {
        installationIdMatch = result;
      }
      if (result.deviceToken == _this13.data.deviceToken) {
        deviceTokenMatches.push(result);
      }
    });

    // Sanity checks when running a query
    if (_this13.query && _this13.query.objectId) {
      if (!objectIdMatch) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found for update.');
      }
      if (_this13.data.installationId && objectIdMatch.installationId && _this13.data.installationId !== objectIdMatch.installationId) {
        throw new Parse.Error(136, 'installationId may not be changed in this ' + 'operation');
      }
      if (_this13.data.deviceToken && objectIdMatch.deviceToken && _this13.data.deviceToken !== objectIdMatch.deviceToken && !_this13.data.installationId && !objectIdMatch.installationId) {
        throw new Parse.Error(136, 'deviceToken may not be changed in this ' + 'operation');
      }
      if (_this13.data.deviceType && _this13.data.deviceType && _this13.data.deviceType !== objectIdMatch.deviceType) {
        throw new Parse.Error(136, 'deviceType may not be changed in this ' + 'operation');
      }
    }

    if (_this13.query && _this13.query.objectId && objectIdMatch) {
      idMatch = objectIdMatch;
    }

    if (installationId && installationIdMatch) {
      idMatch = installationIdMatch;
    }
    // need to specify deviceType only if it's new
    if (!_this13.query && !_this13.data.deviceType && !idMatch) {
      throw new Parse.Error(135, 'deviceType must be specified in this operation');
    }
  }).then(function () {
    if (!idMatch) {
      if (!deviceTokenMatches.length) {
        return;
      } else if (deviceTokenMatches.length == 1 && (!deviceTokenMatches[0]['installationId'] || !installationId)) {
        // Single match on device token but none on installationId, and either
        // the passed object or the match is missing an installationId, so we
        // can just return the match.
        return deviceTokenMatches[0]['objectId'];
      } else if (!_this13.data.installationId) {
        throw new Parse.Error(132, 'Must specify installationId when deviceToken ' + 'matches multiple Installation objects');
      } else {
        // Multiple device token matches and we specified an installation ID,
        // or a single match where both the passed and matching objects have
        // an installation ID. Try cleaning out old installations that match
        // the deviceToken, and return nil to signal that a new object should
        // be created.
        var delQuery = {
          'deviceToken': _this13.data.deviceToken,
          'installationId': {
            '$ne': installationId
          }
        };
        if (_this13.data.appIdentifier) {
          delQuery['appIdentifier'] = _this13.data.appIdentifier;
        }
        _this13.config.database.destroy('_Installation', delQuery);
        return;
      }
    } else {
      if (deviceTokenMatches.length == 1 && !deviceTokenMatches[0]['installationId']) {
        // Exactly one device token match and it doesn't have an installation
        // ID. This is the one case where we want to merge with the existing
        // object.
        var _delQuery = { objectId: idMatch.objectId };
        return _this13.config.database.destroy('_Installation', _delQuery).then(function () {
          return deviceTokenMatches[0]['objectId'];
        });
      } else {
        if (_this13.data.deviceToken && idMatch.deviceToken != _this13.data.deviceToken) {
          // We're setting the device token on an existing installation, so
          // we should try cleaning out old installations that match this
          // device token.
          var _delQuery2 = {
            'deviceToken': _this13.data.deviceToken
          };
          // We have a unique install Id, use that to preserve
          // the interesting installation
          if (_this13.data.installationId) {
            _delQuery2['installationId'] = {
              '$ne': _this13.data.installationId
            };
          } else if (idMatch.objectId && _this13.data.objectId && idMatch.objectId == _this13.data.objectId) {
            // we passed an objectId, preserve that instalation
            _delQuery2['objectId'] = {
              '$ne': idMatch.objectId
            };
          } else {
            // What to do here? can't really clean up everything...
            return idMatch.objectId;
          }
          if (_this13.data.appIdentifier) {
            _delQuery2['appIdentifier'] = _this13.data.appIdentifier;
          }
          _this13.config.database.destroy('_Installation', _delQuery2);
        }
        // In non-merge scenarios, just return the installation match id
        return idMatch.objectId;
      }
    }
  }).then(function (objId) {
    if (objId) {
      _this13.query = { objectId: objId };
      delete _this13.data.objectId;
      delete _this13.data.createdAt;
    }
    // TODO: Validate ops (add/remove on channels, $inc on badge, etc.)
  });
  return promise;
};

// If we short-circuted the object response - then we need to make sure we expand all the files,
// since this might not have a query, meaning it won't return the full result back.
// TODO: (nlutsenko) This should die when we move to per-class based controllers on _Session/_User
RestWrite.prototype.expandFilesForExistingObjects = function () {
  // Check whether we have a short-circuited response - only then run expansion.
  if (this.response && this.response.response) {
    this.config.filesController.expandFilesInObject(this.config, this.response.response);
  }
};

RestWrite.prototype.runDatabaseOperation = function () {
  var _this14 = this;

  if (this.response) {
    return;
  }

  if (this.className === '_Role') {
    this.config.cacheController.role.clear();
  }

  if (this.className === '_User' && this.query && !this.auth.couldUpdateUserId(this.query.objectId)) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Cannot modify user ' + this.query.objectId + '.');
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
    if (this.className === '_User' && this.data.ACL) {
      this.data.ACL[this.query.objectId] = { read: true, write: true };
    }
    // update password timestamp if user password is being changed
    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
      this.data._password_changed_at = Parse._encode(new Date());
    }
    // Ignore createdAt when update
    delete this.data.createdAt;

    var defer = Promise.resolve();
    // if password history is enabled then save the current password to history
    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordHistory) {
      defer = this.config.database.find('_User', { objectId: this.objectId() }, { keys: ["_password_history", "_hashed_password"] }).then(function (results) {
        if (results.length != 1) {
          throw undefined;
        }
        var user = results[0];
        var oldPasswords = [];
        if (user._password_history) {
          oldPasswords = _lodash2.default.take(user._password_history, _this14.config.passwordPolicy.maxPasswordHistory);
        }
        //n-1 passwords go into history including last password
        while (oldPasswords.length > _this14.config.passwordPolicy.maxPasswordHistory - 2) {
          oldPasswords.shift();
        }
        oldPasswords.push(user.password);
        _this14.data._password_history = oldPasswords;
      });
    }

    return defer.then(function () {
      // Run an update
      return _this14.config.database.update(_this14.className, _this14.query, _this14.data, _this14.runOptions).then(function (response) {
        response.updatedAt = _this14.updatedAt;
        _this14._updateResponseWithData(response, _this14.data);
        _this14.response = { response: response };
      });
    });
  } else {
    // Set the default ACL and password timestamp for the new _User
    if (this.className === '_User') {
      var ACL = this.data.ACL;
      // default public r/w ACL
      if (!ACL) {
        ACL = {};
        ACL['*'] = { read: true, write: false };
      }
      // make sure the user is not locked down
      ACL[this.data.objectId] = { read: true, write: true };
      this.data.ACL = ACL;
      // password timestamp to be used when password expiry policy is enforced
      if (this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
        this.data._password_changed_at = Parse._encode(new Date());
      }
    }

    // Run a create
    return this.config.database.create(this.className, this.data, this.runOptions).catch(function (error) {
      if (_this14.className !== '_User' || error.code !== Parse.Error.DUPLICATE_VALUE) {
        throw error;
      }
      // If this was a failed user creation due to username or email already taken, we need to
      // check whether it was username or email and return the appropriate error.

      // TODO: See if we can later do this without additional queries by using named indexes.
      return _this14.config.database.find(_this14.className, { username: _this14.data.username, objectId: { '$ne': _this14.objectId() } }, { limit: 1 }).then(function (results) {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
        }
        return _this14.config.database.find(_this14.className, { email: _this14.data.email, objectId: { '$ne': _this14.objectId() } }, { limit: 1 });
      }).then(function (results) {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
        }
        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      });
    }).then(function (response) {
      response.objectId = _this14.data.objectId;
      response.createdAt = _this14.data.createdAt;

      if (_this14.responseShouldHaveUsername) {
        response.username = _this14.data.username;
      }
      _this14._updateResponseWithData(response, _this14.data);
      _this14.response = {
        status: 201,
        response: response,
        location: _this14.location()
      };
    });
  }
};

// Returns nothing - doesn't wait for the trigger.
RestWrite.prototype.runAfterTrigger = function () {
  if (!this.response || !this.response.response) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'afterSave' trigger for this class.
  var hasAfterSaveHook = triggers.triggerExists(this.className, triggers.Types.afterSave, this.config.applicationId);
  var hasLiveQuery = this.config.liveQueryController.hasLiveQuery(this.className);
  if (!hasAfterSaveHook && !hasLiveQuery) {
    return Promise.resolve();
  }

  var extraData = { className: this.className };
  if (this.query && this.query.objectId) {
    extraData.objectId = this.query.objectId;
  }

  // Build the original object, we only do this for a update write.
  var originalObject = void 0;
  if (this.query && this.query.objectId) {
    originalObject = triggers.inflate(extraData, this.originalData);
  }

  // Build the inflated object, different from beforeSave, originalData is not empty
  // since developers can change data in the beforeSave.
  var updatedObject = triggers.inflate(extraData, this.originalData);
  updatedObject.set(this.sanitizedData());
  updatedObject._handleSaveResponse(this.response.response, this.response.status || 200);

  // Notifiy LiveQueryServer if possible
  this.config.liveQueryController.onAfterSave(updatedObject.className, updatedObject, originalObject);

  // Run afterSave trigger
  return triggers.maybeRunTrigger(triggers.Types.afterSave, this.auth, updatedObject, originalObject, this.config);
};

// A helper to figure out what location this operation happens at.
RestWrite.prototype.location = function () {
  var middle = this.className === '_User' ? '/users/' : '/classes/' + this.className + '/';
  return this.config.mount + middle + this.data.objectId;
};

// A helper to get the object id for this operation.
// Because it could be either on the query or on the data
RestWrite.prototype.objectId = function () {
  return this.data.objectId || this.query.objectId;
};

// Returns a copy of the data and delete bad keys (_auth_data, _hashed_password...)
RestWrite.prototype.sanitizedData = function () {
  var data = Object.keys(this.data).reduce(function (data, key) {
    // Regexp comes from Parse.Object.prototype.validate
    if (!/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
      delete data[key];
    }
    return data;
  }, deepcopy(this.data));
  return Parse._decode(undefined, data);
};

RestWrite.prototype.cleanUserAuthData = function () {
  var _this15 = this;

  if (this.response && this.response.response && this.className === '_User') {
    (function () {
      var user = _this15.response.response;
      if (user.authData) {
        Object.keys(user.authData).forEach(function (provider) {
          if (user.authData[provider] === null) {
            delete user.authData[provider];
          }
        });
        if (Object.keys(user.authData).length == 0) {
          delete user.authData;
        }
      }
    })();
  }
};

RestWrite.prototype._updateResponseWithData = function (response, data) {
  if (_lodash2.default.isEmpty(this.storage.fieldsChangedByTrigger)) {
    return response;
  }
  var clientSupportsDelete = ClientSDK.supportsForwardDelete(this.clientSDK);
  this.storage.fieldsChangedByTrigger.forEach(function (fieldName) {
    var dataValue = data[fieldName];
    var responseValue = response[fieldName];

    response[fieldName] = responseValue || dataValue;

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

exports.default = RestWrite;

module.exports = RestWrite;