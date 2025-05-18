const ParseServer = {};
/**
 * ...
 *
 * @memberof Parse.Server
 * @property {String} global Rate limit based on the number of requests made by all users.
 * @property {String} session Rate limit based on the sessionToken.
 * @property {String} user Rate limit based on the user ID.
 * @property {String} ip Rate limit based on the request ip.
 * ...
 */
ParseServer.RateLimitZone = Object.freeze({
  global: 'global',
  session: 'session',
  user: 'user',
  ip: 'ip',
});

module.exports = ParseServer;
