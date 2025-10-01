'use strict';

const AuditLogController = require('../lib/Controllers/AuditLogController').AuditLogController;
const AuditLogAdapter = require('../lib/Adapters/Logger/AuditLogAdapter').AuditLogAdapter;

describe('AuditLogController', () => {
  let controller;
  let mockAdapter;

  beforeEach(() => {
    mockAdapter = {
      logUserLogin: jasmine.createSpy('logUserLogin'),
      logDataView: jasmine.createSpy('logDataView'),
      logDataCreate: jasmine.createSpy('logDataCreate'),
      logDataUpdate: jasmine.createSpy('logDataUpdate'),
      logDataDelete: jasmine.createSpy('logDataDelete'),
      logACLModify: jasmine.createSpy('logACLModify'),
      logSchemaModify: jasmine.createSpy('logSchemaModify'),
      logPushSend: jasmine.createSpy('logPushSend'),
      isEnabled: jasmine.createSpy('isEnabled').and.returnValue(true),
    };

    controller = new AuditLogController(mockAdapter, 'testApp');
  });

  describe('constructor', () => {
    it('should initialize with adapter', () => {
      expect(controller.adapter).toBe(mockAdapter);
    });
  });

  describe('_getIPAddress', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const req = {
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
        ip: '127.0.0.1',
      };
      const ip = controller._getIPAddress(req);
      expect(ip).toBe('192.168.1.1');
    });

    it('should extract IP from x-real-ip header', () => {
      const req = {
        headers: { 'x-real-ip': '192.168.1.2' },
        ip: '127.0.0.1',
      };
      const ip = controller._getIPAddress(req);
      expect(ip).toBe('192.168.1.2');
    });

    it('should fallback to req.ip', () => {
      const req = {
        headers: {},
        ip: '127.0.0.1',
      };
      const ip = controller._getIPAddress(req);
      expect(ip).toBe('127.0.0.1');
    });

    it('should fallback to connection.remoteAddress', () => {
      const req = {
        headers: {},
        connection: { remoteAddress: '127.0.0.2' },
      };
      const ip = controller._getIPAddress(req);
      expect(ip).toBe('127.0.0.2');
    });

    it('should return undefined for null request', () => {
      const ip = controller._getIPAddress(null);
      expect(ip).toBeUndefined();
    });
  });

  describe('_getUserContext', () => {
    it('should extract user ID and session token from auth', () => {
      const auth = {
        user: { id: 'user123' },
        sessionToken: 'session123',
      };
      const context = controller._getUserContext(auth);
      expect(context.userId).toBe('user123');
      expect(context.sessionToken).toBe('session123');
    });

    it('should handle auth with objectId instead of id', () => {
      const auth = {
        user: { objectId: 'user456' },
        sessionToken: 'session456',
      };
      const context = controller._getUserContext(auth);
      expect(context.userId).toBe('user456');
    });

    it('should return undefined values for null auth', () => {
      const context = controller._getUserContext(null);
      expect(context.userId).toBeUndefined();
      expect(context.sessionToken).toBeUndefined();
    });

    it('should handle auth without user', () => {
      const auth = {
        sessionToken: 'session789',
      };
      const context = controller._getUserContext(auth);
      expect(context.userId).toBeUndefined();
      expect(context.sessionToken).toBe('session789');
    });
  });

  describe('_maskSensitiveData', () => {
    it('should mask password field', () => {
      const data = { username: 'test', password: 'secret123' };
      const masked = controller._maskSensitiveData(data);
      expect(masked.username).toBe('test');
      expect(masked.password).toBe('***masked***');
    });

    it('should mask sessionToken field', () => {
      const data = { userId: 'user1', sessionToken: 'token123' };
      const masked = controller._maskSensitiveData(data);
      expect(masked.userId).toBe('user1');
      expect(masked.sessionToken).toBe('***masked***');
    });

    it('should mask authData field', () => {
      const data = { username: 'test', authData: { facebook: {} } };
      const masked = controller._maskSensitiveData(data);
      expect(masked.authData).toBe('***masked***');
    });

    it('should mask _hashed_password field', () => {
      const data = { username: 'test', _hashed_password: 'hash123' };
      const masked = controller._maskSensitiveData(data);
      expect(masked._hashed_password).toBe('***masked***');
    });

    it('should return non-object data unchanged', () => {
      expect(controller._maskSensitiveData(null)).toBe(null);
      expect(controller._maskSensitiveData('string')).toBe('string');
      expect(controller._maskSensitiveData(123)).toBe(123);
    });

    it('should not mutate original data', () => {
      const data = { password: 'secret' };
      controller._maskSensitiveData(data);
      expect(data.password).toBe('secret');
    });
  });

  describe('logUserLogin', () => {
    it('should log successful login', () => {
      const params = {
        auth: { user: { id: 'user1' }, sessionToken: 'token1' },
        req: { headers: {}, ip: '127.0.0.1' },
        username: 'testuser',
        success: true,
        loginMethod: 'password',
      };

      controller.logUserLogin(params);

      expect(mockAdapter.logUserLogin).toHaveBeenCalledWith({
        userId: 'user1',
        username: 'testuser',
        sessionToken: 'token1',
        ipAddress: '127.0.0.1',
        success: true,
        error: undefined,
        loginMethod: 'password',
      });
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
          username: 'testuser',
          success: false,
          error: 'Invalid credentials',
        })
      );
    });

    it('should not log if adapter is disabled', () => {
      mockAdapter.isEnabled.and.returnValue(false);
      controller.logUserLogin({ auth: {}, req: {} });
      expect(mockAdapter.logUserLogin).not.toHaveBeenCalled();
    });

    it('should not log if adapter is null', () => {
      controller.adapter = null;
      controller.logUserLogin({ auth: {}, req: {} });
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

      expect(mockAdapter.logDataView).toHaveBeenCalledWith({
        userId: 'user1',
        sessionToken: 'token1',
        ipAddress: '127.0.0.1',
        className: 'TestClass',
        query: { name: 'test' },
        resultCount: 5,
        objectIds: ['obj1', 'obj2'],
      });
    });

    it('should not log if adapter is disabled', () => {
      mockAdapter.isEnabled.and.returnValue(false);
      controller.logDataView({ auth: {}, req: {}, className: 'Test' });
      expect(mockAdapter.logDataView).not.toHaveBeenCalled();
    });
  });

  describe('logDataCreate', () => {
    it('should log data creation with masked sensitive data', () => {
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        className: '_User',
        objectId: 'newUser1',
        data: { username: 'newuser', password: 'secret123' },
        success: true,
      };

      controller.logDataCreate(params);

      expect(mockAdapter.logDataCreate).toHaveBeenCalledWith(
        jasmine.objectContaining({
          className: '_User',
          objectId: 'newUser1',
          data: jasmine.objectContaining({
            username: 'newuser',
            password: '***masked***',
          }),
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
    it('should log data update with masked fields', () => {
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        className: '_User',
        objectId: 'user1',
        updatedFields: { email: 'new@example.com', password: 'newsecret' },
        success: true,
      };

      controller.logDataUpdate(params);

      expect(mockAdapter.logDataUpdate).toHaveBeenCalledWith(
        jasmine.objectContaining({
          className: '_User',
          objectId: 'user1',
          updatedFields: jasmine.objectContaining({
            email: 'new@example.com',
            password: '***masked***',
          }),
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

      expect(mockAdapter.logDataDelete).toHaveBeenCalledWith({
        userId: 'user1',
        sessionToken: undefined,
        ipAddress: '127.0.0.1',
        className: 'TestClass',
        objectId: 'obj1',
        success: true,
        error: undefined,
      });
    });
  });

  describe('logACLModify', () => {
    it('should log ACL modification', () => {
      const oldACL = { '*': { read: true } };
      const newACL = { '*': { read: true }, user1: { write: true } };
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        className: 'TestClass',
        objectId: 'obj1',
        oldACL,
        newACL,
        success: true,
      };

      controller.logACLModify(params);

      expect(mockAdapter.logACLModify).toHaveBeenCalledWith(
        jasmine.objectContaining({
          className: 'TestClass',
          objectId: 'obj1',
          oldACL,
          newACL,
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
          className: 'NewClass',
          operation: 'create',
          changes: params.changes,
        })
      );
    });

    it('should log schema update', () => {
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        className: 'ExistingClass',
        operation: 'update',
        changes: { fields: { age: { type: 'Number' } } },
        success: true,
      };

      controller.logSchemaModify(params);

      expect(mockAdapter.logSchemaModify).toHaveBeenCalledWith(
        jasmine.objectContaining({
          operation: 'update',
        })
      );
    });

    it('should log schema deletion', () => {
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        className: 'OldClass',
        operation: 'delete',
        changes: {},
        success: true,
      };

      controller.logSchemaModify(params);

      expect(mockAdapter.logSchemaModify).toHaveBeenCalledWith(
        jasmine.objectContaining({
          operation: 'delete',
        })
      );
    });
  });

  describe('logPushSend', () => {
    it('should log push notification', () => {
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        query: { deviceType: 'ios' },
        channels: ['channel1', 'channel2'],
        targetCount: 100,
        success: true,
      };

      controller.logPushSend(params);

      expect(mockAdapter.logPushSend).toHaveBeenCalledWith({
        userId: 'user1',
        sessionToken: undefined,
        ipAddress: '127.0.0.1',
        query: { deviceType: 'ios' },
        channels: ['channel1', 'channel2'],
        targetCount: 100,
        success: true,
        error: undefined,
      });
    });

    it('should log failed push', () => {
      const params = {
        auth: { user: { id: 'user1' } },
        req: { headers: {}, ip: '127.0.0.1' },
        query: {},
        channels: [],
        targetCount: 0,
        success: false,
        error: 'No devices found',
      };

      controller.logPushSend(params);

      expect(mockAdapter.logPushSend).toHaveBeenCalledWith(
        jasmine.objectContaining({
          success: false,
          error: 'No devices found',
        })
      );
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
});
