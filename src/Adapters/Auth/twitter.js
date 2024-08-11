/**
 * Parse Server configuration for Twitter
 *
 * @Class Twitter
 * @param {Object} options The adapter options object
 * @param {String} options.consumer_key Your Twitter application's consumer key
 * @param {String} options.consumer_secret Your Twitter application's consumer secret
 * @param {Boolean} options.enableInsecureAuth Enable insecure authentication
 *
 * The adapter expects the following authData from the client:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.id The user id obtained from Twitter
 * @param {String} payload.oauth_token The oauth_token obtained from Twitter
 * @param {String} payload.oauth_verifier The oauth_verifier obtained from Twitter
 *
 * Parse Server then stores the required auth data in the database.
 *
 * With enableInsecureAuth flag:
 * It directly validates the user id, access token and access token secret sent from the client.
 *
 * Without enableInsecureAuth flag:
 * It requires 'oauth_token' and 'oauth_verifier' sent from client to exchange for access token.
 *
 * * Example auth data for Twitter with insecure flag:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.id "1234567890"
 * @param {String} payload.oauth_token "1234567890-abc123def456"
 * @param {String} payload.oauth_token_secret "1234567890-abc123def456"
 *
 * {
 * "twitter": {
 * "id": "1234567890",
 * "oauth_token": "1234567890-abc123def456",
 * "oauth_token_secret": "1234567890-abc123def456"
 * }
 * }
 *
 *  Example auth data for Twitter without insecure flag:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.oauth_token "1234567890-abc123def456"
 * @param {String} payload.oauth_verifier "abc123def456"
 *
 * {
 * "twitter": {
 * "oauth_token": "1234567890-abc123def456",
 * "oauth_verifier": "abc123def456"
 * }
 * }
 *
 *
 * Parse Sever then stores the required auth data in the database.
 * For more information on Twitter authentication, see https://developer.twitter.com/en/docs/apps/overview
 *
 *
 */
import Config from '../../Config';
const querystring = require('querystring');
// Helper functions for accessing the twitter API.
var OAuth = require('./OAuth1Client');
var Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills iff this user id is valid.
async function validateAuthData(authData, options) {
  const config = Config.get(Parse.applicationId);
  const twitterConfig = config.auth.twitter;
  if (twitterConfig && twitterConfig.enableInsecureAuth && config.enableInsecureAuthAdapters) {
    // Insecure validation
    if (!authData.oauth_token || !authData.oauth_token_secret) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Twitter insecure auth requires oauth_token/oauth_token_secret to be sent.'
      );
    }
    options = handleMultipleConfigurations(authData, options);
    return request(authData, options).then(data => {
      data = httpsRequest.jsonAndQueryStringParse(data?.data);
      if (data && data.id == authData.id) {
        return;
      }
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Twitter auth is invalid for this user.');
    });
  }
}

async function beforeValidationAuthData(authData, options = {}) {
  let { consumer_key, consumer_secret } = options;
  const config = Config.get(Parse.applicationId);
  const twitterConfig = config.auth.twitter;
  if (authData && authData.oauth_token && authData.oauth_token_secret && !twitterConfig) {
    let userData = await request(authData, options);
    userData = httpsRequest.jsonAndQueryStringParse(userData);
    if ((userData && userData.user_id) || userData.id) {
      authData.id = userData.user_id || userData.id;
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Twitter auth is invalid for this user.');
  }

  if (twitterConfig && twitterConfig.enableInsecureAuth && config.enableInsecureAuthAdapters)
    return;

  if (!consumer_key || !consumer_secret) {
    consumer_key = consumer_key || authData.consumer_key;
    consumer_secret = consumer_secret || authData.consumer_secret;
  }

  if (!consumer_key || !consumer_secret) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Twitter auth configuration missing consumer_key and/or consumer_secret.'
    );
  }

  const accessTokenRequestOptions = {
    method: 'POST',
    uri: 'https://api.twitter.com/oauth/access_token',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: querystring.stringify({
      oauth_token: authData.oauth_token,
      oauth_verifier: authData.oauth_verifier,
    }),
    json: true,
  };
  const accessTokenData = await httpsRequest.getAccessToken(accessTokenRequestOptions);
  if (accessTokenData && accessTokenData.oauth_token) {
    const oauth_token = accessTokenData.oauth_token;
    const user_id = accessTokenData.user_id;
    if (oauth_token && user_id) {
      authData.id = user_id;
      authData.auth_token = oauth_token;
      return;
    }
  }
  throw new Parse.Error(
    Parse.Error.OBJECT_NOT_FOUND,
    'Twitter auth is invalid for this user.' + ` ${accessTokenData?.error_description || ''}`
  );
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

function handleMultipleConfigurations(authData, options) {
  if (Array.isArray(options)) {
    const consumer_key = authData.consumer_key;
    if (!consumer_key) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Twitter auth is invalid for this user.');
    }
    options = options.filter(option => {
      return option.consumer_key == consumer_key;
    });

    if (options.length == 0) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Twitter auth is invalid for this user.');
    }
    options = options[0];
  }
  return options;
}

// A promisey wrapper for api requests
function request(authData, options) {
  const { consumer_key, consumer_secret } = options;
  const oauth = new OAuth({
    consumer_key: consumer_key,
    consumer_secret: consumer_secret,
    auth_token: authData.oauth_token,
    auth_token_secret: authData.oauth_token_secret,
    host: 'api.twitter.com',
  });
  return oauth.send('GET', '/2/users/me');
}

module.exports = {
  validateAppId,
  validateAuthData,
  handleMultipleConfigurations,
  beforeValidationAuthData,
};
