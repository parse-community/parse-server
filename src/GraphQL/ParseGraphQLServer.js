import corsMiddleware from 'cors';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.js';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginCacheControlDisabled } from '@apollo/server/plugin/disabled';
import express from 'express';
import { execute, subscribe } from 'graphql';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { handleParseErrors, handleParseHeaders, handleParseSession } from '../middlewares';
import requiredParameter from '../requiredParameter';
import defaultLogger from '../logger';
import { ParseGraphQLSchema } from './ParseGraphQLSchema';
import ParseGraphQLController, { ParseGraphQLConfig } from '../Controllers/ParseGraphQLController';

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
    const { schema, context } = await this._getGraphQLOptions();
    const apollo = new ApolloServer({
      csrfPrevention: {
        // See https://www.apollographql.com/docs/router/configuration/csrf/
        // needed since we use graphql upload
        requestHeaders: ['X-Parse-Application-Id'],
      },
      introspection: true,
      plugins: [ApolloServerPluginCacheControlDisabled()],
      schema,
    });
    await apollo.start();
    this._server = expressMiddleware(apollo, {
      context,
    });
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

  applyGraphQL(app) {
    if (!app || !app.use) {
      requiredParameter('You must provide an Express.js app instance!');
    }
    app.use(this.config.graphQLPath, corsMiddleware());
    app.use(this.config.graphQLPath, handleParseHeaders);
    app.use(this.config.graphQLPath, handleParseSession);
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
             initialEndpoint: "${JSON.stringify(this.config.graphQLPath)}",
             handleRequest: (endpointUrl, options) => {
              return fetch(endpointUrl, {
                ...options,
                headers: {
                    ...options.headers,
                    'X-Parse-Application-Id': "${JSON.stringify(this.parseServer.config.appId)}",
                    'X-Parse-Master-Key': "${JSON.stringify(this.parseServer.config.masterKey)}",
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
