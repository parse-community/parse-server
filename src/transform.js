import log from './logger';
var mongodb = require('mongodb');
var Parse = require('parse/node').Parse;

// TODO: Turn this into a helper library for the database adapter.

// Transforms a key-value pair from REST API form to Mongo form.
// This is the main entry point for converting anything from REST form
// to Mongo form; no conversion should happen that doesn't pass
// through this function.
// Schema should already be loaded.
//
// There are several options that can help transform:
//
// query: true indicates that query constraints like $lt are allowed in
// the value.
//
// update: true indicates that __op operators like Add and Delete
// in the value are converted to a mongo update form. Otherwise they are
// converted to static data.
//
// validate: true indicates that key names are to be validated.
//
// Returns an object with {key: key, value: value}.
export function transformKeyValue(schema, className, restKey, restValue, options) {
  options = options || {};

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
    if (!options.query) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME,
                            'you can only use $or in queries');
    }
    if (!(restValue instanceof Array)) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY,
                            'bad $or format - use an array value');
    }
    var mongoSubqueries = restValue.map((s) => {
      return transformWhere(schema, className, s);
    });
    return {key: '$or', value: mongoSubqueries};
  case '$and':
    if (!options.query) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME,
                            'you can only use $and in queries');
    }
    if (!(restValue instanceof Array)) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY,
                            'bad $and format - use an array value');
    }
    var mongoSubqueries = restValue.map((s) => {
      return transformWhere(schema, className, s);
    });
    return {key: '$and', value: mongoSubqueries};
  default:
    // Other auth data
    var authDataMatch = key.match(/^authData\.([a-zA-Z0-9_]+)\.id$/);
    if (authDataMatch) {
      if (options.query) {
        var provider = authDataMatch[1];
        // Special-case auth data.
        return {key: '_auth_data_'+provider+'.id', value: restValue};
      }
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME,
                            'can only query on ' + key);
      break;
    };
    if (options.validate && !key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME,
                            'invalid key name: ' + key);
    }
  }

  // Handle special schema key changes
  // TODO: it seems like this is likely to have edge cases where
  // pointer types are missed
  var expected = undefined;
  if (schema && schema.getExpectedType) {
    expected = schema.getExpectedType(className, key);
  }
  if ((expected && expected[0] == '*') ||
      (!expected && restValue && restValue.__type == 'Pointer')) {
    key = '_p_' + key;
  }
  var inArray = (expected === 'array');

  // Handle query constraints
  if (options.query) {
    value = transformConstraint(restValue, inArray);
    if (value !== CannotTransform) {
      return {key: key, value: value};
    }
  }

  if (inArray && options.query && !(restValue instanceof Array)) {
    return {
      key: key, value: { '$all' : [restValue] }
    };
  }

  // Handle atomic values
  var value = transformAtom(restValue, false, options);
  if (value !== CannotTransform) {
    if (timeField && (typeof value === 'string')) {
      value = new Date(value);
    }
    return {key: key, value: value};
  }

  // ACLs are handled before this method is called
  // If an ACL key still exists here, something is wrong.
  if (key === 'ACL') {
    throw 'There was a problem transforming an ACL.';
  }



  // Handle arrays
  if (restValue instanceof Array) {
    if (options.query) {
      throw new Parse.Error(Parse.Error.INVALID_JSON,
                            'cannot use array as query param');
    }
    value = restValue.map((restObj) => {
      var out = transformKeyValue(schema, className, restKey, restObj, { inArray: true });
      return out.value;
    });
    return {key: key, value: value};
  }

  // Handle update operators
  value = transformUpdateOperator(restValue, !options.update);
  if (value !== CannotTransform) {
    return {key: key, value: value};
  }

  // Handle normal objects by recursing
  value = {};
  for (var subRestKey in restValue) {
    var subRestValue = restValue[subRestKey];
    var out = transformKeyValue(schema, className, subRestKey, subRestValue, { inObject: true });
    // For recursed objects, keep the keys in rest format
    value[subRestKey] = out.value;
  }
  return {key: key, value: value};
}


