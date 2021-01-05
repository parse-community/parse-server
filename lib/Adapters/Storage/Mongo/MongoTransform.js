"use strict";

var _logger = _interopRequireDefault(require("../../../logger"));

var _lodash = _interopRequireDefault(require("lodash"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var mongodb = require('mongodb');

var Parse = require('parse/node').Parse;

const transformKey = (className, fieldName, schema) => {
  // Check if the schema is known since it's a built-in field.
  switch (fieldName) {
    case 'objectId':
      return '_id';

    case 'createdAt':
      return '_created_at';

    case 'updatedAt':
      return '_updated_at';

    case 'sessionToken':
      return '_session_token';

    case 'lastUsed':
      return '_last_used';

    case 'timesUsed':
      return 'times_used';
  }

  if (schema.fields[fieldName] && schema.fields[fieldName].__type == 'Pointer') {
    fieldName = '_p_' + fieldName;
  } else if (schema.fields[fieldName] && schema.fields[fieldName].type == 'Pointer') {
    fieldName = '_p_' + fieldName;
  }

  return fieldName;
};

const transformKeyValueForUpdate = (className, restKey, restValue, parseFormatSchema) => {
  // Check if the schema is known since it's a built-in field.
  var key = restKey;
  var timeField = false;

  switch (key) {
    case 'objectId':
    case '_id':
      if (['_GlobalConfig', '_GraphQLConfig'].includes(className)) {
        return {
          key: key,
          value: parseInt(restValue)
        };
      }

      key = '_id';
      break;

    case 'createdAt':
    case '_created_at':
      key = '_created_at';
      timeField = true;
      break;

    case 'updatedAt':
    case '_updated_at':
      key = '_updated_at';
      timeField = true;
      break;

    case 'sessionToken':
    case '_session_token':
      key = '_session_token';
      break;

    case 'expiresAt':
    case '_expiresAt':
      key = 'expiresAt';
      timeField = true;
      break;

    case '_email_verify_token_expires_at':
      key = '_email_verify_token_expires_at';
      timeField = true;
      break;

    case '_account_lockout_expires_at':
      key = '_account_lockout_expires_at';
      timeField = true;
      break;

    case '_failed_login_count':
      key = '_failed_login_count';
      break;

    case '_perishable_token_expires_at':
      key = '_perishable_token_expires_at';
      timeField = true;
      break;

    case '_password_changed_at':
      key = '_password_changed_at';
      timeField = true;
      break;

    case '_rperm':
    case '_wperm':
      return {
        key: key,
        value: restValue
      };

    case 'lastUsed':
    case '_last_used':
      key = '_last_used';
      timeField = true;
      break;

    case 'timesUsed':
    case 'times_used':
      key = 'times_used';
      timeField = true;
      break;
  }

  if (parseFormatSchema.fields[key] && parseFormatSchema.fields[key].type === 'Pointer' || !parseFormatSchema.fields[key] && restValue && restValue.__type == 'Pointer') {
    key = '_p_' + key;
  } // Handle atomic values


  var value = transformTopLevelAtom(restValue);

  if (value !== CannotTransform) {
    if (timeField && typeof value === 'string') {
      value = new Date(value);
    }

    if (restKey.indexOf('.') > 0) {
      return {
        key,
        value: restValue
      };
    }

    return {
      key,
      value
    };
  } // Handle arrays


  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return {
      key,
      value
    };
  } // Handle update operators


  if (typeof restValue === 'object' && '__op' in restValue) {
    return {
      key,
      value: transformUpdateOperator(restValue, false)
    };
  } // Handle normal objects by recursing


  value = mapValues(restValue, transformInteriorValue);
  return {
    key,
    value
  };
};

const isRegex = value => {
  return value && value instanceof RegExp;
};

const isStartsWithRegex = value => {
  if (!isRegex(value)) {
    return false;
  }

  const matches = value.toString().match(/\/\^\\Q.*\\E\//);
  return !!matches;
};

const isAllValuesRegexOrNone = values => {
  if (!values || !Array.isArray(values) || values.length === 0) {
    return true;
  }

  const firstValuesIsRegex = isStartsWithRegex(values[0]);

  if (values.length === 1) {
    return firstValuesIsRegex;
  }

  for (let i = 1, length = values.length; i < length; ++i) {
    if (firstValuesIsRegex !== isStartsWithRegex(values[i])) {
      return false;
    }
  }

  return true;
};

const isAnyValueRegex = values => {
  return values.some(function (value) {
    return isRegex(value);
  });
};

const transformInteriorValue = restValue => {
  if (restValue !== null && typeof restValue === 'object' && Object.keys(restValue).some(key => key.includes('$') || key.includes('.'))) {
    throw new Parse.Error(Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
  } // Handle atomic values


  var value = transformInteriorAtom(restValue);

  if (value !== CannotTransform) {
    return value;
  } // Handle arrays


  if (restValue instanceof Array) {
    return restValue.map(transformInteriorValue);
  } // Handle update operators


  if (typeof restValue === 'object' && '__op' in restValue) {
    return transformUpdateOperator(restValue, true);
  } // Handle normal objects by recursing


  return mapValues(restValue, transformInteriorValue);
};

const valueAsDate = value => {
  if (typeof value === 'string') {
    return new Date(value);
  } else if (value instanceof Date) {
    return value;
  }

  return false;
};

function transformQueryKeyValue(className, key, value, schema, count = false) {
  switch (key) {
    case 'createdAt':
      if (valueAsDate(value)) {
        return {
          key: '_created_at',
          value: valueAsDate(value)
        };
      }

      key = '_created_at';
      break;

    case 'updatedAt':
      if (valueAsDate(value)) {
        return {
          key: '_updated_at',
          value: valueAsDate(value)
        };
      }

      key = '_updated_at';
      break;

    case 'expiresAt':
      if (valueAsDate(value)) {
        return {
          key: 'expiresAt',
          value: valueAsDate(value)
        };
      }

      break;

    case '_email_verify_token_expires_at':
      if (valueAsDate(value)) {
        return {
          key: '_email_verify_token_expires_at',
          value: valueAsDate(value)
        };
      }

      break;

    case 'objectId':
      {
        if (['_GlobalConfig', '_GraphQLConfig'].includes(className)) {
          value = parseInt(value);
        }

        return {
          key: '_id',
          value
        };
      }

    case '_account_lockout_expires_at':
      if (valueAsDate(value)) {
        return {
          key: '_account_lockout_expires_at',
          value: valueAsDate(value)
        };
      }

      break;

    case '_failed_login_count':
      return {
        key,
        value
      };

    case 'sessionToken':
      return {
        key: '_session_token',
        value
      };

    case '_perishable_token_expires_at':
      if (valueAsDate(value)) {
        return {
          key: '_perishable_token_expires_at',
          value: valueAsDate(value)
        };
      }

      break;

    case '_password_changed_at':
      if (valueAsDate(value)) {
        return {
          key: '_password_changed_at',
          value: valueAsDate(value)
        };
      }

      break;

    case '_rperm':
    case '_wperm':
    case '_perishable_token':
    case '_email_verify_token':
      return {
        key,
        value
      };

    case '$or':
    case '$and':
    case '$nor':
      return {
        key: key,
        value: value.map(subQuery => transformWhere(className, subQuery, schema, count))
      };

    case 'lastUsed':
      if (valueAsDate(value)) {
        return {
          key: '_last_used',
          value: valueAsDate(value)
        };
      }

      key = '_last_used';
      break;

    case 'timesUsed':
      return {
        key: 'times_used',
        value: value
      };

    default:
      {
        // Other auth data
        const authDataMatch = key.match(/^authData\.([a-zA-Z0-9_]+)\.id$/);

        if (authDataMatch) {
          const provider = authDataMatch[1]; // Special-case auth data.

          return {
            key: `_auth_data_${provider}.id`,
            value
          };
        }
      }
  }

  const expectedTypeIsArray = schema && schema.fields[key] && schema.fields[key].type === 'Array';
  const expectedTypeIsPointer = schema && schema.fields[key] && schema.fields[key].type === 'Pointer';
  const field = schema && schema.fields[key];

  if (expectedTypeIsPointer || !schema && value && value.__type === 'Pointer') {
    key = '_p_' + key;
  } // Handle query constraints


  const transformedConstraint = transformConstraint(value, field, count);

  if (transformedConstraint !== CannotTransform) {
    if (transformedConstraint.$text) {
      return {
        key: '$text',
        value: transformedConstraint.$text
      };
    }

    if (transformedConstraint.$elemMatch) {
      return {
        key: '$nor',
        value: [{
          [key]: transformedConstraint
        }]
      };
    }

    return {
      key,
      value: transformedConstraint
    };
  }

  if (expectedTypeIsArray && !(value instanceof Array)) {
    return {
      key,
      value: {
        $all: [transformInteriorAtom(value)]
      }
    };
  } // Handle atomic values


  if (transformTopLevelAtom(value) !== CannotTransform) {
    return {
      key,
      value: transformTopLevelAtom(value)
    };
  } else {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `You cannot use ${value} as a query parameter.`);
  }
} // Main exposed method to help run queries.
// restWhere is the "where" clause in REST API form.
// Returns the mongo form of the query.


function transformWhere(className, restWhere, schema, count = false) {
  const mongoWhere = {};

  for (const restKey in restWhere) {
    const out = transformQueryKeyValue(className, restKey, restWhere[restKey], schema, count);
    mongoWhere[out.key] = out.value;
  }

  return mongoWhere;
}

const parseObjectKeyValueToMongoObjectKeyValue = (restKey, restValue, schema) => {
  // Check if the schema is known since it's a built-in field.
  let transformedValue;
  let coercedToDate;

  switch (restKey) {
    case 'objectId':
      return {
        key: '_id',
        value: restValue
      };

    case 'expiresAt':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: 'expiresAt',
        value: coercedToDate
      };

    case '_email_verify_token_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_email_verify_token_expires_at',
        value: coercedToDate
      };

    case '_account_lockout_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_account_lockout_expires_at',
        value: coercedToDate
      };

    case '_perishable_token_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_perishable_token_expires_at',
        value: coercedToDate
      };

    case '_password_changed_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_password_changed_at',
        value: coercedToDate
      };

    case '_failed_login_count':
    case '_rperm':
    case '_wperm':
    case '_email_verify_token':
    case '_hashed_password':
    case '_perishable_token':
      return {
        key: restKey,
        value: restValue
      };

    case 'sessionToken':
      return {
        key: '_session_token',
        value: restValue
      };

    default:
      // Auth data should have been transformed already
      if (restKey.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'can only query on ' + restKey);
      } // Trust that the auth data has been transformed and save it directly


      if (restKey.match(/^_auth_data_[a-zA-Z0-9_]+$/)) {
        return {
          key: restKey,
          value: restValue
        };
      }

  } //skip straight to transformTopLevelAtom for Bytes, they don't show up in the schema for some reason


  if (restValue && restValue.__type !== 'Bytes') {
    //Note: We may not know the type of a field here, as the user could be saving (null) to a field
    //That never existed before, meaning we can't infer the type.
    if (schema.fields[restKey] && schema.fields[restKey].type == 'Pointer' || restValue.__type == 'Pointer') {
      restKey = '_p_' + restKey;
    }
  } // Handle atomic values


  var value = transformTopLevelAtom(restValue);

  if (value !== CannotTransform) {
    return {
      key: restKey,
      value: value
    };
  } // ACLs are handled before this method is called
  // If an ACL key still exists here, something is wrong.


  if (restKey === 'ACL') {
    throw 'There was a problem transforming an ACL.';
  } // Handle arrays


  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return {
      key: restKey,
      value: value
    };
  } // Handle normal objects by recursing


  if (Object.keys(restValue).some(key => key.includes('$') || key.includes('.'))) {
    throw new Parse.Error(Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
  }

  value = mapValues(restValue, transformInteriorValue);
  return {
    key: restKey,
    value
  };
};

const parseObjectToMongoObjectForCreate = (className, restCreate, schema) => {
  restCreate = addLegacyACL(restCreate);
  const mongoCreate = {};

  for (const restKey in restCreate) {
    if (restCreate[restKey] && restCreate[restKey].__type === 'Relation') {
      continue;
    }

    const {
      key,
      value
    } = parseObjectKeyValueToMongoObjectKeyValue(restKey, restCreate[restKey], schema);

    if (value !== undefined) {
      mongoCreate[key] = value;
    }
  } // Use the legacy mongo format for createdAt and updatedAt


  if (mongoCreate.createdAt) {
    mongoCreate._created_at = new Date(mongoCreate.createdAt.iso || mongoCreate.createdAt);
    delete mongoCreate.createdAt;
  }

  if (mongoCreate.updatedAt) {
    mongoCreate._updated_at = new Date(mongoCreate.updatedAt.iso || mongoCreate.updatedAt);
    delete mongoCreate.updatedAt;
  }

  return mongoCreate;
}; // Main exposed method to help update old objects.


const transformUpdate = (className, restUpdate, parseFormatSchema) => {
  const mongoUpdate = {};
  const acl = addLegacyACL(restUpdate);

  if (acl._rperm || acl._wperm || acl._acl) {
    mongoUpdate.$set = {};

    if (acl._rperm) {
      mongoUpdate.$set._rperm = acl._rperm;
    }

    if (acl._wperm) {
      mongoUpdate.$set._wperm = acl._wperm;
    }

    if (acl._acl) {
      mongoUpdate.$set._acl = acl._acl;
    }
  }

  for (var restKey in restUpdate) {
    if (restUpdate[restKey] && restUpdate[restKey].__type === 'Relation') {
      continue;
    }

    var out = transformKeyValueForUpdate(className, restKey, restUpdate[restKey], parseFormatSchema); // If the output value is an object with any $ keys, it's an
    // operator that needs to be lifted onto the top level update
    // object.

    if (typeof out.value === 'object' && out.value !== null && out.value.__op) {
      mongoUpdate[out.value.__op] = mongoUpdate[out.value.__op] || {};
      mongoUpdate[out.value.__op][out.key] = out.value.arg;
    } else {
      mongoUpdate['$set'] = mongoUpdate['$set'] || {};
      mongoUpdate['$set'][out.key] = out.value;
    }
  }

  return mongoUpdate;
}; // Add the legacy _acl format.


const addLegacyACL = restObject => {
  const restObjectCopy = _objectSpread({}, restObject);

  const _acl = {};

  if (restObject._wperm) {
    restObject._wperm.forEach(entry => {
      _acl[entry] = {
        w: true
      };
    });

    restObjectCopy._acl = _acl;
  }

  if (restObject._rperm) {
    restObject._rperm.forEach(entry => {
      if (!(entry in _acl)) {
        _acl[entry] = {
          r: true
        };
      } else {
        _acl[entry].r = true;
      }
    });

    restObjectCopy._acl = _acl;
  }

  return restObjectCopy;
}; // A sentinel value that helper transformations return when they
// cannot perform a transformation


function CannotTransform() {}

