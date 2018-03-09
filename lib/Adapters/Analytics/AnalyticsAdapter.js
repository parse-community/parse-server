"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
/*eslint no-unused-vars: "off"*/
class AnalyticsAdapter {

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
    return Promise.resolve({});
  }
}

exports.AnalyticsAdapter = AnalyticsAdapter;
exports.default = AnalyticsAdapter;