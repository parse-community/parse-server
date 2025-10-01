'use strict';

const AuditLogAdapter = require('../lib/Adapters/Logger/AuditLogAdapter').AuditLogAdapter;
const { configureAuditLogger, logAuditEvent, isAuditLogEnabled } = require('../lib/Adapters/Logger/AuditLogger');
const fs = require('fs');
const path = require('path');

describe('AuditLogAdapter', () => {
  const testLogFolder = path.join(__dirname, 'temp-audit-logs');

  beforeEach(() => {
    // Clean up test log folder
    if (fs.existsSync(testLogFolder)) {
      fs.rmSync(testLogFolder, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test log folder
    if (fs.existsSync(testLogFolder)) {
      fs.rmSync(testLogFolder, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should initialize without options', () => {
      const adapter = new AuditLogAdapter();
      expect(adapter).toBeDefined();
    });

    it('should initialize with auditLogFolder option', () => {
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });
      expect(adapter).toBeDefined();
      expect(fs.existsSync(testLogFolder)).toBe(true);
    });

    it('should not create folder without auditLogFolder option', () => {
      const adapter = new AuditLogAdapter({});
      expect(adapter).toBeDefined();
      expect(fs.existsSync(testLogFolder)).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('should return false when not configured', () => {
      const adapter = new AuditLogAdapter();
      expect(adapter.isEnabled()).toBe(false);
    });

    it('should return true when configured with folder', () => {
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });
      expect(adapter.isEnabled()).toBe(true);
    });
  });

  describe('log', () => {
    it('should not throw when audit logging is disabled', () => {
      const adapter = new AuditLogAdapter();
      expect(() => {
        adapter.log('info', 'test message', { key: 'value' });
      }).not.toThrow();
    });

    it('should log system event when enabled', done => {
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.log('info', 'test message', { key: 'value' });

      // Give winston time to write
      setTimeout(() => {
        const logFiles = fs.readdirSync(testLogFolder);
        expect(logFiles.length).toBeGreaterThan(0);
        done();
      }, 100);
    });
  });

  describe('logUserLogin', () => {
    it('should not throw when disabled', () => {
      const adapter = new AuditLogAdapter();
      expect(() => {
        adapter.logUserLogin({
          userId: 'user1',
          username: 'testuser',
          sessionToken: 'token123',
          ipAddress: '127.0.0.1',
          success: true,
        });
      }).not.toThrow();
    });

    it('should log successful login', done => {
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logUserLogin({
        userId: 'user1',
        username: 'testuser',
        sessionToken: 'token123',
        ipAddress: '127.0.0.1',
        success: true,
        loginMethod: 'password',
      });

      setTimeout(() => {
        const logFiles = fs.readdirSync(testLogFolder);
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
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logUserLogin({
        userId: 'user1',
        username: 'testuser',
        ipAddress: '127.0.0.1',
        success: false,
        error: 'Invalid credentials',
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, fs.readdirSync(testLogFolder)[0]);
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
      const adapter = new AuditLogAdapter();
      expect(() => {
        adapter.logDataView({
          userId: 'user1',
          className: 'TestClass',
          query: {},
          resultCount: 5,
        });
      }).not.toThrow();
    });

    it('should log data view event', done => {
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logDataView({
        userId: 'user1',
        sessionToken: 'token123',
        ipAddress: '127.0.0.1',
        className: 'TestClass',
        query: { name: 'test' },
        resultCount: 5,
        objectIds: ['obj1', 'obj2'],
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, fs.readdirSync(testLogFolder)[0]);
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
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logDataCreate({
        userId: 'user1',
        ipAddress: '127.0.0.1',
        className: 'TestClass',
        objectId: 'obj1',
        data: { name: 'test', value: 123 },
        success: true,
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, fs.readdirSync(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('DATA_CREATE');
        expect(logContent).toContain('TestClass');
        expect(logContent).toContain('obj1');
        done();
      }, 100);
    });

    it('should log failed creation', done => {
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logDataCreate({
        userId: 'user1',
        className: 'TestClass',
        objectId: 'obj1',
        data: {},
        success: false,
        error: 'Validation failed',
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, fs.readdirSync(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('Validation failed');
        expect(logContent).toContain('"success":false');
        done();
      }, 100);
    });
  });

  describe('logDataUpdate', () => {
    it('should log data update', done => {
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logDataUpdate({
        userId: 'user1',
        ipAddress: '127.0.0.1',
        className: 'TestClass',
        objectId: 'obj1',
        updatedFields: { name: 'updated' },
        success: true,
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, fs.readdirSync(testLogFolder)[0]);
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
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logDataDelete({
        userId: 'user1',
        ipAddress: '127.0.0.1',
        className: 'TestClass',
        objectId: 'obj1',
        success: true,
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, fs.readdirSync(testLogFolder)[0]);
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
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      const oldACL = { '*': { read: true } };
      const newACL = { '*': { read: true }, user1: { write: true } };

      adapter.logACLModify({
        userId: 'user1',
        ipAddress: '127.0.0.1',
        className: 'TestClass',
        objectId: 'obj1',
        oldACL,
        newACL,
        success: true,
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, fs.readdirSync(testLogFolder)[0]);
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
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logSchemaModify({
        userId: 'user1',
        ipAddress: '127.0.0.1',
        className: 'NewClass',
        operation: 'create',
        changes: { fields: { name: { type: 'String' } } },
        success: true,
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, fs.readdirSync(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('SCHEMA_MODIFY');
        expect(logContent).toContain('NewClass');
        expect(logContent).toContain('create');
        done();
      }, 100);
    });

    it('should log schema update', done => {
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logSchemaModify({
        userId: 'user1',
        className: 'ExistingClass',
        operation: 'update',
        changes: { fields: { age: { type: 'Number' } } },
        success: true,
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, fs.readdirSync(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('update');
        done();
      }, 100);
    });

    it('should log schema deletion', done => {
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logSchemaModify({
        userId: 'user1',
        className: 'OldClass',
        operation: 'delete',
        changes: {},
        success: true,
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, fs.readdirSync(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('delete');
        done();
      }, 100);
    });
  });

  describe('logPushSend', () => {
    it('should log push notification', done => {
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logPushSend({
        userId: 'user1',
        ipAddress: '127.0.0.1',
        query: { deviceType: 'ios' },
        channels: ['channel1', 'channel2'],
        targetCount: 100,
        success: true,
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, fs.readdirSync(testLogFolder)[0]);
        const logContent = fs.readFileSync(logFile, 'utf8');
        expect(logContent).toContain('PUSH_SEND');
        expect(logContent).toContain('channel1');
        done();
      }, 100);
    });

    it('should log failed push', done => {
      const adapter = new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      adapter.logPushSend({
        userId: 'user1',
        query: {},
        channels: [],
        targetCount: 0,
        success: false,
        error: 'No devices found',
      });

      setTimeout(() => {
        const logFile = path.join(testLogFolder, fs.readdirSync(testLogFolder)[0]);
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

      new AuditLogAdapter({
        auditLogFolder: testLogFolder,
      });

      expect(fs.existsSync(testLogFolder)).toBe(true);
    });

    it('should create logs with date pattern in filename', done => {
      new AuditLogAdapter({
        auditLogFolder: testLogFolder,
        datePattern: 'YYYY-MM-DD',
      });

      logAuditEvent({
        eventType: 'SYSTEM',
        action: 'test',
      });

      setTimeout(() => {
        const logFiles = fs.readdirSync(testLogFolder);
        expect(logFiles.length).toBeGreaterThan(0);
        expect(logFiles[0]).toMatch(/parse-server-audit-\d{4}-\d{2}-\d{2}\.log/);
        done();
      }, 100);
    });
  });
});
