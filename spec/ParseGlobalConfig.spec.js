'use strict';

const request = require('../lib/request');
const Config = require('../lib/Config');

describe('a GlobalConfig', () => {
  beforeEach(done => {
    const config = Config.get('test');
    const query = on_db(
      'mongo',
      () => {
        // Legacy is with an int...
        return { objectId: 1 };
      },
      () => {
        return { objectId: '1' };
      }
    );
    config.database.adapter
      .upsertOneObject(
        '_GlobalConfig',
        {
          fields: {
            objectId: { type: 'Number' },
            params: { type: 'Object' },
            masterKeyOnly: { type: 'Object' },
          },
        },
        query,
        {
          params: { companies: ['US', 'DK'], internalParam: 'internal' },
          masterKeyOnly: { internalParam: true },
        }
      )
      .then(done, err => {
        jfail(err);
        done();
      });
  });

  const headers = {
    'Content-Type': 'application/json',
    'X-Parse-Application-Id': 'test',
    'X-Parse-Master-Key': 'test',
  };

  it('can be retrieved', done => {
    request({
      url: 'http://localhost:8378/1/config',
      json: true,
      headers,
    }).then(response => {
      const body = response.data;
      try {
        expect(response.status).toEqual(200);
        expect(body.params.companies).toEqual(['US', 'DK']);
      } catch (e) {
        jfail(e);
      }
      done();
    });
  });

  it('internal parameter can be retrieved with master key', done => {
    request({
      url: 'http://localhost:8378/1/config',
      json: true,
      headers,
    }).then(response => {
      const body = response.data;
      try {
        expect(response.status).toEqual(200);
        expect(body.params.internalParam).toEqual('internal');
      } catch (e) {
        jfail(e);
      }
      done();
    });
  });

  it('internal parameter cannot be retrieved without master key', done => {
    request({
      url: 'http://localhost:8378/1/config',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
    }).then(response => {
      const body = response.data;
      try {
        expect(response.status).toEqual(200);
        expect(body.params.internalParam).toBeUndefined();
      } catch (e) {
        jfail(e);
      }
      done();
    });
  });

  it('can be updated when a master key exists', done => {
    request({
      method: 'PUT',
      url: 'http://localhost:8378/1/config',
      json: true,
      body: { params: { companies: ['US', 'DK', 'SE'] } },
      headers,
    }).then(response => {
      const body = response.data;
      expect(response.status).toEqual(200);
      expect(body.result).toEqual(true);
      done();
    });
  });

  it('can add and retrive files', done => {
    request({
      method: 'PUT',
      url: 'http://localhost:8378/1/config',
      json: true,
      body: {
        params: { file: { __type: 'File', name: 'name', url: 'http://url' } },
      },
      headers,
    }).then(response => {
      const body = response.data;
      expect(response.status).toEqual(200);
      expect(body.result).toEqual(true);
      Parse.Config.get().then(res => {
        const file = res.get('file');
        expect(file.name()).toBe('name');
        expect(file.url()).toBe('http://url');
        done();
      });
    });
  });

  it('can add and retrive Geopoints', done => {
    const geopoint = new Parse.GeoPoint(10, -20);
    request({
      method: 'PUT',
      url: 'http://localhost:8378/1/config',
      json: true,
      body: { params: { point: geopoint.toJSON() } },
      headers,
    }).then(response => {
      const body = response.data;
      expect(response.status).toEqual(200);
      expect(body.result).toEqual(true);
      Parse.Config.get().then(res => {
        const point = res.get('point');
        expect(point.latitude).toBe(10);
        expect(point.longitude).toBe(-20);
        done();
      });
    });
  });

  it('properly handles delete op', done => {
    request({
      method: 'PUT',
      url: 'http://localhost:8378/1/config',
      json: true,
      body: {
        params: {
          companies: { __op: 'Delete' },
          internalParam: { __op: 'Delete' },
          foo: 'bar',
        },
      },
      headers,
    }).then(response => {
      const body = response.data;
      expect(response.status).toEqual(200);
      expect(body.result).toEqual(true);
      request({
        url: 'http://localhost:8378/1/config',
        json: true,
        headers,
      }).then(response => {
        const body = response.data;
        try {
          expect(response.status).toEqual(200);
          expect(body.params.companies).toBeUndefined();
          expect(body.params.foo).toBe('bar');
          expect(Object.keys(body.params).length).toBe(1);
        } catch (e) {
          jfail(e);
        }
        done();
      });
    });
  });

  it('fail to update if master key is missing', done => {
    request({
      method: 'PUT',
      url: 'http://localhost:8378/1/config',
      json: true,
      body: { params: { companies: [] } },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
    }).then(fail, response => {
      const body = response.data;
      expect(response.status).toEqual(403);
      expect(body.error).toEqual('unauthorized: master key is required');
      done();
    });
  });

  it('failed getting config when it is missing', done => {
    const config = Config.get('test');
    config.database.adapter
      .deleteObjectsByQuery(
        '_GlobalConfig',
        { fields: { params: { __type: 'String' } } },
        { objectId: '1' }
      )
      .then(() => {
        request({
          url: 'http://localhost:8378/1/config',
          json: true,
          headers,
        }).then(response => {
          const body = response.data;
          expect(response.status).toEqual(200);
          expect(body.params).toEqual({});
          done();
        });
      })
      .catch(e => {
        jfail(e);
        done();
      });
  });
});
