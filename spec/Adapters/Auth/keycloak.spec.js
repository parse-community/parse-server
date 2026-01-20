const KeycloakAdapter = require('../../../lib/Adapters/Auth/keycloak').default;

describe('OAuth2Adapter', () => {
  let adapter;

  const validOptions = {
    'auth-server-url': 'https://provider.com/auth',
    realm: 'myrealm',
  };

  beforeEach(() => {
    adapter = new KeycloakAdapter.constructor();
    adapter.validateOptions(validOptions);
  });

  describe('validateAppId', () => {
    it('should validate any app ID successfully', async () => {
      const authData = {};

      await expectAsync(
        adapter.validateAppId(["any-app-id"], authData, validOptions)
      ).toBeResolved();
    });
  });

  describe('validateAuthData', () => {
    it('should validate auth data successfully with id', async () => {
      const authData = { id: 'user-id', access_token: 'validAccessToken' };
      const mockResponse = {
        sub: 'user-id',
      };

      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
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

    it('should validate auth data successfully with id and groups', async () => {
      const authData = { 
        id: 'user-id', 
        access_token: 'validAccessToken', 
        groups: ["group1", "group2"],
      };
      const mockResponse = {
        sub: 'user-id',
        groups: ["group1", "group2"],
      };

      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
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

    it('should validate auth data successfully with id and roles', async () => {
      const authData = { 
        id: 'user-id', 
        access_token: 'validAccessToken', 
        roles: ["role1", "role2"],
      };
      const mockResponse = {
        sub: 'user-id',
        roles: ["role1", "role2"],
      };

      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
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

    it('should validate auth data successfully with id, groups and roles', async () => {
      const authData = { 
        id: 'user-id', 
        access_token: 'validAccessToken', 
        groups: ["group1", "group2"],
        roles: ["role1", "role2"],
      };
      const mockResponse = {
        sub: 'user-id',
        groups: ["group2", "group1"],
        roles: ["role2", "role1"],
      };

      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
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
      const authData = { id: 'user-id', access_token: 'invalidAccessToken' };

      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      await expectAsync(
        adapter.validateAuthData(authData, null, validOptions)
      ).toBeRejectedWith(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Keycloak token validation failed.'));
    });

    it('should throw an error if user ID does not match', async () => {
      const authData = { id: 'user-id', access_token: 'validAccessToken' };
      const mockResponse = {
        sub: 'different-user-id',
      };

      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      await expectAsync(
        adapter.validateAuthData(authData, null, validOptions)
      ).toBeRejectedWithError('Keycloak access token is invalid for this user.');
    });

    it('should throw an error if groups do not match', async () => {
      const authData = { 
        id: 'user-id', 
        access_token: 'validAccessToken', 
        groups: ["group1", "group2"], 
        roles: ["role1", "role2"],
      };
      const mockResponse = {
        sub: 'user-id',
        groups: ["group1", "group2", "group3"],
        roles: ["role1", "role2"],
      };

      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      await expectAsync(
        adapter.validateAuthData(authData, null, validOptions)
      ).toBeRejectedWithError('Keycloak access token is invalid for this user.');
    });

    it('should throw an error if roles do not match', async () => {
      const authData = { 
        id: 'user-id', 
        access_token: 'validAccessToken', 
        groups: ["group1", "group2"], 
        roles: ["role1", "role2"],
      };
      const mockResponse = {
        sub: 'user-id',
        groups: ["group1", "group2"],
        roles: ["role1"],
      };

      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      await expectAsync(
        adapter.validateAuthData(authData, null, validOptions)
      ).toBeRejectedWithError('Keycloak access token is invalid for this user.');
    });
  });

  describe('requestTokenInfo', () => {
    it('should fetch token info successfully', async () => {
      const mockResponse = { sub: 'user-id' };

      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
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

    it('should throw an error if the auth server URL is missing', async () => {
      const options = { ...validOptions, 'auth-server-url': null };

      expect(
        () => adapter.validateOptions(options)
      ).toThrow(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Keycloak host URL is missing.'));
    });
    
    it('should throw an error if the realm is missing', async () => {
      const options = { ...validOptions, realm: null };

      expect(
        () => adapter.validateOptions(options)
      ).toThrow(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Keycloak realm is missing.'));
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
      ).toBeRejectedWithError('Keycloak token validation failed.');
    });
  });

  describe('KeycloakAdapter E2E Tests', () => {
    beforeEach(async () => {
      // Simulate reconfiguring the server with Keycloak auth options
      await reconfigureServer({
        auth: {
          keycloak: {
            'auth-server-url': 'https://provider.com/auth',
            realm: 'myrealm',
            enabled: true
          },
        },
      });
    });

    it('should validate and authenticate user successfully', async () => {
      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({
              sub: 'user123',
            }),
          },
        },
      ]);

      const authData = { access_token: 'validAccessToken', id: 'user123' };
      const user = await Parse.User.logInWith('keycloak', { authData });

      expect(user.id).toBeDefined();
      expect(user.get('authData').keycloak.id).toEqual('user123');
    });

    it('should reject authentication for inactive token', async () => {
      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      const authData = { access_token: 'inactiveToken', id: 'user123' };
      await expectAsync(Parse.User.logInWith('keycloak', { authData })).toBeRejectedWith(
        new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Keycloak token validation failed.')
      );
    });

    it('should reject authentication for mismatched user ID', async () => {
      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({
              sub: 'different-user',
            }),
          },
        },
      ]);

      const authData = { access_token: 'validAccessToken', id: 'user123' };
      await expectAsync(Parse.User.logInWith('keycloak', { authData })).toBeRejectedWith(
        new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Keycloak access token is invalid for this user.')
      );
    });

    it('should reject authentication for mismatched groups', async () => {
      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({
              sub: 'user123',
              groups: ["group1"],
              roles: ["role1", "role2"],
            }),
          },
        },
      ]);

      const authData = { 
        id: 'user123', 
        access_token: 'validAccessToken', 
        groups: ["group1", "group2"],
        roles: ["role1", "role2"],
      };
      await expectAsync(Parse.User.logInWith('keycloak', { authData })).toBeRejectedWith(
        new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Keycloak access token is invalid for this user.')
      );
    });

    it('should reject authentication for mismatched roles', async () => {
      mockFetch([
        {
          url: `${validOptions['auth-server-url']}/realms/${validOptions.realm}/protocol/openid-connect/userinfo`,
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({
              sub: 'user123',
              groups: ["group1", "group2"],
              roles: ["role1", "role2", "role3"],
            }),
          },
        },
      ]);

      const authData = { 
        id: 'user123', 
        access_token: 'validAccessToken', 
        groups: ["group1", "group2"],
        roles: ["role1", "role2"],
      };
      await expectAsync(Parse.User.logInWith('keycloak', { authData })).toBeRejectedWith(
        new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Keycloak access token is invalid for this user.')
      );
    });

    it('should handle error when auth server url is missing', async () => {
      await reconfigureServer({
        auth: {
          keycloak: {
            'auth-server-url': null,
            realm: 'myrealm',
            enabled: true
          },
        },
      });

      const authData = { access_token: 'validAccessToken', id: 'user123' };
      await expectAsync(Parse.User.logInWith('keycloak', { authData })).toBeRejectedWith(
        new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Keycloak host URL is missing.')
      );
    });

    it('should handle error when realm is missing', async () => {
      await reconfigureServer({
        auth: {
          keycloak: {
            'auth-server-url': 'https://provider.com/auth',
            realm: null,
            enabled: true
          },
        },
      });

      const authData = { access_token: 'validAccessToken', id: 'user123' };
      await expectAsync(Parse.User.logInWith('keycloak', { authData })).toBeRejectedWith(
        new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Keycloak realm is missing.')
      );
    });
  });

});
