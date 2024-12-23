export default class TriggerResponse {
  status(status) {
    this._status = status;
  }
  setHeader(name, value) {
    this._headers = this._headers || {};
    this._headers[name] = value;
  }

  toResponseObject(response) {
    return {
      response: response.response,
      status: this._status || response.status,
      headers: this._headers,
      location: response.location,
    };
  }
}
