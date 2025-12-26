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
 * @param {string} accessToken - Access token to return
 * @param {Function} onCall - Optional callback when mock is called
 * @returns {Object} Mock response object
 */
function mockGpgamesTokenExchange(accessToken = MOCK_ACCESS_TOKEN, onCall = null) {
  return {
    url: GOOGLE_TOKEN_URL,
    method: 'POST',
    response: {
      ok: true,
      json: (options) => {
        if (onCall) onCall(options);
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
 * @param {string} accessToken - Access token to return
 * @param {Function} onCall - Optional callback when mock is called
 * @returns {Object} Mock response object
 */
function mockInstagramTokenExchange(accessToken = 'ig_token_1', onCall = null) {
  return {
    url: IG_TOKEN_URL,
    method: 'POST',
    response: {
      ok: true,
      json: (options) => {
        if (onCall) onCall(options);
        return Promise.resolve({ access_token: accessToken });
      },
    },
  };
}

/**
 * Create mock for Instagram user info
 * @param {string} accessToken - Access token used in URL
 * @param {string} userId - User ID to return (default: 'I1')
 * @param {Function} onCall - Optional callback when mock is called
 * @returns {Object} Mock response object
 */
function mockInstagramUserInfo(accessToken = 'ig_token_1', userId = 'I1', onCall = null) {
  return {
    url: IG_ME_URL(accessToken),
    method: 'GET',
    response: {
      ok: true,
      json: (options) => {
        if (onCall) onCall(options);
        return Promise.resolve({ id: userId });
      },
    },
  };
}

/**
 * Create complete mock for gpgames login flow
 * @param {Object} options - Configuration options
 * @param {string} options.userId - User ID (default: MOCK_USER_ID)
 * @param {string} options.accessToken - Access token (default: MOCK_ACCESS_TOKEN)
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
 * @param {string} options.accessToken - Access token (default: 'ig_token_1')
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

  return [
    mockInstagramTokenExchange(accessToken, onTokenExchange),
    mockInstagramUserInfo(accessToken, userId, onUserInfo),
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
  createUserWithPassword,
};

