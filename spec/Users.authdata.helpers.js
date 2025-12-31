/**
 * Helper functions and constants for authData tests
 * DRY principle: avoid code duplication across test files
 */

// ============================================
// Constants
// ============================================

const MOCK_USER_ID = 'mockUserId';
const MOCK_USER_ID_2 = 'mockUserId2';
const MOCK_ACCESS_TOKEN = 'mockAccessToken123';
const MOCK_ACCESS_TOKEN_2 = 'mockAccessToken456';

const VALID_CLIENT_ID = 'validClientId';
const VALID_CLIENT_SECRET = 'validClientSecret';

const TEST_USERNAME = 'test';
const TEST_PASSWORD = 'password123';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_PLAYER_URL = (userId) => `https://www.googleapis.com/games/v1/players/${userId}`;
const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const IG_ME_URL = (accessToken) =>
  `https://graph.instagram.com/me?fields=id&access_token=${accessToken}`;

// ============================================
// Auth Configuration Helpers
// ============================================

/**
 * Setup auth configuration with gpgames, instagram, and other providers
 * @param {Object} options - Additional configuration options
 * @param {boolean} options.includeInstagram - Include instagram provider (default: true)
 * @param {boolean} options.includeOther - Include other provider (default: true)
 * @param {Object} options.gpgamesConfig - Additional gpgames config (e.g., enableInsecureAuth)
 * @returns {Promise} Promise that resolves when server is reconfigured
 */
function setupAuthConfig(options = {}) {
  const {
    includeInstagram = true,
    includeOther = true,
    gpgamesConfig = {},
  } = options;

  const auth = {
    gpgames: {
      clientId: VALID_CLIENT_ID,
      clientSecret: VALID_CLIENT_SECRET,
      ...gpgamesConfig,
    },
  };

  if (includeInstagram) {
    auth.instagram = {
      clientId: VALID_CLIENT_ID,
      clientSecret: VALID_CLIENT_SECRET,
      redirectUri: 'https://example.com/callback',
    };
  }

  if (includeOther) {
    auth.other = {
      validateAuthData: () => Promise.resolve(),
      validateAppId: () => Promise.resolve(),
      validateOptions: () => {},
    };
  }

  return reconfigureServer({ auth });
}

// ============================================
// Mock Fetch Helpers
// ============================================

/**
 * Create mock for Google Play Games token exchange
 * @param {string|Function} accessTokenOrResolver - Access token to return, or function(code, body) => accessToken
 * @param {Function} onCall - Optional callback when mock is called
 * @returns {Object} Mock response object
 */
function mockGpgamesTokenExchange(accessTokenOrResolver = MOCK_ACCESS_TOKEN, onCall = null) {
  return {
    url: GOOGLE_TOKEN_URL,
    method: 'POST',
    response: {
      ok: true,
      json: (options) => {
        if (onCall) onCall(options);
        const body = JSON.parse(options.body);
        const code = body.code;
        let accessToken;
        if (typeof accessTokenOrResolver === 'function') {
          accessToken = accessTokenOrResolver(code, body);
        } else {
          accessToken = accessTokenOrResolver;
        }
        return Promise.resolve({ access_token: accessToken });
      },
    },
  };
}

/**
 * Create mock for Google Play Games player info
 * @param {string} userId - Player ID to return
 * @param {Function} onCall - Optional callback when mock is called
 * @returns {Object} Mock response object
 */
function mockGpgamesPlayerInfo(userId = MOCK_USER_ID, onCall = null) {
  return {
    url: GOOGLE_PLAYER_URL(userId),
    method: 'GET',
    response: {
      ok: true,
      json: (options) => {
        if (onCall) onCall(options);
        return Promise.resolve({ playerId: userId });
      },
    },
  };
}

/**
 * Create mock for Instagram token exchange
 * @param {string|Function} accessTokenOrResolver - Access token to return, or function(code, body) => accessToken
 * @param {Function} onCall - Optional callback when mock is called
 * @returns {Object} Mock response object
 */
