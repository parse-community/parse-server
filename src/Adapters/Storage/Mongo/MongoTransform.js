import log from '../../../logger';
import _   from 'lodash';
var mongodb = require('mongodb');
var Parse = require('parse/node').Parse;

const transformKey = (className, fieldName, schema) => {
  // Check if the schema is known since it's a built-in field.
  switch(fieldName) {
  case 'objectId': return '_id';
  case 'createdAt': return '_created_at';
  case 'updatedAt': return '_updated_at';
  case 'sessionToken': return '_session_token';
  case 'lastUsed': return '_last_used';
  case 'timesUsed': return 'times_used';
  }

  if (schema.fields[fieldName] && schema.fields[fieldName].__type == 'Pointer') {
    fieldName = '_p_' + fieldName;
  } else if (schema.fields[fieldName] && schema.fields[fieldName].type == 'Pointer') {
    fieldName = '_p_' + fieldName;
  }

  return fieldName;
}

const transformKeyValueForUpdate = (className, restKey, restValue, parseFormatSchema) => {
  // Check if the schema is known since it's a built-in field.
  var key = restKey;
  var timeField = false;
  switch(key) {
  case 'objectId':
  case '_id':
    if (className === '_GlobalConfig') {
      return {
        key: key,
        value: parseInt(restValue)
      }
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
    return {key: key, value: restValue};
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

  if ((parseFormatSchema.fields[key] && parseFormatSchema.fields[key].type === 'Pointer') || (!parseFormatSchema.fields[key] && restValue && restValue.__type == 'Pointer')) {
    key = '_p_' + key;
  }

  // Handle atomic values
  var value = transformTopLevelAtom(restValue);
  if (value !== CannotTransform) {
    if (timeField && (typeof value === 'string')) {
      value = new Date(value);
    }
    if (restKey.indexOf('.') > 0) {
      return {key, value: restValue}
    }
    return {key, value};
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return {key, value};
  }

  // Handle update operators
  if (typeof restValue === 'object' && '__op' in restValue) {
    return {key, value: transformUpdateOperator(restValue, false)};
  }

  // Handle normal objects by recursing
  value = mapValues(restValue, transformInteriorValue);
  return {key, value};
}

const transformInteriorValue = restValue => {
  if (restValue !== null && typeof restValue === 'object' && Object.keys(restValue).some(key => key.includes('$') || key.includes('.'))) {
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
  if (typeof restValue === 'object' && '__op' in restValue) {
    return transformUpdateOperator(restValue, true);
  }

  // Handle normal objects by recursing
  return mapValues(restValue, transformInteriorValue);
}

const valueAsDate = value => {
  if (typeof value === 'string') {
    return new Date(value);
  } else if (value instanceof Date) {
    return value;
  }
  return false;
}

function transformQueryKeyValue(className, key, value, schema) {
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
  case '_email_verify_token_expires_at':
    if (valueAsDate(value)) {
      return {key: '_email_verify_token_expires_at', value: valueAsDate(value)}
    }
    break;
  case 'objectId': {
    if (className === '_GlobalConfig') {
      value = parseInt(value);
    }
    return {key: '_id', value}
  }
  case '_account_lockout_expires_at':
    if (valueAsDate(value)) {
      return {key: '_account_lockout_expires_at', value: valueAsDate(value)}
    }
    break;
  case '_failed_login_count':
    return {key, value};
  case 'sessionToken': return {key: '_session_token', value}
  case '_perishable_token_expires_at':
    if (valueAsDate(value)) {
      return { key: '_perishable_token_expires_at', value: valueAsDate(value) }
    }
    break;
  case '_password_changed_at':
    if (valueAsDate(value)) {
      return { key: '_password_changed_at', value: valueAsDate(value) }
    }
    break;
  case '_rperm':
  case '_wperm':
  case '_perishable_token':
  case '_email_verify_token': return {key, value}
  case '$or':
    return {key: '$or', value: value.map(subQuery => transformWhere(className, subQuery, schema))};
  case '$and':
    return {key: '$and', value: value.map(subQuery => transformWhere(className, subQuery, schema))};
  case 'lastUsed':
    if (valueAsDate(value)) {
      return {key: '_last_used', value: valueAsDate(value)}
    }
    key = '_last_used';
    break;
  case 'timesUsed':
    return {key: 'times_used', value: value};
  default: {
    // Other auth data
    const authDataMatch = key.match(/^authData\.([a-zA-Z0-9_]+)\.id$/);
    if (authDataMatch) {
      const provider = authDataMatch[1];
      // Special-case auth data.
      return {key: `_auth_data_${provider}.id`, value};
    }
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

  const field = schema && schema.fields[key];
  if (expectedTypeIsPointer || !schema && value && value.__type === 'Pointer') {
    key = '_p_' + key;
  }

  // Handle query constraints
  const transformedConstraint = transformConstraint(value, field);
  if (transformedConstraint !== CannotTransform) {
    if (transformedConstraint.$text) {
      return {key: '$text', value: transformedConstraint.$text};
    }
    return {key, value: transformedConstraint};
  }

  if (expectedTypeIsArray && !(value instanceof Array)) {
    return {key, value: { '$all' : [transformInteriorAtom(value)] }};
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
function transformWhere(className, restWhere, schema) {
  const mongoWhere = {};
  for (const restKey in restWhere) {
    const out = transformQueryKeyValue(className, restKey, restWhere[restKey], schema);
    mongoWhere[out.key] = out.value;
  }
  return mongoWhere;
}

const parseObjectKeyValueToMongoObjectKeyValue = (restKey, restValue, schema) => {
  // Check if the schema is known since it's a built-in field.
  let transformedValue;
  let coercedToDate;
  switch(restKey) {
  case 'objectId': return {key: '_id', value: restValue};
  case 'expiresAt':
    transformedValue = transformTopLevelAtom(restValue);
    coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue
    return {key: 'expiresAt', value: coercedToDate};
  case '_email_verify_token_expires_at':
    transformedValue = transformTopLevelAtom(restValue);
    coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue
    return {key: '_email_verify_token_expires_at', value: coercedToDate};
  case '_account_lockout_expires_at':
    transformedValue = transformTopLevelAtom(restValue);
    coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue
    return {key: '_account_lockout_expires_at', value: coercedToDate};
  case '_perishable_token_expires_at':
    transformedValue = transformTopLevelAtom(restValue);
    coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue
    return { key: '_perishable_token_expires_at', value: coercedToDate };
  case '_password_changed_at':
    transformedValue = transformTopLevelAtom(restValue);
    coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue
    return { key: '_password_changed_at', value: coercedToDate };
  case '_failed_login_count':
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
    if (schema.fields[restKey] && schema.fields[restKey].type == 'Pointer' || restValue.__type == 'Pointer') {
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
    value = restValue.map(transformInteriorValue);
    return {key: restKey, value: value};
  }

  // Handle normal objects by recursing
  if (Object.keys(restValue).some(key => key.includes('$') || key.includes('.'))) {
    throw new Parse.Error(Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
  }
  value = mapValues(restValue, transformInteriorValue);
  return {key: restKey, value};
}

const parseObjectToMongoObjectForCreate = (className, restCreate, schema) => {
  restCreate = addLegacyACL(restCreate);
  const mongoCreate = {}
  for (const restKey in restCreate) {
    if (restCreate[restKey] && restCreate[restKey].__type === 'Relation') {
      continue;
    }
    const { key, value } = parseObjectKeyValueToMongoObjectKeyValue(
      restKey,
      restCreate[restKey],
      schema
    );
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
}

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
}

// Add the legacy _acl format.
const addLegacyACL = restObject => {
  const restObjectCopy = {...restObject};
  const _acl = {};

  if (restObject._wperm) {
    restObject._wperm.forEach(entry => {
      _acl[entry] = { w: true };
    });
    restObjectCopy._acl = _acl;
  }

  if (restObject._rperm) {
    restObject._rperm.forEach(entry => {
      if (!(entry in _acl)) {
        _acl[entry] = { r: true };
      } else {
        _acl[entry].r = true;
      }
    });
    restObjectCopy._acl = _acl;
  }

  return restObjectCopy;
}


// A sentinel value that helper transformations return when they
// cannot perform a transformation
function CannotTransform() {}

const transformInteriorAtom = (atom) => {
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
function transformTopLevelAtom(atom, field) {
  switch(typeof atom) {
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

function relativeTimeToDate(text, now = new Date()) {
  text = text.toLowerCase();

  let parts = text.split(' ');

  // Filter out whitespace
  parts = parts.filter((part) => part !== '');

  const future = parts[0] === 'in';
  const past = parts[parts.length - 1] === 'ago';

  if (!future && !past && text !== 'now') {
    return { status: 'error', info: "Time should either start with 'in' or end with 'ago'" };
  }

  if (future && past) {
    return {
      status: 'error',
      info: "Time cannot have both 'in' and 'ago'",
    };
  }

  // strip the 'ago' or 'in'
  if (future) {
    parts = parts.slice(1);
  } else { // past
    parts = parts.slice(0, parts.length - 1);
  }

  if (parts.length % 2 !== 0 && text !== 'now') {
    return {
      status: 'error',
      info: 'Invalid time string. Dangling unit or number.',
    };
  }

  const pairs = [];
  while(parts.length) {
    pairs.push([ parts.shift(), parts.shift() ]);
  }

  let seconds = 0;
  for (const [num, interval] of pairs) {
    const val = Number(num);
    if (!Number.isInteger(val)) {
      return {
        status: 'error',
        info: `'${num}' is not an integer.`,
      };
    }

    switch(interval) {
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
        info: `Invalid interval: '${interval}'`,
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
    }
  }
}

// Transforms a query constraint from REST API format to Mongo format.
// A constraint is something with fields like $lt.
// If it is not a valid constraint but it could be a valid something
// else, return CannotTransform.
// inArray is whether this is an array field.
function transformConstraint(constraint, field) {
  const inArray = field && field.type && field.type === 'Array';
  if (typeof constraint !== 'object' || !constraint) {
    return CannotTransform;
  }
  const transformFunction = inArray ? transformInteriorAtom : transformTopLevelAtom;
  const transformer = (atom) => {
    const result = transformFunction(atom, field);
    if (result === CannotTransform) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `bad atom: ${JSON.stringify(atom)}`);
    }
    return result;
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
    case '$eq': {
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

        log.info('Error while parsing relative date', parserResult);
        throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $relativeTime (${key}) value. ${parserResult.info}`);
      }

      answer[key] = transformer(val);
      break;
    }

    case '$in':
    case '$nin': {
      const arr = constraint[key];
      if (!(arr instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad ' + key + ' value');
      }
      answer[key] = _.flatMap(arr, value => {
        return ((atom) => {
          if (Array.isArray(atom)) {
            return value.map(transformer);
          } else {
            return transformer(atom);
          }
        })(value);
      });
      break;
    }
    case '$all': {
      const arr = constraint[key];
      if (!(arr instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON,
          'bad ' + key + ' value');
      }
      answer[key] = arr.map(transformInteriorAtom);
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

    case '$text': {
      const search = constraint[key].$search;
      if (typeof search !== 'object') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $search, should be object`
        );
      }
      if (!search.$term || typeof search.$term !== 'string') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $term, should be string`
        );
      } else {
        answer[key] = {
          '$search': search.$term
        }
      }
      if (search.$language && typeof search.$language !== 'string') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $language, should be string`
        );
      } else if (search.$language) {
        answer[key].$language = search.$language;
      }
      if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $caseSensitive, should be boolean`
        );
      } else if (search.$caseSensitive) {
        answer[key].$caseSensitive = search.$caseSensitive;
      }
      if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $diacriticSensitive, should be boolean`
        );
      } else if (search.$diacriticSensitive) {
        answer[key].$diacriticSensitive = search.$diacriticSensitive;
      }
      break;
    }
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

    case '$geoWithin': {
      const polygon = constraint[key]['$polygon'];
      if (!(polygon instanceof Array)) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'bad $geoWithin value; $polygon should contain at least 3 GeoPoints'
        );
      }
      if (polygon.length < 3) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'bad $geoWithin value; $polygon should contain at least 3 GeoPoints'
        );
      }
      const points = polygon.map((point) => {
        if (!GeoPointCoder.isValidJSON(point)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value');
        } else {
          Parse.GeoPoint._validate(point.latitude, point.longitude);
        }
        return [point.longitude, point.latitude];
      });
      answer[key] = {
        '$polygon': points
      };
      break;
    }
    case '$geoIntersects': {
      const point = constraint[key]['$point'];
      if (!GeoPointCoder.isValidJSON(point)) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'bad $geoIntersect value; $point should be GeoPoint'
        );
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
function mapValues(object, iterator) {
  const result = {};
  Object.keys(object).forEach((key) => {
    result[key] = iterator(object[key]);
  });
  return result;
}

const nestedMongoObjectToNestedParseObject = mongoObject => {
  switch(typeof mongoObject) {
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

    if (mongoObject.hasOwnProperty('__type') && mongoObject.__type == 'Date' && mongoObject.iso instanceof Date) {
      mongoObject.iso = mongoObject.iso.toJSON();
      return mongoObject;
    }

    return mapValues(mongoObject, nestedMongoObjectToNestedParseObject);
  default:
    throw 'unknown js type';
  }
}

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
}

