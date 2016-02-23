function verifyEmail(appId, serverURL) {
  var DatabaseAdapter = require('./DatabaseAdapter');
  var database = DatabaseAdapter.getDatabaseConnection(appId);
  return (req, res) => {
    var token = req.query.token;
    var username = req.query.username;
    if (!token || !username) {
      res.redirect(302, serverURL + '/invalid_link.html');
      return;
    }
    database.collection('_User').then(coll => {
      // Need direct database access because verification token is not a parse field
      coll.findAndModify({
        username: username,
        _email_verify_token: token,
      }, null, {$set: {emailVerified: true}}, (err, doc) => {
        if (err || !doc.value) {
          res.redirect(302, serverURL + '/invalid_link.html');
        } else {
          res.redirect(302, serverURL + '/verify_email_success.html?username=' + username);
        }
      });
    });
  }
}

module.exports = verifyEmail;
