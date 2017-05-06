import Parse from 'parse/node';
import LRU from 'lru-cache';
import logger from '../logger';

function rolesForUser(userId){
  var q = new Parse.Query(Parse.Role);
  var user = new Parse.User();
  user.id = userId;
  q.equalTo("users", user);
  return q.find({useMasterKey:true});
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
      return Parse.Promise.error('Empty userId');
    }
    const cachedRoles = this.cache.get(userId);
    if (cachedRoles) {
      logger.verbose('Fetch %s roles of user %s from Cache', cachedRoles.length, userId);
      return Parse.Promise.as(cachedRoles);
    }
    return rolesForUser(userId).then((roles) => {
      logger.verbose('Fetch %s roles of user %s from Parse', roles.length, userId);
      const roleNames = roles.map(role => role.getName());
      this.cache.set(userId, roleNames);
      return Parse.Promise.as(roleNames);
    }, (error) => {
      logger.error('Can not fetch roles for userId %j, error %j', userId, error);
      return Parse.Promise.error(error);
    });
  }
}

export {
  RoleCache
}
