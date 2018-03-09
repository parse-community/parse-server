'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SchemasRouter = undefined;

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

var _middlewares = require('../middlewares');

var middleware = _interopRequireWildcard(_middlewares);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// schemas.js

var Parse = require('parse/node').Parse,
    SchemaController = require('../Controllers/SchemaController');

function classNameMismatchResponse(bodyClass, pathClass) {
  throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class name mismatch between ${bodyClass} and ${pathClass}.`);
}

function getAllSchemas(req) {
  return req.config.database.loadSchema({ clearCache: true }).then(schemaController => schemaController.getAllClasses(true)).then(schemas => ({ response: { results: schemas } }));
}

function getOneSchema(req) {
  const className = req.params.className;
  return req.config.database.loadSchema({ clearCache: true }).then(schemaController => schemaController.getOneSchema(className, true)).then(schema => ({ response: schema })).catch(error => {
    if (error === undefined) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
    } else {
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error.');
    }
  });
}

function createSchema(req) {
  if (req.auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'read-only masterKey isn\'t allowed to create a schema.');
  }
  if (req.params.className && req.body.className) {
    if (req.params.className != req.body.className) {
      return classNameMismatchResponse(req.body.className, req.params.className);
    }
  }

  const className = req.params.className || req.body.className;
  if (!className) {
    throw new Parse.Error(135, `POST ${req.path} needs a class name.`);
  }

  return req.config.database.loadSchema({ clearCache: true }).then(schema => schema.addClassIfNotExists(className, req.body.fields, req.body.classLevelPermissions, req.body.indexes)).then(schema => ({ response: schema }));
}

function modifySchema(req) {
  if (req.auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'read-only masterKey isn\'t allowed to update a schema.');
  }
  if (req.body.className && req.body.className != req.params.className) {
    return classNameMismatchResponse(req.body.className, req.params.className);
  }

  const submittedFields = req.body.fields || {};
  const className = req.params.className;

  return req.config.database.loadSchema({ clearCache: true }).then(schema => schema.updateClass(className, submittedFields, req.body.classLevelPermissions, req.body.indexes, req.config.database)).then(result => ({ response: result }));
}

const deleteSchema = req => {
  if (req.auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'read-only masterKey isn\'t allowed to delete a schema.');
  }
  if (!SchemaController.classNameIsValid(req.params.className)) {
    throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, SchemaController.invalidClassNameMessage(req.params.className));
  }
  return req.config.database.deleteSchema(req.params.className).then(() => ({ response: {} }));
};

class SchemasRouter extends _PromiseRouter2.default {
  mountRoutes() {
    this.route('GET', '/schemas', middleware.promiseEnforceMasterKeyAccess, getAllSchemas);
    this.route('GET', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, getOneSchema);
    this.route('POST', '/schemas', middleware.promiseEnforceMasterKeyAccess, createSchema);
    this.route('POST', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, createSchema);
    this.route('PUT', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, modifySchema);
    this.route('DELETE', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, deleteSchema);
  }
}
exports.SchemasRouter = SchemasRouter;