import Parse from 'parse/node';
import LRU from 'lru-cache';
import logger from '../logger';

function userIdForSessionToken(sessionToken) {
  var q = new Parse.Query("_Session");
  q.equalTo("sessionToken", sessionToken);
  return q.first({useMasterKey: true}).then(session => {
    if (!session) {
      logger.verbose("No session found for session token");
      return;
    }
    const user = session.get("user");
    return user.id;
  });
}

class SessionTokenCache {
  cache: Object;

  constructor(timeout: number = 30 * 24 * 60 * 60 * 1000, maxSize: number = 10000) {
    this.cache = new LRU({
      max: maxSize,
      maxAge: timeout
    });
  }

  getUserId(sessionToken: string): any {
    if (!sessionToken) {
      return Parse.Promise.error('Empty sessionToken');
    }

    if (this.cache.has(sessionToken)) {
      const userId = this.cache.get(sessionToken);
      if (userId) {
        logger.verbose('Fetch userId %s of sessionToken %s from Cache', userId, sessionToken);
        return Parse.Promise.as(userId);
      } else {
        // invalid session tokens are set as undefined in the LRU
        // it will avoid quering the parse servers for users too often 
        // with inexistent sessionsToken
        return Parse.Promise.error('Invalid sessionToken');
      }
    }

    return userIdForSessionToken(sessionToken).then((userId) => {
      logger.verbose('Fetch userId %s of sessionToken %s from Parse', userId, sessionToken);
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
