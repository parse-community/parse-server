const microsoft = require('../lib/Adapters/Auth/microsoft');

describe('Microsoft Auth', () => {
  it('should fail to validate Microsoft Graph auth with bad token', done => {
    const authData = {
      id: 'fake-id',
      mail: 'fake@mail.com',
      access_token: 'very.long.bad.token',
    };
    try {
      microsoft.validateAuthData(
        authData
      );
    } catch (error) {
      jequal(error.code, 101);
      jequal(error.message, 'Microsoft Graph auth is invalid for this user.');
      done();
    }
  });
});