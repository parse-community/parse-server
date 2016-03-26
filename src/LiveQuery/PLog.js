import log from 'npmlog';

let logger = log.newGroup('parse-live-query-server');

function verbose(): void {
  logger.verbose('parse-live-query-server', ...arguments)
}

function info(): void {
  logger.info('parse-live-query-server', ...arguments);
}

function error(): void {
  logger.error('parse-live-query-server', ...arguments);
}

let PLog = {
  log: info,
  info: info,
  error: error,
  verbose: verbose,
  logger: logger
};

module.exports = PLog;
