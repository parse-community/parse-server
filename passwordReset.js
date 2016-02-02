var passwordCrypto = require('./password');
var rack = require('hat').rack();


function passwordReset (appName, appId) {
  var DatabaseAdapter = require('./DatabaseAdapter');
  var database = DatabaseAdapter.getDatabaseConnection(appId);

  return function (req, res) {
    var mount = req.protocol + '://' + req.get('host') + req.baseUrl;

    Promise.resolve()
      .then(()=> {
        var error = null;
        var password = req.body.password;
        var passwordConfirm = req.body.passwordConfirm;
        var username = req.body.username;
        var token = req.body.token;
        if (req.method !== 'POST') {
          return Promise.resolve()
        }
        if (!password) {
          error = "Password cannot be empty";
        } else if (!passwordConfirm) {
          error = "Password confirm cannot be empty";
        } else if (password !== passwordConfirm) {
          error = "Passwords do not match"
        } else if (!username) {
          error = "Username invalid: this is an invalid url";
        } else if (!token) {
          error = "Invalid token: this is an invalid url";
        }
        if (error) {
          return Promise.resolve(error);
        }

        return database.find('_User', {username: username})
          .then((results) => {
            if (!results.length) {
              throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND,
                'Invalid username');
            }
            var user = results[0];

            if (user.perishableSessionToken !== token) {
              return Promise.resolve("Invalid token: this is an invalid url")
            } else {
              return passwordCrypto.hash(password)
                .then((hashedPassword)=> {
                  return database.update("_User", {email: username}, {_hashed_password: hashedPassword, _perishable_token: rack()}, {acl: [user.objectId]})
                })
                .then(()=> {
                  res.redirect(mount + '/password_reset_success?username=' + username);
                  return Promise.resolve(true)
                })
            }
          })

      })
      .then((error)=> {
        if (error === true) {
          return;
        }
        var token = req.query.token;
        var username = req.query.username;
        if (req.body.token && req.body.username) {
          token = req.body.token;
          username = req.body.username;
        }
        var actionUrl = mount + '/request_password_reset?token=' + encodeURIComponent(token) + "&username=" + encodeURIComponent(username);
        if (!token || !username) {
          return res.status(404).render('not-found')
        }
        res.render('password-reset', {
          name: appName,
          token: req.query.token,
          username: req.query.username,
          action: actionUrl,
          error: error
        })
      })
      .catch(()=>{
        res.status(404).render('not-found')
      })
  }
}

function success (req, res) {
  return res.render("reset-success", {email: req.query.username});
}


module.exports = {
  reset: passwordReset,
  success: success
}