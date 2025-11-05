'use strict';

const fs = require('fs');
const path = require('path');
const request = require('../lib/request');

describe('End-to-End Audit Logging', () => {
  const testLogFolder = path.join(__dirname, 'temp-audit-logs-e2e');
  const getLogFiles = (folder) => fs.readdirSync(folder).filter(f => f.endsWith('.log'));

  beforeEach(async () => {
    if (fs.existsSync(testLogFolder)) {
      fs.rmSync(testLogFolder, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    if (fs.existsSync(testLogFolder)) {
      fs.rmSync(testLogFolder, { recursive: true, force: true });
    }
  });

  describe('Complete User Lifecycle with Audit Trail', () => {
    it('should create complete audit trail for user signup → login → CRUD → logout', async () => {
      await reconfigureServer({
        auditLog: {
          adapterOptions: {
            auditLogFolder: testLogFolder,
          },
        },
      });

      const user = new Parse.User();
      await user.signUp({
        username: 'e2euser',
        password: 'password123',
        email: 'e2e@example.com',
      });

      await Parse.User.logOut();
      await Parse.User.logIn('e2euser', 'password123');

      const TestClass = Parse.Object.extend('E2ETest');
      const obj = new TestClass();
      obj.set('name', 'test object');
      await obj.save();

      const query = new Parse.Query('E2ETest');
      const results = await query.find();

      obj.set('name', 'updated test object');
      await obj.save();

      await obj.destroy();

      await new Promise(resolve => setTimeout(resolve, 500));

      const logFiles = getLogFiles(testLogFolder);
      expect(logFiles.length).toBeGreaterThan(0);

      const logFile = path.join(testLogFolder, logFiles[0]);
      const logContent = fs.readFileSync(logFile, 'utf8');

      expect(logContent).toContain('USER_LOGIN');
      expect(logContent).toContain('DATA_CREATE');
      expect(logContent).toContain('DATA_VIEW');
      expect(logContent).toContain('DATA_UPDATE');
      expect(logContent).toContain('DATA_DELETE');

      const logLines = logContent
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line));

      // Verify timestamps are in chronological order
      const timestamps = logLines.map(log => new Date(log.timestamp).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('Audit Log File Management', () => {
    it('should create log files with correct naming pattern', async () => {
      await reconfigureServer({
        auditLog: {
          adapterOptions: {
            auditLogFolder: testLogFolder,
            datePattern: 'YYYY-MM-DD',
          },
        },
      });

      const user = new Parse.User();
      await user.signUp({
        username: 'filenameuser',
        password: 'password123',
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const logFiles = getLogFiles(testLogFolder);
      expect(logFiles.length).toBeGreaterThan(0);

      const filenamePattern = /parse-server-audit-\d{4}-\d{2}-\d{2}\.log/;
      expect(logFiles[0]).toMatch(filenamePattern);
    });

    it('should create folder if it does not exist', async () => {
      const newFolder = path.join(testLogFolder, 'nested', 'logs');

      await reconfigureServer({
        auditLog: {
          auditLogFolder: newFolder,
        },
      });

      const user = new Parse.User();
      await user.signUp({
        username: 'folderuser',
        password: 'password123',
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(fs.existsSync(newFolder)).toBe(true);

      const logFiles = fs.readdirSync(newFolder);
      expect(logFiles.length).toBeGreaterThan(0);

      fs.rmSync(path.join(testLogFolder, 'nested'), { recursive: true, force: true });
    });

    it('should handle custom date patterns', async () => {
      await reconfigureServer({
        auditLog: {
          auditLogFolder: testLogFolder,
          datePattern: 'YYYY-MM',
        },
      });

      const user = new Parse.User();
      await user.signUp({
        username: 'datepatternuser',
        password: 'password123',
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const logFiles = getLogFiles(testLogFolder);
      expect(logFiles.length).toBeGreaterThan(0);

      const filenamePattern = /parse-server-audit-\d{4}-\d{2}\.log/;
      expect(logFiles[0]).toMatch(filenamePattern);
    });
  });

  describe('Audit Logging Configuration', () => {
    it('should not create logs when audit logging is disabled', async () => {
      await reconfigureServer({});

      const user = new Parse.User();
      await user.signUp({
        username: 'disableduser',
        password: 'password123',
      });

      const TestClass = Parse.Object.extend('DisabledAudit');
      const obj = new TestClass();
      await obj.save();

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(fs.existsSync(testLogFolder)).toBe(false);
    });

    it('should support enabling audit logging at runtime', async () => {
      await reconfigureServer({});

      const user1 = new Parse.User();
      await user1.signUp({
        username: 'runtimeuser1',
        password: 'password123',
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      expect(fs.existsSync(testLogFolder)).toBe(false);

      await reconfigureServer({
        auditLog: {
          adapterOptions: {
            auditLogFolder: testLogFolder,
          },
        },
      });

      await Parse.User.logOut();
      const user2 = new Parse.User();
      await user2.signUp({
        username: 'runtimeuser2',
        password: 'password123',
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(fs.existsSync(testLogFolder)).toBe(true);
      const logFiles = getLogFiles(testLogFolder);
      expect(logFiles.length).toBeGreaterThan(0);
    });
  });

  describe('Audit Log Content Validation', () => {
    it('should log all required fields for each event type', async () => {
      await reconfigureServer({
        auditLog: {
          adapterOptions: {
            auditLogFolder: testLogFolder,
          },
        },
      });

      const user = new Parse.User();
      await user.signUp({
        username: 'validationuser',
        password: 'password123',
      });

      await Parse.User.logOut();
      await Parse.User.logIn('validationuser', 'password123');

      await new Promise(resolve => setTimeout(resolve, 200));

      const logFiles = getLogFiles(testLogFolder);
      const logFile = path.join(testLogFolder, logFiles[0]);
      const logContent = fs.readFileSync(logFile, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.includes('USER_LOGIN'));

      expect(logLines.length).toBeGreaterThan(0);

      const loginLog = JSON.parse(logLines[0]);

      expect(loginLog.timestamp).toBeDefined();
      expect(loginLog.eventType).toBe('USER_LOGIN');
      expect(loginLog.appId).toBeDefined();
      expect(loginLog.userId).toBeDefined();
      expect(loginLog.success).toBeDefined();
      expect(loginLog.ip).toBeDefined();
    });

    it('should properly format JSON in log files', async () => {
      await reconfigureServer({
        auditLog: {
          adapterOptions: {
            auditLogFolder: testLogFolder,
          },
        },
      });

      const user = new Parse.User();
      await user.signUp({
        username: 'jsonuser',
        password: 'password123',
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const logFiles = getLogFiles(testLogFolder);
      const logFile = path.join(testLogFolder, logFiles[0]);
      const logContent = fs.readFileSync(logFile, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim().length > 0);

      for (const line of logLines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('should mask all sensitive data fields', async () => {
      await reconfigureServer({
        auditLog: {
          adapterOptions: {
            auditLogFolder: testLogFolder,
          },
        },
      });

      const user = new Parse.User();
      await user.signUp({
        username: 'maskinguser',
        password: 'supersecret123',
        email: 'masking@example.com',
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const logFiles = getLogFiles(testLogFolder);
      const logFile = path.join(testLogFolder, logFiles[0]);
      const logContent = fs.readFileSync(logFile, 'utf8');

      expect(logContent).toContain('***masked***');
      expect(logContent).not.toContain('supersecret123');
      expect(logContent).not.toContain(user.getSessionToken());
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent operations correctly', async () => {
      await reconfigureServer({
        auditLog: {
          adapterOptions: {
            auditLogFolder: testLogFolder,
          },
        },
      });

      const userPromises = [];
      for (let i = 0; i < 10; i++) {
        const user = new Parse.User();
        userPromises.push(
          user.signUp({
            username: `concurrent${i}`,
            password: 'password123',
          })
        );
      }

      await Promise.all(userPromises);

      await new Promise(resolve => setTimeout(resolve, 300));

      const logFiles = getLogFiles(testLogFolder);
      const logFile = path.join(testLogFolder, logFiles[0]);
      const logContent = fs.readFileSync(logFile, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim().length > 0);

      expect(logLines.length).toBeGreaterThanOrEqual(10);

      const parsedLogs = logLines.map(line => JSON.parse(line));
      expect(parsedLogs.length).toBeGreaterThanOrEqual(10);

      for (let i = 0; i < 10; i++) {
        const userLogs = logLines.filter(line => line.includes(`concurrent${i}`));
        expect(userLogs.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Handling', () => {
    it('should not fail operations if audit logging fails', async () => {
      const invalidPath = '/invalid/readonly/path';

      await reconfigureServer({
        auditLog: {
          auditLogFolder: invalidPath,
        },
      });

      const user = new Parse.User();
      await expectAsync(
        user.signUp({
          username: 'errorhandlinguser',
          password: 'password123',
        })
      ).toBeResolved();

      expect(user.id).toBeDefined();
    });

    it('should log failed operations with error messages', async () => {
      await reconfigureServer({
        auditLog: {
          adapterOptions: {
            auditLogFolder: testLogFolder,
          },
        },
      });

      const user = new Parse.User();
      await user.signUp({
        username: 'failuser',
        password: 'password123',
      });

      try {
        await Parse.User.logIn('failuser', 'wrongpassword');
      } catch (error) {
        // Expected to fail
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      const logFiles = getLogFiles(testLogFolder);
      const logFile = path.join(testLogFolder, logFiles[0]);
      const logContent = fs.readFileSync(logFile, 'utf8');

      const logLines = logContent.split('\n').filter(line => line.includes('"success":false'));
      expect(logLines.length).toBeGreaterThan(0);

      const failedLog = JSON.parse(logLines[0]);
      expect(failedLog.success).toBe(false);
      expect(failedLog.error).toBeDefined();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high-volume logging without significant performance degradation', async () => {
      await reconfigureServer({
        auditLog: {
          adapterOptions: {
            auditLogFolder: testLogFolder,
          },
        },
      });

      const user = new Parse.User();
      await user.signUp({
        username: 'perfuser',
        password: 'password123',
      });

      const TestClass = Parse.Object.extend('PerfTest');

      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        const obj = new TestClass();
        obj.set('index', i);
        await obj.save();
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time even with audit logging enabled
      expect(duration).toBeLessThan(10000);

      await new Promise(resolve => setTimeout(resolve, 300));

      const logFiles = getLogFiles(testLogFolder);
      const logFile = path.join(testLogFolder, logFiles[0]);
      const logContent = fs.readFileSync(logFile, 'utf8');
      const createLogs = logContent.split('\n').filter(line => line.includes('DATA_CREATE'));

      expect(createLogs.length).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Cross-Feature Integration', () => {
    it('should log schema modifications', async () => {
      await reconfigureServer({
        auditLog: {
          adapterOptions: {
            auditLogFolder: testLogFolder,
          },
        },
      });

      const schema = {
        className: 'CustomClass',
        fields: {
          customField: { type: 'String' },
        },
      };

      await request({
        method: 'POST',
        url: Parse.serverURL + '/schemas/CustomClass',
        body: schema,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const logFiles = getLogFiles(testLogFolder);
      const logFile = path.join(testLogFolder, logFiles[0]);
      const logContent = fs.readFileSync(logFile, 'utf8');

      expect(logContent).toContain('SCHEMA_MODIFY');
      expect(logContent).toContain('CustomClass');
      expect(logContent).toContain('create');
    });
  });
});
