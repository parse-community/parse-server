export function numberParser(key) {
  return function(opt) {
    opt = parseInt(opt);
    if (!Number.isInteger(opt)) {
      throw new Error(`The ${key} is invalid`);
    }
    return opt;
  }
}

export function numberOrBoolParser(key) {
  return function(opt) {
    if (typeof opt === 'boolean') {
      return opt;
    }
    return numberParser(key)(opt);
  }
}

export function objectParser(opt) {
  if (typeof opt == 'object') {
    return opt;
  }
  return JSON.parse(opt)
}

export function arrayParser(opt) {
  if (Array.isArray(opt)) {
    return opt;
  } else if (typeof opt === 'string') {
    return opt.split(',');
  } else {
    throw new Error(`${opt} should be a comma separated string or an array`);
  }
}

export function moduleOrObjectParser(opt) {
  if (typeof opt == 'object')  {
    return opt;
  }
  try {
    return JSON.parse(opt);
  } catch(e) {}
  return opt;
}

export function booleanParser(opt) {
  if (opt == true || opt == "true" || opt == "1") {
    return true;
  }
  return false;
}

export function nullParser(opt) {
  if (opt == 'null') {
    return null;
  }
  return opt;
}