// Converts from a mongo-format object to a REST-format object.
// Does not strip out anything based on a lack of authentication.
const mongoObjectToParseObject = (className, mongoObject, schema) => {
  switch(typeof mongoObject) {
  case 'string':
  case 'number':
  case 'boolean':
    return mongoObject;
  case 'undefined':
  case 'symbol':
  case 'function':
    throw 'bad value in mongoObjectToParseObject';
  case 'object': {
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
      switch(key) {
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
          if (!schema.fields[newKey]) {
            log.info('transform.js', 'Found a pointer column not in the schema, dropping it.', className, newKey);
            break;
          }
          if (schema.fields[newKey].type !== 'Pointer') {
            log.info('transform.js', 'Found a pointer in a non-pointer column, dropping it.', className, key);
            break;
          }
          if (mongoObject[key] === null) {
            break;
          }
          restObject[newKey] = transformPointerString(schema, newKey, mongoObject[key]);
          break;
        } else if (key[0] == '_' && key != '__type') {
          throw ('bad key in untransform: ' + key);
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
        className: schema.fields[relationFieldName].targetClass,
      }
    });

    return { ...restObject, ...relationFields };
  }
  default:
    throw 'unknown js type';
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
  base64Pattern: new RegExp("^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$"),
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
    return (object instanceof mongodb.Binary) || this.isBase64Value(object);
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

var PolygonCoder = {
  databaseToJSON(object) {
    return {
      __type: 'Polygon',
      coordinates: object['coordinates'][0]
    }
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
    const coords = json.coordinates;
    if (coords[0][0] !== coords[coords.length - 1][0] ||
        coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0]);
    }
    const unique = coords.filter((item, index, ar) => {
      let foundIndex = -1;
      for (let i = 0; i < ar.length; i += 1) {
        const pt = ar[i];
        if (pt[0] === item[0] &&
            pt[1] === item[1]) {
          foundIndex = i;
          break;
        }
      }
      return foundIndex === index;
    });
    if (unique.length < 3) {
      throw new Parse.Error(
        Parse.Error.INTERNAL_SERVER_ERROR,
        'GeoJSON: Loop must have at least 3 different vertices'
      );
    }
    return { type: 'Polygon', coordinates: [coords] };
  },

  isValidJSON(value) {
    return (typeof value === 'object' &&
      value !== null &&
      value.__type === 'Polygon'
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
  mongoObjectToParseObject,
  relativeTimeToDate,
  transformConstraint,
  transformPointerString,
};
