import runnerZod from './utils/runner-zod';
import { ParseServer } from '../index';
import { LiveQueryServerOptionsSchema } from '../Options/schemas/LiveQueryOptions';

runnerZod({
  schema: LiveQueryServerOptionsSchema,
  start: function (program, options, logOptions) {
    logOptions();
    ParseServer.createLiveQueryServer(undefined, options);
  },
});
