import { Check } from '../Check';
import CheckGroup from '../CheckGroup';
import Config from '../../Config';
import Parse from 'parse/node';

/**
 * The security checks group for Parse Server configuration.
 * Checks common Parse Server parameters such as access keys
 * @memberof module:SecurityCheck
 */
class CheckGroupDatabase extends CheckGroup {
  setName() {
    return 'Database';
  }
  setChecks() {
    const config = Config.get(Parse.applicationId);
    let databaseUrl;
    const databaseAdapter = config.database.adapter;
    if (databaseAdapter) {
      // If database adapter is defined, use its URI
      databaseUrl = databaseAdapter._uri;
    } else if (config.databaseURI) {
      // If database adapter is not defined, fallback to config.databaseURI
      databaseUrl = config.databaseURI;
    } else {
      // Handle the case where neither database adapter nor databaseURI is defined
      throw 1;
    }
    return [
      new Check({
        title: 'Secure database password',
        warning: 'The database password is insecure and vulnerable to brute force attacks.',
        solution:
          'Choose a longer and/or more complex password with a combination of upper- and lowercase characters, numbers and special characters.',
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
        },
      }),
    ];
  }
}

module.exports = CheckGroupDatabase;
