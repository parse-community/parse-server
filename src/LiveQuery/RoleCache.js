import Parse from 'parse/node';
import LRU from 'lru-cache';
import logger from '../logger';

function rolesForUserId(userId) {
  const user = new Parse.User();
  user.id  = userId;
  const rolesQuery = new Parse.Query(Parse.Role);
  rolesQuery.equalTo("users", user);
  return rolesQuery.find({useMasterKey:true});
}

class RoleCache {
  cache: Object;

  constructor(timeout: number = 30 * 24 * 60 * 60 * 1000, maxSize: number = 10000) {
    this.cache = new LRU({
      max: maxSize,
      maxAge: timeout
    });
  }

  getRoles(userId: string): any {
    if (!userId) {
      return Promise.reject('Invalid userId');
    }

    const roles = this.cache.get(userId);
    if (roles) {
      logger.verbose(`Fetch roles from Cache for userId: ${userId}`);
      return Parse.Promise.as(roles);
    }

    return rolesForUserId(userId)
      .then(roles => {
        logger.verbose(`Fetch roles from Parse for userId: ${userId}`);
        this.cache.set(roles, userId);
        return Parse.Promise.as(roles);
      }, error => {
        logger.error('Can not fetch roles for userId %j, error %j',userId, error);
        return Parse.Promise.error(error);
      });
  }
}

export {
  RoleCache
}
