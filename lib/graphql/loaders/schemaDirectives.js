"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.definitions = void 0;

var _graphqlTag = _interopRequireDefault(require("graphql-tag"));

var _graphqlTools = require("graphql-tools");

var _FunctionsRouter = require("../../Routers/FunctionsRouter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const definitions = _graphqlTag.default`
  directive @resolve(to: String) on FIELD_DEFINITION
  directive @mock(with: Any!) on FIELD_DEFINITION
`;
exports.definitions = definitions;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLSchemaDirectivesDefinitions = definitions;

  class ResolveDirectiveVisitor extends _graphqlTools.SchemaDirectiveVisitor {
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

  class MockDirectiveVisitor extends _graphqlTools.SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = () => {
        return this.args.with;
      };
    }

  }

  parseGraphQLSchema.graphQLSchemaDirectives.mock = MockDirectiveVisitor;
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hRGlyZWN0aXZlcy5qcyJdLCJuYW1lcyI6WyJkZWZpbml0aW9ucyIsImdxbCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiUmVzb2x2ZURpcmVjdGl2ZVZpc2l0b3IiLCJTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIiwidmlzaXRGaWVsZERlZmluaXRpb24iLCJmaWVsZCIsInJlc29sdmUiLCJfc291cmNlIiwiYXJncyIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsImZ1bmN0aW9uTmFtZSIsIm5hbWUiLCJ0byIsIkZ1bmN0aW9uc1JvdXRlciIsImhhbmRsZUNsb3VkRnVuY3Rpb24iLCJwYXJhbXMiLCJib2R5IiwicmVzcG9uc2UiLCJyZXN1bHQiLCJlIiwiaGFuZGxlRXJyb3IiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyIsIk1vY2tEaXJlY3RpdmVWaXNpdG9yIiwid2l0aCIsIm1vY2siXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7OztBQUVPLE1BQU1BLFdBQVcsR0FBR0MsbUJBQUk7OztDQUF4Qjs7O0FBS1AsTUFBTUMsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQ0EsRUFBQUEsa0JBQWtCLENBQUNDLGtDQUFuQixHQUF3REosV0FBeEQ7O0FBRUEsUUFBTUssdUJBQU4sU0FBc0NDLG9DQUF0QyxDQUE2RDtBQUMzREMsSUFBQUEsb0JBQW9CLENBQUNDLEtBQUQsRUFBUTtBQUMxQkEsTUFBQUEsS0FBSyxDQUFDQyxPQUFOLEdBQWdCLE9BQU9DLE9BQVAsRUFBZ0JDLElBQWhCLEVBQXNCQyxPQUF0QixLQUFrQztBQUNoRCxZQUFJO0FBQ0YsZ0JBQU07QUFBRUMsWUFBQUEsTUFBRjtBQUFVQyxZQUFBQSxJQUFWO0FBQWdCQyxZQUFBQTtBQUFoQixjQUF5QkgsT0FBL0I7QUFFQSxjQUFJSSxZQUFZLEdBQUdSLEtBQUssQ0FBQ1MsSUFBekI7O0FBQ0EsY0FBSSxLQUFLTixJQUFMLENBQVVPLEVBQWQsRUFBa0I7QUFDaEJGLFlBQUFBLFlBQVksR0FBRyxLQUFLTCxJQUFMLENBQVVPLEVBQXpCO0FBQ0Q7O0FBRUQsaUJBQU8sQ0FBQyxNQUFNQyxpQ0FBZ0JDLG1CQUFoQixDQUFvQztBQUNoREMsWUFBQUEsTUFBTSxFQUFFO0FBQ05MLGNBQUFBO0FBRE0sYUFEd0M7QUFJaERILFlBQUFBLE1BSmdEO0FBS2hEQyxZQUFBQSxJQUxnRDtBQU1oREMsWUFBQUEsSUFOZ0Q7QUFPaERPLFlBQUFBLElBQUksRUFBRVg7QUFQMEMsV0FBcEMsQ0FBUCxFQVFIWSxRQVJHLENBUU1DLE1BUmI7QUFTRCxTQWpCRCxDQWlCRSxPQUFPQyxDQUFQLEVBQVU7QUFDVnRCLFVBQUFBLGtCQUFrQixDQUFDdUIsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRixPQXJCRDtBQXNCRDs7QUF4QjBEOztBQTJCN0R0QixFQUFBQSxrQkFBa0IsQ0FBQ3dCLHVCQUFuQixDQUEyQ2xCLE9BQTNDLEdBQXFESix1QkFBckQ7O0FBRUEsUUFBTXVCLG9CQUFOLFNBQW1DdEIsb0NBQW5DLENBQTBEO0FBQ3hEQyxJQUFBQSxvQkFBb0IsQ0FBQ0MsS0FBRCxFQUFRO0FBQzFCQSxNQUFBQSxLQUFLLENBQUNDLE9BQU4sR0FBZ0IsTUFBTTtBQUNwQixlQUFPLEtBQUtFLElBQUwsQ0FBVWtCLElBQWpCO0FBQ0QsT0FGRDtBQUdEOztBQUx1RDs7QUFRMUQxQixFQUFBQSxrQkFBa0IsQ0FBQ3dCLHVCQUFuQixDQUEyQ0csSUFBM0MsR0FBa0RGLG9CQUFsRDtBQUNELENBekNEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGdxbCBmcm9tICdncmFwaHFsLXRhZyc7XG5pbXBvcnQgeyBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIH0gZnJvbSAnZ3JhcGhxbC10b29scyc7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuLi8uLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5cbmV4cG9ydCBjb25zdCBkZWZpbml0aW9ucyA9IGdxbGBcbiAgZGlyZWN0aXZlIEByZXNvbHZlKHRvOiBTdHJpbmcpIG9uIEZJRUxEX0RFRklOSVRJT05cbiAgZGlyZWN0aXZlIEBtb2NrKHdpdGg6IEFueSEpIG9uIEZJRUxEX0RFRklOSVRJT05cbmA7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyA9IGRlZmluaXRpb25zO1xuXG4gIGNsYXNzIFJlc29sdmVEaXJlY3RpdmVWaXNpdG9yIGV4dGVuZHMgU2NoZW1hRGlyZWN0aXZlVmlzaXRvciB7XG4gICAgdmlzaXRGaWVsZERlZmluaXRpb24oZmllbGQpIHtcbiAgICAgIGZpZWxkLnJlc29sdmUgPSBhc3luYyAoX3NvdXJjZSwgYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgbGV0IGZ1bmN0aW9uTmFtZSA9IGZpZWxkLm5hbWU7XG4gICAgICAgICAgaWYgKHRoaXMuYXJncy50bykge1xuICAgICAgICAgICAgZnVuY3Rpb25OYW1lID0gdGhpcy5hcmdzLnRvO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiAoYXdhaXQgRnVuY3Rpb25zUm91dGVyLmhhbmRsZUNsb3VkRnVuY3Rpb24oe1xuICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgIGZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgIGJvZHk6IGFyZ3MsXG4gICAgICAgICAgfSkpLnJlc3BvbnNlLnJlc3VsdDtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMucmVzb2x2ZSA9IFJlc29sdmVEaXJlY3RpdmVWaXNpdG9yO1xuXG4gIGNsYXNzIE1vY2tEaXJlY3RpdmVWaXNpdG9yIGV4dGVuZHMgU2NoZW1hRGlyZWN0aXZlVmlzaXRvciB7XG4gICAgdmlzaXRGaWVsZERlZmluaXRpb24oZmllbGQpIHtcbiAgICAgIGZpZWxkLnJlc29sdmUgPSAoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmFyZ3Mud2l0aDtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzLm1vY2sgPSBNb2NrRGlyZWN0aXZlVmlzaXRvcjtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==