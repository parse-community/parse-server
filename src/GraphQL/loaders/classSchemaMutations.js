import Parse from 'parse/node';
import { GraphQLNonNull } from 'graphql';
import * as classSchemaTypes from './classSchemaTypes';
import {
  transformToParse,
  transformToGraphQL,
} from '../transformers/schemaFields';
import { enforceMasterKeyAccess } from '../parseGraphQLUtils';
import { getClass } from './classSchemaQueries';

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLMutation(
    'createClass',
    {
      description:
        'The createClass mutation can be used to create the schema for a new object class.',
      args: {
        name: classSchemaTypes.CLASS_NAME_ATT,
        schemaFields: {
          description: "These are the schema's fields of the object class.",
          type: classSchemaTypes.SCHEMA_FIELDS_INPUT,
        },
      },
      type: new GraphQLNonNull(classSchemaTypes.CLASS),
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
        name: classSchemaTypes.CLASS_NAME_ATT,
        schemaFields: {
          description: "These are the schema's fields of the object class.",
          type: classSchemaTypes.SCHEMA_FIELDS_INPUT,
        },
      },
      type: new GraphQLNonNull(classSchemaTypes.CLASS),
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
};

export { load };
