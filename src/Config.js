// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.

import AppCache from './cache';
import DatabaseController from './Controllers/DatabaseController';
import { version } from '../package.json';
import { getDynamicKeys } from './Options/schemaUtils';
import { ParseServerOptionsSchema } from './Options/schemas/ParseServerOptions';
import { ControllerValidator } from './Options/validators/ControllerValidator';

const controllerValidator = new ControllerValidator();

function removeTrailingSlash(str) {
  if (!str) {
    return str;
  }
  if (str.endsWith('/')) {
    str = str.substring(0, str.length - 1);
  }
  return str;
}

/**
 * Config keys that need to be loaded asynchronously.
 */
const asyncKeys = getDynamicKeys(ParseServerOptionsSchema);

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
    config.version = version;
    return config;
  }

  async loadKeys() {
    await Promise.all(
      asyncKeys.map(async key => {
        if (typeof this[`_${key}`] === 'function') {
          try {
            this[key] = await this[`_${key}`]();
          } catch (error) {
            throw new Error(`Failed to resolve async config key '${key}': ${error.message}`);
          }
        }
      })
    );

    const cachedConfig = AppCache.get(this.applicationId);
    if (cachedConfig) {
      const updatedConfig = { ...cachedConfig };
      asyncKeys.forEach(key => {
        updatedConfig[key] = this[key];
      });
      AppCache.put(this.applicationId, updatedConfig);
    }
  }

  static transformConfiguration(serverConfiguration) {
    for (const key of Object.keys(serverConfiguration)) {
      if (asyncKeys.includes(key) && typeof serverConfiguration[key] === 'function') {
        serverConfiguration[`_${key}`] = serverConfiguration[key];
        delete serverConfiguration[key];
      }
    }
  }

  static put(serverConfiguration) {
    controllerValidator.validate(serverConfiguration);
    Config.transformConfiguration(serverConfiguration);
    AppCache.put(serverConfiguration.appId, serverConfiguration);
    Config.setupPasswordValidator(serverConfiguration.passwordPolicy);
    return serverConfiguration;
  }

  static setupPasswordValidator(passwordPolicy) {
    if (passwordPolicy && passwordPolicy.validatorPattern) {
      if (typeof passwordPolicy.validatorPattern === 'string') {
        passwordPolicy.validatorPattern = new RegExp(passwordPolicy.validatorPattern);
      }
      passwordPolicy.patternValidator = value => {
        return passwordPolicy.validatorPattern.test(value);
      };
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

  async loadMasterKey() {
    if (typeof this.masterKey === 'function') {
      const ttlIsEmpty = !this.masterKeyTtl;
      const isExpired = this.masterKeyCache?.expiresAt && this.masterKeyCache.expiresAt < new Date();

      if ((!isExpired || ttlIsEmpty) && this.masterKeyCache?.masterKey) {
        return this.masterKeyCache.masterKey;
      }

      const masterKey = await this.masterKey();

      const expiresAt = this.masterKeyTtl ? new Date(Date.now() + 1000 * this.masterKeyTtl) : null
      this.masterKeyCache = { masterKey, expiresAt };
      Config.put(this);

      return this.masterKeyCache.masterKey;
    }

    return this.masterKey;
  }

  get pagesEndpoint() {
    return this.pages && this.pages.pagesEndpoint
      ? this.pages.pagesEndpoint
      : 'apps';
  }
}

export default Config;
module.exports = Config;
