"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  getObjectType: true,
  getCreateInputType: true,
  getUpdateInputType: true
};
exports.getObjectType = getObjectType;
exports.getCreateInputType = getCreateInputType;
exports.getUpdateInputType = getUpdateInputType;

var _graphql = require("graphql");

Object.keys(_graphql).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _graphql[key];
    }
  });
});

var _ParseClass = require("./schemas/ParseClass");

function getObjectType(name) {
  return (0, _ParseClass.loadClass)(name).objectType;
}

function getCreateInputType(name) {
  return (0, _ParseClass.loadClass)(name).inputType;
}

function getUpdateInputType(name) {
  return (0, _ParseClass.loadClass)(name).updateType;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ncmFwaHFsL2luZGV4LmpzIl0sIm5hbWVzIjpbImdldE9iamVjdFR5cGUiLCJuYW1lIiwib2JqZWN0VHlwZSIsImdldENyZWF0ZUlucHV0VHlwZSIsImlucHV0VHlwZSIsImdldFVwZGF0ZUlucHV0VHlwZSIsInVwZGF0ZVR5cGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7O0FBQUE7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7O0FBRUE7O0FBRU8sU0FBU0EsYUFBVCxDQUF1QkMsSUFBdkIsRUFBNkI7QUFDbEMsU0FBTywyQkFBVUEsSUFBVixFQUFnQkMsVUFBdkI7QUFDRDs7QUFFTSxTQUFTQyxrQkFBVCxDQUE0QkYsSUFBNUIsRUFBa0M7QUFDdkMsU0FBTywyQkFBVUEsSUFBVixFQUFnQkcsU0FBdkI7QUFDRDs7QUFFTSxTQUFTQyxrQkFBVCxDQUE0QkosSUFBNUIsRUFBa0M7QUFDdkMsU0FBTywyQkFBVUEsSUFBVixFQUFnQkssVUFBdkI7QUFDRCIsInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCAqIGZyb20gJ2dyYXBocWwnO1xuXG5pbXBvcnQgeyBsb2FkQ2xhc3MgfSBmcm9tICcuL3NjaGVtYXMvUGFyc2VDbGFzcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRPYmplY3RUeXBlKG5hbWUpIHtcbiAgcmV0dXJuIGxvYWRDbGFzcyhuYW1lKS5vYmplY3RUeXBlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q3JlYXRlSW5wdXRUeXBlKG5hbWUpIHtcbiAgcmV0dXJuIGxvYWRDbGFzcyhuYW1lKS5pbnB1dFR5cGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRVcGRhdGVJbnB1dFR5cGUobmFtZSkge1xuICByZXR1cm4gbG9hZENsYXNzKG5hbWUpLnVwZGF0ZVR5cGU7XG59XG4iXX0=