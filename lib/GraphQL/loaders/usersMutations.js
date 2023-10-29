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
          originalFields: args.fields || {},
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
          originalFields: args.fields || {},
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2RlZXBjb3B5IiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9Vc2Vyc1JvdXRlciIsIm9iamVjdHNNdXRhdGlvbnMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9kZWZhdWx0R3JhcGhRTFR5cGVzIiwiX3VzZXJzUXVlcmllcyIsIl9tdXRhdGlvbiIsIl9ub2RlIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwibm9kZUludGVyb3AiLCJXZWFrTWFwIiwiY2FjaGVCYWJlbEludGVyb3AiLCJjYWNoZU5vZGVJbnRlcm9wIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJjYWNoZSIsImhhcyIsImdldCIsIm5ld09iaiIsImhhc1Byb3BlcnR5RGVzY3JpcHRvciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZGVzYyIsInNldCIsIm93bktleXMiLCJvYmplY3QiLCJlbnVtZXJhYmxlT25seSIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJzeW1ib2xzIiwiZmlsdGVyIiwic3ltIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJ0YXJnZXQiLCJpIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwic291cmNlIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiVHlwZUVycm9yIiwiTnVtYmVyIiwidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNpZ25VcE11dGF0aW9uIiwibXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwiZmllbGRzIiwiZGVzY3JpcHRpb25zIiwidHlwZSIsInBhcnNlQ2xhc3NUeXBlcyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJvdXRwdXRGaWVsZHMiLCJ2aWV3ZXIiLCJHcmFwaFFMTm9uTnVsbCIsInZpZXdlclR5cGUiLCJtdXRhdGVBbmRHZXRQYXlsb2FkIiwiYXJncyIsImNvbnRleHQiLCJtdXRhdGlvbkluZm8iLCJkZWVwY29weSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwicGFyc2VGaWVsZHMiLCJ0cmFuc2Zvcm1UeXBlcyIsImNsYXNzTmFtZSIsIm9yaWdpbmFsRmllbGRzIiwicmVxIiwic2Vzc2lvblRva2VuIiwib2JqZWN0SWQiLCJhdXRoRGF0YVJlc3BvbnNlIiwiY3JlYXRlT2JqZWN0IiwiZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4iLCJ1c2VyIiwiZSIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJvZlR5cGUiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJsb2dJbldpdGhNdXRhdGlvbiIsImF1dGhEYXRhIiwiT0JKRUNUIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsImNsYXNzR3JhcGhRTENyZWF0ZUZpZWxkcyIsImdldEZpZWxkcyIsInJlZHVjZSIsImZpZWxkTmFtZSIsImxvZ0luTXV0YXRpb24iLCJ1c2VybmFtZSIsIkdyYXBoUUxTdHJpbmciLCJwYXNzd29yZCIsImhhbmRsZUxvZ0luIiwiYm9keSIsInF1ZXJ5IiwicmVzcG9uc2UiLCJsb2dPdXRNdXRhdGlvbiIsIm9rIiwiR3JhcGhRTEJvb2xlYW4iLCJfYXJncyIsImhhbmRsZUxvZ091dCIsInJlc2V0UGFzc3dvcmRNdXRhdGlvbiIsImVtYWlsIiwiaGFuZGxlUmVzZXRSZXF1ZXN0IiwiY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbiIsInRva2VuIiwiUGFyc2UiLCJFcnJvciIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiT1RIRVJfQ0FVU0UiLCJ1c2VyQ29udHJvbGxlciIsInVwZGF0ZVBhc3N3b3JkIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24iLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJjaGFsbGVuZ2VNdXRhdGlvbiIsImNoYWxsZW5nZURhdGEiLCJoYW5kbGVDaGFsbGVuZ2UiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy91c2Vyc011dGF0aW9ucy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCwgR3JhcGhRTFN0cmluZywgR3JhcGhRTEJvb2xlYW4sIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgVXNlcnNSb3V0ZXIgZnJvbSAnLi4vLi4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgeyBPQkpFQ1QgfSBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHsgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4gfSBmcm9tICcuL3VzZXJzUXVlcmllcyc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9tdXRhdGlvbic7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5cbmNvbnN0IHVzZXJzUm91dGVyID0gbmV3IFVzZXJzUm91dGVyKCk7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLmlzVXNlcnNDbGFzc0Rpc2FibGVkKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgc2lnblVwTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnU2lnblVwJyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBzaWduVXAgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGFuZCBzaWduIHVwIGEgbmV3IHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIG9mIHRoZSBuZXcgdXNlciB0byBiZSBjcmVhdGVkIGFuZCBzaWduZWQgdXAuJyxcbiAgICAgICAgdHlwZTogcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1snX1VzZXInXS5jbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgZmllbGRzLCB7XG4gICAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICBvcmlnaW5hbEZpZWxkczogYXJncy5maWVsZHMgfHwge30sXG4gICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiwgb2JqZWN0SWQsIGF1dGhEYXRhUmVzcG9uc2UgfSA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mb1xuICAgICAgICApO1xuXG4gICAgICAgIGNvbnRleHQuaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG4gICAgICAgIGNvbnN0IHZpZXdlciA9IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgbXV0YXRpb25JbmZvLFxuICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgIG9iamVjdElkXG4gICAgICAgICk7XG4gICAgICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlICYmIHZpZXdlci51c2VyKSB2aWV3ZXIudXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXIsXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoc2lnblVwTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShzaWduVXBNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignc2lnblVwJywgc2lnblVwTXV0YXRpb24sIHRydWUsIHRydWUpO1xuICBjb25zdCBsb2dJbldpdGhNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dJbldpdGgnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBsb2dJbldpdGggbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gc2lnbnVwLCBsb2dpbiB1c2VyIHdpdGggM3JkIHBhcnR5IGF1dGhlbnRpY2F0aW9uIHN5c3RlbS4gVGhpcyBtdXRhdGlvbiBjcmVhdGUgYSB1c2VyIGlmIHRoZSBhdXRoRGF0YSBkbyBub3QgY29ycmVzcG9uZCB0byBhbiBleGlzdGluZyBvbmUuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgYXV0aERhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVGhpcyBpcyB0aGUgYXV0aCBkYXRhIG9mIHlvdXIgY3VzdG9tIGF1dGggcHJvdmlkZXInLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoT0JKRUNUKSxcbiAgICAgIH0sXG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgb2YgdGhlIHVzZXIgdG8gYmUgY3JlYXRlZC91cGRhdGVkIGFuZCBsb2dnZWQgaW4uJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgICAgICAgIG5hbWU6ICdVc2VyTG9naW5XaXRoSW5wdXQnLFxuICAgICAgICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tcbiAgICAgICAgICAgICAgJ19Vc2VyJ1xuICAgICAgICAgICAgXS5jbGFzc0dyYXBoUUxDcmVhdGVUeXBlLmdldEZpZWxkcygpO1xuICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKGNsYXNzR3JhcGhRTENyZWF0ZUZpZWxkcykucmVkdWNlKChmaWVsZHMsIGZpZWxkTmFtZSkgPT4ge1xuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAncGFzc3dvcmQnICYmXG4gICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAndXNlcm5hbWUnICYmXG4gICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAnYXV0aERhdGEnXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIGZpZWxkc1tmaWVsZE5hbWVdID0gY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICAgIH0sIHt9KTtcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5ldyB1c2VyIHRoYXQgd2FzIGNyZWF0ZWQsIHNpZ25lZCB1cCBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGZpZWxkcywgYXV0aERhdGEgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgIG9yaWdpbmFsRmllbGRzOiBhcmdzLmZpZWxkcyB8fCB7fSxcbiAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHsgc2Vzc2lvblRva2VuLCBvYmplY3RJZCwgYXV0aERhdGFSZXNwb25zZSB9ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IC4uLnBhcnNlRmllbGRzLCBhdXRoRGF0YSB9LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm9cbiAgICAgICAgKTtcblxuICAgICAgICBjb250ZXh0LmluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuICAgICAgICBjb25zdCB2aWV3ZXIgPSBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIG11dGF0aW9uSW5mbyxcbiAgICAgICAgICAndmlld2VyLnVzZXIuJyxcbiAgICAgICAgICBvYmplY3RJZFxuICAgICAgICApO1xuICAgICAgICBpZiAoYXV0aERhdGFSZXNwb25zZSAmJiB2aWV3ZXIudXNlcikgdmlld2VyLnVzZXIuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdmlld2VyLFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luV2l0aE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5XaXRoTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ0luV2l0aCcsIGxvZ0luV2l0aE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCBsb2dJbk11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ0luJyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBsb2dJbiBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBsb2cgaW4gYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1c2VybmFtZToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVzZXJuYW1lIHVzZWQgdG8gbG9nIGluIHRoZSB1c2VyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBhc3N3b3JkIHVzZWQgdG8gbG9nIGluIHRoZSB1c2VyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ0F1dGggZGF0YSBwYXlsb2FkLCBuZWVkZWQgaWYgc29tZSByZXF1aXJlZCBhdXRoIGFkYXB0ZXJzIGFyZSBjb25maWd1cmVkLicsXG4gICAgICAgIHR5cGU6IE9CSkVDVCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGV4aXN0aW5nIHVzZXIgdGhhdCB3YXMgbG9nZ2VkIGluIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIHBhc3N3b3JkLCBhdXRoRGF0YSB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHsgc2Vzc2lvblRva2VuLCBvYmplY3RJZCwgYXV0aERhdGFSZXNwb25zZSB9ID0gKFxuICAgICAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZUxvZ0luKHtcbiAgICAgICAgICAgIGJvZHk6IHtcbiAgICAgICAgICAgICAgdXNlcm5hbWUsXG4gICAgICAgICAgICAgIHBhc3N3b3JkLFxuICAgICAgICAgICAgICBhdXRoRGF0YSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBxdWVyeToge30sXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICB9KVxuICAgICAgICApLnJlc3BvbnNlO1xuXG4gICAgICAgIGNvbnRleHQuaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgY29uc3Qgdmlld2VyID0gYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgb2JqZWN0SWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UgJiYgdmlld2VyLnVzZXIpIHZpZXdlci51c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcixcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbk11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5NdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignbG9nSW4nLCBsb2dJbk11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCBsb2dPdXRNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dPdXQnLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGxvZ091dCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBsb2cgb3V0IGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKF9hcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVMb2dPdXQoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nT3V0TXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dPdXRNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignbG9nT3V0JywgbG9nT3V0TXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IHJlc2V0UGFzc3dvcmRNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdSZXNldFBhc3N3b3JkJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgcmVzZXRQYXNzd29yZCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byByZXNldCB0aGUgcGFzc3dvcmQgb2YgYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBlbWFpbDoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdFbWFpbCBvZiB0aGUgdXNlciB0aGF0IHNob3VsZCByZWNlaXZlIHRoZSByZXNldCBlbWFpbCcsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKHsgZW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZVJlc2V0UmVxdWVzdCh7XG4gICAgICAgIGJvZHk6IHtcbiAgICAgICAgICBlbWFpbCxcbiAgICAgICAgfSxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBpbmZvLFxuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHJlc2V0UGFzc3dvcmRNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHJlc2V0UGFzc3dvcmRNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbigncmVzZXRQYXNzd29yZCcsIHJlc2V0UGFzc3dvcmRNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdDb25maXJtUmVzZXRQYXNzd29yZCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGNvbmZpcm1SZXNldFBhc3N3b3JkIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHJlc2V0IHRoZSBwYXNzd29yZCBvZiBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVzZXJuYW1lOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ1VzZXJuYW1lIG9mIHRoZSB1c2VyIHRoYXQgaGF2ZSByZWNlaXZlZCB0aGUgcmVzZXQgZW1haWwnLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnTmV3IHBhc3N3b3JkIG9mIHRoZSB1c2VyJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIHRva2VuOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ1Jlc2V0IHRva2VuIHRoYXQgd2FzIGVtYWlsZWQgdG8gdGhlIHVzZXInLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jICh7IHVzZXJuYW1lLCBwYXNzd29yZCwgdG9rZW4gfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgeyBjb25maWcgfSA9IGNvbnRleHQ7XG4gICAgICBpZiAoIXVzZXJuYW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhIHVzZXJuYW1lJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhIHBhc3N3b3JkJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXRva2VuKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ3lvdSBtdXN0IHByb3ZpZGUgYSB0b2tlbicpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IGNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICAgIGF3YWl0IHVzZXJDb250cm9sbGVyLnVwZGF0ZVBhc3N3b3JkKHVzZXJuYW1lLCB0b2tlbiwgcGFzc3dvcmQpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAnY29uZmlybVJlc2V0UGFzc3dvcmQnLFxuICAgIGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG5cbiAgY29uc3Qgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnU2VuZFZlcmlmaWNhdGlvbkVtYWlsJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgc2VuZFZlcmlmaWNhdGlvbkVtYWlsIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHNlbmQgdGhlIHZlcmlmaWNhdGlvbiBlbWFpbCBhZ2Fpbi4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBlbWFpbDoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdFbWFpbCBvZiB0aGUgdXNlciB0aGF0IHNob3VsZCByZWNlaXZlIHRoZSB2ZXJpZmljYXRpb24gZW1haWwnLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jICh7IGVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCh7XG4gICAgICAgICAgYm9keToge1xuICAgICAgICAgICAgZW1haWwsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJyxcbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbixcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBjb25zdCBjaGFsbGVuZ2VNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdDaGFsbGVuZ2UnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBjaGFsbGVuZ2UgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gaW5pdGlhdGUgYW4gYXV0aGVudGljYXRpb24gY2hhbGxlbmdlIHdoZW4gYW4gYXV0aCBhZGFwdGVyIG5lZWRzIGl0LicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVzZXJuYW1lOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXNlcm5hbWUgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBhc3N3b3JkIHVzZWQgdG8gbG9nIGluIHRoZSB1c2VyLicsXG4gICAgICAgIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG4gICAgICB9LFxuICAgICAgYXV0aERhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ0F1dGggZGF0YSBhbGxvdyB0byBwcmVpZGVudGlmeSB0aGUgdXNlciBpZiB0aGUgYXV0aCBhZGFwdGVyIG5lZWRzIHByZWlkZW50aWZpY2F0aW9uLicsXG4gICAgICAgIHR5cGU6IE9CSkVDVCxcbiAgICAgIH0sXG4gICAgICBjaGFsbGVuZ2VEYXRhOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdDaGFsbGVuZ2UgZGF0YSBwYXlsb2FkLCBjYW4gYmUgdXNlZCB0byBwb3N0IGRhdGEgdG8gYXV0aCBwcm92aWRlcnMgdG8gYXV0aCBwcm92aWRlcnMgaWYgdGhleSBuZWVkIGRhdGEgZm9yIHRoZSByZXNwb25zZS4nLFxuICAgICAgICB0eXBlOiBPQkpFQ1QsXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBjaGFsbGVuZ2VEYXRhOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2hhbGxlbmdlIHJlc3BvbnNlIGZyb20gY29uZmlndXJlZCBhdXRoIGFkYXB0ZXJzLicsXG4gICAgICAgIHR5cGU6IE9CSkVDVCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoaW5wdXQsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHsgcmVzcG9uc2UgfSA9IGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZUNoYWxsZW5nZSh7XG4gICAgICAgICAgYm9keTogaW5wdXQsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjaGFsbGVuZ2VNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNoYWxsZW5nZU11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdjaGFsbGVuZ2UnLCBjaGFsbGVuZ2VNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLFFBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLGFBQUEsR0FBQUQsT0FBQTtBQUNBLElBQUFFLFNBQUEsR0FBQUMsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFJLFlBQUEsR0FBQUQsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFLLGdCQUFBLEdBQUFDLHVCQUFBLENBQUFOLE9BQUE7QUFDQSxJQUFBTyxvQkFBQSxHQUFBUCxPQUFBO0FBQ0EsSUFBQVEsYUFBQSxHQUFBUixPQUFBO0FBQ0EsSUFBQVMsU0FBQSxHQUFBVCxPQUFBO0FBQ0EsSUFBQVUsS0FBQSxHQUFBUCxzQkFBQSxDQUFBSCxPQUFBO0FBQStCLFNBQUFXLHlCQUFBQyxXQUFBLGVBQUFDLE9BQUEsa0NBQUFDLGlCQUFBLE9BQUFELE9BQUEsUUFBQUUsZ0JBQUEsT0FBQUYsT0FBQSxZQUFBRix3QkFBQSxZQUFBQSxDQUFBQyxXQUFBLFdBQUFBLFdBQUEsR0FBQUcsZ0JBQUEsR0FBQUQsaUJBQUEsS0FBQUYsV0FBQTtBQUFBLFNBQUFOLHdCQUFBVSxHQUFBLEVBQUFKLFdB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