var facebook = require('./facebook');
var instagram = require("./instagram");
var linkedin = require("./linkedin");
var meetup = require("./meetup");
var google = require("./google");
var github = require("./github");
var twitter = require("./twitter");

module.exports = {
	facebook: facebook,
	github: github,
	google: google,
	instagram: instagram,
	linkedin: linkedin, 
	meetup: meetup,
	twitter: twitter,
  anonymous: {
    validateAuthData: function() {
      return Promise.resolve();
    },
    validateAppId: function() {
      return Promise.resolve();
    }
  }
}