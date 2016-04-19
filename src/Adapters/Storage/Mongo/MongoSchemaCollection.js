
import MongoCollection from './MongoCollection';
import * as transform  from './MongoTransform';

function mongoFieldToParseSchemaField(type) {
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

const nonFieldSchemaKeys = ['_id', '_metadata', '_client_permissions'];
function mongoSchemaFieldsToParseSchemaFields(schema) {
  var fieldNames = Object.keys(schema).filter(key => nonFieldSchemaKeys.indexOf(key) === -1);
  var response = fieldNames.reduce((obj, fieldName) => {
    obj[fieldName] = mongoFieldToParseSchemaField(schema[fieldName])
    return obj;
  }, {});
  response.ACL = {type: 'ACL'};
  response.createdAt = {type: 'Date'};
  response.updatedAt = {type: 'Date'};
  response.objectId = {type: 'String'};
  return response;
}

const defaultCLPS = Object.freeze({
  find: {'*': true},
  get: {'*': true},
  create: {'*': true},
  update: {'*': true},
  delete: {'*': true},
  addField: {'*': true},
});

function mongoSchemaToParseSchema(mongoSchema) {
  let clpsFromMongoObject = {};
  if (mongoSchema._metadata && mongoSchema._metadata.class_permissions) {
    clpsFromMongoObject = mongoSchema._metadata.class_permissions;
  }
  return {
    className: mongoSchema._id,
    fields: mongoSchemaFieldsToParseSchemaFields(mongoSchema),
    classLevelPermissions: {...defaultCLPS, ...clpsFromMongoObject},
  };
}

function _mongoSchemaQueryFromNameQuery(name: string, query) {
  return _mongoSchemaObjectFromNameFields(name, query);
}

function _mongoSchemaObjectFromNameFields(name: string, fields) {
  let object = { _id: name };
  if (fields) {
    Object.keys(fields).forEach(key => {
      object[key] = fields[key];
    });
  }
  return object;
}

// Returns a type suitable for inserting into mongo _SCHEMA collection.
// Does no validation. That is expected to be done in Parse Server.
function parseFieldTypeToMongoFieldType({ type, targetClass }) {
  switch (type) {
    case 'Pointer':  return `*${targetClass}`;
    case 'Relation': return `relation<${targetClass}>`;
    case 'Number':   return 'number';
    case 'String':   return 'string';
    case 'Boolean':  return 'boolean';
    case 'Date':     return 'date';
    case 'Object':   return 'object';
    case 'Array':    return 'array';
    case 'GeoPoint': return 'geopoint';
    case 'File':     return 'file';
  }
}

// Returns { code, error } if invalid, or { result }, an object
// suitable for inserting into _SCHEMA collection, otherwise.
function mongoSchemaFromFieldsAndClassNameAndCLP(fields, className, classLevelPermissions) {

  let mongoObject = {
    _id: className,
    objectId: 'string',
    updatedAt: 'string',
    createdAt: 'string'
  };

  for (let fieldName in fields) {
    mongoObject[fieldName] = parseFieldTypeToMongoFieldType(fields[fieldName]);
  }

  if (typeof classLevelPermissions !== 'undefined') {
    mongoObject._metadata = mongoObject._metadata || {};
    if (!classLevelPermissions) {
      delete mongoObject._metadata.class_permissions;
    } else {
      mongoObject._metadata.class_permissions = classLevelPermissions;
    }
  }

  return mongoObject;
}

class MongoSchemaCollection {
  _collection: MongoCollection;

  constructor(collection: MongoCollection) {
    this._collection = collection;
  }

  _fetchAllSchemasFrom_SCHEMA() {
    return this._collection._rawFind({})
    .then(schemas => schemas.map(mongoSchemaToParseSchema));
  }

  _fechOneSchemaFrom_SCHEMA(name: string) {
    return this._collection._rawFind(_mongoSchemaQueryFromNameQuery(name), { limit: 1 }).then(results => {
      if (results.length === 1) {
        return mongoSchemaToParseSchema(results[0]);
      } else {
        return Promise.reject();
      }
    });
  }

  // Atomically find and delete an object based on query.
  // The result is the promise with an object that was in the database before deleting.
  // Postgres Note: Translates directly to `DELETE * FROM ... RETURNING *`, which will return data after delete is done.
  findAndDeleteSchema(name: string) {
    // arguments: query, sort
    return this._collection._mongoCollection.findAndRemove(_mongoSchemaQueryFromNameQuery(name), []).then(document => {
      // Value is the object where mongo returns multiple fields.
      return document.value;
    });
  }

  // Add a collection. Currently the input is in mongo format, but that will change to Parse format in a
  // later PR. Returns a promise that is expected to resolve with the newly created schema, in Parse format.
  // If the class already exists, returns a promise that rejects with undefined as the reason. If the collection
  // can't be added for a reason other than it already existing, requirements for rejection reason are TBD.
  addSchema(name: string, fields, classLevelPermissions) {
    let mongoSchema = mongoSchemaFromFieldsAndClassNameAndCLP(fields, name, classLevelPermissions);
    let mongoObject = _mongoSchemaObjectFromNameFields(name, mongoSchema);
    return this._collection.insertOne(mongoObject)
    .then(result => mongoSchemaToParseSchema(result.ops[0]))
    .catch(error => {
      if (error.code === 11000) { //Mongo's duplicate key error
        return Promise.reject();
      }
      return Promise.reject(error);
    });
  }

  updateSchema(name: string, update) {
    return this._collection.updateOne(_mongoSchemaQueryFromNameQuery(name), update);
  }

  upsertSchema(name: string, query: string, update) {
    return this._collection.upsertOne(_mongoSchemaQueryFromNameQuery(name, query), update);
  }

  updateField(className: string, fieldName: string, type: string) {
    // We don't have this field. Update the schema.
    // Note that we use the $exists guard and $set to avoid race
    // conditions in the database. This is important!
    let query = {};
    query[fieldName] = { '$exists': false };
    let update = {};
    if (typeof type === 'string') {
      type = {
        type: type
      }
    }
    update[fieldName] = parseFieldTypeToMongoFieldType(type);
    update = {'$set': update};
    return this.upsertSchema(className, query, update);
  }

  get transform() {
    return transform;
  }
}

// Exported for testing reasons and because we haven't moved all mongo schema format
// related logic into the database adapter yet.
MongoSchemaCollection._TESTmongoSchemaToParseSchema = mongoSchemaToParseSchema

export default MongoSchemaCollection
