const PushRouter = require('../lib/Routers/PushRouter').PushRouter;
const request = require('../lib/request');

describe('PushRouter', () => {
  it('can get query condition when channels is set', done => {
    // Make mock request
    const request = {
      body: {
        channels: ['Giants', 'Mets'],
      },
    };

    const where = PushRouter.getQueryCondition(request);
    expect(where).toEqual({
      channels: {
        $in: ['Giants', 'Mets'],
      },
    });
    done();
  });

  it('can get query condition when where is set', done => {
    // Make mock request
    const request = {
      body: {
        where: {
          injuryReports: true,
        },
      },
    };

    const where = PushRouter.getQueryCondition(request);
    expect(where).toEqual({
      injuryReports: true,
    });
    done();
  });

  it('can get query condition when nothing is set', done => {
    // Make mock request
    const request = {
      body: {},
    };

    expect(function () {
      PushRouter.getQueryCondition(request);
    }).toThrow();
    done();
  });

  it('can throw on getQueryCondition when channels and where are set', done => {
    // Make mock request
    const request = {
      body: {
        channels: {
          $in: ['Giants', 'Mets'],
        },
        where: {
          injuryReports: true,
        },
      },
    };

    expect(function () {
      PushRouter.getQueryCondition(request);
    }).toThrow();
    done();
  });

  it('sends a push through REST', done => {
    request({
      method: 'POST',
      url: Parse.serverURL + '/push',
      body: {
        channels: {
          $in: ['Giants', 'Mets'],
        },
      },
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'Content-Type': 'application/json',
      },
    }).then(res => {
      expect(res.headers['x-parse-push-status-id']).not.toBe(undefined);
      expect(res.headers['x-parse-push-status-id'].length).toBe(10);
      expect(res.data.result).toBe(true);
      done();
    });
  });
});
