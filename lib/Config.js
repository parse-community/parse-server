'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Config = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); // A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.

var _cache = require('./cache');

var _cache2 = _interopRequireDefault(_cache);

var _SchemaCache = require('./Controllers/SchemaCache');

var _SchemaCache2 = _interopRequireDefault(_SchemaCache);

var _DatabaseController = require('./Controllers/DatabaseController');

var _DatabaseController2 = _interopRequireDefault(_DatabaseController);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function removeTrailingSlash(str) {
  if (!str) {
    return str;
  }
  if (str.endsWith("/")) {
    str = str.substr(0, str.length - 1);
  }
  return str;
}

var Config = exports.Config = function () {
  function Config(applicationId, mount) {
    _classCallCheck(this, Config);

    var cacheInfo = _cache2.default.get(applicationId);
    if (!cacheInfo) {
      return;
    }

    this.applicationId = applicationId;
    this.jsonLogs = cacheInfo.jsonLogs;
    this.masterKey = cacheInfo.masterKey;
    this.clientKey = cacheInfo.clientKey;
    this.javascriptKey = cacheInfo.javascriptKey;
    this.dotNetKey = cacheInfo.dotNetKey;
    this.restAPIKey = cacheInfo.restAPIKey;
    this.webhookKey = cacheInfo.webhookKey;
    this.fileKey = cacheInfo.fileKey;
    this.allowClientClassCreation = cacheInfo.allowClientClassCreation;
    this.userSensitiveFields = cacheInfo.userSensitiveFields;

    // Create a new DatabaseController per request
    if (cacheInfo.databaseController) {
      var schemaCache = new _SchemaCache2.default(cacheInfo.cacheController, cacheInfo.schemaCacheTTL, cacheInfo.enableSingleSchemaCache);
      this.database = new _DatabaseController2.default(cacheInfo.databaseController.adapter, schemaCache);
    }

    this.schemaCacheTTL = cacheInfo.schemaCacheTTL;
    this.enableSingleSchemaCache = cacheInfo.enableSingleSchemaCache;

    this.serverURL = cacheInfo.serverURL;
    this.publicServerURL = removeTrailingSlash(cacheInfo.publicServerURL);
    this.verifyUserEmails = cacheInfo.verifyUserEmails;
    this.preventLoginWithUnverifiedEmail = cacheInfo.preventLoginWithUnverifiedEmail;
    this.emailVerifyTokenValidityDuration = cacheInfo.emailVerifyTokenValidityDuration;
    this.accountLockout = cacheInfo.accountLockout;
    this.passwordPolicy = cacheInfo.passwordPolicy;
    this.appName = cacheInfo.appName;

    this.analyticsController = cacheInfo.analyticsController;
    this.cacheController = cacheInfo.cacheController;
    this.hooksController = cacheInfo.hooksController;
    this.filesController = cacheInfo.filesController;
    this.pushController = cacheInfo.pushController;
    this.pushControllerQueue = cacheInfo.pushControllerQueue;
    this.pushWorker = cacheInfo.pushWorker;
    this.hasPushSupport = cacheInfo.hasPushSupport;
    this.loggerController = cacheInfo.loggerController;
    this.userController = cacheInfo.userController;
    this.authDataManager = cacheInfo.authDataManager;
    this.customPages = cacheInfo.customPages || {};
    this.mount = removeTrailingSlash(mount);
    this.liveQueryController = cacheInfo.liveQueryController;
    this.sessionLength = cacheInfo.sessionLength;
    this.expireInactiveSessions = cacheInfo.expireInactiveSessions;
    this.emailControllerAdapter = cacheInfo.emailControllerAdapter;
    this.generateSessionExpiresAt = this.generateSessionExpiresAt.bind(this);
    this.generateEmailVerifyTokenExpiresAt = this.generateEmailVerifyTokenExpiresAt.bind(this);
    this.revokeSessionOnPasswordReset = cacheInfo.revokeSessionOnPasswordReset;
  }

  _createClass(Config, [{
    key: 'generateEmailVerifyTokenExpiresAt',
    value: function generateEmailVerifyTokenExpiresAt() {
      if (!this.verifyUserEmails || !this.emailVerifyTokenValidityDuration) {
        return undefined;
      }
      var now = new Date();
      return new Date(now.getTime() + this.emailVerifyTokenValidityDuration * 1000);
    }
  }, {
    key: 'generatePasswordResetTokenExpiresAt',
    value: function generatePasswordResetTokenExpiresAt() {
      if (!this.passwordPolicy || !this.passwordPolicy.resetTokenValidityDuration) {
        return undefined;
      }
      var now = new Date();
      return new Date(now.getTime() + this.passwordPolicy.resetTokenValidityDuration * 1000);
    }
  }, {
    key: 'generateSessionExpiresAt',
    value: function generateSessionExpiresAt() {
      if (!this.expireInactiveSessions) {
        return undefined;
      }
      var now = new Date();
      return new Date(now.getTime() + this.sessionLength * 1000);
    }
  }, {
    key: 'mount',
    get: function get() {
      var mount = this._mount;
      if (this.publicServerURL) {
        mount = this.publicServerURL;
      }
      return mount;
    },
    set: function set(newValue) {
      this._mount = newValue;
    }
  }, {
    key: 'invalidLinkURL',
    get: function get() {
      return this.customPages.invalidLink || this.publicServerURL + '/apps/invalid_link.html';
    }
  }, {
    key: 'verifyEmailSuccessURL',
    get: function get() {
      return this.customPages.verifyEmailSuccess || this.publicServerURL + '/apps/verify_email_success.html';
    }
  }, {
    key: 'choosePasswordURL',
    get: function get() {
      return this.customPages.choosePassword || this.publicServerURL + '/apps/choose_password';
    }
  }, {
    key: 'requestResetPasswordURL',
    get: function get() {
      return this.publicServerURL + '/apps/' + this.applicationId + '/request_password_reset';
    }
  }, {
    key: 'passwordResetSuccessURL',
    get: function get() {
      return this.customPages.passwordResetSuccess || this.publicServerURL + '/apps/password_reset_success.html';
    }
  }, {
    key: 'parseFrameURL',
    get: function get() {
      return this.customPages.parseFrameURL;
    }
  }, {
    key: 'verifyEmailURL',
    get: function get() {
      return this.publicServerURL + '/apps/' + this.applicationId + '/verify_email';
    }
  }], [{
    key: 'validate',
    value: function validate(_ref) {
      var verifyUserEmails = _ref.verifyUserEmails,
          userController = _ref.userController,
          appName = _ref.appName,
          publicServerURL = _ref.publicServerURL,
          revokeSessionOnPasswordReset = _ref.revokeSessionOnPasswordReset,
          expireInactiveSessions = _ref.expireInactiveSessions,
          sessionLength = _ref.sessionLength,
          emailVerifyTokenValidityDuration = _ref.emailVerifyTokenValidityDuration,
          accountLockout = _ref.accountLockout,
          passwordPolicy = _ref.passwordPolicy;

      var emailAdapter = userController.adapter;
      if (verifyUserEmails) {
        this.validateEmailConfiguration({ emailAdapter: emailAdapter, appName: appName, publicServerURL: publicServerURL, emailVerifyTokenValidityDuration: emailVerifyTokenValidityDuration });
      }

      this.validateAccountLockoutPolicy(accountLockout);

      this.validatePasswordPolicy(passwordPolicy);

      if (typeof revokeSessionOnPasswordReset !== 'boolean') {
        throw 'revokeSessionOnPasswordReset must be a boolean value';
      }

      if (publicServerURL) {
        if (!publicServerURL.startsWith("http://") && !publicServerURL.startsWith("https://")) {
          throw "publicServerURL should be a valid HTTPS URL starting with https://";
        }
      }

      this.validateSessionConfiguration(sessionLength, expireInactiveSessions);
    }
  }, {
    key: 'validateAccountLockoutPolicy',
    value: function validateAccountLockoutPolicy(accountLockout) {
      if (accountLockout) {
        if (typeof accountLockout.duration !== 'number' || accountLockout.duration <= 0 || accountLockout.duration > 99999) {
          throw 'Account lockout duration should be greater than 0 and less than 100000';
        }

        if (!Number.isInteger(accountLockout.threshold) || accountLockout.threshold < 1 || accountLockout.threshold > 999) {
          throw 'Account lockout threshold should be an integer greater than 0 and less than 1000';
        }
      }
    }
  }, {
    key: 'validatePasswordPolicy',
    value: function validatePasswordPolicy(passwordPolicy) {
      if (passwordPolicy) {
        if (passwordPolicy.maxPasswordAge !== undefined && (typeof passwordPolicy.maxPasswordAge !== 'number' || passwordPolicy.maxPasswordAge < 0)) {
          throw 'passwordPolicy.maxPasswordAge must be a positive number';
        }

        if (passwordPolicy.resetTokenValidityDuration !== undefined && (typeof passwordPolicy.resetTokenValidityDuration !== 'number' || passwordPolicy.resetTokenValidityDuration <= 0)) {
          throw 'passwordPolicy.resetTokenValidityDuration must be a positive number';
        }

        if (passwordPolicy.validatorPattern) {
          if (typeof passwordPolicy.validatorPattern === 'string') {
            passwordPolicy.validatorPattern = new RegExp(passwordPolicy.validatorPattern);
          } else if (!(passwordPolicy.validatorPattern instanceof RegExp)) {
            throw 'passwordPolicy.validatorPattern must be a regex string or RegExp object.';
          }
        }

        if (passwordPolicy.validatorCallback && typeof passwordPolicy.validatorCallback !== 'function') {
          throw 'passwordPolicy.validatorCallback must be a function.';
        }

        if (passwordPolicy.doNotAllowUsername && typeof passwordPolicy.doNotAllowUsername !== 'boolean') {
          throw 'passwordPolicy.doNotAllowUsername must be a boolean value.';
        }

        if (passwordPolicy.maxPasswordHistory && (!Number.isInteger(passwordPolicy.maxPasswordHistory) || passwordPolicy.maxPasswordHistory <= 0 || passwordPolicy.maxPasswordHistory > 20)) {
          throw 'passwordPolicy.maxPasswordHistory must be an integer ranging 0 - 20';
        }
      }
    }

    // if the passwordPolicy.validatorPattern is configured then setup a callback to process the pattern

  }, {
    key: 'setupPasswordValidator',
    value: function setupPasswordValidator(passwordPolicy) {
      if (passwordPolicy && passwordPolicy.validatorPattern) {
        passwordPolicy.patternValidator = function (value) {
          return passwordPolicy.validatorPattern.test(value);
        };
      }
    }
  }, {
    key: 'validateEmailConfiguration',
    value: function validateEmailConfiguration(_ref2) {
      var emailAdapter = _ref2.emailAdapter,
          appName = _ref2.appName,
          publicServerURL = _ref2.publicServerURL,
          emailVerifyTokenValidityDuration = _ref2.emailVerifyTokenValidityDuration;

      if (!emailAdapter) {
        throw 'An emailAdapter is required for e-mail verification and password resets.';
      }
      if (typeof appName !== 'string') {
        throw 'An app name is required for e-mail verification and password resets.';
      }
      if (typeof publicServerURL !== 'string') {
        throw 'A public server url is required for e-mail verification and password resets.';
      }
      if (emailVerifyTokenValidityDuration) {
        if (isNaN(emailVerifyTokenValidityDuration)) {
          throw 'Email verify token validity duration must be a valid number.';
        } else if (emailVerifyTokenValidityDuration <= 0) {
          throw 'Email verify token validity duration must be a value greater than 0.';
        }
      }
    }
  }, {
    key: 'validateSessionConfiguration',
    value: function validateSessionConfiguration(sessionLength, expireInactiveSessions) {
      if (expireInactiveSessions) {
        if (isNaN(sessionLength)) {
          throw 'Session length must be a valid number.';
        } else if (sessionLength <= 0) {
          throw 'Session length must be a value greater than 0.';
        }
      }
    }
  }]);

  return Config;
}();

exports.default = Config;

module.exports = Config;