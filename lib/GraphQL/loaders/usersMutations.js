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
        const {
          sessionToken,
          objectId
        } = await objectsMutations.createObject('_User', fields, config, auth, info);
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
        const {
          sessionToken,
          objectId
        } = await objectsMutations.createObject('_User', _objectSpread(_objectSpread({}, fields), {}, {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNpZ25VcE11dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJmaWVsZHMiLCJkZXNjcmlwdGlvbnMiLCJ0eXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsIm91dHB1dEZpZWxkcyIsInZpZXdlciIsIkdyYXBoUUxOb25OdWxsIiwidmlld2VyVHlwZSIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2Vzc2lvblRva2VuIiwib2JqZWN0SWQiLCJvYmplY3RzTXV0YXRpb25zIiwiY3JlYXRlT2JqZWN0IiwiZSIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImxvZ0luV2l0aE11dGF0aW9uIiwiYXV0aERhdGEiLCJPQkpFQ1QiLCJHcmFwaFFMSW5wdXRPYmplY3RUeXBlIiwiY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzIiwiZ2V0RmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsInJlZHVjZSIsImZpZWxkTmFtZSIsImxvZ0luTXV0YXRpb24iLCJ1c2VybmFtZSIsIkdyYXBoUUxTdHJpbmciLCJwYXNzd29yZCIsImhhbmRsZUxvZ0luIiwiYm9keSIsInF1ZXJ5IiwicmVzcG9uc2UiLCJsb2dPdXRNdXRhdGlvbiIsIl9hcmdzIiwidXNlciIsImlkIiwiaGFuZGxlTG9nT3V0IiwicmVzZXRQYXNzd29yZE11dGF0aW9uIiwiZW1haWwiLCJvayIsIkdyYXBoUUxCb29sZWFuIiwiaGFuZGxlUmVzZXRSZXF1ZXN0Iiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24iLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFNQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSxXQUFXLEdBQUcsSUFBSUMsb0JBQUosRUFBcEI7O0FBRUEsTUFBTUMsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQyxNQUFJQSxrQkFBa0IsQ0FBQ0Msb0JBQXZCLEVBQTZDO0FBQzNDO0FBQ0Q7O0FBRUQsUUFBTUMsY0FBYyxHQUFHLGdEQUE2QjtBQUNsREMsSUFBQUEsSUFBSSxFQUFFLFFBRDRDO0FBRWxEQyxJQUFBQSxXQUFXLEVBQ1QsbUVBSGdEO0FBSWxEQyxJQUFBQSxXQUFXLEVBQUU7QUFDWEMsTUFBQUEsTUFBTSxFQUFFO0FBQ05DLFFBQUFBLFlBQVksRUFDVixtRUFGSTtBQUdOQyxRQUFBQSxJQUFJLEVBQ0ZSLGtCQUFrQixDQUFDUyxlQUFuQixDQUFtQyxPQUFuQyxFQUE0Q0M7QUFKeEM7QUFERyxLQUpxQztBQVlsREMsSUFBQUEsWUFBWSxFQUFFO0FBQ1pDLE1BQUFBLE1BQU0sRUFBRTtBQUNOUixRQUFBQSxXQUFXLEVBQ1QsNEVBRkk7QUFHTkksUUFBQUEsSUFBSSxFQUFFLElBQUlLLHVCQUFKLENBQW1CYixrQkFBa0IsQ0FBQ2MsVUFBdEM7QUFIQTtBQURJLEtBWm9DO0FBbUJsREMsSUFBQUEsbUJBQW1CLEVBQUUsT0FBT0MsSUFBUCxFQUFhQyxPQUFiLEVBQXNCQyxZQUF0QixLQUF1QztBQUMxRCxVQUFJO0FBQ0YsY0FBTTtBQUFFWixVQUFBQTtBQUFGLFlBQWFVLElBQW5CO0FBQ0EsY0FBTTtBQUFFRyxVQUFBQSxNQUFGO0FBQVVDLFVBQUFBLElBQVY7QUFBZ0JDLFVBQUFBO0FBQWhCLFlBQXlCSixPQUEvQjtBQUVBLGNBQU07QUFBRUssVUFBQUEsWUFBRjtBQUFnQkMsVUFBQUE7QUFBaEIsWUFB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ICBHcmFwaFFMU3RyaW5nLFxuICBHcmFwaFFMQm9vbGVhbixcbiAgR3JhcGhRTElucHV0T2JqZWN0VHlwZSxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgVXNlcnNSb3V0ZXIgZnJvbSAnLi4vLi4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgeyBPQkpFQ1QgfSBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHsgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4gfSBmcm9tICcuL3VzZXJzUXVlcmllcyc7XG5cbmNvbnN0IHVzZXJzUm91dGVyID0gbmV3IFVzZXJzUm91dGVyKCk7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLmlzVXNlcnNDbGFzc0Rpc2FibGVkKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgc2lnblVwTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnU2lnblVwJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgc2lnblVwIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhbmQgc2lnbiB1cCBhIG5ldyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6XG4gICAgICAgICAgJ1RoZXNlIGFyZSB0aGUgZmllbGRzIG9mIHRoZSBuZXcgdXNlciB0byBiZSBjcmVhdGVkIGFuZCBzaWduZWQgdXAuJyxcbiAgICAgICAgdHlwZTpcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzWydfVXNlciddLmNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlIG5ldyB1c2VyIHRoYXQgd2FzIGNyZWF0ZWQsIHNpZ25lZCB1cCBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGZpZWxkcyB9ID0gYXJncztcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4sIG9iamVjdElkIH0gPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvXG4gICAgICAgICk7XG5cbiAgICAgICAgY29udGV4dC5pbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcjogYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgICAgbXV0YXRpb25JbmZvLFxuICAgICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgICBvYmplY3RJZFxuICAgICAgICAgICksXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgc2lnblVwTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHNpZ25VcE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdzaWduVXAnLCBzaWduVXBNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gIGNvbnN0IGxvZ0luV2l0aE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ0luV2l0aCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGxvZ0luV2l0aCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzaWdudXAsIGxvZ2luIHVzZXIgd2l0aCAzcmQgcGFydHkgYXV0aGVudGljYXRpb24gc3lzdGVtLiBUaGlzIG11dGF0aW9uIGNyZWF0ZSBhIHVzZXIgaWYgdGhlIGF1dGhEYXRhIGRvIG5vdCBjb3JyZXNwb25kIHRvIGFuIGV4aXN0aW5nIG9uZS4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGlzIGlzIHRoZSBhdXRoIGRhdGEgb2YgeW91ciBjdXN0b20gYXV0aCBwcm92aWRlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChPQkpFQ1QpLFxuICAgICAgfSxcbiAgICAgIGZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6XG4gICAgICAgICAgJ1RoZXNlIGFyZSB0aGUgZmllbGRzIG9mIHRoZSB1c2VyIHRvIGJlIGNyZWF0ZWQvdXBkYXRlZCBhbmQgbG9nZ2VkIGluLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICAgICAgICBuYW1lOiAnVXNlckxvZ2luV2l0aElucHV0JyxcbiAgICAgICAgICBmaWVsZHM6ICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNsYXNzR3JhcGhRTENyZWF0ZUZpZWxkcyA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbXG4gICAgICAgICAgICAgICdfVXNlcidcbiAgICAgICAgICAgIF0uY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZS5nZXRGaWVsZHMoKTtcbiAgICAgICAgICAgIHJldHVybiBPYmplY3Qua2V5cyhjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHMpLnJlZHVjZShcbiAgICAgICAgICAgICAgKGZpZWxkcywgZmllbGROYW1lKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAncGFzc3dvcmQnICYmXG4gICAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICd1c2VybmFtZScgJiZcbiAgICAgICAgICAgICAgICAgIGZpZWxkTmFtZSAhPT0gJ2F1dGhEYXRhJ1xuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gPSBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAge31cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlIG5ldyB1c2VyIHRoYXQgd2FzIGNyZWF0ZWQsIHNpZ25lZCB1cCBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGZpZWxkcywgYXV0aERhdGEgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHsgc2Vzc2lvblRva2VuLCBvYmplY3RJZCB9ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IC4uLmZpZWxkcywgYXV0aERhdGEgfSxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvXG4gICAgICAgICk7XG5cbiAgICAgICAgY29udGV4dC5pbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcjogYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgICAgbXV0YXRpb25JbmZvLFxuICAgICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgICBvYmplY3RJZFxuICAgICAgICAgICksXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgbG9nSW5XaXRoTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luV2l0aE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdsb2dJbldpdGgnLFxuICAgIGxvZ0luV2l0aE11dGF0aW9uLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIGNvbnN0IGxvZ0luTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnTG9nSW4nLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGxvZ0luIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGxvZyBpbiBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVzZXJuYW1lOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXNlcm5hbWUgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcGFzc3dvcmQgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdUaGlzIGlzIHRoZSBleGlzdGluZyB1c2VyIHRoYXQgd2FzIGxvZ2dlZCBpbiBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IHVzZXJuYW1lLCBwYXNzd29yZCB9ID0gYXJncztcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4sIG9iamVjdElkIH0gPSAoXG4gICAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nSW4oe1xuICAgICAgICAgICAgYm9keToge1xuICAgICAgICAgICAgICB1c2VybmFtZSxcbiAgICAgICAgICAgICAgcGFzc3dvcmQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcXVlcnk6IHt9LFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgfSlcbiAgICAgICAgKS5yZXNwb25zZTtcblxuICAgICAgICBjb250ZXh0LmluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdmlld2VyOiBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgICAndmlld2VyLnVzZXIuJyxcbiAgICAgICAgICAgIG9iamVjdElkXG4gICAgICAgICAgKSxcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBsb2dJbk11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbk11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dJbicsIGxvZ0luTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IGxvZ091dE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ091dCcsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgbG9nT3V0IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGxvZyBvdXQgYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdUaGlzIGlzIHRoZSBleGlzdGluZyB1c2VyIHRoYXQgd2FzIGxvZ2dlZCBvdXQgYW5kIHJldHVybmVkIGFzIGEgdmlld2VyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChwYXJzZUdyYXBoUUxTY2hlbWEudmlld2VyVHlwZSksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKF9hcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHZpZXdlciA9IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgbXV0YXRpb25JbmZvLFxuICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgIGF1dGgudXNlci5pZFxuICAgICAgICApO1xuXG4gICAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZUxvZ091dCh7XG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgdmlld2VyIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgbG9nT3V0TXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ091dE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dPdXQnLCBsb2dPdXRNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgcmVzZXRQYXNzd29yZE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1Jlc2V0UGFzc3dvcmQnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSByZXNldFBhc3N3b3JkIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHJlc2V0IHRoZSBwYXNzd29yZCBvZiBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGVtYWlsOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ0VtYWlsIG9mIHRoZSB1c2VyIHRoYXQgc2hvdWxkIHJlY2VpdmUgdGhlIHJlc2V0IGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlUmVzZXRSZXF1ZXN0KHtcbiAgICAgICAgYm9keToge1xuICAgICAgICAgIGVtYWlsLFxuICAgICAgICB9LFxuICAgICAgICBjb25maWcsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGluZm8sXG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgcmVzZXRQYXNzd29yZE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShyZXNldFBhc3N3b3JkTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ3Jlc2V0UGFzc3dvcmQnLFxuICAgIHJlc2V0UGFzc3dvcmRNdXRhdGlvbixcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBjb25zdCBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdTZW5kVmVyaWZpY2F0aW9uRW1haWwnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBzZW5kVmVyaWZpY2F0aW9uRW1haWwgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gc2VuZCB0aGUgdmVyaWZpY2F0aW9uIGVtYWlsIGFnYWluLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGVtYWlsOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczpcbiAgICAgICAgICAnRW1haWwgb2YgdGhlIHVzZXIgdGhhdCBzaG91bGQgcmVjZWl2ZSB0aGUgdmVyaWZpY2F0aW9uIGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3Qoe1xuICAgICAgICAgIGJvZHk6IHtcbiAgICAgICAgICAgIGVtYWlsLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24udHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJyxcbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbixcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==