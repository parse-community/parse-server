import { getTrigger } from './triggers.js';
import url from 'url';
import Parse from 'parse/node';

async function CLP(req) {
  const options = req.config || req;
  const schema = await options.database.loadSchema();
  const all = await schema.getAllClasses();
  const clpWarnings = {};
  for (const field of all) {
    const className = field.className;
    const clp = field.classLevelPermissions;
    const thisClassWarnings = clpWarnings[className] || [];
    if (!clp) {
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
        thisClassWarnings.push({
          title: `Unrestricted access to ${key}.`,
          message: `We recommend restricting ${key} on all classes`,
          link: 'https://docs.parseplatform.org/parse-server/guide/#class-level-permissions',
        });
      } else if (Object.keys(option).length != 0 && key === 'addField') {
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
  return clpWarnings;
}
function ServerConfig(req) {
  const options = req.config || req;
  const warnings = [];
  if (options.allowClientClassCreation) {
    warnings.push({
      title: 'Allow Client Class Creation is not recommended.',
      message:
        'Allow client class creation is not recommended for production servers it allows any user - authorized or not - to create a new class.',
      link: 'https://docs.parseplatform.org/js/guide/#restricting-class-creation',
    });
  }
  if (!options.masterKey.match('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{14,})')) {
    warnings.push({
      title: 'Weak masterKey.',
      message:
        'masterKey is a key that overrides all permissions. You should use a secure string for your masterKey',
      link: 'https://docs.parseplatform.org/parse-server/guide/#keys',
    });
  }
  let https = false;
  try {
    const serverURL = url.parse(options.serverURL);
    https = serverURL.protocol === 'https:';
  } catch (e) {
    /* */
  }
  if (!https) {
    warnings.push({
      title: `Server served over HTTP`,
      message: 'We strongly recommend using a HTTPS protocol.',
    });
  }
  return warnings;
}
async function Files(req) {
  const options = req.config || req;
  const fileTrigger = getTrigger('@File', 'beforeSaveFile', options.appId);
  const fileWarnings = [];
  if (!fileTrigger) {
    fileWarnings.push({
      title: `No beforeFileSave Trigger`,
      message:
        "Even if you don't store files, we strongly recommend using a beforeFileSave trigger to prevent unauthorized uploads.",
      link: 'https://docs.parseplatform.org/cloudcode/guide/#beforesavefile',
    });
  } else {
    try {
      const file = new Parse.File('testpopeye.txt', [1, 2, 3], 'text/plain');
      await file.save();
      fileWarnings.push({
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
  return fileWarnings;
}

export async function securityChecks(req) {
  try {
    const options = req.config || req;
    if (!options.securityChecks.enabled) {
      return { error: { code: 1, error: 'Security checks are not enabled.' } };
    }
    const functions = {
      CLP,
      ServerConfig,
      Files,
    };
    if (
      options.databaseAdapter.getSecurityLogs &&
      typeof options.databaseAdapter.getSecurityLogs === 'function'
    ) {
      functions.Database = options.databaseAdapter.getSecurityLogs;
    }
    const response = {};
    let totalWarnings = 0;
    for (const name in functions) {
      try {
        const theFunction = functions[name];
        const result = await theFunction(req);
        if (Array.isArray(result)) {
          totalWarnings += result.length;
        } else {
          totalWarnings += Object.keys(result).length;
        }
        response[name] = result;
      } catch (e) {
        /* */
      }
    }
    response.Total = totalWarnings;
    return { response };
  } catch (error) {
    return { error: { code: 1, error: error.message || 'Internal Server Error.' } };
  }
}
