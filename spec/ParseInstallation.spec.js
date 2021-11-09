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
        return query.find();
      })
      .then(() => {
        fail('Should not succeed!');
        done();
      })
      .catch(error => {
        expect(error.code).toBe(119);
        expect(error.message).toBe(
          "Clients aren't allowed to perform the find operation on the installation collection."
        );
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

  it('updating with new channels', done => {
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

  it('update is linking two existing objects w/ increment', done => {
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

  it('update is linking two existing with installation id w/ op', done => {
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

  // TODO: Look at additional tests from installation_collection_test.go:882
  // TODO: Do we need to support _tombstone disabling of installations?
  // TODO: Test deletion, badge increments
});
