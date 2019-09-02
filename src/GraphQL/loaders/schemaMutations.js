import Parse from 'parse/node';
import { GraphQLNonNull } from 'graphql';
import * as schemaTypes from './schemaTypes';
import {
  transformToParse,
  transformToGraphQL,
} from '../transformers/schemaFields';
import { enforceMasterKeyAccess } from '../parseGraphQLUtils';
import { getClass } from './schemaQueries';

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLMutation(
    'createClass',
    {
      description:
        'The createClass mutation can be used to create the schema for a new object class.',
      args: {
        name: schemaTypes.CLASS_NAME_ATT,
        schemaFields: {
          description: "These are the schema's fields of the object class.",
          type: schemaTypes.SCHEMA_FIELDS_INPUT,
        },
      },
      type: new GraphQLNonNull(schemaTypes.CLASS),
      resolve: async (_source, args, context) => {
        try {
          const { name, schemaFields } = args;
          const { config, auth } = context;

          enforceMasterKeyAccess(auth);

          if (auth.isReadOnly) {
            throw new Parse.Error(
              Parse.Error.OPERATION_FORBIDDEN,
              "read-only masterKey isn't allowed to create a schema."
            );
          }

          const schema = await config.database.loadSchema({ clearCache: true });
          const parseClass = await schema.addClassIfNotExists(
            name,
            transformToParse(schemaFields)
          );
          return {
            name: parseClass.className,
            schemaFields: transformToGraphQL(parseClass.fields),
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    },
    true,
    true
  );

  parseGraphQLSchema.addGraphQLMutation(
    'updateClass',
    {
      description:
        'The updateClass mutation can be used to update the schema for an existing object class.',
      args: {
        name: schemaTypes.CLASS_NAME_ATT,
        schemaFields: {
          description: "These are the schema's fields of the object class.",
          type: schemaTypes.SCHEMA_FIELDS_INPUT,
        },
      },
      type: new GraphQLNonNull(schemaTypes.CLASS),
      resolve: async (_source, args, context) => {
        try {
          const { name, schemaFields } = args;
          const { config, auth } = context;

          enforceMasterKeyAccess(auth);

          if (auth.isReadOnly) {
            throw new Parse.Error(
              Parse.Error.OPERATION_FORBIDDEN,
              "read-only masterKey isn't allowed to update a schema."
            );
          }

          const schema = await config.database.loadSchema({ clearCache: true });
          const existingParseClass = await getClass(name, schema);
          const parseClass = await schema.updateClass(
            name,
            transformToParse(schemaFields, existingParseClass.fields),
            undefined,
            undefined,
            config.database
          );
          return {
            name: parseClass.className,
            schemaFields: transformToGraphQL(parseClass.fields),
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    },
    true,
    true
  );

  parseGraphQLSchema.addGraphQLMutation(
    'deleteClass',
    {
      description:
        'The deleteClass mutation can be used to delete an existing object class.',
      args: {
        name: schemaTypes.CLASS_NAME_ATT,
      },
      type: new GraphQLNonNull(schemaTypes.CLASS),
      resolve: async (_source, args, context) => {
        try {
          const { name } = args;
          const { config, auth } = context;

          enforceMasterKeyAccess(auth);

          if (auth.isReadOnly) {
            throw new Parse.Error(
              Parse.Error.OPERATION_FORBIDDEN,
              "read-only masterKey isn't allowed to delete a schema."
            );
          }

          const schema = await config.database.loadSchema({ clearCache: true });
          const existingParseClass = await getClass(name, schema);
          await config.database.deleteSchema(name);
          return {
            name: existingParseClass.className,
            schemaFields: transformToGraphQL(existingParseClass.fields),
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    },
    true,
    true
  );
};

export { load };
