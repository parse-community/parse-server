import rest from '../rest';

function transformResult(className, result, schema, { context, info }) {
  if (Array.isArray(result)) {
    return result.map((res) => transformResult(className, res, schema, { context, info }));
  }
  const { fields } = schema[className];
  if (result.objectId) {
    result.id = result.objectId;
  }
  Object.keys(result).forEach((key) => {
    if (fields[key] && fields[key].type === 'Pointer') {
      const pointer = result[key];
      result[key] = (parent, request, info) => {
        const selections = info.fieldNodes[0].selectionSet.selections.map((field) => {
          return field.name.value;
        });
        if (selections.indexOf('id') < 0 || selections.length > 0) {
          return runGet(context, info, pointer.className, pointer.objectId, schema);
        }
        return transformResult(fields[key].targetClass, pointer, schema, { context, info });
      }
    }
  });
  return Object.assign({className}, result);
}

function toGraphQLResult(className, schema, { context, info }) {
  return (restResult) => {
    const results = restResult.results;
    if (results.length == 0) {
      return [];
    }
    return transformResult(className, results, schema, { context, info });
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

// Runs a find against the rest API
export function runFind(context, info, className, args, schema, restQuery) {
  let query = {};
  if (!restQuery) {
    if (args.where) {
      query = Object.assign(query, args.where);
    }
    if (args.objectId) {
      query = Object.assign(query, { objectId: args.objectId });
    }
    query = transformQuery(query, schema);
  } else {
    query = restQuery;
  }
  const options = {};
  if (Object.prototype.hasOwnProperty.call(args, 'limit')) {
    options.limit = args.limit;
  }
  if (Object.prototype.hasOwnProperty.call(args, 'skip')) {
    options.skip = args.skip;
  }
  if (Object.prototype.hasOwnProperty.call(args, 'redirectClassNameForKey')) {
    options.redirectClassNameForKey = args.redirectClassNameForKey;
  }
  return rest.find(context.config, context.auth, className, query, options)
    .then(toGraphQLResult(className, schema, { context, info }));
}

// runs a get against the rest API
export function runGet(context, info, className, objectId, schema) {
  return rest.get(context.config, context.auth, className, objectId, {})
    .then(toGraphQLResult(className, schema, { context, info }))
    .then(results => results[0]);
}
