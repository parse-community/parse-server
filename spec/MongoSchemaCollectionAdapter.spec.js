'use strict';

const MongoSchemaCollection = require('../lib/Adapters/Storage/Mongo/MongoSchemaCollection')
  .default;

describe('MongoSchemaCollection', () => {
  it('can transform legacy _client_permissions keys to parse format', done => {
    expect(
      MongoSchemaCollection._TESTmongoSchemaToParseSchema({
        _id: '_Installation',
        _client_permissions: {
          get: true,
          find: true,
          count: true,
          update: true,
          create: true,
          delete: true,
        },
        _metadata: {
          class_permissions: {
            ACL: {
              '*': {
                read: true,
                write: true,
              },
            },
            get: { '*': true },
            find: { '*': true },
            count: { '*': true },
            update: { '*': true },
            create: { '*': true },
            delete: { '*': true },
            addField: { '*': true },
            protectedFields: { '*': [] },
          },
          indexes: {
            name1: { deviceToken: 1 },
          },
        },
        installationId: 'string',
        deviceToken: 'string',
        deviceType: 'string',
        channels: 'array',
        user: '*_User',
        pushType: 'string',
        GCMSenderId: 'string',
        timeZone: 'string',
        localeIdentifier: 'string',
        badge: 'number',
        appVersion: 'string',
        appName: 'string',
        appIdentifier: 'string',
        parseVersion: 'string',
      })
    ).toEqual({
      className: '_Installation',
      fields: {
        installationId: { type: 'String' },
        deviceToken: { type: 'String' },
        deviceType: { type: 'String' },
        channels: { type: 'Array' },
        user: { type: 'Pointer', targetClass: '_User' },
        pushType: { type: 'String' },
        GCMSenderId: { type: 'String' },
        timeZone: { type: 'String' },
        localeIdentifier: { type: 'String' },
        badge: { type: 'Number' },
        appVersion: { type: 'String' },
        appName: { type: 'String' },
        appIdentifier: { type: 'String' },
        parseVersion: { type: 'String' },
        ACL: { type: 'ACL' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        objectId: { type: 'String' },
      },
      classLevelPermissions: {
        ACL: {
          '*': {
            read: true,
            write: true,
          },
        },
        find: { '*': true },
        get: { '*': true },
        count: { '*': true },
        create: { '*': true },
        update: { '*': true },
        delete: { '*': true },
        addField: { '*': true },
        protectedFields: { '*': [] },
      },
      indexes: {
        name1: { deviceToken: 1 },
      },
    });
    done();
  });

  describe('mongoFieldToParseSchemaField function', () => {
    // Test successful type conversions
    it('should convert valid mongo field types to parse schema fields', () => {
      const testCases = [
        { input: 'string', expected: { type: 'String' } },
        { input: 'number', expected: { type: 'Number' } },
        { input: 'boolean', expected: { type: 'Boolean' } },
        { input: 'date', expected: { type: 'Date' } },
        { input: 'map', expected: { type: 'Object' } },
        { input: 'object', expected: { type: 'Object' } },
        { input: 'array', expected: { type: 'Array' } },
        { input: 'geopoint', expected: { type: 'GeoPoint' } },
        { input: 'file', expected: { type: 'File' } },
        { input: 'bytes', expected: { type: 'Bytes' } },
        { input: 'polygon', expected: { type: 'Polygon' } },
        { input: '*_User', expected: { type: 'Pointer', targetClass: '_User' } },
        { input: '*Post', expected: { type: 'Pointer', targetClass: 'Post' } },
        { input: 'relation<_User>', expected: { type: 'Relation', targetClass: '_User' } },
        { input: 'relation<Post>', expected: { type: 'Relation', targetClass: 'Post' } },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = MongoSchemaCollection._TESTmongoSchemaToParseSchema({
          _id: 'TestClass',
          testField: input,
        });

        expect(result.fields.testField).toEqual(expected);
      });
    });

    // Test error handling for invalid types (non-string values)
    it('should throw error for invalid field types', () => {
      const invalidInputs = [
        null,
        undefined,
        123,
        true,
        false,
        {},
        [],
        '',
      ];

      invalidInputs.forEach(invalidInput => {
        expect(() => {
          MongoSchemaCollection._TESTmongoSchemaToParseSchema({
            _id: 'TestClass',
            testField: invalidInput,
          });
        }).toThrow();
      });
    });

    it('should throw error with correct message for null input', () => {
      try {
        MongoSchemaCollection._TESTmongoSchemaToParseSchema({
          _id: 'TestClass',
          testField: null,
        });
      } catch (error) {
        expect(error.code).toBe(255);
        expect(error.message).toContain('Invalid field type');
      }
    });

    it('should throw error with correct message for undefined input', () => {
      try {
        MongoSchemaCollection._TESTmongoSchemaToParseSchema({
          _id: 'TestClass',
          testField: undefined,
        });
      } catch (error) {
        expect(error.code).toBe(255);
        expect(error.message).toContain('Invalid field type');
      }
    });

    it('should throw error with correct message for non-string input', () => {
      try {
        MongoSchemaCollection._TESTmongoSchemaToParseSchema({
          _id: 'TestClass',
          testField: 123,
        });
      } catch (error) {
        expect(error.code).toBe(255);
        expect(error.message).toContain('Invalid field type');
      }
    });

    it('should throw error with correct message for empty string input', () => {
      try {
        MongoSchemaCollection._TESTmongoSchemaToParseSchema({
          _id: 'TestClass',
          testField: '',
        });
      } catch (error) {
        expect(error.code).toBe(255);
        expect(error.message).toContain('Invalid field type');
      }
    });
  });
});
