'use strict';

const request = require('../lib/request');

describe('AuthData Unique Index', () => {
  const fakeAuthProvider = {
    validateAppId: () => Promise.resolve(),
    validateAuthData: () => Promise.resolve(),
  };

  beforeEach(async () => {
    await reconfigureServer({ auth: { fakeAuthProvider } });
  });

  it('should prevent concurrent signups with the same authData from creating duplicate users', async () => {
    const authData = { fakeAuthProvider: { id: 'duplicate-test-id', token: 'token1' } };

    // Fire multiple concurrent signup requests with the same authData
    const concurrentRequests = Array.from({ length: 5 }, () =>
      request({
        method: 'POST',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'Content-Type': 'application/json',
        },
        url: 'http://localhost:8378/1/users',
        body: { authData },
      }).then(
        response => ({ success: true, data: response.data }),
        error => ({ success: false, error: error.data || error.message })
      )
    );

    const results = await Promise.all(concurrentRequests);
    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    // All should either succeed (returning the same user) or fail with "this auth is already used"
    // The key invariant: only ONE unique objectId should exist
    const uniqueObjectIds = new Set(successes.map(r => r.data.objectId));
    expect(uniqueObjectIds.size).toBe(1);

    // Failures should be "this auth is already used" errors
    for (const failure of failures) {
      expect(failure.error.code).toBe(208);
      expect(failure.error.error).toBe('this auth is already used');
    }

    // Verify only one user exists in the database with this authData
    const query = new Parse.Query('_User');
    query.equalTo('authData.fakeAuthProvider.id', 'duplicate-test-id');
    const users = await query.find({ useMasterKey: true });
    expect(users.length).toBe(1);
  });

  it('should prevent concurrent signups via batch endpoint with same authData', async () => {
    const authData = { fakeAuthProvider: { id: 'batch-race-test-id', token: 'token1' } };

    const response = await request({
      method: 'POST',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      url: 'http://localhost:8378/1/batch',
      body: {
        requests: Array.from({ length: 3 }, () => ({
          method: 'POST',
          path: '/1/users',
          body: { authData },
        })),
      },
    });

    const results = response.data;
    const successes = results.filter(r => r.success);
    const failures = results.filter(r => r.error);

    // All successes should reference the same user
    const uniqueObjectIds = new Set(successes.map(r => r.success.objectId));
    expect(uniqueObjectIds.size).toBe(1);

    // Failures should be "this auth is already used" errors
    for (const failure of failures) {
      expect(failure.error.code).toBe(208);
      expect(failure.error.error).toBe('this auth is already used');
    }

    // Verify only one user exists in the database with this authData
    const query = new Parse.Query('_User');
    query.equalTo('authData.fakeAuthProvider.id', 'batch-race-test-id');
    const users = await query.find({ useMasterKey: true });
    expect(users.length).toBe(1);
  });

  it('should allow sequential signups with different authData IDs', async () => {
    const user1 = await Parse.User.logInWith('fakeAuthProvider', {
      authData: { id: 'user-id-1', token: 'token1' },
    });
    const user2 = await Parse.User.logInWith('fakeAuthProvider', {
      authData: { id: 'user-id-2', token: 'token2' },
    });

    expect(user1.id).toBeDefined();
    expect(user2.id).toBeDefined();
    expect(user1.id).not.toBe(user2.id);
  });

  it('should still allow login with authData after successful signup', async () => {
    const authPayload = { authData: { id: 'login-test-id', token: 'token1' } };

    // Signup
    const user1 = await Parse.User.logInWith('fakeAuthProvider', authPayload);
    expect(user1.id).toBeDefined();

    // Login again with same authData — should return same user
    const user2 = await Parse.User.logInWith('fakeAuthProvider', authPayload);
    expect(user2.id).toBe(user1.id);
  });

  it('should prevent concurrent signups with same anonymous authData', async () => {
    const anonymousId = 'anon-race-test-id';
    const authData = { anonymous: { id: anonymousId } };

    const concurrentRequests = Array.from({ length: 5 }, () =>
      request({
        method: 'POST',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'Content-Type': 'application/json',
        },
        url: 'http://localhost:8378/1/users',
        body: { authData },
      }).then(
        response => ({ success: true, data: response.data }),
        error => ({ success: false, error: error.data || error.message })
      )
    );

    const results = await Promise.all(concurrentRequests);
    const successes = results.filter(r => r.success);

    // All successes should reference the same user
    const uniqueObjectIds = new Set(successes.map(r => r.data.objectId));
    expect(uniqueObjectIds.size).toBe(1);

    // Verify only one user exists in the database with this authData
    const query = new Parse.Query('_User');
    query.equalTo('authData.anonymous.id', anonymousId);
    const users = await query.find({ useMasterKey: true });
    expect(users.length).toBe(1);
  });
});
