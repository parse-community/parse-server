const ldapjs = require('ldapjs');
const fs = require('fs');

const tlsOptions = {
  key: fs.readFileSync(__dirname + '/cert/key.pem'),
  certificate: fs.readFileSync(__dirname + '/cert/cert.pem'),
};

function newServer(port, dn, provokeSearchError = false, ssl = false, options = {}) {
  const server = ssl ? ldapjs.createServer(tlsOptions) : ldapjs.createServer();

  // Records every bind the directory actually receives, so tests can assert that a
  // credential is refused before the directory is contacted.
  server.bindAttempts = [];

  server.bind('o=example', function (req, res, next) {
    server.bindAttempts.push({ dn: req.dn.toString(), credentials: req.credentials });
    // Models a directory that honors the unauthenticated authentication mechanism of
    // simple bind (RFC 4513 section 5.1.2), which Active Directory permits by default:
    // a valid DN with a zero-length credential binds successfully and the connection is
    // mapped to anonymous.
    if (options.allowUnauthenticatedBind && req.dn.toString() === dn && req.credentials === '') {
      res.end();
      return next();
    }
    if (req.dn.toString() !== dn || req.credentials !== 'secret')
    { return next(new ldapjs.InvalidCredentialsError()); }
    res.end();
    return next();
  });

  server.search('o=example', function (req, res, next) {
    if (provokeSearchError) {
      res.end(ldapjs.LDAP_SIZE_LIMIT_EXCEEDED);
      return next();
    }
    const obj = {
      dn: req.dn.toString(),
      attributes: {
        objectclass: ['organization', 'top'],
        o: 'example',
      },
    };

    const group = {
      dn: req.dn.toString(),
      attributes: {
        objectClass: ['groupOfUniqueNames', 'top'],
        uniqueMember: ['uid=testuser, o=example'],
        cn: 'powerusers',
        ou: 'powerusers',
      },
    };

    if (req.filter.matches(obj.attributes)) {
      res.send(obj);
    }

    if (req.filter.matches(group.attributes)) {
      res.send(group);
    }
    res.end();
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

module.exports = newServer;
