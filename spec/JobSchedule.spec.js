const request = require('../lib/request');

const defaultHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'rest',
  'Content-Type': 'application/json',
};
const masterKeyHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'rest',
  'X-Parse-Master-Key': 'test',
  'Content-Type': 'application/json',
};
const defaultOptions = {
  headers: defaultHeaders,
  json: true,
};
const masterKeyOptions = {
  headers: masterKeyHeaders,
  json: true,
};

describe('JobSchedule', () => {
  it('should create _JobSchedule with masterKey', done => {
    const jobSchedule = new Parse.Object('_JobSchedule');
    jobSchedule.set({
      jobName: 'MY Cool Job',
    });
    jobSchedule
      .save(null, { useMasterKey: true })
      .then(() => {
        done();
      })
      .catch(done.fail);
  });

  it('should fail creating _JobSchedule without masterKey', done => {
    const jobSchedule = new Parse.Object('_JobSchedule');
    jobSchedule.set({
      jobName: 'SomeJob',
    });
    jobSchedule
      .save(null)
      .then(done.fail)
      .catch(() => done());
  });

  it('should reject access when not using masterKey (/jobs)', done => {
    request(
      Object.assign({ url: Parse.serverURL + '/cloud_code/jobs' }, defaultOptions)
    ).then(done.fail, () => done());
  });

  it('should reject access when not using masterKey (/jobs/data)', done => {
    request(
      Object.assign({ url: Parse.serverURL + '/cloud_code/jobs/data' }, defaultOptions)
    ).then(done.fail, () => done());
  });

  it('should reject access when not using masterKey (PUT /jobs/id)', done => {
    request(
      Object.assign(
        { method: 'PUT', url: Parse.serverURL + '/cloud_code/jobs/jobId' },
        defaultOptions
      )
    ).then(done.fail, () => done());
  });

  it('should reject access when not using masterKey (DELETE /jobs/id)', done => {
    request(
      Object.assign(
        { method: 'DELETE', url: Parse.serverURL + '/cloud_code/jobs/jobId' },
        defaultOptions
      )
    ).then(done.fail, () => done());
  });

  it('should allow access when using masterKey (GET /jobs)', done => {
    request(Object.assign({ url: Parse.serverURL + '/cloud_code/jobs' }, masterKeyOptions)).then(
      done,
      done.fail
    );
  });

  it('should create a job schedule', done => {
    Parse.Cloud.job('job', () => {});
    const options = Object.assign({}, masterKeyOptions, {
      method: 'POST',
      url: Parse.serverURL + '/cloud_code/jobs',
      body: {
        job_schedule: {
          jobName: 'job',
        },
      },
    });
    request(options)
      .then(res => {
        expect(res.data.objectId).not.toBeUndefined();
      })
      .then(() => {
        return request(
          Object.assign({ url: Parse.serverURL + '/cloud_code/jobs' }, masterKeyOptions)
        );
      })
      .then(res => {
        expect(res.data.length).toBe(1);
      })
      .then(done)
      .catch(done.fail);
  });

  it('should fail creating a job with an invalid name', done => {
    const options = Object.assign({}, masterKeyOptions, {
      url: Parse.serverURL + '/cloud_code/jobs',
      method: 'POST',
      body: {
        job_schedule: {
          jobName: 'job',
        },
      },
    });
    request(options)
      .then(done.fail)
      .catch(() => done());
  });

  it('should update a job', done => {
    Parse.Cloud.job('job1', () => {});
    Parse.Cloud.job('job2', () => {});
    const options = Object.assign({}, masterKeyOptions, {
      method: 'POST',
      url: Parse.serverURL + '/cloud_code/jobs',
      body: {
        job_schedule: {
          jobName: 'job1',
        },
      },
    });
    request(options)
      .then(res => {
        expect(res.data.objectId).not.toBeUndefined();
        return request(
          Object.assign(options, {
            url: Parse.serverURL + '/cloud_code/jobs/' + res.data.objectId,
            method: 'PUT',
            body: {
              job_schedule: {
                jobName: 'job2',
              },
            },
          })
        );
      })
      .then(() => {
        return request(
          Object.assign({}, masterKeyOptions, {
            url: Parse.serverURL + '/cloud_code/jobs',
          })
        );
      })
      .then(res => {
        expect(res.data.length).toBe(1);
        expect(res.data[0].jobName).toBe('job2');
      })
      .then(done)
      .catch(done.fail);
  });

  it('should fail updating a job with an invalid name', done => {
    Parse.Cloud.job('job1', () => {});
    const options = Object.assign({}, masterKeyOptions, {
      method: 'POST',
      url: Parse.serverURL + '/cloud_code/jobs',
      body: {
        job_schedule: {
          jobName: 'job1',
        },
      },
    });
    request(options)
      .then(res => {
        expect(res.data.objectId).not.toBeUndefined();
        return request(
          Object.assign(options, {
            method: 'PUT',
            url: Parse.serverURL + '/cloud_code/jobs/' + res.data.objectId,
            body: {
              job_schedule: {
                jobName: 'job2',
              },
            },
          })
        );
      })
      .then(done.fail)
      .catch(() => done());
  });

  it('should destroy a job', done => {
    Parse.Cloud.job('job', () => {});
    const options = Object.assign({}, masterKeyOptions, {
      method: 'POST',
      url: Parse.serverURL + '/cloud_code/jobs',
      body: {
        job_schedule: {
          jobName: 'job',
        },
      },
    });
    request(options)
      .then(res => {
        expect(res.data.objectId).not.toBeUndefined();
        return request(
          Object.assign(
            {
              method: 'DELETE',
              url: Parse.serverURL + '/cloud_code/jobs/' + res.data.objectId,
            },
            masterKeyOptions
          )
        );
      })
      .then(() => {
        return request(
          Object.assign(
            {
              url: Parse.serverURL + '/cloud_code/jobs',
            },
            masterKeyOptions
          )
        );
      })
      .then(res => {
        expect(res.data.length).toBe(0);
      })
      .then(done)
      .catch(done.fail);
  });

  it('should properly return job data', done => {
    Parse.Cloud.job('job1', () => {});
    Parse.Cloud.job('job2', () => {});
    const options = Object.assign({}, masterKeyOptions, {
      method: 'POST',
      url: Parse.serverURL + '/cloud_code/jobs',
      body: {
        job_schedule: {
          jobName: 'job1',
        },
      },
    });
    request(options)
      .then(response => {
        const res = response.data;
        expect(res.objectId).not.toBeUndefined();
      })
      .then(() => {
        return request(
          Object.assign({ url: Parse.serverURL + '/cloud_code/jobs/data' }, masterKeyOptions)
        );
      })
      .then(response => {
        const res = response.data;
        expect(res.in_use).toEqual(['job1']);
        expect(res.jobs).toContain('job1');
        expect(res.jobs).toContain('job2');
        expect(res.jobs.length).toBe(2);
      })
      .then(done)
      .catch(e => done.fail(e.data));
  });
});
