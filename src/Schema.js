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
// DatabaseController. This will let us replace the schema logic for
// different databases.
// TODO: hide all schema logic inside the database adapter.

var Parse = require('parse/node').Parse;
var transform = require('./transform');

const defaultColumns = Object.freeze({
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
    "badge":            {type:'Number'}
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _Role: {
    "name":  {type:'String'},
    "users": {type:'Relation', targetClass:'_User'},
    "roles": {type:'Relation', targetClass:'_Role'}
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _Session: {
    "restricted":     {type:'Boolean'},
    "user":           {type:'Pointer', targetClass:'_User'},
    "installationId": {type:'String'},
    "sessionToken":   {type:'String'},
    "expiresAt":      {type:'Date'},
    "createdWith":    {type:'Object'}
  },
  _Product: {
    "productIdentifier":  {type:'String'},
    "download":           {type:'File'},
    "downloadName":       {type:'String'},
    "icon":               {type:'File'},
    "order":              {type:'Number'},
    "title":              {type:'String'},
    "subtitle":           {type:'String'},
  },
  _PushStatus: {
    "pushTime":     {type:'String'},
    "source":       {type:'String'}, // rest or webui
    "query":        {type:'String'}, // the stringified JSON query
    "payload":      {type:'Object'}, // the JSON payload,
    "title":        {type:'String'},
    "expiry":       {type:'Number'},
    "status":       {type:'String'},
    "numSent":      {type:'Number'},
    "numFailed":    {type:'Number'},
    "pushHash":     {type:'String'},
    "errorMessage": {type:'Object'},
    "sentPerType":  {type:'Object'},
    "failedPerType":{type:'Object'},
  }
});

const requiredColumns = Object.freeze({
  _Product: ["productIdentifier", "icon", "order", "title", "subtitle"],
  _Role: ["name", "ACL"]
});

const systemClasses = Object.freeze(['_User', '_Installation', '_Role', '_Session', '_Product']);

// 10 alpha numberic chars + uppercase
const userIdRegex = /^[a-zA-Z0-9]{10}$/;
// Anything that start with role
const roleRegex = /^role:.*/;
// * permission
const publicRegex = /^\*$/

const permissionKeyRegex = Object.freeze([userIdRegex, roleRegex, publicRegex]);

function verifyPermissionKey(key) {
  let result = permissionKeyRegex.reduce((isGood, regEx) => {
    isGood = isGood || key.match(regEx) != null;
    return isGood;
  }, false);
  if (!result) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}

const CLPValidKeys = Object.freeze(['find', 'get', 'create', 'update', 'delete', 'addField']);
let DefaultClassLevelPermissions = () => {
  return CLPValidKeys.reduce((perms, key) => {
    perms[key] = {
      '*': true
    };
    return perms;
  }, {});
}

function validateCLP(perms) {
  if (!perms) {
    return;
  }
  Object.keys(perms).forEach((operation) => {
    if (CLPValidKeys.indexOf(operation) == -1) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `${operation} is not a valid operation for class level permissions`);
    }
    Object.keys(perms[operation]).forEach((key) => {
      verifyPermissionKey(key);
      let perm = perms[operation][key];
      if (perm !== true) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `'${perm}' is not a valid value for class level permissions ${operation}:${key}:${perm}`);
      }
    });
  });
}
// Valid classes must:
// Be one of _User, _Installation, _Role, _Session OR
// Be a join table OR
// Include only alpha-numeric and underscores, and not start with an underscore or number
var joinClassRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
var classAndFieldRegex = /^[A-Za-z][A-Za-z0-9_]*$/;
function classNameIsValid(className) {
  return (systemClasses.indexOf(className) > -1 ||
    className === '_SCHEMA' || //TODO: remove this, as _SCHEMA is not a valid class name for storing Parse Objects.
    joinClassRegex.test(className) ||
    //Class names have the same constraints as field names, but also allow the previous additional names.
    fieldNameIsValid(className)
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
    } else {
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
class Schema {
  _collection;
  data;
  perms;

  constructor(collection) {
    this._collection = collection;

    // this.data[className][fieldName] tells you the type of that field
    this.data = {};
    // this.perms[className][operation] tells you the acl-style permissions
    this.perms = {};
  }

  reloadData() {
    this.data = {};
    this.perms = {};
    return this._collection.getAllSchemas().then(results => {
      for (let obj of results) {
        let className = null;
        let classData = {};
        let permsData = null;
        Object.keys(obj).forEach(key => {
          let value = obj[key];
          switch (key) {
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
        });
        if (className) {
          this.data[className] = classData;
          if (permsData) {
            this.perms[className] = permsData;
          }
        }
      }
    });
  }

  // Create a new class that includes the three default fields.
  // ACL is an implicit column that does not get an entry in the
  // _SCHEMAS database. Returns a promise that resolves with the
  // created schema, in mongo format.
  // on success, and rejects with an error on fail. Ensure you
  // have authorization (master key, or client class creation
  // enabled) before calling this function.
  addClassIfNotExists(className, fields, classLevelPermissions) {
    if (this.data[className]) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
    }

    let mongoObject = mongoSchemaFromFieldsAndClassNameAndCLP(fields, className, classLevelPermissions);
    if (!mongoObject.result) {
      return Promise.reject(mongoObject);
    }

    return this._collection.addSchema(className, mongoObject.result)
      .then(result => result.ops[0])
      .catch(error => {
        if (error.code === 11000) { //Mongo's duplicate key error
          throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
        }
        return Promise.reject(error);
      });
  }

  updateClass(className, submittedFields, classLevelPermissions, database) {
    if (!this.data[className]) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
    }
    let existingFields = Object.assign(this.data[className], {_id: className});
    Object.keys(submittedFields).forEach(name => {
      let field = submittedFields[name];
      if (existingFields[name] && field.__op !== 'Delete') {
        throw new Parse.Error(255, `Field ${name} exists, cannot update.`);
      }
      if (!existingFields[name] && field.__op === 'Delete') {
        throw new Parse.Error(255, `Field ${name} does not exist, cannot delete.`);
      }
    });

    let newSchema = buildMergedSchemaObject(existingFields, submittedFields);
    let mongoObject = mongoSchemaFromFieldsAndClassNameAndCLP(newSchema, className, classLevelPermissions);
    if (!mongoObject.result) {
      throw new Parse.Error(mongoObject.code, mongoObject.error);
    }

    // Finally we have checked to make sure the request is valid and we can start deleting fields.
    // Do all deletions first, then a single save to _SCHEMA collection to handle all additions.
    let deletePromises = [];
    let insertedFields = [];
    Object.keys(submittedFields).forEach(fieldName => {
      if (submittedFields[fieldName].__op === 'Delete') {
        const promise = this.deleteField(fieldName, className, database);
        deletePromises.push(promise);
      } else {
        insertedFields.push(fieldName);
      }
    });
    return Promise.all(deletePromises) // Delete Everything
      .then(() => this.reloadData()) // Reload our Schema, so we have all the new values
      .then(() => {
        let promises = insertedFields.map(fieldName => {
          const mongoType = mongoObject.result[fieldName];
          return this.validateField(className, fieldName, mongoType);
        });
        return Promise.all(promises);
      })
      .then(() => {
        return this.setPermissions(className, classLevelPermissions)
      })
      .then(() => { return mongoSchemaToSchemaAPIResponse(mongoObject.result) });
  }


  // Returns whether the schema knows the type of all these keys.
  hasKeys(className, keys) {
    for (var key of keys) {
      if (!this.data[className] || !this.data[className][key]) {
        return false;
      }
    }
    return true;
  }

  // Returns a promise that resolves successfully to the new schema
  // object or fails with a reason.
  // If 'freeze' is true, refuse to update the schema.
  // WARNING: this function has side-effects, and doesn't actually
  // do any validation of the format of the className. You probably
  // should use classNameIsValid or addClassIfNotExists or something
  // like that instead. TODO: rename or remove this function.
  validateClassName(className, freeze) {
    if (this.data[className]) {
      return Promise.resolve(this);
    }
    if (freeze) {
      throw new Parse.Error(Parse.Error.INVALID_JSON,
        'schema is frozen, cannot add: ' + className);
    }
    // We don't have this class. Update the schema
    return this._collection.addSchema(className).then(() => {
      // The schema update succeeded. Reload the schema
      return this.reloadData();
    }, () => {
      // The schema update failed. This can be okay - it might
      // have failed because there's a race condition and a different
      // client is making the exact same schema update that we want.
      // So just reload the schema.
      return this.reloadData();
    }).then(() => {
      // Ensure that the schema now validates
      return this.validateClassName(className, true);
    }, () => {
      // The schema still doesn't validate. Give up
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'schema class name does not revalidate');
    });
  }

  // Sets the Class-level permissions for a given className, which must exist.
  setPermissions(className, perms) {
    if (typeof perms === 'undefined') {
      return Promise.resolve();
    }
    validateCLP(perms);
    var update = {
      _metadata: {
        class_permissions: perms
      }
    };
    update = {'$set': update};
    return this._collection.updateSchema(className, update).then(() => {
      // The update succeeded. Reload the schema
      return this.reloadData();
    });
  }

  // Returns a promise that resolves successfully to the new schema
  // object if the provided className-key-type tuple is valid.
  // The className must already be validated.
  // If 'freeze' is true, refuse to update the schema for this field.
  validateField(className, key, type, freeze) {
    // Just to check that the key is valid
    transform.transformKey(this, className, key);

    if( key.indexOf(".") > 0 ) {
      // subdocument key (x.y) => ok if x is of type 'object'
      key = key.split(".")[ 0 ];
      type = 'object';
    }

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
    let query = {};
    query[key] = { '$exists': false };
    var update = {};
    update[key] = type;
    update = {'$set': update};
    return this._collection.upsertSchema(className, query, update).then(() => {
      // The update succeeded. Reload the schema
      return this.reloadData();
    }, () => {
      // The update failed. This can be okay - it might have been a race
      // condition where another client updated the schema in the same
      // way that we wanted to. So, just reload the schema
      return this.reloadData();
    }).then(() => {
      // Ensure that the schema now validates
      return this.validateField(className, key, type, true);
    }, (error) => {
      // The schema still doesn't validate. Give up
      throw new Parse.Error(Parse.Error.INVALID_JSON,
        'schema key will not revalidate');
    });
  }

  // Delete a field, and remove that data from all objects. This is intended
  // to remove unused fields, if other writers are writing objects that include
  // this field, the field may reappear. Returns a Promise that resolves with
  // no object on success, or rejects with { code, error } on failure.
  // Passing the database and prefix is necessary in order to drop relation collections
  // and remove fields from objects. Ideally the database would belong to
  // a database adapter and this function would close over it or access it via member.
  deleteField(fieldName, className, database) {
    if (!classNameIsValid(className)) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(className));
    }
    if (!fieldNameIsValid(fieldName)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `invalid field name: ${fieldName}`);
    }
    //Don't allow deleting the default fields.
    if (!fieldNameIsValidForClass(fieldName, className)) {
      throw new Parse.Error(136, `field ${fieldName} cannot be changed`);
    }

    return this.reloadData()
      .then(() => {
        return this.hasClass(className)
          .then(hasClass => {
            if (!hasClass) {
              throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
            }
            if (!this.data[className][fieldName]) {
              throw new Parse.Error(255, `Field ${fieldName} does not exist, cannot delete.`);
            }

            if (this.data[className][fieldName].startsWith('relation<')) {
              //For relations, drop the _Join table
              return database.dropCollection(`_Join:${fieldName}:${className}`)
              .then(() => {
                return Promise.resolve();
              }, error => {
                if (error.message == 'ns not found') {
                  return Promise.resolve();
                }
                return Promise.reject(error);
              });
            }

            // for non-relations, remove all the data.
            // This is necessary to ensure that the data is still gone if they add the same field.
            return database.adaptiveCollection(className)
              .then(collection => {
                let mongoFieldName = this.data[className][fieldName].startsWith('*') ? `_p_${fieldName}` : fieldName;
                return collection.updateMany({}, { "$unset": { [mongoFieldName]: null } });
              });
          })
          // Save the _SCHEMA object
          .then(() => this._collection.updateSchema(className, { $unset: { [fieldName]: null } }));
      });
  }

  // Validates an object provided in REST format.
  // Returns a promise that resolves to the new schema if this object is
  // valid.
  validateObject(className, object, query) {
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
        // Make sure all field validation operations run before we return.
        // If not - we are continuing to run logic, but already provided response from the server.
        return promise.then(() => {
          return Promise.reject(new Parse.Error(Parse.Error.INCORRECT_TYPE,
            'there can only be one geopoint field in a class'));
        });
      }
      if (!expected) {
        continue;
      }
      promise = thenValidateField(promise, className, key, expected);
    }
    promise = thenValidateRequiredColumns(promise, className, object, query);
    return promise;
  }

  // Validates that all the properties are set for the object
  validateRequiredColumns(className, object, query) {
    var columns = requiredColumns[className];
    if (!columns || columns.length == 0) {
      return Promise.resolve(this);
    }

    var missingColumns = columns.filter(function(column){
      if (query && query.objectId) {
        if (object[column] && typeof object[column] === "object") {
          // Trying to delete a required column
          return object[column].__op == 'Delete';
        }
        // Not trying to do anything there
        return false;
      }
      return !object[column]
    });

    if (missingColumns.length > 0) {
      throw new Parse.Error(
        Parse.Error.INCORRECT_TYPE,
        missingColumns[0]+' is required.');
    }

    return Promise.resolve(this);
  }

  // Validates an operation passes class-level-permissions set in the schema
  validatePermission(className, aclGroup, operation) {
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
  getExpectedType(className, key) {
    if (this.data && this.data[className]) {
      return this.data[className][key];
    }
    return undefined;
  };

  // Checks if a given class is in the schema. Needs to load the
  // schema first, which is kinda janky. Hopefully we can refactor
  // and make this be a regular value.
  hasClass(className) {
    return this.reloadData().then(() => !!(this.data[className]));
  }

  // Helper function to check if a field is a pointer, returns true or false.
  isPointer(className, key) {
    var expected = this.getExpectedType(className, key);
    if (expected && expected.charAt(0) == '*') {
      return true;
    }
    return false;
  };
}

