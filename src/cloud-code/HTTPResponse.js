/**
 * @typedef Parse.Cloud.HTTPResponse
 * @property {Buffer} buffer The raw byte representation of the response body. Use this to receive binary data. See Buffer for more details.
 * @property {Object} cookies The cookies sent by the server. The keys in this object are the names of the cookies. The values are Parse.Cloud.Cookie objects.
 * @property {Object} data The parsed response body as a JavaScript object. This is only available when the response Content-Type is application/x-www-form-urlencoded or application/json.
 * @property {Object} headers The headers sent by the server. The keys in this object are the names of the headers. We do not support multiple response headers with the same name. In the common case of Set-Cookie headers, please use the cookies field instead.
 * @property {Number} status The status code.
 * @property {String} text The raw text representation of the response body.
 */
export default class HTTPResponse {
  constructor(response, body) {
    let _text, _data;
    this.status = response.statusCode;
    this.headers = response.headers || {};
    this.cookies = this.headers['set-cookie'];

    if (typeof body == 'string') {
      _text = body;
    } else if (Buffer.isBuffer(body)) {
      this.buffer = body;
    } else if (typeof body == 'object') {
      _data = body;
    }

    const getText = () => {
      if (!_text && this.buffer) {
        _text = this.buffer.toString('utf-8');
      } else if (!_text && _data) {
        _text = JSON.stringify(_data);
      }
      return _text;
    };

    const getData = () => {
      if (!_data) {
        try {
          _data = JSON.parse(getText());
        } catch (e) {
          /* */
        }
      }
      return _data;
    };

    Object.defineProperty(this, 'body', {
      get: () => {
        return body;
      },
    });

    Object.defineProperty(this, 'text', {
      enumerable: true,
      get: getText,
    });

    Object.defineProperty(this, 'data', {
      enumerable: true,
      get: getData,
    });
  }
}
