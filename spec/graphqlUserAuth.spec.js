const GraphQLParseSchema = require('../lib/graphql/Schema').GraphQLParseSchema;
const Config = require('../lib/Config');
const Auth = require('../lib/Auth').Auth;
const { graphql }  = require('graphql');


describe('graphQL UserAuth', () => {
  let schema;
  let root;
  let config;
  async function reload() {
    const Schema = new GraphQLParseSchema('test');
    const result = await Schema.load();
    schema = result.schema;
    root = result.root;
  }

  beforeEach(async () => {
    config = Config.get('test');
    await reload();
  });

  it('can login with username', async () => {
    const user = new Parse.User();
    await user.save({
      username: 'luke_skywalker',
      email: 'luke@therebellion',
      password: 'strong the force is with me'
    });
    const context = {
      config,
      auth: new Auth({config})
    }
    const input = {
      username: 'luke_skywalker',
      password: 'strong the force is with me'
    }
    const result = await graphql(schema, `
      mutation logUserIn($input: LoginInput) {
        login(input: $input) {
          username
          sessionToken
        }
      }
      `, root, context, { input });
    expect(result.data.login.username).toBe('luke_skywalker');
    expect(result.data.login.sessionToken).toBeDefined();
  });

  it('can login with email', async () => {
    const user = new Parse.User();
    await user.save({
      username: 'luke_skywalker',
      email: 'luke@therebellion',
      password: 'strong the force is with me'
    });
    const context = {
      config,
      auth: new Auth({config}),
      info: {
        installationId: 'my-installation-id'
      }
    }
    const input = {
      email: 'luke@therebellion',
      password: 'strong the force is with me'
    }
    const result = await graphql(schema, `
      mutation logUserIn($input: LoginInput) {
        login(input: $input) {
          username
          sessionToken
        }
      }
      `, root, context, { input });
    expect(result.data.login.username).toBe('luke_skywalker');
    expect(result.data.login.sessionToken).toBeDefined();
    const sessions = await new Parse.Query(Parse.Session)
      .equalTo('sessionToken', result.data.login.sessionToken)
      .find({ useMasterKey: true });
    expect(sessions.length).toBe(1);
    expect(sessions[0].get('installationId')).toBe('my-installation-id');
  });

  it('can logout', async () => {
    const user = new Parse.User();
    await user.save({
      username: 'luke_skywalker',
      email: 'luke@therebellion',
      password: 'strong the force is with me'
    });
    const loggedInUser = await Parse.User.logIn('luke_skywalker', 'strong the force is with me');
    const sessionToken = loggedInUser.getSessionToken();
    let sessions = await new Parse.Query(Parse.Session).find({ useMasterKey: true });
    expect(sessions.length).toBe(1);
    expect(sessionToken).toBeDefined();
    const context = {
      config,
      auth: new Auth({config, user: loggedInUser}),
      info: {
        sessionToken
      }
    };
    const result = await graphql(schema, `
      mutation logMeOut {
        logout
      }
      `, root, context);
    expect(result.data.logout).toBeTruthy();
    sessions = await new Parse.Query(Parse.Session).find({ useMasterKey: true });
    expect(sessions.length).toBe(0);
  });

  it('can get currentUser when logged in', async () => {
    const user = new Parse.User();
    await user.save({
      username: 'luke_skywalker',
      email: 'luke@therebellion',
      password: 'strong the force is with me'
    });
    const loggedInUser = await Parse.User.logIn('luke_skywalker', 'strong the force is with me');
    const sessionToken = loggedInUser.getSessionToken();
    const context = {
      config,
      auth: new Auth({config, user: loggedInUser}),
      info: {
        sessionToken
      }
    };
    const result = await graphql(schema, `
    query me {
      currentUser {
        username
        password
        email
      }
    }
    `, root, context);
    expect(result.data.currentUser.username).toBe('luke_skywalker');
    expect(result.data.currentUser.password).toBe(null);
    expect(result.data.currentUser.email).toBe('luke@therebellion')
  });

  it('fails to get the currentUser when logged out', async () => {
    const context = {
      config,
      auth: new Auth({ config }),
    };
    const result = await graphql(schema, `
    query me {
      currentUser {
        username
        password
        email
      }
    }
    `, root, context);
    expect(result.data.currentUser).toBe(null);
    expect(result.errors).not.toBeUndefined();
    expect(result.errors[0].message).toBe('You need to be logged in.');
  });
});
