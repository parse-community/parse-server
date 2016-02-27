module.exports = options => {
	if (!options) {
		throw "Options were not provided"
	}
	return {
		sendVerificationEmail: () => Promise.resolve(),
    sendPasswordResetEmail: () => Promise.resolve(),
    sendMail: () => Promise.resolve()
	}
}
