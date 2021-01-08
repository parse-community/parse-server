const ldap = require('../lib/Adapters/Auth/ldap');
const mockLdapServer = require('./MockLdapServer');
const fs = require('fs');
const port = 12345;
const sslport = 12346;

it('Should fail with missing options', done => {
  ldap
    .validateAuthData({ id: 'testuser', password: 'testpw' })
    .then(done.fail)
    .catch(err => {
      jequal(err.message, 'LDAP auth configuration missing');
      done();
    });
});

it('Should return a resolved promise when validating the app id', done => {
  ldap.validateAppId().then(done).catch(done.fail);
});

it('Should succeed with right credentials', done => {
  mockLdapServer(port, 'uid=testuser, o=example').then(server => {
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
    };
    ldap
      .validateAuthData({ id: 'testuser', password: 'secret' }, options)
      .then(done)
      .catch(done.fail)
      .finally(() => server.close());
  });
});

it('Should succeed with right credentials when LDAPS is used and certifcate is not checked', done => {
  mockLdapServer(sslport, 'uid=testuser, o=example', false, true).then(server => {
    const options = {
      suffix: 'o=example',
      url: `ldaps://localhost:${sslport}`,
      dn: 'uid={{id}}, o=example',
      tlsOptions: { rejectUnauthorized: false },
    };
    ldap
      .validateAuthData({ id: 'testuser', password: 'secret' }, options)
      .then(done)
      .catch(done.fail)
      .finally(() => server.close());
  });
});

it('Should succeed when LDAPS is used and the presented certificate is the expected certificate', done => {
  mockLdapServer(sslport, 'uid=testuser, o=example', false, true).then(server => {
    const options = {
      suffix: 'o=example',
      url: `ldaps://localhost:${sslport}`,
      dn: 'uid={{id}}, o=example',
      tlsOptions: {
        ca: fs.readFileSync(__dirname + '/support/cert/cert.pem'),
        rejectUnauthorized: true,
      },
    };
    ldap
      .validateAuthData({ id: 'testuser', password: 'secret' }, options)
      .then(done)
      .catch(done.fail)
      .finally(() => server.close());
  });
});

it('Should fail when LDAPS is used and the presented certificate is not the expected certificate', done => {
  mockLdapServer(sslport, 'uid=testuser, o=example', false, true).then(server => {
    const options = {
      suffix: 'o=example',
      url: `ldaps://localhost:${sslport}`,
      dn: 'uid={{id}}, o=example',
      tlsOptions: {
        ca: fs.readFileSync(__dirname + '/support/cert/anothercert.pem'),
        rejectUnauthorized: true,
      },
    };
    ldap
      .validateAuthData({ id: 'testuser', password: 'secret' }, options)
      .then(done.fail)
      .catch(err => {
        jequal(err.message, 'LDAPS: Certificate mismatch');
        done();
      })
      .finally(() => server.close());
  });
});

it('Should fail when LDAPS is used certifcate matches but credentials are wrong', done => {
  mockLdapServer(sslport, 'uid=testuser, o=example', false, true).then(server => {
    const options = {
      suffix: 'o=example',
      url: `ldaps://localhost:${sslport}`,
      dn: 'uid={{id}}, o=example',
      tlsOptions: {
        ca: fs.readFileSync(__dirname + '/support/cert/cert.pem'),
        rejectUnauthorized: true,
      },
    };
    ldap
      .validateAuthData({ id: 'testuser', password: 'wrong!' }, options)
      .then(done.fail)
      .catch(err => {
        jequal(err.message, 'LDAP: Wrong username or password');
        done();
      })
      .finally(() => server.close());
  });
});

it('Should fail with wrong credentials', done => {
  mockLdapServer(port, 'uid=testuser, o=example').then(server => {
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
    };
    ldap
      .validateAuthData({ id: 'testuser', password: 'wrong!' }, options)
      .then(done.fail)
      .catch(err => {
        jequal(err.message, 'LDAP: Wrong username or password');
        done();
      })
      .finally(() => server.close());
  });
});

it('Should succeed if user is in given group', done => {
  mockLdapServer(port, 'uid=testuser, o=example').then(server => {
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
      groupCn: 'powerusers',
      groupFilter: '(&(uniqueMember=uid={{id}}, o=example)(objectClass=groupOfUniqueNames))',
    };

    ldap
      .validateAuthData({ id: 'testuser', password: 'secret' }, options)
      .then(done)
      .catch(done.fail)
      .finally(() => server.close());
  });
});

it('Should fail if user is not in given group', done => {
  mockLdapServer(port, 'uid=testuser, o=example').then(server => {
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
      groupCn: 'groupTheUserIsNotIn',
      groupFilter: '(&(uniqueMember=uid={{id}}, o=example)(objectClass=groupOfUniqueNames))',
    };

    ldap
      .validateAuthData({ id: 'testuser', password: 'secret' }, options)
      .then(done.fail)
      .catch(err => {
        jequal(err.message, 'LDAP: User not in group');
        done();
      })
      .finally(() => server.close());
  });
});

it('Should fail if the LDAP server does not allow searching inside the provided suffix', done => {
  mockLdapServer(port, 'uid=testuser, o=example').then(server => {
    const options = {
      suffix: 'o=invalid',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
      groupCn: 'powerusers',
      groupFilter: '(&(uniqueMember=uid={{id}}, o=example)(objectClass=groupOfUniqueNames))',
    };

    ldap
      .validateAuthData({ id: 'testuser', password: 'secret' }, options)
      .then(done.fail)
      .catch(err => {
        jequal(err.message, 'LDAP group search failed');
        done();
      })
      .finally(() => server.close());
  });
});

it('Should fail if the LDAP server encounters an error while searching', done => {
  mockLdapServer(port, 'uid=testuser, o=example', true).then(server => {
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
      groupCn: 'powerusers',
      groupFilter: '(&(uniqueMember=uid={{id}}, o=example)(objectClass=groupOfUniqueNames))',
    };

    ldap
      .validateAuthData({ id: 'testuser', password: 'secret' }, options)
      .then(done.fail)
      .catch(err => {
        jequal(err.message, 'LDAP group search failed');
        done();
      })
      .finally(() => server.close());
  });
});

it('Should delete the password from authData after validation', done => {
  mockLdapServer(port, 'uid=testuser, o=example', true).then(server => {
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
    };

    const authData = { id: 'testuser', password: 'secret' };

    ldap
      .validateAuthData(authData, options)
      .then(() => {
        expect(authData).toEqual({ id: 'testuser' });
        done();
      })
      .catch(done.fail)
      .finally(() => server.close());
  });
});

it('Should not save the password in the user record after authentication', done => {
  mockLdapServer(port, 'uid=testuser, o=example', true).then(server => {
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
    };
    reconfigureServer({ auth: { ldap: options } }).then(() => {
      const authData = { authData: { id: 'testuser', password: 'secret' } };
      Parse.User.logInWith('ldap', authData).then(returnedUser => {
        const query = new Parse.Query('User');
        query
          .equalTo('objectId', returnedUser.id)
          .first({ useMasterKey: true })
          .then(user => {
            expect(user.get('authData')).toEqual({ ldap: { id: 'testuser' } });
            expect(user.get('authData').ldap.password).toBeUndefined();
            done();
          })
          .catch(done.fail)
          .finally(() => server.close());
      });
    });
  });
});
