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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TZWN1cml0eS9DaGVja0dyb3VwLmpzIl0sIm5hbWVzIjpbIkNoZWNrR3JvdXAiLCJjb25zdHJ1Y3RvciIsIl9uYW1lIiwic2V0TmFtZSIsIl9jaGVja3MiLCJzZXRDaGVja3MiLCJuYW1lIiwiY2hlY2tzIiwicnVuIiwiY2hlY2siLCJtb2R1bGUiLCJleHBvcnRzIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLFVBQU4sQ0FBaUI7QUFDZkMsRUFBQUEsV0FBVyxHQUFHO0FBQ1osU0FBS0MsS0FBTCxHQUFhLEtBQUtDLE9BQUwsRUFBYjtBQUNBLFNBQUtDLE9BQUwsR0FBZSxLQUFLQyxTQUFMLEVBQWY7QUFDRDtBQUVEO0FBQ0Y7QUFDQTs7O0FBQ0VGLEVBQUFBLE9BQU8sR0FBRztBQUNSLFVBQU8sMEJBQVA7QUFDRDs7QUFDREcsRUFBQUEsSUFBSSxHQUFHO0FBQ0wsV0FBTyxLQUFLSixLQUFaO0FBQ0Q7QUFFRDtBQUNGO0FBQ0E7OztBQUNFRyxFQUFBQSxTQUFTLEdBQUc7QUFDVixVQUFPLDRCQUFQO0FBQ0Q7O0FBQ0RFLEVBQUFBLE1BQU0sR0FBRztBQUNQLFdBQU8sS0FBS0gsT0FBWjtBQUNEO0FBRUQ7QUFDRjtBQUNBOzs7QUFDVyxRQUFISSxHQUFHLEdBQUc7QUFDVixTQUFLLE1BQU1DLEtBQVgsSUFBb0IsS0FBS0wsT0FBekIsRUFBa0M7QUFDaENLLE1BQUFBLEtBQUssQ0FBQ0QsR0FBTjtBQUNEO0FBQ0Y7O0FBakNjOztBQW9DakJFLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQlgsVUFBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBtb2R1bGUgU2VjdXJpdHlDaGVja1xuICovXG5cbi8qKlxuICogQSBncm91cCBvZiBzZWN1cml0eSBjaGVja3MuXG4gKiBAaW50ZXJmYWNlIENoZWNrR3JvdXBcbiAqL1xuY2xhc3MgQ2hlY2tHcm91cCB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuX25hbWUgPSB0aGlzLnNldE5hbWUoKTtcbiAgICB0aGlzLl9jaGVja3MgPSB0aGlzLnNldENoZWNrcygpO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBzZWN1cml0eSBjaGVjayBncm91cCBuYW1lOyB0byBiZSBvdmVycmlkZGVuIGJ5IGNoaWxkIGNsYXNzLlxuICAgKi9cbiAgc2V0TmFtZSgpIHtcbiAgICB0aHJvdyBgQ2hlY2sgZ3JvdXAgaGFzIG5vIG5hbWUuYDtcbiAgfVxuICBuYW1lKCkge1xuICAgIHJldHVybiB0aGlzLl9uYW1lO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBzZWN1cml0eSBjaGVja3M7IHRvIGJlIG92ZXJyaWRkZW4gYnkgY2hpbGQgY2xhc3MuXG4gICAqL1xuICBzZXRDaGVja3MoKSB7XG4gICAgdGhyb3cgYENoZWNrIGdyb3VwIGhhcyBubyBjaGVja3MuYDtcbiAgfVxuICBjaGVja3MoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NoZWNrcztcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIGFsbCBjaGVja3MuXG4gICAqL1xuICBhc3luYyBydW4oKSB7XG4gICAgZm9yIChjb25zdCBjaGVjayBvZiB0aGlzLl9jaGVja3MpIHtcbiAgICAgIGNoZWNrLnJ1bigpO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IENoZWNrR3JvdXA7XG4iXX0=