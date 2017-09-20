'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CloudCodeRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _PromiseRouter2 = require('../PromiseRouter');

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var triggers = require('../triggers');

var CloudCodeRouter = exports.CloudCodeRouter = function (_PromiseRouter) {
  _inherits(CloudCodeRouter, _PromiseRouter);

  function CloudCodeRouter() {
    _classCallCheck(this, CloudCodeRouter);

    return _possibleConstructorReturn(this, (CloudCodeRouter.__proto__ || Object.getPrototypeOf(CloudCodeRouter)).apply(this, arguments));
  }

  _createClass(CloudCodeRouter, [{
    key: 'mountRoutes',
    value: function mountRoutes() {
      this.route('GET', '/cloud_code/jobs', CloudCodeRouter.getJobs);
    }
  }], [{
    key: 'getJobs',
    value: function getJobs(req) {
      var config = req.config;
      var jobs = triggers.getJobs(config.applicationId) || {};
      return Promise.resolve({
        response: Object.keys(jobs).map(function (jobName) {
          return {
            jobName: jobName
          };
        })
      });
    }
  }]);

  return CloudCodeRouter;
}(_PromiseRouter3.default);