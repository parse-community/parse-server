const BaseAuthCodeAdapter = require('../../../lib/Adapters/Auth/BaseCodeAuthAdapter').default;

describe('BaseAuthCodeAdapter', function () {
  let adapter;
  const adapterName = 'TestAdapter';
  const validOptions = {
    clientId: 'validClientId',
    clientSecret: 'validClientSecret',
  };

  class TestAuthCodeAdapter extends BaseAuthCodeAdapter {
    async getUserFromAccessToken(accessToken) {
      if (accessToken === 'validAccessToken') {
        return { id: 'validUserId' };
      }
      throw new Error('Invalid access token');
    }

    async getAccessTokenFromCode(authData) {
      if (authData.code === 'validCode') {
        return 'validAccessToken';
      }
      throw new Error('Invalid code');
    }
  }

  beforeEach(function () {
    adapter = new TestAuthCodeAdapter(adapterName);
  });

  describe('validateOptions', function () {
    it('should throw error if options are missing', function () {
      expect(() => adapter.validateOptions(null)).toThrowError(`${adapterName} options are required.`);
    });

    it('should throw error if clientId is missing in secure mode', function () {
      expect(() =>
        adapter.validateOptions({ clientSecret: 'validClientSecret' })
      ).toThrowError(`${adapterName} clientId is required.`);
    });

    it('should throw error if clientSecret is missing in secure mode', function () {
      expect(() =>
        adapter.validateOptions({ clientId: 'validClientId' })
      ).toThrowError(`${adapterName} clientSecret is required.`);
    });

    it('should not throw error for valid options', function () {
      expect(() => adapter.validateOptions(validOptions)).not.toThrow();
      expect(adapter.clientId).toBe('validClientId');
      expect(adapter.clientSecret).toBe('validClientSecret');
      expect(adapter.enableInsecureAuth).toBeUndefined();
    });

    it('should allow insecure mode without clientId or clientSecret', function () {
      const options = { enableInsecureAuth: true };
      expect(() => adapter.validateOptions(options)).not.toThrow();
      expect(adapter.enableInsecureAuth).toBe(true);
    });
  });

  describe('beforeFind', function () {
    it('should throw error if code is missing in secure mode', async function () {
      adapter.validateOptions(validOptions);
      const authData = { access_token: 'validAccessToken' };

      await expectAsync(adapter.beforeFind(authData)).toBeRejectedWithError(
        `${adapterName} code is required.`
      );
    });

    it('should throw error if access token is missing in insecure mode', async function () {
      adapter.validateOptions({ enableInsecureAuth: true });
      const authData = {};

      await expectAsync(adapter.beforeFind(authData)).toBeRejectedWithError(
        `${adapterName} auth is invalid for this user.`
      );
    });

    it('should throw error if user ID does not match in insecure mode', async function () {
      adapter.validateOptions({ enableInsecureAuth: true });
      const authData = { id: 'invalidUserId', access_token: 'validAccessToken' };

      await expectAsync(adapter.beforeFind(authData)).toBeRejectedWithError(
        `${adapterName} auth is invalid for this user.`
      );
    });

    it('should process valid secure payload and update authData', async function () {
      adapter.validateOptions(validOptions);
      const authData = { code: 'validCode' };

      await adapter.beforeFind(authData);

      expect(authData.access_token).toBe('validAccessToken');
      expect(authData.id).toBe('validUserId');
      expect(authData.code).toBeUndefined();
    });

    it('should process valid insecure payload', async function () {
      adapter.validateOptions({ enableInsecureAuth: true });
      const authData = { id: 'validUserId', access_token: 'validAccessToken' };

      await expectAsync(adapter.beforeFind(authData)).toBeResolved();
    });
  });

  describe('getUserFromAccessToken', function () {
    it('should throw error if not implemented in base class', async function () {
      const baseAdapter = new BaseAuthCodeAdapter(adapterName);

      await expectAsync(baseAdapter.getUserFromAccessToken('test')).toBeRejectedWithError(
        'getUserFromAccessToken is not implemented'
      );
    });

    it('should return valid user for valid access token', async function () {
      const user = await adapter.getUserFromAccessToken('validAccessToken', {});
      expect(user).toEqual({ id: 'validUserId' });
    });

    it('should throw error for invalid access token', async function () {
      await expectAsync(adapter.getUserFromAccessToken('invalidAccessToken', {})).toBeRejectedWithError(
        'Invalid access token'
      );
    });
  });

  describe('getAccessTokenFromCode', function () {
    it('should throw error if not implemented in base class', async function () {
      const baseAdapter = new BaseAuthCodeAdapter(adapterName);

      await expectAsync(baseAdapter.getAccessTokenFromCode({ code: 'test' })).toBeRejectedWithError(
        'getAccessTokenFromCode is not implemented'
      );
    });

    it('should return valid access token for valid code', async function () {
      const accessToken = await adapter.getAccessTokenFromCode({ code: 'validCode' });
      expect(accessToken).toBe('validAccessToken');
    });

    it('should throw error for invalid code', async function () {
      await expectAsync(adapter.getAccessTokenFromCode({ code: 'invalidCode' })).toBeRejectedWithError(
        'Invalid code'
      );
    });
  });

  describe('validateLogin', function () {
    it('should return user id from authData', function () {
      const authData = { id: 'validUserId' };
      const result = adapter.validateLogin(authData);
      expect(result).toEqual({ id: 'validUserId' });
    });
  });

  describe('validateSetUp', function () {
    it('should return user id from authData', function () {
      const authData = { id: 'validUserId' };
      const result = adapter.validateSetUp(authData);
      expect(result).toEqual({ id: 'validUserId' });
    });
  });

  describe('afterFind', function () {
    it('should return user id from authData', function () {
      const authData = { id: 'validUserId' };
      const result = adapter.afterFind(authData);
      expect(result).toEqual({ id: 'validUserId' });
    });
  });

  describe('validateUpdate', function () {
    it('should return user id from authData', function () {
      const authData = { id: 'validUserId' };
      const result = adapter.validateUpdate(authData);
      expect(result).toEqual({ id: 'validUserId' });
    });
  });
});
