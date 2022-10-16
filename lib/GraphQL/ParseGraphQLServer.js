"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseGraphQLServer = void 0;

var _cors = _interopRequireDefault(require("cors"));

var _node = require("@graphql-yoga/node");

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
      res.write((0, _node.renderGraphiQL)({
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlci5qcyJdLCJuYW1lcyI6WyJQYXJzZUdyYXBoUUxTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInBhcnNlU2VydmVyIiwiY29uZmlnIiwiZ3JhcGhRTFBhdGgiLCJwYXJzZUdyYXBoUUxDb250cm9sbGVyIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImRlZmF1bHRMb2dnZXIiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJQYXJzZUdyYXBoUUxTY2hlbWEiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJhcHBJZCIsIl9nZXRHcmFwaFFMT3B0aW9ucyIsInNjaGVtYSIsImxvYWQiLCJjb250ZXh0IiwicmVxIiwiaW5mbyIsImF1dGgiLCJtYXNrZWRFcnJvcnMiLCJtdWx0aXBhcnQiLCJmaWxlU2l6ZSIsIl90cmFuc2Zvcm1NYXhVcGxvYWRTaXplVG9CeXRlcyIsIm1heFVwbG9hZFNpemUiLCJlIiwiZXJyb3IiLCJzdGFjayIsInRvU3RyaW5nIiwiX2dldFNlcnZlciIsInNjaGVtYVJlZiIsImdyYXBoUUxTY2hlbWEiLCJuZXdTY2hlbWFSZWYiLCJfc2VydmVyIiwib3B0aW9ucyIsInVuaXRNYXAiLCJrYiIsIm1iIiwiZ2IiLCJOdW1iZXIiLCJzbGljZSIsIk1hdGgiLCJwb3ciLCJ0b0xvd2VyQ2FzZSIsImFwcGx5R3JhcGhRTCIsImFwcCIsInVzZSIsImhhbmRsZVBhcnNlSGVhZGVycyIsImhhbmRsZVBhcnNlRXJyb3JzIiwicmVzIiwic2VydmVyIiwiYXBwbHlQbGF5Z3JvdW5kIiwiZ2V0IiwicGxheWdyb3VuZFBhdGgiLCJfcmVxIiwic2V0SGVhZGVyIiwid3JpdGUiLCJlbmRwb2ludCIsInN1YnNjcmlwdGlvbkVuZHBvaW50Iiwic3Vic2NyaXB0aW9uc1BhdGgiLCJoZWFkZXJzIiwiSlNPTiIsInN0cmluZ2lmeSIsIm1hc3RlcktleSIsImVuZCIsImNyZWF0ZVN1YnNjcmlwdGlvbnMiLCJTdWJzY3JpcHRpb25TZXJ2ZXIiLCJjcmVhdGUiLCJleGVjdXRlIiwic3Vic2NyaWJlIiwib25PcGVyYXRpb24iLCJfbWVzc2FnZSIsInBhcmFtcyIsIndlYlNvY2tldCIsIk9iamVjdCIsImFzc2lnbiIsInVwZ3JhZGVSZXEiLCJwYXRoIiwic2V0R3JhcGhRTENvbmZpZyIsImdyYXBoUUxDb25maWciLCJ1cGRhdGVHcmFwaFFMQ29uZmlnIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsa0JBQU4sQ0FBeUI7QUFHdkJDLEVBQUFBLFdBQVcsQ0FBQ0MsV0FBRCxFQUFjQyxNQUFkLEVBQXNCO0FBQy9CLFNBQUtELFdBQUwsR0FBbUJBLFdBQVcsSUFBSSxnQ0FBa0IsMENBQWxCLENBQWxDOztBQUNBLFFBQUksQ0FBQ0MsTUFBRCxJQUFXLENBQUNBLE1BQU0sQ0FBQ0MsV0FBdkIsRUFBb0M7QUFDbEMsc0NBQWtCLHdDQUFsQjtBQUNEOztBQUNELFNBQUtELE1BQUwsR0FBY0EsTUFBZDtBQUNBLFNBQUtFLHNCQUFMLEdBQThCLEtBQUtILFdBQUwsQ0FBaUJDLE1BQWpCLENBQXdCRSxzQkFBdEQ7QUFDQSxTQUFLQyxHQUFMLEdBQ0csS0FBS0osV0FBTCxDQUFpQkMsTUFBakIsSUFBMkIsS0FBS0QsV0FBTCxDQUFpQkMsTUFBakIsQ0FBd0JJLGdCQUFwRCxJQUF5RUMsZUFEM0U7QUFFQSxTQUFLQyxrQkFBTCxHQUEwQixJQUFJQyxzQ0FBSixDQUF1QjtBQUMvQ0wsTUFBQUEsc0JBQXNCLEVBQUUsS0FBS0Esc0JBRGtCO0FBRS9DTSxNQUFBQSxrQkFBa0IsRUFBRSxLQUFLVCxXQUFMLENBQWlCQyxNQUFqQixDQUF3QlEsa0JBRkc7QUFHL0NMLE1BQUFBLEdBQUcsRUFBRSxLQUFLQSxHQUhxQztBQUkvQ00sTUFBQUEscUJBQXFCLEVBQUUsS0FBS1QsTUFBTCxDQUFZUyxx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RUFBeUJDLFNBQXpCLEtBQ1hDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjLEVBQWQsRUFBa0JILE1BQWxCLEVBQTBCLE1BQU0sS0FBSzNELGtCQUFMLENBQXdCNEQsU0FBUyxDQUFDRyxVQUFsQyxDQUFoQztBQUpKLEtBREYsRUFPRTtBQUNFMUIsTUFBQUEsTUFERjtBQUVFMkIsTUFBQUEsSUFBSSxFQUNGLEtBQUszRSxNQUFMLENBQVl5RCxpQkFBWixJQUNBLGdDQUFrQixxRUFBbEI7QUFKSixLQVBGO0FBY0Q7O0FBRURtQixFQUFBQSxnQkFBZ0IsQ0FBQ0MsYUFBRCxFQUE2QztBQUMzRCxXQUFPLEtBQUszRSxzQkFBTCxDQUE0QjRFLG1CQUE1QixDQUFnREQsYUFBaEQsQ0FBUDtBQUNEOztBQTVIc0IiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgY29yc01pZGRsZXdhcmUgZnJvbSAnY29ycyc7XG5pbXBvcnQgeyBjcmVhdGVTZXJ2ZXIsIHJlbmRlckdyYXBoaVFMIH0gZnJvbSAnQGdyYXBocWwteW9nYS9ub2RlJztcbmltcG9ydCB7IGV4ZWN1dGUsIHN1YnNjcmliZSB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgU3Vic2NyaXB0aW9uU2VydmVyIH0gZnJvbSAnc3Vic2NyaXB0aW9ucy10cmFuc3BvcnQtd3MnO1xuaW1wb3J0IHsgaGFuZGxlUGFyc2VFcnJvcnMsIGhhbmRsZVBhcnNlSGVhZGVycyB9IGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuLi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgZGVmYXVsdExvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMU2NoZW1hIH0gZnJvbSAnLi9QYXJzZUdyYXBoUUxTY2hlbWEnO1xuaW1wb3J0IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsIHsgUGFyc2VHcmFwaFFMQ29uZmlnIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5cbmNsYXNzIFBhcnNlR3JhcGhRTFNlcnZlciB7XG4gIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXI7XG5cbiAgY29uc3RydWN0b3IocGFyc2VTZXJ2ZXIsIGNvbmZpZykge1xuICAgIHRoaXMucGFyc2VTZXJ2ZXIgPSBwYXJzZVNlcnZlciB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIHBhcnNlU2VydmVyIGluc3RhbmNlIScpO1xuICAgIGlmICghY29uZmlnIHx8ICFjb25maWcuZ3JhcGhRTFBhdGgpIHtcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgY29uZmlnLmdyYXBoUUxQYXRoIScpO1xuICAgIH1cbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIgPSB0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5wYXJzZUdyYXBoUUxDb250cm9sbGVyO1xuICAgIHRoaXMubG9nID1cbiAgICAgICh0aGlzLnBhcnNlU2VydmVyLmNvbmZpZyAmJiB0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyKSB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgIHRoaXMucGFyc2VHcmFwaFFMU2NoZW1hID0gbmV3IFBhcnNlR3JhcGhRTFNjaGVtYSh7XG4gICAgICBwYXJzZUdyYXBoUUxDb250cm9sbGVyOiB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIsXG4gICAgICBkYXRhYmFzZUNvbnRyb2xsZXI6IHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLmRhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIGxvZzogdGhpcy5sb2csXG4gICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6IHRoaXMuY29uZmlnLmdyYXBoUUxDdXN0b21UeXBlRGVmcyxcbiAgICAgIGFwcElkOiB0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5hcHBJZCxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIF9nZXRHcmFwaFFMT3B0aW9ucygpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc2NoZW1hOiBhd2FpdCB0aGlzLnBhcnNlR3JhcGhRTFNjaGVtYS5sb2FkKCksXG4gICAgICAgIGNvbnRleHQ6ICh7IHJlcTogeyBpbmZvLCBjb25maWcsIGF1dGggfSB9KSA9PiAoe1xuICAgICAgICAgIGluZm8sXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgIH0pLFxuICAgICAgICBtYXNrZWRFcnJvcnM6IGZhbHNlLFxuICAgICAgICBtdWx0aXBhcnQ6IHtcbiAgICAgICAgICBmaWxlU2l6ZTogdGhpcy5fdHJhbnNmb3JtTWF4VXBsb2FkU2l6ZVRvQnl0ZXMoXG4gICAgICAgICAgICB0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5tYXhVcGxvYWRTaXplIHx8ICcyMG1iJ1xuICAgICAgICAgICksXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKGUuc3RhY2sgfHwgKHR5cGVvZiBlLnRvU3RyaW5nID09PSAnZnVuY3Rpb24nICYmIGUudG9TdHJpbmcoKSkgfHwgZSk7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIF9nZXRTZXJ2ZXIoKSB7XG4gICAgY29uc3Qgc2NoZW1hUmVmID0gdGhpcy5wYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFNjaGVtYTtcbiAgICBjb25zdCBuZXdTY2hlbWFSZWYgPSBhd2FpdCB0aGlzLnBhcnNlR3JhcGhRTFNjaGVtYS5sb2FkKCk7XG4gICAgaWYgKHNjaGVtYVJlZiA9PT0gbmV3U2NoZW1hUmVmICYmIHRoaXMuX3NlcnZlcikge1xuICAgICAgcmV0dXJuIHRoaXMuX3NlcnZlcjtcbiAgICB9XG4gICAgY29uc3Qgb3B0aW9ucyA9IGF3YWl0IHRoaXMuX2dldEdyYXBoUUxPcHRpb25zKCk7XG4gICAgdGhpcy5fc2VydmVyID0gY3JlYXRlU2VydmVyKG9wdGlvbnMpO1xuICAgIHJldHVybiB0aGlzLl9zZXJ2ZXI7XG4gIH1cblxuICBfdHJhbnNmb3JtTWF4VXBsb2FkU2l6ZVRvQnl0ZXMobWF4VXBsb2FkU2l6ZSkge1xuICAgIGNvbnN0IHVuaXRNYXAgPSB7XG4gICAgICBrYjogMSxcbiAgICAgIG1iOiAyLFxuICAgICAgZ2I6IDMsXG4gICAgfTtcblxuICAgIHJldHVybiAoXG4gICAgICBOdW1iZXIobWF4VXBsb2FkU2l6ZS5zbGljZSgwLCAtMikpICpcbiAgICAgIE1hdGgucG93KDEwMjQsIHVuaXRNYXBbbWF4VXBsb2FkU2l6ZS5zbGljZSgtMikudG9Mb3dlckNhc2UoKV0pXG4gICAgKTtcbiAgfVxuXG4gIGFwcGx5R3JhcGhRTChhcHApIHtcbiAgICBpZiAoIWFwcCB8fCAhYXBwLnVzZSkge1xuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYW4gRXhwcmVzcy5qcyBhcHAgaW5zdGFuY2UhJyk7XG4gICAgfVxuXG4gICAgYXBwLnVzZSh0aGlzLmNvbmZpZy5ncmFwaFFMUGF0aCwgY29yc01pZGRsZXdhcmUoKSk7XG4gICAgYXBwLnVzZSh0aGlzLmNvbmZpZy5ncmFwaFFMUGF0aCwgaGFuZGxlUGFyc2VIZWFkZXJzKTtcbiAgICBhcHAudXNlKHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoLCBoYW5kbGVQYXJzZUVycm9ycyk7XG4gICAgYXBwLnVzZSh0aGlzLmNvbmZpZy5ncmFwaFFMUGF0aCwgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgICBjb25zdCBzZXJ2ZXIgPSBhd2FpdCB0aGlzLl9nZXRTZXJ2ZXIoKTtcbiAgICAgIHJldHVybiBzZXJ2ZXIocmVxLCByZXMpO1xuICAgIH0pO1xuICB9XG5cbiAgYXBwbHlQbGF5Z3JvdW5kKGFwcCkge1xuICAgIGlmICghYXBwIHx8ICFhcHAuZ2V0KSB7XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBFeHByZXNzLmpzIGFwcCBpbnN0YW5jZSEnKTtcbiAgICB9XG4gICAgYXBwLmdldChcbiAgICAgIHRoaXMuY29uZmlnLnBsYXlncm91bmRQYXRoIHx8XG4gICAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgY29uZmlnLnBsYXlncm91bmRQYXRoIHRvIGFwcGx5UGxheWdyb3VuZCEnKSxcbiAgICAgIChfcmVxLCByZXMpID0+IHtcbiAgICAgICAgcmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ3RleHQvaHRtbCcpO1xuICAgICAgICByZXMud3JpdGUoXG4gICAgICAgICAgcmVuZGVyR3JhcGhpUUwoe1xuICAgICAgICAgICAgZW5kcG9pbnQ6IHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoLFxuICAgICAgICAgICAgc3Vic2NyaXB0aW9uRW5kcG9pbnQ6IHRoaXMuY29uZmlnLnN1YnNjcmlwdGlvbnNQYXRoLFxuICAgICAgICAgICAgaGVhZGVyczogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAnWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCc6IHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLmFwcElkLFxuICAgICAgICAgICAgICAnWC1QYXJzZS1NYXN0ZXItS2V5JzogdGhpcy5wYXJzZVNlcnZlci5jb25maWcubWFzdGVyS2V5LFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgICAgcmVzLmVuZCgpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBjcmVhdGVTdWJzY3JpcHRpb25zKHNlcnZlcikge1xuICAgIFN1YnNjcmlwdGlvblNlcnZlci5jcmVhdGUoXG4gICAgICB7XG4gICAgICAgIGV4ZWN1dGUsXG4gICAgICAgIHN1YnNjcmliZSxcbiAgICAgICAgb25PcGVyYXRpb246IGFzeW5jIChfbWVzc2FnZSwgcGFyYW1zLCB3ZWJTb2NrZXQpID0+XG4gICAgICAgICAgT2JqZWN0LmFzc2lnbih7fSwgcGFyYW1zLCBhd2FpdCB0aGlzLl9nZXRHcmFwaFFMT3B0aW9ucyh3ZWJTb2NrZXQudXBncmFkZVJlcSkpLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgc2VydmVyLFxuICAgICAgICBwYXRoOlxuICAgICAgICAgIHRoaXMuY29uZmlnLnN1YnNjcmlwdGlvbnNQYXRoIHx8XG4gICAgICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBjb25maWcuc3Vic2NyaXB0aW9uc1BhdGggdG8gY3JlYXRlU3Vic2NyaXB0aW9ucyEnKSxcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgc2V0R3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpOiBQcm9taXNlIHtcbiAgICByZXR1cm4gdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLnVwZGF0ZUdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZyk7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VHcmFwaFFMU2VydmVyIH07XG4iXX0=