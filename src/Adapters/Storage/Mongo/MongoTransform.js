import log from '../../../logger';
import _   from 'lodash';
var mongodb = require('mongodb');
var Parse = require('parse/node').Parse;

const transformKey = (className, fieldName, schema) => {
  // Check if the schema is known since it's a built-in field.
  switch(fieldName) {
  case 'objectId':
    fieldName = '_id';
    break;
  case 'createdAt':
    fieldName = '_created_at';
    break;
  case 'updatedAt':
    fieldName = '_updated_at';
    break;
  case 'sessionToken':
    fieldName = '_session_token';
    break;
  }

  if (schema.fields[fieldName] && schema.fields[fieldName].__type == 'Pointer') {
    fieldName = '_p_' + fieldName;
  }

  return fieldName;
}

const transformKeyValueForUpdate = (schema, className, restKey, restValue) => {
  // Check if the schema is known since it's a built-in field.
  var key = restKey;
  var timeField = false;
  switch(key) {
  case 'objectId':
  case '_id':
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
  case '_email_verify_token':
    key = "_email_verify_token";
    break;
  case '_perishable_token':
    key = "_perishable_token";
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
  case '_rperm':
  case '_wperm':
    return {key: key, value: restValue};
    break;
  case '$or':
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'you can only use $or in queries');
  case '$and':
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'you can only use $and in queries');
  default:
    // Other auth data
    var authDataMatch = key.match(/^authData\.([a-zA-Z0-9_]+)\.id$/);
    if (authDataMatch) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'can only query on ' + key);
    }
  }

  // Handle special schema key changes
  // TODO: it seems like this is likely to have edge cases where
  // pointer types are missed
  var expected = undefined;
  if (schema && schema.getExpectedType) {
    expected = schema.getExpectedType(className, key);
  }
  if ((expected && expected.type == 'Pointer') || (!expected && restValue && restValue.__type == 'Pointer')) {
    key = '_p_' + key;
  }

  // Handle atomic values
  var value = transformTopLevelAtom(restValue);
  if (value !== CannotTransform) {
    if (timeField && (typeof value === 'string')) {
      value = new Date(value);
    }
    return {key, value};
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map(restObj => transformInteriorKeyValue(schema, className, restKey, restObj).value);
    return {key, value};
  }

  // Handle update operators
  if (typeof restValue === 'object' && '__op' in restValue) {
    return {key, value: transformUpdateOperator(restValue, false)};
  }

  // Handle normal objects by recursing
  value = {};
  for (var subRestKey in restValue) {
    var subRestValue = restValue[subRestKey];
    var out = transformInteriorKeyValue(schema, className, subRestKey, subRestValue);
    // For recursed objects, keep the keys in rest format
    value[subRestKey] = out.value;
  }
  return {key, value};
}

const transformInteriorKeyValue = (schema, className, restKey, restValue) => {
  // Check if the schema is known since it's a built-in field.
  var key = restKey;
  var timeField = false;
  switch(key) {
  case 'objectId':
  case '_id':
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
  case '_email_verify_token':
    key = "_email_verify_token";
    break;
  case '_perishable_token':
    key = "_perishable_token";
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
  case '_rperm':
  case '_wperm':
    return {key: key, value: restValue};
    break;
  case '$or':
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'you can only use $or in queries');
  case '$and':
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'you can only use $and in queries');
  default:
    // Other auth data
    var authDataMatch = key.match(/^authData\.([a-zA-Z0-9_]+)\.id$/);
    if (authDataMatch) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'can only query on ' + key);
    }
  }

  // Handle special schema key changes
  // TODO: it seems like this is likely to have edge cases where
  // pointer types are missed
  var expected = undefined;
  if (schema && schema.getExpectedType) {
    expected = schema.getExpectedType(className, key);
  }
  if ((expected && expected.type == 'Pointer') || (!expected && restValue && restValue.__type == 'Pointer')) {
    key = '_p_' + key;
  }

  // Handle atomic values
  var value = transformInteriorAtom(restValue);
  if (value !== CannotTransform) {
    if (timeField && (typeof value === 'string')) {
      value = new Date(value);
    }
    return {key, value};
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map(restObj => transformInteriorKeyValue(schema, className, restKey, restObj).value);
    return {key, value};
  }

  // Handle update operators
  if (typeof restValue === 'object' && '__op' in restValue) {
    return {key, value: transformUpdateOperator(restValue, true)};
  }

  // Handle normal objects by recursing
  value = {};
  for (var subRestKey in restValue) {
    var subRestValue = restValue[subRestKey];
    var out = transformInteriorKeyValue(schema, className, subRestKey, subRestValue);
    // For recursed objects, keep the keys in rest format
    value[subRestKey] = out.value;
  }
  return {key, value};
}

