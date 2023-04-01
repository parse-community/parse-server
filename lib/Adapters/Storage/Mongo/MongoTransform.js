"use strict";

var _logger = _interopRequireDefault(require("../../../logger"));
var _lodash = _interopRequireDefault(require("lodash"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var mongodb = require('mongodb');
var Parse = require('parse/node').Parse;
const Utils = require('../../../Utils');
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
  if (parseFormatSchema.fields[key] && parseFormatSchema.fields[key].type === 'Pointer' || !key.includes('.') && !parseFormatSchema.fields[key] && restValue && restValue.__type == 'Pointer' // Do not use the _p_ prefix for pointers inside nested documents
  ) {
    key = '_p_' + key;
  }

  // Handle atomic values
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
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return {
      key,
      value
    };
  }

  // Handle update operators
  if (typeof restValue === 'object' && '__op' in restValue) {
    return {
      key,
      value: transformUpdateOperator(restValue, false)
    };
  }

  // Handle normal objects by recursing
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
  }
  // Handle atomic values
  var value = transformInteriorAtom(restValue);
  if (value !== CannotTransform) {
    if (value && typeof value === 'object') {
      if (value instanceof Date) {
        return value;
      }
      if (value instanceof Array) {
        value = value.map(transformInteriorValue);
      } else {
        value = mapValues(value, transformInteriorValue);
      }
    }
    return value;
  }

  // Handle arrays
  if (restValue instanceof Array) {
    return restValue.map(transformInteriorValue);
  }

  // Handle update operators
  if (typeof restValue === 'object' && '__op' in restValue) {
    return transformUpdateOperator(restValue, true);
  }

  // Handle normal objects by recursing
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
          const provider = authDataMatch[1];
          // Special-case auth data.
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
  if (expectedTypeIsPointer || !schema && !key.includes('.') && value && value.__type === 'Pointer') {
    key = '_p_' + key;
  }

  // Handle query constraints
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
  }

  // Handle atomic values
  const transformRes = key.includes('.') ? transformInteriorAtom(value) : transformTopLevelAtom(value);
  if (transformRes !== CannotTransform) {
    return {
      key,
      value: transformRes
    };
  } else {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `You cannot use ${value} as a query parameter.`);
  }
}

// Main exposed method to help run queries.
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
      }
      // Trust that the auth data has been transformed and save it directly
      if (restKey.match(/^_auth_data_[a-zA-Z0-9_]+$/)) {
        return {
          key: restKey,
          value: restValue
        };
      }
  }
  //skip straight to transformTopLevelAtom for Bytes, they don't show up in the schema for some reason
  if (restValue && restValue.__type !== 'Bytes') {
    //Note: We may not know the type of a field here, as the user could be saving (null) to a field
    //That never existed before, meaning we can't infer the type.
    if (schema.fields[restKey] && schema.fields[restKey].type == 'Pointer' || restValue.__type == 'Pointer') {
      restKey = '_p_' + restKey;
    }
  }

  // Handle atomic values
  var value = transformTopLevelAtom(restValue);
  if (value !== CannotTransform) {
    return {
      key: restKey,
      value: value
    };
  }

  // ACLs are handled before this method is called
  // If an ACL key still exists here, something is wrong.
  if (restKey === 'ACL') {
    throw 'There was a problem transforming an ACL.';
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return {
      key: restKey,
      value: value
    };
  }

  // Handle normal objects by recursing
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
  }

  // Use the legacy mongo format for createdAt and updatedAt
  if (mongoCreate.createdAt) {
    mongoCreate._created_at = new Date(mongoCreate.createdAt.iso || mongoCreate.createdAt);
    delete mongoCreate.createdAt;
  }
  if (mongoCreate.updatedAt) {
    mongoCreate._updated_at = new Date(mongoCreate.updatedAt.iso || mongoCreate.updatedAt);
    delete mongoCreate.updatedAt;
  }
  return mongoCreate;
};

// Main exposed method to help update old objects.
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
    var out = transformKeyValueForUpdate(className, restKey, restUpdate[restKey], parseFormatSchema);

    // If the output value is an object with any $ keys, it's an
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
};

// Add the legacy _acl format.
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
};

// A sentinel value that helper transformations return when they
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
};

// Helper function to transform an atom from REST format to Mongo format.
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
      }

      // TODO: check validity harder for the __type-defined types
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

// Transforms a query constraint from REST API format to Mongo format.
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
  };
  // keys is the constraints in reverse alphabetical order.
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
            const parserResult = Utils.relativeTimeToDate(val.$relativeTime);
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
            }
            // Get point, convert to geo point if necessary and validate
            let point = centerSphere[0];
            if (point instanceof Array && point.length === 2) {
              point = new Parse.GeoPoint(point[1], point[0]);
            } else if (!GeoPointCoder.isValidJSON(point)) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
            }
            Parse.GeoPoint._validate(point.latitude, point.longitude);
            // Get distance and validate
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
}

// Transforms an update operator from REST format to mongo format.
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
};

