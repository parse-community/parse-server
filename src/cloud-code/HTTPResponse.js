
export default class HTTPResponse {
  constructor(response) {
    this.status = response.statusCode;
    this.headers = response.headers;
    this.buffer = response.body;
    this.cookies = response.headers["set-cookie"];
  }
  
  get text() {
    return this.buffer.toString('utf-8');
  }
  get data() {
    if (!this._data) {
      try {
        this._data = JSON.parse(this.text);
      } catch (e) {}
    }
    return this._data;
  }
}
