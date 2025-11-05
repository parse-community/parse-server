'use strict';

const { WinstonFileAuditLogAdapter } = require('../lib/Adapters/AuditLog/WinstonFileAuditLogAdapter');
const fs = require('fs');
const path = require('path');

describe('AuditLogAdapter', () => {
  const testLogFolder = path.join(__dirname, 'temp-audit-logs');
  const getLogFiles = (folder) => fs.readdirSync(folder).filter(f => f.endsWith('.log'));
  const testAppId = 'testApp123';

  let adapter;

  beforeEach(() => {
    // Clean up test log folder
    if (fs.existsSync(testLogFolder)) {
      fs.rmSync(testLogFolder, { recursive: true, force: true });
    }
    adapter = null;
  });

  afterEach(async () => {
    // Close adapter before deleting files
    if (adapter && adapter.close) {
      await adapter.close();
    }
    // Give Winston time to close file handles
    await new Promise(resolve => setTimeout(resolve, 100));
    if (fs.existsSync(testLogFolder)) {
      fs.rmSync(testLogFolder, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should initialize without options', () => {
      adapter = new WinstonFileAuditLogAdapter({});
      expect(adapter).toBeDefined();
      expect(adapter.isEnabled()).toBe(false);
    });

    it('should initialize with auditLogFolder option', () => {
      adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });
      expect(adapter).toBeDefined();
      expect(fs.existsSync(testLogFolder)).toBe(true);
      expect(adapter.isEnabled()).toBe(true);
    });

    it('should not create folder without auditLogFolder option', () => {
      adapter = new WinstonFileAuditLogAdapter({});
      expect(adapter).toBeDefined();
      expect(fs.existsSync(testLogFolder)).toBe(false);
      expect(adapter.isEnabled()).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('should return false when not configured', () => {
      const adapter = new WinstonFileAuditLogAdapter();
      expect(adapter.isEnabled()).toBe(false);
    });

    it('should return true when configured with folder', () => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });
      expect(adapter.isEnabled()).toBe(true);
    });
  });

  describe('logSystemEvent', () => {
    it('should not throw when audit logging is disabled', () => {
      const adapter = new WinstonFileAuditLogAdapter();
      expect(() => {
        adapter.logSystemEvent({
          eventType: 'SYSTEM',
          timestamp: new Date().toISOString(),
          appId: testAppId,
          success: true,
        });
      }).not.toThrow();
    });

    it('should log system event when enabled', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logSystemEvent({
        eventType: 'SYSTEM',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        success: true,
      });

      // Give winston time to write
      setTimeout(() => {
        const logFiles = getLogFiles(testLogFolder);
        expect(logFiles.length).toBeGreaterThan(0);
        done();
      }, 100);
    });
  });

  describe('logUserLogin', () => {
    it('should not throw when disabled', () => {
      const adapter = new WinstonFileAuditLogAdapter();
      expect(() => {
        adapter.logUserLogin({
          eventType: 'USER_LOGIN',
          timestamp: new Date().toISOString(),
          appId: testAppId,
          userId: 'user1',
          username: 'testuser',
          sessionToken: 'token123',
          ip: '127.0.0.1',
          success: true,
        });
      }).not.toThrow();
    });

    it('should log successful login', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logUserLogin({
        eventType: 'USER_LOGIN',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        userId: 'user1',
        username: 'testuser',
        sessionToken: 'token123',
        ip: '127.0.0.1',
        success: true,
        authMethod: 'password',
      });

      setTimeout(() => {
        const logFiles = getLogFiles(testLogFolder);
        expect(logFiles.length).toBeGreaterThan(0);

        const logFile = path.join(testLogFolder, logFiles[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('USER_LOGIN');
        expect(logContent).toContain('testuser');
        expect(logContent).toContain('***masked***'); // Session token should be masked
        expect(logContent).not.toContain('token123');
        done();
      }, 100);
    });

    it('should log failed login', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logUserLogin({
        eventType: 'USER_LOGIN',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        userId: 'user1',
        username: 'testuser',
        ip: '127.0.0.1',
        success: false,
        error: 'Invalid credentials',
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, getLogFiles(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('USER_LOGIN');
        expect(logContent).toContain('Invalid credentials');
        expect(logContent).toContain('"success":false');
        done();
      }, 100);
    });
  });

  describe('logDataView', () => {
    it('should not throw when disabled', () => {
      const adapter = new WinstonFileAuditLogAdapter();
      expect(() => {
        adapter.logDataView({
          eventType: 'DATA_VIEW',
          timestamp: new Date().toISOString(),
          appId: testAppId,
          userId: 'user1',
          success: true,
          className: 'TestClass',
          query: {},
          resultCount: 5,
        });
      }).not.toThrow();
    });

    it('should log data view event', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logDataView({
        eventType: 'DATA_VIEW',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        userId: 'user1',
        sessionToken: 'token123',
        ip: '127.0.0.1',
        success: true,
        className: 'TestClass',
        query: { name: 'test' },
        resultCount: 5,
        objectIds: ['obj1', 'obj2'],
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, getLogFiles(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('DATA_VIEW');
        expect(logContent).toContain('TestClass');
        expect(logContent).toContain('obj1');
        done();
      }, 100);
    });
  });

  describe('logDataCreate', () => {
    it('should log data creation', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logDataCreate({
        eventType: 'DATA_CREATE',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        userId: 'user1',
        ip: '127.0.0.1',
        success: true,
        className: 'TestClass',
        objectId: 'obj1',
        data: { name: 'test', value: 123 },
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, getLogFiles(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('DATA_CREATE');
        expect(logContent).toContain('TestClass');
        expect(logContent).toContain('obj1');
        done();
      }, 100);
    });

    it('should log failed creation', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logDataCreate({
        eventType: 'DATA_CREATE',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        userId: 'user1',
        success: false,
        error: 'Validation failed',
        className: 'TestClass',
        objectId: 'obj1',
        data: {},
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, getLogFiles(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('Validation failed');
        expect(logContent).toContain('"success":false');
        done();
      }, 100);
    });
  });

  describe('logDataUpdate', () => {
    it('should log data update', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logDataUpdate({
        eventType: 'DATA_UPDATE',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        userId: 'user1',
        ip: '127.0.0.1',
        success: true,
        className: 'TestClass',
        objectId: 'obj1',
        updatedFields: { name: 'updated' },
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, getLogFiles(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('DATA_UPDATE');
        expect(logContent).toContain('TestClass');
        expect(logContent).toContain('obj1');
        done();
      }, 100);
    });
  });

  describe('logDataDelete', () => {
    it('should log data deletion', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logDataDelete({
        eventType: 'DATA_DELETE',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        userId: 'user1',
        ip: '127.0.0.1',
        success: true,
        className: 'TestClass',
        objectId: 'obj1',
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, getLogFiles(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('DATA_DELETE');
        expect(logContent).toContain('TestClass');
        expect(logContent).toContain('obj1');
        done();
      }, 100);
    });
  });

  describe('logACLModify', () => {
    it('should log ACL modification', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      const acl = { '*': { read: true }, user1: { write: true } };

      adapter.logACLModify({
        eventType: 'ACL_MODIFY',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        userId: 'user1',
        ip: '127.0.0.1',
        success: true,
        className: 'TestClass',
        objectId: 'obj1',
        acl,
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, getLogFiles(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('ACL_MODIFY');
        expect(logContent).toContain('TestClass');
        expect(logContent).toContain('obj1');
        done();
      }, 100);
    });
  });

  describe('logSchemaModify', () => {
    it('should log schema creation', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logSchemaModify({
        eventType: 'SCHEMA_MODIFY',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        userId: 'user1',
        ip: '127.0.0.1',
        success: true,
        className: 'NewClass',
        operation: 'create',
        schemaData: { fields: { name: { type: 'String' } } },
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, getLogFiles(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('SCHEMA_MODIFY');
        expect(logContent).toContain('NewClass');
        expect(logContent).toContain('create');
        done();
      }, 100);
    });

    it('should log schema update', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logSchemaModify({
        eventType: 'SCHEMA_MODIFY',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        userId: 'user1',
        success: true,
        className: 'ExistingClass',
        operation: 'update',
        schemaData: { fields: { age: { type: 'Number' } } },
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, getLogFiles(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('update');
        done();
      }, 100);
    });

    it('should log schema deletion', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logSchemaModify({
        eventType: 'SCHEMA_MODIFY',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        userId: 'user1',
        success: true,
        className: 'OldClass',
        operation: 'delete',
        schemaData: {},
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, getLogFiles(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('delete');
        done();
      }, 100);
    });
  });

  describe('logPushSend', () => {
    it('should log push notification', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logPushSend({
        eventType: 'PUSH_SEND',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        userId: 'user1',
        ip: '127.0.0.1',
        success: true,
        payload: { alert: 'test' },
        target: { deviceType: 'ios', channels: ['channel1', 'channel2'] },
        deviceCount: 100,
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, getLogFiles(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('PUSH_SEND');
        expect(logContent).toContain('channel1');
        done();
      }, 100);
    });

    it('should log failed push', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logPushSend({
        eventType: 'PUSH_SEND',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        userId: 'user1',
        success: false,
        error: 'No devices found',
        target: {},
        deviceCount: 0,
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, getLogFiles(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('No devices found');
        expect(logContent).toContain('"success":false');
        done();
      }, 100);
    });
  });

  describe('log file management', () => {
    it('should create log folder if it does not exist', () => {
      expect(fs.existsSync(testLogFolder)).toBe(false);

      new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      expect(fs.existsSync(testLogFolder)).toBe(true);
    });

    it('should create logs with date pattern in filename', done => {
      const adapter = new WinstonFileAuditLogAdapter({
        auditLogFolder: testLogFolder,
        datePattern: 'YYYY-MM-DD',
      });

      adapter.logSystemEvent({
        eventType: 'SYSTEM',
        timestamp: new Date().toISOString(),
        appId: testAppId,
        success: true,
      });

      setTimeout(() => {
        const logFiles = getLogFiles(testLogFolder);
        expect(logFiles.length).toBeGreaterThan(0);
        expect(logFiles[0]).toMatch(/parse-server-audit-\d{4}-\d{2}-\d{2}\.log/);
        done();
      }, 100);
    });
  });
});
