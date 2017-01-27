'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ImportRouter = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _middlewares = require('../middlewares');

var middlewares = _interopRequireWildcard(_middlewares);

var _multer = require('multer');

var _multer2 = _interopRequireDefault(_multer);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _node = require('parse/node');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var ImportRouter = exports.ImportRouter = function () {
  function ImportRouter() {
    _classCallCheck(this, ImportRouter);
  }

  _createClass(ImportRouter, [{
    key: 'getOneSchema',
    value: function getOneSchema(req) {

      var className = req.params.className;

      return req.config.database.loadSchema({ clearCache: true }).then(function (schemaController) {
        return schemaController.getOneSchema(className);
      }).catch(function (error) {
        if (error === undefined) {
          return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_CLASS_NAME, 'Class ' + className + ' does not exist.'));
        } else {
          return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error.'));
        }
      });
    }
  }, {
    key: 'importRestObject',
    value: function importRestObject(req, restObject, targetClass) {

      if (targetClass) {
        return _rest2.default.update(req.config, req.auth, req.params.className, restObject.owningId, _defineProperty({}, req.params.relationName, {
          "__op": "AddRelation",
          "objects": [{ "__type": "Pointer", "className": targetClass, "objectId": restObject.relatedId }]
        }), req.info.clientSDK).catch(function (error) {
          if (error.code === _node.Parse.Error.OBJECT_NOT_FOUND) {
            return Promise.reject(new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found'));
          } else {
            return Promise.reject(error);
          }
        });
      }

      if (restObject.createdAt) {
        delete restObject.createdAt;
      }

      if (restObject.updatedAt) {
        delete restObject.updatedAt;
      }

      if (restObject.objectId) {
        return _rest2.default.update(req.config, req.auth, req.params.className, restObject.objectId, restObject).catch(function (error) {
          if (error.code === _node.Parse.Error.OBJECT_NOT_FOUND) {
            return _rest2.default.create(req.config, req.auth, req.params.className, restObject, req.info.clientSDK, { allowObjectId: true });
          } else {
            return Promise.reject(error);
          }
        });
      }

      return _rest2.default.create(req.config, req.auth, req.params.className, restObject);
    }
  }, {
    key: 'getRestObjects',
    value: function getRestObjects(req) {
      return new Promise(function (resolve) {

        var restObjects = [];
        var importFile = void 0;

        try {
          importFile = JSON.parse(req.file.buffer.toString());
        } catch (e) {
          throw new Error('Failed to parse JSON based on the file sent');
        }

        if (Array.isArray(importFile)) {
          restObjects = importFile;
        } else if (Array.isArray(importFile.results)) {
          restObjects = importFile.results;
        } else if (Array.isArray(importFile.rows)) {
          restObjects = importFile.rows;
        }

        if (!restObjects) {
          throw new Error('No data to import');
        }

        if (req.body.feedbackEmail) {
          if (!req.config.emailControllerAdapter) {
            throw new Error('You have to setup a Mail Adapter.');
          }
        }

        resolve(restObjects);
      });
    }
  }, {
    key: 'handleImport',
    value: function handleImport(req) {
      var _this = this;

      var promise = null;

      if (req.params.relationName) {
        promise = this.getOneSchema(req).then(function (response) {
          if (!response.fields.hasOwnProperty(req.params.relationName)) {
            throw new Error('Relation ' + req.params.relationName + ' does not exist in ' + req.params.className + '.');
          } else if (response.fields[req.params.relationName].type !== 'Relation') {
            throw new Error('Class ' + response.fields[req.params.relationName].targetClass + ' does not have Relation type.');
          }

          var targetClass = response.fields[req.params.relationName].targetClass;

          return Promise.all([_this.getRestObjects(req), targetClass]);
        });
      } else {
        promise = Promise.all([this.getRestObjects(req)]);
      }

      promise = promise.then(function (_ref) {
        var _ref2 = _slicedToArray(_ref, 2),
            restObjects = _ref2[0],
            targetClass = _ref2[1];

        return restObjects.reduce(function (item, object, index) {

          item.pageArray.push(_this.importRestObject.bind(_this, req, object, targetClass));

          if (index && index % 100 === 0 || index === restObjects.length - 1) {
            (function () {

              var pageArray = item.pageArray.slice(0);
              item.pageArray = [];

              item.mainPromise = item.mainPromise.then(function (results) {
                return Promise.all(results.concat(pageArray.map(function (func) {
                  return func();
                })));
              });
            })();
          }

          return item;
        }, { pageArray: [], mainPromise: Promise.resolve([]) }).mainPromise;
      }).then(function (results) {

        if (req.body.feedbackEmail) {
          req.config.emailControllerAdapter.sendMail({
            text: 'We have successfully imported your data to the class ' + req.params.className + (req.params.relationName ? ', relation ' + req.params.relationName : '') + '.',
            to: req.body.feedbackEmail,
            subject: 'Import completed'
          });
        } else {
          return Promise.resolve({ response: results });
        }
      }).catch(function (error) {
        if (req.body.feedbackEmail) {
          req.config.emailControllerAdapter.sendMail({
            text: 'We could not import your data to the class ' + req.params.className + (req.params.relationName ? ', relation ' + req.params.relationName : '') + '. Error: ' + error,
            to: req.body.feedbackEmail,
            subject: 'Import failed'
          });
        } else {
          throw new Error('Internal server error: ' + error);
        }
      });

      if (req.body.feedbackEmail && req.config.emailControllerAdapter) {
        promise = Promise.resolve({ response: 'We are importing your data. You will be notified by e-mail once it is completed.' });
      }

      return promise;
    }
  }, {
    key: 'wrapPromiseRequest',
    value: function wrapPromiseRequest(req, res, handler) {
      return handler(req).then(function (data) {
        res.json(data);
      }).catch(function (err) {
        res.status(400).send({ message: err.message });
      });
    }
  }, {
    key: 'expressRouter',
    value: function expressRouter() {
      var _this2 = this;

      var router = _express2.default.Router();
      var upload = (0, _multer2.default)();

      router.post('/import_data/:className', upload.single('importFile'), middlewares.allowCrossDomain, middlewares.handleParseHeaders, middlewares.enforceMasterKeyAccess, function (req, res) {
        return _this2.wrapPromiseRequest(req, res, _this2.handleImport.bind(_this2));
      });

      router.post('/import_relation_data/:className/:relationName', upload.single('importFile'), middlewares.allowCrossDomain, middlewares.handleParseHeaders, middlewares.enforceMasterKeyAccess, function (req, res) {
        return _this2.wrapPromiseRequest(req, res, _this2.handleImport.bind(_this2));
      });

      return router;
    }
  }]);

  return ImportRouter;
}();

exports.default = ImportRouter;