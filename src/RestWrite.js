// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".

var SchemaController = require('./Controllers/SchemaController');
var deepcopy = require('deepcopy');

var Auth = require('./Auth');
var Config = require('./Config');
var cryptoUtils = require('./cryptoUtils');
var passwordCrypto = require('./password');
var Parse = require('parse/node');
var triggers = require('./triggers');
var ClientSDK = require('./ClientSDK');
import RestQuery from './RestQuery';
import _         from 'lodash';

// query and data are both provided in REST API format. So data
// types are encoded by plain old objects.
// If query is null, this is a "create" and the data in data should be
// created.
// Otherwise this is an "update" - the object matching the query
// should get updated with data.
// RestWrite will handle objectId, createdAt, and updatedAt for
// everything. It also knows to use triggers and special modifications
// for the _User class.
function RestWrite(config, auth, className, query, data, originalData, clientSDK) {
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.clientSDK = clientSDK;
  this.storage = {};
  this.runOptions = {};
  if (!query && data.objectId) {
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
RestWrite.prototype.execute = function() {
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
    return this.runBeforeTrigger();
  }).then(() => {
    return this.validateSchema();
  }).then(() => {
    return this.setRequiredFieldsIfNeeded();
  }).then(() => {
    return this.transformUser();
  }).then(() => {
    return this.expandFilesForExistingObjects();
  }).then(() => {
    return this.runDatabaseOperation();
  }).then(() => {
    return this.createSessionTokenIfNeeded();
  }).then(() => {
    return this.handleFollowup();
  }).then(() => {
    return this.runAfterTrigger();
  }).then(() => {
    return this.cleanUserAuthData();
  }).then(() => {
    return this.response;
  })
};

// Uses the Auth object to get the list of roles, adds the user id
RestWrite.prototype.getUserAndRoleACL = function() {
  if (this.auth.isMaster) {
    return Promise.resolve();
  }

  this.runOptions.acl = ['*'];

  if (this.auth.user) {
    return this.auth.getUserRoles().then((roles) => {
      roles.push(this.auth.user.id);
      this.runOptions.acl = this.runOptions.acl.concat(roles);
      return;
    });
  } else {
    return Promise.resolve();
  }
};

// Validates this operation against the allowClientClassCreation config.
RestWrite.prototype.validateClientClassCreation = function() {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster
      && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema()
      .then(schemaController => schemaController.hasClass(this.className))
      .then(hasClass => {
        if (hasClass !== true) {
          throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN,
                                'This user is not allowed to access ' +
                                'non-existent class: ' + this.className);
        }
    });
  } else {
    return Promise.resolve();
  }
};

// Validates this operation against the schema.
RestWrite.prototype.validateSchema = function() {
  return this.config.database.validateObject(this.className, this.data, this.query, this.runOptions);
};

// Runs any beforeSave triggers against this operation.
// Any change leads to our data being mutated.
RestWrite.prototype.runBeforeTrigger = function() {
  if (this.response) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'beforeSave' trigger for this class.
  if (!triggers.triggerExists(this.className, triggers.Types.beforeSave, this.config.applicationId)) {
    return Promise.resolve();
  }

  // Cloud code gets a bit of extra data for its objects
  var extraData = {className: this.className};
  if (this.query && this.query.objectId) {
    extraData.objectId = this.query.objectId;
  }

  let originalObject = null;
  let updatedObject = triggers.inflate(extraData, this.originalData);
  if (this.query && this.query.objectId) {
    // This is an update for existing object.
    originalObject = triggers.inflate(extraData, this.originalData);
  }
  updatedObject.set(this.sanitizedData());

  return Promise.resolve().then(() => {
    return triggers.maybeRunTrigger(triggers.Types.beforeSave, this.auth, updatedObject, originalObject, this.config);
  }).then((response) => {
    if (response && response.object) {
      this.storage.fieldsChangedByTrigger = _.reduce(response.object, (result, value, key) => {
        if (!_.isEqual(this.data[key], value)) {
          result.push(key);
        }
        return result;
      }, []);
      this.data = response.object;
      // We should delete the objectId for an update write
      if (this.query && this.query.objectId) {
        delete this.data.objectId
      }
    }
  });
};

