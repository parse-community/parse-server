var defaultResetEmail =
      "Hi,\n\n" +
      "You requested a password reset.\n\n" +
      "" +
      "Click here to reset it:\n" +
      "<%LINK_GOES_HERE%>";

var defaultVerify =
      "Hi,\n\n" +
      "You are being asked to confirm the e-mail address <%EMAIL_GOES_HERE%>\n\n" +
      "" +
      "Click here to confirm it:\n" +
      "<%LINK_GOES_HERE%>";


function MailAdapter() {
}

MailAdapter.prototype.sendMail = function(to, subject, text) {
  throw new Error("Send mail must be overridden")
};

MailAdapter.prototype.getResetPasswordEmail = function(to, resetLink) {
  return {
    subject: 'Password Reset Request',
    text: defaultResetEmail.replace("<%LINK_GOES_HERE%>", resetLink)
  }
};

MailAdapter.prototype.getVerificationEmail = function(to, verifyLink) {
  return {
    subject: 'Please verify your e-mail',
    text: defaultVerify.replace("<%EMAIL_GOES_HERE%>", to).replace("<%LINK_GOES_HERE%>", verifyLink)
  }
};


module.exports = MailAdapter;
