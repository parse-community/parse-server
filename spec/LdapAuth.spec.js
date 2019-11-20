const ldap = require('../lib/Adapters/Auth/ldap');
const mockLdapServer = require('./MockLdapServer');

it('Should fail with missing options', done => {
  try {
    ldap.validateAuthData({ id: 'testuser', password: 'testpw' });
  } catch (error) {
    jequal(error.message, 'LDAP auth configuration missing');
    done();
  }
});

it('Should succeed with right credentials', done => {
  mockLdapServer(1010, 'uid=testuser, o=example').then(server => {
    const options = {
      suffix: 'o=example',
      url: 'ldap://localhost:1010',
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
  mockLdapServer(1010, 'uid=testuser, o=example').then(server => {
    const options = {
      suffix: 'o=example',
      url: 'ldap://localhost:1010',
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
  mockLdapServer(1010, 'uid=testuser, o=example').then(server => {
    const options = {
      suffix: 'o=example',
      url: 'ldap://localhost:1010',
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
  mockLdapServer(1010, 'uid=testuser, o=example').then(server => {
    const options = {
      suffix: 'o=example',
      url: 'ldap://localhost:1010',
      dn: 'uid={{id}}, o=example',
      groupDn: 'ou=somegroup, o=example',
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
