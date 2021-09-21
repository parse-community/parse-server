// These methods handle the Dashboard-related routes.
import Parse from 'parse/node';
import ClassesRouter from './ClassesRouter';
import rest from '../rest';
import passwordCrypto from '../password';
import _ from 'lodash';
import { promiseEnsureIdempotency, promiseEnforceMasterKeyAccess } from '../middlewares';
import { TOTP, Secret } from 'otpauth';

export class DashboardRouter extends ClassesRouter {
  className() {
    return '_DashboardUser';
  }

  async handleDashboardCreate({ body, config, auth, client, info }) {
    const data = {
      username: body.username,
      password: body.password,
    };
    let mfaUrl;
    if (body.mfaOptions && body.mfa) {
      const mfaOptions = body.mfaOptions;
      const period = mfaOptions.period || 30;
      const digits = mfaOptions.digits || 6;
      const algorithm = mfaOptions.algorithm || 'SHA1';
      const secret = new Secret();
      const totp = new TOTP({
        issuer: config.appName,
        label: data.username,
        algorithm,
        digits,
        period,
        secret,
      });
      data.mfaOptions = {
        enabled: true,
        algorithm,
        secret: secret.base32,
      };
      mfaUrl = totp.toString();
    }
    if (body.features) {
      data.features = body.features;
    }
    if (typeof data.username !== 'string' || _.isEmpty(data.username)) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'bad or missing username');
    }
    if (typeof data.password !== 'string' || _.isEmpty(data.password)) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required');
    }
    if (data.password.length < 8) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'Invalid password.');
    }
    const hashedPassword = await passwordCrypto.hash(data.password);
    data.password = hashedPassword;

    const users = await config.database.find(
      this.className(),
      {
        username: body.username,
      },
      { limit: 1, caseInsensitive: true },
      {}
    );
    if (users.length !== 0) {
      throw new Parse.Error(
        Parse.Error.USERNAME_TAKEN,
        'Account already exists for this username.'
      );
    }
    const response = await rest.create(config, auth, this.className(), data, client, info.context);
    response.response.username = data.username;
    if (mfaUrl) {
      response.response.mfaUrl = mfaUrl;
      response.response.mfaSecret = data.mfaOptions?.secret;
    }
    return response;
  }

  async handleDashboardLogin({ body, config }) {
    const { username, password, otp } = body;
    if (!username) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'username is required.');
    }
    if (!password) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required.');
    }
    if (typeof password !== 'string' || (username && typeof username !== 'string')) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
    }
    const [user] = await config.database.find(
      this.className(),
      {
        username: body.username,
      },
      { limit: 1, caseInsensitive: true },
      {}
    );
    if (!user) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
    }

    const matchPassword = await passwordCrypto.compare(password, user.password);
    if (!matchPassword) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
    }

    if (user.mfaOptions?.enabled) {
      if (!otp) {
        throw new Parse.Error(
          Parse.Error.MFA_TOKEN_REQUIRED,
          'Please specify a One Time password.'
        );
      }
      const totp = new TOTP({
        algorithm: user.mfaOptions?.algorithm || 'SHA1',
        secret: Secret.fromBase32(user.mfaOptions.secret),
      });
      const valid = totp.validate({
        token: otp,
      });
      if (valid === null) {
        throw new Parse.Error(Parse.Error.MFA_ERROR, 'Invalid One Time Password.');
      }
    }

    delete user.password;
    delete user.mfaOptions;

    return { response: user };
  }

  mountRoutes() {
    this.route(
      'POST',
      '/dashboardLogin',
      promiseEnsureIdempotency,
      promiseEnforceMasterKeyAccess,
      req => this.handleDashboardLogin(req)
    );
    this.route(
      'POST',
      '/dashboardSignup',
      promiseEnsureIdempotency,
      promiseEnforceMasterKeyAccess,
      req => this.handleDashboardCreate(req)
    );
  }
}

export default DashboardRouter;
