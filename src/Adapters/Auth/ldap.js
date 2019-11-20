const ldapjs = require('ldapjs');
const Parse = require('parse/node').Parse;

function validateAuthData(authData, options) {
  if (!optionsAreValid(options)) {
    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      'LDAP auth configuration missing'
    );
  }

  const client = ldapjs.createClient({ url: options.url });
  const userCn =
    typeof options.dn === 'string'
      ? options.dn.replace('{{id}}', authData.id)
      : `uid=${authData.id},${options.suffix}`;

  return new Promise((resolve, reject) => {
    client.bind(userCn, authData.password, err => {
      if (err) {
        client.destroy(err);
        return reject(
          new Parse.Error(
            Parse.Error.OBJECT_NOT_FOUND,
            'LDAP: Wrong username or password'
          )
        );
      }

      if (
        typeof options.groupCn === 'string' &&
        typeof options.groupFilter === 'string'
      ) {
        const filter = options.groupFilter.replace(/{{id}}/gi, authData.id);
        const opts = {
          scope: 'sub',
          filter: filter,
        };
        let found = false;
        client.search(options.suffix, opts, (searchError, res) => {
          if (searchError) {
            throw new Parse.Error(
              Parse.Error.INTERNAL_SERVER_ERROR,
              'LDAP group search failed'
            );
          }
          res.on('searchEntry', function(entry) {
            if (entry.object.cn === options.groupCn) {
              found = true;
              client.unbind();
              client.destroy();
              return resolve();
            }
          });
          res.on('end', function() {
            if (!found) {
              client.unbind();
              client.destroy();
              reject(
                new Parse.Error(
                  Parse.Error.INTERNAL_SERVER_ERROR,
                  'LDAP: User not in group'
                )
              );
            }
          });
        });
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
    options.url.startsWith('ldap://')
  );
}

function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId,
  validateAuthData,
};
