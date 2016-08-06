const analyticsAdapter = {
  appOpened: function(parameters, req) {}, 
  trackEvent: function(eventName, parameters, req) {}
}

describe('AnalyticsController', () => {
  it('should track a simple event', (done) => {
    
    spyOn(analyticsAdapter, 'trackEvent').and.callThrough();
    reconfigureServer({
      analyticsAdapter
    }).then(() => {
      return Parse.Analytics.track('MyEvent', {
        key: 'value',
        count: '0'
      })
    }).then(() => {
      expect(analyticsAdapter.trackEvent).toHaveBeenCalled();
      var lastCall = analyticsAdapter.trackEvent.calls.first();
      let args = lastCall.args;
      expect(args[0]).toEqual('MyEvent');
      expect(args[1]).toEqual({
        dimensions: {
          key: 'value',
          count: '0'
        }
      });
      done();
    }, (err) => {
      fail(JSON.stringify(err));
      done();
    })
  });
  
  it('should track a app opened event', (done) => {
    
    spyOn(analyticsAdapter, 'appOpened').and.callThrough();
    reconfigureServer({
      analyticsAdapter
    }).then(() => {
      return Parse.Analytics.track('AppOpened', {
        key: 'value',
        count: '0'
      })
    }).then(() => {
      expect(analyticsAdapter.appOpened).toHaveBeenCalled();
      var lastCall = analyticsAdapter.appOpened.calls.first();
      let args = lastCall.args;
      expect(args[0]).toEqual({
        dimensions: {
          key: 'value',
          count: '0'
        }
      });
      done();
    }, (err) => {
      fail(JSON.stringify(err));
      done();
    })
  })
})