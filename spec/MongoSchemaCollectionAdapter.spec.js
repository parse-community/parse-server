'use strict';

const MongoSchemaCollection = require('../src/Adapters/Storage/Mongo/MongoSchemaCollection').default;

describe('MongoSchemaCollection', () => {
  it('can transform legacy _client_permissions keys to parse format', done => {
    expect(MongoSchemaCollection._TESTmongoSchemaToParseSchema({
      "_id":"_Installation",
      "_client_permissions":{
        "get":true,
        "find":true,
        "update":true,
        "create":true,
        "delete":true,
      },
      "_metadata":{
        "class_permissions":{
          "get":{"*":true},
          "find":{"*":true},
          "update":{"*":true},
          "create":{"*":true},
          "delete":{"*":true},
          "addField":{"*":true},
        }
      },
      "installationId":"string",
      "deviceToken":"string",
      "deviceType":"string",
      "channels":"array",
      "user":"*_User",
    })).toEqual({
      className: '_Installation',
      fields: {
        installationId: { type: 'String' },
        deviceToken: { type: 'String' },
        deviceType: { type: 'String' },
        channels: { type: 'Array' },
        user: { type: 'Pointer', targetClass: '_User' },
        ACL: { type: 'ACL' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        objectId: { type: 'String' },
      },
      classLevelPermissions: {
        find: { '*': true },
        get: { '*': true },
        create: { '*': true },
        update: { '*': true },
        delete: { '*': true },
        addField: { '*': true },
      }
    });
    done();
  });
});
