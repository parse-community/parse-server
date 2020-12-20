const ParseCloudCodePublisher = require('../lib/LiveQuery/ParseCloudCodePublisher')
  .ParseCloudCodePublisher;
const Parse = require('parse/node');

describe('ParseCloudCodePublisher', function () {
  beforeEach(function (done) {
    // Mock ParsePubSub
    const mockParsePubSub = {
      createPublisher: jasmine.createSpy('publish').and.returnValue({
        publish: jasmine.createSpy('publish'),
        on: jasmine.createSpy('on'),
      }),
      createSubscriber: jasmine.createSpy('publish').and.returnValue({
        subscribe: jasmine.createSpy('subscribe'),
        on: jasmine.createSpy('on'),
      }),
    };
    jasmine.mockLibrary('../lib/LiveQuery/ParsePubSub', 'ParsePubSub', mockParsePubSub);
    done();
  });

  it('can initialize', function () {
    const config = {};
    new ParseCloudCodePublisher(config);

    const ParsePubSub = require('../lib/LiveQuery/ParsePubSub').ParsePubSub;
    expect(ParsePubSub.createPublisher).toHaveBeenCalledWith(config);
  });

  it('can handle cloud code afterSave request', function () {
    const publisher = new ParseCloudCodePublisher({});
    publisher._onCloudCodeMessage = jasmine.createSpy('onCloudCodeMessage');
    const request = {};
    publisher.onCloudCodeAfterSave(request);

    expect(publisher._onCloudCodeMessage).toHaveBeenCalledWith(
      Parse.applicationId + 'afterSave',
      request
    );
  });

  it('can handle cloud code afterDelete request', function () {
    const publisher = new ParseCloudCodePublisher({});
    publisher._onCloudCodeMessage = jasmine.createSpy('onCloudCodeMessage');
    const request = {};
    publisher.onCloudCodeAfterDelete(request);

    expect(publisher._onCloudCodeMessage).toHaveBeenCalledWith(
      Parse.applicationId + 'afterDelete',
      request
    );
  });

  it('can handle cloud code request', function () {
    const publisher = new ParseCloudCodePublisher({});
    const currentParseObject = new Parse.Object('Test');
    currentParseObject.set('key', 'value');
    const originalParseObject = new Parse.Object('Test');
    originalParseObject.set('key', 'originalValue');
    const request = {
      object: currentParseObject,
      original: originalParseObject,
    };
    publisher._onCloudCodeMessage('afterSave', request);

    const args = publisher.parsePublisher.publish.calls.mostRecent().args;
    expect(args[0]).toBe('afterSave');
    const message = JSON.parse(args[1]);
    expect(message.currentParseObject).toEqual(request.object._toFullJSON());
    expect(message.originalParseObject).toEqual(request.original._toFullJSON());
  });

  afterEach(function () {
    jasmine.restoreLibrary('../lib/LiveQuery/ParsePubSub', 'ParsePubSub');
  });
});