const valueAsDate = value => {
  if (typeof value === 'string') {
    return new Date(value);
  } else if (value instanceof Date) {
    return value;
  }
  return false;
}

function transformQueryKeyValue(className, key, value, { validate } = {}, schema) {
  switch(key) {
  case 'createdAt':
    if (valueAsDate(value)) {
      return {key: '_created_at', value: valueAsDate(value)}
    }
    key = '_created_at';
    break;
  case 'updatedAt':
    if (valueAsDate(value)) {
      return {key: '_updated_at', value: valueAsDate(value)}
    }
    key = '_updated_at';
    break;
  case 'expiresAt':
    if (valueAsDate(value)) {
      return {key: 'expiresAt', value: valueAsDate(value)}
    }
    break;
  case 'objectId': return {key: '_id', value}
  case 'sessionToken': return {key: '_session_token', value}
  case '_rperm':
  case '_wperm':
  case '_perishable_token':
  case '_email_verify_token': return {key, value}
  case '$or':
    if (!(value instanceof Array)) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'bad $or format - use an array value');
    }
    return {key: '$or', value: value.map(subQuery => transformWhere(className, subQuery, {}, schema))};
  case '$and':
    if (!(value instanceof Array)) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'bad $and format - use an array value');
    }
    return {key: '$and', value: value.map(subQuery => transformWhere(className, subQuery, {}, schema))};
  default:
    // Other auth data
    const authDataMatch = key.match(/^authData\.([a-zA-Z0-9_]+)\.id$/);
    if (authDataMatch) {
      const provider = authDataMatch[1];
      // Special-case auth data.
      return {key: `_auth_data_${provider}.id`, value};
    }
    if (validate && !key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'invalid key name: ' + key);
    }
  }

  const expectedTypeIsArray =
    schema &&
    schema.fields[key] &&
    schema.fields[key].type === 'Array';

  const expectedTypeIsPointer =
    schema &&
    schema.fields[key] &&
    schema.fields[key].type === 'Pointer';

  if (expectedTypeIsPointer || !schema && value && value.__type === 'Pointer') {
    key = '_p_' + key;
  }

  // Handle query constraints
  if (transformConstraint(value, expectedTypeIsArray) !== CannotTransform) {
    return {key, value: transformConstraint(value, expectedTypeIsArray)};
  }

  if (expectedTypeIsArray && !(value instanceof Array)) {
    return {key, value: { '$all' : [value] }};
  }

  // Handle atomic values
  if (transformTopLevelAtom(value) !== CannotTransform) {
    return {key, value: transformTopLevelAtom(value)};
  } else {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `You cannot use ${value} as a query parameter.`);
  }
}

// Main exposed method to help run queries.
// restWhere is the "where" clause in REST API form.
// Returns the mongo form of the query.
// Throws a Parse.Error if the input query is invalid.
function transformWhere(className, restWhere, { validate = true } = {}, schema) {
  let mongoWhere = {};
  if (restWhere['ACL']) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }
  for (let restKey in restWhere) {
    let out = transformQueryKeyValue(className, restKey, restWhere[restKey], { validate }, schema);
    mongoWhere[out.key] = out.value;
  }
  return mongoWhere;
}