function mockInstagramTokenExchange(accessTokenOrResolver = 'ig_token_1', onCall = null) {
  return {
    url: IG_TOKEN_URL,
    method: 'POST',
    response: {
      ok: true,
      json: (options) => {
        if (onCall) onCall(options);
        // Instagram uses URLSearchParams, not JSON
        const body = new URLSearchParams(options.body);
        const code = body.get('code');
        let accessToken;
        if (typeof accessTokenOrResolver === 'function') {
          accessToken = accessTokenOrResolver(code, body);
        } else {
          accessToken = accessTokenOrResolver;
        }
        return Promise.resolve({ access_token: accessToken });
      },
    },
  };
}

/**
 * Create mock for Instagram user info
 * @param {string|Function} accessTokenOrResolver - Access token or function(accessToken) => userId for dynamic responses
 * @param {string} userId - User ID to return (default: 'I1')
 * @param {Function} onCall - Optional callback when mock is called
 * @returns {Object} Mock response object with dynamic URL matching
 */
function mockInstagramUserInfo(accessTokenOrResolver = 'ig_token_1', userId = 'I1', onCall = null) {
  // For dynamic access tokens, use a function that matches any IG_ME_URL pattern
  const urlPattern = typeof accessTokenOrResolver === 'function' 
    ? (url) => url && url.startsWith('https://graph.instagram.com/me?fields=id&access_token=')
    : IG_ME_URL(accessTokenOrResolver);

  return {
    url: urlPattern,
    method: 'GET',
    response: {
      ok: true,
      json: (options) => {
        if (onCall) onCall(options);
        // Extract accessToken from URL if resolver is a function
        let resolvedUserId = userId;
        if (typeof accessTokenOrResolver === 'function' && options && options.url) {
          const urlMatch = options.url.match(/access_token=([^&]+)/);
          if (urlMatch) {
            const token = urlMatch[1];
            resolvedUserId = accessTokenOrResolver(token) || userId;
          }
        }
        return Promise.resolve({ id: resolvedUserId });
      },
    },
  };
}

/**
 * Create complete mock for gpgames login flow
 * @param {Object} options - Configuration options
 * @param {string} options.userId - User ID (default: MOCK_USER_ID)
 * @param {string|Function} options.accessToken - Access token or function(code, body) => accessToken for dynamic responses
 * @param {Function} options.onTokenExchange - Callback for token exchange
 * @param {Function} options.onPlayerInfo - Callback for player info
 * @returns {Array} Array of mock responses
 */
function mockGpgamesLogin(options = {}) {
  const {
    userId = MOCK_USER_ID,
    accessToken = MOCK_ACCESS_TOKEN,
    onTokenExchange = null,
    onPlayerInfo = null,
  } = options;

  return [
    mockGpgamesTokenExchange(accessToken, onTokenExchange),
    mockGpgamesPlayerInfo(userId, onPlayerInfo),
  ];
}

/**
 * Create complete mock for instagram login flow
 * @param {Object} options - Configuration options
 * @param {string} options.userId - User ID (default: 'I1')
 * @param {string|Function} options.accessToken - Access token or function(code, body) => accessToken for dynamic responses
 * @param {Function} options.onTokenExchange - Callback for token exchange
 * @param {Function} options.onUserInfo - Callback for user info
 * @returns {Array} Array of mock responses
 */
function mockInstagramLogin(options = {}) {
  const {
    userId = 'I1',
    accessToken = 'ig_token_1',
    onTokenExchange = null,
    onUserInfo = null,
  } = options;

  // If accessToken is a function, we need to handle dynamic URL generation for IG_ME_URL
  // For now, use first token or default for URL construction
  const urlToken = typeof accessToken === 'function' ? 'ig_token_1' : accessToken;

  return [
    mockInstagramTokenExchange(accessToken, onTokenExchange),
    mockInstagramUserInfo(urlToken, userId, onUserInfo),
  ];
}

/**
 * Create mock for error response
 * @param {number} status - HTTP status code
 * @param {Object} errorData - Error data to return
 * @returns {Object} Mock error response object
 */
