import AppCache from './cache';
import SchemaCache from './Adapters/Cache/SchemaCache';

/**
 * Destroys all data in the database
 * @param {boolean} fast set to true if it's ok to just drop objects and not indexes.
 */
export function destroyAllDataPermanently(fast) {
  if (!process.env.TESTING) {
    throw 'Only supported in test environment';
  }
  return Promise.all(
    Object.keys(AppCache.cache).map(appId => {
      const app = AppCache.get(appId);
      const deletePromises = [];
      if (app.cacheAdapter && app.cacheAdapter.clear) {
        deletePromises.push(app.cacheAdapter.clear());
      }
      if (app.databaseController) {
        deletePromises.push(app.databaseController.deleteEverything(fast));
      } else if (app.databaseAdapter) {
        SchemaCache.clear();
        deletePromises.push(app.databaseAdapter.deleteAllClasses(fast));
      }
      return Promise.all(deletePromises);
    })
  );
}

export function resolvingPromise() {
  let res;
  let rej;
  const promise = new Promise((resolve, reject) => {
    res = resolve;
    rej = reject;
  });
  promise.resolve = res;
  promise.reject = rej;
  return promise;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getConnectionsCount(server) {
  return new Promise((resolve, reject) => {
    server.getConnections((err, count) => {
      /* istanbul ignore next */
      if (err) {
        reject(err);
      } else {
        resolve(count);
      }
    });
  });
};

export class Connections {
  constructor() {
    this.sockets = new Set();
  }

  track(server) {
    server.on('connection', socket => {
      this.sockets.add(socket);
      socket.on('close', () => {
        this.sockets.delete(socket);
      });
    });
  }

  destroyAll() {
    for (const socket of this.sockets.values()) {
      socket.destroy();
    }
    this.sockets.clear();
  }

  count() {
    return this.sockets.size;
  }
}

export function getSanitizedErrorCall() {
  const logger = require('../lib/logger').default;
  // eslint-disable-next-line no-undef
  const loggerErrorSpy = spyOn(logger, 'error').and.callThrough();

  return {
    callCountBefore: () => loggerErrorSpy.calls.count(),
    checkMessage: (message, callCountBefore) => {
      // eslint-disable-next-line no-undef
      expect(loggerErrorSpy.calls.count()).toBeGreaterThan(callCountBefore);
      const calls = loggerErrorSpy.calls.all();
      const recentCalls = calls.slice(callCountBefore);
      const sanitizedErrorCall = recentCalls.find(call => call.args[0] === 'Sanitized error:');
      // eslint-disable-next-line no-undef
      expect(sanitizedErrorCall).toBeDefined();
      // eslint-disable-next-line no-undef
      expect(sanitizedErrorCall.args[1]).toContain(message);
    },
  };
}
