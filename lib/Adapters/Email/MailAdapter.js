"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/*eslint no-unused-vars: "off"*/
/*
  Mail Adapter prototype
  A MailAdapter should implement at least sendMail()
 */
var MailAdapter = exports.MailAdapter = function () {
  function MailAdapter() {
    _classCallCheck(this, MailAdapter);
  }

  _createClass(MailAdapter, [{
    key: "sendMail",

    /*
     * A method for sending mail
     * @param options would have the parameters
     * - to: the recipient
     * - text: the raw text of the message
     * - subject: the subject of the email
     */
    value: function sendMail(options) {}

    /* You can implement those methods if you want
     * to provide HTML templates etc...
     */
    // sendVerificationEmail({ link, appName, user }) {}
    // sendPasswordResetEmail({ link, appName, user }) {}

  }]);

  return MailAdapter;
}();

exports.default = MailAdapter;