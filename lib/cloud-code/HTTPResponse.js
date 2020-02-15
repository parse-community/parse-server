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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jbG91ZC1jb2RlL0hUVFBSZXNwb25zZS5qcyJdLCJuYW1lcyI6WyJIVFRQUmVzcG9uc2UiLCJjb25zdHJ1Y3RvciIsInJlc3BvbnNlIiwiYm9keSIsIl90ZXh0IiwiX2RhdGEiLCJzdGF0dXMiLCJzdGF0dXNDb2RlIiwiaGVhZGVycyIsImNvb2tpZXMiLCJCdWZmZXIiLCJpc0J1ZmZlciIsImJ1ZmZlciIsImdldFRleHQiLCJ0b1N0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJnZXREYXRhIiwicGFyc2UiLCJlIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXQiLCJlbnVtZXJhYmxlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7Ozs7Ozs7OztBQVNlLE1BQU1BLFlBQU4sQ0FBbUI7QUFDaENDLEVBQUFBLFdBQVcsQ0FBQ0MsUUFBRCxFQUFXQyxJQUFYLEVBQWlCO0FBQzFCLFFBQUlDLEtBQUosRUFBV0MsS0FBWDs7QUFDQSxTQUFLQyxNQUFMLEdBQWNKLFFBQVEsQ0FBQ0ssVUFBdkI7QUFDQSxTQUFLQyxPQUFMLEdBQWVOLFFBQVEsQ0FBQ00sT0FBVCxJQUFvQixFQUFuQztBQUNBLFNBQUtDLE9BQUwsR0FBZSxLQUFLRCxPQUFMLENBQWEsWUFBYixDQUFmOztBQUVBLFFBQUksT0FBT0wsSUFBUCxJQUFlLFFBQW5CLEVBQTZCO0FBQzNCQyxNQUFBQSxLQUFLLEdBQUdELElBQVI7QUFDRCxLQUZELE1BRU8sSUFBSU8sTUFBTSxDQUFDQyxRQUFQLENBQWdCUixJQUFoQixDQUFKLEVBQTJCO0FBQ2hDLFdBQUtTLE1BQUwsR0FBY1QsSUFBZDtBQUNELEtBRk0sTUFFQSxJQUFJLE9BQU9BLElBQVAsSUFBZSxRQUFuQixFQUE2QjtBQUNsQ0UsTUFBQUEsS0FBSyxHQUFHRixJQUFSO0FBQ0Q7O0FBRUQsVUFBTVUsT0FBTyxHQUFHLE1BQU07QUFDcEIsVUFBSSxDQUFDVCxLQUFELElBQVUsS0FBS1EsTUFBbkIsRUFBMkI7QUFDekJSLFFBQUFBLEtBQUssR0FBRyxLQUFLUSxNQUFMLENBQVlFLFFBQVosQ0FBcUIsT0FBckIsQ0FBUjtBQUNELE9BRkQsTUFFTyxJQUFJLENBQUNWLEtBQUQsSUFBVUMsS0FBZCxFQUFxQjtBQUMxQkQsUUFBQUEsS0FBSyxHQUFHVyxJQUFJLENBQUNDLFNBQUwsQ0FBZVgsS0FBZixDQUFSO0FBQ0Q7O0FBQ0QsYUFBT0QsS0FBUDtBQUNELEtBUEQ7O0FBU0EsVUFBTWEsT0FBTyxHQUFHLE1BQU07QUFDcEIsVUFBSSxDQUFDWixLQUFMLEVBQVk7QUFDVixZQUFJO0FBQ0ZBLFVBQUFBLEtBQUssR0FBR1UsSUFBSSxDQUFDRyxLQUFMLENBQVdMLE9BQU8sRUFBbEIsQ0FBUjtBQUNELFNBRkQsQ0FFRSxPQUFPTSxDQUFQLEVBQVU7QUFDVjtBQUNEO0FBQ0Y7O0FBQ0QsYUFBT2QsS0FBUDtBQUNELEtBVEQ7O0FBV0FlLElBQUFBLE1BQU0sQ0FBQ0MsY0FBUCxDQUFzQixJQUF0QixFQUE0QixNQUE1QixFQUFvQztBQUNsQ0MsTUFBQUEsR0FBRyxFQUFFLE1BQU07QUFDVCxlQUFPbkIsSUFBUDtBQUNEO0FBSGlDLEtBQXBDO0FBTUFpQixJQUFBQSxNQUFNLENBQUNDLGNBQVAsQ0FBc0IsSUFBdEIsRUFBNEIsTUFBNUIsRUFBb0M7QUFDbENFLE1BQUFBLFVBQVUsRUFBRSxJQURzQjtBQUVsQ0QsTUFBQUEsR0FBRyxFQUFFVDtBQUY2QixLQUFwQztBQUtBTyxJQUFBQSxNQUFNLENBQUNDLGNBQVAsQ0FBc0IsSUFBdEIsRUFBNEIsTUFBNUIsRUFBb0M7QUFDbENFLE1BQUFBLFVBQVUsRUFBRSxJQURzQjtBQUVsQ0QsTUFBQUEsR0FBRyxFQUFFTDtBQUY2QixLQUFwQztBQUlEOztBQWxEK0IiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEB0eXBlZGVmIFBhcnNlLkNsb3VkLkhUVFBSZXNwb25zZVxuICogQHByb3BlcnR5IHtCdWZmZXJ9IGJ1ZmZlciBUaGUgcmF3IGJ5dGUgcmVwcmVzZW50YXRpb24gb2YgdGhlIHJlc3BvbnNlIGJvZHkuIFVzZSB0aGlzIHRvIHJlY2VpdmUgYmluYXJ5IGRhdGEuIFNlZSBCdWZmZXIgZm9yIG1vcmUgZGV0YWlscy5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb29raWVzIFRoZSBjb29raWVzIHNlbnQgYnkgdGhlIHNlcnZlci4gVGhlIGtleXMgaW4gdGhpcyBvYmplY3QgYXJlIHRoZSBuYW1lcyBvZiB0aGUgY29va2llcy4gVGhlIHZhbHVlcyBhcmUgUGFyc2UuQ2xvdWQuQ29va2llIG9iamVjdHMuXG4gKiBAcHJvcGVydHkge09iamVjdH0gZGF0YSBUaGUgcGFyc2VkIHJlc3BvbnNlIGJvZHkgYXMgYSBKYXZhU2NyaXB0IG9iamVjdC4gVGhpcyBpcyBvbmx5IGF2YWlsYWJsZSB3aGVuIHRoZSByZXNwb25zZSBDb250ZW50LVR5cGUgaXMgYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkIG9yIGFwcGxpY2F0aW9uL2pzb24uXG4gKiBAcHJvcGVydHkge09iamVjdH0gaGVhZGVycyBUaGUgaGVhZGVycyBzZW50IGJ5IHRoZSBzZXJ2ZXIuIFRoZSBrZXlzIGluIHRoaXMgb2JqZWN0IGFyZSB0aGUgbmFtZXMgb2YgdGhlIGhlYWRlcnMuIFdlIGRvIG5vdCBzdXBwb3J0IG11bHRpcGxlIHJlc3BvbnNlIGhlYWRlcnMgd2l0aCB0aGUgc2FtZSBuYW1lLiBJbiB0aGUgY29tbW9uIGNhc2Ugb2YgU2V0LUNvb2tpZSBoZWFkZXJzLCBwbGVhc2UgdXNlIHRoZSBjb29raWVzIGZpZWxkIGluc3RlYWQuXG4gKiBAcHJvcGVydHkge051bWJlcn0gc3RhdHVzIFRoZSBzdGF0dXMgY29kZS5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0ZXh0IFRoZSByYXcgdGV4dCByZXByZXNlbnRhdGlvbiBvZiB0aGUgcmVzcG9uc2UgYm9keS5cbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSFRUUFJlc3BvbnNlIHtcbiAgY29uc3RydWN0b3IocmVzcG9uc2UsIGJvZHkpIHtcbiAgICBsZXQgX3RleHQsIF9kYXRhO1xuICAgIHRoaXMuc3RhdHVzID0gcmVzcG9uc2Uuc3RhdHVzQ29kZTtcbiAgICB0aGlzLmhlYWRlcnMgPSByZXNwb25zZS5oZWFkZXJzIHx8IHt9O1xuICAgIHRoaXMuY29va2llcyA9IHRoaXMuaGVhZGVyc1snc2V0LWNvb2tpZSddO1xuXG4gICAgaWYgKHR5cGVvZiBib2R5ID09ICdzdHJpbmcnKSB7XG4gICAgICBfdGV4dCA9IGJvZHk7XG4gICAgfSBlbHNlIGlmIChCdWZmZXIuaXNCdWZmZXIoYm9keSkpIHtcbiAgICAgIHRoaXMuYnVmZmVyID0gYm9keTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBib2R5ID09ICdvYmplY3QnKSB7XG4gICAgICBfZGF0YSA9IGJvZHk7XG4gICAgfVxuXG4gICAgY29uc3QgZ2V0VGV4dCA9ICgpID0+IHtcbiAgICAgIGlmICghX3RleHQgJiYgdGhpcy5idWZmZXIpIHtcbiAgICAgICAgX3RleHQgPSB0aGlzLmJ1ZmZlci50b1N0cmluZygndXRmLTgnKTtcbiAgICAgIH0gZWxzZSBpZiAoIV90ZXh0ICYmIF9kYXRhKSB7XG4gICAgICAgIF90ZXh0ID0gSlNPTi5zdHJpbmdpZnkoX2RhdGEpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIF90ZXh0O1xuICAgIH07XG5cbiAgICBjb25zdCBnZXREYXRhID0gKCkgPT4ge1xuICAgICAgaWYgKCFfZGF0YSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIF9kYXRhID0gSlNPTi5wYXJzZShnZXRUZXh0KCkpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLyogKi9cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIF9kYXRhO1xuICAgIH07XG5cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgJ2JvZHknLCB7XG4gICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgcmV0dXJuIGJvZHk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICd0ZXh0Jywge1xuICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgIGdldDogZ2V0VGV4dCxcbiAgICB9KTtcblxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCAnZGF0YScsIHtcbiAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICBnZXQ6IGdldERhdGEsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==