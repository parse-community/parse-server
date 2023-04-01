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
        const hasNonAlphasNumerics = /\W/.test(masterKey);
        // Ensure length
        if (masterKey.length < 14) {
          throw 1;
        }
        // Ensure at least 3 out of 4 requirements passed
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQ2hlY2siLCJyZXF1aXJlIiwiX0NoZWNrR3JvdXAiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX0NvbmZpZyIsIl9ub2RlIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJDaGVja0dyb3VwU2VydmVyQ29uZmlnIiwiQ2hlY2tHcm91cCIsInNldE5hbWUiLCJzZXRDaGVja3MiLCJjb25maWciLCJDb25maWciLCJnZXQiLCJQYXJzZSIsImFwcGxpY2F0aW9uSWQiLCJDaGVjayIsInRpdGxlIiwid2FybmluZyIsInNvbHV0aW9uIiwiY2hlY2siLCJtYXN0ZXJLZXkiLCJoYXNVcHBlckNhc2UiLCJ0ZXN0IiwiaGFzTG93ZXJDYXNlIiwiaGFzTnVtYmVycyIsImhhc05vbkFscGhhc051bWVyaWNzIiwibGVuZ3RoIiwic2VjdXJpdHkiLCJlbmFibGVDaGVja0xvZyIsImFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL1NlY3VyaXR5L0NoZWNrR3JvdXBzL0NoZWNrR3JvdXBTZXJ2ZXJDb25maWcuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbW9kdWxlIFNlY3VyaXR5Q2hlY2tcbiAqL1xuXG5pbXBvcnQgeyBDaGVjayB9IGZyb20gJy4uL0NoZWNrJztcbmltcG9ydCBDaGVja0dyb3VwIGZyb20gJy4uL0NoZWNrR3JvdXAnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi8uLi9Db25maWcnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG4vKipcbiAqIFRoZSBzZWN1cml0eSBjaGVja3MgZ3JvdXAgZm9yIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uLlxuICogQ2hlY2tzIGNvbW1vbiBQYXJzZSBTZXJ2ZXIgcGFyYW1ldGVycyBzdWNoIGFzIGFjY2VzcyBrZXlzLlxuICovXG5jbGFzcyBDaGVja0dyb3VwU2VydmVyQ29uZmlnIGV4dGVuZHMgQ2hlY2tHcm91cCB7XG4gIHNldE5hbWUoKSB7XG4gICAgcmV0dXJuICdQYXJzZSBTZXJ2ZXIgQ29uZmlndXJhdGlvbic7XG4gIH1cbiAgc2V0Q2hlY2tzKCkge1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgcmV0dXJuIFtcbiAgICAgIG5ldyBDaGVjayh7XG4gICAgICAgIHRpdGxlOiAnU2VjdXJlIG1hc3RlciBrZXknLFxuICAgICAgICB3YXJuaW5nOiAnVGhlIFBhcnNlIFNlcnZlciBtYXN0ZXIga2V5IGlzIGluc2VjdXJlIGFuZCB2dWxuZXJhYmxlIHRvIGJydXRlIGZvcmNlIGF0dGFja3MuJyxcbiAgICAgICAgc29sdXRpb246XG4gICAgICAgICAgJ0Nob29zZSBhIGxvbmdlciBhbmQvb3IgbW9yZSBjb21wbGV4IG1hc3RlciBrZXkgd2l0aCBhIGNvbWJpbmF0aW9uIG9mIHVwcGVyLSBhbmQgbG93ZXJjYXNlIGNoYXJhY3RlcnMsIG51bWJlcnMgYW5kIHNwZWNpYWwgY2hhcmFjdGVycy4nLFxuICAgICAgICBjaGVjazogKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IG1hc3RlcktleSA9IGNvbmZpZy5tYXN0ZXJLZXk7XG4gICAgICAgICAgY29uc3QgaGFzVXBwZXJDYXNlID0gL1tBLVpdLy50ZXN0KG1hc3RlcktleSk7XG4gICAgICAgICAgY29uc3QgaGFzTG93ZXJDYXNlID0gL1thLXpdLy50ZXN0KG1hc3RlcktleSk7XG4gICAgICAgICAgY29uc3QgaGFzTnVtYmVycyA9IC9cXGQvLnRlc3QobWFzdGVyS2V5KTtcbiAgICAgICAgICBjb25zdCBoYXNOb25BbHBoYXNOdW1lcmljcyA9IC9cXFcvLnRlc3QobWFzdGVyS2V5KTtcbiAgICAgICAgICAvLyBFbnN1cmUgbGVuZ3RoXG4gICAgICAgICAgaWYgKG1hc3RlcktleS5sZW5ndGggPCAxNCkge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRW5zdXJlIGF0IGxlYXN0IDMgb3V0IG9mIDQgcmVxdWlyZW1lbnRzIHBhc3NlZFxuICAgICAgICAgIGlmIChoYXNVcHBlckNhc2UgKyBoYXNMb3dlckNhc2UgKyBoYXNOdW1iZXJzICsgaGFzTm9uQWxwaGFzTnVtZXJpY3MgPCAzKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgbmV3IENoZWNrKHtcbiAgICAgICAgdGl0bGU6ICdTZWN1cml0eSBsb2cgZGlzYWJsZWQnLFxuICAgICAgICB3YXJuaW5nOlxuICAgICAgICAgICdTZWN1cml0eSBjaGVja3MgaW4gbG9ncyBtYXkgZXhwb3NlIHZ1bG5lcmFiaWxpdGllcyB0byBhbnlvbmUgd2l0aCBhY2Nlc3MgdG8gbG9ncy4nLFxuICAgICAgICBzb2x1dGlvbjogXCJDaGFuZ2UgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24gdG8gJ3NlY3VyaXR5LmVuYWJsZUNoZWNrTG9nOiBmYWxzZScuXCIsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbmZpZy5zZWN1cml0eSAmJiBjb25maWcuc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ0NsaWVudCBjbGFzcyBjcmVhdGlvbiBkaXNhYmxlZCcsXG4gICAgICAgIHdhcm5pbmc6XG4gICAgICAgICAgJ0F0dGFja2VycyBhcmUgYWxsb3dlZCB0byBjcmVhdGUgbmV3IGNsYXNzZXMgd2l0aG91dCByZXN0cmljdGlvbiBhbmQgZmxvb2QgdGhlIGRhdGFiYXNlLicsXG4gICAgICAgIHNvbHV0aW9uOiBcIkNoYW5nZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbiB0byAnYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uOiBmYWxzZScuXCIsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gfHwgY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgbmV3IENoZWNrKHtcbiAgICAgICAgdGl0bGU6ICdVc2VycyBhcmUgY3JlYXRlZCB3aXRob3V0IHB1YmxpYyBhY2Nlc3MnLFxuICAgICAgICB3YXJuaW5nOlxuICAgICAgICAgICdVc2VycyB3aXRoIHB1YmxpYyByZWFkIGFjY2VzcyBhcmUgZXhwb3NlZCB0byBhbnlvbmUgd2hvIGtub3dzIHRoZWlyIG9iamVjdCBJRHMsIG9yIHRvIGFueW9uZSB3aG8gY2FuIHF1ZXJ5IHRoZSBQYXJzZS5Vc2VyIGNsYXNzLicsXG4gICAgICAgIHNvbHV0aW9uOiBcIkNoYW5nZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbiB0byAnZW5mb3JjZVByaXZhdGVVc2VyczogdHJ1ZScuXCIsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCFjb25maWcuZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICBdO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ2hlY2tHcm91cFNlcnZlckNvbmZpZztcbiJdLCJtYXBwaW5ncyI6Ijs7QUFJQSxJQUFBQSxNQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxXQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxPQUFBLEdBQUFELHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBSSxLQUFBLEdBQUFGLHNCQUFBLENBQUFGLE9BQUE7QUFBK0IsU0FBQUUsdUJBQUFHLEdBQUEsV0FBQUEs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