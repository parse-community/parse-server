import ClassesRouter from './ClassesRouter';
import * as middleware from '../middlewares';
import Parse         from 'parse/node';

const ALLOWED_KEYS = [
  'where',
  'distinct',
  'project',
  'match',
  'redact',
  'limit',
  'skip',
  'unwind',
  'group',
  'sample',
  'sort',
  'geoNear',
  'lookup',
  'out',
  'indexStats',
  'facet',
  'bucket',
  'bucketAuto',
  'sortByCount',
  'addFields',
  'replaceRoot',
  'count',
  'graphLookup',
];

export class AggregateRouter extends ClassesRouter {

  handleFind(req) {
    const body = Object.assign(req.body, ClassesRouter.JSONFromQuery(req.query));
    const options = {};
    const pipeline = [];

    for (const key in body) {
      if (ALLOWED_KEYS.indexOf(key) === -1) {
        throw new Parse.Error(Parse.Error.INVALID_QUERY, `Invalid parameter for query: ${key}`);
      }
      if (key === 'group') {
        if (body[key].hasOwnProperty('_id')) {
          throw new Parse.Error(
            Parse.Error.INVALID_QUERY,
            `Invalid parameter for query: group. Please use objectId instead of _id`
          );
        }
        if (!body[key].hasOwnProperty('objectId')) {
          throw new Parse.Error(
            Parse.Error.INVALID_QUERY,
            `Invalid parameter for query: group. objectId is required`
          );
        }
        body[key]._id = body[key].objectId;
        delete body[key].objectId;
      }
      pipeline.push({ [`$${key}`]: body[key] });
    }
    if (body.distinct) {
      options.distinct = String(body.distinct);
    }
    options.pipeline = pipeline;
    return this.runFind(req, body, options).then((response) => { return { response }; });
  }

  mountRoutes() {
    this.route('GET','/aggregate/:className', middleware.promiseEnforceMasterKeyAccess, req => { return this.handleFind(req); });
  }
}

export default AggregateRouter;
