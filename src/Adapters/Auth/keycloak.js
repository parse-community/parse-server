/*
  # Parse Server Keycloak Authentication

  ## Keycloak `authData`

  ```
    {
      "keycloak": {
        "access_token": "access token you got from keycloak JS client authentication",
        "id": "the id retrieved from client authentication in Keycloak",
        "roles": ["the roles retrieved from client authentication in Keycloak"],
        "groups": ["the groups retrieved from client authentication in Keycloak"]
      }
    }
  ```

  The authentication module will test if the authData is the same as the
  userinfo oauth call, comparing the attributes

  Copy the JSON config file generated on Keycloak (https://www.keycloak.org/docs/latest/securing_apps/index.html#_javascript_adapter)
  and paste it inside of a folder (Ex.: `auth/keycloak.json`) in your server.

  The options passed to Parse server:

  ```
    {
      auth: {
        keycloak: {
          config: require(`./auth/keycloak.json`)
        }
      }
    }
  ```
*/

var Parse = require('parse/node').Parse;

const arraysEqual = (_arr1, _arr2) => {
  if (
    !Array.isArray(_arr1) ||
    !Array.isArray(_arr2) ||
    _arr1.length !== _arr2.length
  )
    return false;

  var arr1 = _arr1.concat().sort();
  var arr2 = _arr2.concat().sort();

  for (var i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }

  return true;
};

const userinfoURL = config => {
  if (!(config['auth-server-url'] && config['realm']))
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Missing keycloak configuration'
    );

  return (
    config['auth-server-url'] +
    '/realms/' +
    config['realm'] +
    '/protocol/openid-connect/userinfo'
  );
};

export class KeycloakAuthAdapter {
  validateAppId() {
    return Promise.resolve();
  }

  /*
  @param {Object} authData: the client provided authData
  @param {string} authData.access_token: the access_token retrieved from client authentication in Keycloak
  @param {string} authData.id: the id retrieved from client authentication in Keycloak
  @param {Array}  authData.roles: the roles retrieved from client authentication in Keycloak
  @param {Array}  authData.groups: the groups retrieved from client authentication in Keycloak
  @param {Object} options: additional options
  @param {Object} options.config: the config object passed during Parse Server instantiation
   */
  validateAuthData({ access_token, id, roles, groups }, { config }) {
    if (process.env.NODE_ENV === 'development') return Promise.resolve();

    if (!(access_token && id))
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Missing access token and/or User id'
      );
    if (!config)
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Missing keycloak configuration'
      );
    return Parse.Cloud.httpRequest({
      url: userinfoURL(config),
      headers: {
        Authorization: 'Bearer ' + access_token,
      },
    })
      .then(response => {
        if (
          response.data &&
          response.data.sub == id &&
          arraysEqual(response.data.roles, roles) &&
          arraysEqual(response.data.groups, groups)
        ) {
          return;
        }
        throw new Parse.Error(
          Parse.Error.OBJECT_NOT_FOUND,
          'Invalid authentication'
        );
      })
      .catch(e => {
        const error = JSON.parse(e.text);
        if (error.error_description) {
          throw new Parse.Error(
            Parse.Error.HOSTING_ERROR,
            error.error_description
          );
        } else {
          throw new Parse.Error(
            Parse.Error.HOSTING_ERROR,
            'Could not connect to the authentication server'
          );
        }
      });
  }
}

export default KeycloakAuthAdapter;
