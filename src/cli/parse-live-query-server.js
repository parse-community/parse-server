import definitions from './definitions/parse-live-query-server';
import runner from './utils/runner';
import { ParseServer } from '../index';

runner({
  definitions,
  start: function (program, options, logOptions) {
    logOptions();
    ParseServer.createLiveQueryServer(undefined, options);
  },
});
