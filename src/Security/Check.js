/**
 * @module SecurityCheck
 */

import { isFunction, isString } from 'lodash';

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
   * @param {Promise} params.script The check script; can be an synchronous or asynchronous function.
   */
  constructor(params) {
    this._validateParams(params);
    const { title, warning, solution, script } = params;

    this.title = title;
    this.warning = warning;
    this.solution = solution;
    this.script = script;

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
    // Get check script as synchronous or asynchronous function
    const script = this.script instanceof Promise ? await this.script : this.script;

    // Run script
    try {
      script();
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
    const types = {
      group: { t: 'string', c: isString },
      title: { t: 'string', c: isString },
      warning: { t: 'string', c: isString },
      solution: { t: 'string', c: isString },
      script: { t: 'function', c: isFunction },
    };
    for (const key of Object.keys(params)) {
      if (!types[key].c(params[key])) {
        throw `Invalid check parameter ${key} must be of type ${types[key].t} but is ${typeof params[key]}`;
      }
    }
  }
}

/**
 * The check state.
 */
const CheckState = Object.freeze({
  none: "none",
  fail: "fail",
  success: "success",
});

export default Check;
module.exports = {
  Check,
  CheckState,
};
