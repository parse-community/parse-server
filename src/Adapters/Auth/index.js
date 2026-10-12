import loadAdapter from '../AdapterLoader';
import Parse from 'parse/node';
import AuthAdapter from './AuthAdapter';

const apple = require('./apple');
const digits = require('./twitter'); // digits tokens are validated by twitter
const facebook = require('./facebook');
import gcenter from './gcenter';
import github from './github';
const google = require('./google');
import gpgames from './gpgames';
import instagram from './instagram';
const janraincapture = require('./janraincapture');
const janrainengage = require('./janrainengage');
const keycloak = require('./keycloak');
const ldap = require('./ldap');
import line from './line';
import linkedin from './linkedin';
const meetup = require('./meetup');
import mfa from './mfa';
import microsoft from './microsoft';
import oauth2 from './oauth2';
const phantauth = require('./phantauth');
import qq from './qq';
import spotify from './spotify';
import twitter from './twitter';
const vkontakte = require('./vkontakte');
import wechat from './wechat';
import weibo from './weibo';


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
  mfa,
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
};

// Indexed auth policies
const authAdapterPolicies = {
  default: true,
  solo: true,
  additional: true,
};

function authDataValidator(provider, adapter, appIds, options) {
  return async function (authData, req, user, requestObject, { isLogin = true } = {}) {
    if (appIds && typeof adapter.validateAppId === 'function') {
      await Promise.resolve(adapter.validateAppId(appIds, authData, options, requestObject));
    }
    if (
      adapter.policy &&
      !authAdapterPolicies[adapter.policy] &&
      typeof adapter.policy !== 'function'
    ) {
      throw new Parse.Error(
        Parse.Error.OTHER_CAUSE,
        'AuthAdapter policy is not configured correctly. The value must be either "solo", "additional", "default" or undefined (will be handled as "default")'
      );
    }
    if (typeof adapter.validateAuthData === 'function') {
      return adapter.validateAuthData(authData, options, requestObject);
    }
    if (
      typeof adapter.validateSetUp !== 'function' ||
      typeof adapter.validateLogin !== 'function' ||
      typeof adapter.validateUpdate !== 'function'
    ) {
      throw new Parse.Error(
        Parse.Error.OTHER_CAUSE,
        'Adapter is not configured. Implement either validateAuthData or all of the following: validateSetUp, validateLogin and validateUpdate'
      );
    }
    // Update by the user or master key; never on login
    const isUpdate =
      !isLogin &&
      ((req.auth.user && user && req.auth.user.id === user.id) || (user && req.auth.isMaster));
    let hasAuthDataConfigured = false;

    if (user && user.get('authData') && user.get('authData')[provider]) {
      hasAuthDataConfigured = true;
    }

    if (isUpdate) {
      // User is updating their authData
      if (hasAuthDataConfigured) {
        return {
          method: 'validateUpdate',
          validator: () => adapter.validateUpdate(authData, options, requestObject),
        };
      }
      // Set up if the user does not have the provider configured
      return {
        method: 'validateSetUp',
        validator: () => adapter.validateSetUp(authData, options, requestObject),
      };
    }

    // Not an update and authData is configured on the user
    if (hasAuthDataConfigured) {
      return {
        method: 'validateLogin',
        validator: () => adapter.validateLogin(authData, options, requestObject),
      };
    }

    // Not an update and the provider is not set up, for example when a new user
    // signs up or an existing user uses a new auth provider
    return {
      method: 'validateSetUp',
      validator: () => adapter.validateSetUp(authData, options, requestObject),
    };
  };
}

// Default methods of the `AuthAdapter` base class
const defaultAuthAdapter = new AuthAdapter();

// Whether a method is an unmodified default of the `AuthAdapter` base class
function isDefaultMethod(key, method) {
  const defaultMethod = defaultAuthAdapter[key];
  return (
    typeof method === 'function' &&
    typeof defaultMethod === 'function' &&
    Function.prototype.toString.call(method) === Function.prototype.toString.call(defaultMethod)
  );
}

// Whether an adapter is a class instance rather than a plain object
function isClassInstance(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(adapter);
  return prototype !== null && prototype !== Object.prototype;
}

// Own property, also over an inherited read-only property or accessor
function setOwnProperty(object, key, value) {
  Object.defineProperty(object, key, { value, writable: true, enumerable: true, configurable: true });
}

