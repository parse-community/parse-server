// schemas.js

var express = require('express'),
  Parse = require('parse/node').Parse,
  Schema = require('../Schema');

import PromiseRouter   from '../PromiseRouter';
import * as middleware from "../middlewares";

function classNameMismatchResponse(bodyClass, pathClass) {
  throw new Parse.Error(
    Parse.Error.INVALID_CLASS_NAME,
    `Class name mismatch between ${bodyClass} and ${pathClass}.`
  );
}

function injectDefaultSchema(schema) {
  let defaultSchema = Schema.defaultColumns[schema.className];
  if (defaultSchema) {
    Object.keys(defaultSchema).forEach((key) => {
      schema.fields[key] = defaultSchema[key];
    });
  }
  return schema;
}

function getAllSchemas(req) {
  return req.config.database.schemaCollection()
    .then(collection => collection.getAllSchemas())
    .then(schemas => schemas.map(injectDefaultSchema))
    .then(schemas => ({ response: { results: schemas } }));
}

function getOneSchema(req) {
  const className = req.params.className;
  return req.config.database.schemaCollection()
    .then(collection => collection.findSchema(className))
    .then(injectDefaultSchema)
    .then(schema => ({ response: schema }))
    .catch(error => {
      if (error === undefined) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      } else {
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error.');
      }
    });
}

function createSchema(req) {
  if (req.params.className && req.body.className) {
    if (req.params.className != req.body.className) {
      return classNameMismatchResponse(req.body.className, req.params.className);
    }
  }

  const className = req.params.className || req.body.className;
  if (!className) {
    throw new Parse.Error(135, `POST ${req.path} needs a class name.`);
  }

  return req.config.database.loadSchema()
    .then(schema => schema.addClassIfNotExists(className, req.body.fields,  req.body.classLevelPermissions))
    .then(schema => ({ response: schema }));
}

function modifySchema(req) {
  if (req.body.className && req.body.className != req.params.className) {
    return classNameMismatchResponse(req.body.className, req.params.className);
  }

  let submittedFields = req.body.fields || {};
  let className = req.params.className;

  return req.config.database.loadSchema()
    .then(schema => {
      return schema.updateClass(className, submittedFields, req.body.classLevelPermissions, req.config.database);
    }).then((result) => {
        return Promise.resolve({response: result});
    });
}

function getSchemaPermissions(req) {
  var className = req.params.className;
  return req.config.database.loadSchema()
    .then(schema => {
      return Promise.resolve({response: schema.perms[className]});
  });
}

// A helper function that removes all join tables for a schema. Returns a promise.
var removeJoinTables = (database, mongoSchema) => {
  return Promise.all(Object.keys(mongoSchema)
    .filter(field => mongoSchema[field].startsWith('relation<'))
    .map(field => {
      let collectionName = `_Join:${field}:${mongoSchema._id}`;
      return database.dropCollection(collectionName);
    })
  );
};

function deleteSchema(req) {
  if (!Schema.classNameIsValid(req.params.className)) {
    throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, Schema.invalidClassNameMessage(req.params.className));
  }

  return req.config.database.deleteSchema(req.params.className)
    .then(() => {
      // We've dropped the collection now, so delete the item from _SCHEMA
      // and clear the _Join collections
      return req.config.database.schemaCollection()
        .then(coll => coll.findAndDeleteSchema(req.params.className))
        .then(document => {
          if (document === null) {
            //tried to delete non-existent class
            return Promise.resolve();
          }
          return removeJoinTables(req.config.database, document);
        });
    })
    .then(() => {
      // Success
      return { response: {} };
    }, error => {
      if (error.message == 'ns not found') {
        // If they try to delete a non-existent class, that's fine, just let them.
        return { response: {} };
      }

      return Promise.reject(error);
    });
}

export class SchemasRouter extends PromiseRouter {
  mountRoutes() {
    this.route('GET', '/schemas', middleware.promiseEnforceMasterKeyAccess, getAllSchemas);
    this.route('GET', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, getOneSchema);
    this.route('POST', '/schemas', middleware.promiseEnforceMasterKeyAccess, createSchema);
    this.route('POST', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, createSchema);
    this.route('PUT', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, modifySchema);
    this.route('DELETE', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, deleteSchema);
  }
}
