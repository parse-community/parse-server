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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJyZW1vdmVUcmFpbGluZ1NsYXNoIiwic3RyIiwiZW5kc1dpdGgiLCJzdWJzdHJpbmciLCJsZW5ndGgiLCJDb25maWciLCJnZXQiLCJhcHBsaWNhdGlvbklkIiwibW91bnQiLCJjYWNoZUluZm8iLCJBcHBDYWNoZSIsImNvbmZpZyIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwia2V5IiwiZGF0YWJhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYmluZCIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInZlcnNpb24iLCJwdXQiLCJzZXJ2ZXJDb25maWd1cmF0aW9uIiwidmFsaWRhdGVPcHRpb25zIiwidmFsaWRhdGVDb250cm9sbGVycyIsImFwcElkIiwic2V0dXBQYXNzd29yZFZhbGlkYXRvciIsInBhc3N3b3JkUG9saWN5IiwicHVibGljU2VydmVyVVJMIiwicmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCIsImV4cGlyZUluYWN0aXZlU2Vzc2lvbnMiLCJzZXNzaW9uTGVuZ3RoIiwiZGVmYXVsdExpbWl0IiwibWF4TGltaXQiLCJhY2NvdW50TG9ja291dCIsIm1hc3RlcktleUlwcyIsIm1hc3RlcktleSIsIm1haW50ZW5hbmNlS2V5IiwibWFpbnRlbmFuY2VLZXlJcHMiLCJyZWFkT25seU1hc3RlcktleSIsImFsbG93SGVhZGVycyIsImlkZW1wb3RlbmN5T3B0aW9ucyIsImZpbGVVcGxvYWQiLCJwYWdlcyIsInNlY3VyaXR5IiwiZW5mb3JjZVByaXZhdGVVc2VycyIsInNjaGVtYSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIiwibG9nTGV2ZWxzIiwicmF0ZUxpbWl0IiwiZGF0YWJhc2VPcHRpb25zIiwiZXh0ZW5kU2Vzc2lvbk9uVXNlIiwiRXJyb3IiLCJ2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5IiwidmFsaWRhdGVQYXNzd29yZFBvbGljeSIsInZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMiLCJzdGFydHNXaXRoIiwidmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbiIsInZhbGlkYXRlSXBzIiwidmFsaWRhdGVEZWZhdWx0TGltaXQiLCJ2YWxpZGF0ZU1heExpbWl0IiwidmFsaWRhdGVBbGxvd0hlYWRlcnMiLCJ2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyIsInZhbGlkYXRlUGFnZXNPcHRpb25zIiwidmFsaWRhdGVTZWN1cml0eU9wdGlvbnMiLCJ2YWxpZGF0ZVNjaGVtYU9wdGlvbnMiLCJ2YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMiLCJ2YWxpZGF0ZUFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4iLCJ2YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJ2YWxpZGF0ZVJhdGVMaW1pdCIsInZhbGlkYXRlTG9nTGV2ZWxzIiwidmFsaWRhdGVEYXRhYmFzZU9wdGlvbnMiLCJ2ZXJpZnlVc2VyRW1haWxzIiwidXNlckNvbnRyb2xsZXIiLCJhcHBOYW1lIiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIiwiZW1haWxBZGFwdGVyIiwidmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24iLCJ1bmRlZmluZWQiLCJkZWZhdWx0IiwiQXJyYXkiLCJpc0FycmF5IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwiZW5hYmxlQ2hlY2siLCJTZWN1cml0eU9wdGlvbnMiLCJpc0Jvb2xlYW4iLCJlbmFibGVDaGVja0xvZyIsImRlZmluaXRpb25zIiwiU2NoZW1hT3B0aW9ucyIsInN0cmljdCIsImRlbGV0ZUV4dHJhRmllbGRzIiwicmVjcmVhdGVNb2RpZmllZEZpZWxkcyIsImxvY2tTY2hlbWFzIiwiYmVmb3JlTWlncmF0aW9uIiwiYWZ0ZXJNaWdyYXRpb24iLCJlbmFibGVSb3V0ZXIiLCJQYWdlc09wdGlvbnMiLCJlbmFibGVMb2NhbGl6YXRpb24iLCJsb2NhbGl6YXRpb25Kc29uUGF0aCIsImlzU3RyaW5nIiwibG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUiLCJwbGFjZWhvbGRlcnMiLCJmb3JjZVJlZGlyZWN0IiwicGFnZXNQYXRoIiwicGFnZXNFbmRwb2ludCIsImN1c3RvbVVybHMiLCJjdXN0b21Sb3V0ZXMiLCJ0dGwiLCJJZGVtcG90ZW5jeU9wdGlvbnMiLCJpc05hTiIsInBhdGhzIiwiZHVyYXRpb24iLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJ0aHJlc2hvbGQiLCJ1bmxvY2tPblBhc3N3b3JkUmVzZXQiLCJBY2NvdW50TG9ja291dE9wdGlvbnMiLCJtYXhQYXNzd29yZEFnZSIsInJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwidmFsaWRhdG9yUGF0dGVybiIsIlJlZ0V4cCIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5IiwicmVzZXRUb2tlblJldXNlSWZWYWxpZCIsInJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwiLCJwYXR0ZXJuVmFsaWRhdG9yIiwidmFsdWUiLCJ0ZXN0IiwiZSIsIlJlZmVyZW5jZUVycm9yIiwiZW5hYmxlRm9yQW5vbnltb3VzVXNlciIsIkZpbGVVcGxvYWRPcHRpb25zIiwiZW5hYmxlRm9yUHVibGljIiwiZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIiLCJmaWxlRXh0ZW5zaW9ucyIsImZpZWxkIiwiaXAiLCJpbmNsdWRlcyIsInNwbGl0IiwibmV0IiwiaXNJUCIsIl9tb3VudCIsIm5ld1ZhbHVlIiwiUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaGVhZGVyIiwidHJpbSIsIkxvZ0xldmVscyIsInZhbGlkTG9nTGV2ZWxzIiwiaW5kZXhPZiIsIkpTT04iLCJzdHJpbmdpZnkiLCJlbmFibGVTY2hlbWFIb29rcyIsIkRhdGFiYXNlT3B0aW9ucyIsInNjaGVtYUNhY2hlVHRsIiwib3B0aW9ucyIsIm9wdGlvbiIsInJlcXVlc3RQYXRoIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJpbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyIsInJlcXVlc3RDb3VudCIsImVycm9yUmVzcG9uc2VNZXNzYWdlIiwiUGFyc2VTZXJ2ZXIiLCJSYXRlTGltaXRab25lIiwiem9uZSIsImZvcm1hdHRlciIsIkludGwiLCJMaXN0Rm9ybWF0Iiwic3R5bGUiLCJ0eXBlIiwiZm9ybWF0Iiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCIsInVucmVnaXN0ZXJSYXRlTGltaXRlcnMiLCJpIiwicmF0ZUxpbWl0cyIsImxpbWl0IiwiY2xvdWQiLCJzcGxpY2UiLCJpbnZhbGlkTGlua1VSTCIsImN1c3RvbVBhZ2VzIiwiaW52YWxpZExpbmsiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCIsImludmFsaWRWZXJpZmljYXRpb25MaW5rIiwibGlua1NlbmRTdWNjZXNzVVJMIiwibGlua1NlbmRTdWNjZXNzIiwibGlua1NlbmRGYWlsVVJMIiwibGlua1NlbmRGYWlsIiwidmVyaWZ5RW1haWxTdWNjZXNzVVJMIiwidmVyaWZ5RW1haWxTdWNjZXNzIiwiY2hvb3NlUGFzc3dvcmRVUkwiLCJjaG9vc2VQYXNzd29yZCIsInJlcXVlc3RSZXNldFBhc3N3b3JkVVJMIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwiLCJwYXNzd29yZFJlc2V0U3VjY2VzcyIsInBhcnNlRnJhbWVVUkwiLCJ2ZXJpZnlFbWFpbFVSTCIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi9zcmMvQ29uZmlnLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEEgQ29uZmlnIG9iamVjdCBwcm92aWRlcyBpbmZvcm1hdGlvbiBhYm91dCBob3cgYSBzcGVjaWZpYyBhcHAgaXNcbi8vIGNvbmZpZ3VyZWQuXG4vLyBtb3VudCBpcyB0aGUgVVJMIGZvciB0aGUgcm9vdCBvZiB0aGUgQVBJOyBpbmNsdWRlcyBodHRwLCBkb21haW4sIGV0Yy5cblxuaW1wb3J0IHsgaXNCb29sZWFuLCBpc1N0cmluZyB9IGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgQXBwQ2FjaGUgZnJvbSAnLi9jYWNoZSc7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4vQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCB7IGxvZ0xldmVscyBhcyB2YWxpZExvZ0xldmVscyB9IGZyb20gJy4vQ29udHJvbGxlcnMvTG9nZ2VyQ29udHJvbGxlcic7XG5pbXBvcnQgeyB2ZXJzaW9uIH0gZnJvbSAnLi4vcGFja2FnZS5qc29uJztcbmltcG9ydCB7XG4gIEFjY291bnRMb2Nrb3V0T3B0aW9ucyxcbiAgRGF0YWJhc2VPcHRpb25zLFxuICBGaWxlVXBsb2FkT3B0aW9ucyxcbiAgSWRlbXBvdGVuY3lPcHRpb25zLFxuICBMb2dMZXZlbHMsXG4gIFBhZ2VzT3B0aW9ucyxcbiAgUGFyc2VTZXJ2ZXJPcHRpb25zLFxuICBTY2hlbWFPcHRpb25zLFxuICBTZWN1cml0eU9wdGlvbnMsXG59IGZyb20gJy4vT3B0aW9ucy9EZWZpbml0aW9ucyc7XG5pbXBvcnQgUGFyc2VTZXJ2ZXIgZnJvbSAnLi9jbG91ZC1jb2RlL1BhcnNlLlNlcnZlcic7XG5cbmZ1bmN0aW9uIHJlbW92ZVRyYWlsaW5nU2xhc2goc3RyKSB7XG4gIGlmICghc3RyKSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxuICBpZiAoc3RyLmVuZHNXaXRoKCcvJykpIHtcbiAgICBzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIHN0ci5sZW5ndGggLSAxKTtcbiAgfVxuICByZXR1cm4gc3RyO1xufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlnIHtcbiAgc3RhdGljIGdldChhcHBsaWNhdGlvbklkOiBzdHJpbmcsIG1vdW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCBjYWNoZUluZm8gPSBBcHBDYWNoZS5nZXQoYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCFjYWNoZUluZm8pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29uZmlnID0gbmV3IENvbmZpZygpO1xuICAgIGNvbmZpZy5hcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZDtcbiAgICBPYmplY3Qua2V5cyhjYWNoZUluZm8pLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgPT0gJ2RhdGFiYXNlQ29udHJvbGxlcicpIHtcbiAgICAgICAgY29uZmlnLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlQ29udHJvbGxlcihjYWNoZUluZm8uZGF0YWJhc2VDb250cm9sbGVyLmFkYXB0ZXIsIGNvbmZpZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25maWdba2V5XSA9IGNhY2hlSW5mb1trZXldO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbmZpZy5tb3VudCA9IHJlbW92ZVRyYWlsaW5nU2xhc2gobW91bnQpO1xuICAgIGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0LmJpbmQoY29uZmlnKTtcbiAgICBjb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdC5iaW5kKFxuICAgICAgY29uZmlnXG4gICAgKTtcbiAgICBjb25maWcudmVyc2lvbiA9IHZlcnNpb247XG4gICAgcmV0dXJuIGNvbmZpZztcbiAgfVxuXG4gIHN0YXRpYyBwdXQoc2VydmVyQ29uZmlndXJhdGlvbikge1xuICAgIENvbmZpZy52YWxpZGF0ZU9wdGlvbnMoc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQ29uZmlnLnZhbGlkYXRlQ29udHJvbGxlcnMoc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQXBwQ2FjaGUucHV0KHNlcnZlckNvbmZpZ3VyYXRpb24uYXBwSWQsIHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIENvbmZpZy5zZXR1cFBhc3N3b3JkVmFsaWRhdG9yKHNlcnZlckNvbmZpZ3VyYXRpb24ucGFzc3dvcmRQb2xpY3kpO1xuICAgIHJldHVybiBzZXJ2ZXJDb25maWd1cmF0aW9uO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlT3B0aW9ucyh7XG4gICAgcHVibGljU2VydmVyVVJMLFxuICAgIHJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQsXG4gICAgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyxcbiAgICBzZXNzaW9uTGVuZ3RoLFxuICAgIGRlZmF1bHRMaW1pdCxcbiAgICBtYXhMaW1pdCxcbiAgICBhY2NvdW50TG9ja291dCxcbiAgICBwYXNzd29yZFBvbGljeSxcbiAgICBtYXN0ZXJLZXlJcHMsXG4gICAgbWFzdGVyS2V5LFxuICAgIG1haW50ZW5hbmNlS2V5LFxuICAgIG1haW50ZW5hbmNlS2V5SXBzLFxuICAgIHJlYWRPbmx5TWFzdGVyS2V5LFxuICAgIGFsbG93SGVhZGVycyxcbiAgICBpZGVtcG90ZW5jeU9wdGlvbnMsXG4gICAgZmlsZVVwbG9hZCxcbiAgICBwYWdlcyxcbiAgICBzZWN1cml0eSxcbiAgICBlbmZvcmNlUHJpdmF0ZVVzZXJzLFxuICAgIHNjaGVtYSxcbiAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0LFxuICAgIGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4sXG4gICAgbG9nTGV2ZWxzLFxuICAgIHJhdGVMaW1pdCxcbiAgICBkYXRhYmFzZU9wdGlvbnMsXG4gICAgZXh0ZW5kU2Vzc2lvbk9uVXNlLFxuICB9KSB7XG4gICAgaWYgKG1hc3RlcktleSA9PT0gcmVhZE9ubHlNYXN0ZXJLZXkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbWFzdGVyS2V5IGFuZCByZWFkT25seU1hc3RlcktleSBzaG91bGQgYmUgZGlmZmVyZW50Jyk7XG4gICAgfVxuXG4gICAgaWYgKG1hc3RlcktleSA9PT0gbWFpbnRlbmFuY2VLZXkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbWFzdGVyS2V5IGFuZCBtYWludGVuYW5jZUtleSBzaG91bGQgYmUgZGlmZmVyZW50Jyk7XG4gICAgfVxuXG4gICAgdGhpcy52YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KTtcbiAgICB0aGlzLnZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpO1xuICAgIHRoaXMudmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyhmaWxlVXBsb2FkKTtcblxuICAgIGlmICh0eXBlb2YgcmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAncmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBleHRlbmRTZXNzaW9uT25Vc2UgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2V4dGVuZFNlc3Npb25PblVzZSBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuXG4gICAgaWYgKHB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgaWYgKCFwdWJsaWNTZXJ2ZXJVUkwuc3RhcnRzV2l0aCgnaHR0cDovLycpICYmICFwdWJsaWNTZXJ2ZXJVUkwuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkge1xuICAgICAgICB0aHJvdyAncHVibGljU2VydmVyVVJMIHNob3VsZCBiZSBhIHZhbGlkIEhUVFBTIFVSTCBzdGFydGluZyB3aXRoIGh0dHBzOi8vJztcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy52YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uKHNlc3Npb25MZW5ndGgsIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVJcHMoJ21hc3RlcktleUlwcycsIG1hc3RlcktleUlwcyk7XG4gICAgdGhpcy52YWxpZGF0ZUlwcygnbWFpbnRlbmFuY2VLZXlJcHMnLCBtYWludGVuYW5jZUtleUlwcyk7XG4gICAgdGhpcy52YWxpZGF0ZURlZmF1bHRMaW1pdChkZWZhdWx0TGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCk7XG4gICAgdGhpcy52YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpO1xuICAgIHRoaXMudmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMoaWRlbXBvdGVuY3lPcHRpb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlUGFnZXNPcHRpb25zKHBhZ2VzKTtcbiAgICB0aGlzLnZhbGlkYXRlU2VjdXJpdHlPcHRpb25zKHNlY3VyaXR5KTtcbiAgICB0aGlzLnZhbGlkYXRlU2NoZW1hT3B0aW9ucyhzY2hlbWEpO1xuICAgIHRoaXMudmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzKGVuZm9yY2VQcml2YXRlVXNlcnMpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4pO1xuICAgIHRoaXMudmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpO1xuICAgIHRoaXMudmFsaWRhdGVSYXRlTGltaXQocmF0ZUxpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlTG9nTGV2ZWxzKGxvZ0xldmVscyk7XG4gICAgdGhpcy52YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyhkYXRhYmFzZU9wdGlvbnMpO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQ29udHJvbGxlcnMoe1xuICAgIHZlcmlmeVVzZXJFbWFpbHMsXG4gICAgdXNlckNvbnRyb2xsZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgfSkge1xuICAgIGNvbnN0IGVtYWlsQWRhcHRlciA9IHVzZXJDb250cm9sbGVyLmFkYXB0ZXI7XG4gICAgaWYgKHZlcmlmeVVzZXJFbWFpbHMpIHtcbiAgICAgIHRoaXMudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXIsXG4gICAgICAgIGFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICBpZiAocmVxdWVzdEtleXdvcmREZW55bGlzdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0ID0gcmVxdWVzdEtleXdvcmREZW55bGlzdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkocmVxdWVzdEtleXdvcmREZW55bGlzdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMoZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgIGlmICh0eXBlb2YgZW5mb3JjZVByaXZhdGVVc2VycyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBlbmZvcmNlUHJpdmF0ZVVzZXJzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbihhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKSB7XG4gICAgaWYgKHR5cGVvZiBhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4gbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTZWN1cml0eU9wdGlvbnMoc2VjdXJpdHkpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNlY3VyaXR5KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5IG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChzZWN1cml0eS5lbmFibGVDaGVjayA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzZWN1cml0eS5lbmFibGVDaGVjayA9IFNlY3VyaXR5T3B0aW9ucy5lbmFibGVDaGVjay5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzZWN1cml0eS5lbmFibGVDaGVjaykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5LmVuYWJsZUNoZWNrIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzZWN1cml0eS5lbmFibGVDaGVja0xvZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzZWN1cml0eS5lbmFibGVDaGVja0xvZyA9IFNlY3VyaXR5T3B0aW9ucy5lbmFibGVDaGVja0xvZy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzZWN1cml0eS5lbmFibGVDaGVja0xvZykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2NoZW1hT3B0aW9ucyhzY2hlbWE6IFNjaGVtYU9wdGlvbnMpIHtcbiAgICBpZiAoIXNjaGVtYSkgcmV0dXJuO1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2NoZW1hKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlZmluaXRpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWZpbml0aW9ucyA9IFNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHNjaGVtYS5kZWZpbml0aW9ucykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWZpbml0aW9ucyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuc3RyaWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5zdHJpY3QgPSBTY2hlbWFPcHRpb25zLnN0cmljdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEuc3RyaWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLnN0cmljdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9IFNjaGVtYU9wdGlvbnMuZGVsZXRlRXh0cmFGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9IFNjaGVtYU9wdGlvbnMucmVjcmVhdGVNb2RpZmllZEZpZWxkcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEubG9ja1NjaGVtYXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmxvY2tTY2hlbWFzID0gU2NoZW1hT3B0aW9ucy5sb2NrU2NoZW1hcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEubG9ja1NjaGVtYXMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEubG9ja1NjaGVtYXMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09IG51bGwgJiYgdHlwZW9mIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmFmdGVyTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcykge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZVJvdXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVSb3V0ZXIgPSBQYWdlc09wdGlvbnMuZW5hYmxlUm91dGVyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZVJvdXRlcikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZVJvdXRlciBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9IFBhZ2VzT3B0aW9ucy5lbmFibGVMb2NhbGl6YXRpb24uZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9IFBhZ2VzT3B0aW9ucy5sb2NhbGl6YXRpb25Kc29uUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBsYWNlaG9sZGVycyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wbGFjZWhvbGRlcnMgPSBQYWdlc09wdGlvbnMucGxhY2Vob2xkZXJzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcy5wbGFjZWhvbGRlcnMpICE9PSAnW29iamVjdCBPYmplY3RdJyAmJlxuICAgICAgdHlwZW9mIHBhZ2VzLnBsYWNlaG9sZGVycyAhPT0gJ2Z1bmN0aW9uJ1xuICAgICkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGxhY2Vob2xkZXJzIG11c3QgYmUgYW4gb2JqZWN0IG9yIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmZvcmNlUmVkaXJlY3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZm9yY2VSZWRpcmVjdCA9IFBhZ2VzT3B0aW9ucy5mb3JjZVJlZGlyZWN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmZvcmNlUmVkaXJlY3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5mb3JjZVJlZGlyZWN0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc1BhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGFnZXNQYXRoID0gUGFnZXNPcHRpb25zLnBhZ2VzUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBhZ2VzUGF0aCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc0VuZHBvaW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPSBQYWdlc09wdGlvbnMucGFnZXNFbmRwb2ludC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzRW5kcG9pbnQpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc0VuZHBvaW50IG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmN1c3RvbVVybHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tVXJscyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21VcmxzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMuY3VzdG9tVXJscykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21VcmxzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21Sb3V0ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tUm91dGVzID0gUGFnZXNPcHRpb25zLmN1c3RvbVJvdXRlcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShwYWdlcy5jdXN0b21Sb3V0ZXMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmN1c3RvbVJvdXRlcyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpZGVtcG90ZW5jeU9wdGlvbnMudHRsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPSBJZGVtcG90ZW5jeU9wdGlvbnMudHRsLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkgJiYgaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA8PSAwKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgVFRMIHZhbHVlIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAgc2Vjb25kcyc7XG4gICAgfSBlbHNlIGlmIChpc05hTihpZGVtcG90ZW5jeU9wdGlvbnMudHRsKSkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGEgbnVtYmVyJztcbiAgICB9XG4gICAgaWYgKCFpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocyA9IElkZW1wb3RlbmN5T3B0aW9ucy5wYXRocy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBwYXRocyBtdXN0IGJlIG9mIGFuIGFycmF5IG9mIHN0cmluZ3MnO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KSB7XG4gICAgaWYgKGFjY291bnRMb2Nrb3V0KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBhY2NvdW50TG9ja291dC5kdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPD0gMCB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC5kdXJhdGlvbiA+IDk5OTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCBkdXJhdGlvbiBzaG91bGQgYmUgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgICFOdW1iZXIuaXNJbnRlZ2VyKGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCkgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkIDwgMSB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC50aHJlc2hvbGQgPiA5OTlcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAnQWNjb3VudCBsb2Nrb3V0IHRocmVzaG9sZCBzaG91bGQgYmUgYW4gaW50ZWdlciBncmVhdGVyIHRoYW4gMCBhbmQgbGVzcyB0aGFuIDEwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID0gQWNjb3VudExvY2tvdXRPcHRpb25zLnVubG9ja09uUGFzc3dvcmRSZXNldC5kZWZhdWx0O1xuICAgICAgfSBlbHNlIGlmICghaXNCb29sZWFuKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCkpIHtcbiAgICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpIHtcbiAgICBpZiAocGFzc3dvcmRQb2xpY3kpIHtcbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAodHlwZW9mIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSAnbnVtYmVyJyB8fCBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSA8IDApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiA8PSAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gPSBuZXcgUmVnRXhwKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pO1xuICAgICAgICB9IGVsc2UgaWYgKCEocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBpbnN0YW5jZW9mIFJlZ0V4cCkpIHtcbiAgICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBtdXN0IGJlIGEgcmVnZXggc3RyaW5nIG9yIFJlZ0V4cCBvYmplY3QuJztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAmJlxuICAgICAgICAoIU51bWJlci5pc0ludGVnZXIocGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA8PSAwIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5ID4gMjApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSBtdXN0IGJlIGFuIGludGVnZXIgcmFuZ2luZyAwIC0gMjAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdyZXNldFRva2VuUmV1c2VJZlZhbGlkIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICAgIH1cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmICFwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgICB0aHJvdyAnWW91IGNhbm5vdCB1c2UgcmVzZXRUb2tlblJldXNlSWZWYWxpZCB3aXRob3V0IHJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaXMgY29uZmlndXJlZCB0aGVuIHNldHVwIGEgY2FsbGJhY2sgdG8gcHJvY2VzcyB0aGUgcGF0dGVyblxuICBzdGF0aWMgc2V0dXBQYXNzd29yZFZhbGlkYXRvcihwYXNzd29yZFBvbGljeSkge1xuICAgIGlmIChwYXNzd29yZFBvbGljeSAmJiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICBwYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yID0gdmFsdWUgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybi50ZXN0KHZhbHVlKTtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICBlbWFpbEFkYXB0ZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgfSkge1xuICAgIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnQW4gZW1haWxBZGFwdGVyIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBhcHBOYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0FuIGFwcCBuYW1lIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBwdWJsaWNTZXJ2ZXJVUkwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQSBwdWJsaWMgc2VydmVyIHVybCBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgaWYgKGlzTmFOKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMCkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiB0eXBlb2YgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmICFlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCkge1xuICAgIHRyeSB7XG4gICAgICBpZiAoZmlsZVVwbG9hZCA9PSBudWxsIHx8IHR5cGVvZiBmaWxlVXBsb2FkICE9PSAnb2JqZWN0JyB8fCBmaWxlVXBsb2FkIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQgbXVzdCBiZSBhbiBvYmplY3QgdmFsdWUuJztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZSBpbnN0YW5jZW9mIFJlZmVyZW5jZUVycm9yKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQW5vbnltb3VzVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvclB1YmxpYy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZmlsZUV4dGVuc2lvbnMgPSBGaWxlVXBsb2FkT3B0aW9ucy5maWxlRXh0ZW5zaW9ucy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkoZmlsZVVwbG9hZC5maWxlRXh0ZW5zaW9ucykpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zIG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVJcHMoZmllbGQsIG1hc3RlcktleUlwcykge1xuICAgIGZvciAobGV0IGlwIG9mIG1hc3RlcktleUlwcykge1xuICAgICAgaWYgKGlwLmluY2x1ZGVzKCcvJykpIHtcbiAgICAgICAgaXAgPSBpcC5zcGxpdCgnLycpWzBdO1xuICAgICAgfVxuICAgICAgaWYgKCFuZXQuaXNJUChpcCkpIHtcbiAgICAgICAgdGhyb3cgYFRoZSBQYXJzZSBTZXJ2ZXIgb3B0aW9uIFwiJHtmaWVsZH1cIiBjb250YWlucyBhbiBpbnZhbGlkIElQIGFkZHJlc3MgXCIke2lwfVwiLmA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IG1vdW50KCkge1xuICAgIHZhciBtb3VudCA9IHRoaXMuX21vdW50O1xuICAgIGlmICh0aGlzLnB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgbW91bnQgPSB0aGlzLnB1YmxpY1NlcnZlclVSTDtcbiAgICB9XG4gICAgcmV0dXJuIG1vdW50O1xuICB9XG5cbiAgc2V0IG1vdW50KG5ld1ZhbHVlKSB7XG4gICAgdGhpcy5fbW91bnQgPSBuZXdWYWx1ZTtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uKHNlc3Npb25MZW5ndGgsIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICBpZiAoZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgICAgaWYgKGlzTmFOKHNlc3Npb25MZW5ndGgpKSB7XG4gICAgICAgIHRocm93ICdTZXNzaW9uIGxlbmd0aCBtdXN0IGJlIGEgdmFsaWQgbnVtYmVyLic7XG4gICAgICB9IGVsc2UgaWYgKHNlc3Npb25MZW5ndGggPD0gMCkge1xuICAgICAgICB0aHJvdyAnU2Vzc2lvbiBsZW5ndGggbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRGVmYXVsdExpbWl0KGRlZmF1bHRMaW1pdCkge1xuICAgIGlmIChkZWZhdWx0TGltaXQgPT0gbnVsbCkge1xuICAgICAgZGVmYXVsdExpbWl0ID0gUGFyc2VTZXJ2ZXJPcHRpb25zLmRlZmF1bHRMaW1pdC5kZWZhdWx0O1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGRlZmF1bHRMaW1pdCAhPT0gJ251bWJlcicpIHtcbiAgICAgIHRocm93ICdEZWZhdWx0IGxpbWl0IG11c3QgYmUgYSBudW1iZXIuJztcbiAgICB9XG4gICAgaWYgKGRlZmF1bHRMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnRGVmYXVsdCBsaW1pdCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCkge1xuICAgIGlmIChtYXhMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnTWF4IGxpbWl0IG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpIHtcbiAgICBpZiAoIVtudWxsLCB1bmRlZmluZWRdLmluY2x1ZGVzKGFsbG93SGVhZGVycykpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGFsbG93SGVhZGVycykpIHtcbiAgICAgICAgYWxsb3dIZWFkZXJzLmZvckVhY2goaGVhZGVyID0+IHtcbiAgICAgICAgICBpZiAodHlwZW9mIGhlYWRlciAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgb25seSBjb250YWluIHN0cmluZ3MnO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIWhlYWRlci50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG5vdCBjb250YWluIGVtcHR5IHN0cmluZ3MnO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IGJlIGFuIGFycmF5JztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVMb2dMZXZlbHMobG9nTGV2ZWxzKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoTG9nTGV2ZWxzKSkge1xuICAgICAgaWYgKGxvZ0xldmVsc1trZXldKSB7XG4gICAgICAgIGlmICh2YWxpZExvZ0xldmVscy5pbmRleE9mKGxvZ0xldmVsc1trZXldKSA9PT0gLTEpIHtcbiAgICAgICAgICB0aHJvdyBgJyR7a2V5fScgbXVzdCBiZSBvbmUgb2YgJHtKU09OLnN0cmluZ2lmeSh2YWxpZExvZ0xldmVscyl9YDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nTGV2ZWxzW2tleV0gPSBMb2dMZXZlbHNba2V5XS5kZWZhdWx0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyhkYXRhYmFzZU9wdGlvbnMpIHtcbiAgICBpZiAoZGF0YWJhc2VPcHRpb25zID09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGFiYXNlT3B0aW9ucykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyBgZGF0YWJhc2VPcHRpb25zIG11c3QgYmUgYW4gb2JqZWN0YDtcbiAgICB9XG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgPSBEYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgYGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgfVxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsID0gRGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsICE9PSAnbnVtYmVyJykge1xuICAgICAgdGhyb3cgYGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bCBtdXN0IGJlIGEgbnVtYmVyYDtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVSYXRlTGltaXQocmF0ZUxpbWl0KSB7XG4gICAgaWYgKCFyYXRlTGltaXQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKFxuICAgICAgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHJhdGVMaW1pdCkgIT09ICdbb2JqZWN0IE9iamVjdF0nICYmXG4gICAgICAhQXJyYXkuaXNBcnJheShyYXRlTGltaXQpXG4gICAgKSB7XG4gICAgICB0aHJvdyBgcmF0ZUxpbWl0IG11c3QgYmUgYW4gYXJyYXkgb3Igb2JqZWN0YDtcbiAgICB9XG4gICAgY29uc3Qgb3B0aW9ucyA9IEFycmF5LmlzQXJyYXkocmF0ZUxpbWl0KSA/IHJhdGVMaW1pdCA6IFtyYXRlTGltaXRdO1xuICAgIGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob3B0aW9uKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdCBtdXN0IGJlIGFuIGFycmF5IG9mIG9iamVjdHNgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5yZXF1ZXN0UGF0aCA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFBhdGggbXVzdCBiZSBkZWZpbmVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9uLnJlcXVlc3RQYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RQYXRoIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5yZXF1ZXN0VGltZVdpbmRvdyA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFRpbWVXaW5kb3cgbXVzdCBiZSBkZWZpbmVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9uLnJlcXVlc3RUaW1lV2luZG93ICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RUaW1lV2luZG93IG11c3QgYmUgYSBudW1iZXJgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyAmJiB0eXBlb2Ygb3B0aW9uLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLnJlcXVlc3RDb3VudCA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdENvdW50IG11c3QgYmUgZGVmaW5lZGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbi5yZXF1ZXN0Q291bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdENvdW50IG11c3QgYmUgYSBudW1iZXJgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5lcnJvclJlc3BvbnNlTWVzc2FnZSAmJiB0eXBlb2Ygb3B0aW9uLmVycm9yUmVzcG9uc2VNZXNzYWdlICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LmVycm9yUmVzcG9uc2VNZXNzYWdlIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgfVxuICAgICAgY29uc3Qgb3B0aW9ucyA9IE9iamVjdC5rZXlzKFBhcnNlU2VydmVyLlJhdGVMaW1pdFpvbmUpO1xuICAgICAgaWYgKG9wdGlvbi56b25lICYmICFvcHRpb25zLmluY2x1ZGVzKG9wdGlvbi56b25lKSkge1xuICAgICAgICBjb25zdCBmb3JtYXR0ZXIgPSBuZXcgSW50bC5MaXN0Rm9ybWF0KCdlbicsIHsgc3R5bGU6ICdzaG9ydCcsIHR5cGU6ICdkaXNqdW5jdGlvbicgfSk7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQuem9uZSBtdXN0IGJlIG9uZSBvZiAke2Zvcm1hdHRlci5mb3JtYXQob3B0aW9ucyl9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnZlcmlmeVVzZXJFbWFpbHMgfHwgIXRoaXMuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnBhc3N3b3JkUG9saWN5IHx8ICF0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy5leHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB2YXIgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMuc2Vzc2lvbkxlbmd0aCAqIDEwMDApO1xuICB9XG5cbiAgdW5yZWdpc3RlclJhdGVMaW1pdGVycygpIHtcbiAgICBsZXQgaSA9IHRoaXMucmF0ZUxpbWl0cz8ubGVuZ3RoO1xuICAgIHdoaWxlIChpLS0pIHtcbiAgICAgIGNvbnN0IGxpbWl0ID0gdGhpcy5yYXRlTGltaXRzW2ldO1xuICAgICAgaWYgKGxpbWl0LmNsb3VkKSB7XG4gICAgICAgIHRoaXMucmF0ZUxpbWl0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IGludmFsaWRMaW5rVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRMaW5rIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2ludmFsaWRfbGluay5odG1sYDtcbiAgfVxuXG4gIGdldCBpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5pbnZhbGlkVmVyaWZpY2F0aW9uTGluayB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF92ZXJpZmljYXRpb25fbGluay5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kU3VjY2VzcyB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRGYWlsVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kRmFpbCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfZmFpbC5odG1sYDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMudmVyaWZ5RW1haWxTdWNjZXNzIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy92ZXJpZnlfZW1haWxfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgY2hvb3NlUGFzc3dvcmRVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuY2hvb3NlUGFzc3dvcmQgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvY2hvb3NlX3Bhc3N3b3JkYDtcbiAgfVxuXG4gIGdldCByZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vcmVxdWVzdF9wYXNzd29yZF9yZXNldGA7XG4gIH1cblxuICBnZXQgcGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMucGFzc3dvcmRSZXNldFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3Bhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IHBhcnNlRnJhbWVVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMucGFyc2VGcmFtZVVSTDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vdmVyaWZ5X2VtYWlsYDtcbiAgfVxuXG4gIC8vIFRPRE86IFJlbW92ZSB0aGlzIGZ1bmN0aW9uIG9uY2UgUGFnZXNSb3V0ZXIgcmVwbGFjZXMgdGhlIFB1YmxpY0FQSVJvdXRlcjtcbiAgLy8gdGhlIChkZWZhdWx0KSBlbmRwb2ludCBoYXMgdG8gYmUgZGVmaW5lZCBpbiBQYWdlc1JvdXRlciBvbmx5LlxuICBnZXQgcGFnZXNFbmRwb2ludCgpIHtcbiAgICByZXR1cm4gdGhpcy5wYWdlcyAmJiB0aGlzLnBhZ2VzLmVuYWJsZVJvdXRlciAmJiB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgID8gdGhpcy5wYWdlcy5wYWdlc0VuZHBvaW50XG4gICAgICA6ICdhcHBzJztcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBDb25maWc7XG5tb2R1bGUuZXhwb3J0cyA9IENvbmZpZztcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFXQTtBQUFvRDtBQXJCcEQ7QUFDQTtBQUNBOztBQXFCQSxTQUFTQSxtQkFBbUIsQ0FBQ0MsR0FBRyxFQUFFO0VBQ2hDLElBQUksQ0FBQ0EsR0FBRyxFQUFFO0lBQ1IsT0FBT0EsR0FBRztFQUNaO0VBQ0EsSUFBSUEsR0FBRyxDQUFDQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUU7SUFDckJELEdBQUcsR0FBR0EsR0FBRyxDQUFDRSxTQUFTLENBQUMsQ0FBQyxFQUFFRixHQUFHLENBQUNHLE1BQU0sR0FBRyxDQUFDLENBQUM7RUFDeEM7RUFDQSxPQUFPSCxHQUFHO0FBQ1o7QUFFTyxNQUFNSSxNQUFNLENBQUM7RUFDbEIsT0FBT0MsR0FBRyxDQUFDQyxhQUFxQixFQUFFQyxLQUFhLEVBQUU7SUFDL0MsTUFBTUMsU0FBUyxHQUFHQyxjQUFRLENBQUNKLEdBQUcsQ0FBQ0MsYUFBYSxDQUFDO0lBQzdDLElBQUksQ0FBQ0UsU0FBUyxFQUFFO01BQ2Q7SUFDRjtJQUNBLE1BQU1FLE1BQU0sR0FBRyxJQUFJTixNQUFNLEVBQUU7SUFDM0JNLE1BQU0sQ0FBQ0osYUFBYSxHQUFHQSxhQUFhO0lBQ3BDSyxNQUFNLENBQUNDLElBQUksQ0FBQ0osU0FBUyxDQUFDLENBQUNLLE9BQU8sQ0FBQ0MsR0FBRyxJQUFJO01BQ3BDLElBQUlBLEdBQUcsSUFBSSxvQkFBb0IsRUFBRTtRQUMvQkosTUFBTSxDQUFDSyxRQUFRLEdBQUcsSUFBSUMsMkJBQWtCLENBQUNSLFNBQVMsQ0FBQ1Msa0JBQWtCLENBQUNDLE9BQU8sRUFBRVIsTUFBTSxDQUFDO01BQ3hGLENBQUMsTUFBTTtRQUNMQSxNQUFNLENBQUNJLEdBQUcsQ0FBQyxHQUFHTixTQUFTLENBQUNNLEdBQUcsQ0FBQztNQUM5QjtJQUNGLENBQUMsQ0FB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