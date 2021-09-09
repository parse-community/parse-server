import { getValidator, resolveError } from '../triggers';
import Parse from 'parse/node';
export function validateValidator(validator) {
  if (!validator || typeof validator === 'function') {
    return;
  }
  const fieldOptions = {
    type: ['Any'],
    constant: [Boolean],
    default: ['Any'],
    options: [Array, 'function', 'Any'],
    required: [Boolean],
    error: [String],
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
      throw `Invalid type for Cloud Function validation key ${key}. Expected ${types.join(
        '|'
      )}, actual ${type}`;
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
export async function maybeRunValidator(request, functionName, auth) {
  const theValidator = getValidator(functionName, Parse.applicationId);
  if (!theValidator) {
    return;
  }
  if (typeof theValidator === 'object' && theValidator.skipWithMasterKey && request.master) {
    request.skipWithMasterKey = true;
  }
  try {
    if (typeof theValidator === 'object') {
      await builtInTriggerValidator(theValidator, request, auth);
    } else {
      await theValidator(request);
    }
  } catch (e) {
    const error = resolveError(e, {
      code: Parse.Error.VALIDATION_ERROR,
      message: 'Validation failed.',
    });
    throw error;
  }
}
async function builtInTriggerValidator(options, request, auth) {
  if (request.master && !options.validateMasterKey) {
    return;
  }
  let reqUser = request.user;
  if (
    !reqUser &&
    request.object &&
    request.object.className === '_User' &&
    !request.object.existed()
  ) {
    reqUser = request.object;
  }
  if (
    (options.requireUser || options.requireAnyUserRoles || options.requireAllUserRoles) &&
    !reqUser
  ) {
    throw 'Validation failed. Please login to continue.';
  }
  if (options.requireMaster && !request.master) {
    throw 'Validation failed. Master key is required to complete this request.';
  }
  let params = request.params || {};
  if (request.object) {
    params = request.object.toJSON();
  }
  const requiredParam = key => {
    const value = params[key];
    if (value == null) {
      throw `Validation failed. Please specify data for ${key}.`;
    }
  };

  const validateOptions = async (opt, key, val) => {
    let opts = opt.options;
    if (typeof opts === 'function') {
      try {
        const result = await opts(val);
        if (!result && result != null) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }
      } catch (e) {
        if (!e) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }

        throw opt.error || e.message || e;
      }
      return;
    }
    if (!Array.isArray(opts)) {
      opts = [opt.options];
    }

    if (!opts.includes(val)) {
      throw (
        opt.error || `Validation failed. Invalid option for ${key}. Expected: ${opts.join(', ')}`
      );
    }
  };

  const getType = fn => {
    const match = fn && fn.toString().match(/^\s*function (\w+)/);
    return (match ? match[1] : '').toLowerCase();
  };
  if (Array.isArray(options.fields)) {
    for (const key of options.fields) {
      requiredParam(key);
    }
  } else {
    const optionPromises = [];
    for (const key in options.fields) {
      const opt = options.fields[key];
      let val = params[key];
      if (typeof opt === 'string') {
        requiredParam(opt);
      }
      if (typeof opt === 'object') {
        if (opt.default != null && val == null) {
          val = opt.default;
          params[key] = val;
          if (request.object) {
            request.object.set(key, val);
          }
        }
        if (opt.constant && request.object) {
          if (request.original) {
            request.object.set(key, request.original.get(key));
          } else if (opt.default != null) {
            request.object.set(key, opt.default);
          }
        }
        if (opt.required) {
          requiredParam(key);
        }
        const optional = !opt.required && val === undefined;
        if (!optional) {
          if (opt.type) {
            const type = getType(opt.type);
            const valType = Array.isArray(val) ? 'array' : typeof val;
            if (valType !== type) {
              throw `Validation failed. Invalid type for ${key}. Expected: ${type}`;
            }
          }
          if (opt.options) {
            optionPromises.push(validateOptions(opt, key, val));
          }
        }
      }
    }
    await Promise.all(optionPromises);
  }
  let userRoles = options.requireAnyUserRoles;
  let requireAllRoles = options.requireAllUserRoles;
  const promises = [Promise.resolve(), Promise.resolve(), Promise.resolve()];
  if (userRoles || requireAllRoles) {
    promises[0] = auth.getUserRoles();
  }
  if (typeof userRoles === 'function') {
    promises[1] = userRoles();
  }
  if (typeof requireAllRoles === 'function') {
    promises[2] = requireAllRoles();
  }
  const [roles, resolvedUserRoles, resolvedRequireAll] = await Promise.all(promises);
  if (resolvedUserRoles && Array.isArray(resolvedUserRoles)) {
    userRoles = resolvedUserRoles;
  }
  if (resolvedRequireAll && Array.isArray(resolvedRequireAll)) {
    requireAllRoles = resolvedRequireAll;
  }
  if (userRoles) {
    const hasRole = userRoles.some(requiredRole => roles.includes(`role:${requiredRole}`));
    if (!hasRole) {
      throw `Validation failed. User does not match the required roles.`;
    }
  }
  if (requireAllRoles) {
    for (const requiredRole of requireAllRoles) {
      if (!roles.includes(`role:${requiredRole}`)) {
        throw `Validation failed. User does not match all the required roles.`;
      }
    }
  }
  const userKeys = options.requireUserKeys || [];
  if (Array.isArray(userKeys)) {
    for (const key of userKeys) {
      if (!reqUser) {
        throw 'Please login to make this request.';
      }

      if (reqUser.get(key) == null) {
        throw `Validation failed. Please set data for ${key} on your account.`;
      }
    }
  } else if (typeof userKeys === 'object') {
    const optionPromises = [];
    for (const key in options.requireUserKeys) {
      const opt = options.requireUserKeys[key];
      if (opt.options) {
        optionPromises.push(validateOptions(opt, key, reqUser.get(key)));
      }
    }
    await Promise.all(optionPromises);
  }
}
