"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Node = void 0;

var _graphql = require("graphql");

const Node = new _graphql.GraphQLInterfaceType({
  name: 'Node',
  fields: {
    id: {
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    }
  }
});
exports.Node = Node;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9ncmFwaHFsL3R5cGVzL05vZGUuanMiXSwibmFtZXMiOlsiTm9kZSIsIkdyYXBoUUxJbnRlcmZhY2VUeXBlIiwibmFtZSIsImZpZWxkcyIsImlkIiwidHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiR3JhcGhRTElEIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBRU8sTUFBTUEsSUFBSSxHQUFHLElBQUlDLDZCQUFKLENBQXlCO0FBQzNDQyxFQUFBQSxJQUFJLEVBQUUsTUFEcUM7QUFFM0NDLEVBQUFBLE1BQU0sRUFBRTtBQUNOQyxJQUFBQSxFQUFFLEVBQUU7QUFDRkMsTUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQW1CQyxrQkFBbkI7QUFESjtBQURFO0FBRm1DLENBQXpCLENBQWIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMSUQsIEdyYXBoUUxOb25OdWxsLCBHcmFwaFFMSW50ZXJmYWNlVHlwZSB9IGZyb20gJ2dyYXBocWwnO1xuXG5leHBvcnQgY29uc3QgTm9kZSA9IG5ldyBHcmFwaFFMSW50ZXJmYWNlVHlwZSh7XG4gIG5hbWU6ICdOb2RlJyxcbiAgZmllbGRzOiB7XG4gICAgaWQ6IHtcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxuICAgIH0sXG4gIH0sXG59KTtcbiJdfQ==