RestWrite.prototype.setRequiredFieldsIfNeeded = function() {
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
RestWrite.prototype.validateAuthData = function() {
  if (this.className !== '_User') {
    return;
  }

  if (!this.query && !this.data.authData) {
    if (typeof this.data.username !== 'string') {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING,
                            'bad or missing username');
    }
    if (typeof this.data.password !== 'string') {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING,
                            'password is required');
    }
  }

  if (!this.data.authData || !Object.keys(this.data.authData).length) {
    return;
  }

  var authData = this.data.authData;
  var providers = Object.keys(authData);
  if (providers.length > 0) {
    let canHandleAuthData = providers.reduce((canHandle, provider) => {
      var providerAuthData = authData[provider];
      var hasToken = (providerAuthData && providerAuthData.id);
      return canHandle && (hasToken || providerAuthData == null);
    }, true);
    if (canHandleAuthData) {
      return this.handleAuthData(authData);
    }
  }
  throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE,
                          'This authentication method is unsupported.');
};

RestWrite.prototype.handleAuthDataValidation = function(authData) {
  let validations = Object.keys(authData).map((provider) => {
    if (authData[provider] === null) {
      return Promise.resolve();
    }
    let validateAuthData = this.config.authDataManager.getValidatorForProvider(provider);
    if (!validateAuthData) {
      throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE,
                            'This authentication method is unsupported.');
    };
    return validateAuthData(authData[provider]);
  });
  return Promise.all(validations);
}

RestWrite.prototype.findUsersWithAuthData = function(authData) {
  let providers = Object.keys(authData);
  let query = providers.reduce((memo, provider) => {
    if (!authData[provider]) {
      return memo;
    }
    let queryKey = `authData.${provider}.id`;
    let query = {};
    query[queryKey] = authData[provider].id;
    memo.push(query);
    return memo;
  }, []).filter((q) => {
    return typeof q !== 'undefined';
  });

  let findPromise = Promise.resolve([]);
  if (query.length > 0) {
     findPromise = this.config.database.find(
        this.className,
        {'$or': query}, {})
  }

  return findPromise;
}


RestWrite.prototype.handleAuthData = function(authData) {
  let results;
  return this.handleAuthDataValidation(authData).then(() => {
     return this.findUsersWithAuthData(authData);
  }).then((r) => {
    results = r;
    if (results.length > 1) {
      // More than 1 user with the passed id's
      throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED,
                              'this auth is already used');
    }

    this.storage['authProvider'] = Object.keys(authData).join(',');

    if (results.length > 0) {
      if (!this.query) {
        // Login with auth data
        delete results[0].password;
        let userResult = results[0];

        // need to set the objectId first otherwise location has trailing undefined
        this.data.objectId = userResult.objectId;

        // Determine if authData was updated
        let mutatedAuthData = {};
        Object.keys(authData).forEach((provider) => {
          let providerData = authData[provider];
          let userAuthData = userResult.authData[provider];
          if (!_.isEqual(providerData, userAuthData)) {
            mutatedAuthData[provider] = providerData;
          }
        });

        this.response = {
          response: userResult,
          location: this.location()
        };

        // We have authData that is updated on login
        // that can happen when token are refreshed,
        // We should update the token and let the user in
        if (Object.keys(mutatedAuthData).length > 0) {
          // Assign the new authData in the response
          Object.keys(mutatedAuthData).forEach((provider) => {
            this.response.response.authData[provider] = mutatedAuthData[provider];
          });
          // Run the DB update directly, as 'master'
          // Just update the authData part
          return this.config.database.update(this.className, {objectId: this.data.objectId}, {authData: mutatedAuthData}, {});
        }
        return;

      } else if (this.query && this.query.objectId) {
        // Trying to update auth data but users
        // are different
        if (results[0].objectId !== this.query.objectId) {
          throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED,
                              'this auth is already used');
        }
      }
    }
    return;
  });
}


