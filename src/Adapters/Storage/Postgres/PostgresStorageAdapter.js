// @flow
import { createClient } from './PostgresClient';
// @flow-disable-next
import Parse            from 'parse/node';
// @flow-disable-next
import _                from 'lodash';
import sql              from './sql';

const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';
const PostgresDuplicateColumnError = '42701';
const PostgresMissingColumnError = '42703';
const PostgresDuplicateObjectError = '42710';
const PostgresUniqueIndexViolationError = '23505';
const PostgresTransactionAbortedError = '25P02';
const logger = require('../../../logger');

const debug = function(...args: any) {
  args = ['PG: ' + arguments[0]].concat(args.slice(1, args.length));
  const log = logger.getLogger();
  log.debug.apply(log, args);
}

import { StorageAdapter }    from '../StorageAdapter';
import type { SchemaType,
  QueryType,
  QueryOptions } from '../StorageAdapter';

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
  case 'Bytes': return 'jsonb';
  case 'Polygon': return 'polygon';
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

const toPostgresValue = value => {
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

const transformValue = value => {
  if (typeof value === 'object' &&
        value.__type === 'Pointer') {
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

const toParseSchema = (schema) => {
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
  let indexes = {};
  if (schema.indexes) {
    indexes = {...schema.indexes};
  }
  return {
    className: schema.className,
    fields: schema.fields,
    classLevelPermissions: clps,
    indexes,
  };
}

const toPostgresSchema = (schema) => {
  if (!schema) {
    return schema;
  }
  schema.fields = schema.fields || {};
  schema.fields._wperm = {type: 'Array', contents: {type: 'String'}}
  schema.fields._rperm = {type: 'Array', contents: {type: 'String'}}
  if (schema.className === '_User') {
    schema.fields._hashed_password = {type: 'String'};
    schema.fields._password_history = {type: 'Array'};
  }
  return schema;
}

const handleDotFields = (object) => {
  Object.keys(object).forEach(fieldName => {
    if (fieldName.indexOf('.') > -1) {
      const components = fieldName.split('.');
      const first = components.shift();
      object[first] = object[first] || {};
      let currentObj = object[first];
      let next;
      let value = object[fieldName];
      if (value && value.__op === 'Delete') {
        value = undefined;
      }
      /* eslint-disable no-cond-assign */
      while(next = components.shift()) {
      /* eslint-enable no-cond-assign */
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

const transformDotFieldToComponents = (fieldName) => {
  return fieldName.split('.').map((cmpt, index) => {
    if (index === 0) {
      return `"${cmpt}"`;
    }
    return `'${cmpt}'`;
  });
}

const transformDotField = (fieldName) => {
  if (fieldName.indexOf('.') === -1) {
    return `"${fieldName}"`;
  }
  const components = transformDotFieldToComponents(fieldName);
  let name = components.slice(0, components.length - 1).join('->');
  name += '->>' + components[components.length - 1];
  return name;
}

const transformAggregateField = (fieldName) => {
  return fieldName.substr(1);
}

const validateKeys = (object) => {
  if (typeof object == 'object') {
    for (const key in object) {
      if (typeof object[key] == 'object') {
        validateKeys(object[key]);
      }

      if(key.includes('$') || key.includes('.')){
        throw new Parse.Error(Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
      }
    }
  }
}

// Returns the list of join tables on a schema
const joinTablesForSchema = (schema) => {
  const list = [];
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
  const patterns = [];
  let values = [];
  const sorts = [];

  schema = toPostgresSchema(schema);
  for (const fieldName in query) {
    const isArrayField = schema.fields
          && schema.fields[fieldName]
          && schema.fields[fieldName].type === 'Array';
    const initialPatternsLength = patterns.length;
    const fieldValue = query[fieldName];

    // nothingin the schema, it's gonna blow up
    if (!schema.fields[fieldName]) {
      // as it won't exist
      if (fieldValue && fieldValue.$exists === false) {
        continue;
      }
    }

    if (fieldName.indexOf('.') >= 0) {
      let name = transformDotField(fieldName);
      if (fieldValue === null) {
        patterns.push(`${name} IS NULL`);
      } else {
        if (fieldValue.$in) {
          const inPatterns = [];
          name = transformDotFieldToComponents(fieldName).join('->');
          fieldValue.$in.forEach((listElem) => {
            if (typeof listElem === 'string') {
              inPatterns.push(`"${listElem}"`);
            } else {
              inPatterns.push(`${listElem}`);
            }
          });
          patterns.push(`(${name})::jsonb @> '[${inPatterns.join()}]'::jsonb`);
        } else if (fieldValue.$regex) {
          // Handle later
        } else {
          patterns.push(`${name} = '${fieldValue}'`);
        }
      }
    } else if (fieldValue === null || fieldValue === undefined) {
      patterns.push(`$${index}:name IS NULL`);
      values.push(fieldName);
      index += 1;
      continue;
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
      const clauses = [];
      const clauseValues = [];
      fieldValue.forEach((subQuery) =>  {
        const clause = buildWhereClause({ schema, query: subQuery, index });
        if (clause.pattern.length > 0) {
          clauses.push(clause.pattern);
          clauseValues.push(...clause.values);
          index += clause.values.length;
        }
      });
      const orOrAnd = fieldName === '$or' ? ' OR ' : ' AND ';
      patterns.push(`(${clauses.join(orOrAnd)})`);
      values.push(...clauseValues);
    }

    if (fieldValue.$ne !== undefined) {
      if (isArrayField) {
        fieldValue.$ne = JSON.stringify([fieldValue.$ne]);
        patterns.push(`NOT array_contains($${index}:name, $${index + 1})`);
      } else {
        if (fieldValue.$ne === null) {
          patterns.push(`$${index}:name IS NOT NULL`);
          values.push(fieldName);
          index += 1;
          continue;
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
      const inPatterns = [];
      let allowNull = false;
      values.push(fieldName);
      fieldValue.$in.forEach((listElem, listIndex) => {
        if (listElem === null) {
          allowNull = true;
        } else {
          values.push(listElem);
          inPatterns.push(`$${index + 1 + listIndex - (allowNull ? 1 : 0)}`);
        }
      });
      if (allowNull) {
        patterns.push(`($${index}:name IS NULL OR $${index}:name && ARRAY[${inPatterns.join()}])`);
      } else {
        patterns.push(`$${index}:name && ARRAY[${inPatterns.join()}]`);
      }
      index = index + 1 + inPatterns.length;
    } else if (isInOrNin) {
      var createConstraint = (baseArray, notIn) => {
        if (baseArray.length > 0) {
          const not = notIn ? ' NOT ' : '';
          if (isArrayField) {
            patterns.push(`${not} array_contains($${index}:name, $${index + 1})`);
            values.push(fieldName, JSON.stringify(baseArray));
            index += 2;
          } else {
            // Handle Nested Dot Notation Above
            if (fieldName.indexOf('.') >= 0) {
              return;
            }
            const inPatterns = [];
            values.push(fieldName);
            baseArray.forEach((listElem, listIndex) => {
              if (listElem !== null) {
                values.push(listElem);
                inPatterns.push(`$${index + 1 + listIndex}`);
              }
            });
            patterns.push(`$${index}:name ${not} IN (${inPatterns.join()})`);
            index = index + 1 + inPatterns.length;
          }
        } else if (!notIn) {
          values.push(fieldName);
          patterns.push(`$${index}:name IS NULL`);
          index = index + 1;
        }
      }
      if (fieldValue.$in) {
        createConstraint(_.flatMap(fieldValue.$in, elt => elt), false);
      }
      if (fieldValue.$nin) {
        createConstraint(_.flatMap(fieldValue.$nin, elt => elt), true);
      }
    }

    if (Array.isArray(fieldValue.$all) && isArrayField) {
      patterns.push(`array_contains_all($${index}:name, $${index + 1}::jsonb)`);
      values.push(fieldName, JSON.stringify(fieldValue.$all));
      index += 2;
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

    if (fieldValue.$text) {
      const search = fieldValue.$text.$search;
      let language = 'english';
      if (typeof search !== 'object') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $search, should be object`
        );
      }
      if (!search.$term || typeof search.$term !== 'string') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $term, should be string`
        );
      }
      if (search.$language && typeof search.$language !== 'string') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $language, should be string`
        );
      } else if (search.$language) {
        language = search.$language;
      }
      if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $caseSensitive, should be boolean`
        );
      } else if (search.$caseSensitive) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $caseSensitive not supported, please use $regex or create a separate lower case column.`
        );
      }
      if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $diacriticSensitive, should be boolean`
        );
      } else if (search.$diacriticSensitive === false) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `bad $text: $diacriticSensitive - false not supported, install Postgres Unaccent Extension`
        );
      }
      patterns.push(`to_tsvector($${index}, $${index + 1}:name) @@ to_tsquery($${index + 2}, $${index + 3})`);
      values.push(language, fieldName, language, search.$term);
      index += 4;
    }

    if (fieldValue.$nearSphere) {
      const point = fieldValue.$nearSphere;
      const distance = fieldValue.$maxDistance;
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_distance_sphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      sorts.push(`ST_distance_sphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) ASC`)
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }

    if (fieldValue.$within && fieldValue.$within.$box) {
      const box = fieldValue.$within.$box;
      const left = box[0].longitude;
      const bottom = box[0].latitude;
      const right = box[1].longitude;
      const top = box[1].latitude;

      patterns.push(`$${index}:name::point <@ $${index + 1}::box`);
      values.push(fieldName, `((${left}, ${bottom}), (${right}, ${top}))`);
      index += 2;
    }

    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$polygon) {
      const polygon = fieldValue.$geoWithin.$polygon;
      if (!(polygon instanceof Array)) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'bad $geoWithin value; $polygon should contain at least 3 GeoPoints'
        );
      }
      if (polygon.length < 3) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'bad $geoWithin value; $polygon should contain at least 3 GeoPoints'
        );
      }
      const points = polygon.map((point) => {
        if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value');
        } else {
          Parse.GeoPoint._validate(point.latitude, point.longitude);
        }
        return `(${point.longitude}, ${point.latitude})`;
      }).join(', ');

      patterns.push(`$${index}:name::point <@ $${index + 1}::polygon`);
      values.push(fieldName, `(${points})`);
      index += 2;
    }
    if (fieldValue.$geoIntersects && fieldValue.$geoIntersects.$point) {
      const point = fieldValue.$geoIntersects.$point;
      if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'bad $geoIntersect value; $point should be GeoPoint'
        );
      } else {
        Parse.GeoPoint._validate(point.latitude, point.longitude);
      }
      patterns.push(`$${index}:name::polygon @> $${index + 1}::point`);
      values.push(fieldName, `(${point.longitude}, ${point.latitude})`);
      index += 2;
    }

    if (fieldValue.$regex) {
      let regex = fieldValue.$regex;
      let operator = '~';
      const opts = fieldValue.$options;
      if (opts) {
        if (opts.indexOf('i') >= 0) {
          operator = '~*';
        }
        if (opts.indexOf('x') >= 0) {
          regex = removeWhiteSpace(regex);
        }
      }

      const name = transformDotField(fieldName);
      regex = processRegexPattern(regex);

      patterns.push(`$${index}:raw ${operator} '$${index + 1}:raw'`);
      values.push(name, regex);
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

    if (fieldValue.__type === 'GeoPoint') {
      patterns.push('$' + index + ':name ~= POINT($' + (index + 1) + ', $' + (index + 2) + ')');
      values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
      index += 3;
    }

    if (fieldValue.__type === 'Polygon') {
      const value = convertPolygonToSQL(fieldValue.coordinates);
      patterns.push(`$${index}:name ~= $${index + 1}::polygon`);
      values.push(fieldName, value);
      index += 2;
    }

    Object.keys(ParseToPosgresComparator).forEach(cmp => {
      if (fieldValue[cmp]) {
        const pgComparator = ParseToPosgresComparator[cmp];
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

export class PostgresStorageAdapter implements StorageAdapter {
  // Private
  _collectionPrefix: string;
  _client: any;
  _pgp: any;

  constructor({
    uri,
    collectionPrefix = '',
    databaseOptions
  }: any) {
    this._collectionPrefix = collectionPrefix;
    const { client, pgp } = createClient(uri, databaseOptions);
    this._client = client;
    this._pgp = pgp;
  }

  handleShutdown() {
    if (!this._client) {
      return;
    }
    this._client.$pool.end();
  }

  _ensureSchemaCollectionExists(conn: any) {
    conn = conn || this._client;
    return conn.none('CREATE TABLE IF NOT EXISTS "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )')
      .catch(error => {
        if (error.code === PostgresDuplicateRelationError
          || error.code === PostgresUniqueIndexViolationError
          || error.code === PostgresDuplicateObjectError) {
        // Table already exists, must have been created by a different request. Ignore error.
        } else {
          throw error;
        }
      });
  }

  classExists(name: string) {
    return this._client.one('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)', [name], a => a.exists);
  }

  setClassLevelPermissions(className: string, CLPs: any) {
    const self = this;
    return this._client.task('set-class-level-permissions', function * (t) {
      yield self._ensureSchemaCollectionExists(t);
      const values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)];
      yield t.none(`UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className"=$1`, values);
    });
  }

  setIndexesWithSchemaFormat(className: string, submittedIndexes: any, existingIndexes: any = {}, fields: any, conn: ?any): Promise<void> {
    conn = conn || this._client;
    const self = this;
    if (submittedIndexes === undefined) {
      return Promise.resolve();
    }
    if (Object.keys(existingIndexes).length === 0) {
      existingIndexes = { _id_: { _id: 1} };
    }
    const deletedIndexes = [];
    const insertedIndexes = [];
    Object.keys(submittedIndexes).forEach(name => {
      const field = submittedIndexes[name];
      if (existingIndexes[name] && field.__op !== 'Delete') {
        throw new Parse.Error(Parse.Error.INVALID_QUERY, `Index ${name} exists, cannot update.`);
      }
      if (!existingIndexes[name] && field.__op === 'Delete') {
        throw new Parse.Error(Parse.Error.INVALID_QUERY, `Index ${name} does not exist, cannot delete.`);
      }
      if (field.__op === 'Delete') {
        deletedIndexes.push(name);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!fields.hasOwnProperty(key)) {
            throw new Parse.Error(Parse.Error.INVALID_QUERY, `Field ${key} does not exist, cannot add index.`);
          }
        });
        existingIndexes[name] = field;
        insertedIndexes.push({
          key: field,
          name,
        });
      }
    });
    return conn.tx('set-indexes-with-schema-format', function * (t) {
      if (insertedIndexes.length > 0) {
        yield self.createIndexes(className, insertedIndexes, t);
      }
      if (deletedIndexes.length > 0) {
        yield self.dropIndexes(className, deletedIndexes, t);
      }
      yield self._ensureSchemaCollectionExists(t);
      yield t.none('UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className"=$1', [className, 'schema', 'indexes', JSON.stringify(existingIndexes)]);
    });
  }

  createClass(className: string, schema: SchemaType, conn: ?any) {
    conn = conn || this._client;
    return conn.tx('create-class', t => {
      const q1 = this.createTable(className, schema, t);
      const q2 = t.none('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', { className, schema });
      const q3 = this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields, t);
      return t.batch([q1, q2, q3]);
    })
      .then(() => {
        return toParseSchema(schema);
      })
      .catch(err => {
        if (err.data[0].result.code === PostgresTransactionAbortedError) {
          err = err.data[1].result;
        }
        if (err.code === PostgresUniqueIndexViolationError && err.detail.includes(className)) {
          throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, `Class ${className} already exists.`)
        }
        throw err;
      })
  }

  // Just create a table, do not insert in schema
  createTable(className: string, schema: SchemaType, conn: any) {
    conn = conn || this._client;
    const self = this;
    debug('createTable', className, schema);
    const valuesArray = [];
    const patternsArray = [];
    const fields = Object.assign({}, schema.fields);
    if (className === '_User') {
      fields._email_verify_token_expires_at = {type: 'Date'};
      fields._email_verify_token = {type: 'String'};
      fields._account_lockout_expires_at = {type: 'Date'};
      fields._failed_login_count = {type: 'Number'};
      fields._perishable_token = {type: 'String'};
      fields._perishable_token_expires_at = {type: 'Date'};
      fields._password_changed_at = {type: 'Date'};
      fields._password_history = { type: 'Array'};
    }
    let index = 2;
    const relations = [];
    Object.keys(fields).forEach((fieldName) => {
      const parseType = fields[fieldName];
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
      patternsArray.push(`$${index}:name $${index + 1}:raw`);
      if (fieldName === 'objectId') {
        patternsArray.push(`PRIMARY KEY ($${index}:name)`)
      }
      index = index + 2;
    });
    const qs = `CREATE TABLE IF NOT EXISTS $1:name (${patternsArray.join()})`;
    const values = [className, ...valuesArray];

    return conn.task('create-table', function * (t) {
      try {
        yield self._ensureSchemaCollectionExists(t);
        yield t.none(qs, values);
      } catch(error) {
        if (error.code !== PostgresDuplicateRelationError) {
          throw error;
        }
        // ELSE: Table already exists, must have been created by a different request. Ignore the error.
      }
      yield t.tx('create-table-tx', tx => {
        return tx.batch(relations.map(fieldName => {
          return tx.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {joinTable: `_Join:${fieldName}:${className}`});
        }));
      });
    });
  }

  schemaUpgrade(className: string, schema: SchemaType, conn: any) {
    debug('schemaUpgrade', { className, schema });
    conn = conn || this._client;
    const self = this;

    return conn.tx('schema-upgrade', function * (t) {
      const columns = yield t.map('SELECT column_name FROM information_schema.columns WHERE table_name = $<className>', { className }, a => a.column_name);
      const newColumns = Object.keys(schema.fields)
        .filter(item => columns.indexOf(item) === -1)
        .map(fieldName => self.addFieldIfNotExists(className, fieldName, schema.fields[fieldName], t));

      yield t.batch(newColumns);
    });
  }

  addFieldIfNotExists(className: string, fieldName: string, type: any, conn: any) {
    // TODO: Must be revised for invalid logic...
    debug('addFieldIfNotExists', {className, fieldName, type});
    conn = conn || this._client;
    const self = this;
    return conn.tx('add-field-if-not-exists', function * (t) {
      if (type.type !== 'Relation') {
        try {
          yield t.none('ALTER TABLE $<className:name> ADD COLUMN $<fieldName:name> $<postgresType:raw>', {
            className,
            fieldName,
            postgresType: parseTypeToPostgresType(type)
          });
        } catch(error) {
          if (error.code === PostgresRelationDoesNotExistError) {
            return yield self.createClass(className, {fields: {[fieldName]: type}}, t);
          }
          if (error.code !== PostgresDuplicateColumnError) {
            throw error;
          }
          // Column already exists, created by other request. Carry on to see if it's the right type.
        }
      } else {
        yield t.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {joinTable: `_Join:${fieldName}:${className}`});
      }

      const result = yield t.any('SELECT "schema" FROM "_SCHEMA" WHERE "className" = $<className> and ("schema"::json->\'fields\'->$<fieldName>) is not null', {className, fieldName});

      if (result[0]) {
        throw 'Attempted to add a field that already exists';
      } else {
        const path = `{fields,${fieldName}}`;
        yield t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {path, type, className});
      }
    });
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  deleteClass(className: string) {
    const operations = [
      {query: `DROP TABLE IF EXISTS $1:name`, values: [className]},
      {query: `DELETE FROM "_SCHEMA" WHERE "className" = $1`, values: [className]}
    ];
    return this._client.tx(t => t.none(this._pgp.helpers.concat(operations)))
      .then(() => className.indexOf('_Join:') != 0); // resolves with false when _Join table
  }

  // Delete all data known to this adapter. Used for testing.
  deleteAllClasses() {
    const now = new Date().getTime();
    const helpers = this._pgp.helpers;
    debug('deleteAllClasses');

    return this._client.task('delete-all-classes', function * (t) {
      try {
        const results = yield t.any('SELECT * FROM "_SCHEMA"');
        const joins = results.reduce((list, schema) => {
          return list.concat(joinTablesForSchema(schema.schema));
        }, []);
        const classes = ['_SCHEMA', '_PushStatus', '_JobStatus', '_JobSchedule', '_Hooks', '_GlobalConfig', '_Audience', ...results.map(result => result.className), ...joins];
        const queries = classes.map(className => ({query: 'DROP TABLE IF EXISTS $<className:name>', values: {className}}));
        yield t.tx(tx => tx.none(helpers.concat(queries)));
      } catch(error) {
        if (error.code !== PostgresRelationDoesNotExistError) {
          throw error;
        }
        // No _SCHEMA collection. Don't delete anything.
      }
    })
      .then(() => {
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
  deleteFields(className: string, schema: SchemaType, fieldNames: string[]): Promise<void> {
    debug('deleteFields', className, fieldNames);
    fieldNames = fieldNames.reduce((list, fieldName) => {
      const field = schema.fields[fieldName]
      if (field.type !== 'Relation') {
        list.push(fieldName);
      }
      delete schema.fields[fieldName];
      return list;
    }, []);

    const values = [className, ...fieldNames];
    const columns = fieldNames.map((name, idx) => {
      return `$${idx + 2}:name`;
    }).join(', DROP COLUMN');

    return this._client.tx('delete-fields', function * (t) {
      yield t.none('UPDATE "_SCHEMA" SET "schema"=$<schema> WHERE "className"=$<className>', {schema, className});
      if (values.length > 1) {
        yield t.none(`ALTER TABLE $1:name DROP COLUMN ${columns}`, values);
      }
    });
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  getAllClasses() {
    const self = this;
    return this._client.task('get-all-classes', function * (t) {
      yield self._ensureSchemaCollectionExists(t);
      return yield t.map('SELECT * FROM "_SCHEMA"', null, row => toParseSchema({ className: row.className, ...row.schema }));
    });
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  getClass(className: string) {
    debug('getClass', className);
    return this._client.any('SELECT * FROM "_SCHEMA" WHERE "className"=$<className>', { className })
      .then(result => {
        if (result.length !== 1) {
          throw undefined;
        }
        return result[0].schema;
      })
      .then(toParseSchema);
  }

  // TODO: remove the mongo format dependency in the return value
  createObject(className: string, schema: SchemaType, object: any) {
    debug('createObject', className, object);
    let columnsArray = [];
    const valuesArray = [];
    schema = toPostgresSchema(schema);
    const geoPoints = {};

    object = handleDotFields(object);

    validateKeys(object);

    Object.keys(object).forEach(fieldName => {
      if (object[fieldName] === null) {
        return;
      }
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
            fieldName === '_perishable_token' ||
            fieldName === '_password_history'){
          valuesArray.push(object[fieldName]);
        }

        if (fieldName === '_email_verify_token_expires_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }

        if (fieldName === '_account_lockout_expires_at' ||
            fieldName === '_perishable_token_expires_at' ||
            fieldName === '_password_changed_at') {
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
      case 'Bytes':
      case 'String':
      case 'Number':
      case 'Boolean':
        valuesArray.push(object[fieldName]);
        break;
      case 'File':
        valuesArray.push(object[fieldName].name);
        break;
      case 'Polygon': {
        const value = convertPolygonToSQL(object[fieldName].coordinates);
        valuesArray.push(value);
        break;
      }
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
    const initialValues = valuesArray.map((val, index) => {
      let termination = '';
      const fieldName = columnsArray[index];
      if (['_rperm','_wperm'].indexOf(fieldName) >= 0) {
        termination = '::text[]';
      } else if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        termination = '::jsonb';
      }
      return `$${index + 2 + columnsArray.length}${termination}`;
    });
    const geoPointsInjects = Object.keys(geoPoints).map((key) => {
      const value = geoPoints[key];
      valuesArray.push(value.longitude, value.latitude);
      const l = valuesArray.length + columnsArray.length;
      return `POINT($${l}, $${l + 1})`;
    });

    const columnsPattern = columnsArray.map((col, index) => `$${index + 2}:name`).join();
    const valuesPattern = initialValues.concat(geoPointsInjects).join()

    const qs = `INSERT INTO $1:name (${columnsPattern}) VALUES (${valuesPattern})`
    const values = [className, ...columnsArray, ...valuesArray]
    debug(qs, values);
    return this._client.none(qs, values)
      .then(() => ({ ops: [object] }))
      .catch(error => {
        if (error.code === PostgresUniqueIndexViolationError) {
          const err = new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
          err.underlyingError = error;
          if (error.constraint) {
            const matches = error.constraint.match(/unique_([a-zA-Z]+)/);
            if (matches && Array.isArray(matches)) {
              err.userInfo = { duplicated_field: matches[1] };
            }
          }
          error = err;
        }
        throw error;
      });
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  deleteObjectsByQuery(className: string, schema: SchemaType, query: QueryType) {
    debug('deleteObjectsByQuery', className, query);
    const values = [className];
    const index = 2;
    const where = buildWhereClause({ schema, index, query })
    values.push(...where.values);
    if (Object.keys(query).length === 0) {
      where.pattern = 'TRUE';
    }
    const qs = `WITH deleted AS (DELETE FROM $1:name WHERE ${where.pattern} RETURNING *) SELECT count(*) FROM deleted`;
    debug(qs, values);
    return this._client.one(qs, values , a => +a.count)
      .then(count => {
        if (count === 0) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        } else {
          return count;
        }
      })
      .catch(error => {
        if (error.code !== PostgresRelationDoesNotExistError) {
          throw error;
        }
        // ELSE: Don't delete anything if doesn't exist
      });
  }
  // Return value not currently well specified.
  findOneAndUpdate(className: string, schema: SchemaType, query: QueryType, update: any): Promise<any> {
    debug('findOneAndUpdate', className, query, update);
    return this.updateObjectsByQuery(className, schema, query, update)
      .then((val) => val[0]);
  }

  // Apply the update to all objects that match the given Parse Query.
  updateObjectsByQuery(className: string, schema: SchemaType, query: QueryType, update: any): Promise<[any]> {
    debug('updateObjectsByQuery', className, query, update);
    const updatePatterns = [];
    const values = [className]
    let index = 2;
    schema = toPostgresSchema(schema);

    const originalUpdate = {...update};
    update = handleDotFields(update);
    // Resolve authData first,
    // So we don't end up with multiple key updates
    for (const fieldName in update) {
      const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      if (authDataMatch) {
        var provider = authDataMatch[1];
        const value = update[fieldName];
        delete update[fieldName];
        update['authData'] = update['authData'] || {};
        update['authData'][provider] = value;
      }
    }

    for (const fieldName in update) {
      const fieldValue = update[fieldName];
      if (fieldValue === null) {
        updatePatterns.push(`$${index}:name = NULL`);
        values.push(fieldName);
        index += 1;
      } else if (fieldName == 'authData') {
        // This recursively sets the json_object
        // Only 1 level deep
        const generate = (jsonb, key, value) => {
          return `json_object_set_key(COALESCE(${jsonb}, '{}'::jsonb), ${key}, ${value})::jsonb`;
        }
        const lastKey = `$${index}:name`;
        const fieldNameIndex = index;
        index += 1;
        values.push(fieldName);
        const update = Object.keys(fieldValue).reduce((lastKey, key) => {
          const str = generate(lastKey, `$${index}::text`, `$${index + 1}::jsonb`)
          index += 2;
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
        values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
        index += 3;
      } else if (fieldValue.__type === 'Polygon') {
        const value = convertPolygonToSQL(fieldValue.coordinates);
        updatePatterns.push(`$${index}:name = $${index + 1}::polygon`);
        values.push(fieldName, value);
        index += 2;
      } else if (fieldValue.__type === 'Relation') {
        // noop
      } else if (typeof fieldValue === 'number') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'object'
                    && schema.fields[fieldName]
                    && schema.fields[fieldName].type === 'Object') {
        // Gather keys to increment
        const keysToIncrement = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set
          return originalUpdate[k].__op === 'Increment' && k.split('.').length === 2 && k.split(".")[0] === fieldName;
        }).map(k => k.split('.')[1]);

        let incrementPatterns = '';
        if (keysToIncrement.length > 0) {
          incrementPatterns = ' || ' + keysToIncrement.map((c) => {
            const amount = fieldValue[c].amount;
            return `CONCAT('{"${c}":', COALESCE($${index}:name->>'${c}','0')::int + ${amount}, '}')::jsonb`;
          }).join(' || ');
          // Strip the keys
          keysToIncrement.forEach((key) => {
            delete fieldValue[key];
          });
        }

        const keysToDelete = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set
          return originalUpdate[k].__op === 'Delete' && k.split('.').length === 2 && k.split(".")[0] === fieldName;
        }).map(k => k.split('.')[1]);

        const deletePatterns = keysToDelete.reduce((p, c, i) => {
          return p + ` - '$${index + 1 + i}:value'`;
        }, '');

        updatePatterns.push(`$${index}:name = ( COALESCE($${index}:name, '{}'::jsonb) ${deletePatterns} ${incrementPatterns} || $${index + 1 + keysToDelete.length}::jsonb )`);

        values.push(fieldName, ...keysToDelete, JSON.stringify(fieldValue));
        index += 2 + keysToDelete.length;
      } else if (Array.isArray(fieldValue)
                    && schema.fields[fieldName]
                    && schema.fields[fieldName].type === 'Array') {
        const expectedType = parseTypeToPostgresType(schema.fields[fieldName]);
        if (expectedType === 'text[]') {
          updatePatterns.push(`$${index}:name = $${index + 1}::text[]`);
        } else {
          let type = 'text';
          for (const elt of fieldValue) {
            if (typeof elt == 'object') {
              type = 'json';
              break;
            }
          }
          updatePatterns.push(`$${index}:name = array_to_json($${index + 1}::${type}[])::jsonb`);
        }
        values.push(fieldName, fieldValue);
        index += 2;
      } else {
        debug('Not supported update', fieldName, fieldValue);
        return Promise.reject(new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Postgres doesn't support update ${JSON.stringify(fieldValue)} yet`));
      }
    }

    const where = buildWhereClause({ schema, index, query })
    values.push(...where.values);

    const whereClause = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const qs = `UPDATE $1:name SET ${updatePatterns.join()} ${whereClause} RETURNING *`;
    debug('update: ', qs, values);
    return this._client.any(qs, values);
  }

  // Hopefully, we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className: string, schema: SchemaType, query: QueryType, update: any) {
    debug('upsertOneObject', {className, query, update});
    const createValue = Object.assign({}, query, update);
    return this.createObject(className, schema, createValue)
      .catch(error => {
        // ignore duplicate value errors as it's upsert
        if (error.code !== Parse.Error.DUPLICATE_VALUE) {
          throw error;
        }
        return this.findOneAndUpdate(className, schema, query, update);
      });
  }

  find(className: string, schema: SchemaType, query: QueryType, { skip, limit, sort, keys }: QueryOptions) {
    debug('find', className, query, {skip, limit, sort, keys });
    const hasLimit = limit !== undefined;
    const hasSkip = skip !== undefined;
    let values = [className];
    const where = buildWhereClause({ schema, query, index: 2 })
    values.push(...where.values);

    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const limitPattern = hasLimit ? `LIMIT $${values.length + 1}` : '';
    if (hasLimit) {
      values.push(limit);
    }
    const skipPattern = hasSkip ? `OFFSET $${values.length + 1}` : '';
    if (hasSkip) {
      values.push(skip);
    }

    let sortPattern = '';
    if (sort) {
      const sortCopy: any = sort;
      const sorting = Object.keys(sort).map((key) => {
        // Using $idx pattern gives:  non-integer constant in ORDER BY
        if (sortCopy[key] === 1) {
          return `"${key}" ASC`;
        }
        return `"${key}" DESC`;
      }).join();
      sortPattern = sort !== undefined && Object.keys(sort).length > 0 ? `ORDER BY ${sorting}` : '';
    }
    if (where.sorts && Object.keys((where.sorts: any)).length > 0) {
      sortPattern = `ORDER BY ${where.sorts.join()}`;
    }

    let columns = '*';
    if (keys) {
      // Exclude empty keys
      keys = keys.filter((key) => {
        return key.length > 0;
      });
      columns = keys.map((key, index) => {
        if (key === '$score') {
          return `ts_rank_cd(to_tsvector($${2}, $${3}:name), to_tsquery($${4}, $${5}), 32) as score`;
        }
        return `$${index + values.length + 1}:name`;
      }).join();
      values = values.concat(keys);
    }

    const qs = `SELECT ${columns} FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern}`;
    debug(qs, values);
    return this._client.any(qs, values)
      .catch(error => {
        // Query on non existing table, don't crash
        if (error.code !== PostgresRelationDoesNotExistError) {
          throw error;
        }
        return [];
      })
      .then(results => results.map(object => this.postgresObjectToParseObject(className, object, schema)));
  }

  // Converts from a postgres-format object to a REST-format object.
  // Does not strip out anything based on a lack of authentication.
  postgresObjectToParseObject(className: string, object: any, schema: any) {
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
          __type: "GeoPoint",
          latitude: object[fieldName].y,
          longitude: object[fieldName].x
        }
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'Polygon') {
        let coords = object[fieldName];
        coords = coords.substr(2, coords.length - 4).split('),(');
        coords = coords.map((point) => {
          return [
            parseFloat(point.split(',')[1]),
            parseFloat(point.split(',')[0])
          ];
        });
        object[fieldName] = {
          __type: "Polygon",
          coordinates: coords
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
    if (object._perishable_token_expires_at) {
      object._perishable_token_expires_at = { __type: 'Date', iso: object._perishable_token_expires_at.toISOString() };
    }
    if (object._password_changed_at) {
      object._password_changed_at = { __type: 'Date', iso: object._password_changed_at.toISOString() };
    }

    for (const fieldName in object) {
      if (object[fieldName] === null) {
        delete object[fieldName];
      }
      if (object[fieldName] instanceof Date) {
        object[fieldName] = { __type: 'Date', iso: object[fieldName].toISOString() };
      }
    }

    return object;
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  ensureUniqueness(className: string, schema: SchemaType, fieldNames: string[]) {
    // Use the same name for every ensureUniqueness attempt, because postgres
    // Will happily create the same index with multiple names.
    const constraintName = `unique_${fieldNames.sort().join('_')}`;
    const constraintPatterns = fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `ALTER TABLE $1:name ADD CONSTRAINT $2:name UNIQUE (${constraintPatterns.join()})`;
    return this._client.none(qs, [className, constraintName, ...fieldNames])
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
  count(className: string, schema: SchemaType, query: QueryType) {
    debug('count', className, query);
    const values = [className];
    const where = buildWhereClause({ schema, query, index: 2 });
    values.push(...where.values);

    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const qs = `SELECT count(*) FROM $1:name ${wherePattern}`;
    return this._client.one(qs, values, a => +a.count)
      .catch(error => {
        if (error.code !== PostgresRelationDoesNotExistError) {
          throw error;
        }
        return 0;
      });
  }

  distinct(className: string, schema: SchemaType, query: QueryType, fieldName: string) {
    debug('distinct', className, query);
    let field = fieldName;
    let column = fieldName;
    if (fieldName.indexOf('.') >= 0) {
      field = transformDotFieldToComponents(fieldName).join('->');
      column = fieldName.split('.')[0];
    }
    const isArrayField = schema.fields
          && schema.fields[fieldName]
          && schema.fields[fieldName].type === 'Array';
    const isPointerField = schema.fields
          && schema.fields[fieldName]
          && schema.fields[fieldName].type === 'Pointer';
    const values = [field, column, className];
    const where = buildWhereClause({ schema, query, index: 4 });
    values.push(...where.values);

    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const transformer = isArrayField ? 'jsonb_array_elements' : 'ON';
    const qs = `SELECT DISTINCT ${transformer}($1:raw) $2:raw FROM $3:name ${wherePattern}`;
    debug(qs, values);
    return this._client.any(qs, values)
      .catch((error) => {
        if (error.code === PostgresMissingColumnError) {
          return [];
        }
        throw error;
      })
      .then((results) => {
        if (fieldName.indexOf('.') === -1) {
          results = results.filter((object) => object[field] !== null);
          return results.map(object => {
            if (!isPointerField) {
              return object[field];
            }
            return {
              __type: 'Pointer',
              className:  schema.fields[fieldName].targetClass,
              objectId: object[field]
            };
          });
        }
        const child = fieldName.split('.')[1];
        return results.map(object => object[column][child]);
      })
      .then(results => results.map(object => this.postgresObjectToParseObject(className, object, schema)));
  }

  aggregate(className: string, schema: any, pipeline: any) {
    debug('aggregate', className, pipeline);
    const values = [className];
    let columns: string[] = [];
    let countField = null;
    let wherePattern = '';
    let limitPattern = '';
    let skipPattern = '';
    let sortPattern = '';
    let groupPattern = '';
    for (let i = 0; i < pipeline.length; i += 1) {
      const stage = pipeline[i];
      if (stage.$group) {
        for (const field in stage.$group) {
          const value = stage.$group[field];
          if (value === null || value === undefined) {
            continue;
          }
          if (field === '_id') {
            columns.push(`${transformAggregateField(value)} AS "objectId"`);
            groupPattern = `GROUP BY ${transformAggregateField(value)}`;
            continue;
          }
          if (value.$sum) {
            if (typeof value.$sum === 'string') {
              columns.push(`SUM(${transformAggregateField(value.$sum)}) AS "${field}"`);
            } else {
              countField = field;
              columns.push(`COUNT(*) AS "${field}"`);
            }
          }
          if (value.$max) {
            columns.push(`MAX(${transformAggregateField(value.$max)}) AS "${field}"`);
          }
          if (value.$min) {
            columns.push(`MIN(${transformAggregateField(value.$min)}) AS "${field}"`);
          }
          if (value.$avg) {
            columns.push(`AVG(${transformAggregateField(value.$avg)}) AS "${field}"`);
          }
        }
      } else {
        columns.push('*');
      }
      if (stage.$project) {
        if (columns.includes('*')) {
          columns = [];
        }
        for (const field in stage.$project) {
          const value = stage.$project[field];
          if ((value === 1 || value === true)) {
            columns.push(field);
          }
        }
      }
      if (stage.$match) {
        const patterns = [];
        for (const field in stage.$match) {
          const value = stage.$match[field];
          Object.keys(ParseToPosgresComparator).forEach(cmp => {
            if (value[cmp]) {
              const pgComparator = ParseToPosgresComparator[cmp];
              patterns.push(`${field} ${pgComparator} ${value[cmp]}`);
            }
          });
        }
        wherePattern = patterns.length > 0 ? `WHERE ${patterns.join(' ')}` : '';
      }
      if (stage.$limit) {
        limitPattern = `LIMIT ${stage.$limit}`;
      }
      if (stage.$skip) {
        skipPattern = `OFFSET ${stage.$skip}`;
      }
      if (stage.$sort) {
        const sort = stage.$sort;
        const sorting = Object.keys(sort).map((key) => {
          if (sort[key] === 1) {
            return `"${key}" ASC`;
          }
          return `"${key}" DESC`;
        }).join();
        sortPattern = sort !== undefined && Object.keys(sort).length > 0 ? `ORDER BY ${sorting}` : '';
      }
    }

    const qs = `SELECT ${columns.join()} FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern} ${groupPattern}`;
    debug(qs, values);
    return this._client.map(qs, values, a => this.postgresObjectToParseObject(className, a, schema))
      .then(results => {
        if (countField) {
          results[0][countField] = parseInt(results[0][countField], 10);
        }
        results.forEach(result => {
          if (!result.hasOwnProperty('objectId')) {
            result.objectId = null;
          }
        });
        return results;
      });
  }

  performInitialization({ VolatileClassesSchemas }: any) {
    // TODO: This method needs to be rewritten to make proper use of connections (@vitaly-t)
    debug('performInitialization');
    const promises = VolatileClassesSchemas.map((schema) => {
      return this.createTable(schema.className, schema)
        .catch((err) => {
          if (err.code === PostgresDuplicateRelationError || err.code === Parse.Error.INVALID_CLASS_NAME) {
            return Promise.resolve();
          }
          throw err;
        })
        .then(() => this.schemaUpgrade(schema.className, schema));
    });
    return Promise.all(promises)
      .then(() => {
        return this._client.tx('perform-initialization', t => {
          return t.batch([
            t.none(sql.misc.jsonObjectSetKeys),
            t.none(sql.array.add),
            t.none(sql.array.addUnique),
            t.none(sql.array.remove),
            t.none(sql.array.containsAll),
            t.none(sql.array.contains)
          ]);
        });
      })
      .then(data => {
        debug(`initializationDone in ${data.duration}`);
      })
      .catch(error => {
        /* eslint-disable no-console */
        console.error(error);
      });
  }

  createIndexes(className: string, indexes: any, conn: ?any): Promise<void> {
    return (conn || this._client).tx(t => t.batch(indexes.map(i => {
      return t.none('CREATE INDEX $1:name ON $2:name ($3:name)', [i.name, className, i.key]);
    })));
  }

  createIndexesIfNeeded(className: string, fieldName: string, type: any, conn: ?any): Promise<void> {
    return (conn || this._client).none('CREATE INDEX $1:name ON $2:name ($3:name)', [fieldName, className, type]);
  }

  dropIndexes(className: string, indexes: any, conn: any): Promise<void> {
    const queries = indexes.map(i => ({query: 'DROP INDEX $1:name', values: i}));
    return (conn || this._client).tx(t => t.none(this._pgp.helpers.concat(queries)));
  }

  getIndexes(className: string) {
    const qs = 'SELECT * FROM pg_indexes WHERE tablename = ${className}';
    return this._client.any(qs, {className});
  }

  updateSchemaWithIndexes(): Promise<void> {
    return Promise.resolve();
  }
}

function convertPolygonToSQL(polygon) {
  if (polygon.length < 3) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      `Polygon must have at least 3 values`
    );
  }
  if (polygon[0][0] !== polygon[polygon.length - 1][0] ||
    polygon[0][1] !== polygon[polygon.length - 1][1]) {
    polygon.push(polygon[0]);
  }
  const unique = polygon.filter((item, index, ar) => {
    let foundIndex = -1;
    for (let i = 0; i < ar.length; i += 1) {
      const pt = ar[i];
      if (pt[0] === item[0] &&
          pt[1] === item[1]) {
        foundIndex = i;
        break;
      }
    }
    return foundIndex === index;
  });
  if (unique.length < 3) {
    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      'GeoJSON: Loop must have at least 3 different vertices'
    );
  }
  const points = polygon.map((point) => {
    Parse.GeoPoint._validate(parseFloat(point[1]), parseFloat(point[0]));
    return `(${point[1]}, ${point[0]})`;
  }).join(', ');
  return `(${points})`;
}

function removeWhiteSpace(regex) {
  if (!regex.endsWith('\n')){
    regex += '\n';
  }

  // remove non escaped comments
  return regex.replace(/([^\\])#.*\n/gmi, '$1')
    // remove lines starting with a comment
    .replace(/^#.*\n/gmi, '')
    // remove non escaped whitespace
    .replace(/([^\\])\s+/gmi, '$1')
    // remove whitespace at the beginning of a line
    .replace(/^\s+/, '')
    .trim();
}

function processRegexPattern(s) {
  if (s && s.startsWith('^')){
    // regex for startsWith
    return '^' + literalizeRegexPart(s.slice(1));

  } else if (s && s.endsWith('$')) {
    // regex for endsWith
    return literalizeRegexPart(s.slice(0, s.length - 1)) + '$';
  }

  // regex for contains
  return literalizeRegexPart(s);
}

function createLiteralRegex(remaining) {
  return remaining.split('').map(c => {
    if (c.match(/[0-9a-zA-Z]/) !== null) {
      // don't escape alphanumeric characters
      return c;
    }
    // escape everything else (single quotes with single quotes, everything else with a backslash)
    return c === `'` ? `''` : `\\${c}`;
  }).join('');
}

function literalizeRegexPart(s: string) {
  const matcher1 = /\\Q((?!\\E).*)\\E$/
  const result1: any = s.match(matcher1);
  if(result1 && result1.length > 1 && result1.index > -1) {
    // process regex that has a beginning and an end specified for the literal text
    const prefix = s.substr(0, result1.index);
    const remaining = result1[1];

    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // process regex that has a beginning specified for the literal text
  const matcher2 = /\\Q((?!\\E).*)$/
  const result2: any = s.match(matcher2);
  if(result2 && result2.length > 1 && result2.index > -1){
    const prefix = s.substr(0, result2.index);
    const remaining = result2[1];

    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // remove all instances of \Q and \E from the remaining text & escape single quotes
  return (
    s.replace(/([^\\])(\\E)/, '$1')
      .replace(/([^\\])(\\Q)/, '$1')
      .replace(/^\\E/, '')
      .replace(/^\\Q/, '')
      .replace(/([^'])'/, `$1''`)
      .replace(/^'([^'])/, `''$1`)
  );
}

export default PostgresStorageAdapter;
