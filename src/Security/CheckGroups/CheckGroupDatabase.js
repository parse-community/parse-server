/**
 * @module SecurityCheck
 */

import { Check } from '../Check';
import CheckGroup from '../CheckGroup';
import Config from '../../Config';
import Parse from 'parse/node';

/**
* The security checks group for Parse Server configuration.
* Checks common Parse Server parameters such as access keys.
*/
class CheckGroupDatabase extends CheckGroup {
  setName() {
    return 'Database';
  }
  setChecks() {
    const config = Config.get(Parse.applicationId);
    const databaseAdapter = config.database.adapter;
    const databaseUrl = databaseAdapter._uri;
    const MongoClient = require('mongodb').MongoClient;
    return [
      new Check({
        title: `Database requires authentication`,
        warning: 'Database requires no authentication to connect which allows anyone to connect and potentially access data.',
        solution: 'Change database access settings.',
        check: async () => {
          try {
            const urlWithoutCredentials = databaseUrl.replace(/\/\/(\S+:\S+)@/, '//');
            const client = await MongoClient.connect(urlWithoutCredentials, { useNewUrlParser: true });
            await client.db("admin").command({ ping: 1 });
            throw 1;
          } catch {
            return;
          }
        },
      }),
      new Check({
        title: 'Secure database password',
        warning: 'The Parse Server master key is insecure and vulnerable to brute force attacks.',
        solution: 'Choose a more complex master key with a combination of upper- and lowercase characters, numbers and special characters.',
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
    ];
  }
}

module.exports = CheckGroupDatabase;
