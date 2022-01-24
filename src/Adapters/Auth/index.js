import loadAdapter from '../AdapterLoader';
import Parse from 'parse/node';

const apple = require('./apple');
const gcenter = require('./gcenter');
const gpgames = require('./gpgames');
const facebook = require('./facebook');
const instagram = require('./instagram');
const linkedin = require('./linkedin');
const meetup = require('./meetup');
const google = require('./google');
const github = require('./github');
const twitter = require('./twitter');
const spotify = require('./spotify');
const digits = require('./twitter'); // digits tokens are validated by twitter
const janrainengage = require('./janrainengage');
const janraincapture = require('./janraincapture');
const line = require('./line');
const vkontakte = require('./vkontakte');
const qq = require('./qq');
const wechat = require('./wechat');
const weibo = require('./weibo');
const oauth2 = require('./oauth2');
const phantauth = require('./phantauth');
const microsoft = require('./microsoft');
const keycloak = require('./keycloak');
const ldap = require('./ldap');
const webauthn = require('./webauthn');

const anonymous = {
  validateAuthData: () => {
    return Promise.resolve();
  },
  validateAppId: () => {
    return Promise.resolve();
  },
};

const providers = {
  apple,
  gcenter,
  gpgames,
  facebook,
  instagram,
  linkedin,
  meetup,
  google,
  github,
  twitter,
  spotify,
  anonymous,
  digits,
  janrainengage,
  janraincapture,
  line,
  vkontakte,
  qq,
  wechat,
  weibo,
  phantauth,
  microsoft,
  keycloak,
  ldap,
  webauthn,
};

function authDataValidator(provider, adapter, appIds, options) {
  return async function (authData, req, user) {
    if (appIds && typeof adapter.validateAppId === 'function') {
      await adapter.validateAppId(appIds, authData, options, req, user);
    }
    if (typeof adapter.validateAuthData === 'function') {
      return adapter.validateAuthData(authData, options, req, user);
    } else if (
      typeof adapter.validateSetUp === 'function' &&
      typeof adapter.validateLogin === 'function' &&
      typeof adapter.validateUpdate === 'function'
    ) {
      // We can consider for DX purpose when masterKey is detected, we should
      // trigger a logged in user
      const isLoggedIn =
        (req.auth.user && user && req.auth.user.id === user.id) || (user && req.auth.isMaster);
      let hasAuthDataConfigured = false;

      if (user && user.get('authData') && user.get('authData')[provider]) {
        hasAuthDataConfigured = true;
      }

      if (isLoggedIn) {
        // User is currently updating his authData
        if (hasAuthDataConfigured) {
          return adapter.validateUpdate(authData, options, req, user);
        }
        // Let's setup if the user does not have the provider configured
        return adapter.validateSetUp(authData, options, req, user);
      }

      // Not logged in and authData configured into the DB
      if (hasAuthDataConfigured) {
        return adapter.validateLogin(authData, options, req, user);
      }

      // Finally, user not logged in and the provider is not setup
      // use cases: existing user using a new auth provider at login time or new user
      return adapter.validateSetUp(authData, options, req, user);
    }
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      'Adapter not ready, need to implement validateAuthData or (validateSetUp, validateLogin, validateUpdate)'
    );
  };
}

function loadAuthAdapter(provider, authOptions) {
  // `providers` are default providers already implemented
  // into parse-server
  let defaultAdapter = providers[provider];
  // authOptions could contain a complete custom adapter
  // or just some options for a default auth parse adapter
  // like facebook
  const providerOptions = authOptions[provider];
  if (
    providerOptions &&
    Object.prototype.hasOwnProperty.call(providerOptions, 'oauth2') &&
    providerOptions['oauth2'] === true
  ) {
    defaultAdapter = oauth2;
  }

  // Default provider not found and a custom auth provider was not provided
  if (!defaultAdapter && !providerOptions) {
    return;
  }

  const adapter = Object.assign({}, defaultAdapter);
  const appIds = providerOptions ? providerOptions.appIds : undefined;

  // Try the configuration methods
  if (providerOptions) {
    const optionalAdapter = loadAdapter(providerOptions, undefined, providerOptions);
    if (optionalAdapter) {
      [
        'validateAuthData',
        'validateAppId',
        'validateSetUp',
        'validateLogin',
        'validateUpdate',
        'challenge',
        'policy',
      ].forEach(key => {
        if (optionalAdapter[key]) {
          adapter[key] = optionalAdapter[key];
        }
      });
    }
  }

  return { adapter, appIds, providerOptions };
}

module.exports = function (authOptions = {}, enableAnonymousUsers = true) {
  let _enableAnonymousUsers = enableAnonymousUsers;
  const setEnableAnonymousUsers = function (enable) {
    _enableAnonymousUsers = enable;
  };
  // To handle the test cases on configuration
  const getValidatorForProvider = function (provider) {
    if (provider === 'anonymous' && !_enableAnonymousUsers) {
      return { validator: undefined };
    }
    const authAdapter = loadAuthAdapter(provider, authOptions);
    if (!authAdapter) return;
    const { adapter, appIds, providerOptions } = authAdapter;
    return { validator: authDataValidator(provider, adapter, appIds, providerOptions), adapter };
  };

  return Object.freeze({
    getValidatorForProvider,
    setEnableAnonymousUsers,
  });
};

module.exports.loadAuthAdapter = loadAuthAdapter;