const parseObjectKeyValueToMongoObjectKeyValue = (
  schema,
  className,
  restKey,
  restValue,
  parseFormatSchema
) => {
  // Check if the schema is known since it's a built-in field.
  let transformedValue;
  let coercedToDate;
  switch(restKey) {
  case 'objectId': return {key: '_id', value: restValue};
  case 'createdAt':
    transformedValue = transformTopLevelAtom(restValue);
    coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue
    return {key: '_created_at', value: coercedToDate};
  case 'updatedAt':
    transformedValue = transformTopLevelAtom(restValue);
    coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue
    return {key: '_updated_at', value: coercedToDate};
  case 'expiresAt':
    transformedValue = transformTopLevelAtom(restValue);
    coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue
    return {key: 'expiresAt', value: coercedToDate};
  case '_rperm':
  case '_wperm':
  case '_email_verify_token':
  case '_hashed_password':
  case '_perishable_token': return {key: restKey, value: restValue};
  case 'sessionToken': return {key: '_session_token', value: restValue};
  default:
    // Auth data should have been transformed already
    if (restKey.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'can only query on ' + restKey);
    }
    // Trust that the auth data has been transformed and save it directly
    if (restKey.match(/^_auth_data_[a-zA-Z0-9_]+$/)) {
      return {key: restKey, value: restValue};
    }
  }
  //skip straight to transformTopLevelAtom for Bytes, they don't show up in the schema for some reason
  if (restValue && restValue.__type !== 'Bytes') {
    //Note: We may not know the type of a field here, as the user could be saving (null) to a field
    //That never existed before, meaning we can't infer the type.
    if (parseFormatSchema.fields[restKey] && parseFormatSchema.fields[restKey].type == 'Pointer' || restValue.__type == 'Pointer') {
      restKey = '_p_' + restKey;
    }
  }

  // Handle atomic values
  var value = transformTopLevelAtom(restValue);
  if (value !== CannotTransform) {
    return {key: restKey, value: value};
  }

  // ACLs are handled before this method is called
  // If an ACL key still exists here, something is wrong.
  if (restKey === 'ACL') {
    throw 'There was a problem transforming an ACL.';
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map((restObj) => {
      var out = transformInteriorKeyValue(schema, className, restKey, restObj);
      return out.value;
    });
    return {key: restKey, value: value};
  }

  // Handle update operators. TODO: handle within Parse Server. DB adapter shouldn't see update operators in creates.
  if (typeof restValue === 'object' && '__op' in restValue) {
    return {key: restKey, value: transformUpdateOperator(restValue, true)};
  }

  // Handle normal objects by recursing
  value = {};
  for (var subRestKey in restValue) {
    var subRestValue = restValue[subRestKey];
    var out = transformInteriorKeyValue(schema, className, subRestKey, subRestValue);
    // For recursed objects, keep the keys in rest format
    value[subRestKey] = out.value;
  }
  return {key: restKey, value: value};
}

// Main exposed method to create new objects.
// restCreate is the "create" clause in REST API form.
function parseObjectToMongoObjectForCreate(schema, className, restCreate, parseFormatSchema) {
  if (className == '_User') {
     restCreate = transformAuthData(restCreate);
  }
  var mongoCreate = transformACL(restCreate);
  for (let restKey in restCreate) {
    let { key, value } = parseObjectKeyValueToMongoObjectKeyValue(
      schema,
      className,
      restKey,
      restCreate[restKey],
      parseFormatSchema
    );
    if (value !== undefined) {
      mongoCreate[key] = value;
    }
  }
  return mongoCreate;
}

