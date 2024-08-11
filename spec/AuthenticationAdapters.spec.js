const request = require('../lib/request');
const Config = require('../lib/Config');
const defaultColumns = require('../lib/Controllers/SchemaController').defaultColumns;
const authenticationLoader = require('../lib/Adapters/Auth');
const path = require('path');
const responses = {
  gpgames: { playerId: 'userId' },
  instagram: { id: 'userId' },
  janrainengage: { stat: 'ok', profile: { identifier: 'userId' } },
  janraincapture: { stat: 'ok', result: 'userId' },
  line: { userId: 'userId' },
  vkontakte: { response: [{ id: 'userId' }] },
  google: { sub: 'userId' },
  wechat: { errcode: 0 },
  weibo: { uid: 'userId' },
  qq: 'callback( {"openid":"userId"} );', // yes it's like that, run eval in the client :P
  phantauth: { sub: 'userId' },
  microsoft: { id: 'userId', mail: 'userMail' },
};

describe('enableInsecureAuthAdapters option', () => {
  it('should accept true value', async () => {
    const logger = require('../lib/logger').logger;
    const logSpy = spyOn(logger, 'warn').and.callFake(() => { });
    await reconfigureServer({ enableInsecureAuthAdapters: true });
    const deprecationWarnings = [
      {
        text: `DeprecationWarning: The Parse Server option 'enableInsecureAuthAdapters' default will change to 'false' in a future version.`,
        expectedCount: 0,
      },
      {
        text:
          'DeprecationWarning: insecure adapter is deprecated and will be removed in a future version.',
        expectedCount: 2,
      },
    ];
    const relevantLogs = logSpy.calls.all();
    expect(Config.get(Parse.applicationId).enableInsecureAuthAdapters).toBe(true);
    deprecationWarnings.forEach(warning => {
      expect(relevantLogs.filter(log => log.args[0] === warning.text).length).toEqual(
        warning.expectedCount
      );
    });
  });

  it('should accept false value', async () => {
    const logger = require('../lib/logger').logger;
    const logSpy = spyOn(logger, 'warn').and.callFake(() => { });
    await reconfigureServer({ enableInsecureAuthAdapters: false });
    expect(Config.get(Parse.applicationId).enableInsecureAuthAdapters).toBe(false);
    expect(
      logSpy.calls
        .all()
        .filter(
          log =>
            log.args[0] ===
            `DeprecationWarning: The Parse Server option 'enableInsecureAuthAdapters' default will change to 'false' in a future version.`
        ).length
    ).toEqual(0);
    expect(
      logSpy.calls
        .all()
        .filter(
          log =>
            log.args[0] ===
            'DeprecationWarning: insecure adapter is deprecated and will be removed in a future version.'
        ).length
    ).toEqual(0);
  });
  it('should default true', async () => {
    const logger = require('../lib/logger').logger;
    const logSpy = spyOn(logger, 'warn').and.callFake(() => { });
    await reconfigureServer({});
    const deprecationWarnings = [
      {
        text: `DeprecationWarning: The Parse Server option 'enableInsecureAuthAdapters' default will change to 'false' in a future version.`,
        expectedCount: 1,
      },
      {
        text:
          'DeprecationWarning: insecure adapter is deprecated and will be removed in a future version.',
        expectedCount: 2,
      },
    ];
    const relevantLogs = logSpy.calls.all();
    expect(Config.get(Parse.applicationId).enableInsecureAuthAdapters).toBe(true);
    deprecationWarnings.forEach(warning => {
      expect(relevantLogs.filter(log => log.args[0] === warning.text).length).toEqual(
        warning.expectedCount
      );
    });
  });

  it('should enforce boolean values', async () => {
    const options = [[], 'a', '', 0, 1, {}, 'true', 'false'];
    for (const option of options) {
      await expectAsync(reconfigureServer({ enableInsecureAuthAdapters: option })).toBeRejected();
    }
  });
});

describe('AuthenticationProviders', function () {
  [
    'apple',
    'gcenter',
    'gpgames',
    'facebook',
    'github',
    'instagram',
    'google',
    'linkedin',
    'meetup',
    'twitter',
    'janrainengage',
    'janraincapture',
    'line',
    'vkontakte',
    'qq',
    'spotify',
    'wechat',
    'weibo',
    'phantauth',
    'microsoft',
    'keycloak',
  ].map(function (providerName) {
    it('Should validate structure of ' + providerName, done => {
      const provider = require('../lib/Adapters/Auth/' + providerName);
      jequal(typeof provider.validateAuthData, 'function');
      jequal(typeof provider.validateAppId, 'function');
      const validateAuthDataPromise = provider.validateAuthData({}, {});
      const validateAppIdPromise = provider.validateAppId('app', 'key', {});
      jequal(validateAuthDataPromise.constructor, Promise.prototype.constructor);
      jequal(validateAppIdPromise.constructor, Promise.prototype.constructor);
      validateAuthDataPromise.then(
        () => { },
        () => { }
      );
      validateAppIdPromise.then(
        () => { },
        () => { }
      );
      done();
    });

    it(`should provide the right responses for adapter ${providerName}`, async () => {
      const noResponse = [
        'twitter',
        'apple',
        'gcenter',
        'google',
        'keycloak',
        'meetup',
        'vkontakte',
        'phantauth',
      ];
      if (noResponse.includes(providerName)) {
        return;
      }
      spyOn(require('../lib/Adapters/Auth/httpsRequest'), 'get').and.callFake(options => {
        if (
          options ===
          'https://oauth.vk.com/access_token?client_id=appId&client_secret=appSecret&v=5.123&grant_type=client_credentials' ||
          options ===
          'https://oauth.vk.com/access_token?client_id=appId&client_secret=appSecret&v=5.124&grant_type=client_credentials'
        ) {
          return {
            access_token: 'access_token',
          };
        }
        return Promise.resolve(responses[providerName] || { id: 'userId' });
      });
      spyOn(require('../lib/Adapters/Auth/httpsRequest'), 'request').and.callFake(() => {
        return Promise.resolve(responses[providerName] || { id: 'userId' });
      });
      const provider = require('../lib/Adapters/Auth/' + providerName);
      const auth = { id: 'userId' };
      let params = {};
      if (providerName === 'vkontakte') {
        params = {
          appIds: 'appId',
          appSecret: 'appSecret',
        };
        await provider.validateAuthData(auth, params);
        params.appVersion = '5.123';
      } else if (providerName === 'github') {
        auth.access_token = 'accessToken'; // Insecure adapter
      }
      await provider.validateAuthData(auth, params);
    });
  });

  const getMockMyOauthProvider = function () {
    return {
      authData: {
        id: '12345',
        access_token: '12345',
        expiration_date: new Date().toJSON(),
      },
      shouldError: false,
      loggedOut: false,
      synchronizedUserId: null,
      synchronizedAuthToken: null,
      synchronizedExpiration: null,

      authenticate: function (options) {
        if (this.shouldError) {
          options.error(this, 'An error occurred');
        } else if (this.shouldCancel) {
          options.error(this, null);
        } else {
          options.success(this, this.authData);
        }
      },
      restoreAuthentication: function (authData) {
        if (!authData) {
          this.synchronizedUserId = null;
          this.synchronizedAuthToken = null;
          this.synchronizedExpiration = null;
          return true;
        }
        this.synchronizedUserId = authData.id;
        this.synchronizedAuthToken = authData.access_token;
        this.synchronizedExpiration = authData.expiration_date;
        return true;
      },
      getAuthType: function () {
        return 'myoauth';
      },
      deauthenticate: function () {
        this.loggedOut = true;
        this.restoreAuthentication(null);
      },
    };
  };

  Parse.User.extend({
    extended: function () {
      return true;
    },
  });

  const createOAuthUser = function (callback) {
    return createOAuthUserWithSessionToken(undefined, callback);
  };

  const createOAuthUserWithSessionToken = function (token, callback) {
    const jsonBody = {
      authData: {
        myoauth: getMockMyOauthProvider().authData,
      },
    };

    const options = {
      method: 'POST',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Installation-Id': 'yolo',
        'X-Parse-Session-Token': token,
        'Content-Type': 'application/json',
      },
      url: 'http://localhost:8378/1/users',
      body: jsonBody,
    };
    return request(options)
      .then(response => {
        if (callback) {
          callback(null, response, response.data);
        }
        return {
          res: response,
          body: response.data,
        };
      })
      .catch(error => {
        if (callback) {
          callback(error);
        }
        throw error;
      });
  };

  it('should create user with REST API', done => {
    createOAuthUser((error, response, body) => {
      expect(error).toBe(null);
      const b = body;
      ok(b.sessionToken);
      expect(b.objectId).not.toBeNull();
      expect(b.objectId).not.toBeUndefined();
      const sessionToken = b.sessionToken;
      const q = new Parse.Query('_Session');
      q.equalTo('sessionToken', sessionToken);
      q.first({ useMasterKey: true })
        .then(res => {
          if (!res) {
            fail('should not fail fetching the session');
            done();
            return;
          }
          expect(res.get('installationId')).toEqual('yolo');
          done();
        })
        .catch(() => {
          fail('should not fail fetching the session');
          done();
        });
    });
  });

  it('should only create a single user with REST API', done => {
    let objectId;
    createOAuthUser((error, response, body) => {
      expect(error).toBe(null);
      const b = body;
      expect(b.objectId).not.toBeNull();
      expect(b.objectId).not.toBeUndefined();
      objectId = b.objectId;

      createOAuthUser((error, response, body) => {
        expect(error).toBe(null);
        const b = body;
        expect(b.objectId).not.toBeNull();
        expect(b.objectId).not.toBeUndefined();
        expect(b.objectId).toBe(objectId);
        done();
      });
    });
  });

  it("should fail to link if session token don't match user", done => {
    Parse.User.signUp('myUser', 'password')
      .then(user => {
        return createOAuthUserWithSessionToken(user.getSessionToken());
      })
      .then(() => {
        return Parse.User.logOut();
      })
      .then(() => {
        return Parse.User.signUp('myUser2', 'password');
      })
      .then(user => {
        return createOAuthUserWithSessionToken(user.getSessionToken());
      })
      .then(fail, ({ data }) => {
        expect(data.code).toBe(208);
        expect(data.error).toBe('this auth is already used');
        done();
      })
      .catch(done.fail);
  });

  it('should support loginWith with session token and with/without mutated authData', async () => {
    const fakeAuthProvider = {
      validateAppId: () => Promise.resolve(),
      validateAuthData: () => Promise.resolve(),
    };
    const payload = { authData: { id: 'user1', token: 'fakeToken' } };
    const payload2 = { authData: { id: 'user1', token: 'fakeToken2' } };
    await reconfigureServer({ auth: { fakeAuthProvider } });
    const user = await Parse.User.logInWith('fakeAuthProvider', payload);
    const user2 = await Parse.User.logInWith('fakeAuthProvider', payload, {
      sessionToken: user.getSessionToken(),
    });
    const user3 = await Parse.User.logInWith('fakeAuthProvider', payload2, {
      sessionToken: user2.getSessionToken(),
    });
    expect(user.id).toEqual(user2.id);
    expect(user.id).toEqual(user3.id);
  });

  it('should support sync/async validateAppId', async () => {
    const syncProvider = {
      validateAppId: () => true,
      appIds: 'test',
      validateAuthData: () => Promise.resolve(),
    };
    const asyncProvider = {
      appIds: 'test',
      validateAppId: () => Promise.resolve(true),
      validateAuthData: () => Promise.resolve(),
    };
    const payload = { authData: { id: 'user1', token: 'fakeToken' } };
    const syncSpy = spyOn(syncProvider, 'validateAppId');
    const asyncSpy = spyOn(asyncProvider, 'validateAppId');

    await reconfigureServer({ auth: { asyncProvider, syncProvider } });
    const user = await Parse.User.logInWith('asyncProvider', payload);
    const user2 = await Parse.User.logInWith('syncProvider', payload);
    expect(user.getSessionToken()).toBeDefined();
    expect(user2.getSessionToken()).toBeDefined();
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(asyncSpy).toHaveBeenCalledTimes(1);
  });

  it('unlink and link with custom provider', async () => {
    const provider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const model = await Parse.User._logInWith('myoauth');
    ok(model instanceof Parse.User, 'Model should be a Parse.User');
    strictEqual(Parse.User.current(), model);
    ok(model.extended(), 'Should have used the subclass.');
    strictEqual(provider.authData.id, provider.synchronizedUserId);
    strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
    strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
    ok(model._isLinked('myoauth'), 'User should be linked to myoauth');

    await model._unlinkFrom('myoauth');
    ok(!model._isLinked('myoauth'), 'User should not be linked to myoauth');
    ok(!provider.synchronizedUserId, 'User id should be cleared');
    ok(!provider.synchronizedAuthToken, 'Auth token should be cleared');
    ok(!provider.synchronizedExpiration, 'Expiration should be cleared');
    // make sure the auth data is properly deleted
    const config = Config.get(Parse.applicationId);
    const res = await config.database.adapter.find(
      '_User',
      {
        fields: Object.assign({}, defaultColumns._Default, defaultColumns._Installation),
      },
      { objectId: model.id },
      {}
    );
    expect(res.length).toBe(1);
    expect(res[0]._auth_data_myoauth).toBeUndefined();
    expect(res[0]._auth_data_myoauth).not.toBeNull();

    await model._linkWith('myoauth');

    ok(provider.synchronizedUserId, 'User id should have a value');
    ok(provider.synchronizedAuthToken, 'Auth token should have a value');
    ok(provider.synchronizedExpiration, 'Expiration should have a value');
    ok(model._isLinked('myoauth'), 'User should be linked to myoauth');
  });

  function validateValidator(validator) {
    expect(typeof validator).toBe('function');
  }

  function validateAuthenticationHandler(authenticationHandler) {
    expect(authenticationHandler).not.toBeUndefined();
    expect(typeof authenticationHandler.getValidatorForProvider).toBe('function');
    expect(typeof authenticationHandler.getValidatorForProvider).toBe('function');
  }

  function validateAuthenticationAdapter(authAdapter) {
    expect(authAdapter).not.toBeUndefined();
    if (!authAdapter) {
      return;
    }
    expect(typeof authAdapter.validateAuthData).toBe('function');
    expect(typeof authAdapter.validateAppId).toBe('function');
  }

  it('properly loads custom adapter', done => {
    const validAuthData = {
      id: 'hello',
      token: 'world',
    };
    const adapter = {
      validateAppId: function () {
        return Promise.resolve();
      },
      validateAuthData: function (authData) {
        if (authData.id == validAuthData.id && authData.token == validAuthData.token) {
          return Promise.resolve();
        }
        return Promise.reject();
      },
    };

    const authDataSpy = spyOn(adapter, 'validateAuthData').and.callThrough();
    const appIdSpy = spyOn(adapter, 'validateAppId').and.callThrough();

    const authenticationHandler = authenticationLoader({
      customAuthentication: adapter,
    });

    validateAuthenticationHandler(authenticationHandler);
    const { validator } = authenticationHandler.getValidatorForProvider('customAuthentication');
    validateValidator(validator);

    validator(validAuthData, {}, {}).then(
      () => {
        expect(authDataSpy).toHaveBeenCalled();
        // AppIds are not provided in the adapter, should not be called
        expect(appIdSpy).not.toHaveBeenCalled();
        done();
      },
      err => {
        jfail(err);
        done();
      }
    );
  });

  it('properly loads custom adapter module object', done => {
    const authenticationHandler = authenticationLoader({
      customAuthentication: path.resolve('./spec/support/CustomAuth.js'),
    });

    validateAuthenticationHandler(authenticationHandler);
    const { validator } = authenticationHandler.getValidatorForProvider('customAuthentication');
    validateValidator(validator);
    validator(
      {
        token: 'my-token',
      },
      {},
      {}
    ).then(
      () => {
        done();
      },
      err => {
        jfail(err);
        done();
      }
    );
  });

  it('properly loads custom adapter module object (again)', done => {
    const authenticationHandler = authenticationLoader({
      customAuthentication: {
        module: path.resolve('./spec/support/CustomAuthFunction.js'),
        options: { token: 'valid-token' },
      },
    });

    validateAuthenticationHandler(authenticationHandler);
    const { validator } = authenticationHandler.getValidatorForProvider('customAuthentication');
    validateValidator(validator);

    validator(
      {
        token: 'valid-token',
      },
      {},
      {}
    ).then(
      () => {
        done();
      },
      err => {
        jfail(err);
        done();
      }
    );
  });

  it('properly loads a default adapter with options', () => {
    const options = {
      facebook: {
        appIds: ['a', 'b'],
        appSecret: 'secret',
      },
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'facebook',
      options
    );
    validateAuthenticationAdapter(adapter);
    expect(appIds).toEqual(['a', 'b']);
    expect(providerOptions).toEqual(options.facebook);
  });

  it('should throw error when Facebook request appId is wrong data type', async () => {
    const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({ id: 'a' });
    });
    const options = {
      facebook: {
        appIds: 'abcd',
        appSecret: 'secret_sauce',
      },
    };
    const authData = {
      access_token: 'badtoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'facebook',
      options
    );
    await expectAsync(adapter.validateAppId(appIds, authData, providerOptions)).toBeRejectedWith(
      new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'appIds must be an array.')
    );
  });

  it('should handle Facebook appSecret for validating appIds', async () => {
    const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({ id: 'a' });
    });
    const options = {
      facebook: {
        appIds: ['a', 'b'],
        appSecret: 'secret_sauce',
      },
    };
    const authData = {
      access_token: 'badtoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'facebook',
      options
    );
    await adapter.validateAppId(appIds, authData, providerOptions);
    expect(httpsRequest.get.calls.first().args[0].includes('appsecret_proof')).toBe(true);
  });

  it('should throw error when Facebook request appId is wrong data type', async () => {
    const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({ id: 'a' });
    });
    const options = {
      facebook: {
        appIds: 'abcd',
        appSecret: 'secret_sauce',
      },
    };
    const authData = {
      access_token: 'badtoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'facebook',
      options
    );
    await expectAsync(adapter.validateAppId(appIds, authData, providerOptions)).toBeRejectedWith(
      new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'appIds must be an array.')
    );
  });

  it('should handle Facebook appSecret for validating auth data', async () => {
    const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve();
    });
    const options = {
      facebook: {
        appIds: ['a', 'b'],
        appSecret: 'secret_sauce',
      },
    };
    const authData = {
      id: 'test',
      access_token: 'test',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('facebook', options);
    await adapter.validateAuthData(authData, providerOptions);
    expect(httpsRequest.get.calls.first().args[0].includes('appsecret_proof')).toBe(true);
  });

  it('properly loads a custom adapter with options', () => {
    const options = {
      custom: {
        validateAppId: () => { },
        validateAuthData: () => { },
        appIds: ['a', 'b'],
      },
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'custom',
      options
    );
    validateAuthenticationAdapter(adapter);
    expect(appIds).toEqual(['a', 'b']);
    expect(providerOptions).toEqual(options.custom);
  });

  it('can disable provider', async () => {
    await reconfigureServer({
      auth: {
        myoauth: {
          enabled: false,
          module: path.resolve(__dirname, 'support/myoauth'), // relative path as it's run from src
        },
      },
    });
    const provider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);
    await expectAsync(Parse.User._logInWith('myoauth')).toBeRejectedWith(
      new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.')
    );
  });

  it('can deprecate', async () => {
    await reconfigureServer();
    const Deprecator = require('../lib/Deprecator/Deprecator');
    const spy = spyOn(Deprecator, 'logRuntimeDeprecation').and.callFake(() => { });
    const provider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);
    await Parse.User._logInWith('myoauth');
    expect(spy).toHaveBeenCalledWith({
      usage: 'Using the authentication adapter "myoauth" without explicitly enabling it',
      solution:
        'Enable the authentication adapter by setting the Parse Server option "auth.myoauth.enabled: true".',
    });
  });
});

