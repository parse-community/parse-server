import rest from '../rest';
export { rest };

export function getGloballyUniqueId(className, objectId) {
  return new Buffer(`${className}::${objectId}`).toString('base64');
}

export function transformResult(className, result) {
  if (Array.isArray(result)) {
    return result.map((res) => transformResult(className, res));
  }
  if (result.objectId) {
    // Make a unique identifier for relay
    result.id = getGloballyUniqueId(className, result.objectId)
  }
  return Object.assign({className}, result);
}

function toGraphQLResult(className) {
  return (restResult) => {
    const results = restResult.results;
    if (results.length == 0) {
      return [];
    }
    return transformResult(className, results);
  }
}

function transform(constraintKey, currentValue) {
  let value = currentValue;
  if (constraintKey === 'nearSphere') {
    value = {
      latitude: currentValue.point.latitude,
      longitude: currentValue.point.longitude,
    }
  }
  const key = `$${constraintKey}`;

  return {
    key,
    value,
  }
}

function transformQuery(query) {
  Object.keys(query).forEach((key) => {
    Object.keys(query[key]).forEach((constraintKey) => {
      const constraint = query[key][constraintKey];
      delete query[key][constraintKey];
      const result = transform(constraintKey, constraint);
      query[key][result.key] = result.value;
    });
  });
  return query;
}

export function base64(string) {
  return new Buffer(string).toString('base64')
}

export function parseID(base64String) {
  // Get the selections
  const components = new Buffer(base64String, 'base64').toString('utf8').split('::');
  if (components.length != 2) {
    throw new Error('Invalid ID');
  }
  return {
    className: components[0],
    objectId: components[1]
  }
}

export function connectionResultsArray(results, args, defaultPageSize) {
  const pageSize = args.first || args.last || defaultPageSize;
  return {
    nodes: () => results,
    edges: () => results.map((node) => {
      return {
        cursor: base64(node.createdAt),
        node
      };
    }),
    pageInfo: () => {
      const hasPreviousPage = () => {
        if (args.last) {
          return results.length === pageSize;
        }
        if (args.after) {
          return true;
        }
        return false;
      };
      const hasNextPage = () => {
        if (args.first) {
          return results.length === pageSize;
        }
        if (args.before) {
          return true;
        }
        return false;
      };
      return {
        hasNextPage,
        hasPreviousPage,
      }
    }
  };
}

function parseArguments(args) {
  const query = {};
  const options = {};
  if (Object.prototype.hasOwnProperty.call(args, 'first')) {
    options.limit = args.first;
    options.order = 'createdAt';
  }
  if (Object.prototype.hasOwnProperty.call(args, 'last')) {
    options.limit = args.last;
    options.order = '-createdAt';
  }
  if (Object.prototype.hasOwnProperty.call(args, 'after')) {
    query.createdAt = { '$gt': new Date(new Buffer(args.after, 'base64').toString('utf8')) }
  }
  if (Object.prototype.hasOwnProperty.call(args, 'before')) {
    query.createdAt = { '$lt': new Date(new Buffer(args.after, 'base64').toString('utf8')) }
  }
  if (Object.prototype.hasOwnProperty.call(args, 'redirectClassNameForKey')) {
    options.redirectClassNameForKey = args.redirectClassNameForKey;
  }
  return { options, queryAdditions: query };
}

// Runs a find against the rest API
export function runFind(context, info, className, args, schema, restQuery) {
  const query = {};
  if (args.where) {
    Object.assign(query, args.where);
  }
  if (args.objectId) {
    Object.assign(query, { objectId: args.objectId });
  }
  transformQuery(query, schema);
  if (restQuery)  {
    Object.assign(query, restQuery);
  }

  const { options, queryAdditions } = parseArguments(args);
  Object.assign(query, queryAdditions);

  return rest.find(context.config, context.auth, className, query, options)
    .then(toGraphQLResult(className));
}

// runs a get against the rest API
export function runGet(context, info, className, objectId) {
  return rest.get(context.config, context.auth, className, objectId, {})
    .then(toGraphQLResult(className))
    .then(results => results[0]);
}
