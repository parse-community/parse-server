// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.

import net from 'net';
import AppCache from './cache';
import DatabaseController from './Controllers/DatabaseController';
import { logLevels as validLogLevels } from './Controllers/LoggerController';
import Definitions from './Options/Definitions';
const { LogLevels, ParseServerOptions } = Definitions;

function removeTrailingSlash(str) {
  if (!str) {
    return str;
  }
  if (str.endsWith('/')) {
    str = str.substr(0, str.length - 1);
  }
  return str;
}

export class Config {
  static get(applicationId: string, mount: string) {
    const cacheInfo = AppCache.get(applicationId);
    if (!cacheInfo) {
      return;
    }
    const config = new Config();
    config.applicationId = applicationId;
    Object.keys(cacheInfo).forEach(key => {
      if (key == 'databaseController') {
        config.database = new DatabaseController(cacheInfo.databaseController.adapter, config);
      } else {
        config[key] = cacheInfo[key];
      }
    });
    config.mount = removeTrailingSlash(mount);
    config.generateSessionExpiresAt = config.generateSessionExpiresAt.bind(config);
    config.generateEmailVerifyTokenExpiresAt = config.generateEmailVerifyTokenExpiresAt.bind(
      config
    );
    return config;
  }

  static put(serverConfiguration) {
    Config._validateTypes(serverConfiguration);
    Config.validateOptions(serverConfiguration);
    Config.validateControllers(serverConfiguration);
    AppCache.put(serverConfiguration.appId, serverConfiguration);
    Config.setupPasswordValidator(serverConfiguration.passwordPolicy);
    return serverConfiguration;
  }

  static validateOptions({
    publicServerURL,
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
    logLevels,
    rateLimit,
    databaseOptions,
  }) {
    if (masterKey === readOnlyMasterKey) {
      throw new Error('masterKey and readOnlyMasterKey should be different');
    }

    if (masterKey === maintenanceKey) {
      throw new Error('masterKey and maintenanceKey should be different');
    }

    this.validateAccountLockoutPolicy(accountLockout);
    this.validatePasswordPolicy(passwordPolicy);


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
    this.validateLogLevels(logLevels);
  }

  static validateControllers({
    verifyUserEmails,
    userController,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid,
  }) {
    const emailAdapter = userController.adapter;
    if (verifyUserEmails) {
      this.validateEmailConfiguration({
        emailAdapter,
        appName,
        publicServerURL,
        emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid,
      });
    }
  }

  static _validateTypes(serverOpts) {
    const getType = fn => {
      if (Array.isArray(fn)) {
        return 'array';
      }
      if (fn === 'Any' || fn === 'function') {
        return fn;
      }
      const type = typeof fn;
      if (typeof fn === 'function') {
        const match = fn && fn.toString().match(/^\s*function (\w+)/);
        return (match ? match[1] : 'function').toLowerCase();
      }
      return type;
    };

    const checkKey = (setValue, path, action, original) => {
      if (setValue === undefined || !action) {
        return;
      }
      const requiredType = getType(original == null ? action(setValue) : original);
      const thisType = getType(setValue);
      if (requiredType !== thisType) {
        throw `${path} must be a${
          requiredType.charAt(0).match(/[aeiou]/i) ? 'n' : ''
        } ${requiredType} value.`;
      }
      if (requiredType === 'number' && isNaN(setValue)) {
        throw `${path} must be a valid number.`;
      }
    };
    for (const key in ParseServerOptions) {
      const definition = ParseServerOptions[key];
      const setValue = serverOpts[key];
      checkKey(setValue, key, definition.action, definition.default);
      if (setValue && definition.group) {
        const group = Definitions[definition.group];
        for (const subkey in group) {
          const subdefinition = group[subkey];
          checkKey(
            setValue[subkey],
            `${key}.${subkey}`,
            subdefinition.action,
            subdefinition.default
          );
        }
      }
    }
  }

  static validateIdempotencyOptions(idempotencyOptions) {
    if (!idempotencyOptions) {
      return;
    }
    if (!isNaN(idempotencyOptions.ttl) && idempotencyOptions.ttl <= 0) {
      throw 'idempotency TTL value must be greater than 0 seconds';
    } else if (isNaN(idempotencyOptions.ttl)) {
      throw 'idempotency TTL value must be a number';
    }
  }

  static validateAccountLockoutPolicy(accountLockout) {
    if (accountLockout) {
      if (
        typeof accountLockout.duration !== 'number' ||
        accountLockout.duration <= 0 ||
        accountLockout.duration > 99999
      ) {
        throw 'Account lockout duration should be greater than 0 and less than 100000';
      }

      if (
        !Number.isInteger(accountLockout.threshold) ||
        accountLockout.threshold < 1 ||
        accountLockout.threshold > 999
      ) {
        throw 'Account lockout threshold should be an integer greater than 0 and less than 1000';
      }
    }
  }

