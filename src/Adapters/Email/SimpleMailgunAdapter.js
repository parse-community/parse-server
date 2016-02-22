import Mailgun from 'mailgun-js';

export default (mailgunOptions) => {
	let mailgun = Mailgun(mailgunOptions);

	let sendMail = (to, subject, text) => {
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

	return {
		sendVerificationEmail: ({ link, user, appName, }) => {
			let verifyMessage =
	      "Hi,\n\n" +
	      "You are being asked to confirm the e-mail address " + user.email + " with " + appName + "\n\n" +
	      "" +
	      "Click here to confirm it:\n" + link;
			return sendMail(user.email, 'Please verify your e-mail for ' + appName, verifyMessage);
		}
	}
}