// Returns a promise for a new Schema.
function load(collection) {
  let schema = new Schema(collection);
  return schema.reloadData().then(() => schema);
}

// Returns { code, error } if invalid, or { result }, an object
// suitable for inserting into _SCHEMA collection, otherwise
function mongoSchemaFromFieldsAndClassNameAndCLP(fields, className, classLevelPermissions) {
  if (!classNameIsValid(className)) {
    return {
      code: Parse.Error.INVALID_CLASS_NAME,
      error: invalidClassNameMessage(className),
    };
  }

  for (var fieldName in fields) {
    if (!fieldNameIsValid(fieldName)) {
      return {
        code: Parse.Error.INVALID_KEY_NAME,
        error: 'invalid field name: ' + fieldName,
      };
    }
    if (!fieldNameIsValidForClass(fieldName, className)) {
      return {
        code: 136,
        error: 'field ' + fieldName + ' cannot be added',
      };
    }
  }

  var mongoObject = {
    _id: className,
    objectId: 'string',
    updatedAt: 'string',
    createdAt: 'string'
  };

  for (var fieldName in defaultColumns[className]) {
    var validatedField = schemaAPITypeToMongoFieldType(defaultColumns[className][fieldName]);
    if (!validatedField.result) {
      return validatedField;
    }
    mongoObject[fieldName] = validatedField.result;
  }

  for (var fieldName in fields) {
    var validatedField = schemaAPITypeToMongoFieldType(fields[fieldName]);
    if (!validatedField.result) {
      return validatedField;
    }
    mongoObject[fieldName] = validatedField.result;
  }

  var geoPoints = Object.keys(mongoObject).filter(key => mongoObject[key] === 'geopoint');
  if (geoPoints.length > 1) {
    return {
      code: Parse.Error.INCORRECT_TYPE,
      error: 'currently, only one GeoPoint field may exist in an object. Adding ' + geoPoints[1] + ' when ' + geoPoints[0] + ' already exists.',
    };
  }

  validateCLP(classLevelPermissions);
  if (typeof classLevelPermissions !== 'undefined') {
    mongoObject._metadata = mongoObject._metadata || {};
    if (!classLevelPermissions) {
      delete mongoObject._metadata.class_permissions;
    } else {
      mongoObject._metadata.class_permissions = classLevelPermissions;
    }
  }

  return { result: mongoObject };
}

