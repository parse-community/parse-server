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
          sessionToken
        } = await objectsMutations.createObject('_User', fields, config, auth, info);
        info.sessionToken = sessionToken;
        return {
          viewer: await (0, _usersQueries.getUserFromSessionToken)(config, info, mutationInfo, 'viewer.user.', true)
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
          sessionToken
        } = await objectsMutations.createObject('_User', _objectSpread(_objectSpread({}, fields), {}, {
          authData
        }), config, auth, info);
        info.sessionToken = sessionToken;
        return {
          viewer: await (0, _usersQueries.getUserFromSessionToken)(config, info, mutationInfo, 'viewer.user.', true)
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
          sessionToken
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
        info.sessionToken = sessionToken;
        return {
          viewer: await (0, _usersQueries.getUserFromSessionToken)(config, info, mutationInfo, 'viewer.user.', true)
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
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(config, info, mutationInfo, 'viewer.user.', true);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNpZ25VcE11dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJmaWVsZHMiLCJkZXNjcmlwdGlvbnMiLCJ0eXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsIm91dHB1dEZpZWxkcyIsInZpZXdlciIsIkdyYXBoUUxOb25OdWxsIiwidmlld2VyVHlwZSIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2Vzc2lvblRva2VuIiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsImUiLCJoYW5kbGVFcnJvciIsImFkZEdyYXBoUUxUeXBlIiwiaW5wdXQiLCJvZlR5cGUiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJsb2dJbldpdGhNdXRhdGlvbiIsImF1dGhEYXRhIiwiT0JKRUNUIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsImNsYXNzR3JhcGhRTENyZWF0ZUZpZWxkcyIsImdldEZpZWxkcyIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJmaWVsZE5hbWUiLCJsb2dJbk11dGF0aW9uIiwidXNlcm5hbWUiLCJHcmFwaFFMU3RyaW5nIiwicGFzc3dvcmQiLCJoYW5kbGVMb2dJbiIsImJvZHkiLCJxdWVyeSIsInJlc3BvbnNlIiwibG9nT3V0TXV0YXRpb24iLCJfYXJncyIsImhhbmRsZUxvZ091dCIsInJlc2V0UGFzc3dvcmRNdXRhdGlvbiIsImVtYWlsIiwib2siLCJHcmFwaFFMQm9vbGVhbiIsImhhbmRsZVJlc2V0UmVxdWVzdCIsInNlbmRWZXJp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WG1EO0FBaUJqRXhDLElBQUFBLG1CQUFtQixFQUFFLE9BQU87QUFBRXNDLE1BQUFBO0FBQUYsS0FBUCxFQUFrQnBDLE9BQWxCLEtBQThCO0FBQ2pELFVBQUk7QUFDRixjQUFNO0FBQUVFLFVBQUFBLE1BQUY7QUFBVUMsVUFBQUEsSUFBVjtBQUFnQkMsVUFBQUE7QUFBaEIsWUFBeUJKLE9BQS9CO0FBRUEsY0FBTXBCLFdBQVcsQ0FBQzZELDhCQUFaLENBQTJDO0FBQy9DWixVQUFBQSxJQUFJLEVBQUU7QUFDSk8sWUFBQUE7QUFESSxXQUR5QztBQUkvQ2xDLFVBQUFBLE1BSitDO0FBSy9DQyxVQUFBQSxJQUwrQztBQU0vQ0MsVUFBQUE7QUFOK0MsU0FBM0MsQ0FBTjtBQVNBLGVBQU87QUFBRWlDLFVBQUFBLEVBQUUsRUFBRTtBQUFOLFNBQVA7QUFDRCxPQWJELENBYUUsT0FBTzdCLENBQVAsRUFBVTtBQUNWekIsUUFBQUEsa0JBQWtCLENBQUMwQixXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGO0FBbENnRSxHQUE3QixDQUF0QztBQXFDQXpCLEVBQUFBLGtCQUFrQixDQUFDMkIsY0FBbkIsQ0FDRThCLDZCQUE2QixDQUFDekMsSUFBOUIsQ0FBbUNZLEtBQW5DLENBQXlDcEIsSUFBekMsQ0FBOENxQixNQURoRCxFQUVFLElBRkYsRUFHRSxJQUhGO0FBS0E3QixFQUFBQSxrQkFBa0IsQ0FBQzJCLGNBQW5CLENBQ0U4Qiw2QkFBNkIsQ0FBQ2pELElBRGhDLEVBRUUsSUFGRixFQUdFLElBSEY7QUFLQVIsRUFBQUEsa0JBQWtCLENBQUM4QixrQkFBbkIsQ0FDRSx1QkFERixFQUVFMkIsNkJBRkYsRUFHRSxJQUhGLEVBSUUsSUFKRjtBQU1ELENBOVZEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgR3JhcGhRTE5vbk51bGwsXG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuLi8uLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCB7IE9CSkVDVCB9IGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgeyBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbiB9IGZyb20gJy4vdXNlcnNRdWVyaWVzJztcblxuY29uc3QgdXNlcnNSb3V0ZXIgPSBuZXcgVXNlcnNSb3V0ZXIoKTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIGlmIChwYXJzZUdyYXBoUUxTY2hlbWEuaXNVc2Vyc0NsYXNzRGlzYWJsZWQpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBzaWduVXBNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdTaWduVXAnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBzaWduVXAgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGFuZCBzaWduIHVwIGEgbmV3IHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczpcbiAgICAgICAgICAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgb2YgdGhlIG5ldyB1c2VyIHRvIGJlIGNyZWF0ZWQgYW5kIHNpZ25lZCB1cC4nLFxuICAgICAgICB0eXBlOlxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbJ19Vc2VyJ10uY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiB9ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mb1xuICAgICAgICApO1xuXG4gICAgICAgIGluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdmlld2VyOiBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgICAndmlld2VyLnVzZXIuJyxcbiAgICAgICAgICAgIHRydWVcbiAgICAgICAgICApLFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIHNpZ25VcE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShzaWduVXBNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignc2lnblVwJywgc2lnblVwTXV0YXRpb24sIHRydWUsIHRydWUpO1xuICBjb25zdCBsb2dJbldpdGhNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dJbldpdGgnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBsb2dJbldpdGggbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gc2lnbnVwLCBsb2dpbiB1c2VyIHdpdGggM3JkIHBhcnR5IGF1dGhlbnRpY2F0aW9uIHN5c3RlbS4gVGhpcyBtdXRhdGlvbiBjcmVhdGUgYSB1c2VyIGlmIHRoZSBhdXRoRGF0YSBkbyBub3QgY29ycmVzcG9uZCB0byBhbiBleGlzdGluZyBvbmUuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgYXV0aERhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVGhpcyBpcyB0aGUgYXV0aCBkYXRhIG9mIHlvdXIgY3VzdG9tIGF1dGggcHJvdmlkZXInLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoT0JKRUNUKSxcbiAgICAgIH0sXG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOlxuICAgICAgICAgICdUaGVzZSBhcmUgdGhlIGZpZWxkcyBvZiB0aGUgdXNlciB0byBiZSBjcmVhdGVkL3VwZGF0ZWQgYW5kIGxvZ2dlZCBpbi4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgICAgICAgbmFtZTogJ1VzZXJMb2dpbldpdGhJbnB1dCcsXG4gICAgICAgICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHMgPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgICAgICAgICAnX1VzZXInXG4gICAgICAgICAgICBdLmNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKCk7XG4gICAgICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzKS5yZWR1Y2UoXG4gICAgICAgICAgICAgIChmaWVsZHMsIGZpZWxkTmFtZSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgIGZpZWxkTmFtZSAhPT0gJ3Bhc3N3b3JkJyAmJlxuICAgICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAndXNlcm5hbWUnICYmXG4gICAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdhdXRoRGF0YSdcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIGZpZWxkc1tmaWVsZE5hbWVdID0gY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHt9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdUaGlzIGlzIHRoZSBuZXcgdXNlciB0aGF0IHdhcyBjcmVhdGVkLCBzaWduZWQgdXAgYW5kIHJldHVybmVkIGFzIGEgdmlld2VyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChwYXJzZUdyYXBoUUxTY2hlbWEudmlld2VyVHlwZSksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBmaWVsZHMsIGF1dGhEYXRhIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiB9ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IC4uLmZpZWxkcywgYXV0aERhdGEgfSxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvXG4gICAgICAgICk7XG5cbiAgICAgICAgaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXI6IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgIG11dGF0aW9uSW5mbyxcbiAgICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgICAgdHJ1ZVxuICAgICAgICAgICksXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgbG9nSW5XaXRoTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luV2l0aE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdsb2dJbldpdGgnLFxuICAgIGxvZ0luV2l0aE11dGF0aW9uLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIGNvbnN0IGxvZ0luTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnTG9nSW4nLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGxvZ0luIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGxvZyBpbiBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVzZXJuYW1lOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXNlcm5hbWUgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcGFzc3dvcmQgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdUaGlzIGlzIHRoZSBleGlzdGluZyB1c2VyIHRoYXQgd2FzIGxvZ2dlZCBpbiBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IHVzZXJuYW1lLCBwYXNzd29yZCB9ID0gYXJncztcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4gfSA9IChcbiAgICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVMb2dJbih7XG4gICAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lLFxuICAgICAgICAgICAgICBwYXNzd29yZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBxdWVyeToge30sXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICB9KVxuICAgICAgICApLnJlc3BvbnNlO1xuXG4gICAgICAgIGluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdmlld2VyOiBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgICAndmlld2VyLnVzZXIuJyxcbiAgICAgICAgICAgIHRydWVcbiAgICAgICAgICApLFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGxvZ0luTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ0luJywgbG9nSW5NdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgbG9nT3V0TXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnTG9nT3V0JyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBsb2dPdXQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIG91dCBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlIGV4aXN0aW5nIHVzZXIgdGhhdCB3YXMgbG9nZ2VkIG91dCBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoX2FyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3Qgdmlld2VyID0gYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgICAgbXV0YXRpb25JbmZvLFxuICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcblxuICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVMb2dPdXQoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB7IHZpZXdlciB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGxvZ091dE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dPdXRNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignbG9nT3V0JywgbG9nT3V0TXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IHJlc2V0UGFzc3dvcmRNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdSZXNldFBhc3N3b3JkJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgcmVzZXRQYXNzd29yZCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byByZXNldCB0aGUgcGFzc3dvcmQgb2YgYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBlbWFpbDoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdFbWFpbCBvZiB0aGUgdXNlciB0aGF0IHNob3VsZCByZWNlaXZlIHRoZSByZXNldCBlbWFpbCcsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKHsgZW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZVJlc2V0UmVxdWVzdCh7XG4gICAgICAgIGJvZHk6IHtcbiAgICAgICAgICBlbWFpbCxcbiAgICAgICAgfSxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBpbmZvLFxuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIHJlc2V0UGFzc3dvcmRNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUocmVzZXRQYXNzd29yZE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdyZXNldFBhc3N3b3JkJyxcbiAgICByZXNldFBhc3N3b3JkTXV0YXRpb24sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG5cbiAgY29uc3Qgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnU2VuZFZlcmlmaWNhdGlvbkVtYWlsJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgc2VuZFZlcmlmaWNhdGlvbkVtYWlsIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHNlbmQgdGhlIHZlcmlmaWNhdGlvbiBlbWFpbCBhZ2Fpbi4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBlbWFpbDoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6XG4gICAgICAgICAgJ0VtYWlsIG9mIHRoZSB1c2VyIHRoYXQgc2hvdWxkIHJlY2VpdmUgdGhlIHZlcmlmaWNhdGlvbiBlbWFpbCcsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKHsgZW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHtcbiAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICBlbWFpbCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uLnR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ3NlbmRWZXJpZmljYXRpb25FbWFpbCcsXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=