// schemas.js

var express = require('express'),
    PromiseRouter = require('./PromiseRouter');

var router = new PromiseRouter();

function mongoFieldTypeToSchemaAPIType(type) {
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
    case 'number':   return {type: 'Number'};
    case 'string':   return {type: 'String'};
    case 'boolean':  return {type: 'Boolean'};
    case 'date':     return {type: 'Date'};
    case 'object':   return {type: 'Object'};
    case 'array':    return {type: 'Array'};
    case 'geopoint': return {type: 'GeoPoint'};
    case 'file':     return {type: 'File'};
  }
}

function mongoSchemaAPIResponseFields(schema) {
  fieldNames = Object.keys(schema).filter(key => key !== '_id');
  response = {};
  fieldNames.forEach(fieldName => {
    response[fieldName] = mongoFieldTypeToSchemaAPIType(schema[fieldName]);
  });
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
    return Promise.resolve({
      status: 401,
      response: {error: 'unauthorized'},
    });
  }
  return req.config.database.collection('_SCHEMA')
  .then(coll => coll.find({}).toArray())
  .then(schemas => ({response: {
    results: schemas.map(mongoSchemaToSchemaAPIResponse)
  }}));
}

function getOneSchema(req) {
  if (!req.auth.isMaster) {
    return Promise.resolve({
      status: 401,
      response: {error: 'unauthorized'},
    });
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

router.route('GET', '/schemas', getAllSchemas);
router.route('GET', '/schemas/:className', getOneSchema);

module.exports = router;
