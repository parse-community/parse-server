'use strict';

const Parse = require('parse/node').Parse;

describe('InstallationDedup', () => {
  let InstallationDedup;
  let logger;
  let logSpy;

  beforeEach(() => {
    InstallationDedup = require('../lib/InstallationDedup');
    logger = require('../lib/logger').logger;
    logSpy = {
      verbose: spyOn(logger, 'verbose').and.callFake(() => {}),
      warn: spyOn(logger, 'warn').and.callFake(() => {}),
      error: spyOn(logger, 'error').and.callFake(() => {}),
    };
  });

  describe('removeConflictingDeviceToken', () => {
    it('action="delete" with no match resolves silently and logs verbose', async () => {
      const database = {
        destroy: jasmine
          .createSpy('destroy')
          .and.returnValue(Promise.reject({ code: Parse.Error.OBJECT_NOT_FOUND })),
      };
      await InstallationDedup.removeConflictingDeviceToken({
        database,
        query: { deviceToken: 'X' },
        action: 'delete',
        enforceAuth: false,
        runOptions: {},
        validSchemaController: undefined,
      });
      expect(database.destroy).toHaveBeenCalled();
      expect(logSpy.verbose).toHaveBeenCalled();
      expect(logSpy.warn).not.toHaveBeenCalled();
      expect(logSpy.error).not.toHaveBeenCalled();
    });

    it('action="delete" with matches calls destroy with empty options when enforceAuth=false', async () => {
      const database = {
        destroy: jasmine.createSpy('destroy').and.returnValue(Promise.resolve()),
      };
      await InstallationDedup.removeConflictingDeviceToken({
        database,
        query: { deviceToken: 'X' },
        action: 'delete',
        enforceAuth: false,
        runOptions: { acl: ['*'] },
        validSchemaController: undefined,
      });
      expect(database.destroy).toHaveBeenCalledWith(
        '_Installation',
        { deviceToken: 'X' },
        {},
        undefined
      );
      expect(logSpy.verbose).toHaveBeenCalled();
    });

    it('action="delete" with enforceAuth=true passes runOptions to destroy', async () => {
      const database = {
        destroy: jasmine.createSpy('destroy').and.returnValue(Promise.resolve()),
      };
      const runOptions = { acl: ['*', 'userABC'] };
      await InstallationDedup.removeConflictingDeviceToken({
        database,
        query: { deviceToken: 'X' },
        action: 'delete',
        enforceAuth: true,
        runOptions,
        validSchemaController: undefined,
      });
      expect(database.destroy).toHaveBeenCalledWith(
        '_Installation',
        { deviceToken: 'X' },
        runOptions,
        undefined
      );
    });

    it('action="update" calls update with deviceToken cleared and many=true in options', async () => {
      const database = {
        update: jasmine.createSpy('update').and.returnValue(Promise.resolve()),
      };
      await InstallationDedup.removeConflictingDeviceToken({
        database,
        query: { deviceToken: 'X' },
        action: 'update',
        enforceAuth: false,
        runOptions: {},
        validSchemaController: undefined,
      });
      expect(database.update).toHaveBeenCalledWith(
        '_Installation',
        { deviceToken: 'X' },
        { deviceToken: { __op: 'Delete' } },
        jasmine.objectContaining({ many: true }),
        false,
        false,
        undefined
      );
      expect(logSpy.verbose).toHaveBeenCalled();
    });

    it('OPERATION_FORBIDDEN error is swallowed and logged as warn', async () => {
      const database = {
        destroy: jasmine
          .createSpy('destroy')
          .and.returnValue(
            Promise.reject({ code: Parse.Error.OPERATION_FORBIDDEN, message: 'denied' })
          ),
      };
      await InstallationDedup.removeConflictingDeviceToken({
        database,
        query: { deviceToken: 'X' },
        action: 'delete',
        enforceAuth: true,
        runOptions: { acl: ['*'] },
        validSchemaController: undefined,
      });
      expect(logSpy.warn).toHaveBeenCalled();
      expect(logSpy.error).not.toHaveBeenCalled();
    });

    it('unexpected error is logged as error and rethrown', async () => {
      const database = {
        destroy: jasmine
          .createSpy('destroy')
          .and.returnValue(Promise.reject(new Error('database connection lost'))),
      };
      let caught;
      try {
        await InstallationDedup.removeConflictingDeviceToken({
          database,
          query: { deviceToken: 'X' },
          action: 'delete',
          enforceAuth: false,
          runOptions: {},
          validSchemaController: undefined,
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeDefined();
      expect(caught.message).toBe('database connection lost');
      expect(logSpy.error).toHaveBeenCalled();
    });
  });

  describe('applyDuplicateDeviceTokenMerge', () => {
    const idMatch = { objectId: 'A', installationId: 'I' };
    const deviceTokenMatch = { objectId: 'B', deviceToken: 'X' };

    it('mergePriority="deviceToken" + action="delete" destroys idMatch and returns deviceTokenMatch.objectId', async () => {
      const database = {
        destroy: jasmine.createSpy('destroy').and.returnValue(Promise.resolve()),
      };
      const result = await InstallationDedup.applyDuplicateDeviceTokenMerge({
        database,
        idMatch,
        deviceTokenMatch,
        action: 'delete',
        mergePriority: 'deviceToken',
        enforceAuth: false,
        runOptions: {},
        validSchemaController: undefined,
      });
      expect(result).toBe('B');
      expect(database.destroy).toHaveBeenCalledWith(
        '_Installation',
        { objectId: 'A' },
        {},
        undefined
      );
      expect(logSpy.verbose).toHaveBeenCalled();
    });

    it('mergePriority="deviceToken" + action="update" clears installationId on idMatch and returns deviceTokenMatch.objectId', async () => {
      const database = {
        update: jasmine.createSpy('update').and.returnValue(Promise.resolve()),
      };
      const result = await InstallationDedup.applyDuplicateDeviceTokenMerge({
        database,
        idMatch,
        deviceTokenMatch,
        action: 'update',
        mergePriority: 'deviceToken',
        enforceAuth: false,
        runOptions: {},
        validSchemaController: undefined,
      });
      expect(result).toBe('B');
      expect(database.update).toHaveBeenCalledWith(
        '_Installation',
        { objectId: 'A' },
        { installationId: { __op: 'Delete' } },
        jasmine.objectContaining({ many: false }),
        false,
        false,
        undefined
      );
    });

    it('mergePriority="installationId" + action="delete" destroys deviceTokenMatch and returns idMatch.objectId', async () => {
      const database = {
        destroy: jasmine.createSpy('destroy').and.returnValue(Promise.resolve()),
      };
      const result = await InstallationDedup.applyDuplicateDeviceTokenMerge({
        database,
        idMatch,
        deviceTokenMatch,
        action: 'delete',
        mergePriority: 'installationId',
        enforceAuth: false,
        runOptions: {},
        validSchemaController: undefined,
      });
      expect(result).toBe('A');
      expect(database.destroy).toHaveBeenCalledWith(
        '_Installation',
        { objectId: 'B' },
        {},
        undefined
      );
    });

    it('mergePriority="installationId" + action="update" clears deviceToken on deviceTokenMatch and returns idMatch.objectId', async () => {
      const database = {
        update: jasmine.createSpy('update').and.returnValue(Promise.resolve()),
      };
      const result = await InstallationDedup.applyDuplicateDeviceTokenMerge({
        database,
        idMatch,
        deviceTokenMatch,
        action: 'update',
        mergePriority: 'installationId',
        enforceAuth: false,
        runOptions: {},
        validSchemaController: undefined,
      });
      expect(result).toBe('A');
      expect(database.update).toHaveBeenCalledWith(
        '_Installation',
        { objectId: 'B' },
        { deviceToken: { __op: 'Delete' } },
        jasmine.objectContaining({ many: false }),
        false,
        false,
        undefined
      );
    });

    it('OPERATION_FORBIDDEN on the merge action still returns survivor objectId (silent skip)', async () => {
      const database = {
        destroy: jasmine
          .createSpy('destroy')
          .and.returnValue(Promise.reject({ code: Parse.Error.OPERATION_FORBIDDEN })),
      };
      const result = await InstallationDedup.applyDuplicateDeviceTokenMerge({
        database,
        idMatch,
        deviceTokenMatch,
        action: 'delete',
        mergePriority: 'deviceToken',
        enforceAuth: true,
        runOptions: { acl: ['*'] },
        validSchemaController: undefined,
      });
      expect(result).toBe('B');
      expect(logSpy.warn).toHaveBeenCalled();
    });

    it('returns the shared objectId without calling destroy/update when idMatch and deviceTokenMatch are the same row', async () => {
      const sameRow = { objectId: 'SAME', installationId: 'I', deviceToken: 'X' };
      const database = {
        destroy: jasmine.createSpy('destroy').and.returnValue(Promise.resolve()),
        update: jasmine.createSpy('update').and.returnValue(Promise.resolve()),
      };
      const result = await InstallationDedup.applyDuplicateDeviceTokenMerge({
        database,
        idMatch: sameRow,
        deviceTokenMatch: sameRow,
        action: 'delete',
        mergePriority: 'deviceToken',
        enforceAuth: false,
        runOptions: {},
        validSchemaController: undefined,
      });
      expect(result).toBe('SAME');
      expect(database.destroy).not.toHaveBeenCalled();
      expect(database.update).not.toHaveBeenCalled();
    });

    it('enforceAuth=true passes runOptions to destroy', async () => {
      const database = {
        destroy: jasmine.createSpy('destroy').and.returnValue(Promise.resolve()),
      };
      const runOptions = { acl: ['*', 'userABC'] };
      await InstallationDedup.applyDuplicateDeviceTokenMerge({
        database,
        idMatch,
        deviceTokenMatch,
        action: 'delete',
        mergePriority: 'deviceToken',
        enforceAuth: true,
        runOptions,
        validSchemaController: undefined,
      });
      expect(database.destroy).toHaveBeenCalledWith(
        '_Installation',
        { objectId: 'A' },
        runOptions,
        undefined
      );
    });
  });
});
