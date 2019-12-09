"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.getNode = void 0;

var _execute = require("../execute");

var _Node = require("../types/Node");

var _graphql = require("graphql");

const getNode = schema => ({
  type: _Node.Node,
  description: `Common endpoint`,
  args: {
    id: {
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    }
  },
  resolve: async (root, args, context, info) => {
    const {
      className,
      objectId
    } = (0, _execute.parseID)(args.id);
    return await (0, _execute.runGet)(context, info, className, objectId, schema);
  }
});

exports.getNode = getNode;
var _default = {
  Query: schema => {
    return {
      node: getNode(schema)
    };
  }
};
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9ncmFwaHFsL3NjaGVtYXMvTm9kZS5qcyJdLCJuYW1lcyI6WyJnZXROb2RlIiwic2NoZW1hIiwidHlwZSIsIk5vZGUiLCJkZXNjcmlwdGlvbiIsImFyZ3MiLCJpZCIsIkdyYXBoUUxOb25OdWxsIiwiR3JhcGhRTElEIiwicmVzb2x2ZSIsInJvb3QiLCJjb250ZXh0IiwiaW5mbyIsImNsYXNzTmFtZSIsIm9iamVjdElkIiwiUXVlcnkiLCJub2RlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBRUE7O0FBRU8sTUFBTUEsT0FBTyxHQUFHQyxNQUFNLEtBQUs7QUFDaENDLEVBQUFBLElBQUksRUFBRUMsVUFEMEI7QUFFaENDLEVBQUFBLFdBQVcsRUFBRyxpQkFGa0I7QUFHaENDLEVBQUFBLElBQUksRUFBRTtBQUNKQyxJQUFBQSxFQUFFLEVBQUU7QUFBRUosTUFBQUEsSUFBSSxFQUFFLElBQUlLLHVCQUFKLENBQW1CQyxrQkFBbkI7QUFBUjtBQURBLEdBSDBCO0FBTWhDQyxFQUFBQSxPQUFPLEVBQUUsT0FBT0MsSUFBUCxFQUFhTCxJQUFiLEVBQW1CTSxPQUFuQixFQUE0QkMsSUFBNUIsS0FBcUM7QUFDNUMsVUFBTTtBQUFFQyxNQUFBQSxTQUFGO0FBQWFDLE1BQUFBO0FBQWIsUUFBMEIsc0JBQVFULElBQUksQ0FBQ0MsRUFBYixDQUFoQztBQUNBLFdBQU8sTUFBTSxxQkFBT0ssT0FBUCxFQUFnQkMsSUFBaEIsRUFBc0JDLFNBQXRCLEVBQWlDQyxRQUFqQyxFQUEyQ2IsTUFBM0MsQ0FBYjtBQUNEO0FBVCtCLENBQUwsQ0FBdEI7OztlQVlRO0FBQ2JjLEVBQUFBLEtBQUssRUFBRWQsTUFBTSxJQUFJO0FBQ2YsV0FBTztBQUNMZSxNQUFBQSxJQUFJLEVBQUVoQixPQUFPLENBQUNDLE1BQUQ7QUFEUixLQUFQO0FBR0Q7QUFMWSxDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgcnVuR2V0LCBwYXJzZUlEIH0gZnJvbSAnLi4vZXhlY3V0ZSc7XG5pbXBvcnQgeyBOb2RlIH0gZnJvbSAnLi4vdHlwZXMvTm9kZSc7XG5cbmltcG9ydCB7IEdyYXBoUUxJRCwgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcblxuZXhwb3J0IGNvbnN0IGdldE5vZGUgPSBzY2hlbWEgPT4gKHtcbiAgdHlwZTogTm9kZSxcbiAgZGVzY3JpcHRpb246IGBDb21tb24gZW5kcG9pbnRgLFxuICBhcmdzOiB7XG4gICAgaWQ6IHsgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCkgfSxcbiAgfSxcbiAgcmVzb2x2ZTogYXN5bmMgKHJvb3QsIGFyZ3MsIGNvbnRleHQsIGluZm8pID0+IHtcbiAgICBjb25zdCB7IGNsYXNzTmFtZSwgb2JqZWN0SWQgfSA9IHBhcnNlSUQoYXJncy5pZCk7XG4gICAgcmV0dXJuIGF3YWl0IHJ1bkdldChjb250ZXh0LCBpbmZvLCBjbGFzc05hbWUsIG9iamVjdElkLCBzY2hlbWEpO1xuICB9LFxufSk7XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgUXVlcnk6IHNjaGVtYSA9PiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG5vZGU6IGdldE5vZGUoc2NoZW1hKSxcbiAgICB9O1xuICB9LFxufTtcbiJdfQ==