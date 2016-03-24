'use strict';

var httpRequest = require("../src/cloud-code/httpRequest"),
    bodyParser = require('body-parser'),
    express = require("express");

var port = 13371;
var httpRequestServer = "http://localhost:"+port;

var app = express();
app.use(bodyParser.json({ 'type': '*/*' }));
app.get("/hello", function(req, res){
  res.json({response: "OK"});
});

app.get("/404", function(req, res){
  res.status(404);
  res.send("NO");
});

app.get("/301", function(req, res){
  res.status(301);
  res.location("/hello");
  res.send();
});

app.post('/echo', function(req, res){
  res.json(req.body);
});

app.get('/qs', function(req, res){
  res.json(req.query);
});

app.listen(13371);


describe("httpRequest", () => {
  
  it("should do /hello", (done) => {
    httpRequest({
      url: httpRequestServer+"/hello"
    }).then(function(httpResponse){
      expect(httpResponse.status).toBe(200);
      expect(httpResponse.buffer).toEqual(new Buffer('{"response":"OK"}'));
      expect(httpResponse.text).toEqual('{"response":"OK"}');
      expect(httpResponse.data.response).toEqual("OK");
      done();
    }, function(){
      fail("should not fail");
      done();
    })
  });
  
  it("should do /hello with callback and promises", (done) => {
    var calls = 0;
    httpRequest({
      url: httpRequestServer+"/hello",
      success: function() { calls++; },
      error: function() { calls++; }
    }).then(function(httpResponse){
      expect(calls).toBe(1);
      expect(httpResponse.status).toBe(200);
      expect(httpResponse.buffer).toEqual(new Buffer('{"response":"OK"}'));
      expect(httpResponse.text).toEqual('{"response":"OK"}');
      expect(httpResponse.data.response).toEqual("OK");
      done();
    }, function(){
      fail("should not fail");
      done();
    })
  });
  
  it("should do not follow redirects by default", (done) => {

    httpRequest({
      url: httpRequestServer+"/301"
    }).then(function(httpResponse){
      expect(httpResponse.status).toBe(301);
      done();
    }, function(){
      fail("should not fail");
      done();
    })
  });
  
  it("should follow redirects when set", (done) => {

    httpRequest({
      url: httpRequestServer+"/301",
      followRedirects: true
    }).then(function(httpResponse){
      expect(httpResponse.status).toBe(200);
      expect(httpResponse.buffer).toEqual(new Buffer('{"response":"OK"}'));
      expect(httpResponse.text).toEqual('{"response":"OK"}');
      expect(httpResponse.data.response).toEqual("OK");
      done();
    }, function(){
      fail("should not fail");
      done();
    })
  });
  
  it("should fail on 404", (done) => {
    var calls = 0;
    httpRequest({
      url: httpRequestServer+"/404",
      success: function() { 
        calls++;
        fail("should not succeed");
        done();
      },
      error: function(httpResponse) { 
        calls++;
        expect(calls).toBe(1);
        expect(httpResponse.status).toBe(404);
        expect(httpResponse.buffer).toEqual(new Buffer('NO'));
        expect(httpResponse.text).toEqual('NO');
        expect(httpResponse.data).toBe(undefined);
        done();
      }
    });
  })
  
  it("should fail on 404", (done) => {
    httpRequest({
      url: httpRequestServer+"/404",
    }).then(function(httpResponse){
      fail("should not succeed");
      done();
    }, function(httpResponse){
      expect(httpResponse.status).toBe(404);
      expect(httpResponse.buffer).toEqual(new Buffer('NO'));
      expect(httpResponse.text).toEqual('NO');
      expect(httpResponse.data).toBe(undefined);
      done();
    })
  })
  
  it("should post on echo", (done) => {
    var calls = 0;
    httpRequest({
      method: "POST",
      url: httpRequestServer+"/echo",
      body: {
         foo: "bar"
      },
      headers: {
        'Content-Type': 'application/json'
      },
      success: function() { calls++; },
      error: function() { calls++; }
    }).then(function(httpResponse){
      expect(calls).toBe(1);
      expect(httpResponse.status).toBe(200);
      expect(httpResponse.data).toEqual({foo: "bar"});
      done();
    }, function(httpResponse){
      fail("should not fail");
      done();
    })
  });
  
  it("should encode a query string body by default", (done) => {
    let options = {
      body: {"foo": "bar"}, 
    }
    let result = httpRequest.encodeBody(options);
    expect(result.body).toEqual('foo=bar');
    expect(result.headers['Content-Type']).toEqual('application/x-www-form-urlencoded');
    done();
    
  })
  
  it("should encode a JSON body", (done) => {
    let options = {
      body: {"foo": "bar"}, 
      headers: {'Content-Type': 'application/json'}
    }
    let result = httpRequest.encodeBody(options);
    expect(result.body).toEqual('{"foo":"bar"}');
    done();
    
  })
   it("should encode a www-form body", (done) => {
    let options = {
      body: {"foo": "bar", "bar": "baz"},
      headers: {'cOntent-tYpe': 'application/x-www-form-urlencoded'}
    }
    let result = httpRequest.encodeBody(options);
    expect(result.body).toEqual("foo=bar&bar=baz");
    done();
  });
  it("should not encode a wrong content type", (done) => {
    let options = {
      body:{"foo": "bar", "bar": "baz"}, 
      headers: {'cOntent-tYpe': 'mime/jpeg'}
    }
    let result = httpRequest.encodeBody(options);
    expect(result.body).toEqual({"foo": "bar", "bar": "baz"});
    done();
  });

  it("should fail gracefully", (done) => {
    httpRequest({
      url: "http://not a good url",
      success: function() { 
        fail("should not succeed");
        done();
      },
      error: function(error) { 
        expect(error).not.toBeUndefined();
        expect(error).not.toBeNull();
        done();
      }
    });
  });
  
  it('should get a cat image', (done) => {
    httpRequest({
      url: 'http://thecatapi.com/api/images/get?format=src&type=jpg',
      followRedirects: true
    }).then((res) => {
      expect(res.buffer).not.toBe(null);
      expect(res.text).not.toBe(null);
      done();
    })
  })

  it("should params object to query string", (done) => {
    httpRequest({
      url: httpRequestServer+"/qs",
      params: {
         foo: "bar"
      }
    }).then(function(httpResponse){
      expect(httpResponse.status).toBe(200);
      expect(httpResponse.data).toEqual({foo: "bar"});
      done();
    }, function(){
      fail("should not fail");
      done();
    })
  });

  it("should params string to query string", (done) => {
    httpRequest({
      url: httpRequestServer+"/qs",
      params: "foo=bar&foo2=bar2"
    }).then(function(httpResponse){
      expect(httpResponse.status).toBe(200);
      expect(httpResponse.data).toEqual({foo: "bar", foo2: 'bar2'});
      done();
    }, function(){
      fail("should not fail");
      done();
    })
  });

});
