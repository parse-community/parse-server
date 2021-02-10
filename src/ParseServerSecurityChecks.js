import Parse from 'parse/node';
import url from 'url';
const registerServerSecurityChecks = async req => {
  const options = req.config || req;
  await Promise.all([registerCLP(options), checkServerConfig(options), checkFiles(options)]);
};
async function registerCLP(options) {
  const schema = await options.databaseController.loadSchema();
  const all = await schema.getAllClasses();
  for (const field of all) {
    const { className, clp } = field;
    const clpCheck = new Parse.SecurityCheck({
      group: Parse.SecurityCheck.Category.CLP,
      title: `No Class Level Permissions on ${className}`,
      warning: `Any client can create, find, count, get, update, delete, or add field on ${className}. This allows an attacker to create new objects or fieldNames without restriction and potentially flood the database. Set CLPs using Parse Dashboard.`,
      success: `Class Level Permissions on ${className}`,
    });
    if (!clp) {
      clpCheck.setFailed();
      continue;
    }
    const keys = ['find', 'count', 'get', 'create', 'update', 'delete', 'addField'];
    for (const key of keys) {
      const option = clp[key];
      if (className === '_User' && key === 'create') {
        continue;
      }
      const optionCheck = new Parse.SecurityCheck({
        group: Parse.SecurityCheck.Category.CLP,
        title: `Unrestricted access to ${key}.`,
        warning: `Any client can ${key} on ${className}.`,
        success: `${key} is restricted on ${className}`,
      });
      const addFileCheck = new Parse.SecurityCheck({
        group: Parse.SecurityCheck.Category.CLP,
        title: `Certain users can add fields.`,
        warning: `Certain users can add fields on ${className}. This allows these users to create new fieldNames and potentially flood the schema. Set CLPs using Parse Dashboard.`,
        success: `AddField is restricted on ${className}`,
      });
      if (!option || option['*']) {
        optionCheck.setFailed();
      } else if (Object.keys(option).length != 0 && key === 'addField') {
        addFileCheck.setFailed();
      }
    }
  }
}
function checkServerConfig(options) {
  new Parse.SecurityCheck({
    group: Parse.SecurityCheck.Category.ServerConfiguration,
    title: 'Client class creation allowed',
    warning:
      'Clients are currently allowed to create new classes. This allows an attacker to create new classes without restriction and potentially flood the database. Change the Parse Server configuration to allowClientClassCreation: false.',
    success: `Client class creation is turned off`,
    check() {
      return !options.allowClientClassCreation;
    },
  });
  new Parse.SecurityCheck({
    group: Parse.SecurityCheck.Category.ServerConfiguration,
    title: 'Weak masterKey.',
    warning:
      'The masterKey set to your configuration lacks complexity and length. This could potentially allow an attacker to brute force the masterKey, exposing all the entire Parse Server.',
    success: 'The masterKey is complex and long',
    check() {
      return (
        options.masterKey.match('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{14,})') ||
        false
      );
    },
  });
  let https = false;
  try {
    const serverURL = url.parse(options.publicServerUrl || options.serverURL);
    https = serverURL.protocol === 'https:';
  } catch (e) {
    /* */
  }
  new Parse.SecurityCheck({
    group: Parse.SecurityCheck.Category.ServerConfiguration,
    title: `Parse Server served over HTTP`,
    warning:
      'The server url is currently HTTP. This allows an attacker to listen to all traffic in-between the server and the client. Change the Parse Server configuration serverURL to HTTPS.',
    success: 'The server url uses HTTPS',
    check() {
      return https;
    },
  });
}
function checkFiles(options) {
  new Parse.SecurityCheck({
    group: Parse.SecurityCheck.Category.ServerConfiguration,
    title: `Public File Upload Enabled`,
    warning:
      'Public file upload is currently enabled. This allows a client to upload files without requiring login or authentication. Remove enableForPublic from fileUpload in the Parse Server configuration.',
    success: 'Public File Upload is disabled',
    check() {
      return !(options.fileUpload && options.fileUpload.enableForPublic);
    },
  });
}
module.exports = {
  registerServerSecurityChecks,
};
