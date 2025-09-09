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
        }
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
    const currentAuthData = user.get('authData') || {};

    user.set('authData', {
      ...currentAuthData,
      gpgames: null,
    });
    await user.save(null, { sessionToken });

    const updatedUser = await new Parse.Query(Parse.User).get(user.id, { useMasterKey: true });
    const finalAuthData = updatedUser.get('authData') || {};

    expect(finalAuthData.gpgames).toBeUndefined();
  });
});