// Main exposed method to help update old objects.
function transformUpdate(schema, className, restUpdate) {
  if (!restUpdate) {
    throw 'got empty restUpdate';
  }
  if (className == '_User') {
    restUpdate = transformAuthData(restUpdate);
  }

  var mongoUpdate = {};
  var acl = transformACL(restUpdate);
  if (acl._rperm || acl._wperm || acl._acl) {
    mongoUpdate['$set'] = {};
    if (acl._rperm) {
      mongoUpdate['$set']['_rperm'] = acl._rperm;
    }
    if (acl._wperm) {
      mongoUpdate['$set']['_wperm'] = acl._wperm;
    }
    if (acl._acl) {
      mongoUpdate['$set']['_acl'] = acl._acl;
    }
  }

  for (var restKey in restUpdate) {
    var out = transformKeyValueForUpdate(schema, className, restKey, restUpdate[restKey]);

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
}

function transformAuthData(restObject) {
  if (restObject.authData) {
    Object.keys(restObject.authData).forEach((provider) => {
      let providerData = restObject.authData[provider];
      if (providerData == null) {
        restObject[`_auth_data_${provider}`] = {
          __op: 'Delete'
        }
      } else {
        restObject[`_auth_data_${provider}`] = providerData;
      }
    });
    delete restObject.authData;
  }
  return restObject;
}

// Transforms a REST API formatted ACL object to our two-field mongo format.
// This mutates the restObject passed in to remove the ACL key.
function transformACL(restObject) {
  var output = {};
  if (!restObject['ACL']) {
    return output;
  }
  var acl = restObject['ACL'];
  var rperm = [];
  var wperm = [];
  var _acl = {}; // old format

  for (var entry in acl) {
    if (acl[entry].read) {
      rperm.push(entry);
      _acl[entry] = _acl[entry] || {};
      _acl[entry]['r'] = true;
    }
    if (acl[entry].write) {
      wperm.push(entry);
      _acl[entry] = _acl[entry] || {};
      _acl[entry]['w'] = true;
    }
  }
  output._rperm = rperm;
  output._wperm = wperm;
  output._acl = _acl;
  delete restObject.ACL;
  return output;
}

// Transforms a mongo format ACL to a REST API format ACL key
// This mutates the mongoObject passed in to remove the _rperm/_wperm keys
function untransformACL(mongoObject) {
  var output = {};
  if (!mongoObject['_rperm'] && !mongoObject['_wperm']) {
    return output;
  }
  var acl = {};
  var rperm = mongoObject['_rperm'] || [];
  var wperm = mongoObject['_wperm'] || [];
  rperm.map((entry) => {
    if (!acl[entry]) {
      acl[entry] = {read: true};
    } else {
      acl[entry]['read'] = true;
    }
  });
  wperm.map((entry) => {
    if (!acl[entry]) {
      acl[entry] = {write: true};
    } else {
      acl[entry]['write'] = true;
    }
  });
  output['ACL'] = acl;
  delete mongoObject._rperm;
  delete mongoObject._wperm;
  return output;
}

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
  } else {
    return atom;
  }
}

// Helper function to transform an atom from REST format to Mongo format.
// An atom is anything that can't contain other expressions. So it
// includes things where objects are used to represent other
// datatypes, like pointers and dates, but it does not include objects
// or arrays with generic stuff inside.
// Raises an error if this cannot possibly be valid REST format.
// Returns CannotTransform if it's just not an atom
function transformTopLevelAtom(atom) {
  switch(typeof atom) {
  case 'string':
  case 'number':
  case 'boolean':
    return atom;
  case 'undefined':
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
function transformConstraint(constraint, inArray) {
  if (typeof constraint !== 'object' || !constraint) {
    return CannotTransform;
  }

  // keys is the constraints in reverse alphabetical order.
  // This is a hack so that:
  //   $regex is handled before $options
  //   $nearSphere is handled before $maxDistance
  var keys = Object.keys(constraint).sort().reverse();
  var answer = {};
  for (var key of keys) {
    switch(key) {
    case '$lt':
    case '$lte':
    case '$gt':
    case '$gte':
    case '$exists':
    case '$ne':
    case '$eq':
      answer[key] = inArray ? transformInteriorAtom(constraint[key]) : transformTopLevelAtom(constraint[key]);
      if (answer[key] === CannotTransform) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `bad atom: ${atom}`);
      }
      break;

    case '$in':
    case '$nin':
      var arr = constraint[key];
      if (!(arr instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad ' + key + ' value');
      }
      answer[key] = arr.map(value => {
        let result = inArray ? transformInteriorAtom(value) : transformTopLevelAtom(value);
        if (result === CannotTransform) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `bad atom: ${atom}`);
        }
        return result;
      });
      break;

    case '$all':
      var arr = constraint[key];
      if (!(arr instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON,
                              'bad ' + key + ' value');
      }
      answer[key] = arr.map(transformInteriorAtom);
      break;

    case '$regex':
      var s = constraint[key];
      if (typeof s !== 'string') {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad regex: ' + s);
      }
      answer[key] = s;
      break;

    case '$options':
      var options = constraint[key];
      if (!answer['$regex'] || (typeof options !== 'string')
          || !options.match(/^[imxs]+$/)) {
        throw new Parse.Error(Parse.Error.INVALID_QUERY,
                              'got a bad $options');
      }
      answer[key] = options;
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
      throw new Parse.Error(
        Parse.Error.COMMAND_UNAVAILABLE,
        'the ' + key + ' constraint is not supported yet');

    case '$within':
      var box = constraint[key]['$box'];
      if (!box || box.length != 2) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'malformatted $within arg');
      }
      answer[key] = {
        '$box': [
          [box[0].longitude, box[0].latitude],
          [box[1].longitude, box[1].latitude]
        ]
      };
      break;

    default:
      if (key.match(/^\$+/)) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'bad constraint: ' + key);
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
  objects,
}, flatten) {
  switch(__op) {
  case 'Delete':
    if (flatten) {
      return undefined;
    } else {
      return {__op: '$unset', arg: ''};
    }

  case 'Increment':
    if (typeof amount !== 'number') {
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'incrementing must provide a number');
    }
    if (flatten) {
      return amount;
    } else {
      return {__op: '$inc', arg: amount};
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
      return {__op: mongoOp, arg: {'$each': toAdd}};
    }

  case 'Remove':
    if (!(objects instanceof Array)) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to remove must be an array');
    }
    var toRemove = objects.map(transformInteriorAtom);
    if (flatten) {
      return [];
    } else {
      return {__op: '$pullAll', arg: toRemove};
    }

  default:
    throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, `The ${__op} operator is not supported yet.`);
  }
}

