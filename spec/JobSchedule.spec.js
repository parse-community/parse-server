const rp = require('request-promise');
const defaultHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'rest'
}
const masterKeyHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'rest',
  'X-Parse-Master-Key': 'test'
}
const defaultOptions = {
  headers: defaultHeaders,
  json: true
}
const masterKeyOptions = {
  headers: masterKeyHeaders,
  json: true
}

describe('JobSchedule', () => {
  it('should create _JobSchedule with masterKey', (done) => {
    const jobSchedule = new Parse.Object('_JobSchedule');
    jobSchedule.set({
      'jobName': 'MY Cool Job'
    });
    jobSchedule.save(null,  {useMasterKey: true}).then(() => {
      done();
    })
      .catch(done.fail);
  });

  it('should fail creating _JobSchedule without masterKey', (done) => {
    const jobSchedule = new Parse.Object('_JobSchedule');
    jobSchedule.set({
      'jobName': 'SomeJob'
    });
    jobSchedule.save(null).then(done.fail)
      .catch(done);
  });

  it('should reject access when not using masterKey (/jobs)', (done) => {
    rp.get(Parse.serverURL + '/cloud_code/jobs', defaultOptions).then(done.fail, done);
  });

  it('should reject access when not using masterKey (/jobs/data)', (done) => {
    rp.get(Parse.serverURL + '/cloud_code/jobs/data', defaultOptions).then(done.fail, done);
  });

  it('should reject access when not using masterKey (PUT /jobs/id)', (done) => {
    rp.put(Parse.serverURL + '/cloud_code/jobs/jobId', defaultOptions).then(done.fail, done);
  });

  it('should reject access when not using masterKey (PUT /jobs/id)', (done) => {
    rp.del(Parse.serverURL + '/cloud_code/jobs/jobId', defaultOptions).then(done.fail, done);
  });

  it('should allow access when using masterKey (/jobs)', (done) => {
    rp.get(Parse.serverURL + '/cloud_code/jobs', masterKeyOptions).then(done, done.fail);
  });

  it('should create a job schedule', (done) => {
    Parse.Cloud.job('job', () => {});
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        job_schedule: {
          jobName: 'job'
        }
      }
    });
    rp.post(Parse.serverURL + '/cloud_code/jobs', options).then((res) => {
      expect(res.objectId).not.toBeUndefined();
    })
      .then(() => {
        return rp.get(Parse.serverURL + '/cloud_code/jobs', masterKeyOptions);
      })
      .then((res) => {
        expect(res.length).toBe(1);
      })
      .then(done)
      .catch(done.fail);
  });

  it('should fail creating a job with an invalid name', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        job_schedule: {
          jobName: 'job'
        }
      }
    });
    rp.post(Parse.serverURL + '/cloud_code/jobs', options)
      .then(done.fail)
      .catch(done);
  });

  it('should update a job', (done) => {
    Parse.Cloud.job('job1', () => {});
    Parse.Cloud.job('job2', () => {});
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        job_schedule: {
          jobName: 'job1'
        }
      }
    });
    rp.post(Parse.serverURL + '/cloud_code/jobs', options).then((res) => {
      expect(res.objectId).not.toBeUndefined();
      return rp.put(Parse.serverURL + '/cloud_code/jobs/' + res.objectId, Object.assign(options, {
        body: {
          job_schedule: {
            jobName: 'job2'
          }
        }
      }));
    })
      .then(() => {
        return rp.get(Parse.serverURL + '/cloud_code/jobs', masterKeyOptions);
      })
      .then((res) => {
        expect(res.length).toBe(1);
        expect(res[0].jobName).toBe('job2');
      })
      .then(done)
      .catch(done.fail);
  });

  it('should fail updating a job with an invalid name', (done) => {
    Parse.Cloud.job('job1', () => {});
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        job_schedule: {
          jobName: 'job1'
        }
      }
    });
    rp.post(Parse.serverURL + '/cloud_code/jobs', options).then((res) => {
      expect(res.objectId).not.toBeUndefined();
      return rp.put(Parse.serverURL + '/cloud_code/jobs/' + res.objectId, Object.assign(options, {
        body: {
          job_schedule: {
            jobName: 'job2'
          }
        }
      }));
    })
      .then(done.fail)
      .catch(done);
  });

  it('should destroy a job', (done) => {
    Parse.Cloud.job('job', () => {});
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        job_schedule: {
          jobName: 'job'
        }
      }
    });
    rp.post(Parse.serverURL + '/cloud_code/jobs', options).then((res) => {
      expect(res.objectId).not.toBeUndefined();
      return rp.del(Parse.serverURL + '/cloud_code/jobs/' + res.objectId, masterKeyOptions);
    })
      .then(() => {
        return rp.get(Parse.serverURL + '/cloud_code/jobs', masterKeyOptions);
      })
      .then((res) => {
        expect(res.length).toBe(0);
      })
      .then(done)
      .catch(done.fail);
  });

  it('should properly return job data', (done) => {
    Parse.Cloud.job('job1', () => {});
    Parse.Cloud.job('job2', () => {});
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        job_schedule: {
          jobName: 'job1'
        }
      }
    });
    rp.post(Parse.serverURL + '/cloud_code/jobs', options).then((res) => {
      expect(res.objectId).not.toBeUndefined();
    })
      .then(() => {
        return rp.get(Parse.serverURL + '/cloud_code/jobs/data', masterKeyOptions);
      })
      .then((res) => {
        expect(res.in_use).toEqual(['job1']);
        expect(res.jobs).toContain('job1');
        expect(res.jobs).toContain('job2');
        expect(res.jobs.length).toBe(2);
      })
      .then(done)
      .catch(done.fail);
  });
});
