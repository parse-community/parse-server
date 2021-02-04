import PromiseRouter from '../PromiseRouter';
import Parse from 'parse/node';
import rest from '../rest';
const triggers = require('../triggers');
const middleware = require('../middlewares');
const fs = require('fs');
const path = require('path');

function formatJobSchedule(job_schedule) {
  if (typeof job_schedule.startAfter === 'undefined') {
    job_schedule.startAfter = new Date().toISOString();
  }
  return job_schedule;
}

function validateJobSchedule(config, job_schedule) {
  const jobs = triggers.getJobs(config.applicationId) || {};
  if (job_schedule.jobName && !jobs[job_schedule.jobName]) {
    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      'Cannot Schedule a job that is not deployed'
    );
  }
}

export class CloudCodeRouter extends PromiseRouter {
  mountRoutes() {
    this.route(
      'GET',
      '/cloud_code/jobs',
      middleware.promiseEnforceMasterKeyAccess,
      CloudCodeRouter.getJobs
    );
    this.route(
      'GET',
      '/cloud_code/jobs/data',
      middleware.promiseEnforceMasterKeyAccess,
      CloudCodeRouter.getJobsData
    );
    this.route(
      'POST',
      '/cloud_code/jobs',
      middleware.promiseEnforceMasterKeyAccess,
      CloudCodeRouter.createJob
    );
    this.route(
      'PUT',
      '/cloud_code/jobs/:objectId',
      middleware.promiseEnforceMasterKeyAccess,
      CloudCodeRouter.editJob
    );
    this.route(
      'DELETE',
      '/cloud_code/jobs/:objectId',
      middleware.promiseEnforceMasterKeyAccess,
      CloudCodeRouter.deleteJob
    );
    this.route(
      'GET',
      '/releases/latest',
      middleware.promiseEnforceMasterKeyAccess,
      CloudCodeRouter.getCloudCode
    );
    this.route(
      'GET',
      '/scripts/*',
      middleware.promiseEnforceMasterKeyAccess,
      CloudCodeRouter.getCloudFile
    );
    this.route(
      'POST',
      '/scripts/*',
      middleware.promiseEnforceMasterKeyAccess,
      CloudCodeRouter.saveCloudFile
    );
  }

  static getJobs(req) {
    return rest.find(req.config, req.auth, '_JobSchedule', {}, {}).then(scheduledJobs => {
      return {
        response: scheduledJobs.results,
      };
    });
  }

  static getJobsData(req) {
    const config = req.config;
    const jobs = triggers.getJobs(config.applicationId) || {};
    return rest.find(req.config, req.auth, '_JobSchedule', {}, {}).then(scheduledJobs => {
      return {
        response: {
          in_use: scheduledJobs.results.map(job => job.jobName),
          jobs: Object.keys(jobs),
        },
      };
    });
  }

  static createJob(req) {
    const { job_schedule } = req.body;
    validateJobSchedule(req.config, job_schedule);
    return rest.create(
      req.config,
      req.auth,
      '_JobSchedule',
      formatJobSchedule(job_schedule),
      req.client,
      req.info.context
    );
  }

  static editJob(req) {
    const { objectId } = req.params;
    const { job_schedule } = req.body;
    validateJobSchedule(req.config, job_schedule);
    return rest
      .update(
        req.config,
        req.auth,
        '_JobSchedule',
        { objectId },
        formatJobSchedule(job_schedule),
        undefined,
        req.info.context
      )
      .then(response => {
        return {
          response,
        };
      });
  }

  static deleteJob(req) {
    const { objectId } = req.params;
    return rest
      .del(req.config, req.auth, '_JobSchedule', objectId, req.info.context)
      .then(response => {
        return {
          response,
        };
      });
  }
  static saveCloudFile(req) {
    const config = req.config || {};
    const dashboardOptions = config.dashboardOptions || {};
    if (!dashboardOptions.cloudFileEdit) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Dashboard file editing is not active.');
    }
    const file = req.url.replace('/scripts', '');
    const dirName = __dirname.split('lib')[0].split('node_modules')[0];
    const filePath = path.join(dirName, file);
    const data = req.body.data;
    if (!data) {
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'No data to save.');
    }
    fs.writeFileSync(filePath, data);
    return {
      response: 'This file has been saved.',
    };
  }
  static getCloudFile(req) {
    const config = req.config || {};
    const dashboardOptions = config.dashboardOptions || {};
    if (!(dashboardOptions.cloudFileView || dashboardOptions.cloudFileEdit)) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Dashboard file viewing is not active.');
    }
    const file = req.url.replace('/scripts', '');
    const dirName = __dirname.split('lib')[0].split('node_modules')[0];
    const filePath = path.join(dirName, file);
    if (!fs.existsSync(filePath) || !fs.lstatSync(filePath).isFile()) {
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Invalid file url.');
    }
    return {
      response: fs.readFileSync(filePath, 'utf8'),
    };
  }
  static getCloudCode(req) {
    const config = req.config || {};
    const dashboardOptions = config.dashboardOptions || {};
    if (!(dashboardOptions.cloudFileView || dashboardOptions.cloudFileEdit)) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Dashboard file viewing is not active.');
    }
    const dirName = __dirname.split('node_modules')[0];
    const cloudLocation = ('' + config.cloud).replace(dirName, '');
    const cloudFiles = [];
    const getRequiredFromFile = (file, directory) => {
      try {
        const fileData = fs.readFileSync(file, 'utf8');
        const requireStatements = fileData.split('require(');
        for (let reqStatement of requireStatements) {
          reqStatement = reqStatement.split(')')[0].slice(1, -1);
          const filePath = path.join(directory, reqStatement);
          if (!fs.existsSync(filePath) || !fs.lstatSync(filePath).isFile()) {
            continue;
          }
          const requireData = fs.readFileSync(filePath, 'utf8');
          const newFilePath = filePath.replace(dirName, '');
          cloudFiles.push(newFilePath);
          if (requireData.includes('require(')) {
            getRequiredFromFile(newFilePath, path.dirname(filePath));
          }
        }
      } catch (e) {
        /* */
      }
    };
    cloudFiles.push(cloudLocation);
    getRequiredFromFile(cloudLocation, path.dirname(config.cloud));
    const response = {};
    for (const file of cloudFiles) {
      response[file] = new Date();
    }
    return {
      response: [
        {
          checksums: JSON.stringify({ cloud: response }),
          userFiles: JSON.stringify({ cloud: response }),
        },
      ],
    };
  }
}
