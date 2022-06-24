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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkLmpzIl0sIm5hbWVzIjpbIkNvbmZpZyIsInJlcXVpcmUiLCJpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3IiLCJvYmplY3QiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ2YWxpZGF0ZVZhbGlkYXRvciIsInZhbGlkYXRvciIsImZpZWxkT3B0aW9ucyIsInR5cGUiLCJjb25zdGFudCIsIkJvb2xlYW4iLCJkZWZhdWx0Iiwib3B0aW9ucyIsIkFycmF5IiwicmVxdWlyZWQiLCJlcnJvciIsIlN0cmluZyIsImFsbG93ZWRLZXlzIiwicmVxdWlyZVVzZXIiLCJyZXF1aXJlQW55VXNlclJvbGVzIiwicmVxdWlyZUFsbFVzZXJSb2xlcyIsInJlcXVpcmVNYXN0ZXIiLCJ2YWxpZGF0ZU1hc3RlcktleSIsInNraXBXaXRoTWFzdGVyS2V5IiwicmVxdWlyZVVzZXJLZXlzIiwiZmllbGRzIiwiZ2V0VHlwZSIsImZuIiwiaXNBcnJheSIsIm1hdGNoIiwidG9TdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImNoZWNrS2V5Iiwia2V5IiwiZGF0YSIsInZhbGlkYXRvclBhcmFtIiwicGFyYW1ldGVyIiwidHlwZXMiLCJtYXAiLCJpbmNsdWRlcyIsImpvaW4iLCJ2YWx1ZXMiLCJ2YWx1ZSIsInN1YktleSIsIlBhcnNlQ2xvdWQiLCJkZWZpbmUiLCJmdW5jdGlvbk5hbWUiLCJoYW5kbGVyIiwidmFsaWRhdGlvbkhhbmRsZXIiLCJ0cmlnZ2VycyIsImFkZEZ1bmN0aW9uIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwiam9iIiwiYWRkSm9iIiwiYmVmb3JlU2F2ZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJnZXRDbGFzc05hbWUiLCJhZGRUcmlnZ2VyIiwiVHlwZXMiLCJiZWZvcmVEZWxldGUiLCJiZWZvcmVMb2dpbiIsImFyZ3VtZW50cyIsImFmdGVyTG9naW4iLCJhZnRlckxvZ291dCIsImFmdGVyU2F2ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZVNhdmVGaWxlIiwiRGVwcmVjYXRvciIsImxvZ1J1bnRpbWVEZXByZWNhdGlvbiIsInVzYWdlIiwic29sdXRpb24iLCJGaWxlIiwiYWZ0ZXJTYXZlRmlsZSIsImJlZm9yZURlbGV0ZUZpbGUiLCJhZnRlckRlbGV0ZUZpbGUiLCJiZWZvcmVDb25uZWN0IiwiYWRkQ29ubmVjdFRyaWdnZXIiLCJzZW5kRW1haWwiLCJjb25maWciLCJnZXQiLCJlbWFpbEFkYXB0ZXIiLCJ1c2VyQ29udHJvbGxlciIsImFkYXB0ZXIiLCJsb2dnZXJDb250cm9sbGVyIiwic2VuZE1haWwiLCJiZWZvcmVTdWJzY3JpYmUiLCJvbkxpdmVRdWVyeUV2ZW50IiwiYWRkTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVyIiwiYWZ0ZXJMaXZlUXVlcnlFdmVudCIsImFmdGVyRXZlbnQiLCJfcmVtb3ZlQWxsSG9va3MiLCJfdW5yZWdpc3RlckFsbCIsInVzZU1hc3RlcktleSIsImNvbnNvbGUiLCJ3YXJuIiwicmVxdWVzdCIsImh0dHBSZXF1ZXN0Iiwib3B0cyIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBQUE7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBQ0EsTUFBTUEsTUFBTSxHQUFHQyxPQUFPLENBQUMsV0FBRCxDQUF0Qjs7QUFFQSxTQUFTQyx3QkFBVCxDQUFrQ0MsTUFBbEMsRUFBMEM7QUFDeEMsU0FBTyxPQUFPQSxNQUFQLEtBQWtCLFVBQWxCLElBQWdDQyxNQUFNLENBQUNDLFNBQVAsQ0FBaUJDLGNBQWpCLENBQWdDQyxJQUFoQyxDQUFxQ0osTUFBckMsRUFBNkMsV0FBN0MsQ0FBdkM7QUFDRDs7QUFFRCxTQUFTSyxpQkFBVCxDQUEyQkMsU0FBM0IsRUFBc0M7QUFDcEMsTUFBSSxDQUFDQSxTQUFELElBQWMsT0FBT0EsU0FBUCxLQUFxQixVQUF2QyxFQUFtRDtBQUNqRDtBQUNEOztBQUNELFFBQU1DLFlBQVksR0FBRztB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QUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgdHJpZ2dlcnMgZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi4vRGVwcmVjYXRvci9EZXByZWNhdG9yJztcbmNvbnN0IENvbmZpZyA9IHJlcXVpcmUoJy4uL0NvbmZpZycpO1xuXG5mdW5jdGlvbiBpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3Iob2JqZWN0KSB7XG4gIHJldHVybiB0eXBlb2Ygb2JqZWN0ID09PSAnZnVuY3Rpb24nICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsICdjbGFzc05hbWUnKTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdG9yKSB7XG4gIGlmICghdmFsaWRhdG9yIHx8IHR5cGVvZiB2YWxpZGF0b3IgPT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgZmllbGRPcHRpb25zID0ge1xuICAgIHR5cGU6IFsnQW55J10sXG4gICAgY29uc3RhbnQ6IFtCb29sZWFuXSxcbiAgICBkZWZhdWx0OiBbJ0FueSddLFxuICAgIG9wdGlvbnM6IFtBcnJheSwgJ2Z1bmN0aW9uJywgJ0FueSddLFxuICAgIHJlcXVpcmVkOiBbQm9vbGVhbl0sXG4gICAgZXJyb3I6IFtTdHJpbmddLFxuICB9O1xuICBjb25zdCBhbGxvd2VkS2V5cyA9IHtcbiAgICByZXF1aXJlVXNlcjogW0Jvb2xlYW5dLFxuICAgIHJlcXVpcmVBbnlVc2VyUm9sZXM6IFtBcnJheSwgJ2Z1bmN0aW9uJ10sXG4gICAgcmVxdWlyZUFsbFVzZXJSb2xlczogW0FycmF5LCAnZnVuY3Rpb24nXSxcbiAgICByZXF1aXJlTWFzdGVyOiBbQm9vbGVhbl0sXG4gICAgdmFsaWRhdGVNYXN0ZXJLZXk6IFtCb29sZWFuXSxcbiAgICBza2lwV2l0aE1hc3RlcktleTogW0Jvb2xlYW5dLFxuICAgIHJlcXVpcmVVc2VyS2V5czogW0FycmF5LCBPYmplY3RdLFxuICAgIGZpZWxkczogW0FycmF5LCBPYmplY3RdLFxuICB9O1xuICBjb25zdCBnZXRUeXBlID0gZm4gPT4ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KGZuKSkge1xuICAgICAgcmV0dXJuICdhcnJheSc7XG4gICAgfVxuICAgIGlmIChmbiA9PT0gJ0FueScgfHwgZm4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybiBmbjtcbiAgICB9XG4gICAgY29uc3QgdHlwZSA9IHR5cGVvZiBmbjtcbiAgICBpZiAodHlwZW9mIGZuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGZuICYmIGZuLnRvU3RyaW5nKCkubWF0Y2goL15cXHMqZnVuY3Rpb24gKFxcdyspLyk7XG4gICAgICByZXR1cm4gKG1hdGNoID8gbWF0Y2hbMV0gOiAnZnVuY3Rpb24nKS50b0xvd2VyQ2FzZSgpO1xuICAgIH1cbiAgICByZXR1cm4gdHlwZTtcbiAgfTtcbiAgY29uc3QgY2hlY2tLZXkgPSAoa2V5LCBkYXRhLCB2YWxpZGF0b3JQYXJhbSkgPT4ge1xuICAgIGNvbnN0IHBhcmFtZXRlciA9IGRhdGFba2V5XTtcbiAgICBpZiAoIXBhcmFtZXRlcikge1xuICAgICAgdGhyb3cgYCR7a2V5fSBpcyBub3QgYSBzdXBwb3J0ZWQgcGFyYW1ldGVyIGZvciBDbG91ZCBGdW5jdGlvbiB2YWxpZGF0aW9ucy5gO1xuICAgIH1cbiAgICBjb25zdCB0eXBlcyA9IHBhcmFtZXRlci5tYXAodHlwZSA9PiBnZXRUeXBlKHR5cGUpKTtcbiAgICBjb25zdCB0eXBlID0gZ2V0VHlwZSh2YWxpZGF0b3JQYXJhbSk7XG4gICAgaWYgKCF0eXBlcy5pbmNsdWRlcyh0eXBlKSAmJiAhdHlwZXMuaW5jbHVkZXMoJ0FueScpKSB7XG4gICAgICB0aHJvdyBgSW52YWxpZCB0eXBlIGZvciBDbG91ZCBGdW5jdGlvbiB2YWxpZGF0aW9uIGtleSAke2tleX0uIEV4cGVjdGVkICR7dHlwZXMuam9pbihcbiAgICAgICAgJ3wnXG4gICAgICApfSwgYWN0dWFsICR7dHlwZX1gO1xuICAgIH1cbiAgfTtcbiAgZm9yIChjb25zdCBrZXkgaW4gdmFsaWRhdG9yKSB7XG4gICAgY2hlY2tLZXkoa2V5LCBhbGxvd2VkS2V5cywgdmFsaWRhdG9yW2tleV0pO1xuICAgIGlmIChrZXkgPT09ICdmaWVsZHMnIHx8IGtleSA9PT0gJ3JlcXVpcmVVc2VyS2V5cycpIHtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IHZhbGlkYXRvcltrZXldO1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWVzKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgdmFsdWUgaW4gdmFsdWVzKSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSB2YWx1ZXNbdmFsdWVdO1xuICAgICAgICBmb3IgKGNvbnN0IHN1YktleSBpbiBkYXRhKSB7XG4gICAgICAgICAgY2hlY2tLZXkoc3ViS2V5LCBmaWVsZE9wdGlvbnMsIGRhdGFbc3ViS2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbi8qKiBAbmFtZXNwYWNlXG4gKiBAbmFtZSBQYXJzZVxuICogQGRlc2NyaXB0aW9uIFRoZSBQYXJzZSBTREsuXG4gKiAgc2VlIFthcGkgZG9jc10oaHR0cHM6Ly9kb2NzLnBhcnNlcGxhdGZvcm0ub3JnL2pzL2FwaSkgYW5kIFtndWlkZV0oaHR0cHM6Ly9kb2NzLnBhcnNlcGxhdGZvcm0ub3JnL2pzL2d1aWRlKVxuICovXG5cbi8qKiBAbmFtZXNwYWNlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZFxuICogQG1lbWJlcm9mIFBhcnNlXG4gKiBAZGVzY3JpcHRpb24gVGhlIFBhcnNlIENsb3VkIENvZGUgU0RLLlxuICovXG5cbnZhciBQYXJzZUNsb3VkID0ge307XG4vKipcbiAqIERlZmluZXMgYSBDbG91ZCBGdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmRlZmluZSgnZnVuY3Rpb25OYW1lJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuZGVmaW5lKCdmdW5jdGlvbk5hbWUnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqIGBgYFxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJvZiBQYXJzZS5DbG91ZFxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIENsb3VkIEZ1bmN0aW9uXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBkYXRhIFRoZSBDbG91ZCBGdW5jdGlvbiB0byByZWdpc3Rlci4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRnVuY3Rpb25SZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRnVuY3Rpb25SZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5kZWZpbmUgPSBmdW5jdGlvbiAoZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKiBEZWZpbmVzIGEgQmFja2dyb3VuZCBKb2IuXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogQG1ldGhvZCBqb2JcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmpvYlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIEJhY2tncm91bmQgSm9iXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBCYWNrZ3JvdW5kIEpvYiB0byByZWdpc3Rlci4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgc2hvdWxkIHRha2UgYSBzaW5nbGUgcGFyYW1ldGVycyBhIHtAbGluayBQYXJzZS5DbG91ZC5Kb2JSZXF1ZXN0fVxuICpcbiAqL1xuUGFyc2VDbG91ZC5qb2IgPSBmdW5jdGlvbiAoZnVuY3Rpb25OYW1lLCBoYW5kbGVyKSB7XG4gIHRyaWdnZXJzLmFkZEpvYihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIHNhdmUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZVNhdmUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmUoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlKFBhcnNlLlVzZXIsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pXG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZVNhdmVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIHNhdmUgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgc2F2ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9O1xuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlU2F2ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGRlbGV0ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYmVmb3JlRGVsZXRlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZSgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZShQYXJzZS5Vc2VyLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KVxuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZURlbGV0ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBiZWZvcmUgZGVsZXRlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGRlbGV0ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIsIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZURlbGV0ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVEZWxldGUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIHRoZSBiZWZvcmUgbG9naW4gZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogVGhpcyBmdW5jdGlvbiBwcm92aWRlcyBmdXJ0aGVyIGNvbnRyb2xcbiAqIGluIHZhbGlkYXRpbmcgYSBsb2dpbiBhdHRlbXB0LiBTcGVjaWZpY2FsbHksXG4gKiBpdCBpcyB0cmlnZ2VyZWQgYWZ0ZXIgYSB1c2VyIGVudGVyc1xuICogY29ycmVjdCBjcmVkZW50aWFscyAob3Igb3RoZXIgdmFsaWQgYXV0aERhdGEpLFxuICogYnV0IHByaW9yIHRvIGEgc2Vzc2lvbiBiZWluZyBnZW5lcmF0ZWQuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVMb2dpbigocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0pXG4gKlxuICogYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVMb2dpblxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlTG9naW5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBsb2dpbi4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9O1xuICovXG5QYXJzZUNsb3VkLmJlZm9yZUxvZ2luID0gZnVuY3Rpb24gKGhhbmRsZXIpIHtcbiAgbGV0IGNsYXNzTmFtZSA9ICdfVXNlcic7XG4gIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ3N0cmluZycgfHwgaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yKGhhbmRsZXIpKSB7XG4gICAgLy8gdmFsaWRhdGlvbiB3aWxsIG9jY3VyIGRvd25zdHJlYW0sIHRoaXMgaXMgdG8gbWFpbnRhaW4gaW50ZXJuYWxcbiAgICAvLyBjb2RlIGNvbnNpc3RlbmN5IHdpdGggdGhlIG90aGVyIGhvb2sgdHlwZXMuXG4gICAgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKGhhbmRsZXIpO1xuICAgIGhhbmRsZXIgPSBhcmd1bWVudHNbMV07XG4gIH1cbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcih0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbiwgY2xhc3NOYW1lLCBoYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbn07XG5cbi8qKlxuICpcbiAqIFJlZ2lzdGVycyB0aGUgYWZ0ZXIgbG9naW4gZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogVGhpcyBmdW5jdGlvbiBpcyB0cmlnZ2VyZWQgYWZ0ZXIgYSB1c2VyIGxvZ3MgaW4gc3VjY2Vzc2Z1bGx5LFxuICogYW5kIGFmdGVyIGEgX1Nlc3Npb24gb2JqZWN0IGhhcyBiZWVuIGNyZWF0ZWQuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxvZ2luKChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyTG9naW5cbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyTG9naW5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGxvZ2luLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJMb2dpbiA9IGZ1bmN0aW9uIChoYW5kbGVyKSB7XG4gIGxldCBjbGFzc05hbWUgPSAnX1VzZXInO1xuICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdzdHJpbmcnIHx8IGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihoYW5kbGVyKSkge1xuICAgIC8vIHZhbGlkYXRpb24gd2lsbCBvY2N1ciBkb3duc3RyZWFtLCB0aGlzIGlzIHRvIG1haW50YWluIGludGVybmFsXG4gICAgLy8gY29kZSBjb25zaXN0ZW5jeSB3aXRoIHRoZSBvdGhlciBob29rIHR5cGVzLlxuICAgIGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShoYW5kbGVyKTtcbiAgICBoYW5kbGVyID0gYXJndW1lbnRzWzFdO1xuICB9XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYWZ0ZXJMb2dpbiwgY2xhc3NOYW1lLCBoYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbn07XG5cbi8qKlxuICpcbiAqIFJlZ2lzdGVycyB0aGUgYWZ0ZXIgbG9nb3V0IGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gaXMgdHJpZ2dlcmVkIGFmdGVyIGEgdXNlciBsb2dzIG91dC5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyTG9nb3V0KChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyTG9nb3V0XG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckxvZ291dFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgbG9nb3V0LiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJMb2dvdXQgPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICBsZXQgY2xhc3NOYW1lID0gJ19TZXNzaW9uJztcbiAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnc3RyaW5nJyB8fCBpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3IoaGFuZGxlcikpIHtcbiAgICAvLyB2YWxpZGF0aW9uIHdpbGwgb2NjdXIgZG93bnN0cmVhbSwgdGhpcyBpcyB0byBtYWludGFpbiBpbnRlcm5hbFxuICAgIC8vIGNvZGUgY29uc2lzdGVuY3kgd2l0aCB0aGUgb3RoZXIgaG9vayB0eXBlcy5cbiAgICBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUoaGFuZGxlcik7XG4gICAgaGFuZGxlciA9IGFyZ3VtZW50c1sxXTtcbiAgfVxuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKHRyaWdnZXJzLlR5cGVzLmFmdGVyTG9nb3V0LCBjbGFzc05hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgc2F2ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYWZ0ZXJTYXZlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlclNhdmUoJ015Q3VzdG9tQ2xhc3MnLCBhc3luYyBmdW5jdGlvbihyZXF1ZXN0KSB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZShQYXJzZS5Vc2VyLCBhc3luYyBmdW5jdGlvbihyZXF1ZXN0KSB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICogYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlclNhdmVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgc2F2ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIHNhdmUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlclNhdmUgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIGRlbGV0ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYWZ0ZXJEZWxldGUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGUoJ015Q3VzdG9tQ2xhc3MnLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZShQYXJzZS5Vc2VyLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckRlbGV0ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIGRlbGV0ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGRlbGV0ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyRGVsZXRlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRGVsZXRlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGZpbmQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZUZpbmQgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRmluZCgnTXlDdXN0b21DbGFzcycsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUZpbmQoUGFyc2UuVXNlciwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlRmluZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRmluZFxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYmVmb3JlIGZpbmQgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgZmluZC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkJlZm9yZUZpbmRSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuQmVmb3JlRmluZFJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZUZpbmQgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRmluZCxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBmaW5kIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBhZnRlckZpbmQgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJGaW5kKCdNeUN1c3RvbUNsYXNzJywgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJGaW5kKFBhcnNlLlVzZXIsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyRmluZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJGaW5kXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBhZnRlciBmaW5kIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGZpbmQuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5BZnRlckZpbmRSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuQWZ0ZXJGaW5kUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJGaW5kID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBzYXZlIGZpbGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVTYXZlRmlsZVxuICogQGRlcHJlY2F0ZWRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVGaWxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIHNhdmluZyBhIGZpbGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZVNhdmVGaWxlID0gZnVuY3Rpb24gKGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICB1c2FnZTogJ1BhcnNlLkNsb3VkLmJlZm9yZVNhdmVGaWxlJyxcbiAgICBzb2x1dGlvbjogJ1VzZSBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlKFBhcnNlLkZpbGUsIChyZXF1ZXN0KSA9PiB7fSknLFxuICB9KTtcbiAgUGFyc2VDbG91ZC5iZWZvcmVTYXZlKFBhcnNlLkZpbGUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIHNhdmUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyU2F2ZUZpbGVcbiAqIEBkZXByZWNhdGVkXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlclNhdmVGaWxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgc2F2aW5nIGEgZmlsZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJTYXZlRmlsZSA9IGZ1bmN0aW9uIChoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgdXNhZ2U6ICdQYXJzZS5DbG91ZC5hZnRlclNhdmVGaWxlJyxcbiAgICBzb2x1dGlvbjogJ1VzZSBQYXJzZS5DbG91ZC5hZnRlclNhdmUoUGFyc2UuRmlsZSwgKHJlcXVlc3QpID0+IHt9KScsXG4gIH0pO1xuICBQYXJzZUNsb3VkLmFmdGVyU2F2ZShQYXJzZS5GaWxlLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcik7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBkZWxldGUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVEZWxldGVGaWxlXG4gKiBAZGVwcmVjYXRlZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBkZWxldGluZyBhIGZpbGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZURlbGV0ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oe1xuICAgIHVzYWdlOiAnUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZScsXG4gICAgc29sdXRpb246ICdVc2UgUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlKFBhcnNlLkZpbGUsIChyZXF1ZXN0KSA9PiB7fSknLFxuICB9KTtcbiAgUGFyc2VDbG91ZC5iZWZvcmVEZWxldGUoUGFyc2UuRmlsZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgZGVsZXRlIGZpbGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyRGVsZXRlRmlsZVxuICogQGRlcHJlY2F0ZWRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlRmlsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gYWZ0ZXIgYmVmb3JlIGRlbGV0aW5nIGEgZmlsZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlID0gZnVuY3Rpb24gKGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICB1c2FnZTogJ1BhcnNlLkNsb3VkLmFmdGVyRGVsZXRlRmlsZScsXG4gICAgc29sdXRpb246ICdVc2UgUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGUoUGFyc2UuRmlsZSwgKHJlcXVlc3QpID0+IHt9KScsXG4gIH0pO1xuICBQYXJzZUNsb3VkLmFmdGVyRGVsZXRlKFBhcnNlLkZpbGUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGxpdmUgcXVlcnkgc2VydmVyIGNvbm5lY3QgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVDb25uZWN0KGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUNvbm5lY3QoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlQ29ubmVjdFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlQ29ubmVjdFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gYmVmb3JlIGNvbm5lY3Rpb24gaXMgbWFkZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkNvbm5lY3RUcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkNvbm5lY3RUcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlQ29ubmVjdCA9IGZ1bmN0aW9uIChoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZENvbm5lY3RUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUNvbm5lY3QsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFNlbmRzIGFuIGVtYWlsIHRocm91Z2ggdGhlIFBhcnNlIFNlcnZlciBtYWlsIGFkYXB0ZXIuXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKiAqKlJlcXVpcmVzIGEgbWFpbCBhZGFwdGVyIHRvIGJlIGNvbmZpZ3VyZWQgZm9yIFBhcnNlIFNlcnZlci4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuc2VuZEVtYWlsKHtcbiAqICAgZnJvbTogJ0V4YW1wbGUgPHRlc3RAZXhhbXBsZS5jb20+JyxcbiAqICAgdG86ICdjb250YWN0QGV4YW1wbGUuY29tJyxcbiAqICAgc3ViamVjdDogJ1Rlc3QgZW1haWwnLFxuICogICB0ZXh0OiAnVGhpcyBlbWFpbCBpcyBhIHRlc3QuJ1xuICogfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2Qgc2VuZEVtYWlsXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5zZW5kRW1haWxcbiAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhIFRoZSBvYmplY3Qgb2YgdGhlIG1haWwgZGF0YSB0byBzZW5kLlxuICovXG5QYXJzZUNsb3VkLnNlbmRFbWFpbCA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGNvbnN0IGVtYWlsQWRhcHRlciA9IGNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyO1xuICBpZiAoIWVtYWlsQWRhcHRlcikge1xuICAgIGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLmVycm9yKFxuICAgICAgJ0ZhaWxlZCB0byBzZW5kIGVtYWlsIGJlY2F1c2Ugbm8gbWFpbCBhZGFwdGVyIGlzIGNvbmZpZ3VyZWQgZm9yIFBhcnNlIFNlcnZlci4nXG4gICAgKTtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIGVtYWlsQWRhcHRlci5zZW5kTWFpbChkYXRhKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGxpdmUgcXVlcnkgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBiZWZvcmVTdWJzY3JpYmUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlKCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlKFBhcnNlLlVzZXIsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZVN1YnNjcmliZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBiZWZvcmUgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIHN1YnNjcmlwdGlvbi4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIsIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZVN1YnNjcmliZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTdWJzY3JpYmUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuUGFyc2VDbG91ZC5vbkxpdmVRdWVyeUV2ZW50ID0gZnVuY3Rpb24gKGhhbmRsZXIpIHtcbiAgdHJpZ2dlcnMuYWRkTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVyKGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgbGl2ZSBxdWVyeSBzZXJ2ZXIgZXZlbnQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxpdmVRdWVyeUV2ZW50KCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJMaXZlUXVlcnlFdmVudCgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyTGl2ZVF1ZXJ5RXZlbnRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyTGl2ZVF1ZXJ5RXZlbnRcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIGxpdmUgcXVlcnkgZXZlbnQgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgYSBsaXZlIHF1ZXJ5IGV2ZW50LiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciwgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuTGl2ZVF1ZXJ5RXZlbnRUcmlnZ2VyfS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuTGl2ZVF1ZXJ5RXZlbnRUcmlnZ2VyfSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckxpdmVRdWVyeUV2ZW50ID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRXZlbnQsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuUGFyc2VDbG91ZC5fcmVtb3ZlQWxsSG9va3MgPSAoKSA9PiB7XG4gIHRyaWdnZXJzLl91bnJlZ2lzdGVyQWxsKCk7XG59O1xuXG5QYXJzZUNsb3VkLnVzZU1hc3RlcktleSA9ICgpID0+IHtcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lXG4gIGNvbnNvbGUud2FybihcbiAgICAnUGFyc2UuQ2xvdWQudXNlTWFzdGVyS2V5IGlzIGRlcHJlY2F0ZWQgKGFuZCBoYXMgbm8gZWZmZWN0IGFueW1vcmUpIG9uIHBhcnNlLXNlcnZlciwgcGxlYXNlIHJlZmVyIHRvIHRoZSBjbG91ZCBjb2RlIG1pZ3JhdGlvbiBub3RlczogaHR0cDovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvcGFyc2Utc2VydmVyL2d1aWRlLyNtYXN0ZXIta2V5LW11c3QtYmUtcGFzc2VkLWV4cGxpY2l0bHknXG4gICk7XG59O1xuXG5jb25zdCByZXF1ZXN0ID0gcmVxdWlyZSgnLi9odHRwUmVxdWVzdCcpO1xuUGFyc2VDbG91ZC5odHRwUmVxdWVzdCA9IG9wdHMgPT4ge1xuICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgdXNhZ2U6ICdQYXJzZS5DbG91ZC5odHRwUmVxdWVzdCcsXG4gICAgc29sdXRpb246ICdVc2UgYSBodHRwIHJlcXVlc3QgbGlicmFyeSBpbnN0ZWFkLicsXG4gIH0pO1xuICByZXR1cm4gcmVxdWVzdChvcHRzKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUGFyc2VDbG91ZDtcblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0XG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gbWFzdGVyIElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBpc0NoYWxsZW5nZSBJZiB0cnVlLCBtZWFucyB0aGUgY3VycmVudCByZXF1ZXN0IGlzIG9yaWdpbmFsbHkgdHJpZ2dlcmVkIGJ5IGFuIGF1dGggY2hhbGxlbmdlLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRyaWdnZXJpbmcgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaXAgVGhlIElQIGFkZHJlc3Mgb2YgdGhlIGNsaWVudCBtYWtpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge09iamVjdH0gaGVhZGVycyBUaGUgb3JpZ2luYWwgSFRUUCBoZWFkZXJzIGZvciB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0cmlnZ2VyTmFtZSBUaGUgbmFtZSBvZiB0aGUgdHJpZ2dlciAoYGJlZm9yZVNhdmVgLCBgYWZ0ZXJTYXZlYCwgLi4uKVxuICogQHByb3BlcnR5IHtPYmplY3R9IGxvZyBUaGUgY3VycmVudCBsb2dnZXIgaW5zaWRlIFBhcnNlIFNlcnZlci5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuT2JqZWN0fSBvcmlnaW5hbCBJZiBzZXQsIHRoZSBvYmplY3QsIGFzIGN1cnJlbnRseSBzdG9yZWQuXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLkZpbGV9IGZpbGUgVGhlIGZpbGUgdGhhdCB0cmlnZ2VyZWQgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGZpbGVTaXplIFRoZSBzaXplIG9mIHRoZSBmaWxlIGluIGJ5dGVzLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBjb250ZW50TGVuZ3RoIFRoZSB2YWx1ZSBmcm9tIENvbnRlbnQtTGVuZ3RoIGhlYWRlclxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlRmlsZWAsIGBhZnRlclNhdmVGaWxlYClcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5Db25uZWN0VHJpZ2dlclJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSB1c2VNYXN0ZXJLZXkgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGNsaWVudHMgVGhlIG51bWJlciBvZiBjbGllbnRzIGNvbm5lY3RlZC5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gc3Vic2NyaXB0aW9ucyBUaGUgbnVtYmVyIG9mIHN1YnNjcmlwdGlvbnMgY29ubmVjdGVkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHNlc3Npb25Ub2tlbiBJZiBzZXQsIHRoZSBzZXNzaW9uIG9mIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuTGl2ZVF1ZXJ5RXZlbnRUcmlnZ2VyXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gdXNlTWFzdGVyS2V5IElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHNlc3Npb25Ub2tlbiBJZiBzZXQsIHRoZSBzZXNzaW9uIG9mIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBldmVudCBUaGUgbGl2ZSBxdWVyeSBldmVudCB0aGF0IHRyaWdnZXJlZCB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuT2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9yaWdpbmFsIElmIHNldCwgdGhlIG9iamVjdCwgYXMgY3VycmVudGx5IHN0b3JlZC5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gY2xpZW50cyBUaGUgbnVtYmVyIG9mIGNsaWVudHMgY29ubmVjdGVkLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBzdWJzY3JpcHRpb25zIFRoZSBudW1iZXIgb2Ygc3Vic2NyaXB0aW9ucyBjb25uZWN0ZWQuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHNlbmRFdmVudCBJZiB0aGUgTGl2ZVF1ZXJ5IGV2ZW50IHNob3VsZCBiZSBzZW50IHRvIHRoZSBjbGllbnQuIFNldCB0byBmYWxzZSB0byBwcmV2ZW50IExpdmVRdWVyeSBmcm9tIHB1c2hpbmcgdG8gdGhlIGNsaWVudC5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuQmVmb3JlRmluZFJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLlF1ZXJ5fSBxdWVyeSBUaGUgcXVlcnkgdHJpZ2dlcmluZyB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpcCBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgY2xpZW50IG1ha2luZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBvcmlnaW5hbCBIVFRQIGhlYWRlcnMgZm9yIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRyaWdnZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSB0cmlnZ2VyIChgYmVmb3JlU2F2ZWAsIGBhZnRlclNhdmVgLCAuLi4pXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBpc0dldCB3ZXRoZXIgdGhlIHF1ZXJ5IGEgYGdldGAgb3IgYSBgZmluZGBcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWcuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkFmdGVyRmluZFJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLlF1ZXJ5fSBxdWVyeSBUaGUgcXVlcnkgdHJpZ2dlcmluZyB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7QXJyYXk8UGFyc2UuT2JqZWN0Pn0gcmVzdWx0cyBUaGUgcmVzdWx0cyB0aGUgcXVlcnkgeWllbGRlZC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpcCBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgY2xpZW50IG1ha2luZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBvcmlnaW5hbCBIVFRQIGhlYWRlcnMgZm9yIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRyaWdnZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSB0cmlnZ2VyIChgYmVmb3JlU2F2ZWAsIGBhZnRlclNhdmVgLCAuLi4pXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICogQHByb3BlcnR5IHtPYmplY3R9IGNvbmZpZyBUaGUgUGFyc2UgU2VydmVyIGNvbmZpZy5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuRnVuY3Rpb25SZXF1ZXN0XG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gbWFzdGVyIElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1zIHBhc3NlZCB0byB0aGUgY2xvdWQgZnVuY3Rpb24uXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5Kb2JSZXF1ZXN0XG4gKiBAcHJvcGVydHkge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbXMgcGFzc2VkIHRvIHRoZSBiYWNrZ3JvdW5kIGpvYi5cbiAqIEBwcm9wZXJ0eSB7ZnVuY3Rpb259IG1lc3NhZ2UgSWYgbWVzc2FnZSBpcyBjYWxsZWQgd2l0aCBhIHN0cmluZyBhcmd1bWVudCwgd2lsbCB1cGRhdGUgdGhlIGN1cnJlbnQgbWVzc2FnZSB0byBiZSBzdG9yZWQgaW4gdGhlIGpvYiBzdGF0dXMuXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3RcbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gcmVxdWlyZVVzZXIgd2hldGhlciB0aGUgY2xvdWQgdHJpZ2dlciByZXF1aXJlcyBhIHVzZXIuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHJlcXVpcmVNYXN0ZXIgd2hldGhlciB0aGUgY2xvdWQgdHJpZ2dlciByZXF1aXJlcyBhIG1hc3RlciBrZXkuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHZhbGlkYXRlTWFzdGVyS2V5IHdoZXRoZXIgdGhlIHZhbGlkYXRvciBzaG91bGQgcnVuIGlmIG1hc3RlcktleSBpcyBwcm92aWRlZC4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHNraXBXaXRoTWFzdGVyS2V5IHdoZXRoZXIgdGhlIGNsb3VkIGNvZGUgZnVuY3Rpb24gc2hvdWxkIGJlIGlnbm9yZWQgdXNpbmcgYSBtYXN0ZXJLZXkuXG4gKlxuICogQHByb3BlcnR5IHtBcnJheTxTdHJpbmc+fE9iamVjdH0gcmVxdWlyZVVzZXJLZXlzIElmIHNldCwga2V5cyByZXF1aXJlZCBvbiByZXF1ZXN0LnVzZXIgdG8gbWFrZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSByZXF1aXJlVXNlcktleXMuZmllbGQgSWYgcmVxdWlyZVVzZXJLZXlzIGlzIGFuIG9iamVjdCwgbmFtZSBvZiBmaWVsZCB0byB2YWxpZGF0ZSBvbiByZXF1ZXN0IHVzZXJcbiAqIEBwcm9wZXJ0eSB7QXJyYXl8ZnVuY3Rpb258QW55fSByZXF1aXJlVXNlcktleXMuZmllbGQub3B0aW9ucyBhcnJheSBvZiBvcHRpb25zIHRoYXQgdGhlIGZpZWxkIGNhbiBiZSwgZnVuY3Rpb24gdG8gdmFsaWRhdGUgZmllbGQsIG9yIHNpbmdsZSB2YWx1ZS4gVGhyb3cgYW4gZXJyb3IgaWYgdmFsdWUgaXMgaW52YWxpZC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSByZXF1aXJlVXNlcktleXMuZmllbGQuZXJyb3IgY3VzdG9tIGVycm9yIG1lc3NhZ2UgaWYgZmllbGQgaXMgaW52YWxpZC5cbiAqXG4gKiBAcHJvcGVydHkge0FycmF5PFN0cmluZz58ZnVuY3Rpb259cmVxdWlyZUFueVVzZXJSb2xlcyBJZiBzZXQsIHJlcXVlc3QudXNlciBoYXMgdG8gYmUgcGFydCBvZiBhdCBsZWFzdCBvbmUgcm9sZXMgbmFtZSB0byBtYWtlIHRoZSByZXF1ZXN0LiBJZiBzZXQgdG8gYSBmdW5jdGlvbiwgZnVuY3Rpb24gbXVzdCByZXR1cm4gcm9sZSBuYW1lcy5cbiAqIEBwcm9wZXJ0eSB7QXJyYXk8U3RyaW5nPnxmdW5jdGlvbn1yZXF1aXJlQWxsVXNlclJvbGVzIElmIHNldCwgcmVxdWVzdC51c2VyIGhhcyB0byBiZSBwYXJ0IGFsbCByb2xlcyBuYW1lIHRvIG1ha2UgdGhlIHJlcXVlc3QuIElmIHNldCB0byBhIGZ1bmN0aW9uLCBmdW5jdGlvbiBtdXN0IHJldHVybiByb2xlIG5hbWVzLlxuICpcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fEFycmF5PFN0cmluZz59IGZpZWxkcyBpZiBhbiBhcnJheSBvZiBzdHJpbmdzLCB2YWxpZGF0b3Igd2lsbCBsb29rIGZvciBrZXlzIGluIHJlcXVlc3QucGFyYW1zLCBhbmQgdGhyb3cgaWYgbm90IHByb3ZpZGVkLiBJZiBPYmplY3QsIGZpZWxkcyB0byB2YWxpZGF0ZS4gSWYgdGhlIHRyaWdnZXIgaXMgYSBjbG91ZCBmdW5jdGlvbiwgYHJlcXVlc3QucGFyYW1zYCB3aWxsIGJlIHZhbGlkYXRlZCwgb3RoZXJ3aXNlIGByZXF1ZXN0Lm9iamVjdGAuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gZmllbGRzLmZpZWxkIG5hbWUgb2YgZmllbGQgdG8gdmFsaWRhdGUuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gZmllbGRzLmZpZWxkLnR5cGUgZXhwZWN0ZWQgdHlwZSBvZiBkYXRhIGZvciBmaWVsZC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gZmllbGRzLmZpZWxkLmNvbnN0YW50IHdoZXRoZXIgdGhlIGZpZWxkIGNhbiBiZSBtb2RpZmllZCBvbiB0aGUgb2JqZWN0LlxuICogQHByb3BlcnR5IHtBbnl9IGZpZWxkcy5maWVsZC5kZWZhdWx0IGRlZmF1bHQgdmFsdWUgaWYgZmllbGQgaXMgYG51bGxgLCBvciBpbml0aWFsIHZhbHVlIGBjb25zdGFudGAgaXMgYHRydWVgLlxuICogQHByb3BlcnR5IHtBcnJheXxmdW5jdGlvbnxBbnl9IGZpZWxkcy5maWVsZC5vcHRpb25zIGFycmF5IG9mIG9wdGlvbnMgdGhhdCB0aGUgZmllbGQgY2FuIGJlLCBmdW5jdGlvbiB0byB2YWxpZGF0ZSBmaWVsZCwgb3Igc2luZ2xlIHZhbHVlLiBUaHJvdyBhbiBlcnJvciBpZiB2YWx1ZSBpcyBpbnZhbGlkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGZpZWxkcy5maWVsZC5lcnJvciBjdXN0b20gZXJyb3IgbWVzc2FnZSBpZiBmaWVsZCBpcyBpbnZhbGlkLlxuICovXG4iXX0=