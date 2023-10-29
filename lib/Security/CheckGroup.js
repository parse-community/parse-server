"use strict";

/**
 * A group of security checks.
 * @interface
 * @memberof module:SecurityCheck
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDaGVja0dyb3VwIiwiY29uc3RydWN0b3IiLCJfbmFtZSIsInNldE5hbWUiLCJfY2hlY2tzIiwic2V0Q2hlY2tzIiwibmFtZSIsImNoZWNrcyIsInJ1biIsImNoZWNrIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TZWN1cml0eS9DaGVja0dyb3VwLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQSBncm91cCBvZiBzZWN1cml0eSBjaGVja3MuXG4gKiBAaW50ZXJmYWNlXG4gKiBAbWVtYmVyb2YgbW9kdWxlOlNlY3VyaXR5Q2hlY2tcbiAqL1xuY2xhc3MgQ2hlY2tHcm91cCB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuX25hbWUgPSB0aGlzLnNldE5hbWUoKTtcbiAgICB0aGlzLl9jaGVja3MgPSB0aGlzLnNldENoZWNrcygpO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBzZWN1cml0eSBjaGVjayBncm91cCBuYW1lOyB0byBiZSBvdmVycmlkZGVuIGJ5IGNoaWxkIGNsYXNzLlxuICAgKi9cbiAgc2V0TmFtZSgpIHtcbiAgICB0aHJvdyBgQ2hlY2sgZ3JvdXAgaGFzIG5vIG5hbWUuYDtcbiAgfVxuICBuYW1lKCkge1xuICAgIHJldHVybiB0aGlzLl9uYW1lO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBzZWN1cml0eSBjaGVja3M7IHRvIGJlIG92ZXJyaWRkZW4gYnkgY2hpbGQgY2xhc3MuXG4gICAqL1xuICBzZXRDaGVja3MoKSB7XG4gICAgdGhyb3cgYENoZWNrIGdyb3VwIGhhcyBubyBjaGVja3MuYDtcbiAgfVxuICBjaGVja3MoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NoZWNrcztcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIGFsbCBjaGVja3MuXG4gICAqL1xuICBhc3luYyBydW4oKSB7XG4gICAgZm9yIChjb25zdCBjaGVjayBvZiB0aGlzLl9jaGVja3MpIHtcbiAgICAgIGNoZWNrLnJ1bigpO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IENoZWNrR3JvdXA7XG4iXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLFVBQVUsQ0FBQztFQUNmQyxXQUFXQSxDQUFBLEVBQUc7SUFDWixJQUFJLENBQUNDLEtBQUssR0FBRyxJQUFJLENBQUNDLE9BQU8sQ0FBQyxDQUFDO0lBQzNCLElBQUksQ0FBQ0MsT0FBTyxHQUFHLElBQUksQ0FBQ0MsU0FBUyxDQUFDLENBQUM7RUFDakM7O0VBRUE7QUFDRjtBQUNBO0VBQ0VGLE9BQU9BLENBQUEsRUFBRztJQUNSLE1BQU8sMEJBQXlCO0VBQ2xDO0VBQ0FHLElBQUlBLENBQUEsRUFBRztJQUNMLE9BQU8sSUFBSSxDQUFDSixLQUFLO0VBQ25COztFQUVBO0FBQ0Y7QUFDQTtFQUNFRyxTQUFTQSxDQUFBLEVBQUc7SUFDVixNQUFPLDRCQUEyQjtFQUNwQztFQUNBRSxNQUFNQSxDQUFBLEVBQUc7SUFDUCxPQUFPLElBQUksQ0FBQ0gsT0FBTztFQUNyQjs7RUFFQTtBQUNGO0FBQ0E7RUFDRSxNQUFNSSxHQUFHQSxDQUFBLEVBQUc7SUFDVixLQUFLLE1BQU1DLEtBQUssSUFBSSxJQUFJLENBQUNMLE9BQU8sRUFBRTtNQUNoQ0ssS0FBSyxDQUFDRCxHQUFHLENBQUMsQ0FBQztJQUNiO0VBQ0Y7QUFDRjtBQUVBRSxNQUFNLENBQUNDLE9BQU8sR0FBR1gsVUFBVSJ9