// The non-third-party parts of User transformation
RestWrite.prototype.transformUser = function() {
  if (this.className !== '_User') {
    return;
  }

  var promise = Promise.resolve();

  if (this.query) {
    // If we're updating a _User object, we need to clear out the cache for that user. Find all their
    // session tokens, and remove them from the cache.
    promise = new RestQuery(this.config, Auth.master(this.config), '_Session', { user: {
      __type: "Pointer",
      className: "_User",
      objectId: this.objectId(),
    }}).execute()
    .then(results => {
      results.results.forEach(session => this.config.cacheController.user.del(session.sessionToken));
    });
  }

  return promise.then(() => {
    // Transform the password
    if (!this.data.password) {
      return;
    }
    if (this.query && !this.auth.isMaster ) {
      this.storage['clearSessions'] = true;
      this.storage['generateNewSession'] = true;
    }
    return passwordCrypto.hash(this.data.password).then((hashedPassword) => {
      this.data._hashed_password = hashedPassword;
      delete this.data.password;
    });

  }).then(() => {
    // Check for username uniqueness
    if (!this.data.username) {
      if (!this.query) {
        this.data.username = cryptoUtils.randomString(25);
        this.responseShouldHaveUsername = true;
      }
      return;
    }
    // We need to a find to check for duplicate username in case they are missing the unique index on usernames
    // TODO: Check if there is a unique index, and if so, skip this query.
    return this.config.database.find(
      this.className,
      { username: this.data.username, objectId: {'$ne': this.objectId()} },
      { limit: 1 }
    )
    .then(results => {
      if (results.length > 0) {
        throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
      }
      return;
    });
  })
  .then(() => {
    if (!this.data.email || this.data.email.__op === 'Delete') {
      return;
    }
    // Validate basic email address format
    if (!this.data.email.match(/^.+@.+$/)) {
      throw new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.');
    }
    // Same problem for email as above for username
    return this.config.database.find(
      this.className,
      { email: this.data.email, objectId: {'$ne': this.objectId()} },
      { limit: 1 }
    )
    .then(results => {
      if (results.length > 0) {
        throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
      }
      // We updated the email, send a new validation
      this.storage['sendVerificationEmail'] = true;
      this.config.userController.setEmailVerifyToken(this.data);
    });
  })
};

RestWrite.prototype.createSessionTokenIfNeeded = function() {
  if (this.className !== '_User') {
    return;
  }
  if (this.query) {
    return;
  }
  return this.createSessionToken();
}

RestWrite.prototype.createSessionToken = function() {
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
}

