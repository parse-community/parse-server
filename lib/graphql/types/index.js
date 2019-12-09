"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.type = type;
exports.inputType = inputType;
exports.queryType = queryType;
Object.defineProperty(exports, "ACL", {
  enumerable: true,
  get: function () {
    return _ACL.ACL;
  }
});
Object.defineProperty(exports, "ACLInput", {
  enumerable: true,
  get: function () {
    return _ACL.ACLInput;
  }
});
Object.defineProperty(exports, "GeoPoint", {
  enumerable: true,
  get: function () {
    return _GeoPoint.GeoPoint;
  }
});
Object.defineProperty(exports, "GeoPointInput", {
  enumerable: true,
  get: function () {
    return _GeoPoint.GeoPointInput;
  }
});
Object.defineProperty(exports, "File", {
  enumerable: true,
  get: function () {
    return _File.File;
  }
});
Object.defineProperty(exports, "FileInput", {
  enumerable: true,
  get: function () {
    return _File.FileInput;
  }
});
Object.defineProperty(exports, "Date", {
  enumerable: true,
  get: function () {
    return _Date.Date;
  }
});
Object.defineProperty(exports, "Pointer", {
  enumerable: true,
  get: function () {
    return _Pointer.Pointer;
  }
});
Object.defineProperty(exports, "JSONObject", {
  enumerable: true,
  get: function () {
    return _JSONObject.JSONObject;
  }
});
Object.defineProperty(exports, "PageInfo", {
  enumerable: true,
  get: function () {
    return _PageInfo.PageInfo;
  }
});
Object.defineProperty(exports, "Event", {
  enumerable: true,
  get: function () {
    return _Event.Event;
  }
});
exports.BooleanQuery = void 0;

var _graphql = require("graphql");

var _ACL = require("./ACL");

var _GeoPoint = require("./GeoPoint");

var _File = require("./File");

var _Date = require("./Date");

var _Pointer = require("./Pointer");

var _JSONObject = require("./JSONObject");

var _StringQuery = require("./StringQuery");

var _NumberQuery = require("./NumberQuery");

var _NumberInput = require("./NumberInput");

var _PageInfo = require("./PageInfo");

var _Array = require("./Array");

var _BaseQuery = require("./BaseQuery");

var _Event = require("./Event");

const types = {
  String: _graphql.GraphQLString,
  Number: _graphql.GraphQLFloat,
  Boolean: _graphql.GraphQLBoolean,
  GeoPoint: _GeoPoint.GeoPoint,
  File: _File.File,
  ACL: _ACL.ACL,
  Date: _Date.Date,
  Pointer: _Pointer.Pointer,
  Object: _JSONObject.JSONObject,
  Array: new _graphql.GraphQLList(_JSONObject.JSONObject)
};
const BooleanQuery = new _graphql.GraphQLInputObjectType({
  name: 'BooleanQuery',
  fields: (0, _BaseQuery.BaseQuery)(_graphql.GraphQLBoolean)
});
exports.BooleanQuery = BooleanQuery;

function type({
  type
}) {
  return types[type];
}

function inputType(field) {
  const {
    type
  } = field;

  if (type == 'String') {
    return _graphql.GraphQLString;
  }

  if (type == 'Number') {
    return _NumberInput.NumberInput;
  }

  if (type == 'Boolean') {
    return _graphql.GraphQLBoolean;
  }

  if (type == 'GeoPoint') {
    return _GeoPoint.GeoPointInput;
  }

  if (type == 'File') {
    return _File.FileInput;
  } else if (type == 'ACL') {
    return _ACL.ACLInput;
  } else if (type == 'Date') {
    return _Date.Date;
  } else if (type == 'Pointer') {
    return (0, _Pointer.PointerInput)(field);
  } else if (type === 'Array') {
    return new _graphql.GraphQLList(_JSONObject.JSONObject);
  } else if (type === 'Object') {
    return _JSONObject.JSONObject;
  }
}

