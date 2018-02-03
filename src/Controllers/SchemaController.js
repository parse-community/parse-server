// @flow
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
// @flow-disable-next
const Parse = require('parse/node').Parse;
import { StorageAdapter }     from '../Adapters/Storage/StorageAdapter';
import DatabaseController     from './DatabaseController';
import type {
  Schema,
  SchemaFields,
  ClassLevelPermissions,
  SchemaField,
  LoadSchemaOptions,
} from './types';

const defaultColumns: {[string]: SchemaFields} = Object.freeze({
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
    "email":         {type:'String'},
    "emailVerified": {type:'Boolean'},
    "authData":      {type:'Object'}
  },
  // The additional default columns for the _Installation collection (in addition to DefaultCols)
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
    "appVersion":       {type:'String'},
    "appName":          {type:'String'},
    "appIdentifier":    {type:'String'},
    "parseVersion":     {type:'String'},
  },
  // The additional default columns for the _Role collection (in addition to DefaultCols)
  _Role: {
    "name":  {type:'String'},
    "users": {type:'Relation', targetClass:'_User'},
    "roles": {type:'Relation', targetClass:'_Role'}
  },
  // The additional default columns for the _Session collection (in addition to DefaultCols)
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
    "pushTime":            {type:'String'},
    "source":              {type:'String'}, // rest or webui
    "query":               {type:'String'}, // the stringified JSON query
    "payload":             {type:'String'}, // the stringified JSON payload,
    "title":               {type:'String'},
    "expiry":              {type:'Number'},
    "expiration_interval": {type:'Number'},
    "status":              {type:'String'},
    "numSent":             {type:'Number'},
    "numFailed":           {type:'Number'},
    "pushHash":            {type:'String'},
    "errorMessage":        {type:'Object'},
    "sentPerType":         {type:'Object'},
    "failedPerType":       {type:'Object'},
    "sentPerUTCOffset":    {type:'Object'},
    "failedPerUTCOffset":  {type:'Object'},
    "count":               {type:'Number'} // tracks # of batches queued and pending
  },
  _JobStatus: {
    "jobName":    {type: 'String'},
    "source":     {type: 'String'},
    "status":     {type: 'String'},
    "message":    {type: 'String'},
    "params":     {type: 'Object'}, // params received when calling the job
    "finishedAt": {type: 'Date'}
  },
  _JobSchedule: {
    "jobName":      {type:'String'},
    "description":  {type:'String'},
    "params":       {type:'String'},
    "startAfter":   {type:'String'},
    "daysOfWeek":   {type:'Array'},
    "timeOfDay":    {type:'String'},
    "lastRun":      {type:'Number'},
    "repeatMinutes":{type:'Number'}
  },
  _Hooks: {
    "functionName": {type:'String'},
    "className":    {type:'String'},
    "triggerName":  {type:'String'},
    "url":          {type:'String'}
  },
  _GlobalConfig: {
    "objectId": {type: 'String'},
    "params":   {type: 'Object'}
  },
  _Audience: {
    "objectId":  {type:'String'},
    "name":      {type:'String'},
    "query":     {type:'String'}, //storing query as JSON string to prevent "Nested keys should not contain the '$' or '.' characters" error
    "lastUsed":  {type:'Date'},
    "timesUsed": {type:'Number'}
  }
});

const requiredColumns = Object.freeze({
  _Product: ["productIdentifier", "icon", "order", "title", "subtitle"],
  _Role: ["name", "ACL"]
});

const systemClasses = Object.freeze(['_User', '_Installation', '_Role', '_Session', '_Product', '_PushStatus', '_JobStatus', '_JobSchedule', '_Audience']);

const volatileClasses = Object.freeze(['_JobStatus', '_PushStatus', '_Hooks', '_GlobalConfig', '_JobSchedule', '_Audience']);

// 10 alpha numberic chars + uppercase
const userIdRegex = /^[a-zA-Z0-9]{10}$/;
// Anything that start with role
const roleRegex = /^role:.*/;
// * permission
const publicRegex = /^\*$/

const requireAuthenticationRegex = /^requiresAuthentication$/

const permissionKeyRegex = Object.freeze([userIdRegex, roleRegex, publicRegex, requireAuthenticationRegex]);