function mongoFieldTypeToSchemaAPIType(type) {
  if (type[0] === '*') {
    return {
      type: 'Pointer',
      targetClass: type.slice(1),
    };
  }
  if (type.startsWith('relation<')) {
    return {
      type: 'Relation',
      targetClass: type.slice('relation<'.length, type.length - 1),
    };
  }
  switch (type) {
    case 'number':   return {type: 'Number'};
    case 'string':   return {type: 'String'};
    case 'boolean':  return {type: 'Boolean'};
    case 'date':     return {type: 'Date'};
    case 'map':
    case 'object':   return {type: 'Object'};
    case 'array':    return {type: 'Array'};
    case 'geopoint': return {type: 'GeoPoint'};
    case 'file':     return {type: 'File'};
  }
}

// Builds a new schema (in schema API response format) out of an
// existing mongo schema + a schemas API put request. This response
// does not include the default fields, as it is intended to be passed
// to mongoSchemaFromFieldsAndClassName. No validation is done here, it
// is done in mongoSchemaFromFieldsAndClassName.
function buildMergedSchemaObject(mongoObject, putRequest) {
  var newSchema = {};
  let sysSchemaField = Object.keys(defaultColumns).indexOf(mongoObject._id) === -1 ? [] : Object.keys(defaultColumns[mongoObject._id]);
  for (var oldField in mongoObject) {
    if (oldField !== '_id' && oldField !== 'ACL' &&  oldField !== 'updatedAt' && oldField !== 'createdAt' && oldField !== 'objectId') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(oldField) !== -1) {
        continue;
      }
      var fieldIsDeleted = putRequest[oldField] && putRequest[oldField].__op === 'Delete'
      if (!fieldIsDeleted) {
        newSchema[oldField] = mongoFieldTypeToSchemaAPIType(mongoObject[oldField]);
      }
    }
  }
  for (var newField in putRequest) {
    if (newField !== 'objectId' && putRequest[newField].__op !== 'Delete') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(newField) !== -1) {
        continue;
      }
      newSchema[newField] = putRequest[newField];
    }
  }
  return newSchema;
}

