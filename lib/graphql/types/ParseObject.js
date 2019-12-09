"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseObjectInterface = void 0;

var _graphql = require("graphql");

var _index = require("./index");

const ParseObjectInterface = new _graphql.GraphQLInterfaceType({
  name: 'ParseObject',
  fields: {
    objectId: {
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    },
    createdAt: {
      type: (0, _index.type)({
        type: 'Date'
      })
    },
    updatedAt: {
      type: (0, _index.type)({
        type: 'Date'
      })
    },
    ACL: {
      type: (0, _index.type)({
        type: 'ACL'
      })
    }
  }
});
exports.ParseObjectInterface = ParseObjectInterface;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9ncmFwaHFsL3R5cGVzL1BhcnNlT2JqZWN0LmpzIl0sIm5hbWVzIjpbIlBhcnNlT2JqZWN0SW50ZXJmYWNlIiwiR3JhcGhRTEludGVyZmFjZVR5cGUiLCJuYW1lIiwiZmllbGRzIiwib2JqZWN0SWQiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMSUQiLCJjcmVhdGVkQXQiLCJ1cGRhdGVkQXQiLCJBQ0wiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFFQTs7QUFFTyxNQUFNQSxvQkFBb0IsR0FBRyxJQUFJQyw2QkFBSixDQUF5QjtBQUMzREMsRUFBQUEsSUFBSSxFQUFFLGFBRHFEO0FBRTNEQyxFQUFBQSxNQUFNLEVBQUU7QUFDTkMsSUFBQUEsUUFBUSxFQUFFO0FBQ1JDLE1BQUFBLElBQUksRUFBRSxJQUFJQyx1QkFBSixDQUFtQkMsa0JBQW5CO0FBREUsS0FESjtBQUlOQyxJQUFBQSxTQUFTLEVBQUU7QUFDVEgsTUFBQUEsSUFBSSxFQUFFLGlCQUFLO0FBQUVBLFFBQUFBLElBQUksRUFBRTtBQUFSLE9BQUw7QUFERyxLQUpMO0FBT05JLElBQUFBLFNBQVMsRUFBRTtBQUNUSixNQUFBQSxJQUFJLEVBQUUsaUJBQUs7QUFBRUEsUUFBQUEsSUFBSSxFQUFFO0FBQVIsT0FBTDtBQURHLEtBUEw7QUFVTkssSUFBQUEsR0FBRyxFQUFFO0FBQ0hMLE1BQUFBLElBQUksRUFBRSxpQkFBSztBQUFFQSxRQUFBQSxJQUFJLEVBQUU7QUFBUixPQUFMO0FBREg7QUFWQztBQUZtRCxDQUF6QixDQUE3QiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxJRCwgR3JhcGhRTE5vbk51bGwsIEdyYXBoUUxJbnRlcmZhY2VUeXBlIH0gZnJvbSAnZ3JhcGhxbCc7XG5cbmltcG9ydCB7IHR5cGUgfSBmcm9tICcuL2luZGV4JztcblxuZXhwb3J0IGNvbnN0IFBhcnNlT2JqZWN0SW50ZXJmYWNlID0gbmV3IEdyYXBoUUxJbnRlcmZhY2VUeXBlKHtcbiAgbmFtZTogJ1BhcnNlT2JqZWN0JyxcbiAgZmllbGRzOiB7XG4gICAgb2JqZWN0SWQ6IHtcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxuICAgIH0sXG4gICAgY3JlYXRlZEF0OiB7XG4gICAgICB0eXBlOiB0eXBlKHsgdHlwZTogJ0RhdGUnIH0pLFxuICAgIH0sXG4gICAgdXBkYXRlZEF0OiB7XG4gICAgICB0eXBlOiB0eXBlKHsgdHlwZTogJ0RhdGUnIH0pLFxuICAgIH0sXG4gICAgQUNMOiB7XG4gICAgICB0eXBlOiB0eXBlKHsgdHlwZTogJ0FDTCcgfSksXG4gICAgfSxcbiAgfSxcbn0pO1xuIl19