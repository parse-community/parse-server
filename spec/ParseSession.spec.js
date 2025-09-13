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
});
