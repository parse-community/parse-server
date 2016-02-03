// Mail Adapter
//
// Allows you to send email using a third party API such as Mailgun.
// 
// To send messages: 
//   var service = MailAdapter.getMailService(appId);
//   if(service !== null) service.sendMail('user@domain.com', 'Hello User!', 'Thanks for signing up!');
//
// Each adapter requires:-
// * validateConfig(config) -> returns a set of configuration values for each service. Different services have different config requirements
// * sendMail(to, subject, text) -> sends a message using the configured service

var MailgunAdapter = require('./MailgunAdapter');

var adapter = MailgunAdapter;
var mailConfigs = {};
var mailServices = {};

function setMailServiceConfig(appId, mailApiConfig) {

  // Perform a type check on mailApiConfig to ensure it's a dictionary/object
  if(typeof mailApiConfig === 'object') {

    // Ensure mailApiConfig has a least a service defined, not not — default to mailgun
    if(typeof mailApiConfig.service === 'undefined' || mailApiConfig.service === '') {
      console.error('Error: You need to define a `service` when configuring `mailConfig` in ParseServer.');
      mailApiConfig.service = 'mailgun'; // use mailgun as the default adapter
    }

    // Set the mail service as configured
    if(mailApiConfig.service === '' || mailApiConfig.service === 'mailgun') {
      adapter = MailgunAdapter;
      mailApiConfig = MailgunAdapter.validateConfig(mailApiConfig);
    } else {
      // Handle other mail adapters here... (such as mandrill, postmark, etc
    }

  } else {
    // Unexpected type, should be an object/dictionary.
    console.log('Error: Unexpected `mailApiConfig` in MailAdapter.');
    mailApiConfig = MailgunAdapter.validateConfig({}); // Just get some empty values
    return false;
  }

  mailConfigs[appId] = mailApiConfig;
  return true;
}

function clearMailService(appId) {
  delete mailConfigs[appId];
  delete mailServices[appId];
}

function getMailService(appId) {
  if (mailServices[appId]) {
    return mailServices[appId];
  }

  if(mailConfigs[appId] != null) {
    mailServices[appId] = new adapter(appId, mailConfigs[appId]);
    return mailServices[appId];
  } else {
    return null;
  }
}

module.exports = {
  mailConfigs: mailConfigs,
  mailServices: mailServices,
  setMailServiceConfig: setMailServiceConfig,
  getMailService: getMailService,
  clearMailService: clearMailService
};
