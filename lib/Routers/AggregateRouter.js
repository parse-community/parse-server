'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AggregateRouter = undefined;

var _ClassesRouter = require('./ClassesRouter');

var _ClassesRouter2 = _interopRequireDefault(_ClassesRouter);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _middlewares = require('../middlewares');

var middleware = _interopRequireWildcard(_middlewares);

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _UsersRouter = require('./UsersRouter');

var _UsersRouter2 = _interopRequireDefault(_UsersRouter);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const ALLOWED_KEYS = ['where', 'distinct', 'project', 'match', 'redact', 'limit', 'skip', 'unwind', 'group', 'sample', 'sort', 'geoNear', 'lookup', 'out', 'indexStats', 'facet', 'bucket', 'bucketAuto', 'sortByCount', 'addFields', 'replaceRoot', 'count', 'graphLookup'];

class AggregateRouter extends _ClassesRouter2.default {

  handleFind(req) {
    const body = Object.assign(req.body, _ClassesRouter2.default.JSONFromQuery(req.query));
    const options = {};
    const pipeline = [];

    for (const key in body) {
      if (ALLOWED_KEYS.indexOf(key) === -1) {
        throw new _node2.default.Error(_node2.default.Error.INVALID_QUERY, `Invalid parameter for query: ${key}`);
      }
      if (key === 'group') {
        if (body[key].hasOwnProperty('_id')) {
          throw new _node2.default.Error(_node2.default.Error.INVALID_QUERY, `Invalid parameter for query: group. Please use objectId instead of _id`);
        }
        if (!body[key].hasOwnProperty('objectId')) {
          throw new _node2.default.Error(_node2.default.Error.INVALID_QUERY, `Invalid parameter for query: group. objectId is required`);
        }
        body[key]._id = body[key].objectId;
        delete body[key].objectId;
      }
      pipeline.push({ [`$${key}`]: body[key] });
    }
    if (body.distinct) {
      options.distinct = String(body.distinct);
    }
    options.pipeline = pipeline;
    if (typeof body.where === 'string') {
      body.where = JSON.parse(body.where);
    }
    return _rest2.default.find(req.config, req.auth, this.className(req), body.where, options, req.info.clientSDK).then(response => {
      for (const result of response.results) {
        if (typeof result === 'object') {
          _UsersRouter2.default.removeHiddenProperties(result);
        }
      }
      return { response };
    });
  }

  mountRoutes() {
    this.route('GET', '/aggregate/:className', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleFind(req);
    });
  }
}

exports.AggregateRouter = AggregateRouter;
exports.default = AggregateRouter;