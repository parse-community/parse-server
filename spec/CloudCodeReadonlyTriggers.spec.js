'use strict';
const Parse = require('parse/node');

describe('CloudCode ReadonlyTrigger tests', () => {
  it('readonly-beforeSave should disregard any changes', async () => {
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
  it('readonly-beforeSave should ignore any thrown errors during signup', async () => {
    const name = 'some username we dont like';
    let user;
    Parse.Cloud.beforeSave('_Session', async () => {
      throw new Parse.Error(12345678, 'Sorry, we dont like this username');
    });
    try {
      user = new Parse.User();
      user.setUsername(name);
      user.setPassword('password');
      await user.signUp();
    } catch (error) {
      throw 'Should not have failed';
    }
    // get the user
    const query = new Parse.Query('_User');
    query.equalTo('username', name);
    const createdUser = await query.first({
      useMasterKey: true,
    });
    expect(createdUser).toBeDefined();
    // get the session
    const query2 = new Parse.Query('_Session');
    query2.equalTo('user', createdUser);
    const sessionObject = await query2.first({
      useMasterKey: true,
    });
    expect(sessionObject).toBeDefined();
    expect(sessionObject.get('sessionToken')).toBeDefined();
    expect(sessionObject.get('sessionToken')).toBe(user.getSessionToken());
  });
  it('readonly-beforeSave should fail and prevent login on throw', async () => {
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
  it('readonly-beforeDelete should ignore thrown errors', async () => {
    Parse.Cloud.beforeDelete('_Session', async () => {
      throw new Parse.Error(12345678, 'Nop');
    });
    const user = new Parse.User();
    user.setUsername('some-user-name');
    user.setPassword('password');
    await user.signUp();
    try {
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
  it('readonly-afterDelete should work normally', async () => {
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
  it('readonly-afterSave should work normally', async () => {
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
