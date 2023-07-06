"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.HooksController = void 0;
var triggers = _interopRequireWildcard(require("../triggers"));
var Parse = _interopRequireWildcard(require("parse/node"));
var _request = _interopRequireDefault(require("../request"));
var _logger = require("../logger");
var _http = _interopRequireDefault(require("http"));
var _https = _interopRequireDefault(require("https"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
// -disable-next
// -disable-next
const DefaultHooksCollectionName = '_Hooks';
const HTTPAgents = {
  http: new _http.default.Agent({
    keepAlive: true
  }),
  https: new _https.default.Agent({
    keepAlive: true
  })
};
class HooksController {
  constructor(applicationId, databaseController, webhookKey) {
    this._applicationId = applicationId;
    this._webhookKey = webhookKey;
    this.database = databaseController;
  }
  load() {
    return this._getHooks().then(hooks => {
      hooks = hooks || [];
      hooks.forEach(hook => {
        this.addHookToTriggers(hook);
      });
    });
  }
  getFunction(functionName) {
    return this._getHooks({
      functionName: functionName
    }).then(results => results[0]);
  }
  getFunctions() {
    return this._getHooks({
      functionName: {
        $exists: true
      }
    });
  }
  getTrigger(className, triggerName) {
    return this._getHooks({
      className: className,
      triggerName: triggerName
    }).then(results => results[0]);
  }
  getTriggers() {
    return this._getHooks({
      className: {
        $exists: true
      },
      triggerName: {
        $exists: true
      }
    });
  }
  deleteFunction(functionName) {
    triggers.removeFunction(functionName, this._applicationId);
    return this._removeHooks({
      functionName: functionName
    });
  }
  deleteTrigger(className, triggerName) {
    triggers.removeTrigger(triggerName, className, this._applicationId);
    return this._removeHooks({
      className: className,
      triggerName: triggerName
    });
  }
  _getHooks(query = {}) {
    return this.database.find(DefaultHooksCollectionName, query).then(results => {
      return results.map(result => {
        delete result.objectId;
        return result;
      });
    });
  }
  _removeHooks(query) {
    return this.database.destroy(DefaultHooksCollectionName, query).then(() => {
      return Promise.resolve({});
    });
  }
  saveHook(hook) {
    var query;
    if (hook.functionName && hook.url) {
      query = {
        functionName: hook.functionName
      };
    } else if (hook.triggerName && hook.className && hook.url) {
      query = {
        className: hook.className,
        triggerName: hook.triggerName
      };
    } else {
      throw new Parse.Error(143, 'invalid hook declaration');
    }
    return this.database.update(DefaultHooksCollectionName, query, hook, {
      upsert: true
    }).then(() => {
      return Promise.resolve(hook);
    });
  }
  addHookToTriggers(hook) {
    var wrappedFunction = wrapToHTTPRequest(hook, this._webhookKey);
    wrappedFunction.url = hook.url;
    if (hook.className) {
      triggers.addTrigger(hook.triggerName, hook.className, wrappedFunction, this._applicationId);
    } else {
      triggers.addFunction(hook.functionName, wrappedFunction, null, this._applicationId);
    }
  }
  addHook(hook) {
    this.addHookToTriggers(hook);
    return this.saveHook(hook);
  }
  createOrUpdateHook(aHook) {
    var hook;
    if (aHook && aHook.functionName && aHook.url) {
      hook = {};
      hook.functionName = aHook.functionName;
      hook.url = aHook.url;
    } else if (aHook && aHook.className && aHook.url && aHook.triggerName && triggers.Types[aHook.triggerName]) {
      hook = {};
      hook.className = aHook.className;
      hook.url = aHook.url;
      hook.triggerName = aHook.triggerName;
    } else {
      throw new Parse.Error(143, 'invalid hook declaration');
    }
    return this.addHook(hook);
  }
  createHook(aHook) {
    if (aHook.functionName) {
      return this.getFunction(aHook.functionName).then(result => {
        if (result) {
          throw new Parse.Error(143, `function name: ${aHook.functionName} already exists`);
        } else {
          return this.createOrUpdateHook(aHook);
        }
      });
    } else if (aHook.className && aHook.triggerName) {
      return this.getTrigger(aHook.className, aHook.triggerName).then(result => {
        if (result) {
          throw new Parse.Error(143, `class ${aHook.className} already has trigger ${aHook.triggerName}`);
        }
        return this.createOrUpdateHook(aHook);
      });
    }
    throw new Parse.Error(143, 'invalid hook declaration');
  }
  updateHook(aHook) {
    if (aHook.functionName) {
      return this.getFunction(aHook.functionName).then(result => {
        if (result) {
          return this.createOrUpdateHook(aHook);
        }
        throw new Parse.Error(143, `no function named: ${aHook.functionName} is defined`);
      });
    } else if (aHook.className && aHook.triggerName) {
      return this.getTrigger(aHook.className, aHook.triggerName).then(result => {
        if (result) {
          return this.createOrUpdateHook(aHook);
        }
        throw new Parse.Error(143, `class ${aHook.className} does not exist`);
      });
    }
    throw new Parse.Error(143, 'invalid hook declaration');
  }
}
exports.HooksController = HooksController;
function wrapToHTTPRequest(hook, key) {
  return req => {
    const jsonBody = {};
    for (var i in req) {
      // Parse Server config is not serializable
      if (i === 'config') continue;
      jsonBody[i] = req[i];
    }
    if (req.object) {
      jsonBody.object = req.object.toJSON();
      jsonBody.object.className = req.object.className;
    }
    if (req.original) {
      jsonBody.original = req.original.toJSON();
      jsonBody.original.className = req.original.className;
    }
    const jsonRequest = {
      url: hook.url,
      headers: {
        'Content-Type': 'application/json'
      },
      body: jsonBody,
      method: 'POST'
    };
    const agent = hook.url.startsWith('https') ? HTTPAgents['https'] : HTTPAgents['http'];
    jsonRequest.agent = agent;
    if (key) {
      jsonRequest.headers['X-Parse-Webhook-Key'] = key;
    } else {
      _logger.logger.warn('Making outgoing webhook request without webhookKey being set!');
    }
    return (0, _request.default)(jsonRequest).then(response => {
      let err;
      let result;
      let body = response.data;
      if (body) {
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch (e) {
            err = {
              error: 'Malformed response',
              code: -1,
              partialResponse: body.substring(0, 100)
            };
          }
        }
        if (!err) {
          result = body.success;
          err = body.error;
        }
      }
      if (err) {
        throw err;
      } else if (hook.triggerName === 'beforeSave') {
        if (typeof result === 'object') {
          delete result.createdAt;
          delete result.updatedAt;
          delete result.className;
        }
        return {
          object: result
        };
      } else {
        return result;
      }
    });
  };
}
var _default = HooksController;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJEZWZhdWx0SG9va3NDb2xsZWN0aW9uTmFtZSIsIkhUVFBBZ2VudHMiLCJodHRwIiwiQWdlbnQiLCJrZWVwQWxpdmUiLCJodHRwcyIsIkhvb2tzQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYXBwbGljYXRpb25JZCIsImRhdGFiYXNlQ29udHJvbGxlciIsIndlYmhvb2tLZXkiLCJfYXBwbGljYXRpb25JZCIsIl93ZWJob29rS2V5IiwiZGF0YWJhc2UiLCJsb2FkIiwiX2dldEhvb2tzIiwidGhlbiIsImhvb2tzIiwiZm9yRWFjaCIsImhvb2siLCJhZGRIb29rVG9UcmlnZ2VycyIsImdldEZ1bmN0aW9uIiwiZnVuY3Rpb25OYW1lIiwicmVzdWx0cyIsImdldEZ1bmN0aW9ucyIsIiRleGlzdHMiLCJnZXRUcmlnZ2VyIiwiY2xhc3NOYW1lIiwidHJpZ2dlck5hbWUiLCJnZXRUcmlnZ2VycyIsImRlbGV0ZUZ1bmN0aW9uIiwidHJpZ2dlcnMiLCJyZW1vdmVGdW5jdGlvbiIsIl9yZW1vdmVIb29rcyIsImRlbGV0ZVRyaWdnZXIiLCJyZW1vdmVUcmlnZ2VyIiwicXVlcnkiLCJmaW5kIiwibWFwIiwicmVzdWx0Iiwib2JqZWN0SWQiLCJkZXN0cm95IiwiUHJvbWlzZSIsInJlc29sdmUiLCJzYXZlSG9vayIsInVybCIsIlBhcnNlIiwiRXJyb3IiLCJ1cGRhdGUiLCJ1cHNlcnQiLCJ3cmFwcGVkRnVuY3Rpb24iLCJ3cmFwVG9IVFRQUmVxdWVzdCIsImFkZFRyaWdnZXIiLCJhZGRGdW5jdGlvbiIsImFkZEhvb2siLCJjcmVhdGVPclVwZGF0ZUhvb2siLCJhSG9vayIsIlR5cGVzIiwiY3JlYXRlSG9vayIsInVwZGF0ZUhvb2siLCJrZXkiLCJyZXEiLCJqc29uQm9keSIsImkiLCJvYmplY3QiLCJ0b0pTT04iLCJvcmlnaW5hbCIsImpzb25SZXF1ZXN0IiwiaGVhZGVycyIsImJvZHkiLCJtZXRob2QiLCJhZ2VudCIsInN0YXJ0c1dpdGgiLCJsb2dnZXIiLCJ3YXJuIiwicmVxdWVzdCIsInJlc3BvbnNlIiwiZXJyIiwiZGF0YSIsIkpTT04iLCJwYXJzZSIsImUiLCJlcnJvciIsImNvZGUiLCJwYXJ0aWFsUmVzcG9uc2UiLCJzdWJzdHJpbmciLCJzdWNjZXNzIiwiY3JlYXRlZEF0IiwidXBkYXRlZEF0Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL0hvb2tzQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiogQGZsb3cgd2VhayAqL1xuXG5pbXBvcnQgKiBhcyB0cmlnZ2VycyBmcm9tICcuLi90cmlnZ2Vycyc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCAqIGFzIFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgcmVxdWVzdCBmcm9tICcuLi9yZXF1ZXN0JztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCBodHRwcyBmcm9tICdodHRwcyc7XG5cbmNvbnN0IERlZmF1bHRIb29rc0NvbGxlY3Rpb25OYW1lID0gJ19Ib29rcyc7XG5jb25zdCBIVFRQQWdlbnRzID0ge1xuICBodHRwOiBuZXcgaHR0cC5BZ2VudCh7IGtlZXBBbGl2ZTogdHJ1ZSB9KSxcbiAgaHR0cHM6IG5ldyBodHRwcy5BZ2VudCh7IGtlZXBBbGl2ZTogdHJ1ZSB9KSxcbn07XG5cbmV4cG9ydCBjbGFzcyBIb29rc0NvbnRyb2xsZXIge1xuICBfYXBwbGljYXRpb25JZDogc3RyaW5nO1xuICBfd2ViaG9va0tleTogc3RyaW5nO1xuICBkYXRhYmFzZTogYW55O1xuXG4gIGNvbnN0cnVjdG9yKGFwcGxpY2F0aW9uSWQ6IHN0cmluZywgZGF0YWJhc2VDb250cm9sbGVyLCB3ZWJob29rS2V5KSB7XG4gICAgdGhpcy5fYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQ7XG4gICAgdGhpcy5fd2ViaG9va0tleSA9IHdlYmhvb2tLZXk7XG4gICAgdGhpcy5kYXRhYmFzZSA9IGRhdGFiYXNlQ29udHJvbGxlcjtcbiAgfVxuXG4gIGxvYWQoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2dldEhvb2tzKCkudGhlbihob29rcyA9PiB7XG4gICAgICBob29rcyA9IGhvb2tzIHx8IFtdO1xuICAgICAgaG9va3MuZm9yRWFjaChob29rID0+IHtcbiAgICAgICAgdGhpcy5hZGRIb29rVG9UcmlnZ2Vycyhob29rKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZ2V0RnVuY3Rpb24oZnVuY3Rpb25OYW1lKSB7XG4gICAgcmV0dXJuIHRoaXMuX2dldEhvb2tzKHsgZnVuY3Rpb25OYW1lOiBmdW5jdGlvbk5hbWUgfSkudGhlbihyZXN1bHRzID0+IHJlc3VsdHNbMF0pO1xuICB9XG5cbiAgZ2V0RnVuY3Rpb25zKCkge1xuICAgIHJldHVybiB0aGlzLl9nZXRIb29rcyh7IGZ1bmN0aW9uTmFtZTogeyAkZXhpc3RzOiB0cnVlIH0gfSk7XG4gIH1cblxuICBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlck5hbWUpIHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0SG9va3Moe1xuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlck5hbWUsXG4gICAgfSkudGhlbihyZXN1bHRzID0+IHJlc3VsdHNbMF0pO1xuICB9XG5cbiAgZ2V0VHJpZ2dlcnMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2dldEhvb2tzKHtcbiAgICAgIGNsYXNzTmFtZTogeyAkZXhpc3RzOiB0cnVlIH0sXG4gICAgICB0cmlnZ2VyTmFtZTogeyAkZXhpc3RzOiB0cnVlIH0sXG4gICAgfSk7XG4gIH1cblxuICBkZWxldGVGdW5jdGlvbihmdW5jdGlvbk5hbWUpIHtcbiAgICB0cmlnZ2Vycy5yZW1vdmVGdW5jdGlvbihmdW5jdGlvbk5hbWUsIHRoaXMuX2FwcGxpY2F0aW9uSWQpO1xuICAgIHJldHVybiB0aGlzLl9yZW1vdmVIb29rcyh7IGZ1bmN0aW9uTmFtZTogZnVuY3Rpb25OYW1lIH0pO1xuICB9XG5cbiAgZGVsZXRlVHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJOYW1lKSB7XG4gICAgdHJpZ2dlcnMucmVtb3ZlVHJpZ2dlcih0cmlnZ2VyTmFtZSwgY2xhc3NOYW1lLCB0aGlzLl9hcHBsaWNhdGlvbklkKTtcbiAgICByZXR1cm4gdGhpcy5fcmVtb3ZlSG9va3Moe1xuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlck5hbWUsXG4gICAgfSk7XG4gIH1cblxuICBfZ2V0SG9va3MocXVlcnkgPSB7fSkge1xuICAgIHJldHVybiB0aGlzLmRhdGFiYXNlLmZpbmQoRGVmYXVsdEhvb2tzQ29sbGVjdGlvbk5hbWUsIHF1ZXJ5KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKHJlc3VsdCA9PiB7XG4gICAgICAgIGRlbGV0ZSByZXN1bHQub2JqZWN0SWQ7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIF9yZW1vdmVIb29rcyhxdWVyeSkge1xuICAgIHJldHVybiB0aGlzLmRhdGFiYXNlLmRlc3Ryb3koRGVmYXVsdEhvb2tzQ29sbGVjdGlvbk5hbWUsIHF1ZXJ5KS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgIH0pO1xuICB9XG5cbiAgc2F2ZUhvb2soaG9vaykge1xuICAgIHZhciBxdWVyeTtcbiAgICBpZiAoaG9vay5mdW5jdGlvbk5hbWUgJiYgaG9vay51cmwpIHtcbiAgICAgIHF1ZXJ5ID0geyBmdW5jdGlvbk5hbWU6IGhvb2suZnVuY3Rpb25OYW1lIH07XG4gICAgfSBlbHNlIGlmIChob29rLnRyaWdnZXJOYW1lICYmIGhvb2suY2xhc3NOYW1lICYmIGhvb2sudXJsKSB7XG4gICAgICBxdWVyeSA9IHsgY2xhc3NOYW1lOiBob29rLmNsYXNzTmFtZSwgdHJpZ2dlck5hbWU6IGhvb2sudHJpZ2dlck5hbWUgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDE0MywgJ2ludmFsaWQgaG9vayBkZWNsYXJhdGlvbicpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5kYXRhYmFzZVxuICAgICAgLnVwZGF0ZShEZWZhdWx0SG9va3NDb2xsZWN0aW9uTmFtZSwgcXVlcnksIGhvb2ssIHsgdXBzZXJ0OiB0cnVlIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoaG9vayk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFkZEhvb2tUb1RyaWdnZXJzKGhvb2spIHtcbiAgICB2YXIgd3JhcHBlZEZ1bmN0aW9uID0gd3JhcFRvSFRUUFJlcXVlc3QoaG9vaywgdGhpcy5fd2ViaG9va0tleSk7XG4gICAgd3JhcHBlZEZ1bmN0aW9uLnVybCA9IGhvb2sudXJsO1xuICAgIGlmIChob29rLmNsYXNzTmFtZSkge1xuICAgICAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihob29rLnRyaWdnZXJOYW1lLCBob29rLmNsYXNzTmFtZSwgd3JhcHBlZEZ1bmN0aW9uLCB0aGlzLl9hcHBsaWNhdGlvbklkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdHJpZ2dlcnMuYWRkRnVuY3Rpb24oaG9vay5mdW5jdGlvbk5hbWUsIHdyYXBwZWRGdW5jdGlvbiwgbnVsbCwgdGhpcy5fYXBwbGljYXRpb25JZCk7XG4gICAgfVxuICB9XG5cbiAgYWRkSG9vayhob29rKSB7XG4gICAgdGhpcy5hZGRIb29rVG9UcmlnZ2Vycyhob29rKTtcbiAgICByZXR1cm4gdGhpcy5zYXZlSG9vayhob29rKTtcbiAgfVxuXG4gIGNyZWF0ZU9yVXBkYXRlSG9vayhhSG9vaykge1xuICAgIHZhciBob29rO1xuICAgIGlmIChhSG9vayAmJiBhSG9vay5mdW5jdGlvbk5hbWUgJiYgYUhvb2sudXJsKSB7XG4gICAgICBob29rID0ge307XG4gICAgICBob29rLmZ1bmN0aW9uTmFtZSA9IGFIb29rLmZ1bmN0aW9uTmFtZTtcbiAgICAgIGhvb2sudXJsID0gYUhvb2sudXJsO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBhSG9vayAmJlxuICAgICAgYUhvb2suY2xhc3NOYW1lICYmXG4gICAgICBhSG9vay51cmwgJiZcbiAgICAgIGFIb29rLnRyaWdnZXJOYW1lICYmXG4gICAgICB0cmlnZ2Vycy5UeXBlc1thSG9vay50cmlnZ2VyTmFtZV1cbiAgICApIHtcbiAgICAgIGhvb2sgPSB7fTtcbiAgICAgIGhvb2suY2xhc3NOYW1lID0gYUhvb2suY2xhc3NOYW1lO1xuICAgICAgaG9vay51cmwgPSBhSG9vay51cmw7XG4gICAgICBob29rLnRyaWdnZXJOYW1lID0gYUhvb2sudHJpZ2dlck5hbWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxNDMsICdpbnZhbGlkIGhvb2sgZGVjbGFyYXRpb24nKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5hZGRIb29rKGhvb2spO1xuICB9XG5cbiAgY3JlYXRlSG9vayhhSG9vaykge1xuICAgIGlmIChhSG9vay5mdW5jdGlvbk5hbWUpIHtcbiAgICAgIHJldHVybiB0aGlzLmdldEZ1bmN0aW9uKGFIb29rLmZ1bmN0aW9uTmFtZSkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDE0MywgYGZ1bmN0aW9uIG5hbWU6ICR7YUhvb2suZnVuY3Rpb25OYW1lfSBhbHJlYWR5IGV4aXN0c2ApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZU9yVXBkYXRlSG9vayhhSG9vayk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAoYUhvb2suY2xhc3NOYW1lICYmIGFIb29rLnRyaWdnZXJOYW1lKSB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRUcmlnZ2VyKGFIb29rLmNsYXNzTmFtZSwgYUhvb2sudHJpZ2dlck5hbWUpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIDE0MyxcbiAgICAgICAgICAgIGBjbGFzcyAke2FIb29rLmNsYXNzTmFtZX0gYWxyZWFkeSBoYXMgdHJpZ2dlciAke2FIb29rLnRyaWdnZXJOYW1lfWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZU9yVXBkYXRlSG9vayhhSG9vayk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTQzLCAnaW52YWxpZCBob29rIGRlY2xhcmF0aW9uJyk7XG4gIH1cblxuICB1cGRhdGVIb29rKGFIb29rKSB7XG4gICAgaWYgKGFIb29rLmZ1bmN0aW9uTmFtZSkge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0RnVuY3Rpb24oYUhvb2suZnVuY3Rpb25OYW1lKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVPclVwZGF0ZUhvb2soYUhvb2spO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxNDMsIGBubyBmdW5jdGlvbiBuYW1lZDogJHthSG9vay5mdW5jdGlvbk5hbWV9IGlzIGRlZmluZWRgKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAoYUhvb2suY2xhc3NOYW1lICYmIGFIb29rLnRyaWdnZXJOYW1lKSB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRUcmlnZ2VyKGFIb29rLmNsYXNzTmFtZSwgYUhvb2sudHJpZ2dlck5hbWUpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZU9yVXBkYXRlSG9vayhhSG9vayk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDE0MywgYGNsYXNzICR7YUhvb2suY2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdGApO1xuICAgICAgfSk7XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxNDMsICdpbnZhbGlkIGhvb2sgZGVjbGFyYXRpb24nKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB3cmFwVG9IVFRQUmVxdWVzdChob29rLCBrZXkpIHtcbiAgcmV0dXJuIHJlcSA9PiB7XG4gICAgY29uc3QganNvbkJvZHkgPSB7fTtcbiAgICBmb3IgKHZhciBpIGluIHJlcSkge1xuICAgICAgLy8gUGFyc2UgU2VydmVyIGNvbmZpZyBpcyBub3Qgc2VyaWFsaXphYmxlXG4gICAgICBpZiAoaSA9PT0gJ2NvbmZpZycpIGNvbnRpbnVlO1xuICAgICAganNvbkJvZHlbaV0gPSByZXFbaV07XG4gICAgfVxuICAgIGlmIChyZXEub2JqZWN0KSB7XG4gICAgICBqc29uQm9keS5vYmplY3QgPSByZXEub2JqZWN0LnRvSlNPTigpO1xuICAgICAganNvbkJvZHkub2JqZWN0LmNsYXNzTmFtZSA9IHJlcS5vYmplY3QuY2xhc3NOYW1lO1xuICAgIH1cbiAgICBpZiAocmVxLm9yaWdpbmFsKSB7XG4gICAgICBqc29uQm9keS5vcmlnaW5hbCA9IHJlcS5vcmlnaW5hbC50b0pTT04oKTtcbiAgICAgIGpzb25Cb2R5Lm9yaWdpbmFsLmNsYXNzTmFtZSA9IHJlcS5vcmlnaW5hbC5jbGFzc05hbWU7XG4gICAgfVxuICAgIGNvbnN0IGpzb25SZXF1ZXN0OiBhbnkgPSB7XG4gICAgICB1cmw6IGhvb2sudXJsLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IGpzb25Cb2R5LFxuICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgfTtcblxuICAgIGNvbnN0IGFnZW50ID0gaG9vay51cmwuc3RhcnRzV2l0aCgnaHR0cHMnKSA/IEhUVFBBZ2VudHNbJ2h0dHBzJ10gOiBIVFRQQWdlbnRzWydodHRwJ107XG4gICAganNvblJlcXVlc3QuYWdlbnQgPSBhZ2VudDtcblxuICAgIGlmIChrZXkpIHtcbiAgICAgIGpzb25SZXF1ZXN0LmhlYWRlcnNbJ1gtUGFyc2UtV2ViaG9vay1LZXknXSA9IGtleTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9nZ2VyLndhcm4oJ01ha2luZyBvdXRnb2luZyB3ZWJob29rIHJlcXVlc3Qgd2l0aG91dCB3ZWJob29rS2V5IGJlaW5nIHNldCEnKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcXVlc3QoanNvblJlcXVlc3QpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgbGV0IGVycjtcbiAgICAgIGxldCByZXN1bHQ7XG4gICAgICBsZXQgYm9keSA9IHJlc3BvbnNlLmRhdGE7XG4gICAgICBpZiAoYm9keSkge1xuICAgICAgICBpZiAodHlwZW9mIGJvZHkgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGJvZHkgPSBKU09OLnBhcnNlKGJvZHkpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGVyciA9IHtcbiAgICAgICAgICAgICAgZXJyb3I6ICdNYWxmb3JtZWQgcmVzcG9uc2UnLFxuICAgICAgICAgICAgICBjb2RlOiAtMSxcbiAgICAgICAgICAgICAgcGFydGlhbFJlc3BvbnNlOiBib2R5LnN1YnN0cmluZygwLCAxMDApLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFlcnIpIHtcbiAgICAgICAgICByZXN1bHQgPSBib2R5LnN1Y2Nlc3M7XG4gICAgICAgICAgZXJyID0gYm9keS5lcnJvcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGVycikge1xuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9IGVsc2UgaWYgKGhvb2sudHJpZ2dlck5hbWUgPT09ICdiZWZvcmVTYXZlJykge1xuICAgICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICBkZWxldGUgcmVzdWx0LmNyZWF0ZWRBdDtcbiAgICAgICAgICBkZWxldGUgcmVzdWx0LnVwZGF0ZWRBdDtcbiAgICAgICAgICBkZWxldGUgcmVzdWx0LmNsYXNzTmFtZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBvYmplY3Q6IHJlc3VsdCB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgSG9va3NDb250cm9sbGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFFQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBMEI7QUFBQTtBQUFBO0FBTjFCO0FBRUE7QUFNQSxNQUFNQSwwQkFBMEIsR0FBRyxRQUFRO0FBQzNDLE1BQU1DLFVBQVUsR0FBRztFQUNqQkMsSUFBSSxFQUFFLElBQUlBLGFBQUksQ0FBQ0MsS0FBSyxDQUFDO0lBQUVDLFNBQVMsRUFBRTtFQUFLLENBQUMsQ0FBQztFQUN6Q0MsS0FBSyxFQUFFLElBQUlBLGNBQUssQ0FBQ0YsS0FBSyxDQUFDO0lBQUVDLFNBQVMsRUFBRTtFQUFLLENBQUM7QUFDNUMsQ0FBQztBQUVNLE1BQU1FLGVBQWUsQ0FBQztFQUszQkMsV0FBVyxDQUFDQyxhQUFxQixFQUFFQyxrQkFBa0IsRUFBRUMsVUFBVSxFQUFFO0lBQ2pFLElBQUksQ0FBQ0MsY0FBYyxHQUFHSCxhQUFhO0lBQ25DLElBQUksQ0FBQ0ksV0FBVyxHQUFHRixVQUFVO0lBQzdCLElBQUksQ0FBQ0csUUFBUSxHQUFHSixrQkFBa0I7RUFDcEM7RUFFQUssSUFBSSxHQUFHO0lBQ0wsT0FBTyxJQUFJLENBQUNDLFNBQVMsRUFBRSxDQUFDQyxJQUFJLENBQUNDLEtBQUssSUFBSTtNQUNwQ0EsS0FBSyxHQUFHQSxLQUFLLElBQUksRUFBRTtNQUNuQkEsS0FBSyxDQUFDQyxPQUFPLENBQUNDLElB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