const transformInteriorAtom = atom => {
  // TODO: check validity harder for the __type-defined types
  if (typeof atom === 'object' && atom && !(atom instanceof Date) && atom.__type === 'Pointer') {
    return {
      __type: 'Pointer',
      className: atom.className,
      objectId: atom.objectId
    };
  } else if (typeof atom === 'function' || typeof atom === 'symbol') {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `cannot transform value: ${atom}`);
  } else if (DateCoder.isValidJSON(atom)) {
    return DateCoder.JSONToDatabase(atom);
  } else if (BytesCoder.isValidJSON(atom)) {
    return BytesCoder.JSONToDatabase(atom);
  } else if (typeof atom === 'object' && atom && atom.$regex !== undefined) {
    return new RegExp(atom.$regex);
  } else {
    return atom;
  }
}; // Helper function to transform an atom from REST format to Mongo format.
// An atom is anything that can't contain other expressions. So it
// includes things where objects are used to represent other
// datatypes, like pointers and dates, but it does not include objects
// or arrays with generic stuff inside.
// Raises an error if this cannot possibly be valid REST format.
// Returns CannotTransform if it's just not an atom


function transformTopLevelAtom(atom, field) {
  switch (typeof atom) {
    case 'number':
    case 'boolean':
    case 'undefined':
      return atom;

    case 'string':
      if (field && field.type === 'Pointer') {
        return `${field.targetClass}$${atom}`;
      }

      return atom;

    case 'symbol':
    case 'function':
      throw new Parse.Error(Parse.Error.INVALID_JSON, `cannot transform value: ${atom}`);

    case 'object':
      if (atom instanceof Date) {
        // Technically dates are not rest format, but, it seems pretty
        // clear what they should be transformed to, so let's just do it.
        return atom;
      }

      if (atom === null) {
        return atom;
      } // TODO: check validity harder for the __type-defined types


      if (atom.__type == 'Pointer') {
        return `${atom.className}$${atom.objectId}`;
      }

      if (DateCoder.isValidJSON(atom)) {
        return DateCoder.JSONToDatabase(atom);
      }

      if (BytesCoder.isValidJSON(atom)) {
        return BytesCoder.JSONToDatabase(atom);
      }

      if (GeoPointCoder.isValidJSON(atom)) {
        return GeoPointCoder.JSONToDatabase(atom);
      }

      if (PolygonCoder.isValidJSON(atom)) {
        return PolygonCoder.JSONToDatabase(atom);
      }

      if (FileCoder.isValidJSON(atom)) {
        return FileCoder.JSONToDatabase(atom);
      }

      return CannotTransform;

    default:
      // I don't think typeof can ever let us get here
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, `really did not expect value: ${atom}`);
  }
}

function relativeTimeToDate(text, now = new Date()) {
  text = text.toLowerCase();
  let parts = text.split(' '); // Filter out whitespace

  parts = parts.filter(part => part !== '');
  const future = parts[0] === 'in';
  const past = parts[parts.length - 1] === 'ago';

  if (!future && !past && text !== 'now') {
    return {
      status: 'error',
      info: "Time should either start with 'in' or end with 'ago'"
    };
  }

  if (future && past) {
    return {
      status: 'error',
      info: "Time cannot have both 'in' and 'ago'"
    };
  } // strip the 'ago' or 'in'


  if (future) {
    parts = parts.slice(1);
  } else {
    // past
    parts = parts.slice(0, parts.length - 1);
  }

  if (parts.length % 2 !== 0 && text !== 'now') {
    return {
      status: 'error',
      info: 'Invalid time string. Dangling unit or number.'
    };
  }

  const pairs = [];

  while (parts.length) {
    pairs.push([parts.shift(), parts.shift()]);
  }

  let seconds = 0;

  for (const [num, interval] of pairs) {
    const val = Number(num);

    if (!Number.isInteger(val)) {
      return {
        status: 'error',
        info: `'${num}' is not an integer.`
      };
    }

    switch (interval) {
      case 'yr':
      case 'yrs':
      case 'year':
      case 'years':
        seconds += val * 31536000; // 365 * 24 * 60 * 60

        break;

      case 'wk':
      case 'wks':
      case 'week':
      case 'weeks':
        seconds += val * 604800; // 7 * 24 * 60 * 60

        break;

      case 'd':
      case 'day':
      case 'days':
        seconds += val * 86400; // 24 * 60 * 60

        break;

      case 'hr':
      case 'hrs':
      case 'hour':
      case 'hours':
        seconds += val * 3600; // 60 * 60

        break;

      case 'min':
      case 'mins':
      case 'minute':
      case 'minutes':
        seconds += val * 60;
        break;

      case 'sec':
      case 'secs':
      case 'second':
      case 'seconds':
        seconds += val;
        break;

      default:
        return {
          status: 'error',
          info: `Invalid interval: '${interval}'`
        };
    }
  }

  const milliseconds = seconds * 1000;

  if (future) {
    return {
      status: 'success',
      info: 'future',
      result: new Date(now.valueOf() + milliseconds)
    };
  } else if (past) {
    return {
      status: 'success',
      info: 'past',
      result: new Date(now.valueOf() - milliseconds)
    };
  } else {
    return {
      status: 'success',
      info: 'present',
      result: new Date(now.valueOf())
    };
  }
} // Transforms a query constraint from REST API format to Mongo format.
// A constraint is something with fields like $lt.
// If it is not a valid constraint but it could be a valid something
// else, return CannotTransform.
// inArray is whether this is an array field.


