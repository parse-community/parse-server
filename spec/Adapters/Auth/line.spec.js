const LineAdapter = require('../../../lib/Adapters/Auth/line').default;
const jwt = require('jsonwebtoken');
const authUtils = require('../../../lib/Adapters/Auth/utils');

describe('LineAdapter', function () {
  let adapter;

  const validOptions = {
    clientId: 'validClientId',
    clientSecret: 'validClientSecret',
  };

  // Stub LINE JWKS lookup and JWT verification so auth-flow tests stay deterministic
  // and do not depend on live LINE signing keys.
  function mockEs256IdTokenVerification(claims = {}) {
    const jwtClaims = {
      iss: 'https://access.line.me',
      aud: 'validClientId',
      exp: Date.now() + 1000,
      sub: 'mockUserId',
      ...claims,
    };
    const getHeaderSpy = jasmine.isSpy(authUtils.getHeaderFromToken)
      ? authUtils.getHeaderFromToken
      : spyOn(authUtils, 'getHeaderFromToken');
    const getSigningKeySpy = jasmine.isSpy(authUtils.getSigningKey)
      ? authUtils.getSigningKey
      : spyOn(authUtils, 'getSigningKey');
    const verifySpy = jasmine.isSpy(jwt.verify) ? jwt.verify : spyOn(jwt, 'verify');
    getHeaderSpy.and.returnValue({ kid: '123', alg: 'ES256' });
    getSigningKeySpy.and.resolveTo({ publicKey: 'line_public_key' });
    verifySpy.and.returnValue(jwtClaims);
    return jwtClaims;
  }

  beforeEach(function () {
    adapter = new LineAdapter.constructor();
    adapter.clientId = 'validClientId';
    adapter.clientSecret = 'validClientSecret';
  });

  describe('validateOptions', function () {
    it('should allow secure id token validation with clientId only', function () {
      expect(() => adapter.validateOptions({ clientId: 'validClientId' })).not.toThrow();
      expect(adapter.clientId).toBe('validClientId');
      expect(adapter.clientSecret).toBeUndefined();
    });

    it('should allow insecure-only configuration when explicitly enabled', function () {
      expect(() => adapter.validateOptions({ enableInsecureAuth: true })).not.toThrow();
      expect(adapter.enableInsecureAuth).toBeTrue();
    });

    it('should require clientId when secure auth is configured', function () {
      expect(() => adapter.validateOptions({ clientSecret: 'validClientSecret' })).toThrowError(
        'Line clientId is required.'
      );
    });
  });

  describe('verifyIdToken', function () {
    beforeEach(function () {
      adapter.validateOptions(validOptions);
    });

    it('should throw an error if id_token is missing', async function () {
      await expectAsync(adapter.verifyIdToken({})).toBeRejectedWithError(
        'id token is invalid for this user.'
      );
    });

    it('should not decode an invalid id_token', async function () {
      await expectAsync(adapter.verifyIdToken({ id_token: 'the_token' })).toBeRejectedWithError(
        'provided token does not decode as JWT'
      );
    });

    it('should throw an error if public key used to encode token is not available', async function () {
      spyOn(authUtils, 'getHeaderFromToken').and.returnValue({ kid: '789', alg: 'ES256' });

      await expectAsync(adapter.verifyIdToken({ id_token: 'the_token' })).toBeRejectedWithError(
        'Unable to find matching key for Key ID: 789'
      );
    });

    it('should guard and pass only a valid supported algorithm to jwt.verify', async function () {
      const fakeClaim = mockEs256IdTokenVerification();

      const result = await adapter.verifyIdToken({
        id: 'mockUserId',
        id_token: 'the_token',
      });

      expect(result).toEqual(fakeClaim);
      expect(jwt.verify.calls.first().args[2].algorithms).toEqual(['ES256']);
    });

    it('should verify a valid id_token without an explicit id', async function () {
      const fakeClaim = mockEs256IdTokenVerification({ sub: 'line-subject' });

      const result = await adapter.verifyIdToken({ id_token: 'the_token' });

      expect(result).toEqual(fakeClaim);
    });

    it('should reject a token with an invalid issuer', async function () {
      mockEs256IdTokenVerification({ iss: 'https://invalid.line.me' });

      await expectAsync(
        adapter.verifyIdToken({ id: 'mockUserId', id_token: 'the_token' })
      ).toBeRejectedWithError(
        'id token not issued by correct OpenID provider - expected: https://access.line.me | from: https://invalid.line.me'
      );
    });

    it('should reject a token with a mismatched sub claim', async function () {
      mockEs256IdTokenVerification({ sub: 'another-user' });

      await expectAsync(
        adapter.verifyIdToken({ id: 'mockUserId', id_token: 'the_token' })
      ).toBeRejectedWithError('auth data is invalid for this user.');
    });

    it('should reject a token with a mismatched nonce', async function () {
      mockEs256IdTokenVerification({ nonce: 'server-nonce' });

      await expectAsync(
        adapter.verifyIdToken({
          id_token: 'the_token',
          nonce: 'different-nonce',
        })
      ).toBeRejectedWithError('auth data is invalid for this user.');
    });

    it('should verify an HS256 token when clientSecret is configured', async function () {
      spyOn(authUtils, 'getHeaderFromToken').and.returnValue({ alg: 'HS256' });
      spyOn(jwt, 'verify').and.returnValue({
        iss: 'https://access.line.me',
        aud: 'validClientId',
        exp: Date.now() + 1000,
        sub: 'mockUserId',
      });

      const result = await adapter.verifyIdToken({
        id: 'mockUserId',
        id_token: 'the_token',
      });

      expect(result.sub).toBe('mockUserId');
      expect(jwt.verify.calls.first().args[1]).toBe('validClientSecret');
      expect(jwt.verify.calls.first().args[2].algorithms).toEqual(['HS256']);
    });

    it('should reject an HS256 token when clientSecret is missing', async function () {
      adapter.validateOptions({ clientId: 'validClientId' });
      spyOn(authUtils, 'getHeaderFromToken').and.returnValue({ alg: 'HS256' });

      await expectAsync(adapter.verifyIdToken({ id_token: 'the_token' })).toBeRejectedWithError(
        'Line clientSecret is required to verify HS256 id_token.'
      );
    });
  });

  describe('getAccessTokenFromCode', function () {
    beforeEach(function () {
      adapter.validateOptions(validOptions);
    });

    it('should throw an error if code is missing in authData', async function () {
      const authData = { redirect_uri: 'http://example.com' };

      await expectAsync(adapter.getAccessTokenFromCode(authData)).toBeRejectedWithError(
        'Line auth is invalid for this user.'
      );
    });

    it('should throw an error if clientSecret is missing in server-side auth flows', async function () {
      adapter.validateOptions({ clientId: 'validClientId' });

      await expectAsync(
        adapter.getAccessTokenFromCode({ code: 'validCode', redirect_uri: 'http://example.com' })
      ).toBeRejectedWithError('Line clientSecret is required to exchange code for token.');
    });

    it('should fetch an access token successfully', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'mockAccessToken',
              }),
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        redirect_uri: 'http://example.com',
      };

      const token = await adapter.getAccessTokenFromCode(authData);

      expect(token).toBe('mockAccessToken');
    });

    it('should throw an error if response is not ok', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: false,
            statusText: 'Bad Request',
          },
        },
      ]);

      const authData = {
        code: 'invalidCode',
        redirect_uri: 'http://example.com',
      };

      await expectAsync(adapter.getAccessTokenFromCode(authData)).toBeRejectedWithError(
        'Failed to exchange code for token: Bad Request'
      );
    });

    it('should throw an error if response contains an error object', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                error: 'invalid_grant',
                error_description: 'Code is invalid',
              }),
          },
        },
      ]);

      const authData = {
        code: 'invalidCode',
        redirect_uri: 'http://example.com',
      };

      await expectAsync(adapter.getAccessTokenFromCode(authData)).toBeRejectedWithError(
        'Code is invalid'
      );
    });
  });

  describe('getUserFromAccessToken', function () {
    beforeEach(function () {
      adapter.validateOptions(validOptions);
    });

    it('should fetch user data successfully and normalize the user id', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/v2/profile',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                userId: 'mockUserId',
                displayName: 'mockDisplayName',
              }),
          },
        },
      ]);

      const accessToken = 'validAccessToken';
      const user = await adapter.getUserFromAccessToken(accessToken);

      expect(user).toEqual({
        userId: 'mockUserId',
        displayName: 'mockDisplayName',
        id: 'mockUserId',
      });
    });

    it('should throw an error if response is not ok', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/v2/profile',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      const accessToken = 'invalidAccessToken';
      
      await expectAsync(adapter.getUserFromAccessToken(accessToken)).toBeRejectedWithError(
        'Failed to fetch Line user: Unauthorized'
      );
    });

    it('should throw an error if user data is invalid', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/v2/profile',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({}),
          },
        },
      ]);

      const accessToken = 'validAccessToken';

      await expectAsync(adapter.getUserFromAccessToken(accessToken)).toBeRejectedWithError(
        'Invalid Line user data received.'
      );
    });
  });

  describe('beforeFind', function () {
    beforeEach(function () {
      adapter.validateOptions(validOptions);
    });

    it('should populate authData.id from a verified id_token', async function () {
      spyOn(adapter, 'verifyIdToken').and.resolveTo({ sub: 'mockUserId' });
      const authData = {
        id_token: 'the_token',
        nonce: 'nonce',
      };

      await adapter.beforeFind(authData);

      expect(authData).toEqual({ id: 'mockUserId' });
    });

    it('should block insecure auth unless explicitly enabled', async function () {
      const authData = {
        id: 'mockUserId',
        access_token: 'validAccessToken',
      };

      await expectAsync(adapter.beforeFind(authData)).toBeRejectedWithError(
        'Line code is required.'
      );
    });
  });

  describe('LineAdapter E2E Test', function () {
    beforeEach(async function () {
      await reconfigureServer({
        auth: {
          line: {
            clientId: 'validClientId',
            clientSecret: 'validClientSecret',
          },
        },
      });
    });

    it('should log in user successfully with valid code', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'mockAccessToken123',
              }),
          },
        },
        {
          url: 'https://api.line.me/v2/profile',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                userId: 'mockUserId',
                displayName: 'mockDisplayName',
              }),
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        redirect_uri: 'http://example.com',
      };

      const user = await Parse.User.logInWith('line', { authData });

      expect(user.id).toBeDefined();
    });

    it('should handle error when token exchange fails', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: false,
            statusText: 'Invalid code',
          },
        },
      ]);

      const authData = {
        code: 'invalidCode',
        redirect_uri: 'http://example.com',
      };

      await expectAsync(Parse.User.logInWith('line', { authData })).toBeRejectedWithError(
        'Failed to exchange code for token: Invalid code'
      );
    });

    it('should handle error when user data fetch fails', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'mockAccessToken123',
              }),
          },
        },
        {
          url: 'https://api.line.me/v2/profile',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        redirect_uri: 'http://example.com',
      };

      await expectAsync(Parse.User.logInWith('line', { authData })).toBeRejectedWithError(
        'Failed to fetch Line user: Unauthorized'
      );
    });

    it('should handle error when user data is invalid', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'mockAccessToken123',
              }),
          },
        },
        {
          url: 'https://api.line.me/v2/profile',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({}),
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        redirect_uri: 'http://example.com',
      };

      await expectAsync(Parse.User.logInWith('line', { authData })).toBeRejectedWithError(
        'Invalid Line user data received.'
      );
    });

    it('should handle error when no code is provided', async function () {
      mockFetch();

      const authData = {
        redirect_uri: 'http://example.com',
      };

      await expectAsync(Parse.User.logInWith('line', { authData })).toBeRejectedWithError(
        'Line code is required.'
      );
    });
  });

  describe('LineAdapter E2E id_token Test', function () {
    beforeEach(async function () {
      await reconfigureServer({
        auth: {
          line: {
            clientId: 'validClientId',
          },
        },
      });
    });

    it('should log in user successfully with a valid id_token', async function () {
      mockEs256IdTokenVerification();

      const authData = {
        id_token: 'the_token',
      };

      const user = await Parse.User.logInWith('line', { authData });
      await user.fetch({ useMasterKey: true });

      expect(user.id).toBeDefined();
      expect(user.get('authData').line.id).toBe('mockUserId');
    });

    it('should link line auth to an existing logged-in user with an id_token', async function () {
      mockEs256IdTokenVerification({ sub: 'link-user-id' });
      const user = await Parse.User.signUp('line-link-user', 'password');

      await user.save(
        {
          authData: {
            line: {
              id_token: 'the_token',
            },
          },
        },
        { sessionToken: user.getSessionToken() }
      );

      await user.fetch({ useMasterKey: true });
      expect(user.get('authData').line.id).toBe('link-user-id');
    });

    it('should allow updating existing LINE auth with id_token', async function () {
      mockEs256IdTokenVerification({ sub: 'existing-line-user' });
      const user = await Parse.User.logInWith('line', {
        authData: {
          id_token: 'first_token',
        },
      });

      mockEs256IdTokenVerification({ sub: 'existing-line-user' });
      await user.save(
        {
          authData: {
            line: {
              id_token: 'second_token',
            },
          },
        },
        { sessionToken: user.getSessionToken() }
      );

      await user.fetch({ useMasterKey: true });
      expect(user.get('authData').line.id).toBe('existing-line-user');
    });

    it('should reject insecure authData when insecure auth is disabled', async function () {
      await expectAsync(
        Parse.User.logInWith('line', {
          authData: {
            id: 'mockUserId',
            access_token: 'validAccessToken',
          },
        })
      ).toBeRejectedWithError('Line code is required.');
    });

    it('should handle invalid id_token claims during login', async function () {
      mockEs256IdTokenVerification({ iss: 'https://invalid.line.me' });

      await expectAsync(
        Parse.User.logInWith('line', {
          authData: {
            id_token: 'the_token',
          },
        })
      ).toBeRejectedWithError(
        'id token not issued by correct OpenID provider - expected: https://access.line.me | from: https://invalid.line.me'
      );
    });
  });

  describe('LineAdapter E2E legacy access token Test', function () {
    beforeEach(async function () {
      await reconfigureServer({
        auth: {
          line: {
            enableInsecureAuth: true,
          },
        },
      });
    });

    it('should allow insecure auth only when explicitly enabled', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/v2/profile',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                userId: 'mockUserId',
                displayName: 'mockDisplayName',
              }),
          },
        },
      ]);

      const user = await Parse.User.logInWith('line', {
        authData: {
          id: 'mockUserId',
          access_token: 'validAccessToken',
        },
      });

      expect(user.id).toBeDefined();
      expect(user.get('authData').line.id).toBe('mockUserId');
    });
  });
});