// Main exposed method to help run queries.
// restWhere is the "where" clause in REST API form.
// Returns the mongo form of the query.
// Throws a Parse.Error if the input query is invalid.
function transformWhere(schema, className, restWhere) {
  var mongoWhere = {};
  if (restWhere['ACL']) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY,
                          'Cannot query on ACL.');
  }
  for (var restKey in restWhere) {
    var out = transformKeyValue(schema, className, restKey, restWhere[restKey],
                                {query: true, validate: true});
    mongoWhere[out.key] = out.value;
  }
  return mongoWhere;
}

// Main exposed method to create new objects.
// restCreate is the "create" clause in REST API form.
// Returns the mongo form of the object.
function transformCreate(schema, className, restCreate) {
  if (className == '_User') {
     restCreate = transformAuthData(restCreate);
  }
  var mongoCreate = transformACL(restCreate);
  for (var restKey in restCreate) {
    var out = transformKeyValue(schema, className, restKey, restCreate[restKey]);
    if (out.value !== undefined) {
      mongoCreate[out.key] = out.value;
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
  if (acl._rperm || acl._wperm) {
    mongoUpdate['$set'] = {};
    if (acl._rperm) {
      mongoUpdate['$set']['_rperm'] = acl._rperm;
    }
    if (acl._wperm) {
      mongoUpdate['$set']['_wperm'] = acl._wperm;
    }
  }

  for (var restKey in restUpdate) {
    var out = transformKeyValue(schema, className, restKey, restUpdate[restKey],
                                {update: true});

    // If the output value is an object with any $ keys, it's an
    // operator that needs to be lifted onto the top level update
    // object.
    if (typeof out.value === 'object' && out.value !== null &&
        out.value.__op) {
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
  for (var entry in acl) {
    if (acl[entry].read) {
      rperm.push(entry);
    }
    if (acl[entry].write) {
      wperm.push(entry);
    }
  }
  output._rperm = rperm;
  output._wperm = wperm;
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

// Transforms a key used in the REST API format to its mongo format.
function transformKey(schema, className, key) {
  return transformKeyValue(schema, className, key, null, {validate: true}).key;
}

// A sentinel value that helper transformations return when they
// cannot perform a transformation
function CannotTransform() {}

// Helper function to transform an atom from REST format to Mongo format.
// An atom is anything that can't contain other expressions. So it
// includes things where objects are used to represent other
// datatypes, like pointers and dates, but it does not include objects
// or arrays with generic stuff inside.
// If options.inArray is true, we'll leave it in REST format.
// If options.inObject is true, we'll leave files in REST format.
// Raises an error if this cannot possibly be valid REST format.
// Returns CannotTransform if it's just not an atom, or if force is
// true, throws an error.
function transformAtom(atom, force, options) {
  options = options || {};
  var inArray = options.inArray;
  var inObject = options.inObject;
  switch(typeof atom) {
  case 'string':
  case 'number':
  case 'boolean':
    return atom;

  case 'undefined':
    return atom;
  case 'symbol':
  case 'function':
    throw new Parse.Error(Parse.Error.INVALID_JSON,
                          'cannot transform value: ' + atom);

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
      if (!inArray && !inObject) {
        return atom.className + '$' + atom.objectId;
      }
      return {
        __type: 'Pointer',
        className: atom.className,
        objectId: atom.objectId
      };
    }
    if (DateCoder.isValidJSON(atom)) {
      return DateCoder.JSONToDatabase(atom);
    }
    if (BytesCoder.isValidJSON(atom)) {
      return BytesCoder.JSONToDatabase(atom);
    }
    if (GeoPointCoder.isValidJSON(atom)) {
      return (inArray || inObject ? atom : GeoPointCoder.JSONToDatabase(atom));
    }
    if (FileCoder.isValidJSON(atom)) {
      return (inArray || inObject ? atom : FileCoder.JSONToDatabase(atom));
    }
    if (inArray || inObject) {
      return atom;
    }

    if (force) {
      throw new Parse.Error(Parse.Error.INVALID_JSON,
                            'bad atom: ' + atom);
    }
    return CannotTransform;

  default:
    // I don't think typeof can ever let us get here
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR,
                          'really did not expect value: ' + atom);
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
      answer[key] = transformAtom(constraint[key], true,
                                  {inArray: inArray});
      break;

    case '$in':
    case '$nin':
      var arr = constraint[key];
      if (!(arr instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON,
                              'bad ' + key + ' value');
      }
      answer[key] = arr.map((v) => {
        return transformAtom(v, true, { inArray: inArray });
      });
      break;

    case '$all':
      var arr = constraint[key];
      if (!(arr instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON,
                              'bad ' + key + ' value');
      }
      answer[key] = arr.map((v) => {
        return transformAtom(v, true, { inArray: true });
      });
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
// Returns CannotTransform if this cannot transform it.
// Returns undefined if this should be a no-op.
function transformUpdateOperator(operator, flatten) {
  if (typeof operator !== 'object' || !operator.__op) {
    return CannotTransform;
  }

  switch(operator.__op) {
  case 'Delete':
    if (flatten) {
      return undefined;
    } else {
      return {__op: '$unset', arg: ''};
    }

  case 'Increment':
    if (typeof operator.amount !== 'number') {
      throw new Parse.Error(Parse.Error.INVALID_JSON,
                            'incrementing must provide a number');
    }
    if (flatten) {
      return operator.amount;
    } else {
      return {__op: '$inc', arg: operator.amount};
    }

  case 'Add':
  case 'AddUnique':
    if (!(operator.objects instanceof Array)) {
      throw new Parse.Error(Parse.Error.INVALID_JSON,
                            'objects to add must be an array');
    }
    var toAdd = operator.objects.map((obj) => {
      return transformAtom(obj, true, { inArray: true });
    });
    if (flatten) {
      return toAdd;
    } else {
      var mongoOp = {
        Add: '$push',
        AddUnique: '$addToSet'
      }[operator.__op];
      return {__op: mongoOp, arg: {'$each': toAdd}};
    }

  case 'Remove':
    if (!(operator.objects instanceof Array)) {
      throw new Parse.Error(Parse.Error.INVALID_JSON,
                            'objects to remove must be an array');
    }
    var toRemove = operator.objects.map((obj) => {
      return transformAtom(obj, true, { inArray: true });
    });
    if (flatten) {
      return [];
    } else {
      return {__op: '$pullAll', arg: toRemove};
    }

  default:
    throw new Parse.Error(
      Parse.Error.COMMAND_UNAVAILABLE,
      'the ' + operator.__op + ' op is not supported yet');
  }
}


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
      return mongoObject.map((o) => {
        return untransformObject(schema, className, o);
      });
    }

    if (mongoObject instanceof Date) {
      return Parse._encode(mongoObject);
    }

    if (BytesCoder.isValidDatabaseObject(mongoObject)) {
      return BytesCoder.databaseToJSON(mongoObject);
    }

    var restObject = untransformACL(mongoObject);
    for (var key in mongoObject) {
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
          if (expected && expected[0] != '*') {
            log.info('transform.js', 'Found a pointer in a non-pointer column, dropping it.', className, key);
            break;
          }
          if (mongoObject[key] === null) {
            break;
          }
          var objData = mongoObject[key].split('$');
          var newClass = (expected ? expected.substring(1) : objData[0]);
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
          if (expectedType === 'file' && FileCoder.isValidDatabaseObject(value)) {
            restObject[key] = FileCoder.databaseToJSON(value);
            break;
          }
          if (expectedType === 'geopoint' && GeoPointCoder.isValidDatabaseObject(value)) {
            restObject[key] = GeoPointCoder.databaseToJSON(value);
            break;
          }
        }
        restObject[key] = untransformObject(schema, className,
                                            mongoObject[key], true);
      }
    }
    return restObject;
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
  transformKey: transformKey,
  transformCreate: transformCreate,
  transformUpdate: transformUpdate,
  transformWhere: transformWhere,
  untransformObject: untransformObject
};
