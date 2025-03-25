const SpotifyAdapter = require('../../../lib/Adapters/Auth/spotify').default;

describe('SpotifyAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new SpotifyAdapter.constructor();
  });

  describe('getUserFromAccessToken', () => {
    it('should fetch user data successfully', async () => {
      const mockResponse = {
        id: 'spotifyUser123',
      };

      mockFetch([
        {
          url: 'https://api.spotify.com/v1/me',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      const result = await adapter.getUserFromAccessToken('validAccessToken');

      expect(result).toEqual({ id: 'spotifyUser123' });
    });

    it('should throw an error if the API request fails', async () => {
      mockFetch([
        {
          url: 'https://api.spotify.com/v1/me',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      await expectAsync(adapter.getUserFromAccessToken('invalidAccessToken')).toBeRejectedWithError(
        'Spotify API request failed.'
      );
    });
  });

  describe('getAccessTokenFromCode', () => {
    it('should fetch access token successfully', async () => {
      const mockResponse = {
        access_token: 'validAccessToken',
        expires_in: 3600,
        refresh_token: 'refreshToken',
      };

      mockFetch([
        {
          url: 'https://accounts.spotify.com/api/token',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        redirect_uri: 'https://your-redirect-uri.com/callback',
        code_verifier: 'validCodeVerifier',
      };

      const result = await adapter.getAccessTokenFromCode(authData);

      expect(result).toEqual(mockResponse);
    });

    it('should throw an error if authData is missing required fields', async () => {
      const authData = {
        redirect_uri: 'https://your-redirect-uri.com/callback',
      };

      await expectAsync(adapter.getAccessTokenFromCode(authData)).toBeRejectedWithError(
        'Spotify auth configuration authData.code and/or authData.redirect_uri and/or authData.code_verifier.'
      );
    });

    it('should throw an error if the API request fails', async () => {
      mockFetch([
        {
          url: 'https://accounts.spotify.com/api/token',
          method: 'POST',
          response: {
            ok: false,
            statusText: 'Bad Request',
          },
        },
      ]);

      const authData = {
        code: 'invalidCode',
        redirect_uri: 'https://your-redirect-uri.com/callback',
        code_verifier: 'invalidCodeVerifier',
      };

      await expectAsync(adapter.getAccessTokenFromCode(authData)).toBeRejectedWithError(
        'Spotify API request failed.'
      );
    });
  });
});
