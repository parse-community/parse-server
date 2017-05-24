'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Id = function () {
  function Id(className, objectId) {
    _classCallCheck(this, Id);

    this.className = className;
    this.objectId = objectId;
  }

  _createClass(Id, [{
    key: 'toString',
    value: function toString() {
      return this.className + ':' + this.objectId;
    }
  }], [{
    key: 'fromString',
    value: function fromString(str) {
      var split = str.split(':');
      if (split.length !== 2) {
        throw new TypeError('Cannot create Id object from this string');
      }
      return new Id(split[0], split[1]);
    }
  }]);

  return Id;
}();

module.exports = Id;