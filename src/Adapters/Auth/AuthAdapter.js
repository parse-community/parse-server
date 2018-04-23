/*eslint no-unused-vars: "off"*/
export class AuthAdapter {

  /*
  @param appIds: the specified app ids in the configuration
  @param authData: the client provided authData
  @returns a promise that resolves if the applicationId is valid
   */
  validateAppId(appIds, authData) {
    return Promise.resolve({});
  }

  /*
  @param authData: the client provided authData
  @param options: additional options
   */
  validateAuthData(authData, options) {
    return Promise.resolve({});
  }
}

export default AuthAdapter;
