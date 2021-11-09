const request = require('../lib/request');

function createProduct() {
  const file = new Parse.File(
    'name',
    {
      base64: new Buffer('download_file', 'utf-8').toString('base64'),
    },
    'text'
  );
  return file.save().then(function () {
    const product = new Parse.Object('_Product');
    product.set({
      download: file,
      icon: file,
      title: 'a product',
      subtitle: 'a product',
      order: 1,
      productIdentifier: 'a-product',
    });
    return product.save();
  });
}

describe('test validate_receipt endpoint', () => {
  beforeEach(done => {
    createProduct()
      .then(done)
      .catch(function (err) {
        console.error({ err });
        done();
      });
  });

  it('should bypass appstore validation', async () => {
    const httpResponse = await request({
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      method: 'POST',
      url: 'http://localhost:8378/1/validate_purchase',
      body: {
        productIdentifier: 'a-product',
        receipt: {
          __type: 'Bytes',
          base64: new Buffer('receipt', 'utf-8').toString('base64'),
        },
        bypassAppStoreValidation: true,
      },
    });
    const body = httpResponse.data;
    if (typeof body != 'object') {
      fail('Body is not an object');
    } else {
      expect(body.__type).toEqual('File');
      const url = body.url;
      const otherResponse = await request({
        url: url,
      });
      expect(otherResponse.text).toBe('download_file');
    }
  });

  it('should fail for missing receipt', async () => {
    const response = await request({
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      url: 'http://localhost:8378/1/validate_purchase',
      method: 'POST',
      body: {
        productIdentifier: 'a-product',
        bypassAppStoreValidation: true,
      },
    }).then(fail, res => res);
    const body = response.data;
    expect(body.code).toEqual(Parse.Error.INVALID_JSON);
  });

  it('should fail for missing product identifier', async () => {
    const response = await request({
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      url: 'http://localhost:8378/1/validate_purchase',
      method: 'POST',
      body: {
        receipt: {
          __type: 'Bytes',
          base64: new Buffer('receipt', 'utf-8').toString('base64'),
        },
        bypassAppStoreValidation: true,
      },
    }).then(fail, res => res);
    const body = response.data;
    expect(body.code).toEqual(Parse.Error.INVALID_JSON);
  });

  it('should bypass appstore validation and not find product', async () => {
    const response = await request({
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      url: 'http://localhost:8378/1/validate_purchase',
      method: 'POST',
      body: {
        productIdentifier: 'another-product',
        receipt: {
          __type: 'Bytes',
          base64: new Buffer('receipt', 'utf8').toString('base64'),
        },
        bypassAppStoreValidation: true,
      },
    }).catch(error => error);
    const body = response.data;
    if (typeof body != 'object') {
      fail('Body is not an object');
    } else {
      expect(body.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
      expect(body.error).toEqual('Object not found.');
    }
  });

  it('should fail at appstore validation', async () => {
    const response = await request({
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      url: 'http://localhost:8378/1/validate_purchase',
      method: 'POST',
      body: {
        productIdentifier: 'a-product',
        receipt: {
          __type: 'Bytes',
          base64: new Buffer('receipt', 'utf-8').toString('base64'),
        },
      },
    });
    const body = response.data;
    if (typeof body != 'object') {
      fail('Body is not an object');
    } else {
      expect(body.status).toBe(21002);
      expect(body.error).toBe('The data in the receipt-data property was malformed or missing.');
    }
  });

  it('should not create a _Product', done => {
    const product = new Parse.Object('_Product');
    product.save().then(
      function () {
        fail('Should not be able to save');
        done();
      },
      function (err) {
        expect(err.code).toEqual(Parse.Error.INCORRECT_TYPE);
        done();
      }
    );
  });

  it('should be able to update a _Product', done => {
    const query = new Parse.Query('_Product');
    query
      .first()
      .then(function (product) {
        if (!product) {
          return Promise.reject(new Error('Product should be found'));
        }
        product.set('title', 'a new title');
        return product.save();
      })
      .then(function (productAgain) {
        expect(productAgain.get('downloadName')).toEqual(productAgain.get('download').name());
        expect(productAgain.get('title')).toEqual('a new title');
        done();
      })
      .catch(function (err) {
        fail(JSON.stringify(err));
        done();
      });
  });

  it('should not be able to remove a require key in a _Product', done => {
    const query = new Parse.Query('_Product');
    query
      .first()
      .then(function (product) {
        if (!product) {
          return Promise.reject(new Error('Product should be found'));
        }
        product.unset('title');
        return product.save();
      })
      .then(function () {
        fail('Should not succeed');
        done();
      })
      .catch(function (err) {
        expect(err.code).toEqual(Parse.Error.INCORRECT_TYPE);
        expect(err.message).toEqual('title is required.');
        done();
      });
  });
});
