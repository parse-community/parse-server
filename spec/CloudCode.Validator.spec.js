'use strict';
const Parse = require('parse/node');
const validatorFail = () => {
  throw 'you are not authorized';
};
const validatorSuccess = () => {
  return true;
};

describe('cloud validator', () => {
  it('complete validator', async done => {
    Parse.Cloud.define(
      'myFunction',
      () => {
        return 'myFunc';
      },
      () => {}
    );
    try {
      const result = await Parse.Cloud.run('myFunction', {});
      expect(result).toBe('myFunc');
      done();
    } catch (e) {
      fail('should not have thrown error');
    }
  });

  it('Throw from validator', async done => {
    Parse.Cloud.define(
      'myFunction',
      () => {
        return 'myFunc';
      },
      () => {
        throw 'error';
      }
    );
    try {
      await Parse.Cloud.run('myFunction');
      fail('cloud function should have failed.');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.VALIDATION_ERROR);
      done();
    }
  });

  it('validator can throw parse error', async done => {
    Parse.Cloud.define(
      'myFunction',
      () => {
        return 'myFunc';
      },
      () => {
        throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'It should fail');
      }
    );
    try {
      await Parse.Cloud.run('myFunction');
      fail('should have validation error');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.SCRIPT_FAILED);
      expect(e.message).toBe('It should fail');
      done();
    }
  });

  it('validator can throw parse error with no message', async done => {
    Parse.Cloud.define(
      'myFunction',
      () => {
        return 'myFunc';
      },
      () => {
        throw new Parse.Error(Parse.Error.SCRIPT_FAILED);
      }
    );
    try {
      await Parse.Cloud.run('myFunction');
      fail('should have validation error');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.SCRIPT_FAILED);
      expect(e.message).toBeUndefined();
      done();
    }
  });

  it('async validator', async done => {
    Parse.Cloud.define(
      'myFunction',
      () => {
        return 'myFunc';
      },
      async () => {
        await new Promise(resolve => {
          setTimeout(resolve, 1000);
        });
        throw 'async error';
      }
    );
    try {
      await Parse.Cloud.run('myFunction');
      fail('should have validation error');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.VALIDATION_ERROR);
      expect(e.message).toBe('async error');
      done();
    }
  });

  it('pass function to validator', async done => {
    const validator = request => {
      expect(request).toBeDefined();
      expect(request.params).toBeDefined();
      expect(request.master).toBe(false);
      expect(request.user).toBeUndefined();
      expect(request.installationId).toBeDefined();
      expect(request.log).toBeDefined();
      expect(request.headers).toBeDefined();
      expect(request.functionName).toBeDefined();
      expect(request.context).toBeDefined();
      done();
    };
    Parse.Cloud.define(
      'myFunction',
      () => {
        return 'myFunc';
      },
      validator
    );
    await Parse.Cloud.run('myFunction');
  });

  it('require user on cloud functions', async done => {
    Parse.Cloud.define(
      'hello1',
      () => {
        return 'Hello world!';
      },
      {
        requireUser: true,
      }
    );
    try {
      await Parse.Cloud.run('hello1', {});
      fail('function should have failed.');
    } catch (error) {
      expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
      expect(error.message).toEqual('Validation failed. Please login to continue.');
      done();
    }
  });

  it('require master on cloud functions', done => {
    Parse.Cloud.define(
      'hello2',
      () => {
        return 'Hello world!';
      },
      {
        requireMaster: true,
      }
    );
    Parse.Cloud.run('hello2', {})
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual(
          'Validation failed. Master key is required to complete this request.'
        );
        done();
      });
  });

  it('set params on cloud functions', done => {
    Parse.Cloud.define(
      'hello',
      () => {
        return 'Hello world!';
      },
      {
        fields: ['a'],
      }
    );
    Parse.Cloud.run('hello', {})
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. Please specify data for a.');
        done();
      });
  });

  it('set params on cloud functions', done => {
    Parse.Cloud.define(
      'hello',
      () => {
        return 'Hello world!';
      },
      {
        fields: ['a'],
      }
    );
    Parse.Cloud.run('hello', {})
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. Please specify data for a.');
        done();
      });
  });

  it('allow params on cloud functions', done => {
    Parse.Cloud.define(
      'hello',
      req => {
        expect(req.params.a).toEqual('yolo');
        return 'Hello world!';
      },
      {
        fields: ['a'],
      }
    );
    Parse.Cloud.run('hello', { a: 'yolo' })
      .then(() => {
        done();
      })
      .catch(() => {
        fail('Error should not have been called.');
      });
  });

  it('set params type array', done => {
    Parse.Cloud.define(
      'hello',
      () => {
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            type: Array,
          },
        },
      }
    );
    Parse.Cloud.run('hello', { data: '' })
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. Invalid type for data. Expected: array');
        done();
      });
  });

  it('set params type allow array', async () => {
    Parse.Cloud.define(
      'hello',
      () => {
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            type: Array,
          },
        },
      }
    );
    const result = await Parse.Cloud.run('hello', { data: [{ foo: 'bar' }] });
    expect(result).toBe('Hello world!');
  });

  it('set params type', done => {
    Parse.Cloud.define(
      'hello',
      () => {
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            type: String,
          },
        },
      }
    );
    Parse.Cloud.run('hello', { data: [] })
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. Invalid type for data. Expected: string');
        done();
      });
  });

  it('set params default', done => {
    Parse.Cloud.define(
      'hello',
      req => {
        expect(req.params.data).toBe('yolo');
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            type: String,
            default: 'yolo',
          },
        },
      }
    );
    Parse.Cloud.run('hello')
      .then(() => {
        done();
      })
      .catch(() => {
        fail('function should not have failed.');
      });
  });

  it('set params required', done => {
    Parse.Cloud.define(
      'hello',
      req => {
        expect(req.params.data).toBe('yolo');
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            type: String,
            required: true,
          },
        },
      }
    );
    Parse.Cloud.run('hello', {})
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. Please specify data for data.');
        done();
      });
  });

  it('set params not-required options data', done => {
    Parse.Cloud.define(
      'hello',
      req => {
        expect(req.params.data).toBe('abc');
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            type: String,
            required: false,
            options: s => {
              return s.length >= 4 && s.length <= 50;
            },
            error: 'Validation failed. Expected length of data to be between 4 and 50.',
          },
        },
      }
    );
    Parse.Cloud.run('hello', { data: 'abc' })
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual(
          'Validation failed. Expected length of data to be between 4 and 50.'
        );
        done();
      });
  });

  it('set params not-required type', done => {
    Parse.Cloud.define(
      'hello',
      req => {
        expect(req.params.data).toBe(null);
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            type: String,
            required: false,
          },
        },
      }
    );
    Parse.Cloud.run('hello', { data: null })
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. Invalid type for data. Expected: string');
        done();
      });
  });

  it('set params not-required options', done => {
    Parse.Cloud.define(
      'hello',
      () => {
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            type: String,
            required: false,
            options: s => {
              return s.length >= 4 && s.length <= 50;
            },
          },
        },
      }
    );
    Parse.Cloud.run('hello', {})
      .then(() => {
        done();
      })
      .catch(() => {
        fail('function should not have failed.');
      });
  });

  it('set params not-required no-options', done => {
    Parse.Cloud.define(
      'hello',
      () => {
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            type: String,
            required: false,
          },
        },
      }
    );
    Parse.Cloud.run('hello', {})
      .then(() => {
        done();
      })
      .catch(() => {
        fail('function should not have failed.');
      });
  });

  it('set params option', done => {
    Parse.Cloud.define(
      'hello',
      req => {
        expect(req.params.data).toBe('yolo');
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            type: String,
            required: true,
            options: 'a',
          },
        },
      }
    );
    Parse.Cloud.run('hello', { data: 'f' })
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. Invalid option for data. Expected: a');
        done();
      });
  });

  it('set params options', done => {
    Parse.Cloud.define(
      'hello',
      req => {
        expect(req.params.data).toBe('yolo');
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            type: String,
            required: true,
            options: ['a', 'b'],
          },
        },
      }
    );
    Parse.Cloud.run('hello', { data: 'f' })
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. Invalid option for data. Expected: a, b');
        done();
      });
  });

  it('set params options function', done => {
    Parse.Cloud.define(
      'hello',
      () => {
        fail('cloud function should not run.');
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            type: Number,
            required: true,
            options: val => {
              return val > 1 && val < 5;
            },
            error: 'Validation failed. Expected data to be between 1 and 5.',
          },
        },
      }
    );
    Parse.Cloud.run('hello', { data: 7 })
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. Expected data to be between 1 and 5.');
        done();
      });
  });

  it('can run params function on null', done => {
    Parse.Cloud.define(
      'hello',
      () => {
        fail('cloud function should not run.');
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            options: val => {
              return val.length > 5;
            },
            error: 'Validation failed. String should be at least 5 characters',
          },
        },
      }
    );
    Parse.Cloud.run('hello', { data: null })
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. String should be at least 5 characters');
        done();
      });
  });

  it('can throw from options validator', done => {
    Parse.Cloud.define(
      'hello',
      () => {
        fail('cloud function should not run.');
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            options: () => {
              throw 'validation failed.';
            },
          },
        },
      }
    );
    Parse.Cloud.run('hello', { data: 'a' })
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('validation failed.');
        done();
      });
  });

  it('can throw null from options validator', done => {
    Parse.Cloud.define(
      'hello',
      () => {
        fail('cloud function should not run.');
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            options: () => {
              throw null;
            },
          },
        },
      }
    );
    Parse.Cloud.run('hello', { data: 'a' })
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. Invalid value for data.');
        done();
      });
  });

  it('can create functions', done => {
    Parse.Cloud.define(
      'hello',
      () => {
        return 'Hello world!';
      },
      {
        requireUser: false,
        requireMaster: false,
        fields: {
          data: {
            type: String,
          },
          data1: {
            type: String,
            default: 'default',
          },
        },
      }
    );
    Parse.Cloud.run('hello', { data: 'str' }).then(result => {
      expect(result).toEqual('Hello world!');
      done();
    });
  });

  it('basic beforeSave requireUserKey', async function (done) {
    Parse.Cloud.beforeSave('BeforeSaveFail', () => {}, {
      requireUser: true,
      requireUserKeys: ['name'],
    });
    const user = await Parse.User.signUp('testuser', 'p@ssword');
    user.set('name', 'foo');
    await user.save(null, { sessionToken: user.getSessionToken() });
    const obj = new Parse.Object('BeforeSaveFail');
    obj.set('foo', 'bar');
    await obj.save(null, { sessionToken: user.getSessionToken() });
    expect(obj.get('foo')).toBe('bar');
    done();
  });

  it('basic beforeSave skipWithMasterKey', async function (done) {
    Parse.Cloud.beforeSave(
      'BeforeSave',
      () => {
        throw 'before save should have resolved using masterKey.';
      },
      {
        skipWithMasterKey: true,
      }
    );
    const obj = new Parse.Object('BeforeSave');
    obj.set('foo', 'bar');
    await obj.save(null, { useMasterKey: true });
    expect(obj.get('foo')).toBe('bar');
    done();
  });

  it('basic beforeFind skipWithMasterKey', async function (done) {
    Parse.Cloud.beforeFind(
      'beforeFind',
      () => {
        throw 'before find should have resolved using masterKey.';
      },
      {
        skipWithMasterKey: true,
      }
    );
    const obj = new Parse.Object('beforeFind');
    obj.set('foo', 'bar');
    await obj.save();
    expect(obj.get('foo')).toBe('bar');

    const query = new Parse.Query('beforeFind');
    const first = await query.first({ useMasterKey: true });
    expect(first).toBeDefined();
    expect(first.id).toBe(obj.id);
    done();
  });

  it('basic beforeDelete skipWithMasterKey', async function (done) {
    Parse.Cloud.beforeDelete(
      'beforeFind',
      () => {
        throw 'before find should have resolved using masterKey.';
      },
      {
        skipWithMasterKey: true,
      }
    );
    const obj = new Parse.Object('beforeFind');
    obj.set('foo', 'bar');
    await obj.save();
    expect(obj.get('foo')).toBe('bar');
    await obj.destroy({ useMasterKey: true });
    done();
  });

  it('basic beforeSaveFile skipWithMasterKey', async done => {
    Parse.Cloud.beforeSave(
      Parse.File,
      () => {
        throw 'beforeSaveFile should have resolved using master key.';
      },
      {
        skipWithMasterKey: true,
      }
    );
    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    const result = await file.save({ useMasterKey: true });
    expect(result).toBe(file);
    done();
  });

  it('beforeSave validateMasterKey and skipWithMasterKey fail', async function (done) {
    Parse.Cloud.beforeSave(
      'BeforeSave',
      () => {
        throw 'beforeSaveFile should have resolved using master key.';
      },
      {
        fields: ['foo'],
        validateMasterKey: true,
        skipWithMasterKey: true,
      }
    );

    const obj = new Parse.Object('BeforeSave');
    try {
      await obj.save(null, { useMasterKey: true });
      fail('function should have failed.');
    } catch (error) {
      expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
      expect(error.message).toEqual('Validation failed. Please specify data for foo.');
      done();
    }
  });

  it('beforeSave validateMasterKey and skipWithMasterKey success', async function (done) {
    Parse.Cloud.beforeSave(
      'BeforeSave',
      () => {
        throw 'beforeSaveFile should have resolved using master key.';
      },
      {
        fields: ['foo'],
        validateMasterKey: true,
        skipWithMasterKey: true,
      }
    );

    const obj = new Parse.Object('BeforeSave');
    obj.set('foo', 'bar');
    try {
      await obj.save(null, { useMasterKey: true });
      done();
    } catch (error) {
      fail('error should not have been called.');
    }
  });

  it('basic beforeSave requireUserKey on User Class', async function (done) {
    Parse.Cloud.beforeSave(Parse.User, () => {}, {
      requireUser: true,
      requireUserKeys: ['name'],
    });
    const user = new Parse.User();
    user.set('username', 'testuser');
    user.set('password', 'p@ssword');
    user.set('name', 'foo');
    expect(user.get('name')).toBe('foo');
    done();
  });

  it('basic beforeSave requireUserKey rejection', async function (done) {
    Parse.Cloud.beforeSave('BeforeSaveFail', () => {}, {
      requireUser: true,
      requireUserKeys: ['name'],
    });
    const user = await Parse.User.signUp('testuser', 'p@ssword');
    const obj = new Parse.Object('BeforeSaveFail');
    obj.set('foo', 'bar');
    try {
      await obj.save(null, { sessionToken: user.getSessionToken() });
      fail('should not have been able to save without userkey');
    } catch (error) {
      expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
      expect(error.message).toEqual('Validation failed. Please set data for name on your account.');
      done();
    }
  });

  it('basic beforeSave requireUserKey without user', async function (done) {
    Parse.Cloud.beforeSave('BeforeSaveFail', () => {}, {
      requireUserKeys: ['name'],
    });
    const obj = new Parse.Object('BeforeSaveFail');
    obj.set('foo', 'bar');
    try {
      await obj.save();
      fail('should not have been able to save without user');
    } catch (error) {
      expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
      expect(error.message).toEqual('Please login to make this request.');
      done();
    }
  });

  it('basic beforeSave requireUserKey as admin', async function (done) {
    Parse.Cloud.beforeSave(Parse.User, () => {}, {
      fields: {
        admin: {
          default: false,
          constant: true,
        },
      },
    });
    Parse.Cloud.define(
      'secureFunction',
      () => {
        return "Here's all the secure data!";
      },
      {
        requireUserKeys: {
          admin: {
            options: true,
            error: 'Unauthorized.',
          },
        },
      }
    );
    const user = new Parse.User();
    user.set('username', 'testuser');
    user.set('password', 'p@ssword');
    user.set('admin', true);
    await user.signUp();
    expect(user.get('admin')).toBe(false);
    try {
      await Parse.Cloud.run('secureFunction');
      fail('function should only be available to admin users');
    } catch (error) {
      expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
      expect(error.message).toEqual('Unauthorized.');
    }
    done();
  });

  it('basic beforeSave requireUserKey as custom function', async function (done) {
    Parse.Cloud.beforeSave(Parse.User, () => {}, {
      fields: {
        accType: {
          default: 'normal',
          constant: true,
        },
      },
    });
    Parse.Cloud.define(
      'secureFunction',
      () => {
        return "Here's all the secure data!";
      },
      {
        requireUserKeys: {
          accType: {
            options: val => {
              return ['admin', 'admin2'].includes(val);
            },
            error: 'Unauthorized.',
          },
        },
      }
    );
    const user = new Parse.User();
    user.set('username', 'testuser');
    user.set('password', 'p@ssword');
    user.set('accType', 'admin');
    await user.signUp();
    expect(user.get('accType')).toBe('normal');
    try {
      await Parse.Cloud.run('secureFunction');
      fail('function should only be available to admin users');
    } catch (error) {
      expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
      expect(error.message).toEqual('Unauthorized.');
    }
    done();
  });

  it('basic beforeSave allow requireUserKey as custom function', async function (done) {
    Parse.Cloud.beforeSave(Parse.User, () => {}, {
      fields: {
        accType: {
          default: 'admin',
          constant: true,
        },
      },
    });
    Parse.Cloud.define(
      'secureFunction',
      () => {
        return "Here's all the secure data!";
      },
      {
        requireUserKeys: {
          accType: {
            options: val => {
              return ['admin', 'admin2'].includes(val);
            },
            error: 'Unauthorized.',
          },
        },
      }
    );
    const user = new Parse.User();
    user.set('username', 'testuser');
    user.set('password', 'p@ssword');
    await user.signUp();
    expect(user.get('accType')).toBe('admin');
    const result = await Parse.Cloud.run('secureFunction');
    expect(result).toBe("Here's all the secure data!");
    done();
  });

  it('basic beforeSave requireUser', function (done) {
    Parse.Cloud.beforeSave('BeforeSaveFail', () => {}, {
      requireUser: true,
    });

    const obj = new Parse.Object('BeforeSaveFail');
    obj.set('foo', 'bar');
    obj
      .save()
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. Please login to continue.');
        done();
      });
  });

  it('basic validator requireAnyUserRoles', async function (done) {
    Parse.Cloud.define(
      'cloudFunction',
      () => {
        return true;
      },
      {
        requireUser: true,
        requireAnyUserRoles: ['Admin'],
      }
    );
    const user = await Parse.User.signUp('testuser', 'p@ssword');
    try {
      await Parse.Cloud.run('cloudFunction');
      fail('cloud validator should have failed.');
    } catch (e) {
      expect(e.message).toBe('Validation failed. User does not match the required roles.');
    }
    const roleACL = new Parse.ACL();
    roleACL.setPublicReadAccess(true);
    const role = new Parse.Role('Admin', roleACL);
    role.getUsers().add(user);
    await role.save({ useMasterKey: true });
    await Parse.Cloud.run('cloudFunction');
    done();
  });

  it('basic validator requireAllUserRoles', async function (done) {
    Parse.Cloud.define(
      'cloudFunction',
      () => {
        return true;
      },
      {
        requireUser: true,
        requireAllUserRoles: ['Admin', 'Admin2'],
      }
    );
    const user = await Parse.User.signUp('testuser', 'p@ssword');
    try {
      await Parse.Cloud.run('cloudFunction');
      fail('cloud validator should have failed.');
    } catch (e) {
      expect(e.message).toBe('Validation failed. User does not match all the required roles.');
    }
    const roleACL = new Parse.ACL();
    roleACL.setPublicReadAccess(true);
    const role = new Parse.Role('Admin', roleACL);
    role.getUsers().add(user);

    const role2 = new Parse.Role('Admin2', roleACL);
    role2.getUsers().add(user);
    await role.save({ useMasterKey: true });
    await role2.save({ useMasterKey: true });
    await Parse.Cloud.run('cloudFunction');
    done();
  });

  it('allow requireAnyUserRoles to be a function', async function (done) {
    Parse.Cloud.define(
      'cloudFunction',
      () => {
        return true;
      },
      {
        requireUser: true,
        requireAnyUserRoles: () => {
          return ['Admin Func'];
        },
      }
    );
    const user = await Parse.User.signUp('testuser', 'p@ssword');
    try {
      await Parse.Cloud.run('cloudFunction');
      fail('cloud validator should have failed.');
    } catch (e) {
      expect(e.message).toBe('Validation failed. User does not match the required roles.');
    }
    const roleACL = new Parse.ACL();
    roleACL.setPublicReadAccess(true);
    const role = new Parse.Role('Admin Func', roleACL);
    role.getUsers().add(user);
    await role.save({ useMasterKey: true });
    await Parse.Cloud.run('cloudFunction');
    done();
  });

  it('allow requireAllUserRoles to be a function', async function (done) {
    Parse.Cloud.define(
      'cloudFunction',
      () => {
        return true;
      },
      {
        requireUser: true,
        requireAllUserRoles: () => {
          return ['AdminA', 'AdminB'];
        },
      }
    );
    const user = await Parse.User.signUp('testuser', 'p@ssword');
    try {
      await Parse.Cloud.run('cloudFunction');
      fail('cloud validator should have failed.');
    } catch (e) {
      expect(e.message).toBe('Validation failed. User does not match all the required roles.');
    }
    const roleACL = new Parse.ACL();
    roleACL.setPublicReadAccess(true);
    const role = new Parse.Role('AdminA', roleACL);
    role.getUsers().add(user);

    const role2 = new Parse.Role('AdminB', roleACL);
    role2.getUsers().add(user);
    await role.save({ useMasterKey: true });
    await role2.save({ useMasterKey: true });
    await Parse.Cloud.run('cloudFunction');
    done();
  });

  it('basic requireAllUserRoles but no user', async function (done) {
    Parse.Cloud.define(
      'cloudFunction',
      () => {
        return true;
      },
      {
        requireAllUserRoles: ['Admin'],
      }
    );
    try {
      await Parse.Cloud.run('cloudFunction');
      fail('cloud validator should have failed.');
    } catch (e) {
      expect(e.message).toBe('Validation failed. Please login to continue.');
    }
    const user = await Parse.User.signUp('testuser', 'p@ssword');
    const roleACL = new Parse.ACL();
    roleACL.setPublicReadAccess(true);
    const role = new Parse.Role('Admin', roleACL);
    role.getUsers().add(user);
    await role.save({ useMasterKey: true });
    await Parse.Cloud.run('cloudFunction');
    done();
  });

  it('basic beforeSave requireMaster', function (done) {
    Parse.Cloud.beforeSave('BeforeSaveFail', () => {}, {
      requireMaster: true,
    });

    const obj = new Parse.Object('BeforeSaveFail');
    obj.set('foo', 'bar');
    obj
      .save()
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual(
          'Validation failed. Master key is required to complete this request.'
        );
        done();
      });
  });

  it('basic beforeSave master', async function (done) {
    Parse.Cloud.beforeSave('BeforeSaveFail', () => {}, {
      requireUser: true,
    });

    const obj = new Parse.Object('BeforeSaveFail');
    obj.set('foo', 'bar');
    await obj.save(null, { useMasterKey: true });
    done();
  });

  it('basic beforeSave validateMasterKey', function (done) {
    Parse.Cloud.beforeSave('BeforeSaveFail', () => {}, {
      requireUser: true,
      validateMasterKey: true,
    });

    const obj = new Parse.Object('BeforeSaveFail');
    obj.set('foo', 'bar');
    obj
      .save(null, { useMasterKey: true })
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. Please login to continue.');
        done();
      });
  });

  it('basic beforeSave requireKeys', function (done) {
    Parse.Cloud.beforeSave('beforeSaveRequire', () => {}, {
      fields: {
        foo: {
          required: true,
        },
        bar: {
          required: true,
        },
      },
    });
    const obj = new Parse.Object('beforeSaveRequire');
    obj.set('foo', 'bar');
    obj
      .save()
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual('Validation failed. Please specify data for bar.');
        done();
      });
  });

  it('basic beforeSave constantKeys', async function (done) {
    Parse.Cloud.beforeSave('BeforeSave', () => {}, {
      fields: {
        foo: {
          constant: true,
          default: 'bar',
        },
      },
    });
    const obj = new Parse.Object('BeforeSave');
    obj.set('foo', 'far');
    await obj.save();
    expect(obj.get('foo')).toBe('bar');
    obj.set('foo', 'yolo');
    await obj.save();
    expect(obj.get('foo')).toBe('bar');
    done();
  });

  it('basic beforeSave defaultKeys', async function (done) {
    Parse.Cloud.beforeSave('BeforeSave', () => {}, {
      fields: {
        foo: {
          default: 'bar',
        },
      },
    });
    const obj = new Parse.Object('BeforeSave');
    await obj.save();
    expect(obj.get('foo')).toBe('bar');
    obj.set('foo', 'yolo');
    await obj.save();
    expect(obj.get('foo')).toBe('yolo');
    done();
  });

  it('validate beforeSave', async done => {
    Parse.Cloud.beforeSave('MyObject', () => {}, validatorSuccess);

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    try {
      await myObject.save();
      done();
    } catch (e) {
      fail('before save should not have failed.');
    }
  });

  it('validate beforeSave fail', async done => {
    Parse.Cloud.beforeSave('MyObject', () => {}, validatorFail);

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    try {
      await myObject.save();
      fail('cloud function should have failed.');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.VALIDATION_ERROR);
      done();
    }
  });

  it('validate afterSave', async done => {
    Parse.Cloud.afterSave(
      'MyObject',
      () => {
        done();
      },
      validatorSuccess
    );

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    try {
      await myObject.save();
    } catch (e) {
      fail('before save should not have failed.');
    }
  });

  it('validate afterSave fail', async done => {
    Parse.Cloud.afterSave(
      'MyObject',
      () => {
        fail('this should not be called.');
      },
      validatorFail
    );

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    await myObject.save();
    setTimeout(() => {
      done();
    }, 1000);
  });

  it('validate beforeDelete', async done => {
    Parse.Cloud.beforeDelete('MyObject', () => {}, validatorSuccess);

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    await myObject.save();
    try {
      await myObject.destroy();
      done();
    } catch (e) {
      fail('before delete should not have failed.');
    }
  });

  it('validate beforeDelete fail', async done => {
    Parse.Cloud.beforeDelete(
      'MyObject',
      () => {
        fail('this should not be called.');
      },
      validatorFail
    );

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    await myObject.save();
    try {
      await myObject.destroy();
      fail('cloud function should have failed.');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.VALIDATION_ERROR);
      done();
    }
  });

  it('validate afterDelete', async done => {
    Parse.Cloud.afterDelete(
      'MyObject',
      () => {
        done();
      },
      validatorSuccess
    );

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    await myObject.save();
    try {
      await myObject.destroy();
    } catch (e) {
      fail('after delete should not have failed.');
    }
  });

  it('validate afterDelete fail', async done => {
    Parse.Cloud.afterDelete(
      'MyObject',
      () => {
        fail('this should not be called.');
      },
      validatorFail
    );

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    await myObject.save();
    try {
      await myObject.destroy();
      fail('cloud function should have failed.');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.VALIDATION_ERROR);
      done();
    }
  });

  it('validate beforeFind', async done => {
    Parse.Cloud.beforeFind('MyObject', () => {}, validatorSuccess);
    try {
      const MyObject = Parse.Object.extend('MyObject');
      const myObjectQuery = new Parse.Query(MyObject);
      await myObjectQuery.find();
      done();
    } catch (e) {
      fail('beforeFind should not have failed.');
    }
  });
  it('validate beforeFind fail', async done => {
    Parse.Cloud.beforeFind('MyObject', () => {}, validatorFail);
    try {
      const MyObject = Parse.Object.extend('MyObject');
      const myObjectQuery = new Parse.Query(MyObject);
      await myObjectQuery.find();
      fail('cloud function should have failed.');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.VALIDATION_ERROR);
      done();
    }
  });

  it('validate afterFind', async done => {
    Parse.Cloud.afterFind('MyObject', () => {}, validatorSuccess);

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    await myObject.save();
    try {
      const myObjectQuery = new Parse.Query(MyObject);
      await myObjectQuery.find();
      done();
    } catch (e) {
      fail('beforeFind should not have failed.');
    }
  });

  it('validate afterFind fail', async done => {
    Parse.Cloud.afterFind('MyObject', () => {}, validatorFail);

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    await myObject.save();
    try {
      const myObjectQuery = new Parse.Query(MyObject);
      await myObjectQuery.find();
      fail('cloud function should have failed.');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.VALIDATION_ERROR);
      done();
    }
  });

  it('validate beforeSaveFile', async done => {
    Parse.Cloud.beforeSave(Parse.File, () => {}, validatorSuccess);

    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    const result = await file.save({ useMasterKey: true });
    expect(result).toBe(file);
    done();
  });

  it('validate beforeSaveFile fail', async done => {
    Parse.Cloud.beforeSave(Parse.File, () => {}, validatorFail);
    try {
      const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
      await file.save({ useMasterKey: true });
      fail('cloud function should have failed.');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.VALIDATION_ERROR);
      done();
    }
  });

  it('validate afterSaveFile', async done => {
    Parse.Cloud.afterSave(Parse.File, () => {}, validatorSuccess);

    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    const result = await file.save({ useMasterKey: true });
    expect(result).toBe(file);
    done();
  });

  it('validate afterSaveFile fail', async done => {
    Parse.Cloud.beforeSave(Parse.File, () => {}, validatorFail);
    try {
      const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
      await file.save({ useMasterKey: true });
      fail('cloud function should have failed.');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.VALIDATION_ERROR);
      done();
    }
  });

  it('validate beforeDeleteFile', async done => {
    Parse.Cloud.beforeDelete(Parse.File, () => {}, validatorSuccess);

    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    await file.save();
    await file.destroy();
    done();
  });

  it('validate beforeDeleteFile fail', async done => {
    Parse.Cloud.beforeDelete(Parse.File, () => {}, validatorFail);
    try {
      const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
      await file.save();
      await file.destroy();
      fail('cloud function should have failed.');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.VALIDATION_ERROR);
      done();
    }
  });

  it('validate afterDeleteFile', async done => {
    Parse.Cloud.afterDelete(Parse.File, () => {}, validatorSuccess);

    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    await file.save();
    await file.destroy();
    done();
  });

  it('validate afterDeleteFile fail', async done => {
    Parse.Cloud.afterDelete(Parse.File, () => {}, validatorFail);
    try {
      const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
      await file.save();
      await file.destroy();
      fail('cloud function should have failed.');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.VALIDATION_ERROR);
      done();
    }
  });

  it('Should have validator', async done => {
    Parse.Cloud.define(
      'myFunction',
      () => {},
      () => {
        throw 'error';
      }
    );
    try {
      await Parse.Cloud.run('myFunction');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.VALIDATION_ERROR);
      done();
    }
  });

  it('does not log on valid config', () => {
    Parse.Cloud.define('myFunction', () => {}, {
      requireUser: true,
      requireMaster: true,
      validateMasterKey: false,
      skipWithMasterKey: true,
      requireUserKeys: {
        Acc: {
          constant: true,
          options: ['A', 'B'],
          required: true,
          default: 'f',
          error: 'a',
          type: String,
        },
      },
      fields: {
        Acc: {
          constant: true,
          options: ['A', 'B'],
          required: true,
          default: 'f',
          error: 'a',
          type: String,
        },
      },
    });
  });
  it('Logs on invalid config', () => {
    const fields = [
      {
        field: 'requiredUser',
        value: true,
        error: 'requiredUser is not a supported parameter for Cloud Function validations.',
      },
      {
        field: 'requireUser',
        value: [],
        error:
          'Invalid type for Cloud Function validation key requireUser. Expected boolean, actual array',
      },
      {
        field: 'requireMaster',
        value: [],
        error:
          'Invalid type for Cloud Function validation key requireMaster. Expected boolean, actual array',
      },
      {
        field: 'validateMasterKey',
        value: [],
        error:
          'Invalid type for Cloud Function validation key validateMasterKey. Expected boolean, actual array',
      },
      {
        field: 'skipWithMasterKey',
        value: [],
        error:
          'Invalid type for Cloud Function validation key skipWithMasterKey. Expected boolean, actual array',
      },
      {
        field: 'requireAllUserRoles',
        value: true,
        error:
          'Invalid type for Cloud Function validation key requireAllUserRoles. Expected array|function, actual boolean',
      },
      {
        field: 'requireAnyUserRoles',
        value: true,
        error:
          'Invalid type for Cloud Function validation key requireAnyUserRoles. Expected array|function, actual boolean',
      },
      {
        field: 'fields',
        value: true,
        error:
          'Invalid type for Cloud Function validation key fields. Expected array|object, actual boolean',
      },
      {
        field: 'requireUserKeys',
        value: true,
        error:
          'Invalid type for Cloud Function validation key requireUserKeys. Expected array|object, actual boolean',
      },
    ];
    for (const field of fields) {
      try {
        Parse.Cloud.define('myFunction', () => {}, {
          [field.field]: field.value,
        });
        fail(`Expected error registering invalid Cloud Function validation ${field.field}.`);
      } catch (e) {
        expect(e).toBe(field.error);
      }
    }
  });

  it('Logs on invalid config', () => {
    const fields = [
      {
        field: 'otherKey',
        value: true,
        error: 'otherKey is not a supported parameter for Cloud Function validations.',
      },
      {
        field: 'constant',
        value: [],
        error:
          'Invalid type for Cloud Function validation key constant. Expected boolean, actual array',
      },
      {
        field: 'required',
        value: [],
        error:
          'Invalid type for Cloud Function validation key required. Expected boolean, actual array',
      },
      {
        field: 'error',
        value: [],
        error:
          'Invalid type for Cloud Function validation key error. Expected string, actual array',
      },
    ];
    for (const field of fields) {
      try {
        Parse.Cloud.define('myFunction', () => {}, {
          fields: {
            name: {
              [field.field]: field.value,
            },
          },
        });
        fail(`Expected error registering invalid Cloud Function validation ${field.field}.`);
      } catch (e) {
        expect(e).toBe(field.error);
      }
      try {
        Parse.Cloud.define('myFunction', () => {}, {
          requireUserKeys: {
            name: {
              [field.field]: field.value,
            },
          },
        });
        fail(`Expected error registering invalid Cloud Function validation ${field.field}.`);
      } catch (e) {
        expect(e).toBe(field.error);
      }
    }
  });

  it('set params options function async', async () => {
    Parse.Cloud.define(
      'hello',
      () => {
        return 'Hello world!';
      },
      {
        fields: {
          data: {
            type: String,
            required: true,
            options: async val => {
              await new Promise(resolve => {
                setTimeout(resolve, 500);
              });
              return val === 'f';
            },
            error: 'Validation failed.',
          },
        },
      }
    );
    try {
      await Parse.Cloud.run('hello', { data: 'd' });
      fail('validation should have failed');
    } catch (error) {
      expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
      expect(error.message).toEqual('Validation failed.');
    }
    const result = await Parse.Cloud.run('hello', { data: 'f' });
    expect(result).toBe('Hello world!');
  });

  it('basic beforeSave requireUserKey as custom async function', async () => {
    Parse.Cloud.beforeSave(Parse.User, () => {}, {
      fields: {
        accType: {
          default: 'normal',
          constant: true,
        },
      },
    });
    Parse.Cloud.define(
      'secureFunction',
      () => {
        return "Here's all the secure data!";
      },
      {
        requireUserKeys: {
          accType: {
            options: async val => {
              await new Promise(resolve => {
                setTimeout(resolve, 500);
              });
              return ['admin', 'admin2'].includes(val);
            },
            error: 'Unauthorized.',
          },
        },
      }
    );
    const user = new Parse.User();
    user.set('username', 'testuser');
    user.set('password', 'p@ssword');
    user.set('accType', 'admin');
    await user.signUp();
    expect(user.get('accType')).toBe('normal');
    try {
      await Parse.Cloud.run('secureFunction');
      fail('function should only be available to admin users');
    } catch (error) {
      expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
      expect(error.message).toEqual('Unauthorized.');
    }
  });
});
