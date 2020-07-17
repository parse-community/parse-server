function numberParser(key) {
  return function (opt) {
    const intOpt = parseInt(opt);
    if (!Number.isInteger(intOpt)) {
      throw new Error(`Key ${key} has invalid value ${opt}`);
    }
    return intOpt;
  };
}

function numberOrBoolParser(key) {
  return function (opt) {
    if (typeof opt === 'boolean') {
      return opt;
    }
    if (opt === 'true') {
      return true;
    }
    if (opt === 'false') {
      return false;
    }
    return numberParser(key)(opt);
  };
}

function objectParser(opt) {
  if (typeof opt == 'object') {
    return opt;
  }
  return JSON.parse(opt);
}

function arrayParser(opt) {
  if (Array.isArray(opt)) {
    return opt;
  } else if (typeof opt === 'string') {
    return opt.split(',');
  } else {
    throw new Error(`${opt} should be a comma separated string or an array`);
  }
}

function moduleOrObjectParser(opt) {
  if (typeof opt == 'object') {
    return opt;
  }
  try {
    return JSON.parse(opt);
  } catch (e) {
    /* */
  }
  return opt;
}

function booleanParser(opt) {
  if (opt == true || opt == 'true' || opt == '1') {
    return true;
  }
  return false;
}

function nullParser(opt) {
  if (opt == 'null') {
    return null;
  }
  return opt;
}

module.exports = {
  numberParser,
  numberOrBoolParser,
  nullParser,
  booleanParser,
  moduleOrObjectParser,
  arrayParser,
  objectParser,
};
