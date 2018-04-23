/*eslint no-unused-vars: "off"*/
/*
  Mail Adapter prototype
  A MailAdapter should implement at least sendMail()
 */
export class MailAdapter {
  /*
   * A method for sending mail
   * @param options would have the parameters
   * - to: the recipient
   * - text: the raw text of the message
   * - subject: the subject of the email
   */
  sendMail(options) {}

  /* You can implement those methods if you want
   * to provide HTML templates etc...
   */
  // sendVerificationEmail({ link, appName, user }) {}
  // sendPasswordResetEmail({ link, appName, user }) {}
}

export default MailAdapter;
