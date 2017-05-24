"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/*eslint no-unused-vars: "off"*/
var AuthAdapter = exports.AuthAdapter = function () {
  function AuthAdapter() {
    _classCallCheck(this, AuthAdapter);
  }

  _createClass(AuthAdapter, [{
    key: "validateAppId",


    /*
    @param appIds: the specified app ids in the configuration
    @param authData: the client provided authData
    @returns a promise that resolves if the applicationId is valid
     */
    value: function validateAppId(appIds, authData) {
      return Promise.resolve({});
    }

    /*
    @param authData: the client provided authData
    @param options: additional options
     */

  }, {
    key: "validateAuthData",
    value: function validateAuthData(authData, options) {
      return Promise.resolve({});
    }
  }]);

  return AuthAdapter;
}();

exports.default = AuthAdapter;