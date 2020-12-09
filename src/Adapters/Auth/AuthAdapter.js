/*eslint no-unused-vars: "off"*/
export class AuthAdapter {
  constructor() {
    /**
     * If set to true the signup/login
     * will fail if user do not provide
     * authData associated to this Auth Adapter
     */
    this.required = false;

    /**
     * Set to true if you want to force to validateAuthData
     * even if authData do not change
     */
    this.validateEachTime = false;
  }
  /**
  @param appIds: the specified app ids in the configuration
  @param authData: the client provided authData
  @param options: additional options
  @param req: RestWrite instance with config/auth/data
  @returns a promise that resolves if the applicationId is valid
   */
  validateAppId(appIds, authData, options, req) {
    return Promise.resolve({});
  }

  /**
  @param authData: the client provided authData
  @param options: additional options
  @param req: RestWrite instance with config/auth/data
  @returns a promise that resolves, resolved value will be add to signup/login response under authDataResponse key
   */
  validateAuthData(authData, options, req) {
    return Promise.resolve({});
  }

  /**
   *
   * @param challengeData: data provided by the client
   * @param options: additional options
   * @param req: RestWrite instance with config/auth/data
   * @returns a promise that resolves, resolved value will be added to challenge response under challenge key
   */
  challenge(challengeData, options, req) {
    return Promise.resolve({});
  }
}

export default AuthAdapter;
