// This class handles schema validation, persistence, and modification.
//
// Each individual Schema object should be immutable. The helpers to
// do things with the Schema just return a new schema when the schema
// is changed.
//
// The canonical place to store this Schema is in the database itself,
// in a _SCHEMA collection. This is not the right way to do it for an
// open source framework, but it's backward compatible, so we're
// keeping it this way for now.
//
// In API-handling code, you should only use the Schema class via the
// ExportAdapter. This will let us replace the schema logic for
// different databases.
// TODO: hide all schema logic inside the database adapter.

var Parse = require('parse/node').Parse;
var transform = require('./transform');

defaultColumns = {
  // Contain the default columns for every parse object type (except _Join collection)
  _Default: {
    "objectId":  {type:'String'},
    "createdAt": {type:'Date'},
    "updatedAt": {type:'Date'},
    "ACL":       {type:'ACL'},
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _User: {
    "username":      {type:'String'},
    "password":      {type:'String'},
    "authData":      {type:'Object'},
    "email":         {type:'String'},
    "emailVerified": {type:'Boolean'},
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _Installation: {
    "installationId":   {type:'String'},
    "deviceToken":      {type:'String'},
    "channels":         {type:'Array'},
    "deviceType":       {type:'String'},
    "pushType":         {type:'String'},
    "GCMSenderId":      {type:'String'},
    "timeZone":         {type:'String'},
    "localeIdentifier": {type:'String'},
    "badge":            {type:'Number'},
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _Role: {
    "name":  {type:'String'},
    "users": {type:'Relation',className:'_User'},
    "roles": {type:'Relation',className:'_Role'},
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _Session: {
    "restricted":     {type:'Boolean'},
    "user":           {type:'Pointer', className:'_User'},
    "installationId": {type:'String'},
    "sessionToken":   {type:'String'},
    "expiresAt":      {type:'Date'},
    "createdWith":    {type:'Object'},
  },
}

// Valid classes must:
// Be one of _User, _Installation, _Role, _Session OR
// Be a join table OR
// Include only alpha-numeric and underscores, and not start with an underscore or number
var joinClassRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
var classAndFieldRegex = /^[A-Za-z][A-Za-z0-9_]*$/;
function classNameIsValid(className) {
  return (
    className === '_User' ||
    className === '_Installation' ||
    className === '_Session' ||
    className === '_SCHEMA' || //TODO: remove this, as _SCHEMA is not a valid class name for storing Parse Objects.
    className === '_Role' ||
    joinClassRegex.test(className) ||
    classAndFieldRegex.test(className)
  );
}

// Valid fields must be alpha-numeric, and not start with an underscore or number
function fieldNameIsValid(fieldName) {
  return classAndFieldRegex.test(fieldName);
}

// Checks that it's not trying to clobber one of the default fields of the class.
function fieldNameIsValidForClass(fieldName, className) {
  if (!fieldNameIsValid(fieldName)) {
    return false;
  }
  if (defaultColumns._Default[fieldName]) {
    return false;
  }
  if (defaultColumns[className] && defaultColumns[className][fieldName]) {
    return false;
  }
  return true;
}

function invalidClassNameMessage(className) {
  return 'Invalid classname: ' + className + ', classnames can only have alphanumeric characters and _, and must start with an alpha character ';
}

// Returns { error: "message", code: ### } if the type could not be
// converted, otherwise returns a returns { result: "mongotype" }
// where mongotype is suitable for inserting into mongo _SCHEMA collection
function schemaAPITypeToMongoFieldType(type) {
  var invalidJsonError = { error: "invalid JSON", code: Parse.Error.INVALID_JSON };
  if (type.type == 'Pointer') {
    if (!type.targetClass) {
      return { error: 'type Pointer needs a class name', code: 135 };
    } else if (typeof type.targetClass !== 'string') {
      return invalidJsonError;
    } else if (!classNameIsValid(type.targetClass)) {
      return { error: invalidClassNameMessage(type.targetClass), code: Parse.Error.INVALID_CLASS_NAME };
    } else  {
      return { result: '*' + type.targetClass };
    }
  }
  if (type.type == 'Relation') {
    if (!type.targetClass) {
      return { error: 'type Relation needs a class name', code: 135 };
    } else if (typeof type.targetClass !== 'string') {
      return invalidJsonError;
    } else if (!classNameIsValid(type.targetClass)) {
      return { error: invalidClassNameMessage(type.targetClass), code: Parse.Error.INVALID_CLASS_NAME };
    } else {
      return { result: 'relation<' + type.targetClass + '>' };
    }
  }
  if (typeof type.type !== 'string') {
    return { error: "invalid JSON", code: Parse.Error.INVALID_JSON };
  }
  switch (type.type) {
    default:         return { error: 'invalid field type: ' + type.type, code: Parse.Error.INCORRECT_TYPE };
    case 'Number':   return { result: 'number' };
    case 'String':   return { result: 'string' };
    case 'Boolean':  return { result: 'boolean' };
    case 'Date':     return { result: 'date' };
    case 'Object':   return { result: 'object' };
    case 'Array':    return { result: 'array' };
    case 'GeoPoint': return { result: 'geopoint' };
    case 'File':     return { result: 'file' };
  }
}

// Create a schema from a Mongo collection and the exported schema format.
// mongoSchema should be a list of objects, each with:
// '_id' indicates the className
// '_metadata' is ignored for now
// Everything else is expected to be a userspace field.
function Schema(collection, mongoSchema) {
  this.collection = collection;

  // this.data[className][fieldName] tells you the type of that field
  this.data = {};
  // this.perms[className][operation] tells you the acl-style permissions
  this.perms = {};

  for (var obj of mongoSchema) {
    var className = null;
    var classData = {};
    var permsData = null;
    for (var key in obj) {
      var value = obj[key];
      switch(key) {
      case '_id':
        className = value;
        break;
      case '_metadata':
        if (value && value['class_permissions']) {
          permsData = value['class_permissions'];
        }
        break;
      default:
        classData[key] = value;
      }
    }
    if (className) {
      this.data[className] = classData;
      if (permsData) {
        this.perms[className] = permsData;
      }
    }
  }
}

// Returns a promise for a new Schema.
function load(collection) {
  return collection.find({}, {}).toArray().then((mongoSchema) => {
    return new Schema(collection, mongoSchema);
  });
}

// Returns a new, reloaded schema.
Schema.prototype.reload = function() {
  return load(this.collection);
};

// Create a new class that includes the three default fields.
// ACL is an implicit column that does not get an entry in the
// _SCHEMAS database. Returns a promise that resolves with the
// created schema, in mongo format.
// on success, and rejects with an error on fail. Ensure you
// have authorization (master key, or client class creation
// enabled) before calling this function.
Schema.prototype.addClassIfNotExists = function(className, fields) {
  if (this.data[className]) {
    return Promise.reject({
      code: Parse.Error.INVALID_CLASS_NAME,
      error: 'class ' + className + ' already exists',
    });
  }

  if (!classNameIsValid(className)) {
    return Promise.reject({
      code: Parse.Error.INVALID_CLASS_NAME,
      error: invalidClassNameMessage(className),
    });
  }
  for (fieldName in fields) {
    if (!fieldNameIsValid(fieldName)) {
      return Promise.reject({
        code: Parse.Error.INVALID_KEY_NAME,
        error: 'invalid field name: ' + fieldName,
      });
    }
    if (!fieldNameIsValidForClass(fieldName, className)) {
      return Promise.reject({
        code: 136,
        error: 'field ' + fieldName + ' cannot be added',
      });
    }
  }

  var mongoObject = {
    _id: className,
    objectId: 'string',
    updatedAt: 'string',
    createdAt: 'string',
  };
  for (fieldName in defaultColumns[className]) {
    validatedField = schemaAPITypeToMongoFieldType(defaultColumns[className][fieldName]);
    if (validatedField.code) {
      return Promise.reject(validatedField);
    }
    mongoObject[fieldName] = validatedField.result;
  }

  for (fieldName in fields) {
    validatedField = schemaAPITypeToMongoFieldType(fields[fieldName]);
    if (validatedField.code) {
      return Promise.reject(validatedField);
    }
    mongoObject[fieldName] = validatedField.result;
  }

  var geoPoints = Object.keys(mongoObject).filter(key => mongoObject[key] === 'geopoint');

  if (geoPoints.length > 1) {
    return Promise.reject({
      code: Parse.Error.INCORRECT_TYPE,
      error: 'currently, only one GeoPoint field may exist in an object. Adding ' + geoPoints[1] + ' when ' + geoPoints[0] + ' already exists.',
    });
  }

  return this.collection.insertOne(mongoObject)
  .then(result => result.ops[0])
  .catch(error => {
    if (error.code === 11000) { //Mongo's duplicate key error
      return Promise.reject({
        code: Parse.Error.INVALID_CLASS_NAME,
        error: 'class ' + className + ' already exists',
      });
    }
    return Promise.reject(error);
  });
}

// Returns a promise that resolves successfully to the new schema
// object or fails with a reason.
// If 'freeze' is true, refuse to update the schema.
// WARNING: this function has side-effects, and doesn't actually
// do any validation of the format of the className. You probably
// should use classNameIsValid or addClassIfNotExists or something
// like that instead. TODO: rename or remove this function.
Schema.prototype.validateClassName = function(className, freeze) {
  if (this.data[className]) {
    return Promise.resolve(this);
  }
  if (freeze) {
    throw new Parse.Error(Parse.Error.INVALID_JSON,
                          'schema is frozen, cannot add: ' + className);
  }
  // We don't have this class. Update the schema
  return this.collection.insert([{_id: className}]).then(() => {
    // The schema update succeeded. Reload the schema
    return this.reload();
  }, () => {
    // The schema update failed. This can be okay - it might
    // have failed because there's a race condition and a different
    // client is making the exact same schema update that we want.
    // So just reload the schema.
    return this.reload();
  }).then((schema) => {
    // Ensure that the schema now validates
    return schema.validateClassName(className, true);
  }, (error) => {
    // The schema still doesn't validate. Give up
    throw new Parse.Error(Parse.Error.INVALID_JSON,
                          'schema class name does not revalidate');
  });
};

// Returns whether the schema knows the type of all these keys.
Schema.prototype.hasKeys = function(className, keys) {
  for (var key of keys) {
    if (!this.data[className] || !this.data[className][key]) {
      return false;
    }
  }
  return true;
};

// Sets the Class-level permissions for a given className, which must
// exist.
Schema.prototype.setPermissions = function(className, perms) {
  var query = {_id: className};
  var update = {
    _metadata: {
      class_permissions: perms
    }
  };
  update = {'$set': update};
  return this.collection.findAndModify(query, {}, update, {}).then(() => {
    // The update succeeded. Reload the schema
    return this.reload();
  });
};

// Returns a promise that resolves successfully to the new schema
// object if the provided className-key-type tuple is valid.
// The className must already be validated.
// If 'freeze' is true, refuse to update the schema for this field.
Schema.prototype.validateField = function(className, key, type, freeze) {
  // Just to check that the key is valid
  transform.transformKey(this, className, key);

  var expected = this.data[className][key];
  if (expected) {
    expected = (expected === 'map' ? 'object' : expected);
    if (expected === type) {
      return Promise.resolve(this);
    } else {
      throw new Parse.Error(
        Parse.Error.INCORRECT_TYPE,
        'schema mismatch for ' + className + '.' + key +
          '; expected ' + expected + ' but got ' + type);
    }
  }

  if (freeze) {
    throw new Parse.Error(Parse.Error.INVALID_JSON,
                          'schema is frozen, cannot add ' + key + ' field');
  }

  // We don't have this field, but if the value is null or undefined,
  // we won't update the schema until we get a value with a type.
  if (!type) {
    return Promise.resolve(this);
  }

  if (type === 'geopoint') {
    // Make sure there are not other geopoint fields
    for (var otherKey in this.data[className]) {
      if (this.data[className][otherKey] === 'geopoint') {
        throw new Parse.Error(
          Parse.Error.INCORRECT_TYPE,
          'there can only be one geopoint field in a class');
      }
    }
  }

  // We don't have this field. Update the schema.
  // Note that we use the $exists guard and $set to avoid race
  // conditions in the database. This is important!
  var query = {_id: className};
  query[key] = {'$exists': false};
  var update = {};
  update[key] = type;
  update = {'$set': update};
  return this.collection.findAndModify(query, {}, update, {}).then(() => {
    // The update succeeded. Reload the schema
    return this.reload();
  }, () => {
    // The update failed. This can be okay - it might have been a race
    // condition where another client updated the schema in the same
    // way that we wanted to. So, just reload the schema
    return this.reload();
  }).then((schema) => {
    // Ensure that the schema now validates
    return schema.validateField(className, key, type, true);
  }, (error) => {
    // The schema still doesn't validate. Give up
    throw new Parse.Error(Parse.Error.INVALID_JSON,
                          'schema key will not revalidate');
  });
};

// Given a schema promise, construct another schema promise that
// validates this field once the schema loads.
function thenValidateField(schemaPromise, className, key, type) {
  return schemaPromise.then((schema) => {
    return schema.validateField(className, key, type);
  });
}

// Validates an object provided in REST format.
// Returns a promise that resolves to the new schema if this object is
// valid.
Schema.prototype.validateObject = function(className, object) {
  var geocount = 0;
  var promise = this.validateClassName(className);
  for (var key in object) {
    if (object[key] === undefined) {
      continue;
    }
    var expected = getType(object[key]);
    if (expected === 'geopoint') {
      geocount++;
    }
    if (geocount > 1) {
      throw new Parse.Error(
        Parse.Error.INCORRECT_TYPE,
        'there can only be one geopoint field in a class');
    }
    if (!expected) {
      continue;
    }
    promise = thenValidateField(promise, className, key, expected);
  }
  return promise;
};

// Validates an operation passes class-level-permissions set in the schema
Schema.prototype.validatePermission = function(className, aclGroup, operation) {
  if (!this.perms[className] || !this.perms[className][operation]) {
    return Promise.resolve();
  }
  var perms = this.perms[className][operation];
  // Handle the public scenario quickly
  if (perms['*']) {
    return Promise.resolve();
  }
  // Check permissions against the aclGroup provided (array of userId/roles)
  var found = false;
  for (var i = 0; i < aclGroup.length && !found; i++) {
    if (perms[aclGroup[i]]) {
      found = true;
    }
  }
  if (!found) {
    // TODO: Verify correct error code
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND,
                          'Permission denied for this action.');
  }
};

// Returns the expected type for a className+key combination
// or undefined if the schema is not set
Schema.prototype.getExpectedType = function(className, key) {
  if (this.data && this.data[className]) {
    return this.data[className][key];
  }
  return undefined;
};

// Helper function to check if a field is a pointer, returns true or false.
Schema.prototype.isPointer = function(className, key) {
  var expected = this.getExpectedType(className, key);
  if (expected && expected.charAt(0) == '*') {
    return true;
  }
  return false;
};

// Gets the type from a REST API formatted object, where 'type' is
// extended past javascript types to include the rest of the Parse
// type system.
// The output should be a valid schema value.
// TODO: ensure that this is compatible with the format used in Open DB
function getType(obj) {
  var type = typeof obj;
  switch(type) {
  case 'boolean':
  case 'string':
  case 'number':
    return type;
  case 'map':
  case 'object':
    if (!obj) {
      return undefined;
    }
    return getObjectType(obj);
  case 'function':
  case 'symbol':
  case 'undefined':
  default:
    throw 'bad obj: ' + obj;
  }
}

// This gets the type for non-JSON types like pointers and files, but
// also gets the appropriate type for $ operators.
// Returns null if the type is unknown.
function getObjectType(obj) {
  if (obj instanceof Array) {
    return 'array';
  }
  if (obj.__type === 'Pointer' && obj.className) {
    return '*' + obj.className;
  }
  if (obj.__type === 'File' && obj.url && obj.name) {
    return 'file';
  }
  if (obj.__type === 'Date' && obj.iso) {
    return 'date';
  }
  if (obj.__type == 'GeoPoint' &&
      obj.latitude != null &&
      obj.longitude != null) {
    return 'geopoint';
  }
  if (obj['$ne']) {
    return getObjectType(obj['$ne']);
  }
  if (obj.__op) {
    switch(obj.__op) {
    case 'Increment':
      return 'number';
    case 'Delete':
      return null;
    case 'Add':
    case 'AddUnique':
    case 'Remove':
      return 'array';
    case 'AddRelation':
    case 'RemoveRelation':
      return 'relation<' + obj.objects[0].className + '>';
    case 'Batch':
      return getObjectType(obj.ops[0]);
    default:
      throw 'unexpected op: ' + obj.__op;
    }
  }
  return 'object';
}


module.exports = {
  load: load,
  classNameIsValid: classNameIsValid,
};