// Converts from a mongo-format object to a REST-format object.
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
    let coords = json.coordinates;
    // Add first point to the end to close polygon
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
    }
    // Convert lat/long -> long/lat
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
  transformConstraint,
  transformPointerString
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJtb25nb2RiIiwicmVxdWlyZSIsIlBhcnNlIiwiVXRpbHMiLCJ0cmFuc2Zvcm1LZXkiLCJjbGFzc05hbWUiLCJmaWVsZE5hbWUiLCJzY2hlbWEiLCJmaWVsZHMiLCJfX3R5cGUiLCJ0eXBlIiwidHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUiLCJyZXN0S2V5IiwicmVzdFZhbHVlIiwicGFyc2VGb3JtYXRTY2hlbWEiLCJrZXkiLCJ0aW1lRmllbGQiLCJpbmNsdWRlcyIsInZhbHVlIiwicGFyc2VJbnQiLCJ0cmFuc2Zvcm1Ub3BMZXZlbEF0b20iLCJDYW5ub3RUcmFuc2Zvcm0iLCJEYXRlIiwiaW5kZXhPZiIsIkFycmF5IiwibWFwIiwidHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSIsInRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yIiwibWFwVmFsdWVzIiwiaXNSZWdleCIsIlJlZ0V4cCIsImlzU3RhcnRzV2l0aFJlZ2V4IiwibWF0Y2hlcyIsInRvU3RyaW5nIiwibWF0Y2giLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwidmFsdWVzIiwiaXNBcnJheSIsImxlbmd0aCIsImZpcnN0VmFsdWVzSXNSZWdleCIsImkiLCJpc0FueVZhbHVlUmVnZXgiLCJzb21lIiwiT2JqZWN0Iiwia2V5cyIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwidHJhbnNmb3JtSW50ZXJpb3JBdG9tIiwidmFsdWVBc0RhdGUiLCJ0cmFuc2Zvcm1RdWVyeUtleVZhbHVlIiwiY291bnQiLCJzdWJRdWVyeSIsInRyYW5zZm9ybVdoZXJlIiwiYXV0aERhdGFNYXRjaCIsInByb3ZpZGVyIiwiZXhwZWN0ZWRUeXBlSXNBcnJheSIsImV4cGVjdGVkVHlwZUlzUG9pbnRlciIsImZpZWxkIiwidHJhbnNmb3JtZWRDb25zdHJhaW50IiwidHJhbnNmb3JtQ29uc3RyYWludCIsIiR0ZXh0IiwiJGVsZW1NYXRjaCIsIiRhbGwiLCJ0cmFuc2Zvcm1SZXMiLCJJTlZBTElEX0pTT04iLCJyZXN0V2hlcmUiLCJtb25nb1doZXJlIiwib3V0IiwicGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZSIsInRyYW5zZm9ybWVkVmFsdWUiLCJjb2VyY2VkVG9EYXRlIiwiSU5WQUxJRF9LRVlfTkFNRSIsInBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSIsInJlc3RDcmVhdGUiLCJhZGRMZWdhY3lBQ0wiLCJtb25nb0NyZWF0ZSIsInVuZGVmaW5lZCIsImNyZWF0ZWRBdCIsIl9jcmVhdGVkX2F0IiwiaXNvIiwidXBkYXRlZEF0IiwiX3VwZGF0ZWRfYXQiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJyZXN0VXBkYXRlIiwibW9uZ29VcGRhdGUiLCJhY2wiLCJfcnBlcm0iLCJfd3Blcm0iLCJfYWNsIiwiJHNldCIsIl9fb3AiLCJhcmciLCJyZXN0T2JqZWN0IiwicmVzdE9iamVjdENvcHkiLCJmb3JFYWNoIiwiZW50cnkiLCJ3IiwiciIsImF0b20iLCJvYmplY3RJZCIsIkRhdGVDb2RlciIsImlzVmFsaWRKU09OIiwiSlNPTlRvRGF0YWJhc2UiLCJCeXRlc0NvZGVyIiwiJHJlZ2V4IiwidGFyZ2V0Q2xhc3MiLCJHZW9Qb2ludENvZGVyIiwiUG9seWdvbkNvZGVyIiwiRmlsZUNvZGVyIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiY29uc3RyYWludCIsImluQXJyYXkiLCJ0cmFuc2Zvcm1GdW5jdGlvbiIsInRyYW5zZm9ybWVyIiwicmVzdWx0IiwiSlNPTiIsInN0cmluZ2lmeSIsInNvcnQiLCJyZXZlcnNlIiwiYW5zd2VyIiwidmFsIiwiJHJlbGF0aXZlVGltZSIsInBhcnNlclJlc3VsdCIsInJlbGF0aXZlVGltZVRvRGF0ZSIsInN0YXR1cyIsImxvZyIsImluZm8iLCJhcnIiLCJfIiwiZmxhdE1hcCIsInMiLCIkbmluIiwic2VhcmNoIiwiJHNlYXJjaCIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwicG9pbnQiLCIkZ2VvV2l0aGluIiwiJGNlbnRlclNwaGVyZSIsImxvbmdpdHVkZSIsImxhdGl0dWRlIiwiJG1heERpc3RhbmNlIiwiQ09NTUFORF9VTkFWQUlMQUJMRSIsImJveCIsIiRib3giLCJwb2x5Z29uIiwiY2VudGVyU3BoZXJlIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCJHZW9Qb2ludCIsIl92YWxpZGF0ZSIsIiRwb2x5Z29uIiwiZGlzdGFuY2UiLCJpc05hTiIsIiRnZW9tZXRyeSIsImFtb3VudCIsIm9iamVjdHMiLCJmbGF0dGVuIiwidG9BZGQiLCJtb25nb09wIiwiQWRkIiwiQWRkVW5pcXVlIiwiJGVhY2giLCJ0b1JlbW92ZSIsIm9iamVjdCIsIml0ZXJhdG9yIiwibmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0IiwibW9uZ29PYmplY3QiLCJfZW5jb2RlIiwiTG9uZyIsInRvTnVtYmVyIiwiRG91YmxlIiwiaXNWYWxpZERhdGFiYXNlT2JqZWN0IiwiZGF0YWJhc2VUb0pTT04iLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0b0pTT04iLCJ0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nIiwicG9pbnRlclN0cmluZyIsIm9iakRhdGEiLCJzcGxpdCIsIm1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJ3YXJuIiwibmV3S2V5Iiwic3Vic3RyaW5nIiwicmVsYXRpb25GaWVsZE5hbWVzIiwiZmlsdGVyIiwicmVsYXRpb25GaWVsZHMiLCJyZWxhdGlvbkZpZWxkTmFtZSIsImpzb24iLCJiYXNlNjRQYXR0ZXJuIiwiaXNCYXNlNjRWYWx1ZSIsInRlc3QiLCJidWZmZXIiLCJiYXNlNjQiLCJCaW5hcnkiLCJCdWZmZXIiLCJmcm9tIiwiY29vcmRzIiwiY29vcmQiLCJwYXJzZUZsb2F0IiwicHVzaCIsInVuaXF1ZSIsIml0ZW0iLCJpbmRleCIsImFyIiwiZm91bmRJbmRleCIsInB0IiwibmFtZSIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1RyYW5zZm9ybS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbG9nIGZyb20gJy4uLy4uLy4uL2xvZ2dlcic7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xudmFyIG1vbmdvZGIgPSByZXF1aXJlKCdtb25nb2RiJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4uLy4uLy4uL1V0aWxzJyk7XG5cbmNvbnN0IHRyYW5zZm9ybUtleSA9IChjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSA9PiB7XG4gIC8vIENoZWNrIGlmIHRoZSBzY2hlbWEgaXMga25vd24gc2luY2UgaXQncyBhIGJ1aWx0LWluIGZpZWxkLlxuICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xuICAgIGNhc2UgJ29iamVjdElkJzpcbiAgICAgIHJldHVybiAnX2lkJztcbiAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgICAgcmV0dXJuICdfY3JlYXRlZF9hdCc7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgIHJldHVybiAnX3VwZGF0ZWRfYXQnO1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgICByZXR1cm4gJ19zZXNzaW9uX3Rva2VuJztcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICByZXR1cm4gJ19sYXN0X3VzZWQnO1xuICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgICByZXR1cm4gJ3RpbWVzX3VzZWQnO1xuICB9XG5cbiAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uX190eXBlID09ICdQb2ludGVyJykge1xuICAgIGZpZWxkTmFtZSA9ICdfcF8nICsgZmllbGROYW1lO1xuICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICBmaWVsZE5hbWUgPSAnX3BfJyArIGZpZWxkTmFtZTtcbiAgfVxuXG4gIHJldHVybiBmaWVsZE5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1LZXlWYWx1ZUZvclVwZGF0ZSA9IChjbGFzc05hbWUsIHJlc3RLZXksIHJlc3RWYWx1ZSwgcGFyc2VGb3JtYXRTY2hlbWEpID0+IHtcbiAgLy8gQ2hlY2sgaWYgdGhlIHNjaGVtYSBpcyBrbm93biBzaW5jZSBpdCdzIGEgYnVpbHQtaW4gZmllbGQuXG4gIHZhciBrZXkgPSByZXN0S2V5O1xuICB2YXIgdGltZUZpZWxkID0gZmFsc2U7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnb2JqZWN0SWQnOlxuICAgIGNhc2UgJ19pZCc6XG4gICAgICBpZiAoWydfR2xvYmFsQ29uZmlnJywgJ19HcmFwaFFMQ29uZmlnJ10uaW5jbHVkZXMoY2xhc3NOYW1lKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleToga2V5LFxuICAgICAgICAgIHZhbHVlOiBwYXJzZUludChyZXN0VmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAga2V5ID0gJ19pZCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgIGNhc2UgJ19jcmVhdGVkX2F0JzpcbiAgICAgIGtleSA9ICdfY3JlYXRlZF9hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICBjYXNlICdfdXBkYXRlZF9hdCc6XG4gICAgICBrZXkgPSAnX3VwZGF0ZWRfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgY2FzZSAnX3Nlc3Npb25fdG9rZW4nOlxuICAgICAga2V5ID0gJ19zZXNzaW9uX3Rva2VuJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgY2FzZSAnX2V4cGlyZXNBdCc6XG4gICAgICBrZXkgPSAnZXhwaXJlc0F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAga2V5ID0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgIGtleSA9ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19mYWlsZWRfbG9naW5fY291bnQnOlxuICAgICAga2V5ID0gJ19mYWlsZWRfbG9naW5fY291bnQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICBrZXkgPSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAga2V5ID0gJ19wYXNzd29yZF9jaGFuZ2VkX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgICByZXR1cm4geyBrZXk6IGtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICBjYXNlICdfbGFzdF91c2VkJzpcbiAgICAgIGtleSA9ICdfbGFzdF91c2VkJztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgIGNhc2UgJ3RpbWVzX3VzZWQnOlxuICAgICAga2V5ID0gJ3RpbWVzX3VzZWQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICB9XG5cbiAgaWYgKFxuICAgIChwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XSAmJiBwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnUG9pbnRlcicpIHx8XG4gICAgKCFrZXkuaW5jbHVkZXMoJy4nKSAmJlxuICAgICAgIXBhcnNlRm9ybWF0U2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICByZXN0VmFsdWUgJiZcbiAgICAgIHJlc3RWYWx1ZS5fX3R5cGUgPT0gJ1BvaW50ZXInKSAvLyBEbyBub3QgdXNlIHRoZSBfcF8gcHJlZml4IGZvciBwb2ludGVycyBpbnNpZGUgbmVzdGVkIGRvY3VtZW50c1xuICApIHtcbiAgICBrZXkgPSAnX3BfJyArIGtleTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIHZhciB2YWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICBpZiAodmFsdWUgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIGlmICh0aW1lRmllbGQgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgdmFsdWUgPSBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgfVxuICAgIGlmIChyZXN0S2V5LmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIH1cbiAgICByZXR1cm4geyBrZXksIHZhbHVlIH07XG4gIH1cblxuICAvLyBIYW5kbGUgYXJyYXlzXG4gIGlmIChyZXN0VmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhbHVlID0gcmVzdFZhbHVlLm1hcCh0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlIH07XG4gIH1cblxuICAvLyBIYW5kbGUgdXBkYXRlIG9wZXJhdG9yc1xuICBpZiAodHlwZW9mIHJlc3RWYWx1ZSA9PT0gJ29iamVjdCcgJiYgJ19fb3AnIGluIHJlc3RWYWx1ZSkge1xuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yKHJlc3RWYWx1ZSwgZmFsc2UpIH07XG4gIH1cblxuICAvLyBIYW5kbGUgbm9ybWFsIG9iamVjdHMgYnkgcmVjdXJzaW5nXG4gIHZhbHVlID0gbWFwVmFsdWVzKHJlc3RWYWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbn07XG5cbmNvbnN0IGlzUmVnZXggPSB2YWx1ZSA9PiB7XG4gIHJldHVybiB2YWx1ZSAmJiB2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cDtcbn07XG5cbmNvbnN0IGlzU3RhcnRzV2l0aFJlZ2V4ID0gdmFsdWUgPT4ge1xuICBpZiAoIWlzUmVnZXgodmFsdWUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLnRvU3RyaW5nKCkubWF0Y2goL1xcL1xcXlxcXFxRLipcXFxcRVxcLy8pO1xuICByZXR1cm4gISFtYXRjaGVzO1xufTtcblxuY29uc3QgaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSA9IHZhbHVlcyA9PiB7XG4gIGlmICghdmFsdWVzIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RWYWx1ZXNJc1JlZ2V4ID0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzWzBdKTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmNvbnN0IGlzQW55VmFsdWVSZWdleCA9IHZhbHVlcyA9PiB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gaXNSZWdleCh2YWx1ZSk7XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSA9IHJlc3RWYWx1ZSA9PiB7XG4gIGlmIChcbiAgICByZXN0VmFsdWUgIT09IG51bGwgJiZcbiAgICB0eXBlb2YgcmVzdFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgIE9iamVjdC5rZXlzKHJlc3RWYWx1ZSkuc29tZShrZXkgPT4ga2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICk7XG4gIH1cbiAgLy8gSGFuZGxlIGF0b21pYyB2YWx1ZXNcbiAgdmFyIHZhbHVlID0gdHJhbnNmb3JtSW50ZXJpb3JBdG9tKHJlc3RWYWx1ZSk7XG4gIGlmICh2YWx1ZSAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgaWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgfVxuICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdmFsdWUgPSB2YWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZSA9IG1hcFZhbHVlcyh2YWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhcnJheXNcbiAgaWYgKHJlc3RWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIHJlc3RWYWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gIH1cblxuICAvLyBIYW5kbGUgdXBkYXRlIG9wZXJhdG9yc1xuICBpZiAodHlwZW9mIHJlc3RWYWx1ZSA9PT0gJ29iamVjdCcgJiYgJ19fb3AnIGluIHJlc3RWYWx1ZSkge1xuICAgIHJldHVybiB0cmFuc2Zvcm1VcGRhdGVPcGVyYXRvcihyZXN0VmFsdWUsIHRydWUpO1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICByZXR1cm4gbWFwVmFsdWVzKHJlc3RWYWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG59O1xuXG5jb25zdCB2YWx1ZUFzRGF0ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gbmV3IERhdGUodmFsdWUpO1xuICB9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1RdWVyeUtleVZhbHVlKGNsYXNzTmFtZSwga2V5LCB2YWx1ZSwgc2NoZW1hLCBjb3VudCA9IGZhbHNlKSB7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnY3JlYXRlZEF0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX2NyZWF0ZWRfYXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX2NyZWF0ZWRfYXQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX3VwZGF0ZWRfYXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX3VwZGF0ZWRfYXQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnZXhwaXJlc0F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdvYmplY3RJZCc6IHtcbiAgICAgIGlmIChbJ19HbG9iYWxDb25maWcnLCAnX0dyYXBoUUxDb25maWcnXS5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgIHZhbHVlID0gcGFyc2VJbnQodmFsdWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsga2V5OiAnX2lkJywgdmFsdWUgfTtcbiAgICB9XG4gICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgICBjYXNlICdzZXNzaW9uVG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5OiAnX3Nlc3Npb25fdG9rZW4nLCB2YWx1ZSB9O1xuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleTogJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ19wYXNzd29yZF9jaGFuZ2VkX2F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3JwZXJtJzpcbiAgICBjYXNlICdfd3Blcm0nOlxuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuJzpcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuJzpcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgICBjYXNlICckb3InOlxuICAgIGNhc2UgJyRhbmQnOlxuICAgIGNhc2UgJyRub3InOlxuICAgICAgcmV0dXJuIHtcbiAgICAgICAga2V5OiBrZXksXG4gICAgICAgIHZhbHVlOiB2YWx1ZS5tYXAoc3ViUXVlcnkgPT4gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBzdWJRdWVyeSwgc2NoZW1hLCBjb3VudCkpLFxuICAgICAgfTtcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ19sYXN0X3VzZWQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX2xhc3RfdXNlZCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgICAgcmV0dXJuIHsga2V5OiAndGltZXNfdXNlZCcsIHZhbHVlOiB2YWx1ZSB9O1xuICAgIGRlZmF1bHQ6IHtcbiAgICAgIC8vIE90aGVyIGF1dGggZGF0YVxuICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGtleS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICBjb25zdCBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIC8vIFNwZWNpYWwtY2FzZSBhdXRoIGRhdGEuXG4gICAgICAgIHJldHVybiB7IGtleTogYF9hdXRoX2RhdGFfJHtwcm92aWRlcn0uaWRgLCB2YWx1ZSB9O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGV4cGVjdGVkVHlwZUlzQXJyYXkgPSBzY2hlbWEgJiYgc2NoZW1hLmZpZWxkc1trZXldICYmIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnQXJyYXknO1xuXG4gIGNvbnN0IGV4cGVjdGVkVHlwZUlzUG9pbnRlciA9XG4gICAgc2NoZW1hICYmIHNjaGVtYS5maWVsZHNba2V5XSAmJiBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuXG4gIGNvbnN0IGZpZWxkID0gc2NoZW1hICYmIHNjaGVtYS5maWVsZHNba2V5XTtcbiAgaWYgKFxuICAgIGV4cGVjdGVkVHlwZUlzUG9pbnRlciB8fFxuICAgICghc2NoZW1hICYmICFrZXkuaW5jbHVkZXMoJy4nKSAmJiB2YWx1ZSAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJylcbiAgKSB7XG4gICAga2V5ID0gJ19wXycgKyBrZXk7XG4gIH1cblxuICAvLyBIYW5kbGUgcXVlcnkgY29uc3RyYWludHNcbiAgY29uc3QgdHJhbnNmb3JtZWRDb25zdHJhaW50ID0gdHJhbnNmb3JtQ29uc3RyYWludCh2YWx1ZSwgZmllbGQsIGNvdW50KTtcbiAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludCAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludC4kdGV4dCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJHRleHQnLCB2YWx1ZTogdHJhbnNmb3JtZWRDb25zdHJhaW50LiR0ZXh0IH07XG4gICAgfVxuICAgIGlmICh0cmFuc2Zvcm1lZENvbnN0cmFpbnQuJGVsZW1NYXRjaCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJG5vcicsIHZhbHVlOiBbeyBba2V5XTogdHJhbnNmb3JtZWRDb25zdHJhaW50IH1dIH07XG4gICAgfVxuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHRyYW5zZm9ybWVkQ29uc3RyYWludCB9O1xuICB9XG5cbiAgaWYgKGV4cGVjdGVkVHlwZUlzQXJyYXkgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHsgJGFsbDogW3RyYW5zZm9ybUludGVyaW9yQXRvbSh2YWx1ZSldIH0gfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIGNvbnN0IHRyYW5zZm9ybVJlcyA9IGtleS5pbmNsdWRlcygnLicpXG4gICAgPyB0cmFuc2Zvcm1JbnRlcmlvckF0b20odmFsdWUpXG4gICAgOiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20odmFsdWUpO1xuICBpZiAodHJhbnNmb3JtUmVzICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB0cmFuc2Zvcm1SZXMgfTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgWW91IGNhbm5vdCB1c2UgJHt2YWx1ZX0gYXMgYSBxdWVyeSBwYXJhbWV0ZXIuYFxuICAgICk7XG4gIH1cbn1cblxuLy8gTWFpbiBleHBvc2VkIG1ldGhvZCB0byBoZWxwIHJ1biBxdWVyaWVzLlxuLy8gcmVzdFdoZXJlIGlzIHRoZSBcIndoZXJlXCIgY2xhdXNlIGluIFJFU1QgQVBJIGZvcm0uXG4vLyBSZXR1cm5zIHRoZSBtb25nbyBmb3JtIG9mIHRoZSBxdWVyeS5cbmZ1bmN0aW9uIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcmVzdFdoZXJlLCBzY2hlbWEsIGNvdW50ID0gZmFsc2UpIHtcbiAgY29uc3QgbW9uZ29XaGVyZSA9IHt9O1xuICBmb3IgKGNvbnN0IHJlc3RLZXkgaW4gcmVzdFdoZXJlKSB7XG4gICAgY29uc3Qgb3V0ID0gdHJhbnNmb3JtUXVlcnlLZXlWYWx1ZShjbGFzc05hbWUsIHJlc3RLZXksIHJlc3RXaGVyZVtyZXN0S2V5XSwgc2NoZW1hLCBjb3VudCk7XG4gICAgbW9uZ29XaGVyZVtvdXQua2V5XSA9IG91dC52YWx1ZTtcbiAgfVxuICByZXR1cm4gbW9uZ29XaGVyZTtcbn1cblxuY29uc3QgcGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZSA9IChyZXN0S2V5LCByZXN0VmFsdWUsIHNjaGVtYSkgPT4ge1xuICAvLyBDaGVjayBpZiB0aGUgc2NoZW1hIGlzIGtub3duIHNpbmNlIGl0J3MgYSBidWlsdC1pbiBmaWVsZC5cbiAgbGV0IHRyYW5zZm9ybWVkVmFsdWU7XG4gIGxldCBjb2VyY2VkVG9EYXRlO1xuICBzd2l0Y2ggKHJlc3RLZXkpIHtcbiAgICBjYXNlICdvYmplY3RJZCc6XG4gICAgICByZXR1cm4geyBrZXk6ICdfaWQnLCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKSA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdleHBpcmVzQXQnLCB2YWx1ZTogY29lcmNlZFRvRGF0ZSB9O1xuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSkgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSkgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19wYXNzd29yZF9jaGFuZ2VkX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbic6XG4gICAgY2FzZSAnX2hhc2hlZF9wYXNzd29yZCc6XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgY2FzZSAnc2Vzc2lvblRva2VuJzpcbiAgICAgIHJldHVybiB7IGtleTogJ19zZXNzaW9uX3Rva2VuJywgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBBdXRoIGRhdGEgc2hvdWxkIGhhdmUgYmVlbiB0cmFuc2Zvcm1lZCBhbHJlYWR5XG4gICAgICBpZiAocmVzdEtleS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdjYW4gb25seSBxdWVyeSBvbiAnICsgcmVzdEtleSk7XG4gICAgICB9XG4gICAgICAvLyBUcnVzdCB0aGF0IHRoZSBhdXRoIGRhdGEgaGFzIGJlZW4gdHJhbnNmb3JtZWQgYW5kIHNhdmUgaXQgZGlyZWN0bHlcbiAgICAgIGlmIChyZXN0S2V5Lm1hdGNoKC9eX2F1dGhfZGF0YV9bYS16QS1aMC05X10rJC8pKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgICAgfVxuICB9XG4gIC8vc2tpcCBzdHJhaWdodCB0byB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20gZm9yIEJ5dGVzLCB0aGV5IGRvbid0IHNob3cgdXAgaW4gdGhlIHNjaGVtYSBmb3Igc29tZSByZWFzb25cbiAgaWYgKHJlc3RWYWx1ZSAmJiByZXN0VmFsdWUuX190eXBlICE9PSAnQnl0ZXMnKSB7XG4gICAgLy9Ob3RlOiBXZSBtYXkgbm90IGtub3cgdGhlIHR5cGUgb2YgYSBmaWVsZCBoZXJlLCBhcyB0aGUgdXNlciBjb3VsZCBiZSBzYXZpbmcgKG51bGwpIHRvIGEgZmllbGRcbiAgICAvL1RoYXQgbmV2ZXIgZXhpc3RlZCBiZWZvcmUsIG1lYW5pbmcgd2UgY2FuJ3QgaW5mZXIgdGhlIHR5cGUuXG4gICAgaWYgKFxuICAgICAgKHNjaGVtYS5maWVsZHNbcmVzdEtleV0gJiYgc2NoZW1hLmZpZWxkc1tyZXN0S2V5XS50eXBlID09ICdQb2ludGVyJykgfHxcbiAgICAgIHJlc3RWYWx1ZS5fX3R5cGUgPT0gJ1BvaW50ZXInXG4gICAgKSB7XG4gICAgICByZXN0S2V5ID0gJ19wXycgKyByZXN0S2V5O1xuICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIHZhciB2YWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICBpZiAodmFsdWUgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHZhbHVlIH07XG4gIH1cblxuICAvLyBBQ0xzIGFyZSBoYW5kbGVkIGJlZm9yZSB0aGlzIG1ldGhvZCBpcyBjYWxsZWRcbiAgLy8gSWYgYW4gQUNMIGtleSBzdGlsbCBleGlzdHMgaGVyZSwgc29tZXRoaW5nIGlzIHdyb25nLlxuICBpZiAocmVzdEtleSA9PT0gJ0FDTCcpIHtcbiAgICB0aHJvdyAnVGhlcmUgd2FzIGEgcHJvYmxlbSB0cmFuc2Zvcm1pbmcgYW4gQUNMLic7XG4gIH1cblxuICAvLyBIYW5kbGUgYXJyYXlzXG4gIGlmIChyZXN0VmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhbHVlID0gcmVzdFZhbHVlLm1hcCh0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlOiB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICBpZiAoT2JqZWN0LmtleXMocmVzdFZhbHVlKS5zb21lKGtleSA9PiBrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICApO1xuICB9XG4gIHZhbHVlID0gbWFwVmFsdWVzKHJlc3RWYWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWUgfTtcbn07XG5cbmNvbnN0IHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSA9IChjbGFzc05hbWUsIHJlc3RDcmVhdGUsIHNjaGVtYSkgPT4ge1xuICByZXN0Q3JlYXRlID0gYWRkTGVnYWN5QUNMKHJlc3RDcmVhdGUpO1xuICBjb25zdCBtb25nb0NyZWF0ZSA9IHt9O1xuICBmb3IgKGNvbnN0IHJlc3RLZXkgaW4gcmVzdENyZWF0ZSkge1xuICAgIGlmIChyZXN0Q3JlYXRlW3Jlc3RLZXldICYmIHJlc3RDcmVhdGVbcmVzdEtleV0uX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgeyBrZXksIHZhbHVlIH0gPSBwYXJzZU9iamVjdEtleVZhbHVlVG9Nb25nb09iamVjdEtleVZhbHVlKFxuICAgICAgcmVzdEtleSxcbiAgICAgIHJlc3RDcmVhdGVbcmVzdEtleV0sXG4gICAgICBzY2hlbWFcbiAgICApO1xuICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBtb25nb0NyZWF0ZVtrZXldID0gdmFsdWU7XG4gICAgfVxuICB9XG5cbiAgLy8gVXNlIHRoZSBsZWdhY3kgbW9uZ28gZm9ybWF0IGZvciBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdFxuICBpZiAobW9uZ29DcmVhdGUuY3JlYXRlZEF0KSB7XG4gICAgbW9uZ29DcmVhdGUuX2NyZWF0ZWRfYXQgPSBuZXcgRGF0ZShtb25nb0NyZWF0ZS5jcmVhdGVkQXQuaXNvIHx8IG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdCk7XG4gICAgZGVsZXRlIG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdDtcbiAgfVxuICBpZiAobW9uZ29DcmVhdGUudXBkYXRlZEF0KSB7XG4gICAgbW9uZ29DcmVhdGUuX3VwZGF0ZWRfYXQgPSBuZXcgRGF0ZShtb25nb0NyZWF0ZS51cGRhdGVkQXQuaXNvIHx8IG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdCk7XG4gICAgZGVsZXRlIG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdDtcbiAgfVxuXG4gIHJldHVybiBtb25nb0NyZWF0ZTtcbn07XG5cbi8vIE1haW4gZXhwb3NlZCBtZXRob2QgdG8gaGVscCB1cGRhdGUgb2xkIG9iamVjdHMuXG5jb25zdCB0cmFuc2Zvcm1VcGRhdGUgPSAoY2xhc3NOYW1lLCByZXN0VXBkYXRlLCBwYXJzZUZvcm1hdFNjaGVtYSkgPT4ge1xuICBjb25zdCBtb25nb1VwZGF0ZSA9IHt9O1xuICBjb25zdCBhY2wgPSBhZGRMZWdhY3lBQ0wocmVzdFVwZGF0ZSk7XG4gIGlmIChhY2wuX3JwZXJtIHx8IGFjbC5fd3Blcm0gfHwgYWNsLl9hY2wpIHtcbiAgICBtb25nb1VwZGF0ZS4kc2V0ID0ge307XG4gICAgaWYgKGFjbC5fcnBlcm0pIHtcbiAgICAgIG1vbmdvVXBkYXRlLiRzZXQuX3JwZXJtID0gYWNsLl9ycGVybTtcbiAgICB9XG4gICAgaWYgKGFjbC5fd3Blcm0pIHtcbiAgICAgIG1vbmdvVXBkYXRlLiRzZXQuX3dwZXJtID0gYWNsLl93cGVybTtcbiAgICB9XG4gICAgaWYgKGFjbC5fYWNsKSB7XG4gICAgICBtb25nb1VwZGF0ZS4kc2V0Ll9hY2wgPSBhY2wuX2FjbDtcbiAgICB9XG4gIH1cbiAgZm9yICh2YXIgcmVzdEtleSBpbiByZXN0VXBkYXRlKSB7XG4gICAgaWYgKHJlc3RVcGRhdGVbcmVzdEtleV0gJiYgcmVzdFVwZGF0ZVtyZXN0S2V5XS5fX3R5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICB2YXIgb3V0ID0gdHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICByZXN0S2V5LFxuICAgICAgcmVzdFVwZGF0ZVtyZXN0S2V5XSxcbiAgICAgIHBhcnNlRm9ybWF0U2NoZW1hXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvdXRwdXQgdmFsdWUgaXMgYW4gb2JqZWN0IHdpdGggYW55ICQga2V5cywgaXQncyBhblxuICAgIC8vIG9wZXJhdG9yIHRoYXQgbmVlZHMgdG8gYmUgbGlmdGVkIG9udG8gdGhlIHRvcCBsZXZlbCB1cGRhdGVcbiAgICAvLyBvYmplY3QuXG4gICAgaWYgKHR5cGVvZiBvdXQudmFsdWUgPT09ICdvYmplY3QnICYmIG91dC52YWx1ZSAhPT0gbnVsbCAmJiBvdXQudmFsdWUuX19vcCkge1xuICAgICAgbW9uZ29VcGRhdGVbb3V0LnZhbHVlLl9fb3BdID0gbW9uZ29VcGRhdGVbb3V0LnZhbHVlLl9fb3BdIHx8IHt9O1xuICAgICAgbW9uZ29VcGRhdGVbb3V0LnZhbHVlLl9fb3BdW291dC5rZXldID0gb3V0LnZhbHVlLmFyZztcbiAgICB9IGVsc2Uge1xuICAgICAgbW9uZ29VcGRhdGVbJyRzZXQnXSA9IG1vbmdvVXBkYXRlWyckc2V0J10gfHwge307XG4gICAgICBtb25nb1VwZGF0ZVsnJHNldCddW291dC5rZXldID0gb3V0LnZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtb25nb1VwZGF0ZTtcbn07XG5cbi8vIEFkZCB0aGUgbGVnYWN5IF9hY2wgZm9ybWF0LlxuY29uc3QgYWRkTGVnYWN5QUNMID0gcmVzdE9iamVjdCA9PiB7XG4gIGNvbnN0IHJlc3RPYmplY3RDb3B5ID0geyAuLi5yZXN0T2JqZWN0IH07XG4gIGNvbnN0IF9hY2wgPSB7fTtcblxuICBpZiAocmVzdE9iamVjdC5fd3Blcm0pIHtcbiAgICByZXN0T2JqZWN0Ll93cGVybS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIF9hY2xbZW50cnldID0geyB3OiB0cnVlIH07XG4gICAgfSk7XG4gICAgcmVzdE9iamVjdENvcHkuX2FjbCA9IF9hY2w7XG4gIH1cblxuICBpZiAocmVzdE9iamVjdC5fcnBlcm0pIHtcbiAgICByZXN0T2JqZWN0Ll9ycGVybS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghKGVudHJ5IGluIF9hY2wpKSB7XG4gICAgICAgIF9hY2xbZW50cnldID0geyByOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBfYWNsW2VudHJ5XS5yID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXN0T2JqZWN0Q29weS5fYWNsID0gX2FjbDtcbiAgfVxuXG4gIHJldHVybiByZXN0T2JqZWN0Q29weTtcbn07XG5cbi8vIEEgc2VudGluZWwgdmFsdWUgdGhhdCBoZWxwZXIgdHJhbnNmb3JtYXRpb25zIHJldHVybiB3aGVuIHRoZXlcbi8vIGNhbm5vdCBwZXJmb3JtIGEgdHJhbnNmb3JtYXRpb25cbmZ1bmN0aW9uIENhbm5vdFRyYW5zZm9ybSgpIHt9XG5cbmNvbnN0IHRyYW5zZm9ybUludGVyaW9yQXRvbSA9IGF0b20gPT4ge1xuICAvLyBUT0RPOiBjaGVjayB2YWxpZGl0eSBoYXJkZXIgZm9yIHRoZSBfX3R5cGUtZGVmaW5lZCB0eXBlc1xuICBpZiAodHlwZW9mIGF0b20gPT09ICdvYmplY3QnICYmIGF0b20gJiYgIShhdG9tIGluc3RhbmNlb2YgRGF0ZSkgJiYgYXRvbS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogYXRvbS5jbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogYXRvbS5vYmplY3RJZCxcbiAgICB9O1xuICB9IGVsc2UgaWYgKHR5cGVvZiBhdG9tID09PSAnZnVuY3Rpb24nIHx8IHR5cGVvZiBhdG9tID09PSAnc3ltYm9sJykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBjYW5ub3QgdHJhbnNmb3JtIHZhbHVlOiAke2F0b219YCk7XG4gIH0gZWxzZSBpZiAoRGF0ZUNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgcmV0dXJuIERhdGVDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgfSBlbHNlIGlmIChCeXRlc0NvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgcmV0dXJuIEJ5dGVzQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGF0b20gPT09ICdvYmplY3QnICYmIGF0b20gJiYgYXRvbS4kcmVnZXggIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBuZXcgUmVnRXhwKGF0b20uJHJlZ2V4KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYXRvbTtcbiAgfVxufTtcblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIHRyYW5zZm9ybSBhbiBhdG9tIGZyb20gUkVTVCBmb3JtYXQgdG8gTW9uZ28gZm9ybWF0LlxuLy8gQW4gYXRvbSBpcyBhbnl0aGluZyB0aGF0IGNhbid0IGNvbnRhaW4gb3RoZXIgZXhwcmVzc2lvbnMuIFNvIGl0XG4vLyBpbmNsdWRlcyB0aGluZ3Mgd2hlcmUgb2JqZWN0cyBhcmUgdXNlZCB0byByZXByZXNlbnQgb3RoZXJcbi8vIGRhdGF0eXBlcywgbGlrZSBwb2ludGVycyBhbmQgZGF0ZXMsIGJ1dCBpdCBkb2VzIG5vdCBpbmNsdWRlIG9iamVjdHNcbi8vIG9yIGFycmF5cyB3aXRoIGdlbmVyaWMgc3R1ZmYgaW5zaWRlLlxuLy8gUmFpc2VzIGFuIGVycm9yIGlmIHRoaXMgY2Fubm90IHBvc3NpYmx5IGJlIHZhbGlkIFJFU1QgZm9ybWF0LlxuLy8gUmV0dXJucyBDYW5ub3RUcmFuc2Zvcm0gaWYgaXQncyBqdXN0IG5vdCBhbiBhdG9tXG5mdW5jdGlvbiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20oYXRvbSwgZmllbGQpIHtcbiAgc3dpdGNoICh0eXBlb2YgYXRvbSkge1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHJldHVybiBhdG9tO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJHtmaWVsZC50YXJnZXRDbGFzc30kJHthdG9tfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYXRvbTtcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBjYW5ub3QgdHJhbnNmb3JtIHZhbHVlOiAke2F0b219YCk7XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChhdG9tIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAvLyBUZWNobmljYWxseSBkYXRlcyBhcmUgbm90IHJlc3QgZm9ybWF0LCBidXQsIGl0IHNlZW1zIHByZXR0eVxuICAgICAgICAvLyBjbGVhciB3aGF0IHRoZXkgc2hvdWxkIGJlIHRyYW5zZm9ybWVkIHRvLCBzbyBsZXQncyBqdXN0IGRvIGl0LlxuICAgICAgICByZXR1cm4gYXRvbTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF0b20gPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIGF0b207XG4gICAgICB9XG5cbiAgICAgIC8vIFRPRE86IGNoZWNrIHZhbGlkaXR5IGhhcmRlciBmb3IgdGhlIF9fdHlwZS1kZWZpbmVkIHR5cGVzXG4gICAgICBpZiAoYXRvbS5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJHthdG9tLmNsYXNzTmFtZX0kJHthdG9tLm9iamVjdElkfWA7XG4gICAgICB9XG4gICAgICBpZiAoRGF0ZUNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBEYXRlQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gQnl0ZXNDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIGlmIChHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBHZW9Qb2ludENvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKFBvbHlnb25Db2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gUG9seWdvbkNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKEZpbGVDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gRmlsZUNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIENhbm5vdFRyYW5zZm9ybTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBJIGRvbid0IHRoaW5rIHR5cGVvZiBjYW4gZXZlciBsZXQgdXMgZ2V0IGhlcmVcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICBgcmVhbGx5IGRpZCBub3QgZXhwZWN0IHZhbHVlOiAke2F0b219YFxuICAgICAgKTtcbiAgfVxufVxuXG4vLyBUcmFuc2Zvcm1zIGEgcXVlcnkgY29uc3RyYWludCBmcm9tIFJFU1QgQVBJIGZvcm1hdCB0byBNb25nbyBmb3JtYXQuXG4vLyBBIGNvbnN0cmFpbnQgaXMgc29tZXRoaW5nIHdpdGggZmllbGRzIGxpa2UgJGx0LlxuLy8gSWYgaXQgaXMgbm90IGEgdmFsaWQgY29uc3RyYWludCBidXQgaXQgY291bGQgYmUgYSB2YWxpZCBzb21ldGhpbmdcbi8vIGVsc2UsIHJldHVybiBDYW5ub3RUcmFuc2Zvcm0uXG4vLyBpbkFycmF5IGlzIHdoZXRoZXIgdGhpcyBpcyBhbiBhcnJheSBmaWVsZC5cbmZ1bmN0aW9uIHRyYW5zZm9ybUNvbnN0cmFpbnQoY29uc3RyYWludCwgZmllbGQsIGNvdW50ID0gZmFsc2UpIHtcbiAgY29uc3QgaW5BcnJheSA9IGZpZWxkICYmIGZpZWxkLnR5cGUgJiYgZmllbGQudHlwZSA9PT0gJ0FycmF5JztcbiAgaWYgKHR5cGVvZiBjb25zdHJhaW50ICE9PSAnb2JqZWN0JyB8fCAhY29uc3RyYWludCkge1xuICAgIHJldHVybiBDYW5ub3RUcmFuc2Zvcm07XG4gIH1cbiAgY29uc3QgdHJhbnNmb3JtRnVuY3Rpb24gPSBpbkFycmF5ID8gdHJhbnNmb3JtSW50ZXJpb3JBdG9tIDogdHJhbnNmb3JtVG9wTGV2ZWxBdG9tO1xuICBjb25zdCB0cmFuc2Zvcm1lciA9IGF0b20gPT4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IHRyYW5zZm9ybUZ1bmN0aW9uKGF0b20sIGZpZWxkKTtcbiAgICBpZiAocmVzdWx0ID09PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgYXRvbTogJHtKU09OLnN0cmluZ2lmeShhdG9tKX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcbiAgLy8ga2V5cyBpcyB0aGUgY29uc3RyYWludHMgaW4gcmV2ZXJzZSBhbHBoYWJldGljYWwgb3JkZXIuXG4gIC8vIFRoaXMgaXMgYSBoYWNrIHNvIHRoYXQ6XG4gIC8vICAgJHJlZ2V4IGlzIGhhbmRsZWQgYmVmb3JlICRvcHRpb25zXG4gIC8vICAgJG5lYXJTcGhlcmUgaXMgaGFuZGxlZCBiZWZvcmUgJG1heERpc3RhbmNlXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoY29uc3RyYWludCkuc29ydCgpLnJldmVyc2UoKTtcbiAgdmFyIGFuc3dlciA9IHt9O1xuICBmb3IgKHZhciBrZXkgb2Yga2V5cykge1xuICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICBjYXNlICckbHQnOlxuICAgICAgY2FzZSAnJGx0ZSc6XG4gICAgICBjYXNlICckZ3QnOlxuICAgICAgY2FzZSAnJGd0ZSc6XG4gICAgICBjYXNlICckZXhpc3RzJzpcbiAgICAgIGNhc2UgJyRuZSc6XG4gICAgICBjYXNlICckZXEnOiB7XG4gICAgICAgIGNvbnN0IHZhbCA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgaWYgKHZhbCAmJiB0eXBlb2YgdmFsID09PSAnb2JqZWN0JyAmJiB2YWwuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgIGlmIChmaWVsZCAmJiBmaWVsZC50eXBlICE9PSAnRGF0ZScpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggRGF0ZSBmaWVsZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc3dpdGNoIChrZXkpIHtcbiAgICAgICAgICAgIGNhc2UgJyRleGlzdHMnOlxuICAgICAgICAgICAgY2FzZSAnJG5lJzpcbiAgICAgICAgICAgIGNhc2UgJyRlcSc6XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHBhcnNlclJlc3VsdCA9IFV0aWxzLnJlbGF0aXZlVGltZVRvRGF0ZSh2YWwuJHJlbGF0aXZlVGltZSk7XG4gICAgICAgICAgaWYgKHBhcnNlclJlc3VsdC5zdGF0dXMgPT09ICdzdWNjZXNzJykge1xuICAgICAgICAgICAgYW5zd2VyW2tleV0gPSBwYXJzZXJSZXN1bHQucmVzdWx0O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbG9nLmluZm8oJ0Vycm9yIHdoaWxlIHBhcnNpbmcgcmVsYXRpdmUgZGF0ZScsIHBhcnNlclJlc3VsdCk7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYGJhZCAkcmVsYXRpdmVUaW1lICgke2tleX0pIHZhbHVlLiAke3BhcnNlclJlc3VsdC5pbmZvfWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgYW5zd2VyW2tleV0gPSB0cmFuc2Zvcm1lcih2YWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgY2FzZSAnJGluJzpcbiAgICAgIGNhc2UgJyRuaW4nOiB7XG4gICAgICAgIGNvbnN0IGFyciA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgaWYgKCEoYXJyIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAnICsga2V5ICsgJyB2YWx1ZScpO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0gXy5mbGF0TWFwKGFyciwgdmFsdWUgPT4ge1xuICAgICAgICAgIHJldHVybiAoYXRvbSA9PiB7XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShhdG9tKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdmFsdWUubWFwKHRyYW5zZm9ybWVyKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiB0cmFuc2Zvcm1lcihhdG9tKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KSh2YWx1ZSk7XG4gICAgICAgIH0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRhbGwnOiB7XG4gICAgICAgIGNvbnN0IGFyciA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgaWYgKCEoYXJyIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAnICsga2V5ICsgJyB2YWx1ZScpO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0gYXJyLm1hcCh0cmFuc2Zvcm1JbnRlcmlvckF0b20pO1xuXG4gICAgICAgIGNvbnN0IHZhbHVlcyA9IGFuc3dlcltrZXldO1xuICAgICAgICBpZiAoaXNBbnlWYWx1ZVJlZ2V4KHZhbHVlcykgJiYgIWlzQWxsVmFsdWVzUmVnZXhPck5vbmUodmFsdWVzKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdBbGwgJGFsbCB2YWx1ZXMgbXVzdCBiZSBvZiByZWdleCB0eXBlIG9yIG5vbmU6ICcgKyB2YWx1ZXNcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckcmVnZXgnOlxuICAgICAgICB2YXIgcyA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgaWYgKHR5cGVvZiBzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgcmVnZXg6ICcgKyBzKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IHM7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICckY29udGFpbmVkQnknOiB7XG4gICAgICAgIGNvbnN0IGFyciA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgaWYgKCEoYXJyIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkY29udGFpbmVkQnk6IHNob3VsZCBiZSBhbiBhcnJheWApO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlci4kZWxlbU1hdGNoID0ge1xuICAgICAgICAgICRuaW46IGFyci5tYXAodHJhbnNmb3JtZXIpLFxuICAgICAgICB9O1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRvcHRpb25zJzpcbiAgICAgICAgYW5zd2VyW2tleV0gPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICckdGV4dCc6IHtcbiAgICAgICAgY29uc3Qgc2VhcmNoID0gY29uc3RyYWludFtrZXldLiRzZWFyY2g7XG4gICAgICAgIGlmICh0eXBlb2Ygc2VhcmNoICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRzZWFyY2gsIHNob3VsZCBiZSBvYmplY3RgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXNlYXJjaC4kdGVybSB8fCB0eXBlb2Ygc2VhcmNoLiR0ZXJtICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICR0ZXJtLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgICAkc2VhcmNoOiBzZWFyY2guJHRlcm0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2VhcmNoLiRsYW5ndWFnZSAmJiB0eXBlb2Ygc2VhcmNoLiRsYW5ndWFnZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkbGFuZ3VhZ2UsIHNob3VsZCBiZSBzdHJpbmdgKTtcbiAgICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGxhbmd1YWdlKSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0uJGxhbmd1YWdlID0gc2VhcmNoLiRsYW5ndWFnZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICYmIHR5cGVvZiBzZWFyY2guJGNhc2VTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGBiYWQgJHRleHQ6ICRjYXNlU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgIGFuc3dlcltrZXldLiRjYXNlU2Vuc2l0aXZlID0gc2VhcmNoLiRjYXNlU2Vuc2l0aXZlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGBiYWQgJHRleHQ6ICRkaWFjcml0aWNTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUpIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XS4kZGlhY3JpdGljU2Vuc2l0aXZlID0gc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmU7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckbmVhclNwaGVyZSc6IHtcbiAgICAgICAgY29uc3QgcG9pbnQgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmIChjb3VudCkge1xuICAgICAgICAgIGFuc3dlci4kZ2VvV2l0aGluID0ge1xuICAgICAgICAgICAgJGNlbnRlclNwaGVyZTogW1twb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXSwgY29uc3RyYWludC4kbWF4RGlzdGFuY2VdLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0gPSBbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckbWF4RGlzdGFuY2UnOiB7XG4gICAgICAgIGlmIChjb3VudCkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIC8vIFRoZSBTREtzIGRvbid0IHNlZW0gdG8gdXNlIHRoZXNlIGJ1dCB0aGV5IGFyZSBkb2N1bWVudGVkIGluIHRoZVxuICAgICAgLy8gUkVTVCBBUEkgZG9jcy5cbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZUluUmFkaWFucyc6XG4gICAgICAgIGFuc3dlclsnJG1heERpc3RhbmNlJ10gPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJG1heERpc3RhbmNlSW5NaWxlcyc6XG4gICAgICAgIGFuc3dlclsnJG1heERpc3RhbmNlJ10gPSBjb25zdHJhaW50W2tleV0gLyAzOTU5O1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZUluS2lsb21ldGVycyc6XG4gICAgICAgIGFuc3dlclsnJG1heERpc3RhbmNlJ10gPSBjb25zdHJhaW50W2tleV0gLyA2MzcxO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJHNlbGVjdCc6XG4gICAgICBjYXNlICckZG9udFNlbGVjdCc6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5DT01NQU5EX1VOQVZBSUxBQkxFLFxuICAgICAgICAgICd0aGUgJyArIGtleSArICcgY29uc3RyYWludCBpcyBub3Qgc3VwcG9ydGVkIHlldCdcbiAgICAgICAgKTtcblxuICAgICAgY2FzZSAnJHdpdGhpbic6XG4gICAgICAgIHZhciBib3ggPSBjb25zdHJhaW50W2tleV1bJyRib3gnXTtcbiAgICAgICAgaWYgKCFib3ggfHwgYm94Lmxlbmd0aCAhPSAyKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ21hbGZvcm1hdHRlZCAkd2l0aGluIGFyZycpO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICRib3g6IFtcbiAgICAgICAgICAgIFtib3hbMF0ubG9uZ2l0dWRlLCBib3hbMF0ubGF0aXR1ZGVdLFxuICAgICAgICAgICAgW2JveFsxXS5sb25naXR1ZGUsIGJveFsxXS5sYXRpdHVkZV0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJyRnZW9XaXRoaW4nOiB7XG4gICAgICAgIGNvbnN0IHBvbHlnb24gPSBjb25zdHJhaW50W2tleV1bJyRwb2x5Z29uJ107XG4gICAgICAgIGNvbnN0IGNlbnRlclNwaGVyZSA9IGNvbnN0cmFpbnRba2V5XVsnJGNlbnRlclNwaGVyZSddO1xuICAgICAgICBpZiAocG9seWdvbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgbGV0IHBvaW50cztcbiAgICAgICAgICBpZiAodHlwZW9mIHBvbHlnb24gPT09ICdvYmplY3QnICYmIHBvbHlnb24uX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgICAgIGlmICghcG9seWdvbi5jb29yZGluYXRlcyB8fCBwb2x5Z29uLmNvb3JkaW5hdGVzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7IFBvbHlnb24uY29vcmRpbmF0ZXMgc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBsb24vbGF0IHBhaXJzJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcG9pbnRzID0gcG9seWdvbi5jb29yZGluYXRlcztcbiAgICAgICAgICB9IGVsc2UgaWYgKHBvbHlnb24gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgICAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBHZW9Qb2ludHMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwb2ludHMgPSBwb2x5Z29uO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgXCJiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGJlIFBvbHlnb24gb2JqZWN0IG9yIEFycmF5IG9mIFBhcnNlLkdlb1BvaW50J3NcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcG9pbnRzID0gcG9pbnRzLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICAgICAgICAgIHJldHVybiBwb2ludDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICAgJHBvbHlnb246IHBvaW50cyxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2UgaWYgKGNlbnRlclNwaGVyZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaWYgKCEoY2VudGVyU3BoZXJlIGluc3RhbmNlb2YgQXJyYXkpIHx8IGNlbnRlclNwaGVyZS5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIHNob3VsZCBiZSBhbiBhcnJheSBvZiBQYXJzZS5HZW9Qb2ludCBhbmQgZGlzdGFuY2UnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBHZXQgcG9pbnQsIGNvbnZlcnQgdG8gZ2VvIHBvaW50IGlmIG5lY2Vzc2FyeSBhbmQgdmFsaWRhdGVcbiAgICAgICAgICBsZXQgcG9pbnQgPSBjZW50ZXJTcGhlcmVbMF07XG4gICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBwb2ludCA9IG5ldyBQYXJzZS5HZW9Qb2ludChwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGdlbyBwb2ludCBpbnZhbGlkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICAgIC8vIEdldCBkaXN0YW5jZSBhbmQgdmFsaWRhdGVcbiAgICAgICAgICBjb25zdCBkaXN0YW5jZSA9IGNlbnRlclNwaGVyZVsxXTtcbiAgICAgICAgICBpZiAoaXNOYU4oZGlzdGFuY2UpIHx8IGRpc3RhbmNlIDwgMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBkaXN0YW5jZSBpbnZhbGlkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgICAkY2VudGVyU3BoZXJlOiBbW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdLCBkaXN0YW5jZV0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRnZW9JbnRlcnNlY3RzJzoge1xuICAgICAgICBjb25zdCBwb2ludCA9IGNvbnN0cmFpbnRba2V5XVsnJHBvaW50J107XG4gICAgICAgIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICRnZW9JbnRlcnNlY3QgdmFsdWU7ICRwb2ludCBzaG91bGQgYmUgR2VvUG9pbnQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgJGdlb21ldHJ5OiB7XG4gICAgICAgICAgICB0eXBlOiAnUG9pbnQnLFxuICAgICAgICAgICAgY29vcmRpbmF0ZXM6IFtwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmIChrZXkubWF0Y2goL15cXCQrLykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkIGNvbnN0cmFpbnQ6ICcgKyBrZXkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBDYW5ub3RUcmFuc2Zvcm07XG4gICAgfVxuICB9XG4gIHJldHVybiBhbnN3ZXI7XG59XG5cbi8vIFRyYW5zZm9ybXMgYW4gdXBkYXRlIG9wZXJhdG9yIGZyb20gUkVTVCBmb3JtYXQgdG8gbW9uZ28gZm9ybWF0LlxuLy8gVG8gYmUgdHJhbnNmb3JtZWQsIHRoZSBpbnB1dCBzaG91bGQgaGF2ZSBhbiBfX29wIGZpZWxkLlxuLy8gSWYgZmxhdHRlbiBpcyB0cnVlLCB0aGlzIHdpbGwgZmxhdHRlbiBvcGVyYXRvcnMgdG8gdGhlaXIgc3RhdGljXG4vLyBkYXRhIGZvcm1hdC4gRm9yIGV4YW1wbGUsIGFuIGluY3JlbWVudCBvZiAyIHdvdWxkIHNpbXBseSBiZWNvbWUgYVxuLy8gMi5cbi8vIFRoZSBvdXRwdXQgZm9yIGEgbm9uLWZsYXR0ZW5lZCBvcGVyYXRvciBpcyBhIGhhc2ggd2l0aCBfX29wIGJlaW5nXG4vLyB0aGUgbW9uZ28gb3AsIGFuZCBhcmcgYmVpbmcgdGhlIGFyZ3VtZW50LlxuLy8gVGhlIG91dHB1dCBmb3IgYSBmbGF0dGVuZWQgb3BlcmF0b3IgaXMganVzdCBhIHZhbHVlLlxuLy8gUmV0dXJucyB1bmRlZmluZWQgaWYgdGhpcyBzaG91bGQgYmUgYSBuby1vcC5cblxuZnVuY3Rpb24gdHJhbnNmb3JtVXBkYXRlT3BlcmF0b3IoeyBfX29wLCBhbW91bnQsIG9iamVjdHMgfSwgZmxhdHRlbikge1xuICBzd2l0Y2ggKF9fb3ApIHtcbiAgICBjYXNlICdEZWxldGUnOlxuICAgICAgaWYgKGZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IF9fb3A6ICckdW5zZXQnLCBhcmc6ICcnIH07XG4gICAgICB9XG5cbiAgICBjYXNlICdJbmNyZW1lbnQnOlxuICAgICAgaWYgKHR5cGVvZiBhbW91bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdpbmNyZW1lbnRpbmcgbXVzdCBwcm92aWRlIGEgbnVtYmVyJyk7XG4gICAgICB9XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gYW1vdW50O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogJyRpbmMnLCBhcmc6IGFtb3VudCB9O1xuICAgICAgfVxuXG4gICAgY2FzZSAnQWRkJzpcbiAgICBjYXNlICdBZGRVbmlxdWUnOlxuICAgICAgaWYgKCEob2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgfVxuICAgICAgdmFyIHRvQWRkID0gb2JqZWN0cy5tYXAodHJhbnNmb3JtSW50ZXJpb3JBdG9tKTtcbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiB0b0FkZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBtb25nb09wID0ge1xuICAgICAgICAgIEFkZDogJyRwdXNoJyxcbiAgICAgICAgICBBZGRVbmlxdWU6ICckYWRkVG9TZXQnLFxuICAgICAgICB9W19fb3BdO1xuICAgICAgICByZXR1cm4geyBfX29wOiBtb25nb09wLCBhcmc6IHsgJGVhY2g6IHRvQWRkIH0gfTtcbiAgICAgIH1cblxuICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICBpZiAoIShvYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIHJlbW92ZSBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICB9XG4gICAgICB2YXIgdG9SZW1vdmUgPSBvYmplY3RzLm1hcCh0cmFuc2Zvcm1JbnRlcmlvckF0b20pO1xuICAgICAgaWYgKGZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogJyRwdWxsQWxsJywgYXJnOiB0b1JlbW92ZSB9O1xuICAgICAgfVxuXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgYFRoZSAke19fb3B9IG9wZXJhdG9yIGlzIG5vdCBzdXBwb3J0ZWQgeWV0LmBcbiAgICAgICk7XG4gIH1cbn1cbmZ1bmN0aW9uIG1hcFZhbHVlcyhvYmplY3QsIGl0ZXJhdG9yKSB7XG4gIGNvbnN0IHJlc3VsdCA9IHt9O1xuICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICByZXN1bHRba2V5XSA9IGl0ZXJhdG9yKG9iamVjdFtrZXldKTtcbiAgfSk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmNvbnN0IG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCA9IG1vbmdvT2JqZWN0ID0+IHtcbiAgc3dpdGNoICh0eXBlb2YgbW9uZ29PYmplY3QpIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHJldHVybiBtb25nb09iamVjdDtcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHRocm93ICdiYWQgdmFsdWUgaW4gbmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0JztcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKG1vbmdvT2JqZWN0ID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0Lm1hcChuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIHJldHVybiBQYXJzZS5fZW5jb2RlKG1vbmdvT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5Mb25nKSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC50b051bWJlcigpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkRvdWJsZSkge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QudmFsdWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChCeXRlc0NvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdChtb25nb09iamVjdCkpIHtcbiAgICAgICAgcmV0dXJuIEJ5dGVzQ29kZXIuZGF0YWJhc2VUb0pTT04obW9uZ29PYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChtb25nb09iamVjdCwgJ19fdHlwZScpICYmXG4gICAgICAgIG1vbmdvT2JqZWN0Ll9fdHlwZSA9PSAnRGF0ZScgJiZcbiAgICAgICAgbW9uZ29PYmplY3QuaXNvIGluc3RhbmNlb2YgRGF0ZVxuICAgICAgKSB7XG4gICAgICAgIG1vbmdvT2JqZWN0LmlzbyA9IG1vbmdvT2JqZWN0Lmlzby50b0pTT04oKTtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbWFwVmFsdWVzKG1vbmdvT2JqZWN0LCBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QpO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAndW5rbm93biBqcyB0eXBlJztcbiAgfVxufTtcblxuY29uc3QgdHJhbnNmb3JtUG9pbnRlclN0cmluZyA9IChzY2hlbWEsIGZpZWxkLCBwb2ludGVyU3RyaW5nKSA9PiB7XG4gIGNvbnN0IG9iakRhdGEgPSBwb2ludGVyU3RyaW5nLnNwbGl0KCckJyk7XG4gIGlmIChvYmpEYXRhWzBdICE9PSBzY2hlbWEuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcykge1xuICAgIHRocm93ICdwb2ludGVyIHRvIGluY29ycmVjdCBjbGFzc05hbWUnO1xuICB9XG4gIHJldHVybiB7XG4gICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgY2xhc3NOYW1lOiBvYmpEYXRhWzBdLFxuICAgIG9iamVjdElkOiBvYmpEYXRhWzFdLFxuICB9O1xufTtcblxuLy8gQ29udmVydHMgZnJvbSBhIG1vbmdvLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4vLyBEb2VzIG5vdCBzdHJpcCBvdXQgYW55dGhpbmcgYmFzZWQgb24gYSBsYWNrIG9mIGF1dGhlbnRpY2F0aW9uLlxuY29uc3QgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0ID0gKGNsYXNzTmFtZSwgbW9uZ29PYmplY3QsIHNjaGVtYSkgPT4ge1xuICBzd2l0Y2ggKHR5cGVvZiBtb25nb09iamVjdCkge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0O1xuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgdGhyb3cgJ2JhZCB2YWx1ZSBpbiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QnO1xuICAgIGNhc2UgJ29iamVjdCc6IHtcbiAgICAgIGlmIChtb25nb09iamVjdCA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC5tYXAobmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICByZXR1cm4gUGFyc2UuX2VuY29kZShtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuTG9uZykge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QudG9OdW1iZXIoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5Eb3VibGUpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnZhbHVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QobW9uZ29PYmplY3QpKSB7XG4gICAgICAgIHJldHVybiBCeXRlc0NvZGVyLmRhdGFiYXNlVG9KU09OKG1vbmdvT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdE9iamVjdCA9IHt9O1xuICAgICAgaWYgKG1vbmdvT2JqZWN0Ll9ycGVybSB8fCBtb25nb09iamVjdC5fd3Blcm0pIHtcbiAgICAgICAgcmVzdE9iamVjdC5fcnBlcm0gPSBtb25nb09iamVjdC5fcnBlcm0gfHwgW107XG4gICAgICAgIHJlc3RPYmplY3QuX3dwZXJtID0gbW9uZ29PYmplY3QuX3dwZXJtIHx8IFtdO1xuICAgICAgICBkZWxldGUgbW9uZ29PYmplY3QuX3JwZXJtO1xuICAgICAgICBkZWxldGUgbW9uZ29PYmplY3QuX3dwZXJtO1xuICAgICAgfVxuXG4gICAgICBmb3IgKHZhciBrZXkgaW4gbW9uZ29PYmplY3QpIHtcbiAgICAgICAgc3dpdGNoIChrZXkpIHtcbiAgICAgICAgICBjYXNlICdfaWQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnb2JqZWN0SWQnXSA9ICcnICsgbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19oYXNoZWRfcGFzc3dvcmQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdC5faGFzaGVkX3Bhc3N3b3JkID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19hY2wnOlxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbic6XG4gICAgICAgICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW4nOlxuICAgICAgICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgICAgIGNhc2UgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JzpcbiAgICAgICAgICBjYXNlICdfdG9tYnN0b25lJzpcbiAgICAgICAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgICAgIGNhc2UgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCc6XG4gICAgICAgICAgY2FzZSAnX2ZhaWxlZF9sb2dpbl9jb3VudCc6XG4gICAgICAgICAgY2FzZSAnX3Bhc3N3b3JkX2hpc3RvcnknOlxuICAgICAgICAgICAgLy8gVGhvc2Uga2V5cyB3aWxsIGJlIGRlbGV0ZWQgaWYgbmVlZGVkIGluIHRoZSBEQiBDb250cm9sbGVyXG4gICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX3Nlc3Npb25fdG9rZW4nOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnc2Vzc2lvblRva2VuJ10gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgICAgICBjYXNlICdfdXBkYXRlZF9hdCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0Wyd1cGRhdGVkQXQnXSA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUobW9uZ29PYmplY3Rba2V5XSkpLmlzbztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2NyZWF0ZWRBdCc6XG4gICAgICAgICAgY2FzZSAnX2NyZWF0ZWRfYXQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnY3JlYXRlZEF0J10gPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pKS5pc287XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdleHBpcmVzQXQnOlxuICAgICAgICAgIGNhc2UgJ19leHBpcmVzQXQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnZXhwaXJlc0F0J10gPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICAgICAgICBjYXNlICdfbGFzdF91c2VkJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ2xhc3RVc2VkJ10gPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pKS5pc287XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgICAgICAgIGNhc2UgJ3RpbWVzX3VzZWQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsndGltZXNVc2VkJ10gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnYXV0aERhdGEnOlxuICAgICAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgICAgICBsb2cud2FybihcbiAgICAgICAgICAgICAgICAnaWdub3JpbmcgYXV0aERhdGEgaW4gX1VzZXIgYXMgdGhpcyBrZXkgaXMgcmVzZXJ2ZWQgdG8gYmUgc3ludGhlc2l6ZWQgb2YgYF9hdXRoX2RhdGFfKmAga2V5cydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJlc3RPYmplY3RbJ2F1dGhEYXRhJ10gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIC8vIENoZWNrIG90aGVyIGF1dGggZGF0YSBrZXlzXG4gICAgICAgICAgICB2YXIgYXV0aERhdGFNYXRjaCA9IGtleS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgICAgICAgaWYgKGF1dGhEYXRhTWF0Y2ggJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgICAgICAgIHJlc3RPYmplY3RbJ2F1dGhEYXRhJ10gPSByZXN0T2JqZWN0WydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICAgICAgICByZXN0T2JqZWN0WydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoa2V5LmluZGV4T2YoJ19wXycpID09IDApIHtcbiAgICAgICAgICAgICAgdmFyIG5ld0tleSA9IGtleS5zdWJzdHJpbmcoMyk7XG4gICAgICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tuZXdLZXldKSB7XG4gICAgICAgICAgICAgICAgbG9nLmluZm8oXG4gICAgICAgICAgICAgICAgICAndHJhbnNmb3JtLmpzJyxcbiAgICAgICAgICAgICAgICAgICdGb3VuZCBhIHBvaW50ZXIgY29sdW1uIG5vdCBpbiB0aGUgc2NoZW1hLCBkcm9wcGluZyBpdC4nLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgbmV3S2V5XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tuZXdLZXldLnR5cGUgIT09ICdQb2ludGVyJykge1xuICAgICAgICAgICAgICAgIGxvZy5pbmZvKFxuICAgICAgICAgICAgICAgICAgJ3RyYW5zZm9ybS5qcycsXG4gICAgICAgICAgICAgICAgICAnRm91bmQgYSBwb2ludGVyIGluIGEgbm9uLXBvaW50ZXIgY29sdW1uLCBkcm9wcGluZyBpdC4nLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAga2V5XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAobW9uZ29PYmplY3Rba2V5XSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJlc3RPYmplY3RbbmV3S2V5XSA9IHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcoc2NoZW1hLCBuZXdLZXksIG1vbmdvT2JqZWN0W2tleV0pO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5WzBdID09ICdfJyAmJiBrZXkgIT0gJ19fdHlwZScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgJ2JhZCBrZXkgaW4gdW50cmFuc2Zvcm06ICcgKyBrZXk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2YXIgdmFsdWUgPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdGaWxlJyAmJlxuICAgICAgICAgICAgICAgIEZpbGVDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IEZpbGVDb2Rlci5kYXRhYmFzZVRvSlNPTih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnR2VvUG9pbnQnICYmXG4gICAgICAgICAgICAgICAgR2VvUG9pbnRDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IEdlb1BvaW50Q29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ1BvbHlnb24nICYmXG4gICAgICAgICAgICAgICAgUG9seWdvbkNvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdCh2YWx1ZSlcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gUG9seWdvbkNvZGVyLmRhdGFiYXNlVG9KU09OKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdCeXRlcycgJiZcbiAgICAgICAgICAgICAgICBCeXRlc0NvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdCh2YWx1ZSlcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gQnl0ZXNDb2Rlci5kYXRhYmFzZVRvSlNPTih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdChtb25nb09iamVjdFtrZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCByZWxhdGlvbkZpZWxkTmFtZXMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5maWx0ZXIoXG4gICAgICAgIGZpZWxkTmFtZSA9PiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJ1xuICAgICAgKTtcbiAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGRzID0ge307XG4gICAgICByZWxhdGlvbkZpZWxkTmFtZXMuZm9yRWFjaChyZWxhdGlvbkZpZWxkTmFtZSA9PiB7XG4gICAgICAgIHJlbGF0aW9uRmllbGRzW3JlbGF0aW9uRmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW3JlbGF0aW9uRmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4geyAuLi5yZXN0T2JqZWN0LCAuLi5yZWxhdGlvbkZpZWxkcyB9O1xuICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgJ3Vua25vd24ganMgdHlwZSc7XG4gIH1cbn07XG5cbnZhciBEYXRlQ29kZXIgPSB7XG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICByZXR1cm4gbmV3IERhdGUoanNvbi5pc28pO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnRGF0ZSc7XG4gIH0sXG59O1xuXG52YXIgQnl0ZXNDb2RlciA9IHtcbiAgYmFzZTY0UGF0dGVybjogbmV3IFJlZ0V4cCgnXig/OltBLVphLXowLTkrL117NH0pKig/OltBLVphLXowLTkrL117Mn09PXxbQS1aYS16MC05Ky9dezN9PSk/JCcpLFxuICBpc0Jhc2U2NFZhbHVlKG9iamVjdCkge1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5iYXNlNjRQYXR0ZXJuLnRlc3Qob2JqZWN0KTtcbiAgfSxcblxuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICBsZXQgdmFsdWU7XG4gICAgaWYgKHRoaXMuaXNCYXNlNjRWYWx1ZShvYmplY3QpKSB7XG4gICAgICB2YWx1ZSA9IG9iamVjdDtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgPSBvYmplY3QuYnVmZmVyLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ0J5dGVzJyxcbiAgICAgIGJhc2U2NDogdmFsdWUsXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuQmluYXJ5IHx8IHRoaXMuaXNCYXNlNjRWYWx1ZShvYmplY3QpO1xuICB9LFxuXG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICByZXR1cm4gbmV3IG1vbmdvZGIuQmluYXJ5KEJ1ZmZlci5mcm9tKGpzb24uYmFzZTY0LCAnYmFzZTY0JykpO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnO1xuICB9LFxufTtcblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGRhdGFiYXNlVG9KU09OKG9iamVjdCkge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICBsYXRpdHVkZTogb2JqZWN0WzFdLFxuICAgICAgbG9uZ2l0dWRlOiBvYmplY3RbMF0sXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCBpbnN0YW5jZW9mIEFycmF5ICYmIG9iamVjdC5sZW5ndGggPT0gMjtcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIFtqc29uLmxvbmdpdHVkZSwganNvbi5sYXRpdHVkZV07XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCc7XG4gIH0sXG59O1xuXG52YXIgUG9seWdvbkNvZGVyID0ge1xuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICAvLyBDb252ZXJ0IGxuZy9sYXQgLT4gbGF0L2xuZ1xuICAgIGNvbnN0IGNvb3JkcyA9IG9iamVjdC5jb29yZGluYXRlc1swXS5tYXAoY29vcmQgPT4ge1xuICAgICAgcmV0dXJuIFtjb29yZFsxXSwgY29vcmRbMF1dO1xuICAgIH0pO1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdQb2x5Z29uJyxcbiAgICAgIGNvb3JkaW5hdGVzOiBjb29yZHMsXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgY29uc3QgY29vcmRzID0gb2JqZWN0LmNvb3JkaW5hdGVzWzBdO1xuICAgIGlmIChvYmplY3QudHlwZSAhPT0gJ1BvbHlnb24nIHx8ICEoY29vcmRzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29vcmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBwb2ludCA9IGNvb3Jkc1tpXTtcbiAgICAgIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QocG9pbnQpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwYXJzZUZsb2F0KHBvaW50WzFdKSwgcGFyc2VGbG9hdChwb2ludFswXSkpO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgbGV0IGNvb3JkcyA9IGpzb24uY29vcmRpbmF0ZXM7XG4gICAgLy8gQWRkIGZpcnN0IHBvaW50IHRvIHRoZSBlbmQgdG8gY2xvc2UgcG9seWdvblxuICAgIGlmIChcbiAgICAgIGNvb3Jkc1swXVswXSAhPT0gY29vcmRzW2Nvb3Jkcy5sZW5ndGggLSAxXVswXSB8fFxuICAgICAgY29vcmRzWzBdWzFdICE9PSBjb29yZHNbY29vcmRzLmxlbmd0aCAtIDFdWzFdXG4gICAgKSB7XG4gICAgICBjb29yZHMucHVzaChjb29yZHNbMF0pO1xuICAgIH1cbiAgICBjb25zdCB1bmlxdWUgPSBjb29yZHMuZmlsdGVyKChpdGVtLCBpbmRleCwgYXIpID0+IHtcbiAgICAgIGxldCBmb3VuZEluZGV4ID0gLTE7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgIGNvbnN0IHB0ID0gYXJbaV07XG4gICAgICAgIGlmIChwdFswXSA9PT0gaXRlbVswXSAmJiBwdFsxXSA9PT0gaXRlbVsxXSkge1xuICAgICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gZm91bmRJbmRleCA9PT0gaW5kZXg7XG4gICAgfSk7XG4gICAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICAgKTtcbiAgICB9XG4gICAgLy8gQ29udmVydCBsYXQvbG9uZyAtPiBsb25nL2xhdFxuICAgIGNvb3JkcyA9IGNvb3Jkcy5tYXAoY29vcmQgPT4ge1xuICAgICAgcmV0dXJuIFtjb29yZFsxXSwgY29vcmRbMF1dO1xuICAgIH0pO1xuICAgIHJldHVybiB7IHR5cGU6ICdQb2x5Z29uJywgY29vcmRpbmF0ZXM6IFtjb29yZHNdIH07XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJztcbiAgfSxcbn07XG5cbnZhciBGaWxlQ29kZXIgPSB7XG4gIGRhdGFiYXNlVG9KU09OKG9iamVjdCkge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgIG5hbWU6IG9iamVjdCxcbiAgICB9O1xuICB9LFxuXG4gIGlzVmFsaWREYXRhYmFzZU9iamVjdChvYmplY3QpIHtcbiAgICByZXR1cm4gdHlwZW9mIG9iamVjdCA9PT0gJ3N0cmluZyc7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIHJldHVybiBqc29uLm5hbWU7XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJztcbiAgfSxcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB0cmFuc2Zvcm1LZXksXG4gIHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSxcbiAgdHJhbnNmb3JtVXBkYXRlLFxuICB0cmFuc2Zvcm1XaGVyZSxcbiAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0LFxuICB0cmFuc2Zvcm1Db25zdHJhaW50LFxuICB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQXVCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUN2QixJQUFJQSxPQUFPLEdBQUdDLE9BQU8sQ0FBQyxTQUFTLENBQUM7QUFDaEMsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUNDLEtBQUs7QUFDdkMsTUFBTUMsS0FBSyxHQUFHRixPQUFPLENBQUMsZ0JBQWdCLENBQUM7QUFFdkMsTUFBTUcsWUFBWSxHQUFHLENBQUNDLFNBQVMsRUFBRUMsU0FBUyxFQUFFQyxNQUFNLEtBQUs7RUFDckQ7RUFDQSxRQUFRRCxTQUFTO0lBQ2YsS0FBSyxVQUFVO01BQ2IsT0FBTyxLQUFLO0lBQ2QsS0FBSyxXQUFXO01BQ2QsT0FBTyxhQUFhO0lBQ3RCLEtBQUssV0FBVztNQUNkLE9BQU8sYUFBYTtJQUN0QixLQUFLLGNBQWM7TUFDakIsT0FBTyxnQkFBZ0I7SUFDekIsS0FBSyxVQUFVO01BQ2IsT0FBTyxZQUFZO0lBQ3JCLEtBQUssV0FBVztNQUNkLE9BQU8sWUFBWTtFQUFDO0VBR3hCLElBQUlDLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDRixTQUFTLENBQUMsSUFBSUMsTUFBTSxDQUFDQyxNQUFNLENBQUNGLFNBQVMsQ0FBQyxDQUFDRyxNQUFNLElBQUksU0FBUyxFQUFFO0lBQzVFSCxTQUFTLEdBQUcsS0FBSyxHQUFHQSxTQUFTO0VBQy9CLENBQUMsTUFBTSxJQUFJQyxNQUFNLENBQUNDLE1BQU0sQ0FBQ0YsU0FBUyxDQUFDLElBQUlDLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDRixTQUFTLENBQUMsQ0FBQ0ksSUFBSSxJQUFJLFNBQVMsRUFBRTtJQUNqRkosU0FBUyxHQUFHLEtBQUssR0FBR0EsU0FBUztFQUMvQjtFQUVBLE9BQU9BLFNBQVM7QUFDbEIsQ0FBQztBQUVELE1BQU1LLDBCQUEwQixHQUFHLENBQUNOLFNBQVMsRUFBRU8sT0FBTyxFQUFFQyxTQUFTLEVBQUVDLGlCQUFpQixLQUFLO0VBQ3ZGO0VBQ0EsSUFBSUMsR0FBRyxHQUFHSCxPQUFPO0VBQ2pCLElBQUlJLFNBQVMsR0FBRyxLQUFLO0VBQ3JCLFFBQVFELEdBQUc7SUFDVCxLQUFLLFVBQVU7SUFDZixLQUFLLEtBQUs7TUFDUixJQUFJLENBQUMsZUFBZSxFQUFFLGdCQUFnQixDQUFDLENBQUNFLFFBQVEsQ0FBQ1osU0FBUyxDQUFDLEVBQUU7UUFDM0QsT0FBTztVQUNMVSxHQUFHLEVBQUVBLEdBQUc7VUFDUkcsS0FBSyxFQUFFQyxRQUFRLENBQUNOLFNBQVM7UUFDM0IsQ0FBQztNQUNIO01BQ0FFLEdBQUcsR0FBRyxLQUFLO01BQ1g7SUFDRixLQUFLLFdBQVc7SUFDaEIsS0FBSyxhQUFhO01BQ2hCQSxHQUFHLEdBQUcsYUFBYTtNQUNuQkMsU0FBUyxHQUFHLElBQUk7TUFDaEI7SUFDRixLQUFLLFdBQVc7SUFDaEIsS0FBSyxhQUFhO01BQ2hCRCxHQUFHLEdBQUcsYUFBYTtNQUNuQkMsU0FBUyxHQUFHLElBQUk7TUFDaEI7SUFDRixLQUFLLGNBQWM7SUFDbkIsS0FBSyxnQkFBZ0I7TUFDbkJELEdBQUcsR0FBRyxnQkFBZ0I7TUFDdEI7SUFDRixLQUFLLFdBQVc7SUFDaEIsS0FBSyxZQUFZO01BQ2ZBLEdBQUcsR0FBRyxXQUFXO01BQ2pCQyxTQUFTLEdBQUcsSUFBSTtNQUNoQjtJQUNGLEtBQUssZ0NBQWdDO01BQ25DRCxHQUFHLEdBQUcsZ0NBQWdDO01BQ3RDQyxTQUFTLEdBQUcsSUFBSTtNQUNoQjtJQUNGLEtBQUssNkJBQTZCO01BQ2hDRCxHQUFHLEdBQUcsNkJBQTZCO01BQ25DQyxTQUFTLEdBQUcsSUFBSTtNQUNoQjtJQUNGLEtBQUsscUJBQXFCO01BQ3hCRCxHQUFHLEdBQUcscUJBQXFCO01BQzNCO0lBQ0YsS0FBSyw4QkFBOEI7TUFDakNBLEdBQUcsR0FBRyw4QkFBOEI7TUFDcENDLFNBQVMsR0FBRyxJQUFJO01BQ2hCO0lBQ0YsS0FBSyxzQkFBc0I7TUFDekJELEdBQUcsR0FBRyxzQkFBc0I7TUFDNUJDLFNBQVMsR0FBRyxJQUFJO01BQ2hCO0lBQ0YsS0FBSyxRQUFRO0lBQ2IsS0FBSyxRQUFRO01BQ1gsT0FBTztRQUFFRCxHQUFHLEVBQUVBLEdBQUc7UUFBRUcsS0FBSyxFQUFFTDtNQUFVLENBQUM7SUFDdkMsS0FBSyxVQUFVO0lBQ2YsS0FBSyxZQUFZO01BQ2ZFLEdBQUcsR0FBRyxZQUFZO01BQ2xCQyxTQUFTLEdBQUcsSUFBSTtNQUNoQjtJQUNGLEtBQUssV0FBVztJQUNoQixLQUFLLFlBQVk7TUFDZkQsR0FBRyxHQUFHLFlBQVk7TUFDbEJDLFNBQVMsR0FBRyxJQUFJO01BQ2hCO0VBQU07RUFHVixJQUNHRixpQkFBaUIsQ0FBQ04sTUFBTSxDQUFDTyxHQUFHLENBQUMsSUFBSUQsaUJBQWlCLENBQUNOLE1BQU0sQ0FBQ08sR0FBRyxDQUFDLENBQUNMLElBQUksS0FBSyxTQUFTLElBQ2pGLENBQUNLLEdBQUcsQ0FBQ0UsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUNqQixDQUFDSCxpQkFBaUIsQ0FBQ04sTUFBTSxDQUFDTyxHQUFHLENBQUMsSUFDOUJGLFNBQVMsSUFDVEEsU0FBUyxDQUFDSixNQUFNLElBQUksU0FBVSxDQUFDO0VBQUEsRUFDakM7SUFDQU0sR0FBRyxHQUFHLEtBQUssR0FBR0EsR0FBRztFQUNuQjs7RUFFQTtFQUNBLElBQUlHLEtBQUssR0FBR0UscUJBQXFCLENBQUNQLFNBQVMsQ0FBQztFQUM1QyxJQUFJSyxLQUFLLEtBQUtHLGVBQWUsRUFBRTtJQUM3QixJQUFJTCxTQUFTLElBQUksT0FBT0UsS0FBSyxLQUFLLFFBQVEsRUFBRTtNQUMxQ0EsS0FBSyxHQUFHLElBQUlJLElBQUksQ0FBQ0osS0FBSyxDQUFDO0lBQ3pCO0lBQ0EsSUFBSU4sT0FBTyxDQUFDVyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFO01BQzVCLE9BQU87UUFBRVIsR0FBRztRQUFFRyxLQUFLLEVBQUVMO01BQVUsQ0FBQztJQUNsQztJQUNBLE9BQU87TUFBRUUsR0FBRztNQUFFRztJQUFNLENBQUM7RUFDdkI7O0VBRUE7RUFDQSxJQUFJTCxTQUFTLFlBQVlXLEtBQUssRUFBRTtJQUM5Qk4sS0FBSyxHQUFHTCxTQUFTLENBQUNZLEdBQUcsQ0FBQ0Msc0JBQXNCLENBQUM7SUFDN0MsT0FBTztNQUFFWCxHQUFHO01BQUVHO0lBQU0sQ0FBQztFQUN2Qjs7RUFFQTtFQUNBLElBQUksT0FBT0wsU0FBUyxLQUFLLFFBQVEsSUFBSSxNQUFNLElBQUlBLFNBQVMsRUFBRTtJQUN4RCxPQUFPO01BQUVFLEdBQUc7TUFBRUcsS0FBSyxFQUFFUyx1QkFBdUIsQ0FBQ2QsU0FBUyxFQUFFLEtBQUs7SUFBRSxDQUFDO0VBQ2xFOztFQUVBO0VBQ0FLLEtBQUssR0FBR1UsU0FBUyxDQUFDZixTQUFTLEVBQUVhLHNCQUFzQixDQUFDO0VBQ3BELE9BQU87SUFBRVgsR0FBRztJQUFFRztFQUFNLENBQUM7QUFDdkIsQ0FBQztBQUVELE1BQU1XLE9BQU8sR0FBR1gsS0FBSyxJQUFJO0VBQ3ZCLE9BQU9BLEtBQUssSUFBSUEsS0FBSyxZQUFZWSxNQUFNO0FBQ3pDLENBQUM7QUFFRCxNQUFNQyxpQkFBaUIsR0FBR2IsS0FBSyxJQUFJO0VBQ2pDLElBQUksQ0FBQ1csT0FBTyxDQUFDWCxLQUFLLENBQUMsRUFBRTtJQUNuQixPQUFPLEtBQUs7RUFDZDtFQUVBLE1BQU1jLE9BQU8sR0FBR2QsS0FBSyxDQUFDZSxRQUFRLEVBQUUsQ0FBQ0MsS0FBSyxDQUFDLGdCQUFnQixDQUFDO0VBQ3hELE9BQU8sQ0FBQyxDQUFDRixPQUFPO0FBQ2xCLENBQUM7QUFFRCxNQUFNRyxzQkFBc0IsR0FBR0MsTUFBTSxJQUFJO0VBQ3ZDLElBQUksQ0FBQ0EsTUFBTSxJQUFJLENBQUNaLEtBQUssQ0FBQ2EsT0FBTyxDQUFDRCxNQUFNLENBQUMsSUFBSUEsTUFBTSxDQUFDRSxNQUFNLEtBQUssQ0FBQyxFQUFFO0lBQzVELE9BQU8sSUFBSTtFQUNiO0VBRUEsTUFBTUMsa0JBQWtCLEdBQUdSLGlCQUFpQixDQUFDSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDdkQsSUFBSUEsTUFBTSxDQUFDRSxNQUFNLEtBQUssQ0FBQyxFQUFFO0lBQ3ZCLE9BQU9DLGtCQUFrQjtFQUMzQjtFQUVBLEtBQUssSUFBSUMsQ0FBQyxHQUFHLENBQUMsRUFBRUYsTUFBTSxHQUFHRixNQUFNLENBQUNFLE1BQU0sRUFBRUUsQ0FBQyxHQUFHRixNQUFNLEVBQUUsRUFBRUUsQ0FBQyxFQUFFO0lBQ3ZELElBQUlELGtCQUFrQixLQUFLUixpQkFBaUIsQ0FBQ0ssTUFBTSxDQUFDSSxDQUFDLENBQUMsQ0FBQyxFQUFFO01BQ3ZELE9BQU8sS0FBSztJQUNkO0VBQ0Y7RUFFQSxPQUFPLElBQUk7QUFDYixDQUFDO0FBRUQsTUFBTUMsZUFBZSxHQUFHTCxNQUFNLElBQUk7RUFDaEMsT0FBT0EsTUFBTSxDQUFDTSxJQUFJLENBQUMsVUFBVXhCLEtBQUssRUFBRTtJQUNsQyxPQUFPVyxPQUFPLENBQUNYLEtBQUssQ0FBQztFQUN2QixDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsTUFBTVEsc0JBQXNCLEdBQUdiLFNBQVMsSUFBSTtFQUMxQyxJQUNFQSxTQUFTLEtBQUssSUFBSSxJQUNsQixPQUFPQSxTQUFTLEtBQUssUUFBUSxJQUM3QjhCLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDL0IsU0FBUyxDQUFDLENBQUM2QixJQUFJLENBQUMzQixHQUFHLElBQUlBLEdBQUcsQ0FBQ0UsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJRixHQUFHLENBQUNFLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUMxRTtJQUNBLE1BQU0sSUFBSWYsS0FBSyxDQUFDMkMsS0FBSyxDQUNuQjNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ0Msa0JBQWtCLEVBQzlCLDBEQUEwRCxDQUMzRDtFQUNIO0VBQ0E7RUFDQSxJQUFJNUIsS0FBSyxHQUFHNkIscUJBQXFCLENBQUNsQyxTQUFTLENBQUM7RUFDNUMsSUFBSUssS0FBSyxLQUFLRyxlQUFlLEVBQUU7SUFDN0IsSUFBSUgsS0FBSyxJQUFJLE9BQU9BLEtBQUssS0FBSyxRQUFRLEVBQUU7TUFDdEMsSUFBSUEsS0FBSyxZQUFZSSxJQUFJLEVBQUU7UUFDekIsT0FBT0osS0FBSztNQUNkO01BQ0EsSUFBSUEsS0FBSyxZQUFZTSxLQUFLLEVBQUU7UUFDMUJOLEtBQUssR0FBR0EsS0FBSyxDQUFDTyxHQUFHLENBQUNDLHNCQUFzQixDQUFDO01BQzNDLENBQUMsTUFBTTtRQUNMUixLQUFLLEdBQUdVLFNBQVMsQ0FBQ1YsS0FBSyxFQUFFUSxzQkFBc0IsQ0FBQztNQUNsRDtJQUNGO0lBQ0EsT0FBT1IsS0FBSztFQUNkOztFQUVBO0VBQ0EsSUFBSUwsU0FBUyxZQUFZVyxLQUFLLEVBQUU7SUFDOUIsT0FBT1gsU0FBUyxDQUFDWSxHQUFHLENBQUNDLHNCQUFzQixDQUFDO0VBQzlDOztFQUVBO0VBQ0EsSUFBSSxPQUFPYixTQUFTLEtBQUssUUFBUSxJQUFJLE1BQU0sSUFBSUEsU0FBUyxFQUFFO0lBQ3hELE9BQU9jLHVCQUF1QixDQUFDZCxTQUFTLEVBQUUsSUFBSSxDQUFDO0VBQ2pEOztFQUVBO0VBQ0EsT0FBT2UsU0FBUyxDQUFDZixTQUFTLEVBQUVhLHNCQUFzQixDQUFDO0FBQ3JELENBQUM7QUFFRCxNQUFNc0IsV0FBVyxHQUFHOUIsS0FBSyxJQUFJO0VBQzNCLElBQUksT0FBT0EsS0FBSyxLQUFLLFFBQVEsRUFBRTtJQUM3QixPQUFPLElBQUlJLElBQUksQ0FBQ0osS0FBSyxDQUFDO0VBQ3hCLENBQUMsTUFBTSxJQUFJQSxLQUFLLFlBQVlJLElBQUksRUFBRTtJQUNoQyxPQUFPSixLQUFLO0VBQ2Q7RUFDQSxPQUFPLEtBQUs7QUFDZCxDQUFDO0FBRUQsU0FBUytCLHNCQUFzQixDQUFDNUMsU0FBUyxFQUFFVSxHQUFHLEVBQUVHLEtBQUssRUFBRVgsTUFBTSxFQUFFMkMsS0FBSyxHQUFHLEtBQUssRUFBRTtFQUM1RSxRQUFRbkMsR0FBRztJQUNULEtBQUssV0FBVztNQUNkLElBQUlpQyxXQUFXLENBQUM5QixLQUFLLENBQUMsRUFBRTtRQUN0QixPQUFPO1VBQUVILEdBQUcsRUFBRSxhQUFhO1VBQUVHLEtBQUssRUFBRThCLFdBQVcsQ0FBQzlCLEtBQUs7UUFBRSxDQUFDO01BQzFEO01BQ0FILEdBQUcsR0FBRyxhQUFhO01BQ25CO0lBQ0YsS0FBSyxXQUFXO01BQ2QsSUFBSWlDLFdBQVcsQ0FBQzlCLEtBQUssQ0FBQyxFQUFFO1FBQ3RCLE9BQU87VUFBRUgsR0FBRyxFQUFFLGFBQWE7VUFBRUcsS0FBSyxFQUFFOEIsV0FBVyxDQUFDOUIsS0FBSztRQUFFLENBQUM7TUFDMUQ7TUFDQUgsR0FBRyxHQUFHLGFBQWE7TUFDbkI7SUFDRixLQUFLLFdBQVc7TUFDZCxJQUFJaUMsV0FBVyxDQUFDOUIsS0FBSyxDQUFDLEVBQUU7UUFDdEIsT0FBTztVQUFFSCxHQUFHLEVBQUUsV0FBVztVQUFFRyxLQUFLLEVBQUU4QixXQUFXLENBQUM5QixLQUFLO1FBQUUsQ0FBQztNQUN4RDtNQUNBO0lBQ0YsS0FBSyxnQ0FBZ0M7TUFDbkMsSUFBSThCLFdBQVcsQ0FBQzlCLEtBQUssQ0FBQyxFQUFFO1FBQ3RCLE9BQU87VUFDTEgsR0FBRyxFQUFFLGdDQUFnQztVQUNyQ0csS0FBSyxFQUFFOEIsV0FBVyxDQUFDOUIsS0FBSztRQUMxQixDQUFDO01BQ0g7TUFDQTtJQUNGLEtBQUssVUFBVTtNQUFFO1FBQ2YsSUFBSSxDQUFDLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDRCxRQUFRLENBQUNaLFNBQVMsQ0FBQyxFQUFFO1VBQzNEYSxLQUFLLEdBQUdDLFFBQVEsQ0FBQ0QsS0FBSyxDQUFDO1FBQ3pCO1FBQ0EsT0FBTztVQUFFSCxHQUFHLEVBQUUsS0FBSztVQUFFRztRQUFNLENBQUM7TUFDOUI7SUFDQSxLQUFLLDZCQUE2QjtNQUNoQyxJQUFJOEIsV0FBVyxDQUFDOUIsS0FBSyxDQUFDLEVBQUU7UUFDdEIsT0FBTztVQUNMSCxHQUFHLEVBQUUsNkJBQTZCO1VBQ2xDRyxLQUFLLEVBQUU4QixXQUFXLENBQUM5QixLQUFLO1FBQzFCLENBQUM7TUFDSDtNQUNBO0lBQ0YsS0FBSyxxQkFBcUI7TUFDeEIsT0FBTztRQUFFSCxHQUFHO1FBQUVHO01BQU0sQ0FBQztJQUN2QixLQUFLLGNBQWM7TUFDakIsT0FBTztRQUFFSCxHQUFHLEVBQUUsZ0JBQWdCO1FBQUVHO01BQU0sQ0FBQztJQUN6QyxLQUFLLDhCQUE4QjtNQUNqQyxJQUFJOEIsV0FBVyxDQUFDOUIsS0FBSyxDQUFDLEVBQUU7UUFDdEIsT0FBTztVQUNMSCxHQUFHLEVBQUUsOEJBQThCO1VBQ25DRyxLQUFLLEVBQUU4QixXQUFXLENBQUM5QixLQUFLO1FBQzFCLENBQUM7TUFDSDtNQUNBO0lBQ0YsS0FBSyxzQkFBc0I7TUFDekIsSUFBSThCLFdBQVcsQ0FBQzlCLEtBQUssQ0FBQyxFQUFFO1FBQ3RCLE9BQU87VUFBRUgsR0FBRyxFQUFFLHNCQUFzQjtVQUFFRyxLQUFLLEVBQUU4QixXQUFXLENBQUM5QixLQUFLO1FBQUUsQ0FBQztNQUNuRTtNQUNBO0lBQ0YsS0FBSyxRQUFRO0lBQ2IsS0FBSyxRQUFRO0lBQ2IsS0FBSyxtQkFBbUI7SUFDeEIsS0FBSyxxQkFBcUI7TUFDeEIsT0FBTztRQUFFSCxHQUFHO1FBQUVHO01BQU0sQ0FBQztJQUN2QixLQUFLLEtBQUs7SUFDVixLQUFLLE1BQU07SUFDWCxLQUFLLE1BQU07TUFDVCxPQUFPO1FBQ0xILEdBQUcsRUFBRUEsR0FBRztRQUNSRyxLQUFLLEVBQUVBLEtBQUssQ0FBQ08sR0FBRyxDQUFDMEIsUUFBUSxJQUFJQyxjQUFjLENBQUMvQyxTQUFTLEVBQUU4QyxRQUFRLEVBQUU1QyxNQUFNLEVBQUUyQyxLQUFLLENBQUM7TUFDakYsQ0FBQztJQUNILEtBQUssVUFBVTtNQUNiLElBQUlGLFdBQVcsQ0FBQzlCLEtBQUssQ0FBQyxFQUFFO1FBQ3RCLE9BQU87VUFBRUgsR0FBRyxFQUFFLFlBQVk7VUFBRUcsS0FBSyxFQUFFOEIsV0FBVyxDQUFDOUIsS0FBSztRQUFFLENBQUM7TUFDekQ7TUFDQUgsR0FBRyxHQUFHLFlBQVk7TUFDbEI7SUFDRixLQUFLLFdBQVc7TUFDZCxPQUFPO1FBQUVBLEdBQUcsRUFBRSxZQUFZO1FBQUVHLEtBQUssRUFBRUE7TUFBTSxDQUFDO0lBQzVDO01BQVM7UUFDUDtRQUNBLE1BQU1tQyxhQUFhLEdBQUd0QyxHQUFHLENBQUNtQixLQUFLLENBQUMsaUNBQWlDLENBQUM7UUFDbEUsSUFBSW1CLGFBQWEsRUFBRTtVQUNqQixNQUFNQyxRQUFRLEdBQUdELGFBQWEsQ0FBQyxDQUFDLENBQUM7VUFDakM7VUFDQSxPQUFPO1lBQUV0QyxHQUFHLEVBQUcsY0FBYXVDLFFBQVMsS0FBSTtZQUFFcEM7VUFBTSxDQUFDO1FBQ3BEO01BQ0Y7RUFBQztFQUdILE1BQU1xQyxtQkFBbUIsR0FBR2hELE1BQU0sSUFBSUEsTUFBTSxDQUFDQyxNQUFNLENBQUNPLEdBQUcsQ0FBQyxJQUFJUixNQUFNLENBQUNDLE1BQU0sQ0FBQ08sR0FBRyxDQUFDLENBQUNMLElBQUksS0FBSyxPQUFPO0VBRS9GLE1BQU04QyxxQkFBcUIsR0FDekJqRCxNQUFNLElBQUlBLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDTyxHQUFHLENBQUMsSUFBSVIsTUFBTSxDQUFDQyxNQUFNLENBQUNPLEdBQUcsQ0FBQyxDQUFDTCxJQUFJLEtBQUssU0FBUztFQUV2RSxNQUFNK0MsS0FBSyxHQUFHbEQsTUFBTSxJQUFJQSxNQUFNLENBQUNDLE1BQU0sQ0FBQ08sR0FBRyxDQUFDO0VBQzFDLElBQ0V5QyxxQkFBcUIsSUFDcEIsQ0FBQ2pELE1BQU0sSUFBSSxDQUFDUSxHQUFHLENBQUNFLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSUMsS0FBSyxJQUFJQSxLQUFLLENBQUNULE1BQU0sS0FBSyxTQUFVLEVBQ3RFO0lBQ0FNLEdBQUcsR0FBRyxLQUFLLEdBQUdBLEdBQUc7RUFDbkI7O0VBRUE7RUFDQSxNQUFNMkMscUJBQXFCLEdBQUdDLG1CQUFtQixDQUFDekMsS0FBSyxFQUFFdUMsS0FBSyxFQUFFUCxLQUFLLENBQUM7RUFDdEUsSUFBSVEscUJBQXFCLEtBQUtyQyxlQUFlLEVBQUU7SUFDN0MsSUFBSXFDLHFCQUFxQixDQUFDRSxLQUFLLEVBQUU7TUFDL0IsT0FBTztRQUFFN0MsR0FBRyxFQUFFLE9BQU87UUFBRUcsS0FBSyxFQUFFd0MscUJBQXFCLENBQUNFO01BQU0sQ0FBQztJQUM3RDtJQUNBLElBQUlGLHFCQUFxQixDQUFDRyxVQUFVLEVBQUU7TUFDcEMsT0FBTztRQUFFOUMsR0FBRyxFQUFFLE1BQU07UUFBRUcsS0FBSyxFQUFFLENBQUM7VUFBRSxDQUFDSCxHQUFHLEdBQUcyQztRQUFzQixDQUFDO01BQUUsQ0FBQztJQUNuRTtJQUNBLE9BQU87TUFBRTNDLEdBQUc7TUFBRUcsS0FBSyxFQUFFd0M7SUFBc0IsQ0FBQztFQUM5QztFQUVBLElBQUlILG1CQUFtQixJQUFJLEVBQUVyQyxLQUFLLFlBQVlNLEtBQUssQ0FBQyxFQUFFO0lBQ3BELE9BQU87TUFBRVQsR0FBRztNQUFFRyxLQUFLLEVBQUU7UUFBRTRDLElBQUksRUFBRSxDQUFDZixxQkFBcUIsQ0FBQzdCLEtBQUssQ0FBQztNQUFFO0lBQUUsQ0FBQztFQUNqRTs7RUFFQTtFQUNBLE1BQU02QyxZQUFZLEdBQUdoRCxHQUFHLENBQUNFLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FDbEM4QixxQkFBcUIsQ0FBQzdCLEtBQUssQ0FBQyxHQUM1QkUscUJBQXFCLENBQUNGLEtBQUssQ0FBQztFQUNoQyxJQUFJNkMsWUFBWSxLQUFLMUMsZUFBZSxFQUFFO0lBQ3BDLE9BQU87TUFBRU4sR0FBRztNQUFFRyxLQUFLLEVBQUU2QztJQUFhLENBQUM7RUFDckMsQ0FBQyxNQUFNO0lBQ0wsTUFBTSxJQUFJN0QsS0FBSyxDQUFDMkMsS0FBSyxDQUNuQjNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ21CLFlBQVksRUFDdkIsa0JBQWlCOUMsS0FBTSx3QkFBdUIsQ0FDaEQ7RUFDSDtBQUNGOztBQUVBO0FBQ0E7QUFDQTtBQUNBLFNBQVNrQyxjQUFjLENBQUMvQyxTQUFTLEVBQUU0RCxTQUFTLEVBQUUxRCxNQUFNLEVBQUUyQyxLQUFLLEdBQUcsS0FBSyxFQUFFO0VBQ25FLE1BQU1nQixVQUFVLEdBQUcsQ0FBQyxDQUFDO0VBQ3JCLEtBQUssTUFBTXRELE9BQU8sSUFBSXFELFNBQVMsRUFBRTtJQUMvQixNQUFNRSxHQUFHLEdBQUdsQixzQkFBc0IsQ0FBQzVDLFNBQVMsRUFBRU8sT0FBTyxFQUFFcUQsU0FBUyxDQUFDckQsT0FBTyxDQUFDLEVBQUVMLE1BQU0sRUFBRTJDLEtBQUssQ0FBQztJQUN6RmdCLFVBQVUsQ0FBQ0MsR0FBRyxDQUFDcEQsR0FBRyxDQUFDLEdBQUdvRCxHQUFHLENBQUNqRCxLQUFLO0VBQ2pDO0VBQ0EsT0FBT2dELFVBQVU7QUFDbkI7QUFFQSxNQUFNRSx3Q0FBd0MsR0FBRyxDQUFDeEQsT0FBTyxFQUFFQyxTQUFTLEVBQUVOLE1BQU0sS0FBSztFQUMvRTtFQUNBLElBQUk4RCxnQkFBZ0I7RUFDcEIsSUFBSUMsYUFBYTtFQUNqQixRQUFRMUQsT0FBTztJQUNiLEtBQUssVUFBVTtNQUNiLE9BQU87UUFBRUcsR0FBRyxFQUFFLEtBQUs7UUFBRUcsS0FBSyxFQUFFTDtNQUFVLENBQUM7SUFDekMsS0FBSyxXQUFXO01BQ2R3RCxnQkFBZ0IsR0FBR2pELHFCQUFxQixDQUFDUCxTQUFTLENBQUM7TUFDbkR5RCxhQUFhLEdBQ1gsT0FBT0QsZ0JBQWdCLEtBQUssUUFBUSxHQUFHLElBQUkvQyxJQUFJLENBQUMrQyxnQkFBZ0IsQ0FBQyxHQUFHQSxnQkFBZ0I7TUFDdEYsT0FBTztRQUFFdEQsR0FBRyxFQUFFLFdBQVc7UUFBRUcsS0FBSyxFQUFFb0Q7TUFBYyxDQUFDO0lBQ25ELEtBQUssZ0NBQWdDO01BQ25DRCxnQkFBZ0IsR0FBR2pELHFCQUFxQixDQUFDUCxTQUFTLENBQUM7TUFDbkR5RCxhQUFhLEdBQ1gsT0FBT0QsZ0JBQWdCLEtBQUssUUFBUSxHQUFHLElBQUkvQyxJQUFJLENBQUMrQyxnQkFBZ0IsQ0FBQyxHQUFHQSxnQkFBZ0I7TUFDdEYsT0FBTztRQUFFdEQsR0FBRyxFQUFFLGdDQUFnQztRQUFFRyxLQUFLLEVBQUVvRDtNQUFjLENBQUM7SUFDeEUsS0FBSyw2QkFBNkI7TUFDaENELGdCQUFnQixHQUFHakQscUJBQXFCLENBQUNQLFNBQVMsQ0FBQztNQUNuRHlELGFBQWEsR0FDWCxPQUFPRCxnQkFBZ0IsS0FBSyxRQUFRLEdBQUcsSUFBSS9DLElBQUksQ0FBQytDLGdCQUFnQixDQUFDLEdBQUdBLGdCQUFnQjtNQUN0RixPQUFPO1FBQUV0RCxHQUFHLEVBQUUsNkJBQTZCO1FBQUVHLEtBQUssRUFBRW9EO01BQWMsQ0FBQztJQUNyRSxLQUFLLDhCQUE4QjtNQUNqQ0QsZ0JBQWdCLEdBQUdqRCxxQkFBcUIsQ0FBQ1AsU0FBUyxDQUFDO01BQ25EeUQsYUFBYSxHQUNYLE9BQU9ELGdCQUFnQixLQUFLLFFBQVEsR0FBRyxJQUFJL0MsSUFBSSxDQUFDK0MsZ0JBQWdCLENBQUMsR0FBR0EsZ0JBQWdCO01BQ3RGLE9BQU87UUFBRXRELEdBQUcsRUFBRSw4QkFBOEI7UUFBRUcsS0FBSyxFQUFFb0Q7TUFBYyxDQUFDO0lBQ3RFLEtBQUssc0JBQXNCO01BQ3pCRCxnQkFBZ0IsR0FBR2pELHFCQUFxQixDQUFDUCxTQUFTLENBQUM7TUFDbkR5RCxhQUFhLEdBQ1gsT0FBT0QsZ0JBQWdCLEtBQUssUUFBUSxHQUFHLElBQUkvQyxJQUFJLENBQUMrQyxnQkFBZ0IsQ0FBQyxHQUFHQSxnQkFBZ0I7TUFDdEYsT0FBTztRQUFFdEQsR0FBRyxFQUFFLHNCQUFzQjtRQUFFRyxLQUFLLEVBQUVvRDtNQUFjLENBQUM7SUFDOUQsS0FBSyxxQkFBcUI7SUFDMUIsS0FBSyxRQUFRO0lBQ2IsS0FBSyxRQUFRO0lBQ2IsS0FBSyxxQkFBcUI7SUFDMUIsS0FBSyxrQkFBa0I7SUFDdkIsS0FBSyxtQkFBbUI7TUFDdEIsT0FBTztRQUFFdkQsR0FBRyxFQUFFSCxPQUFPO1FBQUVNLEtBQUssRUFBRUw7TUFBVSxDQUFDO0lBQzNDLEtBQUssY0FBYztNQUNqQixPQUFPO1FBQUVFLEdBQUcsRUFBRSxnQkFBZ0I7UUFBRUcsS0FBSyxFQUFFTDtNQUFVLENBQUM7SUFDcEQ7TUFDRTtNQUNBLElBQUlELE9BQU8sQ0FBQ3NCLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxFQUFFO1FBQ3BELE1BQU0sSUFBSWhDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQzNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQzBCLGdCQUFnQixFQUFFLG9CQUFvQixHQUFHM0QsT0FBTyxDQUFDO01BQ3JGO01BQ0E7TUFDQSxJQUFJQSxPQUFPLENBQUNzQixLQUFLLENBQUMsNEJBQTRCLENBQUMsRUFBRTtRQUMvQyxPQUFPO1VBQUVuQixHQUFHLEVBQUVILE9BQU87VUFBRU0sS0FBSyxFQUFFTDtRQUFVLENBQUM7TUFDM0M7RUFBQztFQUVMO0VBQ0EsSUFBSUEsU0FBUyxJQUFJQSxTQUFTLENBQUNKLE1BQU0sS0FBSyxPQUFPLEVBQUU7SUFDN0M7SUFDQTtJQUNBLElBQ0dGLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDSSxPQUFPLENBQUMsSUFBSUwsTUFBTSxDQUFDQyxNQUFNLENBQUNJLE9BQU8sQ0FBQyxDQUFDRixJQUFJLElBQUksU0FBUyxJQUNuRUcsU0FBUyxDQUFDSixNQUFNLElBQUksU0FBUyxFQUM3QjtNQUNBRyxPQUFPLEdBQUcsS0FBSyxHQUFHQSxPQUFPO0lBQzNCO0VBQ0Y7O0VBRUE7RUFDQSxJQUFJTSxLQUFLLEdBQUdFLHFCQUFxQixDQUFDUCxTQUFTLENBQUM7RUFDNUMsSUFBSUssS0FBSyxLQUFLRyxlQUFlLEVBQUU7SUFDN0IsT0FBTztNQUFFTixHQUFHLEVBQUVILE9BQU87TUFBRU0sS0FBSyxFQUFFQTtJQUFNLENBQUM7RUFDdkM7O0VBRUE7RUFDQTtFQUNBLElBQUlOLE9BQU8sS0FBSyxLQUFLLEVBQUU7SUFDckIsTUFBTSwwQ0FBMEM7RUFDbEQ7O0VBRUE7RUFDQSxJQUFJQyxTQUFTLFlBQVlXLEtBQUssRUFBRTtJQUM5Qk4sS0FBSyxHQUFHTCxTQUFTLENBQUNZLEdBQUcsQ0FBQ0Msc0JBQXNCLENBQUM7SUFDN0MsT0FBTztNQUFFWCxHQUFHLEVBQUVILE9BQU87TUFBRU0sS0FBSyxFQUFFQTtJQUFNLENBQUM7RUFDdkM7O0VBRUE7RUFDQSxJQUFJeUIsTUFBTSxDQUFDQyxJQUFJLENBQUMvQixTQUFTLENBQUMsQ0FBQzZCLElBQUksQ0FBQzNCLEdBQUcsSUFBSUEsR0FBRyxDQUFDRSxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUlGLEdBQUcsQ0FBQ0UsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUU7SUFDOUUsTUFBTSxJQUFJZixLQUFLLENBQUMyQyxLQUFLLENBQ25CM0MsS0FBSyxDQUFDMkMsS0FBSyxDQUFDQyxrQkFBa0IsRUFDOUIsMERBQTBELENBQzNEO0VBQ0g7RUFDQTVCLEtBQUssR0FBR1UsU0FBUyxDQUFDZixTQUFTLEVBQUVhLHNCQUFzQixDQUFDO0VBQ3BELE9BQU87SUFBRVgsR0FBRyxFQUFFSCxPQUFPO0lBQUVNO0VBQU0sQ0FBQztBQUNoQyxDQUFDO0FBRUQsTUFBTXNELGlDQUFpQyxHQUFHLENBQUNuRSxTQUFTLEVBQUVvRSxVQUFVLEVBQUVsRSxNQUFNLEtBQUs7RUFDM0VrRSxVQUFVLEdBQUdDLFlBQVksQ0FBQ0QsVUFBVSxDQUFDO0VBQ3JDLE1BQU1FLFdBQVcsR0FBRyxDQUFDLENBQUM7RUFDdEIsS0FBSyxNQUFNL0QsT0FBTyxJQUFJNkQsVUFBVSxFQUFFO0lBQ2hDLElBQUlBLFVBQVUsQ0FBQzdELE9BQU8sQ0FBQyxJQUFJNkQsVUFBVSxDQUFDN0QsT0FBTyxDQUFDLENBQUNILE1BQU0sS0FBSyxVQUFVLEVBQUU7TUFDcEU7SUFDRjtJQUNBLE1BQU07TUFBRU0sR0FBRztNQUFFRztJQUFNLENBQUMsR0FBR2tELHdDQUF3QyxDQUM3RHhELE9BQU8sRUFDUDZELFVBQVUsQ0FBQzdELE9BQU8sQ0FBQyxFQUNuQkwsTUFBTSxDQUNQO0lBQ0QsSUFBSVcsS0FBSyxLQUFLMEQsU0FBUyxFQUFFO01BQ3ZCRCxXQUFXLENBQUM1RCxHQUFHLENBQUMsR0FBR0csS0FBSztJQUMxQjtFQUNGOztFQUVBO0VBQ0EsSUFBSXlELFdBQVcsQ0FBQ0UsU0FBUyxFQUFFO0lBQ3pCRixXQUFXLENBQUNHLFdBQVcsR0FBRyxJQUFJeEQsSUFBSSxDQUFDcUQsV0FBVyxDQUFDRSxTQUFTLENBQUNFLEdBQUcsSUFBSUosV0FBVyxDQUFDRSxTQUFTLENBQUM7SUFDdEYsT0FBT0YsV0FBVyxDQUFDRSxTQUFTO0VBQzlCO0VBQ0EsSUFBSUYsV0FBVyxDQUFDSyxTQUFTLEVBQUU7SUFDekJMLFdBQVcsQ0FBQ00sV0FBVyxHQUFHLElBQUkzRCxJQUFJLENBQUNxRCxXQUFXLENBQUNLLFNBQVMsQ0FBQ0QsR0FBRyxJQUFJSixXQUFXLENBQUNLLFNBQVMsQ0FBQztJQUN0RixPQUFPTCxXQUFXLENBQUNLLFNBQVM7RUFDOUI7RUFFQSxPQUFPTCxXQUFXO0FBQ3BCLENBQUM7O0FBRUQ7QUFDQSxNQUFNTyxlQUFlLEdBQUcsQ0FBQzdFLFNBQVMsRUFBRThFLFVBQVUsRUFBRXJFLGlCQUFpQixLQUFLO0VBQ3BFLE1BQU1zRSxXQUFXLEdBQUcsQ0FBQyxDQUFDO0VBQ3RCLE1BQU1DLEdBQUcsR0FBR1gsWUFBWSxDQUFDUyxVQUFVLENBQUM7RUFDcEMsSUFBSUUsR0FBRyxDQUFDQyxNQUFNLElBQUlELEdBQUcsQ0FBQ0UsTUFBTSxJQUFJRixHQUFHLENBQUNHLElBQUksRUFBRTtJQUN4Q0osV0FBVyxDQUFDSyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ3JCLElBQUlKLEdBQUcsQ0FBQ0MsTUFBTSxFQUFFO01BQ2RGLFdBQVcsQ0FBQ0ssSUFBSSxDQUFDSCxNQUFNLEdBQUdELEdBQUcsQ0FBQ0MsTUFBTTtJQUN0QztJQUNBLElBQUlELEdBQUcsQ0FBQ0UsTUFBTSxFQUFFO01BQ2RILFdBQVcsQ0FBQ0ssSUFBSSxDQUFDRixNQUFNLEdBQUdGLEdBQUcsQ0FBQ0UsTUFBTTtJQUN0QztJQUNBLElBQUlGLEdBQUcsQ0FBQ0csSUFBSSxFQUFFO01BQ1pKLFdBQVcsQ0FBQ0ssSUFBSSxDQUFDRCxJQUFJLEdBQUdILEdBQUcsQ0FBQ0csSUFBSTtJQUNsQztFQUNGO0VBQ0EsS0FBSyxJQUFJNUUsT0FBTyxJQUFJdUUsVUFBVSxFQUFFO0lBQzlCLElBQUlBLFVBQVUsQ0FBQ3ZFLE9BQU8sQ0FBQyxJQUFJdUUsVUFBVSxDQUFDdkUsT0FBTyxDQUFDLENBQUNILE1BQU0sS0FBSyxVQUFVLEVBQUU7TUFDcEU7SUFDRjtJQUNBLElBQUkwRCxHQUFHLEdBQUd4RCwwQkFBMEIsQ0FDbENOLFNBQVMsRUFDVE8sT0FBTyxFQUNQdUUsVUFBVSxDQUFDdkUsT0FBTyxDQUFDLEVBQ25CRSxpQkFBaUIsQ0FDbEI7O0lBRUQ7SUFDQTtJQUNBO0lBQ0EsSUFBSSxPQUFPcUQsR0FBRyxDQUFDakQsS0FBSyxLQUFLLFFBQVEsSUFBSWlELEdBQUcsQ0FBQ2pELEtBQUssS0FBSyxJQUFJLElBQUlpRCxHQUFHLENBQUNqRCxLQUFLLENBQUN3RSxJQUFJLEVBQUU7TUFDekVOLFdBQVcsQ0FBQ2pCLEdBQUcsQ0FBQ2pELEtBQUssQ0FBQ3dFLElBQUksQ0FBQyxHQUFHTixXQUFXLENBQUNqQixHQUFHLENBQUNqRCxLQUFLLENBQUN3RSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7TUFDL0ROLFdBQVcsQ0FBQ2pCLEdBQUcsQ0FBQ2pELEtBQUssQ0FBQ3dFLElBQUksQ0FBQyxDQUFDdkIsR0FBRyxDQUFDcEQsR0FBRyxDQUFDLEdBQUdvRCxHQUFHLENBQUNqRCxLQUFLLENBQUN5RSxHQUFHO0lBQ3RELENBQUMsTUFBTTtNQUNMUCxXQUFXLENBQUMsTUFBTSxDQUFDLEdBQUdBLFdBQVcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7TUFDL0NBLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQ2pCLEdBQUcsQ0FBQ3BELEdBQUcsQ0FBQyxHQUFHb0QsR0FBRyxDQUFDakQsS0FBSztJQUMxQztFQUNGO0VBRUEsT0FBT2tFLFdBQVc7QUFDcEIsQ0FBQzs7QUFFRDtBQUNBLE1BQU1WLFlBQVksR0FBR2tCLFVBQVUsSUFBSTtFQUNqQyxNQUFNQyxjQUFjLHFCQUFRRCxVQUFVLENBQUU7RUFDeEMsTUFBTUosSUFBSSxHQUFHLENBQUMsQ0FBQztFQUVmLElBQUlJLFVBQVUsQ0FBQ0wsTUFBTSxFQUFFO0lBQ3JCSyxVQUFVLENBQUNMLE1BQU0sQ0FBQ08sT0FBTyxDQUFDQyxLQUFLLElBQUk7TUFDakNQLElBQUksQ0FBQ08sS0FBSyxDQUFDLEdBQUc7UUFBRUMsQ0FBQyxFQUFFO01BQUssQ0FBQztJQUMzQixDQUFDLENBQUM7SUFDRkgsY0FBYyxDQUFDTCxJQUFJLEdBQUdBLElBQUk7RUFDNUI7RUFFQSxJQUFJSSxVQUFVLENBQUNOLE1BQU0sRUFBRTtJQUNyQk0sVUFBVSxDQUFDTixNQUFNLENBQUNRLE9BQU8sQ0FBQ0MsS0FBSyxJQUFJO01BQ2pDLElBQUksRUFBRUEsS0FBSyxJQUFJUCxJQUFJLENBQUMsRUFBRTtRQUNwQkEsSUFBSSxDQUFDTyxLQUFLLENBQUMsR0FBRztVQUFFRSxDQUFDLEVBQUU7UUFBSyxDQUFDO01BQzNCLENBQUMsTUFBTTtRQUNMVCxJQUFJLENBQUNPLEtBQUssQ0FBQyxDQUFDRSxDQUFDLEdBQUcsSUFBSTtNQUN0QjtJQUNGLENBQUMsQ0FBQztJQUNGSixjQUFjLENBQUNMLElBQUksR0FBR0EsSUFBSTtFQUM1QjtFQUVBLE9BQU9LLGNBQWM7QUFDdkIsQ0FBQzs7QUFFRDtBQUNBO0FBQ0EsU0FBU3hFLGVBQWUsR0FBRyxDQUFDO0FBRTVCLE1BQU0wQixxQkFBcUIsR0FBR21ELElBQUksSUFBSTtFQUNwQztFQUNBLElBQUksT0FBT0EsSUFBSSxLQUFLLFFBQVEsSUFBSUEsSUFBSSxJQUFJLEVBQUVBLElBQUksWUFBWTVFLElBQUksQ0FBQyxJQUFJNEUsSUFBSSxDQUFDekYsTUFBTSxLQUFLLFNBQVMsRUFBRTtJQUM1RixPQUFPO01BQ0xBLE1BQU0sRUFBRSxTQUFTO01BQ2pCSixTQUFTLEVBQUU2RixJQUFJLENBQUM3RixTQUFTO01BQ3pCOEYsUUFBUSxFQUFFRCxJQUFJLENBQUNDO0lBQ2pCLENBQUM7RUFDSCxDQUFDLE1BQU0sSUFBSSxPQUFPRCxJQUFJLEtBQUssVUFBVSxJQUFJLE9BQU9BLElBQUksS0FBSyxRQUFRLEVBQUU7SUFDakUsTUFBTSxJQUFJaEcsS0FBSyxDQUFDMkMsS0FBSyxDQUFDM0MsS0FBSyxDQUFDMkMsS0FBSyxDQUFDbUIsWUFBWSxFQUFHLDJCQUEwQmtDLElBQUssRUFBQyxDQUFDO0VBQ3BGLENBQUMsTUFBTSxJQUFJRSxTQUFTLENBQUNDLFdBQVcsQ0FBQ0gsSUFBSSxDQUFDLEVBQUU7SUFDdEMsT0FBT0UsU0FBUyxDQUFDRSxjQUFjLENBQUNKLElBQUksQ0FBQztFQUN2QyxDQUFDLE1BQU0sSUFBSUssVUFBVSxDQUFDRixXQUFXLENBQUNILElBQUksQ0FBQyxFQUFFO0lBQ3ZDLE9BQU9LLFVBQVUsQ0FBQ0QsY0FBYyxDQUFDSixJQUFJLENBQUM7RUFDeEMsQ0FBQyxNQUFNLElBQUksT0FBT0EsSUFBSSxLQUFLLFFBQVEsSUFBSUEsSUFBSSxJQUFJQSxJQUFJLENBQUNNLE1BQU0sS0FBSzVCLFNBQVMsRUFBRTtJQUN4RSxPQUFPLElBQUk5QyxNQUFNLENBQUNvRSxJQUFJLENBQUNNLE1BQU0sQ0FBQztFQUNoQyxDQUFDLE1BQU07SUFDTCxPQUFPTixJQUFJO0VBQ2I7QUFDRixDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBUzlFLHFCQUFxQixDQUFDOEUsSUFBSSxFQUFFekMsS0FBSyxFQUFFO0VBQzFDLFFBQVEsT0FBT3lDLElBQUk7SUFDakIsS0FBSyxRQUFRO0lBQ2IsS0FBSyxTQUFTO0lBQ2QsS0FBSyxXQUFXO01BQ2QsT0FBT0EsSUFBSTtJQUNiLEtBQUssUUFBUTtNQUNYLElBQUl6QyxLQUFLLElBQUlBLEtBQUssQ0FBQy9DLElBQUksS0FBSyxTQUFTLEVBQUU7UUFDckMsT0FBUSxHQUFFK0MsS0FBSyxDQUFDZ0QsV0FBWSxJQUFHUCxJQUFLLEVBQUM7TUFDdkM7TUFDQSxPQUFPQSxJQUFJO0lBQ2IsS0FBSyxRQUFRO0lBQ2IsS0FBSyxVQUFVO01BQ2IsTUFBTSxJQUFJaEcsS0FBSyxDQUFDMkMsS0FBSyxDQUFDM0MsS0FBSyxDQUFDMkMsS0FBSyxDQUFDbUIsWUFBWSxFQUFHLDJCQUEwQmtDLElBQUssRUFBQyxDQUFDO0lBQ3BGLEtBQUssUUFBUTtNQUNYLElBQUlBLElBQUksWUFBWTVFLElBQUksRUFBRTtRQUN4QjtRQUNBO1FBQ0EsT0FBTzRFLElBQUk7TUFDYjtNQUVBLElBQUlBLElBQUksS0FBSyxJQUFJLEVBQUU7UUFDakIsT0FBT0EsSUFBSTtNQUNiOztNQUVBO01BQ0EsSUFBSUEsSUFBSSxDQUFDekYsTUFBTSxJQUFJLFNBQVMsRUFBRTtRQUM1QixPQUFRLEdBQUV5RixJQUFJLENBQUM3RixTQUFVLElBQUc2RixJQUFJLENBQUNDLFFBQVMsRUFBQztNQUM3QztNQUNBLElBQUlDLFNBQVMsQ0FBQ0MsV0FBVyxDQUFDSCxJQUFJLENBQUMsRUFBRTtRQUMvQixPQUFPRSxTQUFTLENBQUNFLGNBQWMsQ0FBQ0osSUFBSSxDQUFDO01BQ3ZDO01BQ0EsSUFBSUssVUFBVSxDQUFDRixXQUFXLENBQUNILElBQUksQ0FBQyxFQUFFO1FBQ2hDLE9BQU9LLFVBQVUsQ0FBQ0QsY0FBYyxDQUFDSixJQUFJLENBQUM7TUFDeEM7TUFDQSxJQUFJUSxhQUFhLENBQUNMLFdBQVcsQ0FBQ0gsSUFBSSxDQUFDLEVBQUU7UUFDbkMsT0FBT1EsYUFBYSxDQUFDSixjQUFjLENBQUNKLElBQUksQ0FBQztNQUMzQztNQUNBLElBQUlTLFlBQVksQ0FBQ04sV0FBVyxDQUFDSCxJQUFJLENBQUMsRUFBRTtRQUNsQyxPQUFPUyxZQUFZLENBQUNMLGNBQWMsQ0FBQ0osSUFBSSxDQUFDO01BQzFDO01BQ0EsSUFBSVUsU0FBUyxDQUFDUCxXQUFXLENBQUNILElBQUksQ0FBQyxFQUFFO1FBQy9CLE9BQU9VLFNBQVMsQ0FBQ04sY0FBYyxDQUFDSixJQUFJLENBQUM7TUFDdkM7TUFDQSxPQUFPN0UsZUFBZTtJQUV4QjtNQUNFO01BQ0EsTUFBTSxJQUFJbkIsS0FBSyxDQUFDMkMsS0FBSyxDQUNuQjNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ2dFLHFCQUFxQixFQUNoQyxnQ0FBK0JYLElBQUssRUFBQyxDQUN2QztFQUFDO0FBRVI7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVN2QyxtQkFBbUIsQ0FBQ21ELFVBQVUsRUFBRXJELEtBQUssRUFBRVAsS0FBSyxHQUFHLEtBQUssRUFBRTtFQUM3RCxNQUFNNkQsT0FBTyxHQUFHdEQsS0FBSyxJQUFJQSxLQUFLLENBQUMvQyxJQUFJLElBQUkrQyxLQUFLLENBQUMvQyxJQUFJLEtBQUssT0FBTztFQUM3RCxJQUFJLE9BQU9vRyxVQUFVLEtBQUssUUFBUSxJQUFJLENBQUNBLFVBQVUsRUFBRTtJQUNqRCxPQUFPekYsZUFBZTtFQUN4QjtFQUNBLE1BQU0yRixpQkFBaUIsR0FBR0QsT0FBTyxHQUFHaEUscUJBQXFCLEdBQUczQixxQkFBcUI7RUFDakYsTUFBTTZGLFdBQVcsR0FBR2YsSUFBSSxJQUFJO0lBQzFCLE1BQU1nQixNQUFNLEdBQUdGLGlCQUFpQixDQUFDZCxJQUFJLEVBQUV6QyxLQUFLLENBQUM7SUFDN0MsSUFBSXlELE1BQU0sS0FBSzdGLGVBQWUsRUFBRTtNQUM5QixNQUFNLElBQUluQixLQUFLLENBQUMyQyxLQUFLLENBQUMzQyxLQUFLLENBQUMyQyxLQUFLLENBQUNtQixZQUFZLEVBQUcsYUFBWW1ELElBQUksQ0FBQ0MsU0FBUyxDQUFDbEIsSUFBSSxDQUFFLEVBQUMsQ0FBQztJQUN0RjtJQUNBLE9BQU9nQixNQUFNO0VBQ2YsQ0FBQztFQUNEO0VBQ0E7RUFDQTtFQUNBO0VBQ0EsSUFBSXRFLElBQUksR0FBR0QsTUFBTSxDQUFDQyxJQUFJLENBQUNrRSxVQUFVLENBQUMsQ0FBQ08sSUFBSSxFQUFFLENBQUNDLE9BQU8sRUFBRTtFQUNuRCxJQUFJQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0VBQ2YsS0FBSyxJQUFJeEcsR0FBRyxJQUFJNkIsSUFBSSxFQUFFO0lBQ3BCLFFBQVE3QixHQUFHO01BQ1QsS0FBSyxLQUFLO01BQ1YsS0FBSyxNQUFNO01BQ1gsS0FBSyxLQUFLO01BQ1YsS0FBSyxNQUFNO01BQ1gsS0FBSyxTQUFTO01BQ2QsS0FBSyxLQUFLO01BQ1YsS0FBSyxLQUFLO1FBQUU7VUFDVixNQUFNeUcsR0FBRyxHQUFHVixVQUFVLENBQUMvRixHQUFHLENBQUM7VUFDM0IsSUFBSXlHLEdBQUcsSUFBSSxPQUFPQSxHQUFHLEtBQUssUUFBUSxJQUFJQSxHQUFHLENBQUNDLGFBQWEsRUFBRTtZQUN2RCxJQUFJaEUsS0FBSyxJQUFJQSxLQUFLLENBQUMvQyxJQUFJLEtBQUssTUFBTSxFQUFFO2NBQ2xDLE1BQU0sSUFBSVIsS0FBSyxDQUFDMkMsS0FBSyxDQUNuQjNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ21CLFlBQVksRUFDeEIsZ0RBQWdELENBQ2pEO1lBQ0g7WUFFQSxRQUFRakQsR0FBRztjQUNULEtBQUssU0FBUztjQUNkLEtBQUssS0FBSztjQUNWLEtBQUssS0FBSztnQkFDUixNQUFNLElBQUliLEtBQUssQ0FBQzJDLEtBQUssQ0FDbkIzQyxLQUFLLENBQUMyQyxLQUFLLENBQUNtQixZQUFZLEVBQ3hCLDRFQUE0RSxDQUM3RTtZQUFDO1lBR04sTUFBTTBELFlBQVksR0FBR3ZILEtBQUssQ0FBQ3dILGtCQUFrQixDQUFDSCxHQUFHLENBQUNDLGFBQWEsQ0FBQztZQUNoRSxJQUFJQyxZQUFZLENBQUNFLE1BQU0sS0FBSyxTQUFTLEVBQUU7Y0FDckNMLE1BQU0sQ0FBQ3hHLEdBQUcsQ0FBQyxHQUFHMkcsWUFBWSxDQUFDUixNQUFNO2NBQ2pDO1lBQ0Y7WUFFQVcsZUFBRyxDQUFDQyxJQUFJLENBQUMsbUNBQW1DLEVBQUVKLFlBQVksQ0FBQztZQUMzRCxNQUFNLElBQUl4SCxLQUFLLENBQUMyQyxLQUFLLENBQ25CM0MsS0FBSyxDQUFDMkMsS0FBSyxDQUFDbUIsWUFBWSxFQUN2QixzQkFBcUJqRCxHQUFJLFlBQVcyRyxZQUFZLENBQUNJLElBQUssRUFBQyxDQUN6RDtVQUNIO1VBRUFQLE1BQU0sQ0FBQ3hHLEdBQUcsQ0FBQyxHQUFHa0csV0FBVyxDQUFDTyxHQUFHLENBQUM7VUFDOUI7UUFDRjtNQUVBLEtBQUssS0FBSztNQUNWLEtBQUssTUFBTTtRQUFFO1VBQ1gsTUFBTU8sR0FBRyxHQUFHakIsVUFBVSxDQUFDL0YsR0FBRyxDQUFDO1VBQzNCLElBQUksRUFBRWdILEdBQUcsWUFBWXZHLEtBQUssQ0FBQyxFQUFFO1lBQzNCLE1BQU0sSUFBSXRCLEtBQUssQ0FBQzJDLEtBQUssQ0FBQzNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ21CLFlBQVksRUFBRSxNQUFNLEdBQUdqRCxHQUFHLEdBQUcsUUFBUSxDQUFDO1VBQzFFO1VBQ0F3RyxNQUFNLENBQUN4RyxHQUFHLENBQUMsR0FBR2lILGVBQUMsQ0FBQ0MsT0FBTyxDQUFDRixHQUFHLEVBQUU3RyxLQUFLLElBQUk7WUFDcEMsT0FBTyxDQUFDZ0YsSUFBSSxJQUFJO2NBQ2QsSUFBSTFFLEtBQUssQ0FBQ2EsT0FBTyxDQUFDNkQsSUFBSSxDQUFDLEVBQUU7Z0JBQ3ZCLE9BQU9oRixLQUFLLENBQUNPLEdBQUcsQ0FBQ3dGLFdBQVcsQ0FBQztjQUMvQixDQUFDLE1BQU07Z0JBQ0wsT0FBT0EsV0FBVyxDQUFDZixJQUFJLENBQUM7Y0FDMUI7WUFDRixDQUFDLEVBQUVoRixLQUFLLENBQUM7VUFDWCxDQUFDLENBQUM7VUFDRjtRQUNGO01BQ0EsS0FBSyxNQUFNO1FBQUU7VUFDWCxNQUFNNkcsR0FBRyxHQUFHakIsVUFBVSxDQUFDL0YsR0FBRyxDQUFDO1VBQzNCLElBQUksRUFBRWdILEdBQUcsWUFBWXZHLEtBQUssQ0FBQyxFQUFFO1lBQzNCLE1BQU0sSUFBSXRCLEtBQUssQ0FBQzJDLEtBQUssQ0FBQzNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ21CLFlBQVksRUFBRSxNQUFNLEdBQUdqRCxHQUFHLEdBQUcsUUFBUSxDQUFDO1VBQzFFO1VBQ0F3RyxNQUFNLENBQUN4RyxHQUFHLENBQUMsR0FBR2dILEdBQUcsQ0FBQ3RHLEdBQUcsQ0FBQ3NCLHFCQUFxQixDQUFDO1VBRTVDLE1BQU1YLE1BQU0sR0FBR21GLE1BQU0sQ0FBQ3hHLEdBQUcsQ0FBQztVQUMxQixJQUFJMEIsZUFBZSxDQUFDTCxNQUFNLENBQUMsSUFBSSxDQUFDRCxzQkFBc0IsQ0FBQ0MsTUFBTSxDQUFDLEVBQUU7WUFDOUQsTUFBTSxJQUFJbEMsS0FBSyxDQUFDMkMsS0FBSyxDQUNuQjNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ21CLFlBQVksRUFDeEIsaURBQWlELEdBQUc1QixNQUFNLENBQzNEO1VBQ0g7VUFFQTtRQUNGO01BQ0EsS0FBSyxRQUFRO1FBQ1gsSUFBSThGLENBQUMsR0FBR3BCLFVBQVUsQ0FBQy9GLEdBQUcsQ0FBQztRQUN2QixJQUFJLE9BQU9tSCxDQUFDLEtBQUssUUFBUSxFQUFFO1VBQ3pCLE1BQU0sSUFBSWhJLEtBQUssQ0FBQzJDLEtBQUssQ0FBQzNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ21CLFlBQVksRUFBRSxhQUFhLEdBQUdrRSxDQUFDLENBQUM7UUFDcEU7UUFDQVgsTUFBTSxDQUFDeEcsR0FBRyxDQUFDLEdBQUdtSCxDQUFDO1FBQ2Y7TUFFRixLQUFLLGNBQWM7UUFBRTtVQUNuQixNQUFNSCxHQUFHLEdBQUdqQixVQUFVLENBQUMvRixHQUFHLENBQUM7VUFDM0IsSUFBSSxFQUFFZ0gsR0FBRyxZQUFZdkcsS0FBSyxDQUFDLEVBQUU7WUFDM0IsTUFBTSxJQUFJdEIsS0FBSyxDQUFDMkMsS0FBSyxDQUFDM0MsS0FBSyxDQUFDMkMsS0FBSyxDQUFDbUIsWUFBWSxFQUFHLHNDQUFxQyxDQUFDO1VBQ3pGO1VBQ0F1RCxNQUFNLENBQUMxRCxVQUFVLEdBQUc7WUFDbEJzRSxJQUFJLEVBQUVKLEdBQUcsQ0FBQ3RHLEdBQUcsQ0FBQ3dGLFdBQVc7VUFDM0IsQ0FBQztVQUNEO1FBQ0Y7TUFDQSxLQUFLLFVBQVU7UUFDYk0sTUFBTSxDQUFDeEcsR0FBRyxDQUFDLEdBQUcrRixVQUFVLENBQUMvRixHQUFHLENBQUM7UUFDN0I7TUFFRixLQUFLLE9BQU87UUFBRTtVQUNaLE1BQU1xSCxNQUFNLEdBQUd0QixVQUFVLENBQUMvRixHQUFHLENBQUMsQ0FBQ3NILE9BQU87VUFDdEMsSUFBSSxPQUFPRCxNQUFNLEtBQUssUUFBUSxFQUFFO1lBQzlCLE1BQU0sSUFBSWxJLEtBQUssQ0FBQzJDLEtBQUssQ0FBQzNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ21CLFlBQVksRUFBRyxzQ0FBcUMsQ0FBQztVQUN6RjtVQUNBLElBQUksQ0FBQ29FLE1BQU0sQ0FBQ0UsS0FBSyxJQUFJLE9BQU9GLE1BQU0sQ0FBQ0UsS0FBSyxLQUFLLFFBQVEsRUFBRTtZQUNyRCxNQUFNLElBQUlwSSxLQUFLLENBQUMyQyxLQUFLLENBQUMzQyxLQUFLLENBQUMyQyxLQUFLLENBQUNtQixZQUFZLEVBQUcsb0NBQW1DLENBQUM7VUFDdkYsQ0FBQyxNQUFNO1lBQ0x1RCxNQUFNLENBQUN4RyxHQUFHLENBQUMsR0FBRztjQUNac0gsT0FBTyxFQUFFRCxNQUFNLENBQUNFO1lBQ2xCLENBQUM7VUFDSDtVQUNBLElBQUlGLE1BQU0sQ0FBQ0csU0FBUyxJQUFJLE9BQU9ILE1BQU0sQ0FBQ0csU0FBUyxLQUFLLFFBQVEsRUFBRTtZQUM1RCxNQUFNLElBQUlySSxLQUFLLENBQUMyQyxLQUFLLENBQUMzQyxLQUFLLENBQUMyQyxLQUFLLENBQUNtQixZQUFZLEVBQUcsd0NBQXVDLENBQUM7VUFDM0YsQ0FBQyxNQUFNLElBQUlvRSxNQUFNLENBQUNHLFNBQVMsRUFBRTtZQUMzQmhCLE1BQU0sQ0FBQ3hHLEdBQUcsQ0FBQyxDQUFDd0gsU0FBUyxHQUFHSCxNQUFNLENBQUNHLFNBQVM7VUFDMUM7VUFDQSxJQUFJSCxNQUFNLENBQUNJLGNBQWMsSUFBSSxPQUFPSixNQUFNLENBQUNJLGNBQWMsS0FBSyxTQUFTLEVBQUU7WUFDdkUsTUFBTSxJQUFJdEksS0FBSyxDQUFDMkMsS0FBSyxDQUNuQjNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ21CLFlBQVksRUFDdkIsOENBQTZDLENBQy9DO1VBQ0gsQ0FBQyxNQUFNLElBQUlvRSxNQUFNLENBQUNJLGNBQWMsRUFBRTtZQUNoQ2pCLE1BQU0sQ0FBQ3hHLEdBQUcsQ0FBQyxDQUFDeUgsY0FBYyxHQUFHSixNQUFNLENBQUNJLGNBQWM7VUFDcEQ7VUFDQSxJQUFJSixNQUFNLENBQUNLLG1CQUFtQixJQUFJLE9BQU9MLE1BQU0sQ0FBQ0ssbUJBQW1CLEtBQUssU0FBUyxFQUFFO1lBQ2pGLE1BQU0sSUFBSXZJLEtBQUssQ0FBQzJDLEtBQUssQ0FDbkIzQyxLQUFLLENBQUMyQyxLQUFLLENBQUNtQixZQUFZLEVBQ3ZCLG1EQUFrRCxDQUNwRDtVQUNILENBQUMsTUFBTSxJQUFJb0UsTUFBTSxDQUFDSyxtQkFBbUIsRUFBRTtZQUNyQ2xCLE1BQU0sQ0FBQ3hHLEdBQUcsQ0FBQyxDQUFDMEgsbUJBQW1CLEdBQUdMLE1BQU0sQ0FBQ0ssbUJBQW1CO1VBQzlEO1VBQ0E7UUFDRjtNQUNBLEtBQUssYUFBYTtRQUFFO1VBQ2xCLE1BQU1DLEtBQUssR0FBRzVCLFVBQVUsQ0FBQy9GLEdBQUcsQ0FBQztVQUM3QixJQUFJbUMsS0FBSyxFQUFFO1lBQ1RxRSxNQUFNLENBQUNvQixVQUFVLEdBQUc7Y0FDbEJDLGFBQWEsRUFBRSxDQUFDLENBQUNGLEtBQUssQ0FBQ0csU0FBUyxFQUFFSCxLQUFLLENBQUNJLFFBQVEsQ0FBQyxFQUFFaEMsVUFBVSxDQUFDaUMsWUFBWTtZQUM1RSxDQUFDO1VBQ0gsQ0FBQyxNQUFNO1lBQ0x4QixNQUFNLENBQUN4RyxHQUFHLENBQUMsR0FBRyxDQUFDMkgsS0FBSyxDQUFDRyxTQUFTLEVBQUVILEtBQUssQ0FBQ0ksUUFBUSxDQUFDO1VBQ2pEO1VBQ0E7UUFDRjtNQUNBLEtBQUssY0FBYztRQUFFO1VBQ25CLElBQUk1RixLQUFLLEVBQUU7WUFDVDtVQUNGO1VBQ0FxRSxNQUFNLENBQUN4RyxHQUFHLENBQUMsR0FBRytGLFVBQVUsQ0FBQy9GLEdBQUcsQ0FBQztVQUM3QjtRQUNGO01BQ0E7TUFDQTtNQUNBLEtBQUssdUJBQXVCO1FBQzFCd0csTUFBTSxDQUFDLGNBQWMsQ0FBQyxHQUFHVCxVQUFVLENBQUMvRixHQUFHLENBQUM7UUFDeEM7TUFDRixLQUFLLHFCQUFxQjtRQUN4QndHLE1BQU0sQ0FBQyxjQUFjLENBQUMsR0FBR1QsVUFBVSxDQUFDL0YsR0FBRyxDQUFDLEdBQUcsSUFBSTtRQUMvQztNQUNGLEtBQUssMEJBQTBCO1FBQzdCd0csTUFBTSxDQUFDLGNBQWMsQ0FBQyxHQUFHVCxVQUFVLENBQUMvRixHQUFHLENBQUMsR0FBRyxJQUFJO1FBQy9DO01BRUYsS0FBSyxTQUFTO01BQ2QsS0FBSyxhQUFhO1FBQ2hCLE1BQU0sSUFBSWIsS0FBSyxDQUFDMkMsS0FBSyxDQUNuQjNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ21HLG1CQUFtQixFQUMvQixNQUFNLEdBQUdqSSxHQUFHLEdBQUcsa0NBQWtDLENBQ2xEO01BRUgsS0FBSyxTQUFTO1FBQ1osSUFBSWtJLEdBQUcsR0FBR25DLFVBQVUsQ0FBQy9GLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUNqQyxJQUFJLENBQUNrSSxHQUFHLElBQUlBLEdBQUcsQ0FBQzNHLE1BQU0sSUFBSSxDQUFDLEVBQUU7VUFDM0IsTUFBTSxJQUFJcEMsS0FBSyxDQUFDMkMsS0FBSyxDQUFDM0MsS0FBSyxDQUFDMkMsS0FBSyxDQUFDbUIsWUFBWSxFQUFFLDBCQUEwQixDQUFDO1FBQzdFO1FBQ0F1RCxNQUFNLENBQUN4RyxHQUFHLENBQUMsR0FBRztVQUNabUksSUFBSSxFQUFFLENBQ0osQ0FBQ0QsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDSixTQUFTLEVBQUVJLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQ0gsUUFBUSxDQUFDLEVBQ25DLENBQUNHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQ0osU0FBUyxFQUFFSSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUNILFFBQVEsQ0FBQztRQUV2QyxDQUFDO1FBQ0Q7TUFFRixLQUFLLFlBQVk7UUFBRTtVQUNqQixNQUFNSyxPQUFPLEdBQUdyQyxVQUFVLENBQUMvRixHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUM7VUFDM0MsTUFBTXFJLFlBQVksR0FBR3RDLFVBQVUsQ0FBQy9GLEdBQUcsQ0FBQyxDQUFDLGVBQWUsQ0FBQztVQUNyRCxJQUFJb0ksT0FBTyxLQUFLdkUsU0FBUyxFQUFFO1lBQ3pCLElBQUl5RSxNQUFNO1lBQ1YsSUFBSSxPQUFPRixPQUFPLEtBQUssUUFBUSxJQUFJQSxPQUFPLENBQUMxSSxNQUFNLEtBQUssU0FBUyxFQUFFO2NBQy9ELElBQUksQ0FBQzBJLE9BQU8sQ0FBQ0csV0FBVyxJQUFJSCxPQUFPLENBQUNHLFdBQVcsQ0FBQ2hILE1BQU0sR0FBRyxDQUFDLEVBQUU7Z0JBQzFELE1BQU0sSUFBSXBDLEtBQUssQ0FBQzJDLEtBQUssQ0FDbkIzQyxLQUFLLENBQUMyQyxLQUFLLENBQUNtQixZQUFZLEVBQ3hCLG1GQUFtRixDQUNwRjtjQUNIO2NBQ0FxRixNQUFNLEdBQUdGLE9BQU8sQ0FBQ0csV0FBVztZQUM5QixDQUFDLE1BQU0sSUFBSUgsT0FBTyxZQUFZM0gsS0FBSyxFQUFFO2NBQ25DLElBQUkySCxPQUFPLENBQUM3RyxNQUFNLEdBQUcsQ0FBQyxFQUFFO2dCQUN0QixNQUFNLElBQUlwQyxLQUFLLENBQUMyQyxLQUFLLENBQ25CM0MsS0FBSyxDQUFDMkMsS0FBSyxDQUFDbUIsWUFBWSxFQUN4QixvRUFBb0UsQ0FDckU7Y0FDSDtjQUNBcUYsTUFBTSxHQUFHRixPQUFPO1lBQ2xCLENBQUMsTUFBTTtjQUNMLE1BQU0sSUFBSWpKLEtBQUssQ0FBQzJDLEtBQUssQ0FDbkIzQyxLQUFLLENBQUMyQyxLQUFLLENBQUNtQixZQUFZLEVBQ3hCLHNGQUFzRixDQUN2RjtZQUNIO1lBQ0FxRixNQUFNLEdBQUdBLE1BQU0sQ0FBQzVILEdBQUcsQ0FBQ2lILEtBQUssSUFBSTtjQUMzQixJQUFJQSxLQUFLLFlBQVlsSCxLQUFLLElBQUlrSCxLQUFLLENBQUNwRyxNQUFNLEtBQUssQ0FBQyxFQUFFO2dCQUNoRHBDLEtBQUssQ0FBQ3FKLFFBQVEsQ0FBQ0MsU0FBUyxDQUFDZCxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUVBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDNUMsT0FBT0EsS0FBSztjQUNkO2NBQ0EsSUFBSSxDQUFDaEMsYUFBYSxDQUFDTCxXQUFXLENBQUNxQyxLQUFLLENBQUMsRUFBRTtnQkFDckMsTUFBTSxJQUFJeEksS0FBSyxDQUFDMkMsS0FBSyxDQUFDM0MsS0FBSyxDQUFDMkMsS0FBSyxDQUFDbUIsWUFBWSxFQUFFLHNCQUFzQixDQUFDO2NBQ3pFLENBQUMsTUFBTTtnQkFDTDlELEtBQUssQ0FBQ3FKLFFBQVEsQ0FBQ0MsU0FBUyxDQUFDZCxLQUFLLENBQUNJLFFBQVEsRUFBRUosS0FBSyxDQUFDRyxTQUFTLENBQUM7Y0FDM0Q7Y0FDQSxPQUFPLENBQUNILEtBQUssQ0FBQ0csU0FBUyxFQUFFSCxLQUFLLENBQUNJLFFBQVEsQ0FBQztZQUMxQyxDQUFDLENBQUM7WUFDRnZCLE1BQU0sQ0FBQ3hHLEdBQUcsQ0FBQyxHQUFHO2NBQ1owSSxRQUFRLEVBQUVKO1lBQ1osQ0FBQztVQUNILENBQUMsTUFBTSxJQUFJRCxZQUFZLEtBQUt4RSxTQUFTLEVBQUU7WUFDckMsSUFBSSxFQUFFd0UsWUFBWSxZQUFZNUgsS0FBSyxDQUFDLElBQUk0SCxZQUFZLENBQUM5RyxNQUFNLEdBQUcsQ0FBQyxFQUFFO2NBQy9ELE1BQU0sSUFBSXBDLEtBQUssQ0FBQzJDLEtBQUssQ0FDbkIzQyxLQUFLLENBQUMyQyxLQUFLLENBQUNtQixZQUFZLEVBQ3hCLHVGQUF1RixDQUN4RjtZQUNIO1lBQ0E7WUFDQSxJQUFJMEUsS0FBSyxHQUFHVSxZQUFZLENBQUMsQ0FBQyxDQUFDO1lBQzNCLElBQUlWLEtBQUssWUFBWWxILEtBQUssSUFBSWtILEtBQUssQ0FBQ3BHLE1BQU0sS0FBSyxDQUFDLEVBQUU7Y0FDaERvRyxLQUFLLEdBQUcsSUFBSXhJLEtBQUssQ0FBQ3FKLFFBQVEsQ0FBQ2IsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEQsQ0FBQyxNQUFNLElBQUksQ0FBQ2hDLGFBQWEsQ0FBQ0wsV0FBVyxDQUFDcUMsS0FBSyxDQUFDLEVBQUU7Y0FDNUMsTUFBTSxJQUFJeEksS0FBSyxDQUFDMkMsS0FBSyxDQUNuQjNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ21CLFlBQVksRUFDeEIsdURBQXVELENBQ3hEO1lBQ0g7WUFDQTlELEtBQUssQ0FBQ3FKLFFBQVEsQ0FBQ0MsU0FBUyxDQUFDZCxLQUFLLENBQUNJLFFBQVEsRUFBRUosS0FBSyxDQUFDRyxTQUFTLENBQUM7WUFDekQ7WUFDQSxNQUFNYSxRQUFRLEdBQUdOLFlBQVksQ0FBQyxDQUFDLENBQUM7WUFDaEMsSUFBSU8sS0FBSyxDQUFDRCxRQUFRLENBQUMsSUFBSUEsUUFBUSxHQUFHLENBQUMsRUFBRTtjQUNuQyxNQUFNLElBQUl4SixLQUFLLENBQUMyQyxLQUFLLENBQ25CM0MsS0FBSyxDQUFDMkMsS0FBSyxDQUFDbUIsWUFBWSxFQUN4QixzREFBc0QsQ0FDdkQ7WUFDSDtZQUNBdUQsTUFBTSxDQUFDeEcsR0FBRyxDQUFDLEdBQUc7Y0FDWjZILGFBQWEsRUFBRSxDQUFDLENBQUNGLEtBQUssQ0FBQ0csU0FBUyxFQUFFSCxLQUFLLENBQUNJLFFBQVEsQ0FBQyxFQUFFWSxRQUFRO1lBQzdELENBQUM7VUFDSDtVQUNBO1FBQ0Y7TUFDQSxLQUFLLGdCQUFnQjtRQUFFO1VBQ3JCLE1BQU1oQixLQUFLLEdBQUc1QixVQUFVLENBQUMvRixHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUM7VUFDdkMsSUFBSSxDQUFDMkYsYUFBYSxDQUFDTCxXQUFXLENBQUNxQyxLQUFLLENBQUMsRUFBRTtZQUNyQyxNQUFNLElBQUl4SSxLQUFLLENBQUMyQyxLQUFLLENBQ25CM0MsS0FBSyxDQUFDMkMsS0FBSyxDQUFDbUIsWUFBWSxFQUN4QixvREFBb0QsQ0FDckQ7VUFDSCxDQUFDLE1BQU07WUFDTDlELEtBQUssQ0FBQ3FKLFFBQVEsQ0FBQ0MsU0FBUyxDQUFDZCxLQUFLLENBQUNJLFFBQVEsRUFBRUosS0FBSyxDQUFDRyxTQUFTLENBQUM7VUFDM0Q7VUFDQXRCLE1BQU0sQ0FBQ3hHLEdBQUcsQ0FBQyxHQUFHO1lBQ1o2SSxTQUFTLEVBQUU7Y0FDVGxKLElBQUksRUFBRSxPQUFPO2NBQ2I0SSxXQUFXLEVBQUUsQ0FBQ1osS0FBSyxDQUFDRyxTQUFTLEVBQUVILEtBQUssQ0FBQ0ksUUFBUTtZQUMvQztVQUNGLENBQUM7VUFDRDtRQUNGO01BQ0E7UUFDRSxJQUFJL0gsR0FBRyxDQUFDbUIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1VBQ3JCLE1BQU0sSUFBSWhDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQzNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ21CLFlBQVksRUFBRSxrQkFBa0IsR0FBR2pELEdBQUcsQ0FBQztRQUMzRTtRQUNBLE9BQU9NLGVBQWU7SUFBQztFQUU3QjtFQUNBLE9BQU9rRyxNQUFNO0FBQ2Y7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLFNBQVM1Rix1QkFBdUIsQ0FBQztFQUFFK0QsSUFBSTtFQUFFbUUsTUFBTTtFQUFFQztBQUFRLENBQUMsRUFBRUMsT0FBTyxFQUFFO0VBQ25FLFFBQVFyRSxJQUFJO0lBQ1YsS0FBSyxRQUFRO01BQ1gsSUFBSXFFLE9BQU8sRUFBRTtRQUNYLE9BQU9uRixTQUFTO01BQ2xCLENBQUMsTUFBTTtRQUNMLE9BQU87VUFBRWMsSUFBSSxFQUFFLFFBQVE7VUFBRUMsR0FBRyxFQUFFO1FBQUcsQ0FBQztNQUNwQztJQUVGLEtBQUssV0FBVztNQUNkLElBQUksT0FBT2tFLE1BQU0sS0FBSyxRQUFRLEVBQUU7UUFDOUIsTUFBTSxJQUFJM0osS0FBSyxDQUFDMkMsS0FBSyxDQUFDM0MsS0FBSyxDQUFDMkMsS0FBSyxDQUFDbUIsWUFBWSxFQUFFLG9DQUFvQyxDQUFDO01BQ3ZGO01BQ0EsSUFBSStGLE9BQU8sRUFBRTtRQUNYLE9BQU9GLE1BQU07TUFDZixDQUFDLE1BQU07UUFDTCxPQUFPO1VBQUVuRSxJQUFJLEVBQUUsTUFBTTtVQUFFQyxHQUFHLEVBQUVrRTtRQUFPLENBQUM7TUFDdEM7SUFFRixLQUFLLEtBQUs7SUFDVixLQUFLLFdBQVc7TUFDZCxJQUFJLEVBQUVDLE9BQU8sWUFBWXRJLEtBQUssQ0FBQyxFQUFFO1FBQy9CLE1BQU0sSUFBSXRCLEtBQUssQ0FBQzJDLEtBQUssQ0FBQzNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ21CLFlBQVksRUFBRSxpQ0FBaUMsQ0FBQztNQUNwRjtNQUNBLElBQUlnRyxLQUFLLEdBQUdGLE9BQU8sQ0FBQ3JJLEdBQUcsQ0FBQ3NCLHFCQUFxQixDQUFDO01BQzlDLElBQUlnSCxPQUFPLEVBQUU7UUFDWCxPQUFPQyxLQUFLO01BQ2QsQ0FBQyxNQUFNO1FBQ0wsSUFBSUMsT0FBTyxHQUFHO1VBQ1pDLEdBQUcsRUFBRSxPQUFPO1VBQ1pDLFNBQVMsRUFBRTtRQUNiLENBQUMsQ0FBQ3pFLElBQUksQ0FBQztRQUNQLE9BQU87VUFBRUEsSUFBSSxFQUFFdUUsT0FBTztVQUFFdEUsR0FBRyxFQUFFO1lBQUV5RSxLQUFLLEVBQUVKO1VBQU07UUFBRSxDQUFDO01BQ2pEO0lBRUYsS0FBSyxRQUFRO01BQ1gsSUFBSSxFQUFFRixPQUFPLFlBQVl0SSxLQUFLLENBQUMsRUFBRTtRQUMvQixNQUFNLElBQUl0QixLQUFLLENBQUMyQyxLQUFLLENBQUMzQyxLQUFLLENBQUMyQyxLQUFLLENBQUNtQixZQUFZLEVBQUUsb0NBQW9DLENBQUM7TUFDdkY7TUFDQSxJQUFJcUcsUUFBUSxHQUFHUCxPQUFPLENBQUNySSxHQUFHLENBQUNzQixxQkFBcUIsQ0FBQztNQUNqRCxJQUFJZ0gsT0FBTyxFQUFFO1FBQ1gsT0FBTyxFQUFFO01BQ1gsQ0FBQyxNQUFNO1FBQ0wsT0FBTztVQUFFckUsSUFBSSxFQUFFLFVBQVU7VUFBRUMsR0FBRyxFQUFFMEU7UUFBUyxDQUFDO01BQzVDO0lBRUY7TUFDRSxNQUFNLElBQUluSyxLQUFLLENBQUMyQyxLQUFLLENBQ25CM0MsS0FBSyxDQUFDMkMsS0FBSyxDQUFDbUcsbUJBQW1CLEVBQzlCLE9BQU10RCxJQUFLLGlDQUFnQyxDQUM3QztFQUFDO0FBRVI7QUFDQSxTQUFTOUQsU0FBUyxDQUFDMEksTUFBTSxFQUFFQyxRQUFRLEVBQUU7RUFDbkMsTUFBTXJELE1BQU0sR0FBRyxDQUFDLENBQUM7RUFDakJ2RSxNQUFNLENBQUNDLElBQUksQ0FBQzBILE1BQU0sQ0FBQyxDQUFDeEUsT0FBTyxDQUFDL0UsR0FBRyxJQUFJO0lBQ2pDbUcsTUFBTSxDQUFDbkcsR0FBRyxDQUFDLEdBQUd3SixRQUFRLENBQUNELE1BQU0sQ0FBQ3ZKLEdBQUcsQ0FBQyxDQUFDO0VBQ3JDLENBQUMsQ0FBQztFQUNGLE9BQU9tRyxNQUFNO0FBQ2Y7QUFFQSxNQUFNc0Qsb0NBQW9DLEdBQUdDLFdBQVcsSUFBSTtFQUMxRCxRQUFRLE9BQU9BLFdBQVc7SUFDeEIsS0FBSyxRQUFRO0lBQ2IsS0FBSyxRQUFRO0lBQ2IsS0FBSyxTQUFTO0lBQ2QsS0FBSyxXQUFXO01BQ2QsT0FBT0EsV0FBVztJQUNwQixLQUFLLFFBQVE7SUFDYixLQUFLLFVBQVU7TUFDYixNQUFNLG1EQUFtRDtJQUMzRCxLQUFLLFFBQVE7TUFDWCxJQUFJQSxXQUFXLEtBQUssSUFBSSxFQUFFO1FBQ3hCLE9BQU8sSUFBSTtNQUNiO01BQ0EsSUFBSUEsV0FBVyxZQUFZakosS0FBSyxFQUFFO1FBQ2hDLE9BQU9pSixXQUFXLENBQUNoSixHQUFHLENBQUMrSSxvQ0FBb0MsQ0FBQztNQUM5RDtNQUVBLElBQUlDLFdBQVcsWUFBWW5KLElBQUksRUFBRTtRQUMvQixPQUFPcEIsS0FBSyxDQUFDd0ssT0FBTyxDQUFDRCxXQUFXLENBQUM7TUFDbkM7TUFFQSxJQUFJQSxXQUFXLFlBQVl6SyxPQUFPLENBQUMySyxJQUFJLEVBQUU7UUFDdkMsT0FBT0YsV0FBVyxDQUFDRyxRQUFRLEVBQUU7TUFDL0I7TUFFQSxJQUFJSCxXQUFXLFlBQVl6SyxPQUFPLENBQUM2SyxNQUFNLEVBQUU7UUFDekMsT0FBT0osV0FBVyxDQUFDdkosS0FBSztNQUMxQjtNQUVBLElBQUlxRixVQUFVLENBQUN1RSxxQkFBcUIsQ0FBQ0wsV0FBVyxDQUFDLEVBQUU7UUFDakQsT0FBT2xFLFVBQVUsQ0FBQ3dFLGNBQWMsQ0FBQ04sV0FBVyxDQUFDO01BQy9DO01BRUEsSUFDRTlILE1BQU0sQ0FBQ3FJLFNBQVMsQ0FBQ0MsY0FBYyxDQUFDQyxJQUFJLENBQUNULFdBQVcsRUFBRSxRQUFRLENBQUMsSUFDM0RBLFdBQVcsQ0FBQ2hLLE1BQU0sSUFBSSxNQUFNLElBQzVCZ0ssV0FBVyxDQUFDMUYsR0FBRyxZQUFZekQsSUFBSSxFQUMvQjtRQUNBbUosV0FBVyxDQUFDMUYsR0FBRyxHQUFHMEYsV0FBVyxDQUFDMUYsR0FBRyxDQUFDb0csTUFBTSxFQUFFO1FBQzFDLE9BQU9WLFdBQVc7TUFDcEI7TUFFQSxPQUFPN0ksU0FBUyxDQUFDNkksV0FBVyxFQUFFRCxvQ0FBb0MsQ0FBQztJQUNyRTtNQUNFLE1BQU0saUJBQWlCO0VBQUM7QUFFOUIsQ0FBQztBQUVELE1BQU1ZLHNCQUFzQixHQUFHLENBQUM3SyxNQUFNLEVBQUVrRCxLQUFLLEVBQUU0SCxhQUFhLEtBQUs7RUFDL0QsTUFBTUMsT0FBTyxHQUFHRCxhQUFhLENBQUNFLEtBQUssQ0FBQyxHQUFHLENBQUM7RUFDeEMsSUFBSUQsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLL0ssTUFBTSxDQUFDQyxNQUFNLENBQUNpRCxLQUFLLENBQUMsQ0FBQ2dELFdBQVcsRUFBRTtJQUNuRCxNQUFNLGdDQUFnQztFQUN4QztFQUNBLE9BQU87SUFDTGhHLE1BQU0sRUFBRSxTQUFTO0lBQ2pCSixTQUFTLEVBQUVpTCxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ3JCbkYsUUFBUSxFQUFFbUYsT0FBTyxDQUFDLENBQUM7RUFDckIsQ0FBQztBQUNILENBQUM7O0FBRUQ7QUFDQTtBQUNBLE1BQU1FLHdCQUF3QixHQUFHLENBQUNuTCxTQUFTLEVBQUVvSyxXQUFXLEVBQUVsSyxNQUFNLEtBQUs7RUFDbkUsUUFBUSxPQUFPa0ssV0FBVztJQUN4QixLQUFLLFFBQVE7SUFDYixLQUFLLFFBQVE7SUFDYixLQUFLLFNBQVM7SUFDZCxLQUFLLFdBQVc7TUFDZCxPQUFPQSxXQUFXO0lBQ3BCLEtBQUssUUFBUTtJQUNiLEtBQUssVUFBVTtNQUNiLE1BQU0sdUNBQXVDO0lBQy9DLEtBQUssUUFBUTtNQUFFO1FBQ2IsSUFBSUEsV0FBVyxLQUFLLElBQUksRUFBRTtVQUN4QixPQUFPLElBQUk7UUFDYjtRQUNBLElBQUlBLFdBQVcsWUFBWWpKLEtBQUssRUFBRTtVQUNoQyxPQUFPaUosV0FBVyxDQUFDaEosR0FBRyxDQUFDK0ksb0NBQW9DLENBQUM7UUFDOUQ7UUFFQSxJQUFJQyxXQUFXLFlBQVluSixJQUFJLEVBQUU7VUFDL0IsT0FBT3BCLEtBQUssQ0FBQ3dLLE9BQU8sQ0FBQ0QsV0FBVyxDQUFDO1FBQ25DO1FBRUEsSUFBSUEsV0FBVyxZQUFZekssT0FBTyxDQUFDMkssSUFBSSxFQUFFO1VBQ3ZDLE9BQU9GLFdBQVcsQ0FBQ0csUUFBUSxFQUFFO1FBQy9CO1FBRUEsSUFBSUgsV0FBVyxZQUFZekssT0FBTyxDQUFDNkssTUFBTSxFQUFFO1VBQ3pDLE9BQU9KLFdBQVcsQ0FBQ3ZKLEtBQUs7UUFDMUI7UUFFQSxJQUFJcUYsVUFBVSxDQUFDdUUscUJBQXFCLENBQUNMLFdBQVcsQ0FBQyxFQUFFO1VBQ2pELE9BQU9sRSxVQUFVLENBQUN3RSxjQUFjLENBQUNOLFdBQVcsQ0FBQztRQUMvQztRQUVBLE1BQU03RSxVQUFVLEdBQUcsQ0FBQyxDQUFDO1FBQ3JCLElBQUk2RSxXQUFXLENBQUNuRixNQUFNLElBQUltRixXQUFXLENBQUNsRixNQUFNLEVBQUU7VUFDNUNLLFVBQVUsQ0FBQ04sTUFBTSxHQUFHbUYsV0FBVyxDQUFDbkYsTUFBTSxJQUFJLEVBQUU7VUFDNUNNLFVBQVUsQ0FBQ0wsTUFBTSxHQUFHa0YsV0FBVyxDQUFDbEYsTUFBTSxJQUFJLEVBQUU7VUFDNUMsT0FBT2tGLFdBQVcsQ0FBQ25GLE1BQU07VUFDekIsT0FBT21GLFdBQVcsQ0FBQ2xGLE1BQU07UUFDM0I7UUFFQSxLQUFLLElBQUl4RSxHQUFHLElBQUkwSixXQUFXLEVBQUU7VUFDM0IsUUFBUTFKLEdBQUc7WUFDVCxLQUFLLEtBQUs7Y0FDUjZFLFVBQVUsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEdBQUc2RSxXQUFXLENBQUMxSixHQUFHLENBQUM7Y0FDOUM7WUFDRixLQUFLLGtCQUFrQjtjQUNyQjZFLFVBQVUsQ0FBQzZGLGdCQUFnQixHQUFHaEIsV0FBVyxDQUFDMUosR0FBRyxDQUFDO2NBQzlDO1lBQ0YsS0FBSyxNQUFNO2NBQ1Q7WUFDRixLQUFLLHFCQUFxQjtZQUMxQixLQUFLLG1CQUFtQjtZQUN4QixLQUFLLDhCQUE4QjtZQUNuQyxLQUFLLHNCQUFzQjtZQUMzQixLQUFLLFlBQVk7WUFDakIsS0FBSyxnQ0FBZ0M7WUFDckMsS0FBSyw2QkFBNkI7WUFDbEMsS0FBSyxxQkFBcUI7WUFDMUIsS0FBSyxtQkFBbUI7Y0FDdEI7Y0FDQTZFLFVBQVUsQ0FBQzdFLEdBQUcsQ0FBQyxHQUFHMEosV0FBVyxDQUFDMUosR0FBRyxDQUFDO2NBQ2xDO1lBQ0YsS0FBSyxnQkFBZ0I7Y0FDbkI2RSxVQUFVLENBQUMsY0FBYyxDQUFDLEdBQUc2RSxXQUFXLENBQUMxSixHQUFHLENBQUM7Y0FDN0M7WUFDRixLQUFLLFdBQVc7WUFDaEIsS0FBSyxhQUFhO2NBQ2hCNkUsVUFBVSxDQUFDLFdBQVcsQ0FBQyxHQUFHMUYsS0FBSyxDQUFDd0ssT0FBTyxDQUFDLElBQUlwSixJQUFJLENBQUNtSixXQUFXLENBQUMxSixHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUNnRSxHQUFHO2NBQ3ZFO1lBQ0YsS0FBSyxXQUFXO1lBQ2hCLEtBQUssYUFBYTtjQUNoQmEsVUFBVSxDQUFDLFdBQVcsQ0FBQyxHQUFHMUYsS0FBSyxDQUFDd0ssT0FBTyxDQUFDLElBQUlwSixJQUFJLENBQUNtSixXQUFXLENBQUMxSixHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUNnRSxHQUFHO2NBQ3ZFO1lBQ0YsS0FBSyxXQUFXO1lBQ2hCLEtBQUssWUFBWTtjQUNmYSxVQUFVLENBQUMsV0FBVyxDQUFDLEdBQUcxRixLQUFLLENBQUN3SyxPQUFPLENBQUMsSUFBSXBKLElBQUksQ0FBQ21KLFdBQVcsQ0FBQzFKLEdBQUcsQ0FBQyxDQUFDLENBQUM7Y0FDbkU7WUFDRixLQUFLLFVBQVU7WUFDZixLQUFLLFlBQVk7Y0FDZjZFLFVBQVUsQ0FBQyxVQUFVLENBQUMsR0FBRzFGLEtBQUssQ0FBQ3dLLE9BQU8sQ0FBQyxJQUFJcEosSUFBSSxDQUFDbUosV0FBVyxDQUFDMUosR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDZ0UsR0FBRztjQUN0RTtZQUNGLEtBQUssV0FBVztZQUNoQixLQUFLLFlBQVk7Y0FDZmEsVUFBVSxDQUFDLFdBQVcsQ0FBQyxHQUFHNkUsV0FBVyxDQUFDMUosR0FBRyxDQUFDO2NBQzFDO1lBQ0YsS0FBSyxVQUFVO2NBQ2IsSUFBSVYsU0FBUyxLQUFLLE9BQU8sRUFBRTtnQkFDekJ3SCxlQUFHLENBQUM2RCxJQUFJLENBQ04sNkZBQTZGLENBQzlGO2NBQ0gsQ0FBQyxNQUFNO2dCQUNMOUYsVUFBVSxDQUFDLFVBQVUsQ0FBQyxHQUFHNkUsV0FBVyxDQUFDMUosR0FBRyxDQUFDO2NBQzNDO2NBQ0E7WUFDRjtjQUNFO2NBQ0EsSUFBSXNDLGFBQWEsR0FBR3RDLEdBQUcsQ0FBQ21CLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQztjQUM3RCxJQUFJbUIsYUFBYSxJQUFJaEQsU0FBUyxLQUFLLE9BQU8sRUFBRTtnQkFDMUMsSUFBSWlELFFBQVEsR0FBR0QsYUFBYSxDQUFDLENBQUMsQ0FBQztnQkFDL0J1QyxVQUFVLENBQUMsVUFBVSxDQUFDLEdBQUdBLFVBQVUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3JEQSxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUN0QyxRQUFRLENBQUMsR0FBR21ILFdBQVcsQ0FBQzFKLEdBQUcsQ0FBQztnQkFDbkQ7Y0FDRjtjQUVBLElBQUlBLEdBQUcsQ0FBQ1EsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDM0IsSUFBSW9LLE1BQU0sR0FBRzVLLEdBQUcsQ0FBQzZLLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQzdCLElBQUksQ0FBQ3JMLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDbUwsTUFBTSxDQUFDLEVBQUU7a0JBQzFCOUQsZUFBRyxDQUFDQyxJQUFJLENBQ04sY0FBYyxFQUNkLHdEQUF3RCxFQUN4RHpILFNBQVMsRUFDVHNMLE1BQU0sQ0FDUDtrQkFDRDtnQkFDRjtnQkFDQSxJQUFJcEwsTUFBTSxDQUFDQyxNQUFNLENBQUNtTCxNQUFNLENBQUMsQ0FBQ2pMLElBQUksS0FBSyxTQUFTLEVBQUU7a0JBQzVDbUgsZUFBRyxDQUFDQyxJQUFJLENBQ04sY0FBYyxFQUNkLHVEQUF1RCxFQUN2RHpILFNBQVMsRUFDVFUsR0FBRyxDQUNKO2tCQUNEO2dCQUNGO2dCQUNBLElBQUkwSixXQUFXLENBQUMxSixHQUFHLENBQUMsS0FBSyxJQUFJLEVBQUU7a0JBQzdCO2dCQUNGO2dCQUNBNkUsVUFBVSxDQUFDK0YsTUFBTSxDQUFDLEdBQUdQLHNCQUFzQixDQUFDN0ssTUFBTSxFQUFFb0wsTUFBTSxFQUFFbEIsV0FBVyxDQUFDMUosR0FBRyxDQUFDLENBQUM7Z0JBQzdFO2NBQ0YsQ0FBQyxNQUFNLElBQUlBLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLElBQUlBLEdBQUcsSUFBSSxRQUFRLEVBQUU7Z0JBQzNDLE1BQU0sMEJBQTBCLEdBQUdBLEdBQUc7Y0FDeEMsQ0FBQyxNQUFNO2dCQUNMLElBQUlHLEtBQUssR0FBR3VKLFdBQVcsQ0FBQzFKLEdBQUcsQ0FBQztnQkFDNUIsSUFDRVIsTUFBTSxDQUFDQyxNQUFNLENBQUNPLEdBQUcsQ0FBQyxJQUNsQlIsTUFBTSxDQUFDQyxNQUFNLENBQUNPLEdBQUcsQ0FBQyxDQUFDTCxJQUFJLEtBQUssTUFBTSxJQUNsQ2tHLFNBQVMsQ0FBQ2tFLHFCQUFxQixDQUFDNUosS0FBSyxDQUFDLEVBQ3RDO2tCQUNBMEUsVUFBVSxDQUFDN0UsR0FBRyxDQUFDLEdBQUc2RixTQUFTLENBQUNtRSxjQUFjLENBQUM3SixLQUFLLENBQUM7a0JBQ2pEO2dCQUNGO2dCQUNBLElBQ0VYLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDTyxHQUFHLENBQUMsSUFDbEJSLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDTyxHQUFHLENBQUMsQ0FBQ0wsSUFBSSxLQUFLLFVBQVUsSUFDdENnRyxhQUFhLENBQUNvRSxxQkFBcUIsQ0FBQzVKLEtBQUssQ0FBQyxFQUMxQztrQkFDQTBFLFVBQVUsQ0FBQzdFLEdBQUcsQ0FBQyxHQUFHMkYsYUFBYSxDQUFDcUUsY0FBYyxDQUFDN0osS0FBSyxDQUFDO2tCQUNyRDtnQkFDRjtnQkFDQSxJQUNFWCxNQUFNLENBQUNDLE1BQU0sQ0FBQ08sR0FBRyxDQUFDLElBQ2xCUixNQUFNLENBQUNDLE1BQU0sQ0FBQ08sR0FBRyxDQUFDLENBQUNMLElBQUksS0FBSyxTQUFTLElBQ3JDaUcsWUFBWSxDQUFDbUUscUJBQXFCLENBQUM1SixLQUFLLENBQUMsRUFDekM7a0JBQ0EwRSxVQUFVLENBQUM3RSxHQUFHLENBQUMsR0FBRzRGLFlBQVksQ0FBQ29FLGNBQWMsQ0FBQzdKLEtBQUssQ0FBQztrQkFDcEQ7Z0JBQ0Y7Z0JBQ0EsSUFDRVgsTUFBTSxDQUFDQyxNQUFNLENBQUNPLEdBQUcsQ0FBQyxJQUNsQlIsTUFBTSxDQUFDQyxNQUFNLENBQUNPLEdBQUcsQ0FBQyxDQUFDTCxJQUFJLEtBQUssT0FBTyxJQUNuQzZGLFVBQVUsQ0FBQ3VFLHFCQUFxQixDQUFDNUosS0FBSyxDQUFDLEVBQ3ZDO2tCQUNBMEUsVUFBVSxDQUFDN0UsR0FBRyxDQUFDLEdBQUd3RixVQUFVLENBQUN3RSxjQUFjLENBQUM3SixLQUFLLENBQUM7a0JBQ2xEO2dCQUNGO2NBQ0Y7Y0FDQTBFLFVBQVUsQ0FBQzdFLEdBQUcsQ0FBQyxHQUFHeUosb0NBQW9DLENBQUNDLFdBQVcsQ0FBQzFKLEdBQUcsQ0FBQyxDQUFDO1VBQUM7UUFFL0U7UUFFQSxNQUFNOEssa0JBQWtCLEdBQUdsSixNQUFNLENBQUNDLElBQUksQ0FBQ3JDLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDLENBQUNzTCxNQUFNLENBQzFEeEwsU0FBUyxJQUFJQyxNQUFNLENBQUNDLE1BQU0sQ0FBQ0YsU0FBUyxDQUFDLENBQUNJLElBQUksS0FBSyxVQUFVLENBQzFEO1FBQ0QsTUFBTXFMLGNBQWMsR0FBRyxDQUFDLENBQUM7UUFDekJGLGtCQUFrQixDQUFDL0YsT0FBTyxDQUFDa0csaUJBQWlCLElBQUk7VUFDOUNELGNBQWMsQ0FBQ0MsaUJBQWlCLENBQUMsR0FBRztZQUNsQ3ZMLE1BQU0sRUFBRSxVQUFVO1lBQ2xCSixTQUFTLEVBQUVFLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDd0wsaUJBQWlCLENBQUMsQ0FBQ3ZGO1VBQzlDLENBQUM7UUFDSCxDQUFDLENBQUM7UUFFRix1Q0FBWWIsVUFBVSxHQUFLbUcsY0FBYztNQUMzQztJQUNBO01BQ0UsTUFBTSxpQkFBaUI7RUFBQztBQUU5QixDQUFDO0FBRUQsSUFBSTNGLFNBQVMsR0FBRztFQUNkRSxjQUFjLENBQUMyRixJQUFJLEVBQUU7SUFDbkIsT0FBTyxJQUFJM0ssSUFBSSxDQUFDMkssSUFBSSxDQUFDbEgsR0FBRyxDQUFDO0VBQzNCLENBQUM7RUFFRHNCLFdBQVcsQ0FBQ25GLEtBQUssRUFBRTtJQUNqQixPQUFPLE9BQU9BLEtBQUssS0FBSyxRQUFRLElBQUlBLEtBQUssS0FBSyxJQUFJLElBQUlBLEtBQUssQ0FBQ1QsTUFBTSxLQUFLLE1BQU07RUFDL0U7QUFDRixDQUFDO0FBRUQsSUFBSThGLFVBQVUsR0FBRztFQUNmMkYsYUFBYSxFQUFFLElBQUlwSyxNQUFNLENBQUMsa0VBQWtFLENBQUM7RUFDN0ZxSyxhQUFhLENBQUM3QixNQUFNLEVBQUU7SUFDcEIsSUFBSSxPQUFPQSxNQUFNLEtBQUssUUFBUSxFQUFFO01BQzlCLE9BQU8sS0FBSztJQUNkO0lBQ0EsT0FBTyxJQUFJLENBQUM0QixhQUFhLENBQUNFLElBQUksQ0FBQzlCLE1BQU0sQ0FBQztFQUN4QyxDQUFDO0VBRURTLGNBQWMsQ0FBQ1QsTUFBTSxFQUFFO0lBQ3JCLElBQUlwSixLQUFLO0lBQ1QsSUFBSSxJQUFJLENBQUNpTCxhQUFhLENBQUM3QixNQUFNLENBQUMsRUFBRTtNQUM5QnBKLEtBQUssR0FBR29KLE1BQU07SUFDaEIsQ0FBQyxNQUFNO01BQ0xwSixLQUFLLEdBQUdvSixNQUFNLENBQUMrQixNQUFNLENBQUNwSyxRQUFRLENBQUMsUUFBUSxDQUFDO0lBQzFDO0lBQ0EsT0FBTztNQUNMeEIsTUFBTSxFQUFFLE9BQU87TUFDZjZMLE1BQU0sRUFBRXBMO0lBQ1YsQ0FBQztFQUNILENBQUM7RUFFRDRKLHFCQUFxQixDQUFDUixNQUFNLEVBQUU7SUFDNUIsT0FBT0EsTUFBTSxZQUFZdEssT0FBTyxDQUFDdU0sTUFBTSxJQUFJLElBQUksQ0FBQ0osYUFBYSxDQUFDN0IsTUFBTSxDQUFDO0VBQ3ZFLENBQUM7RUFFRGhFLGNBQWMsQ0FBQzJGLElBQUksRUFBRTtJQUNuQixPQUFPLElBQUlqTSxPQUFPLENBQUN1TSxNQUFNLENBQUNDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDUixJQUFJLENBQUNLLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztFQUMvRCxDQUFDO0VBRURqRyxXQUFXLENBQUNuRixLQUFLLEVBQUU7SUFDakIsT0FBTyxPQUFPQSxLQUFLLEtBQUssUUFBUSxJQUFJQSxLQUFLLEtBQUssSUFBSSxJQUFJQSxLQUFLLENBQUNULE1BQU0sS0FBSyxPQUFPO0VBQ2hGO0FBQ0YsQ0FBQztBQUVELElBQUlpRyxhQUFhLEdBQUc7RUFDbEJxRSxjQUFjLENBQUNULE1BQU0sRUFBRTtJQUNyQixPQUFPO01BQ0w3SixNQUFNLEVBQUUsVUFBVTtNQUNsQnFJLFFBQVEsRUFBRXdCLE1BQU0sQ0FBQyxDQUFDLENBQUM7TUFDbkJ6QixTQUFTLEVBQUV5QixNQUFNLENBQUMsQ0FBQztJQUNyQixDQUFDO0VBQ0gsQ0FBQztFQUVEUSxxQkFBcUIsQ0FBQ1IsTUFBTSxFQUFFO0lBQzVCLE9BQU9BLE1BQU0sWUFBWTlJLEtBQUssSUFBSThJLE1BQU0sQ0FBQ2hJLE1BQU0sSUFBSSxDQUFDO0VBQ3RELENBQUM7RUFFRGdFLGNBQWMsQ0FBQzJGLElBQUksRUFBRTtJQUNuQixPQUFPLENBQUNBLElBQUksQ0FBQ3BELFNBQVMsRUFBRW9ELElBQUksQ0FBQ25ELFFBQVEsQ0FBQztFQUN4QyxDQUFDO0VBRUR6QyxXQUFXLENBQUNuRixLQUFLLEVBQUU7SUFDakIsT0FBTyxPQUFPQSxLQUFLLEtBQUssUUFBUSxJQUFJQSxLQUFLLEtBQUssSUFBSSxJQUFJQSxLQUFLLENBQUNULE1BQU0sS0FBSyxVQUFVO0VBQ25GO0FBQ0YsQ0FBQztBQUVELElBQUlrRyxZQUFZLEdBQUc7RUFDakJvRSxjQUFjLENBQUNULE1BQU0sRUFBRTtJQUNyQjtJQUNBLE1BQU1vQyxNQUFNLEdBQUdwQyxNQUFNLENBQUNoQixXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM3SCxHQUFHLENBQUNrTCxLQUFLLElBQUk7TUFDaEQsT0FBTyxDQUFDQSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUVBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3QixDQUFDLENBQUM7SUFDRixPQUFPO01BQ0xsTSxNQUFNLEVBQUUsU0FBUztNQUNqQjZJLFdBQVcsRUFBRW9EO0lBQ2YsQ0FBQztFQUNILENBQUM7RUFFRDVCLHFCQUFxQixDQUFDUixNQUFNLEVBQUU7SUFDNUIsTUFBTW9DLE1BQU0sR0FBR3BDLE1BQU0sQ0FBQ2hCLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFDcEMsSUFBSWdCLE1BQU0sQ0FBQzVKLElBQUksS0FBSyxTQUFTLElBQUksRUFBRWdNLE1BQU0sWUFBWWxMLEtBQUssQ0FBQyxFQUFFO01BQzNELE9BQU8sS0FBSztJQUNkO0lBQ0EsS0FBSyxJQUFJZ0IsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHa0ssTUFBTSxDQUFDcEssTUFBTSxFQUFFRSxDQUFDLEVBQUUsRUFBRTtNQUN0QyxNQUFNa0csS0FBSyxHQUFHZ0UsTUFBTSxDQUFDbEssQ0FBQyxDQUFDO01BQ3ZCLElBQUksQ0FBQ2tFLGFBQWEsQ0FBQ29FLHFCQUFxQixDQUFDcEMsS0FBSyxDQUFDLEVBQUU7UUFDL0MsT0FBTyxLQUFLO01BQ2Q7TUFDQXhJLEtBQUssQ0FBQ3FKLFFBQVEsQ0FBQ0MsU0FBUyxDQUFDb0QsVUFBVSxDQUFDbEUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUVrRSxVQUFVLENBQUNsRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RTtJQUNBLE9BQU8sSUFBSTtFQUNiLENBQUM7RUFFRHBDLGNBQWMsQ0FBQzJGLElBQUksRUFBRTtJQUNuQixJQUFJUyxNQUFNLEdBQUdULElBQUksQ0FBQzNDLFdBQVc7SUFDN0I7SUFDQSxJQUNFb0QsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLQSxNQUFNLENBQUNBLE1BQU0sQ0FBQ3BLLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFDN0NvSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUtBLE1BQU0sQ0FBQ0EsTUFBTSxDQUFDcEssTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUM3QztNQUNBb0ssTUFBTSxDQUFDRyxJQUFJLENBQUNILE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4QjtJQUNBLE1BQU1JLE1BQU0sR0FBR0osTUFBTSxDQUFDWixNQUFNLENBQUMsQ0FBQ2lCLElBQUksRUFBRUMsS0FBSyxFQUFFQyxFQUFFLEtBQUs7TUFDaEQsSUFBSUMsVUFBVSxHQUFHLENBQUMsQ0FBQztNQUNuQixLQUFLLElBQUkxSyxDQUFDLEdBQUcsQ0FBQyxFQUFFQSxDQUFDLEdBQUd5SyxFQUFFLENBQUMzSyxNQUFNLEVBQUVFLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDckMsTUFBTTJLLEVBQUUsR0FBR0YsRUFBRSxDQUFDekssQ0FBQyxDQUFDO1FBQ2hCLElBQUkySyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUtKLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSUksRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLSixJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUU7VUFDMUNHLFVBQVUsR0FBRzFLLENBQUM7VUFDZDtRQUNGO01BQ0Y7TUFDQSxPQUFPMEssVUFBVSxLQUFLRixLQUFLO0lBQzdCLENBQUMsQ0FBQztJQUNGLElBQUlGLE1BQU0sQ0FBQ3hLLE1BQU0sR0FBRyxDQUFDLEVBQUU7TUFDckIsTUFBTSxJQUFJcEMsS0FBSyxDQUFDMkMsS0FBSyxDQUNuQjNDLEtBQUssQ0FBQzJDLEtBQUssQ0FBQ2dFLHFCQUFxQixFQUNqQyx1REFBdUQsQ0FDeEQ7SUFDSDtJQUNBO0lBQ0E2RixNQUFNLEdBQUdBLE1BQU0sQ0FBQ2pMLEdBQUcsQ0FBQ2tMLEtBQUssSUFBSTtNQUMzQixPQUFPLENBQUNBLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdCLENBQUMsQ0FBQztJQUNGLE9BQU87TUFBRWpNLElBQUksRUFBRSxTQUFTO01BQUU0SSxXQUFXLEVBQUUsQ0FBQ29ELE1BQU07SUFBRSxDQUFDO0VBQ25ELENBQUM7RUFFRHJHLFdBQVcsQ0FBQ25GLEtBQUssRUFBRTtJQUNqQixPQUFPLE9BQU9BLEtBQUssS0FBSyxRQUFRLElBQUlBLEtBQUssS0FBSyxJQUFJLElBQUlBLEtBQUssQ0FBQ1QsTUFBTSxLQUFLLFNBQVM7RUFDbEY7QUFDRixDQUFDO0FBRUQsSUFBSW1HLFNBQVMsR0FBRztFQUNkbUUsY0FBYyxDQUFDVCxNQUFNLEVBQUU7SUFDckIsT0FBTztNQUNMN0osTUFBTSxFQUFFLE1BQU07TUFDZDJNLElBQUksRUFBRTlDO0lBQ1IsQ0FBQztFQUNILENBQUM7RUFFRFEscUJBQXFCLENBQUNSLE1BQU0sRUFBRTtJQUM1QixPQUFPLE9BQU9BLE1BQU0sS0FBSyxRQUFRO0VBQ25DLENBQUM7RUFFRGhFLGNBQWMsQ0FBQzJGLElBQUksRUFBRTtJQUNuQixPQUFPQSxJQUFJLENBQUNtQixJQUFJO0VBQ2xCLENBQUM7RUFFRC9HLFdBQVcsQ0FBQ25GLEtBQUssRUFBRTtJQUNqQixPQUFPLE9BQU9BLEtBQUssS0FBSyxRQUFRLElBQUlBLEtBQUssS0FBSyxJQUFJLElBQUlBLEtBQUssQ0FBQ1QsTUFBTSxLQUFLLE1BQU07RUFDL0U7QUFDRixDQUFDO0FBRUQ0TSxNQUFNLENBQUNDLE9BQU8sR0FBRztFQUNmbE4sWUFBWTtFQUNab0UsaUNBQWlDO0VBQ2pDVSxlQUFlO0VBQ2Y5QixjQUFjO0VBQ2RvSSx3QkFBd0I7RUFDeEI3SCxtQkFBbUI7RUFDbkJ5SDtBQUNGLENBQUMifQ==