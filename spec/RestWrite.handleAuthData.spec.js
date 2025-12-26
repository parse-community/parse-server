describe('RestWrite.handleAuthData', () => {
  const MOCK_USER_ID = 'mockUserId';
  const MOCK_ACCESS_TOKEN = 'mockAccessToken123';

  const createMockUser = () => ({
    id: MOCK_USER_ID,
    code: 'C1',
  });

  const mockGooglePlayGamesAPI = () => {
    mockFetch([
      {
        url: 'https://oauth2.googleapis.com/token',
        method: 'POST',
        response: {
          ok: true,
          json: () => Promise.resolve({ access_token: MOCK_ACCESS_TOKEN }),
        },
      },
      {
        url: `https://www.googleapis.com/games/v1/players/${MOCK_USER_ID}`,
        method: 'GET',
        response: {
          ok: true,
          json: () => Promise.resolve({ playerId: MOCK_USER_ID }),
        },
      },
    ]);
  };

  const setupAuthConfig = () => {
    return reconfigureServer({
      auth: {
        gpgames: {
          clientId: 'validClientId',
          clientSecret: 'validClientSecret',
        },
        instagram: {
          clientId: 'validClientId',
          clientSecret: 'validClientSecret',
          redirectUri: 'https://example.com/callback',
        },
      },
    });
  };

  beforeEach(async () => {
    await setupAuthConfig();
  });

  it('should unlink provider via null', async () => {
    mockGooglePlayGamesAPI();

    const authData = createMockUser();
    const user = await Parse.User.logInWith('gpgames', { authData });
    const sessionToken = user.getSessionToken();

    await user.fetch({ sessionToken });
    const currentAuthData = user.get('authData');
    expect(currentAuthData).toBeDefined();

    // Add another provider to ensure gpgames removal doesn't delete all authData
    mockFetch([
      {
        url: 'https://api.instagram.com/oauth/access_token',
        method: 'POST',
        response: {
          ok: true,
          json: () => Promise.resolve({ access_token: 'ig_token' }),
        },
      },
      {
        url: 'https://graph.instagram.com/me?fields=id&access_token=ig_token',
        method: 'GET',
        response: {
          ok: true,
          json: () => Promise.resolve({ id: 'I1' }),
        },
      },
    ]);

    user.set('authData', {
      ...currentAuthData,
      instagram: { id: 'I1', code: 'IC1' },
    });
    await user.save(null, { sessionToken });

    await user.fetch({ sessionToken });
    const authDataWithInstagram = user.get('authData');
    expect(authDataWithInstagram).toBeDefined();
    expect(authDataWithInstagram.gpgames).toBeDefined();
    expect(authDataWithInstagram.instagram).toBeDefined();

    // Now unlink gpgames
    user.set('authData', {
      ...authDataWithInstagram,
      gpgames: null,
    });
    await user.save(null, { sessionToken });

    const updatedUser = await new Parse.Query(Parse.User).get(user.id, { useMasterKey: true });
    const finalAuthData = updatedUser.get('authData');

    expect(finalAuthData).toBeDefined();
    expect(finalAuthData.gpgames).toBeUndefined();
    expect(finalAuthData.instagram).toBeDefined();
    expect(finalAuthData.instagram.id).toBe('I1');
  });
});
