const testFailOAuth = require('./testFailOAuth');

it('Should not call next when validateAuthData throw an error', done => {
  reconfigureServer({ auth: { testFailOAuth: testFailOAuth } }).then(() => {
    const authData = { authData: { id: 'testuser', password: 'secret' } };
    Parse.User.logInWith('testFailOAuth', authData).catch(() => {
      done();
    });
  });
});
