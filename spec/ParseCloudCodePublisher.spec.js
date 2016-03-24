var ParseCloudCodePublisher = require('../src/LiveQuery/ParseCloudCodePublisher').ParseCloudCodePublisher;
var Parse = require('parse/node');

describe('ParseCloudCodePublisher', function() {

  beforeEach(function(done) {
    // Mock ParsePubSub
    var mockParsePubSub = {
      createPublisher: jasmine.createSpy('publish').and.returnValue({
        publish: jasmine.createSpy('publish'),
        on: jasmine.createSpy('on')
      }),
      createSubscriber: jasmine.createSpy('publish').and.returnValue({
        subscribe: jasmine.createSpy('subscribe'),
        on: jasmine.createSpy('on')
      })
    };
    jasmine.mockLibrary('../src/LiveQuery/ParsePubSub', 'ParsePubSub', mockParsePubSub);
    done();
  });

  it('can initialize', function() {
    var config = {}
    var publisher = new ParseCloudCodePublisher(config);

    var ParsePubSub = require('../src/LiveQuery/ParsePubSub').ParsePubSub;
    expect(ParsePubSub.createPublisher).toHaveBeenCalledWith(config);
  });

  it('can handle cloud code afterSave request', function() {
    var publisher = new ParseCloudCodePublisher({});
    publisher._onCloudCodeMessage = jasmine.createSpy('onCloudCodeMessage');
    var request = {};
    publisher.onCloudCodeAfterSave(request);

    expect(publisher._onCloudCodeMessage).toHaveBeenCalledWith('afterSave', request);
  });

  it('can handle cloud code afterDelete request', function() {
    var publisher = new ParseCloudCodePublisher({});
    publisher._onCloudCodeMessage = jasmine.createSpy('onCloudCodeMessage');
    var request = {};
    publisher.onCloudCodeAfterDelete(request);

    expect(publisher._onCloudCodeMessage).toHaveBeenCalledWith('afterDelete', request);
  });

  it('can handle cloud code request', function() {
    var publisher = new ParseCloudCodePublisher({});
    var currentParseObject = new Parse.Object('Test');
    currentParseObject.set('key', 'value');
    var originalParseObject = new Parse.Object('Test');
    originalParseObject.set('key', 'originalValue');
    var request = {
      object: currentParseObject,
      original: originalParseObject
    };
    publisher._onCloudCodeMessage('afterSave', request);

    var args = publisher.parsePublisher.publish.calls.mostRecent().args;
    expect(args[0]).toBe('afterSave');
    var message = JSON.parse(args[1]);
    expect(message.currentParseObject).toEqual(request.object._toFullJSON());
    expect(message.originalParseObject).toEqual(request.original._toFullJSON());
  });

  afterEach(function(){
    jasmine.restoreLibrary('../src/LiveQuery/ParsePubSub', 'ParsePubSub');
  });
});
