'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FunctionsRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _PromiseRouter2 = require('../PromiseRouter');

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

var _middlewares = require('../middlewares');

var _StatusHandler = require('../StatusHandler');

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _logger = require('../logger');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

// FunctionsRouter.js

var Parse = require('parse/node').Parse,
    triggers = require('../triggers');

function parseObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(function (item) {
      return parseObject(item);
    });
  } else if (obj && obj.__type == 'Date') {
    return Object.assign(new Date(obj.iso), obj);
  } else if (obj && obj.__type == 'File') {
    return Parse.File.fromJSON(obj);
  } else if (obj && (typeof obj === 'undefined' ? 'undefined' : _typeof(obj)) === 'object') {
    return parseParams(obj);
  } else {
    return obj;
  }
}

function parseParams(params) {
  return _lodash2.default.mapValues(params, parseObject);
}

var FunctionsRouter = exports.FunctionsRouter = function (_PromiseRouter) {
  _inherits(FunctionsRouter, _PromiseRouter);

  function FunctionsRouter() {
    _classCallCheck(this, FunctionsRouter);

    return _possibleConstructorReturn(this, (FunctionsRouter.__proto__ || Object.getPrototypeOf(FunctionsRouter)).apply(this, arguments));
  }

  _createClass(FunctionsRouter, [{
    key: 'mountRoutes',
    value: function mountRoutes() {
      this.route('POST', '/functions/:functionName', FunctionsRouter.handleCloudFunction);
      this.route('POST', '/jobs/:jobName', _middlewares.promiseEnforceMasterKeyAccess, function (req) {
        return FunctionsRouter.handleCloudJob(req);
      });
      this.route('POST', '/jobs', _middlewares.promiseEnforceMasterKeyAccess, function (req) {
        return FunctionsRouter.handleCloudJob(req);
      });
    }
  }], [{
    key: 'handleCloudJob',
    value: function handleCloudJob(req) {
      var jobName = req.params.jobName || req.body.jobName;
      var applicationId = req.config.applicationId;
      var jobHandler = (0, _StatusHandler.jobStatusHandler)(req.config);
      var jobFunction = triggers.getJob(jobName, applicationId);
      if (!jobFunction) {
        throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid job.');
      }
      var params = Object.assign({}, req.body, req.query);
      params = parseParams(params);
      var request = {
        params: params,
        log: req.config.loggerController,
        headers: req.headers,
        jobName: jobName
      };
      var status = {
        success: jobHandler.setSucceeded.bind(jobHandler),
        error: jobHandler.setFailed.bind(jobHandler),
        message: jobHandler.setMessage.bind(jobHandler)
      };
      return jobHandler.setRunning(jobName, params).then(function (jobStatus) {
        request.jobId = jobStatus.objectId;
        // run the function async
        process.nextTick(function () {
          jobFunction(request, status);
        });
        return {
          headers: {
            'X-Parse-Job-Status-Id': jobStatus.objectId
          },
          response: {}
        };
      });
    }
  }, {
    key: 'createResponseObject',
    value: function createResponseObject(resolve, reject, message) {
      return {
        success: function success(result) {
          resolve({
            response: {
              result: Parse._encode(result)
            }
          });
        },
        error: function error(code, message) {
          if (!message) {
            message = code;
            code = Parse.Error.SCRIPT_FAILED;
          }
          reject(new Parse.Error(code, message));
        },
        message: message
      };
    }
  }, {
    key: 'handleCloudFunction',
    value: function handleCloudFunction(req) {
      var functionName = req.params.functionName;
      var applicationId = req.config.applicationId;
      var theFunction = triggers.getFunction(functionName, applicationId);
      var theValidator = triggers.getValidator(req.params.functionName, applicationId);
      if (theFunction) {
        var request;
        var result;

        var _ret = function () {
          var params = Object.assign({}, req.body, req.query);
          params = parseParams(params);
          request = {
            params: params,
            master: req.auth && req.auth.isMaster,
            user: req.auth && req.auth.user,
            installationId: req.info.installationId,
            log: req.config.loggerController,
            headers: req.headers,
            functionName: functionName
          };


          if (theValidator && typeof theValidator === "function") {
            result = theValidator(request);

            if (!result) {
              throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Validation failed.');
            }
          }

          return {
            v: new Promise(function (resolve, reject) {
              var userString = req.auth && req.auth.user ? req.auth.user.id : undefined;
              var cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(params));
              var response = FunctionsRouter.createResponseObject(function (result) {
                try {
                  var cleanResult = _logger.logger.truncateLogMessage(JSON.stringify(result.response.result));
                  _logger.logger.info('Ran cloud function ' + functionName + ' for user ' + userString + ' ' + ('with:\n  Input: ' + cleanInput + '\n  Result: ' + cleanResult), {
                    functionName: functionName,
                    params: params,
                    user: userString
                  });
                  resolve(result);
                } catch (e) {
                  reject(e);
                }
              }, function (error) {
                try {
                  _logger.logger.error('Failed running cloud function ' + functionName + ' for ' + ('user ' + userString + ' with:\n  Input: ' + cleanInput + '\n  Error: ') + JSON.stringify(error), {
                    functionName: functionName,
                    error: error,
                    params: params,
                    user: userString
                  });
                  reject(error);
                } catch (e) {
                  reject(e);
                }
              });
              // Force the keys before the function calls.
              Parse.applicationId = req.config.applicationId;
              Parse.javascriptKey = req.config.javascriptKey;
              Parse.masterKey = req.config.masterKey;
              theFunction(request, response);
            })
          };
        }();

        if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
      } else {
        throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid function: "' + functionName + '"');
      }
    }
  }]);

  return FunctionsRouter;
}(_PromiseRouter3.default);