const specialKeysForUntransform = [
  '_id',
  '_hashed_password',
  '_acl',
  '_email_verify_token',
  '_perishable_token',
  '_tombstone',
  '_session_token',
  'updatedAt',
  '_updated_at',
  'createdAt',
  '_created_at',
  'expiresAt',
  '_expiresAt',
];

// Converts from a mongo-format object to a REST-format object.
// Does not strip out anything based on a lack of authentication.
function untransformObject(schema, className, mongoObject, isNestedObject = false) {
  switch(typeof mongoObject) {
  case 'string':
  case 'number':
  case 'boolean':
    return mongoObject;
  case 'undefined':
  case 'symbol':
  case 'function':
    throw 'bad value in untransformObject';
  case 'object':
    if (mongoObject === null) {
      return null;
    }
    if (mongoObject instanceof Array) {
      return mongoObject.map(arrayEntry => {
        return untransformObject(schema, className, arrayEntry, true);
      });
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

    var restObject = untransformACL(mongoObject);
    for (var key in mongoObject) {
      if (isNestedObject && _.includes(specialKeysForUntransform, key)) {
        restObject[key] = untransformObject(schema, className, mongoObject[key], true);
        continue;
      }
      switch(key) {
      case '_id':
        restObject['objectId'] = '' + mongoObject[key];
        break;
      case '_hashed_password':
        restObject['password'] = mongoObject[key];
        break;
      case '_acl':
      case '_email_verify_token':
      case '_perishable_token':
      case '_tombstone':
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
        var authDataMatch = key.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
        if (authDataMatch) {
          var provider = authDataMatch[1];
          restObject['authData'] = restObject['authData'] || {};
          restObject['authData'][provider] = mongoObject[key];
          break;
        }

        if (key.indexOf('_p_') == 0) {
          var newKey = key.substring(3);
          var expected;
          if (schema && schema.getExpectedType) {
            expected = schema.getExpectedType(className, newKey);
          }
          if (!expected) {
            log.info('transform.js',
              'Found a pointer column not in the schema, dropping it.',
              className, newKey);
            break;
          }
          if (expected && expected.type !== 'Pointer') {
            log.info('transform.js', 'Found a pointer in a non-pointer column, dropping it.', className, key);
            break;
          }
          if (mongoObject[key] === null) {
            break;
          }
          var objData = mongoObject[key].split('$');
          var newClass = (expected ? expected.targetClass : objData[0]);
          if (objData[0] !== newClass) {
            throw 'pointer to incorrect className';
          }
          restObject[newKey] = {
            __type: 'Pointer',
            className: objData[0],
            objectId: objData[1]
          };
          break;
        } else if (!isNestedObject && key[0] == '_' && key != '__type') {
          throw ('bad key in untransform: ' + key);
        } else {
          var expectedType = schema.getExpectedType(className, key);
          var value = mongoObject[key];
          if (expectedType && expectedType.type === 'File' && FileCoder.isValidDatabaseObject(value)) {
            restObject[key] = FileCoder.databaseToJSON(value);
            break;
          }
          if (expectedType && expectedType.type === 'GeoPoint' && GeoPointCoder.isValidDatabaseObject(value)) {
            restObject[key] = GeoPointCoder.databaseToJSON(value);
            break;
          }
        }
        restObject[key] = untransformObject(schema, className, mongoObject[key], true);
      }
    }

    if (!isNestedObject) {
      let relationFields = schema.getRelationFields(className);
      Object.assign(restObject, relationFields);
    }
    return restObject;
  default:
    throw 'unknown js type';
  }
}

function transformSelect(selectObject, key ,objects) {
  var values = [];
  for (var result of objects) {
    values.push(result[key]);
  }
  delete selectObject['$select'];
  if (Array.isArray(selectObject['$in'])) {
    selectObject['$in'] = selectObject['$in'].concat(values);
  } else {
    selectObject['$in'] = values;
  }
}

function transformDontSelect(dontSelectObject, key, objects) {
  var values = [];
  for (var result of objects) {
    values.push(result[key]);
  }
  delete dontSelectObject['$dontSelect'];
  if (Array.isArray(dontSelectObject['$nin'])) {
    dontSelectObject['$nin'] = dontSelectObject['$nin'].concat(values);
  } else {
    dontSelectObject['$nin'] = values;
  }
}

function transformInQuery(inQueryObject, className, results) {
  var values = [];
  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId
    });
  }
  delete inQueryObject['$inQuery'];
  if (Array.isArray(inQueryObject['$in'])) {
    inQueryObject['$in'] = inQueryObject['$in'].concat(values);
  } else {
    inQueryObject['$in'] = values;
  }
}

