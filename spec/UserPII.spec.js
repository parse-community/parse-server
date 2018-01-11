'use strict';

const Parse = require('parse/node');
const request = require('request-promise');

// const Config = require('../src/Config');

const EMAIL = 'foo@bar.com';
const ZIP = '10001';
const SSN = '999-99-9999';

describe('Personally Identifiable Information', () => {
  let user;

  beforeEach(done => {
    return Parse.User.signUp('tester', 'abc')
      .then(loggedInUser => user = loggedInUser)
      .then(() => Parse.User.logIn(user.get('username'), 'abc'))
      .then(() => user
        .set('email', EMAIL)
        .set('zip', ZIP)
        .set('ssn', SSN)
        .save())
      .then(() => done());
  });

  it('should be able to get own PII via API with object', (done) => {
    const userObj = new (Parse.Object.extend(Parse.User));
    userObj.id = user.id;
    userObj.fetch().then(
      fetchedUser => {
        expect(fetchedUser.get('email')).toBe(EMAIL);
      }, e => console.error('error', e))
      .done(() => done());
  });

  it('should not be able to get PII via API with object', (done) => {
    Parse.User.logOut()
      .then(() => {
        const userObj = new (Parse.Object.extend(Parse.User));
        userObj.id = user.id;
        userObj.fetch().then(
          fetchedUser => {
            expect(fetchedUser.get('email')).toBe(undefined);
          })
          .fail(e => {
            done.fail(JSON.stringify(e));
          })
          .done(() => done());
      });
  });

  it('should be able to get PII via API with object using master key', (done) => {
    Parse.User.logOut()
      .then(() => {
        const userObj = new (Parse.Object.extend(Parse.User));
        userObj.id = user.id;
        userObj.fetch({ useMasterKey: true }).then(
          fetchedUser => {
            expect(fetchedUser.get('email')).toBe(EMAIL);
          }, e => console.error('error', e))
          .done(() => done());
      });
  });


  it('should be able to get own PII via API with Find', (done) => {
    new Parse.Query(Parse.User)
      .first()
      .then(fetchedUser => {
        expect(fetchedUser.get('email')).toBe(EMAIL);
        expect(fetchedUser.get('zip')).toBe(ZIP);
        expect(fetchedUser.get('ssn')).toBe(SSN);
        done();
      });
  });

  it('should not get PII via API with Find', (done) => {
    Parse.User.logOut()
      .then(() => new Parse.Query(Parse.User)
        .first()
        .then(fetchedUser => {
          expect(fetchedUser.get('email')).toBe(undefined);
          expect(fetchedUser.get('zip')).toBe(ZIP);
          expect(fetchedUser.get('ssn')).toBe(SSN);
          done();
        })
      );
  });

  it('should get PII via API with Find using master key', (done) => {
    Parse.User.logOut()
      .then(() => new Parse.Query(Parse.User)
        .first({ useMasterKey: true })
        .then(fetchedUser => {
          expect(fetchedUser.get('email')).toBe(EMAIL);
          expect(fetchedUser.get('zip')).toBe(ZIP);
          expect(fetchedUser.get('ssn')).toBe(SSN);
          done();
        })
      );
  });


  it('should be able to get own PII via API with Get', (done) => {
    new Parse.Query(Parse.User)
      .get(user.id)
      .then(fetchedUser => {
        expect(fetchedUser.get('email')).toBe(EMAIL);
        expect(fetchedUser.get('zip')).toBe(ZIP);
        expect(fetchedUser.get('ssn')).toBe(SSN);
        done();
      });
  });

  it('should not get PII via API with Get', (done) => {
    Parse.User.logOut()
      .then(() => new Parse.Query(Parse.User)
        .get(user.id)
        .then(fetchedUser => {
          expect(fetchedUser.get('email')).toBe(undefined);
          expect(fetchedUser.get('zip')).toBe(ZIP);
          expect(fetchedUser.get('ssn')).toBe(SSN);
          done();
        })
      );
  });

  it('should get PII via API with Get using master key', (done) => {
    Parse.User.logOut()
      .then(() => new Parse.Query(Parse.User)
        .get(user.id, { useMasterKey: true })
        .then(fetchedUser => {
          expect(fetchedUser.get('email')).toBe(EMAIL);
          expect(fetchedUser.get('zip')).toBe(ZIP);
          expect(fetchedUser.get('ssn')).toBe(SSN);
          done();
        })
      );
  });

  it('should not get PII via REST', (done) => {
    request.get({
      url: 'http://localhost:8378/1/classes/_User',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Javascript-Key': 'test'
      }
    })
      .then(
        result => {
          const fetchedUser = result.results[0];
          expect(fetchedUser.zip).toBe(ZIP);
          expect(fetchedUser.email).toBe(undefined);
        },
        e => console.error('error', e.message)
      ).done(() => done());
  });

  it('should get PII via REST with self credentials', (done) => {
    request.get({
      url: 'http://localhost:8378/1/classes/_User',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Javascript-Key': 'test',
        'X-Parse-Session-Token': user.getSessionToken()
      }
    })
      .then(
        result => {
          const fetchedUser = result.results[0];
          expect(fetchedUser.zip).toBe(ZIP);
          expect(fetchedUser.email).toBe(EMAIL);
        },
        e => console.error('error', e.message)
      ).done(() => done());
  });

  it('should get PII via REST using master key', (done) => {
    request.get({
      url: 'http://localhost:8378/1/classes/_User',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test'
      }
    })
      .then(
        result => {
          const fetchedUser = result.results[0];
          expect(fetchedUser.zip).toBe(ZIP);
          expect(fetchedUser.email).toBe(EMAIL);
        },
        e => console.error('error', e.message)
      ).done(() => done());
  });

  it('should not get PII via REST by ID', (done) => {
    request.get({
      url: `http://localhost:8378/1/classes/_User/${user.id}`,
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Javascript-Key': 'test'
      }
    })
      .then(
        result => {
          const fetchedUser = result;
          expect(fetchedUser.zip).toBe(ZIP);
          expect(fetchedUser.email).toBe(undefined);
        },
        e => console.error('error', e.message)
      ).done(() => done());
  });

  it('should get PII via REST by ID  with self credentials', (done) => {
    request.get({
      url: `http://localhost:8378/1/classes/_User/${user.id}`,
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Javascript-Key': 'test',
        'X-Parse-Session-Token': user.getSessionToken()
      }
    })
      .then(
        result => {
          const fetchedUser = result;
          expect(fetchedUser.zip).toBe(ZIP);
          expect(fetchedUser.email).toBe(EMAIL);
        },
        e => console.error('error', e.message)
      ).done(() => done());
  });

  it('should get PII via REST by ID  with master key', (done) => {
    request.get({
      url: `http://localhost:8378/1/classes/_User/${user.id}`,
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Javascript-Key': 'test',
        'X-Parse-Master-Key': 'test',
      }
    })
      .then(
        result => {
          const fetchedUser = result;
          expect(fetchedUser.zip).toBe(ZIP);
          expect(fetchedUser.email).toBe(EMAIL);
        },
        e => console.error('error', e.message)
      ).done(() => done());
  });

  describe('with configured sensitive fields', () => {
    beforeEach((done) => {
      reconfigureServer({ userSensitiveFields: ['ssn', 'zip'] })
        .then(() => done());
    });

    it('should be able to get own PII via API with object', (done) => {
      const userObj = new (Parse.Object.extend(Parse.User));
      userObj.id = user.id;
      userObj.fetch().then(
        fetchedUser => {
          expect(fetchedUser.get('email')).toBe(EMAIL);
          expect(fetchedUser.get('zip')).toBe(ZIP);
          expect(fetchedUser.get('ssn')).toBe(SSN);
          done();
        }, e => done.fail(e));
    });

    it('should not be able to get PII via API with object', (done) => {
      Parse.User.logOut()
        .then(() => {
          const userObj = new (Parse.Object.extend(Parse.User));
          userObj.id = user.id;
          userObj.fetch().then(
            fetchedUser => {
              expect(fetchedUser.get('email')).toBe(undefined);
              expect(fetchedUser.get('zip')).toBe(undefined);
              expect(fetchedUser.get('ssn')).toBe(undefined);
            }, e => console.error('error', e))
            .done(() => done());
        });
    });

    it('should be able to get PII via API with object using master key', (done) => {
      Parse.User.logOut()
        .then(() => {
          const userObj = new (Parse.Object.extend(Parse.User));
          userObj.id = user.id;
          userObj.fetch({ useMasterKey: true }).then(
            fetchedUser => {
              expect(fetchedUser.get('email')).toBe(EMAIL);
              expect(fetchedUser.get('zip')).toBe(ZIP);
              expect(fetchedUser.get('ssn')).toBe(SSN);
            }, e => console.error('error', e))
            .done(() => done());
        });
    });


    it('should be able to get own PII via API with Find', (done) => {
      new Parse.Query(Parse.User)
        .first()
        .then(fetchedUser => {
          expect(fetchedUser.get('email')).toBe(EMAIL);
          expect(fetchedUser.get('zip')).toBe(ZIP);
          expect(fetchedUser.get('ssn')).toBe(SSN);
          done();
        });
    });

    it('should not get PII via API with Find', (done) => {
      Parse.User.logOut()
        .then(() => new Parse.Query(Parse.User)
          .first()
          .then(fetchedUser => {
            expect(fetchedUser.get('email')).toBe(undefined);
            expect(fetchedUser.get('zip')).toBe(undefined);
            expect(fetchedUser.get('ssn')).toBe(undefined);
            done();
          })
        );
    });

    it('should get PII via API with Find using master key', (done) => {
      Parse.User.logOut()
        .then(() => new Parse.Query(Parse.User)
          .first({ useMasterKey: true })
          .then(fetchedUser => {
            expect(fetchedUser.get('email')).toBe(EMAIL);
            expect(fetchedUser.get('zip')).toBe(ZIP);
            expect(fetchedUser.get('ssn')).toBe(SSN);
            done();
          })
        );
    });


    it('should be able to get own PII via API with Get', (done) => {
      new Parse.Query(Parse.User)
        .get(user.id)
        .then(fetchedUser => {
          expect(fetchedUser.get('email')).toBe(EMAIL);
          expect(fetchedUser.get('zip')).toBe(ZIP);
          expect(fetchedUser.get('ssn')).toBe(SSN);
          done();
        });
    });

    it('should not get PII via API with Get', (done) => {
      Parse.User.logOut()
        .then(() => new Parse.Query(Parse.User)
          .get(user.id)
          .then(fetchedUser => {
            expect(fetchedUser.get('email')).toBe(undefined);
            expect(fetchedUser.get('zip')).toBe(undefined);
            expect(fetchedUser.get('ssn')).toBe(undefined);
            done();
          })
        );
    });

    it('should get PII via API with Get using master key', (done) => {
      Parse.User.logOut()
        .then(() => new Parse.Query(Parse.User)
          .get(user.id, { useMasterKey: true })
          .then(fetchedUser => {
            expect(fetchedUser.get('email')).toBe(EMAIL);
            expect(fetchedUser.get('zip')).toBe(ZIP);
            expect(fetchedUser.get('ssn')).toBe(SSN);
            done();
          })
        );
    });

    it('should not get PII via REST', (done) => {
      request.get({
        url: 'http://localhost:8378/1/classes/_User',
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Javascript-Key': 'test'
        }
      })
        .then(
          result => {
            const fetchedUser = result.results[0];
            expect(fetchedUser.zip).toBe(undefined);
            expect(fetchedUser.ssn).toBe(undefined);
            expect(fetchedUser.email).toBe(undefined);
          },
          e => console.error('error', e.message)
        ).done(() => done());
    });

    it('should get PII via REST with self credentials', (done) => {
      request.get({
        url: 'http://localhost:8378/1/classes/_User',
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Javascript-Key': 'test',
          'X-Parse-Session-Token': user.getSessionToken()
        }
      })
        .then(
          result => {
            const fetchedUser = result.results[0];
            expect(fetchedUser.zip).toBe(ZIP);
            expect(fetchedUser.email).toBe(EMAIL);
            expect(fetchedUser.ssn).toBe(SSN);
          },
          e => console.error('error', e.message)
        ).done(() => done());
    });

    it('should get PII via REST using master key', (done) => {
      request.get({
        url: 'http://localhost:8378/1/classes/_User',
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test'
        }
      })
        .then(
          result => {
            const fetchedUser = result.results[0];
            expect(fetchedUser.zip).toBe(ZIP);
            expect(fetchedUser.email).toBe(EMAIL);
            expect(fetchedUser.ssn).toBe(SSN);
          },
          e => console.error('error', e.message)
        ).done(() => done());
    });

    it('should not get PII via REST by ID', (done) => {
      request.get({
        url: `http://localhost:8378/1/classes/_User/${user.id}`,
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Javascript-Key': 'test'
        }
      })
        .then(
          result => {
            const fetchedUser = result;
            expect(fetchedUser.zip).toBe(undefined);
            expect(fetchedUser.email).toBe(undefined);
          },
          e => console.error('error', e.message)
        ).done(() => done());
    });

    it('should get PII via REST by ID  with self credentials', (done) => {
      request.get({
        url: `http://localhost:8378/1/classes/_User/${user.id}`,
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Javascript-Key': 'test',
          'X-Parse-Session-Token': user.getSessionToken()
        }
      })
        .then(
          result => {
            const fetchedUser = result;
            expect(fetchedUser.zip).toBe(ZIP);
            expect(fetchedUser.email).toBe(EMAIL);
          },
          e => console.error('error', e.message)
        ).done(() => done());
    });

    it('should get PII via REST by ID  with master key', (done) => {
      request.get({
        url: `http://localhost:8378/1/classes/_User/${user.id}`,
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Javascript-Key': 'test',
          'X-Parse-Master-Key': 'test',
        }
      })
        .then(
          result => {
            const fetchedUser = result;
            expect(fetchedUser.zip).toBe(ZIP);
            expect(fetchedUser.email).toBe(EMAIL);
          },
          e => console.error('error', e.message)
        ).done(() => done());
    });
  });
});
