import Parse from 'parse/node';
import LRU from 'lru-cache';
import logger from '../logger';

function userForSessionToken(sessionToken) {
  var q = new Parse.Query('_Session');
  q.equalTo('sessionToken', sessionToken);
  return q.first({ useMasterKey: true }).then(function (session) {
    if (!session) {
      return Promise.reject('No session found for session token');
    }
    return session.get('user');
  });
}

class SessionTokenCache {
  cache: Object;

  constructor(timeout: number = 30 * 24 * 60 * 60 * 1000, maxSize: number = 10000) {
    this.cache = new LRU({
      max: maxSize,
      maxAge: timeout,
    });
  }

  getUserId(sessionToken: string): any {
    if (!sessionToken) {
      return Promise.reject('Empty sessionToken');
    }
    const userId = this.cache.get(sessionToken);
    if (userId) {
      logger.verbose('Fetch userId %s of sessionToken %s from Cache', userId, sessionToken);
      return Promise.resolve(userId);
    }
    return userForSessionToken(sessionToken).then(
      user => {
        logger.verbose('Fetch userId %s of sessionToken %s from Parse', user.id, sessionToken);
        const userId = user.id;
        this.cache.set(sessionToken, userId);
        return Promise.resolve(userId);
      },
      error => {
        logger.error('Can not fetch userId for sessionToken %j, error %j', sessionToken, error);
        return Promise.reject(error);
      }
    );
  }
}

export { SessionTokenCache };
