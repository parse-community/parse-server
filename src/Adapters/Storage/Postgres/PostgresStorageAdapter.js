const pgp = require('pg-promise')();

const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';
const PostgresDuplicateColumnError = '42701';
const PostgresUniqueIndexViolationError = '23505';
const logger = require('../../../logger');

const debug = function(){
  let args = [...arguments];
  args = ['PG: '+arguments[0]].concat(args.slice(1, args.length));
  let log = logger.getLogger();
  log.debug.apply(log, args);
}

const parseTypeToPostgresType = type => {
  switch (type.type) {
    case 'String': return 'text';
    case 'Date': return 'timestamp with time zone';
    case 'Object': return 'jsonb';
    case 'File': return 'jsonb';
    case 'Boolean': return 'boolean';
    case 'Pointer': return 'char(10)';
    case 'Number': return 'double precision';
    case 'GeoPoint': return 'point';
    case 'Array':
      if (type.contents && type.contents.type === 'String') {
        return 'text[]';
      } else {
        return 'jsonb';
      }
    default: throw `no type for ${JSON.stringify(type)} yet`;
  }
};

const ParseToPosgresComparator = {
  '$gt': '>',
  '$lt': '<',
  '$gte': '>=',
  '$lte': '<='
}

const toPostgresValue = value => {
  if (typeof value === 'object') {
    if (value.__type === 'Date') {
      return value.iso;
    }
  }
  return value;
}

const transformValue = value => {
  if (value.__type == 'Pointer') {
    return value.objectId;
  }
  return value;
}

// Duplicate from then mongo adapter...
const emptyCLPS = Object.freeze({
  find: {},
  get: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
});

const defaultCLPS = Object.freeze({
  find: {'*': true},
  get: {'*': true},
  create: {'*': true},
  update: {'*': true},
  delete: {'*': true},
  addField: {'*': true},
});

const toParseSchema = (schema) => {
  if (schema.className === '_User') {
    delete schema.fields._hashed_password;
  }
  if (schema.fields) {
    delete schema.fields._wperm;
    delete schema.fields._rperm;
  }
  let clps = defaultCLPS;
  if (schema.classLevelPermissions) {
    clps = {...emptyCLPS, ...schema.classLevelPermissions};
  }
  return {
    className: schema.className,
    fields: schema.fields,
    classLevelPermissions: clps,
  };
}

const toPostgresSchema = (schema) => {
  if (!schema) {
    return schema;
  }
  schema.fields = schema.fields || {};
  schema.fields._wperm = {type: 'Array', contents: {type: 'String'}}
  schema.fields._rperm = {type: 'Array', contents: {type: 'String'}}
  if (schema.className === '_User') {
    schema.fields._hashed_password = {type: 'String'};
  }
  return schema;
}

