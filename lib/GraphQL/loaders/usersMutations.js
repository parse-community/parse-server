"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
var _deepcopy = _interopRequireDefault(require("deepcopy"));
var _UsersRouter = _interopRequireDefault(require("../../Routers/UsersRouter"));
var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));
var _defaultGraphQLTypes = require("./defaultGraphQLTypes");
var _usersQueries = require("./usersQueries");
var _mutation = require("../transformers/mutation");
var _node = _interopRequireDefault(require("parse/node"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
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
        } = (0, _deepcopy.default)(args);
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
          objectId,
          authDataResponse
        } = await objectsMutations.createObject('_User', parseFields, config, auth, info);
        context.info.sessionToken = sessionToken;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId);
        if (authDataResponse && viewer.user) viewer.user.authDataResponse = authDataResponse;
        return {
          viewer
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
        } = (0, _deepcopy.default)(args);
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
          objectId,
          authDataResponse
        } = await objectsMutations.createObject('_User', _objectSpread(_objectSpread({}, parseFields), {}, {
          authData
        }), config, auth, info);
        context.info.sessionToken = sessionToken;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId);
        if (authDataResponse && viewer.user) viewer.user.authDataResponse = authDataResponse;
        return {
          viewer
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
      },
      authData: {
        description: 'Auth data payload, needed if some required auth adapters are configured.',
        type: _defaultGraphQLTypes.OBJECT
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
          password,
          authData
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth,
          info
        } = context;
        const {
          sessionToken,
          objectId,
          authDataResponse
        } = (await usersRouter.handleLogIn({
          body: {
            username,
            password,
            authData
          },
          query: {},
          config,
          auth,
          info
        })).response;
        context.info.sessionToken = sessionToken;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId);
        if (authDataResponse && viewer.user) viewer.user.authDataResponse = authDataResponse;
        return {
          viewer
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
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async (_args, context) => {
      try {
        const {
          config,
          auth,
          info
        } = context;
        await usersRouter.handleLogOut({
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
  const confirmResetPasswordMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'ConfirmResetPassword',
    description: 'The confirmResetPassword mutation can be used to reset the password of an existing user.',
    inputFields: {
      username: {
        descriptions: 'Username of the user that have received the reset email',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      password: {
        descriptions: 'New password of the user',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      token: {
        descriptions: 'Reset token that was emailed to the user',
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
      username,
      password,
      token
    }, context) => {
      const {
        config
      } = context;
      if (!username) {
        throw new _node.default.Error(_node.default.Error.USERNAME_MISSING, 'you must provide a username');
      }
      if (!password) {
        throw new _node.default.Error(_node.default.Error.PASSWORD_MISSING, 'you must provide a password');
      }
      if (!token) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'you must provide a token');
      }
      const userController = config.userController;
      await userController.updatePassword(username, token, password);
      return {
        ok: true
      };
    }
  });
  parseGraphQLSchema.addGraphQLType(confirmResetPasswordMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(confirmResetPasswordMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('confirmResetPassword', confirmResetPasswordMutation, true, true);
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
  const challengeMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'Challenge',
    description: 'The challenge mutation can be used to initiate an authentication challenge when an auth adapter needs it.',
    inputFields: {
      username: {
        description: 'This is the username used to log in the user.',
        type: _graphql.GraphQLString
      },
      password: {
        description: 'This is the password used to log in the user.',
        type: _graphql.GraphQLString
      },
      authData: {
        description: 'Auth data allow to preidentify the user if the auth adapter needs preidentification.',
        type: _defaultGraphQLTypes.OBJECT
      },
      challengeData: {
        description: 'Challenge data payload, can be used to post data to auth providers to auth providers if they need data for the response.',
        type: _defaultGraphQLTypes.OBJECT
      }
    },
    outputFields: {
      challengeData: {
        description: 'Challenge response from configured auth adapters.',
        type: _defaultGraphQLTypes.OBJECT
      }
    },
    mutateAndGetPayload: async (input, context) => {
      try {
        const {
          config,
          auth,
          info
        } = context;
        const {
          response
        } = await usersRouter.handleChallenge({
          body: input,
          config,
          auth,
          info
        });
        return response;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(challengeMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(challengeMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('challenge', challengeMutation, true, true);
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ1c2Vyc1JvdXRlciIsIlVzZXJzUm91dGVyIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImlzVXNlcnNDbGFzc0Rpc2FibGVkIiwic2lnblVwTXV0YXRpb24iLCJtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJmaWVsZHMiLCJkZXNjcmlwdGlvbnMiLCJ0eXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsIm91dHB1dEZpZWxkcyIsInZpZXdlciIsIkdyYXBoUUxOb25OdWxsIiwidmlld2VyVHlwZSIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImRlZXBjb3B5IiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJwYXJzZUZpZWxkcyIsInRyYW5zZm9ybVR5cGVzIiwiY2xhc3NOYW1lIiwicmVxIiwic2Vzc2lvblRva2VuIiwib2JqZWN0SWQiLCJhdXRoRGF0YVJlc3BvbnNlIiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsImdldFVzZXJGcm9tU2Vzc2lvblRva2VuIiwidXNlciIsImUiLCJoYW5kbGVFcnJvciIsImFkZEdyYXBoUUxUeXBlIiwiaW5wdXQiLCJvZlR5cGUiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJsb2dJbldpdGhNdXRhdGlvbiIsImF1dGhEYXRhIiwiT0JKRUNUIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsImNsYXNzR3JhcGhRTENyZWF0ZUZpZWxkcyIsImdldEZpZWxkcyIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJmaWVsZE5hbWUiLCJsb2dJbk11dGF0aW9uIiwidXNlcm5hbWUiLCJHcmFwaFFMU3RyaW5nIiwicGFzc3dvcmQiLCJoYW5kbGVMb2dJbiIsImJvZHkiLCJxdWVyeSIsInJlc3BvbnNlIiwibG9nT3V0TXV0YXRpb24iLCJvayIsIkdyYXBoUUxCb29sZWFuIiwiX2FyZ3MiLCJoYW5kbGVMb2dPdXQiLCJyZXNldFBhc3N3b3JkTXV0YXRpb24iLCJlbWFpbCIsImhhbmRsZVJlc2V0UmVxdWVzdCIsImNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24iLCJ0b2tlbiIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9USEVSX0NBVVNFIiwidXNlckNvbnRyb2xsZXIiLCJ1cGRhdGVQYXNzd29yZCIsInNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uIiwiaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0IiwiY2hhbGxlbmdlTXV0YXRpb24iLCJjaGFsbGVuZ2VEYXRhIiwiaGFuZGxlQ2hhbGxlbmdlIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy91c2Vyc011dGF0aW9ucy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCwgR3JhcGhRTFN0cmluZywgR3JhcGhRTEJvb2xlYW4sIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgVXNlcnNSb3V0ZXIgZnJvbSAnLi4vLi4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgeyBPQkpFQ1QgfSBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHsgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4gfSBmcm9tICcuL3VzZXJzUXVlcmllcyc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9tdXRhdGlvbic7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5cbmNvbnN0IHVzZXJzUm91dGVyID0gbmV3IFVzZXJzUm91dGVyKCk7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLmlzVXNlcnNDbGFzc0Rpc2FibGVkKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgc2lnblVwTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnU2lnblVwJyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBzaWduVXAgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGFuZCBzaWduIHVwIGEgbmV3IHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIG9mIHRoZSBuZXcgdXNlciB0byBiZSBjcmVhdGVkIGFuZCBzaWduZWQgdXAuJyxcbiAgICAgICAgdHlwZTogcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1snX1VzZXInXS5jbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgZmllbGRzLCB7XG4gICAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHsgc2Vzc2lvblRva2VuLCBvYmplY3RJZCwgYXV0aERhdGFSZXNwb25zZSB9ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvXG4gICAgICAgICk7XG5cbiAgICAgICAgY29udGV4dC5pbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcbiAgICAgICAgY29uc3Qgdmlld2VyID0gYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgb2JqZWN0SWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UgJiYgdmlld2VyLnVzZXIpIHZpZXdlci51c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcixcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShzaWduVXBNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHNpZ25VcE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdzaWduVXAnLCBzaWduVXBNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gIGNvbnN0IGxvZ0luV2l0aE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ0luV2l0aCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGxvZ0luV2l0aCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzaWdudXAsIGxvZ2luIHVzZXIgd2l0aCAzcmQgcGFydHkgYXV0aGVudGljYXRpb24gc3lzdGVtLiBUaGlzIG11dGF0aW9uIGNyZWF0ZSBhIHVzZXIgaWYgdGhlIGF1dGhEYXRhIGRvIG5vdCBjb3JyZXNwb25kIHRvIGFuIGV4aXN0aW5nIG9uZS4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGlzIGlzIHRoZSBhdXRoIGRhdGEgb2YgeW91ciBjdXN0b20gYXV0aCBwcm92aWRlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChPQkpFQ1QpLFxuICAgICAgfSxcbiAgICAgIGZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyBvZiB0aGUgdXNlciB0byBiZSBjcmVhdGVkL3VwZGF0ZWQgYW5kIGxvZ2dlZCBpbi4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgICAgICAgbmFtZTogJ1VzZXJMb2dpbldpdGhJbnB1dCcsXG4gICAgICAgICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHMgPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgICAgICAgICAnX1VzZXInXG4gICAgICAgICAgICBdLmNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKCk7XG4gICAgICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzKS5yZWR1Y2UoKGZpZWxkcywgZmllbGROYW1lKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdwYXNzd29yZCcgJiZcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICd1c2VybmFtZScgJiZcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdhdXRoRGF0YSdcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gPSBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgICAgfSwge30pO1xuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzLCBhdXRoRGF0YSB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiwgb2JqZWN0SWQsIGF1dGhEYXRhUmVzcG9uc2UgfSA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyAuLi5wYXJzZUZpZWxkcywgYXV0aERhdGEgfSxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvXG4gICAgICAgICk7XG5cbiAgICAgICAgY29udGV4dC5pbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcbiAgICAgICAgY29uc3Qgdmlld2VyID0gYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgb2JqZWN0SWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UgJiYgdmlld2VyLnVzZXIpIHZpZXdlci51c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcixcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbldpdGhNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luV2l0aE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dJbldpdGgnLCBsb2dJbldpdGhNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgbG9nSW5NdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dJbicsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgbG9nSW4gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIGluIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwYXNzd29yZCB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgYXV0aERhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdBdXRoIGRhdGEgcGF5bG9hZCwgbmVlZGVkIGlmIHNvbWUgcmVxdWlyZWQgYXV0aCBhZGFwdGVycyBhcmUgY29uZmlndXJlZC4nLFxuICAgICAgICB0eXBlOiBPQkpFQ1QsXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBleGlzdGluZyB1c2VyIHRoYXQgd2FzIGxvZ2dlZCBpbiBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IHVzZXJuYW1lLCBwYXNzd29yZCwgYXV0aERhdGEgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiwgb2JqZWN0SWQsIGF1dGhEYXRhUmVzcG9uc2UgfSA9IChcbiAgICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVMb2dJbih7XG4gICAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lLFxuICAgICAgICAgICAgICBwYXNzd29yZCxcbiAgICAgICAgICAgICAgYXV0aERhdGEsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcXVlcnk6IHt9LFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgfSlcbiAgICAgICAgKS5yZXNwb25zZTtcblxuICAgICAgICBjb250ZXh0LmluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgIGNvbnN0IHZpZXdlciA9IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgbXV0YXRpb25JbmZvLFxuICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgIG9iamVjdElkXG4gICAgICAgICk7XG4gICAgICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlICYmIHZpZXdlci51c2VyKSB2aWV3ZXIudXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXIsXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5NdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ0luJywgbG9nSW5NdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgbG9nT3V0TXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnTG9nT3V0JyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBsb2dPdXQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIG91dCBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChfYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nT3V0KHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ091dE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nT3V0TXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ091dCcsIGxvZ091dE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCByZXNldFBhc3N3b3JkTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnUmVzZXRQYXNzd29yZCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIHJlc2V0UGFzc3dvcmQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gcmVzZXQgdGhlIHBhc3N3b3JkIG9mIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZW1haWw6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnRW1haWwgb2YgdGhlIHVzZXIgdGhhdCBzaG91bGQgcmVjZWl2ZSB0aGUgcmVzZXQgZW1haWwnLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jICh7IGVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVSZXNldFJlcXVlc3Qoe1xuICAgICAgICBib2R5OiB7XG4gICAgICAgICAgZW1haWwsXG4gICAgICAgIH0sXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgaW5mbyxcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShyZXNldFBhc3N3b3JkTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShyZXNldFBhc3N3b3JkTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ3Jlc2V0UGFzc3dvcmQnLCByZXNldFBhc3N3b3JkTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ29uZmlybVJlc2V0UGFzc3dvcmQnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBjb25maXJtUmVzZXRQYXNzd29yZCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byByZXNldCB0aGUgcGFzc3dvcmQgb2YgYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1c2VybmFtZToge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdVc2VybmFtZSBvZiB0aGUgdXNlciB0aGF0IGhhdmUgcmVjZWl2ZWQgdGhlIHJlc2V0IGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ05ldyBwYXNzd29yZCBvZiB0aGUgdXNlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgICB0b2tlbjoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdSZXNldCB0b2tlbiB0aGF0IHdhcyBlbWFpbGVkIHRvIHRoZSB1c2VyJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyB1c2VybmFtZSwgcGFzc3dvcmQsIHRva2VuIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHsgY29uZmlnIH0gPSBjb250ZXh0O1xuICAgICAgaWYgKCF1c2VybmFtZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYSB1c2VybmFtZScpO1xuICAgICAgfVxuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYSBwYXNzd29yZCcpO1xuICAgICAgfVxuICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICd5b3UgbXVzdCBwcm92aWRlIGEgdG9rZW4nKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSBjb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgICBhd2FpdCB1c2VyQ29udHJvbGxlci51cGRhdGVQYXNzd29yZCh1c2VybmFtZSwgdG9rZW4sIHBhc3N3b3JkKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ2NvbmZpcm1SZXNldFBhc3N3b3JkJyxcbiAgICBjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIGNvbnN0IHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1NlbmRWZXJpZmljYXRpb25FbWFpbCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIHNlbmRWZXJpZmljYXRpb25FbWFpbCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzZW5kIHRoZSB2ZXJpZmljYXRpb24gZW1haWwgYWdhaW4uJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZW1haWw6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnRW1haWwgb2YgdGhlIHVzZXIgdGhhdCBzaG91bGQgcmVjZWl2ZSB0aGUgdmVyaWZpY2F0aW9uIGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3Qoe1xuICAgICAgICAgIGJvZHk6IHtcbiAgICAgICAgICAgIGVtYWlsLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ3NlbmRWZXJpZmljYXRpb25FbWFpbCcsXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG5cbiAgY29uc3QgY2hhbGxlbmdlTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ2hhbGxlbmdlJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgY2hhbGxlbmdlIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGluaXRpYXRlIGFuIGF1dGhlbnRpY2F0aW9uIGNoYWxsZW5nZSB3aGVuIGFuIGF1dGggYWRhcHRlciBuZWVkcyBpdC4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1c2VybmFtZToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVzZXJuYW1lIHVzZWQgdG8gbG9nIGluIHRoZSB1c2VyLicsXG4gICAgICAgIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwYXNzd29yZCB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxuICAgICAgfSxcbiAgICAgIGF1dGhEYXRhOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdBdXRoIGRhdGEgYWxsb3cgdG8gcHJlaWRlbnRpZnkgdGhlIHVzZXIgaWYgdGhlIGF1dGggYWRhcHRlciBuZWVkcyBwcmVpZGVudGlmaWNhdGlvbi4nLFxuICAgICAgICB0eXBlOiBPQkpFQ1QsXG4gICAgICB9LFxuICAgICAgY2hhbGxlbmdlRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnQ2hhbGxlbmdlIGRhdGEgcGF5bG9hZCwgY2FuIGJlIHVzZWQgdG8gcG9zdCBkYXRhIHRvIGF1dGggcHJvdmlkZXJzIHRvIGF1dGggcHJvdmlkZXJzIGlmIHRoZXkgbmVlZCBkYXRhIGZvciB0aGUgcmVzcG9uc2UuJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgY2hhbGxlbmdlRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ0NoYWxsZW5nZSByZXNwb25zZSBmcm9tIGNvbmZpZ3VyZWQgYXV0aCBhZGFwdGVycy4nLFxuICAgICAgICB0eXBlOiBPQkpFQ1QsXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGlucHV0LCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCB7IHJlc3BvbnNlIH0gPSBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVDaGFsbGVuZ2Uoe1xuICAgICAgICAgIGJvZHk6IGlucHV0LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2hhbGxlbmdlTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjaGFsbGVuZ2VNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignY2hhbGxlbmdlJywgY2hhbGxlbmdlTXV0YXRpb24sIHRydWUsIHRydWUpO1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBK0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUUvQixNQUFNQSxXQUFXLEdBQUcsSUFBSUMsb0JBQVcsRUFBRTtBQUVyQyxNQUFNQyxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0VBQ2pDLElBQUlBLGtCQUFrQixDQUFDQyxvQkFBb0IsRUFBRTtJQUMzQztFQUNGO0VBRUEsTUFBTUMsY0FBYyxHQUFHLElBQUFDLDBDQUE0QixFQUFDO0lBQ2xEQyxJQUFJLEVBQUUsUUFBUTtJQUNkQyxXQUFXLEVBQUUsbUVBQW1FO0lBQ2hGQyxXQUFXLEVBQUU7TUFDWEMsTUFBTSxFQUFFO1FBQ05DLFlBQVksRUFBRSxtRUFBbUU7UUFDakZDLElBQUksRUFBRVQsa0JBQWtCLENBQUNVLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQ0M7TUFDcEQ7SUFDRixDQUFDO0lBQ0RDLFlBQVksRUFBRTtNQUNaQyxNQUFNLEVBQUU7UUFDTlIsV0FBVyxFQUFFLDRFQUE0RTtRQUN6RkksSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUNkLGtCQUFrQixDQUFDZSxVQUFVO01BQ3hEO0lBQ0YsQ0FBQztJQUNEQyxtQkFBbUIsRUFBRSxPQUFPQyxJQUFJLEVBQUVDLE9BQU8sRUFBRUMsWUFBWSxLQUFLO01BQzFELElBQUk7UUFDRixNQUFNO1VBQUVaO1FBQU8sQ0FBQyxHQUFHLElBQUFhLGlCQUFRLEVBQUNILElBQUksQ0FBQztRQUNqQyxNQUFNO1VBQUVJLE1BQU07VUFBRUMsSUFBSTtVQUFFQztRQUFLLENBQUMsR0FBR0wsT0FBTztRQUV0QyxNQUFNTSxXQUFXLEdBQUcsTUFBTSxJQUFBQyx3QkFBYyxFQUFDLFFBQVEsRUFBRWxCLE1BQU0sRUFBRTtVQUN6RG1CLFNBQVMsRUFBRSxPQUFPO1VBQ2xCMUIsa0JBQWtCO1VBQ2xCMkIsR0FBRyxFQUFFO1lBQUVOLE1BQU07WUFBRUMsSUFBSTtZQUFFQztVQUFLO1FBQzVCLENBQUMsQ0FBQztRQUVGLE1BQU07VUFBRUssWUFBWTtVQUFFQyxRQUFRO1VBQUVDO1FBQWlCLENBQUMsR0FBRyxNQUFNQyxnQkFBZ0IsQ0FBQ0MsWUFBWSxDQUN0RixPQUFPLEVBQ1BSLFdBQVcsRUFDWEgsTUFBTSxFQUNOQyxJQUFJLEVBQ0pDLElBQUksQ0FDTDtRQUVETCxPQUFPLENBQUNLLElBQUksQ0FBQ0ssWUFBWSxHQUFHQSxZQUFZO1FBQ3hDLE1BQU1mLE1BQU0sR0FBRyxNQUFNLElBQUFvQixxQ0FBdUIsRUFDMUNmLE9BQU8sRUFDUEMsWUFBWSxFQUNaLGNBQWMsRUFDZFUsUUFBUSxDQUNUO1FBQ0QsSUFBSUMsZ0JBQWdCLElBQUlqQixNQUFNLENBQUNxQixJQUFJLEVBQUVyQixNQUFNLENBQUNxQixJQUFJLENBQUNKLGdCQUFnQixHQUFHQSxnQkFBZ0I7UUFDcEYsT0FBTztVQUNMakI7UUFDRixDQUFDO01BQ0gsQ0FBQyxDQUFDLE9BQU9zQixDQUFDLEVBQUU7UUFDVm5DLGtCQUFrQixDQUFDb0MsV0FBVyxDQUFDRCxDQUFDLENBQUM7TUFDbkM7SUFDRjtFQUNGLENBQUMsQ0FBQztFQUVGbkMsa0JBQWtCLENBQUNxQyxjQUFjLENBQUNuQyxjQUFjLENBQUNlLElBQUksQ0FBQ3FCLEtBQUssQ0FBQzdCLElBQUksQ0FBQzhCLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ3BGdkMsa0JBQWtCLENBQUNxQyxjQUFjLENBQUNuQyxjQUFjLENBQUNPLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ2xFVCxrQkFBa0IsQ0FBQ3dDLGtCQUFrQixDQUFDLFFBQVEsRUFBRXRDLGNBQWMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQzNFLE1BQU11QyxpQkFBaUIsR0FBRyxJQUFBdEMsMENBQTRCLEVBQUM7SUFDckRDLElBQUksRUFBRSxXQUFXO0lBQ2pCQyxXQUFXLEVBQ1Qsa0xBQWtMO0lBQ3BMQyxXQUFXLEVBQUU7TUFDWG9DLFFBQVEsRUFBRTtRQUNSbEMsWUFBWSxFQUFFLG9EQUFvRDtRQUNsRUMsSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUM2QiwyQkFBTTtNQUNqQyxDQUFDO01BQ0RwQyxNQUFNLEVBQUU7UUFDTkMsWUFBWSxFQUFFLHVFQUF1RTtRQUNyRkMsSUFBSSxFQUFFLElBQUltQywrQkFBc0IsQ0FBQztVQUMvQnhDLElBQUksRUFBRSxvQkFBb0I7VUFDMUJHLE1BQU0sRUFBRSxNQUFNO1lBQ1osTUFBTXNDLHdCQUF3QixHQUFHN0Msa0JBQWtCLENBQUNVLGVBQWUsQ0FDakUsT0FBTyxDQUNSLENBQUNDLHNCQUFzQixDQUFDbUMsU0FBUyxFQUFFO1lBQ3BDLE9BQU9DLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDSCx3QkFBd0IsQ0FBQyxDQUFDSSxNQUFNLENBQUMsQ0FBQzFDLE1BQU0sRUFBRTJDLFNBQVMsS0FBSztjQUN6RSxJQUNFQSxTQUFTLEtBQUssVUFBVSxJQUN4QkEsU0FBUyxLQUFLLFVBQVUsSUFDeEJBLFNBQVMsS0FBSyxVQUFVLEVBQ3hCO2dCQUNBM0MsTUFBTSxDQUFDMkMsU0FBUyxDQUFDLEdBQUdMLHdCQUF3QixDQUFDSyxTQUFTLENBQUM7Y0FDekQ7Y0FDQSxPQUFPM0MsTUFBTTtZQUNmLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztVQUNSO1FBQ0YsQ0FBQztNQUNIO0lBQ0YsQ0FBQztJQUNESyxZQUFZLEVBQUU7TUFDWkMsTUFBTSxFQUFFO1FBQ05SLFdBQVcsRUFBRSw0RUFBNEU7UUFDekZJLElBQUksRUFBRSxJQUFJSyx1QkFBYyxDQUFDZCxrQkFBa0IsQ0FBQ2UsVUFBVTtNQUN4RDtJQUNGLENBQUM7SUFDREMsbUJBQW1CLEVBQUUsT0FBT0MsSUFBSSxFQUFFQyxPQUFPLEVBQUVDLFlBQVksS0FBSztNQUMxRCxJQUFJO1FBQ0YsTUFBTTtVQUFFWixNQUFNO1VBQUVtQztRQUFTLENBQUMsR0FBRyxJQUFBdEIsaUJBQVEsRUFBQ0gsSUFBSSxDQUFDO1FBQzNDLE1BQU07VUFBRUksTUFBTTtVQUFFQyxJQUFJO1VBQUVDO1FBQUssQ0FBQyxHQUFHTCxPQUFPO1FBRXRDLE1BQU1NLFdBQVcsR0FBRyxNQUFNLElBQUFDLHdCQUFjLEVBQUMsUUFBUSxFQUFFbEIsTUFBTSxFQUFFO1VBQ3pEbUIsU0FBUyxFQUFFLE9BQU87VUFDbEIxQixrQkFBa0I7VUFDbEIyQixHQUFHLEVBQUU7WUFBRU4sTUFBTTtZQUFFQyxJQUFJO1lBQUVDO1VBQUs7UUFDNUIsQ0FBQyxDQUFDO1FBRUYsTUFBTTtVQUFFSyxZQUFZO1VBQUVDLFFBQVE7VUFBRUM7UUFBaUIsQ0FBQyxHQUFHLE1BQU1DLGdCQUFnQixDQUFDQyxZQUFZLENBQ3RGLE9BQU8sa0NBQ0ZSLFdBQVc7VUFBRWtCO1FBQVEsSUFDMUJyQixNQUFNLEVBQ05DLElBQUksRUFDSkMsSUFBSSxDQUNMO1FBRURMLE9BQU8sQ0FBQ0ssSUFBSSxDQUFDSyxZQUFZLEdBQUdBLFlBQVk7UUFDeEMsTUFBTWYsTUFBTSxHQUFHLE1BQU0sSUFBQW9CLHFDQUF1QixFQUMxQ2YsT0FBTyxFQUNQQyxZQUFZLEVBQ1osY0FBYyxFQUNkVSxRQUFRLENBQ1Q7UUFDRCxJQUFJQyxnQkFBZ0IsSUFBSWpCLE1BQU0sQ0FBQ3FCLElBQUksRUFBRXJCLE1BQU0sQ0FBQ3FCLElBQUksQ0FBQ0osZ0JBQWdCLEdBQUdBLGdCQUFnQjtRQUNwRixPQUFPO1VBQ0xqQjtRQUNGLENBQUM7TUFDSCxDQUFDLENBQUMsT0FBT3NCLENBQUMsRUFBRTtRQUNWbkMsa0JBQWtCLENBQUNvQyxXQUFXLENBQUNELENBQUMsQ0FBQztNQUNuQztJQUNGO0VBQ0YsQ0FBQyxDQUFDO0VBRUZuQyxrQkFBa0IsQ0FBQ3FDLGNBQWMsQ0FBQ0ksaUJBQWlCLENBQUN4QixJQUFJLENBQUNxQixLQUFLLENBQUM3QixJQUFJLENBQUM4QixNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUN2RnZDLGtCQUFrQixDQUFDcUMsY0FBYyxDQUFDSSxpQkFBaUIsQ0FBQ2hDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ3JFVCxrQkFBa0IsQ0FBQ3dDLGtCQUFrQixDQUFDLFdBQVcsRUFBRUMsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUVqRixNQUFNVSxhQUFhLEdBQUcsSUFBQWhELDBDQUE0QixFQUFDO0lBQ2pEQyxJQUFJLEVBQUUsT0FBTztJQUNiQyxXQUFXLEVBQUUsNERBQTREO0lBQ3pFQyxXQUFXLEVBQUU7TUFDWDhDLFFBQVEsRUFBRTtRQUNSL0MsV0FBVyxFQUFFLCtDQUErQztRQUM1REksSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUN1QyxzQkFBYTtNQUN4QyxDQUFDO01BQ0RDLFFBQVEsRUFBRTtRQUNSakQsV0FBVyxFQUFFLCtDQUErQztRQUM1REksSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUN1QyxzQkFBYTtNQUN4QyxDQUFDO01BQ0RYLFFBQVEsRUFBRTtRQUNSckMsV0FBVyxFQUFFLDBFQUEwRTtRQUN2RkksSUFBSSxFQUFFa0M7TUFDUjtJQUNGLENBQUM7SUFDRC9CLFlBQVksRUFBRTtNQUNaQyxNQUFNLEVBQUU7UUFDTlIsV0FBVyxFQUFFLHdFQUF3RTtRQUNyRkksSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUNkLGtCQUFrQixDQUFDZSxVQUFVO01BQ3hEO0lBQ0YsQ0FBQztJQUNEQyxtQkFBbUIsRUFBRSxPQUFPQyxJQUFJLEVBQUVDLE9BQU8sRUFBRUMsWUFBWSxLQUFLO01BQzFELElBQUk7UUFDRixNQUFNO1VBQUVpQyxRQUFRO1VBQUVFLFFBQVE7VUFBRVo7UUFBUyxDQUFDLEdBQUcsSUFBQXRCLGlCQUFRLEVBQUNILElBQUksQ0FBQztRQUN2RCxNQUFNO1VBQUVJLE1BQU07VUFBRUMsSUFBSTtVQUFFQztRQUFLLENBQUMsR0FBR0wsT0FBTztRQUV0QyxNQUFNO1VBQUVVLFlBQVk7VUFBRUMsUUFBUTtVQUFFQztRQUFpQixDQUFDLEdBQUcsQ0FDbkQsTUFBTWpDLFdBQVcsQ0FBQzBELFdBQVcsQ0FBQztVQUM1QkMsSUFBSSxFQUFFO1lBQ0pKLFFBQVE7WUFDUkUsUUFBUTtZQUNSWjtVQUNGLENBQUM7VUFDRGUsS0FBSyxFQUFFLENBQUMsQ0FBQztVQUNUcEMsTUFBTTtVQUNOQyxJQUFJO1VBQ0pDO1FBQ0YsQ0FBQyxDQUFDLEVBQ0ZtQyxRQUFRO1FBRVZ4QyxPQUFPLENBQUNLLElBQUksQ0FBQ0ssWUFBWSxHQUFHQSxZQUFZO1FBRXhDLE1BQU1mLE1BQU0sR0FBRyxNQUFNLElBQUFvQixxQ0FBdUIsRUFDMUNmLE9BQU8sRUFDUEMsWUFBWSxFQUNaLGNBQWMsRUFDZFUsUUFBUSxDQUNUO1FBQ0QsSUFBSUMsZ0JBQWdCLElBQUlqQixNQUFNLENBQUNxQixJQUFJLEVBQUVyQixNQUFNLENBQUNxQixJQUFJLENBQUNKLGdCQUFnQixHQUFHQSxnQkFBZ0I7UUFDcEYsT0FBTztVQUNMakI7UUFDRixDQUFDO01BQ0gsQ0FBQyxDQUFDLE9BQU9zQixDQUFDLEVBQUU7UUFDVm5DLGtCQUFrQixDQUFDb0MsV0FBVyxDQUFDRCxDQUFDLENBQUM7TUFDbkM7SUFDRjtFQUNGLENBQUMsQ0FBQztFQUVGbkMsa0JBQWtCLENBQUNxQyxjQUFjLENBQUNjLGFBQWEsQ0FBQ2xDLElBQUksQ0FBQ3FCLEtBQUssQ0FBQzdCLElBQUksQ0FBQzhCLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ25GdkMsa0JBQWtCLENBQUNxQyxjQUFjLENBQUNjLGFBQWEsQ0FBQzFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ2pFVCxrQkFBa0IsQ0FBQ3dDLGtCQUFrQixDQUFDLE9BQU8sRUFBRVcsYUFBYSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFFekUsTUFBTVEsY0FBYyxHQUFHLElBQUF4RCwwQ0FBNEIsRUFBQztJQUNsREMsSUFBSSxFQUFFLFFBQVE7SUFDZEMsV0FBVyxFQUFFLDhEQUE4RDtJQUMzRU8sWUFBWSxFQUFFO01BQ1pnRCxFQUFFLEVBQUU7UUFDRnZELFdBQVcsRUFBRSxtQkFBbUI7UUFDaENJLElBQUksRUFBRSxJQUFJSyx1QkFBYyxDQUFDK0MsdUJBQWM7TUFDekM7SUFDRixDQUFDO0lBQ0Q3QyxtQkFBbUIsRUFBRSxPQUFPOEMsS0FBSyxFQUFFNUMsT0FBTyxLQUFLO01BQzdDLElBQUk7UUFDRixNQUFNO1VBQUVHLE1BQU07VUFBRUMsSUFBSTtVQUFFQztRQUFLLENBQUMsR0FBR0wsT0FBTztRQUV0QyxNQUFNckIsV0FBVyxDQUFDa0UsWUFBWSxDQUFDO1VBQzdCMUMsTUFBTTtVQUNOQyxJQUFJO1VBQ0pDO1FBQ0YsQ0FBQyxDQUFDO1FBRUYsT0FBTztVQUFFcUMsRUFBRSxFQUFFO1FBQUssQ0FBQztNQUNyQixDQUFDLENBQUMsT0FBT3pCLENBQUMsRUFBRTtRQUNWbkMsa0JBQWtCLENBQUNvQyxXQUFXLENBQUNELENBQUMsQ0FBQztNQUNuQztJQUNGO0VBQ0YsQ0FBQyxDQUFDO0VBRUZuQyxrQkFBa0IsQ0FBQ3FDLGNBQWMsQ0FBQ3NCLGNBQWMsQ0FBQzFDLElBQUksQ0FBQ3FCLEtBQUssQ0FBQzdCLElBQUksQ0FBQzhCLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ3BGdkMsa0JBQWtCLENBQUNxQyxjQUFjLENBQUNzQixjQUFjLENBQUNsRCxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUNsRVQsa0JBQWtCLENBQUN3QyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUVtQixjQUFjLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUUzRSxNQUFNSyxxQkFBcUIsR0FBRyxJQUFBN0QsMENBQTRCLEVBQUM7SUFDekRDLElBQUksRUFBRSxlQUFlO0lBQ3JCQyxXQUFXLEVBQ1QsbUZBQW1GO0lBQ3JGQyxXQUFXLEVBQUU7TUFDWDJELEtBQUssRUFBRTtRQUNMekQsWUFBWSxFQUFFLHVEQUF1RDtRQUNyRUMsSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUN1QyxzQkFBYTtNQUN4QztJQUNGLENBQUM7SUFDRHpDLFlBQVksRUFBRTtNQUNaZ0QsRUFBRSxFQUFFO1FBQ0Z2RCxXQUFXLEVBQUUsbUJBQW1CO1FBQ2hDSSxJQUFJLEVBQUUsSUFBSUssdUJBQWMsQ0FBQytDLHVCQUFjO01BQ3pDO0lBQ0YsQ0FBQztJQUNEN0MsbUJBQW1CLEVBQUUsT0FBTztNQUFFaUQ7SUFBTSxDQUFDLEVBQUUvQyxPQUFPLEtBQUs7TUFDakQsTUFBTTtRQUFFRyxNQUFNO1FBQUVDLElBQUk7UUFBRUM7TUFBSyxDQUFDLEdBQUdMLE9BQU87TUFFdEMsTUFBTXJCLFdBQVcsQ0FBQ3FFLGtCQUFrQixDQUFDO1FBQ25DVixJQUFJLEVBQUU7VUFDSlM7UUFDRixDQUFDO1FBQ0Q1QyxNQUFNO1FBQ05DLElBQUk7UUFDSkM7TUFDRixDQUFDLENBQUM7TUFFRixPQUFPO1FBQUVxQyxFQUFFLEVBQUU7TUFBSyxDQUFDO0lBQ3JCO0VBQ0YsQ0FBQyxDQUFDO0VBRUY1RCxrQkFBa0IsQ0FBQ3FDLGNBQWMsQ0FBQzJCLHFCQUFxQixDQUFDL0MsSUFBSSxDQUFDcUIsS0FBSyxDQUFDN0IsSUFBSSxDQUFDOEIsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFDM0Z2QyxrQkFBa0IsQ0FBQ3FDLGNBQWMsQ0FBQzJCLHFCQUFxQixDQUFDdkQsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFDekVULGtCQUFrQixDQUFDd0Msa0JBQWtCLENBQUMsZUFBZSxFQUFFd0IscUJBQXFCLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUV6RixNQUFNRyw0QkFBNEIsR0FBRyxJQUFBaEUsMENBQTRCLEVBQUM7SUFDaEVDLElBQUksRUFBRSxzQkFBc0I7SUFDNUJDLFdBQVcsRUFDVCwwRkFBMEY7SUFDNUZDLFdBQVcsRUFBRTtNQUNYOEMsUUFBUSxFQUFFO1FBQ1I1QyxZQUFZLEVBQUUseURBQXlEO1FBQ3ZFQyxJQUFJLEVBQUUsSUFBSUssdUJBQWMsQ0FBQ3VDLHNCQUFhO01BQ3hDLENBQUM7TUFDREMsUUFBUSxFQUFFO1FBQ1I5QyxZQUFZLEVBQUUsMEJBQTBCO1FBQ3hDQyxJQUFJLEVBQUUsSUFBSUssdUJBQWMsQ0FBQ3VDLHNCQUFhO01BQ3hDLENBQUM7TUFDRGUsS0FBSyxFQUFFO1FBQ0w1RCxZQUFZLEVBQUUsMENBQTBDO1FBQ3hEQyxJQUFJLEVBQUUsSUFBSUssdUJBQWMsQ0FBQ3VDLHNCQUFhO01BQ3hDO0lBQ0YsQ0FBQztJQUNEekMsWUFBWSxFQUFFO01BQ1pnRCxFQUFFLEVBQUU7UUFDRnZELFdBQVcsRUFBRSxtQkFBbUI7UUFDaENJLElBQUksRUFBRSxJQUFJSyx1QkFBYyxDQUFDK0MsdUJBQWM7TUFDekM7SUFDRixDQUFDO0lBQ0Q3QyxtQkFBbUIsRUFBRSxPQUFPO01BQUVvQyxRQUFRO01BQUVFLFFBQVE7TUFBRWM7SUFBTSxDQUFDLEVBQUVsRCxPQUFPLEtBQUs7TUFDckUsTUFBTTtRQUFFRztNQUFPLENBQUMsR0FBR0gsT0FBTztNQUMxQixJQUFJLENBQUNrQyxRQUFRLEVBQUU7UUFDYixNQUFNLElBQUlpQixhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNDLGdCQUFnQixFQUFFLDZCQUE2QixDQUFDO01BQ3BGO01BQ0EsSUFBSSxDQUFDakIsUUFBUSxFQUFFO1FBQ2IsTUFBTSxJQUFJZSxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNFLGdCQUFnQixFQUFFLDZCQUE2QixDQUFDO01BQ3BGO01BQ0EsSUFBSSxDQUFDSixLQUFLLEVBQUU7UUFDVixNQUFNLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0csV0FBVyxFQUFFLDBCQUEwQixDQUFDO01BQzVFO01BRUEsTUFBTUMsY0FBYyxHQUFHckQsTUFBTSxDQUFDcUQsY0FBYztNQUM1QyxNQUFNQSxjQUFjLENBQUNDLGNBQWMsQ0FBQ3ZCLFFBQVEsRUFBRWdCLEtBQUssRUFBRWQsUUFBUSxDQUFDO01BQzlELE9BQU87UUFBRU0sRUFBRSxFQUFFO01BQUssQ0FBQztJQUNyQjtFQUNGLENBQUMsQ0FBQztFQUVGNUQsa0JBQWtCLENBQUNxQyxjQUFjLENBQy9COEIsNEJBQTRCLENBQUNsRCxJQUFJLENBQUNxQixLQUFLLENBQUM3QixJQUFJLENBQUM4QixNQUFNLEVBQ25ELElBQUksRUFDSixJQUFJLENBQ0w7RUFDRHZDLGtCQUFrQixDQUFDcUMsY0FBYyxDQUFDOEIsNEJBQTRCLENBQUMxRCxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUNoRlQsa0JBQWtCLENBQUN3QyxrQkFBa0IsQ0FDbkMsc0JBQXNCLEVBQ3RCMkIsNEJBQTRCLEVBQzVCLElBQUksRUFDSixJQUFJLENBQ0w7RUFFRCxNQUFNUyw2QkFBNkIsR0FBRyxJQUFBekUsMENBQTRCLEVBQUM7SUFDakVDLElBQUksRUFBRSx1QkFBdUI7SUFDN0JDLFdBQVcsRUFDVCxzRkFBc0Y7SUFDeEZDLFdBQVcsRUFBRTtNQUNYMkQsS0FBSyxFQUFFO1FBQ0x6RCxZQUFZLEVBQUUsOERBQThEO1FBQzVFQyxJQUFJLEVBQUUsSUFBSUssdUJBQWMsQ0FBQ3VDLHNCQUFhO01BQ3hDO0lBQ0YsQ0FBQztJQUNEekMsWUFBWSxFQUFFO01BQ1pnRCxFQUFFLEVBQUU7UUFDRnZELFdBQVcsRUFBRSxtQkFBbUI7UUFDaENJLElBQUksRUFBRSxJQUFJSyx1QkFBYyxDQUFDK0MsdUJBQWM7TUFDekM7SUFDRixDQUFDO0lBQ0Q3QyxtQkFBbUIsRUFBRSxPQUFPO01BQUVpRDtJQUFNLENBQUMsRUFBRS9DLE9BQU8sS0FBSztNQUNqRCxJQUFJO1FBQ0YsTUFBTTtVQUFFRyxNQUFNO1VBQUVDLElBQUk7VUFBRUM7UUFBSyxDQUFDLEdBQUdMLE9BQU87UUFFdEMsTUFBTXJCLFdBQVcsQ0FBQ2dGLDhCQUE4QixDQUFDO1VBQy9DckIsSUFBSSxFQUFFO1lBQ0pTO1VBQ0YsQ0FBQztVQUNENUMsTUFBTTtVQUNOQyxJQUFJO1VBQ0pDO1FBQ0YsQ0FBQyxDQUFDO1FBRUYsT0FBTztVQUFFcUMsRUFBRSxFQUFFO1FBQUssQ0FBQztNQUNyQixDQUFDLENBQUMsT0FBT3pCLENBQUMsRUFBRTtRQUNWbkMsa0JBQWtCLENBQUNvQyxXQUFXLENBQUNELENBQUMsQ0FBQztNQUNuQztJQUNGO0VBQ0YsQ0FBQyxDQUFDO0VBRUZuQyxrQkFBa0IsQ0FBQ3FDLGNBQWMsQ0FDL0J1Qyw2QkFBNkIsQ0FBQzNELElBQUksQ0FBQ3FCLEtBQUssQ0FBQzdCLElBQUksQ0FBQzhCLE1BQU0sRUFDcEQsSUFBSSxFQUNKLElBQUksQ0FDTDtFQUNEdkMsa0JBQWtCLENBQUNxQyxjQUFjLENBQUN1Qyw2QkFBNkIsQ0FBQ25FLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ2pGVCxrQkFBa0IsQ0FBQ3dDLGtCQUFrQixDQUNuQyx1QkFBdUIsRUFDdkJvQyw2QkFBNkIsRUFDN0IsSUFBSSxFQUNKLElBQUksQ0FDTDtFQUVELE1BQU1FLGlCQUFpQixHQUFHLElBQUEzRSwwQ0FBNEIsRUFBQztJQUNyREMsSUFBSSxFQUFFLFdBQVc7SUFDakJDLFdBQVcsRUFDVCwyR0FBMkc7SUFDN0dDLFdBQVcsRUFBRTtNQUNYOEMsUUFBUSxFQUFFO1FBQ1IvQyxXQUFXLEVBQUUsK0NBQStDO1FBQzVESSxJQUFJLEVBQUU0QztNQUNSLENBQUM7TUFDREMsUUFBUSxFQUFFO1FBQ1JqRCxXQUFXLEVBQUUsK0NBQStDO1FBQzVESSxJQUFJLEVBQUU0QztNQUNSLENBQUM7TUFDRFgsUUFBUSxFQUFFO1FBQ1JyQyxXQUFXLEVBQ1Qsc0ZBQXNGO1FBQ3hGSSxJQUFJLEVBQUVrQztNQUNSLENBQUM7TUFDRG9DLGFBQWEsRUFBRTtRQUNiMUUsV0FBVyxFQUNULDBIQUEwSDtRQUM1SEksSUFBSSxFQUFFa0M7TUFDUjtJQUNGLENBQUM7SUFDRC9CLFlBQVksRUFBRTtNQUNabUUsYUFBYSxFQUFFO1FBQ2IxRSxXQUFXLEVBQUUsbURBQW1EO1FBQ2hFSSxJQUFJLEVBQUVrQztNQUNSO0lBQ0YsQ0FBQztJQUNEM0IsbUJBQW1CLEVBQUUsT0FBT3NCLEtBQUssRUFBRXBCLE9BQU8sS0FBSztNQUM3QyxJQUFJO1FBQ0YsTUFBTTtVQUFFRyxNQUFNO1VBQUVDLElBQUk7VUFBRUM7UUFBSyxDQUFDLEdBQUdMLE9BQU87UUFFdEMsTUFBTTtVQUFFd0M7UUFBUyxDQUFDLEdBQUcsTUFBTTdELFdBQVcsQ0FBQ21GLGVBQWUsQ0FBQztVQUNyRHhCLElBQUksRUFBRWxCLEtBQUs7VUFDWGpCLE1BQU07VUFDTkMsSUFBSTtVQUNKQztRQUNGLENBQUMsQ0FBQztRQUNGLE9BQU9tQyxRQUFRO01BQ2pCLENBQUMsQ0FBQyxPQUFPdkIsQ0FBQyxFQUFFO1FBQ1ZuQyxrQkFBa0IsQ0FBQ29DLFdBQVcsQ0FBQ0QsQ0FBQyxDQUFDO01BQ25DO0lBQ0Y7RUFDRixDQUFDLENBQUM7RUFFRm5DLGtCQUFrQixDQUFDcUMsY0FBYyxDQUFDeUMsaUJBQWlCLENBQUM3RCxJQUFJLENBQUNxQixLQUFLLENBQUM3QixJQUFJLENBQUM4QixNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUN2RnZDLGtCQUFrQixDQUFDcUMsY0FBYyxDQUFDeUMsaUJBQWlCLENBQUNyRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUNyRVQsa0JBQWtCLENBQUN3QyxrQkFBa0IsQ0FBQyxXQUFXLEVBQUVzQyxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0FBQ25GLENBQUM7QUFBQyJ9