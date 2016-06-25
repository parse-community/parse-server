
export default class HTTPResponse {
  constructor(response, body) {
    this.status = response.statusCode;
    this.headers = response.headers || {};
    this.cookies = this.headers["set-cookie"];
    
    this.body = body;
    if (typeof body == 'string') {
      this._text = body;
    } else if (Buffer.isBuffer(body)) {
      this.buffer = body;
    } else if (typeof body == 'object') {
      this._data = body;
    }
  }
  
  get text() {
    if (!this._text && this.buffer) {
      this._text = this.buffer.toString('utf-8');
    } else if (!this._text && this._data) {
      this._text = JSON.stringify(this._data);
    }
    return this._text;
  }

  get data() {
    if (!this._data) {
      try {
        this._data = JSON.parse(this.text);
      } catch (e) {}
    }
    return this._data;
  }

  toJSON() {
    let plainObject = Object.assign({}, this);
    plainObject.text = this.text;
    plainObject.data = this.data;
    delete plainObject._text;
    delete plainObject._data;
    return plainObject;
  }
}
