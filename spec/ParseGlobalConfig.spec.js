
var request = require('request');
var DatabaseAdapter = require('../DatabaseAdapter');

var database = DatabaseAdapter.getDatabaseConnection('test');

describe('a GlobalConfig', () => {
  beforeEach(function(done) {
    database.rawCollection('_GlobalConfig')
      .then(coll => coll.updateOne({ '_id': 1}, { $set: { params: { companies: ['US', 'DK'] } } }, { upsert: true }))
      .then(done());
  });

  it('can be retrieved', (done) => {
    request.get({
      url: 'http://localhost:8378/1/config',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(200);
      expect(body.params.companies).toEqual(['US', 'DK']);
      done();
    });
  });

  it('can be updated when a master key exists', (done) => {
    request.post({
      url: 'http://localhost:8378/1/config',
      json: true,
      body: { params: { companies: ['US', 'DK', 'SE'] } },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test'
      },
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(200);
      expect(body.params.companies).toEqual(['US', 'DK', 'SE']);
      done();
    });
  });

  it('fail to update if master key is missing', (done) => {
    request.post({
      url: 'http://localhost:8378/1/config',
      json: true,
      body: { params: { companies: [] } },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      },
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(401);
      expect(body.error).toEqual('unauthorized');
      done();
    });
  });  

});
