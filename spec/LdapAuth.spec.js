const ldap = require('../lib/Adapters/Auth/ldap');
const mockLdapServer = require('./support/MockLdapServer');
const fs = require('fs');
const port = 12345;
const sslport = 12346;

describe('Ldap Auth', () => {
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

  it('Should succeed with right credentials', async done => {
    const server = await mockLdapServer(port, 'uid=testuser, o=example');
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
    };
    await ldap.validateAuthData({ id: 'testuser', password: 'secret' }, options);
    server.close(done);
  });

  it('Should succeed with right credentials when LDAPS is used and certifcate is not checked', async done => {
    const server = await mockLdapServer(sslport, 'uid=testuser, o=example', false, true);
    const options = {
      suffix: 'o=example',
      url: `ldaps://localhost:${sslport}`,
      dn: 'uid={{id}}, o=example',
      tlsOptions: { rejectUnauthorized: false },
    };
    await ldap.validateAuthData({ id: 'testuser', password: 'secret' }, options);
    server.close(done);
  });

  it('Should succeed when LDAPS is used and the presented certificate is the expected certificate', async done => {
    const server = await mockLdapServer(sslport, 'uid=testuser, o=example', false, true);
    const options = {
      suffix: 'o=example',
      url: `ldaps://localhost:${sslport}`,
      dn: 'uid={{id}}, o=example',
      tlsOptions: {
        ca: fs.readFileSync(__dirname + '/support/cert/cert.pem'),
        rejectUnauthorized: true,
      },
    };
    await ldap.validateAuthData({ id: 'testuser', password: 'secret' }, options);
    server.close(done);
  });

  it('Should fail when LDAPS is used and the presented certificate is not the expected certificate', async done => {
    const server = await mockLdapServer(sslport, 'uid=testuser, o=example', false, true);
    const options = {
      suffix: 'o=example',
      url: `ldaps://localhost:${sslport}`,
      dn: 'uid={{id}}, o=example',
      tlsOptions: {
        ca: fs.readFileSync(__dirname + '/support/cert/anothercert.pem'),
        rejectUnauthorized: true,
      },
    };
    try {
      await ldap.validateAuthData({ id: 'testuser', password: 'secret' }, options);
      fail();
    } catch (err) {
      expect(err.message).toBe('LDAPS: Certificate mismatch');
    }
    server.close(done);
  });

  it('Should fail when LDAPS is used certifcate matches but credentials are wrong', async done => {
    const server = await mockLdapServer(sslport, 'uid=testuser, o=example', false, true);
    const options = {
      suffix: 'o=example',
      url: `ldaps://localhost:${sslport}`,
      dn: 'uid={{id}}, o=example',
      tlsOptions: {
        ca: fs.readFileSync(__dirname + '/support/cert/cert.pem'),
        rejectUnauthorized: true,
      },
    };
    try {
      await ldap.validateAuthData({ id: 'testuser', password: 'wrong!' }, options);
      fail();
    } catch (err) {
      expect(err.message).toBe('LDAP: Wrong username or password');
    }
    server.close(done);
  });

  it('Should fail with wrong credentials', async done => {
    const server = await mockLdapServer(port, 'uid=testuser, o=example');
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
    };
    try {
      await ldap.validateAuthData({ id: 'testuser', password: 'wrong!' }, options);
      fail();
    } catch (err) {
      expect(err.message).toBe('LDAP: Wrong username or password');
    }
    server.close(done);
  });

  it('Should succeed if user is in given group', async done => {
    const server = await mockLdapServer(port, 'uid=testuser, o=example');
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
      groupCn: 'powerusers',
      groupFilter: '(&(uniqueMember=uid={{id}}, o=example)(objectClass=groupOfUniqueNames))',
    };
    await ldap.validateAuthData({ id: 'testuser', password: 'secret' }, options);
    server.close(done);
  });

  it('Should fail if user is not in given group', async done => {
    const server = await mockLdapServer(port, 'uid=testuser, o=example');
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
      groupCn: 'groupTheUserIsNotIn',
      groupFilter: '(&(uniqueMember=uid={{id}}, o=example)(objectClass=groupOfUniqueNames))',
    };
    try {
      await ldap.validateAuthData({ id: 'testuser', password: 'secret' }, options);
      fail();
    } catch (err) {
      expect(err.message).toBe('LDAP: User not in group');
    }
    server.close(done);
  });

  it('Should fail if the LDAP server does not allow searching inside the provided suffix', async done => {
    const server = await mockLdapServer(port, 'uid=testuser, o=example');
    const options = {
      suffix: 'o=invalid',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
      groupCn: 'powerusers',
      groupFilter: '(&(uniqueMember=uid={{id}}, o=example)(objectClass=groupOfUniqueNames))',
    };
    try {
      await ldap.validateAuthData({ id: 'testuser', password: 'secret' }, options);
      fail();
    } catch (err) {
      expect(err.message).toBe('LDAP group search failed');
    }
    server.close(done);
  });

  it('Should fail if the LDAP server encounters an error while searching', async done => {
    const server = await mockLdapServer(port, 'uid=testuser, o=example', true);
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
      groupCn: 'powerusers',
      groupFilter: '(&(uniqueMember=uid={{id}}, o=example)(objectClass=groupOfUniqueNames))',
    };
    try {
      await ldap.validateAuthData({ id: 'testuser', password: 'secret' }, options);
      fail();
    } catch (err) {
      expect(err.message).toBe('LDAP group search failed');
    }
    server.close(done);
  });

  it('Should delete the password from authData after validation', async done => {
    const server = await mockLdapServer(port, 'uid=testuser, o=example', true);
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
    };
    const authData = { id: 'testuser', password: 'secret' };
    await ldap.validateAuthData(authData, options);
    expect(authData).toEqual({ id: 'testuser' });
    server.close(done);
  });

  it('Should not save the password in the user record after authentication', async done => {
    const server = await mockLdapServer(port, 'uid=testuser, o=example', true);
    const options = {
      suffix: 'o=example',
      url: `ldap://localhost:${port}`,
      dn: 'uid={{id}}, o=example',
    };
    await reconfigureServer({ auth: { ldap: options } });
    const authData = { authData: { id: 'testuser', password: 'secret' } };
    const returnedUser = await Parse.User.logInWith('ldap', authData);
    const query = new Parse.Query('User');
    const user = await query.equalTo('objectId', returnedUser.id).first({ useMasterKey: true });
    expect(user.get('authData')).toEqual({ ldap: { id: 'testuser' } });
    expect(user.get('authData').ldap.password).toBeUndefined();
    server.close(done);
  });
});