function transformConstraint(constraint, field, count = false) {
  const inArray = field && field.type && field.type === 'Array';

  if (typeof constraint !== 'object' || !constraint) {
    return CannotTransform;
  }

  const transformFunction = inArray ? transformInteriorAtom : transformTopLevelAtom;

  const transformer = atom => {
    const result = transformFunction(atom, field);

    if (result === CannotTransform) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `bad atom: ${JSON.stringify(atom)}`);
    }

    return result;
  }; // keys is the constraints in reverse alphabetical order.
  // This is a hack so that:
  //   $regex is handled before $options
  //   $nearSphere is handled before $maxDistance


  var keys = Object.keys(constraint).sort().reverse();
  var answer = {};

  for (var key of keys) {
    switch (key) {
      case '$lt':
      case '$lte':
      case '$gt':
      case '$gte':
      case '$exists':
      case '$ne':
      case '$eq':
        {
          const val = constraint[key];

          if (val && typeof val === 'object' && val.$relativeTime) {
            if (field && field.type !== 'Date') {
              throw new Parse.Error(Parse.Error.INVALID_JSON, '$relativeTime can only be used with Date field');
            }

            switch (key) {
              case '$exists':
              case '$ne':
              case '$eq':
                throw new Parse.Error(Parse.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
            }

            const parserResult = relativeTimeToDate(val.$relativeTime);

            if (parserResult.status === 'success') {
              answer[key] = parserResult.result;
              break;
            }

            _logger.default.info('Error while parsing relative date', parserResult);

            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $relativeTime (${key}) value. ${parserResult.info}`);
          }

          answer[key] = transformer(val);
          break;
        }

      case '$in':
      case '$nin':
        {
          const arr = constraint[key];

          if (!(arr instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad ' + key + ' value');
          }

          answer[key] = _lodash.default.flatMap(arr, value => {
            return (atom => {
              if (Array.isArray(atom)) {
                return value.map(transformer);
              } else {
                return transformer(atom);
              }
            })(value);
          });
          break;
        }

      case '$all':
        {
          const arr = constraint[key];

          if (!(arr instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad ' + key + ' value');
          }

          answer[key] = arr.map(transformInteriorAtom);
          const values = answer[key];

          if (isAnyValueRegex(values) && !isAllValuesRegexOrNone(values)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'All $all values must be of regex type or none: ' + values);
          }

          break;
        }

      case '$regex':
        var s = constraint[key];

        if (typeof s !== 'string') {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad regex: ' + s);
        }

        answer[key] = s;
        break;

      case '$containedBy':
        {
          const arr = constraint[key];

          if (!(arr instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $containedBy: should be an array`);
          }

          answer.$elemMatch = {
            $nin: arr.map(transformer)
          };
          break;
        }

      case '$options':
        answer[key] = constraint[key];
        break;

      case '$text':
        {
          const search = constraint[key].$search;

          if (typeof search !== 'object') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $search, should be object`);
          }

          if (!search.$term || typeof search.$term !== 'string') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $term, should be string`);
          } else {
            answer[key] = {
              $search: search.$term
            };
          }

          if (search.$language && typeof search.$language !== 'string') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $language, should be string`);
          } else if (search.$language) {
            answer[key].$language = search.$language;
          }

          if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $caseSensitive, should be boolean`);
          } else if (search.$caseSensitive) {
            answer[key].$caseSensitive = search.$caseSensitive;
          }

          if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $diacriticSensitive, should be boolean`);
          } else if (search.$diacriticSensitive) {
            answer[key].$diacriticSensitive = search.$diacriticSensitive;
          }

          break;
        }

      case '$nearSphere':
        {
          const point = constraint[key];

          if (count) {
            answer.$geoWithin = {
              $centerSphere: [[point.longitude, point.latitude], constraint.$maxDistance]
            };
          } else {
            answer[key] = [point.longitude, point.latitude];
          }

          break;
        }

      case '$maxDistance':
        {
          if (count) {
            break;
          }

          answer[key] = constraint[key];
          break;
        }
      // The SDKs don't seem to use these but they are documented in the
      // REST API docs.

      case '$maxDistanceInRadians':
        answer['$maxDistance'] = constraint[key];
        break;

      case '$maxDistanceInMiles':
        answer['$maxDistance'] = constraint[key] / 3959;
        break;

      case '$maxDistanceInKilometers':
        answer['$maxDistance'] = constraint[key] / 6371;
        break;

      case '$select':
      case '$dontSelect':
        throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, 'the ' + key + ' constraint is not supported yet');

      case '$within':
        var box = constraint[key]['$box'];

        if (!box || box.length != 2) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'malformatted $within arg');
        }

        answer[key] = {
          $box: [[box[0].longitude, box[0].latitude], [box[1].longitude, box[1].latitude]]
        };
        break;

      case '$geoWithin':
        {
          const polygon = constraint[key]['$polygon'];
          const centerSphere = constraint[key]['$centerSphere'];

          if (polygon !== undefined) {
            let points;

            if (typeof polygon === 'object' && polygon.__type === 'Polygon') {
              if (!polygon.coordinates || polygon.coordinates.length < 3) {
                throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; Polygon.coordinates should contain at least 3 lon/lat pairs');
              }

              points = polygon.coordinates;
            } else if (polygon instanceof Array) {
              if (polygon.length < 3) {
                throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $polygon should contain at least 3 GeoPoints');
              }

              points = polygon;
            } else {
              throw new Parse.Error(Parse.Error.INVALID_JSON, "bad $geoWithin value; $polygon should be Polygon object or Array of Parse.GeoPoint's");
            }

            points = points.map(point => {
              if (point instanceof Array && point.length === 2) {
                Parse.GeoPoint._validate(point[1], point[0]);

                return point;
              }

              if (!GeoPointCoder.isValidJSON(point)) {
                throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value');
              } else {
                Parse.GeoPoint._validate(point.latitude, point.longitude);
              }

              return [point.longitude, point.latitude];
            });
            answer[key] = {
              $polygon: points
            };
          } else if (centerSphere !== undefined) {
            if (!(centerSphere instanceof Array) || centerSphere.length < 2) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere should be an array of Parse.GeoPoint and distance');
            } // Get point, convert to geo point if necessary and validate


            let point = centerSphere[0];

            if (point instanceof Array && point.length === 2) {
              point = new Parse.GeoPoint(point[1], point[0]);
            } else if (!GeoPointCoder.isValidJSON(point)) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
            }

            Parse.GeoPoint._validate(point.latitude, point.longitude); // Get distance and validate


            const distance = centerSphere[1];

            if (isNaN(distance) || distance < 0) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere distance invalid');
            }

            answer[key] = {
              $centerSphere: [[point.longitude, point.latitude], distance]
            };
          }

          break;
        }

      case '$geoIntersects':
        {
          const point = constraint[key]['$point'];

          if (!GeoPointCoder.isValidJSON(point)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoIntersect value; $point should be GeoPoint');
          } else {
            Parse.GeoPoint._validate(point.latitude, point.longitude);
          }

          answer[key] = {
            $geometry: {
              type: 'Point',
              coordinates: [point.longitude, point.latitude]
            }
          };
          break;
        }

      default:
        if (key.match(/^\$+/)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad constraint: ' + key);
        }

        return CannotTransform;
    }
  }

  return answer;
} // Transforms an update operator from REST format to mongo format.
// To be transformed, the input should have an __op field.
// If flatten is true, this will flatten operators to their static
// data format. For example, an increment of 2 would simply become a
// 2.
// The output for a non-flattened operator is a hash with __op being
// the mongo op, and arg being the argument.
// The output for a flattened operator is just a value.
// Returns undefined if this should be a no-op.


function transformUpdateOperator({
  __op,
  amount,
  objects
}, flatten) {
  switch (__op) {
    case 'Delete':
      if (flatten) {
        return undefined;
      } else {
        return {
          __op: '$unset',
          arg: ''
        };
      }

    case 'Increment':
      if (typeof amount !== 'number') {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'incrementing must provide a number');
      }

      if (flatten) {
        return amount;
      } else {
        return {
          __op: '$inc',
          arg: amount
        };
      }

    case 'Add':
    case 'AddUnique':
      if (!(objects instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to add must be an array');
      }

      var toAdd = objects.map(transformInteriorAtom);

      if (flatten) {
        return toAdd;
      } else {
        var mongoOp = {
          Add: '$push',
          AddUnique: '$addToSet'
        }[__op];
        return {
          __op: mongoOp,
          arg: {
            $each: toAdd
          }
        };
      }

    case 'Remove':
      if (!(objects instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to remove must be an array');
      }

      var toRemove = objects.map(transformInteriorAtom);

      if (flatten) {
        return [];
      } else {
        return {
          __op: '$pullAll',
          arg: toRemove
        };
      }

    default:
      throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, `The ${__op} operator is not supported yet.`);
  }
}

function mapValues(object, iterator) {
  const result = {};
  Object.keys(object).forEach(key => {
    result[key] = iterator(object[key]);
  });
  return result;
}

const nestedMongoObjectToNestedParseObject = mongoObject => {
  switch (typeof mongoObject) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'undefined':
      return mongoObject;

    case 'symbol':
    case 'function':
      throw 'bad value in nestedMongoObjectToNestedParseObject';

    case 'object':
      if (mongoObject === null) {
        return null;
      }

      if (mongoObject instanceof Array) {
        return mongoObject.map(nestedMongoObjectToNestedParseObject);
      }

      if (mongoObject instanceof Date) {
        return Parse._encode(mongoObject);
      }

      if (mongoObject instanceof mongodb.Long) {
        return mongoObject.toNumber();
      }

      if (mongoObject instanceof mongodb.Double) {
        return mongoObject.value;
      }

      if (BytesCoder.isValidDatabaseObject(mongoObject)) {
        return BytesCoder.databaseToJSON(mongoObject);
      }

      if (Object.prototype.hasOwnProperty.call(mongoObject, '__type') && mongoObject.__type == 'Date' && mongoObject.iso instanceof Date) {
        mongoObject.iso = mongoObject.iso.toJSON();
        return mongoObject;
      }

      return mapValues(mongoObject, nestedMongoObjectToNestedParseObject);

    default:
      throw 'unknown js type';
  }
};

const transformPointerString = (schema, field, pointerString) => {
  const objData = pointerString.split('$');

  if (objData[0] !== schema.fields[field].targetClass) {
    throw 'pointer to incorrect className';
  }

  return {
    __type: 'Pointer',
    className: objData[0],
    objectId: objData[1]
  };
}; // Converts from a mongo-format object to a REST-format object.
// Does not strip out anything based on a lack of authentication.


const mongoObjectToParseObject = (className, mongoObject, schema) => {
  switch (typeof mongoObject) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'undefined':
      return mongoObject;

    case 'symbol':
    case 'function':
      throw 'bad value in mongoObjectToParseObject';

    case 'object':
      {
        if (mongoObject === null) {
          return null;
        }

        if (mongoObject instanceof Array) {
          return mongoObject.map(nestedMongoObjectToNestedParseObject);
        }

        if (mongoObject instanceof Date) {
          return Parse._encode(mongoObject);
        }

        if (mongoObject instanceof mongodb.Long) {
          return mongoObject.toNumber();
        }

        if (mongoObject instanceof mongodb.Double) {
          return mongoObject.value;
        }

        if (BytesCoder.isValidDatabaseObject(mongoObject)) {
          return BytesCoder.databaseToJSON(mongoObject);
        }

        const restObject = {};

        if (mongoObject._rperm || mongoObject._wperm) {
          restObject._rperm = mongoObject._rperm || [];
          restObject._wperm = mongoObject._wperm || [];
          delete mongoObject._rperm;
          delete mongoObject._wperm;
        }

        for (var key in mongoObject) {
          switch (key) {
            case '_id':
              restObject['objectId'] = '' + mongoObject[key];
              break;

            case '_hashed_password':
              restObject._hashed_password = mongoObject[key];
              break;

            case '_acl':
              break;

            case '_email_verify_token':
            case '_perishable_token':
            case '_perishable_token_expires_at':
            case '_password_changed_at':
            case '_tombstone':
            case '_email_verify_token_expires_at':
            case '_account_lockout_expires_at':
            case '_failed_login_count':
            case '_password_history':
              // Those keys will be deleted if needed in the DB Controller
              restObject[key] = mongoObject[key];
              break;

            case '_session_token':
              restObject['sessionToken'] = mongoObject[key];
              break;

            case 'updatedAt':
            case '_updated_at':
              restObject['updatedAt'] = Parse._encode(new Date(mongoObject[key])).iso;
              break;

            case 'createdAt':
            case '_created_at':
              restObject['createdAt'] = Parse._encode(new Date(mongoObject[key])).iso;
              break;

            case 'expiresAt':
            case '_expiresAt':
              restObject['expiresAt'] = Parse._encode(new Date(mongoObject[key]));
              break;

            case 'lastUsed':
            case '_last_used':
              restObject['lastUsed'] = Parse._encode(new Date(mongoObject[key])).iso;
              break;

            case 'timesUsed':
            case 'times_used':
              restObject['timesUsed'] = mongoObject[key];
              break;

            case 'authData':
              if (className === '_User') {
                _logger.default.warn('ignoring authData in _User as this key is reserved to be synthesized of `_auth_data_*` keys');
              } else {
                restObject['authData'] = mongoObject[key];
              }

              break;

            default:
              // Check other auth data keys
              var authDataMatch = key.match(/^_auth_data_([a-zA-Z0-9_]+)$/);

              if (authDataMatch && className === '_User') {
                var provider = authDataMatch[1];
                restObject['authData'] = restObject['authData'] || {};
                restObject['authData'][provider] = mongoObject[key];
                break;
              }

              if (key.indexOf('_p_') == 0) {
                var newKey = key.substring(3);

                if (!schema.fields[newKey]) {
                  _logger.default.info('transform.js', 'Found a pointer column not in the schema, dropping it.', className, newKey);

                  break;
                }

                if (schema.fields[newKey].type !== 'Pointer') {
                  _logger.default.info('transform.js', 'Found a pointer in a non-pointer column, dropping it.', className, key);

                  break;
                }

                if (mongoObject[key] === null) {
                  break;
                }

                restObject[newKey] = transformPointerString(schema, newKey, mongoObject[key]);
                break;
              } else if (key[0] == '_' && key != '__type') {
                throw 'bad key in untransform: ' + key;
              } else {
                var value = mongoObject[key];

                if (schema.fields[key] && schema.fields[key].type === 'File' && FileCoder.isValidDatabaseObject(value)) {
                  restObject[key] = FileCoder.databaseToJSON(value);
                  break;
                }

                if (schema.fields[key] && schema.fields[key].type === 'GeoPoint' && GeoPointCoder.isValidDatabaseObject(value)) {
                  restObject[key] = GeoPointCoder.databaseToJSON(value);
                  break;
                }

                if (schema.fields[key] && schema.fields[key].type === 'Polygon' && PolygonCoder.isValidDatabaseObject(value)) {
                  restObject[key] = PolygonCoder.databaseToJSON(value);
                  break;
                }

                if (schema.fields[key] && schema.fields[key].type === 'Bytes' && BytesCoder.isValidDatabaseObject(value)) {
                  restObject[key] = BytesCoder.databaseToJSON(value);
                  break;
                }
              }

              restObject[key] = nestedMongoObjectToNestedParseObject(mongoObject[key]);
          }
        }

        const relationFieldNames = Object.keys(schema.fields).filter(fieldName => schema.fields[fieldName].type === 'Relation');
        const relationFields = {};
        relationFieldNames.forEach(relationFieldName => {
          relationFields[relationFieldName] = {
            __type: 'Relation',
            className: schema.fields[relationFieldName].targetClass
          };
        });
        return _objectSpread(_objectSpread({}, restObject), relationFields);
      }

    default:
      throw 'unknown js type';
  }
};

var DateCoder = {
  JSONToDatabase(json) {
    return new Date(json.iso);
  },

  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'Date';
  }

};
var BytesCoder = {
  base64Pattern: new RegExp('^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'),

  isBase64Value(object) {
    if (typeof object !== 'string') {
      return false;
    }

    return this.base64Pattern.test(object);
  },

  databaseToJSON(object) {
    let value;

    if (this.isBase64Value(object)) {
      value = object;
    } else {
      value = object.buffer.toString('base64');
    }

    return {
      __type: 'Bytes',
      base64: value
    };
  },

  isValidDatabaseObject(object) {
    return object instanceof mongodb.Binary || this.isBase64Value(object);
  },

  JSONToDatabase(json) {
    return new mongodb.Binary(Buffer.from(json.base64, 'base64'));
  },

  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'Bytes';
  }

};
var GeoPointCoder = {
  databaseToJSON(object) {
    return {
      __type: 'GeoPoint',
      latitude: object[1],
      longitude: object[0]
    };
  },

  isValidDatabaseObject(object) {
    return object instanceof Array && object.length == 2;
  },

  JSONToDatabase(json) {
    return [json.longitude, json.latitude];
  },

  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }

};
var PolygonCoder = {
  databaseToJSON(object) {
    // Convert lng/lat -> lat/lng
    const coords = object.coordinates[0].map(coord => {
      return [coord[1], coord[0]];
    });
    return {
      __type: 'Polygon',
      coordinates: coords
    };
  },

  isValidDatabaseObject(object) {
    const coords = object.coordinates[0];

    if (object.type !== 'Polygon' || !(coords instanceof Array)) {
      return false;
    }

    for (let i = 0; i < coords.length; i++) {
      const point = coords[i];

      if (!GeoPointCoder.isValidDatabaseObject(point)) {
        return false;
      }

      Parse.GeoPoint._validate(parseFloat(point[1]), parseFloat(point[0]));
    }

    return true;
  },

  JSONToDatabase(json) {
    let coords = json.coordinates; // Add first point to the end to close polygon

    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0]);
    }

    const unique = coords.filter((item, index, ar) => {
      let foundIndex = -1;

      for (let i = 0; i < ar.length; i += 1) {
        const pt = ar[i];

        if (pt[0] === item[0] && pt[1] === item[1]) {
          foundIndex = i;
          break;
        }
      }

      return foundIndex === index;
    });

    if (unique.length < 3) {
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'GeoJSON: Loop must have at least 3 different vertices');
    } // Convert lat/long -> long/lat


    coords = coords.map(coord => {
      return [coord[1], coord[0]];
    });
    return {
      type: 'Polygon',
      coordinates: [coords]
    };
  },

  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'Polygon';
  }

};
var FileCoder = {
  databaseToJSON(object) {
    return {
      __type: 'File',
      name: object
    };
  },

  isValidDatabaseObject(object) {
    return typeof object === 'string';
  },

  JSONToDatabase(json) {
    return json.name;
  },

  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'File';
  }

};
module.exports = {
  transformKey,
  parseObjectToMongoObjectForCreate,
  transformUpdate,
  transformWhere,
  mongoObjectToParseObject,
  relativeTimeToDate,
  transformConstraint,
  transformPointerString
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvVHJhbnNmb3JtLmpzIl0sIm5hbWVzIjpbIm1vbmdvZGIiLCJyZXF1aXJlIiwiUGFyc2UiLCJ0cmFuc2Zvcm1LZXkiLCJjbGFzc05hbWUiLCJmaWVsZE5hbWUiLCJzY2hlbWEiLCJmaWVsZHMiLCJfX3R5cGUiLCJ0eXBlIiwidHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUiLCJyZXN0S2V5IiwicmVzdFZhbHVlIiwicGFyc2VGb3JtYXRTY2hlbWEiLCJrZXkiLCJ0aW1lRmllbGQiLCJpbmNsdWRlcyIsInZhbHVlIiwicGFyc2VJbnQiLCJ0cmFuc2Zvcm1Ub3BMZXZlbEF0b20iLCJDYW5ub3RUcmFuc2Zvcm0iLCJEYXRlIiwiaW5kZXhPZiIsIkFycmF5IiwibWFwIiwidHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSIsInRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yIiwibWFwVmFsdWVzIiwiaXNSZWdleCIsIlJlZ0V4cCIsImlzU3RhcnRzV2l0aFJlZ2V4IiwibWF0Y2hlcyIsInRvU3RyaW5nIiwibWF0Y2giLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwidmFsdWVzIiwiaXNBcnJheSIsImxlbmd0aCIsImZpcnN0VmFsdWVzSXNSZWdleCIsImkiLCJpc0FueVZhbHVlUmVnZXgiLCJzb21lIiwiT2JqZWN0Iiwia2V5cyIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwidHJhbnNmb3JtSW50ZXJpb3JBdG9tIiwidmFsdWVBc0RhdGUiLCJ0cmFuc2Zvcm1RdWVyeUtleVZhbHVlIiwiY291bnQiLCJzdWJRdWVyeSIsInRyYW5zZm9ybVdoZXJlIiwiYXV0aERhdGFNYXRjaCIsInByb3ZpZGVyIiwiZXhwZWN0ZWRUeXBlSXNBcnJheSIsImV4cGVjdGVkVHlwZUlzUG9pbnRlciIsImZpZWxkIiwidHJhbnNmb3JtZWRDb25zdHJhaW50IiwidHJhbnNmb3JtQ29uc3RyYWludCIsIiR0ZXh0IiwiJGVsZW1NYXRjaCIsIiRhbGwiLCJJTlZBTElEX0pTT04iLCJyZXN0V2hlcmUiLCJtb25nb1doZXJlIiwib3V0IiwicGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZSIsInRyYW5zZm9ybWVkVmFsdWUiLCJjb2VyY2VkVG9EYXRlIiwiSU5WQUxJRF9LRVlfTkFNRSIsInBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSIsInJlc3RDcmVhdGUiLCJhZGRMZWdhY3lBQ0wiLCJtb25nb0NyZWF0ZSIsInVuZGVmaW5lZCIsImNyZWF0ZWRBdCIsIl9jcmVhdGVkX2F0IiwiaXNvIiwidXBkYXRlZEF0IiwiX3VwZGF0ZWRfYXQiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJyZXN0VXBkYXRlIiwibW9uZ29VcGRhdGUiLCJhY2wiLCJfcnBlcm0iLCJfd3Blcm0iLCJfYWNsIiwiJHNldCIsIl9fb3AiLCJhcmciLCJyZXN0T2JqZWN0IiwicmVzdE9iamVjdENvcHkiLCJmb3JFYWNoIiwiZW50cnkiLCJ3IiwiciIsImF0b20iLCJvYmplY3RJZCIsIkRhdGVDb2RlciIsImlzVmFsaWRKU09OIiwiSlNPTlRvRGF0YWJhc2UiLCJCeXRlc0NvZGVyIiwiJHJlZ2V4IiwidGFyZ2V0Q2xhc3MiLCJHZW9Qb2ludENvZGVyIiwiUG9seWdvbkNvZGVyIiwiRmlsZUNvZGVyIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwicmVsYXRpdmVUaW1lVG9EYXRlIiwidGV4dCIsIm5vdyIsInRvTG93ZXJDYXNlIiwicGFydHMiLCJzcGxpdCIsImZpbHRlciIsInBhcnQiLCJmdXR1cmUiLCJwYXN0Iiwic3RhdHVzIiwiaW5mbyIsInNsaWNlIiwicGFpcnMiLCJwdXNoIiwic2hpZnQiLCJzZWNvbmRzIiwibnVtIiwiaW50ZXJ2YWwiLCJ2YWwiLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJtaWxsaXNlY29uZHMiLCJyZXN1bHQiLCJ2YWx1ZU9mIiwiY29uc3RyYWludCIsImluQXJyYXkiLCJ0cmFuc2Zvcm1GdW5jdGlvbiIsInRyYW5zZm9ybWVyIiwiSlNPTiIsInN0cmluZ2lmeSIsInNvcnQiLCJyZXZlcnNlIiwiYW5zd2VyIiwiJHJlbGF0aXZlVGltZSIsInBhcnNlclJlc3VsdCIsImxvZyIsImFyciIsIl8iLCJmbGF0TWFwIiwicyIsIiRuaW4iLCJzZWFyY2giLCIkc2VhcmNoIiwiJHRlcm0iLCIkbGFuZ3VhZ2UiLCIkY2FzZVNlbnNpdGl2ZSIsIiRkaWFjcml0aWNTZW5zaXRpdmUiLCJwb2ludCIsIiRnZW9XaXRoaW4iLCIkY2VudGVyU3BoZXJlIiwibG9uZ2l0dWRlIiwibGF0aXR1ZGUiLCIkbWF4RGlzdGFuY2UiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwiYm94IiwiJGJveCIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJwb2ludHMiLCJjb29yZGluYXRlcyIsIkdlb1BvaW50IiwiX3ZhbGlkYXRlIiwiJHBvbHlnb24iLCJkaXN0YW5jZSIsImlzTmFOIiwiJGdlb21ldHJ5IiwiYW1vdW50Iiwib2JqZWN0cyIsImZsYXR0ZW4iLCJ0b0FkZCIsIm1vbmdvT3AiLCJBZGQiLCJBZGRVbmlxdWUiLCIkZWFjaCIsInRvUmVtb3ZlIiwib2JqZWN0IiwiaXRlcmF0b3IiLCJuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QiLCJtb25nb09iamVjdCIsIl9lbmNvZGUiLCJMb25nIiwidG9OdW1iZXIiLCJEb3VibGUiLCJpc1ZhbGlkRGF0YWJhc2VPYmplY3QiLCJkYXRhYmFzZVRvSlNPTiIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInRvSlNPTiIsInRyYW5zZm9ybVBvaW50ZXJTdHJpbmciLCJwb2ludGVyU3RyaW5nIiwib2JqRGF0YSIsIm1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJ3YXJuIiwibmV3S2V5Iiwic3Vic3RyaW5nIiwicmVsYXRpb25GaWVsZE5hbWVzIiwicmVsYXRpb25GaWVsZHMiLCJyZWxhdGlvbkZpZWxkTmFtZSIsImpzb24iLCJiYXNlNjRQYXR0ZXJuIiwiaXNCYXNlNjRWYWx1ZSIsInRlc3QiLCJidWZmZXIiLCJiYXNlNjQiLCJCaW5hcnkiLCJCdWZmZXIiLCJmcm9tIiwiY29vcmRzIiwiY29vcmQiLCJwYXJzZUZsb2F0IiwidW5pcXVlIiwiaXRlbSIsImluZGV4IiwiYXIiLCJmb3VuZEluZGV4IiwicHQiLCJuYW1lIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7QUFDQTs7Ozs7Ozs7OztBQUNBLElBQUlBLE9BQU8sR0FBR0MsT0FBTyxDQUFDLFNBQUQsQ0FBckI7O0FBQ0EsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBRCxDQUFQLENBQXNCQyxLQUFsQzs7QUFFQSxNQUFNQyxZQUFZLEdBQUcsQ0FBQ0MsU0FBRCxFQUFZQyxTQUFaLEVBQXVCQyxNQUF2QixLQUFrQztBQUNyRDtBQUNBLFVBQVFELFNBQVI7QUFDRSxTQUFLLFVBQUw7QUFDRSxhQUFPLEtBQVA7O0FBQ0YsU0FBSyxXQUFMO0FBQ0UsYUFBTyxhQUFQOztBQUNGLFNBQUssV0FBTDtBQUNFLGFBQU8sYUFBUDs7QUFDRixTQUFLLGNBQUw7QUFDRSxhQUFPLGdCQUFQOztBQUNGLFNBQUssVUFBTDtBQUNFLGFBQU8sWUFBUDs7QUFDRixTQUFLLFdBQUw7QUFDRSxhQUFPLFlBQVA7QUFaSjs7QUFlQSxNQUFJQyxNQUFNLENBQUNDLE1BQVAsQ0FBY0YsU0FBZCxLQUE0QkMsTUFBTSxDQUFDQyxNQUFQLENBQWNGLFNBQWQsRUFBeUJHLE1BQXpCLElBQW1DLFNBQW5FLEVBQThFO0FBQzVFSCxJQUFBQSxTQUFTLEdBQUcsUUFBUUEsU0FBcEI7QUFDRCxHQUZELE1BRU8sSUFBSUMsTUFBTSxDQUFDQyxNQUFQLENBQWNGLFNBQWQsS0FBNEJDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjRixTQUFkLEVBQXlCSSxJQUF6QixJQUFpQyxTQUFqRSxFQUE0RTtBQUNqRkosSUFBQUEsU0FBUyxHQUFHLFFBQVFBLFNBQXBCO0FBQ0Q7O0FBRUQsU0FBT0EsU0FB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QUFDa0IsSUFBWjtBQUNELEdBZGE7O0FBZ0JkaEksRUFBQUEsV0FBVyxDQUFDbEYsS0FBRCxFQUFRO0FBQ2pCLFdBQU8sT0FBT0EsS0FBUCxLQUFpQixRQUFqQixJQUE2QkEsS0FBSyxLQUFLLElBQXZDLElBQStDQSxLQUFLLENBQUNULE1BQU4sS0FBaUIsTUFBdkU7QUFDRDs7QUFsQmEsQ0FBaEI7QUFxQkE0TixNQUFNLENBQUNDLE9BQVAsR0FBaUI7QUFDZmxPLEVBQUFBLFlBRGU7QUFFZm1FLEVBQUFBLGlDQUZlO0FBR2ZVLEVBQUFBLGVBSGU7QUFJZjdCLEVBQUFBLGNBSmU7QUFLZnNKLEVBQUFBLHdCQUxlO0FBTWY3RixFQUFBQSxrQkFOZTtBQU9mbEQsRUFBQUEsbUJBUGU7QUFRZjRJLEVBQUFBO0FBUmUsQ0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbG9nIGZyb20gJy4uLy4uLy4uL2xvZ2dlcic7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xudmFyIG1vbmdvZGIgPSByZXF1aXJlKCdtb25nb2RiJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5cbmNvbnN0IHRyYW5zZm9ybUtleSA9IChjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSA9PiB7XG4gIC8vIENoZWNrIGlmIHRoZSBzY2hlbWEgaXMga25vd24gc2luY2UgaXQncyBhIGJ1aWx0LWluIGZpZWxkLlxuICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xuICAgIGNhc2UgJ29iamVjdElkJzpcbiAgICAgIHJldHVybiAnX2lkJztcbiAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgICAgcmV0dXJuICdfY3JlYXRlZF9hdCc7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgIHJldHVybiAnX3VwZGF0ZWRfYXQnO1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgICByZXR1cm4gJ19zZXNzaW9uX3Rva2VuJztcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICByZXR1cm4gJ19sYXN0X3VzZWQnO1xuICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgICByZXR1cm4gJ3RpbWVzX3VzZWQnO1xuICB9XG5cbiAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uX190eXBlID09ICdQb2ludGVyJykge1xuICAgIGZpZWxkTmFtZSA9ICdfcF8nICsgZmllbGROYW1lO1xuICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICBmaWVsZE5hbWUgPSAnX3BfJyArIGZpZWxkTmFtZTtcbiAgfVxuXG4gIHJldHVybiBmaWVsZE5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1LZXlWYWx1ZUZvclVwZGF0ZSA9IChjbGFzc05hbWUsIHJlc3RLZXksIHJlc3RWYWx1ZSwgcGFyc2VGb3JtYXRTY2hlbWEpID0+IHtcbiAgLy8gQ2hlY2sgaWYgdGhlIHNjaGVtYSBpcyBrbm93biBzaW5jZSBpdCdzIGEgYnVpbHQtaW4gZmllbGQuXG4gIHZhciBrZXkgPSByZXN0S2V5O1xuICB2YXIgdGltZUZpZWxkID0gZmFsc2U7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnb2JqZWN0SWQnOlxuICAgIGNhc2UgJ19pZCc6XG4gICAgICBpZiAoWydfR2xvYmFsQ29uZmlnJywgJ19HcmFwaFFMQ29uZmlnJ10uaW5jbHVkZXMoY2xhc3NOYW1lKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleToga2V5LFxuICAgICAgICAgIHZhbHVlOiBwYXJzZUludChyZXN0VmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAga2V5ID0gJ19pZCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgIGNhc2UgJ19jcmVhdGVkX2F0JzpcbiAgICAgIGtleSA9ICdfY3JlYXRlZF9hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICBjYXNlICdfdXBkYXRlZF9hdCc6XG4gICAgICBrZXkgPSAnX3VwZGF0ZWRfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgY2FzZSAnX3Nlc3Npb25fdG9rZW4nOlxuICAgICAga2V5ID0gJ19zZXNzaW9uX3Rva2VuJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgY2FzZSAnX2V4cGlyZXNBdCc6XG4gICAgICBrZXkgPSAnZXhwaXJlc0F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAga2V5ID0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgIGtleSA9ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19mYWlsZWRfbG9naW5fY291bnQnOlxuICAgICAga2V5ID0gJ19mYWlsZWRfbG9naW5fY291bnQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICBrZXkgPSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAga2V5ID0gJ19wYXNzd29yZF9jaGFuZ2VkX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgICByZXR1cm4geyBrZXk6IGtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICBjYXNlICdfbGFzdF91c2VkJzpcbiAgICAgIGtleSA9ICdfbGFzdF91c2VkJztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgIGNhc2UgJ3RpbWVzX3VzZWQnOlxuICAgICAga2V5ID0gJ3RpbWVzX3VzZWQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICB9XG5cbiAgaWYgKFxuICAgIChwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XSAmJiBwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnUG9pbnRlcicpIHx8XG4gICAgKCFwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XSAmJiByZXN0VmFsdWUgJiYgcmVzdFZhbHVlLl9fdHlwZSA9PSAnUG9pbnRlcicpXG4gICkge1xuICAgIGtleSA9ICdfcF8nICsga2V5O1xuICB9XG5cbiAgLy8gSGFuZGxlIGF0b21pYyB2YWx1ZXNcbiAgdmFyIHZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gIGlmICh2YWx1ZSAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgaWYgKHRpbWVGaWVsZCAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICB2YWx1ZSA9IG5ldyBEYXRlKHZhbHVlKTtcbiAgICB9XG4gICAgaWYgKHJlc3RLZXkuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgcmV0dXJuIHsga2V5LCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgfVxuICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhcnJheXNcbiAgaWYgKHJlc3RWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgdmFsdWUgPSByZXN0VmFsdWUubWFwKHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSB1cGRhdGUgb3BlcmF0b3JzXG4gIGlmICh0eXBlb2YgcmVzdFZhbHVlID09PSAnb2JqZWN0JyAmJiAnX19vcCcgaW4gcmVzdFZhbHVlKSB7XG4gICAgcmV0dXJuIHsga2V5LCB2YWx1ZTogdHJhbnNmb3JtVXBkYXRlT3BlcmF0b3IocmVzdFZhbHVlLCBmYWxzZSkgfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBub3JtYWwgb2JqZWN0cyBieSByZWN1cnNpbmdcbiAgdmFsdWUgPSBtYXBWYWx1ZXMocmVzdFZhbHVlLCB0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xufTtcblxuY29uc3QgaXNSZWdleCA9IHZhbHVlID0+IHtcbiAgcmV0dXJuIHZhbHVlICYmIHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwO1xufTtcblxuY29uc3QgaXNTdGFydHNXaXRoUmVnZXggPSB2YWx1ZSA9PiB7XG4gIGlmICghaXNSZWdleCh2YWx1ZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBtYXRjaGVzID0gdmFsdWUudG9TdHJpbmcoKS5tYXRjaCgvXFwvXFxeXFxcXFEuKlxcXFxFXFwvLyk7XG4gIHJldHVybiAhIW1hdGNoZXM7XG59O1xuXG5jb25zdCBpc0FsbFZhbHVlc1JlZ2V4T3JOb25lID0gdmFsdWVzID0+IHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0pO1xuICBpZiAodmFsdWVzLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBmaXJzdFZhbHVlc0lzUmVnZXg7XG4gIH1cblxuICBmb3IgKGxldCBpID0gMSwgbGVuZ3RoID0gdmFsdWVzLmxlbmd0aDsgaSA8IGxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGZpcnN0VmFsdWVzSXNSZWdleCAhPT0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzW2ldKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuY29uc3QgaXNBbnlWYWx1ZVJlZ2V4ID0gdmFsdWVzID0+IHtcbiAgcmV0dXJuIHZhbHVlcy5zb21lKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiBpc1JlZ2V4KHZhbHVlKTtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1JbnRlcmlvclZhbHVlID0gcmVzdFZhbHVlID0+IHtcbiAgaWYgKFxuICAgIHJlc3RWYWx1ZSAhPT0gbnVsbCAmJlxuICAgIHR5cGVvZiByZXN0VmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgT2JqZWN0LmtleXMocmVzdFZhbHVlKS5zb21lKGtleSA9PiBrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSlcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgKTtcbiAgfVxuICAvLyBIYW5kbGUgYXRvbWljIHZhbHVlc1xuICB2YXIgdmFsdWUgPSB0cmFuc2Zvcm1JbnRlcmlvckF0b20ocmVzdFZhbHVlKTtcbiAgaWYgKHZhbHVlICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICAvLyBIYW5kbGUgYXJyYXlzXG4gIGlmIChyZXN0VmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiByZXN0VmFsdWUubWFwKHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICB9XG5cbiAgLy8gSGFuZGxlIHVwZGF0ZSBvcGVyYXRvcnNcbiAgaWYgKHR5cGVvZiByZXN0VmFsdWUgPT09ICdvYmplY3QnICYmICdfX29wJyBpbiByZXN0VmFsdWUpIHtcbiAgICByZXR1cm4gdHJhbnNmb3JtVXBkYXRlT3BlcmF0b3IocmVzdFZhbHVlLCB0cnVlKTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBub3JtYWwgb2JqZWN0cyBieSByZWN1cnNpbmdcbiAgcmV0dXJuIG1hcFZhbHVlcyhyZXN0VmFsdWUsIHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xufTtcblxuY29uc3QgdmFsdWVBc0RhdGUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKHZhbHVlKTtcbiAgfSBlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtUXVlcnlLZXlWYWx1ZShjbGFzc05hbWUsIGtleSwgdmFsdWUsIHNjaGVtYSwgY291bnQgPSBmYWxzZSkge1xuICBzd2l0Y2ggKGtleSkge1xuICAgIGNhc2UgJ2NyZWF0ZWRBdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ19jcmVhdGVkX2F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAga2V5ID0gJ19jcmVhdGVkX2F0JztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3VwZGF0ZWRBdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ191cGRhdGVkX2F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAga2V5ID0gJ191cGRhdGVkX2F0JztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ2V4cGlyZXNBdCcsIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSkgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAga2V5OiAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgICAgICAgICB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnb2JqZWN0SWQnOiB7XG4gICAgICBpZiAoWydfR2xvYmFsQ29uZmlnJywgJ19HcmFwaFFMQ29uZmlnJ10uaW5jbHVkZXMoY2xhc3NOYW1lKSkge1xuICAgICAgICB2YWx1ZSA9IHBhcnNlSW50KHZhbHVlKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IGtleTogJ19pZCcsIHZhbHVlIH07XG4gICAgfVxuICAgIGNhc2UgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAga2V5OiAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgICAgICAgICB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2ZhaWxlZF9sb2dpbl9jb3VudCc6XG4gICAgICByZXR1cm4geyBrZXksIHZhbHVlIH07XG4gICAgY2FzZSAnc2Vzc2lvblRva2VuJzpcbiAgICAgIHJldHVybiB7IGtleTogJ19zZXNzaW9uX3Rva2VuJywgdmFsdWUgfTtcbiAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6ICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyxcbiAgICAgICAgICB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4geyBrZXk6ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSkgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19ycGVybSc6XG4gICAgY2FzZSAnX3dwZXJtJzpcbiAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbic6XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbic6XG4gICAgICByZXR1cm4geyBrZXksIHZhbHVlIH07XG4gICAgY2FzZSAnJG9yJzpcbiAgICBjYXNlICckYW5kJzpcbiAgICBjYXNlICckbm9yJzpcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGtleToga2V5LFxuICAgICAgICB2YWx1ZTogdmFsdWUubWFwKHN1YlF1ZXJ5ID0+IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgc3ViUXVlcnksIHNjaGVtYSwgY291bnQpKSxcbiAgICAgIH07XG4gICAgY2FzZSAnbGFzdFVzZWQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4geyBrZXk6ICdfbGFzdF91c2VkJywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAga2V5ID0gJ19sYXN0X3VzZWQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndGltZXNVc2VkJzpcbiAgICAgIHJldHVybiB7IGtleTogJ3RpbWVzX3VzZWQnLCB2YWx1ZTogdmFsdWUgfTtcbiAgICBkZWZhdWx0OiB7XG4gICAgICAvLyBPdGhlciBhdXRoIGRhdGFcbiAgICAgIGNvbnN0IGF1dGhEYXRhTWF0Y2ggPSBrZXkubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgY29uc3QgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICAvLyBTcGVjaWFsLWNhc2UgYXV0aCBkYXRhLlxuICAgICAgICByZXR1cm4geyBrZXk6IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9LmlkYCwgdmFsdWUgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjb25zdCBleHBlY3RlZFR5cGVJc0FycmF5ID0gc2NoZW1hICYmIHNjaGVtYS5maWVsZHNba2V5XSAmJiBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ0FycmF5JztcblxuICBjb25zdCBleHBlY3RlZFR5cGVJc1BvaW50ZXIgPVxuICAgIHNjaGVtYSAmJiBzY2hlbWEuZmllbGRzW2tleV0gJiYgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdQb2ludGVyJztcblxuICBjb25zdCBmaWVsZCA9IHNjaGVtYSAmJiBzY2hlbWEuZmllbGRzW2tleV07XG4gIGlmIChleHBlY3RlZFR5cGVJc1BvaW50ZXIgfHwgKCFzY2hlbWEgJiYgdmFsdWUgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpKSB7XG4gICAga2V5ID0gJ19wXycgKyBrZXk7XG4gIH1cblxuICAvLyBIYW5kbGUgcXVlcnkgY29uc3RyYWludHNcbiAgY29uc3QgdHJhbnNmb3JtZWRDb25zdHJhaW50ID0gdHJhbnNmb3JtQ29uc3RyYWludCh2YWx1ZSwgZmllbGQsIGNvdW50KTtcbiAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludCAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludC4kdGV4dCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJHRleHQnLCB2YWx1ZTogdHJhbnNmb3JtZWRDb25zdHJhaW50LiR0ZXh0IH07XG4gICAgfVxuICAgIGlmICh0cmFuc2Zvcm1lZENvbnN0cmFpbnQuJGVsZW1NYXRjaCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJG5vcicsIHZhbHVlOiBbeyBba2V5XTogdHJhbnNmb3JtZWRDb25zdHJhaW50IH1dIH07XG4gICAgfVxuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHRyYW5zZm9ybWVkQ29uc3RyYWludCB9O1xuICB9XG5cbiAgaWYgKGV4cGVjdGVkVHlwZUlzQXJyYXkgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHsgJGFsbDogW3RyYW5zZm9ybUludGVyaW9yQXRvbSh2YWx1ZSldIH0gfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIGlmICh0cmFuc2Zvcm1Ub3BMZXZlbEF0b20odmFsdWUpICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20odmFsdWUpIH07XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYFlvdSBjYW5ub3QgdXNlICR7dmFsdWV9IGFzIGEgcXVlcnkgcGFyYW1ldGVyLmBcbiAgICApO1xuICB9XG59XG5cbi8vIE1haW4gZXhwb3NlZCBtZXRob2QgdG8gaGVscCBydW4gcXVlcmllcy5cbi8vIHJlc3RXaGVyZSBpcyB0aGUgXCJ3aGVyZVwiIGNsYXVzZSBpbiBSRVNUIEFQSSBmb3JtLlxuLy8gUmV0dXJucyB0aGUgbW9uZ28gZm9ybSBvZiB0aGUgcXVlcnkuXG5mdW5jdGlvbiB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHJlc3RXaGVyZSwgc2NoZW1hLCBjb3VudCA9IGZhbHNlKSB7XG4gIGNvbnN0IG1vbmdvV2hlcmUgPSB7fTtcbiAgZm9yIChjb25zdCByZXN0S2V5IGluIHJlc3RXaGVyZSkge1xuICAgIGNvbnN0IG91dCA9IHRyYW5zZm9ybVF1ZXJ5S2V5VmFsdWUoY2xhc3NOYW1lLCByZXN0S2V5LCByZXN0V2hlcmVbcmVzdEtleV0sIHNjaGVtYSwgY291bnQpO1xuICAgIG1vbmdvV2hlcmVbb3V0LmtleV0gPSBvdXQudmFsdWU7XG4gIH1cbiAgcmV0dXJuIG1vbmdvV2hlcmU7XG59XG5cbmNvbnN0IHBhcnNlT2JqZWN0S2V5VmFsdWVUb01vbmdvT2JqZWN0S2V5VmFsdWUgPSAocmVzdEtleSwgcmVzdFZhbHVlLCBzY2hlbWEpID0+IHtcbiAgLy8gQ2hlY2sgaWYgdGhlIHNjaGVtYSBpcyBrbm93biBzaW5jZSBpdCdzIGEgYnVpbHQtaW4gZmllbGQuXG4gIGxldCB0cmFuc2Zvcm1lZFZhbHVlO1xuICBsZXQgY29lcmNlZFRvRGF0ZTtcbiAgc3dpdGNoIChyZXN0S2V5KSB7XG4gICAgY2FzZSAnb2JqZWN0SWQnOlxuICAgICAgcmV0dXJuIHsga2V5OiAnX2lkJywgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSkgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnZXhwaXJlc0F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKSA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLCB2YWx1ZTogY29lcmNlZFRvRGF0ZSB9O1xuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLCB2YWx1ZTogY29lcmNlZFRvRGF0ZSB9O1xuICAgIGNhc2UgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKSA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX2ZhaWxlZF9sb2dpbl9jb3VudCc6XG4gICAgY2FzZSAnX3JwZXJtJzpcbiAgICBjYXNlICdfd3Blcm0nOlxuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW4nOlxuICAgIGNhc2UgJ19oYXNoZWRfcGFzc3dvcmQnOlxuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuJzpcbiAgICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgICByZXR1cm4geyBrZXk6ICdfc2Vzc2lvbl90b2tlbicsIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICBkZWZhdWx0OlxuICAgICAgLy8gQXV0aCBkYXRhIHNob3VsZCBoYXZlIGJlZW4gdHJhbnNmb3JtZWQgYWxyZWFkeVxuICAgICAgaWYgKHJlc3RLZXkubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnY2FuIG9ubHkgcXVlcnkgb24gJyArIHJlc3RLZXkpO1xuICAgICAgfVxuICAgICAgLy8gVHJ1c3QgdGhhdCB0aGUgYXV0aCBkYXRhIGhhcyBiZWVuIHRyYW5zZm9ybWVkIGFuZCBzYXZlIGl0IGRpcmVjdGx5XG4gICAgICBpZiAocmVzdEtleS5tYXRjaCgvXl9hdXRoX2RhdGFfW2EtekEtWjAtOV9dKyQvKSkge1xuICAgICAgICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICAgIH1cbiAgfVxuICAvL3NraXAgc3RyYWlnaHQgdG8gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tIGZvciBCeXRlcywgdGhleSBkb24ndCBzaG93IHVwIGluIHRoZSBzY2hlbWEgZm9yIHNvbWUgcmVhc29uXG4gIGlmIChyZXN0VmFsdWUgJiYgcmVzdFZhbHVlLl9fdHlwZSAhPT0gJ0J5dGVzJykge1xuICAgIC8vTm90ZTogV2UgbWF5IG5vdCBrbm93IHRoZSB0eXBlIG9mIGEgZmllbGQgaGVyZSwgYXMgdGhlIHVzZXIgY291bGQgYmUgc2F2aW5nIChudWxsKSB0byBhIGZpZWxkXG4gICAgLy9UaGF0IG5ldmVyIGV4aXN0ZWQgYmVmb3JlLCBtZWFuaW5nIHdlIGNhbid0IGluZmVyIHRoZSB0eXBlLlxuICAgIGlmIChcbiAgICAgIChzY2hlbWEuZmllbGRzW3Jlc3RLZXldICYmIHNjaGVtYS5maWVsZHNbcmVzdEtleV0udHlwZSA9PSAnUG9pbnRlcicpIHx8XG4gICAgICByZXN0VmFsdWUuX190eXBlID09ICdQb2ludGVyJ1xuICAgICkge1xuICAgICAgcmVzdEtleSA9ICdfcF8nICsgcmVzdEtleTtcbiAgICB9XG4gIH1cblxuICAvLyBIYW5kbGUgYXRvbWljIHZhbHVlc1xuICB2YXIgdmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgaWYgKHZhbHVlICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlOiB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gQUNMcyBhcmUgaGFuZGxlZCBiZWZvcmUgdGhpcyBtZXRob2QgaXMgY2FsbGVkXG4gIC8vIElmIGFuIEFDTCBrZXkgc3RpbGwgZXhpc3RzIGhlcmUsIHNvbWV0aGluZyBpcyB3cm9uZy5cbiAgaWYgKHJlc3RLZXkgPT09ICdBQ0wnKSB7XG4gICAgdGhyb3cgJ1RoZXJlIHdhcyBhIHByb2JsZW0gdHJhbnNmb3JtaW5nIGFuIEFDTC4nO1xuICB9XG5cbiAgLy8gSGFuZGxlIGFycmF5c1xuICBpZiAocmVzdFZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICB2YWx1ZSA9IHJlc3RWYWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gICAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZTogdmFsdWUgfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBub3JtYWwgb2JqZWN0cyBieSByZWN1cnNpbmdcbiAgaWYgKE9iamVjdC5rZXlzKHJlc3RWYWx1ZSkuc29tZShrZXkgPT4ga2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgKTtcbiAgfVxuICB2YWx1ZSA9IG1hcFZhbHVlcyhyZXN0VmFsdWUsIHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlIH07XG59O1xuXG5jb25zdCBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUgPSAoY2xhc3NOYW1lLCByZXN0Q3JlYXRlLCBzY2hlbWEpID0+IHtcbiAgcmVzdENyZWF0ZSA9IGFkZExlZ2FjeUFDTChyZXN0Q3JlYXRlKTtcbiAgY29uc3QgbW9uZ29DcmVhdGUgPSB7fTtcbiAgZm9yIChjb25zdCByZXN0S2V5IGluIHJlc3RDcmVhdGUpIHtcbiAgICBpZiAocmVzdENyZWF0ZVtyZXN0S2V5XSAmJiByZXN0Q3JlYXRlW3Jlc3RLZXldLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHsga2V5LCB2YWx1ZSB9ID0gcGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZShcbiAgICAgIHJlc3RLZXksXG4gICAgICByZXN0Q3JlYXRlW3Jlc3RLZXldLFxuICAgICAgc2NoZW1hXG4gICAgKTtcbiAgICBpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgbW9uZ29DcmVhdGVba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIC8vIFVzZSB0aGUgbGVnYWN5IG1vbmdvIGZvcm1hdCBmb3IgY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXRcbiAgaWYgKG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdCkge1xuICAgIG1vbmdvQ3JlYXRlLl9jcmVhdGVkX2F0ID0gbmV3IERhdGUobW9uZ29DcmVhdGUuY3JlYXRlZEF0LmlzbyB8fCBtb25nb0NyZWF0ZS5jcmVhdGVkQXQpO1xuICAgIGRlbGV0ZSBtb25nb0NyZWF0ZS5jcmVhdGVkQXQ7XG4gIH1cbiAgaWYgKG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdCkge1xuICAgIG1vbmdvQ3JlYXRlLl91cGRhdGVkX2F0ID0gbmV3IERhdGUobW9uZ29DcmVhdGUudXBkYXRlZEF0LmlzbyB8fCBtb25nb0NyZWF0ZS51cGRhdGVkQXQpO1xuICAgIGRlbGV0ZSBtb25nb0NyZWF0ZS51cGRhdGVkQXQ7XG4gIH1cblxuICByZXR1cm4gbW9uZ29DcmVhdGU7XG59O1xuXG4vLyBNYWluIGV4cG9zZWQgbWV0aG9kIHRvIGhlbHAgdXBkYXRlIG9sZCBvYmplY3RzLlxuY29uc3QgdHJhbnNmb3JtVXBkYXRlID0gKGNsYXNzTmFtZSwgcmVzdFVwZGF0ZSwgcGFyc2VGb3JtYXRTY2hlbWEpID0+IHtcbiAgY29uc3QgbW9uZ29VcGRhdGUgPSB7fTtcbiAgY29uc3QgYWNsID0gYWRkTGVnYWN5QUNMKHJlc3RVcGRhdGUpO1xuICBpZiAoYWNsLl9ycGVybSB8fCBhY2wuX3dwZXJtIHx8IGFjbC5fYWNsKSB7XG4gICAgbW9uZ29VcGRhdGUuJHNldCA9IHt9O1xuICAgIGlmIChhY2wuX3JwZXJtKSB7XG4gICAgICBtb25nb1VwZGF0ZS4kc2V0Ll9ycGVybSA9IGFjbC5fcnBlcm07XG4gICAgfVxuICAgIGlmIChhY2wuX3dwZXJtKSB7XG4gICAgICBtb25nb1VwZGF0ZS4kc2V0Ll93cGVybSA9IGFjbC5fd3Blcm07XG4gICAgfVxuICAgIGlmIChhY2wuX2FjbCkge1xuICAgICAgbW9uZ29VcGRhdGUuJHNldC5fYWNsID0gYWNsLl9hY2w7XG4gICAgfVxuICB9XG4gIGZvciAodmFyIHJlc3RLZXkgaW4gcmVzdFVwZGF0ZSkge1xuICAgIGlmIChyZXN0VXBkYXRlW3Jlc3RLZXldICYmIHJlc3RVcGRhdGVbcmVzdEtleV0uX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgdmFyIG91dCA9IHRyYW5zZm9ybUtleVZhbHVlRm9yVXBkYXRlKFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgcmVzdEtleSxcbiAgICAgIHJlc3RVcGRhdGVbcmVzdEtleV0sXG4gICAgICBwYXJzZUZvcm1hdFNjaGVtYVxuICAgICk7XG5cbiAgICAvLyBJZiB0aGUgb3V0cHV0IHZhbHVlIGlzIGFuIG9iamVjdCB3aXRoIGFueSAkIGtleXMsIGl0J3MgYW5cbiAgICAvLyBvcGVyYXRvciB0aGF0IG5lZWRzIHRvIGJlIGxpZnRlZCBvbnRvIHRoZSB0b3AgbGV2ZWwgdXBkYXRlXG4gICAgLy8gb2JqZWN0LlxuICAgIGlmICh0eXBlb2Ygb3V0LnZhbHVlID09PSAnb2JqZWN0JyAmJiBvdXQudmFsdWUgIT09IG51bGwgJiYgb3V0LnZhbHVlLl9fb3ApIHtcbiAgICAgIG1vbmdvVXBkYXRlW291dC52YWx1ZS5fX29wXSA9IG1vbmdvVXBkYXRlW291dC52YWx1ZS5fX29wXSB8fCB7fTtcbiAgICAgIG1vbmdvVXBkYXRlW291dC52YWx1ZS5fX29wXVtvdXQua2V5XSA9IG91dC52YWx1ZS5hcmc7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1vbmdvVXBkYXRlWyckc2V0J10gPSBtb25nb1VwZGF0ZVsnJHNldCddIHx8IHt9O1xuICAgICAgbW9uZ29VcGRhdGVbJyRzZXQnXVtvdXQua2V5XSA9IG91dC52YWx1ZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbW9uZ29VcGRhdGU7XG59O1xuXG4vLyBBZGQgdGhlIGxlZ2FjeSBfYWNsIGZvcm1hdC5cbmNvbnN0IGFkZExlZ2FjeUFDTCA9IHJlc3RPYmplY3QgPT4ge1xuICBjb25zdCByZXN0T2JqZWN0Q29weSA9IHsgLi4ucmVzdE9iamVjdCB9O1xuICBjb25zdCBfYWNsID0ge307XG5cbiAgaWYgKHJlc3RPYmplY3QuX3dwZXJtKSB7XG4gICAgcmVzdE9iamVjdC5fd3Blcm0uZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBfYWNsW2VudHJ5XSA9IHsgdzogdHJ1ZSB9O1xuICAgIH0pO1xuICAgIHJlc3RPYmplY3RDb3B5Ll9hY2wgPSBfYWNsO1xuICB9XG5cbiAgaWYgKHJlc3RPYmplY3QuX3JwZXJtKSB7XG4gICAgcmVzdE9iamVjdC5fcnBlcm0uZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIShlbnRyeSBpbiBfYWNsKSkge1xuICAgICAgICBfYWNsW2VudHJ5XSA9IHsgcjogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgX2FjbFtlbnRyeV0uciA9IHRydWU7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmVzdE9iamVjdENvcHkuX2FjbCA9IF9hY2w7XG4gIH1cblxuICByZXR1cm4gcmVzdE9iamVjdENvcHk7XG59O1xuXG4vLyBBIHNlbnRpbmVsIHZhbHVlIHRoYXQgaGVscGVyIHRyYW5zZm9ybWF0aW9ucyByZXR1cm4gd2hlbiB0aGV5XG4vLyBjYW5ub3QgcGVyZm9ybSBhIHRyYW5zZm9ybWF0aW9uXG5mdW5jdGlvbiBDYW5ub3RUcmFuc2Zvcm0oKSB7fVxuXG5jb25zdCB0cmFuc2Zvcm1JbnRlcmlvckF0b20gPSBhdG9tID0+IHtcbiAgLy8gVE9ETzogY2hlY2sgdmFsaWRpdHkgaGFyZGVyIGZvciB0aGUgX190eXBlLWRlZmluZWQgdHlwZXNcbiAgaWYgKHR5cGVvZiBhdG9tID09PSAnb2JqZWN0JyAmJiBhdG9tICYmICEoYXRvbSBpbnN0YW5jZW9mIERhdGUpICYmIGF0b20uX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6IGF0b20uY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IGF0b20ub2JqZWN0SWQsXG4gICAgfTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgYXRvbSA9PT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2YgYXRvbSA9PT0gJ3N5bWJvbCcpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgY2Fubm90IHRyYW5zZm9ybSB2YWx1ZTogJHthdG9tfWApO1xuICB9IGVsc2UgaWYgKERhdGVDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgIHJldHVybiBEYXRlQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gIH0gZWxzZSBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgIHJldHVybiBCeXRlc0NvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBhdG9tID09PSAnb2JqZWN0JyAmJiBhdG9tICYmIGF0b20uJHJlZ2V4ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gbmV3IFJlZ0V4cChhdG9tLiRyZWdleCk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGF0b207XG4gIH1cbn07XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byB0cmFuc2Zvcm0gYW4gYXRvbSBmcm9tIFJFU1QgZm9ybWF0IHRvIE1vbmdvIGZvcm1hdC5cbi8vIEFuIGF0b20gaXMgYW55dGhpbmcgdGhhdCBjYW4ndCBjb250YWluIG90aGVyIGV4cHJlc3Npb25zLiBTbyBpdFxuLy8gaW5jbHVkZXMgdGhpbmdzIHdoZXJlIG9iamVjdHMgYXJlIHVzZWQgdG8gcmVwcmVzZW50IG90aGVyXG4vLyBkYXRhdHlwZXMsIGxpa2UgcG9pbnRlcnMgYW5kIGRhdGVzLCBidXQgaXQgZG9lcyBub3QgaW5jbHVkZSBvYmplY3RzXG4vLyBvciBhcnJheXMgd2l0aCBnZW5lcmljIHN0dWZmIGluc2lkZS5cbi8vIFJhaXNlcyBhbiBlcnJvciBpZiB0aGlzIGNhbm5vdCBwb3NzaWJseSBiZSB2YWxpZCBSRVNUIGZvcm1hdC5cbi8vIFJldHVybnMgQ2Fubm90VHJhbnNmb3JtIGlmIGl0J3MganVzdCBub3QgYW4gYXRvbVxuZnVuY3Rpb24gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKGF0b20sIGZpZWxkKSB7XG4gIHN3aXRjaCAodHlwZW9mIGF0b20pIHtcbiAgICBjYXNlICdudW1iZXInOlxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICByZXR1cm4gYXRvbTtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgaWYgKGZpZWxkICYmIGZpZWxkLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYCR7ZmllbGQudGFyZ2V0Q2xhc3N9JCR7YXRvbX1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGF0b207XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgY2Fubm90IHRyYW5zZm9ybSB2YWx1ZTogJHthdG9tfWApO1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoYXRvbSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgLy8gVGVjaG5pY2FsbHkgZGF0ZXMgYXJlIG5vdCByZXN0IGZvcm1hdCwgYnV0LCBpdCBzZWVtcyBwcmV0dHlcbiAgICAgICAgLy8gY2xlYXIgd2hhdCB0aGV5IHNob3VsZCBiZSB0cmFuc2Zvcm1lZCB0bywgc28gbGV0J3MganVzdCBkbyBpdC5cbiAgICAgICAgcmV0dXJuIGF0b207XG4gICAgICB9XG5cbiAgICAgIGlmIChhdG9tID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBhdG9tO1xuICAgICAgfVxuXG4gICAgICAvLyBUT0RPOiBjaGVjayB2YWxpZGl0eSBoYXJkZXIgZm9yIHRoZSBfX3R5cGUtZGVmaW5lZCB0eXBlc1xuICAgICAgaWYgKGF0b20uX190eXBlID09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYCR7YXRvbS5jbGFzc05hbWV9JCR7YXRvbS5vYmplY3RJZH1gO1xuICAgICAgfVxuICAgICAgaWYgKERhdGVDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gRGF0ZUNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKEJ5dGVzQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICAgICAgcmV0dXJuIEJ5dGVzQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICBpZiAoR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gR2VvUG9pbnRDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIGlmIChQb2x5Z29uQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICAgICAgcmV0dXJuIFBvbHlnb25Db2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIGlmIChGaWxlQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICAgICAgcmV0dXJuIEZpbGVDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBDYW5ub3RUcmFuc2Zvcm07XG5cbiAgICBkZWZhdWx0OlxuICAgICAgLy8gSSBkb24ndCB0aGluayB0eXBlb2YgY2FuIGV2ZXIgbGV0IHVzIGdldCBoZXJlXG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgYHJlYWxseSBkaWQgbm90IGV4cGVjdCB2YWx1ZTogJHthdG9tfWBcbiAgICAgICk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVsYXRpdmVUaW1lVG9EYXRlKHRleHQsIG5vdyA9IG5ldyBEYXRlKCkpIHtcbiAgdGV4dCA9IHRleHQudG9Mb3dlckNhc2UoKTtcblxuICBsZXQgcGFydHMgPSB0ZXh0LnNwbGl0KCcgJyk7XG5cbiAgLy8gRmlsdGVyIG91dCB3aGl0ZXNwYWNlXG4gIHBhcnRzID0gcGFydHMuZmlsdGVyKHBhcnQgPT4gcGFydCAhPT0gJycpO1xuXG4gIGNvbnN0IGZ1dHVyZSA9IHBhcnRzWzBdID09PSAnaW4nO1xuICBjb25zdCBwYXN0ID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV0gPT09ICdhZ28nO1xuXG4gIGlmICghZnV0dXJlICYmICFwYXN0ICYmIHRleHQgIT09ICdub3cnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgIGluZm86IFwiVGltZSBzaG91bGQgZWl0aGVyIHN0YXJ0IHdpdGggJ2luJyBvciBlbmQgd2l0aCAnYWdvJ1wiLFxuICAgIH07XG4gIH1cblxuICBpZiAoZnV0dXJlICYmIHBhc3QpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgaW5mbzogXCJUaW1lIGNhbm5vdCBoYXZlIGJvdGggJ2luJyBhbmQgJ2FnbydcIixcbiAgICB9O1xuICB9XG5cbiAgLy8gc3RyaXAgdGhlICdhZ28nIG9yICdpbidcbiAgaWYgKGZ1dHVyZSkge1xuICAgIHBhcnRzID0gcGFydHMuc2xpY2UoMSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gcGFzdFxuICAgIHBhcnRzID0gcGFydHMuc2xpY2UoMCwgcGFydHMubGVuZ3RoIC0gMSk7XG4gIH1cblxuICBpZiAocGFydHMubGVuZ3RoICUgMiAhPT0gMCAmJiB0ZXh0ICE9PSAnbm93Jykge1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICBpbmZvOiAnSW52YWxpZCB0aW1lIHN0cmluZy4gRGFuZ2xpbmcgdW5pdCBvciBudW1iZXIuJyxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgcGFpcnMgPSBbXTtcbiAgd2hpbGUgKHBhcnRzLmxlbmd0aCkge1xuICAgIHBhaXJzLnB1c2goW3BhcnRzLnNoaWZ0KCksIHBhcnRzLnNoaWZ0KCldKTtcbiAgfVxuXG4gIGxldCBzZWNvbmRzID0gMDtcbiAgZm9yIChjb25zdCBbbnVtLCBpbnRlcnZhbF0gb2YgcGFpcnMpIHtcbiAgICBjb25zdCB2YWwgPSBOdW1iZXIobnVtKTtcbiAgICBpZiAoIU51bWJlci5pc0ludGVnZXIodmFsKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICBpbmZvOiBgJyR7bnVtfScgaXMgbm90IGFuIGludGVnZXIuYCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgc3dpdGNoIChpbnRlcnZhbCkge1xuICAgICAgY2FzZSAneXInOlxuICAgICAgY2FzZSAneXJzJzpcbiAgICAgIGNhc2UgJ3llYXInOlxuICAgICAgY2FzZSAneWVhcnMnOlxuICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDMxNTM2MDAwOyAvLyAzNjUgKiAyNCAqIDYwICogNjBcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ3drJzpcbiAgICAgIGNhc2UgJ3drcyc6XG4gICAgICBjYXNlICd3ZWVrJzpcbiAgICAgIGNhc2UgJ3dlZWtzJzpcbiAgICAgICAgc2Vjb25kcyArPSB2YWwgKiA2MDQ4MDA7IC8vIDcgKiAyNCAqIDYwICogNjBcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ2QnOlxuICAgICAgY2FzZSAnZGF5JzpcbiAgICAgIGNhc2UgJ2RheXMnOlxuICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDg2NDAwOyAvLyAyNCAqIDYwICogNjBcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ2hyJzpcbiAgICAgIGNhc2UgJ2hycyc6XG4gICAgICBjYXNlICdob3VyJzpcbiAgICAgIGNhc2UgJ2hvdXJzJzpcbiAgICAgICAgc2Vjb25kcyArPSB2YWwgKiAzNjAwOyAvLyA2MCAqIDYwXG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdtaW4nOlxuICAgICAgY2FzZSAnbWlucyc6XG4gICAgICBjYXNlICdtaW51dGUnOlxuICAgICAgY2FzZSAnbWludXRlcyc6XG4gICAgICAgIHNlY29uZHMgKz0gdmFsICogNjA7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdzZWMnOlxuICAgICAgY2FzZSAnc2Vjcyc6XG4gICAgICBjYXNlICdzZWNvbmQnOlxuICAgICAgY2FzZSAnc2Vjb25kcyc6XG4gICAgICAgIHNlY29uZHMgKz0gdmFsO1xuICAgICAgICBicmVhaztcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgICAgaW5mbzogYEludmFsaWQgaW50ZXJ2YWw6ICcke2ludGVydmFsfSdgLFxuICAgICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG1pbGxpc2Vjb25kcyA9IHNlY29uZHMgKiAxMDAwO1xuICBpZiAoZnV0dXJlKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgaW5mbzogJ2Z1dHVyZScsXG4gICAgICByZXN1bHQ6IG5ldyBEYXRlKG5vdy52YWx1ZU9mKCkgKyBtaWxsaXNlY29uZHMpLFxuICAgIH07XG4gIH0gZWxzZSBpZiAocGFzdCkge1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgIGluZm86ICdwYXN0JyxcbiAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSAtIG1pbGxpc2Vjb25kcyksXG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICBpbmZvOiAncHJlc2VudCcsXG4gICAgICByZXN1bHQ6IG5ldyBEYXRlKG5vdy52YWx1ZU9mKCkpLFxuICAgIH07XG4gIH1cbn1cblxuLy8gVHJhbnNmb3JtcyBhIHF1ZXJ5IGNvbnN0cmFpbnQgZnJvbSBSRVNUIEFQSSBmb3JtYXQgdG8gTW9uZ28gZm9ybWF0LlxuLy8gQSBjb25zdHJhaW50IGlzIHNvbWV0aGluZyB3aXRoIGZpZWxkcyBsaWtlICRsdC5cbi8vIElmIGl0IGlzIG5vdCBhIHZhbGlkIGNvbnN0cmFpbnQgYnV0IGl0IGNvdWxkIGJlIGEgdmFsaWQgc29tZXRoaW5nXG4vLyBlbHNlLCByZXR1cm4gQ2Fubm90VHJhbnNmb3JtLlxuLy8gaW5BcnJheSBpcyB3aGV0aGVyIHRoaXMgaXMgYW4gYXJyYXkgZmllbGQuXG5mdW5jdGlvbiB0cmFuc2Zvcm1Db25zdHJhaW50KGNvbnN0cmFpbnQsIGZpZWxkLCBjb3VudCA9IGZhbHNlKSB7XG4gIGNvbnN0IGluQXJyYXkgPSBmaWVsZCAmJiBmaWVsZC50eXBlICYmIGZpZWxkLnR5cGUgPT09ICdBcnJheSc7XG4gIGlmICh0eXBlb2YgY29uc3RyYWludCAhPT0gJ29iamVjdCcgfHwgIWNvbnN0cmFpbnQpIHtcbiAgICByZXR1cm4gQ2Fubm90VHJhbnNmb3JtO1xuICB9XG4gIGNvbnN0IHRyYW5zZm9ybUZ1bmN0aW9uID0gaW5BcnJheSA/IHRyYW5zZm9ybUludGVyaW9yQXRvbSA6IHRyYW5zZm9ybVRvcExldmVsQXRvbTtcbiAgY29uc3QgdHJhbnNmb3JtZXIgPSBhdG9tID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSB0cmFuc2Zvcm1GdW5jdGlvbihhdG9tLCBmaWVsZCk7XG4gICAgaWYgKHJlc3VsdCA9PT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkIGF0b206ICR7SlNPTi5zdHJpbmdpZnkoYXRvbSl9YCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG4gIC8vIGtleXMgaXMgdGhlIGNvbnN0cmFpbnRzIGluIHJldmVyc2UgYWxwaGFiZXRpY2FsIG9yZGVyLlxuICAvLyBUaGlzIGlzIGEgaGFjayBzbyB0aGF0OlxuICAvLyAgICRyZWdleCBpcyBoYW5kbGVkIGJlZm9yZSAkb3B0aW9uc1xuICAvLyAgICRuZWFyU3BoZXJlIGlzIGhhbmRsZWQgYmVmb3JlICRtYXhEaXN0YW5jZVxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGNvbnN0cmFpbnQpLnNvcnQoKS5yZXZlcnNlKCk7XG4gIHZhciBhbnN3ZXIgPSB7fTtcbiAgZm9yICh2YXIga2V5IG9mIGtleXMpIHtcbiAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgY2FzZSAnJGx0JzpcbiAgICAgIGNhc2UgJyRsdGUnOlxuICAgICAgY2FzZSAnJGd0JzpcbiAgICAgIGNhc2UgJyRndGUnOlxuICAgICAgY2FzZSAnJGV4aXN0cyc6XG4gICAgICBjYXNlICckbmUnOlxuICAgICAgY2FzZSAnJGVxJzoge1xuICAgICAgICBjb25zdCB2YWwgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICh2YWwgJiYgdHlwZW9mIHZhbCA9PT0gJ29iamVjdCcgJiYgdmFsLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSAhPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIERhdGUgZmllbGQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgICBjYXNlICckZXhpc3RzJzpcbiAgICAgICAgICAgIGNhc2UgJyRuZSc6XG4gICAgICAgICAgICBjYXNlICckZXEnOlxuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBwYXJzZXJSZXN1bHQgPSByZWxhdGl2ZVRpbWVUb0RhdGUodmFsLiRyZWxhdGl2ZVRpbWUpO1xuICAgICAgICAgIGlmIChwYXJzZXJSZXN1bHQuc3RhdHVzID09PSAnc3VjY2VzcycpIHtcbiAgICAgICAgICAgIGFuc3dlcltrZXldID0gcGFyc2VyUmVzdWx0LnJlc3VsdDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGxvZy5pbmZvKCdFcnJvciB3aGlsZSBwYXJzaW5nIHJlbGF0aXZlIGRhdGUnLCBwYXJzZXJSZXN1bHQpO1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGBiYWQgJHJlbGF0aXZlVGltZSAoJHtrZXl9KSB2YWx1ZS4gJHtwYXJzZXJSZXN1bHQuaW5mb31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFuc3dlcltrZXldID0gdHJhbnNmb3JtZXIodmFsKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGNhc2UgJyRpbic6XG4gICAgICBjYXNlICckbmluJzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJyArIGtleSArICcgdmFsdWUnKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IF8uZmxhdE1hcChhcnIsIHZhbHVlID0+IHtcbiAgICAgICAgICByZXR1cm4gKGF0b20gPT4ge1xuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYXRvbSkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcCh0cmFuc2Zvcm1lcik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gdHJhbnNmb3JtZXIoYXRvbSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSkodmFsdWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckYWxsJzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJyArIGtleSArICcgdmFsdWUnKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IGFyci5tYXAodHJhbnNmb3JtSW50ZXJpb3JBdG9tKTtcblxuICAgICAgICBjb25zdCB2YWx1ZXMgPSBhbnN3ZXJba2V5XTtcbiAgICAgICAgaWYgKGlzQW55VmFsdWVSZWdleCh2YWx1ZXMpICYmICFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKHZhbHVlcykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgdmFsdWVzXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJHJlZ2V4JzpcbiAgICAgICAgdmFyIHMgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICh0eXBlb2YgcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkIHJlZ2V4OiAnICsgcyk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBzO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJGNvbnRhaW5lZEJ5Jzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJGNvbnRhaW5lZEJ5OiBzaG91bGQgYmUgYW4gYXJyYXlgKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXIuJGVsZW1NYXRjaCA9IHtcbiAgICAgICAgICAkbmluOiBhcnIubWFwKHRyYW5zZm9ybWVyKSxcbiAgICAgICAgfTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckb3B0aW9ucyc6XG4gICAgICAgIGFuc3dlcltrZXldID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJHRleHQnOiB7XG4gICAgICAgIGNvbnN0IHNlYXJjaCA9IGNvbnN0cmFpbnRba2V5XS4kc2VhcmNoO1xuICAgICAgICBpZiAodHlwZW9mIHNlYXJjaCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFzZWFyY2guJHRlcm0gfHwgdHlwZW9mIHNlYXJjaC4kdGVybSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICAgJHNlYXJjaDogc2VhcmNoLiR0ZXJtLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRsYW5ndWFnZSkge1xuICAgICAgICAgIGFuc3dlcltrZXldLiRsYW5ndWFnZSA9IHNlYXJjaC4kbGFuZ3VhZ2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XS4kY2FzZVNlbnNpdGl2ZSA9IHNlYXJjaC4kY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0uJGRpYWNyaXRpY1NlbnNpdGl2ZSA9IHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJG5lYXJTcGhlcmUnOiB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICBhbnN3ZXIuJGdlb1dpdGhpbiA9IHtcbiAgICAgICAgICAgICRjZW50ZXJTcGhlcmU6IFtbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV0sIGNvbnN0cmFpbnQuJG1heERpc3RhbmNlXSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFuc3dlcltrZXldID0gW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJG1heERpc3RhbmNlJzoge1xuICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICAvLyBUaGUgU0RLcyBkb24ndCBzZWVtIHRvIHVzZSB0aGVzZSBidXQgdGhleSBhcmUgZG9jdW1lbnRlZCBpbiB0aGVcbiAgICAgIC8vIFJFU1QgQVBJIGRvY3MuXG4gICAgICBjYXNlICckbWF4RGlzdGFuY2VJblJhZGlhbnMnOlxuICAgICAgICBhbnN3ZXJbJyRtYXhEaXN0YW5jZSddID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZUluTWlsZXMnOlxuICAgICAgICBhbnN3ZXJbJyRtYXhEaXN0YW5jZSddID0gY29uc3RyYWludFtrZXldIC8gMzk1OTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckbWF4RGlzdGFuY2VJbktpbG9tZXRlcnMnOlxuICAgICAgICBhbnN3ZXJbJyRtYXhEaXN0YW5jZSddID0gY29uc3RyYWludFtrZXldIC8gNjM3MTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJyRzZWxlY3QnOlxuICAgICAgY2FzZSAnJGRvbnRTZWxlY3QnOlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAndGhlICcgKyBrZXkgKyAnIGNvbnN0cmFpbnQgaXMgbm90IHN1cHBvcnRlZCB5ZXQnXG4gICAgICAgICk7XG5cbiAgICAgIGNhc2UgJyR3aXRoaW4nOlxuICAgICAgICB2YXIgYm94ID0gY29uc3RyYWludFtrZXldWyckYm94J107XG4gICAgICAgIGlmICghYm94IHx8IGJveC5sZW5ndGggIT0gMikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdtYWxmb3JtYXR0ZWQgJHdpdGhpbiBhcmcnKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAkYm94OiBbXG4gICAgICAgICAgICBbYm94WzBdLmxvbmdpdHVkZSwgYm94WzBdLmxhdGl0dWRlXSxcbiAgICAgICAgICAgIFtib3hbMV0ubG9uZ2l0dWRlLCBib3hbMV0ubGF0aXR1ZGVdLFxuICAgICAgICAgIF0sXG4gICAgICAgIH07XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICckZ2VvV2l0aGluJzoge1xuICAgICAgICBjb25zdCBwb2x5Z29uID0gY29uc3RyYWludFtrZXldWyckcG9seWdvbiddO1xuICAgICAgICBjb25zdCBjZW50ZXJTcGhlcmUgPSBjb25zdHJhaW50W2tleV1bJyRjZW50ZXJTcGhlcmUnXTtcbiAgICAgICAgaWYgKHBvbHlnb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGxldCBwb2ludHM7XG4gICAgICAgICAgaWYgKHR5cGVvZiBwb2x5Z29uID09PSAnb2JqZWN0JyAmJiBwb2x5Z29uLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgICAgICBpZiAoIXBvbHlnb24uY29vcmRpbmF0ZXMgfHwgcG9seWdvbi5jb29yZGluYXRlcy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyBQb2x5Z29uLmNvb3JkaW5hdGVzIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgbG9uL2xhdCBwYWlycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBvaW50cyA9IHBvbHlnb24uY29vcmRpbmF0ZXM7XG4gICAgICAgICAgfSBlbHNlIGlmIChwb2x5Z29uIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICAgIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgR2VvUG9pbnRzJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcG9pbnRzID0gcG9seWdvbjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgIFwiYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBiZSBQb2x5Z29uIG9iamVjdCBvciBBcnJheSBvZiBQYXJzZS5HZW9Qb2ludCdzXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHBvaW50cyA9IHBvaW50cy5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgICAgICByZXR1cm4gcG9pbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGdlb1dpdGhpbiB2YWx1ZScpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFtwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAgICRwb2x5Z29uOiBwb2ludHMsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIGlmIChjZW50ZXJTcGhlcmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICghKGNlbnRlclNwaGVyZSBpbnN0YW5jZW9mIEFycmF5KSB8fCBjZW50ZXJTcGhlcmUubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQgYW5kIGRpc3RhbmNlJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gR2V0IHBvaW50LCBjb252ZXJ0IHRvIGdlbyBwb2ludCBpZiBuZWNlc3NhcnkgYW5kIHZhbGlkYXRlXG4gICAgICAgICAgbGV0IHBvaW50ID0gY2VudGVyU3BoZXJlWzBdO1xuICAgICAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBnZW8gcG9pbnQgaW52YWxpZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICAvLyBHZXQgZGlzdGFuY2UgYW5kIHZhbGlkYXRlXG4gICAgICAgICAgY29uc3QgZGlzdGFuY2UgPSBjZW50ZXJTcGhlcmVbMV07XG4gICAgICAgICAgaWYgKGlzTmFOKGRpc3RhbmNlKSB8fCBkaXN0YW5jZSA8IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZGlzdGFuY2UgaW52YWxpZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICAgJGNlbnRlclNwaGVyZTogW1twb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXSwgZGlzdGFuY2VdLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckZ2VvSW50ZXJzZWN0cyc6IHtcbiAgICAgICAgY29uc3QgcG9pbnQgPSBjb25zdHJhaW50W2tleV1bJyRwb2ludCddO1xuICAgICAgICBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvSW50ZXJzZWN0IHZhbHVlOyAkcG9pbnQgc2hvdWxkIGJlIEdlb1BvaW50J1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICRnZW9tZXRyeToge1xuICAgICAgICAgICAgdHlwZTogJ1BvaW50JyxcbiAgICAgICAgICAgIGNvb3JkaW5hdGVzOiBbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpZiAoa2V5Lm1hdGNoKC9eXFwkKy8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCBjb25zdHJhaW50OiAnICsga2V5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gQ2Fubm90VHJhbnNmb3JtO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYW5zd2VyO1xufVxuXG4vLyBUcmFuc2Zvcm1zIGFuIHVwZGF0ZSBvcGVyYXRvciBmcm9tIFJFU1QgZm9ybWF0IHRvIG1vbmdvIGZvcm1hdC5cbi8vIFRvIGJlIHRyYW5zZm9ybWVkLCB0aGUgaW5wdXQgc2hvdWxkIGhhdmUgYW4gX19vcCBmaWVsZC5cbi8vIElmIGZsYXR0ZW4gaXMgdHJ1ZSwgdGhpcyB3aWxsIGZsYXR0ZW4gb3BlcmF0b3JzIHRvIHRoZWlyIHN0YXRpY1xuLy8gZGF0YSBmb3JtYXQuIEZvciBleGFtcGxlLCBhbiBpbmNyZW1lbnQgb2YgMiB3b3VsZCBzaW1wbHkgYmVjb21lIGFcbi8vIDIuXG4vLyBUaGUgb3V0cHV0IGZvciBhIG5vbi1mbGF0dGVuZWQgb3BlcmF0b3IgaXMgYSBoYXNoIHdpdGggX19vcCBiZWluZ1xuLy8gdGhlIG1vbmdvIG9wLCBhbmQgYXJnIGJlaW5nIHRoZSBhcmd1bWVudC5cbi8vIFRoZSBvdXRwdXQgZm9yIGEgZmxhdHRlbmVkIG9wZXJhdG9yIGlzIGp1c3QgYSB2YWx1ZS5cbi8vIFJldHVybnMgdW5kZWZpbmVkIGlmIHRoaXMgc2hvdWxkIGJlIGEgbm8tb3AuXG5cbmZ1bmN0aW9uIHRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yKHsgX19vcCwgYW1vdW50LCBvYmplY3RzIH0sIGZsYXR0ZW4pIHtcbiAgc3dpdGNoIChfX29wKSB7XG4gICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBfX29wOiAnJHVuc2V0JywgYXJnOiAnJyB9O1xuICAgICAgfVxuXG4gICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgIGlmICh0eXBlb2YgYW1vdW50ICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnaW5jcmVtZW50aW5nIG11c3QgcHJvdmlkZSBhIG51bWJlcicpO1xuICAgICAgfVxuICAgICAgaWYgKGZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIGFtb3VudDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IF9fb3A6ICckaW5jJywgYXJnOiBhbW91bnQgfTtcbiAgICAgIH1cblxuICAgIGNhc2UgJ0FkZCc6XG4gICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgIGlmICghKG9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgIH1cbiAgICAgIHZhciB0b0FkZCA9IG9iamVjdHMubWFwKHRyYW5zZm9ybUludGVyaW9yQXRvbSk7XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gdG9BZGQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgbW9uZ29PcCA9IHtcbiAgICAgICAgICBBZGQ6ICckcHVzaCcsXG4gICAgICAgICAgQWRkVW5pcXVlOiAnJGFkZFRvU2V0JyxcbiAgICAgICAgfVtfX29wXTtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogbW9uZ29PcCwgYXJnOiB7ICRlYWNoOiB0b0FkZCB9IH07XG4gICAgICB9XG5cbiAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgaWYgKCEob2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byByZW1vdmUgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgfVxuICAgICAgdmFyIHRvUmVtb3ZlID0gb2JqZWN0cy5tYXAodHJhbnNmb3JtSW50ZXJpb3JBdG9tKTtcbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IF9fb3A6ICckcHVsbEFsbCcsIGFyZzogdG9SZW1vdmUgfTtcbiAgICAgIH1cblxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgIGBUaGUgJHtfX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICApO1xuICB9XG59XG5mdW5jdGlvbiBtYXBWYWx1ZXMob2JqZWN0LCBpdGVyYXRvcikge1xuICBjb25zdCByZXN1bHQgPSB7fTtcbiAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgcmVzdWx0W2tleV0gPSBpdGVyYXRvcihvYmplY3Rba2V5XSk7XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5jb25zdCBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QgPSBtb25nb09iamVjdCA9PiB7XG4gIHN3aXRjaCAodHlwZW9mIG1vbmdvT2JqZWN0KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICBjYXNlICdudW1iZXInOlxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICByZXR1cm4gbW9uZ29PYmplY3Q7XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICB0aHJvdyAnYmFkIHZhbHVlIGluIG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCc7XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChtb25nb09iamVjdCA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC5tYXAobmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICByZXR1cm4gUGFyc2UuX2VuY29kZShtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuTG9uZykge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QudG9OdW1iZXIoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5Eb3VibGUpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnZhbHVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QobW9uZ29PYmplY3QpKSB7XG4gICAgICAgIHJldHVybiBCeXRlc0NvZGVyLmRhdGFiYXNlVG9KU09OKG1vbmdvT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwobW9uZ29PYmplY3QsICdfX3R5cGUnKSAmJlxuICAgICAgICBtb25nb09iamVjdC5fX3R5cGUgPT0gJ0RhdGUnICYmXG4gICAgICAgIG1vbmdvT2JqZWN0LmlzbyBpbnN0YW5jZW9mIERhdGVcbiAgICAgICkge1xuICAgICAgICBtb25nb09iamVjdC5pc28gPSBtb25nb09iamVjdC5pc28udG9KU09OKCk7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG1hcFZhbHVlcyhtb25nb09iamVjdCwgbmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0KTtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgJ3Vua25vd24ganMgdHlwZSc7XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcgPSAoc2NoZW1hLCBmaWVsZCwgcG9pbnRlclN0cmluZykgPT4ge1xuICBjb25zdCBvYmpEYXRhID0gcG9pbnRlclN0cmluZy5zcGxpdCgnJCcpO1xuICBpZiAob2JqRGF0YVswXSAhPT0gc2NoZW1hLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MpIHtcbiAgICB0aHJvdyAncG9pbnRlciB0byBpbmNvcnJlY3QgY2xhc3NOYW1lJztcbiAgfVxuICByZXR1cm4ge1xuICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgIGNsYXNzTmFtZTogb2JqRGF0YVswXSxcbiAgICBvYmplY3RJZDogb2JqRGF0YVsxXSxcbiAgfTtcbn07XG5cbi8vIENvbnZlcnRzIGZyb20gYSBtb25nby1mb3JtYXQgb2JqZWN0IHRvIGEgUkVTVC1mb3JtYXQgb2JqZWN0LlxuLy8gRG9lcyBub3Qgc3RyaXAgb3V0IGFueXRoaW5nIGJhc2VkIG9uIGEgbGFjayBvZiBhdXRoZW50aWNhdGlvbi5cbmNvbnN0IG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCA9IChjbGFzc05hbWUsIG1vbmdvT2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgc3dpdGNoICh0eXBlb2YgbW9uZ29PYmplY3QpIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHJldHVybiBtb25nb09iamVjdDtcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHRocm93ICdiYWQgdmFsdWUgaW4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0JztcbiAgICBjYXNlICdvYmplY3QnOiB7XG4gICAgICBpZiAobW9uZ29PYmplY3QgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QubWFwKG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgcmV0dXJuIFBhcnNlLl9lbmNvZGUobW9uZ29PYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkxvbmcpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnRvTnVtYmVyKCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuRG91YmxlKSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC52YWx1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKEJ5dGVzQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KG1vbmdvT2JqZWN0KSkge1xuICAgICAgICByZXR1cm4gQnl0ZXNDb2Rlci5kYXRhYmFzZVRvSlNPTihtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3RPYmplY3QgPSB7fTtcbiAgICAgIGlmIChtb25nb09iamVjdC5fcnBlcm0gfHwgbW9uZ29PYmplY3QuX3dwZXJtKSB7XG4gICAgICAgIHJlc3RPYmplY3QuX3JwZXJtID0gbW9uZ29PYmplY3QuX3JwZXJtIHx8IFtdO1xuICAgICAgICByZXN0T2JqZWN0Ll93cGVybSA9IG1vbmdvT2JqZWN0Ll93cGVybSB8fCBbXTtcbiAgICAgICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9ycGVybTtcbiAgICAgICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll93cGVybTtcbiAgICAgIH1cblxuICAgICAgZm9yICh2YXIga2V5IGluIG1vbmdvT2JqZWN0KSB7XG4gICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgY2FzZSAnX2lkJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ29iamVjdElkJ10gPSAnJyArIG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdfaGFzaGVkX3Bhc3N3b3JkJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3QuX2hhc2hlZF9wYXNzd29yZCA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdfYWNsJzpcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW4nOlxuICAgICAgICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuJzpcbiAgICAgICAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgICAgICBjYXNlICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc6XG4gICAgICAgICAgY2FzZSAnX3RvbWJzdG9uZSc6XG4gICAgICAgICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgICAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAgICAgIGNhc2UgJ19mYWlsZWRfbG9naW5fY291bnQnOlxuICAgICAgICAgIGNhc2UgJ19wYXNzd29yZF9oaXN0b3J5JzpcbiAgICAgICAgICAgIC8vIFRob3NlIGtleXMgd2lsbCBiZSBkZWxldGVkIGlmIG5lZWRlZCBpbiB0aGUgREIgQ29udHJvbGxlclxuICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19zZXNzaW9uX3Rva2VuJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ3Nlc3Npb25Ub2tlbiddID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ3VwZGF0ZWRBdCc6XG4gICAgICAgICAgY2FzZSAnX3VwZGF0ZWRfYXQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsndXBkYXRlZEF0J10gPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pKS5pc287XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgICAgICAgIGNhc2UgJ19jcmVhdGVkX2F0JzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ2NyZWF0ZWRBdCddID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKSkuaXNvO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICAgICAgICBjYXNlICdfZXhwaXJlc0F0JzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ2V4cGlyZXNBdCddID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICAgICAgY2FzZSAnX2xhc3RfdXNlZCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydsYXN0VXNlZCddID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKSkuaXNvO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAndGltZXNVc2VkJzpcbiAgICAgICAgICBjYXNlICd0aW1lc191c2VkJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ3RpbWVzVXNlZCddID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2F1dGhEYXRhJzpcbiAgICAgICAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICAgICAgbG9nLndhcm4oXG4gICAgICAgICAgICAgICAgJ2lnbm9yaW5nIGF1dGhEYXRhIGluIF9Vc2VyIGFzIHRoaXMga2V5IGlzIHJlc2VydmVkIHRvIGJlIHN5bnRoZXNpemVkIG9mIGBfYXV0aF9kYXRhXypgIGtleXMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXN0T2JqZWN0WydhdXRoRGF0YSddID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAvLyBDaGVjayBvdGhlciBhdXRoIGRhdGEga2V5c1xuICAgICAgICAgICAgdmFyIGF1dGhEYXRhTWF0Y2ggPSBrZXkubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgICAgICAgIGlmIChhdXRoRGF0YU1hdGNoICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICAgICAgICByZXN0T2JqZWN0WydhdXRoRGF0YSddID0gcmVzdE9iamVjdFsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgICAgICAgcmVzdE9iamVjdFsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGtleS5pbmRleE9mKCdfcF8nKSA9PSAwKSB7XG4gICAgICAgICAgICAgIHZhciBuZXdLZXkgPSBrZXkuc3Vic3RyaW5nKDMpO1xuICAgICAgICAgICAgICBpZiAoIXNjaGVtYS5maWVsZHNbbmV3S2V5XSkge1xuICAgICAgICAgICAgICAgIGxvZy5pbmZvKFxuICAgICAgICAgICAgICAgICAgJ3RyYW5zZm9ybS5qcycsXG4gICAgICAgICAgICAgICAgICAnRm91bmQgYSBwb2ludGVyIGNvbHVtbiBub3QgaW4gdGhlIHNjaGVtYSwgZHJvcHBpbmcgaXQuJyxcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIG5ld0tleVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbbmV3S2V5XS50eXBlICE9PSAnUG9pbnRlcicpIHtcbiAgICAgICAgICAgICAgICBsb2cuaW5mbyhcbiAgICAgICAgICAgICAgICAgICd0cmFuc2Zvcm0uanMnLFxuICAgICAgICAgICAgICAgICAgJ0ZvdW5kIGEgcG9pbnRlciBpbiBhIG5vbi1wb2ludGVyIGNvbHVtbiwgZHJvcHBpbmcgaXQuJyxcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIGtleVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKG1vbmdvT2JqZWN0W2tleV0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXN0T2JqZWN0W25ld0tleV0gPSB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nKHNjaGVtYSwgbmV3S2V5LCBtb25nb09iamVjdFtrZXldKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGtleVswXSA9PSAnXycgJiYga2V5ICE9ICdfX3R5cGUnKSB7XG4gICAgICAgICAgICAgIHRocm93ICdiYWQga2V5IGluIHVudHJhbnNmb3JtOiAnICsga2V5O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdmFyIHZhbHVlID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnRmlsZScgJiZcbiAgICAgICAgICAgICAgICBGaWxlQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBGaWxlQ29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ0dlb1BvaW50JyAmJlxuICAgICAgICAgICAgICAgIEdlb1BvaW50Q29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBHZW9Qb2ludENvZGVyLmRhdGFiYXNlVG9KU09OKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdQb2x5Z29uJyAmJlxuICAgICAgICAgICAgICAgIFBvbHlnb25Db2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IFBvbHlnb25Db2Rlci5kYXRhYmFzZVRvSlNPTih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICAgICAgICAgICAgQnl0ZXNDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IEJ5dGVzQ29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QobW9uZ29PYmplY3Rba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICk7XG4gICAgICBjb25zdCByZWxhdGlvbkZpZWxkcyA9IHt9O1xuICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLmZvckVhY2gocmVsYXRpb25GaWVsZE5hbWUgPT4ge1xuICAgICAgICByZWxhdGlvbkZpZWxkc1tyZWxhdGlvbkZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tyZWxhdGlvbkZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHsgLi4ucmVzdE9iamVjdCwgLi4ucmVsYXRpb25GaWVsZHMgfTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93ICd1bmtub3duIGpzIHR5cGUnO1xuICB9XG59O1xuXG52YXIgRGF0ZUNvZGVyID0ge1xuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKGpzb24uaXNvKTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnO1xuICB9LFxufTtcblxudmFyIEJ5dGVzQ29kZXIgPSB7XG4gIGJhc2U2NFBhdHRlcm46IG5ldyBSZWdFeHAoJ14oPzpbQS1aYS16MC05Ky9dezR9KSooPzpbQS1aYS16MC05Ky9dezJ9PT18W0EtWmEtejAtOSsvXXszfT0pPyQnKSxcbiAgaXNCYXNlNjRWYWx1ZShvYmplY3QpIHtcbiAgICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYmFzZTY0UGF0dGVybi50ZXN0KG9iamVjdCk7XG4gIH0sXG5cbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgbGV0IHZhbHVlO1xuICAgIGlmICh0aGlzLmlzQmFzZTY0VmFsdWUob2JqZWN0KSkge1xuICAgICAgdmFsdWUgPSBvYmplY3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlID0gb2JqZWN0LmJ1ZmZlci50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICBiYXNlNjQ6IHZhbHVlLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkJpbmFyeSB8fCB0aGlzLmlzQmFzZTY0VmFsdWUob2JqZWN0KTtcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIG5ldyBtb25nb2RiLkJpbmFyeShCdWZmZXIuZnJvbShqc29uLmJhc2U2NCwgJ2Jhc2U2NCcpKTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0J5dGVzJztcbiAgfSxcbn07XG5cbnZhciBHZW9Qb2ludENvZGVyID0ge1xuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgbGF0aXR1ZGU6IG9iamVjdFsxXSxcbiAgICAgIGxvbmdpdHVkZTogb2JqZWN0WzBdLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBBcnJheSAmJiBvYmplY3QubGVuZ3RoID09IDI7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIHJldHVybiBbanNvbi5sb25naXR1ZGUsIGpzb24ubGF0aXR1ZGVdO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnO1xuICB9LFxufTtcblxudmFyIFBvbHlnb25Db2RlciA9IHtcbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgLy8gQ29udmVydCBsbmcvbGF0IC0+IGxhdC9sbmdcbiAgICBjb25zdCBjb29yZHMgPSBvYmplY3QuY29vcmRpbmF0ZXNbMF0ubWFwKGNvb3JkID0+IHtcbiAgICAgIHJldHVybiBbY29vcmRbMV0sIGNvb3JkWzBdXTtcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICBjb29yZGluYXRlczogY29vcmRzLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIGNvbnN0IGNvb3JkcyA9IG9iamVjdC5jb29yZGluYXRlc1swXTtcbiAgICBpZiAob2JqZWN0LnR5cGUgIT09ICdQb2x5Z29uJyB8fCAhKGNvb3JkcyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvb3Jkcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcG9pbnQgPSBjb29yZHNbaV07XG4gICAgICBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHBvaW50KSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocGFyc2VGbG9hdChwb2ludFsxXSksIHBhcnNlRmxvYXQocG9pbnRbMF0pKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIGxldCBjb29yZHMgPSBqc29uLmNvb3JkaW5hdGVzO1xuICAgIC8vIEFkZCBmaXJzdCBwb2ludCB0byB0aGUgZW5kIHRvIGNsb3NlIHBvbHlnb25cbiAgICBpZiAoXG4gICAgICBjb29yZHNbMF1bMF0gIT09IGNvb3Jkc1tjb29yZHMubGVuZ3RoIC0gMV1bMF0gfHxcbiAgICAgIGNvb3Jkc1swXVsxXSAhPT0gY29vcmRzW2Nvb3Jkcy5sZW5ndGggLSAxXVsxXVxuICAgICkge1xuICAgICAgY29vcmRzLnB1c2goY29vcmRzWzBdKTtcbiAgICB9XG4gICAgY29uc3QgdW5pcXVlID0gY29vcmRzLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgICBsZXQgZm91bmRJbmRleCA9IC0xO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgICBpZiAocHRbMF0gPT09IGl0ZW1bMF0gJiYgcHRbMV0gPT09IGl0ZW1bMV0pIHtcbiAgICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICAgIH0pO1xuICAgIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICAgICk7XG4gICAgfVxuICAgIC8vIENvbnZlcnQgbGF0L2xvbmcgLT4gbG9uZy9sYXRcbiAgICBjb29yZHMgPSBjb29yZHMubWFwKGNvb3JkID0+IHtcbiAgICAgIHJldHVybiBbY29vcmRbMV0sIGNvb3JkWzBdXTtcbiAgICB9KTtcbiAgICByZXR1cm4geyB0eXBlOiAnUG9seWdvbicsIGNvb3JkaW5hdGVzOiBbY29vcmRzXSB9O1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnUG9seWdvbic7XG4gIH0sXG59O1xuXG52YXIgRmlsZUNvZGVyID0ge1xuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICBuYW1lOiBvYmplY3QsXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBvYmplY3QgPT09ICdzdHJpbmcnO1xuICB9LFxuXG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICByZXR1cm4ganNvbi5uYW1lO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnRmlsZSc7XG4gIH0sXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdHJhbnNmb3JtS2V5LFxuICBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUsXG4gIHRyYW5zZm9ybVVwZGF0ZSxcbiAgdHJhbnNmb3JtV2hlcmUsXG4gIG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCxcbiAgcmVsYXRpdmVUaW1lVG9EYXRlLFxuICB0cmFuc2Zvcm1Db25zdHJhaW50LFxuICB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nLFxufTtcbiJdfQ==