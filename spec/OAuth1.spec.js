const OAuth = require('../lib/Adapters/Auth/OAuth1Client');

describe('OAuth', function () {
  it('Nonce should have right length', done => {
    jequal(OAuth.nonce().length, 30);
    done();
  });

  it('Should properly build parameter string', done => {
    const string = OAuth.buildParameterString({ c: 1, a: 2, b: 3 });
    jequal(string, 'a=2&b=3&c=1');
    done();
  });

  it('Should properly build empty parameter string', done => {
    const string = OAuth.buildParameterString();
    jequal(string, '');
    done();
  });

  it('Should properly build signature string', done => {
    const string = OAuth.buildSignatureString('get', 'http://dummy.com', '');
    jequal(string, 'GET&http%3A%2F%2Fdummy.com&');
    done();
  });

  it('Should properly generate request signature', done => {
    let request = {
      host: 'dummy.com',
      path: 'path',
    };

    const oauth_params = {
      oauth_timestamp: 123450000,
      oauth_nonce: 'AAAAAAAAAAAAAAAAA',
      oauth_consumer_key: 'hello',
      oauth_token: 'token',
    };

    const consumer_secret = 'world';
    const auth_token_secret = 'secret';
    request = OAuth.signRequest(request, oauth_params, consumer_secret, auth_token_secret);
    jequal(
      request.headers['Authorization'],
      'OAuth oauth_consumer_key="hello", oauth_nonce="AAAAAAAAAAAAAAAAA", oauth_signature="8K95bpQcDi9Nd2GkhumTVcw4%2BXw%3D", oauth_signature_method="HMAC-SHA1", oauth_timestamp="123450000", oauth_token="token", oauth_version="1.0"'
    );
    done();
  });

  it('Should properly build request', done => {
    const options = {
      host: 'dummy.com',
      consumer_key: 'hello',
      consumer_secret: 'world',
      auth_token: 'token',
      auth_token_secret: 'secret',
      // Custom oauth params for tests
      oauth_params: {
        oauth_timestamp: 123450000,
        oauth_nonce: 'AAAAAAAAAAAAAAAAA',
      },
    };
    const path = 'path';
    const method = 'get';

    const oauthClient = new OAuth(options);
    const req = oauthClient.buildRequest(method, path, { query: 'param' });

    jequal(req.host, options.host);
    jequal(req.path, '/' + path + '?query=param');
    jequal(req.method, 'GET');
    jequal(req.headers['Content-Type'], 'application/x-www-form-urlencoded');
    jequal(
      req.headers['Authorization'],
      'OAuth oauth_consumer_key="hello", oauth_nonce="AAAAAAAAAAAAAAAAA", oauth_signature="wNkyEkDE%2F0JZ2idmqyrgHdvC0rs%3D", oauth_signature_method="HMAC-SHA1", oauth_timestamp="123450000", oauth_token="token", oauth_version="1.0"'
    );
    done();
  });

  function validateCannotAuthenticateError(data, done) {
    jequal(typeof data, 'object');
    jequal(typeof data.errors, 'object');
    const errors = data.errors;
    jequal(typeof errors[0], 'object');
    // Cannot authenticate error
    jequal(errors[0].code, 32);
    done();
  }

  it('GET request for a resource that requires OAuth should fail with invalid credentials', done => {
    /*
      This endpoint has been chosen to make a request to an endpoint that requires OAuth which fails due to missing authentication.
      Any other endpoint from the Twitter API that requires OAuth can be used instead in case the currently used endpoint deprecates.
    */
    const options = {
      host: 'api.twitter.com',
      consumer_key: 'invalid_consumer_key',
      consumer_secret: 'invalid_consumer_secret',
    };
    const path = '/1.1/favorites/list.json';
    const params = { lang: 'en' };
    const oauthClient = new OAuth(options);
    oauthClient.get(path, params).then(function (data) {
      validateCannotAuthenticateError(data, done);
    });
  });

  it('POST request for a resource that requires OAuth should fail with invalid credentials', done => {
    /*
      This endpoint has been chosen to make a request to an endpoint that requires OAuth which fails due to missing authentication.
      Any other endpoint from the Twitter API that requires OAuth can be used instead in case the currently used endpoint deprecates.
    */
    const options = {
      host: 'api.twitter.com',
      consumer_key: 'invalid_consumer_key',
      consumer_secret: 'invalid_consumer_secret',
    };
    const body = {
      lang: 'en',
    };
    const path = '/1.1/account/settings.json';

    const oauthClient = new OAuth(options);
    oauthClient.post(path, null, body).then(function (data) {
      validateCannotAuthenticateError(data, done);
    });
  });

  it('Should fail a request', done => {
    const options = {
      host: 'localhost',
      consumer_key: 'XXXXXXXXXXXXXXXXXXXXXXXXX',
      consumer_secret: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    };
    const body = {
      lang: 'en',
    };
    const path = '/';

    const oauthClient = new OAuth(options);
    oauthClient
      .post(path, null, body)
      .then(function () {
        jequal(false, true);
        done();
      })
      .catch(function () {
        jequal(true, true);
        done();
      });
  });

  it('Should fail with missing options', done => {
    const options = undefined;
    try {
      new OAuth(options);
    } catch (error) {
      jequal(error.message, 'No options passed to OAuth');
      done();
    }
  });
});
