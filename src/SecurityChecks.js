import url from 'url';

export async function securityChecks(req) {
  try {
    const options = req.config || req;
    if (!options.securityChecks.enableSecurityChecks) {
      return { error: { code: 1, error: 'Security checks are not enabled.' } };
    }
    const response = {};
    let totalWarnings = 0;
    const getResultForSecurityCheck = async (name, theFunction) => {
      try {
        const result = await theFunction(req);
        totalWarnings += result.length || Object.keys(result).length || 0;
        response[name] = result;
      } catch (e) {
        /* */
      }
    };
    const promises = [
      getResultForSecurityCheck('CLP', checkCLP),
      getResultForSecurityCheck('ServerConfig', checkServerConfig),
      getResultForSecurityCheck('Files', checkFiles),
    ];
    if (
      options.database.adapter.getSecurityLogs &&
      typeof options.database.adapter.getSecurityLogs === 'function'
    ) {
      promises.push(
        getResultForSecurityCheck('Database', options.database.adapter.getSecurityLogs)
      );
    }
    await Promise.all(promises);
    response.Total = totalWarnings;
    return { response };
  } catch (error) {
    return { error: { code: 1, error: error.message || 'Internal Server Error.' } };
  }
}

async function checkCLP(req) {
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
        message: `Any client can create, find, count, get, update, delete, or add field on ${className}. This allows an attacker to create new objects or fieldNames without restriction and potentially flood the database. Set CLPs using Parse Dashboard.`,
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
          message: `Any client can ${key} on ${className}.`,
        });
      } else if (Object.keys(option).length != 0 && key === 'addField') {
        thisClassWarnings.push({
          title: `Certain users can add fields.`,
          message: `Certain users can add fields on ${className}. This allows these users to create new fieldNames and potentially flood the schema. Set CLPs using Parse Dashboard.`,
        });
      }
    }
    clpWarnings[className] = thisClassWarnings;
  }
  return clpWarnings;
}
function checkServerConfig(req) {
  const options = req.config || req;
  const warnings = [];
  if (options.allowClientClassCreation) {
    warnings.push({
      title: 'Client class creation allowed',
      message:
        'Clients are currently allowed to create new classes. This allows an attacker to create new classes without restriction and potentially flood the database. Change the Parse Server configuration to allowClientClassCreation: false.',
    });
  }
  if (!options.masterKey.match('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{14,})')) {
    warnings.push({
      title: 'Weak masterKey.',
      message:
        'The masterKey set to your configuration lacks complexity and length. This could potentially allow an attacker to brute force the masterKey, exposing all the entire Parse Server.',
    });
  }
  let https = false;
  try {
    const serverURL = url.parse(options.publicServerUrl || options.serverURL);
    https = serverURL.protocol === 'https:';
  } catch (e) {
    /* */
  }
  if (!https) {
    warnings.push({
      title: `Parse Server served over HTTP`,
      message:
        'The server url is currently HTTP. This allows an attacker to listen to all traffic in-between the server and the client. Change the Parse Server configuration serverURL to HTTPS.',
    });
  }
  return warnings;
}
async function checkFiles(req) {
  const options = req.config || req;
  const fileWarnings = [];
  if (options.fileUpload && options.fileUpload.enableForPublic) {
    fileWarnings.push({
      title: `Public File Upload Enabled`,
      message:
        'Public file upload is currently enabled. This allows a client to upload files without requiring login or authentication. Remove enableForPublic from fileUpload in the Parse Server configuration.',
    });
  }
  return fileWarnings;
}
