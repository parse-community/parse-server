import { getValidator } from './TriggerStore';
import { resolveError } from './Utils';

export async function maybeRunValidator(request, functionName, auth) {
  const theValidator = getValidator(functionName, Parse.applicationId);
  if (!theValidator) {
    return;
  }

  if (typeof theValidator === 'object' && theValidator.skipWithMasterKey && request.master) {
    request.skipWithMasterKey = true;
    return;
  }

  try {
    if (typeof theValidator === 'object') {
      await builtInTriggerValidator(theValidator, request, auth);
      return;
    }

    await theValidator(request);
  } catch (e) {
    throw resolveError(e, {
      code: Parse.Error.VALIDATION_ERROR,
      message: 'Validation failed.',
    });
  }
}

const requiredParam = (params, key) => {
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
      throw opt.error || e.message || e || `Validation failed. Invalid value for ${key}.`;
    }
    return;
  }

  opts = Array.isArray(opts) ? opts : [opts];

  if (!opts.includes(val)) {
    throw (
      opt.error || `Validation failed. Invalid option for ${key}. Expected: ${opts.join(', ')}`
    );
  }
};

const getType = fn => {
  const match = fn && fn.toString().match(/\^\s*function (\w+)/);
  return (match ? match[1] : '').toLowerCase();
};

const processField = async (opt, key, params, request) => {
  let val = params[key];

  if (opt.default != null && val == null) {
    val = opt.default;
    params[key] = val;
    request.object?.set(key, val);
  }

  if (opt.constant && request.object) {
    if (request.original) {
      request.object.revert(key);
    } else if (opt.default != null) {
      request.object.set(key, opt.default);
    }
  }

  if (opt.required) {
    requiredParam(params, key);
  }

  if (!opt.required && val === undefined) {
    return;
  }

  if (opt.type) {
    const type = getType(opt.type);
    const valType = Array.isArray(val) ? 'array' : typeof val;
    if (valType !== type) {
      throw `Validation failed. Invalid type for ${key}. Expected: ${type}`;
    }
  }

  if (opt.options) {
    await validateOptions(opt, key, val);
  }
};

const processFields = async (fields, params, request) => {
  const promises = Object.entries(fields).map(async ([key, opt]) => {
    if (typeof opt === 'string') {
      return requiredParam(params, opt);
    }
    return processField(opt, key, params, request);
  });
  await Promise.all(promises);
};

const validateRoles = async (options, auth, roles) => {
  const [userRoles, requireAllRoles] = await Promise.all([
    Array.isArray(options.requireAnyUserRoles)
      ? options.requireAnyUserRoles
      : options.requireAnyUserRoles?.(),
    Array.isArray(options.requireAllUserRoles)
      ? options.requireAllUserRoles
      : options.requireAllUserRoles?.(),
  ]);

  if (userRoles) {
    const hasRole = userRoles.some(role => roles.includes(`role:${role}`));
    if (!hasRole) {
      throw 'Validation failed. User does not match the required roles.';
    }
  }

  if (requireAllRoles) {
    const missingRoles = requireAllRoles.filter(role => !roles.includes(`role:${role}`));
    if (missingRoles.length) {
      throw 'Validation failed. User does not match all the required roles.';
    }
  }
};

const validateUserKeys = async (options, reqUser) => {
  if (Array.isArray(options.requireUserKeys)) {
    options.requireUserKeys.forEach(key => {
      if (!reqUser || reqUser.get(key) == null) {
        throw `Validation failed. Please set data for ${key} on your account.`;
      }
    });
    return;
  }

  const promises = Object.entries(options.requireUserKeys || {}).map(([key, opt]) =>
    validateOptions(opt, key, reqUser.get(key))
  );
  await Promise.all(promises);
};

async function builtInTriggerValidator(options, request, auth) {
  if (request.master && !options.validateMasterKey) {
    return;
  }

  const reqUser = request.user || (request.object?.className === '_User' && !request.object.existed() ? request.object : null);

  if ((options.requireUser || options.requireAnyUserRoles || options.requireAllUserRoles) && !reqUser) {
    throw 'Validation failed. Please login to continue.';
  }

  if (options.requireMaster && !request.master) {
    throw 'Validation failed. Master key is required to complete this request.';
  }

  const params = request.object?.toJSON() || request.params || {};

  const fieldPromises = [];

  if (Array.isArray(options.fields)) {
    fieldPromises.push(...options.fields.map(field => requiredParam(params, field)));
  } else if (typeof options.fields === 'object') {
    fieldPromises.push(processFields(options.fields, params, request));
  }

  const roles = await auth.getUserRoles();

  await Promise.all([
    ...fieldPromises,
    validateRoles(options, auth, roles),
    validateUserKeys(options, reqUser),
  ]);
}
