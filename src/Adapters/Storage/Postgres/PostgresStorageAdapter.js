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
    case 'File': return 'text';
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
    if (value.__type === 'File') {
      return value.name;
    }
  }
  return value;
}

const transformValue = value => {
  if (value.__type === 'Pointer') {
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

const handleDotFields = (object) => {
  Object.keys(object).forEach(fieldName => {
    if (fieldName.indexOf('.') > -1) {
      let components = fieldName.split('.');
      let first = components.shift();
      object[first] = object[first] || {};
      let currentObj = object[first];
      let next;
      let value = object[fieldName];
      if (value && value.__op === 'Delete') {
        value = undefined;
      }
      while(next = components.shift()) {
        currentObj[next] = currentObj[next] || {};
        if (components.length === 0) {
          currentObj[next] = value;
        }
        currentObj = currentObj[next];
      }
      delete object[fieldName];
    }
  });
  return object;
}

// Returns the list of join tables on a schema
const joinTablesForSchema = (schema) => {
  let list = [];
  if (schema) {
    Object.keys(schema.fields).forEach((field) => {
      if (schema.fields[field].type === 'Relation') {
        list.push(`_Join:${field}:${schema.className}`);
      }
    });
  }
  return list;
} 

const buildWhereClause = ({ schema, query, index }) => {
  let patterns = [];
  let values = [];
  let sorts = [];

  schema = toPostgresSchema(schema);
  for (let fieldName in query) {
    let isArrayField = schema.fields 
          && schema.fields[fieldName] 
          && schema.fields[fieldName].type === 'Array';
    let initialPatternsLength = patterns.length;
    let fieldValue = query[fieldName];

    // nothingin the schema, it's gonna blow up
    if (!schema.fields[fieldName]) {
      // as it won't exist
      if (fieldValue.$exists === false) {
        continue;
      }
    } 

    if (fieldName.indexOf('.') >= 0) {
      let components = fieldName.split('.').map((cmpt, index) => {
        if (index === 0) {
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
    } else if (fieldName === '$or' || fieldName === '$and') {
      let clauses = [];
      let clauseValues = [];
      fieldValue.forEach((subQuery, idx) =>  {
        let clause = buildWhereClause({ schema, query: subQuery, index });
        if (clause.pattern.length > 0) {
          clauses.push(clause.pattern);
          clauseValues.push(...clause.values);
          index += clause.values.length;
        }
      });
      let orOrAnd = fieldName === '$or' ? ' OR ' : ' AND ';
      patterns.push(`(${clauses.join(orOrAnd)})`);
      values.push(...clauseValues);
    }

    if (fieldValue.$ne) {
      if (isArrayField) {
        fieldValue.$ne = JSON.stringify([fieldValue.$ne]);
        patterns.push(`NOT array_contains($${index}:name, $${index + 1})`);
      } else {
        if (fieldValue.$ne === null) {
          patterns.push(`$${index}:name <> $${index + 1}`);
        } else {
          // if not null, we need to manually exclude null
          patterns.push(`($${index}:name <> $${index + 1} OR $${index}:name IS NULL)`);
        }
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
    if (Array.isArray(fieldValue.$in) &&
        isArrayField &&
        schema.fields[fieldName].contents && 
        schema.fields[fieldName].contents.type === 'String') {
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
          let not = notIn ? ' NOT ' : '';
          if (isArrayField) {
            patterns.push(`${not} array_contains($${index}:name, $${index+1})`);
            values.push(fieldName, JSON.stringify(baseArray));
            index += 2;
          } else {
            let inPatterns = [];
            values.push(fieldName);
            baseArray.forEach((listElem, listIndex) => {
              values.push(listElem);
              inPatterns.push(`$${index + 1 + listIndex}`);
            });
            patterns.push(`$${index}:name ${not} IN (${inPatterns.join(',')})`);
            index = index + 1 + inPatterns.length;
          }
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

    if (Array.isArray(fieldValue.$all) && isArrayField) {
      patterns.push(`array_contains_all($${index}:name, $${index+1}::jsonb)`);
      values.push(fieldName, JSON.stringify(fieldValue.$all));
      index+=2;
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
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }

    if (fieldValue.$within && fieldValue.$within.$box) {
      let box = fieldValue.$within.$box;
      let left = box[0].longitude;
      let bottom = box[0].latitude;
      let right = box[1].longitude;
      let top = box[1].latitude;

      patterns.push(`$${index}:name::point <@ $${index+1}::box`);
      values.push(fieldName, `((${left}, ${bottom}), (${right}, ${top}))`);
      index += 2;
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
      if (isArrayField) {
        patterns.push(`array_contains($${index}:name, $${index + 1})`);
        values.push(fieldName, JSON.stringify([fieldValue]));
        index += 2;
      } else {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      }
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
    return this._client.one(`SELECT EXISTS (SELECT 1 FROM   information_schema.tables WHERE table_name = $1)`, [name]).then((res) => {
      return res.exists;
    });
  }

  setClassLevelPermissions(className, CLPs) {
    return this._ensureSchemaCollectionExists().then(() => {
      const values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)]
      return this._client.none(`UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className"=$1 `, values);
    });
  }

  createClass(className, schema) {
    return this.createTable(className, schema)
    .then(() => this._client.none('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', { className, schema }))
    .then(() => {
      return toParseSchema(schema)
    })
    .catch((err) => {
      if (err.code === PostgresUniqueIndexViolationError && err.detail.includes(className)) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`)
      }
      throw err;
    })
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
      fields._account_lockout_expires_at = {type: 'Date'};
      fields._failed_login_count = {type: 'Number'};
      fields._perishable_token = {type: 'String'};
    }
    let index = 2;
    let relations = [];
    Object.keys(fields).forEach((fieldName) => {
      let parseType = fields[fieldName];
      // Skip when it's a relation
      // We'll create the tables later
      if (parseType.type === 'Relation') {
        relations.push(fieldName)
        return;
      }
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        parseType.contents = { type: 'String' };
      }
      valuesArray.push(fieldName);
      valuesArray.push(parseTypeToPostgresType(parseType));
      patternsArray.push(`$${index}:name $${index+1}:raw`);
      if (fieldName === 'objectId') {
        patternsArray.push(`PRIMARY KEY ($${index}:name)`)
      }
      index = index+2;
    });
    const qs = `CREATE TABLE $1:name (${patternsArray.join(',')})`;
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
        return this._client.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {joinTable: `_Join:${fieldName}:${className}`});
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
        if (fieldName in result[0].schema.fields) {
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
    return Promise.resolve().then(() => {
      let operations = [[`DROP TABLE IF EXISTS $1:name`, [className]],
        [`DELETE FROM "_SCHEMA" WHERE "className"=$1`, [className]]];
      return this._client.tx(t=>t.batch(operations.map(statement=>t.none(statement[0], statement[1]))));
    }).then(() => {
      // resolves with false when _Join table
      return className.indexOf('_Join:') != 0;
    });
  }

  // Delete all data known to this adapter. Used for testing.
  deleteAllClasses() {
    let now = new Date().getTime();
    debug('deleteAllClasses');
    return this._client.any('SELECT * FROM "_SCHEMA"')
    .then(results => {
      let joins = results.reduce((list, schema) => {
        return list.concat(joinTablesForSchema(schema.schema));
      }, []);
      const classes = ['_SCHEMA','_PushStatus','_JobStatus','_Hooks','_GlobalConfig', ...results.map(result => result.className), ...joins];
      return this._client.tx(t=>t.batch(classes.map(className=>t.none('DROP TABLE IF EXISTS $<className:name>', { className }))));
    }, error => {
      if (error.code === PostgresRelationDoesNotExistError) {
        // No _SCHEMA collection. Don't delete anything.
        return;
      } else {
        throw error;
      }
    }).then(() => {
      debug(`deleteAllClasses done in ${new Date().getTime() - now}`);
    });
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
    debug('deleteFields', className, fieldNames);
    return Promise.resolve()
    .then(() => {
      fieldNames = fieldNames.reduce((list, fieldName) => {
        let field = schema.fields[fieldName]
        if (field.type !== 'Relation') {
          list.push(fieldName);
        }
        delete schema.fields[fieldName];
        return list;
      }, []);

      let values = [className, ...fieldNames];
      let columns = fieldNames.map((name, idx) => {
        return `$${idx+2}:name`;
      }).join(',');

      let doBatch = (t) => {
        let batch = [
          t.none('UPDATE "_SCHEMA" SET "schema"=$<schema> WHERE "className"=$<className>', {schema, className})
        ];
        if (values.length > 1) {
          batch.push(t.none(`ALTER TABLE $1:name DROP COLUMN ${columns}`, values));
        }
        return batch;
      }
      return this._client.tx((t) => {
        return t.batch(doBatch(t));
      });
    });
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
    debug('getClass', className);
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

    object = handleDotFields(object);

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
        if (fieldName === '_email_verify_token' ||
            fieldName === '_failed_login_count' ||
            fieldName === '_perishable_token') {
          valuesArray.push(object[fieldName]);
        }

        if (fieldName === '_email_verify_token_expires_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }

        if (fieldName === '_account_lockout_expires_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }
        return;
      }
      switch (schema.fields[fieldName].type) {
        case 'Date':
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
          break;
        case 'Pointer':
          valuesArray.push(object[fieldName].objectId);
          break;
        case 'Array':
          if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
            valuesArray.push(object[fieldName]);
          } else {
            valuesArray.push(JSON.stringify(object[fieldName]));
          }
          break;        
        case 'Object':
        case 'String':
        case 'Number':
        case 'Boolean':
          valuesArray.push(object[fieldName]);
          break;
        case 'File':
          valuesArray.push(object[fieldName].name);
          break;
        case 'GeoPoint':
          // pop the point and process later
          geoPoints[fieldName] = object[fieldName];
          columnsArray.pop();
          break;
        default:
          throw `Type ${schema.fields[fieldName].type} not supported yet`;
      }
    });

    columnsArray = columnsArray.concat(Object.keys(geoPoints));
    let initialValues = valuesArray.map((val, index) => {
      let termination = '';
      let fieldName = columnsArray[index];
      if (['_rperm','_wperm'].indexOf(fieldName) >= 0) {
        termination = '::text[]';
      } else if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        termination = '::jsonb';
      }
      return `$${index + 2 + columnsArray.length}${termination}`;
    });
    let geoPointsInjects = Object.keys(geoPoints).map((key, idx) => {
      let value = geoPoints[key];
      valuesArray.push(value.longitude, value.latitude);
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
    if (Object.keys(query).length === 0) {
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
  // Return value not currently well specified.
  findOneAndUpdate(className, schema, query, update) {
    debug('findOneAndUpdate', className, query, update);
    return this.updateObjectsByQuery(className, schema, query, update).then((val) => val[0]);
  }

  // Apply the update to all objects that match the given Parse Query.
  updateObjectsByQuery(className, schema, query, update) {
    debug('updateObjectsByQuery', className, query, update);
    let conditionPatterns = [];
    let updatePatterns = [];
    let values = [className]
    let index = 2;
    schema = toPostgresSchema(schema);

    update = handleDotFields(update);
    // Resolve authData first,
    // So we don't end up with multiple key updates
    for (let fieldName in update) {
      let authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      if (authDataMatch) {
        var provider = authDataMatch[1];
        let value = update[fieldName];
        delete update[fieldName];
        update['authData'] = update['authData'] || {};
        update['authData'][provider] = value;
      }
    }

    for (let fieldName in update) {
      let fieldValue = update[fieldName];
      if (fieldValue === null) {
        updatePatterns.push(`$${index}:name = NULL`);
        values.push(fieldName);
        index += 1;
      } else if (fieldName == 'authData') {
        // This recursively sets the json_object
        // Only 1 level deep
        let generate = (jsonb, key, value) => {
          return `json_object_set_key(COALESCE(${jsonb}, '{}'::jsonb), ${key}, ${value})::jsonb`; 
        }
        let lastKey = `$${index}:name`;
        let fieldNameIndex = index;
        index+=1;
        values.push(fieldName);
        let update = Object.keys(fieldValue).reduce((lastKey, key) => {
          let str = generate(lastKey, `$${index}::text`, `$${index+1}::jsonb`)
          index+=2;
          let value = fieldValue[key];
          if (value) {
            if (value.__op === 'Delete') {
              value = null;
            } else {
              value = JSON.stringify(value)
            }
          }
          values.push(key, value);
          return str;
        }, lastKey);
        updatePatterns.push(`$${fieldNameIndex}:name = ${update}`);
      } else if (fieldValue.__op === 'Increment') {
        updatePatterns.push(`$${index}:name = COALESCE($${index}:name, 0) + $${index + 1}`);
        values.push(fieldName, fieldValue.amount);
        index += 2;
      } else if (fieldValue.__op === 'Add') {
        updatePatterns.push(`$${index}:name = array_add(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'Delete') {
        updatePatterns.push(`$${index}:name = $${index + 1}`)
        values.push(fieldName, null);
        index += 2;
      } else if (fieldValue.__op === 'Remove') {
        updatePatterns.push(`$${index}:name = array_remove(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`)
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'AddUnique') {
        updatePatterns.push(`$${index}:name = array_add_unique(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
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
      } else if (fieldValue instanceof Date) {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'File') {
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
                    && schema.fields[fieldName].type === 'Object') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (Array.isArray(fieldValue)
                    && schema.fields[fieldName]
                    && schema.fields[fieldName].type === 'Array') {
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
    return this._client.any(qs, values); // TODO: This is unsafe, verification is needed, or a different query method;
  }

  // Hopefully, we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update) {
    debug('upsertOneObject', {className, query, update});
    let createValue = Object.assign({}, query, update);
    return this.createObject(className, schema, createValue).catch((err) => {
      // ignore duplicate value errors as it's upsert
      if (err.code === Parse.Error.DUPLICATE_VALUE) {
        return this.findOneAndUpdate(className, schema, query, update);
      }
      throw err;
    });
  }

  find(className, schema, query, { skip, limit, sort, keys }) {
    debug('find', className, query, {skip, limit, sort, keys });
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

    let columns = '*';
    if (keys) {
      // Exclude empty keys
      keys = keys.filter((key) => {
        return key.length > 0;
      });
      columns = keys.map((key, index) => {
        return `$${index+values.length+1}:name`;
      }).join(',');
      values = values.concat(keys);
    }

    const qs = `SELECT ${columns} FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern}`;
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
            latitude: object[fieldName].y,
            longitude: object[fieldName].x
          }
        }
        if (object[fieldName] && schema.fields[fieldName].type === 'File') {
          object[fieldName] = {
            __type: 'File',
            name: object[fieldName]
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
      if (object._account_lockout_expires_at) {
        object._account_lockout_expires_at = { __type: 'Date', iso: object._account_lockout_expires_at.toISOString() };
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
    debug('count', className, query);
    let values = [className];
    let where = buildWhereClause({ schema, query, index: 2 });
    values.push(...where.values);

    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const qs = `SELECT count(*) FROM $1:name ${wherePattern}`;
    return this._client.one(qs, values, a => +a.count).catch((err) => {
      if (err.code === PostgresRelationDoesNotExistError) {
        return 0;
      }
      throw err;
    });
  }

  performInitialization({ VolatileClassesSchemas }) {
    let now = new Date().getTime();
    debug('performInitialization');
    let promises = VolatileClassesSchemas.map((schema) => {
      return this.createTable(schema.className, schema).catch((err) =>{
        if (err.code === PostgresDuplicateRelationError || err.code === Parse.Error.INVALID_CLASS_NAME) {
          return Promise.resolve();
        }
        throw err;
      });
    });
    promises = promises.concat([
        this._client.any(json_object_set_key).catch((err) => {
          console.error(err);
        }),
        this._client.any(array_add).catch((err) => {
          console.error(err);
        }),
        this._client.any(array_add_unique).catch((err) => {
          console.error(err);
        }),
        this._client.any(array_remove).catch((err) => {
          console.error(err);
        }),
        this._client.any(array_contains_all).catch((err) => {
          console.error(err);
        }),
        this._client.any(array_contains).catch((err) => {
          console.error(err);
        })
      ]);
    return Promise.all(promises).then(() => {
      debug(`initialzationDone in ${new Date().getTime() - now}`);
    }, (err) => {});
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

const array_add = `CREATE OR REPLACE FUNCTION "array_add"(
  "array"   jsonb,
  "values"  jsonb
)
  RETURNS jsonb 
  LANGUAGE sql 
  IMMUTABLE 
  STRICT 
AS $function$ 
  SELECT array_to_json(ARRAY(SELECT unnest(ARRAY(SELECT DISTINCT jsonb_array_elements("array")) ||  ARRAY(SELECT jsonb_array_elements("values")))))::jsonb;
$function$;`;

const array_add_unique = `CREATE OR REPLACE FUNCTION "array_add_unique"(
  "array"   jsonb,
  "values"  jsonb
)
  RETURNS jsonb 
  LANGUAGE sql 
  IMMUTABLE 
  STRICT 
AS $function$ 
  SELECT array_to_json(ARRAY(SELECT DISTINCT unnest(ARRAY(SELECT DISTINCT jsonb_array_elements("array")) ||  ARRAY(SELECT DISTINCT jsonb_array_elements("values")))))::jsonb;
$function$;`;

const array_remove = `CREATE OR REPLACE FUNCTION "array_remove"(
  "array"   jsonb,
  "values"  jsonb
)
  RETURNS jsonb 
  LANGUAGE sql 
  IMMUTABLE 
  STRICT 
AS $function$ 
  SELECT array_to_json(ARRAY(SELECT * FROM jsonb_array_elements("array") as elt WHERE elt NOT IN (SELECT * FROM (SELECT jsonb_array_elements("values")) AS sub)))::jsonb;
$function$;`;

const array_contains_all = `CREATE OR REPLACE FUNCTION "array_contains_all"(
  "array"   jsonb,
  "values"  jsonb
)
  RETURNS boolean 
  LANGUAGE sql 
  IMMUTABLE 
  STRICT 
AS $function$ 
  SELECT RES.CNT = jsonb_array_length("values") FROM (SELECT COUNT(*) as CNT FROM jsonb_array_elements("array") as elt WHERE elt IN (SELECT jsonb_array_elements("values"))) as RES ;
$function$;`;

const array_contains = `CREATE OR REPLACE FUNCTION "array_contains"(
  "array"   jsonb,
  "values"  jsonb
)
  RETURNS boolean 
  LANGUAGE sql 
  IMMUTABLE 
  STRICT 
AS $function$ 
  SELECT RES.CNT >= 1 FROM (SELECT COUNT(*) as CNT FROM jsonb_array_elements("array") as elt WHERE elt IN (SELECT jsonb_array_elements("values"))) as RES ;
$function$;`;

export default PostgresStorageAdapter;
module.exports = PostgresStorageAdapter; // Required for tests
