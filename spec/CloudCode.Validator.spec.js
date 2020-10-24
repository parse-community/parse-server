'use strict';
const Parse = require('parse/node');
const validatorFail = () => {
  throw 'you are not authorized';
};
const validatorSuccess = () => {
  return true;
};

describe('cloud validator', () => {
  it('existing validator functionality', async done => {
    Parse.Cloud.define(
      'myFunction',
      () => {
        return 'myFunc';
      },
      () => {
        return false;
      }
    );
    try {
      await Parse.Cloud.run('myFunction', {});
      fail('should have thrown error');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.VALIDATION_ERROR);
      done();
    }
  });

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
      expect(e.message).toBe('Validation failed.');
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
          setTimeout(() => {
            resolve();
          }, 1000);
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

  it('require user on cloud functions', done => {
    Parse.Cloud.define(
      'hello1',
      () => {
        return 'Hello world!';
      },
      {
        requireUser: true,
      }
    );

    Parse.Cloud.run('hello1', {})
      .then(() => {
        fail('function should have failed.');
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.VALIDATION_ERROR);
        expect(error.message).toEqual(
          'Validation failed. Please login to continue.'
        );
        done();
      });
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
        expect(error.message).toEqual(
          'Validation failed. Please specify data for a.'
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
        expect(error.message).toEqual(
          'Validation failed. Please specify data for a.'
        );
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
        expect(error.message).toEqual(
          'Validation failed. Invalid type for data. Expected: string'
        );
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
        expect(error.message).toEqual(
          'Validation failed. Please specify data for data.'
        );
        done();
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
        expect(error.message).toEqual(
          'Validation failed. Invalid option for data. Expected: a'
        );
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
        expect(error.message).toEqual(
          'Validation failed. Invalid option for data. Expected: a, b'
        );
        done();
      });
  });

  it('set params options function', done => {
    Parse.Cloud.define(
      'hello',
      req => {
        expect(req.params.data).toBe('yolo');
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
        expect(error.message).toEqual(
          'Validation failed. Expected data to be between 1 and 5.'
        );
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
        expect(error.message).toEqual(
          'Validation failed. Please login to continue.'
        );
        done();
      });
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
        expect(error.message).toEqual(
          'Validation failed. Please specify data for bar.'
        );
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

  it('throw custom error from beforeSaveFile', async done => {
    Parse.Cloud.beforeSaveFile(() => {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'It should fail');
    });
    try {
      const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
      await file.save({ useMasterKey: true });
      fail('error should have thrown');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.SCRIPT_FAILED);
      done();
    }
  });

  it('validate beforeSaveFile', async done => {
    Parse.Cloud.beforeSaveFile(() => {}, validatorSuccess);

    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    const result = await file.save({ useMasterKey: true });
    expect(result).toBe(file);
    done();
  });

  it('validate beforeSaveFile fail', async done => {
    Parse.Cloud.beforeSaveFile(() => {}, validatorFail);
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
    Parse.Cloud.afterSaveFile(() => {}, validatorSuccess);

    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    const result = await file.save({ useMasterKey: true });
    expect(result).toBe(file);
    done();
  });

  it('validate afterSaveFile fail', async done => {
    Parse.Cloud.beforeSaveFile(() => {}, validatorFail);
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
    Parse.Cloud.beforeDeleteFile(() => {}, validatorSuccess);

    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    await file.save();
    await file.destroy();
    done();
  });

  it('validate beforeDeleteFile fail', async done => {
    Parse.Cloud.beforeDeleteFile(() => {}, validatorFail);
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
    Parse.Cloud.afterDeleteFile(() => {}, validatorSuccess);

    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    await file.save();
    await file.destroy();
    done();
  });

  it('validate afterDeleteFile fail', async done => {
    Parse.Cloud.afterDeleteFile(() => {}, validatorFail);
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
});