describe('google auth adapter', () => {
  const google = require('../lib/Adapters/Auth/google');
  const jwt = require('jsonwebtoken');
  const authUtils = require('../lib/Adapters/Auth/utils');

  it('should throw error with missing id_token', async () => {
    try {
      await google.validateAuthData({}, {});
      fail();
    } catch (e) {
      expect(e.message).toBe('id token is invalid for this user.');
    }
  });

  it('should not decode invalid id_token', async () => {
    try {
      await google.validateAuthData({ id: 'the_user_id', id_token: 'the_token' }, {});
      fail();
    } catch (e) {
      expect(e.message).toBe('provided token does not decode as JWT');
    }
  });

  // it('should throw error if public key used to encode token is not available', async () => {
  //   const fakeDecodedToken = { header: { kid: '789', alg: 'RS256' } };
  //   try {
  //     spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);

  //     await google.validateAuthData({ id: 'the_user_id', id_token: 'the_token' }, {});
  //     fail();
  //   } catch (e) {
  //     expect(e.message).toBe(
  //       `Unable to find matching key for Key ID: ${fakeDecodedToken.header.kid}`
  //     );
  //   }
  // });

  it('(using client id as string) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://accounts.google.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await google.validateAuthData(
      { id: 'the_user_id', id_token: 'the_token' },
      { clientId: 'secret' }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as string) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.google.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await google.validateAuthData(
        { id: 'the_user_id', id_token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct provider - expected: accounts.google.com or https://accounts.google.com | from: https://not.google.com'
      );
    }
  });

  xit('(using client id as string) should throw error with invalid jwt client_id', async () => {
    const fakeClaim = {
      iss: 'https://accounts.google.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await google.validateAuthData(
        { id: 'INSERT ID HERE', token: 'INSERT APPLE TOKEN HERE' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt audience invalid. expected: secret');
    }
  });

  xit('should throw error with invalid user id', async () => {
    const fakeClaim = {
      iss: 'https://accounts.google.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await google.validateAuthData(
        { id: 'invalid user', token: 'INSERT APPLE TOKEN HERE' },
        { clientId: 'INSERT CLIENT ID HERE' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('auth data is invalid for this user.');
    }
  });
});

describe('google play games service auth', () => {
  const gpgames = require('../lib/Adapters/Auth/gpgames');
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');

  it('validateAuthData should pass validation', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({ playerId: 'userId' });
    });
    await gpgames.validateAuthData({
      id: 'userId',
      access_token: 'access_token',
    });
  });

  it('validateAuthData should throw error', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({ playerId: 'invalid' });
    });
    try {
      await gpgames.validateAuthData({
        id: 'userId',
        access_token: 'access_token',
      });
    } catch (e) {
      expect(e.message).toBe('Google Play Games Services - authData is invalid for this user.');
    }
  });
});

describe('keycloak auth adapter', () => {
  const keycloak = require('../lib/Adapters/Auth/keycloak');
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');

  it('validateAuthData should fail without access token', async () => {
    const authData = {
      id: 'fakeid',
    };
    try {
      await keycloak.validateAuthData(authData);
      fail();
    } catch (e) {
      expect(e.message).toBe('Missing access token and/or User id');
    }
  });

  it('validateAuthData should fail without user id', async () => {
    const authData = {
      access_token: 'sometoken',
    };
    try {
      await keycloak.validateAuthData(authData);
      fail();
    } catch (e) {
      expect(e.message).toBe('Missing access token and/or User id');
    }
  });

  it('validateAuthData should fail without config', async () => {
    const options = {
      keycloak: {
        config: null,
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    try {
      await adapter.validateAuthData(authData, providerOptions);
      fail();
    } catch (e) {
      expect(e.message).toBe('Missing keycloak configuration');
    }
  });

  it('validateAuthData should fail connect error', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.reject({
        text: JSON.stringify({ error: 'hosting_error' }),
      });
    });
    const options = {
      keycloak: {
        config: {
          'auth-server-url': 'http://example.com',
          realm: 'new',
        },
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    try {
      await adapter.validateAuthData(authData, providerOptions);
      fail();
    } catch (e) {
      expect(e.message).toBe('Could not connect to the authentication server');
    }
  });

  it('validateAuthData should fail with error description', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.reject({
        text: JSON.stringify({ error_description: 'custom error message' }),
      });
    });
    const options = {
      keycloak: {
        config: {
          'auth-server-url': 'http://example.com',
          realm: 'new',
        },
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    try {
      await adapter.validateAuthData(authData, providerOptions);
      fail();
    } catch (e) {
      expect(e.message).toBe('custom error message');
    }
  });

  it('validateAuthData should fail with invalid auth', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({});
    });
    const options = {
      keycloak: {
        config: {
          'auth-server-url': 'http://example.com',
          realm: 'new',
        },
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    try {
      await adapter.validateAuthData(authData, providerOptions);
      fail();
    } catch (e) {
      expect(e.message).toBe('Invalid authentication');
    }
  });

  it('validateAuthData should fail with invalid groups', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({
        data: {
          sub: 'fakeid',
          roles: ['role1'],
          groups: ['unknown'],
        },
      });
    });
    const options = {
      keycloak: {
        config: {
          'auth-server-url': 'http://example.com',
          realm: 'new',
        },
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
      roles: ['role1'],
      groups: ['group1'],
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    try {
      await adapter.validateAuthData(authData, providerOptions);
      fail();
    } catch (e) {
      expect(e.message).toBe('Invalid authentication');
    }
  });

  it('validateAuthData should fail with invalid roles', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({
        data: {
          sub: 'fakeid',
          roles: 'unknown',
          groups: ['group1'],
        },
      });
    });
    const options = {
      keycloak: {
        config: {
          'auth-server-url': 'http://example.com',
          realm: 'new',
        },
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
      roles: ['role1'],
      groups: ['group1'],
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    try {
      await adapter.validateAuthData(authData, providerOptions);
      fail();
    } catch (e) {
      expect(e.message).toBe('Invalid authentication');
    }
  });

  it('validateAuthData should handle authentication', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({
        data: {
          sub: 'fakeid',
          roles: ['role1'],
          groups: ['group1'],
        },
      });
    });
    const options = {
      keycloak: {
        config: {
          'auth-server-url': 'http://example.com',
          realm: 'new',
        },
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
      roles: ['role1'],
      groups: ['group1'],
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    await adapter.validateAuthData(authData, providerOptions);
    expect(httpsRequest.get).toHaveBeenCalledWith({
      host: 'http://example.com',
      path: '/realms/new/protocol/openid-connect/userinfo',
      headers: {
        Authorization: 'Bearer sometoken',
      },
    });
  });
});

describe('oauth2 auth adapter', () => {
  const oauth2 = require('../lib/Adapters/Auth/oauth2');
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');

  it('properly loads OAuth2 adapter via the "oauth2" option', () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
      },
    };
    const loadedAuthAdapter = authenticationLoader.loadAuthAdapter('oauth2Authentication', options);
    expect(loadedAuthAdapter.adapter).toEqual(oauth2);
  });

  it('properly loads OAuth2 adapter with options', () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        useridField: 'sub',
        appidField: 'appId',
        appIds: ['a', 'b'],
        authorizationHeader: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
        debug: true,
      },
    };
    const loadedAuthAdapter = authenticationLoader.loadAuthAdapter('oauth2Authentication', options);
    const appIds = loadedAuthAdapter.appIds;
    const providerOptions = loadedAuthAdapter.providerOptions;
    expect(providerOptions.tokenIntrospectionEndpointUrl).toEqual('https://example.com/introspect');
    expect(providerOptions.useridField).toEqual('sub');
    expect(providerOptions.appidField).toEqual('appId');
    expect(appIds).toEqual(['a', 'b']);
    expect(providerOptions.authorizationHeader).toEqual('Basic dXNlcm5hbWU6cGFzc3dvcmQ=');
    expect(providerOptions.debug).toEqual(true);
  });

  it('validateAppId should fail if OAuth2 tokenIntrospectionEndpointUrl is not configured properly', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        appIds: ['a', 'b'],
        appidField: 'appId',
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe(
        'OAuth2 token introspection endpoint URL is missing from configuration!'
      );
    }
  });

  it('validateAppId appidField optional', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      // Should not reach here
      fail(e);
    }
  });

  it('validateAppId should fail without appIds', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe(
        'OAuth2 configuration is missing the client app IDs ("appIds" config parameter).'
      );
    }
  });

  it('validateAppId should fail empty appIds', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: [],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe(
        'OAuth2 configuration is missing the client app IDs ("appIds" config parameter).'
      );
    }
  });

  it('validateAppId invalid accessToken', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({});
    });
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe('OAuth2 access token is invalid for this user.');
    }
  });

  it('validateAppId invalid accessToken appId', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({ active: true });
    });
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe(
        "OAuth2: the access_token's appID is empty or is not in the list of permitted appIDs in the auth configuration."
      );
    }
  });

  it('validateAppId valid accessToken appId', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({
        active: true,
        appId: 'a',
      });
    });
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      // Should not enter here
      fail(e);
    }
  });

  it('validateAppId valid accessToken appId array', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({
        active: true,
        appId: ['a'],
      });
    });
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      // Should not enter here
      fail(e);
    }
  });

  it('validateAppId valid accessToken invalid appId', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({
        active: true,
        appId: 'unknown',
      });
    });
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe(
        "OAuth2: the access_token's appID is empty or is not in the list of permitted appIDs in the auth configuration."
      );
    }
  });

  it('validateAuthData should fail if OAuth2 tokenIntrospectionEndpointUrl is not configured properly', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    try {
      await adapter.validateAuthData(authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe(
        'OAuth2 token introspection endpoint URL is missing from configuration!'
      );
    }
  });

  it('validateAuthData invalid accessToken', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        useridField: 'sub',
        appidField: 'appId',
        appIds: ['a', 'b'],
        authorizationHeader: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({});
    });
    try {
      await adapter.validateAuthData(authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe('OAuth2 access token is invalid for this user.');
    }
    expect(httpsRequest.request).toHaveBeenCalledWith(
      {
        hostname: 'example.com',
        path: '/introspect',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': 15,
          Authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
        },
      },
      'token=sometoken'
    );
  });

  it('validateAuthData valid accessToken', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        useridField: 'sub',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({
        active: true,
        sub: 'fakeid',
      });
    });
    try {
      await adapter.validateAuthData(authData, providerOptions);
    } catch (e) {
      // Should not enter here
      fail(e);
    }
    expect(httpsRequest.request).toHaveBeenCalledWith(
      {
        hostname: 'example.com',
        path: '/introspect',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': 15,
        },
      },
      'token=sometoken'
    );
  });

  it('validateAuthData valid accessToken without useridField', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({
        active: true,
        sub: 'fakeid',
      });
    });
    try {
      await adapter.validateAuthData(authData, providerOptions);
    } catch (e) {
      // Should not enter here
      fail(e);
    }
  });
});

