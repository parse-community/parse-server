describe('ProtectedFields', function() {
  it('should handle and empty protectedFields', async function() {
    const protectedFields = {};
    await reconfigureServer({ protectedFields });

    const user = new Parse.User();
    user.setUsername('Alice');
    user.setPassword('sekrit');
    user.set('email', 'alice@aol.com');
    user.set('favoriteColor', 'yellow');
    await user.save();

    const fetched = await new Parse.Query(Parse.User).get(user.id);
    expect(fetched.has('email')).toBeFalsy();
    expect(fetched.has('favoriteColor')).toBeTruthy();
  });

  describe('interaction with legacy userSensitiveFields', function() {
    it('should fall back on sensitive fields if protected fields are not configured', async function() {
      const userSensitiveFields = ['phoneNumber', 'timeZone'];

      const protectedFields = { _User: { '*': ['email'] } };

      await reconfigureServer({ userSensitiveFields, protectedFields });
      const user = new Parse.User();
      user.setUsername('Alice');
      user.setPassword('sekrit');
      user.set('email', 'alice@aol.com');
      user.set('phoneNumber', 8675309);
      user.set('timeZone', 'America/Los_Angeles');
      user.set('favoriteColor', 'yellow');
      user.set('favoriteFood', 'pizza');
      await user.save();

      const fetched = await new Parse.Query(Parse.User).get(user.id);
      expect(fetched.has('email')).toBeFalsy();
      expect(fetched.has('phoneNumber')).toBeFalsy();
      expect(fetched.has('favoriteColor')).toBeTruthy();
    });

    it('should merge protected and sensitive for extra safety', async function() {
      const userSensitiveFields = ['phoneNumber', 'timeZone'];

      const protectedFields = { _User: { '*': ['email', 'favoriteFood'] } };

      await reconfigureServer({ userSensitiveFields, protectedFields });
      const user = new Parse.User();
      user.setUsername('Alice');
      user.setPassword('sekrit');
      user.set('email', 'alice@aol.com');
      user.set('phoneNumber', 8675309);
      user.set('timeZone', 'America/Los_Angeles');
      user.set('favoriteColor', 'yellow');
      user.set('favoriteFood', 'pizza');
      await user.save();

      const fetched = await new Parse.Query(Parse.User).get(user.id);
      expect(fetched.has('email')).toBeFalsy();
      expect(fetched.has('phoneNumber')).toBeFalsy();
      expect(fetched.has('favoriteFood')).toBeFalsy();
      expect(fetched.has('favoriteColor')).toBeTruthy();
    });
  });

  describe('non user class', function() {
    it('should hide fields in a non user class', async function() {
      const protectedFields = {
        ClassA: { '*': ['foo'] },
        ClassB: { '*': ['bar'] },
      };
      await reconfigureServer({ protectedFields });

      const objA = await new Parse.Object('ClassA')
        .set('foo', 'zzz')
        .set('bar', 'yyy')
        .save();

      const objB = await new Parse.Object('ClassB')
        .set('foo', 'zzz')
        .set('bar', 'yyy')
        .save();

      const [fetchedA, fetchedB] = await Promise.all([
        new Parse.Query('ClassA').get(objA.id),
        new Parse.Query('ClassB').get(objB.id),
      ]);

      expect(fetchedA.has('foo')).toBeFalsy();
      expect(fetchedA.has('bar')).toBeTruthy();

      expect(fetchedB.has('foo')).toBeTruthy();
      expect(fetchedB.has('bar')).toBeFalsy();
    });

    it('should hide fields in non user class and non standard user field at same time', async function() {
      const protectedFields = {
        _User: { '*': ['phoneNumber'] },
        ClassA: { '*': ['foo'] },
        ClassB: { '*': ['bar'] },
      };

      await reconfigureServer({ protectedFields });

      const user = new Parse.User();
      user.setUsername('Alice');
      user.setPassword('sekrit');
      user.set('email', 'alice@aol.com');
      user.set('phoneNumber', 8675309);
      user.set('timeZone', 'America/Los_Angeles');
      user.set('favoriteColor', 'yellow');
      user.set('favoriteFood', 'pizza');
      await user.save();

      const objA = await new Parse.Object('ClassA')
        .set('foo', 'zzz')
        .set('bar', 'yyy')
        .save();

      const objB = await new Parse.Object('ClassB')
        .set('foo', 'zzz')
        .set('bar', 'yyy')
        .save();

      const [fetchedUser, fetchedA, fetchedB] = await Promise.all([
        new Parse.Query(Parse.User).get(user.id),
        new Parse.Query('ClassA').get(objA.id),
        new Parse.Query('ClassB').get(objB.id),
      ]);

      expect(fetchedA.has('foo')).toBeFalsy();
      expect(fetchedA.has('bar')).toBeTruthy();

      expect(fetchedB.has('foo')).toBeTruthy();
      expect(fetchedB.has('bar')).toBeFalsy();

      expect(fetchedUser.has('email')).toBeFalsy();
      expect(fetchedUser.has('phoneNumber')).toBeFalsy();
      expect(fetchedUser.has('favoriteColor')).toBeTruthy();
    });
  });
});
