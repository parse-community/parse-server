import corsMiddleware from 'cors';
import { createServer, renderGraphiQL } from '@graphql-yoga/node';
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
        context: ({ req: { info, config, auth } }) => ({
          info,
          config,
          auth,
        }),
        maskedErrors: false,
        multipart: {
          fileSize: this._transformMaxUploadSizeToBytes(
            this.parseServer.config.maxUploadSize || '20mb'
          ),
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
    const options = await this._getGraphQLOptions();
    this._server = createServer(options);
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
    app.use(this.config.graphQLPath, async (req, res) => {
      const server = await this._getServer();
      return server(req, res);
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
          renderGraphiQL({
            endpoint: this.config.graphQLPath,
            subscriptionEndpoint: this.config.subscriptionsPath,
            headers: JSON.stringify({
              'X-Parse-Application-Id': this.parseServer.config.appId,
              'X-Parse-Master-Key': this.parseServer.config.masterKey,
            }),
          })
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
