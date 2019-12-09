"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.BaseQuery = void 0;

var _graphql = require("graphql");

var _SelectQuery = require("./SelectQuery");

const BaseQuery = type => {
  return {
    eq: {
      type,
      description: 'Test for equality'
    },
    neq: {
      type,
      description: 'Test for non equality'
    },
    in: {
      type: new _graphql.GraphQLList(type),
      description: 'Test that the object is contained in'
    },
    nin: {
      type: new _graphql.GraphQLList(type)
    },
    exists: {
      type: _graphql.GraphQLBoolean
    },
    select: {
      type: _SelectQuery.SelectQuery,
      description: 'This matches a value for a key in the result of a different query'
    },
    dontSelect: {
      type: _SelectQuery.SelectQuery,
      description: 'Requires that a key’s value not match a value for a key in the result of a different query'
    }
  };
};

exports.BaseQuery = BaseQuery;
var _default = {
  BaseQuery
};
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9ncmFwaHFsL3R5cGVzL0Jhc2VRdWVyeS5qcyJdLCJuYW1lcyI6WyJCYXNlUXVlcnkiLCJ0eXBlIiwiZXEiLCJkZXNjcmlwdGlvbiIsIm5lcSIsImluIiwiR3JhcGhRTExpc3QiLCJuaW4iLCJleGlzdHMiLCJHcmFwaFFMQm9vbGVhbiIsInNlbGVjdCIsIlNlbGVjdFF1ZXJ5IiwiZG9udFNlbGVjdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUVPLE1BQU1BLFNBQVMsR0FBR0MsSUFBSSxJQUFJO0FBQy9CLFNBQU87QUFDTEMsSUFBQUEsRUFBRSxFQUFFO0FBQ0ZELE1BQUFBLElBREU7QUFFRkUsTUFBQUEsV0FBVyxFQUFFO0FBRlgsS0FEQztBQUtMQyxJQUFBQSxHQUFHLEVBQUU7QUFDSEgsTUFBQUEsSUFERztBQUVIRSxNQUFBQSxXQUFXLEVBQUU7QUFGVixLQUxBO0FBU0xFLElBQUFBLEVBQUUsRUFBRTtBQUNGSixNQUFBQSxJQUFJLEVBQUUsSUFBSUssb0JBQUosQ0FBZ0JMLElBQWhCLENBREo7QUFFRkUsTUFBQUEsV0FBVyxFQUFFO0FBRlgsS0FUQztBQWFMSSxJQUFBQSxHQUFHLEVBQUU7QUFDSE4sTUFBQUEsSUFBSSxFQUFFLElBQUlLLG9CQUFKLENBQWdCTCxJQUFoQjtBQURILEtBYkE7QUFnQkxPLElBQUFBLE1BQU0sRUFBRTtBQUNOUCxNQUFBQSxJQUFJLEVBQUVRO0FBREEsS0FoQkg7QUFtQkxDLElBQUFBLE1BQU0sRUFBRTtBQUNOVCxNQUFBQSxJQUFJLEVBQUVVLHdCQURBO0FBRU5SLE1BQUFBLFdBQVcsRUFDVDtBQUhJLEtBbkJIO0FBd0JMUyxJQUFBQSxVQUFVLEVBQUU7QUFDVlgsTUFBQUEsSUFBSSxFQUFFVSx3QkFESTtBQUVWUixNQUFBQSxXQUFXLEVBQ1Q7QUFIUTtBQXhCUCxHQUFQO0FBOEJELENBL0JNOzs7ZUFpQ1E7QUFDYkgsRUFBQUE7QUFEYSxDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTExpc3QsIEdyYXBoUUxCb29sZWFuIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBTZWxlY3RRdWVyeSB9IGZyb20gJy4vU2VsZWN0UXVlcnknO1xuXG5leHBvcnQgY29uc3QgQmFzZVF1ZXJ5ID0gdHlwZSA9PiB7XG4gIHJldHVybiB7XG4gICAgZXE6IHtcbiAgICAgIHR5cGUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Rlc3QgZm9yIGVxdWFsaXR5JyxcbiAgICB9LFxuICAgIG5lcToge1xuICAgICAgdHlwZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGVzdCBmb3Igbm9uIGVxdWFsaXR5JyxcbiAgICB9LFxuICAgIGluOiB7XG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QodHlwZSksXG4gICAgICBkZXNjcmlwdGlvbjogJ1Rlc3QgdGhhdCB0aGUgb2JqZWN0IGlzIGNvbnRhaW5lZCBpbicsXG4gICAgfSxcbiAgICBuaW46IHtcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdCh0eXBlKSxcbiAgICB9LFxuICAgIGV4aXN0czoge1xuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgICBzZWxlY3Q6IHtcbiAgICAgIHR5cGU6IFNlbGVjdFF1ZXJ5LFxuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIG1hdGNoZXMgYSB2YWx1ZSBmb3IgYSBrZXkgaW4gdGhlIHJlc3VsdCBvZiBhIGRpZmZlcmVudCBxdWVyeScsXG4gICAgfSxcbiAgICBkb250U2VsZWN0OiB7XG4gICAgICB0eXBlOiBTZWxlY3RRdWVyeSxcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnUmVxdWlyZXMgdGhhdCBhIGtleeKAmXMgdmFsdWUgbm90IG1hdGNoIGEgdmFsdWUgZm9yIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnknLFxuICAgIH0sXG4gIH07XG59O1xuXG5leHBvcnQgZGVmYXVsdCB7XG4gIEJhc2VRdWVyeSxcbn07XG4iXX0=