function transformNotInQuery(notInQueryObject, className, results) {
  var values = [];
  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId
    });
  }
  delete notInQueryObject['$notInQuery'];
  if (Array.isArray(notInQueryObject['$nin'])) {
    notInQueryObject['$nin'] = notInQueryObject['$nin'].concat(values);
  } else {
    notInQueryObject['$nin'] = values;
  }
}

var DateCoder = {
  JSONToDatabase(json) {
    return new Date(json.iso);
  },

  isValidJSON(value) {
    return (typeof value === 'object' &&
      value !== null &&
      value.__type === 'Date'
    );
  }
};

var BytesCoder = {
  databaseToJSON(object) {
    return {
      __type: 'Bytes',
      base64: object.buffer.toString('base64')
    };
  },

  isValidDatabaseObject(object) {
    return (object instanceof mongodb.Binary);
  },

  JSONToDatabase(json) {
    return new mongodb.Binary(new Buffer(json.base64, 'base64'));
  },

  isValidJSON(value) {
    return (typeof value === 'object' &&
      value !== null &&
      value.__type === 'Bytes'
    );
  }
};

var GeoPointCoder = {
  databaseToJSON(object) {
    return {
      __type: 'GeoPoint',
      latitude: object[1],
      longitude: object[0]
    }
  },

  isValidDatabaseObject(object) {
    return (object instanceof Array &&
      object.length == 2
    );
  },

  JSONToDatabase(json) {
    return [ json.longitude, json.latitude ];
  },

  isValidJSON(value) {
    return (typeof value === 'object' &&
      value !== null &&
      value.__type === 'GeoPoint'
    );
  }
};

var FileCoder = {
  databaseToJSON(object) {
    return {
      __type: 'File',
      name: object
    }
  },

  isValidDatabaseObject(object) {
    return (typeof object === 'string');
  },

  JSONToDatabase(json) {
    return json.name;
  },

  isValidJSON(value) {
    return (typeof value === 'object' &&
      value !== null &&
      value.__type === 'File'
    );
  }
};

module.exports = {
  transformKey,
  parseObjectToMongoObjectForCreate,
  transformUpdate,
  transformWhere,
  transformSelect,
  transformDontSelect,
  transformInQuery,
  transformNotInQuery,
  untransformObject
};
