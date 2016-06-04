const pgp = require('pg-promise')();

const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';


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
        return;
      } else {
        throw error;
      }
    });
  };

  classExists(name) {
    console.log('classExists(name) {')
    return this.connect().then(() => {
      return this.database.listCollections({ name: this._collectionPrefix + name }).toArray();
    }).then(collections => {
      return collections.length > 0;
    });
  }

  setClassLevelPermissions(className, CLPs) {
    console.log('setClassLevelPermissions(className, CLPs) {')
    return this._schemaCollection()
    .then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: { _metadata: { class_permissions: CLPs } }
    }));
  }

  createClass(className, schema) {
    return this._client.query('CREATE TABLE "GameScore" ()', {})
    .then(() => this._client.query('INSERT INTO "_SCHEMA" VALUES ($<className>, $<schema>, true)', { className, schema }))
  }

  addFieldIfNotExists(className, fieldName, type) {
    // TODO: Doing this in a transaction is probably a good idea.
    return this._client.query('ALTER TABLE "GameScore" ADD COLUMN "score" double precision', { className, fieldName })
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
    console.log('deleteClass(className) {')
    return this._adaptiveCollection(className)
    .then(collection => collection.drop())
    .catch(error => {
      // 'ns not found' means collection was already gone. Ignore deletion attempt.
      if (error.message == 'ns not found') {
        return;
      }
      throw error;
    })
    // We've dropped the collection, now remove the _SCHEMA document
    .then(() => this._schemaCollection())
    .then(schemaCollection => schemaCollection.findAndDeleteSchema(className))
  }

  // Delete all data known to this adatper. Used for testing.
  deleteAllClasses() {
    return this._client.query('SELECT "className" FROM "_SCHEMA"')
    .then(results => {
      const classes = ['_SCHEMA', ...results.map(result => result.className)];
      return Promise.all(classes.map(className => this._client.query('DROP TABLE $<className:name>', { className })));
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
    console.log('deleteFields(className, schema, fieldNames) {')
    const mongoFormatNames = fieldNames.map(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer') {
        return `_p_${fieldName}`
      } else {
        return fieldName;
      }
    });
    const collectionUpdate = { '$unset' : {} };
    mongoFormatNames.forEach(name => {
      collectionUpdate['$unset'][name] = null;
    });

    const schemaUpdate = { '$unset' : {} };
    fieldNames.forEach(name => {
      schemaUpdate['$unset'][name] = null;
    });

    return this._adaptiveCollection(className)
    .then(collection => collection.updateMany({}, collectionUpdate))
    .then(() => this._schemaCollection())
    .then(schemaCollection => schemaCollection.updateSchema(className, schemaUpdate));
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
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
        return result;
      } else {
        throw undefined;
      }
    });
  }

  // TODO: remove the mongo format dependency
  createObject(className, schema, object) {
    return this._client.query('INSERT INTO "GameScore" (score) VALUES ($<score>)', { score: object.score })
    .then(() => ({ ops: [object] }));
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  deleteObjectsByQuery(className, schema, query) {
    console.log('deleteObjectsByQuery(className, schema, query) {')
    return this._adaptiveCollection(className)
    .then(collection => {
      let mongoWhere = transformWhere(className, query, schema);
      return collection.deleteMany(mongoWhere)
    })
    .then(({ result }) => {
      if (result.n === 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
      return Promise.resolve();
    }, error => {
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error');
    });
  }

  // Apply the update to all objects that match the given Parse Query.
  updateObjectsByQuery(className, schema, query, update) {
    console.log('updateObjectsByQuery(className, schema, query, update) {')
    const mongoUpdate = transformUpdate(className, update, schema);
    const mongoWhere = transformWhere(className, query, schema);
    return this._adaptiveCollection(className)
    .then(collection => collection.updateMany(mongoWhere, mongoUpdate));
  }

  // Hopefully we can get rid of this in favor of updateObjectsByQuery.
  findOneAndUpdate(className, schema, query, update) {
    console.log('findOneAndUpdate(className, schema, query, update) {')
    const mongoUpdate = transformUpdate(className, update, schema);
    const mongoWhere = transformWhere(className, query, schema);
    return this._adaptiveCollection(className)
    .then(collection => collection.findOneAndUpdate(mongoWhere, mongoUpdate));
  }

  // Hopefully we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update) {
    console.log('upsertOneObject(className, schema, query, update) {')
    const mongoUpdate = transformUpdate(className, update, schema);
    const mongoWhere = transformWhere(className, query, schema);
    return this._adaptiveCollection(className)
    .then(collection => collection.upsertOne(mongoWhere, mongoUpdate));
  }

  // Executes a find. Accepts: className, query in Parse format, and { skip, limit, sort }.
  find(className, schema, query, { skip, limit, sort }) {
    return this._client.query("SELECT * FROM $<className>", { className })
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  ensureUniqueness(className, schema, fieldNames) {
    console.log('ensureUniqueness(className, schema, fieldNames) {')
    let indexCreationRequest = {};
    let mongoFieldNames = fieldNames.map(fieldName => transformKey(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = 1;
    });
    return this._adaptiveCollection(className)
    .then(collection => collection._ensureSparseUniqueIndexInBackground(indexCreationRequest))
    .catch(error => {
      if (error.code === 11000) {
        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'Tried to ensure field uniqueness for a class that already has duplicates.');
      } else {
        throw error;
      }
    });
  }

  // Executs a count.
  count(className, schema, query) {
    console.log('count(className, schema, query) {')
    return this._adaptiveCollection(className)
    .then(collection => collection.count(transformWhere(className, query, schema)));
  }
}

export default PostgresStorageAdapter;
module.exports = PostgresStorageAdapter; // Required for tests
