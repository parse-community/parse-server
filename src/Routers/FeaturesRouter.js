import PromiseRouter from '../PromiseRouter';
import {getFeatures} from '../features';

let masterKeyRequiredResponse = () => {
  return Promise.resolve({
    status: 401,
    response: {error: 'master key not specified'},
  })
}

export class FeaturesRouter extends PromiseRouter {
  
  mountRoutes() {
    this.route('GET','/features', (req) => {
      return this.handleGET(req);
    });
  }

  handleGET(req) {
    if (!req.auth.isMaster) {
      return masterKeyRequiredResponse();
    }
    
    return Promise.resolve({
      response: {
        results: [getFeatures()]
      }
    });
  }
}

export default FeaturesRouter;
