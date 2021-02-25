import { GraphQLNonNull } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import { ParseGraphQLClassConfig } from '../../Controllers/ParseGraphQLController';
import { transformClassNameToGraphQL } from '../transformers/className';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import { extractKeysAndInclude } from '../parseGraphQLUtils';
import { transformQueryInputToParse } from '../transformers/query';

const getParseClassSubscriptionConfig = function (parseClassConfig: ?ParseGraphQLClassConfig) {
  return (parseClassConfig && parseClassConfig.subscription) || {};
};

const load = function (parseGraphQLSchema, parseClass, parseClassConfig: ?ParseGraphQLClassConfig) {
  const {
    enabled: isSubscriptionEnabled = true,
    alias: subscriptionAlias = '',
  } = getParseClassSubscriptionConfig(parseClassConfig);

  if (isSubscriptionEnabled) {
    const className = parseClass.className;

    const graphQLClassName = transformClassNameToGraphQL(className);
    const lowerCaseClassName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);
    const graphQLSubscriptionName = subscriptionAlias || lowerCaseClassName;

    const {
      classGraphQLConstraintsType,
      classGraphQLSubscriptionType,
    } = parseGraphQLSchema.parseClassTypes[className];

    parseGraphQLSchema.addGraphQLSubscription(graphQLSubscriptionName, {
      description: `The ${graphQLSubscriptionName} subscription can be used to listen events on objects of the ${graphQLClassName} class under given conditions.`,
      args: {
        on: defaultGraphQLTypes.EVENT_KINDS_ATT,
        where: {
          description:
            'These are the conditions that the objects need to match in the subscription.',
          type: classGraphQLConstraintsType,
        },
      },
      type: new GraphQLNonNull(classGraphQLSubscriptionType),
      subscribe(_source, args, context, queryInfo) {
        let nextResolve;
        let nextReject;
        let nextPromise;

        const newNextPromise = () => {
          nextPromise = new Promise((resolve, reject) => {
            nextResolve = resolve;
            nextReject = reject;
          });
        };

        newNextPromise();

        const { on } = args;
        const { liveQuery, keyPairs } = context;

        const listener = message => {
          switch (message.op) {
            case 'create':
            case 'enter':
            case 'update':
            case 'leave':
            case 'delete':
              if (!on.includes('all') && !on.includes(message.op)) {
                return;
              }

              nextResolve({
                done: false,
                value: {
                  [graphQLSubscriptionName]: {
                    event: message.op,
                    node: message.object,
                    originalNode: message.original,
                  },
                },
              });
              break;
            case 'error':
              nextReject({
                code: message.code,
                message: message.error,
              });
              return;
            default:
              return;
          }

          newNextPromise();
        };

        const unsubscribe = () => liveQuery.unsubscribe(listener);

        const selectedFields = getFieldNames(queryInfo);
        const { keys: nodeKeys } = extractKeysAndInclude(
          selectedFields
            .filter(field => field.startsWith('node.'))
            .map(field => field.replace('node.', ''))
        );
        const { keys: originalNodeKeys } = extractKeysAndInclude(
          selectedFields
            .filter(field => field.startsWith('originalNode.'))
            .map(field => field.replace('originalNode.', ''))
        );

        const fields = [...new Set(nodeKeys.split(',').concat(originalNodeKeys.split(',')))];

        let { where } = args;
        if (!where) {
          where = {};
        }
        transformQueryInputToParse(where, className, parseGraphQLSchema.parseClasses);

        liveQuery.subscribe(
          {
            className,
            where,
            fields,
          },
          keyPairs.sessionToken,
          listener
        );

        return {
          [Symbol.asyncIterator]() {
            return {
              next() {
                return nextPromise;
              },
              return() {
                unsubscribe();

                return Promise.resolve({
                  done: true,
                  value: undefined,
                });
              },
              throw(error) {
                unsubscribe();

                return Promise.resolve({
                  done: true,
                  value: error,
                });
              },
            };
          },
        };
      },
    });
  }
};

export { load };
