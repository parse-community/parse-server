'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SchemasRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _PromiseRouter2 = require('../PromiseRouter');

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

var _middlewares = require('../middlewares');

var middleware = _interopRequireWildcard(_middlewares);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

// schemas.js

var express = require('express'),
    Parse = require('parse/node').Parse,
    SchemaController = require('../Controllers/SchemaController');

function classNameMismatchResponse(bodyClass, pathClass) {
  throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, 'Class name mismatch between ' + bodyClass + ' and ' + pathClass + '.');
}

function getAllSchemas(req) {
  return req.config.database.loadSchema({ clearCache: true }).then(function (schemaController) {
    return schemaController.getAllClasses(true);
  }).then(function (schemas) {
    return { response: { results: schemas } };
  });
}

function getOneSchema(req) {
  var className = req.params.className;
  return req.config.database.loadSchema({ clearCache: true }).then(function (schemaController) {
    return schemaController.getOneSchema(className, true);
  }).then(function (schema) {
    return { response: schema };
  }).catch(function (error) {
    if (error === undefined) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, 'Class ' + className + ' does not exist.');
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

  var className = req.params.className || req.body.className;
  if (!className) {
    throw new Parse.Error(135, 'POST ' + req.path + ' needs a class name.');
  }

  return req.config.database.loadSchema({ clearCache: true }).then(function (schema) {
    return schema.addClassIfNotExists(className, req.body.fields, req.body.classLevelPermissions);
  }).then(function (schema) {
    return { response: schema };
  });
}

function modifySchema(req) {
  if (req.body.className && req.body.className != req.params.className) {
    return classNameMismatchResponse(req.body.className, req.params.className);
  }

  var submittedFields = req.body.fields || {};
  var className = req.params.className;

  return req.config.database.loadSchema({ clearCache: true }).then(function (schema) {
    return schema.updateClass(className, submittedFields, req.body.classLevelPermissions, req.config.database);
  }).then(function (result) {
    return { response: result };
  });
}

var deleteSchema = function deleteSchema(req) {
  if (!SchemaController.classNameIsValid(req.params.className)) {
    throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, SchemaController.invalidClassNameMessage(req.params.className));
  }
  return req.config.database.deleteSchema(req.params.className).then(function () {
    return { response: {} };
  });
};

var SchemasRouter = exports.SchemasRouter = function (_PromiseRouter) {
  _inherits(SchemasRouter, _PromiseRouter);

  function SchemasRouter() {
    _classCallCheck(this, SchemasRouter);

    return _possibleConstructorReturn(this, (SchemasRouter.__proto__ || Object.getPrototypeOf(SchemasRouter)).apply(this, arguments));
  }

  _createClass(SchemasRouter, [{
    key: 'mountRoutes',
    value: function mountRoutes() {
      this.route('GET', '/schemas', middleware.promiseEnforceMasterKeyAccess, getAllSchemas);
      this.route('GET', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, getOneSchema);
      this.route('POST', '/schemas', middleware.promiseEnforceMasterKeyAccess, createSchema);
      this.route('POST', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, createSchema);
      this.route('PUT', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, modifySchema);
      this.route('DELETE', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, deleteSchema);
    }
  }]);

  return SchemasRouter;
}(_PromiseRouter3.default);