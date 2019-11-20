const ldap = require('../lib/Adapters/Auth/ldap');
const mockLdapServer = require('./MockLdapServer');
const port = 12345;

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
  ldap
    .validateAppId()
    .then(done)
    .catch(done.fail);
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
      groupFilter:
        '(&(uniqueMember=uid={{id}}, o=example)(objectClass=groupOfUniqueNames))',
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
      groupFilter:
        '(&(uniqueMember=uid={{id}}, o=example)(objectClass=groupOfUniqueNames))',
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
      groupFilter:
        '(&(uniqueMember=uid={{id}}, o=example)(objectClass=groupOfUniqueNames))',
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
      groupFilter:
        '(&(uniqueMember=uid={{id}}, o=example)(objectClass=groupOfUniqueNames))',
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
