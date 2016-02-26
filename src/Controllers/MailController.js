import AdaptableController from './AdaptableController';
import { MailAdapter } from '../Adapters/Email/MailAdapter';
import { randomString } from '../cryptoUtils';
import { inflate } from '../triggers';

export class MailController extends AdaptableController {
  setEmailVerificationStatus(user, status) {
    if (status == false) {
      user._email_verify_token = randomString(25);
    }
    user.emailVerified = status;
  }
  sendVerificationEmail(user, config) {
    const token = encodeURIComponent(user._email_verify_token);
    const username = encodeURIComponent(user.username);
   
    let link = `${config.verifyEmailURL}?token=${token}&username=${username}`;
    this.adapter.sendVerificationEmail({
      appName: config.appName,
      link: link,
      user: inflate('_User', user),
    });
  }
  sendMail(options) {
    this.adapter.sendMail(options);
  }
  expectedAdapterType() {
    return MailAdapter;
  }
}
