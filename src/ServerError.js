/**
 * Constructs a new ServerError object with the given message and source.
 *
 * The message is an error that the consumer of the server API will see,
 * while the source message is intended for the server logs to aid a developer
 *
 * @class ServerError
 * @constructor
 * @param {String} message A detailed description of the error.
 * @param {ParseError} source The
 */
export default class ServerError extends Error {
  source;

  constructor(message, source) {
    super(message);
    this.source = source;
  }
}
