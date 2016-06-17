const pgp = require('pg-promise')();

const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';
const PostgresDuplicateColumnError = '42701';
const PostgresUniqueIndexViolationError = '23505';

const parseTypeToPostgresType = type => {
  switch (type.type) {
    case 'String': return 'text';
    case 'Date': return 'timestamp';
    case 'Object': return 'jsonb';
    case 'Boolean': return 'boolean';
    case 'Pointer': return 'char(10)';
    case 'Number': return 'double precision';
    case 'Array':
      if (type.contents && type.contents.type === 'String') {
        return 'text[]';
      } else {
        throw `no type for ${JSON.stringify(type)} yet`;
      }
    default: throw `no type for ${JSON.stringify(type)} yet`;
  }
};

const buildWhereClause = ({ schema, query, index }) => {
  let patterns = [];
  let values = [];
  for (let fieldName in query) {
    let fieldValue = query[fieldName];
    if (typeof fieldValue === 'string') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (fieldValue.$ne) {
      patterns.push(`$${index}:name <> $${index + 1}`);
      values.push(fieldName, fieldValue.$ne);
      index += 2;
    } else if (fieldName === '$or') {
      fieldValue.map(subQuery => buildWhereClause({ schema, query: subQuery, index })).forEach(result => {
        patterns.push(result.pattern);
        values.push(...result.values);
      });
    } else if (Array.isArray(fieldValue.$in) && schema.fields[fieldName].type === 'Array') {
      let inPatterns = [];
      let allowNull = false;
      values.push(fieldName);
      fieldValue.$in.forEach((listElem, listIndex) => {
        if (listElem === null ) {
          allowNull = true;
        } else {
          values.push(listElem);
          inPatterns.push(`$${index + 1 + listIndex - (allowNull ? 1 : 0)}`);
        }
      });
      if (allowNull) {
        patterns.push(`($${index}:name IS NULL OR $${index}:name && ARRAY[${inPatterns.join(',')}])`);
      } else {
        patterns.push(`$${index}:name && ARRAY[${inPatterns.join(',')}]`);
      }
      index = index + 1 + inPatterns.length;
    } else if (Array.isArray(fieldValue.$in) && schema.fields[fieldName].type === 'String') {
      let inPatterns = [];
      values.push(fieldName);
      fieldValue.$in.forEach((listElem, listIndex) => {
        values.push(listElem);
        inPatterns.push(`$${index + 1 + listIndex}`);
      });
      patterns.push(`$${index}:name IN (${inPatterns.join(',')})`);
      index = index + 1 + inPatterns.length;
    } else if (fieldValue.__type === 'Pointer') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue.objectId);
      index += 2;
    } else {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Postgres doesn't support this query type yet`);
    }
  }
  return { pattern: patterns.join(' AND '), values };
}

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
    return Promise.reject('Not implemented yet.')
  }

  setClassLevelPermissions(className, CLPs) {
    return Promise.reject('Not implemented yet.')
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
    return this._ensureSchemaCollectionExists()
    .then(() => this._client.query(`CREATE TABLE $1:name (${patternsArray.join(',')})`, [className, ...valuesArray]))
    .catch(error => {
      if (error.code === PostgresDuplicateRelationError) {
        // Table already exists, must have been created by a different request. Ignore error.
      } else {
        throw error;
      }
    })
    .then(() => this._client.query('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', { className, schema }))
  }

  addFieldIfNotExists(className, fieldName, type) {
    // TODO: Must be re-done into a transaction!
    return this._client.query('ALTER TABLE $<className:name> ADD COLUMN $<fieldName:name> $<postgresType:raw>', { className, fieldName, postgresType: parseTypeToPostgresType(type) })
    .catch(error => {
      if (error.code === PostgresRelationDoesNotExistError) {
        return this.createClass(className, { fields: { [fieldName]: type } })
      } else if (error.code === PostgresDuplicateColumnError) {
        // Column already exists, created by other request. Carry on to
        // See if it's the right type.
      } else {
        throw error;
      }
    })
    .then(() => this._client.query('SELECT "schema" FROM "_SCHEMA" WHERE "className" = $<className>', { className }))
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
    return Promise.reject('Not implemented yet.')
  }

  // Delete all data known to this adapter. Used for testing.
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

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  deleteFields(className, schema, fieldNames) {
    return Promise.reject('Not implemented yet.')
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  getAllClasses() {
    return this._ensureSchemaCollectionExists()
    .then(() => this._client.map('SELECT * FROM "_SCHEMA"'), null, row => ({ className: row.className, ...row.schema }));
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  getClass(className) {
    return this._client.query('SELECT * FROM "_SCHEMA" WHERE "className"=$<className>', { className })
    .then(result => {
      if (result.length === 1) {
        return result[0].schema;
      } else {
        throw undefined;
      }
    });
  }

  // TODO: remove the mongo format dependency in the return value
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
    let valuesPattern = valuesArray.map((val, index) => `$${index + 2 + columnsArray.length}${(['_rperm','_wperm'].includes(columnsArray[index])) ? '::text[]' : ''}`).join(',');
    let qs = `INSERT INTO $1:name (${columnsPattern}) VALUES (${valuesPattern})`
    let values = [className, ...columnsArray, ...valuesArray]
    return this._client.query(qs, values)
    .then(() => ({ ops: [object] }))
    .catch(error => {
      if (error.code === PostgresUniqueIndexViolationError) {
        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    })
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
    return Promise.reject('Not implemented yet.')
  }

  // Return value not currently well specified.
  findOneAndUpdate(className, schema, query, update) {
    let conditionPatterns = [];
    let updatePatterns = [];
    let values = [className]
    let index = 2;

    for (let fieldName in update) {
      let fieldValue = update[fieldName];
      if (fieldValue.__op === 'Increment') {
        updatePatterns.push(`$${index}:name = COALESCE($${index}:name, 0) + $${index + 1}`);
        values.push(fieldName, fieldValue.amount);
        index += 2;
      } else if (fieldName === 'updatedAt') { //TODO: stop special casing this. It should check for __type === 'Date' and use .iso
        updatePatterns.push(`$${index}:name = $${index + 1}`)
        values.push(fieldName, new Date(fieldValue));
        index += 2;
      } else {
        return Promise.reject(new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Postgres doesn't support this type of update yet`));
      }
    }

    let where = buildWhereClause({ schema, index, query })
    values.push(...where.values);

    let qs = `UPDATE $1:name SET ${updatePatterns.join(',')} WHERE ${where.pattern} RETURNING *`;
    return this._client.query(qs, values)
    .then(val => val[0]); // TODO: This is unsafe, verification is needed, or a different query method;
  }

  // Hopefully, we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update) {
    return Promise.reject('Not implemented yet.')
  }

  find(className, schema, query, { skip, limit, sort }) {
    let values = [className];
    let where = buildWhereClause({ schema, query, index: 2 })
    values.push(...where.values);

    const qs = `SELECT * FROM $1:name WHERE ${where.pattern} ${limit !== undefined ? `LIMIT $${values.length + 1}` : ''}`;
    if (limit !== undefined) {
      values.push(limit);
    }
    return this._client.query(qs, values)
    .then(results => results.map(object => {
      Object.keys(schema.fields).filter(field => schema.fields[field].type === 'Pointer').forEach(fieldName => {
        object[fieldName] = { objectId: object[fieldName], __type: 'Pointer', className: schema.fields[fieldName].targetClass };
      });
      //TODO: remove this reliance on the mongo format. DB adapter shouldn't know there is a difference between created at and any other date field.
      if (object.createdAt) {
        object.createdAt = object.createdAt.toISOString();
      }
      if (object.updatedAt) {
        object.updatedAt = object.updatedAt.toISOString();
      }
      if (object.expiresAt) {
        object.expiresAt = { __type: 'Date', iso: object.expiresAt.toISOString() };
      }

      for (let fieldName in object) {
        if (object[fieldName] === null) {
          delete object[fieldName];
        }
      }

      return object;
    }))
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  ensureUniqueness(className, schema, fieldNames) {
    // Use the same name for every ensureUniqueness attempt, because postgres
    // Will happily create the same index with multiple names.
    const constraintName = `unique_${fieldNames.sort().join('_')}`;
    const constraintPatterns = fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `ALTER TABLE $1:name ADD CONSTRAINT $2:name UNIQUE (${constraintPatterns.join(',')})`;
    return this._client.query(qs,[className, constraintName, ...fieldNames])
  }

  // Executes a count.
  count(className, schema, query) {
    return Promise.reject('Not implemented yet.')
  }
}

export default PostgresStorageAdapter;
module.exports = PostgresStorageAdapter; // Required for tests
