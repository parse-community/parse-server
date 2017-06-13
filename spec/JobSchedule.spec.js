
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
});