  static validatePasswordPolicy(passwordPolicy) {
    if (passwordPolicy) {
      if (
        passwordPolicy.maxPasswordAge !== undefined &&
        (typeof passwordPolicy.maxPasswordAge !== 'number' || passwordPolicy.maxPasswordAge < 0)
      ) {
        throw 'passwordPolicy.maxPasswordAge must be a positive number';
      }

      if (
        passwordPolicy.resetTokenValidityDuration !== undefined &&
        (typeof passwordPolicy.resetTokenValidityDuration !== 'number' ||
          passwordPolicy.resetTokenValidityDuration <= 0)
      ) {
        throw 'passwordPolicy.resetTokenValidityDuration must be a positive number';
      }

      if (passwordPolicy.validatorPattern) {
        if (typeof passwordPolicy.validatorPattern === 'string') {
          passwordPolicy.validatorPattern = new RegExp(passwordPolicy.validatorPattern);
        } else if (!(passwordPolicy.validatorPattern instanceof RegExp)) {
          throw 'passwordPolicy.validatorPattern must be a regex string or RegExp object.';
        }
      }

      if (
        passwordPolicy.validatorCallback &&
        typeof passwordPolicy.validatorCallback !== 'function'
      ) {
        throw 'passwordPolicy.validatorCallback must be a function.';
      }

      if (
        passwordPolicy.doNotAllowUsername &&
        typeof passwordPolicy.doNotAllowUsername !== 'boolean'
      ) {
        throw 'passwordPolicy.doNotAllowUsername must be a boolean value.';
      }

      if (
        passwordPolicy.maxPasswordHistory &&
        (!Number.isInteger(passwordPolicy.maxPasswordHistory) ||
          passwordPolicy.maxPasswordHistory <= 0 ||
          passwordPolicy.maxPasswordHistory > 20)
      ) {
        throw 'passwordPolicy.maxPasswordHistory must be an integer ranging 0 - 20';
      }

      if (
        passwordPolicy.resetTokenReuseIfValid &&
        typeof passwordPolicy.resetTokenReuseIfValid !== 'boolean'
      ) {
        throw 'resetTokenReuseIfValid must be a boolean value';
      }
      if (passwordPolicy.resetTokenReuseIfValid && !passwordPolicy.resetTokenValidityDuration) {
        throw 'You cannot use resetTokenReuseIfValid without resetTokenValidityDuration';
      }

      if (
        passwordPolicy.resetPasswordSuccessOnInvalidEmail &&
        typeof passwordPolicy.resetPasswordSuccessOnInvalidEmail !== 'boolean'
      ) {
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
    emailVerifyTokenReuseIfValid,
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

  static validateIps(field, masterKeyIps) {
    for (let ip of masterKeyIps) {
      if (ip.includes('/')) {
        ip = ip.split('/')[0];
      }
      if (!net.isIP(ip)) {
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
    for (const key of Object.keys(LogLevels)) {
      if (validLogLevels.indexOf(logLevels[key]) === -1) {
        throw `'${key}' must be one of ${JSON.stringify(validLogLevels)}`;
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
    let i = this.rateLimits?.length;
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
    return (
      this.customPages.invalidVerificationLink ||
      `${this.publicServerURL}/apps/invalid_verification_link.html`
    );
  }

  get linkSendSuccessURL() {
    return (
      this.customPages.linkSendSuccess || `${this.publicServerURL}/apps/link_send_success.html`
    );
  }

  get linkSendFailURL() {
    return this.customPages.linkSendFail || `${this.publicServerURL}/apps/link_send_fail.html`;
  }

  get verifyEmailSuccessURL() {
    return (
      this.customPages.verifyEmailSuccess ||
      `${this.publicServerURL}/apps/verify_email_success.html`
    );
  }

  get choosePasswordURL() {
    return this.customPages.choosePassword || `${this.publicServerURL}/apps/choose_password`;
  }

  get requestResetPasswordURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/request_password_reset`;
  }

  get passwordResetSuccessURL() {
    return (
      this.customPages.passwordResetSuccess ||
      `${this.publicServerURL}/apps/password_reset_success.html`
    );
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
    return this.pages && this.pages.enableRouter && this.pages.pagesEndpoint
      ? this.pages.pagesEndpoint
      : 'apps';
  }
}

export default Config;
module.exports = Config;
