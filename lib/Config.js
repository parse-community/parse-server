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
var _package = require("../package.json");
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
    config.version = _package.version;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9kYXNoIiwicmVxdWlyZSIsIl9uZXQiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2NhY2hlIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9Mb2dnZXJDb250cm9sbGVyIiwiX3BhY2thZ2UiLCJfRGVmaW5pdGlvbnMiLCJfUGFyc2UiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsInJlbW92ZVRyYWlsaW5nU2xhc2giLCJzdHIiLCJlbmRzV2l0aCIsInN1YnN0cmluZyIsImxlbmd0aCIsIkNvbmZpZyIsImdldCIsImFwcGxpY2F0aW9uSWQiLCJtb3VudCIsImNhY2hlSW5mbyIsIkFwcENhY2hlIiwiY29uZmlnIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJrZXkiLCJkYXRhYmFzZSIsIkRhdGFiYXNlQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImFkYXB0ZXIiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJiaW5kIiwiZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0IiwidmVyc2lvbiIsInB1dCIsInNlcnZlckNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZU9wdGlvbnMiLCJ2YWxpZGF0ZUNvbnRyb2xsZXJzIiwiYXBwSWQiLCJzZXR1cFBhc3N3b3JkVmFsaWRhdG9yIiwicGFzc3dvcmRQb2xpY3kiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IiwiZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyIsInNlc3Npb25MZW5ndGgiLCJkZWZhdWx0TGltaXQiLCJtYXhMaW1pdCIsImFjY291bnRMb2Nrb3V0IiwibWFzdGVyS2V5SXBzIiwibWFzdGVyS2V5IiwibWFpbnRlbmFuY2VLZXkiLCJtYWludGVuYW5jZUtleUlwcyIsInJlYWRPbmx5TWFzdGVyS2V5IiwiYWxsb3dIZWFkZXJzIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwiZmlsZVVwbG9hZCIsInBhZ2VzIiwic2VjdXJpdHkiLCJlbmZvcmNlUHJpdmF0ZVVzZXJzIiwic2NoZW1hIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4iLCJsb2dMZXZlbHMiLCJyYXRlTGltaXQiLCJkYXRhYmFzZU9wdGlvbnMiLCJleHRlbmRTZXNzaW9uT25Vc2UiLCJFcnJvciIsInZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3kiLCJ2YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwidmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyIsInN0YXJ0c1dpdGgiLCJ2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uIiwidmFsaWRhdGVJcHMiLCJ2YWxpZGF0ZURlZmF1bHRMaW1pdCIsInZhbGlkYXRlTWF4TGltaXQiLCJ2YWxpZGF0ZUFsbG93SGVhZGVycyIsInZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zIiwidmFsaWRhdGVQYWdlc09wdGlvbnMiLCJ2YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyIsInZhbGlkYXRlU2NoZW1hT3B0aW9ucyIsInZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyIsInZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiIsInZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdCIsInZhbGlkYXRlUmF0ZUxpbWl0IiwidmFsaWRhdGVMb2dMZXZlbHMiLCJ2YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyIsInZlcmlmeVVzZXJFbWFpbHMiLCJ1c2VyQ29udHJvbGxlciIsImFwcE5hbWUiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJlbWFpbEFkYXB0ZXIiLCJ2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbiIsInVuZGVmaW5lZCIsIkFycmF5IiwiaXNBcnJheSIsInByb3RvdHlwZSIsInRvU3RyaW5nIiwiY2FsbCIsImVuYWJsZUNoZWNrIiwiU2VjdXJpdHlPcHRpb25zIiwiaXNCb29sZWFuIiwiZW5hYmxlQ2hlY2tMb2ciLCJkZWZpbml0aW9ucyIsIlNjaGVtYU9wdGlvbnMiLCJzdHJpY3QiLCJkZWxldGVFeHRyYUZpZWxkcyIsInJlY3JlYXRlTW9kaWZpZWRGaWVsZHMiLCJsb2NrU2NoZW1hcyIsImJlZm9yZU1pZ3JhdGlvbiIsImFmdGVyTWlncmF0aW9uIiwiZW5hYmxlUm91dGVyIiwiUGFnZXNPcHRpb25zIiwiZW5hYmxlTG9jYWxpemF0aW9uIiwibG9jYWxpemF0aW9uSnNvblBhdGgiLCJpc1N0cmluZyIsImxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIiwicGxhY2Vob2xkZXJzIiwiZm9yY2VSZWRpcmVjdCIsInBhZ2VzUGF0aCIsInBhZ2VzRW5kcG9pbnQiLCJjdXN0b21VcmxzIiwiY3VzdG9tUm91dGVzIiwidHRsIiwiSWRlbXBvdGVuY3lPcHRpb25zIiwiaXNOYU4iLCJwYXRocyIsImR1cmF0aW9uIiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwidGhyZXNob2xkIiwidW5sb2NrT25QYXNzd29yZFJlc2V0IiwiQWNjb3VudExvY2tvdXRPcHRpb25zIiwibWF4UGFzc3dvcmRBZ2UiLCJyZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiIsInZhbGlkYXRvclBhdHRlcm4iLCJSZWdFeHAiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsInJlc2V0VG9rZW5SZXVzZUlmVmFsaWQiLCJyZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsIiwicGF0dGVyblZhbGlkYXRvciIsInZhbHVlIiwidGVzdCIsImUiLCJSZWZlcmVuY2VFcnJvciIsImVuYWJsZUZvckFub255bW91c1VzZXIiLCJGaWxlVXBsb2FkT3B0aW9ucyIsImVuYWJsZUZvclB1YmxpYyIsImVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIiwiZmlsZUV4dGVuc2lvbnMiLCJmaWVsZCIsImlwIiwiaW5jbHVkZXMiLCJzcGxpdCIsIm5ldCIsImlzSVAiLCJfbW91bnQiLCJuZXdWYWx1ZSIsIlBhcnNlU2VydmVyT3B0aW9ucyIsImhlYWRlciIsInRyaW0iLCJMb2dMZXZlbHMiLCJ2YWxpZExvZ0xldmVscyIsImluZGV4T2YiLCJKU09OIiwic3RyaW5naWZ5IiwiZW5hYmxlU2NoZW1hSG9va3MiLCJEYXRhYmFzZU9wdGlvbnMiLCJzY2hlbWFDYWNoZVR0bCIsIm9wdGlvbnMiLCJvcHRpb24iLCJyZXF1ZXN0UGF0aCIsInJlcXVlc3RUaW1lV2luZG93IiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJyZXF1ZXN0Q291bnQiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsIlBhcnNlU2VydmVyIiwiUmF0ZUxpbWl0Wm9uZSIsInpvbmUiLCJmb3JtYXR0ZXIiLCJJbnRsIiwiTGlzdEZvcm1hdCIsInN0eWxlIiwidHlwZSIsImZvcm1hdCIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwiZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQiLCJ1bnJlZ2lzdGVyUmF0ZUxpbWl0ZXJzIiwiX3RoaXMkcmF0ZUxpbWl0cyIsImkiLCJyYXRlTGltaXRzIiwibGltaXQiLCJjbG91ZCIsInNwbGljZSIsImludmFsaWRMaW5rVVJMIiwiY3VzdG9tUGFnZXMiLCJpbnZhbGlkTGluayIsImludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmsiLCJsaW5rU2VuZFN1Y2Nlc3NVUkwiLCJsaW5rU2VuZFN1Y2Nlc3MiLCJsaW5rU2VuZEZhaWxVUkwiLCJsaW5rU2VuZEZhaWwiLCJ2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwiLCJ2ZXJpZnlFbWFpbFN1Y2Nlc3MiLCJjaG9vc2VQYXNzd29yZFVSTCIsImNob29zZVBhc3N3b3JkIiwicmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwiLCJwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzIiwicGFyc2VGcmFtZVVSTCIsInZlcmlmeUVtYWlsVVJMIiwiZXhwb3J0cyIsIl9kZWZhdWx0IiwibW9kdWxlIl0sInNvdXJjZXMiOlsiLi4vc3JjL0NvbmZpZy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIENvbmZpZyBvYmplY3QgcHJvdmlkZXMgaW5mb3JtYXRpb24gYWJvdXQgaG93IGEgc3BlY2lmaWMgYXBwIGlzXG4vLyBjb25maWd1cmVkLlxuLy8gbW91bnQgaXMgdGhlIFVSTCBmb3IgdGhlIHJvb3Qgb2YgdGhlIEFQSTsgaW5jbHVkZXMgaHR0cCwgZG9tYWluLCBldGMuXG5cbmltcG9ydCB7IGlzQm9vbGVhbiwgaXNTdHJpbmcgfSBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgeyBsb2dMZXZlbHMgYXMgdmFsaWRMb2dMZXZlbHMgfSBmcm9tICcuL0NvbnRyb2xsZXJzL0xvZ2dlckNvbnRyb2xsZXInO1xuaW1wb3J0IHsgdmVyc2lvbiB9IGZyb20gJy4uL3BhY2thZ2UuanNvbic7XG5pbXBvcnQge1xuICBBY2NvdW50TG9ja291dE9wdGlvbnMsXG4gIERhdGFiYXNlT3B0aW9ucyxcbiAgRmlsZVVwbG9hZE9wdGlvbnMsXG4gIElkZW1wb3RlbmN5T3B0aW9ucyxcbiAgTG9nTGV2ZWxzLFxuICBQYWdlc09wdGlvbnMsXG4gIFBhcnNlU2VydmVyT3B0aW9ucyxcbiAgU2NoZW1hT3B0aW9ucyxcbiAgU2VjdXJpdHlPcHRpb25zLFxufSBmcm9tICcuL09wdGlvbnMvRGVmaW5pdGlvbnMnO1xuaW1wb3J0IFBhcnNlU2VydmVyIGZyb20gJy4vY2xvdWQtY29kZS9QYXJzZS5TZXJ2ZXInO1xuXG5mdW5jdGlvbiByZW1vdmVUcmFpbGluZ1NsYXNoKHN0cikge1xuICBpZiAoIXN0cikge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbiAgaWYgKHN0ci5lbmRzV2l0aCgnLycpKSB7XG4gICAgc3RyID0gc3RyLnN1YnN0cmluZygwLCBzdHIubGVuZ3RoIC0gMSk7XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZyB7XG4gIHN0YXRpYyBnZXQoYXBwbGljYXRpb25JZDogc3RyaW5nLCBtb3VudDogc3RyaW5nKSB7XG4gICAgY29uc3QgY2FjaGVJbmZvID0gQXBwQ2FjaGUuZ2V0KGFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghY2FjaGVJbmZvKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNvbmZpZyA9IG5ldyBDb25maWcoKTtcbiAgICBjb25maWcuYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQ7XG4gICAgT2JqZWN0LmtleXMoY2FjaGVJbmZvKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAoa2V5ID09ICdkYXRhYmFzZUNvbnRyb2xsZXInKSB7XG4gICAgICAgIGNvbmZpZy5kYXRhYmFzZSA9IG5ldyBEYXRhYmFzZUNvbnRyb2xsZXIoY2FjaGVJbmZvLmRhdGFiYXNlQ29udHJvbGxlci5hZGFwdGVyLCBjb25maWcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uZmlnW2tleV0gPSBjYWNoZUluZm9ba2V5XTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25maWcubW91bnQgPSByZW1vdmVUcmFpbGluZ1NsYXNoKG1vdW50KTtcbiAgICBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdC5iaW5kKGNvbmZpZyk7XG4gICAgY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQuYmluZChcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gICAgY29uZmlnLnZlcnNpb24gPSB2ZXJzaW9uO1xuICAgIHJldHVybiBjb25maWc7XG4gIH1cblxuICBzdGF0aWMgcHV0KHNlcnZlckNvbmZpZ3VyYXRpb24pIHtcbiAgICBDb25maWcudmFsaWRhdGVPcHRpb25zKHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIENvbmZpZy52YWxpZGF0ZUNvbnRyb2xsZXJzKHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIEFwcENhY2hlLnB1dChzZXJ2ZXJDb25maWd1cmF0aW9uLmFwcElkLCBzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBDb25maWcuc2V0dXBQYXNzd29yZFZhbGlkYXRvcihzZXJ2ZXJDb25maWd1cmF0aW9uLnBhc3N3b3JkUG9saWN5KTtcbiAgICByZXR1cm4gc2VydmVyQ29uZmlndXJhdGlvbjtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZU9wdGlvbnMoe1xuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0LFxuICAgIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMsXG4gICAgc2Vzc2lvbkxlbmd0aCxcbiAgICBkZWZhdWx0TGltaXQsXG4gICAgbWF4TGltaXQsXG4gICAgYWNjb3VudExvY2tvdXQsXG4gICAgcGFzc3dvcmRQb2xpY3ksXG4gICAgbWFzdGVyS2V5SXBzLFxuICAgIG1hc3RlcktleSxcbiAgICBtYWludGVuYW5jZUtleSxcbiAgICBtYWludGVuYW5jZUtleUlwcyxcbiAgICByZWFkT25seU1hc3RlcktleSxcbiAgICBhbGxvd0hlYWRlcnMsXG4gICAgaWRlbXBvdGVuY3lPcHRpb25zLFxuICAgIGZpbGVVcGxvYWQsXG4gICAgcGFnZXMsXG4gICAgc2VjdXJpdHksXG4gICAgZW5mb3JjZVByaXZhdGVVc2VycyxcbiAgICBzY2hlbWEsXG4gICAgcmVxdWVzdEtleXdvcmREZW55bGlzdCxcbiAgICBhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuLFxuICAgIGxvZ0xldmVscyxcbiAgICByYXRlTGltaXQsXG4gICAgZGF0YWJhc2VPcHRpb25zLFxuICAgIGV4dGVuZFNlc3Npb25PblVzZSxcbiAgfSkge1xuICAgIGlmIChtYXN0ZXJLZXkgPT09IHJlYWRPbmx5TWFzdGVyS2V5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hc3RlcktleSBhbmQgcmVhZE9ubHlNYXN0ZXJLZXkgc2hvdWxkIGJlIGRpZmZlcmVudCcpO1xuICAgIH1cblxuICAgIGlmIChtYXN0ZXJLZXkgPT09IG1haW50ZW5hbmNlS2V5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hc3RlcktleSBhbmQgbWFpbnRlbmFuY2VLZXkgc2hvdWxkIGJlIGRpZmZlcmVudCcpO1xuICAgIH1cblxuICAgIHRoaXMudmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCk7XG4gICAgdGhpcy52YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KTtcbiAgICB0aGlzLnZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCk7XG5cbiAgICBpZiAodHlwZW9mIHJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ3Jldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZXh0ZW5kU2Vzc2lvbk9uVXNlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdleHRlbmRTZXNzaW9uT25Vc2UgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cblxuICAgIGlmIChwdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIGlmICghcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSAmJiAhcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgICAgdGhyb3cgJ3B1YmxpY1NlcnZlclVSTCBzaG91bGQgYmUgYSB2YWxpZCBIVFRQUyBVUkwgc3RhcnRpbmcgd2l0aCBodHRwczovLyc7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMudmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlSXBzKCdtYXN0ZXJLZXlJcHMnLCBtYXN0ZXJLZXlJcHMpO1xuICAgIHRoaXMudmFsaWRhdGVJcHMoJ21haW50ZW5hbmNlS2V5SXBzJywgbWFpbnRlbmFuY2VLZXlJcHMpO1xuICAgIHRoaXMudmFsaWRhdGVEZWZhdWx0TGltaXQoZGVmYXVsdExpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlTWF4TGltaXQobWF4TGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0hlYWRlcnMoYWxsb3dIZWFkZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcyk7XG4gICAgdGhpcy52YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyhzZWN1cml0eSk7XG4gICAgdGhpcy52YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hKTtcbiAgICB0aGlzLnZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbihhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKTtcbiAgICB0aGlzLnZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdChyZXF1ZXN0S2V5d29yZERlbnlsaXN0KTtcbiAgICB0aGlzLnZhbGlkYXRlUmF0ZUxpbWl0KHJhdGVMaW1pdCk7XG4gICAgdGhpcy52YWxpZGF0ZUxvZ0xldmVscyhsb2dMZXZlbHMpO1xuICAgIHRoaXMudmFsaWRhdGVEYXRhYmFzZU9wdGlvbnMoZGF0YWJhc2VPcHRpb25zKTtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUNvbnRyb2xsZXJzKHtcbiAgICB2ZXJpZnlVc2VyRW1haWxzLFxuICAgIHVzZXJDb250cm9sbGVyLFxuICAgIGFwcE5hbWUsXG4gICAgcHVibGljU2VydmVyVVJMLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gIH0pIHtcbiAgICBjb25zdCBlbWFpbEFkYXB0ZXIgPSB1c2VyQ29udHJvbGxlci5hZGFwdGVyO1xuICAgIGlmICh2ZXJpZnlVc2VyRW1haWxzKSB7XG4gICAgICB0aGlzLnZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICAgICAgZW1haWxBZGFwdGVyLFxuICAgICAgICBhcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdChyZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgaWYgKHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVxdWVzdEtleXdvcmREZW55bGlzdCA9IHJlcXVlc3RLZXl3b3JkRGVueWxpc3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiByZXF1ZXN0S2V5d29yZERlbnlsaXN0IG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzKGVuZm9yY2VQcml2YXRlVXNlcnMpIHtcbiAgICBpZiAodHlwZW9mIGVuZm9yY2VQcml2YXRlVXNlcnMgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gZW5mb3JjZVByaXZhdGVVc2VycyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4oYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbikge1xuICAgIGlmICh0eXBlb2YgYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2VjdXJpdHlPcHRpb25zKHNlY3VyaXR5KSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzZWN1cml0eSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2suZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2spKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVjayBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2tMb2cuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVja0xvZyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hOiBTY2hlbWFPcHRpb25zKSB7XG4gICAgaWYgKCFzY2hlbWEpIHJldHVybjtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNjaGVtYSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWZpbml0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVmaW5pdGlvbnMgPSBTY2hlbWFPcHRpb25zLmRlZmluaXRpb25zLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWEuZGVmaW5pdGlvbnMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuZGVmaW5pdGlvbnMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnN0cmljdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuc3RyaWN0ID0gU2NoZW1hT3B0aW9ucy5zdHJpY3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnN0cmljdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5zdHJpY3QgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgPSBTY2hlbWFPcHRpb25zLmRlbGV0ZUV4dHJhRmllbGRzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPSBTY2hlbWFPcHRpb25zLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmxvY2tTY2hlbWFzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5sb2NrU2NoZW1hcyA9IFNjaGVtYU9wdGlvbnMubG9ja1NjaGVtYXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmxvY2tTY2hlbWFzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmxvY2tTY2hlbWFzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gbnVsbCAmJiB0eXBlb2Ygc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5lbmFibGVSb3V0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyID0gUGFnZXNPcHRpb25zLmVuYWJsZVJvdXRlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5lbmFibGVSb3V0ZXIpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5lbmFibGVSb3V0ZXIgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gPSBQYWdlc09wdGlvbnMuZW5hYmxlTG9jYWxpemF0aW9uLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uSnNvblBhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID0gUGFnZXNPcHRpb25zLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wbGFjZWhvbGRlcnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGxhY2Vob2xkZXJzID0gUGFnZXNPcHRpb25zLnBsYWNlaG9sZGVycy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMucGxhY2Vob2xkZXJzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgJiZcbiAgICAgIHR5cGVvZiBwYWdlcy5wbGFjZWhvbGRlcnMgIT09ICdmdW5jdGlvbidcbiAgICApIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBsYWNlaG9sZGVycyBtdXN0IGJlIGFuIG9iamVjdCBvciBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5mb3JjZVJlZGlyZWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmZvcmNlUmVkaXJlY3QgPSBQYWdlc09wdGlvbnMuZm9yY2VSZWRpcmVjdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5mb3JjZVJlZGlyZWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZm9yY2VSZWRpcmVjdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNQYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzUGF0aCA9IFBhZ2VzT3B0aW9ucy5wYWdlc1BhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc1BhdGgpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc1BhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNFbmRwb2ludCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wYWdlc0VuZHBvaW50ID0gUGFnZXNPcHRpb25zLnBhZ2VzRW5kcG9pbnQuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc0VuZHBvaW50KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGFnZXNFbmRwb2ludCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21VcmxzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVVybHMgPSBQYWdlc09wdGlvbnMuY3VzdG9tVXJscy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzLmN1c3RvbVVybHMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuY3VzdG9tVXJscyBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuY3VzdG9tUm91dGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVJvdXRlcyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21Sb3V0ZXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEocGFnZXMuY3VzdG9tUm91dGVzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21Sb3V0ZXMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICBpZiAoIWlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMudHRsID0gSWRlbXBvdGVuY3lPcHRpb25zLnR0bC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzTmFOKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwpICYmIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPD0gMCkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwIHNlY29uZHMnO1xuICAgIH0gZWxzZSBpZiAoaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBUVEwgdmFsdWUgbXVzdCBiZSBhIG51bWJlcic7XG4gICAgfVxuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgPSBJZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEoaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgcGF0aHMgbXVzdCBiZSBvZiBhbiBhcnJheSBvZiBzdHJpbmdzJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCkge1xuICAgIGlmIChhY2NvdW50TG9ja291dCkge1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uIDw9IDAgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPiA5OTk5OVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdBY2NvdW50IGxvY2tvdXQgZHVyYXRpb24gc2hvdWxkIGJlIGdyZWF0ZXIgdGhhbiAwIGFuZCBsZXNzIHRoYW4gMTAwMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICAhTnVtYmVyLmlzSW50ZWdlcihhY2NvdW50TG9ja291dC50aHJlc2hvbGQpIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCA8IDEgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkID4gOTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCB0aHJlc2hvbGQgc2hvdWxkIGJlIGFuIGludGVnZXIgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9IEFjY291bnRMb2Nrb3V0T3B0aW9ucy51bmxvY2tPblBhc3N3b3JkUmVzZXQuZGVmYXVsdDtcbiAgICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQpKSB7XG4gICAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSAhPT0gJ251bWJlcicgfHwgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgPCAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcic7XG4gICAgICB9XG5cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICAgIGlmICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID0gbmV3IFJlZ0V4cChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKTtcbiAgICAgICAgfSBlbHNlIGlmICghKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHApKSB7XG4gICAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gbXVzdCBiZSBhIHJlZ2V4IHN0cmluZyBvciBSZWdFeHAgb2JqZWN0Lic7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgIT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgJiZcbiAgICAgICAgKCFOdW1iZXIuaXNJbnRlZ2VyKHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgPD0gMCB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA+IDIwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgbXVzdCBiZSBhbiBpbnRlZ2VyIHJhbmdpbmcgMCAtIDIwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncmVzZXRUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgICB9XG4gICAgICBpZiAocGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAmJiAhcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIHJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCByZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Jlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuIGlzIGNvbmZpZ3VyZWQgdGhlbiBzZXR1cCBhIGNhbGxiYWNrIHRvIHByb2Nlc3MgdGhlIHBhdHRlcm5cbiAgc3RhdGljIHNldHVwUGFzc3dvcmRWYWxpZGF0b3IocGFzc3dvcmRQb2xpY3kpIHtcbiAgICBpZiAocGFzc3dvcmRQb2xpY3kgJiYgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybikge1xuICAgICAgcGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvciA9IHZhbHVlID0+IHtcbiAgICAgICAgcmV0dXJuIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4udGVzdCh2YWx1ZSk7XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgZW1haWxBZGFwdGVyLFxuICAgIGFwcE5hbWUsXG4gICAgcHVibGljU2VydmVyVVJMLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gIH0pIHtcbiAgICBpZiAoIWVtYWlsQWRhcHRlcikge1xuICAgICAgdGhyb3cgJ0FuIGVtYWlsQWRhcHRlciBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgYXBwTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93ICdBbiBhcHAgbmFtZSBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgcHVibGljU2VydmVyVVJMICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0EgcHVibGljIHNlcnZlciB1cmwgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIGlmIChpc05hTihlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikpIHtcbiAgICAgICAgdGhyb3cgJ0VtYWlsIHZlcmlmeSB0b2tlbiB2YWxpZGl0eSBkdXJhdGlvbiBtdXN0IGJlIGEgdmFsaWQgbnVtYmVyLic7XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIDw9IDApIHtcbiAgICAgICAgdGhyb3cgJ0VtYWlsIHZlcmlmeSB0b2tlbiB2YWxpZGl0eSBkdXJhdGlvbiBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgJiYgdHlwZW9mIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2VtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiAhZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHRocm93ICdZb3UgY2Fubm90IHVzZSBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIHdpdGhvdXQgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zKGZpbGVVcGxvYWQpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKGZpbGVVcGxvYWQgPT0gbnVsbCB8fCB0eXBlb2YgZmlsZVVwbG9hZCAhPT0gJ29iamVjdCcgfHwgZmlsZVVwbG9hZCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIHRocm93ICdmaWxlVXBsb2FkIG11c3QgYmUgYW4gb2JqZWN0IHZhbHVlLic7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUgaW5zdGFuY2VvZiBSZWZlcmVuY2VFcnJvcikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvckFub255bW91c1VzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JQdWJsaWMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5maWxlRXh0ZW5zaW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zID0gRmlsZVVwbG9hZE9wdGlvbnMuZmlsZUV4dGVuc2lvbnMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KGZpbGVVcGxvYWQuZmlsZUV4dGVuc2lvbnMpKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5maWxlRXh0ZW5zaW9ucyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlSXBzKGZpZWxkLCBtYXN0ZXJLZXlJcHMpIHtcbiAgICBmb3IgKGxldCBpcCBvZiBtYXN0ZXJLZXlJcHMpIHtcbiAgICAgIGlmIChpcC5pbmNsdWRlcygnLycpKSB7XG4gICAgICAgIGlwID0gaXAuc3BsaXQoJy8nKVswXTtcbiAgICAgIH1cbiAgICAgIGlmICghbmV0LmlzSVAoaXApKSB7XG4gICAgICAgIHRocm93IGBUaGUgUGFyc2UgU2VydmVyIG9wdGlvbiBcIiR7ZmllbGR9XCIgY29udGFpbnMgYW4gaW52YWxpZCBJUCBhZGRyZXNzIFwiJHtpcH1cIi5gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBtb3VudCgpIHtcbiAgICB2YXIgbW91bnQgPSB0aGlzLl9tb3VudDtcbiAgICBpZiAodGhpcy5wdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIG1vdW50ID0gdGhpcy5wdWJsaWNTZXJ2ZXJVUkw7XG4gICAgfVxuICAgIHJldHVybiBtb3VudDtcbiAgfVxuXG4gIHNldCBtb3VudChuZXdWYWx1ZSkge1xuICAgIHRoaXMuX21vdW50ID0gbmV3VmFsdWU7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgaWYgKGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIGlmIChpc05hTihzZXNzaW9uTGVuZ3RoKSkge1xuICAgICAgICB0aHJvdyAnU2Vzc2lvbiBsZW5ndGggbXVzdCBiZSBhIHZhbGlkIG51bWJlci4nO1xuICAgICAgfSBlbHNlIGlmIChzZXNzaW9uTGVuZ3RoIDw9IDApIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZURlZmF1bHRMaW1pdChkZWZhdWx0TGltaXQpIHtcbiAgICBpZiAoZGVmYXVsdExpbWl0ID09IG51bGwpIHtcbiAgICAgIGRlZmF1bHRMaW1pdCA9IFBhcnNlU2VydmVyT3B0aW9ucy5kZWZhdWx0TGltaXQuZGVmYXVsdDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBkZWZhdWx0TGltaXQgIT09ICdudW1iZXInKSB7XG4gICAgICB0aHJvdyAnRGVmYXVsdCBsaW1pdCBtdXN0IGJlIGEgbnVtYmVyLic7XG4gICAgfVxuICAgIGlmIChkZWZhdWx0TGltaXQgPD0gMCkge1xuICAgICAgdGhyb3cgJ0RlZmF1bHQgbGltaXQgbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTWF4TGltaXQobWF4TGltaXQpIHtcbiAgICBpZiAobWF4TGltaXQgPD0gMCkge1xuICAgICAgdGhyb3cgJ01heCBsaW1pdCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBbGxvd0hlYWRlcnMoYWxsb3dIZWFkZXJzKSB7XG4gICAgaWYgKCFbbnVsbCwgdW5kZWZpbmVkXS5pbmNsdWRlcyhhbGxvd0hlYWRlcnMpKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShhbGxvd0hlYWRlcnMpKSB7XG4gICAgICAgIGFsbG93SGVhZGVycy5mb3JFYWNoKGhlYWRlciA9PiB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBoZWFkZXIgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG9ubHkgY29udGFpbiBzdHJpbmdzJztcbiAgICAgICAgICB9IGVsc2UgaWYgKCFoZWFkZXIudHJpbSgpLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBub3QgY29udGFpbiBlbXB0eSBzdHJpbmdzJztcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBiZSBhbiBhcnJheSc7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTG9nTGV2ZWxzKGxvZ0xldmVscykge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKExvZ0xldmVscykpIHtcbiAgICAgIGlmIChsb2dMZXZlbHNba2V5XSkge1xuICAgICAgICBpZiAodmFsaWRMb2dMZXZlbHMuaW5kZXhPZihsb2dMZXZlbHNba2V5XSkgPT09IC0xKSB7XG4gICAgICAgICAgdGhyb3cgYCcke2tleX0nIG11c3QgYmUgb25lIG9mICR7SlNPTi5zdHJpbmdpZnkodmFsaWRMb2dMZXZlbHMpfWA7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ0xldmVsc1trZXldID0gTG9nTGV2ZWxzW2tleV0uZGVmYXVsdDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVEYXRhYmFzZU9wdGlvbnMoZGF0YWJhc2VPcHRpb25zKSB7XG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucyA9PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChkYXRhYmFzZU9wdGlvbnMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgYGRhdGFiYXNlT3B0aW9ucyBtdXN0IGJlIGFuIG9iamVjdGA7XG4gICAgfVxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzID0gRGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93IGBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgIH1cbiAgICBpZiAoZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bCA9IERhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bCAhPT0gJ251bWJlcicpIHtcbiAgICAgIHRocm93IGBkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwgbXVzdCBiZSBhIG51bWJlcmA7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUmF0ZUxpbWl0KHJhdGVMaW1pdCkge1xuICAgIGlmICghcmF0ZUxpbWl0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChcbiAgICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChyYXRlTGltaXQpICE9PSAnW29iamVjdCBPYmplY3RdJyAmJlxuICAgICAgIUFycmF5LmlzQXJyYXkocmF0ZUxpbWl0KVxuICAgICkge1xuICAgICAgdGhyb3cgYHJhdGVMaW1pdCBtdXN0IGJlIGFuIGFycmF5IG9yIG9iamVjdGA7XG4gICAgfVxuICAgIGNvbnN0IG9wdGlvbnMgPSBBcnJheS5pc0FycmF5KHJhdGVMaW1pdCkgPyByYXRlTGltaXQgOiBbcmF0ZUxpbWl0XTtcbiAgICBmb3IgKGNvbnN0IG9wdGlvbiBvZiBvcHRpb25zKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9wdGlvbikgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQgbXVzdCBiZSBhbiBhcnJheSBvZiBvYmplY3RzYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24ucmVxdWVzdFBhdGggPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RQYXRoIG11c3QgYmUgZGVmaW5lZGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbi5yZXF1ZXN0UGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0UGF0aCBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24ucmVxdWVzdFRpbWVXaW5kb3cgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RUaW1lV2luZG93IG11c3QgYmUgZGVmaW5lZGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbi5yZXF1ZXN0VGltZVdpbmRvdyAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0VGltZVdpbmRvdyBtdXN0IGJlIGEgbnVtYmVyYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24uaW5jbHVkZUludGVybmFsUmVxdWVzdHMgJiYgdHlwZW9mIG9wdGlvbi5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQuaW5jbHVkZUludGVybmFsUmVxdWVzdHMgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5yZXF1ZXN0Q291bnQgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RDb3VudCBtdXN0IGJlIGRlZmluZWRgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHRpb24ucmVxdWVzdENvdW50ICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RDb3VudCBtdXN0IGJlIGEgbnVtYmVyYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24uZXJyb3JSZXNwb25zZU1lc3NhZ2UgJiYgdHlwZW9mIG9wdGlvbi5lcnJvclJlc3BvbnNlTWVzc2FnZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5lcnJvclJlc3BvbnNlTWVzc2FnZSBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG9wdGlvbnMgPSBPYmplY3Qua2V5cyhQYXJzZVNlcnZlci5SYXRlTGltaXRab25lKTtcbiAgICAgIGlmIChvcHRpb24uem9uZSAmJiAhb3B0aW9ucy5pbmNsdWRlcyhvcHRpb24uem9uZSkpIHtcbiAgICAgICAgY29uc3QgZm9ybWF0dGVyID0gbmV3IEludGwuTGlzdEZvcm1hdCgnZW4nLCB7IHN0eWxlOiAnc2hvcnQnLCB0eXBlOiAnZGlzanVuY3Rpb24nIH0pO1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnpvbmUgbXVzdCBiZSBvbmUgb2YgJHtmb3JtYXR0ZXIuZm9ybWF0KG9wdGlvbnMpfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy52ZXJpZnlVc2VyRW1haWxzIHx8ICF0aGlzLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB2YXIgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gKiAxMDAwKTtcbiAgfVxuXG4gIGdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy5wYXNzd29yZFBvbGljeSB8fCAhdGhpcy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gKiAxMDAwKTtcbiAgfVxuXG4gIGdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMuZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdmFyIG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLnNlc3Npb25MZW5ndGggKiAxMDAwKTtcbiAgfVxuXG4gIHVucmVnaXN0ZXJSYXRlTGltaXRlcnMoKSB7XG4gICAgbGV0IGkgPSB0aGlzLnJhdGVMaW1pdHM/Lmxlbmd0aDtcbiAgICB3aGlsZSAoaS0tKSB7XG4gICAgICBjb25zdCBsaW1pdCA9IHRoaXMucmF0ZUxpbWl0c1tpXTtcbiAgICAgIGlmIChsaW1pdC5jbG91ZCkge1xuICAgICAgICB0aGlzLnJhdGVMaW1pdHMuc3BsaWNlKGksIDEpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBpbnZhbGlkTGlua1VSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5pbnZhbGlkTGluayB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9pbnZhbGlkX2xpbmsuaHRtbGA7XG4gIH1cblxuICBnZXQgaW52YWxpZFZlcmlmaWNhdGlvbkxpbmtVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMuaW52YWxpZFZlcmlmaWNhdGlvbkxpbmsgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2ludmFsaWRfdmVyaWZpY2F0aW9uX2xpbmsuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IGxpbmtTZW5kU3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5saW5rU2VuZFN1Y2Nlc3MgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvbGlua19zZW5kX3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IGxpbmtTZW5kRmFpbFVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5saW5rU2VuZEZhaWwgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvbGlua19zZW5kX2ZhaWwuaHRtbGA7XG4gIH1cblxuICBnZXQgdmVyaWZ5RW1haWxTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLnZlcmlmeUVtYWlsU3VjY2VzcyB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvdmVyaWZ5X2VtYWlsX3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IGNob29zZVBhc3N3b3JkVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmNob29zZVBhc3N3b3JkIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2Nob29zZV9wYXNzd29yZGA7XG4gIH1cblxuICBnZXQgcmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwoKSB7XG4gICAgcmV0dXJuIGAke3RoaXMucHVibGljU2VydmVyVVJMfS8ke3RoaXMucGFnZXNFbmRwb2ludH0vJHt0aGlzLmFwcGxpY2F0aW9uSWR9L3JlcXVlc3RfcGFzc3dvcmRfcmVzZXRgO1xuICB9XG5cbiAgZ2V0IHBhc3N3b3JkUmVzZXRTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLnBhc3N3b3JkUmVzZXRTdWNjZXNzIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9wYXNzd29yZF9yZXNldF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBwYXJzZUZyYW1lVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLnBhcnNlRnJhbWVVUkw7XG4gIH1cblxuICBnZXQgdmVyaWZ5RW1haWxVUkwoKSB7XG4gICAgcmV0dXJuIGAke3RoaXMucHVibGljU2VydmVyVVJMfS8ke3RoaXMucGFnZXNFbmRwb2ludH0vJHt0aGlzLmFwcGxpY2F0aW9uSWR9L3ZlcmlmeV9lbWFpbGA7XG4gIH1cblxuICAvLyBUT0RPOiBSZW1vdmUgdGhpcyBmdW5jdGlvbiBvbmNlIFBhZ2VzUm91dGVyIHJlcGxhY2VzIHRoZSBQdWJsaWNBUElSb3V0ZXI7XG4gIC8vIHRoZSAoZGVmYXVsdCkgZW5kcG9pbnQgaGFzIHRvIGJlIGRlZmluZWQgaW4gUGFnZXNSb3V0ZXIgb25seS5cbiAgZ2V0IHBhZ2VzRW5kcG9pbnQoKSB7XG4gICAgcmV0dXJuIHRoaXMucGFnZXMgJiYgdGhpcy5wYWdlcy5lbmFibGVSb3V0ZXIgJiYgdGhpcy5wYWdlcy5wYWdlc0VuZHBvaW50XG4gICAgICA/IHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgOiAnYXBwcyc7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQ29uZmlnO1xubW9kdWxlLmV4cG9ydHMgPSBDb25maWc7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUlBLElBQUFBLE9BQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLElBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFHLE1BQUEsR0FBQUQsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFJLG1CQUFBLEdBQUFGLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBSyxpQkFBQSxHQUFBTCxPQUFBO0FBQ0EsSUFBQU0sUUFBQSxHQUFBTixPQUFBO0FBQ0EsSUFBQU8sWUFBQSxHQUFBUCxPQUFBO0FBV0EsSUFBQVEsTUFBQSxHQUFBTixzQkFBQSxDQUFBRixPQUFBO0FBQW9ELFNBQUFFLHVCQUFBTyxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBckJwRDtBQUNBO0FBQ0E7O0FBcUJBLFNBQVNHLG1CQUFtQkEsQ0FBQ0MsR0FBRyxFQUFFO0VBQ2hDLElBQUksQ0FBQ0EsR0FBRyxFQUFFO0lBQ1IsT0FBT0EsR0FBRztFQUNaO0VBQ0EsSUFBSUEsR0FBRyxDQUFDQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUU7SUFDckJELEdBQUcsR0FBR0EsR0FBRyxDQUFDRSxTQUFTLENBQUMsQ0FBQyxFQUFFRixHQUFHLENBQUNHLE1BQU0sR0FBRyxDQUFDLENBQUM7RUFDeEM7RUFDQSxPQUFPSCxHQUFHO0FBQ1o7QUFFTyxNQUFNSSxNQUFNLENBQUM7RUFDbEIsT0FBT0MsR0FBR0EsQ0FBQ0MsYUFBcUIsRUFBRUMsS0FBYSxFQUFFO0lBQy9DLE1BQU1DLFNBQVMsR0FBR0MsY0FBUSxDQUFDSixHQUFHLENBQUNDLGFBQWEsQ0FBQztJQUM3QyxJQUFJLENBQUNFLFNBQVMsRUFBRTtNQUNkO0lBQ0Y7SUFDQSxNQUFNRSxNQUFNLEdBQUcsSUFBSU4sTUFBTSxDQUFDLENBQUM7SUFDM0JNLE1BQU0sQ0FBQ0osYUFBYSxHQUFHQSxhQUFhO0lBQ3BDSyxNQUFNLENBQUNDLElBQUksQ0FBQ0osU0FBUyxDQUFDLENBQUNLLE9BQU8sQ0FBQ0MsR0FBRyxJQUFJO01BQ3BDLElBQUlBLEdBQUcsSUFBSSxvQkFBb0IsRUFBRTtRQUMvQkosTUFBTSxDQUFDSyxRQUFRLEdBQUcsSUFBSUMsMkJBQWtCLENBQUNSLFNBQVMsQ0FBQ1Msa0JBQWtCLENBQUNDLE9BQU8sRUFBRVIsTUFBTSxDQUFDO01BQ3hGLENBQUMsTUFBTTtRQUNMQSxNQUFNLENBQUNJLEdBQUcsQ0FBQyxHQUFHTixTQUFTLENBQUNNLEdBQUcsQ0FBQztNQUM5QjtJQUNGLENBQUMsQ0FBQztJQUNGSixNQUFNLENBQUNILEtBQUssR0FBR1IsbUJBQW1CLENBQUNRLEtBQUssQ0FBQztJQUN6Q0csTUFBTSxDQUFDUyx3QkFBd0IsR0FBR1QsTUFBTSxDQUFDUyx3QkFBd0IsQ0FBQ0MsSUFBSSxDQUFDVixNQUFNLENBQUM7SUFDOUVBLE1BQU0sQ0FBQ1csaUNBQWlDLEdBQUdYLE1BQU0sQ0FBQ1csaUNBQWlDLENBQUNELElBQUksQ0FDdEZWLE1BQ0YsQ0FBQztJQUNEQSxNQUFNLENBQUNZLE9BQU8sR0FBR0EsZ0JBQU87SUFDeEIsT0FBT1osTUFBTTtFQUNmO0VBRUEsT0FBT2EsR0FBR0EsQ0FBQ0MsbUJBQW1CLEVBQUU7SUFDOUJwQixNQUFNLENBQUNxQixlQUFlLENBQUNELG1CQUFtQixDQUFDO0lBQzNDcEIsTUFBTSxDQUFDc0IsbUJBQW1CLENBQUNGLG1CQUFtQixDQUFDO0lBQy9DZixjQUFRLENBQUNjLEdBQUcsQ0FBQ0MsbUJBQW1CLENBQUNHLEtBQUssRUFBRUgsbUJBQW1CLENBQUM7SUFDNURwQixNQUFNLENBQUN3QixzQkFBc0IsQ0FBQ0osbUJBQW1CLENBQUNLLGNBQWMsQ0FBQztJQUNqRSxPQUFPTCxtQkFBbUI7RUFDNUI7RUFFQSxPQUFPQyxlQUFlQSxDQUFDO0lBQ3JCSyxlQUFlO0lBQ2ZDLDRCQUE0QjtJQUM1QkMsc0JBQXNCO0lBQ3RCQyxhQUFhO0lBQ2JDLFlBQVk7SUFDWkMsUUFBUTtJQUNSQyxjQUFjO0lBQ2RQLGNBQWM7SUFDZFEsWUFBWTtJQUNaQyxTQUFTO0lBQ1RDLGNBQWM7SUFDZEMsaUJBQWlCO0lBQ2pCQyxpQkFBaUI7SUFDakJDLFlBQVk7SUFDWkMsa0JBQWtCO0lBQ2xCQyxVQUFVO0lBQ1ZDLEtBQUs7SUFDTEMsUUFBUTtJQUNSQyxtQkFBbUI7SUFDbkJDLE1BQU07SUFDTkMsc0JBQXNCO0lBQ3RCQyx5QkFBeUI7SUFDekJDLFNBQVM7SUFDVEMsU0FBUztJQUNUQyxlQUFlO0lBQ2ZDO0VBQ0YsQ0FBQyxFQUFFO0lBQ0QsSUFBSWhCLFNBQVMsS0FBS0csaUJBQWlCLEVBQUU7TUFDbkMsTUFBTSxJQUFJYyxLQUFLLENBQUMscURBQXFELENBQUM7SUFDeEU7SUFFQSxJQUFJakIsU0FBUyxLQUFLQyxjQUFjLEVBQUU7TUFDaEMsTUFBTSxJQUFJZ0IsS0FBSyxDQUFDLGtEQUFrRCxDQUFDO0lBQ3JFO0lBRUEsSUFBSSxDQUFDQyw0QkFBNEIsQ0FBQ3BCLGNBQWMsQ0FBQztJQUNqRCxJQUFJLENBQUNxQixzQkFBc0IsQ0FBQzVCLGNBQWMsQ0FBQztJQUMzQyxJQUFJLENBQUM2Qix5QkFBeUIsQ0FBQ2QsVUFBVSxDQUFDO0lBRTFDLElBQUksT0FBT2IsNEJBQTRCLEtBQUssU0FBUyxFQUFFO01BQ3JELE1BQU0sc0RBQXNEO0lBQzlEO0lBRUEsSUFBSSxPQUFPdUIsa0JBQWtCLEtBQUssU0FBUyxFQUFFO01BQzNDLE1BQU0sNENBQTRDO0lBQ3BEO0lBRUEsSUFBSXhCLGVBQWUsRUFBRTtNQUNuQixJQUFJLENBQUNBLGVBQWUsQ0FBQzZCLFVBQVUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDN0IsZUFBZSxDQUFDNkIsVUFBVSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1FBQ3JGLE1BQU0sb0VBQW9FO01BQzVFO0lBQ0Y7SUFDQSxJQUFJLENBQUNDLDRCQUE0QixDQUFDM0IsYUFBYSxFQUFFRCxzQkFBc0IsQ0FBQztJQUN4RSxJQUFJLENBQUM2QixXQUFXLENBQUMsY0FBYyxFQUFFeEIsWUFBWSxDQUFDO0lBQzlDLElBQUksQ0FBQ3dCLFdBQVcsQ0FBQyxtQkFBbUIsRUFBRXJCLGlCQUFpQixDQUFDO0lBQ3hELElBQUksQ0FBQ3NCLG9CQUFvQixDQUFDNUIsWUFBWSxDQUFDO0lBQ3ZDLElBQUksQ0FBQzZCLGdCQUFnQixDQUFDNUIsUUFBUSxDQUFDO0lBQy9CLElBQUksQ0FBQzZCLG9CQUFvQixDQUFDdEIsWUFBWSxDQUFDO0lBQ3ZDLElBQUksQ0FBQ3VCLDBCQUEwQixDQUFDdEIsa0JBQWtCLENBQUM7SUFDbkQsSUFBSSxDQUFDdUIsb0JBQW9CLENBQUNyQixLQUFLLENBQUM7SUFDaEMsSUFBSSxDQUFDc0IsdUJBQXVCLENBQUNyQixRQUFRLENBQUM7SUFDdEMsSUFBSSxDQUFDc0IscUJBQXFCLENBQUNwQixNQUFNLENBQUM7SUFDbEMsSUFBSSxDQUFDcUIsMkJBQTJCLENBQUN0QixtQkFBbUIsQ0FBQztJQUNyRCxJQUFJLENBQUN1QixpQ0FBaUMsQ0FBQ3BCLHlCQUF5QixDQUFDO0lBQ2pFLElBQUksQ0FBQ3FCLDhCQUE4QixDQUFDdEIsc0JBQXNCLENBQUM7SUFDM0QsSUFBSSxDQUFDdUIsaUJBQWlCLENBQUNwQixTQUFTLENBQUM7SUFDakMsSUFBSSxDQUFDcUIsaUJBQWlCLENBQUN0QixTQUFTLENBQUM7SUFDakMsSUFBSSxDQUFDdUIsdUJBQXVCLENBQUNyQixlQUFlLENBQUM7RUFDL0M7RUFFQSxPQUFPM0IsbUJBQW1CQSxDQUFDO0lBQ3pCaUQsZ0JBQWdCO0lBQ2hCQyxjQUFjO0lBQ2RDLE9BQU87SUFDUC9DLGVBQWU7SUFDZmdELGdDQUFnQztJQUNoQ0M7RUFDRixDQUFDLEVBQUU7SUFDRCxNQUFNQyxZQUFZLEdBQUdKLGNBQWMsQ0FBQzFELE9BQU87SUFDM0MsSUFBSXlELGdCQUFnQixFQUFFO01BQ3BCLElBQUksQ0FBQ00sMEJBQTBCLENBQUM7UUFDOUJELFlBQVk7UUFDWkgsT0FBTztRQUNQL0MsZUFBZTtRQUNmZ0QsZ0NBQWdDO1FBQ2hDQztNQUNGLENBQUMsQ0FBQztJQUNKO0VBQ0Y7RUFFQSxPQUFPUiw4QkFBOEJBLENBQUN0QixzQkFBc0IsRUFBRTtJQUM1RCxJQUFJQSxzQkFBc0IsS0FBS2lDLFNBQVMsRUFBRTtNQUN4Q2pDLHNCQUFzQixHQUFHQSxzQkFBc0IsQ0FBQ25ELE9BQU87SUFDekQsQ0FBQyxNQUFNLElBQUksQ0FBQ3FGLEtBQUssQ0FBQ0MsT0FBTyxDQUFDbkMsc0JBQXNCLENBQUMsRUFBRTtNQUNqRCxNQUFNLDhEQUE4RDtJQUN0RTtFQUNGO0VBRUEsT0FBT29CLDJCQUEyQkEsQ0FBQ3RCLG1CQUFtQixFQUFFO0lBQ3RELElBQUksT0FBT0EsbUJBQW1CLEtBQUssU0FBUyxFQUFFO01BQzVDLE1BQU0sNERBQTREO0lBQ3BFO0VBQ0Y7RUFFQSxPQUFPdUIsaUNBQWlDQSxDQUFDcEIseUJBQXlCLEVBQUU7SUFDbEUsSUFBSSxPQUFPQSx5QkFBeUIsS0FBSyxTQUFTLEVBQUU7TUFDbEQsTUFBTSxrRUFBa0U7SUFDMUU7RUFDRjtFQUVBLE9BQU9pQix1QkFBdUJBLENBQUNyQixRQUFRLEVBQUU7SUFDdkMsSUFBSW5DLE1BQU0sQ0FBQzBFLFNBQVMsQ0FBQ0MsUUFBUSxDQUFDQyxJQUFJLENBQUN6QyxRQUFRLENBQUMsS0FBSyxpQkFBaUIsRUFBRTtNQUNsRSxNQUFNLGlEQUFpRDtJQUN6RDtJQUNBLElBQUlBLFFBQVEsQ0FBQzBDLFdBQVcsS0FBS04sU0FBUyxFQUFFO01BQ3RDcEMsUUFBUSxDQUFDMEMsV0FBVyxHQUFHQyw0QkFBZSxDQUFDRCxXQUFXLENBQUMxRixPQUFPO0lBQzVELENBQUMsTUFBTSxJQUFJLENBQUMsSUFBQTRGLGlCQUFTLEVBQUM1QyxRQUFRLENBQUMwQyxXQUFXLENBQUMsRUFBRTtNQUMzQyxNQUFNLDZEQUE2RDtJQUNyRTtJQUNBLElBQUkxQyxRQUFRLENBQUM2QyxjQUFjLEtBQUtULFNBQVMsRUFBRTtNQUN6Q3BDLFFBQVEsQ0FBQzZDLGNBQWMsR0FBR0YsNEJBQWUsQ0FBQ0UsY0FBYyxDQUFDN0YsT0FBTztJQUNsRSxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUE0RixpQkFBUyxFQUFDNUMsUUFBUSxDQUFDNkMsY0FBYyxDQUFDLEVBQUU7TUFDOUMsTUFBTSxnRUFBZ0U7SUFDeEU7RUFDRjtFQUVBLE9BQU92QixxQkFBcUJBLENBQUNwQixNQUFxQixFQUFFO0lBQ2xELElBQUksQ0FBQ0EsTUFBTSxFQUFFO0lBQ2IsSUFBSXJDLE1BQU0sQ0FBQzBFLFNBQVMsQ0FBQ0MsUUFBUSxDQUFDQyxJQUFJLENBQUN2QyxNQUFNLENBQUMsS0FBSyxpQkFBaUIsRUFBRTtNQUNoRSxNQUFNLCtDQUErQztJQUN2RDtJQUNBLElBQUlBLE1BQU0sQ0FBQzRDLFdBQVcsS0FBS1YsU0FBUyxFQUFFO01BQ3BDbEMsTUFBTSxDQUFDNEMsV0FBVyxHQUFHQywwQkFBYSxDQUFDRCxXQUFXLENBQUM5RixPQUFPO0lBQ3hELENBQUMsTUFBTSxJQUFJLENBQUNxRixLQUFLLENBQUNDLE9BQU8sQ0FBQ3BDLE1BQU0sQ0FBQzRDLFdBQVcsQ0FBQyxFQUFFO01BQzdDLE1BQU0sMERBQTBEO0lBQ2xFO0lBQ0EsSUFBSTVDLE1BQU0sQ0FBQzhDLE1BQU0sS0FBS1osU0FBUyxFQUFFO01BQy9CbEMsTUFBTSxDQUFDOEMsTUFBTSxHQUFHRCwwQkFBYSxDQUFDQyxNQUFNLENBQUNoRyxPQUFPO0lBQzlDLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBQTRGLGlCQUFTLEVBQUMxQyxNQUFNLENBQUM4QyxNQUFNLENBQUMsRUFBRTtNQUNwQyxNQUFNLHNEQUFzRDtJQUM5RDtJQUNBLElBQUk5QyxNQUFNLENBQUMrQyxpQkFBaUIsS0FBS2IsU0FBUyxFQUFFO01BQzFDbEMsTUFBTSxDQUFDK0MsaUJBQWlCLEdBQUdGLDBCQUFhLENBQUNFLGlCQUFpQixDQUFDakcsT0FBTztJQUNwRSxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUE0RixpQkFBUyxFQUFDMUMsTUFBTSxDQUFDK0MsaUJBQWlCLENBQUMsRUFBRTtNQUMvQyxNQUFNLGlFQUFpRTtJQUN6RTtJQUNBLElBQUkvQyxNQUFNLENBQUNnRCxzQkFBc0IsS0FBS2QsU0FBUyxFQUFFO01BQy9DbEMsTUFBTSxDQUFDZ0Qsc0JBQXNCLEdBQUdILDBCQUFhLENBQUNHLHNCQUFzQixDQUFDbEcsT0FBTztJQUM5RSxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUE0RixpQkFBUyxFQUFDMUMsTUFBTSxDQUFDZ0Qsc0JBQXNCLENBQUMsRUFBRTtNQUNwRCxNQUFNLHNFQUFzRTtJQUM5RTtJQUNBLElBQUloRCxNQUFNLENBQUNpRCxXQUFXLEtBQUtmLFNBQVMsRUFBRTtNQUNwQ2xDLE1BQU0sQ0FBQ2lELFdBQVcsR0FBR0osMEJBQWEsQ0FBQ0ksV0FBVyxDQUFDbkcsT0FBTztJQUN4RCxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUE0RixpQkFBUyxFQUFDMUMsTUFBTSxDQUFDaUQsV0FBVyxDQUFDLEVBQUU7TUFDekMsTUFBTSwyREFBMkQ7SUFDbkU7SUFDQSxJQUFJakQsTUFBTSxDQUFDa0QsZUFBZSxLQUFLaEIsU0FBUyxFQUFFO01BQ3hDbEMsTUFBTSxDQUFDa0QsZUFBZSxHQUFHLElBQUk7SUFDL0IsQ0FBQyxNQUFNLElBQUlsRCxNQUFNLENBQUNrRCxlQUFlLEtBQUssSUFBSSxJQUFJLE9BQU9sRCxNQUFNLENBQUNrRCxlQUFlLEtBQUssVUFBVSxFQUFFO01BQzFGLE1BQU0sZ0VBQWdFO0lBQ3hFO0lBQ0EsSUFBSWxELE1BQU0sQ0FBQ21ELGNBQWMsS0FBS2pCLFNBQVMsRUFBRTtNQUN2Q2xDLE1BQU0sQ0FBQ21ELGNBQWMsR0FBRyxJQUFJO0lBQzlCLENBQUMsTUFBTSxJQUFJbkQsTUFBTSxDQUFDbUQsY0FBYyxLQUFLLElBQUksSUFBSSxPQUFPbkQsTUFBTSxDQUFDbUQsY0FBYyxLQUFLLFVBQVUsRUFBRTtNQUN4RixNQUFNLCtEQUErRDtJQUN2RTtFQUNGO0VBRUEsT0FBT2pDLG9CQUFvQkEsQ0FBQ3JCLEtBQUssRUFBRTtJQUNqQyxJQUFJbEMsTUFBTSxDQUFDMEUsU0FBUyxDQUFDQyxRQUFRLENBQUNDLElBQUksQ0FBQzFDLEtBQUssQ0FBQyxLQUFLLGlCQUFpQixFQUFFO01BQy9ELE1BQU0sOENBQThDO0lBQ3REO0lBQ0EsSUFBSUEsS0FBSyxDQUFDdUQsWUFBWSxLQUFLbEIsU0FBUyxFQUFFO01BQ3BDckMsS0FBSyxDQUFDdUQsWUFBWSxHQUFHQyx5QkFBWSxDQUFDRCxZQUFZLENBQUN0RyxPQUFPO0lBQ3hELENBQUMsTUFBTSxJQUFJLENBQUMsSUFBQTRGLGlCQUFTLEVBQUM3QyxLQUFLLENBQUN1RCxZQUFZLENBQUMsRUFBRTtNQUN6QyxNQUFNLDJEQUEyRDtJQUNuRTtJQUNBLElBQUl2RCxLQUFLLENBQUN5RCxrQkFBa0IsS0FBS3BCLFNBQVMsRUFBRTtNQUMxQ3JDLEtBQUssQ0FBQ3lELGtCQUFrQixHQUFHRCx5QkFBWSxDQUFDQyxrQkFBa0IsQ0FBQ3hHLE9BQU87SUFDcEUsQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFBNEYsaUJBQVMsRUFBQzdDLEtBQUssQ0FBQ3lELGtCQUFrQixDQUFDLEVBQUU7TUFDL0MsTUFBTSxpRUFBaUU7SUFDekU7SUFDQSxJQUFJekQsS0FBSyxDQUFDMEQsb0JBQW9CLEtBQUtyQixTQUFTLEVBQUU7TUFDNUNyQyxLQUFLLENBQUMwRCxvQkFBb0IsR0FBR0YseUJBQVksQ0FBQ0Usb0JBQW9CLENBQUN6RyxPQUFPO0lBQ3hFLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBQTBHLGdCQUFRLEVBQUMzRCxLQUFLLENBQUMwRCxvQkFBb0IsQ0FBQyxFQUFFO01BQ2hELE1BQU0sa0VBQWtFO0lBQzFFO0lBQ0EsSUFBSTFELEtBQUssQ0FBQzRELDBCQUEwQixLQUFLdkIsU0FBUyxFQUFFO01BQ2xEckMsS0FBSyxDQUFDNEQsMEJBQTBCLEdBQUdKLHlCQUFZLENBQUNJLDBCQUEwQixDQUFDM0csT0FBTztJQUNwRixDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUEwRyxnQkFBUSxFQUFDM0QsS0FBSyxDQUFDNEQsMEJBQTBCLENBQUMsRUFBRTtNQUN0RCxNQUFNLHdFQUF3RTtJQUNoRjtJQUNBLElBQUk1RCxLQUFLLENBQUM2RCxZQUFZLEtBQUt4QixTQUFTLEVBQUU7TUFDcENyQyxLQUFLLENBQUM2RCxZQUFZLEdBQUdMLHlCQUFZLENBQUNLLFlBQVksQ0FBQzVHLE9BQU87SUFDeEQsQ0FBQyxNQUFNLElBQ0xhLE1BQU0sQ0FBQzBFLFNBQVMsQ0FBQ0MsUUFBUSxDQUFDQyxJQUFJLENBQUMxQyxLQUFLLENBQUM2RCxZQUFZLENBQUMsS0FBSyxpQkFBaUIsSUFDeEUsT0FBTzdELEtBQUssQ0FBQzZELFlBQVksS0FBSyxVQUFVLEVBQ3hDO01BQ0EsTUFBTSx5RUFBeUU7SUFDakY7SUFDQSxJQUFJN0QsS0FBSyxDQUFDOEQsYUFBYSxLQUFLekIsU0FBUyxFQUFFO01BQ3JDckMsS0FBSyxDQUFDOEQsYUFBYSxHQUFHTix5QkFBWSxDQUFDTSxhQUFhLENBQUM3RyxPQUFPO0lBQzFELENBQUMsTUFBTSxJQUFJLENBQUMsSUFBQTRGLGlCQUFTLEVBQUM3QyxLQUFLLENBQUM4RCxhQUFhLENBQUMsRUFBRTtNQUMxQyxNQUFNLDREQUE0RDtJQUNwRTtJQUNBLElBQUk5RCxLQUFLLENBQUMrRCxTQUFTLEtBQUsxQixTQUFTLEVBQUU7TUFDakNyQyxLQUFLLENBQUMrRCxTQUFTLEdBQUdQLHlCQUFZLENBQUNPLFNBQVMsQ0FBQzlHLE9BQU87SUFDbEQsQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFBMEcsZ0JBQVEsRUFBQzNELEtBQUssQ0FBQytELFNBQVMsQ0FBQyxFQUFFO01BQ3JDLE1BQU0sdURBQXVEO0lBQy9EO0lBQ0EsSUFBSS9ELEtBQUssQ0FBQ2dFLGFBQWEsS0FBSzNCLFNBQVMsRUFBRTtNQUNyQ3JDLEtBQUssQ0FBQ2dFLGFBQWEsR0FBR1IseUJBQVksQ0FBQ1EsYUFBYSxDQUFDL0csT0FBTztJQUMxRCxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUEwRyxnQkFBUSxFQUFDM0QsS0FBSyxDQUFDZ0UsYUFBYSxDQUFDLEVBQUU7TUFDekMsTUFBTSwyREFBMkQ7SUFDbkU7SUFDQSxJQUFJaEUsS0FBSyxDQUFDaUUsVUFBVSxLQUFLNUIsU0FBUyxFQUFFO01BQ2xDckMsS0FBSyxDQUFDaUUsVUFBVSxHQUFHVCx5QkFBWSxDQUFDUyxVQUFVLENBQUNoSCxPQUFPO0lBQ3BELENBQUMsTUFBTSxJQUFJYSxNQUFNLENBQUMwRSxTQUFTLENBQUNDLFFBQVEsQ0FBQ0MsSUFBSSxDQUFDMUMsS0FBSyxDQUFDaUUsVUFBVSxDQUFDLEtBQUssaUJBQWlCLEVBQUU7TUFDakYsTUFBTSx5REFBeUQ7SUFDakU7SUFDQSxJQUFJakUsS0FBSyxDQUFDa0UsWUFBWSxLQUFLN0IsU0FBUyxFQUFFO01BQ3BDckMsS0FBSyxDQUFDa0UsWUFBWSxHQUFHVix5QkFBWSxDQUFDVSxZQUFZLENBQUNqSCxPQUFPO0lBQ3hELENBQUMsTUFBTSxJQUFJLEVBQUUrQyxLQUFLLENBQUNrRSxZQUFZLFlBQVk1QixLQUFLLENBQUMsRUFBRTtNQUNqRCxNQUFNLDBEQUEwRDtJQUNsRTtFQUNGO0VBRUEsT0FBT2xCLDBCQUEwQkEsQ0FBQ3RCLGtCQUFrQixFQUFFO0lBQ3BELElBQUksQ0FBQ0Esa0JBQWtCLEVBQUU7TUFDdkI7SUFDRjtJQUNBLElBQUlBLGtCQUFrQixDQUFDcUUsR0FBRyxLQUFLOUIsU0FBUyxFQUFFO01BQ3hDdkMsa0JBQWtCLENBQUNxRSxHQUFHLEdBQUdDLCtCQUFrQixDQUFDRCxHQUFHLENBQUNsSCxPQUFPO0lBQ3pELENBQUMsTUFBTSxJQUFJLENBQUNvSCxLQUFLLENBQUN2RSxrQkFBa0IsQ0FBQ3FFLEdBQUcsQ0FBQyxJQUFJckUsa0JBQWtCLENBQUNxRSxHQUFHLElBQUksQ0FBQyxFQUFFO01BQ3hFLE1BQU0sc0RBQXNEO0lBQzlELENBQUMsTUFBTSxJQUFJRSxLQUFLLENBQUN2RSxrQkFBa0IsQ0FBQ3FFLEdBQUcsQ0FBQyxFQUFFO01BQ3hDLE1BQU0sd0NBQXdDO0lBQ2hEO0lBQ0EsSUFBSSxDQUFDckUsa0JBQWtCLENBQUN3RSxLQUFLLEVBQUU7TUFDN0J4RSxrQkFBa0IsQ0FBQ3dFLEtBQUssR0FBR0YsK0JBQWtCLENBQUNFLEtBQUssQ0FBQ3JILE9BQU87SUFDN0QsQ0FBQyxNQUFNLElBQUksRUFBRTZDLGtCQUFrQixDQUFDd0UsS0FBSyxZQUFZaEMsS0FBSyxDQUFDLEVBQUU7TUFDdkQsTUFBTSxrREFBa0Q7SUFDMUQ7RUFDRjtFQUVBLE9BQU8zQiw0QkFBNEJBLENBQUNwQixjQUFjLEVBQUU7SUFDbEQsSUFBSUEsY0FBYyxFQUFFO01BQ2xCLElBQ0UsT0FBT0EsY0FBYyxDQUFDZ0YsUUFBUSxLQUFLLFFBQVEsSUFDM0NoRixjQUFjLENBQUNnRixRQUFRLElBQUksQ0FBQyxJQUM1QmhGLGNBQWMsQ0FBQ2dGLFFBQVEsR0FBRyxLQUFLLEVBQy9CO1FBQ0EsTUFBTSx3RUFBd0U7TUFDaEY7TUFFQSxJQUNFLENBQUNDLE1BQU0sQ0FBQ0MsU0FBUyxDQUFDbEYsY0FBYyxDQUFDbUYsU0FBUyxDQUFDLElBQzNDbkYsY0FBYyxDQUFDbUYsU0FBUyxHQUFHLENBQUMsSUFDNUJuRixjQUFjLENBQUNtRixTQUFTLEdBQUcsR0FBRyxFQUM5QjtRQUNBLE1BQU0sa0ZBQWtGO01BQzFGO01BRUEsSUFBSW5GLGNBQWMsQ0FBQ29GLHFCQUFxQixLQUFLdEMsU0FBUyxFQUFFO1FBQ3REOUMsY0FBYyxDQUFDb0YscUJBQXFCLEdBQUdDLGtDQUFxQixDQUFDRCxxQkFBcUIsQ0FBQzFILE9BQU87TUFDNUYsQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFBNEYsaUJBQVMsRUFBQ3RELGNBQWMsQ0FBQ29GLHFCQUFxQixDQUFDLEVBQUU7UUFDM0QsTUFBTSw2RUFBNkU7TUFDckY7SUFDRjtFQUNGO0VBRUEsT0FBTy9ELHNCQUFzQkEsQ0FBQzVCLGNBQWMsRUFBRTtJQUM1QyxJQUFJQSxjQUFjLEVBQUU7TUFDbEIsSUFDRUEsY0FBYyxDQUFDNkYsY0FBYyxLQUFLeEMsU0FBUyxLQUMxQyxPQUFPckQsY0FBYyxDQUFDNkYsY0FBYyxLQUFLLFFBQVEsSUFBSTdGLGNBQWMsQ0FBQzZGLGNBQWMsR0FBRyxDQUFDLENBQUMsRUFDeEY7UUFDQSxNQUFNLHlEQUF5RDtNQUNqRTtNQUVBLElBQ0U3RixjQUFjLENBQUM4RiwwQkFBMEIsS0FBS3pDLFNBQVMsS0FDdEQsT0FBT3JELGNBQWMsQ0FBQzhGLDBCQUEwQixLQUFLLFFBQVEsSUFDNUQ5RixjQUFjLENBQUM4RiwwQkFBMEIsSUFBSSxDQUFDLENBQUMsRUFDakQ7UUFDQSxNQUFNLHFFQUFxRTtNQUM3RTtNQUVBLElBQUk5RixjQUFjLENBQUMrRixnQkFBZ0IsRUFBRTtRQUNuQyxJQUFJLE9BQU8vRixjQUFjLENBQUMrRixnQkFBZ0IsS0FBSyxRQUFRLEVBQUU7VUFDdkQvRixjQUFjLENBQUMrRixnQkFBZ0IsR0FBRyxJQUFJQyxNQUFNLENBQUNoRyxjQUFjLENBQUMrRixnQkFBZ0IsQ0FBQztRQUMvRSxDQUFDLE1BQU0sSUFBSSxFQUFFL0YsY0FBYyxDQUFDK0YsZ0JBQWdCLFlBQVlDLE1BQU0sQ0FBQyxFQUFFO1VBQy9ELE1BQU0sMEVBQTBFO1FBQ2xGO01BQ0Y7TUFFQSxJQUNFaEcsY0FBYyxDQUFDaUcsaUJBQWlCLElBQ2hDLE9BQU9qRyxjQUFjLENBQUNpRyxpQkFBaUIsS0FBSyxVQUFVLEVBQ3REO1FBQ0EsTUFBTSxzREFBc0Q7TUFDOUQ7TUFFQSxJQUNFakcsY0FBYyxDQUFDa0csa0JBQWtCLElBQ2pDLE9BQU9sRyxjQUFjLENBQUNrRyxrQkFBa0IsS0FBSyxTQUFTLEVBQ3REO1FBQ0EsTUFBTSw0REFBNEQ7TUFDcEU7TUFFQSxJQUNFbEcsY0FBYyxDQUFDbUcsa0JBQWtCLEtBQ2hDLENBQUNYLE1BQU0sQ0FBQ0MsU0FBUyxDQUFDekYsY0FBYyxDQUFDbUcsa0JBQWtCLENBQUMsSUFDbkRuRyxjQUFjLENBQUNtRyxrQkFBa0IsSUFBSSxDQUFDLElBQ3RDbkcsY0FBYyxDQUFDbUcsa0JBQWtCLEdBQUcsRUFBRSxDQUFDLEVBQ3pDO1FBQ0EsTUFBTSxxRUFBcUU7TUFDN0U7TUFFQSxJQUNFbkcsY0FBYyxDQUFDb0csc0JBQXNCLElBQ3JDLE9BQU9wRyxjQUFjLENBQUNvRyxzQkFBc0IsS0FBSyxTQUFTLEVBQzFEO1FBQ0EsTUFBTSxnREFBZ0Q7TUFDeEQ7TUFDQSxJQUFJcEcsY0FBYyxDQUFDb0csc0JBQXNCLElBQUksQ0FBQ3BHLGNBQWMsQ0FBQzhGLDBCQUEwQixFQUFFO1FBQ3ZGLE1BQU0sMEVBQTBFO01BQ2xGO01BRUEsSUFDRTlGLGNBQWMsQ0FBQ3FHLGtDQUFrQyxJQUNqRCxPQUFPckcsY0FBYyxDQUFDcUcsa0NBQWtDLEtBQUssU0FBUyxFQUN0RTtRQUNBLE1BQU0sNERBQTREO01BQ3BFO0lBQ0Y7RUFDRjs7RUFFQTtFQUNBLE9BQU90RyxzQkFBc0JBLENBQUNDLGNBQWMsRUFBRTtJQUM1QyxJQUFJQSxjQUFjLElBQUlBLGNBQWMsQ0FBQytGLGdCQUFnQixFQUFFO01BQ3JEL0YsY0FBYyxDQUFDc0csZ0JBQWdCLEdBQUdDLEtBQUssSUFBSTtRQUN6QyxPQUFPdkcsY0FBYyxDQUFDK0YsZ0JBQWdCLENBQUNTLElBQUksQ0FBQ0QsS0FBSyxDQUFDO01BQ3BELENBQUM7SUFDSDtFQUNGO0VBRUEsT0FBT25ELDBCQUEwQkEsQ0FBQztJQUNoQ0QsWUFBWTtJQUNaSCxPQUFPO0lBQ1AvQyxlQUFlO0lBQ2ZnRCxnQ0FBZ0M7SUFDaENDO0VBQ0YsQ0FBQyxFQUFFO0lBQ0QsSUFBSSxDQUFDQyxZQUFZLEVBQUU7TUFDakIsTUFBTSwwRUFBMEU7SUFDbEY7SUFDQSxJQUFJLE9BQU9ILE9BQU8sS0FBSyxRQUFRLEVBQUU7TUFDL0IsTUFBTSxzRUFBc0U7SUFDOUU7SUFDQSxJQUFJLE9BQU8vQyxlQUFlLEtBQUssUUFBUSxFQUFFO01BQ3ZDLE1BQU0sOEVBQThFO0lBQ3RGO0lBQ0EsSUFBSWdELGdDQUFnQyxFQUFFO01BQ3BDLElBQUlvQyxLQUFLLENBQUNwQyxnQ0FBZ0MsQ0FBQyxFQUFFO1FBQzNDLE1BQU0sOERBQThEO01BQ3RFLENBQUMsTUFBTSxJQUFJQSxnQ0FBZ0MsSUFBSSxDQUFDLEVBQUU7UUFDaEQsTUFBTSxzRUFBc0U7TUFDOUU7SUFDRjtJQUNBLElBQUlDLDRCQUE0QixJQUFJLE9BQU9BLDRCQUE0QixLQUFLLFNBQVMsRUFBRTtNQUNyRixNQUFNLHNEQUFzRDtJQUM5RDtJQUNBLElBQUlBLDRCQUE0QixJQUFJLENBQUNELGdDQUFnQyxFQUFFO01BQ3JFLE1BQU0sc0ZBQXNGO0lBQzlGO0VBQ0Y7RUFFQSxPQUFPcEIseUJBQXlCQSxDQUFDZCxVQUFVLEVBQUU7SUFDM0MsSUFBSTtNQUNGLElBQUlBLFVBQVUsSUFBSSxJQUFJLElBQUksT0FBT0EsVUFBVSxLQUFLLFFBQVEsSUFBSUEsVUFBVSxZQUFZdUMsS0FBSyxFQUFFO1FBQ3ZGLE1BQU0scUNBQXFDO01BQzdDO0lBQ0YsQ0FBQyxDQUFDLE9BQU9tRCxDQUFDLEVBQUU7TUFDVixJQUFJQSxDQUFDLFlBQVlDLGNBQWMsRUFBRTtRQUMvQjtNQUNGO01BQ0EsTUFBTUQsQ0FBQztJQUNUO0lBQ0EsSUFBSTFGLFVBQVUsQ0FBQzRGLHNCQUFzQixLQUFLdEQsU0FBUyxFQUFFO01BQ25EdEMsVUFBVSxDQUFDNEYsc0JBQXNCLEdBQUdDLDhCQUFpQixDQUFDRCxzQkFBc0IsQ0FBQzFJLE9BQU87SUFDdEYsQ0FBQyxNQUFNLElBQUksT0FBTzhDLFVBQVUsQ0FBQzRGLHNCQUFzQixLQUFLLFNBQVMsRUFBRTtNQUNqRSxNQUFNLDREQUE0RDtJQUNwRTtJQUNBLElBQUk1RixVQUFVLENBQUM4RixlQUFlLEtBQUt4RCxTQUFTLEVBQUU7TUFDNUN0QyxVQUFVLENBQUM4RixlQUFlLEdBQUdELDhCQUFpQixDQUFDQyxlQUFlLENBQUM1SSxPQUFPO0lBQ3hFLENBQUMsTUFBTSxJQUFJLE9BQU84QyxVQUFVLENBQUM4RixlQUFlLEtBQUssU0FBUyxFQUFFO01BQzFELE1BQU0scURBQXFEO0lBQzdEO0lBQ0EsSUFBSTlGLFVBQVUsQ0FBQytGLDBCQUEwQixLQUFLekQsU0FBUyxFQUFFO01BQ3ZEdEMsVUFBVSxDQUFDK0YsMEJBQTBCLEdBQUdGLDhCQUFpQixDQUFDRSwwQkFBMEIsQ0FBQzdJLE9BQU87SUFDOUYsQ0FBQyxNQUFNLElBQUksT0FBTzhDLFVBQVUsQ0FBQytGLDBCQUEwQixLQUFLLFNBQVMsRUFBRTtNQUNyRSxNQUFNLGdFQUFnRTtJQUN4RTtJQUNBLElBQUkvRixVQUFVLENBQUNnRyxjQUFjLEtBQUsxRCxTQUFTLEVBQUU7TUFDM0N0QyxVQUFVLENBQUNnRyxjQUFjLEdBQUdILDhCQUFpQixDQUFDRyxjQUFjLENBQUM5SSxPQUFPO0lBQ3RFLENBQUMsTUFBTSxJQUFJLENBQUNxRixLQUFLLENBQUNDLE9BQU8sQ0FBQ3hDLFVBQVUsQ0FBQ2dHLGNBQWMsQ0FBQyxFQUFFO01BQ3BELE1BQU0sNkNBQTZDO0lBQ3JEO0VBQ0Y7RUFFQSxPQUFPL0UsV0FBV0EsQ0FBQ2dGLEtBQUssRUFBRXhHLFlBQVksRUFBRTtJQUN0QyxLQUFLLElBQUl5RyxFQUFFLElBQUl6RyxZQUFZLEVBQUU7TUFDM0IsSUFBSXlHLEVBQUUsQ0FBQ0MsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ3BCRCxFQUFFLEdBQUdBLEVBQUUsQ0FBQ0UsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUN2QjtNQUNBLElBQUksQ0FBQ0MsWUFBRyxDQUFDQyxJQUFJLENBQUNKLEVBQUUsQ0FBQyxFQUFFO1FBQ2pCLE1BQU8sNEJBQTJCRCxLQUFNLHFDQUFvQ0MsRUFBRyxJQUFHO01BQ3BGO0lBQ0Y7RUFDRjtFQUVBLElBQUl2SSxLQUFLQSxDQUFBLEVBQUc7SUFDVixJQUFJQSxLQUFLLEdBQUcsSUFBSSxDQUFDNEksTUFBTTtJQUN2QixJQUFJLElBQUksQ0FBQ3JILGVBQWUsRUFBRTtNQUN4QnZCLEtBQUssR0FBRyxJQUFJLENBQUN1QixlQUFlO0lBQzlCO0lBQ0EsT0FBT3ZCLEtBQUs7RUFDZDtFQUVBLElBQUlBLEtBQUtBLENBQUM2SSxRQUFRLEVBQUU7SUFDbEIsSUFBSSxDQUFDRCxNQUFNLEdBQUdDLFFBQVE7RUFDeEI7RUFFQSxPQUFPeEYsNEJBQTRCQSxDQUFDM0IsYUFBYSxFQUFFRCxzQkFBc0IsRUFBRTtJQUN6RSxJQUFJQSxzQkFBc0IsRUFBRTtNQUMxQixJQUFJa0YsS0FBSyxDQUFDakYsYUFBYSxDQUFDLEVBQUU7UUFDeEIsTUFBTSx3Q0FBd0M7TUFDaEQsQ0FBQyxNQUFNLElBQUlBLGFBQWEsSUFBSSxDQUFDLEVBQUU7UUFDN0IsTUFBTSxnREFBZ0Q7TUFDeEQ7SUFDRjtFQUNGO0VBRUEsT0FBTzZCLG9CQUFvQkEsQ0FBQzVCLFlBQVksRUFBRTtJQUN4QyxJQUFJQSxZQUFZLElBQUksSUFBSSxFQUFFO01BQ3hCQSxZQUFZLEdBQUdtSCwrQkFBa0IsQ0FBQ25ILFlBQVksQ0FBQ3BDLE9BQU87SUFDeEQ7SUFDQSxJQUFJLE9BQU9vQyxZQUFZLEtBQUssUUFBUSxFQUFFO01BQ3BDLE1BQU0saUNBQWlDO0lBQ3pDO0lBQ0EsSUFBSUEsWUFBWSxJQUFJLENBQUMsRUFBRTtNQUNyQixNQUFNLCtDQUErQztJQUN2RDtFQUNGO0VBRUEsT0FBTzZCLGdCQUFnQkEsQ0FBQzVCLFFBQVEsRUFBRTtJQUNoQyxJQUFJQSxRQUFRLElBQUksQ0FBQyxFQUFFO01BQ2pCLE1BQU0sMkNBQTJDO0lBQ25EO0VBQ0Y7RUFFQSxPQUFPNkIsb0JBQW9CQSxDQUFDdEIsWUFBWSxFQUFFO0lBQ3hDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRXdDLFNBQVMsQ0FBQyxDQUFDNkQsUUFBUSxDQUFDckcsWUFBWSxDQUFDLEVBQUU7TUFDN0MsSUFBSXlDLEtBQUssQ0FBQ0MsT0FBTyxDQUFDMUMsWUFBWSxDQUFDLEVBQUU7UUFDL0JBLFlBQVksQ0FBQzdCLE9BQU8sQ0FBQ3lJLE1BQU0sSUFBSTtVQUM3QixJQUFJLE9BQU9BLE1BQU0sS0FBSyxRQUFRLEVBQUU7WUFDOUIsTUFBTSx5Q0FBeUM7VUFDakQsQ0FBQyxNQUFNLElBQUksQ0FBQ0EsTUFBTSxDQUFDQyxJQUFJLENBQUMsQ0FBQyxDQUFDcEosTUFBTSxFQUFFO1lBQ2hDLE1BQU0sOENBQThDO1VBQ3REO1FBQ0YsQ0FBQyxDQUFDO01BQ0osQ0FBQyxNQUFNO1FBQ0wsTUFBTSxnQ0FBZ0M7TUFDeEM7SUFDRjtFQUNGO0VBRUEsT0FBT3NFLGlCQUFpQkEsQ0FBQ3RCLFNBQVMsRUFBRTtJQUNsQyxLQUFLLE1BQU1yQyxHQUFHLElBQUlILE1BQU0sQ0FBQ0MsSUFBSSxDQUFDNEksc0JBQVMsQ0FBQyxFQUFFO01BQ3hDLElBQUlyRyxTQUFTLENBQUNyQyxHQUFHLENBQUMsRUFBRTtRQUNsQixJQUFJMkksMkJBQWMsQ0FBQ0MsT0FBTyxDQUFDdkcsU0FBUyxDQUFDckMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRTtVQUNqRCxNQUFPLElBQUdBLEdBQUksb0JBQW1CNkksSUFBSSxDQUFDQyxTQUFTLENBQUNILDJCQUFjLENBQUUsRUFBQztRQUNuRTtNQUNGLENBQUMsTUFBTTtRQUNMdEcsU0FBUyxDQUFDckMsR0FBRyxDQUFDLEdBQUcwSSxzQkFBUyxDQUFDMUksR0FBRyxDQUFDLENBQUNoQixPQUFPO01BQ3pDO0lBQ0Y7RUFDRjtFQUVBLE9BQU80RSx1QkFBdUJBLENBQUNyQixlQUFlLEVBQUU7SUFDOUMsSUFBSUEsZUFBZSxJQUFJNkIsU0FBUyxFQUFFO01BQ2hDO0lBQ0Y7SUFDQSxJQUFJdkUsTUFBTSxDQUFDMEUsU0FBUyxDQUFDQyxRQUFRLENBQUNDLElBQUksQ0FBQ2xDLGVBQWUsQ0FBQyxLQUFLLGlCQUFpQixFQUFFO01BQ3pFLE1BQU8sbUNBQWtDO0lBQzNDO0lBQ0EsSUFBSUEsZUFBZSxDQUFDd0csaUJBQWlCLEtBQUszRSxTQUFTLEVBQUU7TUFDbkQ3QixlQUFlLENBQUN3RyxpQkFBaUIsR0FBR0MsNEJBQWUsQ0FBQ0QsaUJBQWlCLENBQUMvSixPQUFPO0lBQy9FLENBQUMsTUFBTSxJQUFJLE9BQU91RCxlQUFlLENBQUN3RyxpQkFBaUIsS0FBSyxTQUFTLEVBQUU7TUFDakUsTUFBTyxxREFBb0Q7SUFDN0Q7SUFDQSxJQUFJeEcsZUFBZSxDQUFDMEcsY0FBYyxLQUFLN0UsU0FBUyxFQUFFO01BQ2hEN0IsZUFBZSxDQUFDMEcsY0FBYyxHQUFHRCw0QkFBZSxDQUFDQyxjQUFjLENBQUNqSyxPQUFPO0lBQ3pFLENBQUMsTUFBTSxJQUFJLE9BQU91RCxlQUFlLENBQUMwRyxjQUFjLEtBQUssUUFBUSxFQUFFO01BQzdELE1BQU8saURBQWdEO0lBQ3pEO0VBQ0Y7RUFFQSxPQUFPdkYsaUJBQWlCQSxDQUFDcEIsU0FBUyxFQUFFO0lBQ2xDLElBQUksQ0FBQ0EsU0FBUyxFQUFFO01BQ2Q7SUFDRjtJQUNBLElBQ0V6QyxNQUFNLENBQUMwRSxTQUFTLENBQUNDLFFBQVEsQ0FBQ0MsSUFBSSxDQUFDbkMsU0FBUyxDQUFDLEtBQUssaUJBQWlCLElBQy9ELENBQUMrQixLQUFLLENBQUNDLE9BQU8sQ0FBQ2hDLFNBQVMsQ0FBQyxFQUN6QjtNQUNBLE1BQU8sc0NBQXFDO0lBQzlDO0lBQ0EsTUFBTTRHLE9BQU8sR0FBRzdFLEtBQUssQ0FBQ0MsT0FBTyxDQUFDaEMsU0FBUyxDQUFDLEdBQUdBLFNBQVMsR0FBRyxDQUFDQSxTQUFTLENBQUM7SUFDbEUsS0FBSyxNQUFNNkcsTUFBTSxJQUFJRCxPQUFPLEVBQUU7TUFDNUIsSUFBSXJKLE1BQU0sQ0FBQzBFLFNBQVMsQ0FBQ0MsUUFBUSxDQUFDQyxJQUFJLENBQUMwRSxNQUFNLENBQUMsS0FBSyxpQkFBaUIsRUFBRTtRQUNoRSxNQUFPLHVDQUFzQztNQUMvQztNQUNBLElBQUlBLE1BQU0sQ0FBQ0MsV0FBVyxJQUFJLElBQUksRUFBRTtRQUM5QixNQUFPLHVDQUFzQztNQUMvQztNQUNBLElBQUksT0FBT0QsTUFBTSxDQUFDQyxXQUFXLEtBQUssUUFBUSxFQUFFO1FBQzFDLE1BQU8sd0NBQXVDO01BQ2hEO01BQ0EsSUFBSUQsTUFBTSxDQUFDRSxpQkFBaUIsSUFBSSxJQUFJLEVBQUU7UUFDcEMsTUFBTyw2Q0FBNEM7TUFDckQ7TUFDQSxJQUFJLE9BQU9GLE1BQU0sQ0FBQ0UsaUJBQWlCLEtBQUssUUFBUSxFQUFFO1FBQ2hELE1BQU8sOENBQTZDO01BQ3REO01BQ0EsSUFBSUYsTUFBTSxDQUFDRyx1QkFBdUIsSUFBSSxPQUFPSCxNQUFNLENBQUNHLHVCQUF1QixLQUFLLFNBQVMsRUFBRTtRQUN6RixNQUFPLHFEQUFvRDtNQUM3RDtNQUNBLElBQUlILE1BQU0sQ0FBQ0ksWUFBWSxJQUFJLElBQUksRUFBRTtRQUMvQixNQUFPLHdDQUF1QztNQUNoRDtNQUNBLElBQUksT0FBT0osTUFBTSxDQUFDSSxZQUFZLEtBQUssUUFBUSxFQUFFO1FBQzNDLE1BQU8seUNBQXdDO01BQ2pEO01BQ0EsSUFBSUosTUFBTSxDQUFDSyxvQkFBb0IsSUFBSSxPQUFPTCxNQUFNLENBQUNLLG9CQUFvQixLQUFLLFFBQVEsRUFBRTtRQUNsRixNQUFPLGlEQUFnRDtNQUN6RDtNQUNBLE1BQU1OLE9BQU8sR0FBR3JKLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDMkosY0FBVyxDQUFDQyxhQUFhLENBQUM7TUFDdEQsSUFBSVAsTUFBTSxDQUFDUSxJQUFJLElBQUksQ0FBQ1QsT0FBTyxDQUFDakIsUUFBUSxDQUFDa0IsTUFBTSxDQUFDUSxJQUFJLENBQUMsRUFBRTtRQUNqRCxNQUFNQyxTQUFTLEdBQUcsSUFBSUMsSUFBSSxDQUFDQyxVQUFVLENBQUMsSUFBSSxFQUFFO1VBQUVDLEtBQUssRUFBRSxPQUFPO1VBQUVDLElBQUksRUFBRTtRQUFjLENBQUMsQ0FBQztRQUNwRixNQUFPLGlDQUFnQ0osU0FBUyxDQUFDSyxNQUFNLENBQUNmLE9BQU8sQ0FBRSxFQUFDO01BQ3BFO0lBQ0Y7RUFDRjtFQUVBM0ksaUNBQWlDQSxDQUFBLEVBQUc7SUFDbEMsSUFBSSxDQUFDLElBQUksQ0FBQ3NELGdCQUFnQixJQUFJLENBQUMsSUFBSSxDQUFDRyxnQ0FBZ0MsRUFBRTtNQUNwRSxPQUFPSSxTQUFTO0lBQ2xCO0lBQ0EsSUFBSThGLEdBQUcsR0FBRyxJQUFJQyxJQUFJLENBQUMsQ0FBQztJQUNwQixPQUFPLElBQUlBLElBQUksQ0FBQ0QsR0FBRyxDQUFDRSxPQUFPLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQ3BHLGdDQUFnQyxHQUFHLElBQUksQ0FBQztFQUMvRTtFQUVBcUcsbUNBQW1DQSxDQUFBLEVBQUc7SUFDcEMsSUFBSSxDQUFDLElBQUksQ0FBQ3RKLGNBQWMsSUFBSSxDQUFDLElBQUksQ0FBQ0EsY0FBYyxDQUFDOEYsMEJBQTBCLEVBQUU7TUFDM0UsT0FBT3pDLFNBQVM7SUFDbEI7SUFDQSxNQUFNOEYsR0FBRyxHQUFHLElBQUlDLElBQUksQ0FBQyxDQUFDO0lBQ3RCLE9BQU8sSUFBSUEsSUFBSSxDQUFDRCxHQUFHLENBQUNFLE9BQU8sQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDckosY0FBYyxDQUFDOEYsMEJBQTBCLEdBQUcsSUFBSSxDQUFDO0VBQ3hGO0VBRUF4Ryx3QkFBd0JBLENBQUEsRUFBRztJQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDYSxzQkFBc0IsRUFBRTtNQUNoQyxPQUFPa0QsU0FBUztJQUNsQjtJQUNBLElBQUk4RixHQUFHLEdBQUcsSUFBSUMsSUFBSSxDQUFDLENBQUM7SUFDcEIsT0FBTyxJQUFJQSxJQUFJLENBQUNELEdBQUcsQ0FBQ0UsT0FBTyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUNqSixhQUFhLEdBQUcsSUFBSSxDQUFDO0VBQzVEO0VBRUFtSixzQkFBc0JBLENBQUEsRUFBRztJQUFBLElBQUFDLGdCQUFBO0lBQ3ZCLElBQUlDLENBQUMsSUFBQUQsZ0JBQUEsR0FBRyxJQUFJLENBQUNFLFVBQVUsY0FBQUYsZ0JBQUEsdUJBQWZBLGdCQUFBLENBQWlCbEwsTUFBTTtJQUMvQixPQUFPbUwsQ0FBQyxFQUFFLEVBQUU7TUFDVixNQUFNRSxLQUFLLEdBQUcsSUFBSSxDQUFDRCxVQUFVLENBQUNELENBQUMsQ0FBQztNQUNoQyxJQUFJRSxLQUFLLENBQUNDLEtBQUssRUFBRTtRQUNmLElBQUksQ0FBQ0YsVUFBVSxDQUFDRyxNQUFNLENBQUNKLENBQUMsRUFBRSxDQUFDLENBQUM7TUFDOUI7SUFDRjtFQUNGO0VBRUEsSUFBSUssY0FBY0EsQ0FBQSxFQUFHO0lBQ25CLE9BQU8sSUFBSSxDQUFDQyxXQUFXLENBQUNDLFdBQVcsSUFBSyxHQUFFLElBQUksQ0FBQy9KLGVBQWdCLHlCQUF3QjtFQUN6RjtFQUVBLElBQUlnSywwQkFBMEJBLENBQUEsRUFBRztJQUMvQixPQUNFLElBQUksQ0FBQ0YsV0FBVyxDQUFDRyx1QkFBdUIsSUFDdkMsR0FBRSxJQUFJLENBQUNqSyxlQUFnQixzQ0FBcUM7RUFFakU7RUFFQSxJQUFJa0ssa0JBQWtCQSxDQUFBLEVBQUc7SUFDdkIsT0FDRSxJQUFJLENBQUNKLFdBQVcsQ0FBQ0ssZUFBZSxJQUFLLEdBQUUsSUFBSSxDQUFDbkssZUFBZ0IsOEJBQTZCO0VBRTdGO0VBRUEsSUFBSW9LLGVBQWVBLENBQUEsRUFBRztJQUNwQixPQUFPLElBQUksQ0FBQ04sV0FBVyxDQUFDTyxZQUFZLElBQUssR0FBRSxJQUFJLENBQUNySyxlQUFnQiwyQkFBMEI7RUFDNUY7RUFFQSxJQUFJc0sscUJBQXFCQSxDQUFBLEVBQUc7SUFDMUIsT0FDRSxJQUFJLENBQUNSLFdBQVcsQ0FBQ1Msa0JBQWtCLElBQ2xDLEdBQUUsSUFBSSxDQUFDdkssZUFBZ0IsaUNBQWdDO0VBRTVEO0VBRUEsSUFBSXdLLGlCQUFpQkEsQ0FBQSxFQUFHO0lBQ3RCLE9BQU8sSUFBSSxDQUFDVixXQUFXLENBQUNXLGNBQWMsSUFBSyxHQUFFLElBQUksQ0FBQ3pLLGVBQWdCLHVCQUFzQjtFQUMxRjtFQUVBLElBQUkwSyx1QkFBdUJBLENBQUEsRUFBRztJQUM1QixPQUFRLEdBQUUsSUFBSSxDQUFDMUssZUFBZ0IsSUFBRyxJQUFJLENBQUMrRSxhQUFjLElBQUcsSUFBSSxDQUFDdkcsYUFBYyx5QkFBd0I7RUFDckc7RUFFQSxJQUFJbU0sdUJBQXVCQSxDQUFBLEVBQUc7SUFDNUIsT0FDRSxJQUFJLENBQUNiLFdBQVcsQ0FBQ2Msb0JBQW9CLElBQ3BDLEdBQUUsSUFBSSxDQUFDNUssZUFBZ0IsbUNBQWtDO0VBRTlEO0VBRUEsSUFBSTZLLGFBQWFBLENBQUEsRUFBRztJQUNsQixPQUFPLElBQUksQ0FBQ2YsV0FBVyxDQUFDZSxhQUFhO0VBQ3ZDO0VBRUEsSUFBSUMsY0FBY0EsQ0FBQSxFQUFHO0lBQ25CLE9BQVEsR0FBRSxJQUFJLENBQUM5SyxlQUFnQixJQUFHLElBQUksQ0FBQytFLGFBQWMsSUFBRyxJQUFJLENBQUN2RyxhQUFjLGVBQWM7RUFDM0Y7O0VBRUE7RUFDQTtFQUNBLElBQUl1RyxhQUFhQSxDQUFBLEVBQUc7SUFDbEIsT0FBTyxJQUFJLENBQUNoRSxLQUFLLElBQUksSUFBSSxDQUFDQSxLQUFLLENBQUN1RCxZQUFZLElBQUksSUFBSSxDQUFDdkQsS0FBSyxDQUFDZ0UsYUFBYSxHQUNwRSxJQUFJLENBQUNoRSxLQUFLLENBQUNnRSxhQUFhLEdBQ3hCLE1BQU07RUFDWjtBQUNGO0FBQUNnRyxPQUFBLENBQUF6TSxNQUFBLEdBQUFBLE1BQUE7QUFBQSxJQUFBME0sUUFBQSxHQUVjMU0sTUFBTTtBQUFBeU0sT0FBQSxDQUFBL00sT0FBQSxHQUFBZ04sUUFBQTtBQUNyQkMsTUFBTSxDQUFDRixPQUFPLEdBQUd6TSxNQUFNIn0=