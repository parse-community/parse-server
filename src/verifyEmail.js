function verifyEmail (appId) {
  var DatabaseAdapter = require('./DatabaseAdapter');
  var database = DatabaseAdapter.getDatabaseConnection(appId);
  return function  (req, res) {
    var token = req.query.token;
    var username = req.query.username;

    Promise.resolve()
    .then(()=>{
      var error = null;
      if (!token || !username) {
        error = "Unable to verify email, check the URL and try again";
      }
      return Promise.resolve(error)
    })
    .then((error)=>{
      if (error) {
        return Promise.resolve(error);
      }
      return database.find('_User', {email: username})
      .then((results)=>{
        if (!results.length) {
          return Promise.resolve("Could not find email " + username + " check the URL and try again");
        }

        var user = results[0];
        return database.update("_User", {email: username}, {emailVerified: true}, {acl:[user.objectId]})
          .then(()=>Promise.resolve())
      })

    })
      .then((error)=>{
        res.render('email-verified', {
          email: username,
          error: error
        })
      })
    .catch(()=>{
      res.status(404).render('not-found')
    })
  }
}

module.exports = verifyEmail;
