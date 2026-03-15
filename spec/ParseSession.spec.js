//
// Tests behavior of Parse Sessions
//

'use strict';
const request = require('../lib/request');

function setupTestUsers() {
  const acl = new Parse.ACL();
  acl.setPublicReadAccess(true);
  const user1 = new Parse.User();
  const user2 = new Parse.User();
  const user3 = new Parse.User();

  user1.set('username', 'testuser_1');
  user2.set('username', 'testuser_2');
  user3.set('username', 'testuser_3');

  user1.set('password', 'password');
  user2.set('password', 'password');
  user3.set('password', 'password');

  user1.setACL(acl);
  user2.setACL(acl);
  user3.setACL(acl);

  return user1
    .signUp()
    .then(() => {
      return user2.signUp();
    })
    .then(() => {
      return user3.signUp();
    });
}

describe('Parse.Session', () => {
  // multiple sessions with masterKey + sessionToken
  it('should retain original sessionTokens with masterKey & sessionToken set', done => {
    setupTestUsers()
      .then(user => {
        const query = new Parse.Query(Parse.Session);
        return query.find({
          useMasterKey: true,
          sessionToken: user.get('sessionToken'),
        });
      })
      .then(results => {
        const foundKeys = [];
        expect(results.length).toBe(3);
        for (const key in results) {
          const sessionToken = results[key].get('sessionToken');
          if (foundKeys[sessionToken]) {
            fail('Duplicate session token present in response');
            break;
          }
          foundKeys[sessionToken] = 1;
        }
        done();
      })
      .catch(err => {
        fail(err);
      });
  });

  // single session returned, with just one sessionToken
  it('should retain original sessionTokens with just sessionToken set', done => {
    let knownSessionToken;
    setupTestUsers()
      .then(user => {
        knownSessionToken = user.get('sessionToken');
        const query = new Parse.Query(Parse.Session);
        return query.find({
          sessionToken: knownSessionToken,
        });
      })
      .then(results => {
        expect(results.length).toBe(1);
        const sessionToken = results[0].get('sessionToken');
        expect(sessionToken).toBe(knownSessionToken);
        done();
      })
      .catch(err => {
        fail(err);
      });
  });

  // multiple users with masterKey + sessionToken
  it('token on users should retain original sessionTokens with masterKey & sessionToken set', done => {
    setupTestUsers()
      .then(user => {
        const query = new Parse.Query(Parse.User);
        return query.find({
          useMasterKey: true,
          sessionToken: user.get('sessionToken'),
        });
      })
      .then(results => {
        const foundKeys = [];
        expect(results.length).toBe(3);
        for (const key in results) {
          const sessionToken = results[key].get('sessionToken');
          if (foundKeys[sessionToken] && sessionToken !== undefined) {
            fail('Duplicate session token present in response');
            break;
          }
          foundKeys[sessionToken] = 1;
        }
        done();
      })
      .catch(err => {
        fail(err);
      });
  });

  // multiple users with just sessionToken
  it('token on users should retain original sessionTokens with just sessionToken set', done => {
    let knownSessionToken;
    setupTestUsers()
      .then(user => {
        knownSessionToken = user.get('sessionToken');
        const query = new Parse.Query(Parse.User);
        return query.find({
          sessionToken: knownSessionToken,
        });
      })
      .then(results => {
        const foundKeys = [];
        expect(results.length).toBe(3);
        for (const key in results) {
          const sessionToken = results[key].get('sessionToken');
          if (foundKeys[sessionToken] && sessionToken !== undefined) {
            fail('Duplicate session token present in response');
            break;
          }
          foundKeys[sessionToken] = 1;
        }

        done();
      })
      .catch(err => {
        fail(err);
      });
  });

  it('cannot edit session with known ID', async () => {
    await setupTestUsers();
    const [first, second] = await new Parse.Query(Parse.Session).find({ useMasterKey: true });
    const headers = {
      'X-Parse-Application-Id': 'test',
      'X-Parse-Rest-API-Key': 'rest',
      'X-Parse-Session-Token': second.get('sessionToken'),
      'Content-Type': 'application/json',
    };
    const firstUser = first.get('user').id;
    const secondUser = second.get('user').id;
    const e = await request({
      method: 'PUT',
      headers,
      url: `http://localhost:8378/1/sessions/${first.id}`,
      body: JSON.stringify({
        foo: 'bar',
        user: { __type: 'Pointer', className: '_User', objectId: secondUser },
      }),
    }).catch(e => e.data);
    expect(e.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
    expect(e.error).toBe('Object not found.');
    await Parse.Object.fetchAll([first, second], { useMasterKey: true });
    expect(first.get('user').id).toBe(firstUser);
    expect(second.get('user').id).toBe(secondUser);
  });

  it('should ignore sessionToken when creating a session via POST /classes/_Session', async () => {
    const user = await Parse.User.signUp('sessionuser', 'password');
    const sessionToken = user.getSessionToken();

    const response = await request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/_Session',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Session-Token': sessionToken,
        'Content-Type': 'application/json',
      },
      body: {
        sessionToken: 'r:ATTACKER_CONTROLLED_TOKEN',
      },
    });

    // The returned session should have a server-generated token, not the attacker's
    expect(response.data.sessionToken).not.toBe('r:ATTACKER_CONTROLLED_TOKEN');
    expect(response.data.sessionToken).toMatch(/^r:/);
  });

  it('should ignore expiresAt when creating a session via POST /classes/_Session', async () => {
    const user = await Parse.User.signUp('sessionuser2', 'password');
    const sessionToken = user.getSessionToken();
    const farFuture = new Date('2099-12-31T23:59:59.000Z');

    await request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/_Session',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Session-Token': sessionToken,
        'Content-Type': 'application/json',
      },
      body: {
        expiresAt: { __type: 'Date', iso: farFuture.toISOString() },
      },
    });

    // Fetch the newly created session and verify expiresAt is server-generated, not 2099
    const sessions = await request({
      method: 'GET',
      url: 'http://localhost:8378/1/classes/_Session',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });
    const newSession = sessions.data.results.find(s => s.sessionToken !== sessionToken);
    const expiresAt = new Date(newSession.expiresAt.iso);
    expect(expiresAt.getFullYear()).not.toBe(2099);
  });

  it('should ignore createdWith when creating a session via POST /classes/_Session', async () => {
    const user = await Parse.User.signUp('sessionuser3', 'password');
    const sessionToken = user.getSessionToken();

    await request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/_Session',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Session-Token': sessionToken,
        'Content-Type': 'application/json',
      },
      body: {
        createdWith: { action: 'attacker', authProvider: 'evil' },
      },
    });

    const sessions = await request({
      method: 'GET',
      url: 'http://localhost:8378/1/classes/_Session',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });
    const newSession = sessions.data.results.find(s => s.sessionToken !== sessionToken);
    expect(newSession.createdWith.action).toBe('create');
    expect(newSession.createdWith.authProvider).toBeUndefined();
  });

  describe('PUT /sessions/me', () => {
    it('should return error with invalid session token', async () => {
      const response = await request({
        method: 'PUT',
        url: 'http://localhost:8378/1/sessions/me',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'X-Parse-Session-Token': 'r:invalid-session-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(response.status).not.toBe(500);
      expect(response.data.code).toBe(Parse.Error.INVALID_SESSION_TOKEN);
    });

    it('should return error without session token', async () => {
      const response = await request({
        method: 'PUT',
        url: 'http://localhost:8378/1/sessions/me',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(response.data?.code).toBeDefined();
    });
  });

  describe('DELETE /sessions/me', () => {
    it('should return error with invalid session token', async () => {
      const response = await request({
        method: 'DELETE',
        url: 'http://localhost:8378/1/sessions/me',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'X-Parse-Session-Token': 'r:invalid-session-token',
        },
      }).catch(e => e);
      expect(response.status).not.toBe(500);
      expect(response.data.code).toBe(Parse.Error.INVALID_SESSION_TOKEN);
    });

    it('should return error without session token', async () => {
      const response = await request({
        method: 'DELETE',
        url: 'http://localhost:8378/1/sessions/me',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        },
      }).catch(e => e);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(response.data?.code).toBeDefined();
    });
  });
});
