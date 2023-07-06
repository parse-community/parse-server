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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDb25maWciLCJyZXF1aXJlIiwiaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yIiwib2JqZWN0IiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidmFsaWRhdGVWYWxpZGF0b3IiLCJ2YWxpZGF0b3IiLCJmaWVsZE9wdGlvbnMiLCJ0eXBlIiwiY29uc3RhbnQiLCJCb29sZWFuIiwiZGVmYXVsdCIsIm9wdGlvbnMiLCJBcnJheSIsInJlcXVpcmVkIiwiZXJyb3IiLCJTdHJpbmciLCJhbGxvd2VkS2V5cyIsInJlcXVpcmVVc2VyIiwicmVxdWlyZUFueVVzZXJSb2xlcyIsInJlcXVpcmVBbGxVc2VyUm9sZXMiLCJyZXF1aXJlTWFzdGVyIiwidmFsaWRhdGVNYXN0ZXJLZXkiLCJza2lwV2l0aE1hc3RlcktleSIsInJlcXVpcmVVc2VyS2V5cyIsImZpZWxkcyIsInJhdGVMaW1pdCIsImdldFR5cGUiLCJmbiIsImlzQXJyYXkiLCJtYXRjaCIsInRvU3RyaW5nIiwidG9Mb3dlckNhc2UiLCJjaGVja0tleSIsImtleSIsImRhdGEiLCJ2YWxpZGF0b3JQYXJhbSIsInBhcmFtZXRlciIsInR5cGVzIiwibWFwIiwiaW5jbHVkZXMiLCJqb2luIiwidmFsdWVzIiwidmFsdWUiLCJzdWJLZXkiLCJnZXRSb3V0ZSIsInBhcnNlQ2xhc3MiLCJyb3V0ZSIsIl9Vc2VyIiwiX1Nlc3Npb24iLCJQYXJzZUNsb3VkIiwiZGVmaW5lIiwiZnVuY3Rpb25OYW1lIiwiaGFuZGxlciIsInZhbGlkYXRpb25IYW5kbGVyIiwidHJpZ2dlcnMiLCJhZGRGdW5jdGlvbiIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsImFkZFJhdGVMaW1pdCIsInJlcXVlc3RQYXRoIiwiam9iIiwiYWRkSm9iIiwiYmVmb3JlU2F2ZSIsImNsYXNzTmFtZSIsImdldENsYXNzTmFtZSIsImFkZFRyaWdnZXIiLCJUeXBlcyIsInJlcXVlc3RNZXRob2RzIiwiYmVmb3JlRGVsZXRlIiwiYmVmb3JlTG9naW4iLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJhZnRlckxvZ2luIiwiYWZ0ZXJMb2dvdXQiLCJhZnRlclNhdmUiLCJhZnRlckRlbGV0ZSIsImJlZm9yZUZpbmQiLCJhZnRlckZpbmQiLCJiZWZvcmVTYXZlRmlsZSIsIkRlcHJlY2F0b3IiLCJsb2dSdW50aW1lRGVwcmVjYXRpb24iLCJ1c2FnZSIsInNvbHV0aW9uIiwiRmlsZSIsImFmdGVyU2F2ZUZpbGUiLCJiZWZvcmVEZWxldGVGaWxlIiwiYWZ0ZXJEZWxldGVGaWxlIiwiYmVmb3JlQ29ubmVjdCIsImFkZENvbm5lY3RUcmlnZ2VyIiwic2VuZEVtYWlsIiwiY29uZmlnIiwiZ2V0IiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwibG9nZ2VyQ29udHJvbGxlciIsInNlbmRNYWlsIiwiYmVmb3JlU3Vic2NyaWJlIiwib25MaXZlUXVlcnlFdmVudCIsImFkZExpdmVRdWVyeUV2ZW50SGFuZGxlciIsImFmdGVyTGl2ZVF1ZXJ5RXZlbnQiLCJhZnRlckV2ZW50IiwiX3JlbW92ZUFsbEhvb2tzIiwiX3VucmVnaXN0ZXJBbGwiLCJ1bnJlZ2lzdGVyUmF0ZUxpbWl0ZXJzIiwidXNlTWFzdGVyS2V5IiwiY29uc29sZSIsIndhcm4iLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL2Nsb3VkLWNvZGUvUGFyc2UuQ2xvdWQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCAqIGFzIHRyaWdnZXJzIGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCBEZXByZWNhdG9yIGZyb20gJy4uL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5pbXBvcnQgeyBhZGRSYXRlTGltaXQgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5jb25zdCBDb25maWcgPSByZXF1aXJlKCcuLi9Db25maWcnKTtcblxuZnVuY3Rpb24gaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yKG9iamVjdCkge1xuICByZXR1cm4gdHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCAnY2xhc3NOYW1lJyk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRvcikge1xuICBpZiAoIXZhbGlkYXRvciB8fCB0eXBlb2YgdmFsaWRhdG9yID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IGZpZWxkT3B0aW9ucyA9IHtcbiAgICB0eXBlOiBbJ0FueSddLFxuICAgIGNvbnN0YW50OiBbQm9vbGVhbl0sXG4gICAgZGVmYXVsdDogWydBbnknXSxcbiAgICBvcHRpb25zOiBbQXJyYXksICdmdW5jdGlvbicsICdBbnknXSxcbiAgICByZXF1aXJlZDogW0Jvb2xlYW5dLFxuICAgIGVycm9yOiBbU3RyaW5nXSxcbiAgfTtcbiAgY29uc3QgYWxsb3dlZEtleXMgPSB7XG4gICAgcmVxdWlyZVVzZXI6IFtCb29sZWFuXSxcbiAgICByZXF1aXJlQW55VXNlclJvbGVzOiBbQXJyYXksICdmdW5jdGlvbiddLFxuICAgIHJlcXVpcmVBbGxVc2VyUm9sZXM6IFtBcnJheSwgJ2Z1bmN0aW9uJ10sXG4gICAgcmVxdWlyZU1hc3RlcjogW0Jvb2xlYW5dLFxuICAgIHZhbGlkYXRlTWFzdGVyS2V5OiBbQm9vbGVhbl0sXG4gICAgc2tpcFdpdGhNYXN0ZXJLZXk6IFtCb29sZWFuXSxcbiAgICByZXF1aXJlVXNlcktleXM6IFtBcnJheSwgT2JqZWN0XSxcbiAgICBmaWVsZHM6IFtBcnJheSwgT2JqZWN0XSxcbiAgICByYXRlTGltaXQ6IFtPYmplY3RdLFxuICB9O1xuICBjb25zdCBnZXRUeXBlID0gZm4gPT4ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KGZuKSkge1xuICAgICAgcmV0dXJuICdhcnJheSc7XG4gICAgfVxuICAgIGlmIChmbiA9PT0gJ0FueScgfHwgZm4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybiBmbjtcbiAgICB9XG4gICAgY29uc3QgdHlwZSA9IHR5cGVvZiBmbjtcbiAgICBpZiAodHlwZW9mIGZuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGZuICYmIGZuLnRvU3RyaW5nKCkubWF0Y2goL15cXHMqZnVuY3Rpb24gKFxcdyspLyk7XG4gICAgICByZXR1cm4gKG1hdGNoID8gbWF0Y2hbMV0gOiAnZnVuY3Rpb24nKS50b0xvd2VyQ2FzZSgpO1xuICAgIH1cbiAgICByZXR1cm4gdHlwZTtcbiAgfTtcbiAgY29uc3QgY2hlY2tLZXkgPSAoa2V5LCBkYXRhLCB2YWxpZGF0b3JQYXJhbSkgPT4ge1xuICAgIGNvbnN0IHBhcmFtZXRlciA9IGRhdGFba2V5XTtcbiAgICBpZiAoIXBhcmFtZXRlcikge1xuICAgICAgdGhyb3cgYCR7a2V5fSBpcyBub3QgYSBzdXBwb3J0ZWQgcGFyYW1ldGVyIGZvciBDbG91ZCBGdW5jdGlvbiB2YWxpZGF0aW9ucy5gO1xuICAgIH1cbiAgICBjb25zdCB0eXBlcyA9IHBhcmFtZXRlci5tYXAodHlwZSA9PiBnZXRUeXBlKHR5cGUpKTtcbiAgICBjb25zdCB0eXBlID0gZ2V0VHlwZSh2YWxpZGF0b3JQYXJhbSk7XG4gICAgaWYgKCF0eXBlcy5pbmNsdWRlcyh0eXBlKSAmJiAhdHlwZXMuaW5jbHVkZXMoJ0FueScpKSB7XG4gICAgICB0aHJvdyBgSW52YWxpZCB0eXBlIGZvciBDbG91ZCBGdW5jdGlvbiB2YWxpZGF0aW9uIGtleSAke2tleX0uIEV4cGVjdGVkICR7dHlwZXMuam9pbihcbiAgICAgICAgJ3wnXG4gICAgICApfSwgYWN0dWFsICR7dHlwZX1gO1xuICAgIH1cbiAgfTtcbiAgZm9yIChjb25zdCBrZXkgaW4gdmFsaWRhdG9yKSB7XG4gICAgY2hlY2tLZXkoa2V5LCBhbGxvd2VkS2V5cywgdmFsaWRhdG9yW2tleV0pO1xuICAgIGlmIChrZXkgPT09ICdmaWVsZHMnIHx8IGtleSA9PT0gJ3JlcXVpcmVVc2VyS2V5cycpIHtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IHZhbGlkYXRvcltrZXldO1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWVzKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgdmFsdWUgaW4gdmFsdWVzKSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSB2YWx1ZXNbdmFsdWVdO1xuICAgICAgICBmb3IgKGNvbnN0IHN1YktleSBpbiBkYXRhKSB7XG4gICAgICAgICAgY2hlY2tLZXkoc3ViS2V5LCBmaWVsZE9wdGlvbnMsIGRhdGFbc3ViS2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbmNvbnN0IGdldFJvdXRlID0gcGFyc2VDbGFzcyA9PiB7XG4gIGNvbnN0IHJvdXRlID1cbiAgICB7XG4gICAgICBfVXNlcjogJ3VzZXJzJyxcbiAgICAgIF9TZXNzaW9uOiAnc2Vzc2lvbnMnLFxuICAgICAgJ0BGaWxlJzogJ2ZpbGVzJyxcbiAgICB9W3BhcnNlQ2xhc3NdIHx8ICdjbGFzc2VzJztcbiAgaWYgKHBhcnNlQ2xhc3MgPT09ICdARmlsZScpIHtcbiAgICByZXR1cm4gYC8ke3JvdXRlfS86aWQ/KC4qKWA7XG4gIH1cbiAgcmV0dXJuIGAvJHtyb3V0ZX0vJHtwYXJzZUNsYXNzfS86aWQ/KC4qKWA7XG59O1xuLyoqIEBuYW1lc3BhY2VcbiAqIEBuYW1lIFBhcnNlXG4gKiBAZGVzY3JpcHRpb24gVGhlIFBhcnNlIFNESy5cbiAqICBzZWUgW2FwaSBkb2NzXShodHRwczovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvanMvYXBpKSBhbmQgW2d1aWRlXShodHRwczovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvanMvZ3VpZGUpXG4gKi9cblxuLyoqIEBuYW1lc3BhY2VcbiAqIEBuYW1lIFBhcnNlLkNsb3VkXG4gKiBAbWVtYmVyb2YgUGFyc2VcbiAqIEBkZXNjcmlwdGlvbiBUaGUgUGFyc2UgQ2xvdWQgQ29kZSBTREsuXG4gKi9cblxudmFyIFBhcnNlQ2xvdWQgPSB7fTtcbi8qKlxuICogRGVmaW5lcyBhIENsb3VkIEZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuZGVmaW5lKCdmdW5jdGlvbk5hbWUnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5kZWZpbmUoJ2Z1bmN0aW9uTmFtZScsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICogYGBgXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlcm9mIFBhcnNlLkNsb3VkXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgQ2xvdWQgRnVuY3Rpb25cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRhdGEgVGhlIENsb3VkIEZ1bmN0aW9uIHRvIHJlZ2lzdGVyLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GdW5jdGlvblJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GdW5jdGlvblJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmRlZmluZSA9IGZ1bmN0aW9uIChmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGlmICh2YWxpZGF0aW9uSGFuZGxlciAmJiB2YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQpIHtcbiAgICBhZGRSYXRlTGltaXQoXG4gICAgICB7IHJlcXVlc3RQYXRoOiBgL2Z1bmN0aW9ucy8ke2Z1bmN0aW9uTmFtZX1gLCAuLi52YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQgfSxcbiAgICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgfVxufTtcblxuLyoqXG4gKiBEZWZpbmVzIGEgQmFja2dyb3VuZCBKb2IuXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogQG1ldGhvZCBqb2JcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmpvYlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIEJhY2tncm91bmQgSm9iXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBCYWNrZ3JvdW5kIEpvYiB0byByZWdpc3Rlci4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgc2hvdWxkIHRha2UgYSBzaW5nbGUgcGFyYW1ldGVycyBhIHtAbGluayBQYXJzZS5DbG91ZC5Kb2JSZXF1ZXN0fVxuICpcbiAqL1xuUGFyc2VDbG91ZC5qb2IgPSBmdW5jdGlvbiAoZnVuY3Rpb25OYW1lLCBoYW5kbGVyKSB7XG4gIHRyaWdnZXJzLmFkZEpvYihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIHNhdmUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZVNhdmUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmUoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlKFBhcnNlLlVzZXIsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pXG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZVNhdmVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIHNhdmUgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgc2F2ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9O1xuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlU2F2ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbiAgaWYgKHZhbGlkYXRpb25IYW5kbGVyICYmIHZhbGlkYXRpb25IYW5kbGVyLnJhdGVMaW1pdCkge1xuICAgIGFkZFJhdGVMaW1pdChcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFBhdGg6IGdldFJvdXRlKGNsYXNzTmFtZSksXG4gICAgICAgIHJlcXVlc3RNZXRob2RzOiBbJ1BPU1QnLCAnUFVUJ10sXG4gICAgICAgIC4uLnZhbGlkYXRpb25IYW5kbGVyLnJhdGVMaW1pdCxcbiAgICAgIH0sXG4gICAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH1cbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGRlbGV0ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYmVmb3JlRGVsZXRlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZSgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZShQYXJzZS5Vc2VyLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KVxuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZURlbGV0ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBiZWZvcmUgZGVsZXRlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGRlbGV0ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIsIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZURlbGV0ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVEZWxldGUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xuICBpZiAodmFsaWRhdGlvbkhhbmRsZXIgJiYgdmFsaWRhdGlvbkhhbmRsZXIucmF0ZUxpbWl0KSB7XG4gICAgYWRkUmF0ZUxpbWl0KFxuICAgICAge1xuICAgICAgICByZXF1ZXN0UGF0aDogZ2V0Um91dGUoY2xhc3NOYW1lKSxcbiAgICAgICAgcmVxdWVzdE1ldGhvZHM6ICdERUxFVEUnLFxuICAgICAgICAuLi52YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQsXG4gICAgICB9LFxuICAgICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICAgIHRydWVcbiAgICApO1xuICB9XG59O1xuXG4vKipcbiAqXG4gKiBSZWdpc3RlcnMgdGhlIGJlZm9yZSBsb2dpbiBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIHByb3ZpZGVzIGZ1cnRoZXIgY29udHJvbFxuICogaW4gdmFsaWRhdGluZyBhIGxvZ2luIGF0dGVtcHQuIFNwZWNpZmljYWxseSxcbiAqIGl0IGlzIHRyaWdnZXJlZCBhZnRlciBhIHVzZXIgZW50ZXJzXG4gKiBjb3JyZWN0IGNyZWRlbnRpYWxzIChvciBvdGhlciB2YWxpZCBhdXRoRGF0YSksXG4gKiBidXQgcHJpb3IgdG8gYSBzZXNzaW9uIGJlaW5nIGdlbmVyYXRlZC5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUxvZ2luKChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSlcbiAqXG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZUxvZ2luXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVMb2dpblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGxvZ2luLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlTG9naW4gPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgbGV0IGNsYXNzTmFtZSA9ICdfVXNlcic7XG4gIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ3N0cmluZycgfHwgaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yKGhhbmRsZXIpKSB7XG4gICAgLy8gdmFsaWRhdGlvbiB3aWxsIG9jY3VyIGRvd25zdHJlYW0sIHRoaXMgaXMgdG8gbWFpbnRhaW4gaW50ZXJuYWxcbiAgICAvLyBjb2RlIGNvbnNpc3RlbmN5IHdpdGggdGhlIG90aGVyIGhvb2sgdHlwZXMuXG4gICAgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKGhhbmRsZXIpO1xuICAgIGhhbmRsZXIgPSBhcmd1bWVudHNbMV07XG4gICAgdmFsaWRhdGlvbkhhbmRsZXIgPSBhcmd1bWVudHMubGVuZ3RoID49IDIgPyBhcmd1bWVudHNbMl0gOiBudWxsO1xuICB9XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sIGNsYXNzTmFtZSwgaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGlmICh2YWxpZGF0aW9uSGFuZGxlciAmJiB2YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQpIHtcbiAgICBhZGRSYXRlTGltaXQoXG4gICAgICB7IHJlcXVlc3RQYXRoOiBgL2xvZ2luYCwgcmVxdWVzdE1ldGhvZHM6ICdQT1NUJywgLi4udmFsaWRhdGlvbkhhbmRsZXIucmF0ZUxpbWl0IH0sXG4gICAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH1cbn07XG5cbi8qKlxuICpcbiAqIFJlZ2lzdGVycyB0aGUgYWZ0ZXIgbG9naW4gZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogVGhpcyBmdW5jdGlvbiBpcyB0cmlnZ2VyZWQgYWZ0ZXIgYSB1c2VyIGxvZ3MgaW4gc3VjY2Vzc2Z1bGx5LFxuICogYW5kIGFmdGVyIGEgX1Nlc3Npb24gb2JqZWN0IGhhcyBiZWVuIGNyZWF0ZWQuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxvZ2luKChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyTG9naW5cbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyTG9naW5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGxvZ2luLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJMb2dpbiA9IGZ1bmN0aW9uIChoYW5kbGVyKSB7XG4gIGxldCBjbGFzc05hbWUgPSAnX1VzZXInO1xuICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdzdHJpbmcnIHx8IGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihoYW5kbGVyKSkge1xuICAgIC8vIHZhbGlkYXRpb24gd2lsbCBvY2N1ciBkb3duc3RyZWFtLCB0aGlzIGlzIHRvIG1haW50YWluIGludGVybmFsXG4gICAgLy8gY29kZSBjb25zaXN0ZW5jeSB3aXRoIHRoZSBvdGhlciBob29rIHR5cGVzLlxuICAgIGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShoYW5kbGVyKTtcbiAgICBoYW5kbGVyID0gYXJndW1lbnRzWzFdO1xuICB9XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYWZ0ZXJMb2dpbiwgY2xhc3NOYW1lLCBoYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbn07XG5cbi8qKlxuICpcbiAqIFJlZ2lzdGVycyB0aGUgYWZ0ZXIgbG9nb3V0IGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gaXMgdHJpZ2dlcmVkIGFmdGVyIGEgdXNlciBsb2dzIG91dC5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyTG9nb3V0KChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyTG9nb3V0XG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckxvZ291dFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgbG9nb3V0LiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJMb2dvdXQgPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICBsZXQgY2xhc3NOYW1lID0gJ19TZXNzaW9uJztcbiAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnc3RyaW5nJyB8fCBpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3IoaGFuZGxlcikpIHtcbiAgICAvLyB2YWxpZGF0aW9uIHdpbGwgb2NjdXIgZG93bnN0cmVhbSwgdGhpcyBpcyB0byBtYWludGFpbiBpbnRlcm5hbFxuICAgIC8vIGNvZGUgY29uc2lzdGVuY3kgd2l0aCB0aGUgb3RoZXIgaG9vayB0eXBlcy5cbiAgICBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUoaGFuZGxlcik7XG4gICAgaGFuZGxlciA9IGFyZ3VtZW50c1sxXTtcbiAgfVxuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKHRyaWdnZXJzLlR5cGVzLmFmdGVyTG9nb3V0LCBjbGFzc05hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgc2F2ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYWZ0ZXJTYXZlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlclNhdmUoJ015Q3VzdG9tQ2xhc3MnLCBhc3luYyBmdW5jdGlvbihyZXF1ZXN0KSB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZShQYXJzZS5Vc2VyLCBhc3luYyBmdW5jdGlvbihyZXF1ZXN0KSB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICogYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlclNhdmVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgc2F2ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIHNhdmUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlclNhdmUgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIGRlbGV0ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYWZ0ZXJEZWxldGUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGUoJ015Q3VzdG9tQ2xhc3MnLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZShQYXJzZS5Vc2VyLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckRlbGV0ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIGRlbGV0ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGRlbGV0ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyRGVsZXRlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRGVsZXRlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGZpbmQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZUZpbmQgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRmluZCgnTXlDdXN0b21DbGFzcycsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUZpbmQoUGFyc2UuVXNlciwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlRmluZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRmluZFxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYmVmb3JlIGZpbmQgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgZmluZC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkJlZm9yZUZpbmRSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuQmVmb3JlRmluZFJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZUZpbmQgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRmluZCxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG4gIGlmICh2YWxpZGF0aW9uSGFuZGxlciAmJiB2YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQpIHtcbiAgICBhZGRSYXRlTGltaXQoXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RQYXRoOiBnZXRSb3V0ZShjbGFzc05hbWUpLFxuICAgICAgICByZXF1ZXN0TWV0aG9kczogJ0dFVCcsXG4gICAgICAgIC4uLnZhbGlkYXRpb25IYW5kbGVyLnJhdGVMaW1pdCxcbiAgICAgIH0sXG4gICAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH1cbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIGZpbmQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGFmdGVyRmluZCBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckZpbmQoJ015Q3VzdG9tQ2xhc3MnLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckZpbmQoUGFyc2UuVXNlciwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJGaW5kXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckZpbmRcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIGZpbmQgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgZmluZC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkFmdGVyRmluZFJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5BZnRlckZpbmRSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckZpbmQgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIHNhdmUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZVNhdmVGaWxlXG4gKiBAZGVwcmVjYXRlZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZUZpbGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgc2F2aW5nIGEgZmlsZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlU2F2ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oe1xuICAgIHVzYWdlOiAnUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZUZpbGUnLFxuICAgIHNvbHV0aW9uOiAnVXNlIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmUoUGFyc2UuRmlsZSwgKHJlcXVlc3QpID0+IHt9KScsXG4gIH0pO1xuICBQYXJzZUNsb3VkLmJlZm9yZVNhdmUoUGFyc2UuRmlsZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgc2F2ZSBmaWxlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlclNhdmVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJTYXZlRmlsZVxuICogQGRlcHJlY2F0ZWRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZUZpbGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBzYXZpbmcgYSBmaWxlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlclNhdmVGaWxlID0gZnVuY3Rpb24gKGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICB1c2FnZTogJ1BhcnNlLkNsb3VkLmFmdGVyU2F2ZUZpbGUnLFxuICAgIHNvbHV0aW9uOiAnVXNlIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZShQYXJzZS5GaWxlLCAocmVxdWVzdCkgPT4ge30pJyxcbiAgfSk7XG4gIFBhcnNlQ2xvdWQuYWZ0ZXJTYXZlKFBhcnNlLkZpbGUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGRlbGV0ZSBmaWxlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZURlbGV0ZUZpbGVcbiAqIEBkZXByZWNhdGVkXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGVGaWxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGRlbGV0aW5nIGEgZmlsZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZSA9IGZ1bmN0aW9uIChoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgdXNhZ2U6ICdQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGVGaWxlJyxcbiAgICBzb2x1dGlvbjogJ1VzZSBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGUoUGFyc2UuRmlsZSwgKHJlcXVlc3QpID0+IHt9KScsXG4gIH0pO1xuICBQYXJzZUNsb3VkLmJlZm9yZURlbGV0ZShQYXJzZS5GaWxlLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcik7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBkZWxldGUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJEZWxldGVGaWxlXG4gKiBAZGVwcmVjYXRlZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBhZnRlciBiZWZvcmUgZGVsZXRpbmcgYSBmaWxlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckRlbGV0ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oe1xuICAgIHVzYWdlOiAnUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlJyxcbiAgICBzb2x1dGlvbjogJ1VzZSBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZShQYXJzZS5GaWxlLCAocmVxdWVzdCkgPT4ge30pJyxcbiAgfSk7XG4gIFBhcnNlQ2xvdWQuYWZ0ZXJEZWxldGUoUGFyc2UuRmlsZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgbGl2ZSBxdWVyeSBzZXJ2ZXIgY29ubmVjdCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUNvbm5lY3QoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlQ29ubmVjdChhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVDb25uZWN0XG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVDb25uZWN0XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBiZWZvcmUgY29ubmVjdGlvbiBpcyBtYWRlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuQ29ubmVjdFRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuQ29ubmVjdFRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVDb25uZWN0ID0gZnVuY3Rpb24gKGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkQ29ubmVjdFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlQ29ubmVjdCxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogU2VuZHMgYW4gZW1haWwgdGhyb3VnaCB0aGUgUGFyc2UgU2VydmVyIG1haWwgYWRhcHRlci5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqICoqUmVxdWlyZXMgYSBtYWlsIGFkYXB0ZXIgdG8gYmUgY29uZmlndXJlZCBmb3IgUGFyc2UgU2VydmVyLioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5zZW5kRW1haWwoe1xuICogICBmcm9tOiAnRXhhbXBsZSA8dGVzdEBleGFtcGxlLmNvbT4nLFxuICogICB0bzogJ2NvbnRhY3RAZXhhbXBsZS5jb20nLFxuICogICBzdWJqZWN0OiAnVGVzdCBlbWFpbCcsXG4gKiAgIHRleHQ6ICdUaGlzIGVtYWlsIGlzIGEgdGVzdC4nXG4gKiB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBzZW5kRW1haWxcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLnNlbmRFbWFpbFxuICogQHBhcmFtIHtPYmplY3R9IGRhdGEgVGhlIG9iamVjdCBvZiB0aGUgbWFpbCBkYXRhIHRvIHNlbmQuXG4gKi9cblBhcnNlQ2xvdWQuc2VuZEVtYWlsID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgY29uc3QgZW1haWxBZGFwdGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyLmFkYXB0ZXI7XG4gIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoXG4gICAgICAnRmFpbGVkIHRvIHNlbmQgZW1haWwgYmVjYXVzZSBubyBtYWlsIGFkYXB0ZXIgaXMgY29uZmlndXJlZCBmb3IgUGFyc2UgU2VydmVyLidcbiAgICApO1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gZW1haWxBZGFwdGVyLnNlbmRNYWlsKGRhdGEpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgbGl2ZSBxdWVyeSBzdWJzY3JpcHRpb24gZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZVN1YnNjcmliZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTdWJzY3JpYmUoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTdWJzY3JpYmUoUGFyc2UuVXNlciwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlU3Vic2NyaWJlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVTdWJzY3JpYmVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGJlZm9yZSBzdWJzY3JpcHRpb24gZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgc3Vic2NyaXB0aW9uLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciwgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlU3Vic2NyaWJlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVN1YnNjcmliZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG5QYXJzZUNsb3VkLm9uTGl2ZVF1ZXJ5RXZlbnQgPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICB0cmlnZ2Vycy5hZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBsaXZlIHF1ZXJ5IHNlcnZlciBldmVudCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyTGl2ZVF1ZXJ5RXZlbnQoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxpdmVRdWVyeUV2ZW50KCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJMaXZlUXVlcnlFdmVudFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJMaXZlUXVlcnlFdmVudFxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgbGl2ZSBxdWVyeSBldmVudCBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGxpdmUgcXVlcnkgZXZlbnQuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyLCBhIHtAbGluayBQYXJzZS5DbG91ZC5MaXZlUXVlcnlFdmVudFRyaWdnZXJ9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5MaXZlUXVlcnlFdmVudFRyaWdnZXJ9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyTGl2ZVF1ZXJ5RXZlbnQgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJFdmVudCxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG5QYXJzZUNsb3VkLl9yZW1vdmVBbGxIb29rcyA9ICgpID0+IHtcbiAgdHJpZ2dlcnMuX3VucmVnaXN0ZXJBbGwoKTtcbiAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgY29uZmlnPy51bnJlZ2lzdGVyUmF0ZUxpbWl0ZXJzKCk7XG59O1xuXG5QYXJzZUNsb3VkLnVzZU1hc3RlcktleSA9ICgpID0+IHtcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lXG4gIGNvbnNvbGUud2FybihcbiAgICAnUGFyc2UuQ2xvdWQudXNlTWFzdGVyS2V5IGlzIGRlcHJlY2F0ZWQgKGFuZCBoYXMgbm8gZWZmZWN0IGFueW1vcmUpIG9uIHBhcnNlLXNlcnZlciwgcGxlYXNlIHJlZmVyIHRvIHRoZSBjbG91ZCBjb2RlIG1pZ3JhdGlvbiBub3RlczogaHR0cDovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvcGFyc2Utc2VydmVyL2d1aWRlLyNtYXN0ZXIta2V5LW11c3QtYmUtcGFzc2VkLWV4cGxpY2l0bHknXG4gICk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBhcnNlQ2xvdWQ7XG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gaXNDaGFsbGVuZ2UgSWYgdHJ1ZSwgbWVhbnMgdGhlIGN1cnJlbnQgcmVxdWVzdCBpcyBvcmlnaW5hbGx5IHRyaWdnZXJlZCBieSBhbiBhdXRoIGNoYWxsZW5nZS5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuT2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LiBUbyBlbnN1cmUgcmV0cmlldmluZyB0aGUgY29ycmVjdCBJUCBhZGRyZXNzLCBzZXQgdGhlIFBhcnNlIFNlcnZlciBvcHRpb24gYHRydXN0UHJveHk6IHRydWVgIGlmIFBhcnNlIFNlcnZlciBydW5zIGJlaGluZCBhIHByb3h5IHNlcnZlciwgZm9yIGV4YW1wbGUgYmVoaW5kIGEgbG9hZCBiYWxhbmNlci5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBvcmlnaW5hbCBIVFRQIGhlYWRlcnMgZm9yIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRyaWdnZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSB0cmlnZ2VyIChgYmVmb3JlU2F2ZWAsIGBhZnRlclNhdmVgLCAuLi4pXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9yaWdpbmFsIElmIHNldCwgdGhlIG9iamVjdCwgYXMgY3VycmVudGx5IHN0b3JlZC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWcuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuRmlsZX0gZmlsZSBUaGUgZmlsZSB0aGF0IHRyaWdnZXJlZCB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gZmlsZVNpemUgVGhlIHNpemUgb2YgdGhlIGZpbGUgaW4gYnl0ZXMuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGNvbnRlbnRMZW5ndGggVGhlIHZhbHVlIGZyb20gQ29udGVudC1MZW5ndGggaGVhZGVyXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaXAgVGhlIElQIGFkZHJlc3Mgb2YgdGhlIGNsaWVudCBtYWtpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge09iamVjdH0gaGVhZGVycyBUaGUgb3JpZ2luYWwgSFRUUCBoZWFkZXJzIGZvciB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0cmlnZ2VyTmFtZSBUaGUgbmFtZSBvZiB0aGUgdHJpZ2dlciAoYGJlZm9yZVNhdmVGaWxlYCwgYGFmdGVyU2F2ZUZpbGVgKVxuICogQHByb3BlcnR5IHtPYmplY3R9IGxvZyBUaGUgY3VycmVudCBsb2dnZXIgaW5zaWRlIFBhcnNlIFNlcnZlci5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWcuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkNvbm5lY3RUcmlnZ2VyUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHVzZU1hc3RlcktleSBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gY2xpZW50cyBUaGUgbnVtYmVyIG9mIGNsaWVudHMgY29ubmVjdGVkLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBzdWJzY3JpcHRpb25zIFRoZSBudW1iZXIgb2Ygc3Vic2NyaXB0aW9ucyBjb25uZWN0ZWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gc2Vzc2lvblRva2VuIElmIHNldCwgdGhlIHNlc3Npb24gb2YgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5MaXZlUXVlcnlFdmVudFRyaWdnZXJcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSB1c2VNYXN0ZXJLZXkgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gc2Vzc2lvblRva2VuIElmIHNldCwgdGhlIHNlc3Npb24gb2YgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGV2ZW50IFRoZSBsaXZlIHF1ZXJ5IGV2ZW50IHRoYXQgdHJpZ2dlcmVkIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRyaWdnZXJpbmcgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge1BhcnNlLk9iamVjdH0gb3JpZ2luYWwgSWYgc2V0LCB0aGUgb2JqZWN0LCBhcyBjdXJyZW50bHkgc3RvcmVkLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBjbGllbnRzIFRoZSBudW1iZXIgb2YgY2xpZW50cyBjb25uZWN0ZWQuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IHN1YnNjcmlwdGlvbnMgVGhlIG51bWJlciBvZiBzdWJzY3JpcHRpb25zIGNvbm5lY3RlZC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gc2VuZEV2ZW50IElmIHRoZSBMaXZlUXVlcnkgZXZlbnQgc2hvdWxkIGJlIHNlbnQgdG8gdGhlIGNsaWVudC4gU2V0IHRvIGZhbHNlIHRvIHByZXZlbnQgTGl2ZVF1ZXJ5IGZyb20gcHVzaGluZyB0byB0aGUgY2xpZW50LlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5CZWZvcmVGaW5kUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuUXVlcnl9IHF1ZXJ5IFRoZSBxdWVyeSB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlYCwgYGFmdGVyU2F2ZWAsIC4uLilcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IGlzR2V0IHdldGhlciB0aGUgcXVlcnkgYSBgZ2V0YCBvciBhIGBmaW5kYFxuICogQHByb3BlcnR5IHtPYmplY3R9IGNvbmZpZyBUaGUgUGFyc2UgU2VydmVyIGNvbmZpZy5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuQWZ0ZXJGaW5kUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuUXVlcnl9IHF1ZXJ5IFRoZSBxdWVyeSB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtBcnJheTxQYXJzZS5PYmplY3Q+fSByZXN1bHRzIFRoZSByZXN1bHRzIHRoZSBxdWVyeSB5aWVsZGVkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlYCwgYGFmdGVyU2F2ZWAsIC4uLilcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5GdW5jdGlvblJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbXMgcGFzc2VkIHRvIHRoZSBjbG91ZCBmdW5jdGlvbi5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWcuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkpvYlJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtcyBwYXNzZWQgdG8gdGhlIGJhY2tncm91bmQgam9iLlxuICogQHByb3BlcnR5IHtmdW5jdGlvbn0gbWVzc2FnZSBJZiBtZXNzYWdlIGlzIGNhbGxlZCB3aXRoIGEgc3RyaW5nIGFyZ3VtZW50LCB3aWxsIHVwZGF0ZSB0aGUgY3VycmVudCBtZXNzYWdlIHRvIGJlIHN0b3JlZCBpbiB0aGUgam9iIHN0YXR1cy5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWcuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdFxuICogQHByb3BlcnR5IHtCb29sZWFufSByZXF1aXJlVXNlciB3aGV0aGVyIHRoZSBjbG91ZCB0cmlnZ2VyIHJlcXVpcmVzIGEgdXNlci5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gcmVxdWlyZU1hc3RlciB3aGV0aGVyIHRoZSBjbG91ZCB0cmlnZ2VyIHJlcXVpcmVzIGEgbWFzdGVyIGtleS5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gdmFsaWRhdGVNYXN0ZXJLZXkgd2hldGhlciB0aGUgdmFsaWRhdG9yIHNob3VsZCBydW4gaWYgbWFzdGVyS2V5IGlzIHByb3ZpZGVkLiBEZWZhdWx0cyB0byBmYWxzZS5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gc2tpcFdpdGhNYXN0ZXJLZXkgd2hldGhlciB0aGUgY2xvdWQgY29kZSBmdW5jdGlvbiBzaG91bGQgYmUgaWdub3JlZCB1c2luZyBhIG1hc3RlcktleS5cbiAqXG4gKiBAcHJvcGVydHkge0FycmF5PFN0cmluZz58T2JqZWN0fSByZXF1aXJlVXNlcktleXMgSWYgc2V0LCBrZXlzIHJlcXVpcmVkIG9uIHJlcXVlc3QudXNlciB0byBtYWtlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHJlcXVpcmVVc2VyS2V5cy5maWVsZCBJZiByZXF1aXJlVXNlcktleXMgaXMgYW4gb2JqZWN0LCBuYW1lIG9mIGZpZWxkIHRvIHZhbGlkYXRlIG9uIHJlcXVlc3QgdXNlclxuICogQHByb3BlcnR5IHtBcnJheXxmdW5jdGlvbnxBbnl9IHJlcXVpcmVVc2VyS2V5cy5maWVsZC5vcHRpb25zIGFycmF5IG9mIG9wdGlvbnMgdGhhdCB0aGUgZmllbGQgY2FuIGJlLCBmdW5jdGlvbiB0byB2YWxpZGF0ZSBmaWVsZCwgb3Igc2luZ2xlIHZhbHVlLiBUaHJvdyBhbiBlcnJvciBpZiB2YWx1ZSBpcyBpbnZhbGlkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHJlcXVpcmVVc2VyS2V5cy5maWVsZC5lcnJvciBjdXN0b20gZXJyb3IgbWVzc2FnZSBpZiBmaWVsZCBpcyBpbnZhbGlkLlxuICpcbiAqIEBwcm9wZXJ0eSB7QXJyYXk8U3RyaW5nPnxmdW5jdGlvbn1yZXF1aXJlQW55VXNlclJvbGVzIElmIHNldCwgcmVxdWVzdC51c2VyIGhhcyB0byBiZSBwYXJ0IG9mIGF0IGxlYXN0IG9uZSByb2xlcyBuYW1lIHRvIG1ha2UgdGhlIHJlcXVlc3QuIElmIHNldCB0byBhIGZ1bmN0aW9uLCBmdW5jdGlvbiBtdXN0IHJldHVybiByb2xlIG5hbWVzLlxuICogQHByb3BlcnR5IHtBcnJheTxTdHJpbmc+fGZ1bmN0aW9ufXJlcXVpcmVBbGxVc2VyUm9sZXMgSWYgc2V0LCByZXF1ZXN0LnVzZXIgaGFzIHRvIGJlIHBhcnQgYWxsIHJvbGVzIG5hbWUgdG8gbWFrZSB0aGUgcmVxdWVzdC4gSWYgc2V0IHRvIGEgZnVuY3Rpb24sIGZ1bmN0aW9uIG11c3QgcmV0dXJuIHJvbGUgbmFtZXMuXG4gKlxuICogQHByb3BlcnR5IHtPYmplY3R8QXJyYXk8U3RyaW5nPn0gZmllbGRzIGlmIGFuIGFycmF5IG9mIHN0cmluZ3MsIHZhbGlkYXRvciB3aWxsIGxvb2sgZm9yIGtleXMgaW4gcmVxdWVzdC5wYXJhbXMsIGFuZCB0aHJvdyBpZiBub3QgcHJvdmlkZWQuIElmIE9iamVjdCwgZmllbGRzIHRvIHZhbGlkYXRlLiBJZiB0aGUgdHJpZ2dlciBpcyBhIGNsb3VkIGZ1bmN0aW9uLCBgcmVxdWVzdC5wYXJhbXNgIHdpbGwgYmUgdmFsaWRhdGVkLCBvdGhlcndpc2UgYHJlcXVlc3Qub2JqZWN0YC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBmaWVsZHMuZmllbGQgbmFtZSBvZiBmaWVsZCB0byB2YWxpZGF0ZS5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBmaWVsZHMuZmllbGQudHlwZSBleHBlY3RlZCB0eXBlIG9mIGRhdGEgZm9yIGZpZWxkLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBmaWVsZHMuZmllbGQuY29uc3RhbnQgd2hldGhlciB0aGUgZmllbGQgY2FuIGJlIG1vZGlmaWVkIG9uIHRoZSBvYmplY3QuXG4gKiBAcHJvcGVydHkge0FueX0gZmllbGRzLmZpZWxkLmRlZmF1bHQgZGVmYXVsdCB2YWx1ZSBpZiBmaWVsZCBpcyBgbnVsbGAsIG9yIGluaXRpYWwgdmFsdWUgYGNvbnN0YW50YCBpcyBgdHJ1ZWAuXG4gKiBAcHJvcGVydHkge0FycmF5fGZ1bmN0aW9ufEFueX0gZmllbGRzLmZpZWxkLm9wdGlvbnMgYXJyYXkgb2Ygb3B0aW9ucyB0aGF0IHRoZSBmaWVsZCBjYW4gYmUsIGZ1bmN0aW9uIHRvIHZhbGlkYXRlIGZpZWxkLCBvciBzaW5nbGUgdmFsdWUuIFRocm93IGFuIGVycm9yIGlmIHZhbHVlIGlzIGludmFsaWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gZmllbGRzLmZpZWxkLmVycm9yIGN1c3RvbSBlcnJvciBtZXNzYWdlIGlmIGZpZWxkIGlzIGludmFsaWQuXG4gKi9cbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUE4QztBQUFBO0FBQUE7QUFBQTtB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QUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQVIsVUFBVSxDQUFDbUQsbUJBQW1CLEdBQUcsVUFBVXZELFVBQVUsRUFBRU8sT0FBTyxFQUFFQyxpQkFBaUIsRUFBRTtFQUNqRixNQUFNVSxTQUFTLEdBQUdULFFBQVEsQ0FBQ1UsWUFBWSxDQUFDbkIsVUFBVSxDQUFDO0VBQ25EekMsaUJBQWlCLENBQUNpRCxpQkFBaUIsQ0FBQztFQUNwQ0MsUUFBUSxDQUFDVyxVQUFVLENBQ2pCWCxRQUFRLENBQUNZLEtBQUssQ0FBQ21DLFVBQVUsRUFDekJ0QyxTQUFTLEVBQ1RYLE9BQU8sRUFDUEksV0FBSyxDQUFDQyxhQUFhLEVBQ25CSixpQkFBaUIsQ0FDbEI7QUFDSCxDQUFDO0FBRURKLFVBQVUsQ0FBQ3FELGVBQWUsR0FBRyxNQUFNO0VBQ2pDaEQsUUFBUSxDQUFDaUQsY0FBYyxFQUFFO0VBQ3pCLE1BQU1iLE1BQU0sR0FBRzlGLE1BQU0sQ0FBQytGLEdBQUcsQ0FBQ25DLFdBQUssQ0FBQ0MsYUFBYSxDQUFDO0VBQzlDaUMsTUFBTSxhQUFOQSxNQUFNLHVCQUFOQSxNQUFNLENBQUVjLHNCQUFzQixFQUFFO0FBQ2xDLENBQUM7QUFFRHZELFVBQVUsQ0FBQ3dELFlBQVksR0FBRyxNQUFNO0VBQzlCO0VBQ0FDLE9BQU8sQ0FBQ0MsSUFBSSxDQUNWLDROQUE0TixDQUM3TjtBQUNILENBQUM7QUFFREMsTUFBTSxDQUFDQyxPQUFPLEdBQUc1RCxVQUFVOztBQUUzQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EifQ==