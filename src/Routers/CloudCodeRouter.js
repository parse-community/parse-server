import PromiseRouter from '../PromiseRouter';
const triggers = require('../triggers');

export class CloudCodeRouter extends PromiseRouter {
  mountRoutes() {
    this.route('GET',`/cloud_code/jobs`, CloudCodeRouter.getJobs);
  }

  static getJobs(req) {
    let config = req.config;
    let jobs = triggers.getJobs(config.applicationId) || {};
    return Promise.resolve({
      response: Object.keys(jobs).map((jobName) => {
        return {
          jobName,
        }
      })
    });
  }
}