var request = require("request");

function createProduct() {
  const file = new Parse.File("name", {
    base64: new Buffer("download_file", "utf-8").toString("base64")
  }, "text");
  return file.save().then(function(){
    var product = new Parse.Object("_Product");
    product.set({
      download: file,
      icon: file,
      title: "a product",
      subtitle: "a product",
      order: 1,
      productIdentifier: "a-product"
    })
    return product.save();
  })

}

describe("test validate_receipt endpoint", () => {
  beforeEach(done => {
    createProduct().then(done).fail(function(){
      done();
    });
  })

  it("should bypass appstore validation", (done) => {

    request.post({
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'},
      url: 'http://localhost:8378/1/validate_purchase',
      json: true,
      body: {
        productIdentifier: "a-product",
        receipt: {
          __type: "Bytes",
          base64: new Buffer("receipt", "utf-8").toString("base64")
        },
        bypassAppStoreValidation: true
      }
    }, function(err, res, body){
      if (typeof body != "object") {
        fail("Body is not an object");
        done();
      } else {
        expect(body.__type).toEqual("File");
        const url = body.url;
        request.get({
          url: url
        }, function(err, res, body) {
          expect(body).toEqual("download_file");
          done();
        });
      }
    });
  });

  it("should fail for missing receipt", (done) => {
    request.post({
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'},
      url: 'http://localhost:8378/1/validate_purchase',
      json: true,
      body: {
        productIdentifier: "a-product",
        bypassAppStoreValidation: true
      }
    }, function(err, res, body){
      if (typeof body != "object") {
        fail("Body is not an object");
        done();
      } else {
        expect(body.code).toEqual(Parse.Error.INVALID_JSON);
        done();
      }
    });
  });

  it("should fail for missing product identifier", (done) => {
    request.post({
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'},
      url: 'http://localhost:8378/1/validate_purchase',
      json: true,
      body: {
        receipt: {
          __type: "Bytes",
          base64: new Buffer("receipt", "utf-8").toString("base64")
        },
        bypassAppStoreValidation: true
      }
    }, function(err, res, body){
      if (typeof body != "object") {
        fail("Body is not an object");
        done();
      } else {
        expect(body.code).toEqual(Parse.Error.INVALID_JSON);
        done();
      }
    });
  });

  it("should bypass appstore validation and not find product", (done) => {

    request.post({
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'},
      url: 'http://localhost:8378/1/validate_purchase',
      json: true,
      body: {
        productIdentifier: "another-product",
        receipt: {
          __type: "Bytes",
          base64: new Buffer("receipt", "utf-8").toString("base64")
        },
        bypassAppStoreValidation: true
      }
    }, function(err, res, body){
      if (typeof body != "object") {
        fail("Body is not an object");
        done();
      } else {
        expect(body.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
        expect(body.error).toEqual('Object not found.');
        done();
      }
    });
  });

  it("should fail at appstore validation", done => {
    request.post({
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'},
      url: 'http://localhost:8378/1/validate_purchase',
      json: true,
      body: {
        productIdentifier: "a-product",
        receipt: {
          __type: "Bytes",
          base64: new Buffer("receipt", "utf-8").toString("base64")
        },
      }
    }, function(err, res, body){
      if (typeof body != "object") {
        fail("Body is not an object");
      } else {
        expect(body.status).toBe(21002);
        expect(body.error).toBe('The data in the receipt-data property was malformed or missing.');
      }
      done();
    });
  });

  it("should not create a _Product", (done) => {
    var product = new Parse.Object("_Product");
    product.save().then(function(){
      fail("Should not be able to save");
      done();
    }, function(err){
      expect(err.code).toEqual(Parse.Error.INCORRECT_TYPE);
      done();
    })
  });

  it("should be able to update a _Product", (done) => {
    var query = new Parse.Query("_Product");
    query.first().then(function(product) {
      if (!product) {
        return Promise.reject(new Error('Product should be found'));
      }
      product.set("title", "a new title");
      return product.save();
    }).then(function(productAgain){
      expect(productAgain.get('downloadName')).toEqual(productAgain.get('download').name());
      expect(productAgain.get("title")).toEqual("a new title");
      done();
    }).fail(function(err){
      fail(JSON.stringify(err));
      done();
    });
  });

  it("should not be able to remove a require key in a _Product", (done) => {
    var query = new Parse.Query("_Product");
    query.first().then(function(product){
      if (!product) {
        return Promise.reject(new Error('Product should be found'));
      }
      product.unset("title");
      return product.save();
    }).then(function(){
      fail("Should not succeed");
      done();
    }).fail(function(err){
      expect(err.code).toEqual(Parse.Error.INCORRECT_TYPE);
      expect(err.message).toEqual("title is required.");
      done();
    });
  });
});
