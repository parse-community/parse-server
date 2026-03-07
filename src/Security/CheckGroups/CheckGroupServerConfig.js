import { Check } from '../Check';
import CheckGroup from '../CheckGroup';
import Config from '../../Config';
import Parse from 'parse/node';

/**
 * The security checks group for Parse Server configuration.
 * Checks common Parse Server parameters such as access keys.
 * @memberof module:SecurityCheck
 */
class CheckGroupServerConfig extends CheckGroup {
  setName() {
    return 'Parse Server Configuration';
  }
  setChecks() {
    const config = Config.get(Parse.applicationId);
    return [
      new Check({
        title: 'Secure master key',
        warning: 'The Parse Server master key is insecure and vulnerable to brute force attacks.',
        solution:
          'Choose a longer and/or more complex master key with a combination of upper- and lowercase characters, numbers and special characters.',
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
        },
      }),
      new Check({
        title: 'Security log disabled',
        warning:
          'Security checks in logs may expose vulnerabilities to anyone with access to logs.',
        solution: "Change Parse Server configuration to 'security.enableCheckLog: false'.",
        check: () => {
          if (config.security && config.security.enableCheckLog) {
            throw 1;
          }
        },
      }),
      new Check({
        title: 'Client class creation disabled',
        warning:
          'Attackers are allowed to create new classes without restriction and flood the database.',
        solution: "Change Parse Server configuration to 'allowClientClassCreation: false'.",
        check: () => {
          if (config.allowClientClassCreation || config.allowClientClassCreation == null) {
            throw 1;
          }
        },
      }),
      new Check({
        title: 'Users are created without public access',
        warning:
          'Users with public read access are exposed to anyone who knows their object IDs, or to anyone who can query the Parse.User class.',
        solution: "Change Parse Server configuration to 'enforcePrivateUsers: true'.",
        check: () => {
          if (!config.enforcePrivateUsers) {
            throw 1;
          }
        },
      }),
      new Check({
        title: 'Insecure auth adapters disabled',
        warning:
          "Attackers may explore insecure auth adapters' vulnerabilities and log in on behalf of another user.",
        solution: "Change Parse Server configuration to 'enableInsecureAuthAdapters: false'.",
        check: () => {
          if (config.enableInsecureAuthAdapters !== false) {
            throw 1;
          }
        },
      }),
      new Check({
        title: 'GraphQL public introspection disabled',
        warning: 'GraphQL public introspection is enabled, which allows anyone to access the GraphQL schema.',
        solution: "Change Parse Server configuration to 'graphQLPublicIntrospection: false'. You will need to use master key or maintenance key to access the GraphQL schema.",
        check: () => {
          if (config.graphQLPublicIntrospection !== false) {
            throw 1;
          }
        },
      }),
      new Check({
        title: 'GraphQL Playground disabled',
        warning:
          'GraphQL Playground is enabled and exposes the master key in the browser page.',
        solution:
          "Change Parse Server configuration to 'mountPlayground: false'. Use Parse Dashboard for GraphQL exploration in production.",
        check: () => {
          if (config.mountPlayground) {
            throw 1;
          }
        },
      }),
      new Check({
        title: 'Public database explain disabled',
        warning:
          'Database explain queries are publicly accessible, which may expose sensitive database performance information and schema details.',
        solution:
          "Change Parse Server configuration to 'databaseOptions.allowPublicExplain: false'. You will need to use master key to run explain queries.",
        check: () => {
          if (
            config.databaseOptions?.allowPublicExplain === true ||
            config.databaseOptions?.allowPublicExplain == null
          ) {
            throw 1;
          }
        },
      }),
      new Check({
        title: 'Read-only master key IP range restricted',
        warning:
          'The read-only master key can be used from any IP address, which increases the attack surface if the key is compromised.',
        solution:
          "Change Parse Server configuration to 'readOnlyMasterKeyIps: [\"127.0.0.1\", \"::1\"]' to restrict access to localhost, or set it to a list of specific IP addresses.",
        check: () => {
          if (!config.readOnlyMasterKey) {
            return;
          }
          const ips = config.readOnlyMasterKeyIps || [];
          const wildcards = ['0.0.0.0/0', '0.0.0.0', '::/0', '::', '::0'];
          if (ips.some(ip => wildcards.includes(ip))) {
            throw 1;
          }
        },
      }),
      new Check({
        title: 'Request complexity limits enabled',
        warning:
          'One or more request complexity limits are disabled, which may allow denial-of-service attacks through deeply nested or excessively broad queries.',
        solution:
          "Ensure all properties in 'requestComplexity' are set to positive integers. Set to '-1' only if you have other mitigations in place.",
        check: () => {
          const rc = config.requestComplexity;
          if (!rc) {
            throw 1;
          }
          const values = [rc.includeDepth, rc.includeCount, rc.subqueryDepth, rc.graphQLDepth, rc.graphQLFields];
          if (values.some(v => v === -1)) {
            throw 1;
          }
        },
      }),
      new Check({
        title: 'LiveQuery regex timeout enabled',
        warning:
          'LiveQuery regex timeout is disabled. A malicious client can subscribe with a crafted $regex pattern that causes catastrophic backtracking, blocking the Node.js event loop and making the server unresponsive.',
        solution:
          "Change Parse Server configuration to 'liveQuery.regexTimeout: 100' to set a 100ms timeout for regex evaluation in LiveQuery.",
        check: () => {
          if (config.liveQuery?.classNames?.length > 0 && config.liveQuery?.regexTimeout === 0) {
            throw 1;
          }
        },
      }),
    ];
  }
}

module.exports = CheckGroupServerConfig;
