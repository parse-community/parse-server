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

function getAllSchemas(req) {
  return req.config.database.schemaCollection()
    .then(collection => collection.getAllSchemas())
    .then(schemas => schemas.map(Schema.mongoSchemaToSchemaAPIResponse))
    .then(schemas => ({ response: { results: schemas } }));
}

function getOneSchema(req) {
  const className = req.params.className;
  return req.config.database.schemaCollection()
    .then(collection => collection.findSchema(className))
    .then(mongoSchema => {
      if (!mongoSchema) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      }
      return { response: Schema.mongoSchemaToSchemaAPIResponse(mongoSchema) };
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
    .then(schema => schema.addClassIfNotExists(className, req.body.fields))
    .then(result => ({ response: Schema.mongoSchemaToSchemaAPIResponse(result) }));
}

function modifySchema(req) {
  if (req.body.className && req.body.className != req.params.className) {
    return classNameMismatchResponse(req.body.className, req.params.className);
  }

  var submittedFields = req.body.fields || {};
  var className = req.params.className;

  return req.config.database.loadSchema()
    .then(schema => {
      if (!schema.data[className]) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${req.params.className} does not exist.`);
      }

      let existingFields = Object.assign(schema.data[className], { _id: className });
      Object.keys(submittedFields).forEach(name => {
        let field = submittedFields[name];
        if (existingFields[name] && field.__op !== 'Delete') {
          throw new Parse.Error(255, `Field ${name} exists, cannot update.`);
        }
        if (!existingFields[name] && field.__op === 'Delete') {
          throw new Parse.Error(255, `Field ${name} does not exist, cannot delete.`);
        }
      });

      let newSchema = Schema.buildMergedSchemaObject(existingFields, submittedFields);
      let mongoObject = Schema.mongoSchemaFromFieldsAndClassName(newSchema, className);
      if (!mongoObject.result) {
        throw new Parse.Error(mongoObject.code, mongoObject.error);
      }

      // Finally we have checked to make sure the request is valid and we can start deleting fields.
      // Do all deletions first, then add fields to avoid duplicate geopoint error.
      let deletePromises = [];
      let insertedFields = [];
      Object.keys(submittedFields).forEach(fieldName => {
        if (submittedFields[fieldName].__op === 'Delete') {
          const promise = schema.deleteField(fieldName, className, req.config.database);
          deletePromises.push(promise);
        } else {
          insertedFields.push(fieldName);
        }
      });
      return Promise.all(deletePromises) // Delete Everything
        .then(() => schema.reloadData()) // Reload our Schema, so we have all the new values
        .then(() => {
          let promises = insertedFields.map(fieldName => {
            const mongoType = mongoObject.result[fieldName];
            return schema.validateField(className, fieldName, mongoType);
          });
          return Promise.all(promises);
        })
        .then(() => ({ response: Schema.mongoSchemaToSchemaAPIResponse(mongoObject.result) }));
    });
}

function setSchemaPermissions(req) {
  var className = req.params.className;
  return req.config.database.loadSchema()
    .then(schema => {
      return schema.setPermissions(className, req.body);
  }).then((res) => {
    return Promise.resolve({response: {}});
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

  return req.config.database.collectionExists(req.params.className)
    .then(exist => {
      if (!exist) {
        return Promise.resolve();
      }
      return req.config.database.adaptiveCollection(req.params.className)
        .then(collection => {
          return collection.count()
            .then(count => {
              if (count > 0) {
                throw new Parse.Error(255, `Class ${req.params.className} is not empty, contains ${count} objects, cannot drop schema.`);
              }
              return collection.drop();
            })
        })
    })
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
    this.route('GET', '/schemas/:className/permissions', middleware.promiseEnforceMasterKeyAccess, getSchemaPermissions);
    this.route('PUT', '/schemas/:className/permissions', middleware.promiseEnforceMasterKeyAccess, setSchemaPermissions);
    this.route('DELETE', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, deleteSchema);
  }
}
