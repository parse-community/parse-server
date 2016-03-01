import PromiseRouter   from '../PromiseRouter';
import * as middleware from "../middlewares";
import { getFeatures } from '../features';

export class FeaturesRouter extends PromiseRouter {
  mountRoutes() {
    this.route('GET','/features', middleware.promiseEnforceMasterKeyAccess, () => {
      return { response: getFeatures() };
    });
  }
}
