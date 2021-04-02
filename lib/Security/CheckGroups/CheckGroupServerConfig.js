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
class CheckGroupServerConfig extends _CheckGroup.default {
  setName() {
    return 'Parse Server Configuration';
  }

  setChecks() {
    const config = _Config.default.get(_node.default.applicationId);

    return [new _Check.Check({
      title: 'Secure master key',
      warning: 'The Parse Server master key is insecure and vulnerable to brute force attacks.',
      solution: 'Choose a longer and/or more complex master key with a combination of upper- and lowercase characters, numbers and special characters.',
      check: () => {
        const masterKey = config.masterKey;
        const hasUpperCase = /[A-Z]/.test(masterKey);
        const hasLowerCase = /[a-z]/.test(masterKey);
        const hasNumbers = /\d/.test(masterKey);
        const hasNonAlphasNumerics = /\W/.test(masterKey); // Ensure length

        if (masterKey.length < 14) {
          throw 1;
        } // Ensure at least 3 out of 4 requirements passed


        if (hasUpperCase + hasLowerCase + hasNumbers + hasNonAlphasNumerics < 3) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Security log disabled',
      warning: 'Security checks in logs may expose vulnerabilities to anyone access to logs.',
      solution: "Change Parse Server configuration to 'security.enableCheckLog: false'.",
      check: () => {
        if (config.security && config.security.enableCheckLog) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Client class creation disabled',
      warning: 'Attackers are allowed to create new classes without restriction and flood the database.',
      solution: "Change Parse Server configuration to 'allowClientClassCreation: false'.",
      check: () => {
        if (config.allowClientClassCreation || config.allowClientClassCreation == null) {
          throw 1;
        }
      }
    })];
  }

}

module.exports = CheckGroupServerConfig;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9TZWN1cml0eS9DaGVja0dyb3Vwcy9DaGVja0dyb3VwU2VydmVyQ29uZmlnLmpzIl0sIm5hbWVzIjpbIkNoZWNrR3JvdXBTZXJ2ZXJDb25maWciLCJDaGVja0dyb3VwIiwic2V0TmFtZSIsInNldENoZWNrcyIsImNvbmZpZyIsIkNvbmZpZyIsImdldCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsIkNoZWNrIiwidGl0bGUiLCJ3YXJuaW5nIiwic29sdXRpb24iLCJjaGVjayIsIm1hc3RlcktleSIsImhhc1VwcGVyQ2FzZSIsInRlc3QiLCJoYXNMb3dlckNhc2UiLCJoYXNOdW1iZXJzIiwiaGFzTm9uQWxwaGFzTnVtZXJpY3MiLCJsZW5ndGgiLCJzZWN1cml0eSIsImVuYWJsZUNoZWNrTG9nIiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFJQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQVBBO0FBQ0E7QUFDQTs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLHNCQUFOLFNBQXFDQyxtQkFBckMsQ0FBZ0Q7QUFDOUNDLEVBQUFBLE9BQU8sR0FBRztBQUNSLFdBQU8sNEJBQVA7QUFDRDs7QUFDREMsRUFBQUEsU0FBUyxHQUFHO0FBQ1YsVUFBTUMsTUFBTSxHQUFHQyxnQkFBT0MsR0FBUCxDQUFXQyxjQUFNQyxhQUFqQixDQUFmOztBQUNBLFdBQU8sQ0FDTCxJQUFJQyxZQUFKLENBQVU7QUFDUkMsTUFBQUEsS0FBSyxFQUFFLG1CQURDO0FBRVJDLE1BQUFBLE9BQU8sRUFBRSxnRkFGRDtBQUdSQyxNQUFBQSxRQUFRLEVBQ04sdUlBSk07QUFLUkMsTUFBQUEsS0FBSyxFQUFFLE1BQU07QUFDWCxjQUFNQyxTQUFTLEdBQUdWLE1BQU0sQ0FBQ1UsU0FBekI7QUFDQSxjQUFNQyxZQUFZLEdBQUcsUUFBUUMsSUFBUixDQUFhRixTQUFiLENBQXJCO0FBQ0EsY0FBTUcsWUFBWSxHQUFHLFFBQVFELElBQVIsQ0FBYUYsU0FBYixDQUFyQjtBQUNBLGNBQU1JLFVBQVUsR0FBRyxLQUFLRixJQUFMLENBQVVGLFNBQVYsQ0FBbkI7QUFDQSxjQUFNSyxvQkFBb0IsR0FBRyxLQUFLSCxJQUFMLENBQVVGLFNBQVYsQ0FBN0IsQ0FMVyxDQU1YOztBQUNBLFlBQUlBLFNBQVMsQ0FBQ00sTUFBVixHQUFtQixFQUF2QixFQUEyQjtBQUN6QixnQkFBTSxDQUFOO0FBQ0QsU0FUVSxDQVVYOzs7QUFDQSxZQUFJTCxZQUFZLEdBQUdFLFlBQWYsR0FBOEJDLFVBQTlCLEdBQTJDQyxvQkFBM0MsR0FBa0UsQ0FBdEUsRUFBeUU7QUFDdkUsZ0JBQU0sQ0FBTjtBQUNEO0FBQ0Y7QUFuQk8sS0FBVixDQURLLEVBc0JMLElBQUlWLFlBQUosQ0FBVTtBQUNSQyxNQUFBQSxLQUFLLEVBQUUsdUJBREM7QUFFUkMsTUFBQUEsT0FBTyxFQUFFLDhFQUZEO0FBR1JDLE1BQUFBLFFBQVEsRUFBRSx3RUFIRjtBQUlSQyxNQUFBQSxLQUFLLEVBQUUsTUFBTTtBQUNYLFlBQUlULE1BQU0sQ0FBQ2lCLFFBQVAsSUFBbUJqQixNQUFNLENBQUNpQixRQUFQLENBQWdCQyxjQUF2QyxFQUF1RDtBQUNyRCxnQkFBTSxDQUFOO0FBQ0Q7QUFDRjtBQVJPLEtBQVYsQ0F0QkssRUFnQ0wsSUFBSWIsWUFBSixDQUFVO0FBQ1JDLE1BQUFBLEtBQUssRUFBRSxnQ0FEQztBQUVSQyxNQUFBQSxPQUFPLEVBQ0wseUZBSE07QUFJUkMsTUFBQUEsUUFBUSxFQUFFLHlFQUpGO0FBS1JDLE1BQUFBLEtBQUssRUFBRSxNQUFNO0FBQ1gsWUFBSVQsTUFBTSxDQUFDbUIsd0JBQVAsSUFBbUNuQixNQUFNLENBQUNtQix3QkFBUCxJQUFtQyxJQUExRSxFQUFnRjtBQUM5RSxnQkFBTSxDQUFOO0FBQ0Q7QUFDRjtBQVRPLEtBQVYsQ0FoQ0ssQ0FBUDtBQTRDRDs7QUFsRDZDOztBQXFEaERDLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQnpCLHNCQUFqQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQG1vZHVsZSBTZWN1cml0eUNoZWNrXG4gKi9cblxuaW1wb3J0IHsgQ2hlY2sgfSBmcm9tICcuLi9DaGVjayc7XG5pbXBvcnQgQ2hlY2tHcm91cCBmcm9tICcuLi9DaGVja0dyb3VwJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vLi4vQ29uZmlnJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcblxuLyoqXG4gKiBUaGUgc2VjdXJpdHkgY2hlY2tzIGdyb3VwIGZvciBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbi5cbiAqIENoZWNrcyBjb21tb24gUGFyc2UgU2VydmVyIHBhcmFtZXRlcnMgc3VjaCBhcyBhY2Nlc3Mga2V5cy5cbiAqL1xuY2xhc3MgQ2hlY2tHcm91cFNlcnZlckNvbmZpZyBleHRlbmRzIENoZWNrR3JvdXAge1xuICBzZXROYW1lKCkge1xuICAgIHJldHVybiAnUGFyc2UgU2VydmVyIENvbmZpZ3VyYXRpb24nO1xuICB9XG4gIHNldENoZWNrcygpIHtcbiAgICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgIHJldHVybiBbXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ1NlY3VyZSBtYXN0ZXIga2V5JyxcbiAgICAgICAgd2FybmluZzogJ1RoZSBQYXJzZSBTZXJ2ZXIgbWFzdGVyIGtleSBpcyBpbnNlY3VyZSBhbmQgdnVsbmVyYWJsZSB0byBicnV0ZSBmb3JjZSBhdHRhY2tzLicsXG4gICAgICAgIHNvbHV0aW9uOlxuICAgICAgICAgICdDaG9vc2UgYSBsb25nZXIgYW5kL29yIG1vcmUgY29tcGxleCBtYXN0ZXIga2V5IHdpdGggYSBjb21iaW5hdGlvbiBvZiB1cHBlci0gYW5kIGxvd2VyY2FzZSBjaGFyYWN0ZXJzLCBudW1iZXJzIGFuZCBzcGVjaWFsIGNoYXJhY3RlcnMuJyxcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBjb25zdCBtYXN0ZXJLZXkgPSBjb25maWcubWFzdGVyS2V5O1xuICAgICAgICAgIGNvbnN0IGhhc1VwcGVyQ2FzZSA9IC9bQS1aXS8udGVzdChtYXN0ZXJLZXkpO1xuICAgICAgICAgIGNvbnN0IGhhc0xvd2VyQ2FzZSA9IC9bYS16XS8udGVzdChtYXN0ZXJLZXkpO1xuICAgICAgICAgIGNvbnN0IGhhc051bWJlcnMgPSAvXFxkLy50ZXN0KG1hc3RlcktleSk7XG4gICAgICAgICAgY29uc3QgaGFzTm9uQWxwaGFzTnVtZXJpY3MgPSAvXFxXLy50ZXN0KG1hc3RlcktleSk7XG4gICAgICAgICAgLy8gRW5zdXJlIGxlbmd0aFxuICAgICAgICAgIGlmIChtYXN0ZXJLZXkubGVuZ3RoIDwgMTQpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEVuc3VyZSBhdCBsZWFzdCAzIG91dCBvZiA0IHJlcXVpcmVtZW50cyBwYXNzZWRcbiAgICAgICAgICBpZiAoaGFzVXBwZXJDYXNlICsgaGFzTG93ZXJDYXNlICsgaGFzTnVtYmVycyArIGhhc05vbkFscGhhc051bWVyaWNzIDwgMykge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIG5ldyBDaGVjayh7XG4gICAgICAgIHRpdGxlOiAnU2VjdXJpdHkgbG9nIGRpc2FibGVkJyxcbiAgICAgICAgd2FybmluZzogJ1NlY3VyaXR5IGNoZWNrcyBpbiBsb2dzIG1heSBleHBvc2UgdnVsbmVyYWJpbGl0aWVzIHRvIGFueW9uZSBhY2Nlc3MgdG8gbG9ncy4nLFxuICAgICAgICBzb2x1dGlvbjogXCJDaGFuZ2UgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24gdG8gJ3NlY3VyaXR5LmVuYWJsZUNoZWNrTG9nOiBmYWxzZScuXCIsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbmZpZy5zZWN1cml0eSAmJiBjb25maWcuc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ0NsaWVudCBjbGFzcyBjcmVhdGlvbiBkaXNhYmxlZCcsXG4gICAgICAgIHdhcm5pbmc6XG4gICAgICAgICAgJ0F0dGFja2VycyBhcmUgYWxsb3dlZCB0byBjcmVhdGUgbmV3IGNsYXNzZXMgd2l0aG91dCByZXN0cmljdGlvbiBhbmQgZmxvb2QgdGhlIGRhdGFiYXNlLicsXG4gICAgICAgIHNvbHV0aW9uOiBcIkNoYW5nZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbiB0byAnYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uOiBmYWxzZScuXCIsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gfHwgY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgIF07XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDaGVja0dyb3VwU2VydmVyQ29uZmlnO1xuIl19