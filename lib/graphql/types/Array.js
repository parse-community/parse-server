"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ArrayQuery = void 0;

var _graphql = require("graphql");

var _JSONObject = require("./JSONObject");

var _BaseQuery = require("./BaseQuery");

const ArrayQuery = new _graphql.GraphQLInputObjectType({
  name: 'ArrayQuery',
  fields: Object.assign({}, (0, _BaseQuery.BaseQuery)(_JSONObject.JSONObject), {
    eq: {
      type: _JSONObject.JSONObject,
      description: 'Test for equality'
    },
    all: {
      type: (0, _graphql.GraphQLList)(_JSONObject.JSONObject),
      description: 'Constraints that require the array to contain all the values'
    }
  })
});
exports.ArrayQuery = ArrayQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9ncmFwaHFsL3R5cGVzL0FycmF5LmpzIl0sIm5hbWVzIjpbIkFycmF5UXVlcnkiLCJHcmFwaFFMSW5wdXRPYmplY3RUeXBlIiwibmFtZSIsImZpZWxkcyIsIk9iamVjdCIsImFzc2lnbiIsIkpTT05PYmplY3QiLCJlcSIsInR5cGUiLCJkZXNjcmlwdGlvbiIsImFsbCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUVBOztBQUVPLE1BQU1BLFVBQVUsR0FBRyxJQUFJQywrQkFBSixDQUEyQjtBQUNuREMsRUFBQUEsSUFBSSxFQUFFLFlBRDZDO0FBRW5EQyxFQUFBQSxNQUFNLEVBQUVDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjLEVBQWQsRUFBa0IsMEJBQVVDLHNCQUFWLENBQWxCLEVBQXlDO0FBQy9DQyxJQUFBQSxFQUFFLEVBQUU7QUFDRkMsTUFBQUEsSUFBSSxFQUFFRixzQkFESjtBQUVGRyxNQUFBQSxXQUFXLEVBQUU7QUFGWCxLQUQyQztBQUsvQ0MsSUFBQUEsR0FBRyxFQUFFO0FBQ0hGLE1BQUFBLElBQUksRUFBRSwwQkFBWUYsc0JBQVosQ0FESDtBQUVIRyxNQUFBQSxXQUFXLEVBQ1Q7QUFIQztBQUwwQyxHQUF6QztBQUYyQyxDQUEzQixDQUFuQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsIEdyYXBoUUxMaXN0IH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBKU09OT2JqZWN0IH0gZnJvbSAnLi9KU09OT2JqZWN0JztcblxuaW1wb3J0IHsgQmFzZVF1ZXJ5IH0gZnJvbSAnLi9CYXNlUXVlcnknO1xuXG5leHBvcnQgY29uc3QgQXJyYXlRdWVyeSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0FycmF5UXVlcnknLFxuICBmaWVsZHM6IE9iamVjdC5hc3NpZ24oe30sIEJhc2VRdWVyeShKU09OT2JqZWN0KSwge1xuICAgIGVxOiB7XG4gICAgICB0eXBlOiBKU09OT2JqZWN0LFxuICAgICAgZGVzY3JpcHRpb246ICdUZXN0IGZvciBlcXVhbGl0eScsXG4gICAgfSxcbiAgICBhbGw6IHtcbiAgICAgIHR5cGU6IEdyYXBoUUxMaXN0KEpTT05PYmplY3QpLFxuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdDb25zdHJhaW50cyB0aGF0IHJlcXVpcmUgdGhlIGFycmF5IHRvIGNvbnRhaW4gYWxsIHRoZSB2YWx1ZXMnLFxuICAgIH0sXG4gIH0pLFxufSk7XG4iXX0=