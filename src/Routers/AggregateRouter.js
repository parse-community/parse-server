import ClassesRouter from './ClassesRouter';
import rest from '../rest';
import * as middleware from '../middlewares';
import Parse         from 'parse/node';
import UsersRouter   from './UsersRouter';

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
    if (typeof body.where === 'string') {
      body.where = JSON.parse(body.where);
    }
    return rest.find(req.config, req.auth, this.className(req), body.where, options, req.info.clientSDK).then((response) => {
      for(const result of response.results) {
        if(typeof result === 'object') {
          UsersRouter.removeHiddenProperties(result);
        }
      }
      return { response };
    });
  }

  mountRoutes() {
    this.route('GET','/aggregate/:className', middleware.promiseEnforceMasterKeyAccess, req => { return this.handleFind(req); });
  }
}

export default AggregateRouter;
