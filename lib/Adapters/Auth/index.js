'use strict';

var _AdapterLoader = require('../AdapterLoader');

var _AdapterLoader2 = _interopRequireDefault(_AdapterLoader);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var facebook = require('./facebook');
var instagram = require("./instagram");
var linkedin = require("./linkedin");
var meetup = require("./meetup");
var google = require("./google");
var github = require("./github");
var twitter = require("./twitter");
var spotify = require("./spotify");
var digits = require("./twitter"); // digits tokens are validated by twitter
var janrainengage = require("./janrainengage");
var janraincapture = require("./janraincapture");
var vkontakte = require("./vkontakte");
var qq = require("./qq");
var wechat = require("./wechat");
var weibo = require("./weibo");

var anonymous = {
  validateAuthData: function validateAuthData() {
    return Promise.resolve();
  },
  validateAppId: function validateAppId() {
    return Promise.resolve();
  }
};

var providers = {
  facebook: facebook,
  instagram: instagram,
  linkedin: linkedin,
  meetup: meetup,
  google: google,
  github: github,
  twitter: twitter,
  spotify: spotify,
  anonymous: anonymous,
  digits: digits,
  janrainengage: janrainengage,
  janraincapture: janraincapture,
  vkontakte: vkontakte,
  qq: qq,
  wechat: wechat,
  weibo: weibo
};

function authDataValidator(adapter, appIds, options) {
  return function (authData) {
    return adapter.validateAuthData(authData, options).then(function () {
      if (appIds) {
        return adapter.validateAppId(appIds, authData, options);
      }
      return Promise.resolve();
    });
  };
}

function loadAuthAdapter(provider, authOptions) {
  var defaultAdapter = providers[provider];
  var adapter = Object.assign({}, defaultAdapter);
  var providerOptions = authOptions[provider];

  if (!defaultAdapter && !providerOptions) {
    return;
  }

  var appIds = providerOptions ? providerOptions.appIds : undefined;

  // Try the configuration methods
  if (providerOptions) {
    (function () {
      var optionalAdapter = (0, _AdapterLoader2.default)(providerOptions, undefined, providerOptions);
      if (optionalAdapter) {
        ['validateAuthData', 'validateAppId'].forEach(function (key) {
          if (optionalAdapter[key]) {
            adapter[key] = optionalAdapter[key];
          }
        });
      }
    })();
  }

  if (!adapter.validateAuthData || !adapter.validateAppId) {
    return;
  }

  return { adapter: adapter, appIds: appIds, providerOptions: providerOptions };
}

module.exports = function () {
  var authOptions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var enableAnonymousUsers = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

  var _enableAnonymousUsers = enableAnonymousUsers;
  var setEnableAnonymousUsers = function setEnableAnonymousUsers(enable) {
    _enableAnonymousUsers = enable;
  };
  // To handle the test cases on configuration
  var getValidatorForProvider = function getValidatorForProvider(provider) {

    if (provider === 'anonymous' && !_enableAnonymousUsers) {
      return;
    }

    var _loadAuthAdapter = loadAuthAdapter(provider, authOptions),
        adapter = _loadAuthAdapter.adapter,
        appIds = _loadAuthAdapter.appIds,
        providerOptions = _loadAuthAdapter.providerOptions;

    return authDataValidator(adapter, appIds, providerOptions);
  };

  return Object.freeze({
    getValidatorForProvider: getValidatorForProvider,
    setEnableAnonymousUsers: setEnableAnonymousUsers
  });
};

module.exports.loadAuthAdapter = loadAuthAdapter;