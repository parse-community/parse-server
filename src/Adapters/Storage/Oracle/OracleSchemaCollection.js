import marklog from '../../../marklog';
import OracleCollection from './OracleCollection';
import Parse from 'parse/node';

const emptyCLPS = Object.freeze({
  find: {},
  count: {},
  get: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
  protectedFields: {},
});

const defaultCLPS = Object.freeze({
  find: { '*': true },
  count: { '*': true },
  get: { '*': true },
  create: { '*': true },
  update: { '*': true },
  delete: { '*': true },
  addField: { '*': true },
  protectedFields: { '*': [] },
});

function oracleFieldToParseSchemaField(type) {
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
    case 'number':
      return { type: 'Number' };
    case 'string':
      return { type: 'String' };
    case 'boolean':
      return { type: 'Boolean' };
    case 'date':
      return { type: 'Date' };
    case 'map':
    case 'object':
      return { type: 'Object' };
    case 'array':
      return { type: 'Array' };
    case 'geopoint':
      return { type: 'GeoPoint' };
    case 'file':
      return { type: 'File' };
    case 'bytes':
      return { type: 'Bytes' };
    case 'polygon':
      return { type: 'Polygon' };
  }
}

// Returns a type suitable for inserting into mongo _SCHEMA collection.
// Does no validation. That is expected to be done in Parse Server.
function parseFieldTypeToOracleFieldType({ type, targetClass }) {
  switch (type) {
    case 'Pointer':
      return `*${targetClass}`;
    case 'Relation':
      return `relation<${targetClass}>`;
    case 'Number':
      return 'number';
    case 'String':
      return 'string';
    case 'Boolean':
      return 'boolean';
    case 'Date':
      return 'date';
    case 'Object':
      return 'object';
    case 'Array':
      return 'array';
    case 'GeoPoint':
      return 'geopoint';
    case 'File':
      return 'file';
    case 'Bytes':
      return 'bytes';
    case 'Polygon':
      return 'polygon';
  }
}

const nonFieldSchemaKeys = ['_id', '_metadata', '_client_permissions'];
function oracleSchemaFieldsToParseSchemaFields(schema) {
  var fieldNames = Object.keys(schema).filter(key => nonFieldSchemaKeys.indexOf(key) === -1);
  var response = fieldNames.reduce((obj, fieldName) => {
    obj[fieldName] = oracleFieldToParseSchemaField(schema[fieldName]);
    if (
      schema._metadata &&
      schema._metadata.fields_options &&
      schema._metadata.fields_options[fieldName]
    ) {
      obj[fieldName] = Object.assign(
        {},
        obj[fieldName],
        schema._metadata.fields_options[fieldName]
      );
    }
    return obj;
  }, {});
  response.ACL = { type: 'ACL' };
  response.createdAt = { type: 'Date' };
  response.updatedAt = { type: 'Date' };
  response.objectId = { type: 'String' };
  return response;
}

function oracleSchemaToParseSchema(oracleSchema) {
  let clps = defaultCLPS;
  let indexes = {};
  if (oracleSchema._metadata) {
    if (oracleSchema._metadata.class_permissions) {
      clps = { ...emptyCLPS, ...oracleSchema._metadata.class_permissions };
    }
    if (oracleSchema._metadata.indexes) {
      indexes = { ...oracleSchema._metadata.indexes };
    }
  }
  return {
    className: oracleSchema._id,
    fields: oracleSchemaFieldsToParseSchemaFields(oracleSchema),
    classLevelPermissions: clps,
    indexes: indexes,
  };
}

function _oracleSchemaQueryFromNameQuery(name: string, query) {
  const object = { _id: name };
  if (query) {
    Object.keys(query).forEach(key => {
      object[key] = query[key];
    });
  }
  return object;
}

class OracleSchemaCollection {
  _collection: OracleCollection;

  constructor(collection: OracleCollection) {
    this._collection = collection;
  }

