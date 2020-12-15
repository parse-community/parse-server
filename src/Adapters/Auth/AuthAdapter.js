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
    this.alwaysValidate = false;

    /**
     * Usage policy
     * default: can be combined with ONE additional auth provider if additional configured on user
     * additional: could be only used with a default policy auth provider
     * solo: Will ignore ALL additional providers if additional configured on user
     */
    this.policy = 'default';
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
  @returns a promise that resolves, the resolved value will be handled by the server like:
  - resolve undefined|void|{} parse server will save authData
  - resolve { doNotSave: boolean, response: Object} parse server will do not save provided authData and send response to the client under authDataResponse
  - resolve { response: Object } parse server will save authData and send response to the client under authDataResponse
  - resolve { response: Object, save: Object } parse server will save the object provided into `save` key and send response to the client under authDataResponse
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
