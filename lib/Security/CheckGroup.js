"use strict";

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDaGVja0dyb3VwIiwiY29uc3RydWN0b3IiLCJfbmFtZSIsInNldE5hbWUiLCJfY2hlY2tzIiwic2V0Q2hlY2tzIiwibmFtZSIsImNoZWNrcyIsInJ1biIsImNoZWNrIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TZWN1cml0eS9DaGVja0dyb3VwLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQG1vZHVsZSBTZWN1cml0eUNoZWNrXG4gKi9cblxuLyoqXG4gKiBBIGdyb3VwIG9mIHNlY3VyaXR5IGNoZWNrcy5cbiAqIEBpbnRlcmZhY2UgQ2hlY2tHcm91cFxuICovXG5jbGFzcyBDaGVja0dyb3VwIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5fbmFtZSA9IHRoaXMuc2V0TmFtZSgpO1xuICAgIHRoaXMuX2NoZWNrcyA9IHRoaXMuc2V0Q2hlY2tzKCk7XG4gIH1cblxuICAvKipcbiAgICogVGhlIHNlY3VyaXR5IGNoZWNrIGdyb3VwIG5hbWU7IHRvIGJlIG92ZXJyaWRkZW4gYnkgY2hpbGQgY2xhc3MuXG4gICAqL1xuICBzZXROYW1lKCkge1xuICAgIHRocm93IGBDaGVjayBncm91cCBoYXMgbm8gbmFtZS5gO1xuICB9XG4gIG5hbWUoKSB7XG4gICAgcmV0dXJuIHRoaXMuX25hbWU7XG4gIH1cblxuICAvKipcbiAgICogVGhlIHNlY3VyaXR5IGNoZWNrczsgdG8gYmUgb3ZlcnJpZGRlbiBieSBjaGlsZCBjbGFzcy5cbiAgICovXG4gIHNldENoZWNrcygpIHtcbiAgICB0aHJvdyBgQ2hlY2sgZ3JvdXAgaGFzIG5vIGNoZWNrcy5gO1xuICB9XG4gIGNoZWNrcygpIHtcbiAgICByZXR1cm4gdGhpcy5fY2hlY2tzO1xuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgYWxsIGNoZWNrcy5cbiAgICovXG4gIGFzeW5jIHJ1bigpIHtcbiAgICBmb3IgKGNvbnN0IGNoZWNrIG9mIHRoaXMuX2NoZWNrcykge1xuICAgICAgY2hlY2sucnVuKCk7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ2hlY2tHcm91cDtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxVQUFVLENBQUM7RUFDZkMsV0FBVyxHQUFHO0lBQ1osSUFBSSxDQUFDQyxLQUFLLEdBQUcsSUFBSSxDQUFDQyxPQUFPLEVBQUU7SUFDM0IsSUFBSSxDQUFDQyxPQUFPLEdBQUcsSUFBSSxDQUFDQyxTQUFTLEVBQUU7RUFDakM7O0VBRUE7QUFDRjtBQUNBO0VBQ0VGLE9BQU8sR0FBRztJQUNSLE1BQU8sMEJBQXlCO0VBQ2xDO0VBQ0FHLElBQUksR0FBRztJQUNMLE9BQU8sSUFBSSxDQUFDSixLQUFLO0VBQ25COztFQUVBO0FBQ0Y7QUFDQTtFQUNFRyxTQUFTLEdBQUc7SUFDVixNQUFPLDRCQUEyQjtFQUNwQztFQUNBRSxNQUFNLEdBQUc7SUFDUCxPQUFPLElBQUksQ0FBQ0gsT0FBTztFQUNyQjs7RUFFQTtBQUNGO0FBQ0E7RUFDRSxNQUFNSSxHQUFHLEdBQUc7SUFDVixLQUFLLE1BQU1DLEtBQUssSUFBSSxJQUFJLENBQUNMLE9BQU8sRUFBRTtNQUNoQ0ssS0FBSyxDQUFDRCxHQUFHLEVBQUU7SUFDYjtFQUNGO0FBQ0Y7QUFFQUUsTUFBTSxDQUFDQyxPQUFPLEdBQUdYLFVBQVUifQ==