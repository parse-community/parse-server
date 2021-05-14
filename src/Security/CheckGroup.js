/**
 * @module SecurityCheck
 */

/**
 * A group of security checks.
 * @interface CheckGroup
 */
class CheckGroup {
  constructor() {
    this._name = this.setName();
    this._checks = this.setChecks();
  }

  /**
   * The security check group name; to be overridden by child class.
   */
  setName() {
    throw `Check group has no name.`;
  }
  name() {
    return this._name;
  }

  /**
   * The security checks; to be overridden by child class.
   */
  setChecks() {
    throw `Check group has no checks.`;
  }
  checks() {
    return this._checks;
  }

  /**
   * Runs all checks.
   */
  async run() {
    for (const check of this._checks) {
      check.run();
    }
  }
}

module.exports = CheckGroup;
