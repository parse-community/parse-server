import SecurityCheck from './SecurityCheck';
import url from 'url';
const ServerChecks = {};
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;

ServerChecks.registerCLP = async options => {
  const schema = await options.databaseController.loadSchema();
  const all = await schema.getAllClasses();
  for (const field of all) {
    const { className, clp } = field;
    const clpCheck = new SecurityCheck({
      group: SecurityCheck.Category.CLP,
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
      const optionCheck = new SecurityCheck({
        group: SecurityCheck.Category.CLP,
        title: `Unrestricted access to ${key}.`,
        warning: `Any client can ${key} on ${className}.`,
        success: `${key} is restricted on ${className}`,
      });
      const addFileCheck = new SecurityCheck({
        group: SecurityCheck.Category.CLP,
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
};
ServerChecks.checkServerConfig = async options => {
  new SecurityCheck({
    group: SecurityCheck.Category.ServerConfiguration,
    title: 'Client class creation allowed',
    warning:
      'Clients are currently allowed to create new classes. This allows an attacker to create new classes without restriction and potentially flood the database. Change the Parse Server configuration to allowClientClassCreation: false.',
    success: `Client class creation is turned off`,
    check() {
      return !options.allowClientClassCreation;
    },
  });
  new SecurityCheck({
    group: SecurityCheck.Category.ServerConfiguration,
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
  new SecurityCheck({
    group: SecurityCheck.Category.ServerConfiguration,
    title: `Parse Server served over HTTP`,
    warning:
      'The server url is currently HTTP. This allows an attacker to listen to all traffic in-between the server and the client. Change the Parse Server configuration serverURL to HTTPS.',
    success: 'The server url uses HTTPS',
    check() {
      return https;
    },
  });
};
ServerChecks.checkFiles = options => {
  new SecurityCheck({
    group: SecurityCheck.Category.ServerConfiguration,
    title: `Public File Upload Enabled`,
    warning:
      'Public file upload is currently enabled. This allows a client to upload files without requiring login or authentication. Remove enableForPublic from fileUpload in the Parse Server configuration.',
    success: 'Public File Upload is disabled',
    check() {
      return !(options.fileUpload && options.fileUpload.enableForPublic);
    },
  });
};
ServerChecks.checkDatabase = options => {
  let databaseURI = options.databaseURI;
  if (options.databaseAdapter && options.databaseAdapter._uri) {
    databaseURI = options.databaseAdapter._uri;
  }
  const databaseCheck = new SecurityCheck({
    group: SecurityCheck.Category.Database,
    title: `Weak Database Password`,
    warning:
      'The database password set lacks complexity and length. This could potentially allow an attacker to brute force their way into the database, exposing the database.',
    success: `Strong Database Password`,
  });
  if (databaseURI.includes('@')) {
    const copyURI = `${databaseURI}`;
    databaseURI = `mongodb://${databaseURI.split('@')[1]}`;
    const pwd = copyURI.split('//')[1].split('@')[0].split(':')[1] || '';
    if (!pwd.match('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{14,})')) {
      databaseCheck.setFailed();
    }
  } else {
    databaseCheck.setFailed();
  }
  let databaseAdmin = '' + databaseURI;
  try {
    const parsedURI = url.parse(databaseAdmin);
    parsedURI.port = '27017';
    databaseAdmin = url.format(parsedURI);
  } catch (e) {
    /* */
  }
  new SecurityCheck({
    group: SecurityCheck.Category.Database,
    title: `Unrestricted access to port 27017`,
    warning:
      'The database requires no authentication to the admin port. This could potentially allow an attacker to easily access the database, exposing all of the database.',
    success: `Restricted port 27017`,
    check: async () => {
      try {
        await MongoClient.connect(databaseAdmin.toString(), { useNewUrlParser: true });
        return false;
      } catch (e) {
        console.log(e);
      }
    },
  });
  new SecurityCheck({
    group: SecurityCheck.Category.Database,
    title: `Unrestricted access to the database`,
    warning:
      'The database requires no authentication to connect. This could potentially allow an attacker to easily access the database, exposing all of the database.',
    success: `Restricted access to the database`,
    check: async () => {
      try {
        await MongoClient.connect(databaseURI, { useNewUrlParser: true });
        return false;
      } catch (e) {
        console.log(e);
      }
    },
  });
};

const registerServerSecurityChecks = async req => {
  const options = req.config || req;
  const serverFuncs = Object.values(ServerChecks);
  await Promise.all(serverFuncs.map(func => func(options)));
};
module.exports = {
  registerServerSecurityChecks,
};
