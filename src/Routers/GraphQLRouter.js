import Parse from 'parse/node';
import PromiseRouter from '../PromiseRouter';
import * as middleware from '../middlewares';

const GraphQLConfigPath = '/graphql-config';

export class GraphQLRouter extends PromiseRouter {
  async getGraphQLConfig(req) {
    const result = await req.config.parseGraphQLController.getGraphQLConfig();
    return {
      response: result,
    };
  }

  async updateGraphQLConfig(req) {
    if (req.auth.isReadOnly) {
      throw new Parse.Error(
        Parse.Error.OPERATION_FORBIDDEN,
        "read-only masterKey isn't allowed to update the GraphQL config."
      );
    }
    const data = await req.config.parseGraphQLController.updateGraphQLConfig(req.body.params);
    return {
      response: data,
    };
  }

  mountRoutes() {
    this.route('GET', GraphQLConfigPath, middleware.promiseEnforceMasterKeyAccess, req => {
      return this.getGraphQLConfig(req);
    });
    this.route('PUT', GraphQLConfigPath, middleware.promiseEnforceMasterKeyAccess, req => {
      return this.updateGraphQLConfig(req);
    });
  }
}

export default GraphQLRouter;
