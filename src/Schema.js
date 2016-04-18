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

const Parse = require('parse/node').Parse;
import MongoSchemaCollection from './Adapters/Storage/Mongo/MongoSchemaCollection';
import _                     from 'lodash';

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
const joinClassRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
const classAndFieldRegex = /^[A-Za-z][A-Za-z0-9_]*$/;
function classNameIsValid(className) {
  // Valid classes must:
  return (
    // Be one of _User, _Installation, _Role, _Session OR
    systemClasses.indexOf(className) > -1 ||
    // Be a join table OR
    joinClassRegex.test(className) ||
    // Include only alpha-numeric and underscores, and not start with an underscore or number
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

const invalidJsonError = new Parse.Error(Parse.Error.INVALID_JSON, "invalid JSON");
const validNonRelationOrPointerTypes = [
  'Number',
  'String',
  'Boolean',
  'Date',
  'Object',
  'Array',
  'GeoPoint',
  'File',
];
// Returns an error suitable for throwing if the type is invalid
const fieldTypeIsInvalid = ({ type, targetClass }) => {
  if (['Pointer', 'Relation'].includes(type)) {
    if (!targetClass) {
      return new Parse.Error(135, `type ${type} needs a class name`);
    } else if (typeof targetClass !== 'string') {
       return invalidJsonError;
    } else if (!classNameIsValid(targetClass)) {
      return new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(targetClass));
     } else {
      return undefined;
     }
   }
   if (typeof type !== 'string') {
    return invalidJsonError;
   }
  if (!validNonRelationOrPointerTypes.includes(type)) {
    return new Parse.Error(Parse.Error.INCORRECT_TYPE, `invalid field type: ${type}`);
   }
  return undefined;
}

const injectDefaultSchema = schema => ({
  className: schema.className,
  fields: {
    ...defaultColumns._Default,
    ...(defaultColumns[schema.className] || {}),
    ...schema.fields,
  },
  classLevelPermissions: schema.classLevelPermissions,
})

// Stores the entire schema of the app in a weird hybrid format somewhere between
// the mongo format and the Parse format. Soon, this will all be Parse format.
class SchemaController {
  _collection;
  _dbAdapter;
  data;
  perms;

  constructor(collection, databaseAdapter) {
    this._collection = collection;
    this._dbAdapter = databaseAdapter;

    // this.data[className][fieldName] tells you the type of that field, in mongo format
    this.data = {};
    // this.perms[className][operation] tells you the acl-style permissions
    this.perms = {};
  }

  reloadData() {
    this.data = {};
    this.perms = {};
    return this.getAllSchemas()
    .then(allSchemas => {
      allSchemas.forEach(schema => {
        this.data[schema.className] = schema.fields;
        this.perms[schema.className] = schema.classLevelPermissions;
      });
    });
  }

  getAllSchemas() {
    return this._dbAdapter.getAllSchemas()
    .then(allSchemas => allSchemas.map(injectDefaultSchema));
  }

  // Create a new class that includes the three default fields.
  // ACL is an implicit column that does not get an entry in the
  // _SCHEMAS database. Returns a promise that resolves with the
  // created schema, in mongo format.
  // on success, and rejects with an error on fail. Ensure you
  // have authorization (master key, or client class creation
  // enabled) before calling this function.
  addClassIfNotExists(className, fields = {}, classLevelPermissions) {
    var validationError = this.validateNewClass(className, fields, classLevelPermissions);
    if (validationError) {
      return Promise.reject(validationError);
    }

    return this._collection.addSchema(className, fields, classLevelPermissions)
    .catch(error => {
      if (error === undefined) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
      } else {
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error.');
      }
    });
  }

  updateClass(className, submittedFields, classLevelPermissions, database) {
    return this.hasClass(className)
    .then(hasClass => {
      if (!hasClass) {
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
      let validationError = this.validateSchemaData(className, newSchema, classLevelPermissions);
      if (validationError) {
        throw new Parse.Error(validationError.code, validationError.error);
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
          const type = submittedFields[fieldName];
          return this.validateField(className, fieldName, type);
        });
        return Promise.all(promises);
      })
      .then(() => this.setPermissions(className, classLevelPermissions))
      //TODO: Move this logic into the database adapter
      .then(() => ({
        className: className,
        fields: this.data[className],
        classLevelPermissions: this.perms[className]
      }));
    })
  }


  // Returns whether the schema knows the type of all these keys.
  hasKeys(className, keys) {
    for (let key of keys) {
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
    return this.addClassIfNotExists(className, []).then(() => {
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

  validateNewClass(className, fields = {}, classLevelPermissions) {
    if (this.data[className]) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
    }
    if (!classNameIsValid(className)) {
      return {
        code: Parse.Error.INVALID_CLASS_NAME,
        error: invalidClassNameMessage(className),
      };
    }
    return this.validateSchemaData(className, fields, classLevelPermissions);
  }

  validateSchemaData(className, fields, classLevelPermissions) {
    for (let fieldName in fields) {
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
      const error = fieldTypeIsInvalid(fields[fieldName]);
      if (error) return { code: error.code, error: error.message };
    }

    for (let fieldName in defaultColumns[className]) {
      fields[fieldName] = defaultColumns[className][fieldName];
    }

    let geoPoints = Object.keys(fields).filter(key => fields[key] && fields[key].type === 'GeoPoint');
    if (geoPoints.length > 1) {
      return {
        code: Parse.Error.INCORRECT_TYPE,
        error: 'currently, only one GeoPoint field may exist in an object. Adding ' + geoPoints[1] + ' when ' + geoPoints[0] + ' already exists.',
      };
    }
    validateCLP(classLevelPermissions);
  }

  // Sets the Class-level permissions for a given className, which must exist.
  setPermissions(className, perms) {
    if (typeof perms === 'undefined') {
      return Promise.resolve();
    }
    validateCLP(perms);
    let update = {
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
  // object if the provided className-fieldName-type tuple is valid.
  // The className must already be validated.
  // If 'freeze' is true, refuse to update the schema for this field.
  validateField(className, fieldName, type, freeze) {
    return this.reloadData().then(() => {
      // Just to check that the fieldName is valid
      this._collection.transform.transformKey(this, className, fieldName);

      if( fieldName.indexOf(".") > 0 ) {
        // subdocument key (x.y) => ok if x is of type 'object'
        fieldName = fieldName.split(".")[ 0 ];
        type = 'Object';
      }

      let expected = this.data[className][fieldName];
      if (expected) {
        expected = (expected === 'map' ? 'Object' : expected);
        if (expected.type && type.type
            && expected.type == type.type
            && expected.targetClass == type.targetClass) {
          return Promise.resolve(this);
        } else if (expected == type || expected.type == type) {
          return Promise.resolve(this);
        } else {
          throw new Parse.Error(
            Parse.Error.INCORRECT_TYPE,
            `schema mismatch for ${className}.${fieldName}; expected ${expected} but got ${type}`
          );
        }
      }

      if (freeze) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `schema is frozen, cannot add ${fieldName} field`);
      }

      // We don't have this field, but if the value is null or undefined,
      // we won't update the schema until we get a value with a type.
      if (!type) {
        return Promise.resolve(this);
      }

      if (type === 'GeoPoint') {
        // Make sure there are not other geopoint fields
        for (let otherKey in this.data[className]) {
          if (this.data[className][otherKey].type === 'GeoPoint') {
            throw new Parse.Error(
              Parse.Error.INCORRECT_TYPE,
              'there can only be one geopoint field in a class');
          }
        }
      }

      return this._collection.updateField(className, fieldName, type).then(() => {
        // The update succeeded. Reload the schema
        return this.reloadData();
      }, () => {
        // The update failed. This can be okay - it might have been a race
        // condition where another client updated the schema in the same
        // way that we wanted to. So, just reload the schema
        return this.reloadData();
      }).then(() => {
        // Ensure that the schema now validates
        return this.validateField(className, fieldName, type, true);
      }, (error) => {
        // The schema still doesn't validate. Give up
        throw new Parse.Error(Parse.Error.INVALID_JSON,
          'schema key will not revalidate');
      });
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
    .then(() => this.hasClass(className))
    .then(hasClass => {
      if (!hasClass) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      }
      if (!this.data[className][fieldName]) {
        throw new Parse.Error(255, `Field ${fieldName} does not exist, cannot delete.`);
      }

      if (this.data[className][fieldName].type == 'Relation') {
        //For relations, drop the _Join table
        return database.adapter.deleteFields(className, [fieldName], [])
        .then(() => database.dropCollection(`_Join:${fieldName}:${className}`))
        .catch(error => {
          // 'ns not found' means collection was already gone. Ignore deletion attempt.
          // TODO: 'ns not found' is a mongo implementation detail. Move it into mongo adapter.
          if (error.message == 'ns not found') {
            return Promise.resolve();
          }
          return Promise.reject(error);
        });
      }

      const fieldNames = [fieldName];
      const pointerFieldNames = this.data[className][fieldName].type === 'Pointer' ? [fieldName] : [];
      return database.adapter.deleteFields(className, fieldNames, pointerFieldNames);
    });
  }

  // Validates an object provided in REST format.
  // Returns a promise that resolves to the new schema if this object is
  // valid.
  validateObject(className, object, query) {
    let geocount = 0;
    let promise = this.validateClassName(className);
    for (let fieldName in object) {
      if (object[fieldName] === undefined) {
        continue;
      }
      let expected = getType(object[fieldName]);
      if (expected === 'GeoPoint') {
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
      if (fieldName === 'ACL') {
        // Every object has ACL implicitly.
        continue;
      }
      promise = thenValidateField(promise, className, fieldName, expected);
    }
    promise = thenValidateRequiredColumns(promise, className, object, query);
    return promise;
  }

  // Validates that all the properties are set for the object
  validateRequiredColumns(className, object, query) {
    let columns = requiredColumns[className];
    if (!columns || columns.length == 0) {
      return Promise.resolve(this);
    }

    let missingColumns = columns.filter(function(column){
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
    let perms = this.perms[className][operation];
    // Handle the public scenario quickly
    if (perms['*']) {
      return Promise.resolve();
    }
    // Check permissions against the aclGroup provided (array of userId/roles)
    let found = false;
    for (let i = 0; i < aclGroup.length && !found; i++) {
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

  // Checks if a given class is in the schema.
  hasClass(className) {
    return this.reloadData().then(() => !!(this.data[className]));
  }

  // Helper function to check if a field is a pointer, returns true or false.
  isPointer(className, key) {
    let expected = this.getExpectedType(className, key);
    if (expected && expected.charAt(0) == '*') {
      return true;
    }
    return false;
  };

  getRelationFields(className) {
    if (this.data && this.data[className]) {
      let classData = this.data[className];
      return Object.keys(classData).filter((field) => {
        return classData[field].type === 'Relation';
      }).reduce((memo, field) => {
        let type = classData[field];
        memo[field] = {
          __type: 'Relation',
          className: type.targetClass
        };
        return memo;
      }, {});
    }
    return {};
  }
}

// Returns a promise for a new Schema.
function load(collection, dbAdapter) {
  let schema = new SchemaController(collection, dbAdapter);
  return schema.reloadData().then(() => schema);
}

// Builds a new schema (in schema API response format) out of an
// existing mongo schema + a schemas API put request. This response
// does not include the default fields, as it is intended to be passed
// to mongoSchemaFromFieldsAndClassName. No validation is done here, it
// is done in mongoSchemaFromFieldsAndClassName.
function buildMergedSchemaObject(existingFields, putRequest) {
  let newSchema = {};
  let sysSchemaField = Object.keys(defaultColumns).indexOf(existingFields._id) === -1 ? [] : Object.keys(defaultColumns[existingFields._id]);
  for (let oldField in existingFields) {
    if (oldField !== '_id' && oldField !== 'ACL' &&  oldField !== 'updatedAt' && oldField !== 'createdAt' && oldField !== 'objectId') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(oldField) !== -1) {
        continue;
      }
      let fieldIsDeleted = putRequest[oldField] && putRequest[oldField].__op === 'Delete'
      if (!fieldIsDeleted) {
        newSchema[oldField] = existingFields[oldField];
      }
    }
  }
  for (let newField in putRequest) {
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
  let type = typeof obj;
  switch(type) {
    case 'boolean':
      return 'Boolean';
    case 'string':
      return 'String';
    case 'number':
      return 'Number';
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
    return 'Array';
  }
  if (obj.__type){
    switch(obj.__type) {
      case 'Pointer' :
        if(obj.className) {
          return {
            type: 'Pointer',
            targetClass: obj.className
          }
        }
      case 'File' :
        if(obj.name) {
          return 'File';
        }
      case 'Date' :
        if(obj.iso) {
          return 'Date';
        }
      case 'GeoPoint' :
        if(obj.latitude != null && obj.longitude != null) {
          return 'GeoPoint';
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
        return 'Number';
      case 'Delete':
        return null;
      case 'Add':
      case 'AddUnique':
      case 'Remove':
        return 'Array';
      case 'AddRelation':
      case 'RemoveRelation':
        return {
          type: 'Relation',
          targetClass: obj.objects[0].className
        }
      case 'Batch':
        return getObjectType(obj.ops[0]);
      default:
        throw 'unexpected op: ' + obj.__op;
    }
  }
  return 'Object';
}

export {
  load,
  classNameIsValid,
  invalidClassNameMessage,
  buildMergedSchemaObject,
  systemClasses,
  defaultColumns,
  injectDefaultSchema,
};
