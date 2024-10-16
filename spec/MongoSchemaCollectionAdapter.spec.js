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
});
