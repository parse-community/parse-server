import { version }     from '../../package.json';
import PromiseRouter   from '../PromiseRouter';
import * as middleware from "../middlewares";
import { getFeatures } from '../features';

export class FeaturesRouter extends PromiseRouter {
  mountRoutes() {
    this.route('GET','/serverInfo', middleware.promiseEnforceMasterKeyAccess, () => {
      return { response: {
				features: getFeatures(),
				parseServerVersion: version,
			} };
    });
  }
}
