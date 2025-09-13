// abstract class for auth code adapters
import AuthAdapter from './AuthAdapter';
export default class BaseAuthCodeAdapter extends AuthAdapter {
  constructor(adapterName) {
    super();
    this.adapterName = adapterName;
  }
  validateOptions(options) {

    if (!options) {
      throw new Error(`${this.adapterName} options are required.`);
    }

    this.enableInsecureAuth = options.enableInsecureAuth;
    if (this.enableInsecureAuth) {
      return;
    }

    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;

    if (!this.clientId) {
      throw new Error(`${this.adapterName} clientId is required.`);
    }

    if (!this.clientSecret) {
      throw new Error(`${this.adapterName} clientSecret is required.`);
    }
  }

  async beforeFind(authData) {
    if (this.enableInsecureAuth && !authData?.code) {
      if (!authData?.access_token) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${this.adapterName} auth is invalid for this user.`);
      }

      const user = await this.getUserFromAccessToken(authData.access_token, authData);

      if (user.id !== authData.id) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${this.adapterName} auth is invalid for this user.`);
      }

      return;
    }

    if (!authData?.code) {
      throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `${this.adapterName} code is required.`);
    }

    const access_token = await this.getAccessTokenFromCode(authData);
    const user = await this.getUserFromAccessToken(access_token, authData);

    if (authData.id && user.id !== authData.id) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${this.adapterName} auth is invalid for this user.`);
    }

    authData.access_token = access_token;
    authData.id = user.id;

    delete authData.code;
    delete authData.redirect_uri;

  }

  async getUserFromAccessToken() {
    // abstract method
    throw new Error('getUserFromAccessToken is not implemented');
  }

  async getAccessTokenFromCode() {
    // abstract method
    throw new Error('getAccessTokenFromCode is not implemented');
  }

  validateLogin(authData) {
    // User validation is already done in beforeFind
    return {
      id: authData.id,
    }
  }

  validateSetUp(authData) {
    // User validation is already done in beforeFind
    return {
      id: authData.id,
    }
  }

  afterFind(authData) {
    return {
      id: authData.id,
    }
  }

  validateUpdate(authData) {
    // User validation is already done in beforeFind
    return {
      id: authData.id,
    }

  }

  parseResponseData(data) {
    const startPos = data.indexOf('(');
    const endPos = data.indexOf(')');
    if (startPos === -1 || endPos === -1) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${this.adapterName} auth is invalid for this user.`);
    }
    const jsonData = data.substring(startPos + 1, endPos);
    return JSON.parse(jsonData);
  }
}
