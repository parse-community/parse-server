export class AnalyticsAdapter {
  appOpened(parameters, req) {
    return Promise.resolve({});
  }

  trackEvent(eventName, parameters, req) {
    return Promise.resolve({});
  }
}

export default AnalyticsAdapter;