function queryType(field) {
  const {
    type
  } = field;

  if (type == 'String') {
    return _StringQuery.StringQuery;
  }

  if (type == 'Number') {
    return _NumberQuery.NumberQuery;
  }

  if (type == 'Boolean') {
    return BooleanQuery;
  }

  if (type == 'GeoPoint') {
    return _GeoPoint.GeoPointQuery;
  }

  if (type == 'File') {
    // Cannot query on files
    return;
  } else if (type == 'ACL') {
    // cannot query on ACL!
    return;
  } else if (type == 'Date') {
    return _Date.DateQuery;
  } else if (type == 'Pointer') {
    return (0, _Pointer.PointerQuery)(field);
  } else if (type == 'Array') {
    return _Array.ArrayQuery;
  }
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9ncmFwaHFsL3R5cGVzL2luZGV4LmpzIl0sIm5hbWVzIjpbInR5cGVzIiwiU3RyaW5nIiwiR3JhcGhRTFN0cmluZyIsIk51bWJlciIsIkdyYXBoUUxGbG9hdCIsIkJvb2xlYW4iLCJHcmFwaFFMQm9vbGVhbiIsIkdlb1BvaW50IiwiRmlsZSIsIkFDTCIsIkRhdGUiLCJQb2ludGVyIiwiT2JqZWN0IiwiSlNPTk9iamVjdCIsIkFycmF5IiwiR3JhcGhRTExpc3QiLCJCb29sZWFuUXVlcnkiLCJHcmFwaFFMSW5wdXRPYmplY3RUeXBlIiwibmFtZSIsImZpZWxkcyIsInR5cGUiLCJpbnB1dFR5cGUiLCJmaWVsZCIsIk51bWJlcklucHV0IiwiR2VvUG9pbnRJbnB1dCIsIkZpbGVJbnB1dCIsIkFDTElucHV0IiwicXVlcnlUeXBlIiwiU3RyaW5nUXVlcnkiLCJOdW1iZXJRdWVyeSIsIkdlb1BvaW50UXVlcnkiLCJEYXRlUXVlcnkiLCJBcnJheVF1ZXJ5Il0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUE7O0FBU0E7O0FBRUE7O0FBRUE7O0FBRUE7O0FBRUE7O0FBRUE7O0FBRUE7O0FBRUE7O0FBRUE7O0FBRUE7O0FBRUE7O0FBRUE7O0FBRUE7O0FBZ0JBLE1BQU1BLEtBQUssR0FBRztBQUNaQyxFQUFBQSxNQUFNLEVBQUVDLHNCQURJO0FBRVpDLEVBQUFBLE1BQU0sRUFBRUMscUJBRkk7QUFHWkMsRUFBQUEsT0FBTyxFQUFFQyx1QkFIRztBQUlaQyxFQUFBQSxRQUFRLEVBQVJBLGtCQUpZO0FBS1pDLEVBQUFBLElBQUksRUFBSkEsVUFMWTtBQU1aQyxFQUFBQSxHQUFHLEVBQUhBLFFBTlk7QUFPWkMsRUFBQUEsSUFBSSxFQUFKQSxVQVBZO0FBUVpDLEVBQUFBLE9BQU8sRUFBUEEsZ0JBUlk7QUFTWkMsRUFBQUEsTUFBTSxFQUFFQyxzQkFUSTtBQVVaQyxFQUFBQSxLQUFLLEVBQUUsSUFBSUMsb0JBQUosQ0FBZ0JGLHNCQUFoQjtBQVZLLENBQWQ7QUFhTyxNQUFNRyxZQUFZLEdBQUcsSUFBSUMsK0JBQUosQ0FBMkI7QUFDckRDLEVBQUFBLElBQUksRUFBRSxjQUQrQztBQUVyREMsRUFBQUEsTUFBTSxFQUFFLDBCQUFVYix1QkFBVjtBQUY2QyxDQUEzQixDQUFyQjs7O0FBT0EsU0FBU2MsSUFBVCxDQUFjO0FBQUVBLEVBQUFBO0FBQUYsQ0FBZCxFQUF3QztBQUM3QyxTQUFPcEIsS0FBSyxDQUFDb0IsSUFBRCxDQUFaO0FBQ0Q7O0FBRU0sU0FBU0MsU0FBVCxDQUFtQkMsS0FBbkIsRUFBMEM7QUFDL0MsUUFBTTtBQUFFRixJQUFBQTtBQUFGLE1BQVdFLEtBQWpCOztBQUNBLE1BQUlGLElBQUksSUFBSSxRQUFaLEVBQXNCO0FBQ3BCLFdBQU9sQixzQkFBUDtBQUNEOztBQUNELE1BQUlrQixJQUFJLElBQUksUUFBWixFQUFzQjtBQUNwQixXQUFPRyx3QkFBUDtBQUNEOztBQUNELE1BQUlILElBQUksSUFBSSxTQUFaLEVBQXVCO0FBQ3JCLFdBQU9kLHVCQUFQO0FBQ0Q7O0FBQ0QsTUFBSWMsSUFBSSxJQUFJLFVBQVosRUFBd0I7QUFDdEIsV0FBT0ksdUJBQVA7QUFDRDs7QUFDRCxNQUFJSixJQUFJLElBQUksTUFBWixFQUFvQjtBQUNsQixXQUFPSyxlQUFQO0FBQ0QsR0FGRCxNQUVPLElBQUlMLElBQUksSUFBSSxLQUFaLEVBQW1CO0FBQ3hCLFdBQU9NLGFBQVA7QUFDRCxHQUZNLE1BRUEsSUFBSU4sSUFBSSxJQUFJLE1BQVosRUFBb0I7QUFDekIsV0FBT1YsVUFBUDtBQUNELEdBRk0sTUFFQSxJQUFJVSxJQUFJLElBQUksU0FBWixFQUF1QjtBQUM1QixXQUFPLDJCQUFhRSxLQUFiLENBQVA7QUFDRCxHQUZNLE1BRUEsSUFBSUYsSUFBSSxLQUFLLE9BQWIsRUFBc0I7QUFDM0IsV0FBTyxJQUFJTCxvQkFBSixDQUFnQkYsc0JBQWhCLENBQVA7QUFDRCxHQUZNLE1BRUEsSUFBSU8sSUFBSSxLQUFLLFFBQWIsRUFBdUI7QUFDNUIsV0FBT1Asc0JBQVA7QUFDRDtBQUNGOztBQUVNLFNBQVNjLFNBQVQsQ0FBbUJMLEtBQW5CLEVBQTBDO0FBQy9DLFFBQU07QUFBRUYsSUFBQUE7QUFBRixNQUFXRSxLQUFqQjs7QUFDQSxNQUFJRixJQUFJLElBQUksUUFBWixFQUFzQjtBQUNwQixXQUFPUSx3QkFBUDtBQUNEOztBQUNELE1BQUlSLElBQUksSUFBSSxRQUFaLEVBQXNCO0FBQ3BCLFdBQU9TLHdCQUFQO0FBQ0Q7O0FBQ0QsTUFBSVQsSUFBSSxJQUFJLFNBQVosRUFBdUI7QUFDckIsV0FBT0osWUFBUDtBQUNEOztBQUNELE1BQUlJLElBQUksSUFBSSxVQUFaLEVBQXdCO0FBQ3RCLFdBQU9VLHVCQUFQO0FBQ0Q7O0FBQ0QsTUFBSVYsSUFBSSxJQUFJLE1BQVosRUFBb0I7QUFDbEI7QUFDQTtBQUNELEdBSEQsTUFHTyxJQUFJQSxJQUFJLElBQUksS0FBWixFQUFtQjtBQUN4QjtBQUNBO0FBQ0QsR0FITSxNQUdBLElBQUlBLElBQUksSUFBSSxNQUFaLEVBQW9CO0FBQ3pCLFdBQU9XLGVBQVA7QUFDRCxHQUZNLE1BRUEsSUFBSVgsSUFBSSxJQUFJLFNBQVosRUFBdUI7QUFDNUIsV0FBTywyQkFBYUUsS0FBYixDQUFQO0FBQ0QsR0FGTSxNQUVBLElBQUlGLElBQUksSUFBSSxPQUFaLEVBQXFCO0FBQzFCLFdBQU9ZLGlCQUFQO0FBQ0Q7QUFDRiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5cbmltcG9ydCB7XG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxGbG9hdCxcbiAgR3JhcGhRTEJvb2xlYW4sXG4gIEdyYXBoUUxMaXN0LFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxuICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbn0gZnJvbSAnZ3JhcGhxbCc7XG5cbmltcG9ydCB7IEFDTCwgQUNMSW5wdXQgfSBmcm9tICcuL0FDTCc7XG5cbmltcG9ydCB7IEdlb1BvaW50LCBHZW9Qb2ludElucHV0LCBHZW9Qb2ludFF1ZXJ5IH0gZnJvbSAnLi9HZW9Qb2ludCc7XG5cbmltcG9ydCB7IEZpbGUsIEZpbGVJbnB1dCB9IGZyb20gJy4vRmlsZSc7XG5cbmltcG9ydCB7IERhdGUsIERhdGVRdWVyeSB9IGZyb20gJy4vRGF0ZSc7XG5cbmltcG9ydCB7IFBvaW50ZXIsIFBvaW50ZXJJbnB1dCwgUG9pbnRlclF1ZXJ5IH0gZnJvbSAnLi9Qb2ludGVyJztcblxuaW1wb3J0IHsgSlNPTk9iamVjdCB9IGZyb20gJy4vSlNPTk9iamVjdCc7XG5cbmltcG9ydCB7IFN0cmluZ1F1ZXJ5IH0gZnJvbSAnLi9TdHJpbmdRdWVyeSc7XG5cbmltcG9ydCB7IE51bWJlclF1ZXJ5IH0gZnJvbSAnLi9OdW1iZXJRdWVyeSc7XG5cbmltcG9ydCB7IE51bWJlcklucHV0IH0gZnJvbSAnLi9OdW1iZXJJbnB1dCc7XG5cbmltcG9ydCB7IFBhZ2VJbmZvIH0gZnJvbSAnLi9QYWdlSW5mbyc7XG5cbmltcG9ydCB7IEFycmF5UXVlcnkgfSBmcm9tICcuL0FycmF5JztcblxuaW1wb3J0IHsgQmFzZVF1ZXJ5IH0gZnJvbSAnLi9CYXNlUXVlcnknO1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4vRXZlbnQnO1xuXG5leHBvcnQge1xuICBBQ0wsXG4gIEFDTElucHV0LFxuICBHZW9Qb2ludCxcbiAgR2VvUG9pbnRJbnB1dCxcbiAgRmlsZSxcbiAgRmlsZUlucHV0LFxuICBEYXRlLFxuICBQb2ludGVyLFxuICBKU09OT2JqZWN0LFxuICBQYWdlSW5mbyxcbiAgRXZlbnQsXG59O1xuXG5jb25zdCB0eXBlcyA9IHtcbiAgU3RyaW5nOiBHcmFwaFFMU3RyaW5nLFxuICBOdW1iZXI6IEdyYXBoUUxGbG9hdCxcbiAgQm9vbGVhbjogR3JhcGhRTEJvb2xlYW4sXG4gIEdlb1BvaW50LFxuICBGaWxlLFxuICBBQ0wsXG4gIERhdGUsXG4gIFBvaW50ZXIsXG4gIE9iamVjdDogSlNPTk9iamVjdCxcbiAgQXJyYXk6IG5ldyBHcmFwaFFMTGlzdChKU09OT2JqZWN0KSxcbn07XG5cbmV4cG9ydCBjb25zdCBCb29sZWFuUXVlcnkgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCb29sZWFuUXVlcnknLFxuICBmaWVsZHM6IEJhc2VRdWVyeShHcmFwaFFMQm9vbGVhbiksXG59KTtcblxudHlwZSBQYXJzZUZpZWxkVHlwZSA9IHsgdHlwZTogc3RyaW5nIH07XG5cbmV4cG9ydCBmdW5jdGlvbiB0eXBlKHsgdHlwZSB9OiBQYXJzZUZpZWxkVHlwZSkge1xuICByZXR1cm4gdHlwZXNbdHlwZV07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnB1dFR5cGUoZmllbGQ6IFBhcnNlRmllbGRUeXBlKSB7XG4gIGNvbnN0IHsgdHlwZSB9ID0gZmllbGQ7XG4gIGlmICh0eXBlID09ICdTdHJpbmcnKSB7XG4gICAgcmV0dXJuIEdyYXBoUUxTdHJpbmc7XG4gIH1cbiAgaWYgKHR5cGUgPT0gJ051bWJlcicpIHtcbiAgICByZXR1cm4gTnVtYmVySW5wdXQ7XG4gIH1cbiAgaWYgKHR5cGUgPT0gJ0Jvb2xlYW4nKSB7XG4gICAgcmV0dXJuIEdyYXBoUUxCb29sZWFuO1xuICB9XG4gIGlmICh0eXBlID09ICdHZW9Qb2ludCcpIHtcbiAgICByZXR1cm4gR2VvUG9pbnRJbnB1dDtcbiAgfVxuICBpZiAodHlwZSA9PSAnRmlsZScpIHtcbiAgICByZXR1cm4gRmlsZUlucHV0O1xuICB9IGVsc2UgaWYgKHR5cGUgPT0gJ0FDTCcpIHtcbiAgICByZXR1cm4gQUNMSW5wdXQ7XG4gIH0gZWxzZSBpZiAodHlwZSA9PSAnRGF0ZScpIHtcbiAgICByZXR1cm4gRGF0ZTtcbiAgfSBlbHNlIGlmICh0eXBlID09ICdQb2ludGVyJykge1xuICAgIHJldHVybiBQb2ludGVySW5wdXQoZmllbGQpO1xuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdBcnJheScpIHtcbiAgICByZXR1cm4gbmV3IEdyYXBoUUxMaXN0KEpTT05PYmplY3QpO1xuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdPYmplY3QnKSB7XG4gICAgcmV0dXJuIEpTT05PYmplY3Q7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHF1ZXJ5VHlwZShmaWVsZDogUGFyc2VGaWVsZFR5cGUpIHtcbiAgY29uc3QgeyB0eXBlIH0gPSBmaWVsZDtcbiAgaWYgKHR5cGUgPT0gJ1N0cmluZycpIHtcbiAgICByZXR1cm4gU3RyaW5nUXVlcnk7XG4gIH1cbiAgaWYgKHR5cGUgPT0gJ051bWJlcicpIHtcbiAgICByZXR1cm4gTnVtYmVyUXVlcnk7XG4gIH1cbiAgaWYgKHR5cGUgPT0gJ0Jvb2xlYW4nKSB7XG4gICAgcmV0dXJuIEJvb2xlYW5RdWVyeTtcbiAgfVxuICBpZiAodHlwZSA9PSAnR2VvUG9pbnQnKSB7XG4gICAgcmV0dXJuIEdlb1BvaW50UXVlcnk7XG4gIH1cbiAgaWYgKHR5cGUgPT0gJ0ZpbGUnKSB7XG4gICAgLy8gQ2Fubm90IHF1ZXJ5IG9uIGZpbGVzXG4gICAgcmV0dXJuO1xuICB9IGVsc2UgaWYgKHR5cGUgPT0gJ0FDTCcpIHtcbiAgICAvLyBjYW5ub3QgcXVlcnkgb24gQUNMIVxuICAgIHJldHVybjtcbiAgfSBlbHNlIGlmICh0eXBlID09ICdEYXRlJykge1xuICAgIHJldHVybiBEYXRlUXVlcnk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gUG9pbnRlclF1ZXJ5KGZpZWxkKTtcbiAgfSBlbHNlIGlmICh0eXBlID09ICdBcnJheScpIHtcbiAgICByZXR1cm4gQXJyYXlRdWVyeTtcbiAgfVxufVxuIl19