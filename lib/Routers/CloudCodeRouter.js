'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CloudCodeRouter = undefined;

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const triggers = require('../triggers');
const middleware = require('../middlewares');

function formatJobSchedule(job_schedule) {
  if (typeof job_schedule.startAfter === 'undefined') {
    job_schedule.startAfter = new Date().toISOString();
  }
  return job_schedule;
}

function validateJobSchedule(config, job_schedule) {
  const jobs = triggers.getJobs(config.applicationId) || {};
  if (job_schedule.jobName && !jobs[job_schedule.jobName]) {
    throw new _node2.default.Error(_node2.default.Error.INTERNAL_SERVER_ERROR, 'Cannot Schedule a job that is not deployed');
  }
}

class CloudCodeRouter extends _PromiseRouter2.default {
  mountRoutes() {
    this.route('GET', '/cloud_code/jobs', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.getJobs);
    this.route('GET', '/cloud_code/jobs/data', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.getJobsData);
    this.route('POST', '/cloud_code/jobs', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.createJob);
    this.route('PUT', '/cloud_code/jobs/:objectId', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.editJob);
    this.route('DELETE', '/cloud_code/jobs/:objectId', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.deleteJob);
  }

  static getJobs(req) {
    return _rest2.default.find(req.config, req.auth, '_JobSchedule', {}, {}).then(scheduledJobs => {
      return {
        response: scheduledJobs.results
      };
    });
  }

  static getJobsData(req) {
    const config = req.config;
    const jobs = triggers.getJobs(config.applicationId) || {};
    return _rest2.default.find(req.config, req.auth, '_JobSchedule', {}, {}).then(scheduledJobs => {
      return {
        response: {
          in_use: scheduledJobs.results.map(job => job.jobName),
          jobs: Object.keys(jobs)
        }
      };
    });
  }

  static createJob(req) {
    const { job_schedule } = req.body;
    validateJobSchedule(req.config, job_schedule);
    return _rest2.default.create(req.config, req.auth, '_JobSchedule', formatJobSchedule(job_schedule), req.client);
  }

  static editJob(req) {
    const { objectId } = req.params;
    const { job_schedule } = req.body;
    validateJobSchedule(req.config, job_schedule);
    return _rest2.default.update(req.config, req.auth, '_JobSchedule', { objectId }, formatJobSchedule(job_schedule)).then(response => {
      return {
        response
      };
    });
  }

  static deleteJob(req) {
    const { objectId } = req.params;
    return _rest2.default.del(req.config, req.auth, '_JobSchedule', objectId).then(response => {
      return {
        response
      };
    });
  }
}
exports.CloudCodeRouter = CloudCodeRouter;