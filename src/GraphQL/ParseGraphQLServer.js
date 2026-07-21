import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.js';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginCacheControlDisabled } from '@apollo/server/plugin/disabled';
import express from 'express';
import { GraphQLError, parse } from 'graphql';
import { allowCrossDomain, handleParseErrors, handleParseHeaders, handleParseSession } from '../middlewares';
import requiredParameter from '../requiredParameter';
import defaultLogger from '../logger';
import { ParseGraphQLSchema } from './ParseGraphQLSchema';
import ParseGraphQLController, { ParseGraphQLConfig } from '../Controllers/ParseGraphQLController';
import { createComplexityValidationPlugin } from './helpers/queryComplexity';


const hasTypeIntrospection = (query) => {
  try {
    const ast = parse(query);
    const checkSelections = (selections) => {
      for (const selection of selections) {
        if (selection.kind === 'Field' && selection.name.value === '__type') {
          if (selection.arguments && selection.arguments.length > 0) {
            return true;
          }
        }
        if (selection.selectionSet) {
          if (checkSelections(selection.selectionSet.selections)) {
            return true;
          }
        }
      }
      return false;
    };
    for (const definition of ast.definitions) {
      if (definition.selectionSet) {
        if (checkSelections(definition.selectionSet.selections)) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
};

const throwIntrospectionError = () => {
  throw new GraphQLError('Introspection is not allowed', {
    extensions: {
      http: {
        status: 403,
      },
    }
  });
};

const IntrospectionControlPlugin = (publicIntrospection) => ({


  requestDidStart: (requestContext) => ({

    didResolveOperation: async () => {
      // If public introspection is enabled, we allow all introspection queries
      if (publicIntrospection) {
        return;
      }

      const isMasterOrMaintenance = requestContext.contextValue.auth?.isMaster || requestContext.contextValue.auth?.isMaintenance
      if (isMasterOrMaintenance) {
        return;
      }

      const query = requestContext.request.query;


      // Fast path: simple string check for __schema
      // This avoids parsing the query in most cases
      if (query?.includes('__schema')) {
        return throwIntrospectionError();
      }

      // Smart check for __type: only parse if the string is present
      // This avoids false positives (e.g., "__type" in strings or comments)
      // while still being efficient for the common case
      if (query?.includes('__type') && hasTypeIntrospection(query)) {
        return throwIntrospectionError();
      }
    },

  })

});

// graphql-js embeds "Did you mean ...?" hints sourced from the live schema in
// its error messages. They are produced in two distinct phases:
//   - validation rules (FieldsOnCorrectTypeRule, KnownArgumentNamesRule,
//     KnownTypeNamesRule, ...), and
//   - variable coercion (unknown enum values, unknown input-object fields),
//     which runs during execution, after validation.
// All of these are returned to the caller and disclose schema identifiers (Cloud
// Code function names, class and field names) that the introspection guard is
// meant to hide. Strip the hint suffix from every returned error — including the
// copy graphql-js duplicates into extensions.stacktrace in non-production — for
// callers that are not allowed to introspect.
const stripSchemaSuggestion = message =>
  typeof message === 'string' ? message.replace(/ ?Did you mean(.+?)\?$/, '') : message;

// graphql-js also emits a base input-coercion message that names a schema
// identifier WITHOUT a "Did you mean" clause, so the suggestion strip above
// cannot reach it: when a required custom input field is omitted, coerceInputValue
// returns 'Field "<name>" of required type "<type>" was not provided.', disclosing
// a field name the caller never supplied. Redact the quoted identifiers from this
// template while preserving the error shape, for callers that are not allowed to
// introspect. The sibling coercion messages ('... is not defined by type "<type>".',
// 'Expected type "<type>" to be an object.') are intentionally left intact: they
// only echo an input type name the caller already referenced in the operation, so
// they disclose nothing the caller did not already provide.
const stripSchemaCoercionIdentifiers = message =>
  typeof message === 'string'
    ? message.replace(
      /Field "[^"]*" of required type "[^"]*" was not provided\./g,
      'Field of required type was not provided.'
    )
    : message;

// graphql-js also emits base coercion / validation messages that name a nested input
// TYPE without a "Did you mean" clause, so neither strip above reaches them. For a
// Pointer or Relation field the generated input type name embeds the pointer's TARGET
// class (`<Target>PointerInput`, `<Target>RelationWhereInput`, `Create<Target>FieldsInput`)
// — a class the caller never referenced and cannot derive from the field name they
// supplied — so these templates disclose a schema class name to a caller who has only the
// public application id. Redact the quoted type identifier from those templates UNLESS the
// caller referenced it in the operation text: a type name the caller wrote in the operation
// (e.g. `$where: UserWhereInput`) is not a disclosure, and preserving it keeps the message
// ('... is not defined by type "UserWhereInput".') useful. When the operation text is
// unavailable the identifier is redacted (fail closed).
const stripSchemaTypeIdentifiers = (message, operationText) => {
  if (typeof message !== 'string') { return message; }
  // A generated type identifier counts as "referenced" (and therefore not a disclosure) only if
  // the caller wrote it as a whole token in the operation text. Tokenize the operation on
  // non-identifier characters and compare exact tokens rather than building a RegExp from the
  // captured name: this avoids substring false-matches (e.g. preserving "AuthorPointerInput"
  // because the operation contains "SecretAuthorPointerInput") and any regex injection/ReDoS from
  // an unusual captured name. GraphQL list/non-null wrappers ("[", "]", "!") are stripped from the
  // captured name so e.g. "SecretAuthorPointerInput!" still matches "$x: SecretAuthorPointerInput!".
  // When the operation text is unavailable the type is treated as not referenced (fail closed).
  const referencedTokens =
    typeof operationText === 'string'
      ? new Set(operationText.split(/[^_A-Za-z0-9]+/).filter(Boolean))
      : new Set();
  const isReferenced = typeName => referencedTokens.has(typeName.replace(/[[\]!]/g, ''));
  return message
    // Input coercion / ValuesOfCorrectTypeRule (variables and inline literals).
    .replace(/Expected value of type "([^"]+)"/g, (match, typeName) =>
      isReferenced(typeName) ? match : 'Expected value of the correct type'
    )
    .replace(/Expected type "([^"]+)" to be an object\./g, (match, typeName) =>
      isReferenced(typeName) ? match : 'Expected an object.'
    )
    .replace(/Expected non-nullable type "([^"]+)" not to be null\./g, (match, typeName) =>
      isReferenced(typeName) ? match : 'Expected a non-null value.'
    )
    .replace(/ is not defined by type "([^"]+)"\./g, (match, typeName) =>
      isReferenced(typeName) ? match : ' is not defined.'
    )
    // VariablesInAllowedPositionRule: the position type is the pointer/relation target
    // input type; the caller only wrote their own variable's declared type.
    .replace(/ used in position expecting type "([^"]+)"\./g, (match, typeName) =>
      isReferenced(typeName) ? match : ' used in position expecting a different type.'
    )
    // FieldsOnCorrectTypeRule: descending into a Pointer/Relation output field names its
    // target output object type.
    .replace(/Cannot query field ("[^"]*") on type "([^"]+)"\./g, (match, fieldName, typeName) =>
      isReferenced(typeName) ? match : `Cannot query field ${fieldName}.`
    )
    // ScalarLeafsRule: selecting a Pointer/Relation output field with no sub-selection names
    // its target output object type.
    .replace(
      /Field ("[^"]*") of type "([^"]+)" must have a selection of subfields\./g,
      (match, fieldName, typeName) =>
        isReferenced(typeName) ? match : `Field ${fieldName} must have a selection of subfields.`
    )
    // PossibleFragmentSpreadsRule: an inline/named fragment on an incompatible type inside a
    // Pointer/Relation output field names the target output object type (the parent type).
    // Redact each type token the caller did not reference; when both are referenced the
    // reconstruction is identical to the original message.
    .replace(
      /objects of type "([^"]+)" can never be of type "([^"]+)"\./g,
      (match, parentType, fragType) => {
        const parent = isReferenced(parentType) ? `type "${parentType}"` : 'the parent type';
        const frag = isReferenced(fragType) ? `type "${fragType}"` : 'the given type';
        return `objects of ${parent} can never be of ${frag}.`;
      }
    );
};

const stripSchemaIdentifiers = (message, operationText) =>
  stripSchemaTypeIdentifiers(
    stripSchemaCoercionIdentifiers(stripSchemaSuggestion(message)),
    operationText
  );

const SchemaSuggestionsControlPlugin = (publicIntrospection) => ({
  requestDidStart: async (requestContext) => ({
    willSendResponse: async () => {
      if (publicIntrospection) {
        return;
      }
      const isMasterOrMaintenance =
        requestContext.contextValue.auth?.isMaster ||
        requestContext.contextValue.auth?.isMaintenance;
      if (isMasterOrMaintenance) {
        return;
      }
      const body = requestContext.response?.body;
      const errors =
        body?.kind === 'single'
          ? body.singleResult.errors
          : body?.kind === 'incremental'
            ? body.initialResult.errors
            : undefined;
      const operationText = requestContext.request?.query;
      errors?.forEach(error => {
        error.message = stripSchemaIdentifiers(error.message, operationText);
        if (Array.isArray(error.extensions?.stacktrace)) {
          error.extensions.stacktrace = error.extensions.stacktrace.map(message =>
            stripSchemaIdentifiers(message, operationText)
          );
        }
      });
    },
  }),
});

class ParseGraphQLServer {
  parseGraphQLController: ParseGraphQLController;

  constructor(parseServer, config) {
    this.parseServer = parseServer || requiredParameter('You must provide a parseServer instance!');
    if (!config || !config.graphQLPath) {
      requiredParameter('You must provide a config.graphQLPath!');
    }
    this.config = config;
    this.parseGraphQLController = this.parseServer.config.parseGraphQLController;
    this.log =
      (this.parseServer.config && this.parseServer.config.loggerController) || defaultLogger;
    this.parseGraphQLSchema = new ParseGraphQLSchema({
      parseGraphQLController: this.parseGraphQLController,
      databaseController: this.parseServer.config.databaseController,
      log: this.log,
      graphQLCustomTypeDefs: this.config.graphQLCustomTypeDefs,
      appId: this.parseServer.config.appId,
    });
  }

  async _getGraphQLOptions() {
    try {
      return {
        schema: await this.parseGraphQLSchema.load(),
        context: async ({ req }) => {
          return {
            info: req.info,
            config: req.config,
            auth: req.auth,
          };
        },
      };
    } catch (e) {
      this.log.error(e.stack || (typeof e.toString === 'function' && e.toString()) || e);
      throw e;
    }
  }

  async _getServer() {
    const schemaRef = this.parseGraphQLSchema.graphQLSchema;
    const newSchemaRef = await this.parseGraphQLSchema.load();
    if (schemaRef === newSchemaRef && this._server) {
      return this._server;
    }
    // It means a parallel _getServer call is already in progress
    if (this._schemaRefMutex === newSchemaRef) {
      return this._server;
    }
    // Update the schema ref mutex to avoid parallel _getServer calls
    this._schemaRefMutex = newSchemaRef;
    const createServer = async () => {
      try {
        const { schema, context } = await this._getGraphQLOptions();
        const apollo = new ApolloServer({
          csrfPrevention: {
            // See https://www.apollographql.com/docs/router/configuration/csrf/
            // needed since we use graphql upload
            requestHeaders: ['X-Parse-Application-Id'],
          },
          // We need always true introspection because apollo server have changing behavior based on the NODE_ENV variable
          // we delegate the introspection control to the IntrospectionControlPlugin
          introspection: true,
          plugins: [ApolloServerPluginCacheControlDisabled(), IntrospectionControlPlugin(this.config.graphQLPublicIntrospection), SchemaSuggestionsControlPlugin(this.config.graphQLPublicIntrospection), createComplexityValidationPlugin(() => this.parseServer.config.requestComplexity)],
          schema,
        });
        await apollo.start();
        return expressMiddleware(apollo, {
          context,
        });
      } catch (e) {
        // Reset all mutexes and forward the error
        this._server = null;
        this._schemaRefMutex = null;
        throw e;
      }
    }
    // Do not await so parallel request will wait the same promise ref
    this._server = createServer();
    return this._server;
  }

  _transformMaxUploadSizeToBytes(maxUploadSize) {
    const unitMap = {
      kb: 1,
      mb: 2,
      gb: 3,
    };

    return (
      Number(maxUploadSize.slice(0, -2)) *
      Math.pow(1024, unitMap[maxUploadSize.slice(-2).toLowerCase()])
    );
  }

  /**
   * @static
   * Allow developers to customize each request with inversion of control/dependency injection
   */
  applyRequestContextMiddleware(api, options) {
    if (options.requestContextMiddleware) {
      if (typeof options.requestContextMiddleware !== 'function') {
        throw new Error('requestContextMiddleware must be a function');
      }
      api.use(this.config.graphQLPath, options.requestContextMiddleware);
    }
  }

  applyGraphQL(app) {
    if (!app || !app.use) {
      requiredParameter('You must provide an Express.js app instance!');
    }
    app.use(this.config.graphQLPath, allowCrossDomain(this.parseServer.config.appId));
    app.use(this.config.graphQLPath, handleParseHeaders);
    app.use(this.config.graphQLPath, handleParseSession);
    this.applyRequestContextMiddleware(app, this.parseServer.config);
    app.use(this.config.graphQLPath, handleParseErrors);
    app.use(
      this.config.graphQLPath,
      graphqlUploadExpress({
        maxFileSize: this._transformMaxUploadSizeToBytes(
          this.parseServer.config.maxUploadSize || '20mb'
        ),
      })
    );
    app.use(this.config.graphQLPath, express.json(), async (req, res, next) => {
      const server = await this._getServer();
      return server(req, res, next);
    });
  }

  applyPlayground(app) {
    if (!app || !app.get) {
      requiredParameter('You must provide an Express.js app instance!');
    }

    app.get(
      this.config.playgroundPath ||
      requiredParameter('You must provide a config.playgroundPath to applyPlayground!'),
      (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.write(
          `<div id="sandbox" style="position:absolute;top:0;right:0;bottom:0;left:0"></div>
          <script src="https://embeddable-sandbox.cdn.apollographql.com/_latest/embeddable-sandbox.umd.production.min.js"></script>
          <script>
           new window.EmbeddedSandbox({
             target: "#sandbox",
             endpointIsEditable: false,
             initialEndpoint: ${JSON.stringify(this.config.graphQLPath)},
             handleRequest: (endpointUrl, options) => {
              return fetch(endpointUrl, {
                ...options,
                headers: {
                    ...options.headers,
                    'X-Parse-Application-Id': ${JSON.stringify(this.parseServer.config.appId)},
                    'X-Parse-Master-Key': ${JSON.stringify(this.parseServer.config.masterKey)},
                },
              })
            },
           });
           // advanced options: https://www.apollographql.com/docs/studio/explorer/sandbox#embedding-sandbox
          </script>`
        );
        res.end();
      }
    );
  }

  setGraphQLConfig(graphQLConfig: ParseGraphQLConfig): Promise {
    return this.parseGraphQLController.updateGraphQLConfig(graphQLConfig);
  }
}

export { ParseGraphQLServer };
