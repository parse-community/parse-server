var request = require('request');

var headers = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Master-Key': 'test'
};


describe('SettingsRouter', () => {

  it('should set the loglevel', (done) => {
    request.post({
      headers: headers,
      json: {
        'logLevel': 'silly'
      },
      url: 'http://localhost:8378/1/settings'
    }, (err, res, body) => {
      request.get({
        url: 'http://localhost:8378/1/settings',
        headers: headers
      }, (err, res, body)=> {
        body = JSON.parse(body);
        expect(body.logLevel).toBe('silly');
        done();
      });
    });
  });

  it('should not access without masterKey', (done) => {
    request.post({
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'invalid'
      },
      json: {
        'logLevel': 'silly'
      },
      url: 'http://localhost:8378/1/settings'
    }, (err, res, body) => {
      expect(body.error).not.toBeUndefined();
      expect(body.error).toBe('unauthorized');
      request.get({
        url: 'http://localhost:8378/1/settings',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'invalid'
        }
      }, (err, res, body)=> {
        body = JSON.parse(body);
        expect(body.error).toBe('unauthorized');
        done();
      });
    });
  })

})
