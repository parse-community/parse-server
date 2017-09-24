import ClassesRouter from './ClassesRouter';
import rest from '../rest';
import * as middleware from '../middlewares';
import Parse         from 'parse/node';

const ALLOWED_KEYS = [
  'where',
  'distinct',
  'match',
  'project',
  'redact',
  'limit',
  'skip',
  'unwind',
  'group',
  'sample',
  'sort',
  'geoNear',
  'lookup',
  'indexStats',
  'out',
];

export class AggregateRouter extends ClassesRouter {

  handleFind(req) {
    const body = Object.assign(req.body, ClassesRouter.JSONFromQuery(req.query));
    const options = {};
    const pipeline = [];

    for (const key of Object.keys(body)) {
      if (ALLOWED_KEYS.indexOf(key) === -1) {
        throw new Parse.Error(Parse.Error.INVALID_QUERY, `Invalid parameter for query: ${key}`);
      }
      const specialKey = `$${key}`;
      // Handle $out at the last stage of pipeline
      if (key !== 'out') {
        pipeline.push({ [specialKey]: body[key] });
      }
    }
    if (body.out) {
      pipeline.push({ $out: body.out });
    }
    if (body.distinct) {
      options.distinct = String(body.distinct);
    }
    options.pipeline = pipeline;
    if (typeof body.where === 'string') {
      body.where = JSON.parse(body.where);
    }
    return rest.find(req.config, req.auth, this.className(req), body.where, options, req.info.clientSDK)
      .then((response) => { return { response }; });
  }

  mountRoutes() {
    this.route('GET','/aggregate/:className', middleware.promiseEnforceMasterKeyAccess, req => { return this.handleFind(req); });
  }
}

export default AggregateRouter;
