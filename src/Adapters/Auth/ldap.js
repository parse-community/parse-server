const ldapjs = require('ldapjs');
const Parse = require('parse/node').Parse;

function validateAuthData(authData, options) {
  if (!optionsAreValid(options)) {
    return new Promise((_, reject) => {
      reject(new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'LDAP auth configuration missing'));
    });
  }
  const clientOptions = options.url.startsWith('ldaps://')
    ? { url: options.url, tlsOptions: options.tlsOptions }
    : { url: options.url };

  const client = ldapjs.createClient(clientOptions);
  const userCn =
    typeof options.dn === 'string'
      ? options.dn.replace('{{id}}', authData.id)
      : `uid=${authData.id},${options.suffix}`;

  return new Promise((resolve, reject) => {
    client.bind(userCn, authData.password, ldapError => {
      delete authData.password;
      if (ldapError) {
        let error;
        switch (ldapError.code) {
          case 49:
            error = new Parse.Error(
              Parse.Error.OBJECT_NOT_FOUND,
              'LDAP: Wrong username or password'
            );
            break;
          case 'DEPTH_ZERO_SELF_SIGNED_CERT':
            error = new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'LDAPS: Certificate mismatch');
            break;
          default:
            error = new Parse.Error(
              Parse.Error.OBJECT_NOT_FOUND,
              'LDAP: Somthing went wrong (' + ldapError.code + ')'
            );
        }
        reject(error);
        client.destroy(ldapError);
        return;
      }

      if (typeof options.groupCn === 'string' && typeof options.groupFilter === 'string') {
        searchForGroup(client, options, authData.id, resolve, reject);
      } else {
        client.unbind();
        client.destroy();
        resolve();
      }
    });
  });
}

function optionsAreValid(options) {
  return (
    typeof options === 'object' &&
    typeof options.suffix === 'string' &&
    typeof options.url === 'string' &&
    (options.url.startsWith('ldap://') ||
      (options.url.startsWith('ldaps://') && typeof options.tlsOptions === 'object'))
  );
}

function searchForGroup(client, options, id, resolve, reject) {
  const filter = options.groupFilter.replace(/{{id}}/gi, id);
  const opts = {
    scope: 'sub',
    filter: filter,
  };
  let found = false;
  client.search(options.suffix, opts, (searchError, res) => {
    if (searchError) {
      client.unbind();
      client.destroy();
      return reject(new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'LDAP group search failed'));
    }
    res.on('searchEntry', entry => {
      if (entry.object.cn === options.groupCn) {
        found = true;
        client.unbind();
        client.destroy();
        return resolve();
      }
    });
    res.on('end', () => {
      if (!found) {
        client.unbind();
        client.destroy();
        return reject(
          new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'LDAP: User not in group')
        );
      }
    });
    res.on('error', () => {
      return reject(new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'LDAP group search failed'));
    });
  });
}

function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId,
  validateAuthData,
};
