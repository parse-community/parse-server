import PromiseRouter  from '../PromiseRouter';
import rest           from '../rest';
const triggers        = require('../triggers');
const middleware      = require('../middlewares');

export class CloudCodeRouter extends PromiseRouter {
  mountRoutes() {
    this.route('GET', '/cloud_code/jobs', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.getJobs);
    this.route('GET', '/cloud_code/jobs/data', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.getJobsData);
    this.route('POST', '/cloud_code/jobs', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.createJob);
    this.route('PUT', '/cloud_code/jobs/:objectId', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.editJob);
    this.route('DELETE', '/cloud_code/jobs/:objectId', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.deleteJob);
  }

  static getJobs(req) {
    return rest.find(req.config, req.auth, '_JobSchedule', {}, {}).then((scheduledJobs) => {
      return {
        response: scheduledJobs.results
      }
    });
  }

  static getJobsData(req) {
    const config = req.config;
    const jobs = triggers.getJobs(config.applicationId) || {};
    return rest.find(req.config, req.auth, '_JobSchedule', {}, {}).then((scheduledJobs) => {
      return {
        response: {
          in_use: scheduledJobs.results.map((job) => job.jobName),
          jobs: Object.keys(jobs),
        }
      };
    });
  }

  static createJob(req) {
    const { job_schedule } = req.body;
    if (typeof job_schedule.startAfter === 'undefined') {
      job_schedule.startAfter = new Date().toISOString();
    }
    return rest.create(req.config, req.auth, '_JobSchedule', job_schedule, req.client);
  }

  static editJob(req) {
    const { objectId } = req.params;
    const { job_schedule } = req.body;
    if (typeof job_schedule.startAfter === 'undefined') {
      job_schedule.startAfter = new Date().toISOString();
    }
    return rest.update(req.config, req.auth, '_JobSchedule', { objectId }, job_schedule).then((response) => {
      return {
        response
      }
    });
  }

  static deleteJob(req) {
    const { objectId } = req.params;
    return rest.del(req.config, req.auth, '_JobSchedule', objectId).then((response) => {
      return {
        response
      }
    });
  }
}
