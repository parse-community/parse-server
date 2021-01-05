"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.definitions = void 0;

var _graphqlTag = _interopRequireDefault(require("graphql-tag"));

var _utils = require("@graphql-tools/utils");

var _FunctionsRouter = require("../../Routers/FunctionsRouter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const definitions = (0, _graphqlTag.default)`
  directive @resolve(to: String) on FIELD_DEFINITION
  directive @mock(with: Any!) on FIELD_DEFINITION
`;
exports.definitions = definitions;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLSchemaDirectivesDefinitions = definitions;

  class ResolveDirectiveVisitor extends _utils.SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = async (_source, args, context) => {
        try {
          const {
            config,
            auth,
            info
          } = context;
          let functionName = field.name;

          if (this.args.to) {
            functionName = this.args.to;
          }

          return (await _FunctionsRouter.FunctionsRouter.handleCloudFunction({
            params: {
              functionName
            },
            config,
            auth,
            info,
            body: args
          })).response.result;
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      };
    }

  }

  parseGraphQLSchema.graphQLSchemaDirectives.resolve = ResolveDirectiveVisitor;

  class MockDirectiveVisitor extends _utils.SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = () => {
        return this.args.with;
      };
    }

  }

  parseGraphQLSchema.graphQLSchemaDirectives.mock = MockDirectiveVisitor;
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hRGlyZWN0aXZlcy5qcyJdLCJuYW1lcyI6WyJkZWZpbml0aW9ucyIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiUmVzb2x2ZURpcmVjdGl2ZVZpc2l0b3IiLCJTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIiwidmlzaXRGaWVsZERlZmluaXRpb24iLCJmaWVsZCIsInJlc29sdmUiLCJfc291cmNlIiwiYXJncyIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsImZ1bmN0aW9uTmFtZSIsIm5hbWUiLCJ0byIsIkZ1bmN0aW9uc1JvdXRlciIsImhhbmRsZUNsb3VkRnVuY3Rpb24iLCJwYXJhbXMiLCJib2R5IiwicmVzcG9uc2UiLCJyZXN1bHQiLCJlIiwiaGFuZGxlRXJyb3IiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyIsIk1vY2tEaXJlY3RpdmVWaXNpdG9yIiwid2l0aCIsIm1vY2siXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7OztBQUVPLE1BQU1BLFdBQVcsR0FBRyx3QkFBSTs7O0NBQXhCOzs7QUFLUCxNQUFNQyxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDQSxFQUFBQSxrQkFBa0IsQ0FBQ0Msa0NBQW5CLEdBQXdESCxXQUF4RDs7QUFFQSxRQUFNSSx1QkFBTixTQUFzQ0MsNkJBQXRDLENBQTZEO0FBQzNEQyxJQUFBQSxvQkFBb0IsQ0FBQ0MsS0FBRCxFQUFRO0FBQzFCQSxNQUFBQSxLQUFLLENBQUNDLE9BQU4sR0FBZ0IsT0FBT0MsT0FBUCxFQUFnQkMsSUFBaEIsRUFBc0JDLE9BQXRCLEtBQWtDO0FBQ2hELFlBQUk7QUFDRixnQkFBTTtBQUFFQyxZQUFBQSxNQUFGO0FBQVVDLFlBQUFBLElBQVY7QUFBZ0JDLFlBQUFBO0FBQWhCLGNBQXlCSCxPQUEvQjtBQUVBLGNBQUlJLFlBQVksR0FBR1IsS0FBSyxDQUFDUyxJQUF6Qjs7QUFDQSxjQUFJLEtBQUtOLElBQUwsQ0FBVU8sRUFBZCxFQUFrQjtBQUNoQkYsWUFBQUEsWUFBWSxHQUFHLEtBQUtMLElBQUwsQ0FBVU8sRUFBekI7QUFDRDs7QUFFRCxpQkFBTyxDQUNMLE1BQU1DLGlDQUFnQkMsbUJBQWhCLENBQW9DO0FBQ3hDQyxZQUFBQSxNQUFNLEVBQUU7QUFDTkwsY0FBQUE7QUFETSxhQURnQztBQUl4Q0gsWUFBQUEsTUFKd0M7QUFLeENDLFlBQUFBLElBTHdDO0FBTXhDQyxZQUFBQSxJQU53QztBQU94Q08sWUFBQUEsSUFBSSxFQUFFWDtBQVBrQyxXQUFwQyxDQURELEVBVUxZLFFBVkssQ0FVSUMsTUFWWDtBQVdELFNBbkJELENBbUJFLE9BQU9DLENBQVAsRUFBVTtBQUNWdEIsVUFBQUEsa0JBQWtCLENBQUN1QixXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGLE9BdkJEO0FBd0JEOztBQTFCMEQ7O0FBNkI3RHRCLEVBQUFBLGtCQUFrQixDQUFDd0IsdUJBQW5CLENBQTJDbEIsT0FBM0MsR0FBcURKLHVCQUFyRDs7QUFFQSxRQUFNdUIsb0JBQU4sU0FBbUN0Qiw2QkFBbkMsQ0FBMEQ7QUFDeERDLElBQUFBLG9CQUFvQixDQUFDQyxLQUFELEVBQVE7QUFDMUJBLE1BQUFBLEtBQUssQ0FBQ0MsT0FBTixHQUFnQixNQUFNO0FBQ3BCLGVBQU8sS0FBS0UsSUFBTCxDQUFVa0IsSUFBakI7QUFDRCxPQUZEO0FBR0Q7O0FBTHVEOztBQVExRDFCLEVBQUFBLGtCQUFrQixDQUFDd0IsdUJBQW5CLENBQTJDRyxJQUEzQyxHQUFrREYsb0JBQWxEO0FBQ0QsQ0EzQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZ3FsIGZyb20gJ2dyYXBocWwtdGFnJztcbmltcG9ydCB7IFNjaGVtYURpcmVjdGl2ZVZpc2l0b3IgfSBmcm9tICdAZ3JhcGhxbC10b29scy91dGlscyc7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuLi8uLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5cbmV4cG9ydCBjb25zdCBkZWZpbml0aW9ucyA9IGdxbGBcbiAgZGlyZWN0aXZlIEByZXNvbHZlKHRvOiBTdHJpbmcpIG9uIEZJRUxEX0RFRklOSVRJT05cbiAgZGlyZWN0aXZlIEBtb2NrKHdpdGg6IEFueSEpIG9uIEZJRUxEX0RFRklOSVRJT05cbmA7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyA9IGRlZmluaXRpb25zO1xuXG4gIGNsYXNzIFJlc29sdmVEaXJlY3RpdmVWaXNpdG9yIGV4dGVuZHMgU2NoZW1hRGlyZWN0aXZlVmlzaXRvciB7XG4gICAgdmlzaXRGaWVsZERlZmluaXRpb24oZmllbGQpIHtcbiAgICAgIGZpZWxkLnJlc29sdmUgPSBhc3luYyAoX3NvdXJjZSwgYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgbGV0IGZ1bmN0aW9uTmFtZSA9IGZpZWxkLm5hbWU7XG4gICAgICAgICAgaWYgKHRoaXMuYXJncy50bykge1xuICAgICAgICAgICAgZnVuY3Rpb25OYW1lID0gdGhpcy5hcmdzLnRvO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICBhd2FpdCBGdW5jdGlvbnNSb3V0ZXIuaGFuZGxlQ2xvdWRGdW5jdGlvbih7XG4gICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgIGZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBib2R5OiBhcmdzLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICApLnJlc3BvbnNlLnJlc3VsdDtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMucmVzb2x2ZSA9IFJlc29sdmVEaXJlY3RpdmVWaXNpdG9yO1xuXG4gIGNsYXNzIE1vY2tEaXJlY3RpdmVWaXNpdG9yIGV4dGVuZHMgU2NoZW1hRGlyZWN0aXZlVmlzaXRvciB7XG4gICAgdmlzaXRGaWVsZERlZmluaXRpb24oZmllbGQpIHtcbiAgICAgIGZpZWxkLnJlc29sdmUgPSAoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmFyZ3Mud2l0aDtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzLm1vY2sgPSBNb2NrRGlyZWN0aXZlVmlzaXRvcjtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==