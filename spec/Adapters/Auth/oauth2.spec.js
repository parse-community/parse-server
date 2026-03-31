const OAuth2Adapter = require('../../../lib/Adapters/Auth/oauth2').default;

describe('OAuth2Adapter', () => {
  let adapter;

  const validOptions = {
    tokenIntrospectionEndpointUrl: 'https://provider.com/introspect',
    useridField: 'sub',
    appidField: 'aud',
    appIds: ['valid-app-id'],
    authorizationHeader: 'Bearer validAuthToken',
  };

  beforeEach(() => {
    adapter = new OAuth2Adapter.constructor();
    adapter.validateOptions(validOptions);
  });

  describe('validateAppId', () => {
    it('should validate app ID successfully', async () => {
      const authData = { access_token: 'validAccessToken' };
      const mockResponse = {
        [validOptions.appidField]: 'valid-app-id',
      };

      mockFetch([
        {
          url: validOptions.tokenIntrospectionEndpointUrl,
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      await expectAsync(
        adapter.validateAppId(validOptions.appIds, authData, validOptions)
      ).toBeResolved();
    });

    it('should throw an error if app ID is invalid', async () => {
      const authData = { access_token: 'validAccessToken' };
      const mockResponse = {
        [validOptions.appidField]: 'invalid-app-id',
      };

      mockFetch([
        {
          url: validOptions.tokenIntrospectionEndpointUrl,
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      await expectAsync(
        adapter.validateAppId(validOptions.appIds, authData, validOptions)
      ).toBeRejectedWithError('OAuth2: Invalid app ID.');
    });
  });

  describe('validateAuthData', () => {
    it('should validate auth data successfully', async () => {
      const authData = { id: 'user-id', access_token: 'validAccessToken' };
      const mockResponse = {
        active: true,
        [validOptions.useridField]: 'user-id',
      };

      mockFetch([
        {
          url: validOptions.tokenIntrospectionEndpointUrl,
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      await expectAsync(
        adapter.validateAuthData(authData, null, validOptions)
      ).toBeResolvedTo({});
    });

    it('should throw an error if the token is inactive', async () => {
      const authData = { id: 'user-id', access_token: 'validAccessToken' };
      const mockResponse = { active: false };

      mockFetch([
        {
          url: validOptions.tokenIntrospectionEndpointUrl,
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      await expectAsync(
        adapter.validateAuthData(authData, null, validOptions)
      ).toBeRejectedWith(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 access token is invalid for this user.'));
    });

    it('should throw an error if user ID does not match', async () => {
      const authData = { id: 'user-id', access_token: 'validAccessToken' };
      const mockResponse = {
        active: true,
        [validOptions.useridField]: 'different-user-id',
      };

      mockFetch([
        {
          url: validOptions.tokenIntrospectionEndpointUrl,
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      await expectAsync(
        adapter.validateAuthData(authData, null, validOptions)
      ).toBeRejectedWithError('OAuth2 access token is invalid for this user.');
    });

    it('should default useridField to sub and reject mismatched user ID', async () => {
      const adapterNoUseridField = new OAuth2Adapter.constructor();
      adapterNoUseridField.validateOptions({
        tokenIntrospectionEndpointUrl: 'https://provider.example.com/introspect',
      });

      const authData = { id: 'victim-user-id', access_token: 'attackerToken' };
      const mockResponse = {
        active: true,
        sub: 'attacker-user-id',
      };

      mockFetch([
        {
          url: 'https://provider.example.com/introspect',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      await expectAsync(
        adapterNoUseridField.validateAuthData(authData, null, {})
      ).toBeRejectedWithError('OAuth2 access token is invalid for this user.');
    });

    it('should default useridField to sub and accept matching user ID', async () => {
      const adapterNoUseridField = new OAuth2Adapter.constructor();
      adapterNoUseridField.validateOptions({
        tokenIntrospectionEndpointUrl: 'https://provider.example.com/introspect',
      });

      const authData = { id: 'user-id', access_token: 'validAccessToken' };
      const mockResponse = {
        active: true,
        sub: 'user-id',
      };

      mockFetch([
        {
          url: 'https://provider.example.com/introspect',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      await expectAsync(
        adapterNoUseridField.validateAuthData(authData, null, {})
      ).toBeResolvedTo({});
    });
  });

  describe('requestTokenInfo', () => {
    it('should fetch token info successfully', async () => {
      const mockResponse = { active: true };

      mockFetch([
        {
          url: validOptions.tokenIntrospectionEndpointUrl,
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      const result = await adapter.requestTokenInfo(
        'validAccessToken',
        validOptions
      );

      expect(result).toEqual(mockResponse);
    });

    it('should throw an error if the introspection endpoint URL is missing', async () => {
      const options = { ...validOptions, tokenIntrospectionEndpointUrl: null };

      expect(
        () => adapter.validateOptions(options)
      ).toThrow(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 token introspection endpoint URL is missing.'));
    });

    it('should throw an error if the response is not ok', async () => {
      mockFetch([
        {
          url: validOptions.tokenIntrospectionEndpointUrl,
          method: 'POST',
          response: {
            ok: false,
            statusText: 'Bad Request',
          },
        },
      ]);

      await expectAsync(
        adapter.requestTokenInfo('invalidAccessToken')
      ).toBeRejectedWithError('OAuth2 token introspection request failed.');
    });
  });

  describe('OAuth2Adapter E2E Tests', () => {
    beforeEach(async () => {
      // Simulate reconfiguring the server with OAuth2 auth options
      await reconfigureServer({
        auth: {
          mockOauth: {
            tokenIntrospectionEndpointUrl: 'https://provider.com/introspect',
            useridField: 'sub',
            appidField: 'aud',
            appIds: ['valid-app-id'],
            authorizationHeader: 'Bearer validAuthToken',
            oauth2: true
          },
        },
      });
    });

    it('should validate and authenticate user successfully', async () => {
      mockFetch([
        {
          url: 'https://provider.com/introspect',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({
              active: true,
              sub: 'user123',
              aud: 'valid-app-id',
            }),
          },
        },
      ]);

      const authData = { access_token: 'validAccessToken', id: 'user123' };
      const user = await Parse.User.logInWith('mockOauth', { authData });

      expect(user.id).toBeDefined();
      expect(user.get('authData').mockOauth.id).toEqual('user123');
    });

    it('should reject authentication for inactive token', async () => {
      mockFetch([
        {
          url: 'https://provider.com/introspect',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({ active: false, aud: ['valid-app-id'] }),
          },
        },
      ]);

      const authData = { access_token: 'inactiveToken', id: 'user123' };
      await expectAsync(Parse.User.logInWith('mockOauth', { authData })).toBeRejectedWith(
        new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 access token is invalid for this user.')
      );
    });

    it('should reject authentication for mismatched user ID', async () => {
      mockFetch([
        {
          url: 'https://provider.com/introspect',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({
              active: true,
              sub: 'different-user',
              aud: 'valid-app-id',
            }),
          },
        },
      ]);

      const authData = { access_token: 'validAccessToken', id: 'user123' };
      await expectAsync(Parse.User.logInWith('mockOauth', { authData })).toBeRejectedWith(
        new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 access token is invalid for this user.')
      );
    });

    it('should reject authentication for invalid app ID', async () => {
      mockFetch([
        {
          url: 'https://provider.com/introspect',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({
              active: true,
              sub: 'user123',
              aud: 'invalid-app-id',
            }),
          },
        },
      ]);

      const authData = { access_token: 'validAccessToken', id: 'user123' };
      await expectAsync(Parse.User.logInWith('mockOauth', { authData })).toBeRejectedWithError(
        'OAuth2: Invalid app ID.'
      );
    });

    it('should send the correct access token to the introspection endpoint during app ID validation', async () => {
      const capturedTokens = [];
      const originalFetch = global.fetch;
      try {
        global.fetch = async (url, options) => {
          if (typeof url === 'string' && url === 'https://provider.com/introspect') {
            const body = options?.body?.toString() || '';
            const token = new URLSearchParams(body).get('token');
            capturedTokens.push(token);
            return {
              ok: true,
              json: () => Promise.resolve({
                active: true,
                sub: 'user123',
                aud: 'valid-app-id',
              }),
            };
          }
          return originalFetch(url, options);
        };

        const authData = { access_token: 'myRealAccessToken', id: 'user123' };
        const user = await Parse.User.logInWith('mockOauth', { authData });
        expect(user.id).toBeDefined();

        // With appidField configured, validateAppId and validateAuthData both call requestTokenInfo.
        // Both should receive the actual access token, not 'undefined' from argument mismatch.
        expect(capturedTokens.length).toBeGreaterThanOrEqual(2);
        for (const token of capturedTokens) {
          expect(token).toBe('myRealAccessToken');
        }
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should reject account takeover when useridField is omitted and attacker uses their own token with victim ID', async () => {
      await reconfigureServer({
        auth: {
          mockOauth: {
            tokenIntrospectionEndpointUrl: 'https://provider.example.com/introspect',
            authorizationHeader: 'Bearer validAuthToken',
            oauth2: true,
          },
        },
      });

      // Victim signs up with their own valid token
      mockFetch([
        {
          url: 'https://provider.example.com/introspect',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({
              active: true,
              sub: 'victim-sub-id',
            }),
          },
        },
      ]);

      const victimAuthData = { access_token: 'victimToken', id: 'victim-sub-id' };
      const victim = await Parse.User.logInWith('mockOauth', { authData: victimAuthData });
      expect(victim.id).toBeDefined();

      // Attacker tries to log in with their own valid token but claims victim's ID
      mockFetch([
        {
          url: 'https://provider.example.com/introspect',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({
              active: true,
              sub: 'attacker-sub-id',
            }),
          },
        },
      ]);

      const attackerAuthData = { access_token: 'attackerToken', id: 'victim-sub-id' };
      await expectAsync(Parse.User.logInWith('mockOauth', { authData: attackerAuthData })).toBeRejectedWith(
        new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 access token is invalid for this user.')
      );
    });

    it('should handle error when token introspection endpoint is missing', async () => {
      await reconfigureServer({
        auth: {
          mockOauth: {
            tokenIntrospectionEndpointUrl: null,
            useridField: 'sub',
            appidField: 'aud',
            appIds: ['valid-app-id'],
            authorizationHeader: 'Bearer validAuthToken',
            oauth2: true
          },
        },
      });

      const authData = { access_token: 'validAccessToken', id: 'user123' };
      await expectAsync(Parse.User.logInWith('mockOauth', { authData })).toBeRejectedWith(
        new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 token introspection endpoint URL is missing.')
      );
    });
  });

});
