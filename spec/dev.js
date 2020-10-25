const Config = require('../lib/Config');
const Parse = require('parse/node');

const className = 'AnObject';
const defaultRoleName = 'tester';

let schemaCache;

module.exports = {
  /* AnObject */
  className,
  schemaCache,

  /**
   * Creates and returns new user.
   *
   * This method helps to avoid 'User already exists' when re-running/debugging a single test.
   * @param {string} username - username base, will be postfixed with current time in millis;
   * @param {string} [password='password'] - optional, defaults to "password" if not set;
   */
  createUser: async (username, password = 'password') => {
    const user = new Parse.User({
      username: username + Date.now(),
      password,
    });
    await user.save();
    return user;
  },

  /**
   * Logs the user in.
   *
   * If password not provided, default 'password' is used.
   * @param {string} username - username base, will be postfixed with current time in millis;
   * @param {string} [password='password'] - optional, defaults to "password" if not set;
   */
  logIn: async (userObject, password) => {
    return await Parse.User.logIn(userObject.getUsername(), password || 'password');
  },

  /**
   * Sets up Class-Level Permissions for 'AnObject' class.
   * @param clp {ClassLevelPermissions}
   */
  updateCLP: async (clp, targetClass = className) => {
    const config = Config.get(Parse.applicationId);
    const schemaController = await config.database.loadSchema();

    await schemaController.updateClass(targetClass, {}, clp);
  },

  /**
   * Creates and returns role. Adds user(s) if provided.
   *
   * This method helps to avoid errors when re-running/debugging a single test.
   *
   * @param {Parse.User|Parse.User[]} [users] - user or array of users to be related with this role;
   * @param {string?} [roleName] - uses this name for role if provided. Generates from datetime if not set;
   * @param {string?} [exactName] - sets exact name (no generated part added);
   * @param {Parse.Role[]} [roles] - uses this name for role if provided. Generates from datetime if not set;
   * @param {boolean} [read] - value for role's acl public read. Defaults to true;
   * @param {boolean} [write] - value for role's acl public write. Defaults to true;
   */
  createRole: async ({
    users = null,
    exactName = defaultRoleName + Date.now(),
    roleName = null,
    roles = null,
    read = true,
    write = true,
  }) => {
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(read);
    acl.setPublicWriteAccess(write);

    const role = new Parse.Object('_Role');
    role.setACL(acl);

    // generate name based on roleName or use exactName (if botth not provided name is generated)
    const name = roleName ? roleName + Date.now() : exactName;
    role.set('name', name);

    if (roles) {
      role.relation('roles').add(roles);
    }

    if (users) {
      role.relation('users').add(users);
    }

    await role.save({ useMasterKey: true });

    return role;
  },
};
