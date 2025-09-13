const TwitterAuthAdapter = require('../../../lib/Adapters/Auth/twitter').default;

describe('TwitterAuthAdapter', function () {
  let adapter;
  const validOptions = {
    consumer_key: 'validConsumerKey',
    consumer_secret: 'validConsumerSecret',
  };

  beforeEach(function () {
    adapter = new TwitterAuthAdapter.constructor();
  });

  describe('Test configuration errors', function () {
    it('should throw an error when options are missing', function () {
      expect(() => adapter.validateOptions()).toThrowError('Twitter auth options are required.');
    });

    it('should throw an error when consumer_key and consumer_secret are missing for secure auth', function () {
      const options = { enableInsecureAuth: false };
      expect(() => adapter.validateOptions(options)).toThrowError(
        'Consumer key and secret are required for secure Twitter auth.'
      );
    });

    it('should not throw an error when valid options are provided', function () {
      expect(() => adapter.validateOptions(validOptions)).not.toThrow();
    });
  });

  describe('Validate Insecure Auth', function () {
    it('should throw an error if oauth_token or oauth_token_secret are missing', async function () {
      const authData = { oauth_token: 'validToken' }; // Missing oauth_token_secret
      await expectAsync(adapter.validateInsecureAuth(authData, validOptions)).toBeRejectedWithError(
        'Twitter insecure auth requires oauth_token and oauth_token_secret.'
      );
    });

    it('should validate insecure auth successfully when data matches', async function () {
      spyOn(adapter, 'request').and.returnValue(
        Promise.resolve({
          json: () => Promise.resolve({ id: 'validUserId' }),
        })
      );

      const authData = {
        id: 'validUserId',
        oauth_token: 'validToken',
        oauth_token_secret: 'validSecret',
      };
      await expectAsync(adapter.validateInsecureAuth(authData, validOptions)).toBeResolved();
    });

    it('should throw an error when user ID does not match', async function () {
      spyOn(adapter, 'request').and.returnValue(
        Promise.resolve({
          json: () => Promise.resolve({ id: 'invalidUserId' }),
        })
      );

      const authData = {
        id: 'validUserId',
        oauth_token: 'validToken',
        oauth_token_secret: 'validSecret',
      };
      await expectAsync(adapter.validateInsecureAuth(authData, validOptions)).toBeRejectedWithError(
        'Twitter auth is invalid for this user.'
      );
    });
  });

  describe('End-to-End Tests', function () {
    beforeEach(async function () {
      await reconfigureServer({
        auth: {
          twitter: validOptions,
        }
      })
    });

    it('should authenticate user successfully using validateAuthData', async function () {
      spyOn(adapter, 'exchangeAccessToken').and.returnValue(
        Promise.resolve({ oauth_token: 'validToken', user_id: 'validUserId' })
      );

      const authData = {
        oauth_token: 'validToken',
        oauth_verifier: 'validVerifier',
      };
      await expectAsync(adapter.validateAuthData(authData, validOptions)).toBeResolved();
      expect(authData.id).toBe('validUserId');
      expect(authData.auth_token).toBe('validToken');
    });

    it('should handle multiple configurations and validate successfully', async function () {
      const authData = {
        consumer_key: 'validConsumerKey',
        oauth_token: 'validToken',
        oauth_token_secret: 'validSecret',
      };

      const optionsArray = [
        { consumer_key: 'invalidKey', consumer_secret: 'invalidSecret' },
        validOptions,
      ];

      const selectedOption = adapter.handleMultipleConfigurations(authData, optionsArray);
      expect(selectedOption).toEqual(validOptions);
    });

    it('should throw an error when no matching configuration is found', function () {
      const authData = { consumer_key: 'missingKey' };
      const optionsArray = [validOptions];

      expect(() => adapter.handleMultipleConfigurations(authData, optionsArray)).toThrowError(
        'Twitter auth is invalid for this user.'
      );
    });
  });
});
