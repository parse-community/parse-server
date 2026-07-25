'use strict';
// These tests check the Installations functionality of the REST API.
// Ported from installation_collection_test.go

const auth = require('../lib/Auth');
const Config = require('../lib/Config');
const Parse = require('parse/node').Parse;
const rest = require('../lib/rest');
const request = require('../lib/request');

let config;
let database;
const defaultColumns = require('../lib/Controllers/SchemaController').defaultColumns;

const delay = function delay(delay) {
  return new Promise(resolve => setTimeout(resolve, delay));
};

const installationSchema = {
  fields: Object.assign({}, defaultColumns._Default, defaultColumns._Installation),
};

describe('Installations', () => {
  beforeEach(() => {
    config = Config.get('test');
    database = config.database;
  });

  it('creates an android installation with ids', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const device = 'android';
    const input = {
      installationId: installId,
      deviceType: device,
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const obj = results[0];
        expect(obj.installationId).toEqual(installId);
        expect(obj.deviceType).toEqual(device);
        done();
      })
      .catch(error => {
        console.log(error);
        jfail(error);
        done();
      });
  });

  it('creates an ios installation with ids', done => {
    const t = '11433856eed2f1285fb3aa11136718c1198ed5647875096952c66bf8cb976306';
    const device = 'ios';
    const input = {
      deviceToken: t,
      deviceType: device,
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const obj = results[0];
        expect(obj.deviceToken).toEqual(t);
        expect(obj.deviceType).toEqual(device);
        done();
      })
      .catch(error => {
        console.log(error);
        jfail(error);
        done();
      });
  });

  it('creates an embedded installation with ids', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const device = 'embedded';
    const input = {
      installationId: installId,
      deviceType: device,
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const obj = results[0];
        expect(obj.installationId).toEqual(installId);
        expect(obj.deviceType).toEqual(device);
        done();
      })
      .catch(error => {
        console.log(error);
        jfail(error);
        done();
      });
  });

  it('creates an android installation with all fields', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const device = 'android';
    const input = {
      installationId: installId,
      deviceType: device,
      channels: ['foo', 'bar'],
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const obj = results[0];
        expect(obj.installationId).toEqual(installId);
        expect(obj.deviceType).toEqual(device);
        expect(typeof obj.channels).toEqual('object');
        expect(obj.channels.length).toEqual(2);
        expect(obj.channels[0]).toEqual('foo');
        expect(obj.channels[1]).toEqual('bar');
        done();
      })
      .catch(error => {
        console.log(error);
        jfail(error);
        done();
      });
  });

  it('creates an ios installation with all fields', done => {
    const t = '11433856eed2f1285fb3aa11136718c1198ed5647875096952c66bf8cb976306';
    const device = 'ios';
    const input = {
      deviceToken: t,
      deviceType: device,
      channels: ['foo', 'bar'],
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const obj = results[0];
        expect(obj.deviceToken).toEqual(t);
        expect(obj.deviceType).toEqual(device);
        expect(typeof obj.channels).toEqual('object');
        expect(obj.channels.length).toEqual(2);
        expect(obj.channels[0]).toEqual('foo');
        expect(obj.channels[1]).toEqual('bar');
        done();
      })
      .catch(error => {
        console.log(error);
        jfail(error);
        done();
      });
  });

  it('should properly fail queying installations', done => {
    const logger = require('../lib/logger').default;
    const loggerErrorSpy = spyOn(logger, 'error').and.callThrough();

    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const device = 'android';
    const input = {
      installationId: installId,
      deviceType: device,
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => {
        loggerErrorSpy.calls.reset();
        const query = new Parse.Query(Parse.Installation);
        return query.find();
      })
      .then(() => {
        fail('Should not succeed!');
        done();
      })
      .catch(error => {
        expect(error.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
        expect(error.message).toBe(
          'Permission denied'
        );
        expect(loggerErrorSpy).toHaveBeenCalledWith('Sanitized error:', jasmine.stringContaining("Clients aren't allowed to perform the find operation on the installation collection."));
        done();
      });
  });

  it('should properly queying installations with masterKey', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const device = 'android';
    const input = {
      installationId: installId,
      deviceType: device,
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => {
        const query = new Parse.Query(Parse.Installation);
        return query.find({ useMasterKey: true });
      })
      .then(results => {
        expect(results.length).toEqual(1);
        const obj = results[0].toJSON();
        expect(obj.installationId).toEqual(installId);
        expect(obj.deviceType).toEqual(device);
        done();
      })
      .catch(() => {
        fail('Should not fail');
        done();
      });
  });

  it('fails with missing ids', done => {
    const input = {
      deviceType: 'android',
      channels: ['foo', 'bar'],
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => {
        fail('Should not have been able to create an Installation.');
        done();
      })
      .catch(error => {
        expect(error.code).toEqual(135);
        done();
      });
  });

  it('fails for android with missing type', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const input = {
      installationId: installId,
      channels: ['foo', 'bar'],
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => {
        fail('Should not have been able to create an Installation.');
        done();
      })
      .catch(error => {
        expect(error.code).toEqual(135);
        done();
      });
  });

  it('creates an object with custom fields', done => {
    const t = '11433856eed2f1285fb3aa11136718c1198ed5647875096952c66bf8cb976306';
    const input = {
      deviceToken: t,
      deviceType: 'ios',
      channels: ['foo', 'bar'],
      custom: 'allowed',
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const obj = results[0];
        expect(obj.custom).toEqual('allowed');
        done();
      })
      .catch(error => {
        console.log(error);
      });
  });

  // Note: did not port test 'TestObjectIDForIdentifiers'

  it('merging when installationId already exists', done => {
    const installId1 = '12345678-abcd-abcd-abcd-123456789abc';
    const t = '11433856eed2f1285fb3aa11136718c1198ed5647875096952c66bf8cb976306';
    const input = {
      deviceToken: t,
      deviceType: 'ios',
      installationId: installId1,
      channels: ['foo', 'bar'],
    };
    let firstObject;
    let secondObject;
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        firstObject = results[0];
        delete input.deviceToken;
        delete input.channels;
        input['foo'] = 'bar';
        return rest.create(config, auth.nobody(config), '_Installation', input);
      })
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        secondObject = results[0];
        expect(firstObject._id).toEqual(secondObject._id);
        expect(secondObject.channels.length).toEqual(2);
        expect(secondObject.foo).toEqual('bar');
        done();
      })
      .catch(error => {
        console.log(error);
      });
  });

  it('merging when two objects both only have one id', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const t = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const input1 = {
      installationId: installId,
      deviceType: 'ios',
    };
    const input2 = {
      deviceToken: t,
      deviceType: 'ios',
    };
    const input3 = {
      deviceToken: t,
      installationId: installId,
      deviceType: 'ios',
    };
    let firstObject;
    let secondObject;
    rest
      .create(config, auth.nobody(config), '_Installation', input1)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        firstObject = results[0];
        return rest.create(config, auth.nobody(config), '_Installation', input2);
      })
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(2);
        if (results[0]['_id'] == firstObject._id) {
          secondObject = results[1];
        } else {
          secondObject = results[0];
        }
        return rest.create(config, auth.nobody(config), '_Installation', input3);
      })
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0]['_id']).toEqual(secondObject._id);
        done();
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  xit('creating multiple devices with same device token works', done => {
    const installId1 = '11111111-abcd-abcd-abcd-123456789abc';
    const installId2 = '22222222-abcd-abcd-abcd-123456789abc';
    const installId3 = '33333333-abcd-abcd-abcd-123456789abc';
    const t = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const input = {
      installationId: installId1,
      deviceType: 'ios',
      deviceToken: t,
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => {
        input.installationId = installId2;
        return rest.create(config, auth.nobody(config), '_Installation', input);
      })
      .then(() => {
        input.installationId = installId3;
        return rest.create(config, auth.nobody(config), '_Installation', input);
      })
      .then(() =>
        database.adapter.find(
          '_Installation',
          { installationId: installId1 },
          installationSchema,
          {}
        )
      )
      .then(results => {
        expect(results.length).toEqual(1);
        return database.adapter.find(
          '_Installation',
          { installationId: installId2 },
          installationSchema,
          {}
        );
      })
      .then(results => {
        expect(results.length).toEqual(1);
        return database.adapter.find(
          '_Installation',
          { installationId: installId3 },
          installationSchema,
          {}
        );
      })
      .then(results => {
        expect(results.length).toEqual(1);
        done();
      })
      .catch(error => {
        console.log(error);
      });
  });

  it_id('95955e90-04bc-4437-920e-b84bc30dba01')(it)('updating with new channels', done => {
    const input = {
      installationId: '12345678-abcd-abcd-abcd-123456789abc',
      deviceType: 'android',
      channels: ['foo', 'bar'],
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const objectId = results[0].objectId;
        const update = {
          channels: ['baz'],
        };
        return rest.update(config, auth.nobody(config), '_Installation', { objectId }, update);
      })
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].channels.length).toEqual(1);
        expect(results[0].channels[0]).toEqual('baz');
        done();
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('update android fails with new installation id', done => {
    const installId1 = '12345678-abcd-abcd-abcd-123456789abc';
    const installId2 = '87654321-abcd-abcd-abcd-123456789abc';
    let input = {
      installationId: installId1,
      deviceType: 'android',
      channels: ['foo', 'bar'],
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        input = { installationId: installId2 };
        return rest.update(
          config,
          auth.nobody(config),
          '_Installation',
          { objectId: results[0].objectId },
          input
        );
      })
      .then(() => {
        fail('Updating the installation should have failed.');
        done();
      })
      .catch(error => {
        expect(error.code).toEqual(136);
        done();
      });
  });

  it('update ios fails with new deviceToken and no installationId', done => {
    const a = '11433856eed2f1285fb3aa11136718c1198ed5647875096952c66bf8cb976306';
    const b = '91433856eed2f1285fb3aa11136718c1198ed5647875096952c66bf8cb976306';
    let input = {
      deviceToken: a,
      deviceType: 'ios',
      channels: ['foo', 'bar'],
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        input = { deviceToken: b };
        return rest.update(
          config,
          auth.nobody(config),
          '_Installation',
          { objectId: results[0].objectId },
          input
        );
      })
      .then(() => {
        fail('Updating the installation should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(136);
        done();
      });
  });

  it('update ios updates device token', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const t = '11433856eed2f1285fb3aa11136718c1198ed5647875096952c66bf8cb976306';
    const u = '91433856eed2f1285fb3aa11136718c1198ed5647875096952c66bf8cb976306';
    let input = {
      installationId: installId,
      deviceType: 'ios',
      deviceToken: t,
      channels: ['foo', 'bar'],
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        input = {
          installationId: installId,
          deviceToken: u,
          deviceType: 'ios',
        };
        return rest.update(
          config,
          auth.nobody(config),
          '_Installation',
          { objectId: results[0].objectId },
          input
        );
      })
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].deviceToken).toEqual(u);
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('update fails to change deviceType', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    let input = {
      installationId: installId,
      deviceType: 'android',
      channels: ['foo', 'bar'],
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        input = {
          deviceType: 'ios',
        };
        return rest.update(
          config,
          auth.nobody(config),
          '_Installation',
          { objectId: results[0].objectId },
          input
        );
      })
      .then(() => {
        fail('Should not have been able to update Installation.');
        done();
      })
      .catch(error => {
        expect(error.code).toEqual(136);
        done();
      });
  });

  it('update android with custom field', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    let input = {
      installationId: installId,
      deviceType: 'android',
      channels: ['foo', 'bar'],
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        input = {
          custom: 'allowed',
        };
        return rest.update(
          config,
          auth.nobody(config),
          '_Installation',
          { objectId: results[0].objectId },
          input
        );
      })
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0]['custom']).toEqual('allowed');
        done();
      });
  });

  it('update android device token with duplicate device token', async () => {
    const installId1 = '11111111-abcd-abcd-abcd-123456789abc';
    const installId2 = '22222222-abcd-abcd-abcd-123456789abc';
    const t = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    let input = {
      installationId: installId1,
      deviceToken: t,
      deviceType: 'android',
    };
    await rest.create(config, auth.nobody(config), '_Installation', input);

    input = {
      installationId: installId2,
      deviceType: 'android',
    };
    await rest.create(config, auth.nobody(config), '_Installation', input);
    await delay(100);

    let results = await database.adapter.find(
      '_Installation',
      installationSchema,
      { installationId: installId1 },
      {}
    );
    expect(results.length).toEqual(1);
    const firstObject = results[0];

    results = await database.adapter.find(
      '_Installation',
      installationSchema,
      { installationId: installId2 },
      {}
    );
    expect(results.length).toEqual(1);
    const secondObject = results[0];

    // Update second installation to conflict with first installation
    input = {
      objectId: secondObject.objectId,
      deviceToken: t,
    };
    await rest.update(
      config,
      auth.nobody(config),
      '_Installation',
      { objectId: secondObject.objectId },
      input
    );
    await delay(100);
    results = await database.adapter.find(
      '_Installation',
      installationSchema,
      { objectId: firstObject.objectId },
      {}
    );
    expect(results.length).toEqual(0);
  });

  it('update ios device token with duplicate device token', done => {
    const installId1 = '11111111-abcd-abcd-abcd-123456789abc';
    const installId2 = '22222222-abcd-abcd-abcd-123456789abc';
    const t = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    let input = {
      installationId: installId1,
      deviceToken: t,
      deviceType: 'ios',
    };
    let firstObject;
    let secondObject;
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => {
        input = {
          installationId: installId2,
          deviceType: 'ios',
        };
        return rest.create(config, auth.nobody(config), '_Installation', input);
      })
      .then(() => delay(100))
      .then(() =>
        database.adapter.find(
          '_Installation',
          installationSchema,
          { installationId: installId1 },
          {}
        )
      )
      .then(results => {
        expect(results.length).toEqual(1);
        firstObject = results[0];
      })
      .then(() => delay(100))
      .then(() =>
        database.adapter.find(
          '_Installation',
          installationSchema,
          { installationId: installId2 },
          {}
        )
      )
      .then(results => {
        expect(results.length).toEqual(1);
        secondObject = results[0];
        // Update second installation to conflict with first installation id
        input = {
          installationId: installId2,
          deviceToken: t,
        };
        return rest.update(
          config,
          auth.nobody(config),
          '_Installation',
          { objectId: secondObject.objectId },
          input
        );
      })
      .then(() => delay(100))
      .then(() =>
        database.adapter.find(
          '_Installation',
          installationSchema,
          { objectId: firstObject.objectId },
          {}
        )
      )
      .then(results => {
        // The first object should have been deleted
        expect(results.length).toEqual(0);
        done();
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  xit('update ios device token with duplicate token different app', done => {
    const installId1 = '11111111-abcd-abcd-abcd-123456789abc';
    const installId2 = '22222222-abcd-abcd-abcd-123456789abc';
    const t = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const input = {
      installationId: installId1,
      deviceToken: t,
      deviceType: 'ios',
      appIdentifier: 'foo',
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => {
        input.installationId = installId2;
        input.appIdentifier = 'bar';
        return rest.create(config, auth.nobody(config), '_Installation', input);
      })
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        // The first object should have been deleted during merge
        expect(results.length).toEqual(1);
        expect(results[0].installationId).toEqual(installId2);
        done();
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('update ios token and channels', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const t = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    let input = {
      installationId: installId,
      deviceType: 'ios',
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        input = {
          deviceToken: t,
          channels: [],
        };
        return rest.update(
          config,
          auth.nobody(config),
          '_Installation',
          { objectId: results[0].objectId },
          input
        );
      })
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].installationId).toEqual(installId);
        expect(results[0].deviceToken).toEqual(t);
        expect(results[0].channels.length).toEqual(0);
        done();
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('update ios linking two existing objects', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const t = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    let input = {
      installationId: installId,
      deviceType: 'ios',
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => {
        input = {
          deviceToken: t,
          deviceType: 'ios',
        };
        return rest.create(config, auth.nobody(config), '_Installation', input);
      })
      .then(() =>
        database.adapter.find('_Installation', installationSchema, { deviceToken: t }, {})
      )
      .then(results => {
        expect(results.length).toEqual(1);
        input = {
          deviceToken: t,
          installationId: installId,
          deviceType: 'ios',
        };
        return rest.update(
          config,
          auth.nobody(config),
          '_Installation',
          { objectId: results[0].objectId },
          input
        );
      })
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].installationId).toEqual(installId);
        expect(results[0].deviceToken).toEqual(t);
        expect(results[0].deviceType).toEqual('ios');
        done();
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it_id('22311bc7-3f4f-42c1-a958-57083929e80d')(it)('update is linking two existing objects w/ increment', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const t = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    let input = {
      installationId: installId,
      deviceType: 'ios',
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => {
        input = {
          deviceToken: t,
          deviceType: 'ios',
        };
        return rest.create(config, auth.nobody(config), '_Installation', input);
      })
      .then(() =>
        database.adapter.find('_Installation', installationSchema, { deviceToken: t }, {})
      )
      .then(results => {
        expect(results.length).toEqual(1);
        input = {
          deviceToken: t,
          installationId: installId,
          deviceType: 'ios',
          score: {
            __op: 'Increment',
            amount: 1,
          },
        };
        return rest.update(
          config,
          auth.nobody(config),
          '_Installation',
          { objectId: results[0].objectId },
          input
        );
      })
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].installationId).toEqual(installId);
        expect(results[0].deviceToken).toEqual(t);
        expect(results[0].deviceType).toEqual('ios');
        expect(results[0].score).toEqual(1);
        done();
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('update is linking two existing with installation id', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const t = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    let input = {
      installationId: installId,
      deviceType: 'ios',
    };
    let installObj;
    let tokenObj;
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        installObj = results[0];
        input = {
          deviceToken: t,
          deviceType: 'ios',
        };
        return rest.create(config, auth.nobody(config), '_Installation', input);
      })
      .then(() =>
        database.adapter.find('_Installation', installationSchema, { deviceToken: t }, {})
      )
      .then(results => {
        expect(results.length).toEqual(1);
        tokenObj = results[0];
        input = {
          installationId: installId,
          deviceToken: t,
          deviceType: 'ios',
        };
        return rest.update(
          config,
          auth.nobody(config),
          '_Installation',
          { objectId: installObj.objectId },
          input
        );
      })
      .then(() =>
        database.adapter.find(
          '_Installation',
          installationSchema,
          { objectId: tokenObj.objectId },
          {}
        )
      )
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].installationId).toEqual(installId);
        expect(results[0].deviceToken).toEqual(t);
        done();
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it_id('f2975078-eab7-4287-a932-288842e3cfb9')(it)('update is linking two existing with installation id w/ op', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const t = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    let input = {
      installationId: installId,
      deviceType: 'ios',
    };
    let installObj;
    let tokenObj;
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        installObj = results[0];
        input = {
          deviceToken: t,
          deviceType: 'ios',
        };
        return rest.create(config, auth.nobody(config), '_Installation', input);
      })
      .then(() =>
        database.adapter.find('_Installation', installationSchema, { deviceToken: t }, {})
      )
      .then(results => {
        expect(results.length).toEqual(1);
        tokenObj = results[0];
        input = {
          installationId: installId,
          deviceToken: t,
          deviceType: 'ios',
          score: {
            __op: 'Increment',
            amount: 1,
          },
        };
        return rest.update(
          config,
          auth.nobody(config),
          '_Installation',
          { objectId: installObj.objectId },
          input
        );
      })
      .then(() =>
        database.adapter.find(
          '_Installation',
          installationSchema,
          { objectId: tokenObj.objectId },
          {}
        )
      )
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].installationId).toEqual(installId);
        expect(results[0].deviceToken).toEqual(t);
        expect(results[0].score).toEqual(1);
        done();
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('ios merge existing same token no installation id', done => {
    // Test creating installation when there is an existing object with the
    // same device token but no installation ID.  This is possible when
    // developers import device tokens from another push provider; the import
    // process does not generate installation IDs. When they later integrate
    // the Parse SDK, their app is going to save the installation. This save
    // op will have a client-generated installation ID as well as a device
    // token. At this point, if the device token matches the originally-
    // imported installation, then we should reuse the existing installation
    // object in case the developer already added additional fields via Data
    // Browser or REST API (e.g. channel targeting info).
    const t = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    let input = {
      deviceToken: t,
      deviceType: 'ios',
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        input = {
          installationId: installId,
          deviceToken: t,
          deviceType: 'ios',
        };
        return rest.create(config, auth.nobody(config), '_Installation', input);
      })
      .then(() => database.adapter.find('_Installation', installationSchema, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].deviceToken).toEqual(t);
        expect(results[0].installationId).toEqual(installId);
        done();
      })
      .catch(error => {
        console.log(error);
        fail();
        done();
      });
  });

  it('allows you to get your own installation (regression test for #1718)', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const device = 'android';
    const input = {
      installationId: installId,
      deviceType: device,
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(createResult => {
        const headers = {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        };
        return request({
          headers: headers,
          url: 'http://localhost:8378/1/installations/' + createResult.response.objectId,
        }).then(response => {
          const body = response.data;
          expect(body.objectId).toEqual(createResult.response.objectId);
          done();
        });
      })
      .catch(error => {
        console.log(error);
        fail('failed');
        done();
      });
  });

  it('allows you to update installation from header (#2090)', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const device = 'android';
    const input = {
      installationId: installId,
      deviceType: device,
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(() => {
        const headers = {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'X-Parse-Installation-Id': installId,
        };
        request({
          method: 'POST',
          headers: headers,
          url: 'http://localhost:8378/1/classes/_Installation',
          json: true,
          body: {
            date: new Date(),
          },
        }).then(response => {
          const body = response.data;
          expect(response.status).toBe(200);
          expect(body.updatedAt).not.toBeUndefined();
          done();
        });
      })
      .catch(error => {
        console.log(error);
        fail('failed');
        done();
      });
  });

  it('allows you to update installation with masterKey', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const device = 'android';
    const input = {
      installationId: installId,
      deviceType: device,
    };
    rest
      .create(config, auth.nobody(config), '_Installation', input)
      .then(createResult => {
        const installationObj = Parse.Installation.createWithoutData(
          createResult.response.objectId
        );
        installationObj.set('customField', 'custom value');
        return installationObj.save(null, { useMasterKey: true });
      })
      .then(updateResult => {
        expect(updateResult).not.toBeUndefined();
        expect(updateResult.get('customField')).toEqual('custom value');
        done();
      })
      .catch(error => {
        console.log(error);
        fail('failed');
        done();
      });
  });

  it('should properly handle installation save #2780', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const device = 'android';
    const input = {
      installationId: installId,
      deviceType: device,
    };
    rest.create(config, auth.nobody(config), '_Installation', input).then(() => {
      const query = new Parse.Query(Parse.Installation);
      query.equalTo('installationId', installId);
      query
        .first({ useMasterKey: true })
        .then(installation => {
          return installation.save(
            {
              key: 'value',
            },
            { useMasterKey: true }
          );
        })
        .then(
          () => {
            done();
          },
          err => {
            jfail(err);
            done();
          }
        );
    });
  });

  it('should properly reject updating installationId', done => {
    const installId = '12345678-abcd-abcd-abcd-123456789abc';
    const device = 'android';
    const input = {
      installationId: installId,
      deviceType: device,
    };
    rest.create(config, auth.nobody(config), '_Installation', input).then(() => {
      const query = new Parse.Query(Parse.Installation);
      query.equalTo('installationId', installId);
      query
        .first({ useMasterKey: true })
        .then(installation => {
          return installation.save(
            {
              key: 'value',
              installationId: '22222222-abcd-abcd-abcd-123456789abc',
            },
            { useMasterKey: true }
          );
        })
        .then(
          () => {
            fail('should not succeed');
            done();
          },
          err => {
            expect(err.code).toBe(136);
            expect(err.message).toBe('installationId may not be changed in this operation');
            done();
          }
        );
    });
  });

  it_id('e581faea-c1b4-4c64-af8c-52287ce6cd06')(it)('can use push with beforeSave', async () => {
    const input = {
      deviceToken: '11433856eed2f1285fb3aa11136718c1198ed5647875096952c66bf8cb976306',
      deviceType: 'ios',
    };
    await rest.create(config, auth.nobody(config), '_Installation', input);
    const functions = {
      beforeSave() {},
      afterSave() {},
    };
    spyOn(functions, 'beforeSave').and.callThrough();
    spyOn(functions, 'afterSave').and.callThrough();
    Parse.Cloud.beforeSave(Parse.Installation, functions.beforeSave);
    Parse.Cloud.afterSave(Parse.Installation, functions.afterSave);
    await Parse.Push.send({
      where: {
        deviceType: 'ios',
      },
      data: {
        badge: 'increment',
        alert: 'Hello world!',
      },
    });

    await Parse.Push.send({
      where: {
        deviceType: 'ios',
      },
      data: {
        badge: 'increment',
        alert: 'Hello world!',
      },
    });

    await Parse.Push.send({
      where: {
        deviceType: 'ios',
      },
      data: {
        badge: 'increment',
        alert: 'Hello world!',
      },
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    const installation = await new Parse.Query(Parse.Installation).first({ useMasterKey: true });
    expect(installation.get('badge')).toEqual(3);
    expect(functions.beforeSave).not.toHaveBeenCalled();
    expect(functions.afterSave).not.toHaveBeenCalled();
  });

  // TODO: Look at additional tests from installation_collection_test.go:882
  // TODO: Do we need to support _tombstone disabling of installations?
  // TODO: Test deletion, badge increments

  describe('access control for non-master clients', () => {
    const anonymousHeaders = {
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };

    it('blocks the find operation for an unauthenticated client', async () => {
      await rest.create(config, auth.nobody(config), '_Installation', {
        installationId: '12345678-abcd-abcd-abcd-123456789abc',
        deviceType: 'android',
      });
      let error;
      try {
        await request({
          method: 'GET',
          headers: anonymousHeaders,
          url: 'http://localhost:8378/1/installations',
        });
        fail('find should have been rejected');
        return;
      } catch (e) {
        error = e;
      }
      expect(error.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      expect(error.data.error).toBe('Permission denied');
    });

    it('blocks the delete operation for an unauthenticated client', async () => {
      const created = await rest.create(config, auth.nobody(config), '_Installation', {
        installationId: '12345678-abcd-abcd-abcd-123456789abc',
        deviceType: 'android',
      });
      let error;
      try {
        await request({
          method: 'DELETE',
          headers: anonymousHeaders,
          url: 'http://localhost:8378/1/installations/' + created.response.objectId,
        });
        fail('delete should have been rejected');
        return;
      } catch (e) {
        error = e;
      }
      expect(error.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      expect(error.data.error).toBe('Permission denied');
      // The row is still present: the anonymous delete did not take effect.
      const remaining = await database.adapter.find('_Installation', installationSchema, {}, {});
      expect(remaining.length).toBe(1);
    });

    it('blocks the find operation for an authenticated non-master user', async () => {
      // Even a logged-in user cannot enumerate installations, so another
      // device's objectId cannot be discovered through an authenticated session.
      const user = await Parse.User.signUp('installation-acl-user', 'pass-12345678');
      await rest.create(config, auth.nobody(config), '_Installation', {
        installationId: '12345678-abcd-abcd-abcd-123456789abc',
        deviceType: 'android',
      });
      let error;
      try {
        await request({
          method: 'GET',
          headers: {
            ...anonymousHeaders,
            'X-Parse-Session-Token': user.getSessionToken(),
          },
          url: 'http://localhost:8378/1/installations',
        });
        fail('find should have been rejected');
        return;
      } catch (e) {
        error = e;
      }
      expect(error.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      expect(error.data.error).toBe('Permission denied');
    });

    it('blocks the delete operation for an authenticated non-master user', async () => {
      const user = await Parse.User.signUp('installation-acl-user', 'pass-12345678');
      const created = await rest.create(config, auth.nobody(config), '_Installation', {
        installationId: '12345678-abcd-abcd-abcd-123456789abc',
        deviceType: 'android',
      });
      let error;
      try {
        await request({
          method: 'DELETE',
          headers: {
            ...anonymousHeaders,
            'X-Parse-Session-Token': user.getSessionToken(),
          },
          url: 'http://localhost:8378/1/installations/' + created.response.objectId,
        });
        fail('delete should have been rejected');
        return;
      } catch (e) {
        error = e;
      }
      expect(error.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      expect(error.data.error).toBe('Permission denied');
      // The row is still present: the authenticated non-master delete did not take effect.
      const remaining = await database.adapter.find('_Installation', installationSchema, {}, {});
      expect(remaining.length).toBe(1);
    });
  });

  describe('deviceToken deduplication on new install (no installationId match)', () => {
    const { randomUUID } = require('crypto');
    const installationSchema = {
      fields: Object.assign({}, defaultColumns._Default, defaultColumns._Installation),
    };

    async function reconfigureWithInstallationOptions(installationOpts) {
      await reconfigureServer({ installation: installationOpts });
      config = Config.get('test');
      database = config.database;
    }

    it('default options destroy conflicting rows', async () => {
      const t = randomUUID();
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t,
        deviceType: 'ios',
        installationId: 'iid-a',
      });
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t,
        deviceType: 'ios',
        installationId: 'iid-b',
      });
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t,
        deviceType: 'ios',
        installationId: 'iid-c',
      });

      const results = await database.adapter.find('_Installation', installationSchema, {}, {});
      expect(results.length).toBe(1);
      expect(results[0].installationId).toBe('iid-c');
    });

    it('action="update" preserves channels on conflicting rows but clears deviceToken', async () => {
      await reconfigureWithInstallationOptions({ duplicateDeviceTokenAction: 'update' });
      const t = randomUUID();
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t,
        deviceType: 'ios',
        installationId: 'iid-a',
        channels: ['old-news'],
      });
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t,
        deviceType: 'ios',
        installationId: 'iid-b',
        channels: ['old-sports'],
      });
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t,
        deviceType: 'ios',
        installationId: 'iid-c',
        channels: ['fresh'],
      });

      const all = await database.adapter.find('_Installation', installationSchema, {}, {});
      expect(all.length).toBe(3);
      const survivor = all.find(r => r.installationId === 'iid-c');
      expect(survivor.deviceToken).toBe(t);
      const cleared = all.filter(r => r.installationId !== 'iid-c');
      cleared.forEach(r => {
        expect(r.deviceToken).toBeUndefined();
        expect(r.channels).toBeDefined();
      });
    });

    it('enforceAuth=true preserves ACL-protected rows from unauthenticated dedup', async () => {
      await reconfigureWithInstallationOptions({ duplicateDeviceTokenActionEnforceAuth: true });
      const t = randomUUID();
      const user = await Parse.User.signUp('alice-' + Date.now(), 'pass');
      const aliceId = user.id;

      await rest.create(config, auth.master(config), '_Installation', {
        deviceToken: t,
        deviceType: 'ios',
        installationId: 'iid-protected',
        ACL: { [aliceId]: { read: true, write: true } },
      });
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t,
        deviceType: 'ios',
        installationId: 'iid-other',
      });
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t,
        deviceType: 'ios',
        installationId: 'iid-attacker',
      });

      const all = await database.adapter.find('_Installation', installationSchema, {}, {});
      const protectedRow = all.find(r => r.installationId === 'iid-protected');
      expect(protectedRow).toBeDefined();
      expect(protectedRow.deviceToken).toBe(t);
    });

    it('enforceAuth=true with master-key caller still bypasses ACL and dedups', async () => {
      await reconfigureWithInstallationOptions({ duplicateDeviceTokenActionEnforceAuth: true });
      const t = randomUUID();
      const user = await Parse.User.signUp('bob-' + Date.now(), 'pass');
      const bobId = user.id;
      await rest.create(config, auth.master(config), '_Installation', {
        deviceToken: t,
        deviceType: 'ios',
        installationId: 'iid-1',
        ACL: { [bobId]: { read: true, write: true } },
      });
      await rest.create(config, auth.master(config), '_Installation', {
        deviceToken: t,
        deviceType: 'ios',
        installationId: 'iid-2',
      });
      await rest.create(config, auth.master(config), '_Installation', {
        deviceToken: t,
        deviceType: 'ios',
        installationId: 'iid-3',
      });

      const all = await database.adapter.find('_Installation', installationSchema, {}, {});
      expect(all.length).toBe(1);
      expect(all[0].installationId).toBe('iid-3');
    });

    it('action="update" clears deviceToken on ALL matching rows (multi-row update)', async () => {
      await reconfigureWithInstallationOptions({ duplicateDeviceTokenAction: 'update' });
      const t = randomUUID();
      // First REST create ensures the storage class/table exists before direct
      // adapter inserts (relevant for Postgres, which creates tables lazily).
      await rest.create(config, auth.master(config), '_Installation', {
        deviceType: 'ios',
        deviceToken: t,
        installationId: 'multi-iid-a',
        channels: ['c-multi-iid-a'],
      });
      // Insert two more rows directly via the storage adapter so all three hold
      // the same deviceToken simultaneously — bypassing the sequential REST
      // dedup that would otherwise prevent this state.
      const adapter = config.database.adapter;
      for (const iid of ['multi-iid-b', 'multi-iid-c']) {
        await adapter.createObject(
          '_Installation',
          installationSchema,
          {
            objectId: 'oid-' + iid,
            deviceType: 'ios',
            deviceToken: t,
            installationId: iid,
            channels: ['c-' + iid],
          },
          null
        );
      }
      // Trigger site 1: new install with same deviceToken, different installationId.
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t,
        deviceType: 'ios',
        installationId: 'multi-iid-d',
        channels: ['fresh'],
      });

      const all = await database.adapter.find('_Installation', installationSchema, {}, {});
      const survivor = all.find(r => r.installationId === 'multi-iid-d');
      expect(survivor).toBeDefined();
      expect(survivor.deviceToken).toBe(t);
      const cleared = all.filter(r => r.installationId !== 'multi-iid-d');
      expect(cleared.length).toBe(3);
      cleared.forEach(r => {
        expect(r.deviceToken).toBeUndefined();
      });
    });
  });

  describe('deviceToken deduplication on existing install update (deviceToken changes)', () => {
    const { randomUUID } = require('crypto');
    const installationSchema = {
      fields: Object.assign({}, defaultColumns._Default, defaultColumns._Installation),
    };

    async function reconfigureWithInstallationOptions(installationOpts) {
      await reconfigureServer({ installation: installationOpts });
      config = Config.get('test');
      database = config.database;
    }

    it('default options destroy conflicting row when PUT sets a new deviceToken', async () => {
      const t1 = randomUUID();
      const t2 = randomUUID();
      const a = await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t1,
        deviceType: 'ios',
        installationId: 'iid-a',
      });
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t2,
        deviceType: 'ios',
        installationId: 'iid-b',
      });
      await rest.update(
        config,
        auth.nobody(config),
        '_Installation',
        { objectId: a.response.objectId },
        { deviceToken: t2, installationId: 'iid-a' }
      );

      const all = await database.adapter.find('_Installation', installationSchema, {}, {});
      expect(all.length).toBe(1);
      expect(all[0].deviceToken).toBe(t2);
      expect(all[0].installationId).toBe('iid-a');
    });

    it('action="update" preserves the conflicting row and only clears its deviceToken', async () => {
      await reconfigureWithInstallationOptions({ duplicateDeviceTokenAction: 'update' });
      const t1 = randomUUID();
      const t2 = randomUUID();
      const a = await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t1,
        deviceType: 'ios',
        installationId: 'iid-a',
      });
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t2,
        deviceType: 'ios',
        installationId: 'iid-b',
        channels: ['preserve-me'],
      });
      await rest.update(
        config,
        auth.nobody(config),
        '_Installation',
        { objectId: a.response.objectId },
        { deviceToken: t2, installationId: 'iid-a' }
      );

      const all = await database.adapter.find('_Installation', installationSchema, {}, {});
      expect(all.length).toBe(2);
      const aRow = all.find(r => r.installationId === 'iid-a');
      const bRow = all.find(r => r.installationId === 'iid-b');
      expect(aRow.deviceToken).toBe(t2);
      expect(bRow.deviceToken).toBeUndefined();
      expect(bRow.channels).toEqual(['preserve-me']);
    });

    it('enforceAuth=true preserves ACL-protected conflicting rows', async () => {
      await reconfigureWithInstallationOptions({ duplicateDeviceTokenActionEnforceAuth: true });
      const t1 = randomUUID();
      const t2 = randomUUID();
      const user = await Parse.User.signUp('carol-' + Date.now(), 'pass');
      const carolId = user.id;

      const a = await rest.create(config, auth.nobody(config), '_Installation', {
        deviceToken: t1,
        deviceType: 'ios',
        installationId: 'iid-a',
      });
      await rest.create(config, auth.master(config), '_Installation', {
        deviceToken: t2,
        deviceType: 'ios',
        installationId: 'iid-b',
        ACL: { [carolId]: { read: true, write: true } },
      });
      await rest.update(
        config,
        auth.nobody(config),
        '_Installation',
        { objectId: a.response.objectId },
        { deviceToken: t2, installationId: 'iid-a' }
      );

      const all = await database.adapter.find('_Installation', installationSchema, {}, {});
      const bRow = all.find(r => r.installationId === 'iid-b');
      expect(bRow).toBeDefined();
      expect(bRow.deviceToken).toBe(t2);
      const aRow = all.find(r => r.installationId === 'iid-a');
      expect(aRow.deviceToken).toBe(t2);
    });
  });

  describe('deviceToken deduplication merge case (idMatch + deviceToken-only orphan)', () => {
    const { randomUUID } = require('crypto');
    const installationSchema = {
      fields: Object.assign({}, defaultColumns._Default, defaultColumns._Installation),
    };

    async function reconfigureWithInstallationOptions(installationOpts) {
      await reconfigureServer({ installation: installationOpts });
      config = Config.get('test');
      database = config.database;
    }

    /**
     * Sets up the merge fixture:
     *   Row A — { installationId: iid, deviceType: 'ios' }       (no deviceToken)
     *   Row B — { deviceToken: t,    deviceType: 'ios', channels } (no installationId)
     * Then triggers the merge by POSTing { installationId: iid, deviceToken: t }.
     */
    async function setupMergeFixture(t, iid, bChannels = ['orphan-history']) {
      // Row A: matched by installationId, no deviceToken yet.
      await rest.create(config, auth.master(config), '_Installation', {
        deviceType: 'ios',
        installationId: iid,
      });
      // Row B: deviceToken-only orphan. Insert via the storage adapter to bypass
      // the require-at-least-one-ID check (the orphan has only deviceToken).
      const objectId = 'orph' + Math.random().toString(36).substring(2, 12);
      await database.adapter.createObject(
        '_Installation',
        installationSchema,
        {
          objectId,
          deviceType: 'ios',
          deviceToken: t,
          channels: bChannels,
        },
        null
      );
      return objectId;
    }

    it('default options merge: deviceToken-holder wins, idMatch destroyed', async () => {
      const t = randomUUID();
      const orphanObjectId = await setupMergeFixture(t, 'merge-iid-a');
      // POST that triggers the merge.
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceType: 'ios',
        installationId: 'merge-iid-a',
        deviceToken: t,
      });
      const all = await database.adapter.find('_Installation', installationSchema, {}, {});
      expect(all.length).toBe(1);
      expect(all[0].objectId).toBe(orphanObjectId);
      expect(all[0].installationId).toBe('merge-iid-a');
      expect(all[0].deviceToken).toBe(t);
      expect(all[0].channels).toEqual(['orphan-history']);
    });

    it('mergePriority=deviceToken, action=update clears installationId on idMatch (loser)', async () => {
      await reconfigureWithInstallationOptions({ duplicateDeviceTokenAction: 'update' });
      const t = randomUUID();
      const orphanObjectId = await setupMergeFixture(t, 'merge-iid-a');
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceType: 'ios',
        installationId: 'merge-iid-a',
        deviceToken: t,
      });
      const all = await database.adapter.find('_Installation', installationSchema, {}, {});
      expect(all.length).toBe(2);
      const survivor = all.find(r => r.objectId === orphanObjectId);
      expect(survivor.installationId).toBe('merge-iid-a');
      expect(survivor.deviceToken).toBe(t);
      const loser = all.find(r => r.objectId !== orphanObjectId);
      expect(loser.installationId).toBeUndefined();
    });

    it('mergePriority=installationId, action=delete destroys orphan, idMatch wins', async () => {
      await reconfigureWithInstallationOptions({
        duplicateDeviceTokenMergePriority: 'installationId',
      });
      const t = randomUUID();
      const orphanObjectId = await setupMergeFixture(t, 'merge-iid-a');
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceType: 'ios',
        installationId: 'merge-iid-a',
        deviceToken: t,
      });
      const all = await database.adapter.find('_Installation', installationSchema, {}, {});
      expect(all.length).toBe(1);
      expect(all[0].installationId).toBe('merge-iid-a');
      expect(all[0].deviceToken).toBe(t);
      expect(all[0].objectId).not.toBe(orphanObjectId);
    });

    it('mergePriority=installationId, action=update clears deviceToken on orphan', async () => {
      await reconfigureWithInstallationOptions({
        duplicateDeviceTokenMergePriority: 'installationId',
        duplicateDeviceTokenAction: 'update',
      });
      const t = randomUUID();
      const orphanObjectId = await setupMergeFixture(t, 'merge-iid-a');
      await rest.create(config, auth.nobody(config), '_Installation', {
        deviceType: 'ios',
        installationId: 'merge-iid-a',
        deviceToken: t,
      });
      const all = await database.adapter.find('_Installation', installationSchema, {}, {});
      expect(all.length).toBe(2);
      const survivor = all.find(r => r.installationId === 'merge-iid-a');
      expect(survivor.deviceToken).toBe(t);
      const loser = all.find(r => r.objectId === orphanObjectId);
      expect(loser.deviceToken).toBeUndefined();
      expect(loser.channels).toEqual(['orphan-history']);
    });
  });

  describe('options validation', () => {
    it('should accept default empty config', async () => {
      await expectAsync(reconfigureServer({})).toBeResolved();
    });

    it('should accept fully specified valid config', async () => {
      await expectAsync(
        reconfigureServer({
          installation: {
            duplicateDeviceTokenActionEnforceAuth: true,
            duplicateDeviceTokenAction: 'update',
            duplicateDeviceTokenMergePriority: 'installationId',
          },
        })
      ).toBeResolved();
    });

    it('should reject non-object values', async () => {
      await expectAsync(
        reconfigureServer({ installation: 'invalid' })
      ).toBeRejectedWith('installation must be an object.');
    });

    it('should reject array values', async () => {
      await expectAsync(
        reconfigureServer({ installation: [] })
      ).toBeRejectedWith('installation must be an object.');
    });

    it('should reject unknown nested keys', async () => {
      await expectAsync(
        reconfigureServer({
          installation: { unknownKey: 'foo' },
        })
      ).toBeRejectedWith("installation contains unknown property 'unknownKey'.");
    });

    it('should reject non-boolean duplicateDeviceTokenActionEnforceAuth', async () => {
      await expectAsync(
        reconfigureServer({
          installation: { duplicateDeviceTokenActionEnforceAuth: 'true' },
        })
      ).toBeRejectedWith('installation.duplicateDeviceTokenActionEnforceAuth must be a boolean.');
    });

    it('should reject invalid duplicateDeviceTokenAction value', async () => {
      await expectAsync(
        reconfigureServer({
          installation: { duplicateDeviceTokenAction: 'merge' },
        })
      ).toBeRejectedWith(
        "installation.duplicateDeviceTokenAction must be one of: 'delete', 'update'."
      );
    });

    it('should reject invalid duplicateDeviceTokenMergePriority value', async () => {
      await expectAsync(
        reconfigureServer({
          installation: { duplicateDeviceTokenMergePriority: 'objectId' },
        })
      ).toBeRejectedWith(
        "installation.duplicateDeviceTokenMergePriority must be one of: 'deviceToken', 'installationId'."
      );
    });

    it('should apply defaults for missing nested keys', async () => {
      await reconfigureServer({
        installation: { duplicateDeviceTokenActionEnforceAuth: true },
      });
      const config = Config.get('test');
      expect(config.installation.duplicateDeviceTokenActionEnforceAuth).toBe(true);
      expect(config.installation.duplicateDeviceTokenAction).toBe('delete');
      expect(config.installation.duplicateDeviceTokenMergePriority).toBe('deviceToken');
    });

    it('should apply full defaults when block omitted', async () => {
      await reconfigureServer({});
      const config = Config.get('test');
      expect(config.installation).toEqual({
        duplicateDeviceTokenActionEnforceAuth: false,
        duplicateDeviceTokenAction: 'delete',
        duplicateDeviceTokenMergePriority: 'deviceToken',
      });
    });
  });
});
