const jwt = require('jsonwebtoken');
const util = require('util');
import ParseError from '../../ParseError';

const getHeaderFromToken = token => {
  const decodedToken = jwt.decode(token, { complete: true });
  if (!decodedToken) {
    throw new ParseError(ParseError.OBJECT_NOT_FOUND, `provided token does not decode as JWT`);
  }

  return decodedToken.header;
};

/**
 * Returns the signing key from a JWKS client.
 * @param {Object} client The JWKS client.
 * @param {String} key The kid.
 */
async function getSigningKey(client, key) {
  return util.promisify(client.getSigningKey)(key);
}
module.exports = {
  getHeaderFromToken,
  getSigningKey,
};
