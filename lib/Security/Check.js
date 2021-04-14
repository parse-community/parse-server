"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _Utils = _interopRequireDefault(require("../Utils"));

var _lodash = require("lodash");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * @module SecurityCheck
 */

/**
 * A security check.
 * @class Check
 */
class Check {
  /**
   * Constructs a new security check.
   * @param {Object} params The parameters.
   * @param {String} params.title The title.
   * @param {String} params.warning The warning message if the check fails.
   * @param {String} params.solution The solution to fix the check.
   * @param {Promise} params.check The check as synchronous or asynchronous function.
   */
  constructor(params) {
    this._validateParams(params);

    const {
      title,
      warning,
      solution,
      check
    } = params;
    this.title = title;
    this.warning = warning;
    this.solution = solution;
    this.check = check; // Set default properties

    this._checkState = CheckState.none;
    this.error;
  }
  /**
   * Returns the current check state.
   * @return {CheckState} The check state.
   */


  checkState() {
    return this._checkState;
  }

  async run() {
    // Get check as synchronous or asynchronous function
    const check = this.check instanceof Promise ? await this.check : this.check; // Run check

    try {
      check();
      this._checkState = CheckState.success;
    } catch (e) {
      this.stateFailError = e;
      this._checkState = CheckState.fail;
    }
  }
  /**
   * Validates the constructor parameters.
   * @param {Object} params The parameters to validate.
   */


  _validateParams(params) {
    _Utils.default.validateParams(params, {
      group: {
        t: 'string',
        v: _lodash.isString
      },
      title: {
        t: 'string',
        v: _lodash.isString
      },
      warning: {
        t: 'string',
        v: _lodash.isString
      },
      solution: {
        t: 'string',
        v: _lodash.isString
      },
      check: {
        t: 'function',
        v: _lodash.isFunction
      }
    });
  }

}
/**
 * The check state.
 */


