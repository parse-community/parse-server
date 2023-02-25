
import {TOTP, Secret} from 'otpauth'
import { randomString } from '../../cryptoUtils';
import AuthAdapter from './AuthAdapter';
class MFAAdapter extends AuthAdapter {
  constructor() {
    super();
    this.policy = 'additional';
  }
  validateSetUp(mfaData, options) {
    const {secret, token } = mfaData;
    if (!secret || !token || secret.length < 20) {
      throw 'Invalid MFA data'
    }
    const totp = new TOTP({
      algorithm: options.algorithm || "SHA1",
      digits: options.digits || 6,
      period: options.period || 30,
      secret: Secret.fromBase32(secret)
    });
    const valid = totp.validate({
      token,
    });
    if (valid === null) {
      throw 'Invalid MFA token'
    }
    const recovery = [randomString(30), randomString(30)];
    return {
      response: { recovery },
      save: { secret, recovery },
    }
  }
  validateLogin(token, options, req) {
    if (typeof token !== 'string') {
      throw 'Invalid MFA token'
    }
    const {secret, recovery} = req.original.get('authData')?.mfa || {};
    if (!secret) {
      return;
    }
    if (recovery[0] === token || recovery[1] === token) {
      return;
    }
    const totp = new TOTP({
      algorithm: options.algorithm || "SHA1",
      digits: options.digits || 6,
      period: options.period || 30,
      secret: Secret.fromBase32(secret)
    });
    const valid = totp.validate({
      token,
    });
    if (valid === null) {
      throw 'Invalid MFA token'
    }
    return {
      doNotSave: true
    }
  }
  validateUpdate(authData, options, req) {
    this.validateLogin(authData.old, options, req);
    return this.validateSetUp(authData, options);
  }
  afterFind() {
    return {
      enabled: true
    }
  }
}
export default new MFAAdapter();
