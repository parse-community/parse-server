const microsoft = require('../lib/Adapters/Auth/microsoft');

describe('Microsoft Auth', () => {
  it('should fail to validate Microsoft Graph auth with bad token', done => {
    const authData = {
      id: 'fake-id',
      mail: 'fake@mail.com',
      access_token: 'very.long.bad.token',
    };
    microsoft.validateAuthData(authData).then(done.fail, err => {
      expect(err.code).toBe(101);
      expect(err.message).toBe(
        'Microsoft Graph auth is invalid for this user.'
      );
      done();
    });
  });
});
