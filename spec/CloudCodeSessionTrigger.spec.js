'use strict';
const Parse = require('parse/node');

describe('CloudCode _Session Trigger tests', () => {
  it('beforeSave should be okay', async () => {
    Parse.Cloud.beforeSave('_Session', async req => {
      const sessionObject = req.object;
      expect(sessionObject).toBeDefined();
      expect(sessionObject.get('sessionToken')).toBeDefined();
      expect(sessionObject.get('createdWith')).toBeDefined();
      expect(sessionObject.get('user')).toBeDefined();
      expect(sessionObject.get('user')).toEqual(jasmine.any(Parse.User));
    });
    try {
      // signup a user (internally creates a session)
      const user = new Parse.User();
      user.setUsername('some-user-name');
      user.setPassword('password');
      await user.signUp();
    } catch (error) {
      throw error;
    }
  });
  it('beforeSave should discard any changes', async () => {
    Parse.Cloud.beforeSave('_Session', function(req) {
      // perform some changes
      req.object.set('KeyA', 'EDITED_VALUE');
      req.object.set('KeyB', 'EDITED_VALUE');
    });
    // signup a user (internally creates a session)
    const user = new Parse.User();
    user.setUsername('some-user-name');
    user.setPassword('password');
    await user.signUp();
    // get the session
    const query = new Parse.Query('_Session');
    query.equalTo('user', user);
    const sessionObject = await query.first({
      useMasterKey: true,
    });
    // expect un-edited object
    expect(sessionObject.get('KeyA')).toBeUndefined();
    expect(sessionObject.get('KeyB')).toBeUndefined();
    expect(sessionObject.get('user')).toBeDefined();
    expect(sessionObject.get('user').id).toBe(user.id);
    expect(sessionObject.get('sessionToken')).toBeDefined();
  });
  it('beforeSave rejection should not affect user creation flow during signup', async () => {
    let user;
    Parse.Cloud.beforeSave('_Session', async () => {
      // reject the session
      throw new Parse.Error(12345678, 'Sorry, more steps are required');
    });
    Parse.Cloud.beforeSave('_User', async req => {
      // make sure this runs correctly
      req.object.set('firstName', 'abcd');
    });
    Parse.Cloud.afterSave('_User', async req => {
      if (req.object.has('lastName')) {
        return;
      }
      // make sure this runs correctly
      req.object.set('lastName', '1234');
      await req.object.save({}, { useMasterKey: true });
    });
    try {
      user = new Parse.User();
      user.setUsername('user-name');
      user.setPassword('user-password');
      await user.signUp();
    } catch (error) {
      throw error;
    }
    expect(user.getSessionToken()).toBeUndefined();
    await delay(200); // just so that afterSave has time to run
    await user.fetch({ useMasterKey: true });
    expect(user.get('username')).toBe('user-name');
    expect(user.get('firstName')).toBe('abcd');
    expect(user.get('lastName')).toBe('1234');
    // get the session
    const query2 = new Parse.Query('_Session');
    query2.equalTo('user', user);
    const sessionObject = await query2.first({
      useMasterKey: true,
    });
    expect(sessionObject).toBeUndefined();
  });
  it('beforeSave should fail and prevent login on throw', async () => {
    Parse.Cloud.beforeSave('_Session', async req => {
      const sessionObject = req.object;
      if (sessionObject.get('createdWith').action === 'login') {
        throw new Parse.Error(12345678, 'Sorry, you cant login :(');
      }
    });
    const user = new Parse.User();
    user.setUsername('some-username');
    user.setPassword('password');
    await user.signUp();
    await Parse.User.logOut();
    try {
      await Parse.User.logIn('some-username', 'password');
    } catch (error) {
      expect(error.code).toBe(12345678);
      expect(error.message).toBe('Sorry, you cant login :(');
    }
    // make sure no session was created
    const query = new Parse.Query('_Session');
    query.equalTo('user', user);
    const sessionObject = await query.first({
      useMasterKey: true,
    });
    expect(sessionObject).toBeUndefined();
  });
  it('beforeDelete should ignore thrown errors', async () => {
    Parse.Cloud.beforeDelete('_Session', async () => {
      throw new Parse.Error(12345678, 'Nop');
    });
    const user = new Parse.User();
    user.setUsername('some-user-name');
    user.setPassword('password');
    try {
      await user.signUp();
      await user.destroy({ useMasterKey: true });
    } catch (error) {
      throw error;
    }
    try {
      await user.fetch({ useMasterKey: true });
      throw 'User should have been deleted.';
    } catch (error) {
      expect(error.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
    }
  });
  it('afterDelete should work normally', async () => {
    Parse.Cloud.afterDelete('_Session', function() {
      const someObject = new Parse.Object('Test');
      someObject.set('key', 'value');
      someObject.save();
    });
    const user = new Parse.User();
    user.setUsername('some-user-name');
    user.setPassword('password');
    await user.signUp();
    await Parse.User.logOut();
    await delay(200);
    const query = new Parse.Query('Test');
    const object = await query.first({
      useMasterKey: true,
    });
    expect(object).toBeDefined();
    expect(object.get('key')).toBe('value');
  });
  it('afterSave should work normally', async () => {
    Parse.Cloud.afterSave('_Session', function() {
      const someObject = new Parse.Object('Test');
      someObject.set('key', 'value');
      someObject.save();
    });
    const user = new Parse.User();
    user.setUsername('some-user-name');
    user.setPassword('password');
    await user.signUp();
    await delay(200);
    const query = new Parse.Query('Test');
    const object = await query.first({
      useMasterKey: true,
    });
    expect(object).toBeDefined();
    expect(object.get('key')).toBe('value');
  });
});
