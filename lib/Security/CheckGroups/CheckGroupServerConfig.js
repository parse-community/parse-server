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
      warning: 'Security checks in logs may expose vulnerabilities to anyone with access to logs.',
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
    }), new _Check.Check({
      title: 'Users are created without public access',
      warning: 'Users with public read access are exposed to anyone who knows their object IDs, or to anyone who can query the Parse.User class.',
      solution: "Change Parse Server configuration to 'enforcePrivateUsers: true'.",
      check: () => {
        if (!config.enforcePrivateUsers) {
          throw 1;
        }
      }
    })];
  }

}

module.exports = CheckGroupServerConfig;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9TZWN1cml0eS9DaGVja0dyb3Vwcy9DaGVja0dyb3VwU2VydmVyQ29uZmlnLmpzIl0sIm5hbWVzIjpbIkNoZWNrR3JvdXBTZXJ2ZXJDb25maWciLCJDaGVja0dyb3VwIiwic2V0TmFtZSIsInNldENoZWNrcyIsImNvbmZpZyIsIkNvbmZpZyIsImdldCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsIkNoZWNrIiwidGl0bGUiLCJ3YXJuaW5nIiwic29sdXRpb24iLCJjaGVjayIsIm1hc3RlcktleSIsImhhc1VwcGVyQ2FzZSIsInRlc3QiLCJoYXNMb3dlckNhc2UiLCJoYXNOdW1iZXJzIiwiaGFzTm9uQWxwaGFzTnVtZXJpY3MiLCJsZW5ndGgiLCJzZWN1cml0eSIsImVuYWJsZUNoZWNrTG9nIiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwiZW5mb3JjZVByaXZhdGVVc2VycyIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBSUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7QUFQQTtBQUNBO0FBQ0E7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxzQkFBTixTQUFxQ0MsbUJBQXJDLENBQWdEO0FBQzlDQyxFQUFBQSxPQUFPLEdBQUc7QUFDUixXQUFPLDRCQUFQO0FBQ0Q7O0FBQ0RDLEVBQUFBLFNBQVMsR0FBRztBQUNWLFVBQU1DLE1BQU0sR0FBR0MsZ0JBQU9DLEdBQVAsQ0FBV0MsY0FBTUMsYUFBakIsQ0FBZjs7QUFDQSxXQUFPLENBQ0wsSUFBSUMsWUFBSixDQUFVO0FBQ1JDLE1BQUFBLEtBQUssRUFBRSxtQkFEQztBQUVSQyxNQUFBQSxPQUFPLEVBQUUsZ0ZBRkQ7QUFHUkMsTUFBQUEsUUFBUSxFQUNOLHVJQUpNO0FBS1JDLE1BQUFBLEtBQUssRUFBRSxNQUFNO0FBQ1gsY0FBTUMsU0FBUyxHQUFHVixNQUFNLENBQUNVLFNBQXpCO0FBQ0EsY0FBTUMsWUFBWSxHQUFHLFFBQVFDLElBQVIsQ0FBYUYsU0FBYixDQUFyQjtBQUNBLGNBQU1HLFlBQVksR0FBRyxRQUFRRCxJQUFSLENBQWFGLFNBQWIsQ0FBckI7QUFDQSxjQUFNSSxVQUFVLEdBQUcsS0FBS0YsSUFBTCxDQUFVRixTQUFWLENBQW5CO0FBQ0EsY0FBTUssb0JBQW9CLEdBQUcsS0FBS0gsSUFBTCxDQUFVRixTQUFWLENBQTdCLENBTFcsQ0FNWDs7QUFDQSxZQUFJQSxTQUFTLENBQUNNLE1BQVYsR0FBbUIsRUFBdkIsRUFBMkI7QUFDekIsZ0JBQU0sQ0FBTjtBQUNELFNBVFUsQ0FVWDs7O0FBQ0EsWUFBSUwsWUFBWSxHQUFHRSxZQUFmLEdBQThCQyxVQUE5QixHQUEyQ0Msb0JBQTNDLEdBQWtFLENBQXRFLEVBQXlFO0FBQ3ZFLGdCQUFNLENBQU47QUFDRDtBQUNGO0FBbkJPLEtBQVYsQ0FESyxFQXNCTCxJQUFJVixZQUFKLENBQVU7QUFDUkMsTUFBQUEsS0FBSyxFQUFFLHVCQURDO0FBRVJDLE1BQUFBLE9BQU8sRUFDTCxtRkFITTtBQUlSQyxNQUFBQSxRQUFRLEVBQUUsd0VBSkY7QUFLUkMsTUFBQUEsS0FBSyxFQUFFLE1BQU07QUFDWCxZQUFJVCxNQUFNLENBQUNpQixRQUFQLElBQW1CakIsTUFBTSxDQUFDaUIsUUFBUCxDQUFnQkMsY0FBdkMsRUFBdUQ7QUFDckQsZ0JBQU0sQ0FBTjtBQUNEO0FBQ0Y7QUFUTyxLQUFWLENBdEJLLEVBaUNMLElBQUliLFlBQUosQ0FBVTtBQUNSQyxNQUFBQSxLQUFLLEVBQUUsZ0NBREM7QUFFUkMsTUFBQUEsT0FBTyxFQUNMLHlGQUhNO0FBSVJDLE1BQUFBLFFBQVEsRUFBRSx5RUFKRjtBQUtSQyxNQUFBQSxLQUFLLEVBQUUsTUFBTTtBQUNYLFlBQUlULE1BQU0sQ0FBQ21CLHdCQUFQLElBQW1DbkIsTUFBTSxDQUFDbUIsd0JBQVAsSUFBbUMsSUFBMUUsRUFBZ0Y7QUFDOUUsZ0JBQU0sQ0FBTjtBQUNEO0FBQ0Y7QUFUTyxLQUFWLENBakNLLEVBNENMLElBQUlkLFlBQUosQ0FBVTtBQUNSQyxNQUFBQSxLQUFLLEVBQUUseUNBREM7QUFFUkMsTUFBQUEsT0FBTyxFQUNMLGtJQUhNO0FBSVJDLE1BQUFBLFFBQVEsRUFBRSxtRUFKRjtBQUtSQyxNQUFBQSxLQUFLLEVBQUUsTUFBTTtBQUNYLFlBQUksQ0FBQ1QsTUFBTSxDQUFDb0IsbUJBQVosRUFBaUM7QUFDL0IsZ0JBQU0sQ0FBTjtBQUNEO0FBQ0Y7QUFUTyxLQUFWLENBNUNLLENBQVA7QUF3REQ7O0FBOUQ2Qzs7QUFpRWhEQyxNQUFNLENBQUNDLE9BQVAsR0FBaUIxQixzQkFBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBtb2R1bGUgU2VjdXJpdHlDaGVja1xuICovXG5cbmltcG9ydCB7IENoZWNrIH0gZnJvbSAnLi4vQ2hlY2snO1xuaW1wb3J0IENoZWNrR3JvdXAgZnJvbSAnLi4vQ2hlY2tHcm91cCc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uLy4uL0NvbmZpZyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5cbi8qKlxuICogVGhlIHNlY3VyaXR5IGNoZWNrcyBncm91cCBmb3IgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24uXG4gKiBDaGVja3MgY29tbW9uIFBhcnNlIFNlcnZlciBwYXJhbWV0ZXJzIHN1Y2ggYXMgYWNjZXNzIGtleXMuXG4gKi9cbmNsYXNzIENoZWNrR3JvdXBTZXJ2ZXJDb25maWcgZXh0ZW5kcyBDaGVja0dyb3VwIHtcbiAgc2V0TmFtZSgpIHtcbiAgICByZXR1cm4gJ1BhcnNlIFNlcnZlciBDb25maWd1cmF0aW9uJztcbiAgfVxuICBzZXRDaGVja3MoKSB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICByZXR1cm4gW1xuICAgICAgbmV3IENoZWNrKHtcbiAgICAgICAgdGl0bGU6ICdTZWN1cmUgbWFzdGVyIGtleScsXG4gICAgICAgIHdhcm5pbmc6ICdUaGUgUGFyc2UgU2VydmVyIG1hc3RlciBrZXkgaXMgaW5zZWN1cmUgYW5kIHZ1bG5lcmFibGUgdG8gYnJ1dGUgZm9yY2UgYXR0YWNrcy4nLFxuICAgICAgICBzb2x1dGlvbjpcbiAgICAgICAgICAnQ2hvb3NlIGEgbG9uZ2VyIGFuZC9vciBtb3JlIGNvbXBsZXggbWFzdGVyIGtleSB3aXRoIGEgY29tYmluYXRpb24gb2YgdXBwZXItIGFuZCBsb3dlcmNhc2UgY2hhcmFjdGVycywgbnVtYmVycyBhbmQgc3BlY2lhbCBjaGFyYWN0ZXJzLicsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgY29uc3QgbWFzdGVyS2V5ID0gY29uZmlnLm1hc3RlcktleTtcbiAgICAgICAgICBjb25zdCBoYXNVcHBlckNhc2UgPSAvW0EtWl0vLnRlc3QobWFzdGVyS2V5KTtcbiAgICAgICAgICBjb25zdCBoYXNMb3dlckNhc2UgPSAvW2Etel0vLnRlc3QobWFzdGVyS2V5KTtcbiAgICAgICAgICBjb25zdCBoYXNOdW1iZXJzID0gL1xcZC8udGVzdChtYXN0ZXJLZXkpO1xuICAgICAgICAgIGNvbnN0IGhhc05vbkFscGhhc051bWVyaWNzID0gL1xcVy8udGVzdChtYXN0ZXJLZXkpO1xuICAgICAgICAgIC8vIEVuc3VyZSBsZW5ndGhcbiAgICAgICAgICBpZiAobWFzdGVyS2V5Lmxlbmd0aCA8IDE0KSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgYXQgbGVhc3QgMyBvdXQgb2YgNCByZXF1aXJlbWVudHMgcGFzc2VkXG4gICAgICAgICAgaWYgKGhhc1VwcGVyQ2FzZSArIGhhc0xvd2VyQ2FzZSArIGhhc051bWJlcnMgKyBoYXNOb25BbHBoYXNOdW1lcmljcyA8IDMpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ1NlY3VyaXR5IGxvZyBkaXNhYmxlZCcsXG4gICAgICAgIHdhcm5pbmc6XG4gICAgICAgICAgJ1NlY3VyaXR5IGNoZWNrcyBpbiBsb2dzIG1heSBleHBvc2UgdnVsbmVyYWJpbGl0aWVzIHRvIGFueW9uZSB3aXRoIGFjY2VzcyB0byBsb2dzLicsXG4gICAgICAgIHNvbHV0aW9uOiBcIkNoYW5nZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbiB0byAnc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2c6IGZhbHNlJy5cIixcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBpZiAoY29uZmlnLnNlY3VyaXR5ICYmIGNvbmZpZy5zZWN1cml0eS5lbmFibGVDaGVja0xvZykge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIG5ldyBDaGVjayh7XG4gICAgICAgIHRpdGxlOiAnQ2xpZW50IGNsYXNzIGNyZWF0aW9uIGRpc2FibGVkJyxcbiAgICAgICAgd2FybmluZzpcbiAgICAgICAgICAnQXR0YWNrZXJzIGFyZSBhbGxvd2VkIHRvIGNyZWF0ZSBuZXcgY2xhc3NlcyB3aXRob3V0IHJlc3RyaWN0aW9uIGFuZCBmbG9vZCB0aGUgZGF0YWJhc2UuJyxcbiAgICAgICAgc29sdXRpb246IFwiQ2hhbmdlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIHRvICdhbGxvd0NsaWVudENsYXNzQ3JlYXRpb246IGZhbHNlJy5cIixcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBpZiAoY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiB8fCBjb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ1VzZXJzIGFyZSBjcmVhdGVkIHdpdGhvdXQgcHVibGljIGFjY2VzcycsXG4gICAgICAgIHdhcm5pbmc6XG4gICAgICAgICAgJ1VzZXJzIHdpdGggcHVibGljIHJlYWQgYWNjZXNzIGFyZSBleHBvc2VkIHRvIGFueW9uZSB3aG8ga25vd3MgdGhlaXIgb2JqZWN0IElEcywgb3IgdG8gYW55b25lIHdobyBjYW4gcXVlcnkgdGhlIFBhcnNlLlVzZXIgY2xhc3MuJyxcbiAgICAgICAgc29sdXRpb246IFwiQ2hhbmdlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIHRvICdlbmZvcmNlUHJpdmF0ZVVzZXJzOiB0cnVlJy5cIixcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIWNvbmZpZy5lbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgIF07XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDaGVja0dyb3VwU2VydmVyQ29uZmlnO1xuIl19