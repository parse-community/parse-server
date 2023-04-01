"use strict";

var _node = require("parse/node");
var triggers = _interopRequireWildcard(require("../triggers"));
var _Deprecator = _interopRequireDefault(require("../Deprecator/Deprecator"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
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
    fields: [Array, Object]
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
ParseCloud.beforeLogin = function (handler) {
  let className = '_User';
  if (typeof handler === 'string' || isParseObjectConstructor(handler)) {
    // validation will occur downstream, this is to maintain internal
    // code consistency with the other hook types.
    className = triggers.getClassName(handler);
    handler = arguments[1];
  }
  triggers.addTrigger(triggers.Types.beforeLogin, className, handler, _node.Parse.applicationId);
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
};
ParseCloud.useMasterKey = () => {
  // eslint-disable-next-line
  console.warn('Parse.Cloud.useMasterKey is deprecated (and has no effect anymore) on parse-server, please refer to the cloud code migration notes: http://docs.parseplatform.org/parse-server/guide/#master-key-must-be-passed-explicitly');
};
const request = require('./httpRequest');
ParseCloud.httpRequest = opts => {
  _Deprecator.default.logRuntimeDeprecation({
    usage: 'Parse.Cloud.httpRequest',
    solution: 'Use a http request library instead.'
  });
  return request(opts);
};
module.exports = ParseCloud;

/**
 * @interface Parse.Cloud.TriggerRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Boolean} isChallenge If true, means the current request is originally triggered by an auth challenge.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Parse.Object} object The object triggering the hook.
 * @property {String} ip The IP address of the client making the request.
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsInJlcXVpcmUiLCJ0cmlnZ2VycyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0RlcHJlY2F0b3IiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0Iiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJfZ2V0UmVxdWlyZVdpbGRjYXJkQ2FjaGUiLCJub2RlSW50ZXJvcCIsIldlYWtNYXAiLCJjYWNoZUJhYmVsSW50ZXJvcCIsImNhY2hlTm9kZUludGVyb3AiLCJjYWNoZSIsImhhcyIsImdldCIsIm5ld09iaiIsImhhc1Byb3BlcnR5RGVzY3JpcHRvciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZGVzYyIsInNldCIsIkNvbmZpZyIsImlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvciIsIm9iamVjdCIsInZhbGlkYXRlVmFsaWRhdG9yIiwidmFsaWRhdG9yIiwiZmllbGRPcHRpb25zIiwidHlwZSIsImNvbnN0YW50IiwiQm9vbGVhbiIsIm9wdGlvbnMiLCJBcnJheSIsInJlcXVpcmVkIiwiZXJyb3IiLCJTdHJpbmciLCJhbGxvd2VkS2V5cyIsInJlcXVpcmVVc2VyIiwicmVxdWlyZUFueVVzZXJSb2xlcyIsInJlcXVpcmVBbGxVc2VyUm9sZXMiLCJyZXF1aXJlTWFzdGVyIiwidmFsaWRhdGVNYXN0ZXJLZXkiLCJza2lwV2l0aE1hc3RlcktleSIsInJlcXVpcmVVc2VyS2V5cyIsImZpZWxkcyIsImdldFR5cGUiLCJmbiIsImlzQXJyYXkiLCJtYXRjaCIsInRvU3RyaW5nIiwidG9Mb3dlckNhc2UiLCJjaGVja0tleSIsImRhdGEiLCJ2YWxpZGF0b3JQYXJhbSIsInBhcmFtZXRlciIsInR5cGVzIiwibWFwIiwiaW5jbHVkZXMiLCJqb2luIiwidmFsdWVzIiwidmFsdWUiLCJzdWJLZXkiLCJQYXJzZUNsb3VkIiwiZGVmaW5lIiwiZnVuY3Rpb25OYW1lIiwiaGFuZGxlciIsInZhbGlkYXRpb25IYW5kbGVyIiwiYWRkRnVuY3Rpb24iLCJQYXJzZSIsImFwcGxpY2F0aW9uSWQiLCJqb2IiLCJhZGRKb2IiLCJiZWZvcmVTYXZlIiwicGFyc2VDbGFzcyIsImNsYXNzTmFtZSIsImdldENsYXNzTmFtZSIsImFkZFRyaWdnZXIiLCJUeXBlcyIsImJlZm9yZURlbGV0ZSIsImJlZm9yZUxvZ2luIiwiYXJndW1lbnRzIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYWZ0ZXJTYXZlIiwiYWZ0ZXJEZWxldGUiLCJiZWZvcmVGaW5kIiwiYWZ0ZXJGaW5kIiwiYmVmb3JlU2F2ZUZpbGUiLCJEZXByZWNhdG9yIiwibG9nUnVudGltZURlcHJlY2F0aW9uIiwidXNhZ2UiLCJzb2x1dGlvbiIsIkZpbGUiLCJhZnRlclNhdmVGaWxlIiwiYmVmb3JlRGVsZXRlRmlsZSIsImFmdGVyRGVsZXRlRmlsZSIsImJlZm9yZUNvbm5lY3QiLCJhZGRDb25uZWN0VHJpZ2dlciIsInNlbmRFbWFpbCIsImNvbmZpZyIsImVtYWlsQWRhcHRlciIsInVzZXJDb250cm9sbGVyIiwiYWRhcHRlciIsImxvZ2dlckNvbnRyb2xsZXIiLCJzZW5kTWFpbCIsImJlZm9yZVN1YnNjcmliZSIsIm9uTGl2ZVF1ZXJ5RXZlbnQiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJhZnRlckxpdmVRdWVyeUV2ZW50IiwiYWZ0ZXJFdmVudCIsIl9yZW1vdmVBbGxIb29rcyIsIl91bnJlZ2lzdGVyQWxsIiwidXNlTWFzdGVyS2V5IiwiY29uc29sZSIsIndhcm4iLCJyZXF1ZXN0IiwiaHR0cFJlcXVlc3QiLCJvcHRzIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgKiBhcyB0cmlnZ2VycyBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuY29uc3QgQ29uZmlnID0gcmVxdWlyZSgnLi4vQ29uZmlnJyk7XG5cbmZ1bmN0aW9uIGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihvYmplY3QpIHtcbiAgcmV0dXJuIHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwgJ2NsYXNzTmFtZScpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0b3IpIHtcbiAgaWYgKCF2YWxpZGF0b3IgfHwgdHlwZW9mIHZhbGlkYXRvciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBmaWVsZE9wdGlvbnMgPSB7XG4gICAgdHlwZTogWydBbnknXSxcbiAgICBjb25zdGFudDogW0Jvb2xlYW5dLFxuICAgIGRlZmF1bHQ6IFsnQW55J10sXG4gICAgb3B0aW9uczogW0FycmF5LCAnZnVuY3Rpb24nLCAnQW55J10sXG4gICAgcmVxdWlyZWQ6IFtCb29sZWFuXSxcbiAgICBlcnJvcjogW1N0cmluZ10sXG4gIH07XG4gIGNvbnN0IGFsbG93ZWRLZXlzID0ge1xuICAgIHJlcXVpcmVVc2VyOiBbQm9vbGVhbl0sXG4gICAgcmVxdWlyZUFueVVzZXJSb2xlczogW0FycmF5LCAnZnVuY3Rpb24nXSxcbiAgICByZXF1aXJlQWxsVXNlclJvbGVzOiBbQXJyYXksICdmdW5jdGlvbiddLFxuICAgIHJlcXVpcmVNYXN0ZXI6IFtCb29sZWFuXSxcbiAgICB2YWxpZGF0ZU1hc3RlcktleTogW0Jvb2xlYW5dLFxuICAgIHNraXBXaXRoTWFzdGVyS2V5OiBbQm9vbGVhbl0sXG4gICAgcmVxdWlyZVVzZXJLZXlzOiBbQXJyYXksIE9iamVjdF0sXG4gICAgZmllbGRzOiBbQXJyYXksIE9iamVjdF0sXG4gIH07XG4gIGNvbnN0IGdldFR5cGUgPSBmbiA9PiB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZm4pKSB7XG4gICAgICByZXR1cm4gJ2FycmF5JztcbiAgICB9XG4gICAgaWYgKGZuID09PSAnQW55JyB8fCBmbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmV0dXJuIGZuO1xuICAgIH1cbiAgICBjb25zdCB0eXBlID0gdHlwZW9mIGZuO1xuICAgIGlmICh0eXBlb2YgZm4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gZm4gJiYgZm4udG9TdHJpbmcoKS5tYXRjaCgvXlxccypmdW5jdGlvbiAoXFx3KykvKTtcbiAgICAgIHJldHVybiAobWF0Y2ggPyBtYXRjaFsxXSA6ICdmdW5jdGlvbicpLnRvTG93ZXJDYXNlKCk7XG4gICAgfVxuICAgIHJldHVybiB0eXBlO1xuICB9O1xuICBjb25zdCBjaGVja0tleSA9IChrZXksIGRhdGEsIHZhbGlkYXRvclBhcmFtKSA9PiB7XG4gICAgY29uc3QgcGFyYW1ldGVyID0gZGF0YVtrZXldO1xuICAgIGlmICghcGFyYW1ldGVyKSB7XG4gICAgICB0aHJvdyBgJHtrZXl9IGlzIG5vdCBhIHN1cHBvcnRlZCBwYXJhbWV0ZXIgZm9yIENsb3VkIEZ1bmN0aW9uIHZhbGlkYXRpb25zLmA7XG4gICAgfVxuICAgIGNvbnN0IHR5cGVzID0gcGFyYW1ldGVyLm1hcCh0eXBlID0+IGdldFR5cGUodHlwZSkpO1xuICAgIGNvbnN0IHR5cGUgPSBnZXRUeXBlKHZhbGlkYXRvclBhcmFtKTtcbiAgICBpZiAoIXR5cGVzLmluY2x1ZGVzKHR5cGUpICYmICF0eXBlcy5pbmNsdWRlcygnQW55JykpIHtcbiAgICAgIHRocm93IGBJbnZhbGlkIHR5cGUgZm9yIENsb3VkIEZ1bmN0aW9uIHZhbGlkYXRpb24ga2V5ICR7a2V5fS4gRXhwZWN0ZWQgJHt0eXBlcy5qb2luKFxuICAgICAgICAnfCdcbiAgICAgICl9LCBhY3R1YWwgJHt0eXBlfWA7XG4gICAgfVxuICB9O1xuICBmb3IgKGNvbnN0IGtleSBpbiB2YWxpZGF0b3IpIHtcbiAgICBjaGVja0tleShrZXksIGFsbG93ZWRLZXlzLCB2YWxpZGF0b3Jba2V5XSk7XG4gICAgaWYgKGtleSA9PT0gJ2ZpZWxkcycgfHwga2V5ID09PSAncmVxdWlyZVVzZXJLZXlzJykge1xuICAgICAgY29uc3QgdmFsdWVzID0gdmFsaWRhdG9yW2tleV07XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZXMpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCB2YWx1ZSBpbiB2YWx1ZXMpIHtcbiAgICAgICAgY29uc3QgZGF0YSA9IHZhbHVlc1t2YWx1ZV07XG4gICAgICAgIGZvciAoY29uc3Qgc3ViS2V5IGluIGRhdGEpIHtcbiAgICAgICAgICBjaGVja0tleShzdWJLZXksIGZpZWxkT3B0aW9ucywgZGF0YVtzdWJLZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuLyoqIEBuYW1lc3BhY2VcbiAqIEBuYW1lIFBhcnNlXG4gKiBAZGVzY3JpcHRpb24gVGhlIFBhcnNlIFNESy5cbiAqICBzZWUgW2FwaSBkb2NzXShodHRwczovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvanMvYXBpKSBhbmQgW2d1aWRlXShodHRwczovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvanMvZ3VpZGUpXG4gKi9cblxuLyoqIEBuYW1lc3BhY2VcbiAqIEBuYW1lIFBhcnNlLkNsb3VkXG4gKiBAbWVtYmVyb2YgUGFyc2VcbiAqIEBkZXNjcmlwdGlvbiBUaGUgUGFyc2UgQ2xvdWQgQ29kZSBTREsuXG4gKi9cblxudmFyIFBhcnNlQ2xvdWQgPSB7fTtcbi8qKlxuICogRGVmaW5lcyBhIENsb3VkIEZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuZGVmaW5lKCdmdW5jdGlvbk5hbWUnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5kZWZpbmUoJ2Z1bmN0aW9uTmFtZScsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICogYGBgXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlcm9mIFBhcnNlLkNsb3VkXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgQ2xvdWQgRnVuY3Rpb25cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRhdGEgVGhlIENsb3VkIEZ1bmN0aW9uIHRvIHJlZ2lzdGVyLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GdW5jdGlvblJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GdW5jdGlvblJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmRlZmluZSA9IGZ1bmN0aW9uIChmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG4vKipcbiAqIERlZmluZXMgYSBCYWNrZ3JvdW5kIEpvYi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBAbWV0aG9kIGpvYlxuICogQG5hbWUgUGFyc2UuQ2xvdWQuam9iXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgQmFja2dyb3VuZCBKb2JcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIEJhY2tncm91bmQgSm9iIHRvIHJlZ2lzdGVyLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBzaG91bGQgdGFrZSBhIHNpbmdsZSBwYXJhbWV0ZXJzIGEge0BsaW5rIFBhcnNlLkNsb3VkLkpvYlJlcXVlc3R9XG4gKlxuICovXG5QYXJzZUNsb3VkLmpvYiA9IGZ1bmN0aW9uIChmdW5jdGlvbk5hbWUsIGhhbmRsZXIpIHtcbiAgdHJpZ2dlcnMuYWRkSm9iKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG4vKipcbiAqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgc2F2ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYmVmb3JlU2F2ZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZSgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmUoUGFyc2UuVXNlciwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSlcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlU2F2ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgc2F2ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBzYXZlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVTYXZlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgZGVsZXRlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBiZWZvcmVEZWxldGUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlKCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlKFBhcnNlLlVzZXIsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pXG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlRGVsZXRlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGJlZm9yZSBkZWxldGUgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgZGVsZXRlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciwgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlRGVsZXRlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZURlbGV0ZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqXG4gKiBSZWdpc3RlcnMgdGhlIGJlZm9yZSBsb2dpbiBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIHByb3ZpZGVzIGZ1cnRoZXIgY29udHJvbFxuICogaW4gdmFsaWRhdGluZyBhIGxvZ2luIGF0dGVtcHQuIFNwZWNpZmljYWxseSxcbiAqIGl0IGlzIHRyaWdnZXJlZCBhZnRlciBhIHVzZXIgZW50ZXJzXG4gKiBjb3JyZWN0IGNyZWRlbnRpYWxzIChvciBvdGhlciB2YWxpZCBhdXRoRGF0YSksXG4gKiBidXQgcHJpb3IgdG8gYSBzZXNzaW9uIGJlaW5nIGdlbmVyYXRlZC5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUxvZ2luKChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSlcbiAqXG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZUxvZ2luXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVMb2dpblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGxvZ2luLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlTG9naW4gPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICBsZXQgY2xhc3NOYW1lID0gJ19Vc2VyJztcbiAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnc3RyaW5nJyB8fCBpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3IoaGFuZGxlcikpIHtcbiAgICAvLyB2YWxpZGF0aW9uIHdpbGwgb2NjdXIgZG93bnN0cmVhbSwgdGhpcyBpcyB0byBtYWludGFpbiBpbnRlcm5hbFxuICAgIC8vIGNvZGUgY29uc2lzdGVuY3kgd2l0aCB0aGUgb3RoZXIgaG9vayB0eXBlcy5cbiAgICBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUoaGFuZGxlcik7XG4gICAgaGFuZGxlciA9IGFyZ3VtZW50c1sxXTtcbiAgfVxuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLCBjbGFzc05hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIHRoZSBhZnRlciBsb2dpbiBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIGlzIHRyaWdnZXJlZCBhZnRlciBhIHVzZXIgbG9ncyBpbiBzdWNjZXNzZnVsbHksXG4gKiBhbmQgYWZ0ZXIgYSBfU2Vzc2lvbiBvYmplY3QgaGFzIGJlZW4gY3JlYXRlZC5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyTG9naW4oKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJMb2dpblxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJMb2dpblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgbG9naW4uIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fTtcbiAqL1xuUGFyc2VDbG91ZC5hZnRlckxvZ2luID0gZnVuY3Rpb24gKGhhbmRsZXIpIHtcbiAgbGV0IGNsYXNzTmFtZSA9ICdfVXNlcic7XG4gIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ3N0cmluZycgfHwgaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yKGhhbmRsZXIpKSB7XG4gICAgLy8gdmFsaWRhdGlvbiB3aWxsIG9jY3VyIGRvd25zdHJlYW0sIHRoaXMgaXMgdG8gbWFpbnRhaW4gaW50ZXJuYWxcbiAgICAvLyBjb2RlIGNvbnNpc3RlbmN5IHdpdGggdGhlIG90aGVyIGhvb2sgdHlwZXMuXG4gICAgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKGhhbmRsZXIpO1xuICAgIGhhbmRsZXIgPSBhcmd1bWVudHNbMV07XG4gIH1cbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcih0cmlnZ2Vycy5UeXBlcy5hZnRlckxvZ2luLCBjbGFzc05hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIHRoZSBhZnRlciBsb2dvdXQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogVGhpcyBmdW5jdGlvbiBpcyB0cmlnZ2VyZWQgYWZ0ZXIgYSB1c2VyIGxvZ3Mgb3V0LlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJMb2dvdXQoKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJMb2dvdXRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyTG9nb3V0XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgYSBsb2dvdXQuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fTtcbiAqL1xuUGFyc2VDbG91ZC5hZnRlckxvZ291dCA9IGZ1bmN0aW9uIChoYW5kbGVyKSB7XG4gIGxldCBjbGFzc05hbWUgPSAnX1Nlc3Npb24nO1xuICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdzdHJpbmcnIHx8IGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihoYW5kbGVyKSkge1xuICAgIC8vIHZhbGlkYXRpb24gd2lsbCBvY2N1ciBkb3duc3RyZWFtLCB0aGlzIGlzIHRvIG1haW50YWluIGludGVybmFsXG4gICAgLy8gY29kZSBjb25zaXN0ZW5jeSB3aXRoIHRoZSBvdGhlciBob29rIHR5cGVzLlxuICAgIGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShoYW5kbGVyKTtcbiAgICBoYW5kbGVyID0gYXJndW1lbnRzWzFdO1xuICB9XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYWZ0ZXJMb2dvdXQsIGNsYXNzTmFtZSwgaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBzYXZlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBhZnRlclNhdmUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZSgnTXlDdXN0b21DbGFzcycsIGFzeW5jIGZ1bmN0aW9uKHJlcXVlc3QpIHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlKFBhcnNlLlVzZXIsIGFzeW5jIGZ1bmN0aW9uKHJlcXVlc3QpIHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyU2F2ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBhZnRlciBzYXZlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgc2F2ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyU2F2ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgZGVsZXRlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBhZnRlckRlbGV0ZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZSgnTXlDdXN0b21DbGFzcycsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlKFBhcnNlLlVzZXIsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyRGVsZXRlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgZGVsZXRlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgZGVsZXRlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJEZWxldGUgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJEZWxldGUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgZmluZCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYmVmb3JlRmluZCBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVGaW5kKCdNeUN1c3RvbUNsYXNzJywgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRmluZChQYXJzZS5Vc2VyLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVGaW5kXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVGaW5kXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBiZWZvcmUgZmluZCBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBmaW5kLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuQmVmb3JlRmluZFJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5CZWZvcmVGaW5kUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlRmluZCA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVGaW5kLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIGZpbmQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGFmdGVyRmluZCBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckZpbmQoJ015Q3VzdG9tQ2xhc3MnLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckZpbmQoUGFyc2UuVXNlciwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJGaW5kXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckZpbmRcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIGZpbmQgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgZmluZC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkFmdGVyRmluZFJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5BZnRlckZpbmRSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckZpbmQgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIHNhdmUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZVNhdmVGaWxlXG4gKiBAZGVwcmVjYXRlZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZUZpbGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgc2F2aW5nIGEgZmlsZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlU2F2ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oe1xuICAgIHVzYWdlOiAnUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZUZpbGUnLFxuICAgIHNvbHV0aW9uOiAnVXNlIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmUoUGFyc2UuRmlsZSwgKHJlcXVlc3QpID0+IHt9KScsXG4gIH0pO1xuICBQYXJzZUNsb3VkLmJlZm9yZVNhdmUoUGFyc2UuRmlsZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgc2F2ZSBmaWxlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlclNhdmVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJTYXZlRmlsZVxuICogQGRlcHJlY2F0ZWRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZUZpbGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBzYXZpbmcgYSBmaWxlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlclNhdmVGaWxlID0gZnVuY3Rpb24gKGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICB1c2FnZTogJ1BhcnNlLkNsb3VkLmFmdGVyU2F2ZUZpbGUnLFxuICAgIHNvbHV0aW9uOiAnVXNlIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZShQYXJzZS5GaWxlLCAocmVxdWVzdCkgPT4ge30pJyxcbiAgfSk7XG4gIFBhcnNlQ2xvdWQuYWZ0ZXJTYXZlKFBhcnNlLkZpbGUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGRlbGV0ZSBmaWxlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZURlbGV0ZUZpbGVcbiAqIEBkZXByZWNhdGVkXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGVGaWxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGRlbGV0aW5nIGEgZmlsZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZSA9IGZ1bmN0aW9uIChoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgdXNhZ2U6ICdQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGVGaWxlJyxcbiAgICBzb2x1dGlvbjogJ1VzZSBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGUoUGFyc2UuRmlsZSwgKHJlcXVlc3QpID0+IHt9KScsXG4gIH0pO1xuICBQYXJzZUNsb3VkLmJlZm9yZURlbGV0ZShQYXJzZS5GaWxlLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcik7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBkZWxldGUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJEZWxldGVGaWxlXG4gKiBAZGVwcmVjYXRlZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBhZnRlciBiZWZvcmUgZGVsZXRpbmcgYSBmaWxlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckRlbGV0ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oe1xuICAgIHVzYWdlOiAnUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlJyxcbiAgICBzb2x1dGlvbjogJ1VzZSBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZShQYXJzZS5GaWxlLCAocmVxdWVzdCkgPT4ge30pJyxcbiAgfSk7XG4gIFBhcnNlQ2xvdWQuYWZ0ZXJEZWxldGUoUGFyc2UuRmlsZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgbGl2ZSBxdWVyeSBzZXJ2ZXIgY29ubmVjdCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUNvbm5lY3QoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlQ29ubmVjdChhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVDb25uZWN0XG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVDb25uZWN0XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBiZWZvcmUgY29ubmVjdGlvbiBpcyBtYWRlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuQ29ubmVjdFRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuQ29ubmVjdFRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVDb25uZWN0ID0gZnVuY3Rpb24gKGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkQ29ubmVjdFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlQ29ubmVjdCxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogU2VuZHMgYW4gZW1haWwgdGhyb3VnaCB0aGUgUGFyc2UgU2VydmVyIG1haWwgYWRhcHRlci5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqICoqUmVxdWlyZXMgYSBtYWlsIGFkYXB0ZXIgdG8gYmUgY29uZmlndXJlZCBmb3IgUGFyc2UgU2VydmVyLioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5zZW5kRW1haWwoe1xuICogICBmcm9tOiAnRXhhbXBsZSA8dGVzdEBleGFtcGxlLmNvbT4nLFxuICogICB0bzogJ2NvbnRhY3RAZXhhbXBsZS5jb20nLFxuICogICBzdWJqZWN0OiAnVGVzdCBlbWFpbCcsXG4gKiAgIHRleHQ6ICdUaGlzIGVtYWlsIGlzIGEgdGVzdC4nXG4gKiB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBzZW5kRW1haWxcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLnNlbmRFbWFpbFxuICogQHBhcmFtIHtPYmplY3R9IGRhdGEgVGhlIG9iamVjdCBvZiB0aGUgbWFpbCBkYXRhIHRvIHNlbmQuXG4gKi9cblBhcnNlQ2xvdWQuc2VuZEVtYWlsID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgY29uc3QgZW1haWxBZGFwdGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyLmFkYXB0ZXI7XG4gIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoXG4gICAgICAnRmFpbGVkIHRvIHNlbmQgZW1haWwgYmVjYXVzZSBubyBtYWlsIGFkYXB0ZXIgaXMgY29uZmlndXJlZCBmb3IgUGFyc2UgU2VydmVyLidcbiAgICApO1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gZW1haWxBZGFwdGVyLnNlbmRNYWlsKGRhdGEpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgbGl2ZSBxdWVyeSBzdWJzY3JpcHRpb24gZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZVN1YnNjcmliZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTdWJzY3JpYmUoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTdWJzY3JpYmUoUGFyc2UuVXNlciwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlU3Vic2NyaWJlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVTdWJzY3JpYmVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGJlZm9yZSBzdWJzY3JpcHRpb24gZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgc3Vic2NyaXB0aW9uLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciwgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlU3Vic2NyaWJlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVN1YnNjcmliZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG5QYXJzZUNsb3VkLm9uTGl2ZVF1ZXJ5RXZlbnQgPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICB0cmlnZ2Vycy5hZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBsaXZlIHF1ZXJ5IHNlcnZlciBldmVudCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyTGl2ZVF1ZXJ5RXZlbnQoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxpdmVRdWVyeUV2ZW50KCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJMaXZlUXVlcnlFdmVudFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJMaXZlUXVlcnlFdmVudFxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgbGl2ZSBxdWVyeSBldmVudCBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGxpdmUgcXVlcnkgZXZlbnQuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyLCBhIHtAbGluayBQYXJzZS5DbG91ZC5MaXZlUXVlcnlFdmVudFRyaWdnZXJ9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5MaXZlUXVlcnlFdmVudFRyaWdnZXJ9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyTGl2ZVF1ZXJ5RXZlbnQgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJFdmVudCxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG5QYXJzZUNsb3VkLl9yZW1vdmVBbGxIb29rcyA9ICgpID0+IHtcbiAgdHJpZ2dlcnMuX3VucmVnaXN0ZXJBbGwoKTtcbn07XG5cblBhcnNlQ2xvdWQudXNlTWFzdGVyS2V5ID0gKCkgPT4ge1xuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmVcbiAgY29uc29sZS53YXJuKFxuICAgICdQYXJzZS5DbG91ZC51c2VNYXN0ZXJLZXkgaXMgZGVwcmVjYXRlZCAoYW5kIGhhcyBubyBlZmZlY3QgYW55bW9yZSkgb24gcGFyc2Utc2VydmVyLCBwbGVhc2UgcmVmZXIgdG8gdGhlIGNsb3VkIGNvZGUgbWlncmF0aW9uIG5vdGVzOiBodHRwOi8vZG9jcy5wYXJzZXBsYXRmb3JtLm9yZy9wYXJzZS1zZXJ2ZXIvZ3VpZGUvI21hc3Rlci1rZXktbXVzdC1iZS1wYXNzZWQtZXhwbGljaXRseSdcbiAgKTtcbn07XG5cbmNvbnN0IHJlcXVlc3QgPSByZXF1aXJlKCcuL2h0dHBSZXF1ZXN0Jyk7XG5QYXJzZUNsb3VkLmh0dHBSZXF1ZXN0ID0gb3B0cyA9PiB7XG4gIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICB1c2FnZTogJ1BhcnNlLkNsb3VkLmh0dHBSZXF1ZXN0JyxcbiAgICBzb2x1dGlvbjogJ1VzZSBhIGh0dHAgcmVxdWVzdCBsaWJyYXJ5IGluc3RlYWQuJyxcbiAgfSk7XG4gIHJldHVybiByZXF1ZXN0KG9wdHMpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBQYXJzZUNsb3VkO1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IGlzQ2hhbGxlbmdlIElmIHRydWUsIG1lYW5zIHRoZSBjdXJyZW50IHJlcXVlc3QgaXMgb3JpZ2luYWxseSB0cmlnZ2VyZWQgYnkgYW4gYXV0aCBjaGFsbGVuZ2UuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLk9iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdHJpZ2dlcmluZyB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpcCBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgY2xpZW50IG1ha2luZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBvcmlnaW5hbCBIVFRQIGhlYWRlcnMgZm9yIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRyaWdnZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSB0cmlnZ2VyIChgYmVmb3JlU2F2ZWAsIGBhZnRlclNhdmVgLCAuLi4pXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9yaWdpbmFsIElmIHNldCwgdGhlIG9iamVjdCwgYXMgY3VycmVudGx5IHN0b3JlZC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWcuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuRmlsZX0gZmlsZSBUaGUgZmlsZSB0aGF0IHRyaWdnZXJlZCB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gZmlsZVNpemUgVGhlIHNpemUgb2YgdGhlIGZpbGUgaW4gYnl0ZXMuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGNvbnRlbnRMZW5ndGggVGhlIHZhbHVlIGZyb20gQ29udGVudC1MZW5ndGggaGVhZGVyXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaXAgVGhlIElQIGFkZHJlc3Mgb2YgdGhlIGNsaWVudCBtYWtpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge09iamVjdH0gaGVhZGVycyBUaGUgb3JpZ2luYWwgSFRUUCBoZWFkZXJzIGZvciB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0cmlnZ2VyTmFtZSBUaGUgbmFtZSBvZiB0aGUgdHJpZ2dlciAoYGJlZm9yZVNhdmVGaWxlYCwgYGFmdGVyU2F2ZUZpbGVgKVxuICogQHByb3BlcnR5IHtPYmplY3R9IGxvZyBUaGUgY3VycmVudCBsb2dnZXIgaW5zaWRlIFBhcnNlIFNlcnZlci5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWcuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkNvbm5lY3RUcmlnZ2VyUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHVzZU1hc3RlcktleSBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gY2xpZW50cyBUaGUgbnVtYmVyIG9mIGNsaWVudHMgY29ubmVjdGVkLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBzdWJzY3JpcHRpb25zIFRoZSBudW1iZXIgb2Ygc3Vic2NyaXB0aW9ucyBjb25uZWN0ZWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gc2Vzc2lvblRva2VuIElmIHNldCwgdGhlIHNlc3Npb24gb2YgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5MaXZlUXVlcnlFdmVudFRyaWdnZXJcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSB1c2VNYXN0ZXJLZXkgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gc2Vzc2lvblRva2VuIElmIHNldCwgdGhlIHNlc3Npb24gb2YgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGV2ZW50IFRoZSBsaXZlIHF1ZXJ5IGV2ZW50IHRoYXQgdHJpZ2dlcmVkIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRyaWdnZXJpbmcgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge1BhcnNlLk9iamVjdH0gb3JpZ2luYWwgSWYgc2V0LCB0aGUgb2JqZWN0LCBhcyBjdXJyZW50bHkgc3RvcmVkLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBjbGllbnRzIFRoZSBudW1iZXIgb2YgY2xpZW50cyBjb25uZWN0ZWQuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IHN1YnNjcmlwdGlvbnMgVGhlIG51bWJlciBvZiBzdWJzY3JpcHRpb25zIGNvbm5lY3RlZC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gc2VuZEV2ZW50IElmIHRoZSBMaXZlUXVlcnkgZXZlbnQgc2hvdWxkIGJlIHNlbnQgdG8gdGhlIGNsaWVudC4gU2V0IHRvIGZhbHNlIHRvIHByZXZlbnQgTGl2ZVF1ZXJ5IGZyb20gcHVzaGluZyB0byB0aGUgY2xpZW50LlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5CZWZvcmVGaW5kUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuUXVlcnl9IHF1ZXJ5IFRoZSBxdWVyeSB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlYCwgYGFmdGVyU2F2ZWAsIC4uLilcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IGlzR2V0IHdldGhlciB0aGUgcXVlcnkgYSBgZ2V0YCBvciBhIGBmaW5kYFxuICogQHByb3BlcnR5IHtPYmplY3R9IGNvbmZpZyBUaGUgUGFyc2UgU2VydmVyIGNvbmZpZy5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuQWZ0ZXJGaW5kUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuUXVlcnl9IHF1ZXJ5IFRoZSBxdWVyeSB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtBcnJheTxQYXJzZS5PYmplY3Q+fSByZXN1bHRzIFRoZSByZXN1bHRzIHRoZSBxdWVyeSB5aWVsZGVkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlYCwgYGFmdGVyU2F2ZWAsIC4uLilcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5GdW5jdGlvblJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbXMgcGFzc2VkIHRvIHRoZSBjbG91ZCBmdW5jdGlvbi5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWcuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkpvYlJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtcyBwYXNzZWQgdG8gdGhlIGJhY2tncm91bmQgam9iLlxuICogQHByb3BlcnR5IHtmdW5jdGlvbn0gbWVzc2FnZSBJZiBtZXNzYWdlIGlzIGNhbGxlZCB3aXRoIGEgc3RyaW5nIGFyZ3VtZW50LCB3aWxsIHVwZGF0ZSB0aGUgY3VycmVudCBtZXNzYWdlIHRvIGJlIHN0b3JlZCBpbiB0aGUgam9iIHN0YXR1cy5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWcuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdFxuICogQHByb3BlcnR5IHtCb29sZWFufSByZXF1aXJlVXNlciB3aGV0aGVyIHRoZSBjbG91ZCB0cmlnZ2VyIHJlcXVpcmVzIGEgdXNlci5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gcmVxdWlyZU1hc3RlciB3aGV0aGVyIHRoZSBjbG91ZCB0cmlnZ2VyIHJlcXVpcmVzIGEgbWFzdGVyIGtleS5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gdmFsaWRhdGVNYXN0ZXJLZXkgd2hldGhlciB0aGUgdmFsaWRhdG9yIHNob3VsZCBydW4gaWYgbWFzdGVyS2V5IGlzIHByb3ZpZGVkLiBEZWZhdWx0cyB0byBmYWxzZS5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gc2tpcFdpdGhNYXN0ZXJLZXkgd2hldGhlciB0aGUgY2xvdWQgY29kZSBmdW5jdGlvbiBzaG91bGQgYmUgaWdub3JlZCB1c2luZyBhIG1hc3RlcktleS5cbiAqXG4gKiBAcHJvcGVydHkge0FycmF5PFN0cmluZz58T2JqZWN0fSByZXF1aXJlVXNlcktleXMgSWYgc2V0LCBrZXlzIHJlcXVpcmVkIG9uIHJlcXVlc3QudXNlciB0byBtYWtlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHJlcXVpcmVVc2VyS2V5cy5maWVsZCBJZiByZXF1aXJlVXNlcktleXMgaXMgYW4gb2JqZWN0LCBuYW1lIG9mIGZpZWxkIHRvIHZhbGlkYXRlIG9uIHJlcXVlc3QgdXNlclxuICogQHByb3BlcnR5IHtBcnJheXxmdW5jdGlvbnxBbnl9IHJlcXVpcmVVc2VyS2V5cy5maWVsZC5vcHRpb25zIGFycmF5IG9mIG9wdGlvbnMgdGhhdCB0aGUgZmllbGQgY2FuIGJlLCBmdW5jdGlvbiB0byB2YWxpZGF0ZSBmaWVsZCwgb3Igc2luZ2xlIHZhbHVlLiBUaHJvdyBhbiBlcnJvciBpZiB2YWx1ZSBpcyBpbnZhbGlkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHJlcXVpcmVVc2VyS2V5cy5maWVsZC5lcnJvciBjdXN0b20gZXJyb3IgbWVzc2FnZSBpZiBmaWVsZCBpcyBpbnZhbGlkLlxuICpcbiAqIEBwcm9wZXJ0eSB7QXJyYXk8U3RyaW5nPnxmdW5jdGlvbn1yZXF1aXJlQW55VXNlclJvbGVzIElmIHNldCwgcmVxdWVzdC51c2VyIGhhcyB0byBiZSBwYXJ0IG9mIGF0IGxlYXN0IG9uZSByb2xlcyBuYW1lIHRvIG1ha2UgdGhlIHJlcXVlc3QuIElmIHNldCB0byBhIGZ1bmN0aW9uLCBmdW5jdGlvbiBtdXN0IHJldHVybiByb2xlIG5hbWVzLlxuICogQHByb3BlcnR5IHtBcnJheTxTdHJpbmc+fGZ1bmN0aW9ufXJlcXVpcmVBbGxVc2VyUm9sZXMgSWYgc2V0LCByZXF1ZXN0LnVzZXIgaGFzIHRvIGJlIHBhcnQgYWxsIHJvbGVzIG5hbWUgdG8gbWFrZSB0aGUgcmVxdWVzdC4gSWYgc2V0IHRvIGEgZnVuY3Rpb24sIGZ1bmN0aW9uIG11c3QgcmV0dXJuIHJvbGUgbmFtZXMuXG4gKlxuICogQHByb3BlcnR5IHtPYmplY3R8QXJyYXk8U3RyaW5nPn0gZmllbGRzIGlmIGFuIGFycmF5IG9mIHN0cmluZ3MsIHZhbGlkYXRvciB3aWxsIGxvb2sgZm9yIGtleXMgaW4gcmVxdWVzdC5wYXJhbXMsIGFuZCB0aHJvdyBpZiBub3QgcHJvdmlkZWQuIElmIE9iamVjdCwgZmllbGRzIHRvIHZhbGlkYXRlLiBJZiB0aGUgdHJpZ2dlciBpcyBhIGNsb3VkIGZ1bmN0aW9uLCBgcmVxdWVzdC5wYXJhbXNgIHdpbGwgYmUgdmFsaWRhdGVkLCBvdGhlcndpc2UgYHJlcXVlc3Qub2JqZWN0YC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBmaWVsZHMuZmllbGQgbmFtZSBvZiBmaWVsZCB0byB2YWxpZGF0ZS5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBmaWVsZHMuZmllbGQudHlwZSBleHBlY3RlZCB0eXBlIG9mIGRhdGEgZm9yIGZpZWxkLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBmaWVsZHMuZmllbGQuY29uc3RhbnQgd2hldGhlciB0aGUgZmllbGQgY2FuIGJlIG1vZGlmaWVkIG9uIHRoZSBvYmplY3QuXG4gKiBAcHJvcGVydHkge0FueX0gZmllbGRzLmZpZWxkLmRlZmF1bHQgZGVmYXVsdCB2YWx1ZSBpZiBmaWVsZCBpcyBgbnVsbGAsIG9yIGluaXRpYWwgdmFsdWUgYGNvbnN0YW50YCBpcyBgdHJ1ZWAuXG4gKiBAcHJvcGVydHkge0FycmF5fGZ1bmN0aW9ufEFueX0gZmllbGRzLmZpZWxkLm9wdGlvbnMgYXJyYXkgb2Ygb3B0aW9ucyB0aGF0IHRoZSBmaWVsZCBjYW4gYmUsIGZ1bmN0aW9uIHRvIHZhbGlkYXRlIGZpZWxkLCBvciBzaW5nbGUgdmFsdWUuIFRocm93IGFuIGVycm9yIGlmIHZhbHVlIGlzIGludmFsaWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gZmllbGRzLmZpZWxkLmVycm9yIGN1c3RvbSBlcnJvciBtZXNzYWdlIGlmIGZpZWxkIGlzIGludmFsaWQuXG4gKi9cbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQSxJQUFBQSxLQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxRQUFBLEdBQUFDLHVCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxXQUFBLEdBQUFDLHNCQUFBLENBQUFKLE9BQUE7QUFBa0QsU0FBQUksdUJBQUFDLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFBQSxTQUFBRyx5QkFBQUMsV0FBQSxlQUFBQyxPQUFBLGtDQUFBQyxpQkFBQSxPQUFBRCxPQUFBLFFBQUFFLGdCQUFBLE9BQUFGLE9BQUEsWUFBQUYsd0JBQUEsWUFBQUEsQ0FBQUMsV0FBQSxXQUFBQSxXQUFBLEdBQUFHLGdCQUFBLEdBQUFELGlCQUFBLEtBQUFGLFdBQUE7QUFBQSxTQUFBUCx3QkFBQUcsR0FBQSxFQUFBSSxXQUFBLFNBQUFBLFdBQUEsSUFBQUosR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsV0FBQUQsR0FBQSxRQUFBQSxHQUFBLG9CQUFBQSxHQUFBLHdCQUFBQSxHQUFBLDRCQUFBRSxPQUFBLEVBQUFGLEdBQUEsVUFBQVEsS0FBQSxHQUFBTCx3QkFBQSxDQUFBQyxXQUFBLE9BQUFJLEtBQUEsSUFBQUEsS0FBQSxDQUFBQyxHQUFBLENBQUFULEdBQUEsWUFBQVEsS0FBQSxDQUFBRSxHQUFBLENBQUFWLEdBQUEsU0FBQVcsTUFBQSxXQUFBQyxxQkFBQSxHQUFBQyxNQUFBLENBQUFDLGNBQUEsSUFBQUQsTUFBQSxDQUFBRSx3QkFBQSxXQUFBQyxHQUFBLElBQUFoQixHQUFBLFFBQUFnQixHQUFBLGtCQUFBSCxNQUFBLENBQUFJLFNBQUEsQ0FBQUMsY0FBQSxDQUFBQyxJQUFBLENBQUFuQixHQUFBLEVBQUFnQixHQUFBLFNBQUFJLElBQUEsR0FBQVIscUJBQUEsR0FBQUMsTUFBQSxDQUFBRSx3QkFBQSxDQUFBZixHQUFBLEVBQUFnQixHQUFBLGNBQUFJLElBQUEsS0FBQUEsSUFBQSxDQUFBVixHQUFBLElBQUFVLElBQUEsQ0FBQUMsR0FBQSxLQUFBUixNQUFBLENBQUFDLGNBQUEsQ0FBQUgsTUFBQSxFQUFBSyxHQUFBLEVBQUFJLElBQUEsWUFBQVQsTUFBQSxDQUFBSyxHQUFBLElBQUFoQixHQUFBLENBQUFnQixHQUFBLFNBQUFMLE1BQUEsQ0FBQVQsT0FBQSxHQUFBRixHQUFBLE1BQUFRLEtBQUEsSUFBQUEsS0FBQSxDQUFBYSxHQUFBLENBQUFyQixHQUFBLEVBQUFXLE1BQUEsWUFBQUEsTUFBQTtBQUNsRCxNQUFNVyxNQUFNLEdBQUczQixPQUFPLENBQUMsV0FBVyxDQUFDO0FBRW5DLFNBQVM0Qix3QkFBd0JBLENBQUNDLE1BQU0sRUFBRTtFQUN4QyxPQUFPLE9BQU9BLE1BQU0sS0FBSyxVQUFVLElBQUlYLE1BQU0sQ0FBQ0ksU0FBUyxDQUFDQyxjQUFjLENBQUNDLElBQUksQ0FBQ0ssTUFBTSxFQUFFLFdBQVcsQ0FBQztBQUNsRztBQUVBLFNBQVNDLGlCQUFpQkEsQ0FBQ0MsU0FBUyxFQUFFO0VBQ3BDLElBQUksQ0FBQ0EsU0FBUyxJQUFJLE9BQU9BLFNBQVMsS0FBSyxVQUFVLEVBQUU7SUFDakQ7RUFDRjtFQUNBLE1BQU1DLFlBQVksR0FBRztJQUNuQkMsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDO0lBQ2JDLFFBQVEsRUFBRSxDQUFDQyxPQUFPLENBQUM7SUFDbkI1QixPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUM7SUFDaEI2QixPQUFPLEVBQUUsQ0FBQ0MsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUM7SUFDbkNDLFFBQVEsRUFBRSxDQUFDSCxPQUFPLENBQUM7SUFDbkJJLEtBQUssRUFBRSxDQUFDQyxNQUFNO0VBQ2hCLENBQUM7RUFDRCxNQUFNQyxXQUFXLEdBQUc7SUFDbEJDLFdBQVcsRUFBRSxDQUFDUCxPQUFPLENBQUM7SUFDdEJRLG1CQUFtQixFQUFFLENBQUNOLEtBQUssRUFBRSxVQUFVLENBQUM7SUFDeENPLG1CQUFtQixFQUFFLENBQUNQLEtBQUssRUFBRSxVQUFVLENBQUM7SUFDeENRLGFBQWEsRUFBRSxDQUFDVixPQUFPLENBQUM7SUFDeEJXLGlCQUFpQixFQUFFLENBQUNYLE9BQU8sQ0FBQztJQUM1QlksaUJBQWlCLEVBQUUsQ0FBQ1osT0FBTyxDQUFDO0lBQzVCYSxlQUFlLEVBQUUsQ0FBQ1gsS0FBSyxFQUFFbkIsTUFBTSxDQUFDO0lBQ2hDK0IsTUFBTSxFQUFFLENBQUNaLEtBQUssRUFBRW5CLE1BQU07RUFDeEIsQ0FBQztFQUNELE1BQU1nQyxPQUFPLEdBQUdDLEVBQUUsSUFBSTtJQUNwQixJQUFJZCxLQUFLLENBQUNlLE9BQU8sQ0FBQ0QsRUFBRSxDQUFDLEVBQUU7TUFDckIsT0FBTyxPQUFPO0lBQ2hCO0lBQ0EsSUFBSUEsRUFBRSxLQUFLLEtBQUssSUFBSUEsRUFBRSxLQUFLLFVBQVUsRUFBRTtNQUNyQyxPQUFPQSxFQUFFO0lBQ1g7SUFDQSxNQUFNbEIsSUFBSSxHQUFHLE9BQU9rQixFQUFFO0lBQ3RCLElBQUksT0FBT0EsRUFBRSxLQUFLLFVBQVUsRUFBRTtNQUM1QixNQUFNRSxLQUFLLEdBQUdGLEVBQUUsSUFBSUEsRUFBRSxDQUFDRyxRQUFRLEVBQUUsQ0FBQ0QsS0FBSyxDQUFDLG9CQUFvQixDQUFDO01BQzdELE9BQU8sQ0FBQ0EsS0FBSyxHQUFHQSxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsVUFBVSxFQUFFRSxXQUFXLEVBQUU7SUFDdEQ7SUFDQSxPQUFPdEIsSUFBSTtFQUNiLENBQUM7RUFDRCxNQUFNdUIsUUFBUSxHQUFHQSxDQUFDbkMsR0FBRyxFQUFFb0MsSUFBSSxFQUFFQyxjQUFjLEtBQUs7SUFDOUMsTUFBTUMsU0FBUyxHQUFHRixJQUFJLENBQUNwQyxHQUFHLENBQUM7SUFDM0IsSUFBSSxDQUFDc0MsU0FBUyxFQUFFO01BQ2QsTUFBTyxHQUFFdEMsR0FBSSwrREFBOEQ7SUFDN0U7SUFDQSxNQUFNdUMsS0FBSyxHQUFHRCxTQUFTLENBQUNFLEdBQUcsQ0FBQzVCLElBQUksSUFBSWlCLE9BQU8sQ0FBQ2pCLElBQUksQ0FBQyxDQUFDO0lBQ2xELE1BQU1BLElBQUksR0FBR2lCLE9BQU8sQ0FBQ1EsY0FBYyxDQUFDO0lBQ3BDLElBQUksQ0FBQ0UsS0FBSyxDQUFDRSxRQUFRLENBQUM3QixJQUFJLENBQUMsSUFBSSxDQUFDMkIsS0FBSyxDQUFDRSxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUU7TUFDbkQsTUFBTyxrREFBaUR6QyxHQUFJLGNBQWF1QyxLQUFLLENBQUNHLElBQUksQ0FDakYsR0FBRyxDQUNILFlBQVc5QixJQUFLLEVBQUM7SUFDckI7RUFDRixDQUFDO0VBQ0QsS0FBSyxNQUFNWixHQUFHLElBQUlVLFNBQVMsRUFBRTtJQUMzQnlCLFFBQVEsQ0FBQ25DLEdBQUcsRUFBRW9CLFdBQVcsRUFBRVYsU0FBUyxDQUFDVixHQUFHLENBQUMsQ0FBQztJQUMxQyxJQUFJQSxHQUFHLEtBQUssUUFBUSxJQUFJQSxHQUFHLEtBQUssaUJBQWlCLEVBQUU7TUFDakQsTUFBTTJDLE1BQU0sR0FBR2pDLFNBQVMsQ0FBQ1YsR0FBRyxDQUFDO01BQzdCLElBQUlnQixLQUFLLENBQUNlLE9BQU8sQ0FBQ1ksTUFBTSxDQUFDLEVBQUU7UUFDekI7TUFDRjtNQUNBLEtBQUssTUFBTUMsS0FBSyxJQUFJRCxNQUFNLEVBQUU7UUFDMUIsTUFBTVAsSUFBSSxHQUFHTyxNQUFNLENBQUNDLEtBQUssQ0FBQztRQUMxQixLQUFLLE1BQU1DLE1BQU0sSUFBSVQsSUFBSSxFQUFFO1VBQ3pCRCxRQUFRLENBQUNVLE1BQU0sRUFBRWxDLFlBQVksRUFBRXlCLElBQUksQ0FBQ1MsTUFBTSxDQUFDLENBQUM7UUFDOUM7TUFDRjtJQUNGO0VBQ0Y7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxJQUFJQyxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQ25CO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQUEsVUFBVSxDQUFDQyxNQUFNLEdBQUcsVUFBVUMsWUFBWSxFQUFFQyxPQUFPLEVBQUVDLGlCQUFpQixFQUFFO0VBQ3RFekMsaUJBQWlCLENBQUN5QyxpQkFBaUIsQ0FBQztFQUNwQ3RFLFFBQVEsQ0FBQ3VFLFdBQVcsQ0FBQ0gsWUFBWSxFQUFFQyxPQUFPLEVBQUVDLGlCQUFpQixFQUFFRSxXQUFLLENBQUNDLGFBQWEsQ0FBQztBQUNyRixDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQVAsVUFBVSxDQUFDUSxHQUFHLEdBQUcsVUFBVU4sWUFBWSxFQUFFQyxPQUFPLEVBQUU7RUFDaERyRSxRQUFRLENBQUMyRSxNQUFNLENBQUNQLFlBQVksRUFBRUMsT0FBTyxFQUFFRyxXQUFLLENBQUNDLGFBQWEsQ0FBQztBQUM3RCxDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQVAsVUFBVSxDQUFDVSxVQUFVLEdBQUcsVUFBVUMsVUFBVSxFQUFFUixPQUFPLEVBQUVDLGlCQUFpQixFQUFFO0VBQ3hFLE1BQU1RLFNBQVMsR0FBRzlFLFFBQVEsQ0FBQytFLFlBQVksQ0FBQ0YsVUFBVSxDQUFDO0VBQ25EaEQsaUJBQWlCLENBQUN5QyxpQkFBaUIsQ0FBQztFQUNwQ3RFLFFBQVEsQ0FBQ2dGLFVBQVUsQ0FDakJoRixRQUFRLENBQUNpRixLQUFLLENBQUNMLFVBQVUsRUFDekJFLFNBQVMsRUFDVFQsT0FBTyxFQUNQRyxXQUFLLENBQUNDLGFBQWEsRUFDbkJILGlCQUFpQixDQUNsQjtBQUNILENBQUM7O0FBRUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0FKLFVBQVUsQ0FBQ2dCLFlBQVksR0FBRyxVQUFVTCxVQUFVLEVBQUVSLE9BQU8sRUFBRUMsaUJBQWlCLEVBQUU7RUFDMUUsTUFBTVEsU0FBUyxHQUFHOUUsUUFBUSxDQUFDK0UsWUFBWSxDQUFDRixVQUFVLENBQUM7RUFDbkRoRCxpQkFBaUIsQ0FBQ3lDLGlCQUFpQixDQUFDO0VBQ3BDdEUsUUFBUSxDQUFDZ0YsVUFBVSxDQUNqQmhGLFFBQVEsQ0FBQ2lGLEtBQUssQ0FBQ0MsWUFBWSxFQUMzQkosU0FBUyxFQUNUVCxPQUFPLEVBQ1BHLFdBQUssQ0FBQ0MsYUFBYSxFQUNuQkgsaUJBQWlCLENBQ2xCO0FBQ0gsQ0FBQzs7QUFFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0FKLFVBQVUsQ0FBQ2lCLFdBQVcsR0FBRyxVQUFVZCxPQUFPLEVBQUU7RUFDMUMsSUFBSVMsU0FBUyxHQUFHLE9BQU87RUFDdkIsSUFBSSxPQUFPVCxPQUFPLEtBQUssUUFBUSxJQUFJMUMsd0JBQXdCLENBQUMwQyxPQUFPLENBQUMsRUFBRTtJQUNwRTtJQUNBO0lBQ0FTLFNBQVMsR0FBRzlFLFFBQVEsQ0FBQytFLFlBQVksQ0FBQ1YsT0FBTyxDQUFDO0lBQzFDQSxPQUFPLEdBQUdlLFNBQVMsQ0FBQyxDQUFDLENBQUM7RUFDeEI7RUFDQXBGLFFBQVEsQ0FBQ2dGLFVBQVUsQ0FBQ2hGLFFBQVEsQ0FBQ2lGLEtBQUssQ0FBQ0UsV0FBVyxFQUFFTCxTQUFTLEVBQUVULE9BQU8sRUFBRUcsV0FBSyxDQUFDQyxhQUFhLENBQUM7QUFDMUYsQ0FBQzs7QUFFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBUCxVQUFVLENBQUNtQixVQUFVLEdBQUcsVUFBVWhCLE9BQU8sRUFBRTtFQUN6QyxJQUFJUyxTQUFTLEdBQUcsT0FBTztFQUN2QixJQUFJLE9BQU9ULE9BQU8sS0FBSyxRQUFRLElBQUkxQyx3QkFBd0IsQ0FBQzBDLE9BQU8sQ0FBQyxFQUFFO0lBQ3BFO0lBQ0E7SUFDQVMsU0FBUyxHQUFHOUUsUUFBUSxDQUFDK0UsWUFBWSxDQUFDVixPQUFPLENBQUM7SUFDMUNBLE9BQU8sR0FBR2UsU0FBUyxDQUFDLENBQUMsQ0FBQztFQUN4QjtFQUNBcEYsUUFBUSxDQUFDZ0YsVUFBVSxDQUFDaEYsUUFBUSxDQUFDaUYsS0FBSyxDQUFDSSxVQUFVLEVBQUVQLFNBQVMsRUFBRVQsT0FBTyxFQUFFRyxXQUFLLENBQUNDLGFBQWEsQ0FBQztBQUN6RixDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBUCxVQUFVLENBQUNvQixXQUFXLEdBQUcsVUFBVWpCLE9BQU8sRUFBRTtFQUMxQyxJQUFJUyxTQUFTLEdBQUcsVUFBVTtFQUMxQixJQUFJLE9BQU9ULE9BQU8sS0FBSyxRQUFRLElBQUkxQyx3QkFBd0IsQ0FBQzBDLE9BQU8sQ0FBQyxFQUFFO0lBQ3BFO0lBQ0E7SUFDQVMsU0FBUyxHQUFHOUUsUUFBUSxDQUFDK0UsWUFBWSxDQUFDVixPQUFPLENBQUM7SUFDMUNBLE9BQU8sR0FBR2UsU0FBUyxDQUFDLENBQUMsQ0FBQztFQUN4QjtFQUNBcEYsUUFBUSxDQUFDZ0YsVUFBVSxDQUFDaEYsUUFBUSxDQUFDaUYsS0FBSyxDQUFDSyxXQUFXLEVBQUVSLFNBQVMsRUFBRVQsT0FBTyxFQUFFRyxXQUFLLENBQUNDLGFBQWEsQ0FBQztBQUMxRixDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0FQLFVBQVUsQ0FBQ3FCLFNBQVMsR0FBRyxVQUFVVixVQUFVLEVBQUVSLE9BQU8sRUFBRUMsaUJBQWlCLEVBQUU7RUFDdkUsTUFBTVEsU0FBUyxHQUFHOUUsUUFBUSxDQUFDK0UsWUFBWSxDQUFDRixVQUFVLENBQUM7RUFDbkRoRCxpQkFBaUIsQ0FBQ3lDLGlCQUFpQixDQUFDO0VBQ3BDdEUsUUFBUSxDQUFDZ0YsVUFBVSxDQUNqQmhGLFFBQVEsQ0FBQ2lGLEtBQUssQ0FBQ00sU0FBUyxFQUN4QlQsU0FBUyxFQUNUVCxPQUFPLEVBQ1BHLFdBQUssQ0FBQ0MsYUFBYSxFQUNuQkgsaUJBQWlCLENBQ2xCO0FBQ0gsQ0FBQzs7QUFFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQUosVUFBVSxDQUFDc0IsV0FBVyxHQUFHLFVBQVVYLFVBQVUsRUFBRVIsT0FBTyxFQUFFQyxpQkFBaUIsRUFBRTtFQUN6RSxNQUFNUSxTQUFTLEdBQUc5RSxRQUFRLENBQUMrRSxZQUFZLENBQUNGLFVBQVUsQ0FBQztFQUNuRGhELGlCQUFpQixDQUFDeUMsaUJBQWlCLENBQUM7RUFDcEN0RSxRQUFRLENBQUNnRixVQUFVLENBQ2pCaEYsUUFBUSxDQUFDaUYsS0FBSyxDQUFDTyxXQUFXLEVBQzFCVixTQUFTLEVBQ1RULE9BQU8sRUFDUEcsV0FBSyxDQUFDQyxhQUFhLEVBQ25CSCxpQkFBaUIsQ0FDbEI7QUFDSCxDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBSixVQUFVLENBQUN1QixVQUFVLEdBQUcsVUFBVVosVUFBVSxFQUFFUixPQUFPLEVBQUVDLGlCQUFpQixFQUFFO0VBQ3hFLE1BQU1RLFNBQVMsR0FBRzlFLFFBQVEsQ0FBQytFLFlBQVksQ0FBQ0YsVUFBVSxDQUFDO0VBQ25EaEQsaUJBQWlCLENBQUN5QyxpQkFBaUIsQ0FBQztFQUNwQ3RFLFFBQVEsQ0FBQ2dGLFVBQVUsQ0FDakJoRixRQUFRLENBQUNpRixLQUFLLENBQUNRLFVBQVUsRUFDekJYLFNBQVMsRUFDVFQsT0FBTyxFQUNQRyxXQUFLLENBQUNDLGFBQWEsRUFDbkJILGlCQUFpQixDQUNsQjtBQUNILENBQUM7O0FBRUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0FKLFVBQVUsQ0FBQ3dCLFNBQVMsR0FBRyxVQUFVYixVQUFVLEVBQUVSLE9BQU8sRUFBRUMsaUJBQWlCLEVBQUU7RUFDdkUsTUFBTVEsU0FBUyxHQUFHOUUsUUFBUSxDQUFDK0UsWUFBWSxDQUFDRixVQUFVLENBQUM7RUFDbkRoRCxpQkFBaUIsQ0FBQ3lDLGlCQUFpQixDQUFDO0VBQ3BDdEUsUUFBUSxDQUFDZ0YsVUFBVSxDQUNqQmhGLFFBQVEsQ0FBQ2lGLEtBQUssQ0FBQ1MsU0FBUyxFQUN4QlosU0FBUyxFQUNUVCxPQUFPLEVBQ1BHLFdBQUssQ0FBQ0MsYUFBYSxFQUNuQkgsaUJBQWlCLENBQ2xCO0FBQ0gsQ0FBQzs7QUFFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0FKLFVBQVUsQ0FBQ3lCLGNBQWMsR0FBRyxVQUFVdEIsT0FBTyxFQUFFQyxpQkFBaUIsRUFBRTtFQUNoRXNCLG1CQUFVLENBQUNDLHFCQUFxQixDQUFDO0lBQy9CQyxLQUFLLEVBQUUsNEJBQTRCO0lBQ25DQyxRQUFRLEVBQUU7RUFDWixDQUFDLENBQUM7RUFDRjdCLFVBQVUsQ0FBQ1UsVUFBVSxDQUFDSixXQUFLLENBQUN3QixJQUFJLEVBQUUzQixPQUFPLEVBQUVDLGlCQUFpQixDQUFDO0FBQy9ELENBQUM7O0FBRUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBSixVQUFVLENBQUMrQixhQUFhLEdBQUcsVUFBVTVCLE9BQU8sRUFBRUMsaUJBQWlCLEVBQUU7RUFDL0RzQixtQkFBVSxDQUFDQyxxQkFBcUIsQ0FBQztJQUMvQkMsS0FBSyxFQUFFLDJCQUEyQjtJQUNsQ0MsUUFBUSxFQUFFO0VBQ1osQ0FBQyxDQUFDO0VBQ0Y3QixVQUFVLENBQUNxQixTQUFTLENBQUNmLFdBQUssQ0FBQ3dCLElBQUksRUFBRTNCLE9BQU8sRUFBRUMsaUJBQWlCLENBQUM7QUFDOUQsQ0FBQzs7QUFFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0FKLFVBQVUsQ0FBQ2dDLGdCQUFnQixHQUFHLFVBQVU3QixPQUFPLEVBQUVDLGlCQUFpQixFQUFFO0VBQ2xFc0IsbUJBQVUsQ0FBQ0MscUJBQXFCLENBQUM7SUFDL0JDLEtBQUssRUFBRSw4QkFBOEI7SUFDckNDLFFBQVEsRUFBRTtFQUNaLENBQUMsQ0FBQztFQUNGN0IsVUFBVSxDQUFDZ0IsWUFBWSxDQUFDVixXQUFLLENBQUN3QixJQUFJLEVBQUUzQixPQUFPLEVBQUVDLGlCQUFpQixDQUFDO0FBQ2pFLENBQUM7O0FBRUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBSixVQUFVLENBQUNpQyxlQUFlLEdBQUcsVUFBVTlCLE9BQU8sRUFBRUMsaUJBQWlCLEVBQUU7RUFDakVzQixtQkFBVSxDQUFDQyxxQkFBcUIsQ0FBQztJQUMvQkMsS0FBSyxFQUFFLDZCQUE2QjtJQUNwQ0MsUUFBUSxFQUFFO0VBQ1osQ0FBQyxDQUFDO0VBQ0Y3QixVQUFVLENBQUNzQixXQUFXLENBQUNoQixXQUFLLENBQUN3QixJQUFJLEVBQUUzQixPQUFPLEVBQUVDLGlCQUFpQixDQUFDO0FBQ2hFLENBQUM7O0FBRUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQUosVUFBVSxDQUFDa0MsYUFBYSxHQUFHLFVBQVUvQixPQUFPLEVBQUVDLGlCQUFpQixFQUFFO0VBQy9EekMsaUJBQWlCLENBQUN5QyxpQkFBaUIsQ0FBQztFQUNwQ3RFLFFBQVEsQ0FBQ3FHLGlCQUFpQixDQUN4QnJHLFFBQVEsQ0FBQ2lGLEtBQUssQ0FBQ21CLGFBQWEsRUFDNUIvQixPQUFPLEVBQ1BHLFdBQUssQ0FBQ0MsYUFBYSxFQUNuQkgsaUJBQWlCLENBQ2xCO0FBQ0gsQ0FBQzs7QUFFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBSixVQUFVLENBQUNvQyxTQUFTLEdBQUcsVUFBVTlDLElBQUksRUFBRTtFQUNyQyxNQUFNK0MsTUFBTSxHQUFHN0UsTUFBTSxDQUFDWixHQUFHLENBQUMwRCxXQUFLLENBQUNDLGFBQWEsQ0FBQztFQUM5QyxNQUFNK0IsWUFBWSxHQUFHRCxNQUFNLENBQUNFLGNBQWMsQ0FBQ0MsT0FBTztFQUNsRCxJQUFJLENBQUNGLFlBQVksRUFBRTtJQUNqQkQsTUFBTSxDQUFDSSxnQkFBZ0IsQ0FBQ3JFLEtBQUssQ0FDM0IsOEVBQThFLENBQy9FO0lBQ0Q7RUFDRjtFQUNBLE9BQU9rRSxZQUFZLENBQUNJLFFBQVEsQ0FBQ3BELElBQUksQ0FBQztBQUNwQyxDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBVSxVQUFVLENBQUMyQyxlQUFlLEdBQUcsVUFBVWhDLFVBQVUsRUFBRVIsT0FBTyxFQUFFQyxpQkFBaUIsRUFBRTtFQUM3RXpDLGlCQUFpQixDQUFDeUMsaUJBQWlCLENBQUM7RUFDcEMsTUFBTVEsU0FBUyxHQUFHOUUsUUFBUSxDQUFDK0UsWUFBWSxDQUFDRixVQUFVLENBQUM7RUFDbkQ3RSxRQUFRLENBQUNnRixVQUFVLENBQ2pCaEYsUUFBUSxDQUFDaUYsS0FBSyxDQUFDNEIsZUFBZSxFQUM5Qi9CLFNBQVMsRUFDVFQsT0FBTyxFQUNQRyxXQUFLLENBQUNDLGFBQWEsRUFDbkJILGlCQUFpQixDQUNsQjtBQUNILENBQUM7QUFFREosVUFBVSxDQUFDNEMsZ0JBQWdCLEdBQUcsVUFBVXpDLE9BQU8sRUFBRTtFQUMvQ3JFLFFBQVEsQ0FBQytHLHdCQUF3QixDQUFDMUMsT0FBTyxFQUFFRyxXQUFLLENBQUNDLGFBQWEsQ0FBQztBQUNqRSxDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQVAsVUFBVSxDQUFDOEMsbUJBQW1CLEdBQUcsVUFBVW5DLFVBQVUsRUFBRVIsT0FBTyxFQUFFQyxpQkFBaUIsRUFBRTtFQUNqRixNQUFNUSxTQUFTLEdBQUc5RSxRQUFRLENBQUMrRSxZQUFZLENBQUNGLFVBQVUsQ0FBQztFQUNuRGhELGlCQUFpQixDQUFDeUMsaUJBQWlCLENBQUM7RUFDcEN0RSxRQUFRLENBQUNnRixVQUFVLENBQ2pCaEYsUUFBUSxDQUFDaUYsS0FBSyxDQUFDZ0MsVUFBVSxFQUN6Qm5DLFNBQVMsRUFDVFQsT0FBTyxFQUNQRyxXQUFLLENBQUNDLGFBQWEsRUFDbkJILGlCQUFpQixDQUNsQjtBQUNILENBQUM7QUFFREosVUFBVSxDQUFDZ0QsZUFBZSxHQUFHLE1BQU07RUFDakNsSCxRQUFRLENBQUNtSCxjQUFjLEVBQUU7QUFDM0IsQ0FBQztBQUVEakQsVUFBVSxDQUFDa0QsWUFBWSxHQUFHLE1BQU07RUFDOUI7RUFDQUMsT0FBTyxDQUFDQyxJQUFJLENBQ1YsNE5BQTROLENBQzdOO0FBQ0gsQ0FBQztBQUVELE1BQU1DLE9BQU8sR0FBR3hILE9BQU8sQ0FBQyxlQUFlLENBQUM7QUFDeENtRSxVQUFVLENBQUNzRCxXQUFXLEdBQUdDLElBQUksSUFBSTtFQUMvQjdCLG1CQUFVLENBQUNDLHFCQUFxQixDQUFDO0lBQy9CQyxLQUFLLEVBQUUseUJBQXlCO0lBQ2hDQyxRQUFRLEVBQUU7RUFDWixDQUFDLENBQUM7RUFDRixPQUFPd0IsT0FBTyxDQUFDRSxJQUFJLENBQUM7QUFDdEIsQ0FBQztBQUVEQyxNQUFNLENBQUNDLE9BQU8sR0FBR3pELFVBQVU7O0FBRTNCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSJ9