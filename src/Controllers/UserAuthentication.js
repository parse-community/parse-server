const Parse = require('parse/node');
import passwordCrypto from '../password';
import AccountLockout from '../AccountLockout';
import Auth from '../Auth';

export function removeHiddenProperties(obj) {
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      // Regexp comes from Parse.Object.prototype.validate
      if (key !== "__type" && !(/^[A-Za-z][0-9A-Za-z_]*$/).test(key)) {
        delete obj[key];
      }
    }
  }
}

export async function verifyCredentials({ username, password, email }, config, auth) {
  // TODO: use the right error codes / descriptions.
  if (!username && !email) {
    throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'username/email is required.');
  }
  if (!password) {
    throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required.');
  }
  if (typeof password !== 'string'
    || email && typeof email !== 'string'
    || username && typeof username !== 'string') {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
  }

  let user;
  let isValidPassword = false;
  let query;
  if (email && username) {
    query = { email, username };
  } else if (email) {
    query = { email };
  } else {
    query = { $or: [{ username }, { email: username }] };
  }
  const results = await config.database.find('_User', query);
  if (!results.length) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
  }

  if (results.length > 1) { // corner case where user1 has username == user2 email
    config.loggerController.warn('There is a user which email is the same as another user\'s username, logging in based on username');
    user = results.filter((user) => user.username === username)[0];
  } else {
    user = results[0];
  }

  isValidPassword = await passwordCrypto.compare(password, user.password);
  const accountLockoutPolicy = new AccountLockout(user, config);
  await accountLockoutPolicy.handleLoginAttempt(isValidPassword);
  if (!isValidPassword) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
  }
  // Ensure the user isn't locked out
  // A locked out user won't be able to login
  // To lock a user out, just set the ACL to `masterKey` only  ({}).
  // Empty ACL is OK
  if (!auth.isMaster && user.ACL && Object.keys(user.ACL).length == 0) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
  }
  if (config.verifyUserEmails && config.preventLoginWithUnverifiedEmail && !user.emailVerified) {
    throw new Parse.Error(Parse.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
  }

  delete user.password;

  // Sometimes the authData still has null on that keys
  // https://github.com/parse-community/parse-server/issues/935
  if (user.authData) {
    Object.keys(user.authData).forEach((provider) => {
      if (user.authData[provider] === null) {
        delete user.authData[provider];
      }
    });
    if (Object.keys(user.authData).length == 0) {
      delete user.authData;
    }
  }

  return user;
}

export async function logIn({ username, password, email }, config, auth, installationId) {
  const user = await verifyCredentials({ username, password, email }, config, auth);
  // handle password expiry policy
  if (config.passwordPolicy && config.passwordPolicy.maxPasswordAge) {
    let changedAt = user._password_changed_at;

    if (!changedAt) {
      // password was created before expiry policy was enabled.
      // simply update _User object so that it will start enforcing from now
      changedAt = new Date();
      config.database.update('_User', { username: user.username },
        { _password_changed_at: Parse._encode(changedAt) });
    } else {
      // check whether the password has expired
      if (changedAt.__type == 'Date') {
        changedAt = new Date(changedAt.iso);
      }
      // Calculate the expiry time.
      const expiresAt = new Date(changedAt.getTime() + 86400000 * config.passwordPolicy.maxPasswordAge);
      if (expiresAt < new Date()) // fail of current time is past password expiry time
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Your password has expired. Please reset your password.');
    }
  }

  // Remove hidden properties.
  removeHiddenProperties(user);

  const {
    sessionData,
    createSession
  } = Auth.createSession(config, {
    userId: user.objectId, createdWith: {
      'action': 'login',
      'authProvider': 'password'
    }, installationId: installationId
  });

  user.sessionToken = sessionData.sessionToken;

  config.filesController.expandFilesInObject(config, user);

  await createSession();
  return user;
}
