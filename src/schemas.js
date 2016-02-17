// schemas.js

var express = require('express'),
    Parse = require('parse/node').Parse,
    PromiseRouter = require('./PromiseRouter'),
    Schema = require('./Schema');

var router = new PromiseRouter();

function masterKeyRequiredResponse() {
  return Promise.resolve({
    status: 401,
    response: {error: 'master key not specified'},
  })
}

function classNameMismatchResponse(bodyClass, pathClass) {
  return Promise.resolve({
    status: 400,
    response: {
      code: Parse.Error.INVALID_CLASS_NAME,
      error: 'class name mismatch between ' + bodyClass + ' and ' + pathClass,
    }
  });
}

function mongoSchemaAPIResponseFields(schema) {
  var fieldNames = Object.keys(schema).filter(key => key !== '_id' && key !== '_metadata');
  var response = fieldNames.reduce((obj, fieldName) => {
    obj[fieldName] = Schema.mongoFieldTypeToSchemaAPIType(schema[fieldName])
    return obj;
  }, {});
  response.ACL = {type: 'ACL'};
  response.createdAt = {type: 'Date'};
  response.updatedAt = {type: 'Date'};
  response.objectId = {type: 'String'};
  return response;
}

function mongoSchemaToSchemaAPIResponse(schema) {
  return {
    className: schema._id,
    fields: mongoSchemaAPIResponseFields(schema),
  };
}

function getAllSchemas(req) {
  if (!req.auth.isMaster) {
    return masterKeyRequiredResponse();
  }
  return req.config.database.collection('_SCHEMA')
  .then(coll => coll.find({}).toArray())
  .then(schemas => ({response: {
    results: schemas.map(mongoSchemaToSchemaAPIResponse)
  }}));
}

function getOneSchema(req) {
  if (!req.auth.isMaster) {
    return masterKeyRequiredResponse();
  }
  return req.config.database.collection('_SCHEMA')
  .then(coll => coll.findOne({'_id': req.params.className}))
  .then(schema => ({response: mongoSchemaToSchemaAPIResponse(schema)}))
  .catch(() => ({
    status: 400,
    response: {
      code: 103,
      error: 'class ' + req.params.className + ' does not exist',
    }
  }));
}

function createSchema(req) {
  if (!req.auth.isMaster) {
    return masterKeyRequiredResponse();
  }
  if (req.params.className && req.body.className) {
    if (req.params.className != req.body.className) {
      return classNameMismatchResponse(req.body.className, req.params.className);
    }
  }
  var className = req.params.className || req.body.className;
  if (!className) {
    return Promise.resolve({
      status: 400,
      response: {
        code: 135,
        error: 'POST ' + req.path + ' needs class name',
      },
    });
  }
  return req.config.database.loadSchema()
  .then(schema => schema.addClassIfNotExists(className, req.body.fields))
  .then(result => ({ response: mongoSchemaToSchemaAPIResponse(result) }))
  .catch(error => ({
    status: 400,
    response: error,
  }));
}

function modifySchema(req) {
  if (!req.auth.isMaster) {
    return masterKeyRequiredResponse();
  }

  if (req.body.className && req.body.className != req.params.className) {
    return classNameMismatchResponse(req.body.className, req.params.className);
  }

  var submittedFields = req.body.fields || {};
  var className = req.params.className;

  return req.config.database.loadSchema()
  .then(schema => {
    if (!schema.data[className]) {
      return Promise.resolve({
        status: 400,
        response: {
          code: Parse.Error.INVALID_CLASS_NAME,
          error: 'class ' + req.params.className + ' does not exist',
        }
      });
    }
    var existingFields = schema.data[className];

    for (var submittedFieldName in submittedFields) {
      if (existingFields[submittedFieldName] && submittedFields[submittedFieldName].__op !== 'Delete') {
        return Promise.resolve({
          status: 400,
          response: {
            code: 255,
            error: 'field ' + submittedFieldName + ' exists, cannot update',
          }
        });
      }

      if (!existingFields[submittedFieldName] && submittedFields[submittedFieldName].__op === 'Delete') {
        return Promise.resolve({
          status: 400,
          response: {
            code: 255,
            error: 'field ' + submittedFieldName + ' does not exist, cannot delete',
          }
        });
      }
    }

    var newSchema = Schema.buildMergedSchemaObject(existingFields, submittedFields);
    var mongoObject = Schema.mongoSchemaFromFieldsAndClassName(newSchema, className);
    if (!mongoObject.result) {
      return Promise.resolve({
        status: 400,
        response: mongoObject,
      });
    }

    // Finally we have checked to make sure the request is valid and we can start deleting fields.
    // Do all deletions first, then a single save to _SCHEMA collection to handle all additions.
    var deletionPromises = []
    Object.keys(submittedFields).forEach(submittedFieldName => {
      if (submittedFields[submittedFieldName].__op === 'Delete') {
        var promise = req.config.database.connect()
        .then(() => schema.deleteField(
          submittedFieldName,
          className,
          req.config.database.db,
          req.config.database.collectionPrefix
        ));
        deletionPromises.push(promise);
      }
    });

    return Promise.all(deletionPromises)
    .then(() => new Promise((resolve, reject) => {
      schema.collection.update({_id: className}, mongoObject.result, {w: 1}, (err, docs) => {
        if (err) {
          reject(err);
        }
        resolve({ response: mongoSchemaToSchemaAPIResponse(mongoObject.result)});
      })
    }));
  });
}

router.route('GET', '/schemas', getAllSchemas);
router.route('GET', '/schemas/:className', getOneSchema);
router.route('POST', '/schemas', createSchema);
router.route('POST', '/schemas/:className', createSchema);
router.route('PUT', '/schemas/:className', modifySchema);

module.exports = router;
