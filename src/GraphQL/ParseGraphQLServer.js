import corsMiddleware from 'cors';
import bodyParser from 'body-parser';
import { graphqlUploadExpress } from 'graphql-upload';
import { graphqlExpress } from 'apollo-server-express/dist/expressApollo';
import { renderPlaygroundPage } from '@apollographql/graphql-playground-html';
import { execute, subscribe } from 'graphql';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { handleParseErrors, handleParseHeaders } from '../middlewares';
import requiredParameter from '../requiredParameter';
import defaultLogger from '../logger';
import { ParseLiveQueryServer } from '../LiveQuery/ParseLiveQueryServer';
import { ParseGraphQLSchema } from './ParseGraphQLSchema';
import ParseGraphQLController, { ParseGraphQLConfig } from '../Controllers/ParseGraphQLController';
import { WSSAdapter } from '../Adapters/WebSocketServer/WSSAdapter';

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
      liveQueryClassNames:
        this.parseServer.config.liveQuery && this.parseServer.config.liveQuery.classNames,
    });
  }

  async _getGraphQLOptions(req) {
    try {
      return {
        schema: await this.parseGraphQLSchema.load(),
        context: {
          info: req.info,
          config: req.config,
          auth: req.auth,
        },
        formatError: error => {
          // Allow to console.log here to debug
          return error;
        },
      };
    } catch (e) {
      this.log.error(e.stack || (typeof e.toString === 'function' && e.toString()) || e);
      throw e;
    }
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

    app.use(
      this.config.graphQLPath,
      graphqlUploadExpress({
        maxFileSize: this._transformMaxUploadSizeToBytes(
          this.parseServer.config.maxUploadSize || '20mb'
        ),
      })
    );
    app.use(this.config.graphQLPath, corsMiddleware());
    app.use(this.config.graphQLPath, bodyParser.json());
    app.use(this.config.graphQLPath, handleParseHeaders);
    app.use(this.config.graphQLPath, handleParseErrors);
    app.use(
      this.config.graphQLPath,
      graphqlExpress(async req => await this._getGraphQLOptions(req))
    );
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
          renderPlaygroundPage({
            endpoint: this.config.graphQLPath,
            version: '1.7.25',
            subscriptionEndpoint: this.config.subscriptionsPath,
            headers: {
              'X-Parse-Application-Id': this.parseServer.config.appId,
              'X-Parse-Master-Key': this.parseServer.config.masterKey,
            },
          })
        );
        res.end();
      }
    );
  }

  createSubscriptions(server) {
    const wssAdapter = new WSSAdapter();

    new ParseLiveQueryServer(
      undefined,
      {
        ...this.parseServer.config.liveQueryServerOptions,
        wssAdapter,
      },
      this.parseServer.config
    );

    SubscriptionServer.create(
      {
        execute,
        subscribe,
        onConnect: async connectionParams => {
          const keyPairs = {
            applicationId: connectionParams['X-Parse-Application-Id'],
            sessionToken: connectionParams['X-Parse-Session-Token'],
            masterKey: connectionParams['X-Parse-Master-Key'],
            installationId: connectionParams['X-Parse-Installation-Id'],
            clientKey: connectionParams['X-Parse-Client-Key'],
            javascriptKey: connectionParams['X-Parse-Javascript-Key'],
            windowsKey: connectionParams['X-Parse-Windows-Key'],
            restAPIKey: connectionParams['X-Parse-REST-API-Key'],
          };

          const listeners = [];

          let connectResolve, connectReject;
          let connectIsResolved = false;
          const connectPromise = new Promise((resolve, reject) => {
            connectResolve = resolve;
            connectReject = reject;
          });

          const liveQuery = {
            OPEN: 'OPEN',
            readyState: 'OPEN',
            on: () => {},
            ping: () => {},
            onmessage: () => {},
            onclose: () => {},
            send: message => {
              message = JSON.parse(message);
              if (message.op === 'connected') {
                connectResolve();
                connectIsResolved = true;
                return;
              } else if (message.op === 'error' && !connectIsResolved) {
                connectReject({
                  code: message.code,
                  message: message.error,
                });
                return;
              }
              const requestId = message && message.requestId;
              if (
                requestId &&
                typeof requestId === 'number' &&
                requestId > 0 &&
                requestId <= listeners.length
              ) {
                const listener = listeners[requestId - 1];
                if (listener) {
                  listener(message);
                }
              }
            },
            subscribe: async (query, sessionToken, listener) => {
              await connectPromise;
              listeners.push(listener);
              liveQuery.onmessage(
                JSON.stringify({
                  op: 'subscribe',
                  requestId: listeners.length,
                  query,
                  sessionToken,
                })
              );
            },
            unsubscribe: async listener => {
              await connectPromise;
              const index = listeners.indexOf(listener);
              if (index > 0) {
                liveQuery.onmessage(
                  JSON.stringify({
                    op: 'unsubscribe',
                    requestId: index + 1,
                  })
                );
                listeners[index] = null;
              }
            },
          };

          wssAdapter.onConnection(liveQuery);

          liveQuery.onmessage(
            JSON.stringify({
              op: 'connect',
              ...keyPairs,
            })
          );

          await connectPromise;

          return { liveQuery, keyPairs };
        },
        onDisconnect: (_webSocket, context) => {
          const { liveQuery } = context;

          if (liveQuery) {
            liveQuery.onclose();
          }
        },
        onOperation: async (_message, params) => {
          return {
            ...params,
            schema: await this.parseGraphQLSchema.load(),
            formatError: error => {
              // Allow to console.log here to debug
              return error;
            },
          };
        },
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