describe('apple signin auth adapter', () => {
  const apple = require('../lib/Adapters/Auth/apple');
  const jwt = require('jsonwebtoken');
  const util = require('util');
  const authUtils = require('../lib/Adapters/Auth/utils');

  it('(using client id as string) should throw error with missing id_token', async () => {
    try {
      await apple.validateAuthData({}, { clientId: 'secret' });
      fail();
    } catch (e) {
      expect(e.message).toBe('id token is invalid for this user.');
    }
  });

  it('(using client id as array) should throw error with missing id_token', async () => {
    try {
      await apple.validateAuthData({}, { clientId: ['secret'] });
      fail();
    } catch (e) {
      expect(e.message).toBe('id token is invalid for this user.');
    }
  });

  it('should not decode invalid id_token', async () => {
    try {
      await apple.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('provided token does not decode as JWT');
    }
  });

  it('should throw error if public key used to encode token is not available', async () => {
    const fakeDecodedToken = { header: { kid: '789', alg: 'RS256' } };
    try {
      spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken.header);

      await apple.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        `Unable to find matching key for Key ID: ${fakeDecodedToken.header.kid}`
      );
    }
  });

  it('should use algorithm from key header to verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://appleid.apple.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken.header);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);

    const result = await apple.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: 'secret' }
    );
    expect(result).toEqual(fakeClaim);
    expect(jwt.verify.calls.first().args[2].algorithms).toEqual(fakeDecodedToken.header.alg);
  });

  it('should not verify invalid id_token', async () => {
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);

    try {
      await apple.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt malformed');
    }
  });

  it('(using client id as array) should not verify invalid id_token', async () => {
    try {
      await apple.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: ['secret'] }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('provided token does not decode as JWT');
    }
  });

  it('(using client id as string) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://appleid.apple.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await apple.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: 'secret' }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as array) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://appleid.apple.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await apple.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: ['secret'] }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as array with multiple items) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://appleid.apple.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await apple.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: ['secret', 'secret 123'] }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as string) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.apple.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await apple.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct OpenID provider - expected: https://appleid.apple.com | from: https://not.apple.com'
      );
    }
  });

  // TODO: figure out a way to generate our own apple signed tokens, perhaps with a parse apple account
  // and a private key
  xit('(using client id as array) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.apple.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await apple.validateAuthData(
        {
          id: 'INSERT ID HERE',
          token: 'INSERT APPLE TOKEN HERE WITH INVALID JWT ISSUER',
        },
        { clientId: ['INSERT CLIENT ID HERE'] }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct OpenID provider - expected: https://appleid.apple.com | from: https://not.apple.com'
      );
    }
  });

  it('(using client id as string) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.apple.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await apple.validateAuthData(
        {
          id: 'INSERT ID HERE',
          token: 'INSERT APPLE TOKEN HERE WITH INVALID JWT ISSUER',
        },
        { clientId: 'INSERT CLIENT ID HERE' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct OpenID provider - expected: https://appleid.apple.com | from: https://not.apple.com'
      );
    }
  });

  // TODO: figure out a way to generate our own apple signed tokens, perhaps with a parse apple account
  // and a private key
  xit('(using client id as string) should throw error with invalid jwt clientId', async () => {
    try {
      await apple.validateAuthData(
        { id: 'INSERT ID HERE', token: 'INSERT APPLE TOKEN HERE' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt audience invalid. expected: secret');
    }
  });

  // TODO: figure out a way to generate our own apple signed tokens, perhaps with a parse apple account
  // and a private key
  xit('(using client id as array) should throw error with invalid jwt clientId', async () => {
    try {
      await apple.validateAuthData(
        { id: 'INSERT ID HERE', token: 'INSERT APPLE TOKEN HERE' },
        { clientId: ['secret'] }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt audience invalid. expected: secret');
    }
  });

  // TODO: figure out a way to generate our own apple signed tokens, perhaps with a parse apple account
  // and a private key
  xit('should throw error with invalid user id', async () => {
    try {
      await apple.validateAuthData(
        { id: 'invalid user', token: 'INSERT APPLE TOKEN HERE' },
        { clientId: 'INSERT CLIENT ID HERE' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('auth data is invalid for this user.');
    }
  });

  it('should throw error with with invalid user id', async () => {
    const fakeClaim = {
      iss: 'https://appleid.apple.com',
      aud: 'invalid_client_id',
      sub: 'a_different_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await apple.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('auth data is invalid for this user.');
    }
  });
});

describe('Apple Game Center Auth adapter', () => {
  const gcenter = require('../lib/Adapters/Auth/gcenter');
  const fs = require('fs');
  const testCert = fs.readFileSync(__dirname + '/support/cert/game_center.pem');
  const testCert2 = fs.readFileSync(__dirname + '/support/cert/game_center.pem');

  it('can load adapter', async () => {
    const options = {
      gcenter: {
        rootCertificateUrl:
          'https://cacerts.digicert.com/DigiCertTrustedG4CodeSigningRSA4096SHA3842021CA1.crt.pem',
      },
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'gcenter',
      options
    );
    await adapter.validateAppId(
      appIds,
      { publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer' },
      providerOptions
    );
  });

  it('validateAuthData should validate', async () => {
    const options = {
      gcenter: {
        rootCertificateUrl:
          'https://cacerts.digicert.com/DigiCertTrustedG4CodeSigningRSA4096SHA3842021CA1.crt.pem',
      },
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'gcenter',
      options
    );
    await adapter.validateAppId(
      appIds,
      { publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer' },
      providerOptions
    );
    // real token is used
    const authData = {
      id: 'G:1965586982',
      publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
      timestamp: 1565257031287,
      signature:
        'uqLBTr9Uex8zCpc1UQ1MIDMitb+HUat2Mah4Kw6AVLSGe0gGNJXlih2i5X+0ZwVY0S9zY2NHWi2gFjmhjt/4kxWGMkupqXX5H/qhE2m7hzox6lZJpH98ZEUbouWRfZX2ZhUlCkAX09oRNi7fI7mWL1/o88MaI/y6k6tLr14JTzmlxgdyhw+QRLxRPA6NuvUlRSJpyJ4aGtNH5/wHdKQWL8nUnFYiYmaY8R7IjzNxPfy8UJTUWmeZvMSgND4u8EjADPsz7ZtZyWAPi8kYcAb6M8k0jwLD3vrYCB8XXyO2RQb/FY2TM4zJuI7PzLlvvgOJXbbfVtHx7Evnm5NYoyzgzw==',
      salt: 'DzqqrQ==',
      bundleId: 'cloud.xtralife.gamecenterauth',
    };
    gcenter.cache['https://static.gc.apple.com/public-key/gc-prod-4.cer'] = testCert;
    await gcenter.validateAuthData(authData);
  });

  it('validateAuthData invalid signature id', async () => {
    gcenter.cache['https://static.gc.apple.com/public-key/gc-prod-4.cer'] = testCert;
    gcenter.cache['https://static.gc.apple.com/public-key/gc-prod-6.cer'] = testCert2;
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'gcenter',
      {}
    );
    await adapter.validateAppId(
      appIds,
      { publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer' },
      providerOptions
    );
    const authData = {
      id: 'G:1965586982',
      publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-6.cer',
      timestamp: 1565257031287,
      signature: '1234',
      salt: 'DzqqrQ==',
      bundleId: 'com.example.com',
    };
    await expectAsync(gcenter.validateAuthData(authData)).toBeRejectedWith(
      new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Apple Game Center - invalid signature')
    );
  });

  it('validateAuthData invalid public key http url', async () => {
    const options = {
      gcenter: {
        rootCertificateUrl:
          'https://cacerts.digicert.com/DigiCertTrustedG4CodeSigningRSA4096SHA3842021CA1.crt.pem',
      },
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'gcenter',
      options
    );
    await adapter.validateAppId(
      appIds,
      { publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer' },
      providerOptions
    );
    const publicKeyUrls = [
      'example.com',
      'http://static.gc.apple.com/public-key/gc-prod-4.cer',
      'https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg',
      'https://example.com/ \\.apple.com/public_key.cer',
      'https://example.com/ &.apple.com/public_key.cer',
    ];
    await Promise.all(
      publicKeyUrls.map(publicKeyUrl =>
        expectAsync(
          gcenter.validateAuthData({
            id: 'G:1965586982',
            timestamp: 1565257031287,
            publicKeyUrl,
            signature: '1234',
            salt: 'DzqqrQ==',
            bundleId: 'com.example.com',
          })
        ).toBeRejectedWith(
          new Parse.Error(
            Parse.Error.SCRIPT_FAILED,
            `Apple Game Center - invalid publicKeyUrl: ${publicKeyUrl}`
          )
        )
      )
    );
  });

  it('should not validate Symantec Cert', async () => {
    const options = {
      gcenter: {
        rootCertificateUrl:
          'https://cacerts.digicert.com/DigiCertTrustedG4CodeSigningRSA4096SHA3842021CA1.crt.pem',
      },
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'gcenter',
      options
    );
    await adapter.validateAppId(
      appIds,
      { publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer' },
      providerOptions
    );
    expect(() =>
      gcenter.verifyPublicKeyIssuer(
        testCert,
        'https://static.gc.apple.com/public-key/gc-prod-4.cer'
      )
    );
  });

  it('adapter should load default cert', async () => {
    const options = {
      gcenter: {},
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'gcenter',
      options
    );
    await adapter.validateAppId(
      appIds,
      { publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer' },
      providerOptions
    );
    const previous = new Date();
    await adapter.validateAppId(
      appIds,
      { publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer' },
      providerOptions
    );

    const duration = new Date().getTime() - previous.getTime();
    expect(duration <= 1).toBe(true);
  });

  it('adapter should throw', async () => {
    const options = {
      gcenter: {
        rootCertificateUrl: 'https://example.com',
      },
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'gcenter',
      options
    );
    await expectAsync(
      adapter.validateAppId(
        appIds,
        { publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer' },
        providerOptions
      )
    ).toBeRejectedWith(
      new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Apple Game Center auth adapter parameter `rootCertificateURL` is invalid.'
      )
    );
  });
});

describe('microsoft graph auth adapter', () => {
  const microsoft = require('../lib/Adapters/Auth/microsoft');
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');

  it('should use access_token for validation is passed and responds with id and mail', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({ id: 'userId', mail: 'userMail' });
    });
    await microsoft.validateAuthData({
      id: 'userId',
      access_token: 'the_token',
    });
  });

  it('should fail to validate Microsoft Graph auth with bad token', done => {
    const authData = {
      id: 'fake-id',
      mail: 'fake@mail.com',
      access_token: 'very.long.bad.token',
    };
    microsoft.validateAuthData(authData).then(done.fail, err => {
      expect(err.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
      expect(err.message).toBe('Microsoft Graph auth is invalid for this user.');
      done();
    });
  });
});

describe('facebook limited auth adapter', () => {
  const facebook = require('../lib/Adapters/Auth/facebook');
  const jwt = require('jsonwebtoken');
  const util = require('util');
  const authUtils = require('../lib/Adapters/Auth/utils');

  // TODO: figure out a way to run this test alongside facebook classic tests
  xit('(using client id as string) should throw error with missing id_token', async () => {
    try {
      await facebook.validateAuthData({}, { clientId: 'secret' });
      fail();
    } catch (e) {
      expect(e.message).toBe('Facebook auth is not configured.');
    }
  });

  // TODO: figure out a way to run this test alongside facebook classic tests
  xit('(using client id as array) should throw error with missing id_token', async () => {
    try {
      await facebook.validateAuthData({}, { clientId: ['secret'] });
      fail();
    } catch (e) {
      expect(e.message).toBe('Facebook auth is not configured.');
    }
  });

  it('should not decode invalid id_token', async () => {
    try {
      await facebook.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('provided token does not decode as JWT');
    }
  });

  it('should throw error if public key used to encode token is not available', async () => {
    const fakeDecodedToken = {
      header: { kid: '789', alg: 'RS256' },
    };
    try {
      spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken.header);

      await facebook.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        `Unable to find matching key for Key ID: ${fakeDecodedToken.header.kid}`
      );
    }
  });

  it('should use algorithm from key header to verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://www.facebook.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken.header);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);

    const result = await facebook.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: 'secret' }
    );
    expect(result).toEqual(fakeClaim);
    expect(jwt.verify.calls.first().args[2].algorithms).toEqual(fakeDecodedToken.header.alg);
  });

  it('should not verify invalid id_token', async () => {
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);

    try {
      await facebook.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt malformed');
    }
  });

  it('(using client id as array) should not verify invalid id_token', async () => {
    try {
      await facebook.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: ['secret'] }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('provided token does not decode as JWT');
    }
  });

  it('(using client id as string) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://www.facebook.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await facebook.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: 'secret' }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as array) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://www.facebook.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await facebook.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: ['secret'] }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as array with multiple items) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://www.facebook.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await facebook.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: ['secret', 'secret 123'] }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as string) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.facebook.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await facebook.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct OpenID provider - expected: https://www.facebook.com | from: https://not.facebook.com'
      );
    }
  });

  // TODO: figure out a way to generate our own facebook signed tokens, perhaps with a parse facebook account
  // and a private key
  xit('(using client id as array) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.facebook.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await facebook.validateAuthData(
        {
          id: 'INSERT ID HERE',
          token: 'INSERT FACEBOOK TOKEN HERE WITH INVALID JWT ISSUER',
        },
        { clientId: ['INSERT CLIENT ID HERE'] }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct OpenID provider - expected: https://www.facebook.com | from: https://not.facebook.com'
      );
    }
  });

  it('(using client id as string) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.facebook.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await facebook.validateAuthData(
        {
          id: 'INSERT ID HERE',
          token: 'INSERT FACEBOOK TOKEN HERE WITH INVALID JWT ISSUER',
        },
        { clientId: 'INSERT CLIENT ID HERE' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct OpenID provider - expected: https://www.facebook.com | from: https://not.facebook.com'
      );
    }
  });

  // TODO: figure out a way to generate our own facebook signed tokens, perhaps with a parse facebook account
  // and a private key
  xit('(using client id as string) should throw error with invalid jwt clientId', async () => {
    try {
      await facebook.validateAuthData(
        {
          id: 'INSERT ID HERE',
          token: 'INSERT FACEBOOK TOKEN HERE',
        },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt audience invalid. expected: secret');
    }
  });

  // TODO: figure out a way to generate our own facebook signed tokens, perhaps with a parse facebook account
  // and a private key
  xit('(using client id as array) should throw error with invalid jwt clientId', async () => {
    try {
      await facebook.validateAuthData(
        {
          id: 'INSERT ID HERE',
          token: 'INSERT FACEBOOK TOKEN HERE',
        },
        { clientId: ['secret'] }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt audience invalid. expected: secret');
    }
  });

  // TODO: figure out a way to generate our own facebook signed tokens, perhaps with a parse facebook account
  // and a private key
  xit('should throw error with invalid user id', async () => {
    try {
      await facebook.validateAuthData(
        {
          id: 'invalid user',
          token: 'INSERT FACEBOOK TOKEN HERE',
        },
        { clientId: 'INSERT CLIENT ID HERE' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('auth data is invalid for this user.');
    }
  });

  it('should throw error with with invalid user id', async () => {
    const fakeClaim = {
      iss: 'https://www.facebook.com',
      aud: 'invalid_client_id',
      sub: 'a_different_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await facebook.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('auth data is invalid for this user.');
    }
  });
});

describe('github auth adapter', () => {
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');

  describe('insecure usage', () => {
    it('should work with access_token by default', async () => {
      await reconfigureServer({});
      const spy = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options).toEqual({
          host: 'api.github.com',
          path: '/user',
          headers: {
            Authorization: 'bearer accessToken',
            'User-Agent': 'parse-server',
          },
        });
        return Promise.resolve({ id: 'userId' });
      });
      const user = new Parse.User();
      await user.linkWith('github', {
        authData: {
          access_token: 'accessToken',
        },
      });
      await user.fetch();
      expect(user.get('authData').github.access_token).toEqual('accessToken');
      expect(user.get('authData').github.id).toEqual('userId');
      expect(spy).toHaveBeenCalled();
    });

    it('should work with access_token when github.enableInsecureAuth is true', async () => {
      await reconfigureServer({ auth: { github: { enableInsecureAuth: true } } });
      const spy = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options).toEqual({
          host: 'api.github.com',
          path: '/user',
          headers: {
            Authorization: 'bearer accessToken',
            'User-Agent': 'parse-server',
          },
        });
        return Promise.resolve({ id: 'userId' });
      });
      const user = new Parse.User();
      await user.linkWith('github', { authData: { access_token: 'accessToken', id: 'userId' } });
      await user.fetch();
      expect(user.get('authData').github.access_token).toEqual('accessToken');
      expect(user.get('authData').github.id).toEqual('userId');
      expect(spy).toHaveBeenCalled();
    });

    it('should not work with access_token when github.enableInsecureAuth is false', async () => {
      await reconfigureServer({ auth: { github: { enableInsecureAuth: false } } });
      const spy = spyOn(httpsRequest, 'get').and.callFake(() => {
        throw new Error('Should not be called');
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('github', { authData: { access_token: 'accessToken', id: 'userId' } })
      ).toBeRejectedWithError(/Github auth is not configured/);
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not work with access_token and incorrect id when github.enableInsecureAuth is true', async () => {
      await reconfigureServer({ auth: { github: { enableInsecureAuth: true } } });
      const spy = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options).toEqual({
          host: 'api.github.com',
          path: '/user',
          headers: {
            Authorization: 'bearer accessToken',
            'User-Agent': 'parse-server',
          },
        });
        return Promise.resolve({ id: 'userId' });
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('github', { authData: { access_token: 'accessToken', id: 'incorrectId' } })
      ).toBeRejectedWithError(/Github auth is invalid for this user./);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('secure usage', () => {
    it('should work with code by default', async () => {
      await reconfigureServer({
        auth: {
          github: {
            clientId: 'someClientId',
            clientSecret: 'someClientSecret',
            enableInsecureAuth: false,
          },
        },
      });
      const requestSpy = spyOn(httpsRequest, 'request').and.callFake((options, postData) => {
        expect(options).toEqual({
          hostname: 'github.com',
          path: '/login/oauth/access_token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json',
          },
        });
        expect(postData).toEqual(
          JSON.stringify({
            client_id: 'someClientId',
            client_secret: 'someClientSecret',
            code: 'someCode',
          })
        );
        return Promise.resolve({ access_token: 'accessToken' });
      });
      const getSpy = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options).toEqual({
          host: 'api.github.com',
          path: '/user',
          headers: {
            Authorization: 'bearer accessToken',
            'User-Agent': 'parse-server',
          },
        });
        return Promise.resolve({ id: 'userId' });
      });
      const user = new Parse.User();
      await user.linkWith('github', { authData: { code: 'someCode' } });
      await user.fetch();
      expect(user.get('authData').github.access_token).toEqual('accessToken');
      expect(requestSpy).toHaveBeenCalled();
      expect(getSpy).toHaveBeenCalled();
    });

    it('should work with code when github.enableInsecureAuth is true', async () => {
      await reconfigureServer({
        auth: {
          github: {
            clientId: 'someClientId',
            clientSecret: 'someClientSecret',
            enableInsecureAuth: true,
          },
        },
      });
      const requestSpy = spyOn(httpsRequest, 'request').and.callFake((options, postData) => {
        expect(options).toEqual({
          hostname: 'github.com',
          path: '/login/oauth/access_token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json',
          },
        });
        expect(postData).toEqual(
          JSON.stringify({
            client_id: 'someClientId',
            client_secret: 'someClientSecret',
            code: 'someCode',
          })
        );
        return Promise.resolve({ access_token: 'accessToken' });
      });
      const getSpy = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options).toEqual({
          host: 'api.github.com',
          path: '/user',
          headers: {
            Authorization: 'bearer accessToken',
            'User-Agent': 'parse-server',
          },
        });
        return Promise.resolve({ id: 'userId' });
      });
      const user = new Parse.User();
      await user.linkWith('github', { authData: { code: 'someCode', id: 'userId' } });
      await user.fetch();
      expect(user.get('authData').github.access_token).toEqual('accessToken');
      expect(requestSpy).toHaveBeenCalled();
      expect(getSpy).toHaveBeenCalled();
    });

    it('should work with code when github.enableInsecureAuth is false', async () => {
      await reconfigureServer({
        auth: {
          github: {
            clientId: 'someClientId',
            clientSecret: 'someClientSecret',
            enableInsecureAuth: false,
          },
        },
      });
      const requestSpy = spyOn(httpsRequest, 'request').and.callFake((options, postData) => {
        expect(options).toEqual({
          hostname: 'github.com',
          path: '/login/oauth/access_token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json',
          },
        });
        expect(postData).toEqual(
          JSON.stringify({
            client_id: 'someClientId',
            client_secret: 'someClientSecret',
            code: 'someCode',
          })
        );
        return Promise.resolve({ access_token: 'accessToken' });
      });
      const getSpy = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options).toEqual({
          host: 'api.github.com',
          path: '/user',
          headers: {
            Authorization: 'bearer accessToken',
            'User-Agent': 'parse-server',
          },
        });
        return Promise.resolve({ id: 'userId' });
      });
      const user = new Parse.User();
      await user.linkWith('github', { authData: { code: 'someCode' } });
      await user.fetch();
      expect(user.get('authData').github.access_token).toEqual('accessToken');
      expect(requestSpy).toHaveBeenCalled();
      expect(getSpy).toHaveBeenCalled();
    });
  });
});

