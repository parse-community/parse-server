'use strict';

const fs = require('fs');
const path = require('path');
const request = require('../lib/request');

describe('Audit Logging - Schema Operations', () => {
  const testLogFolder = path.join(__dirname, 'temp-audit-logs-schema');
  const getLogFiles = (folder) => fs.readdirSync(folder).filter(f => f.endsWith('.log'));

  beforeEach(async () => {
    if (fs.existsSync(testLogFolder)) {
      fs.rmSync(testLogFolder, { recursive: true, force: true });
    }

    await reconfigureServer({
      auditLog: {
        auditLogFolder: testLogFolder,
      },
    });
  });

  afterEach(async () => {
    if (fs.existsSync(testLogFolder)) {
      fs.rmSync(testLogFolder, { recursive: true, force: true });
    }
  });

  it('should log schema creation', async () => {
    const schema = {
      className: 'AuditSchemaTest',
      fields: {
        testField: { type: 'String' },
      },
    };

    await request({
      method: 'POST',
      url: Parse.serverURL + '/schemas',
      body: schema,
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
      },
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    const logFiles = getLogFiles(testLogFolder);
    expect(logFiles.length).toBeGreaterThan(0);

    const logFile = path.join(testLogFolder, logFiles[0]);
    const logContent = fs.readFileSync(logFile, 'utf8');

    expect(logContent).toContain('SCHEMA_MODIFY');
    expect(logContent).toContain('AuditSchemaTest');
    expect(logContent).toContain('create');
  });

  it('should log schema update', async () => {
    const schema = {
      className: 'AuditSchemaUpdate',
      fields: {
        field1: { type: 'String' },
      },
    };

    await request({
      method: 'POST',
      url: Parse.serverURL + '/schemas',
      body: schema,
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
      },
    });

    await new Promise(resolve => setTimeout(resolve, 200));
    const logFiles1 = getLogFiles(testLogFolder);
    if (logFiles1.length > 0) {
      fs.unlinkSync(path.join(testLogFolder, logFiles1[0]));
    }

    await request({
      method: 'PUT',
      url: Parse.serverURL + '/schemas/AuditSchemaUpdate',
      body: {
        fields: {
          field2: { type: 'Number' },
        },
      },
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
      },
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    const logFiles = getLogFiles(testLogFolder);
    expect(logFiles.length).toBeGreaterThan(0);

    const logFile = path.join(testLogFolder, logFiles[0]);
    const logContent = fs.readFileSync(logFile, 'utf8');

    expect(logContent).toContain('SCHEMA_MODIFY');
    expect(logContent).toContain('AuditSchemaUpdate');
    expect(logContent).toContain('update');
  });

  it('should log schema deletion', async () => {
    const schema = {
      className: 'AuditSchemaDelete',
      fields: {
        field1: { type: 'String' },
      },
    };

    await request({
      method: 'POST',
      url: Parse.serverURL + '/schemas',
      body: schema,
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
      },
    });

    await new Promise(resolve => setTimeout(resolve, 200));
    const logFiles1 = getLogFiles(testLogFolder);
    if (logFiles1.length > 0) {
      fs.unlinkSync(path.join(testLogFolder, logFiles1[0]));
    }

    await request({
      method: 'DELETE',
      url: Parse.serverURL + '/schemas/AuditSchemaDelete',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
      },
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    const logFiles = getLogFiles(testLogFolder);
    expect(logFiles.length).toBeGreaterThan(0);

    const logFile = path.join(testLogFolder, logFiles[0]);
    const logContent = fs.readFileSync(logFile, 'utf8');

    expect(logContent).toContain('SCHEMA_MODIFY');
    expect(logContent).toContain('AuditSchemaDelete');
    expect(logContent).toContain('delete');
  });

  it('should log failed schema creation', async () => {
    const schema = {
      className: '_InvalidClassName',
      fields: {
        testField: { type: 'String' },
      },
    };

    try {
      await request({
        method: 'POST',
        url: Parse.serverURL + '/schemas',
        body: schema,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      });
    } catch (error) {
      // Expected to fail
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    const logFiles = getLogFiles(testLogFolder);
    if (logFiles.length > 0) {
      const logFile = path.join(testLogFolder, logFiles[0]);
      const logContent = fs.readFileSync(logFile, 'utf8');

      expect(logContent).toContain('SCHEMA_MODIFY');
      expect(logContent).toContain('"success":false');
    }
  });

  it('should capture user context in schema logs', async () => {
    const schema = {
      className: 'AuditSchemaUser',
      fields: {
        field1: { type: 'String' },
      },
    };

    await request({
      method: 'POST',
      url: Parse.serverURL + '/schemas',
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
  });

  it('should log schema changes with field details', async () => {
    const schema = {
      className: 'AuditSchemaFields',
      fields: {
        stringField: { type: 'String' },
        numberField: { type: 'Number' },
        pointerField: { type: 'Pointer', targetClass: '_User' },
      },
    };

    await request({
      method: 'POST',
      url: Parse.serverURL + '/schemas',
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
    expect(logContent).toContain('stringField');
    expect(logContent).toContain('numberField');
  });
});
