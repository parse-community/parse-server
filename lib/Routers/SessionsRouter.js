'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SessionsRouter = undefined;

var _ClassesRouter = require('./ClassesRouter');

var _ClassesRouter2 = _interopRequireDefault(_ClassesRouter);

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _Auth = require('../Auth');

var _Auth2 = _interopRequireDefault(_Auth);

var _RestWrite = require('../RestWrite');

var _RestWrite2 = _interopRequireDefault(_RestWrite);

var _cryptoUtils = require('../cryptoUtils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class SessionsRouter extends _ClassesRouter2.default {

  className() {
    return '_Session';
  }

  handleMe(req) {
    // TODO: Verify correct behavior
    if (!req.info || !req.info.sessionToken) {
      throw new _node2.default.Error(_node2.default.Error.INVALID_SESSION_TOKEN, 'Session token required.');
    }
    return _rest2.default.find(req.config, _Auth2.default.master(req.config), '_Session', { sessionToken: req.info.sessionToken }, undefined, req.info.clientSDK).then(response => {
      if (!response.results || response.results.length == 0) {
        throw new _node2.default.Error(_node2.default.Error.INVALID_SESSION_TOKEN, 'Session token not found.');
      }
      return {
        response: response.results[0]
      };
    });
  }

  handleUpdateToRevocableSession(req) {
    const config = req.config;
    const masterAuth = _Auth2.default.master(config);
    const user = req.auth.user;
    // Issue #2720
    // Calling without a session token would result in a not found user
    if (!user) {
      throw new _node2.default.Error(_node2.default.Error.OBJECT_NOT_FOUND, 'invalid session');
    }
    const expiresAt = config.generateSessionExpiresAt();
    const sessionData = {
      sessionToken: 'r:' + (0, _cryptoUtils.newToken)(),
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: user.id
      },
      createdWith: {
        'action': 'upgrade'
      },
      restricted: false,
      installationId: req.auth.installationId,
      expiresAt: _node2.default._encode(expiresAt)
    };
    const create = new _RestWrite2.default(config, masterAuth, '_Session', null, sessionData);
    return create.execute().then(() => {
      // delete the session token, use the db to skip beforeSave
      return config.database.update('_User', {
        objectId: user.id
      }, {
        sessionToken: { __op: 'Delete' }
      });
    }).then(() => {
      return Promise.resolve({ response: sessionData });
    });
  }

  mountRoutes() {
    this.route('GET', '/sessions/me', req => {
      return this.handleMe(req);
    });
    this.route('GET', '/sessions', req => {
      return this.handleFind(req);
    });
    this.route('GET', '/sessions/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('POST', '/sessions', req => {
      return this.handleCreate(req);
    });
    this.route('PUT', '/sessions/:objectId', req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/sessions/:objectId', req => {
      return this.handleDelete(req);
    });
    this.route('POST', '/upgradeToRevocableSession', req => {
      return this.handleUpdateToRevocableSession(req);
    });
  }
}

exports.SessionsRouter = SessionsRouter;
exports.default = SessionsRouter;