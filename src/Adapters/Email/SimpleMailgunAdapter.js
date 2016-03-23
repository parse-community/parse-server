import Mailgun from 'mailgun-js';

let SimpleMailgunAdapter = mailgunOptions => {
	if (!mailgunOptions || !mailgunOptions.apiKey || !mailgunOptions.domain || !mailgunOptions.fromAddress) {
		throw 'SimpleMailgunAdapter requires an API Key, domain, and fromAddress.';
	}
	let mailgun = Mailgun(mailgunOptions);

	let sendMail = ({to, subject, text}) => {
		let data = {
			from: mailgunOptions.fromAddress,
			to: to,
			subject: subject,
			text: text,
		}

		return new Promise((resolve, reject) => {
			mailgun.messages().send(data, (err, body) => {
				if (typeof err !== 'undefined') {
					reject(err);
				}
				resolve(body);
			});
		});
	}

	return Object.freeze({
    sendMail: sendMail
	});
}

module.exports = SimpleMailgunAdapter
