var MailAdapter = require('./MailAdapter');
// options can contain:
function MailgunAdapter(appId, mailApiConfig) {
  this.appId = appId;
  this.apiConfig = mailApiConfig;
  MailAdapter.call(this);
}

MailgunAdapter.prototype = Object.create(MailAdapter);

// Connects to the database. Returns a promise that resolves when the
// connection is successful.
// this.db will be populated with a Mongo "Db" object when the
// promise resolves successfully.
MailgunAdapter.sendMail = function(to, subject, text, html) {

  var mailgun = require('mailgun-js')({apiKey: this.apiConfig.apiKey, domain: this.apiConfig.domain});

  var data = {
    from: this.apiConfig.fromAddress,
    to: to,
    subject: subject,
    text: text,
    html: html
  };

  return new Promise((resolve, reject) => {
    mailgun.messages().send(data, (err, body) => {
      if (typeof err !== 'undefined') {
        // console.log("Mailgun Error", err);
        return reject(err);
      }
      // console.log(body);
      resolve(body);
    });
  });
};

MailgunAdapter.validateConfig = function(config) {
  var cfg = {apiKey:'', domain:'', fromAddress:''};
  var helperMessage = "When creating an instance of ParseServer, you should have a mailConfig section like this: mailConfig: { service:'mailgun', apiKey:'MAILGUN_KEY_HERE', domain:'MAILGUN_DOMAIN_HERE', fromAddress:'MAILGUN_FROM_ADDRESS_HERE' }";
  if(typeof config.apiKey === 'undefined' || config.apiKey === '') {
    console.error('Error: You need to define a MailGun `apiKey` when configuring ParseServer. ' + helperMessage);
  } else {
    cfg.apiKey = config.apiKey;
  }
  if(typeof config.domain === 'undefined' || config.domain === '') {
    console.error('Error: You need to define a MailGun `domain` when configuring ParseServer. ' + helperMessage);
  } else {
    cfg.domain = config.domain;
  }
  if(typeof config.fromAddress === 'undefined' || config.fromAddress === '') {
    console.error('Error: You need to define a MailGun `fromAddress` when configuring ParseServer. ' + helperMessage);
  } else {
    cfg.fromAddress = config.fromAddress;
  }
  return cfg;
};

module.exports = MailgunAdapter;
