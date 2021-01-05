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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9kZXByZWNhdGVkLmpzIl0sIm5hbWVzIjpbInVzZUV4dGVybmFsIiwibmFtZSIsIm1vZHVsZU5hbWUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBTyxTQUFTQSxXQUFULENBQXFCQyxJQUFyQixFQUEyQkMsVUFBM0IsRUFBdUM7QUFDNUMsU0FBTyxZQUFZO0FBQ2pCLFVBQU8sR0FBRUQsSUFBSyw0REFBMkRDLFVBQVcsRUFBcEY7QUFDRCxHQUZEO0FBR0QiLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZnVuY3Rpb24gdXNlRXh0ZXJuYWwobmFtZSwgbW9kdWxlTmFtZSkge1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHRocm93IGAke25hbWV9IGlzIG5vdCBwcm92aWRlZCBieSBwYXJzZS1zZXJ2ZXIgYW55bW9yZTsgcGxlYXNlIGluc3RhbGwgJHttb2R1bGVOYW1lfWA7XG4gIH07XG59XG4iXX0=