const buildWhereClause = ({ schema, query, index }) => {
  let patterns = [];
  let values = [];
  let sorts = [];

  schema = toPostgresSchema(schema);
  for (let fieldName in query) {
    let initialPatternsLength = patterns.length;
    let fieldValue = query[fieldName];
    if (fieldName.indexOf('.') >= 0) {
      let components = fieldName.split('.').map((cmpt, index) => {
        if (index == 0) {
          return `"${cmpt}"`;
        }
        return `'${cmpt}'`; 
      });
      let name = components.slice(0, components.length-1).join('->');
      name+='->>'+components[components.length-1];
      patterns.push(`${name} = '${fieldValue}'`);
    } else if (typeof fieldValue === 'string') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (typeof fieldValue === 'boolean') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (typeof fieldValue === 'number') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (fieldName === '$or') {
      let clauses = [];
      let clauseValues = [];
      fieldValue.forEach((subQuery, idx) =>  {
        let clause = buildWhereClause({ schema, query: subQuery, index });
        clauses.push(clause.pattern);
        clauseValues.push(...clause.values);
        index += clause.values.length;
      });
      patterns.push(`(${clauses.join(' OR ')})`);
      values.push(...clauseValues);
    }

    if (fieldValue.$ne) {
      if (fieldValue.$ne === null) {
        patterns.push(`$${index}:name <> $${index + 1}`);
      } else {
        // if not null, we need to manually exclude null
        patterns.push(`($${index}:name <> $${index + 1} OR $${index}:name IS NULL)`);
      }

      // TODO: support arrays
      values.push(fieldName, fieldValue.$ne);
      index += 2;
    }

    if (fieldValue.$eq) {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue.$eq);
      index += 2;
    }
    const isInOrNin = Array.isArray(fieldValue.$in) || Array.isArray(fieldValue.$nin);
    if (Array.isArray(fieldValue.$in) && schema.fields[fieldName].type === 'Array') {
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
    } else if (isInOrNin) {
      var createConstraint = (baseArray, notIn) => {
        if (baseArray.length > 0) {
          let inPatterns = [];
          values.push(fieldName);
          baseArray.forEach((listElem, listIndex) => {
            values.push(listElem);
            inPatterns.push(`$${index + 1 + listIndex}`);
          });
          let not = notIn ? 'NOT' : '';
          patterns.push(`$${index}:name ${not} IN (${inPatterns.join(',')})`);
          index = index + 1 + inPatterns.length;
        } else if (!notIn) {
          values.push(fieldName);
          patterns.push(`$${index}:name IS NULL`);
          index = index + 1;
        }
      }
      if (fieldValue.$in) {
        createConstraint(fieldValue.$in, false);
      }
      if (fieldValue.$nin) {
        createConstraint(fieldValue.$nin, true);
      }
    }

    if (typeof fieldValue.$exists !== 'undefined') {
      if (fieldValue.$exists) {
        patterns.push(`$${index}:name IS NOT NULL`);
      } else {
        patterns.push(`$${index}:name IS NULL`);
      }
      values.push(fieldName);
      index += 1;
    }

    if (fieldValue.$nearSphere) {
      let point = fieldValue.$nearSphere;
      let distance = fieldValue.$maxDistance;
      let distanceInKM = distance*6371*1000;
      patterns.push(`ST_distance_sphere($${index}:name::geometry, POINT($${index+1}, $${index+2})::geometry) <= $${index+3}`);
      sorts.push(`ST_distance_sphere($${index}:name::geometry, POINT($${index+1}, $${index+2})::geometry) ASC`)
      values.push(fieldName, point.latitude, point.longitude, distanceInKM);
      index += 4;
    }

    if (fieldValue.$regex) {
      let regex = fieldValue.$regex;
      let operator = '~';
      let opts = fieldValue.$options;
      if (opts) {
        if (opts.indexOf('i') >= 0) {
          operator = '~*';
        }
      }
      patterns.push(`$${index}:name ${operator} $${index+1}`);
      values.push(fieldName, regex);
      index += 2;
    }

    if (fieldValue.__type === 'Pointer') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue.objectId);
      index += 2;
    }

    if (fieldValue.__type === 'Date') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue.iso);
      index += 2;
    }

    Object.keys(ParseToPosgresComparator).forEach(cmp => {
      if (fieldValue[cmp]) {
        let pgComparator = ParseToPosgresComparator[cmp];
        patterns.push(`$${index}:name ${pgComparator} $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue[cmp]));
        index += 2;
      }
    });

    if (initialPatternsLength === patterns.length) {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Postgres doesn't support this query type yet ${JSON.stringify(fieldValue)}`);
    }
  }
  values = values.map(transformValue);
  return { pattern: patterns.join(' AND '), values, sorts };
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
    return this._client.none('CREATE TABLE "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )')
    .catch(error => {
      if (error.code === PostgresDuplicateRelationError || error.code === PostgresUniqueIndexViolationError) {
        // Table already exists, must have been created by a different request. Ignore error.
      } else {
        throw error;
      }
    });
  };

  classExists(name) {
    return notImplemented();
  }

  setClassLevelPermissions(className, CLPs) {
    return this._ensureSchemaCollectionExists().then(() => {
      const values = [className, 'schema', 'classLevelPermissions', CLPs]
      return this._client.none(`UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className"=$1 `, values);
    }).catch((err) => {
      console.error("ERR!!!", err);
      return Promise.reject(err);
    })
  }

  createClass(className, schema) {
    return this.createTable(className, schema)
    .then(() => this._client.none('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', { className, schema }))
    .then(() => { 
      return toParseSchema(schema)
    });
  }

  // Just create a table, do not insert in schema
  createTable(className, schema) {
    debug('createTable', className, schema);
    let valuesArray = [];
    let patternsArray = [];
    let fields = Object.assign({}, schema.fields);
    if (className === '_User') {
      fields._email_verify_token_expires_at = {type: 'Date'};
      fields._email_verify_token = {type: 'String'};
    }
    let index = 2;
    let relations = [];
    Object.keys(fields).forEach((fieldName) => {
      let parseType = fields[fieldName];
      // Skip when it's a relation
      // We'll create the tables later
      if (parseType.type == 'Relation') {
        relations.push(fieldName)
        return;
      }
      if (['_rperm', '_wperm'].includes(fieldName)) {
        parseType.contents = { type: 'String' };
      }
      valuesArray.push(fieldName);
      valuesArray.push(parseTypeToPostgresType(parseType));
      patternsArray.push(`$${index}:name $${index+1}:raw`);
      index = index+2;
    });
    const qs = `CREATE TABLE $1:name (${patternsArray.join(',')}, PRIMARY KEY ("objectId"))`;
    const values = [className, ...valuesArray];
    return this._ensureSchemaCollectionExists()
    .then(() => this._client.none(qs, values))
    .catch(error => {
      if (error.code === PostgresDuplicateRelationError) {
        // Table already exists, must have been created by a different request. Ignore error.
      } else {
        throw error;
      }
    }).then(() => {
      // Create the relation tables
      return Promise.all(relations.map((fieldName) => {
        return this._client.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {joinTable: `_Join:${fieldName}:${className}`})
      }));
    });
  }

  addFieldIfNotExists(className, fieldName, type) {
    // TODO: Must be revised for invalid logic...
    debug('addFieldIfNotExists', {className, fieldName, type});
    return this._client.tx("addFieldIfNotExists", t=> {
      let promise = Promise.resolve();
      if (type.type !== 'Relation') {
        promise = t.none('ALTER TABLE $<className:name> ADD COLUMN $<fieldName:name> $<postgresType:raw>', {
          className,
          fieldName,
          postgresType: parseTypeToPostgresType(type)
        })
        .catch(error => {
          if (error.code === PostgresRelationDoesNotExistError) {
            return this.createClass(className, {fields: {[fieldName]: type}})
          } else if (error.code === PostgresDuplicateColumnError) {
            // Column already exists, created by other request. Carry on to
            // See if it's the right type.
          } else {
            throw error;
          }
        })
      } else {
        promise = t.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {joinTable: `_Join:${fieldName}:${className}`})
      }
      return promise.then(() => {
        return t.any('SELECT "schema" FROM "_SCHEMA" WHERE "className" = $<className>', {className});
      }).then(result => {
        if (fieldName in result[0].schema) {
          throw "Attempted to add a field that already exists";
        } else {
          result[0].schema.fields[fieldName] = type;
          return t.none(
            'UPDATE "_SCHEMA" SET "schema"=$<schema> WHERE "className"=$<className>',
            {schema: result[0].schema, className}
          );
        }
      });
    });
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  deleteClass(className) {
    return notImplemented();
  }

  // Delete all data known to this adapter. Used for testing.
  deleteAllClasses() {
    return this._client.any('SELECT * FROM "_SCHEMA"')
    .then(results => {
      let joins = results.reduce((list, schema) => {
        Object.keys(schema.schema.fields).forEach((field) => {
          if (schema.schema.fields[field].type === 'Relation') {
            list.push(`_Join:${field}:${schema.className}`);
          }
        })
        return list;
      }, []);
      const classes = ['_SCHEMA','_PushStatus','_Hooks','_GlobalConfig', ...results.map(result => result.className), ...joins];
      return this._client.tx(t=>t.batch(classes.map(className=>t.none('DROP TABLE IF EXISTS $<className:name>', { className }))));
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
    return notImplemented();
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  getAllClasses() {
    return this._ensureSchemaCollectionExists()
    .then(() => this._client.map('SELECT * FROM "_SCHEMA"', null, row => ({ className: row.className, ...row.schema })))
    .then(res => res.map(toParseSchema))
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  getClass(className) {
    return this._client.any('SELECT * FROM "_SCHEMA" WHERE "className"=$<className>', { className })
    .then(result => {
      if (result.length === 1) {
        return result[0].schema;
      } else {
        throw undefined;
      }
    }).then(toParseSchema);
  }

  // TODO: remove the mongo format dependency in the return value
  createObject(className, schema, object) {
    debug('createObject', className, object);
    let columnsArray = [];
    let newFieldsArray = [];
    let valuesArray = [];
    schema = toPostgresSchema(schema);
    let geoPoints = {};
    Object.keys(object).forEach(fieldName => {
      var authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      if (authDataMatch) {
        var provider = authDataMatch[1];
        object['authData'] = object['authData'] || {};
        object['authData'][provider] = object[fieldName];
        delete object[fieldName];
        fieldName = 'authData';
      }
      
      columnsArray.push(fieldName);
      if (!schema.fields[fieldName] && className === '_User') {
        if (fieldName == '_email_verify_token') {
          valuesArray.push(object[fieldName]);
        }
        if (fieldName == '_email_verify_token_expires_at') {
          valuesArray.push(object[fieldName].iso);
        }
        return;
      }
      switch (schema.fields[fieldName].type) {
        case 'Date':
          valuesArray.push(object[fieldName].iso);
          break;
        case 'Pointer':
          valuesArray.push(object[fieldName].objectId);
          break;
        case 'Array':
          if (['_rperm', '_wperm'].includes(fieldName)) {
            valuesArray.push(object[fieldName]);
          } else {
            valuesArray.push(JSON.stringify(object[fieldName]));
          }
          break;        
        case 'Object':
        case 'String':
        case 'Number':
        case 'Boolean':
        case 'File':
          valuesArray.push(object[fieldName]);
          break;
        case 'GeoPoint':
          // pop the point and process later
          geoPoints[fieldName] = object[fieldName];
          columnsArray.pop();
          break;
        default:
          throw `Type ${schema.fields[fieldName].type} not supported yet`;
          break;
      }
    });

    columnsArray = columnsArray.concat(Object.keys(geoPoints));
    let initialValues = valuesArray.map((val, index) => `$${index + 2 + columnsArray.length}${(['_rperm','_wperm'].includes(columnsArray[index])) ? '::text[]' : ''}`);
    
    let geoPointsInjects = Object.keys(geoPoints).map((key, idx) => {
      let value = geoPoints[key];
      valuesArray.push(value.latitude, value.longitude);
      let l = valuesArray.length + columnsArray.length;
      return `POINT($${l}, $${l+1})`;
    });

    let columnsPattern = columnsArray.map((col, index) => `$${index + 2}:name`).join(',');
    let valuesPattern = initialValues.concat(geoPointsInjects).join(',')

    let qs = `INSERT INTO $1:name (${columnsPattern}) VALUES (${valuesPattern})`
    let values = [className, ...columnsArray, ...valuesArray]
    debug(qs, values);
    return this._client.any(qs, values)
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
    debug('deleteObjectsByQuery', className, query);
    let values = [className];
    let index = 2;
    let where = buildWhereClause({ schema, index, query })
    values.push(...where.values);
    if (Object.keys(query).length == 0) {
      where.pattern = 'TRUE';
    }
    let qs = `WITH deleted AS (DELETE FROM $1:name WHERE ${where.pattern} RETURNING *) SELECT count(*) FROM deleted`;
    debug(qs, values);
    return this._client.one(qs, values , a => +a.count)
    .then(count => {
      if (count === 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
      } else {
        return count;
      }
    });
  }

  // Apply the update to all objects that match the given Parse Query.
  updateObjectsByQuery(className, schema, query, update) {
    debug('updateObjectsByQuery', className, query, update);
    return this.findOneAndUpdate(className, schema, query, update);
  }

  // Return value not currently well specified.
  findOneAndUpdate(className, schema, query, update) {
    debug('findOneAndUpdate', className, query, update);
    let conditionPatterns = [];
    let updatePatterns = [];
    let values = [className]
    let index = 2;
    schema = toPostgresSchema(schema);
    for (let fieldName in update) {
      let fieldValue = update[fieldName];
      var authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      if (authDataMatch) {
        var provider = authDataMatch[1];
        let value = update[fieldName];
        delete update[fieldName];
        fieldName = 'authData';
        updatePatterns.push(`$${index}:name = json_object_set_key($${index}:name, $${index+1}::text, $${index+2}::jsonb)`);
        values.push(fieldName, provider, value);
        index += 3;
      } else if (fieldValue.__op === 'Increment') {
        updatePatterns.push(`$${index}:name = COALESCE($${index}:name, 0) + $${index + 1}`);
        values.push(fieldName, fieldValue.amount);
        index += 2;
      } else if (fieldValue.__op === 'Add') {
        updatePatterns.push(`$${index}:name = COALESCE($${index}:name, '[]'::jsonb) || $${index + 1}`);
        values.push(fieldName, fieldValue.objects);
        index += 2;
      } else if (fieldValue.__op === 'Delete') {
        updatePatterns.push(`$${index}:name = $${index + 1}`)
        values.push(fieldName, null);
        index += 2;
      } else if (fieldValue.__op === 'Remove') {
        return Promise.reject(new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Postgres does not support Remove operator.'));
      } else if (fieldValue.__op === 'AddUnique') {
        return Promise.reject(new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Postgres does not support AddUnique operator.'));
      } else if (fieldName === 'updatedAt') { //TODO: stop special casing this. It should check for __type === 'Date' and use .iso
        updatePatterns.push(`$${index}:name = $${index + 1}`)
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'string') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'boolean') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'Pointer') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      } else if (fieldValue.__type === 'Date') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue.__type === 'GeoPoint') {
        updatePatterns.push(`$${index}:name = POINT($${index + 1}, $${index + 2})`);
        values.push(fieldName, fieldValue.latitude, fieldValue.longitude);
        index += 3;
      } else if (typeof fieldValue === 'number') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'object'
                    && schema.fields[fieldName]
                    && schema.fields[fieldName].type == 'Object') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (Array.isArray(fieldValue)
                    && schema.fields[fieldName]
                    && schema.fields[fieldName].type == 'Array') {
        let expectedType = parseTypeToPostgresType(schema.fields[fieldName]);
        if (expectedType === 'text[]') {
          updatePatterns.push(`$${index}:name = $${index + 1}::text[]`);
        } else {
          updatePatterns.push(`$${index}:name = array_to_json($${index + 1}::text[])::jsonb`);
        }
        values.push(fieldName, fieldValue);
        index += 2;
      } else {
        debug('Not supported update', fieldName, fieldValue);
        return Promise.reject(new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Postgres doesn't support update ${JSON.stringify(fieldValue)} yet`));
      }
    }

    let where = buildWhereClause({ schema, index, query })
    values.push(...where.values);

    let qs = `UPDATE $1:name SET ${updatePatterns.join(',')} WHERE ${where.pattern} RETURNING *`;
    debug('update: ', qs, values);
    return this._client.any(qs, values) 
    .then(val => val[0]); // TODO: This is unsafe, verification is needed, or a different query method;
  }

  // Hopefully, we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update) {
    debug('upsertOneObject', {className, query, update});
    return this.createObject(className, schema, update).catch((err) => {
      // ignore duplicate value errors as it's upsert
      if (err.code == Parse.Error.DUPLICATE_VALUE) {
        return;
      }
      throw err;
    });
  }

  find(className, schema, query, { skip, limit, sort }) {
    debug('find', className, query, {skip, limit, sort});
    const hasLimit = limit !== undefined;
    const hasSkip = skip !== undefined;
    let values = [className];
    let where = buildWhereClause({ schema, query, index: 2 })
    values.push(...where.values);
    
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const limitPattern = hasLimit ? `LIMIT $${values.length + 1}` : '';
    if (hasLimit) {
      values.push(limit);
    }
    const skipPattern = hasSkip ? `OFFSET $${values.length+1}` : '';
    if (hasSkip) {
      values.push(skip);
    }

    let sortPattern = '';
    if (sort) {
      let sorting = Object.keys(sort).map((key) => {
        // Using $idx pattern gives:  non-integer constant in ORDER BY
        if (sort[key] === 1) {
          return `"${key}" ASC`;
        }
        return `"${key}" DESC`;
      }).join(',');
      sortPattern = sort !== undefined && Object.keys(sort).length > 0 ? `ORDER BY ${sorting}` : '';
    }
    if (where.sorts && Object.keys(where.sorts).length > 0) {
      sortPattern = `ORDER BY ${where.sorts.join(',')}`;
    }

    const qs = `SELECT * FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern}`;
    debug(qs, values);
    return this._client.any(qs, values)
    .catch((err) => {
      // Query on non existing table, don't crash
      if (err.code === PostgresRelationDoesNotExistError) {
        return [];
      }
      return Promise.reject(err);
    })
    .then(results => results.map(object => {
      Object.keys(schema.fields).forEach(fieldName => {
        if (schema.fields[fieldName].type === 'Pointer' && object[fieldName]) {
          object[fieldName] = { objectId: object[fieldName], __type: 'Pointer', className: schema.fields[fieldName].targetClass };
        }
        if (schema.fields[fieldName].type === 'Relation') {
          object[fieldName] = {
            __type: "Relation",
            className: schema.fields[fieldName].targetClass
          }
        }
        if (object[fieldName] && schema.fields[fieldName].type === 'GeoPoint') {
          object[fieldName] = {
            latitude: object[fieldName].x,
            longitude: object[fieldName].y
          }
        }
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
      if (object._email_verify_token_expires_at) {
        object._email_verify_token_expires_at = { __type: 'Date', iso: object._email_verify_token_expires_at.toISOString() };
      }

      for (let fieldName in object) {
        if (object[fieldName] === null) {
          delete object[fieldName];
        }
        if (object[fieldName] instanceof Date) {
          object[fieldName] = { __type: 'Date', iso: object[fieldName].toISOString() };
        }
      }

      return object;
    }));
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
    return this._client.none(qs,[className, constraintName, ...fieldNames])
    .catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(constraintName)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(constraintName)) {
        // Cast the error into the proper parse error
        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  }

  // Executes a count.
  count(className, schema, query) {
    let values = [className];
    let where = buildWhereClause({ schema, query, index: 2 });
    values.push(...where.values);

    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const qs = `SELECT count(*) FROM $1:name ${wherePattern}`;
    return this._client.one(qs, values, a => +a.count);
  }

  performInitialization({ VolatileClassesSchemas }) {
    debug('performInitialization');
    return VolatileClassesSchemas.reduce((promise, schema) => {
      promise = promise.then(() => {
        return this.createTable(schema.className, schema);
      });
      return promise;
    }, Promise.resolve()).then(() => {
      return this._client.any(json_object_set_key).catch((err) => {
        console.error(err);
      })
    });
  }
}

function notImplemented() {
    return Promise.reject(new Error('Not implemented yet.'));
}

// Function to set a key on a nested JSON document
const json_object_set_key = 'CREATE OR REPLACE FUNCTION "json_object_set_key"(\
  "json"          jsonb,\
  "key_to_set"    TEXT,\
  "value_to_set"  anyelement\
)\
  RETURNS jsonb \
  LANGUAGE sql \
  IMMUTABLE \
  STRICT \
AS $function$\
SELECT concat(\'{\', string_agg(to_json("key") || \':\' || "value", \',\'), \'}\')::jsonb\
  FROM (SELECT *\
          FROM jsonb_each("json")\
         WHERE "key" <> "key_to_set"\
         UNION ALL\
        SELECT "key_to_set", to_json("value_to_set")::jsonb) AS "fields"\
$function$;'

export default PostgresStorageAdapter;
module.exports = PostgresStorageAdapter; // Required for tests
