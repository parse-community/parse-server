"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
/**
 * @typedef Parse.Cloud.HTTPResponse
 * @property {Buffer} buffer The raw byte representation of the response body. Use this to receive binary data. See Buffer for more details.
 * @property {Object} cookies The cookies sent by the server. The keys in this object are the names of the cookies. The values are Parse.Cloud.Cookie objects.
 * @property {Object} data The parsed response body as a JavaScript object. This is only available when the response Content-Type is application/x-www-form-urlencoded or application/json.
 * @property {Object} headers The headers sent by the server. The keys in this object are the names of the headers. We do not support multiple response headers with the same name. In the common case of Set-Cookie headers, please use the cookies field instead.
 * @property {Number} status The status code.
 * @property {String} text The raw text representation of the response body.
 */
class HTTPResponse {
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
      }
    });
    Object.defineProperty(this, 'text', {
      enumerable: true,
      get: getText
    });
    Object.defineProperty(this, 'data', {
      enumerable: true,
      get: getData
    });
  }
}
exports.default = HTTPResponse;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJIVFRQUmVzcG9uc2UiLCJjb25zdHJ1Y3RvciIsInJlc3BvbnNlIiwiYm9keSIsIl90ZXh0IiwiX2RhdGEiLCJzdGF0dXMiLCJzdGF0dXNDb2RlIiwiaGVhZGVycyIsImNvb2tpZXMiLCJCdWZmZXIiLCJpc0J1ZmZlciIsImJ1ZmZlciIsImdldFRleHQiLCJ0b1N0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJnZXREYXRhIiwicGFyc2UiLCJlIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXQiLCJlbnVtZXJhYmxlIiwiZXhwb3J0cyIsImRlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvY2xvdWQtY29kZS9IVFRQUmVzcG9uc2UuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAdHlwZWRlZiBQYXJzZS5DbG91ZC5IVFRQUmVzcG9uc2VcbiAqIEBwcm9wZXJ0eSB7QnVmZmVyfSBidWZmZXIgVGhlIHJhdyBieXRlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSByZXNwb25zZSBib2R5LiBVc2UgdGhpcyB0byByZWNlaXZlIGJpbmFyeSBkYXRhLiBTZWUgQnVmZmVyIGZvciBtb3JlIGRldGFpbHMuXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29va2llcyBUaGUgY29va2llcyBzZW50IGJ5IHRoZSBzZXJ2ZXIuIFRoZSBrZXlzIGluIHRoaXMgb2JqZWN0IGFyZSB0aGUgbmFtZXMgb2YgdGhlIGNvb2tpZXMuIFRoZSB2YWx1ZXMgYXJlIFBhcnNlLkNsb3VkLkNvb2tpZSBvYmplY3RzLlxuICogQHByb3BlcnR5IHtPYmplY3R9IGRhdGEgVGhlIHBhcnNlZCByZXNwb25zZSBib2R5IGFzIGEgSmF2YVNjcmlwdCBvYmplY3QuIFRoaXMgaXMgb25seSBhdmFpbGFibGUgd2hlbiB0aGUgcmVzcG9uc2UgQ29udGVudC1UeXBlIGlzIGFwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCBvciBhcHBsaWNhdGlvbi9qc29uLlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIGhlYWRlcnMgc2VudCBieSB0aGUgc2VydmVyLiBUaGUga2V5cyBpbiB0aGlzIG9iamVjdCBhcmUgdGhlIG5hbWVzIG9mIHRoZSBoZWFkZXJzLiBXZSBkbyBub3Qgc3VwcG9ydCBtdWx0aXBsZSByZXNwb25zZSBoZWFkZXJzIHdpdGggdGhlIHNhbWUgbmFtZS4gSW4gdGhlIGNvbW1vbiBjYXNlIG9mIFNldC1Db29raWUgaGVhZGVycywgcGxlYXNlIHVzZSB0aGUgY29va2llcyBmaWVsZCBpbnN0ZWFkLlxuICogQHByb3BlcnR5IHtOdW1iZXJ9IHN0YXR1cyBUaGUgc3RhdHVzIGNvZGUuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdGV4dCBUaGUgcmF3IHRleHQgcmVwcmVzZW50YXRpb24gb2YgdGhlIHJlc3BvbnNlIGJvZHkuXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEhUVFBSZXNwb25zZSB7XG4gIGNvbnN0cnVjdG9yKHJlc3BvbnNlLCBib2R5KSB7XG4gICAgbGV0IF90ZXh0LCBfZGF0YTtcbiAgICB0aGlzLnN0YXR1cyA9IHJlc3BvbnNlLnN0YXR1c0NvZGU7XG4gICAgdGhpcy5oZWFkZXJzID0gcmVzcG9uc2UuaGVhZGVycyB8fCB7fTtcbiAgICB0aGlzLmNvb2tpZXMgPSB0aGlzLmhlYWRlcnNbJ3NldC1jb29raWUnXTtcblxuICAgIGlmICh0eXBlb2YgYm9keSA9PSAnc3RyaW5nJykge1xuICAgICAgX3RleHQgPSBib2R5O1xuICAgIH0gZWxzZSBpZiAoQnVmZmVyLmlzQnVmZmVyKGJvZHkpKSB7XG4gICAgICB0aGlzLmJ1ZmZlciA9IGJvZHk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgYm9keSA9PSAnb2JqZWN0Jykge1xuICAgICAgX2RhdGEgPSBib2R5O1xuICAgIH1cblxuICAgIGNvbnN0IGdldFRleHQgPSAoKSA9PiB7XG4gICAgICBpZiAoIV90ZXh0ICYmIHRoaXMuYnVmZmVyKSB7XG4gICAgICAgIF90ZXh0ID0gdGhpcy5idWZmZXIudG9TdHJpbmcoJ3V0Zi04Jyk7XG4gICAgICB9IGVsc2UgaWYgKCFfdGV4dCAmJiBfZGF0YSkge1xuICAgICAgICBfdGV4dCA9IEpTT04uc3RyaW5naWZ5KF9kYXRhKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBfdGV4dDtcbiAgICB9O1xuXG4gICAgY29uc3QgZ2V0RGF0YSA9ICgpID0+IHtcbiAgICAgIGlmICghX2RhdGEpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBfZGF0YSA9IEpTT04ucGFyc2UoZ2V0VGV4dCgpKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8qICovXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBfZGF0YTtcbiAgICB9O1xuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICdib2R5Jywge1xuICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgIHJldHVybiBib2R5O1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCAndGV4dCcsIHtcbiAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICBnZXQ6IGdldFRleHQsXG4gICAgfSk7XG5cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgJ2RhdGEnLCB7XG4gICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgZ2V0OiBnZXREYXRhLFxuICAgIH0pO1xuICB9XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNlLE1BQU1BLFlBQVksQ0FBQztFQUNoQ0MsV0FBV0EsQ0FBQ0MsUUFBUSxFQUFFQyxJQUFJLEVBQUU7SUFDMUIsSUFBSUMsS0FBSyxFQUFFQyxLQUFLO0lBQ2hCLElBQUksQ0FBQ0MsTUFBTSxHQUFHSixRQUFRLENBQUNLLFVBQVU7SUFDakMsSUFBSSxDQUFDQyxPQUFPLEdBQUdOLFFBQVEsQ0FBQ00sT0FBTyxJQUFJLENBQUMsQ0FBQztJQUNyQyxJQUFJLENBQUNDLE9BQU8sR0FBRyxJQUFJLENBQUNELE9BQU8sQ0FBQyxZQUFZLENBQUM7SUFFekMsSUFBSSxPQUFPTCxJQUFJLElBQUksUUFBUSxFQUFFO01BQzNCQyxLQUFLLEdBQUdELElBQUk7SUFDZCxDQUFDLE1BQU0sSUFBSU8sTUFBTSxDQUFDQyxRQUFRLENBQUNSLElBQUksQ0FBQyxFQUFFO01BQ2hDLElBQUksQ0FBQ1MsTUFBTSxHQUFHVCxJQUFJO0lBQ3BCLENBQUMsTUFBTSxJQUFJLE9BQU9BLElBQUksSUFBSSxRQUFRLEVBQUU7TUFDbENFLEtBQUssR0FBR0YsSUFBSTtJQUNkO0lBRUEsTUFBTVUsT0FBTyxHQUFHQSxDQUFBLEtBQU07TUFDcEIsSUFBSSxDQUFDVCxLQUFLLElBQUksSUFBSSxDQUFDUSxNQUFNLEVBQUU7UUFDekJSLEtBQUssR0FBRyxJQUFJLENBQUNRLE1BQU0sQ0FBQ0UsUUFBUSxDQUFDLE9BQU8sQ0FBQztNQUN2QyxDQUFDLE1BQU0sSUFBSSxDQUFDVixLQUFLLElBQUlDLEtBQUssRUFBRTtRQUMxQkQsS0FBSyxHQUFHVyxJQUFJLENBQUNDLFNBQVMsQ0FBQ1gsS0FBSyxDQUFDO01BQy9CO01BQ0EsT0FBT0QsS0FBSztJQUNkLENBQUM7SUFFRCxNQUFNYSxPQUFPLEdBQUdBLENBQUEsS0FBTTtNQUNwQixJQUFJLENBQUNaLEtBQUssRUFBRTtRQUNWLElBQUk7VUFDRkEsS0FBSyxHQUFHVSxJQUFJLENBQUNHLEtBQUssQ0FBQ0wsT0FBTyxFQUFFLENBQUM7UUFDL0IsQ0FBQyxDQUFDLE9BQU9NLENBQUMsRUFBRTtVQUNWO1FBQUE7TUFFSjtNQUNBLE9BQU9kLEtBQUs7SUFDZCxDQUFDO0lBRURlLE1BQU0sQ0FBQ0MsY0FBYyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUU7TUFDbENDLEdBQUcsRUFBRUEsQ0FBQSxLQUFNO1FBQ1QsT0FBT25CLElBQUk7TUFDYjtJQUNGLENBQUMsQ0FBQztJQUVGaUIsTUFBTSxDQUFDQyxjQUFjLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRTtNQUNsQ0UsVUFBVSxFQUFFLElBQUk7TUFDaEJELEdBQUcsRUFBRVQ7SUFDUCxDQUFDLENBQUM7SUFFRk8sTUFBTSxDQUFDQyxjQUFjLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRTtNQUNsQ0UsVUFBVSxFQUFFLElBQUk7TUFDaEJELEdBQUcsRUFBRUw7SUFDUCxDQUFDLENBQUM7RUFDSjtBQUNGO0FBQUNPLE9BQUEsQ0FBQUMsT0FBQSxHQUFBekIsWUFBQSJ9