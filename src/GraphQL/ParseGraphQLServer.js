import corsMiddleware from 'cors';
import bodyParser from 'body-parser';
import { graphqlUploadExpress } from 'graphql-upload';
import { getGraphQLParameters, processRequest } from 'graphql-helix';
import { envelop, useExtendContext, useMaskedErrors } from '@envelop/core';
import { renderPlaygroundPage } from '@apollographql/graphql-playground-html';
import { SubscriptionServer } from 'subscriptions-transport-ws-envelop';
import { handleParseErrors, handleParseHeaders } from '../middlewares';
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
    this.getEnveloped = envelop({
      plugins: [
        useMaskedErrors(),
        useExtendContext(context => {
          return {
            info: context.request.info,
            config: context.request.config,
            auth: context.request.auth,
          };
        }),
        ...(this.config.envelopPlugins || []),
      ],
    });
  }

  async _getGraphQLOptions() {
    try {
      return {
        schema: await this.parseGraphQLSchema.load(),
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

  async _handleGraphQLRequest(req, res) {
    const request = {
      body: req.body,
      headers: req.headers,
      method: req.method,
      query: req.query,
      info: req.info,
      config: req.config,
      auth: req.auth,
    };

    const { execute, subscribe, validate, parse, contextFactory } = this.getEnveloped();

    // Extract the GraphQL parameters from the request
    const { operationName, query, variables } = getGraphQLParameters(request);
    const { schema } = await this._getGraphQLOptions();

    // Validate and execute the query
    const result = await processRequest({
      execute,
      subscribe,
      validate,
      parse,
      operationName,
      query,
      variables,
      request,
      schema,
      contextFactory,
    });

    if (result.type === 'RESPONSE') {
      // We set the provided status and headers and just the send the payload back to the client
      result.headers.forEach(({ name, value }) => res.setHeader(name, value));
      res.status(result.status);
      res.json(result.payload);
    } else if (result.type === 'MULTIPART_RESPONSE') {
      // Defer/Stream over multipart request
      res.writeHead(200, {
        Connection: 'keep-alive',
        'Content-Type': 'multipart/mixed; boundary="-"',
        'Transfer-Encoding': 'chunked',
      });
      req.on('close', () => {
        result.unsubscribe();
      });

      res.write('---');
      await result.subscribe(result => {
        const chunk = Buffer.from(JSON.stringify(result), 'utf8');
        const data = [
          '',
          'Content-Type: application/json; charset=utf-8',
          'Content-Length: ' + String(chunk.length),
          '',
          chunk,
        ];

        if (result.hasNext) {
          data.push('---');
        }

        res.write(data.join('\r\n'));
      });

      res.write('\r\n-----\r\n');
      res.end();
    } else {
      // Subscription over SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      });
      req.on('close', () => {
        result.unsubscribe();
      });
      await result.subscribe(result => {
        res.write(`data: ${JSON.stringify(result)}\n\n`);
      });
    }
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
    app.use(this.config.graphQLPath, this._handleGraphQLRequest.bind(this));
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
    const { validate, parse, execute, subscribe, contextFactory } = this.getEnveloped();

    SubscriptionServer.create(
      {
        validate,
        parse,
        execute,
        subscribe,
        onOperation: async (_message, params, webSocket) => {
          const { schema } = await this._getGraphQLOptions();
          const request = {
            info: webSocket.upgradeReq.info,
            config: webSocket.upgradeReq.config,
            auth: webSocket.upgradeReq.auth,
          };
          return Object.assign({}, params, { schema, context: await contextFactory({ request }) });
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
