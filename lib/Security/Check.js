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
 * @class
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
    this.check = check;

    // Set default properties
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
    const check = this.check instanceof Promise ? await this.check : this.check;

    // Run check
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfVXRpbHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9sb2Rhc2giLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIkNoZWNrIiwiY29uc3RydWN0b3IiLCJwYXJhbXMiLCJfdmFsaWRhdGVQYXJhbXMiLCJ0aXRsZSIsIndhcm5pbmciLCJzb2x1dGlvbiIsImNoZWNrIiwiX2NoZWNrU3RhdGUiLCJDaGVja1N0YXRlIiwibm9uZSIsImVycm9yIiwiY2hlY2tTdGF0ZSIsInJ1biIsIlByb21pc2UiLCJzdWNjZXNzIiwiZSIsInN0YXRlRmFpbEVycm9yIiwiZmFpbCIsIlV0aWxzIiwidmFsaWRhdGVQYXJhbXMiLCJncm91cCIsInQiLCJ2IiwiaXNTdHJpbmciLCJpc0Z1bmN0aW9uIiwiT2JqZWN0IiwiZnJlZXplIiwiX2RlZmF1bHQiLCJleHBvcnRzIiwibW9kdWxlIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1NlY3VyaXR5L0NoZWNrLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQG1vZHVsZSBTZWN1cml0eUNoZWNrXG4gKi9cblxuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCB7IGlzRnVuY3Rpb24sIGlzU3RyaW5nIH0gZnJvbSAnbG9kYXNoJztcblxuLyoqXG4gKiBBIHNlY3VyaXR5IGNoZWNrLlxuICogQGNsYXNzXG4gKi9cbmNsYXNzIENoZWNrIHtcbiAgLyoqXG4gICAqIENvbnN0cnVjdHMgYSBuZXcgc2VjdXJpdHkgY2hlY2suXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtZXRlcnMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXJhbXMudGl0bGUgVGhlIHRpdGxlLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGFyYW1zLndhcm5pbmcgVGhlIHdhcm5pbmcgbWVzc2FnZSBpZiB0aGUgY2hlY2sgZmFpbHMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXJhbXMuc29sdXRpb24gVGhlIHNvbHV0aW9uIHRvIGZpeCB0aGUgY2hlY2suXG4gICAqIEBwYXJhbSB7UHJvbWlzZX0gcGFyYW1zLmNoZWNrIFRoZSBjaGVjayBhcyBzeW5jaHJvbm91cyBvciBhc3luY2hyb25vdXMgZnVuY3Rpb24uXG4gICAqL1xuICBjb25zdHJ1Y3RvcihwYXJhbXMpIHtcbiAgICB0aGlzLl92YWxpZGF0ZVBhcmFtcyhwYXJhbXMpO1xuICAgIGNvbnN0IHsgdGl0bGUsIHdhcm5pbmcsIHNvbHV0aW9uLCBjaGVjayB9ID0gcGFyYW1zO1xuXG4gICAgdGhpcy50aXRsZSA9IHRpdGxlO1xuICAgIHRoaXMud2FybmluZyA9IHdhcm5pbmc7XG4gICAgdGhpcy5zb2x1dGlvbiA9IHNvbHV0aW9uO1xuICAgIHRoaXMuY2hlY2sgPSBjaGVjaztcblxuICAgIC8vIFNldCBkZWZhdWx0IHByb3BlcnRpZXNcbiAgICB0aGlzLl9jaGVja1N0YXRlID0gQ2hlY2tTdGF0ZS5ub25lO1xuICAgIHRoaXMuZXJyb3I7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgY3VycmVudCBjaGVjayBzdGF0ZS5cbiAgICogQHJldHVybiB7Q2hlY2tTdGF0ZX0gVGhlIGNoZWNrIHN0YXRlLlxuICAgKi9cbiAgY2hlY2tTdGF0ZSgpIHtcbiAgICByZXR1cm4gdGhpcy5fY2hlY2tTdGF0ZTtcbiAgfVxuXG4gIGFzeW5jIHJ1bigpIHtcbiAgICAvLyBHZXQgY2hlY2sgYXMgc3luY2hyb25vdXMgb3IgYXN5bmNocm9ub3VzIGZ1bmN0aW9uXG4gICAgY29uc3QgY2hlY2sgPSB0aGlzLmNoZWNrIGluc3RhbmNlb2YgUHJvbWlzZSA/IGF3YWl0IHRoaXMuY2hlY2sgOiB0aGlzLmNoZWNrO1xuXG4gICAgLy8gUnVuIGNoZWNrXG4gICAgdHJ5IHtcbiAgICAgIGNoZWNrKCk7XG4gICAgICB0aGlzLl9jaGVja1N0YXRlID0gQ2hlY2tTdGF0ZS5zdWNjZXNzO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHRoaXMuc3RhdGVGYWlsRXJyb3IgPSBlO1xuICAgICAgdGhpcy5fY2hlY2tTdGF0ZSA9IENoZWNrU3RhdGUuZmFpbDtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIHRoZSBjb25zdHJ1Y3RvciBwYXJhbWV0ZXJzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbWV0ZXJzIHRvIHZhbGlkYXRlLlxuICAgKi9cbiAgX3ZhbGlkYXRlUGFyYW1zKHBhcmFtcykge1xuICAgIFV0aWxzLnZhbGlkYXRlUGFyYW1zKHBhcmFtcywge1xuICAgICAgZ3JvdXA6IHsgdDogJ3N0cmluZycsIHY6IGlzU3RyaW5nIH0sXG4gICAgICB0aXRsZTogeyB0OiAnc3RyaW5nJywgdjogaXNTdHJpbmcgfSxcbiAgICAgIHdhcm5pbmc6IHsgdDogJ3N0cmluZycsIHY6IGlzU3RyaW5nIH0sXG4gICAgICBzb2x1dGlvbjogeyB0OiAnc3RyaW5nJywgdjogaXNTdHJpbmcgfSxcbiAgICAgIGNoZWNrOiB7IHQ6ICdmdW5jdGlvbicsIHY6IGlzRnVuY3Rpb24gfSxcbiAgICB9KTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSBjaGVjayBzdGF0ZS5cbiAqL1xuY29uc3QgQ2hlY2tTdGF0ZSA9IE9iamVjdC5mcmVlemUoe1xuICBub25lOiAnbm9uZScsXG4gIGZhaWw6ICdmYWlsJyxcbiAgc3VjY2VzczogJ3N1Y2Nlc3MnLFxufSk7XG5cbmV4cG9ydCBkZWZhdWx0IENoZWNrO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIENoZWNrLFxuICBDaGVja1N0YXRlLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBSUEsSUFBQUEsTUFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRCxPQUFBO0FBQThDLFNBQUFELHVCQUFBRyxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBTDlDO0FBQ0E7QUFDQTs7QUFLQTtBQUNB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