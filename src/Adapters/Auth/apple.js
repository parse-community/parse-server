// Apple SignIn Auth
// https://developer.apple.com/documentation/signinwithapplerestapi

const Parse = require("parse/node").Parse;
const jwksClient = require("jwks-rsa");
const util = require("util");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const request = require("request");

const TOKEN_ISSUER = "https://appleid.apple.com";

function accessToken(privateKeyPath, config, code) {
  return new Promise(
    (resolve, reject) => {
      generate(config, privateKeyPath)
        .then(
          (token) => {
            const payload = {
              grant_type: "authorization_code",
              code,
              redirect_uri: config.redirect_uri,
              client_id: config.client_id,
              client_secret: token
            };

            request.post("https://appleid.apple.com/auth/token", {
              form: payload,
              json: true
            }, (error, response, body) => {
              if (error) {
                reject(`AppleAuth Error - An error occured while getting a response from Apple's servers: ${ response }`);

                return;
              }

              resolve(body);
            });
          }
        ).catch(
          (error) => reject(error)
        );
    }
  );
}

function generate(config, privateKeyPath) {
  return new Promise(
    (resolve, reject) => {
      const privateKey = fs.readFileSync(privateKeyPath);

      // make it expire within 6 months
      const exp = Math.floor(Date.now() / 1000) + (86400 * 180);
      const claims = {
        iss: config.team_id,
        iat: Math.floor(Date.now() / 1000),
        exp,
        aud: "https://appleid.apple.com",
        sub: config.client_id
      };

      jwt.sign(claims, privateKey, {
        algorithm: "ES256",
        keyid: config.key_id
      },
      (error, token) => {
        if (error) {
          reject(`AppleAuth Error - Error occured while signing: ${ error }`);
          return;
        }

        resolve(token);
      }
      );
    }
  );
}

const getAppleKeyByKeyId = async (keyId, cacheMaxEntries, cacheMaxAge) => {
  const client = jwksClient({
    jwksUri: `${ TOKEN_ISSUER }/auth/keys`,
    cache: true,
    cacheMaxEntries,
    cacheMaxAge,
  });

  const asyncGetSigningKeyFunction = util.promisify(client.getSigningKey);

  let key;
  try {
    key = await asyncGetSigningKeyFunction(keyId);
  } catch (error) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Unable to find matching key for Key ID: ${keyId}`
    );
  }
  return key;
};

const getHeaderFromToken = token => {
  const decodedToken = jwt.decode(token, {
    complete: true
  });
  if (!decodedToken) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `provided token does not decode as JWT`
    );
  }

  return decodedToken.header;
};

const verifyIdToken = async ({
  token,
  id,
  code
}, {
    clientId,
    cacheMaxEntries,
    cacheMaxAge,
    config,
    p8FilePath
  }) => {
  if (!code && !token) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `token or code must be provided`
    );
  }

  if (code) {
    if (!p8FilePath) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        `p8 file path must be provided`
      );
    }

    // config requires fields like client id again as the config can only have one client id and therefore cannot be an array
    // also scope must be set at time of requesting token, that is independant of the token when retrieving a token from a
    // request rather than from an apple device
    if (!config || (!config.client_id || !config.team_id || !config.key_id || !config.redirect_uri)) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        `config malformed or not provided`
      );
    }

    // no need to check for no response as otherwise an error would be thrown
    // in the accessToken function
    const response = await accessToken(p8FilePath, config, code);

    if (response.error) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        `apple request with code has returned error: ${ response.error }`
      );
    }

    token = response.id_token;

    const decodedToken = jwt.decode(token);

    id = decodedToken.sub
  }

  if (!token) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `id token is invalid for this user.`
    );
  }

  const {
    kid: keyId,
    alg: algorithm
  } = getHeaderFromToken(token);
  const ONE_HOUR_IN_MS = 3600000;
  let jwtClaims;

  cacheMaxAge = cacheMaxAge || ONE_HOUR_IN_MS;
  cacheMaxEntries = cacheMaxEntries || 5;

  const appleKey = await getAppleKeyByKeyId(
    keyId,
    cacheMaxEntries,
    cacheMaxAge
  );
  const signingKey = appleKey.publicKey || appleKey.rsaPublicKey;

  try {
    jwtClaims = jwt.verify(token, signingKey, {
      algorithms: algorithm,
      // the audience can be checked against a string, a regular expression or a list of strings and/or regular expressions.
      audience: clientId,
      issuer: TOKEN_ISSUER,
      subject: id
    });
  } catch (exception) {
    const message = exception.message;

    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${message}`);
  }

  return jwtClaims;
};

// Returns a promise that fulfills if this id token is valid
function validateAuthData(authData, options = {}) {
  return verifyIdToken(authData, options);
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId,
  validateAuthData,
};
