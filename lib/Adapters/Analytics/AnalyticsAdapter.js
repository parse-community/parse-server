"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AnalyticsAdapter = void 0;

/*eslint no-unused-vars: "off"*/

/**
 * @module Adapters
 */

/**
 * @interface AnalyticsAdapter
 */
class AnalyticsAdapter {
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

exports.AnalyticsAdapter = AnalyticsAdapter;
var _default = AnalyticsAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BbmFseXRpY3MvQW5hbHl0aWNzQWRhcHRlci5qcyJdLCJuYW1lcyI6WyJBbmFseXRpY3NBZGFwdGVyIiwiYXBwT3BlbmVkIiwicGFyYW1ldGVycyIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwidHJhY2tFdmVudCIsImV2ZW50TmFtZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBO0FBQ0E7QUFDQTs7QUFDQTtBQUNBO0FBQ0E7QUFDTyxNQUFNQSxnQkFBTixDQUF1QjtBQUM1QjtBQUNGO0FBQ0E7QUFDQTtBQUNFQyxFQUFBQSxTQUFTLENBQUNDLFVBQUQsRUFBYUMsR0FBYixFQUFrQjtBQUN6QixXQUFPQyxPQUFPLENBQUNDLE9BQVIsQ0FBZ0IsRUFBaEIsQ0FBUDtBQUNEO0FBRUQ7QUFDRjtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0VDLEVBQUFBLFVBQVUsQ0FBQ0MsU0FBRCxFQUFZTCxVQUFaLEVBQXdCQyxHQUF4QixFQUE2QjtBQUNyQyxXQUFPQyxPQUFPLENBQUNDLE9BQVIsQ0FBZ0IsRUFBaEIsQ0FBUDtBQUNEOztBQWhCMkI7OztlQW1CZkwsZ0IiLCJzb3VyY2VzQ29udGVudCI6WyIvKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG4vKipcbiAqIEBtb2R1bGUgQWRhcHRlcnNcbiAqL1xuLyoqXG4gKiBAaW50ZXJmYWNlIEFuYWx5dGljc0FkYXB0ZXJcbiAqL1xuZXhwb3J0IGNsYXNzIEFuYWx5dGljc0FkYXB0ZXIge1xuICAvKipcbiAgQHBhcmFtIHthbnl9IHBhcmFtZXRlcnM6IHRoZSBhbmFseXRpY3MgcmVxdWVzdCBib2R5LCBhbmFseXRpY3MgaW5mbyB3aWxsIGJlIGluIHRoZSBkaW1lbnNpb25zIHByb3BlcnR5XG4gIEBwYXJhbSB7UmVxdWVzdH0gcmVxOiB0aGUgb3JpZ2luYWwgaHR0cCByZXF1ZXN0XG4gICAqL1xuICBhcHBPcGVuZWQocGFyYW1ldGVycywgcmVxKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cblxuICAvKipcbiAgQHBhcmFtIHtTdHJpbmd9IGV2ZW50TmFtZTogdGhlIG5hbWUgb2YgdGhlIGN1c3RvbSBldmVudE5hbWVcbiAgQHBhcmFtIHthbnl9IHBhcmFtZXRlcnM6IHRoZSBhbmFseXRpY3MgcmVxdWVzdCBib2R5LCBhbmFseXRpY3MgaW5mbyB3aWxsIGJlIGluIHRoZSBkaW1lbnNpb25zIHByb3BlcnR5XG4gIEBwYXJhbSB7UmVxdWVzdH0gcmVxOiB0aGUgb3JpZ2luYWwgaHR0cCByZXF1ZXN0XG4gICAqL1xuICB0cmFja0V2ZW50KGV2ZW50TmFtZSwgcGFyYW1ldGVycywgcmVxKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQW5hbHl0aWNzQWRhcHRlcjtcbiJdfQ==