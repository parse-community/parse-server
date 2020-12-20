'use strict';

const httpRequest = require('../lib/cloud-code/httpRequest'),
  HTTPResponse = require('../lib/cloud-code/HTTPResponse').default,
  bodyParser = require('body-parser'),
  express = require('express');

const port = 13371;
const httpRequestServer = 'http://localhost:' + port;

function startServer(done) {
  const app = express();
  app.use(bodyParser.json({ type: '*/*' }));
  app.get('/hello', function (req, res) {
    res.json({ response: 'OK' });
  });

  app.get('/404', function (req, res) {
    res.status(404);
    res.send('NO');
  });

  app.get('/301', function (req, res) {
    res.status(301);
    res.location('/hello');
    res.send();
  });

  app.post('/echo', function (req, res) {
    res.json(req.body);
  });

  app.get('/qs', function (req, res) {
    res.json(req.query);
  });

  return app.listen(13371, undefined, done);
}

describe('httpRequest', () => {
  let server;
  beforeAll(done => {
    server = startServer(done);
  });

  afterAll(done => {
    server.close(done);
  });

  it('should do /hello', done => {
    httpRequest({
      url: httpRequestServer + '/hello',
    }).then(function (httpResponse) {
      expect(httpResponse.status).toBe(200);
      expect(httpResponse.buffer).toEqual(new Buffer('{"response":"OK"}'));
      expect(httpResponse.text).toEqual('{"response":"OK"}');
      expect(httpResponse.data.response).toEqual('OK');
      done();
    }, done.fail);
  });

  it('should do not follow redirects by default', done => {
    httpRequest({
      url: httpRequestServer + '/301',
    }).then(function (httpResponse) {
      expect(httpResponse.status).toBe(301);
      done();
    }, done.fail);
  });

  it('should follow redirects when set', done => {
    httpRequest({
      url: httpRequestServer + '/301',
      followRedirects: true,
    }).then(function (httpResponse) {
      expect(httpResponse.status).toBe(200);
      expect(httpResponse.buffer).toEqual(new Buffer('{"response":"OK"}'));
      expect(httpResponse.text).toEqual('{"response":"OK"}');
      expect(httpResponse.data.response).toEqual('OK');
      done();
    }, done.fail);
  });

  it('should fail on 404', done => {
    let calls = 0;
    httpRequest({
      url: httpRequestServer + '/404',
    }).then(
      function () {
        calls++;
        fail('should not succeed');
        done();
      },
      function (httpResponse) {
        calls++;
        expect(calls).toBe(1);
        expect(httpResponse.status).toBe(404);
        expect(httpResponse.buffer).toEqual(new Buffer('NO'));
        expect(httpResponse.text).toEqual('NO');
        expect(httpResponse.data).toBe(undefined);
        done();
      }
    );
  });

  it('should post on echo', done => {
    httpRequest({
      method: 'POST',
      url: httpRequestServer + '/echo',
      body: {
        foo: 'bar',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    }).then(
      function (httpResponse) {
        expect(httpResponse.status).toBe(200);
        expect(httpResponse.data).toEqual({ foo: 'bar' });
        done();
      },
      function () {
        fail('should not fail');
        done();
      }
    );
  });

  it('should encode a query string body by default', done => {
    const options = {
      body: { foo: 'bar' },
    };
    const result = httpRequest.encodeBody(options);
    expect(result.body).toEqual('foo=bar');
    expect(result.headers['Content-Type']).toEqual('application/x-www-form-urlencoded');
    done();
  });

  it('should encode a JSON body', done => {
    const options = {
      body: { foo: 'bar' },
      headers: { 'Content-Type': 'application/json' },
    };
    const result = httpRequest.encodeBody(options);
    expect(result.body).toEqual('{"foo":"bar"}');
    done();
  });
  it('should encode a www-form body', done => {
    const options = {
      body: { foo: 'bar', bar: 'baz' },
      headers: { 'cOntent-tYpe': 'application/x-www-form-urlencoded' },
    };
    const result = httpRequest.encodeBody(options);
    expect(result.body).toEqual('foo=bar&bar=baz');
    done();
  });
  it('should not encode a wrong content type', done => {
    const options = {
      body: { foo: 'bar', bar: 'baz' },
      headers: { 'cOntent-tYpe': 'mime/jpeg' },
    };
    const result = httpRequest.encodeBody(options);
    expect(result.body).toEqual({ foo: 'bar', bar: 'baz' });
    done();
  });

  it('should fail gracefully', done => {
    httpRequest({
      url: 'http://not a good url',
    }).then(done.fail, function (error) {
      expect(error).not.toBeUndefined();
      expect(error).not.toBeNull();
      done();
    });
  });

  it('should params object to query string', done => {
    httpRequest({
      url: httpRequestServer + '/qs',
      params: {
        foo: 'bar',
      },
    }).then(
      function (httpResponse) {
        expect(httpResponse.status).toBe(200);
        expect(httpResponse.data).toEqual({ foo: 'bar' });
        done();
      },
      function () {
        fail('should not fail');
        done();
      }
    );
  });

  it('should params string to query string', done => {
    httpRequest({
      url: httpRequestServer + '/qs',
      params: 'foo=bar&foo2=bar2',
    }).then(
      function (httpResponse) {
        expect(httpResponse.status).toBe(200);
        expect(httpResponse.data).toEqual({ foo: 'bar', foo2: 'bar2' });
        done();
      },
      function () {
        fail('should not fail');
        done();
      }
    );
  });

  it('should not crash with undefined body', () => {
    const httpResponse = new HTTPResponse({});
    expect(httpResponse.body).toBeUndefined();
    expect(httpResponse.data).toBeUndefined();
    expect(httpResponse.text).toBeUndefined();
    expect(httpResponse.buffer).toBeUndefined();
  });

  it('serialized httpResponse correctly with body string', () => {
    const httpResponse = new HTTPResponse({}, 'hello');
    expect(httpResponse.text).toBe('hello');
    expect(httpResponse.data).toBe(undefined);
    expect(httpResponse.body).toBe('hello');

    const serialized = JSON.stringify(httpResponse);
    const result = JSON.parse(serialized);
    expect(result.text).toBe('hello');
    expect(result.data).toBe(undefined);
    expect(result.body).toBe(undefined);
  });

  it('serialized httpResponse correctly with body object', () => {
    const httpResponse = new HTTPResponse({}, { foo: 'bar' });
    Parse._encode(httpResponse);
    const serialized = JSON.stringify(httpResponse);
    const result = JSON.parse(serialized);

    expect(httpResponse.text).toEqual('{"foo":"bar"}');
    expect(httpResponse.data).toEqual({ foo: 'bar' });
    expect(httpResponse.body).toEqual({ foo: 'bar' });

    expect(result.text).toEqual('{"foo":"bar"}');
    expect(result.data).toEqual({ foo: 'bar' });
    expect(result.body).toEqual(undefined);
  });

  it('serialized httpResponse correctly with body buffer string', () => {
    const httpResponse = new HTTPResponse({}, new Buffer('hello'));
    expect(httpResponse.text).toBe('hello');
    expect(httpResponse.data).toBe(undefined);

    const serialized = JSON.stringify(httpResponse);
    const result = JSON.parse(serialized);
    expect(result.text).toBe('hello');
    expect(result.data).toBe(undefined);
  });

  it('serialized httpResponse correctly with body buffer JSON Object', () => {
    const json = '{"foo":"bar"}';
    const httpResponse = new HTTPResponse({}, new Buffer(json));
    const serialized = JSON.stringify(httpResponse);
    const result = JSON.parse(serialized);
    expect(result.text).toEqual('{"foo":"bar"}');
    expect(result.data).toEqual({ foo: 'bar' });
  });

  it('serialized httpResponse with Parse._encode should be allright', () => {
    const json = '{"foo":"bar"}';
    const httpResponse = new HTTPResponse({}, new Buffer(json));
    const encoded = Parse._encode(httpResponse);
    let foundData,
      foundText,
      foundBody = false;
    for (const key in encoded) {
      if (key == 'data') {
        foundData = true;
      }
      if (key == 'text') {
        foundText = true;
      }
      if (key == 'body') {
        foundBody = true;
      }
    }
    expect(foundData).toBe(true);
    expect(foundText).toBe(true);
    expect(foundBody).toBe(false);
  });
});
