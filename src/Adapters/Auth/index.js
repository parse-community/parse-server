import AuthAdapter from './AuthAdapter';
import loadAdapter from '../AdapterLoader';

const facebook = require('./facebook');
const facebookaccountkit = require('./facebookaccountkit');
const instagram = require("./instagram");
const linkedin = require("./linkedin");
const meetup = require("./meetup");
const google = require("./google");
const github = require("./github");
const twitter = require("./twitter");
const spotify = require("./spotify");
const digits = require("./twitter"); // digits tokens are validated by twitter
const janrainengage = require("./janrainengage");
const janraincapture = require("./janraincapture");
const vkontakte = require("./vkontakte");
const qq = require("./qq");
const wechat = require("./wechat");
const weibo = require("./weibo");
const oauth2 = require("./oauth2");

const anonymous = {
  validateAuthData: () => {
    return Promise.resolve();
  },
  validateAppId: () => {
    return Promise.resolve();
  }
}

const providers = {
  facebook,
  facebookaccountkit,
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
  vkontakte,
  qq,
  wechat,
  weibo
}

function authDataValidator(adapter, appIds, options) {
  return function(authData) {
    return adapter.validateAuthData(authData, options).then(() => {
      if (appIds) {
        return adapter.validateAppId(appIds, authData, options);
      }
      return Promise.resolve();
    });
  }
}

function validateAdapter(adapter) {
  const mismatches = Object.getOwnPropertyNames(AuthAdapter.prototype).reduce((obj, key) => {
    const adapterType = typeof adapter[key];
    const expectedType = typeof AuthAdapter.prototype[key];
    if (adapterType !== expectedType) {
      obj[key] = {
        expected: expectedType,
        actual: adapterType
      }
    }
    return obj;
  }, {});

  let ret = null;
  if (Object.keys(mismatches).length > 0) {
    ret = new Error('Adapter prototype doesn\'t match expected prototype', adapter, mismatches);
  }
  return ret;
}

function loadAuthAdapter(provider, authOptions) {
  let defaultAdapter = providers[provider];
  const providerOptions = authOptions[provider];
  if (providerOptions && providerOptions.hasOwnProperty('oauth2')) {
    if (providerOptions['oauth2'] === true) {
      defaultAdapter = oauth2;
    }
  }

  if (!defaultAdapter && !providerOptions) {
    return;
  }

  const adapter = Object.assign({}, defaultAdapter);
  const appIds = providerOptions ? providerOptions.appIds : undefined;

  // Try the configuration methods
  if (providerOptions) {
    const optionalAdapter = loadAdapter(providerOptions, undefined, providerOptions);
    if (optionalAdapter) {
      ['validateAuthData', 'validateAppId'].forEach((key) => {
        if (optionalAdapter[key]) {
          adapter[key] = optionalAdapter[key];
        }
      });
    }
  }

  if (validateAdapter(adapter)) {
    return;
  }

  return {adapter, appIds, providerOptions};
}

module.exports = function(authOptions = {}, enableAnonymousUsers = true) {
  let _enableAnonymousUsers = enableAnonymousUsers;
  const setEnableAnonymousUsers = function(enable) {
    _enableAnonymousUsers = enable;
  }

  for (var prov in providers) {
    const adapter = providers[prov];
    const validationError = validateAdapter(adapter);
    if (validationError) {
      throw validationError;
    }
  }

  // To handle the test cases on configuration
  const getValidatorForProvider = function(provider) {
    if (provider === 'anonymous' && !_enableAnonymousUsers) {
      return;
    }

    const {
      adapter,
      appIds,
      providerOptions
    } = loadAuthAdapter(provider, authOptions);

    return authDataValidator(adapter, appIds, providerOptions);
  }

  return Object.freeze({
    getValidatorForProvider,
    setEnableAnonymousUsers
  })
}

module.exports.loadAuthAdapter = loadAuthAdapter;
