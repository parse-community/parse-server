'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ExportRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _PromiseRouter2 = require('../PromiseRouter');

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _archiver = require('archiver');

var _archiver2 = _interopRequireDefault(_archiver);

var _tmp = require('tmp');

var _tmp2 = _interopRequireDefault(_tmp);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var DefaultExportExportProgressCollectionName = "_ExportProgress";
var relationSchema = { fields: { relatedId: { type: 'String' }, owningId: { type: 'String' } } };

var ExportRouter = exports.ExportRouter = function (_PromiseRouter) {
  _inherits(ExportRouter, _PromiseRouter);

  function ExportRouter() {
    _classCallCheck(this, ExportRouter);

    return _possibleConstructorReturn(this, (ExportRouter.__proto__ || Object.getPrototypeOf(ExportRouter)).apply(this, arguments));
  }

  _createClass(ExportRouter, [{
    key: 'exportClassPage',
    value: function exportClassPage(req, name, jsonFileStream, where, skip, limit) {

      var databaseController = req.config.database;

      var options = {
        skip: skip,
        limit: limit
      };

      var findPromise = name.indexOf('_Join') === 0 ? databaseController.adapter.find(name, relationSchema, where, options) : _rest2.default.find(req.config, req.auth, name, where, options);

      return findPromise.then(function (data) {
        if (Array.isArray(data)) {
          data = { results: data };
        }

        if (skip && data.results.length) {
          jsonFileStream.write(',\n');
        }

        jsonFileStream.write(JSON.stringify(data.results, null, 2).substr(1).slice(0, -1));
      });
    }
  }, {
    key: 'exportClass',
    value: function exportClass(req, data) {
      var _this2 = this;

      var databaseController = req.config.database;
      var tmpJsonFile = _tmp2.default.fileSync();
      var jsonFileStream = _fs2.default.createWriteStream(tmpJsonFile.name);

      jsonFileStream.write('{\n"results" : [\n');

      var findPromise = data.name.indexOf('_Join') === 0 ? databaseController.adapter.count(data.name, relationSchema, data.where) : _rest2.default.find(req.config, req.auth, data.name, data.where, { count: true, limit: 0 });

      return findPromise.then(function (result) {

        if (Number.isInteger(result)) {
          result = { count: result };
        }

        var i = 0;
        var pageLimit = 1000;
        var promise = Promise.resolve();

        var _loop = function _loop() {

          var skip = i;
          promise = promise.then(function () {
            return _this2.exportClassPage(req, data.name, jsonFileStream, data.where, skip, pageLimit);
          });
        };

        for (i = 0; i < result.count; i += pageLimit) {
          _loop();
        }

        return promise;
      }).then(function () {

        jsonFileStream.end(']\n}');

        return new Promise(function (resolve) {

          jsonFileStream.on('close', function () {
            tmpJsonFile._name = data.name.replace(/:/g, '꞉') + '.json';

            resolve(tmpJsonFile);
          });
        });
      });
    }
  }, {
    key: 'handleExportProgress',
    value: function handleExportProgress(req) {

      var databaseController = req.config.database;

      var query = {
        masterKey: req.info.masterKey,
        applicationId: req.info.appId
      };

      return databaseController.find(DefaultExportExportProgressCollectionName, query).then(function (response) {
        return { response: response };
      });
    }
  }, {
    key: 'handleExport',
    value: function handleExport(req) {
      var _this3 = this;

      var databaseController = req.config.database;

      var emailControllerAdapter = req.config.emailControllerAdapter;

      if (!emailControllerAdapter) {
        return Promise.reject(new Error('You have to setup a Mail Adapter.'));
      }

      var exportProgress = {
        id: req.body.name,
        masterKey: req.info.masterKey,
        applicationId: req.info.appId
      };

      databaseController.create(DefaultExportExportProgressCollectionName, exportProgress).then(function () {
        return databaseController.loadSchema({ clearCache: true });
      }).then(function (schemaController) {
        return schemaController.getOneSchema(req.body.name, true);
      }).then(function (schema) {
        var classNames = [req.body.name];
        var where = req.body.where;
        Object.keys(schema.fields).forEach(function (fieldName) {
          var field = schema.fields[fieldName];

          if (field.type === 'Relation') {
            classNames.push('_Join:' + fieldName + ':' + req.body.name);
          }
        });

        var promisses = classNames.map(function (name) {
          return _this3.exportClass(req, {
            name: name,
            where: where
          });
        });

        return Promise.all(promisses);
      }).then(function (jsonFiles) {

        return new Promise(function (resolve) {
          var tmpZipFile = _tmp2.default.fileSync();
          var tmpZipStream = _fs2.default.createWriteStream(tmpZipFile.name);

          var zip = (0, _archiver2.default)('zip');
          zip.pipe(tmpZipStream);

          jsonFiles.forEach(function (tmpJsonFile) {
            zip.append(_fs2.default.readFileSync(tmpJsonFile.name), { name: tmpJsonFile._name });
            tmpJsonFile.removeCallback();
          });

          zip.finalize();

          tmpZipStream.on('close', function () {

            var buf = _fs2.default.readFileSync(tmpZipFile.name);
            tmpZipFile.removeCallback();
            resolve(buf);
          });
        });
      }).then(function (zippedFile) {
        var filesController = req.config.filesController;
        return filesController.createFile(req.config, req.body.name, zippedFile, 'application/zip');
      }).then(function (fileData) {

        return emailControllerAdapter.sendMail({
          text: 'We have successfully exported your data from the class ' + req.body.name + '.\n\n        Please download from ' + fileData.url,
          link: fileData.url,
          to: req.body.feedbackEmail,
          subject: 'Export completed'
        });
      }).catch(function (error) {
        return emailControllerAdapter.sendMail({
          text: 'We could not export your data to the class ' + req.body.name + '. Error: ' + error,
          to: req.body.feedbackEmail,
          subject: 'Export failed'
        });
      }).then(function () {
        return databaseController.destroy(DefaultExportExportProgressCollectionName, exportProgress);
      });

      return Promise.resolve({ response: 'We are exporting your data. You will be notified by e-mail once it is completed.' });
    }
  }, {
    key: 'mountRoutes',
    value: function mountRoutes() {
      var _this4 = this;

      this.route('PUT', '/export_data', function (req) {
        return _this4.handleExport(req);
      });

      this.route('GET', '/export_progress', function (req) {
        return _this4.handleExportProgress(req);
      });
    }
  }]);

  return ExportRouter;
}(_PromiseRouter3.default);

exports.default = ExportRouter;