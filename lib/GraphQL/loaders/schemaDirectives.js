"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.definitions = void 0;

var _graphqlTag = _interopRequireDefault(require("graphql-tag"));

var _graphqlTools = require("graphql-tools");

var _FunctionsRouter = require("../../Routers/FunctionsRouter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const definitions = (0, _graphqlTag.default)`
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hRGlyZWN0aXZlcy5qcyJdLCJuYW1lcyI6WyJkZWZpbml0aW9ucyIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiUmVzb2x2ZURpcmVjdGl2ZVZpc2l0b3IiLCJTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIiwidmlzaXRGaWVsZERlZmluaXRpb24iLCJmaWVsZCIsInJlc29sdmUiLCJfc291cmNlIiwiYXJncyIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsImZ1bmN0aW9uTmFtZSIsIm5hbWUiLCJ0byIsIkZ1bmN0aW9uc1JvdXRlciIsImhhbmRsZUNsb3VkRnVuY3Rpb24iLCJwYXJhbXMiLCJib2R5IiwicmVzcG9uc2UiLCJyZXN1bHQiLCJlIiwiaGFuZGxlRXJyb3IiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyIsIk1vY2tEaXJlY3RpdmVWaXNpdG9yIiwid2l0aCIsIm1vY2siXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7OztBQUVPLE1BQU1BLFdBQVcsR0FBRyx3QkFBSTs7O0NBQXhCOzs7QUFLUCxNQUFNQyxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDQSxFQUFBQSxrQkFBa0IsQ0FBQ0Msa0NBQW5CLEdBQXdESCxXQUF4RDs7QUFFQSxRQUFNSSx1QkFBTixTQUFzQ0Msb0NBQXRDLENBQTZEO0FBQzNEQyxJQUFBQSxvQkFBb0IsQ0FBQ0MsS0FBRCxFQUFRO0FBQzFCQSxNQUFBQSxLQUFLLENBQUNDLE9BQU4sR0FBZ0IsT0FBT0MsT0FBUCxFQUFnQkMsSUFBaEIsRUFBc0JDLE9BQXRCLEtBQWtDO0FBQ2hELFlBQUk7QUFDRixnQkFBTTtBQUFFQyxZQUFBQSxNQUFGO0FBQVVDLFlBQUFBLElBQVY7QUFBZ0JDLFlBQUFBO0FBQWhCLGNBQXlCSCxPQUEvQjtBQUVBLGNBQUlJLFlBQVksR0FBR1IsS0FBSyxDQUFDUyxJQUF6Qjs7QUFDQSxjQUFJLEtBQUtOLElBQUwsQ0FBVU8sRUFBZCxFQUFrQjtBQUNoQkYsWUFBQUEsWUFBWSxHQUFHLEtBQUtMLElBQUwsQ0FBVU8sRUFBekI7QUFDRDs7QUFFRCxpQkFBTyxDQUFDLE1BQU1DLGlDQUFnQkMsbUJBQWhCLENBQW9DO0FBQ2hEQyxZQUFBQSxNQUFNLEVBQUU7QUFDTkwsY0FBQUE7QUFETSxhQUR3QztBQUloREgsWUFBQUEsTUFKZ0Q7QUFLaERDLFlBQUFBLElBTGdEO0FBTWhEQyxZQUFBQSxJQU5nRDtBQU9oRE8sWUFBQUEsSUFBSSxFQUFFWDtBQVAwQyxXQUFwQyxDQUFQLEVBUUhZLFFBUkcsQ0FRTUMsTUFSYjtBQVNELFNBakJELENBaUJFLE9BQU9DLENBQVAsRUFBVTtBQUNWdEIsVUFBQUEsa0JBQWtCLENBQUN1QixXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGLE9BckJEO0FBc0JEOztBQXhCMEQ7O0FBMkI3RHRCLEVBQUFBLGtCQUFrQixDQUFDd0IsdUJBQW5CLENBQTJDbEIsT0FBM0MsR0FBcURKLHVCQUFyRDs7QUFFQSxRQUFNdUIsb0JBQU4sU0FBbUN0QixvQ0FBbkMsQ0FBMEQ7QUFDeERDLElBQUFBLG9CQUFvQixDQUFDQyxLQUFELEVBQVE7QUFDMUJBLE1BQUFBLEtBQUssQ0FBQ0MsT0FBTixHQUFnQixNQUFNO0FBQ3BCLGVBQU8sS0FBS0UsSUFBTCxDQUFVa0IsSUFBakI7QUFDRCxPQUZEO0FBR0Q7O0FBTHVEOztBQVExRDFCLEVBQUFBLGtCQUFrQixDQUFDd0IsdUJBQW5CLENBQTJDRyxJQUEzQyxHQUFrREYsb0JBQWxEO0FBQ0QsQ0F6Q0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZ3FsIGZyb20gJ2dyYXBocWwtdGFnJztcbmltcG9ydCB7IFNjaGVtYURpcmVjdGl2ZVZpc2l0b3IgfSBmcm9tICdncmFwaHFsLXRvb2xzJztcbmltcG9ydCB7IEZ1bmN0aW9uc1JvdXRlciB9IGZyb20gJy4uLy4uL1JvdXRlcnMvRnVuY3Rpb25zUm91dGVyJztcblxuZXhwb3J0IGNvbnN0IGRlZmluaXRpb25zID0gZ3FsYFxuICBkaXJlY3RpdmUgQHJlc29sdmUodG86IFN0cmluZykgb24gRklFTERfREVGSU5JVElPTlxuICBkaXJlY3RpdmUgQG1vY2sod2l0aDogQW55ISkgb24gRklFTERfREVGSU5JVElPTlxuYDtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zID0gZGVmaW5pdGlvbnM7XG5cbiAgY2xhc3MgUmVzb2x2ZURpcmVjdGl2ZVZpc2l0b3IgZXh0ZW5kcyBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIHtcbiAgICB2aXNpdEZpZWxkRGVmaW5pdGlvbihmaWVsZCkge1xuICAgICAgZmllbGQucmVzb2x2ZSA9IGFzeW5jIChfc291cmNlLCBhcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBsZXQgZnVuY3Rpb25OYW1lID0gZmllbGQubmFtZTtcbiAgICAgICAgICBpZiAodGhpcy5hcmdzLnRvKSB7XG4gICAgICAgICAgICBmdW5jdGlvbk5hbWUgPSB0aGlzLmFyZ3MudG87XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIChhd2FpdCBGdW5jdGlvbnNSb3V0ZXIuaGFuZGxlQ2xvdWRGdW5jdGlvbih7XG4gICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgZnVuY3Rpb25OYW1lLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgYm9keTogYXJncyxcbiAgICAgICAgICB9KSkucmVzcG9uc2UucmVzdWx0O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcy5yZXNvbHZlID0gUmVzb2x2ZURpcmVjdGl2ZVZpc2l0b3I7XG5cbiAgY2xhc3MgTW9ja0RpcmVjdGl2ZVZpc2l0b3IgZXh0ZW5kcyBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIHtcbiAgICB2aXNpdEZpZWxkRGVmaW5pdGlvbihmaWVsZCkge1xuICAgICAgZmllbGQucmVzb2x2ZSA9ICgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXJncy53aXRoO1xuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMubW9jayA9IE1vY2tEaXJlY3RpdmVWaXNpdG9yO1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19