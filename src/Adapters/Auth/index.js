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

const adapters = {
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
  weibo,
  oauth2
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

function providerName2adapterName(providerName, authOptions) {
  let adapterName = providerName;
  if (authOptions && authOptions.hasOwnProperty(providerName)) {
    const providerOptions = authOptions[providerName];
    if (providerOptions && providerOptions.hasOwnProperty('adapter')) {
      adapterName = providerOptions['adapter'];
    }
  }
  return adapterName;
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

function loadAuthAdapter(providerName, authOptions, adapterName) {
  const defaultAdapter = adapters[adapterName ? adapterName : providerName];
  const adapter = Object.assign({}, defaultAdapter);
  const providerOptions = authOptions[providerName];

  if (!defaultAdapter && !providerOptions) {
    return;
  }

  const appIds = providerOptions ? providerOptions.appIds : undefined;

  // Try the configuration methods
  if (providerOptions) {
    if (providerOptions.hasOwnProperty('adapter')) {
      delete providerOptions['adapter'];
    }
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

  for (var adapterName in adapters) {
    const adapter = adapters[adapterName];
    const validationError = validateAdapter(adapter);
    if (validationError) {
      throw validationError;
    }
  }

  // To handle the test cases on configuration
  const getValidatorForProvider = function(providerName) {
    const adapterName = providerName2adapterName(providerName);

    if (adapterName === 'anonymous' && !_enableAnonymousUsers) {
      return;
    }

    const {
      adapter,
      appIds,
      providerOptions
    } = loadAuthAdapter(providerName, authOptions, adapterName);

    return authDataValidator(adapter, appIds, providerOptions);
  }

  return Object.freeze({
    getValidatorForProvider,
    setEnableAnonymousUsers
  })
}

module.exports.loadAuthAdapter = loadAuthAdapter;
