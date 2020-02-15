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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9kZXByZWNhdGVkLmpzIl0sIm5hbWVzIjpbInVzZUV4dGVybmFsIiwibmFtZSIsIm1vZHVsZU5hbWUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBTyxTQUFTQSxXQUFULENBQXFCQyxJQUFyQixFQUEyQkMsVUFBM0IsRUFBdUM7QUFDNUMsU0FBTyxZQUFXO0FBQ2hCLFVBQU8sR0FBRUQsSUFBSyw0REFBMkRDLFVBQVcsRUFBcEY7QUFDRCxHQUZEO0FBR0QiLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZnVuY3Rpb24gdXNlRXh0ZXJuYWwobmFtZSwgbW9kdWxlTmFtZSkge1xuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgdGhyb3cgYCR7bmFtZX0gaXMgbm90IHByb3ZpZGVkIGJ5IHBhcnNlLXNlcnZlciBhbnltb3JlOyBwbGVhc2UgaW5zdGFsbCAke21vZHVsZU5hbWV9YDtcbiAgfTtcbn1cbiJdfQ==