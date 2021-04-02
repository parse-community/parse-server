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
        const hasNonAlphasNumerics = /\W/.test(password); // Ensure length

        if (password.length < 14) {
          throw 1;
        } // Ensure at least 3 out of 4 requirements passed


        if (hasUpperCase + hasLowerCase + hasNumbers + hasNonAlphasNumerics < 3) {
          throw 1;
        }
      }
    })];
  }

}

module.exports = CheckGroupDatabase;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9TZWN1cml0eS9DaGVja0dyb3Vwcy9DaGVja0dyb3VwRGF0YWJhc2UuanMiXSwibmFtZXMiOlsiQ2hlY2tHcm91cERhdGFiYXNlIiwiQ2hlY2tHcm91cCIsInNldE5hbWUiLCJzZXRDaGVja3MiLCJjb25maWciLCJDb25maWciLCJnZXQiLCJQYXJzZSIsImFwcGxpY2F0aW9uSWQiLCJkYXRhYmFzZUFkYXB0ZXIiLCJkYXRhYmFzZSIsImFkYXB0ZXIiLCJkYXRhYmFzZVVybCIsIl91cmkiLCJDaGVjayIsInRpdGxlIiwid2FybmluZyIsInNvbHV0aW9uIiwiY2hlY2siLCJwYXNzd29yZCIsIm1hdGNoIiwiaGFzVXBwZXJDYXNlIiwidGVzdCIsImhhc0xvd2VyQ2FzZSIsImhhc051bWJlcnMiLCJoYXNOb25BbHBoYXNOdW1lcmljcyIsImxlbmd0aCIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBSUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7QUFQQTtBQUNBO0FBQ0E7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxrQkFBTixTQUFpQ0MsbUJBQWpDLENBQTRDO0FBQzFDQyxFQUFBQSxPQUFPLEdBQUc7QUFDUixXQUFPLFVBQVA7QUFDRDs7QUFDREMsRUFBQUEsU0FBUyxHQUFHO0FBQ1YsVUFBTUMsTUFBTSxHQUFHQyxnQkFBT0MsR0FBUCxDQUFXQyxjQUFNQyxhQUFqQixDQUFmOztBQUNBLFVBQU1DLGVBQWUsR0FBR0wsTUFBTSxDQUFDTSxRQUFQLENBQWdCQyxPQUF4QztBQUNBLFVBQU1DLFdBQVcsR0FBR0gsZUFBZSxDQUFDSSxJQUFwQztBQUNBLFdBQU8sQ0FDTCxJQUFJQyxZQUFKLENBQVU7QUFDUkMsTUFBQUEsS0FBSyxFQUFFLDBCQURDO0FBRVJDLE1BQUFBLE9BQU8sRUFBRSwwRUFGRDtBQUdSQyxNQUFBQSxRQUFRLEVBQ04scUlBSk07QUFLUkMsTUFBQUEsS0FBSyxFQUFFLE1BQU07QUFDWCxjQUFNQyxRQUFRLEdBQUdQLFdBQVcsQ0FBQ1EsS0FBWixDQUFrQixnQkFBbEIsRUFBb0MsQ0FBcEMsQ0FBakI7QUFDQSxjQUFNQyxZQUFZLEdBQUcsUUFBUUMsSUFBUixDQUFhSCxRQUFiLENBQXJCO0FBQ0EsY0FBTUksWUFBWSxHQUFHLFFBQVFELElBQVIsQ0FBYUgsUUFBYixDQUFyQjtBQUNBLGNBQU1LLFVBQVUsR0FBRyxLQUFLRixJQUFMLENBQVVILFFBQVYsQ0FBbkI7QUFDQSxjQUFNTSxvQkFBb0IsR0FBRyxLQUFLSCxJQUFMLENBQVVILFFBQVYsQ0FBN0IsQ0FMVyxDQU1YOztBQUNBLFlBQUlBLFFBQVEsQ0FBQ08sTUFBVCxHQUFrQixFQUF0QixFQUEwQjtBQUN4QixnQkFBTSxDQUFOO0FBQ0QsU0FUVSxDQVVYOzs7QUFDQSxZQUFJTCxZQUFZLEdBQUdFLFlBQWYsR0FBOEJDLFVBQTlCLEdBQTJDQyxvQkFBM0MsR0FBa0UsQ0FBdEUsRUFBeUU7QUFDdkUsZ0JBQU0sQ0FBTjtBQUNEO0FBQ0Y7QUFuQk8sS0FBVixDQURLLENBQVA7QUF1QkQ7O0FBL0J5Qzs7QUFrQzVDRSxNQUFNLENBQUNDLE9BQVAsR0FBaUI1QixrQkFBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBtb2R1bGUgU2VjdXJpdHlDaGVja1xuICovXG5cbmltcG9ydCB7IENoZWNrIH0gZnJvbSAnLi4vQ2hlY2snO1xuaW1wb3J0IENoZWNrR3JvdXAgZnJvbSAnLi4vQ2hlY2tHcm91cCc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uLy4uL0NvbmZpZyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5cbi8qKlxuICogVGhlIHNlY3VyaXR5IGNoZWNrcyBncm91cCBmb3IgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24uXG4gKiBDaGVja3MgY29tbW9uIFBhcnNlIFNlcnZlciBwYXJhbWV0ZXJzIHN1Y2ggYXMgYWNjZXNzIGtleXMuXG4gKi9cbmNsYXNzIENoZWNrR3JvdXBEYXRhYmFzZSBleHRlbmRzIENoZWNrR3JvdXAge1xuICBzZXROYW1lKCkge1xuICAgIHJldHVybiAnRGF0YWJhc2UnO1xuICB9XG4gIHNldENoZWNrcygpIHtcbiAgICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgIGNvbnN0IGRhdGFiYXNlQWRhcHRlciA9IGNvbmZpZy5kYXRhYmFzZS5hZGFwdGVyO1xuICAgIGNvbnN0IGRhdGFiYXNlVXJsID0gZGF0YWJhc2VBZGFwdGVyLl91cmk7XG4gICAgcmV0dXJuIFtcbiAgICAgIG5ldyBDaGVjayh7XG4gICAgICAgIHRpdGxlOiAnU2VjdXJlIGRhdGFiYXNlIHBhc3N3b3JkJyxcbiAgICAgICAgd2FybmluZzogJ1RoZSBkYXRhYmFzZSBwYXNzd29yZCBpcyBpbnNlY3VyZSBhbmQgdnVsbmVyYWJsZSB0byBicnV0ZSBmb3JjZSBhdHRhY2tzLicsXG4gICAgICAgIHNvbHV0aW9uOlxuICAgICAgICAgICdDaG9vc2UgYSBsb25nZXIgYW5kL29yIG1vcmUgY29tcGxleCBwYXNzd29yZCB3aXRoIGEgY29tYmluYXRpb24gb2YgdXBwZXItIGFuZCBsb3dlcmNhc2UgY2hhcmFjdGVycywgbnVtYmVycyBhbmQgc3BlY2lhbCBjaGFyYWN0ZXJzLicsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgY29uc3QgcGFzc3dvcmQgPSBkYXRhYmFzZVVybC5tYXRjaCgvXFwvXFwvXFxTKzooXFxTKylALylbMV07XG4gICAgICAgICAgY29uc3QgaGFzVXBwZXJDYXNlID0gL1tBLVpdLy50ZXN0KHBhc3N3b3JkKTtcbiAgICAgICAgICBjb25zdCBoYXNMb3dlckNhc2UgPSAvW2Etel0vLnRlc3QocGFzc3dvcmQpO1xuICAgICAgICAgIGNvbnN0IGhhc051bWJlcnMgPSAvXFxkLy50ZXN0KHBhc3N3b3JkKTtcbiAgICAgICAgICBjb25zdCBoYXNOb25BbHBoYXNOdW1lcmljcyA9IC9cXFcvLnRlc3QocGFzc3dvcmQpO1xuICAgICAgICAgIC8vIEVuc3VyZSBsZW5ndGhcbiAgICAgICAgICBpZiAocGFzc3dvcmQubGVuZ3RoIDwgMTQpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEVuc3VyZSBhdCBsZWFzdCAzIG91dCBvZiA0IHJlcXVpcmVtZW50cyBwYXNzZWRcbiAgICAgICAgICBpZiAoaGFzVXBwZXJDYXNlICsgaGFzTG93ZXJDYXNlICsgaGFzTnVtYmVycyArIGhhc05vbkFscGhhc051bWVyaWNzIDwgMykge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICBdO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ2hlY2tHcm91cERhdGFiYXNlO1xuIl19