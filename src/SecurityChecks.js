import { getTrigger } from './triggers.js';
import url from 'url';
import Parse from 'parse/node';
export async function securityChecks(req) {
  try {
    const options = req.config || req;
    if (!options.securityChecks.enabled) {
      return { error: { code: 1, error: 'Security checks are not enabled.' } };
    }
    const clpWarnings = {};
    const securityWarnings = [];
    let totalWarnings = 0;
    if (options.allowClientClassCreation) {
      securityWarnings.push({
        title: 'Allow Client Class Creation is not recommended.',
        message:
          'Allow client class creation is not recommended for production servers it allows any user - authorized or not - to create a new class.',
        link: 'https://docs.parseplatform.org/js/guide/#restricting-class-creation',
      });
    }
    if (!options.masterKey.match('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{14,})')) {
      securityWarnings.push({
        title: 'Weak masterKey.',
        message:
          'masterKey is a key that overrides all permissions. You should use a secure string for your masterKey',
        link: 'https://docs.parseplatform.org/parse-server/guide/#keys',
      });
    }
    const schema = await options.database.loadSchema();
    const all = await schema.getAllClasses();
    for (const field of all) {
      const className = field.className;
      const clp = field.classLevelPermissions;
      const thisClassWarnings = clpWarnings[className] || [];
      if (!clp) {
        totalWarnings++;
        thisClassWarnings.push({
          title: `No Class Level Permissions on ${className}`,
          message:
            'Class level permissions are a security feature from that allows one to restrict access on a broader way than the ACL based permissions. We recommend implementing CLPs on all database classes.',
          link: 'https://docs.parseplatform.org/parse-server/guide/#class-level-permissions',
        });
        clpWarnings[className] = thisClassWarnings;
        continue;
      }
      const keys = ['find', 'count', 'get', 'create', 'update', 'delete', 'addField'];
      for (const key of keys) {
        const option = clp[key];
        if (className === '_User' && key === 'create') {
          continue;
        }
        if (!option || option['*']) {
          totalWarnings++;
          thisClassWarnings.push({
            title: `Unrestricted access to ${key}.`,
            message: `We recommend restricting ${key} on all classes`,
            link: 'https://docs.parseplatform.org/parse-server/guide/#class-level-permissions',
          });
        } else if (Object.keys(option).length != 0 && key === 'addField') {
          totalWarnings++;
          thisClassWarnings.push({
            title: `Certain users can add fields.`,
            message:
              'Class level permissions are a security feature from that allows one to restrict access on a broader way than the ACL based permissions. We recommend implementing CLPs on all database classes.',
            link: 'https://docs.parseplatform.org/parse-server/guide/#class-level-permissions',
          });
        }
      }
      clpWarnings[className] = thisClassWarnings;
    }
    const fileTrigger = getTrigger('@File', 'beforeSaveFile', options.appId);
    if (!fileTrigger) {
      totalWarnings++;
      securityWarnings.push({
        title: `No beforeFileSave Trigger`,
        message:
          "Even if you don't store files, we strongly recommend using a beforeFileSave trigger to prevent unauthorized uploads.",
        link: 'https://docs.parseplatform.org/cloudcode/guide/#beforesavefile',
      });
    } else {
      try {
        const file = new Parse.File('testpopeye.txt', [1, 2, 3], 'text/plain');
        await file.save();
        totalWarnings++;
        securityWarnings.push({
          title: `Unrestricted access to file uploads`,
          message:
            'Even though you have a beforeFileSave trigger, it allows unregistered users to upload.',
          link: 'https://docs.parseplatform.org/cloudcode/guide/#beforesavefile',
        });
        await options.filesController.deleteFile(file._name);
      } catch (e) {
        /* */
      }
    }
    let https = false;
    try {
      const serverURL = url.parse(options.serverURL);
      https = serverURL.protocol === 'https:';
    } catch (e) {
      /* */
    }
    if (!https) {
      totalWarnings++;
      securityWarnings.push({
        title: `Server served over HTTP`,
        message: 'We strongly recommend using a HTTPS protocol.',
      });
    }
    let databaseURI = options.databaseURI;
    let protocol;
    try {
      const parsedURI = url.parse(databaseURI);
      protocol = parsedURI.protocol ? parsedURI.protocol.toLowerCase() : null;
    } catch (e) {
      /* */
    }
    if (protocol !== 'postgres:') {
      if (databaseURI.includes('@')) {
        databaseURI = `mongodb://${databaseURI.split('@')[1]}`;
        const pwd = options.databaseURI.split('//')[1].split('@')[0].split(':')[1] || '';
        if (!pwd.match('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{14,})')) {
          // DB string must contain at least 1 lowercase alphabetical character
          // DB string must contain at least 1 uppercase alphabetical character
          // DB string must contain at least 1 numeric character
          // DB string must contain at least one special character
          // DB string must be 14 characters or longer
          securityWarnings.push({
            title: `Weak Database Password`,
            message: 'The password used to connect to your database could be stronger.',
            link: 'https://docs.mongodb.com/manual/security/',
          });
          totalWarnings++;
        }
      }
      let databaseAdmin = '' + databaseURI;
      try {
        const parsedURI = url.parse(databaseAdmin);
        parsedURI.port = '27017';
        databaseAdmin = parsedURI.toString();
      } catch (e) {
        /* */
      }
      const mongodb = require('mongodb');
      const MongoClient = mongodb.MongoClient;
      try {
        await MongoClient.connect(databaseAdmin, { useNewUrlParser: true });
        securityWarnings.push({
          title: `Unrestricted access to port 27017`,
          message:
            'It is possible to connect to the admin port of your mongoDb without authentication.',
          link: 'https://docs.mongodb.com/manual/security/',
        });
        totalWarnings++;
      } catch (e) {
        /* */
      }
      try {
        await MongoClient.connect(databaseURI, { useNewUrlParser: true });
        securityWarnings.push({
          title: `Unrestricted access to your database`,
          message:
            'It is possible to connect to your mongoDb without username and password on your connection string.',
          link: 'https://docs.mongodb.com/manual/security/',
        });
        totalWarnings++;
      } catch (e) {
        /* */
      }
    }
    return { response: { Security: securityWarnings, CLP: clpWarnings, Total: totalWarnings } };
  } catch (error) {
    return { error: { code: 1, error: error.message || 'Internal Server Error.' } };
  }
}
