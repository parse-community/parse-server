"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseGraphQLServer = void 0;

var _cors = _interopRequireDefault(require("cors"));

var _node = require("@graphql-yoga/node");

var _renderGraphiql = require("@graphql-yoga/render-graphiql");

var _graphql = require("graphql");

var _subscriptionsTransportWs = require("subscriptions-transport-ws");

var _middlewares = require("../middlewares");

var _requiredParameter = _interopRequireDefault(require("../requiredParameter"));

var _logger = _interopRequireDefault(require("../logger"));

var _ParseGraphQLSchema = require("./ParseGraphQLSchema");

var _ParseGraphQLController = _interopRequireWildcard(require("../Controllers/ParseGraphQLController"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ParseGraphQLServer {
  constructor(parseServer, config) {
    this.parseServer = parseServer || (0, _requiredParameter.default)('You must provide a parseServer instance!');

    if (!config || !config.graphQLPath) {
      (0, _requiredParameter.default)('You must provide a config.graphQLPath!');
    }

    this.config = config;
    this.parseGraphQLController = this.parseServer.config.parseGraphQLController;
    this.log = this.parseServer.config && this.parseServer.config.loggerController || _logger.default;
    this.parseGraphQLSchema = new _ParseGraphQLSchema.ParseGraphQLSchema({
      parseGraphQLController: this.parseGraphQLController,
      databaseController: this.parseServer.config.databaseController,
      log: this.log,
      graphQLCustomTypeDefs: this.config.graphQLCustomTypeDefs,
      appId: this.parseServer.config.appId
    });
  }

  async _getGraphQLOptions() {
    try {
      return {
        schema: await this.parseGraphQLSchema.load(),
        context: ({
          req: {
            info,
            config,
            auth
          }
        }) => ({
          info,
          config,
          auth
        }),
        maskedErrors: false,
        multipart: {
          fileSize: this._transformMaxUploadSizeToBytes(this.parseServer.config.maxUploadSize || '20mb')
        }
      };
    } catch (e) {
      this.log.error(e.stack || typeof e.toString === 'function' && e.toString() || e);
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
    this._server = (0, _node.createServer)(options);
    return this._server;
  }

  _transformMaxUploadSizeToBytes(maxUploadSize) {
    const unitMap = {
      kb: 1,
      mb: 2,
      gb: 3
    };
    return Number(maxUploadSize.slice(0, -2)) * Math.pow(1024, unitMap[maxUploadSize.slice(-2).toLowerCase()]);
  }

  applyGraphQL(app) {
    if (!app || !app.use) {
      (0, _requiredParameter.default)('You must provide an Express.js app instance!');
    }

    app.use(this.config.graphQLPath, (0, _cors.default)());
    app.use(this.config.graphQLPath, _middlewares.handleParseHeaders);
    app.use(this.config.graphQLPath, _middlewares.handleParseErrors);
    app.use(this.config.graphQLPath, async (req, res) => {
      const server = await this._getServer();
      return server(req, res);
    });
  }

  applyPlayground(app) {
    if (!app || !app.get) {
      (0, _requiredParameter.default)('You must provide an Express.js app instance!');
    }

    app.get(this.config.playgroundPath || (0, _requiredParameter.default)('You must provide a config.playgroundPath to applyPlayground!'), (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.write((0, _renderGraphiql.renderGraphiQL)({
        endpoint: this.config.graphQLPath,
        subscriptionEndpoint: this.config.subscriptionsPath,
        headers: JSON.stringify({
          'X-Parse-Application-Id': this.parseServer.config.appId,
          'X-Parse-Master-Key': this.parseServer.config.masterKey
        })
      }));
      res.end();
    });
  }

  createSubscriptions(server) {
    _subscriptionsTransportWs.SubscriptionServer.create({
      execute: _graphql.execute,
      subscribe: _graphql.subscribe,
      onOperation: async (_message, params, webSocket) => Object.assign({}, params, await this._getGraphQLOptions(webSocket.upgradeReq))
    }, {
      server,
      path: this.config.subscriptionsPath || (0, _requiredParameter.default)('You must provide a config.subscriptionsPath to createSubscriptions!')
    });
  }

  setGraphQLConfig(graphQLConfig) {
    return this.parseGraphQLController.updateGraphQLConfig(graphQLConfig);
  }

}

exports.ParseGraphQLServer = ParseGraphQLServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlci5qcyJdLCJuYW1lcyI6WyJQYXJzZUdyYXBoUUxTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInBhcnNlU2VydmVyIiwiY29uZmlnIiwiZ3JhcGhRTFBhdGgiLCJwYXJzZUdyYXBoUUxDb250cm9sbGVyIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImRlZmF1bHRMb2dnZXIiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJQYXJzZUdyYXBoUUxTY2hlbWEiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJhcHBJZCIsIl9nZXRHcmFwaFFMT3B0aW9ucyIsInNjaGVtYSIsImxvYWQiLCJjb250ZXh0IiwicmVxIiwiaW5mbyIsImF1dGgiLCJtYXNrZWRFcnJvcnMiLCJtdWx0aXBhcnQiLCJmaWxlU2l6ZSIsIl90cmFuc2Zvcm1NYXhVcGxvYWRTaXplVG9CeXRlcyIsIm1heFVwbG9hZFNpemUiLCJlIiwiZXJyb3IiLCJzdGFjayIsInRvU3RyaW5nIiwiX2dldFNlcnZlciIsInNjaGVtYVJlZiIsImdyYXBoUUxTY2hlbWEiLCJuZXdTY2hlbWFSZWYiLCJfc2VydmVyIiwib3B0aW9ucyIsInVuaXRNYXAiLCJrYiIsIm1iIiwiZ2IiLCJOdW1iZXIiLCJzbGljZSIsIk1hdGgiLCJwb3ciLCJ0b0xvd2VyQ2FzZSIsImFwcGx5R3JhcGhRTCIsImFwcCIsInVzZSIsImhhbmRsZVBhcnNlSGVhZGVycyIsImhhbmRsZVBhcnNlRXJyb3JzIiwicmVzIiwic2VydmVyIiwiYXBwbHlQbGF5Z3JvdW5kIiwiZ2V0IiwicGxheWdyb3VuZFBhdGgiLCJfcmVxIiwic2V0SGVhZGVyIiwid3JpdGUiLCJlbmRwb2ludCIsInN1YnNjcmlwdGlvbkVuZHBvaW50Iiwic3Vic2NyaXB0aW9uc1BhdGgiLCJoZWFkZXJzIiwiSlNPTiIsInN0cmluZ2lmeSIsIm1hc3RlcktleSIsImVuZCIsImNyZWF0ZVN1YnNjcmlwdGlvbnMiLCJTdWJzY3JpcHRpb25TZXJ2ZXIiLCJjcmVhdGUiLCJleGVjdXRlIiwic3Vic2NyaWJlIiwib25PcGVyYXRpb24iLCJfbWVzc2FnZSIsInBhcmFtcyIsIndlYlNvY2tldCIsIk9iamVjdCIsImFzc2lnbiIsInVwZ3JhZGVSZXEiLCJwYXRoIiwic2V0R3JhcGhRTENvbmZpZyIsImdyYXBoUUxDb25maWciLCJ1cGRhdGVHcmFwaFFMQ29uZmlnIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsa0JBQU4sQ0FBeUI7QUFHdkJDLEVBQUFBLFdBQVcsQ0FBQ0MsV0FBRCxFQUFjQyxNQUFkLEVBQXNCO0FBQy9CLFNBQUtELFdBQUwsR0FBbUJBLFdBQVcsSUFBSSxnQ0FBa0IsMENBQWxCLENBQWxDOztBQUNBLFFBQUksQ0FBQ0MsTUFBRCxJQUFXLENBQUNBLE1BQU0sQ0FBQ0MsV0FBdkIsRUFBb0M7QUFDbEMsc0NBQWtCLHdDQUFsQjtBQUNEOztBQUNELFNBQUtELE1BQUwsR0FBY0EsTUFBZDtBQUNBLFNBQUtFLHNCQUFMLEdBQThCLEtBQUtILFdBQUwsQ0FBaUJDLE1BQWpCLENBQXdCRSxzQkFBdEQ7QUFDQSxTQUFLQyxHQUFMLEdBQ0csS0FBS0osV0FBTCxDQUFpQkMsTUFBakIsSUFBMkIsS0FBS0QsV0FBTCxDQUFpQkMsTUFBakIsQ0FBd0JJLGdCQUFwRCxJQUF5RUMsZUFEM0U7QUFFQSxTQUFLQyxrQkFBTCxHQUEwQixJQUFJQyxzQ0FBSixDQUF1QjtBQUMvQ0wsTUFBQUEsc0JBQXNCLEVBQUUsS0FBS0Esc0JBRGtCO0FBRS9DTSxNQUFBQSxrQkFBa0IsRUFBRSxLQUFLVCxXQUFMLENBQWlCQyxNQUFqQixDQUF3QlEsa0JBRkc7QUFHL0NMLE1BQUFBLEdBQUcsRUFBRSxLQUFLQSxHQUhxQztBQUkvQ00sTUFBQUEscUJBQXFCLEVBQUUsS0FBS1QsTUFBTCxD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TUFBakIsRUFBeUJDLFNBQXpCLEtBQ1hDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjLEVBQWQsRUFBa0JILE1BQWxCLEVBQTBCLE1BQU0sS0FBSzNELGtCQUFMLENBQXdCNEQsU0FBUyxDQUFDRyxVQUFsQyxDQUFoQztBQUpKLEtBREYsRUFPRTtBQUNFMUIsTUFBQUEsTUFERjtBQUVFMkIsTUFBQUEsSUFBSSxFQUNGLEtBQUszRSxNQUFMLENBQVl5RCxpQkFBWixJQUNBLGdDQUFrQixxRUFBbEI7QUFKSixLQVBGO0FBY0Q7O0FBRURtQixFQUFBQSxnQkFBZ0IsQ0FBQ0MsYUFBRCxFQUE2QztBQUMzRCxXQUFPLEtBQUszRSxzQkFBTCxDQUE0QjRFLG1CQUE1QixDQUFnREQsYUFBaEQsQ0FBUDtBQUNEOztBQTVIc0IiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgY29yc01pZGRsZXdhcmUgZnJvbSAnY29ycyc7XG5pbXBvcnQgeyBjcmVhdGVTZXJ2ZXIgfSBmcm9tICdAZ3JhcGhxbC15b2dhL25vZGUnO1xuaW1wb3J0IHsgcmVuZGVyR3JhcGhpUUwgfSBmcm9tICdAZ3JhcGhxbC15b2dhL3JlbmRlci1ncmFwaGlxbCc7XG5pbXBvcnQgeyBleGVjdXRlLCBzdWJzY3JpYmUgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IFN1YnNjcmlwdGlvblNlcnZlciB9IGZyb20gJ3N1YnNjcmlwdGlvbnMtdHJhbnNwb3J0LXdzJztcbmltcG9ydCB7IGhhbmRsZVBhcnNlRXJyb3JzLCBoYW5kbGVQYXJzZUhlYWRlcnMgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0IGRlZmF1bHRMb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNjaGVtYSB9IGZyb20gJy4vUGFyc2VHcmFwaFFMU2NoZW1hJztcbmltcG9ydCBQYXJzZUdyYXBoUUxDb250cm9sbGVyLCB7IFBhcnNlR3JhcGhRTENvbmZpZyB9IGZyb20gJy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuXG5jbGFzcyBQYXJzZUdyYXBoUUxTZXJ2ZXIge1xuICBwYXJzZUdyYXBoUUxDb250cm9sbGVyOiBQYXJzZUdyYXBoUUxDb250cm9sbGVyO1xuXG4gIGNvbnN0cnVjdG9yKHBhcnNlU2VydmVyLCBjb25maWcpIHtcbiAgICB0aGlzLnBhcnNlU2VydmVyID0gcGFyc2VTZXJ2ZXIgfHwgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBwYXJzZVNlcnZlciBpbnN0YW5jZSEnKTtcbiAgICBpZiAoIWNvbmZpZyB8fCAhY29uZmlnLmdyYXBoUUxQYXRoKSB7XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGNvbmZpZy5ncmFwaFFMUGF0aCEnKTtcbiAgICB9XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyID0gdGhpcy5wYXJzZVNlcnZlci5jb25maWcucGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcbiAgICB0aGlzLmxvZyA9XG4gICAgICAodGhpcy5wYXJzZVNlcnZlci5jb25maWcgJiYgdGhpcy5wYXJzZVNlcnZlci5jb25maWcubG9nZ2VyQ29udHJvbGxlcikgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICB0aGlzLnBhcnNlR3JhcGhRTFNjaGVtYSA9IG5ldyBQYXJzZUdyYXBoUUxTY2hlbWEoe1xuICAgICAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLFxuICAgICAgZGF0YWJhc2VDb250cm9sbGVyOiB0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5kYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgICBsb2c6IHRoaXMubG9nLFxuICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzOiB0aGlzLmNvbmZpZy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICBhcHBJZDogdGhpcy5wYXJzZVNlcnZlci5jb25maWcuYXBwSWQsXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBfZ2V0R3JhcGhRTE9wdGlvbnMoKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHNjaGVtYTogYXdhaXQgdGhpcy5wYXJzZUdyYXBoUUxTY2hlbWEubG9hZCgpLFxuICAgICAgICBjb250ZXh0OiAoeyByZXE6IHsgaW5mbywgY29uZmlnLCBhdXRoIH0gfSkgPT4gKHtcbiAgICAgICAgICBpbmZvLFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICB9KSxcbiAgICAgICAgbWFza2VkRXJyb3JzOiBmYWxzZSxcbiAgICAgICAgbXVsdGlwYXJ0OiB7XG4gICAgICAgICAgZmlsZVNpemU6IHRoaXMuX3RyYW5zZm9ybU1heFVwbG9hZFNpemVUb0J5dGVzKFxuICAgICAgICAgICAgdGhpcy5wYXJzZVNlcnZlci5jb25maWcubWF4VXBsb2FkU2l6ZSB8fCAnMjBtYidcbiAgICAgICAgICApLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICB0aGlzLmxvZy5lcnJvcihlLnN0YWNrIHx8ICh0eXBlb2YgZS50b1N0cmluZyA9PT0gJ2Z1bmN0aW9uJyAmJiBlLnRvU3RyaW5nKCkpIHx8IGUpO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBfZ2V0U2VydmVyKCkge1xuICAgIGNvbnN0IHNjaGVtYVJlZiA9IHRoaXMucGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxTY2hlbWE7XG4gICAgY29uc3QgbmV3U2NoZW1hUmVmID0gYXdhaXQgdGhpcy5wYXJzZUdyYXBoUUxTY2hlbWEubG9hZCgpO1xuICAgIGlmIChzY2hlbWFSZWYgPT09IG5ld1NjaGVtYVJlZiAmJiB0aGlzLl9zZXJ2ZXIpIHtcbiAgICAgIHJldHVybiB0aGlzLl9zZXJ2ZXI7XG4gICAgfVxuICAgIGNvbnN0IG9wdGlvbnMgPSBhd2FpdCB0aGlzLl9nZXRHcmFwaFFMT3B0aW9ucygpO1xuICAgIHRoaXMuX3NlcnZlciA9IGNyZWF0ZVNlcnZlcihvcHRpb25zKTtcbiAgICByZXR1cm4gdGhpcy5fc2VydmVyO1xuICB9XG5cbiAgX3RyYW5zZm9ybU1heFVwbG9hZFNpemVUb0J5dGVzKG1heFVwbG9hZFNpemUpIHtcbiAgICBjb25zdCB1bml0TWFwID0ge1xuICAgICAga2I6IDEsXG4gICAgICBtYjogMixcbiAgICAgIGdiOiAzLFxuICAgIH07XG5cbiAgICByZXR1cm4gKFxuICAgICAgTnVtYmVyKG1heFVwbG9hZFNpemUuc2xpY2UoMCwgLTIpKSAqXG4gICAgICBNYXRoLnBvdygxMDI0LCB1bml0TWFwW21heFVwbG9hZFNpemUuc2xpY2UoLTIpLnRvTG93ZXJDYXNlKCldKVxuICAgICk7XG4gIH1cblxuICBhcHBseUdyYXBoUUwoYXBwKSB7XG4gICAgaWYgKCFhcHAgfHwgIWFwcC51c2UpIHtcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGFuIEV4cHJlc3MuanMgYXBwIGluc3RhbmNlIScpO1xuICAgIH1cblxuICAgIGFwcC51c2UodGhpcy5jb25maWcuZ3JhcGhRTFBhdGgsIGNvcnNNaWRkbGV3YXJlKCkpO1xuICAgIGFwcC51c2UodGhpcy5jb25maWcuZ3JhcGhRTFBhdGgsIGhhbmRsZVBhcnNlSGVhZGVycyk7XG4gICAgYXBwLnVzZSh0aGlzLmNvbmZpZy5ncmFwaFFMUGF0aCwgaGFuZGxlUGFyc2VFcnJvcnMpO1xuICAgIGFwcC51c2UodGhpcy5jb25maWcuZ3JhcGhRTFBhdGgsIGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgICAgY29uc3Qgc2VydmVyID0gYXdhaXQgdGhpcy5fZ2V0U2VydmVyKCk7XG4gICAgICByZXR1cm4gc2VydmVyKHJlcSwgcmVzKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFwcGx5UGxheWdyb3VuZChhcHApIHtcbiAgICBpZiAoIWFwcCB8fCAhYXBwLmdldCkge1xuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYW4gRXhwcmVzcy5qcyBhcHAgaW5zdGFuY2UhJyk7XG4gICAgfVxuICAgIGFwcC5nZXQoXG4gICAgICB0aGlzLmNvbmZpZy5wbGF5Z3JvdW5kUGF0aCB8fFxuICAgICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGNvbmZpZy5wbGF5Z3JvdW5kUGF0aCB0byBhcHBseVBsYXlncm91bmQhJyksXG4gICAgICAoX3JlcSwgcmVzKSA9PiB7XG4gICAgICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICd0ZXh0L2h0bWwnKTtcbiAgICAgICAgcmVzLndyaXRlKFxuICAgICAgICAgIHJlbmRlckdyYXBoaVFMKHtcbiAgICAgICAgICAgIGVuZHBvaW50OiB0aGlzLmNvbmZpZy5ncmFwaFFMUGF0aCxcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbkVuZHBvaW50OiB0aGlzLmNvbmZpZy5zdWJzY3JpcHRpb25zUGF0aCxcbiAgICAgICAgICAgIGhlYWRlcnM6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgJ1gtUGFyc2UtQXBwbGljYXRpb24tSWQnOiB0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5hcHBJZCxcbiAgICAgICAgICAgICAgJ1gtUGFyc2UtTWFzdGVyLUtleSc6IHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLm1hc3RlcktleSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICAgIHJlcy5lbmQoKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgY3JlYXRlU3Vic2NyaXB0aW9ucyhzZXJ2ZXIpIHtcbiAgICBTdWJzY3JpcHRpb25TZXJ2ZXIuY3JlYXRlKFxuICAgICAge1xuICAgICAgICBleGVjdXRlLFxuICAgICAgICBzdWJzY3JpYmUsXG4gICAgICAgIG9uT3BlcmF0aW9uOiBhc3luYyAoX21lc3NhZ2UsIHBhcmFtcywgd2ViU29ja2V0KSA9PlxuICAgICAgICAgIE9iamVjdC5hc3NpZ24oe30sIHBhcmFtcywgYXdhaXQgdGhpcy5fZ2V0R3JhcGhRTE9wdGlvbnMod2ViU29ja2V0LnVwZ3JhZGVSZXEpKSxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHNlcnZlcixcbiAgICAgICAgcGF0aDpcbiAgICAgICAgICB0aGlzLmNvbmZpZy5zdWJzY3JpcHRpb25zUGF0aCB8fFxuICAgICAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgY29uZmlnLnN1YnNjcmlwdGlvbnNQYXRoIHRvIGNyZWF0ZVN1YnNjcmlwdGlvbnMhJyksXG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHNldEdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKTogUHJvbWlzZSB7XG4gICAgcmV0dXJuIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlci51cGRhdGVHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWcpO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9O1xuIl19