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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvVHJhbnNmb3JtLmpzIl0sIm5hbWVzIjpbIm1vbmdvZGIiLCJyZXF1aXJlIiwiUGFyc2UiLCJ0cmFuc2Zvcm1LZXkiLCJjbGFzc05hbWUiLCJmaWVsZE5hbWUiLCJzY2hlbWEiLCJmaWVsZHMiLCJfX3R5cGUiLCJ0eXBlIiwidHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUiLCJyZXN0S2V5IiwicmVzdFZhbHVlIiwicGFyc2VGb3JtYXRTY2hlbWEiLCJrZXkiLCJ0aW1lRmllbGQiLCJpbmNsdWRlcyIsInZhbHVlIiwicGFyc2VJbnQiLCJ0cmFuc2Zvcm1Ub3BMZXZlbEF0b20iLCJDYW5ub3RUcmFuc2Zvcm0iLCJEYXRlIiwiaW5kZXhPZiIsIkFycmF5IiwibWFwIiwidHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSIsInRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yIiwibWFwVmFsdWVzIiwiaXNSZWdleCIsIlJlZ0V4cCIsImlzU3RhcnRzV2l0aFJlZ2V4IiwibWF0Y2hlcyIsInRvU3RyaW5nIiwibWF0Y2giLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwidmFsdWVzIiwiaXNBcnJheSIsImxlbmd0aCIsImZpcnN0VmFsdWVzSXNSZWdleCIsImkiLCJpc0FueVZhbHVlUmVnZXgiLCJzb21lIiwiT2JqZWN0Iiwia2V5cyIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwidHJhbnNmb3JtSW50ZXJpb3JBdG9tIiwidmFsdWVBc0RhdGUiLCJ0cmFuc2Zvcm1RdWVyeUtleVZhbHVlIiwiY291bnQiLCJzdWJRdWVyeSIsInRyYW5zZm9ybVdoZXJlIiwiYXV0aERhdGFNYXRjaCIsInByb3ZpZGVyIiwiZXhwZWN0ZWRUeXBlSXNBcnJheSIsImV4cGVjdGVkVHlwZUlzUG9pbnRlciIsImZpZWxkIiwidHJhbnNmb3JtZWRDb25zdHJhaW50IiwidHJhbnNmb3JtQ29uc3RyYWludCIsIiR0ZXh0IiwiJGVsZW1NYXRjaCIsIiRhbGwiLCJJTlZBTElEX0pTT04iLCJyZXN0V2hlcmUiLCJtb25nb1doZXJlIiwib3V0IiwicGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZSIsInRyYW5zZm9ybWVkVmFsdWUiLCJjb2VyY2VkVG9EYXRlIiwiSU5WQUxJRF9LRVlfTkFNRSIsInBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSIsInJlc3RDcmVhdGUiLCJhZGRMZWdhY3lBQ0wiLCJtb25nb0NyZWF0ZSIsInVuZGVmaW5lZCIsImNyZWF0ZWRBdCIsIl9jcmVhdGVkX2F0IiwiaXNvIiwidXBkYXRlZEF0IiwiX3VwZGF0ZWRfYXQiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJyZXN0VXBkYXRlIiwibW9uZ29VcGRhdGUiLCJhY2wiLCJfcnBlcm0iLCJfd3Blcm0iLCJfYWNsIiwiJHNldCIsIl9fb3AiLCJhcmciLCJyZXN0T2JqZWN0IiwicmVzdE9iamVjdENvcHkiLCJmb3JFYWNoIiwiZW50cnkiLCJ3IiwiciIsImF0b20iLCJvYmplY3RJZCIsIkRhdGVDb2RlciIsImlzVmFsaWRKU09OIiwiSlNPTlRvRGF0YWJhc2UiLCJCeXRlc0NvZGVyIiwiJHJlZ2V4IiwidGFyZ2V0Q2xhc3MiLCJHZW9Qb2ludENvZGVyIiwiUG9seWdvbkNvZGVyIiwiRmlsZUNvZGVyIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwicmVsYXRpdmVUaW1lVG9EYXRlIiwidGV4dCIsIm5vdyIsInRvTG93ZXJDYXNlIiwicGFydHMiLCJzcGxpdCIsImZpbHRlciIsInBhcnQiLCJmdXR1cmUiLCJwYXN0Iiwic3RhdHVzIiwiaW5mbyIsInNsaWNlIiwicGFpcnMiLCJwdXNoIiwic2hpZnQiLCJzZWNvbmRzIiwibnVtIiwiaW50ZXJ2YWwiLCJ2YWwiLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJtaWxsaXNlY29uZHMiLCJyZXN1bHQiLCJ2YWx1ZU9mIiwiY29uc3RyYWludCIsImluQXJyYXkiLCJ0cmFuc2Zvcm1GdW5jdGlvbiIsInRyYW5zZm9ybWVyIiwiSlNPTiIsInN0cmluZ2lmeSIsInNvcnQiLCJyZXZlcnNlIiwiYW5zd2VyIiwiJHJlbGF0aXZlVGltZSIsInBhcnNlclJlc3VsdCIsImxvZyIsImFyciIsIl8iLCJmbGF0TWFwIiwicyIsIiRuaW4iLCJzZWFyY2giLCIkc2VhcmNoIiwiJHRlcm0iLCIkbGFuZ3VhZ2UiLCIkY2FzZVNlbnNpdGl2ZSIsIiRkaWFjcml0aWNTZW5zaXRpdmUiLCJwb2ludCIsIiRnZW9XaXRoaW4iLCIkY2VudGVyU3BoZXJlIiwibG9uZ2l0dWRlIiwibGF0aXR1ZGUiLCIkbWF4RGlzdGFuY2UiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwiYm94IiwiJGJveCIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJwb2ludHMiLCJjb29yZGluYXRlcyIsIkdlb1BvaW50IiwiX3ZhbGlkYXRlIiwiJHBvbHlnb24iLCJkaXN0YW5jZSIsImlzTmFOIiwiJGdlb21ldHJ5IiwiYW1vdW50Iiwib2JqZWN0cyIsImZsYXR0ZW4iLCJ0b0FkZCIsIm1vbmdvT3AiLCJBZGQiLCJBZGRVbmlxdWUiLCIkZWFjaCIsInRvUmVtb3ZlIiwib2JqZWN0IiwiaXRlcmF0b3IiLCJuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QiLCJtb25nb09iamVjdCIsIl9lbmNvZGUiLCJMb25nIiwidG9OdW1iZXIiLCJEb3VibGUiLCJpc1ZhbGlkRGF0YWJhc2VPYmplY3QiLCJkYXRhYmFzZVRvSlNPTiIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInRvSlNPTiIsInRyYW5zZm9ybVBvaW50ZXJTdHJpbmciLCJwb2ludGVyU3RyaW5nIiwib2JqRGF0YSIsIm1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJ3YXJuIiwibmV3S2V5Iiwic3Vic3RyaW5nIiwicmVsYXRpb25GaWVsZE5hbWVzIiwicmVsYXRpb25GaWVsZHMiLCJyZWxhdGlvbkZpZWxkTmFtZSIsImpzb24iLCJiYXNlNjRQYXR0ZXJuIiwiaXNCYXNlNjRWYWx1ZSIsInRlc3QiLCJidWZmZXIiLCJiYXNlNjQiLCJCaW5hcnkiLCJCdWZmZXIiLCJmcm9tIiwiY29vcmRzIiwiY29vcmQiLCJwYXJzZUZsb2F0IiwidW5pcXVlIiwiaXRlbSIsImluZGV4IiwiYXIiLCJmb3VuZEluZGV4IiwicHQiLCJuYW1lIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7QUFDQTs7Ozs7Ozs7OztBQUNBLElBQUlBLE9BQU8sR0FBR0MsT0FBTyxDQUFDLFNBQUQsQ0FBckI7O0FBQ0EsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBRCxDQUFQLENBQXNCQyxLQUFsQzs7QUFFQSxNQUFNQyxZQUFZLEdBQUcsQ0FBQ0MsU0FBRCxFQUFZQyxTQUFaLEVBQXVCQyxNQUF2QixLQUFrQztBQUNyRDtBQUNBLFVBQVFELFNBQVI7QUFDRSxTQUFLLFVBQUw7QUFDRSxhQUFPLEtBQVA7O0FBQ0YsU0FBSyxXQUFMO0FBQ0UsYUFBTyxhQUFQOztBQUNGLFNBQUssV0FBTDtBQUNFLGFBQU8sYUFBUDs7QUFDRixTQUFLLGNBQUw7QUFDRSxhQUFPLGdCQUFQOztBQUNGLFNBQUssVUFBTDtBQUNFLGFBQU8sWUFBUDs7QUFDRixTQUFLLFdBQUw7QUFDRSxhQUFPLFlBQVA7QUFaSjs7QUFlQSxNQUNFQyxNQUFNLENBQUNDLE1BQVAsQ0FBY0YsU0FBZCxLQUNBQyxNQUFNLENBQUNDLE1BQVAsQ0FBY0YsU0FBZCxFQUF5QkcsTUFBekIsSUFBbUMsU0FGckMsRUFHRTtBQUNBSCxJQUFBQSxTQUFTLEdBQUcsUUFBUUEsU0FBcEI7QUFDRCxHQUxELE1BS08sSUFDTEMsTUFBTSxDQUFDQyxNQUFQLENBQWNGLFNBQWQsS0FDQUMsTUFBTSxDQUFDQyxNQUFQLENBQWNGLFNBQWQsRUFBeUJJLElBQXpCLElBQWlDLFNBRjVCLEVBR0w7QUFDQUosSUFBQUEsU0FBUyxHQUFHLFFBQVFBLFNBQXBCO0FBQ0Q7O0FBRUQsU0FBT0EsU0FBUDtBQUNE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QUFLLElBQXZDLElBQStDQSxLQUFLLENBQUNULE1BQU4sS0FBaUIsTUFEbEU7QUFHRDs7QUFwQmEsQ0FBaEI7QUF1QkE0TixNQUFNLENBQUNDLE9BQVAsR0FBaUI7QUFDZmxPLEVBQUFBLFlBRGU7QUFFZm1FLEVBQUFBLGlDQUZlO0FBR2ZVLEVBQUFBLGVBSGU7QUFJZjdCLEVBQUFBLGNBSmU7QUFLZnNKLEVBQUFBLHdCQUxlO0FBTWY3RixFQUFBQSxrQkFOZTtBQU9mbEQsRUFBQUEsbUJBUGU7QUFRZjRJLEVBQUFBO0FBUmUsQ0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbG9nIGZyb20gJy4uLy4uLy4uL2xvZ2dlcic7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xudmFyIG1vbmdvZGIgPSByZXF1aXJlKCdtb25nb2RiJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5cbmNvbnN0IHRyYW5zZm9ybUtleSA9IChjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSA9PiB7XG4gIC8vIENoZWNrIGlmIHRoZSBzY2hlbWEgaXMga25vd24gc2luY2UgaXQncyBhIGJ1aWx0LWluIGZpZWxkLlxuICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xuICAgIGNhc2UgJ29iamVjdElkJzpcbiAgICAgIHJldHVybiAnX2lkJztcbiAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgICAgcmV0dXJuICdfY3JlYXRlZF9hdCc7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgIHJldHVybiAnX3VwZGF0ZWRfYXQnO1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgICByZXR1cm4gJ19zZXNzaW9uX3Rva2VuJztcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICByZXR1cm4gJ19sYXN0X3VzZWQnO1xuICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgICByZXR1cm4gJ3RpbWVzX3VzZWQnO1xuICB9XG5cbiAgaWYgKFxuICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5fX3R5cGUgPT0gJ1BvaW50ZXInXG4gICkge1xuICAgIGZpZWxkTmFtZSA9ICdfcF8nICsgZmllbGROYW1lO1xuICB9IGVsc2UgaWYgKFxuICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09ICdQb2ludGVyJ1xuICApIHtcbiAgICBmaWVsZE5hbWUgPSAnX3BfJyArIGZpZWxkTmFtZTtcbiAgfVxuXG4gIHJldHVybiBmaWVsZE5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1LZXlWYWx1ZUZvclVwZGF0ZSA9IChcbiAgY2xhc3NOYW1lLFxuICByZXN0S2V5LFxuICByZXN0VmFsdWUsXG4gIHBhcnNlRm9ybWF0U2NoZW1hXG4pID0+IHtcbiAgLy8gQ2hlY2sgaWYgdGhlIHNjaGVtYSBpcyBrbm93biBzaW5jZSBpdCdzIGEgYnVpbHQtaW4gZmllbGQuXG4gIHZhciBrZXkgPSByZXN0S2V5O1xuICB2YXIgdGltZUZpZWxkID0gZmFsc2U7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnb2JqZWN0SWQnOlxuICAgIGNhc2UgJ19pZCc6XG4gICAgICBpZiAoWydfR2xvYmFsQ29uZmlnJywgJ19HcmFwaFFMQ29uZmlnJ10uaW5jbHVkZXMoY2xhc3NOYW1lKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleToga2V5LFxuICAgICAgICAgIHZhbHVlOiBwYXJzZUludChyZXN0VmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAga2V5ID0gJ19pZCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgIGNhc2UgJ19jcmVhdGVkX2F0JzpcbiAgICAgIGtleSA9ICdfY3JlYXRlZF9hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICBjYXNlICdfdXBkYXRlZF9hdCc6XG4gICAgICBrZXkgPSAnX3VwZGF0ZWRfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgY2FzZSAnX3Nlc3Npb25fdG9rZW4nOlxuICAgICAga2V5ID0gJ19zZXNzaW9uX3Rva2VuJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgY2FzZSAnX2V4cGlyZXNBdCc6XG4gICAgICBrZXkgPSAnZXhwaXJlc0F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAga2V5ID0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgIGtleSA9ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19mYWlsZWRfbG9naW5fY291bnQnOlxuICAgICAga2V5ID0gJ19mYWlsZWRfbG9naW5fY291bnQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICBrZXkgPSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAga2V5ID0gJ19wYXNzd29yZF9jaGFuZ2VkX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgICByZXR1cm4geyBrZXk6IGtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICBjYXNlICdfbGFzdF91c2VkJzpcbiAgICAgIGtleSA9ICdfbGFzdF91c2VkJztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgIGNhc2UgJ3RpbWVzX3VzZWQnOlxuICAgICAga2V5ID0gJ3RpbWVzX3VzZWQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICB9XG5cbiAgaWYgKFxuICAgIChwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgcGFyc2VGb3JtYXRTY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ1BvaW50ZXInKSB8fFxuICAgICghcGFyc2VGb3JtYXRTY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgIHJlc3RWYWx1ZSAmJlxuICAgICAgcmVzdFZhbHVlLl9fdHlwZSA9PSAnUG9pbnRlcicpXG4gICkge1xuICAgIGtleSA9ICdfcF8nICsga2V5O1xuICB9XG5cbiAgLy8gSGFuZGxlIGF0b21pYyB2YWx1ZXNcbiAgdmFyIHZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gIGlmICh2YWx1ZSAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgaWYgKHRpbWVGaWVsZCAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICB2YWx1ZSA9IG5ldyBEYXRlKHZhbHVlKTtcbiAgICB9XG4gICAgaWYgKHJlc3RLZXkuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgcmV0dXJuIHsga2V5LCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgfVxuICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhcnJheXNcbiAgaWYgKHJlc3RWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgdmFsdWUgPSByZXN0VmFsdWUubWFwKHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSB1cGRhdGUgb3BlcmF0b3JzXG4gIGlmICh0eXBlb2YgcmVzdFZhbHVlID09PSAnb2JqZWN0JyAmJiAnX19vcCcgaW4gcmVzdFZhbHVlKSB7XG4gICAgcmV0dXJuIHsga2V5LCB2YWx1ZTogdHJhbnNmb3JtVXBkYXRlT3BlcmF0b3IocmVzdFZhbHVlLCBmYWxzZSkgfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBub3JtYWwgb2JqZWN0cyBieSByZWN1cnNpbmdcbiAgdmFsdWUgPSBtYXBWYWx1ZXMocmVzdFZhbHVlLCB0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xufTtcblxuY29uc3QgaXNSZWdleCA9IHZhbHVlID0+IHtcbiAgcmV0dXJuIHZhbHVlICYmIHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwO1xufTtcblxuY29uc3QgaXNTdGFydHNXaXRoUmVnZXggPSB2YWx1ZSA9PiB7XG4gIGlmICghaXNSZWdleCh2YWx1ZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBtYXRjaGVzID0gdmFsdWUudG9TdHJpbmcoKS5tYXRjaCgvXFwvXFxeXFxcXFEuKlxcXFxFXFwvLyk7XG4gIHJldHVybiAhIW1hdGNoZXM7XG59O1xuXG5jb25zdCBpc0FsbFZhbHVlc1JlZ2V4T3JOb25lID0gdmFsdWVzID0+IHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0pO1xuICBpZiAodmFsdWVzLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBmaXJzdFZhbHVlc0lzUmVnZXg7XG4gIH1cblxuICBmb3IgKGxldCBpID0gMSwgbGVuZ3RoID0gdmFsdWVzLmxlbmd0aDsgaSA8IGxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGZpcnN0VmFsdWVzSXNSZWdleCAhPT0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzW2ldKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuY29uc3QgaXNBbnlWYWx1ZVJlZ2V4ID0gdmFsdWVzID0+IHtcbiAgcmV0dXJuIHZhbHVlcy5zb21lKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIGlzUmVnZXgodmFsdWUpO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybUludGVyaW9yVmFsdWUgPSByZXN0VmFsdWUgPT4ge1xuICBpZiAoXG4gICAgcmVzdFZhbHVlICE9PSBudWxsICYmXG4gICAgdHlwZW9mIHJlc3RWYWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICBPYmplY3Qua2V5cyhyZXN0VmFsdWUpLnNvbWUoa2V5ID0+IGtleS5pbmNsdWRlcygnJCcpIHx8IGtleS5pbmNsdWRlcygnLicpKVxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICApO1xuICB9XG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIHZhciB2YWx1ZSA9IHRyYW5zZm9ybUludGVyaW9yQXRvbShyZXN0VmFsdWUpO1xuICBpZiAodmFsdWUgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhcnJheXNcbiAgaWYgKHJlc3RWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIHJlc3RWYWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gIH1cblxuICAvLyBIYW5kbGUgdXBkYXRlIG9wZXJhdG9yc1xuICBpZiAodHlwZW9mIHJlc3RWYWx1ZSA9PT0gJ29iamVjdCcgJiYgJ19fb3AnIGluIHJlc3RWYWx1ZSkge1xuICAgIHJldHVybiB0cmFuc2Zvcm1VcGRhdGVPcGVyYXRvcihyZXN0VmFsdWUsIHRydWUpO1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICByZXR1cm4gbWFwVmFsdWVzKHJlc3RWYWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG59O1xuXG5jb25zdCB2YWx1ZUFzRGF0ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gbmV3IERhdGUodmFsdWUpO1xuICB9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1RdWVyeUtleVZhbHVlKGNsYXNzTmFtZSwga2V5LCB2YWx1ZSwgc2NoZW1hLCBjb3VudCA9IGZhbHNlKSB7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnY3JlYXRlZEF0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX2NyZWF0ZWRfYXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX2NyZWF0ZWRfYXQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX3VwZGF0ZWRfYXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX3VwZGF0ZWRfYXQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnZXhwaXJlc0F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdvYmplY3RJZCc6IHtcbiAgICAgIGlmIChbJ19HbG9iYWxDb25maWcnLCAnX0dyYXBoUUxDb25maWcnXS5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgIHZhbHVlID0gcGFyc2VJbnQodmFsdWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsga2V5OiAnX2lkJywgdmFsdWUgfTtcbiAgICB9XG4gICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgICBjYXNlICdzZXNzaW9uVG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5OiAnX3Nlc3Npb25fdG9rZW4nLCB2YWx1ZSB9O1xuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleTogJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ19wYXNzd29yZF9jaGFuZ2VkX2F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3JwZXJtJzpcbiAgICBjYXNlICdfd3Blcm0nOlxuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuJzpcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuJzpcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgICBjYXNlICckb3InOlxuICAgIGNhc2UgJyRhbmQnOlxuICAgIGNhc2UgJyRub3InOlxuICAgICAgcmV0dXJuIHtcbiAgICAgICAga2V5OiBrZXksXG4gICAgICAgIHZhbHVlOiB2YWx1ZS5tYXAoc3ViUXVlcnkgPT5cbiAgICAgICAgICB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHN1YlF1ZXJ5LCBzY2hlbWEsIGNvdW50KVxuICAgICAgICApLFxuICAgICAgfTtcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ19sYXN0X3VzZWQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX2xhc3RfdXNlZCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgICAgcmV0dXJuIHsga2V5OiAndGltZXNfdXNlZCcsIHZhbHVlOiB2YWx1ZSB9O1xuICAgIGRlZmF1bHQ6IHtcbiAgICAgIC8vIE90aGVyIGF1dGggZGF0YVxuICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGtleS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICBjb25zdCBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIC8vIFNwZWNpYWwtY2FzZSBhdXRoIGRhdGEuXG4gICAgICAgIHJldHVybiB7IGtleTogYF9hdXRoX2RhdGFfJHtwcm92aWRlcn0uaWRgLCB2YWx1ZSB9O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGV4cGVjdGVkVHlwZUlzQXJyYXkgPVxuICAgIHNjaGVtYSAmJiBzY2hlbWEuZmllbGRzW2tleV0gJiYgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdBcnJheSc7XG5cbiAgY29uc3QgZXhwZWN0ZWRUeXBlSXNQb2ludGVyID1cbiAgICBzY2hlbWEgJiYgc2NoZW1hLmZpZWxkc1trZXldICYmIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnUG9pbnRlcic7XG5cbiAgY29uc3QgZmllbGQgPSBzY2hlbWEgJiYgc2NoZW1hLmZpZWxkc1trZXldO1xuICBpZiAoXG4gICAgZXhwZWN0ZWRUeXBlSXNQb2ludGVyIHx8XG4gICAgKCFzY2hlbWEgJiYgdmFsdWUgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpXG4gICkge1xuICAgIGtleSA9ICdfcF8nICsga2V5O1xuICB9XG5cbiAgLy8gSGFuZGxlIHF1ZXJ5IGNvbnN0cmFpbnRzXG4gIGNvbnN0IHRyYW5zZm9ybWVkQ29uc3RyYWludCA9IHRyYW5zZm9ybUNvbnN0cmFpbnQodmFsdWUsIGZpZWxkLCBjb3VudCk7XG4gIGlmICh0cmFuc2Zvcm1lZENvbnN0cmFpbnQgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIGlmICh0cmFuc2Zvcm1lZENvbnN0cmFpbnQuJHRleHQpIHtcbiAgICAgIHJldHVybiB7IGtleTogJyR0ZXh0JywgdmFsdWU6IHRyYW5zZm9ybWVkQ29uc3RyYWludC4kdGV4dCB9O1xuICAgIH1cbiAgICBpZiAodHJhbnNmb3JtZWRDb25zdHJhaW50LiRlbGVtTWF0Y2gpIHtcbiAgICAgIHJldHVybiB7IGtleTogJyRub3InLCB2YWx1ZTogW3sgW2tleV06IHRyYW5zZm9ybWVkQ29uc3RyYWludCB9XSB9O1xuICAgIH1cbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB0cmFuc2Zvcm1lZENvbnN0cmFpbnQgfTtcbiAgfVxuXG4gIGlmIChleHBlY3RlZFR5cGVJc0FycmF5ICYmICEodmFsdWUgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB7ICRhbGw6IFt0cmFuc2Zvcm1JbnRlcmlvckF0b20odmFsdWUpXSB9IH07XG4gIH1cblxuICAvLyBIYW5kbGUgYXRvbWljIHZhbHVlc1xuICBpZiAodHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHZhbHVlKSAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgcmV0dXJuIHsga2V5LCB2YWx1ZTogdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHZhbHVlKSB9O1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGBZb3UgY2Fubm90IHVzZSAke3ZhbHVlfSBhcyBhIHF1ZXJ5IHBhcmFtZXRlci5gXG4gICAgKTtcbiAgfVxufVxuXG4vLyBNYWluIGV4cG9zZWQgbWV0aG9kIHRvIGhlbHAgcnVuIHF1ZXJpZXMuXG4vLyByZXN0V2hlcmUgaXMgdGhlIFwid2hlcmVcIiBjbGF1c2UgaW4gUkVTVCBBUEkgZm9ybS5cbi8vIFJldHVybnMgdGhlIG1vbmdvIGZvcm0gb2YgdGhlIHF1ZXJ5LlxuZnVuY3Rpb24gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCByZXN0V2hlcmUsIHNjaGVtYSwgY291bnQgPSBmYWxzZSkge1xuICBjb25zdCBtb25nb1doZXJlID0ge307XG4gIGZvciAoY29uc3QgcmVzdEtleSBpbiByZXN0V2hlcmUpIHtcbiAgICBjb25zdCBvdXQgPSB0cmFuc2Zvcm1RdWVyeUtleVZhbHVlKFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgcmVzdEtleSxcbiAgICAgIHJlc3RXaGVyZVtyZXN0S2V5XSxcbiAgICAgIHNjaGVtYSxcbiAgICAgIGNvdW50XG4gICAgKTtcbiAgICBtb25nb1doZXJlW291dC5rZXldID0gb3V0LnZhbHVlO1xuICB9XG4gIHJldHVybiBtb25nb1doZXJlO1xufVxuXG5jb25zdCBwYXJzZU9iamVjdEtleVZhbHVlVG9Nb25nb09iamVjdEtleVZhbHVlID0gKFxuICByZXN0S2V5LFxuICByZXN0VmFsdWUsXG4gIHNjaGVtYVxuKSA9PiB7XG4gIC8vIENoZWNrIGlmIHRoZSBzY2hlbWEgaXMga25vd24gc2luY2UgaXQncyBhIGJ1aWx0LWluIGZpZWxkLlxuICBsZXQgdHJhbnNmb3JtZWRWYWx1ZTtcbiAgbGV0IGNvZXJjZWRUb0RhdGU7XG4gIHN3aXRjaCAocmVzdEtleSkge1xuICAgIGNhc2UgJ29iamVjdElkJzpcbiAgICAgIHJldHVybiB7IGtleTogJ19pZCcsIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICBjYXNlICdleHBpcmVzQXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJ1xuICAgICAgICAgID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSlcbiAgICAgICAgICA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdleHBpcmVzQXQnLCB2YWx1ZTogY29lcmNlZFRvRGF0ZSB9O1xuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnXG4gICAgICAgICAgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKVxuICAgICAgICAgIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZydcbiAgICAgICAgICA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpXG4gICAgICAgICAgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZydcbiAgICAgICAgICA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpXG4gICAgICAgICAgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJ1xuICAgICAgICAgID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSlcbiAgICAgICAgICA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX2ZhaWxlZF9sb2dpbl9jb3VudCc6XG4gICAgY2FzZSAnX3JwZXJtJzpcbiAgICBjYXNlICdfd3Blcm0nOlxuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW4nOlxuICAgIGNhc2UgJ19oYXNoZWRfcGFzc3dvcmQnOlxuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuJzpcbiAgICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgICByZXR1cm4geyBrZXk6ICdfc2Vzc2lvbl90b2tlbicsIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICBkZWZhdWx0OlxuICAgICAgLy8gQXV0aCBkYXRhIHNob3VsZCBoYXZlIGJlZW4gdHJhbnNmb3JtZWQgYWxyZWFkeVxuICAgICAgaWYgKHJlc3RLZXkubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICdjYW4gb25seSBxdWVyeSBvbiAnICsgcmVzdEtleVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gVHJ1c3QgdGhhdCB0aGUgYXV0aCBkYXRhIGhhcyBiZWVuIHRyYW5zZm9ybWVkIGFuZCBzYXZlIGl0IGRpcmVjdGx5XG4gICAgICBpZiAocmVzdEtleS5tYXRjaCgvXl9hdXRoX2RhdGFfW2EtekEtWjAtOV9dKyQvKSkge1xuICAgICAgICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICAgIH1cbiAgfVxuICAvL3NraXAgc3RyYWlnaHQgdG8gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tIGZvciBCeXRlcywgdGhleSBkb24ndCBzaG93IHVwIGluIHRoZSBzY2hlbWEgZm9yIHNvbWUgcmVhc29uXG4gIGlmIChyZXN0VmFsdWUgJiYgcmVzdFZhbHVlLl9fdHlwZSAhPT0gJ0J5dGVzJykge1xuICAgIC8vTm90ZTogV2UgbWF5IG5vdCBrbm93IHRoZSB0eXBlIG9mIGEgZmllbGQgaGVyZSwgYXMgdGhlIHVzZXIgY291bGQgYmUgc2F2aW5nIChudWxsKSB0byBhIGZpZWxkXG4gICAgLy9UaGF0IG5ldmVyIGV4aXN0ZWQgYmVmb3JlLCBtZWFuaW5nIHdlIGNhbid0IGluZmVyIHRoZSB0eXBlLlxuICAgIGlmIChcbiAgICAgIChzY2hlbWEuZmllbGRzW3Jlc3RLZXldICYmIHNjaGVtYS5maWVsZHNbcmVzdEtleV0udHlwZSA9PSAnUG9pbnRlcicpIHx8XG4gICAgICByZXN0VmFsdWUuX190eXBlID09ICdQb2ludGVyJ1xuICAgICkge1xuICAgICAgcmVzdEtleSA9ICdfcF8nICsgcmVzdEtleTtcbiAgICB9XG4gIH1cblxuICAvLyBIYW5kbGUgYXRvbWljIHZhbHVlc1xuICB2YXIgdmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgaWYgKHZhbHVlICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlOiB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gQUNMcyBhcmUgaGFuZGxlZCBiZWZvcmUgdGhpcyBtZXRob2QgaXMgY2FsbGVkXG4gIC8vIElmIGFuIEFDTCBrZXkgc3RpbGwgZXhpc3RzIGhlcmUsIHNvbWV0aGluZyBpcyB3cm9uZy5cbiAgaWYgKHJlc3RLZXkgPT09ICdBQ0wnKSB7XG4gICAgdGhyb3cgJ1RoZXJlIHdhcyBhIHByb2JsZW0gdHJhbnNmb3JtaW5nIGFuIEFDTC4nO1xuICB9XG5cbiAgLy8gSGFuZGxlIGFycmF5c1xuICBpZiAocmVzdFZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICB2YWx1ZSA9IHJlc3RWYWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gICAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZTogdmFsdWUgfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBub3JtYWwgb2JqZWN0cyBieSByZWN1cnNpbmdcbiAgaWYgKFxuICAgIE9iamVjdC5rZXlzKHJlc3RWYWx1ZSkuc29tZShrZXkgPT4ga2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICk7XG4gIH1cbiAgdmFsdWUgPSBtYXBWYWx1ZXMocmVzdFZhbHVlLCB0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZSB9O1xufTtcblxuY29uc3QgcGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlID0gKGNsYXNzTmFtZSwgcmVzdENyZWF0ZSwgc2NoZW1hKSA9PiB7XG4gIHJlc3RDcmVhdGUgPSBhZGRMZWdhY3lBQ0wocmVzdENyZWF0ZSk7XG4gIGNvbnN0IG1vbmdvQ3JlYXRlID0ge307XG4gIGZvciAoY29uc3QgcmVzdEtleSBpbiByZXN0Q3JlYXRlKSB7XG4gICAgaWYgKHJlc3RDcmVhdGVbcmVzdEtleV0gJiYgcmVzdENyZWF0ZVtyZXN0S2V5XS5fX3R5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCB7IGtleSwgdmFsdWUgfSA9IHBhcnNlT2JqZWN0S2V5VmFsdWVUb01vbmdvT2JqZWN0S2V5VmFsdWUoXG4gICAgICByZXN0S2V5LFxuICAgICAgcmVzdENyZWF0ZVtyZXN0S2V5XSxcbiAgICAgIHNjaGVtYVxuICAgICk7XG4gICAgaWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIG1vbmdvQ3JlYXRlW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICAvLyBVc2UgdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQgZm9yIGNyZWF0ZWRBdCBhbmQgdXBkYXRlZEF0XG4gIGlmIChtb25nb0NyZWF0ZS5jcmVhdGVkQXQpIHtcbiAgICBtb25nb0NyZWF0ZS5fY3JlYXRlZF9hdCA9IG5ldyBEYXRlKFxuICAgICAgbW9uZ29DcmVhdGUuY3JlYXRlZEF0LmlzbyB8fCBtb25nb0NyZWF0ZS5jcmVhdGVkQXRcbiAgICApO1xuICAgIGRlbGV0ZSBtb25nb0NyZWF0ZS5jcmVhdGVkQXQ7XG4gIH1cbiAgaWYgKG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdCkge1xuICAgIG1vbmdvQ3JlYXRlLl91cGRhdGVkX2F0ID0gbmV3IERhdGUoXG4gICAgICBtb25nb0NyZWF0ZS51cGRhdGVkQXQuaXNvIHx8IG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdFxuICAgICk7XG4gICAgZGVsZXRlIG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdDtcbiAgfVxuXG4gIHJldHVybiBtb25nb0NyZWF0ZTtcbn07XG5cbi8vIE1haW4gZXhwb3NlZCBtZXRob2QgdG8gaGVscCB1cGRhdGUgb2xkIG9iamVjdHMuXG5jb25zdCB0cmFuc2Zvcm1VcGRhdGUgPSAoY2xhc3NOYW1lLCByZXN0VXBkYXRlLCBwYXJzZUZvcm1hdFNjaGVtYSkgPT4ge1xuICBjb25zdCBtb25nb1VwZGF0ZSA9IHt9O1xuICBjb25zdCBhY2wgPSBhZGRMZWdhY3lBQ0wocmVzdFVwZGF0ZSk7XG4gIGlmIChhY2wuX3JwZXJtIHx8IGFjbC5fd3Blcm0gfHwgYWNsLl9hY2wpIHtcbiAgICBtb25nb1VwZGF0ZS4kc2V0ID0ge307XG4gICAgaWYgKGFjbC5fcnBlcm0pIHtcbiAgICAgIG1vbmdvVXBkYXRlLiRzZXQuX3JwZXJtID0gYWNsLl9ycGVybTtcbiAgICB9XG4gICAgaWYgKGFjbC5fd3Blcm0pIHtcbiAgICAgIG1vbmdvVXBkYXRlLiRzZXQuX3dwZXJtID0gYWNsLl93cGVybTtcbiAgICB9XG4gICAgaWYgKGFjbC5fYWNsKSB7XG4gICAgICBtb25nb1VwZGF0ZS4kc2V0Ll9hY2wgPSBhY2wuX2FjbDtcbiAgICB9XG4gIH1cbiAgZm9yICh2YXIgcmVzdEtleSBpbiByZXN0VXBkYXRlKSB7XG4gICAgaWYgKHJlc3RVcGRhdGVbcmVzdEtleV0gJiYgcmVzdFVwZGF0ZVtyZXN0S2V5XS5fX3R5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICB2YXIgb3V0ID0gdHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICByZXN0S2V5LFxuICAgICAgcmVzdFVwZGF0ZVtyZXN0S2V5XSxcbiAgICAgIHBhcnNlRm9ybWF0U2NoZW1hXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvdXRwdXQgdmFsdWUgaXMgYW4gb2JqZWN0IHdpdGggYW55ICQga2V5cywgaXQncyBhblxuICAgIC8vIG9wZXJhdG9yIHRoYXQgbmVlZHMgdG8gYmUgbGlmdGVkIG9udG8gdGhlIHRvcCBsZXZlbCB1cGRhdGVcbiAgICAvLyBvYmplY3QuXG4gICAgaWYgKHR5cGVvZiBvdXQudmFsdWUgPT09ICdvYmplY3QnICYmIG91dC52YWx1ZSAhPT0gbnVsbCAmJiBvdXQudmFsdWUuX19vcCkge1xuICAgICAgbW9uZ29VcGRhdGVbb3V0LnZhbHVlLl9fb3BdID0gbW9uZ29VcGRhdGVbb3V0LnZhbHVlLl9fb3BdIHx8IHt9O1xuICAgICAgbW9uZ29VcGRhdGVbb3V0LnZhbHVlLl9fb3BdW291dC5rZXldID0gb3V0LnZhbHVlLmFyZztcbiAgICB9IGVsc2Uge1xuICAgICAgbW9uZ29VcGRhdGVbJyRzZXQnXSA9IG1vbmdvVXBkYXRlWyckc2V0J10gfHwge307XG4gICAgICBtb25nb1VwZGF0ZVsnJHNldCddW291dC5rZXldID0gb3V0LnZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtb25nb1VwZGF0ZTtcbn07XG5cbi8vIEFkZCB0aGUgbGVnYWN5IF9hY2wgZm9ybWF0LlxuY29uc3QgYWRkTGVnYWN5QUNMID0gcmVzdE9iamVjdCA9PiB7XG4gIGNvbnN0IHJlc3RPYmplY3RDb3B5ID0geyAuLi5yZXN0T2JqZWN0IH07XG4gIGNvbnN0IF9hY2wgPSB7fTtcblxuICBpZiAocmVzdE9iamVjdC5fd3Blcm0pIHtcbiAgICByZXN0T2JqZWN0Ll93cGVybS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIF9hY2xbZW50cnldID0geyB3OiB0cnVlIH07XG4gICAgfSk7XG4gICAgcmVzdE9iamVjdENvcHkuX2FjbCA9IF9hY2w7XG4gIH1cblxuICBpZiAocmVzdE9iamVjdC5fcnBlcm0pIHtcbiAgICByZXN0T2JqZWN0Ll9ycGVybS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghKGVudHJ5IGluIF9hY2wpKSB7XG4gICAgICAgIF9hY2xbZW50cnldID0geyByOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBfYWNsW2VudHJ5XS5yID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXN0T2JqZWN0Q29weS5fYWNsID0gX2FjbDtcbiAgfVxuXG4gIHJldHVybiByZXN0T2JqZWN0Q29weTtcbn07XG5cbi8vIEEgc2VudGluZWwgdmFsdWUgdGhhdCBoZWxwZXIgdHJhbnNmb3JtYXRpb25zIHJldHVybiB3aGVuIHRoZXlcbi8vIGNhbm5vdCBwZXJmb3JtIGEgdHJhbnNmb3JtYXRpb25cbmZ1bmN0aW9uIENhbm5vdFRyYW5zZm9ybSgpIHt9XG5cbmNvbnN0IHRyYW5zZm9ybUludGVyaW9yQXRvbSA9IGF0b20gPT4ge1xuICAvLyBUT0RPOiBjaGVjayB2YWxpZGl0eSBoYXJkZXIgZm9yIHRoZSBfX3R5cGUtZGVmaW5lZCB0eXBlc1xuICBpZiAoXG4gICAgdHlwZW9mIGF0b20gPT09ICdvYmplY3QnICYmXG4gICAgYXRvbSAmJlxuICAgICEoYXRvbSBpbnN0YW5jZW9mIERhdGUpICYmXG4gICAgYXRvbS5fX3R5cGUgPT09ICdQb2ludGVyJ1xuICApIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6IGF0b20uY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IGF0b20ub2JqZWN0SWQsXG4gICAgfTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgYXRvbSA9PT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2YgYXRvbSA9PT0gJ3N5bWJvbCcpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgY2Fubm90IHRyYW5zZm9ybSB2YWx1ZTogJHthdG9tfWBcbiAgICApO1xuICB9IGVsc2UgaWYgKERhdGVDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgIHJldHVybiBEYXRlQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gIH0gZWxzZSBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgIHJldHVybiBCeXRlc0NvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBhdG9tID09PSAnb2JqZWN0JyAmJiBhdG9tICYmIGF0b20uJHJlZ2V4ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gbmV3IFJlZ0V4cChhdG9tLiRyZWdleCk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGF0b207XG4gIH1cbn07XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byB0cmFuc2Zvcm0gYW4gYXRvbSBmcm9tIFJFU1QgZm9ybWF0IHRvIE1vbmdvIGZvcm1hdC5cbi8vIEFuIGF0b20gaXMgYW55dGhpbmcgdGhhdCBjYW4ndCBjb250YWluIG90aGVyIGV4cHJlc3Npb25zLiBTbyBpdFxuLy8gaW5jbHVkZXMgdGhpbmdzIHdoZXJlIG9iamVjdHMgYXJlIHVzZWQgdG8gcmVwcmVzZW50IG90aGVyXG4vLyBkYXRhdHlwZXMsIGxpa2UgcG9pbnRlcnMgYW5kIGRhdGVzLCBidXQgaXQgZG9lcyBub3QgaW5jbHVkZSBvYmplY3RzXG4vLyBvciBhcnJheXMgd2l0aCBnZW5lcmljIHN0dWZmIGluc2lkZS5cbi8vIFJhaXNlcyBhbiBlcnJvciBpZiB0aGlzIGNhbm5vdCBwb3NzaWJseSBiZSB2YWxpZCBSRVNUIGZvcm1hdC5cbi8vIFJldHVybnMgQ2Fubm90VHJhbnNmb3JtIGlmIGl0J3MganVzdCBub3QgYW4gYXRvbVxuZnVuY3Rpb24gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKGF0b20sIGZpZWxkKSB7XG4gIHN3aXRjaCAodHlwZW9mIGF0b20pIHtcbiAgICBjYXNlICdudW1iZXInOlxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICByZXR1cm4gYXRvbTtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgaWYgKGZpZWxkICYmIGZpZWxkLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYCR7ZmllbGQudGFyZ2V0Q2xhc3N9JCR7YXRvbX1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGF0b207XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYGNhbm5vdCB0cmFuc2Zvcm0gdmFsdWU6ICR7YXRvbX1gXG4gICAgICApO1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoYXRvbSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgLy8gVGVjaG5pY2FsbHkgZGF0ZXMgYXJlIG5vdCByZXN0IGZvcm1hdCwgYnV0LCBpdCBzZWVtcyBwcmV0dHlcbiAgICAgICAgLy8gY2xlYXIgd2hhdCB0aGV5IHNob3VsZCBiZSB0cmFuc2Zvcm1lZCB0bywgc28gbGV0J3MganVzdCBkbyBpdC5cbiAgICAgICAgcmV0dXJuIGF0b207XG4gICAgICB9XG5cbiAgICAgIGlmIChhdG9tID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBhdG9tO1xuICAgICAgfVxuXG4gICAgICAvLyBUT0RPOiBjaGVjayB2YWxpZGl0eSBoYXJkZXIgZm9yIHRoZSBfX3R5cGUtZGVmaW5lZCB0eXBlc1xuICAgICAgaWYgKGF0b20uX190eXBlID09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYCR7YXRvbS5jbGFzc05hbWV9JCR7YXRvbS5vYmplY3RJZH1gO1xuICAgICAgfVxuICAgICAgaWYgKERhdGVDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gRGF0ZUNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKEJ5dGVzQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICAgICAgcmV0dXJuIEJ5dGVzQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICBpZiAoR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gR2VvUG9pbnRDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIGlmIChQb2x5Z29uQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICAgICAgcmV0dXJuIFBvbHlnb25Db2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIGlmIChGaWxlQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICAgICAgcmV0dXJuIEZpbGVDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBDYW5ub3RUcmFuc2Zvcm07XG5cbiAgICBkZWZhdWx0OlxuICAgICAgLy8gSSBkb24ndCB0aGluayB0eXBlb2YgY2FuIGV2ZXIgbGV0IHVzIGdldCBoZXJlXG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgYHJlYWxseSBkaWQgbm90IGV4cGVjdCB2YWx1ZTogJHthdG9tfWBcbiAgICAgICk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVsYXRpdmVUaW1lVG9EYXRlKHRleHQsIG5vdyA9IG5ldyBEYXRlKCkpIHtcbiAgdGV4dCA9IHRleHQudG9Mb3dlckNhc2UoKTtcblxuICBsZXQgcGFydHMgPSB0ZXh0LnNwbGl0KCcgJyk7XG5cbiAgLy8gRmlsdGVyIG91dCB3aGl0ZXNwYWNlXG4gIHBhcnRzID0gcGFydHMuZmlsdGVyKHBhcnQgPT4gcGFydCAhPT0gJycpO1xuXG4gIGNvbnN0IGZ1dHVyZSA9IHBhcnRzWzBdID09PSAnaW4nO1xuICBjb25zdCBwYXN0ID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV0gPT09ICdhZ28nO1xuXG4gIGlmICghZnV0dXJlICYmICFwYXN0ICYmIHRleHQgIT09ICdub3cnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgIGluZm86IFwiVGltZSBzaG91bGQgZWl0aGVyIHN0YXJ0IHdpdGggJ2luJyBvciBlbmQgd2l0aCAnYWdvJ1wiLFxuICAgIH07XG4gIH1cblxuICBpZiAoZnV0dXJlICYmIHBhc3QpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgaW5mbzogXCJUaW1lIGNhbm5vdCBoYXZlIGJvdGggJ2luJyBhbmQgJ2FnbydcIixcbiAgICB9O1xuICB9XG5cbiAgLy8gc3RyaXAgdGhlICdhZ28nIG9yICdpbidcbiAgaWYgKGZ1dHVyZSkge1xuICAgIHBhcnRzID0gcGFydHMuc2xpY2UoMSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gcGFzdFxuICAgIHBhcnRzID0gcGFydHMuc2xpY2UoMCwgcGFydHMubGVuZ3RoIC0gMSk7XG4gIH1cblxuICBpZiAocGFydHMubGVuZ3RoICUgMiAhPT0gMCAmJiB0ZXh0ICE9PSAnbm93Jykge1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICBpbmZvOiAnSW52YWxpZCB0aW1lIHN0cmluZy4gRGFuZ2xpbmcgdW5pdCBvciBudW1iZXIuJyxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgcGFpcnMgPSBbXTtcbiAgd2hpbGUgKHBhcnRzLmxlbmd0aCkge1xuICAgIHBhaXJzLnB1c2goW3BhcnRzLnNoaWZ0KCksIHBhcnRzLnNoaWZ0KCldKTtcbiAgfVxuXG4gIGxldCBzZWNvbmRzID0gMDtcbiAgZm9yIChjb25zdCBbbnVtLCBpbnRlcnZhbF0gb2YgcGFpcnMpIHtcbiAgICBjb25zdCB2YWwgPSBOdW1iZXIobnVtKTtcbiAgICBpZiAoIU51bWJlci5pc0ludGVnZXIodmFsKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICBpbmZvOiBgJyR7bnVtfScgaXMgbm90IGFuIGludGVnZXIuYCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgc3dpdGNoIChpbnRlcnZhbCkge1xuICAgICAgY2FzZSAneXInOlxuICAgICAgY2FzZSAneXJzJzpcbiAgICAgIGNhc2UgJ3llYXInOlxuICAgICAgY2FzZSAneWVhcnMnOlxuICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDMxNTM2MDAwOyAvLyAzNjUgKiAyNCAqIDYwICogNjBcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ3drJzpcbiAgICAgIGNhc2UgJ3drcyc6XG4gICAgICBjYXNlICd3ZWVrJzpcbiAgICAgIGNhc2UgJ3dlZWtzJzpcbiAgICAgICAgc2Vjb25kcyArPSB2YWwgKiA2MDQ4MDA7IC8vIDcgKiAyNCAqIDYwICogNjBcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ2QnOlxuICAgICAgY2FzZSAnZGF5JzpcbiAgICAgIGNhc2UgJ2RheXMnOlxuICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDg2NDAwOyAvLyAyNCAqIDYwICogNjBcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ2hyJzpcbiAgICAgIGNhc2UgJ2hycyc6XG4gICAgICBjYXNlICdob3VyJzpcbiAgICAgIGNhc2UgJ2hvdXJzJzpcbiAgICAgICAgc2Vjb25kcyArPSB2YWwgKiAzNjAwOyAvLyA2MCAqIDYwXG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdtaW4nOlxuICAgICAgY2FzZSAnbWlucyc6XG4gICAgICBjYXNlICdtaW51dGUnOlxuICAgICAgY2FzZSAnbWludXRlcyc6XG4gICAgICAgIHNlY29uZHMgKz0gdmFsICogNjA7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdzZWMnOlxuICAgICAgY2FzZSAnc2Vjcyc6XG4gICAgICBjYXNlICdzZWNvbmQnOlxuICAgICAgY2FzZSAnc2Vjb25kcyc6XG4gICAgICAgIHNlY29uZHMgKz0gdmFsO1xuICAgICAgICBicmVhaztcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgICAgaW5mbzogYEludmFsaWQgaW50ZXJ2YWw6ICcke2ludGVydmFsfSdgLFxuICAgICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG1pbGxpc2Vjb25kcyA9IHNlY29uZHMgKiAxMDAwO1xuICBpZiAoZnV0dXJlKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgaW5mbzogJ2Z1dHVyZScsXG4gICAgICByZXN1bHQ6IG5ldyBEYXRlKG5vdy52YWx1ZU9mKCkgKyBtaWxsaXNlY29uZHMpLFxuICAgIH07XG4gIH0gZWxzZSBpZiAocGFzdCkge1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgIGluZm86ICdwYXN0JyxcbiAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSAtIG1pbGxpc2Vjb25kcyksXG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICBpbmZvOiAncHJlc2VudCcsXG4gICAgICByZXN1bHQ6IG5ldyBEYXRlKG5vdy52YWx1ZU9mKCkpLFxuICAgIH07XG4gIH1cbn1cblxuLy8gVHJhbnNmb3JtcyBhIHF1ZXJ5IGNvbnN0cmFpbnQgZnJvbSBSRVNUIEFQSSBmb3JtYXQgdG8gTW9uZ28gZm9ybWF0LlxuLy8gQSBjb25zdHJhaW50IGlzIHNvbWV0aGluZyB3aXRoIGZpZWxkcyBsaWtlICRsdC5cbi8vIElmIGl0IGlzIG5vdCBhIHZhbGlkIGNvbnN0cmFpbnQgYnV0IGl0IGNvdWxkIGJlIGEgdmFsaWQgc29tZXRoaW5nXG4vLyBlbHNlLCByZXR1cm4gQ2Fubm90VHJhbnNmb3JtLlxuLy8gaW5BcnJheSBpcyB3aGV0aGVyIHRoaXMgaXMgYW4gYXJyYXkgZmllbGQuXG5mdW5jdGlvbiB0cmFuc2Zvcm1Db25zdHJhaW50KGNvbnN0cmFpbnQsIGZpZWxkLCBjb3VudCA9IGZhbHNlKSB7XG4gIGNvbnN0IGluQXJyYXkgPSBmaWVsZCAmJiBmaWVsZC50eXBlICYmIGZpZWxkLnR5cGUgPT09ICdBcnJheSc7XG4gIGlmICh0eXBlb2YgY29uc3RyYWludCAhPT0gJ29iamVjdCcgfHwgIWNvbnN0cmFpbnQpIHtcbiAgICByZXR1cm4gQ2Fubm90VHJhbnNmb3JtO1xuICB9XG4gIGNvbnN0IHRyYW5zZm9ybUZ1bmN0aW9uID0gaW5BcnJheVxuICAgID8gdHJhbnNmb3JtSW50ZXJpb3JBdG9tXG4gICAgOiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b207XG4gIGNvbnN0IHRyYW5zZm9ybWVyID0gYXRvbSA9PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNmb3JtRnVuY3Rpb24oYXRvbSwgZmllbGQpO1xuICAgIGlmIChyZXN1bHQgPT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgIGBiYWQgYXRvbTogJHtKU09OLnN0cmluZ2lmeShhdG9tKX1gXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuICAvLyBrZXlzIGlzIHRoZSBjb25zdHJhaW50cyBpbiByZXZlcnNlIGFscGhhYmV0aWNhbCBvcmRlci5cbiAgLy8gVGhpcyBpcyBhIGhhY2sgc28gdGhhdDpcbiAgLy8gICAkcmVnZXggaXMgaGFuZGxlZCBiZWZvcmUgJG9wdGlvbnNcbiAgLy8gICAkbmVhclNwaGVyZSBpcyBoYW5kbGVkIGJlZm9yZSAkbWF4RGlzdGFuY2VcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhjb25zdHJhaW50KVxuICAgIC5zb3J0KClcbiAgICAucmV2ZXJzZSgpO1xuICB2YXIgYW5zd2VyID0ge307XG4gIGZvciAodmFyIGtleSBvZiBrZXlzKSB7XG4gICAgc3dpdGNoIChrZXkpIHtcbiAgICAgIGNhc2UgJyRsdCc6XG4gICAgICBjYXNlICckbHRlJzpcbiAgICAgIGNhc2UgJyRndCc6XG4gICAgICBjYXNlICckZ3RlJzpcbiAgICAgIGNhc2UgJyRleGlzdHMnOlxuICAgICAgY2FzZSAnJG5lJzpcbiAgICAgIGNhc2UgJyRlcSc6IHtcbiAgICAgICAgY29uc3QgdmFsID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAodmFsICYmIHR5cGVvZiB2YWwgPT09ICdvYmplY3QnICYmIHZhbC4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgaWYgKGZpZWxkICYmIGZpZWxkLnR5cGUgIT09ICdEYXRlJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCBEYXRlIGZpZWxkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgICAgICAgY2FzZSAnJGV4aXN0cyc6XG4gICAgICAgICAgICBjYXNlICckbmUnOlxuICAgICAgICAgICAgY2FzZSAnJGVxJzpcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgcGFyc2VyUmVzdWx0ID0gcmVsYXRpdmVUaW1lVG9EYXRlKHZhbC4kcmVsYXRpdmVUaW1lKTtcbiAgICAgICAgICBpZiAocGFyc2VyUmVzdWx0LnN0YXR1cyA9PT0gJ3N1Y2Nlc3MnKSB7XG4gICAgICAgICAgICBhbnN3ZXJba2V5XSA9IHBhcnNlclJlc3VsdC5yZXN1bHQ7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsb2cuaW5mbygnRXJyb3Igd2hpbGUgcGFyc2luZyByZWxhdGl2ZSBkYXRlJywgcGFyc2VyUmVzdWx0KTtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICRyZWxhdGl2ZVRpbWUgKCR7a2V5fSkgdmFsdWUuICR7cGFyc2VyUmVzdWx0LmluZm99YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBhbnN3ZXJba2V5XSA9IHRyYW5zZm9ybWVyKHZhbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjYXNlICckaW4nOlxuICAgICAgY2FzZSAnJG5pbic6IHtcbiAgICAgICAgY29uc3QgYXJyID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICcgKyBrZXkgKyAnIHZhbHVlJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBfLmZsYXRNYXAoYXJyLCB2YWx1ZSA9PiB7XG4gICAgICAgICAgcmV0dXJuIChhdG9tID0+IHtcbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGF0b20pKSB7XG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAodHJhbnNmb3JtZXIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRyYW5zZm9ybWVyKGF0b20pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pKHZhbHVlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJGFsbCc6IHtcbiAgICAgICAgY29uc3QgYXJyID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICcgKyBrZXkgKyAnIHZhbHVlJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBhcnIubWFwKHRyYW5zZm9ybUludGVyaW9yQXRvbSk7XG5cbiAgICAgICAgY29uc3QgdmFsdWVzID0gYW5zd2VyW2tleV07XG4gICAgICAgIGlmIChpc0FueVZhbHVlUmVnZXgodmFsdWVzKSAmJiAhaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ0FsbCAkYWxsIHZhbHVlcyBtdXN0IGJlIG9mIHJlZ2V4IHR5cGUgb3Igbm9uZTogJyArIHZhbHVlc1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRyZWdleCc6XG4gICAgICAgIHZhciBzID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAodHlwZW9mIHMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCByZWdleDogJyArIHMpO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0gcztcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJyRjb250YWluZWRCeSc6IHtcbiAgICAgICAgY29uc3QgYXJyID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICRjb250YWluZWRCeTogc2hvdWxkIGJlIGFuIGFycmF5YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyLiRlbGVtTWF0Y2ggPSB7XG4gICAgICAgICAgJG5pbjogYXJyLm1hcCh0cmFuc2Zvcm1lciksXG4gICAgICAgIH07XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJG9wdGlvbnMnOlxuICAgICAgICBhbnN3ZXJba2V5XSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJyR0ZXh0Jzoge1xuICAgICAgICBjb25zdCBzZWFyY2ggPSBjb25zdHJhaW50W2tleV0uJHNlYXJjaDtcbiAgICAgICAgaWYgKHR5cGVvZiBzZWFyY2ggIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYGJhZCAkdGV4dDogJHNlYXJjaCwgc2hvdWxkIGJlIG9iamVjdGBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc2VhcmNoLiR0ZXJtIHx8IHR5cGVvZiBzZWFyY2guJHRlcm0gIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYGJhZCAkdGV4dDogJHRlcm0sIHNob3VsZCBiZSBzdHJpbmdgXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAgICRzZWFyY2g6IHNlYXJjaC4kdGVybSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChzZWFyY2guJGxhbmd1YWdlICYmIHR5cGVvZiBzZWFyY2guJGxhbmd1YWdlICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGBiYWQgJHRleHQ6ICRsYW5ndWFnZSwgc2hvdWxkIGJlIHN0cmluZ2BcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UpIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XS4kbGFuZ3VhZ2UgPSBzZWFyY2guJGxhbmd1YWdlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICBzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiZcbiAgICAgICAgICB0eXBlb2Ygc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICE9PSAnYm9vbGVhbidcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0uJGNhc2VTZW5zaXRpdmUgPSBzZWFyY2guJGNhc2VTZW5zaXRpdmU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICYmXG4gICAgICAgICAgdHlwZW9mIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICE9PSAnYm9vbGVhbidcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSkge1xuICAgICAgICAgIGFuc3dlcltrZXldLiRkaWFjcml0aWNTZW5zaXRpdmUgPSBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRuZWFyU3BoZXJlJzoge1xuICAgICAgICBjb25zdCBwb2ludCA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgYW5zd2VyLiRnZW9XaXRoaW4gPSB7XG4gICAgICAgICAgICAkY2VudGVyU3BoZXJlOiBbXG4gICAgICAgICAgICAgIFtwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXSxcbiAgICAgICAgICAgICAgY29uc3RyYWludC4kbWF4RGlzdGFuY2UsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0gPSBbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckbWF4RGlzdGFuY2UnOiB7XG4gICAgICAgIGlmIChjb3VudCkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIC8vIFRoZSBTREtzIGRvbid0IHNlZW0gdG8gdXNlIHRoZXNlIGJ1dCB0aGV5IGFyZSBkb2N1bWVudGVkIGluIHRoZVxuICAgICAgLy8gUkVTVCBBUEkgZG9jcy5cbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZUluUmFkaWFucyc6XG4gICAgICAgIGFuc3dlclsnJG1heERpc3RhbmNlJ10gPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJG1heERpc3RhbmNlSW5NaWxlcyc6XG4gICAgICAgIGFuc3dlclsnJG1heERpc3RhbmNlJ10gPSBjb25zdHJhaW50W2tleV0gLyAzOTU5O1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZUluS2lsb21ldGVycyc6XG4gICAgICAgIGFuc3dlclsnJG1heERpc3RhbmNlJ10gPSBjb25zdHJhaW50W2tleV0gLyA2MzcxO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJHNlbGVjdCc6XG4gICAgICBjYXNlICckZG9udFNlbGVjdCc6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5DT01NQU5EX1VOQVZBSUxBQkxFLFxuICAgICAgICAgICd0aGUgJyArIGtleSArICcgY29uc3RyYWludCBpcyBub3Qgc3VwcG9ydGVkIHlldCdcbiAgICAgICAgKTtcblxuICAgICAgY2FzZSAnJHdpdGhpbic6XG4gICAgICAgIHZhciBib3ggPSBjb25zdHJhaW50W2tleV1bJyRib3gnXTtcbiAgICAgICAgaWYgKCFib3ggfHwgYm94Lmxlbmd0aCAhPSAyKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ21hbGZvcm1hdHRlZCAkd2l0aGluIGFyZydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICRib3g6IFtcbiAgICAgICAgICAgIFtib3hbMF0ubG9uZ2l0dWRlLCBib3hbMF0ubGF0aXR1ZGVdLFxuICAgICAgICAgICAgW2JveFsxXS5sb25naXR1ZGUsIGJveFsxXS5sYXRpdHVkZV0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJyRnZW9XaXRoaW4nOiB7XG4gICAgICAgIGNvbnN0IHBvbHlnb24gPSBjb25zdHJhaW50W2tleV1bJyRwb2x5Z29uJ107XG4gICAgICAgIGNvbnN0IGNlbnRlclNwaGVyZSA9IGNvbnN0cmFpbnRba2V5XVsnJGNlbnRlclNwaGVyZSddO1xuICAgICAgICBpZiAocG9seWdvbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgbGV0IHBvaW50cztcbiAgICAgICAgICBpZiAodHlwZW9mIHBvbHlnb24gPT09ICdvYmplY3QnICYmIHBvbHlnb24uX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgICAgIGlmICghcG9seWdvbi5jb29yZGluYXRlcyB8fCBwb2x5Z29uLmNvb3JkaW5hdGVzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7IFBvbHlnb24uY29vcmRpbmF0ZXMgc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBsb24vbGF0IHBhaXJzJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcG9pbnRzID0gcG9seWdvbi5jb29yZGluYXRlcztcbiAgICAgICAgICB9IGVsc2UgaWYgKHBvbHlnb24gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgICAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBHZW9Qb2ludHMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwb2ludHMgPSBwb2x5Z29uO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgXCJiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGJlIFBvbHlnb24gb2JqZWN0IG9yIEFycmF5IG9mIFBhcnNlLkdlb1BvaW50J3NcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcG9pbnRzID0gcG9pbnRzLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICAgICAgICAgIHJldHVybiBwb2ludDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWUnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICAgJHBvbHlnb246IHBvaW50cyxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2UgaWYgKGNlbnRlclNwaGVyZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaWYgKCEoY2VudGVyU3BoZXJlIGluc3RhbmNlb2YgQXJyYXkpIHx8IGNlbnRlclNwaGVyZS5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIHNob3VsZCBiZSBhbiBhcnJheSBvZiBQYXJzZS5HZW9Qb2ludCBhbmQgZGlzdGFuY2UnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBHZXQgcG9pbnQsIGNvbnZlcnQgdG8gZ2VvIHBvaW50IGlmIG5lY2Vzc2FyeSBhbmQgdmFsaWRhdGVcbiAgICAgICAgICBsZXQgcG9pbnQgPSBjZW50ZXJTcGhlcmVbMF07XG4gICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBwb2ludCA9IG5ldyBQYXJzZS5HZW9Qb2ludChwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGdlbyBwb2ludCBpbnZhbGlkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICAgIC8vIEdldCBkaXN0YW5jZSBhbmQgdmFsaWRhdGVcbiAgICAgICAgICBjb25zdCBkaXN0YW5jZSA9IGNlbnRlclNwaGVyZVsxXTtcbiAgICAgICAgICBpZiAoaXNOYU4oZGlzdGFuY2UpIHx8IGRpc3RhbmNlIDwgMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBkaXN0YW5jZSBpbnZhbGlkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgICAkY2VudGVyU3BoZXJlOiBbW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdLCBkaXN0YW5jZV0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRnZW9JbnRlcnNlY3RzJzoge1xuICAgICAgICBjb25zdCBwb2ludCA9IGNvbnN0cmFpbnRba2V5XVsnJHBvaW50J107XG4gICAgICAgIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICRnZW9JbnRlcnNlY3QgdmFsdWU7ICRwb2ludCBzaG91bGQgYmUgR2VvUG9pbnQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgJGdlb21ldHJ5OiB7XG4gICAgICAgICAgICB0eXBlOiAnUG9pbnQnLFxuICAgICAgICAgICAgY29vcmRpbmF0ZXM6IFtwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmIChrZXkubWF0Y2goL15cXCQrLykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkIGNvbnN0cmFpbnQ6ICcgKyBrZXlcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBDYW5ub3RUcmFuc2Zvcm07XG4gICAgfVxuICB9XG4gIHJldHVybiBhbnN3ZXI7XG59XG5cbi8vIFRyYW5zZm9ybXMgYW4gdXBkYXRlIG9wZXJhdG9yIGZyb20gUkVTVCBmb3JtYXQgdG8gbW9uZ28gZm9ybWF0LlxuLy8gVG8gYmUgdHJhbnNmb3JtZWQsIHRoZSBpbnB1dCBzaG91bGQgaGF2ZSBhbiBfX29wIGZpZWxkLlxuLy8gSWYgZmxhdHRlbiBpcyB0cnVlLCB0aGlzIHdpbGwgZmxhdHRlbiBvcGVyYXRvcnMgdG8gdGhlaXIgc3RhdGljXG4vLyBkYXRhIGZvcm1hdC4gRm9yIGV4YW1wbGUsIGFuIGluY3JlbWVudCBvZiAyIHdvdWxkIHNpbXBseSBiZWNvbWUgYVxuLy8gMi5cbi8vIFRoZSBvdXRwdXQgZm9yIGEgbm9uLWZsYXR0ZW5lZCBvcGVyYXRvciBpcyBhIGhhc2ggd2l0aCBfX29wIGJlaW5nXG4vLyB0aGUgbW9uZ28gb3AsIGFuZCBhcmcgYmVpbmcgdGhlIGFyZ3VtZW50LlxuLy8gVGhlIG91dHB1dCBmb3IgYSBmbGF0dGVuZWQgb3BlcmF0b3IgaXMganVzdCBhIHZhbHVlLlxuLy8gUmV0dXJucyB1bmRlZmluZWQgaWYgdGhpcyBzaG91bGQgYmUgYSBuby1vcC5cblxuZnVuY3Rpb24gdHJhbnNmb3JtVXBkYXRlT3BlcmF0b3IoeyBfX29wLCBhbW91bnQsIG9iamVjdHMgfSwgZmxhdHRlbikge1xuICBzd2l0Y2ggKF9fb3ApIHtcbiAgICBjYXNlICdEZWxldGUnOlxuICAgICAgaWYgKGZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IF9fb3A6ICckdW5zZXQnLCBhcmc6ICcnIH07XG4gICAgICB9XG5cbiAgICBjYXNlICdJbmNyZW1lbnQnOlxuICAgICAgaWYgKHR5cGVvZiBhbW91bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2luY3JlbWVudGluZyBtdXN0IHByb3ZpZGUgYSBudW1iZXInXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gYW1vdW50O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogJyRpbmMnLCBhcmc6IGFtb3VudCB9O1xuICAgICAgfVxuXG4gICAgY2FzZSAnQWRkJzpcbiAgICBjYXNlICdBZGRVbmlxdWUnOlxuICAgICAgaWYgKCEob2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5J1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgdmFyIHRvQWRkID0gb2JqZWN0cy5tYXAodHJhbnNmb3JtSW50ZXJpb3JBdG9tKTtcbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiB0b0FkZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBtb25nb09wID0ge1xuICAgICAgICAgIEFkZDogJyRwdXNoJyxcbiAgICAgICAgICBBZGRVbmlxdWU6ICckYWRkVG9TZXQnLFxuICAgICAgICB9W19fb3BdO1xuICAgICAgICByZXR1cm4geyBfX29wOiBtb25nb09wLCBhcmc6IHsgJGVhY2g6IHRvQWRkIH0gfTtcbiAgICAgIH1cblxuICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICBpZiAoIShvYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ29iamVjdHMgdG8gcmVtb3ZlIG11c3QgYmUgYW4gYXJyYXknXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICB2YXIgdG9SZW1vdmUgPSBvYmplY3RzLm1hcCh0cmFuc2Zvcm1JbnRlcmlvckF0b20pO1xuICAgICAgaWYgKGZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogJyRwdWxsQWxsJywgYXJnOiB0b1JlbW92ZSB9O1xuICAgICAgfVxuXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgYFRoZSAke19fb3B9IG9wZXJhdG9yIGlzIG5vdCBzdXBwb3J0ZWQgeWV0LmBcbiAgICAgICk7XG4gIH1cbn1cbmZ1bmN0aW9uIG1hcFZhbHVlcyhvYmplY3QsIGl0ZXJhdG9yKSB7XG4gIGNvbnN0IHJlc3VsdCA9IHt9O1xuICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICByZXN1bHRba2V5XSA9IGl0ZXJhdG9yKG9iamVjdFtrZXldKTtcbiAgfSk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmNvbnN0IG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCA9IG1vbmdvT2JqZWN0ID0+IHtcbiAgc3dpdGNoICh0eXBlb2YgbW9uZ29PYmplY3QpIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHJldHVybiBtb25nb09iamVjdDtcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHRocm93ICdiYWQgdmFsdWUgaW4gbmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0JztcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKG1vbmdvT2JqZWN0ID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0Lm1hcChuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIHJldHVybiBQYXJzZS5fZW5jb2RlKG1vbmdvT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5Mb25nKSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC50b051bWJlcigpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkRvdWJsZSkge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QudmFsdWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChCeXRlc0NvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdChtb25nb09iamVjdCkpIHtcbiAgICAgICAgcmV0dXJuIEJ5dGVzQ29kZXIuZGF0YWJhc2VUb0pTT04obW9uZ29PYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChtb25nb09iamVjdCwgJ19fdHlwZScpICYmXG4gICAgICAgIG1vbmdvT2JqZWN0Ll9fdHlwZSA9PSAnRGF0ZScgJiZcbiAgICAgICAgbW9uZ29PYmplY3QuaXNvIGluc3RhbmNlb2YgRGF0ZVxuICAgICAgKSB7XG4gICAgICAgIG1vbmdvT2JqZWN0LmlzbyA9IG1vbmdvT2JqZWN0Lmlzby50b0pTT04oKTtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbWFwVmFsdWVzKG1vbmdvT2JqZWN0LCBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QpO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAndW5rbm93biBqcyB0eXBlJztcbiAgfVxufTtcblxuY29uc3QgdHJhbnNmb3JtUG9pbnRlclN0cmluZyA9IChzY2hlbWEsIGZpZWxkLCBwb2ludGVyU3RyaW5nKSA9PiB7XG4gIGNvbnN0IG9iakRhdGEgPSBwb2ludGVyU3RyaW5nLnNwbGl0KCckJyk7XG4gIGlmIChvYmpEYXRhWzBdICE9PSBzY2hlbWEuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcykge1xuICAgIHRocm93ICdwb2ludGVyIHRvIGluY29ycmVjdCBjbGFzc05hbWUnO1xuICB9XG4gIHJldHVybiB7XG4gICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgY2xhc3NOYW1lOiBvYmpEYXRhWzBdLFxuICAgIG9iamVjdElkOiBvYmpEYXRhWzFdLFxuICB9O1xufTtcblxuLy8gQ29udmVydHMgZnJvbSBhIG1vbmdvLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4vLyBEb2VzIG5vdCBzdHJpcCBvdXQgYW55dGhpbmcgYmFzZWQgb24gYSBsYWNrIG9mIGF1dGhlbnRpY2F0aW9uLlxuY29uc3QgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0ID0gKGNsYXNzTmFtZSwgbW9uZ29PYmplY3QsIHNjaGVtYSkgPT4ge1xuICBzd2l0Y2ggKHR5cGVvZiBtb25nb09iamVjdCkge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0O1xuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgdGhyb3cgJ2JhZCB2YWx1ZSBpbiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QnO1xuICAgIGNhc2UgJ29iamVjdCc6IHtcbiAgICAgIGlmIChtb25nb09iamVjdCA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC5tYXAobmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICByZXR1cm4gUGFyc2UuX2VuY29kZShtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuTG9uZykge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QudG9OdW1iZXIoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5Eb3VibGUpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnZhbHVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QobW9uZ29PYmplY3QpKSB7XG4gICAgICAgIHJldHVybiBCeXRlc0NvZGVyLmRhdGFiYXNlVG9KU09OKG1vbmdvT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdE9iamVjdCA9IHt9O1xuICAgICAgaWYgKG1vbmdvT2JqZWN0Ll9ycGVybSB8fCBtb25nb09iamVjdC5fd3Blcm0pIHtcbiAgICAgICAgcmVzdE9iamVjdC5fcnBlcm0gPSBtb25nb09iamVjdC5fcnBlcm0gfHwgW107XG4gICAgICAgIHJlc3RPYmplY3QuX3dwZXJtID0gbW9uZ29PYmplY3QuX3dwZXJtIHx8IFtdO1xuICAgICAgICBkZWxldGUgbW9uZ29PYmplY3QuX3JwZXJtO1xuICAgICAgICBkZWxldGUgbW9uZ29PYmplY3QuX3dwZXJtO1xuICAgICAgfVxuXG4gICAgICBmb3IgKHZhciBrZXkgaW4gbW9uZ29PYmplY3QpIHtcbiAgICAgICAgc3dpdGNoIChrZXkpIHtcbiAgICAgICAgICBjYXNlICdfaWQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnb2JqZWN0SWQnXSA9ICcnICsgbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19oYXNoZWRfcGFzc3dvcmQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdC5faGFzaGVkX3Bhc3N3b3JkID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19hY2wnOlxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbic6XG4gICAgICAgICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW4nOlxuICAgICAgICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgICAgIGNhc2UgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JzpcbiAgICAgICAgICBjYXNlICdfdG9tYnN0b25lJzpcbiAgICAgICAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgICAgIGNhc2UgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCc6XG4gICAgICAgICAgY2FzZSAnX2ZhaWxlZF9sb2dpbl9jb3VudCc6XG4gICAgICAgICAgY2FzZSAnX3Bhc3N3b3JkX2hpc3RvcnknOlxuICAgICAgICAgICAgLy8gVGhvc2Uga2V5cyB3aWxsIGJlIGRlbGV0ZWQgaWYgbmVlZGVkIGluIHRoZSBEQiBDb250cm9sbGVyXG4gICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX3Nlc3Npb25fdG9rZW4nOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnc2Vzc2lvblRva2VuJ10gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgICAgICBjYXNlICdfdXBkYXRlZF9hdCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0Wyd1cGRhdGVkQXQnXSA9IFBhcnNlLl9lbmNvZGUoXG4gICAgICAgICAgICAgIG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pXG4gICAgICAgICAgICApLmlzbztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2NyZWF0ZWRBdCc6XG4gICAgICAgICAgY2FzZSAnX2NyZWF0ZWRfYXQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnY3JlYXRlZEF0J10gPSBQYXJzZS5fZW5jb2RlKFxuICAgICAgICAgICAgICBuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKVxuICAgICAgICAgICAgKS5pc287XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdleHBpcmVzQXQnOlxuICAgICAgICAgIGNhc2UgJ19leHBpcmVzQXQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnZXhwaXJlc0F0J10gPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICAgICAgICBjYXNlICdfbGFzdF91c2VkJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ2xhc3RVc2VkJ10gPSBQYXJzZS5fZW5jb2RlKFxuICAgICAgICAgICAgICBuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKVxuICAgICAgICAgICAgKS5pc287XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgICAgICAgIGNhc2UgJ3RpbWVzX3VzZWQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsndGltZXNVc2VkJ10gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnYXV0aERhdGEnOlxuICAgICAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgICAgICBsb2cud2FybihcbiAgICAgICAgICAgICAgICAnaWdub3JpbmcgYXV0aERhdGEgaW4gX1VzZXIgYXMgdGhpcyBrZXkgaXMgcmVzZXJ2ZWQgdG8gYmUgc3ludGhlc2l6ZWQgb2YgYF9hdXRoX2RhdGFfKmAga2V5cydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJlc3RPYmplY3RbJ2F1dGhEYXRhJ10gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIC8vIENoZWNrIG90aGVyIGF1dGggZGF0YSBrZXlzXG4gICAgICAgICAgICB2YXIgYXV0aERhdGFNYXRjaCA9IGtleS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgICAgICAgaWYgKGF1dGhEYXRhTWF0Y2ggJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgICAgICAgIHJlc3RPYmplY3RbJ2F1dGhEYXRhJ10gPSByZXN0T2JqZWN0WydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICAgICAgICByZXN0T2JqZWN0WydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoa2V5LmluZGV4T2YoJ19wXycpID09IDApIHtcbiAgICAgICAgICAgICAgdmFyIG5ld0tleSA9IGtleS5zdWJzdHJpbmcoMyk7XG4gICAgICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tuZXdLZXldKSB7XG4gICAgICAgICAgICAgICAgbG9nLmluZm8oXG4gICAgICAgICAgICAgICAgICAndHJhbnNmb3JtLmpzJyxcbiAgICAgICAgICAgICAgICAgICdGb3VuZCBhIHBvaW50ZXIgY29sdW1uIG5vdCBpbiB0aGUgc2NoZW1hLCBkcm9wcGluZyBpdC4nLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgbmV3S2V5XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tuZXdLZXldLnR5cGUgIT09ICdQb2ludGVyJykge1xuICAgICAgICAgICAgICAgIGxvZy5pbmZvKFxuICAgICAgICAgICAgICAgICAgJ3RyYW5zZm9ybS5qcycsXG4gICAgICAgICAgICAgICAgICAnRm91bmQgYSBwb2ludGVyIGluIGEgbm9uLXBvaW50ZXIgY29sdW1uLCBkcm9wcGluZyBpdC4nLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAga2V5XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAobW9uZ29PYmplY3Rba2V5XSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJlc3RPYmplY3RbbmV3S2V5XSA9IHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcoXG4gICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgIG5ld0tleSxcbiAgICAgICAgICAgICAgICBtb25nb09iamVjdFtrZXldXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChrZXlbMF0gPT0gJ18nICYmIGtleSAhPSAnX190eXBlJykge1xuICAgICAgICAgICAgICB0aHJvdyAnYmFkIGtleSBpbiB1bnRyYW5zZm9ybTogJyArIGtleTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZhciB2YWx1ZSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ0ZpbGUnICYmXG4gICAgICAgICAgICAgICAgRmlsZUNvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdCh2YWx1ZSlcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gRmlsZUNvZGVyLmRhdGFiYXNlVG9KU09OKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdHZW9Qb2ludCcgJiZcbiAgICAgICAgICAgICAgICBHZW9Qb2ludENvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdCh2YWx1ZSlcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gR2VvUG9pbnRDb2Rlci5kYXRhYmFzZVRvSlNPTih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnUG9seWdvbicgJiZcbiAgICAgICAgICAgICAgICBQb2x5Z29uQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBQb2x5Z29uQ29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ0J5dGVzJyAmJlxuICAgICAgICAgICAgICAgIEJ5dGVzQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBCeXRlc0NvZGVyLmRhdGFiYXNlVG9KU09OKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gbmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0KFxuICAgICAgICAgICAgICBtb25nb09iamVjdFtrZXldXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZpbHRlcihcbiAgICAgICAgZmllbGROYW1lID0+IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nXG4gICAgICApO1xuICAgICAgY29uc3QgcmVsYXRpb25GaWVsZHMgPSB7fTtcbiAgICAgIHJlbGF0aW9uRmllbGROYW1lcy5mb3JFYWNoKHJlbGF0aW9uRmllbGROYW1lID0+IHtcbiAgICAgICAgcmVsYXRpb25GaWVsZHNbcmVsYXRpb25GaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbcmVsYXRpb25GaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiB7IC4uLnJlc3RPYmplY3QsIC4uLnJlbGF0aW9uRmllbGRzIH07XG4gICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAndW5rbm93biBqcyB0eXBlJztcbiAgfVxufTtcblxudmFyIERhdGVDb2RlciA9IHtcbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIHJldHVybiBuZXcgRGF0ZShqc29uLmlzbyk7XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJ1xuICAgICk7XG4gIH0sXG59O1xuXG52YXIgQnl0ZXNDb2RlciA9IHtcbiAgYmFzZTY0UGF0dGVybjogbmV3IFJlZ0V4cChcbiAgICAnXig/OltBLVphLXowLTkrL117NH0pKig/OltBLVphLXowLTkrL117Mn09PXxbQS1aYS16MC05Ky9dezN9PSk/JCdcbiAgKSxcbiAgaXNCYXNlNjRWYWx1ZShvYmplY3QpIHtcbiAgICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYmFzZTY0UGF0dGVybi50ZXN0KG9iamVjdCk7XG4gIH0sXG5cbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgbGV0IHZhbHVlO1xuICAgIGlmICh0aGlzLmlzQmFzZTY0VmFsdWUob2JqZWN0KSkge1xuICAgICAgdmFsdWUgPSBvYmplY3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlID0gb2JqZWN0LmJ1ZmZlci50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICBiYXNlNjQ6IHZhbHVlLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkJpbmFyeSB8fCB0aGlzLmlzQmFzZTY0VmFsdWUob2JqZWN0KTtcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIG5ldyBtb25nb2RiLkJpbmFyeShCdWZmZXIuZnJvbShqc29uLmJhc2U2NCwgJ2Jhc2U2NCcpKTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0J5dGVzJ1xuICAgICk7XG4gIH0sXG59O1xuXG52YXIgR2VvUG9pbnRDb2RlciA9IHtcbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgIGxhdGl0dWRlOiBvYmplY3RbMV0sXG4gICAgICBsb25naXR1ZGU6IG9iamVjdFswXSxcbiAgICB9O1xuICB9LFxuXG4gIGlzVmFsaWREYXRhYmFzZU9iamVjdChvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0IGluc3RhbmNlb2YgQXJyYXkgJiYgb2JqZWN0Lmxlbmd0aCA9PSAyO1xuICB9LFxuXG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICByZXR1cm4gW2pzb24ubG9uZ2l0dWRlLCBqc29uLmxhdGl0dWRlXTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50J1xuICAgICk7XG4gIH0sXG59O1xuXG52YXIgUG9seWdvbkNvZGVyID0ge1xuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICAvLyBDb252ZXJ0IGxuZy9sYXQgLT4gbGF0L2xuZ1xuICAgIGNvbnN0IGNvb3JkcyA9IG9iamVjdC5jb29yZGluYXRlc1swXS5tYXAoY29vcmQgPT4ge1xuICAgICAgcmV0dXJuIFtjb29yZFsxXSwgY29vcmRbMF1dO1xuICAgIH0pO1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdQb2x5Z29uJyxcbiAgICAgIGNvb3JkaW5hdGVzOiBjb29yZHMsXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgY29uc3QgY29vcmRzID0gb2JqZWN0LmNvb3JkaW5hdGVzWzBdO1xuICAgIGlmIChvYmplY3QudHlwZSAhPT0gJ1BvbHlnb24nIHx8ICEoY29vcmRzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29vcmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBwb2ludCA9IGNvb3Jkc1tpXTtcbiAgICAgIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QocG9pbnQpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwYXJzZUZsb2F0KHBvaW50WzFdKSwgcGFyc2VGbG9hdChwb2ludFswXSkpO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgbGV0IGNvb3JkcyA9IGpzb24uY29vcmRpbmF0ZXM7XG4gICAgLy8gQWRkIGZpcnN0IHBvaW50IHRvIHRoZSBlbmQgdG8gY2xvc2UgcG9seWdvblxuICAgIGlmIChcbiAgICAgIGNvb3Jkc1swXVswXSAhPT0gY29vcmRzW2Nvb3Jkcy5sZW5ndGggLSAxXVswXSB8fFxuICAgICAgY29vcmRzWzBdWzFdICE9PSBjb29yZHNbY29vcmRzLmxlbmd0aCAtIDFdWzFdXG4gICAgKSB7XG4gICAgICBjb29yZHMucHVzaChjb29yZHNbMF0pO1xuICAgIH1cbiAgICBjb25zdCB1bmlxdWUgPSBjb29yZHMuZmlsdGVyKChpdGVtLCBpbmRleCwgYXIpID0+IHtcbiAgICAgIGxldCBmb3VuZEluZGV4ID0gLTE7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgIGNvbnN0IHB0ID0gYXJbaV07XG4gICAgICAgIGlmIChwdFswXSA9PT0gaXRlbVswXSAmJiBwdFsxXSA9PT0gaXRlbVsxXSkge1xuICAgICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gZm91bmRJbmRleCA9PT0gaW5kZXg7XG4gICAgfSk7XG4gICAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICAgKTtcbiAgICB9XG4gICAgLy8gQ29udmVydCBsYXQvbG9uZyAtPiBsb25nL2xhdFxuICAgIGNvb3JkcyA9IGNvb3Jkcy5tYXAoY29vcmQgPT4ge1xuICAgICAgcmV0dXJuIFtjb29yZFsxXSwgY29vcmRbMF1dO1xuICAgIH0pO1xuICAgIHJldHVybiB7IHR5cGU6ICdQb2x5Z29uJywgY29vcmRpbmF0ZXM6IFtjb29yZHNdIH07XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJ1xuICAgICk7XG4gIH0sXG59O1xuXG52YXIgRmlsZUNvZGVyID0ge1xuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICBuYW1lOiBvYmplY3QsXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBvYmplY3QgPT09ICdzdHJpbmcnO1xuICB9LFxuXG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICByZXR1cm4ganNvbi5uYW1lO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnRmlsZSdcbiAgICApO1xuICB9LFxufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHRyYW5zZm9ybUtleSxcbiAgcGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlLFxuICB0cmFuc2Zvcm1VcGRhdGUsXG4gIHRyYW5zZm9ybVdoZXJlLFxuICBtb25nb09iamVjdFRvUGFyc2VPYmplY3QsXG4gIHJlbGF0aXZlVGltZVRvRGF0ZSxcbiAgdHJhbnNmb3JtQ29uc3RyYWludCxcbiAgdHJhbnNmb3JtUG9pbnRlclN0cmluZyxcbn07XG4iXX0=