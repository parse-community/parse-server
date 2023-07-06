"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Config = void 0;
var _lodash = require("lodash");
var _net = _interopRequireDefault(require("net"));
var _cache = _interopRequireDefault(require("./cache"));
var _DatabaseController = _interopRequireDefault(require("./Controllers/DatabaseController"));
var _LoggerController = require("./Controllers/LoggerController");
var _Definitions = require("./Options/Definitions");
var _Parse = _interopRequireDefault(require("./cloud-code/Parse.Server"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.

function removeTrailingSlash(str) {
  if (!str) {
    return str;
  }
  if (str.endsWith('/')) {
    str = str.substring(0, str.length - 1);
  }
  return str;
}
class Config {
  static get(applicationId, mount) {
    const cacheInfo = _cache.default.get(applicationId);
    if (!cacheInfo) {
      return;
    }
    const config = new Config();
    config.applicationId = applicationId;
    Object.keys(cacheInfo).forEach(key => {
      if (key == 'databaseController') {
        config.database = new _DatabaseController.default(cacheInfo.databaseController.adapter, config);
      } else {
        config[key] = cacheInfo[key];
      }
    });
    config.mount = removeTrailingSlash(mount);
    config.generateSessionExpiresAt = config.generateSessionExpiresAt.bind(config);
    config.generateEmailVerifyTokenExpiresAt = config.generateEmailVerifyTokenExpiresAt.bind(config);
    return config;
  }
  static put(serverConfiguration) {
    Config.validateOptions(serverConfiguration);
    Config.validateControllers(serverConfiguration);
    _cache.default.put(serverConfiguration.appId, serverConfiguration);
    Config.setupPasswordValidator(serverConfiguration.passwordPolicy);
    return serverConfiguration;
  }
  static validateOptions({
    publicServerURL,
    revokeSessionOnPasswordReset,
    expireInactiveSessions,
    sessionLength,
    defaultLimit,
    maxLimit,
    accountLockout,
    passwordPolicy,
    masterKeyIps,
    masterKey,
    maintenanceKey,
    maintenanceKeyIps,
    readOnlyMasterKey,
    allowHeaders,
    idempotencyOptions,
    fileUpload,
    pages,
    security,
    enforcePrivateUsers,
    schema,
    requestKeywordDenylist,
    allowExpiredAuthDataToken,
    logLevels,
    rateLimit,
    databaseOptions,
    extendSessionOnUse
  }) {
    if (masterKey === readOnlyMasterKey) {
      throw new Error('masterKey and readOnlyMasterKey should be different');
    }
    if (masterKey === maintenanceKey) {
      throw new Error('masterKey and maintenanceKey should be different');
    }
    this.validateAccountLockoutPolicy(accountLockout);
    this.validatePasswordPolicy(passwordPolicy);
    this.validateFileUploadOptions(fileUpload);
    if (typeof revokeSessionOnPasswordReset !== 'boolean') {
      throw 'revokeSessionOnPasswordReset must be a boolean value';
    }
    if (typeof extendSessionOnUse !== 'boolean') {
      throw 'extendSessionOnUse must be a boolean value';
    }
    if (publicServerURL) {
      if (!publicServerURL.startsWith('http://') && !publicServerURL.startsWith('https://')) {
        throw 'publicServerURL should be a valid HTTPS URL starting with https://';
      }
    }
    this.validateSessionConfiguration(sessionLength, expireInactiveSessions);
    this.validateIps('masterKeyIps', masterKeyIps);
    this.validateIps('maintenanceKeyIps', maintenanceKeyIps);
    this.validateDefaultLimit(defaultLimit);
    this.validateMaxLimit(maxLimit);
    this.validateAllowHeaders(allowHeaders);
    this.validateIdempotencyOptions(idempotencyOptions);
    this.validatePagesOptions(pages);
    this.validateSecurityOptions(security);
    this.validateSchemaOptions(schema);
    this.validateEnforcePrivateUsers(enforcePrivateUsers);
    this.validateAllowExpiredAuthDataToken(allowExpiredAuthDataToken);
    this.validateRequestKeywordDenylist(requestKeywordDenylist);
    this.validateRateLimit(rateLimit);
    this.validateLogLevels(logLevels);
    this.validateDatabaseOptions(databaseOptions);
  }
  static validateControllers({
    verifyUserEmails,
    userController,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid
  }) {
    const emailAdapter = userController.adapter;
    if (verifyUserEmails) {
      this.validateEmailConfiguration({
        emailAdapter,
        appName,
        publicServerURL,
        emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid
      });
    }
  }
  static validateRequestKeywordDenylist(requestKeywordDenylist) {
    if (requestKeywordDenylist === undefined) {
      requestKeywordDenylist = requestKeywordDenylist.default;
    } else if (!Array.isArray(requestKeywordDenylist)) {
      throw 'Parse Server option requestKeywordDenylist must be an array.';
    }
  }
  static validateEnforcePrivateUsers(enforcePrivateUsers) {
    if (typeof enforcePrivateUsers !== 'boolean') {
      throw 'Parse Server option enforcePrivateUsers must be a boolean.';
    }
  }
  static validateAllowExpiredAuthDataToken(allowExpiredAuthDataToken) {
    if (typeof allowExpiredAuthDataToken !== 'boolean') {
      throw 'Parse Server option allowExpiredAuthDataToken must be a boolean.';
    }
  }
  static validateSecurityOptions(security) {
    if (Object.prototype.toString.call(security) !== '[object Object]') {
      throw 'Parse Server option security must be an object.';
    }
    if (security.enableCheck === undefined) {
      security.enableCheck = _Definitions.SecurityOptions.enableCheck.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheck)) {
      throw 'Parse Server option security.enableCheck must be a boolean.';
    }
    if (security.enableCheckLog === undefined) {
      security.enableCheckLog = _Definitions.SecurityOptions.enableCheckLog.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheckLog)) {
      throw 'Parse Server option security.enableCheckLog must be a boolean.';
    }
  }
  static validateSchemaOptions(schema) {
    if (!schema) return;
    if (Object.prototype.toString.call(schema) !== '[object Object]') {
      throw 'Parse Server option schema must be an object.';
    }
    if (schema.definitions === undefined) {
      schema.definitions = _Definitions.SchemaOptions.definitions.default;
    } else if (!Array.isArray(schema.definitions)) {
      throw 'Parse Server option schema.definitions must be an array.';
    }
    if (schema.strict === undefined) {
      schema.strict = _Definitions.SchemaOptions.strict.default;
    } else if (!(0, _lodash.isBoolean)(schema.strict)) {
      throw 'Parse Server option schema.strict must be a boolean.';
    }
    if (schema.deleteExtraFields === undefined) {
      schema.deleteExtraFields = _Definitions.SchemaOptions.deleteExtraFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.deleteExtraFields)) {
      throw 'Parse Server option schema.deleteExtraFields must be a boolean.';
    }
    if (schema.recreateModifiedFields === undefined) {
      schema.recreateModifiedFields = _Definitions.SchemaOptions.recreateModifiedFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.recreateModifiedFields)) {
      throw 'Parse Server option schema.recreateModifiedFields must be a boolean.';
    }
    if (schema.lockSchemas === undefined) {
      schema.lockSchemas = _Definitions.SchemaOptions.lockSchemas.default;
    } else if (!(0, _lodash.isBoolean)(schema.lockSchemas)) {
      throw 'Parse Server option schema.lockSchemas must be a boolean.';
    }
    if (schema.beforeMigration === undefined) {
      schema.beforeMigration = null;
    } else if (schema.beforeMigration !== null && typeof schema.beforeMigration !== 'function') {
      throw 'Parse Server option schema.beforeMigration must be a function.';
    }
    if (schema.afterMigration === undefined) {
      schema.afterMigration = null;
    } else if (schema.afterMigration !== null && typeof schema.afterMigration !== 'function') {
      throw 'Parse Server option schema.afterMigration must be a function.';
    }
  }
  static validatePagesOptions(pages) {
    if (Object.prototype.toString.call(pages) !== '[object Object]') {
      throw 'Parse Server option pages must be an object.';
    }
    if (pages.enableRouter === undefined) {
      pages.enableRouter = _Definitions.PagesOptions.enableRouter.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableRouter)) {
      throw 'Parse Server option pages.enableRouter must be a boolean.';
    }
    if (pages.enableLocalization === undefined) {
      pages.enableLocalization = _Definitions.PagesOptions.enableLocalization.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableLocalization)) {
      throw 'Parse Server option pages.enableLocalization must be a boolean.';
    }
    if (pages.localizationJsonPath === undefined) {
      pages.localizationJsonPath = _Definitions.PagesOptions.localizationJsonPath.default;
    } else if (!(0, _lodash.isString)(pages.localizationJsonPath)) {
      throw 'Parse Server option pages.localizationJsonPath must be a string.';
    }
    if (pages.localizationFallbackLocale === undefined) {
      pages.localizationFallbackLocale = _Definitions.PagesOptions.localizationFallbackLocale.default;
    } else if (!(0, _lodash.isString)(pages.localizationFallbackLocale)) {
      throw 'Parse Server option pages.localizationFallbackLocale must be a string.';
    }
    if (pages.placeholders === undefined) {
      pages.placeholders = _Definitions.PagesOptions.placeholders.default;
    } else if (Object.prototype.toString.call(pages.placeholders) !== '[object Object]' && typeof pages.placeholders !== 'function') {
      throw 'Parse Server option pages.placeholders must be an object or a function.';
    }
    if (pages.forceRedirect === undefined) {
      pages.forceRedirect = _Definitions.PagesOptions.forceRedirect.default;
    } else if (!(0, _lodash.isBoolean)(pages.forceRedirect)) {
      throw 'Parse Server option pages.forceRedirect must be a boolean.';
    }
    if (pages.pagesPath === undefined) {
      pages.pagesPath = _Definitions.PagesOptions.pagesPath.default;
    } else if (!(0, _lodash.isString)(pages.pagesPath)) {
      throw 'Parse Server option pages.pagesPath must be a string.';
    }
    if (pages.pagesEndpoint === undefined) {
      pages.pagesEndpoint = _Definitions.PagesOptions.pagesEndpoint.default;
    } else if (!(0, _lodash.isString)(pages.pagesEndpoint)) {
      throw 'Parse Server option pages.pagesEndpoint must be a string.';
    }
    if (pages.customUrls === undefined) {
      pages.customUrls = _Definitions.PagesOptions.customUrls.default;
    } else if (Object.prototype.toString.call(pages.customUrls) !== '[object Object]') {
      throw 'Parse Server option pages.customUrls must be an object.';
    }
    if (pages.customRoutes === undefined) {
      pages.customRoutes = _Definitions.PagesOptions.customRoutes.default;
    } else if (!(pages.customRoutes instanceof Array)) {
      throw 'Parse Server option pages.customRoutes must be an array.';
    }
  }
  static validateIdempotencyOptions(idempotencyOptions) {
    if (!idempotencyOptions) {
      return;
    }
    if (idempotencyOptions.ttl === undefined) {
      idempotencyOptions.ttl = _Definitions.IdempotencyOptions.ttl.default;
    } else if (!isNaN(idempotencyOptions.ttl) && idempotencyOptions.ttl <= 0) {
      throw 'idempotency TTL value must be greater than 0 seconds';
    } else if (isNaN(idempotencyOptions.ttl)) {
      throw 'idempotency TTL value must be a number';
    }
    if (!idempotencyOptions.paths) {
      idempotencyOptions.paths = _Definitions.IdempotencyOptions.paths.default;
    } else if (!(idempotencyOptions.paths instanceof Array)) {
      throw 'idempotency paths must be of an array of strings';
    }
  }
  static validateAccountLockoutPolicy(accountLockout) {
    if (accountLockout) {
      if (typeof accountLockout.duration !== 'number' || accountLockout.duration <= 0 || accountLockout.duration > 99999) {
        throw 'Account lockout duration should be greater than 0 and less than 100000';
      }
      if (!Number.isInteger(accountLockout.threshold) || accountLockout.threshold < 1 || accountLockout.threshold > 999) {
        throw 'Account lockout threshold should be an integer greater than 0 and less than 1000';
      }
      if (accountLockout.unlockOnPasswordReset === undefined) {
        accountLockout.unlockOnPasswordReset = _Definitions.AccountLockoutOptions.unlockOnPasswordReset.default;
      } else if (!(0, _lodash.isBoolean)(accountLockout.unlockOnPasswordReset)) {
        throw 'Parse Server option accountLockout.unlockOnPasswordReset must be a boolean.';
      }
    }
  }
  static validatePasswordPolicy(passwordPolicy) {
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
      if (passwordPolicy.resetTokenReuseIfValid && typeof passwordPolicy.resetTokenReuseIfValid !== 'boolean') {
        throw 'resetTokenReuseIfValid must be a boolean value';
      }
      if (passwordPolicy.resetTokenReuseIfValid && !passwordPolicy.resetTokenValidityDuration) {
        throw 'You cannot use resetTokenReuseIfValid without resetTokenValidityDuration';
      }
      if (passwordPolicy.resetPasswordSuccessOnInvalidEmail && typeof passwordPolicy.resetPasswordSuccessOnInvalidEmail !== 'boolean') {
        throw 'resetPasswordSuccessOnInvalidEmail must be a boolean value';
      }
    }
  }

  // if the passwordPolicy.validatorPattern is configured then setup a callback to process the pattern
  static setupPasswordValidator(passwordPolicy) {
    if (passwordPolicy && passwordPolicy.validatorPattern) {
      passwordPolicy.patternValidator = value => {
        return passwordPolicy.validatorPattern.test(value);
      };
    }
  }
  static validateEmailConfiguration({
    emailAdapter,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid
  }) {
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
    if (emailVerifyTokenReuseIfValid && typeof emailVerifyTokenReuseIfValid !== 'boolean') {
      throw 'emailVerifyTokenReuseIfValid must be a boolean value';
    }
    if (emailVerifyTokenReuseIfValid && !emailVerifyTokenValidityDuration) {
      throw 'You cannot use emailVerifyTokenReuseIfValid without emailVerifyTokenValidityDuration';
    }
  }
  static validateFileUploadOptions(fileUpload) {
    try {
      if (fileUpload == null || typeof fileUpload !== 'object' || fileUpload instanceof Array) {
        throw 'fileUpload must be an object value.';
      }
    } catch (e) {
      if (e instanceof ReferenceError) {
        return;
      }
      throw e;
    }
    if (fileUpload.enableForAnonymousUser === undefined) {
      fileUpload.enableForAnonymousUser = _Definitions.FileUploadOptions.enableForAnonymousUser.default;
    } else if (typeof fileUpload.enableForAnonymousUser !== 'boolean') {
      throw 'fileUpload.enableForAnonymousUser must be a boolean value.';
    }
    if (fileUpload.enableForPublic === undefined) {
      fileUpload.enableForPublic = _Definitions.FileUploadOptions.enableForPublic.default;
    } else if (typeof fileUpload.enableForPublic !== 'boolean') {
      throw 'fileUpload.enableForPublic must be a boolean value.';
    }
    if (fileUpload.enableForAuthenticatedUser === undefined) {
      fileUpload.enableForAuthenticatedUser = _Definitions.FileUploadOptions.enableForAuthenticatedUser.default;
    } else if (typeof fileUpload.enableForAuthenticatedUser !== 'boolean') {
      throw 'fileUpload.enableForAuthenticatedUser must be a boolean value.';
    }
    if (fileUpload.fileExtensions === undefined) {
      fileUpload.fileExtensions = _Definitions.FileUploadOptions.fileExtensions.default;
    } else if (!Array.isArray(fileUpload.fileExtensions)) {
      throw 'fileUpload.fileExtensions must be an array.';
    }
  }
  static validateIps(field, masterKeyIps) {
    for (let ip of masterKeyIps) {
      if (ip.includes('/')) {
        ip = ip.split('/')[0];
      }
      if (!_net.default.isIP(ip)) {
        throw `The Parse Server option "${field}" contains an invalid IP address "${ip}".`;
      }
    }
  }
  get mount() {
    var mount = this._mount;
    if (this.publicServerURL) {
      mount = this.publicServerURL;
    }
    return mount;
  }
  set mount(newValue) {
    this._mount = newValue;
  }
  static validateSessionConfiguration(sessionLength, expireInactiveSessions) {
    if (expireInactiveSessions) {
      if (isNaN(sessionLength)) {
        throw 'Session length must be a valid number.';
      } else if (sessionLength <= 0) {
        throw 'Session length must be a value greater than 0.';
      }
    }
  }
  static validateDefaultLimit(defaultLimit) {
    if (defaultLimit == null) {
      defaultLimit = _Definitions.ParseServerOptions.defaultLimit.default;
    }
    if (typeof defaultLimit !== 'number') {
      throw 'Default limit must be a number.';
    }
    if (defaultLimit <= 0) {
      throw 'Default limit must be a value greater than 0.';
    }
  }
  static validateMaxLimit(maxLimit) {
    if (maxLimit <= 0) {
      throw 'Max limit must be a value greater than 0.';
    }
  }
  static validateAllowHeaders(allowHeaders) {
    if (![null, undefined].includes(allowHeaders)) {
      if (Array.isArray(allowHeaders)) {
        allowHeaders.forEach(header => {
          if (typeof header !== 'string') {
            throw 'Allow headers must only contain strings';
          } else if (!header.trim().length) {
            throw 'Allow headers must not contain empty strings';
          }
        });
      } else {
        throw 'Allow headers must be an array';
      }
    }
  }
  static validateLogLevels(logLevels) {
    for (const key of Object.keys(_Definitions.LogLevels)) {
      if (logLevels[key]) {
        if (_LoggerController.logLevels.indexOf(logLevels[key]) === -1) {
          throw `'${key}' must be one of ${JSON.stringify(_LoggerController.logLevels)}`;
        }
      } else {
        logLevels[key] = _Definitions.LogLevels[key].default;
      }
    }
  }
  static validateDatabaseOptions(databaseOptions) {
    if (databaseOptions == undefined) {
      return;
    }
    if (Object.prototype.toString.call(databaseOptions) !== '[object Object]') {
      throw `databaseOptions must be an object`;
    }
    if (databaseOptions.enableSchemaHooks === undefined) {
      databaseOptions.enableSchemaHooks = _Definitions.DatabaseOptions.enableSchemaHooks.default;
    } else if (typeof databaseOptions.enableSchemaHooks !== 'boolean') {
      throw `databaseOptions.enableSchemaHooks must be a boolean`;
    }
    if (databaseOptions.schemaCacheTtl === undefined) {
      databaseOptions.schemaCacheTtl = _Definitions.DatabaseOptions.schemaCacheTtl.default;
    } else if (typeof databaseOptions.schemaCacheTtl !== 'number') {
      throw `databaseOptions.schemaCacheTtl must be a number`;
    }
  }
  static validateRateLimit(rateLimit) {
    if (!rateLimit) {
      return;
    }
    if (Object.prototype.toString.call(rateLimit) !== '[object Object]' && !Array.isArray(rateLimit)) {
      throw `rateLimit must be an array or object`;
    }
    const options = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const option of options) {
      if (Object.prototype.toString.call(option) !== '[object Object]') {
        throw `rateLimit must be an array of objects`;
      }
      if (option.requestPath == null) {
        throw `rateLimit.requestPath must be defined`;
      }
      if (typeof option.requestPath !== 'string') {
        throw `rateLimit.requestPath must be a string`;
      }
      if (option.requestTimeWindow == null) {
        throw `rateLimit.requestTimeWindow must be defined`;
      }
      if (typeof option.requestTimeWindow !== 'number') {
        throw `rateLimit.requestTimeWindow must be a number`;
      }
      if (option.includeInternalRequests && typeof option.includeInternalRequests !== 'boolean') {
        throw `rateLimit.includeInternalRequests must be a boolean`;
      }
      if (option.requestCount == null) {
        throw `rateLimit.requestCount must be defined`;
      }
      if (typeof option.requestCount !== 'number') {
        throw `rateLimit.requestCount must be a number`;
      }
      if (option.errorResponseMessage && typeof option.errorResponseMessage !== 'string') {
        throw `rateLimit.errorResponseMessage must be a string`;
      }
      const options = Object.keys(_Parse.default.RateLimitZone);
      if (option.zone && !options.includes(option.zone)) {
        const formatter = new Intl.ListFormat('en', {
          style: 'short',
          type: 'disjunction'
        });
        throw `rateLimit.zone must be one of ${formatter.format(options)}`;
      }
    }
  }
  generateEmailVerifyTokenExpiresAt() {
    if (!this.verifyUserEmails || !this.emailVerifyTokenValidityDuration) {
      return undefined;
    }
    var now = new Date();
    return new Date(now.getTime() + this.emailVerifyTokenValidityDuration * 1000);
  }
  generatePasswordResetTokenExpiresAt() {
    if (!this.passwordPolicy || !this.passwordPolicy.resetTokenValidityDuration) {
      return undefined;
    }
    const now = new Date();
    return new Date(now.getTime() + this.passwordPolicy.resetTokenValidityDuration * 1000);
  }
  generateSessionExpiresAt() {
    if (!this.expireInactiveSessions) {
      return undefined;
    }
    var now = new Date();
    return new Date(now.getTime() + this.sessionLength * 1000);
  }
  unregisterRateLimiters() {
    var _this$rateLimits;
    let i = (_this$rateLimits = this.rateLimits) === null || _this$rateLimits === void 0 ? void 0 : _this$rateLimits.length;
    while (i--) {
      const limit = this.rateLimits[i];
      if (limit.cloud) {
        this.rateLimits.splice(i, 1);
      }
    }
  }
  get invalidLinkURL() {
    return this.customPages.invalidLink || `${this.publicServerURL}/apps/invalid_link.html`;
  }
  get invalidVerificationLinkURL() {
    return this.customPages.invalidVerificationLink || `${this.publicServerURL}/apps/invalid_verification_link.html`;
  }
  get linkSendSuccessURL() {
    return this.customPages.linkSendSuccess || `${this.publicServerURL}/apps/link_send_success.html`;
  }
  get linkSendFailURL() {
    return this.customPages.linkSendFail || `${this.publicServerURL}/apps/link_send_fail.html`;
  }
  get verifyEmailSuccessURL() {
    return this.customPages.verifyEmailSuccess || `${this.publicServerURL}/apps/verify_email_success.html`;
  }
  get choosePasswordURL() {
    return this.customPages.choosePassword || `${this.publicServerURL}/apps/choose_password`;
  }
  get requestResetPasswordURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/request_password_reset`;
  }
  get passwordResetSuccessURL() {
    return this.customPages.passwordResetSuccess || `${this.publicServerURL}/apps/password_reset_success.html`;
  }
  get parseFrameURL() {
    return this.customPages.parseFrameURL;
  }
  get verifyEmailURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/verify_email`;
  }

  // TODO: Remove this function once PagesRouter replaces the PublicAPIRouter;
  // the (default) endpoint has to be defined in PagesRouter only.
  get pagesEndpoint() {
    return this.pages && this.pages.enableRouter && this.pages.pagesEndpoint ? this.pages.pagesEndpoint : 'apps';
  }
}
exports.Config = Config;
var _default = Config;
exports.default = _default;
module.exports = Config;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJyZW1vdmVUcmFpbGluZ1NsYXNoIiwic3RyIiwiZW5kc1dpdGgiLCJzdWJzdHJpbmciLCJsZW5ndGgiLCJDb25maWciLCJnZXQiLCJhcHBsaWNhdGlvbklkIiwibW91bnQiLCJjYWNoZUluZm8iLCJBcHBDYWNoZSIsImNvbmZpZyIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwia2V5IiwiZGF0YWJhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYmluZCIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInB1dCIsInNlcnZlckNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZU9wdGlvbnMiLCJ2YWxpZGF0ZUNvbnRyb2xsZXJzIiwiYXBwSWQiLCJzZXR1cFBhc3N3b3JkVmFsaWRhdG9yIiwicGFzc3dvcmRQb2xpY3kiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IiwiZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyIsInNlc3Npb25MZW5ndGgiLCJkZWZhdWx0TGltaXQiLCJtYXhMaW1pdCIsImFjY291bnRMb2Nrb3V0IiwibWFzdGVyS2V5SXBzIiwibWFzdGVyS2V5IiwibWFpbnRlbmFuY2VLZXkiLCJtYWludGVuYW5jZUtleUlwcyIsInJlYWRPbmx5TWFzdGVyS2V5IiwiYWxsb3dIZWFkZXJzIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwiZmlsZVVwbG9hZCIsInBhZ2VzIiwic2VjdXJpdHkiLCJlbmZvcmNlUHJpdmF0ZVVzZXJzIiwic2NoZW1hIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4iLCJsb2dMZXZlbHMiLCJyYXRlTGltaXQiLCJkYXRhYmFzZU9wdGlvbnMiLCJleHRlbmRTZXNzaW9uT25Vc2UiLCJFcnJvciIsInZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3kiLCJ2YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwidmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyIsInN0YXJ0c1dpdGgiLCJ2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uIiwidmFsaWRhdGVJcHMiLCJ2YWxpZGF0ZURlZmF1bHRMaW1pdCIsInZhbGlkYXRlTWF4TGltaXQiLCJ2YWxpZGF0ZUFsbG93SGVhZGVycyIsInZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zIiwidmFsaWRhdGVQYWdlc09wdGlvbnMiLCJ2YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyIsInZhbGlkYXRlU2NoZW1hT3B0aW9ucyIsInZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyIsInZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiIsInZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdCIsInZhbGlkYXRlUmF0ZUxpbWl0IiwidmFsaWRhdGVMb2dMZXZlbHMiLCJ2YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyIsInZlcmlmeVVzZXJFbWFpbHMiLCJ1c2VyQ29udHJvbGxlciIsImFwcE5hbWUiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJlbWFpbEFkYXB0ZXIiLCJ2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbiIsInVuZGVmaW5lZCIsImRlZmF1bHQiLCJBcnJheSIsImlzQXJyYXkiLCJwcm90b3R5cGUiLCJ0b1N0cmluZyIsImNhbGwiLCJlbmFibGVDaGVjayIsIlNlY3VyaXR5T3B0aW9ucyIsImlzQm9vbGVhbiIsImVuYWJsZUNoZWNrTG9nIiwiZGVmaW5pdGlvbnMiLCJTY2hlbWFPcHRpb25zIiwic3RyaWN0IiwiZGVsZXRlRXh0cmFGaWVsZHMiLCJyZWNyZWF0ZU1vZGlmaWVkRmllbGRzIiwibG9ja1NjaGVtYXMiLCJiZWZvcmVNaWdyYXRpb24iLCJhZnRlck1pZ3JhdGlvbiIsImVuYWJsZVJvdXRlciIsIlBhZ2VzT3B0aW9ucyIsImVuYWJsZUxvY2FsaXphdGlvbiIsImxvY2FsaXphdGlvbkpzb25QYXRoIiwiaXNTdHJpbmciLCJsb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSIsInBsYWNlaG9sZGVycyIsImZvcmNlUmVkaXJlY3QiLCJwYWdlc1BhdGgiLCJwYWdlc0VuZHBvaW50IiwiY3VzdG9tVXJscyIsImN1c3RvbVJvdXRlcyIsInR0bCIsIklkZW1wb3RlbmN5T3B0aW9ucyIsImlzTmFOIiwicGF0aHMiLCJkdXJhdGlvbiIsIk51bWJlciIsImlzSW50ZWdlciIsInRocmVzaG9sZCIsInVubG9ja09uUGFzc3dvcmRSZXNldCIsIkFjY291bnRMb2Nrb3V0T3B0aW9ucyIsIm1heFBhc3N3b3JkQWdlIiwicmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJ2YWxpZGF0b3JQYXR0ZXJuIiwiUmVnRXhwIiwidmFsaWRhdG9yQ2FsbGJhY2siLCJkb05vdEFsbG93VXNlcm5hbWUiLCJtYXhQYXNzd29yZEhpc3RvcnkiLCJyZXNldFRva2VuUmV1c2VJZlZhbGlkIiwicmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWx1ZSIsInRlc3QiLCJlIiwiUmVmZXJlbmNlRXJyb3IiLCJlbmFibGVGb3JBbm9ueW1vdXNVc2VyIiwiRmlsZVVwbG9hZE9wdGlvbnMiLCJlbmFibGVGb3JQdWJsaWMiLCJlbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciIsImZpbGVFeHRlbnNpb25zIiwiZmllbGQiLCJpcCIsImluY2x1ZGVzIiwic3BsaXQiLCJuZXQiLCJpc0lQIiwiX21vdW50IiwibmV3VmFsdWUiLCJQYXJzZVNlcnZlck9wdGlvbnMiLCJoZWFkZXIiLCJ0cmltIiwiTG9nTGV2ZWxzIiwidmFsaWRMb2dMZXZlbHMiLCJpbmRleE9mIiwiSlNPTiIsInN0cmluZ2lmeSIsImVuYWJsZVNjaGVtYUhvb2tzIiwiRGF0YWJhc2VPcHRpb25zIiwic2NoZW1hQ2FjaGVUdGwiLCJvcHRpb25zIiwib3B0aW9uIiwicmVxdWVzdFBhdGgiLCJyZXF1ZXN0VGltZVdpbmRvdyIsImluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzIiwicmVxdWVzdENvdW50IiwiZXJyb3JSZXNwb25zZU1lc3NhZ2UiLCJQYXJzZVNlcnZlciIsIlJhdGVMaW1pdFpvbmUiLCJ6b25lIiwiZm9ybWF0dGVyIiwiSW50bCIsIkxpc3RGb3JtYXQiLCJzdHlsZSIsInR5cGUiLCJmb3JtYXQiLCJub3ciLCJEYXRlIiwiZ2V0VGltZSIsImdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0IiwidW5yZWdpc3RlclJhdGVMaW1pdGVycyIsImkiLCJyYXRlTGltaXRzIiwibGltaXQiLCJjbG91ZCIsInNwbGljZSIsImludmFsaWRMaW5rVVJMIiwiY3VzdG9tUGFnZXMiLCJpbnZhbGlkTGluayIsImludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmsiLCJsaW5rU2VuZFN1Y2Nlc3NVUkwiLCJsaW5rU2VuZFN1Y2Nlc3MiLCJsaW5rU2VuZEZhaWxVUkwiLCJsaW5rU2VuZEZhaWwiLCJ2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwiLCJ2ZXJpZnlFbWFpbFN1Y2Nlc3MiLCJjaG9vc2VQYXNzd29yZFVSTCIsImNob29zZVBhc3N3b3JkIiwicmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwiLCJwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzIiwicGFyc2VGcmFtZVVSTCIsInZlcmlmeUVtYWlsVVJMIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9Db25maWcuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQSBDb25maWcgb2JqZWN0IHByb3ZpZGVzIGluZm9ybWF0aW9uIGFib3V0IGhvdyBhIHNwZWNpZmljIGFwcCBpc1xuLy8gY29uZmlndXJlZC5cbi8vIG1vdW50IGlzIHRoZSBVUkwgZm9yIHRoZSByb290IG9mIHRoZSBBUEk7IGluY2x1ZGVzIGh0dHAsIGRvbWFpbiwgZXRjLlxuXG5pbXBvcnQgeyBpc0Jvb2xlYW4sIGlzU3RyaW5nIH0gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBuZXQgZnJvbSAnbmV0JztcbmltcG9ydCBBcHBDYWNoZSBmcm9tICcuL2NhY2hlJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgbG9nTGV2ZWxzIGFzIHZhbGlkTG9nTGV2ZWxzIH0gZnJvbSAnLi9Db250cm9sbGVycy9Mb2dnZXJDb250cm9sbGVyJztcbmltcG9ydCB7XG4gIEFjY291bnRMb2Nrb3V0T3B0aW9ucyxcbiAgRGF0YWJhc2VPcHRpb25zLFxuICBGaWxlVXBsb2FkT3B0aW9ucyxcbiAgSWRlbXBvdGVuY3lPcHRpb25zLFxuICBMb2dMZXZlbHMsXG4gIFBhZ2VzT3B0aW9ucyxcbiAgUGFyc2VTZXJ2ZXJPcHRpb25zLFxuICBTY2hlbWFPcHRpb25zLFxuICBTZWN1cml0eU9wdGlvbnMsXG59IGZyb20gJy4vT3B0aW9ucy9EZWZpbml0aW9ucyc7XG5pbXBvcnQgUGFyc2VTZXJ2ZXIgZnJvbSAnLi9jbG91ZC1jb2RlL1BhcnNlLlNlcnZlcic7XG5cbmZ1bmN0aW9uIHJlbW92ZVRyYWlsaW5nU2xhc2goc3RyKSB7XG4gIGlmICghc3RyKSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxuICBpZiAoc3RyLmVuZHNXaXRoKCcvJykpIHtcbiAgICBzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIHN0ci5sZW5ndGggLSAxKTtcbiAgfVxuICByZXR1cm4gc3RyO1xufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlnIHtcbiAgc3RhdGljIGdldChhcHBsaWNhdGlvbklkOiBzdHJpbmcsIG1vdW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCBjYWNoZUluZm8gPSBBcHBDYWNoZS5nZXQoYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCFjYWNoZUluZm8pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29uZmlnID0gbmV3IENvbmZpZygpO1xuICAgIGNvbmZpZy5hcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZDtcbiAgICBPYmplY3Qua2V5cyhjYWNoZUluZm8pLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgPT0gJ2RhdGFiYXNlQ29udHJvbGxlcicpIHtcbiAgICAgICAgY29uZmlnLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlQ29udHJvbGxlcihjYWNoZUluZm8uZGF0YWJhc2VDb250cm9sbGVyLmFkYXB0ZXIsIGNvbmZpZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25maWdba2V5XSA9IGNhY2hlSW5mb1trZXldO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbmZpZy5tb3VudCA9IHJlbW92ZVRyYWlsaW5nU2xhc2gobW91bnQpO1xuICAgIGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0LmJpbmQoY29uZmlnKTtcbiAgICBjb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdC5iaW5kKFxuICAgICAgY29uZmlnXG4gICAgKTtcbiAgICByZXR1cm4gY29uZmlnO1xuICB9XG5cbiAgc3RhdGljIHB1dChzZXJ2ZXJDb25maWd1cmF0aW9uKSB7XG4gICAgQ29uZmlnLnZhbGlkYXRlT3B0aW9ucyhzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBDb25maWcudmFsaWRhdGVDb250cm9sbGVycyhzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBBcHBDYWNoZS5wdXQoc2VydmVyQ29uZmlndXJhdGlvbi5hcHBJZCwgc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQ29uZmlnLnNldHVwUGFzc3dvcmRWYWxpZGF0b3Ioc2VydmVyQ29uZmlndXJhdGlvbi5wYXNzd29yZFBvbGljeSk7XG4gICAgcmV0dXJuIHNlcnZlckNvbmZpZ3VyYXRpb247XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVPcHRpb25zKHtcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgcmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCxcbiAgICBleHBpcmVJbmFjdGl2ZVNlc3Npb25zLFxuICAgIHNlc3Npb25MZW5ndGgsXG4gICAgZGVmYXVsdExpbWl0LFxuICAgIG1heExpbWl0LFxuICAgIGFjY291bnRMb2Nrb3V0LFxuICAgIHBhc3N3b3JkUG9saWN5LFxuICAgIG1hc3RlcktleUlwcyxcbiAgICBtYXN0ZXJLZXksXG4gICAgbWFpbnRlbmFuY2VLZXksXG4gICAgbWFpbnRlbmFuY2VLZXlJcHMsXG4gICAgcmVhZE9ubHlNYXN0ZXJLZXksXG4gICAgYWxsb3dIZWFkZXJzLFxuICAgIGlkZW1wb3RlbmN5T3B0aW9ucyxcbiAgICBmaWxlVXBsb2FkLFxuICAgIHBhZ2VzLFxuICAgIHNlY3VyaXR5LFxuICAgIGVuZm9yY2VQcml2YXRlVXNlcnMsXG4gICAgc2NoZW1hLFxuICAgIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QsXG4gICAgYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbixcbiAgICBsb2dMZXZlbHMsXG4gICAgcmF0ZUxpbWl0LFxuICAgIGRhdGFiYXNlT3B0aW9ucyxcbiAgICBleHRlbmRTZXNzaW9uT25Vc2UsXG4gIH0pIHtcbiAgICBpZiAobWFzdGVyS2V5ID09PSByZWFkT25seU1hc3RlcktleSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXN0ZXJLZXkgYW5kIHJlYWRPbmx5TWFzdGVyS2V5IHNob3VsZCBiZSBkaWZmZXJlbnQnKTtcbiAgICB9XG5cbiAgICBpZiAobWFzdGVyS2V5ID09PSBtYWludGVuYW5jZUtleSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXN0ZXJLZXkgYW5kIG1haW50ZW5hbmNlS2V5IHNob3VsZCBiZSBkaWZmZXJlbnQnKTtcbiAgICB9XG5cbiAgICB0aGlzLnZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3koYWNjb3VudExvY2tvdXQpO1xuICAgIHRoaXMudmFsaWRhdGVQYXNzd29yZFBvbGljeShwYXNzd29yZFBvbGljeSk7XG4gICAgdGhpcy52YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zKGZpbGVVcGxvYWQpO1xuXG4gICAgaWYgKHR5cGVvZiByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0ICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGV4dGVuZFNlc3Npb25PblVzZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZXh0ZW5kU2Vzc2lvbk9uVXNlIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG5cbiAgICBpZiAocHVibGljU2VydmVyVVJMKSB7XG4gICAgICBpZiAoIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwOi8vJykgJiYgIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XG4gICAgICAgIHRocm93ICdwdWJsaWNTZXJ2ZXJVUkwgc2hvdWxkIGJlIGEgdmFsaWQgSFRUUFMgVVJMIHN0YXJ0aW5nIHdpdGggaHR0cHM6Ly8nO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24oc2Vzc2lvbkxlbmd0aCwgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZUlwcygnbWFzdGVyS2V5SXBzJywgbWFzdGVyS2V5SXBzKTtcbiAgICB0aGlzLnZhbGlkYXRlSXBzKCdtYWludGVuYW5jZUtleUlwcycsIG1haW50ZW5hbmNlS2V5SXBzKTtcbiAgICB0aGlzLnZhbGlkYXRlRGVmYXVsdExpbWl0KGRlZmF1bHRMaW1pdCk7XG4gICAgdGhpcy52YWxpZGF0ZU1heExpbWl0KG1heExpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dIZWFkZXJzKGFsbG93SGVhZGVycyk7XG4gICAgdGhpcy52YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpO1xuICAgIHRoaXMudmFsaWRhdGVTZWN1cml0eU9wdGlvbnMoc2VjdXJpdHkpO1xuICAgIHRoaXMudmFsaWRhdGVTY2hlbWFPcHRpb25zKHNjaGVtYSk7XG4gICAgdGhpcy52YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMoZW5mb3JjZVByaXZhdGVVc2Vycyk7XG4gICAgdGhpcy52YWxpZGF0ZUFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4oYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbik7XG4gICAgdGhpcy52YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QocmVxdWVzdEtleXdvcmREZW55bGlzdCk7XG4gICAgdGhpcy52YWxpZGF0ZVJhdGVMaW1pdChyYXRlTGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVMb2dMZXZlbHMobG9nTGV2ZWxzKTtcbiAgICB0aGlzLnZhbGlkYXRlRGF0YWJhc2VPcHRpb25zKGRhdGFiYXNlT3B0aW9ucyk7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVDb250cm9sbGVycyh7XG4gICAgdmVyaWZ5VXNlckVtYWlscyxcbiAgICB1c2VyQ29udHJvbGxlcixcbiAgICBhcHBOYW1lLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICB9KSB7XG4gICAgY29uc3QgZW1haWxBZGFwdGVyID0gdXNlckNvbnRyb2xsZXIuYWRhcHRlcjtcbiAgICBpZiAodmVyaWZ5VXNlckVtYWlscykge1xuICAgICAgdGhpcy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcixcbiAgICAgICAgYXBwTmFtZSxcbiAgICAgICAgcHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QocmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgIGlmIChyZXF1ZXN0S2V5d29yZERlbnlsaXN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgPSByZXF1ZXN0S2V5d29yZERlbnlsaXN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShyZXF1ZXN0S2V5d29yZERlbnlsaXN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcmVxdWVzdEtleXdvcmREZW55bGlzdCBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgaWYgKHR5cGVvZiBlbmZvcmNlUHJpdmF0ZVVzZXJzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGVuZm9yY2VQcml2YXRlVXNlcnMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4pIHtcbiAgICBpZiAodHlwZW9mIGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4gIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyhzZWN1cml0eSkge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2VjdXJpdHkpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHNlY3VyaXR5LmVuYWJsZUNoZWNrID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNlY3VyaXR5LmVuYWJsZUNoZWNrID0gU2VjdXJpdHlPcHRpb25zLmVuYWJsZUNoZWNrLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNlY3VyaXR5LmVuYWJsZUNoZWNrKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkuZW5hYmxlQ2hlY2sgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nID0gU2VjdXJpdHlPcHRpb25zLmVuYWJsZUNoZWNrTG9nLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTY2hlbWFPcHRpb25zKHNjaGVtYTogU2NoZW1hT3B0aW9ucykge1xuICAgIGlmICghc2NoZW1hKSByZXR1cm47XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzY2hlbWEpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuZGVmaW5pdGlvbnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmRlZmluaXRpb25zID0gU2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkoc2NoZW1hLmRlZmluaXRpb25zKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmRlZmluaXRpb25zIG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5zdHJpY3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLnN0cmljdCA9IFNjaGVtYU9wdGlvbnMuc3RyaWN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5zdHJpY3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuc3RyaWN0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzID0gU2NoZW1hT3B0aW9ucy5kZWxldGVFeHRyYUZpZWxkcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzID0gU2NoZW1hT3B0aW9ucy5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5sb2NrU2NoZW1hcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEubG9ja1NjaGVtYXMgPSBTY2hlbWFPcHRpb25zLmxvY2tTY2hlbWFzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5sb2NrU2NoZW1hcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5sb2NrU2NoZW1hcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuYmVmb3JlTWlncmF0aW9uID0gbnVsbDtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gIT09IG51bGwgJiYgdHlwZW9mIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmFmdGVyTWlncmF0aW9uID0gbnVsbDtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYS5hZnRlck1pZ3JhdGlvbiAhPT0gbnVsbCAmJiB0eXBlb2Ygc2NoZW1hLmFmdGVyTWlncmF0aW9uICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUGFnZXNPcHRpb25zKHBhZ2VzKSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcyBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZW5hYmxlUm91dGVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmVuYWJsZVJvdXRlciA9IFBhZ2VzT3B0aW9ucy5lbmFibGVSb3V0ZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZW5hYmxlUm91dGVyKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZW5hYmxlUm91dGVyIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uID0gUGFnZXNPcHRpb25zLmVuYWJsZUxvY2FsaXphdGlvbi5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24pKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoID0gUGFnZXNPcHRpb25zLmxvY2FsaXphdGlvbkpzb25QYXRoLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGgpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSA9IFBhZ2VzT3B0aW9ucy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZS5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGxhY2Vob2xkZXJzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBsYWNlaG9sZGVycyA9IFBhZ2VzT3B0aW9ucy5wbGFjZWhvbGRlcnMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzLnBsYWNlaG9sZGVycykgIT09ICdbb2JqZWN0IE9iamVjdF0nICYmXG4gICAgICB0eXBlb2YgcGFnZXMucGxhY2Vob2xkZXJzICE9PSAnZnVuY3Rpb24nXG4gICAgKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wbGFjZWhvbGRlcnMgbXVzdCBiZSBhbiBvYmplY3Qgb3IgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZm9yY2VSZWRpcmVjdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5mb3JjZVJlZGlyZWN0ID0gUGFnZXNPcHRpb25zLmZvcmNlUmVkaXJlY3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZm9yY2VSZWRpcmVjdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmZvcmNlUmVkaXJlY3QgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBhZ2VzUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wYWdlc1BhdGggPSBQYWdlc09wdGlvbnMucGFnZXNQYXRoLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMucGFnZXNQYXRoKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGFnZXNQYXRoIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGFnZXNFbmRwb2ludCA9IFBhZ2VzT3B0aW9ucy5wYWdlc0VuZHBvaW50LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMucGFnZXNFbmRwb2ludCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBhZ2VzRW5kcG9pbnQgbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuY3VzdG9tVXJscyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5jdXN0b21VcmxzID0gUGFnZXNPcHRpb25zLmN1c3RvbVVybHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcy5jdXN0b21VcmxzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmN1c3RvbVVybHMgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmN1c3RvbVJvdXRlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5jdXN0b21Sb3V0ZXMgPSBQYWdlc09wdGlvbnMuY3VzdG9tUm91dGVzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghKHBhZ2VzLmN1c3RvbVJvdXRlcyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuY3VzdG9tUm91dGVzIG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMoaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgaWYgKCFpZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA9IElkZW1wb3RlbmN5T3B0aW9ucy50dGwuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc05hTihpZGVtcG90ZW5jeU9wdGlvbnMudHRsKSAmJiBpZGVtcG90ZW5jeU9wdGlvbnMudHRsIDw9IDApIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBUVEwgdmFsdWUgbXVzdCBiZSBncmVhdGVyIHRoYW4gMCBzZWNvbmRzJztcbiAgICB9IGVsc2UgaWYgKGlzTmFOKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwpKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgVFRMIHZhbHVlIG11c3QgYmUgYSBudW1iZXInO1xuICAgIH1cbiAgICBpZiAoIWlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocykge1xuICAgICAgaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzID0gSWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghKGlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IHBhdGhzIG11c3QgYmUgb2YgYW4gYXJyYXkgb2Ygc3RyaW5ncyc7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3koYWNjb3VudExvY2tvdXQpIHtcbiAgICBpZiAoYWNjb3VudExvY2tvdXQpIHtcbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uICE9PSAnbnVtYmVyJyB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC5kdXJhdGlvbiA8PSAwIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uID4gOTk5OTlcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAnQWNjb3VudCBsb2Nrb3V0IGR1cmF0aW9uIHNob3VsZCBiZSBncmVhdGVyIHRoYW4gMCBhbmQgbGVzcyB0aGFuIDEwMDAwMCc7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgIU51bWJlci5pc0ludGVnZXIoYWNjb3VudExvY2tvdXQudGhyZXNob2xkKSB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC50aHJlc2hvbGQgPCAxIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCA+IDk5OVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdBY2NvdW50IGxvY2tvdXQgdGhyZXNob2xkIHNob3VsZCBiZSBhbiBpbnRlZ2VyIGdyZWF0ZXIgdGhhbiAwIGFuZCBsZXNzIHRoYW4gMTAwMCc7XG4gICAgICB9XG5cbiAgICAgIGlmIChhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQgPSBBY2NvdW50TG9ja291dE9wdGlvbnMudW5sb2NrT25QYXNzd29yZFJlc2V0LmRlZmF1bHQ7XG4gICAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0KSkge1xuICAgICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVQYXNzd29yZFBvbGljeShwYXNzd29yZFBvbGljeSkge1xuICAgIGlmIChwYXNzd29yZFBvbGljeSkge1xuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgIT09ICdudW1iZXInIHx8IHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlIDwgMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAodHlwZW9mIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICE9PSAnbnVtYmVyJyB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIDw9IDApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInO1xuICAgICAgfVxuXG4gICAgICBpZiAocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybikge1xuICAgICAgICBpZiAodHlwZW9mIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiA9IG5ldyBSZWdFeHAocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybik7XG4gICAgICAgIH0gZWxzZSBpZiAoIShwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuIGluc3RhbmNlb2YgUmVnRXhwKSkge1xuICAgICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuIG11c3QgYmUgYSByZWdleCBzdHJpbmcgb3IgUmVnRXhwIG9iamVjdC4nO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICE9PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5ICYmXG4gICAgICAgICghTnVtYmVyLmlzSW50ZWdlcihwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkpIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IDw9IDAgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgPiAyMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IG11c3QgYmUgYW4gaW50ZWdlciByYW5naW5nIDAgLSAyMCc7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Jlc2V0VG9rZW5SZXVzZUlmVmFsaWQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgICAgfVxuICAgICAgaWYgKHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiYgIXBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICAgIHRocm93ICdZb3UgY2Fubm90IHVzZSByZXNldFRva2VuUmV1c2VJZlZhbGlkIHdpdGhvdXQgcmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24nO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LnJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdyZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBpcyBjb25maWd1cmVkIHRoZW4gc2V0dXAgYSBjYWxsYmFjayB0byBwcm9jZXNzIHRoZSBwYXR0ZXJuXG4gIHN0YXRpYyBzZXR1cFBhc3N3b3JkVmFsaWRhdG9yKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5ICYmIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pIHtcbiAgICAgIHBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IgPSB2YWx1ZSA9PiB7XG4gICAgICAgIHJldHVybiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuLnRlc3QodmFsdWUpO1xuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgIGVtYWlsQWRhcHRlcixcbiAgICBhcHBOYW1lLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICB9KSB7XG4gICAgaWYgKCFlbWFpbEFkYXB0ZXIpIHtcbiAgICAgIHRocm93ICdBbiBlbWFpbEFkYXB0ZXIgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGFwcE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQW4gYXBwIG5hbWUgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHB1YmxpY1NlcnZlclVSTCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93ICdBIHB1YmxpYyBzZXJ2ZXIgdXJsIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICBpZiAoaXNOYU4oZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pKSB7XG4gICAgICAgIHRocm93ICdFbWFpbCB2ZXJpZnkgdG9rZW4gdmFsaWRpdHkgZHVyYXRpb24gbXVzdCBiZSBhIHZhbGlkIG51bWJlci4nO1xuICAgICAgfSBlbHNlIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiA8PSAwKSB7XG4gICAgICAgIHRocm93ICdFbWFpbCB2ZXJpZnkgdG9rZW4gdmFsaWRpdHkgZHVyYXRpb24gbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmIHR5cGVvZiBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgJiYgIWVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICB0aHJvdyAnWW91IGNhbm5vdCB1c2UgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCB3aXRob3V0IGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyhmaWxlVXBsb2FkKSB7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChmaWxlVXBsb2FkID09IG51bGwgfHwgdHlwZW9mIGZpbGVVcGxvYWQgIT09ICdvYmplY3QnIHx8IGZpbGVVcGxvYWQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICB0aHJvdyAnZmlsZVVwbG9hZCBtdXN0IGJlIGFuIG9iamVjdCB2YWx1ZS4nO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlIGluc3RhbmNlb2YgUmVmZXJlbmNlRXJyb3IpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JBbm9ueW1vdXNVc2VyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yUHVibGljLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZmlsZUV4dGVuc2lvbnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5maWxlRXh0ZW5zaW9ucyA9IEZpbGVVcGxvYWRPcHRpb25zLmZpbGVFeHRlbnNpb25zLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zKSkge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZmlsZUV4dGVuc2lvbnMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUlwcyhmaWVsZCwgbWFzdGVyS2V5SXBzKSB7XG4gICAgZm9yIChsZXQgaXAgb2YgbWFzdGVyS2V5SXBzKSB7XG4gICAgICBpZiAoaXAuaW5jbHVkZXMoJy8nKSkge1xuICAgICAgICBpcCA9IGlwLnNwbGl0KCcvJylbMF07XG4gICAgICB9XG4gICAgICBpZiAoIW5ldC5pc0lQKGlwKSkge1xuICAgICAgICB0aHJvdyBgVGhlIFBhcnNlIFNlcnZlciBvcHRpb24gXCIke2ZpZWxkfVwiIGNvbnRhaW5zIGFuIGludmFsaWQgSVAgYWRkcmVzcyBcIiR7aXB9XCIuYDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbW91bnQoKSB7XG4gICAgdmFyIG1vdW50ID0gdGhpcy5fbW91bnQ7XG4gICAgaWYgKHRoaXMucHVibGljU2VydmVyVVJMKSB7XG4gICAgICBtb3VudCA9IHRoaXMucHVibGljU2VydmVyVVJMO1xuICAgIH1cbiAgICByZXR1cm4gbW91bnQ7XG4gIH1cblxuICBzZXQgbW91bnQobmV3VmFsdWUpIHtcbiAgICB0aGlzLl9tb3VudCA9IG5ld1ZhbHVlO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24oc2Vzc2lvbkxlbmd0aCwgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgIGlmIChleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICBpZiAoaXNOYU4oc2Vzc2lvbkxlbmd0aCkpIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoc2Vzc2lvbkxlbmd0aCA8PSAwKSB7XG4gICAgICAgIHRocm93ICdTZXNzaW9uIGxlbmd0aCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVEZWZhdWx0TGltaXQoZGVmYXVsdExpbWl0KSB7XG4gICAgaWYgKGRlZmF1bHRMaW1pdCA9PSBudWxsKSB7XG4gICAgICBkZWZhdWx0TGltaXQgPSBQYXJzZVNlcnZlck9wdGlvbnMuZGVmYXVsdExpbWl0LmRlZmF1bHQ7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZGVmYXVsdExpbWl0ICE9PSAnbnVtYmVyJykge1xuICAgICAgdGhyb3cgJ0RlZmF1bHQgbGltaXQgbXVzdCBiZSBhIG51bWJlci4nO1xuICAgIH1cbiAgICBpZiAoZGVmYXVsdExpbWl0IDw9IDApIHtcbiAgICAgIHRocm93ICdEZWZhdWx0IGxpbWl0IG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZU1heExpbWl0KG1heExpbWl0KSB7XG4gICAgaWYgKG1heExpbWl0IDw9IDApIHtcbiAgICAgIHRocm93ICdNYXggbGltaXQgbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWxsb3dIZWFkZXJzKGFsbG93SGVhZGVycykge1xuICAgIGlmICghW251bGwsIHVuZGVmaW5lZF0uaW5jbHVkZXMoYWxsb3dIZWFkZXJzKSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYWxsb3dIZWFkZXJzKSkge1xuICAgICAgICBhbGxvd0hlYWRlcnMuZm9yRWFjaChoZWFkZXIgPT4ge1xuICAgICAgICAgIGlmICh0eXBlb2YgaGVhZGVyICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBvbmx5IGNvbnRhaW4gc3RyaW5ncyc7XG4gICAgICAgICAgfSBlbHNlIGlmICghaGVhZGVyLnRyaW0oKS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgbm90IGNvbnRhaW4gZW1wdHkgc3RyaW5ncyc7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3QgYmUgYW4gYXJyYXknO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUxvZ0xldmVscyhsb2dMZXZlbHMpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhMb2dMZXZlbHMpKSB7XG4gICAgICBpZiAobG9nTGV2ZWxzW2tleV0pIHtcbiAgICAgICAgaWYgKHZhbGlkTG9nTGV2ZWxzLmluZGV4T2YobG9nTGV2ZWxzW2tleV0pID09PSAtMSkge1xuICAgICAgICAgIHRocm93IGAnJHtrZXl9JyBtdXN0IGJlIG9uZSBvZiAke0pTT04uc3RyaW5naWZ5KHZhbGlkTG9nTGV2ZWxzKX1gO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dMZXZlbHNba2V5XSA9IExvZ0xldmVsc1trZXldLmRlZmF1bHQ7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRGF0YWJhc2VPcHRpb25zKGRhdGFiYXNlT3B0aW9ucykge1xuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMgPT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YWJhc2VPcHRpb25zKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93IGBkYXRhYmFzZU9wdGlvbnMgbXVzdCBiZSBhbiBvYmplY3RgO1xuICAgIH1cbiAgICBpZiAoZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyA9IERhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyBgZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICB9XG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwgPSBEYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwgIT09ICdudW1iZXInKSB7XG4gICAgICB0aHJvdyBgZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsIG11c3QgYmUgYSBudW1iZXJgO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVJhdGVMaW1pdChyYXRlTGltaXQpIHtcbiAgICBpZiAoIXJhdGVMaW1pdCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocmF0ZUxpbWl0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgJiZcbiAgICAgICFBcnJheS5pc0FycmF5KHJhdGVMaW1pdClcbiAgICApIHtcbiAgICAgIHRocm93IGByYXRlTGltaXQgbXVzdCBiZSBhbiBhcnJheSBvciBvYmplY3RgO1xuICAgIH1cbiAgICBjb25zdCBvcHRpb25zID0gQXJyYXkuaXNBcnJheShyYXRlTGltaXQpID8gcmF0ZUxpbWl0IDogW3JhdGVMaW1pdF07XG4gICAgZm9yIChjb25zdCBvcHRpb24gb2Ygb3B0aW9ucykge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvcHRpb24pICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0IG11c3QgYmUgYW4gYXJyYXkgb2Ygb2JqZWN0c2A7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLnJlcXVlc3RQYXRoID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0UGF0aCBtdXN0IGJlIGRlZmluZWRgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHRpb24ucmVxdWVzdFBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFBhdGggbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLnJlcXVlc3RUaW1lV2luZG93ID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0VGltZVdpbmRvdyBtdXN0IGJlIGRlZmluZWRgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHRpb24ucmVxdWVzdFRpbWVXaW5kb3cgIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFRpbWVXaW5kb3cgbXVzdCBiZSBhIG51bWJlcmA7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzICYmIHR5cGVvZiBvcHRpb24uaW5jbHVkZUludGVybmFsUmVxdWVzdHMgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24ucmVxdWVzdENvdW50ID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0Q291bnQgbXVzdCBiZSBkZWZpbmVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9uLnJlcXVlc3RDb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0Q291bnQgbXVzdCBiZSBhIG51bWJlcmA7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLmVycm9yUmVzcG9uc2VNZXNzYWdlICYmIHR5cGVvZiBvcHRpb24uZXJyb3JSZXNwb25zZU1lc3NhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQuZXJyb3JSZXNwb25zZU1lc3NhZ2UgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICB9XG4gICAgICBjb25zdCBvcHRpb25zID0gT2JqZWN0LmtleXMoUGFyc2VTZXJ2ZXIuUmF0ZUxpbWl0Wm9uZSk7XG4gICAgICBpZiAob3B0aW9uLnpvbmUgJiYgIW9wdGlvbnMuaW5jbHVkZXMob3B0aW9uLnpvbmUpKSB7XG4gICAgICAgIGNvbnN0IGZvcm1hdHRlciA9IG5ldyBJbnRsLkxpc3RGb3JtYXQoJ2VuJywgeyBzdHlsZTogJ3Nob3J0JywgdHlwZTogJ2Rpc2p1bmN0aW9uJyB9KTtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC56b25lIG11c3QgYmUgb25lIG9mICR7Zm9ybWF0dGVyLmZvcm1hdChvcHRpb25zKX1gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMudmVyaWZ5VXNlckVtYWlscyB8fCAhdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdmFyIG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMucGFzc3dvcmRQb2xpY3kgfHwgIXRoaXMucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLmV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5zZXNzaW9uTGVuZ3RoICogMTAwMCk7XG4gIH1cblxuICB1bnJlZ2lzdGVyUmF0ZUxpbWl0ZXJzKCkge1xuICAgIGxldCBpID0gdGhpcy5yYXRlTGltaXRzPy5sZW5ndGg7XG4gICAgd2hpbGUgKGktLSkge1xuICAgICAgY29uc3QgbGltaXQgPSB0aGlzLnJhdGVMaW1pdHNbaV07XG4gICAgICBpZiAobGltaXQuY2xvdWQpIHtcbiAgICAgICAgdGhpcy5yYXRlTGltaXRzLnNwbGljZShpLCAxKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgaW52YWxpZExpbmtVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuaW52YWxpZExpbmsgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF9saW5rLmh0bWxgO1xuICB9XG5cbiAgZ2V0IGludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRWZXJpZmljYXRpb25MaW5rIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9pbnZhbGlkX3ZlcmlmaWNhdGlvbl9saW5rLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRTdWNjZXNzIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZEZhaWxVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRGYWlsIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9mYWlsLmh0bWxgO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsU3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy52ZXJpZnlFbWFpbFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3ZlcmlmeV9lbWFpbF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBjaG9vc2VQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5jaG9vc2VQYXNzd29yZCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9jaG9vc2VfcGFzc3dvcmRgO1xuICB9XG5cbiAgZ2V0IHJlcXVlc3RSZXNldFBhc3N3b3JkVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YDtcbiAgfVxuXG4gIGdldCBwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5wYXNzd29yZFJlc2V0U3VjY2VzcyB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvcGFzc3dvcmRfcmVzZXRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgcGFyc2VGcmFtZVVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5wYXJzZUZyYW1lVVJMO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS92ZXJpZnlfZW1haWxgO1xuICB9XG5cbiAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgZnVuY3Rpb24gb25jZSBQYWdlc1JvdXRlciByZXBsYWNlcyB0aGUgUHVibGljQVBJUm91dGVyO1xuICAvLyB0aGUgKGRlZmF1bHQpIGVuZHBvaW50IGhhcyB0byBiZSBkZWZpbmVkIGluIFBhZ2VzUm91dGVyIG9ubHkuXG4gIGdldCBwYWdlc0VuZHBvaW50KCkge1xuICAgIHJldHVybiB0aGlzLnBhZ2VzICYmIHRoaXMucGFnZXMuZW5hYmxlUm91dGVyICYmIHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgPyB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgIDogJ2FwcHMnO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IENvbmZpZztcbm1vZHVsZS5leHBvcnRzID0gQ29uZmlnO1xuIl0sIm1hcHBpbmdzIjoiOzs7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