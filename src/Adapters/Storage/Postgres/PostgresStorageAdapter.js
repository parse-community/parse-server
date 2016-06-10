const pgp = require('pg-promise')();

const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';

const parseTypeToPostgresType = type => {
  switch (type.type) {
    case 'String': return 'text';
    case 'Date': return 'timestamp';
    case 'Object': return 'jsonb';
    case 'Boolean': return 'boolean';
    case 'Pointer': return 'char(10)';
    case 'Array':
      if (type.contents && type.contents.type === 'String') {
        return 'text[]';
      } else {
        throw `no type for ${JSON.stringify(type)} yet`;
      }
    default: throw `no type for ${JSON.stringify(type)} yet`;
  }
};

export class PostgresStorageAdapter {
  // Private
  _collectionPrefix: string;
  _client;

  constructor({
    uri,
    collectionPrefix = '',
  }) {
    this._collectionPrefix = collectionPrefix;
    this._client = pgp(uri);
  }

  _ensureSchemaCollectionExists() {
    return this._client.query('CREATE TABLE "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )')
    .catch(error => {
      if (error.code === PostgresDuplicateRelationError) {
        // Table already exists, must have been created by a different request. Ignore error.
      } else {
        throw error;
      }
    });
  };

  classExists(name) {
    return Promise.reject('Not implented yet.')
  }

  setClassLevelPermissions(className, CLPs) {
    return Promise.reject('Not implented yet.')
  }

  createClass(className, schema) {
    let valuesArray = [];
    let patternsArray = [];
    Object.keys(schema.fields).forEach((fieldName, index) => {
      valuesArray.push(fieldName);
      let parseType = schema.fields[fieldName];
      if (['_rperm', '_wperm'].includes(fieldName)) {
        parseType.contents = { type: 'String' };
      }
      valuesArray.push(parseTypeToPostgresType(parseType));
      patternsArray.push(`$${index * 2 + 2}:name $${index * 2 + 3}:raw`);
    });
    return this._client.query(`CREATE TABLE $1:name (${patternsArray.join(',')})`, [className, ...valuesArray])
    .then(() => this._client.query('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', { className, schema }))
  }

  addFieldIfNotExists(className, fieldName, type) {
    // TODO: Doing this in a transaction is probably a good idea.
    return this._client.query('ALTER TABLE $<className:name> ADD COLUMN $<fieldName:name> text', { className, fieldName })
    .catch(error => {
      if (error.code === PostgresRelationDoesNotExistError) {
        return this.createClass(className, { fields: { [fieldName]: type } })
      } else {
        throw error;
      }
    })
    .then(() => this._client.query('SELECT "schema" FROM "_SCHEMA"', { className }))
    .then(result => {
      if (fieldName in result[0].schema) {
        throw "Attempted to add a field that already exists";
      } else {
        result[0].schema.fields[fieldName] = type;
        return this._client.query(
          'UPDATE "_SCHEMA" SET "schema"=$<schema> WHERE "className"=$<className>',
          { schema: result[0].schema, className }
        );
      }
    })
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  deleteClass(className) {
    return Promise.reject('Not implented yet.')
  }

  // Delete all data known to this adatper. Used for testing.
  deleteAllClasses() {
    return this._client.query('SELECT "className" FROM "_SCHEMA"')
    .then(results => {
      const classes = ['_SCHEMA', ...results.map(result => result.className)];
      return this._client.task(t=>t.batch(classes.map(className=>t.none('DROP TABLE $<className:name>', { className }))));
    }, error => {
      if (error.code === PostgresRelationDoesNotExistError) {
        // No _SCHEMA collection. Don't delete anything.
        return;
      } else {
        throw error;
      }
    })
  }

  // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.

  // Pointer field names are passed for legacy reasons: the original mongo
  // format stored pointer field names differently in the database, and therefore
  // needed to know the type of the field before it could delete it. Future database
  // adatpers should ignore the pointerFieldNames argument. All the field names are in
  // fieldNames, they show up additionally in the pointerFieldNames database for use
  // by the mongo adapter, which deals with the legacy mongo format.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  deleteFields(className, schema, fieldNames) {
    return Promise.reject('Not implented yet.')
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Rquirements for the
  // rejection reason are TBD.
  getAllClasses() {
    return this._ensureSchemaCollectionExists()
    .then(() => this._client.query('SELECT * FROM "_SCHEMA"'))
    .then(results => results.map(result => ({ className: result.className, ...result.schema })))
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  getClass(className) {
    return this._client.query('SELECT * FROM "_SCHEMA" WHERE "className"=$<className>', { className })
    .then(result => {
      if (result.length === 1) {
        return result[0];
      } else {
        throw undefined;
      }
    });
  }

  // TODO: remove the mongo format dependency
  createObject(className, schema, object) {
    let columnsArray = [];
    let valuesArray = [];
    Object.keys(object).forEach(fieldName => {
      columnsArray.push(fieldName);
      switch (schema.fields[fieldName].type) {
        case 'Date':
          valuesArray.push(object[fieldName].iso);
          break;
        case 'Pointer':
          valuesArray.push(object[fieldName].objectId);
          break;
        default:
          valuesArray.push(object[fieldName]);
          break;
      }
    });
    let columnsPattern = columnsArray.map((col, index) => `$${index + 2}:name`).join(',');
    let valuesPattern = valuesArray.map((val, index) => `$${index + 2 + columnsArray.length}`).join(',');
    return this._client.query(`INSERT INTO $1~ (${columnsPattern}) VALUES (${valuesPattern})`, [className, ...columnsArray, ...valuesArray])
    .then(() => ({ ops: [object] }))
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  deleteObjectsByQuery(className, schema, query) {
    return this._client.query(`WITH deleted AS (DELETE FROM $<className:name> RETURNING *) SELECT count(*) FROM deleted`, { className })
    .then(result => {
      if (result[0].count === 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
      } else {
        return result[0].count;
      }
    });
  }

  // Apply the update to all objects that match the given Parse Query.
  updateObjectsByQuery(className, schema, query, update) {
    return Promise.reject('Not implented yet.')
  }

  // Hopefully we can get rid of this in favor of updateObjectsByQuery.
  findOneAndUpdate(className, schema, query, update) {
    return Promise.reject('Not implented yet.')
  }

  // Hopefully we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update) {
    return Promise.reject('Not implented yet.')
  }

  // Executes a find. Accepts: className, query in Parse format, and { skip, limit, sort }.
  find(className, schema, query, { skip, limit, sort }) {
    return this._client.query("SELECT * FROM $<className:name>", { className })
    .then(results => results.map(object => {
      Object.keys(schema.fields).filter(field => schema.fields[field].type === 'Pointer').forEach(fieldName => {
        object[fieldName] = { objectId: object[fieldName], __type: 'Pointer', className: schema.fields[fieldName].targetClass };
      });
      return object;
    }))
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  ensureUniqueness(className, schema, fieldNames) {
    return Promise.resolve('ensureUniqueness not implented yet.')
  }

  // Executs a count.
  count(className, schema, query) {
    return Promise.reject('Not implented yet.')
  }
}

export default PostgresStorageAdapter;
module.exports = PostgresStorageAdapter; // Required for tests
