import Parse from 'parse/node';
import LRU from 'lru-cache';
import logger from '../logger';

class SessionTokenCache {
  cache: Object;

  constructor(timeout: number = 30 * 24 * 60 *60 * 1000, maxSize: number = 10000) {
    this.cache = new LRU({
      max: maxSize,
      maxAge: timeout
    });
  }

  getUserId(sessionToken: string): any {
    if (!sessionToken) {
      return Parse.Promise.error('Empty sessionToken');
    }
    let userId = this.cache.get(sessionToken);
    if (userId) {
      logger.verbose('Fetch userId %s of sessionToken %s from Cache', userId, sessionToken);
      return Parse.Promise.as(userId);
    }
    return Parse.User.become(sessionToken).then((user) => {
      logger.verbose('Fetch userId %s of sessionToken %s from Parse', user.id, sessionToken);
      let userId = user.id;
      this.cache.set(sessionToken, userId);
      return Parse.Promise.as(userId);
    }, (error) => {
      logger.error('Can not fetch userId for sessionToken %j, error %j', sessionToken, error);
      return Parse.Promise.error(error);
    });
  }
}

export {
  SessionTokenCache
}
