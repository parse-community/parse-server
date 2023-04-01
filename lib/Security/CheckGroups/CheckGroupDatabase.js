"use strict";

var _Check = require("../Check");
var _CheckGroup = _interopRequireDefault(require("../CheckGroup"));
var _Config = _interopRequireDefault(require("../../Config"));
var _node = _interopRequireDefault(require("parse/node"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
/**
 * @module SecurityCheck
 */

/**
 * The security checks group for Parse Server configuration.
 * Checks common Parse Server parameters such as access keys.
 */
class CheckGroupDatabase extends _CheckGroup.default {
  setName() {
    return 'Database';
  }
  setChecks() {
    const config = _Config.default.get(_node.default.applicationId);
    const databaseAdapter = config.database.adapter;
    const databaseUrl = databaseAdapter._uri;
    return [new _Check.Check({
      title: 'Secure database password',
      warning: 'The database password is insecure and vulnerable to brute force attacks.',
      solution: 'Choose a longer and/or more complex password with a combination of upper- and lowercase characters, numbers and special characters.',
      check: () => {
        const password = databaseUrl.match(/\/\/\S+:(\S+)@/)[1];
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasNonAlphasNumerics = /\W/.test(password);
        // Ensure length
        if (password.length < 14) {
          throw 1;
        }
        // Ensure at least 3 out of 4 requirements passed
        if (hasUpperCase + hasLowerCase + hasNumbers + hasNonAlphasNumerics < 3) {
          throw 1;
        }
      }
    })];
  }
}
module.exports = CheckGroupDatabase;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDaGVja0dyb3VwRGF0YWJhc2UiLCJDaGVja0dyb3VwIiwic2V0TmFtZSIsInNldENoZWNrcyIsImNvbmZpZyIsIkNvbmZpZyIsImdldCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsImRhdGFiYXNlQWRhcHRlciIsImRhdGFiYXNlIiwiYWRhcHRlciIsImRhdGFiYXNlVXJsIiwiX3VyaSIsIkNoZWNrIiwidGl0bGUiLCJ3YXJuaW5nIiwic29sdXRpb24iLCJjaGVjayIsInBhc3N3b3JkIiwibWF0Y2giLCJoYXNVcHBlckNhc2UiLCJ0ZXN0IiwiaGFzTG93ZXJDYXNlIiwiaGFzTnVtYmVycyIsImhhc05vbkFscGhhc051bWVyaWNzIiwibGVuZ3RoIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9TZWN1cml0eS9DaGVja0dyb3Vwcy9DaGVja0dyb3VwRGF0YWJhc2UuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbW9kdWxlIFNlY3VyaXR5Q2hlY2tcbiAqL1xuXG5pbXBvcnQgeyBDaGVjayB9IGZyb20gJy4uL0NoZWNrJztcbmltcG9ydCBDaGVja0dyb3VwIGZyb20gJy4uL0NoZWNrR3JvdXAnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi8uLi9Db25maWcnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG4vKipcbiAqIFRoZSBzZWN1cml0eSBjaGVja3MgZ3JvdXAgZm9yIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uLlxuICogQ2hlY2tzIGNvbW1vbiBQYXJzZSBTZXJ2ZXIgcGFyYW1ldGVycyBzdWNoIGFzIGFjY2VzcyBrZXlzLlxuICovXG5jbGFzcyBDaGVja0dyb3VwRGF0YWJhc2UgZXh0ZW5kcyBDaGVja0dyb3VwIHtcbiAgc2V0TmFtZSgpIHtcbiAgICByZXR1cm4gJ0RhdGFiYXNlJztcbiAgfVxuICBzZXRDaGVja3MoKSB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICBjb25zdCBkYXRhYmFzZUFkYXB0ZXIgPSBjb25maWcuZGF0YWJhc2UuYWRhcHRlcjtcbiAgICBjb25zdCBkYXRhYmFzZVVybCA9IGRhdGFiYXNlQWRhcHRlci5fdXJpO1xuICAgIHJldHVybiBbXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ1NlY3VyZSBkYXRhYmFzZSBwYXNzd29yZCcsXG4gICAgICAgIHdhcm5pbmc6ICdUaGUgZGF0YWJhc2UgcGFzc3dvcmQgaXMgaW5zZWN1cmUgYW5kIHZ1bG5lcmFibGUgdG8gYnJ1dGUgZm9yY2UgYXR0YWNrcy4nLFxuICAgICAgICBzb2x1dGlvbjpcbiAgICAgICAgICAnQ2hvb3NlIGEgbG9uZ2VyIGFuZC9vciBtb3JlIGNvbXBsZXggcGFzc3dvcmQgd2l0aCBhIGNvbWJpbmF0aW9uIG9mIHVwcGVyLSBhbmQgbG93ZXJjYXNlIGNoYXJhY3RlcnMsIG51bWJlcnMgYW5kIHNwZWNpYWwgY2hhcmFjdGVycy4nLFxuICAgICAgICBjaGVjazogKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHBhc3N3b3JkID0gZGF0YWJhc2VVcmwubWF0Y2goL1xcL1xcL1xcUys6KFxcUyspQC8pWzFdO1xuICAgICAgICAgIGNvbnN0IGhhc1VwcGVyQ2FzZSA9IC9bQS1aXS8udGVzdChwYXNzd29yZCk7XG4gICAgICAgICAgY29uc3QgaGFzTG93ZXJDYXNlID0gL1thLXpdLy50ZXN0KHBhc3N3b3JkKTtcbiAgICAgICAgICBjb25zdCBoYXNOdW1iZXJzID0gL1xcZC8udGVzdChwYXNzd29yZCk7XG4gICAgICAgICAgY29uc3QgaGFzTm9uQWxwaGFzTnVtZXJpY3MgPSAvXFxXLy50ZXN0KHBhc3N3b3JkKTtcbiAgICAgICAgICAvLyBFbnN1cmUgbGVuZ3RoXG4gICAgICAgICAgaWYgKHBhc3N3b3JkLmxlbmd0aCA8IDE0KSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgYXQgbGVhc3QgMyBvdXQgb2YgNCByZXF1aXJlbWVudHMgcGFzc2VkXG4gICAgICAgICAgaWYgKGhhc1VwcGVyQ2FzZSArIGhhc0xvd2VyQ2FzZSArIGhhc051bWJlcnMgKyBoYXNOb25BbHBoYXNOdW1lcmljcyA8IDMpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgXTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IENoZWNrR3JvdXBEYXRhYmFzZTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUErQjtBQVAvQjtBQUNBO0FBQ0E7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxrQkFBa0IsU0FBU0MsbUJBQVUsQ0FBQztFQUMxQ0MsT0FBTyxHQUFHO0lBQ1IsT0FBTyxVQUFVO0VBQ25CO0VBQ0FDLFNBQVMsR0FBRztJQUNWLE1BQU1DLE1BQU0sR0FBR0MsZUFBTSxDQUFDQyxHQUFHLENBQUNDLGFBQUssQ0FBQ0MsYUFBYSxDQUFDO0lBQzlDLE1BQU1DLGVBQWUsR0FBR0wsTUFBTSxDQUFDTSxRQUFRLENBQUNDLE9BQU87SUFDL0MsTUFBTUMsV0FBVyxHQUFHSCxlQUFlLENBQUNJLElBQUk7SUFDeEMsT0FBTyxDQUNMLElBQUlDLFlBQUssQ0FBQztNQUNSQyxLQUFLLEVBQUUsMEJBQTBCO01BQ2pDQyxPQUFPLEVBQUUsMEVBQTBFO01BQ25GQyxRQUFRLEVBQ04scUlBQXFJO01BQ3ZJQyxLQUFLLEVBQUUsTUFBTTtRQUNYLE1BQU1DLFFBQVEsR0FBR1AsV0FBVyxDQUFDUSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkQsTUFBTUMsWUFBWSxHQUFHLE9BQU8sQ0FBQ0MsSUFBSSxDQUFDSCxRQUFRLENBQUM7UUFDM0MsTUFBTUksWUFBWSxHQUFHLE9BQU8sQ0FBQ0QsSUFBSSxDQUFDSCxRQUFRLENBQUM7UUFDM0MsTUFBTUssVUFBVSxHQUFHLElBQUksQ0FBQ0YsSUFBSSxDQUFDSCxRQUFRLENBQUM7UUFDdEMsTUFBTU0sb0JBQW9CLEdBQUcsSUFBSSxDQUFDSCxJQUFJLENBQUNILFFBQVEsQ0FBQztRQUNoRDtRQUNBLElBQUlBLFFBQVEsQ0FBQ08sTUFBTSxHQUFHLEVBQUUsRUFBRTtVQUN4QixNQUFNLENBQUM7UUFDVDtRQUNBO1FBQ0EsSUFBSUwsWUFBWSxHQUFHRSxZQUFZLEdBQUdDLFVBQVUsR0FBR0Msb0JBQW9CLEdBQUcsQ0FBQyxFQUFFO1VBQ3ZFLE1BQU0sQ0FBQztRQUNUO01BQ0Y7SUFDRixDQUFDLENBQUMsQ0FDSDtFQUNIO0FBQ0Y7QUFFQUUsTUFBTSxDQUFDQyxPQUFPLEdBQUc1QixrQkFBa0IifQ==