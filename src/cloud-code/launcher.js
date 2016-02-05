// ignore code coverage here as it's just a process spanner
// and it gets in the way of the coverage
// And even if it fires, it doesn't get triggered as 
// it is a subprocess

/* istanbul ignore next */
module.exports = function(options) {
  var forever = require('forever-monitor');

  var foreverOptions = Object.assign({
    max: 9999,
    silent: false
  }, options.forever)
 
  foreverOptions.env = process.env;
  foreverOptions.args = [JSON.stringify(options)];
  
  var cloudCode = new (forever.Monitor)(__dirname + '/index.js', foreverOptions);

  // Kill subprocess on kill
  process.on('exit', () => {
    cloudCode.stop();
    // Force killin!
    cloudCode.child.kill('SIGHUP');
  });
  
  cloudCode.start();
}