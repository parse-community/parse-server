var request = require('request');

describe('server', () => {
  it('requires a master key and app id', done => {
    expect(setServerConfiguration.bind(undefined, { masterKey: 'mykey' })).toThrow('You must provide an appId and masterKey!');
    expect(setServerConfiguration.bind(undefined, { appId: 'myId' })).toThrow('You must provide an appId and masterKey!');
    done();
  });

  it('fails if database is unreachable', done => {
    setServerConfiguration({
      databaseURI: 'mongodb://fake:fake@ds043605.mongolab.com:43605/drew3',
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
    });
    //Need to use rest api because saving via JS SDK results in fail() not getting called
    request.post({
      url: 'http://localhost:8378/1/classes/NewClass',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      body: {},
      json: true,
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(500);
      expect(body.code).toEqual(1);
      expect(body.message).toEqual('Internal server error.');
      done();
    });
  });
});
