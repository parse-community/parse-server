"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _UsersRouter = _interopRequireDefault(require("../../Routers/UsersRouter"));

var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));

var _defaultGraphQLTypes = require("./defaultGraphQLTypes");

var _usersQueries = require("./usersQueries");

var _mutation = require("../transformers/mutation");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const usersRouter = new _UsersRouter.default();

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.isUsersClassDisabled) {
    return;
  }

  const signUpMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'SignUp',
    description: 'The signUp mutation can be used to create and sign up a new user.',
    inputFields: {
      fields: {
        descriptions: 'These are the fields of the new user to be created and signed up.',
        type: parseGraphQLSchema.parseClassTypes['_User'].classGraphQLCreateType
      }
    },
    outputFields: {
      viewer: {
        description: 'This is the new user that was created, signed up and returned as a viewer.',
        type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType)
      }
    },
    mutateAndGetPayload: async (args, context, mutationInfo) => {
      try {
        const {
          fields
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        const parseFields = await (0, _mutation.transformTypes)('create', fields, {
          className: '_User',
          parseGraphQLSchema,
          req: {
            config,
            auth,
            info
          }
        });
        const {
          sessionToken,
          objectId
        } = await objectsMutations.createObject('_User', parseFields, config, auth, info);
        context.info.sessionToken = sessionToken;
        return {
          viewer: await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId)
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(signUpMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(signUpMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('signUp', signUpMutation, true, true);
  const logInWithMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'LogInWith',
    description: 'The logInWith mutation can be used to signup, login user with 3rd party authentication system. This mutation create a user if the authData do not correspond to an existing one.',
    inputFields: {
      authData: {
        descriptions: 'This is the auth data of your custom auth provider',
        type: new _graphql.GraphQLNonNull(_defaultGraphQLTypes.OBJECT)
      },
      fields: {
        descriptions: 'These are the fields of the user to be created/updated and logged in.',
        type: new _graphql.GraphQLInputObjectType({
          name: 'UserLoginWithInput',
          fields: () => {
            const classGraphQLCreateFields = parseGraphQLSchema.parseClassTypes['_User'].classGraphQLCreateType.getFields();
            return Object.keys(classGraphQLCreateFields).reduce((fields, fieldName) => {
              if (fieldName !== 'password' && fieldName !== 'username' && fieldName !== 'authData') {
                fields[fieldName] = classGraphQLCreateFields[fieldName];
              }

              return fields;
            }, {});
          }
        })
      }
    },
    outputFields: {
      viewer: {
        description: 'This is the new user that was created, signed up and returned as a viewer.',
        type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType)
      }
    },
    mutateAndGetPayload: async (args, context, mutationInfo) => {
      try {
        const {
          fields,
          authData
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        const parseFields = await (0, _mutation.transformTypes)('create', fields, {
          className: '_User',
          parseGraphQLSchema,
          req: {
            config,
            auth,
            info
          }
        });
        const {
          sessionToken,
          objectId
        } = await objectsMutations.createObject('_User', _objectSpread(_objectSpread({}, parseFields), {}, {
          authData
        }), config, auth, info);
        context.info.sessionToken = sessionToken;
        return {
          viewer: await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId)
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(logInWithMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(logInWithMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('logInWith', logInWithMutation, true, true);
  const logInMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'LogIn',
    description: 'The logIn mutation can be used to log in an existing user.',
    inputFields: {
      username: {
        description: 'This is the username used to log in the user.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      password: {
        description: 'This is the password used to log in the user.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    outputFields: {
      viewer: {
        description: 'This is the existing user that was logged in and returned as a viewer.',
        type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType)
      }
    },
    mutateAndGetPayload: async (args, context, mutationInfo) => {
      try {
        const {
          username,
          password
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        const {
          sessionToken,
          objectId
        } = (await usersRouter.handleLogIn({
          body: {
            username,
            password
          },
          query: {},
          config,
          auth,
          info
        })).response;
        context.info.sessionToken = sessionToken;
        return {
          viewer: await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId)
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(logInMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(logInMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('logIn', logInMutation, true, true);
  const logOutMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'LogOut',
    description: 'The logOut mutation can be used to log out an existing user.',
    outputFields: {
      viewer: {
        description: 'This is the existing user that was logged out and returned as a viewer.',
        type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType)
      }
    },
    mutateAndGetPayload: async (_args, context, mutationInfo) => {
      try {
        const {
          config,
          auth,
          info
        } = context;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', auth.user.id);
        await usersRouter.handleLogOut({
          config,
          auth,
          info
        });
        return {
          viewer
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(logOutMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(logOutMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('logOut', logOutMutation, true, true);
  const resetPasswordMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'ResetPassword',
    description: 'The resetPassword mutation can be used to reset the password of an existing user.',
    inputFields: {
      email: {
        descriptions: 'Email of the user that should receive the reset email',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    outputFields: {
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async ({
      email
    }, context) => {
      const {
        config,
        auth,
        info
      } = context;
      await usersRouter.handleResetRequest({
        body: {
          email
        },
        config,
        auth,
        info
      });
      return {
        ok: true
      };
    }
  });
  parseGraphQLSchema.addGraphQLType(resetPasswordMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(resetPasswordMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('resetPassword', resetPasswordMutation, true, true);
  const sendVerificationEmailMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'SendVerificationEmail',
    description: 'The sendVerificationEmail mutation can be used to send the verification email again.',
    inputFields: {
      email: {
        descriptions: 'Email of the user that should receive the verification email',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    outputFields: {
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async ({
      email
    }, context) => {
      try {
        const {
          config,
          auth,
          info
        } = context;
        await usersRouter.handleVerificationEmailRequest({
          body: {
            email
          },
          config,
          auth,
          info
        });
        return {
          ok: true
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(sendVerificationEmailMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(sendVerificationEmailMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('sendVerificationEmail', sendVerificationEmailMutation, true, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNpZ25VcE11dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJmaWVsZHMiLCJkZXNjcmlwdGlvbnMiLCJ0eXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsIm91dHB1dEZpZWxkcyIsInZpZXdlciIsIkdyYXBoUUxOb25OdWxsIiwidmlld2VyVHlwZSIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwicGFyc2VGaWVsZHMiLCJjbGFzc05hbWUiLCJyZXEiLCJzZXNzaW9uVG9rZW4iLCJvYmplY3RJZCIsIm9iamVjdHNNdXRhdGlvbnMiLCJjcmVhdGVPYmplY3QiLCJlIiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIiwibG9nSW5XaXRoTXV0YXRpb24iLCJhdXRoRGF0YSIsIk9CSkVDVCIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHMiLCJnZXRGaWVsZHMiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwiZmllbGROYW1lIiwibG9nSW5NdXRhdGlvbiIsInVzZXJuYW1lIiwiR3JhcGhRTFN0cmluZyIsInBhc3N3b3JkIiwiaGFuZGxlTG9nSW4iLCJib2R5IiwicXVlcnkiLCJyZXNwb25zZSIsImxvZ091dE11dGF0aW9uIiwiX2FyZ3MiLCJ1c2VyIiwiaWQiLCJoYW5kbGVMb2dPdXQiLCJyZXNldFBhc3N3b3JkTXV0YXRpb24iLCJlbWFpbCIsIm9rIiwiR3JhcGhRTEJvb2xlYW4iLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbiIsImhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQU1BOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7OztBQUVBLE1BQU1BLFdBQVcsR0FBRyxJQUFJQyxvQkFBSixFQUFwQjs7QUFFQSxNQUFNQyxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDLE1BQUlBLGtCQUFrQixDQUFDQyxvQkFBdkIsRUFBNkM7QUFDM0M7QUFDRDs7QUFFRCxRQUFNQyxjQUFjLEdBQUcsZ0RBQTZCO0FBQ2xEQyxJQUFBQSxJQUFJLEVBQUUsUUFENEM7QUFFbERDLElBQUFBLFdBQVcsRUFDVCxtRUFIZ0Q7QUFJbERDLElBQUFBLFdBQVcsRUFBRTtBQUNYQyxNQUFBQSxNQUFNLEVBQUU7QUFDTkMsUUFBQUEsWUFBWSxFQUNWLG1FQUZJO0FBR05DLFFBQUFBLElBQUksRUFDRlIsa0JBQWtCLENBQUNTLGVBQW5CLENBQW1DLE9BQW5DLEVBQTRDQztBQUp4QztBQURHLEtBSnFDO0FBWWxEQyxJQUFBQSxZQUFZLEVBQUU7QUFDWkMsTUFBQUEsTUFBTSxFQUFFO0FBQ05SLFFBQUFBLFdBQVcsRUFDVCw0RUFGSTtBQUdOSSxRQUFBQSxJQUFJLEVBQUUsSUFBSUssdUJBQUosQ0FBbUJiLGtCQUFrQixDQUFDYyxVQUF0QztBQUhBO0FBREksS0Fab0M7QUFtQmxEQyxJQUFBQSxtQkFBbUIsRUFBRSxPQUFPQyxJQUFQLEVBQWFDLE9BQWIsRUFBc0JDLFlBQXRCLEtBQXVDO0FBQzFELFVBQUk7QUFDRixjQUFNO0FBQUVaLFVBQUFBO0FBQUYsWUFBYVUsSUFBbkI7QUFDQSxjQUFNO0FBQUVHLFVBQUFBLE1BQUY7QUFBVUMsVUFBQUEsSUFBVjtBQUFnQkMsVUFBQUE7QUFBaEIsWUFBeUJKLE9BQS9CO0FBRUEsY0FBTUss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UDtBQUNELE9BYkQsQ0FhRSxPQUFPL0IsQ0FBUCxFQUFVO0FBQ1Y3QixRQUFBQSxrQkFBa0IsQ0FBQzhCLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7QUFsQ2dFLEdBQTdCLENBQXRDO0FBcUNBN0IsRUFBQUEsa0JBQWtCLENBQUMrQixjQUFuQixDQUNFZ0MsNkJBQTZCLENBQUMvQyxJQUE5QixDQUFtQ2dCLEtBQW5DLENBQXlDeEIsSUFBekMsQ0FBOEN5QixNQURoRCxFQUVFLElBRkYsRUFHRSxJQUhGO0FBS0FqQyxFQUFBQSxrQkFBa0IsQ0FBQytCLGNBQW5CLENBQ0VnQyw2QkFBNkIsQ0FBQ3ZELElBRGhDLEVBRUUsSUFGRixFQUdFLElBSEY7QUFLQVIsRUFBQUEsa0JBQWtCLENBQUNrQyxrQkFBbkIsQ0FDRSx1QkFERixFQUVFNkIsNkJBRkYsRUFHRSxJQUhGLEVBSUUsSUFKRjtBQU1ELENBdFdEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgR3JhcGhRTE5vbk51bGwsXG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuLi8uLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCB7IE9CSkVDVCB9IGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgeyBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbiB9IGZyb20gJy4vdXNlcnNRdWVyaWVzJztcbmltcG9ydCB7IHRyYW5zZm9ybVR5cGVzIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL211dGF0aW9uJztcblxuY29uc3QgdXNlcnNSb3V0ZXIgPSBuZXcgVXNlcnNSb3V0ZXIoKTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIGlmIChwYXJzZUdyYXBoUUxTY2hlbWEuaXNVc2Vyc0NsYXNzRGlzYWJsZWQpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBzaWduVXBNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdTaWduVXAnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBzaWduVXAgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGFuZCBzaWduIHVwIGEgbmV3IHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczpcbiAgICAgICAgICAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgb2YgdGhlIG5ldyB1c2VyIHRvIGJlIGNyZWF0ZWQgYW5kIHNpZ25lZCB1cC4nLFxuICAgICAgICB0eXBlOlxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbJ19Vc2VyJ10uY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4sIG9iamVjdElkIH0gPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHBhcnNlRmllbGRzLFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm9cbiAgICAgICAgKTtcblxuICAgICAgICBjb250ZXh0LmluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdmlld2VyOiBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgICAndmlld2VyLnVzZXIuJyxcbiAgICAgICAgICAgIG9iamVjdElkXG4gICAgICAgICAgKSxcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBzaWduVXBNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoc2lnblVwTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ3NpZ25VcCcsIHNpZ25VcE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcbiAgY29uc3QgbG9nSW5XaXRoTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnTG9nSW5XaXRoJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgbG9nSW5XaXRoIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHNpZ251cCwgbG9naW4gdXNlciB3aXRoIDNyZCBwYXJ0eSBhdXRoZW50aWNhdGlvbiBzeXN0ZW0uIFRoaXMgbXV0YXRpb24gY3JlYXRlIGEgdXNlciBpZiB0aGUgYXV0aERhdGEgZG8gbm90IGNvcnJlc3BvbmQgdG8gYW4gZXhpc3Rpbmcgb25lLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGF1dGhEYXRhOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ1RoaXMgaXMgdGhlIGF1dGggZGF0YSBvZiB5b3VyIGN1c3RvbSBhdXRoIHByb3ZpZGVyJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKE9CSkVDVCksXG4gICAgICB9LFxuICAgICAgZmllbGRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczpcbiAgICAgICAgICAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgb2YgdGhlIHVzZXIgdG8gYmUgY3JlYXRlZC91cGRhdGVkIGFuZCBsb2dnZWQgaW4uJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgICAgICAgIG5hbWU6ICdVc2VyTG9naW5XaXRoSW5wdXQnLFxuICAgICAgICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tcbiAgICAgICAgICAgICAgJ19Vc2VyJ1xuICAgICAgICAgICAgXS5jbGFzc0dyYXBoUUxDcmVhdGVUeXBlLmdldEZpZWxkcygpO1xuICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKGNsYXNzR3JhcGhRTENyZWF0ZUZpZWxkcykucmVkdWNlKFxuICAgICAgICAgICAgICAoZmllbGRzLCBmaWVsZE5hbWUpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdwYXNzd29yZCcgJiZcbiAgICAgICAgICAgICAgICAgIGZpZWxkTmFtZSAhPT0gJ3VzZXJuYW1lJyAmJlxuICAgICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAnYXV0aERhdGEnXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICBmaWVsZHNbZmllbGROYW1lXSA9IGNsYXNzR3JhcGhRTENyZWF0ZUZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB7fVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzLCBhdXRoRGF0YSB9ID0gYXJncztcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgZmllbGRzLCB7XG4gICAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHsgc2Vzc2lvblRva2VuLCBvYmplY3RJZCB9ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IC4uLnBhcnNlRmllbGRzLCBhdXRoRGF0YSB9LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm9cbiAgICAgICAgKTtcblxuICAgICAgICBjb250ZXh0LmluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdmlld2VyOiBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgICAndmlld2VyLnVzZXIuJyxcbiAgICAgICAgICAgIG9iamVjdElkXG4gICAgICAgICAgKSxcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBsb2dJbldpdGhNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5XaXRoTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ2xvZ0luV2l0aCcsXG4gICAgbG9nSW5XaXRoTXV0YXRpb24sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG5cbiAgY29uc3QgbG9nSW5NdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dJbicsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgbG9nSW4gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIGluIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwYXNzd29yZCB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlIGV4aXN0aW5nIHVzZXIgdGhhdCB3YXMgbG9nZ2VkIGluIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIHBhc3N3b3JkIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiwgb2JqZWN0SWQgfSA9IChcbiAgICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVMb2dJbih7XG4gICAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lLFxuICAgICAgICAgICAgICBwYXNzd29yZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBxdWVyeToge30sXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICB9KVxuICAgICAgICApLnJlc3BvbnNlO1xuXG4gICAgICAgIGNvbnRleHQuaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXI6IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICAgIG11dGF0aW9uSW5mbyxcbiAgICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgICAgb2JqZWN0SWRcbiAgICAgICAgICApLFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGxvZ0luTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ0luJywgbG9nSW5NdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgbG9nT3V0TXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnTG9nT3V0JyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBsb2dPdXQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIG91dCBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlIGV4aXN0aW5nIHVzZXIgdGhhdCB3YXMgbG9nZ2VkIG91dCBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoX2FyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3Qgdmlld2VyID0gYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgYXV0aC51c2VyLmlkXG4gICAgICAgICk7XG5cbiAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nT3V0KHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4geyB2aWV3ZXIgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBsb2dPdXRNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nT3V0TXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ091dCcsIGxvZ091dE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCByZXNldFBhc3N3b3JkTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnUmVzZXRQYXNzd29yZCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIHJlc2V0UGFzc3dvcmQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gcmVzZXQgdGhlIHBhc3N3b3JkIG9mIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZW1haWw6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnRW1haWwgb2YgdGhlIHVzZXIgdGhhdCBzaG91bGQgcmVjZWl2ZSB0aGUgcmVzZXQgZW1haWwnLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jICh7IGVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVSZXNldFJlcXVlc3Qoe1xuICAgICAgICBib2R5OiB7XG4gICAgICAgICAgZW1haWwsXG4gICAgICAgIH0sXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgaW5mbyxcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICByZXNldFBhc3N3b3JkTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHJlc2V0UGFzc3dvcmRNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAncmVzZXRQYXNzd29yZCcsXG4gICAgcmVzZXRQYXNzd29yZE11dGF0aW9uLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIGNvbnN0IHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1NlbmRWZXJpZmljYXRpb25FbWFpbCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIHNlbmRWZXJpZmljYXRpb25FbWFpbCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzZW5kIHRoZSB2ZXJpZmljYXRpb24gZW1haWwgYWdhaW4uJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZW1haWw6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOlxuICAgICAgICAgICdFbWFpbCBvZiB0aGUgdXNlciB0aGF0IHNob3VsZCByZWNlaXZlIHRoZSB2ZXJpZmljYXRpb24gZW1haWwnLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jICh7IGVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCh7XG4gICAgICAgICAgYm9keToge1xuICAgICAgICAgICAgZW1haWwsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbi50eXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdzZW5kVmVyaWZpY2F0aW9uRW1haWwnLFxuICAgIHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19