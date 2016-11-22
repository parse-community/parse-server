import rest          from './../../rest';

export class AnalyticsAdapter {
  
  /*
  @param parameters: the analytics request body, analytics info will be in the dimensions property
  @param req: the original http request
   */
  appOpened(parameters, req) {
    return Promise.resolve({});
  }
  
  /*
  @param eventName: the name of the custom eventName
  @param parameters: the analytics request body, analytics info will be in the dimensions property
  @param req: the original http request
   */
  trackEvent(eventName, parameters, req) {
    req.body.eventId = eventName;
    return rest.create(req.config, req.auth, 'Events', req.body, req.info.clientSDK);
  }
}

export default AnalyticsAdapter;