describe('linkedin auth adapter', () => {
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
  describe('insecure usage', () => {
    it('should work with access_token by default', async () => {
      await reconfigureServer({});
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options.host).toEqual('api.linkedin.com');
        expect(options.path).toMatch(/^\/v2\//);
        expect(options.headers.Authorization).toMatch(/^Bearer /);

        return Promise.resolve({ id: 'userId' });
      });

      const user = new Parse.User();
      await user.linkWith('linkedin', {
        authData: {
          access_token: 'accessToken',
          is_mobile_sdk: false,
        },
      });
      await user.fetch();
      expect(user.get('authData').linkedin.access_token).toEqual('accessToken');
      expect(user.get('authData').linkedin.id).toEqual('userId');
      expect(spyGet).toHaveBeenCalled();
    });

    it('should work with access_token when linkedin.enableInsecureAuth is true', async () => {
      await reconfigureServer({ auth: { linkedin: { enableInsecureAuth: true } } });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options.host).toEqual('api.linkedin.com');
        expect(options.path).toMatch(/^\/v2\//);
        expect(options.headers.Authorization).toMatch(/^Bearer /);

        return Promise.resolve({ id: 'userId' });
      });

      const user = new Parse.User();
      await user.linkWith('linkedin', {
        authData: { access_token: 'accessToken', id: 'userId', is_mobile_sdk: false },
      });
      await user.fetch();
      expect(user.get('authData').linkedin.access_token).toEqual('accessToken');
      expect(user.get('authData').linkedin.id).toEqual('userId');
      expect(spyGet).toHaveBeenCalled();
    });

    it('should not work with access_token when linkedin.enableInsecureAuth is false', async () => {
      await reconfigureServer({ auth: { linkedin: { enableInsecureAuth: false } } });
      const spyGet = spyOn(httpsRequest, 'getAccessToken').and.callFake(() => {
        throw new Error('Should not be called');
      });

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('linkedin', {
          authData: { access_token: 'accessToken', id: 'userId', is_mobile_sdk: false },
        })
      ).toBeRejectedWithError(/Linkedin auth is not configured/);
      expect(spyGet).not.toHaveBeenCalled();
    });

    it('should not work with access_token and incorrect id when linkedin.enableInsecureAuth is true', async () => {
      await reconfigureServer({ auth: { linkedin: { enableInsecureAuth: true } } });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options.host).toEqual('api.linkedin.com');
        expect(options.path).toMatch(/^\/v2\//);
        expect(options.headers.Authorization).toMatch(/^Bearer /);
      });

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('linkedin', {
          authData: { access_token: 'accessToken', id: 'incorrectId', is_mobile_sdk: false },
        })
      ).toBeRejectedWithError(/Linkedin auth is invalid for this user./);
      expect(spyGet).toHaveBeenCalled();
    });
  });

  describe('secure usage', () => {
    it('should work with code and redirect_uri by default', async () => {
      await reconfigureServer({
        auth: {
          linkedin: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const requestSpy = spyOn(httpsRequest, 'getAccessToken').and.callFake(options => {
        expect(options).toEqual({
          method: 'POST',
          url: 'https://www.linkedin.com/oauth/v2/accessToken',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          form: {
            grant_type: 'authorization_code',
            code: 'someCode',
            redirect_uri: 'someRedirectURI',
            client_id: 'clientId',
            client_secret: 'clientSecret',
          },
        });
        return Promise.resolve({ access_token: 'accessToken', id: 'userId' });
      });
      const getSpy = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options.host).toEqual('api.linkedin.com');
        expect(options.path).toMatch(/^\/v2\//);
        expect(options.headers.Authorization).toMatch(/^Bearer /);

        return Promise.resolve({ id: 'userId' });
      });

      const user = new Parse.User();
      await user.linkWith('linkedin', {
        authData: { code: 'someCode', redirect_uri: 'someRedirectURI' },
      });
      await user.fetch();
      expect(user.get('authData').linkedin.access_token).toEqual('accessToken');
      expect(requestSpy).toHaveBeenCalled();
      expect(getSpy).toHaveBeenCalled();
    });
    it('should work with code and redirect_uri when linkedin.enableInsecureAuth is true', async () => {
      await reconfigureServer({
        auth: {
          linkedin: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const getSpy = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options.host).toEqual('api.linkedin.com');
        expect(options.path).toMatch(/^\/v2\//);
        expect(options.headers.Authorization).toMatch(/^Bearer /);

        return Promise.resolve({ id: 'userId' });
      });

      const user = new Parse.User();
      await user.linkWith('linkedin', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
          is_mobile_sdk: false,
        },
      });
      await user.fetch();
      expect(user.get('authData').linkedin.access_token).toEqual('accessToken');
      expect(user.get('authData').linkedin.id).toEqual('userId');
      expect(getSpy).toHaveBeenCalled();
    });
    it('should work with code and redirect_uri when linkedin.enableInsecureAuth is false', async () => {
      await reconfigureServer({
        auth: {
          linkedin: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const requestSpy = spyOn(httpsRequest, 'getAccessToken').and.callFake(options => {
        expect(options).toEqual({
          method: 'POST',
          url: 'https://www.linkedin.com/oauth/v2/accessToken',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          form: {
            grant_type: 'authorization_code',
            code: 'someCode',
            redirect_uri: 'someRedirectURI',
            client_id: 'clientId',
            client_secret: 'clientSecret',
          },
        });

        return Promise.resolve({ access_token: 'accessToken', id: 'userId' });
      });
      const getSpy = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options.host).toEqual('api.linkedin.com');
        expect(options.path).toMatch(/^\/v2\//);
        expect(options.headers.Authorization).toMatch(/^Bearer /);

        return Promise.resolve({ id: 'userId' });
      });

      const user = new Parse.User();
      await user.linkWith('linkedin', {
        authData: {
          code: 'someCode',
          redirect_uri: 'someRedirectURI',
        },
      });
      await user.fetch();
      expect(user.get('authData').linkedin.access_token).toEqual('accessToken');
      expect(requestSpy).toHaveBeenCalled();
      expect(getSpy).toHaveBeenCalled();
    });
  });
  describe('auth login github and linkedin adapters', () => {
    it('Logged in user must remain logged in after logging in with LinkedIn auth adapter secure to insecure case', async () => {
      await reconfigureServer({
        auth: {
          linkedin: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const requestSpy = spyOn(httpsRequest, 'getAccessToken').and.callFake(options => {
        expect(options).toEqual({
          method: 'POST',
          url: 'https://www.linkedin.com/oauth/v2/accessToken',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          form: {
            grant_type: 'authorization_code',
            code: 'someCode',
            redirect_uri: 'someRedirectURI',
            client_id: 'clientId',
            client_secret: 'clientSecret',
          },
        });

        return Promise.resolve({ access_token: 'accessToken', id: 'userId' });
      });
      const getSpy = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options.host).toEqual('api.linkedin.com');
        expect(options.path).toMatch(/^\/v2\//);
        expect(options.headers.Authorization).toMatch(/^Bearer /);

        return Promise.resolve({ id: 'userId' });
      });
      const user = new Parse.User();
      await user.linkWith('linkedin', {
        authData: {
          code: 'someCode',
          redirect_uri: 'someRedirectURI',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();
      expect(user.get('authData').linkedin.access_token).toEqual('accessToken');

      await reconfigureServer({
        auth: {
          linkedin: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      await user.linkWith('linkedin', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
          is_mobile_sdk: false,
        },
      });
      await user.fetch();
      expect(user.get('authData').linkedin.access_token).toEqual('accessToken');
      expect(Parse.User.current().id).toEqual(userId);
      expect(Parse.User.current().getSessionToken()).toEqual(sessionToken);
      expect(requestSpy).toHaveBeenCalled();
      expect(getSpy).toHaveBeenCalled();
    });
    it('Logged in user must remain logged in after logging in with LinkedIn auth adapter insecure to secure case', async () => {
      await reconfigureServer({
        auth: {
          linkedin: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const requestSpy = spyOn(httpsRequest, 'getAccessToken').and.callFake(options => {
        expect(options).toEqual({
          method: 'POST',
          url: 'https://www.linkedin.com/oauth/v2/accessToken',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          form: {
            grant_type: 'authorization_code',
            code: 'someCode',
            redirect_uri: 'someRedirectURI',
            client_id: 'clientId',
            client_secret: 'clientSecret',
          },
        });

        return Promise.resolve({ access_token: 'accessToken', id: 'userId' });
      });
      const getSpy = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options.host).toEqual('api.linkedin.com');
        expect(options.path).toMatch(/^\/v2\//);
        expect(options.headers.Authorization).toMatch(/^Bearer /);

        return Promise.resolve({ id: 'userId' });
      });
      const user = new Parse.User();
      await user.linkWith('linkedin', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
          is_mobile_sdk: false,
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();
      await reconfigureServer({
        auth: {
          linkedin: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      await user.linkWith('linkedin', {
        authData: {
          code: 'someCode',
          redirect_uri: 'someRedirectURI',
        },
      });

      await user.fetch();
      expect(user.get('authData').linkedin.access_token).toEqual('accessToken');
      expect(Parse.User.current().id).toEqual(userId);
      expect(Parse.User.current().getSessionToken()).toEqual(sessionToken);
      expect(requestSpy).toHaveBeenCalled();
      expect(getSpy).toHaveBeenCalled();
    });
    it('Logged in user must remain logged in after logging in with Github auth adapter secure to insecure case', async () => {
      await reconfigureServer({
        auth: {
          github: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const requestSpy = spyOn(httpsRequest, 'request').and.callFake((options, postData) => {
        expect(options).toEqual({
          hostname: 'github.com',
          path: '/login/oauth/access_token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json',
          },
        });
        expect(postData).toEqual(
          JSON.stringify({
            client_id: 'clientId',
            client_secret: 'clientSecret',
            code: 'someCode',
          })
        );
        return Promise.resolve({ access_token: 'accessToken' });
      });
      const getSpy = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options).toEqual({
          host: 'api.github.com',
          path: '/user',
          headers: {
            Authorization: 'bearer accessToken',
            'User-Agent': 'parse-server',
          },
        });
        return Promise.resolve({ id: 'userId' });
      });
      const user = new Parse.User();
      await user.linkWith('github', { authData: { code: 'someCode' } });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();
      expect(user.get('authData').github.access_token).toEqual('accessToken');
      await reconfigureServer({
        auth: {
          github: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      await user.linkWith('github', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
        },
      });
      await user.fetch();
      expect(user.get('authData').github.access_token).toEqual('accessToken');
      expect(Parse.User.current().id).toEqual(userId);
      expect(Parse.User.current().getSessionToken()).toEqual(sessionToken);
      expect(requestSpy).toHaveBeenCalled();
      expect(getSpy).toHaveBeenCalled();
    });
    it('Logged in user must remain logged in after logging in with Github auth adapter insecure to secure case', async () => {
      await reconfigureServer({
        auth: {
          github: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const requestSpy = spyOn(httpsRequest, 'request').and.callFake((options, postData) => {
        expect(options).toEqual({
          hostname: 'github.com',
          path: '/login/oauth/access_token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json',
          },
        });
        expect(postData).toEqual(
          JSON.stringify({
            client_id: 'clientId',
            client_secret: 'clientSecret',
            code: 'someCode',
          })
        );
        return Promise.resolve({ access_token: 'accessToken' });
      });
      const getSpy = spyOn(httpsRequest, 'get').and.callFake(options => {
        expect(options).toEqual({
          host: 'api.github.com',
          path: '/user',
          headers: {
            Authorization: 'bearer accessToken',
            'User-Agent': 'parse-server',
          },
        });
        return Promise.resolve({ id: 'userId' });
      });
      const user = new Parse.User();
      await user.linkWith('github', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();

      await reconfigureServer({
        auth: {
          github: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      await user.linkWith('github', { authData: { code: 'someCode' } });
      await user.fetch();
      expect(user.get('authData').github.access_token).toEqual('accessToken');
      expect(Parse.User.current().id).toEqual(userId);
      expect(Parse.User.current().getSessionToken()).toEqual(sessionToken);
      expect(requestSpy).toHaveBeenCalled();
      expect(getSpy).toHaveBeenCalled();
    });
  });
});

describe('instagram auth adapter', () => {
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
  describe('insecure usage', () => {
    it('should work with access_token by default', async () => {
      await reconfigureServer({});
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const user = new Parse.User();
      await user.linkWith('instagram', {
        authData: { access_token: 'accessToken' },
      });
      await user.fetch();
      expect(user.get('authData').instagram.access_token).toEqual('accessToken');
      expect(user.get('authData').instagram.id).toEqual('userId');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should work with access_token when instagram.enableInsecureAuth is true', async () => {
      await reconfigureServer({ auth: { instagram: { enableInsecureAuth: true } } });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const user = new Parse.User();
      await user.linkWith('instagram', {
        authData: { access_token: 'accessToken', id: 'userId' },
      });
      await user.fetch();
      expect(user.get('authData').instagram.access_token).toEqual('accessToken');
      expect(user.get('authData').instagram.id).toEqual('userId');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work with access_token when instagram.enableInsecureAuth is false', async () => {
      await reconfigureServer({ auth: { instagram: { enableInsecureAuth: false } } });
      const spyGet = spyOn(httpsRequest, 'getAccessToken').and.callFake(() => {
        throw new Error('should not be called');
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('instagram', {
          authData: { access_token: 'accessToken', id: 'userId' },
        })
      ).toBeRejectedWithError(/Instagram auth configuration missing clientId and\/or clientSecret/);
      expect(spyGet).not.toHaveBeenCalled();
    });
    it('should not work with access_token and incorrect id when instagram.enableInsecureAuth is true', async () => {
      await reconfigureServer({ auth: { instagram: { enableInsecureAuth: true } } });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() => {
        return { id: 'userId' };
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('instagram', {
          authData: { access_token: 'accessToken', id: 'incorrectId' },
        })
      ).toBeRejectedWithError(/Instagram auth is invalid for this user/);
      expect(spyGet).toHaveBeenCalled();
    });
  });
  describe('secure usage', () => {
    it('should work with code and redirect_uri by default', async () => {
      await reconfigureServer({
        auth: {
          instagram: {
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken' })
      );
      const user = new Parse.User();
      await user.linkWith('instagram', {
        authData: { code: 'code', redirect_uri: 'redirect_uri' },
      });
      await user.fetch();
      expect(user.get('authData').instagram.access_token).toEqual('accessToken');
      expect(user.get('authData').instagram.id).toEqual('userId');
      expect(spyGet).toHaveBeenCalled();
      expect(spyAccessToken).toHaveBeenCalled();
    });
    it('should work with code and redirect_uri when instagram.enableInsecureAuth is true', async () => {
      await reconfigureServer({
        auth: {
          instagram: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.callFake(() => {
        return { access_token: 'accessToken' };
      });
      const user = new Parse.User();
      await user.linkWith('instagram', {
        authData: { code: 'code', redirect_uri: 'redirect_uri' },
      });
      await user.fetch();
      expect(user.get('authData').instagram.access_token).toEqual('accessToken');
      expect(user.get('authData').instagram.id).toEqual('userId');
      expect(spyGet).toHaveBeenCalled();
      expect(spyAccessToken).toHaveBeenCalled();
    });
    it('should work with code and redirect_uri when instagram.enableInsecureAuth is false', async () => {
      await reconfigureServer({
        auth: {
          instagram: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken' })
      );
      const user = new Parse.User();
      await user.linkWith('instagram', {
        authData: { code: 'code', redirect_uri: 'redirect_uri' },
      });
      await user.fetch();
      expect(user.get('authData').instagram.access_token).toEqual('accessToken');
      expect(user.get('authData').instagram.id).toEqual('userId');
      expect(spyGet).toHaveBeenCalled();
      expect(spyAccessToken).toHaveBeenCalled();
    });
  });
  describe('auth login with instagram', () => {
    it('Logged in user must remain logged in after logging in with instagram auth adapter secure to insecure case', async () => {
      await reconfigureServer({
        auth: {
          instagram: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken' })
      );
      const user = new Parse.User();
      await user.linkWith('instagram', {
        authData: { code: 'code', redirect_uri: 'redirect_uri' },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();
      await reconfigureServer({
        auth: {
          instagram: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      await user.linkWith('instagram', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
        },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').instagram.access_token).toEqual('accessToken');
      expect(spyGet).toHaveBeenCalled();
      expect(spyAccessToken).toHaveBeenCalled();
    });
    it('Logged in user must remain logged in after logging in with instagram auth adapter insecure to secure case', async () => {
      await reconfigureServer({
        auth: {
          instagram: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken' })
      );
      const user = new Parse.User();
      await user.linkWith('instagram', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();
      await reconfigureServer({
        auth: {
          instagram: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      await user.linkWith('instagram', {
        authData: { code: 'code', redirect_uri: 'redirect_uri' },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').instagram.access_token).toEqual('accessToken');
      expect(spyGet).toHaveBeenCalled();
      expect(spyAccessToken).toHaveBeenCalled();
    });
  });
});

describe('Microsoft graph auth adapter', () => {
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
  describe('insecure usage', () => {
    it('should work with access_token by default', async () => {
      await reconfigureServer({});
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const user = new Parse.User();
      await user.linkWith('microsoft', {
        authData: {
          id: 'userId',
          access_token: 'accessToken',
          redirect_uri: 'redirect_uri',
        },
      });
      await user.fetch();
      expect(user.get('authData').microsoft.access_token).toEqual('accessToken');
      expect(user.get('authData').microsoft.id).toEqual('userId');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should work with access_token when microsoft.enableInsecureAuth is true', async () => {
      await reconfigureServer({
        auth: {
          microsoft: {
            enableInsecureAuth: true,
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const user = new Parse.User();
      await user.linkWith('microsoft', {
        authData: {
          id: 'userId',
          access_token: 'accessToken',
          redirect_uri: 'redirect_uri',
        },
      });
      await user.fetch();
      expect(user.get('authData').microsoft.access_token).toEqual('accessToken');
      expect(user.get('authData').microsoft.id).toEqual('userId');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work with access_token when microsoft.enableInsecureAuth is false', async () => {
      await reconfigureServer({
        auth: {
          microsoft: {
            enableInsecureAuth: false,
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'getAccessToken').and.callFake(() => {
        throw new Error('should not be called');
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('microsoft', {
          authData: {
            access_token: 'accessToken',
            redirect_uri: 'redirect_uri',
          },
        })
      ).toBeRejectedWithError(/Microsoft auth configuration missing clientId and\/or clientSecret/);
      expect(spyGet).not.toHaveBeenCalled();
    });
  });
  describe('secure usage', () => {
    it('should work with code and redirect_uri by default', async () => {
      await reconfigureServer({
        auth: {
          microsoft: {
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.callFake(() => {
        return { access_token: 'accessToken' };
      });

      const user = new Parse.User();
      await user.linkWith('microsoft', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });
      await user.fetch();
      expect(user.get('authData').microsoft.access_token).toEqual('accessToken');
      expect(spyGet).toHaveBeenCalled();
      expect(spyAccessToken).toHaveBeenCalled();
    });
    it('should work with code and redirect_uri when microsoft.enableInsecureAuth is false', async () => {
      await reconfigureServer({
        auth: {
          microsoft: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.callFake(() => {
        return { access_token: 'accessToken' };
      });

      const user = new Parse.User();
      await user.linkWith('microsoft', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });
      await user.fetch();
      expect(user.get('authData').microsoft.access_token).toEqual('accessToken');
      expect(spyGet).toHaveBeenCalled();
      expect(spyAccessToken).toHaveBeenCalled();
    });
    it('should not work without code when microsoft.enableInsecureAuth is false', async () => {
      await reconfigureServer({
        auth: {
          microsoft: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('microsoft', {
          authData: {
            redirect_uri: 'redirect_uri',
          },
        })
      ).toBeRejectedWithError(
        /Microsoft auth configuration authData.code and\/or authData.redirect_uri./
      );
    });
  });
  describe('auth login with microsoft', () => {
    it('Logged in user must remain logged in after logging in with microsoft auth adapter secure to insecure case', async () => {
      await reconfigureServer({
        auth: {
          microsoft: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken' })
      );
      const user = new Parse.User();
      await user.linkWith('microsoft', {
        authData: { code: 'code', redirect_uri: 'redirect_uri' },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();

      await reconfigureServer({
        auth: {
          microsoft: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      await user.linkWith('microsoft', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
        },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').microsoft.access_token).toEqual('accessToken');
      expect(spyGet).toHaveBeenCalled();
      expect(spyAccessToken).toHaveBeenCalled();
    });
    it('Logged in user must remain logged in after logging in with microsoft auth adapter insecure to secure case', async () => {
      await reconfigureServer({
        auth: {
          microsoft: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken' })
      );
      const user = new Parse.User();
      await user.linkWith('microsoft', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();
      await reconfigureServer({
        auth: {
          microsoft: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      await user.linkWith('microsoft', {
        authData: { code: 'code', redirect_uri: 'redirect_uri' },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').microsoft.access_token).toEqual('accessToken');
      expect(spyGet).toHaveBeenCalled();
      expect(spyAccessToken).toHaveBeenCalled();
    });
  });
});

describe('Twitter auth adapter', () => {
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
  const oauth = require('../lib/Adapters/Auth/OAuth1Client');
  describe('insecure usage', () => {
    it('should work with access_token by default', async () => {
      await reconfigureServer({});
      const spySend = spyOn(oauth.prototype, 'send').and.returnValue(
        Promise.resolve({ id: 'userId' })
      );

      const user = new Parse.User();
      await user.linkWith('twitter', {
        authData: {
          oauth_token: 'oauth_token',
          oauth_token_secret: 'oauth_token_secret',
        },
      });

      await user.fetch();
      expect(user.get('authData').twitter.oauth_token).toEqual('oauth_token');
      expect(user.get('authData').twitter.oauth_token_secret).toEqual('oauth_token_secret');
      expect(user.get('authData').twitter.id).toEqual('userId');
      expect(spySend).toHaveBeenCalled();
    });
    it('should work with access_token when twitter.enableInsecureAuth is true', async () => {
      await reconfigureServer({ auth: { twitter: { enableInsecureAuth: true } } });
      const spySend = spyOn(oauth.prototype, 'send').and.returnValue(
        Promise.resolve({ data: { id: 'userId' } })
      );

      const user = new Parse.User();
      await user.linkWith('twitter', {
        authData: {
          oauth_token: 'oauth_token',
          oauth_token_secret: 'oauth_token_secret',
          id: 'userId',
        },
      });
      await user.fetch();
      expect(user.get('authData').twitter.oauth_token).toEqual('oauth_token');
      expect(user.get('authData').twitter.oauth_token_secret).toEqual('oauth_token_secret');
      expect(user.get('authData').twitter.id).toEqual('userId');
      expect(spySend).toHaveBeenCalled();
    });
    it('should not work with access_token when twitter.enableInsecureAuth is false', async () => {
      await reconfigureServer({ auth: { twitter: { enableInsecureAuth: false } } });
      const spySend = spyOn(oauth.prototype, 'send').and.returnValue(
        Promise.resolve({ data: { id: 'userId' } })
      );

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('twitter', {
          authData: {
            oauth_token: 'oauth_token',
            oauth_token_secret: 'oauth_token_secret',
          },
        })
      ).toBeRejectedWithError(
        /Twitter auth configuration missing consumer_key and\/or consumer_secret/
      );
      expect(spySend).not.toHaveBeenCalled();
    });
  });
  describe('secure usage', () => {
    it('should work with oauth_token and oauth_token_secret by default', async () => {
      await reconfigureServer({
        auth: {
          twitter: {
            consumer_key: 'consumer_key',
            consumer_secret: 'consumer_secret',
          },
        },
      });
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.returnValue(
        Promise.resolve({
          oauth_token: 'oauth_token',
          oauth_token_secret: 'oauth_token_secret',
          user_id: 'userId',
        })
      );

      const user = new Parse.User();
      await user.linkWith('twitter', {
        authData: { oauth_token: 'oauth_token', oauth_token_secret: 'oauth_token_secret' },
      });
      await user.fetch();
      expect(user.get('authData').twitter.oauth_token).toEqual('oauth_token');
      expect(user.get('authData').twitter.oauth_token_secret).toEqual('oauth_token_secret');
      expect(user.get('authData').twitter.id).toEqual('userId');
      expect(spyAccessToken).toHaveBeenCalled();
    });
    it('should work with oauth_token and oauth_token_secret when twitter.enableInsecureAuth is true', async () => {
      await reconfigureServer({
        auth: {
          twitter: {
            enableInsecureAuth: true,
            consumer_key: 'consumer_key',
            consumer_secret: 'consumer_secret',
          },
        },
      });

      const spySend = spyOn(oauth.prototype, 'send').and.returnValue(
        Promise.resolve({ data: { id: 'userId' } })
      );

      const user = new Parse.User();
      await user.linkWith('twitter', {
        authData: {
          oauth_token: 'oauth_token',
          oauth_token_secret: 'oauth_token_secret',
          id: 'userId',
        },
      });
      await user.fetch();
      expect(user.get('authData').twitter.oauth_token).toEqual('oauth_token');
      expect(user.get('authData').twitter.oauth_token_secret).toEqual('oauth_token_secret');
      expect(user.get('authData').twitter.id).toEqual('userId');
      expect(spySend).toHaveBeenCalled();
    });
    it('should work with oauth_token and oauth_token_secret when twitter.enableInsecureAuth is false', async () => {
      await reconfigureServer({
        auth: {
          twitter: {
            enableInsecureAuth: false,
            consumer_key: 'consumer_key',
            consumer_secret: 'consumer_secret',
          },
        },
      });

      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.returnValue(
        Promise.resolve({
          oauth_token: 'oauth_token',
          oauth_token_secret: 'oauth_token_secret',
          user_id: 'userId',
        })
      );

      const user = new Parse.User();
      await user.linkWith('twitter', {
        authData: {
          oauth_token: 'oauth_token',
          oauth_token_secret: 'oauth_token_secret',
        },
      });
      await user.fetch();
      expect(user.get('authData').twitter.oauth_token).toEqual('oauth_token');
      expect(user.get('authData').twitter.oauth_token_secret).toEqual('oauth_token_secret');
      expect(user.get('authData').twitter.id).toEqual('userId');
      expect(spyAccessToken).toHaveBeenCalled();
    });
  });
  describe('auth login with twitter', () => {
    it('Logged in user must remain logged in after logging in with twitter auth adapter secure to insecure case', async () => {
      await reconfigureServer({
        auth: {
          twitter: {
            enableInsecureAuth: false,
            consumer_key: 'consumer_key',
            consumer_secret: 'consumer_secret',
          },
        },
      });
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.returnValue(
        Promise.resolve({
          oauth_token: 'oauth_token',
          oauth_token_secret: 'oauth_token_secret',
          user_id: 'userId',
        })
      );
      const spySend = spyOn(oauth.prototype, 'send').and.returnValue(
        Promise.resolve({ data: { id: 'userId' } })
      );
      const user = new Parse.User();
      await user.linkWith('twitter', {
        authData: {
          oauth_token: 'oauth_token',
          oauth_token_secret: 'oauth_token_secret',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();
      await reconfigureServer({
        auth: {
          twitter: {
            enableInsecureAuth: true,
            consumer_key: 'consumer_key',
            consumer_secret: 'consumer_secret',
          },
        },
      });
      await user.linkWith('twitter', {
        authData: {
          oauth_token: 'oauth_token',
          oauth_token_secret: 'oauth_token_secret',
          id: 'userId',
        },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').twitter.oauth_token).toEqual('oauth_token');
      expect(user.get('authData').twitter.oauth_token_secret).toEqual('oauth_token_secret');
      expect(spySend).toHaveBeenCalled();
      expect(spyAccessToken).toHaveBeenCalled();
    });
    it('Logged in user must remain logged in after logging in with twitter auth adapter insecure to secure case', async () => {
      await reconfigureServer({
        auth: {
          twitter: {
            enableInsecureAuth: true,
            consumer_key: 'consumer_key',
            consumer_secret: 'consumer_secret',
          },
        },
      });
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.returnValue(
        Promise.resolve({
          oauth_token: 'oauth_token',
          oauth_token_secret: 'oauth_token_secret',
          user_id: 'userId',
        })
      );
      const spySend = spyOn(oauth.prototype, 'send').and.returnValue(
        Promise.resolve({ data: { id: 'userId' } })
      );
      const user = new Parse.User();
      await user.linkWith('twitter', {
        authData: {
          oauth_token: 'oauth_token',
          oauth_token_secret: 'oauth_token_secret',
          id: 'userId',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();
      await reconfigureServer({
        auth: {
          twitter: {
            enableInsecureAuth: false,
            consumer_key: 'consumer_key',
            consumer_secret: 'consumer_secret',
          },
        },
      });
      await user.linkWith('twitter', {
        authData: {
          oauth_token: 'oauth_token',
          oauth_token_secret: 'oauth_token_secret',
        },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').twitter.oauth_token).toEqual('oauth_token');
      expect(user.get('authData').twitter.oauth_token_secret).toEqual('oauth_token_secret');
      expect(spySend).toHaveBeenCalled();
      expect(spyAccessToken).toHaveBeenCalled();
    });
  });
});

describe('Spotify auth adapter', () => {
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
  describe('insecure usage', () => {
    it('Should work with access token & id by enableInsecureAuth.true', async () => {
      await reconfigureServer({
        auth: {
          spotify: {
            enableInsecureAuth: true,
            clientId: 'clientId',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );

      const user = new Parse.User();
      await user.linkWith('spotify', {
        authData: {
          access_token: 'access_token',
          id: 'userId',
        },
      });

      await user.fetch();
      expect(user.get('authData').spotify.id).toEqual('userId');
      expect(spyGet).toHaveBeenCalled();
    });
    it('Should not work without access token', async () => {
      await reconfigureServer({
        auth: {
          spotify: {
            enableInsecureAuth: true,
            clientId: 'clientId',
          },
        },
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('spotify', {
          authData: {
            id: 'userId',
          },
        })
      ).toBeRejected();
    });
    it('Should not work without id', async () => {
      await reconfigureServer({
        auth: {
          spotify: {
            enableInsecureAuth: true,
            clientId: 'clientId',
          },
        },
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('spotify', {
          authData: {
            access_token: 'access_token',
          },
        })
      ).toBeRejected();
    });
  });
  describe('secure usage', () => {
    it('Should work with code, redirect_uri & code_verifier', async () => {
      await reconfigureServer({
        auth: {
          spotify: {
            enableInsecureAuth: false,
            clientId: 'clientId',
          },
        },
      });
      const spyGetAccessToken = spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'access_token', id: 'userId' })
      );

      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const user = new Parse.User();
      await user.linkWith('spotify', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
          code_verifier: 'code_verifier',
        },
      });

      await user.fetch();
      expect(user.get('authData').spotify.access_token).toEqual('access_token');
      expect(user.get('authData').spotify.id).toEqual('userId');
      expect(spyGetAccessToken).toHaveBeenCalled();
      expect(spyGet).toHaveBeenCalled();
    });
    it('Should not work without code', async () => {
      await reconfigureServer({
        auth: {
          spotify: {
            enableInsecureAuth: false,
            clientId: 'clientId',
          },
        },
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('spotify', {
          authData: {
            redirect_uri: 'redirect_uri',
            code_verifier: 'code_verifier',
          },
        })
      ).toBeRejected();
    });
    it('Should not work without redirect_uri', async () => {
      await reconfigureServer({
        auth: {
          spotify: {
            enableInsecureAuth: false,
            clientId: 'clientId',
          },
        },
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('spotify', {
          authData: {
            code: 'code',
            code_verifier: 'code_verifier',
          },
        })
      ).toBeRejected();
    });
    it('Should not work without code_verifier', async () => {
      await reconfigureServer({
        auth: {
          spotify: {
            enableInsecureAuth: false,
            clientId: 'clientId',
          },
        },
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('spotify', {
          authData: {
            code: 'code',
            redirect_uri: 'redirect_uri',
          },
        })
      ).toBeRejected();
    });
  });
  describe('auth login with spotify', () => {
    it('Logged in user must remain logged in after logging in with spotify auth adapter secure to insecure case', async () => {
      await reconfigureServer({
        auth: {
          spotify: {
            enableInsecureAuth: false,
            clientId: 'clientId',
          },
        },
      });
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.returnValue(
        Promise.resolve({
          access_token: 'access_token',
        })
      );
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const user = new Parse.User();
      await user.linkWith('spotify', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
          code_verifier: 'code_verifier',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();
      expect(user.get('authData').spotify.access_token).toEqual('access_token');
      expect(user.get('authData').spotify.id).toEqual('userId');
      expect(spyAccessToken).toHaveBeenCalled();

      await reconfigureServer({
        auth: {
          spotify: {
            enableInsecureAuth: true,
            clientId: 'clientId',
          },
        },
      });

      await user.linkWith('spotify', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
        },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').spotify.access_token).toEqual('accessToken');
      expect(user.get('authData').spotify.id).toEqual('userId');
      expect(spyGet).toHaveBeenCalled();
    });
    it('Logged in user must remain logged in after logging in with spotify auth adapter insecure to secure case', async () => {
      await reconfigureServer({
        auth: {
          spotify: {
            enableInsecureAuth: true,
            clientId: 'clientId',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ id: 'userId' })
      );
      const spyAccessToken = spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken' })
      );
      const user = new Parse.User();
      await user.linkWith('spotify', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();
      await reconfigureServer({
        auth: {
          spotify: {
            enableInsecureAuth: false,
            clientId: 'clientId',
          },
        },
      });
      await user.linkWith('spotify', {
        authData: {
          code: 'code',
          code_verifier: 'code_verifier',
          redirect_uri: 'redirect_uri',
        },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(spyGet).toHaveBeenCalled();
      expect(spyAccessToken).toHaveBeenCalled();
    });
  });
});

describe('Wechat adapter', () => {
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
  describe('insecure usage', () => {
    it('should work with access token by default', async () => {
      await reconfigureServer({
        auth: {
          wechat: {
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', openid: 'openid', errcode: 0 })
      );
      const user = new Parse.User();
      await user.linkWith('wechat', {
        authData: {
          access_token: 'accessToken',
          id: 'openid',
        },
      });
      await user.fetch();
      expect(user.get('authData').wechat.access_token).toEqual('accessToken');
      expect(user.get('authData').wechat.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should work with access token and id by insecure.true', async () => {
      await reconfigureServer({
        auth: {
          wechat: {
            enableInsecureAuth: true,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', openid: 'openid', errcode: 0 })
      );
      const user = new Parse.User();
      await user.linkWith('wechat', {
        authData: {
          access_token: 'accessToken',
          id: 'openid',
        },
      });
      await user.fetch();
      expect(user.get('authData').wechat.access_token).toEqual('accessToken');
      expect(user.get('authData').wechat.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work without access token', async () => {
      await reconfigureServer({
        auth: {
          wechat: {
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('wechat', {
          authData: {
            access_token: undefined,
            id: 'openid',
          },
        })
      ).toBeRejected();
    });
    it('should not work without id', async () => {
      await reconfigureServer({
        auth: {
          wechat: {
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('wechat', {
          authData: {
            access_token: 'accessToken',
            id: undefined,
          },
        })
      ).toBeRejected();
    });
  });
  describe('secure usage', () => {
    it('should work with code by default', async () => {
      await reconfigureServer({
        auth: {
          wechat: {
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', openid: 'openid', errcode: 0 })
      );
      const user = new Parse.User();
      await user.linkWith('wechat', {
        authData: {
          code: 'code',
        },
      });
      await user.fetch();
      expect(user.get('authData').wechat.access_token).toEqual('accessToken');
      expect(user.get('authData').wechat.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should work with code by insecure.false', async () => {
      await reconfigureServer({
        auth: {
          wechat: {
            enableInsecureAuth: false,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', openid: 'openid', errcode: 0 })
      );
      const user = new Parse.User();
      await user.linkWith('wechat', {
        authData: {
          code: 'code',
        },
      });
      await user.fetch();
      expect(user.get('authData').wechat.access_token).toEqual('accessToken');
      expect(user.get('authData').wechat.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should should work with code by insecure.true', async () => {
      await reconfigureServer({
        auth: {
          wechat: {
            enableInsecureAuth: true,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', openid: 'openid', errcode: 0 })
      );
      const user = new Parse.User();
      await user.linkWith('wechat', {
        authData: {
          access_token: 'accessToken',
          id: 'openid',
        },
      });
      await user.fetch();
      expect(user.get('authData').wechat.access_token).toEqual('accessToken');
      expect(user.get('authData').wechat.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work without code', async () => {
      await reconfigureServer({
        auth: {
          wechat: {
            enableInsecureAuth: false,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('spotify', {
          authData: {
            code: 'code',
            redirect_uri: 'redirect_uri',
          },
        })
      ).toBeRejected();
    });
  });
  describe('auth login with wechat', () => {
    it('Logged in user must remain logged in after logging in with wechat auth adapter secure to insecure case', async () => {
      await reconfigureServer({
        auth: {
          wechat: {
            enableInsecureAuth: false,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', openid: 'openid', errcode: 0 })
      );
      const user = new Parse.User();
      await user.linkWith('wechat', {
        authData: {
          code: 'code',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();

      await reconfigureServer({
        auth: {
          wechat: {
            enableInsecureAuth: true,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      await user.linkWith('wechat', {
        authData: {
          access_token: 'accessToken',
          id: 'openid',
        },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').wechat.access_token).toEqual('accessToken');
      expect(user.get('authData').wechat.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('Logged in user must remain logged in after logging in with wechat auth adapter insecure to secure case', async () => {
      await reconfigureServer({
        auth: {
          wechat: {
            enableInsecureAuth: true,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', openid: 'openid', errcode: 0 })
      );
      const user = new Parse.User();
      await user.linkWith('wechat', {
        authData: {
          access_token: 'accessToken',
          id: 'openid',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();

      await reconfigureServer({
        auth: {
          wechat: {
            enableInsecureAuth: false,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      await user.linkWith('wechat', {
        authData: {
          code: 'code',
        },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').wechat.access_token).toEqual('accessToken');
      expect(user.get('authData').wechat.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
  });
});

describe('QQ adapter', () => {
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
  describe('insecure usage', () => {
    it('should work with access token and id by default', async () => {
      await reconfigureServer({
        auth: {
          qq: {
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve('({"access_token": "accessToken", "openid": "openid"})')
      );
      const user = new Parse.User();
      await user.linkWith('qq', {
        authData: {
          access_token: 'accessToken',
          id: 'openid',
        },
      });
      await user.fetch();
      expect(user.get('authData').qq.access_token).toEqual('accessToken');
      expect(user.get('authData').qq.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should work with access token and id by insecure.true', async () => {
      await reconfigureServer({
        auth: {
          qq: {
            enableInsecureAuth: true,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve('({"access_token": "accessToken", "openid": "openid"})')
      );
      const user = new Parse.User();
      await user.linkWith('qq', {
        authData: {
          access_token: 'accessToken',
          id: 'openid',
        },
      });
      await user.fetch();
      expect(user.get('authData').qq.access_token).toEqual('accessToken');
      expect(user.get('authData').qq.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work without access token', async () => {
      await reconfigureServer({
        auth: {
          qq: {
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('qq', {
          authData: {
            access_token: undefined,
            id: 'openid',
          },
        })
      ).toBeRejected();
    });
    it('should not work without id', async () => {
      await reconfigureServer({
        auth: {
          qq: {
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('qq', {
          authData: {
            access_token: 'accessToken',
            id: undefined,
          },
        })
      ).toBeRejected();
    });
  });
  describe('secure usage', () => {
    it('should work with code by default', async () => {
      await reconfigureServer({
        auth: {
          qq: {
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve('({"access_token": "accessToken", "openid": "openid"})')
      );
      const user = new Parse.User();
      await user.linkWith('qq', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });
      await user.fetch();
      expect(user.get('authData').qq.access_token).toEqual('accessToken');
      expect(user.get('authData').qq.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should work with code by insecure.false', async () => {
      await reconfigureServer({
        auth: {
          qq: {
            enableInsecureAuth: false,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve('({"access_token": "accessToken", "openid": "openid"})')
      );
      const user = new Parse.User();
      await user.linkWith('qq', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });
      await user.fetch();
      expect(user.get('authData').qq.access_token).toEqual('accessToken');
      expect(user.get('authData').qq.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should should work with code by insecure.true', async () => {
      await reconfigureServer({
        auth: {
          qq: {
            enableInsecureAuth: true,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve('({"access_token": "accessToken", "openid": "openid"})')
      );
      const user = new Parse.User();
      await user.linkWith('qq', {
        authData: {
          access_token: 'accessToken',
          id: 'openid',
        },
      });
      await user.fetch();
      expect(user.get('authData').qq.access_token).toEqual('accessToken');
      expect(user.get('authData').qq.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work without code', async () => {
      await reconfigureServer({
        auth: {
          qq: {
            enableInsecureAuth: false,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('spotify', {
          authData: {
            code: 'code',
            redirect_uri: 'redirect_uri',
          },
        })
      ).toBeRejected();
    });
  });
  describe('auth login with qq', () => {
    it('Logged in user must remain logged in after logging in with qq auth adapter secure to insecure case', async () => {
      await reconfigureServer({
        auth: {
          qq: {
            enableInsecureAuth: false,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve('({"access_token": "accessToken", "openid": "openid"})')
      );
      const user = new Parse.User();
      await user.linkWith('qq', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();

      await reconfigureServer({
        auth: {
          qq: {
            enableInsecureAuth: true,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      await user.linkWith('qq', {
        authData: {
          access_token: 'accessToken',
          id: 'openid',
        },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').qq.access_token).toEqual('accessToken');
      expect(user.get('authData').qq.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('Logged in user must remain logged in after logging in with qq auth adapter insecure to secure case', async () => {
      await reconfigureServer({
        auth: {
          qq: {
            enableInsecureAuth: true,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve('({"access_token": "accessToken", "openid": "openid"})')
      );
      const user = new Parse.User();
      await user.linkWith('qq', {
        authData: {
          access_token: 'accessToken',
          id: 'openid',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();

      await reconfigureServer({
        auth: {
          qq: {
            enableInsecureAuth: false,
            appId: 'appId',
            appSecret: 'appSecret',
          },
        },
      });
      await user.linkWith('qq', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').qq.access_token).toEqual('accessToken');
      expect(user.get('authData').qq.id).toEqual('openid');
      expect(spyGet).toHaveBeenCalled();
    });
  });
});

describe('oauth2 adapter', () => {
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
  describe('insecure usage', () => {
    it('should work with access token and id by default', async () => {
      await reconfigureServer({
        auth: {
          oauth2: {
            appId: 'appId',
            appSecret: 'appSecret',
            tokenIntrospectionEndpointUrl: 'https://www.example.com/oauth2/v2',
            authorizationHeader: 'Bearer',
            useridField: 'id',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'request').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', id: 'id', active: true })
      );

      const user = new Parse.User();
      await user.linkWith('oauth2', {
        authData: {
          access_token: 'accessToken',
          id: 'id',
        },
      });

      await user.fetch();
      expect(user.get('authData').oauth2.access_token).toEqual('accessToken');
      expect(user.get('authData').oauth2.id).toEqual('id');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should work with code if oauth2 enable insecure is undefined', async () => {
      await reconfigureServer({
        auth: {
          oauth2: {
            appId: 'appId',
            appSecret: 'appSecret',
            tokenIntrospectionEndpointUrl: 'https://www.example.com/oauth2/v2',
            authorizationHeader: 'Bearer',
            useridField: 'id',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'request').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', id: 'id', active: true })
      );

      const user = new Parse.User();
      await user.linkWith('oauth2', {
        authData: {
          code: 'code',
        },
      });

      await user.fetch();
      expect(user.get('authData').oauth2.access_token).toEqual('accessToken');
      expect(user.get('authData').oauth2.id).toEqual('id');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should work with code if oauth2 enable insecure is true', async () => {
      await reconfigureServer({
        auth: {
          oauth2: {
            enableInsecureAuth: true,
            appId: 'appId',
            appSecret: 'appSecret',
            tokenIntrospectionEndpointUrl: 'https://www.example.com/oauth2/v2',
            authorizationHeader: 'Bearer',
            useridField: 'id',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'request').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', id: 'id', active: true })
      );

      const user = new Parse.User();
      await user.linkWith('oauth2', {
        authData: {
          access_token: 'accessToken',
          id: 'id',
        },
      });

      await user.fetch();
      expect(user.get('authData').oauth2.access_token).toEqual('accessToken');
      expect(user.get('authData').oauth2.id).toEqual('id');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work with id & without access token', async () => {
      await reconfigureServer({
        auth: {
          oauth2: {
            enableInsecureAuth: true,
            appId: 'appId',
            appSecret: 'appSecret',
            tokenIntrospectionEndpointUrl: 'https://www.example.com/oauth2/v2',
            authorizationHeader: 'Bearer',
            useridField: 'id',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'request').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', id: 'id', active: true })
      );

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('spotify', {
          authData: {
            code: 'code',
            redirect_uri: 'redirect_uri',
          },
        })
      ).toBeRejected();

      expect(spyGet).not.toHaveBeenCalled();
    });
    it('should not work with access_token & without id', async () => {
      await reconfigureServer({
        auth: {
          oauth2: {
            enableInsecureAuth: true,
            appId: 'appId',
            appSecret: 'appSecret',
            tokenIntrospectionEndpointUrl: 'https://www.example.com/oauth2/v2',
            authorizationHeader: 'Bearer',
            useridField: 'id',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'request').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', id: 'id', active: true })
      );

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('spotify', {
          authData: {
            code: 'code',
            redirect_uri: 'redirect_uri',
          },
        })
      ).toBeRejected();

      expect(spyGet).not.toHaveBeenCalled();
    });
  });
  describe('secure usage', () => {
    it('should work with code', async () => {
      await reconfigureServer({
        auth: {
          oauth2: {
            appId: 'appId',
            appSecret: 'appSecret',
            tokenIntrospectionEndpointUrl: 'https://www.example.com/oauth2/v2',
            authorizationHeader: 'Bearer',
            useridField: 'id',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'request').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', id: 'id', active: true })
      );

      const user = new Parse.User();
      await user.linkWith('oauth2', {
        authData: {
          code: 'code',
        },
      });

      await user.fetch();
      expect(user.get('authData').oauth2.access_token).toEqual('accessToken');
      expect(user.get('authData').oauth2.id).toEqual('id');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work without code', async () => {
      await reconfigureServer({
        auth: {
          oauth2: {
            appId: 'appId',
            appSecret: 'appSecret',
            tokenIntrospectionEndpointUrl: 'https://www.example.com/oauth2/v2',
            authorizationHeader: 'Bearer',
            useridField: 'id',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'request').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', id: 'id', active: true })
      );

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('spotify', {
          authData: {
            redirect_uri: 'redirect_uri',
          },
        })
      ).toBeRejected();

      expect(spyGet).not.toHaveBeenCalled();
    });
  });
});

describe('gpgames auth adapter', () => {
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
  describe('insecure usage', () => {
    it('should work with access_token and id', async () => {
      await reconfigureServer({
        auth: {
          gpgames: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ playerId: 'playerId', access_token: 'accessToken' })
      );
      const user = new Parse.User();
      await user.linkWith('gpgames', {
        authData: {
          id: 'playerId',
          access_token: 'accessToken',
        },
      });
      await user.fetch();
      expect(user.get('authData').gpgames.access_token).toEqual('accessToken');
      expect(user.get('authData').gpgames.id).toEqual('playerId');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work without access_token', async () => {
      await reconfigureServer({
        auth: {
          gpgames: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('gpgames', {
          authData: {
            id: 'playerId',
            access_token: undefined,
          },
        })
      ).toBeRejected();
    });
    it('should not work without id', async () => {
      await reconfigureServer({
        auth: {
          gpgames: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('gpgames', {
          authData: {
            id: undefined,
            access_token: 'accessToken',
          },
        })
      ).toBeRejected();
    });
  });
  describe('secure usage', () => {
    it('should work with code', async () => {
      await reconfigureServer({
        auth: {
          gpgames: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ playerId: 'playerId', access_token: 'accessToken' })
      );
      spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ playerId: 'playerId', access_token: 'accessToken' })
      );
      const user = new Parse.User();
      await user.linkWith('gpgames', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });
      await user.fetch();
      expect(user.get('authData').gpgames.access_token).toEqual('accessToken');
      expect(user.get('authData').gpgames.id).toEqual('playerId');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work without code', async () => {
      await reconfigureServer({
        auth: {
          gpgames: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('gpgames', {
          authData: {
            redirect_uri: 'redirect_uri',
          },
        })
      ).toBeRejected();
    });
    it('should not work without redirect_uri', async () => {
      await reconfigureServer({
        auth: {
          gpgames: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const user = new Parse.User();
      await expectAsync(
        user.linkWith('gpgames', {
          authData: {
            code: 'code',
          },
        })
      ).toBeRejected();
    });
  });
  describe('auth login with gpgames', () => {
    it('Logged in user must remain logged in after logging in with gpgames auth adapter secure to insecure case', async () => {
      await reconfigureServer({
        auth: {
          gpgames: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ playerId: 'playerId', access_token: 'accessToken' })
      );
      spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ playerId: 'playerId', access_token: 'accessToken' })
      );
      const user = new Parse.User();
      await user.linkWith('gpgames', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();
      await reconfigureServer({
        auth: {
          gpgames: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      await user.linkWith('gpgames', {
        authData: {
          id: 'playerId',
          access_token: 'accessToken',
        },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').gpgames.access_token).toEqual('accessToken');
      expect(user.get('authData').gpgames.id).toEqual('playerId');
      expect(spyGet).toHaveBeenCalled();
    });
    it('Logged in user must remain logged in after logging in with gpgames auth adapter insecure to secure case', async () => {
      await reconfigureServer({
        auth: {
          gpgames: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ playerId: 'playerId', access_token: 'accessToken' })
      );
      spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ playerId: 'playerId', access_token: 'accessToken' })
      );
      const user = new Parse.User();
      await user.linkWith('gpgames', {
        authData: {
          id: 'playerId',
          access_token: 'accessToken',
        },
      });
      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();
      await reconfigureServer({
        auth: {
          gpgames: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });
      await user.linkWith('gpgames', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });
      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').gpgames.access_token).toEqual('accessToken');
      expect(user.get('authData').gpgames.id).toEqual('playerId');
      expect(spyGet).toHaveBeenCalled();
    });
  });
});
describe('Weibo adapter', () => {
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
  describe('insecure usage', () => {
    it('should work with access token and id by default', async () => {
      await reconfigureServer({
        auth: {
          weibo: {
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'request').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', uid: 'uid' })
      );
      const user = new Parse.User();
      await user.linkWith('weibo', {
        authData: {
          access_token: 'accessToken',
          id: 'uid',
        },
      });
      await user.fetch();
      expect(user.get('authData').weibo.access_token).toEqual('accessToken');
      expect(user.get('authData').weibo.id).toEqual('uid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should work with access token and id when using insecure authentication', async () => {
      await reconfigureServer({
        auth: {
          weibo: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'request').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', uid: 'uid' })
      );
      const user = new Parse.User();
      await user.linkWith('weibo', {
        authData: {
          access_token: 'accessToken',
          id: 'uid',
        },
      });
      await user.fetch();
      expect(user.get('authData').weibo.access_token).toEqual('accessToken');
      expect(user.get('authData').weibo.id).toEqual('uid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work without access token', async () => {
      await reconfigureServer({
        auth: {
          weibo: {
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('weibo', {
          authData: {
            access_token: undefined,
            id: 'uid',
          },
        })
      ).toBeRejected();
    });
    it('should not work without id', async () => {
      await reconfigureServer({
        auth: {
          weibo: {
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('weibo', {
          authData: {
            access_token: 'accessToken',
            id: undefined,
          },
        })
      ).toBeRejected();
    });
  });
  describe('secure usage', () => {
    it('should work with code by default', async () => {
      await reconfigureServer({
        auth: {
          weibo: {
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'request').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', uid: 'uid' })
      );

      const user = new Parse.User();
      await user.linkWith('weibo', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });

      await user.fetch();
      expect(user.get('authData').weibo.access_token).toEqual('accessToken');
      expect(user.get('authData').weibo.id).toEqual('uid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should work with code when using secure authentication', async () => {
      await reconfigureServer({
        auth: {
          weibo: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'request').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', uid: 'uid' })
      );

      const user = new Parse.User();
      await user.linkWith('weibo', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });

      await user.fetch();
      expect(user.get('authData').weibo.access_token).toEqual('accessToken');
      expect(user.get('authData').weibo.id).toEqual('uid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work without code', async () => {
      await reconfigureServer({
        auth: {
          weibo: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('weibo', {
          authData: {
            redirect_uri: 'redirect_uri',
          },
        })
      ).toBeRejected();
    });
  });
  describe('auth login with Weibo', () => {
    it('Logged in user must remain logged in after logging in with Weibo auth adapter secure to insecure case', async () => {
      await reconfigureServer({
        auth: {
          weibo: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'request').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', uid: 'uid' })
      );
      const user = new Parse.User();
      await user.linkWith('weibo', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });

      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();

      await reconfigureServer({
        auth: {
          weibo: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      user.linkWith('weibo', {
        authData: {
          access_token: 'accessToken',
          id: 'uid',
        },
      });

      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').weibo.access_token).toEqual('accessToken');
      expect(user.get('authData').weibo.id).toEqual('uid');
      expect(spyGet).toHaveBeenCalled();
    });
    it('Logged in user must remain logged in after logging in with Weibo auth adapter insecure to secure case', async () => {
      await reconfigureServer({
        auth: {
          weibo: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'request').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', uid: 'uid' })
      );
      const user = new Parse.User();
      await user.linkWith('weibo', {
        authData: {
          access_token: 'accessToken',
          id: 'uid',
        },
      });

      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();

      await reconfigureServer({
        auth: {
          weibo: {
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      await user.linkWith('weibo', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });

      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').weibo.access_token).toEqual('accessToken');
      expect(user.get('authData').weibo.id).toEqual('uid');
      expect(spyGet).toHaveBeenCalled();
    });
  });
});

describe('Line adapter', () => {
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
  describe('insecure usage', () => {
    it('should work with access token and id by default', async () => {
      await reconfigureServer({
        auth: {
          line: {
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const user = new Parse.User();
      await user.linkWith('line', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
        },
      });
      await user.fetch();
      expect(user.get('authData').line.access_token).toEqual('accessToken');
      expect(user.get('authData').line.id).toEqual('userId');
    });
    it('should work with access token and id when using insecure authentication', async () => {
      await reconfigureServer({
        auth: {
          line: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', userId: 'userId' })
      );

      const user = new Parse.User();
      await user.linkWith('line', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
        },
      });
      await user.fetch();
      expect(user.get('authData').line.access_token).toEqual('accessToken');
      expect(user.get('authData').line.id).toEqual('userId');
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work without access token', async () => {
      await reconfigureServer({
        auth: {
          line: {
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('line', {
          authData: {
            access_token: undefined,
            id: 'userId',
          },
        })
      ).toBeRejected();
    });
  });

  describe('secure usage', () => {
    it('should work with code by default', async () => {
      await reconfigureServer({
        auth: {
          line: {
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const spyGetAccessToken = spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', userId: 'userId' })
      );
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', userId: 'userId' })
      );

      const user = new Parse.User();
      await user.linkWith('line', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });

      await user.fetch();
      expect(user.get('authData').line.access_token).toEqual('accessToken');
      expect(user.get('authData').line.id).toEqual('userId');
      expect(spyGetAccessToken).toHaveBeenCalled();
      expect(spyGet).toHaveBeenCalled();
    });
    it('should work with code when using secure authentication', async () => {
      await reconfigureServer({
        auth: {
          line: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      const spyGetAccessToken = spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', userId: 'userId' })
      );
      const spyGet = spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', userId: 'userId' })
      );

      const user = new Parse.User();
      await user.linkWith('line', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });

      await user.fetch();
      expect(user.get('authData').line.access_token).toEqual('accessToken');
      expect(user.get('authData').line.id).toEqual('userId');
      expect(spyGetAccessToken).toHaveBeenCalled();
      expect(spyGet).toHaveBeenCalled();
    });
    it('should not work without code', async () => {
      await reconfigureServer({
        auth: {
          line: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', userId: 'userId' })
      );
      spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', userId: 'userId' })
      );

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('line', {
          authData: {
            redirect_uri: 'redirect_uri',
            code: undefined,
          },
        })
      ).toBeRejected();
    });
    it('should not work without redirect_uri', async () => {
      await reconfigureServer({
        auth: {
          line: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', userId: 'userId' })
      );
      spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', userId: 'userId' })
      );

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('line', {
          authData: {
            code: 'code',
          },
        })
      ).toBeRejected();
    });
  });
  describe('auth login with Line', () => {
    it('Logged in user must remain logged in after logging in with Line auth adapter secure to insecure case', async () => {
      await reconfigureServer({
        auth: {
          line: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', userId: 'userId' })
      );
      spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', userId: 'userId' })
      );

      const user = new Parse.User();
      await user.linkWith('line', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
        },
      });

      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();

      await reconfigureServer({
        auth: {
          line: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      await user.linkWith('line', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });

      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').line.access_token).toEqual('accessToken');
      expect(user.get('authData').line.id).toEqual('userId');
    });
    it('Logged in user must remain logged in after logging in with Line auth adapter insecure to secure case', async () => {
      await reconfigureServer({
        auth: {
          line: {
            enableInsecureAuth: false,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      spyOn(httpsRequest, 'getAccessToken').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', userId: 'userId' })
      );
      spyOn(httpsRequest, 'get').and.callFake(() =>
        Promise.resolve({ access_token: 'accessToken', userId: 'userId' })
      );

      const user = new Parse.User();
      await user.linkWith('line', {
        authData: {
          code: 'code',
          redirect_uri: 'redirect_uri',
        },
      });

      await user.fetch();
      const userId = user.id;
      const sessionToken = user.getSessionToken();

      await reconfigureServer({
        auth: {
          line: {
            enableInsecureAuth: true,
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        },
      });

      await user.linkWith('line', {
        authData: {
          access_token: 'accessToken',
          id: 'userId',
        },
      });

      await user.fetch();
      expect(user.id).toEqual(userId);
      expect(user.getSessionToken()).toEqual(sessionToken);
      expect(user.get('authData').line.access_token).toEqual('accessToken');
      expect(user.get('authData').line.id).toEqual('userId');
    });
  });
});

describe('Gcenter adapter', () => {
  const gcenter = require('../lib/Adapters/Auth/gcenter');
  const fs = require('fs');
  const testCert = fs.readFileSync(__dirname + '/support/cert/game_center.pem');
  describe('insecure usage', () => {
    it('should authenticate', async () => {
      await reconfigureServer({
        auth: {
          gcenter: {
            enableInsecureAuth: true,
          },
        },
      });
      gcenter.cache['https://static.gc.apple.com/public-key/gc-prod-4.cer'] = testCert;

      const user = new Parse.User();
      await user.linkWith('gcenter', {
        authData: {
          id: 'G:1965586982',
          publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
          timestamp: 1565257031287,
          signature:
            'uqLBTr9Uex8zCpc1UQ1MIDMitb+HUat2Mah4Kw6AVLSGe0gGNJXlih2i5X+0ZwVY0S9zY2NHWi2gFjmhjt/4kxWGMkupqXX5H/qhE2m7hzox6lZJpH98ZEUbouWRfZX2ZhUlCkAX09oRNi7fI7mWL1/o88MaI/y6k6tLr14JTzmlxgdyhw+QRLxRPA6NuvUlRSJpyJ4aGtNH5/wHdKQWL8nUnFYiYmaY8R7IjzNxPfy8UJTUWmeZvMSgND4u8EjADPsz7ZtZyWAPi8kYcAb6M8k0jwLD3vrYCB8XXyO2RQb/FY2TM4zJuI7PzLlvvgOJXbbfVtHx7Evnm5NYoyzgzw==',
          salt: 'DzqqrQ==',
          bundleId: 'cloud.xtralife.gamecenterauth',
        },
      });
      await user.fetch();
      expect(user.get('authData').gcenter.id).toEqual('G:1965586982');
      expect(user.get('authData').gcenter.publicKeyUrl).toEqual(
        'https://static.gc.apple.com/public-key/gc-prod-4.cer'
      );
    });
    it('should not authenticate with wrong public key', async () => {
      await reconfigureServer({
        auth: {
          gcenter: {
            enableInsecureAuth: true,
          },
        },
      });
      gcenter.cache['https://static.gc.apple.com/public-key/gc-prod-4.cer'] = testCert;

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('gcenter', {
          authData: {
            id: 'G:1965586982',
            publicKeyUrl: 'https://static.gc.apple.com/public-key/wrong.cer',
            timestamp: 1565257031287,
            signature:
              'uqLBTr9Uex8zCpc1UQ1MIDMitb+HUat2Mah4Kw6AVLSGe0gGNJXlih2i5X+0ZwVY0S9zY2NHWi2gFjmhjt/4kxWGMkupqXX5H/qhE2m7hzox6lZJpH98ZEUbouWRfZX2ZhUlCkAX09oRNi7fI7mWL1/o88MaI/y6k6tLr14JTzmlxgdyhw+QRLxRPA6NuvUlRSJpyJ4aGtNH5/wHdKQWL8nUnFYiYmaY8R7IjzNxPfy8UJTUWmeZvMSgND4u8EjADPsz7ZtZyWAPi8kYcAb6M8k0jwLD3vrYCB8XXyO2RQb/FY2TM4zJuI7PzLlvvgOJXbbfVtHx7Evnm5NYoyzgzw==',
            salt: 'DzqqrQ==',
            bundleId: 'cloud.xtralife.gamecenterauth',
          },
        })
      ).toBeRejected();
    });
    it('should not authenticate with wrong salt', async () => {
      await reconfigureServer({
        auth: {
          gcenter: {
            enableInsecureAuth: true,
          },
        },
      });
      gcenter.cache['https://static.gc.apple.com/public-key/gc-prod-4.cer'] = testCert;

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('gcenter', {
          authData: {
            id: 'G:1965586982',
            publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
            timestamp: 1565257031287,
            signature:
              'uqLBTr9Uex8zCpc1UQ1MIDMitb+HUat2Mah4Kw6AVLSGe0gGNJXlih2i5X+0ZwVY0S9zY2NHWi2gFjmhjt/4kxWGMkupqXX5H/qhE2m7hzox6lZJpH98ZEUbouWRfZX2ZhUlCkAX09oRNi7fI7mWL1/o88MaI/y6k6tLr14JTzmlxgdyhw+QRLxRPA6NuvUlRSJpyJ4aGtNH5/wHdKQWL8nUnFYiYmaY8R7IjzNxPfy8UJTUWmeZvMSgND4u8EjADPsz7ZtZyWAPi8kYcAb6M8k0jwLD3vrYCB8XXyO2RQb/FY2TM4zJuI7PzLlvvgOJXbbfVtHx7Evnm5NYoyzgzw==',
            salt: 'wrong',
            bundleId: 'cloud.xtralife.gamecenterauth',
          },
        })
      ).toBeRejected();
    });
    it('should not authenticate with wrong signature', async () => {
      await reconfigureServer({
        auth: {
          gcenter: {
            enableInsecureAuth: true,
          },
        },
      });
      gcenter.cache['https://static.gc.apple.com/public-key/gc-prod-4.cer'] = testCert;

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('gcenter', {
          authData: {
            id: 'G:1965586982',
            publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
            timestamp: 1565257031287,
            signature: 'wrong',
            salt: 'DzqqrQ==',
            bundleId: 'cloud.xtralife.gamecenterauth',
          },
        })
      ).toBeRejected();
    });
    it('should not authenticate with wrong bundleId', async () => {
      await reconfigureServer({
        auth: {
          gcenter: {
            enableInsecureAuth: true,
          },
        },
      });
      gcenter.cache['https://static.gc.apple.com/public-key/gc-prod-4.cer'] = testCert;

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('gcenter', {
          authData: {
            id: 'G:1965586982',
            publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
            timestamp: 1565257031287,
            signature:
              'uqLBTr9Uex8zCpc1UQ1MIDMitb+HUat2Mah4Kw6AVLSGe0gGNJXlih2i5X+0ZwVY0S9zY2NHWi2gFjmhjt/4kxWGMkupqXX5H/qhE2m7hzox6lZJpH98ZEUbouWRfZX2ZhUlCkAX09oRNi7fI7mWL1/o88MaI/y6k6tLr14JTzmlxgdyhw+QRLxRPA6NuvUlRSJpyJ4aGtNH5/wHdKQWL8nUnFYiYmaY8R7IjzNxPfy8UJTUWmeZvMSgND4u8EjADPsz7ZtZyWAPi8kYcAb6M8k0jwLD3vrYCB8XXyO2RQb/FY2TM4zJuI7PzLlvvgOJXbbfVtHx7Evnm5NYoyzgzw==',
            salt: 'DzqqrQ==',
            bundleId: 'wrong',
          },
        })
      ).toBeRejected();
    });
  });
  describe('secure usage', () => {
    it('should authenticate', async () => {
      await reconfigureServer({
        auth: {
          gcenter: {
            enableInsecureAuth: false,
            bundleId: 'cloud.xtralife.gamecenterauth',
          },
        },
      });
      gcenter.cache['https://static.gc.apple.com/public-key/gc-prod-4.cer'] = testCert;

      const user = new Parse.User();
      await user.linkWith('gcenter', {
        authData: {
          id: 'G:1965586982',
          publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
          timestamp: 1565257031287,
          signature:
            'uqLBTr9Uex8zCpc1UQ1MIDMitb+HUat2Mah4Kw6AVLSGe0gGNJXlih2i5X+0ZwVY0S9zY2NHWi2gFjmhjt/4kxWGMkupqXX5H/qhE2m7hzox6lZJpH98ZEUbouWRfZX2ZhUlCkAX09oRNi7fI7mWL1/o88MaI/y6k6tLr14JTzmlxgdyhw+QRLxRPA6NuvUlRSJpyJ4aGtNH5/wHdKQWL8nUnFYiYmaY8R7IjzNxPfy8UJTUWmeZvMSgND4u8EjADPsz7ZtZyWAPi8kYcAb6M8k0jwLD3vrYCB8XXyO2RQb/FY2TM4zJuI7PzLlvvgOJXbbfVtHx7Evnm5NYoyzgzw==',
          salt: 'DzqqrQ==',
        },
      });
      await user.fetch();
      expect(user.get('authData').gcenter.id).toEqual('G:1965586982');
      expect(user.get('authData').gcenter.publicKeyUrl).toEqual(
        'https://static.gc.apple.com/public-key/gc-prod-4.cer'
      );
    });
    it('should not authenticate without bundleId set in config', async () => {
      await reconfigureServer({
        auth: {
          gcenter: {
            enableInsecureAuth: false,
          },
        },
      });
      gcenter.cache['https://static.gc.apple.com/public-key/gc-prod-4.cer'] = testCert;

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('gcenter', {
          authData: {
            id: 'G:1965586982',
            publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
            timestamp: 1565257031287,
            signature:
              'uqLBTr9Uex8zCpc1UQ1MIDMitb+HUat2Mah4Kw6AVLSGe0gGNJXlih2i5X+0ZwVY0S9zY2NHWi2gFjmhjt/4kxWGMkupqXX5H/qhE2m7hzox6lZJpH98ZEUbouWRfZX2ZhUlCkAX09oRNi7fI7mWL1/o88MaI/y6k6tLr14JTzmlxgdyhw+QRLxRPA6NuvUlRSJpyJ4aGtNH5/wHdKQWL8nUnFYiYmaY8R7IjzNxPfy8UJTUWmeZvMSgND4u8EjADPsz7ZtZyWAPi8kYcAb6M8k0jwLD3vrYCB8XXyO2RQb/FY2TM4zJuI7PzLlvvgOJXbbfVtHx7Evnm5NYoyzgzw==',
            salt: 'DzqqrQ==',
          },
        })
      ).toBeRejected();
    });
    it('should not authenticate with wrong bundleId set in config', async () => {
      await reconfigureServer({
        auth: {
          gcenter: {
            enableInsecureAuth: false,
            bundleId: 'wrong',
          },
        },
      });
      gcenter.cache['https://static.gc.apple.com/public-key/gc-prod-4.cer'] = testCert;

      const user = new Parse.User();
      await expectAsync(
        user.linkWith('gcenter', {
          authData: {
            id: 'G:1965586982',
            publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
            timestamp: 1565257031287,
            signature:
              'uqLBTr9Uex8zCpc1UQ1MIDMitb+HUat2Mah4Kw6AVLSGe0gGNJXlih2i5X+0ZwVY0S9zY2NHWi2gFjmhjt/4kxWGMkupqXX5H/qhE2m7hzox6lZJpH98ZEUbouWRfZX2ZhUlCkAX09oRNi7fI7mWL1/o88MaI/y6k6tLr14JTzmlxgdyhw+QRLxRPA6NuvUlRSJpyJ4aGtNH5/wHdKQWL8nUnFYiYmaY8R7IjzNxPfy8UJTUWmeZvMSgND4u8EjADPsz7ZtZyWAPi8kYcAb6M8k0jwLD3vrYCB8XXyO2RQb/FY2TM4zJuI7PzLlvvgOJXbbfVtHx7Evnm5NYoyzgzw==',
            salt: 'DzqqrQ==',
          },
        })
      ).toBeRejected();
    });
  });
});

describe('OTP TOTP auth adatper', () => {
  const headers = {
    'Content-Type': 'application/json',
    'X-Parse-Application-Id': 'test',
    'X-Parse-REST-API-Key': 'rest',
  };
  beforeEach(async () => {
    await reconfigureServer({
      auth: {
        mfa: {
          enabled: true,
          options: ['TOTP'],
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
        },
      },
    });
  });

  it('can enroll', async () => {
    const user = await Parse.User.signUp('username', 'password');
    const OTPAuth = require('otpauth');
    const secret = new OTPAuth.Secret();
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    const token = totp.generate();
    await user.save(
      { authData: { mfa: { secret: secret.base32, token } } },
      { sessionToken: user.getSessionToken() }
    );
    const response = user.get('authDataResponse');
    expect(response.mfa).toBeDefined();
    expect(response.mfa.recovery).toBeDefined();
    expect(response.mfa.recovery.split(',').length).toEqual(2);
    await user.fetch();
    expect(user.get('authData').mfa).toEqual({ status: 'enabled' });
  });

  it('can login with valid token', async () => {
    const user = await Parse.User.signUp('username', 'password');
    const OTPAuth = require('otpauth');
    const secret = new OTPAuth.Secret();
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    const token = totp.generate();
    await user.save(
      { authData: { mfa: { secret: secret.base32, token } } },
      { sessionToken: user.getSessionToken() }
    );
    const response = await request({
      headers,
      method: 'POST',
      url: 'http://localhost:8378/1/login',
      body: JSON.stringify({
        username: 'username',
        password: 'password',
        authData: {
          mfa: {
            token: totp.generate(),
          },
        },
      }),
    }).then(res => res.data);
    expect(response.objectId).toEqual(user.id);
    expect(response.sessionToken).toBeDefined();
    expect(response.authData).toEqual({ mfa: { status: 'enabled' } });
    expect(Object.keys(response).sort()).toEqual(
      [
        'objectId',
        'username',
        'createdAt',
        'updatedAt',
        'authData',
        'ACL',
        'sessionToken',
        'authDataResponse',
      ].sort()
    );
  });

  it('can change OTP with valid token', async () => {
    const user = await Parse.User.signUp('username', 'password');
    const OTPAuth = require('otpauth');
    const secret = new OTPAuth.Secret();
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    const token = totp.generate();
    await user.save(
      { authData: { mfa: { secret: secret.base32, token } } },
      { sessionToken: user.getSessionToken() }
    );

    const new_secret = new OTPAuth.Secret();
    const new_totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: new_secret,
    });
    const new_token = new_totp.generate();
    await user.save(
      {
        authData: { mfa: { secret: new_secret.base32, token: new_token, old: totp.generate() } },
      },
      { sessionToken: user.getSessionToken() }
    );
    await user.fetch({ useMasterKey: true });
    expect(user.get('authData').mfa.secret).toEqual(new_secret.base32);
  });

  it('cannot change OTP with invalid token', async () => {
    const user = await Parse.User.signUp('username', 'password');
    const OTPAuth = require('otpauth');
    const secret = new OTPAuth.Secret();
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    const token = totp.generate();
    await user.save(
      { authData: { mfa: { secret: secret.base32, token } } },
      { sessionToken: user.getSessionToken() }
    );

    const new_secret = new OTPAuth.Secret();
    const new_totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: new_secret,
    });
    const new_token = new_totp.generate();
    await expectAsync(
      user.save(
        {
          authData: { mfa: { secret: new_secret.base32, token: new_token, old: '123' } },
        },
        { sessionToken: user.getSessionToken() }
      )
    ).toBeRejectedWith(new Parse.Error(Parse.Error.OTHER_CAUSE, 'Invalid MFA token'));
    await user.fetch({ useMasterKey: true });
    expect(user.get('authData').mfa.secret).toEqual(secret.base32);
  });

  it('future logins require TOTP token', async () => {
    const user = await Parse.User.signUp('username', 'password');
    const OTPAuth = require('otpauth');
    const secret = new OTPAuth.Secret();
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    const token = totp.generate();
    await user.save(
      { authData: { mfa: { secret: secret.base32, token } } },
      { sessionToken: user.getSessionToken() }
    );
    await expectAsync(Parse.User.logIn('username', 'password')).toBeRejectedWith(
      new Parse.Error(Parse.Error.OTHER_CAUSE, 'Missing additional authData mfa')
    );
  });

  it('future logins reject incorrect TOTP token', async () => {
    const user = await Parse.User.signUp('username', 'password');
    const OTPAuth = require('otpauth');
    const secret = new OTPAuth.Secret();
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    const token = totp.generate();
    await user.save(
      { authData: { mfa: { secret: secret.base32, token } } },
      { sessionToken: user.getSessionToken() }
    );
    await expectAsync(
      request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/login',
        body: JSON.stringify({
          username: 'username',
          password: 'password',
          authData: {
            mfa: {
              token: 'abcd',
            },
          },
        }),
      }).catch(e => {
        throw e.data;
      })
    ).toBeRejectedWith({ code: Parse.Error.SCRIPT_FAILED, error: 'Invalid MFA token' });
  });
});

describe('OTP SMS auth adatper', () => {
  const headers = {
    'Content-Type': 'application/json',
    'X-Parse-Application-Id': 'test',
    'X-Parse-REST-API-Key': 'rest',
  };
  let code;
  let mobile;
  const mfa = {
    enabled: true,
    options: ['SMS'],
    sendSMS(smsCode, number) {
      expect(smsCode).toBeDefined();
      expect(number).toBeDefined();
      expect(smsCode.length).toEqual(6);
      code = smsCode;
      mobile = number;
    },
    digits: 6,
    period: 30,
  };
  beforeEach(async () => {
    code = '';
    mobile = '';
    await reconfigureServer({
      auth: {
        mfa,
      },
    });
  });

  it('can enroll', async () => {
    const user = await Parse.User.signUp('username', 'password');
    const sessionToken = user.getSessionToken();
    const spy = spyOn(mfa, 'sendSMS').and.callThrough();
    await user.save({ authData: { mfa: { mobile: '+11111111111' } } }, { sessionToken });
    await user.fetch({ sessionToken });
    expect(user.get('authData')).toEqual({ mfa: { status: 'disabled' } });
    expect(spy).toHaveBeenCalledWith(code, '+11111111111');
    await user.fetch({ useMasterKey: true });
    const authData = user.get('authData').mfa?.pending;
    expect(authData).toBeDefined();
    expect(authData['+11111111111']).toBeDefined();
    expect(Object.keys(authData['+11111111111'])).toEqual(['token', 'expiry']);

    await user.save({ authData: { mfa: { mobile, token: code } } }, { sessionToken });
    await user.fetch({ sessionToken });
    expect(user.get('authData')).toEqual({ mfa: { status: 'enabled' } });
  });

  it('future logins require SMS code', async () => {
    const user = await Parse.User.signUp('username', 'password');
    const spy = spyOn(mfa, 'sendSMS').and.callThrough();
    await user.save(
      { authData: { mfa: { mobile: '+11111111111' } } },
      { sessionToken: user.getSessionToken() }
    );

    await user.save(
      { authData: { mfa: { mobile, token: code } } },
      { sessionToken: user.getSessionToken() }
    );

    spy.calls.reset();

    await expectAsync(Parse.User.logIn('username', 'password')).toBeRejectedWith(
      new Parse.Error(Parse.Error.OTHER_CAUSE, 'Missing additional authData mfa')
    );
    const res = await request({
      headers,
      method: 'POST',
      url: 'http://localhost:8378/1/login',
      body: JSON.stringify({
        username: 'username',
        password: 'password',
        authData: {
          mfa: {
            token: 'request',
          },
        },
      }),
    }).catch(e => e.data);
    expect(res).toEqual({ code: Parse.Error.SCRIPT_FAILED, error: 'Please enter the token' });
    expect(spy).toHaveBeenCalledWith(code, '+11111111111');
    const response = await request({
      headers,
      method: 'POST',
      url: 'http://localhost:8378/1/login',
      body: JSON.stringify({
        username: 'username',
        password: 'password',
        authData: {
          mfa: {
            token: code,
          },
        },
      }),
    }).then(res => res.data);
    expect(response.objectId).toEqual(user.id);
    expect(response.sessionToken).toBeDefined();
    expect(response.authData).toEqual({ mfa: { status: 'enabled' } });
    expect(Object.keys(response).sort()).toEqual(
      [
        'objectId',
        'username',
        'createdAt',
        'updatedAt',
        'authData',
        'ACL',
        'sessionToken',
        'authDataResponse',
      ].sort()
    );
  });

  it('partially enrolled users can still login', async () => {
    const user = await Parse.User.signUp('username', 'password');
    await user.save({ authData: { mfa: { mobile: '+11111111111' } } });
    const spy = spyOn(mfa, 'sendSMS').and.callThrough();
    await Parse.User.logIn('username', 'password');
    expect(spy).not.toHaveBeenCalled();
  });
});
