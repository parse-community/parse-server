/*eslint no-unused-vars: "off"*/
/**
 * @module Adapters
 */
/**
 * @interface AnalyticsAdapter
 */
export class AnalyticsAdapter {
  /**
  @param {any} parameters: the analytics request body, analytics info will be in the dimensions property
  @param {Request} req: the original http request
   */
  appOpened(parameters, req) {
    return Promise.resolve({});
  }

  /**
  @param {String} eventName: the name of the custom eventName
  @param {any} parameters: the analytics request body, analytics info will be in the dimensions property
  @param {Request} req: the original http request
   */
  trackEvent(eventName, parameters, req) {
    return Promise.resolve({});
  }
}

export default AnalyticsAdapter;
