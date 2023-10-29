"use strict";

var _node = require("parse/node");
var triggers = _interopRequireWildcard(require("../triggers"));
var _Deprecator = _interopRequireDefault(require("../Deprecator/Deprecator"));
var _middlewares = require("../middlewares");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const Config = require('../Config');
function isParseObjectConstructor(object) {
  return typeof object === 'function' && Object.prototype.hasOwnProperty.call(object, 'className');
}
function validateValidator(validator) {
  if (!validator || typeof validator === 'function') {
    return;
  }
  const fieldOptions = {
    type: ['Any'],
    constant: [Boolean],
    default: ['Any'],
    options: [Array, 'function', 'Any'],
    required: [Boolean],
    error: [String]
  };
  const allowedKeys = {
    requireUser: [Boolean],
    requireAnyUserRoles: [Array, 'function'],
    requireAllUserRoles: [Array, 'function'],
    requireMaster: [Boolean],
    validateMasterKey: [Boolean],
    skipWithMasterKey: [Boolean],
    requireUserKeys: [Array, Object],
    fields: [Array, Object],
    rateLimit: [Object]
  };
  const getType = fn => {
    if (Array.isArray(fn)) {
      return 'array';
    }
    if (fn === 'Any' || fn === 'function') {
      return fn;
    }
    const type = typeof fn;
    if (typeof fn === 'function') {
      const match = fn && fn.toString().match(/^\s*function (\w+)/);
      return (match ? match[1] : 'function').toLowerCase();
    }
    return type;
  };
  const checkKey = (key, data, validatorParam) => {
    const parameter = data[key];
    if (!parameter) {
      throw `${key} is not a supported parameter for Cloud Function validations.`;
    }
    const types = parameter.map(type => getType(type));
    const type = getType(validatorParam);
    if (!types.includes(type) && !types.includes('Any')) {
      throw `Invalid type for Cloud Function validation key ${key}. Expected ${types.join('|')}, actual ${type}`;
    }
  };
  for (const key in validator) {
    checkKey(key, allowedKeys, validator[key]);
    if (key === 'fields' || key === 'requireUserKeys') {
      const values = validator[key];
      if (Array.isArray(values)) {
        continue;
      }
      for (const value in values) {
        const data = values[value];
        for (const subKey in data) {
          checkKey(subKey, fieldOptions, data[subKey]);
        }
      }
    }
  }
}
const getRoute = parseClass => {
  const route = {
    _User: 'users',
    _Session: 'sessions',
    '@File': 'files'
  }[parseClass] || 'classes';
  if (parseClass === '@File') {
    return `/${route}/:id?(.*)`;
  }
  return `/${route}/${parseClass}/:id?(.*)`;
};
/** @namespace
 * @name Parse
 * @description The Parse SDK.
 *  see [api docs](https://docs.parseplatform.org/js/api) and [guide](https://docs.parseplatform.org/js/guide)
 */

/** @namespace
 * @name Parse.Cloud
 * @memberof Parse
 * @description The Parse Cloud Code SDK.
 */

var ParseCloud = {};
/**
 * Defines a Cloud Function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.define('functionName', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.define('functionName', (request) => {
 *   // code here
 * }, { ...validationObject });
 * ```
 *
 * @static
 * @memberof Parse.Cloud
 * @param {String} name The name of the Cloud Function
 * @param {Function} data The Cloud Function to register. This function can be an async function and should take one parameter a {@link Parse.Cloud.FunctionRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FunctionRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.define = function (functionName, handler, validationHandler) {
  validateValidator(validationHandler);
  triggers.addFunction(functionName, handler, validationHandler, _node.Parse.applicationId);
  if (validationHandler && validationHandler.rateLimit) {
    (0, _middlewares.addRateLimit)(_objectSpread({
      requestPath: `/functions/${functionName}`
    }, validationHandler.rateLimit), _node.Parse.applicationId, true);
  }
};

/**
 * Defines a Background Job.
 *
 * **Available in Cloud Code only.**
 *
 * @method job
 * @name Parse.Cloud.job
 * @param {String} name The name of the Background Job
 * @param {Function} func The Background Job to register. This function can be async should take a single parameters a {@link Parse.Cloud.JobRequest}
 *
 */
ParseCloud.job = function (functionName, handler) {
  triggers.addJob(functionName, handler, _node.Parse.applicationId);
};

/**
 *
 * Registers a before save function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeSave for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 *
 * ```
 * Parse.Cloud.beforeSave('MyCustomClass', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeSave(Parse.User, (request) => {
 *   // code here
 * }, { ...validationObject })
 * ```
 *
 * @method beforeSave
 * @name Parse.Cloud.beforeSave
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after save function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a save. This function can be async and should take one parameter a {@link Parse.Cloud.TriggerRequest};
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.beforeSave = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.beforeSave, className, handler, _node.Parse.applicationId, validationHandler);
  if (validationHandler && validationHandler.rateLimit) {
    (0, _middlewares.addRateLimit)(_objectSpread({
      requestPath: getRoute(className),
      requestMethods: ['POST', 'PUT']
    }, validationHandler.rateLimit), _node.Parse.applicationId, true);
  }
};

/**
 * Registers a before delete function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeDelete for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.beforeDelete('MyCustomClass', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeDelete(Parse.User, (request) => {
 *   // code here
 * }, { ...validationObject })
 *```
 *
 * @method beforeDelete
 * @name Parse.Cloud.beforeDelete
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the before delete function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a delete. This function can be async and should take one parameter, a {@link Parse.Cloud.TriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.beforeDelete = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.beforeDelete, className, handler, _node.Parse.applicationId, validationHandler);
  if (validationHandler && validationHandler.rateLimit) {
    (0, _middlewares.addRateLimit)(_objectSpread({
      requestPath: getRoute(className),
      requestMethods: 'DELETE'
    }, validationHandler.rateLimit), _node.Parse.applicationId, true);
  }
};

/**
 *
 * Registers the before login function.
 *
 * **Available in Cloud Code only.**
 *
 * This function provides further control
 * in validating a login attempt. Specifically,
 * it is triggered after a user enters
 * correct credentials (or other valid authData),
 * but prior to a session being generated.
 *
 * ```
 * Parse.Cloud.beforeLogin((request) => {
 *   // code here
 * })
 *
 * ```
 *
 * @method beforeLogin
 * @name Parse.Cloud.beforeLogin
 * @param {Function} func The function to run before a login. This function can be async and should take one parameter a {@link Parse.Cloud.TriggerRequest};
 */
ParseCloud.beforeLogin = function (handler, validationHandler) {
  let className = '_User';
  if (typeof handler === 'string' || isParseObjectConstructor(handler)) {
    // validation will occur downstream, this is to maintain internal
    // code consistency with the other hook types.
    className = triggers.getClassName(handler);
    handler = arguments[1];
    validationHandler = arguments.length >= 2 ? arguments[2] : null;
  }
  triggers.addTrigger(triggers.Types.beforeLogin, className, handler, _node.Parse.applicationId);
  if (validationHandler && validationHandler.rateLimit) {
    (0, _middlewares.addRateLimit)(_objectSpread({
      requestPath: `/login`,
      requestMethods: 'POST'
    }, validationHandler.rateLimit), _node.Parse.applicationId, true);
  }
};

/**
 *
 * Registers the after login function.
 *
 * **Available in Cloud Code only.**
 *
 * This function is triggered after a user logs in successfully,
 * and after a _Session object has been created.
 *
 * ```
 * Parse.Cloud.afterLogin((request) => {
 *   // code here
 * });
 * ```
 *
 * @method afterLogin
 * @name Parse.Cloud.afterLogin
 * @param {Function} func The function to run after a login. This function can be async and should take one parameter a {@link Parse.Cloud.TriggerRequest};
 */
ParseCloud.afterLogin = function (handler) {
  let className = '_User';
  if (typeof handler === 'string' || isParseObjectConstructor(handler)) {
    // validation will occur downstream, this is to maintain internal
    // code consistency with the other hook types.
    className = triggers.getClassName(handler);
    handler = arguments[1];
  }
  triggers.addTrigger(triggers.Types.afterLogin, className, handler, _node.Parse.applicationId);
};

/**
 *
 * Registers the after logout function.
 *
 * **Available in Cloud Code only.**
 *
 * This function is triggered after a user logs out.
 *
 * ```
 * Parse.Cloud.afterLogout((request) => {
 *   // code here
 * });
 * ```
 *
 * @method afterLogout
 * @name Parse.Cloud.afterLogout
 * @param {Function} func The function to run after a logout. This function can be async and should take one parameter a {@link Parse.Cloud.TriggerRequest};
 */
