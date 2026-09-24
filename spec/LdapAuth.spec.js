const ldap = require('../lib/Adapters/Auth/ldap');
const ldapjs = require('ldapjs');
const mockLdapServer = require('./support/MockLdapServer');
const fs = require('fs');
const port = 12345;
const sslport = 12346;

describe('LDAP Injection Prevention', () => {
  describe('escapeDN', () => {
    it('should escape comma', () => {
      expect(ldap.escapeDN('admin,ou=evil')).toBe('admin\\,ou\\=evil');
    });

    it('should escape equals sign', () => {
      expect(ldap.escapeDN('admin=evil')).toBe('admin\\=evil');
    });

    it('should escape plus sign', () => {
      expect(ldap.escapeDN('admin+evil')).toBe('admin\\+evil');
    });

    it('should escape less-than and greater-than signs', () => {
      expect(ldap.escapeDN('admin<evil>')).toBe('admin\\<evil\\>');
    });

    it('should escape hash at start', () => {
      expect(ldap.escapeDN('#admin')).toBe('\\#admin');
    });

    it('should escape semicolon', () => {
      expect(ldap.escapeDN('admin;evil')).toBe('admin\\;evil');
    });

    it('should escape double quote', () => {
      expect(ldap.escapeDN('admin"evil')).toBe('admin\\"evil');
    });

    it('should escape backslash', () => {
      expect(ldap.escapeDN('admin\\evil')).toBe('admin\\\\evil');
    });

    it('should escape leading space', () => {
      expect(ldap.escapeDN(' admin')).toBe('\\ admin');
    });

    it('should escape trailing space', () => {
      expect(ldap.escapeDN('admin ')).toBe('admin\\ ');
    });

    it('should escape multiple special characters', () => {
      expect(ldap.escapeDN('admin,ou=evil+cn=x')).toBe('admin\\,ou\\=evil\\+cn\\=x');
    });

    it('should not modify safe values', () => {
      expect(ldap.escapeDN('testuser')).toBe('testuser');
      expect(ldap.escapeDN('john.doe')).toBe('john.doe');
      expect(ldap.escapeDN('user123')).toBe('user123');
    });
  });

  describe('escapeFilter', () => {
    it('should escape asterisk', () => {
      expect(ldap.escapeFilter('*')).toBe('\\2a');
    });

    it('should escape open parenthesis', () => {
      expect(ldap.escapeFilter('test(')).toBe('test\\28');
    });

    it('should escape close parenthesis', () => {
      expect(ldap.escapeFilter('test)')).toBe('test\\29');
    });

    it('should escape backslash', () => {
      expect(ldap.escapeFilter('test\\')).toBe('test\\5c');
    });

    it('should escape null byte', () => {
      expect(ldap.escapeFilter('test\x00')).toBe('test\\00');
    });

    it('should escape multiple special characters', () => {
      expect(ldap.escapeFilter('*()\\')).toBe('\\2a\\28\\29\\5c');
    });

    it('should not modify safe values', () => {
      expect(ldap.escapeFilter('testuser')).toBe('testuser');
      expect(ldap.escapeFilter('john.doe')).toBe('john.doe');
      expect(ldap.escapeFilter('user123')).toBe('user123');
    });

    it('should escape filter injection attempt with wildcard', () => {
      expect(ldap.escapeFilter('x)(|(objectClass=*)')).toBe('x\\29\\28|\\28objectClass=\\2a\\29');
    });
  });

  describe('authData validation', () => {
    it('should reject missing authData.id', async done => {
      const server = await mockLdapServer(port, 'uid=testuser, o=example');
      const options = {
        suffix: 'o=example',
        url: `ldap://localhost:${port}`,
        dn: 'uid={{id}}, o=example',
      };
      try {
        await ldap.validateAuthData({ password: 'secret' }, options);
        fail('Should have rejected missing id');
      } catch (err) {
        expect(err.message).toBe('LDAP: Wrong username or password');
      }
      server.close(done);
    });

    it('should reject non-string authData.id', async done => {
      const server = await mockLdapServer(port, 'uid=testuser, o=example');
      const options = {
        suffix: 'o=example',
        url: `ldap://localhost:${port}`,
        dn: 'uid={{id}}, o=example',
      };
      try {
        await ldap.validateAuthData({ id: 123, password: 'secret' }, options);
        fail('Should have rejected non-string id');
      } catch (err) {
        expect(err.message).toBe('LDAP: Wrong username or password');
      }
      server.close(done);
    });

    // A zero-length credential in a simple bind is the unauthenticated authentication
    // mechanism of RFC 4513 section 5.1.2. Directories may answer it with success and map
    // the connection to anonymous, so the credential must be refused by Parse Server
    // before it is sent. The mock directory used by the tests below accepts such a bind;
    // this test is the control that proves it does.
    it('mock directory accepts a bind with a zero-length credential', async () => {
      const server = await mockLdapServer(port, 'uid=testuser, o=example', false, false, {
        allowUnauthenticatedBind: true,
      });
      const client = ldapjs.createClient({ url: `ldap://localhost:${port}` });
      try {
        await new Promise((resolve, reject) =>
          client.bind('uid=testuser, o=example', '', err => (err ? reject(err) : resolve()))
        );
        expect(server.bindAttempts.length).toBe(1);
        expect(server.bindAttempts[0].credentials).toBe('');
      } finally {
        client.destroy();
        await new Promise(resolve => server.close(resolve));
      }
    });

    it('should reject empty authData.password', async () => {
      const server = await mockLdapServer(port, 'uid=testuser, o=example', false, false, {
        allowUnauthenticatedBind: true,
      });
      const options = {
        suffix: 'o=example',
        url: `ldap://localhost:${port}`,
        dn: 'uid={{id}}, o=example',
      };
      try {
        try {
          await ldap.validateAuthData({ id: 'testuser', password: '' }, options);
          fail('Should have rejected empty password');
        } catch (err) {
          expect(err.message).toBe('LDAP: Wrong username or password');
        }
        expect(server.bindAttempts.length).toBe(0);
      } finally {
        await new Promise(resolve => server.close(resolve));
      }
    });

    it('should reject missing authData.password', async () => {
      const server = await mockLdapServer(port, 'uid=testuser, o=example', false, false, {
        allowUnauthenticatedBind: true,
      });
      const options = {
        suffix: 'o=example',
        url: `ldap://localhost:${port}`,
        dn: 'uid={{id}}, o=example',
      };
      try {
        try {
          await ldap.validateAuthData({ id: 'testuser' }, options);
          fail('Should have rejected missing password');
        } catch (err) {
          expect(err.message).toBe('LDAP: Wrong username or password');
        }
        expect(server.bindAttempts.length).toBe(0);
      } finally {
        await new Promise(resolve => server.close(resolve));
      }
    });

    it('should reject null authData.password', async () => {
      const server = await mockLdapServer(port, 'uid=testuser, o=example', false, false, {
        allowUnauthenticatedBind: true,
      });
      const options = {
        suffix: 'o=example',
        url: `ldap://localhost:${port}`,
        dn: 'uid={{id}}, o=example',
      };
      try {
        try {
          await ldap.validateAuthData({ id: 'testuser', password: null }, options);
          fail('Should have rejected null password');
        } catch (err) {
          expect(err.message).toBe('LDAP: Wrong username or password');
        }
        expect(server.bindAttempts.length).toBe(0);
      } finally {
        await new Promise(resolve => server.close(resolve));
      }
    });

    it('should reject non-string authData.password', async () => {
      const server = await mockLdapServer(port, 'uid=testuser, o=example', false, false, {
        allowUnauthenticatedBind: true,
      });
      const options = {
        suffix: 'o=example',
        url: `ldap://localhost:${port}`,
        dn: 'uid={{id}}, o=example',
      };
      try {
        for (const password of [123, {}, [], true]) {
          try {
            await ldap.validateAuthData({ id: 'testuser', password }, options);
            fail(`Should have rejected non-string password: ${JSON.stringify(password)}`);
          } catch (err) {
            expect(err.message).toBe('LDAP: Wrong username or password');
          }
        }
        expect(server.bindAttempts.length).toBe(0);
      } finally {
        await new Promise(resolve => server.close(resolve));
      }
    });
  });

  describe('DN injection prevention', () => {
    it('should prevent DN injection via comma in authData.id', async done => {
      // Mock server accepts the DN that would result from an unescaped injection
      const server = await mockLdapServer(port, 'uid=admin,ou=admins,o=example');
      const options = {
        suffix: 'o=example',
        url: `ldap://localhost:${port}`,
        dn: 'uid={{id}}, o=example',
      };
      // Attacker tries to inject additional DN components via comma
      // Without escaping: DN = uid=admin,ou=admins, o=example (3 RDNs) → matches mock
      // With escaping: DN = uid=admin\,ou=admins, o=example (2 RDNs) → doesn't match
      try {
        await ldap.validateAuthData({ id: 'admin,ou=admins', password: 'secret' }, options);
        fail('Should have rejected DN injection attempt');
      } catch (err) {
        expect(err.message).toBe('LDAP: Wrong username or password');
      }
      server.close(done);
    });
  });

  describe('Filter injection prevention', () => {
    it('should prevent LDAP filter injection via wildcard in authData.id', async done => {
      // Mock server accepts uid=*, o=example (the attacker's bind DN)
      // The * is not special in DNs so it binds fine regardless of escaping
      const server = await mockLdapServer(port, 'uid=*, o=example');
      const options = {
        suffix: 'o=example',
        url: `ldap://localhost:${port}`,
        dn: 'uid={{id}}, o=example',
        groupCn: 'powerusers',
        groupFilter: '(&(uniqueMember=uid={{id}}, o=example)(objectClass=groupOfUniqueNames))',
      };
      // Attacker uses * as ID to match any group member via wildcard
      // Group has member uid=testuser, not uid=*
      // Without escaping: filter uses SubstringFilter, matches testuser → passes
      // With escaping: filter uses EqualityFilter with literal \2a, no match → fails
      try {
        await ldap.validateAuthData({ id: '*', password: 'secret' }, options);
        fail('Should have rejected filter injection attempt');
      } catch (err) {
        expect(err.message).toBe('LDAP: User not in group');
      }
      server.close(done);
    });
  });
});

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