function mockErrorResponse(status = 400, errorData = { error: 'invalid_grant' }) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(errorData),
  };
}

// ============================================
// User Creation Helpers
// ============================================

/**
 * Create user with gpgames authData
 * @param {Object} options - Configuration options
 * @param {string} options.userId - User ID (default: MOCK_USER_ID)
 * @param {string} options.code - Auth code (default: 'C1')
 * @returns {Promise<Parse.User>} Created user
 */
async function createUserWithGpgames(options = {}) {
  const { userId = MOCK_USER_ID, code = 'C1' } = options;

  mockFetch(mockGpgamesLogin({ userId }));

  return await Parse.User.logInWith('gpgames', {
    authData: { id: userId, code },
  });
}

/**
 * Create user with gpgames authData and return session token
 * @param {Object} options - Configuration options
 * @param {string} options.userId - User ID (default: MOCK_USER_ID)
 * @param {string} options.code - Auth code (default: 'C1')
 * @param {boolean} options.fetch - Whether to fetch user after creation (default: true)
 * @returns {Promise<{user: Parse.User, sessionToken: string}>} User and session token
 */
async function createUserWithGpgamesAndSession(options = {}) {
  const { userId = MOCK_USER_ID, code = 'C1', fetch = true } = options;

  mockFetch(mockGpgamesLogin({ userId }));

  const user = await Parse.User.logInWith('gpgames', {
    authData: { id: userId, code },
  });

  const sessionToken = user.getSessionToken();

  if (fetch) {
    await user.fetch({ sessionToken });
  }

  return { user, sessionToken };
}

/**
 * Create user with password auth
 * @param {Object} options - Configuration options
 * @param {string} options.username - Username (default: TEST_USERNAME)
 * @param {string} options.password - Password (default: TEST_PASSWORD)
 * @returns {Promise<Parse.User>} Created user
 */
async function createUserWithPassword(options = {}) {
  const { username = TEST_USERNAME, password = TEST_PASSWORD } = options;

  return await Parse.User.signUp(username, password);
}

/**
 * Create user with password auth and return session token
 * @param {Object} options - Configuration options
 * @param {string} options.username - Username (default: TEST_USERNAME)
 * @param {string} options.password - Password (default: TEST_PASSWORD)
 * @param {boolean} options.fetch - Whether to fetch user after creation (default: true)
 * @returns {Promise<{user: Parse.User, sessionToken: string}>} User and session token
 */
async function createUserWithPasswordAndSession(options = {}) {
  const { username = TEST_USERNAME, password = TEST_PASSWORD, fetch = true } = options;

  const user = await Parse.User.signUp(username, password);
  const sessionToken = user.getSessionToken();

  if (fetch) {
    await user.fetch({ sessionToken });
  }

  return { user, sessionToken };
}

// ============================================
// AuthData Assertion Helpers
// ============================================

/**
 * Assert that authData contains expected providers
 * @param {Parse.User} user - User object
 * @param {Object} expectedProviders - Object with provider names as keys and expected data as values
 * @param {Object} options - Options
 * @param {boolean} options.useMasterKey - Whether to fetch with master key (default: false)
 * @param {string} options.sessionToken - Session token for fetch (default: undefined)
 * @returns {Promise<Object>} The authData object
 */
async function assertAuthDataProviders(user, expectedProviders, options = {}) {
  const { useMasterKey = false, sessionToken } = options;

  if (useMasterKey) {
    await user.fetch({ useMasterKey: true });
  } else if (sessionToken) {
    await user.fetch({ sessionToken });
  }

  const authData = user.get('authData');
  expect(authData).toBeDefined();

  for (const [provider, expectedData] of Object.entries(expectedProviders)) {
    if (expectedData === null) {
      expect(authData[provider]).toBeUndefined();
    } else if (typeof expectedData === 'object') {
      expect(authData[provider]).toBeDefined();
      for (const [key, value] of Object.entries(expectedData)) {
        expect(authData[provider][key]).toBe(value);
      }
    } else {
      expect(authData[provider]).toBe(expectedData);
    }
  }

  return authData;
}

