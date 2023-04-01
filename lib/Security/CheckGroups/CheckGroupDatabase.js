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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDaGVja0dyb3VwRGF0YWJhc2UiLCJDaGVja0dyb3VwIiwic2V0TmFtZSIsInNldENoZWNrcyIsImNvbmZpZyIsIkNvbmZpZyIsImdldCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsImRhdGFiYXNlQWRhcHRlciIsImRhdGFiYXNlIiwiYWRhcHRlciIsImRhdGFiYXNlVXJsIiwiX3VyaSIsIkNoZWNrIiwidGl0bGUiLCJ3YXJuaW5nIiwic29sdXRpb24iLCJjaGVjayIsInBhc3N3b3JkIiwibWF0Y2giLCJoYXNVcHBlckNhc2UiLCJ0ZXN0IiwiaGFzTG93ZXJDYXNlIiwiaGFzTnVtYmVycyIsImhhc05vbkFscGhhc051bWVyaWNzIiwibGVuZ3RoIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9TZWN1cml0eS9DaGVja0dyb3Vwcy9DaGVja0dyb3VwRGF0YWJhc2UuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbW9kdWxlIFNlY3VyaXR5Q2hlY2tcbiAqL1xuXG5pbXBvcnQgeyBDaGVjayB9IGZyb20gJy4uL0NoZWNrJztcbmltcG9ydCBDaGVja0dyb3VwIGZyb20gJy4uL0NoZWNrR3JvdXAnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi8uLi9Db25maWcnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG4vKipcbiogVGhlIHNlY3VyaXR5IGNoZWNrcyBncm91cCBmb3IgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24uXG4qIENoZWNrcyBjb21tb24gUGFyc2UgU2VydmVyIHBhcmFtZXRlcnMgc3VjaCBhcyBhY2Nlc3Mga2V5cy5cbiovXG5jbGFzcyBDaGVja0dyb3VwRGF0YWJhc2UgZXh0ZW5kcyBDaGVja0dyb3VwIHtcbiAgc2V0TmFtZSgpIHtcbiAgICByZXR1cm4gJ0RhdGFiYXNlJztcbiAgfVxuICBzZXRDaGVja3MoKSB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICBjb25zdCBkYXRhYmFzZUFkYXB0ZXIgPSBjb25maWcuZGF0YWJhc2UuYWRhcHRlcjtcbiAgICBjb25zdCBkYXRhYmFzZVVybCA9IGRhdGFiYXNlQWRhcHRlci5fdXJpO1xuICAgIHJldHVybiBbXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ1NlY3VyZSBkYXRhYmFzZSBwYXNzd29yZCcsXG4gICAgICAgIHdhcm5pbmc6ICdUaGUgZGF0YWJhc2UgcGFzc3dvcmQgaXMgaW5zZWN1cmUgYW5kIHZ1bG5lcmFibGUgdG8gYnJ1dGUgZm9yY2UgYXR0YWNrcy4nLFxuICAgICAgICBzb2x1dGlvbjogJ0Nob29zZSBhIGxvbmdlciBhbmQvb3IgbW9yZSBjb21wbGV4IHBhc3N3b3JkIHdpdGggYSBjb21iaW5hdGlvbiBvZiB1cHBlci0gYW5kIGxvd2VyY2FzZSBjaGFyYWN0ZXJzLCBudW1iZXJzIGFuZCBzcGVjaWFsIGNoYXJhY3RlcnMuJyxcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBjb25zdCBwYXNzd29yZCA9IGRhdGFiYXNlVXJsLm1hdGNoKC9cXC9cXC9cXFMrOihcXFMrKUAvKVsxXTtcbiAgICAgICAgICBjb25zdCBoYXNVcHBlckNhc2UgPSAvW0EtWl0vLnRlc3QocGFzc3dvcmQpO1xuICAgICAgICAgIGNvbnN0IGhhc0xvd2VyQ2FzZSA9IC9bYS16XS8udGVzdChwYXNzd29yZCk7XG4gICAgICAgICAgY29uc3QgaGFzTnVtYmVycyA9IC9cXGQvLnRlc3QocGFzc3dvcmQpO1xuICAgICAgICAgIGNvbnN0IGhhc05vbkFscGhhc051bWVyaWNzID0gL1xcVy8udGVzdChwYXNzd29yZCk7XG4gICAgICAgICAgLy8gRW5zdXJlIGxlbmd0aFxuICAgICAgICAgIGlmIChwYXNzd29yZC5sZW5ndGggPCAxNCkge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRW5zdXJlIGF0IGxlYXN0IDMgb3V0IG9mIDQgcmVxdWlyZW1lbnRzIHBhc3NlZFxuICAgICAgICAgIGlmIChoYXNVcHBlckNhc2UgKyBoYXNMb3dlckNhc2UgKyBoYXNOdW1iZXJzICsgaGFzTm9uQWxwaGFzTnVtZXJpY3MgPCAzKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgIF07XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDaGVja0dyb3VwRGF0YWJhc2U7XG4iXSwibWFwcGluZ3MiOiI7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFBK0I7QUFQL0I7QUFDQTtBQUNBOztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUEsa0JBQWtCLFNBQVNDLG1CQUFVLENBQUM7RUFDMUNDLE9BQU8sR0FBRztJQUNSLE9BQU8sVUFBVTtFQUNuQjtFQUNBQyxTQUFTLEdBQUc7SUFDVixNQUFNQyxNQUFNLEdBQUdDLGVBQU0sQ0FBQ0MsR0FBRyxDQUFDQyxhQUFLLENBQUNDLGFBQWEsQ0FBQztJQUM5QyxNQUFNQyxlQUFlLEdBQUdMLE1BQU0sQ0FBQ00sUUFBUSxDQUFDQyxPQUFPO0lBQy9DLE1BQU1DLFdBQVcsR0FBR0gsZUFBZSxDQUFDSSxJQUFJO0lBQ3hDLE9BQU8sQ0FDTCxJQUFJQyxZQUFLLENBQUM7TUFDUkMsS0FBSyxFQUFFLDBCQUEwQjtNQUNqQ0MsT0FBTyxFQUFFLDBFQUEwRTtNQUNuRkMsUUFBUSxFQUFFLHFJQUFxSTtNQUMvSUMsS0FBSyxFQUFFLE1BQU07UUFDWCxNQUFNQyxRQUFRLEdBQUdQLFdBQVcsQ0FBQ1EsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELE1BQU1DLFlBQVksR0FBRyxPQUFPLENBQUNDLElBQUksQ0FBQ0gsUUFBUSxDQUFDO1FBQzNDLE1BQU1JLFlBQVksR0FBRyxPQUFPLENBQUNELElBQUksQ0FBQ0gsUUFBUSxDQUFDO1FBQzNDLE1BQU1LLFVBQVUsR0FBRyxJQUFJLENBQUNGLElBQUksQ0FBQ0gsUUFBUSxDQUFDO1FBQ3RDLE1BQU1NLG9CQUFvQixHQUFHLElBQUksQ0FBQ0gsSUFBSSxDQUFDSCxRQUFRLENBQUM7UUFDaEQ7UUFDQSxJQUFJQSxRQUFRLENBQUNPLE1BQU0sR0FBRyxFQUFFLEVBQUU7VUFDeEIsTUFBTSxDQUFDO1FBQ1Q7UUFDQTtRQUNBLElBQUlMLFlBQVksR0FBR0UsWUFBWSxHQUFHQyxVQUFVLEdBQUdDLG9CQUFvQixHQUFHLENBQUMsRUFBRTtVQUN2RSxNQUFNLENBQUM7UUFDVDtNQUNGO0lBQ0YsQ0FBQyxDQUFDLENBQ0g7RUFDSDtBQUNGO0FBRUFFLE1BQU0sQ0FBQ0MsT0FBTyxHQUFHNUIsa0JBQWtCIn0=