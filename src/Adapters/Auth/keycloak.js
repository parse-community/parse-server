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

const { Parse } = require('parse/node');
const httpsRequest = require('./httpsRequest');

const arraysEqual = (_arr1, _arr2) => {
  if (!Array.isArray(_arr1) || !Array.isArray(_arr2) || _arr1.length !== _arr2.length) return false;

  var arr1 = _arr1.concat().sort();
  var arr2 = _arr2.concat().sort();

  for (var i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }

  return true;
};

const handleAuth = async ({ access_token, id, roles, groups } = {}, { config } = {}) => {
  if (!(access_token && id)) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Missing access token and/or User id');
  }
  if (!config || !(config['auth-server-url'] && config['realm'])) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Missing keycloak configuration');
  }
  try {
    const response = await httpsRequest.get({
      host: config['auth-server-url'],
      path: `/realms/${config['realm']}/protocol/openid-connect/userinfo`,
      headers: {
        Authorization: 'Bearer ' + access_token,
      },
    });
    if (
      response &&
      response.data &&
      response.data.sub == id &&
      arraysEqual(response.data.roles, roles) &&
      arraysEqual(response.data.groups, groups)
    ) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid authentication');
  } catch (e) {
    if (e instanceof Parse.Error) {
      throw e;
    }
    const error = JSON.parse(e.text);
    if (error.error_description) {
      throw new Parse.Error(Parse.Error.HOSTING_ERROR, error.error_description);
    } else {
      throw new Parse.Error(
        Parse.Error.HOSTING_ERROR,
        'Could not connect to the authentication server'
      );
    }
  }
};

/*
  @param {Object} authData: the client provided authData
  @param {string} authData.access_token: the access_token retrieved from client authentication in Keycloak
  @param {string} authData.id: the id retrieved from client authentication in Keycloak
  @param {Array}  authData.roles: the roles retrieved from client authentication in Keycloak
  @param {Array}  authData.groups: the groups retrieved from client authentication in Keycloak
  @param {Object} options: additional options
  @param {Object} options.config: the config object passed during Parse Server instantiation
*/
function validateAuthData(authData, options = {}) {
  return handleAuth(authData, options);
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId,
  validateAuthData,
};