ParseCloud.afterLogout = function (handler) {
  let className = '_Session';
  if (typeof handler === 'string' || isParseObjectConstructor(handler)) {
    // validation will occur downstream, this is to maintain internal
    // code consistency with the other hook types.
    className = triggers.getClassName(handler);
    handler = arguments[1];
  }
  triggers.addTrigger(triggers.Types.afterLogout, className, handler, _node.Parse.applicationId);
};

/**
 * Registers an after save function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use afterSave for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 *
 * ```
 * Parse.Cloud.afterSave('MyCustomClass', async function(request) {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterSave(Parse.User, async function(request) {
 *   // code here
 * }, { ...validationObject });
 * ```
 *
 * @method afterSave
 * @name Parse.Cloud.afterSave
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after save function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run after a save. This function can be an async function and should take just one parameter, {@link Parse.Cloud.TriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.afterSave = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.afterSave, className, handler, _node.Parse.applicationId, validationHandler);
};

/**
 * Registers an after delete function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use afterDelete for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.afterDelete('MyCustomClass', async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterDelete(Parse.User, async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method afterDelete
 * @name Parse.Cloud.afterDelete
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after delete function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run after a delete. This function can be async and should take just one parameter, {@link Parse.Cloud.TriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.afterDelete = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.afterDelete, className, handler, _node.Parse.applicationId, validationHandler);
};

/**
 * Registers a before find function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeFind for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.beforeFind('MyCustomClass', async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeFind(Parse.User, async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method beforeFind
 * @name Parse.Cloud.beforeFind
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the before find function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a find. This function can be async and should take just one parameter, {@link Parse.Cloud.BeforeFindRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.BeforeFindRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.beforeFind = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.beforeFind, className, handler, _node.Parse.applicationId, validationHandler);
  if (validationHandler && validationHandler.rateLimit) {
    (0, _middlewares.addRateLimit)(_objectSpread({
      requestPath: getRoute(className),
      requestMethods: 'GET'
    }, validationHandler.rateLimit), _node.Parse.applicationId, true);
  }
};

/**
 * Registers an after find function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use afterFind for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.afterFind('MyCustomClass', async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterFind(Parse.User, async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method afterFind
 * @name Parse.Cloud.afterFind
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after find function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a find. This function can be async and should take just one parameter, {@link Parse.Cloud.AfterFindRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.AfterFindRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.afterFind = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.afterFind, className, handler, _node.Parse.applicationId, validationHandler);
};

/**
 * Registers a before save file function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.beforeSaveFile(async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeSaveFile(async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method beforeSaveFile
 * @deprecated
 * @name Parse.Cloud.beforeSaveFile
 * @param {Function} func The function to run before saving a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FileTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.beforeSaveFile = function (handler, validationHandler) {
  _Deprecator.default.logRuntimeDeprecation({
    usage: 'Parse.Cloud.beforeSaveFile',
    solution: 'Use Parse.Cloud.beforeSave(Parse.File, (request) => {})'
  });
  ParseCloud.beforeSave(_node.Parse.File, handler, validationHandler);
};

/**
 * Registers an after save file function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.afterSaveFile(async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterSaveFile(async (request) => {
 *  // code here
 * }, { ...validationObject });
 *```
 *
 * @method afterSaveFile
 * @deprecated
 * @name Parse.Cloud.afterSaveFile
 * @param {Function} func The function to run after saving a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FileTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.afterSaveFile = function (handler, validationHandler) {
  _Deprecator.default.logRuntimeDeprecation({
    usage: 'Parse.Cloud.afterSaveFile',
    solution: 'Use Parse.Cloud.afterSave(Parse.File, (request) => {})'
  });
  ParseCloud.afterSave(_node.Parse.File, handler, validationHandler);
};

/**
 * Registers a before delete file function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.beforeDeleteFile(async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeDeleteFile(async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method beforeDeleteFile
 * @deprecated
 * @name Parse.Cloud.beforeDeleteFile
 * @param {Function} func The function to run before deleting a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FileTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.beforeDeleteFile = function (handler, validationHandler) {
  _Deprecator.default.logRuntimeDeprecation({
    usage: 'Parse.Cloud.beforeDeleteFile',
    solution: 'Use Parse.Cloud.beforeDelete(Parse.File, (request) => {})'
  });
  ParseCloud.beforeDelete(_node.Parse.File, handler, validationHandler);
};

/**
 * Registers an after delete file function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.afterDeleteFile(async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterDeleteFile(async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method afterDeleteFile
 * @deprecated
 * @name Parse.Cloud.afterDeleteFile
 * @param {Function} func The function to after before deleting a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FileTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.afterDeleteFile = function (handler, validationHandler) {
  _Deprecator.default.logRuntimeDeprecation({
    usage: 'Parse.Cloud.afterDeleteFile',
    solution: 'Use Parse.Cloud.afterDelete(Parse.File, (request) => {})'
  });
  ParseCloud.afterDelete(_node.Parse.File, handler, validationHandler);
};

/**
 * Registers a before live query server connect function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.beforeConnect(async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeConnect(async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method beforeConnect
 * @name Parse.Cloud.beforeConnect
 * @param {Function} func The function to before connection is made. This function can be async and should take just one parameter, {@link Parse.Cloud.ConnectTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.ConnectTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.beforeConnect = function (handler, validationHandler) {
  validateValidator(validationHandler);
  triggers.addConnectTrigger(triggers.Types.beforeConnect, handler, _node.Parse.applicationId, validationHandler);
};

/**
 * Sends an email through the Parse Server mail adapter.
 *
 * **Available in Cloud Code only.**
 * **Requires a mail adapter to be configured for Parse Server.**
 *
 * ```
 * Parse.Cloud.sendEmail({
 *   from: 'Example <test@example.com>',
 *   to: 'contact@example.com',
 *   subject: 'Test email',
 *   text: 'This email is a test.'
 * });
 *```
 *
 * @method sendEmail
 * @name Parse.Cloud.sendEmail
 * @param {Object} data The object of the mail data to send.
 */
ParseCloud.sendEmail = function (data) {
  const config = Config.get(_node.Parse.applicationId);
  const emailAdapter = config.userController.adapter;
  if (!emailAdapter) {
    config.loggerController.error('Failed to send email because no mail adapter is configured for Parse Server.');
    return;
  }
  return emailAdapter.sendMail(data);
};

/**
 * Registers a before live query subscription function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeSubscribe for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.beforeSubscribe('MyCustomClass', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeSubscribe(Parse.User, (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method beforeSubscribe
 * @name Parse.Cloud.beforeSubscribe
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the before subscription function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a subscription. This function can be async and should take one parameter, a {@link Parse.Cloud.TriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.beforeSubscribe = function (parseClass, handler, validationHandler) {
  validateValidator(validationHandler);
  const className = triggers.getClassName(parseClass);
  triggers.addTrigger(triggers.Types.beforeSubscribe, className, handler, _node.Parse.applicationId, validationHandler);
};
ParseCloud.onLiveQueryEvent = function (handler) {
  triggers.addLiveQueryEventHandler(handler, _node.Parse.applicationId);
};

/**
 * Registers an after live query server event function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.afterLiveQueryEvent('MyCustomClass', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterLiveQueryEvent('MyCustomClass', (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method afterLiveQueryEvent
 * @name Parse.Cloud.afterLiveQueryEvent
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after live query event function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run after a live query event. This function can be async and should take one parameter, a {@link Parse.Cloud.LiveQueryEventTrigger}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.LiveQueryEventTrigger}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.afterLiveQueryEvent = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.afterEvent, className, handler, _node.Parse.applicationId, validationHandler);
};
ParseCloud._removeAllHooks = () => {
  triggers._unregisterAll();
  const config = Config.get(_node.Parse.applicationId);
  config === null || config === void 0 ? void 0 : config.unregisterRateLimiters();
};
ParseCloud.useMasterKey = () => {
  // eslint-disable-next-line
  console.warn('Parse.Cloud.useMasterKey is deprecated (and has no effect anymore) on parse-server, please refer to the cloud code migration notes: http://docs.parseplatform.org/parse-server/guide/#master-key-must-be-passed-explicitly');
};
module.exports = ParseCloud;

/**
 * @interface Parse.Cloud.TriggerRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Boolean} isChallenge If true, means the current request is originally triggered by an auth challenge.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Parse.Object} object The object triggering the hook.
 * @property {String} ip The IP address of the client making the request. To ensure retrieving the correct IP address, set the Parse Server option `trustProxy: true` if Parse Server runs behind a proxy server, for example behind a load balancer.
 * @property {Object} headers The original HTTP headers for the request.
 * @property {String} triggerName The name of the trigger (`beforeSave`, `afterSave`, ...)
 * @property {Object} log The current logger inside Parse Server.
 * @property {Parse.Object} original If set, the object, as currently stored.
 * @property {Object} config The Parse Server config.
 */

