const twitter = require('../src/Adapters/Auth/twitter');

describe('Twitter Auth', () => {
  it('should use the proper configuration', () => {
    // Multiple options, consumer_key found
    expect(twitter.handleMultipleConfigurations({
      consumer_key: 'hello',
    }, [{
      consumer_key: 'hello'
    }, {
      consumer_key: 'world'
    }]).consumer_key).toEqual('hello');

    // Multiple options, consumer_key not found
    expect(function(){
      twitter.handleMultipleConfigurations({
        consumer_key: 'some',
      }, [{
        consumer_key: 'hello'
      }, {
        consumer_key: 'world'
      }]);
    }).toThrow();

    // Multiple options, consumer_key not found
    expect(function(){
      twitter.handleMultipleConfigurations({
        auth_token: 'token',
      }, [{
        consumer_key: 'hello'
      }, {
        consumer_key: 'world'
      }]);
    }).toThrow();

    // Single configuration and consumer_key set
    expect(twitter.handleMultipleConfigurations({
      consumer_key: 'hello',
    }, {
      consumer_key: 'hello'
    }).consumer_key).toEqual('hello');

    // General case, only 1 config, no consumer_key set
    expect(twitter.handleMultipleConfigurations({
      auth_token: 'token',
    }, {
      consumer_key: 'hello'
    }).consumer_key).toEqual('hello');
  });

  it("Should fail with missing options", (done) => {
    try {
      twitter.validateAuthData({
        consumer_key: 'key',
        consumer_secret: 'secret',
        auth_token: 'token',
        auth_token_secret: 'secret'
      }, undefined);
    } catch (error) {
      jequal(error.message, 'Twitter auth configuration missing');
      done();
    }
  });
});
