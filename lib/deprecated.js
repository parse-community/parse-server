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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ1c2VFeHRlcm5hbCIsIm5hbWUiLCJtb2R1bGVOYW1lIl0sInNvdXJjZXMiOlsiLi4vc3JjL2RlcHJlY2F0ZWQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIHVzZUV4dGVybmFsKG5hbWUsIG1vZHVsZU5hbWUpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICB0aHJvdyBgJHtuYW1lfSBpcyBub3QgcHJvdmlkZWQgYnkgcGFyc2Utc2VydmVyIGFueW1vcmU7IHBsZWFzZSBpbnN0YWxsICR7bW9kdWxlTmFtZX1gO1xuICB9O1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBTyxTQUFTQSxXQUFXQSxDQUFDQyxJQUFJLEVBQUVDLFVBQVUsRUFBRTtFQUM1QyxPQUFPLFlBQVk7SUFDakIsTUFBTyxHQUFFRCxJQUFLLDREQUEyREMsVUFBVyxFQUFDO0VBQ3ZGLENBQUM7QUFDSCJ9