/**
 * @interface Parse.Cloud.FileTriggerRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Parse.File} file The file that triggered the hook.
 * @property {Integer} fileSize The size of the file in bytes.
 * @property {Integer} contentLength The value from Content-Length header
 * @property {String} ip The IP address of the client making the request.
 * @property {Object} headers The original HTTP headers for the request.
 * @property {String} triggerName The name of the trigger (`beforeSaveFile`, `afterSaveFile`)
 * @property {Object} log The current logger inside Parse Server.
 * @property {Object} config The Parse Server config.
 */

/**
 * @interface Parse.Cloud.ConnectTriggerRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} useMasterKey If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Integer} clients The number of clients connected.
 * @property {Integer} subscriptions The number of subscriptions connected.
 * @property {String} sessionToken If set, the session of the user that made the request.
 */

/**
 * @interface Parse.Cloud.LiveQueryEventTrigger
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} useMasterKey If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {String} sessionToken If set, the session of the user that made the request.
 * @property {String} event The live query event that triggered the request.
 * @property {Parse.Object} object The object triggering the hook.
 * @property {Parse.Object} original If set, the object, as currently stored.
 * @property {Integer} clients The number of clients connected.
 * @property {Integer} subscriptions The number of subscriptions connected.
 * @property {Boolean} sendEvent If the LiveQuery event should be sent to the client. Set to false to prevent LiveQuery from pushing to the client.
 */

/**
 * @interface Parse.Cloud.BeforeFindRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Parse.Query} query The query triggering the hook.
 * @property {String} ip The IP address of the client making the request.
 * @property {Object} headers The original HTTP headers for the request.
 * @property {String} triggerName The name of the trigger (`beforeSave`, `afterSave`, ...)
 * @property {Object} log The current logger inside Parse Server.
 * @property {Boolean} isGet wether the query a `get` or a `find`
 * @property {Object} config The Parse Server config.
 */

/**
 * @interface Parse.Cloud.AfterFindRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Parse.Query} query The query triggering the hook.
 * @property {Array<Parse.Object>} results The results the query yielded.
 * @property {String} ip The IP address of the client making the request.
 * @property {Object} headers The original HTTP headers for the request.
 * @property {String} triggerName The name of the trigger (`beforeSave`, `afterSave`, ...)
 * @property {Object} log The current logger inside Parse Server.
 * @property {Object} config The Parse Server config.
 */

/**
 * @interface Parse.Cloud.FunctionRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Object} params The params passed to the cloud function.
 * @property {Object} config The Parse Server config.
 */

/**
 * @interface Parse.Cloud.JobRequest
 * @property {Object} params The params passed to the background job.
 * @property {function} message If message is called with a string argument, will update the current message to be stored in the job status.
 * @property {Object} config The Parse Server config.
 */