const CheckState = Object.freeze({
  none: 'none',
  fail: 'fail',
  success: 'success'
});
var _default = Check;
exports.default = _default;
module.exports = {
  Check,
  CheckState
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TZWN1cml0eS9DaGVjay5qcyJdLCJuYW1lcyI6WyJDaGVjayIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwiX3ZhbGlkYXRlUGFyYW1zIiwidGl0bGUiLCJ3YXJuaW5nIiwic29sdXRpb24iLCJjaGVjayIsIl9jaGVja1N0YXRlIiwiQ2hlY2tTdGF0ZSIsIm5vbmUiLCJlcnJvciIsImNoZWNrU3RhdGUiLCJydW4iLCJQcm9taXNlIiwic3VjY2VzcyIsImUiLCJzdGF0ZUZhaWxFcnJvciIsImZhaWwiLCJVdGlscyIsInZhbGlkYXRlUGFyYW1zIiwiZ3JvdXAiLCJ0IiwidiIsImlzU3RyaW5nIiwiaXNGdW5jdGlvbiIsIk9iamVjdCIsImZyZWV6ZSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFJQTs7QUFDQTs7OztBQUxBO0FBQ0E7QUFDQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLEtBQU4sQ0FBWTtBQUNWO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDRUMsRUFBQUEsV0FBVyxDQUFDQyxNQUFELEVBQVM7QUFDbEIsU0FBS0MsZUFBTCxDQUFxQkQsTUFBckI7O0FBQ0EsVUFBTTtBQUFFRSxNQUFBQSxLQUFGO0FBQVNDLE1BQUFBLE9BQVQ7QUFBa0JDLE1BQUFBLFFBQWxCO0FBQTRCQyxNQUFBQTtBQUE1QixRQUFzQ0wsTUFBNUM7QUFFQSxTQUFLRSxLQUFMLEdBQWFBLEtBQWI7QUFDQSxTQUFLQyxPQUFMLEdBQWVBLE9BQWY7QUFDQSxTQUFLQyxRQUFMLEdBQWdCQSxRQUFoQjtBQUNBLFNBQUtDLEtBQUwsR0FBYUEsS0FBYixDQVBrQixDQVNsQjs7QUFDQSxTQUFLQyxXQUFMLEdBQW1CQyxVQUFVLENBQUNDLElBQTlCO0FBQ0EsU0FBS0MsS0FBTDtBQUNEO0FBRUQ7QUFDRjtBQUNBO0FBQ0E7OztBQUNFQyxFQUFBQSxVQUFVLEdBQUc7QUFDWCxXQUFPLEtBQUtKLFdBQVo7QUFDRDs7QUFFUSxRQUFISyxHQUFHLEdBQUc7QUFDVjtBQUNBLFVBQU1OLEtBQUssR0FBRyxLQUFLQSxLQUFMLFlBQXNCTyxPQUF0QixHQUFnQyxNQUFNLEtBQUtQLEtBQTNDLEdBQW1ELEtBQUtBLEtBQXRFLENBRlUsQ0FJVjs7QUFDQSxRQUFJO0FBQ0ZBLE1BQUFBLEtBQUs7QUFDTCxXQUFLQyxXQUFMLEdBQW1CQyxVQUFVLENBQUNNLE9BQTlCO0FBQ0QsS0FIRCxDQUdFLE9BQU9DLENBQVAsRUFBVTtBQUNWLFdBQUtDLGNBQUwsR0FBc0JELENBQXRCO0FBQ0EsV0FBS1IsV0FBTCxHQUFtQkMsVUFBVSxDQUFDUyxJQUE5QjtBQUNEO0FBQ0Y7QUFFRDtBQUNGO0FBQ0E7QUFDQTs7O0FBQ0VmLEVBQUFBLGVBQWUsQ0FBQ0QsTUFBRCxFQUFTO0FBQ3RCaUIsbUJBQU1DLGNBQU4sQ0FBcUJsQixNQUFyQixFQUE2QjtBQUMzQm1CLE1BQUFBLEtBQUssRUFBRTtBQUFFQyxRQUFBQSxDQUFDLEVBQUUsUUFBTDtBQUFlQyxRQUFBQSxDQUFDLEVBQUVDO0FBQWxCLE9BRG9CO0FBRTNCcEIsTUFBQUEsS0FBSyxFQUFFO0FBQUVrQixRQUFBQSxDQUFDLEVBQUUsUUFBTDtBQUFlQyxRQUFBQSxDQUFDLEVBQUVDO0FBQWxCLE9BRm9CO0FBRzNCbkIsTUFBQUEsT0FBTyxFQUFFO0FBQUVpQixRQUFBQSxDQUFDLEVBQUUsUUFBTDtBQUFlQyxRQUFBQSxDQUFDLEVBQUVDO0FBQWxCLE9BSGtCO0FBSTNCbEIsTUFBQUEsUUFBUSxFQUFFO0FBQUVnQixRQUFBQSxDQUFDLEVBQUUsUUFBTDtBQUFlQyxRQUFBQSxDQUFDLEVBQUVDO0FBQWxCLE9BSmlCO0FBSzNCakIsTUFBQUEsS0FBSyxFQUFFO0FBQUVlLFFBQUFBLENBQUMsRUFBRSxVQUFMO0FBQWlCQyxRQUFBQSxDQUFDLEVBQUVFO0FBQXBCO0FBTG9CLEtBQTdCO0FBT0Q7O0FBekRTO0FBNERaO0FBQ0E7QUFDQTs7O0FBQ0EsTUFBTWhCLFVBQVUsR0FBR2lCLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjO0FBQy9CakIsRUFBQUEsSUFBSSxFQUFFLE1BRHlCO0FBRS9CUSxFQUFBQSxJQUFJLEVBQUUsTUFGeUI7QUFHL0JILEVBQUFBLE9BQU8sRUFBRTtBQUhzQixDQUFkLENBQW5CO2VBTWVmLEs7O0FBQ2Y0QixNQUFNLENBQUNDLE9BQVAsR0FBaUI7QUFDZjdCLEVBQUFBLEtBRGU7QUFFZlMsRUFBQUE7QUFGZSxDQUFqQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQG1vZHVsZSBTZWN1cml0eUNoZWNrXG4gKi9cblxuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCB7IGlzRnVuY3Rpb24sIGlzU3RyaW5nIH0gZnJvbSAnbG9kYXNoJztcblxuLyoqXG4gKiBBIHNlY3VyaXR5IGNoZWNrLlxuICogQGNsYXNzIENoZWNrXG4gKi9cbmNsYXNzIENoZWNrIHtcbiAgLyoqXG4gICAqIENvbnN0cnVjdHMgYSBuZXcgc2VjdXJpdHkgY2hlY2suXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtZXRlcnMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXJhbXMudGl0bGUgVGhlIHRpdGxlLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGFyYW1zLndhcm5pbmcgVGhlIHdhcm5pbmcgbWVzc2FnZSBpZiB0aGUgY2hlY2sgZmFpbHMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXJhbXMuc29sdXRpb24gVGhlIHNvbHV0aW9uIHRvIGZpeCB0aGUgY2hlY2suXG4gICAqIEBwYXJhbSB7UHJvbWlzZX0gcGFyYW1zLmNoZWNrIFRoZSBjaGVjayBhcyBzeW5jaHJvbm91cyBvciBhc3luY2hyb25vdXMgZnVuY3Rpb24uXG4gICAqL1xuICBjb25zdHJ1Y3RvcihwYXJhbXMpIHtcbiAgICB0aGlzLl92YWxpZGF0ZVBhcmFtcyhwYXJhbXMpO1xuICAgIGNvbnN0IHsgdGl0bGUsIHdhcm5pbmcsIHNvbHV0aW9uLCBjaGVjayB9ID0gcGFyYW1zO1xuXG4gICAgdGhpcy50aXRsZSA9IHRpdGxlO1xuICAgIHRoaXMud2FybmluZyA9IHdhcm5pbmc7XG4gICAgdGhpcy5zb2x1dGlvbiA9IHNvbHV0aW9uO1xuICAgIHRoaXMuY2hlY2sgPSBjaGVjaztcblxuICAgIC8vIFNldCBkZWZhdWx0IHByb3BlcnRpZXNcbiAgICB0aGlzLl9jaGVja1N0YXRlID0gQ2hlY2tTdGF0ZS5ub25lO1xuICAgIHRoaXMuZXJyb3I7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgY3VycmVudCBjaGVjayBzdGF0ZS5cbiAgICogQHJldHVybiB7Q2hlY2tTdGF0ZX0gVGhlIGNoZWNrIHN0YXRlLlxuICAgKi9cbiAgY2hlY2tTdGF0ZSgpIHtcbiAgICByZXR1cm4gdGhpcy5fY2hlY2tTdGF0ZTtcbiAgfVxuXG4gIGFzeW5jIHJ1bigpIHtcbiAgICAvLyBHZXQgY2hlY2sgYXMgc3luY2hyb25vdXMgb3IgYXN5bmNocm9ub3VzIGZ1bmN0aW9uXG4gICAgY29uc3QgY2hlY2sgPSB0aGlzLmNoZWNrIGluc3RhbmNlb2YgUHJvbWlzZSA/IGF3YWl0IHRoaXMuY2hlY2sgOiB0aGlzLmNoZWNrO1xuXG4gICAgLy8gUnVuIGNoZWNrXG4gICAgdHJ5IHtcbiAgICAgIGNoZWNrKCk7XG4gICAgICB0aGlzLl9jaGVja1N0YXRlID0gQ2hlY2tTdGF0ZS5zdWNjZXNzO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHRoaXMuc3RhdGVGYWlsRXJyb3IgPSBlO1xuICAgICAgdGhpcy5fY2hlY2tTdGF0ZSA9IENoZWNrU3RhdGUuZmFpbDtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIHRoZSBjb25zdHJ1Y3RvciBwYXJhbWV0ZXJzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbWV0ZXJzIHRvIHZhbGlkYXRlLlxuICAgKi9cbiAgX3ZhbGlkYXRlUGFyYW1zKHBhcmFtcykge1xuICAgIFV0aWxzLnZhbGlkYXRlUGFyYW1zKHBhcmFtcywge1xuICAgICAgZ3JvdXA6IHsgdDogJ3N0cmluZycsIHY6IGlzU3RyaW5nIH0sXG4gICAgICB0aXRsZTogeyB0OiAnc3RyaW5nJywgdjogaXNTdHJpbmcgfSxcbiAgICAgIHdhcm5pbmc6IHsgdDogJ3N0cmluZycsIHY6IGlzU3RyaW5nIH0sXG4gICAgICBzb2x1dGlvbjogeyB0OiAnc3RyaW5nJywgdjogaXNTdHJpbmcgfSxcbiAgICAgIGNoZWNrOiB7IHQ6ICdmdW5jdGlvbicsIHY6IGlzRnVuY3Rpb24gfSxcbiAgICB9KTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSBjaGVjayBzdGF0ZS5cbiAqL1xuY29uc3QgQ2hlY2tTdGF0ZSA9IE9iamVjdC5mcmVlemUoe1xuICBub25lOiAnbm9uZScsXG4gIGZhaWw6ICdmYWlsJyxcbiAgc3VjY2VzczogJ3N1Y2Nlc3MnLFxufSk7XG5cbmV4cG9ydCBkZWZhdWx0IENoZWNrO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIENoZWNrLFxuICBDaGVja1N0YXRlLFxufTtcbiJdfQ==