'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _logger = require('../../../logger');

var _logger2 = _interopRequireDefault(_logger);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var mongodb = require('mongodb');
var Parse = require('parse/node').Parse;

var transformKey = function transformKey(className, fieldName, schema) {
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
  }

  if (schema.fields[fieldName] && schema.fields[fieldName].__type == 'Pointer') {
    fieldName = '_p_' + fieldName;
  } else if (schema.fields[fieldName] && schema.fields[fieldName].type == 'Pointer') {
    fieldName = '_p_' + fieldName;
  }

  return fieldName;
};

var transformKeyValueForUpdate = function transformKeyValueForUpdate(className, restKey, restValue, parseFormatSchema) {
  // Check if the schema is known since it's a built-in field.
  var key = restKey;
  var timeField = false;
  switch (key) {
    case 'objectId':
    case '_id':
      if (className === '_GlobalConfig') {
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
      return { key: key, value: restValue };
  }

  if (parseFormatSchema.fields[key] && parseFormatSchema.fields[key].type === 'Pointer' || !parseFormatSchema.fields[key] && restValue && restValue.__type == 'Pointer') {
    key = '_p_' + key;
  }

  // Handle atomic values
  var value = transformTopLevelAtom(restValue);
  if (value !== CannotTransform) {
    if (timeField && typeof value === 'string') {
      value = new Date(value);
    }
    return { key: key, value: value };
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return { key: key, value: value };
  }

  // Handle update operators
  if ((typeof restValue === 'undefined' ? 'undefined' : _typeof(restValue)) === 'object' && '__op' in restValue) {
    return { key: key, value: transformUpdateOperator(restValue, false) };
  }

  // Handle normal objects by recursing
  value = _lodash2.default.mapValues(restValue, transformInteriorValue);
  return { key: key, value: value };
};

var transformInteriorValue = function transformInteriorValue(restValue) {
  if (restValue !== null && (typeof restValue === 'undefined' ? 'undefined' : _typeof(restValue)) === 'object' && Object.keys(restValue).some(function (key) {
    return key.includes('$') || key.includes('.');
  })) {
    throw new Parse.Error(Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
  }
  // Handle atomic values
  var value = transformInteriorAtom(restValue);
  if (value !== CannotTransform) {
    return value;
  }

  // Handle arrays
  if (restValue instanceof Array) {
    return restValue.map(transformInteriorValue);
  }

  // Handle update operators
  if ((typeof restValue === 'undefined' ? 'undefined' : _typeof(restValue)) === 'object' && '__op' in restValue) {
    return transformUpdateOperator(restValue, true);
  }

  // Handle normal objects by recursing
  return _lodash2.default.mapValues(restValue, transformInteriorValue);
};

var valueAsDate = function valueAsDate(value) {
  if (typeof value === 'string') {
    return new Date(value);
  } else if (value instanceof Date) {
    return value;
  }
  return false;
};

function transformQueryKeyValue(className, key, value, schema) {
  switch (key) {
    case 'createdAt':
      if (valueAsDate(value)) {
        return { key: '_created_at', value: valueAsDate(value) };
      }
      key = '_created_at';
      break;
    case 'updatedAt':
      if (valueAsDate(value)) {
        return { key: '_updated_at', value: valueAsDate(value) };
      }
      key = '_updated_at';
      break;
    case 'expiresAt':
      if (valueAsDate(value)) {
        return { key: 'expiresAt', value: valueAsDate(value) };
      }
      break;
    case '_email_verify_token_expires_at':
      if (valueAsDate(value)) {
        return { key: '_email_verify_token_expires_at', value: valueAsDate(value) };
      }
      break;
    case 'objectId':
      {
        if (className === '_GlobalConfig') {
          value = parseInt(value);
        }
        return { key: '_id', value: value };
      }
    case '_account_lockout_expires_at':
      if (valueAsDate(value)) {
        return { key: '_account_lockout_expires_at', value: valueAsDate(value) };
      }
      break;
    case '_failed_login_count':
      return { key: key, value: value };
    case 'sessionToken':
      return { key: '_session_token', value: value };
    case '_perishable_token_expires_at':
      if (valueAsDate(value)) {
        return { key: '_perishable_token_expires_at', value: valueAsDate(value) };
      }
      break;
    case '_password_changed_at':
      if (valueAsDate(value)) {
        return { key: '_password_changed_at', value: valueAsDate(value) };
      }
      break;
    case '_rperm':
    case '_wperm':
    case '_perishable_token':
    case '_email_verify_token':
      return { key: key, value: value };
    case '$or':
      return { key: '$or', value: value.map(function (subQuery) {
          return transformWhere(className, subQuery, schema);
        }) };
    case '$and':
      return { key: '$and', value: value.map(function (subQuery) {
          return transformWhere(className, subQuery, schema);
        }) };
    default:
      {
        // Other auth data
        var authDataMatch = key.match(/^authData\.([a-zA-Z0-9_]+)\.id$/);
        if (authDataMatch) {
          var provider = authDataMatch[1];
          // Special-case auth data.
          return { key: '_auth_data_' + provider + '.id', value: value };
        }
      }
  }

  var expectedTypeIsArray = schema && schema.fields[key] && schema.fields[key].type === 'Array';

  var expectedTypeIsPointer = schema && schema.fields[key] && schema.fields[key].type === 'Pointer';

  if (expectedTypeIsPointer || !schema && value && value.__type === 'Pointer') {
    key = '_p_' + key;
  }

  // Handle query constraints
  var transformedConstraint = transformConstraint(value, expectedTypeIsArray);
  if (transformedConstraint !== CannotTransform) {
    return { key: key, value: transformedConstraint };
  }

  if (expectedTypeIsArray && !(value instanceof Array)) {
    return { key: key, value: { '$all': [value] } };
  }

  // Handle atomic values
  if (transformTopLevelAtom(value) !== CannotTransform) {
    return { key: key, value: transformTopLevelAtom(value) };
  } else {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'You cannot use ' + value + ' as a query parameter.');
  }
}

// Main exposed method to help run queries.
// restWhere is the "where" clause in REST API form.
// Returns the mongo form of the query.
function transformWhere(className, restWhere, schema) {
  var mongoWhere = {};
  for (var restKey in restWhere) {
    var out = transformQueryKeyValue(className, restKey, restWhere[restKey], schema);
    mongoWhere[out.key] = out.value;
  }
  return mongoWhere;
}

var parseObjectKeyValueToMongoObjectKeyValue = function parseObjectKeyValueToMongoObjectKeyValue(restKey, restValue, schema) {
  // Check if the schema is known since it's a built-in field.
  var transformedValue = void 0;
  var coercedToDate = void 0;
  switch (restKey) {
    case 'objectId':
      return { key: '_id', value: restValue };
    case 'expiresAt':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return { key: 'expiresAt', value: coercedToDate };
    case '_email_verify_token_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return { key: '_email_verify_token_expires_at', value: coercedToDate };
    case '_account_lockout_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return { key: '_account_lockout_expires_at', value: coercedToDate };
    case '_perishable_token_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return { key: '_perishable_token_expires_at', value: coercedToDate };
    case '_password_changed_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return { key: '_password_changed_at', value: coercedToDate };
    case '_failed_login_count':
    case '_rperm':
    case '_wperm':
    case '_email_verify_token':
    case '_hashed_password':
    case '_perishable_token':
      return { key: restKey, value: restValue };
    case 'sessionToken':
      return { key: '_session_token', value: restValue };
    default:
      // Auth data should have been transformed already
      if (restKey.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'can only query on ' + restKey);
      }
      // Trust that the auth data has been transformed and save it directly
      if (restKey.match(/^_auth_data_[a-zA-Z0-9_]+$/)) {
        return { key: restKey, value: restValue };
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
    return { key: restKey, value: value };
  }

  // ACLs are handled before this method is called
  // If an ACL key still exists here, something is wrong.
  if (restKey === 'ACL') {
    throw 'There was a problem transforming an ACL.';
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return { key: restKey, value: value };
  }

  // Handle normal objects by recursing
  if (Object.keys(restValue).some(function (key) {
    return key.includes('$') || key.includes('.');
  })) {
    throw new Parse.Error(Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
  }
  value = _lodash2.default.mapValues(restValue, transformInteriorValue);
  return { key: restKey, value: value };
};

var parseObjectToMongoObjectForCreate = function parseObjectToMongoObjectForCreate(className, restCreate, schema) {
  restCreate = addLegacyACL(restCreate);
  var mongoCreate = {};
  for (var restKey in restCreate) {
    if (restCreate[restKey] && restCreate[restKey].__type === 'Relation') {
      continue;
    }

    var _parseObjectKeyValueT = parseObjectKeyValueToMongoObjectKeyValue(restKey, restCreate[restKey], schema),
        key = _parseObjectKeyValueT.key,
        value = _parseObjectKeyValueT.value;

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
var transformUpdate = function transformUpdate(className, restUpdate, parseFormatSchema) {
  var mongoUpdate = {};
  var acl = addLegacyACL(restUpdate);
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
    if (_typeof(out.value) === 'object' && out.value !== null && out.value.__op) {
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
var addLegacyACL = function addLegacyACL(restObject) {
  var restObjectCopy = _extends({}, restObject);
  var _acl = {};

  if (restObject._wperm) {
    restObject._wperm.forEach(function (entry) {
      _acl[entry] = { w: true };
    });
    restObjectCopy._acl = _acl;
  }

  if (restObject._rperm) {
    restObject._rperm.forEach(function (entry) {
      if (!(entry in _acl)) {
        _acl[entry] = { r: true };
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

var transformInteriorAtom = function transformInteriorAtom(atom) {
  // TODO: check validity harder for the __type-defined types
  if ((typeof atom === 'undefined' ? 'undefined' : _typeof(atom)) === 'object' && atom && !(atom instanceof Date) && atom.__type === 'Pointer') {
    return {
      __type: 'Pointer',
      className: atom.className,
      objectId: atom.objectId
    };
  } else if (typeof atom === 'function' || (typeof atom === 'undefined' ? 'undefined' : _typeof(atom)) === 'symbol') {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'cannot transform value: ' + atom);
  } else if (DateCoder.isValidJSON(atom)) {
    return DateCoder.JSONToDatabase(atom);
  } else if (BytesCoder.isValidJSON(atom)) {
    return BytesCoder.JSONToDatabase(atom);
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
function transformTopLevelAtom(atom) {
  switch (typeof atom === 'undefined' ? 'undefined' : _typeof(atom)) {
    case 'string':
    case 'number':
    case 'boolean':
      return atom;
    case 'undefined':
      return atom;
    case 'symbol':
    case 'function':
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'cannot transform value: ' + atom);
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
        return atom.className + '$' + atom.objectId;
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
      if (FileCoder.isValidJSON(atom)) {
        return FileCoder.JSONToDatabase(atom);
      }
      return CannotTransform;

    default:
      // I don't think typeof can ever let us get here
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'really did not expect value: ' + atom);
  }
}

// Transforms a query constraint from REST API format to Mongo format.
// A constraint is something with fields like $lt.
// If it is not a valid constraint but it could be a valid something
// else, return CannotTransform.
// inArray is whether this is an array field.
function transformConstraint(constraint, inArray) {
  if ((typeof constraint === 'undefined' ? 'undefined' : _typeof(constraint)) !== 'object' || !constraint) {
    return CannotTransform;
  }
  var transformFunction = inArray ? transformInteriorAtom : transformTopLevelAtom;
  var transformer = function transformer(atom) {
    var result = transformFunction(atom);
    if (result === CannotTransform) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad atom: ' + JSON.stringify(atom));
    }
    return result;
  };
  // keys is the constraints in reverse alphabetical order.
  // This is a hack so that:
  //   $regex is handled before $options
  //   $nearSphere is handled before $maxDistance
  var keys = Object.keys(constraint).sort().reverse();
  var answer = {};
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = keys[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var key = _step.value;

      switch (key) {
        case '$lt':
        case '$lte':
        case '$gt':
        case '$gte':
        case '$exists':
        case '$ne':
        case '$eq':
          answer[key] = transformer(constraint[key]);
          break;

        case '$in':
        case '$nin':
          {
            var arr = constraint[key];
            if (!(arr instanceof Array)) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad ' + key + ' value');
            }
            answer[key] = _lodash2.default.flatMap(arr, function (value) {
              return function (atom) {
                if (Array.isArray(atom)) {
                  return value.map(transformer);
                } else {
                  return transformer(atom);
                }
              }(value);
            });
            break;
          }
        case '$all':
          {
            var _arr = constraint[key];
            if (!(_arr instanceof Array)) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad ' + key + ' value');
            }
            answer[key] = _arr.map(transformInteriorAtom);
            break;
          }
        case '$regex':
          var s = constraint[key];
          if (typeof s !== 'string') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad regex: ' + s);
          }
          answer[key] = s;
          break;

        case '$options':
          answer[key] = constraint[key];
          break;

        case '$nearSphere':
          var point = constraint[key];
          answer[key] = [point.longitude, point.latitude];
          break;

        case '$maxDistance':
          answer[key] = constraint[key];
          break;

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
            '$box': [[box[0].longitude, box[0].latitude], [box[1].longitude, box[1].latitude]]
          };
          break;

        default:
          if (key.match(/^\$+/)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad constraint: ' + key);
          }
          return CannotTransform;
      }
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
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

function transformUpdateOperator(_ref, flatten) {
  var __op = _ref.__op,
      amount = _ref.amount,
      objects = _ref.objects;

  switch (__op) {
    case 'Delete':
      if (flatten) {
        return undefined;
      } else {
        return { __op: '$unset', arg: '' };
      }

    case 'Increment':
      if (typeof amount !== 'number') {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'incrementing must provide a number');
      }
      if (flatten) {
        return amount;
      } else {
        return { __op: '$inc', arg: amount };
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
        return { __op: mongoOp, arg: { '$each': toAdd } };
      }

    case 'Remove':
      if (!(objects instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to remove must be an array');
      }
      var toRemove = objects.map(transformInteriorAtom);
      if (flatten) {
        return [];
      } else {
        return { __op: '$pullAll', arg: toRemove };
      }

    default:
      throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, 'The ' + __op + ' operator is not supported yet.');
  }
}

var nestedMongoObjectToNestedParseObject = function nestedMongoObjectToNestedParseObject(mongoObject) {
  switch (typeof mongoObject === 'undefined' ? 'undefined' : _typeof(mongoObject)) {
    case 'string':
    case 'number':
    case 'boolean':
      return mongoObject;
    case 'undefined':
    case 'symbol':
    case 'function':
      throw 'bad value in mongoObjectToParseObject';
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

      return _lodash2.default.mapValues(mongoObject, nestedMongoObjectToNestedParseObject);
    default:
      throw 'unknown js type';
  }
};

// Converts from a mongo-format object to a REST-format object.
// Does not strip out anything based on a lack of authentication.
var mongoObjectToParseObject = function mongoObjectToParseObject(className, mongoObject, schema) {
  switch (typeof mongoObject === 'undefined' ? 'undefined' : _typeof(mongoObject)) {
    case 'string':
    case 'number':
    case 'boolean':
      return mongoObject;
    case 'undefined':
    case 'symbol':
    case 'function':
      throw 'bad value in mongoObjectToParseObject';
    case 'object':
      {
        var key;
        var authDataMatch;
        var provider;
        var newKey;
        var objData;
        var value;

        var _ret = function () {
          if (mongoObject === null) {
            return {
              v: null
            };
          }
          if (mongoObject instanceof Array) {
            return {
              v: mongoObject.map(nestedMongoObjectToNestedParseObject)
            };
          }

          if (mongoObject instanceof Date) {
            return {
              v: Parse._encode(mongoObject)
            };
          }

          if (mongoObject instanceof mongodb.Long) {
            return {
              v: mongoObject.toNumber()
            };
          }

          if (mongoObject instanceof mongodb.Double) {
            return {
              v: mongoObject.value
            };
          }

          if (BytesCoder.isValidDatabaseObject(mongoObject)) {
            return {
              v: BytesCoder.databaseToJSON(mongoObject)
            };
          }

          var restObject = {};
          if (mongoObject._rperm || mongoObject._wperm) {
            restObject._rperm = mongoObject._rperm || [];
            restObject._wperm = mongoObject._wperm || [];
            delete mongoObject._rperm;
            delete mongoObject._wperm;
          }

          for (key in mongoObject) {
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
              default:
                // Check other auth data keys
                authDataMatch = key.match(/^_auth_data_([a-zA-Z0-9_]+)$/);

                if (authDataMatch) {
                  provider = authDataMatch[1];

                  restObject['authData'] = restObject['authData'] || {};
                  restObject['authData'][provider] = mongoObject[key];
                  break;
                }

                if (key.indexOf('_p_') == 0) {
                  newKey = key.substring(3);

                  if (!schema.fields[newKey]) {
                    _logger2.default.info('transform.js', 'Found a pointer column not in the schema, dropping it.', className, newKey);
                    break;
                  }
                  if (schema.fields[newKey].type !== 'Pointer') {
                    _logger2.default.info('transform.js', 'Found a pointer in a non-pointer column, dropping it.', className, key);
                    break;
                  }
                  if (mongoObject[key] === null) {
                    break;
                  }
                  objData = mongoObject[key].split('$');

                  if (objData[0] !== schema.fields[newKey].targetClass) {
                    throw 'pointer to incorrect className';
                  }
                  restObject[newKey] = {
                    __type: 'Pointer',
                    className: objData[0],
                    objectId: objData[1]
                  };
                  break;
                } else if (key[0] == '_' && key != '__type') {
                  throw 'bad key in untransform: ' + key;
                } else {
                  value = mongoObject[key];

                  if (schema.fields[key] && schema.fields[key].type === 'File' && FileCoder.isValidDatabaseObject(value)) {
                    restObject[key] = FileCoder.databaseToJSON(value);
                    break;
                  }
                  if (schema.fields[key] && schema.fields[key].type === 'GeoPoint' && GeoPointCoder.isValidDatabaseObject(value)) {
                    restObject[key] = GeoPointCoder.databaseToJSON(value);
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

          var relationFieldNames = Object.keys(schema.fields).filter(function (fieldName) {
            return schema.fields[fieldName].type === 'Relation';
          });
          var relationFields = {};
          relationFieldNames.forEach(function (relationFieldName) {
            relationFields[relationFieldName] = {
              __type: 'Relation',
              className: schema.fields[relationFieldName].targetClass
            };
          });

          return {
            v: _extends({}, restObject, relationFields)
          };
        }();

        if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
      }
    default:
      throw 'unknown js type';
  }
};

var DateCoder = {
  JSONToDatabase: function JSONToDatabase(json) {
    return new Date(json.iso);
  },
  isValidJSON: function isValidJSON(value) {
    return (typeof value === 'undefined' ? 'undefined' : _typeof(value)) === 'object' && value !== null && value.__type === 'Date';
  }
};

var BytesCoder = {
  base64Pattern: new RegExp("^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$"),
  isBase64Value: function isBase64Value(object) {
    if (typeof object !== 'string') {
      return false;
    }
    return this.base64Pattern.test(object);
  },
  databaseToJSON: function databaseToJSON(object) {
    var value = void 0;
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
  isValidDatabaseObject: function isValidDatabaseObject(object) {
    return object instanceof mongodb.Binary || this.isBase64Value(object);
  },
  JSONToDatabase: function JSONToDatabase(json) {
    return new mongodb.Binary(new Buffer(json.base64, 'base64'));
  },
  isValidJSON: function isValidJSON(value) {
    return (typeof value === 'undefined' ? 'undefined' : _typeof(value)) === 'object' && value !== null && value.__type === 'Bytes';
  }
};

var GeoPointCoder = {
  databaseToJSON: function databaseToJSON(object) {
    return {
      __type: 'GeoPoint',
      latitude: object[1],
      longitude: object[0]
    };
  },
  isValidDatabaseObject: function isValidDatabaseObject(object) {
    return object instanceof Array && object.length == 2;
  },
  JSONToDatabase: function JSONToDatabase(json) {
    return [json.longitude, json.latitude];
  },
  isValidJSON: function isValidJSON(value) {
    return (typeof value === 'undefined' ? 'undefined' : _typeof(value)) === 'object' && value !== null && value.__type === 'GeoPoint';
  }
};

var FileCoder = {
  databaseToJSON: function databaseToJSON(object) {
    return {
      __type: 'File',
      name: object
    };
  },
  isValidDatabaseObject: function isValidDatabaseObject(object) {
    return typeof object === 'string';
  },
  JSONToDatabase: function JSONToDatabase(json) {
    return json.name;
  },
  isValidJSON: function isValidJSON(value) {
    return (typeof value === 'undefined' ? 'undefined' : _typeof(value)) === 'object' && value !== null && value.__type === 'File';
  }
};

module.exports = {
  transformKey: transformKey,
  parseObjectToMongoObjectForCreate: parseObjectToMongoObjectForCreate,
  transformUpdate: transformUpdate,
  transformWhere: transformWhere,
  mongoObjectToParseObject: mongoObjectToParseObject
};