function verifyPermissionKey(key) {
  const result = permissionKeyRegex.reduce((isGood, regEx) => {
    isGood = isGood || key.match(regEx) != null;
    return isGood;
  }, false);
  if (!result) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}

const CLPValidKeys = Object.freeze(['find', 'count', 'get', 'create', 'update', 'delete', 'addField', 'readUserFields', 'writeUserFields']);
function validateCLP(perms: ClassLevelPermissions, fields: SchemaFields) {
  if (!perms) {
    return;
  }
  Object.keys(perms).forEach((operation) => {
    if (CLPValidKeys.indexOf(operation) == -1) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `${operation} is not a valid operation for class level permissions`);
    }
    if (!perms[operation]) {
      return;
    }

    if (operation === 'readUserFields' || operation === 'writeUserFields') {
      if (!Array.isArray(perms[operation])) {
        // @flow-disable-next
        throw new Parse.Error(Parse.Error.INVALID_JSON, `'${perms[operation]}' is not a valid value for class level permissions ${operation}`);
      } else {
        perms[operation].forEach((key) => {
          if (!fields[key] || fields[key].type != 'Pointer' || fields[key].targetClass != '_User') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid column for class level pointer permissions ${operation}`);
          }
        });
      }
      return;
    }

    // @flow-disable-next
    Object.keys(perms[operation]).forEach((key) => {
      verifyPermissionKey(key);
      // @flow-disable-next
      const perm = perms[operation][key];
      if (perm !== true) {
        // @flow-disable-next
        throw new Parse.Error(Parse.Error.INVALID_JSON, `'${perm}' is not a valid value for class level permissions ${operation}:${key}:${perm}`);
      }
    });
  });
}
const joinClassRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
const classAndFieldRegex = /^[A-Za-z][A-Za-z0-9_]*$/;
function classNameIsValid(className: string): boolean {
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
function fieldNameIsValid(fieldName: string): boolean {
  return classAndFieldRegex.test(fieldName);
}

// Checks that it's not trying to clobber one of the default fields of the class.
function fieldNameIsValidForClass(fieldName: string, className: string): boolean {
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

function invalidClassNameMessage(className: string): string {
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
  'Bytes',
  'Polygon'
];
// Returns an error suitable for throwing if the type is invalid
const fieldTypeIsInvalid = ({ type, targetClass }) => {
  if (['Pointer', 'Relation'].indexOf(type) >= 0) {
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
  if (validNonRelationOrPointerTypes.indexOf(type) < 0) {
    return new Parse.Error(Parse.Error.INCORRECT_TYPE, `invalid field type: ${type}`);
  }
  return undefined;
}

const convertSchemaToAdapterSchema = (schema: any) => {
  schema = injectDefaultSchema(schema);
  delete schema.fields.ACL;
  schema.fields._rperm = { type: 'Array' };
  schema.fields._wperm = { type: 'Array' };

  if (schema.className === '_User') {
    delete schema.fields.password;
    schema.fields._hashed_password = { type: 'String' };
  }

  return schema;
}

const convertAdapterSchemaToParseSchema = ({...schema}) => {
  delete schema.fields._rperm;
  delete schema.fields._wperm;

  schema.fields.ACL = { type: 'ACL' };

  if (schema.className === '_User') {
    delete schema.fields.authData; //Auth data is implicit
    delete schema.fields._hashed_password;
    schema.fields.password = { type: 'String' };
  }

  if (schema.indexes && Object.keys(schema.indexes).length === 0) {
    delete schema.indexes;
  }

  return schema;
}

const injectDefaultSchema = ({className, fields, classLevelPermissions, indexes}: Schema) => {
  const defaultSchema: Schema = {
    className,
    fields: {
      ...defaultColumns._Default,
      ...(defaultColumns[className] || {}),
      ...fields,
    },
    classLevelPermissions,
  };
  if (indexes && Object.keys(indexes).length !== 0) {
    defaultSchema.indexes = indexes;
  }
  return defaultSchema;
};

const _HooksSchema =  {className: "_Hooks", fields: defaultColumns._Hooks};
const _GlobalConfigSchema = { className: "_GlobalConfig", fields: defaultColumns._GlobalConfig }
const _PushStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: "_PushStatus",
  fields: {},
  classLevelPermissions: {}
}));
const _JobStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: "_JobStatus",
  fields: {},
  classLevelPermissions: {}
}));
const _JobScheduleSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: "_JobSchedule",
  fields: {},
  classLevelPermissions: {}
}));
const _AudienceSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: "_Audience",
  fields: defaultColumns._Audience,
  classLevelPermissions: {}
}));
const VolatileClassesSchemas = [_HooksSchema, _JobStatusSchema, _JobScheduleSchema, _PushStatusSchema, _GlobalConfigSchema, _AudienceSchema];

const dbTypeMatchesObjectType = (dbType: SchemaField | string, objectType: SchemaField) => {
  if (dbType.type !== objectType.type) return false;
  if (dbType.targetClass !== objectType.targetClass) return false;
  if (dbType === objectType.type) return true;
  if (dbType.type === objectType.type) return true;
  return false;
}

const typeToString = (type: SchemaField | string): string => {
  if (typeof type === 'string') {
    return type;
  }
  if (type.targetClass) {
    return `${type.type}<${type.targetClass}>`;
  }
  return `${type.type}`;
}

// Stores the entire schema of the app in a weird hybrid format somewhere between
// the mongo format and the Parse format. Soon, this will all be Parse format.
export default class SchemaController {
  _dbAdapter: StorageAdapter;
  data: any;
  perms: any;
  indexes: any;
  _cache: any;
  reloadDataPromise: Promise<any>;

  constructor(databaseAdapter: StorageAdapter, schemaCache: any) {
    this._dbAdapter = databaseAdapter;
    this._cache = schemaCache;
    // this.data[className][fieldName] tells you the type of that field, in mongo format
    this.data = {};
    // this.perms[className][operation] tells you the acl-style permissions
    this.perms = {};
    // this.indexes[className][operation] tells you the indexes
    this.indexes = {};
  }

  reloadData(options: LoadSchemaOptions = {clearCache: false}): Promise<any> {
    let promise = Promise.resolve();
    if (options.clearCache) {
      promise = promise.then(() => {
        return this._cache.clear();
      });
    }
    if (this.reloadDataPromise && !options.clearCache) {
      return this.reloadDataPromise;
    }
    this.reloadDataPromise = promise.then(() => {
      return this.getAllClasses(options).then((allSchemas) => {
        const data = {};
        const perms = {};
        const indexes = {};
        allSchemas.forEach(schema => {
          data[schema.className] = injectDefaultSchema(schema).fields;
          perms[schema.className] = schema.classLevelPermissions;
          indexes[schema.className] = schema.indexes;
        });

        // Inject the in-memory classes
        volatileClasses.forEach(className => {
          const schema = injectDefaultSchema({ className, fields: {}, classLevelPermissions: {} });
          data[className] = schema.fields;
          perms[className] = schema.classLevelPermissions;
          indexes[className] = schema.indexes;
        });
        this.data = data;
        this.perms = perms;
        this.indexes = indexes;
        delete this.reloadDataPromise;
      }, (err) => {
        this.data = {};
        this.perms = {};
        this.indexes = {};
        delete this.reloadDataPromise;
        throw err;
      })
    }).then(() => {});
    return this.reloadDataPromise;
  }

  getAllClasses(options: LoadSchemaOptions = {clearCache: false}): Promise<Array<Schema>> {
    let promise = Promise.resolve();
    if (options.clearCache) {
      promise = this._cache.clear();
    }
    return promise.then(() => {
      return this._cache.getAllClasses()
    }).then((allClasses) => {
      if (allClasses && allClasses.length && !options.clearCache) {
        return Promise.resolve(allClasses);
      }
      return this._dbAdapter.getAllClasses()
        .then(allSchemas => allSchemas.map(injectDefaultSchema))
        .then(allSchemas => {
          return this._cache.setAllClasses(allSchemas).then(() => {
            return allSchemas;
          });
        })
    });
  }

  getOneSchema(className: string, allowVolatileClasses: boolean = false, options: LoadSchemaOptions = {clearCache: false}): Promise<Schema> {
    let promise = Promise.resolve();
    if (options.clearCache) {
      promise = this._cache.clear();
    }
    return promise.then(() => {
      if (allowVolatileClasses && volatileClasses.indexOf(className) > -1) {
        return Promise.resolve({
          className,
          fields: this.data[className],
          classLevelPermissions: this.perms[className],
          indexes: this.indexes[className]
        });
      }
      return this._cache.getOneSchema(className).then((cached) => {
        if (cached && !options.clearCache) {
          return Promise.resolve(cached);
        }
        return this._dbAdapter.getClass(className)
          .then(injectDefaultSchema)
          .then((result) => {
            return this._cache.setOneSchema(className, result).then(() => {
              return result;
            })
          });
      });
    });
  }

  // Create a new class that includes the three default fields.
  // ACL is an implicit column that does not get an entry in the
  // _SCHEMAS database. Returns a promise that resolves with the
  // created schema, in mongo format.
  // on success, and rejects with an error on fail. Ensure you
  // have authorization (master key, or client class creation
  // enabled) before calling this function.
  addClassIfNotExists(className: string, fields: SchemaFields = {}, classLevelPermissions: any, indexes: any = {}): Promise<void> {
    var validationError = this.validateNewClass(className, fields, classLevelPermissions);
    if (validationError) {
      return Promise.reject(validationError);
    }

    return this._dbAdapter.createClass(className, convertSchemaToAdapterSchema({ fields, classLevelPermissions, indexes, className }))
      .then(convertAdapterSchemaToParseSchema)
      .then((res) => {
        return this._cache.clear().then(() => {
          return Promise.resolve(res);
        });
      })
      .catch(error => {
        if (error && error.code === Parse.Error.DUPLICATE_VALUE) {
          throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
        } else {
          throw error;
        }
      });
  }

  updateClass(className: string, submittedFields: SchemaFields, classLevelPermissions: any, indexes: any, database: DatabaseController) {
    return this.getOneSchema(className)
      .then(schema => {
        const existingFields = schema.fields;
        Object.keys(submittedFields).forEach(name => {
          const field = submittedFields[name];
          if (existingFields[name] && field.__op !== 'Delete') {
            throw new Parse.Error(255, `Field ${name} exists, cannot update.`);
          }
          if (!existingFields[name] && field.__op === 'Delete') {
            throw new Parse.Error(255, `Field ${name} does not exist, cannot delete.`);
          }
        });

        delete existingFields._rperm;
        delete existingFields._wperm;
        const newSchema = buildMergedSchemaObject(existingFields, submittedFields);
        const validationError = this.validateSchemaData(className, newSchema, classLevelPermissions, Object.keys(existingFields));
        if (validationError) {
          throw new Parse.Error(validationError.code, validationError.error);
        }

        // Finally we have checked to make sure the request is valid and we can start deleting fields.
        // Do all deletions first, then a single save to _SCHEMA collection to handle all additions.
        const deletedFields: string[] = [];
        const insertedFields = [];
        Object.keys(submittedFields).forEach(fieldName => {
          if (submittedFields[fieldName].__op === 'Delete') {
            deletedFields.push(fieldName);
          } else {
            insertedFields.push(fieldName);
          }
        });

        let deletePromise = Promise.resolve();
        if (deletedFields.length > 0) {
          deletePromise = this.deleteFields(deletedFields, className, database);
        }
        return deletePromise // Delete Everything
          .then(() => this.reloadData({ clearCache: true })) // Reload our Schema, so we have all the new values
          .then(() => {
            const promises = insertedFields.map(fieldName => {
              const type = submittedFields[fieldName];
              return this.enforceFieldExists(className, fieldName, type);
            });
            return Promise.all(promises);
          })
          .then(() => this.setPermissions(className, classLevelPermissions, newSchema))
          .then(() => this._dbAdapter.setIndexesWithSchemaFormat(className, indexes, schema.indexes, newSchema))
          .then(() => this.reloadData({ clearCache: true }))
        //TODO: Move this logic into the database adapter
          .then(() => {
            const reloadedSchema: Schema = {
              className: className,
              fields: this.data[className],
              classLevelPermissions: this.perms[className],
            };
            if (this.indexes[className] && Object.keys(this.indexes[className]).length !== 0) {
              reloadedSchema.indexes = this.indexes[className];
            }
            return reloadedSchema;
          });
      })
      .catch(error => {
        if (error === undefined) {
          throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
        } else {
          throw error;
        }
      })
  }

  // Returns a promise that resolves successfully to the new schema
  // object or fails with a reason.
  enforceClassExists(className: string): Promise<SchemaController> {
    if (this.data[className]) {
      return Promise.resolve(this);
    }
    // We don't have this class. Update the schema
    return this.addClassIfNotExists(className)
    // The schema update succeeded. Reload the schema
      .then(() => this.reloadData({ clearCache: true }))
      .catch(() => {
      // The schema update failed. This can be okay - it might
      // have failed because there's a race condition and a different
      // client is making the exact same schema update that we want.
      // So just reload the schema.
        return this.reloadData({ clearCache: true });
      })
      .then(() => {
      // Ensure that the schema now validates
        if (this.data[className]) {
          return this;
        } else {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `Failed to add ${className}`);
        }
      })
      .catch(() => {
      // The schema still doesn't validate. Give up
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'schema class name does not revalidate');
      });
  }

  validateNewClass(className: string, fields: SchemaFields = {}, classLevelPermissions: any): any {
    if (this.data[className]) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
    }
    if (!classNameIsValid(className)) {
      return {
        code: Parse.Error.INVALID_CLASS_NAME,
        error: invalidClassNameMessage(className),
      };
    }
    return this.validateSchemaData(className, fields, classLevelPermissions, []);
  }

  validateSchemaData(className: string, fields: SchemaFields, classLevelPermissions: ClassLevelPermissions, existingFieldNames: Array<string>) {
    for (const fieldName in fields) {
      if (existingFieldNames.indexOf(fieldName) < 0) {
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
    }

    for (const fieldName in defaultColumns[className]) {
      fields[fieldName] = defaultColumns[className][fieldName];
    }

    const geoPoints = Object.keys(fields).filter(key => fields[key] && fields[key].type === 'GeoPoint');
    if (geoPoints.length > 1) {
      return {
        code: Parse.Error.INCORRECT_TYPE,
        error: 'currently, only one GeoPoint field may exist in an object. Adding ' + geoPoints[1] + ' when ' + geoPoints[0] + ' already exists.',
      };
    }
    validateCLP(classLevelPermissions, fields);
  }

  // Sets the Class-level permissions for a given className, which must exist.
  setPermissions(className: string, perms: any, newSchema: SchemaFields) {
    if (typeof perms === 'undefined') {
      return Promise.resolve();
    }
    validateCLP(perms, newSchema);
    return this._dbAdapter.setClassLevelPermissions(className, perms);
  }

  // Returns a promise that resolves successfully to the new schema
  // object if the provided className-fieldName-type tuple is valid.
  // The className must already be validated.
  // If 'freeze' is true, refuse to update the schema for this field.
  enforceFieldExists(className: string, fieldName: string, type: string | SchemaField) {
    if (fieldName.indexOf(".") > 0) {
      // subdocument key (x.y) => ok if x is of type 'object'
      fieldName = fieldName.split(".")[ 0 ];
      type = 'Object';
    }
    if (!fieldNameIsValid(fieldName)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
    }

    // If someone tries to create a new field with null/undefined as the value, return;
    if (!type) {
      return Promise.resolve(this);
    }

    return this.reloadData().then(() => {
      const expectedType = this.getExpectedType(className, fieldName);
      if (typeof type === 'string') {
        type = { type };
      }

      if (expectedType) {
        if (!dbTypeMatchesObjectType(expectedType, type)) {
          throw new Parse.Error(
            Parse.Error.INCORRECT_TYPE,
            `schema mismatch for ${className}.${fieldName}; expected ${typeToString(expectedType)} but got ${typeToString(type)}`
          );
        }
        return this;
      }

      return this._dbAdapter.addFieldIfNotExists(className, fieldName, type).then(() => {
        // The update succeeded. Reload the schema
        return this.reloadData({ clearCache: true });
      }, (error) => {
        if (error.code == Parse.Error.INCORRECT_TYPE) {
          // Make sure that we throw errors when it is appropriate to do so.
          throw error;
        }
        // The update failed. This can be okay - it might have been a race
        // condition where another client updated the schema in the same
        // way that we wanted to. So, just reload the schema
        return this.reloadData({ clearCache: true });
      }).then(() => {
        // Ensure that the schema now validates
        const expectedType = this.getExpectedType(className, fieldName);
        if (typeof type === 'string') {
          type = { type };
        }
        if (!expectedType || !dbTypeMatchesObjectType(expectedType, type)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `Could not add field ${fieldName}`);
        }
        // Remove the cached schema
        this._cache.clear();
        return this;
      });
    });
  }

  // maintain compatibility
  deleteField(fieldName: string, className: string, database: DatabaseController) {
    return this.deleteFields([fieldName], className, database);
  }

  // Delete fields, and remove that data from all objects. This is intended
  // to remove unused fields, if other writers are writing objects that include
  // this field, the field may reappear. Returns a Promise that resolves with
  // no object on success, or rejects with { code, error } on failure.
  // Passing the database and prefix is necessary in order to drop relation collections
  // and remove fields from objects. Ideally the database would belong to
  // a database adapter and this function would close over it or access it via member.
  deleteFields(fieldNames: Array<string>, className: string, database: DatabaseController) {
    if (!classNameIsValid(className)) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(className));
    }

    fieldNames.forEach(fieldName => {
      if (!fieldNameIsValid(fieldName)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `invalid field name: ${fieldName}`);
      }
      //Don't allow deleting the default fields.
      if (!fieldNameIsValidForClass(fieldName, className)) {
        throw new Parse.Error(136, `field ${fieldName} cannot be changed`);
      }
    });

    return this.getOneSchema(className, false, {clearCache: true})
      .catch(error => {
        if (error === undefined) {
          throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
        } else {
          throw error;
        }
      })
      .then(schema => {
        fieldNames.forEach(fieldName => {
          if (!schema.fields[fieldName]) {
            throw new Parse.Error(255, `Field ${fieldName} does not exist, cannot delete.`);
          }
        });

        const schemaFields = { ...schema.fields };
        return database.adapter.deleteFields(className, schema, fieldNames)
          .then(() => {
            return Promise.all(fieldNames.map(fieldName => {
              const field = schemaFields[fieldName];
              if (field && field.type === 'Relation') {
              //For relations, drop the _Join table
                return database.adapter.deleteClass(`_Join:${fieldName}:${className}`);
              }
              return Promise.resolve();
            }));
          });
      }).then(() => {
        this._cache.clear();
      });
  }

  // Validates an object provided in REST format.
  // Returns a promise that resolves to the new schema if this object is
  // valid.
  validateObject(className: string, object: any, query: any) {
    let geocount = 0;
    let promise = this.enforceClassExists(className);
    for (const fieldName in object) {
      if (object[fieldName] === undefined) {
        continue;
      }
      const expected = getType(object[fieldName]);
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

      promise = promise.then(schema => schema.enforceFieldExists(className, fieldName, expected));
    }
    promise = thenValidateRequiredColumns(promise, className, object, query);
    return promise;
  }

  // Validates that all the properties are set for the object
  validateRequiredColumns(className: string, object: any, query: any) {
    const columns = requiredColumns[className];
    if (!columns || columns.length == 0) {
      return Promise.resolve(this);
    }

    const missingColumns = columns.filter(function(column){
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
        missingColumns[0] + ' is required.');
    }
    return Promise.resolve(this);
  }

  // Validates the base CLP for an operation
  testBaseCLP(className: string, aclGroup: string[], operation: string) {
    if (!this.perms[className] || !this.perms[className][operation]) {
      return true;
    }
    const classPerms = this.perms[className];
    const perms = classPerms[operation];
    // Handle the public scenario quickly
    if (perms['*']) {
      return true;
    }
    // Check permissions against the aclGroup provided (array of userId/roles)
    if (aclGroup.some(acl => { return perms[acl] === true })) {
      return true;
    }
    return false;
  }

  // Validates an operation passes class-level-permissions set in the schema
  validatePermission(className: string, aclGroup: string[], operation: string) {

    if (this.testBaseCLP(className, aclGroup, operation)) {
      return Promise.resolve();
    }

    if (!this.perms[className] || !this.perms[className][operation]) {
      return true;
    }
    const classPerms = this.perms[className];
    const perms = classPerms[operation];

    // If only for authenticated users
    // make sure we have an aclGroup
    if (perms['requiresAuthentication']) {
      // If aclGroup has * (public)
      if (!aclGroup || aclGroup.length == 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND,
          'Permission denied, user needs to be authenticated.');
      } else if (aclGroup.indexOf('*') > -1 && aclGroup.length == 1) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND,
          'Permission denied, user needs to be authenticated.');
      }
      // requiresAuthentication passed, just move forward
      // probably would be wise at some point to rename to 'authenticatedUser'
      return Promise.resolve();
    }

    // No matching CLP, let's check the Pointer permissions
    // And handle those later
    const permissionField = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';

    // Reject create when write lockdown
    if (permissionField == 'writeUserFields' && operation == 'create') {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN,
        `Permission denied for action ${operation} on class ${className}.`);
    }

    // Process the readUserFields later
    if (Array.isArray(classPerms[permissionField]) && classPerms[permissionField].length > 0) {
      return Promise.resolve();
    }
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN,
      `Permission denied for action ${operation} on class ${className}.`);
  }

  // Returns the expected type for a className+key combination
  // or undefined if the schema is not set
  getExpectedType(className: string, fieldName: string): ?(SchemaField | string) {
    if (this.data && this.data[className]) {
      const expectedType = this.data[className][fieldName]
      return expectedType === 'map' ? 'Object' : expectedType;
    }
    return undefined;
  }

  // Checks if a given class is in the schema.
  hasClass(className: string) {
    return this.reloadData().then(() => !!(this.data[className]));
  }
}

// Returns a promise for a new Schema.
const load = (dbAdapter: StorageAdapter, schemaCache: any, options: any): Promise<SchemaController> => {
  const schema = new SchemaController(dbAdapter, schemaCache);
  return schema.reloadData(options).then(() => schema);
}

// Builds a new schema (in schema API response format) out of an
// existing mongo schema + a schemas API put request. This response
// does not include the default fields, as it is intended to be passed
// to mongoSchemaFromFieldsAndClassName. No validation is done here, it
// is done in mongoSchemaFromFieldsAndClassName.
function buildMergedSchemaObject(existingFields: SchemaFields, putRequest: any): SchemaFields {
  const newSchema = {};
  // @flow-disable-next
  const sysSchemaField = Object.keys(defaultColumns).indexOf(existingFields._id) === -1 ? [] : Object.keys(defaultColumns[existingFields._id]);
  for (const oldField in existingFields) {
    if (oldField !== '_id' && oldField !== 'ACL' &&  oldField !== 'updatedAt' && oldField !== 'createdAt' && oldField !== 'objectId') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(oldField) !== -1) {
        continue;
      }
      const fieldIsDeleted = putRequest[oldField] && putRequest[oldField].__op === 'Delete'
      if (!fieldIsDeleted) {
        newSchema[oldField] = existingFields[oldField];
      }
    }
  }
  for (const newField in putRequest) {
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
function getType(obj: any): ?(SchemaField | string) {
  const type = typeof obj;
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
function getObjectType(obj): ?(SchemaField | string) {
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
      break;
    case 'Relation' :
      if(obj.className) {
        return {
          type: 'Relation',
          targetClass: obj.className
        }
      }
      break;
    case 'File' :
      if(obj.name) {
        return 'File';
      }
      break;
    case 'Date' :
      if(obj.iso) {
        return 'Date';
      }
      break;
    case 'GeoPoint' :
      if(obj.latitude != null && obj.longitude != null) {
        return 'GeoPoint';
      }
      break;
    case 'Bytes' :
      if(obj.base64) {
        return 'Bytes';
      }
      break;
    case 'Polygon' :
      if(obj.coordinates) {
        return 'Polygon';
      }
      break;
    }
    throw new Parse.Error(Parse.Error.INCORRECT_TYPE, "This is not a valid " + obj.__type);
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
  fieldNameIsValid,
  invalidClassNameMessage,
  buildMergedSchemaObject,
  systemClasses,
  defaultColumns,
  convertSchemaToAdapterSchema,
  VolatileClassesSchemas,
  SchemaController,
};