/**
 * Update user authData with session token
 * @param {Parse.User} user - User object
 * @param {Object} authDataUpdate - AuthData to update
 * @param {string} sessionToken - Session token
 * @param {boolean} fetchAfter - Whether to fetch user after update (default: true)
 * @returns {Promise<Parse.User>} Updated user
 */
async function updateUserAuthData(user, authDataUpdate, sessionToken, fetchAfter = true) {
  await user.save({ authData: authDataUpdate }, { sessionToken });
  if (fetchAfter) {
    await user.fetch({ sessionToken });
  }
  return user;
}

/**
 * Setup mocks for gpgames and instagram with dynamic responses
 * @param {Object} options - Configuration options
 * @param {string|Function} options.gpgamesResolver - Access token or function (code) => accessToken for gpgames
 * @param {string|Function} options.instagramResolver - Access token or function (code) => accessToken for instagram
 * @param {Function} options.onGpgamesTokenExchange - Callback for gpgames token exchange
 * @param {Function} options.onInstagramTokenExchange - Callback for instagram token exchange
 * @returns {Array} Array of mock responses
 */
function setupGpgamesAndInstagramMocks(options = {}) {
  const {
    gpgamesResolver = MOCK_ACCESS_TOKEN,
    instagramResolver = 'ig_token_1',
    onGpgamesTokenExchange = null,
    onInstagramTokenExchange = null,
  } = options;

  return [
    ...mockGpgamesLogin({
      accessToken: typeof gpgamesResolver === 'function' 
        ? gpgamesResolver 
        : () => gpgamesResolver,
      onTokenExchange: onGpgamesTokenExchange,
    }),
    ...mockInstagramLogin({
      accessToken: typeof instagramResolver === 'function'
        ? instagramResolver
        : () => instagramResolver,
      onTokenExchange: onInstagramTokenExchange,
    }),
  ];
}

/**
 * Create validation tracker for a provider
 * @param {string} provider - Provider name ('gpgames' or 'instagram')
 * @param {Object} options - Configuration options
 * @param {Function} options.onValidation - Callback when validation is called
 * @returns {Object} Mock setup with validation tracker
 */
function createValidationTracker(provider, options = {}) {
  const { onValidation } = options;
  let validated = false;

  const tracker = {
    get validated() { return validated; },
    reset() { validated = false; },
  };

  if (provider === 'gpgames') {
    mockFetch(mockGpgamesLogin({
      onTokenExchange: () => {
        validated = true;
        if (onValidation) onValidation();
      },
    }));
  } else if (provider === 'instagram') {
    mockFetch(mockInstagramLogin({
      onTokenExchange: () => {
        validated = true;
        if (onValidation) onValidation();
      },
    }));
  }

  return tracker;
}

// ============================================
// Exports
// ============================================

module.exports = {
  // Constants
  MOCK_USER_ID,
  MOCK_USER_ID_2,
  MOCK_ACCESS_TOKEN,
  MOCK_ACCESS_TOKEN_2,
  VALID_CLIENT_ID,
  VALID_CLIENT_SECRET,
  TEST_USERNAME,
  TEST_PASSWORD,
  GOOGLE_TOKEN_URL,
  GOOGLE_PLAYER_URL,
  IG_TOKEN_URL,
  IG_ME_URL,

  // Auth Configuration
  setupAuthConfig,

  // Mock Helpers
  mockGpgamesTokenExchange,
  mockGpgamesPlayerInfo,
  mockInstagramTokenExchange,
  mockInstagramUserInfo,
  mockGpgamesLogin,
  mockInstagramLogin,
  mockErrorResponse,

  // User Creation
  createUserWithGpgames,
  createUserWithGpgamesAndSession,
  createUserWithPassword,
  createUserWithPasswordAndSession,

  // AuthData Assertion Helpers
  assertAuthDataProviders,
  updateUserAuthData,
  setupGpgamesAndInstagramMocks,
  createValidationTracker,
};