function loadAuthAdapter(provider, authOptions) {
  // providers are auth providers implemented by default
  let defaultAdapter = Object.prototype.hasOwnProperty.call(providers, provider)
    ? providers[provider]
    : undefined;
  // authOptions can contain complete custom auth adapters or
  // a default auth adapter like Facebook
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

  const optionalAdapter = providerOptions
    ? loadAdapter(providerOptions, undefined, providerOptions)
    : undefined;
  const isCustomInstance = !defaultAdapter && isClassInstance(optionalAdapter);
  let adapter;
  if (defaultAdapter instanceof AuthAdapter) {
    adapter = new defaultAdapter.constructor();
  } else if (isCustomInstance) {
    // Per-load copy of the instance
    adapter = Object.create(optionalAdapter);
  } else {
    adapter = Object.assign({}, defaultAdapter);
  }
  const keys = [
    'validateAuthData',
    'validateAppId',
    'validateSetUp',
    'validateLogin',
    'validateUpdate',
    'challenge',
    'validateOptions',
    'policy',
    'afterFind',
  ];
  const keysWithBeforeFind = [...keys, 'beforeFind'];
  const appIds = providerOptions ? providerOptions.appIds : undefined;

  if (isCustomInstance) {
    // Own entries, methods bound to the copy
    keysWithBeforeFind.forEach(key => {
      const value = adapter[key];
      if (isDefaultMethod(key, value)) {
        setOwnProperty(adapter, key, null);
      } else {
        setOwnProperty(adapter, key, typeof value === 'function' ? value.bind(adapter) : value);
      }
    });
  } else {
    keys.forEach(key => {
      if (isDefaultMethod(key, adapter?.[key])) {
        adapter[key] = null;
      }
    });
    // Try the configuration methods
    if (optionalAdapter) {
      const isInstance = isClassInstance(optionalAdapter);
      // Keep a built-in credential check
      const loadsBeforeFind =
        isInstance &&
        (typeof adapter.beforeFind !== 'function' || isDefaultMethod('beforeFind', adapter.beforeFind));
      (loadsBeforeFind ? keysWithBeforeFind : keys).forEach(key => {
        const value = optionalAdapter[key];
        if (!value || (key === 'beforeFind' && isDefaultMethod(key, value))) {
          return;
        }
        adapter[key] = isInstance && isDefaultMethod(key, value) ? null : value;
      });
    }
  }
  if (adapter.validateOptions) {
    adapter.validateOptions(providerOptions);
  }
  if (isCustomInstance) {
    // Keys deleted by validateOptions stay deleted
    keysWithBeforeFind.forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(adapter, key)) {
        setOwnProperty(adapter, key, undefined);
      }
    });
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
    if (!authAdapter) { return; }
    const { adapter, appIds, providerOptions } = authAdapter;
    return { validator: authDataValidator(provider, adapter, appIds, providerOptions), adapter };
  };

  const runAfterFind = async (req, authData) => {
    if (!authData) {
      return;
    }
    const adapters = Object.keys(authData);
    await Promise.all(
      adapters.map(async provider => {
        const authAdapter = getValidatorForProvider(provider);
        if (!authAdapter) {
          return;
        }
        const { adapter, providerOptions } = authAdapter;
        const afterFind = adapter.afterFind;
        if (afterFind && typeof afterFind === 'function') {
          const requestObject = {
            ip: req.config.ip,
            user: req.auth.user,
            master: req.auth.isMaster,
          };
          const result = afterFind.call(
            adapter,
            authData[provider],
            providerOptions,
            requestObject,
          );
          if (result) {
            authData[provider] = result;
          }
        }
      })
    );
  };

  // Returns the list of auth provider names that have a valid adapter configured.
  // This includes both built-in providers and custom providers from authOptions.
  const getProviders = function () {
    const allProviders = new Set([...Object.keys(providers), ...Object.keys(authOptions)]);
    if (!_enableAnonymousUsers) {
      allProviders.delete('anonymous');
    }
    return [...allProviders].filter(provider => {
      try {
        return !!loadAuthAdapter(provider, authOptions);
      } catch {
        return false;
      }
    });
  };

  return Object.freeze({
    getValidatorForProvider,
    getProviders,
    setEnableAnonymousUsers,
    runAfterFind,
  });
};

module.exports.loadAuthAdapter = loadAuthAdapter;
