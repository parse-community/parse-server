'use strict';

const Parse = require('parse/node');

describe('TriggerStore', () => {
  describe('validator cleanup', () => {
    it('should remove stale validator when re-registering function without one', async () => {
      Parse.Cloud.define(
        'validatedFunc',
        () => 'ok',
        { requireUser: true }
      );
      await expectAsync(
        Parse.Cloud.run('validatedFunc')
      ).toBeRejectedWith(
        new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Validation failed. Please login to continue.')
      );
      Parse.Cloud.define('validatedFunc', () => 'ok');
      const result = await Parse.Cloud.run('validatedFunc');
      expect(result).toBe('ok');
    });

    it('should remove stale validator when re-registering trigger without one', async () => {
      Parse.Cloud.beforeSave('StaleValidatorTest', () => {}, { requireMaster: true });
      await expectAsync(
        new Parse.Object('StaleValidatorTest').save()
      ).toBeRejectedWith(
        new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Validation failed. Master key is required to complete this request.')
      );
      Parse.Cloud.beforeSave('StaleValidatorTest', () => {});
      const obj = new Parse.Object('StaleValidatorTest');
      await obj.save();
      expect(obj.id).toBeDefined();
    });
  });

  describe('removal cleanup', () => {
    it('should remove validators when removing hooks via _removeAllHooks', async () => {
      Parse.Cloud.define(
        'hookCleanupFunc',
        () => 'ok',
        { requireUser: true }
      );
      await expectAsync(
        Parse.Cloud.run('hookCleanupFunc')
      ).toBeRejectedWith(
        new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Validation failed. Please login to continue.')
      );
      Parse.Cloud._removeAllHooks();
      Parse.Cloud.define('hookCleanupFunc', () => 'ok');
      const result = await Parse.Cloud.run('hookCleanupFunc');
      expect(result).toBe('ok');
    });
  });

  describe('invalid names', () => {
    it('should silently reject function names with quotes', async () => {
      Parse.Cloud.define("test'injection", () => 'bad');
      await expectAsync(
        Parse.Cloud.run("test'injection")
      ).toBeRejectedWith(
        new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid function: "test\'injection"')
      );
    });

    it('should silently reject function names with backticks', async () => {
      Parse.Cloud.define('test`injection', () => 'bad');
      await expectAsync(
        Parse.Cloud.run('test`injection')
      ).toBeRejectedWith(
        new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid function: "test`injection"')
      );
    });
  });

  describe('_PushStatus validation', () => {
    it('should reject beforeSave on _PushStatus', () => {
      expect(() => {
        Parse.Cloud.beforeSave('_PushStatus', () => {});
      }).toThrow('Only afterSave is allowed on _PushStatus');
    });

    it('should reject beforeDelete on _PushStatus', () => {
      expect(() => {
        Parse.Cloud.beforeDelete('_PushStatus', () => {});
      }).toThrow('Only afterSave is allowed on _PushStatus');
    });

    it('should reject beforeFind on _PushStatus', () => {
      expect(() => {
        Parse.Cloud.beforeFind('_PushStatus', () => {});
      }).toThrow('Only afterSave is allowed on _PushStatus');
    });

    it('should reject afterDelete on _PushStatus', () => {
      expect(() => {
        Parse.Cloud.afterDelete('_PushStatus', () => {});
      }).toThrow('Only afterSave is allowed on _PushStatus');
    });

    it('should allow afterSave on _PushStatus', () => {
      expect(() => {
        Parse.Cloud.afterSave('_PushStatus', () => {});
      }).not.toThrow();
    });
  });

  describe('Parse.Server setter', () => {
    it('should merge properties without losing existing config', () => {
      const originalKeys = Object.keys(Parse.Server);
      Parse.Server = { customProp: true };
      const config = Parse.Server;
      expect(config.customProp).toBe(true);
      for (const key of ['appId', 'masterKey', 'serverURL']) {
        expect(config[key]).toBeDefined();
      }
      expect(Object.keys(config).length).toBeGreaterThanOrEqual(originalKeys.length);
    });
  });

  describe('live query event handlers', () => {
    it('should forward events to cloud code handler', async () => {
      let receivedData;
      Parse.Cloud.onLiveQueryEvent(data => {
        receivedData = data;
      });
      const triggers = require('../lib/triggers');
      triggers.runLiveQueryEventHandlers({ event: 'test' });
      expect(receivedData).toEqual({ event: 'test' });
    });
  });

  describe('beforeLogin validator', () => {
    it('should enforce validator on beforeLogin', async () => {
      Parse.Cloud.beforeLogin(() => {}, { requireMaster: true });
      const user = new Parse.User();
      user.setUsername('loginval_user');
      user.setPassword('password');
      await user.signUp();
      await Parse.User.logOut();
      await expectAsync(
        Parse.User.logIn('loginval_user', 'password')
      ).toBeRejectedWith(
        new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Validation failed. Master key is required to complete this request.')
      );
    });
  });

  describe('useMasterKey deprecation', () => {
    it('should warn on useMasterKey call', () => {
      const spy = spyOn(console, 'warn');
      Parse.Cloud.useMasterKey();
      expect(spy).toHaveBeenCalledWith(
        jasmine.stringContaining('useMasterKey is deprecated')
      );
    });
  });
});
