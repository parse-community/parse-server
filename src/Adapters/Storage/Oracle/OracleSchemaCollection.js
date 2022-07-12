import marklog from '../../../marklog';
import OracleCollection from './OracleCollection';

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

class OracleSchemaCollection {
  _collection: OracleCollection;

  constructor(collection: OracleCollection) {
    this._collection = collection;
  }

  async _fetchAllSchemasFrom_SCHEMA() {
    let theSchemas;
    await this._collection._rawFind({}).then(schemas => {
      marklog('schemas = ' + JSON.stringify(schemas));
      theSchemas = schemas.map(oracleSchemaToParseSchema);
    });
    return theSchemas;
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
}

OracleSchemaCollection.parseFieldTypeToOracleFieldType = parseFieldTypeToOracleFieldType;

export default OracleSchemaCollection;
