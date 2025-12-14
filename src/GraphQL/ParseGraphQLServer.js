import corsMiddleware from 'cors';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.js';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginCacheControlDisabled } from '@apollo/server/plugin/disabled';
import express from 'express';
import { execute, subscribe, GraphQLError, parse } from 'graphql';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { handleParseErrors, handleParseHeaders, handleParseSession } from '../middlewares';
import requiredParameter from '../requiredParameter';
import defaultLogger from '../logger';
import { ParseGraphQLSchema } from './ParseGraphQLSchema';
import ParseGraphQLController, { ParseGraphQLConfig } from '../Controllers/ParseGraphQLController';


const hasTypeIntrospection = (query) => {
  try {
    const ast = parse(query);
    // Check only root-level fields in the query
    // Note: selection.name.value is the actual field name, so this correctly handles
    // aliases like "myAlias: __type(...)" where name.value === "__type"
    for (const definition of ast.definitions) {
      if ((definition.kind === 'OperationDefinition' || definition.kind === 'FragmentDefinition') && definition.selectionSet) {
        for (const selection of definition.selectionSet.selections) {
          if (selection.kind === 'Field' && selection.name.value === '__type') {
            // GraphQL's introspection __type field requires a 'name' argument
            // This distinguishes it from potential user-defined __type fields
            if (selection.arguments && selection.arguments.length > 0) {
              return true;
            }
          }
        }
      }
    }
    return false;
  } catch {
    // If parsing fails, we assume it's not a valid query and let Apollo handle it
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
        context: async ({ req, res }) => {
          res.set('access-control-allow-origin', req.get('origin') || '*');
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
          introspection: this.config.graphQLPublicIntrospection,
          plugins: [ApolloServerPluginCacheControlDisabled(), IntrospectionControlPlugin(this.config.graphQLPublicIntrospection)],
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
    app.use(this.config.graphQLPath, corsMiddleware());
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

  createSubscriptions(server) {
    SubscriptionServer.create(
      {
        execute,
        subscribe,
        onOperation: async (_message, params, webSocket) =>
          Object.assign({}, params, await this._getGraphQLOptions(webSocket.upgradeReq)),
      },
      {
        server,
        path:
          this.config.subscriptionsPath ||
          requiredParameter('You must provide a config.subscriptionsPath to createSubscriptions!'),
      }
    );
  }

  setGraphQLConfig(graphQLConfig: ParseGraphQLConfig): Promise {
    return this.parseGraphQLController.updateGraphQLConfig(graphQLConfig);
  }
}

export { ParseGraphQLServer };