/**
 * @interface Parse.Cloud.ValidatorObject
 * @property {Boolean} requireUser whether the cloud trigger requires a user.
 * @property {Boolean} requireMaster whether the cloud trigger requires a master key.
 * @property {Boolean} validateMasterKey whether the validator should run if masterKey is provided. Defaults to false.
 * @property {Boolean} skipWithMasterKey whether the cloud code function should be ignored using a masterKey.
 *
 * @property {Array<String>|Object} requireUserKeys If set, keys required on request.user to make the request.
 * @property {String} requireUserKeys.field If requireUserKeys is an object, name of field to validate on request user
 * @property {Array|function|Any} requireUserKeys.field.options array of options that the field can be, function to validate field, or single value. Throw an error if value is invalid.
 * @property {String} requireUserKeys.field.error custom error message if field is invalid.
 *
 * @property {Array<String>|function}requireAnyUserRoles If set, request.user has to be part of at least one roles name to make the request. If set to a function, function must return role names.
 * @property {Array<String>|function}requireAllUserRoles If set, request.user has to be part all roles name to make the request. If set to a function, function must return role names.
 *
 * @property {Object|Array<String>} fields if an array of strings, validator will look for keys in request.params, and throw if not provided. If Object, fields to validate. If the trigger is a cloud function, `request.params` will be validated, otherwise `request.object`.
 * @property {String} fields.field name of field to validate.
 * @property {String} fields.field.type expected type of data for field.
 * @property {Boolean} fields.field.constant whether the field can be modified on the object.
 * @property {Any} fields.field.default default value if field is `null`, or initial value `constant` is `true`.
 * @property {Array|function|Any} fields.field.options array of options that the field can be, function to validate field, or single value. Throw an error if value is invalid.
 * @property {String} fields.field.error custom error message if field is invalid.
 */
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsInJlcXVpcmUiLCJ0cmlnZ2VycyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0RlcHJlY2F0b3IiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX21pZGRsZXdhcmVzIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJfZ2V0UmVxdWlyZVdpbGRjYXJkQ2FjaGUiLCJub2RlSW50ZXJvcCIsIldlYWtNYXAiLCJjYWNoZUJhYmVsSW50ZXJvcCIsImNhY2hlTm9kZUludGVyb3AiLCJjYWNoZSIsImhhcyIsImdldCIsIm5ld09iaiIsImhhc1Byb3BlcnR5RGVzY3JpcHRvciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZGVzYyIsInNldCIsIm93bktleXMiLCJvYmplY3QiLCJlbnVtZXJhYmxlT25seSIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJzeW1ib2xzIiwiZmlsdGVyIiwic3ltIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJ0YXJnZXQiLCJpIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwic291cmNlIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiVHlwZUVycm9yIiwiTnVtYmVyIiwiQ29uZmlnIiwiaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yIiwidmFsaWRhdGVWYWxpZGF0b3IiLCJ2YWxpZGF0b3IiLCJmaWVsZE9wdGlvbnMiLCJ0eXBlIiwiY29uc3RhbnQiLCJCb29sZWFuIiwib3B0aW9ucyIsIkFycmF5IiwicmVxdWlyZWQiLCJlcnJvciIsImFsbG93ZWRLZXlzIiwicmVxdWlyZVVzZXIiLCJyZXF1aXJlQW55VXNlclJvbGVzIiwicmVxdWlyZUFsbFVzZXJSb2xlcyIsInJlcXVpcmVNYXN0ZXIiLCJ2YWxpZGF0ZU1hc3RlcktleSIsInNraXBXaXRoTWFzdGVyS2V5IiwicmVxdWlyZVVzZXJLZXlzIiwiZmllbGRzIiwicmF0ZUxpbWl0IiwiZ2V0VHlwZSIsImZuIiwiaXNBcnJheSIsIm1hdGNoIiwidG9TdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImNoZWNrS2V5IiwiZGF0YSIsInZhbGlkYXRvclBhcmFtIiwicGFyYW1ldGVyIiwidHlwZXMiLCJtYXAiLCJpbmNsdWRlcyIsImpvaW4iLCJ2YWx1ZXMiLCJzdWJLZXkiLCJnZXRSb3V0ZSIsInBhcnNlQ2xhc3MiLCJyb3V0ZSIsIl9Vc2VyIiwiX1Nlc3Npb24iLCJQYXJzZUNsb3VkIiwiZGVmaW5lIiwiZnVuY3Rpb25OYW1lIiwiaGFuZGxlciIsInZhbGlkYXRpb25IYW5kbGVyIiwiYWRkRnVuY3Rpb24iLCJQYXJzZSIsImFwcGxpY2F0aW9uSWQiLCJhZGRSYXRlTGltaXQiLCJyZXF1ZXN0UGF0aCIsImpvYiIsImFkZEpvYiIsImJlZm9yZVNhdmUiLCJjbGFzc05hbWUiLCJnZXRDbGFzc05hbWUiLCJhZGRUcmlnZ2VyIiwiVHlwZXMiLCJyZXF1ZXN0TWV0aG9kcyIsImJlZm9yZURlbGV0ZSIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYWZ0ZXJTYXZlIiwiYWZ0ZXJEZWxldGUiLCJiZWZvcmVGaW5kIiwiYWZ0ZXJGaW5kIiwiYmVmb3JlU2F2ZUZpbGUiLCJEZXByZWNhdG9yIiwibG9nUnVudGltZURlcHJlY2F0aW9uIiwidXNhZ2UiLCJzb2x1dGlvbiIsIkZpbGUiLCJhZnRlclNhdmVGaWxlIiwiYmVmb3JlRGVsZXRlRmlsZSIsImFmdGVyRGVsZXRlRmlsZSIsImJlZm9yZUNvbm5lY3QiLCJhZGRDb25uZWN0VHJpZ2dlciIsInNlbmRFbWFpbCIsImNvbmZpZyIsImVtYWlsQWRhcHRlciIsInVzZXJDb250cm9sbGVyIiwiYWRhcHRlciIsImxvZ2dlckNvbnRyb2xsZXIiLCJzZW5kTWFpbCIsImJlZm9yZVN1YnNjcmliZSIsIm9uTGl2ZVF1ZXJ5RXZlbnQiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJhZnRlckxpdmVRdWVyeUV2ZW50IiwiYWZ0ZXJFdmVudCIsIl9yZW1vdmVBbGxIb29rcyIsIl91bnJlZ2lzdGVyQWxsIiwidW5yZWdpc3RlclJhdGVMaW1pdGVycyIsInVzZU1hc3RlcktleSIsImNvbnNvbGUiLCJ3YXJuIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgKiBhcyB0cmlnZ2VycyBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuaW1wb3J0IHsgYWRkUmF0ZUxpbWl0IH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuY29uc3QgQ29uZmlnID0gcmVxdWlyZSgnLi4vQ29uZmlnJyk7XG5cbmZ1bmN0aW9uIGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihvYmplY3QpIHtcbiAgcmV0dXJuIHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwgJ2NsYXNzTmFtZScpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0b3IpIHtcbiAgaWYgKCF2YWxpZGF0b3IgfHwgdHlwZW9mIHZhbGlkYXRvciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBmaWVsZE9wdGlvbnMgPSB7XG4gICAgdHlwZTogWydBbnknXSxcbiAgICBjb25zdGFudDogW0Jvb2xlYW5dLFxuICAgIGRlZmF1bHQ6IFsnQW55J10sXG4gICAgb3B0aW9uczogW0FycmF5LCAnZnVuY3Rpb24nLCAnQW55J10sXG4gICAgcmVxdWlyZWQ6IFtCb29sZWFuXSxcbiAgICBlcnJvcjogW1N0cmluZ10sXG4gIH07XG4gIGNvbnN0IGFsbG93ZWRLZXlzID0ge1xuICAgIHJlcXVpcmVVc2VyOiBbQm9vbGVhbl0sXG4gICAgcmVxdWlyZUFueVVzZXJSb2xlczogW0FycmF5LCAnZnVuY3Rpb24nXSxcbiAgICByZXF1aXJlQWxsVXNlclJvbGVzOiBbQXJyYXksICdmdW5jdGlvbiddLFxuICAgIHJlcXVpcmVNYXN0ZXI6IFtCb29sZWFuXSxcbiAgICB2YWxpZGF0ZU1hc3RlcktleTogW0Jvb2xlYW5dLFxuICAgIHNraXBXaXRoTWFzdGVyS2V5OiBbQm9vbGVhbl0sXG4gICAgcmVxdWlyZVVzZXJLZXlzOiBbQXJyYXksIE9iamVjdF0sXG4gICAgZmllbGRzOiBbQXJyYXksIE9iamVjdF0sXG4gICAgcmF0ZUxpbWl0OiBbT2JqZWN0XSxcbiAgfTtcbiAgY29uc3QgZ2V0VHlwZSA9IGZuID0+IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShmbikpIHtcbiAgICAgIHJldHVybiAnYXJyYXknO1xuICAgIH1cbiAgICBpZiAoZm4gPT09ICdBbnknIHx8IGZuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXR1cm4gZm47XG4gICAgfVxuICAgIGNvbnN0IHR5cGUgPSB0eXBlb2YgZm47XG4gICAgaWYgKHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBmbiAmJiBmbi50b1N0cmluZygpLm1hdGNoKC9eXFxzKmZ1bmN0aW9uIChcXHcrKS8pO1xuICAgICAgcmV0dXJuIChtYXRjaCA/IG1hdGNoWzFdIDogJ2Z1bmN0aW9uJykudG9Mb3dlckNhc2UoKTtcbiAgICB9XG4gICAgcmV0dXJuIHR5cGU7XG4gIH07XG4gIGNvbnN0IGNoZWNrS2V5ID0gKGtleSwgZGF0YSwgdmFsaWRhdG9yUGFyYW0pID0+IHtcbiAgICBjb25zdCBwYXJhbWV0ZXIgPSBkYXRhW2tleV07XG4gICAgaWYgKCFwYXJhbWV0ZXIpIHtcbiAgICAgIHRocm93IGAke2tleX0gaXMgbm90IGEgc3VwcG9ydGVkIHBhcmFtZXRlciBmb3IgQ2xvdWQgRnVuY3Rpb24gdmFsaWRhdGlvbnMuYDtcbiAgICB9XG4gICAgY29uc3QgdHlwZXMgPSBwYXJhbWV0ZXIubWFwKHR5cGUgPT4gZ2V0VHlwZSh0eXBlKSk7XG4gICAgY29uc3QgdHlwZSA9IGdldFR5cGUodmFsaWRhdG9yUGFyYW0pO1xuICAgIGlmICghdHlwZXMuaW5jbHVkZXModHlwZSkgJiYgIXR5cGVzLmluY2x1ZGVzKCdBbnknKSkge1xuICAgICAgdGhyb3cgYEludmFsaWQgdHlwZSBmb3IgQ2xvdWQgRnVuY3Rpb24gdmFsaWRhdGlvbiBrZXkgJHtrZXl9LiBFeHBlY3RlZCAke3R5cGVzLmpvaW4oXG4gICAgICAgICd8J1xuICAgICAgKX0sIGFjdHVhbCAke3R5cGV9YDtcbiAgICB9XG4gIH07XG4gIGZvciAoY29uc3Qga2V5IGluIHZhbGlkYXRvcikge1xuICAgIGNoZWNrS2V5KGtleSwgYWxsb3dlZEtleXMsIHZhbGlkYXRvcltrZXldKTtcbiAgICBpZiAoa2V5ID09PSAnZmllbGRzJyB8fCBrZXkgPT09ICdyZXF1aXJlVXNlcktleXMnKSB7XG4gICAgICBjb25zdCB2YWx1ZXMgPSB2YWxpZGF0b3Jba2V5XTtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlcykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IHZhbHVlIGluIHZhbHVlcykge1xuICAgICAgICBjb25zdCBkYXRhID0gdmFsdWVzW3ZhbHVlXTtcbiAgICAgICAgZm9yIChjb25zdCBzdWJLZXkgaW4gZGF0YSkge1xuICAgICAgICAgIGNoZWNrS2V5KHN1YktleSwgZmllbGRPcHRpb25zLCBkYXRhW3N1YktleV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5jb25zdCBnZXRSb3V0ZSA9IHBhcnNlQ2xhc3MgPT4ge1xuICBjb25zdCByb3V0ZSA9XG4gICAge1xuICAgICAgX1VzZXI6ICd1c2VycycsXG4gICAgICBfU2Vzc2lvbjogJ3Nlc3Npb25zJyxcbiAgICAgICdARmlsZSc6ICdmaWxlcycsXG4gICAgfVtwYXJzZUNsYXNzXSB8fCAnY2xhc3Nlcyc7XG4gIGlmIChwYXJzZUNsYXNzID09PSAnQEZpbGUnKSB7XG4gICAgcmV0dXJuIGAvJHtyb3V0ZX0vOmlkPyguKilgO1xuICB9XG4gIHJldHVybiBgLyR7cm91dGV9LyR7cGFyc2VDbGFzc30vOmlkPyguKilgO1xufTtcbi8qKiBAbmFtZXNwYWNlXG4gKiBAbmFtZSBQYXJzZVxuICogQGRlc2NyaXB0aW9uIFRoZSBQYXJzZSBTREsuXG4gKiAgc2VlIFthcGkgZG9jc10oaHR0cHM6Ly9kb2NzLnBhcnNlcGxhdGZvcm0ub3JnL2pzL2FwaSkgYW5kIFtndWlkZV0oaHR0cHM6Ly9kb2NzLnBhcnNlcGxhdGZvcm0ub3JnL2pzL2d1aWRlKVxuICovXG5cbi8qKiBAbmFtZXNwYWNlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZFxuICogQG1lbWJlcm9mIFBhcnNlXG4gKiBAZGVzY3JpcHRpb24gVGhlIFBhcnNlIENsb3VkIENvZGUgU0RLLlxuICovXG5cbnZhciBQYXJzZUNsb3VkID0ge307XG4vKipcbiAqIERlZmluZXMgYSBDbG91ZCBGdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmRlZmluZSgnZnVuY3Rpb25OYW1lJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuZGVmaW5lKCdmdW5jdGlvbk5hbWUnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqIGBgYFxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJvZiBQYXJzZS5DbG91ZFxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIENsb3VkIEZ1bmN0aW9uXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBkYXRhIFRoZSBDbG91ZCBGdW5jdGlvbiB0byByZWdpc3Rlci4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRnVuY3Rpb25SZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRnVuY3Rpb25SZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5kZWZpbmUgPSBmdW5jdGlvbiAoZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAodmFsaWRhdGlvbkhhbmRsZXIgJiYgdmFsaWRhdGlvbkhhbmRsZXIucmF0ZUxpbWl0KSB7XG4gICAgYWRkUmF0ZUxpbWl0KFxuICAgICAgeyByZXF1ZXN0UGF0aDogYC9mdW5jdGlvbnMvJHtmdW5jdGlvbk5hbWV9YCwgLi4udmFsaWRhdGlvbkhhbmRsZXIucmF0ZUxpbWl0IH0sXG4gICAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH1cbn07XG5cbi8qKlxuICogRGVmaW5lcyBhIEJhY2tncm91bmQgSm9iLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIEBtZXRob2Qgam9iXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5qb2JcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBCYWNrZ3JvdW5kIEpvYlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgQmFja2dyb3VuZCBKb2IgdG8gcmVnaXN0ZXIuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIHNob3VsZCB0YWtlIGEgc2luZ2xlIHBhcmFtZXRlcnMgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuSm9iUmVxdWVzdH1cbiAqXG4gKi9cblBhcnNlQ2xvdWQuam9iID0gZnVuY3Rpb24gKGZ1bmN0aW9uTmFtZSwgaGFuZGxlcikge1xuICB0cmlnZ2Vycy5hZGRKb2IoZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbn07XG5cbi8qKlxuICpcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBzYXZlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBiZWZvcmVTYXZlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlKCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZShQYXJzZS5Vc2VyLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KVxuICogYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVTYXZlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBhZnRlciBzYXZlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIHNhdmUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fTtcbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZVNhdmUgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG4gIGlmICh2YWxpZGF0aW9uSGFuZGxlciAmJiB2YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQpIHtcbiAgICBhZGRSYXRlTGltaXQoXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RQYXRoOiBnZXRSb3V0ZShjbGFzc05hbWUpLFxuICAgICAgICByZXF1ZXN0TWV0aG9kczogWydQT1NUJywgJ1BVVCddLFxuICAgICAgICAuLi52YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQsXG4gICAgICB9LFxuICAgICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICAgIHRydWVcbiAgICApO1xuICB9XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBkZWxldGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZURlbGV0ZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGUoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGUoUGFyc2UuVXNlciwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSlcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVEZWxldGVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYmVmb3JlIGRlbGV0ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBkZWxldGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyLCBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVEZWxldGUgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRGVsZXRlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbiAgaWYgKHZhbGlkYXRpb25IYW5kbGVyICYmIHZhbGlkYXRpb25IYW5kbGVyLnJhdGVMaW1pdCkge1xuICAgIGFkZFJhdGVMaW1pdChcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFBhdGg6IGdldFJvdXRlKGNsYXNzTmFtZSksXG4gICAgICAgIHJlcXVlc3RNZXRob2RzOiAnREVMRVRFJyxcbiAgICAgICAgLi4udmFsaWRhdGlvbkhhbmRsZXIucmF0ZUxpbWl0LFxuICAgICAgfSxcbiAgICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgfVxufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIHRoZSBiZWZvcmUgbG9naW4gZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogVGhpcyBmdW5jdGlvbiBwcm92aWRlcyBmdXJ0aGVyIGNvbnRyb2xcbiAqIGluIHZhbGlkYXRpbmcgYSBsb2dpbiBhdHRlbXB0LiBTcGVjaWZpY2FsbHksXG4gKiBpdCBpcyB0cmlnZ2VyZWQgYWZ0ZXIgYSB1c2VyIGVudGVyc1xuICogY29ycmVjdCBjcmVkZW50aWFscyAob3Igb3RoZXIgdmFsaWQgYXV0aERhdGEpLFxuICogYnV0IHByaW9yIHRvIGEgc2Vzc2lvbiBiZWluZyBnZW5lcmF0ZWQuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVMb2dpbigocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0pXG4gKlxuICogYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVMb2dpblxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlTG9naW5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBsb2dpbi4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9O1xuICovXG5QYXJzZUNsb3VkLmJlZm9yZUxvZ2luID0gZnVuY3Rpb24gKGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGxldCBjbGFzc05hbWUgPSAnX1VzZXInO1xuICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdzdHJpbmcnIHx8IGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihoYW5kbGVyKSkge1xuICAgIC8vIHZhbGlkYXRpb24gd2lsbCBvY2N1ciBkb3duc3RyZWFtLCB0aGlzIGlzIHRvIG1haW50YWluIGludGVybmFsXG4gICAgLy8gY29kZSBjb25zaXN0ZW5jeSB3aXRoIHRoZSBvdGhlciBob29rIHR5cGVzLlxuICAgIGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShoYW5kbGVyKTtcbiAgICBoYW5kbGVyID0gYXJndW1lbnRzWzFdO1xuICAgIHZhbGlkYXRpb25IYW5kbGVyID0gYXJndW1lbnRzLmxlbmd0aCA+PSAyID8gYXJndW1lbnRzWzJdIDogbnVsbDtcbiAgfVxuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLCBjbGFzc05hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAodmFsaWRhdGlvbkhhbmRsZXIgJiYgdmFsaWRhdGlvbkhhbmRsZXIucmF0ZUxpbWl0KSB7XG4gICAgYWRkUmF0ZUxpbWl0KFxuICAgICAgeyByZXF1ZXN0UGF0aDogYC9sb2dpbmAsIHJlcXVlc3RNZXRob2RzOiAnUE9TVCcsIC4uLnZhbGlkYXRpb25IYW5kbGVyLnJhdGVMaW1pdCB9LFxuICAgICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICAgIHRydWVcbiAgICApO1xuICB9XG59O1xuXG4vKipcbiAqXG4gKiBSZWdpc3RlcnMgdGhlIGFmdGVyIGxvZ2luIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gaXMgdHJpZ2dlcmVkIGFmdGVyIGEgdXNlciBsb2dzIGluIHN1Y2Nlc3NmdWxseSxcbiAqIGFuZCBhZnRlciBhIF9TZXNzaW9uIG9iamVjdCBoYXMgYmVlbiBjcmVhdGVkLlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJMb2dpbigocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0pO1xuICogYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckxvZ2luXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckxvZ2luXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgYSBsb2dpbi4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9O1xuICovXG5QYXJzZUNsb3VkLmFmdGVyTG9naW4gPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICBsZXQgY2xhc3NOYW1lID0gJ19Vc2VyJztcbiAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnc3RyaW5nJyB8fCBpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3IoaGFuZGxlcikpIHtcbiAgICAvLyB2YWxpZGF0aW9uIHdpbGwgb2NjdXIgZG93bnN0cmVhbSwgdGhpcyBpcyB0byBtYWludGFpbiBpbnRlcm5hbFxuICAgIC8vIGNvZGUgY29uc2lzdGVuY3kgd2l0aCB0aGUgb3RoZXIgaG9vayB0eXBlcy5cbiAgICBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUoaGFuZGxlcik7XG4gICAgaGFuZGxlciA9IGFyZ3VtZW50c1sxXTtcbiAgfVxuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKHRyaWdnZXJzLlR5cGVzLmFmdGVyTG9naW4sIGNsYXNzTmFtZSwgaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG4vKipcbiAqXG4gKiBSZWdpc3RlcnMgdGhlIGFmdGVyIGxvZ291dCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIGlzIHRyaWdnZXJlZCBhZnRlciBhIHVzZXIgbG9ncyBvdXQuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxvZ291dCgocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0pO1xuICogYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckxvZ291dFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJMb2dvdXRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGxvZ291dC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9O1xuICovXG5QYXJzZUNsb3VkLmFmdGVyTG9nb3V0ID0gZnVuY3Rpb24gKGhhbmRsZXIpIHtcbiAgbGV0IGNsYXNzTmFtZSA9ICdfU2Vzc2lvbic7XG4gIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ3N0cmluZycgfHwgaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yKGhhbmRsZXIpKSB7XG4gICAgLy8gdmFsaWRhdGlvbiB3aWxsIG9jY3VyIGRvd25zdHJlYW0sIHRoaXMgaXMgdG8gbWFpbnRhaW4gaW50ZXJuYWxcbiAgICAvLyBjb2RlIGNvbnNpc3RlbmN5IHdpdGggdGhlIG90aGVyIGhvb2sgdHlwZXMuXG4gICAgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKGhhbmRsZXIpO1xuICAgIGhhbmRsZXIgPSBhcmd1bWVudHNbMV07XG4gIH1cbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcih0cmlnZ2Vycy5UeXBlcy5hZnRlckxvZ291dCwgY2xhc3NOYW1lLCBoYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIHNhdmUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGFmdGVyU2F2ZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlKCdNeUN1c3RvbUNsYXNzJywgYXN5bmMgZnVuY3Rpb24ocmVxdWVzdCkge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlclNhdmUoUGFyc2UuVXNlciwgYXN5bmMgZnVuY3Rpb24ocmVxdWVzdCkge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJTYXZlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlclNhdmVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIHNhdmUgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgYSBzYXZlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJTYXZlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBkZWxldGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGFmdGVyRGVsZXRlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlKCdNeUN1c3RvbUNsYXNzJywgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGUoUGFyc2UuVXNlciwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJEZWxldGVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBhZnRlciBkZWxldGUgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgYSBkZWxldGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckRlbGV0ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckRlbGV0ZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBmaW5kIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBiZWZvcmVGaW5kIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUZpbmQoJ015Q3VzdG9tQ2xhc3MnLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVGaW5kKFBhcnNlLlVzZXIsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZUZpbmRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZUZpbmRcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGJlZm9yZSBmaW5kIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGZpbmQuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5CZWZvcmVGaW5kUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkJlZm9yZUZpbmRSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVGaW5kID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUZpbmQsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xuICBpZiAodmFsaWRhdGlvbkhhbmRsZXIgJiYgdmFsaWRhdGlvbkhhbmRsZXIucmF0ZUxpbWl0KSB7XG4gICAgYWRkUmF0ZUxpbWl0KFxuICAgICAge1xuICAgICAgICByZXF1ZXN0UGF0aDogZ2V0Um91dGUoY2xhc3NOYW1lKSxcbiAgICAgICAgcmVxdWVzdE1ldGhvZHM6ICdHRVQnLFxuICAgICAgICAuLi52YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQsXG4gICAgICB9LFxuICAgICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICAgIHRydWVcbiAgICApO1xuICB9XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBmaW5kIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBhZnRlckZpbmQgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJGaW5kKCdNeUN1c3RvbUNsYXNzJywgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJGaW5kKFBhcnNlLlVzZXIsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyRmluZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJGaW5kXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBhZnRlciBmaW5kIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGZpbmQuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5BZnRlckZpbmRSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuQWZ0ZXJGaW5kUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJGaW5kID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBzYXZlIGZpbGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVTYXZlRmlsZVxuICogQGRlcHJlY2F0ZWRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVGaWxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIHNhdmluZyBhIGZpbGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZVNhdmVGaWxlID0gZnVuY3Rpb24gKGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICB1c2FnZTogJ1BhcnNlLkNsb3VkLmJlZm9yZVNhdmVGaWxlJyxcbiAgICBzb2x1dGlvbjogJ1VzZSBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlKFBhcnNlLkZpbGUsIChyZXF1ZXN0KSA9PiB7fSknLFxuICB9KTtcbiAgUGFyc2VDbG91ZC5iZWZvcmVTYXZlKFBhcnNlLkZpbGUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIHNhdmUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyU2F2ZUZpbGVcbiAqIEBkZXByZWNhdGVkXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlclNhdmVGaWxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgc2F2aW5nIGEgZmlsZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJTYXZlRmlsZSA9IGZ1bmN0aW9uIChoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgdXNhZ2U6ICdQYXJzZS5DbG91ZC5hZnRlclNhdmVGaWxlJyxcbiAgICBzb2x1dGlvbjogJ1VzZSBQYXJzZS5DbG91ZC5hZnRlclNhdmUoUGFyc2UuRmlsZSwgKHJlcXVlc3QpID0+IHt9KScsXG4gIH0pO1xuICBQYXJzZUNsb3VkLmFmdGVyU2F2ZShQYXJzZS5GaWxlLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcik7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBkZWxldGUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVEZWxldGVGaWxlXG4gKiBAZGVwcmVjYXRlZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBkZWxldGluZyBhIGZpbGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZURlbGV0ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oe1xuICAgIHVzYWdlOiAnUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZScsXG4gICAgc29sdXRpb246ICdVc2UgUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlKFBhcnNlLkZpbGUsIChyZXF1ZXN0KSA9PiB7fSknLFxuICB9KTtcbiAgUGFyc2VDbG91ZC5iZWZvcmVEZWxldGUoUGFyc2UuRmlsZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgZGVsZXRlIGZpbGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyRGVsZXRlRmlsZVxuICogQGRlcHJlY2F0ZWRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlRmlsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gYWZ0ZXIgYmVmb3JlIGRlbGV0aW5nIGEgZmlsZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlID0gZnVuY3Rpb24gKGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICB1c2FnZTogJ1BhcnNlLkNsb3VkLmFmdGVyRGVsZXRlRmlsZScsXG4gICAgc29sdXRpb246ICdVc2UgUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGUoUGFyc2UuRmlsZSwgKHJlcXVlc3QpID0+IHt9KScsXG4gIH0pO1xuICBQYXJzZUNsb3VkLmFmdGVyRGVsZXRlKFBhcnNlLkZpbGUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGxpdmUgcXVlcnkgc2VydmVyIGNvbm5lY3QgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVDb25uZWN0KGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUNvbm5lY3QoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlQ29ubmVjdFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlQ29ubmVjdFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gYmVmb3JlIGNvbm5lY3Rpb24gaXMgbWFkZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkNvbm5lY3RUcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkNvbm5lY3RUcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlQ29ubmVjdCA9IGZ1bmN0aW9uIChoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZENvbm5lY3RUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUNvbm5lY3QsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFNlbmRzIGFuIGVtYWlsIHRocm91Z2ggdGhlIFBhcnNlIFNlcnZlciBtYWlsIGFkYXB0ZXIuXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKiAqKlJlcXVpcmVzIGEgbWFpbCBhZGFwdGVyIHRvIGJlIGNvbmZpZ3VyZWQgZm9yIFBhcnNlIFNlcnZlci4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuc2VuZEVtYWlsKHtcbiAqICAgZnJvbTogJ0V4YW1wbGUgPHRlc3RAZXhhbXBsZS5jb20+JyxcbiAqICAgdG86ICdjb250YWN0QGV4YW1wbGUuY29tJyxcbiAqICAgc3ViamVjdDogJ1Rlc3QgZW1haWwnLFxuICogICB0ZXh0OiAnVGhpcyBlbWFpbCBpcyBhIHRlc3QuJ1xuICogfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2Qgc2VuZEVtYWlsXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5zZW5kRW1haWxcbiAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhIFRoZSBvYmplY3Qgb2YgdGhlIG1haWwgZGF0YSB0byBzZW5kLlxuICovXG5QYXJzZUNsb3VkLnNlbmRFbWFpbCA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGNvbnN0IGVtYWlsQWRhcHRlciA9IGNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyO1xuICBpZiAoIWVtYWlsQWRhcHRlcikge1xuICAgIGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLmVycm9yKFxuICAgICAgJ0ZhaWxlZCB0byBzZW5kIGVtYWlsIGJlY2F1c2Ugbm8gbWFpbCBhZGFwdGVyIGlzIGNvbmZpZ3VyZWQgZm9yIFBhcnNlIFNlcnZlci4nXG4gICAgKTtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIGVtYWlsQWRhcHRlci5zZW5kTWFpbChkYXRhKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGxpdmUgcXVlcnkgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBiZWZvcmVTdWJzY3JpYmUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlKCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlKFBhcnNlLlVzZXIsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZVN1YnNjcmliZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBiZWZvcmUgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIHN1YnNjcmlwdGlvbi4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIsIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZVN1YnNjcmliZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTdWJzY3JpYmUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuUGFyc2VDbG91ZC5vbkxpdmVRdWVyeUV2ZW50ID0gZnVuY3Rpb24gKGhhbmRsZXIpIHtcbiAgdHJpZ2dlcnMuYWRkTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVyKGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgbGl2ZSBxdWVyeSBzZXJ2ZXIgZXZlbnQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxpdmVRdWVyeUV2ZW50KCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJMaXZlUXVlcnlFdmVudCgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyTGl2ZVF1ZXJ5RXZlbnRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyTGl2ZVF1ZXJ5RXZlbnRcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIGxpdmUgcXVlcnkgZXZlbnQgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgYSBsaXZlIHF1ZXJ5IGV2ZW50LiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciwgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuTGl2ZVF1ZXJ5RXZlbnRUcmlnZ2VyfS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuTGl2ZVF1ZXJ5RXZlbnRUcmlnZ2VyfSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckxpdmVRdWVyeUV2ZW50ID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRXZlbnQsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuUGFyc2VDbG91ZC5fcmVtb3ZlQWxsSG9va3MgPSAoKSA9PiB7XG4gIHRyaWdnZXJzLl91bnJlZ2lzdGVyQWxsKCk7XG4gIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGNvbmZpZz8udW5yZWdpc3RlclJhdGVMaW1pdGVycygpO1xufTtcblxuUGFyc2VDbG91ZC51c2VNYXN0ZXJLZXkgPSAoKSA9PiB7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZVxuICBjb25zb2xlLndhcm4oXG4gICAgJ1BhcnNlLkNsb3VkLnVzZU1hc3RlcktleSBpcyBkZXByZWNhdGVkIChhbmQgaGFzIG5vIGVmZmVjdCBhbnltb3JlKSBvbiBwYXJzZS1zZXJ2ZXIsIHBsZWFzZSByZWZlciB0byB0aGUgY2xvdWQgY29kZSBtaWdyYXRpb24gbm90ZXM6IGh0dHA6Ly9kb2NzLnBhcnNlcGxhdGZvcm0ub3JnL3BhcnNlLXNlcnZlci9ndWlkZS8jbWFzdGVyLWtleS1tdXN0LWJlLXBhc3NlZC1leHBsaWNpdGx5J1xuICApO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBQYXJzZUNsb3VkO1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IGlzQ2hhbGxlbmdlIElmIHRydWUsIG1lYW5zIHRoZSBjdXJyZW50IHJlcXVlc3QgaXMgb3JpZ2luYWxseSB0cmlnZ2VyZWQgYnkgYW4gYXV0aCBjaGFsbGVuZ2UuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLk9iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdHJpZ2dlcmluZyB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpcCBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgY2xpZW50IG1ha2luZyB0aGUgcmVxdWVzdC4gVG8gZW5zdXJlIHJldHJpZXZpbmcgdGhlIGNvcnJlY3QgSVAgYWRkcmVzcywgc2V0IHRoZSBQYXJzZSBTZXJ2ZXIgb3B0aW9uIGB0cnVzdFByb3h5OiB0cnVlYCBpZiBQYXJzZSBTZXJ2ZXIgcnVucyBiZWhpbmQgYSBwcm94eSBzZXJ2ZXIsIGZvciBleGFtcGxlIGJlaGluZCBhIGxvYWQgYmFsYW5jZXIuXG4gKiBAcHJvcGVydHkge09iamVjdH0gaGVhZGVycyBUaGUgb3JpZ2luYWwgSFRUUCBoZWFkZXJzIGZvciB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0cmlnZ2VyTmFtZSBUaGUgbmFtZSBvZiB0aGUgdHJpZ2dlciAoYGJlZm9yZVNhdmVgLCBgYWZ0ZXJTYXZlYCwgLi4uKVxuICogQHByb3BlcnR5IHtPYmplY3R9IGxvZyBUaGUgY3VycmVudCBsb2dnZXIgaW5zaWRlIFBhcnNlIFNlcnZlci5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuT2JqZWN0fSBvcmlnaW5hbCBJZiBzZXQsIHRoZSBvYmplY3QsIGFzIGN1cnJlbnRseSBzdG9yZWQuXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLkZpbGV9IGZpbGUgVGhlIGZpbGUgdGhhdCB0cmlnZ2VyZWQgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGZpbGVTaXplIFRoZSBzaXplIG9mIHRoZSBmaWxlIGluIGJ5dGVzLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBjb250ZW50TGVuZ3RoIFRoZSB2YWx1ZSBmcm9tIENvbnRlbnQtTGVuZ3RoIGhlYWRlclxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlRmlsZWAsIGBhZnRlclNhdmVGaWxlYClcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5Db25uZWN0VHJpZ2dlclJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSB1c2VNYXN0ZXJLZXkgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGNsaWVudHMgVGhlIG51bWJlciBvZiBjbGllbnRzIGNvbm5lY3RlZC5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gc3Vic2NyaXB0aW9ucyBUaGUgbnVtYmVyIG9mIHN1YnNjcmlwdGlvbnMgY29ubmVjdGVkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHNlc3Npb25Ub2tlbiBJZiBzZXQsIHRoZSBzZXNzaW9uIG9mIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuTGl2ZVF1ZXJ5RXZlbnRUcmlnZ2VyXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gdXNlTWFzdGVyS2V5IElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHNlc3Npb25Ub2tlbiBJZiBzZXQsIHRoZSBzZXNzaW9uIG9mIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBldmVudCBUaGUgbGl2ZSBxdWVyeSBldmVudCB0aGF0IHRyaWdnZXJlZCB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuT2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9yaWdpbmFsIElmIHNldCwgdGhlIG9iamVjdCwgYXMgY3VycmVudGx5IHN0b3JlZC5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gY2xpZW50cyBUaGUgbnVtYmVyIG9mIGNsaWVudHMgY29ubmVjdGVkLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBzdWJzY3JpcHRpb25zIFRoZSBudW1iZXIgb2Ygc3Vic2NyaXB0aW9ucyBjb25uZWN0ZWQuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHNlbmRFdmVudCBJZiB0aGUgTGl2ZVF1ZXJ5IGV2ZW50IHNob3VsZCBiZSBzZW50IHRvIHRoZSBjbGllbnQuIFNldCB0byBmYWxzZSB0byBwcmV2ZW50IExpdmVRdWVyeSBmcm9tIHB1c2hpbmcgdG8gdGhlIGNsaWVudC5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuQmVmb3JlRmluZFJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLlF1ZXJ5fSBxdWVyeSBUaGUgcXVlcnkgdHJpZ2dlcmluZyB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpcCBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgY2xpZW50IG1ha2luZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBvcmlnaW5hbCBIVFRQIGhlYWRlcnMgZm9yIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRyaWdnZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSB0cmlnZ2VyIChgYmVmb3JlU2F2ZWAsIGBhZnRlclNhdmVgLCAuLi4pXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBpc0dldCB3ZXRoZXIgdGhlIHF1ZXJ5IGEgYGdldGAgb3IgYSBgZmluZGBcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWcuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkFmdGVyRmluZFJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLlF1ZXJ5fSBxdWVyeSBUaGUgcXVlcnkgdHJpZ2dlcmluZyB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7QXJyYXk8UGFyc2UuT2JqZWN0Pn0gcmVzdWx0cyBUaGUgcmVzdWx0cyB0aGUgcXVlcnkgeWllbGRlZC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpcCBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgY2xpZW50IG1ha2luZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBvcmlnaW5hbCBIVFRQIGhlYWRlcnMgZm9yIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRyaWdnZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSB0cmlnZ2VyIChgYmVmb3JlU2F2ZWAsIGBhZnRlclNhdmVgLCAuLi4pXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICogQHByb3BlcnR5IHtPYmplY3R9IGNvbmZpZyBUaGUgUGFyc2UgU2VydmVyIGNvbmZpZy5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuRnVuY3Rpb25SZXF1ZXN0XG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gbWFzdGVyIElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1zIHBhc3NlZCB0byB0aGUgY2xvdWQgZnVuY3Rpb24uXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5Kb2JSZXF1ZXN0XG4gKiBAcHJvcGVydHkge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbXMgcGFzc2VkIHRvIHRoZSBiYWNrZ3JvdW5kIGpvYi5cbiAqIEBwcm9wZXJ0eSB7ZnVuY3Rpb259IG1lc3NhZ2UgSWYgbWVzc2FnZSBpcyBjYWxsZWQgd2l0aCBhIHN0cmluZyBhcmd1bWVudCwgd2lsbCB1cGRhdGUgdGhlIGN1cnJlbnQgbWVzc2FnZSB0byBiZSBzdG9yZWQgaW4gdGhlIGpvYiBzdGF0dXMuXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3RcbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gcmVxdWlyZVVzZXIgd2hldGhlciB0aGUgY2xvdWQgdHJpZ2dlciByZXF1aXJlcyBhIHVzZXIuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHJlcXVpcmVNYXN0ZXIgd2hldGhlciB0aGUgY2xvdWQgdHJpZ2dlciByZXF1aXJlcyBhIG1hc3RlciBrZXkuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHZhbGlkYXRlTWFzdGVyS2V5IHdoZXRoZXIgdGhlIHZhbGlkYXRvciBzaG91bGQgcnVuIGlmIG1hc3RlcktleSBpcyBwcm92aWRlZC4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHNraXBXaXRoTWFzdGVyS2V5IHdoZXRoZXIgdGhlIGNsb3VkIGNvZGUgZnVuY3Rpb24gc2hvdWxkIGJlIGlnbm9yZWQgdXNpbmcgYSBtYXN0ZXJLZXkuXG4gKlxuICogQHByb3BlcnR5IHtBcnJheTxTdHJpbmc+fE9iamVjdH0gcmVxdWlyZVVzZXJLZXlzIElmIHNldCwga2V5cyByZXF1aXJlZCBvbiByZXF1ZXN0LnVzZXIgdG8gbWFrZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSByZXF1aXJlVXNlcktleXMuZmllbGQgSWYgcmVxdWlyZVVzZXJLZXlzIGlzIGFuIG9iamVjdCwgbmFtZSBvZiBmaWVsZCB0byB2YWxpZGF0ZSBvbiByZXF1ZXN0IHVzZXJcbiAqIEBwcm9wZXJ0eSB7QXJyYXl8ZnVuY3Rpb258QW55fSByZXF1aXJlVXNlcktleXMuZmllbGQub3B0aW9ucyBhcnJheSBvZiBvcHRpb25zIHRoYXQgdGhlIGZpZWxkIGNhbiBiZSwgZnVuY3Rpb24gdG8gdmFsaWRhdGUgZmllbGQsIG9yIHNpbmdsZSB2YWx1ZS4gVGhyb3cgYW4gZXJyb3IgaWYgdmFsdWUgaXMgaW52YWxpZC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSByZXF1aXJlVXNlcktleXMuZmllbGQuZXJyb3IgY3VzdG9tIGVycm9yIG1lc3NhZ2UgaWYgZmllbGQgaXMgaW52YWxpZC5cbiAqXG4gKiBAcHJvcGVydHkge0FycmF5PFN0cmluZz58ZnVuY3Rpb259cmVxdWlyZUFueVVzZXJSb2xlcyBJZiBzZXQsIHJlcXVlc3QudXNlciBoYXMgdG8gYmUgcGFydCBvZiBhdCBsZWFzdCBvbmUgcm9sZXMgbmFtZSB0byBtYWtlIHRoZSByZXF1ZXN0LiBJZiBzZXQgdG8gYSBmdW5jdGlvbiwgZnVuY3Rpb24gbXVzdCByZXR1cm4gcm9sZSBuYW1lcy5cbiAqIEBwcm9wZXJ0eSB7QXJyYXk8U3RyaW5nPnxmdW5jdGlvbn1yZXF1aXJlQWxsVXNlclJvbGVzIElmIHNldCwgcmVxdWVzdC51c2VyIGhhcyB0byBiZSBwYXJ0IGFsbCByb2xlcyBuYW1lIHRvIG1ha2UgdGhlIHJlcXVlc3QuIElmIHNldCB0byBhIGZ1bmN0aW9uLCBmdW5jdGlvbiBtdXN0IHJldHVybiByb2xlIG5hbWVzLlxuICpcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fEFycmF5PFN0cmluZz59IGZpZWxkcyBpZiBhbiBhcnJheSBvZiBzdHJpbmdzLCB2YWxpZGF0b3Igd2lsbCBsb29rIGZvciBrZXlzIGluIHJlcXVlc3QucGFyYW1zLCBhbmQgdGhyb3cgaWYgbm90IHByb3ZpZGVkLiBJZiBPYmplY3QsIGZpZWxkcyB0byB2YWxpZGF0ZS4gSWYgdGhlIHRyaWdnZXIgaXMgYSBjbG91ZCBmdW5jdGlvbiwgYHJlcXVlc3QucGFyYW1zYCB3aWxsIGJlIHZhbGlkYXRlZCwgb3RoZXJ3aXNlIGByZXF1ZXN0Lm9iamVjdGAuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gZmllbGRzLmZpZWxkIG5hbWUgb2YgZmllbGQgdG8gdmFsaWRhdGUuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gZmllbGRzLmZpZWxkLnR5cGUgZXhwZWN0ZWQgdHlwZSBvZiBkYXRhIGZvciBmaWVsZC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gZmllbGRzLmZpZWxkLmNvbnN0YW50IHdoZXRoZXIgdGhlIGZpZWxkIGNhbiBiZSBtb2RpZmllZCBvbiB0aGUgb2JqZWN0LlxuICogQHByb3BlcnR5IHtBbnl9IGZpZWxkcy5maWVsZC5kZWZhdWx0IGRlZmF1bHQgdmFsdWUgaWYgZmllbGQgaXMgYG51bGxgLCBvciBpbml0aWFsIHZhbHVlIGBjb25zdGFudGAgaXMgYHRydWVgLlxuICogQHByb3BlcnR5IHtBcnJheXxmdW5jdGlvbnxBbnl9IGZpZWxkcy5maWVsZC5vcHRpb25zIGFycmF5IG9mIG9wdGlvbnMgdGhhdCB0aGUgZmllbGQgY2FuIGJlLCBmdW5jdGlvbiB0byB2YWxpZGF0ZSBmaWVsZCwgb3Igc2luZ2xlIHZhbHVlLiBUaHJvdyBhbiBlcnJvciBpZiB2YWx1ZSBpcyBpbnZhbGlkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGZpZWxkcy5maWVsZC5lcnJvciBjdXN0b20gZXJyb3IgbWVzc2FnZSBpZiBmaWVsZCBpcyBpbnZhbGlkLlxuICovXG4iXSwibWFwcGluZ3MiOiI7O0FBQUEsSUFBQUEsS0FBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsUUFBQSxHQUFBQyx1QkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsV0FBQSxHQUFBQyxzQkFBQSxDQUFBSixPQUFBO0FBQ0EsSUFBQUssWUFBQSxHQUFBTCxPQUFBO0FBQThDLFNBQUFJLHVCQUFBRSxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBQUEsU0FBQUcseUJBQUFDLFdBQUEsZUFBQUMsT0FBQSxrQ0FBQUMsaUJBQUEs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bEIsVUFBVSxDQUFDO0VBQ25EckMsaUJBQWlCLENBQUM2QyxpQkFBaUIsQ0FBQztFQUNwQy9HLFFBQVEsQ0FBQzBILFVBQVUsQ0FDakIxSCxRQUFRLENBQUMySCxLQUFLLENBQUNnQyxVQUFVLEVBQ3pCbkMsU0FBUyxFQUNUVixPQUFPLEVBQ1BHLFdBQUssQ0FBQ0MsYUFBYSxFQUNuQkgsaUJBQ0YsQ0FBQztBQUNILENBQUM7QUFFREosVUFBVSxDQUFDaUQsZUFBZSxHQUFHLE1BQU07RUFDakM1SixRQUFRLENBQUM2SixjQUFjLENBQUMsQ0FBQztFQUN6QixNQUFNWixNQUFNLEdBQUdqRixNQUFNLENBQUNqRCxHQUFHLENBQUNrRyxXQUFLLENBQUNDLGFBQWEsQ0FBQztFQUM5QytCLE1BQU0sYUFBTkEsTUFBTSx1QkFBTkEsTUFBTSxDQUFFYSxzQkFBc0IsQ0FBQyxDQUFDO0FBQ2xDLENBQUM7QUFFRG5ELFVBQVUsQ0FBQ29ELFlBQVksR0FBRyxNQUFNO0VBQzlCO0VBQ0FDLE9BQU8sQ0FBQ0MsSUFBSSxDQUNWLDROQUNGLENBQUM7QUFDSCxDQUFDO0FBRURDLE1BQU0sQ0FBQ0MsT0FBTyxHQUFHeEQsVUFBVTs7QUFFM0I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIn0=