// Handles any followup logic
RestWrite.prototype.handleFollowup = function() {
  if (this.storage && this.storage['clearSessions'] && this.config.revokeSessionOnPasswordReset) {
    var sessionQuery = {
      user: {
          __type: 'Pointer',
          className: '_User',
          objectId: this.objectId()
        }
    };
    delete this.storage['clearSessions'];
    return this.config.database.destroy('_Session', sessionQuery)
    .then(this.handleFollowup.bind(this));
  }

  if (this.storage && this.storage['generateNewSession']) {
    delete this.storage['generateNewSession'];
    return this.createSessionToken()
    .then(this.handleFollowup.bind(this));
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
RestWrite.prototype.handleSession = function() {
  if (this.response || this.className !== '_Session') {
    return;
  }

  if (!this.auth.user && !this.auth.isMaster) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN,
                          'Session token required.');
  }

  // TODO: Verify proper error to throw
  if (this.data.ACL) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'Cannot set ' +
                          'ACL on a Session.');
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
    return create.execute().then((results) => {
      if (!results.response) {
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR,
                              'Error creating session.');
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
RestWrite.prototype.handleInstallation = function() {
  if (this.response || this.className !== '_Installation') {
    return;
  }

  if (!this.query && !this.data.deviceToken && !this.data.installationId && !this.auth.installationId) {
    throw new Parse.Error(135,
                          'at least one ID field (deviceToken, installationId) ' +
                          'must be specified in this operation');
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

  // If data.installationId is not set, we can lookup in the auth
  let installationId = this.data.installationId || this.auth.installationId;

  if (installationId) {
    installationId = installationId.toLowerCase();
  }

  var promise = Promise.resolve();

  var idMatch; // Will be a match on either objectId or installationId
  var objectIdMatch;
  var installationIdMatch;
  var deviceTokenMatches = [];

  // Instead of issuing 3 reads, let's do it with one OR.
  let orQueries = [];
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
    orQueries.push({'deviceToken': this.data.deviceToken});
  }

  if (orQueries.length == 0) {
    return;
  }

  promise = promise.then(() => {
    return this.config.database.find('_Installation', {
        '$or': orQueries
    }, {});
  }).then((results) => {
    results.forEach((result) => {
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
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND,
                                'Object not found for update.');
      }
      if (installationId && objectIdMatch.installationId &&
          installationId !== objectIdMatch.installationId) {
          throw new Parse.Error(136,
                                'installationId may not be changed in this ' +
                                'operation');
        }
        if (this.data.deviceToken && objectIdMatch.deviceToken &&
          this.data.deviceToken !== objectIdMatch.deviceToken &&
          !this.data.installationId && !objectIdMatch.installationId) {
          throw new Parse.Error(136,
                                'deviceToken may not be changed in this ' +
                                'operation');
        }
        if (this.data.deviceType && this.data.deviceType &&
          this.data.deviceType !== objectIdMatch.deviceType) {
          throw new Parse.Error(136,
                                'deviceType may not be changed in this ' +
                                'operation');
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
      throw new Parse.Error(135,
                            'deviceType must be specified in this operation');
    }

  }).then(() => {
    if (!idMatch) {
      if (!deviceTokenMatches.length) {
        return;
      } else if (deviceTokenMatches.length == 1 &&
        (!deviceTokenMatches[0]['installationId'] || !installationId)
      ) {
        // Single match on device token but none on installationId, and either
        // the passed object or the match is missing an installationId, so we
        // can just return the match.
        return deviceTokenMatches[0]['objectId'];
      } else if (!this.data.installationId) {
        throw new Parse.Error(132,
                              'Must specify installationId when deviceToken ' +
                              'matches multiple Installation objects');
      } else {
        // Multiple device token matches and we specified an installation ID,
        // or a single match where both the passed and matching objects have
        // an installation ID. Try cleaning out old installations that match
        // the deviceToken, and return nil to signal that a new object should
        // be created.
        var delQuery = {
          'deviceToken': this.data.deviceToken,
          'installationId': {
            '$ne': installationId
          }
        };
        if (this.data.appIdentifier) {
          delQuery['appIdentifier'] = this.data.appIdentifier;
        }
        this.config.database.destroy('_Installation', delQuery);
        return;
      }
    } else {
      if (deviceTokenMatches.length == 1 &&
        !deviceTokenMatches[0]['installationId']) {
        // Exactly one device token match and it doesn't have an installation
        // ID. This is the one case where we want to merge with the existing
        // object.
        var delQuery = {objectId: idMatch.objectId};
        return this.config.database.destroy('_Installation', delQuery)
          .then(() => {
            return deviceTokenMatches[0]['objectId'];
          });
      } else {
        if (this.data.deviceToken &&
          idMatch.deviceToken != this.data.deviceToken) {
          // We're setting the device token on an existing installation, so
          // we should try cleaning out old installations that match this
          // device token.
          var delQuery = {
            'deviceToken': this.data.deviceToken,
          };
          // We have a unique install Id, use that to preserve
          // the interesting installation
          if (this.data.installationId) {
            delQuery['installationId'] = {
              '$ne': this.data.installationId
            }
          } else if (idMatch.objectId && this.data.objectId
                    && idMatch.objectId == this.data.objectId) {
            // we passed an objectId, preserve that instalation
            delQuery['objectId'] = {
              '$ne': idMatch.objectId
            }
          } else {
            // What to do here? can't really clean up everything...
            return idMatch.objectId;
          }
          if (this.data.appIdentifier) {
            delQuery['appIdentifier'] = this.data.appIdentifier;
          }
          this.config.database.destroy('_Installation', delQuery);
        }
        // In non-merge scenarios, just return the installation match id
        return idMatch.objectId;
      }
    }
  }).then((objId) => {
    if (objId) {
      this.query = {objectId: objId};
      delete this.data.objectId;
      delete this.data.createdAt;
    }
    // TODO: Validate ops (add/remove on channels, $inc on badge, etc.)
  });
  return promise;
};

// If we short-circuted the object response - then we need to make sure we expand all the files,
// since this might not have a query, meaning it won't return the full result back.
// TODO: (nlutsenko) This should die when we move to per-class based controllers on _Session/_User
RestWrite.prototype.expandFilesForExistingObjects = function() {
  // Check whether we have a short-circuited response - only then run expansion.
  if (this.response && this.response.response) {
    this.config.filesController.expandFilesInObject(this.config, this.response.response);
  }
};

RestWrite.prototype.runDatabaseOperation = function() {
  if (this.response) {
    return;
  }

  if (this.className === '_Role') {
    this.config.cacheController.role.clear();
  }

  if (this.className === '_User' &&
      this.query &&
      !this.auth.couldUpdateUserId(this.query.objectId)) {
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
    if (this.className === '_User' && this.data.ACL) {
      this.data.ACL[this.query.objectId] = { read: true, write: true };
    }
    // Run an update
    return this.config.database.update(this.className, this.query, this.data, this.runOptions)
    .then(response => {
      response.updatedAt = this.updatedAt;
      this._updateResponseWithData(response, this.data);
      this.response = { response };
    });
  } else {
    // Set the default ACL for the new _User
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
    }

    // Run a create
    return this.config.database.create(this.className, this.data, this.runOptions)
    .catch(error => {
      if (this.className !== '_User' || error.code !== Parse.Error.DUPLICATE_VALUE) {
        throw error;
      }
      // If this was a failed user creation due to username or email already taken, we need to
      // check whether it was username or email and return the appropriate error.

      // TODO: See if we can later do this without additional queries by using named indexes.
      return this.config.database.find(
        this.className,
        { username: this.data.username, objectId: {'$ne': this.objectId()} },
        { limit: 1 }
      )
      .then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
        }
        return this.config.database.find(
          this.className,
          { email: this.data.email, objectId: {'$ne': this.objectId()} },
          { limit: 1 }
        );
      })
      .then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
        }
        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      });
    })
    .then(response => {
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
RestWrite.prototype.runAfterTrigger = function() {
  if (!this.response || !this.response.response) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'afterSave' trigger for this class.
  let hasAfterSaveHook = triggers.triggerExists(this.className, triggers.Types.afterSave, this.config.applicationId);
  let hasLiveQuery = this.config.liveQueryController.hasLiveQuery(this.className);
  if (!hasAfterSaveHook && !hasLiveQuery) {
    return Promise.resolve();
  }

  var extraData = {className: this.className};
  if (this.query && this.query.objectId) {
    extraData.objectId = this.query.objectId;
  }

  // Build the original object, we only do this for a update write.
  let originalObject;
  if (this.query && this.query.objectId) {
    originalObject = triggers.inflate(extraData, this.originalData);
  }

  // Build the inflated object, different from beforeSave, originalData is not empty
  // since developers can change data in the beforeSave.
  let updatedObject = triggers.inflate(extraData, this.originalData);
  updatedObject.set(this.sanitizedData());
  updatedObject._handleSaveResponse(this.response.response, this.response.status || 200);

  // Notifiy LiveQueryServer if possible
  this.config.liveQueryController.onAfterSave(updatedObject.className, updatedObject, originalObject);

  // Run afterSave trigger
  return triggers.maybeRunTrigger(triggers.Types.afterSave, this.auth, updatedObject, originalObject, this.config);
};

// A helper to figure out what location this operation happens at.
RestWrite.prototype.location = function() {
  var middle = (this.className === '_User' ? '/users/' :
                '/classes/' + this.className + '/');
  return this.config.mount + middle + this.data.objectId;
};

// A helper to get the object id for this operation.
// Because it could be either on the query or on the data
RestWrite.prototype.objectId = function() {
  return this.data.objectId || this.query.objectId;
};

// Returns a copy of the data and delete bad keys (_auth_data, _hashed_password...)
RestWrite.prototype.sanitizedData = function() {
  let data = Object.keys(this.data).reduce((data, key) => {
    // Regexp comes from Parse.Object.prototype.validate
    if (!(/^[A-Za-z][0-9A-Za-z_]*$/).test(key)) {
      delete data[key];
    }
    return data;
  }, deepcopy(this.data));
  return Parse._decode(undefined, data);
}

RestWrite.prototype.cleanUserAuthData = function() {
  if (this.response && this.response.response && this.className === '_User') {
    let user = this.response.response;
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
  }
};

RestWrite.prototype._updateResponseWithData = function(response, data) {
  if (_.isEmpty(this.storage.fieldsChangedByTrigger)) {
    return response;
  }
  let clientSupportsDelete = ClientSDK.supportsForwardDelete(this.clientSDK);
  this.storage.fieldsChangedByTrigger.forEach(fieldName => {
    let dataValue = data[fieldName];
    let responseValue = response[fieldName];

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
}

export default RestWrite;
module.exports = RestWrite;