  async _fetchAllSchemasFrom_SCHEMA() {
    let theSchemas;
    await this._collection._rawFind({}).then(schemas => {
      marklog('schemas = ' + JSON.stringify(schemas));
      const contentOfSchemas = schemas.map(i => i.getContent());
      theSchemas = contentOfSchemas.map(oracleSchemaToParseSchema);
    });
    return theSchemas;
  }

  _fetchOneSchemaFrom_SCHEMA(name: string) {
    return this._collection
      ._rawFind(_oracleSchemaQueryFromNameQuery(name), { limit: 1 })
      .then(results => {
        if (results.length === 1) {
          return oracleSchemaToParseSchema(results[0]);
        } else {
          throw undefined;
        }
      });
  }

  insertSchema(schema: any) {
    marklog('entered insertSchema for ' + JSON.stringify(schema));
    return this._collection
      .insertOne(schema)
      .then(() => {
        //marklog("in the then block");
        oracleSchemaToParseSchema(schema);
      })
      .catch(error => {
        marklog('got error ' + error);
        throw error;
      });
  }

  upsertSchema(name: string, query: string, update) {
    marklog('in upsertSchema');
    return this._collection.upsertOne(_oracleSchemaQueryFromNameQuery(name, query), update);
  }

  // Add a field to the schema. If database does not support the field
  // type (e.g. mongo doesn't support more than one GeoPoint in a class) reject with an "Incorrect Type"
  // Parse error with a desciptive message. If the field already exists, this function must
  // not modify the schema, and must reject with DUPLICATE_VALUE error.
  // If this is called for a class that doesn't exist, this function must create that class.

  // TODO: throw an error if an unsupported field type is passed. Deciding whether a type is supported
  // should be the job of the adapter. Some adapters may not support GeoPoint at all. Others may
  // Support additional types that Mongo doesn't, like Money, or something.

  // TODO: don't spend an extra query on finding the schema if the type we are trying to add isn't a GeoPoint.
  addFieldIfNotExists(className: string, fieldName: string, fieldType: string) {
    marklog('entered addFieldIfNotExists');
    return this._fetchOneSchemaFrom_SCHEMA(className)
      .then(
        schema => {
          marklog('in the then block');
          // If a field with this name already exists, it will be handled elsewhere.
          if (schema.fields[fieldName] !== undefined) {
            return;
          }
          // The schema exists. Check for existing GeoPoints.
          if (fieldType.type === 'GeoPoint') {
            // Make sure there are not other geopoint fields
            if (
              Object.keys(schema.fields).some(
                existingField => schema.fields[existingField].type === 'GeoPoint'
              )
            ) {
              throw new Parse.Error(
                Parse.Error.INCORRECT_TYPE,
                'Parse only supports one GeoPoint field in a class.'
              );
            }
          }
          return;
        },
        error => {
          marklog('in the error block');
          // If error is undefined, the schema doesn't exist, and we can create the schema with the field.
          // If some other error, reject with it.
          if (error === undefined) {
            return;
          }
          throw error;
        }
      )
      .then(() => {
        marklog('in the second then block');
        const { type, targetClass, ...fieldOptions } = fieldType;
        marklog('type = ' + type);
        marklog('targetClass = ' + targetClass);
        marklog('fieldOptions = ' + JSON.stringify(fieldOptions));
        // We use $exists and $set to avoid overwriting the field type if it
        // already exists. (it could have added inbetween the last query and the update)
        //if (fieldOptions && Object.keys(fieldOptions).length > 0) {
        marklog('about to upsert');
        const theFieldType = parseFieldTypeToOracleFieldType({ type, targetClass });
        return this.upsertSchema(
          className,
          { [fieldName]: { $exists: false } },
          { fieldName, theFieldType }
        );
        //}
        //marklog("after the if block")
      });
  }
}

OracleSchemaCollection.parseFieldTypeToOracleFieldType = parseFieldTypeToOracleFieldType;

export default OracleSchemaCollection;
