'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FilesController = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _cryptoUtils = require('../cryptoUtils');

var _AdaptableController2 = require('./AdaptableController');

var _AdaptableController3 = _interopRequireDefault(_AdaptableController2);

var _FilesAdapter = require('../Adapters/Files/FilesAdapter');

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _mime = require('mime');

var _mime2 = _interopRequireDefault(_mime);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } // FilesController.js


var legacyFilesRegex = new RegExp("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-.*");

var FilesController = exports.FilesController = function (_AdaptableController) {
  _inherits(FilesController, _AdaptableController);

  function FilesController() {
    _classCallCheck(this, FilesController);

    return _possibleConstructorReturn(this, (FilesController.__proto__ || Object.getPrototypeOf(FilesController)).apply(this, arguments));
  }

  _createClass(FilesController, [{
    key: 'getFileData',
    value: function getFileData(config, filename) {
      return this.adapter.getFileData(filename);
    }
  }, {
    key: 'createFile',
    value: function createFile(config, filename, data, contentType) {

      var extname = _path2.default.extname(filename);

      var hasExtension = extname.length > 0;

      if (!hasExtension && contentType && _mime2.default.extension(contentType)) {
        filename = filename + '.' + _mime2.default.extension(contentType);
      } else if (hasExtension && !contentType) {
        contentType = _mime2.default.lookup(filename);
      }

      filename = (0, _cryptoUtils.randomHexString)(32) + '_' + filename;

      var location = this.adapter.getFileLocation(config, filename);
      return this.adapter.createFile(filename, data, contentType).then(function () {
        return Promise.resolve({
          url: location,
          name: filename
        });
      });
    }
  }, {
    key: 'deleteFile',
    value: function deleteFile(config, filename) {
      return this.adapter.deleteFile(filename);
    }

    /**
     * Find file references in REST-format object and adds the url key
     * with the current mount point and app id.
     * Object may be a single object or list of REST-format objects.
     */

  }, {
    key: 'expandFilesInObject',
    value: function expandFilesInObject(config, object) {
      var _this2 = this;

      if (object instanceof Array) {
        object.map(function (obj) {
          return _this2.expandFilesInObject(config, obj);
        });
        return;
      }
      if ((typeof object === 'undefined' ? 'undefined' : _typeof(object)) !== 'object') {
        return;
      }
      for (var key in object) {
        var fileObject = object[key];
        if (fileObject && fileObject['__type'] === 'File') {
          if (fileObject['url']) {
            continue;
          }
          var filename = fileObject['name'];
          // all filenames starting with "tfss-" should be from files.parsetfss.com
          // all filenames starting with a "-" seperated UUID should be from files.parse.com
          // all other filenames have been migrated or created from Parse Server
          if (config.fileKey === undefined) {
            fileObject['url'] = this.adapter.getFileLocation(config, filename);
          } else {
            if (filename.indexOf('tfss-') === 0) {
              fileObject['url'] = 'http://files.parsetfss.com/' + config.fileKey + '/' + encodeURIComponent(filename);
            } else if (legacyFilesRegex.test(filename)) {
              fileObject['url'] = 'http://files.parse.com/' + config.fileKey + '/' + encodeURIComponent(filename);
            } else {
              fileObject['url'] = this.adapter.getFileLocation(config, filename);
            }
          }
        }
      }
    }
  }, {
    key: 'expectedAdapterType',
    value: function expectedAdapterType() {
      return _FilesAdapter.FilesAdapter;
    }
  }, {
    key: 'getFileStream',
    value: function getFileStream(config, filename) {
      return this.adapter.getFileStream(filename);
    }
  }]);

  return FilesController;
}(_AdaptableController3.default);

exports.default = FilesController;