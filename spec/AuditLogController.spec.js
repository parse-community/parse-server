'use strict';

const AuditLogController = require('../lib/Controllers/AuditLogController').AuditLogController;

describe('AuditLogController', () => {
  let controller;
  let mockAdapter;
  const testAppId = 'testApp123';

  beforeEach(() => {
    mockAdapter = {
      logUserLogin: jasmine.createSpy('logUserLogin').and.returnValue(Promise.resolve()),
      logDataView: jasmine.createSpy('logDataView').and.returnValue(Promise.resolve()),
      logDataCreate: jasmine.createSpy('logDataCreate').and.returnValue(Promise.resolve()),
      logDataUpdate: jasmine.createSpy('logDataUpdate').and.returnValue(Promise.resolve()),
      logDataDelete: jasmine.createSpy('logDataDelete').and.returnValue(Promise.resolve()),
      logACLModify: jasmine.createSpy('logACLModify').and.returnValue(Promise.resolve()),
      logSchemaModify: jasmine.createSpy('logSchemaModify').and.returnValue(Promise.resolve()),
      logPushSend: jasmine.createSpy('logPushSend').and.returnValue(Promise.resolve()),
      isEnabled: jasmine.createSpy('isEnabled').and.returnValue(true),
    };

    controller = new AuditLogController(mockAdapter, testAppId, {});
  });

  describe('constructor', () => {
    it('should initialize with adapter', () => {
      expect(controller.adapter).toBe(mockAdapter);
      expect(controller.appId).toBe(testAppId);
    });

    it('should initialize with null adapter', () => {
      const nullController = new AuditLogController(null, testAppId, {});
      expect(nullController.adapter).toBeNull();
    });
  });

  describe('isEnabled', () => {
    it('should return true when adapter is enabled', () => {
      expect(controller.isEnabled()).toBe(true);
    });

    it('should return false when adapter is disabled', () => {
      mockAdapter.isEnabled.and.returnValue(false);
      expect(controller.isEnabled()).toBe(false);
    });

    it('should return false when adapter is null', () => {
      controller.adapter = null;
      expect(controller.isEnabled()).toBe(false);
    });
  });

  describe('logUserLogin', () => {
    it('should log successful login with proper event structure', () => {
      const params = {
        auth: { user: { id: 'user1' }, sessionToken: 'token1' },
        req: { headers: {}, ip: '127.0.0.1' },
        username: 'testuser',
        success: true,
        loginMethod: 'password',
      };

      controller.logUserLogin(params);

      expect(mockAdapter.logUserLogin).toHaveBeenCalledWith(
        jasmine.objectContaining({
          eventType: 'USER_LOGIN',
          appId: testAppId,
          userId: 'user1',
          username: 'testuser',
          sessionToken: 'token1',
          ip: '127.0.0.1',
          success: true,
          authMethod: 'password',
        })
      );
    });

    it('should log failed login', () => {
      const params = {
        auth: {},
        req: { headers: {}, ip: '127.0.0.1' },
        username: 'testuser',
        success: false,
        error: 'Invalid credentials',
      };

      controller.logUserLogin(params);

      expect(mockAdapter.logUserLogin).toHaveBeenCalledWith(
        jasmine.objectContaining({
          eventType: 'USER_LOGIN',
          username: 'testuser',
          success: false,
          error: 'Invalid credentials',
        })
      );
    });

    it('should not log if adapter is disabled', () => {
      mockAdapter.isEnabled.and.returnValue(false);
      controller.logUserLogin({ auth: {}, req: {}, success: true });
      expect(mockAdapter.logUserLogin).not.toHaveBeenCalled();
    });

    it('should not log if adapter is null', () => {
      controller.adapter = null;
      controller.logUserLogin({ auth: {}, req: {}, success: true });
      // Should not throw error
    });
  });

  describe('logDataView', () => {
    it('should log data view operation', () => {
      const params = {
        auth: { user: { id: 'user1' }, sessionToken: 'token1' },
        req: { headers: {}, ip: '127.0.0.1' },
        className: 'TestClass',
        query: { name: 'test' },
        resultCount: 5,
        objectIds: ['obj1', 'obj2'],
      };

      controller.logDataView(params);

      expect(mockAdapter.logDataView).toHaveBeenCalledWith(
        jasmine.objectContaining({
          eventType: 'DATA_VIEW',
          appId: testAppId,
          userId: 'user1',
          sessionToken: 'token1',
          ip: '127.0.0.1',
          className: 'TestClass',
          query: { name: 'test' },
          resultCount: 5,
          objectIds: ['obj1', 'obj2'],
          success: true,
        })
      );
    });

    it('should not log if adapter is disabled', () => {
      mockAdapter.isEnabled.and.returnValue(false);
      controller.logDataView({ auth: {}, req: {}, className: 'Test' });
      expect(mockAdapter.logDataView).not.toHaveBeenCalled();
    });
  });

  describe('logDataCreate', () => {
    it('should log data creation', () => {
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        className: 'TestClass',
        objectId: 'newObj1',
        data: { name: 'test' },
        success: true,
      };

      controller.logDataCreate(params);

      expect(mockAdapter.logDataCreate).toHaveBeenCalledWith(
        jasmine.objectContaining({
          eventType: 'DATA_CREATE',
          className: 'TestClass',
          objectId: 'newObj1',
          success: true,
        })
      );
    });

    it('should log failed creation', () => {
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        className: 'TestClass',
        objectId: 'obj1',
        data: {},
        success: false,
        error: 'Validation failed',
      };

      controller.logDataCreate(params);

      expect(mockAdapter.logDataCreate).toHaveBeenCalledWith(
        jasmine.objectContaining({
          success: false,
          error: 'Validation failed',
        })
      );
    });
  });

  describe('logDataUpdate', () => {
    it('should log data update', () => {
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        className: 'TestClass',
        objectId: 'obj1',
        updatedFields: { name: 'updated' },
        success: true,
      };

      controller.logDataUpdate(params);

      expect(mockAdapter.logDataUpdate).toHaveBeenCalledWith(
        jasmine.objectContaining({
          eventType: 'DATA_UPDATE',
          className: 'TestClass',
          objectId: 'obj1',
          success: true,
        })
      );
    });
  });

  describe('logDataDelete', () => {
    it('should log data deletion', () => {
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        className: 'TestClass',
        objectId: 'obj1',
        success: true,
      };

      controller.logDataDelete(params);

      expect(mockAdapter.logDataDelete).toHaveBeenCalledWith(
        jasmine.objectContaining({
          eventType: 'DATA_DELETE',
          className: 'TestClass',
          objectId: 'obj1',
          success: true,
        })
      );
    });
  });

  describe('logACLModify', () => {
    it('should log ACL modification', () => {
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        className: 'TestClass',
        objectId: 'obj1',
        newACL: { user1: { read: true, write: true } },
        success: true,
      };

      controller.logACLModify(params);

      expect(mockAdapter.logACLModify).toHaveBeenCalledWith(
        jasmine.objectContaining({
          eventType: 'ACL_MODIFY',
          className: 'TestClass',
          objectId: 'obj1',
          success: true,
        })
      );
    });
  });

  describe('logSchemaModify', () => {
    it('should log schema creation', () => {
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        className: 'NewClass',
        operation: 'create',
        changes: { fields: { name: { type: 'String' } } },
        success: true,
      };

      controller.logSchemaModify(params);

      expect(mockAdapter.logSchemaModify).toHaveBeenCalledWith(
        jasmine.objectContaining({
          eventType: 'SCHEMA_MODIFY',
          operation: 'create',
          className: 'NewClass',
          success: true,
        })
      );
    });
  });

  describe('logPushSend', () => {
    it('should log push notification', () => {
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        payload: { alert: 'test' },
        query: { deviceType: 'ios' },
        channels: ['channel1'],
        targetCount: 100,
        success: true,
      };

      controller.logPushSend(params);

      expect(mockAdapter.logPushSend).toHaveBeenCalledWith(
        jasmine.objectContaining({
          eventType: 'PUSH_SEND',
          success: true,
          deviceCount: 100,
        })
      );
    });
  });
});