// Given a schema promise, construct another schema promise that
// validates this field once the schema loads.
function thenValidateField(schemaPromise, className, key, type) {
  return schemaPromise.then((schema) => {
    return schema.validateField(className, key, type);
  });
}

// Given a schema promise, construct another schema promise that
// validates this field once the schema loads.
function thenValidateRequiredColumns(schemaPromise, className, object, query) {
  return schemaPromise.then((schema) => {
    return schema.validateRequiredColumns(className, object, query);
  });
}

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
  if (obj.__type){
    switch(obj.__type) {
      case 'Pointer' :
        if(obj.className) {
          return '*' + obj.className;
        }
      case 'File' :
        if(obj.name) {
          return 'file';
        }
      case 'Date' :
        if(obj.iso) {
          return 'date';
        }
      case 'GeoPoint' :
        if(obj.latitude != null && obj.longitude != null) {
          return 'geopoint';
        }
      case 'Bytes' :
        if(obj.base64) {
          return;
        }
      default:
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, "This is not a valid "+obj.__type);
    }
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

const nonFieldSchemaKeys = ['_id', '_metadata', '_client_permissions'];
function mongoSchemaAPIResponseFields(schema) {
  var fieldNames = Object.keys(schema).filter(key => nonFieldSchemaKeys.indexOf(key) === -1);
  var response = fieldNames.reduce((obj, fieldName) => {
    obj[fieldName] = mongoFieldTypeToSchemaAPIType(schema[fieldName])
    return obj;
  }, {});
  response.ACL = {type: 'ACL'};
  response.createdAt = {type: 'Date'};
  response.updatedAt = {type: 'Date'};
  response.objectId = {type: 'String'};
  return response;
}

function mongoSchemaToSchemaAPIResponse(schema) {
  let result = {
    className: schema._id,
    fields: mongoSchemaAPIResponseFields(schema),
  };

  let classLevelPermissions = DefaultClassLevelPermissions();
  if (schema._metadata && schema._metadata.class_permissions) {
    classLevelPermissions = Object.assign({}, classLevelPermissions, schema._metadata.class_permissions);
  }
  result.classLevelPermissions = classLevelPermissions;
  return result;
}

export {
  load,
  classNameIsValid,
  invalidClassNameMessage,
  schemaAPITypeToMongoFieldType,
  buildMergedSchemaObject,
  mongoFieldTypeToSchemaAPIType,
  mongoSchemaToSchemaAPIResponse,
  systemClasses,
};
