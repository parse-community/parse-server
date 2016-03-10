var Subscription = require('../src/LiveQuery/Subscription').Subscription;

describe('Subscription', function() {

  beforeEach(function() {
    var mockError = jasmine.createSpy('error');
    jasmine.mockLibrary('../src/LiveQuery/PLog', 'error', mockError);
  });

  it('can be initialized', function() {
    var subscription = new Subscription('className', { key : 'value' }, 'hash');

    expect(subscription.className).toBe('className');
    expect(subscription.query).toEqual({ key : 'value' });
    expect(subscription.hash).toBe('hash');
    expect(subscription.clientRequestIds.size).toBe(0);
  });

  it('can check it has subscribing clients', function() {
    var subscription = new Subscription('className', { key : 'value' }, 'hash');

    expect(subscription.hasSubscribingClient()).toBe(false);
  });

  it('can check it does not have subscribing clients', function() {
    var subscription = new Subscription('className', { key : 'value' }, 'hash');
    subscription.addClientSubscription(1, 1);

    expect(subscription.hasSubscribingClient()).toBe(true);
  });

  it('can add one request for one client', function() {
    var subscription = new Subscription('className', { key : 'value' }, 'hash');
    subscription.addClientSubscription(1, 1);

    expect(subscription.clientRequestIds.size).toBe(1);
    expect(subscription.clientRequestIds.get(1)).toEqual([1]);
  });

  it('can add requests for one client', function() {
    var subscription = new Subscription('className', { key : 'value' }, 'hash');
    subscription.addClientSubscription(1, 1);
    subscription.addClientSubscription(1, 2);

    expect(subscription.clientRequestIds.size).toBe(1);
    expect(subscription.clientRequestIds.get(1)).toEqual([1, 2]);
  });

  it('can add requests for clients', function() {
    var subscription = new Subscription('className', { key : 'value' }, 'hash');
    subscription.addClientSubscription(1, 1);
    subscription.addClientSubscription(1, 2);
    subscription.addClientSubscription(2, 2);
    subscription.addClientSubscription(2, 3);

    expect(subscription.clientRequestIds.size).toBe(2);
    expect(subscription.clientRequestIds.get(1)).toEqual([1, 2]);
    expect(subscription.clientRequestIds.get(2)).toEqual([2, 3]);
  });

  it('can delete requests for nonexistent client', function() {
    var subscription = new Subscription('className', { key : 'value' }, 'hash');
    subscription.deleteClientSubscription(1, 1);

    var PLog =require('../src/LiveQuery/PLog');
    expect(PLog.error).toHaveBeenCalled();
  });

  it('can delete nonexistent request for one client', function() {
    var subscription = new Subscription('className', { key : 'value' }, 'hash');
    subscription.addClientSubscription(1, 1);
    subscription.deleteClientSubscription(1, 2);

    var PLog =require('../src/LiveQuery/PLog');
    expect(PLog.error).toHaveBeenCalled();
    expect(subscription.clientRequestIds.size).toBe(1);
    expect(subscription.clientRequestIds.get(1)).toEqual([1]);
  });

  it('can delete some requests for one client', function() {
    var subscription = new Subscription('className', { key : 'value' }, 'hash');
    subscription.addClientSubscription(1, 1);
    subscription.addClientSubscription(1, 2);
    subscription.deleteClientSubscription(1, 2);

    var PLog =require('../src/LiveQuery/PLog');
    expect(PLog.error).not.toHaveBeenCalled();
    expect(subscription.clientRequestIds.size).toBe(1);
    expect(subscription.clientRequestIds.get(1)).toEqual([1]);
  });

  it('can delete all requests for one client', function() {
    var subscription = new Subscription('className', { key : 'value' }, 'hash');
    subscription.addClientSubscription(1, 1);
    subscription.addClientSubscription(1, 2);
    subscription.deleteClientSubscription(1, 1);
    subscription.deleteClientSubscription(1, 2);

    var PLog =require('../src/LiveQuery/PLog');
    expect(PLog.error).not.toHaveBeenCalled();
    expect(subscription.clientRequestIds.size).toBe(0);
  });

  it('can delete requests for multiple clients', function() {
    var subscription = new Subscription('className', { key : 'value' }, 'hash');
    subscription.addClientSubscription(1, 1);
    subscription.addClientSubscription(1, 2);
    subscription.addClientSubscription(2, 1);
    subscription.addClientSubscription(2, 2);
    subscription.deleteClientSubscription(1, 2);
    subscription.deleteClientSubscription(2, 1);
    subscription.deleteClientSubscription(2, 2);

    var PLog =require('../src/LiveQuery/PLog');
    expect(PLog.error).not.toHaveBeenCalled();
    expect(subscription.clientRequestIds.size).toBe(1);
    expect(subscription.clientRequestIds.get(1)).toEqual([1]);
  });

  afterEach(function(){
    jasmine.restoreLibrary('../src/LiveQuery/PLog', 'error');
  });
});
