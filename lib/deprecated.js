"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useExternal = useExternal;
function useExternal(name, moduleName) {
  return function () {
    throw `${name} is not provided by parse-server anymore; please install ${moduleName}`;
  };
}